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
- **Applied** (2026-11-17, `2026-11-17-window`, on G2's restart). Over the first 15 mm, v₂ = Δx/Δt and
  Ω₂ = ∫R·ω dt / ∫v dt. Objective 19.47 → **18.80**; table 6 4.45 → 3.78 (fit targets). Ω₂ z: C3F −3.7 → −2.7,
  C3P −3.7 → −2.8, C10F −1.2 → −0.8, C10P −0.7 → −0.3; held out C1F −7.6 → −5.0, C3H −3.6 → −3.1. v₂/U z: C3P
  4.2 → 3.1, C3F 1.1 → −0.1, C1F (held out) 6.7 → 3.3; C10F −2.1 → −2.4.
- **Reading.** The window's mean weighs the contact's −36% start, so it gains less than the probe's point read at
  15 mm: the slow rolls read −27 to −31, against the point read's −10 to −19 and Gugan's 0. The slow residual stays
  with G4's hop: airborne, the croqueted ball gains no topspin from the ground.

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
- **Probe** (`grip`, 2026-11-17, reference values, after the fix). C25P's grip-limit is the **bottom hand at 0.37 ms,
  inside the first strike** (face 0–0.60 ms), not the re-catch: 435 N, 395 along the aim and 182 down. C25F's bottom
  hand peaks at 399 N at 0.61 ms (92% of the limit), C10P's at 276 N. On the re-catch the top hand peaks at 235 N
  (C25P) and 175 N (C25F), half the limit. The force along the aim summed over both hands (174 N, above) hid which hand
  and when. A cap at F_push on the re-catch would not touch it: the cap is **dropped**.
- **Reading.** The strike decelerates the head in about 0.6 ms, and the bottom hand's guide resists it through the
  hand–arm chain (palm and finger stiffness, Dong et al. 2013). The limit is the hand's breakaway strength (Young et
  al. 2009, 435 ± 27 N), which the model applies to every step. Gugan filmed C25P played, so a real hand bears it; the
  limit's reach is a sub-millisecond shock against a breakaway strength.
- **Ruling** (2026-11-17): a grip limit reached inside the strike is not superhuman; the hold still slips at the
  limit. ENGINE 0.36.0 records the first saturation before the first departure and the first after it; one the strike
  began counts as the strike's while it runs on past the departure, and as a hold once it is still on at the restart
  (a 15 N grip's saturation, `shot.test.ts`, stays superhuman). The judge (`src/lab/play.ts`) rules out only a limit
  at or after the departure, or any without one. Card `2026-11-17-grip-strike`: C25P plays clean; objective 8.83 →
  **7.16** (playability 1.67 → 0).
- **What it unmasks.** Plans that were superhuman now play, and play poorly: the full roll's text book at power 2
  gives ratio 1.45 at the preset hold (1.62 found), the pass roll's at 1.6–2 gives 1.53–1.55 (target under 0.99).
  The striker's ball's shortfall again. Two firmness tests lose their example of a plan no hold admits (`it.fails`,
  restore with a new case). A saturation that never meets a restart (no 0.5 ms open) is not re-checked.

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
- **Ruling** (2026-11-17): a check, played on Gugan 5's own balls (e 0.772). Card `2026-11-17-gugan5-check`: drive
  3.79 (z −2.2), stop 5.66 (z −2.5); objective 18.80 → **11.19**, its whole fall the family's removal. The slow
  test's stop assertion plays the same balls and is marked `it.fails`.

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
- **Probe** (`oblique`, 2026-11-17, reference values). `land()` on a fresh bed, vz = −0.15·v₂:

  | v₂ m/s | vz m/s | e vertical | e oblique | vx out/in | Ω₂ out (in 0 / −0.36) | hop mm |
  |---|---|---|---|---|---|---|
  | 1 | −0.15 | 0.590 | 0.600 | 0.79 | 0.64 / 0.19 | 0.4 |
  | 2 | −0.30 | 0.662 | 0.676 | 0.84 | 0.46 / 0.03 | 2.1 |
  | 4 | −0.60 | 0.650 | 0.676 | 0.85 | 0.40 / −0.02 | 8.4 |
  | 6 | −0.90 | 0.629 | 0.667 | 0.85 | 0.39 / −0.04 | 18.4 |
  | 8 | −1.20 | 0.611 | 0.660 | 0.85 | 0.38 / −0.04 | 32.0 |

  - The bed gives the oblique landing a slightly *higher* vertical e (+0.01 to +0.05), and the same e whatever the
    spin. It has no ploughing loss; the hops (8–18 mm at 4–6 m/s) match the look check's 13–22 mm.
  - Caveat: in the strike the croqueted ball starts in its rest dent, not on a fresh bed.
- **Sources** (2026-11-17). Rigid wall: the oblique normal e exceeds the normal-impact e for solid sports balls
  (Sports Eng. Tech., doi 10.1177/17543371251327464), as the bed gives. Tennis on court: backspin raises the
  vertical energy loss, topspin lowers it (Sheffield thesis, etheses.whiterose.ac.uk/id/eprint/14607); the bed has
  no such dependence. The cricket-pitch study (James, Carré, Haake, doi 10.1007/978-0-387-46050-5_42) could not be
  read: login or 403 on every host. No source gives a magnitude for turf.
- **Cricket pitch** (James, Carré, Haake, The Engineering of Sport 6, Springer 2006, pp. 235 ff.; preview pages
  only, read 2026-11-18). A rigid-surface model with friction predicted rebound speed and spin but not angle; the
  authors attribute a steeper rebound than expected to the ball meeting the front of its own depression (citing
  Carré et al. 1999). The turf's crater raises the rebound rather than damping it: against (a) as framed, and
  relevant to the croqueted ball, which starts in its rest dent. The results pages are awaited.
- **Gugan 4 §10.2** (fetched 2026-11-18, `curl -sSLk`). The croqueted ball is driven down by the striker's ball, as
  the hop probe found, and "minor jumping" of it shows on the CA's standard-speed video and is "often seen for roll
  strokes in ordinary play". For C1F he finds it leaves the ground about 15 ms after the strike, with Ω₂ ≈ 0.4 gained
  from ground friction first, and estimates its descent angle δ ≈ β (the stroke angle, 16° there), its rebound about
  half its descent speed (his 1.5 multiplier), and the sliding friction μs ≈ 1.0 ("very approximate"; Hall's 0.5).
  He gives no measured height for ball 2: the video's vertical resolution is poor. Two-ball rolls restrain ball 1's
  rise by the sloping face; single-ball rolls jump 6–310 mm (Table 4(b)).
- **Heights his account implies** (an inference, not his figure): up = ½·v₂·tan β, hop = up²/2g, Table 6's v₂ and β:

  | | C3H | C10H | C1F | C3F | C10F | C25F | C3P | C10P | C25P |
  |---|---|---|---|---|---|---|---|---|---|
  | hop mm | 8 | 42 | 0.8 | 2 | 21 | 13 | 6 | 5 | 8 |

- **The band.** look.lift's 0–5 mm is the scorecard design's exit criterion 4 (shot.test.ts's two `it.skip`), not a
  source. Gugan's account puts the medium and fast rolls' hops at 5–42 mm, the range the model gives (13–22 mm):
  candidate (c) is supported, though by an inference from approximate figures.
- **A lead for G1's slow residual.** Gugan's μs ≈ 1.0 for the croqueted ball pressed into the turf is about twice
  `ballTurfSliding` (0.48), and his C1F ball 2 reaches Ω₂ ≈ 0.4 before it leaves the ground; the model's stalls at
  +0.07 by 10 mm.
- **Which ball** (`lifts`, 2026-11-18, reference values). The check takes the higher of the two balls. At the
  canonical strength (v₂ ≈ 2.1 m/s, a medium roll) it is the **striker's ball** in the full and pass rolls:

  | Roll | v₂ m/s | striker's, impact / flight mm | croqueted, impact / flight mm |
  |---|---|---|---|
  | half | 2.59 | 2.0 / 4.2 | 2.1 / 4.8 |
  | full | 2.07 | **14.7** / 12.2 | 4.1 / 1.8 |
  | pass | 2.06 | **11.7** / 7.5 | 4.1 / 1.8 |

- **The user's observation** (2026-11-18, with their son): the croqueted ball's hop is not normally perceived; it is
  recalled, rarely, in a powerful player's hard roll. The striker's ball has definitely been seen to lift.
- **Table 6's rolls** (`hop`, striker's peak added; the trace ends at 51 ms, so the faster rolls' peaks are still
  rising there):

  | | C3H | C10H | C1F | C3F | C10F | C25F | C3P | C10P | C25P |
  |---|---|---|---|---|---|---|---|---|---|
  | croqueted peak mm | 2.8 | 11.8 | 0.5 | 3.0 | 7.8 | 13.7 | 3.7 | 7.3 | 15.3 |
  | striker's peak mm | 2.6 | ≥20 | 1.9 | ≥13 | ≥28 | ≥44 | ≥12 | ≥25 | ≥50 |
  | striker's dip mm | 1.3 | 1.9 | 1.0 | 1.4 | 1.9 | 2.6 | 1.5 | 1.9 | 2.9 |

- **Gugan 4, Fig. 6** (C1F, U 1.2 m/s; `fig6.jpg` SHA-256 `0c44e97c4d6129fbd07e28c66d552feed332c407cd302e5ddce8ab5be41b6353`,
  read by eye at about 42 px a mm): ball 1 dips about 2.4 mm by 5 ms and rises to about +2.7 mm by 40–50 ms. The
  model's C1F: dip 1.0 mm, peak 1.9 mm. His only measured two-ball rise; no figure for the faster rolls.
- **Reading.** The croqueted ball's lift fits the observation: under 5 mm at medium strength, 14–15 mm at C25, the
  hard rolls where it is rarely seen. G4 is the striker's ball, which the user sees lift and Gugan measures at C1F
  within a millimetre of the model; above C1F it rises steeply (≥13 mm at C3F, ≥44 mm at C25F) with no source to
  judge it. The 0–5 mm band, unsourced, does not apply to the striker's ball as it stands.
- **Reading.** (a) is not refuted, but it is unsourced in magnitude, and the backspin direction is the one source
  that bears on it. (b) and (c) are untested.

## G5. Smaller misses, recorded

- Face contact time A1D 1.42 ms (1.00 ± 0.1); turf depth A2R 5.3 mm (4.0 ± 0.5, held out); CA A4D strike share 1.20
  and lawn share 0.54. Unreachable in the map; not probed further in this phase.
- User yardage at intensity 0.3: 23 yd against 15 (0.4 passes; the drive's 35 yd sits on its band's floor).
- Table 5 stop shots' Ω₁ has the wrong sign (C3S +6, C20S +19 against −14, −12); C20S's w₁/W 1.12 (1.61, z −7.2).
  - **Probe** (`stops`, 2026-11-17, reference values). Both misses are the touching strokes' (row 2's gap 0): C10S,
    at 0.5 mm, has the right sign (−25). Swept over the gap, all three stops move together:

    | Stroke | Figure | 0 | 0.1 mm | 0.25 mm | 0.5 mm | 1 mm | Gugan |
    |---|---|---|---|---|---|---|---|
    | C3S | w₁/W | 1.97 | 1.62 | 1.48 | 1.74 | 1.78 | 1.73 |
    | C3S | Ω₁ % | +6 | −2 | −17 | −28 | −28 | −14 |
    | C10S | w₁/W | 1.42 | 1.31 | 1.34 | 1.61 | 1.76 | 1.79 |
    | C10S | Ω₁ % | +12 | +5 | −10 | −25 | −28 | −12 |
    | C20S | w₁/W | 1.12 | 1.15 | 1.29 | 1.52 | 1.74 | 1.61 |
    | C20S | Ω₁ % | +19 | +8 | −8 | −22 | −28 | −12 |

    At gap 0 the strike's momentum is right (C20S w₁ + v₂ 1.59U, Gugan 1.59U) but split wrongly: the croqueted ball
    takes too much (v₂/U 1.23 against 1.09). From 0.5 mm the split and the sign match.
  - **Reading.** This is P2b.2b.2c.2c's carried gap (contact laws design, gate B, 2026-10-22). At gap 0 the face's and
    the ball–ball contact's matched time scales give a three-body push, and Donahue et al. (2008) find a touching
    doublet qualitatively unlike a separated one. The game plays every croquet stroke at DEFAULT_CROQUET_GAP, 0.75 mm,
    a stand-in fitted to these stops (gate D). The card alone plays them at the film's 0. Gugan's note (i) names the
    balls' surface milling, so the film's "touching" balls meet on the milling's ridges.
  - **The card across the touching stops' gap** (the rest of the card as `2026-11-17-gugan5-check`): objective 11.19
    at 0, 10.52 at 0.1 mm, 9.80 at 0.25, 8.86 at 0.5, **8.83 at 0.75**, 8.92 at 1 mm.
  - **Ruling** (2026-11-17): the card plays C3S and C20S at the game's 0.75 mm as fit targets, and keeps their gap-0
    figures as checks (`t5.<name>.touching.*`). Card `2026-11-17-touching-gap`: objective 11.19 → **8.83**; table 5
    3.80 → 1.43; every touching-stop target within 1.5 z, Ω₁ with Gugan's sign. Partly circular: 0.75 mm was fitted to
    these two stops (gate D). The three-body push at gap 0 stays carried.

## G6. The rolls' striker's ball slow (w₁/U)

The second refit's ruling (2026-11-17): the full and pass rolls' w₁/U undershoot is a gap of its own. Card
`2026-11-18-lift-split`, reference values: w₁/U z C1F −4.9, C3F −4.9, C10F −4.3, C25F −3.2, C3P −3.7, C10P −1.8,
C25P −5.0; the half rolls pass (C10H 0.2) or overshoot (C3H 3.6).

- **Not the read** (`gapProbe.ts w1-trace`). w₁ is settled by the read and holds to 20 ms and 30 mm after it in every
  roll (C3F 0.470 at the read, 0.455 from 2 ms on). Unlike G1, no comparison gap.
- **The lawn agrees.** The model's L1 is short in every full and pass roll (z −0.2 to −2.0), by about the square of
  the speed's shortfall (C3F 0.73 against (0.470/0.594)² = 0.63; C25P 0.69 against 0.62).
- **The budget** (`budget`, impulse along aim as a share of m·U, strike to the card's read; the parts sum to ball 1's
  Δp in every roll). Ball 1 takes 1.56–1.67 from the face, gives 0.94 to the croqueted ball in every roll, and loses
  0.15–0.28 to the turf after the face first leaves it, spinning up to roll. The hands add 0.10–0.27 to the head. The
  head's effective mass, (face − hands)·m/(1 − W), is 1.08–1.12 kg in every roll: the head (1.0 kg) and a little of
  the shaft.
- **The frictions do not close it** (`w1-trace --set`, w₁/U at C1F, C3F, C10F, C25F, C3P, C10P, C25P):

  | Set | C1F | C3F | C10F | C25F | C3P | C10P | C25P |
  |---|---|---|---|---|---|---|---|
  | reference | 0.528 | 0.470 | 0.465 | 0.433 | 0.488 | 0.480 | 0.438 |
  | ballBallFriction 0.06 | 0.498 | 0.502 | 0.495 | 0.455 | 0.502 | 0.484 | 0.778 |
  | faceFriction 0.6 | 0.473 | 0.486 | 0.447 | 0.398 | 0.474 | 0.438 | 0.377 |
  | ballTurfSliding 1.0 | 0.533 | 0.480 | 0.452 | 0.422 | 0.480 | 0.462 | 0.423 |
  | Gugan | 0.667 | 0.594 | 0.569 | 0.501 | 0.580 | 0.520 | 0.557 |

  Low ball–ball friction gains 0.02–0.03 but leaves ball 1 sliding at the read (Ω₁ 54–89% against Gugan's 87–100) and
  breaks C25P (0.778); Gugan's μs ≈ 1.0 (G4's lead) moves w₁ by ±0.01. The lead does not apply here.
- **Gugan's mallet** (Gugan 4 §10, the two-ball rolls; https://oxfordcroquet.org/tech/gugan4/, read 2026-11-18, page
  SHA-256 `862e21c87e857206eff63a9956407386e8167178c3e0275d619e2d02ae450b32`): Table 6 gives no mallet speed after
  impact "because they are essentially the same as for ball 1". His heads keep W ≈ w₁: 0.67 U at C1F falling to
  0.50 at C25F. The model's keep 0.39–0.42 U in every roll.
- **Reading.** The head gives up too much of its speed. For the head to end at Gugan's w₁ while the balls take
  Gugan's momentum, with the model's 1.1 kg, the hands must add more impulse through the impact (my estimate, from
  the budget; Gugan's W is a qualitative statement, not a measurement):

  | | C1F | C3F | C10F | C25F | C3P | C10P | C25P |
  |---|---|---|---|---|---|---|---|
  | model's hands, N·s | 0.08 | 0.17 | 0.50 | 0.65 | 0.28 | 0.60 | 0.95 |
  | extra wanted, N·s | 0.39 | 0.70 | 1.31 | 0.89 | 0.56 | 0.69 | 1.55 |
  | wanted ÷ model's | 5.9 | 5.1 | 3.6 | 2.4 | 3.0 | 2.1 | 2.6 |

  The slowest rolls want the most, relative to the model, which is the gap's shape. A push that carries the mallet
  through the ball (Gugan 4 cites CH's "push" limit, the mallet keeping its speed) is what the numbers describe. Both
  refits bought it with the grip: an 11–22 ms coupling period holds the head to the plan's path, so the hands add
  impulse. The grip's 0.08 s is the user's ruling.

### G6's push (`gapProbe.ts push`, 2026-11-18, reference values)

The hands' impulse along aim (N·s), strike to the card's read, split by source:

| | C1F | C3F | C10F | C25F | C3P | C10P | C25P |
|---|---|---|---|---|---|---|---|
| push intent | 0.002 | 0.004 | 0.008 | 0.012 | 0.005 | 0.007 | 0.013 |
| intent's peak, N | 4.9 | 10.8 | 20.6 | 32.7 | 12.3 | 19.7 | 36.1 |
| coupling (grip's spring) | 0.08 | 0.17 | 0.49 | 0.64 | 0.28 | 0.59 | 0.93 |
| extra wanted (G6) | 0.39 | 0.70 | 1.31 | 0.89 | 0.56 | 0.69 | 1.55 |
| extra ÷ read time, N | 36 | 97 | 115 | 99 | 55 | 71 | 191 |

- **The push does not act in the impact.** The intent is the sensed resistance, lagged by τ_push 0.125 s (the
  muscles' pace, gate ruling 2026-10-11), up to F_push 92.2 N, and it ends at the face's departure (the user,
  2026-11-15). The departure comes 0.6–0.8 ms after the strike, about 0.5% of τ_push, so the intent reaches 5–36 N and
  delivers 1–2% of the hands' impulse. The rest of the feed-forward adds nothing along aim. What the hands give is
  the coupling, the 0.08 s grip's spring towards the plan's path.
- **The size fits a push already on.** The extra impulse G6 wants, spread over the strike to the read, is a steady
  36–115 N in six of the seven rolls (C25P 191 N): about F_push (92.2 N, bounds 48–106 N), the arm's largest forward
  push. A steady force gives a fixed impulse, which is a larger share of m·U in a slow roll: the gap's shape.
- **Reading.** The model's push is reactive: it builds from the balls' resistance after the strike, so it cannot act
  inside a 10 ms impact. A pushed roll's hands are already driving the mallet through the ball when it arrives. A
  push primed before the contact, pressing along aim at about F_push through the face's contacts, would supply the
  wanted impulse with the grip left at 0.08 s. This would change two of the user's rulings, the push's sensed build
  (2026-10-11) and its end at the departure (2026-11-15), for the rolls.

### G6's primed push, tried (2026-11-18, throwaway edit to `pushIntent`, reverted)

The user's ruling (2026-11-18): design a push already on at contact. Before the design, two laws were tried in place
of the reactive intent, P = F_push·aim (92.2 N) from contact, on every stroke with a push (`w1-trace`, w₁/U):

| Law | C3H | C10H | C1F | C3F | C10F | C25F | C3P | C10P | C25P |
|---|---|---|---|---|---|---|---|---|---|
| reference (reactive) | 0.438 | 0.404 | 0.528 | 0.470 | 0.465 | 0.433 | 0.488 | 0.480 | 0.438 |
| primed, to the restart | 0.469 | 0.417 | 0.614 | 0.497 | 0.489 | 0.444 | 0.515 | 0.498 | 0.451 |
| primed, to the pendulum phase | 0.511 | 0.419 | 0.833 | 0.600 | 0.529 | 0.469 | 0.603 | 0.545 | 0.471 |
| Gugan | 0.380 | 0.400 | 0.667 | 0.594 | 0.569 | 0.501 | 0.580 | 0.520 | 0.557 |

- **To the restart** (1.2–2.5 ms): too short, +0.01 to +0.09.
- **To the pendulum phase**: C3F, C3P and C10P land within 0.03 of Gugan. C1F overshoots (0.83), with the head
  outrunning the ball (W 0.92 U against w₁ 0.83); the C25 rolls stay short; Ω₁ falls to 61–68% in the slow rolls
  (Gugan 93–100); the half rolls move too (C3H 0.44 → 0.51, away from Gugan).
- **Reading.** A steady push of about F_push has the right size where the push lasts about the impact. Where it
  outlasts the ball (C1F), the head chases past it, which Gugan's W ≈ w₁ and "no clear evidence of acceleration"
  rule out. The law wants a bound tied to the ball, not to the plan's phases.

### G6's primed push, the discriminating run (2026-11-18, throwaway edit, reverted)

The primed push design (`docs/superpowers/specs/2026-11-18-primed-push-design.md`, §2.3), candidates (a) carry and
(b) force–velocity, v₀ 2.03 m/s (Zhang et al., J. Hum. Kinet. 2025, DOI 10.5114/jhk/190224, single-arm ballistic
bench press throw, Table 1). w₁/U at the read, with Ω₁:

| Law | C3H | C10H | C1F | C3F | C10F | C25F | C3P | C10P | C25P |
|---|---|---|---|---|---|---|---|---|---|
| reference | 0.438 | 0.404 | 0.528 (79%) | 0.470 | 0.465 | 0.433 | 0.488 | 0.480 | 0.438 |
| (a) carry | 0.438 | 0.404 | 0.659 (62%) | 0.477 | 0.465 | 0.433 | 0.491 | 0.480 | 0.438 |
| (b) force–velocity | 0.440 | 0.404 | 0.545 (78%) | 0.474 | 0.467 | 0.434 | 0.491 | 0.480 | 0.438 |
| Gugan | 0.380 | 0.400 | 0.667 | 0.594 | 0.569 | 0.501 | 0.580 | 0.520 | 0.557 |

The press's impulse along aim (N·s), strike to departure + departure to read:

| Law | C1F | C3F | C10F | C25F | C3P | C10P | C25P |
|---|---|---|---|---|---|---|---|
| (a) | 0.073 + 0.036 | 0.062 + 0.013 | 0.058 + 0.004 | 0.056 + 0.000 | 0.060 + 0.011 | 0.058 + 0.004 | 0.055 + 0.000 |
| (b) | 0.038 + 0.729 | 0.001 + 0.126 | 0 | 0 | 0 + 0.059 | 0 | 0 |

- **Neither qualifies** (§2.3 "closer"): (a) leaves C10F, C25F, C10P and C25P unmoved and drops C1F's Ω₁ to 62%; (b)
  leaves C10P and C25P unmoved. The half rolls hold under both.
- **(a) ends the carry itself.** After the departure the croqueted ball holds the striker's back, so the head reaches
  w₁ within 0.1–0.4 ms; the latch fires at the very re-catch where the head carries the ball (Gugan's second contact).
  The press acts only through the first contact (0.06–0.07 N·s). W ≥ w₁ marks carrying as much as chasing.
- **(b) reads the wrong speed.** v is the hands' speed in the world, 1–6 m/s here, at or above v₀ from C3F up, so the
  press is nil. A bench press throw's v₀ is the arm's extension speed from rest; in a roll most of the hands' speed is
  the swing's, not the push's. The source does not match the movement.
- **Stop** (spec §2.4): a ruling is needed.

### G6's primed push, on the ball (2026-11-18, design amendment 1, throwaway edit, reverted)

The user's ruling "Press while on the ball": P = F_push·aim while the striker's face–ball pair is closed at the step's
start. w₁/U at the read (Ω₁), and the press's impulse along aim, strike to departure + departure to read (N·s):

| | C3H | C10H | C1F | C3F | C10F | C25F | C3P | C10P | C25P |
|---|---|---|---|---|---|---|---|---|---|
| reference | 0.438 (96%) | 0.404 (106%) | 0.528 (79%) | 0.470 (93%) | 0.465 (100%) | 0.433 (100%) | 0.488 (87%) | 0.480 (96%) | 0.438 (100%) |
| (d) on the ball | 0.442 (96%) | 0.405 (106%) | 0.546 (76%) | 0.496 (87%) | 0.486 (94%) | 0.444 (97%) | 0.502 (86%) | 0.493 (94%) | 0.455 (93%) |
| Gugan | 0.380 | 0.400 | 0.667 | 0.594 | 0.569 | 0.501 | 0.580 | 0.520 | 0.557 |
| press, N·s | | | 0.07 + 0.22 | 0.06 + 0.34 | 0.06 + 0.47 | 0.06 + 0.47 | 0.06 + 0.32 | 0.06 + 0.51 | 0.06 + 0.65 |

Canonical ratios (`canonicalSetup`, open lawn): half roll 1.782 → 1.757, full 1.335 → 1.306, pass 1.285 → 1.243.

- **Closer:** all seven full and pass rolls, none past Gugan; each closes 13–21% of its gap.
- **No chase:** W < w₁ at the read in every roll. **The half rolls hold:** C3H +0.004, C10H +0.001, ratio −0.025.
- **The ball rolls: fails by the letter.** Ω₁ falls 6, 6 and 7 points in C3F, C10F and C25P against §2.3's 5, though
  every value stays within Gugan's 87–100.
- **The size.** The press gives 0.29–0.71 N·s against the 0.39–1.55 wanted, the face on the ball for 2.4–7.1 ms after
  the departure (impulse ÷ F_push), a third to a half of the time to the read. Pressing in the gaps is what chases.

### G6's primed push, for good (`2026-11-20-primed-push`, against `2026-11-18-lift-split`)

The user's ruling "Yes, implement it" (2026-11-18): law (d) in the engine (43c3d9e, ENGINE_VERSION 0.37.0), the sensed
resistance and its lag retired, fourteen free parameters, reference values, no refit. Objective 7.16 → 7.97;
pass 118 → 120, near 32 → 31, miss 39 → 38. Σz² by family (all rows; fit rows where they differ):

| Family | lift-split | primed-push |
|---|---|---|
| table6 | 239.10 (fit 113.41) | 200.75 (fit 87.67) |
| lawn | 84.30 | 80.88 |
| coaching | 10.16 | 7.28 |
| look | 3.64 | 4.01 |
| playability | 0.00 | 25.00 (fit) |
| strike, gugan5, table5, turf, ca, user | unchanged | unchanged |
| total | 569.87 (fit 188.77) | 550.58 (fit 188.03) |

The rolls' w₁/U rows, z on each card:

| | C3H | C10H | C1F | C3F | C10F | C25F | C3P | C10P | C25P |
|---|---|---|---|---|---|---|---|---|---|
| lift-split | 3.57 | 0.23 | −4.89 | −4.93 | −4.28 | −3.16 | −3.73 | −1.83 | −5.04 |
| primed-push | 3.82 | 0.30 | −4.25 | −3.90 | −3.42 | −2.66 | −3.18 | −1.22 | −4.31 |

- **G6 closes in part.** Every full and pass roll's w₁/U moves towards Gugan by 0.5–1.0 z; none passes. C10P is near.
  v₂/U, Ω₂ and the lawn's L₂ do not move; L₁ moves with w₁ (C3F −1.36 → 0.23).
- **Coaching:** the full roll's ratio 1.34 → 1.31 (z 1.13 → 0.88, now a pass); the pass roll's 1.29 → 1.24 (z 2.98 →
  2.55, still a miss).
- **New miss, C3F's play:** at its U (2.71 m/s, p 0.799) C3F now plays unpractised (impact-off-face), scored 5 (25 in
  Σz²), which outweighs Table 6's gain and lifts the objective. The throwaway run read the figures but not the play's
  class. The figures above are still read from the setup played.
- **Look:** the lift rows stay inside their 0–5 bands (half 4.81, full 4.10, pass 4.06); the C1F striker's rise moves
  −1.62 → −1.74 z (near).
- **Next:** the refit on this card, with C3F's off-face play the first thing it must clear; the rest of G6 (0.39–1.55
  N·s wanted against 0.29–0.71 given) stays open for the refit to show how much the fitted parameters recover.

### C3F's off-face play, traced (2026-11-20, scratch probe on `playJudged`, reference values)

C3F at Gugan's U (p 0.799), the practised run, against the baseline engine (8d9cc46, before law (d)):

| | baseline | primed push |
|---|---|---|
| face–striker intervals, ms | 0.01–0.68, 1.34–2.34, 5.11–6.24 | the same three, then 9.88–11.34 |
| head / striker's ball at 12 ms, m/s | 1.11 / 1.23 | 1.22 / 1.34 |
| impact ends | 96.6 ms | at the cap, 450 ms |
| later contacts | none seen | the head's edge, 406.9–407.9, 414.4–415.5, 424.9–426.3 ms |
| practice | 1 pass, in band | 3 passes, `impact-off-face` each |

- **What the press changes.** It leaves the head 0.1 m/s faster and within a few mm of the ball, so `stillReaching`
  keeps the impact open (the only end test that differs: both runs are quiet from their last contact and the
  turf has settled). The re-anchored path then drives the head from 1.07 m/s at 100 ms to 1.46 m/s at 300 ms,
  faster than the ball's 1.25–1.29. The head rises 35 mm and comes down again, so its lower edge lands on top of the
  ball at 407 ms.
- **The baseline hides the same catch.** Its follow-through head (1.02 → 1.50 m/s by 275 ms) overtakes the ball as
  it rolls on from the handover. The ball's path here is estimated at a constant 0.29 m/s² deceleration, the primed
  run's figure. Their centres along aim close to 0.157 m, the face–ball contact distance, at about 290 ms and to
  0.115 m by 440 ms. The head is then 31 mm above its height at the strike, so the face's lower edge is 2 mm above
  the ball's centre. The follow-through has no head–ball contact, so the second hit goes unseen, and the
  baseline's C3F scored clean only because its impact had ended at 96.6 ms.
- **So the fault is older than law (d).** In slow full rolls the follow-through's path outruns the striker's ball.
  Law (d) only makes the impact last long enough to see it. A refit cannot fix that honestly. The cheapest way to
  clear the row is any parameter that ends the impact sooner, which would hide the second hit again.
- **Open:** which other rolls the follow-through overtakes unseen (C1F, and the canonical full and pass rolls at
  low power, are the likely ones), and whether the follow-through or the end test should change. That is a ruling
  for the user.

### G6's late hits, seen (`2026-11-20-catch-seen`, against `2026-11-20-primed-push`)

Soft follow-through design §2.1, engine 0.38.0: the follow-through's catch carries the balls on by phase 2 (handover,
`simulateFreeMotion`, no boundary halt) instead of a straight line, and a catch past the default cap moves it once.
Late-hit survey, rows with any late hit (`docs/superpowers/probes/late-hit/2026-11-20-catch-seen.txt`):

| rows | primed push | catch seen |
|---|---|---|
| Table 6 (9) | C3F | C1F, C3F, C3P |
| half roll (8) | 0 | 0 |
| full roll (8) | p 0.8 | p 0.2, 0.4, 0.5, 0.6, 0.8, 1.0, canonical (0.885) |
| pass roll (8) | 0 | p 0.6, 0.8, 1.0, canonical (0.900) |

- **The fault is not only in soft strokes.** The canonical full roll's edge lands on the striker's ball at 378.7 ms,
  the canonical pass roll's face at 434.1 ms; both are 29.1.6.1 effects past `EFFECT_SPEED` (+29.5 %, +18.1 %), and
  both plays end unpractised (`impact-off-face`), their ratios 1.025 and 1.048 (were 1.306 and 1.243). Full roll
  p 0.3 and pass roll p 0.3 stay unlawful (`impact-cap`): the impact is still open at the moved cap.
- **Card:** objective 14.64 (was 7.97). Four rows newly miss, each z 5: `play.t6.C1F`, `play.t6.C3P`,
  `play.canon.full-roll`, `play.canon.pass-roll`. `lawn.t6.C3P.L1` 1.16 (was −0.26). Every other family unchanged.
- **Cost:** a full roll held open to ~0.4 s integrates about 3× longer (1.26 s, was 0.45 s); the suite takes 1010 s,
  and the local test default goes to CI's 60 s.
- **Consequence for the plan.** §2.2 scales the reach only below the canonical `contactSpeed`, and §2.3 only finishes
  slower than 4 m/s, so neither can clear the canonical full and pass rolls' late hits. The spec's expected outcome
  ("no canonical stroke late-hits", canonical pins held to the bit) no longer follows from Tasks 3–4. A ruling for
  the user before Task 3.
- **Ruled (2026-11-20):** the late hit stays a fault (Law 29.2.5). The user briefly accepted it provisionally, then
  withdrew that (reverted in dc05e42) in favour of the muted follow-through: "for softer shots, less slower
  follow-through. If you're not hitting the ball hard, you don't need to follow through or push through." The plan
  runs as written, Tasks 3–6. The canonical rolls' late hits are expected to survive Tasks 3–4, which would trigger
  the stop rule there.

### G6's soft follow-through: the reach (`2026-11-20-reach-scaled`, against `2026-11-20-catch-seen`)

Soft follow-through design §2.2, engine 0.39.0: below `REACH_REF_SPEED` (2.999, 3 and 3 m/s for the half, full and
pass rolls, their canonical `contactSpeed` rounded down), the hands' reach is the reach given ·
contactSpeed/REACH_REF_SPEED. As amended in this task, a shot's own `stroke.handReach` is scaled too: the text book
gives every stroke its preset's reach explicitly. Late-hit survey
(`docs/superpowers/probes/late-hit/2026-11-20-reach-scaled.txt`), rows with any late hit:

| rows | catch seen | reach scaled |
|---|---|---|
| Table 6 (9) | C1F, C3F, C3P | C1F, C3F, C3P |
| half roll | 0 | 0 |
| full roll | p 0.2, 0.4–1.0, canonical | p 0.2–1.0, canonical |
| pass roll | p 0.6–1.0, canonical | p 0.2, 0.3, 0.5–1.0, canonical |

- **The shorter reach alone makes the soft rolls worse.** The push ends sooner, and the finish still stretches up to
  5× for a slow pace (flat push amendment 3). The head then follows the ball and hits it again and again: at full
  roll p 0.3–0.8, 4 to 17 face contacts from 380 to 830 ms after the strike, each +18–23 % pace at 0.0°, which is
  29.1.6.1. C1F and C3F move from mishits (`impact-off-face`) to 29.1.6.1. Pass roll p 0.5, clean before, now
  late-hits off the face (ratio 1.19 → 1.04 in `playPin`).
- **Every Table 6 roll above p 1** (C10F, C25F, C10P, C25P) is clean, as are the half rolls: the harder strokes do
  not late-hit.
- **Card:** objective 14.65 (was 14.64). Every w₁/U is unchanged, and the same five plays miss. `lawn.t6.C1F` and
  `lawn.t6.C3F` move by under 0.1 z.
- **Stop rules:** no canonical pin moved, and no Table 6 w₁/U moved. Task 4 (§2.3, the finish no longer stretching)
  is next. Its test is whether a short push with a short finish stops the head behind the ball.
- **Moves re-pinned:** `playPin.json` (the half, full and pass rolls at p 0.5); the full roll's tap now ends its
  push (`followCap` false); and `followThrough.test`'s push-whose-end-is-never-found, which no preset can now give.

### G6's soft follow-through: the finish (`2026-11-20-finish-shrunk`, against `2026-11-20-reach-scaled`)

Soft follow-through design §2.3, engine 0.40.0: `finishShare(V)` = max(FINISH_SHARE_MIN 0.25, min(1,
V/FINISH_REF_PACE 4)) for V > 0, else 1. A slower finish carries for less time; flat push amendment 3's stretch and
`FINISH_SHARE_MAX` are retired. Late-hit survey (`docs/superpowers/probes/late-hit/2026-11-20-finish-shrunk.txt`),
rows with any late hit:

| rows | reach scaled | finish shrunk |
|---|---|---|
| Table 6 (9) | C1F, C3F, C3P | C3F, C3P |
| half roll | 0 | 0 |
| full roll | p 0.2–1.0, canonical | p 0.8, 1.0, canonical |
| pass roll | p 0.2, 0.3, 0.5–1.0, canonical | p 0.8, 1.0, canonical |

- **The soft rolls are clean.** Every half roll, the full and pass rolls at p 0.2–0.6, and C1F (ratio 1.223).
- **A band at p 0.8–1.0 still late-hits:** the full and pass rolls at p 0.8, 1.0 and canonical, C3F (p 0.80) and
  C3P (p 0.92). Each makes two face contacts some 300–350 ms after the parting, +17–33 % pace at 0.0°: 29.1.6.1.
  The rolls above p 1.1 (C10F, C25F, C10P, C25P) stay clean. The head no longer meets the ball on its edge, so no
  surveyed row now raises `impact-off-face`.
- **Card:** objective 12.98 (was 14.65). Every w₁/U is unchanged. `play.t6.C1F` now passes; `coach.full-roll` 1.00,
  `coach.pass-roll` 1.04.
- **Stop rules:** the first tripped. The canonical full roll moves from `impact-off-face` (three passes, ratio 1.025)
  to 29.1.6.1 (one pass, 1.001), and the pass roll from ratio 1.048 to 1.042, also 29.1.6.1. **Ruled (2026-11-20):**
  the user's "Accept the move"; one FINISH_REF_PACE of 4 m/s is kept. No Table 6 w₁/U moved.
- **Moves re-pinned:** `playPin.json`; the canonical full and pass rolls and the full roll's found-hold sample at p 1
  (all 29.1.6.1, one pass); the full roll held at 0.2 (29.1.6.1, was off the face); the least hold that doesn't slip
  (σ 0, was 0.16875; ratio 1.047); the tap at p 0.1 (admissible at firmness 0, ratio 1.175, was `impact-cap`); the
  band's full roll (null, was off the face); the flat push follow-through's full roll (impact ends 325.8 ms, nothing
  off the face); the dipped arc's follow-through flags (no `follow-grip-limit`); `track.test`'s ease and quarter turn.
- **Next:** Task 5. The late hits left are not the soft shots §2.4's brake was written for, so its shape goes to the
  user.

### G6's soft follow-through: no faster than the ball (`2026-11-20-finish-retimed`, against `2026-11-20-finish-shrunk`)

**Ruled (2026-11-20).** In place of §2.4's brake, the user ruled that the follow-through never carries the head faster
than the ball, by re-timing the finish (spec §2.4, "Ruled in the run"). The cause, from the canonical full roll: the
path restarts at the first parting at the head's pace, 1.74 m/s, but the strike leaves the ball at 1.48 m/s, and it
settles to 1.39. The finish's carry then holds the head at 1.52–1.58 m/s, and it catches the ball at about 325 ms.

Engine 0.41.0: at the finish's start, or at the impact's end if that comes first, the re-anchored plan's clock eases
down to k = c/w over the finish's ease. Here c is the largest pace at which phase 2's projected ball is still at least
as fast when the head comes to rest, and w is the plan's fastest head pace over the finish. Where the ball leaves well
ahead, k = 1 and nothing changes.

- **Survey** (`docs/superpowers/probes/late-hit/2026-11-20-finish-retimed.txt`): **no late hits.** Every Table 6 roll
  and every half, full and pass roll row is clean (was C3F, C3P and the full and pass rolls at p 0.8, 1.0 and
  canonical). C3F's ratio is 1.310 (was 1.053) and C3P's 1.264 (was 1.001).
- **Card:** objective **6.30** (was 12.98). Every `play.*` row is clean, `play.t6.C3F`, `play.t6.C3P`,
  `play.canon.full-roll` and `play.canon.pass-roll` among them. Every w₁/U is unchanged. Worse:
  - `lawn.t6.C3F.L1`, z −1.21 (was −0.02);
  - `coach.pass-roll`, ratio 1.24 against ≤ 0.99. The canonical rolls are back at their primed-push results (full
    1.306, pass 1.2426, lawful in one pass), so G2's ratio gap is open again for the refit.
- **Stop rules:** no Table 6 w₁/U moved, and no stroke late-hits. The canonical moves restore the pins as they stood
  before §2.1.
- **Moves re-pinned:** `playPin.json`; the canonical full and pass rolls and the full roll's sample at p 1 (lawful,
  firmness 0, ratio 1.447), all as before §2.1. The held-firm full roll at power 1, hold 0.2, plays clean, so the
  off-face case is an `it.fails` again with no known case. The flat push follow-through's full roll ends its impact at
  90.5 ms and now passes the same clear-of-the-balls check as the half roll.
- **Next:** the refit on this card (`2026-11-20-finish-retimed`, objective 6.30). G6's late hits are closed. The first
  thing the refit must clear is G2's ratio gap (full roll 1.306, pass roll 1.24).

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

## The refit (2026-11-17, on G2's restart and G1's window read)

The same Nelder–Mead, parameters, bounds and stop, from the reference values on `2026-11-17-window` (18.80). It
converged after 61 cards: objective **16.64**. Records `2026-11-17-refit.jsonl`, `2026-11-17-refit-best`.

| Parameter | Reference | Fitted | Note |
|---|---|---|---|
| faceFriction | 0.38 | 0.470 | 68% of [0.2, 0.6] |
| ballBallFriction | 0.16 | 0.138 | |
| tangentialStiffnessRatio | 2/7 | 0.294 | at its lower bound, the reference |
| handCouplingPeriod | 0.080 | **0.011** | **1% of [0.01, 0.2]: at its lower bound** |
| handCouplingDampingRatio | 0.70 | 0.83 | |
| armMass | 0.80 | 0.97 | |
| ballTurfSliding | 0.48 | 0.548 | |

- **By family** (Σz²/count): table 6 3.78 → 2.79; Gugan 5 7.61 → 6.52 (stop 5.35 → 5.61); table 5 3.80 → 3.73;
  strike, playability (C25P still not clean) and turf unchanged.
- **Where the gain is.** The slow full and pass rolls' striker's ball: w₁/U z C3F −4.9 → −2.3, C3P −3.7 → −2.1, C1F
  (held out) −4.9 → −3.3. Ω₂ moves about 0.5 z towards Gugan in every roll (lower ballBallFriction).
- **Worse.** Fit: C10H w₁/U 0.2 → 1.3, C3F Ω₁ 0.0 → −1.9, C3P Ω₁ −1.0 → −1.8, C25F w₁/U −3.2 → −3.5. Held out: C3H
  w₁/U 3.6 → 4.4, C25P w₁/U −5.0 → −5.9, C1F Ω₁ −2.1 → −3.2.
- **Checks.** Coaching ratios improve: full roll 1.34 → 1.27 (band 1.00–1.20), pass roll 1.29 → 1.25 (under 0.99).
  Lift: full roll 14.7 → 12.3 mm, pass roll 11.7 → 10.3, half roll 4.8 → 6.2 (band 0–5).
- **Reading.** The fit's main move is the grip: an 11 ms coupling period, at the bound's floor, holds the hands to
  the plan's path so the hands carry the striker's ball in the slow rolls. The period is the user's decision
  (2026-10-05, 0.08 s), provisional, and the two-hand model no longer constrains it (contact.json's note); the
  sources give no value. A bound-pinned fit says the card wants a mechanism the period stands in for, as the first fit's cliff did.
- **Recommendation.** Keep the reference values. The period is the user's ruling: adopt 0.011 s, or keep 0.08 s and
  treat the slow rolls' undershoot (w₁/U) as a gap of its own.
- **Rulings** (2026-11-17), in order:
  1. The grip period stays 0.08 s; the reference values are kept.
  2. G3: Gugan 5 becomes a check on its own balls (above).
  3. Table 5's stop shots (C20S w₁/W, the stops' Ω₁ sign): probe, then design.
  4. Then the C25P grip-limit cap's design, then a refit, which judges the grip period again.

## The second refit (2026-11-17, on G3, the touching stops at 0.75 mm and G2's grip ruling)

The same Nelder–Mead, parameters, bounds and stop, from the reference values on the 7.16 card. It converged after
111 cards: objective **5.22**. Records `2026-11-17-refit2.jsonl`, `2026-11-17-refit2-best`.

| Parameter | Reference | Fitted | Note |
|---|---|---|---|
| faceFriction | 0.38 | 0.224 | 6% of [0.2, 0.6] |
| ballBallFriction | 0.16 | 0.096 | 8% of [0.06, 0.5] |
| tangentialStiffnessRatio | 2/7 | 0.365 | |
| handCouplingPeriod | 0.080 | **0.0217** | 6% of [0.01, 0.2]: low, no longer at the floor |
| handCouplingDampingRatio | 0.70 | 0.986 | 98%: at its upper bound |
| armMass | 0.80 | 1.09 | |
| ballTurfSliding | 0.48 | 0.528 | |

- **Where the gain is.** As in the first refit, the slow full and pass rolls' striker's ball: w₁/U z C3F −4.9 → −2.3,
  C3P −3.7 → −0.8, C10F −4.3 → −2.3, C25F −3.2 → −1.4; held out C1F −4.9 → −2.9, C25P −5.0 → −3.6. The rolls' Ω₂
  move towards Gugan (C3F −2.7 → −1.6, C3P −2.8 → −1.7, C3H −3.1 → −1.9); table 6's lawn distances all within 2 z.
- **Worse.** Fit: C3P v₂/U 3.1 → 4.2, C3F v₂/U −0.1 → 1.0, C10H Ω₂ 0.0 → 1.4, table 5's C10S w₁/W −2.5 → −2.7.
  Held out: C1F v₂/U 3.3 → 5.0, C3H Ω₁ 0.4 → 1.8. Checks: Gugan 5's stop −2.5 → −4.2.
- **Look.** Lift (band 0–5 mm): half roll **17.3 mm**, z 0 → 6.1 (was in the band); full roll **21.9 mm**, z 4.8 →
  8.5; pass roll 12.7 mm, z 3.3 → 3.9. Coaching: full roll 1.31 (band 1.00–1.20) and pass roll 1.18 (under 0.99)
  improve; the stop's ratio 3.89 leaves its band (4.1–6.2).
- **Reading.** The grip again carries the gain: a 22 ms period, critically damped, holds the hands to the plan's path
  through the slow rolls. Three of the seven parameters sit at or near a bound (face and ball-ball friction low,
  damping at 1), and the half roll's lift leaves its band by a factor of three: the card is bought with a look the
  user validates by. The period is the user's ruling (1 above).
- **Recommendation.** Keep the reference values; treat the slow rolls' undershoot (w₁/U) as a gap of its own, and
  read the lift (G4) before any further fit, since the fit trades against it.
- **Ruling** (2026-11-17): keep the reference values; the grip period stays 0.08 s. The slow rolls' undershoot
  (w₁/U) is a gap of its own, and G4 (lift) is read first.

### G4 ruling and card (2026-11-18)

- **Ruling** (the user): split the lift check by ball. The croqueted ball keeps 0–5 mm at the canonical strength,
  on the user's observation; the striker's ball is judged on Gugan 4's Fig. 6 (C1F's dip 2.4 and rise 2.7 mm, ± 0.5
  mm, a by-eye reading), and its height in a medium roll waits on the user's observation.
- **Applied.** `look.lift.<roll>` is now the croqueted ball's; `look.c1f.striker.{dip,rise}` are new checks (job
  `c1f-rise`); shot.test.ts's full- and pass-roll low-flight cases return as the croqueted ball's bound (were
  `it.skip`).
- **Card** `2026-11-18-lift-split`: objective 7.16 (checks only). Lift: half 4.81, full 4.10, pass 4.06 mm, all
  pass. C1F's striker's ball: dip 1.90 (z −1.0), rise 1.89 (z −1.6), both near. Misses 41 → 39.
- **Open.** The striker's ball's lift in medium and hard rolls (≥ 13 mm at C3F, ≥ 44 mm at C25F) is unjudged; the
  user's observation would bound it. The C1F lead (μs ≈ 1.0 against `ballTurfSliding` 0.48) goes to the slow rolls'
  undershoot.

## The third refit (2026-11-20, on G6's re-timed finish)

The same Nelder–Mead, parameters, bounds and stop, from the reference values on `2026-11-20-finish-retimed` (6.30).
It converged after 79 cards: objective **4.78**. Records `2026-11-20-refit3.jsonl`, `2026-11-20-refit3-best`.

| Parameter | Reference | Fitted | Note |
|---|---|---|---|
| faceFriction | 0.38 | 0.281 | 20% of [0.2, 0.6] |
| ballBallFriction | 0.16 | 0.111 | 12% of [0.06, 0.5] |
| tangentialStiffnessRatio | 2/7 | 0.353 | |
| handCouplingPeriod | 0.080 | **0.0253** | 8% of [0.01, 0.2]: low, as in both earlier refits |
| handCouplingDampingRatio | 0.70 | 0.68 | |
| armMass | 0.80 | 1.08 | |
| ballTurfSliding | 0.48 | 0.665 | |

No parameter sits at a bound.

- **By family** (Σz²/count): table 6 2.92 → 1.54; table 5 1.43 → 1.29; strike, playability (all clean) and turf
  unchanged.
- **G2.** `coach.full-roll` 1.15, in its band (1.00–1.20; was 1.31, z 0.88). `coach.pass-roll` 1.08 against ≤ 0.99,
  z 2.55 → 0.91: closer, not closed.
- **Where the gain is.** The rolls' striker's ball, w₁/U z: C3F −3.90 → −1.92, C3P −3.18 → −0.83, C10F −3.42 →
  −1.87, C25F −2.66 → −1.31; held out C1F −4.25 → −2.47, C25P −4.31 → −2.82. The rolls' Ω₂ move towards Gugan (C3F
  −2.68 → −1.55, C3P −2.84 → −1.72, C1F −4.95 → −3.36). `lawn.t6.C3F.L1` −1.21 → −0.45.
- **Worse.** Fit: C10H w₁/U 0.30 → 1.06, C10H Ω₂ 0.04 → 1.13, C10P Ω₁ 0.73 → 1.09, C3S L2/L1 −0.90 → −1.16.
  Held out: C3H Ω₁ 0.36 → 1.67, `lawn.t6.C3H.L1` 0.99 → 1.64. Checks: Gugan 5's stop −2.49 → −3.69;
  `coach.stop-ac` 4.13, at the foot of its band (4.10–6.20).
- **Look.** Every ride is clean; lift half 2.28, full 1.91, pass 1.86 mm (band 0–5); C1F's striker's ball dip 2.01
  (z −0.79), rise 2.71 (z 0.02). The look the second refit broke holds.
- **Reading.** As before, a short grip period carries much of the gain (25 ms against the ruled 0.08 s), now without
  the lift penalty and with no parameter at a bound. Whether the gain survives at 0.08 s is not measured.
- **At 0.08 s** (`2026-11-20-refit3-grip80`, the six other fitted values, the grip period at its ruled value):
  objective **5.13** (reference 6.30, fit 4.78). The six carry 1.17 of the fit's 1.52; the grip the rest, nearly all
  of it the slow rolls' striker's ball and G2:
  - `coach.full-roll` 1.25 (z 0.44, just above its band; reference 1.31, fit 1.15); `coach.pass-roll` 1.19 (z 2.06;
    reference 1.24, fit 1.08).
  - w₁/U z against the fit: C3F −1.92 → −2.94, C3P −0.83 → −2.56, C10F −1.87 → −2.39, C1F −2.47 → −4.03; C10P
    1.30 → 0.14. Every other row, the look and Gugan 5 are as in the fit.
- **Ruled (2026-11-20):** the user's "Six fitted, grip 0.08 s". faceFriction 0.2807, ballBallFriction 0.1112,
  tangentialStiffnessRatio 0.3528, handCouplingDampingRatio 0.6835, armMass 1.081 kg and ballTurfSliding 0.6654 are
  now the reference (`reference/*.json`, each note citing this card); handCouplingPeriod stays 0.08 s. Engine 0.42.0;
  the reference card is `2026-11-20-refit3-grip80` (5.13).
- **G2 stays open, narrowed:** the canonical full roll plays lawful in one pass at 1.2527 (band 1.00–1.20), the pass
  roll at 1.1937 (≤ 0.99), the half roll at 1.644 (1.4–2.5). The grip period carries the rest; three fits in a row
  have asked for a short one, so the next step is the hands' mechanism the period stands in for, not a value.
- **Moves re-pinned:** `playPin.json`; the no-push baseline (drive, single-ball, stop-ac); the canonical rolls, the
  full roll at p 2 (1.307), the tap (1.243), the sample at p 1 (1.377), the least hold (σ 0, 1.083); the drive's
  read-outs; the AC stop's turf times (13.875, 14.24 ms); the reference values.
- **Behaviour moved, recorded:**
  - The half roll's striker's ball rises 12.7 mm above R in the impact and 14.4 mm in flight (was 4.8 mm); the
    croqueted ball 2.3 mm. Under G4's ruling the test is now the croqueted ball's, as the full roll's is.
  - The rolls' rising finish at p 1.1 turns −27.0° to +26.9°, so the bottom hand rises 53.9 mm to the top's 54.2:
    ruling 2's "the bottom hand more" is now level there. The test asserts it only when the turn ends further past
    vertical than it began.
  - The full roll at 1.5 m/s, drive −1 again sinks the ball under the head; the handover lifts it 311–327 µm, inside
    its static sink: the whole-run lift cover is back.
  - **The braked drive.** At full brake (drive −1, side 0.01, 2 m/s) the head runs on past the braking hands and
    the check's finish takes it at its swing's far end (215 ms, was 658 ms settled). **The user (2026-11-20):** a
    braked drive is not really a stroke; a soft drive may be braked a little against a double hit. The test moves to
    drive −0.25 at 1 m/s, which settles at 668 ms (667 before the refit).
  - **Found on the way, pre-existing** (the same at the pre-refit reference values; `followThrough.test` probe,
    drive −0.1 to −1 × 0.5, 1, 2 m/s, side 0.01): the soft drives at 0.5 m/s with a light brake (−0.1, −0.25) end
    their finish mid-swing, still 0.23 m/s relative to the hands 20 ms before; the light brakes at 2 m/s run to the
    1 s follow cap on the slow sideways sway the P2b.2b.2c.3a gate accepted. Every 1 m/s run settles. The finish
    reads rest at an instant, so a swing's far end passes for it; open, not in this refit's scope.
- **The firmest sourced grip** (`2026-11-20-grip-wrist16`, 62.5 ms, 16 Hz: Pan et al. 2018's wrist resonance under a
  30 N grip and 50 N push): objective 4.99, full roll 1.23, pass roll 1.18. Sourced periods are 60–125 ms; 25 ms is
  not a grip.
- **Ruled (2026-11-20): "Body behind the push".** The hands are a moving mass driven by the push, slowed only by the
  balls' resistance, not a path reset to the head's pace at the restart. Design:
  `docs/superpowers/specs/2026-11-20-push-body-design.md`.

### G2's push body, the discriminating run (`2026-11-21-push-body`, `-push-body-inf`, against `2026-11-20-refit3-grip80`)

Engine 0.43.0 (commit ca6478f): the hands driven by M_b from the strike, the press on the body, no restart re-anchor
on push strokes. The rows are spec §3's.

| Row | Reference (5.13) | M_b ∞ | M_b 2.9 kg |
|---|---|---|---|
| Objective | 5.13 | **15.90** | **16.11** |
| `coach.full-roll` (1.00–1.20) | 1.25 | 1.30 | 1.34 |
| `coach.pass-roll` (≤ 0.99) | 1.19 | 0.854 | 0.809 |
| `coach.half-roll` (1.4–2.5) | 1.64 | 1.64 | 1.64 |
| C3F w₁/U z | −2.94 | −4.17 | −4.34 |
| C3P w₁/U z | −2.56 | −2.98 | −3.18 |
| C10F w₁/U z | −2.39 | −3.37 | −3.61 |
| C1F w₁/U z | −4.03 | −4.53 | −4.83 |
| C25F, C25P, C10P, C10H w₁/U z | −1.36, −2.87, 0.14, 1.06 | −2.18, −3.05, −0.64, 2.07 | −2.43, −4.17, −0.91, 2.05 |
| Look | clean, lift 1.84–2.28 | clean, lift 1.84–2.28 | clean |

- **Verdict: fails, stop.** The full roll moves away from its band and w₁/U falls in every target roll, at the limit as
  at 2.9 kg. The body only slows the hands, so ∞ is the most carry any M_b gives: no finite value passes, and the
  bounds were not run (spec §3, stop rule). Only the pass roll comes into its band, and with it C3P's L2/L1 moves away
  (z 0.10 → −1.00/−1.09).
- **Reading.** Hands kept at the plan's pace from the strike carry the striker's ball less, not more, against the
  premise of the design: that the restart's slowing was what held w₁ back. Why is not measured here: the run reports,
  and the user rules on the next step. (A first reading, that at ∞ the press cannot act and so ending the re-anchor
  alone loses the carry, is withdrawn: the diagnosis below finds the press is lost, not idle.)
- **Behaviour moved (Task 3's full suite, 34 tests, not re-pinned):** the canonical rolls' ratios and play pins; the
  full roll's impact runs to 121.7 ms (was under 110 ms); the canonical full roll's follow-through ends at 0.89 rad/s
  (was at its apex); a half roll's push now ends inside the impact, so `followThrough` changes frames before the
  impact's end; the late mistimed roll's impact-end seam is 1.7 µm off the trapezoid (slack 1 µm); the endless carry
  no longer sinks past HEAD_DEEP_LIMIT; the old restart's and press's own tests.
- **The cards' JSON** write the limit as `"Infinity"` (`scripts/scorecard/run.ts`, `infinite`/`finite`).

### G2's push body, diagnosed (`gapProbe budget` and `push`, 0.42.0 against 0.43.0 at M_b ∞)

The engine was reverted to 0.42.0's behaviour (5ecad80); 0.43.0 was probed at 4a90540. Both probes run the full and
pass rolls of Table 6 at their U. Impulses run from the face's first departure to the card's read.

| Roll | w₁/U 0.42 → ∞ | Hands on the head, m·U | Face on ball 1, m·U | Press on the head, N·s | Coupling, N·s |
|---|---|---|---|---|---|
| C1F | 0.553 → 0.538 | 0.271 → 0.132 | 0.514 → 0.487 | 0.224 → 0 | −0.077 → 0.069 |
| C3F | 0.520 → 0.489 | 0.247 → 0.153 | 0.510 → 0.468 | 0.329 → 0 | −0.025 → 0.177 |
| C10F | 0.511 → 0.487 | 0.307 → 0.225 | 0.558 → 0.519 | 0.482 → 0 | 0.228 → 0.499 |
| C3P | 0.517 → 0.507 | 0.287 → 0.190 | 0.535 → 0.508 | 0.335 → 0 | 0.064 → 0.241 |
| C25P | 0.489 → 0.485 | 0.289 → 0.351 | 0.562 → 0.544 | 0.641 → 0 | 0.516 → 1.224 |

- **The impulse before the departure is unchanged** (face 1.10–1.12 m·U in both). The whole loss comes after it: the
  hands push the head less, the head the ball less.
- **The press is lost, not moved.** In 0.43.0 the press leaves the head (the probe's feed-forward column reads −intent),
  and the coupling the hands gain is smaller than the press they shed. In C3F the coupling averages 15 N over 12.2 ms,
  against the 92.2 N press.
- **The cause is the body's floor, δ ≥ 0.** M_b·dδ/dt = F_g − F_press can slow the hands below the plan, never speed
  them past it. While the coupling is below the press, which is most of the impact, δ is held at 0 and the press does no
  work: the hands run at the plan's pace, as at ∞. That is why 2.9 kg reads as ∞ (16.11 against 15.90). The floor's
  share of the steps is inferred from the force balance, not counted.
- **What it implies.** The head in 0.42.0 is driven faster than "hands at the plan's pace" would drive it: the press on
  the head is what carries the ball past the departure. A body that keeps the press must be able to run ahead of the
  plan (δ < 0), up to a bound the design does not yet have. The user rules on the next step.

### G2's push body, A2 (`2026-11-21-push-body-a2-inf`, `-a2-2.9`, `-a2-0.9`, `-a2-4.9`, against `2026-11-20-refit3-grip80`)

Engine 0.44.0 (commit 20c15d2): the press on the body from the strike until the striker's ball is 10 mm clear of the
face, no floor on δ (a lead allowed), and the hands' feed-forward without the body's own surge (spec A3). The ∞ row
reproduces `2026-11-21-push-body-inf` to the bit (objective 15.901509665814883, every row).

| Row | Reference | M_b ∞ | 4.9 kg | 2.9 kg | 0.9 kg |
|---|---|---|---|---|---|
| Objective | 5.13 | **15.90** | **15.89** | **17.58** | **17.56** |
| C3F w₁/U | 0.520 | 0.489 | 0.489 | 0.489 | 0.489 |
| C10F w₁/U | 0.511 | 0.487 | 0.489 | 0.489 | 0.487 |
| C25F w₁/U | 0.472 | 0.454 | 0.454 | 0.454 | 0.455 |
| C3P w₁/U | 0.517 | 0.507 | 0.507 | 0.507 | 0.507 |
| C25P w₁/U | 0.489 | 0.485 | 0.485 | 0.485 | 0.485 |
| `coach.full-roll` (1.00–1.20) | 1.25 | 1.30 | 1.33 | 1.33 | 1.33 |
| `coach.pass-roll` (≤ 0.99) | 1.19 | 0.854 | 1.22 | 0.695 | 1.22 |
| Plays not clean (target rolls) | none | C10H, C3P, C10P, C25P, canon full and pass | C10H, C10F, C3P, C10P, C25P, canon pass | C3H, C10H, C10F, C3P, C10P, C25P, canon pass | C3H, C10H, C1F, C3P, C25P, canon half and pass |

- **Verdict: fails at every mass, stop.** w₁/U is the same to ±0.002 U at every M_b, ∞ included: the body moves
  nothing the card reads in the ratio. The objective's differences between masses are the plays' cleanliness and the
  pass roll's coaching ratio, which swings non-monotonically (0.695 at 2.9 kg, 1.22 at 0.9 and 4.9 kg): it is read off
  a play that is not clean, not off the ratio.
- **Why (`gapProbe budget` at 2.9 kg against the 0.43.0 ∞ column above).** The hands' impulse on the head after the
  departure is 0.160 m·U in C3F (∞ 0.153, 0.42.0's press on the head 0.247), C10F 0.232 (0.225; 0.307), C3P 0.193
  (0.190; 0.287). The press now accelerates the body; the head feels it only through the grips' tracking of a body
  that leads by about 1–2 % of the plan's pace by the read (the pass roll's clock reaches τ′ ≈ 1.017 at 4 ms after the
  strike). Before the read, the body keeps almost all of the press's impulse.
- **The head does not chase:** W at the read stays below w₁ in every roll (C3F 0.420 against 0.489), so the spec's
  W ≤ w₁ + 0.03 U row holds. The window's length per roll was not measured.
- **A3, found by the run.** The first A2 build hung `advance.test`'s single-ball push stroke: the body's own surge in
  the feed-forward made F_g read the mallet's inertia as negative load (spec A3). The first run read F_g the same way,
  so this register's "coupling" column above (0.43.0) carries that artefact wherever δ moved; its "press lost, not
  moved" reading stands, as at ∞ δ never moved.
- **Behaviour moved (full suite, 34 tests red, not re-pinned):** as the first run's, plus `advance.test`'s level
  advance (head rise 0.02997 against 0.02973) and `finiteGuard`'s hand-built overflow, which the body's timing no
  longer reaches. No test hangs (each file run alone under a 15-minute cap).
- **Ruling (the user, 2026-11-21):** revert, and drop the push body. The engine is back to 0.42.0's behaviour (d79e662,
  identical to 5ecad80). G2's next question is the user's account of the pass roll, "start soft and smoothly
  accelerating", tested as the swing plan's own acceleration through the ball.

## G2: the swing plan's acceleration through the ball (2026-11-21)

The user's account, "start soft and smoothly accelerating", tested with no engine change: a throwaway sweep scaled the
full and pass rolls' planned pulse (`speedGain` and `handGain`, both 0.1) by ×1, ×4 and ×10 on 0.42.0's engine, then
reverted. Cards: `2026-11-21-accel-x1`, `-x4`, `-x10`.

| Row (Table 6 target) | ×1 | ×4 | ×10 |
|---|---|---|---|
| Objective | 5.13 | 5.13 | 5.12 |
| C3F w₁/U (0.594) | 0.520 | 0.520 | 0.521 |
| C10F w₁/U | 0.511 | 0.511 | 0.512 |
| C25F w₁/U | 0.472 | 0.472 | 0.472 |
| C3P w₁/U | 0.517 | 0.517 | 0.517 |
| C25P w₁/U | 0.489 | 0.490 | 0.492 |
| `coach.full-roll` (1.00–1.20) | 1.25 | 1.25 | 1.25 |
| `coach.pass-roll` (≤ 0.99) | 1.19 | 1.19 | 1.19 |

- **Verdict: no effect.** Ten times the planned acceleration (the head's plan reaching about 38 m/s² at 10 ms and
  70 m/s² at 30 ms after contact) moves w₁/U by at most +0.003 U. The ×1 control reproduces the record (5.13).
- **Likely why (not measured).** The pulse starts from zero at contact and grows over its window, so most of it lands
  after the ball has gone; and, as with the push body, the head feels the plan only through the grips. A
  `gapProbe budget` under ×10 would confirm it.
- **Measured (`gapProbe budget` and `push`, ×1 against ×10).** The hands' impulse on the head from the croqueted
  ball's departure to the read rises by 0.001 m·U in C3F (0.247 → 0.248) and at most 0.018 in C10P (0.367 → 0.385);
  the feed-forward's share of the plan's acceleration in that window is 0.000–0.021 N·s. C3F's gap is 0.074 m·U. The
  plan's head acceleration at ×10 is 0.1 m/s² at contact, 11 m/s² at 10 ms and 24 m/s² at 30 ms (canonical full roll):
  it builds after the read. The reason above stands: no scale of the plan's pulse reaches the ball in time.

## G2: the handover between the balls (2026-11-21)

The user chose the handover first (2026-11-21): in five of the seven rolls the two balls' total momentum is about
right (w₁/U + v₂/U against Gugan's within ±0.04), but the striker's ball gets too little and the croqueted ball too
much. A sweep with no engine change set each of the contact's two fitted frictions to its sourced bounds and
between, the other at its fit (faceFriction 0.2807, ballBallFriction 0.1112). Cards: `2026-11-21-handover-*`.

| Run | Objective | C1F | C3F | C10F | C25F | C3P | C10P | C25P |
|---|---|---|---|---|---|---|---|---|
| Gugan w₁/U | | 0.667 | 0.594 | 0.569 | 0.501 | 0.580 | 0.520 | 0.557 |
| fit | 5.13 | 0.553 | 0.520 | 0.511 | 0.472 | 0.517 | 0.524 | 0.489 |
| faceFriction 0.2 (bound) | 6.75 | 0.557 | 0.526 | 0.523 | 0.483 | 0.534 | 0.540 | 0.915 |
| faceFriction 0.4 | 5.97 | 0.539 | 0.506 | 0.485 | 0.442 | 0.507 | 0.509 | 0.451 |
| faceFriction 0.6 (bound) | 1833.85 | 0.471 | 0.467 | 0.049 | 0.351 | — | 0.245 | 0.321 |
| ballBallFriction 0.06 (bound) | 6.86 | 0.558 | 0.530 | 0.528 | 0.484 | 0.538 | 0.552 | 0.905 |
| ballBallFriction 0.25 | 7.16 | 0.540 | 0.482 | 0.473 | 0.434 | 0.530 | 0.491 | 0.457 |
| ballBallFriction 0.5 (bound) | 6.96 | 0.542 | 0.490 | 0.479 | 0.439 | 0.504 | 0.491 | 0.457 |

- **Verdict: not the lever within the bounds.** Less friction at either contact raises w₁/U, but at the lower bounds
  C3F reaches only 0.530 against 0.594 (a seventh of the gap), and v₂/U rises with it (C3F 0.885 → 0.895 and 0.908):
  the total grows; the share does not move towards the striker's ball. More friction lowers w₁/U. faceFriction 0.6
  breaks the rolls (C10F 0.049; C3P unread).
- **C25P at the lower bounds reads w₁/U ≈ 0.91**, the striker's ball nearly as fast as the croqueted ball, with the
  play still clean: a different outcome, not a trend. Not examined.
- **Not swept: ball–ball restitution** (0.795, bounds 0.7071–0.97), not a free parameter. It sets directly what the
  striker's ball keeps when it meets the croqueted ball.

## G2: ball–ball restitution (2026-11-22)

A temporary edit to `reference/friction.json` (reverted) set ballBallRestitution, Gugan's 0.72 (bounds 0.7071–0.866),
to 0.71 and 0.75. Cards: `2026-11-22-restitution-0.71`, `-0.75`. The trial was put to the user as 0.795 within
0.71–0.97, a misreading of the neighbouring entry; the runs used the real value's neighbourhood.

| Run | Objective | C1F | C3F | C10F | C25F | C3P | C10P | C25P |
|---|---|---|---|---|---|---|---|---|
| Gugan w₁/U | | 0.667 | 0.594 | 0.569 | 0.501 | 0.580 | 0.520 | 0.557 |
| 0.72 (fit) | 5.13 | 0.553 | 0.520 | 0.511 | 0.472 | 0.517 | 0.524 | 0.489 |
| 0.71 | 6.80 | 0.551 | 0.521 | 0.513 | 0.473 | 0.515 | 0.524 | 0.903 |
| 0.75 | 6.71 | 0.558 | 0.513 | 0.507 | 0.466 | 0.522 | 0.520 | 0.487 |

- **Verdict: closed by the sources.** The value is already 0.013 above its floor; at the floor w₁/U is unmoved
  (C3F 0.521). Raising it lowers C3F's w₁/U and moves Table 5's drives and stops away from Gugan (t5.mean.w1W z 0.59 →
  2.15 at 0.75).
- **C25P again reads w₁/U ≈ 0.90 at 0.71**, and its play is not clean: the same outcome as at the lower frictions. A
  small change to the handover tips C25P into it.
- **The handover in sum:** neither friction nor restitution within its sourced bounds closes more than a seventh of
  C3F's gap. With the swing's push and plan also excluded, the gap's cause lies outside the parameters swept so far.

## G2: the striker's ball's ploughing (2026-11-22)

`gapProbe plough` (new mode, no engine change): the turf's impulse along aim on the striker's ball from the strike to
the read, in 2 ms bins, separated into the normal force's part (the bed's wall ahead of the sunken ball) and the
tangential force's (sliding), with the ball's centre height against its rest.

| Roll | w₁/U (Gugan) | Turf to the read | of it, wall | of it, sliding | Deepest sink | Rise at the read |
|---|---|---|---|---|---|---|
| C1F | 0.553 (0.667) | −0.136 | −0.007 | −0.127 | 1.99 mm | −1.09 mm |
| C3F | 0.520 (0.594) | −0.158 | −0.014 | −0.144 | 3.19 mm | +0.05 mm |
| C10F | 0.511 (0.569) | −0.220 | −0.030 | −0.190 | 4.68 mm | +0.49 mm |
| C25F | 0.472 (0.501) | −0.225 | −0.043 | −0.182 | 6.21 mm | +0.45 mm |
| C3P | 0.517 (0.580) | −0.192 | −0.018 | −0.173 | 3.52 mm | −1.11 mm |
| C10P | 0.524 (0.520) | −0.248 | −0.033 | −0.216 | 4.74 mm | −0.56 mm |
| C25P | 0.489 (0.557) | −0.261 | −0.054 | −0.208 | 6.90 mm | +11.30 mm |

- **The loss is sliding, not the wall.** Nine-tenths of the turf's impulse is the tangential force, almost all of it
  in the first 6–8 ms, while the face drives the ball down into the turf (sunk 2–7 mm) and the normal force, and so the
  sliding friction, is large. The wall ahead of the ball takes at most 0.054 m·U.
- **The sliding loss is about twice each gap** (C3F 0.144 against 0.074; C3P 0.173 against 0.063; C1F 0.127 against
  0.114): halving it would close most of G2.
- **The ball stays in the turf through the read** in every roll but C25P, which rises 11 mm: the same roll whose
  w₁/U jumped to ≈ 0.90 at the handover's lower bounds.
- **Slip at the bins' ends changes sign** from bin to bin (C3F −0.14 U to +0.13 U), so the tangential force is not a
  steady sliding drag; the end-of-bin sample does not show its course within a bin. Not examined further.
- **A -2 player's account (relayed by the user, 2026-11-22, "a bit subjective"):** the lean and striking high and down
  through the ball into the ground make the striker's ball jump a little; the push then sets it rolling, which is why
  the striker's ball goes about as far as the croqueted ball. If so, the real ball spends part of this window off the
  turf, with little sliding loss; the model's stays in it.

## G2: the turf's sliding friction (2026-11-22)

A sweep with no engine change set ballTurfSliding (fit 0.6654, bounds 0.48–1.0) to 0.48 and 0.55. Cards:
`2026-11-22-sliding-0.48`, `-0.55`.

| Run | Objective | C1F | C3F | C10F | C25F | C3P | C10P | C25P | `coach.pass-roll` |
|---|---|---|---|---|---|---|---|---|---|
| Gugan w₁/U | | 0.667 | 0.594 | 0.569 | 0.501 | 0.580 | 0.520 | 0.557 | ≤ 0.99 |
| 0.6654 (fit) | 5.13 | 0.553 | 0.520 | 0.511 | 0.472 | 0.517 | 0.524 | 0.489 | 1.19 |
| 0.55 | 5.28 | 0.550 | 0.519 | 0.510 | 0.471 | 0.512 | 0.520 | 0.471 | 1.30 |
| 0.48 (bound) | 5.32 | 0.552 | 0.518 | 0.510 | 0.470 | 0.518 | 0.528 | 0.475 | 1.30 |

- **Verdict: no effect on the striker's ball.** w₁/U is unmoved to ±0.006 (C25P −0.018), while the croqueted ball runs
  faster (C1F v₂/U 0.816 → 0.855, C3P 0.886 → 0.901) and the pass roll's coaching row worsens. All plays stay clean;
  Table 5's means hold.
- **Likely why (not measured):** the plough probe's tangential force on the striker's ball changes sign between 2 ms
  samples, the mark of a tangential spring that mostly sticks rather than slides at the Coulomb limit. If it sticks,
  μ does not bound it, and the loss is set by the turf's tangential stiffness and the ball's being held in it.

## G2: grip or slide on the turf (2026-11-22)

`gapProbe plough` now also reports, per 2 ms bin, the share of the striker's ball's time in contact with the turf
pair's tangential force at the Coulomb limit μ·N (≥ 99 %) and its mean use of it, |F_t|/(μ·N).

| Roll | 0–2 ms | 2–4 ms | 4–6 ms | 6–8 ms | 8–10 ms |
|---|---|---|---|---|---|
| C1F | 0 %, 0.50 | 0 %, 0.12 | 0 %, 0.14 | 0 %, 0.09 | 0 %, 0.60 |
| C3F | 32 %, 0.71 | 0 %, 0.15 | 0 %, 0.13 | 0 %, 0.45 | 60 %, 0.92 |
| C10F | 31 %, 0.65 | 0 %, 0.10 | 0 %, 0.35 | 6 %, 0.84 | 97 %, 1.00 |
| C25F | 31 %, 0.61 | 0 %, 0.13 | 0 %, 0.48 | 48 %, 0.94 | off the turf |
| C3P | 30 %, 0.70 | 0 %, 0.13 | 0 %, 0.26 | 13 %, 0.62 | 100 %, 1.00 |
| C10P | 30 %, 0.65 | 0 %, 0.12 | 0 %, 0.42 | 39 %, 0.86 | 100 %, 1.00 |
| C25P | 29 %, 0.59 | 0 %, 0.19 | 0 %, 0.58 | 89 %, 0.99 | off the turf |

- **Verdict: the ball grips the turf.** From 2 to 6 ms, when it is pressed deepest, it never reaches the limit (mean
  use 0.10–0.58): the turf's tangential spring holds it. It slides only for about a third of the first 2 ms and once
  the press eases (6–10 ms), when the normal force, and so the loss, is small. This is why μ moved nothing.
- **Where the loss falls (C3F):** 0.077 m·U in the gripped bins (2–8 ms), 0.059 in the first 2 ms (a third of it at
  the limit), 0.008 at the limit after 8 ms. The loss is set by the turf's tangential stiffness and how long the face
  holds the ball in the turf: free parameters tangentialStiffnessRatio, turfYield and turfMatStrength, or a ball that
  leaves the turf sooner, as the -2 player's account has it.

## G2: the striker's ball's hop (2026-11-22)

`gapProbe lift` (new mode, no engine change): the vertical impulse on the striker's ball (share of m·U, up positive)
in 2 ms bins to the read, from the face, the croqueted ball and the turf, with its vertical speed, its centre's height
and the turf's stored energy. The face normal is 31–32° below horizontal at first contact in every roll.

| Roll | Face, 0–2 ms | Face, 2 ms to the read | Deepest | Turf lets go | v_z then | Height at the read |
|---|---|---|---|---|---|---|
| C1F | −0.499 | −0.316 | 1.93 mm | after the read | +0.19 U | −1.09 mm |
| C3F | −0.558 | −0.258 | 3.19 mm | 8–10 ms | +0.19 U | +0.05 mm |
| C10F | −0.583 | −0.297 | 4.68 mm | 8–10 ms | +0.19 U | +0.49 mm |
| C25F | −0.581 | −0.287 | 5.98 mm | 6–8 ms | +0.18 U | +0.45 mm |
| C3P | −0.588 | −0.302 | 3.51 mm | after the read | +0.20 U | −1.11 mm |
| C10P | −0.605 | −0.359 | 4.74 mm | 8–10 ms | +0.19 U | −0.56 mm |
| C25P | −0.605 | −0.361 | 6.50 mm | 6–8 ms | +0.18 U | +11.30 mm |

- **The model's ball does hop**, as the -2 player describes: the turf returns the face's downward drive and sends the
  ball up at about 0.19 U in every roll. But it leaves the turf late, at 6–10 ms or after the read, while the gripped
  loss of the plough probe falls at 2–6 ms.
- **The face keeps driving it down after the strike.** Beyond the first 2 ms the face adds a further −0.26 to −0.36
  m·U downward (about half its first-2-ms drive), in 2–8 ms, re-contacting the ball as the turf lifts it: the follow-on
  push holds the ball in the turf rather than letting it rise. The -2 player's account has the ball hop first and the
  push then set it rolling; in the model the push comes while the ball is still in the turf, and presses it.
- **The 31–32° face normal** is the strike's geometry as played; whether it matches Gugan's filmed face angles per
  roll was not checked here.
- **The face angle checked (2026-11-22): it matches Gugan.** Gugan 4 Table 6's α (the shaft's forward angle, equal to
  the face normal's angle below horizontal; `reference/sources/README.md`) against the face normal at first contact:
  C1F 31 / 31.0, C3F 29 / 31.0, C10F 33 / 31.0, C25F 30 / 31.0, C3P 36 / 32.0, C10P 34 / 32.0, C25P 32 / 32.0. The
  rolls play each type's default lean (full 31°, pass 34°), so the full rolls sit within 2° of their filmed angles;
  the pass rolls strike 2° shallower than their 34° lean (cause not examined), within 4° of Gugan. The strike's
  downward drive is the filmed geometry's; the gap lies in what follows it.

## G2: the climb up the face (2026-11-22)

`gapProbe climb` (new mode, no engine change): the striker's ball centre's travel along the head's shaft axis (up the
face, against its place at the face's first contact) at each 2 ms bin's end, with the face's time in contact, its
tangential impulse along that axis (share of m·U, up positive) and the share of the contact time at μ·N.

| Roll | 0–2 ms | 2–4 ms | 4–6 ms | 6–8 ms | 8–10 ms | Face friction, 2 ms to the read |
|---|---|---|---|---|---|---|
| C1F | −0.72 mm | −1.39 | −1.34 | −0.80 | −0.32 | −0.004 |
| C3F | −1.88 | −2.63 | −1.96 | −0.67 | +0.75 | −0.075 |
| C10F | −3.46 | −4.49 | −3.07 | −0.91 | +1.03 | −0.109 |
| C25F | −5.15 | −5.74 | −3.03 | +0.16 | +0.98 | −0.105 |
| C3P | −2.22 | −3.01 | −2.22 | −0.71 | +0.07 | −0.098 |
| C10P | −3.50 | −4.57 | −3.25 | −1.19 | −0.03 | −0.129 |
| C25P | −5.95 | −6.49 | −3.45 | +0.04 | +3.52 | −0.131 |

- **The model's ball slides down the face, not up.** In the first 4 ms it travels 1.4–6.5 mm down the face as the
  strike drives it into the turf; the face's friction acts up on it (+0.15 to +0.22 m·U in the first 2 ms, at the
  limit about half the time).
- **It climbs back only as the turf throws it up, against the face's friction at the limit** (96–100 % from 2–4 ms on
  in the faster rolls, −0.08 to −0.13 m·U along the face in all but C1F). It regains its first-contact place at 6–10 ms; only C25P,
  airborne, climbs well above it (12.6 mm by the read).
- **Against Gugan (§10.2: the ball "rolling/sliding up" the face) and the -2 player (hop, then roll):** the real ball
  climbs while the face pushes; the model's ball goes down first and is held there by the face and the turf's grip,
  losing its speed in 2–6 ms. Within the model's laws, the face's friction is the one part acting at its limit while
  the ball climbs, which is why faceFriction at its lower bound moved w₁/U a little (+0.004 to +0.017).
- **Correction (2026-11-22), on reading §10.1 in full.** Gugan's passage on C1F, the best-seen two-ball roll, has the
  striker's ball moving down into the ground for about 5 ms after the initial contact, in contact with the mallet,
  and then: "the subsequent upward motion of the ball … is restrained by the downward-sloping mallet face, which
  results in the ball rolling/sliding up it". The model's sequence, down first and then up against the face, is his;
  the bullets above that read it as the opposite of his account are withdrawn. At first contact the head moves 8–9°
  below horizontal (full rolls 8.2–8.3°, pass rolls 9.3°), so the 31–32° face slides up past the ball at about 0.39 U.
- **What differs is the speed in that window.** Gugan: "For ball 1 there is a considerable acceleration for about
  5 ms after the end of the initial contact period", its speed first reduced by the croqueted ball and then
  accelerated by the mallet's second contact, reaching pure roll in the same few ms. The model's striker's ball loses
  speed over that window instead (C3F, from the face's departure to the read: face +0.510, croqueted ball −0.741,
  turf −0.150 m·U). G2 lies in that window's balance, not in the direction the ball moves on the face.

## G2: a firmer turf (2026-11-22)

The bed is fitted to A4R alone (e 0.5 and 7.2 mm at 5 m/s); at Table 4(b)'s held-out A2R and A3R it sinks deeper
than Gugan measured (5.02 and 5.57 mm against 4.0 and 5.0, each impact speed taken as the rebound over the model's own
e). A throwaway least-squares fit to all three depths and A4R's e (relative error) gives bedModulus 2.239e8 N/m³
(was 1.625e8, 38 % stiffer) and bedRecovery 7.079e-4 s (was 7.550e-4): A2R 4.54 mm, A3R 5.04 mm, A4R 6.52 mm at
e 0.486 (score 0.028 against 0.078). One bed does not meet all three. The card and `gapProbe plough` ran on it
through a temporary edit to `reference/contact.json`, reverted. Card: `2026-11-22-firm-bed`.

| Roll | w₁/U (Gugan) | Firm bed | Turf to the read, was → firm | Deepest, was → firm |
|---|---|---|---|---|
| C1F | 0.553 (0.667) | 0.550 | −0.136 → −0.154 | 1.99 → 1.79 mm |
| C3F | 0.520 (0.594) | 0.514 | −0.158 → −0.161 | 3.19 → 2.88 mm |
| C10F | 0.511 (0.569) | 0.515 | −0.220 → −0.215 | 4.68 → 4.22 mm |
| C25F | 0.472 (0.501) | 0.473 | −0.225 → −0.220 | 6.21 → 5.57 mm |
| C3P | 0.517 (0.580) | 0.526 | −0.192 → −0.189 | 3.52 → 3.19 mm |
| C10P | 0.524 (0.520) | 0.544 | −0.248 → −0.230 | 4.74 → 4.22 mm |
| C25P | 0.489 (0.557) | 0.902, not clean | — | — |

- **Verdict: no.** The ball sinks about a tenth less and rises sooner (up to 6 mm above rest by the read in C10F,
  C25F and C10P), but the turf's take is unchanged to ±0.02 m·U: the loss falls in the first few ms, before the
  bounce. w₁/U moves −0.006 to +0.009 in the short rolls, C10P overshoots (0.544 against 0.520), and C25P tips into
  its ≈ 0.90 outcome, not clean. Objective 8.28 (5.13). Table 5's means hold; the pass roll's coaching row improves
  (1.19 → 1.17).

## G2: the head's speed through the strike (2026-11-22)

`gapProbe head-speed` (new mode, no engine change): the head's (1.000 kg) and the striker's ball's speeds along aim
in 1 ms bins to the read, and the impulses on the head from the face, the hands and the turf (share of M·U).

| Roll | Head after 1 ms | Head at the read | Ball 1 at the read (Gugan w₁ ≈ his mallet) | Face on the head, 1 ms to the read | Hands, whole window |
|---|---|---|---|---|---|
| C1F | 0.569 | 0.449 | 0.553 (0.667) | −0.232 | +0.150 |
| C3F | 0.574 | 0.446 | 0.520 (0.594) | −0.232 | +0.133 |
| C10F | 0.573 | 0.461 | 0.511 (0.569) | −0.252 | +0.164 |
| C25F | 0.560 | 0.436 | 0.472 (0.501) | −0.229 | +0.125 |
| C3P | 0.576 | 0.445 | 0.517 (0.580) | −0.242 | +0.157 |
| C10P | 0.575 | 0.465 | 0.524 (0.520) | −0.269 | +0.194 |
| C25P | 0.563 | 0.447 | 0.489 (0.557) | −0.252 | +0.155 |


- **The first impact is right; the second contact is not.** After the first 1 ms the head is at 0.56–0.58 U, close
  to Gugan's final mallet speed (§10: "essentially the same as for ball 1", 0.50–0.67 U). It then pushes the
  striker's ball back up from 0.14–0.21 U, after the ball has met the croqueted ball, and pays for it: the head ends at
  0.44–0.47 U, below the ball. The hands give back about half of what the face takes over the window.
- **What Gugan's figures imply.** If his mallet ends at w₁ (C3F 0.594 U) after giving the balls m(w₁ + v₂) = 1.48 m·U
  (more, with the turf's take), the mallet acted over those ~5 ms as a mass of at least 1.48/(1 − 0.594) = 3.65 balls
  (1.66 kg). His drives give k ≈ 2.9 ± 0.5 for the single impact (§9.3), which the model's Table 5 rows match
  (t5.mean.v2U 1.10). The model's head and hands over C3F's window act as about 2.7. So the real mallet grows
  heavier between the first impact and the end of the second contact; Gugan names what sets the effective mass:
  "bodily motion, flexure of the shaft, and firmness of grip" (§5.1).
- **The same lever as the third refit.** All three refits asked for a short grip period (25 ms against the ruled
  0.08 s), and at 25 ms G2 largely closes (C3P w₁/U z −0.83, C3F −1.92). The user kept 0.08 s and set the next step
  as "the hands' mechanism the period stands in for". This run says where that mechanism acts: in the 1–8 ms of the
  second contact, by the grip bringing the arms' mass to the head in time.

## G2: where the grip period acts in the strike (2026-11-22)

The firming design (the user's choice, "Firms through the strike") began by reading where `handCouplingPeriod` acts.
The impact starts at the grips' relax (`coupling.relaxAt` 0 s, the face's first touch at 0.01 ms on every roll), so
the firm grip's springs and dampers (`handGains`, track.ts) never act on a roll's strike. From contact the hands are
the hand–arm chains and the arms' posture hold, none of them set by the period. The period reaches the strike in two
places only: the bottom hand's twist damper, and the push's pitch hold (`pushPitch`), the hands' couple holding the
shaft's pitch about the top hand, K_p = I_P·(2π/T)², held to `holdFirmness` times the grip's couple.

`gapProbe head-speed` with `--set handCouplingPeriod=0.0253` alone, every other value as committed:

| Roll | w₁/U at 0.08 s → 0.0253 s (Gugan) | Head after 1 ms | Head at the read |
|---|---|---|---|
| C1F | 0.553 → 0.597 (0.667) | 0.569 → 0.590 | 0.449 → 0.470 |
| C3F | 0.520 → 0.546 (0.594) | 0.574 → 0.596 | 0.446 → 0.471 |
| C10F | 0.511 → 0.523 (0.569) | 0.573 → 0.579 | 0.461 → 0.468 |
| C25F | 0.472 → 0.473 (0.501) | 0.560 → 0.561 | 0.436 → 0.437 |
| C3P | 0.517 → 0.559 (0.580) | 0.576 → 0.600 | 0.445 → 0.464 |
| C10P | 0.524 → 0.549 (0.520) | 0.575 → 0.586 | 0.465 → 0.483 |
| C25P | 0.489 → 0.490 (0.557) | 0.563 → 0.564 | 0.447 → 0.447 |

- **The period's lever is the pitch hold.** A stiffer hold keeps the face from turning back about the top hand under
  the balls' impulse, so the head keeps more speed from the first impact on (C3F 0.574 → 0.596 U after 1 ms), not only
  in the second contact. This corrects the section above: the refit's short period acted through the hands' pitch
  couple, not by bringing the arms' mass to the head.
- **Alone it closes a third to two thirds of the short rolls' gap** (C3F 0.074 → 0.048, C3P 0.063 → 0.021) and
  overshoots C10P by 0.029. The refits' fuller closure came with the other values fitted jointly.
- **The 25 m rolls do not move.** Unchecked: their larger impulse likely holds the couple at its limit
  (`holdFirmness` × `gripCouple`), where the gain no longer matters.

## G2: the strike's pitch hold, swept (2026-11-22)

Engine 0.43.0 (strike pitch hold design, `docs/superpowers/specs/2026-11-22-strike-pitch-hold-design.md`): the push's
pitch hold takes its own period, `strikePitchPeriod`, landing at 0.08 s. The landing card
(`2026-11-22-strike-pitch-0.080`) equals `2026-11-21-accel-x1` row for row, objective 5.13. The sweep, every other
value held (cards `2026-11-22-strike-pitch-<T>`):

| T (s) | Objective | C1F w₁/U | C3F | C10F | C25F | C3P | C10P | C25P |
|---|---|---|---|---|---|---|---|---|
| Gugan | | 0.667 | 0.594 | 0.569 | 0.501 | 0.580 | 0.520 | 0.557 |
| 0.080 | 5.13 | 0.553 | 0.520 | 0.511 | 0.472 | 0.517 | 0.524 | 0.489 |
| 0.060 | 4.98 | 0.563 | 0.527 | 0.521 | 0.472 | 0.525 | 0.535 | 0.490 |
| 0.040 | 4.87 | 0.580 | 0.537 | 0.523 | 0.472 | 0.540 | 0.547 | 0.490 |
| 0.030 | 4.79 | 0.593 | 0.544 | 0.523 | 0.473 | 0.553 | 0.549 | 0.490 |
| 0.025 | 4.77 | 0.597 | 0.546 | 0.523 | 0.473 | 0.560 | 0.549 | 0.491 |
| 0.020 | **4.76** | 0.599 | 0.548 | 0.524 | 0.473 | 0.563 | 0.549 | 0.491 |
| 0.015 | 4.77 | 0.600 | 0.549 | 0.524 | 0.473 | 0.566 | 0.550 | 0.491 |
| 0.010 | 4.77 | 0.602 | 0.550 | 0.525 | 0.473 | 0.567 | 0.550 | 0.491 |

- **Best 0.020 s, objective 4.76 against 5.13**, not at a bound. Rows moving by more than 1 z: C1F w₁/U −4.03 → −2.41,
  C3F −2.94 → −1.83, C10F −2.39 → −1.85, C3P −2.56 → −0.68, C10P +0.14 → +1.31 (overshoot), coach.pass-roll
  2.06 → 0.81. Drives, stops and the half rolls do not move; no row becomes unpractised.
- **The gain flattens below 30 ms and the 25 m rolls never move.** A stiffer spring that stops paying is a limit: the
  hold's couple is held to `holdFirmness` times the grip's couple, and the long rolls' larger impulse likely holds it
  there. Next: test the limit.
- **The split stays wrong.** The striker's ball is still slow and the croqueted ball fast in C1F (v₂/U +3.4 z), C3P
  (+3.2) and C25P (+2.3): the hold moves w₁ but hardly v₂.

## G2: the hold's limit, and the strike's grip adopted provisionally (2026-11-22)

The push's pitch hold is held to `holdFirmness` times the grip's couple, and `holdFirmness` reaches 1 from 3 m/s
(ruling 15). The limit was scaled through a throwaway environment switch, every value else held, at 20 ms (cards
`2026-11-22-probe-limit-*`, not engine settings):

| Limit | Objective | C1F w₁/U | C3F | C10F | C25F | C3P | C10P | C25P | Plays |
|---|---|---|---|---|---|---|---|---|---|
| Gugan | | 0.667 | 0.594 | 0.569 | 0.501 | 0.580 | 0.520 | 0.557 | |
| ×1 | 4.76 | 0.599 | 0.548 | 0.524 | 0.473 | 0.563 | 0.549 | 0.491 | clean |
| ×1.25 | 4.79 | 0.615 | 0.558 | 0.541 | 0.483 | 0.573 | 0.582 | 0.499 | clean |
| ×1.5 | 4.89 | 0.620 | 0.562 | 0.556 | 0.493 | 0.574 | 0.598 | 0.508 | clean |
| ×2 | 6.75 | 0.620 | 0.562 | 0.583 | 0.511 | 0.574 | 0.611 | 0.889 | C25P not clean |
| ×∞ | 9.96 | 0.620 | 0.562 | 0.587 | 0.556 | 0.574 | 0.611 | 1.01 | C25P not clean; half rolls 0.56–0.58 |

- **The limit holds the long rolls.** Lifted, C10F and C25F reach Gugan's w₁/U. At ×2 C25P becomes a push: the face
  stays on the striker's ball 37 ms while the hands drive it to 0.89 U, and it runs 46.6 m against 26.
- **By the outcome the user plays for, the distance ratio, ×1.25 is the best.** Every full and pass roll's L2/L1 is
  within 0.4 z of Gugan's (C1F 1.01 → 0.37 z, C10P 0.80 → 0.27); the coaches' full roll 1.25 → 1.11 (band
  1.0–1.2), pass roll 1.19 → 1.05 (the coaches' ≤ 0.99). The objective rises 0.03 over ×1, all of it C10P's w₁/U
  overshoot (+2.8 z) while its L1 and L2 stay within 0.5 z. ×1.25 rather than ×1.5 (much the same ratios) for the
  margin from the push.
- **Adopted provisionally for the user's review (engine 0.44.0):** `strikePitchPeriod` 0.020 s and a new
  `strikeGripFactor` 1.25 (bounds 1–2, placeholder), both in `reference/contact.json`. Card `2026-11-22-strike-grip-1.25`
  reproduces the ×1.25 probe: objective 4.79, every play clean. Late-hit survey `2026-11-22-strike-grip-1.25`
  (`docs/superpowers/probes/late-hit/`): no late hit on Table 6 or on the full, pass and half rolls at any power.
- **Re-pinned:** the play pins; the text-book ratios (full roll 1.2527 → 1.1098, half 1.644 → 1.638, pass
  1.1937 → 1.0518, full at p 2 1.307 → 1.271); the full roll's finish now ends 19 ms before its apex
  (0.133 rad/s); the full roll's whole-run handover lift is lost again (overlapCorrection 0), the runs kept as a guard.
- **Still open:** the half rolls (C3H w₁/U +3.9 z, L2/L1 1.69 against 2.46, unmoved by the hold); the croqueted ball
  fast in C1F, C3P and C25P (v₂/U +2.4 to +3.3 z) though the ratios hold; the drives (gugan5, ca.A4D); and the
  viewer's map (`public/viewer/defaults.json`, 2026-11-11), stale on every engine since, so its picker plays old holds.

## The half rolls' striker's ball (2026-11-22)

Engine 0.44.0. C3H w₁/U 0.443 against 0.380 (+3.9 z), C10H 0.420 against 0.400 (+1.2 z); L2/L1 1.69 and 1.75 against
2.46 and 2.30 (−1.1, −0.9 z); the coaches' half roll 1.64, inside 1.40–2.50. C3H's w₁/U has read 0.44 on every card
since the baseline. `gapProbe head-speed --half` (new option) and throwaway traces, no engine change:

| Roll | Head after 1 ms | Ball 1 after 1 ms | Face contacts | Head at the read | Ball 1 at the read (Gugan) |
|---|---|---|---|---|---|
| C3H | 0.506 | 0.161 | 0–0.6, 1.2–2.0, 4.7–5.6 ms | 0.357 | 0.443 (0.380) |
| C10H | 0.488 | 0.191 | 0–0.6, 0.9–1.6, 3.4–4.3 ms | 0.354 | 0.420 (0.400) |

- **A third face contact kicks the ball ahead of the head.** The second contact is nearly inelastic along aim
  (C3H head 0.496 → 0.389, ball 0.18 → 0.42): the 24° face drives the ball into the turf, which slows it to 0.32 by
  4 ms. The free head (the half roll's hands give under 0.01 M·U per ms) keeps 0.396, catches it as the turf throws it
  up into the sloping face, and the bounce (normal e 0.83, Gugan's wood) sends it on at 0.444 while the head drops to
  0.357. Along aim that contact's apparent restitution is 1.24: the turf's rebound turned forward by the face.
- **Gugan's figures fit the two leaving together.** With the head's mass 2.20 m and ball 1 sharing the head's speed
  after the second contact, (2.20 × 0.506 + 0.161)/3.20 = 0.398 for C3H and 0.395 for C10H, against his 0.380 and
  0.400; §10 gives the mallet's speed after impact as "essentially the same as for ball 1". In the model ball 1 leaves
  ahead of the head in every roll, by 0.04–0.14 U (`gapProbe w1-trace`, head at the read).
- **No half-roll input or cheap lever closes it** (C3H w₁/U): the half roll's hold firmness 0 → 1, 0.433 → 0.518
  (0.1 played); the descent angle β 2.7–16.8° through the feet, 0.440–0.466 (Gugan's β 13.5°, the model's 9.9°); the
  text book's ratio over drive, push length, hold and feet stays 1.53–1.71. The earlier one-at-a-time map moved it at
  most to 0.416 (faceFriction at its lower bound).
- **An inelastic re-contact is not the fix.** A throwaway face restitution for closures below 1 m/s, 0.05–0.6, does
  bring ball and head together, but in the full and pass rolls the hands then carry the ball: C1F, C3F, C10F, C3P and
  C10P read w₁/U 0.83–1.27, pushes. Gugan's e(U) also gives 0.86 at these speeds, and he finds "no clear evidence" the
  ball and mallet are touching after the first millisecond.
- **Gugan on the half rolls' distances:** the measured and calculated runs agree "not so good for the two
  half-rolls", the balls "not rolling over the same pieces of grass"; C10H's L1 per w₁² is 0.68 of C3H's in his
  table, so its L1 (model +1.9 z) carries that variation.
- **Open.** Ball 1 leaving with the head, as Gugan sees it, needs the second and third contacts' balance changed in
  every roll, not the half roll's settings; it would reopen the full and pass rolls' fit adopted above.

## The stop shots aren't stoppy (2026-11-23)

Engine 0.45.0 (`2026-11-23-half-roll-drive-like`). The user, watching the viewer: "our stop shots aren't very stoppy".
The card agrees: Gugan 5's stop ratio 4.94 against 7.15 (−3.7 z, a miss on every card since the baseline); the coaches'
AC stop 4.13 against 4.10–6.20, at the band's floor. The croqueted ball goes too short for the striker's ball's travel,
or the striker's ball too far. Open; not yet diagnosed.

## The pass roll doesn't pass (2026-11-23)

Engine 0.45.0. The user, watching the viewer: the pass roll "doesn't actually pass". The text book's ratio is 1.05
(coaches' band 0–0.99: the striker's ball should go further than the croqueted ball); the card scores it within
tolerance (z 0.62), which hides the point of the shot. Gugan 4's filmed pass rolls themselves read L2/L1 1.21, 0.94 and
1.15 (C3P, C10P, C25P) and the model matches them (1.09, 1.02, 1.24), so the films are not the lever; the coaches'
definition is.

Diagnosed and fixed (engine 0.46.0, card `2026-11-23-pass-roll-early-push`). The push did nothing: drive 0 to 1, push
length and push gain all left the ratio at 1.052, because the hands' pulse began at contact and the balls part within
about 1 ms. The striker's ball takes four or five taps as it bounces off the turf and the head catches it again over
about 8 ms; a fifth tap adds about 0.15 m/s and turns 1.05 into 0.89, so the ratio jumps between those values rather
than moving smoothly. A stronger hands' push made it worse and rougher. Two grids (lean, feet, onset, window, at powers
0.5–1.1) found one robust plateau: 36° (C3P's lean; was 32°) with the hands' push begun 10 ms before contact over
30 ms (was on time over 60 ms), Riches's "pronounced BUT SMOOTH acceleration" and the user's "start soft and smoothly
accelerating". The early pulse now rides the downswing and its continuation, tilted onto the hands' slope at contact
(was a straight line from the pulse's start, a 0.07 m/s step in the hands' velocity at contact).

Text book on the 10 s lawn: 0.96 at power 0.5, 0.93 at 0.7, 0.97 at 0.9, 0.90 at 1.1, 0.65 at 1.3; coaches' row 0.964
(was 1.05). The pass is real but slight at canonical power (about 10 cm in 3 m). The punch test, expected to fail since
P2b.2b.2b.2b, now passes: 1.7733 against 1.6505 m/s coasting.

Cost: C25P (8.85 m/s) is out of the text book's reach, whose fastest planned contact at 36° is 8.82 m/s, so its rows
score as unplayed (was clean, L2/L1 1.24). At 35° the reach is 8.86 m/s but the canonical pass is 0.99, a pass in name
only. Kept at 36°; the choice is the user's.
