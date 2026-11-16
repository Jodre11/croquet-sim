# Reality scorecard and gap finding: design

**Status:** draft for the user's review, 2026-11-16. Branch `reality-scorecard`, from the roll launch's amendment 8
(d4ddf97).

## 1. Why

Each phase so far has fitted one parameter to one target and found out what else moved only when the suite re-pinned.
Amendment 8 fitted the face's friction to C3F's topspin and brought the full and pass rolls into band, and the half
roll's ratio fell from 2.02 to 1.77. The user's test of the model is its outcomes (2026-11-16): the shots look like
the right shots, the balls behave as expected, and the shots are physically playable. This design replaces
one-at-a-time tuning with:

1. **A scorecard.** Every external target the project holds, measured on the current model in one run, so a change
   shows everything it gains and everything it breaks.
2. **A sensitivity map.** Which free parameter moves which target, and how far within its sourced bounds.
3. **A joint fit.** The free parameters fitted together against all the fit targets, not one target at a time.
4. **A gap register.** The targets no allowed setting reaches, or that pull the parameters opposite ways. Each is
   evidence of a missing or wrong mechanism, recorded with its evidence and a probe that would tell the candidate
   causes apart. Which gaps are modelled is the user's ruling.

The scorecard then stays as the standing guard: no later change may push a target out of its band unannounced.

**Non-goals.**
- No new physics in this phase. A gap becomes its own design once the user rules on it.
- No change to the user's rulings on technique: hand positions, the flat push, the muted flick, the leans. These are
  inputs, validated by the user and the texts, never by fit.
- The user's yardages are checked, never fitted (roadmap, "User play data and checks").

## 2. Where the model stands

Taken from the inventory of 2026-11-16; dated values are the latest found.

- **Asserted against a source in the ordinary suite:**
  - Table 1's ball–ball e 0.72 and its 0.75 ms on video;
  - Table 2 A2D's 0.75 ms;
  - Gugan 2000's e(U) and T(U);
  - A4R's turf bed (e 0.5, 7.2 mm);
  - the 9.0 m/s effort ceiling.
- **Slow suite only:** Gugan 5's stop ratio 7.15 ± 0.6 (model 6.913, from before amendment 8).
- **Never asserted:**
  - Gugan 5's drive ratio 4.23 ± 0.2 (model about 4.26, from before amendment 8);
  - every Table 5 and Table 6 comparison;
  - the CA distances;
  - the turf held-outs;
  - the lawn's acceptance;
  - the user's yardages.

  Several were last measured before the speed-dependent lawn or before amendment 8.

**The misses, grouped by what they share:**

| Group | Targets (model / source) |
|---|---|
| Spin in slow shots | C1F Ω₁ 79/100; C1D Ω₁ −2/+20; Ω₂ −37/+39 at C1F, −36/0 at C3H, C3F and C3P |
| Croqueted ball's spin flat in speed | Ω₂ −36 to −37% in all nine rolls; Gugan +39% at 1.2 m/s, 0% at 3, −25 to −35% at 5–9 |
| Striker's ball at high power | C25F w1/U 0.73/0.50, C25P 0.76/0.56; both superhuman |
| Striker's ball, half roll, slow | C3H w1/U 0.44/0.38, v2/U 1.01/0.94; L2/L1 1.78/2.46 |
| Striker's ball, full and pass rolls | w1/U 0.47–0.55 against 0.52–0.67, low |
| Pressed ball's turf friction | apparent μ 0.16–0.46 in the rolls (2026-10-23) against Gugan's ≈ 1.0 |
| Ball lift | full roll's first hop 11.27 mm, pass roll's 19–21 mm, against R + 5 mm (both `it.skip`) |
| Turf bed rebound, slow | e 0.62–0.66 at 0.2–1 m/s against Penner's 0.47–0.51 (a golf analogue) |
| Touching stops | C3S at gap 0: v2/U 1.26/1.15, w1/W 1.98/1.73 (ruled and carried) |
| Distances | user's yardages ×1.16–1.9 long; the CA's lawn share ×0.56–0.88 (both before the speed-dependent lawn) |

These groups are what the scorecard must expose and the gap analysis must explain.

## 3. The scorecard

### 3.1 Targets

Each target has:
- **id, stroke, quantity;**
- **the source's value**, cited (URL, section), never mirrored;
- **a tolerance σ:** the source's own spread where it gives one; otherwise the rule in §3.2;
- **a use:**
  - *fit*: in the joint objective;
  - *held-out*: scored, not fitted, to test the fit;
  - *check*: scored and reported only.

**The families:**

| Family | Targets | Use |
|---|---|---|
| Strike | Table 1 (e, video time ×3), Table 2 (T at A1D–A4D), Gugan 2000 e(U) and T(U) | fit (as now) |
| Croquet ratios | Gugan 5 drive 4.23 ± 0.2, stop 7.15 ± 0.6 at 3 m/s on Gugan's mallet | fit |
| Table 5 | per stroke: v2/U, w1/W, Ω₁, L2/L1; the three means | fit (B1MS out, as Gugan) |
| Table 6 | per roll: w1/U, v2/U, Ω₁, Ω₂, L1, L2 | fit; C3H, C1F and C25P held out (§3.3) |
| Turf | A2R and A3R penetrations, apparent μ ≈ 1.0, travel to deepest 3.5–18 mm | held-out |
| Lawn | the 36 travels of Tables 5 and 6 through the rolling law | held-out (the law was fitted to them) |
| CA | the A1D–A4D strike shares and travels | check |
| User | the yardages, like for like: same backswing, stroke and effort, "no model run" where none matches | check |
| Playability | every Table 5 and 6 stroke at Gugan's U plays clean; the canonical strokes clean | fit, as a penalty (§3.2) |
| Look | R + 5 mm for every preset including the full and pass rolls; no riding the ball; the stop's settle (Riches); punch beats coast | check, with the pins the suite already has |
| Coaching bands | half roll 1.4–2.5, full 1.0–1.2, pass below 1, drive 3.0–4.0, stop 4.1–6.2 | check |

### 3.2 Tolerances and scoring

- **Speeds and speed ratios:**
  - Gugan's "about 3%" on each speed, so 3%·√2 on a ratio of two (`SPEED_UNCERTAINTY`, `touchingBand`);
  - his sem where a mean is quoted.
- **Spin ratios Ω:** ±10 points. Assumption: Gugan gives no error for Ω. It is a ratio of speeds read off 8000 fps
  frames, the speed errors alone give about ±4 points, and the frame-rate read of rotation adds more. The value is
  set here and shown on every report, so the user can change it.
- **Travels L:** ±20%, the lawn design's recorded misfit of Gugan's launches through the rolling law (§6 there).
- **Ratios of travels:** from the travels' errors, ±28%.
- **Score:** each target's z = (model − source)/σ.
  - **pass:** |z| ≤ 1;
  - **near:** 1 < |z| ≤ 2;
  - **miss:** |z| > 2.
- **Playability:** pass or fail. In the fit, a stroke that is not clean adds a fixed penalty of 25 (the cost of
  five σ). Assumption: a playable model outranks any one number.
- **The joint objective:** Σz² over the fit targets, each family weighted by 1/(its count of targets), so the nine
  rolls' 54 numbers do not drown the two Gugan 5 ratios. Assumption: equal family weights; the report also gives
  each family's own Σz² so a re-weighting can be judged.

### 3.3 Held out

C3H, C1F and C25P stay out of the fit as held-out tests: one slow half roll, the slowest roll, the hardest pass
roll. A fit that only reaches the targets it was given has found tuning, not the model. Also held out:
- Table 4's turf figures, except A4R, which stays fitted as now;
- the lawn's travels.

### 3.4 What is built

- **`scripts/scorecard.ts`.** Runs every target, writes a report and a machine-readable record.
  - It reuses the measuring code that exists: `readOut` and `readTimeOf` (ratioFit), the Table 6 play
    (table6Probe's `playRoll`, moved to a shared module), `FILMED_STROKES` and `GUGAN5` (filmedStrokes), and the
    croquet-fit probe's Table 5 runs.
  - Each target is a small record {id, family, use, source, σ, measure(world) → number | class}, in
    `scripts/scorecard/targets.ts`.
  - A world override (parameter name → value) runs any set without editing `reference/`. The fit and the
    sensitivity map need this; today a run needs an edit to the JSON.
- **Parallel runs.** Targets are split across worker processes (one per core, nice 10). Budget: the whole card in
  under 10 minutes on this machine, to be measured in step 1 of the plan.
- **The record:** `docs/superpowers/probes/scorecard/<date>-<label>.json` plus a text table. `--compare <record>`
  prints each target's z before and after, and flags any target that left its band.
- **A report page.** An artifact: the families' pass/near/miss grid, the sensitivity heat map (§4) and the gap
  register (§6). The user reads it remotely.

## 4. The sensitivity map

**The free parameters.** A reference value is free when it was inferred, not measured, and has sourced bounds:

| Parameter | Value | Bounds |
|---|---|---|
| faceFriction | 0.38 | 0.2–0.6 |
| ballBallFriction | 0.16 | 0.06–0.5 |
| tangentialStiffnessRatio | 2/7 | 2/7–2/3 |
| headTurfFriction | 0.5 | 0.3–0.7 |
| turfYield | 240 kPa | 172–310 kPa |
| turfMatStrength | 105 kPa | 73–138 kPa |
| handCouplingPeriod | 0.08 s | 0.01–0.2 s |
| handCouplingDampingRatio | 0.7 | 0.2–1 |
| armMass | 0.8 kg | 0–1.5 kg |
| pushForce | 92.2 N | 48.5–106.3 N |
| pushResponseTime | 0.125 s | 0.101–0.17 s |
| pendulumForce | 64.3 N | 39.1–104.2 N |
| armHoldStiffness | 744 N/m | 489–1353 N/m |
| armHoldDamping | 20.7 N·s/m | 10.8–30.0 N·s/m |
| ballTurfSliding | 0.48 | 0.48–1.0 |

ballTurfSliding is measured (Hall, 0.48 on a fast court) but held with Gugan's ≈ 1.0 for a pressed ball as its upper
bound, so it is free inside that range.

**Fixed:**
- the masses, dimensions, restitutions and contact times, all direct and asserted;
- the bed (fitted to A4R, asserted);
- the lawn's rolling law (fitted to the 36 travels, a separate law);
- every technique input the user has ruled on.

**The map.** For each free parameter: the card at its two bounds and its current value, with the rest held. That is
15 × 2 runs plus the base, under 6 hours at the budget, run in the background. The result is a matrix of Δz per
target per parameter. It shows:
- which parameters matter, so the joint fit uses only those;
- which targets no parameter moves: the first structural signal;
- which targets two parameters trade against each other.

Where a parameter's effect bends (C3F's Ω₁ against the face's friction was not monotone: 96, 104, 74 at 0.2, 0.25,
0.6), the map adds the bounds' midpoint for it.

## 5. The joint fit

- **What is fitted:** the parameters the map shows matter. Expected four to six; assumption: those whose largest
  |Δz| on a fit target exceeds 1.
- **How:** a bounded fit in the normalised parameter space [0, 1].
  - First, Nelder–Mead from the current values and from the two best corners the map suggests, to catch the
    non-monotone cases.
  - Then a Levenberg–Marquardt polish with the map's Jacobian, refreshed every few steps.
  - The objective is §3.2's.
  - Assumption: up to 150 card runs, in the background, reported as it goes.
- **What the fit reports:**
  - the best set and its objective;
  - each family's Σz² against now;
  - the held-out targets' z, which decide whether the fit has found the model or only tuning;
  - each parameter's distance from its bounds. A parameter pinned at a bound is a gap signal: the model wants a value
    the sources do not allow.
- **What it does not do:** change `reference/`. The best set goes to the user as a proposal beside the gap register.
  Adopting it is the user's ruling, then the suite re-pins once, in one change.

## 6. The gap register

A target becomes a gap when, after the fit, it is:
- **unreachable:** missed, and no free parameter in the map moves it towards its band;
- **in conflict:** missed, and every parameter that moves it towards its band pushes another fit target out;
- **held-out miss:** a held-out target missed while the fit targets pass;
- **pinned:** reached only with a parameter at its bound.

Each gap is written up with:
- the targets and their z;
- the evidence: map rows, timelines, contact attributions as amendment 8's spin split did;
- the candidate mechanisms, each with the source that supports it;
- **a discriminating probe:** one run whose outcome differs between the candidates;
- a recommendation.

The probes run in the plan, not ad hoc.

**Candidates already visible**, to be confirmed or dropped by the card and the map:

| Gap | Candidate mechanisms | Discriminating probe |
|---|---|---|
| Spin in slow shots; Ω₂ flat in speed | (a) a pressed ball's turf friction above Hall's sliding 0.48: Gugan's ≈ 1.0, model's apparent 0.16–0.46. (b) Where Gugan read the spin: "a few milliseconds" after, at 8000 fps; the model reads at 1 ms. (c) Ball–ball friction falling with sliding speed. | Read delay 1–5 ms at C1F and C10H: (b) moves slow Ω₂ only. ballTurfSliding 0.48 → 1.0: (a) moves slow shots more than fast. Ball–ball μ by slip speed: (c) alone changes Ω₂ with U. |
| Striker's ball fast at C25; superhuman | (a) The push keeps driving ball 1: the face stays on, Ω₁ 62% means it slides. (b) High-speed rolls come from the swing, not the hands: pendulum share fixed per type. | C25F's face timeline and hand forces against C10F's. Power-to-U against Gugan's U: which part of the stroke makes the speed. |
| Half roll: slow ball 1 fast, travel ratio short | (a) Shared with the turf friction: a pressed ball 1 is slowed. (b) The half roll's geometry: lean 24°, contact height. | The map's ballTurfSliding row at C3H against the full rolls' w1/U, which friction lowers too: a conflict means (b). |
| Ball lift in full and pass rolls | The bed's missing rate-independent loss (already named in the pass roll's skip) | Bed e at 0.2–2 m/s against Penner, then the hop height. |
| Touching stops | Ruled and carried | Recorded only. |
| Distances | Re-measure first: both checks predate the speed-dependent lawn. | The card itself. |

**Comparison gaps are gaps too.** Where the model and Gugan read a quantity differently (read time, which contact
ends the strike, his lawn of 13.23 s), the card measures as he did. A mismatch found there is fixed in the card, not
the model, and is listed separately so it is never mistaken for physics.

## 7. The standing guard

- **The committed baseline:** the record of the adopted model, under `docs/superpowers/probes/scorecard/`.
- **`tests/engine/scorecard.test.ts`, slow suite:**
  - runs the card;
  - fails if any target's band class worsens against the baseline (pass → near, near → miss), or a clean stroke
    stops being clean;
  - a deliberate change re-baselines it in the same commit, naming each moved target.
- **Asserted in the ordinary suite:** the Gugan 5 drive band, never asserted until now, and the stop band, until
  now slow only. If their runtime fits under CI's 60 s; otherwise slow.
- **Every later design** includes its scorecard comparison in its results.

## 8. Housekeeping

Per the repo's standing rule: npm dependency freshness, Actions majors and runners are checked at the plan's start,
and any bump lands first as its own small PR.

## 9. Sequence and gates

1. Build the card; first baseline on the current model, re-measuring the stale targets. **Reported to the user**:
   where the model stands, every target.
2. The sensitivity map, in the background.
3. The joint fit and the gap register. **Gate:** the user rules on adopting the fitted set, and on which gaps become
   designs and in what order.
4. The guard, on the adopted baseline.

Roll launch Task 4 (its §5 results) is folded in: step 1's baseline is its results, and the spec's §5 points to it.

## 10. Assumptions

- **Tolerances:** Ω ±10 points; travels ±20%; playability penalty 25; equal family weights (§3.2).
- **Held out:** C3H, C1F and C25P (§3.3).
- **Free set:** ballTurfSliding is free within its range up to Gugan's 1.0 (§4).
- **Fit size:** at most about 150 card runs; parameters with |Δz| > 1 on a fit target enter it (§5).
- **Cost:** the card runs in under 10 minutes; checked in step 1. If it does not, the map runs fewer bounds and the
  fit fewer runs, and the user is told.
