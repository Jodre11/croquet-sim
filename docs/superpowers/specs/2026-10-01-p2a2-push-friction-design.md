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
- **Splitting P2a.2** (kinetic first, then stick/slip and holding; or by contact type): every exit criterion needs
  the new solver core, so a split would rewrite the core twice or leave an intermediate solver no criterion gates.

## 3. Structure and interfaces

`push.ts` (1,206 lines in P2a.1) is split by responsibility. Importers keep their import paths.

| Module | Responsibility |
|---|---|
| `push.ts` | Façade. Keeps `solveRestingContacts`, `solveNearestHold`, `pushedState`, `pushedTrajectory`, `pushDuration` and the tolerances; glues velocities, builds groups and iterates the kept set as today. |
| `contactModel.ts` (new) | Per-group model: ball modes (turf-rolling, turf-sliding, held, released, airborne) and contact modes (open, stick, slip); assembles the non-symmetric system for one candidate, with load-coupled turf forces and effective inertia 7/5·m for rolling balls; consistency checks. |
| `modeSolve.ts` (new) | Residual-merit Newton for candidates with unknown directions (slip onset, release from rest). Replaces `releaseDirections`. |
| `coneGuide.ts` (new) | Approximate second-order-cone solve (FISTA) proposing a candidate; its conic Farkas test is the hold certificate. Replaces `guide` and `searchHold`. |

Interface changes:

- `PushMotion` gains `contactSlips` (the frozen slip direction of each slipping contact it takes part in) and `load`
  (the ball's turf load, weight × m/s²; 0 in flight).
- `RestingSolution.coupled: boolean[]` becomes `modes: ContactMode[]` (`"open" | "stick" | "slip"`).
- `ShotEvent` gains `stick`, `slip` (with its direction) and `approximate-slip` (shaped like `approximate-hold`).
- `simulate.ts` gains a per-coupling end time for slipping contacts (`contactSlipDuration`), next to
  `boundedGroupEnd`.
- `ENGINE_VERSION` 0.2.0 → 0.3.0.
- Test support: `bruteForce.ts` scales rolling resistance by each step's turf load; `crossCheck.test.ts` drops
  `FRICTIONLESS`.

## 4. One group solve

Quantities (n from a to b, R the ball radius, e the horizontal unit vector from a ball's centre to a contact point):

- **Contact slip:** s = Pₜ[(v_a − v_b) + R·(ω_a + ω_b) × n]; against an obstacle the b terms drop. For two balls on
  the turf with a horizontal normal this is s_t = (v_a − v_b)·t + R·(ω_az + ω_bz), s_z = −R·(ω_a + ω_b)·t, so a
  rolling pair's contact points slip vertically at twice their common speed: every push rubs.
- **Load:** L = m·g − Σ P_z over the ball's contacts (normal plus friction). L ≤ 0 → the ball is solved as airborne.
- **Turf force:** sliding, μs·L against the frozen slip; rolling, 7/5·μr·L against the travel, with acceleration
  a = [Σ(P_h − P_z·e) + rr]/(7/5·m). A rolling ball whose required static turf friction exceeds μs·L is re-solved as
  sliding.
- **Held ball:** stays at rest while |Σ(P_h − P_z·e)| ≤ 7/5·μr·L.

Consistency of a candidate:

- every coupled N ≥ 0, and no open contact converges;
- stick: tangential force within μ·N and slip acceleration zero;
- slip: friction μ·N against the frozen slip, and the slip does not reverse at the start of the segment;
- held balls satisfy the hold condition; released balls move along their resistance; turf loads ≥ 0.

Pipeline:

1. **Glue.** Inelastic normal impulse as today; frictionless, because the speeds it removes are below RESTING_SPEED.
2. **Guide.** FISTA on the second-order-cone dual proposes every mode at once.
3. **Exact solve.** Fixed directions (stick; slip along its existing frozen direction) → one linear, non-symmetric
   solve. Unknown directions (slip onset; release from rest) → residual-merit Newton: minimise ½‖F(x)‖² with Armijo
   backtracking; accept only a converged root. This removes P1's `releaseDirections` ill-conditioning (planar entries
   of order 1e15 at a limit of holding); that arithmetic is not preserved.
4. **Fallback search.** Enumerate only the guide's marginal items (force near zero, on the cone's edge, acceleration
   near zero), in the fixed order held before released, stick before slip before open, smallest first, capped at
   `MODE_SEARCH_LIMIT`. First consistent candidate wins.
5. **Last resorts.** No slip-onset direction → the contact slips against its stuck force, `approximate-slip` (excess:
   the residual of the failed direction solve). Nothing consistent → nearest hold, `approximate-hold`, its hold check
   the conic certificate.

## 5. Simulator and events

- A slipping contact ends the segment when its slip reaches zero along its frozen direction or turns more than
  `DIRECTION_TOLERANCE` from it. Both are linear in time; `contactSlipDuration` reuses `pushDuration`'s `risesAt`.
- A stuck contact has no end time of its own: its force is constant within the segment.
- Every existing segment end (turf slip/velocity, opening gap, landing, other events) triggers a re-solve as today.
- `stick` / `slip` are emitted when a coupled contact's mode changes between consecutive solves, not at first
  coupling (its resting contact event marks that). Fields: `t`, the balls (or ball and `obstacleId`), and for `slip`
  the direction.
- Chatter at the stick boundary is bounded by the existing tolerances; no new event budget. Tests assert a small,
  finite event count.
- Unchanged: free-motion collisions (`resolve.ts`), landing, jump flag, out of court, halt. A ball perched still on
  others now holds through static friction and is still snapped to rest.

## 6. Testing

- **Analytic:** topspin push closed form to 1e-9 relative until the slip is gone, then `stick` (μ = 0 reduces to
  P1's (5μs − 7μr)g/12); straight rolling push — vertical slip at 2v, loads shifted by ±μN, closed form; static hold
  against an upright and a ball, inside the cone and just outside it; lift-off when friction drives a load to zero.
- **Invariants and properties:** energy never increases; normal forces never pull; friction within the cone and
  opposing slip (no positive work); mirror symmetry; determinism; finite event count at the stick boundary.
- **Limit-of-holding sweeps:** P1's 44.3°–44.7° sweep and wedge equivalents, friction on: no `approximate-hold`, no
  `approximate-slip`. The P1 release-fragility test is reworked to assert robustness, not unchanged arithmetic.
- **Cross-check:** every scenario in the standard world, friction on, within 1 mm of brute force with load-scaled
  rolling resistance, including the angled wedge.

## 7. Process

As P2a.1: prototype the residual-merit Newton and cone guide in a scratch worktree against the wedge and the sweeps
before writing the plan; Opus physics review of this design and the prototype; plan pre-flight executed literally;
subagent-driven development with per-task reviews (Opus for physics) and an Opus whole-branch review with probes.
On completion: roadmap P2 row "P2a.2 (met)" and a "P2a.2 outcomes carried forward" section.

## 8. Deferred minors in reach

From P2a.1, to pick up where a task touches the code anyway: `detect.ts` dead A/B/C aliases; `validateWorld` checks
only `crownClearance > 0`; two `landingTime` branches unreachable under gravity are untested; `boundedGroupEnd`
recomputes per track; crown height 0.29 hard-coded in `lift.test.ts`. `observe.ts`'s O(segments²) work stays a P5
note.
