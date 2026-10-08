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

**Amended 2026-10-07 (spec review: subtraction, completeness).** The hands start with the pendulum's release (user
decision): in swing mode the pendulum leads and the hands follow its angle; in carry mode the hands lead on their own
tempo and the slope follows them (user decision, after a side note that a roll's pendulum barely swings), so the
release needs no root-find and `DOWNSWING_MAX` goes. The hands arrive at contact with no vertical velocity. The
follow-through is a continuation inside the integrator, keeping its state. `FREE_SPAN` and `WAKE_MARGIN`'s rationale
are re-derived for the longer runs. The coasting branch stays as the fallback when no downswing is supplied. The
defaults are fixed in a stated order. `contactSpeed` is the planned speed. An early window replaces the downswing's
dynamics, as it replaced the coasting. `defaultBackswing` moves to the reference data and the canonical setups;
`maxBackAngle` is one constant; the fit's grid search is built only if pairs are sourced; the constant-effort test
seam is replaced by a work–energy check; the turf scan and `swingApproach` share one pass; sourcing is bounded to the
data the fit consumes.

**Amended 2026-10-07 (plan).** Carry mode is evaluated in closed form, not tabulated (§3.4); its scan visits it at
every `FREE_STEP`. Before contact the hands' path is a function of time (σ from the table in swing mode), so an early
pendulum window replaces only the pendulum's dynamics and an early hands window only the hands' (§3.5). The dip is
not felt by the pendulum before contact (the table is dipless; `pathAt`'s derivatives stay exact). `StrokeSample`
carries the head's velocity (§4.3), which exit criterion 3 bounds. `buildContact` is `planStroke(…).contact`, and
`plannedSpeed` gives the speed alone (§2). The follow-through is a second loop, the run fixed before it (§4.1). A
finish's kind follows the prepared drive: carry mode, a check (α < 0), or a swing (§4.2). A carry whose reach never
binds finishes only at the cap. Where a sourced range puts the default backswing above h₀ (h₀ below the range's low
bound), the nearest-speed intensity is 0 (§5.3 step 2). The unsourced shape figures took the plan's placeholder
rules: at the sourcing gate the user confirmed every placeholder in `swing.json` (the hands' angle of 30° for every
type, the roll shares 0.4, 0.1 and 0.15, and the swing presets' `pendulumShare` 1 as a design choice). No numeric
figure and no kinematic pair was sourced: Riches gives only comparisons.

**Amended 2026-10-07 (implementation; user decisions).**

- **The default intensity at a bound** (§5.3 step 2; user decision, 2026-10-07): the nearest-speed rule. At the
  range's bound the intensity is 0 when even intensity 0 reaches 3 m/s or more, and 1 when even intensity 1 stays at
  or below it. This departs from §5.3's "1 when unreachable". No range was sourced, so the branch does not run today.
- **The fat stroke** (§3.5; user decision, 2026-10-07): before contact on a downswing the firm grip keeps its
  feed-forward and dampers but drops its position springs. With them, the springs refunded the turf's loss: in the
  fat-stroke test the hands did +1.70 J against the turf's −1.46 J, and the head arrived 2.4 % fast (3.197 against the
  clean stroke's 3.121 m/s). Without them a light graze costs a fraction of the head's speed (3.03 against 3.12 m/s).
  The user's view of play: a light graze is a successful stroke with only a fractional loss of speed; more resistance
  spoils the stroke; a hard stroke breaks the grip, and a weak stroke is stopped dead. Swing spec §3.3 is amended.
- **The stop's finish** (§4.2; user decision, 2026-10-07): after a stop's check the mallet is held still relative to
  the hands for the rest of the follow-through. Riches: the stop has "NO FOLLOW-THROUGH at all, or as little as
  possible". In the follow-through only, the pendulum is held (ω = α = 0) from max(the window's end, the impact's
  end), and the firm grip (springs and dampers) holds the head towards the held pose. The GC stop finishes at
  0.0984 s and the AC stop at 0.0539 s; without the hold they took 0.918 s, and the AC stop reached `follow-cap`. On
  the AC stop the hold starts after the pendulum has begun to swing freely, so the grip pulls the head back towards
  the path's θ at the hold's start, at up to 69 m/s². Swing spec §3.3 is amended.
- **Turf strike beyond a graze** (user decision, 2026-10-07; a roadmap item, its phase to be decided): a ploughing
  drag, so that a weak stroke is stopped dead, and a grip that breaks under a hard stroke. The model has no ploughing
  term: turf drag is μ·N with N a linear spring, so the drag grows by only about 100 N per mm of depth and nothing
  stops the head; the head touches the turf at a single point, its lowest.
- **Sources are cited, not mirrored** (§6.1; user decision, 2026-10-07). The repository keeps no copy of a fetched
  source. `reference/sources/README.md` cites each original with its URL, fetch date and the SHA-256 of the file as
  fetched, and quotes short passages, annotated, where a quotation makes a figure clearer or easier to verify.
- **Lawn damage** (Law 29.1.14). Under Law 29.2.3 it is a fault only in a hampered, jump or group stroke, and
  C29.19.5 sets no depth test; `faults.ts` already judges it. For ordinary strokes the 2 mm `impact-head-deep` event
  serves as the marker that a stroke has gone beyond a graze and has probably damaged the lawn. It is not a fault, and
  nothing is renamed.

**Findings (2026-10-07, implementation and probe).**

- Exit criterion 3's continuity tolerance: the 1e-6 m trapezoid check at 1 ms spacing fails on smooth motion with
  |jerk| above about 12,000 m/s³; a pass roll with a long lead misses by 1.35e-6 m. The canonical setups' worst seam
  pair is 5.7e-7 m, so the criterion holds on them. A jerk-scaled bound is the honest general form.
- Exit criterion 3's velocity bound, as tested (`tests/engine/support/trajectory.ts`): |Δv| at a seam is within 1.5 ×
  (the largest interior |Δv|/Δt on the side with no impulsive force) × Δt + 1e-4 m/s. With 1 ms samples a literal
  1e-4 m/s cannot be met, because the mallet's own acceleration moves its velocity by more than that in one sample.
  The 1e-6 m position check is the trapezoid form above and holds on the canonical setups (worst pair 5.7e-7 m).
- The fit's sourced `handTempo.slow` branch is dead on this data: Task 1 wrote only a quoted tempo, never a figure.
- §7.1's work–energy case is tested with a test effort (3 N·m, 0.6 and 0.3 s), not the default placeholder effort.
- `handAngle` is read and checked only when `pendulumShare` < 1, as §3.2 says.
- §7.1's too-low-backswing rejection is vacuous at `pendulumShare` 1: the energy integral guarantees θ_c is reached.
- The 1.2 s free table costs about 17 ms per swing-mode `prepareTrack` (the probe now reports it separately), and a
  shot prepares the track twice (`planStroke`, `prepareImpact`), three times with a trajectory.
- Open robustness defect, predating this phase: with a very stiff grip (ζ ≥ 2, or a period of 0.01 s) the fat stroke
  goes deep within 0.5 ms, reaches the cap with no strike, and leaves NaN in the result (the post-cap run in
  `integrate.ts`).
- `WAKE_MARGIN`: over the longest impact, 120,000 steps, the probe measured 6.55e-12 m, 153× headroom; unchanged
  (§4.4).

**Amended 2026-10-08 (P2b.2b.2b.1).** The rolls' defaults (§5.3) are refitted at Gugan's measured leans, 24°, 31° and
34°, by `scripts/fitStrokeShape.ts`, unchanged. The swing presets' entries are byte-identical (P2b.2b.2b.1 design §4),
but for the AC stop's `torqueMax` and `defaultSpeed`, which differ in their last digit only: fit noise. The
`WAKE_MARGIN` reach-filter residue above (6.55e-12 m, 153× headroom) is now 7.17e-12 m, 140× headroom, at the AC
stop's canonical contact: P2b.2b.2b.1's rounding drift.

## 1. Goal and exit criteria

A player controls a stroke by how far the mallet is taken back and how hard and how quickly it is swung through, not
by a speed. This phase models the whole stroke: the head at rest at the top of the backswing, the downswing under
gravity and the player's effort to the contact pose, the existing impact, and the follow-through from the head's real
state after the impact to the stroke's finish. The head's speed at contact becomes an outcome.

Exit criteria:

1. The analytic cases of §7.1 hold. With intensity 0 and the hands still, the downswing's speed at contact matches
   the energy integral of the §3.1 equation within 0.1 %; with effort, the work–energy balance holds within 0.1 %.
2. Where §6 sources kinematic pairs (backswing against contact speed, or downswing time), each stroke type's fitted
   effort reproduces them within their quoted spread.
3. `simulateShot` with `trajectory: true` runs every preset's canonical setup (§5.3) from top to finish with no
   `RangeError`, no re-entry guard hit (`entryJumps.count` 0), no ball centre more than 5 mm above R and no
   `follow-cap`. Its `SwingTrajectory` is continuous at every segment boundary: position within 1e-6 m and velocity
   within 1e-4 m/s.
4. Force-table drives are bit-identical to P2b.2b.1: `scripts/impactDigest.ts` byte-identical to `main`'s; the
   shot-mix work units (p99 143,084, p99.9 362,050, max 408,030), `SLOW_TESTS=1`, the obstacle fuzz and the reach
   filter reproduce exactly. `simulateShot` with `trajectory: false` (the default) returns an `ImpactResult`
   identical to the same shot's with `trajectory: true`.
5. Each preset's defaults (§5.3) give its canonical contact speed within ±2 % of 3 m/s (P2b.2b.1's canonical speed,
   so its figures stay comparable), or the nearest speed inside the sourced bounds, recorded. The ratios and the
   other §8 measurements are recorded in the roadmap against P2b.2b.1's, as observations; P2b.2b.2c calibrates them.
6. `ENGINE_VERSION` is "0.7.0"; `SwingShape`, `SwingTrajectory`, `StrokeSample` and `ShotOptions` are exported from
   `src/engine/index.ts`.

## 2. Architecture

```
src/engine/swing/types.ts         SwingShape; ShotSetup.stroke.backswing and .intensity replace .speed
src/engine/swing/downswing.ts     new: the downswing (§3): the forward integration, its table, the turf pass
src/engine/swing/buildContact.ts  the contact state from the downswing; MAX_LEAD 0.15
src/engine/impact/track.ts        before the drive windows the path is the downswing's table when supplied
src/engine/impact/integrate.ts    the follow-through continuation (§4.1)
src/engine/swing/trajectory.ts    new: SwingTrajectory (§4.3)
src/engine/shot.ts                simulateShot options { trajectory }; ShotOutcome.contactSpeed, .trajectory
reference/swing.json              new: sourced and derived stroke-shape figures (§6)
scripts/fitStrokeShape.ts         new: the §6.2 fit
scripts/strokeProbe.ts            new: the §8 measurements, raw output kept
```

Everything under `src/engine/**` stays under the determinism lint (`+ − × ÷ √`, the engine's `sinCos` and `atan2`).

```
ShotSetup ─downswing─▶ Downswing ─buildContact─▶ ContactState ─simulateImpact─▶ ImpactResult
                                                                    │ (trajectory: true) continues
                                                                    ▼ with the balls removed
                                       SwingTrajectory ◀── follow-through
                                                    ImpactResult ─▶ judgeFaults, simulateFreeMotion
```

Three segments: the downswing is integrated without contacts; the impact is P2b.2b.1's integrator, unchanged in its
physics; the follow-through continues the same integrator from the impact's end with the balls removed.

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
  (swing spec §5.2) and arccos through `atan2(√(1 − c²), c)`. Rejected if cos θ_c − s·h/ℓ_h < cos `MAX_BACK_ANGLE`,
  an engine constant of 90° (the shaft horizontal);
- the hands' share: the hands start at P_b = P_c + d_h·(−cos φ·aim + sin φ·ẑ), back and up along the stroke type's
  `handAngle` φ, with d_h·sin φ = (1 − s)·h. With s = 1, d_h = 0: the hands do not move (the drive, the single-ball
  shot and the stops: the top hand stays put) and φ is neither read nor checked.

### 3.3 The hands, by mode

The hands and the pendulum start together at the top (user decision, 2026-10-07). With Δ = P_c − P_b, Δ_h and Δ_z
its horizontal and vertical parts, and a progress variable σ from 0 at the top to 1 at contact, the hands' path is

P = P_b + Δ_h·σ² + Δ_z·(3σ² − 2σ³).

Both parts start from rest. At contact the horizontal part arrives at V_c = 2·Δ_h·σ̇(0) and the vertical part at
rest, so the hands carry the head along the turf and do not keep descending after contact. What drives σ depends on
the mode (user decision, 2026-10-07):

- **Swing mode** (single-ball, drive, the stops): the pendulum leads. It falls under §3.1, and σ = (θ − θ_top)/
  (θ_c − θ_top) slaves the hands to its angle. Every default swing preset has `pendulumShare` 1, so its hands are
  still and the coupling below is idle; it serves a profile with a share below 1. With V = P′(σ)·σ̇,
  A = P″(σ)·σ̇² + P′(σ)·σ̈ and σ̇ = ω/(θ_c − θ_top), A is linear in θ̈, so §3.1 is solved for θ̈ explicitly:

  (I_P + M·d·(P′(σ)·t̂)/(θ_c − θ_top))·θ̈ = −m·g·ℓ_h·sin θ − M·d·(P″(σ)·t̂)·σ̇² + τ_p(t).

  A non-positive left-hand coefficient anywhere on the downswing rejects the shot. A swing-mode `pendulumShare` of 0
  is rejected (σ would be undefined).
- **Carry mode** (the rolls): the hands and body lead, as in Riches' roll, the slope held by the grip. σ runs in
  time, σ = (t − t_r)/T_h(i), over the hands' tempo T_h(i) = `handTempo.slow` + i·(`handTempo.fast` −
  `handTempo.slow`), so t_r = −T_h(i). The pendulum is slaved to the hands' progress: θ = θ_top + (θ_c − θ_top)·σ²,
  arriving at ω₀ = 2·(θ_c − θ_top)/T_h(i), continuous with the carry's window after contact. A `pendulumShare` of 0
  (all hands) is valid: θ holds at θ_c throughout. The roll's speed comes from the hands' travel and tempo; τ_p does
  not act and `effort` is not read. Intensity sets the tempo only.

The hands' speed at contact, and so P2b.2b.1's `handShare`, now emerges; `SwingDrive.handShare` is removed. After
contact the hands' window, the reach, the dip and the carry's descent act as in swing spec §3.2, from the hands'
state at contact.

### 3.4 The forward integration

In swing mode, from rest at θ_top, the downswing is integrated forward by semi-implicit Euler at `FREE_STEP` (5 µs),
as `prepareImpact`'s free table, until θ first reaches θ_c; the step that crosses is cut by linear interpolation in θ.
That fall time T_fall gives t_r = −T_fall. No root-find is needed: with the hands slaved to θ, nothing in the
integration depends on t_r. It is rejected if ω falls to zero or below before θ_c (the swing stalls: the backswing too
low for the stance, or the effort too weak to rise to a contact angle above the hands' level) or if T_fall exceeds 2 s.
In carry mode the downswing is closed-form (§3.3) and is evaluated so, not tabulated (amended 2026-10-07); the turf
scan visits it at the same step.

In swing mode it yields a downswing table of θ, ω and θ̈ from t_r to 0. ω₀ = ω(0); the head's planned velocity at
contact is the path's, V_c + ω₀·n × (c − pivot), and its magnitude is `contactSpeed`: the planned speed, from the
contact-free downswing, so it is stable for the planner. A fat stroke's head arrives slower than it; the impact
records the real speed (§3.5) and the probe reports both.

### 3.5 The lead-in and the impact's start

P2b.2b.1 starts the impact a lead L before contact, coasting until the first action. Here:

- `SwingArc` gains an optional downswing table. When it is supplied, before each drive window begins θ, ω and α come
  from it and P, V and A from §3.3; the path's α there is the §3.1 θ̈, so the socket's acceleration stays exact. When
  it is absent, the coasting branch stays as it is, so hand-built `SwingArc`s and `ContactState`s (the impact, track,
  hands and head–ball tests, and `simulateImpact`'s public callers) are unchanged;
- a window that starts before contact (`timing.arc` or `timing.hands` < 0) replaces the downswing's dynamics from
  its start, as it replaced the coasting: the window's constant α (or A) acts from the downswing's state there,
  measured against `contactSpeed`; gravity and τ_p no longer act on the path inside it;
- one pass over the downswing table finds the head's lowest clearance above the turf and when (the head checked at
  every step); `swingApproach` reads it, replacing its 60 ms sampler (`APPROACH_STEP` goes). With t_g the first time
  the clearance is negative, L = max(the earliest action's lead, −t_g + `TURF_MARGIN`), `TURF_MARGIN` = 5 ms;
- `MAX_LEAD` rises from 60 ms to 150 ms (provisional, to be confirmed against the sourced downswing times). A lead
  beyond it is rejected: a head meeting the lawn that long before the ball is a gross mis-hit the impact cannot
  afford;
- a downswing that meets the turf is simulated, not rejected (user decision, 2026-10-06): within the lead the impact
  integrates the head–turf pair, so a fat stroke emerges as turf drag slowing the head before the ball;
- on a downswing the firm grip before contact keeps its feed-forward and dampers but has no position springs (user
  decision, 2026-10-07; swing spec §3.3), so the turf's loss is not refunded and a light graze costs a fraction of the
  head's speed.

## 4. The follow-through

### 4.1 Integration

With `trajectory: true`, when the end rule closes the impact `integrate` continues the same loop with the balls
removed: the coupling and its grip latch, the guide, the check, the carry, the reach and the head–turf pair keep their
state, at the impact's step. The `ImpactResult` is fixed when the end rule fires; the continuation only appends
samples and its own flags, so `trajectory: false` and `true` return identical impacts (exit criterion 4). Phase 2 and
the fault judge do not see the follow-through; sweeping it against balls, hoops and the peg is P2b.2b.3's.

Its flags: `follow-cap` (below) and `follow-head-deep` (the head–turf penetration beyond `HEAD_DEEP_LIMIT`, as
`impact-head-deep` inside the impact).

### 4.2 The finish

The follow-through ends at the stroke type's finish:

- **swing** (single-ball, drive): the pendulum's apex, the first time after the impact that the head's pitch rate
  about n falls to zero;
- **check** (the stops): the head at rest relative to the hands, its speed relative to the pivot below 1e-3 m/s.
  After the check the pendulum is held (ω = α = 0) and the hands grip firmly, so the mallet stays still relative to
  the hands (user decision, 2026-10-07: Riches' "NO FOLLOW-THROUGH at all, or as little as possible");
- **carry** (the rolls): the reach's end reached and the head's speed below 1e-3 m/s.

A finish not reached within `FOLLOW_CAP` = 1 s after contact ends it with `follow-cap`.

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
    readonly release: number;        // s from contact: the release t_r
    readonly impactStart: number;
    readonly impactEnd: number;
    readonly finish: number;
    readonly flags: readonly ("follow-cap" | "follow-head-deep")[];
}
```

The shaft is the segment from the socket to the top hand, rigid on the head; P2b.2b.3 sweeps it and the head. The
samples before the impact come from the downswing, those inside it and after from the integrator's state.

### 4.4 Spans and margins

- `FREE_SPAN` (0.55 s) tabulates the swing-mode free pendulum after its window and clamps beyond. It becomes
  `MAX_LEAD` + `FOLLOW_CAP` + a 50 ms guard (1.2 s), so the follow-through never reads a clamped sample. The earlier
  samples are unchanged, so exit criterion 4 holds; the table's cost is recorded in §8.
- `WAKE_MARGIN`'s rationale (integrate.ts) assumes a 60 ms lead and 102,000 steps. Re-measured over the longest run
  (a 150 ms lead plus `TRACK_IMPACT_CAP`, and the follow-through to `FOLLOW_CAP`, though the follow-through has no
  balls to wake) and its comment updated; the margin changes only if the headroom falls below 10×. Measured
  2026-10-07: 6.55e-12 m over 120,000 steps, 153×; the margin stays at 1e-9 m.

## 5. The swing model

### 5.1 Types

```ts
/** How a stroke type's whole stroke is shaped (design §3). */
interface SwingShape {
    readonly pendulumShare: number;        // [0, 1] of the backswing height from the pendulum
    readonly handAngle: number;            // rad above horizontal of the hands' backswing line (read when share < 1)
    readonly effort: {                     // swing mode only
        readonly torqueMax: number;        // N·m at intensity 1
        readonly tempoSlow: number;        // s, pulse duration at intensity 0
        readonly tempoFast: number;        // s, at intensity 1
    };
    readonly handTempo: { readonly slow: number; readonly fast: number }; // s, carry mode only
    readonly defaultIntensity: number;     // [0, 1]
}

/** simulateShot's options. */
interface ShotOptions {
    /** Integrate the follow-through and return the whole stroke's trajectory (default false). */
    readonly trajectory?: boolean;
}
```

`SwingProfile` gains `shape: Readonly<Record<StrokeType, SwingShape>>`; `SwingDrive` loses `handShare`. In
`ShotSetup.stroke`, `speed` is replaced by `backswing` (m, required) and `intensity?` (absent: the preset's
`defaultIntensity`). `ShotOutcome` gains `contactSpeed` (§3.4: the planned speed at contact; `contact.velocity` is the
head's at the impact's start, a lead before contact) and `trajectory?`. `simulateShot(setup, world?, options?)`:
the follow-through costs up to a second of tracked steps, which the P5 budget does not afford on every shot.

### 5.2 Rejections

`buildContact` adds `RangeError`s for: `backswing` ≤ 0; `intensity` outside [0, 1]; `pendulumShare` outside [0, 1];
`handAngle` outside (0, 90°) when `pendulumShare` < 1; a backswing beyond `MAX_BACK_ANGLE`; in swing mode, a
`pendulumShare` of 0, `tempoFast` > `tempoSlow` or either ≤ 0, or `torqueMax` < 0; in carry mode, `handTempo.fast`
> `handTempo.slow` or either ≤ 0; `defaultIntensity` outside [0, 1]; a non-positive effective inertia (§3.3); a stall
or a fall beyond 2 s (§3.4); a lead beyond `MAX_LEAD`. The `speed` check goes.

### 5.3 Defaults and canonical setups

The defaults are fixed in this order, per stroke type:

1. h₀, the backswing that gives 3 m/s at intensity 0 (swing mode: gravity alone, τ_max does not enter; carry mode:
   the hands at `handTempo.slow`);
2. if the sourced backswing range (§6.1) holds h₀, the default backswing is h₀ and `defaultIntensity` 0; otherwise
   the default backswing is the range's nearest bound and `defaultIntensity` is solved for 3 m/s there (after step 3),
   or, if no intensity in [0, 1] reaches it, 1 and the nearest speed recorded;
3. the effort: fitted (§6.2), or the placeholder from h₀.

The default backswing is recorded in `swing.json` and the canonical setups (swing spec §5.5, otherwise unchanged; in
test support), not in `SwingShape`: `stroke.backswing` is required, so the engine never reads a default. Tests and
probes that need a given speed use a test-support solver for the backswing (bisection on h at fixed intensity); it is
not exported. Since P2b.2b.2b.1 the rolls are fitted at Gugan's leans (its §4).

## 6. Reference data

### 6.1 Sourcing

The plan's first task sources, with provenance and a quotation on every figure, into `reference/swing.json`:

- Riches, *Croquet Technique* (Oxford Croquet): each stroke's backswing, tempo and finish;
- the Croquet Association, *Project Croquet Dynamics* (2006): mallet speeds and contact times;
- Gugan (oxfordcroquet.org/tech/gugan5/) and the Oxford Croquet technique pages (fetched with `curl -k`);
- croquet or pendulum-swing measurements only where they give backswing against contact speed, or downswing time.

Per stroke type: the backswing range, the split between pendulum and hands and the hands' angle, kinematic pairs
where found, and the finish. `reference/sources/README.md` cites each source (URL, fetch date, SHA-256 of the
fetched file) and quotes the extracted figures, annotated; the fetched text itself is not kept (amended 2026-10-07:
cited, not mirrored).

### 6.2 Fitting

`scripts/fitStrokeShape.ts` writes the derived values to `swing.json`, marked so. Where §6.1 finds kinematic pairs
for a stroke type, `torqueMax`, `tempoSlow` and `tempoFast` are fitted to them by a deterministic grid search; the
grid search is built only if some stroke type has pairs. They are never fitted to ratios: the ratios stay
P2b.2b.2c's, and the rolls its held-out validation.

Without pairs, a stroke type takes a placeholder, marked `"provisional": "placeholder"` with this rule as its
provenance. Swing mode: `tempoSlow` is the gravity-only fall time from h₀, `tempoFast` half of it, and `torqueMax` is
found by a one-dimensional bisection so that intensity 1 from h₀ gives twice the intensity-0 contact speed. Carry
mode: `handTempo.slow` from Riches' qualitative tempo for the roll, `handTempo.fast` half of it, so intensity 1 from
the same backswing doubles the contact speed likewise. A placeholder is never tuned to ratios; sourced data or P3's
per-player fit replaces it.

## 7. Testing

### 7.1 Analytic and hand-checked cases

- Gravity only, hands still: the speed at contact against the energy integral ½·I_P·ω² = m·g·ℓ_h·(cos θ_c − cos θ_top)
  within 0.1 %; the fall time against the pendulum's elliptic-integral period, tabulated in the test.
- Effort, hands still: the work–energy balance ½·I_P·ω₀² = m·g·ℓ_h·(cos θ_c − cos θ_top) + ∫τ_p dθ, the integral
  computed numerically from the downswing table, within 0.1 %.
- Moving hands, swing mode (a test profile with a share below 1): P_b at the top, P_c at contact, no vertical
  velocity at contact, V_c = 2·Δ_h·σ̇(0); the effective inertia's rejection; a share of 0 rejected.
- Carry mode: t_r = −T_h(i); V_c = 2·Δ_h/T_h(i) and ω₀ = 2·(θ_c − θ_top)/T_h(i) in closed form; a share of 0 holds θ
  at θ_c; intensity 1 halves the tempo and doubles the speed.
- The forward integration: a stall and a too-low backswing reject; t_r = −T_fall.
- Segment continuity at the impact's start, at a window's start before contact, at the impact's end.
- A fat stroke: a stance and backswing whose downswing meets the turf before the ball start the impact early and
  arrive slower than the same swing raised clear.
- An early window replaces the downswing's dynamics (§3.5).
- The coasting fallback: a `SwingArc` with no downswing table behaves as in P2b.2b.1.
- Each finish rule, `follow-cap` and `follow-head-deep`; `trajectory: false` and `true` give identical impacts.
- `dt` convergence of the follow-through's finish time and pose.
- Rejections (§5.2).

### 7.2 Bit-identity and migration

Exit criterion 4. The swing tests that set `speed` migrate to the test-support solver; their expected values hold
where the path before contact does not matter (on-time strokes whose windows start at contact see the same contact
state to within the solver's tolerance) and are re-recorded where it does, each change listed in the plan.
`scripts/swingProbe.ts` migrates to `backswing` the same way, and `ShotOutcome.approach`'s "60 ms" doc is rewritten
(§3.5).

## 8. Probe (`scripts/strokeProbe.ts`, recorded in the roadmap)

Per preset, the figures that bear on technique: contact speed against backswing height at intensity 0, 0.5 and 1;
the downswing time; the follow-through's apex height or reach and the finish time; the downswing's lowest clearance;
for fat strokes, the planned and the real speed at the first face–ball contact; the canonical ratios against
P2b.2b.1's; the cost of the downswing and of the follow-through in steps and µs/step, and of the longer free table
(for P5). Raw output kept under `docs/superpowers/probes/`.

## 9. Amendments to earlier specs (docs, in this PR)

- **`simulateShot` and `lawnSpeed`** (user decision, 2026-10-06): when a `world` is passed it wins, and
  `setup.lawnSpeed` is neither read nor checked; without one, the check stays and builds `defaultWorld`. Documented
  in the swing spec §6.1 and on `simulateShot`.
- Swing spec §3.3 and the plan name only carry mode for the untracked dip after contact; it is also untracked inside a
  swing-mode check.
- Swing spec §8.1's re-contact test is a straight drive, not a split.
- Swing spec §8.1's "over 0.15 s" is stale: the cap is 0.45 s.
- `FREE_SPAN` assumed `buildContact`'s `MAX_LEAD`, though `simulateImpact` is public and accepts any `contactAt` or
  cap; §4.4 re-derives it.
- Swing spec §3.3 (user decisions, 2026-10-07): on a downswing the firm grip before contact has no position springs;
  a stop's follow-through holds the mallet still relative to the hands after its check.

## 10. Deferred

- To P2b.2b.2b: the low-speed face–ball law, the turf under load, head–turf sourcing, the end-weighted head, other
  faces.
- To P2b.2b.2c: every ratio, T and ζ, `armMass`, `reachSlack`, the grips, crush, 29.1.6.3, the GC stop's distances.
- To P2b.2b.3: sweeping the trajectory against balls, uprights, crowns and the peg; the shaft's diameter and the peg's
  height.
- To P3: fitting effort and tempo per player.
- To P4: the planner's choice of backswing and intensity per shot.
- To P5: the follow-through's and the longer free table's cost.

## 11. Roadmap changes (in this PR)

- The P2 row: P2b.2b.2 split into 2a, 2b and 2c as above, with their exit criteria.
- "P2b.2 decisions": the split; amplitude as input and the contact speed as outcome; gravity plus effort, effort and
  tempo one bounded control; effort fitted to kinematics only, else a labelled placeholder; the hands and pendulum
  starting together, the pendulum leading in swing mode and the hands in carry mode; a downswing meeting the turf
  simulated; the three-segment structure; `lawnSpeed` (world wins).
- The P3 row: per-player effort and tempo fitting.
