# P2b.2b.2b.3 — Turf Strike Beyond a Graze: Design

**Product spec:** `2026-09-30-croquet-shot-lab-design.md` §4 (impact phase).
**Swing spec:** `2026-10-04-p2b2b1-swing-shot-design.md` (the head–turf pair, §4; the re-entry guard).
**Stroke-shape spec:** `2026-10-06-p2b2b2a-stroke-shape-design.md` (the dip, the fat stroke, the follow-through).
**Laws spec:** `2026-10-09-p2b2b2b2a-strike-turf-laws-design.md` (the turf bed, §4).
**Mallet spec:** `2026-10-12-p2b2b2b2c-mallet-design.md` (the rounded box; ruling B).
**Roadmap:** P2 row; "P2b.2b.2a design (2026-10-06/07)" (the graze and the user's account); "P2b.2b.2b decisions and
findings (2026-10-08)" (the split, Gugan 5's jab); "P2b.2b.2b.2c outcomes (2026-10-13)" (the AC stop's dip).

**Why this step.** The head meets the turf as a plane with a linear spring (about 110 N per mm) and Coulomb friction
at its single lowest point. A light graze costs a fraction of the head's speed, as it should, but nothing ploughs: a
head driven deep or steeply into the ground meets the same spring, a weak stroke is never stopped dead, and no load is
too great for the hands. The user's account (2026-10-07, refined 2026-10-14):

- a light graze is a successful stroke with a fractional loss of speed; it may strip grass and damage the lawn
  slightly, then the head continues on its path, but only at a shallow ingress;
- a head biting in at an angle would need far more force to plough through the earth and out again than the hands
  could tolerate: the ground is "an immovable object", and the head's motion is impaired at once;
- a weak stroke is stopped dead.

It precedes P2b.2b.2c because the AC stop's calibration rests on the head–turf law: players stop the mallet either
with the hands alone or by grounding it deliberately, the jab (Gugan 5).

**Circularity.** Every figure of the law is a published measurement of turf, soil or the hand, or a labelled
placeholder, never a coaching ratio, Gugan's jab or the user's play. Gugan's jab is a held-out check (§7.3), not a fit.
The ratios are recorded, not gated; P2b.2b.2c calibrates them.

**Vocabulary.** "Split", "ratio" and "cut" keep their croquet meanings only. The head's drag through the turf is
**ploughing**, its depth the **ploughing depth**; Reece's literature calls it cutting. "Heel" is the head's back lower
edge.

## Decisions (user, 2026-10-14)

- **Housekeeping ships as a separate PR first.** typescript-eslint 8.71.1 → 8.71.2 is the only bump. TypeScript 7.0.2
  stays blocked: typescript-eslint 8.71.2 needs TypeScript `>=4.8.4 <6.1.0`, svelte-check 4.7.6 `^5 || ^6`. The
  actions (checkout v7, setup-node v7) and `ubuntu-26.04` are current; the repo has no IaC. This branch is rebased on
  the housekeeping merge before the plan executes.
- **The grip that breaks is the player's**, not the turf's hold on the head. A head biting in meets resistance beyond
  what the hands can bear.
- **The hands' grip has a force limit** (§5), over flagging and ending the stroke and over hands that hold whatever
  the load. Whether the grip releases violently or the hands simply cannot push further is moot (user): either way the
  head is stopped and the hands cannot drive it on, which is all the ball and the stroke see. One saturating limit
  models both.
- **Gugan's jab is a held-out check, banded** (§7.3), over a fit target (the AC stop's later calibration would rest on
  a fitted law) and over a figure recorded with no band.
- **The jab is the AC stop's deliberate grounding of the head** to break its momentum (user). Players use both it and
  the hands' check. The user finds the jab highly effective on a hard stroke, where the hands cannot suspend the
  momentum alone; but its downward motion conflicts with hitting the ball slightly on the up.
- **The canonical AC stop stays the hands' check; the jab is a player input** (§6.1), over a jab default and over two
  presets. Ruling B stands: the canonical AC stop clears the turf.
- **The law is approach A** (§4): a ploughing law on the plane turf from the head's submerged section, over the head on
  the balls' cell bed (the bed is elastic, with no ploughing; its sphere geometry is hard-coded; it would still need
  the same plastic and drag terms) and over a Poncelet drag at the lowest point (blind to the angle of attack and the
  ploughed width; its figures are for dry glass beads).
- **Grip tension does not scale the limit.** A loose, surprised grip is a P3 refinement.

## 1. Goal and exit criteria

The head ploughs through the turf by the angle of attack and the depth it reaches: a shallow graze costs a fraction of
its speed; a weak stroke is stopped dead; a head biting in meets resistance past the hands' limit, and the hands
saturate. The jab becomes a player input, checked against Gugan 5.

Exit criteria:

1. The analytic cases of §7.1 hold.
2. The ratchet of §7.2 holds.
3. The three regimes of §7.4 each occur on their constructed setups.
4. The jab check of §7.3 passes.
5. Every preset's canonical setup meets P2b.2b.2b.1's exit criterion 4: `simulateShot` with `trajectory: true` runs
   from top to finish with no `RangeError`, no re-entry guard hit, no ball centre more than 5 mm above R (but for the
   pass roll's turf rebound, accepted at 20.76 mm on 2026-10-13, re-measured and listed; a larger rise goes to the
   gate), no `follow-cap`, and the trajectory continuous at every boundary.
6. No impact ends with the head overlapping a ball as handed over, over the late re-hit sweep of every preset.
7. The pre-flight gate (§8) has run and the user has ruled on it.
8. The figures of §9 are recorded in the roadmap. They are observations, not gates.
9. `ENGINE_VERSION` is "0.12.0".

## 2. Architecture

```
src/engine/impact/
  headTurf.ts        new: the head–turf law (§4): the columns under the head, the bearing, the ploughing and the
                     sole's friction; its state (each column's set, the friction spring, the timeline)
  contacts.ts        the head's underside height over a column (§4.1), for the round head and the rounded box;
                     headBottom stays (the early-out and impact-head-deep)
  integrate.ts       applyHeadTurf calls headTurf.ts in the impact and in continueStroke; turf-yield and grip-limit
  track.ts           handLoad clips each hand's force (§5)
  simulateImpact.ts  headTurfLaw builds the new law from SurfaceProps; the plane PairLaw goes
  types.ts           the new events; HeadTurfLaw
src/engine/swing/
  types.ts           ShotSetup.stroke.jab; SwingProfile.body.gripLimit
  buildContact.ts    the jab deepens the planned dip
  profile.ts         the default gripLimit
src/engine/types.ts  SurfaceProps gains the turf's ploughing and yield figures
src/engine/world.ts  their defaults
reference/contact.json, reference/sources/README.md
```

The law runs wherever the head–turf pair runs today: in a tracked drive's impact and in its follow-through. A force
table keeps no head–turf pair (`impact-mallet-grounded` as before).

## 3. The law's frame

The turf is the plane z = 0, as now. The soil is fixed in the world, so its state lives on the turf bed's world lattice
(`BED_CELL`, h = 2 mm; cell (i, j) centred at ((i + ½)h, (j + ½)h)): a column the head has yielded keeps its new floor
as the head moves on, and a furrow stays behind it. The head's columns are its own; the balls' beds are untouched, and
a head and a ball pressing one column is outside the model, as two balls are today (`integrate.ts`).

## 4. The head–turf law

### 4.1 The columns

Each step, when the head's lowest point (`headBottom`) is below the plane, the law visits every column within the
head's horizontal bounds (padded one cell), in mirror pairs across aim as `bedLoad` does, so that a symmetric stroke
gives a symmetric force to the last bit. For each column the head's underside height z_u is the entry of the vertical
line through the column's centre into the head (the rounded box: the Minkowski sum of its core box and a sphere of the
edge radius; the round head: its cylinder). A column is submerged while z_u < 0, its depth δ = −z_u, its area h².

### 4.2 Bearing

Each submerged column is elastic–plastic, with a set s ≥ 0 (zero until it yields):

- p = k_w·((δ − s) + τ_r·(δ − s)′), the turf bed's own modulus k_w and recovery τ_r (`SurfaceProps.bedModulus`,
  `bedRecovery`), so the head stands in the turf the balls stand in; p is never negative (a column does not pull);
- while p > p_y, the yield pressure: p = p_y and the set moves, s = δ − p_y/k_w, so the column keeps its new floor;
- the column's force h²·p acts upward at the column's point on the head's underside.

A yielded column returns only its elastic part, p_y/k_w at most; the rest of the head's descent into it is plastic
work, lost. The first column to yield in a run raises `turf-yield`. The sets last the impact and its follow-through;
lasting damage and divots stay deferred (P2 row).

### 4.3 Ploughing

The head's material ahead of the turf it moves into ploughs it (Reece's fundamental earthmoving equation, as Mak &
Chen give it, D = (ρ·g·d²·N_γ + c·d·N_c + ρ·v²·d·N_a)·w):

- the motion's direction is the horizontal velocity of the head's centre; below a speed floor of 1e-9 m/s nothing
  ploughs;
- the submerged columns are binned into strips h wide across that direction; each strip's ploughing depth d_s is its
  deepest column's δ, and its point and speed v_s that column's (the head's material velocity there, horizontal);
- each strip resists with h·d_s·(c·N_c + ρ·g·d_s·N_γ + ρ·v_s²·N_a) against v_s, at that point.

c is the root mat's strength; ρ the rootzone's density; N_c, N_γ, N_a Reece's factors (§6.2). The angle of attack
enters through the geometry alone: a head sliding along its sole has shallow strips; a heel or a face driven in
steeply has deep ones, and the c·d term grows with d, the N_γ term with d². The c term does not depend on speed, so a
weak stroke loses all its momentum to it: stopped dead.

### 4.4 The sole's friction

The bearing's total N_b acts with Coulomb friction µ (`headTurfFriction`, 0.5, unchanged) through one Cundall–Strack
spring, as today, at the bearing's centre of pressure, on the slip of the head's material there. Its slide feeds
`headTurfSlide` (29.1.14) as before.

### 4.5 What stays and what goes

- `headTurfContact`'s single point, `lawFromStiffness` for the head and `turfStiffness`'s use by the head go; the
  figure's note in `contact.json` records that it no longer feeds the head (nothing else reads it today; the plan
  confirms and retires it if so).
- `impact-head-deep` keeps its 2 mm mark, re-noted: it marks a stroke gone beyond a graze that has probably damaged the
  lawn, not a limit of the model. `follow-head-deep` likewise.
- The timeline (`head/turf`), peak penetration and entry jumps keep their keys and meanings, the depth now the deepest
  column's.

### 4.6 Expected sizes

From the sourced mid-range figures (§6.2), across the 57 mm face: a 1 mm graze ploughs with about 10 N, a fractional
loss for a 1 kg head; at 10 mm about 150 N; at 20 mm about 300 N plus the bearing, past the hands' limit. These are
orders of magnitude for the design; the analytic cases and the probe measure them.

## 5. The hands' limit

- Each hand's force on the mallet, as `handLoad` computes it in every branch (the downswing's dampers, the firm grip,
  carry mode's chain, the pendulum push, a stop's `gripped` springs), is clipped to a magnitude F_max
  (`SwingProfile.body.gripLimit`), with the same shape for both hands.
- Where the hand holds a position spring, its anchor slides when the limit is reached (the Cundall–Strack form), so no
  spring energy builds past it and comes back. Where it holds only a damper, the clip is a cap.
- The twist each hand gives is limited by the same force at the grip's radius (half the shaft's diameter, the plan's
  figure, sourced or labelled).
- The first saturation of either hand in a run raises `grip-limit`, with the hand. It is recorded, not judged: a
  spoiled stroke is not a fault.
- Below the limit the code path is the same arithmetic as today's, so a run that never saturates is bit-identical.
  Today's hands stay far below 435 N (the push caps at 92.2 N, the pendulum push at 64.3 N, and the coupling, T 0.08 s,
  smooths the ball's 1 ms strike); the ratchet's step 1 proves it (§7.2).

## 6. Inputs and data

### 6.1 The jab

`ShotSetup.stroke.jab` (m, ≥ 0; absent: 0): the hands' planned dip before contact deepens by `jab` on top of the
preset's `handDrop`, on the dip's own timing (`timing.dip`, `dropTime`). It is open to every swing-mode stroke (a jab
on any of them is a stroke a player can play, and the turf answers it), and carry mode rejects a non-zero jab with a
`RangeError` (a roll's hands lead on their own arc). At 0 every stroke is unchanged to the bit. A jab of a few
millimetres grounds the box's heel shortly after the strike; the probe finds the range (§9).

### 6.2 Reference data

In `reference/contact.json`, each entry with its value, bounds, provenance and source in the file's style, and each
source in `reference/sources/README.md` with its URL, access date, SHA-256 and short annotated quotes, never mirrored.
All accessed 2026-10-14.

| Figure | Default | Bounds | Source; provenance |
|---|---|---|---|
| Bearing yield p_y | 240 kPa | 170–310 kPa | Crum (MSU): sand rootzones' ultimate bearing, "on the order of 45 psi" well graded, "up to 25 psi" poorly graded; measured |
| Root mat strength c | the bounds' midpoint | provisionally 70–140 kPa | Mascitti, McNitt & Serensits 2017: shear vane 17.8–33.6 N·m (7.0 cm head, 2.0 cm fins); the conversion to a strength is ours, labelled: the plan recomputes the bounds from the vane's published geometry by the standard vane formula and records the working |
| Rootzone density ρ | 1400 kg/m³ | 1200–1600 kg/m³ | Anderson et al. 2018: sandy rootzones "1.2–1.6 Mg/m3"; measured |
| N_c, N_γ, N_a | 1.71, 2.45, 0.35 | — | Mak & Chen 2014 (Reece 1964), their shallowest tabulated depth at rake 18.5°; labelled: no open table against rake exists, and our depths are millimetres against their 50 mm |
| The hands' limit F_max | 435 N | 408–462 N | Young et al. 2009: breakaway strength with the load along a vertical cylinder, 435 ± 27 N; measured |
| Sole friction µ | 0.5 | 0.3–0.7 | unchanged (Hall's ball sliding, an analogue) |
| k_w, τ_r | the bed's | — | unchanged (P2b.2b.2b.2a's fit to Gugan 4) |

Cross-checks, cited but not used as values:
- Katsuragi & Durian 2007 (the inertial drag 0.8·ρ·A·v², against Reece's N_a·ρ = 0.35·ρ);
- Seo et al. 2008 (hand–handle µ 0.33–0.77; axial push 65–179 N);
- Schmidt 2007 via Tutelman (golfers' grip 160–500 N at impact);
- Woods 2012 (Clegg 57–137 g on greens);
- Caldwell 2023 (the only golf club–ground model; "no experimental data to compare these contact forces").

No measurement anywhere gives a club's or a mallet's loss of speed in turf.

### 6.3 The public API

`ENGINE_VERSION` 0.11.0 → 0.12.0:
- `ShotSetup.stroke.jab`;
- `SwingProfile.body.gripLimit`;
- `SurfaceProps` gains `turfYield`, `turfMatStrength`, `rootzoneDensity` and `ploughFactors` (`{ cohesion; weight;
  inertia }`), so that P3's lawn presets can vary them: hard, dry ground and soft lawns differ here;
- the impact events `turf-yield` and `grip-limit` (`{ hand: "top" | "bottom" }`).

## 7. Testing

### 7.1 Analytic cases

Each its own test, on the law alone or a head driven along a set path:

1. **Bearing.** A level box pressed statically δ deep below yield gives k_w·δ·A; past it, p_y·A. A yielded column
   unloads only its elastic part, so a press-and-release cycle loses exactly the plastic work.
2. **Ploughing.** A box translated at constant depth d and speed v along aim gives w·d·(c·N_c + ρ·g·d·N_γ +
   ρ·v²·N_a) (w the submerged width in whole columns), and zero at d = 0.
3. **The dead stop.** A free head ploughing at fixed depth from a low speed comes to rest within the closed-form
   distance (m/(2k))·ln(1 + k·v₀²/F₀), F₀ the speed-free terms (the sole's friction among them) and
   k = h·Σ_s d_s·ρ·N_a.
4. **The angle of attack.** Entering at the same speed and depth, a steeper path gives a greater peak ploughing force,
   monotonically over a sweep of path angles.
5. **The hands' limit.** A hand driven against a fixed head saturates at F_max, stores no spring energy past it (its
   anchor slides), and returns under the limit once the load falls.
6. **Symmetry and convergence.** A stroke mirrored across aim gives a mirrored force to the bit; the results converge
   in dt and in the lattice size.

### 7.2 The ratchet

The baselines are taken on `main` in Task 1, before any change: the throwaway preset digest, `scripts/impactDigest.ts`,
`scripts/shotMix.ts` phase 2 (its timing lines dropped) and `scripts/impactProbe.ts`.

1. After the hands' limit: all four bit-identical. Any run that saturates is listed for the gate.
2. After the new law: the impact digest and `impactProbe` unchanged (force tables have no head–turf pair); the shot
   mix's phase 2 bit-identical; the preset digest moves only on runs whose head meets the turf, each moved run listed
   with its head–turf interval (the full and pass rolls' `follow-head-deep` finishes among them).
3. After `stroke.jab` at 0: all bit-identical to step 2.

### 7.3 Gugan's jab (gated, banded)

Gugan 5 (https://oxfordcroquet.org/tech/gugan5/): stop-shots "by using a downward 'jab' just before impact, so that
friction between the ground and the heel of the mallet stops it soon after impact", at about 3 m/s; over the seven
lowest ratios the mallet's speed at the second tap is 0.400U against 0.463U unrestricted, and the best stop reaches
0.295U.

The AC stop at 3 m/s on its canonical setup sweeps `jab` from 0 to 8 mm in 0.5 mm steps. A depth qualifies when the
head–turf pair first closes after the first face contact and before the second. The check passes when at least one
depth qualifies and every qualifying depth whose deepest column stays within `HEAD_DEEP_LIMIT` (2 mm, a graze: Gugan's
mechanism is the heel's friction) gives a second-tap speed within [0.295, 0.463]·U, U the head's speed at the first
contact and the second-tap speed the head centre's along aim at the second face interval's start. The full sweep,
0.400U and the no-jab value (the model's hands' check, not Gugan's unrestricted swing) are recorded.

"The jab helps more on a hard stroke" (user): the jab's reduction of the second-tap speed against no jab, at 2, 3 and
4 m/s at the shallowest depth that qualifies at 3 m/s, recorded, not gated.

### 7.4 The three regimes (gated, qualitative)

On constructed setups the plan fixes, each must occur:

1. **A light graze.** A single-ball stroke whose dip grounds the head before the ball at under 2 mm: the ball is
   struck and the head keeps most of its speed (the loss recorded).
2. **A weak stroke stopped dead.** A low-intensity stroke at about 1 m/s with an early dip: the head comes to rest in
   the turf before it reaches the ball.
3. **A head biting in.** A hard stroke with a deep jab or early dip: `grip-limit` is raised.

### 7.5 The existing tests

- The `LEGACY_MALLET` AC-stop turf tests (`shot.test.ts`: 29.1.14 only in a stroke of Law 29.2.3; the relaxed head
  meets the turf after the ball and the turf brakes it; a dip 30 ms early meets the lawn before the ball) move onto the
  default box through `stroke.jab`, closing ruling B's follow-up. The sunk-ball handover runs (ruling C) stay on the
  legacy head.
- Every test whose head meets the turf is re-baselined, its comment "P2b.2b.2b.3: the turf strike (was …)".

## 8. The pre-flight gate

After the law (§4) and the hands' limit (§5) land and before any jab figure is trusted, the plan stops for the user
with:

- the three regimes' runs (§7.4), each with its forces, depths and speeds over time;
- p_y and c within their bounds: the regimes and the jab at both ends of each;
- every preset run the ratchet's step 2 moved, and any run that saturated at step 1;
- the canonical runs' figures against the baseline.

The user rules in their own words; every ruling and figure goes into this design's Amendments and the roadmap's
outcomes.

## 9. Recorded figures

In the roadmap's "P2b.2b.2b.3 outcomes", from the probes on the branch against the Task 1 baseline:

- the jab sweep at 2, 3 and 4 m/s: the depth the heel first grounds, the second-tap speed, the ratio, the deepest
  column, `turf-yield` and `grip-limit`;
- the regimes' runs;
- every preset's canonical figures and the sweep's cap and flag tallies, as P2b.2b.2b.2c recorded them;
- the AC stop's `dip` sweep on the new law;
- the full and pass rolls' follow-through finishes;
- the cost: the head–turf columns visited per step (mean and worst), the tracked impacts' steps, and `shotMix`'s
  engine time, run alone.

## 10. Out of scope

Kept where they are, from #25 and #26:

- the turf rebound's sourced loss (the pass roll's 20.76 mm);
- the push running on after the ball;
- the full roll at 1 m/s never releasing;
- the impact's quiet end firing while a ball rises;
- the `rising` latch's hysteresis;
- the pass roll at 2 m/s off point;
- the drive's second contact on the box's edge;
- whether the hands' twist gains scale with I_z, and the face law's off-centre closure (P2b.2b.2c);
- the measured edge radius and the Pidcock 2000's own figures (P3).

Also out: grip tension scaling the limit (P3); lasting turf damage and divots (P2 row, deferred); the head and a ball
sharing turf.

## Amendments

None yet.
