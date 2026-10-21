# P2b.2b.2c.2b — The Croquet Stroke's Squeeze: the Balls' Gap, Touching Balls and the Filmed Strokes: Design

**Product spec:** `2026-09-30-croquet-shot-lab-design.md` §4 (impact phase).
**Strike and turf laws spec:** `2026-10-09-p2b2b2b2a-strike-turf-laws-design.md` (the face's Hertzian law, T(U) and
e(U)).
**Impact spec:** `2026-10-03-p2b1-impact-integrator-design.md` (the linear ball–ball law from a contact time).
**Croquet-fit spec:** `2026-10-19-p2b2b2c2-croquet-fit-design.md` (the step before; its Amendments divide the fit off
to this step).
**Evidence:** `docs/superpowers/probes/2026-10-20-p2b2b2c2-drive-double-hit.md` (the drive's late catch).
**Roadmap:** P2 row; "P2b.2b.2c.2 outcomes (2026-10-20)" and its "Carried open items"; "Provisional numbers".

**Why this step.** The fit of P2b.2b.2c.2 did not converge. The brainstorm of 2026-10-21 found why. The model's
croquet stroke, with the balls touching, loads the mallet and both balls together for the whole strike, and the
croqueted ball leaves too fast. The figures are from the canonical drive at 3 m/s with no push after contact
(`guideEffort` 0, so no late catch):

- **Leaving the face** (≈1.5 ms): the striker's ball 1.618 m/s, the croqueted ball 3.763 m/s, the mallet 0.80 m/s.
  The croqueted ball's speed over the mallet's at contact is **1.25**. Gugan 4's ten filmed two-ball strokes give
  **1.03–1.15** (mean 1.10 ± 0.02). The striker's ball's figure is in range.
- **The squared speed ratio as the balls leave is 5.41**; the final distance ratio is 5.01. The lawn takes off about
  7 %: the striker's ball loses more on its landings, then less on its way from sliding to rolling. So lawn pace still
  cancels to first order, as P2b.2b.2c.2 ruled.
- **Timing:**
  - *Model:* the face–ball contact runs 0.010–1.505 ms and the ball–ball contact 0.015–1.375 ms. All three bodies are
    loaded together.
  - *Film (Gugan 4, Fig. 4):* the croqueted ball is first seen moving 0.5–0.6 ms after the mallet touches. The
    mallet's first contact ends at 0.65–1.0 ms. The croqueted ball leaves at 1.2–1.4 ms. The mallet's second tap runs
    to about 1.7–2.6 ms. These are three mostly sequential contacts.
- **What decides it.** A standalone 1-D chain reproduces the engine: 1.60 and 3.78 m/s, against the engine's 1.62 and
  3.76. The chain is a point-mass mallet with the face's Hertz law and the linear ball–ball law. It shows:
  - The squeeze depends only on the ratio of the face's contact time to the ball–ball contact time.
  - The law's shape (linear or Hertz), the head mass and the restitutions matter far less. Losing energy only in the
    rebound makes it worse.
  - **A gap separates the hits.** At 1 mm the croqueted ball leaves at 1.12–1.13 × U, the striker's ball at
    1.74–1.76 × the mallet's speed after, the squared speed ratio is 4.05–4.21 and the energy kept 0.74, all in line
    with the film. At 0.25–0.5 mm the figures are worse than touching.
  - **A soft ball–ball surface layer does not work.** To reproduce the filmed figures it needs about 1 mm. At that
    depth a free collision at 1.90 m/s lasts 1.2 ms even as the video would time it, against Gugan's measured 0.75 ms
    (Table 1). It contradicts a direct measurement.
- **The gap is real in play.** The CA's "nominally in contact" strokes were measured apart: C1D, C3D and C10D at 1 mm,
  C10S at 0.5 mm (Gugan 4, Table 5, row 2 and note (i)). The user: "There is an eternal problem when setting up the
  croquet shot in actually getting the ball to rest touching each other."
- **Not explained:** the two filmed stops recorded as truly touching, C3S and C20S, still behaved sequentially.

These were throwaway diagnostics (evidence only; nothing in the repo changed). The figures are quoted here and are
re-measured by this step's probe (§9).

**Circularity.** The user's play data are checks, never fit targets (roadmap, 2026-10-08). Nothing in this step is
fitted. The gap's default is measured (§3). Gugan 4's filmed strokes are the impact's yardstick (§5), and Gugan 5's
distance ratios the end-to-end check (§7.2). A candidate in the search (§4) may carry a constant only if it is sourced
or fixed by a written argument, never by matching the filmed strokes it is judged on.

**Vocabulary.** "Split", "ratio" and "cut" keep their croquet meanings only: a ratio is the croqueted ball's distance
over the striker's ball's. Other terms:

- The **gap** is the balls' separation, surface to surface, as set up.
- The **squeeze** is the strike's stage in which the mallet, the striker's ball and the croqueted ball are all loaded
  together.
- U is the mallet's speed at contact and W its speed after its last contact with the striker's ball. w₁ is the
  striker's ball's speed after the strike and v₂ the croqueted ball's (Gugan's notation).

## Decisions (user, 2026-10-21)

1. **Scope.** This step gets the impact right, then the end-to-end checks. The follow-through moves to the next step
   (user: "that division suits, keep the follow-through for next step"). Until then the drive in ordinary play keeps
   today's full push (`guideEffort` 1) and its late catch.
2. **Find the excess before the follow-through** (user: "start by finding where the extra ratio between about 3.9 and
   5.0 comes from, before the follow-through work"). Found: the squeeze, above.
3. **Judge against the filmed strokes** (user: "yes, judge against the filmed strokes"). Gugan 4's Table 5 speeds as
   the balls leave the face are the impact's yardstick. Gugan 5's distance ratios are the end-to-end check.
4. **Like for like.** Gugan 5's strokes are played with his equipment and his balls' figure noted beside it. The
   model's own mallet is never changed to suit a source (user: "agree", to the proposal). His drive is played with no
   push after contact: his players were "trying not to exert any extra force on the mallet shaft".
5. **The gap is a set-up input.** The user: "The gap will always be small < 2mm. On occassion the lawn will assist and
   the balls will be touching." So the gap runs from 0 to under 2 mm.
6. **The gap, plus a search for what keeps truly touching balls apart** (user: "2", choosing between "the gap only",
   "the gap plus a further search" and "the soft layer with the free-collision check relaxed"). The soft layer is set
   aside: it contradicts Gugan's free-collision times.
7. **The scatter is a check.** The user: "these fractional variations in setup may account for some of the
   unexplained variance." Whether the gap's range reproduces Gugan 5's scatter is checked, never fitted (§7.3).
8. **The pressed-in croqueted ball is a later item.** The user described pressing the croqueted ball into the lawn,
   "perhaps even with the foot", to keep the balls together. Nothing here measures it; it goes to the roadmap.

My calls (the user may overrule any of them):

- **The default gap is 1 mm** in the canonical setups and the preset digest. It is the CA's measured gap for its
  nominally touching drives, and matches the user's account. A gap of 0 stays available.
- **The ball–ball contact time stays at Gugan's 0.75 ms** and is no longer a fit candidate. Gugan 4's Table 1
  measures balls that started 13–33 mm apart, a free collision, which is what the law describes. Its 0.50 and 0.87 ms
  readings are double taps by Gugan's own account.
- **The hands' parameters are not fitted in this step:** `handCouplingPeriod`, `handCouplingDampingRatio`, `armMass`,
  `reachSlack` and the grips. They barely touch the strike's first few milliseconds. If the end-to-end checks miss,
  the gate (§10) brings the miss to the user. No parameter is moved to close it without a ruling.
- **Gugan's 2.30 lb is an effective mass.** He found it "by taking moments about its point of balance", and calls it
  "the relevant mass for the analysis". So his strokes are played with the swung body's effective mass at the face
  centre equal to 2.30 ball masses. That is a little lighter than the model's 2.45. It is set through the shot's
  mallet profile (`profile.mallet.headMass`, `src/engine/swing/types.ts:125`), solved so that the measured effective
  mass equals 2.30·m. No engine change is needed, and the default mallet is untouched.
- **Every speed is read as Gugan read his:** "a few milliseconds after impact". The reading is taken 1 ms after the
  mallet's last contact with the striker's ball ends, and is reported with the time it was taken. A stroke with no
  second tap reads its figures the same way. A stroke whose mallet contact is still open at 5 ms after first contact
  is flagged and reported apart; it is not counted in the means.

## 1. Goal and exit criteria

The goal: the model's croquet strike shares speed between the mallet and the two balls as the filmed strokes do, with
the result independent of the step size; then the end-to-end checks against Gugan 5.

Exit criteria:

1. **The gap**: a croquet stroke can be set up with the balls 0 to < 2 mm apart, default 1 mm (§3). The ratchet is
   bit-identical at gap 0 for every existing run (§8.2) before the default moves.
2. **The search** (§4) is run, each candidate's result recorded, and any survivor ruled on at the gate before it lands
   in the engine.
3. **Step convergence**: every figure §5 and §7 use converges across dt/2, dt and 2·dt (§6).
4. **The filmed strokes** (§5): played at their recorded gaps, the means of the counted strokes' figures fall within
   Gugan's stated uncertainty, or the miss goes to the gate.
5. **The checks** (§7) are run and recorded:
   - the filmed timing;
   - Gugan 5's drive and stop across the gap's range;
   - the scatter;
   - the distance check;
   - Gugan's jab and the grip-limit control run;
   - the AC stop's face re-contact;
   - the effective mass.

   None is gated by a figure. Each goes to the gate (§10).
6. **Every preset's canonical setup** runs from top to finish as P2b.2b.2c.2's. No impact ends with the head
   overlapping a ball as handed over. Each default plans 3 m/s within 2 %.
7. **The tidy** (§11) is done, the pre-flight gate (§10) is run and ruled on, the figures are recorded (§12), and
   `ENGINE_VERSION` goes to 0.15.0 if the engine changed.

## 2. Architecture

- **The gap needs no engine change.** A `ShotSetup` places balls by position. The gap is a set-up choice, made in the
  test support and in the scripts:
  - `canonicalSetup`'s croquet branch (`tests/engine/support/shot.ts:202-226`) today throws for a croquet stroke given
    a gap; it gains the gap.
  - The impact already accepts balls that start a gap apart with the face touching the striker's ball, as for the GC
    stop's target.
- **The search** (§4) runs in throwaway scripts and a probe section. A candidate reaches the engine only after the
  gate rules it in. If one does, it lands with its own analytic cases and the ratchet (§8).
- **The filmed strokes are sourced data.** Gugan 4's Table 5 is held as figures with their row and column quoted.
  That means cite, don't mirror: figures and annotated quotes, never the page.
- **The tooling** extends `scripts/ratioFit.ts` (its evaluator gains the gap, the read-out of §5.2 and the
  effective-mass override) and `scripts/croquetFitProbe.ts`.

## 3. The gap

- **Range:** 0 ≤ gap < 2 mm for a croquet stroke (decision 5). The test support takes the gap as an option and throws
  outside the range.
- **Default: 1 mm** (my call above). It moves in its own commit, after the option lands at default 0 with the ratchet
  bit-identical. The default's move is then the only change in that commit, and its moved runs are listed.
- **Geometry:** the croqueted ball lies along the line of the croquet stroke at 2R + gap from the striker's ball's
  centre, as the GC stop's target already does (`shot.ts:225-226`). The pass roll's 20° placement keeps its angle,
  and every other placement rule stays as it is.
- **A gap changes nothing until contact.** With a gap the striker's ball must travel the gap before the ball–ball pair
  closes. The re-entry guard and the ball–ball pair's closure behave as for any separated pair.

## 4. The search: what keeps truly touching balls apart

C3S and C20S started touching (Table 5, row 2: separation 0, without note (i)'s asterisk) and still behaved
sequentially. Their figures:

| Stroke | v₂/U | w₁/W | v₂/w₁ |
|---|---|---|---|
| C3S | 1.15 | 1.73 | 2.27 |
| C20S | 1.09 | 1.61 | 2.17 |

### 4.1 Each candidate must pass all of these

1. At gap 0, C3S and C20S, each at its own U, give v₂/U, w₁/W and v₂/w₁ within the uncertainties of §5.3.
2. Gugan's free collisions (Table 1) keep e = 0.72 ± 0.02. Their contact time stays within one frame (0.125 ms) of
   0.75 ms at 1.90 and 7.64 m/s, timed as the video would time it: from the croqueted ball's first visible movement,
   and the builder fixes and records the visibility threshold.
3. The single-ball strokes are unchanged within their measurement: Gugan 4's Table 2 (A1D–A4D, the face's contact
   time and restitution) and P2b.2b.2c.2's distance check.
4. The gapped strokes of §5 stay within their uncertainties.
5. Every constant is sourced, or fixed by a written argument, never matched to C3S and C20S.

### 4.2 The candidates

These are the starting list. The builder may add any with a physical reason, and records each.

- **a. Resolution of "touching".** Table 5 resolves separations to 0.5 mm. If C3S's and C20S's "0" may hide a gap
  under 0.5 mm, does any gap in 0–0.5 mm reproduce them? The chain says 0.25–0.5 mm is worse than touching; the
  engine re-measures it, finely.
- **b. The face in a squeeze.** The face law is fitted to drop tests of a Jaques ball on wood (Gugan 2000: 0.90 ms at
  2.78 m/s). Gugan 4's video gives the face's contact in single-ball drives as 0.75 ms at 3.26 m/s (Table 2). Gugan
  5's mallet was "hard-faced". Does a face law consistent with the video and a hard face change the squeeze, and in
  which direction?
- **c. The balls resting on the turf.** The croqueted ball sits in the turf bed. Do the bed's support and friction
  through the first 0.5 ms delay its response enough to separate the hits? The engine includes the turf; the chain
  doesn't, yet they agree, which suggests not. Re-measure with the turf's terms reported separately.
- **d. Off-line contact.** The face meets the striker's ball off its centre line and lifts it ("uppish"), so the
  ball–ball contact is not collinear with the strike. Does the 3-D geometry, the striker's ball's rise and its spin
  change the sharing? The engine is 3-D, but the canonical drive's striker's ball rose only 0.1 mm by 1.5 ms.
- **e. Rate-dependent ball–ball dissipation.** A viscoelastic law whose loss depends on the rate, with Table 1's free
  collisions held. The chain's rebound-only loss made it worse; this is the remaining dissipation form.

### 4.3 The bound

The search is one task in the plan, with a fixed list. Each candidate gets one run of the tests in §4.1, and the
results go to the gate (§10, section B). If no candidate passes, the step carries on with the gap alone, and C3S and
C20S are recorded as unexplained, with each candidate's result. If one passes, the user rules on whether it lands in
this step.

## 5. The filmed strokes

### 5.1 The yardstick: Gugan 4, Table 5

Ten two-ball strokes filmed at 8,000 frames a second ("averages taken a few milliseconds after impact ... their
precision is limited to a few percent"). Per stroke, from the table:

- the mallet speed U (row 1);
- the separation in mm (row 2), with its note (i) for the strokes "nominally in contact, but ... in fact clearly
  separated";
- W, the mallet "after the double tap" (row 5);
- w₁ (row 6) and v₂ (row 9).

The strokes are B2GS, B1GS, B1MS and B2MS (close scatter shots, separated 6, 1, 2 and 6 mm), C3S, C10S and C20S
(stop-shots) and C1D, C3D and C10D (drives). Gugan's summary (§9.3):

- v₂/U "approximately constant at 1.10 ± 0.02 (sem)";
- w₁/W "the mean from all ten measured values of the ratio is 1.71 ± 0.05";
- v₂/w₁ "the mean value of the ratio, 2.07 ± 0.06".

The builder fetches Gugan 4 afresh, records its URL, date and SHA-256 in `reference/sources/README.md`, and quotes
each row used.

### 5.2 How each stroke is played and read

- **Each stroke on its own preset**, planned at its own U (`strokeFor`) and at its recorded gap:
  - drives on the drive preset;
  - stop-shots on the AC stop preset;
  - close scatter shots on the single-ball preset, with the second ball placed at the recorded gap as the GC stop's
    target is.
- **Gaps:** each stroke is played at its recorded value. The "nominally in contact" strokes are rounded to 0.5 and
  1 mm, so they are repeated at ±0.5 mm. The 6 mm scatter shots are outside a croquet stroke's 2 mm range, but they
  are two-ball collisions and count for the impact.
- **The mallet is the model's default.** The CA's mallet is not recorded. By momentum the filmed mallets acted like
  2.30–2.41 ball masses, against the model's 2.45. The effective mass is re-measured and recorded beside them (§7.7).
- **The read-out** is as decided above: 1 ms after the mallet's last contact with the striker's ball ends. Per stroke
  it gives:
  - v₂/U;
  - w₁/W;
  - v₂/w₁;
  - W/U;
  - the energy kept, (k·W² + w₁² + v₂²)/(k·U²), with k the effective mass over the ball's.

### 5.3 Pass

The counted strokes' means within Gugan's uncertainties: v₂/U 1.10 ± 0.02, w₁/W 1.71 ± 0.05 and v₂/w₁ 2.07 ± 0.06.
W/U and the energy kept are recorded beside Table 5's own values, which the brainstorm's arithmetic puts at about
0.30 and 0.75; they are not gated. Each stroke's figures are listed against its own row. Today's C3S and C20S, played
touching, are expected to miss unless the search finds their cause. Whether the means pass with them counted is
reported both ways.

## 6. Step convergence

Today the drive's ratio is 3.31, 3.48 and 3.47 at 5, 2.5 and 10 µs, with a stick/slip branch of the face–ball
tangential law on a contact's entry step (roadmap, carried items). This step requires:

- Every figure §5 and §7 use changes across dt/2, dt and 2·dt by less than a tenth of its own tolerance. The ratios
  use Gugan 5's (0.02 on the drive, 0.06 on the stop); the speeds use Gugan's uncertainties for the means. This is my
  call.
- The cause of today's non-convergence is found and fixed, not hidden by a smaller default step. If the default step
  must change, the cost is recorded (`shotMix`), and the gate rules.
- The convergence is re-checked at the default gap, and with any candidate the gate admits.

## 7. The checks (recorded, not fitted)

### 7.1 The filmed timing

For C3S, C20S (touching) and C1D, C10S, C3D and C10D (recorded gaps), from Gugan 4's Fig. 4:

- when the croqueted ball first moves;
- when the mallet's first contact ends;
- when the croqueted ball leaves;
- the mallet's second contact.

The figure's readings are the research agent's, made from the image: ±0.5 frame on top of Gugan's own "a frame or
two". So the builder re-reads Fig. 4 and records both. A stroke in which all three bodies stay loaded throughout
fails this check even if its speeds pass.

### 7.2 Gugan 5's drive and stop, across the gap

- **The drive:** at 3 m/s, with no push after contact (`guideEffort` 0) and Gugan's effective mass (2.30 ball
  masses, my call above), at gaps 0, 0.25, 0.5, 1.0, 1.5 and 1.9 mm. The ratio against 4.23 ± 0.2.
- **The stop:** the AC stop at 3 m/s, with Gugan's jab (`stroke.jab`) and the same effective mass, at the same gaps.
  Against 7.15 ± 0.6.
- **The balls:** Gugan's Dawson Internationals rate e = 0.772 by the maker's bounce test, against the model's
  ball–ball 0.72 from the CA's video. The model's value stays. The runs are repeated at 0.772 and recorded beside the
  others, never adopted.
- **Reported:** whether each target is reachable within 0–2 mm, and where. A miss goes to the gate; it is not gated.

### 7.3 The scatter

The drive's ratio over the gap's range against Gugan 5's standard deviation of single strokes (0.6), and the stop's
against "about ± 2.0". Recorded with the spread the gap alone produces. Whether set-up explains the variance is the
user's hypothesis, and this is its test.

### 7.4 The distance check

P2b.2b.2c.2's section A, re-run unchanged: the CA's single-ball strokes. The gap does not touch them, nor should any
admitted candidate; if one does, that is a finding.

### 7.5 Gugan's jab and the grip-limit control run

Re-run at the default gap (`tests/engine/turfStrike.test.ts:131`, `:90-109`). The jab stays `.fails` unless it now
passes. The weak stroke stopped dead stays `it.todo`. Neither is changed without a ruling.

### 7.6 The AC stop's face re-contact

Whether the AC stop has a face-region re-contact that `impact-off-face` doesn't flag (it reports only off-face
regions). Every face–ball interval on the AC stop's canonical run and its digest grid is listed, with its region.

### 7.7 The effective mass

Re-measured on the drive's canonical setup and with Gugan's effective mass, against ruling D's 0.9·m ≤ m_eff ≤ M, and
against the filmed strokes' 2.30–2.41.

## 8. Testing

### 8.1 Analytic cases

- **The gap:** a croquet setup at gap g places the balls 2R + g apart, centre to centre, along the croquet stroke's
  line. It throws at g < 0 or g ≥ 2 mm. The default is 1 mm.
- **The effective-mass override:** the solved head mass gives the swung body's effective mass at the face centre
  within 1e-6 of 2.30·m, and leaves the default profile untouched.
- **The read-out** (§5.2): on a constructed impact with a known last face contact, the figures are read 1 ms after it.
- **Step convergence** (§6) as tests on the drive and the AC stop. Slow ones go behind `SLOW_TESTS`.
- **Any admitted candidate** brings its own analytic cases, including bit-identity when it is switched off.

### 8.2 The ratchet

The preset digest, `impactDigest`, `shotMix` and `impactProbe` must be bit-identical (timing lines apart) in these
cases:

- **after the gap option**, at gap 0;
- **after any step-convergence fix**, except the runs it moves, each listed;
- **after the default gap's move to 1 mm**, except the croquet-stroke runs, each listed and counted per preset;
- **after any admitted candidate**, except the runs it moves, each listed.

### 8.3 The canonical runs

Every preset's canonical setup from top to finish at the default gap, as P2b.2b.2c.2's §8.3.

### 8.4 The existing tests

All pass, or each change is explained in its commit. The deferred entry-point tests for `ballBallContactTime` and
`armMass` (P2b.2b.2c.2's final review) are added.

## 9. The probe

`scripts/croquetFitProbe.ts` gains sections for:

- §4: each candidate against §4.1's tests;
- §5: each stroke's figures against Table 5's, and the means;
- §6: the convergence table;
- §7.1–§7.7.

Its output is committed as a dated probe file under `docs/superpowers/probes/`. The probe also re-measures the
brainstorm's diagnosis at gap 0, so that the design's figures above stand on a committed run:

- the speeds as the balls leave;
- the 7 % lawn share;
- the contact intervals;
- the contact-time sweep;
- the gap sweep from 0 to 1.9 mm.

## 10. The pre-flight gate

Run once the filmed strokes and the checks are in. Each section goes to the user with pros, cons and a
recommendation, and each ruling is recorded verbatim in the design's amendments. Sections:

- **A.** The filmed strokes (§5): each stroke and the means, with C3S and C20S counted and not.
- **B.** The search (§4): each candidate's result, and whether any lands.
- **C.** Step convergence (§6), and any change of the default step with its cost.
- **D.** Gugan 5's drive and stop across the gap (§7.2), at 0.72 and 0.772. If either misses everywhere in 0–2 mm,
  the options (the hands' parameters, the stop's check, accept and record) go to the user here.
- **E.** The scatter (§7.3).
- **F.** The distance check, the jab, the control run, the AC stop's re-contact and the effective mass (§7.4–§7.7).
- **G.** The ratchet's moved runs (§8.2), and the default gap's effect on every preset.

## 11. The tidy (first commit)

From P2b.2b.2c.2's final review:

- `scripts/fitRatios.ts`: `parseCandidate` accepts an extra "=" and empty range parts. It should reject both.
- `scripts/fitRatios.ts` exits 0 when it can only report the closest point. It should exit non-zero.
- Section C's linear "reachable" verdict isn't flagged when a candidate's sweep jumps. It should be flagged, or the
  section retired if nothing uses it now that nothing is fitted.

## 12. Recorded figures

Into the roadmap's "P2b.2b.2c.2b outcomes", with the probe file:

- the default gap and its source;
- each candidate's result;
- the per-stroke and mean figures against Table 5;
- the timing;
- the convergence table;
- Gugan 5's drive and stop across the gap at both restitutions;
- the scatter;
- the distance check;
- the jab and the control run;
- the AC stop's re-contacts;
- the effective mass;
- the ratchet's moved runs;
- the cost (`shotMix`).

The roadmap's P2 row is updated: P2b.2b.2c.2b as delivered, a new **P2b.2b.2c.2c** for the follow-through (§13), and
P2b.2b.2c.3 unchanged. "Provisional numbers" is updated for the ratio tolerances' outcome.

## 13. Out of scope

- **The follow-through: P2b.2b.2c.2c.** The four follow-throughs the user described (force the arc, push the hands
  straight along the line, natural, cut short to a stop) become a shot's own choice. The natural push grows with the
  swing's power. Each stroke type gets a better default follow-through. The late catch at 109 ms is a "push" in
  Gugan's sense ("Such pushes are of course always faults", Gugan 5; Law 29.1.6), and comes out of the physics.
  Gugan 5's "super pass-rolls" (a strong early second tap from "a lot of arm follow through") belong there too.
- **The pressed-in croqueted ball:** a later set-up input (decision 8).
- **A fitted parameter of any kind:** nothing in this step is fitted (Circularity).
- **Phase 2's ball–ball collisions:** they stay impulsive.
- **The lawn's pace:** not tuned (P2b.2b.2c.2's ruling stands).
- **Ball-make presets:** P3's.
- **The 0.378 m drift's origin:** carried, as before.

## Amendments

(None yet.)
