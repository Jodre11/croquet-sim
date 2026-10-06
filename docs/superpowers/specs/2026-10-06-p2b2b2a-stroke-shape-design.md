# P2b.2b.2a — The Whole Stroke: Backswing, Downswing and Follow-Through: Design

**Product spec:** `2026-09-30-croquet-shot-lab-design.md` §3 (`ShotSetup`), §4 (swing model), §7 (profiles).
**Swing spec:** `2026-10-04-p2b2b1-swing-shot-design.md` (§3.2 the path, §5 the swing model, §6 `simulateShot`).
**Roadmap:** P2 row; "P2b.2 decisions (2026-10-04)"; "P2b.2b.1 outcomes carried forward".

**Why this split** (user decision, 2026-10-06). P2b.2b.2 is split in three, each with its own spec, plan and PR:

- **P2b.2b.2a** (this document): the stroke shape. The backswing from its top, the downswing, the lead-in and the
  follow-through, with the amplitude as the player's input and the contact speed emerging; one trajectory of the
  head's and the hands' poses from top to finish, for P2b.2b.3 to sweep.
- **P2b.2b.2b:** the contact laws. The low-speed face–ball law (a roll as a carry, not a chattering collision); the
  turf's response under load; head–turf stiffness and friction sourcing, and whether turf drag needs a ploughing
  term; the end-weighted head; face presets beyond wood.
- **P2b.2b.2c:** calibration and validation. Coaching-ratio reference data and the swing defaults; the contact-time
  fit; the hand coupling's T and ζ, `armMass`, `reachSlack` and the grips fitted to the stop and drive ratios; the
  rolls, the stop → pass-roll ordering, pull and stop-shot lift as held-out validation; the GC stop's distances;
  crush calibration; 29.1.6.3.

The order follows the user's "first we must model the stroke shape and amplitude": fitting anything before the shape
and the laws land would be undone by them, since both change what is fitted.

## 1. Goal and exit criteria

A player controls a stroke by how far the mallet is taken back and how hard and how quickly it is swung through, not
by a speed. This phase models the whole stroke: the head at rest at the top of the backswing, the downswing under
gravity and the player's effort to the contact pose, the existing impact, and the follow-through from the head's real
state after the impact to the stroke's finish. The head's speed at contact becomes an outcome.

Exit criteria:

1. The analytic cases of §7.1 hold. With intensity 0 and the hands still, the downswing's speed at contact matches
   the energy integral of the §3.1 equation within 0.1 %, and the release-time solve converges.
2. Where §6 sources kinematic pairs (backswing against contact speed, or downswing time), each stroke type's fitted
   effort reproduces them within their quoted spread.
3. `simulateShot` with `trajectory: true` runs every preset's canonical setup (§5.3) from top to finish with no
   `RangeError`, no re-entry guard hit (`entryJumps.count` 0), no ball centre more than 5 mm above R and no
   `follow-cap`. Its `SwingTrajectory` is continuous at every segment boundary: position within 1e-6 m and velocity
   within 1e-4 m/s.
4. Force-table drives are bit-identical to P2b.2b.1: `scripts/impactDigest.ts` byte-identical to `main`'s; the
   shot-mix work units (p99 143,084, p99.9 362,050, max 408,030), `SLOW_TESTS=1`, the obstacle fuzz and the reach
   filter reproduce exactly.
5. Each preset's default backswing and intensity give its canonical contact speed within ±2 % of 3 m/s (P2b.2b.1's
   canonical speed, so its figures stay comparable), or the nearest speed inside the sourced bounds, recorded. The
   ratios and the other §8 measurements are recorded in the roadmap against P2b.2b.1's, as observations; P2b.2b.2c
   calibrates them.
6. `ENGINE_VERSION` is "0.7.0"; the new types are exported from `src/engine/index.ts`.

## 2. Architecture

```
src/engine/swing/types.ts         SwingShape; ShotSetup.stroke.backswing and .intensity replace .speed
src/engine/swing/downswing.ts     new: the downswing (§3): release solve, pendulum table, hands' path
src/engine/swing/buildContact.ts  the contact state from the downswing; MAX_LEAD 0.15
src/engine/impact/track.ts        the path before the drive windows is the downswing's, not the coasting line
src/engine/swing/followThrough.ts new: the follow-through (§4) and its finish rules
src/engine/swing/trajectory.ts    new: SwingTrajectory (§4.3)
src/engine/shot.ts                simulateShot options { trajectory }; ShotOutcome.contactSpeed, .trajectory
reference/swing.json              new: sourced and derived stroke-shape figures (§6)
scripts/fitStrokeShape.ts         new: the §6.2 fit
scripts/strokeProbe.ts            new: the §8 measurements, raw output kept
```

Everything under `src/engine/**` stays under the determinism lint (`+ − × ÷ √`, the engine's `sinCos` and `atan2`).

```
ShotSetup ─downswing─▶ Downswing ─buildContact─▶ ContactState ─simulateImpact─▶ ImpactResult
                                                                                   │ end state
                                         (trajectory: true) followThrough ◀────────┤
                                                       │                           ▼
                        SwingTrajectory ◀──────────────┘          judgeFaults, simulateFreeMotion
```

Three segments: the downswing is integrated without contacts; the impact is P2b.2b.1's integrator, unchanged in its
physics; the follow-through continues the tracked two-hand model from the impact's end state with the balls removed.

## 3. The downswing

### 3.1 The pendulum

P2b.2b.1's free pendulum (swing spec §3.2) gains the player's effort τ_p:

I_P·θ̈ = −m·g·ℓ_h·sin θ − M·d·(A·t̂) + τ_p(t)

with the symbols of swing spec §3.2 (θ the pendulum's pitch about n, 0 with the shaft vertical, positive forward; A
the hands' acceleration). The pendulum is at rest at θ_top until its release t_r < 0 (time measured from contact).
With intensity i ∈ [0, 1]:

- τ_p(t) = i·τ_max·b((t − t_r)/T(i)), b(u) = ½·(1 − cos 2πu) for u in [0, 1] and 0 outside: a bell-shaped pulse;
- T(i) = T_slow + i·(T_fast − T_slow), T_fast ≤ T_slow: more effort comes with a quicker tempo. Effort and tempo are
  one control (user decision, 2026-10-06), bounded per stroke type by τ_max, T_slow and T_fast;
- the pulse is clipped at contact; after contact P2b.2b.1's drive windows govern.

At i = 0 the swing is gravity alone, the player letting the mallet fall. τ_max, T_slow and T_fast are fitted to
sourced kinematic data only (§6.2), never to ratios (user decision, 2026-10-06). Where none is sourced they take a
labelled placeholder (user decision, 2026-10-06, superseding "else zero"): §6.2. Fitting them per player is P3's.

### 3.2 The backswing's top

`stroke.backswing` is h, the head centre's height at the top above its height at contact (m). The stroke type's
`pendulumShare` s ∈ [0, 1] splits it:

- the pendulum's share: the head rises s·h about the hands, θ_top = −arccos(cos θ_c − s·h/ℓ_h), with θ_c = −lean
  (swing spec §5.2) and arccos through `atan2(√(1 − c²), c)`. Rejected if cos θ_c − s·h/ℓ_h < cos θ_max, θ_max the
  stroke type's `maxBackAngle` (default 90°, the shaft horizontal);
- the hands' share: the hands start at P_b = P_c + d_h·(−cos φ·aim + sin φ·ẑ), back and up along the stroke type's
  `handAngle` φ > 0, with d_h·sin φ = (1 − s)·h. With s = 1 the hands do not move (the drive, the single-ball shot
  and the stops: the top hand stays put).

### 3.3 The hands

The hands' path is kinematic and fixed in time: at rest at P_b until t_h = −T_h(i), then a constant acceleration to
P_c at t = 0, so their velocity at contact is V_c = 2·d_h/T_h(i) along the line from P_b to P_c. T_h(i) is linear in
i between the stroke type's `handTempo` bounds, as T(i) is. `SwingDrive.handShare` is removed: the hands' speed at
contact now follows from their backswing and tempo. After contact the hands' window, the reach, the dip and the
carry's descent act as in swing spec §3.2, from the hands' state at contact.

### 3.4 The release solve

The release time solves t_r + T_fall(t_r) = 0, T_fall(t_r) the time from release for θ first to reach θ_c under §3.1
with the hands of §3.3. With the hands still, T_fall does not depend on t_r and t_r = −T_fall directly. Otherwise
t_r is bracketed by scanning [−`DOWNSWING_MAX`, 0] in 1 ms steps for the first sign change, then bisected to 1e-9 s.
`DOWNSWING_MAX` is 2 s. No sign change rejects the shot: the backswing cannot reach the contact pose (too low for the
stance, or too little effort to rise to a contact angle above the hands' level).

The integration is semi-implicit Euler at `FREE_STEP` (5 µs), as `prepareImpact`'s free table. It yields a downswing
table of θ and ω from t_r to 0. ω₀ = ω(0); the head's velocity at contact is the path's, V_c + ω₀·n × (c − pivot),
and its magnitude is `contactSpeed`.

### 3.5 The lead-in and the impact's start

P2b.2b.1 starts the impact a lead L before contact, coasting until the first action. Here:

- before each drive window begins, the path is the downswing's: θ and ω from the downswing table, P and V from §3.3.
  At a window's start the window acts from the downswing's state there, as it acted from the coasting state, so the
  pendulum window's α and the hands' A are measured against `contactSpeed`;
- the downswing's head is checked against the turf at every table step. With t_g the first time its lowest point is
  below the turf, L = max(the earliest action's lead, −t_g + `TURF_MARGIN`), `TURF_MARGIN` = 5 ms;
- `MAX_LEAD` rises from 60 ms to 150 ms (provisional, to be confirmed against the sourced downswing times). A lead
  beyond it is rejected: a head meeting the lawn that long before the ball is a gross mis-hit the impact cannot
  afford;
- a downswing that meets the turf is simulated, not rejected (user decision, 2026-10-06): within the lead the impact
  integrates the head–turf pair, so a fat stroke emerges as turf drag slowing the head before the ball.

`swingApproach` samples the downswing over its whole length instead of 60 ms of the coasting line; `approach`
reports its lowest clearance and when. `FREE_SPAN` and the free table after the window are unchanged.

## 4. The follow-through

### 4.1 Integration

With `trajectory: true`, when the end rule closes the impact the follow-through continues the same tracked two-hand
model from the impact's end state: the coupling, the guide, the check, the carry and the head–turf pair, with the
balls removed. It steps as the impact does. Phase 2 and the fault judge are unchanged and do not see it; sweeping it
against balls, hoops and the peg is P2b.2b.3's.

### 4.2 The finish

The follow-through ends at the stroke type's finish:

- **swing** (single-ball, drive): the pendulum's apex, the first time after the impact that the head's pitch rate
  about n falls to zero;
- **check** (the stops): the head at rest relative to the hands, its speed relative to the pivot below 1e-3 m/s;
- **carry** (the rolls): the reach's end reached and the head's speed below 1e-3 m/s.

A finish not reached within `FOLLOW_CAP` = 1 s after contact ends it with the flag `follow-cap`.

### 4.3 `SwingTrajectory`

```ts
/** One sample of the whole stroke: the head's pose and the hands' positions (design §4.3). */
interface StrokeSample {
    readonly t: number;              // s from contact
    readonly head: Vec3;             // head centre
    readonly orientation: Quat;
    readonly top: Vec3;              // top hand (the pivot)
    readonly bottom: Vec3;
}

/** The whole stroke from the backswing's top to the finish, every 1 ms and at each boundary. */
interface SwingTrajectory {
    readonly samples: readonly StrokeSample[];
    readonly top: number;            // s from contact: the earlier of t_r and t_h
    readonly impactStart: number;
    readonly impactEnd: number;
    readonly finish: number;
    readonly flags: readonly ("follow-cap")[];
}
```

The shaft is the segment from the socket to the top hand, rigid on the head; P2b.2b.3 sweeps it and the head. The
samples before the impact come from the downswing, those inside it from the integrator's state, those after from the
follow-through.

## 5. The swing model

### 5.1 Types

```ts
/** How a stroke type's whole stroke is shaped (design §3). */
interface SwingShape {
    readonly pendulumShare: number;        // [0, 1] of the backswing height from the pendulum
    readonly handAngle: number;            // rad above horizontal of the hands' backswing line
    readonly maxBackAngle: number;         // rad, the pendulum's furthest back
    readonly effort: {
        readonly torqueMax: number;        // N·m at intensity 1
        readonly tempoSlow: number;        // s, pulse duration at intensity 0
        readonly tempoFast: number;        // s, at intensity 1
    };
    readonly handTempo: { readonly slow: number; readonly fast: number }; // s
    readonly defaultBackswing: number;     // m
    readonly defaultIntensity: number;     // [0, 1]
}
```

`SwingProfile` gains `shape: Readonly<Record<StrokeType, SwingShape>>`; `SwingDrive` loses `handShare`. In
`ShotSetup.stroke`, `speed` is replaced by `backswing` (m, required) and `intensity?` (absent: the preset's
`defaultIntensity`). `ShotOutcome` gains `contactSpeed` and `trajectory?`; `simulateShot(setup, world?, options?)`
takes `{ trajectory?: boolean }` (default false: the follow-through costs up to a second of tracked steps, which the
P5 budget does not afford on every shot).

### 5.2 Rejections

`buildContact` adds `RangeError`s for: `backswing` ≤ 0; `intensity` outside [0, 1]; `pendulumShare` outside [0, 1];
`handAngle` outside (0, 90°); a backswing beyond `maxBackAngle`; `tempoFast` > `tempoSlow` or either ≤ 0;
`handTempo` likewise; `torqueMax` < 0; no release time (§3.4); a lead beyond `MAX_LEAD`. The `speed` check goes.

### 5.3 Defaults and canonical setups

`defaultProfile`'s shapes come from §6. Each preset's `defaultBackswing` and `defaultIntensity` give its canonical
setup (swing spec §5.5, unchanged otherwise) a contact speed of 3 m/s ± 2 % (exit criterion 5). Tests and the probe
that need a given speed use a test-support solver for the backswing (bisection on h at fixed intensity); it is not
exported.

## 6. Reference data

### 6.1 Sourcing

The plan's first task sources, with provenance and a quotation on every figure, into `reference/swing.json`:

- Riches, *Croquet Technique* (Oxford Croquet): each stroke's backswing, tempo and finish;
- the Croquet Association, *Project Croquet Dynamics* (2006): mallet speeds and contact times;
- Gugan (oxfordcroquet.org/tech/gugan5/) and the Oxford Croquet technique pages (fetched with `curl -k`);
- biomechanics figures on pendulum swings in mallet and club sports, where they transfer.

Per stroke type: the backswing range, the split between pendulum and hands and the hands' angle, kinematic pairs
(backswing against contact speed, downswing time) where found, and the finish. Raw fetched text and extracted figures
are kept under `reference/sources/` so that later runs can reproduce them.

### 6.2 Fitting

Per stroke type with kinematic pairs, `torqueMax`, `tempoSlow` and `tempoFast` (and `handTempo` for the rolls) are
fitted by a deterministic grid search in `scripts/fitStrokeShape.ts` and written to `swing.json` as derived, marked
so. They are never fitted to ratios: the ratios stay P2b.2b.2c's, and the rolls its held-out validation.

Without pairs, a stroke type takes a placeholder, marked `"provisional": "placeholder"` in `swing.json` with this
rule as its provenance: `tempoSlow` is the gravity-only fall time from the default backswing, `tempoFast` half of it,
and `torqueMax` is set by the fit script so that intensity 1 from the default backswing gives twice the intensity-0
contact speed. The rolls' `handTempo` takes Riches' qualitative tempo, likewise marked. A placeholder is never tuned to
ratios; sourced data or P3's per-player fit replaces it.

## 7. Testing

### 7.1 Analytic and hand-checked cases

- Gravity only, hands still: the speed at contact against the energy integral ½·I_P·ω² = m·g·ℓ_h·(cos θ_c − cos θ_top)
  within 0.1 %; the fall time against the pendulum's elliptic-integral period, tabulated in the test.
- A constant effort over the whole downswing (a test pulse) against its closed form.
- The release solve: hands still gives t_r = −T_fall exactly; moving hands converge to 1e-9 s; a too-low backswing
  rejects.
- The hands' path: rest at P_b, P_c at 0, V_c = 2·d_h/T_h.
- Segment continuity at the impact's start, its end and between the downswing and the windows.
- A fat stroke: a stance and backswing whose downswing meets the turf before the ball start the impact early and
  arrive slower than the same swing raised clear.
- Each finish rule, and `follow-cap`.
- `dt` convergence of the follow-through's finish time and pose.
- Rejections (§5.2).

### 7.2 Bit-identity and migration

Exit criterion 4. The P2b.2b.1 swing tests that set `speed` migrate to the test-support solver; their expected values
hold where the path before contact does not matter (on-time strokes whose windows start at contact see the same
contact state to within the solver's tolerance) and are re-recorded where it does, each change listed in the plan.

## 8. Probe (`scripts/strokeProbe.ts`, recorded in the roadmap)

Per preset, the figures that bear on technique: contact speed against backswing height at intensity 0, 0.5 and 1;
the downswing time; the release time against the hands' start; the follow-through's apex height or reach and the
finish time; the downswing's lowest clearance; the canonical ratios against P2b.2b.1's; the follow-through's cost in
steps and µs/step (for P5). Raw output kept under `docs/superpowers/probes/`.

## 9. Amendments to earlier specs (docs, in this PR)

- **`simulateShot` and `lawnSpeed`** (user decision, 2026-10-06): when a `world` is passed it wins, and
  `setup.lawnSpeed` is ignored. Documented in the swing spec §6.1 and on `simulateShot`.
- Swing spec §3.3 and the plan name only carry mode for the untracked dip after contact; it is also untracked inside a
  swing-mode check.
- Swing spec §8.1's re-contact test is a straight drive, not a split.
- Swing spec §8.1's "over 0.15 s" is stale: the cap is 0.45 s.
- `FREE_SPAN` assumes `buildContact`'s `MAX_LEAD`, but `simulateImpact` is public and accepts any `contactAt` or cap;
  with `MAX_LEAD` now 0.15 s, `FREE_SPAN` is re-checked against `MAX_LEAD` + `TRACK_IMPACT_CAP` and widened if needed.

## 10. Deferred

- To P2b.2b.2b: the low-speed face–ball law, the turf under load, head–turf sourcing, the end-weighted head, other
  faces.
- To P2b.2b.2c: every ratio, T and ζ, `armMass`, `reachSlack`, the grips, crush, 29.1.6.3, the GC stop's distances.
- To P2b.2b.3: sweeping the trajectory against balls, uprights, crowns and the peg; the shaft's diameter and the peg's
  height.
- To P3: fitting effort and tempo per player.
- To P4: the planner's choice of backswing and intensity per shot.
- To P5: the follow-through's cost.

## 11. Roadmap changes (in this PR)

- The P2 row: P2b.2b.2 split into 2a, 2b and 2c as above, with their exit criteria.
- "P2b.2 decisions": the split; amplitude as input and the contact speed as outcome; gravity plus effort, effort and
  tempo one bounded control; effort fitted to kinematics only, else a labelled placeholder; a downswing meeting the
  turf simulated; the three-segment structure; `lawnSpeed` (world wins).
- The P3 row: per-player effort and tempo fitting.
