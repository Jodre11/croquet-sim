# Croquet Shot Lab — Implementation Roadmap

**Spec:** `docs/superpowers/specs/2026-09-30-croquet-shot-lab-design.md`

The spec is delivered as five sequenced plans. Each plan produces working, tested software on its own and is
written only once its predecessor has landed, so it can build on real interfaces and sourced reference data
rather than guessed ones.

| Plan | Delivers | Exit criteria |
|---|---|---|
| **P1 — Foundations and free-motion engine** (`2026-09-30-p1-free-motion-engine.md`) | Repo scaffold and CI; sourced reference data for ball, court, Laws, lawn speed and free-motion friction/restitution; deterministic event-driven phase-2 engine (sliding → rolling → stationary, ball–ball, uprights, peg, halt margin); out-of-court and hoop-passage events; hoop-run verdict; `ShotResult` sampling | Analytic cases pass (5/7 rule, head-on exchange, stop distances); energy/momentum invariants; mirror symmetry; determinism; event solver agrees with brute-force integration within 1 mm (the angled three-ball wedge push is cross-checked with ball–ball friction off, because pushing contacts are frictionless) |
| **P2 — Impact phase and swing model** | **P2a.1 (lands first):** lift in free motion — airborne phase, landing event, 3D ball–ball contact normals, 3D impulse friction with impulsive turf friction, resting contact extended to airborne balls (3D normals, gravity; still frictionless), lift-aware hoop passage, out-of-court and halt, jump flag; sourced ball–turf restitution and crown clearance. **P2a.2:** Coulomb friction (3D, load-coupled) on coupled (pushing) contacts in `push.ts`, with stick/slip events and static friction in held clusters. **P2b.1** (`specs/2026-10-03-p2b1-impact-integrator-design.md`): reference data for face and turf contact and a typical mallet head; compliant small-step N-body impact integrator (mallet rigid body, balls, turf) driven by a force profile, tested with hand-built `ContactState`s; turf restitution and stiffness moved into `SurfaceProps`. **P2b.2** is split (decided 2026-10-04; see "P2b.2 decisions"). **P2b.2a** (`specs/2026-10-04-p2b2a-obstacles-faults-design.md`): ball–upright and ball–peg contact in the impact, a contact timeline, and a fault judge for the Laws' mallet faults (crushes, multiple contacts). **P2b.2b** is split (decided 2026-10-04). **P2b.2b.1** (`specs/2026-10-04-p2b2b1-swing-shot-design.md`): tracked drive as two arcs, the pendulum and the hands' path through space with its dip, each timed (and mistimable) by the player, two hands on a rigid shaft, in swing mode (single-ball, drive, stops) or carry mode (rolls), tracking the path's velocity from contact, the bottom hand releasing by reach; the whole head meeting the balls as a solid cylinder, with a re-entry guard; the GC stop a single-ball stroke over a gap to its target; mallet–turf contact, a lawn struck before the ball emerging from an early action; swing model `ShotSetup → ContactState` with provisional defaults, `simulateShot(setup)` wiring phase 1 into P1's phase 2, exported with the fault judge; 29.1.13's "plays away from" and 29.1.14 judged. **P2b.2b.2** is split (decided 2026-10-06). **P2b.2b.2a** (`specs/2026-10-06-p2b2b2a-stroke-shape-design.md`): the stroke shape. The backswing from its top, the downswing under gravity and the player's effort (effort and tempo one bounded intensity; a swing's pendulum leads, a roll's hands lead), the lead-in (a downswing meeting the turf simulated, the lead up to 150 ms), the follow-through to the stroke type's finish, and one `SwingTrajectory` from top to finish; the amplitude an input and the contact speed an outcome; the shape's figures sourced or labelled placeholders, the effort fitted to kinematics only. **P2b.2b.2b** is split (decided 2026-10-08; see "P2b.2b.2b decisions and findings (2026-10-08)"), each step its own PR, all before P2b.2b.2c. **P2b.2b.2b.1** (`specs/2026-10-08-p2b2b2b1-hands-stance-design.md`): the stance from the hands. The top hand's position at contact, `handsAhead`, replaces the shaft's lean as the input; the lean follows from the rigid geometry and the point of impact from the lean; the rolls take the face angles Gugan measured (24°, 31°, 34°). **P2b.2b.2b.2** is split (decided 2026-10-09), each step its own spec, plan and PR, in this order. **P2b.2b.2b.2a** (`specs/2026-10-09-p2b2b2b2a-strike-turf-laws-design.md`): the strike and turf laws, a Hertzian face–ball law with Gugan's e(U) and T(U), and a recovering turf bed under the balls and their landings. **P2b.2b.2b.2b** (`specs/2026-10-11-p2b2b2b2b-roll-stroke-design.md`, `plans/2026-10-11-p2b2b2b2b-roll-stroke.md`): the roll's stroke, to the roll as played. In carry mode the hands hold the mallet through a measured, compliant flex from contact on (each hand's measured hand–arm chain, a lagged push intent, the arm's posture-holding impedance until the ball first leaves the face), push forward on their own arc without braking, and hand over to a pendulum phase that swings the mallet through vertical; the stroke's inputs gain the pendulum phase's start and effort; the handover keeps a lifted ball clear of the head. **P2b.2b.2b.2c** (`specs/2026-10-12-p2b2b2b2c-mallet-design.md`, `plans/2026-10-13-p2b2b2b2c-mallet.md`): the mallet. The head a cylinder or a rounded box (an edge radius on a box of independent width and height), the box's moment about the shaft set from a measurement (the end-weighting); the shaft a uniform thin rod with mass, rigid on the head, its weight at its own centre; the default profile a real, market-central modern mallet, the Pidcock 2000 11" on a 0.325 kg shaft, with Plummer's typical figures filling its gaps. **P2b.2b.2b.3** (`specs/2026-10-14-p2b2b2b3-turf-strike-design.md`, `plans/2026-10-15-p2b2b2b3-turf-strike.md`; decided 2026-10-07): turf strike beyond a graze. The head meets the turf through a ploughing law on the plane turf (approach A): each column under the head bears elastic–plastically on the turf bed's own modulus and recovery, yields at p_y and keeps its set; the submerged columns, binned into strips, plough with Reece's cohesion term (c·d·N_c per unit width) and, with the sole's friction, act through one horizontal Cundall–Strack spring, so that a head can stick and rest. The hands' grip saturates at a force limit (435 N, Young's breakaway strength), its anchor sliding past it; the jab (`ShotSetup.stroke.jab`) is a player input, checked against Gugan 5's jab stop; it precedes P2b.2b.2c because the AC stop's calibration rests on the head–turf law. **P2b.2b.2c** is split (decided 2026-10-18), each step its own spec, plan and PR, in this order. **P2b.2b.2c.1** (`specs/2026-10-18-p2b2b2c1-single-ball-design.md`, `plans/2026-10-18-p2b2b2c1-single-ball.md`): the single-ball stroke. The finite-state guard; an effort law linear in ω, a simplification of Hill's force–velocity relation (Hill 1938), increasing and concave with no flat top, its ceiling at least 1.1 × the CA's measured 8.18 m/s; the backswing setting the length (Riches), the default backswing kept, speeds above its gravity-only 3 m/s reached by intensity and at or below it gravity-only (the user, at the pre-flight gate's ruling 2, 2026-10-18); the backswing's limit a body figure θ_max (where the shaft meets the groin; default 64.9°, knee height on the default mallet, from the user's account, ruled at the gate over the first proposal's 75°); the follow-through carried in swing mode by the hands' advance, so the rising and level styles are both played from inputs; the flick's lift left to emerge. **P2b.2b.2c.2** (`specs/2026-10-19-p2b2b2c2-croquet-fit-design.md`, `plans/2026-10-19-p2b2b2c2-croquet-fit.md`): the croquet strokes' fit, its first part. The sources and Gugan 5's ratio targets (the drive 4.23 ± 0.2 and the AC stop 7.15 ± 0.6 at 3 m/s, in `reference/swing.json`; the CA's travel unit, Gugan 5's stop speed, the ball makes); the fit's evaluator, solver and script; the distance check against the CA's measured mallet and ball speeds (the strike within 2–4 %, the distance gaps the lawns' pace); the arms' checking force (in swing mode a slid grip's anchor returned at the arm's own rate); the sensitivity probe; the drive's double hit diagnosed. The fit itself did not converge and moved on. **P2b.2b.2c.2b** (`specs/2026-10-21-p2b2b2c2b-squeeze-design.md`, `plans/2026-10-21-p2b2b2c2b-squeeze.md`; first scoped at P2b.2b.2c.2's fit, 2026-10-20, "Split: new step first", as the drive's follow-through, the impact's step convergence and the fit; its brainstorm, 2026-10-21, found the squeeze, moved the follow-through to a later step and set the fit aside): the croquet stroke's squeeze. A croquet stroke set up with the balls 0 to < 2 mm apart, enforced by the engine, the default 1 mm (the CA's measured gap); the strike judged against Gugan 4's ten filmed strokes, each speed read as Gugan read his (1 ms after the strike's last face and ball–ball contacts within a 15 ms window, so after his double tap), his strokes played with his effective mass, 2.30 ball masses; the impact's step convergence (the friction's re-stick after a sliding step fixed); a bounded search for what keeps truly touching balls apart, which found none (a known defect at gap 0, its cause traced: the face law too compliant and slow against the ball–ball law); Gugan 5's drive and stop across the gap, the timing, the scatter, the distance check, the jab, the AC stop's re-contacts, the effective mass and the landing and slide-to-roll share recorded and ruled on at the gate. **P2b.2b.2c.2c** (`specs/2026-10-22-p2b2b2c2c-contact-laws-design.md`, `plans/2026-10-22-p2b2b2c2c-contact-laws.md`; opened at P2b.2b.2c.2b's pre-flight gate, 2026-10-21, ruling A: "Open the face/ball–ball law step (constants from Gugan 4 Tables 1 and 2) before the follow-through"): the face and ball–ball laws. The face's T(U) and the ball–ball contact time re-set from Gugan 4's Tables 2 and 1, each converted from the video's timing (its clock started at first touch, gate ruling A1) to the law's parameter by a stated harness: the face by Hertz similarity, t0 0.579 ms at 3.26 m/s with Gugan 2000's q −0.23; the ball–ball 0.551 ms, the hoops and the peg following; Table 1's free collisions within a frame of 0.75 ms on video. The double tap within the strike (a face re-contact before the balls part) reported on `FaultReport`, never flagged, after the Laws (29.2.5, C29.11.1–3). A bounded search (candidates f and g) landed nothing. The touching stops C3S and C20S still miss at gap 0, the cause traced by a focused investigation to the face's and the ball–ball contact's matched time scales (a three-body push). The default gap moved to 0.75 mm, a deliberate fit within step noise (gate D). Gugan 5's drive and stop, the timing beside four sources each seen by its own instrument, the scatter, the distance check, the jab, the hands' effect, the strike's window, the effective mass and the camera threshold's reach recorded and ruled on at a two-stage gate. **P2b.2b.2c.2d** (planned as P2b.2b.2c.2c in P2b.2b.2c.2b's design, §13; renumbered 2026-10-22 when the law step went before it): the follow-through. The four follow-throughs the user described (force the arc, push the hands straight along the line, natural, stopped short) become a shot's own choice; the natural push grows with the swing's power; each stroke type gets a better default follow-through; the drive's late catch at 109 ms is a "push" in Gugan's sense ("Such pushes are of course always faults", Gugan 5; Law 29.1.6) and comes out of the physics; Gugan 5's "super pass-rolls" (a strong early second tap from "a lot of arm follow through"); from P2b.2b.2c.2c's design (decision 2), the user's braking stop ("actively attempt to reverse the swing, slowing the mallet head ... This probably begins before contact"); and the judging of the face's re-contacts after the balls part (shepherding, the push, the drive's late catch), which P2b.2b.2c.2c leaves flagged as possible fault 29.1.6.1 (its design §6, gate E). **P2b.2b.2c.3:** held-out validation (the rolls, with the head never overtaking the striker's ball and dropping into its path, counted on every roll's runs; stop → pass-roll, pull, stop-shot lift, Sutherland's stop-shot steps), the GC stop's distances, crush calibration, 29.1.6.3. The whole of P2b.2b.2c, as first scoped: calibration and validation: coaching-ratio reference data and the swing defaults, which are hands-assisted, not gravity-only (user, 2026-10-08: nearly every real swing has some help from the hands to set up, keep or increase its amplitude, and a gravity-only swing is typical only of a soft, low-amplitude tap; P2b.2b.2a's defaults, h₀ at intensity 0, lift the head about 46 cm for 3 m/s, so a default backswing needs typical heights from the user or a source; in part superseded by P2b.2b.2c.1's pre-flight gate's ruling 2, 2026-10-18: the default and every speed up to its gravity-only 3 m/s stay gravity-only by the user's choice, the hands helping only above it, an open item in "P2b.2b.2c.1 outcomes (2026-10-19)", "Carried open items"); the effort's ceiling and shape (see "User play data and checks (2026-10-08)": the ceiling is too low and the speed flattens above intensity 0.8); the contact-time fit; precondition for the T and ζ fit: a finite-state guard (a RangeError or a flag when the head state goes non-finite) in the impact's post-cap run, since a very stiff grip leaves NaN there (see "Carried open items"); the hand coupling's T and ζ, the arm mass, the reach slack and the grips fitted to the stop and drive ratios; the rolls, the stop → pass-roll ordering, pull and stop-shot lift as held-out validation; the GC stop's distances; crush calibration; 29.1.6.3; a bound on the hands' slid anchor, whose drift P2b.2b.2b.3 leaves unbounded (the GC stop's follow-through 0.378 m; user, 2026-10-17, "Accept 3D slide, reword"), through the arms' checking force. **P2b.2b.3** (decided 2026-10-06; first placed before P2b.2b.2 as P2b.2b.1b, then moved after it by the user: "first we must model the stroke shape and amplitude and calibrate to the different shot types, but we will need the model to be complete enough for the rest later"): the whole swing. The mallet is carried along the swing path P2b.2b.2 calibrates, the backswing from its top, the lead-in and the follow-through after the impact ends, and its head and its shaft (rigid on the head, from the socket to the top hand) are swept against every ball, the hoops' uprights and crowns, and the peg: in a real game they may lie in the swing's path and limit the playable stroke, and the crown stops the shaft when the head reaches through an open hoop (limiting the follow-through's arc) or is swung back through the jaws. Head–obstacle and shaft contact are new physics. On any crossing the impact integrator re-opens, so a ball that comes back into the follow-through's arc (stopped by a target, rebounding off a hoop or the peg, or pulling up short), another ball, a hoop or the peg is met within an integrated impact and the fault judge rules on it (29.1.6.1, 29.1.6.2, 29.1.11, 29.1.10; Law 29.3.2 lets the opponent leave the balls where they lie after the first stroke in error, so the re-hit's physics matters). P2b.2b.1 only counts the follow-through's crossings. Deferred beyond P2b but required in the final implementation: three- and four-ball cannons, including near a hoop or the peg; 29.1.10 by a part of the body (the mallet's part is P2b.2b.3's); variability of swing and aim (accuracy), a property of human input only, growing with the bottom hand's involvement (user, 2026-10-08), and conditions such as wind, under which a hoop could block a shot or a glancing blow redirect it or limit its power; divots and lasting turf damage, and with them a winter-rules variant that bans jump shots, because soft lawns deform and are damaged (user, 2026-10-09); a fully articulated body beyond P2b.2b.1's translating pivot: the feet, and the shoulder, elbow and wrist between them and the hands, from which the hands' position would follow (since P2b.2b.2b.1 the top hand's position at contact is the stance's input, and the bottom hand's position follows the rigid shaft); the Golf Croquet Rules' faults and remedies, in a GC-rules phase (until then a GC stroke is judged as an AC single-ball stroke) | P2a.1 (met): landing and above-equator strike analytic cases; bouncing balls settle; brute-force cross-check (now 3D) agrees within 1 mm including hopping scenarios. P2a.2 (met): generalised topspin-push closed form; angled wedge cross-check runs in the standard world (friction-off override removed) and agrees with brute force within 1 mm; no fallbacks (`approximate-hold`, `approximate-slip` or `budget-hold`) in limit-of-holding sweeps with friction on. P2b.1 (met): analytic contact, restitution, sticking and 5/7-roll cases through a real impact; invariants; `dt` convergence; handover accepted by phase 2; phase 2 bit-identical after the `SurfaceProps` move; stop-shot probe and stiffness sensitivity recorded. P2b.2a (met): obstacle analytic cases (contact time, restitution, stick and slip, the peg's own material); P2b.1 bit-identical without obstacles in reach (digest, shot mix, slow tests); no obstacle overlap handed to phase 2 (obstacle fuzz); fault table and the C29.20.4 sequences; crush geometry, with the crush distance recorded. P2b.2b.1 (met): tracked-drive, head–turf, head–ball and swing-model analytic cases; force-table drives bit-identical to P2b.2a; the swung body's effective mass at the face centre within 10 % of the head's mass on the drive's canonical setup, and measured by the strike; every default preset's canonical setup runs end to end with no re-entry guard hit and no ball centre more than 5 mm above R, its ratios recorded against the coaching ranges, the GC stop's distances after the touch over the gap, and the late re-hit's crossings. P2b.2b.2a: the downswing's analytic cases (the energy integral and the work–energy balance within 0.1 %); every preset's canonical setup run from top to finish with no re-entry guard hit, no ball above R + 5 mm and no `follow-cap`, its trajectory continuous at every boundary; force tables bit-identical; each preset's default planning 3 m/s within 2 % (or its sourced bound's nearest). P2b.2b.2b.1: the stance's analytic cases (the hands–lean round trip within 1e-12 rad, an upright shaft exactly upright at any contact height, the pose); every preset's canonical pose at its default lean; force tables and the upright presets bit-identical; the rolls' canonical setups run from top to finish as P2b.2b.2a's; each roll's refitted default planning 3 m/s within 2 %. P2b.2b.2b.2a: the laws' analytic cases; phase 2 bit-identical without a landing; every preset's canonical setup run end to end; the strokes and landings recorded. P2b.2b.2b.2b (met, with two exceptions the user accepted at the pre-flight gate; see "P2b.2b.2b.2b outcomes (2026-10-12)"): the flex's, the hands' arc's, the pendulum phase's, the finish's and the handover rule's analytic cases; the pass roll's "punch beats coast" test passes, its `it.fails` removed; no run of any preset's late re-hit sweep ends with the head overlapping a ball as handed over; the head stays on point behind the striker's ball (its centre behind the ball's along aim, every face contact no higher than R·sin 45° above the ball's centre, the lean at most 45°) on every roll's canonical runs at 2 and 3 m/s and over the preset sweep, each failure counted and listed (exception: the pass roll at 2 m/s, a late re-contact); the swing presets, force tables and phase 2 bit-identical; every preset's canonical setup run from top to finish as P2b.2b.2b.1's (exception: the pass roll's ball 19.17 mm above R, the turf's rebound); the pre-flight gate run and ruled on; the probe's figures recorded; `ENGINE_VERSION` 0.10.0. P2b.2b.2b.2c (met; see "P2b.2b.2b.2c outcomes (2026-10-13)"): the rounded box's, the inertia's, the shaft's and the validation's analytic cases; the ratchet: after the union, the box and the massless shaft, the impact digest, the shot mix's phase 2 and every preset's full-precision digest bit-identical to the baseline; after the default's switch the impact digest and the shot mix still bit-identical, every preset's lean kept within 1e-12 rad and each re-fitted default planning 3 m/s within 2 %; every preset's canonical setup run from top to finish as P2b.2b.2b.1's (the pass roll's turf rebound re-measured, 20.76 mm above R at 3 m/s, and accepted at the gate); no run of any preset's late re-hit sweep ends with the head overlapping a ball as handed over; the pre-flight gate run and ruled on; the figures recorded; `ENGINE_VERSION` 0.11.0. P2b.2b.2b.3 (done; met but for the two exceptions the user ruled on (2026-10-16, and at the pre-flight gate, 2026-10-17); see "P2b.2b.2b.3 outcomes (2026-10-17)"): the law's and the hands' limit's analytic cases (bearing, ploughing, the dead stop, the angle of attack, the hands' limit, symmetry and convergence); the ratchet: after the hands' limit every run that does not saturate bit-identical, the 109 that do listed; after the new law the impact digest, `impactProbe` and the shot mix's phase 2 unchanged and the preset digest moved only on runs whose head meets the turf (113, each listed); after `stroke.jab` at 0 all bit-identical; the regimes on their constructed setups: the graze and the head biting in occur, the weak stroke stopped dead does not (exception 1: the user's dig-in account, 2026-10-16, makes it a future feature, its test `it.todo`); Gugan's jab check fails, each graze's striker's ball gone at 0.523·U before the head reaches the turf (exception 2: "Keep .fails + ruling", 2026-10-17; P2b.2b.2c's arms' checking force may change it); every preset's canonical setup run from top to finish as P2b.2b.2b.1's (the pass roll's rebound re-measured, 20.76 mm above R at 3 m/s, unchanged); no run of any preset's late re-hit sweep ends with the head overlapping a ball as handed over; the pre-flight gate run and ruled on; the figures recorded; `ENGINE_VERSION` 0.12.0. P2b.2b.2c.1 (met; every gate item ruled by the user, 2026-10-18, and again at the gate's rerun, 2026-10-19; see "P2b.2b.2c.1 outcomes (2026-10-19)"): the finite-state guard's analytic cases, no catch on the gate's runs and every finite run bit-identical; the effort law's analytic cases, and on every swing preset over its backswing grid the contact speed strictly increasing and concave in intensity with no flat top; the ceiling: at intensity 1 from the body-limited top 9.0000 m/s on the single-ball, drive and GC stop presets and 9.1533 m/s on the AC stop; θ_max's analytic cases; the rising and level follow-throughs both played from inputs, no style named in the engine; the flick's lift emerging (the launch angle upward at leans −2° to +2°); the head-never-ahead tallies on every one-ball stroke taken to the gate (11 of 485 runs, every one a GC stop double tap, ruled a known gap); the ratchet: every carry-mode run, the impact digest, `impactProbe` and the shot mix's phase 2 bit-identical, 375 swing-mode preset runs moved, counted per preset; every preset's canonical setup run from top to finish as P2b.2b.2b.3's, unchanged, each default planning 3.0000 m/s; no run of any preset's late re-hit sweep ends with the head overlapping a ball as handed over; the pre-flight gate run and ruled on; the figures recorded; `ENGINE_VERSION` 0.13.0, the branch's last step (Task 9). P2b.2b.2c.2 (in part; divided at the fit, see "P2b.2b.2c.2 outcomes (2026-10-20)"): met, the tidy with every test and probe otherwise unchanged; the sources read and cited and their three checks recorded (the CA's travel unit, Gugan 5's stop speed, the ball makes); the checking force's analytic cases, every run whose slid offset stays null bit-identical, the GC stop's slid anchor re-measured on `main` and after and ruled at the gate; the sensitivity probe run and the pair to fit ruled; the ratchet after the tidy and after the checking force; the pre-flight gate reduced to its sections A (on `main`'s model), B, C and H, run and ruled on; the figures recorded; `ENGINE_VERSION` 0.14.0, the branch's last step. Moved to P2b.2b.2c.2b with the fit: the distance check's run on the fitted model; both ratios within Gugan 5's tolerances; the fitted values within their bounds and recorded; the effective mass re-measured on the fitted model; the ratchet after the fit; Gugan's jab and the grip-limit control run; every preset's canonical setup and no impact ending with the head overlapping a ball, on the fitted model. P2b.2b.2c.2b (met, with the known defect at gap 0 the user accepted at the pre-flight gate, 2026-10-21; see "P2b.2b.2c.2b outcomes (2026-10-22)"): the gap's analytic cases (0 to < 2 mm in the test support and the engine's check, the gap in the rejection's message, the default 1 mm); the ratchet bit-identical at gap 0 before the default moved, then after the convergence fix and the default's move except the runs each moved, listed and counted per preset; the search run, no candidate passing, each result recorded and ruled; every judged figure step-converged (moving by under a tenth of its tolerance across dt/2, dt and 2·dt) after the friction's fix, the default step unchanged; the filmed strokes' means within Gugan's uncertainty with C3S and C20S left out, and with all ten counted on w₁/W alone (the touching stops' miss, the defect at gap 0, ruled); the checks run and recorded (the timing, Gugan 5's drive and stop across the gap at both restitutions, the scatter, the distance check, the jab, the AC stop's re-contacts, the effective mass, the landing and slide-to-roll share); every preset's canonical setup run from top to finish, each default planning 3.000000 m/s, and no run of any preset's late re-hit sweep ending with the head overlapping a ball as handed over; the tidy; the pre-flight gate run and ruled on; the figures recorded; `ENGINE_VERSION` 0.15.0, the branch's last step. The fit moved here from P2b.2b.2c.2 was set aside: nothing was fitted, and the fitter stays dormant. P2b.2b.2c.2c (met in part, as the gates ruled: the touching stops' miss at gap 0 recorded with its cause and carried; see "P2b.2b.2c.2c outcomes (2026-10-23)"): the laws re-set from Tables 2 and 1 through stated harnesses, with their analytic cases; Table 1's free collisions within a frame of 0.75 ms on video, e 0.72, the last step's `it.fails` passing; C3S and C20S at gap 0 missing on every figure (ruled after an investigation); the gapped strokes' means passing on v₂/U and w₁/W, v₂/w₁ missing, and all ten passing on w₁/W alone; possible fault 29.1.6.1 no longer raised for a re-contact within the strike, each tap reported; the default gap ruled (0.75 mm); the checks run, recorded and ruled; the step convergence re-checked (the drive at 1 mm just over a tenth of its tolerance, marked `it.fails`); every preset's canonical setup run from top to finish, each default planning 3.0000 m/s, and no run of the late re-hit sweep ending with the head overlapping a ball as handed over; the tidy; the two-stage pre-flight gate run and ruled on; the figures recorded; `ENGINE_VERSION` 0.16.0, the branch's last step. P2b.2b.2b.2c and P2b.2b.2b.3: each law's analytic cases, and the rolls stop failing (no dead stop, credible distances, and the roll played as "P2b.2b.2b decisions and findings (2026-10-08)" describes: the angle held, never beyond 45°, through a push whose repeated face touches are acceptable); the ratios recorded, not gated (user, 2026-10-08). P2b.2b.2c: standard stroke ratios within tolerance of sourced figures (stop shot and drive are calibration targets, the rolls held-out validation; see "P2b.2 decisions"); stop → pass-roll monotonic; pull emerges on wide rolls without special-casing; stop-shot lift emerges in the AC stop (striker's ball clear of the turf during the transfer, meeting the croqueted ball just above its equator, no jump flag). P2b.2b.3: the head and the shaft are swept along the whole swing (backswing, lead-in and follow-through) against every ball, the uprights, the crowns and the peg; every crossing, including those the P2b.2b.1 probe counts, is integrated as a further contact within the impact and judged (29.1.6.1, 29.1.6.2, 29.1.11, 29.1.10); head–obstacle and shaft contact analytic cases; the crossing counts re-measured. |
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
    is a precondition of P2b.2b.2c's fit (see its row). Closed by P2b.2b.2c.1's guard (see "P2b.2b.2c.1 outcomes
    (2026-10-19)", "Carried open items").
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
  10 s). Checks for the default "typical club player" (amended by the user, 2026-10-18: "only weaker, high handicap
  players can't drive the lawn"): a full-power drive reaches the full length, only a weaker player's falls short; a
  full-lawn full roll is more challenging than a full-lawn drive; both fall shorter on slow lawns, all from the
  lawn's deceleration with no special handling.
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
- **The roll as played** (user, 2026-10-11, the P2b.2b.2b.2b brainstorm; the design's "The roll as played"). It
  extends the account of 2026-10-08 and describes behaviour, not a number to fit:
  - **Two phases.** A conscious hands-forward push with the mallet at the stance's angle, then, depending on the power
    and the ratio wanted, the pendulum action continued or accelerated towards the end of the stroke. The body takes
    whatever position it needs to maintain the push, so the model cares about the hands, not the body.
  - **The hands' path.** The hands travel forward but dip a little during the push, which keeps the face on the ball
    while the mallet's angle rises from about 31° to about 42°. The dip is a flex: the arms and wrists give as the
    balls and turf resist the push, and the recovery from it helps drive the balls. The hands rise again in the
    pendulum phase. The low point falls partway through the push or at its end, later for a longer push. The hands
    feel as if on a shallow arc whose centre is high above, perhaps more ovoid than circular.
  - **The angle** rises through the push as the flex gives, a few degrees above the contact lean, never beyond 45°.
    The head stays behind the striker's ball, and the repeated face touches are part of the push.
  - **The phasing, per shot.** The ball's position back in the stance sets the push's length. The player chooses how
    hard to push and when to start the pendulum phase; a harder push needs it sooner, and a harder, punchier pendulum
    phase sends the striker's ball further. A close-range roll uses a short push and little pendulum phase; a
    full-lawn roll needs a long, fast push with excellent timing of the pendulum phase. Starting the pendulum phase
    too soon is a common mistake and gives a poor shot. The player thinks mainly of where the balls should end up;
    choosing the inputs from a target is the planner's job (P4).
- **The user's decisions for P2b.2b.2b.2b** (2026-10-11, the design's "Decisions"):
  - compliant hands on an intended path, over a rigidly prescribed hands' path alone and over today's path plus an
    angle spring alone: "Let's model it and see what emerges, it may need refinement";
  - the intended path is the hands' own arc, a shallow circle in the swing plane centred high above, descending into
    contact (correcting the first draft's level path); its shape a per-player preset, a flagged placeholder like
    `handAngle` (`handArcRadius` 1.5 m, `handArcLow` 0.5);
  - the flex's form: a stiffness rising linearly with the hand's force and a constant damping ratio, both from the arm
    literature;
  - the pendulum phase's driven effort ships in this step (spec review), over letting go alone with the effort
    deferred to P2b.2b.2c: it is the player's control for sending the striker's ball further;
  - the hands descend at contact ("partway through the push: the hands still descend at contact"), reopening
    P2b.2b.2a's "hands arrive with no vertical velocity"; Gugan's 6–16° descent a held-out check, never a target;
  - a pre-flight gate that stops for the user on the canonical rolls; calibration waits ("We can calibrate when/if
    it works": P2b.2b.2c);
  - at plan review, on the plan's decision 2 (the intended path from the actual grips' positions, with the planned
    velocity, not the actual): "Planned velocity".
- **Vocabulary** (P2b.2b.2b.2b design). "Split" and "ratio" keep their croquet meanings only: a split sends the balls
  off in significantly different directions, and the ratio is the two balls' relative travel. The distribution of
  time and effort between a roll's two phases is its **phasing**; the second phase is the **pendulum phase**, the
  rotation about the top hand that the downswing already calls the pendulum (`pendulumShare`). An established croquet
  term, if one exists, is a later rename.
- **The P2b.2b.2b.2b pre-flight gate's rulings** (user; the record, with each round's result, is the header of
  `docs/superpowers/probes/2026-10-11-p2b2b2b2b-gate.txt`). On the flex as first built the face let the striker's ball
  go: its damping, about 12 N·s/m against the old hands' 198, gave about 12 N of recovery against 120 N.
  - Round 1 (2026-10-11): option 3, the push intent, "match resistance, capped", amended: "The hands are primed and
    the brain is expecting the resistance but they are still human hands." A lagged, capped push intent (d807ecb,
    2df07f8).
  - Round 2 (2026-10-11): "Add fast impedance". A hand mass on grip tissue, Dong et al. 2013, lumped (52b297b).
  - Round 3 (2026-10-11): "Full arm chain". Dong et al. 2013's x_h chain per hand (4edb059).
  - Round 4 (2026-10-11): "Fix the lever pair". Stopped at the trace: the lever pair is exact and unique; no change.
  - Round 5 (2026-10-12): "Trace pitch lag, smooth alpha". A continuous α in the held slope (f99f831); the pitch lag
    starts with the blow on the light head, and the flex sets its recovery.
  - Round 5's trace (2026-10-12): "Trace the ball rise". The turf bed's elastic rebound: the leaning face presses the
    ball 3.09 mm in and lets go faster than the bed unloads; the ball leaves at 0.623 m/s.
  - Round 6 (2026-10-12): "Face follows the ball". Stopped: the push intent is the wrong lever; its lag keeps it flat
    through the 3 ms release.
  - Round 7 (2026-10-12): "Firmer grip, sourced". Stopped: no parameter-level grip-force dependence of the x_h model.
  - Round 8 (2026-10-12): "Read Aldien 2005 in full". A firm-grip fit is not feasible: one total-impedance curve per
    grip level against fifteen parameters, and its 30 N magnitudes disagree with Dong's.
  - Round 9 (2026-10-12): "Trace the head's rise". Not a plan defect: the soft flex turns the plan's lead into about
    10 N against the bed's 100–200 N, so the face lets go; a flex ten times stiffer holds it (1.33 mm).
  - Round 10 (2026-10-12): "Source arm impedance". A firm hold measures ×1.0–1.7 (at most ×3), not ×10; the lever is
    the task behind k₀, rhythmic interaction against posture holding.
  - Round 11 (2026-10-12): "Posture holding in the push". k_hold 744 N/m (Patel et al. 2014) and c_hold 20.7 N·s/m
    (Tsuji et al. 1995) through the push (c5dcb29).
  - Round 12 (2026-10-12): "End the hold when the ball goes". Stopped: "leaves for good" has no causal definition
    without a tuned value; the late contacts come from the plan's push outrunning the ball.
  - Round 13 (2026-10-12): "Relax from first departure". The hold relaxes with τ_push from the ball's first departure
    from the face (7843e2b).
  - Round 14 (2026-10-12): "Go on with round 14". The gate accepted at 7843e2b, the skipped cases re-baselined with
    their figures, and two follow-ups for the next phase: the plan's push outrunning the ball and the turf bed's
    elastic rebound.
  - The levers ruled out, each with its trace in the gate record: the lever pair (exact, not spurious); the push
    intent as the face's follower (too slow); a firm grip (Aldien 2005 unsourceable at the parameter level); and arm
    impedance at ×10 (a firm hold measures ×1–3).
- **The handover rule's rulings** (user, 2026-10-12). The late re-hit sweep found four off-canonical runs whose
  handover threw, each ball sunk deeper than its static sink at the impact's end. "Trace it first", then "Option 1
  alone": the rule's bound is the ball's actual depth at the impact's end, max(sink, min(R − z, `TURF_PIT_DEPTH`))
  + `CONTACT_TOLERANCE`, `TURF_PIT_DEPTH` the engine's existing 1 mm pit bound (4fbee79).
- **The turf and the jump shot** (user, 2026-10-12). A future jump shot (the ball driven into the ground, its energy
  returned so it jumps a hoop) depends on the turf's rebound. Any turf loss must be sourced, and tested against both
  the roll's press and a jump drive. The turf is never tuned against the roll's figures.
- **The user's decisions for P2b.2b.2b.2c** (2026-10-12, the design's "Decisions"):
  - housekeeping needs no PR: the lockfile pins the latest of every dependency; TypeScript 7 stays blocked
    (typescript-eslint 8.71.1 needs `<6.1.0`, svelte-check 4.7.6 `^5 || ^6`); the actions and `ubuntu-26.04` are
    current; the repo has no IaC;
  - the default mallet becomes a market-typical square, end-weighted head, over the user's bespoke mallet and over
    keeping the cylinder as the default; every preset moves and is re-recorded; the cylinder stays a supported shape;
  - the end-weighting enters as the measured moment about the shaft (Russ's quantity), over a composite of body and
    inserts (unpublished by makers) and over a uniform box only;
  - the shaft gains mass in this step, a uniform thin rod, over deferring it to P2b.2b.2c;
  - the square head is a rounded box, over a sharp box: continuous normals across the bevels, a sharp box its
    zero-radius limit;
  - a discriminated head shape (approach A), over a single rounded box replacing the cylinder and over a generic
    support-function collider: the cylinder's code stays byte-for-byte, so each step has a bit-identical before and
    after;
  - the face law keeps the head's mass in its reduced mass; the end-weighting acts through the rigid body; the
    off-centre closure is P2b.2b.2c's;
  - the default is anchored on one real, measured mallet, the Pidcock 2000 11", with Plummer's typical figures for its
    gaps, each flagged, over per-field medians of the market (which can combine into a head that cannot exist), over
    Fenwick Elliott's "Watts 2" head and over Towlson's Bamford/Hobbs head;
  - the edge radius is 3 mm, a flagged placeholder (no bevel figure is published), over a sharp box and over 5 mm;
  - settled at spec review (2026-10-12): the head–turf law keeps the head's mass; force tables stay the bare
    cylinder's instrument (`validateImpact` rejects a box or a shaft of mass on a force plan); the measured moment is
    the box's alone, and required for it; the box keeps independent width and height;
  - at plan review (2026-10-13), the plan's decisions 1 (`headBottom` is also the head–turf contact point) and 5 (the
    gate's old-head figures from the baseline taken on `main`), both accepted.
- **The P2b.2b.2b.2c pre-flight gate's rulings** (user, 2026-10-13; the record is
  `docs/superpowers/probes/2026-10-13-p2b2b2b2c-gate.txt`, its "== Ruling ==" section):
  - the gate: **"Go on"**; no run threw, old, new or held;
  - the provisional rulings B–E, made when the default was switched: **"Confirm all"**:
    - B: the canonical AC stop no longer meets the turf (its clearance at contact 8.39 → 14.55 mm); its three
      mechanism tests run on `LEGACY_MALLET`, the P2b.2b.2b.2b round head;
    - C: the sunk-ball handover on whole rolls no longer arises on the box; its four runs use `LEGACY_MALLET`;
    - D: the effective mass at the face is 1.1095 kg against the head's 1.0 kg; its test's bound is
      0.9·m ≤ m_eff ≤ M, M the swung body's mass;
    - E: 45 preset-digest runs moved from rejected to accepted (every 1 m/s, up +0.003 run of single-ball, drive and
      stop-gc): their downswing no longer meets the turf early;
  - the pass roll's re-measured rebound, 20.756 mm above R at 3 m/s (11.577 mm at 2 m/s) against the accepted
    19.17 mm, stands, and is written into its skipped test's comment.
- **The user's decisions for P2b.2b.2b.3** (2026-10-14, the design's "Decisions"):
  - housekeeping ships as a separate PR first: typescript-eslint 8.71.1 → 8.71.2 is the only bump; TypeScript 7.0.2
    stays blocked (typescript-eslint 8.71.2 needs `>=4.8.4 <6.1.0`, svelte-check 4.7.6 `^5 || ^6`); the actions and
    `ubuntu-26.04` are current; the repo has no IaC;
  - the grip that breaks is the player's, not the turf's hold on the head;
  - the hands' grip has a force limit, over flagging and ending the stroke and over hands that hold whatever the load.
    Whether the grip releases violently or the hands simply cannot push further is moot: either way the head is
    stopped and the hands cannot drive it on. One saturating limit models both;
  - Gugan's jab is a held-out check, banded, over a fit target and over a figure recorded with no band;
  - the jab is the AC stop's deliberate grounding of the head to break its momentum. Players use both it and the
    hands' check; the user finds the jab highly effective on a hard stroke, but its downward motion conflicts with
    hitting the ball slightly on the up;
  - the canonical AC stop stays the hands' check, and the jab is a player input, over a jab default and over two
    presets; ruling B stands (the canonical AC stop clears the turf);
  - the law is approach A, a ploughing law on the plane turf from the head's submerged section, over the head on the
    balls' cell bed and over a Poncelet drag at the lowest point;
  - grip tension does not scale the limit; a loose, surprised grip is a P3 refinement;
  - the turf's strength "very variable depending on the consistency and moistness of the turf": the defaults are one
    lawn's, and `turfYield` and `turfMatStrength` are `SurfaceProps` fields that P3's lawn presets vary.
- **The planning rulings for P2b.2b.2b.3** (user, 2026-10-15, before the plan; its decisions 1 and 2):
  - the ploughing depth is measured below each column's entry floor, d = δ − s_entry (0 in fresh turf, −s in a furrow
    the head has left), not as the column's elastic deflection e: yield caps e at p_y/k_w, about 1.48 mm, which would
    hold the ploughing under about 15 N across the face;
  - the horizontal spring carries the bed's tangential damping, as `bedLoad`'s does: an undamped spring keeps a stuck
    head oscillating, and the dead stop could never come to rest.
- **The rulings during P2b.2b.2b.3's execution** (user, 2026-10-16):
  - the hand's slide keeps the plan's decision 24 as written: the firm grip resets as `tangentialForce` does, and
    carry mode's chain slides by the excess over the palm's and fingers' stiffness;
  - Mak & Chen's Eq. 1 ends ·w·sin(α + δ), which the design's §4.3 left out of its quotation: leave the factor out,
    and show its effect at the gate. It resolves an inclined blade's force to the horizontal; the head's face and heel
    are near vertical (sin(90° + δ) = cos δ, about 0.85–0.9), N_c is already off its geometry (rake 18.5°, labelled),
    and c's bounds absorb it;
  - "at rest" is the full |v|, counting the vertical speed (the design said horizontal only; a plunging head ended
    the impact before it yielded);
  - once the ball has gone (struck, the drive done, no face contact), the head–turf pair no longer holds the impact
    open: the turf contact hands over to the follow-through, which carries the bed;
  - the regimes' search adds `contact.up` from 0 to 0.02 m (a positive `up` strikes lower) with small jabs, 1–6 mm,
    amending the plan's decision 19 (first relayed as −0.02 m; the sign corrected by the controller, the user told);
    biting's qualifying test requires head–turf contact;
  - a dig-in, from play: an unintentional gross mis-hit, at any speed, when the head is off target low enough; likelier
    when casting hard, because the dip lands early, about 10 cm before the ball. The common case is the graze: lost
    power and the shot not attempted, otherwise only lawn damage. The stopped regime is therefore not gated; a dig-in
    is a future feature, needing a relaxed gross-mis-hit rule and shaft–ball contact.
- **The P2b.2b.2b.3 pre-flight gate's rulings** (user, 2026-10-17; the record is
  `docs/superpowers/probes/2026-10-16-p2b2b2b3-gate.txt`, its "Gate round 1" sections):
  - the gate: **"(a) Go on"**;
  - Gugan's jab check: **"Keep .fails + ruling"**: it stays `it.runIf(SLOW).fails`, its comment giving the ruling and
    the cause (the striker's ball gone at 0.523·U before the head reaches the turf);
  - the early-dip test: **"Along the lawn + rename"**: P2b.2b.1 §8.1's "sends the striker's ball off slower" narrows
    to the speed along the lawn, since the early heel lifts the ball (vz 0.238 against 0.059 m/s); the test is
    retitled "… sends the striker's ball slower along the lawn";
  - biting: first **"Yes, require overlap"** (`grip-limit` within a head–turf interval), which found no run, since
    `grip-limit` fires only on a hand's first saturation, there with the head out of the turf; then **"Hand held at
    limit in turf"**: biting is the top hand held at its 435 N limit, to within 1 ppm, at any step while the head is
    in the turf, read from the hand force, the engine unchanged;
  - the ploughing probe: **"Yes, run it"**: the ploughing scaled ×0.9 and ×0.85 for the dropped sin(α + δ) changes no
    verdict;
  - gate round 1: **"Go on"**;
  - the final review, the hands' slide (plan decision 10): **"Accept 3D slide, reword"**: the slid anchor moves along
    the excess force, held in the head's frame, so it can drift partly across the shaft; the GC stop's follow-through
    drift reaches 0.378 m from the 435 N limit alone. Bounding it is left to P2b.2b.2c (the arms' checking force).

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

## P2b.2b.2b.2b outcomes (2026-10-12)

Measured by `scripts/strokeProbe.ts` and `scripts/swingProbe.ts` (node v26.11.1) on the branch at engine 0.10.0
(162746e plus Task 9's probe sections), against P2b.2b.2b.2a's probe output from `main`. The raw output is in
`docs/superpowers/probes/2026-10-12-p2b2b2b2b-strokeProbe.txt` and `…-swingProbe.txt`; the pre-flight gate's record is
`…/2026-10-11-p2b2b2b2b-gate.txt`. The rulings are in "P2b.2b.2b decisions and findings" above and in the design's
amendments. Observations, not gates, but for the exit criteria.

- **The arm's sourced values** (`reference/contact.json`; the sources, digests and quotes in
  `reference/sources/README.md`, cited, not mirrored). Measurements of the human arm only, none tuned to a croquet
  figure:
  - the rhythmic flex: k₀ 116 N/m (`armStiffness`) and m_arm 0.4465 kg (`armEndpointMass`), Fortineau et al. 2023's
    means; ζ_arm 0.69 (`armDampingRatio`), derived from the same means; κ 2.55 N/m per N (`armStiffnessPerForce`),
    Takagi et al. 2020's slope against grasp force, an analogue extrapolated from 5–20 N to a roll's push;
  - the pendulum phase's push: F_pendulum 64.3 N (`pendulumForce`), Hallbeck 1994's isometric wrist flexion as tabled
    by Napper et al. 2023;
  - the push intent (gate round 1): F_push 92.2 N (`pushForce`, Das and Wang 2004, one arm's push at extreme reach)
    and τ_push 0.125 s (`pushResponseTime`, Augustsson et al. 2025, a voluntary force rise);
  - each hand's chain (gate rounds 2–3): Dong et al. 2013's x_h 5-DOF mean property-based model, forearm 0.344 kg,
    hand 0.178, fingers 0.081, palm and finger skin 0.015 and 0.016 kg, and K1–K4 9988, 3991, 43,205 and 109,271 N/m
    with C1–C4 36.0, 56.2, 57.0 and 65.8 N·s/m (K0 and C0 recorded, replaced by the slow flex);
  - the posture-holding push (gate round 11): k_hold 744 N/m (`armHoldStiffness`, Patel et al. 2014, fore–aft at 0 %
    co-contraction) and c_hold 20.7 N·s/m (`armHoldDamping`, Tsuji et al. 1995), relaxing with τ_push from the ball's
    first departure (round 13).
- **The rolls against the roll as played** (`asPlayed`, each roll's canonical setup at 2 / 3 m/s; byte-identical to
  the gate's round-13 output):
  - the head on point: half and full rolls hold at both speeds; the pass roll holds at 3 m/s and **fails at 2 m/s**
    (the face's contact 33.49 mm above the ball's centre against R·sin 45° 32.55 mm, the lean 43.38°, at 136.8 ms);
    the head's centre at least 140.93 / 145.54 mm (half), 102.31 / 127.10 (full) and 91.01 / 122.83 (pass) behind
    the ball's;
  - the face intervals: half 4 / 3 over 216.9 / 26.5 ms, full 7 / 3 over 112.1 / 35.1 ms, pass 8 / 5 over 136.8 /
    26.3 ms (2a at 3 m/s: 3, 11, 6);
  - the lean through the contact: half 21.44–28.69° / 23.97–25.68°, full 31.00–39.89° / 31.00–36.24°, pass
    33.99–43.38° / 33.99–37.50°, never beyond 45°; the follow-through's highest pitch past vertical on every run,
    12.03–19.42°;
  - the finish: half 962.3 / 904.6 ms, full 823.1 / 639.1 ms, pass 816.6 / 586.2 ms; the full and pass rolls at
    3 m/s with `follow-head-deep`, the rest unflagged;
  - the hands' dip: lowest −6.96 / −8.74 mm (half, at 69.0 / 62.0 ms after contact), −16.18 / −20.25 (full, 83.0 /
    70.0 ms), −12.49 / −8.00 (pass, 392.0 / 57.0 ms); at the finish +1.76 to +11.22 mm, risen again;
  - the head's descent at contact 11.84 / 11.42° (half), 8.31 / 8.24° (full), 9.62 / 9.49° (pass), against Gugan's
    6–16° (2a at 3 m/s: 9.70, 3.05, 4.48°);
  - the hands' force along aim at the pendulum phase's start 9.1 / 22.3 N (half), 9.3 / 16.8 (full), 18.9 / 23.0
    (pass); its least after the push −4.9 N (half 2 m/s; at 3 m/s the impact ends before the push does), −11.3 /
    −20.9 (full), +3.7 / −25.7 (pass): the flex's spring and damper only, no brake;
  - the striker's ball loses 0.39 / 0.80 m/s (half), 0.33 / 0.64 (full) and 0.65 / 1.03 (pass) while the face is on
    it; the flex's step at contact 0.00 N on every run (decision 2);
  - the ratio 1.75 / 3.08 (half), 1.57 / 1.48 (full), 0.70 / 0.90 (pass).
- **Exit criterion 4 over the preset grid** (`onPoint`, 225 runs a roll): half 0 off point, full 71 (45 at 1 m/s, 22
  at 2, 4 at 3), pass 141 (45 at 1 m/s, 41 at 2, 29 at 3, 14 at 4, 12 at 6), round 4 having had 0 / 52 / 79. Every
  miss is the face's contact above R·sin 45° (full 33.0–46.0 mm, lean 38.9–42.5°; pass 32.8–45.8 mm, lean
  40.4–52.7°); of the pass roll's 141, 28 also lean beyond 45° (2 at 3 m/s, 14 at 4, 12 at 6; the most 52.7°),
  counted from the round-13 onPoint lines with python3 -I and the same in the strokeProbe record; the rest miss on
  contact height alone; no run ends with the head past the ball's centre. The counts were taken at the gate, before the
  handover limit (4fbee79), and they stand: on point is measured over the impact (the head behind the ball, the
  contact height, the lean), from the integrator's impact snapshots, and the handover acts only after the impact's
  end, so it cannot change them. This run, after 4fbee79, reproduces the gate's sweep byte for byte.
- **The pendulum-timing sweep** (`timing`, `pendulumAt` 0.2 / 0.4 / 0.6 / 0.8 / 1.0; ratio, then the striker's
  distance):
  - half roll, 2 m/s: 2.57, 2.60, 2.55, 1.75, 1.69 (0.72–0.73 m, then 1.11 and 1.13 m); 4 m/s: 3.46, 3.00, 3.53,
    3.52, 3.52 (2.03–2.41 m);
  - full roll, 2 m/s: 1.57, 1.52, 1.54, 1.57, 1.57 (1.00–1.03 m); 4 m/s: 3.09, 1.58, 1.90, 2.49, 2.50 (1.91, 3.72,
    3.11, 2.37, 2.40 m);
  - pass roll, 2 m/s: 0.78, 0.78, 1.01, 0.70, 0.87 (1.29–1.79 m); 4 m/s: 1.18, 1.05, 1.04, 1.05, 1.03 (4.15, then
    4.67 m).

  The full roll at 4 m/s is the most sensitive to the phasing (its striker's distance 1.91–3.72 m), as the user
  expects of a long, fast push; the half roll's is sensitive at 2 m/s. Recorded only.
- **The held-out checks** (`heldOut`, each roll at 3 m/s, against measurements never fitted):
  - the head's descent at contact against Gugan 4's stroke angle, 6–16°: half 11.42°, full 8.24°, pass 9.49°, all
    inside; through the push it turns upward (to −16.49°, −27.59° and −24.78°), the head rising off the ball;
  - the apparent contact against the CA's 30–58 ms: half 26.5 ms, full 35.1, pass 26.3; the full roll inside, the
    others just short;
  - the second contact against Gugan 4's and Hall's several milliseconds: it starts 5.9 ms (half), 6.2 (full) and
    4.4 (pass) after the strike's end;
  - the face intervals against Cross's seven taps: 3, 3 and 5;
  - the ratio against Gugan's: half 3.08 (2.30–2.46), full 1.48 (1.20–1.24), pass 0.90 (0.94–1.21); P2b.2b.2c
    calibrates them.
- **2a's items, re-recorded** (the swing presets' lines are byte-identical to 2a's in both probes, but for the
  machine-dependent times):
  - the ratios over 2, 2.5, 3, 3.5 and 4 m/s: half roll 1.75, 2.84, 3.08, 3.27, 3.52 (was 2.43, 2.49, 2.70, 2.83,
    2.94); full roll 1.57, 1.77, 1.48, 1.61, 2.49 (was 1.07, 1.25, 1.46, 1.49, 1.45); pass roll 0.70, 0.83, 0.90,
    0.98, 1.05 (was 7.45, 11.27, 16.00, 20.47, 29.21): the pass roll's dead stop is gone at every speed. Drive, AC
    stop and GC stop unchanged;
  - the striker's face intervals on the canonicals (`faults`): half roll 3, full 3, pass 5 (was 3, 11, 6), each still
    a 29.1.6.1 possible fault on the striker's ball; the swing presets unchanged;
  - the late re-hit's crossings: no canonical crosses a ball. Sweep runs crossing a ball: half roll 0 of 225 (was
    104), full roll 27 (5), pass roll 33 (88); the swing presets unchanged (single-ball 30, drive 18, AC stop 12, GC
    stop 39); none an obstacle. The rolls' new crossings come at 1 m/s 356–450 ms after contact, the head at rest at
    the push's length and the ball creeping on beneath its rim, 0.000–0.024 mm deep (the pass roll also at 2 m/s on
    two runs and at 3 m/s, drive −1, on seven);
  - the handover's overlaps (**exit criterion 3**): no run of any preset ends with the head overlapping a ball as
    handed over (was 15 of the pass roll's). `swingProbe.ts` now counts a ball only above `CONTACT_TOLERANCE`
    (1e-9 m), the rule's own threshold: without it the half roll would count 11 runs, each overlapping by less than
    0.0005 µm. The four runs whose handover threw before 4fbee79 now clear by 1.07–1.65 mm sideways;
  - the cap and flag tallies of the `presets` sweep (225 runs a roll, none rejected): `impact-cap` half roll 1, full
    4 (was 0, 0); `impact-head-approaching` full roll 4 (was 0); `impact-off-face` full roll 83 (27), pass roll 127
    (176); `impact-head-deep` and `impact-turf-pit` on no roll run. The swing presets' tallies unchanged;
  - the longest impact before the cap: half 288.1, full 449.2 and pass 407.8 ms (was 85.4, 392.5, 447.6), against
    the 450 ms cap;
  - in `swingProbe.ts`'s canonical runs: the highest ball centre 3.72, 2.29 and 19.17 mm above R for the rolls (was
    0.79, 0.66, 3.43); braking hands −0.467, −1.189 and −2.466 N·s (was −0.818, +1.047, −1.130), the full roll's
    hands now pushing, not braking; the bottom hand's release (the pendulum phase's start) at 66.3, 81.4 and 83.1 ms
    after contact, Δθ −5.50°, −10.66° and −14.66°; no impact flag on any canonical; entry jumps 0;
  - cost (machine-dependent, beside P5's provisional ≤ 200 ms simulation): the roll impacts 11.1–12.4 µs/step
    (`strokeProbe.ts`) and 10.5–12.4 (`swingProbe.ts`, medians), was 6.8, 9.6 and 12.0; `simulateImpact` 149, 345
    and 347 ms for the half, full and pass rolls (was 127, 339 and 572 in the baseline run), the full and pass rolls
    above the budget; the follow-throughs 89,207–167,665 steps at 2.8–2.9 µs/step. The swing presets' step counts
    are unchanged.
- **The rolls' re-fitted backswings** (Task 4, `scripts/fitStrokeShape.ts`): h₀ 435.4 mm (half, was 438.0), 433.7
  (full, 437.7) and 443.9 (pass, 448.8), each planning 3.0000 m/s, the hands' tempo 0.4998 s; the hands now arrive
  descending on their arc, so a smaller backswing reaches the same speed. The swing presets' entries are
  byte-identical. In `speeds` the rolls plan about 1 % faster at each fixed backswing for the same reason.
- **Also moved, by design:**
  - the canonical runs (`strokeProbe.ts`): the impact 66.3, 154.9 and 140.2 ms for the rolls (was 58.8, 111.8,
    143.4), the finish 904.6, 639.1 and 586.2 ms (was 259.7, 297.4, 187.5), the head at the finish 46.31, 67.10 and
    49.96 mm below and 711.73, 782.42 and 752.77 mm along aim from contact;
  - the pit (`pit`): the striker's ball leaves its cells by 8.8–9.5 ms on the half and full rolls and by 29–30 ms on
    the pass roll, at 2 and 3 m/s (the full roll at 3 m/s never left before the impact's end); the travel to the
    deepest point 3.57 / 4.51 mm (half), 3.43 / 4.33 (full) and 3.83 / 4.93 (pass, was 20.10 / 29.07), now inside
    Gugan's 3.5–18 mm but for the full roll at 2 m/s; the apparent friction 0.24 / 0.22, 0.017 / 0.016 and 0.37 / 0.39
    against Gugan's µ ≈ 1.0;
  - coupling (T 0.04 / 0.08 s): the rolls no longer read `HAND_COUPLING` after contact, so both rows agree (half
    3.08 and 3 hits, full 1.48 and 3, pass 0.90 and 5);
  - effective mass by the strike: 0.9427, 0.9092 and 0.9026 kg (was 0.9816, 0.9719, 1.0460), the pass roll now
    −1.37 % from its closed form (was +14.31 %);
  - tracking with no ball and no turf: the carry departs from its path by 3.5–5.2 cm and 0.05–0.14 rad through the
    push, and by 0.55–0.66 m after it (was µm): the soft flex sags under the swung body's own motion, and after the
    push the pendulum phase swings the head off the path by design;
  - the full roll's `timings` rows: within 10 ms of on time the ratio 1.47–1.73 (was 1.28–1.67); the arc 20–50 ms
    early 2.67–3.01 (was 1.63–2.01); the hands 20–50 ms early 1.87–2.33 (1.69–2.52); the dip rows 1.46–1.48 (1.46).
- **Re-recorded test figures** (Tasks 4–6; each "was … → now" chain is in the design's amendments and in the tests'
  comments): the pass roll's "punch beats coast" passes, punched 1.8882 m/s against coasted 1.3607 (was `it.fails`);
  the full and half rolls' highest ball 2.29 and 3.72 mm above R; the half roll's finish 904.6 ms; trajectory.test's
  lead outlasting the downswing now finishes at θ −0.192 rad, 427.7 ms; hands.test's power roll 3.63e-6 m and 4.97e-6
  rad; the arrival tolerances in track.test and buildContact.test 8 digits; hands.test's push-end bound 2e-5 m.
  Still skipped: the pass roll's R + 5 mm (19.17 mm) and followThrough.test's deep follow-through (a planned dip
  always lands inside the impact).
- **The handover's corrections on a swing preset** (Task 7): none. Instrumented over every test outside
  `handover.test.ts`, the rule never moved a ball; only its own tests do. The swing presets', force tables' and phase
  2's results are unchanged.
- **Exit criterion 5:** the swing presets' full-precision digest (904 lines, `engineVersion` normalised) is
  byte-identical through every task and gate round; the impact digest shows no diff; phase 2's lines in the shot mix
  are unchanged (Task 8).
- **Known gaps and follow-ups** (for the next phase; each with its trace):
  - **The pass roll's ball rise** of 19.17 mm above R at 3 m/s is the turf bed's elastic rebound (gate round 5's
    trace): the leaning face presses the ball 3.09 mm in and lets go faster than the bed unloads, and the ball
    leaves at 0.62 m/s. Exit criterion 6's R + 5 mm case stays skipped. **The user's note (2026-10-12):** a future
    jump shot, the ball driven into the ground and its energy returned so that it jumps a hoop, depends on the turf's
    rebound. Any turf loss must be sourced, and tested against both the roll's press and a jump drive. The turf is
    never tuned against the roll's figures;
  - **the late re-contacts** come from the plan's push outrunning the ball (gate round 12's trace): after the ball
    has gone, the planned push runs on to its full length faster than the ball, and at 2 m/s the hold still has
    about 38 % of its excess at the pendulum phase's start (121.6 and 124.8 ms). So the pass roll at 2 m/s fails exit
    criterion 4 (33.49 mm, 43.4°);
  - **the pass roll's lean beyond 45°:** 28 of its 141 off-point runs lean past 45° (2 at 3 m/s, 14 at 4, 12 at 6, up
    to 52.7°), untraced. It is counted on its own, beside the contact height above R·sin 45° that every miss shows.
    The final review's figure of 29 is not reproduced: the lean column of both probe records gives 28;
  - the full and pass rolls at 3 m/s finish `follow-head-deep`: the pendulum phase swings the head into the turf;
  - the full roll at 1 m/s (drive −1, up +3 mm) never releases the ball: the head's rim presses it down (n_z −0.95,
    2.2 N) from 221.7 ms until the 450 ms cap (Task 8's trace);
  - the impact's quiet end can fire while the ball is still rising from the turf: the pass roll at 2 m/s, drive +1,
    up −3 mm ends 0.25 ms after its last face interval with the ball 723 µm deep and the bed pushing it up (12.5 N
    against its 4.4 N weight), the head 33 µm over it (Task 8's trace);
  - the arms hold at k_hold indefinitely when no ball departs, the pendulum phase and the follow-through included;
  - the planned rate of a carry check reverses inside the continuous held slope, where the linear fall held it at
    rest (the slope's net travel still 0; swing mode untouched);
  - two model artefacts (the gate's review): the hand skin carries no weight before contact, and the bottom skin's
    momentum is discarded at the release;
  - the late re-hit crossings at 1 m/s (full roll 27, pass roll 33) are recorded but untraced; they likely share a
    cause with the 1 m/s full roll never releasing the ball;
  - the `rising` latch has no hysteresis: one step of positive pitch rate in the pendulum phase can end the
    follow-through at a micro-apex. The canonical runs are fine; off-canonical finishes are unmeasured. The next phase
    should record the finish's pitch and time in swingProbe's sweep;
  - the rolls' ratios stand above Gugan's for the half and full rolls, and below it for the pass roll (0.90 against
    Gugan's 0.94–1.21); calibration is P2b.2b.2c's.
- **Tests:** `npm test` 1053 passed, 4 skipped (the pass roll's R + 5 mm, followThrough.test's deep follow-through
  and two slow cross-checks); the slow suite 1055 passed, 2 skipped (Task 8).
- **Public:** `ShotSetup.stroke` gains `pendulumAt?` and `pendulumEffort?`; `SwingDrive` gains `pendulumAt`,
  `pendulumEffort`, `handArcRadius` and `handArcLow`, and loses `groundDepth`; `ENGINE_VERSION` 0.10.0.

## P2b.2b.2b.2c outcomes (2026-10-13)

Measured by `scripts/strokeProbe.ts`, `scripts/swingProbe.ts` and `scripts/impactProbe.ts` (node v26.11.1) on the
branch at engine 0.11.0 (7d9ba78 plus the probes' headers), against P2b.2b.2b.2b's probe output taken on `main` before
any change (the plan's decision 5). The raw output is in `docs/superpowers/probes/2026-10-13-p2b2b2b2c-strokeProbe.txt`,
`…-swingProbe.txt` and `…-impactProbe.txt`; the pre-flight gate's record, with the old, new and held runs at 2 and
3 m/s, is `…/2026-10-13-p2b2b2b2c-gate.txt`. The rulings are in "P2b.2b.2b decisions and findings" above and in the
design's amendments. Observations, not gates, but for the exit criteria. "Old → new" throughout.

- **The default mallet** (`reference/mallet.json`, `src/engine/swing/profile.ts`; the sources, digests and quotes in
  `reference/sources/README.md`, cited, not mirrored). The anchor is the Pidcock 2000 11", a wooden body with brass
  end blocks and composite faces, the only market mallet with a measured moment that also has a published length and
  whole mass:
  - the moment about the shaft 0.0146 kg·m² (146 kg·cm²), Russ's bifilar measurement, head and shaft together, used
    as the head's (the shaft's own share under 1 kg·cm², an error under 0.7 %);
  - the head's length 0.2794 m (11"), Russ's and Plummer's sample table;
  - **fills**, the Pidcock 2000's own figures unpublished: the head's mass 1.0 kg (Plummer's typical head), the face
    57.15 mm (2.25") square (Plummer's typical faces, the lower end), the shaft's length 0.9144 m (36", USCA and
    Plummer);
  - **derived**: the shaft's mass 0.325 kg, Plummer's whole mass for the Pidcock 2000 (1325 g) less the head's fill,
    inside the published shafts (RPM's 8–10 oz, Plummer's 14 oz);
  - **placeholder**: the edge radius 3 mm; no bevel figure is published anywhere;
  - the moment is realisable: in [2.72, 197.9] kg·cm² for this head, 73.8 % of the maximum (a uniform box of the same
    size gives 67.8); the head's I_z 47.2 → 146.0 kg·cm²;
  - two specimens: Russ's 146 and Plummer's 1325 g come from different mallets; the design records it, as it does the
    fills. The design's §6 also flags the rod's thinness: its moment about its own axis is taken as 0.
- **The canonical runs** (`strokeProbe.ts`'s `canonical`, each preset at its default backswing, 3.0000 m/s planned):
  - the least clearance on the downswing: single-ball, drive and GC stop 0.12 → 6.22 mm, AC stop 6.83 → 11.18 mm,
    half 29.52 → 39.18, full 36.65 → 45.94, pass 39.76 → 48.82 mm (the rolls' least at contact); no lead on any;
  - the impact's length after contact: drive 180.6 → 154.1 ms, AC stop 21.4 → 20.0, half 66.3 → 67.2, full
    154.9 → 153.9, pass 140.2 → 93.4; single-ball and GC stop 10.0 both;
  - the finish: single-ball 509.9 → 498.2 ms, drive 549.4 → 531.3, AC stop 53.1 → 136.8, GC stop 98.4 → 94.1, half
    904.6 → 856.7, full 639.1 → 692.6 and pass 586.2 → 445.7, the full and pass rolls `follow-head-deep` both;
  - the head at the finish, up and along aim from contact: single-ball 141.2 → 155.0 and 468.9 → 486.2 mm, drive
    205.6 → 240.1 and 569.0 → 600.3, AC stop −7.6 → −10.1 and 11.2 → 11.8, GC stop 0.2 both and 17.5 → 17.1, half
    −46.3 → −37.4 and 711.7 → 741.5, full −67.1 → −58.9 and 782.4 → 833.7, pass −50.0 → −63.8 and 752.8 → 670.3;
  - at 2 m/s (the gate): the half roll's impact 230.9 → 103.0 ms, its two late face intervals gone; the full roll now
    finishes `follow-head-deep` (was unflagged); the pass roll's impact 155.8 → 193.0 ms.
- **The highest ball centre above R** (`swingProbe.ts`'s `canonical`): half 3.72 → 4.27 mm, full 2.29 → 1.94, pass
  19.17 → 20.76; single-ball 0.86, drive 2.92, AC stop 3.37 and GC stop 1.31 (the swing presets −0.02 to 2.63 on the
  old head, the gate's). Exit criterion 4: every canonical run under R + 5 mm but the pass roll's, whose rebound is
  re-measured below.
- **The pass roll's turf rebound** (exit criterion 4): 19.17 → 20.756 mm above R at 3 m/s, and 8.90 → 11.58 mm at
  2 m/s. A rise of 1.59 mm went to the gate; the user ruled "Go on" (2026-10-13), and the figure is written into the
  skipped test's comment.
- **The face intervals and their regions** (`canonical`, `faults`): the regions touched are "face" on every canonical
  but the drive's, now "face, edge": its second contact (at 128 / 109 ms at 2 / 3 m/s) meets the box's rounded edge
  and raises `impact-off-face`. The pass roll at 2 m/s touches "edge" where it touched "rim", the shape's name for
  it. The striker's face intervals (`faults`): pass roll 5 → 4, each still a 29.1.6.1 possible fault; the rest
  unchanged (single-ball 1, drive 2, AC stop 1, GC stop 1, half 3, full 3). At 2 m/s the half roll's fell 4 → 2 and
  the full roll's rose 7 → 9.
- **The ratios over 2, 2.5, 3, 3.5 and 4 m/s** (`ratios`, croqueted ÷ striker; recorded, not gated):
  - drive 2.51, 2.71, 2.92, 2.91, 3.14 → 2.59, 2.86, 3.31, 4.49, 5.88 (coaching 3–4); at 4 m/s it now hits the ball
    once, not twice; with guideEffort 0 at 2 / 3 / 4 m/s 4.48, 5.57, 6.53 → 4.07, 5.01, 5.88;
  - AC stop 5.55, 5.99, 6.46, 6.89, 7.26 → 5.08, 5.52, 5.91, 6.32, 6.65 (coaching 6–10);
  - half roll 1.75, 2.84, 3.08, 3.27, 3.52 → 2.42, 2.73, 2.94, 3.10, 3.30 (about 2);
  - full roll 1.57, 1.77, 1.48, 1.61, 2.49 → 2.21, 1.54, 1.55, 1.80, 2.19 (about 1);
  - pass roll 0.70, 0.83, 0.90, 0.98, 1.05 → 1.33, 1.11, 0.92, 1.00, 1.06 (below 1).
- **The cap and flag tallies of the `presets` sweep**: single-ball, drive and GC stop 165 runs (60 rejected) → 180
  (45), ruling E; `impact-off-face` drive 69 → 84, AC stop 51 → 57, GC stop 9 → 12, full 83 and pass 127 unchanged;
  `impact-head-deep` AC stop 60 → 0; `impact-cap` AC stop 9 → 15, half 1 → 0, full 4 → 0;
  `impact-head-approaching` full 4 → 0; `impact-turf-pit` on no run. The longest impact before the cap: single-ball
  24.4 → 10.0 ms, drive 317.8 → 288.9, AC stop 316.3 → 271.2, GC stop 331.4 → 58.7, half 288.1 → 320.6, full
  449.2 → 427.1, pass 407.8 → 413.5. The 6 m/s rejections stand (180 runs, 45 a swing preset): the stroke's reach
  4.0530 m/s at 0.8431 m → 4.0894 m/s at 0.8336 m (4.0844 on the AC stop). The sharp box's lateral reach (the
  design's §3.4) raised no `impact-head-approaching` on the box.
- **The AC stop's dip** (`dip`): the turf is met only from a 13.0 mm dip, where the old head met it from 8.0 mm;
  "depths meeting both" 8.00–11.00 → 13.00–14.00 mm, against the profile's 11.00 mm. So the canonical AC stop no
  longer meets the turf (ruling B).
- **The late re-hit's crossings** (`rehit`; sweep runs crossing a ball): single-ball 30 / 165 → 9 / 180, drive
  18 / 165 → 39 / 180, AC stop 12 → 9 of 180, GC stop 39 / 165 → 42 / 180, half 0 of 225 both, full 27 → 10 and pass
  33 → 24 of 225; no canonical crosses, no obstacle is crossed, and **no run of any preset ends with the head
  overlapping a ball (exit criterion 5)**. Through hoop 1 with the face 10 mm off the ball's centre the old head
  crossed blue at 57.3 ms and struck the hoop at 100.0 ms; the new head makes no crossing, and its shaft meets the
  crown at 154.1 ms, 0.039 mm deep (centred: 143.2 → 154.1 ms, 0.006 → 0.014 mm).
- **The effective mass at the face centre along aim** (`mass`; the closed form carries the shaft, the design's §4.4):
  the closed form 1.0066 → 1.1095 kg (single-ball, drive, GC stop), AC stop 1.0278 → 1.1391, half 0.9737 → 1.0477,
  full 0.9578 → 1.0216, pass 0.9151 → 1.0057; the strike on every ball against it: single-ball −0.49 → −0.73 %, drive
  +0.18 → +0.13 % (1.1109 kg), AC stop −3.84 → −4.20 %, GC stop −11.19 → −12.30 %, half −3.19 → −3.16 %, full
  −5.08 → −2.79 %, pass −1.37 → +2.40 %. The test's bound is 0.9·m ≤ m_eff ≤ M (ruling D).
- **The re-fitted h₀ and backswings** (`scripts/fitStrokeShape.ts`, `reference/swing.json`): single-ball, drive and
  GC stop 461.9 → 448.6 mm, the fall 0.4998 → 0.4890 s, `torqueMax` 28.97 → 32.28 N·m; AC stop 461.9 → 448.6 mm,
  0.5196 → 0.5085 s, 27.66 → 30.80 N·m; the rolls 435.4 → 425.5 (half), 433.7 → 424.3 (full) and 443.9 → 434.3 mm
  (pass), the hands' tempo 0.4998 → 0.4890 s. Each plans 3.0000 m/s; the full roll's `defaultSpeed` is
  3.0000000000000004, one ulp over 3. Every stance's lean is kept within 1e-12 rad.
- **The lean through each roll's contact** (`asPlayed`, 2 / 3 m/s): half 21.44–28.69° → 23.98–24.55° and
  23.97–25.68° → 23.97–25.71°; full 31.00–39.89° → 31.00–39.93° and 31.00–36.24° → 31.00–36.34°; pass
  33.99–43.38° → 33.99–44.52° and 33.99–37.50° → 33.99–36.41°; never beyond 45°. The pass roll at 2 m/s still fails
  on point (the face's contact 33.49 → 40.10 mm above the ball's centre, against R·sin 45° 32.55 mm); every other
  canonical roll holds.
- **Exit criterion 4 over the preset grid** (`onPoint`, 225 runs a roll): half 0 off point, full 71 → 67, pass
  141 → 113. Of the pass roll's misses, 28 → 27 lean beyond 45° (2 → 7 at 3 m/s, 14 → 11 at 4, 12 → 9 at 6; the most
  52.7 → 53.4°), counted from the lean column with python3 -I; the rest miss on contact height alone.
- **The twist** (the gate's runs; the peak |ω_s| in rad/s and the yaw at release in degrees, old, held and new; "held"
  is the new mallet with the twist gains kept at the old I_z, so the inertia's share is held − old and the gains'
  share new − held). Only three runs twist measurably; the other twelve stay at or under 0.0045 rad/s and 0.0016°:

  | Run | Peak old / held / new | Inertia share | Gains share | Yaw old / held / new | Inertia share | Gains share |
  |---|---|---|---|---|---|---|
  | pass-roll 2 | 3.9237 / 1.9850 / 1.9468 | 98.1 % | 1.9 % | 3.6753 / 3.1179 / 1.9080 | 31.5 % | 68.5 % |
  | pass-roll 3 | 2.0933 / 1.1435 / 0.9566 | 83.6 % | 16.4 % | 1.8579 / 1.4074 / 0.8520 | 44.8 % | 55.2 % |
  | stop-gc 3, side 10 mm | 2.5200 / 0.9836 / 0.9561 | 98.2 % | 1.8 % | −0.0757 / −0.0284 / −0.0279 | 99.0 % | 1.0 % |

  The peak twist falls by half or more, almost all of it the head's inertia (84–98 %). The pass roll's yaw at release
  falls mostly through the stiffer hands (55–69 %), the off-centre GC stop's through the head (99 %). "Held" holds the
  gains only, so the inertia's share also carries the head's mass, length, shape and shaft. Whether the hands' twist
  gains should scale with I_z is P2b.2b.2c's question (the design's §4.4).
- **The ratchet** (exit criterion 2; the throwaway `presetDigest.mts`, `impactDigest` and `shotMix`, the baseline on
  `main`): after the union (Task 2), the box (Task 3), the inertia and profile (Task 4) and the massless shaft (Task
  5), all three bit-identical to the baseline. After the switch (Task 7) the preset digest moved by design: 1582 of
  1582 runs, 226 a preset; 45 runs went from rejected to a digest (ruling E), none the other way; the impact digest
  (4524 lines) and the shot mix's lines with the timing lines dropped stayed bit-identical (exit criterion 3), and
  again after the version (Task 9).
- **Re-baselined test figures** (Task 7; each comment reads "P2b.2b.2b.2c: the mallet (was …)"):
  - `CANONICAL_CLEARANCE`, the head's lowest point at contact: single-ball, drive and GC stop 7.5009 → 17.0259 mm
    (the flat underside, ρ − h_z = 9.525 mm higher), AC stop 8.3872 → 14.5473 (the back corner under the −4° lean),
    half 29.5203 → 39.1827, full 36.6544 → 45.9355, pass 39.7589 → 48.8202 (the face's rounded lower edge);
  - `CANONICAL_APPROACH`, the downswing's least clearance: single-ball, drive and GC stop 0.1189 → 6.2186 mm, AC stop
    6.8318 → 11.1829, the rolls as `CANONICAL_CLEARANCE`;
  - the effective mass's comment (`shot.test.ts`): 1.0066 → 1.1095 kg (ruling D);
  - on `LEGACY_MALLET`, the P2b.2b.2b.2b round head, unchanged: the AC stop's three turf mechanism tests (ruling B)
    and the four sunk-ball handover runs (ruling C).
- **Also moved** (recorded only):
  - the pendulum-timing sweep (`timing`; ratio at `pendulumAt` 0.2 / 0.4 / 0.6 / 0.8 / 1.0): half roll 2 m/s 2.35,
    2.47, 2.42, 2.42, 1.53 and 4 m/s 3.20, 2.79, 3.28, 3.30, 3.30; full roll 2 m/s 1.60, 2.14, 2.21, 2.21, 2.21 and
    4 m/s 3.03, 2.21, 2.21, 2.19, 2.19 (striker 2.12–2.90 m, was 1.91–3.72); pass roll 2 m/s 0.79, 0.79, 0.87, 1.33,
    1.42 and 4 m/s 1.20, 1.06, 1.05, 1.06, 1.06;
  - the held-out checks at 3 m/s (`heldOut`): the descent at contact 11.43°, 8.25° and 9.49°, inside Gugan's 6–16°;
    the apparent contact 26.5 → 28.8 ms (half), 35.1 → 38.7 (full), 26.3 → 26.7 (pass) against the CA's 30–58; the
    second contact 5.5, 5.7 and 4.1 ms after the strike's end; the face intervals 3, 3 and 4 against Cross's seven
    taps; the ratio 2.94, 1.55 and 0.92 against Gugan's 2.30–2.46, 1.20–1.24 and 0.94–1.21;
  - the pit (`pit`, 2 / 3 m/s): the travel to the deepest point 3.75 / 4.74 mm (half), 3.61 / 4.55 (full) and
    4.04 / 5.20 (pass), was 3.57 / 4.51, 3.43 / 4.33 and 3.83 / 4.93; the apparent friction 0.241 / 0.229, 0.016 /
    0.018 and 0.379 / 0.405;
  - the AC stop's finish roughly doubled (53.1 → 136.8 ms at 3 m/s), the head no longer dug in; on most runs the
    head finishes higher (the drive at 3 m/s 205.6 → 240.1 mm up).
- **The force tables** (`impactProbe.ts`, and `swingProbe.ts`'s force strokes) run on the Jaques round head, 9" by 3",
  whatever the default (the plan's decision 8); `impactProbe.ts`'s lines match the baseline's apart from its timings.
  That baseline was reconstructed after the fact from a `git archive` extract of 862e176 (`main`'s code), as Task 1
  took none (the design's amendments).
- **Cost** (machine-dependent, beside P5's provisional ≤ 200 ms simulation; the three probes ran together, so their
  times are contended): the tracked impacts' steps single-ball 2000, drive 36,125 → 30,818, AC stop 4276 → 4000, GC
  stop 2000, half 13,257 → 13,436, full 30,986 → 30,770, pass 28,038 → 18,683.
- **Engine time** (`scripts/shotMix.ts`, COUNT=800, seed 7, run alone; machine-dependent): per shot p50 4.94 ms, p99
  101.8, p99.9 and max 116.7 (the worst a croquet shot with no solve), against P5's provisional ≤ 200 ms simulation;
  P2b.2b.2b.2a's 3000-shot run gave p50 4.1, p99 53.3 and max 91.2, and P2b.2b.2b.2b recorded none. Each figure is
  from a single run. The run-to-run noise is unquantified; the mallet cannot account for it, since the shot-mix
  results are bit-identical through this phase (the ratchet): Task 9's run, contended by three other runs, gave p99
  78.8 ms against this quiet run's 101.8. The p99 and the max rest on about 8 shots of the 800. P5 must measure this
  properly. The solver p99 9.1 ms, max 33.8; 97.5 % of shots make no solve.
- **Tests:** `npm test` 1109 passed, 4 skipped; the slow suite 1111 passed, 2 skipped (Task 9).
- **Public:** `SwingProfile.mallet` takes `head` (`{ kind: "round"; diameter }` or `{ kind: "box"; faceWidth;
  faceHeight; edgeRadius; inertiaAboutShaft }`) and `shaftMass`, `headDiameter` moving into `head`; `MalletHead` loses
  `radius` for `shape` and gains `shaft`; `ENGINE_VERSION` 0.11.0.

## P2b.2b.2b.3 outcomes (2026-10-17)

Measured by `scripts/turfStrikeProbe.ts`, `scripts/swingProbe.ts`, `scripts/strokeProbe.ts` and
`scripts/impactProbe.ts` (node v26.12.0, each run alone; the swing probe one section at a time, in order) on the branch
at engine 0.12.0 (dd230ee plus the swing probe's new tallies), against the probe output and the throwaway preset digest,
`impactDigest` and `shotMix` taken on `main` before any change (Task 1). The raw output is in
`docs/superpowers/probes/2026-10-17-p2b2b2b3-turfStrikeProbe.txt`, `…-swingProbe.txt`, `…-strokeProbe.txt` and
`…-impactProbe.txt`; the pre-flight gate's record is `…/2026-10-16-p2b2b2b3-gate.txt`. The rulings are in "P2b.2b.2b
decisions and findings" above and in the design's amendments. Observations, not gates, but for the exit criteria.
"Old → new" throughout.

- **The jab sweep** (`turfStrikeProbe.ts`'s `jab`; the AC stop at 3 m/s on its canonical setup, `jab` 0–8 mm in
  0.5 mm steps): U 2.9927 m/s at every depth. The heel first grounds at 2.0 mm, 18.34 ms after contact (4.5 mm:
  14.56 ms; 8.0 mm: 12.38 ms), after the first face interval. No depth has a second face interval, so every
  second-tap speed is 0, and so is each against U. The head's lowest point falls from 1.646 mm above the turf (no jab)
  through −0.377 mm (2.0 mm) and −1.999 mm (4.5 mm) to −3.383 mm (8.0 mm). `turf-yield` from 4.0 mm,
  `impact-head-deep` from 5.0 mm, `follow-turf-yield` and `follow-head-deep` from 7.0 mm; `grip-limit` and
  `follow-grip-limit` on none. The grazes are the six depths 2.0–4.5 mm.
  - **The check** (exit criterion 4): **fails**, against Gugan's 0.400U (0.295–0.463U), at the defaults and at both
    ends of p_y's and c's bounds (five grazes at p_y 172 kPa, six elsewhere). The cause predates the turf law: the
    striker's ball leaves at 0.523·U, above the band's top, in one face interval (0.01–1.47 ms), and the head grounds
    14–18 ms after the face leaves it; the handover's 30 ms look-ahead does not end the impact before a second tap
    could come. Ruled "Keep .fails + ruling".
  - **The 4 m/s run** (against the hands' check, §7.3): no second tap at 3 or 4 m/s, with or without a 2 mm jab; the
    hands' peak checking force 53.5 N (no jab) and 53.4 N (jab 2 mm) at 3 m/s, 73.4 and 73.2 N at 4 m/s; their impulse
    0.2576 / 0.2575 and 0.3584 / 0.3594 N·s; the turf's braking impulse 0.0129 N·s at 3 m/s and 0.0523 N·s at 4 m/s.
    With no second tap the jab's help cannot be read from the second-tap speed; the turf's braking grows fourfold from
    3 to 4 m/s, against the hands' 1.4.
- **The regimes** (`regimes`; each setup pinned in `tests/engine/turfStrike.test.ts`):
  - **The graze**: single-ball, 3 m/s, `up` 0.01 m, dip −0.005 s, jab 1 mm. Head/turf 5.33–34.94 ms (three
    intervals), peak 1.700 mm
    (the lowest point −1.701 mm), `turf-yield` at 12.15 ms; the face at 97.21 ms. Along aim the head carries 2.8217 m/s
    into the turf and 2.2377 m/s to the ball: 0.746 of the same stroke clear of the turf (3.0000 m/s, `up` 0), 0.793 of
    its speed at the turf. A fat contact about 0.2 m behind the ball, not a graze at it: struck 10 mm low, the arc meets
    the turf early, so the impact starts 75.45 ms before the planned contact; the head ploughs for about 30 ms, swings
    clear and reaches the ball 21.8 ms after the planned contact. A quarter of the speed is lost (about 44 % of the
    energy): the shot falls short of the one attempted, and the lawn's damage is secondary.
  - **The weak stroke stopped dead**: none. No 1 m/s candidate grounds the head and is stopped: up to `up` 0.005 m the
    head always reaches the ball (the closest, dip −0.12 s, jab 5 mm, 0.91 → 0.56 m/s, the face at 262 ms); from
    0.01 m the planner rejects every candidate (72 in the search): a gross mis-hit at 0.01 and 0.015 m, the head in the
    turf at contact at 0.02 m. Not gated (the user's dig-in account, 2026-10-16): `it.todo`.
  - **The head biting in**: single-ball, 4 m/s, `up` 0.01 m, dip −0.02 s, jab 5 mm. Head/turf 5.25–29.08, 29.10–29.55
    and 42.65–50.16 ms, peak 2.009 mm; `turf-yield` 9.79 ms, `impact-head-deep` 14.11 ms, `grip-limit` 37.61 ms. The
    top hand is held at 435 N from 37.61 ms with the head out of the turf, eases to 433.8 N at 42 ms, and is held again
    from 42.65 ms, as the head re-enters the turf, to about 47 ms. 3.8123 m/s along aim at the turf, 2.9355 m/s at the
    ball (the face at 71.19 ms). The 5 mm jab alone also saturates the top hand (at `up` 0 the head never grounds and
    `grip-limit` still fires), so the run shows the jab's load and the turf's coinciding, not the turf saturating the
    hand alone. At jabs of 1–4 mm no hand reaches the limit (the best in the turf 390 N).
  - **The follow-through's flag** (not a regime): the half roll at 4 m/s, whose impact never grounds the head (lowest
    38.6 mm) and whose follow-through ploughs in: `follow-turf-yield`, `follow-head-deep` and `follow-cap` (it runs to
    its 1000 ms cap); the half roll at 2 and 3 m/s does not yield the turf.
  - **The bounds** (`bounds`): the graze and the head biting in occur at all four ends. The graze's speed at the ball:
    2.1674 m/s (p_y 172 kPa), 2.2500 (310 kPa), 2.3094 (c 73 kPa), 2.1634 (138 kPa), peak 1.692–1.849 mm; at 310 kPa
    no column yields. The head biting in: 2.8255, 2.9835, 3.0734 and 2.7870 m/s, peak 1.959–2.219 mm.
  - **The ploughing probe** (a throwaway, the ploughing scaled for Mak & Chen's dropped sin(α + δ)): at ×1.0, ×0.9 and
    ×0.85 the graze's speed at the ball is 2.2377, 2.2613 and 2.2731 m/s (0.746, 0.754, 0.758 of the clear stroke's),
    the head biting in 2.9355, 2.9816 and 3.0041 m/s, on the same setups; no verdict changes.
- **The canonical runs** (`strokeProbe.ts`'s `canonical`, each preset at its default backswing, 3.0000 m/s planned):
  - the least clearance on the downswing and the impact's length after contact unchanged on every preset;
  - the finish: GC stop 94.1 → 179.4 ms, now `follow-grip-limit`; half 856.7 → 860.2; full 692.6 → 665.6 and pass
    445.7 → 398.0, both now `follow-turf-yield` and `follow-head-deep`; single-ball, drive and AC stop unchanged;
  - the head at the finish, up and along aim from contact: GC stop 0.18 → 2.54 and 17.14 → 65.13 mm, half
    −37.35 → −28.54 and 741.46 → 765.12, full −58.91 → −69.95 and 833.70 → 777.09, pass −63.77 → −83.48 and
    670.26 → 645.53; the rest unchanged;
  - at 2 m/s (`asPlayed`): half 881.5 → 880.5 ms, unflagged; full 826.0 → 824.0, now `follow-turf-yield` with
    `follow-head-deep`; pass 715.1 → 487.9, unflagged → `follow-turf-yield`, `follow-head-deep`;
  - the fat stroke (the single-ball stroke met 7 mm higher on the face): 2.8509 → 2.8561 m/s at the first strike, the
    turf from −56.0 → −55.6 ms, 0.36 → 0.63 mm deep.
- **The full and pass rolls' follow-through finishes**: as above, each now `follow-turf-yield` and `follow-head-deep`
  at 3 m/s, its head ploughing in after the impact. Each trajectory first differs at the follow-through's first
  sample with the head below the turf (full 0.344 s, the lowest point there −2.45 → −3.47 mm; pass 0.364 s,
  −2.08 → −3.83 mm); the half roll's follow-through also grounds (0.379 s, −1.30 → −0.60 mm) but does not yield.
- **The highest ball centre above R** (`swingProbe.ts`'s `canonical`): GC stop 1.31 → 1.38 mm; the rest unchanged (half
  4.27, full 1.94, pass 20.76, single-ball 0.86, drive 2.92, AC stop 3.37). Exit criterion 5: every canonical run under
  R + 5 mm but the pass roll's turf rebound, unchanged at 20.756 mm; the GC stop's braking hands 1.479 → 1.557 N·s.
- **The cap and flag tallies of the `presets` sweep**: `grip-limit` single-ball 18, drive 9, GC stop 63 and pass roll
  18 of their runs, none elsewhere; `turf-yield` AC stop 4, none elsewhere; `impact-head-stopped` on no run;
  `impact-cap` AC stop 15 → 0; `impact-off-face` AC stop 57 → 56, GC stop 12 → 9, the rest unchanged;
  `impact-head-deep` and `impact-turf-pit` on no run. The longest impact before the cap: AC stop 271.2 → 262.9 ms, GC
  stop 58.7 → 60.6, the rest unchanged. Rejections unchanged (45 a swing preset, all at 6 m/s).
- **The AC stop's dip** (`dip`): the turf still met only from 13.0 mm; the depth at 13.0 / 13.5 / 14.0 mm 0.40, 0.66,
  0.95 → 0.32, 0.76, 1.09 mm, the turf's braking 0.210, 0.235, 0.298 → 0.013, 0.068, 0.162 N·s, the ratio 5.94, 5.96,
  5.99 → 5.98, 5.99, 6.01.
- **Also moved** (recorded only):
  - the GC stop (`gc`, gap 0.3 m, 2–4 m/s): the ratio 3.04, 5.62, 7.01, 10.41, 20.05 → 3.13, 5.81, 7.55, 10.87,
    20.35; every gap's GC stop moves likewise; the hands beyond the feed-forward (`coupling`, T 0.08 s) 0.44 → 7.46 % of
    the balls' impulse; the strike's effective mass (`mass`) −12.30 → −9.59 % from the closed form; the GC stop's
    largest head distance from the path with no ball and no turf (`tracking`) 6.88e-6 → 6.48e-3 m inside its check and
    3.45e-5 → 3.78e-1 m after it, from the hands' limit alone (a throwaway run at 1e5 N gives the old figures): the
    check's planned deceleration saturates the grip, as in the canonical finish (94.1 → 179.4 ms,
    `follow-grip-limit`);
  - the AC stop's timings (`timings`): an arc 20 or 10 ms early, which dug 0.51 and 0.47 mm, missed the ball and ran
    to `impact-cap`, now strikes it with no head–turf contact (0.622 and 0.601 m/s, ball first), `grip-limit` raised
    at 5 µs; every arc 5–50 ms early now raises `grip-limit`; 50–30 ms early still misses and runs to the cap; 5 ms
    early the ball 0.761 → 1.166 m/s; the dig at a dip 20 ms late 0.89 → 1.09 mm, at ×1.5 and ×2 2.20 → 2.41 and
    4.52 → 3.96 mm;
  - the pass roll's points off (`onPoint`, `strokeProbe.ts`): 113 → 110 of 225, the 6 m/s drive ±1 runs (Task 2's
    saturated runs); 27 still lean beyond 45° (7 at 3 m/s, 11 at 4, 9 at 6; the most 53.36 → 53.93°).
- **The late re-hit's crossings** (`rehit`; sweep runs crossing a ball): AC stop 9 → 10 of 180 (its 1 m/s, `up`
  −17 mm runs now cross blue 45 ms after contact, where they crossed at 59 ms, and drive 0.5, `up` −23 mm newly
  crosses at 216.9 ms); the rest unchanged (single-ball 9, drive 39, GC stop 42 of 180; half 0, full 10, pass 24 of
  225). No canonical crosses, no obstacle is crossed, and **no run of any preset ends with the head overlapping a
  ball (exit criterion 6)**; the hoop-1 runs unchanged.
- **The ratchet** (exit criterion 2; the throwaway preset digest, `impactDigest`, `shotMix` and `impactProbe`):
  - after the hands' limit (Task 2): `impactDigest`, `impactProbe` and the shot mix bit-identical (the shot mix but
    its wall-clock worst-shot line); the preset digest, with `gripLimit` stripped from the hashed profile, moved on
    109 of 1582 runs, every one raising `grip-limit` or `follow-grip-limit` (single-ball 18, drive 9, GC stop 64 with
    its canonical, pass roll 18). The GC stop saturates at 5 µs: the check law's planned deceleration, older than the
    limit, asks the top hand for 442 N and the bottom for 782 N for about 30 µs. Spec §5's premise, "today's hands stay
    far below 435 N", is falsified by these 109 runs;
  - after the new law (Task 5): `impactDigest` and `impactProbe` unchanged (force tables have no head–turf pair), the
    shot mix's phase 2 bit-identical, and 113 preset runs moved, each meeting the turf: 110 AC stop runs, with
    head–turf intervals before and after, and the three canonical rolls in their follow-through alone. No preset run
    reaches `impact-cap` once the head–turf pair hands over to the follow-through after the ball has gone;
  - after `stroke.jab` at 0 (Task 6): all bit-identical to Task 5's; after the version (Task 9) the impact digest and
    the shot mix again; `impactProbe` again here, apart from its timings.
- **Cost** (machine-dependent; every figure run alone, plan decision 23):
  - the head–turf columns visited per grounded step (`turfStrikeProbe.ts`'s `cost`, plan decision 21, counting the
    law's own range, `headColumns`, since Task 5 the head's part below the plane): mean (worst) 1,209.8 (2,046, the
    highest) on the half roll's follow-through, 372.9 (527) on the full's, 313.8 (465) on the pass's, 261.8 (341) on
    the graze, 297.1 (434) on biting, 459.7 (558) on the AC stop at a 4.5 mm jab and 326.7 (465) on its
    follow-through, 296.9 (403) on the half roll at 4 m/s's follow-through;
  - the tracked impacts' steps: the canonical impacts unchanged (single-ball and GC stop 2000, drive 30,818, AC stop
    4000, half 13,436, full 30,770, pass 18,683); the graze 20,380 (6,044 grounded), biting 14,976 (6,495), the AC
    stop at a 4.5 mm jab 4,049 (1,139) and its follow-through 15,964 (12,331 grounded, 4.03 million column visits);
    the follow-throughs grounded on the canonical rolls 1,335 (half), 3,615 (full) and 4,435 (pass) steps, the half
    roll at 4 m/s 4,317 of 184,636; the follow-through's µs/step (`strokeProbe.ts`'s `cost`) half 2.340 → 3.484, full
    2.165 → 3.917, pass 2.166 → 5.282;
  - the preset sweep's wall time (the throwaway digest, alone): 353.52 → 472.31 s, ×1.34 (×4.82 before the law's
    column reach was culled, Task 5);
  - `shotMix`'s engine time (COUNT=800, seed 7, alone): per shot p50 2.573 → 2.892 ms, p99 38.601 → 41.538, max
    80.309 → 54.039, about ×1.1; its results are bit-identical, so the change is the run-to-run noise P2b.2b.2b.2c
    noted plus any cost of the new code paths;
  - the reach filter's check (`swingProbe.ts`'s `cost`): its gentle AC stop no longer holds the impact to the cap,
    120,000 → 74,951 steps; the headroom over WAKE_MARGIN unchanged at 6723×.
- **Re-baselined test figures** (Tasks 2, 5 and 6; each comment reads "P2b.2b.2b.3: the turf strike (was …)"):
  - Task 2: the GC stop's gripped follow-through saturates at the default 435 N (the head's residual 0.01199 m/s
    against the test's 0.01): its two tests keep their assertions at `TEST_GRIP_LIMIT` (1e5 N), and a sibling pins
    the default's saturation;
  - the re-entry guard's worst entry jump 2.999000e-3 → 2.983371e-3 m, the deepest bearing column's δ;
  - the `LEGACY_MALLET` AC stop's relaxed head on the turf: head/turf 12.21–21.14 → 12.27–20.25 ms, peak 1.877 →
    3.041 mm, `turf-yield` and `impact-head-deep` new, the turf's impulse along aim +0.386 → +0.286 N·s, the impact
    21.39 → 20.25 ms;
  - the fat stroke (`buildContact.test.ts`): head/turf 5.00–14.55 → 5.43–47.67 ms, peak 0.497 → 2.544 mm, slide
    28.9 → 129.6 mm, `turf-yield` and `impact-head-deep` new, the first strike 3.0297 → 2.9833 m/s (clean 3.1211);
  - the endless carry's follow-through (`followThrough.test.ts`) gains `follow-turf-yield` and `follow-head-deep`
    before `follow-cap`;
  - the struck impact with the head on the turf now ends `RELEASE_STEPS` after the ball leaves the face (21.64 ms,
    was 24.42 ms at rest), the head still sliding at 13.1 mm/s; the dropped box's `impact-head-stopped` at 5.145 ms
    (was 4.765), counted from the first step at rest by the full |v|;
  - Task 6, the AC stop's jabs on the default box: `J_ON` 2.0 mm (the turf at 18.34 ms, 0.32 mm deep, `turf-lift`
    only) and `J_EARLY` 4.0 mm with a dip 30 ms early (the heel at 28.55 ms, the face at 30.36 ms; the striker's
    ball along the lawn 1.5540 against 1.5666 m/s on time, though its full speed is 1.5721 against 1.5677, the heel
    lifting it: vz 0.238 against 0.059 m/s).
- **Tests:** `npm test` 1157 passed, 5 skipped, 1 todo; the slow suite 1159 passed, 1 expected fail (Gugan's jab
  check), 2 skipped, 1 todo (Task 9).
- **Public:** `ShotSetup.stroke.jab`; `SwingProfile.body.gripLimit`; `SurfaceProps` gains `turfYield` and
  `turfMatStrength` and loses `turfStiffness` and `turfRestitution`; the impact events `turf-yield`, `grip-limit` and
  `impact-head-stopped`; `FollowFlag` gains `follow-turf-yield` and `follow-grip-limit`; `ENGINE_VERSION` 0.12.0.

## P2b.2b.2c.1 outcomes (2026-10-19)

Measured by `scripts/singleBallProbe.ts` (the pre-flight gate), `scripts/strokeProbe.ts`, `scripts/swingProbe.ts` and
`scripts/impactProbe.ts` (node v26.12.0, each run alone) on the branch at 90f2890, against the probe outputs, the
throwaway preset digest, `impactDigest`, `shotMix` and the effort curve taken on `main` (4647883) before any change
(Task 1). The raw output is in `docs/superpowers/probes/2026-10-19-p2b2b2c1-strokeProbe.txt`, `…-swingProbe.txt` and
`…-impactProbe.txt`; the gate's record is `…/2026-10-18-p2b2b2c1-gate.txt` (the first gate) and
`…/2026-10-19-p2b2b2c1-gate.txt` (its rerun after the rulings, which the user ruled on last, and the single-ball
probe's only record). The rulings, in the user's words, are in the design's amendments. The rulings changed code, so
they were applied as engine commits (991113e..65c7377) before the rerun; the plan's Task 7 (commit the defaults,
re-baseline the tests) therefore made no commit and recorded the ratchet only. Observations, not gates, but for the
exit criteria. "Old → new" throughout.

- **The effort law** (gate section A; `body.effortTorque`, `effortSpeed` and `effortShare` in `reference/swing.json`):
  - τ_0 68.5268520116806 N·m and ω_max 16.19530337086275 rad/s at κ ⅔, refitted from the knee-height top (the first
    gate's fit from the 75° top: 57.087018102407455 N·m and 16.19530336512667 rad/s). Beside it, κ ½: 54.4090 N·m,
    21.5937 rad/s; κ ¾: 79.7278 N·m, 14.3958 rad/s.
  - U(i) at i = 0, 0.1, …, 1 (κ ⅔, m/s): the single-ball, drive and GC stop presets from the default 0.4486 m 3.0000,
    4.3893, 5.3175, 6.0335, 6.6213, 7.1209, 7.5554, 7.9394, 8.2829, 8.5931, 8.8752, and from the top 0.4800 m 3.1032,
    4.4953, 5.4287, 6.1491, 6.7401, 7.2421, 7.6783, 8.0634, 8.4076, 8.7180, 9.0000; the AC stop from 0.4486 m 3.0000
    to 9.0427 and from its top 0.4780 m 3.0966, 4.5542, 5.5186, 6.2585, 6.8628, 7.3745, 7.8178, 8.2082, 8.5562,
    8.8694, 9.1533. Main's pulse from 0.4486 m: 3.0000, 3.5599, 4.0903, 4.5690, 4.9884, 5.3447, 5.6330, 5.8464,
    5.9783, 6.0283, 6.0000, turning over above i 0.9.
  - The ceiling (exit criterion 3): the single-ball, drive and GC stop presets tie as the weakest at 9.0000 m/s, the
    AC stop 9.1533. The shape (exit criterion 2): strictly increasing and concave with no flat top over every swing
    preset's backswing grid (the slow grid test); the worst end-slope fraction 0.49 against the 0.25 required at the
    first fit, not recorded after the refit.
- **The default stroke** (section B; the user's ruling "Fix backswing"): every swing preset's `defaultBackswing` kept
  to the bit (0.448599788489428 m; AC stop 0.44859926531543737), planning 3.0000 m/s at intensity 0; from it U(1)
  8.8752 m/s (AC stop 9.0427). On each canonical setup, through test support's `strokeFor`: 1–3 m/s the gravity-only
  backswing (0.0498, 0.1994, 0.4486 m, no intensity); 4–8 m/s the default backswing at intensity 0.0665, 0.1623,
  0.2948, 0.4744 and 0.7169 (AC stop 0.0626 to 0.6738); 9 m/s intensity 1 from the 0.4800 m top (the AC stop still at
  its default backswing, intensity 0.9844). `defaultIntensity` is retired. The first gate's proposal, intensity 0.25
  (a 0.0545 m backswing for 3 m/s; AC stop 0.0376 m), is withdrawn.
- **θ_max** (section C): 64.9021° (1.1327544972853942 rad), derived at knee height: the single-ball preset's head
  rising 0.4800 m on the default mallet (ℓ 0.8336 m, θ_c 0°, s 1); the AC stop's top 0.4780 m (θ_c 4°). On the user's
  mallet (42" shaft, 13.5" head; ℓ 0.9860 m) the head rises 0.5678 m at θ_max (AC stop 0.5654 m). At the first gate's
  75°: 0.6178 m and 0.7308 m. The knee-height check holds by construction: recorded, not validation.
- **The styles** (section D; single-ball, `handReach` 0.3 m, the level stroke's advance on time; rising / level):
  - 3 m/s (intensity 0): the ball at the face's release 3.8665 / 3.8599 m/s, topspin 8.1403 / 7.2188 rad/s; at the
    handover (10.0 / 46.4 ms) 3.8625 / 3.6563 m/s, 8.2171 / 17.2629 rad/s; skid 0.6042 / 0.6776 m; travel 6.9186 /
    6.9354 m; the head's highest over the advance's span 0.0234 / 0.0169 m and from contact to the finish 0.1550 /
    0.3221 m; the finish 0.4982 / 0.6461 s, advanced 0–0.1250 s.
  - 5 m/s (intensity 0.1623): 6.3865 / 6.3806 m/s, 13.3478 / 12.4889 rad/s; the handover at 10.0 / 12.7 ms; skid
    1.6168 / 1.6059 m; travel 18.5370 / 18.4486 m; the head's highest 0.0295 / 0.0167 m and 0.4368 / 0.6043 m; the
    finish 0.5146 / 0.6173 s, advanced 0–0.0803 s.
  - The hands (the user's rulings on the ramp and the reach): a 300 m/s², so W = V/a 10.0 ms at 3 m/s and 16.7 ms at
    5; their travel from contact 0.3000 m, handReach, at the advance's rest and at the finish. Not judged against each
    other; the level stroke's 46 ms hold at 3 m/s is a hypothesis for later data.
- **The mistimed advance** (section E; single-ball, 3 m/s): the head's highest after contact 0.3869 m at −20 ms,
  0.3468 (−10), 0.3307 (−5), 0.3221 (on time), 0.2513 (+5), 0.1820 (+10), 0.1770 (+20), 0.1673 (+40), 0.1489 (+80),
  0.1187 (+160) and 0.1126 m (+320), against 0.1550 m with none; every advance starts before the finish, which comes
  at 0.6104–0.6744 s against 0.4982 s; at +320 ms `follow-grip-limit`, the grip limit working as designed; no faults.
  `drive` 0–1 with no advance: 0.1550 → 0.1791 m, the finish 0.4982 → 0.5080 s, no faults.
- **The flick** (section F; the ball's launch angle at the face's release, the stroke re-solved at each lean): at
  3 m/s 4.1863° at a −2° lean, 2.2341° at 0° and 0.2613° at +2°, falling at every step to −7.5710° at +10°, −0.9798°
  per degree of lean (5 m/s: 4.2836° to −7.5224°, −0.9838° per degree); the head rising 2.0572° at the first face
  contact at −2° (5 m/s 2.0718°). Phase 2 airborne at every lean but +2° (recorded, not judged). Leans −20° to −16°
  reject on θ_max, −14° to −4° with the head in the turf at contact (at the first gate all of −20° to −4° in the
  turf). At 3 m/s the leans of +2° to +10° take the middle regime at intensity 0.0000: each setup's U(0) from the
  default backswing falls just under 3 m/s.
- **Head ahead** (section G): 11 of 485 runs (D 4, E 17, F 14, the single-ball sweep 225 and the GC stop's 225),
  every one the GC stop at drive 1, 3 and 4 m/s, `up` 0 or 3 mm: a double tap (GC 11.2.4, AC 29.1.6.2), the head
  reaching the stopped striker's ball after the face has released it, for 1–5 samples at 0.089–0.124 s, at most
  12.20 mm below the ball's top. Recorded as a known gap, not a failure (first gate: the same 11, of 395).
- **The guard** (section H): no catch over the gate's runs; 18 other rejections, all the flick's (first gate 108: the
  flick's 18 and 90 sweep runs at 6 m/s beyond the 75° top's reach).
- **θ_max's rejections** (section I): the 360 preset runs it rejected at 75° (90 each swing preset, read "beyond the
  … stroke's reach") now all play, in the middle regime.
- **The user's checks** (section J; checks, not fit targets; on an open lawn, `defaultWorld(10)`'s surface on a 200 m
  square with no hoops, distances to rest): the single ball from 0.45 m at i 0, 0.1, …, 1: 7.59, 15.84, 22.90,
  29.11, 34.91, 39.99, 44.91, 49.47, 53.70, 57.39 and 61.12 yd (3.0047 to 8.8809 m/s); the drive from its top at
  i 1, 9.0000 m/s: the croqueted ball 58.77 yd, the striker's 7.45 yd. Like for like against the user's strokes, the
  user's percentages being felt effort, not intensities (P3 maps one to the other): from knee at i 0.4, 34.91 yd
  against about 30 yd at about 40 % felt (×1.16); at i 0.3, 29.11 yd against about 15 yd at about 30 % felt, cast
  (×1.9); the drive at i 1, 58.77 yd against the 35 yd length (×1.68). The user's ankle-height 5 yd stroke (about
  0.05 m, guiding hands) has no model run. The first gate ran on `defaultWorld(10)`, the full court: from i 0.5 its runs
  halted at the boundary (31.72 yd, at least). Recorded, and a carried item below.
- **The canonical runs** (exit criterion 9): every preset's canonical setup unchanged, its defaults kept to the bit
  (`strokeProbe.ts`'s and `swingProbe.ts`'s `canonical`, the fat stroke and the coupling as P2b.2b.2b.3 recorded
  them). The coaching ratios unchanged at the printed precision (drive 2.59, 2.86, 3.31, 4.49, 5.88 at 2–4 m/s; AC
  stop 5.08–6.65; the GC stop over 0.3 m 3.13–20.35), the 3.5 and 4 m/s strokes now played from the default backswing
  with intensity. The planned contact speed against backswing (`strokeProbe.ts`; intensity 0 / 0.5 / 1, the
  downswing's ms in brackets): intensity 0 unchanged; on the single-ball, drive and GC stop presets at 0.02 m
  2.426 (211.6) → 3.406 (101.6) and 3.409 (153.2) → 4.595 (74.2), at 0.30 m 4.850 (309.5) → 6.452 (200.1) and
  5.629 (245.4) → 8.169 (153.7); the AC stop at 0.30 m 4.874 → 6.629 and 5.626 → 8.380; 0.50 and 0.70 m now beyond
  θ_max at every intensity.
- **The cap and flag tallies of the `presets` sweep**: the swing presets' 6 m/s runs, rejected on main beyond the
  gravity-only reach (4.0894 m/s at 0.8336 m; AC stop 4.0845), now play: 180 → 225 runs, 45 → 0 rejected.
  `impact-cap` on no run. `grip-limit` single-ball 18 → 36, drive 9 → 18, GC stop 63 → 99, pass roll 18; `turf-yield`
  AC stop 4 → 12; `impact-head-deep` AC stop 0 → 4; `impact-off-face` drive 84 → 96, AC stop 56 → 60, the rest
  unchanged (GC stop 9, full 83, pass 127); `impact-head-approaching`, `impact-turf-pit` and `impact-head-stopped` on
  no run. The longest impact before the cap unchanged (drive 288.9 ms, AC stop 262.9, GC stop 60.6). At 40d13fd the
  stroke and swing probes still solved each speed at intensity 0, so 4 m/s fell beyond the knee-height top's 3.10 m/s
  reach; 90f2890 moved them onto the ruled default stroke.
- **The late re-hit's crossings** (`rehit`): single-ball 9, drive 39, AC stop 10, GC stop 42 of 225 (of 180 on main,
  the new runs crossing none); half 0, full 10, pass 24 of 225. No canonical crosses, no obstacle is crossed, and
  **no run of any preset ends with the head overlapping a ball (exit criterion 10)**.
- **The ratchet** (exit criterion 8; the throwaway preset digest, `impactDigest`, `shotMix` and `impactProbe`):
  - after the guard (Task 2): all four bit-identical; after θ_max (Task 3) bit-identical but 360 preset runs rejected,
    90 per swing preset (listed); after the advance with no timing (Task 4) and the effort law at the old defaults
    (Task 5) bit-identical;
  - at 40d13fd, after the rulings: `impactDigest` bit-identical, `impactProbe` but its timings, the shot mix's phase
    2 bit-identical; every carry-mode run unchanged (226 lines per roll); 375 swing-mode lines moved, the 4 and 6 m/s
    runs of the single-ball, drive and GC stop presets (90 each) and the AC stop's 105 (with 15 at 3 m/s struck with
    `up` −0.023 m, whose U(0) from the default backswing is under 3 m/s, so they take the middle regime).
- **Cost** (machine-dependent; each figure run alone):
  - the downswing's steps: the canonical strokes, gravity-only from the default backswing, unchanged at 97,794
    (single-ball, drive, GC stop) and 101,707 (AC stop), as on main (`…/2026-10-17-p2b2b2b3-strokeProbe.txt`); the
    downswing table 97,795 and 101,708 samples, released 0.4890 and 0.5085 s before contact; at intensity 1 from the
    top 35,304 and 36,586 samples, released 0.1765 and 0.1829 s before contact, a harder swing a quicker one (at the
    first gate's 0.25 default, 37,643 and 39,094);
  - `shotMix`'s engine time (COUNT=800, seed 7, alone): per shot p50 2.703 → 2.505 ms, p99 43.037 → 35.974, max
    64.560 → 46.709; its results are bit-identical, so the change is run-to-run noise;
  - the pre-flight gate's run: 99 s → 343 s, from the first gate to its rerun.
- **Where swing and carry mode branch** (design §9; the unified model's debt, by name): `SwingDrive.mode` and its four
  carry-only fields, `shapeOf`, `DRIVE`/`DEFAULT_DRIVE`, `planDownswing`, `validate`, `arrival`, `prepareTrack`,
  `pivotAt`, `pendulumAt`, `handLoad`/`carryLoad`, `inCheck`, `finishKind`, the carry resistance and chains, the check
  hold, the fit's branch and `canonicalSetup`'s special cases. This step narrows one: the hands' advance after contact
  is no longer carry mode's alone. The held slope it first borrowed from carry mode was withdrawn (the user's "The
  intent is not to stop or interrupt the arc of the mallet head"), so a swing's advance holds no slope. It adds three:
  θ_max is swing mode's alone (carry mode keeps `MAX_BACK_ANGLE`); the Hill law is swing mode's (carry mode keeps the
  hands' tempo, and a swing preset's `handTempo` is null); and an advance is rejected in carry mode and on a checking
  window. P2b.2b.2c.2 adds one: the arms' checking force is swing mode's alone. Under its limit a slid anchor returns
  at τ_arm = c_hold/k_hold (27.8 ms); carry mode's hand–arm chain already holds the arm, so its slid offset stays.
- **Carried open items:**
  - Closed: the very stiff grip's NaN (P2b.2b.2a's open defect). The finite-state guard throws a `RangeError` naming
    the body, the time from contact, the step and the phase. The defect reproduces only with the grip limit lifted
    (to 1e9 N; NaN in the head's state about 0.25 ms in, at a 0.01 s period): P2b.2b.2b.3's 435 N limit otherwise
    bounds it.
  - Gugan's jab check: still an expected failure (`it.runIf(SLOW).fails`), as P2b.2b.2b.3 ruled; P2b.2b.2c.2's.
  - The weak stroke stopped dead: still `it.todo` (the user's dig-in account, 2026-10-16).
  - The user's checks run long on the open lawn, like for like: knee at i 0.4 ×1.16 (34.91 against about 30 yd), knee at
    i 0.3 ×1.9 (29.11 against about 15 yd, cast), the drive's croqueted ball ×1.68 (58.77 against 35 yd); the
    ankle-height 5 yd stroke has no model run. The user's figures are checks, not targets, and their percentages felt
    effort, not intensities. Discriminate first between the stroke's speed (gravity-only free fall, no braking by the
    player; the 9.0 m/s ceiling) and the lawn's pace (10 s), then calibrate whichever is at fault; never tune the lawn's
    pace alone to close the gap, which would move every distance.
  - The double tap: the follow-through should detect head–ball contact, play the second contact and flag the fault,
    naming GC 11.2.4 and AC 29.1.6.2 (the 11 GC stop runs at drive 1 above); remedies belong to a later rules layer.
  - A player-facing "push" scale mapped onto handReach and V, calibrated once data exists; the ramp stays a body
    property (`body.handAcceleration`), never the player's.
  - The level stroke's 46 ms hold: a hypothesis for later data.
  - Hands-assisted defaults (the user, 2026-10-08: nearly every real swing has some help from the hands): in part
    superseded by the gate's ruling 2 (2026-10-18), which keeps the default stroke and every speed up to its
    gravity-only 3 m/s gravity-only by the user's choice, the hands' intensity reaching only the speeds above it.
    Whether the canonical 3 m/s stroke should carry some help from the hands stays open, for the user or a source.
  - Under an advance, planned hands still moving along aim at contact (handGain > 0 or pendulumShare < 1) drop to
    rest at contact; no default preset does so. A blend of the pivot's speed into the ramp, when one does.
- **Tests:** `npm test` 1197 passed, 6 skipped, 1 todo; the slow suite 1200 passed and 1 expected fail (Gugan's jab
  check), after the rulings' engine work.
- **Public:** `StrokeTiming.advance`; `FollowThrough.advanced`; `SwingEffort`; `SwingProfile.body` gains `effort`,
  `backswingLimit` and `handAcceleration`; `SwingShape` loses `effort` and `defaultIntensity`, its `handTempo`
  nullable; `swingBodyReference`.

## P2b.2b.2c.2 outcomes (2026-10-20)

Measured by `scripts/croquetFitProbe.ts` (the sensitivity probe and the pre-flight gate), `scripts/fitRatios.ts` (the
fit's attempt), `scripts/strokeProbe.ts`, `scripts/swingProbe.ts` and `scripts/impactProbe.ts` on the branch at
8addfc5, against the probe outputs, the throwaway preset digest, `impactDigest` and `shotMix` taken on `main` (ee16a93)
before any change. The raw output is in `docs/superpowers/probes/2026-10-20-p2b2b2c2-strokeProbe.txt`,
`…-swingProbe.txt` and `…-impactProbe.txt`; the gate's record is `…/2026-10-20-p2b2b2c2-gate.txt`, the sensitivity
probe's `…/2026-10-19-p2b2b2c2-sensitivity.txt`, the fit's attempt `…/2026-10-20-p2b2b2c2-fit-attempt.txt` and the
double hit's diagnosis `…/2026-10-20-p2b2b2c2-drive-double-hit.md`. The rulings, in the user's words, are in the
design's amendments. The fit did not converge, and the user divided the step at it ("Split: new step first"): this
step, P2b.2b.2c.2 (its first part), lands without the fit, and P2b.2b.2c.2b takes the drive's follow-through, the
impact's step convergence and the fit. Nothing was written to `reference/contact.json`, and no test was re-baselined.
Observations, not gates, but for the exit criteria. "Old → new" throughout.

- **The sources** (`reference/sources/README.md`, section "P2b.2b.2c.2: the croquet strokes' fit"; the gate's
  sections A and H):
  - the CA's travel unit is metres, and its ball speed is taken a few milliseconds after impact, which the model reads
    at the face's release;
  - Gugan 5 states no stop speed (the stop-shots "of similar strength" to the drives' about 3 m/s), so the stop is
    fitted at 3 m/s;
  - the makes differ: the face law's fits come from a Jaques Eclipse (Gugan 2000), Gugan 5's targets from Dawson
    Internationals; le Maitre's 2.7–4.2 by make (Walker 4.2, Barlow 3.7, old Jaques 3.2, new Jaques 2.7) is his stop
    shot (forward ball over backward), not his drive or roll, which gives 1.8–2.8 as printed. The user's ruling
    "Targets stand, record": Gugan 5's 4.23 ± 0.2 and 7.15 ± 0.6 at 3 m/s, in `reference/swing.json`'s
    `ratioTargets`.
- **The distance check** (gate section A; the same on `main`'s model and on this branch): the strike's
  share (the ball at the face's release against the CA's ball speed, at the CA's mallet speed) ×0.98, ×0.96, ×0.97 on
  A1D–A3D and ×1.20 on A4D against the TEXT file's 8.62 m/s, ×1.03 on Gugan's own reading of 10.03 m/s; the lawn's
  share (the travel against the CA's, struck to the CA's ball speed) ×0.56 (A1D, a very short stroke), ×0.88, ×0.86,
  ×0.73; Gugan 5's drive ×0.95 of about seven yards (6.65 yd). The user's ruling "Lawn pace, not the stroke": the
  strike matches the CA within 2–4 %, and the distance gaps are the lawns' pace, the CA's faster than the default and
  the user's slower. The effort ceiling stands. The croquet ratios are set in the impact (both balls slow alike, so to
  first order the lawn's pace does not move them).
- **The arms' checking force** (gate section B; `strokeProbe`):
  - the law: in swing mode, while a hand is under its limit, its slid offset decays by exp(−dt/τ_arm) after the step's
    force, τ_arm = c_hold/k_hold = 27.8 ms; at the limit it slides as before; carry mode's slid offset stays;
  - the ratchet: `impactDigest`, `impactProbe` and `shotMix` bit-identical; 28 preset digest lines moved, exactly the
    runs with an offset set: 19 GC stop runs (the canonical, 9 at 2 m/s and drive −1, 9 at 3 m/s and drive −1) and 9
    single-ball runs at 3 m/s and drive −1; in `strokeProbe` only the GC stop's finish moved, 179.4 → 158.5 ms, the
    head 65.13 → 8.38 mm along aim;
  - the drift: the canonical GC stop's bottom hand slides to 23.8 mm at 10 ms and stayed there on `main`, and now
    returns to 0.11 mm; the peaks are unchanged (23.8 mm at 3 m/s, 4.65 mm at 2 m/s, the single-ball's 9.47–9.49 mm),
    the finals 0.006–0.47 mm. The design's 0.378 m does not reproduce on `main`: the largest offset over every run is
    23.8 mm. The single-ball's runs at drive −1 slide because drive −1 plans a check, whose hold grips; at drive 0
    they never slide. The user's ruling "Accept as it stands".
- **The sensitivity probe** (`…/2026-10-19-p2b2b2c2-sensitivity.txt`; the canonical drive and AC stop at 3 m/s):
  - today the drive 3.3085 and the stop 5.9109, against 4.23 ± 0.2 and 7.15 ± 0.6;
  - only the ball–ball contact time moves the stop (2.3408 to 8.2790 across 0.5–0.87 ms); no hand parameter moves it
    by more than about 0.5 across its bounds (the arm mass's 6.33 to 5.84);
  - in the coupling's period, damping-ratio and arm-mass sweeps the drive jumps abruptly between a lower band (about
    1.3–3.6, 1.3493–3.6095; today's 3.3085 among them) and an upper band (about 4.76–4.89, 4.7550–4.8933).
    `impact-off-face` is raised at every lower-band point but also at some upper-band points (ζ 0.6: 4.7905; the arm
    mass 0.5 kg: 4.7550), so it does not mark the band. The contact-time and reach-slack sweeps move the drive without
    such a jump (the contact time's 2.0439–3.9269 across 0.5–0.87 ms; the reach slack smoothly from 4.6207 at 10 mm
    to 3.3085 at 30 mm, with the stop unchanged). The double hit below reads the jump as one clearance threshold;
  - the drive's effective mass at the face centre along aim 1.1095 kg (+10.95 % on the head's 1.0 kg) at today's
    values, within 0.9·m ≤ m_eff ≤ M at every point;
  - the probe ranked the contact time and the arm mass first (angle 80.0°, reachable at 0.814 ms and 0.3155 kg); the
    user ruled the contact time and the reach slack (angle 77.6°, reachable by the linear estimate at 0.817 ms and
    28.63 mm), the arm mass's jump in the drive lying inside its bounds. No per-preset grip was needed and no bound
    widened.
- **The fit's attempt** (`…/2026-10-20-p2b2b2c2-fit-attempt.txt`): not converged after 101 evaluations. The closest
  point, by the larger error over its tolerance, is the contact time 0.762 ms and the reach slack 10 mm, on its lower
  bound: the drive 3.89 and the stop 6.13, both outside Gugan 5's tolerances and inside the CA bands. With the stop on
  target (0.814 ms) the drive reaches about 3.74.
- **The drive's double hit** (`…/2026-10-20-p2b2b2c2-drive-double-hit.md`; evidence only):
  - the mechanism: after the face releases the striker's ball (1.5 ms) the head slows to 0.80 m/s; the swing-mode
    bottom hand's push after contact (`guideEffort` 1, restoring the planned arc's speed) brings it back to 1.81 m/s,
    and at 109 ms the rising, face-up head catches the striker's ball (rolling at 1.16 m/s) with its lower front edge,
    taking it to 1.71 m/s and its travel from 1.22 to 1.84 m. Without the catch the drive's ratio is about 5.0
    (`guideEffort` 0: 5.01; 0.5: 4.75);
  - the drive's "two levels" are one clearance threshold (2.6 → 0.6 → 0.2 mm → contact as the inputs move), stable at
    half and double the impact step;
  - the 3.54/3.74 flips at near-identical points are a stick/slip branch on the catch's first step in the face–ball
    tangential law, latched on the entry step (inferred from the forces and the code, medium confidence); they vanish
    at half and double the step;
  - the drive's own ratio is not step-converged: 3.31, 3.48 and 3.47 at 5, 2.5 and 10 µs.
- **The ball makes** (gate section H): as the sources above; ball-make presets stay P3's.
- **Cost** (machine-dependent; `shotMix`, COUNT=800, alone): the engine's time per shot p50 2.567 → 2.420 ms, p99
  37.844 → 35.722, p99.9 and max 55.809 → 46.474; the solver's p50 0.000 → 0.000, p99 3.670 → 3.770, p99.9 10.916 →
  6.113. Unchanged within noise.
- **Carried open items:**
  - Closed: the slid anchor's drift (P2b.2b.2b.3's), by the checking force, accepted at the gate.
  - Discriminated: the user's checks running long are the lawn's pace, not the stroke (the distance check, ruled).
    Calibrating the lawn's pace waits for a further ruling; it is never tuned alone.
  - For P2b.2b.2c.2b: the drive's double hit. Do a player's hands re-accelerate the head after a drive? The catch
    rests on the bottom hand's push after contact at `guideEffort` 1, which no measurement found establishes; a
    measured follow-through head speed after a drive would settle it.
  - For P2b.2b.2c.2b: the impact's step convergence (the drive's ratio 3.31, 3.48 and 3.47 at 5, 2.5 and 10 µs), with
    the face–ball tangential law's stick/slip branch on a contact's entry step.
  - For P2b.2b.2c.2b: whether the AC stop has an unflagged face re-contact (`impact-off-face` reports only off-face
    regions, so a face-region catch raises no flag).
  - For P2b.2b.2c.2b, with the fit: Gugan's jab check, still an expected failure (`it.runIf(SLOW).fails`), and the
    grip-limit control run behind the biting test, both unchanged.
  - The origin of the design's 0.378 m drift, which does not reproduce on `main` (the largest offset 23.8 mm).
  - The weak stroke stopped dead: still `it.todo`.
- **Tests:** `npm test` 1199 → 1217 passed, 6 skipped, 1 todo.

## P2b.2b.2c.2b outcomes (2026-10-22)

Measured by `scripts/croquetFitProbe.ts` (sections A, D–G and I–M), `scripts/squeeze.ts` (the free-collision harness
and the search's candidates), `scripts/strokeProbe.ts`, `scripts/swingProbe.ts` and `scripts/impactProbe.ts` on the
branch at 8955c91, against the throwaway preset digest, `impactDigest`, `shotMix`, the probes and section A taken on
`main` (73713d8) before any change. The gate's record is `docs/superpowers/probes/2026-10-21-p2b2b2c2b-gate.txt` (the
whole probe after the read-out's widening, with the search, the convergence fix's trace, the moved runs, gate A's
checks and the cost appended), the search's first run `…/2026-10-21-p2b2b2c2b-search.txt`, and the raw output
`…/2026-10-22-p2b2b2c2b-strokeProbe.txt`, `…-swingProbe.txt` and `…-impactProbe.txt`. The rulings, in the user's
words, are in the design's amendments. Observations, not gates, but for the exit criteria. "Old → new" throughout.

- **The gap** (design §3): a croquet stroke's croqueted ball may lie 0 to < 2 mm from the striker's
  (`CROQUET_GAP_LIMIT` in `src/engine/shot.ts`; `validateSetup` rejects a gap at or beyond it, the gap in its
  message); `canonicalSetup`'s `croquetGap`, default `DEFAULT_CROQUET_GAP` 1 mm, the CA's measured gap for its
  nominally touching strokes (Gugan 4, Table 5, row 2 and note (i): C1D, C3D and C10D at 1 mm, C10S at 0.5 mm) and
  the user's account ("an eternal problem … in actually getting the ball to rest touching"). Kept at the gate (G)
  for now; revisited after P2b.2b.2c.2c.
- **The read-out** (design §5.2): each speed read 1 ms after the latest end of the face and ball–ball contacts that
  begin within the strike's window of the first face contact. The window, 5 ms in the plan, is 15 ms: widened by the
  user's ruling on gate A's checks (for example 20 ms) so that B2GS is read after Gugan's double tap, and set at
  15 ms, the smallest round value past that tap at 10.8 ms. The earliest contact it now excludes is a
  follow-through's approach at 87.3 ms, and the drive's late catch (about 109 ms) stays out.
- **Gugan's mallet** (design "My calls"): his strokes are played with the swung body's effective mass at the face
  centre 2.30 ball masses, solved per preset on the head's mass (bracket [0.75, 2] × the default's): 0.93375 kg on the
  drive and the single-ball stroke, 0.90654 kg on the AC stop, against the default's 1.0 kg.
- **The filmed strokes** (gate section E; the default mallet, each at its recorded gap; the model's v₂/U, w₁/W and
  v₂/w₁ against Table 5's row):
  - B2GS (6 mm) 1.065, 1.783, 1.888 against 1.042, 1.849, 1.786; B1GS (1 mm) 1.104, 1.764, 1.980 against 1.029,
    1.722, 1.936; B1MS (2 mm) 1.093, 1.764, 1.934 against 1.098, 1.635, 2.014; B2MS (6 mm) 1.083, 1.772, 1.900
    against 1.044, 1.711, 1.886;
  - C3S (0) 1.247, 2.555, 2.115 against 1.146, 1.732, 2.268; C10S (0.5 mm) 1.196, 1.484, 2.636 against 1.149, 1.794,
    2.135; C20S (0) 1.240, 1.493, 2.854 against 1.086, 1.611, 2.172;
  - C1D (1 mm) 1.113, 1.721, 1.991 against 1.152, 1.632, 2.323; C3D (1 mm) 1.147, 1.571, 2.224 against 1.109, 1.918,
    1.964; C10D (1 mm) 1.159, 1.497, 2.338 against 1.109, 1.483, 2.256;
  - the means, against Gugan's 1.10 ± 0.02, 1.71 ± 0.05 and 2.07 ± 0.06: all ten 1.1445 (miss), 1.7405 (pass),
    2.1862 (miss); C3S and C20S left out 1.1198, 1.6697 and 2.1116, all three passing. Before the window's widening
    the means missed both ways (all ten 1.149, 1.601, 2.61; without C3S and C20S 1.125, 1.495, 2.64): B2GS alone,
    read before its double tap, gave w₁/W 0.388 and v₂/w₁ 6.11;
  - W/U and the energy kept are recorded per stroke beside Table 5's (B2GS 0.316 and 0.694 against 0.316 and 0.719;
    the model's W/U 0.231–0.331, the film's 0.292–0.333); the nominal strokes repeated at ±0.5 mm move v₂/U by up to
    0.072, w₁/W by up to 0.41 and v₂/w₁ by up to 0.46 (sensitivity only).
- **The timing** (gate section F, against Fig. 4 re-read by pixel; the model by the contact law's intervals and as the
  video would time it, a contact on while the surfaces are within 0.2 mm): C3S, C20S, C10S, C3D and C10D keep all three
  bodies loaded throughout and fail the check; the model's first face contact ends at 1.39–2.17 ms by the law
  (1.63–2.41 ms on video) against the film's 0.64–0.99 ms, and no second face interval falls within the strike. Only
  C1D (2.5 m/s, 1 mm) separates by the law (the face releases at 1.09 ms and re-taps at 1.385–2.745 ms), never 0.2 mm
  clear, so the video sees one contact to 3.08 ms, the reverse of the film. By the law the croqueted ball first
  moves 0.03–0.36 ms later than the film shows and leaves within 0.13 ms of it.
- **The search** (gate section I; design §4): no candidate passes, each missing first at test 1 (C3S and C20S at gap
  0):
  - a, resolution of "touching": no gap in 0–0.5 mm reproduces C3S or C20S; v₂/U 1.247 → 1.171 on C3S and 1.240 →
    1.201 on C20S across it, w₁/W and v₂/w₁ unevenly; test 2 misses (v₂/U at C1D's U 1.252 at gap 0 to 1.099 at
    1.9 mm, against Table 5's 1.029–1.152); test 3 passes;
  - b, the face in a squeeze (the face law's contact time scaled ×0.847 to Table 2's 0.75 ms at 3.26 m/s): C3S v₂/U
    1.257, w₁/W 1.754, v₂/w₁ 2.631; C20S 1.222, 1.074, 3.451; the gapped strokes' w₁/W 1.538 and v₂/w₁ 2.554 miss;
    the single-ball strokes unchanged within their measurement;
  - c, the turf under the balls: the bed's impulse along aim on the croqueted ball is 0.1–0.2 % of the ball–ball
    impulse over the first 0.5 and 1.5 ms; the turf does not separate the hits;
  - d, off-line contact: the balls' normal lies within 0.21° of aim at the peak force, the striker's ball risen
    0.09–0.33 mm; the geometry does not separate the hits;
  - e, a rate-dependent ball–ball law (a Maxwell element, k 2.63e6 N/m and τ 1.41 ms fixed on Table 1 alone; the
    law's own contact time 0.927 ms): Table 1's free collisions timed as the video would at 0.70, 0.77 and 0.80 ms
    (pass), the single-ball strokes unchanged; C3S v₂/U 1.190, w₁/W 1.448; C20S 1.159, 1.196; the gapped strokes'
    v₂/U 1.102 passes, w₁/W 1.544 and v₂/w₁ 2.519 miss;
  - the harness on today's law: e 0.72 at every speed, but the free collision timed as the video would 0.530, 0.587
    and 0.607 ms at 1.90, 5.54 and 7.64 m/s, more than a frame short of Table 1's 0.75 ms (the law's own 0.750 ms);
  - the cause, traced at gate A's checks: the face's Hertz law (Gugan 2000's drop-test fit) is too compliant and too
    slow against the ball–ball law (at C3S the face's free contact 1.00 ms, the ball–ball law's 0.75 ms), so the
    croqueted ball pushes the striker's ball back before the face's restitution completes; the hands and the effective
    mass are not the cause (the 1-D chain agrees within 0.03 ms). A face ×0.74 (Table 2 as law time) with a ball–ball
    law of 0.93 ms (Table 1 converted from video to law time) puts C3D near the film; C3S at gap 0 still shows no
    visible release. Carried to P2b.2b.2c.2c.
- **The step convergence** (gate section G; design §6): the cause was the friction's re-stick after a sliding step.
  A Cundall–Strack spring reset to the cone it met carries last step's μN, so a contact whose load rose re-stuck at a
  slip proportional to the step (μ·Ṅ·dt/c_t); the ball–ball pair re-stuck 10–35 µs apart at 2.5, 5 and 10 µs, the
  difference reaching the striker's spin (2.146, 2.114, 2.037 rad/s). The fix (`contactLaw.ts`'s friction step, with
  the pair's `slid` state): a pair that slid on its previous step and would now stick is re-tested with its spring held
  at the current cone. It applies to the impact's face–ball, ball–ball and ball–obstacle pairs; the turf bed and the
  head–turf contact keep the plain law (step-free here). After it, at dt/2, dt and 2·dt: the three means spread
  0.0003, 0.0020 and 0.0021 (0.014, 0.041 and 0.035 of Gugan's sem); Gugan 5's drive 5.1602, 5.1615, 5.1612 at gap 0
  and 4.4708, 4.4671, 4.4682 at 1 mm; the stop 6.0698, 6.0730, 6.0678 and 7.0290, 7.0266, 7.0251 (each under 0.02 of
  its tolerance). The canonical drive with its push and late catch, 3.31, 3.48 and 3.47 on `main`, is not a judged
  figure and was not re-run at three steps. The default step and the cost unchanged.
- **Gugan 5's drive and stop across the gap** (gate section J; 3 m/s, Gugan's mallet; the drive with no push, the
  stop over the jab 0–8 mm):
  - the drive at ball–ball e 0.72: 5.16, 6.10, 6.00, 4.47, 4.19 and 4.17 at gaps 0, 0.25, 0.5, 1, 1.5 and 1.9 mm,
    within 4.23 ± 0.2 at 1.5 and 1.9 mm; at e 0.772 5.64, 6.56, 6.35, 4.67, 4.30 and 4.28, within it at the same gaps;
  - the stop at e 0.72: within 7.15 ± 0.6 at 1, 1.5 and 1.9 mm for jabs to 6.5 mm, and at 1.5 and 1.9 mm beyond (jab
    0: 6.07, 8.35, 9.75, 7.03, 7.20, 7.05); at e 0.772 within it at gap 0 for every jab, at 1 mm to a jab of 3.5 mm,
    at 1.5 mm to 7 mm and at 1.9 mm to 1.5 mm;
  - the touching and nearly touching strokes (0–0.5 mm) carry the ratio far above Gugan 5's, the defect at gap 0.
- **The scatter** (gate section K; design §7.3): the model's sensitivity to the gap agrees with the film's (spread
  across the ten strokes 1.47 × the film's on v₂/U and 1.80 × on v₂/w₁, slopes on the gap of one sign; without B2GS,
  for transparency only, 1.33 and 2.19), so the hypothesis is judged: the drive's standard deviation over J's gaps is
  0.880, 1.47 × Gugan 5's 0.6 (1.03, 1.71 × at e 0.772), the stop's largest half-range 1.84, 0.92 × his ± 2.0. Almost
  all of it comes from gaps under 0.5 mm. The user's ruling: "consistent but not established", re-judged after
  P2b.2b.2c.2c.
- **The distance check** (gate section A; P2b.2b.2c.2's section A): the CA's single-ball strokes unchanged, the
  strike's share ×0.98, ×0.96, ×0.97 and ×1.20 (A1D–A4D), the lawn's ×0.56, ×0.88, ×0.86 and ×0.73. Gugan 5's drive,
  a croquet stroke at the preset's push, 6.6526 yd on `main`, 6.6502 after the convergence fix (gap 0), 5.3192 yd
  (×0.7599 of about seven yards) at the 1 mm default. The cause: less squeeze at 1 mm, so v₂/U is lower (about 1.12
  against 1.25 at gap 0) and the drive shorter, consistent with the lawn running short on the single-ball strokes.
  Missed at the gate and ruled after it, "Record, re-check later": re-checked after P2b.2b.2c.2c, beside the lawn's
  pace.
- **The jab and the control run** (gate section M.1; `tests/engine/turfStrike.test.ts`): at the 1 mm default every
  depth of 0–8 mm double-taps at 1.26–1.265 ms with a second-tap speed 0.4414–0.4440·U, inside Gugan's band
  [0.295, 0.463]·U, but the head grounds only after the second tap (from a jab of 2.5 mm, 18.0 → 12.5 ms), so no graze
  qualifies and the check still fails (`it.runIf(SLOW).fails`, its comment carrying the figures; P2b.2b.2b.3's 0.523·U
  at gap 0). The grip-limit control run was not re-run: no face-law candidate was admitted.
- **The AC stop's re-contacts** (gate section M.3): the canonical run double-taps (face 0.005–1.095 and 1.265–2.62
  ms); of the digest grid's 225 runs 90 are beyond the stroke's reach, 135 have a second face interval and 96 a
  face-region re-contact that `impact-off-face` does not flag, ruled correct (a face-region tap is not off-face).
- **The effective mass** (gate section M.4; ruling D's 0.9·m ≤ m_eff ≤ M): the canonical drive 1.1095 kg, +10.95 % on
  the 1.0 kg head, 2.446 ball masses (outside the filmed strokes' 2.30–2.41); with Gugan's mallet 1.0433 kg, +11.73 %
  on its 0.9338 kg head, 2.300; both within ruling D, and the solve held at 2.30 across the jab, the guide effort and
  the gap.
- **The landing and slide-to-roll share** (gate section L; the distance ratio over the squared speed ratio as the
  balls leave, less one): the filmed strokes' model shares −43 to +28 %, the film's −29 to +2 % (C3S +11.9 against
  +1.5, C3D −0.7 against −28.6); Gugan 5's drive at 1 mm −3.2 % (−0.5 at e 0.772), his stop +35 to +53 % over the
  jab (+39 to +59 at e 0.772), where the film's stops show −25 to +2 %. The stop's share is the leading suspect for
  the stop's ratio, re-measured after P2b.2b.2c.2c.
- **The ratchet's moved runs** (gate section G; the preset digest's 1582 runs):
  - after the gap option and the engine's check, at gap 0: bit-identical;
  - after the convergence fix: 334 moved (single-ball 0, drive 136, AC stop 3, GC stop 0, half roll 46, full roll
    39, pass roll 110), each one that takes the fix's branch; `impactDigest` 6 of 200 fuzz strokes; `shotMix` and
    `impactProbe` unchanged; one test re-baselined (the read-out's canonical drive v₂ 3.7548 → 3.7546, W 0.7905 →
    0.7904);
  - after the default's move to 1 mm: 950 moved, every simulated croquet run (the drive and the AC stop 136 each,
    their other 90 beyond reach in both; each roll 226), single-ball and the GC stop 0; `impactDigest`, `shotMix` and
    `impactProbe` unchanged (none uses `canonicalSetup`); in the probes only croquet lines moved, possible fault
    29.1.6.1 now on all five croquet presets, the head off point on the grid full roll 67 → 84 and pass roll 110 → 142
    of 225 (half roll 0; from `main` to the branch, so the convergence fix's and the default's moves together), the
    AC stop's dip "depths meeting both" 13.00–14.00 → 13.50–14.00 mm; two hit counts re-baselined and four tests
    pinned at gap 0, where their mechanisms occur (29.1.14; the AC stop's relaxed head meeting the turf; the early
    dip's slower travel; the handover's head cleared of a lifted ball);
  - at 1 mm every canonical croquet stroke but the drive double-taps as the film shows (the AC stop's face 0.005–1.095
    and 1.265–2.62 ms); the canonical drive is one face interval (0.005–2.510 ms).
- **Every preset's canonical setup** runs from top to finish, each default planning 3.000000 m/s; the late re-hit
  sweep ends no run with the head overlapping a ball as handed over (0 of 225 on every preset).
- **The pre-flight gate's rulings** (2026-10-21, verbatim in the design's amendments): A "Check, then design", then on
  the checks "Widen window, re-run", then "Accept, gap-0 to new step" (the touching stops' miss a known defect at gap
  0, the face/ball–ball law step opened before the follow-through); B "None lands; carry leads"; C "Accept" (the turf
  contacts' plain law carried); D "Accept, record share"; E "Record: not established"; F "Accept, record jab" (the
  jab's qualifier re-examined in the law step; the 96 unflagged re-contacts correct); G the default stays 1 mm for now,
  the moved runs, re-baselines and pins accepted, revisited after the law step; the double tap's fault flag left as it
  is, the law step sourcing the Laws on it; after the gate, section A's Gugan 5 drive at 1 mm "Record, re-check
  later".
- **Cost** (machine-dependent; `shotMix`, COUNT=800, alone): the engine's time per shot p50 3.426 → 2.904 ms, p99
  59.320 → 43.962, p99.9 and max 86.635 → 53.414; the solver's p99 5.693 → 4.636. Unchanged within noise (no
  `shotMix` shot moved).
- **Carried open items:**
  - Closed: the impact's step convergence (fixed); whether the AC stop has an unflagged face re-contact (96 on the
    grid, ruled correct).
  - For P2b.2b.2c.2c (gate A): the known defect at gap 0, the touching stops C3S and C20S missing because the face law
    is too compliant and slow against the ball–ball law; with it, today's ball–ball law timed as the video would at
    0.53–0.61 ms against Table 1's 0.75 (gate B), and Gugan's practical video resolution, "several times greater" than
    the 0.2 mm the harness takes.
  - For P2b.2b.2c.2c: the stop's landing and slide-to-roll share (gate D), the scatter (gate E), Gugan's jab check
    (still `it.runIf(SLOW).fails`; its turf-graze qualifier against Gugan 5 at the CA gap, gate F), the default gap
    and the unmeasurable-gap hypothesis (gate G), the double tap's possible fault 29.1.6.1 on every canonical croquet
    stroke, the four tests pinned at gap 0 (at 1 mm a jab of 2.5 mm still grounds the head, at 18.0 ms), and section
    A's Gugan 5 drive distance at the default (5.32 yd), beside the lawn's pace.
  - For P2b.2b.2c.2d: the drive's double hit, its late catch at 109 ms, which rests on the bottom hand's push after
    contact at `guideEffort` 1; no measurement found establishes it.
  - The turf contacts (`turfBed.ts`, `headTurf.ts`) keep the plain friction law: step-free here, but the same early
    re-stick under a rising load (gate C).
  - The fitter's three review items, for whichever step next runs a fit: `parseCandidate`'s leniency,
    `fitRatios.ts`'s exit code on "closest", section C's "reachable" verdict across a jump.
  - The pressed-in croqueted ball (the user pressing it into the lawn, "perhaps even with the foot"): a later set-up
    input.
  - The origin of the design's 0.378 m drift, which does not reproduce (the largest offset 23.8 mm).
  - The weak stroke stopped dead: still `it.todo`.
  - The probe (`scripts/croquetFitProbe.ts`): section E.3 prints no W/U or energy means against Table 5's (about 0.30
    and 0.75); section F's lines lack an "ms" suffix and its header claims a ±0.5 frame band it does not print; F
    judges by intervals (it could print the three bodies' overlap); Fig. 4's research reading is held in the probe,
    not beside `FIG4_TIMING`; E and F use `defaultWorld`, D and G `fitWorld` (equal for these strikes); `guganStroke`
    is exported but internal; the comment at :27-30 places the "closest" exit-code item in section C; section F's
    header has a backtick segment with no interpolation; candidate c reports the bed's impulse along aim, not its whole
    tangential magnitude; test 5 recomputes section A's shares, and Table 2's face restitution has no line of its own;
    J's e 0.772 table jumps non-monotonically (regime switches), so its reach lists read as trends; M.3 counts a run
    unflagged only if `impact-off-face` was never raised; M.4 states the ruling-D comparison implicitly; the search
    file's lines 58 and 72 ("diff in the report") point to a report that is not kept.
  - The read-out (`scripts/ratioFit.ts`): `ReadOut.samples` keeps every step (about 28,000 in a 140 ms impact) for one
    test; no test pins the window's boundary (a start at 14.9 ms counted, at 20 ms not); candidate d's peak-force
    search shares `STRIKE_WINDOW`; `effectiveMassOf`'s error lacks its function's prefix, and `massOf` plans the
    contact twice.
  - The tests: `ratioFit.test.ts` (the B1 test, `timeline["face/blue"]`, line 226) takes the last face interval and
    hard-codes "face/blue" (use the first and `faceKey(setup.striker)`); its test-local `leanOf` (line 35) duplicates
    `leanOf` in `ratioFit.ts` (line 585); the comment at line 236 calls the 2 % the turf's normal, where it is the
    ball–ball tangential impulse; the 33 s mallet test runs in the default suite (the drive by default, every preset
    behind `SLOW_TESTS`); `shot.test.ts`'s titles at lines 364, 608 and 643 describe gap-0 behaviour under "on the
    canonical setups" (qualify "balls touching"); its stale comments at line 66 ("touching") and line 501 (the
    drive's hit times).
  - The sources (`scripts/filmedStrokes.ts`, `reference/sources/README.md`): the Table 1 caption's quote omits note
    (ii) ("B7MS was originally classified in error as clean"); code comments cite README line numbers, which move as
    it grows.
  - The fitter's read-out (`scripts/ratioFit.ts`), for P2b.2b.2c.2c: `meansOf` drops OPEN strokes per run, so the
    convergence spread could compare different stroke sets (make the counted set explicit); `readTimeOf` judges `open`
    on face intervals only (a ball–ball interval still on at the window's end is not flagged); the Gugan-mallet cache
    exists twice (`ratioFit.ts` `guganStrokes`, `croquetFitProbe.ts` `GUGAN_MALLETS`/`guganPlayed`) and `leanOf` twice
    (`ratioFit.ts`, `ratioFit.test.ts`): move the cache into `gugansMallet` and export `leanOf`; the probe mixes
    `defaultWorld()` and `fitWorld(TODAY)` (equal in value), so identity-keyed caches solve twice.
- **Tests:** `npm test` 1220 → 1249 passed, 1 expected fail (the free collision's video time on today's law), 7 → 10
  skipped, 1 todo; the slow suite's convergence 3 of 3 and `turfStrike` 3 passed, 1 expected fail (Gugan's jab), 1
  todo.
- **Public:** no new export; `simulateShot` accepts a croquet stroke whose balls lie 0 to < 2 mm apart
  (`CROQUET_GAP_LIMIT`, internal to `src/engine/shot.ts`).

## P2b.2b.2c.2c outcomes (2026-10-23)

Measured by `scripts/croquetFitProbe.ts` (sections A, D–G and I–P), `scripts/squeeze.ts` (the conversion harnesses
and the camera), `scripts/strokeProbe.ts`, `scripts/swingProbe.ts` and `scripts/impactProbe.ts`, against the
throwaway preset digest (a `phys` and a `faults` hash per run), `impactDigest`, `shotMix` and `impactProbe` taken on a
baseline worktree at d854668 before any change. The records: stage 1's evidence
`docs/superpowers/probes/2026-10-22-p2b2b2c2c-laws.txt` (the copies' batteries and the search, on both video clocks),
the investigation `…/2026-10-23-p2b2b2c2c-investigation.txt`, the gate's record `…/2026-10-23-p2b2b2c2c-gate.txt` (the
whole probe on the landed laws at the 1 mm default, with the ratchets, the obstacle fuzz, §7.9's conversions, the slow
tests, the cost, gate D's clarification and section N at 0.75 mm appended), and the raw output
`…/2026-10-23-p2b2b2c2c-strokeProbe.txt`, `…-swingProbe.txt` and `…-impactProbe.txt` at the 0.75 mm default. The
rulings, in the user's words, are in the design's amendments. "Old → new" throughout.

- **The laws** (design §2; gate section I.0, the video's clock from first touch, gate ruling A1):
  - the face: T(U) = t0 · (U/u0)^q, t0 0.97 ms at u0 2.19 m/s → 0.579 ms at 3.26 m/s, q −0.23 kept (Gugan 2000's);
    the conversion factors on the old law (Hertz similarity, `faceScaleFor`) A1D 0.329, A2D 0.654, A3D 0.627 and A4D
    0.713 (at the clamp's 6 m/s); held out against Table 2's Τh ± 0.1 ms, A3D 0.622 ms (0.60) and A4D 0.555 ms (0.60)
    pass, A1D 1.421 ms (1.00) misses by 0.42 ms, ruled a threshold effect at 0.76 m/s; the q fit over all four
    columns, t0 0.506 ms and q +0.12 (the wrong sign for Hertz), offered and not taken; e(U) unchanged, Table 2's
    implied restitution 0.737, 0.825, 0.698 and 0.704 beside e(U)'s 0.847, 0.815, 0.795 and 0.793 (recorded only);
    Table 2's A2D in the full single-ball stroke 0.761 ms on video (§4.1 test 5, passing);
  - the ball–ball: `ballBallContactTime` 0.75 → 0.551 ms, its bounds [0.5, 0.87] → [0.319, 0.662] ms (Table 1's
    video range converted); `ballObstacleContactTime` follows, 0.75 → 0.551 ms, bounds [0.277, 1.0] ms; the obstacle
    fuzz's deepest penetration 0.0401 R → 0.030 R (1.380 mm, 2000 strokes, no caps) against 0.06 R;
  - the law's parameter T in `contact.json` is the force-on duration; δ > 0 lasts a little longer under the force
    clamp, so the harnesses print the law time and the force-on time apart.
- **The free collisions** (design §2.2; Table 1's B4GS, B6MS and B5MS): on video from first touch 0.844, 0.679 and
  0.656 ms at 1.90, 5.54 and 7.64 m/s, within a frame of 0.75 ms (misses +94.4, −70.8 and −94.4 µs), e 0.72; the
  last step's `it.fails` on the free collision passes. On the first visible move's clock, not adopted, the same
  conversion gives a parameter of 0.968 ms.
- **The filmed strokes** (gate section E; the default mallet, each at its recorded gap; the model's v₂/U, w₁/W and
  v₂/w₁ against Table 5's row):
  - B2GS (6 mm) 1.067, 1.787, 1.890 against 1.042, 1.849, 1.786; B1GS (1 mm) 1.103, 1.767, 1.976 against 1.029,
    1.722, 1.936; B1MS (2 mm) 1.091, 1.771, 1.923 against 1.098, 1.635, 2.014; B2MS (6 mm) 1.085, 1.778, 1.903
    against 1.044, 1.711, 1.886;
  - the touching stops at gap 0, against their rows ± §5.2's bands (3 % per speed in quadrature): C3S 1.247, 2.555,
    2.115 → 1.257, 1.975, 2.459 against 1.146 ± 0.049, 1.732 ± 0.074, 2.268 ± 0.096; C20S 1.240, 1.493, 2.854 →
    1.231, 1.151, 3.319 against 1.086 ± 0.046, 1.611 ± 0.068, 2.172 ± 0.092; every figure misses;
  - C10S (0.5 mm) 1.147, 1.619, 2.292 against 1.149, 1.794, 2.135; C1D (1 mm) 1.104, 1.748, 1.947 against 1.152,
    1.632, 2.323; C3D (1 mm) 1.104, 1.729, 1.962 against 1.109, 1.918, 1.964; C10D (1 mm) 1.109, 1.693, 2.005 against
    1.109, 1.483, 2.256;
  - the means, against Gugan's 1.10 ± 0.02, 1.71 ± 0.05 and 2.07 ± 0.06: the eight gapped strokes 1.1013 (pass),
    1.7365 (pass), 1.9871 (miss, 1.38 sem); all ten 1.1298 (miss), 1.7018 (pass), 2.1674 (miss);
  - the nominal strokes repeated at ±0.5 mm move v₂/U by up to 0.101 (C10S at 0), w₁/W by up to 0.215 and v₂/w₁ by up
    to 0.640 (sensitivity only).
- **The timing** (gate section F, beside Fig. 4 and the four sources of design §5.3, each as its instrument saw it):
  - by the law, the gapped drives now release and re-tap within the strike: C1D's face lets go at 0.655 ms and re-taps
    at 1.410–2.280 ms (the film 0.81 and 1.600–2.638), C3D 0.600 and 0.920–1.670 (0.99 and 1.350–2.025), C10D 0.590
    and 0.795–1.505 (0.75 and 0.788–1.663); C3S, C20S and C10S keep all three bodies loaded, the first face contact
    ending at 1.060–1.595 ms against the film's 0.64–0.76 ms (reported, not failed, decision 5);
  - the camera (8,000 fps, 16 frame phases): only C1D's second tap is seen, at 0.2 mm alone (frames 9–10 to 21–22);
    C3D's and C10D's law taps open at most 0.148 and 0.088 mm, unseen at every threshold;
  - the electrical-contact sources: the balls part at 0.88–1.20 ms by the law against Hall's 1.8 ms, and no stop's
    face contact reaches Plummer's 1.8–2.0 ms.
- **The search** (design §4; gate C, the laws probe): no candidate lands. On the first-touch clock both §2 laws
  together, and each alone, miss test 1 (C3S and C20S at gap 0) and test 2; candidate f (a √δ damping on the linear
  spring, k 6.380e6 N/m, c 1.613e4 N·s/m^3/2) and g (a Hertz spring with the same damping, k 2.822e8 N/m^3/2, c
  1.497e4 N·s/m^3/2), each fixed on Table 1 alone, miss tests 1 to 4: no fixed constants hold e within 0.72 ± 0.02 at
  all three speeds (f 0.646–0.794, g 0.689–0.751), and g's video misses by more than a frame at 1.90 and 7.64 m/s
  (0.919, 0.581 ms).
- **The investigation** (gate B's "Pause for an investigation"): the cause of the touching stops' excess is the gap-0
  contact chain itself. The bare 1-D chain on the engine's two laws gives v₂/U 1.21 at gap 0, 1.15 at 0.25 mm and 1.08
  at 1 mm, within 0.02 of the full strokes at the model's effective mass; the extra ball–ball impulse at gap 0 lies
  entirely within the one overlapping face contact; decoupling the hands moves v₂/U by under 0.003, the effective
  mass by about 0.04. The face's and the ball–ball contact's time scales are matched (0.51–0.65 against 0.55 ms; the
  old laws' 0.78–1.0 against 0.75), so the three-body compression passes the head's momentum into the croqueted ball;
  scaling both times together leaves it unchanged, which is why no re-set of t0 alone moves it.
- **The default gap and the sweep** (design §3; gate D):
  - `DEFAULT_CROQUET_GAP` 1 → 0.75 mm, a deliberate fit to the touching stops' figures: of the sweep's seven judged
    figures (C3S's and C20S's three at their U, and v₂/U at C1D's U) 0.75 mm passes 5 and 1 mm 4, a margin within
    the step noise (1 mm's C20S v₂/w₁ miss 0.0006 against about 0.002). Gugan 5 at 0.75 mm: the drive 4.2946
    (pass); the stop at jab 0 6.5007 (miss), passing from a jab of 1.0 mm (6.5525). No test was re-baselined by the
    move;
  - across 0–0.5 mm, the gaps the film cannot tell from 0, C3S passes all three figures only at 0.4 mm (its v₂/U 1.257
    → 1.124) and C20S at none (1.231 → 1.159); at C1D's U (§4.1 test 2) v₂/U runs from 1.256 at gap 0 to 1.101 at
    1.9 mm, within Table 5's 1.029–1.152 from 0.5 mm; the canonical drive at gap 0 (default mallet) v₂/U 1.253;
  - the five tests pinned at gap 0 keep `croquetGap: 0`.
- **The double tap** (design §6; gate sections N and E): a face re-contact beginning before the balls part is reported
  on `FaultReport.strike` and never flagged; possible fault 29.1.6.1 stays for a re-contact after the parting:
  - after the reporting, on the old laws: 29.1.6.1 gone in 37 grid runs (AC stop 19, full roll 18) and moved in 200
    from the in-strike tap (1.2–1.7 ms) to the first re-contact after the parting;
  - on the landed laws at 1 mm: 950 judged croquet runs, one tap each, all flagged after the parting; at 0.75 mm: 137
    runs with a second tap within the strike (drive 46, AC stop 46, half roll 45), 922 of 950 flagged (drive 127, AC
    stop 117, each roll 226); no sub-frame break merged anywhere;
  - the canonical runs at 0.75 mm: the drive taps at 0.005–0.670 and 1.010–1.845 ms, 0.099 mm apart, parts at 1.075
    ms and is flagged at its late catch (96.4 ms); the AC stop taps at 0.005–0.660 and 1.045–1.895 ms, 0.119 mm apart,
    parts at 1.070 ms, unflagged; each roll one tap, flagged at 1.25, 1.58 and 2.57 ms after partings at 1.09–1.14 ms.
- **The checks** (design §7; gate F; at the gate run's 1 mm default unless stated):
  - §7.1, Gugan 5's drive and stop (3 m/s, Gugan's mallet): the drive within 4.23 ± 0.2 at 1, 1.5 and 1.9 mm (4.19,
    4.18, 4.16), 6.48 touching; the stop at jab 0 within 7.15 ± 0.6 at 0.5, 1.5 and 1.9 mm, 6.48 at 1 mm (within from
    a jab of 1.5 mm), 7.76 touching; at ball–ball e 0.772 the drive within at 1–1.9 mm (4.31, 4.29, 4.28);
  - §7.2, the landing and slide-to-roll share: the filmed strokes' model shares −42.1 to +25.9 %, the film's −28.6 to
    +1.5 %; Gugan 5's drive at 1 mm −1.0 %, the stop +31.9 to +44.6 % over the jab;
  - §7.3, the scatter: the model's v₂/w₁ spread across the ten strokes is 2.66 × the film's, so the sensitivities
    disagree and the user's hypothesis is untested (the drive's standard deviation over J's gaps 1.19, 1.98 × Gugan
    5's 0.6; the stop's half-range 1.99–2.26 against ± 2.0);
  - §7.4, the distance check: the CA's single-ball strokes' strike shares ×0.98, ×0.96, ×0.97 and ×1.20 and the lawn's
    ×0.56, ×0.88, ×0.86 and ×0.73 (A1D–A4D), as before; Gugan 5's drive 5.3192 → 5.1316 yd (×0.733 of about seven
    yards);
  - §7.5, Gugan's jab: every depth of 0–8 mm double-taps at 1.300 ms with a second-tap speed 0.4504–0.4531·U, now
    inside Gugan's band [0.295, 0.463]·U, but the head grounds only after the second tap (from a jab of 2 mm, 18.8 →
    12.5 ms) or not at all, so no graze qualifies and the test stays `it.runIf(SLOW).fails`; the grip-limit control
    run passes in `turfStrike.test.ts`;
  - §7.6, the hands (section O): the head freed of the hands for 5 ms moves v₂/U by under 0.005 on the old laws
    (+0.0040, +0.0042, −0.0007 on C3S, C20S, C3D) and on the landed ones (+0.0026, +0.0027, −0.0003), w₁/W by up to
    0.060 and 0.031, the intervals by at most 10 µs;
  - §7.7, the strike's window: kept at 15 ms; a test pins its boundary;
  - §7.8, the AC stop's re-contacts and the effective mass: the canonical AC stop double-taps (face 0.005–0.635 and
    1.300–2.145 ms); of the grid's 225 runs 90 rejected, 135 with a second face interval, 96 → 95 with an unflagged
    face-region re-contact; the canonical drive's m_eff 1.1095 kg (2.446 ball masses), Gugan's mallet's 1.0433 kg
    (2.300), unchanged;
  - §7.9, the camera threshold's reach (section P): at 0.4 mm both laws re-convert (face t0 0.450 ms, ball–ball
    0.405 ms, Table 1 missed by more than a frame: +189, −142 and −189 µs) and criteria 3 and 4 miss as at 0.2 mm (C3S
    v₂/w₁ and all ten's v₂/w₁ turn to pass); at 0.6 mm no conversion exists (the ball–ball's best time at its
    bracket's edge, the face's A1D unconvertible), so Table 1 bounds the threshold near 0.2 mm on the first-touch
    clock.
- **The ratchet's moved runs** (the preset digest's 1582 runs, 226 per preset):
  - after the tidy: bit-identical (preset digest, `impactDigest`, `impactProbe`; `shotMix` timing only);
  - after the double tap's reporting: `phys` moved in none; `faults` in every non-rejected croquet run (drive and AC
    stop 136 each, each roll 226), single-ball and GC stop 0;
  - after the face law: `phys` moved in 136 single-ball, drive, AC stop and GC stop runs each and 226 of each roll,
    rejections unchanged; `impactDigest` 206 of 206 scenarios (every one with a face contact);
  - after the ball–ball law: `phys` moved in every croquet run (drive and AC stop 136, each roll 226), single-ball and
    GC stop 0; `impactDigest` 0, since it plays the test world, whose ball–ball and obstacle times are fixed;
  - after the default's move to 0.75 mm: the croquet runs alone (drive and AC stop 136, each roll 226); the probes'
    single-ball and GC stop blocks identical outside timing;
  - re-baselined with traces (gate stage 2, accepted): the pass roll's whole-roll lift cover, lost with a no-throw
    guard; the handover's full rolls, 1 → 0.8 m/s; `ratioFit`'s canonical drive at gap 0 (w₁ 1.618 → 1.392, v₂ 3.763
    → 3.766, the head 0.80 → 0.883); the hands test's cap, 12 → 9 ms (an input); and, traced with the face law,
    `contactLaw.test.ts`'s T(2.19) (0.6345 ms) and the timeline's double tap (two intervals).
- **The step convergence** (gate section G; dt/2, dt, 2·dt): the three means spread 0.0003, 0.0008 and 0.0020 (0.017,
  0.016 and 0.033 of Gugan's sem); Gugan 5's drive at gap 0 6.4783, 6.4824, 6.4944 and the stop 7.7486, 7.7608,
  7.7877 (0.080 and 0.065 of their tolerances); at 1 mm the stop passes (0.066) and the drive misses, 4.1978, 4.1911,
  4.1773, a spread of 0.0204 against 0.0200 (0.102 of its tolerance), marked `it.fails` in
  `squeezeConvergence.test.ts`.
- **Every preset's canonical setup** runs from top to finish, each default planning 3.0000 m/s; the late re-hit sweep
  ends no run with the head overlapping a ball as handed over.
- **The pre-flight gate's rulings** (2026-10-22 and 23, verbatim in the design's amendments):
  - stage 1: A1 "From first touch (Recommended)" (the video's clock starts at first touch, both laws re-converted); A2
    "Keep q −0.23 (Recommended)"; A3 "Both laws (Recommended)"; B "Pause for an investigation", then "Record and land
    (Recommended)" (the root cause, matched time scales, recorded; the laws landed); C no search candidate lands;
  - stage 2: D "Move to 0.75 mm", then "Keep 0.75 mm" (a deliberate fit within step noise, spec §12's anti-goal set
    aside by the ruling); E "Record and carry (Recommended)"; F §7.1, §7.4, §7.6 and §7.9 "Record (Recommended)", §7.5
    "Record, carry the qualifier (Recommended)", §7.7 "Keep 15 ms (Recommended)", the batch (§7.1's 0.772 variant,
    §7.2, §7.3, §7.8) "Record all (Recommended)"; G "Record; mark it .fails (Recommended)"; the unpredicted test
    changes "Accept, carry (5) (Recommended)", the fifth the 0.9 m/s full-roll handover throw.
- **Cost** (machine-dependent; `shotMix`, COUNT=800, alone, on the landed laws against d854668): the engine's time per
  shot p50 2.536 → 2.535 ms, p99 38.684 → 36.655, p99.9 and max 47.013 → 46.386; the solver's p99 4.495 → 4.233.
  Unchanged within noise.
- **Carried open items:**
  - Closed: the free collision's video time (the `it.fails` passes); the double tap's possible fault on the in-strike
    tap (reported, never flagged); the strike's window boundary (pinned by a test); the face's T(U) and the ball–ball
    time (re-set from Tables 2 and 1); the effective mass and the AC stop's re-contacts (re-measured, unchanged).
  - The touching stops C3S and C20S, missing at gap 0 on every figure; their mechanism, the face's and the ball–ball
    contact's matched time scales (a three-body push the bare chain reproduces); Hall's 1.8 ms touching-pair contact
    is the lead. The 0.75 mm default stands in for the cause until it is fixed. Not determined: whether a Hertzian,
    rate-dependent ball–ball contact would give the same transfer, whether the face's k and c (set on one ball's
    reduced mass) hold when the face drives two touching balls, and whether Gugan's gap-0 strokes were truly touching.
  - For P2b.2b.2c.2d: the face's re-contacts after the balls part (shepherding, the push, the drive's late catch),
    still possible fault 29.1.6.1 (922 of 950 grid runs at 0.75 mm); the user's braking stop.
  - Gugan's jab check (`it.runIf(SLOW).fails`): its figure is now in Gugan's band, but its turf-graze qualifier fails
    (the head grounds only after the second tap); the qualifier re-examined in P2b.2b.2c.2d.
  - The 0.9 m/s full-roll handover throw (the legacy mallet, gap 0, side 0; overlap 0.676 mm against 0.673 mm
    clearable), which pre-dates this step (0.8525 against 0.8466 mm on the old laws): an open defect.
  - The step convergence at 1 mm: the drive's ratio spread 0.0204 against 0.0200, marked `it.fails`.
  - The lawn's pace: the single-ball strokes' lawn shares ×0.56–×0.88 and Gugan 5's drive 5.13 yd against about
    seven, recorded beside it, not tuned.
  - The effective mass: the default mallet's 2.446 ball masses, outside the filmed strokes' 2.30–2.41; the
    investigation puts its share of the touching stops' excess at about 0.04 in v₂/U.
  - `impactDigest` plays the test world, whose ball–ball and obstacle times are fixed at 0.7 ms, so it cannot see the
    world-carried laws; the preset digest carries that check.
  - The stop's landing and slide-to-roll share (+31.9 to +44.6 % at 1 mm), the scatter (untested: the sensitivities
    disagree) and §7.1's 0.772 variant, carried as diagnostics.
  - Table 2's A1D, 0.42 ms over its held-out band on the first-touch clock, ruled a threshold effect; the camera
    threshold's reach ends near 0.2 mm (Table 1 unconvertible at 0.6 mm).
- **Tests:** `npm test` 1249 → 1283 passed, 1 → 0 expected fail (the free collision now passing), 10 skipped, 1 todo;
  the slow suite's convergence 3 → 2 passed and 1 expected fail (the drive at 1 mm), `turfStrike` 3 passed, 1
  expected fail (Gugan's jab), 1 todo.
- **Public:** `FaultReport.strike` (`StrikeTaps`: the balls' parting, the taps within the strike with their
  clearances, the sub-frame breaks merged across), a new exported type; `reference/laws.json` quotes 29.2.5,
  C29.11.1–3 and C28.3.2.

## Provisional numbers — where each is confirmed

| Spec number | Confirmed in | How |
|---|---|---|
| Safari / iPadOS 16+ floor, last two majors of Chrome/Edge/Firefox | P1 Task 1 | Explicit Vite `build.target`; revisited in P4 when Playwright WebKit runs |
| 1 mm cross-engine rest-position agreement | P1 (design), P5 (test) | P1 restricts engine code to IEEE-exact operations (`+ − × ÷ √`), enforced by lint, which should make results bit-identical across engines; P5's cross-engine test measures it |
| The stroke ratios' tolerances: Gugan 5's stated uncertainty, the drive 4.23 ± 0.2 and the AC stop 7.15 ± 0.6 at 3 m/s (P2b.2b.2c.2, `reference/swing.json` `ratioTargets`; they replace the provisional ±15 %) | P2b.2b.2c.2b (checked, not fitted); P2b.2b.2c.2c (re-measured) | The tolerances stand. P2b.2b.2c.2b set the fit aside (nothing fitted) and played Gugan 5's strokes like for like (3 m/s, his effective mass 2.30 ball masses, the drive with no push): the drive within 4.23 ± 0.2 at gaps 1.5 and 1.9 mm (4.19, 4.17), 4.47 at the 1 mm default and 5.16 touching; the AC stop within 7.15 ± 0.6 at 1, 1.5 and 1.9 mm for jabs to 6.5 mm (7.03 at 1 mm, jab 0), 6.07 touching. Re-measured on P2b.2b.2c.2c's face and ball–ball laws (gate section J and gate D's clarification): the drive within 4.23 ± 0.2 at 0.75, 1, 1.5 and 1.9 mm (4.29, 4.19, 4.18, 4.16), 6.48 touching; the AC stop at jab 0 within 7.15 ± 0.6 at 0.5, 1.5 and 1.9 mm (7.22, 7.08, 7.00), 6.48 at 1 mm (within from a jab of 1.5 mm), 6.50 at the 0.75 mm default (within from a jab of 1.0 mm), 7.76 touching. The stop's landing and slide-to-roll share is still its leading suspect (+32 to +45 % over the jab at 1 mm) |
| The croquet stroke's default gap, 0.75 mm (P2b.2b.2c.2c, `DEFAULT_CROQUET_GAP`, gate D: "Move to 0.75 mm", then "Keep 0.75 mm"; was 1 mm, P2b.2b.2c.2b, the CA's measured gap for its nominally touching strokes, Gugan 4, Table 5, row 2 and note (i)) | Open (P2b.2b.2c.2c's carried touching stops) | A deliberate fit to the touching stops' own figures, not a measured gap: in the sweep 0.75 mm passes 5 of the 7 judged figures against 1 mm's 4, a margin within the model's step noise (1 mm's C20S v₂/w₁ miss 0.0006 against a step spread of about 0.002), and Gugan 5's stop at 0.75 mm passes only from a jab of 1.0 mm, by 0.0025, within its step spread of 0.039. It stands in for the matched time scales' cause until the touching stops are fixed |
| The strike's read-out window, `STRIKE_WINDOW` 15 ms (P2b.2b.2c.2b, `scripts/ratioFit.ts`; a read-out definition, not physical: the smallest round value past B2GS's double tap at 10.8 ms, excluding a follow-through's approach at 87.3 ms and the drive's late catch at about 109 ms) | P2b.2b.2c.2c (re-checked) and P2b.2b.2c.2d | Kept at 15 ms on P2b.2b.2c.2c's moved taps (gate F, §7.7: "Keep 15 ms (Recommended)"), and a test now pins its boundary; re-checked when the follow-through step moves the late contacts |
| The face's contact time T(U) = t0 · (U/u0)^q, t0 0.579 ms at u0 3.26 m/s, q −0.23 (P2b.2b.2c.2c, `reference/contact.json` `faceContactTimeFit`; Gugan 4, Table 2, A2D's 0.75 ms on video converted to the law's force-on parameter by Hertz similarity, the clock from first touch; the exponent Gugan 2000's) | Open | Held out: A3D 0.622 and A4D 0.555 ms against 0.60 ± 0.1 pass; A1D 1.421 ms against 1.00 misses, recorded as a threshold effect at 0.76 m/s; a q fit over all four columns gives +0.12, the wrong sign for Hertz, and was not taken (gate A2). A better-resolved measurement of the face's contact time on a croquet ball, slow strokes especially |
| `ballBallContactTime` 0.551 ms, bounds [0.319, 0.662] ms; `ballObstacleContactTime` follows at 0.551 ms, bounds [0.277, 1.0] ms (P2b.2b.2c.2c, `reference/contact.json`; Gugan 4, Table 1's 0.75 ms and range [0.5, 0.87] ms on video converted to the law's force-on parameter, the clock from first touch) | Open | Table 1's clean free collisions on video within a frame of 0.75 ms (0.844, 0.679 and 0.656 ms at 1.90, 5.54 and 7.64 m/s), e 0.72; the obstacle fuzz's deepest penetration 0.030 R against 0.06 R. Its matched time scale with the face's is the touching stops' traced cause; Hall's 1.8 ms touching-pair contact is the lead |
| ±5 % / ±2 % calibration round trip | P3 | Round-trip test |
| ≤ 2,000-character links | P4 | Measured on worst-case setup plus profile |
| ≤ 200 ms simulation, ≤ 250 KB gzipped | P5 | Throttled CI measurement and bundle report |
| The default mallet's edge radius, 3 mm (P2b.2b.2b.2c, a placeholder: no bevel figure is published) | P3 (proposed; the player's mallet) | Measured on a real head, or entered by the player |
| The default mallet's fills for the Pidcock 2000 11" (P2b.2b.2b.2c): the head's mass 1.0 kg, the face 57.15 mm square, the shaft's length 0.9144 m (36"); Plummer's and USCA's typical figures, the Pidcock 2000's own unpublished | P3 (proposed; the player's mallet) | A maker's figure or a weighing of the Pidcock 2000, or the player's own mallet |
| The default mallet's shaft mass, 0.325 kg (P2b.2b.2b.2c, derived: Plummer's 1325 g whole mallet less the 1.0 kg head fill) | P3 (proposed; the player's mallet) | Follows the head's mass; a weighed shaft replaces it |
| The turf's bearing yield p_y, 240 kPa, bounds 172–310 kPa (P2b.2b.2b.3, derived: between Crum's 25 and 45 psi for sand rootzones); one lawn's figure, not turf in general | P3 (proposed; the lawn presets) | Measured on croquet lawns, or varied by the lawn presets (hard, dry ground and soft lawns) |
| The turf's root mat strength c, 105 kPa, bounds 73–138 kPa (P2b.2b.2b.3; our conversion of Mascitti's vane torques, labelled); one lawn's figure | P3 (proposed; the lawn presets) | Measured on croquet lawns, or varied by the lawn presets |
| Reece's cohesion factor N_c, 1.71 (P2b.2b.2b.3; an analogue: Mak & Chen's shallowest tabulated depth, 50 mm, at rake 18.5°, against the head's millimetres and near-vertical face) | Open | A factor for shallow, near-vertical tools, if one is published or measured |
| The hands' grip limit F_max, 435 N (P2b.2b.2b.3; Young's breakaway strength for a vertical cylinder, 435 ± 27 N, a handhold, not a mallet's grip) | P2b.2b.2c.2 (the arms' checking force) and P3 (grip tension) | The checking force (P2b.2b.2c.2) returns a slid anchor in swing mode at the arm's rate, so the slide no longer persists (the GC stop's 23.8 mm back to 0.11 mm); grip tension scaling the limit in P3 |
| The effort's ceiling, 9.0 m/s at intensity 1 from the body-limited top (P2b.2b.2c.1; 1.1 × the CA's A4D 8.18 m/s, the 10 % margin the design's own call), and with it τ_0 68.527 N·m | Open | The distance check (P2b.2b.2c.2) found the strike within 2–4 % of the CA's measured ball speeds (A4D on Gugan's reading), and the user ruled "Lawn pace, not the stroke": the distance gaps (long against the user's checks, short of the CA's travels) are the lawns' pace, and the ceiling stands |
| κ, the share of ω_max the drive's shaft uses at contact at full effort, ⅔ (P2b.2b.2c.1, a placeholder), and with it ω_max 16.195 rad/s | Open | A measured full-effort swing |
| The body's backswing limit θ_max, 64.9021°, knee height on the default mallet (P2b.2b.2c.1; the user's account of the stance, not a measurement) | P3 (proposed; the player's body) | Entered by the player, or measured |
| The hands' peak acceleration along aim, 300 m/s² (P2b.2b.2c.1, a placeholder keeping the 10 ms ramp at 3 m/s) | Open | Data on players' hands, with the player-facing push scale (carried) |

## Decisions deferred to the relevant plan

- **Reference data sourced in P2a.1** — ball–turf restitution, hoop-crown height.
- **Reference data sourced in P2b** — coaching ratios, mallet values, stance and drive defaults, face-material
  friction/restitution, turf compliance.
