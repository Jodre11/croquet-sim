# Gap register, 2026-11-16

The reality scorecard design's §6 register: the targets no allowed setting reaches, each with its evidence, the
candidate mechanisms, the discriminating probe's result, and a recommendation. Which gaps become designs is the user's
ruling. Records: `2026-11-16-baseline` (objective 23.92), `2026-11-16-map`, the joint fit (`2026-11-16-fit.jsonl`,
`fit-best`). Probes: `scripts/gapProbe.ts <mode>`, each one run on one core at the reference values.

Sources: Gugan 4, https://oxfordcroquet.org/tech/gugan4/ (fetched 2026-11-16); Gugan 5 as `scripts/filmedStrokes.ts`
cites it; Penner, Can. J. Phys. 80, 931 (2002), as the strike–turf laws design cites it.

## G1. The croqueted ball's spin, Ω₂, flat in speed

- **Targets.** t6 Ω₂ at 1 ms after the ball–ball contact: −36% in every roll; Gugan +39 (C1F), 0 (C3), −25 to −35
  (C10, C25). Fit-target z from −0.1 (C10H) to −3.7 (C3F, C3P); held out, C3H −3.6 and C1F −7.6.
- **Map.** Only ballBallFriction moves it, uniformly (+2.3 z at its low bound, which costs objective 53.8).
- **Probes.**
  - `read-delay`, reads 1–5 ms after the contact: Ω₂ rises about 5 points/ms in every roll alike. Candidate (b), the
    read instant, moves slow and fast rolls equally: **refuted** as the trend's cause.
  - `read-delay --set ballTurfSliding=1`: doubles that rate, again in every roll alike. Candidate (a), the parameter
    alone: **refuted** as the trend's cause.
  - `read-distance`, reads once the ball has travelled 5–30 mm: the trend appears. At 15 mm: C10H −29 (−35), C10F −25
    (−25), C25F −31 (−23), C10P −24 (−30), C25P −31 (−29); C3H −19 (0), C3F −10 (0), C3P −14 (0); C1F +7 (+39).
  - `hop`: the croqueted ball leaves the ground 8–17 ms after the contact and is airborne for 44–73% of its first 30
    ms, so the ground stops adding topspin. C1F's Ω₂ stalls at +7 from 10 mm on.
- **Reading.** Gugan's speeds and spins are averages over a few ms and mm of video, and he notes that C1F's initial
  negative spin was overcome by frictional torque early in the record (Table 6, note ii). The model's start, −36%, is
  ≈ −2.5μ at μ 0.16: the ball–ball contact slides throughout. The flat trend is mostly a **comparison gap** (a
  fixed-time read against his fixed-window read); the slow rolls' residual is tied to G4's hop.
- **Recommendation.** Change the card to read Ω₂ (and v₂) as R·Δφ/Δx over the croqueted ball's first 15 mm after the
  contact (assumption: Gugan does not state the window; 10–20 mm brackets it). A card change, not physics, applied
  with the adopted baseline. Then G4 decides the slow residual.

## G2. Striker's ball fast in the C25 rolls

- **Targets.** t6 w₁/U: C25F 0.73 (Gugan 0.50, z 10.6), C25P 0.76 (0.56, z 8.5, held out). Both fail the card's
  clean check. The slower full and pass rolls are low instead: C3F, C10F and C3P at z −2.9 to −3.9.
- **Map.** A cliff: faceFriction hi, ballBallFriction hi, handCouplingPeriod hi and ballTurfSliding mid/hi each move
  C25's w₁/U by −12 to −19 z, and flip its playability.
- **Probe** (`strike`). At C10 the face makes five contacts, 5.4–5.7 ms on in all, and the hands' impulse along the aim
  is 0.34–0.42 N·s. At C25, from 2.5 ms the face stays on ball 1 for 36–38 ms; the head *re-accelerates* from 0.47U to
  0.65U; the hands' impulse is 5.2–6.3 N·s (a mean of about 140 N, above pushForce's sourced 48–106 N).
- **Reading.** Candidate (a) **confirmed**: at C25 the hands drive the head, and through it ball 1, for 40 ms. Gugan
  describes the second contact as lasting several milliseconds. The hand coupling holds the head to the plan's track,
  and at C25 the plan runs faster than the struck head.
- **Recommendation.** A design: cap the coupling's force at the sourced push force, or let the plan's track yield to
  the contact. Discriminating run for that design: C25F with the coupling force capped at pushForce.
- **Reframed** (the user's "Reframe: fix the restart", 2026-11-17; `specs/2026-11-17-push-strength-design.md`). The push
  has ended at the departure (0.6 ms); C25's gap before the re-catch, 0.75–0.97 ms, fell under RESTART_HOLD's 1 ms, so
  the restart waited to 39–42 ms while the hands chased the plan.

### G2's discriminating run (2026-11-17, `gapProbe.ts restart`, reference values)

Restart (ms from first contact), and the gaps before it (ms). The strike's re-press is the first gap; the next is the
gap before the re-catch.

| Roll | 1 ms, one interval (was) | (a) 0.5 ms, one interval | (b) 1 ms summed | w₁/U (a) / Gugan |
|---|---|---|---|---|
| C3H | 2.93; 0.39, 4.30 | 2.43; 0.39, 4.46 | 2.54 | 0.438 / 0.380 |
| C10H | 2.63; 0.18, 2.83 | 2.13; 0.18, 2.92 | 2.45 | 0.404 / 0.400 |
| C10F | 2.89; 0.32, 1.21 | 2.39; 0.32, 1.29 | 2.57 | 0.465 / 0.569 |
| C10P | 2.95; 0.35, 1.12 | 2.45; 0.35, 1.18 | 2.60 | 0.480 / 0.520 |
| C25F | **42.10**; 0.22, 0.93 | 2.23; 0.22, 0.97 | 2.51 | 0.433 / 0.501 |
| C25P | **39.12**; 0.23, 0.75 | 2.25; 0.23, 0.76 | **38.14** | 0.438 / 0.557 |

- **(b) fails**: C25P's open time sums to 0.98 ms before the re-catch, under 1 ms.
- **(a) qualifies** and is adopted:
  - both C25 rolls restart before 5 ms;
  - C10H's head at the restart reads 2.498 m/s, against 2.532 at the old restart, which was taken after the strike
    had left the head;
  - C10H's last face contact ends at 5.5 ms.
- **(a)'s margin** is 0.11 ms each side: the largest rejected re-press is C3H's 0.39 ms, and the shortest accepted
  gap is C25P's 0.76 ms.
- C10H's re-press at the reference μ 0.16 is 0.18 ms; the spec's 0.38 ms was read at μ 0.06.

### G2 after the fix (`2026-11-17-restart`)

- **Card.** Objective **19.47** (baseline 23.92), at the reference values with no fit.
  - Table 6 7.23 → 4.45; playability 3.33 → 1.67; the other families are unchanged.
  - C25F w₁/U z 10.6 → −3.2, and it plays clean. Held out: C25P 8.5 → −5.0.
  - The cliff turns into a uniform undershoot. Every full and pass roll's striker's ball is now slow (w₁/U z: C3F
    −4.9, C10F −4.3, C3P −3.7, C10P −1.8, C25F −3.2, C25P −5.0).
- **Checks.**
  - Coaching ratios: full roll 1.16 → 1.34, out of its band (1.00–1.20); pass roll 1.12 → 1.29 (target under 0.99);
    half roll 1.77 → 1.78.
  - Lift: full roll 13.9 → 14.7 mm, pass roll 15.2 → 11.7 mm.
  - The pass roll's punch no longer outruns a coasting pass roll (1.4971 against 1.5034 m/s): the test is marked
    `it.fails`.
- **The hands after the restart** (spec §4), along the aim while the face is on the ball:

  | Roll | Mean | Peak | Time above F_push (92.2 N) |
  |---|---|---|---|
  | C10F | 22 N | 76 N | none |
  | C10P | 34 N | 80 N | none |
  | C25F | 41 N | 121 N | 0.47 ms |
  | C25P | 72 N | 174 N | 1.23 ms |

  - Before the fix the hands' impulse was 5.2–6.3 N·s; it is now 0.44–0.73 N·s.
  - C25P is still not clean: it exceeds the grip limit (superhuman, grip-limit). Its 1.23 ms above F_push is longer
    than a strike (0.6 ms). Under spec §4 this brings the strength cap back as **its own design**, now for the hands'
    peak on the re-catch, not the 40 ms chase.
- **The margin at the map's bounds** (§4). At ten of the twelve bound settings every C25 gap stays at 0.56 ms or more,
  and every re-press at 0.40 ms or less. The cliff remains at two:
  - ballBallFriction 0.06: C25P's gap is 0.30 ms and its restart is 38.6 ms; C10P's 0.52 ms re-press is read as the
    parting;
  - tangentialStiffnessRatio 2/3: C25F's gap is 0.47 ms and C25P's 0.02 ms (restarts at 41.6 and 38.6 ms).

  The fit pinned both parameters at their references, and ballBallFriction's low bound costs objective 53.8.
  Still, a refit could cross these cliffs. Spec §5 says a criterion on force or speed may then replace time.
- **Next.**
  - G1's card read (its own change).
  - Then the refit. With the cliff gone, the uniform undershoot and the coaching ratios are what the fit can work on.
  - The C25P grip-limit cap needs a design, and is a ruling for the user.

## G3. Gugan 5's drive and stop

- **Targets.** gugan5.drive 3.73 (4.23 ± 0.2, z −2.5); gugan5.stop 5.35 (7.15 ± 0.6, z −3.0). The slow test's stop
  assertion fails at the same 5.354.
- **Map.** Unreachable: no parameter moves either towards its target.
- **Probe** (`gugan5-balls`). On Gugan 5's own balls (e 0.772, not the card's 0.72): drive 3.79, stop 5.66.
- **Reading.** Ball e explains about a sixth of the stop's shortfall. Gugan 4's own filmed stops (Table 5) give ratios
  of 6.6, 4.2 and 4.1, and the model's are 5.2, 5.3 and 6.3: the model sits on Gugan 4 while Gugan 5 asks 7.15 of a
  jab stop on other balls and another lawn. A **target conflict** as much as a model gap; amendments 5–7 moved the stop
  from 6.91 (the old frictions give 5.76).
- **Recommendation.** The user's ruling: either play Gugan 5 on its own balls and keep it as a check, not a fit
  target, or treat it as a gap in the jab stop's technique. Until then the slow test's stop assertion stays failing,
  recorded.

## G4. The croqueted ball's lift in the full and pass rolls

- **Targets.** look.lift: full roll 13.9 mm, pass roll 15.2 mm (band 0–5); half roll 4.8 passes.
- **Probes.**
  - `bed`: the bed's e is 0.13–0.15 above Penner's golf fit at every speed from 0.2 to 4 m/s. Shifted to Gugan's own
    A4R anchor (e 0.50 where Penner gives 0.37), Penner's shape gives the model's 0.62–0.66. The candidate in the
    design, the bed's missing rate-independent loss, is **refuted**.
  - `hop`: at the end of the ball–ball contact the croqueted ball moves *down*, at about 0.15·v₂ in every roll (−0.17
    to −1.19 m/s), though the contact normal tilts 0.3–0.8° upwards. The striker's topspin drags the croqueted ball's
    near surface down through the ball–ball friction; the bed then returns it 8–15 mm into the air.
- **Reading.** One impulse, the ball–ball friction under the striker's topspin, sets both G1's −36% start and G4's
  drive into the bed. A lower ball–ball μ cuts the lift but also the start spin that the fast rolls match.
- **Candidates.** (a) A sliding ball driven obliquely into turf loses more than a vertical drop (ploughing); the bed's
  rebound is calibrated on vertical drops only. (b) Ball–ball friction falls with slip speed. (c) The look band (0–5
  mm) is too tight for a ball driven down at 1 m/s.
- **Discriminating probe** (for its design). An oblique landing on the bed, v₂ 1–8 m/s horizontal with vz −0.15·v₂,
  against a vertical drop at the same vz: (a) predicts a lower e for the oblique one, which the bed does not now give.

## G5. Smaller misses, recorded

- Face contact time A1D 1.42 ms (1.00 ± 0.1); turf depth A2R 5.3 mm (4.0 ± 0.5, held out); CA A4D strike share 1.20
  and lawn share 0.54. Unreachable in the map; not probed further in this phase.
- User yardage at intensity 0.3: 23 yd against 15 (0.4 passes; the drive's 35 yd sits on its band's floor).
- Table 5 stop shots' Ω₁ has the wrong sign (C3S +6, C20S +19 against −14, −12); C20S's w₁/W 1.12 (1.61, z −7.2).

## The joint fit

Nelder–Mead over seven parameters converged after 112 cards (simplex spread under 0.05): objective **17.49**
against the baseline's 23.92. Records `2026-11-16-fit.jsonl`, `2026-11-17-fit-best`.

| Parameter | Reference | Fitted | Note |
|---|---|---|---|
| faceFriction | 0.38 | 0.44 | 60% of [0.2, 0.6] |
| ballBallFriction | 0.16 | 0.150 | |
| tangentialStiffnessRatio | 2/7 | 2/7 | **pinned at its lower bound**, the reference |
| handCouplingPeriod | 0.080 | 0.077 | |
| handCouplingDampingRatio | 0.70 | 0.69 | |
| armMass | 0.80 | 0.95 | |
| ballTurfSliding | 0.48 | 0.48 | **pinned at its lower bound**, the reference |

- **By family** (Σz²/count, fit targets): table 6 7.23 → 3.56; playability 3.33 → 1.67; Gugan 5 7.60 → 6.53;
  table 5 3.80 → 3.78; strike 1.95 and turf 0.00 unchanged.
- **Where the gain is.** About 5.3 of the 6.4 comes from one target pair: faceFriction 0.44 takes C25F across G2's
  cliff (w₁/U z 10.6 → −3.3, playability 5 → 0). The cliff is not closed, only crossed: C25F now undershoots, and a
  small move in faceFriction would put it back.
- **Held out.** C25P w₁/U 8.5 → 1.7 (still not clean), C25P L1 1.1 → 0.0; worse: C3H w₁/U 3.6 → 4.6, C25F L1
  0.65 → −1.44. Every other held-out target moves by under 0.3 z.
- **Checks.** Lift falls (full roll 13.9 → 11.4 mm, pass roll 15.2 → 12.3), still outside 0–5. The pass roll's
  ratio worsens, 1.12 → 1.21 (it should be under 0.99: the striker's ball should go further), and the full roll's
  leaves its band, 1.16 → 1.23 (1.00–1.20).
- **Reading.** No setting in the bounds reaches the large misses; the fit's one big gain is G2's cliff, which is
  a mechanism, not a value. The two pinned parameters sit at their references, so the fit asks for nothing outside
  the sourced bounds.
- **Recommendation.** Keep the reference values; design G2 (cap the hand coupling at the sourced push force) and
  apply G1's card read, then refit. With the cliff gone, the fit's remaining moves (faceFriction, armMass) can be
  judged on their own, and the pass roll stays the shot it is.
