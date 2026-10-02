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
3. No `approximate-hold`, `approximate-slip` or `budget-hold` in limit-of-holding sweeps with friction on.

## 2. Approach

Hold-first mode selection with residual-merit Newton. A candidate assigns a mode to every ball and contact of a
group. The solver first tries every candidate with every resting ball held (whatever the modes of its contacts and
moving balls); then the modes P2a.1's frictionless guide proposes; then every other candidate, fewest departures
from that proposal first. An exact
solve checks each one, and the first consistent candidate wins. This keeps P1's determinism and its
fallback-reporting contract.

Rejected:

- **Unified non-smooth Newton** (Alart–Curnier / Fischer–Burmeister on the full complementarity problem): no
  convergence guarantee for non-monotone Coulomb problems, silent failures, and a poor fit with "first consistent
  solution in a fixed order".
- **A second-order-cone guide (FISTA).** With kinetic, load-coupled friction the problem is non-symmetric and has no
  exact convex form. A relaxation exists (cone complementarity with lagged loads), but the prototype's guide
  proposed wrong modes often, including impossible ones (a held ball driving a moving one), and searching only its
  marginal items left about a third of random cases unsolved.
- **Small-step integration while pushing:** abandons the closed-form, event-driven exactness of spec §5.
- **Splitting P2a.2** (kinetic first, then stick/slip and holding; or by contact type): a kinetic-first stage is
  a subset of the final core and criterion 1 would gate it, but criteria 2 and 3 need static friction and holding.
  Phased tasks within one plan give the same staging without an intermediate release.
- **A pivot mode** (centre at rest, spin about the vertical axis free) and **spin about the vertical axis free while
  rolling.** The rule "locked at rest, free once moving" left three of 1,000 random clusters with no consistent
  mode (a Painlevé-type inconsistency of the discontinuous rule), admitted a spurious released solution over
  50.06°–52.37° on the bent line, and left a force that changes the motion undetermined. Locking the spin while
  the patch does not slip (product spec §5) removes all three. A croquet ball is not seen to spin on the spot.
- **Finite turf pivot resistance in v1:** see the product spec §5 limitations; the per-ball capacity (§3) keeps it
  open.

## 3. Structure and interfaces

`push.ts` (1,206 lines in P2a.1) is split by responsibility. Importers keep their import paths.

| Module | Responsibility |
|---|---|
| `push.ts` | Façade. Keeps `solveRestingContacts`, `solveNearestHold`, `pushedState`, `pushedTrajectory`, `pushDuration`, the new `contactSlipDuration` (beside `pushDuration`, sharing `risesAt`) and the tolerances. Glues velocities, builds groups and iterates the kept set as today. `holdCertificate`, `HoldLink` and `HoldRay` are deleted; their tests move up to `solveRestingContacts` decisions. |
| `contactModel.ts` (new) | Per-group model: ball modes (held, released, turf-rolling, turf-sliding, airborne) and contact modes (open, stick, slip); assembles the non-symmetric system for one candidate, with held balls inside it, load-coupled turf forces, angular dynamics and consistency checks. Works in each ball's turf frame. |
| `modeSolve.ts` (new) | Candidate order, residual-merit Newton for unknown directions (contact or turf slip onset, release from rest), friction continuation, the search, and the work budget. Keeps P2a.1's frictionless `guide` as the proposal (§4 step 3); replaces `searchHold`, `holdCertificate` and `releaseDirections`. |
| `math/elementary.ts` (new) | `ln`, `sinCos` and `atan2` from IEEE-exact operations only, accurate to a few ulps (tested against `Math.*`), for the direction angles (§4 step 4: each unknown direction is cos φ·e1 + sin φ·e2 in its plane) and the log barrier; `Math.*` transcendentals are not bit-identical across engines and stay banned in the engine. |
| `convexSolve.ts` (new) | One second-order-cone primitive (log barrier): feasibility, then minimum norm, over load-coupled cones. It serves both the hold-first check (§4 step 2) and the choice of undetermined forces (§4 step 5). |
| `linalg.ts` (new) | Dense elimination with full pivoting (skipping zero entries of the pivot row), rank detection and null space, factor reuse across right-hand sides, sparse assembly of the system. |

Interface changes:

- `RestingContact` gains `friction`: the Coulomb coefficient of its material (`world.ballBall`,
  `ballUpright` or the peg's), filled in by `simulate.ts`. μs is `slidingDecel / gravity`. Mass is not carried, so
  forces and loads stay mass-normalised (m/s²), as today.
- `ContactBody` gains its **turf normal** (ẑ in v1) and its **pivot capacity**, the turf's grip against spin about
  the turf normal. The gravity vector (−g·ẑ in v1) is passed once per solve and gives the load's direction and size;
  each ball's `MotionParams.gravity` stays its magnitude (μs = slidingDecel/g, μr = rollingDecel/g), and the caller
  keeps the two equal. The contact model uses these vectors
  throughout (the load, the hold condition's ê terms, the pivot axis, t = normal × n), never z components, so
  slopes change inputs, not equations. v1 implements no finite pivot constraint: the capacity is always unlimited
  and the solver asserts it; the constraint arrives with the surface model. `simulate.ts` fills both from the world.
- `RestingSolution.coupled: boolean[]` becomes `modes: ContactMode[]` (`"open" | "stick" | "slip"`), with
  `slips: (Vec3 | null)[]`: each slipping contact's frozen slip direction. Both are per contact; `PushMotion` is
  unchanged in shape (its `angularAcceleration` now includes contact-friction torques). A coupling that carries no
  friction (μ = 0, or one the nearest hold made) is reported as `"slip"` with a null slip.
- `RestingSolution` gains `approximateSlip: boolean[]` (per body: a contact or turf slip of the body fell back to
  §4's first last resort), `slipExcess: number` (the worst residual of the failed direction solves; 0 when none),
  `budgetHold: boolean[]` (per body: its group was held because the work budget was spent; its balls are not also
  flagged in `approximate`, so it emits `budget-hold` only), `work: number` (the work units it spent) and
  `searched: number` (the most candidates any group tried; the cluster test checks it against `MODE_SEARCH_LIMIT`).
  `holdExcess` is now how far the hold-first candidate misses its relaxed convex conditions at the best forces its
  solve found (m/s²; Infinity when that candidate's system cannot be solved at all).
- `solveRestingContacts` and `solveNearestHold` take an optional options argument: the gravity vector (default −g·ẑ
  from the first body), the work budget remaining for the shot (default unlimited), and a test seam that makes every
  direction solve fail (§4 step 7).
- `simulateFreeMotion` takes an optional options argument: the shot's work budget (default `SOLVE_BUDGET`) and a
  measurement probe called around every resting-contact solve (the performance script times solves with it).
- Held balls' limits: per ball its load-coupled resistance capacity 7/5·μr·L and turf limit μs·L with
  L = g − Σ P·normal, tested on Σ[P_h(1+ê_z) − ê_h·P_z] and F = Σ(ê_z·P_h − ê_h·P_z). They are conditions of every
  candidate that holds the ball (§4), not a separate check. Below a limit of holding the feasible forces form a set,
  not a point; only feasibility is decided.
- `sim.couplings` entries gain `mode`, so the simulator can detect a mode change between consecutive solves.
- `ShotEvent` gains `stick` and `slip`, each split as the existing contact events are (`ball-ball` /
  `ball-obstacle`): `stick-ball` `{ t, balls }`, `stick-obstacle` `{ t, ball, obstacleId }`, `slip-ball`
  `{ t, balls, direction }` and `slip-obstacle` `{ t, ball, obstacleId, direction }`. `direction` is the unit slip in
  world coordinates of the first ball's contact point relative to the other body's. It also gains
  `approximate-slip`, shaped like `approximate-hold` (`balls`: those flagged in `approximateSlip`; `excess`:
  `slipExcess`), and `budget-hold` `{ t, balls }` (the solve's flagged balls that are held at rest; possibly none).
  Both are emitted once per solve that sets them; once the budget is spent every later solve of the shot emits
  `budget-hold` again.
- `ENGINE_VERSION` 0.2.0 → 0.3.0.
- Test support, `bruteForce.ts`:
  - Turf forces scale by each ball's load ratio L/g, with L = g − (net vertical push impulse on the ball in the
    previous step)/dt. Only push impulses count: a contact that persists from the previous step's contact check
    (overlapping, or with a gap below `RESTING_SPEED`·dt) and approaches slower than `RESTING_SPEED`. Collisions
    never scale turf forces (an impulse cannot reduce the turf's load). The previous step is used because `step()`
    runs before that iteration's contact impulses.
  - Rolling resistance scales by max(L/g, 0). Sliding friction and the slip-end threshold (3.5·μs·g·dt) scale by
    min(max(L/g, 0), 1): a downward contact impulse already carries impulsive turf friction (`turfFriction` in
    `resolve.ts`), so only a lowered load scales it.
  - A push impulse leaves the spin about the vertical axis of a ball whose patch does not slip (`classify`:
    stationary or rolling) unchanged. Collisions change it as `resolve.ts` does: no patch resists an impulsive
    twist, and the engine shares that impulse model.

## 4. One group solve

The physics is product spec §5: contact slip, the load L = m·g − Σ P_z (L ≤ 0 → solved as airborne), load-scaled
turf forces, the rolling acceleration and hold condition with the 3D contact offset ê, rolling resistance through
the centre with no moment, the static turf friction limit for rolling, held and released balls (for a held ball
F = Σ(ê_z·P_h − ê_h·P_z)), and spin about the turf normal locked while a ball's patch does not slip (held,
released from rest, rolling) and free while it slides or is airborne. Below, t = ẑ × n is the horizontal tangent of
a contact.

Worked case (why every push rubs): for two balls on the turf with a horizontal normal the slip is
s_t = (v_a − v_b)·t + R·(ω_az + ω_bz), s_z = −R·(ω_a + ω_b)·t, so a rolling pair's contact points slip vertically at
twice their common speed.

Unknowns per candidate: each moving ball's linear acceleration (horizontal on the turf, 3D in flight) and angular
acceleration (locked to the linear one for a rolling or released ball, with no change in its spin about the
vertical axis; all
three components for a sliding or airborne ball); each held ball's static turf force F and resistance Q, with its
centre and spin locked; and each coupled contact's normal force and, when stuck, its 2D tangential force. Contact
friction acts at R·ê from each centre, so it torques both balls: R·ê × P / (2/5·m·R²).

Consistency of a candidate:

- every coupled N ≥ 0, and no open contact converges;
- stick: tangential force within μ·N and slip acceleration zero;
- slip: friction μ·N against the frozen slip; a contact starting to slip slips along its slip acceleration;
- held balls: |Q| ≤ 7/5·μr·L, |F| ≤ μs·L, each relaxed by `HOLD_SLACK` in every candidate; released balls move
  along their resistance (d·w > `FOLLOW_EPSILON`, |sin(d, w)| ≤ `FOLLOW_EPSILON`); rolling balls' static turf
  friction within μs·L; turf loads > 0 (a load of zero or below leaves the turf, product spec §5);
- a lifted ball (airborne mode for a ball on the turf) does not accelerate into the turf.

Pipeline:

1. **Glue.** Inelastic normal impulse as today; frictionless (product spec §5 limitations).
2. **Hold first.** Every candidate with every resting ball held, before any that releases one: first the proposal
   with its resting balls held, then the others in the order of step 6 with the resting balls kept held (only the
   moving balls' and the contacts' modes vary). Held balls are in the system with their static turf forces, and
   their undetermined forces are settled by the convex solve of step 5. The first consistent one wins, so between a
   release onset and a hold limit, where both are consistent, holding decides (product spec §5).
3. **Proposal.** P2a.1's frictionless guide (projected dual ascent with each resting ball's static resistance; the
   μ = 0 limit) proposes the released balls and the coupled contacts — stuck unless already slipping (slip speed
   above `SPEED_EPSILON`) or frictionless, which are slipping — and its accelerations seed the directions.
4. **Exact solve per candidate.** Fixed directions (stick; slip along its frozen direction) → one linear,
   non-symmetric solve. Unknown directions (contact slip onset; turf slip onset, when a rolling or held ball's
   static turf friction would exceed μs·L because a contact lowered its load; release from rest) → residual-merit
   Newton: minimise ½‖F(x)‖² with Armijo backtracking (at most 30 halvings); accept only a converged root that
   passes `FOLLOW_EPSILON`. Starts, in order: four cheap starts (the proposal's seed and its quarter turns); for at
   most two direction items a forward scan (24 points, or 12 × 12); then friction continuation (μ scaled to 1e-3 of
   its value, then 0.1, 0.25, 0.5, 0.75 and 1, each seeded from the previous root). The scan must stay behind the
   cheap starts, or it rejects genuine releases just past a limit.
5. **Undetermined forces.** A candidate's system can be singular but consistent: a ball stuck to a held ball has
   its vertical stick row implied by its normal row; a ball jammed between three or more bodies has free normal
   splits. The solver takes the minimum-norm forces subject to every convex condition of the candidate (N ≥ 0,
   stick cones, held balls' limits, loads), relaxed by 1e-10, by a barrier solve over the null-space coordinates;
   the unconstrained minimum-norm solution is returned directly when it is feasible. A null space that leaves every
   followed rate unchanged is resolved once, at the accepted root; one that couples to a followed rate (a sliding
   ball jammed against three or more bodies) is resolved at every Newton evaluation, with a finite-difference
   Jacobian. Every acceptance check is run again after the choice.
6. **Search.** Enumerate every item, not only marginal ones: per resting ball held, released or turf-sliding; per
   rolling ball rolling or sliding; per contact stick, slip or open (slip or open if already slipping or
   frictionless). A ball in flight has only its airborne mode. Contacts between two held bodies are stuck (slipping at
   μ = 0), their forces settled by step 5, and not enumerated. Order: fewest departures from the proposal first, then
   balls held, released, turf-rolling, turf-sliding, and contacts stick, slip, open. Lift-off is derived, not
   enumerated: a candidate in which some balls on the turf have a load of zero or below is followed at once by the
   same candidate with those balls airborne (lifted off at z = R; consistent only if they do not accelerate into the
   turf). It keeps the search measured below; in play lift-off needs μ·N ≥ g, far beyond croquet pushes. The search is
   capped at `MODE_SEARCH_LIMIT` = 1024 candidates (worst measured: 183, over 20,000 random four-ball clusters with
   obstacles, with the prototype's cone-guide proposal; the cluster test re-measures it). First consistent candidate
   wins.
7. **Last resorts.** When the search ends with nothing consistent (exhausted or capped), the first candidate in
   search order whose only failure was its direction solve (no accepted root: none converged, or none passed
   `FOLLOW_EPSILON`) is tried with fallback directions; later ones are not. The fallback directions come from the
   same candidate solved with each such contact stuck and each such turf-onset ball rolling (held, if at rest): a
   contact slips along the tangential force the stuck contact exerts on its second body (b), so friction keeps acting
   as it did; a ball's turf slip starts against its static turf friction. A candidate that also releases a ball from
   rest has no fallback. Consistent → `approximate-slip` (excess: the smallest residual its direction solve reached).
   Otherwise → nearest hold, `approximate-hold`. Work budget spent (§5) → nearest hold, `budget-hold`. The nearest hold is P1's: the resting balls are held and the moving balls are
   solved against them as fixed obstacles by Gauss's least constraint, frictionlessly, a convex problem that always
   has a solution. Its omitted friction is part of the approximation these events report. No test reaches
   `approximate-slip` naturally (the prototype never raised it), so a unit test reaches it by injecting a failed
   direction solve.

Tolerances:

- `FOLLOW_EPSILON` = 1e-9 m/s²: a direction root is accepted only if d·w > `FOLLOW_EPSILON` and
  |sin(d, w)| ≤ `FOLLOW_EPSILON`. Without it, spurious roots with |w| ≈ 1e-15 release balls that hold.
- `HOLD_SLACK` ≥ 7/5·`FOLLOW_EPSILON`, so no configuration near a limit is rejected by both holding and releasing.
  `HOLD_SLACK` = 1e-8 m/s² (P2a.1: 1e-6). Its effect on a limit is HOLD_SLACK divided by the margin's slope: 3.8e-9
  rad at 1e-8 on the bent line.

## 5. Simulator and events

- A slipping contact ends the segment when its slip reaches zero along its frozen direction or turns more than
  `DIRECTION_TOLERANCE` from it. Both are linear in time. After `settle()` couples the solution's contacts, it calls
  `contactSlipDuration` once per slipping contact with the solution's slip and lowers its member tracks' `slipEnd`
  (absolute time, Infinity when none; one track against an obstacle) to it. Only pushed tracks carry one. `findNextEvent` raises it as a `regroup` for every phase, airborne
  included (an airborne track's `t0 + duration` is its landing time, so the duration cannot carry it), and
  `groupEnd` includes it. Every re-solve first runs `release()`, which reopens the tracks and resets `slipEnd`, so no
  slip end outlives its segment.
- A stuck contact has no end time of its own: its force is constant within the segment.
- Every existing segment end (turf slip/velocity, opening gap, landing, other events) triggers a re-solve as today.
- `stick` / `slip` events (§3) are emitted when a coupled contact's mode changes between consecutive solves, not at
  first coupling (its resting contact event marks that). `release()` clears the couplings before the solve, so
  `settle()` snapshots the group's couplings and their modes before releasing and compares against that snapshot.
  The landing handler calls `release()` itself before `settle()`, so it takes the snapshot before its own release
  and passes it to `settle()`. A change to a coupling without friction (§3) emits nothing.
- **Lift-off.** A ball lifted off the turf starts its push at z = R with vz = 0 and upward acceleration;
  `landingTime` returns 0 for a ball on the plane that is not rising, so it is changed to return Infinity when the
  ball is at rest on the plane with upward acceleration. At its next solve the ball is above the plane and classified
  airborne.
- **Work budget.** The simulator carries one counter per shot of solver work: linear solves, Newton evaluations and
  barrier iterations (the hold-first candidates included; the guide's iterations are not counted), each weighted by
  its size; the plan fixes the weights and
  `SOLVE_BUDGET` from the prototype's costs, at about 100 ms on the reference tablet. `solveRestingContacts` checks
  the counter before each candidate; once it is spent, the search stops at that candidate boundary, the group is
  held (nearest hold, which is not counted: it is convex and bounded) and a `budget-hold` event is emitted.
  Counting work, not time, keeps results identical on every device.
- Unchanged: free-motion collisions (`resolve.ts`), the landing impulse, jump flag, out of court, halt. A ball perched still on
  others now holds through static friction and is still snapped to rest.

## 6. Testing

Closed forms (the `push.test.ts` parameters SLIDE 3, ROLL 0.5 unless stated; ball–ball μ 0.05, upright μ 0.1, as in
`testWorld()`) are derived in the prototype and are the arbiters of every limit below. "Standard world" below means
`testWorld()` without overrides (`tests/engine/support/fixtures.ts`), not `defaultWorld()`.

- **Analytic:**
  - Topspin push: A to 1e-9 relative, with the pusher's load lowered and the pushed ball's raised by μ·N. The pusher
    slides until T = R·Ω₀/(A + 5/2·[μs·g + μN(1 − μs)]); then both roll and the contact carries no force
    (N·(1 − 7/5·μ·μr) = 0), with no `stick` event; both come to rest displaced by A·T²/2 + V²/(2·ROLL), V = A·T.
    `push.test` values (Ω₀ 60 rad/s): A = 0.89895492703632, N = 2.0693921815851, T = 0.32173469194794,
    displacement 0.13017794880210 m (0.14880652284695 at μ = 0). μ = 0 reduces to P1's (5μs − 7μr)g/12.
  - The test world's `ballBall.friction` is 0.05, so every existing push test that assumed frictionless pushes
    (in `simulate.test.ts`, `lift.test.ts` and `push.test.ts`) is re-derived with friction on, not loosened.
  - Static hold against an upright and against a ball: holds inside the cone, slips just outside it. Upright
    (`testWorld()`, μs 0.3, μr 0.05; a topspin driver pushing ball 1 against an upright at angle β): hold limit
    β* = 20.447782900°, release onset β_slip = atan μu + asin(K0/(N′·√(1 + μu²))) = 20.290321024°.
  - Lift-off when friction drives a load to zero. Two balls on the turf need μ·μs > 1, so the test uses ball–ball
    μ = 4: a topspin driver (60 rad/s) against a ball with stronger backspin (−80 rad/s) lifts it with
    N = μs·g/(2 − μ·μs) and a_z = 2g(μ·μs − 1)/(2 − μ·μs) (in `testWorld()`: N = 3g/8, a = (3g/8, 0, g/2)).
  - `math/elementary.ts` against `Math.*` to a few ulps.
- **Invariants and properties:** energy never increases; normal forces never pull; friction within the cone and
  opposing slip (no positive work, including rolling resistance); mirror symmetry; determinism (bitwise); finite
  event count at the stick boundary; no ball spins about the vertical axis on the spot; once the work budget is spent
  every later group is held with `budget-hold` and the shot still finishes.
- **Limit-of-holding sweeps:** P1's 44.3°–44.7° sweep stays as the μ = 0 case against its closed form
  (cos θ = 9/12.6). With friction on, the bent line `chain(1.5, θ)` holds up to θ* = 52.3717420825° (ball 1 at
  capacity, the 1–2 contact on its cone edge); its release begins at θ_slip = 52.1888955°, and between the two
  both answers are consistent and holding first decides. The sweep straddles θ*, deciding as θ* does outside a
  band in radians of at least ten times `HOLD_SLACK`'s effect. The wedge family (rollingDecel varied) holds above
  rollingDecel* = 1.1234083693595 (μr* = 0.11455577280310); its sweep straddles that. Neither sweep may raise
  `approximate-hold`, `approximate-slip` or `budget-hold`. Tests assert decisions and feasibility, not certificate
  forces. The P1 release-fragility test is reworked to assert robustness, not unchanged arithmetic.
- **Cross-check:** every scenario in the standard world, friction on, within 1 mm of brute force (§3). Scenarios
  stay outside the static/kinetic overlap bands, where brute force releases at the band's bottom. New scenarios:
  a ball pushed along or rubbing against an upright; one that reaches a `stick` event or a slip onset; a ball with
  topspin rebounding off an upright, checking, then rolling forward through the hoop or into the peg (real play;
  the event sequence is asserted too).
- **Brute-force limit checks** (slow; skipped unless the environment variable `SLOW_TESTS` is set, via
  `it.skipIf`): brute force confirms release onsets (θ_slip,
  β_slip) to about 0.001°. "Held" is a_eff = 4·(d(H) − 2·d(H/2))/H² < 1e-5 m/s² (a displacement threshold misreads
  the creep from restitution chatter, which is first order in dt); the onset comes from a linear fit of a_eff past
  the decision, with H ≥ 0.25 s and extrapolation over dt 4e-6, 2e-6 and 1e-6.
- **Clusters:** a seeded property test over random clusters of up to four balls with court-realistic obstacles (the
  peg, or one hoop; no ball touches both uprights), velocities glued as the engine glues them: no
  `approximate-hold`, `approximate-slip` or `budget-hold`, and the search never reaches `MODE_SEARCH_LIMIT`.
- **No approximation:** `fuzz.test.ts` and the cross-check's wedge assertion forbid `approximate-slip` and
  `budget-hold` as well as `approximate-hold`. Fuzz and cross-check generators glue velocities.
- **Performance measurement** (last task): port the prototype's realistic shot-mix generator
  (`prototype/speed/shots.ts`) to `scripts/shotMix.ts`, re-run it with friction on, and record groups per shot,
  chatter counts and solver and engine time per shot in the roadmap's "P2a.2 outcomes carried forward", for P5.

## 7. Process and prototype record

The prototype (scratch worktree, not merged) validated this design, except three parts it never ran: balls in
flight and lift-off inside the friction model, the hold-first candidates and proposal built from P2a.1's guide (it
used a cone guide), and the exact-operation elementary functions. It validated: the closed forms above, derived independently
and confirmed by the solver to within `HOLD_SLACK`; brute force confirming the release onsets; 20,000 random
four-ball clusters solved with none unsolved (cap measurement above); realistic play (3,000 shots: 97% call no
solve; every group two balls, one candidate, with the cone guide) within the performance budget at p99.9 with about three times
headroom. Its optimisations are kept: factor reuse, sparse assembly and elimination, value-only line searches in the
barrier solve, and no condition-number diagnostics. An eight-start fan of extra Newton starts decided nothing in
12,500 groups and is dropped. Release at a limit of holding is well conditioned (accepted Jacobians: entries ≤ 1.5,
condition ≤ 8e3), which removes P1's ill-conditioning (planar entries of order 1e15). An Opus physics review
covered the design and the prototype.

Remaining: plan pre-flight executed literally; subagent-driven development with per-task reviews (Opus for physics)
and an Opus whole-branch review with probes. On completion: roadmap P2 row "P2a.2 (met)" and a "P2a.2 outcomes
carried forward" section.

## 8. In scope beside the solver

- `boundedGroupEnd` recomputes per track (`findNextEvent` calls it for every live track, so a group's end is
  computed once per member); the plan computes it once per group.
- The brute-force changes of §3.
