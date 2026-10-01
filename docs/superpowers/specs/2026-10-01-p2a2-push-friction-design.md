# P2a.2 — Push Friction: Solver Design

**Product spec:** `2026-09-30-croquet-shot-lab-design.md` §5 ("Pushing contacts carry Coulomb friction", the
pushing paragraphs after it, and the free-motion limitations) and §9. That spec fixes the behaviour; this document
fixes how the engine delivers it. **Roadmap:** P2 row, P2a.2.

## 1. Goal and exit criteria

Replace the frictionless resting-contact solver in `src/engine/push.ts` with one that applies 3D, load-coupled
Coulomb friction on every coupled contact (ball–ball and ball–obstacle, on the turf or in flight), with stick/slip
events and static friction in held clusters. Delivered as one plan with phased tasks.

Exit criteria (roadmap):

1. The generalised topspin-push closed form holds:
   A = (c·μs − 7/5·μr)·g/(7/5 + c), c = (1 − μ − 7/5·μ·μr)/(1 + μ·μs).
2. The angled wedge cross-check runs in the standard world (the `FRICTIONLESS` overrides in `crossCheck.test.ts`
   removed) and agrees with brute force within 1 mm.
3. No `approximate-hold` or `approximate-slip` in limit-of-holding sweeps with friction on.

## 2. Approach

Guided mode selection with residual-merit Newton. A candidate assigns a mode to every ball and contact of a group;
an approximate cone solve proposes one, an exact solve checks it, and a bounded search covers the cases where the
proposal is not consistent. This generalises P1's structure (guide, exact active-set solve, nearest-hold fallback)
and keeps its determinism and its fallback-reporting contract.

Rejected:

- **Unified non-smooth Newton** (Alart–Curnier / Fischer–Burmeister on the full complementarity problem): no
  convergence guarantee for non-monotone Coulomb problems, silent failures, and a poor fit with "first consistent
  solution in a fixed order".
- **Small-step integration while pushing:** abandons the closed-form, event-driven exactness of spec §5.
- **Splitting P2a.2** (kinetic first, then stick/slip and holding; or by contact type): a kinetic-first stage is
  a subset of the final core and criterion 1 would gate it, but criteria 2 and 3 need static friction and holding.
  Phased tasks within one plan give the same staging without an intermediate release.
- **Finite turf pivot resistance, or none at rest:** see the product spec §5 limitations.

## 3. Structure and interfaces

`push.ts` (1,206 lines in P2a.1) is split by responsibility. Importers keep their import paths.

| Module | Responsibility |
|---|---|
| `push.ts` | Façade. Keeps `solveRestingContacts`, `solveNearestHold`, `pushedState`, `pushedTrajectory`, `pushDuration`, the new `contactSlipDuration` (beside `pushDuration`, sharing `risesAt`) and the tolerances; re-exports `holdCertificate`, `HoldLink`, `HoldRay` from `coneGuide.ts`. Glues velocities, builds groups and iterates the kept set as today. |
| `contactModel.ts` (new) | Per-group model: ball modes (turf-rolling, turf-sliding, held, released, airborne) and contact modes (open, stick, slip); assembles the non-symmetric system for one candidate, with load-coupled turf forces, angular dynamics (below) and consistency checks. |
| `modeSolve.ts` (new) | Residual-merit Newton for candidates with unknown directions (contact or turf slip onset, release from rest). Replaces `releaseDirections`. |
| `coneGuide.ts` (new) | Approximate second-order-cone solve (FISTA) proposing a candidate; its conic Farkas test is the hold certificate. Replaces `guide` and `searchHold`. `holdCertificate` changes signature (below). |

Interface changes:

- `RestingContact` gains `friction`: the Coulomb coefficient of its material (`world.ballBall`,
  `ballUpright` or the peg's), filled in by `simulate.ts`. μs is `slidingDecel / gravity`. Mass is not carried, so
  forces and loads stay mass-normalised (m/s²), as today.
- `RestingSolution.coupled: boolean[]` becomes `modes: ContactMode[]` (`"open" | "stick" | "slip"`), with
  `slips: (Vec3 | null)[]`: each slipping contact's frozen slip direction. Both are per contact; `PushMotion` is
  unchanged in shape (its `angularAcceleration` now includes contact-friction torques).
- `RestingSolution` gains `approximateSlip: boolean[]` (per body: a contact or turf slip of the body fell back to
  §4 step 5's first last resort) and `slipExcess: number` (the worst residual of the failed direction solves; 0 when
  none), the counterparts of `approximate` and `holdExcess`.
- `holdCertificate` takes per ball its applied load and the parameters of its load-coupled resistance (μr, μs;
  capacity 7/5·μr·L and turf limit μs·L with L = g − Σ P_z, so the certificate is no longer a fixed-capacity test),
  and per link and ray its unit normal, contact offsets ê and friction μ. It tests the hold condition on
  Σ[P_h(1+ê_z) − ê_h·P_z] with ω_z locked. It still returns the compressions or null; `HoldLink` and `HoldRay` gain
  the new per-contact fields.
- `sim.couplings` entries gain `mode`, so the simulator can detect a mode change between consecutive solves.
- `ShotEvent` gains `stick` and `slip`, each split as the existing contact events are (`ball-ball` /
  `ball-obstacle`): `stick-ball` / `stick-obstacle` and `slip-ball` / `slip-obstacle`, the slip kinds carrying the
  direction. It also gains `approximate-slip`, shaped like `approximate-hold` (`balls`: those flagged in
  `approximateSlip`; `excess`: `slipExcess`).
- `ENGINE_VERSION` 0.2.0 → 0.3.0.
- Test support: `bruteForce.ts` scales each step's turf forces by the ball's load ratio L/g, mass-normalised
  L = g − (net vertical ball–ball and ball–obstacle impulse on the ball in the previous step)/dt. The previous step,
  because `step()` runs before that iteration's contact impulses. Rolling resistance uses L/g as is. Sliding
  friction uses min(L, g)/g: a downward contact impulse already carries impulsive turf friction (`turfFriction` in
  `resolve.ts`), so only a lowered load scales it, and an upward impulse, which `resolve.ts` lifts the ball with and
  settles back without friction, now lowers it. The same ratio scales the slip-end threshold (3.5·μs·g·dt).

## 4. One group solve

The physics is product spec §5: contact slip, the load L = m·g − Σ P_z (L ≤ 0 → solved as airborne), load-scaled
turf forces, the rolling acceleration and hold condition with the 3D contact offset ê, the static turf friction limit
for rolling, held and released balls, and spin about the vertical axis free while moving and locked at rest. Below,
t = ẑ × n is the horizontal tangent of a contact.

Worked case (why every push rubs): for two balls on the turf with a horizontal normal the slip is
s_t = (v_a − v_b)·t + R·(ω_az + ω_bz), s_z = −R·(ω_a + ω_b)·t, so a rolling pair's contact points slip vertically at
twice their common speed.

Unknowns per candidate: each moving ball's linear acceleration (horizontal on the turf, 3D in flight) and angular
acceleration — locked to the linear one for a rolling ball except about z, all three components for a sliding or
airborne ball, none for a held ball — and each coupled contact's normal force and, when stuck, its 2D tangential
force. Contact friction acts at R·ê from each centre, so it torques both balls: R·ê × P / (2/5·m·R²).

Consistency of a candidate:

- every coupled N ≥ 0, and no open contact converges;
- stick: tangential force within μ·N and slip acceleration zero;
- slip: friction μ·N against the frozen slip, and the slip does not reverse at the start of the segment;
- held balls satisfy the hold condition and turf static friction limit; released balls move along their
  resistance; rolling balls' static turf friction is within μs·L; turf loads ≥ 0.

Pipeline:

1. **Glue.** Inelastic normal impulse as today; frictionless (product spec §5 limitations).
2. **Guide.** FISTA on the second-order-cone dual proposes every mode at once.
3. **Exact solve.** Fixed directions (stick; slip along its existing frozen direction) → one linear, non-symmetric
   solve. Unknown directions (contact slip onset; turf slip onset, when a rolling or held ball's static turf
   friction would exceed μs·L because a contact lowered its load; release from rest) → residual-merit Newton:
   minimise ½‖F(x)‖² with Armijo backtracking; accept only a converged root. This removes P1's `releaseDirections`
   ill-conditioning (planar entries of order 1e15 at a limit of holding); that arithmetic is not preserved.
4. **Fallback search.** Enumerate only the guide's marginal items (force near zero, on the cone's edge, acceleration
   near zero), in the fixed order: for balls held, then released, then turf-rolling, then turf-sliding, then
   airborne; for contacts stick, then slip, then open; smallest first. The search is capped at `MODE_SEARCH_LIMIT`
   candidates; the prototype measures the worst case in play (pairs, short chains, the wedge, the sweeps) and the
   plan fixes the cap above it. First consistent candidate wins.
5. **Last resorts.** No slip-onset direction → the contact slips against its stuck force, or the ball's turf slip
   starts against its static turf friction, `approximate-slip` (excess: the residual of the failed direction
   solve). Nothing consistent, or the cap reached → nearest hold, `approximate-hold`, its hold check the conic
   certificate.

## 5. Simulator and events

- A slipping contact ends the segment when its slip reaches zero along its frozen direction or turns more than
  `DIRECTION_TOLERANCE` from it. Both are linear in time. After `settle()` couples the solution's contacts, it calls
  `contactSlipDuration` once per slipping contact with the solution's slip and lowers both member tracks'
  `duration` to it. `findNextEvent` then raises the end as a `regroup` from the track's own `t0 + duration`, and
  `groupEnd` picks it up unchanged. Every re-solve first runs `release()`, which reopens the tracks, so no lowered
  duration outlives its segment.
- A stuck contact has no end time of its own: its force is constant within the segment.
- Every existing segment end (turf slip/velocity, opening gap, landing, other events) triggers a re-solve as today.
- `stick` / `slip` events (§3) are emitted when a coupled contact's mode changes between consecutive solves, not at
  first coupling (its resting contact event marks that). `release()` clears the couplings before the solve (and the
  landing path releases before it settles), so `settle()` snapshots the group's couplings and their modes before
  releasing and compares against that snapshot.
- Unchanged: free-motion collisions (`resolve.ts`), landing, jump flag, out of court, halt. A ball perched still on
  others now holds through static friction and is still snapped to rest.

## 6. Testing

- **Analytic:**
  - Topspin push: the closed form to 1e-9 relative, with the pusher's load lowered and the pushed ball's raised by
    μ·N, until the pusher's turf slip is gone; then both roll together and the contact carries no force (N = 0 for a
    straight rolling pair: N·(1 − 7/5·μ·μr) = 0), with no `stick` event. μ = 0 reduces to P1's (5μs − 7μr)g/12.
    The test also asserts rest positions, so the plan derives the friction-on slip-end time (the pusher's turf
    friction lowered, its spin also slowed by the contact-friction torque) in closed form.
  - The test world's `ballBall.friction` is 0.05, so every existing push test that assumed frictionless pushes
    (in `simulate.test.ts`, `lift.test.ts` and `push.test.ts`) is re-derived with friction on, not loosened.
  - Static hold against an upright and against a ball: holds inside the cone, slips just outside it.
  - Lift-off when friction drives a load to zero.
- **Invariants and properties:** energy never increases; normal forces never pull; friction within the cone and
  opposing slip (no positive work); mirror symmetry; determinism; finite event count at the stick boundary.
- **Limit-of-holding sweeps:** P1's 44.3°–44.7° sweep stays as the μ = 0 case against its closed form
  (cos θ = 9/12.6). With friction on, the limit moves; the prototype derives the frictional limit of the same line
  and of a wedge equivalent in closed form, or else brackets it by an independent bisection on brute force, and the
  plan's sweeps straddle it, deciding as that limit does outside a 1e-6 band. Neither sweep may raise
  `approximate-hold` or `approximate-slip`. The P1 release-fragility test is reworked to assert robustness, not
  unchanged arithmetic.
- **Cross-check:** every scenario in the standard world, friction on, within 1 mm of brute force with load-scaled
  turf forces, including the angled wedge. New scenarios: a ball pushed along or rubbing against an upright (coupled
  ball–obstacle friction), and one that reaches a `stick` event or a slip onset.
- **No approximation:** `fuzz.test.ts` and the cross-check's wedge assertion forbid `approximate-slip` as well as
  `approximate-hold`.

## 7. Process

As P2a.1: prototype the residual-merit Newton and cone guide in a scratch worktree against the wedge and the sweeps
before writing the plan (it also measures `MODE_SEARCH_LIMIT` and derives the frictional holding limit); Opus physics
review of this design and the prototype; plan pre-flight executed literally; subagent-driven development with
per-task reviews (Opus for physics) and an Opus whole-branch review with probes. On completion: roadmap P2 row
"P2a.2 (met)" and a "P2a.2 outcomes carried forward" section.

## 8. In scope beside the solver

`boundedGroupEnd` recomputes per track (`findNextEvent` calls it for every live track, so a group's end is computed
once per member); the plan computes it once per group.
