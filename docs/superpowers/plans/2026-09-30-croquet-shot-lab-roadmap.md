# Croquet Shot Lab — Implementation Roadmap

**Spec:** `docs/superpowers/specs/2026-09-30-croquet-shot-lab-design.md`

The spec is delivered as five sequenced plans. Each plan produces working, tested software on its own and is
written only once its predecessor has landed, so it can build on real interfaces and sourced reference data
rather than guessed ones.

| Plan | Delivers | Exit criteria |
|---|---|---|
| **P1 — Foundations and free-motion engine** (`2026-09-30-p1-free-motion-engine.md`) | Repo scaffold and CI; sourced reference data for ball, court, Laws, lawn speed and free-motion friction/restitution; deterministic event-driven phase-2 engine (sliding → rolling → stationary, ball–ball, uprights, peg, halt margin); out-of-court and hoop-passage events; hoop-run verdict; `ShotResult` sampling | Analytic cases pass (5/7 rule, head-on exchange, stop distances); energy/momentum invariants; mirror symmetry; determinism; event solver agrees with brute-force integration within 1 mm (the angled three-ball wedge push is cross-checked with ball–ball friction off, because pushing contacts are frictionless) |
| **P2 — Impact phase and swing model** | **P2a.1 (lands first):** lift in free motion — airborne phase, landing event, 3D ball–ball contact normals, 3D impulse friction with impulsive turf friction, resting contact extended to airborne balls (3D normals, gravity; still frictionless), lift-aware hoop passage, out-of-court and halt, jump flag; sourced ball–turf restitution and crown clearance. **P2a.2:** Coulomb friction (3D, load-coupled) on coupled (pushing) contacts in `push.ts`, with stick/slip events and static friction in held clusters. **P2b.1** (`specs/2026-10-03-p2b1-impact-integrator-design.md`): reference data for face and turf contact and a typical mallet head; compliant small-step N-body impact integrator (mallet rigid body, balls, turf) driven by a force profile, tested with hand-built `ContactState`s; turf restitution and stiffness moved into `SurfaceProps`. **P2b.2** is split (decided 2026-10-04; see "P2b.2 decisions"). **P2b.2a** (`specs/2026-10-04-p2b2a-obstacles-faults-design.md`): ball–upright and ball–peg contact in the impact, a contact timeline, and a fault judge for the Laws' mallet faults (crushes, multiple contacts). **P2b.2b** is split (decided 2026-10-04). **P2b.2b.1** (`specs/2026-10-04-p2b2b1-swing-shot-design.md`): tracked drive as two arcs, the pendulum and the hands' path through space with its dip, each timed (and mistimable) by the player, two hands on a rigid shaft, in swing mode (single-ball, drive, stops) or carry mode (rolls), tracking the path's velocity from contact, the bottom hand releasing by reach; the whole head meeting the balls as a solid cylinder, with a re-entry guard; the GC stop a single-ball stroke over a gap to its target; mallet–turf contact, a lawn struck before the ball emerging from an early action; swing model `ShotSetup → ContactState` with provisional defaults, `simulateShot(setup)` wiring phase 1 into P1's phase 2, exported with the fault judge; 29.1.13's "plays away from" and 29.1.14 judged. **P2b.2b.2:** the whole stroke shape, the backswing from its top, the lead-in and the follow-through, with its amplitude, modelled and calibrated per shot type and complete enough for P2b.2b.3 (the head's and the shaft's poses along the whole swing); reference data for coaching ratios and the swing inputs' defaults; contact-time fit; the hand coupling's T and ζ, the arm mass, the reach slack and the grips fitted to the ratios; the low-speed face–ball law; the turf's response under load; the steep rolls' calibration (the full and pass rolls are P2b.2b.1's known misses); the GC stop's distances after the touch; ratio calibration and held-out validation; crush calibration; 29.1.6.3. **P2b.2b.3** (decided 2026-10-06; first placed before P2b.2b.2 as P2b.2b.1b, then moved after it by the user: "first we must model the stroke shape and amplitude and calibrate to the different shot types, but we will need the model to be complete enough for the rest later"): the whole swing. The mallet is carried along the swing path P2b.2b.2 calibrates, the backswing from its top, the lead-in and the follow-through after the impact ends, and its head and its shaft (rigid on the head, from the socket to the top hand) are swept against every ball, the hoops' uprights and crowns, and the peg: in a real game they may lie in the swing's path and limit the playable stroke, and the crown stops the shaft when the head reaches through an open hoop (limiting the follow-through's arc) or is swung back through the jaws. Head–obstacle and shaft contact are new physics. On any crossing the impact integrator re-opens, so a ball that comes back into the follow-through's arc (stopped by a target, rebounding off a hoop or the peg, or pulling up short), another ball, a hoop or the peg is met within an integrated impact and the fault judge rules on it (29.1.6.1, 29.1.6.2, 29.1.11, 29.1.10; Law 29.3.2 lets the opponent leave the balls where they lie after the first stroke in error, so the re-hit's physics matters). P2b.2b.1 only counts the follow-through's crossings. Deferred beyond P2b but required in the final implementation: three- and four-ball cannons, including near a hoop or the peg; 29.1.10 by a part of the body (the mallet's part is P2b.2b.3's); variability of swing and aim (accuracy), and conditions such as wind, under which a hoop could block a shot or a glancing blow redirect it or limit its power; divots and lasting turf damage; a fully articulated body (shoulder, elbow and wrist) beyond P2b.2b.1's translating pivot, with the bottom hand's position as the input from which the shaft's lean and the push–swing balance follow; the Golf Croquet Rules' faults and remedies, in a GC-rules phase (until then a GC stroke is judged as an AC single-ball stroke) | P2a.1 (met): landing and above-equator strike analytic cases; bouncing balls settle; brute-force cross-check (now 3D) agrees within 1 mm including hopping scenarios. P2a.2 (met): generalised topspin-push closed form; angled wedge cross-check runs in the standard world (friction-off override removed) and agrees with brute force within 1 mm; no fallbacks (`approximate-hold`, `approximate-slip` or `budget-hold`) in limit-of-holding sweeps with friction on. P2b.1 (met): analytic contact, restitution, sticking and 5/7-roll cases through a real impact; invariants; `dt` convergence; handover accepted by phase 2; phase 2 bit-identical after the `SurfaceProps` move; stop-shot probe and stiffness sensitivity recorded. P2b.2a (met): obstacle analytic cases (contact time, restitution, stick and slip, the peg's own material); P2b.1 bit-identical without obstacles in reach (digest, shot mix, slow tests); no obstacle overlap handed to phase 2 (obstacle fuzz); fault table and the C29.20.4 sequences; crush geometry, with the crush distance recorded. P2b.2b.1 (met): tracked-drive, head–turf, head–ball and swing-model analytic cases; force-table drives bit-identical to P2b.2a; the swung body's effective mass at the face centre within 10 % of the head's mass on the drive's canonical setup, and measured by the strike; every default preset's canonical setup runs end to end with no re-entry guard hit and no ball centre more than 5 mm above R, its ratios recorded against the coaching ranges, the GC stop's distances after the touch over the gap, and the late re-hit's crossings. P2b.2b.2: the stroke shape (backswing, lead-in, follow-through and amplitude) calibrated per shot type; standard stroke ratios within tolerance of sourced figures (stop shot and drive are calibration targets, the rolls held-out validation; see "P2b.2 decisions"); stop → pass-roll monotonic; pull emerges on wide rolls without special-casing; stop-shot lift emerges in the AC stop (striker's ball clear of the turf during the transfer, meeting the croqueted ball just above its equator, no jump flag). P2b.2b.3: the head and the shaft are swept along the whole swing (backswing, lead-in and follow-through) against every ball, the uprights, the crowns and the peg; every crossing, including those the P2b.2b.1 probe counts, is integrated as a further contact within the impact and judged (29.1.6.1, 29.1.6.2, 29.1.11, 29.1.10); head–obstacle and shaft contact analytic cases; the crossing counts re-measured. |
| **P3 — Profiles and calibration** | Stored profile wrapping P2b.2b.1's physical `SwingProfile` (plus grip style, weighting and face; home-lawn speed, fitted parameter bounds, versioning; which drive fields are fitted is decided here, the stance (hands, grips and lean) and the body being entered), with the default "typical club player" profile from P2b.2b.2; median-of-attempts input; optimiser fitting drive profile per stroke type; plausibility bounds and rejection | Round trip recovers fitted parameters within ±5 % and distances within ±2 %; out-of-bounds fits rejected |
| **P4 — Planner, renderer and share links** | Svelte planner (placement with snap-back, nudge, croquet-stroke snap-into-contact, stroke controls in the player's order — shot type, balls, stance, hands, contact, then the rehearsed swing, its reach and its timing — target hoop, lawn speed; casting versus planted ways of setting up and rehearsing a shot, and how much of the set-up a weaker shot uses, decided here (user decisions 2026-10-05)), Canvas 2D renderer, compare ghost overlay, honesty note, versioned fragment link format with migration and notices, wrapped local storage for profiles | Playwright suites at tablet/desktop/phone viewports in Chromium, WebKit, Firefox; link round-trips reproduce results |
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
  - `integrate()`'s step is split into helpers (`applyPair`, `advance`, `trackTurf`, `finish`), bit-identical by the
    digest. `driveAt`'s linear rescan is left for P2b.2, if the swing model's drive tables are long.
- **Not used yet.** `simulateImpact` is not exported from `src/engine/index.ts`; P2b.2's `simulateShot` wires and
  exports it.

## P2b.2 decisions (2026-10-04)

**Feasibility spike** (throwaway sweep of whole shots on the default surface, open lawn, sourced head and face; not
kept). With every parameter inside its reference bounds and no impact flag raised, each stroke reaches its coaching
band. Targets: Croquet Association, "Project Croquet Dynamics" (2006, 8,000 frame/s video; croqueted ÷ striker's
distance): drive 3.0–4.0, half roll 1.4–2.5, full roll 1.0–1.2, pass roll 0.9–1.2, stop shot 4.1–6.2; Don Gugan,
"Croquet Drives, Pass-Rolls, Stop-Shots and Scatter-Shots" (oxfordcroquet.org/tech/gugan5/): drive 4.23 ± 0.2, stop
shot 7.15 ± 0.6 (up to 11.6), pass roll about 0.83 in theory.

- **Stop shot:** a rising strike (head rising 5–15°, face tilted up 3–5°, contact 20 mm below the face axis) gives
  7.8–9.5 at the reference contact times and 5.5–6.5 at the stiff bounds. Stop-shot lift emerges: 60–91% of the
  transfer impulse is delivered with the striker's ball clear of the turf, meeting the croqueted ball 0.02–0.08 mm
  above its equator. Level and descending strikes never lift it (0%): the turf's rebound takes about 5 ms, the
  transfer about 1 ms.
- **Drive:** a level coast gives 6.6 at the reference contact times, 4.6 at the stiff bounds (face 0.6 ms, ball–ball
  0.5 ms) and 3.2 at the soft (1.2, 0.87 ms). The hard-pair contact times decide it.
- **Rolls:** forward face pitch 20–45° with a sustained push of 10–40 ms gives 1.0–2.5. The Croquet Association
  measured mallet–ball contact of 30–58 ms on rolls (2.1–2.6 ms on drives and stop shots), which `IMPACT_CAP` (60 ms)
  barely covers.
- **Pass roll:** only as a split shot (straight, the striker's ball cannot pass the croqueted ball, so the ratio floors
  at 1.00); 0.26–0.82 at splits of 15° and more with a long push.
- **Pull** emerges: the croqueted ball turns 0.6–3.2° from the line of centres towards the swing, less with more
  forward pitch. Whether that trend matches play needs a sourced pull figure.
- **Geometry:** the head's radius (38 mm) is less than the ball's (46 mm), so any upward face tilt with the face centred
  on the ball puts the head in the turf (468 of 2,808 swept setups were rejected for it).
- **Double taps:** `impact-head-approaching` was raised on 451 of the 2,340 shots that ran. Gugan attributes about 90%
  of a drive's striker distance to a later impulse from a mallet held at near-constant speed.

**Decisions for P2b.2b.**

- **Drive model:** the hands track a swing path. The drive is a stiff spring–damper pulling the head towards the path
  the swing would follow; check, coast and push shape that path's speed through contact, so follow-through and
  re-contact emerge rather than being flagged.
- **Contact times:** P2b.2b fits the face–ball and ball–ball contact times once, inside their sourced bounds, so the
  default profile's stop shot and drive reach their ratios; they are recorded in `contact.json` as derived, world
  constants (product spec §7 keeps per-player fitting to the drive profile only).
- **No circular validation:** the stop shot and drive are calibration targets, and the spec says so. The half roll, full
  roll and pass roll ratios, the stop → pass-roll ordering, pull and stop-shot lift are held-out validation. Their swing
  defaults (stance, face pitch, drive window and force) are sourced independently, from coaching descriptions and the
  Croquet Association's mallet speeds and contact times, and are never tuned to the ratios.
- **Swing inputs:** P2b.2b defines the physical part of the profile (mallet, grip, stance and drive per stroke type)
  and its sourced default; `ShotSetup` carries it. P3 wraps it into the stored profile (home-lawn speed, fitted
  parameter bounds, versioning) and adds the optimiser. The P3 row is amended when P2b.2b's spec lands.
- **`IMPACT_CAP`** is raised from 60 ms, justified by the measured 30–58 ms roll contacts.
- **Fault judge inputs:** `simulateShot` builds P2b.2a's `StrokeContext` from the setup, deriving `group` with the
  Laws' group-of-balls definition. Two Laws deferred by P2b.2a become judgeable here: 29.1.13's "plays away from"
  (the swing direction) and, if a per-stroke-type contact-time norm is sourced (the Croquet Association's measured
  contact times are the candidate), 29.1.6.3.
- **P2b.2b.1 design (2026-10-04).** The hand coupling must leave the head effectively free in the ~1 ms strike: a
  5 ms period, critically damped, would draw about 4 kN of hand force in a 3 m/s strike, comparable to the face
  force. Its provisional period and damping are set by a criterion (hand impulse in the strike at most 5 % of the
  transfer); superseded on 2026-10-05 (the amendment below).
  - Two stop presets. The AC stop: feet back so the ball is met on the up, face tilted up, hands relaxed on contact
    so the head's base rubs the turf and cancels the follow-through. It is modelled as a check, a relaxed grip and a
    dip timed with the strike, so the head meets the turf and mallet–turf contact adds drag; a relaxed grip alone
    leaves the coasting hands restoring the follow-through. The GC stop: a hard, level shot with no follow-through,
    the lower hand checking the swing just after contact, so the striker's ball arrives without spin, like a stun in
    snooker. The stop-shot-lift criterion applies to the AC stop only.
  - The swing is two arcs (user's account, 2026-10-05): the pendulum, the mallet swinging between the hands, and the
    hands' path through space (lean, push, weight transfer, dip), each timed by the player. In a drive the top hand
    stays put and the pendulum does the work; in a roll the pendulum creeps and the hands carry the head, the face
    tilt held; in a pass roll the slow pendulum flicks forward during the push.
  - Mistiming any action (a dip, a check or a push too early, or too hard) can flatten the strike or put the lawn
    before the ball; the model simulates from the earliest early action. Mallet–turf contact makes 29.1.14 (court
    damage) judgeable as a possible fault.
- **P2b.2b.1 amendment (2026-10-05).** After the pre-flight (below), the model was rebuilt on the user's account of
  play and John Riches, *Croquet Technique* (Oxford Croquet,
  <http://www.oxfordcroquet.com/coach/riches/croqtech/index.asp>).
  - Two hands on a rigid shaft. The top hand is the pivot, `top` from the socket; the bottom hand is `bottom` from
    it; an arm mass rides at the top grip. Before contact the rigid path's wrench is split exactly over the hands.
    From contact they track the path's velocity only, the feed-forward scaled by each hand's grip and the dip fed
    forward in full. The bottom hand opens once the shaft has turned through its reach slack.
  - Two modes. Swing (single-ball, drive, stops): after its window the pendulum swings freely and the bottom hand
    is a one-sided rate guide, two-sided through a check. Carry (rolls, after Riches): the slope is held, the
    bottom hand grips two-sided, and the hands' path ends after `handReach`, descending so the head finishes
    `groundDepth` below the turf.
  - The whole head meets the balls as a solid cylinder, with a re-entry guard. The end rule looks 30 ms ahead;
    `TRACK_IMPACT_CAP` is 0.45 s, so that a drive's follow-through re-hits are integrated.
  - The coupling is held at T = 0.08 s and ζ = 0.7 (user decision). From contact the hands draw little in the
    strike at any period, so the 5 % criterion no longer selects T. Exit criterion 3 is instead the swung body's
    effective mass at the face centre along aim, within 10 % of the head's mass (prototype: 1.007 kg for the
    drive).
  - Presets (spec §5.4, provisional; arm mass 0.8 kg, reach slack 0.03 m). Single-ball: lean 0°, hands 0.805 and
    0.70 m from the socket, grips 1 and 0.1, swing. Drive: 0°, 0.805 and 0.60 m, grips 1 and 0.25, swing. AC stop:
    −4°, 0.805 and 0.45 m, grips 0.1 and 0.1, swing with a check and a dip of 11.00 mm over 20 ms. GC stop (a
    single-ball stroke, its target 0.3 m ahead): 0°, 0.805 and 0.45 m, grips 1 and 1, swing with a check. Half
    roll: 15°, 0.805 and 0.42 m, carry, hands' share 0.6, reach 0.15 m, 5 mm into the ground. Full roll: 45°, 0.61 and 0.30 m, carry, share 0.9, reach 0.30 m, 2 mm. Pass
    roll: 48°, 0.45 and 0.09 m, carry, share 0.85, a pendulum punch (`speedGain` 0.5 over 15 ms), reach 0.30 m,
    2 mm.
  - The full and pass rolls (lean 45° and 48°) are known misses in P2b.2b.1: both carry the striker's ball on a
    steep face, which needs the low-speed face–ball law and the turf's response under load (P2b.2b.2).
- **P2b.2b.1 pre-flight decisions (2026-10-06).** From the user's account of play.
  - The GC stop is a single-ball stroke, never a croquet stroke: the striker's ball crosses a gap to the target,
    about 0.3 m at best. Closer risks a double hit on the target; longer, the skid runs out and the striker's ball
    follows through; short grass and more power stretch the range. A standard single-ball shot hit full can stop as
    well. On the engine's turf a ball struck at 3 m/s skids about 0.47 m before it rolls, and phase 2 already
    models the sliding collision. Its canonical setup puts the target 0.3 m ahead, live; its outcome is the
    distances after the first touch and their ratio (target over striker), observations that P2b.2b.2
    calibrates, swept over gaps of 0.05–1 m against the single-ball preset. A GC stroke is judged as an AC
    single-ball stroke; the Golf Croquet Rules' faults and remedies go to a GC-rules phase.
  - The late re-hit, in every shot. Once the impact has ended, phase 2 moves the balls with no mallet in it, so a
    ball that comes back into the follow-through's arc is never checked, though Laws 29.1.6.1 and 29.1.6.2 make
    that a fault within the striking period, and Law 29.3.2 lets the opponent leave the balls where they lie after
    the first stroke in error. P2b.2b.1 records it as a known limit and counts the crossings; P2b.2b.3 integrates
    the second hit and judges it.
  - P2b.2b.3 is the whole swing (later the same day). In a real game hoops, the peg and other balls may lie in the
    swing's path and limit the playable stroke, and the head's and the shaft's path is known. So P2b.2b.3 sweeps
    the head and the shaft (rigid on the head, from the socket to the top hand) along the backswing from its top,
    the lead-in and the follow-through, against every ball, the hoops' uprights and crowns, and the peg. When the
    head reaches through an open hoop the shaft is often impeded by the crown, which
    limits the follow-through's arc; a head swung back through the jaws meets it in the backswing. Head–obstacle
    and shaft contact are new physics; any crossing re-opens the impact, and the judge rules on it under 29.1.6.1,
    29.1.6.2, 29.1.11 and 29.1.10, whose commentary C29.15.1 reads: "The main instances are hitting a hoop or the
    peg in the backswing when a ball is in contact with it and hitting a hoop or the peg on the forward swing when
    aiming to hit a ball resting on it." Variability of swing and aim, and conditions such as wind, are deferred
    beyond P2b (P2 row).
  - The phase order (later the same day). The sweep phase was first placed before P2b.2b.2's calibration as
    P2b.2b.1b; the user moved it after, as P2b.2b.3: "first we must model the stroke shape and amplitude and
    calibrate to the different shot types, but we will need the model to be complete enough for the rest later".
    So P2b.2b.2 models the whole stroke shape, the backswing from its top, the lead-in and the follow-through, with
    its amplitude, and calibrates it per shot type alongside its other calibration; its path model gives the
    head's and the shaft's poses along the whole swing, complete enough for P2b.2b.3 to sweep them.

## P2b.2a outcomes carried forward (for P2b.2b)

- **Crush distance.** The largest gap to an upright straight ahead that still raises 29.1.8, on the default world
  with the sourced head and face (`scripts/impactProbe.ts`), per head speed: 1 m/s 1.088 mm, 2 m/s 2.188 mm, 3 m/s
  3.261 mm, 4 m/s 4.365 mm, 6 m/s 6.549 mm. That is about 1.1 mm per m/s: within the commentary's (C29.13.1) 1–2 mm
  for a real chance of a crush from about 0.9 to 1.8 m/s, and beyond it above about 1.8 m/s. The impact's face
  contact (0.8 ms, a rigid linear face) is shorter than a real one, which the commentary says travels up to about
  1 cm in contact.
- **Open decision: crush calibration.** The judge flags 29.1.8 from about 1.1 mm per m/s of head speed, against the
  commentary's 1–2 mm (C29.13.1), so from about 1.8 m/s it will flag crushes a referee would likely allow. The
  commentary also says a real mallet stays on the ball for up to about 1 cm of travel, longer than the impact's
  0.8 ms rigid face contact, so the true figure may itself grow with speed. P2b.2b's design decides between
  calibrating the face contact, gating the crush distance in the spec, or making 29.1.8 a possible fault beyond some
  distance.
- **Face–ball gaps.** In the P2b.1 fuzz's single clean strikes: 978 strokes, 3 with more than one face interval;
  shortest gap 2990.0 µs; one-step gaps: 0. No gap is one step, so no minimum gap is applied (spec §5).
- **Cost of pairing every ball with every obstacle.** On the default world (12 uprights and the peg) it raised the
  impact's cost per step to 1.61–1.88× P2b.1's, so a reach filter skips a ball–obstacle pair while the ball cannot
  yet reach the obstacle (a per-pair travel budget, exact by construction; spec §4). With it, pre-flight measured
  µs/step against `main` side by side: centre 0.433 against 0.355 (1.22×), croquet 0.756 against 0.730 (1.04×),
  descending 0.405 against 0.304 (1.33×), stop shot 0.750 against 0.585 (1.28×).
- **Obstacle contact time.** `ballObstacleContactTime` is the ball–ball analogue (0.75 ms), bounded [0.435, 1.0] ms:
  the lower bound is the Hertzian rigid-flat case, and the upper bound the largest for which the obstacle fuzz keeps
  every obstacle penetration under 0.06·R with a margin (1.5 ms gave 0.081·R). Hoop setting stiffness varying hoop
  by hoop is open through each hoop's `contactTime`; hoop-rigidity data would revisit the upper bound.
- **For P2b.2b's `simulateShot`.** It builds `StrokeContext` (deriving `group` with the Glossary's definition) and
  exports `judgeFaults` with the impact. Judgeable once its swing model exists: 29.1.13's "plays away from" (the
  swing direction) and, with a sourced per-stroke contact-time norm, 29.1.6.3. `impact-head-approaching` becomes a
  possible 29.1.6.2 in single-ball strokes; the tracked swing path should integrate the re-contact instead.
- **Not used yet.** `judgeFaults` and `simulateImpact` stay internal until P2b.2b exports them.

## P2b.2b.1 pre-flight outcomes (2026-10-05)

The first pre-flight ran the P2b.2b.1 plan as merged. Its mechanical defects were folded into the re-plan; two
model failures changed the design.

- **The roll catapult.** In the full roll a face pitched 35° down, a path that kept accelerating into the blocked
  ball and sticking face friction made the head climb the ball until the contact left the face disc. Off the face
  the pair applied no force, so the ball sank about 15 mm into the head; when the head's pitch brought the ball's
  centre back inside the disc, the face contact opened at about 15 mm in one step: 68 kN, about 494 J injected,
  the striker's ball sent up at 13 m/s and the croqueted ball off at 17.4 m/s. The pass roll rode through both
  balls with no force at all.
- **The relaxed AC check.** The feed-forward was the full m·a whatever the grip's tension (γ = 0.1), so the check's
  ≈ −298 N overpowered the relaxed coupling's ≈ +60 N and drove the head backwards; the braking test's turf
  impulse came out −0.221 N·s.
- **The coupling search** gave T = 0.077 s at the 5 % criterion; the user kept 0.08 s (4.80 %). Under the two-hand
  model the criterion no longer constrains T.
- **Prototype passes** (branch `proto-two-hands`, a reference, never merged). Pass 1: two hands on a rigid shaft,
  the whole head as a ball collider and the re-entry guard; position springs after contact injected energy.
  Pass 2: the arm mass, velocity tracking from contact, the dip fed forward in full and the 30 ms look-ahead.
  Pass 3: the free pendulum, the hands' reach and the bottom hand's rate guide. Pass 4: Riches' carry mode for the
  rolls; adopted. Pass 5: a firm off-aim roll grip with a gated reach end; not adopted, as it broke the half roll
  and fixed neither steep roll.
- **Prototype ratios** (pass 4, T = 0.08 s, 3 m/s): drive 3.33, AC stop 6.55 (with a 14 mm dip), GC stop 6.60
  (as a croquet stroke, a setup since retired), half roll 2.83 (2.75–2.88 over 2–4 m/s; 2.03 at T = 0.04 s), full
  roll 2.14, pass roll 1.59 (1.26 at 2 m/s) at a reach of 0.30 m.
- **The AC stop's dip.** Pass 4's 14 mm drove the head 2.86 mm into the turf, past `HEAD_DEEP_LIMIT`; the user set
  it to about 11 mm, confirmed by the second pre-flight.
- **The second pre-flight (2026-10-06)** led to seven user decisions (the spec's 2026-10-06 amendment; four are
  recorded under "P2b.2 decisions" above): the GC stop is a single-ball stroke over a gap; the late re-hit is
  counted here and integrated in P2b.2b.3; a check brakes the head to rest, not past it; the AC stop is told from
  the drive by its coaching ratio; the timing sweep prints both balls' distances; P2b.2b.3 is the whole swing; and
  P2b.2b.2 calibrates the stroke shape before P2b.2b.3 sweeps it.

## P2b.2b.1 outcomes carried forward (for P2b.2b.2)

Measured by `scripts/swingProbe.ts` (node v26.10.0). Observations, not gates.

- **Ratios** (`ratios`; croqueted ÷ striker distance against the coaching ranges): at 3 m/s the drive 3.32 (coaching
  3–4), the AC stop 6.46 (6–10), the half roll 2.83 (about 2), the full roll 2.14 (about 1) and the pass roll 1.59
  (below 1). At 2, 2.5, 3, 3.5 and 4 m/s: drive 2.49, 2.90, 3.32, 3.02, 3.47; AC stop 6.65, 6.54, 6.46, 6.41, 6.37;
  half roll 2.75, 2.79, 2.83, 2.86, 2.88; full roll 1.73, 1.99, 2.14, 2.20, 52.47; pass roll 1.26, 1.44, 1.59, 1.89,
  2.11. The drive at 2, 3 and 4 m/s with `guideEffort` 0: 5.63, 6.04 and 6.05, one hit each, ending 110.6, 95.3 and
  76.8 ms after contactAt; with `guideEffort` 1: 2.49, 3.32 and 3.47, with 4, 2 and 2 hits, ending 268.9, 181.4 and
  138.0 ms after contactAt.
- **The GC stop** (`gc`; a single-ball stroke, its target 0.3 m ahead): on the canonical setup at 2, 2.5, 3, 3.5 and
  4 m/s the touch comes in phase 2, 141.7, 106.8, 86.5, 73.0 and 63.3 ms after contactAt; after it the striker's ball
  travels 0.336, 0.267, 0.264, 0.293 and 0.343 m and the target 0.959, 1.975, 3.217, 4.764 and 6.617 m (ratios
  2.86, 7.38, 12.17, 16.28, 19.32). Over the gap at 3 m/s every run is one hit and a 10.0 ms impact with the touch
  in phase 2; the striker's ball and the target after the touch, `stop-gc` then `single-ball`: 0.05 m 0.157 and
  4.238 m (26.97), 0.171 and 4.550 m (26.64); 0.1 m 0.182 and 3.967 m (21.76), 0.199 and 4.265 m (21.45); 0.2 m
  0.206 and 3.585 m (17.40), 0.215 and 3.910 m (18.22); 0.3 m 0.264 and 3.217 m (12.17), 0.266 and 3.513 m (13.19);
  0.5 m 0.471 and 2.654 m (5.63), 0.458 and 2.950 m (6.45); 0.75 m 0.755 and 2.118 m (2.81), 0.817 and 2.294 m
  (2.81); 1 m 0.721 and 2.023 m (2.81), 0.783 and 2.198 m (2.81). Observations; P2b.2b.2 calibrates.
- **The late re-hit** (`rehit`, and `gc` per gap; the real head at the impact's end, moved on by the planned
  path's displacement and rotation): no run's real head or shaft overlaps a ball, an upright, a crown or the peg at
  the impact's end. Canonical setups: no crossing for single-ball, drive, AC stop and GC stop; the half roll crosses
  blue 73.3 ms after contactAt (head 1.530 m/s, ball 1.478 m/s), the full roll blue at 107.4 ms (1.687 and
  1.101 m/s), the pass roll blue at 138.9 ms (the head held at its reach's end, the ball 1.164 m/s). Preset sweeps,
  runs crossing a ball of 225: single-ball 18, drive 3, AC stop 13, GC stop 38, half roll 53, full roll 125, pass
  roll 223. Per gap, `stop-gc` never crosses; `single-ball` crosses blue at 0.05, 0.1 and 0.2 m (23.8, 40.7 and
  76.4 ms after contactAt; head 2.90–2.99 m/s, ball 0.51–0.53 m/s), none from 0.3 m. No run, canonical or swept,
  meets an upright, a crown or the peg, with the head or the shaft. Through hoop 1: centred, no ball crossing, the
  shaft meets 1/crown 143.2 ms after contactAt (0.110 mm deep); with the face 10 mm off, the head crosses blue at
  59.9 ms (head 2.940 m/s, ball 0.772 m/s) and meets 1/b at 100.3 ms. A known limit of every shot here: phase 2
  moves the balls with no mallet in it, and within the impact the head never meets a hoop or the peg. P2b.2b.3
  integrates the whole swing.
- **Canonical setups** (`canonical`; exit criterion 4): entry jumps 0 on every setup. Highest ball centre above R:
  single-ball 0.85, drive 0.93, AC stop 4.19, GC stop 1.46, half roll 0.72, full roll 0.82, pass roll 2.91 mm.
  Regions: the face only, except face and rim for the full and pass rolls. Release only in the drive, 110.0 ms
  after contactAt (Δθ 8.39°). Braking hands / turf (N·s): single-ball −0.055 / 0, drive −1.253 / 0, AC stop
  0.225 / 0.401, GC stop 1.187 / 0, half roll −0.706 / 0, full roll −2.108 / 0, pass roll −4.051 / 0. After
  contactAt (single-ball, drive, AC stop, GC stop, half, full and pass roll): 10.0, 181.4, 21.6, 10.0, 40.2, 83.4 and
  70.0 ms; none reaches the cap. `impact-off-face` once each on the full and pass rolls; no other flag.
- **Cap and flags** (`presets`): 225 runs per preset, none rejected. `impact-head-deep` on 72 AC-stop runs and
  `impact-cap` on 12, both on no other preset; `impact-head-approaching` on none; `impact-off-face` single-ball 0,
  drive 81, AC stop 65, GC stop 10, half roll 0, full roll 225, pass roll 180. The longest impact after contactAt
  that ended before the cap: single-ball 11.3, drive 314.6, AC stop 308.8, GC stop 217.7, half roll 213.7, full
  roll 298.3, pass roll 303.8 ms. `TRACK_IMPACT_CAP` is 450.0 ms.
- **The AC stop's dip** (`dip`): the profile's handDrop is 11.00 mm; 8.00–11.50 mm meet both conditions (the
  head–turf penetration under `HEAD_DEEP_LIMIT`, 2.00 mm, and the turf met after the ball). At 11.00 mm the
  penetration is 1.80 mm, the face interval ends at 1.2 ms and the turf interval starts at 12.5 ms, and the turf
  brakes 0.401 N·s (ratio 6.46). 11.5 mm reaches 2.00 mm; 12 mm 2.19 mm, raising `impact-head-deep`; 14 mm 2.93 mm.
- **Coupling** (`coupling`; T = 0.04 s against 0.08 s): the ratio and hits, drive 2.35 and 3 / 3.32 and 2, AC stop
  6.46 and 1 / 6.46 and 1, half roll 2.03 and 7 / 2.83 and 5, full roll 1.78 and 6 / 2.14 and 6, pass roll 1.33
  and 3 / 1.59 and 6; single-ball one hit at both; the GC stop one hit at both, its touch and distances unchanged
  (0.264 and 3.217 m, 12.17). The hands' impulse beyond the feed-forward in the first strike, as a share of every
  ball's momentum change: single-ball 0.75 / 0.40 %, drive 3.13 / 1.67 %, AC stop 0.20 / 0.10 %, GC stop 0.34 /
  0.18 %, half roll 11.23 / 6.04 %, full roll 9.18 / 4.82 %, pass roll 14.76 / 7.64 %. The lag at the hands'
  window's end: half roll 29.5 / 34.0 mm, full roll 41.7 / 38.2 mm, pass roll 23.2 / 26.5 mm (single-ball 15.5,
  drive 9.6–9.8, AC stop 7.1, GC stop 7.6 mm at both). T moves the ratios; P2b.2b.2 fits it.
- **Effective mass** (`mass`): the drive's closed form 1.0066 kg (0.66 % above m), its strike over every ball
  1.0066 kg (the striker's ball alone 0.2861 kg). Closed forms: single-ball and GC stop 1.0066, AC stop 1.0278, half
  roll 0.9675, full roll 1.0220, pass roll 0.9669 kg. Strike over every ball: single-ball 1.0018, AC stop 0.9881,
  GC stop 0.9074 (−9.86 % from its closed form), half roll 0.9823, full roll 0.9691, pass roll 0.9954 kg.
- **Tracking** at `HAND_COUPLING` with no ball and no turf (`tracking`): firm before contact at most 2.88e-7 m and
  4.80e-7 rad on every preset; inside the GC stop's check 7.13e-6 m and 8.86e-6 rad, the relaxed AC stop's
  (γ_T 0.1) 1.27e-2 m and 1.73e-2 rad; carry up to the reach's end at most 8.63e-6 m and 1.81e-5 rad, after it at
  most 1.08e-5 m and 2.27e-5 rad. The swing mode's residual after contact outside a check: single-ball 4.24e-4 m
  and 5.48e-4 rad, drive 4.87e-5 m and 6.86e-5 rad, GC stop 7.13e-6 m and 8.87e-6 rad, and the relaxed AC stop
  0.704 m and 0.861 rad (its top hand sinks below the path by design).
- **Cost** (for P5; `cost`; machine-dependent): tracked steps and µs/step, single-ball 2,000 and 4.865, drive
  36,270 and 1.863, AC stop 4,326 and 3.284, GC stop 2,000 and 5.111, half roll 8,033 and 1.506, full roll 16,672
  and 1.492, pass roll 13,990 and 1.502; P2b.2a's force-table strokes, centre 600 and 0.747, croquet 600 and
  0.920, descending 10° 1,480 and 0.435, stop shot 600 and 0.800. The reach filter over the 0.51 s impact: over
  102,000 steps (510.0 ms) the displacement beyond the summed path is at most 1.49e-11 m against `WAKE_MARGIN`
  1e-9 m (67× headroom).
- **Timing** (`timings`; the user's account: every action is timed, and mistimed, by the player). Both balls'
  distances and the ratios below are this run's first measurements, not checked against an earlier record.
  - AC stop on time: ball first, dig 1.80 mm, slide 1.8 mm, the striker's ball off at 1.380 m/s and 3.21°, then
    the striker's ball 0.943 m and the croqueted ball 6.095 m, ratio 6.46.
  - The arc 10–50 ms early misses the ball (dig 0.30–1.92 mm) and runs to the cap; 5 ms early it strikes at only
    0.499 m/s (0.146 and 1.422 m, ratio 9.76); 5–20 ms late 1.394–1.396 m/s, 0.960 and 6.16 m, ratio 6.42 (the
    launch −0.23° at 20 ms).
  - The hands' timing moves the ratio by at most 0.01 (6.46–6.47) and the distances by at most 2 mm; 20 ms late
    the launch falls to −0.20°.
  - The dip 20–50 ms early puts the lawn first: 1.209–1.220 m/s at 16.8–20.3°, slide 18.7–43.0 mm, the striker's
    ball 0.858–0.904 m and the croqueted ball 4.04–4.25 m, ratio 4.47–4.92. 10 ms early is ball first at
    1.130 m/s and 6.45°, 0.590 and 6.359 m, ratio 10.78; 5 ms early 1.277 m/s at 0.00°, 0.714 and 6.262 m, ratio
    8.77. 5–20 ms late digs 2.01–2.56 mm and raises `impact-head-deep`: 0.986 and 6.064 m, ratio 6.15.
  - The dip's depth ×0 and ×0.5: no dig, launch 9.00° and 4.67°, ratios 6.16 and 6.31; ×1 is on time; ×1.5 and ×2
    dig 3.83 and 5.75 mm, raising `impact-head-deep`, ratios 6.62 and 6.75.
  - Full roll: ball first throughout, no dig, `impact-off-face` on every line. On time 1.135 m/s at −1.26°, the
    striker's ball 1.080 m and the croqueted ball 2.315 m, ratio 2.14. The arc 20–50 ms early launches the
    striker's ball at 0.385–0.485 m/s and 33–83° (ratios 12.61–15.85); 5–10 ms early ratio 2.06–2.08; 5–20 ms late
    2.04–2.24. The hands' timing gives ratios 2.11–2.26. The dip's timing is inert (the roll has no dip).
  - For the user's review of the timing model and P2b.2b.2.
- **Known misses.** The full roll (about 1 in coaching) and the pass roll (below 1) carry the striker's ball on a
  steep face; their ratios above need the low-speed face–ball law and the turf's response under load.
- **Deferred to P2b.2b.2.** The whole stroke shape, the backswing from its top, the lead-in and the
  follow-through, with its amplitude, calibrated per shot type, its path giving the head's and the shaft's poses
  along the whole swing for P2b.2b.3; sourced swing defaults per preset; the face–ball and ball–ball contact-time
  fit; the hand coupling's T and ζ, `armMass`, `reachSlack` and the grips fitted to the ratios; the stop-shot and
  drive ratio calibration and held-out validation (rolls, pass roll, stop → pass-roll ordering, pull, stop-shot
  lift); the steep rolls' calibration; the GC stop's distances after the touch; the low-speed face–ball law (a
  roll is a 30–60 ms carry, not a collision, and the modelled striker's ball chatters on the face); the turf's
  response under load; the crush-calibration decision; 29.1.6.3 with a sourced contact-time norm; head–turf
  stiffness and friction sourcing, and whether turf drag needs a ploughing term; the end-weighted head; face
  presets beyond wood.
- **Deferred to P2b.2b.3** (after P2b.2b.2): the whole swing, backswing from its top, lead-in and
  follow-through, its head and shaft against every ball, the uprights, the crowns and the peg, integrated and
  judged (29.1.6.1, 29.1.6.2, 29.1.11, 29.1.10); it sources two reference gaps, the shaft's diameter (not in
  `mallet.json`) and the peg's height (Law 5.1 is not in `court.json`). **Deferred to a GC-rules phase:** the Golf
  Croquet Rules' faults and remedies; a GC stroke is judged as an AC single-ball stroke until then.
- **Model limits.**
  - The late re-hit: a ball that comes back into the follow-through after the impact has ended is not struck
    again (counted above).
  - Within the impact the head meets the balls and the turf only, never a hoop or the peg, and the shaft meets
    nothing: 29.1.11 is judged there, 29.1.10 never.
  - The end rule's look-ahead watches the front face only, so on 6 pass-roll runs of the preset sweep the head
    meets the striker's ball 0.1 ms after the impact ends, on its rim in 3 and its barrel in 3. P2b.2b.3's
    re-opening of the impact covers it.
  - A level head on the turf rests on a point that jumps between its end rims, which gives a bounded chatter.
  - The turf is a plane under the head: no divot, no lasting dent, no change to the lawn for phase 2.
  - A swing is simulated only from its earliest action; an on-time low swing's dig is reported as the approach
    clearance, not simulated.
  - The bottom hand's position is not an input: each preset sets the shaft's lean and the hands' share directly
    until the articulated body. Casting versus planted swings belong to P4.
  - The head–turf stiffness, restitution and friction are the ball's.
  - The default shaft (36 in) and top hand (35 in) and the hand positions (Riches) are sourced; the grips, gains,
    reaches, arm mass and reach slack are the prototype's calibration.
- **Public.** `simulateShot`, `simulateImpact` and `judgeFaults` are exported from `src/engine/index.ts`
  (`ENGINE_VERSION` 0.6.0).

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
