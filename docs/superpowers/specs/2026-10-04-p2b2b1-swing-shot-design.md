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

**Amended 2026-10-04 (spec review: subtraction, completeness, framing).** A relaxed grip alone cannot brake the AC
stop: with the hands still coasting at full speed, even a soft damper (about 70 N·s/m at γ = 0.1) pulls about 120 N
forward against about 4 N of turf drag. The AC stop therefore also carries a check (user decision), the grip still
relaxes so the head sags onto the turf, and the braking tests assert mechanisms on hand-built setups, not dominance on
the provisional profile. The check is relative to the contact speed (`speedGain`, user decision), so it behaves alike
at every strength and never reverses the swing. The arc has one drive window, not a phase list; the coupling has one
period and damping ratio; the end-weighted head, `grip.style` and the single-valued `face` leave the engine's profile.
The face-pitch sign is fixed (positive lean pitches the face down). The head is placed against the ball's sunk centre;
the arc radius is measured to the socket; the feed-forward is computed for the path's rigid motion, so a head on the
path tracks it exactly. The track end rule waits for the drive window; each preset has a canonical setup whose head
starts clear of the turf; the probe exposes the hand and head–turf forces and the braking impulses are defined; the
coupling and head–turf constants are module constants, not World fields; the two 29.1.13 clauses are ordered and told
apart; `FAULT_LAW_KEYS` gains 29.1.14.

**Amended 2026-10-05 (plan).** C29.18 has one paragraph, C29.18.1, and sets no angular test, so "more than 90°" is the
engine's reading; the user kept it, with no graded or stricter threshold. `StrokeContext` also gains `lineOfCentres?`,
since the impact carries no starting positions. `ImpactSetup.headTurf` is the pair's law or null rather than a boolean;
the head–turf pair acts at the lowest point itself. `contact.json` uses flat keys `handCouplingPeriod` and
`handCouplingDampingRatio`; `HAND_COUPLING` is planned at T = 0.08 s until the pre-flight search sets it. The default
shaft (0.9144 m, 36 in) and top hand (0.889 m, 35 in) are sourced, so r ≈ 0.805 m. The canonical striker stands at
(9.6012, 4), since the peg occupies the court's centre. Canonical clearances: 7.90 mm (single-ball, drive, GC stop),
0.80 mm (AC stop), 30.9, 41.2 and 46.4 mm (half, full and pass rolls). The tracking bound holds on coasting and roll
paths; on a full check the residual is semi-implicit Euler's O(dt·a) lag, tested by convergence. The AC stop gains a
hands-down drop (user decision, from the user's account of the stroke): `handDrop`, the hands lowering from rest over
the window and then holding their height, so the head reaches the turf in time whatever the coupling's period, which
would otherwise set the passive sag (3.6 mm at 40 ms, about 14 mm at 80 ms). Details:
`plans/2026-10-04-p2b2b1-swing-shot.md`.

## 1. Goal and exit criteria

Turn a `ShotSetup` into a whole shot: a swing model builds the mallet head's state and the path the hands follow; the
impact integrates the head pulled along that path, including any re-contact and the head meeting the turf; the fault
judge rules on it; phase 2 rolls the balls out.

Exit criteria:

1. The analytic and hand-checked cases of §8.1 hold.
2. Force-table drives are bit-identical to P2b.2a. `scripts/impactDigest.ts` output is byte-identical to `main`'s
   after the mechanical `{ kind: "force", samples }` migration; phase 2's shot-mix work units (p99 143,084, p99.9
   362,050, max 408,030), `SLOW_TESTS=1`, the obstacle fuzz and the reach filter reproduce exactly.
3. On a 3 m/s centre strike with the provisional coupling and a firm grip, the hands' impulse during the face–ball
   contact is at most 5 % of the transfer impulse (§3.4).
4. `simulateShot` runs every preset's canonical setup (§5.5) end to end without a `RangeError`; the pre-flight
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

/**
 * The path the hands drive the socket along: a pendulum arc in a vertical plane about a pivot that may itself move in
 * that plane (the body's weight moving from back to front, the hands dropping). Arc and pivot accelerate constantly
 * for `window`, then run on at constant rates, the pivot's height held.
 */
interface SwingArc {
    readonly pivot: Vec3;              // the top hand at t = 0, world frame
    readonly pivotVelocity: Vec3;      // at t = 0, in the swing plane (no component along n)
    readonly pivotAcceleration: Vec3;  // during the window, in the swing plane
    readonly aim: Vec3;                // unit, horizontal: the swing plane's forward direction
    readonly radius: number;           // pivot to socket, m
    readonly theta0: number;           // arc angle at t = 0, rad, from the lowest point, positive forward
    readonly omega0: number;           // arc rate at t = 0, rad/s
    readonly alpha: number;            // arc acceleration during the window, rad/s²
    readonly window: number;           // s
    readonly shaftToHead: Quaternion;  // the head's orientation relative to the shaft frame
}

/**
 * The hands' grip on the head: the natural period (s) and damping ratio of a firm grip, used for both translation and
 * rotation, and the grip's tension in (0, 1] (1 firm; lower is relaxed, §3.3).
 */
interface Coupling {
    readonly period: number;
    readonly dampingRatio: number;
    readonly tension: number;
}
```

The arc and the pivot's motion are what the body does to the hands' path (shoulders, arms, weight transfer, to first
order); the coupling is how loosely the hands hold the head on it. Together they deform the head's actual path away
from a plain circle: a power roll moves the pivot forward with the arc angle nearly constant, so the face's tilt is
held while the head is pushed; an AC stop checks the hands and relaxes the grip, so the head sags onto the turf and
its rear rim drags.

### 3.2 The path

During the window (0 ≤ t ≤ w): θ = θ₀ + ω₀·t + ½·α·t², P = P₀ + V₀·t + ½·A·t². After it, θ and P run on at the
rates they reached, θ_w + ω_w·(t − w) and P_w + V_h·(t − w), V_h being V_w's horizontal part: the hands' height is
then held, so a pivot lowered during the window (the AC stop's hands-down drop, §5.2 step 7) stops there.
θ_w, ω_w, P_w and V_h are computed once, in `prepareImpact`; θ, ω and P are continuous by construction, and V is too
apart from any vertical speed the window gave the pivot, which drops to zero at its end.

With n = aim × ẑ (the pitch axis) and the shaft frame's forward axis along aim at θ = 0 (a positive rotation about n
tilts the forward axis up):

- socket target p = P + r·(sin θ·aim − cos θ·ẑ), velocity v_p = V + r·ω·(cos θ·aim + sin θ·ẑ), acceleration
  a_p = A + r·α·(cos θ·aim + sin θ·ẑ) + r·ω²·(cos θ·ẑ − sin θ·aim), with A and α zero after the window;
- orientation target q_path = rot(n, θ) ⊗ q_aim ⊗ `shaftToHead`, where q_aim turns the body x axis to aim; angular
  velocity ω_path = ω·n; angular acceleration α_path = α·n;
- the path's rigid motion carries the head's centre of mass to c_path = p + d, d = q_path(c_body − s_body), with
  acceleration a_c = a_p + α_path × d + ω_path × (ω_path × d).

Each step evaluates `sinCos(θ)` and `sinCos(θ/2)`.

### 3.3 The hand load

Each step, in place of `driveAt`, the hands apply a force F at the socket and a couple τ_h about the centre of mass:

- F = F_ff + k·(p − s) + c·(v_p − v_s), where s and v_s are the socket's world position and velocity;
  k = γ·m·(2π/T)², c = 2ζ·√(k·m), γ the grip's `tension`;
- τ_h = τ_ff + K_θ·θ_err + C_θ·(ω_path − ω), applied per principal axis in the body frame with
  K_θ,i = γ·I_i·(2π/T)², C_θ,i = 2ζ·√(K_θ,i·I_i); θ_err = 2·sign(w)·vec(q_path ⊗ q̄), w the product's scalar part;
- feed-forward, the wrench that makes the path's rigid motion exact: F_ff = m·a_c + γ·m·g·ẑ and
  τ_ff = I·α_path + ω_path × (I·ω_path) − r_s × F_ff (body frame for the inertia terms), r_s the socket from the
  centre of mass, g gravity.

The head's torque is r_s × F + τ_h, as the force-table drive's socket force contributes r_s × F today. With a firm
grip (γ = 1) a head started on the path follows it exactly, apart from the integrator's own error (bounded by §8.1);
the spring and damper act only on what the balls and the turf do to the head. A relaxed grip (γ < 1) holds the head
more softly and carries only γ of its weight, while still driving its swing: the head sags towards the turf by about
(1 − γ)·m·g/k and the turf and balls deflect it further, which is the deformed path of §3.1.

### 3.4 The provisional coupling

The coupling must leave the head effectively free during the ~1 ms face–ball contact (so the transfer is the head's,
not the hands') yet transmit the hands' force over a 30–58 ms roll push. A 5 ms period fails the first: for the
1.0 kg head, critically damped, c ≈ 2,500 N·s/m, so a 1.7 m/s slowdown in the strike draws about 4 kN of hand force,
comparable to the 3.7 kN peak face force.

**Criterion.** On a 3 m/s centre strike on a single ball with a firm grip (γ = 1), ∫|F − F_ff| dt over the face–ball
interval is at most 5 % of the ball's momentum change over it. Pre-flight holds ζ at 0.7 and searches T from 40 ms
for the shortest period meeting it. `HAND_COUPLING` records T and ζ (§7) with provenance "provisional (P2b.2b.2
sources or fits)" and the criterion in the note. Exit criterion 3 tests it.

### 3.5 End rule

For a `track` drive the impact ends when every condition holds:

- a face–ball contact has closed;
- the drive window has closed (t ≥ `window`), as the force-table rule waits for its last sample;
- no face–ball, ball–ball, ball–obstacle or head–turf contact has been closed for `RELEASE_STEPS` steps;
- no ball in turf contact is bouncing (P2b.1's rule);
- the head is not closing on any ball within reach (`headClosing`).

A head still catching a ball keeps the impact running, so a re-contact (a double tap, or the later impulse Gugan
attributes most of a drive's striker distance to) is integrated, not flagged. The arc rises past its lowest point, so
a head behind a ball rolling on the turf separates from it; a ball faster than the head ends it once the window has
closed. Otherwise the impact ends at `TRACK_IMPACT_CAP` = 0.12 s (about twice the 58 ms longest roll contact the
Croquet Association measured) with `impact-cap`, and `impact-head-approaching` for any ball the head is still closing
on. `ImpactOptions.cap` overrides either cap.

A `force` drive keeps P2b.1's rule and `IMPACT_CAP` = 0.06 s unchanged. At 0.12 s (24,000 steps) the WAKE_MARGIN
reach filter keeps about 50× headroom.

### 3.6 Validation

`validateImpact` adds, for a `track` drive: every number finite; `radius` > 0; `aim` unit and horizontal (within
1e-12); `shaftToHead` unit (within 1e-12); `period` > 0; `dampingRatio` ≥ 0; `tension` in (0, 1]; `window` > 0;
`pivotVelocity` and `pivotAcceleration` in the swing plane (component along n within 1e-12 of their size). Each failure
is a `RangeError` naming the check. The head's state at t = 0 need not lie on the path (tests start it off);
`buildContact` always starts it on.

### 3.7 Probe

`ImpactSnapshot` gains, for a `track` drive, `hand: { force: Vec3; feedForward: Vec3 }` (F and F_ff) and
`headTurf: Vec3` (the turf's total force on the head; zero while the pair is open). For a `force` drive they are
absent and `drive` is unchanged. Two impulses are defined on them, each from the end of the first face–ball interval
to the end of the impact, along aim, and positive when they slow the head:

- the hands' braking impulse, −∫ (F − F_ff)·aim dt;
- the turf's braking impulse, −∫ headTurf·aim dt.

## 4. Mallet–turf contact

### 4.1 The pair

For a `track` drive a `head-turf` pair is added after the existing pairs (pair-list order, so the force-table order
is untouched). `ImpactSetup` gains `headTurf: boolean`, true from `prepareImpact` for a `track` drive; isolated test
setups may set it false, as `ImpactBall.turf = null` leaves a ball's turf out. The head is a solid cylinder of axis a
(unit, world), half-length L/2 and radius ρ; its lowest point, for |a_z| < 1, is c − (L/2)·sign(a_z)·a − ρ·u, with u
the unit vector of ẑ − a_z·a; for |a_z| = 1 the face disc is level and the contact point is its centre. The
penetration is δ = −z of that point when positive.

- **Normal force:** the turf's clamped linear spring–dashpot, as the ball–turf pair has it, with
  `SurfaceProps.turfStiffness` and damping solved from `turfRestitution` with the head's mass as the effective mass.
  The surface is sampled once, at the head's lowest point at t = 0, and the law solved once in `prepareImpact`, as
  the other laws are (v1 lawns are uniform).
- **Friction:** Cundall–Strack, as the other pairs, with `HEAD_TURF_FRICTION` (§7).

Both act at the contact point, so they twist the head. The turf values are the ball's, labelled provisional for the
head (an edge or side presses a different footprint); P2b.2b.2 revisits them, including whether a plane turf with
Coulomb drag under-represents a heel ploughing in.

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
        readonly shaftLength: number;
    };
    readonly grip: { readonly topHandHeight: number };
    /**
     * Ball ahead of the arc's lowest point (m), shaft lean at contact (rad, positive pitches the face down), and the
     * grip's tension from contact on (1 firm, lower relaxed).
     */
    readonly stance: Readonly<Record<StrokeType, {
        readonly ballAhead: number; readonly shaftLean: number; readonly gripTension: number;
    }>>;
    /**
     * Over `window` (s) at full `drive`: the hands' arc speed changes by `speedGain` times its speed at contact; the
     * body moves forward at `bodySpeed` (m/s) at contact and accelerates at `bodyAccel` (m/s²). Whatever `drive`, the
     * hands lower by `handDrop` (m) from rest over the window, then hold their height.
     */
    readonly drive: Readonly<Record<StrokeType, {
        readonly speedGain: number; readonly bodySpeed: number; readonly bodyAccel: number; readonly window: number;
        readonly handDrop: number;
    }>>;
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

The product spec's grip style (it only pre-fills `topHandHeight`, §4), weighting and face material are profile
inputs with no engine reader yet: the planner and P3's stored profile carry grip style; the end-weighted head and
other faces arrive with their sourced values (§10). The engine's head is centre-weighted with a wooden face.

### 5.2 Derivation

1. **Arc radius.** r = `topHandHeight` − h₀ − ρ: the socket's height at address, with the head level and its centre
   at the ball's resting centre height h₀ (R less its static sink), is h₀ + ρ.
2. **Contact angle.** θ_c = atan2(`ballAhead`, √(r² − `ballAhead`²)): positive is a rising strike, negative a
   descending one.
3. **Face angle.** The head's pitch about n at contact is −`shaftLean`, whatever θ_c, so a positive lean pitches the
   face down: `shaftToHead` = rotation by −`shaftLean` − θ_c about the shaft frame's pitch axis (n in the shaft
   frame). The face is the head's leading end disc; its outward normal f is the body +x axis.
4. **Head placement.** The point on the face at (`up`, `side`) from its centre (`up` along the face's upward in-plane
   axis, `side` along n's horizontal complement, positive to the left of aim) lies on the line through the ball's
   sunk centre (z = R − static sink, where `validateImpact` checks the head against it) along −f, at distance
   R + `START_GAP` from it; `START_GAP` = 1e-6 m, so rounding never starts the face in the ball. The head's centre is
   L/2 behind the face centre along −f; the socket is the centre of the head's upper surface.
5. **Pivot.** pivot = socket − r·(sin θ_c·aim − cos θ_c·ẑ). Its height follows from where the ball is, as a player
   bends to meet it; whether the head reaches the turf then follows from the stance, the grip and the contact.
6. **Speed.** The pivot moves at V₀ = `bodySpeed`·aim. ω₀ is the larger root of |V₀ + ω₀·n × (c − pivot)| =
   `speed`, c the head's centre, so the centre of mass moves at `speed`; no non-negative root (the body alone moves
   the head faster than `speed`) is rejected (§5.3). The head's velocity and angular velocity at t = 0 are the path's:
   V₀ + ω₀·n × (c − pivot) and ω₀·n.
7. **Drive.** α = `drive`·`speedGain`·ω₀/`window` and A = `drive`·`bodyAccel`·aim during `window`, then zero. A
   check with `speedGain` 1 at `drive` −1 brings the hands' arc to rest at the window's end, and it stays at rest, at
   any strength. The hands' drop adds −(2·`handDrop`/`window`²)·ẑ to A, whatever `drive`: from rest at contact the
   pivot lowers by `handDrop` over the window and its height is then held (§3.2), so the ball is still met on the up.
   The coupling is `HAND_COUPLING` with `tension` = the preset's `gripTension`.
8. **Mallet.** Mass, length and diameter; inertia from `solidCylinderInertia`; the face material is `mallet.json`'s
   wood.

### 5.3 Rejections

`buildContact` throws a `RangeError` naming the check for: r ≤ 0; r > `shaftLength` (the top hand is off the shaft);
|`ballAhead`| ≥ r; `speed` ≤ 0; |`drive`| > 1; √(`up`² + `side`²) ≥ the head's radius (contact off the face); a stroke
type missing from `stance` or `drive`; `window` ≤ 0; `speedGain` < 0; `gripTension` outside (0, 1]; `bodySpeed` < 0;
`handDrop` < 0; no non-negative ω₀ (§5.2 step 6); the head's lowest point below the turf at t = 0; a non-finite number.
`simulateImpact`'s own validation then runs as today.

### 5.4 The default profile

`defaultProfile` ("typical club player") ships with these values, every one marked provisional in its source comment.
The mallet is `mallet.json`'s; the rest are estimates within the feasibility spike's ranges, chosen before any ratio is
measured and never tuned to one. The planner's default `drive` per preset is listed with them.

| Field | Value |
|---|---|
| Mallet | 1.0 kg, 0.2286 m, 0.0762 m, shaft 0.91 m |
| Grip | top hand 0.85 m (r ≈ 0.77 m) |

| Preset | ballAhead (m) | shaftLean (°) | gripTension | speedGain | bodySpeed (m/s) | bodyAccel (m/s²) | window (ms) | handDrop (mm) | default drive |
|---|---|---|---|---|---|---|---|---|---|
| single-ball | 0 | 0 | 1 | 0.2 | 0 | 0 | 10 | 0 | 0 |
| drive | 0 | 0 | 1 | 0.2 | 0 | 0 | 5 | 0 | 0 |
| stop-ac | 0.13 | −4 | 0.1 | 1 | 0 | 0 | 10 | 5 | −1 |
| stop-gc | 0 | 0 | 1 | 1 | 0 | 0 | 10 | 0 | −1 |
| half-roll | −0.05 | 25 | 1 | 0.2 | 0.2 | 5 | 20 | 0 | +1 |
| full-roll | −0.07 | 35 | 1 | 0.2 | 0.3 | 8 | 30 | 0 | +1 |
| pass-roll | −0.08 | 40 | 1 | 0.5 | 0.4 | 10 | 15 | 0 | +1 |

The presets follow the user's account of play (2026-10-04). **AC stop:** the feet are set further back, so the ball
is met slightly on the up (positive `ballAhead`, about 10° of rise), amplified by tilting the face up (negative
`shaftLean`, which also lowers the head's rear rim); the hands relax on contact, so the head sags and its base rubs
the turf, slowing it and cancelling the follow-through. The model gives it a check as well (the hands stop driving
through), a relaxed grip, and a hands-down drop timed with the strike (user account, 2026-10-05: the player lets
the mallet drop onto the lawn so that its underside's friction arrests it, some pushing it down to hasten the stop).
The drop, 5 mm over the 10 ms window, covers the 0.8 mm the head starts above the turf and the 2.5 mm the checked arc
still rises, and leaves the hands' path below the turf, so the relaxed grip presses the head onto it. Without it the
head would reach the turf only by sagging under its weight, late, and by an amount that hung on the coupling's period.
**GC stop:** the lower hand grips
lower and actively stops the swing just after contact (a check); it is not deliberately played on the up, but is a
hard, level shot with no follow-through, so the striker's ball reaches the croqueted ball without spin, like a stun in
snooker. **Power rolls:** the body's weight moves from back to front, keeping the face tilted while pushing forward
(the rolls' `bodySpeed` and `bodyAccel`). **Pass roll:** the balls are slightly offset (a split shot: the planner's
`aim` off the line of centres) and the bottom hand punches in contact, imparting additional force to the striker's
ball (the pass roll's larger `speedGain` over a short `window`, on top of the body's push). The punch reaches the head
at once through the feed-forward (§3.3), so the coupling's long period does not blunt it, and §3.4's criterion, which
excludes the feed-forward, does not limit it.

**Open for P2b.2b.2.** The AC stop is a rising strike, so stop-shot lift can be expected of it, as the feasibility
spike found for rising strikes. The GC stop is level, and the spike found level strikes never lift the striker's ball,
so its ratio must come from the check alone; the roadmap's stop-shot-lift criterion applies to the AC stop. Which stop
is the calibration target is P2b.2b.2's decision.

### 5.5 Canonical setups

Exit criterion 4 and pre-flight run each preset at one canonical setup: the striker at the court's centre, aim +y,
`speed` 3 m/s, the preset's default `drive`, `side` 0; for a croquet stroke the croqueted ball touching the striker
ahead along aim, except the pass roll, whose line of centres is 20° off aim; `live` empty for a croquet stroke and
every other ball for a single-ball one; no other balls; `continuation`, `hampered` and `jumpAttempt` false. `up` is 0
except for stop-ac, whose face, tilted up 4°, would otherwise start its rear rim about 11 mm in the turf: its `up`
is −0.012 m (the ball met 12 mm below the face centre), leaving the rim about 1 mm clear, which the relaxed grip's
sag (about 3.6 mm at T = 40 ms) closes. The plan computes each preset's clearance; a canonical setup that starts in
the turf is a defect in the table, not in the model.

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
- `aim`: the swing direction (unit, horizontal).
- `striker`, `croqueted`, `live`, `hampered`, `jumpAttempt` are copied.

### 6.4 New judgements

- **29.1.13 "plays away from" (C29.18.1).** `StrokeContext` gains `aim?: Vec3` (absent when the judge is called
  directly without a swing). In a croquet stroke with `aim` present, a fault is found when the angle between `aim`
  and the horizontal line from the striker's centre to the croqueted ball's exceeds 90°, i.e. their dot product is
  negative; evidence `angle` (rad), `ball` the croqueted ball, `t` the impact's duration. Both 29.1.13 clauses may
  fire on one stroke: "fails to move or shake" (evidence `peakPenetration`, as today) is reported first, "plays away
  from" (evidence `angle`) second, and the evidence key tells them apart. The criterion is checked against C29.18
  when it is quoted into `laws.json`; if the commentary gives a different test, the user decides before the plan
  proceeds.
- **29.1.14 (court damage).** Quoted verbatim with its commentary into `laws.json`. A damaged lawn is something an
  adjudicator sees, so it is a `possible-fault` (as 29.2.5–29.2.7 frame perception): found when `head/turf` has an
  interval and the stroke is under Law 29.2.3 (`hampered`, `jumpAttempt` or `group`); evidence `penetration` (m),
  `peakForce` (N), `slide` (m); `ball` the striker's; `t` the first interval's start. No damage threshold is
  invented. It is reported after 29.1.13, in table order.

`JUDGED_LAWS` and `FAULT_LAW_KEYS` (`src/reference/index.ts`) gain "29.1.14". `judgeFaults`'s signature is unchanged;
it validates `aim` (unit, horizontal) when present.

### 6.5 Exports

`src/engine/index.ts` adds `simulateShot`, `simulateImpact`, `judgeFaults`, `defaultProfile`, `CROQUET_STROKES` and
the types `ShotSetup`, `SwingProfile`, `StrokeType`, `ShotOutcome`, `ContactState`, `Drive`, `SwingArc`, `Coupling`,
`ImpactResult`, `ImpactEvent`, `StrokeContext`, `FaultReport`, `Finding`.

## 7. Reference data

The new constants are module constants read from the reference files, as `world.ts` reads its references; `World`
and `validateWorld` are unchanged. A `ContactState` carries its own coupling, so tests and the sweep vary it there.

| File · key | Constant | Value | Provenance |
|---|---|---|---|
| `contact.json` · `handCoupling` (period, dampingRatio) | `HAND_COUPLING` | set in pre-flight by §3.4 | provisional; criterion in the note; P2b.2b.2 sources or fits |
| `contact.json` · `headTurfFriction` | `HEAD_TURF_FRICTION` | 0.5, bounds 0.3–0.7 | estimate (wood on grass; no measurement found); P2b.2b.2 sources |
| `contact.json` · `headDeepLimit` | `HEAD_DEEP_LIMIT` | 2 mm | provisional model limit |
| `mallet.json` · `shaftLength`, `topHandHeight` | (default profile) | 0.91 m, 0.85 m | provisional defaults |
| `laws.json` · 29.1.14, C29.18 (full), 29.1.14's commentary | — | verbatim | WCF AC Laws 7th edition with ORLAC |

## 8. Testing

### 8.1 Analytic and hand-checked cases

- **Path.** θ, ω, P and V during and after the window match the closed forms, continuous at the window's end; a
  pivot lowered during the window holds its height after it. A pivot accelerating forward with α = 0 and ω = 0 moves the socket target in a straight line with the orientation target
  constant (the power roll's held face tilt). A check with `speedGain` 1 brings ω to 0 at the window's end and holds
  it there.
- **Tracking, no ball.** A head started on the path with a firm grip follows it over 0.12 s within a bound pre-flight
  measures and the plan fixes (target 1e-6 m and 1e-6 rad; the feed-forward is exact, so the residual is the
  integrator's). A head started 1 mm off the path returns as the damped oscillator of period T and ratio ζ predicts
  (within 1 % of amplitude).
- **Relaxed grip.** A head with γ < 1, no ball and `headTurf` false sags towards (1 − γ)·m·g/k below the path and
  settles as the damped oscillator predicts; with `headTurf` true it comes to rest on the turf.
- **Free in the strike.** Exit criterion 3.
- **Re-contact.** A croquet split whose striker's ball leaves slower than the head is struck again within the impact,
  with no `impact-head-approaching`; a clean centre single-ball strike ends within `RELEASE_STEPS` of the later of the
  window's end and the ball outrunning the head.
- **Head–turf.** A head lowered onto the turf at rest settles at m·g/k; a head sliding level along the turf at
  constant normal load decelerates at μ·g within 1 %; `headTurfSlide` matches the closed form; `impact-head-deep`
  fires just over 2 mm and not just under.
- **Swing model.** Each derivation step separately: r; θ_c from `ballAhead`; face pitch −`shaftLean` (face down for a
  positive lean) for θ_c of −10°, 0°, +10°; face 1 µm short of the sunk ball at the requested (`up`, `side`);
  centre-of-mass speed equal to `speed`, with and without `bodySpeed`; the window's α and A. Every rejection names
  its check, including a `bodySpeed` above `speed` and a head starting in the turf. Setups mirrored across a vertical
  plane give mirrored `ContactState`s.
- **`simulateShot`.** Each `kind`; `group` for 3- and 4-ball groups and the croquet pair alone; 29.1.13 at 89.9° and
  90.1° (aim vectors built directly, not through `sinCos`), with both clauses firing together in their order; 29.1.14
  only under 29.2.3; phase 2 receives exactly `impact.handover`; every setup check names its failure; every canonical
  setup (§5.5) runs.
- **Braking mechanisms** (hand-built setups, not `defaultProfile`; impulses per §3.7). A rising strike with the face
  tilted up, a relaxed grip and a check: the head–turf pair closes after contact and the turf's braking impulse is
  positive. A level strike with a firm grip: the hands' braking impulse with `drive` −1 exceeds that with `drive` 0.
  Ratios are not asserted.
- **Pass-roll punch** (hand-built). In a roll split 20° off the line of centres, `drive` +1 leaves the striker's ball
  faster at the end of the impact than `drive` 0. Ratios are not asserted.

### 8.2 Bit-identity

Exit criterion 2. The `force` migration is mechanical and reviewed by the digest diff.

## 9. Pre-flight measurements (recorded in the roadmap)

- The provisional T at ζ = 0.7 chosen by §3.4.
- Coupling sweep, T 10–200 ms × ζ 0.2–1, canonical setups: hand impulse and peak hand force in the strike; path lag
  at the end of each roll push; the stop, drive and roll ratios as observations only.
- The tracking bound of §8.1 at the chosen coupling.
- Tracked impact steps and µs/step against force drives on the P2b.2a scenarios (for P5).
- The longest tracked impact over a preset sweep, confirming or revising `TRACK_IMPACT_CAP`.
- How often `impact-head-deep`, `impact-cap` and `impact-head-approaching` fire across that sweep.

## 10. Deferred

**To P2b.2b.2 (calibration):** sourced swing defaults per preset; the face–ball and ball–ball contact-time fit and
the hand coupling's T, ζ; the stop-shot and drive ratio calibration and held-out validation (rolls, pass roll, stop →
pass-roll ordering, pull, stop-shot lift); which stop preset is the calibration target (§5.4); the crush-calibration
decision (roadmap, "Open decision: crush calibration"); 29.1.6.3 with a sourced contact-time norm; head–turf
stiffness and friction sourcing, and whether turf drag needs a ploughing term; the end-weighted head with a sourced
inertia factor; face presets beyond wood.

**Beyond P2b, required in the final implementation** (roadmap P2 row): 29.1.10, with mallet–obstacle contact;
divots and lasting turf damage; a fully articulated body (shoulder, elbow and wrist) beyond this phase's translating
pivot. Three- and four-ball cannons remain deferred as before.

## 11. Roadmap changes (in this PR)

- P2 row: P2b.2b split into P2b.2b.1 (this spec) and P2b.2b.2, with their exit criteria; the three items of §10 added
  to "deferred beyond P2b but required".
- "P2b.2 decisions": the drive model's coupling criterion (§3.4) and the presets as the user described them.
- P3 row: `SwingProfile` is the physical profile P3 wraps (with grip style, weighting and face). Which of the drive
  entry's four fields P3 fits is P3's decision; stance, `gripTension` included, is entered (product spec §7).
