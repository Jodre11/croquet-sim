# Croquet Shot Lab — Design

**Date:** 2026-09-30
**Status:** Reviewed (spec-review panel: subtraction, completeness)
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
| Jump shots, half-jumps | Ball state is fully 3D; v1 detects lift-off and flags the shot rather than simulating it |
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
- Coulomb friction at every contact (mallet face–ball, ball–ball, ball–turf).
- Mallet driven by the applied-force profile throughout the contact window — this is where
  stop / drive / roll behaviour and the spin that causes pull originate.
- Ends when no contacts remain and the drive window has closed. Hands each ball's linear and angular
  velocity to phase 2.
- If any ball's centre rises more than **1 mm** (provisional) above its resting height, the shot is
  flagged "would jump — not simulated in this version".

### Phase 2 — Free motion (event-driven, exact)

- Per-ball motion phase: **sliding** (contact-point velocity non-zero; friction decelerates and curves the
  path while spin converges), **rolling** (straight line, constant deceleration from rolling
  resistance), **stationary**.
- Closed-form trajectories within a phase; the solver advances directly to the next event:
  phase transition, ball–ball collision, ball–upright, ball–peg, boundary crossing, and the end of a
  push (below).
- Collisions in free motion (e.g. a rush) are instantaneous impulses with restitution and friction.
- Contacts closing slower than a small numerical tolerance (resting speed, 1 mm/s) are resting contacts,
  not bounces: a ball driven into another by its own spin would otherwise rebound in an endless
  sequence of ever-smaller bounces. The touching bodies' speeds along each line of centres are made
  equal (perfectly inelastic), and where their accelerations would drive them together the contact
  pushes: frictionless contact forces, never pulling, keep the bodies' relative acceleration along each
  contact normal at zero. That is Gauss's principle of least constraint, solved exactly in all observed
  cases, with a documented fallback (see the limitations below), for any number of balls and obstacles in contact.
- While pushing, each ball's turf force is frozen at the start of the push segment: sliding friction
  against its slip, or rolling resistance against its travel. A pushed rolling ball has effective
  inertia 7/5·m, and a resting ball resists a push up to its static rolling resistance. Each contact
  normal is fixed for the segment. Accelerations are therefore constant and trajectories stay
  closed-form quadratics.
- A push segment ends when a pushed ball's slip or velocity reaches zero along its frozen direction or
  turns from it by more than a small angle, when a coupled contact opens by more than a small gap, or
  when another event intervenes. The contacts are then solved again; a contact whose force would pull
  is released.
- Events are recorded in the `ShotResult` (collisions, hoop passages, out-of-court, rest positions).

### Hoop running

The engine reports every passage of every ball through every hoop, with direction. If the `ShotSetup`
names a target hoop and direction for the striker's ball, the result states whether that hoop was run,
using the official Laws definition (§11). A ball that strikes an upright and rebounds out has not run it.

### Out of court

A ball is out of court when it meets the Laws criterion relative to the boundary (§11). The event is
recorded; the ball keeps moving until it stops or reaches a fixed margin beyond the boundary, where it is
halted (the surround is not modelled). A halted ball is out of play for the rest of the shot: other balls
pass through its position rather than striking or pushing it. v1 reports the out-of-court position and does not apply the Laws'
replacement on the yard line.

### Free-motion limitations (v1)

- Pushing contacts are frictionless. Ball–ball friction acts in impulses only, so sidespin or balls
  sliding past each other while pushing are not rubbed. Straight pushes (the common croquet case: a
  topspun striker's ball catching the croqueted ball) have no sideways slip at the contact and are
  exact. In angled or sidespin pushes the omitted friction shifts rest positions by up to a few
  centimetres (measured: 23 mm on the standard-world wedge, up to about 110 mm adversarial).
- If the exact resting-contact solve fails, the resting balls are held and the result carries an
  `approximate-hold` event with an excess figure. It has been observed only at the limits of holding;
  the error is not bounded in principle. Consumers should surface it.
- Within a push segment each turf-force direction and contact normal is frozen. The error is first
  order in the direction tolerance and the opening gap, both small numerical tolerances. It is
  negligible for straight pushes and measured in millimetres for pushes at an angle. The brute-force
  cross-check (§9) bounds it.

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
     a ball with topspin at rest behind a resting ball pushes it with the closed-form common
     acceleration (5·μs − 7·μr)·g/12 until its slip is gone.
   - Invariants: energy never increases; momentum conserved in isolated ball–ball impacts; resting-
     contact forces never pull and balance between the pair; touching balls never interpenetrate and
     never set off an event storm.
   - Mirror symmetry of setups yields mirrored results.
   - Determinism: repeated runs on one engine are bit-identical.
   - Event solver cross-checked against brute-force small-step integration of the same shot.
2. **Croquet behaviour**
   - Standard stroke distance ratios within ±15 % of sourced coaching figures.
   - Ordering: stop shot → pass-roll gives monotonically increasing striker's-ball distance.
   - Pull emerges on wide rolls and narrows the split.
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
- Standard lawn dimensions, hoop and peg positions, hoop inner width and upright diameter, peg dimensions.
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
