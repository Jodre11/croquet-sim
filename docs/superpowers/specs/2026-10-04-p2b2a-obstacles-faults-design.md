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

## 1. Goal and exit criteria

Model ball–upright and ball–peg contact in the impact; record when every pair is closed; judge the mallet faults of
the Laws from that record, phase 2's events and the stroke's context.

Exit criteria:

1. The obstacle analytic cases of §9.1 hold.
2. Setups with no obstacle in reach are bit-identical to P2b.1: `scripts/impactDigest.ts` prints byte-identical output
   (shared scenarios step by step, 200 fuzz strokes), and phase 2's shot-mix work-unit figures (p99 143,084,
   p99.9 362,050, max 408,030) and `SLOW_TESTS` reproduce exactly.
3. No impact hands phase 2 a ball overlapping an obstacle (§6); the obstacle fuzz (§9.8) never hangs, never raises
   `impact-cap` and keeps every peak penetration under its bound.
4. Every row of the fault table (§7) has a passing positive and negative case; the commentary's worked sequences
   (ORLAC C29.20.4.1–5) pass as table tests; a croquet-stroke re-contact is never a `fault`.
5. Crush geometry (§9.7): a ball 1 mm from an upright, struck straight at it, raises 29.1.8; one well beyond the
   contact distance does not. The distance at which it stops is recorded (not gated) against the commentary's
   1–2 mm (C29.13.1).

## 2. Approach

The obstacle becomes a further pair kind in the impact's single pair list (P2b.1 §4 anticipated it), with the same
clamped spring–dashpot and Cundall–Strack friction as every other pair; the obstacle is immovable. The integrator
records a compact **contact timeline**: the closed intervals of every pair. A pure **fault judge**, beside
`judgeHoopRun`, reads the timeline, phase 2's events and a stroke context, and applies the Laws. Mechanics stay
Law-agnostic; a Law change edits the judge only.

Rejected:

- **Fault-shaped events from the integrator** (`impact-crush`, `impact-recontact`). Smaller, but the integrator would
  encode Law concepts, and the 29.2.4 exemptions depend on the order of events across both phases (a roquet, then a
  mallet contact), so judging would leak into it anyway.
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

/** One closed interval of a pair (s from the impact's start), its deepest penetration (m) and largest normal force. */
interface ContactInterval { start: number; end: number; peakDepth: number; peakForce: number }

interface ImpactRun {
    /* existing fields */
    /** Closed intervals of every pair that closed, keyed as `peakPenetration` is, plus "<ball>@<obstacle id>". */
    readonly timeline: Readonly<Record<string, readonly ContactInterval[]>>;
    /** For each face–ball gap between two intervals: its duration and largest separation along the face normal. */
    readonly faceGaps: Readonly<Record<string, readonly { start: number; end: number; clearance: number }[]>>;
}

interface StrokeContext {
    striker: BallId;
    kind: "single-ball" | "croquet" | "continuation-touching";
    croqueted?: BallId;
    /** Balls the striker may roquet in this stroke (decides the Law 29.2.4.1 exemption). */
    live: readonly BallId[];
    hampered: boolean;
    jumpAttempt: boolean;
    /** Longest face–striker contact normal for this stroke type (s); omitted, 29.1.6.3 is not judged. */
    contactNorm?: number;
}

type FaultTier = "fault" | "possible-fault";
interface Finding { law: string; tier: FaultTier; ball: BallId; t: number; evidence: Readonly<Record<string, number>> }
interface FaultReport { findings: readonly Finding[] }

function judgeFaults(context: StrokeContext, impact: ImpactResult, shot: ShotResult): FaultReport;
```

`judgeFaults` lives in `src/engine/faults.ts`, under the determinism lint. It and the impact stay internal until
P2b.2b's `simulateShot` exports them. Phase 2's time starts at the end of the impact, so the judge orders impact
intervals before phase-2 events. Whether the striker's ball is part of a group of balls (29.2.3.3) is derived from
the start positions with the Laws' definition (Glossary, Law 18.4): a 3-ball group is one ball in contact with two
others, and a 4-ball group adds a fourth ball in contact with a 3-ball group; contact is within `CONTACT_TOLERANCE`.
A croquet stroke's two touching balls alone are not a group.

## 4. Obstacle contact

**Pair.** A new kind `ball-obstacle`, after `ball-turf` in the fixed order, balls in `BALL_IDS` order and obstacles
in `obstaclesOf` order (uprights in hoop order, then the peg). A ball gets a pair for each obstacle whose surface lies
within `OBSTACLE_REACH` of the ball's surface at t = 0 (horizontal distance between axes, less R and the obstacle
radius). `OBSTACLE_REACH` is fixed by pre-flight from the fuzz's largest ball travel within an impact, with a margin
(§10). Key: `"<ball>@<obstacle id>"`.

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
half the effective mass. Provenance: derived, analogue. Bounds (§8) widen below to the Hertzian rigid-flat case
(T × 2^(−1/5) ≈ 0.87·T: half the reduced mass and radius in the ball–ball case) and above for an upright's give in the
turf, which the rigid model omits.

**Bit-identity.** A pair that never closes adds no force, and the obstacle pairs follow every existing pair in the
summation order, so a setup with no obstacle in reach integrates exactly as in P2b.1 (exit criterion 2).

## 5. Contact timeline

The integrator already knows, each step, whether each pair is closed. It records a transition list per pair: an
interval opens at the start of the first step in which the pair is closed (δ > 0) and ends at the start of the first
step in which it is open; an interval still open when the impact ends ends at `duration`. Each interval keeps its
deepest δ and largest normal force (0 for a pair that is closed geometrically but released, P2b.1 §4). For face–ball
pairs, each gap between two intervals also keeps its largest separation along the face normal, which the face
geometry computes anyway. Cost: an array push per transition and a comparison per closed pair per step.

## 6. Validation and handover

**Validation** (`validateImpact`). A ball touching an obstacle (within `CONTACT_TOLERANCE`) is now accepted; a ball
overlapping one by more than `CONTACT_TOLERANCE` is still rejected. Every obstacle's `contactTime` must be positive
and finite.

**Handover.** The separation pass (P2b.1 §6) also clears each ball from every obstacle it overlaps, moving it
horizontally along the obstacle's normal to zero gap, velocities unchanged, inside the same repeated fixed-order pass
(ball–ball pairs, then ball–obstacle pairs). The pass bound and residual are unchanged; running out still throws. The
largest obstacle overlap removed is reported in `ImpactResult` beside `overlapCorrection`.

## 7. Fault judge

Sources: World Croquet Federation, *The Laws of Association Croquet*, 7th edition, with the Official Rulings and
Commentary (ORLAC), Law 29. Every Law used is quoted verbatim in `reference/laws.json` (§8).

Two tiers. **fault**: decidable from the mechanics. **possible-fault**: the Laws make the fault conditional on what an
adjudicator sees or hears (29.2.5, 29.2.6, 29.2.7); the finding carries the measured quantity and no perception
threshold is invented (decided 2026-10-04; judging as a real-world referee perceives a stroke is deferred, §11).

| Law | Mechanical test | Tier |
|---|---|---|
| 29.1.8 (crush) | `face/<striker>` and a `<striker>@<obstacle>` interval overlap in time | fault |
| 29.1.9 | The striker's ball touches an obstacle at t = 0, and that pair carries force (`peakForce` > 0) while the face is on the ball: the obstacle contributed to the ball's direction (C29.14.1) | fault |
| 29.1.11 | A `face/<ball>` interval on any ball but the striker's | fault |
| 29.1.13 | Croquet stroke: the striker–croqueted pair never carries force | fault |
| 29.1.6.2 | Single-ball stroke: two or more `face/<striker>` intervals, unless exempt (below) | fault |
| 29.1.7 | The face is on the striker's ball when the striker's ball first closes on a ball it was not touching at t = 0, unless exempt (so a croquet stroke's croqueted ball never counts; C29.12.3) | possible-fault (29.2.7) |
| 29.1.6.1 | Croquet stroke, or continuation while touching: two or more `face/<striker>` intervals; evidence: each gap's duration and clearance | possible-fault (29.2.5) |
| 29.1.6.3 | `face/<striker>` contact longer than `context.contactNorm` | possible-fault (29.2.6) |
| 29.1.5 | `impact-off-face` on the striker's ball in a 29.2.3 stroke (hampered, jump attempt, or striker's ball in a group) | fault; elsewhere not a fault (C29.10) |

A stroke into an obstacle the striker's ball was touching raises both 29.1.9 and 29.1.8; the judge reports every
finding and does not rank them.

**Exemption 29.2.4.1.** A mallet contact after the striker's ball has made a roquet (first contact with a live ball,
in the impact's timeline or in phase 2's `ball-ball` events) is exempt from 29.1.6 and 29.1.7, unless the striker's
ball has hit another object after that roquet and before the contact (the last sentence of 29.2.4). The objects are
hoops, the peg or another ball (C29.20.4); C29.20.4.1–5 are the tests. Contact with a dead ball is not a roquet
(C29.11.7). The exemption covers contact with any part of the mallet (C29.20.2), but only face contacts are modelled.
A roquet deemed under Law 21.1 when the striker's ball runs a hoop towards a ball beyond it (C29.20.5) and the
peg-point and pegged-out exemptions (29.2.4.2, 29.2.4.3) are deferred (§11).

**Not judged.** 29.1.10 needs mallet–obstacle contact and 29.1.14 needs mallet–turf contact, neither modelled
(`impact-mallet-grounded` stays a flag); 29.1.1–29.1.4 and 29.1.12 concern the body and the method of play and have
no mechanical test.

## 8. Reference data

Each value in the existing `reference/*.json` form (value, unit, bounds, source, provenance).

| File · value | Source | Note |
|---|---|---|
| `contact.json` · `ballObstacleContactTime` | Derived from `ballBallContactTime` (§4) | Analogue; no measurement exists. Oxford Croquet's "Measuring Hoop Rigidity" (oxfordcroquet.org/tech/rigidity/) proposes methods and reports no data; Rod Cross's high-speed experiments (tech/cross1/) cover ball–ball and mallet–ball only. Bounds: 0.87× the ball–ball lower bound to a wider upper bound for hoop give, set by pre-flight |
| `laws.json` · 29.1.5–29.1.9, 29.1.11, 29.1.13, 29.2.3–29.2.7, Glossary "Group of balls" | WCF AC Laws 7th edition with ORLAC | Verbatim text; C29.10–C29.14 and C29.20 cited where the judge relies on them |

`defaultWorld` gives every hoop and the peg `ballObstacleContactTime`.

## 9. Testing

1. **Analytic** (gravity off, no turf): a ball meeting an upright head-on has the clamped closed form's contact time
   and restitution; an oblique hit sticks and slips at the friction cone; the peg uses its own material.
2. **Bit-identity:** exit criterion 2.
3. **Handover:** a ball ending the impact overlapping an upright is separated; phase 2 accepts it.
4. **Validation:** a ball touching an obstacle is accepted; an overlapping one is rejected with its message asserted;
   a non-positive obstacle `contactTime` is rejected.
5. **Timeline:** a hand-built double tap yields the expected intervals, gaps and clearances; an interval open at the
   end ends at `duration`.
6. **Judge:** a positive and a negative case per table row; C29.20.4.1–5 as table tests; a croquet-stroke re-contact
   is `possible-fault`, never `fault`; a close scatter shot along the line of centres raises 29.1.6.2 or 29.1.7
   (C29.12.2).
7. **Crush geometry:** exit criterion 5.
8. **Obstacle fuzz:** random strokes as P2b.1's fuzz, with uprights and the peg within reach of the balls: no hang, no
   `impact-cap`, peak penetrations under the bound, handover accepted by phase 2.

## 10. Pre-flight

As for P2b.1: the plan is executed literally in a scratch worktree first, to fix `OBSTACLE_REACH`, the obstacle
contact-time bounds, the obstacle penetration bound and the obstacle fuzz ranges, and to record the crush distance.
Findings are folded into this document and the plan before the real run.

`ENGINE_VERSION` moves to 0.5.0: inputs rejected before now simulate, and `ImpactResult` gains the timeline.

## 11. Deferred

| Item | How P2b.2a keeps it open |
|---|---|
| Hoop setting stiffness varying hoop by hoop or lawn by lawn (a real-world factor for a fuller simulation) | Each hoop and the peg carries its own `contactTime` (§4); a moving, compliant hoop is a further change |
| Judging possible-faults as a real-world referee perceives them | Findings carry the measured evidence (§7) |
| 29.1.10 (mallet hits a hoop or peg) and 29.1.14 (court damage) | Need mallet–obstacle and mallet–turf contact; grounding stays flagged |
| 29.2.4.2, 29.2.4.3 (peg point, pegged-out ball) | With peg points |
| A roquet deemed by Law 21.1 (hoop and roquet, C29.20.5) | Needs the hoop-run verdict (`judgeHoopRun`) inside the judge; a later context field |
| Obstacles beyond `OBSTACLE_REACH` at the start | Fixed by pre-flight from measured ball travel |
| Hoop crown contact in the impact | As phase 2: uprights are infinite cylinders; a ball reaching the crown is the jump flag |
