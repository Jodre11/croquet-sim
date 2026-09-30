# Croquet Shot Lab — Design

**Date:** 2026-09-30
**Status:** Draft for review
**Repo:** `croquet-sim`

## 1. Purpose

A browser-based **shot lab** for croquet players. A player places balls on a lawn, sets up a single stroke
precisely, and sees a physically faithful prediction of where every ball ends up. It is a planning and
training tool, not a game: accuracy of outcome matters more than the feel of swinging.

### Audience and constraints

- Primary users are serious club players and coaches, many older and not confident with computers.
- Access must be "click this link": no install, no account, no server-side state.
- Tablets (notably older iPads) are first-class; touch-first with large targets, also usable with a mouse.
- Language in the UI is croquet language ("stop shot ↔ roll", "check ↔ push through"), never physics
  jargon. Advanced parameters are tucked away.

### Success criteria

1. Standard strokes (single-ball, stop, drive, half-roll, full roll, pass-roll) reproduce published
   coaching distance ratios within tolerance under the default profile.
2. Pull (narrowing of the split on wide rolls) emerges from the physics without being special-cased.
3. A player can calibrate a personal stroke profile from a handful of tape-measured straight strokes.
4. A shot simulates in well under a second on a 2020-era entry-level iPad; the app loads quickly on a
   modest connection.
5. A shared link reproduces the identical shot on any device.

## 2. Scope

### In v1

- Single-ball strokes, roquets, and croquet strokes across the stop-shot → pass-roll range, including
  split shots.
- Rebounds off hoop uprights and the peg; out-of-court detection; hoop-running detection.
- Per-player stroke profiles with calibration.
- Forward simulation only: the player chooses the stroke, the tool shows the outcome.
- Shareable links for setups and profiles.

### Explicitly deferred (design must not preclude)

| Deferred item | How v1 keeps it open |
|---|---|
| Jump shots, half-jumps | Ball state is fully 3D; v1 detects lift-off and flags the shot rather than simulating it |
| Hampered / glancing strokes | Contact is described generically (face orientation, contact point, head state) |
| Cannons (three balls in contact) | Impact phase handles N bodies in contact |
| Detailed hoop-wire contact on angled runs | Hoops are objects with geometry; contact model is replaceable |
| Hoop stiffness (loose hoops), per-hoop width tolerance | Each hoop carries `width` and `stiffness`; v1 uses rigid, standard width |
| Lawn surface variability (sparse / discoloured patches) | Engine queries `lawn.surfaceAt(position)`; v1 returns a uniform value |
| Slopes, grain, wet lawns | Same surface query; slope would add a gravity term to free motion |
| Inverse solving ("put the balls here — what stroke?") | Reuses the calibration optimiser; first addition after v1 |
| Full game (turn planning, rules, opponents) | Built on top of the single-shot engine |
| Motion-based stroke input | A new front end onto the same swing model |
| Split-shot / pull calibration | Measurement work planned for next season |
| In-app "this doesn't match my experience" feedback | Post-v1 |

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
| **Planner** | Ball placement, stroke controls, result display, compare overlay, sharing. | all of the above |
| **Renderer** | Animates a `ShotResult`. Never participates in physics. Top-down view in Canvas 2D (always loaded); optional 3D replay via three.js, lazy-loaded. | `ShotResult` only |

The engine and swing model are the portability boundary: if performance proves inadequate they can be
ported to Rust → WASM without touching the UI (decision recorded: start in TypeScript, switch only on
measured need).

UI framework: **Svelte** (small runtime, small bundles, suits low-end tablets).

## 4. Swing model

Physics only cares about the mallet head during the few milliseconds of contact. Everything about the
player is upstream of that and is resolved here.

### Inputs (entered by the player, part of the profile)

- **Mallet:** head mass, head length, face material (preset → face restitution + face friction table),
  weight distribution (preset: centre / end-weighted / custom → moment of inertia), shaft length.
- **Grip:** style (standard / Irish / Solomon), top-hand height, hand spacing.
- **Stance per stroke type:** ball position relative to feet (distance ahead of toes) and shaft lean at
  address. Each stroke type has defaults the player may adjust.

### Per-shot inputs (from the planner)

- Swing direction (aim), strength (head speed at impact), drive through impact
  (**check ↔ coast ↔ push through**), contact point on the ball, and stroke-type preset.

### Derivation

1. Grip height + shaft length → arc radius of the swing.
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
  and bounce taken from the current official ball specification (see §10). State: 3D position,
  velocity, angular velocity, motion phase.
- **Mallet:** rigid body with full inertia tensor, driven by the `ContactState` force profile.
- **Hoops:** two cylindrical uprights each; per-hoop `width` and `stiffness` (v1: rigid, standard width).
  Standard lawn layout for positions.
- **Peg:** rigid cylinder.
- **Lawn:** flat plane with boundary. `surfaceAt(position) → { slidingFriction, rollingResistance }`.
  Rolling resistance is derived from the standard lawn-speed measure so players enter what they know.

### Phase 1 — Impact (milliseconds)

Small fixed-step integration of all bodies in contact (mallet, striker's ball, croqueted ball, turf):

- Compliant normal contact (spring–damper; damping chosen to reproduce each pair's coefficient of
  restitution).
- Coulomb friction at every contact (mallet face–ball, ball–ball, ball–turf).
- Mallet driven by the applied-force profile throughout the contact window — this is where
  stop / drive / roll behaviour and the spin that causes pull originate.
- Ends when no contacts remain and the drive window has closed. Hands each ball's linear and angular
  velocity to phase 2.
- If any ball would leave the ground beyond a small threshold, the shot is flagged "would jump — not
  simulated in this version".

### Phase 2 — Free motion (event-driven, exact)

- Per-ball motion phase: **sliding** (contact-point velocity non-zero; friction decelerates and curves the
  path while spin converges), **rolling** (straight line, constant deceleration from rolling
  resistance), **stationary**.
- Closed-form trajectories within a phase; the solver advances directly to the next event:
  phase transition, ball–ball collision, ball–upright, ball–peg, boundary crossing, surface-region change
  (post-v1).
- Collisions in free motion (e.g. a rush) are instantaneous impulses with restitution and friction.
- Events are recorded in the `ShotResult` (collisions, hoop passages, out-of-court, rest positions).

### Hoop running

The engine reports each ball's passages through each hoop. Whether a hoop has been *run* follows the
official Laws definition (to be sourced exactly, see §10). A ball that strikes an upright and rebounds
out has not run the hoop.

### Determinism

Same inputs → bit-identical results on every browser: fixed step sizes in phase 1, no time-of-day or
frame-rate dependence, no reliance on unspecified iteration order.

## 6. Planner (UI)

- **Lawn view:** top-down, correct layout of hoops and peg. Balls placed by drag plus a precise nudge
  control (finger dragging is imprecise). Optional distance / angle readouts between balls and to hoops.
- **Stroke setup:**
  - Stroke-type preset (single-ball, stop, drive, half-roll, full roll, pass-roll) → fills the controls
    below from the active profile; every control stays adjustable.
  - Aim line on the lawn; for croquet strokes an optional split-aim guide (halfway between targets).
  - Strength; drive (check ↔ coast ↔ push through); contact point via tap on a ball diagram.
- **Result:** Play animates with speed control; rest positions marked; faint path trails (pull visible as a
  curve); optional lazy-loaded 3D replay.
- **Compare:** keep the previous result as a ghost overlay while one setting changes — the core training
  loop.
- **Share:** copy a link encoding the full setup and profile.
- **Honesty note:** short statement of what the model is validated against and that outcomes depend on
  profile and lawn.
- v1 excludes multi-shot turn planning and undo beyond the last shot.

## 7. Profiles and calibration

### Profile contents

- Entered physical facts (§4 inputs) — never fitted.
- Fitted parameters, deliberately few: **drive profile per stroke type** and a **small stance correction**
  per stroke type.
- A default "typical club player" profile ships so the tool works before any calibration.

### Calibration flow

1. Player enters home-lawn speed.
2. Tool requests a standard set of straight strokes: single-ball, stop shot, drive, full roll.
3. Player plays each a few times and enters distances travelled by each ball.
4. Optimiser searches the fitted parameters to minimise distance error, using the engine as the forward
   model.
5. Tool reports fit quality per stroke (e.g. "stop-shot ratio within 5 %").
6. Fits that cannot be matched within plausible parameter bounds are rejected with an explanation
   (likely measurement error or unusual stroke) rather than accepted.

### Storage and sharing

Profiles are stored in browser local storage (multiple per device, e.g. a coach's pupils), exportable and
shareable as links. Storage access is wrapped so the app works when storage is unavailable.

## 8. Testing and validation

Tooling: **Vitest** (unit, property and snapshot tests), **Playwright** (browser tests incl. WebKit).

1. **Physics sanity**
   - Analytic cases: centre-struck spinless solid ball begins pure rolling at 5/7 of launch speed;
     head-on equal-mass perfectly elastic impact stops the first ball; drop-bounce matches restitution.
   - Invariants: energy never increases; momentum conserved in isolated ball–ball impacts.
   - Mirror symmetry of setups yields mirrored results.
   - Determinism: repeated runs are bit-identical.
   - Event solver cross-checked against brute-force small-step integration of the same shot.
2. **Croquet behaviour**
   - Standard stroke distance ratios within tolerance of sourced coaching figures.
   - Ordering: stop shot → pass-roll gives monotonically increasing striker's-ball distance.
   - Pull emerges on wide rolls and narrows the split.
   - Clean hoop run detected; upright rebound not counted.
3. **Calibration**
   - Round trip: synthesise measurements from a known profile, fit, recover parameters within tolerance.
   - Nonsense inputs rejected.
4. **App**
   - Playwright at tablet and phone viewports, including WebKit.
   - Performance budget: shot simulation well under 1 s on the reference low-end tablet; small initial
     bundle with 3D view lazy-loaded.
   - Shared link round-trips to an identical `ShotResult`.

## 9. Delivery

Static site (GitHub Pages or equivalent). No backend. Offline-capable later (post-v1).

## 10. Reference data to source (before tuning, not guessed)

- Official ball specification: diameter, mass, rebound requirement.
- Standard lawn dimensions, hoop and peg positions, hoop inner width and upright diameter, peg dimensions.
- Laws definition of when a ball has run a hoop.
- Lawn-speed definition and typical range.
- Coaching distance ratios for stop / drive / half-roll / full roll / pass-roll.
- Friction and restitution literature for ball–turf, ball–ball and mallet-face materials; billiards
  event-driven physics literature (e.g. the model behind `pooltool`).

Each value is recorded with its source in the repo.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Impact-phase contact parameters hard to pin down | Calibrate against coaching ratios; keep contact model isolated and replaceable |
| Coaching ratios vary and are imprecise | Treat as tolerance bands, not point targets; refine with measurements next season |
| Over-parameterised calibration yields meaningless profiles | Fit only drive profile and stance correction; everything else is entered |
| Performance on old tablets | Event-driven free motion; short impact phase; budget tested in CI; Rust/WASM fallback |
| Players trusting unplayable predictions | Honesty note; forward-only in v1 |
