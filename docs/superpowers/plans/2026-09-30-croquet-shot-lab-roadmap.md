# Croquet Shot Lab — Implementation Roadmap

**Spec:** `docs/superpowers/specs/2026-09-30-croquet-shot-lab-design.md`

The spec is delivered as five sequenced plans. Each plan produces working, tested software on its own and is
written only once its predecessor has landed, so it can build on real interfaces and sourced reference data
rather than guessed ones.

| Plan | Delivers | Exit criteria |
|---|---|---|
| **P1 — Foundations and free-motion engine** (`2026-09-30-p1-free-motion-engine.md`) | Repo scaffold and CI; sourced reference data for ball, court, Laws, lawn speed and free-motion friction/restitution; deterministic event-driven phase-2 engine (sliding → rolling → stationary, ball–ball, uprights, peg, halt margin); out-of-court and hoop-passage events; hoop-run verdict; `ShotResult` sampling | Analytic cases pass (5/7 rule, head-on exchange, stop distances); energy/momentum invariants; mirror symmetry; determinism; event solver agrees with brute-force integration within 1 mm (the angled three-ball wedge push is cross-checked with ball–ball friction off, because pushing contacts are frictionless) |
| **P2 — Impact phase and swing model** | **P2a.1 (lands first):** lift in free motion — airborne phase, landing event, 3D ball–ball contact normals, 3D impulse friction with impulsive turf friction, resting contact extended to airborne balls (3D normals, gravity; still frictionless), lift-aware hoop passage, out-of-court and halt, jump flag; sourced ball–turf restitution and crown clearance. **P2a.2:** Coulomb friction (3D, load-coupled) on coupled (pushing) contacts in `push.ts`, with stick/slip events and static friction in held clusters. **P2b:** reference data for coaching ratios, mallets, stance/drive defaults, face and turf contact; compliant small-step N-body impact integrator (mallet rigid body, balls, turf) driven by a force profile; swing model `ShotSetup → ContactState`; `simulateShot(setup)` wiring phase 1 into P1's phase 2 | P2a.1 (met): landing and above-equator strike analytic cases; bouncing balls settle; brute-force cross-check (now 3D) agrees within 1 mm including hopping scenarios. P2a.2: generalised topspin-push closed form; angled wedge cross-check runs in the standard world (friction-off override removed) and agrees with brute force within 1 mm; no fallbacks (`approximate-hold`, `approximate-slip` or `budget-hold`) in limit-of-holding sweeps with friction on. P2b: standard stroke ratios within tolerance of sourced figures; stop → pass-roll monotonic; pull emerges on wide rolls without special-casing; stop-shot lift emerges (striker's ball clear of the turf during the transfer, meeting the croqueted ball just above its equator, no jump flag) |
| **P3 — Profiles and calibration** | Profile type and default "typical club player" profile; median-of-attempts input; optimiser fitting drive profile per stroke type; plausibility bounds and rejection | Round trip recovers fitted parameters within ±5 % and distances within ±2 %; out-of-bounds fits rejected |
| **P4 — Planner, renderer and share links** | Svelte planner (placement with snap-back, nudge, croquet-stroke snap-into-contact, stroke controls, target hoop, lawn speed), Canvas 2D renderer, compare ghost overlay, honesty note, versioned fragment link format with migration and notices, wrapped local storage for profiles | Playwright suites at tablet/desktop/phone viewports in Chromium, WebKit, Firefox; link round-trips reproduce results |
| **P5 — Delivery and budgets** | GitHub Pages deploy workflow; performance budget in CI (Chromium CPU throttle calibrated once against the reference iPad), including the cost of contact chatter (P2a.2's prototype measured a cannon with 864 resting-contact re-solves near the budget; P2a.2 re-measures it with friction on); bundle-size budget; cross-engine determinism test | All budgets enforced in CI; site live |

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
