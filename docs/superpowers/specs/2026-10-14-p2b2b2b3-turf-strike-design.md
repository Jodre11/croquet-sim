# P2b.2b.2b.3 — Turf Strike Beyond a Graze: Design

**Product spec:** `2026-09-30-croquet-shot-lab-design.md` §4 (impact phase).
**Swing spec:** `2026-10-04-p2b2b1-swing-shot-design.md` (the head–turf pair, §4; the re-entry guard).
**Stroke-shape spec:** `2026-10-06-p2b2b2a-stroke-shape-design.md` (the dip, the fat stroke, the follow-through).
**Laws spec:** `2026-10-09-p2b2b2b2a-strike-turf-laws-design.md` (the turf bed, §4).
**Mallet spec:** `2026-10-12-p2b2b2b2c-mallet-design.md` (the rounded box; ruling B).
**Roadmap:** P2 row; "P2b.2b.2a design (2026-10-06/07)" (the graze and the user's account); "P2b.2b.2b decisions and
findings (2026-10-08)" (the three steps, Gugan 5's jab); "P2b.2b.2b.2c outcomes (2026-10-13)" (the AC stop's dip).

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
                     headBottom stays (the early-out)
  integrate.ts       applyHeadTurf calls headTurf.ts in the impact and in continueStroke; the settle test (§4.6);
                     turf-yield, grip-limit and impact-head-stopped; the follow-through's flags
  track.ts           handLoad clips each hand's force (§5); GripState carries each hand's slid offset
  simulateImpact.ts  headTurfLaw builds the new law from SurfaceProps and validates it; the plane PairLaw goes
  types.ts           the new events; HeadTurfLaw
src/engine/swing/
  types.ts           ShotSetup.stroke.jab; SwingProfile.body.gripLimit
  buildContact.ts    the jab deepens the planned dip
  profile.ts         the default gripLimit
src/engine/types.ts  SurfaceProps gains turfYield and turfMatStrength, and loses turfStiffness and turfRestitution
src/engine/world.ts  their defaults and validation
reference/contact.json, reference/sources/README.md
```

The law runs wherever the head–turf pair runs today: in a tracked drive's impact and in its follow-through. A force
table keeps no head–turf pair (`impact-mallet-grounded` as before). The law's figures come from `SurfaceProps` once per
run, as `headTurfLaw` reads them today: the lawn is uniform, and a lawn that varies over its area is P3's.

## 3. The law's frame

The turf is the plane z = 0, as now. The soil is fixed in the world, so its state lives on the turf bed's world lattice
(`BED_CELL`, h = 2 mm; cell (i, j) centred at ((i + ½)h, (j + ½)h)): a column the head has yielded keeps its new floor
as the head moves on, and a furrow stays behind it. The head's columns are its own; the balls' beds are untouched, and
a head and a ball pressing one column is outside the model, as two balls are today (`integrate.ts`).

## 4. The head–turf law

### 4.1 The columns

Each step, when the head's lowest point (`headBottom`) is below the plane, the law visits every column within the
head's horizontal bounds (padded one cell; narrowed by Task 5 to the head's part below the plane, see the plan's
amendments), in mirror pairs across aim as `bedLoad` does, so that a symmetric stroke
gives a symmetric force to the last bit. For each column the head's underside height z_u is the entry of the vertical
line through the column's centre into the head (the rounded box: the Minkowski sum of its core box and a sphere of the
edge radius; the round head: its cylinder). A column is submerged while z_u < 0, its depth δ = −z_u, its area h².

### 4.2 Bearing

Each submerged column is elastic–plastic, with a set s ≥ 0 (zero until it yields), its turf surface at −s and its
elastic deflection e = δ − s:

- yield tests the elastic part alone: while k_w·e > p_y, the set moves to s = δ − p_y/k_w, so e = p_y/k_w and the
  column keeps its new floor; s never decreases. The rate term below never moves the set, so s stays ≥ 0;
- p = k_w·(e + τ_r·e′), the turf bed's own modulus k_w and recovery τ_r (`SurfaceProps.bedModulus`, `bedRecovery`), so
  the head stands in the turf the balls stand in; e′ is the analytic rate, −u_z of the head's material at the column's
  underside point, as `bedLoad`'s w′ is (turfBed.ts); p is never negative (a column does not pull), and only an
  e > 0 column bears;
- the column's force h²·p acts upward at the column's point on the head's underside;
- when the head leaves a column (e ≤ 0), its surface stands at −s at once. τ_r is 0.76 ms, so a head that returns
  within the bed's recovery is rare, and the column keeps no elastic state of its own.

A yielded column returns only its elastic part, p_y/k_w at most; the rest of the head's descent into it is plastic
work, lost. The first column to yield in a run raises `turf-yield` (in the follow-through, the flag of §4.6). The sets
last the impact and its follow-through; lasting damage and divots stay deferred (P2 row).

### 4.3 Ploughing and the sole's friction: one horizontal resistance

Reece's fundamental earthmoving equation, as Mak & Chen give it, is D = (ρ·g·d²·N_γ + c·d·N_c + ρ·v²·d·N_a)·w. At the
head's millimetre depths its cohesion term is the whole of it: from the mid-range figures, at d = 2 mm and 3 m/s
across 57 mm the cohesion term gives 20.5 N, the inertia term 0.5 N and the weight term 0.01 N; at 20 mm and 4 m/s,
205, 8.9 and 0.8 N. The other two terms are 2–5 % of the force, inside c's own bounds, and their factors are
extrapolated from 50 mm tables, so the law keeps the cohesion term alone (spec review, 2026-10-14). Katsuragi &
Durian's inertial drag is cited as the check on that size, not used.

The ploughing and the sole's friction act together through one horizontal Cundall–Strack spring, so that a head can
stick in the turf and rest, rather than flip its drag's sign each step:

- **The ploughing resistance.** The submerged columns are binned into strips h wide across the direction of the
  spring's trial force (its elastic displacement plus this step's slip; along aim while both are zero). Each strip's
  ploughing depth d_s is its deepest column's elastic deflection e (the depth below the column's own floor −s, so a
  head moving back along its furrow ploughs only fresh turf). The strip resists with up to h·d_s·c·N_c.
- **The sole's friction.** The bearing's total N_b (§4.2) gives up to µ·N_b (`headTurfFriction`, 0.5, unchanged).
- **The spring.** Its cap is F_cap = µ·N_b + Σ_s h·d_s·c·N_c. Its stiffness is the turf bed's tangential form,
  k_w·h²·n over the n bearing columns, as `carrySpring` (turfBed.ts) has it, with no damping. It acts at the
  resistance's centre: the strips' points and the bearing's centre of pressure, each weighted by its share of F_cap.
  It slips on the horizontal velocity of the head's material there. It sticks while the trial force is within F_cap
  and slides at F_cap beyond it.
- **The slide** feeds `headTurfSlide` (29.1.14) as before.
- **Ploughing does not move the sets.** The soil the head ploughs aside is not tracked; a ploughed column bears on the
  turf beneath it.

c is the root mat's strength and N_c Reece's factor (§6.2). The angle of attack enters through the geometry alone:
- a head sliding along its sole has shallow strips;
- a heel or a face driven in steeply has deep ones, and the resistance grows with d.

The cap does not depend on speed, so a weak stroke loses all its momentum to it and the spring sticks: stopped dead.
**At rest** means the spring sticks and the head's centre moves horizontally at under 1 mm/s.

### 4.4 What stays and what goes

- `headTurfContact`'s single point and `lawFromStiffness` for the head go. `SurfaceProps.turfStiffness` and
  `turfRestitution` lose their only reader (`simulateImpact.ts`), so they leave `SurfaceProps` in 0.12.0. Their
  reference entries (`contact.json`'s `ballTurfStiffness`, `friction.json`'s `ballTurfRestitution`) are retired
  unless the plan finds another reader, which would keep them.
- `impact-head-deep` keeps its 2 mm mark and its measure, the head's lowest point (`headLowestPoint`). It is re-noted:
  it marks a stroke gone beyond a graze that has probably damaged the lawn, not a limit of the model.
  `follow-head-deep` likewise.
- The timeline (`head/turf`), peak penetration and entry jumps keep their keys and meanings, the depth now the deepest
  column's δ.

### 4.5 Expected sizes

From the mid-range figures (§6.2), across the 57 mm face: a 1 mm graze ploughs with about 10 N, a fractional loss for
a 1 kg head; at 10 mm about 100 N; at 20 mm about 200 N plus the bearing (a steep bite's footprint bearing p_y over
tens of cm², hundreds of newtons), past the hands' limit. These are orders of magnitude for the design; the analytic
cases and the probe measure them.

### 4.6 The run's end and the follow-through

- **The settle test.** Today a closed head–turf pair resets `quiet` (integrate.ts), so a head stopped in its furrow
  would hold the impact open until `impact-cap`. The head–turf pair now counts as closed for the settle test only
  while its spring slides or the head is not at rest (§4.3).
- **A head stopped dead before any face contact** ends the impact once it has been at rest for `RELEASE_STEPS` steps.
  The event `impact-head-stopped` is raised, and the run hands over as a run with no face contact does at the cap
  today: the balls as they lie, judged as such. This covers regime 2 (§7.4) and a jab that leaves the head resting in
  the turf.
- **In the follow-through** the law, the sets and the hands' limit act as in the impact. Its `FollowFlag` gains
  `follow-turf-yield` and `follow-grip-limit`, raised as the impact's events are, the first time in the
  follow-through. The figures of §7.3 and §9 read the impact's events and the follow-through's flags together.

## 5. The hands' limit

- Each hand's force on the mallet, as `handLoad` computes it in every branch (the downswing's dampers, the firm grip,
  carry mode's chain, the pendulum push, a stop's `gripped` springs), is clipped to a magnitude F_max
  (`SwingProfile.body.gripLimit`), with the same shape for both hands.
- Where the hand holds a position spring, its anchor slides when the limit is reached (the Cundall–Strack form), so no
  spring energy builds past it and comes back. Where it holds only a damper, the clip is a cap.
- **The slid offset persists** for the rest of the stroke, impact and follow-through. Each hand's offset is new state
  in `GripState`, zero until the hand first saturates. A hand that has slipped on the shaft, or an arm that has given
  way, does not creep back to the plan. Whether the grip broke or the arm gave way is moot (the user's decision), and
  either way the ground is lost.
- **In carry mode** the hand–arm chains (`advanceChains`) step under the clipped force: the hand transmits only F_max,
  and the chain feels what the hand transmits.
- **The twist is not limited** (spec review, 2026-10-14). `handLoad`'s twist is one combined term in its non-contact
  branch, with no per-hand share to clip; no regime or check needs the limit; and it would need a further figure (the
  shaft's diameter). It is deferred to P3 with grip tension, unless the gate shows a twist that ought to saturate.
- The first saturation of either hand in a run raises `grip-limit`, with the hand (in the follow-through, the flag of
  §4.6). It is recorded, not judged: a spoiled stroke is not a fault.
- `gripLimit` must be finite and positive; profile validation rejects anything else.
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
| Root mat strength c | 105 kPa | 73–138 kPa | Mascitti, McNitt & Serensits 2017: shear vane 17.8–33.6 N·m (a 7.0 cm head, 12 fins of 2.0 cm). The conversion is ours, labelled: a vane inserted from the surface shears its sides and its bottom end, T = π·c·(D²H/2 + D³/12) = 2.437e-4 m³·c, with D 7.0 cm and H 2.0 cm. It assumes the fins' "length" is their height; the plan confirms that from the paper's figure or methods. The other end conditions bound the doubt: both ends give 53–101 kPa, the sides alone 116–218 kPa |
| N_c | 1.71 | — | Mak & Chen 2014 (Reece 1964), their shallowest tabulated depth at rake 18.5°; labelled: no open table against rake exists, and our depths are millimetres against their 50 mm. A reference constant, not a `SurfaceProps` field |
| The hands' limit F_max | 435 N | 408–462 N | Young et al. 2009: breakaway strength with the load along a vertical cylinder, 435 ± 27 N; measured |
| Sole friction µ | 0.5 | 0.3–0.7 | unchanged (Hall's ball sliding, an analogue) |
| k_w, τ_r | the bed's | — | unchanged (P2b.2b.2b.2a's fit to Gugan 4) |

**c and p_y vary from lawn to lawn and from day to day** (user, 2026-10-14: "very variable depending on the
consistency and moistness of the turf"). Anderson et al. 2018 measure it: a clay rootzone's vane strength falls from
204 to 156 to 64 kPa as its water content rises from 14.8 to 17.5 to 20 %. The defaults stand for one well-grassed,
fairly firm lawn, not turf in general, and their bounds are one lawn's spread, not the range of lawns. That is why both
figures are `SurfaceProps` fields (§6.3): P3's lawn presets (with the user's "hard dry ground is more elastic … slow
lawns deform", 2026-10-09) vary them. Here, the gate runs the regimes and the jab at both ends of each bound (§8).

Cross-checks, cited but not used as values:
- Reece's full equation, as Mak & Chen give it, with their N_γ 2.45, N_a 0.35 and a rootzone density of 1.2–1.6 Mg/m³
  (Anderson et al. 2018): the sizes of §4.3 that justify dropping the weight and inertia terms;
- Katsuragi & Durian 2007 (the inertial drag 0.8·ρ·A·v², the same order as Reece's N_a·ρ = 0.35·ρ);
- Seo et al. 2008 (hand–handle µ 0.33–0.77; axial push 65–179 N);
- Schmidt 2007 via Tutelman (golfers' grip 160–500 N at impact);
- Woods 2012 (Clegg 57–137 g on greens);
- Caldwell 2023 (the only golf club–ground model; "no experimental data to compare these contact forces").

No measurement anywhere gives a club's or a mallet's loss of speed in turf.

### 6.3 The public API

`ENGINE_VERSION` 0.11.0 → 0.12.0:
- `ShotSetup.stroke.jab`;
- `SwingProfile.body.gripLimit`;
- `SurfaceProps` gains `turfYield` (p_y) and `turfMatStrength` (c), the seam the gate's runs at both ends of their
  bounds need and P3's lawn presets will vary (hard, dry ground and soft lawns differ here), each validated finite and
  positive in `world.ts` and `simulateImpact.ts` as the bed's figures are;
- `SurfaceProps` loses `turfStiffness` and `turfRestitution` (§4.4);
- the impact events `turf-yield`, `grip-limit` (`{ hand: "top" | "bottom" }`) and `impact-head-stopped`;
- `FollowFlag` gains `follow-turf-yield` and `follow-grip-limit`.

## 7. Testing

### 7.1 Analytic cases

Each its own test, on the law alone or a head driven along a set path:

1. **Bearing.** A level box pressed statically δ deep below yield gives k_w·δ·A; past it, p_y·A. A yielded column
   unloads only its elastic part, so a press-and-release cycle loses exactly the plastic work.
2. **Ploughing.** A box translated at constant depth d along aim, its spring sliding, resists with
   w·d·c·N_c + µ·N_b (w the submerged width in whole columns); with no submerged column, nothing.
3. **The dead stop.** A free head at fixed depth with speed v₀ comes to rest (§4.3) within the closed-form distance
   m·v₀²/(2·F_cap), the spring's elastic travel included, and then stays at rest.
4. **The angle of attack.** Entering at the same speed and depth, a steeper path gives a greater peak resistance,
   monotonically over a sweep of path angles.
5. **The hands' limit.** A hand driven against a fixed head saturates at F_max and stores no spring energy past it
   (its anchor slides). Once the load falls it returns under the limit with its offset kept.
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

The AC stop at 3 m/s on its canonical setup sweeps `jab` from 0 to 8 mm in 0.5 mm steps.

- **U** is the head centre's speed along aim at the first face interval's start. **The second-tap speed** is the same
  speed at the second face interval's start.
- **A depth qualifies** when the head–turf pair first closes after the first face contact begins, and before a second
  face contact or the impact's end.
- **A graze** is a qualifying depth whose head stays within `HEAD_DEEP_LIMIT` (2 mm, by `impact-head-deep`'s own
  measure, the head's lowest point). Gugan's mechanism is the heel's friction, a graze.
- **A graze with no second face contact** counts as a second-tap speed of 0, outside the band. Gugan holds that for
  touching balls the second tap is all but inevitable ("hard to imagine how for touching balls they ever could be"),
  so a model that stops the head short of it on a graze is wrong.
- **The check passes** when at least one depth is a graze and every graze gives a second-tap speed within
  [0.295, 0.463]·U.
- **Recorded:** the full sweep, 0.400U, and the no-jab value (the model's hands' check, not Gugan's unrestricted
  swing).

"The jab helps more on a hard stroke" (user): the jab's reduction of the second-tap speed against no jab, at 3 and
4 m/s, at the shallowest graze at 3 m/s; recorded, not gated. 4 m/s is close to the stroke's reach (4.09 m/s).

### 7.4 The three regimes (gated, qualitative)

On constructed setups the plan fixes, each must occur:

1. **A light graze.** A single-ball stroke whose dip grounds the head before the ball at under 2 mm: the ball is
   struck and the head keeps most of its speed (the loss recorded).
2. **A weak stroke stopped dead.** A low-intensity stroke at about 1 m/s with an early dip: the head comes to rest in
   the turf (§4.3) before it reaches the ball, and the impact ends with `impact-head-stopped`, not `impact-cap`.
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
- the jab against the hands' check at 3 and 4 m/s (§7.3): the second-tap speed with and without the jab, beside the
  hands' peak checking force and the turf's braking impulse. The turf's resistance hardly grows with speed (§4.3), so
  the jab's share of the braking can grow on a hard stroke, as the user finds, only if the hands' check weakens with
  speed. The model's only limit on the check is the grip's 435 N, a breakaway force far above what the arms can
  likely apply to check. If the jab helps less at 4 m/s than at 3, the gate records it, and the arms' checking force
  goes to P2b.2b.2c's calibration of the hands; this step does not change the law for it;
- every preset run the ratchet's step 2 moved, and any run that saturated at step 1;
- the canonical runs' figures against the baseline.

The user rules in their own words; every ruling and figure goes into this design's Amendments and the roadmap's
outcomes.

## 9. Recorded figures

In the roadmap's "P2b.2b.2b.3 outcomes", from the probes on the branch against the Task 1 baseline:

- the jab sweep at 3 m/s: the depth the heel first grounds, the second-tap speed against U, the head's lowest point,
  `turf-yield` and `grip-limit` (impact events and follow-through flags); and the one 4 m/s run of §7.3;
- the regimes' runs;
- every preset's canonical figures and the sweep's cap and flag tallies, as P2b.2b.2b.2c recorded them;
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

Also out: grip tension scaling the limit and the twist's limit (P3); lasting turf damage and divots (P2 row,
deferred); the head and a ball sharing turf; the soil the head ploughs aside.

## Amendments

**Spec review (2026-10-14)**, two reviewers (subtraction, completeness), every finding verified against the spec and
the repo before it was applied:

- Ploughing keeps Reece's cohesion term alone: the weight and inertia terms are 2–5 % of the force at these depths.
  This drops ρ and two factors from the law, makes N_c a reference constant rather than a public field, and turns the
  dead stop's closed form into m·v₀²/(2·F_cap) (§4.3, §6.2, §6.3, §7.1).
- Ploughing and the sole's friction act through one horizontal Cundall–Strack spring, with the bed's tangential
  stiffness, so that a head can stick and rest; "at rest" is defined (§4.3).
- The bearing's yield tests the elastic part alone. The rate is analytic. A released column's surface returns to its
  set at once. The ploughing depth is measured below the column's floor. Ploughing leaves the sets alone (§4.2, §4.3).
- The run's end: a head at rest in the turf no longer holds the impact open. A head stopped dead before any face
  contact ends the impact with `impact-head-stopped`. The follow-through gains `follow-turf-yield` and
  `follow-grip-limit` (§4.6).
- The hands' slid offset persists for the rest of the stroke; carry mode's chains feel the clipped force; the twist's
  limit is deferred to P3 (§5).
- `turfStiffness` and `turfRestitution` leave `SurfaceProps`, and the new fields and `gripLimit` are validated (§4.4,
  §5, §6.3).
- `impact-head-deep` and the jab's graze share one measure, the head's lowest point. The figures come from
  `SurfaceProps` once per run (§2, §4.4, §7.3).
- The jab check: U and the second-tap speed are defined; a graze with no second tap counts as 0, outside the band; at
  least one graze is required. The hard-stroke comparison runs at 3 and 4 m/s only, and the AC stop's dip sweep is
  dropped (§7.3, §9).

**After the review (2026-10-14).** c's bounds are worked from Mascitti's vane, 73–138 kPa (sides and bottom end
sheared), with the one open assumption named (§6.2). The user notes that the turf's strength varies with its
consistency and moisture; the defaults are one lawn's, and P3's lawn presets vary them (§6.2).

## Amendments (plan, 2026-10-17)

The plan (`plans/2026-10-15-p2b2b2b3-turf-strike.md`) made 26 decisions, listed below with their reasons. Decisions 1
and 2 the user ruled on 2026-10-15, before the plan was written; 22–26, and the changes to 10, 19 and 21, came from the
plan's review (2026-10-16). The user's rulings during execution and at the pre-flight gate follow, with the corrections
they make to this design's text. The gate's record is `docs/superpowers/probes/2026-10-16-p2b2b2b3-gate.txt`; the
figures are in the roadmap's "P2b.2b.2b.3 outcomes (2026-10-17)".

**Corrections to this design's text.**

- **§4.1, the columns** (decision 8; Task 5, df36880). The visit is the columns under the head's part below the plane
  (`headReach`), padded one cell, bit-identical to the extent's; law 385 → 36.9 µs per step. Where rounding leaves
  that part empty at a ulp's depth, the head's whole horizontal extent stands in (`headColumns`).
- **§4.3, the ploughing depth** (decision 1). "Each strip's ploughing depth d_s is its deepest column's elastic
  deflection e (the depth below the column's own floor −s, …)" is superseded: the depth is d = δ − s_entry, below
  the floor the column had when the head arrived over it.
- **§4.3, the spring** (decision 2). "With no damping" is superseded: the spring carries the bed's tangential damping.
- **§4.3, "at rest"** (user, 2026-10-16). "At rest" is the full |v|: the spring sticks and the head's centre moves at
  under 1 mm/s, counting the vertical speed. The horizontal speed alone let a plunging head end the impact before it
  yielded.
- **§4.3, "The cap does not depend on speed"** (decision 26) holds for the ploughing part only: the bearing's recovery
  term reads the head's descent, so the sole's friction, and with it the peak, rises with the angle of attack.
- **§4.3, Mak & Chen's equation.** The quotation is incomplete. Their Eq. 1, "according to McKyes (1985)", is
  D = (ρ·g·d²·N_γ + c·d·N_c + ρ·v²·d·N_a)·w·sin(α + δ). The law drops the factor sin(α + δ) (user, 2026-10-16: leave
  it out and show its effect at the gate). It resolves an inclined blade's force to the horizontal; the head's face
  and heel are near vertical, where it is cos δ, about 0.85–0.9; N_c is already off its geometry (rake 18.5°,
  labelled); and c's bounds absorb it. If wrong, the ploughing cap is up to about 1.15× high (1.45× at the paper's own
  rake). The gate's ploughing probe (user, 2026-10-17, "Yes, run it") scaled the ploughing ×0.9 and ×0.85: no verdict
  changes, and the graze's speed at the ball goes from 0.746 to 0.754 and 0.758 of the clear stroke's.
- **§4.6, the run's end** (user, 2026-10-16). Once the ball has gone (struck, the drive done, no face contact), the
  head–turf pair no longer holds the impact open: the turf contact hands over to the follow-through, which carries
  the bed (decision 14). A head resting on the turf, dragged along aim by the relaxed hands' pendulum at 26–75 mm/s,
  had held 20 more AC stop presets to `impact-cap`.
- **§5, the premise** "Today's hands stay far below 435 N" is falsified: 109 of the 1582 preset runs saturate a hand
  (single-ball 18, drive 9, GC stop 64, pass roll 18). The GC stop saturates 5 µs into its impact, where the check
  law's planned deceleration, older than the limit, asks the top hand for 442 N and the bottom for 782 N for about
  30 µs; every canonical GC stop raises `grip-limit` and `follow-grip-limit`. Below the limit the arithmetic is
  unchanged, as §5 says: every other run is bit-identical.
- **§6.2, the sources** (Task 1's reading). Crum gives 25 and 45 psi, 172.4 and 310.3 kPa, so p_y's bounds are 172–310
  kPa and the default, between two measured figures, is derived, not measured (decision 22). Mascitti's 17.8–33.6 N·m
  are the extreme means of its Table 3; the paper confirms the fins' 2.0 cm as their depth in the turf, their height,
  which closes §6.2's open assumption. Anderson's 204, 156 and 64 kPa are from compacted Fireclay samples (§6.2 said a
  clay rootzone), and its 1.2–1.6 Mg/m³ are its test densities. Seo's µ of
  0.33 and 0.77 (aluminium and rubber) are literature values the paper quotes, cited as such, with its axial pushes of
  65–179 N from its tables and text.
- **§7.3, Gugan's jab** (exit criterion 4): the check fails, at the defaults and at all four bounds. No graze has a
  second tap: the striker's ball leaves at 0.523·U, above the band's top of 0.463, in one face interval, before the
  head reaches the turf. The cause predates the turf law. User ruling 2026-10-17: "Keep .fails + ruling": the check
  stays `it.runIf(SLOW).fails`, its comment giving the ruling and the cause; P2b.2b.2c (the arms' checking force) may
  change it.
- **§7.4, the regimes** (exit criterion 3), on the setups found by decision 19's search, amended:
  - **The light graze**: single-ball, 3 m/s, `up` 0.01 m, dip −0.005 s, jab 1 mm; peak 1.700 mm; the head reaches
    the ball at 2.2377 m/s along aim, 0.746 of the same stroke clear of the turf. It is a fat contact about 0.2 m
    behind the ball, not a graze at it: struck 10 mm low, the arc meets the turf early, and the impact starts about
    75 ms before the planned contact.
  - **The weak stroke stopped dead**: none found, and not gated: its test is `it.todo`. The user's account from play
    (2026-10-16): a dig-in is an unintentional gross mis-hit, at any speed, when the head is off target low enough. It
    is likelier when casting hard, because the dip lands early, about 10 cm before the ball. The common case is the
    graze: lost power and the shot not attempted, otherwise only lawn damage. The planner rejects such a stroke by
    design; a dig-in is a future feature, needing a relaxed gross-mis-hit rule and shaft–ball contact.
  - **The head biting in** is redefined: the top hand held at its 435 N limit, to within 1 ppm, at any step while the
    head is in the turf. `grip-limit` cannot show it, since it fires only on a hand's first saturation, which in the
    found run comes with the head out of the turf. The rulings in sequence (2026-10-17): "Yes, require overlap"
    (`grip-limit` within a head–turf interval), which found no run; then "Hand held at limit in turf". The found run:
    single-ball, 4 m/s, `up` 0.01 m, dip −0.02 s, jab 5 mm; `grip-limit` at 37.61 ms; the top hand held at the limit
    in the turf from 42.65 to about 47 ms; head/turf 42.65–50.16 ms (after 5.25–29.55 ms); the ball leaves at
    2.9355 m/s. The jab alone also saturates the hand, so the run shows the jab and the turf coinciding, not the turf
    causing the saturation.
  - **The follow-through's flag** (not a regime): the half roll at 4 m/s, which runs to `follow-cap`.
  - The graze and the head biting in occur at all four ends of p_y's and c's bounds.
- **P2b.2b.1 §8.1's early dip** ("sends the striker's ball off slower") narrows to the speed along the lawn: on the
  box the early heel lifts the ball (vz 0.238 against 0.059 m/s), so its full speed is not slower (1.5721 against
  1.5677 m/s) while its speed along the lawn is (1.5540 against 1.5666). User ruling 2026-10-17: "Along the lawn +
  rename"; the test is retitled "… sends the striker's ball slower along the lawn".
- **§9, the cost** (the user's relayed note of 2026-10-15): the preset sweep costs ×1.34 (353.52 → 472.31 s, each timed
  alone); `shotMix`'s engine time about ×1.1; 262–460 columns per grounded step on the mean (the half roll's
  follow-through at 3 m/s 1,210, the worst, 2,046).

**The plan's decisions.**

1. **The ploughing depth is measured below the column's entry floor**, d = δ − s_entry: 0 in fresh turf, −s in a
   furrow the head has left. Yield caps e at p_y/k_w, about 1.48 mm on the default lawn, which would hold the
   ploughing under about 15 N across the face, against §4.5's sizes and §7.1 case 2.
2. **The horizontal spring carries the bed's tangential damping**: k_t = (2/7)·k_w·h²·n, c_t = √(2/7)·k_w·τ_r·h²·n, by
   `tangentialForce` with friction 1 and `carrySpring`. An undamped spring keeps a stuck head oscillating, so §7.1
   case 3 could never come to rest.
3. **The strips lie across the carried spring plus this step's slip**, at the bearing's centre of pressure (along aim
   when both are zero); the spring advances by the slip at the resistance's centre. This breaks the circularity of
   the centre depending on the strips and the strips on the slip.
4. **A strip's point is its deepest ploughing column's underside point**, the first in visit order on a tie: one
   point per strip, deterministic.
5. **The strips are summed in mirror pairs** in ascending p, as the bed sums its columns, so a mirrored stroke gives a
   mirrored resistance to the bit wherever the strip boundaries fall.
6. **The pair is closed while any column bears** (e > 0), its pressure clamped at 0: one closure drives the timeline,
   the slide, the settle test and the entry guard, with the deepest bearing column's δ and e′.
7. **A centre of pressure with no bearing force** is the deepest column's point, so it is always defined.
8. **The head's columns** are visited over its horizontal extent, padded one cell as a ball's footprint is: the
   rounded box bounded by its full half-extents, the cylinder by (L/2)·|a_k| + r·√(1 − a_k²).
9. **The rounded box's underside is exact**: the union of three slab-grown boxes, twelve edge cylinders and eight
   corner spheres, so the heel's and the edges' columns are right where the head bites.
10. **The hands' slid offset is held in the head's body frame** (changed at the plan's review): the anchor slides along
    the excess force, held in the head's frame so the follow-through's large rotations carry it with the mallet (§5:
    whether the grip broke or the arm gave way is moot); a world-frame offset would be left behind as the mallet
    turns. It slides only where the hand holds a position spring; damper-only branches clip.
11. **`HandLoad.saturated`** names the first hand to saturate in a step, the top hand if both: one event per impact,
    one flag per follow-through.
12. **`TEST_GRIP_LIMIT` is 1e5 N** in the test hands, far above any, so the tests written before the limit keep their
    figures; the limit's own tests set theirs.
13. **`impact-head-stopped`** fires when no face contact has closed and the head has been at rest for `RELEASE_STEPS`
    steps, overriding the drive window and the look-ahead, so a head stopped before the ball ends the impact rather
    than holding it to the cap (§4.6).
14. **The follow-through keeps the impact's bed**, its sets, entry floors and spring, so a furrow made in the impact
    stays under the follow-through; the timeline, the peak and the slide stay the impact's.
15. **`turfStiffness` and `turfRestitution` have no other reader**, so they go, and their reference entries with them;
    `lawFromStiffness` stays, unread by the head.
16. **N_c is `contact.json`'s `turfPloughFactor`**, exported as `PLOUGH_FACTOR`; `HEAD_TURF_FRICTION` moves to
    headTurf.ts, beside the law that reads it.
17. **The head's turf is validated under the head**: the four figures must be positive and finite there, as the balls'
    are under the balls.
18. **The jab deepens the planned dip** to `handDrop + (jab ?? 0)`, which is `handDrop` to the bit at 0.
19. **The regimes' setups are found by a fixed candidate grid** and pinned in the tests; a regime not found stops for
    the user. The follow-through's flag is searched the same way but is not a regime (changed at the plan's review).
    Amended by the user (2026-10-16): the grid adds `contact.up` from 0 to 0.02 m (a positive `up` strikes lower) with
    jabs of 1–6 mm (first relayed as −0.02 m; the sign corrected by the controller, the user told).
20. **U and the second tap are read on the face region's intervals**, from the head's state at each interval's start,
    so that only the face's contacts count as taps.
21. **The cost figures** count a step's columns as the law visits them, from the snapshot's head, with no engine
    field added (changed at the plan's review).
22. **turfYield's bounds are [172000, 310000] Pa and its provenance "derived"**: Crum's 25 and 45 psi convert to 172.4
    and 310.3 kPa, and 240 kPa lies between two measured figures.
23. **Every cost figure is timed with its job running alone**, at the same `COUNT` before and after, so the
    comparison is not the machine's load.
24. **The hand's slide** takes two forms. The firm grip's position spring slides as `tangentialForce` resets its
    spring, so it never stores the damper's force as stretch. Carry mode's chain slides by the excess over the palm's
    and fingers' stiffness, since the slip lies at the skin, in series with their spring and dashpot, and the chain's
    masses must feel what the hand transmits. The user kept it as written (2026-10-16).
25. **"Keeps most of its speed"** is the head's speed along aim at the ball above 0.5 of its speed at the turf, the
    probe's qualifying test and the test's assertion alike.
26. **The angle of attack**: with a level box at matched depth every column ploughs fresh turf whatever φ, so the
    ploughing part is equal; the peak rises through the sole's friction on the bearing. The test asserts both.

**The user's rulings.**

- 2026-10-15, before the plan: decisions 1 and 2.
- 2026-10-16: decision 24 kept as written; Mak & Chen's sin(α + δ) left out, its effect shown at the gate; "at rest"
  the full |v| (§4.3); the turf contact handed over to the follow-through once the ball has gone (§4.6); decision 19
  amended (`up` from 0 to 0.02 m, jabs of 1–6 mm), biting's qualifier to require head–turf contact; the dig-in account
  (§7.4).
- The pre-flight gate, 2026-10-17: the gate, "(a) Go on"; Gugan's jab check, "Keep .fails + ruling"; the early-dip
  test, "Along the lawn + rename"; biting, "Yes, require overlap", then "Hand held at limit in turf"; the ploughing
  probe, "Yes, run it"; gate round 1, "Go on".
- The final review, 2026-10-17: decision 10, "Accept 3D slide, reword". The slid anchor moves along the excess force
  in three dimensions, so it can drift partly across the shaft, and its drift is not bounded: the GC stop's
  follow-through drift reaches 0.378 m from the 435 N limit alone. Bounding it is left to P2b.2b.2c (the arms'
  checking force).

**The exit criteria.** All met but two, each ruled by the user: criterion 3's stopped regime (not gated, the dig-in
account) and criterion 4's jab check (kept as an expected failure).
