# P2b.2a — Obstacles in the Impact and the Fault Judge: Design

**Product spec:** `2026-09-30-croquet-shot-lab-design.md` §5 ("Phase 1 — Impact", hoop running), §2 (deferred
items), §9.
**Impact spec:** `2026-10-03-p2b1-impact-integrator-design.md` (§4 pairs, §6 handover, §11 deferred obstacle pair).
**Roadmap:** P2 row. P2b.2 is split (decided 2026-10-04): **P2b.2a** (this document) adds ball–upright and ball–peg
contact to the impact, a contact timeline, and a fault judge for the mallet faults of the Laws; **P2b.2b** adds the
swing model, its reference data, `simulateShot(setup)` and the stroke-level exit criteria, and exports both.

**Why first.** `simulateShot` makes a ball near a hoop or the peg an ordinary setup (a ball in the jaws). Today the
impact ignores obstacles: a ball driven into an upright passes through it, and phase 2 rejects the overlap with an
engine error. The Laws also make a ball touching an upright the scene of the crush faults (AC Laws 29.1.8, 29.1.9),
which the engine cannot represent without the contact. P2b.2a is independent of the swing model and is tested, like
P2b.1, with hand-built `ContactState`s.

**Amended 2026-10-04 (spec review: subtraction, completeness).** Every ball is paired with every obstacle (no reach
filter); a ball touching an obstacle starts at zero gap; obstacle pairs hold the impact open like the other hard
pairs; rim contact counts as mallet contact in the timeline; the judge reads the impact only, takes `group` from the
caller and validates its context; 29.1.6.3 is deferred for want of a sourced norm; 29.1.5 judges the first contact
only; head re-approach yields a possible 29.1.6.2; the roquet ordering at a shared instant is defined; the digest
keeps the P2b.1 lines byte-comparable; `peakDepth`, `faceGaps` and a separate obstacle-overlap field are dropped.

**Amended 2026-10-04 (plan).** 29.1.13 tests the croqueted pair's `peakPenetration` against `CONTACT_TOLERANCE`, not
its force against k·`CONTACT_TOLERANCE`: the impact result carries no laws, and the criterion is the same for the
spring term. Exemption ties favour the striker (an object hit starting with the roquet is not after it, one starting
with a mallet contact is not before it); "another object" excludes the roqueted ball (C29.20.4, "something else"); the
exemption covers every 29.1.6 and 29.1.7 row. `Finding.ball` is the touched ball for 29.1.11 and the croqueted ball for
29.1.13 (whose `t` is the impact's duration); 29.1.8 and 29.1.9 report one finding per obstacle. `clearanceAfter` is
the largest d − R from the nearer face plane over the gap's steps, set when the next interval opens. One helper places
a ball at zero gap for `prepareImpact` and the handover, which gains an `obstacles` parameter. `validateImpact` also
requires upright and peg restitution in (0, 1]. `laws.json` keys are Law numbers, with 29.1.6 split into its
sub-clauses. `ballObstacleContactTime`'s bounds are [0.435, 1.5] ms until pre-flight.

**Amended 2026-10-04 (pre-flight).** Pairing every ball with every obstacle cost 1.61–1.88× P2b.1's time per step on
the default world, so a reach filter skips a ball–obstacle pair while the ball cannot yet reach the obstacle: a
per-pair travel budget, exact by construction and confirmed bit for bit (user decision; §4). `ballObstacleContactTime`'s
upper bound is 1.0 ms, the largest for which the obstacle fuzz keeps penetrations under its bound with a margin (§4,
§8). A dead ball's hit is exempt from 29.1.7 only when the mallet contact, the roquet and the hit start together (§7).
The crush distance is recorded at about 1.1 mm per m/s of head speed, beyond the commentary's 1–2 mm above about
1.8 m/s (§1, §9.7). No face–ball gap is one step (§5). The fuzz reaches, the penetration bound and the analytic
tolerances are measured; `outsideObstacle`'s correction step now grows with the coordinates' rounding (§10).

**Amended 2026-10-04 (real run).** The final review found that 29.1.7 excluded every live ball, so a second live ball
hit after the roquet, while the mallet was still in contact, raised nothing. The last sentence of Law 29.2.4 voids the
exemption once the striker's ball hits another object after the roquet, and a later live ball is such an object. The
row now excludes only the roqueted ball.

## 1. Goal and exit criteria

Model ball–upright and ball–peg contact in the impact; record when every pair is closed; judge the mallet faults of
the Laws from that record and the stroke's context.

Exit criteria:

1. The obstacle analytic cases of §9.1 hold.
2. Setups whose balls never meet an obstacle are bit-identical to P2b.1. `scripts/impactDigest.ts` prints the P2b.1
   fields of each result (an explicit field list, not the whole object) on the lines it prints today, and the new
   fields (`timeline`, `touchingAtStart`) on separate lines with their own prefix. The P2b.1 lines are byte-identical
   to `main`'s output (shared scenarios step by step, 200 fuzz strokes). Phase 2's shot-mix work-unit figures (p99
   143,084, p99.9 362,050, max 408,030) and `SLOW_TESTS` reproduce exactly.
3. No impact hands phase 2 a ball overlapping an obstacle (§6); the obstacle fuzz (§9.8) never hangs, never raises
   `impact-cap` and keeps every peak penetration under its bound.
4. Every row of the fault table (§7) has a passing positive and negative case; the commentary's worked sequences
   (ORLAC C29.20.4.1–5) pass as table tests; a croquet-stroke re-contact is never a `fault`.
5. Crush geometry (§9.7): a ball 1 mm from an upright, struck straight at it, raises 29.1.8; one well beyond the
   contact distance does not. The distance at which it stops is recorded (not gated) against the commentary's
   1–2 mm (C29.13.1). Pre-flight recorded 1.088, 2.188, 3.261, 4.365 and 6.549 mm at 1, 2, 3, 4 and 6 m/s: about
   1.1 mm per m/s, so it falls within the commentary's 1–2 mm from about 0.9 to 1.8 m/s and beyond it above (§9.7).

## 2. Approach

The obstacle becomes a further pair kind in the impact's single pair list (P2b.1 §4 anticipated it), with the same
clamped spring–dashpot and Cundall–Strack friction as every other pair; the obstacle is immovable. The integrator
records a compact **contact timeline**: the contact intervals of every pair. A pure **fault judge**, beside
`judgeHoopRun`, reads the timeline and a stroke context, and applies the Laws. Mechanics stay Law-agnostic; a Law
change edits the judge only.

Rejected:

- **Fault-shaped events from the integrator** (`impact-crush`, `impact-recontact`). Smaller, but the integrator would
  encode Law concepts, and the 29.2.4 exemptions depend on the order of whole contacts (a roquet, an object, a mallet
  contact), so judging would leak into it anyway.
- **The judge re-running the impact with a probe.** No new result fields, but twice the cost and a dependence on the
  integrator's internals.
- **Rejecting setups near obstacles.** Blocks close hoop strokes and cannot show a crush.
- **A compliant, moving hoop now.** Closer to reality, but no hoop-stiffness data exist (§8) and product spec §2 defers
  hoop stiffness; §4 keeps it open per hoop.

## 3. Interface

```ts
/** A fixed vertical cylinder. `contactTime` (s): duration of a central strike in the impact (phase 2 ignores it). */
interface Cylinder { id: string; centre: Vec3; radius: number; material: ContactMaterial; contactTime: number }

/** A hoop gains its own impact contact time, copied to both uprights by `uprightsOf`. */
interface Hoop { /* existing fields */ contactTime: number }

/**
 * One interval of a pair (s from the impact's start) and its largest normal force (N). For a face–ball pair,
 * `clearanceAfter` is the largest separation along the face normal in the gap before the next interval.
 */
interface ContactInterval { start: number; end: number; peakForce: number; clearanceAfter?: number }

interface ImpactRun {
    /* existing fields */
    /** Intervals of every pair that closed, keyed as `peakPenetration` is, plus "<ball>@<obstacle id>". */
    readonly timeline: Readonly<Record<string, readonly ContactInterval[]>>;
    /** Keys of the ball–ball and ball–obstacle pairs touching (within CONTACT_TOLERANCE) at t = 0. */
    readonly touchingAtStart: readonly string[];
}
/** `ImpactResult.overlapCorrection` widens to the largest overlap removed from any pair, ball–ball or ball–obstacle. */

interface StrokeContext {
    striker: BallId;
    kind: "single-ball" | "croquet" | "continuation-touching";
    /** Required for, and only for, a croquet stroke. */
    croqueted?: BallId;
    /** Balls the striker may roquet in this stroke (decides the Law 29.2.4.1 exemption); never the striker. */
    live: readonly BallId[];
    hampered: boolean;
    jumpAttempt: boolean;
    /** The striker's ball is part of a group of balls (29.2.3.3). */
    group: boolean;
}

type FaultTier = "fault" | "possible-fault";
interface Finding { law: string; tier: FaultTier; ball: BallId; t: number; evidence: Readonly<Record<string, number>> }
interface FaultReport { findings: readonly Finding[] }

function judgeFaults(context: StrokeContext, impact: ImpactResult): FaultReport;
```

`judgeFaults` lives in `src/engine/faults.ts`, under the determinism lint. It and the impact stay internal until
P2b.2b's `simulateShot` exports them. It reads the impact only: every mallet contact lies inside the impact, and so
does every event the exemption orders against it (§7), so phase 2's events cannot precede a mallet contact. It throws
a `RangeError` for a context that does not fit the impact: a striker absent from it; a croquet stroke without a
`croqueted` ball, or with `croqueted` equal to the striker or absent from the impact; `croqueted` given for another
kind; the striker listed in `live`.

`group`, like `hampered` and `jumpAttempt`, is supplied by the caller. P2b.2b's `simulateShot` derives it from the
setup with the Laws' definition (Glossary, Law 18.4): a 3-ball group is one ball in contact with two others, and a
4-ball group adds a fourth ball in contact with a 3-ball group; contact is within `CONTACT_TOLERANCE`. A croquet
stroke's two touching balls alone are not a group.

## 4. Obstacle contact

**Pair.** A new kind `ball-obstacle`, after `ball-turf` in the fixed order, balls in `BALL_IDS` order and obstacles
in `obstaclesOf` order (uprights in hoop order, then the peg). Every ball is paired with every obstacle: a pair that
never closes adds no force (below), and present balls × (2·hoops + 1) pairs is a small list, which validation already
walks per ball. Key: `"<ball>@<obstacle id>"`.

**Reach filter.** Pre-flight measured the cost of evaluating every pair every step at 1.61–1.88× P2b.1's time per
step on the default world (12 uprights and the peg): the per-pair loop for pairs that never close. So a ball–obstacle
pair is skipped while the ball cannot yet have reached the obstacle (decided 2026-10-04). Each ball's horizontal path
length in the impact is summed (Σ|v_h|·dt); a pair found open is not evaluated again until the ball has travelled the
gap it had then, less a numerical margin of 1e-9 m that covers rounding drift. The horizontal distance cannot shrink
by more than the path travelled, so a skipped pair is open: evaluating it would add no force and change no state, and
the pairs evaluated are visited, and their forces summed, in the same order. The filter is therefore exact by
construction, with no assumed speed bound; pre-flight confirmed it bit for bit (the whole digest, timeline included,
and every obstacle-fuzz result). It brings the cost to 1.04–1.33× P2b.1's.

**A touching ball starts at zero gap.** Validation accepts a ball within `CONTACT_TOLERANCE` of an obstacle (§6), and
rounding can leave such a ball overlapping it by up to that tolerance. `prepareImpact` therefore moves a ball whose gap
to an obstacle is below zero horizontally outward, along the obstacle's normal, until δ ≤ 0 exactly (at most
`CONTACT_TOLERANCE`, 1e-9 m). Otherwise the pair would be closed from t = 0 with a spring force that turf friction
holds indefinitely, which would hold the impact open (below) and fake 29.1.8 and 29.1.9 on a legal stroke away from
the upright (§7). Touching balls keep P2b.1's treatment, so its scenarios stay bit-identical.

**End of the impact.** Ball–obstacle pairs count as hard contacts for `RELEASE_STEPS`, as face–ball and ball–ball
pairs do. A ball rebounding off an upright towards a following head (C29.13.2) then keeps the impact open for the
second hit. A ball at rest against an upright does not, because it starts at zero gap.

**Geometry.** The obstacle is an infinite vertical cylinder, as in phase 2 (a ball's top below the crown is the
validated range; a ball above it is phase 2's jump flag). Penetration δ = R + r − d, with d the horizontal distance
from the ball's centre to the axis; the normal is horizontal, from the axis to the ball's centre; the contact point
lies on it, δ/2 inside the ball's undeformed surface, as for the other pairs.

**Law.** `lawFromContactTime(m, e, T, μ)` with m the ball's mass (the obstacle is immovable), e and μ from the
obstacle's `material` (the sourced `ballUpright` and peg materials), and T its `contactTime`. Every obstacle carries
its own T, so a later version can vary a hoop's setting stiffness hoop by hoop, or by lawn, through input data
(decided 2026-10-04; §11). Laws are solved once per pair at the start, like every other pair.

**Default contact time.** `World.ballBallContactTime` (0.75 ms). For the linear law a ball on an immovable body has
the same natural frequency as two balls meeting: the ball–ball pair has half the stiffness (two balls in series) and
half the effective mass. Provenance: derived, analogue. Bounds (§8) are [0.435, 1.0] ms. Below, the Hertzian
rigid-flat case (T × 2^(−1/5) ≈ 0.87·T: half the reduced mass and radius in the ball–ball case) applied to the ball–ball
lower bound, 0.5 ms. Above, an allowance for an upright's give in the turf, which the rigid model omits and no source
quantifies: the largest contact time for which the obstacle fuzz keeps every obstacle penetration under its bound
(0.06·R), with a margin. Pre-flight: penetration grows about 2.5 mm per ms of contact time; 1.0 ms gives 0.055·R,
1.1 ms 0.0597·R and 1.5 ms 0.081·R.

**Bit-identity.** A pair that never closes touches no force or torque sum, and the obstacle pairs follow every
existing pair in the summation order, so a setup whose balls never meet an obstacle integrates exactly as in P2b.1
(exit criterion 2).

## 5. Contact timeline

The integrator already knows, each step, whether each pair is in contact. It records a transition list per pair: an
interval opens at the start of the first step in which the pair is in contact and ends at the start of the first step
in which it is not; an interval still open when the impact ends ends at `duration`. In contact means closed (δ > 0)
or, for a face–ball pair, `OFF_FACE` (the ball at the face's rim): the Laws count contact with any part of the mallet
(C29.11.9, C29.20.2), so a contact that crosses the rim stays one interval and a rim contact on another ball is a
29.1.11 contact. An `OFF_FACE` step adds no force, as in P2b.1, and is flagged `impact-off-face` as before. Each
interval keeps its largest normal force (0 for a pair in contact geometrically but released, P2b.1 §4, or at the
rim). For face–ball pairs, each gap keeps its largest separation along the face normal (`clearanceAfter`), which the
face geometry computes anyway. No minimum gap applies: any step out of contact separates two intervals, as the Laws
count any second contact. A one-step gap in single clean strikes would be numerical chatter; pre-flight found none:
in 978 single strikes of the P2b.1 fuzz, 3 had more than one face interval, and the shortest gap was 2,990 µs. Cost:
an array push per transition and a comparison per pair in contact per step. Turf pairs are recorded like the rest;
P2b.2b's stop-shot-lift criterion reads them.

## 6. Validation and handover

**Validation** (`validateImpact`). A ball touching an obstacle (within `CONTACT_TOLERANCE`) is now accepted and starts
at zero gap (§4); a ball overlapping one by more than `CONTACT_TOLERANCE` is still rejected. `validateWorld` checks
that every hoop's and the peg's `contactTime` is positive and finite, as it checks `ballBallContactTime`; the
hand-built worlds in the tests gain the field.

**Handover.** The separation pass (P2b.1 §6) also clears each ball from every obstacle it overlaps, moving it
horizontally along the obstacle's normal to zero gap, velocities unchanged, inside the same repeated fixed-order pass
(ball–ball pairs, then ball–obstacle pairs). Every obstacle is paired (§4), so the pass covers all of them. The pass
bound and residual are unchanged; running out still throws. `overlapCorrection` reports the largest overlap removed
from any pair.

## 7. Fault judge

Sources: World Croquet Federation, *The Laws of Association Croquet*, 7th edition, with the Official Rulings and
Commentary (ORLAC), Law 29. Every Law used is quoted verbatim in `reference/laws.json` (§8).

Two tiers. **fault**: decidable from the mechanics. **possible-fault**: the Laws make the fault conditional on what an
adjudicator sees or hears (29.2.5, 29.2.6, 29.2.7); the finding carries the measured quantity and no perception
threshold is invented (decided 2026-10-04; judging as a real-world referee perceives a stroke is deferred, §11).

| Law | Mechanical test | Tier |
|---|---|---|
| 29.1.8 (crush) | `face/<striker>` and a `<striker>@<obstacle>` interval overlap in time | fault |
| 29.1.9 | The striker's ball touches an obstacle at t = 0, and that pair's interval carries force (`peakForce` > 0) while overlapping a `face/<striker>` interval: the obstacle contributed to the ball's direction (C29.14.1). A touching ball starts at zero gap (§4), so a stroke away from the obstacle never closes the pair | fault |
| 29.1.11 | A `face/<ball>` interval on any ball but the striker's | fault |
| 29.1.13 | Croquet stroke: the striker–croqueted pair's `peakPenetration` never exceeds `CONTACT_TOLERANCE` (numerical, not perceptual), so a touching start that rounding leaves overlapping does not count as moving the croqueted ball | fault |
| 29.1.6.2 | Single-ball stroke: two or more non-exempt `face/<striker>` intervals | fault |
| 29.1.6.2 | Single-ball stroke: `impact-head-approaching` on the striker's ball, the head still closing when the impact ended (a second contact the impact did not integrate) | possible-fault |
| 29.1.7 | The striker's ball first closes on a ball it was not touching at t = 0 while a `face/<striker>` interval is open, and that ball is not the roqueted ball; contact on the roqueted ball is a roquet, exempt (C29.12.1). A croquet stroke's croqueted ball never counts (C29.12.3) | possible-fault (29.2.7) |
| 29.1.6.1 | Croquet stroke, or continuation while touching: two or more `face/<striker>` intervals; evidence: each gap's duration and `clearanceAfter` | possible-fault (29.2.5) |
| 29.1.5 | Strokes under 29.2.3 (`hampered`, `jumpAttempt` or `group`): the striker's first mallet contact is at the rim, i.e. `impact-off-face` on the striker's ball at or before the start of its first `face/<striker>` interval. Later contact is judged under 29.1.6 (C29.10.8) | fault; elsewhere not a fault (C29.10) |

A stroke into an obstacle the striker's ball was touching raises both 29.1.9 and 29.1.8; the judge reports every
finding and does not rank them.

**Exemption 29.2.4.1.** A mallet contact after the striker's ball has made a roquet (its first closing on a live ball,
from the impact's timeline) is exempt from 29.1.6 and 29.1.7, unless the striker's ball has hit another object after
that roquet and before the contact (the last sentence of 29.2.4). The objects are hoops, the peg or another ball
(C29.20.4); C29.20.4.1–5 are the tests. Contact with a dead ball is not a roquet (C29.11.7).

For 29.1.7, a hit on a ball other than the roqueted one (live or dead) is exempt only if the mallet contact it falls in
is exempt at that contact's own start, and the hit does not start after the roquet: the mallet contact, the roquet and
the hit all start together.
A mallet contact already open when the roquet starts is before the roquet (below), so a dead ball hit during it is a
possible fault; and a hit after the roquet is contact after the ball has hit another object, which the last sentence
of 29.2.4 excludes (decided in pre-flight). If this is wrong, a few legal scatter shots beside a live ball are flagged,
at the possible-fault tier.

Ordering at a shared instant: a `face/<striker>` interval is a contact *before* the roquet if it starts before the
roquet's interval starts, and *after* it if it starts at or after. An interval already open when the roquet starts is
one contact, before the roquet, and is not re-counted; C29.20.4.1–5 order whole contacts the same way. The exemption
covers contact with any part of the mallet (C29.20.2), but only the face and its rim are modelled.

**Not judged.**

- 29.1.10 needs mallet–obstacle contact, and 29.1.14 needs mallet–turf contact; neither is modelled, and
  `impact-mallet-grounded` stays a flag.
- 29.1.1–29.1.4 and 29.1.12 concern the body and the method of play and have no mechanical test.
- 29.1.6.3 (prolonged contact) needs a sourced norm of contact time per stroke type, which no input supplies yet. The
  face–striker intervals are in the timeline for when one does (§11).
- 29.1.13's "plays away from" the croqueted ball (C29.18.1) needs the swing's direction, which P2b.2b's swing model
  supplies; only "fails to move or shake" is judged here.
- The peg exceptions to 29.1.8 and 29.1.9 (a striker's ball pegged out in the stroke) need the rover status, which
  peg points would bring: until then a pegging-out crush on the peg is reported as a `fault` (§11).

## 8. Reference data

Each value in the existing `reference/*.json` form (value, unit, bounds, source, provenance).

| File · value | Source | Note |
|---|---|---|
| `contact.json` · `ballObstacleContactTime` | Derived from `ballBallContactTime` (§4) | Analogue; no measurement exists. Oxford Croquet's "Measuring Hoop Rigidity" (oxfordcroquet.org/tech/rigidity/) proposes methods and reports no data; Rod Cross's high-speed experiments (tech/cross1/) cover ball–ball and mallet–ball only. Bounds [0.435, 1.0] ms: 0.87× the ball–ball lower bound to an allowance for hoop give, the largest the obstacle fuzz passes with a margin (pre-flight; §4) |
| `laws.json` · 29.1.5–29.1.9, 29.1.11, 29.1.13, 29.2.3–29.2.7, Glossary "Group of balls" | WCF AC Laws 7th edition with ORLAC | Verbatim text; C29.10–C29.14 and C29.20 cited where the judge relies on them |

`defaultWorld` gives every hoop and the peg `ballObstacleContactTime`.

## 9. Testing

1. **Analytic** (gravity off, no turf): a ball meeting an upright head-on has the clamped closed form's contact time
   and restitution; an oblique hit sticks and slips at the friction cone; the peg uses its own material.
2. **Bit-identity:** exit criterion 2.
3. **Handover:** a ball ending the impact overlapping an upright is separated; phase 2 accepts it.
4. **Validation:** a ball touching an obstacle is accepted and starts at zero gap (δ ≤ 0 exactly, moved at most
   `CONTACT_TOLERANCE`), including a placement that rounding leaves overlapping; an overlapping one is rejected with
   its message asserted; `validateWorld` rejects a non-positive obstacle `contactTime`.
5. **Timeline:** a hand-built double tap yields the expected intervals and `clearanceAfter`; a contact crossing the
   rim stays one interval; an interval open at the end ends at `duration`; `touchingAtStart` lists exactly the
   touching pairs.
6. **Judge:** a positive and a negative case per table row; C29.20.4.1–5 as table tests, with the shared-instant
   ordering of §7; a croquet-stroke re-contact is `possible-fault`, never `fault`; a close scatter shot along the line
   of centres raises 29.1.6.2 or 29.1.7 (C29.12.2); a legal stroke directly away from an upright the ball touches
   raises neither 29.1.8 nor 29.1.9; a ball at rest against an upright, never struck, does not hold the impact to
   `IMPACT_CAP`; each context error of §3 throws.
7. **Crush geometry:** exit criterion 5. A ball 20 mm from the upright never reaches it within the impact; one 5 mm
   away reaches it after the mallet contact and raises no 29.1.8. The crush distance stays recorded, not gated; it
   falls within the commentary's 1–2 mm from about 0.9 to 1.8 m/s and beyond it above (pre-flight: 1.088 mm at
   1 m/s up to 6.549 mm at 6 m/s, about 1.1 mm per m/s). The impact's rigid, linear face contact (0.8 ms) is
   shorter than a real one, which the commentary says travels up to about 1 cm in contact.
8. **Obstacle fuzz:** random strokes as P2b.1's fuzz, with uprights and the peg within reach of the balls: no hang, no
   `impact-cap`, peak penetrations under the bound, handover accepted by phase 2.

## 10. Pre-flight

As for P2b.1: the plan is executed literally in a scratch worktree first, to fix the obstacle contact-time bounds, the
obstacle penetration bound and the obstacle fuzz ranges; to measure the per-step cost of pairing every ball with every
obstacle (§4); to record the shortest face–ball gap in single clean strikes (§5); and to record the crush distance.
Findings are folded into this document and the plan before the real run.

Pre-flight ran on 2026-10-04, from the plan's base, and every task passed review. Its results: the contact-time bounds
are [0.435, 1.0] ms (§4); the obstacle penetration bound is 0.06·R, 1.5× the worst measured (1.745 mm = 0.038·R); the
fuzz reaches stay 0.06 m (upright) and 0.1 m (peg), since every reach tried passes and wider ones only dilute the
17.45 % of strokes that meet an obstacle; the cost of every obstacle pair led to the reach filter (§4); no face–ball
gap is one step (§5); the crush distance is about 1.1 mm per m/s (§9.7). It also found a defect in the plan's
zero-gap helper: its correction grew by an ulp of the reach, which cannot outgrow the rounding of 10 m coordinates,
and it threw on a fuzz stroke at the lower contact-time bound. The correction now grows by an ulp of the coordinates.
The rest were plan defects (test expectations, a non-exhaustive switch, a misquoted commentary sentence), and the
29.1.7 exemption rule (§7).

`ENGINE_VERSION` moves to 0.5.0: inputs rejected before now simulate, and `ImpactResult` gains the timeline.

## 11. Deferred

| Item | How P2b.2a keeps it open |
|---|---|
| Hoop setting stiffness varying hoop by hoop or lawn by lawn (a real-world factor for a fuller simulation) | Each hoop and the peg carries its own `contactTime` (§4); a moving, compliant hoop is a further change |
| Judging possible-faults as a real-world referee perceives them | Findings carry the measured evidence (§7) |
| 29.1.10 (mallet hits a hoop or peg) and 29.1.14 (court damage) | Need mallet–obstacle and mallet–turf contact; grounding stays flagged |
| 29.2.4.2, 29.2.4.3 (peg point, pegged-out ball) | With peg points |
| A roquet deemed by Law 21.1 (hoop and roquet, C29.20.5) | Needs the hoop-run verdict (`judgeHoopRun`) inside the judge; a later context field |
| 29.1.6.3 (prolonged contact) | Needs a sourced contact-time norm per stroke type (the Croquet Association's measured contact times are a candidate for P2b.2b); the timeline holds the durations |
| 29.1.13 "plays away from" (C29.18.1) | Needs the swing direction from P2b.2b's swing model |
| Peg exceptions to 29.1.8 and 29.1.9 (striker's ball pegged out) | With peg points and rover status; until then reported as a fault |
| Hoop crown contact in the impact | As phase 2: uprights are infinite cylinders; a ball reaching the crown is the jump flag |
