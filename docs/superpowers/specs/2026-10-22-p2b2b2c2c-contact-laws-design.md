# P2b.2b.2c.2c — The Face and Ball–Ball Contact Laws: Touching Balls and the Double Tap: Design

**Product spec:** `2026-09-30-croquet-shot-lab-design.md` §4 (impact phase).
**Strike and turf laws spec:** `2026-10-09-p2b2b2b2a-strike-turf-laws-design.md` (the face's Hertzian law, T(U) and
e(U)).
**Impact spec:** `2026-10-03-p2b1-impact-integrator-design.md` (the linear ball–ball law from a contact time).
**Squeeze spec:** `2026-10-21-p2b2b2c2b-squeeze-design.md` (the step before; its Amendments hold gate A's trace and
the rulings that opened this step).
**Evidence:** `docs/superpowers/probes/2026-10-21-p2b2b2c2b-gate.txt` (sections E, F, I and "gate A's checks").
**Roadmap:** P2 row's P2b.2b.2c.2c entry; "P2b.2b.2c.2b outcomes (2026-10-22)" and its "Carried open items".

**Why this step.** The two filmed croquet strokes with the balls truly touching, Gugan 4's stop shots C3S (U 1.92 m/s)
and C20S (U 5.80 m/s), miss on the model at gap 0, and the 1 mm default gap the last step adopted hides the miss.
Gate A's trace found the cause: the face's Hertz law (Gugan 2000's drop tests on wood) is too compliant and slow
against the ball–ball law, so the croqueted ball pushes the striker's ball back into the face before the face's
restitution completes. The face never lets go, and the three bodies share one long contact. The film shows the face
releasing at 0.65–1.0 ms and tapping again. The drives fail the same way at their 1 mm gaps (C3D: the face's first
contact ends at 2.17 ms by the law against the film's 0.99 ms; no second tap). The last step's rulings, verbatim in its
Amendments: A "Open the face/ball–ball law step (constants from Gugan 4 Tables 1 and 2) before the follow-through"; B
carry "the combined face-plus-ball–ball lead, and the finding that today's ball–ball law reads 0.53–0.61 ms on video
against Gugan's 0.75".

**The user's aim** (2026-10-22, verbatim): "Ultimately, I would like to treat all balls as in contact in a croquet shot
and fix the model so that that works. The one millimetre gap, I think, is a kind of fix, but it's fitting the symptom
rather than the cause. If the data we've got is scientifically accurate and they were definitely "touching" we should
go with that."

**Circularity.** The user's play data and ideas are checks and hypotheses, never fit targets. A law's constants come
from Gugan 4's Tables 1 and 2 (or a written argument), never matched to C3S, C20S or any stroke they are judged on.

**Vocabulary.** As the squeeze spec's: "split", "ratio" and "cut" keep their croquet meanings only; the **gap** is the
balls' separation as set up; the **squeeze** is the stage in which mallet and both balls are loaded together; U, W, w₁
and v₂ are Gugan's. New here:

- **Law time:** a contact's duration in the impact's timeline, while the pair's penetration δ > 0
  (`src/engine/impact/timeline.ts`). Under the force clamp the force can reach zero a little before δ does; where a
  source times the force itself (§5.3), the force-on time is printed beside it.
- **Video time:** the same contact as Gugan's 8,000 fps video would time it: a contact on while the surfaces are within
  `VISIBLE_SHIFT` (0.2 mm) of touching, timed from the first visible movement (`scripts/squeeze.ts`'s
  `freeCollision`, and the gate's section F "video" column).
- **Tap:** a mallet–striker's-ball contact interval; the **double tap** is a second tap within the strike.

## Decisions (user, 2026-10-22)

1. **Housekeeping first, separately.** The npm bumps (`typescript-eslint` 8.71.2 → 8.72.0, `vite` 8.3.4 → 8.3.5,
   `typescript` 6.0.3 → 7.0.2) go in their own small PR that lands before this step's branch is rebased onto `main`.
   TypeScript 7 goes in only if it type-checks and every test passes unchanged; otherwise it is held back with the
   reason (my call). The CI actions and runner are current. As landed (PR #34): `vite` alone; `typescript-eslint` was
   already 8.72.0, and TypeScript 7 is held back, outside the peer ranges of `typescript-eslint` 8.72.0 (< 6.1.0) and
   `svelte-check` 4.7.7 (^5 || ^6).
2. **The hands stay as they are.** The user: the player "times the swing and predicts the strike. Its not purely a
   response to the sensation of impact." The model's hands are all planned (the push, the jab, the grip, the checking
   force), so the anticipation is played. Their effect on the strike is re-measured on the new laws and reported, not
   assumed negligible (§7.6). The user's braking stop ("actively attempt to reverse the swing, slowing the mallet head
   ... This probably begins before contact") goes to the follow-through step ("as planned, in the next step").
3. **Gap 0 is the aim; the gapped strokes stay at their gaps.** The touching stops are judged at gap 0, and the default
   gap returns to 0 once they pass (§3). The filmed gapped strokes stay at their recorded gaps and must still pass
   (user: "yes", to the playback).
4. **The search is built into the step.** Asked what follows if the sourced laws leave the touching stops wrong, the
   user: "Problem with 1 [stop at the gate and report] is that I don't have the answer." So a bounded search runs in
   the step (§4.3), each candidate sourced or argued, and the gate rules on what it finds.
5. **Judge the launch speeds; the release is a check.** The sources disagree on whether touching balls double-tap
   (§5.3). Every source agrees on the speeds the balls leave at. The user: "if that's enough for us to ascertain the
   distance of travel, then probably yes."
6. **Report the double tap, never flag it** (user: "yes, report them, never flag"). §6.
7. **Scope** as played back and accepted (user: "Seems sufficient. Write it up.").

My calls (the user may overrule any of them):

- **The default moves to 0 only if C3S and C20S pass at gap 0.** If they do not, it stays 1 mm and the gate rules.
- **"Within the strike" for the double tap** is a re-contact that begins before the striker's ball and the croqueted
  ball have parted (§6). Every filmed croquet stroke's second tap begins before the balls part (Fig. 4).
- **The face keeps Gugan 2000's e(U)**; only its contact time T(U) is re-set. Table 2's own restitution is recorded
  beside it, not adopted.
- **The tidy is the step's first commit** (§10).
- **The gate has two stages** (§9): the laws are ruled on before anything is measured on them.
- **The hoops and the peg follow the ball–ball time** (§2.2), by their existing derivation.
- **The search's candidates carry fixed constants** (§4.2), and the face's check times the full single-ball stroke
  (§4.1, test 5).
- **The camera threshold is tested for reach, not tuned** (§7.9): ×2 and ×3 of 0.2 mm, for Gugan's "several times".
- **Each source is compared as its instrument saw it** (§5.3): the film through a sampled camera model, the
  electrical-contact studies through the law times.

## 1. Goal and exit criteria

The goal: the model's croquet strike shares speed between the mallet and two touching balls as the film shows, from
contact laws whose constants are Gugan 4's Tables 1 and 2, so that a croquet stroke can be played with the balls
touching.

Exit criteria:

1. **The laws** (§2): the face's T(U) and the ball–ball contact time re-set from Tables 2 and 1, each converted from
   video time to law time by a stated harness, with their analytic cases.
2. **The free collision** (§2.2): Table 1's clean free collisions, timed as the video would, within one frame (0.125 ms)
   of 0.75 ms at 1.90, 5.54 and 7.64 m/s, e 0.72 ± 0.02. The last step's `it.fails` on it becomes a passing test.
3. **The touching stops** (§5): C3S and C20S at gap 0, each within §5.2's uncertainties of its row on v₂/U, w₁/W and
   v₂/w₁; or, if no law the search admits gets them there, the miss goes to the gate.
4. **The gapped strokes** (§5): the means of the eight gapped strokes, and of all ten, within Gugan's uncertainties.
5. **The double tap** (§6): possible fault 29.1.6.1 no longer raised for a re-contact within the strike; each tap
   reported.
6. **The default gap** (§3) ruled at the gate, moved to 0 only per my call above.
7. **The checks** (§7) run and recorded, each to the gate.
8. **Step convergence** (§8.3) re-checked on the new laws.
9. **Every preset's canonical setup** runs from top to finish; no impact ends with the head overlapping a ball as
   handed over; each default plans 3 m/s within 2 %.
10. **The tidy** (§10) done, the pre-flight gate (§9) run and ruled on, the figures recorded (§11), and
    `ENGINE_VERSION` 0.16.0.

## 2. The laws

### 2.1 The face: T(U) from Table 2

Today `faceContactTimeFit` is T = 0.97 ms · (U / 2.19)^−0.23, anchored on Gugan 2000's Table I (a Jaques ball dropped on
wood). The CA's film times the face in single-ball drives shorter (Gugan 4, Table 2, row 4 "Duration of contact, Τh, ms
(± 0.1 ms)", row 7 U):

| | A1D | A2D | A3D | A4D |
|---|---|---|---|---|
| U, m/s | 0.76 | 3.26 | 5.70 | 8.54 |
| Τh, ms (video) | 1.00 | 0.75 | 0.60 | 0.60 |
| Today's law T at U, ms | 1.24 | 0.885 | 0.779 | 0.77 (clamped at 6 m/s's) |

The re-set:

- **The target is video time.** Each column's Τh is what the video saw. The builder plays the face law alone (a free
  head on a free ball, the head's mass the default's, no turf or gravity), timed as the video would, and converts:
  the law's T(U) is set so that its video time matches Table 2. Gate A's trace put the factor at about ×0.74 on today's
  law at 3.26 m/s; the plan states the harness and the builder records the factor at each column.
- **The form** stays T = t0·(U/u0)^q, with q Gugan 2000's −0.23 (his regression, matching Hertz's −0.2), and t0 set on
  A2D (3.26 m/s, the column the last step held as `SINGLE_BALL_FACE`). A1D, A3D and A4D are held out, each reported
  against the law's video time with Table 2's ± 0.1 ms. If the held-out columns miss by more than ± 0.1 ms, the gate
  is told and offered a fit of q to all four columns, whether or not the touching stops pass (my call: anchor first,
  because one anchor keeps Gugan's exponent). If the search runs (§4) and the gate takes the fit, the candidates run on
  it.
- **`contact.json`'s edits:** `faceContactTimeFit` takes u0 = 3.26 m/s and the new t0; its source becomes Gugan 4,
  Table 2 (A2D), with the exponent from Gugan 2000, provenance "derived" (by the harness); `faceBallContactTime`'s
  note, which places 0.8 ms "near 2.83 m/s" on today's fit, is restated on the new one.
- **The clamp** on the face's speed range ([0.5, 6] m/s, shared with e(U)) stays as it is (my call: e(U) is measured
  only to 6 m/s). A1D is compared at its own 0.76 m/s, inside the range; A4D (8.54 m/s), like C10D (7.0 m/s), is
  played on the law clamped at 6 m/s, and its comparison says so.
- **e(U) is unchanged** (my call above). Table 2's implied restitution per column is printed beside the model's
  (a carried probe item from the last step).
- **Table 2's own caveat** is recorded: "Even at 8000 frames per second the duration of contact is hard to measure ...
  its end is often uncertain to a frame or two".

### 2.2 Ball on ball: the contact time from Table 1

Today's linear ball–ball law takes Table 1's 0.75 ms as its law time, and so reads 0.53–0.61 ms on video. The re-set:

- `ballBallContactTime` is set so that `freeCollision`'s video time is 0.75 ms on Table 1's three clean strokes (B4GS,
  B6MS, B5MS at 1.90, 5.54, 7.64 m/s). Gate A's trace put the law time near 0.93 ms. The linear law's video time
  depends a little on speed, so the builder takes the value that minimises the largest miss across the three and
  records each.
- e stays 0.72 (Table 1 row 8's mean). Phase 2's impulsive law is unchanged.
- `contact.json`'s `value` and `bounds` are law times, as every reader takes them (`scripts/impactProbe.ts:120-126`
  feeds them to the engine; `tests/reference/reference.test.ts:166` derives the obstacle's lower bound from them):
  the table's video range [0.5, 0.87] ms is converted by the same harness into `bounds`, and the video figures move to
  the note. Its source stays Table 1, provenance "derived".
- **The hoops and the peg follow** (my call). `ballObstacleContactTime` is derived from the ball–ball time (a ball on
  an immovable body has the two-ball pair's natural frequency; `contact.json`), and the derivation still holds, so it
  takes the new value; `tests/reference/reference.test.ts:162-167` keeps pinning the two equal and its lower bound at
  0.87 × the ball–ball lower bound. The new value lies inside its 1.0 ms upper bound, which rests on the obstacle
  fuzz's penetrations (under 0.06 R): the fuzz is re-run, and a penetration over the bound goes to the gate. Every hoop
  and peg run then moves, listed in the ratchet (§8.2).

### 2.3 Why these two together

The sources agree that whether a striker on two touching balls gives separate collisions depends on the ratio of the
two contacts' stiffnesses (or times) and on the mass ratio, not on the law's shape. Both changes move that ratio the
same way (a quicker face, a slower ball–ball contact):

- Cross, "Physics of Croquet", Eur. J. Phys. 38 014001 (2017), https://oxfordcroquet.org/tech/cross1/: "there are
  effectively two separate collisions when k1 is significantly larger than k2"; otherwise "The three separate
  collisions then merge into one long collision". k1 is the face's stiffness, k2 the ball–ball. His values are
  assumed, not measured, and are not used.
- Jia, Mason and Erdmann, "Multiple impacts: a state transition diagram approach", IJRR (2013): the outcome "depends on
  the stiffness ratio k2/k1 but not on individual values of k1 and k2 ... It depends on the mass ratio m2/m1"; citing
  Brogliato (1999, pp. 306–307).
- Donahue, Hrenya, Zelinskaya and Nakagawa, "Newton's cradle undone", Phys. Fluids 20 113301 (2008) (abstract only):
  a striker on a touching doublet differs qualitatively from a slightly separated one; "a three-body (soft-sphere)
  treatment is essential."

Ruled out by the research (2026-10-22), recorded so that it is not re-tried:

- **The law's shape alone.** Touching balls separate under a linear law as under Hertz; the exponent sets the pulse's
  dispersion, not whether contacts open (Hinch and Saint-Jean, Proc. R. Soc. A 455, 3201 (1999): "all the contacts are
  lost"; Herrmann and Seitz, Am. J. Phys. 50, 977 (1982)).
- **A pulling dashpot.** Both laws already clamp the force at zero (`src/engine/impact/contactLaw.ts:139`, `:374`,
  citing Schwager and Pöschel 2007).
- **Spin, friction, the turf and off-line contact during the strike.** The last step's candidates c and d and the 1-D
  chain (no spin, turf or friction) reproduce the fault.

## 3. The gap

- **Range** unchanged: 0 ≤ gap < 2 mm (`CROQUET_GAP_LIMIT`).
- **Default:** `DEFAULT_CROQUET_GAP` returns to 0 if, and only if, C3S and C20S pass at gap 0 on the laws the gate
  admits (my call). The move is its own commit, last, with its moved runs listed.
- **The small-gap sweep** (the last step's candidate a, 0–0.5 mm finely, and 1, 1.5, 1.9 mm) is re-run on the new laws
  at C3S's and C20S's U and at C1D's, as a recorded check: the film's v₂/U is insensitive to the gap (1.03–1.15 across
  0–6 mm), and the model's sensitivity is the test of the user's earlier "unmeasurable gap" hypothesis. Herrmann and
  Seitz note that "a separation of only 40 µm is sufficient for dispersion-free propagation", so the sweep includes
  0.04 mm. "Touching" on the film means a gap too small for the camera to resolve, so the sweep's 0–0.5 mm is also
  the range of gaps the film cannot tell from 0; the touching stops are reported across it beside their gap-0 result.
  Its runs at C1D's U are §4.1's test 2; one sweep serves both.
- `DEFAULT_CROQUET_GAP` is test support (`tests/engine/support/shot.ts:162`), not engine code; its move bumps no version
  of its own.
- **The tests pinned at gap 0** (`tests/engine/shot.test.ts:372`, `:617`, `:652` and `:655`; `tests/engine/impact/
  handover.test.ts:300`) are re-run at the new default. If it is 0 their pins are removed; their mechanisms are
  re-checked either way and reported.

## 4. The search, if the sourced laws are not enough

### 4.1 The tests

As the squeeze spec's §4.1, on the new laws:

1. C3S and C20S at gap 0 within §5.2's uncertainties.
2. v₂/U across gaps 0–1.9 mm at C1D's U within Table 5's spread (1.03–1.15).
3. The gapped strokes' means within Gugan's uncertainties.
4. Table 1's free collisions, video-timed, within a frame of 0.75 ms, e 0.72 ± 0.02.
5. Table 2's single-ball face times, video-timed, within ± 0.1 ms at A2D, timed in the full single-ball stroke (hands,
   turf and the swung body, as `croquetFitProbe.ts`'s `singleBallTest` plays it), not the free harness that anchors
   t0, so that it is a real check (my call); both times are printed. And the CA's single-ball strokes (the distance
   check, §7.4) within their measurement.
6. Every constant sourced or argued, never matched to C3S or C20S.

### 4.2 The candidates, in order

The step first lands §2's laws and runs the tests. Only if test 1 still fails does the search run, in this order. Each
candidate keeps §2's laws and changes one thing.

- **f. The ball–ball damping's form.** A dissipation that vanishes as the balls just touch (Hunt and Crossley 1975, or
  Kuwabara and Kono's √δ form as the face already uses), its constant set from Table 1's e and video time, the spring
  linear. Rationale: in lossy touching chains "A quasistatic precompression appears behind the primary pulse ... This
  precompression is due entirely to dissipation and does not exist at zero viscosity" (Rosas, Romero, Nesterenko and
  Lindenberg, PRL 98 164301 (2007)); and measured bead damping is not a linear dashpot (Carretero-González et al., PRL
  102 024102 (2009): an exponent "close to α = 1.75"). The last step's candidate e (a Maxwell element) is a different
  form and stays recorded as failed.
- **g. The ball–ball spring's shape.** A Hertz law (F ∝ δ^3/2, the exponent from theory), its constant and damping set
  from Table 1's e and video time. Last, because the research rules the shape out as a cause on its own (§2.3).

The face's exponent is not a candidate: §2.1's fit of q is offered to the gate on its own trigger.

Candidates f and g carry fixed constants, never re-derived per closure from a closing speed (at gap 0 the pair starts
touching with no closing speed). They are set as §2.2 sets the linear law: the values that minimise the largest miss of
the video time across Table 1's three clean strokes, with e held within 0.72 ± 0.02 at each (a fixed-constant
nonlinear damping gives an e that varies with speed, which test 4 judges). My call.

The builder may add a candidate with a physical reason and a source, and records why. None may introduce a gap, a
surface layer or any hidden separation at gap 0 (anti-goal, §12).

### 4.3 The bound

One task in the plan. Every candidate gets the whole battery (§4.1). §2's laws and every candidate run in throwaway
copies and reach the engine only after stage 1 of the gate admits them (§9; as the last step's b and e). If none
passes, the step lands §2's laws if the gate admits them, the default stays 1 mm, and the miss is recorded with each
result. The gate may admit either of §2's laws alone (each rests on its own table); §1's criteria are then judged on
what lands, the other law's criterion is recorded as not met, and the default moves only on the same rule (§3).

## 5. The filmed strokes

### 5.1 How they are played

As the squeeze spec's §5.2: each of Gugan 4's ten Table 5 strokes on its preset at its own U and recorded gap, the
preset's push, no jab, the default mallet; read 1 ms after the latest end of the face and ball–ball contacts beginning
within `STRIKE_WINDOW` (15 ms). C3S and C20S are played at gap 0, every other stroke at its recorded gap, with the
nominal strokes' ±0.5 mm repeats as sensitivity.

### 5.2 Pass

- **The touching stops** (decision 5): C3S and C20S each within its row on v₂/U, w₁/W and v₂/w₁, by the uncertainty of
  each figure computed from Gugan's "precision ... limited to a few percent" on the speeds, taken as 3 % per speed
  (his "about 3% for the speeds", §9.3) and combined in quadrature for each ratio (my call; the last step's §5.3 used
  the means' sem, which no single stroke carries). The plan prints the resulting bands.
- **The means:** v₂/U 1.10 ± 0.02, w₁/W 1.71 ± 0.05, v₂/w₁ 2.07 ± 0.06, over the eight gapped strokes and over all ten.
- **Recorded, not gated:** W/U and the energy kept beside Table 5's; Gugan's "W after the double tap" note (ii).

### 5.3 The release and the timing: a check, with the contrary evidence beside it

Fig. 4's timing is re-run for the six croquet strokes, law and video columns as the last gate's section F. A stroke
whose three bodies stay loaded throughout is reported, not failed (decision 5), because the sources disagree:

| Source | Method | Finding |
|---|---|---|
| Gugan 4 (2009) | the CA's film, 8,000 fps | "all straight two-ball croquet strokes are double taps"; C3S touching shows a release |
| CA, "Croquet Dynamics" (https://oxfordcroquet.org/tech/video/) | the CA team's reading of the same film | "cases where balls started quite close to one another did not show double taps as the mallet and strikers ball were still in contact when contact was made with the second ball" |
| Plummer, "Multiple Taps in Croquet Strokes" (2000), https://oxfordcroquet.org/tech/multiple/ | electrical contact, 5 µs a point; Jaques Eclipse ball, Permali face, carpet | "Single ball strokes and most croquet strokes showed no sign of multiple contacts"; drives 1.3–1.4 ms, stops 1.8–2.0 ms |
| Hall, "When a Mallet Strikes a Ball" (1994), https://oxfordcroquet.org/tech/hall/ | electrical contact | ball 2 leaves "at about 1.8ms. The mallet remained in contact with ball 1 for a further period of 1.1 ms" |

The probe prints the model's figures beside all four, each seen as that source's instrument would see it (my call,
after the user: "the sensitivity of the filming equipment and the speed of the film are all important"):

- **Beside the film rows:** a camera model. Each body's position is sampled at 8,000 fps, at 16 frame phases evenly
  spaced over one frame; a contact is seen while the gap is under `VISIBLE_SHIFT`, and a release only if the gap
  exceeds it on at least one frame. Each tap's time is a frame count, reported as the range over the phases, at 0.2,
  0.4 and 0.6 mm (§7.9). A release the camera cannot see is reported as such, not as no release.
- **Beside Plummer's and Hall's rows:** the law times, unsampled, with the force-on times beside them; their
  electrical contact resolves 5 µs, and a contact is on while the surfaces touch. Plummer's circuit ran at 2.65 V through 82 kΩ. Air does not break down below
  Paschen's minimum of about 330 V, and at 2.65 V current crosses a gap only by field emission or tunnelling, across
  well under a micron even at a rough surface's peaks, so the circuit's threshold is touch itself (my reasoning; Hall
  gives no voltage). Their own departures are recorded beside them instead: 0.02 mm of foil on the face and a graphite coat on Plummer's balls, a Permali face,
  and carpet.

The laws' re-set (§2) keeps the unsampled video time: over a uniformly random frame phase the mean frame count equals
it, so sampling widens the spread (Gugan's "uncertain to a frame or two", already in the ± 0.1 ms band) and moves no
constant.

## 6. The double tap: reported, never flagged

**The Laws** (WCF, Laws of Association Croquet, 7th edition, February 2021, with the Official Rulings and Commentary,
April 2021; still current, Law 29 unamended,
https://worldcroquet.org/wp-content/uploads/2021/04/Laws-Rulings-Commentary-combined-published-master-.pdf):

- 29.2.5: a multiple contact is a fault under 29.1.6.1 "only if the striker or a referee or other person asked to
  adjudicate the stroke, aided by nothing more than spectacles or contact lenses, sees a separation between mallet and
  ball followed by a second contact between them."
- C29.11.1: "High speed photography shows that many croquet strokes, which to human senses are perfectly acceptable,
  have multiple contacts, and contact times considerably longer than single-ball strokes."
- C29.11.2: "a laxer standard is applied to croquet strokes ... The principal target of this fault in croquet strokes
  is 'shepherding', namely guiding the striker's ball with the mallet in a hoop approach after the balls have parted
  contact, or very extreme pass rolls."
- C29.11.3: "slow-motion video recording, in particular, may not be used."
- C28.3.2: balls parting by "a few millimetres at most, potentially making the croquet stroke noisy but not meeting the
  standard required for a multiple contact fault."
- Gugan 5's "Such pushes are of course always faults" is about the later, extended contact he calls a push, not the
  tap within the strike.

**The change** (`src/engine/faults.ts:345-348`):

- In a croquet stroke, or a continuation stroke with the striker's ball touching another, a mallet re-contact that
  begins before the striker's ball and the croqueted ball have parted is within the strike (my call; C29.11.2 places
  the fault "after the balls have parted contact", and every second tap in Fig. 4 begins before the balls part). It is
  never flagged under 29.1.6.1. "Parted" is the end of the first ball–ball interval in the impact's timeline (law
  time, δ-based, not the video's; the Laws judge by eye, so no threshold applies). The pair is the striker's ball and
  the croqueted ball; in a continuation stroke, each ball the striker's ball touches at the start
  (`touchingAtStart`), and the parting is the latest of their first intervals' ends. A re-contact before the balls
  have first met, possible in a gapped stroke, also precedes their parting and is within the strike. A ball–ball
  re-touch after the first interval does not extend the strike (my call: the first parting is the one C29.11.2
  describes). A break in the ball–ball timeline shorter than one frame of the film (0.125 ms, the finest record any
  source gives of balls parting) is not a parting: the intervals either side are one for this rule (my call, after
  the user's "report them, never flag"; a step-scale break is a numerical artefact no eye could see). The timeline
  itself is unchanged, and every such break is reported, with its length, to gate E.
- The 29.2.4.1 exemption filters the face contacts first, as today (`faults.ts:309`). 29.1.6.1 is then raised only if
  a non-exempt contact after the first begins at or after the parting, at that contact's start; its evidence keeps
  today's form (`contactEvidence`: every non-exempt contact counted, every face gap with its clearance) and adds
  the count after the parting.
- The taps within the strike are reported on `FaultReport` (so that §8.2's "only the fault lists move" holds): how
  many, each tap's start and end, and the largest face–ball separation between taps, which is the timeline's existing
  `clearanceAfter` (`impact/types.ts`). The builder names the field; it is a public addition, documented with the
  report's other fields.
- A re-contact beginning after the balls have parted keeps today's possible-fault 29.1.6.1, unchanged, until the
  follow-through step judges such contacts (shepherding, the push, the drive's late catch at about 109 ms).
- 29.1.6.3 (an observable prolonged contact) is unchanged.
- `reference/laws.json` gains 29.2.5 and C29.11.1–3 and C28.3.2 if they are not already quoted; the probe reports the
  tap counts, timings and separations over the preset digest's grid.

## 7. The checks (recorded, not fitted)

Each re-measured on the admitted laws, each to the gate:

1. **Gugan 5's drive and stop** at 3 m/s with Gugan's mallet (2.30 ball masses), across the gaps of §3, at ball–ball e
   0.72 and the 0.772 variant; the stop over the jab 0–8 mm. Against 4.23 ± 0.2 and 7.15 ± 0.6.
2. **The landing and slide-to-roll share** (the last gate's D, "the leading suspect" for the stop's ratio): the
   squared speed ratio as the balls leave beside the distance ratio, for the filmed strokes and §7.1's strokes.
3. **The scatter** (the last gate's E, "consistent but not established"): re-judged by the last step's criterion.
4. **The distance check** (section A): the CA's single-ball strokes, which the face law now moves (a finding, not a
   failure, if within their measurement), and Gugan 5's drive distance at the default gap (5.32 yd at 1 mm against
   about 7 yd), beside the lawn's pace.
5. **Gugan's jab check** (`tests/engine/turfStrike.test.ts`, still `.fails`): its turf-graze qualifier re-examined
   against Gugan 5 at the default gap (gate F's carried item); the grip-limit control run re-run, since the face law
   changes.
6. **The hands' effect** (decision 2): C3S, C20S and C3D played with the hands' coupling as the preset has it and with
   the head free of the hands for the strike's first 5 ms (a throwaway probe variant, not engine code); the
   difference in each judged figure and in the tap timings reported, on today's laws (the user's hypothesis was about
   today's model) and on the admitted ones.
7. **The strike's window** (`STRIKE_WINDOW` 15 ms): re-checked against the moved taps; a test now pins its boundary
   (the last step's carried item).
8. **The effective mass and the AC stop's re-contacts:** re-measured as the last gate's M.3 and M.4.
9. **The camera threshold's reach:** `VISIBLE_SHIFT` is 0.2 mm, Gugan 4's resolution on paper; he writes that in
   practice "the uncertainties of measurement prove to be several times greater than might be hoped", with no figure.
   Both laws are re-set (§2.1, §2.2) at 0.4 and 0.6 mm in throwaway copies, and §1's criteria 3–4 re-judged on them
   (criterion 2 holds there by construction). Reported as whether the touching stops' pass holds; the adopted laws
   stay those set at 0.2 mm.

## 8. Testing

### 8.1 Analytic cases

- **The face's re-set law:** the law played alone reproduces its T(U) at A2D's U to 1e-6 relative; its video time at
  A2D within ± 0.1 ms of 0.75 ms; e(U) unchanged to 1e-12.
- **The ball–ball re-set law:** `freeCollision`'s video time within a frame of 0.75 ms at Table 1's three clean speeds,
  e 0.72 to 1e-9; the last step's `it.fails` removed.
- **The double tap:** on constructed timelines, a re-contact before the balls part is reported and not flagged; one
  after is flagged as today; a single-ball stroke's 29.1.6.2 unchanged; a continuation stroke touching two balls
  parts at the later first interval's end; a first ball–ball interval broken for one step is not a parting, and a tap
  after the break is reported, not flagged; a break of one frame or longer is a parting, and a tap after it is
  flagged; an exempt contact is filtered before the rule applies.
- **Any admitted candidate** brings its own cases, including bit-identity when switched off.

### 8.2 The ratchet

The preset digest (a throwaway script, rebuilt from the 2026-10-21 plan's Task 1 Step 3 against a baseline worktree
with its own `npm ci`), `impactDigest`, `shotMix` and `impactProbe`:

- **after the tidy:** bit-identical;
- **after the double tap's reporting:** bit-identical in every physical figure; only the fault lists move, each listed;
- **after each law:** every run with a face or ball–ball contact is expected to move; the moved runs are counted per
  preset and the unmoved ones (no contact) checked bit-identical;
- **after the default's move**, if it moves: the croquet runs, counted per preset.

### 8.3 Step convergence

The judged figures (§5.2's, §7.1's ratios) across dt/2, dt and 2·dt, each spread under a tenth of its tolerance, as
the last step's §6. A miss is a finding for the gate, not a reason to change the step without a ruling.

### 8.4 The existing tests

All pass, or each change is explained in its commit. Tests whose figures the laws move are re-baselined with the old
and new figures in the commit message, never loosened.

## 9. The pre-flight gate

Two stages (my call), so that nothing downstream runs on a law the user has not admitted. Each section goes to the
user with pros, cons and a recommendation, one question at a time; each ruling is recorded verbatim in this design's
Amendments. The plan stops for each stage.

**Stage 1, the laws** (run after §2's laws are measured in a throwaway copy and, if test 1 fails, after the search):

- **A.** The laws (§2): the conversion factors, the held-out Table 2 columns, the free collisions.
- **B.** The touching stops and the means (§5.2), and the timing beside the contrary sources (§5.3).
- **C.** The search (§4), if run: each candidate's result, and whether any lands.

The admitted laws then land in the engine with their analytic cases and the ratchet; "the admitted laws" everywhere
else in this design means stage 1's ruling.

**Stage 2, the consequences** (run on the admitted laws):

- **D.** The default gap (§3), the sweep and the pinned tests. The default's commit follows this ruling.
- **E.** The double tap's reporting (§6): counts and timings over the grid; any re-contact still flagged.
- **F.** The checks (§7). Those that carry a ruling go one at a time: §7.1's drive and stop at e 0.72, §7.4, §7.5,
  §7.6, §7.7 and §7.9. The carried diagnostics (§7.1's 0.772 variant and jab sweep, §7.2, §7.3, §7.8) are recorded and
  put as one batch; the user may take any of them singly.
- **G.** The ratchet's moved runs and the convergence (§8.2, §8.3).

## 10. The tidy (first commit)

From the last step's final review and carried items:

- `meansOf` (`scripts/ratioFit.ts`): make the counted stroke set explicit, so a convergence spread never compares
  different sets.
- `readTimeOf`: judge `open` on face and ball–ball intervals alike.
- The Gugan-mallet cache, held twice (`ratioFit.ts` `guganStrokes`; `croquetFitProbe.ts` `GUGAN_MALLETS`/`guganPlayed`):
  move it into `gugansMallet`.
- `leanOf`, held twice (`ratioFit.ts`, `ratioFit.test.ts`): export one. `scripts/strokeProbe.ts`'s `leanOf` measures
  a different lean (the head's against an aim) and stays.
- The probe's two worlds (`defaultWorld()` and `fitWorld(TODAY)`): use one, so identity-keyed caches solve once.
- `reference/sources/README.md`: the new sources (Cross 2017, Sutherland 1995, Hall 1994, Plummer 2000, the CA's
  "Croquet Dynamics", the WCF Laws 2021, and the physics papers cited in §2.3 and §4.2), each with URL, fetch date and
  SHA-256 for the pages fetched, and short annotated quotes; cite, never mirror.

Every run bit-identical after it (§8.2).

## 11. Recorded figures

Into the roadmap's "P2b.2b.2c.2c outcomes", with the dated probe file:

- the laws' constants, the conversion factors and the held-out columns;
- the free collisions;
- each filmed stroke and the means, and the timing beside the four sources;
- the search's results, if run;
- the default gap, the sweep and the pinned tests;
- the double taps' counts, timings and separations;
- each check of §7;
- the ratchet's moved runs, the convergence and the cost (`shotMix`).

The roadmap's P2 row: P2b.2b.2c.2c as delivered; P2b.2b.2c.2d (the follow-through) gains the user's braking stop
(decision 2) and the judging of re-contacts after the balls part (§6). "Provisional numbers" updated for the face's
T(U), `ballBallContactTime` and the default gap.

## 12. Non-goals and anti-goals

**Anti-goals** (a failure even if the code works):

- Passing at gap 0 by hiding a separation anywhere in the model (a surface layer, an offset, a contact threshold): the
  1 mm fix by another name.
- A constant matched to C3S, C20S or any stroke it is judged on.
- Changing `VISIBLE_SHIFT` or the uncertainty bands to make a figure pass.

**Out of scope:**

- The follow-through, the braking stop, the shepherding and push judgement: P2b.2b.2c.2d.
- The lawn's pace (not tuned), the pressed-in croqueted ball, ball-make presets (P3).
- Phase 2's impulsive ball–ball collision.
- A ball–ball e(U): no source measures it (Oxford Croquet's open-problems page: "We lack the coefficient of
  restitution (CoR) for a ball hitting a ball").
- The fitter, which stays dormant.

## Amendments

- **2026-10-22, spec review** (subtraction and completeness lenses; folded in above): law time defined as the
  timeline's δ-based interval; §6's parting pair for continuation strokes, the 29.1.6.1 evidence, the exemption's
  order, the report's home (`FaultReport`) and the one-step break stated, with analytic cases; `ballBallContactTime`'s
  bounds are law times; the reference test's path corrected; the fifth gap-0 pin (`shot.test.ts:655`) added; the
  face's q fit offered on its own trigger, so candidate h is removed; either law may land alone; `contact.json`'s face
  edits listed; §7.6's free head is a throwaway variant; §7.9 judges criteria 3–4; gate F batches the carried
  diagnostics.
- **2026-10-22, after the review:** a ball–ball break shorter than one film frame (0.125 ms) no longer counts as the
  balls parting (§6, §8.1). Counting a one-step numerical break as a parting would have flagged taps the user asked to
  be "report[ed], never flag[ged]".
- **2026-10-23, gate stage 1** (rulings verbatim as the option chosen; figures in
  `docs/superpowers/probes/2026-10-22-p2b2b2c2c-laws.txt` and
  `docs/superpowers/probes/2026-10-23-p2b2b2c2c-investigation.txt`):
    - **A1, the conversion convention: "From first touch (Recommended)".** Gugan 4's Fig. 4 times every event from the
      mallet's first contact, so the video clock starts at first touch: the surfaces within `VISIBLE_SHIFT`,
      extrapolated back at the closing speed. This amends the meaning of "video time" and supersedes the Vocabulary's
      "timed from the first visible movement". The Vocabulary's law time point is also corrected: a law's parameter T
      (`contact.json`'s times, `lawFromContactTime`, `closeFace`) is the force-on duration; δ > 0 lasts longer under
      the clamp. Both laws were re-converted and the copies rebuilt before admission was ruled on.
    - **A2, the face's q: "Keep q −0.23 (Recommended)".** The face's t0 is 0.579 ms at u0 3.26 m/s. A1D's +0.42 ms
      held-out miss is recorded as a threshold effect (0.76 m/s); the q fit (+0.12, the wrong sign for Hertz) is not
      taken.
    - **A3, admission: "Both laws (Recommended)".** Face t0 0.579 ms at u0 3.26 m/s, q −0.23; `ballBallContactTime`
      0.551 ms, its bounds [0.319, 0.662] ms; the obstacle follows. Figures that went with it: Table 1 within a frame;
      Table 2's A2D 0.761 ms in the full stroke; obstacle fuzz 0.030 R; the gapped v2/w1 mean 1.987 missing its
      sem.
    - **B, the touching stops: "Pause for an investigation".** C3S and C20S still miss at gap 0 on every law, so
      nothing landed until the cause was found.
    - **After the investigation: "Record and land (Recommended)".** Root cause: matched face and ball–ball time scales
      at gap 0 give a three-body push; hands, turf and effective mass are ruled out, and the bare chain alone gives
      v2/U 1.21. Gate C is settled: no search candidate lands (f and g's figures are recorded in the laws probe). The
      default gap stays 1 mm. The touching stops are carried with the mechanism, and Hall's 1.8 ms touching-pair
      contact as the lead. A law soft at first touch and stiff later would sit close to §12's surface-layer anti-goal.
