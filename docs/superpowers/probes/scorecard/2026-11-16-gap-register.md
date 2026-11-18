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
