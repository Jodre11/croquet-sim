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
8.78 mm (AC stop, as re-derived below), 30.9, 41.2 and 46.4 mm (half, full and pass rolls). The tracking bound
holds on coasting and roll paths; on a full check the residual is semi-implicit Euler's O(dt·a) lag, tested by
convergence. Details: `plans/2026-10-04-p2b2b1-swing-shot.md`.

**Amended 2026-10-05 (two arcs, timing, the dip and the lawn before the ball; user decisions).** From the user's
account of how a player plays a stroke:
- The player chooses the shot type, the balls are set up, and the player takes a stance for that type.
- The player places the top and bottom hands on the mallet, which sets the head's angle and the balance between push
  and swing, then chooses where and how to hit the striker's ball.
- The player rehearses the swing's shape, specific to the shot. That swing is two arcs. One is the pendulum: the
  mallet swinging between the two hands, a fixed distance apart. The other is the hands' path through space: leaning,
  pushing forward, moving the body's weight, and dipping.
- In a drive the top hand stays essentially fixed and all the action is the pendulum's. In a roll the pendulum is
  fixed or creeps forward, and the hands carry the head through space.
- The player times each action against the strike, and can mistime any of them.

In the AC stop, the player times dropping the mallet onto the lawn with the strike, so that its underside's friction
arrests it; some push it down. Too early (before contact, or before the bottom of the swing) or too hard, a dip
dissipates the shot before contact, flattens the strike and the face's tilt, and drives the leading bottom edge into
the lawn before the ball. A mistimed dip can do this in any stroke, and follow-through has the same timing problem.
Five changes follow.

- **Two arcs** (§3.1, §3.2, §5.1, §5.2). The pendulum has its own window, in which `speedGain` checks or pushes it.
  The hands' path through space has its own window too. Each preset sets the hands' share of the head's speed at
  contact (`handShare`: 0 for a drive, about 0.9 for a full roll) and their change over their window (`handGain`).
  These replace the absolute `bodySpeed` and `bodyAccel`, so a roll keeps its character at any strength. Both arcs'
  changes (`speedGain`, `handGain`) are measured against the head's speed at contact, so the slow pendulum of a pass
  roll can still accelerate swiftly during the push. `drive` scales both.
- **The dip.** The hands' path also dips. The pivot lowers by `handDrop` over `dropTime` from rest to rest: constant
  acceleration for the first half, deceleration for the second. It exists in every stroke type; only the AC stop's
  default depth is non-zero. Without it the AC stop's head would reach the turf only by sagging under its weight:
  late, and by an amount set by the coupling's period (3.6 mm of free sag at 40 ms, about 14 mm at 80 ms).
- **Timing** (§5.1). `stroke.timing` gives, per shot, when the pendulum's action, the hands' action and the dip
  begin, in seconds from contact (negative is early, positive late; 0 by default).
- **The lead-in** (§3.5, §5.2; user decision). The impact starts before contact only when an action is timed early,
  from the earliest one, up to `MAX_LEAD` = 60 ms; an on-time stroke still starts at contact, at no extra cost. A dig
  before the ball is simulated, never rejected, whenever the swing between that start and contact meets the turf:
  head–turf contact, `impact-head-deep`, the slide and a weaker or flatter strike show it. A swing cannot always be
  followed back to a clear start: on a rigid pendulum the head tilts with the shaft, so swung back 10° its leading rim
  drops about 20 mm while the socket rises about 12 mm, and a low stance's path, followed backwards, stays in the turf
  for the whole 60 ms. So the swing model reports instead how close the head's coasting path comes to the lawn in the
  60 ms before contact (`ShotOutcome.approach`; negative where it would have dug in), and rejects a setup whose head
  is already in the turf where an early action begins (the stance too low for that timing). The grip is firm until
  contact and relaxes there (`Coupling.relaxAt`). The cap counts from contact.
- **The bottom hand.** Deriving the head's angle and the push–swing balance from where the hands sit needs the
  articulated body (deferred, §10). Until then each preset sets them directly, as `shaftLean` and `handShare`.
- **The AC stop's stance is re-derived.** As first specified (9.3° rise, the ball met 12 mm below the face centre), its
  swing entered the turf 22 ms before the ball, up to 16.5 mm deep in the 60 ms before. A default must be a well-played
  stroke. It now meets the ball 5.7° on the up (`ballAhead` 0.08 m), 20 mm below the face centre, with the face tilted
  up 4°: the feasibility spike's stop shot (5–15° rise, 3–5° tilt, contact 20 mm below the axis). The head is 8.8 mm
  clear at contact and at least 2.2 mm clear over the 60 ms before. The dip is 14 mm over 20 ms. The level presets'
  closest approach before contact is 0.5 mm, 36 ms out (the head's front rim as it pitches back); the rolls stay above
  30 mm.
- **The roll presets give the hands most of the head's speed** (`handShare` 0.6, 0.9 and 0.85 for the half, full and
  pass roll), where the first presets gave them 0.2–0.4 m/s of a 3 m/s head. All are provisional, to be refined from
  outcomes.

Casting versus planted swings are a matter of how the player sets up and rehearses the shot. They belong to the
human-interaction design (P4), not the physics (user decision).

**Amended 2026-10-05 (pre-flight and prototype; user decisions).** The pre-flight ran the plan as merged and found two
model failures.
- **The roll catapult.** In the full roll a face pitched 35° down, a path that kept accelerating into the blocked ball
  and sticking face friction made the head climb the ball until the contact left the face disc. Off the face the pair
  applied no force (the barrel and rims were not colliders), so the ball sank about 15 mm into the head; when the
  head's pitch brought the ball's centre back inside the disc, the face contact opened at δ ≈ 15 mm in one step:
  68 kN, about 494 J injected, the striker's ball sent up at 13 m/s and the croqueted ball off at 17.4 m/s. The pass
  roll rode through both balls with no force at all.
- **The relaxed AC check.** The feed-forward was the full m·a whatever the grip's tension (γ = 0.1), so the check's
  ≈ −298 N overpowered the relaxed coupling's ≈ +60 N and drove the head backwards; the braking test's turf impulse
  came out −0.221 N·s.

The pre-flight's coupling search gave T = 0.077 s at the 5 % criterion; the user kept 0.08 s (4.80 %, a margin). Under
the two-hand model below that criterion no longer constrains T (§3.4), so exit criterion 3 is replaced.

The model is rebuilt on the user's account of play (2026-10-05) and on John Riches, *Croquet Technique* (Oxford
Croquet, http://www.oxfordcroquet.com/coach/riches/croqtech/index.asp), which the user chose as the source for what
happens at the end of reach. The user's account:
- The bottom hand behaves differently per stroke. In a full roll a finger is extended down the shaft, the swing is
  limited and the follow-through weak and delayed: a long smooth push. In a pass roll (the balls offset to split) the
  lower hand is a fist and, once the push starts, punches a small swing of the mallet.
- In every shot the bottom hand releases its grip but can still push with open fingers once the mallet's arc
  necessitates it, sooner with a wider grip. The release follows from the shaft's arcing and the hand's reach: the
  hand is on an arm.
- In a drive all the power comes from the arc's momentum; the lower hand is a guide that maintains the arc without
  accelerating the head. Excessive, accelerating bottom-hand power turns the double hit into a triple or more, and a
  half- or full-roll effect. The mallet travels forward about as far as the backswing; the head is heavier than a
  ball. (Croquet England's slow-motion page shows normal AC strokes with double taps or maintained contact, hence Law
  29.2.5's visibility test.)
- In a roll the push ends when the player runs out of reach, with a rotation of the mallet. Good players lengthen it
  with a split stance, weight and arms back, sweeping the arms forward while moving their weight to the front foot; as
  reach runs out, rotation completes the stroke. Weaker shots do not use the full set-up: that choice is the P4
  planner's, as casting versus planted swings are.

Riches, on the half roll: "the forward slope of the mallet handle (and consequently the mallet face) should be
MAINTAINED throughout the swing; and for this to happen both hands must move FORWARD at the SAME RATE. The grip needs
to be firm, with the mallet head following through the ball and onto the ground." Changes:
- **Two hands on a rigid shaft** (§3.1, §3.3). The top hand is the pivot, `top` from the socket; the bottom hand is
  `bottom` from it. An arm mass rides at the top grip. Before contact the rigid path's wrench is split exactly over the
  hands. From contact the hands track the path's velocity only; the feed-forward is scaled by each hand's grip, the
  dip's part fed forward in full.
- **Two modes** (§3.2, §3.3). Swing (single-ball, drive, stops): after its window the pendulum swings freely and the
  bottom hand is a one-sided rate guide, two-sided through a check. Carry (rolls, after Riches): the slope is held, the
  bottom hand grips two-sided, and the hands' path ends after `handReach`, descending so the head finishes
  `groundDepth` below the turf. A firm off-aim grip with a gated reach end (prototype pass 5) was tried and not
  adopted: it broke the half roll and did not fix the full roll.
- **Release by reach** (§3.3): the bottom hand opens once the shaft has turned through its reach slack.
- **The whole head meets the balls** (§4.5): a solid-cylinder contact with continuous normal, its regions recorded, and
  a re-entry guard.
- **End rule** (§3.5): a 30 ms look-ahead; `TRACK_IMPACT_CAP` 0.15 s.
- **Coupling** (§3.4): T 0.08 s and ζ 0.7 kept; exit criterion 3 becomes an effective-mass test.
- **Profile** (§5): the stance is `lean`, `top`, `bottom`, `gripTension` and `bottomGrip`, with θ_c = −lean and
  r = `top`; `ballAhead`, `topHandHeight` and `shaftToHead` leave; each preset gains a mode, `handReach` (also a
  per-shot input) and `groundDepth`; the body gains `armMass`, `reachSlack` and an optional rate-guide cap. The
  presets follow Riches and the prototype's calibration; the AC stop rises 4°.
- **Testing** (§8): mechanism tests for the new model; the braking tests restated on the canonical setups.
- **Deferred** (§10): the low-speed face–ball law, the turf under load and the full roll's calibration go to P2b.2b.2.

This note supersedes the earlier notes where they differ: the AC stop's `ballAhead` of 0.08 m, 5.7° rise and 2.2 mm
approach; the roll clearances of 30.9, 41.2 and 46.4 mm; `shaftLean` (now `lean`) and the radius from
`topHandHeight`; the 5 % criterion and the pre-flight search that was to set T; and braking tests on hand-built setups
only. The prototype branch
`proto-two-hands` (5f0f22b, de6b67d, 06ab6f3, aeadd4c, ed0d1b5) is a reference and is never merged; the pre-flight's
mechanical defects fold into the re-planned tasks, and a fresh pre-flight follows the re-plan.

## 1. Goal and exit criteria

Turn a `ShotSetup` into a whole shot: a swing model builds the mallet head's state, the path the hands follow and how
they hold the shaft; the impact integrates the head pulled along that path, including any re-contact and the head
meeting the turf; the fault judge rules on it; phase 2 rolls the balls out.

Exit criteria:

1. The analytic and hand-checked cases of §8.1 hold.
2. Force-table drives are bit-identical to P2b.2a. `scripts/impactDigest.ts` output is byte-identical to `main`'s
   after the mechanical `{ kind: "force", samples }` migration; phase 2's shot-mix work units (p99 143,084, p99.9
   362,050, max 408,030), `SLOW_TESTS=1`, the obstacle fuzz and the reach filter reproduce exactly.
3. On the drive's canonical setup (§5.5, a 3 m/s centre strike), the swung body's effective mass at the face centre
   along aim (§3.4) is within 10 % of the head's mass.
4. `simulateShot` runs every preset's canonical setup (§5.5) end to end without a `RangeError`, with no re-entry
   guard hit (`ImpactRun.entryJumps.count` 0, §4.5) and no ball's centre more than 5 mm above R, in the impact or in
   phase 2's flight. The coaching ratios and the other measurements of §9 are recorded in the roadmap against their
   coaching ranges, not asserted.
5. `simulateShot`, `simulateImpact`, `judgeFaults` and their types are exported from `src/engine/index.ts`;
   `ENGINE_VERSION` is "0.6.0".

## 2. Architecture

```
src/engine/swing/        new: SwingProfile, StrokeType, ShotSetup, defaultProfile, buildContact()
src/engine/impact/       Drive union; the path's two arcs, modes and reach; the two hands on the swung body;
                         head–ball cylinder and head–turf pairs; the track end rule
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
    | {
          readonly kind: "track";
          readonly arc: SwingArc;
          readonly coupling: Coupling;
          readonly hands: Hands;
      };

/** How the hands carry the mallet after contact (§3.3): a swing (single-ball, drive, stops) or a carry (rolls). */
type StrokeMode = "swing" | "carry";

/**
 * The path the hands drive the mallet along, as two arcs (user's account, 2026-10-05): the pendulum, the mallet
 * swinging about the top hand (the pivot) in a vertical plane; and the hands' path through space, the pivot moving in
 * that plane (leaning, pushing forward, the body's weight) and dipping. Each runs at its initial rate until its window
 * and changes rate constantly through it; what follows depends on the mode (§3.2). The dip lowers the pivot on top.
 */
interface SwingArc {
    readonly pivot: Vec3;              // the top hand at t = 0, world frame
    readonly pivotVelocity: Vec3;      // until the hands' window, in the swing plane (no component along n)
    readonly pivotAcceleration: Vec3;  // during the hands' window, in the swing plane
    readonly handStart: number;        // s from t = 0
    readonly handWindow: number;       // s
    readonly aim: Vec3;                // unit, horizontal: the swing plane's forward direction
    readonly radius: number;           // the top grip from the socket along the shaft, m (the stance's `top`)
    readonly theta0: number;           // arc angle at t = 0, rad, from the lowest point, positive forward
    readonly omega0: number;           // arc rate until the pendulum's window, rad/s
    readonly alpha: number;            // arc acceleration during the pendulum's window, rad/s²
    readonly arcStart: number;         // s from t = 0
    readonly window: number;           // the pendulum's window, s
    readonly dip: Dip;
    readonly contactAt: number;        // s from t = 0: the planned contact, from which the cap and the reach count
    readonly mode: StrokeMode;
    readonly handReach: number;        // m: how far the hands' path travels along aim after contactAt
    readonly groundDepth: number;      // m: carry only, the head's lowest point ends this far below the turf
}

/** The hands' dip: the pivot lowers by `depth` (m) over `duration` (s) from `start` (s from t = 0), rest to rest. */
interface Dip {
    readonly start: number;
    readonly duration: number;
    readonly depth: number;
}

/**
 * The hands' grip: the natural period (s) and damping ratio of a firm grip, and the top hand's tension γ_T in (0, 1]
 * from `relaxAt` (s from t = 0) on; before it both hands are firm (§3.3).
 */
interface Coupling {
    readonly period: number;
    readonly dampingRatio: number;
    readonly tension: number;
    readonly relaxAt: number;
}

/**
 * Two hands on the rigid, massless shaft, which is the head's up axis through the socket: the top hand at the arc
 * radius, the bottom hand `bottom` from the socket (m, in (0, radius)), gripping with g_B = `bottomGrip` in (0, 1] from
 * `relaxAt` on. The player's arm mass `armMass` (kg) rides rigidly at the top grip. The bottom hand opens once the
 * shaft has turned through `reachSlack` (m of hand travel); `bottomMax` (N) caps its rate guide, none when absent.
 */
interface Hands {
    readonly bottom: number;
    readonly bottomGrip: number;
    readonly armMass: number;
    readonly reachSlack: number;
    readonly bottomMax?: number;
}
```

The two arcs are what the body does to the hands' path (shoulders, arms, weight transfer, to first order); the hands
are how they hold the shaft on it. The head is rigid on the shaft, so its pitch is the arc angle: a shaft leaning
forward pitches the face down by as much. Together the arcs and the hands deform the head's actual path away from a
plain circle: a roll carries the pivot forward with the arc angle held, so the face's tilt is held while the head is
pushed; an AC stop checks the pendulum, dips the hands and relaxes the grip, so the head meets the turf and its rear rim
drags.

### 3.2 The path

The pendulum, with t_a = `arcStart` and w = `window`: before its window (t ≤ t_a), θ = θ₀ + ω₀·t; during it, with
τ = t − t_a, θ = θ_a + ω₀·τ + ½·α·τ². After it, with θ_e and ω_e the angle and rate at the window's end:

- **swing:** θ is a free pendulum about the moving top hand under the head's weight,
  I_P·θ̈ = −m·g·ℓ_h·sin θ − M·d·(A·t̂), so the follow-through rises and dies by itself. m is the head's mass and M the
  swung body's (§3.3); ℓ_h = ρ + `radius`, the pivot to the head's centre; d = ℓ_h − δ, the pivot to the swung body's
  centre; I_P = I'_n + M·d², I'_n the swung body's inertia about the pitch axis; A the pivot's acceleration (the hands'
  path with its reach, and the dip); t̂ = cos θ·aim + sin θ·ẑ. `prepareImpact` tabulates θ and ω from (θ_e, ω_e) by
  semi-implicit Euler every `FREE_STEP` = 5 µs over `FREE_SPAN` = 0.25 s; the path interpolates them linearly and
  evaluates θ̈ from the equation at the interpolated θ.
- **carry:** the slope is held. Over one more window the rate falls linearly to zero, with u = min(t − t_a − w, w),
  θ = θ_e + ω_e·u − ½·(ω_e/w)·u², and θ holds after it: no whip.

The hands, with t_h = `handStart` and w_h = `handWindow`, likewise: P = P₀ + V₀·t, then P_h + V₀·τ + ½·A·τ², then
P_e + V_e·(t − t_h − w_h). θ_a, θ_e, ω_e, P_h, P_e and V_e are computed once, in `prepareImpact`, so θ, ω, P and V
are continuous by construction.

**The reach.** The hands' path ends after `handReach` along aim from where it is at `contactAt`: it follows the plan
until it has travelled 0.8·`handReach` along aim (at t₁, with speed v₁ along aim), then decelerates at
v₁²/(0.4·`handReach`) to rest at t_s = t₁ + 0.4·`handReach`/v₁ and stays there. With `handReach` 0 the pivot rests
from `contactAt`; if the planned path does not travel 0.8·`handReach` within 0.5 s of `contactAt`, the reach does not
bind. In **carry**, over [t₁, t_s] the pivot also descends by D, rest to rest as the dip does, D = max(0,
z_s + `groundDepth`), z_s the head's lowest point on the path at t_s without the descent: Riches' follow-through onto
the ground, low along it. Swing mode has no descent.

The dip adds −z_d(t)·ẑ to P: with δ = t − `dip.start`, D = `dip.depth`, d = `dip.duration` and a = 4·D/d², z_d is 0
for δ ≤ 0, ½·a·δ² for δ ≤ d/2, D − ½·a·(d − δ)² for δ ≤ d, and D after. Its velocity and acceleration are added to V
and A likewise. It is continuous in position and velocity: the hands start and end the dip at rest.

With n = aim × ẑ (the pitch axis) and the shaft frame's forward axis along aim at θ = 0 (a positive rotation about n
tilts the forward axis up):

- socket target p = P + r·(sin θ·aim − cos θ·ẑ), velocity v_p = V + r·ω·(cos θ·aim + sin θ·ẑ), acceleration
  a_p = A + r·α·(cos θ·aim + sin θ·ẑ) + r·ω²·(cos θ·ẑ − sin θ·aim), with α the pendulum's current angular
  acceleration (zero where θ runs at a constant rate) and A the hands' current acceleration with the reach and dip;
- orientation target q_path = rot(n, θ) ⊗ q_aim, where q_aim turns the body x axis to aim; angular velocity
  ω_path = ω·n; angular acceleration α_path = α·n;
- the path's rigid motion carries a body point b (body frame, from the socket) to p + q_path(b), with acceleration
  a_p + α_path × d_b + ω_path × (ω_path × d_b), d_b = q_path(b); the head's centre is b = −`socket`, the swung body's
  centre b = δ·ẑ − `socket` (§3.3).

Each step evaluates `sinCos(θ)` and `sinCos(θ/2)`.

### 3.3 The hand load

**The swung body.** The head and the arm mass m_a = `armMass` at the top grip move as one rigid body: mass M = m + m_a,
centre δ = m_a·(ρ + r)/M along the shaft s (the head's up axis) from the head's centre, and principal inertia about it
I' = (I_x + e, I_y + e, I_z), e = m·δ² + m_a·(ρ + r − δ)², the head's I_z about the shaft unchanged. The integrator
steps the swung body's centre and spin under the hands' forces and couple, the contact forces at their points on the
head's geometry, and the head's weight m·g at the head's centre (the arm's weight is the player's and is not applied);
the head's state follows from the swung body's. A `force` drive steps the head alone, as before.

**Gains.** For a grip g: k(g) = g·M·(2π/T)² and c(g) = 2ζ·√(k(g)·M); about the shaft K_s(g) = g·I_z·(2π/T)² and
C_s(g) = 2ζ·√(K_s(g)·I_z). Before `relaxAt` both hands grip with g = 1; from it the top hand with γ_T = `tension` and
the bottom hand with g_B = `bottomGrip`. The grips sit at (ρ + r)·s (top) and (ρ + `bottom`)·s (bottom) from the
head's centre; x_T, v_T, x_B, v_B are their world positions and velocities, and x*_T, v*_T, x*_B, v*_B their targets on
the path.

**Feed-forward.** The wrench that makes the path's rigid motion exact for the swung body: F_ff = M·a_c + m·g·ẑ, a_c
the path's acceleration of the swung body's centre; τ_ff = I'·α_path + ω_path × (I'·ω_path) + r_h × m·g·ẑ about that
centre (body frame for the inertia terms), r_h = −δ·s the head's centre from it. From `relaxAt` on the dip's part,
F_d = M·a_d (a_d the dip's acceleration of the pivot), is set aside; before it F_d = 0, the full wrench including it.
With F_s = F_ff − F_d, F_∥ = (F_s·s)·s, F_⊥ = F_s − F_∥, G = τ_ff × s, a = ρ + r − δ and b = ρ + `bottom` − δ:

- the top hand's share F_∥ + F_T⊥, with F_T⊥ = (G − b·F_⊥)/(a − b);
- the bottom hand's share F_B = (a·F_⊥ − G)/(a − b), with a twist couple τ_ff·s about the shaft.

At their grips these give exactly F_s and τ_ff: F_T⊥ + F_B = F_⊥ and a·F_T⊥ + b·F_B = G.

**Before contact** (t < `relaxAt`) everything is firm, so a head on the path tracks it exactly:

- top hand: F_∥ + F_T⊥ + k(1)·(x*_T − x_T) + c(1)·(v*_T − v_T);
- bottom hand: F_B plus the part of k(1)·(x*_B − x_B) + c(1)·(v*_B − v_B) perpendicular to s, and the couple
  (τ_ff·s + K_s(1)·φ + C_s(1)·(ω_path − ω)·s)·s, φ = θ_err·s the twist part of the rotation error
  θ_err = 2·sign(w)·vec(q_path ⊗ q̄), w the product's scalar part.

**From contact** the hands track the path's velocity only, with dampers and no position springs: they push, but do not
make up lost distance (position springs injected energy in the prototype's first pass). The path's velocity includes
the dip's, and after the reach it is at rest, so both hands bring the mallet to rest.

- **Top hand** (the pivot): γ_T times its feed-forward share, plus F_d in full, plus c(γ_T)·(v*_T − v_T); no couple.
  Its share is F_∥ + F_T⊥ while the bottom hand shares the load (carry, or a check), and the whole F_s otherwise. The
  dip is the player's action, so it is fed forward at full strength whatever γ_T.
- **Bottom hand, swing mode, before release:** a rate guide along e, the unit vector perpendicular to s in the swing
  plane, forward (aim less its component along s, normalised): the force min(F_max, c(g_B)·((ω_path − ω)·n)·(r −
  `bottom`)), floored at 0, so it never pulls and never accelerates the head beyond the arc; F_max = `bottomMax`,
  unbounded when absent. Its couple is C_s(g_B)·((ω_path − ω)·s) about s. **The check:** while the pendulum's window
  runs with α < 0, the bottom hand is two-sided (floored at −F_max) and adds g_B·F_B and the couple g_B·τ_ff·s, so the
  check acts through its lever; a pivot cannot check.
- **Bottom hand, carry mode, before release:** two-sided: g_B·F_B plus the part of c(g_B)·(v*_B − v_B) perpendicular
  to s, and the couple g_B·τ_ff·s + C_s(g_B)·((ω_path − ω)·s) about s.
- **Release by reach.** From `relaxAt` each step measures the shaft's turn since then, Δθ = π(s) − π(s at `relaxAt`),
  π(s) = atan2(−s·aim, s·ẑ) the arc angle of a shaft along s. Once (r − `bottom`)·Δθ > `reachSlack` the bottom hand
  opens for good, whatever the mode: from then on it pushes one-sided along e on its velocity lag,
  max(0, c(g_B)·(v*_B − v_B)·e)·e, with no feed-forward and no couple. The release time and Δθ are recorded
  (`ImpactRun.release`).

The hand load F is the sum of the two hands' forces and F_ff the sum of their feed-forward parts; each acts at its grip,
so the head's torque is the moments of the hand forces at their grips plus the bottom hand's couple. With firm grips a
head started on the path follows it, apart from the integrator's own error (bounded by §8.1). A relaxed top hand
(γ_T < 1) carries only γ_T of its share, the head's weight included, so the head sinks below the path until the turf or
its damper takes the rest; the dip is still the player's in full.

Why the modes differ (user's account and Riches): in a drive the power is the arc's momentum and the lower hand only
guides, never accelerating the head (a stronger, accelerating bottom hand turns the double hit into a triple and a
roll-like ratio, §8.1); in a roll both hands move forward at the same rate with a firm grip, holding the slope, until
reach runs out. In the prototype the release opened only in the drive's follow-through, 110 ms after contact; it is
kept as the user's mechanism.

### 3.4 The coupling

The hands must leave the strike to the head yet carry it through a 30–60 ms roll push. From contact the two hands track
velocity only and the top hand is a pivot on the shaft's line, so they draw little in the strike at any period: on the
single-ball strike, ∫|F − F_ff| dt over the face–ball interval is 0.40 % of the ball's momentum change at T = 0.08 s,
and 2.3 % even at 0.01 s (prototype). The 5 % criterion that was to set T (the one-hand pre-flight search: 0.077 s at
4.98 %; 0.08 s at 4.80 %) therefore no longer selects it. `HAND_COUPLING` keeps T = 0.08 s and ζ = 0.7 (user
decision), provisional; P2b.2b.2 fits them, with the arm mass, reach slack and grips, to the ratios, which T does move
(the half roll's 2.83 at 0.08 s is 2.03 at 0.04 s).

**Criterion.** What keeps the strike the head's is the mass the face presents to the ball. The swung body's effective
mass at the face centre along aim is m_eff = 1/(1/M + (r_f × u)·I'⁻¹·(r_f × u)), r_f the face centre from the swung
body's centre and u aim, both in the body frame at the contact pose. Exit criterion 3 requires it within 10 % of the
head's mass on the drive's canonical setup. The arm mass sits on the shaft's line above the head, so it adds little:
the prototype gives 1.007 kg for the drive (half and pass roll 0.967 kg, full roll 1.022 kg).

### 3.5 End rule

For a `track` drive the impact ends when every condition holds:

- a face–ball contact has closed;
- both windows have closed (t ≥ `arcStart` + `window` and t ≥ `handStart` + `handWindow`), as the force-table rule
  waits for its last sample, and so has the dip (t ≥ `dip.start` + `dip.duration`) if it has depth;
- no face–ball, ball–ball, ball–obstacle or head–turf contact has been closed for `RELEASE_STEPS` steps;
- no ball in turf contact is bouncing (P2b.1's rule);
- the head is not closing on any ball within reach (`headClosing`);
- the front face would not reach any ball within `LOOK_AHEAD` = 30 ms: for a ball ahead of the face (its centre a
  distance d > 0 in front of the face plane along f, and within ρ + R of the head's axis), with
  closing = max(v_head·f, v_path·f) − v_ball·f, it would if closing > 0 and d − R < closing·`LOOK_AHEAD`. v_head is the
  head's velocity and v_path the head's velocity on the path: the hands still drive towards the path's.

A head still catching a ball keeps the impact running, so a re-contact (a double tap, or the drive's follow-through
second hit, about 92 ms after contact in the prototype) is integrated, not flagged. Otherwise the impact ends
`TRACK_IMPACT_CAP` = 0.15 s after `contactAt` with `impact-cap`, and `impact-head-approaching` for any ball the head is
still closing on. `ImpactOptions.cap`, an absolute time, overrides either cap.

A `force` drive keeps P2b.1's rule and `IMPACT_CAP` = 0.06 s unchanged. At 0.21 s (the 60 ms longest lead-in, §5.2,
plus the cap; 42,000 steps) pre-flight confirms the WAKE_MARGIN reach filter's headroom (§9).

### 3.6 Validation

`validateImpact` adds, for a `track` drive: every number finite; `radius` > 0; `aim` unit and horizontal (within
1e-12); `period` > 0; `dampingRatio` ≥ 0; `tension` in (0, 1]; `relaxAt` ≥ 0; `arcStart`, `handStart` and
`contactAt` ≥ 0; `window` and `handWindow` > 0; `dip.start` ≥ 0, `dip.duration` > 0, `dip.depth` ≥ 0; `mode` "swing"
or "carry"; `handReach` ≥ 0; `groundDepth` ≥ 0; `bottom` in (0, `radius`); `bottomGrip` in (0, 1]; `armMass` ≥ 0;
`reachSlack` ≥ 0; `bottomMax` > 0 when present; `pivotVelocity` and `pivotAcceleration` in the swing plane (component
along n within 1e-12 of their size). Each failure is a `RangeError` naming the check. The head's state at t = 0 need
not lie on the path (tests start it off); `buildContact` always starts it on.

### 3.7 Probe

`ImpactSnapshot` gains, for a `track` drive, `hand: { force: Vec3; feedForward: Vec3; top: Vec3; bottom: Vec3 }`
(F, F_ff and each hand's force) and `headTurf: Vec3` (the turf's total force on the head; zero while the pair is open).
`ImpactRun` gains, for a `track` drive, `release?: { t: number; deltaTheta: number }` (§3.3), `headRegions` (§4.5) and
`entryJumps: { count: number; worst: number; keys: readonly string[] }` (§4.5). For a `force` drive they are absent and
`drive` is unchanged. Two impulses are defined on the snapshots, each from the end of the first face–ball interval to
the end of the impact, along aim, and positive when they slow the head:

- the hands' braking impulse, −∫ F·aim dt (the whole hand force, feed-forward included);
- the turf's braking impulse, −∫ headTurf·aim dt.

## 4. Mallet–turf and head–ball contact

### 4.1 The pair

For a `track` drive a `head-turf` pair is added after the existing pairs (pair-list order, so the force-table order
is untouched). `ImpactSetup` gains `headTurf: PairLaw | null`, the pair's law from `prepareImpact` for a `track` drive
and null otherwise; isolated test setups may set it null, as `ImpactBall.turf = null` leaves a ball's turf out. The
head is a solid cylinder of axis a (unit, world), half-length L/2 and radius ρ; its lowest point, for |a_z| < 1, is
c − (L/2)·sign(a_z)·a − ρ·u, with u the unit vector of ẑ − a_z·a; for |a_z| = 1 the face disc is level and the contact
point is its centre. The penetration is δ = −z of that point when positive.

- **Normal force:** the turf's clamped linear spring–dashpot, as the ball–turf pair has it, with
  `SurfaceProps.turfStiffness` and damping solved from `turfRestitution` with the head's mass as the effective mass.
  The surface is sampled once, at the head's lowest point at t = 0, and the law solved once in `prepareImpact`, as
  the other laws are (v1 lawns are uniform).
- **Friction:** Cundall–Strack, as the other pairs, with `HEAD_TURF_FRICTION` (§7).

Both act at the lowest point itself, so they twist the head. The turf values are the ball's, labelled provisional for
the head (an edge or side presses a different footprint); P2b.2b.2 revisits them, including whether a plane turf with
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

### 4.5 Head–ball contact

For a `track` drive each face–ball pair treats the whole head as a solid cylinder, so no part of it passes through a
ball. With a the head's axis (body x, world), c_h its centre and c_b the ball's: x = (c_b − c_h)·a, ρ_b the distance
of c_b from the axis, u the unit radial direction from the axis to c_b, e_x = |x| − L/2 and e_r = ρ_b − ρ.

- e_x > 0 and e_r > 0: a rim (`rim` for x ≥ 0, else `back-rim`), at distance √(e_x² + e_r²), normal
  (e_x·sign(x)·a + e_r·u)/distance;
- otherwise, e_x > e_r: an end disc (`face` for x ≥ 0, else `back`), at distance e_x, normal sign(x)·a;
- otherwise the `barrel`, at distance e_r, normal u.

The penetration is δ = R − distance when positive, the contact point c_b − (R − δ/2)·normal. The distance is the
centre's signed distance from the cylinder, continuous across the regions, so a contact never opens deep by changing
region. The pair keeps its key `face/<ball>`, its timeline and the face pair's law (the face material's restitution,
friction and contact time) on every region. `ImpactRun.headRegions` records the intervals per region, keyed
`face/<ball>#<region>`. A contact on any region but the face raises `impact-off-face` for that ball, once; no new Law
judgement is made in this phase. A `force` drive keeps the existing face-only contact, so force tables stay
bit-identical.

**Re-entry guard.** A head–ball or head–turf contact that opens deeper than one step's closing could make, δ >
|v_rel·normal|·dt + 1e-6 m (v_rel the relative velocity at the contact point), is counted in `ImpactRun.entryJumps`
with the worst excess and the pair's key, region and time. It is the catapult's signature; exit criterion 4 asserts
none.

## 5. The swing model

### 5.1 Types

```ts
type StrokeType = "single-ball" | "drive" | "stop-ac" | "stop-gc" | "half-roll" | "full-roll" | "pass-roll";
/** The croquet strokes; the rest are single-ball. */
const CROQUET_STROKES: readonly StrokeType[] = ["drive", "stop-ac", "stop-gc", "half-roll", "full-roll", "pass-roll"];

/**
 * How the player stands to a stroke type and holds the mallet: the shaft's lean at contact (rad, positive pitches the
 * face down; the contact angle is −lean), the top and bottom hands' distances from the socket along the shaft (m,
 * 0 < bottom < top), the top hand's grip tension γ_T and the bottom hand's grip g_B from contact on (in (0, 1]).
 */
interface SwingStance {
    readonly lean: number;
    readonly top: number;
    readonly bottom: number;
    readonly gripTension: number;
    readonly bottomGrip: number;
}

/**
 * The swing's shape (§5.2 step 7), its changes measured against the head's speed at contact. The mode (§3.3). The
 * pendulum: over `window` (s) at full `drive` its contribution changes by `speedGain` times that speed. The hands:
 * `handShare` of that speed (in [0, 1]; the pendulum supplies the rest), changing by `handGain` times it over
 * `handWindow` (s) at full `drive`. The dip: whatever `drive`, the hands lower by `handDrop` (m) over `dropTime` (s),
 * rest to rest. The reach: the hands' path travels `handReach` (m) along aim after contact, the default for the shot's
 * own. In carry mode the head's lowest point ends `groundDepth` (m) below the turf.
 */
interface SwingDrive {
    readonly mode: StrokeMode;
    readonly speedGain: number;
    readonly window: number;
    readonly handShare: number;
    readonly handGain: number;
    readonly handWindow: number;
    readonly handDrop: number;
    readonly dropTime: number;
    readonly handReach: number;
    readonly groundDepth: number;
}

interface SwingProfile {
    readonly mallet: {
        readonly headMass: number; readonly headLength: number; readonly headDiameter: number;
        readonly shaftLength: number;
    };
    /** The player's body: the arm mass at the top grip (kg), the reach slack (m), the rate guide's cap (N). */
    readonly body: { readonly armMass: number; readonly reachSlack: number; readonly bottomMax?: number };
    readonly stance: Readonly<Record<StrokeType, SwingStance>>;
    readonly drive: Readonly<Record<StrokeType, SwingDrive>>;
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
        /** When each action begins, s from contact: negative early, positive late, 0 on time. */
        readonly timing: { readonly arc: number; readonly hands: number; readonly dip: number };
        /** The hands' travel along aim after contact, m; absent: the preset's `handReach`. */
        readonly handReach?: number;
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

The product spec's grip style (it would only pre-fill the stance's hand positions, §4), weighting and face material
are profile inputs with no engine reader yet: the planner and P3's stored profile carry grip style; the end-weighted
head and other faces arrive with their sourced values (§10). The engine's head is centre-weighted with a wooden face.

### 5.2 Derivation

1. **Arc radius.** r = `top`: the shaft is rigid, so the pivot is the top hand, `top` from the socket along it.
2. **Contact angle.** θ_c = −`lean`: positive is a rising strike, negative a descending one.
3. **Face angle.** The head is rigid on the shaft, so its pitch about n at contact is θ_c: a positive lean pitches the
   face down, and a rising strike tilts it up by as much. The face is the head's leading end disc; its outward normal
   f is the body +x axis.
4. **Head placement.** The point on the face at (`up`, `side`) from its centre (`up` along the face's upward in-plane
   axis, `side` along n's horizontal complement, positive to the left of aim) lies on the line through the ball's
   sunk centre (z = R − static sink, where `validateImpact` checks the head against it) along −f, at distance
   R + `START_GAP` from it; `START_GAP` = 1e-6 m, so rounding never starts the face in the ball. The head's centre is
   L/2 behind the face centre along −f; the socket is the centre of the head's upper surface.
5. **Pivot.** pivot = socket − r·(sin θ_c·aim − cos θ_c·ẑ), the top hand. Its height follows from where the ball is,
   as a player bends to meet it; whether the head reaches the turf then follows from the stance, the grip and the
   contact.
6. **Speed.** The hands move at V₀ = `handShare`·`speed`·aim. ω₀ is the larger root of
   |V₀ + ω₀·n × (c − pivot)| = `speed`, c the head's centre, so the centre of mass moves at `speed`; since
   |V₀| ≤ `speed` the root is never negative. The head's velocity and angular velocity at contact are the path's:
   V₀ + ω₀·n × (c − pivot) and ω₀·n.
7. **Drive.** Both arcs' changes are measured against the head's speed at contact, so a slow arc can still act
   sharply (user's account: in a pass roll the slow pendulum accelerates swiftly during the push, flicking the
   striker's ball with extra momentum and topspin). The pendulum: α = `drive`·`speedGain`·(`speed`/ℓ)/`window`, ℓ the
   pivot's distance from the head's centre, so its contribution to the head's speed changes by `speedGain`·`speed`;
   where the pendulum carries the whole speed (a drive, the stops), a check with `speedGain` 1 at `drive` −1 brings it
   to rest at its window's end, at any strength. The hands:
   A = `drive`·`handGain`·`speed`·aim/`handWindow`.
   The dip: depth `handDrop` over `dropTime`, whatever `drive`. The mode, `groundDepth` and `handReach` (the shot's,
   else the preset's) are copied to the arc. The coupling is `HAND_COUPLING`, with `tension` = the stance's
   `gripTension`; the hands are the stance's `bottom` and `bottomGrip` with the profile's `body`.
8. **Timing and lead-in.** Each action begins at `stroke.timing` from contact: the pendulum's window at
   contact + `timing.arc`, the hands' at contact + `timing.hands`, the dip at contact + `timing.dip`. The impact
   starts a lead L before contact, the earliest action's: L = max(0, −`timing.arc`, −`timing.hands`, −`timing.dip`),
   at most `MAX_LEAD` = 60 ms. The arc is then expressed from that start: θ₀ = θ_c − ω₀·L, pivot P₀ = P_c − V₀·L,
   `arcStart` = L + `timing.arc`, `handStart` = L + `timing.hands`, `dip.start` = L + `timing.dip`, `contactAt` = L,
   and the coupling's `relaxAt` = L (the grip is firm until contact). Before any action begins everything coasts, so
   the head at t = 0 lies on the coasting path. An on-time stroke has L = 0 and starts at contact. With actions
   mistimed, the head need not meet the ball where it was placed: a flattened strike, a weaker one, or the lawn before
   the ball emerge.
9. **Approach.** `swingApproach(contact)` samples the head's coasting path (every action removed) every 0.5 ms over
   the `MAX_LEAD` before contact and returns its lowest clearance above the turf (m; negative where the head would
   have dug in) and when (s before contact). `simulateShot` reports it as `ShotOutcome.approach`.
10. **Mallet.** Mass, length and diameter; inertia from `solidCylinderInertia`; the face material is `mallet.json`'s
   wood.

### 5.3 Rejections

`buildContact` throws a `RangeError` naming the check for: `top` ≤ 0; `top` > `shaftLength` (the top hand is off the
shaft); `bottom` outside (0, `top`); |`lean`| ≥ 90°; `speed` ≤ 0; |`drive`| > 1; √(`up`² + `side`²) ≥ the head's
radius (contact off the face); a stroke type missing from `stance` or `drive`; a `mode` other than "swing" or
"carry"; `window`, `handWindow` or `dropTime` ≤ 0; `speedGain` < 0; `gripTension` or `bottomGrip` outside (0, 1];
`handShare` outside [0, 1]; `handDrop` < 0; the shot's or the preset's `handReach` < 0; `groundDepth` < 0; `armMass` <
0; `reachSlack` < 0; `bottomMax` ≤ 0 when present; a lead beyond `MAX_LEAD` (an action timed more than 60 ms early);
the head's lowest point below the turf at contact, as placed, or at t = 0 (where an early action begins: the stance too
low for that timing); a non-finite number. A swing that meets the turf between its start and the ball is never
rejected. `simulateImpact`'s own validation then runs as today.

### 5.4 The default profile

`defaultProfile` ("typical club player") ships with these values, every one marked provisional in its source comment.
The mallet is `mallet.json`'s and the body's constants are `contact.json`'s (§7). The hand positions and leans follow
Riches on the 0.9144 m shaft, measured from the socket; the grips, gains and reaches are the prototype's calibration
(`proto-two-hands` aeadd4c), measured against the coaching ratios only as observations (§9). The planner's default
`drive` per preset is listed with them.

| Mallet and body | Value |
|---|---|
| Mallet | 1.0 kg, 0.2286 m, 0.0762 m, shaft 0.9144 m (36 in) |
| `armMass` | 0.8 kg |
| `reachSlack` | 0.03 m |
| `bottomMax` | absent (no cap) |

| Preset | lean (°) | top (m) | bottom (m) | gripTension | bottomGrip |
|---|---|---|---|---|---|
| single-ball | 0 | 0.805 | 0.70 | 1 | 0.1 |
| drive | 0 | 0.805 | 0.60 | 1 | 0.25 |
| stop-ac | −4 | 0.805 | 0.45 | 0.1 | 0.1 |
| stop-gc | 0 | 0.805 | 0.45 | 1 | 1 |
| half-roll | 15 | 0.805 | 0.42 | 1 | 1 |
| full-roll | 45 | 0.61 | 0.30 | 1 | 1 |
| pass-roll | 48 | 0.45 | 0.09 | 1 | 1 |

| Preset | mode | speedGain | window (ms) | handShare | handGain | handWindow (ms) | handDrop (mm) | dropTime (ms) | handReach (m) | groundDepth (mm) | default drive |
|---|---|---|---|---|---|---|---|---|---|---|---|
| single-ball | swing | 0.2 | 10 | 0 | 0 | 10 | 0 | 10 | 0 | 0 | 0 |
| drive | swing | 0.2 | 5 | 0 | 0 | 5 | 0 | 10 | 0 | 0 | 0 |
| stop-ac | swing | 1 | 10 | 0 | 0 | 10 | 14 | 20 | 0.02 | 0 | −1 |
| stop-gc | swing | 1 | 10 | 0 | 0 | 10 | 0 | 10 | 0 | 0 | −1 |
| half-roll | carry | 0.1 | 20 | 0.6 | 0 | 20 | 0 | 10 | 0.15 | 5 | +1 |
| full-roll | carry | 0.1 | 30 | 0.9 | 0.1 | 30 | 0 | 10 | 0.30 | 2 | +1 |
| pass-roll | carry | 0.5 | 15 | 0.85 | 0.1 | 15 | 0 | 10 | 0.30 | 2 | +1 |

**Hands.** The swing presets keep the top hand at the top of the handle (0.805 m from the socket, from the sourced
35 in grip). Riches places the half roll's bottom hand "almost half-way down the handle for this shot, leaving the
other hand at the top", the handle "making an angle of about 75 degrees with the ground" (lean 15°, bottom 0.42 m). For
the full roll "Your lower hand should be placed at least two-thirds of the way down the handle, and your top hand will
also need to be moved, to about one-third of the way down the handle", giving "an angle of approximately 45 degrees"
(lean 45°, top 0.61 m, bottom 0.30 m). For the pass roll "The bottom hand should be placed at the very bottom of the
mallet shaft for this shot", the slope at least the full roll's (lean 48°, top 0.45 m, bottom 0.09 m).

**Drive and single-ball.** The top hand stays essentially fixed (`handShare` 0) and all the action is the pendulum's,
which after its short window swings freely: the follow-through rises and dies by itself, and the head, slowed below
the striker's ball by the strike, catches it again (about 92 ms after contact in the prototype, ratio 3.33). The
bottom hand only guides, lightly (`bottomGrip` 0.25 at 0.60 m for the drive, 0.1 at 0.70 m single-ball); a stronger
or lower hand turns the double hit into a triple and the ratio towards a roll's (§8.1).

**AC stop.** The feet are set further back, so the ball is met on the up. The shaft leans back 4°, so the strike rises
4° and, the head being rigid on the shaft, the face tilts up 4°, lowering the head's rear rim; the ball is met 20 mm
below the face centre (§5.5). Rise and tilt are one angle on a rigid shaft: a 5° lean leaves the head only 4.03 mm
clear at contact (prototype), so 4° is just under the feasibility spike's 5–15° rise and within its 3–5° tilt. The
hands relax on contact (both grips 0.1) and the pendulum is checked (the bottom hand checking through its lever, §3.3).
The dip, 14 mm over 20 ms timed with the strike and fed forward in full, takes the head from 8.78 mm clear at contact
onto the turf, whose friction on its underside arrests it (user account, 2026-10-05: the player lets the mallet drop
onto the lawn, some pushing it down to hasten the stop). The stance keeps the coasting path at least 7.23 mm clear over
the 60 ms before contact: a dip or a check mistimed early is what drives the head into the lawn first.

**GC stop.** The lower hand grips lower and firmly (0.45 m, `bottomGrip` 1) and actively stops the swing just after
contact through its lever (a check); it is not deliberately played on the up, but is a hard, level shot with no
follow-through, so the striker's ball reaches the croqueted ball without spin, like a stun in snooker.

**Rolls.** Carry mode: the slope is held while both hands carry the head forward at the same rate with a firm grip
(Riches), the body's weight moving from back to front (`handShare` 0.6, 0.9 and 0.85), until reach runs out
(`handReach` 0.15 m for the half roll, 0.30 m for the full and pass rolls) and the head finishes low on the ground
(`groundDepth` 5 mm for the half roll, 2 mm for the full and pass rolls). **Pass roll:** the balls are offset (a split
shot: the planner's `aim` off the line of centres) and the bottom hand punches in contact, imparting additional force
to the striker's ball: the pendulum's `speedGain` 0.5 over 15 ms from contact and `handGain` 0.1, on top of the body's
push. The punch reaches the head at once through the carry's feed-forward (§3.3), so the coupling's period does not
blunt it. A pass roll's reach of 0.2 m traps the striker's ball against the face (prototype); 0.30 m does not.

**Geometry.** At a lean of 45° or more the head's lowest point at contact is about 51 mm above the turf unless the ball
is met above the face's radius: that is geometry, not a tunable.

**Open for P2b.2b.2.** The AC stop is a rising strike, so stop-shot lift can be expected of it, as the feasibility
spike found for rising strikes. The GC stop is level, and the spike found level strikes never lift the striker's ball,
so its ratio must come from the check alone; the roadmap's stop-shot-lift criterion applies to the AC stop. Which stop
is the calibration target is P2b.2b.2's decision.

### 5.5 Canonical setups

Exit criteria 3 and 4 and pre-flight run each preset at one canonical setup: the striker at (9.6012, 4), a lane clear
of the hoops and of the peg, which stands at the court's centre; aim +y, `speed` 3 m/s, the preset's default `drive`,
every timing 0, `side` 0, the preset's `handReach`; for a croquet stroke the croqueted ball touching the striker ahead
along aim, except the pass roll, whose line of centres is 20° off aim; `live` empty for a croquet stroke and every
other ball for a single-ball one; no other balls; `continuation`, `hampered` and `jumpAttempt` false. `up` is 0 except
for stop-ac, whose `up` is −0.020 m (the ball met 20 mm below the face centre).

Every canonical setup starts at contact (no lead), its head clear of the turf at contact and its approach clearance
positive over the 60 ms before. The prototype gives, at contact and at the approach's lowest: 7.90 mm and 0.52 mm
36.5 ms out for the single-ball, drive and GC stop (the head's front rim as it pitches back); 8.78 mm and 7.23 mm 56 ms
out for the AC stop; 21.1, 51.6 and 54.7 mm for the half, full and pass rolls, lowest at contact. A canonical setup
whose path meets the turf before contact is a defect in the table, not in the model.

## 6. `simulateShot` and the fault judge

### 6.1 The call

```ts
function simulateShot(setup: ShotSetup, world?: World): ShotOutcome;  // world defaults to defaultWorld(setup.lawnSpeed)

interface ShotOutcome {
    readonly contact: ContactState;
    /** The coasting path's lowest clearance over the turf (m) in the 60 ms before contact, and when (s before). */
    readonly approach: { readonly clearance: number; readonly before: number };
    readonly context: StrokeContext;
    readonly impact: ImpactResult;
    readonly faults: FaultReport;
    readonly motion: ShotResult;
}
```

It runs `buildContact`, `swingApproach`, `simulateImpact`, `strokeContext`, `judgeFaults` and
`simulateFreeMotion(impact.handover, world)` in that order. Phase 2 always runs: impact flags and findings are
information, as phase 2's jump flag is. Invalid input throws the named `RangeError` of whichever stage catches it.

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

`src/engine/index.ts` adds `simulateShot`, `simulateImpact`, `judgeFaults`, `defaultProfile`, `ON_TIME`,
`CROQUET_STROKES` and the types `ShotSetup`, `StrokeTiming`, `SwingProfile`, `SwingStance`, `SwingDrive`, `StrokeType`,
`StrokeMode`, `ShotOutcome`, `SwingApproach`, `ContactState`, `Drive`, `SwingArc`, `Coupling`, `Hands`, `ImpactResult`,
`ImpactEvent`, `StrokeContext`, `FaultReport`, `Finding`.

## 7. Reference data

The new constants are module constants read from the reference files, as `world.ts` reads its references; `World`
and `validateWorld` are unchanged. A `ContactState` carries its own coupling and hands, so tests and the sweep vary
them there.

| File · key | Constant | Value | Provenance |
|---|---|---|---|
| `contact.json` · `handCouplingPeriod`, `handCouplingDampingRatio` | `HAND_COUPLING` | 0.08 s, 0.7 | provisional, user decision (§3.4; the one-hand search's 0.077 s at the retired 5 % criterion in the note); P2b.2b.2 fits |
| `contact.json` · `armMass` | (default profile `body.armMass`) | 0.8 kg | provisional (prototype calibration; effective arm and hand mass at the top grip, no measurement found); P2b.2b.2 fits |
| `contact.json` · `reachSlack` | (default profile `body.reachSlack`) | 0.03 m | provisional (prototype; the user's release-by-reach mechanism); P2b.2b.2 fits |
| `contact.json` · `headTurfFriction` | `HEAD_TURF_FRICTION` | 0.5, bounds 0.3–0.7 | estimate (wood on grass; no measurement found); P2b.2b.2 sources |
| `contact.json` · `headDeepLimit` | `HEAD_DEEP_LIMIT` | 2 mm | provisional model limit |
| `mallet.json` · `shaftLength` | (default profile) | 0.9144 m (36 in) | sourced |
| `laws.json` · 29.1.14, C29.18 (full), 29.1.14's commentary | — | verbatim | WCF AC Laws 7th edition with ORLAC |

The stance's hand positions and leans are profile values sourced to Riches in `profile.ts`'s comments, not reference
keys; `topHandHeight` is not added.

## 8. Testing

### 8.1 Analytic and hand-checked cases

- **Path.** θ, ω, P and V before, during and after each window match the closed forms, continuous at the windows'
  ends; the dip lowers the pivot by its depth, rest to rest, and holds it. A pivot accelerating forward with α = 0
  and ω = 0 moves the socket target in a straight line with the orientation target constant (the roll's held face
  tilt). A check with `speedGain` 1 brings ω to 0 at the window's end. In swing mode the free pendulum from rest at
  θ = 0 with a still pivot stays there, and from a small angle it swings with the period 2π·√(I_P/(m·g·ℓ_h)); in carry
  mode θ is constant after the second window. The reach stops the pivot `handReach` along aim from where it was at
  `contactAt`, rest at t_s, and in carry mode the head's lowest point on the path at t_s is `groundDepth` below the
  turf.
- **Swung body.** δ and I' match the parallel-axis closed forms; with `armMass` 0 the swung body is the head.
- **Tracking, no ball.** A head started on the path with firm grips follows it over 0.15 s within a bound pre-flight
  measures and the plan fixes (the feed-forward is exact, so the residual is the integrator's), in both modes. Before
  contact, a head displaced 1 mm along the shaft returns as the damped oscillator of period T and ratio ζ predicts
  (within 1 % of amplitude): along the shaft only the top hand's spring acts, on the mass M.
- **Relaxed top hand.** With γ_T < 1, a level, still path, no ball and `headTurf` null, the head sinks below the path
  at the terminal rate (1 − γ_T)·m·g/c(γ_T) along the vertical shaft; with the head–turf pair it comes to rest on the
  turf.
- **Feed-forward split.** On a path with firm grips the two hands' shares and the bottom hand's couple sum to F_ff and
  τ_ff; from contact the top hand's feed-forward is γ_T times its share plus M·a_d, at γ_T 0.1 and 1 alike (the dip at
  full strength).
- **Rate guide.** In swing mode after contact the bottom hand's force along e is never negative outside a check, never
  exceeds `bottomMax`, and is zero while the shaft turns at least as fast as the path; inside a check window it acts
  both ways and carries g_B·F_B.
- **Release by reach** (synthetic). A shaft turned through (`reachSlack` + 1 mm)/(r − `bottom`) after contact records
  the release time and Δθ; after it the bottom hand's force has no component against e, no feed-forward and no
  couple. Under the slack it does not open.
- **Carry holds the slope.** A carry-mode roll with no ball keeps the head's pitch within the tracking bound of the
  path's held θ from the end of the second window to the reach's end.
- **Head–ball cylinder.** A ball placed against each region (face, rim, barrel, back rim, back) reports that region,
  its normal and its depth; the distance is continuous across every region boundary. A `force` drive's face pair is
  unchanged.
- **Re-entry guard.** A ball placed inside the head between steps counts one entry jump with its key and region; a
  ball the head closes on at speed counts none.
- **Free in the strike.** Exit criterion 3 against the closed form.
- **Re-contact.** A croquet split whose striker's ball leaves slower than the head is struck again within the impact,
  with no `impact-head-approaching`; a clean centre single-ball strike ends within `RELEASE_STEPS` of the later of the
  window's end and the face no longer reaching the ball within `LOOK_AHEAD`.
- **Head–turf.** A head lowered onto the turf at rest settles at m·g/k; a head sliding level along the turf at
  constant normal load decelerates at μ·g within 1 %; `headTurfSlide` matches the closed form; `impact-head-deep`
  fires just over 2 mm and not just under.
- **Swing model.** Each derivation step separately: r = `top`; θ_c = −`lean`; the face's pitch θ_c (face down for a
  positive lean) for leans of −10°, 0°, +10°; face 1 µm short of the sunk ball at the requested (`up`, `side`);
  centre-of-mass speed equal to `speed`, with and without a hand share; the windows' α and A; the dip; the mode,
  `groundDepth` and `handReach` (the shot's over the preset's); the hands and body copied; each timing and the lead-in
  (an early action starts the impact before contact, the head on its coasting path there, and at the contact pose by
  the lead's end if the actions are depthless; on time, it starts at contact); the approach clearance against a
  hand-computed case. Every rejection names its check, including an action more than 60 ms early and a head in the
  turf where an early action begins. Setups mirrored across a vertical plane give mirrored `ContactState`s.
- **`simulateShot`.** Each `kind`; `group` for 3- and 4-ball groups and the croquet pair alone; 29.1.13 at 89.9° and
  90.1° (aim vectors built directly, not through `sinCos`), with both clauses firing together in their order; 29.1.14
  only under 29.2.3; phase 2 receives exactly `impact.handover`; every setup check names its failure; every canonical
  setup (§5.5) runs.
- **Mechanisms** (impulses per §3.7; ratios are not asserted, only compared):
  - **The drive's follow-through.** The canonical drive has a second face–ball interval after the first, within the
    impact.
  - **An accelerating bottom hand.** The drive with its bottom hand at 0.30 m and `bottomGrip` 1 has at least three
    face–ball intervals and a lower croqueted-to-striker distance ratio than the canonical drive.
  - **Stops distinct from the drive.** The canonical AC and GC stops each have one face–ball interval and leave the
    striker's ball slower than the canonical drive does.
  - **The GC check.** On the canonical GC stop the hands' braking impulse is positive at `drive` −1 and negative at
    `drive` 0: the check acts through the bottom hand's lever.
  - **The AC stop.** On the canonical AC stop, with its relaxed hands, the head–turf pair opens after the face–ball
    pair has closed and the turf's braking impulse is positive.
  - **Pass-roll punch.** In the canonical pass roll, `drive` +1 leaves the striker's ball faster at the end of the
    impact than `drive` 0.
  - **Mistimed dip.** The canonical AC stop with its dip 30 ms early meets the lawn before the ball (the head–turf pair
    opens before the face–ball pair) and sends the striker's ball off slower than on time.

### 8.2 Bit-identity

Exit criterion 2. The `force` migration is mechanical and reviewed by the digest diff.

## 9. Pre-flight measurements (recorded in the roadmap)

- Exit criterion 3's effective mass for every preset's canonical setup.
- The coaching ratios (croqueted ball's distance over the striker's) on the canonical setups and over 2–4 m/s,
  recorded against the coaching ranges: drive 3–4, stops 6–10, half roll about 2, full roll about 1, pass roll below
  1. The prototype (pass 4, T 0.08 s) gave drive 3.33, AC stop 6.55, GC stop 6.60, half roll 2.83 (2.75–2.88 over
  2–4 m/s), full roll 2.14 (a known miss, deferred, §10) and pass roll 1.59 at 3 m/s, 1.26 at 2 m/s. The pass roll's
  0.33 at 3 m/s and 0.81 at 2 m/s came from pass 5's firm off-aim grip, which was not adopted.
- Per canonical setup: `entryJumps`, the highest ball centre, the head regions touched, the bottom hand's release
  time, the hands' and turf's braking impulses, the longest tracked impact after `contactAt` (confirming or revising
  `TRACK_IMPACT_CAP`), and how often `impact-head-deep`, `impact-cap`, `impact-head-approaching` and
  `impact-off-face` fire (the prototype's canonical AC stop reaches 2.86 mm and raises `impact-head-deep`).
- The ratios' sensitivity to T (10–200 ms), ζ (0.2–1), `armMass`, `reachSlack` and each preset's grips, as
  observations for P2b.2b.2.
- The tracking bound of §8.1 at the chosen coupling, in both modes.
- Tracked impact steps and µs/step against force drives on the P2b.2a scenarios (for P5), and the WAKE_MARGIN reach
  filter's headroom at 0.21 s.
- Timing: for the AC stop and a roll, each action timed from 50 ms early to 20 ms late, and the dip's depth from 0 to
  twice its default: whether the head meets the lawn before the ball, the head–turf penetration and slide, and the
  striker's ball's speed and launch angle (for P2b.2b.2, and for the user's review of the timing model).

## 10. Deferred

**To P2b.2b.2 (calibration):** sourced swing defaults per preset; the face–ball and ball–ball contact-time fit; the
hand coupling's T and ζ, `armMass`, `reachSlack` and the grips, fitted to the ratios; the stop-shot and drive ratio
calibration and held-out validation (rolls, pass roll, stop → pass-roll ordering, pull, stop-shot lift); the full
roll's calibration (its ratio, about 2.1 against about 1, is a known miss); which stop preset is the calibration
target (§5.4); the low-speed face–ball law (restitution falling towards inelastic at low closing speed: a roll is a
30–60 ms carry, not a collision, and the modelled striker's ball chatters on the face 4–16 times); the turf's response
under load (the non-linear yield and rebound of the lawn under a pressing face, so that the ball rolls out forward with
topspin); the crush-calibration decision (roadmap, "Open decision: crush calibration"); 29.1.6.3 with a sourced
contact-time norm; head–turf stiffness and friction sourcing, and whether turf drag needs a ploughing term; the
end-weighted head with a sourced inertia factor; face presets beyond wood.

**Beyond P2b, required in the final implementation** (roadmap P2 row): 29.1.10, with mallet–obstacle contact;
divots and lasting turf damage; a fully articulated body (shoulder, elbow and wrist) beyond this phase's translating
pivot and arm mass, with the bottom hand's position as the input from which the shaft's lean and the push–swing balance
follow (each preset sets them directly until then). Three- and four-ball cannons remain deferred as before. Casting
versus planted swings, and how much of the set-up a weaker shot uses, belong to the human-interaction design (P4: how
the player sets up and rehearses a shot), not here.

## 11. Roadmap changes (in this PR)

- P2 row: P2b.2b split into P2b.2b.1 (this spec) and P2b.2b.2, with their exit criteria; the items of §10 added
  to "deferred beyond P2b but required".
- "P2b.2 decisions": the two hands on a rigid shaft and the swing and carry modes, from the user's account of play
  (2026-10-05) and Riches; the coupling held at T 0.08 s and ζ 0.7 with exit criterion 3's effective-mass test in
  place of the 5 % criterion; the presets as §5.4 gives them.
- "P2b.2b.1 pre-flight outcomes (2026-10-05)": the roll catapult and the relaxed AC check, the prototype passes and
  which were adopted, and the prototype's ratios (§9).
- P2b.2b.2 row: the low-speed face–ball law, the turf under load and the full roll's calibration; T, `armMass`,
  `reachSlack` and the grips fitted to the ratios.
- P3 row: `SwingProfile` is the physical profile P3 wraps (with grip style, weighting and face). Which of the drive
  entry's fields P3 fits is P3's decision; the stance (hands, grips and lean) and the body are entered (product spec
  §7).
- P4 row: the planner asks for the shot in the player's order (shot type, balls, stance, hands, contact, then the
  rehearsed swing, its reach and its timing); casting versus planted ways of setting up and rehearsing a shot, and how
  much of the set-up a weaker shot uses, are decided there.
- The P2 row's deferred list: the articulated body takes the bottom hand's position as its input.
