# P2b.2b.1 — Tracked Drive, Mallet–Turf Contact, Swing Model and `simulateShot`: Design

**Product spec:** `2026-09-30-croquet-shot-lab-design.md` §3 (`ShotSetup`), §4 (swing model), §5 ("Phase 1 —
Impact"), §7 (profiles), §9.
**Impact spec:** `2026-10-03-p2b1-impact-integrator-design.md` (§3 `ContactState`, §5 integrator and end rule).
**Fault spec:** `2026-10-04-p2b2a-obstacles-faults-design.md` (§3 `StrokeContext`, §7 fault table, §11 deferred).
**Roadmap:** P2 row; "P2b.2 decisions (2026-10-04)"; "P2b.2a outcomes carried forward". P2b.2b is split (decided
2026-10-04): **P2b.2b.1** (this document) is the mechanism; **P2b.2b.2** is the calibration (§10).

**Why this split.** The swing model, the tracked drive, mallet–turf contact and `simulateShot` can each be proved on
analytic and hand-checked cases with provisional defaults. Sourcing the swing defaults, fitting the contact times and
the hand coupling, and validating the coaching ratios need all of it in place, and are a separate review surface.

## 1. Goal and exit criteria

Turn a `ShotSetup` into a whole shot: a swing model builds the mallet head's state and the path the hands follow; the
impact integrates the head pulled along that path, including any re-contact and the head meeting the turf; the fault
judge rules on it; phase 2 rolls the balls out.

Exit criteria:

1. The analytic and hand-checked cases of §8.1 hold.
2. Force-table drives are bit-identical to P2b.2a. `scripts/impactDigest.ts` output is byte-identical to `main`'s
   after the mechanical `{ kind: "force", samples }` migration; phase 2's shot-mix work units (p99 143,084, p99.9
   362,050, max 408,030), `SLOW_TESTS=1`, the obstacle fuzz and the reach filter reproduce exactly.
3. On a 3 m/s centre strike with the provisional coupling, the hands' impulse during the face–ball contact is at most
   5 % of the transfer impulse (§3.4).
4. `simulateShot` runs every preset of the default profile end to end without a `RangeError`; the pre-flight
   measurements of §9 are recorded in the roadmap.
5. `simulateShot`, `simulateImpact`, `judgeFaults` and their types are exported from `src/engine/index.ts`;
   `ENGINE_VERSION` is "0.6.0".

## 2. Architecture

```
src/engine/swing/        new: SwingProfile, StrokeType, ShotSetup, defaultProfile, buildContact()
src/engine/impact/       Drive union, arc evaluation and hand load, head–turf pair, track end rule
src/engine/shot.ts       new: simulateShot(setup, world?) → ShotOutcome; strokeContext()
src/engine/faults.ts     29.1.13 "plays away from"; 29.1.14
src/engine/index.ts      exports (§6.5)
```

Everything under `src/engine/**`, the swing model included, stays under the determinism lint: `+ − * /`,
comparisons, `Math.sqrt`, `abs`, `min`, `max`, `round`, `floor`, and the engine's own `sinCos` and `atan2`
(`math/elementary.ts`).

```
ShotSetup ─buildContact─▶ ContactState{drive: track} ─simulateImpact─▶ ImpactResult
   │                                                                      │ handover
   └─strokeContext(setup, impact)─▶ StrokeContext ─judgeFaults(ctx, impact)┤
                                                                          ▼
                                              simulateFreeMotion ─▶ ShotResult
```

`judgeHoopRun` stays a separate call on the phase 2 result.

## 3. The tracked drive

### 3.1 Types

`ContactState.drive` becomes a union. The force table is kept unchanged as one member, so every P2b.1 and P2b.2a case
keeps its numbers; the swing model emits only `track`.

```ts
type Drive =
    | { readonly kind: "force"; readonly samples: readonly DriveSample[] }
    | { readonly kind: "track"; readonly arc: SwingArc; readonly coupling: Coupling };

/** The path the hands drive the socket along: a pendulum arc about a fixed pivot in a vertical plane. */
interface SwingArc {
    readonly pivot: Vec3;            // the top hand, world frame
    readonly aim: Vec3;              // unit, horizontal: the swing plane's forward direction
    readonly radius: number;         // pivot to socket, m
    readonly theta0: number;         // arc angle at t = 0, rad, from the lowest point, positive forward
    readonly omega0: number;         // arc rate at t = 0, rad/s
    readonly phases: readonly ArcPhase[];
    readonly shaftToHead: Quaternion; // the head's orientation relative to the shaft frame
}

/** Constant arc acceleration (rad/s²) until `until` (s); the last phase runs on past its `until`. */
interface ArcPhase { readonly until: number; readonly alpha: number }

/** The hands' grip on the head: natural periods (s) and damping ratios, linear and angular. */
interface Coupling {
    readonly period: number;
    readonly dampingRatio: number;
    readonly angularPeriod: number;
    readonly angularDampingRatio: number;
}
```

### 3.2 The path

θ(t) is piecewise quadratic: θ = θₖ + ωₖ·(t − tₖ) + ½·αₖ·(t − tₖ)² in phase k, which starts at tₖ (t₀ = 0, then
each preceding `until`). θₖ and ωₖ are computed once, in `prepareImpact`, so θ and ω are continuous by construction.

With n = aim × ẑ (the pitch axis) and the shaft frame's forward axis along aim at θ = 0:

- socket target p = pivot + r·(sin θ·aim − cos θ·ẑ), velocity v_p = r·ω·(cos θ·aim + sin θ·ẑ), acceleration
  a_p = r·α·(cos θ·aim + sin θ·ẑ) + r·ω²·(cos θ·ẑ − sin θ·aim);
- orientation target q_path = rot(n, θ) ⊗ q_aim ⊗ `shaftToHead`, where q_aim turns the body x axis to aim; angular
  velocity ω_path = ω·n; angular acceleration α_path = α·n.

Each step evaluates `sinCos(θ)` and `sinCos(θ/2)`.

### 3.3 The hand load

Each step, in place of `driveAt`, the hands apply a force F at the socket and a couple τ_h:

- F = F_ff + k·(p − s) + c·(v_p − v_s), where s and v_s are the socket's world position and velocity;
  k = m·(2π/T)², c = 2ζ·√(k·m);
- τ_h = τ_ff + K_θ·θ_err + C_θ·(ω_path − ω), applied per principal axis in the body frame with
  K_θ,i = I_i·(2π/T_θ)², C_θ,i = 2ζ_θ·√(K_θ,i·I_i); θ_err = 2·sign(w)·vec(q_path ⊗ q̄), w the product's scalar part;
- feed-forward: F_ff = m·g·ẑ + m·a_p, τ_ff = I·α_path (body frame).

The head's torque is r_s × F + τ_h, as the force-table drive's socket force contributes r_s × F today. The
feed-forward makes the hands carry the head's weight and drive the nominal swing, so a head started on the path
follows it with no sag or lag beyond the residual of the socket–centre-of-mass offset (bounded by §8.1); the spring
and damper act only on what the balls and the turf do to the head.

### 3.4 The provisional coupling

The coupling must leave the head effectively free during the ~1 ms face–ball contact (so the transfer is the head's,
not the hands') yet transmit the hands' force over a 30–58 ms roll push. A 5 ms period fails the first: for the
1.0 kg head, critically damped, c ≈ 2,500 N·s/m, so a 1.7 m/s slowdown in the strike draws about 4 kN of hand force,
comparable to the 3.7 kN peak face force.

**Criterion.** On a 3 m/s centre strike on a single ball, ∫|F − F_ff| dt over the face–ball interval is at most 5 % of
the ball's momentum change over it. Pre-flight sets T and ζ (starting at T = 40 ms, ζ = 0.7) to the stiffest values
meeting it; T_θ = T, ζ_θ = ζ. `contact.json` records them with provenance "provisional (P2b.2b.2 sources or fits)" and
the criterion in the note. Exit criterion 3 tests it.

### 3.5 End rule

For a `track` drive the impact ends when every condition holds:

- a face–ball contact has closed;
- no face–ball, ball–ball, ball–obstacle or head–turf contact has been closed for `RELEASE_STEPS` steps;
- no ball in turf contact is bouncing (P2b.1's rule);
- the head is not closing on any ball within reach (`headClosing`).

A head still catching a ball keeps the impact running, so a re-contact (a double tap, or the later impulse Gugan
attributes most of a drive's striker distance to) is integrated, not flagged. The arc rises past its lowest point, so
a head behind a ball rolling on the turf separates from it; a ball faster than the head ends it at once. Otherwise
the impact ends at `TRACK_IMPACT_CAP` = 0.12 s (about twice the 58 ms longest roll contact the Croquet Association
measured) with `impact-cap`, and `impact-head-approaching` for any ball the head is still closing on. `ImpactOptions.cap`
overrides either cap.

A `force` drive keeps P2b.1's rule and `IMPACT_CAP` = 0.06 s unchanged. At 0.12 s (24,000 steps) the WAKE_MARGIN
reach filter keeps about 50× headroom.

### 3.6 Validation

`validateImpact` adds, for a `track` drive: every number finite; `radius` > 0; `aim` unit and horizontal (within
1e-12); `shaftToHead` unit (within 1e-12); `period`, `angularPeriod` > 0; damping ratios ≥ 0; `phases` non-empty
with `until` strictly increasing from > 0. Each failure is a `RangeError` naming the check. The head's state at t = 0
need not lie on the path (tests start it off); `buildContact` always starts it on.

## 4. Mallet–turf contact

### 4.1 The pair

For a `track` drive a `head-turf` pair is added after the existing pairs (pair-list order, so the force-table order
is untouched). The head is a solid cylinder of axis a (unit, world), half-length L/2 and radius ρ; its lowest point,
for |a_z| < 1, is c − (L/2)·sign(a_z)·a − ρ·u, with u the unit vector of ẑ − a_z·a; for |a_z| = 1 the face disc is
level and the contact point is its centre. The penetration is δ = −z of that point when positive.

- **Normal force:** the turf's clamped linear spring–dashpot, as the ball–turf pair has it, with
  `SurfaceProps.turfStiffness` and damping solved from `turfRestitution` with the head's mass as the effective mass.
- **Friction:** Cundall–Strack, as the other pairs, with `headTurfFriction` (`contact.json`; §7).

Both act at the contact point, so they twist the head. The turf values are the ball's, labelled provisional for the
head (an edge or side presses a different footprint); P2b.2b.2 revisits them.

### 4.2 Flags

For a `track` drive `impact-mallet-grounded` is no longer raised. A new event, `impact-head-deep`, is raised the
first time δ exceeds `HEAD_DEEP_LIMIT` = 2 mm (provisional): the plane turf with a linear spring is not credible for a
head driven deeper, as a ball's validated penetrations are tenths of a millimetre. A `force` drive keeps raising
`impact-mallet-grounded` and adds no pair.

### 4.3 What it records

- `timeline["head/turf"]`: its contact intervals with peak normal force;
- `peakPenetration["head/turf"]`;
- `ImpactRun.headTurfSlide` (new, m): the path length of the contact point along the turf while δ > 0, summed per
  step from its horizontal velocity. Absent when the pair never closed.

### 4.4 Limits

The turf is a plane under the head: no divot, no lasting dent, no change to the lawn for phase 2.

## 5. The swing model

### 5.1 Types

```ts
type StrokeType = "single-ball" | "drive" | "stop-ac" | "stop-gc" | "half-roll" | "full-roll" | "pass-roll";
/** The croquet strokes; the rest are single-ball. */
const CROQUET_STROKES: readonly StrokeType[] = ["drive", "stop-ac", "stop-gc", "half-roll", "full-roll", "pass-roll"];

interface SwingProfile {
    readonly mallet: {
        readonly headMass: number; readonly headLength: number; readonly headDiameter: number;
        readonly face: "wood"; readonly weighting: "centre" | "end"; readonly shaftLength: number;
    };
    readonly grip: { readonly style: "standard" | "irish" | "solomon"; readonly topHandHeight: number };
    /** Ball ahead of the arc's lowest point (m), shaft lean at contact (rad, positive pitches the face down). */
    readonly stance: Readonly<Record<StrokeType, { readonly ballAhead: number; readonly shaftLean: number }>>;
    /** Peak tangential acceleration of the hands (m/s²) and how long it lasts (s). */
    readonly drive: Readonly<Record<StrokeType, { readonly aMax: number; readonly window: number }>>;
}

interface ShotSetup {
    readonly balls: BallStates;
    readonly striker: BallId;
    readonly croqueted?: BallId;
    readonly stroke: {
        readonly type: StrokeType;
        readonly aim: number;          // swing direction, rad from +x, horizontal
        readonly speed: number;        // head centre-of-mass speed at contact, m/s
        readonly drive: number;        // −1 check … 0 coast … +1 push
        readonly contact: { readonly up: number; readonly side: number }; // ball centre from face centre, m
    };
    readonly live: readonly BallId[];
    readonly continuation: boolean;
    readonly hampered: boolean;
    readonly jumpAttempt: boolean;
    readonly targetHoop?: HoopTarget;
    readonly lawnSpeed: number;
    readonly profile: SwingProfile;
}

function buildContact(setup: ShotSetup, world: World): ContactState;
```

Grip style only pre-fills `topHandHeight` in the planner (product spec §4); the engine ignores it.

### 5.2 Derivation

1. **Arc radius.** r = `topHandHeight` − h₀, h₀ = the ball's resting centre height (R less its static sink); the head's
   centre meets the ball's centre at address with the shaft near vertical.
2. **Contact angle.** θ_c = atan2(`ballAhead`, √(r² − `ballAhead`²)): positive is a rising strike, negative a
   descending one.
3. **Face angle.** The head's pitch about n at contact equals `shaftLean`, whatever θ_c: `shaftToHead` = rotation by
   `shaftLean` − θ_c about the shaft frame's pitch axis (n in the shaft frame). The face is the head's leading end disc; its outward normal f is the body
   +x axis.
4. **Head placement.** The point on the face at (`up`, `side`) in the face plane from its centre (`up` along the face's
   upward in-plane axis, `side` along n's horizontal complement, positive to the left of aim) lies on the line through
   the ball's centre along −f, at distance R + `START_GAP` from it; `START_GAP` = 1e-6 m, so rounding never starts the
   face in the ball. The head's centre is L/2 behind the face centre along −f; the socket follows from the head's
   geometry.
5. **Pivot.** pivot = socket − r·(sin θ_c·aim − cos θ_c·ẑ). Its height follows from where the ball is, as a player
   bends to meet it; whether the head reaches the turf near the arc's bottom then follows from the stance.
6. **Speed.** ω₀ = `speed` / |ω-lever of the head's centre about the pivot| (the centre's distance from the pivot
   projected normal to n), so the centre of mass moves at `speed`. The head's velocity and angular velocity at t = 0
   are the path's: ω₀·n and the rigid rotation about the pivot.
7. **Drive.** Phase 1: α = `drive`·`aMax`/r until `window`; phase 2: α = 0, running on.
8. **Mallet.** Mass, length and diameter; inertia from `solidCylinderInertia` for "centre"; "end" multiplies the
   transverse moments by `END_WEIGHTING_FACTOR` = 1.3 (provisional, P2b.2b.2 sources); the socket is the centre of the
   head's upper surface; the face material is `mallet.json`'s wood. The coupling is the world's provisional one (§3.4).

### 5.3 Rejections

`buildContact` throws a `RangeError` naming the check for: |`ballAhead`| ≥ r; r ≤ 0; `topHandHeight` > `shaftLength`
+ h₀ (the hand is off the shaft); `speed` ≤ 0; |`drive`| > 1; √(`up`² + `side`²) ≥ the head's radius (contact off the
face); a stroke type missing from `stance` or `drive`; `window` ≤ 0; a non-finite number. `simulateImpact`'s own
validation then runs as today (the head in the turf at t = 0 is rejected there).

### 5.4 The default profile

`defaultProfile` ("typical club player") ships with these values, every one marked provisional in its source comment.
The mallet is `mallet.json`'s; the rest are estimates within the feasibility spike's ranges, chosen before any ratio is
measured and never tuned to one.

| Field | Value |
|---|---|
| Mallet | 1.0 kg, 0.2286 m, 0.0762 m, wood, centre, shaft 0.91 m |
| Grip | standard, top hand 0.85 m |

| Preset | ballAhead (m) | shaftLean (°) | aMax (m/s²) | window (ms) |
|---|---|---|---|---|
| single-ball | 0 | 0 | 20 | 10 |
| drive | 0 | 0 | 20 | 5 |
| stop-ac | −0.02 | −4 | 20 | 5 |
| stop-gc | 0.14 | −4 | 60 | 10 |
| half-roll | −0.05 | 25 | 15 | 20 |
| full-roll | −0.07 | 35 | 15 | 30 |
| pass-roll | −0.08 | 40 | 15 | 40 |

**Open for P2b.2b.2.** The feasibility spike reached the stop-shot ratio only with a rising strike, which lifts the
striker's ball; the AC stop's braking needs the head low at contact, so its strike is level or slightly descending,
which the spike found never lifts the ball. Which preset is the calibration target, and whether stop-shot lift is
required of both, is P2b.2b.2's decision; this phase only shows each preset's braking mechanism (§8.1).

## 6. `simulateShot` and the fault judge

### 6.1 The call

```ts
function simulateShot(setup: ShotSetup, world?: World): ShotOutcome;  // world defaults to defaultWorld(setup.lawnSpeed)

interface ShotOutcome {
    readonly contact: ContactState;
    readonly context: StrokeContext;
    readonly impact: ImpactResult;
    readonly faults: FaultReport;
    readonly motion: ShotResult;
}
```

It runs `buildContact`, `simulateImpact`, `strokeContext`, `judgeFaults` and `simulateFreeMotion(impact.handover,
world)` in that order. Phase 2 always runs: impact flags and findings are information, as phase 2's jump flag is.
Invalid input throws the named `RangeError` of whichever stage catches it.

### 6.2 Setup checks

Before `buildContact`: the striker is present; `live` holds only present balls, never the striker, no duplicates;
a croquet stroke (`CROQUET_STROKES`) has a present `croqueted` ball, not the striker, touching the striker (within
`CONTACT_TOLERANCE`); a single-ball stroke has no `croqueted`; `lawnSpeed` is accepted by `defaultWorld`.

### 6.3 Building `StrokeContext`

- `kind`: `croquet` for a croquet stroke; otherwise `continuation-touching` if `continuation` and the striker
  touches a ball at the start (`impact.touchingAtStart`); otherwise `single-ball`.
- `group`: the Glossary and Law 18.4 definition as P2b.2a §3 states it, over the ball–ball pairs touching at the
  start: a 3-ball group is one ball in contact with two others, a 4-ball group adds a fourth in contact with a 3-ball
  group; `group` is true when the striker belongs to one. A croquet stroke's two touching balls alone are not a group.
- `striker`, `croqueted`, `live`, `hampered`, `jumpAttempt` are copied.

### 6.4 New judgements

- **29.1.13 "plays away from" (C29.18.1).** `StrokeContext` gains `aim?: Vec3` (unit, horizontal; set by
  `simulateShot`, absent when the judge is called directly without a swing). In a croquet stroke with `aim` present,
  a fault is found when the angle between `aim` and the horizontal line from the striker's centre to the croqueted
  ball's exceeds 90°, i.e. their dot product is negative; evidence `angle` (rad), `ball` the croqueted ball, `t` the
  impact's duration. The spec's criterion is checked against C29.18 when it is quoted into `laws.json`; if the
  commentary gives a different test, the user decides before the plan proceeds.
- **29.1.14 (court damage).** Quoted verbatim with its commentary into `laws.json`. A damaged lawn is something an
  adjudicator sees, so it is a `possible-fault` (as 29.2.5–29.2.7 frame perception): found when `head/turf` has an
  interval and the stroke is under Law 29.2.3 (`hampered`, `jumpAttempt` or `group`); evidence `penetration` (m),
  `peakForce` (N), `slide` (m); `ball` the striker's; `t` the first interval's start. No damage threshold is
  invented.

`JUDGED_LAWS` gains "29.1.14". `judgeFaults`'s signature is unchanged; it validates `aim` (unit, horizontal) when
present.

### 6.5 Exports

`src/engine/index.ts` adds `simulateShot`, `simulateImpact`, `judgeFaults`, `defaultProfile`, `CROQUET_STROKES` and
the types `ShotSetup`, `SwingProfile`, `StrokeType`, `ShotOutcome`, `ContactState`, `Drive`, `SwingArc`, `Coupling`,
`ImpactResult`, `ImpactEvent`, `StrokeContext`, `FaultReport`, `Finding`.

## 7. Reference data

| File · key | Value | Provenance |
|---|---|---|
| `contact.json` · `handCoupling` (period, dampingRatio, angularPeriod, angularDampingRatio) | set in pre-flight by §3.4 | provisional; criterion in the note; P2b.2b.2 sources or fits |
| `contact.json` · `headTurfFriction` | 0.5, bounds 0.3–0.7 | estimate (wood on grass; no measurement found); P2b.2b.2 sources |
| `contact.json` · `headDeepLimit` | 2 mm | provisional model limit |
| `mallet.json` · `endWeightingFactor` | 1.3 | provisional; P2b.2b.2 sources |
| `mallet.json` · `shaftLength`, `topHandHeight` | 0.91 m, 0.85 m | provisional defaults |
| `laws.json` · 29.1.14, C29.18 (full), 29.1.14's commentary | verbatim | WCF AC Laws 7th edition with ORLAC |

## 8. Testing

### 8.1 Analytic and hand-checked cases

- **Path.** θ, ω across coast, push and check phases match the closed forms; continuity at phase boundaries.
- **Tracking, no ball.** A head started on the path follows it over 0.12 s within a bound pre-flight measures and
  the plan fixes (target 1e-6 m and 1e-6 rad; the residual is the socket–centre-of-mass offset's, §3.3). A head started
  1 mm off the path returns as the damped oscillator of period T and ratio ζ predicts (within 1 % of amplitude).
- **Free in the strike.** Exit criterion 3.
- **Re-contact.** A croquet split whose striker's ball leaves slower than the head is struck again within the impact,
  with no `impact-head-approaching`; a clean centre single-ball strike ends within `RELEASE_STEPS` of the ball
  outrunning the head.
- **Head–turf.** A head lowered onto the turf at rest settles at m·g/k; a head sliding level along the turf at
  constant normal load decelerates at μ·g within 1 %; `headTurfSlide` matches the closed form; `impact-head-deep`
  fires just over 2 mm and not just under.
- **Swing model.** Each derivation step separately: r; θ_c from `ballAhead`; face pitch equal to the lean for
  θ_c of −10°, 0°, +10°; face 1 µm short of the ball at the requested (`up`, `side`); centre-of-mass speed equal to
  `speed`; drive phases. Every rejection names its check. Setups mirrored across a vertical plane give mirrored
  `ContactState`s.
- **`simulateShot`.** Each `kind`; `group` for 3- and 4-ball groups and the croquet pair alone; 29.1.13 at 89.9°,
  90° and 90.1°; 29.1.14 only under 29.2.3; phase 2 receives exactly `impact.handover`; every setup check names its
  failure.
- **Braking mechanisms.** In the default profile, stop-ac's head loses more momentum to the turf than to the hands
  after contact, stop-gc's more to the hands than to the turf. Ratios are not asserted.

### 8.2 Bit-identity

Exit criterion 2. The `force` migration is mechanical and reviewed by the digest diff.

## 9. Pre-flight measurements (recorded in the roadmap)

- Coupling sweep, T 10–200 ms × ζ 0.2–1, default profile: hand impulse and peak hand force in the strike; path lag at
  the end of each roll push; the stop, drive and roll ratios as observations only.
- The provisional T, ζ chosen by §3.4.
- Tracked impact steps and µs/step against force drives on the P2b.2a scenarios (for P5).
- The longest tracked impact over a preset sweep, confirming or revising `TRACK_IMPACT_CAP`.
- How often `impact-head-deep`, `impact-cap` and `impact-head-approaching` fire across that sweep.

## 10. Deferred

**To P2b.2b.2 (calibration):** sourced swing defaults per preset; the face–ball and ball–ball contact-time fit and
the hand coupling's T, ζ; the stop-shot and drive ratio calibration and held-out validation (rolls, pass roll, stop →
pass-roll ordering, pull, stop-shot lift); which stop preset is the calibration target (§5.4); the crush-calibration
decision (roadmap, "Open decision: crush calibration"); 29.1.6.3 with a sourced contact-time norm; head–turf
stiffness and friction sourcing; `END_WEIGHTING_FACTOR`; face presets beyond wood.

**Beyond P2b, required in the final implementation** (roadmap P2 row): 29.1.10, with mallet–obstacle contact;
divots and lasting turf damage; a moving pivot (shoulder and wrist), so the hands follow more than a fixed arc. Three-
and four-ball cannons remain deferred as before.

## 11. Roadmap changes (in this PR)

- P2 row: P2b.2b split into P2b.2b.1 (this spec) and P2b.2b.2, with their exit criteria; the three items of §10 added
  to "deferred beyond P2b but required".
- "P2b.2 decisions": the drive model's coupling criterion (§3.4) and the two stop presets.
- P3 row: `SwingProfile` is the physical profile P3 wraps.
