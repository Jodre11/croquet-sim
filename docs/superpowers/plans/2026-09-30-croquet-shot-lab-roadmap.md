# Croquet Shot Lab — Implementation Roadmap

**Spec:** `docs/superpowers/specs/2026-09-30-croquet-shot-lab-design.md`

The spec is delivered as five sequenced plans. Each plan produces working, tested software on its own and is
written only once its predecessor has landed, so it can build on real interfaces and sourced reference data
rather than guessed ones.

| Plan | Delivers | Exit criteria |
|---|---|---|
| **P1 — Foundations and free-motion engine** (`2026-09-30-p1-free-motion-engine.md`) | Repo scaffold and CI; sourced reference data for ball, court, Laws, lawn speed and free-motion friction/restitution; deterministic event-driven phase-2 engine (sliding → rolling → stationary, ball–ball, uprights, peg, halt margin); out-of-court and hoop-passage events; hoop-run verdict; `ShotResult` sampling | Analytic cases pass (5/7 rule, head-on exchange, stop distances); energy/momentum invariants; mirror symmetry; determinism; event solver agrees with brute-force integration within 1 mm (the angled three-ball wedge push is cross-checked with ball–ball friction off, because pushing contacts are frictionless) |
| **P2 — Impact phase and swing model** | **P2a.1 (lands first):** lift in free motion — airborne phase, landing event, 3D ball–ball contact normals, 3D impulse friction with impulsive turf friction, resting contact extended to airborne balls (3D normals, gravity; still frictionless), lift-aware hoop passage, out-of-court and halt, jump flag; sourced ball–turf restitution and crown clearance. **P2a.2:** Coulomb friction (3D, load-coupled) on coupled (pushing) contacts in `push.ts`, with stick/slip events and static friction in held clusters. **P2b.1** (`specs/2026-10-03-p2b1-impact-integrator-design.md`): reference data for face and turf contact and a typical mallet head; compliant small-step N-body impact integrator (mallet rigid body, balls, turf) driven by a force profile, tested with hand-built `ContactState`s; turf restitution and stiffness moved into `SurfaceProps`. **P2b.2** is split (decided 2026-10-04; see "P2b.2 decisions"). **P2b.2a** (`specs/2026-10-04-p2b2a-obstacles-faults-design.md`): ball–upright and ball–peg contact in the impact, a contact timeline, and a fault judge for the Laws' mallet faults (crushes, multiple contacts). **P2b.2b** is split (decided 2026-10-04). **P2b.2b.1** (`specs/2026-10-04-p2b2b1-swing-shot-design.md`): tracked drive as two arcs, the pendulum and the hands' path through space with its dip, each timed (and mistimable) by the player, two hands on a rigid shaft, in swing mode (single-ball, drive, stops) or carry mode (rolls), tracking the path's velocity from contact, the bottom hand releasing by reach; the whole head meeting the balls as a solid cylinder, with a re-entry guard; the GC stop a single-ball stroke over a gap to its target; mallet–turf contact, a lawn struck before the ball emerging from an early action; swing model `ShotSetup → ContactState` with provisional defaults, `simulateShot(setup)` wiring phase 1 into P1's phase 2, exported with the fault judge; 29.1.13's "plays away from" and 29.1.14 judged. **P2b.2b.2** is split (decided 2026-10-06). **P2b.2b.2a** (`specs/2026-10-06-p2b2b2a-stroke-shape-design.md`): the stroke shape. The backswing from its top, the downswing under gravity and the player's effort (effort and tempo one bounded intensity; a swing's pendulum leads, a roll's hands lead), the lead-in (a downswing meeting the turf simulated, the lead up to 150 ms), the follow-through to the stroke type's finish, and one `SwingTrajectory` from top to finish; the amplitude an input and the contact speed an outcome; the shape's figures sourced or labelled placeholders, the effort fitted to kinematics only. **P2b.2b.2b** is split (decided 2026-10-08; see "P2b.2b.2b decisions and findings (2026-10-08)"), each step its own PR, all before P2b.2b.2c. **P2b.2b.2b.1** (`specs/2026-10-08-p2b2b2b1-hands-stance-design.md`): the stance from the hands. The top hand's position at contact, `handsAhead`, replaces the shaft's lean as the input; the lean follows from the rigid geometry and the point of impact from the lean; the rolls take the face angles Gugan measured (24°, 31°, 34°). **P2b.2b.2b.2** is split (decided 2026-10-09), each step its own spec, plan and PR, in this order. **P2b.2b.2b.2a** (`specs/2026-10-09-p2b2b2b2a-strike-turf-laws-design.md`): the strike and turf laws, a Hertzian face–ball law with Gugan's e(U) and T(U), and a recovering turf bed under the balls and their landings. **P2b.2b.2b.2b:** the roll's stroke (the descent through contact and the hands, to the roll as played). **P2b.2b.2b.2c:** the mallet (the square head, end-weighting, the market's dimensions). **P2b.2b.2b.3:** turf strike beyond a graze (decided 2026-10-07): the head in the new turf, a ploughing drag so that a weak stroke is stopped dead, and a grip that breaks under a hard stroke, checked against Gugan's jab stop; it precedes P2b.2b.2c because the AC stop's calibration rests on the head–turf law. **P2b.2b.2c:** calibration and validation: coaching-ratio reference data and the swing defaults, which are hands-assisted, not gravity-only (user, 2026-10-08: nearly every real swing has some help from the hands to set up, keep or increase its amplitude, and a gravity-only swing is typical only of a soft, low-amplitude tap; P2b.2b.2a's defaults, h₀ at intensity 0, lift the head about 46 cm for 3 m/s, so a default backswing needs typical heights from the user or a source); the effort's ceiling and shape (see "User play data and checks (2026-10-08)": the ceiling is too low and the speed flattens above intensity 0.8); the contact-time fit; precondition for the T and ζ fit: a finite-state guard (a RangeError or a flag when the head state goes non-finite) in the impact's post-cap run, since a very stiff grip leaves NaN there (see "Carried open items"); the hand coupling's T and ζ, the arm mass, the reach slack and the grips fitted to the stop and drive ratios; the rolls, the stop → pass-roll ordering, pull and stop-shot lift as held-out validation; the GC stop's distances; crush calibration; 29.1.6.3. **P2b.2b.3** (decided 2026-10-06; first placed before P2b.2b.2 as P2b.2b.1b, then moved after it by the user: "first we must model the stroke shape and amplitude and calibrate to the different shot types, but we will need the model to be complete enough for the rest later"): the whole swing. The mallet is carried along the swing path P2b.2b.2 calibrates, the backswing from its top, the lead-in and the follow-through after the impact ends, and its head and its shaft (rigid on the head, from the socket to the top hand) are swept against every ball, the hoops' uprights and crowns, and the peg: in a real game they may lie in the swing's path and limit the playable stroke, and the crown stops the shaft when the head reaches through an open hoop (limiting the follow-through's arc) or is swung back through the jaws. Head–obstacle and shaft contact are new physics. On any crossing the impact integrator re-opens, so a ball that comes back into the follow-through's arc (stopped by a target, rebounding off a hoop or the peg, or pulling up short), another ball, a hoop or the peg is met within an integrated impact and the fault judge rules on it (29.1.6.1, 29.1.6.2, 29.1.11, 29.1.10; Law 29.3.2 lets the opponent leave the balls where they lie after the first stroke in error, so the re-hit's physics matters). P2b.2b.1 only counts the follow-through's crossings. Deferred beyond P2b but required in the final implementation: three- and four-ball cannons, including near a hoop or the peg; 29.1.10 by a part of the body (the mallet's part is P2b.2b.3's); variability of swing and aim (accuracy), a property of human input only, growing with the bottom hand's involvement (user, 2026-10-08), and conditions such as wind, under which a hoop could block a shot or a glancing blow redirect it or limit its power; divots and lasting turf damage, and with them a winter-rules variant that bans jump shots, because soft lawns deform and are damaged (user, 2026-10-09); a fully articulated body beyond P2b.2b.1's translating pivot: the feet, and the shoulder, elbow and wrist between them and the hands, from which the hands' position would follow (since P2b.2b.2b.1 the top hand's position at contact is the stance's input, and the bottom hand's position follows the rigid shaft); the Golf Croquet Rules' faults and remedies, in a GC-rules phase (until then a GC stroke is judged as an AC single-ball stroke) | P2a.1 (met): landing and above-equator strike analytic cases; bouncing balls settle; brute-force cross-check (now 3D) agrees within 1 mm including hopping scenarios. P2a.2 (met): generalised topspin-push closed form; angled wedge cross-check runs in the standard world (friction-off override removed) and agrees with brute force within 1 mm; no fallbacks (`approximate-hold`, `approximate-slip` or `budget-hold`) in limit-of-holding sweeps with friction on. P2b.1 (met): analytic contact, restitution, sticking and 5/7-roll cases through a real impact; invariants; `dt` convergence; handover accepted by phase 2; phase 2 bit-identical after the `SurfaceProps` move; stop-shot probe and stiffness sensitivity recorded. P2b.2a (met): obstacle analytic cases (contact time, restitution, stick and slip, the peg's own material); P2b.1 bit-identical without obstacles in reach (digest, shot mix, slow tests); no obstacle overlap handed to phase 2 (obstacle fuzz); fault table and the C29.20.4 sequences; crush geometry, with the crush distance recorded. P2b.2b.1 (met): tracked-drive, head–turf, head–ball and swing-model analytic cases; force-table drives bit-identical to P2b.2a; the swung body's effective mass at the face centre within 10 % of the head's mass on the drive's canonical setup, and measured by the strike; every default preset's canonical setup runs end to end with no re-entry guard hit and no ball centre more than 5 mm above R, its ratios recorded against the coaching ranges, the GC stop's distances after the touch over the gap, and the late re-hit's crossings. P2b.2b.2a: the downswing's analytic cases (the energy integral and the work–energy balance within 0.1 %); every preset's canonical setup run from top to finish with no re-entry guard hit, no ball above R + 5 mm and no `follow-cap`, its trajectory continuous at every boundary; force tables bit-identical; each preset's default planning 3 m/s within 2 % (or its sourced bound's nearest). P2b.2b.2b.1: the stance's analytic cases (the hands–lean round trip within 1e-12 rad, an upright shaft exactly upright at any contact height, the pose); every preset's canonical pose at its default lean; force tables and the upright presets bit-identical; the rolls' canonical setups run from top to finish as P2b.2b.2a's; each roll's refitted default planning 3 m/s within 2 %. P2b.2b.2b.2a: the laws' analytic cases; phase 2 bit-identical without a landing; every preset's canonical setup run end to end; the strokes and landings recorded. P2b.2b.2b.2b, P2b.2b.2b.2c and P2b.2b.2b.3: each law's analytic cases, and the rolls stop failing (no dead stop, credible distances, and the roll played as "P2b.2b.2b decisions and findings (2026-10-08)" describes: the angle held, never beyond 45°, through a push whose repeated face touches are acceptable); the ratios recorded, not gated (user, 2026-10-08). P2b.2b.2c: standard stroke ratios within tolerance of sourced figures (stop shot and drive are calibration targets, the rolls held-out validation; see "P2b.2 decisions"); stop → pass-roll monotonic; pull emerges on wide rolls without special-casing; stop-shot lift emerges in the AC stop (striker's ball clear of the turf during the transfer, meeting the croqueted ball just above its equator, no jump flag). P2b.2b.3: the head and the shaft are swept along the whole swing (backswing, lead-in and follow-through) against every ball, the uprights, the crowns and the peg; every crossing, including those the P2b.2b.1 probe counts, is integrated as a further contact within the impact and judged (29.1.6.1, 29.1.6.2, 29.1.11, 29.1.10); head–obstacle and shaft contact analytic cases; the crossing counts re-measured. |
| **P3 — Profiles and calibration** | Stored profile wrapping P2b.2b.1's physical `SwingProfile` (plus grip style, pre-filling the hands, weighting and face, with face presets beyond wood, of which only PTFE has measured data; home-lawn speed, fitted parameter bounds, versioning; which drive fields are fitted is decided here, the stance (the top hand's position at contact and the grips) and the body being entered; how an entered stance behaves when the player's mallet changes, its hands kept and its lean following, or its defaults re-derived per mallet; exporting `stanceLean` and `handsAheadFor` once a reader needs them), with the default "typical club player" profile from P2b.2b.2; fitting the effort and tempo (`torqueMax`, `tempoSlow`, `tempoFast`, the hands' tempo) per player; median-of-attempts input; optimiser fitting drive profile per stroke type; plausibility bounds and rejection | Round trip recovers fitted parameters within ±5 % and distances within ±2 %; out-of-bounds fits rejected |
| **P4 — Planner, renderer and share links** | Svelte planner (placement with snap-back, nudge, croquet-stroke snap-into-contact, stroke controls in the player's order — shot type, balls, stance, hands, contact, then the rehearsed swing, its reach and its timing — target hoop, lawn speed; casting versus planted ways of setting up and rehearsing a shot, and how much of the set-up a weaker shot uses, decided here (user decisions 2026-10-05); both are styles of human input (user, 2026-10-08): casting rehearses the pendulum above the ball's plane, then dips it for the striking swing (finer line and weight, more risk of topping or hitting the turf); planting sets the face a few millimetres behind the ball on line, then takes one backswing and strikes on the first return (a cleaner, more powerful strike, no chance to adjust); the computer, unlike a human, always judges line and weight perfectly), Canvas 2D renderer, compare ghost overlay, honesty note, versioned fragment link format with migration and notices, wrapped local storage for profiles | Playwright suites at tablet/desktop/phone viewports in Chromium, WebKit, Firefox; link round-trips reproduce results |
| **P5 — Delivery and budgets** | GitHub Pages deploy workflow; performance budget in CI (Chromium CPU throttle calibrated once against the reference iPad), including the cost of contact chatter (with friction on, P2a.2's realistic shot mix makes at most 404 resting-contact re-solves in a shot, and three-ball pushes up to 745 and about 75 ms of engine time on an Apple M4, which the work budget does not see; four-ball pushes end in `budget-hold`; see the P2a.2 outcomes); a swing stroke's fixed preparation, profiled on an Apple M4 (see the P2b.2b.2a outcomes' cost): (F2) fill the free pendulum's table lazily, up to the largest index read, not the whole 1.2 s (about 16 ms per `prepareTrack`, which `simulateImpact` and `simulateStroke` each run); (F3) rewrite `scanDownswing` in scalars with no per-sample allocation (about 31 ms per swing-mode `planStroke`) and cache it for `swingApproach`, which repeats it, keeping it arithmetic-identical since the lead depends on its `grounded`; (F4) the same for `planDownswing`'s acceleration (about 5 ms); bundle-size budget; cross-engine determinism test | All budgets enforced in CI; site live |

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
    roll: 15°, 0.805 and 0.42 m, carry, hands' share 0.6, reach 0.15 m, 5 mm into the ground. Full roll: 45°, 0.61
    and 0.30 m, carry, share 0.9, reach 0.30 m, 2 mm. Pass roll: 48°, 0.45 and 0.09 m, carry, share 0.85, a pendulum
    punch (`speedGain` 0.5 over 15 ms), reach 0.30 m, 2 mm.
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
- **P2b.2b.2a design (2026-10-06/07).** User decisions:
  - P2b.2b.2 is split into 2a (the stroke shape), 2b (the contact laws) and 2c (calibration and validation), each
    with its own spec, plan and PR.
  - Amplitude is the input and the contact speed an outcome: `stroke.backswing` (the head's height at the top above
    its contact height) replaces `stroke.speed`.
  - The downswing is gravity plus the player's effort. Effort and tempo are one bounded control, `intensity` in
    [0, 1], independent of the backswing and variable per shot; at 0 the player lets the mallet fall.
  - Effort is fitted to sourced kinematic data only, never to ratios; without data it takes a labelled placeholder
    (intensity 1 doubles the speed). Per-player fitting is P3's.
  - The hands and the pendulum start together at the top: in swing mode the pendulum leads and the hands follow its
    angle; in carry mode (rolls) the hands and body lead on their own tempo and the slope follows. The hands arrive
    with no vertical velocity.
  - A downswing that meets the turf is simulated (the fat stroke), the lead up to 150 ms.
  - Three segments: the downswing, the unchanged impact, and the follow-through continuing the integrator with the
    balls removed, only on request; one `SwingTrajectory` from top to finish for P2b.2b.3.
  - `simulateShot`'s passed `world` wins over `setup.lawnSpeed`.
  - At the sourcing gate (2026-10-07) every placeholder in `swing.json` is confirmed: the hands' angle of 30° for
    every type, the roll shares 0.4, 0.1 and 0.15, and the swing presets' `pendulumShare` 1 as a design choice.
  - The default intensity at a sourced bound follows the nearest-speed rule (0 when even intensity 0 reaches 3 m/s,
    1 when even intensity 1 does not), departing from the spec's "1 when unreachable".
  - On a downswing the firm grip before contact has no position springs, so a light graze costs a fraction of the
    head's speed. The user's account: a light graze is a successful stroke with only a fractional loss of speed; more
    resistance spoils it; a hard stroke breaks the grip, and a weak one is stopped dead.
  - A stop's follow-through holds the mallet still relative to the hands after its check (Riches: "NO
    FOLLOW-THROUGH at all, or as little as possible").
  - A new item, **turf strike beyond a graze**, its phase to be decided: a ploughing drag, so that a weak stroke is
    stopped dead, and a grip that breaks under a hard stroke. Today turf drag is μ·N on a linear spring, about 100 N
    per mm of depth, and the head touches the turf at its lowest point only.
  - Lawn damage (Law 29.1.14) is a fault only in a hampered, jump or group stroke (Law 29.2.3; C29.19.5 sets no depth
    test), and `faults.ts` judges it. For ordinary strokes the 2 mm `impact-head-deep` event marks a stroke gone
    beyond a graze that has probably damaged the lawn; it is not a fault.

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
  70.0 ms; none reaches the cap. `impact-off-face` once each on the full and pass rolls; no other impact flag.
  `simulateShot`'s fault judge still finds a 29.1.6.1 possible fault on four of them: the drive (2 face intervals,
  its designed follow-through re-hit) and the half, full and pass rolls (5, 6 and 6, the striker's ball chattering
  on the face).
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
  - The bottom hand's position is not an input. Since P2b.2b.2b.1 the stance's input is the top hand's position at
    contact, from which the shaft's lean follows; the bottom hand's position follows the rigid shaft. The feet and the
    body are the articulated body's. Casting versus planted swings belong to P4.
  - The head–turf stiffness, restitution and friction are the ball's.
  - The default shaft (36 in) and top hand (35 in) and the hand positions (Riches) are sourced; the grips, gains,
    reaches, arm mass and reach slack are the prototype's calibration.
- **Public.** `simulateShot`, `simulateImpact` and `judgeFaults` are exported from `src/engine/index.ts`
  (`ENGINE_VERSION` 0.6.0).

## P2b.2b.2a outcomes carried forward (for P2b.2b.2b and P2b.2b.2c)

Measured by `scripts/strokeProbe.ts` and `scripts/swingProbe.ts` (node v26.10.0) on the default world and the
default profile's canonical setups; raw output in `docs/superpowers/probes/2026-10-07-p2b2b2a-strokeProbe.txt` and
`…-swingProbe.txt`. Observations, not gates. Nothing is tuned to a coaching ratio; the ratios are only recorded.

- **Sourcing** (`reference/swing.json`). Sourced, with quotations: each stroke's finish from Riches (the roquet "as
  low as possible along the ground"; the stop "NO FOLLOW-THROUGH at all, or as little as possible"; the half roll
  "following through the ball and onto the ground"; the full roll "as long as possible … low along the ground"; the
  pass roll "an exaggerated (low) follow-through") and the rolls' tempo in words only ("smooth", "a pronounced BUT
  SMOOTH acceleration"). Not found for any stroke: a backswing height or range, a pendulum-to-hands split, a hands'
  backswing angle, a tempo time, or a kinematic pair (backswing against contact speed). Riches gives comparisons
  only; the CA's and Gugan's mallet speeds carry no backswing. Placeholders, all confirmed by the user at the gate:
  the hands' angle 30° for every type; the roll shares 0.4, 0.1 and 0.15 (1 − P2b.2b.1's hands' share); the swing
  presets' `pendulumShare` 1, a design choice (Riches: "the hands move FORWARDS throughout the swing", so a moving
  top hand is the articulated body's). The effort and tempos are the placeholder rule's (intensity 1 from h₀
  doubles the speed).
- **The fit** (`scripts/fitStrokeShape.ts`). No range was sourced, so every default is h₀ at intensity 0 and plans
  3.0000 m/s (exit criterion 5). h₀, the gravity-only (or slow-tempo) backswing for 3 m/s: the four swing presets
  461.9 mm, half roll 391.6 mm, full roll 452.4 mm, pass roll 467.4 mm. Placeholder
  effort: swing presets `torqueMax` 28.97 N·m (AC stop 27.66), tempo 0.4998 s slow and 0.2499 s fast (AC stop
  0.5196 and 0.2598); rolls' hands' tempo 0.4998 and 0.2499 s. The contact speed rises strictly with intensity at
  every preset (the fit checks it): at h₀ and intensity 0, 0.25, 0.5, 0.75 and 1, the swing presets give 3.00, 4.34,
  5.34, 5.92 and 6.00 m/s (AC stop 3.00, 4.35, 5.36, 5.93, 6.00), the rolls 3.00, 3.43, 4.00, 4.80 and 6.00 m/s.
- **Technique figures** (for the user; from the placeholder shape, so indicative only).
  - Gravity alone needs a head rise of about 46 cm for a 3 m/s roquet or drive; the rolls' slow tempo needs 39, 45
    and 47 cm (half, full, pass). At intensity 0 the swing presets' speed is within 0.5 % of √(2gh): 0.62 m/s from
    2 cm, 1.40 from 10 cm, 1.97 from 20 cm, 3.12 from 50 cm, 3.69 from 70 cm. The most a free fall can give is
    4.05 m/s (the shaft horizontal at the top, `MAX_BACK_ANGLE`; `swingProbe.ts`'s `presets` rejections), so faster
    swing-mode shots need effort.
  - Effort matters most on a short backswing: from 2 cm, intensity 1 gives 3.38 m/s (5.4× the free fall); from
    46 cm it doubles the speed by construction; the step from 0.75 to 1 adds only 0.08 m/s at h₀.
  - At a given tempo the full and pass rolls' speed is nearly linear in the backswing (the hands' travel over a fixed
    time): about 6.6 and 6.4 m/s per metre at intensity 0. The half roll's, 40 % of it from the pendulum, falls
    from 9.9 to 7.1 m/s per metre between 2 and 70 cm. Intensity 0.5 and 1 multiply a roll's speed by 4/3 and 2.
  - Downswing times, 2 to 70 cm: single-ball, drive and GC stop 463.5–526.0 ms at intensity 0, 215.3–369.6 ms at 0.5
    and 155.8–306.2 ms at 1; the AC stop 506.7–554.9, 246.2–384.1 and 178.6–319.4 ms (its lean adds about 91 ms to
    the free fall from 2 cm, 554.9 against 463.5); the rolls 499.8, 374.8 and 249.9 ms at any backswing.
    `MAX_LEAD` (150 ms, provisional) lies inside every one: the closest is the 2 cm swing at intensity 1, 156 ms.
- **Speeds** (`speeds`; planned m/s at intensity 0 / 0.5 / 1, backswings 2, 5, 10, 20, 30, 50 and 70 cm). Single-ball,
  drive and GC stop alike: 0.62 / 2.40 / 3.38, 0.99 / 3.08 / 4.18, 1.40 / 3.68 / 4.76, 1.97 / 4.36 / 5.30, 2.42 /
  4.82 / 5.61, 3.12 / 5.45 / 6.08, 3.69 / 5.90 / 6.47. AC stop: 0.62 / 2.74 / 3.80 … 3.69 / 5.91 / 6.47. Half roll:
  0.20 / 0.26 / 0.40 … 4.97 / 6.63 / 9.94; full roll 0.13 / 0.18 / 0.27 … 4.64 / 6.18 / 9.27; pass roll 0.13 / 0.17 /
  0.26 … 4.48 / 5.98 / 8.96. No setup on the grid is rejected.
- **Canonical** (`canonical`, with the trajectory; intensity 0, 3.0000 m/s planned; the finish's flags are none on
  every preset, so exit criterion 3's `follow-cap` holds). Times from contact; the head's rise and travel along aim
  from contact to the finish.

| Preset | Downswing (ms) | Lowest (mm, ms before) | Impact to (ms) | Finish (ms) | Head at the finish: up, along aim (mm) | Ratio (P2b.2b.1) |
|---|---|---|---|---|---|---|
| single-ball | 499.8 | 0.52, 36.3 | 10.0 | 510.0 | 141.1, 468.8 (the apex) | none |
| drive | 499.8 | 0.52, 36.3 | 181.4 | 549.2 | 212.1, 576.5 (the apex) | 3.32 (3.32) |
| stop-ac | 519.6 | 7.23, 55.9 | 21.6 | 53.9 | −7.9, 11.7 (held) | 6.46 (6.46) |
| stop-gc | 499.8 | 0.52, 36.3 | 10.0 | 98.4 | 0.2, 17.5 (held) | none |
| half-roll | 499.8 | 21.11, 0 | 37.6 | 262.6 | −7.8, 109.5 (the reach) | 2.85 (2.83) |
| full-roll | 499.8 | 51.61, 0 | 80.5 | 263.0 | 28.2, 243.5 (the reach) | 1.92 (2.14) |
| pass-roll | 499.8 | 54.72, 0 | 65.6 | 118.6 | 7.8, 276.1 (the reach) | 1.37 (1.59) |

- **Canonical, read for technique.** Every lead is 0: no canonical downswing meets the turf. The stops finish within
  0.1 s of contact, as Riches' "no follow-through" asks; the swing strokes rise 14–21 cm at their apex, against his
  "as low as possible along the ground"; the pass roll's follow-through is the longest of the rolls, as his
  "exaggerated" one is. Against the coaching ranges (half about 2, full about 1, pass below 1) the rolls are still
  high; P2b.2b.2b and P2b.2b.2c own them.
- **Fat strokes** (`fat`; the canonical single-ball stroke met 2, 4, 6 and 7 mm higher on the face, the head as much
  lower). The lowest point 1.48, 3.48, 5.48 and 6.48 mm below the turf; the lead 57.8, 66.6, 73.1 and 75.9 ms; the
  head grazes from 52.8, 61.6, 68.1 and 70.9 ms before contact, 0.50, 0.83, 1.07 and 1.17 mm deep; it meets the ball
  at 2.748, 2.514, 2.335 and 2.223 m/s against 3.000 planned (8.4, 16.2, 22.2 and 25.9 % lost). Only `turf-lift`
  fires; none reaches the 2 mm `impact-head-deep` marker of lawn damage. A slow swing digs earlier: in
  `swingProbe.ts`'s `presets`, a single-ball, drive or GC stop at 1 m/s met 3 mm higher on the face meets the turf
  183.4 ms before contact and is rejected as a gross mis-hit (beyond `MAX_LEAD`).
- **Re-measured P2b.2b.1 figures** (`swingProbe.ts`, migrated to the backswing at intensity 0). Two changes reach
  them: the rolls' hands now come from the downswing (their speed at contact emerges; `handShare` is gone), and the
  swing presets' path before contact is the downswing, not a coast. `FREE_SPAN` grew from 0.55 to 1.2 s; that window
  change moved only the cost per step below (every re-hit crossing found lies within 372 ms of contact, inside the
  old window).
  - Ratios: the drive (2.49, 2.90, 3.32, 3.02, 3.47 over 2–4 m/s), the AC stop (6.65 … 6.37) and the drive's
    `guideEffort` lines are unchanged. Moved, by the rolls' hands: half roll 2.78, 2.82, 2.85, 2.87, 2.90 (was
    2.75–2.88); full roll 1.55, 1.69, 1.92, 1.84, 35.59 (was 1.73, 1.99, 2.14, 2.20, 52.47); pass roll 1.10, 1.19,
    1.37, 1.59, 1.75 (was 1.26–2.11).
  - The GC stop (`gc`): every figure unchanged (12.17 at 3 m/s and 0.3 m; the gap sweep line for line).
  - Canonical runs: the swing presets unchanged. The rolls, by their hands: highest ball centre 0.82, 0.95 and
    2.16 mm above R (was 0.72, 0.82, 2.91); braking hands −0.682, −2.049 and −4.018 N·s (was −0.706, −2.108,
    −4.051); impacts 37.6, 80.5 and 65.6 ms (was 40.2, 83.4, 70.0). Entry jumps 0 and `impact-off-face` once on the
    full and pass rolls, as before.
  - Cap and flags (`presets`, with the rejections tallied by reason): the sweep now rejects 60 runs of the
    single-ball, drive and GC stop and 45 of the AC stop. All 45 runs at 6 m/s are beyond intensity 0's reach
    (4.053 m/s at a 843 mm backswing; the AC stop 4.048 m/s at 841 mm). The other 15 (not the AC stop) are the 1 m/s
    runs met 3 mm higher, whose downswing meets the turf 183.4 ms before contact, beyond `MAX_LEAD`. The AC stop:
    `impact-head-deep` on 60 of 180 runs (was 72 of 225), `impact-cap` on the same 12. `impact-off-face`: drive 91,
    AC stop 59, GC stop 9, full roll 225, pass roll 180 (was 81, 65, 10, 225, 180). The longest impact before the
    cap: single-ball 20.5, drive 302.7, AC stop 308.8, GC stop 255.0, half roll 140.3, full roll 283.8, pass roll
    276.1 ms (was 11.3, 314.6, 308.8, 217.7, 213.7, 298.3, 303.8): the swing presets' sweeps now include simulated
    fat strokes with leads up to 150 ms.
  - The AC stop's dip (`dip`): unchanged (8.00–11.50 mm; 1.80 mm at 11 mm).
  - Coupling (`coupling`, T 0.04 / 0.08 s): the swing presets unchanged; half roll 2.05 and 7 hits / 2.85 and 5,
    full roll 1.61 and 6 / 1.92 and 6, pass roll 1.09 and 3 / 1.37 and 5 (was 2.03 / 2.83, 1.78 / 2.14, 1.33 and 3 /
    1.59 and 6); the hands' share of the strike 11.24 / 6.05, 9.09 / 4.81 and 14.50 / 7.50 % (about as before).
  - Effective mass (`mass`): the closed forms unchanged; the strike's measure unchanged for the swing presets (the GC
    stop still 0.9074 kg, −9.86 %); half roll 0.9821, full roll 0.9762, pass roll 1.0088 kg (was 0.9823, 0.9691,
    0.9954).
  - Tracking (`tracking`): firm before contact now at most 2.08e-6 m and 1.58e-6 rad (was 2.88e-7 m, 4.80e-7 rad):
    on a downswing the firm grip has no position springs (user decision), and the hands timed `MAX_LEAD` early give
    150 ms of it, not 60. The GC stop's swing residual 3.63e-5 m (was 7.13e-6), the causes not separated; the
    carry phases at most 4.85e-6 m (was 1.08e-5); the AC stop's relaxed residual unchanged.
  - The late re-hit (`rehit`): no run overlaps a ball or an obstacle at the impact's end, and no run meets an
    upright, a crown or the peg. Canonical: the half roll no longer crosses; the full roll crosses blue at 100.5 ms
    (was 107.4) and the pass roll at 127.6 ms (was 138.9). Sweeps, runs crossing a ball: single-ball 30 of 165 (was
    18 of 225), drive 0 of 165 (3), AC stop 13 of 180 (13), GC stop 33 of 165 (38), half roll 94 of 225 (53), full
    roll 135 (125), pass roll 220 (223). The GC gap sweep and the hoop-1 runs are unchanged.
  - 29.1.6.1 possible faults on the canonical setups (`strokeProbe.ts`'s `faults`; no other finding): the drive
    (2 contacts) and the half, full and pass rolls (5, 6 and 5; P2b.2b.1 5, 6 and 6).
- **Cost** (for P5; machine-dependent, Apple M4; `strokeProbe.ts`'s `cost` unless named). The integration step
  costs what it did in P2b.2b.1: an A/B against `main` measured 1.4–1.7 µs/step on both trees, and the probes give
  1.7–2.1 µs/step in swing mode and 1.5–1.6 in carry mode. P2b.2b.1's figures (single-ball 4.865 µs/step) divided
  `simulateImpact`'s whole time by its steps, preparation included; the probes now report the two apart. What
  P2b.2b.2a adds is fixed preparation per stroke in swing mode:
  - `prepareTrack`, with the 1.2 s free table (was 0.55 s): 15.3–20.2 ms in swing mode (`swingProbe.ts`'s `cost`
    run alone 15.3–16.7 ms; in the probe's full run, after its other sections, 28.5–29.0 ms), 0.01 ms or less in
    carry mode. `simulateImpact` and `simulateStroke` each prepare once; `planStroke` and `strokeTrajectory` skip
    the table, which they never read (their path samples are all at or before the pendulum's window).
  - `planStroke`: 37–39 ms in swing mode (the downswing's 99,960–103,919 steps and its scan; profiled, the scan
    about 31 ms and `planDownswing` about 5 ms), 17 ms for the rolls (a closed-form downswing, no free table).
  - A whole shot, median of 20 after warm-up (single-ball / full roll): planning and preparation 52.1 / 16.6 ms
    (68.1 / 16.5 before the skip), `simulateShot` 57.2 / 41.5 ms (75.2 / 41.3), with the trajectory 155.6 /
    76.3 ms (191.4 / 76.1). P5 owns the rest (F2–F4 in its row).

  The follow-through costs 0.89–1.11 µs/step (one full-roll run 1.6), up to 100,000 steps (single-ball 0.5 s). The
  reach filter over the longest impact (150 ms lead plus the cap, 120,000 steps, 600 ms): 6.55e-12 m beyond the
  summed path against `WAKE_MARGIN` 1e-9 m, 153× headroom (was 67× over 102,000 steps).
- **Carried open items**, re-measured.
  - The AC stop's 12 `impact-cap` runs: still 12 (of 180).
  - The 29.1.6.1 possible faults: still on the drive and the three rolls (above).
  - The GC stop's effective mass: 0.9074 kg, −9.86 % from the closed form, unchanged.
  - The full roll at 4 m/s: ratio 35.59 against 1.55–1.92 at 2–3.5 m/s (P2b.2b.1 52.47); still P2b.2b.2b's.
  - The swing presets' closest approach as the front rim pitches back: 0.52 mm 36.3 ms before contact, now over
    the whole downswing (the AC stop 7.23 mm, 55.9 ms); unchanged. After its check the held AC stop's grip pulls
    the head back towards the path at up to 69 m/s².
  - The end rule's look-ahead watches the front face only (unchanged; P2b.2b.3).
  - Reference gaps: the shaft's diameter and the peg's height (P2b.2b.3); no stroke-shape kinematics (above).
  - The deep carry needs a planned dig of 200 mm to drive the head 5.7 mm deep: the turf and the compliant hands
    hold the head far above its planned path.
  - Open defect, predating P2b.2b.2a: with a very stiff grip (ζ ≥ 2, or a period of 0.01 s) the fat stroke goes deep
    within 0.5 ms, reaches the cap with no strike and leaves NaN in the result (the post-cap run in `integrate.ts`).
    It cannot be reached through `simulateShot` today, but fitting T and ζ reaches it, so a finite-state guard there
    is a precondition of P2b.2b.2c's fit (see its row).
  - Exit criterion 3's 1e-6 m continuity check, in its trapezoid form, holds on the canonical setups (worst seam pair
    5.7e-7 m) but fails on smooth motion with |jerk| above about 12,000 m/s³ (a pass roll with a long lead, 1.35e-6
    m); a jerk-scaled bound is the general form. Its velocity bound as tested: |Δv| at a seam within 1.5 × (the
    largest interior |Δv|/Δt on the side with no impulsive force) × Δt + 1e-4 m/s, since at 1 ms samples a literal
    1e-4 m/s cannot be met on a moving mallet.
  - Deferred: P4 chooses the backswing and intensity per shot; P5 owns the free table's and the follow-through's
    cost; turf strike beyond a graze, its phase to be decided.
- **Public.** `SwingShape`, `SwingTrajectory`, `StrokeSample` and `ShotOptions` are exported from
  `src/engine/index.ts` (`ENGINE_VERSION` 0.7.0).

## User play data and checks (2026-10-08)

The user's own single-ball and drive strokes, for P2b.2b.2c and P3 to check against, never to fit. The user plays
the Solomon grip with a 42" shaft and a 13.5" head, is 5'10"–5'11" with a long body, and hits hard.

| Stroke (10 s lawn) | Backswing (the head at its top) | Effort (perceived) | Set-up and follow-through | Travel |
|---|---|---|---|---|
| Single ball | About knee height: as far as the body allows before the mallet meets the groin and inner thighs and spoils the line | About 40 % | Planted, exaggerated follow-through | About 30 yd |
| Single ball | Much the same | About 30 % | Cast (a little less power), normal follow-through | About 15 yd |
| Single ball | Ankle height, reduced | Guiding, not adding power | No forced follow-through | About 5 yd |
| Drive (croquet stroke) | As far as the body allows | 100 % (controlled) | Planted | Croqueted ball the full length |

- **Effort is perceived.** The user's percentages measure effort as felt, not physical work, and a controlled 100 %
  is below the hardest the user could hit. They are not the model's intensity (a fraction of the preset's physical
  ceiling). Mapping perceived effort to intensity is per-player human input, for P3 and P4.
- **What the model gives** (P2b.2b.2a defaults, the default world at 10 s, knee taken as a 0.45 m rise of the head's
  centre, measured 2026-10-08 with `simulateShot`). Single ball from knee: intensity 0 gives 2.96 m/s and 7.2 yd;
  0.4 gives 4.95 m/s and 20.1 yd; 0.8 gives 5.95 m/s and 29.0 yd; 1.0 gives 5.97 m/s and 29.2 yd. From ankle
  (0.05 m) at intensity 0: 0.99 m/s and 0.8 yd; 5 yd needs roughly 2–2.5 m/s, so the user's guiding hands add more
  than they feel. Drive from knee at intensity 1: 5.97 m/s, the croqueted ball 25.6 yd, short of the 35 yd length.
- **Conclusion for P2b.2b.2c.** The distance law (travel as the square of the speed) is right, and the user agrees.
  The effort's ceiling is too low: the model's physical maximum from knee barely reaches the user's controlled 30 yd,
  and the speed flattens above intensity 0.8 (0.02 m/s from 0.8 to 1). The fit needs a higher ceiling, with headroom
  above a strong player's controlled maximum, and a pulse whose speed keeps rising to full intensity.
- **The full roll** (the same runs, re-measured at Gugan's 31° in P2b.2b.2b.1): from knee at intensity 1 the head
  meets the ball at 6.17 m/s, the croqueted ball travels 15.6 yd and the striker's ball 8.6 yd, ratio 1.81. At
  P2b.2b.2a's 45° the croqueted ball travelled under 10 yd even at intensity 1 from knee, and above about 4 m/s the
  striker's ball stopped dead (ratio 35–62, against about 1). The dead stop is gone, but 15.6 yd is well short of a
  long hoop, which is P2b.2b.2c's effort ceiling, and the ratio of 1.7–1.8 against about 1 still carries the
  re-catches, which are P2b.2b.2b.2's.
- **Weaker players** (user): they struggle to drive the ball the whole lawn, and above all to approach long hoops
  with full rolls; more so on slow lawns. A ball rolling the full 32 m length stops after the lawn's time T, so it
  starts at 64/T m/s: 5.3 m/s at 12 s, 6.4 at 10 s, 8.0 at 8 s, the energy rising as 1/T² (1.6× at 8 s against
  10 s). Checks for the default "typical club player": a full-power drive falls just short of the full length, a
  full roll struggles to reach a long hoop, and both fall shorter on slow lawns, all from the lawn's deceleration
  with no special handling.
- **Over-hitting** (user): a roquet is often deliberately over-hit, for where the balls end on a miss and because a
  fast ball runs straighter on a variable lawn: a planner choice (P4); lawn variability comes later.

## P2b.2b.2b decisions and findings (2026-10-08)

- **The split** (user decisions). P2b.2b.2b, the contact laws, lands in three steps, each with its own spec, plan and
  PR, before P2b.2b.2c:
  - **P2b.2b.2b.1** (`specs/2026-10-08-p2b2b2b1-hands-stance-design.md`): the stance from the hands. The user said a
    player "thinks primarily about hand position and point of impact". The input is `handsAhead`, the top hand's
    horizontal distance ahead of the striker's ball's centre along aim at contact. The lean follows from the rigid
    geometry, and the point of impact from the lean (R·sin α above the centre). The user chose this over taking the
    point of impact as the input, and over "lean now, hands later".
  - **P2b.2b.2b.2:** the strike and the turf. A Hertzian face–ball law with Gugan's measured e(U) and T(U); the
    ball–turf law under load (a transient hollow and ramp, a speed-dependent restitution, impulsive friction); the
    rolls' descent through contact, which reopens P2b.2b.2a's "hands arrive with no vertical velocity"; the hand's
    part in the second contact (Cross); the end-weighted head and the market's mallet dimensions. Modern heads are
    square, a new collider shape.
  - **P2b.2b.2b.3:** turf strike beyond a graze. The head in the new turf, ploughing and the grip breaking, checked
    against Gugan 5's jab stop. It precedes P2b.2b.2c because the AC stop's calibration rests on the head–turf law.
  - P2b.2b.2c is unchanged. Face presets beyond wood move to P3: only PTFE has measured data.
- **The success criterion** of P2b.2b.2b as a whole is qualitative. Each law has its analytic cases, and the rolls
  stop failing: no dead stop, credible distances, and the roll played as below. The ratios are recorded, not gated;
  P2b.2b.2c calibrates them. Amended 2026-10-08 after the slow-motion review: "no chatter" is dropped. Repeated
  short face touches during the carry are desirable so long as the angle holds. The evidence is the user's play (in
  a roll that feels good, the hands smooth out a firmer initial impact) and Cross's seven taps with "the ball sticks
  to the mallet". The model cannot add to it: its hands are joined to the mallet by HAND_COUPLING (T 0.08 s, ζ 0.7),
  which cannot pass 1 ms taps, so its hand force is smooth whatever the face does (full roll, 31°, 3 m/s: the face
  force goes 1640, 0, 198, 0 N in the first 6 ms while the hands' push eases from 149 to 110 N).
- **The rolls' face angles.** Gugan's measured values are taken over Riches' (user decision): half 24°, full 31°, pass
  34°, the means of Gugan 4 Table 6 at its 1° resolution. Riches' 15°, 45° and 48° stay in `profile.ts` as coaching
  cues. Gugan's two-ball drives and stops (Table 5, −8° to −2°) go to P2b.2b.2c as a sourced check. The user
  confirms that 31° looks like the full roll as played: players are coached to 45° and play closer to 31°.
- **The roll as played** (user, 2026-10-08), the target for P2b.2b.2b.2's "hand's part in the second contact". It
  describes behaviour, not a ratio, so it does not breach the circularity rule:
  - Through the push the hands keep the head behind the striker's ball and hold the face angle at about the contact
    lean. A small increase is acceptable as the player compensates, but never beyond 45°. The repeated face touches
    are part of the push: in a roll that feels good, the hands feel a firmer initial impact smoothed into a push.
  - As the push completes, the mallet arcs back through vertical and beyond before the shot is complete.
  - Pace is judged per shot, and finely. In a full roll the player judges the power so the two balls travel about
    equally. In a pass roll the momentum given to the striker's ball carries it past the croqueted ball, which is why
    a small split is needed. This is how players judge the shot; it is recorded, not used to tune the model.
  - Rolls are hard to play, and some of the skill is undocumented "art". Half rolls are easier to judge and more
    consistent than full rolls; the model's half roll is also its flattest ratio against speed (2.46–2.61 from 2 to
    4 m/s).
- **Housekeeping** needed no PR. The lockfile already pinned svelte 5.57.2, typescript-eslint 8.71.1 and vite 8.3.3;
  only a stale `node_modules` lagged. TypeScript 7.0.2 is blocked: typescript-eslint 8.71.1 needs TypeScript
  `>=4.8.4 <6.1.0`, and svelte-check needs `^5 || ^6`. The actions (checkout v7, setup-node v7) and `ubuntu-26.04` are
  current. The repo has no IaC.
- **The diagnosis** (a throwaway probe during design, on P2b.2b.2a's defaults; not kept).
  - **At 45°, the full roll.**
    - Contact 1 is the strike. It throws the head up and back and drives the striker's ball 2.2 mm into the turf.
    - Contact 2, at 5.6 ms, is the turf's linear spring (e 0.5) throwing the ball back into the face at 0.58 m/s.
    - Contacts 3–5 are the hands pushing the head onto the ball at 0.1–0.2 m/s, each bouncing at e 0.817.
    - The carry (26–46 ms) pins the ball, with turf forces up to 176 N and 0.9 N·s of friction. The ball slows from
      1.97 to 1.09 m/s while the head runs on.
    - At the 0.3 m reach the face drops onto the ball. From 3.75 m/s that happens inside the impact: the dead stop,
      ratio 23.6 at 3.75 m/s, 41.8 at 4.5 and 61.6 from knee. Below that speed it happens in phase 2, as the counted
      re-hit.
    - The croqueted ball leaves at 0.78 of the head's speed within 1.3 ms. From knee at intensity 1 the head reaches
      5.96 m/s and the croqueted ball goes 9.6 yd. A 30 yd roll needs a head at about 9.5 m/s: the effort ceiling,
      P2b.2b.2c's.
  - **At Gugan's leans**, the same planned speeds (ratio at 3 m/s / 4.5 m/s / from knee):
    - full roll at 31°: 1.84 / 1.74 / 1.81, with no re-hit, the croqueted ball from knee at 5.56 m/s;
    - pass roll at 34°: 1.01 / 0.90 / 0.94;
    - half roll at 24°: 2.57 / 2.62 / 2.70.

    Gugan's own ratios: full 1.20–1.24, pass 0.94–1.21, half 2.30–2.46.
  - The re-catches (0.1–0.4 m/s) and the turf's throw-back persist at every lean; they are P2b.2b.2b.2's. The model's
    descent at contact is 2–4°, against Gugan's stroke angle β of 6–16° on the rolls.
  - Implicated: the face law and the turf under load. Not implicated: head–turf contact (the head never touches the
    turf in these rolls) and the faces. The end-weighting is secondary.
- **Sources for P2b.2b.2b.2 and P2b.2b.2b.3** (cited, not mirrored; the Oxford Croquet pages fetched with `curl -k`).
  - **The roll's contact.**
    - The CA's Project Croquet Dynamics (https://croquet.org.uk/?d=1475): 30–58 ms of apparent contact on rolls.
    - Gugan 4 §10 (https://oxfordcroquet.org/tech/gugan4/): a 1 ms strike, then a second contact of about 5 ms. In
      rolls "the mallet makes an almost immediate second impact which may last for several milliseconds, and over
      this time controls the speed of the ball". The ground gives the spin.
    - Hall (https://oxfordcroquet.org/tech/hall/): over 7 ms on a full roll.
    - Cross, Eur. J. Phys. 38 014001 (2017) (https://oxfordcroquet.org/tech/cross1/): seven taps; "the ball sticks to
      the mallet", nudged at the mallet's speed. Cross puts it down to ground friction and the hand and arm.
    - Riches, on the half roll: "hit DOWNWARD on the striker's ball", the ball "squeezed forward".
    - Gugan 5 (https://oxfordcroquet.org/tech/gugan5/): a pass ratio of 0.83 from speed alone; ratios near 1 come
      from the angle.
  - **The face.** Gugan, Am. J. Phys. 68, 920 (2000), DOI 10.1119/1.1285850 (https://oxfordcroquet.org/tech/gugan/),
    on wood:
    - T falls from 0.97 to 0.79 ms over 2.19–5.50 m/s, T ∝ U^−0.23.
    - 1 − e² = 0.213 + 0.077·U^0.4, so e tends to about 0.89 at low speed. A speed-dependent e alone cannot stop the
      chatter.
    - Cross: the bottom hand near the head gives "a large increase in M" and lowers e.
  - **The turf under load.**
    - Gugan 4 Table 4(b): the distance to maximum penetration is 3.5–18 mm, as the ball "rolls along its transient
      pit". Impulsive sliding µ ≈ 1.0, double Hall's 0.48.
    - Penner, Can. J. Phys. 80, 931 (2002) (http://raypenner.com/golf-run.pdf; golf): an equivalent tilted plane,
      θc 15.4°; e = 0.510 − 0.0375|v| + 0.000903v².
    - Cross, Eur. J. Phys. 42 065006 (2021): the indentation forms a ramp.
    - Biber, Bristol PhD (2023): a nonlinear elasto-plastic turf.
  - **Head–turf:** no measurements exist.
    - Gugan 5's jab: the second tap at 0.400U against 0.463U unrestricted (0.295U at best).
    - Law forms: Katsuragi and Durian, Nature Physics 3, 420 (2007), DOI 10.1038/nphys583; Reece's earthmoving
      equation.
  - **End-weighting.**
    - Russ (https://oxfordcroquet.org/tech/russ/), head and shaft about the shaft's axis, kg·cm²: traditional round
      9" 33.4, rectangular 12" 37.6, RPM 11" 92 and 104, Pidcock 2000 146, Pidcock 3000 172.
    - Towlson (https://oxfordcroquet.org/tech/towlson/).
    - The engine's solid cylinder gives 47; JC Croquet claims about 150.
  - **Faces.**
    - Gugan 1 (https://oxfordcroquet.org/tech/gugan1/): PTFE's e falls about twice as fast as wood's.
    - Plummer: metal faces make rolls harder (anecdote).
- **The mallet survey** (makers' claims; Plummer's weighings are the only independent figures).
  - Heads run from 9" to 13.0" (the Terminator, 330 mm), mostly 10–12". Faces are mostly square, 50–64 mm; round heads
    are legacy only.
  - Heads weigh 0.87–1.05 kg (stated) and 0.99–1.04 kg (measured). Whole mallets weigh 1.10–1.55 kg, and overall
    length runs 30–42".
  - Against `mallet.json`: the head-length bound (9–12") and the shaft bound (32–36") are too narrow, and the round
    76 mm head is off-market. The head-mass bounds are fine.
  - The user's 42" shaft is within the market. Their 13.5" head is beyond any listed model, so bespoke.
  - Pages: https://oxfordcroquet.org/equip/mallets/, https://oxfordcroquet.org/equip/makingmallets/,
    https://www.woodmallets.com/croquet-mallet-options/, https://terminatormallets.com/uk-pricelist/,
    https://invictusmallets.com/pages/compare-mallets, https://croquetdev.com/mallets.html,
    https://www.croquet.org.uk/?p=games/tech/ChoosingMallet.
- **P2b.2b.2b.1 outcomes.** Measured by `scripts/strokeProbe.ts` and `scripts/swingProbe.ts` (node v26.11.0) on the
  default world and the default profile's canonical setups. The raw output is in
  `docs/superpowers/probes/2026-10-08-p2b2b2b1-strokeProbe.txt` and `…-swingProbe.txt`. Observations, not gates.
  - **The stance**, per preset (the probes' stance lines): the top hand ahead of the ball's centre, the lean and the
    point of impact. Single-ball, drive and GC stop −0.1603 m, 0°, 0 mm (the top hand over the socket); AC stop
    −0.2202 m, −4°, −3.21 mm; half roll +0.1964 m, 24°, 18.73 mm; full roll +0.1964 m, 31°, 23.71 mm; pass roll
    +0.1400 m, 34°, 25.74 mm. Each matches the design's §4 table.
  - **The fit** (`scripts/fitStrokeShape.ts`, unchanged): the rolls' h₀ and default backswings are 438.0 mm (half,
    was 391.6), 437.7 mm (full, was 452.4) and 448.8 mm (pass, was 467.4), each planning 3.0000 m/s; the hands' tempo
    0.4998 s as before. The single-ball, drive and GC-stop entries are byte-identical. The AC stop's `torqueMax`
    (27.65743634602026 to 27.657436346020255) and the `defaultSpeed` of the AC stop and the rolls (3 against
    3.0000000000000004, flipping either way) change in the last digit only: fit noise. The fit summary's AC-stop line
    is unchanged (27.6574 N·m, fall 0.5196 s).
  - **Bit-identity:**
    - the impact digest (with 2000 obstacle strokes) is identical;
    - the shot mix gives work units p99 143,084, p99.9 362,050 and max 408,030;
    - `SLOW_TESTS=1` passes (912 tests);
    - the upright presets' full-precision digest is identical over 81 runs on fixed backswings once the outcome's
      embedded `engineVersion` is normalised ("0.8.0" read as "0.7.0" before hashing; a raw comparison differs on
      that string alone), every θ_c exactly 0; and no single-ball, drive or GC-stop line of either probe changed;
    - the AC stop's drift over its 27 runs: at its canonical `up` (−20 mm) |Δθ_c| is 3e-17 rad, and its canonical
      figures are unchanged at the printed precision in both probes. Off-canonical, by design (§3.3 of the design:
      under fixed hands the lean follows `up`, about −0.082 rad/m at −4°), θ_c moves by −2.4538e-4 rad at `up`
      −23 mm and +2.4713e-4 rad at −17 mm. The largest relative change in planned speed is 4.3e-9; no run flips
      between rejected and accepted;
    - the reach-filter residue (a gentle AC stop at its canonical `up`, its hands `MAX_LEAD` early, 120,000 steps):
      7.17e-12 m against `WAKE_MARGIN` 1e-9 m, 140× headroom (was 6.55e-12 m, 153×), the AC stop's rounding-level
      lean carried through a 600 ms capped impact.
  - **The rolls**, against P2b.2b.2a's:
    - the ratios over 2, 2.5, 3, 3.5 and 4 m/s: half roll 2.46, 2.52, 2.57, 2.58, 2.61 (was 2.78–2.90); full roll
      3.38, 2.11, 1.84, 1.81, 1.74 (was 1.55, 1.69, 1.92, 1.84, 35.59); pass roll 1.57, 1.12, 1.01, 0.96, 0.95 (was
      1.10, 1.19, 1.37, 1.59, 1.75). The full roll's 4 m/s dead stop is gone; it now rises at 2 m/s instead (3.38);
    - the canonical runs (`strokeProbe.ts`; downswing 499.8 ms each): the lowest clearance 29.92, 37.05 and 40.16 mm
      at contact (was 21.11, 51.61, 54.72); the impact 45.1, 110.8 and 109.6 ms (was 37.6, 80.5, 65.6); the finish
      262.3, 306.2 and 169.2 ms (was 262.6, 263.0, 118.6); the head at the finish −2.35 mm up and 108.72 mm along aim,
      55.19 and 200.98, 15.14 and 267.10 (was −7.79 and 109.54, 28.15 and 243.46, 7.77 and 276.07); ratio 2.57, 1.84
      and 1.01 (was 2.85, 1.92, 1.37). In `swingProbe.ts`: the highest ball centre 0.94, 1.10 and 4.55 mm above R
      (was 0.82, 0.95, 2.16); braking hands −0.726, +0.682 and −1.849 N·s (was −0.682, −2.049, −4.018);
      `impact-off-face` 0, 1 and 0 (was 0, 1, 1); entry jumps 0;
    - the late re-hit's crossings: the half roll's canonical now crosses blue at 70.7 ms (it did not); the full and
      pass rolls' canonicals no longer cross (were 100.5 and 127.6 ms). Sweep runs crossing a ball: half roll 45 of
      225 (was 94), full roll 27 (135), pass roll 57 (220); none an obstacle;
    - the striker's face intervals (the re-catches; `strokeProbe.ts`'s `faults`): half roll 7, full roll 6, pass
      roll 11 (was 5, 6, 5), each a 29.1.6.1 possible fault on the striker's ball;
    - the cap and flag tallies of the `presets` sweep (225 runs each, none rejected): `impact-off-face` half 0, full
      180, pass 143 (was 0, 225, 180); the pass roll now raises `impact-cap` and `impact-head-approaching` on 14 runs
      each (was 0); the longest impact before the cap 272.9, 406.8 and 437.5 ms (was 140.3, 283.8, 276.1);
    - the 29.1.6.1 possible faults: still on the drive and the three rolls, as above;
    - also moved: coupling (T 0.04 / 0.08 s) half 1.82 and 6 hits / 2.57 and 7, full 1.57 and 7 / 1.84 and 6, pass
      0.63 and 4 / 1.01 and 11; effective mass by the strike 0.9545, 0.9328 and 0.9997 kg (closed forms 0.9737,
      0.9578, 0.9151, the pass roll 9.25 % above its own); the full roll's `timings` rows (ratio 1.79–2.57 within
      20 ms of on time but for the arc 20 ms early, 15.74; the arc 50 ms early 65.32).
  - **The AC stop's and the rolls' off-canonical `up` sweep rows**, re-recorded. Under fixed hands the lean follows the
    contact height (P2b.2b.2b.1 design §3.3). The AC stop's `presets`: `impact-cap` 15 of 180 (was 12),
    `impact-off-face` 61 (was 59), `impact-head-deep` 60 as before; its reach at 6 m/s 4.048114 m/s at `up` −3 mm
    and 4.048044 at +3 mm from the canonical (both 4.048079 before). Its `rehit` rows at `up` −23 and −17 mm moved by
    up to 3 ms; its sweep still crosses a ball on 13 runs. Its `timings` rows are unchanged.
  - **Test figures:** the rolls' `CANONICAL_CLEARANCE` and `CANONICAL_APPROACH` are 29.9165, 37.0506 and 40.1551 mm
    (each the analytic h₀ + (R + `START_GAP`)·sin α − ρ·cos α within 0.04 µm). The trajectory test's comment
    re-measured the head's acceleration as 38.5 to 196.9 m/s² ("~197", was "~205"); its 19.8 µm keeps "about
    20 µm". Gugan 4 was re-fetched: it now hashes `de69699e…`. That raw digest included the page's view counter and
    could not be reproduced; `reference/sources/README.md` now gives digests with the counter removed.
  - **What still waits for P2b.2b.2b.2 and P2b.2b.2b.3:** the dead stop and the follow-through re-hit of the
    canonical full roll are gone with the lean alone. The re-catches remain and on the pass and half rolls have grown
    (11 and 7 face intervals), and the ratios stay high against coaching (half 2.57, full 1.84); the half roll's
    canonical now has a late re-hit (it crosses blue at 70.7 ms); the full roll's ratio at 2 m/s (3.38) and
    early-mistimed arcs show the carry still pinning the striker's ball; the pass roll's new cap runs. These are the
    face–ball and turf laws' (P2b.2b.2b.2). Distances from knee remain short of a long hoop: the effort ceiling
    (P2b.2b.2c).
  - **The model's roll against the roll as played** (a throwaway probe and slow-motion export, 2026-10-08; not
    kept). The full roll at 2 m/s:
    - The croqueted ball goes further at 31° than at 45° (1.57 m against 1.02 m) because the flatter face puts more of
      the first strike forward. The striker's ball goes shorter (0.46 m against 0.65 m).
    - At 45° the head climbs over the striker's ball, reaches its position about 140 ms after the strike and drops
      onto it at 1.2 m/s. That is the old dead stop's and re-hit's mechanism.
    - At 31° the head stays 90–130 mm behind the ball and keeps a light push on it. At about 122 ms the hands reach
      the end of their 0.3 m follow-through and brake while the face is still on the ball, pressing it into the turf;
      that costs 0.49 m/s of the striker's ball's 1.04 m/s. Without it the ratio would be near 1.6 (an estimate).
    - In both, the pitch drifts the wrong way through the contact: from 31° to about 41° at 2 m/s and to about 44° at
      3 m/s, and from 45° to about 52°. Most of the drift is the swing arc past its lowest point; the strike adds a
      small upward kick. The hands press down with only 10–35 N.
    - Against the roll as played, P2b.2b.2b.2 should make the hands hold the angle and keep the head behind the ball
      through the push, release rather than brake at the push's end, and let the mallet arc back through vertical.
  - **Public:** `SwingStance.handsAhead` replaces `lean` in `src/engine/index.ts`'s types (`ENGINE_VERSION` 0.8.0).
- **The split of P2b.2b.2b.2** (user decision, 2026-10-09). It lands in three steps, each with its own spec, plan and
  PR, in this order, before P2b.2b.2b.3:
  - **P2b.2b.2b.2a** (`specs/2026-10-09-p2b2b2b2a-strike-turf-laws-design.md`): the strike and turf laws. A Hertzian
    face–ball law with Gugan's e(U) and T(U), and a recovering turf bed under the balls and their landings.
  - **P2b.2b.2b.2b:** the roll's stroke. The rolls' descent through contact and the hand's part in the second contact,
    to the roll as played. It must also close the pass roll pinned in its pit, a dead stop at every speed, and its
    validity item: the impact ending with the head overlapping the striker's ball as handed over (15 of 225 late
    re-hit runs, all at 1 m/s; "P2b.2b.2b.2a outcomes"), a handover artefact whose fix is a handover rule.
  - **P2b.2b.2b.2c:** the mallet. The square head as a new collider shape, the end-weighted head (Russ: 33–172 kg·cm²
    about the shaft against the engine's 47) and the market's dimensions.

  The laws come first because the diagnosis implicates them first; the stroke is then fixed on the new laws, and the
  mallet, secondary in the diagnosis, last.
- **The user's decisions for P2b.2b.2b.2a** (2026-10-09, the design's "Decisions"):
  - the face law's coefficients set at each closure, over a material Kuwabara–Kono law and over a linear law set at
    closure;
  - the bed of recovering cells as a field, over Penner's tilted plane, a single imprint and an elasto-plastic turf;
  - the speed dependence from the bed's recovery, over imposing Penner's e(v);
  - Hall's sliding friction, with Gugan's µ ≈ 1.0 held out, over a depth- or load-dependent friction;
  - phase 2's landings on the same bed, integrated, so that a slanted landing meets the pit and the ramp, over the
    constant 0.5 and over a table of the bed's vertical e(v);
  - a low-speed pre-flight gate after the bed's fit, which stops for the user before any landing result is trusted.
- **Spin after a bounce** (user, 2026-10-09): "bobble and bounce seem to reduce spin", "not absolute, but an
  observable effect". Recorded against the model's landings, not built in: in the shot mix the spin's size fell on
  82.6 % of the landings, the median ratio after to before 0.9525 ("P2b.2b.2b.2a outcomes").
- **The lawn** (user, 2026-10-09). "Hard dry ground is more elastic than soft grassier lawn. Slow lawns deform rather
  than bounce": P3's qualitative check for its lawn presets (the design's §7), not a fit target. Its consequence: a
  winter-rules variant that bans jump shots, because soft lawns deform and are damaged, recorded beside the deferred
  "divots and lasting turf damage" in the P2 row.

## P2b.2b.2b.2a outcomes (2026-10-09)

Measured by `scripts/strokeProbe.ts`, `scripts/swingProbe.ts`, `scripts/shotMix.ts` and `scripts/impactDigest.ts`
(node v26.11.0) on the branch at engine 0.9.0, against P2b.2b.2b.1's probe files and the shot mix and impact digest run
on `main` before any engine change. The raw output is in `docs/superpowers/probes/2026-10-09-p2b2b2b2a-strokeProbe.txt`,
`…-swingProbe.txt`, `…-shotMix.txt` and `…-impactDigest.txt` (the digests, the line counts and the first 40 lines), and
the fit's in `…-turfFit.txt`. Observations, not gates, but for exit criteria 2 and 3.

- **The fit** (`scripts/turfFit.ts`, to Gugan 4's A4R: e 0.5 and 7.2 mm at 5 m/s): k_w 1.62461e8 N/m³ and τ_r
  7.55047e-4 s, which give e 0.500000 and 7.2000 mm (relative errors 1.6e-8 and 4.3e-11) over a 5.18 ms contact. The
  stability check: the bed's damping at A4R's footprint about 255.5 N·s/m, 2m/c 3.55 ms against the 5 µs step. Grid
  convergence, h = 1 mm against 2 mm, at 2, 5 and 6 m/s: e within 2.9e-5 relative, the depth the same to 1 µm.
- **The low-speed gate** (the user's decision: accept and record; the design's amendments). The fitted bed's e over
  0.1–6 m/s: 0.38 at 0.1 m/s, 0.64, 0.66, 0.66, 0.64 and 0.62 at 0.2, 0.3, 0.5, 0.75 and 1 m/s, then 0.60, 0.57,
  0.54, 0.52, 0.50 and 0.48 at 1.5, 2, 3, 4, 5 and 6 m/s; Penner's golf fit runs from 0.51 to 0.32 over the same
  speeds. Drops of 0.05, 0.1 and 0.3 m settle in 7, 7 and 8 landings. For P3's lawn presets: the bed's e rises as the
  speed falls below 5 m/s (the Kelvin–Voigt signature) where Penner's levels off near 0.51. The user observed,
  anecdotally, that a golf ball is smaller, lighter and more elastic than a croquet ball; on turf the ball's own
  elasticity matters little, and m/R² is about twice as high for croquet, so it sinks deeper and Penner's 0.51 is
  likely a generous analogue. A note beside the comparison, not a fit target.
- **The held-out checks** (the design's §3.1 and §4.5):
  - Gugan's A2R and A3R: penetrations 5.31 and 5.81 mm against 4.0 and 5.0 mm (e 0.541 and 0.529). The model's depth
    goes as about v^0.6 against Gugan's near-linear rise; about 4.9 and 5.5 mm if the model's own e converts the
    rebound speeds.
  - The face at the impact's 5 µs step (a free head on a free ball, `strokeProbe.ts`'s `face`): e within 9.3e-5 of
    the fit at 0.5, 2.19, 2.83, 4.0, 5.5 and 6.0 m/s (worst at 6 m/s), and T within 0.18 % (−0.18 % at 0.5 m/s, a
    step's quantisation in 1.36 ms; 0.09 % or less elsewhere).
  - The rolls' pit (`pit`, each roll's canonical setup at 2 and 3 m/s, from the impact's start until the striker's
    ball first holds no cell after the strike): the apparent friction Σ|F_h|·dt over ΣF_z·dt is 0.21 and 0.21 (half),
    0.06 and 0.40 (full) and 0.44 and 0.46 (pass), against Gugan's µ ≈ 1.0; over every turf sample of the impact,
    0.25–0.40. The travel from the first held sample to the deepest point is 3.7 and 4.7 mm (half), 3.7 and 4.7 mm
    (full) and 20.1 and 29.1 mm (pass), against Gugan's 3.5–18 mm; the deepest δ 2.45–3.97 mm. The full roll at 3 m/s
    does not leave its cells before the impact ends (111.8 ms).
  - A ball rolling at 2 m/s from its static sink across a fresh bed slows to 1.9953 m/s over 50 mm (25.0 ms).
- **The rolls and the presets**, against P2b.2b.2b.1's:
  - the ratios over 2, 2.5, 3, 3.5 and 4 m/s: drive 2.51, 2.71, 2.92, 2.91, 3.14 (was 2.49, 2.90, 3.32, 3.02, 3.47);
    AC stop 5.55, 5.99, 6.46, 6.89, 7.26 (was 6.65, 6.54, 6.46, 6.41, 6.37), now rising with speed; half roll 2.43,
    2.49, 2.70, 2.83, 2.94 (was 2.46–2.61); full roll 1.07, 1.25, 1.46, 1.49, 1.45 (was 3.38, 2.11, 1.84, 1.81,
    1.74); pass roll 7.45, 11.27, 16.00, 20.47, 29.21 (was 1.57, 1.12, 1.01, 0.96, 0.95). The full roll's 2 m/s rise
    is gone, and it is nearest its coaching "about 1" at 2 m/s. The pass roll's dead stop holds at every speed, not
    just the canonical ("The pass roll pinned" below). The drive's 2.92 at 3 m/s (was 3.32) is below its coaching
    3–4: recorded only, as coaching ratios are never targets. The drive at guideEffort 0: 4.48, 5.57 and 6.53 at 2, 3
    and 4 m/s (was 5.63, 6.04, 6.05); the GC stop's ratio after the touch 2.90, 7.15, 8.97, 9.86 and 13.34 (was 2.86,
    7.38, 12.17, 16.28, 19.32);
  - the striker's face intervals (the re-catches, `faults`): half roll 3, full roll 11, pass roll 6 (was 7, 6, 11),
    each a 29.1.6.1 possible fault on the striker's ball as before; the drive's 2 and the other presets' 1 unchanged;
  - the canonical runs (`strokeProbe.ts`; the downswings unchanged): the lowest clearance 0.40 mm lower for every
    preset, the bed's deeper sink (single-ball, drive and GC stop 0.12 mm, was 0.52; AC stop 6.83, was 7.23; the rolls
    29.52, 36.65 and 39.76, was 29.92, 37.05, 40.16); the impact 58.8, 111.8 and 143.4 ms for the rolls (was 45.1,
    110.8, 109.6), the drive 180.6 (181.4) and the AC stop 21.4 (21.6); the finish 259.7, 297.4 and 187.5 ms for the
    rolls (was 262.3, 306.2, 169.2), with no flag on any preset; the head at the rolls' finish −4.48 mm up and 112.56
    mm along aim, 39.09 and 214.62, 70.12 and 246.67 (was −2.35 and 108.72, 55.19 and 200.98, 15.14 and 267.10);
  - in `swingProbe.ts`'s canonical runs: the highest ball centre 0.43, 1.49, 2.71, 1.32, 0.79, 0.66 and 3.43 mm above R
    for the single-ball, drive, AC stop, GC stop and the three rolls (was 0.85, 0.93, 4.19, 1.46, 0.94, 1.10, 4.55);
    braking hands −0.818, +1.047 and −1.130 N·s for the rolls (was −0.726, +0.682, −1.849), the others within 0.02;
    `impact-off-face` on the pass roll's canonical (was the full roll's); entry jumps 0;
  - the fat strokes (the single-ball stroke met 2–7 mm higher): the real speed at the first strike 2.70, 2.48, 2.30
    and 2.18 m/s (was 2.75, 2.51, 2.34, 2.22), the lead 1.1–2.1 ms longer, the turf 0.04–0.08 mm deeper;
  - the late re-hit's crossings: no canonical crosses a ball (the half roll's crossing at 70.7 ms is gone). Sweep runs
    crossing a ball: drive 18 of 165 (was 0), AC stop 12 (13), GC stop 39 (33), single-ball 30 (30), half roll 104 of
    225 (45), full roll 5 (27), pass roll 88 (57); none an obstacle. Runs ending the impact with the head overlapping
    a ball as handed over: pass roll 15 of 225, every one at 1 m/s (none before, on any preset), overlap 0.002–0.078
    mm against a 0.43–0.44 mm static sink.
- **The pass roll pinned** (user decision, 2026-10-09: recorded as findings, the mechanism deferred to P2b.2b.2b.2b).
  One mechanism carries the pass roll's ratios and the late re-hit's added crossings above (the drive's 0 to 18, the
  half roll's 45 to 104, the pass roll's 57 to 88): under the new laws the face and the follow-through keep working on
  a striker's ball sitting in its pit. The pass roll's dead stop holds at
  every speed (7.45–29.21 over 2–4 m/s, was 0.95–1.57), not just the canonical (handed over at 0.038 m/s punched and
  0.088 m/s coasted; the "punch beats coast" test is `it.fails`). **A validity item P2b.2b.2b.2b must close:** in 15
  of the pass roll's 225 late re-hit runs (all at 1 m/s) the impact ends with the head overlapping blue as handed
  over, 0.002–0.078 mm against a 0.43–0.44 mm static sink. It is an artefact of the handover, not geometric overlap
  inside the impact: the handover lifts blue 0.30–0.32 mm out of the bed's deeper pit to z = R beneath a head resting
  just clear of it, and against blue at the impact's last step the head is clear in all 15. Its fix is a handover
  rule (the head's clearance against the lifted ball), which touches P2b.2b.2b.2a's handover code.
- **The cap and flag tallies of the `presets` sweep** (225 runs a roll, none rejected): `impact-cap` AC stop 9 of 180
  (was 15), pass roll 0 (was 14); `impact-head-approaching` pass roll 0 (was 14); `impact-head-deep` AC stop 60 as
  before; `impact-off-face` drive 69 (was 91), AC stop 51 (61), GC stop 9 (9), half roll 0, full roll 27 (180), pass
  roll 176 (143); `impact-turf-pit` on no run of any preset, nor on any canonical, dip or timing run. The longest
  impact before the cap: half 85.4, full 392.5 and pass 447.6 ms (was 272.9, 406.8, 437.5), against the 450 ms cap.
- **The shot mix** (3000 shots, seed 7, the default lawn's bed):
  - work units per shot p99 152,168, p99.9 315,644 and max 405,196, against P2b.2b.2b.1's 143,084, 362,050 and 408,030;
    no fallback; 97.6 % of shots with no solve (was 97.7 %);
  - landings per shot p50 1, p99 4, p99.9 6 and max 7, 3,951 in all (was 6, 15, 26, 30 and 15,127): the bed's
    settling rule ends the small hops;
  - each landing on the bed: its duration p50 15.0 ms, p99 24.0, max 24.8; its travel p50 8.0 mm, p99 65.8, max 94.6;
    `landing-cap` never;
  - the landings' cost, counted apart from the solver's work units: steps per shot p50 1,645, p99 13,222, max 22,963;
    bed column visits per shot p50 92,232, p99 1,441,285, max 2,243,606. The engine's time per shot (machine-
    dependent) p50 4.1 ms, p99 53.3 and max 91.2 (was 0.23, 10.0 and 25.4). The solver's time rose less, p99 3.3 to
    5.9 ms and max 7.8 to 13.1; the landings carry the rest: the median shot has no solve but 1,645 landing steps,
    and the worst shot is now a hoop shot with no solve;
  - the spin against the user's observation: its size fell on 82.6 % of the landings, the median ratio after to
    before 0.9525.
- **The full roll at 2 m/s against the roll as played** (`asPlayed`; the baseline for P2b.2b.2b.2b, against "The
  model's roll against the roll as played"): 9 face intervals over the first 152.0 ms; the lean 31.00° at contact,
  never below it, and 39.67° at the last interval's end (about 41° before). The face's plane stays within −0.61 to
  +1.42 mm of the striker's ball's surface throughout, the head's centre 106.6–137.4 mm behind the ball's centre along
  aim (was 90–130 mm). The hands reach 0.8·handReach at 120.6 ms and rest at 180.1 ms; their force along aim is
  +10.3 N there, and at its lowest −55.2 N at the impact's end (162.3 ms); the striker's
  ball, at 1.29 m/s at the reach, loses 0.060 m/s while the face is on it after that (was 0.49 m/s of 1.04). The
  ratio at 2 m/s is 1.07 (was 3.38).
- **Cost** (machine-dependent, `cost` sections), beside P5's provisional ≤ 200 ms simulation ("Provisional
  numbers"): the roll impacts 6.8, 9.6 and 12.0 µs/step (was 1.7–1.8), the pass roll's `simulateImpact` 344 ms (was
  38) over 28,679 steps, alone above the budget; the upright presets 4.4–6.6 µs/step (was 1.7–3.0); the shot mix's
  engine time above. Recorded for P5, which measures it. For P5's budget, the landings' cost on the bed, not the
  solver, now drives phase 2's engine time.
- **Exit criterion 2**: phase 2's digest, its shots with no landing identical (299, none moved), the 301 with a
  landing moved; the impact digest moves in every case, as the design predicts (412 of 412 case lines differ; sha256
  `1293b79c…` and 4,961 lines before, `aa5f3ac3…` and 4,524 after).
- **Exit criterion 3** holds: every preset's canonical setup runs from top to finish with no `RangeError`, no
  re-entry guard hit, no ball centre more than 3.43 mm above R, no `follow-cap` and no entry jump.
- **Behaviour the design did not predict** (each in the design's amendments): the croquet drive's re-catch merges into
  its first contact; the stance's contact height moves 0.396 mm (predicted about 0.26); a centre-struck ball is handed
  over rising at about 4.7 mm/s, so routine strokes give phase 2 a µm hop and a bed landing; a 0.5 m drop settles in 4
  landings (was 12); the lattice pushes a resting ball sideways with up to 1.4e-3 of its weight; landings take 15–25
  ms (p50 15.0, p99 24.0, max 24.8), not the design's estimated 1–5 ms, so the 50 ms `landing-cap` has a margin of about
  2×, not 10×, and P3's presets must re-check it, as a softer or less damped lawn may reach it; the landings' cost,
  not the solver, now drives phase 2's engine time. **The pass roll**
  (the user's ruling, a model finding owned by P2b.2b.2b.2b): its follow-through pins the striker's ball in its pit,
  handed over at 0.038 m/s punched and 0.088 m/s coasted, and the "punch beats coast" test is `it.fails`.
- **Tests:** `npm test` 967 passed, 1 expected fail (the pass roll's), 2 skipped; the slow suite 969 passed and the
  same expected fail.
- **Public:** `FaceMaterial` loses `restitution` and `contactTime`; `SurfaceProps` gains `bedModulus` and
  `bedRecovery`; `ShotEvent` gains `landing-cap`; `ImpactEvent` gains `impact-turf-pit`; `ENGINE_VERSION` 0.9.0.

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
