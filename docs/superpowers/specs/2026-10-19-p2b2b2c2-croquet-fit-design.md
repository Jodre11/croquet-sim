# P2b.2b.2c.2 — The Croquet Strokes' Fit: Contact Times, the Hands and the Arms' Check: Design

**Product spec:** `2026-09-30-croquet-shot-lab-design.md` §4 (impact phase).
**Swing spec:** `2026-10-04-p2b2b1-swing-shot-design.md` (the hand coupling's T and ζ, the arm mass, the reach slack,
the grips; the effective-mass criterion).
**Strike and turf laws spec:** `2026-10-09-p2b2b2b2a-strike-turf-laws-design.md` (the face's T(U) and e(U)).
**Roll spec:** `2026-10-11-p2b2b2b2b-roll-stroke-design.md` (the arm's posture-holding impedance, k_hold and c_hold).
**Turf-strike spec:** `2026-10-14-p2b2b2b3-turf-strike-design.md` (the grip limit, the slid anchor, the jab).
**Single-ball spec:** `2026-10-18-p2b2b2c1-single-ball-design.md` (the step before; its §12 hands this step its scope).
**Roadmap:** P2 row; "P2b.2 decisions (2026-10-04)"; "P2b.2b.2b.3 outcomes (2026-10-17)"; "P2b.2b.2c.1 outcomes
(2026-10-19)" and its "Carried open items"; "Provisional numbers".

**Why this step.** P2b.2b.2c is split three ways (user, 2026-10-18). This is the second step: the croquet strokes'
fit. The stop shot and the drive are the calibration targets, and the rolls are held-out validation for step 3
("P2b.2 decisions", "No circular validation"). Today, at 3 m/s on each canonical setup
(`docs/superpowers/probes/2026-10-19-p2b2b2c1-strokeProbe.txt`):

- **The drive's ratio is 3.31** against Gugan 5's 4.23 ± 0.2, and the AC stop's is **5.91** against 7.15 ± 0.6. Both
  sit low, by about 22 % and 17 %.
- **The fit's parameters are still provisional.** `handCouplingPeriod` (T 0.08 s), `handCouplingDampingRatio`
  (ζ 0.7), `armMass` (0.8 kg) and `reachSlack` (0.03 m) in `reference/contact.json` each say "P2b.2b.2 fits it". The
  ball–ball contact time (0.75 ms, bounds 0.5–0.87 ms) is Gugan's measured cluster, but the decision of 2026-10-04 lets
  this step fit it once, within those bounds, as a world constant.
- **A slid grip drifts without bound.** Past the 435 N limit a hand's anchor slides, and the slid offset persists
  (`src/engine/impact/track.ts:1697-1718`, `GripState`). The GC stop's follow-through drifts 0.378 m (P2b.2b.2b.3; the
  user, 2026-10-17, "Accept 3D slide, reword"). Nothing checks it.
- **The model's distances run long** against the user's own strokes (P2b.2b.2c.1 outcomes, section J), and whether
  the stroke's speed or the lawn's pace is at fault is open. Measured mallet-speed and ball-travel pairs already sit in
  the sources (`reference/sources/README.md:79-84`), and nothing has used them.
- **Gugan's jab check is an expected failure** (`tests/engine/turfStrike.test.ts:131`), and the biting test cannot
  tell the jab's load from the turf's (`turfStrike.test.ts:90-109`).

**Circularity.** The user's play data are checks, never fit targets (roadmap, 2026-10-08). The fit's only targets are
Gugan 5's drive and stop ratios (§5). Everything else here is recorded or held out: the CA bands, the 2–4 m/s sweep,
the distance check (§3), the jab (§7.1), the control run (§7.2) and the rolls (step 3). Gugan 5 is the source of both
the stop's target and the jab's band. Holding the jab out (never fitting to it) is what keeps it evidence.

**Vocabulary.** "Split", "ratio" and "cut" keep their croquet meanings only: a ratio is the croqueted ball's distance
over the striker's ball's. The pendulum/hands share is **phasing**, the turf's drag **ploughing**. A hand **saturates**
when its force reaches the grip limit, and its anchor then **slides**. The **checking force** is the arm's pull on a
slid anchor back towards the hands' planned path.

## Decisions (user, 2026-10-19)

Each was put as a question with options, pros, cons and a recommendation. The user chose as recorded.

- **Housekeeping needs no PR.** Every dependency is at its latest. TypeScript 7.0.2 stays blocked (typescript-eslint
  8.71.2 needs `>=4.8.4 <6.1.0`, svelte-check 4.7.7 `^5.0.0 || ^6.0.0`). `npm audit` finds nothing, `actions/checkout`
  and `actions/setup-node` are on v7 (the latest majors) and the runner is `ubuntu-26.04`.
- **The long distances: a recorded check before and after the fit, with no tuning** ("D"). It was first ruled "leave
  it out" ("A"), on the claim that telling the stroke from the lawn needed data we lacked. The CA's measured pairs
  showed that claim wrong, and the user re-ruled "D" (§3).
- **The targets are Gugan 5's figures at 3 m/s** ("A"): the drive 4.23 ± 0.2 and the stop 7.15 ± 0.6. The CA bands
  (drive 3.0–4.0, stop 4.1–6.2) and the 2–4 m/s sweep are recorded beside them, not fitted (§5.1).
- **The free parameters are chosen by a sensitivity probe, then ruled at a gate** ("B"; §5.2). Fitting every
  parameter at once was rejected as underdetermined.
- **The arms' checking force is the arm's posture-holding impedance** ("A"): k_hold 744 N/m and c_hold 20.7 N·s/m,
  already sourced (§4).
- **Its form: the arm returns the anchor, force only through the grip, swing mode only** ("A"; after the builder
  check). The first wording, the arm in series carrying the excess, contradicted the F_max cap, and its "about 280 N"
  estimate was wrong: a series arm at 744 N/m stretches about 0.58 m to carry 435 N. Carry mode's chain already holds
  the arm (§4.1).
- **The checking force stays in this step, as an independent part** ("A"; after the spec review showed it cannot move
  any ratio or the jab). It lands in its own commits, reviewable apart from the fit, and closes the drift before
  P2b.2b.3 sweeps the follow-through.
- **The checking force acts only once a grip has slid** ("A"), so every run that never saturates stays bit-identical
  (§4.2).
- **Gugan's jab is re-run after the fit as a held-out, banded check** ("A"). Nothing is tuned to it; `.fails` comes off
  only if it passes (§7.1).
- **The grip-limit control run: a control pair and a search, after the fit** ("A"; §7.2).
- **Ball-make elasticity: sourced as context for the drive's target only** ("A"); ball-make presets are P3's (§6).
- **The tolerance is Gugan's stated uncertainty** ("A"): it replaces the roadmap's provisional ±15 % (§5.1).
- **Shared parameters first** ("A"): the fit's pair comes from the world and body parameters every preset shares. The
  drive's and the AC stop's own grips come in only if no shared pair reaches both targets, and only by the user's
  ruling at the gate (§5.2).
- **The P2b.2b.2c.1 cosmetic minors are fixed as this branch's first task, in their own commit** ("A"; §9).
- **Nothing missing**: the user approved the step's playback and asked for this spec.

## 1. Goal and exit criteria

The drive and the AC stop reach Gugan 5's ratios at 3 m/s within his stated uncertainty. They get there by fitting
parameters every stroke shares, not one stroke's own. A slid grip is checked by the arm and no longer drifts without
bound. The open distance question gets a sourced verdict, recorded, and the jab and the grip-limit questions are
re-measured on the fitted model.

Exit criteria:

1. The cosmetic minors of §9 are fixed in the branch's first commit, and every test and probe output they touch is
   otherwise unchanged.
2. The sources of §6 are read and cited in `reference/sources/README.md` (URL, date, SHA-256, annotated quotes; no
   mirrored text), and the three checks they answer are recorded: the CA travel unit, Gugan 5's stop speed, and the
   ball makes behind the face law and Gugan 5's drives.
3. The distance check (§3) has run on `main`'s model and again on the fitted one, and both are recorded.
4. The checking force (§4) holds its analytic cases (§8.1). Every run whose slid offset stays null is bit-identical
   (§8.2), and the GC stop's slid anchor drift (§4.3) is re-measured on `main` and after, and ruled at the gate.
5. The sensitivity probe (§5.2) has run, and the user has ruled at its gate on the two parameters to fit.
6. The fitted drive's ratio at 3 m/s is within 4.23 ± 0.2, and the AC stop's within 7.15 ± 0.6, on their canonical
   setups (§5.3). If no ruled pair reaches both within bounds, the closest is recorded and the user rules at the
   pre-flight gate; "closest" minimises the larger of the two errors, each divided by its tolerance.
7. Every fitted value lies within its recorded bounds (§5.2), or a bound the gate widened, and is recorded in
   `reference/contact.json` (or the presets' grips, if ruled) as derived, with its fit named in its note.
8. The swung body's effective mass at the drive's face centre along aim is within 10 % of the head's mass on the
   fitted model (P2b.2b.1's exit criterion 3). It constrains the sensitivity probe (§5.2) and is re-measured after.
9. Gugan's jab check (§7.1) and the grip-limit control run (§7.2) have run on the fitted model and are recorded.
10. Every preset's canonical setup meets P2b.2b.2b.1's exit criterion 4 as P2b.2b.2c.1 restated it (top to finish, no
    `RangeError`, no re-entry guard hit, no ball centre above R + 5 mm but the pass roll's turf rebound, re-measured,
    no `follow-cap`, the trajectory continuous at every boundary), and each default still plans 3 m/s within 2 %.
11. No impact ends with the head overlapping a ball as handed over, over every preset's late re-hit sweep.
12. The ratchet of §8.2 holds.
13. The pre-flight gate (§10) has run and the user has ruled on it.
14. The figures of §11 are recorded in the roadmap, and the "Provisional numbers" table is updated (§11). They are
    observations, not gates.
15. `ENGINE_VERSION` is "0.14.0".

## 2. Architecture

```
src/engine/impact/
  track.ts            the checking force: swing mode's slid offset relaxed at the arm's rate under the limit
                      (handLoad :1697-1718), handLoad taking the step's dt; carry mode's slide untouched (§4)
  integrate.ts        dt passed to handLoad by both callers (:1068, :1356)
  types.ts            whatever GripState needs to relax its offset, if any
reference/contact.json      the fitted values, each "derived", its note naming the fit (§5.3); the ball–ball
                            contact time's note gains the fit, its Gugan figures kept
reference/sources/README.md le Maitre; the CA travel unit; Gugan 5's stop speed (§6)
reference/swing.json        a required `ratioTargets` block (my call: the file holding the presets): the drive's and
                            the stop's targets with their source, tolerance, speed and provenance, read by the fit, the
                            gate and the tests (the roadmap defers "coaching ratios" to P2b's reference data)
src/engine/swing/profile.ts the drive's and the AC stop's grips, only if the sensitivity gate rules them in (§5.2)
scripts/                    the distance check (§3), the sensitivity probe (§5.2), the fit (§5.3) and the pre-flight
                            gate (§10), as new scripts or sections of the existing probes, the builder's call
tests/engine/turfStrike.test.ts   the jab check's `.fails` (§7.1); the biting test, if the control search finds a
                                  turf-only run (§7.2)
```

Phase 2 and the face–ball law are untouched. The face's contact time stays Gugan's measured T(U)
(`faceContactTimeFit`) and is never fitted (the premise of the free-parameter question the user ruled, 2026-10-19).

## 3. The distance check (recorded, not tuned)

The user's distances run long like for like (knee at i 0.4 ×1.16, at i 0.3 ×1.9, the drive ×1.68), but their mallet
speeds are unknown, so those pairs cannot say whether the stroke or the lawn is at fault. The sources hold measured
pairs that can:

- the CA, Single Ball Shots (`reference/sources/README.md:80-82`): A1D 0.78 m/s mallet, 1.04 m/s ball, travel 0.93;
  A2D 3.20, 4.31, 9.74; A3D 5.23, 6.86, 24.73; A4D 8.18, 8.62, 45.85;
- Gugan 5 (`:83-84`): drives "with a mallet speed of about 3 m/s sending the croqueted ball about seven yards".

**First, the unit.** The CA's travel unit (yards or metres) is read from the CA PDF and recorded (§6). Until then no
comparison is stated. From P2b.2b.2c.1's section J the model sends a single ball about 52 yd at about 8.2 m/s, which is
×1.14 on A4D in yards and ×1.04 in metres.

**Two shares, each isolating one cause.** For each CA stroke, on the single-ball preset, on the open lawn of
P2b.2b.2c.1's section J (`defaultWorld(10)`'s surface on a 200 m square, no hoops), distances to rest:

1. **The strike's share:** the model struck at the CA's mallet speed; its ball speed at the face's release against the
   CA's ball speed. The lawn plays no part.
2. **The lawn's share:** the model struck at the mallet speed whose ball speed at release equals the CA's measured ball
   speed (a bisection on the planned speed); its travel against the CA's travel. The strike's own error is removed.

Gugan 5's drive is checked the same way on the drive preset at 3 m/s: the croqueted ball's travel against about seven
yards.

Each speed is reached as P2b.2b.2c.1 rules it (gravity-only from the gravity-only backswing up to 3 m/s; the default
backswing with intensity above). A1D (0.78 m/s, 0.93 travel) is run and recorded but noted as a very short stroke,
where Hall's longer contacts apply (`contact.json` `faceBallContactTime` note).

**What the check cannot settle.** The CA lawn's pace is unknown. A gap in the lawn's share may be the CA's lawn, not
ours, and is recorded as such. The check never tunes the lawn's pace or the strike; it is run on `main`'s model before
any change (Task 1's baseline) and again on the fitted model, and both go to the gate.

## 4. The arms' checking force

### 4.1 The law

Today, when a hand's force would exceed F_max (435 N), the hand transmits F_max and a position spring's anchor slides
by just enough that the spring carries F_max less the hand's share (`track.ts:1697-1718`). The slid offset is kept in
the head's frame (`GripState.topOffset`, `.bottomOffset`) for the rest of the stroke and never recovers.

**Where swing mode slides an anchor.** Only in `handLoad`'s pre-contact branch with a position spring,
`spring = gripped || arc.downswing === undefined` (`track.ts:1685`). Every planned stroke has a downswing, so before
contact its grip has no spring; after contact the hands are capped with no anchor (`track.ts:1758-1786`). On the
presets the only slide is therefore the **stops' gripped hold** after their check (`integrate.ts:1330`, `:1356`),
which starts after the impact; downswing-less tracks are test constructions only. So the checking force touches only
the AC and GC stops' follow-throughs: it cannot move any ratio, and the fit (§5) does not depend on it. The two may
land in either order. The single-ball's and the drive's `grip-limit` runs never slide and stay bit-identical.

The checking force is the arm returning the slid anchor (the user, 2026-10-19, "A", after the builder check showed
the first wording self-contradictory). While a hand is under its limit, its slid offset relaxes back towards the
hands' planned path at the arm's own rate, the time constant τ_arm = c_hold / k_hold, from `reference/contact.json`
(`armHoldDamping` 20.7 N·s/m, Tsuji et al.; `armHoldStiffness` 744 N/m, Patel et al.): 27.8 ms. As the offset
shrinks the grip's spring pulls the head back with it, never with more than F_max. While a hand is at its limit it
slides exactly as today. No force is added beside the grip's and no new constant is introduced.

Constraints on the builder's form:

1. **While a hand's offset is null, nothing changes**, to the bit (§4.2).
2. **Force reaches the head only through the grip**, and the hand's transmitted force never exceeds F_max. The arm
   moves the anchor; it does not push on the head.
3. **The offset recovers.** At each step the hand's force is computed with the offset as it stands, and the limit
   tested, as today. If the hand is at its limit the offset slides as today. If not, the offset is multiplied by
   exp(−dt/τ_arm) after the force is computed, so it takes effect from the next step (my call: test first, decay
   after, so a decay never tips a hand over F_max within its own step and a step's decay is exact for any dt). Under a
   load that stays above F_max the slide continues: the bound comes from the load easing, not from the arm's strength,
   and the spec accepts that.
4. **Swing mode only.** Carry mode's hand–arm chain already holds each hand through the arm's flex, k_hold and c_hold
   included through the push (`track.ts:1484-1497`), so its slid offset is skin slip on a held arm and stays as
   today. Applying the law there would count the arm twice. This adds swing mode's checking to the roadmap's list of
   where the modes branch ("P2b.2b.2c.1 outcomes", "Where swing and carry mode branch").
5. **The twist stays unlimited** (P2b.2b.2b.3 design §5).

The decay acts only at steps that read the offset, the pre-contact spring branch, wherever that runs (the impact or
the follow-through). Elsewhere the offset is left as it stands (my call: on the presets the hold runs unbroken to the
finish, so nothing is lost, and the contact branch stays untouched to the bit).

### 4.2 Why only once a grip has slid

The user ruled the force on only after a hand first saturates. Every run whose offset stays null is then
bit-identical, so the ratchet isolates this change to the stops' runs whose hold slides an anchor, each listed (§8.2).
The single-ball's and the drive's `grip-limit` runs never slide (§4.1), and the pass roll's are carry mode's: all stay
bit-identical. Applying the arm throughout was rejected: it would move every swing run before the fit, and change the
effective mass the face presents.

### 4.3 What it is expected to do

- **The GC stop's drift** (0.378 m: the slid anchor's offset in its follow-through hold, from the 435 N limit alone;
  P2b.2b.2b.3 design, final review, decision 10) should shrink once its load eases below F_max. The run that gave it
  is identified on `main` first (the canonical GC stop at 3 m/s is the likely one; its head ends 65 mm along aim), and
  the measure is the peak of each hand's |offset|. The peak and the final offset are re-measured and recorded, and
  judged at the gate against the user's account of a GC stop's follow-through (Riches: "NO FOLLOW-THROUGH at all, or
  as little as possible").
- **The rate's sources measured small perturbations** (Patel 8 mm; Tsuji a maintained posture). Returning tenths of a
  metre at their ratio extrapolates them; the spec accepts that as the figures' limit and records it.
- **Gugan's jab and the control run** cannot move on the checking force: both are decided within the impact, before
  any hold (§4.1). Only the fit can move them (§7).

## 5. The fit

### 5.1 The targets

Gugan 5 (oxfordcroquet.org/tech/gugan5/, already cited in `reference/sources/README.md`):

| Stroke | Target | Tolerance | Speed | Recorded beside it |
|---|---|---|---|---|
| Drive (drive preset) | 4.23 | ± 0.2 (±4.7 %) | 3 m/s | CA 3.0–4.0; the 2, 2.5, 3.5 and 4 m/s ratios |
| Stop (AC stop preset) | 7.15 | ± 0.6 (±8.4 %) | 3 m/s, or Gugan 5's (§6) | CA 4.1–6.2; Gugan's best 11.6; 2–4 m/s |

- The stop is the AC stop: Gugan's stop shot is a croquet stroke. The GC stop is a single-ball stroke whose distances
  are step 3's (P2b.2b.1 pre-flight decisions, 2026-10-06).
- The speed is the planned contact speed on the canonical setup, as every probe reports it. Gugan 5 gives "about
  3 m/s" for the drives. If it states the stop's speed, the stop is fitted there; if not, at 3 m/s (my call). Any
  speed is reached as P2b.2b.2c.1 rules it: gravity-only from the gravity-only backswing up to 3 m/s, the default
  backswing with intensity above.
- The fit aims at each centre and passes inside each tolerance. These tolerances replace the roadmap's provisional
  ±15 % stroke-ratio row (§11).
- Gugan's drive (4.23 − 0.2 = 4.03) sits just above the CA's band (4.0). That is recorded, not resolved: the targets are
  Gugan's, and the bands are context.

### 5.2 The sensitivity probe and its gate

The candidates, each swept across its sourced bounds with the rest held at today's values, at the targets' speeds on
the drive's and the AC stop's canonical setups:

| Candidate | Today | Bounds | Shared by |
|---|---|---|---|
| `ballBallContactTime` | 0.75 ms | 0.5–0.87 ms (Gugan's measured) | the world: every impact's ball–ball contact |
| `handCouplingPeriod` T | 0.08 s | 0.01–0.2 s (a sweep's range) | the body: every swing preset's firm grip |
| `handCouplingDampingRatio` ζ | 0.7 | 0.2–1 (a sweep's range) | the body |
| `armMass` | 0.8 kg | 0–1.5 kg (the prototype's range) | the body |
| `reachSlack` | 0.03 m, at its upper bound | 0.01–0.03 m (the prototype's range) | the body |

If the ball–ball contact time is fitted, `ballObstacleContactTime`'s value follows it, as its note derives it (equal
to the ball–ball value). Its bounds stay 0.435–1.0 ms, since its lower bound derives from the ball–ball lower bound,
which stays 0.5 ms (`contact.json:30`). The obstacle fuzz is re-run to keep every obstacle penetration under 0.06 R
(my call: the derivation is physics, not a coincidence of values). The sensitivity probe moves it with the ball–ball
value too, though the canonical setups meet no obstacle.

The effective-mass criterion (exit criterion 8) constrains the probe: it marks every candidate value, `armMass`
above all, that takes the drive's effective mass at the face centre outside 10 % of the head's mass, and a pair
needing such a value is not recommended (my call).

Only the ball–ball contact time's bounds are measured. The hands' four are the ranges earlier sweeps and the prototype
tried (`contact.json` notes). The fit keeps to them all, and a fitted value that lands on a prototype bound is
flagged for the gate, which may rule the bound widened with a reason recorded (my call).

For each candidate the probe records both ratios at five or more points across its bounds, the slope of each ratio
at today's value, and any flag, cap, `RangeError` or re-entry guard hit along the way. The drive's and the AC stop's
own grips (`gripTension`, `bottomGrip`; `profile.ts:270`, `:275`) are swept only if no shared pair can reach both
targets, the case in which the gate may rule them in.

Both ratios need raising (by about 28 % and 21 %), so a parameter that moves both alike cannot fit them alone. The
probe therefore reports, for each pair of shared candidates, how distinct their effects are (for instance the angle
between their slope vectors in the (drive, stop) plane) and whether the pair can reach both targets within bounds by a
linear estimate.

**The gate.** The user rules on the pair to fit, in their own words, recorded verbatim in this spec's Amendments. The
recommendation favours the most distinct pair of shared parameters that can reach both targets. Per-preset grips are
offered only if no shared pair can. A candidate with no effect is recorded as such and kept at its value.

The face's contact time is not a candidate (§2).

### 5.3 The fit itself

The ruled pair is solved for both targets at once (a two-dimensional root-find, the builder's method), within bounds,
to well inside the tolerances (my call: to 0.01 on each ratio, or the closest within bounds). The result is checked
once more by a full canonical run of both presets, not only by the fit's own evaluations.

Each fitted value is written to `reference/contact.json` with provenance `derived`, its note naming this fit, its
targets and Gugan 5. Bounds stay as recorded unless the gate widened one. The ball–ball contact time, if fitted,
keeps Gugan's measured cluster in its note. Shared parameters move every preset, the rolls included. That is
expected, and the rolls' change is recorded, not judged: they are step 3's held-out validation.

## 6. The sources

Each is read, cited in `reference/sources/README.md` with the URL, the access date, the SHA-256 of what was read and
annotated quotes, and never mirrored (the public repo). Oxford Croquet's TLS certificate is broken: fetch with
`curl -k`.

1. **The CA travel unit and the ball speed's measuring point**: *Project Croquet Dynamics* (the cited PDF), the
   Single Ball Shots table, and Gugan 4's Table 2 (the same A1D–A4D series, `reference/sources/README.md:79`). Yards or
   metres, quoted, and where and how the ball's speed was measured, quoted, so §3's strike's share compares like with
   like (the model's is at the face's release). §3 states no comparison until both are recorded.
2. **Gugan 5's stop speed**: whether the stop shots' mallet speed is stated, quoted. It sets the stop's fit speed
   (§5.1).
3. **Ball makes**: le Maitre's drive ratio by make (the 2.7–4.2 spread the P2b.2b.2c.1 spec handed on, with no
   citation yet). Find and cite it, with the makes and the ratio for each. Then record the make behind
   `faceRestitutionFit` and `faceContactTimeFit` (Gugan 2000: the Jaques ball on wood) and the make in Gugan 5's
   drives, if stated. If the makes differ, the spec's targets stand and the difference is recorded for the gate (my
   call). If le Maitre cannot be found, that is recorded and the item carried. Ball-make presets are P3's.

## 7. The held-out re-runs

### 7.1 Gugan's jab

`turfStrike.test.ts:131` is re-run on the fitted model unchanged: the AC stop at 3 m/s, jabs 0–8 mm, every graze's
second tap within [0.295, 0.463]·U. Nothing is tuned to it. If it passes, `.fails` comes off; if not, it keeps
`.fails`, its comment re-measured (the fractions, the striker's ball's departure fraction) and its cause stated, and
the user rules at the gate.

### 7.2 The grip-limit control run

The biting test (`turfStrike.test.ts:90-109`, the user's ruling "Hand held at limit in turf", 2026-10-17) holds the
top hand at 435 N while the head bites in, but its 5 mm jab saturates the hand by itself with the head out of the turf
(`up` 0). On the fitted model:

1. **The pair:** the biting setup (single-ball, 4 m/s, `up` 0.01 m, dip −0.02 s, jab 5 mm, `backswingLimit`
   `MAX_BACK_ANGLE`) beside its control (the same at `up` 0). Both hands' peak forces, the saturation times and the
   head–turf intervals are recorded.
2. **The search:** jabs of 1–4 mm (none saturates alone today; the best in the turf reached 390 N) over the regimes
   probe's `up` and dip grid, for a run where a hand reaches F_max only within a head–turf interval and its control at
   `up` 0 does not saturate.

If one is found, the biting test moves onto it, its comment re-measured. If none is, that is recorded, the test is
left as it is, and the user rules at the gate.

## 8. Testing

### 8.1 Analytic cases (the checking force)

The swing-mode cases are built in a stop's gripped hold, or on a downswing-less track, the only places swing mode
slides an anchor (§4.1).

1. Until a hand's offset is first set, its forces equal `main`'s to the bit.
2. At the limit: a step at F_max slides the offset exactly as `main` does, and the transmitted force equals F_max to
   1e-9.
3. Under the limit: the offset after a step of dt is the offset before times exp(−dt/τ_arm) to 1e-12, for steps of
   different lengths, and the step's force is computed with the offset before (constraint 3's order).
4. The hand's force never exceeds F_max, at any step of the GC stop's canonical follow-through.
5. Both hands: one case each for a sliding top hand and bottom hand in swing mode; and a carry-mode saturating run
   bit-identical to `main` (constraint 4).

### 8.2 The ratchet

Taken on `main` (ee16a93 or later) before any change: the throwaway preset digest, `impactDigest`, `shotMix`,
`impactProbe`, and the distance check's baseline (§3).

1. **After the tidy (§9):** all bit-identical, the probes' outputs changed only in the labels fixed.
2. **After the checking force:** every run whose offset stays null bit-identical; every run whose offset is set (the
   stops' holds) listed, per preset, with the offset's peak before and after. The drive's and the AC stop's ratios are
   unchanged, since the hold starts after the impact (§4.1).
3. **After the fit:** every preset moves (shared parameters). Each moved run is counted per preset, and the rolls'
   ratios recorded before and after. `impactDigest` and the shot mix's phase 2 move only if the fitted parameter enters
   them: the ball–ball contact time enters every impact with two balls in contact; the hands' parameters enter only
   impacts with a swing (my reading). The builder confirms which and lists the cause.

### 8.3 The canonical runs

Every preset's canonical setup run from top to finish as exit criterion 10 states, on the fitted model. Each default
re-checked to plan 3 m/s within 2 %. The fit changes the impact, not the downswing, so the defaults should hold to the
bit (my reading). If any moves, the builder re-fits it with `scripts/fitStrokeShape.ts` and records why.

### 8.4 The existing tests

Every test whose figures the fit moves is re-baselined with its new value and the reason in its comment. None is
loosened to pass. Gugan's jab (§7.1) and the weak dead stop (`it.todo`, the user's dig-in account, 2026-10-16) keep
their status unless §7.1 turns the jab green.

## 9. The tidy (first commit)

The P2b.2b.2c.1 deferred minors, fixed before any engine change:

1. the process-label strings in `scripts/singleBallProbe.ts`'s output and in the `swing.json` note;
2. the test titles at `tests/engine/buildContact.test.ts:~926` and the `describe` in
   `tests/engine/defaultStroke.test.ts`;
3. `tests/engine/shot.test.ts`'s stale "(exit criterion 3)" title;
4. the `effortTorque` −0 comment;
5. `strokeFor` reading h_0 from `swingReference` (test support only).

## 10. The pre-flight gate

One script, run alone in the background by the controller (the gate's runs take minutes). Its sections:

- **A.** The distance check (§3), before and after the fit, with the CA unit and both shares per stroke.
- **B.** The checking force: the GC stop's drift before and after, the saturating runs listed, the analytic figures.
- **C.** The sensitivity probe's table and pairs (§5.2), with the user's ruling quoted.
- **D.** The fit: the values, both ratios at 3 m/s and over 2–4 m/s, the CA bands beside them, the effective mass
  (exit criterion 8).
- **E.** Gugan's jab (§7.1).
- **F.** The control pair and the search (§7.2).
- **G.** The rolls' ratios before and after (recorded for step 3, not judged).
- **H.** The ball makes (§6.3).

The user rules on each section in their own words, recorded verbatim in the Amendments. A section the user rules
against is fixed and the gate re-run.

## 11. Recorded figures

In the roadmap's "P2b.2b.2c.2 outcomes" section: every figure of §10's sections; the ratchet's counts (§8.2); the
canonical runs; the sweep's cap and flag tallies as P2b.2b.2c.1 recorded them; the late re-hit's crossings; the cost
(`shotMix`'s engine time and the gate's run, alone).

In "Provisional numbers":

- the ±15 % stroke-ratio row is replaced by Gugan 5's tolerances (§5.1);
- the grip limit's row notes the checking force;
- each fitted parameter gains a row (its value, "derived from the fit to Gugan 5's ratios", and where it is confirmed
  next: P3's per-player fit);
- the effort's ceiling's row records the distance check's verdict, which the user rules on.

## 12. Out of scope

- **Step 3:** the rolls' validation (including head-never-ahead on every roll's runs), stop → pass-roll, pull,
  stop-shot lift, Sutherland's stop-shot steps, the GC stop's distances, crush calibration, 29.1.6.3.
- **Calibrating the lawn's pace or the stroke's speed** to the distance check (§3). The check is recorded; any
  calibration waits for its verdict and a further ruling. The lawn's pace is never tuned alone.
- **The double tap** (11 GC stop runs at drive 1): re-tallied only. Detecting and flagging it in the follow-through is
  carried.
- **Ball-make presets** (P3).
- **R4** (planned hands moving along aim at contact drop to rest under an advance), **the push scale**, **the level
  stroke's 46 ms hold**, **hands-assisted defaults**: carried as P2b.2b.2c.1 left them.
- **Unifying the hand load across modes**: swing and carry mode's `handLoad` branches stay, and the checking force is
  swing mode's alone (§4.1), recorded in the roadmap's list of where the modes branch.
- **The weak stroke stopped dead**: stays `it.todo`.

## Amendments

Plan decisions and gate rulings are recorded here in the user's words.

### The sensitivity gate (user, 2026-10-20)

Put as one question with four options, pros, cons and a recommendation, on the figures in
`docs/superpowers/probes/2026-10-19-p2b2b2c2-sensitivity.txt`. Only the ball–ball contact time moves the stop (2.34
to 8.28 across its bounds; no hand parameter moves it by more than about 0.15), so every reachable pair includes it.
The drive's ratio has two levels: 2.5–3.6 whenever the impact raises `impact-off-face` (today's canonical drive does),
4.77–4.89 when it does not. The coupling's period, its damping ratio and the arm mass each flip it between them
abruptly; the reach slack moves it smoothly across its whole range (4.62 to 3.31) and leaves the stop unchanged. The
effective mass stays within 0.9·m ≤ m_eff ≤ M (ruling D, P2b.2b.2b.2c) at every point.

(Corrected 2026-10-20, after the gate: "2.5–3.6 whenever the impact raises `impact-off-face`, 4.77–4.89 when it does
not" is retracted as stated. In the period, damping-ratio and arm-mass sweeps the drive jumps between a lower band
(about 1.3–3.6, 1.3493–3.6095) and an upper band (about 4.76–4.89, 4.7550–4.8933). `impact-off-face` is raised at
every lower-band point but also at some upper-band points (ζ 0.6: 4.7905; the arm mass 0.5 kg: 4.7550), so it does
not mark the band. The contact-time and reach-slack sweeps move the drive without such a jump (the contact time's
2.0439–3.9269, the reach slack's 4.6207 to 3.3085). No hand parameter moves the stop by more than about 0.5 across
its bounds (the arm mass's 6.33 to 5.84), not 0.15, which is the arm mass's slope per bound width. The ruled pair
rests on the reach slack's smooth effect, which stands; the jump is one clearance threshold (see "The drive's double
hit and the step divided").)

- **The pair to fit:** "Contact time + reach slack (Recommended)": `ballBallContactTime` and `reachSlack`. The
  probe's own ranking by slope angle put contact time + arm mass first; the recommendation departed from it because
  the arm mass's jump in the drive lies inside its bounds. The per-preset grips are not needed (a shared pair is
  reachable), and no bound is widened before the fit.

### The fit's outcome (user, 2026-10-20)

The ruled pair did not converge (101 evaluations). The closest point, by the larger error over its tolerance, is the
contact time 0.762 ms and the reach slack 10 mm, its lower bound: the drive 3.89 (−0.34) and the stop 6.13 (−1.02),
both outside Gugan's tolerances and inside the CA bands. With the stop on target (0.814 ms) the drive reaches about
3.74. The drive's ratio is not smooth: near-identical points give 3.55 or 3.75 as the off-face contact comes and goes,
and its two levels (about 2.5–3.8 with the contact, about 4.8 without) straddle Gugan's 4.23. (The two levels are
recast as one clearance threshold in the next Amendment.) Put as one question with four options (diagnose the
off-face contact first; accept the closest; the stop on target; widen the slack's bound).

- **Ruling:** "Diagnose off-face first (Recommended)": one bounded probe of the canonical drive's off-face contact
  (which ball, when, which part of the head, why it switches), then the question is put again. Nothing is written to
  `contact.json` until then.

### The drive's double hit and the step divided (user, 2026-10-20)

The diagnosis (evidence only, no code changed): on the canonical drive the off-face contact is a double hit. After the
face releases the striker's ball (1.5 ms) the head slows to 0.80 m/s; the swing-mode bottom hand's post-contact push
(`guideEffort` 1, restoring the planned arc's speed) brings it back to 1.81 m/s, and at 109 ms the rising, face-up
head catches the striker's ball (rolling at 1.16 m/s) with its lower front edge, taking it to 1.71 m/s and its travel
from 1.22 to 1.84 m. Without the catch the drive's ratio is about 5.0 (`guideEffort` 0: 5.01; 0.5: 4.75); the "two
levels" are one clearance threshold (2.6 → 0.6 → 0.2 mm → contact), stable at half and double the impact step. The
3.54/3.74 flips at near-identical points are a stick/slip branch on the catch's first step in the face–ball
tangential law, and they vanish at half and double the step; the drive's own ratio is not step-converged (3.31, 3.48,
3.47 at 5, 2.5 and 10 µs). Put as one question with four options (a new step first; grow this step; accept the
closest; fit the stop only).

- **Ruling:** "Split: new step first (Recommended)". This branch lands without the fit: the tidy, the sources and
  targets, the evaluator and the distance check, the checking force, the sensitivity probe, the fit's script and its
  unconverged attempt, and the diagnosis, each recorded. A new step settles the drive's follow-through (whether the
  head re-accelerates after contact) and the impact's step convergence, then fits. The jab's and the control run's
  re-runs (§7), which the spec places on the fitted model, move with the fit; this branch's pre-flight gate keeps the
  sections that do not need the fit (A on `main`'s model, B, C as ruled, H).

### The pre-flight gate (user, 2026-10-20)

Each section was put as one question with options, pros, cons and a recommendation, on
`docs/superpowers/probes/2026-10-20-p2b2b2c2-gate.txt`.

- **A, the distance check** (unchanged by this branch). The strike's share is ×0.98, ×0.96, ×0.97 on A1D–A3D and
  ×1.20 on A4D against the TEXT file's 8.62 m/s, ×1.03 against Gugan's own reading of 10.03 m/s; the lawn's share is
  ×0.56 (A1D, a very short stroke), ×0.88, ×0.86, ×0.73; Gugan 5's drive ×0.95 of about seven yards. Before ruling the
  user asked whether the croquet ratios are right (they are not: the drive 3.31 and the AC stop 5.91 against 4.23 and
  7.15) and whether the lawn's pace bears on them (it does not to first order: both balls slow alike, so the ratio is
  the square of the two launch speeds' ratio, set in the impact). **Ruling:** "Lawn pace, not the stroke
  (Recommended)": the strike matches the CA within 2–4 % (A4D on Gugan's reading); the distance gaps are the lawns'
  pace, the CA's faster than the default and the user's slower. The effort ceiling's row stands.
- **B, the checking force.** The canonical GC stop's bottom hand slides to 23.8 mm at 10 ms on `main` and stays
  there; on this branch it returns to 0.11 mm, and the head finishes 8.4 mm along aim (was 65.1 mm). The same 19 GC
  stop runs slide, each recovering to 0.5 mm or less; 9 single-ball runs at 3 m/s and drive −1 slide too (9.5 mm),
  because drive −1 plans a check and its hold grips, so §4.1's "the single-ball's runs never slide" holds only for
  drive 0. The 0.378 m of §4.3 does not reproduce on `main`: the largest offset over every run is 23.8 mm.
  **Ruling:** "Accept as it stands (Recommended)".
- **C, the sensitivity probe:** ruled above ("The sensitivity gate").
- **H, the ball makes.** The face law's fits come from a Jaques Eclipse (Gugan 2000), Gugan 5's targets from Dawson
  Internationals; le Maitre's 2.7–4.2 by make is his stop shot (forward over backward ball), not his drive, as §6.3
  had it (his drive or roll gives 1.8–2.8 as printed). **Ruling:** "Targets stand, record (Recommended)".
- **D–G** move with the fit to the new step. No test was re-baselined on this branch.

### Plan decisions and the builder's rulings

The plan's "Decisions made while planning", each with its reason:

1. `handLoad` takes the step's `dt` as a required argument before `gripped`, so no caller can forget it.
2. τ_arm is `hands.flex.hold`'s damping over its stiffness (27.8 ms on the default body), and a null `hold` keeps every
   offset as before, so the test hands' grip-limit tests stay bit-identical.
3. The decay acts in `handLoad`'s pre-contact spring branch, swing mode only, per hand, on a hand that did not saturate
   in that call, after the load is computed, so it holds §4.1's constraints 1 to 4.
4. The follow probe sees each hand's force and its offset (`FollowSnapshot`'s `top`, `bottom` and `offsets`), probe
   only, so section B can measure the drift with no run's arithmetic changed.
5. The evaluator does not edit `contact.json`: the candidates enter through the world, the body and the planned
   contact's coupling, and a parity test pins it to `simulateShot` to the bit at today's values.
6. Every evaluation plans its target's speed exactly on the candidate's world and body, since the arm mass enters the
   downswing.
7. The solver is Newton on the two errors with a forward-difference Jacobian, clamped into the bounds, at most 20
   iterations and converged at 0.01 on each ratio, returning the closest evaluated point otherwise, as §5.3 and exit
   criterion 6 ask.
8. `swing.json` gains a top-level `ratioTargets` block of `readValue` entries (ratio and speed, Gugan 5 as source),
   exported as `ratioTargetsReference`, so the fit, the gate and the tests read one record.
9. The distance check's open lawn moves to `scripts/openLawn.ts`, shared by both probes, and the ball's speed at the
   face's release is read as `singleBallProbe` reads it, so the two compare like with like.
10. Every preset digest run keeps its trajectory, so the stops' holds, where the checking force acts, are in the
    ratchet.
11. The sensitivity probe's slope is a central difference of ±1 % of the bound's width (one-sided at a bound), a pair's
    distinctness the angle between its slope vectors scaled by the bounds' widths, and its reach a linear 2×2 solve, so
    the gate compares candidates on a common scale.

The builder's rulings during execution:

- `tests/engine/shot.test.ts` carries the two §8.1.4 tests.
- The solver's "closest" is the in-bounds minimiser of the larger weighted error, with a line search along the free
  coordinate when one coordinate pins at a bound, as exit criterion 6 defines it; this refines decision 7.
- The effective-mass mark uses the user's ruling D bound 0.9·m ≤ m_eff ≤ M (P2b.2b.2b.2c); §5.2's and exit criterion
  8's "within 10 % of the head's mass" is stale (today 1.1095 kg, +10.95 %, inside the ruled bound).
- Section C collects the follow-through's flags at the swept points only.
- Section B covers the single-ball and drive presets too, since any run planned with drive below 0 gets a check hold
  (§4.1's "the single-ball's runs never slide" holds only for drive 0).
- The carry-mode case of §8.1.5 is tested in the pre-contact branch, the only place the decay's carry guard acts.
- Task 7 (the held-out re-runs) and sections D–G move to P2b.2b.2c.2b with the fit.
