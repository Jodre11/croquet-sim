# Croquet Shot Lab — Design

**Date:** 2026-09-30
**Status:** Reviewed (spec-review panel: subtraction, completeness). Amended 2026-10-01 for P2a: simulated
lift, 3D contacts and impulsive turf friction (§5), push friction with stick and slip (§5), jump flag (§5).
**Repo:** `croquet-sim`

## 1. Purpose

A browser-based **shot lab** for croquet players. A player places balls on a lawn, sets up a single stroke
precisely, and sees a physically faithful prediction of where every ball ends up. It is a planning and
training tool, not a game: accuracy of outcome matters more than the feel of swinging.

### Audience and constraints

- Primary users are serious club players and coaches, many older and not confident with computers.
- Access must be "click this link": no install, no account, no server-side state.
- Tablets (notably older iPads) are first-class and touch-first with large targets. Desktop with a mouse is
  fully supported. Phones are supported but secondary (usable, not optimised).
- Browser floor (provisional, confirm in planning): Safari / iPadOS 16+, and the last two major versions
  of Chrome, Edge and Firefox.
- Language in the UI is croquet language ("stop shot ↔ roll", "check ↔ push through"), never physics
  jargon. Advanced parameters are tucked away.

### Success criteria

All numeric thresholds are **provisional**; the implementation plan confirms or revises them once the
reference data (§11) is sourced.

1. Standard strokes (single-ball, stop, drive, half-roll, full roll, pass-roll) reproduce sourced coaching
   distance ratios within **±15 %** under the default profile.
2. Pull (narrowing of the split on wide rolls) emerges from the physics without being special-cased.
3. A player can calibrate a personal stroke profile from a handful of tape-measured straight strokes.
4. A shot simulates in **≤ 200 ms** on the reference low-end tablet (2020-era entry-level iPad); initial
   download **≤ 250 KB** gzipped.
5. A shared link reproduces the same shot on any supported browser: rest positions agree within **1 mm**
   for the same engine version (see §5 Determinism).

## 2. Scope

### In v1

- Single-ball strokes (including roquets and rushes), and croquet strokes across the stop-shot → pass-roll
  range, including split shots.
- Rebounds off hoop uprights and the peg; out-of-court detection; hoop-running detection.
- Per-player stroke profiles with calibration.
- Forward simulation only: the player chooses the stroke, the tool shows the outcome.
- Top-down view only.
- Shareable links for setups and profiles.

### Deferred — design constraints v1 must honour

| Deferred item | How v1 keeps it open |
|---|---|
| Jump shots, half-jumps | Ball state is fully 3D; small lift is simulated and jumps beyond the validated range are flagged (§5 Jump flag) |
| Hampered / glancing strokes | Contact is described generically (face orientation, contact point, head state) |
| Cannons (three balls in contact) | Impact phase handles N bodies in contact; free-motion resting contact (§5) already solves any number of balls and obstacles in contact |
| Detailed hoop-wire contact on angled runs | Hoop contact model is isolated and replaceable |
| Hoop stiffness (loose hoops), per-hoop width tolerance | Each hoop is its own object with its own `width` (v1: rigid, standard width) |
| Lawn surface variability (sparse / discoloured patches) | Engine queries `lawn.surfaceAt(position)`; v1 returns a uniform value |
| Slopes, grain, wet lawns | Same surface query; slope would add a gravity term to free motion |
| Inverse solving ("put the balls here — what stroke?") | Reuses the calibration optimiser |
| Motion-based stroke input | A new front end onto the same swing model |
| 3D replay | Renderer consumes only `ShotResult`, which is already 3D |

### Later (no v1 constraint)

Full game (turn planning, rules, opponents); split-shot / pull calibration from measurements next season;
in-app "this doesn't match my experience" feedback; offline support.

## 3. Architecture

All TypeScript, built with Vite. Five units with one-way data flow:

```
Planner (UI) ──ShotSetup──▶ Swing model ──ContactState──▶ Physics engine ──ShotResult──▶ Renderer
                                  ▲                               ▲
                                  └───────── Calibration ─────────┘
```

| Unit | Responsibility | Depends on |
|---|---|---|
| **Physics engine** | `ContactState + world → ShotResult` (full time-parameterised trajectories + events). Pure, deterministic, no DOM/graphics. | nothing |
| **Swing model** | Maps body/equipment description to the mallet-head state during contact. Pure. | nothing |
| **Calibration** | Fits a player's free parameters to measured distances by repeated simulation. Pure. | swing model, engine |
| **Planner** | Ball placement, stroke and lawn controls, result display, compare overlay, sharing. | all of the above |
| **Renderer** | Animates a `ShotResult` top-down in Canvas 2D. Never participates in physics. | `ShotResult` only |

The engine and swing model are the portability boundary: if performance proves inadequate they can be
ported to Rust → WASM without touching the UI (decision recorded: start in TypeScript, switch only on
measured need).

UI framework: **Svelte** (small runtime, small bundles, suits low-end tablets).

### ShotSetup

The single input to a simulation, and the payload of a share link:

- **Balls:** four identified balls (blue, red, black, yellow), each placed or absent; which ball is the
  striker's ball; for a croquet stroke, which ball is croqueted.
- **Stroke:** stroke-type preset plus the per-shot inputs of §4.
- **Target hoop:** optional; the hoop and running direction the striker's ball is attempting (§5).
- **Lawn:** lawn speed (defaults to the active profile's home-lawn speed).
- **Profile:** the stroke profile in use (§7).

## 4. Swing model

Physics only cares about the mallet head during the few milliseconds of contact. Everything about the
player is upstream of that and is resolved here.

### Inputs (entered by the player, part of the profile)

- **Mallet:** head mass, head length, face material (preset → face restitution + face friction table),
  weight distribution (preset: centre / end-weighted → moment of inertia), shaft length.
- **Grip:** style (standard / Irish / Solomon) and top-hand height. Grip style only pre-fills the default
  top-hand height and shaft lean; it has no other effect.
- **Stance per stroke type:** ball position relative to feet (distance ahead of toes) and shaft lean at
  address. Each stroke type has defaults the player may adjust.

### Per-shot inputs (from the planner)

- Swing direction (aim), strength (head speed at impact), drive through impact
  (**check ↔ coast ↔ push through**), contact point on the ball, and stroke-type preset.

### Derivation

1. Top-hand height + shaft length → arc radius of the swing.
2. Stance (ball position relative to the arc's lowest point) → head **direction of travel** at impact
   (descending, level or rising).
3. Shaft lean → **face orientation** at impact, independent of direction of travel.
4. Strength → head speed at impact; drive setting → **force profile** applied to the head during contact
   (deceleration for a checked stroke, near zero when coasting, sustained acceleration when pushing).

Output: `ContactState` = head pose, velocity, orientation, applied-force profile over the contact window,
mallet mass properties, face material properties.

Backswing length and tempo are not separate inputs; they matter only through speed and acceleration at
impact.

## 5. Physics engine

### World

- **Balls:** four identical solid spheres (uniform-density inertia, `I = 2/5·m·r²`), dimensions, mass
  and bounce taken from the current official ball specification (§11). State: 3D position, velocity,
  angular velocity, motion phase.
- **Mallet:** rigid body with full inertia tensor (off-centre contact on the face pitches or twists the
  head), driven by the `ContactState` force profile.
- **Hoops:** two cylindrical uprights each, per-hoop `width` (v1: rigid, standard width). Standard lawn
  layout for positions.
- **Peg:** rigid cylinder.
- **Lawn:** flat plane with boundary. `surfaceAt(position) → { slidingFriction, rollingResistance }`,
  uniform in v1. Rolling resistance is derived from the lawn speed in the `ShotSetup`.

### Phase 1 — Impact (milliseconds)

Small fixed-step integration of all bodies in contact (mallet, striker's ball, croqueted ball, turf):

- Compliant normal contact (spring–damper; damping chosen to reproduce each pair's coefficient of
  restitution).
- Every body moves in full 3D. Ball–turf contact is compliant and **unilateral**: a ball can ride up off
  the turf during the impact, and then it meets the other ball above its equator along an inclined
  normal, with no turf friction acting on it while it is clear.
- Coulomb friction at every contact (mallet face–ball, ball–ball, ball–turf), each only while that
  contact is closed.
- Mallet driven by the applied-force profile throughout the contact window — this is where
  stop / drive / roll behaviour and the spin that causes pull originate.
- Ends when the drive window has closed and no mallet–ball or ball–ball contact remains (contact with the
  turf does not count). Hands each ball's full 3D state (position, linear and angular velocity) to
  phase 2. A ball clear of the turf is handed over airborne, as it is. A ball still in turf contact is
  placed on the lawn (z = R); it keeps an upward vertical velocity above the settle speed, and so starts
  airborne, and otherwise its vertical velocity is zeroed.

### Phase 2 — Free motion (event-driven, exact)

- Per-ball motion phase: **sliding** (contact-point velocity non-zero; friction decelerates and curves the
  path while spin converges), **rolling** (straight line, constant deceleration from rolling
  resistance), **stationary**, and **airborne** (ballistic flight under gravity, spin carried unchanged;
  air drag is neglected).
- Closed-form trajectories within a phase; the solver advances directly to the next event:
  phase transition, landing, ball–ball collision, ball–upright, ball–peg, boundary crossing, and the end of a
  push (below).
- **Contacts are fully 3D.** Ball–ball contact is between spheres, so a ball that has lifted strikes the
  other off its equator and the contact normal is inclined; ball–upright and ball–peg contact is with a
  vertical cylinder, so its normal stays horizontal. A ball's lift above the turf is never discarded.
- Collisions in free motion (e.g. a rush) are instantaneous impulses with restitution along the 3D
  normal and Coulomb friction in the full tangent plane, horizontal and vertical. A ball on the turf
  cannot be driven into it: the turf takes the downward part of any impulse on that ball, perfectly
  inelastically, and that turf impulse carries impulsive turf friction (Coulomb, against the ball's
  turf slip, at the turf's sliding coefficient). The upward part of an impulse lifts the ball. Whether a
  ball is turf-supported is decided by trying supported first and keeping it if the vertical impulse on
  that ball comes out downward (or zero), otherwise solving it as free. Simultaneous contacts are
  resolved one at a time in canonical ball order, then obstacles in their fixed order, then landings.
- **Landing** is an impulse with the turf: ball–turf restitution normal to the lawn and turf friction
  against the contact slip. An upward vertical speed below the **settle speed** (a numerical tolerance
  equal to the resting speed, 1 mm/s; it can lift a ball by at most about 0.05 µm), whether from a landing
  rebound or from any other impulse on a ball on the turf, is zeroed: the ball stays on the turf.
- Contacts closing slower than a small numerical tolerance (resting speed, 1 mm/s) are resting contacts,
  not bounces: a ball driven into another by its own spin, or an airborne ball settling against another
  ball under gravity, would otherwise rebound in an endless
  sequence of ever-smaller bounces. This covers airborne balls too: their accelerations include gravity
  and their contact normals are inclined. The touching bodies' speeds along each line of centres are made
  equal (perfectly inelastic), and where their accelerations would drive them together the contact
  pushes: contact forces, never pulling, keep the bodies' relative acceleration along each
  contact normal at zero. That is solved exactly in all observed cases, with a documented fallback (see
  the limitations below), for any number of balls and obstacles in contact.
- **Pushing contacts carry Coulomb friction** in the full tangent plane, between balls and against
  uprights and the peg, on the turf or in flight. A contact's slip is the relative velocity of the two
  contact points in the tangent plane: Pₜ[(v_a − v_b) + R·(ω_a + ω_b) × n] for balls a and b with n from a
  to b (the b terms vanish against an obstacle). While the contact slips, kinetic friction μ·N acts
  against the slip, which is frozen in direction for the segment like every other force. The vertical
  part of the contact forces changes the turf's load on each ball, L = m·g − Σ P_z (P the total contact
  force on the ball, normal plus friction, P_z its upward part), and turf sliding friction (μs × L) and
  rolling resistance scale with the load. Rolling resistance is the force that gives a free rolling ball
  its deceleration μr·g, i.e. 7/5·μr × L. A ball whose load would be zero or negative leaves the turf: it
  is solved as airborne. Loads are constant within a segment, so this happens only when the contacts are
  solved again. When the slip reaches zero the contact **sticks**: the tangential force is whatever keeps
  it stuck, provided it stays within μ·N. Otherwise the contact **slips** again, in the direction in which
  the slip then grows (solved together with the contact forces). Stick and slip are recorded as events
  when a coupled contact changes between them; the first coupling is already marked by its resting
  contact event. Balls at rest leaning on each other or on an obstacle hold through static friction
  within the same cone.
- While pushing, each ball's turf force is frozen at the start of the push segment: sliding friction
  against its slip, or rolling resistance against its travel. A pushed
  rolling ball has effective inertia 7/5·m (static turf friction keeps it rolling, so a vertical force at
  its contact point also drives it along the contact normal), provided the static turf friction this needs
  stays within μs × load; otherwise the ball is solved as sliding. Its acceleration is
  [Σ(P_h·(1 + ê_z) − ê_h·P_z) + rolling resistance]/(7/5·m), with P_h and P_z the horizontal and upward
  parts of each contact force and ê the unit vector from the ball's centre towards that contact point
  (ê_h its horizontal part): the forces turn the ball about its turf contact, so an upward force ahead of
  the centre turns it back. A resting ball resists a push up to its static rolling resistance: it stays at
  rest while |Σ(P_h·(1 + ê_z) − ê_h·P_z)| ≤ 7/5·μr × L and the static turf friction this needs stays within
  μs × L; otherwise it starts to roll, or to slide if rolling would need more than μs × L. Spin about the
  vertical axis is free while a ball moves (contact friction changes it; nothing on the turf resists it) and
  locked while a ball is at rest: the turf holds a resting ball against any torque about the vertical axis,
  as it already drops that spin when a ball stops. Each contact normal and slip direction is fixed for the
  segment.
  Accelerations are therefore constant and trajectories stay closed-form quadratics.
- A push segment ends when a pushed ball's slip or velocity reaches zero along its frozen direction or
  turns from it by more than a small angle, when a slipping contact's slip does the same (a stuck contact's
  force is constant within the segment, so it changes only when the contacts are solved again), when a
  coupled contact opens by more than a small gap, or when another event intervenes. The contacts are
  then solved again; a contact whose force would pull is released.
- Events are recorded in the `ShotResult` (collisions, landings, stick and slip, hoop passages,
  out-of-court, jump flags, approximate holds and slips, rest positions).

### Jump flag

The engine simulates every lift, but the model is validated only for balls skimming the lawn. In phase 2 a shot is
flagged "jump — outside the validated model" when a ball passes over another ball (its centre comes within one radius,
horizontally, of the other ball's centre: a strike more than 60° up the other ball, far beyond the fractional lift of a
well-struck ball), or when a ball's top rises to the underside of a hoop crown (§11), above which uprights stop being
infinite cylinders. The crown flag is court-wide: a ball whose top rises that high is outside the validated model
wherever it is. The flag is an event; the shot is still simulated to rest, with uprights still treated as infinite.
Phase 1 raises no jump flag: lift during the impact is expected (§9, stop-shot lift).

### Hoop running

The engine reports every passage of every ball through every hoop, with direction. If the `ShotSetup`
names a target hoop and direction for the striker's ball, the result states whether that hoop was run,
using the official Laws definition (§11). A ball that strikes an upright and rebounds out has not run it.
Passages are judged on the horizontal projection of the ball's centre; a passage made while the ball's
top is at or above the crown's underside is not recorded (the ball went over the hoop).

### Out of court

A ball is out of court when it meets the Laws criterion relative to the boundary (§11), judged on the
horizontal projection of its centre, in flight or not. The event is
recorded; the ball keeps moving until it stops or reaches a fixed margin beyond the boundary, where it is
halted (the surround is not modelled). A ball halted in flight is placed on the turf beneath that point. A halted ball is out of play for the rest of the shot: other balls
pass through its position rather than striking or pushing it. v1 reports the out-of-court position and does not apply the Laws'
replacement on the yard line.

### Free-motion limitations (v1)

- In free motion the turf is rigid apart from its restitution on landing: a ball driven into it in a
  collision does not bounce off it, and an instantaneous impulse cannot reduce the turf's load (weight
  acts over time, not in an instant).
- Simultaneous impulses are resolved one contact at a time (the order is given above): the ball–ball
  (or ball–obstacle) impulse first, then each ball's turf impulse.
- With friction, the contact forces of a push need not be unique (as for any rigid bodies with Coulomb
  friction); the solver returns the first consistent solution in a fixed order, so results stay
  deterministic. Where the slip direction of a contact that starts to slip cannot be solved, the result
  carries an `approximate-slip` event, with the residual of the failed direction solve as its excess
  figure, and the contact slips against its stuck force.
- If the exact resting-contact solve fails, the resting balls are held and the result carries an
  `approximate-hold` event with an excess figure. Neither fallback is expected in play: the limit-of-holding
  sweeps (§9) assert that neither occurs. Where one does, the error is not bounded in principle. Consumers
  should surface both.
- Whether balls at rest hold is decided to within a small numerical slack on their resistance (a
  configuration within that slack of the limit of holding may go either way).
- Making a resting contact's normal speeds equal (above) is a frictionless impulse: the speeds it removes
  are below the resting speed, so the friction it omits is negligible.
- The turf's resistance to spin about the vertical axis is idealised: none while a ball moves, as in free
  motion; unlimited while it is at rest, since real pivot friction on grass, though finite, is far larger
  than the contact torques of a push.
- Within a push segment each turf-force direction and contact normal is frozen. The error is first
  order in the direction tolerance and the opening gap, both small numerical tolerances. It is
  negligible for straight pushes and measured in millimetres for pushes at an angle. The brute-force
  cross-check (§9) bounds it. The same holds for each slipping contact's frozen slip direction.
- With friction and an inclined normal against a ball held by the turf, the friction impulse also changes the normal
  speed. Restitution along the normal is exactly the coefficient for the contact impulse itself (before turf friction
  acts) only for frictionless contacts and horizontal normals (two balls on the turf, any ball against an upright or
  the peg); the impulsive turf friction that follows on a supported ball can lower the effective restitution further.
  A pair is never left approaching: any approach friction leaves is removed by a perfectly inelastic normal impulse.
- A ball resting against another in flight (leaning on it, sliding round it) is pushed with its contact normal frozen
  for each segment, so it regroups every ~1.5 mrad of the normal's turn: around a thousand events for a ball rolling
  off another's top. This is finite and arises only in flagged jumps. A ball perched still on others stays put.

### Determinism

- Same inputs on the same browser engine → bit-identical results: fixed step sizes in phase 1, no
  time-of-day or frame-rate dependence, no reliance on unspecified iteration order.
- Across browser engines, `Math.*` transcendental functions are not guaranteed bit-identical, so the
  guarantee is agreement of rest positions within **1 mm**. v1 has few collisions per shot, so
  divergence is not amplified materially; the cross-engine Playwright test (§9) enforces the bound.

## 6. Planner (UI)

- **Lawn view:** top-down, correct layout of hoops and peg.
- **Ball placement:**
  - Drag plus a precise nudge control (finger dragging is imprecise).
  - Choose the striker's ball. For a croquet stroke, choose the croqueted ball; it **snaps into contact**
    with the striker's ball, and the player rotates the line of centres.
  - Invalid placements are prevented: overlapping balls, a ball inside an upright or the peg, a ball
    outside the boundary. The ball snaps back to its last valid position.
  - Optional distance / angle readouts between balls and to hoops.
- **Stroke setup:**
  - Stroke-type preset (single-ball, stop, drive, half-roll, full roll, pass-roll) → fills the controls
    below from the active profile; every control stays adjustable. Roquets and rushes are single-ball
    strokes aimed at another ball.
  - Aim line on the lawn; for croquet strokes an optional split-aim guide (halfway between targets).
  - Strength; drive (check ↔ coast ↔ push through); contact point via tap on a ball diagram.
  - Optional target hoop with a direction arrow.
- **Lawn:** lawn-speed control, defaulting to the profile's home-lawn speed.
- **Result:** Play animates with speed control; rest positions marked; faint path trails (pull visible as a
  curve); jump and out-of-court flags shown plainly.
- **Compare:** keep the previous result as a ghost overlay while one setting changes — the core training
  loop.
- **Share:** one link format (§8).
- **Honesty note:** short statement of what the model is validated against and that outcomes depend on
  profile and lawn.
- v1 excludes multi-shot turn planning and undo beyond the last shot.

## 7. Profiles and calibration

### Profile contents

- Entered physical facts (§4 inputs) and home-lawn speed — never fitted.
- Fitted parameters, deliberately few: **drive profile per stroke type** only. Stance is entered, not
  fitted, so every quantity has a single source. If calibration residuals prove systematically poor, a
  bounded stance correction is the first candidate to add.
- A default "typical club player" profile ships so the tool works before any calibration; its values are
  sourced (§11).

### Calibration flow

1. Player enters home-lawn speed.
2. Tool requests a standard set of straight strokes: single-ball, stop shot, drive, full roll.
3. Player plays each **3–5 times** and enters distances travelled by each ball. The **median** per stroke
   is used, which tolerates one bad attempt without explicit outlier rules.
4. Optimiser searches the fitted parameters to minimise distance error, using the engine as the forward
   model.
5. Tool reports fit quality per stroke (e.g. "stop-shot ratio within 5 %").
6. Fits needing parameters outside their plausible bounds (defined per parameter in the reference data,
   §11) are rejected with an explanation (likely measurement error or unusual stroke).

### Storage

Profiles are stored in browser local storage (multiple per device, e.g. a coach's pupils) and shared via
the link format in §8. Storage access is wrapped so the app works when storage is unavailable.

## 8. Share links and stored data

- **One link format:** a versioned, compact encoding of a `ShotSetup` in the URL fragment. The setup part
  is optional, so the same format shares a profile alone. Target length well under common URL limits
  (≤ 2,000 characters).
- Every link and every stored profile carries a **schema version** and the **engine version**.
- Opening an older link: migrate the schema if needed, re-simulate with the current engine, and if the
  engine version differs, show a short notice that results may differ slightly from when it was shared.
- Links from a newer schema than the app understands show a clear "please refresh" message.

## 9. Testing and validation

Tooling: **Vitest** (unit, property and snapshot tests), **Playwright** (browser tests incl. WebKit).

1. **Physics sanity**
   - Analytic cases: centre-struck spinless solid ball begins pure rolling at 5/7 of launch speed;
     head-on equal-mass perfectly elastic impact stops the first ball; drop-bounce matches restitution;
     a ball in flight lands where and when the ballistic closed form says; a ball with topspin at rest
     behind a resting ball pushes it with the closed-form common acceleration
     A = (c·μs − 7/5·μr)·g / (7/5 + c), c = (1 − μ − 7/5·μ·μr) / (1 + μ·μs) (μ the ball–ball friction;
     (5·μs − 7·μr)·g/12 when μ = 0), its turf load lowered and the pushed ball's raised by μ·N, until its
     turf slip is gone; both balls then roll together and the contact carries no force (it does not
     stick: the contact points still slip vertically at twice the common speed); a ball leaning on
     another ball or an upright holds inside the friction cone and slips just outside it; a ball
     struck above its equator is driven into the turf and gains the spin its impulsive turf friction
     gives it.
   - Invariants: energy never increases; momentum conserved in ball–ball impacts except for the turf's
     impulse; resting-contact forces never pull, balance between the pair and stay within the friction
     cone; touching balls never interpenetrate and never set off an event storm; bouncing balls settle.
   - Mirror symmetry of setups yields mirrored results.
   - Determinism: repeated runs on one engine are bit-identical.
   - Event solver cross-checked against brute-force small-step integration of the same shot, with the
     same physics (ball–ball friction on in every scenario, turf forces scaled by load).
   - Limits of holding swept with friction on raise no `approximate-hold` or `approximate-slip`.
2. **Croquet behaviour**
   - Standard stroke distance ratios within ±15 % of sourced coaching figures.
   - Ordering: stop shot → pass-roll gives monotonically increasing striker's-ball distance.
   - Pull emerges on wide rolls and narrows the split.
   - Stop-shot lift emerges without special-casing: in the default stop shot the striker's ball is clear
     of the turf while it transfers most of its momentum to the croqueted ball, meeting it fractionally
     above the equator (no jump flag), so the transfer is not spoiled by turf friction.
   - Clean hoop run in the target direction detected; upright rebound not counted; run in the wrong
     direction not counted.
   - Out-of-court event raised per the sourced criterion.
3. **Calibration**
   - Round trip: synthesise measurements from a known profile, fit, recover fitted parameters within
     ±5 % and reproduce measured distances within ±2 %.
   - Out-of-bounds fits rejected.
4. **App**
   - Playwright at tablet, desktop and phone viewports, in Chromium, WebKit and Firefox.
   - Invalid ball placements are prevented.
   - Shared link round-trips to the same `ShotResult` (bit-identical in the same engine; ≤ 1 mm across
     engines); older-version links open with the notice.
   - Performance budget: simulation time measured in CI under Chromium CPU throttling, with the throttle
     factor calibrated once against the reference iPad; initial bundle size checked against the budget.

## 10. Delivery and repository

- Static site deployed to GitHub Pages by a GitHub Actions workflow on merge to `main`.
- CI workflow (on `ubuntu-24.04`): lint, format check, type check, Vitest, Playwright, performance and
  bundle budgets.
- Repository scaffolding: `.gitignore`, `.gitattributes`, `.editorconfig` (4-space indent, 120-column
  limit), ESLint and Prettier.

## 11. Reference data to source (before tuning, not guessed)

Stored as JSON under `reference/`, one file per topic; every value carries its source (citation or URL)
and, where relevant, its plausible bounds.

- Official ball specification: diameter, mass, rebound requirement.
- Standard lawn dimensions, hoop and peg positions, hoop inner width, upright diameter, crown clearance
  (height of the crown's underside above the lawn), peg dimensions.
- Ball–turf restitution on landing.
- Laws: definition of running a hoop; out-of-court criterion.
- Lawn-speed definition and typical range.
- Coaching distance ratios for stop / drive / half-roll / full roll / pass-roll.
- Typical mallet values (head mass, head length, face materials) and default stance and drive values for
  the default profile.
- Friction and restitution literature for ball–turf, ball–ball and mallet-face materials; billiards
  event-driven physics literature (e.g. the model behind `pooltool`).

## 12. Risks

| Risk | Mitigation |
|---|---|
| Impact-phase contact parameters hard to pin down | Calibrate against coaching ratios; keep contact model isolated and replaceable |
| Coaching ratios vary and are imprecise | Treat as tolerance bands, not point targets; refine with measurements next season |
| Over-parameterised calibration yields meaningless profiles | Fit only the drive profile per stroke type; everything else is entered |
| Performance on old tablets | Event-driven free motion; short impact phase; budget tested in CI; Rust/WASM fallback |
| Cross-engine numerical drift | Tolerance-based guarantee enforced by a cross-engine test |
| Players trusting unplayable predictions | Honesty note; forward-only in v1 |
