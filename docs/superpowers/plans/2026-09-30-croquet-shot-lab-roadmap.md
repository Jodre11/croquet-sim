# Croquet Shot Lab — Implementation Roadmap

**Spec:** `docs/superpowers/specs/2026-09-30-croquet-shot-lab-design.md`

The spec is delivered as five sequenced plans. Each plan produces working, tested software on its own and is
written only once its predecessor has landed, so it can build on real interfaces and sourced reference data
rather than guessed ones.

| Plan | Delivers | Exit criteria |
|---|---|---|
| **P1 — Foundations and free-motion engine** (`2026-09-30-p1-free-motion-engine.md`) | Repo scaffold and CI; sourced reference data for ball, court, Laws, lawn speed and free-motion friction/restitution; deterministic event-driven phase-2 engine (sliding → rolling → stationary, ball–ball, uprights, peg, halt margin); out-of-court and hoop-passage events; hoop-run verdict; `ShotResult` sampling | Analytic cases pass (5/7 rule, head-on exchange, stop distances); energy/momentum invariants; mirror symmetry; determinism; event solver agrees with brute-force integration within 1 mm (the angled three-ball wedge push is cross-checked with ball–ball friction off, because pushing contacts are frictionless) |
| **P2 — Impact phase and swing model** | **P2a.1 (lands first):** lift in free motion — airborne phase, landing event, 3D ball–ball contact normals, 3D impulse friction with impulsive turf friction, resting contact extended to airborne balls (3D normals, gravity; still frictionless), lift-aware hoop passage, out-of-court and halt, jump flag; sourced ball–turf restitution and crown clearance. **P2a.2:** Coulomb friction (3D, load-coupled) on coupled (pushing) contacts in `push.ts`, with stick/slip events and static friction in held clusters. **P2b.1** (`specs/2026-10-03-p2b1-impact-integrator-design.md`): reference data for face and turf contact and a typical mallet head; compliant small-step N-body impact integrator (mallet rigid body, balls, turf) driven by a force profile, tested with hand-built `ContactState`s; turf restitution and stiffness moved into `SurfaceProps`. **P2b.2:** reference data for coaching ratios and stance/drive defaults; swing model `ShotSetup → ContactState`; `simulateShot(setup)` wiring phase 1 into P1's phase 2. Three- and four-ball cannons, including near a hoop or the peg, are deferred beyond P2b but required in the final implementation | P2a.1 (met): landing and above-equator strike analytic cases; bouncing balls settle; brute-force cross-check (now 3D) agrees within 1 mm including hopping scenarios. P2a.2 (met): generalised topspin-push closed form; angled wedge cross-check runs in the standard world (friction-off override removed) and agrees with brute force within 1 mm; no fallbacks (`approximate-hold`, `approximate-slip` or `budget-hold`) in limit-of-holding sweeps with friction on. P2b.1 (met): analytic contact, restitution, sticking and 5/7-roll cases through a real impact; invariants; `dt` convergence; handover accepted by phase 2; phase 2 bit-identical after the `SurfaceProps` move; stop-shot probe and stiffness sensitivity recorded. P2b.2: standard stroke ratios within tolerance of sourced figures; stop → pass-roll monotonic; pull emerges on wide rolls without special-casing; stop-shot lift emerges (striker's ball clear of the turf during the transfer, meeting the croqueted ball just above its equator, no jump flag) |
| **P3 — Profiles and calibration** | Profile type and default "typical club player" profile; median-of-attempts input; optimiser fitting drive profile per stroke type; plausibility bounds and rejection | Round trip recovers fitted parameters within ±5 % and distances within ±2 %; out-of-bounds fits rejected |
| **P4 — Planner, renderer and share links** | Svelte planner (placement with snap-back, nudge, croquet-stroke snap-into-contact, stroke controls, target hoop, lawn speed), Canvas 2D renderer, compare ghost overlay, honesty note, versioned fragment link format with migration and notices, wrapped local storage for profiles | Playwright suites at tablet/desktop/phone viewports in Chromium, WebKit, Firefox; link round-trips reproduce results |
| **P5 — Delivery and budgets** | GitHub Pages deploy workflow; performance budget in CI (Chromium CPU throttle calibrated once against the reference iPad), including the cost of contact chatter (with friction on, P2a.2's realistic shot mix makes at most 404 resting-contact re-solves in a shot, and three-ball pushes up to 745 and about 75 ms of engine time on an Apple M4, which the work budget does not see; four-ball pushes end in `budget-hold`; see the P2a.2 outcomes); bundle-size budget; cross-engine determinism test | All budgets enforced in CI; site live |

## P1 outcomes carried forward

What P1 delivered, and the constraints it leaves for P2–P5.

- **New module and event fields.** `src/engine/push.ts` solves resting contact (Gauss's principle of least
  constraint). Contact events carry a `resting` flag; a new `approximate-hold` event (with an excess figure) is
  emitted if the exact resting-contact solve fails and the resting balls are held instead. It has been observed
  only at the limits of holding, and its error is not bounded in principle.
- **Frictionless pushing.** Pushing contacts carry no friction. Measured size: 23 mm on the standard-world angled
  wedge push, up to about 110 mm for adversarial sidespin pushes; straight pushes are exact in P1's in-plane friction
  model. P2 stroke-ratio and
  pull tests are the first place this can bite. **Decided:** P2a.2 adds 3D Coulomb friction on coupled contacts,
  with stick/slip events, before any P2b work depends on pushing. In 3D even straight pushes rub: a rolling pair's contact points slip vertically
  relative to each other at twice their common speed along the line of centres.
- **Hoop-run verdict is separate.** `judgeHoopRun` is its own call, not part of `ShotResult`; P4/P5 must compose it
  with the result.
- **Laws 20.2.2 and 20.4.1 are not modelled.** Completing a run in a later stroke, and entering from the wrong
  side, need per-ball history; P1 judges position thresholds only.
- **Halted balls can rest overlapping.** Any replacement or continue-from-rest flow must de-overlap positions
  before re-simulating, otherwise `simulateFreeMotion` throws `RangeError`.
- **P2 hand-off contract.** P1's `simulateFreeMotion` rejects any ball with |z − R| or |vz| above 1e-9 (m, m/s).
  **Superseded by P2a.1:** phase 2 accepts airborne balls (z ≥ R), so P2b hands lifted balls over as they are.
- **P4 needs.** Export `obstaclesOf`, `uprightsOf`, `hoopHalfSpan` and `validateWorld` from `index.ts` (obstacle
  geometry for placement validation and drawing; world validation for lawn-speed input); clamp lawn speed to the
  reference bounds [6, 14] s; treat `ShotResult.rest` as not-at-rest when `aborted` is true (documented on the
  field).

## P2a.1 outcomes carried forward

- **Every roquet hops the striker.** A rolling ball's contact point moves down at its speed, so ball–ball friction
  lifts it a fraction of a millimetre (head-on rush in the test world: 0.3 mm at 2 m/s, 0.8 mm at 3 m/s). It lands
  within a couple of centimetres and bounces down to the settle speed (1 mm/s) in seven or eight landing events. P2b's
  stroke ratios include this.
- **Pushes stay frictionless until P2a.2.** In 3D every push rubs, so every brute-force scenario with a push runs with
  ball–ball friction 0 (`FRICTIONLESS` in `crossCheck.test.ts`). P2a.2 removes those overrides.
- **Release-solve fragility.** P1's `releaseDirections` is ill-conditioned at a limit of holding (planar entries of
  order 1e15 swamp the along-motion curvature), and P1's 44.3°–44.7° test passes only because the arithmetic is
  unchanged. P2a.1 kept that arithmetic exactly for balls on the turf. P2a.2's residual-merit Newton should remove the
  fragility, not preserve it.
- **Ball–turf restitution is weakly sourced** (0.5, bounds 0.15–0.51, constant; real turf restitution falls with impact
  speed). Revisit when jump shots are in scope.
- **Event count of a ball sliding over another in flight** is around a thousand events (frozen normals). Fine for
  flagged jumps; P5's performance budget should include one such shot.
- **Horizon of a ball moving across another's exact top.** Its contact normal is vertical and its push acceleration
  zero, so the push has no landing time. `simulate.ts` bounds the group's horizon by the first coupling opening
  (`boundedGroupEnd`), padded by `HORIZON_PADDING` so the separation root lies strictly inside the next search.
- **Spec clarifications made in P2a.1:** the crown flag is court-wide; restitution is exact for the contact impulse
  itself (before turf friction) only for frictionless or horizontal-normal contacts, and turf friction on a supported
  ball can lower the effective restitution further (see spec §5 limitations).

## P2a.2 outcomes carried forward

- **Push friction.** Coupled contacts carry 3D, load-coupled Coulomb friction with `stick`/`slip` events; held
  clusters hold through static friction; a turf ball whose load friction takes away is solved airborne. A coupled
  contact closes at the curvature rate |v_t|²/d of its turning line of centres, and every re-solve projects the
  group's resting contacts back to zero gap. Fallbacks are `approximate-hold`, `approximate-slip` and `budget-hold`;
  none occurs in the limit-of-holding sweeps, the clusters or the fuzz. `ENGINE_VERSION` 0.3.0.
- **Work budget.** `SOLVE_BUDGET` is 22,000,000 work units per shot, fixed from the prototype's 1.50e-6 ms per unit
  (Apple M4) for 33 ms on the development machine, and kept at that value (decided 2026-10-02). The shot mix never
  reaches it: its worst shot spends 408,030 units (1.9%). Nor do three-ball pushes: a push into a touching pair bent
  0°–90° off the line needs at most 8.5 million units (bent 10°), 5.9 million in one solve, so the budget has 2.6×
  headroom; the cross-check's 60° line spends 1.5 million (7%). Four-ball pushes end in `budget-hold`: every zigzag
  tried but 50° (12 of the 152 pushes swept) needs 81–289 million units unbudgeted. Random four-ball clusters, solved
  unbudgeted in the cluster test, need up to 1.06 billion (144 of 20,000 over the budget). That is accepted for P2a.2
  and carried to P5. The budget is checked between candidates, so the solve that crosses it overshoots, by up to 1.2×.
  The engine's large solves cost 1.7–3.1e-6 ms per unit; the shot mix's small ones cost 2.4e-5 (937 units and 22 µs
  per solve, mostly overhead). The prototype's realistic worst of 3.5 million came from two-ball groups only.
- **Measured realistic play (friction on).** 3,000 shots, seed 7, Apple M4, Node v26.10.0: 97.7% of shots have no
  resting-contact solve; the largest group is 2 balls. Solves per shot: p50 0, p99 148, p99.9 339, max 404. Work
  units per shot: p50 0, p99 143,084, p99.9 362,050, max 408,030. Solver time per shot: p50 0, p99 3.2 ms, p99.9
  6.8 ms, max 7.5 ms. Engine time per shot: p50 0.23 ms, p99 9.6 ms, p99.9 20.3 ms, max 24.1 ms. The worst shot is a
  push with 381 solves, 362,050 units, solver 7.5 ms and engine 24.1 ms. Times vary by about 10% between runs. The
  shot mix forms no three- or four-ball groups, so it does not measure the pushes above. The iPad factor of 3× is
  unverified; P5 calibrates it.
- **For P5.** Stick/slip chatter is deferred here. Each regroup of a rubbing pair reports a stick/slip pair, plus a
  slip of a few nanoseconds that sticks again at once. A ball sliding over another's exact top makes 260–336 events
  with friction against 135–193 without. The shot mix's worst shot makes 404 solves. Four-ball pushes end in
  `budget-hold` (above). The design's deferred items: finite turf pivot grip (the per-ball capacity hook), surface
  variation (the turf-normal and gravity hooks), and Rust/WASM only if the budget proves too tight.
- **Re-solve volume (for P5).** Three-ball pushes now cost time mainly through re-solve volume, which the work budget
  does not count: a push into a pair bent 10° at spin 80 spends 7.4 million units, but about 75 ms of engine time
  over 745 solves on an Apple M4. The budget bounds the search, not the number of segments; P5's time budget must
  cover both.
- **Frozen directions.** A segment ends once a frozen slip or push direction would turn by more than
  `DIRECTION_TOLERANCE` (sine 1e-2). That is the remaining cross-check error: wedge 0.527 mm, upright 0.780 mm and
  bent line 0.276 mm against brute force (tolerance 1 mm). A tighter tolerance means more segments (at 1e-3 all
  three fall under 0.3 mm: 0.283, 0.250 and 0.049).
- **Fuzz coverage.** The fuzz presses every fourth shot into resting contact and asserts that solves happen. It
  exercises no stick/slip mode changes. The sweeps and cross-checks cover those.
- **Missed lift-off.** When a three-ball group's on-turf direction solve fails (ball–ball μ ≥ about 4.25), the lift-off
  candidate derived from it is never generated, and the group falls back to `approximate-hold`. Real μ is far lower.
- **Uncounted guide iterations (for P5).** The frictionless guide that proposes each group's first candidate
  (`modeSolve.ts`, up to `GUIDE_ITERATIONS` = 5,000 per solve) is not counted in work units. A spent budget holds the
  group before the guide runs, so the guide cannot run unbounded, but its cost is invisible to `SOLVE_BUDGET`.
  Counting it would change every work-unit figure above and force `SOLVE_BUDGET` to be calibrated again; P5's time
  budget measures it in the meantime.
- **Empty `budget-hold` event (for P5).** `simulate.ts` builds a `budget-hold` event's `balls` from the group's resting
  members, so a held group whose members are all moving raises the event with `balls: []`.
- **Untested helpers (for P5).** `muS`, `rollCap`, `vectorValue` and `vectorLinear` have no direct tests; they are
  covered only through the solvers that call them.
- **Latent edge cases (for P5).** Deferred from P2a.2's final review because no measured shot reaches them and a late
  engine change would need the figures validated again: `projectContacts` skips the whole move when the second
  `solveSystem` returns null; phase 1 of `convexSolve` runs its full t schedule in the near-meeting band (correct,
  but up to 36× the units); a stick event can follow a fallback in `simulate.ts`; a same-instant regroup loop is
  bounded only by `DEFAULT_MAX_EVENTS`, so the worst case is a shot cut off at the event limit.

## P2b.1 outcomes carried forward

- **Impact engine.** `simulateImpact` (phase 1): clamped linear spring–dashpot contacts, damping solved from the
  sourced restitution, Cundall–Strack friction, semi-implicit Euler at `IMPACT_DT` = 5e-6 s, mallet head driven by a
  socket force. `ENGINE_VERSION` 0.4.0. Turf stiffness and restitution live in `SurfaceProps`; phase 2 bit-identical
  (shot mix p99 143,084, p99.9 362,050, max 408,030 work units). Two changes landed in the real run beyond pre-flight:
  the handover repeats its separation pass so a chain of three balls ends clear, and validation rejects head–ball
  penetration anywhere on the head cylinder (spec, "Amended 2026-10-03 (real run)").
- **Stiffness sensitivity (for P2b.2).** Each stiffness swept across its reference bounds on the default world
  (`scripts/impactProbe.ts`). For single-ball strokes the hard pairs barely matter and the turf moves lift most. Centre
  3 m/s: blue 3.7401–3.7411 m/s across every sweep, topspin ωy 0.57–0.64 rad/s. Descending 10°: the turf bounds move
  the handover most (blue vx 3.1954–3.2088, vz 0.3241–0.3342 m/s; impact 7.7 ms at 1.0e5 N/m, 5.0 ms at 2.7e5); the
  face bounds move vz 0.3225–0.3299 (reference 0.3251). The hard pairs dominate the croquet split, which is where
  P2b.2 must pin them: blue 0.92–2.29 m/s across the face contact-time bounds (0.60 and 1.20 ms) and 1.12–2.29 m/s
  across the ball–ball bounds (0.87 and 0.50 ms), red 3.37–3.63 m/s, against 1.41 and 3.63 at the reference. The
  stop shot behaves alike (blue 0.86–2.19, red 3.26–3.53 m/s; reference 1.34 and 3.53), and turf stiffness leaves
  both split strokes unmoved (blue within 0.006 m/s). At the 0.60 ms face bound the croquet stroke raises
  `impact-head-approaching`. It is a genuine imminent re-contact, correctly flagged per spec §5: after the transfer
  the head moves at 0.958 m/s and blue at 0.921 m/s, with 0.029 mm between face and blue. At the 0.8 ms reference the
  head is at 0.702 m/s and blue at 1.409, so there is no flag. Whether a croquet stroke's re-contact should be
  integrated rather than flagged is P2b.2's decision.
- **Stop-shot probe (for P2b.2).** With 3° of descent and a 3 ms, 100 N checking drive, blue is not clear of the turf
  while it transfers: its z − R runs −0.065 to −0.040 mm (in its hollow), so 0.0 % of the impulse is delivered clear.
  The contact height on red averages −0.008 mm, at its equator, not above. No flags were raised and the stroke ran its
  full 3.0 ms (600 steps). The formal stop-shot-lift criterion is P2b.2's, with its drive profile.
- **Impact engine time (for P5).** Apple M4, Node 26.10.0, 200 runs after 20 warm-up. Centre 3 m/s: 600 steps, median
  0.30 ms, p99 1.33 ms. Croquet 3 m/s: 600 steps, median 0.61 ms, p99 1.67 ms. Descending 10°: 1,480 steps, median
  0.66 ms, p99 1.54 ms. Stop shot: 600 steps, median 0.46 ms, p99 0.48 ms. The p99 figures are noisy at 200 runs.
- **Sourcing notes.** Turf stiffness is derived from one court's video (Gugan), from the peak penetration with the
  model's damping (1.1e5 N/m); the undamped energy balance and Gugan's timing favour up to 2.7e5. Face friction is an
  estimate (0.5). One round wooden head only; other faces, weightings and square heads are P2b.2's.
- **Energy invariant (for P2b.2/P5).** Task 8's energy check mixes time levels and is biased by about 0.6% of an
  undamped contact's energy, masked by dissipation. An invariant on the integrator's shadow energy ½k·δₙ₋₁·δₙ, with
  contact onset and release handled, would make a rounding-level tolerance meaningful. **Done before P2b.2**
  (`shadowEnergy.test.ts`): on undamped, frictionless, central contacts the shadow energy less the exact onset and
  release jumps holds to 2.5e-13 of the kinetic energy. Rotation, damping and friction have no exact shadow energy, so
  the time-level-mixed check stays for the general case.
- **Obstacles in the impact (for P2b.2).** Ball–upright and ball–peg contact is not modelled in the impact, and a ball
  can end the impact overlapping an upright or the peg (or be moved into one by the handover's separation), which
  phase 2 rejects; validation rejects only a ball touching an obstacle at t = 0.
- **Housekeeping (for P2b.2). Done before P2b.2**, with no accepted result changed (`scripts/impactDigest.ts`
  byte-identical):
  - A face touching a ball with an upward-tilted normal starts compressed by sink·n_z after the static sink, because
    validation checks balls at z = R and `prepareImpact` then lowers them (measured: head at rest, pitch −0.05 gives
    δ 1.1e-6 m, the ball launched at 2 mm/s, no flag). Now validated against the sunk positions, so it is rejected.
  - The `simulateImpact` rejection tests asserted only the RangeError type; each now names the check that must fire.
  - Running out of `HANDOVER_PASSES` was silent; `handover` now throws an Error naming the pair.
  - `integrate()`'s step is split into helpers (`pairForces`, `advance`, `turfStatus`, `finish`), bit-identical by the
    digest. `driveAt`'s linear rescan is left for P2b.2, if the swing model's drive tables are long.
- **Not used yet.** `simulateImpact` is not exported from `src/engine/index.ts`; P2b.2's `simulateShot` wires and
  exports it.

## Provisional numbers — where each is confirmed

| Spec number | Confirmed in | How |
|---|---|---|
| Safari / iPadOS 16+ floor, last two majors of Chrome/Edge/Firefox | P1 Task 1 | Explicit Vite `build.target`; revisited in P4 when Playwright WebKit runs |
| 1 mm cross-engine rest-position agreement | P1 (design), P5 (test) | P1 restricts engine code to IEEE-exact operations (`+ − × ÷ √`), enforced by lint, which should make results bit-identical across engines; P5's cross-engine test measures it |
| ±15 % stroke-ratio tolerance | P2 | Set from the spread of the sourced coaching ratios |
| ±5 % / ±2 % calibration round trip | P3 | Round-trip test |
| ≤ 2,000-character links | P4 | Measured on worst-case setup plus profile |
| ≤ 200 ms simulation, ≤ 250 KB gzipped | P5 | Throttled CI measurement and bundle report |

## Decisions deferred to the relevant plan

- **Reference data sourced in P2a.1** — ball–turf restitution, hoop-crown height.
- **Reference data sourced in P2b** — coaching ratios, mallet values, stance and drive defaults, face-material
  friction/restitution, turf compliance.
