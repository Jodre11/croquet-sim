# P2b.1 — Impact Integrator: Design

**Product spec:** `2026-09-30-croquet-shot-lab-design.md` §3 (`ContactState`), §4 (output of the swing model), §5
("Phase 1 — Impact"), §9 and §11. That spec fixes the behaviour; this document fixes how the engine delivers it.
**Roadmap:** P2 row. P2b is split: **P2b.1** (this document) is the impact integrator alone, driven by hand-built
`ContactState`s; **P2b.2** adds the swing model, the coaching and profile reference data, `simulateShot(setup)` and
the stroke-level exit criteria.

**Amended 2026-10-03 (spec review: subtraction, completeness).** Per-pair open/close events dropped; one mallet head
and one face sourced; the sensitivity sweep, stop-shot probe and timing moved to a script; turf contact defined
geometrically; residual overlap at handover, input validation, termination before first contact and head
re-approach specified; the restitution relation extended to the overdamped branch; owning type of each contact
parameter named; frames, tolerances and test overrides stated.

**Amended 2026-10-03 (plan).** Planning and sourcing changed the following:

- **Ball–ball contact time.** Gugan measured it directly at 0.75 ms (0.50–0.87 ms), so `dt` is set from 0.5 ms
  rather than from the billiard analogue.
- **Turf stiffness.** It is derived from Gugan's measured peak penetration (7.2 mm) using the model's own damping:
  1.1×10⁵ N/m, bounds up to the undamped 2.7×10⁵.
- **Inclined-face case.** A ball can roll, so the threshold is `tan θ = 7μ/2`, not `μ`.
- **Head re-approach.** Only a ball within one radius of a face counts.
- **`ImpactResult`.** It carries the handed-over balls.
- **`simulateImpact`.** Validation and preparation sit in their own unit.
- **Orientation.** A non-unit orientation is rejected.
- **The overdamped branch.** It needs no `exp`.

The plan (`plans/2026-10-03-p2b1-impact-integrator.md`) gives the detail.

**Amended 2026-10-03 (pre-flight).** The plan was executed literally in a scratch worktree (§10). The user accepted the
changes below.

- **Termination (§5).** A ball still bouncing in the turf holds the impact open. Ignoring turf contact cut a
  descending strike's lift from 0.91 to 0.26 m/s.
- **Tangential reset (§4).** A sliding contact's spring carries the cone force alone (classic Cundall–Strack). The
  planned reset stored energy against the dashpot that the energy invariant saw as a 6–9 % gain.
- **Handover (§6).** The handover separates a pair fully when the turf clamps one ball's move.
- **Constants (§5, §9, §10)** are measured; `IMPACT_CAP` is 60 ms.
- **Convergence (§9.3)** is gated on the scenarios; fuzz strokes converge first-order, worst 1 % at `dt`.
- **Sensitivity (§1).** The hard pairs dominate croquet strokes, not only the turf.

The plan's "Decisions made in pre-flight" gives the figures.

**Amended 2026-10-03 (real run).** Review of the entry point changed two points:

- **Handover (§6).** The separation pass repeats until no pair overlaps by more than 1e-12 m (at most 64 passes); one
  pass cannot separate a chain of three balls.
- **Validation (§3).** The head-penetration check covers the whole head cylinder (faces, rims and barrel), not only
  the faces.

## 1. Goal and exit criteria

Add phase 1 to the engine: a compliant, small-step, N-body integrator that takes a `ContactState` (the mallet head
and the drive applied to it) and the balls at rest, integrates mallet, balls and turf through the contact, and hands
each ball's full 3D state to phase 2 (`simulateFreeMotion`).

Exit criteria:

1. The analytic cases of §9.1 hold.
2. The invariants of §9.2 hold, including bit-identical repeat runs.
3. Halving `dt` moves every handover velocity by less than `CONVERGENCE_TOLERANCE` (§9.3).
4. Handed-over states are accepted by `simulateFreeMotion`, airborne or on the turf (§6).
5. Moving the turf restitution into `SurfaceProps` (§7) leaves phase 2 bit-identical: the shot mix's work-unit
   figures (p99 143,084, p99.9 362,050, max 408,030) and `SLOW_TESTS` reproduce exactly.
6. The fuzz (§9.6) never hangs, never raises `impact-cap` inside its input ranges, and keeps every peak penetration
   under `PENETRATION_BOUND`; the ranges and the bound are fixed by pre-flight (§10).

Recorded, not gated, by `scripts/impactProbe.ts` (roadmap "P2b.1 outcomes carried forward", for P2b.2 and P5):

- **Stiffness sensitivity:** each stiffness swept across its bounds, and the handover changes. Expected: the hard
  pairs barely matter (with `e` exact), the turf dominates lift. (pre-flight: true for single-ball strokes; in a
  croquet stroke the face–ball and ball–ball springs in series set the momentum split, and blue moves 0.92–2.29 m/s
  across their sourced contact-time bounds.)
- **Stop-shot probe:** one plausible hand-built stop-shot `ContactState` (head level or slightly descending, checked
  drive): whether the striker's ball clears the turf during the transfer and meets the croqueted ball above its
  equator. The formal stop-shot-lift criterion belongs to P2b.2, which owns the drive profile.
- **Impact engine time per stroke**, for P5's budget.

## 2. Approach

Linear spring–dashpot (Kelvin–Voigt) normal contact per pair, clamped so it never pulls, with damping set from the
sourced restitution; Cundall–Strack tangential spring–slider friction; semi-implicit (symplectic) Euler at a fixed
step; the mallet head as a rigid body driven by a piecewise-linear force at its shaft socket.

Rejected:

- **Hertzian contact with Hunt–Crossley damping.** Needs elastic moduli that are not sourced, and reproduces `e`
  only approximately and speed-dependently. The contact law sits behind one function per pair (§4), so Hertzian
  contact can replace it for the hard pairs if P2b.2's stroke ratios show the force shape matters.
- **Regularised Coulomb friction** (`−μN·v_t/max(|v_t|, v_ε)`). A stuck contact creeps, the result depends on an
  arbitrary `v_ε`, and a small `v_ε` forces a smaller `dt`.
- **Velocity-level stick projection.** Mixes impulses into a force-based integrator and muddies the energy account.
- **RK4 or velocity Verlet.** Contact onsets and releases are discontinuities that cancel most of the higher order,
  at 2–4× the cost per step.
- **Contact-onset location** (splitting a step at a contact's onset or release). Added only if the convergence test
  shows onset error dominates.
- **Prescribed head kinematics** instead of a force. Makes the head infinitely stiff to the ball's reaction, which is
  wrong for a checked stroke.
- **Drive force at the head's centre of mass.** Loses the pitching of the head by a leaning shaft that drives
  through, plausibly part of how roll shots behave.

## 3. Interface

New directory `src/engine/impact/`, under the engine's determinism lint (`+ − × ÷ √` only; `ln`, `sinCos` and
`atan2` from `math/elementary.ts`, plus an `exp` added there if the overdamped branch of §4 needs it).

| Unit | Purpose |
|---|---|
| `impact/types.ts` | `ContactState`, `MalletHead`, `FaceMaterial`, `DriveSample`, `ImpactEvent`, `ImpactResult` |
| `impact/contactLaw.ts` | Normal and tangential force for one contact (§4) and the damping-ratio solve |
| `impact/rigidBody.ts` | `Quaternion` type, pose update and Euler's equations for the head |
| `impact/contacts.ts` | Closed contacts and their penetrations: face–ball, ball–ball, ball–turf |
| `impact/integrate.ts` | The fixed-step loop (§5) |
| `impact/handover.ts` | `ImpactResult` → `BallStates` (§6) |

```ts
/** The mallet head: a solid cylinder whose axis is the body x axis; the two end discs are its faces. */
interface MalletHead {
    mass: number;
    /** Principal moments about the centre of mass, body frame (axis, and the two transverse axes). */
    inertia: Vec3;
    length: number;
    radius: number;
    /** Where the shaft meets the head, body frame. The drive force acts here. */
    socket: Vec3;
}

interface FaceMaterial { restitution: number; friction: number; contactTime: number }

/** Applied force at time t (s from the start of the impact), world frame. Linear between samples. */
interface DriveSample { t: number; force: Vec3 }

interface ContactState {
    head: MalletHead;
    face: FaceMaterial;
    /** At t = 0: head centre of mass, orientation (unit quaternion body → world), and velocities, all world frame. */
    position: Vec3;
    orientation: Quaternion;
    velocity: Vec3;
    angularVelocity: Vec3;
    /** Samples in strictly increasing t, the first at t = 0, the last ending the drive window; zero force after it. */
    drive: readonly DriveSample[];
}

function simulateImpact(contact: ContactState, balls: BallStates, world: World): ImpactResult;
```

`angularVelocity` is in the world frame, like `BallState`'s; the integrator converts to the body frame for Euler's
equations and back.

The drive is the total force the hands apply to the head, excluding gravity; gravity acts on the head separately.
Supporting the head's weight is therefore part of the drive (the swing model's job in P2b.2; hand-built profiles in
P2b.1 tests include it explicitly).

`ImpactResult` holds each ball's final `BallState`, the head's final state, the impact `duration`, the impact's
events (`turf-lift` for a ball leaving the turf, and the diagnostics of §5), the peak penetration per pair, and the
step count. Impact events stay in `ImpactResult`; whether and how per-contact events join `ShotResult` is P2b.2's
decision with `simulateShot`.

Wiring into `simulateShot` is P2b.2's. P2b.1 adds a test helper that chains `simulateImpact` → handover →
`simulateFreeMotion`.

**Input validation.** `simulateImpact` throws `RangeError`, as `simulateFreeMotion` does, when:

- a ball is not at rest on the turf (non-zero velocity or spin, or `z ≠ R`);
- two balls overlap, or a ball overlaps or touches an obstacle (upright or peg) within `CONTACT_TOLERANCE`
  (`detect.ts`): ball–obstacle contact is not modelled in the impact (§11), and phase 2 would reject the overlap at
  handover;
- the head penetrates a ball or the turf at t = 0 (the ball check covers the whole head cylinder: faces, rims and
  barrel);
- the drive is empty, does not start at t = 0, or is not strictly increasing in t;
- any mass, inertia, length, radius or contact time is not positive and finite, or any restitution is outside
  (0, 1] or friction negative.

## 4. Contact model

**Pairs.** Face–ball, ball–ball and ball–turf. Every contact is one entry in a single list of pairs, iterated in a
fixed order (face–ball, then ball–ball, then ball–turf, each in `BALL_IDS` order), so three- and four-ball cannons
need no restructuring. Ball–obstacle (upright, peg) is a further pair type, deferred (§11).

**Normal force.** For penetration `δ > 0` and closing rate `δ̇`, `N = max(0, k·δ + c·δ̇)`. Clamping at zero means a
contact never pulls; it releases when the force reaches zero, before `δ` returns to zero. For a linear system the
release condition is scale-invariant, so the restitution of the clamped law is still independent of speed. The
damping ratio `ζ` that gives the sourced `e` solves the clamped relation (Schwager & Pöschel, "Coefficient of
restitution and linear–dashpot model revisited", Granular Matter 9, 2007), which for the underdamped branch is

```
ln e = −(ζ / √(1 − ζ²)) · (π − atan2(2ζ√(1 − ζ²), 1 − 2ζ²))      (ζ < 1/√2, e > e^(−π/2) ≈ 0.208)
```

The same paper gives the branch for `ζ ≥ 1/√2`, which covers the low end of the sourced turf restitution (bounds
0.15–0.51). Every `e` in (0, 1) is supported; `ζ` is found by bisection on `ζ ∈ [0, ζ_max]` over both branches,
with `ζ_max` the value at which `e` falls below the smallest representable target, fixed by pre-flight. The
pre-flight confirms both branches numerically before the plan depends on them; the analytic test (§9.1) pins them.

**Stiffness from a contact duration.** The sourced quantity is a contact duration `T` (or, for turf, a deformation
that gives one; §8). For the clamped law on the underdamped branch `T = (π − atan2(2ζ√(1 − ζ²), 1 − 2ζ²)) / ω_d`
with `ω_d = ω₀√(1 − ζ²)` (the overdamped branch has its own closed form in the same paper), so `k = m_eff·ω₀²` and
`c = 2ζ·m_eff·ω₀`. `m_eff` is the pair's reduced mass from translational masses (ball–turf: the ball's mass;
face–ball: head and ball). The sourced `e` is therefore exact for central collisions, which is how restitution is
defined and measured; off-centre face contacts, where the head's rotation changes the effective mass, are
approximate.

**Where each parameter lives, and when `ζ` is solved.**

| Pair | Restitution, friction | Contact time or stiffness | Owner |
|---|---|---|---|
| Face–ball | `FaceMaterial` | `FaceMaterial.contactTime` | `ContactState` |
| Ball–ball | `World.ballBall` | `World.ballBallContactTime` (new) | `World` |
| Ball–turf | `SurfaceProps.turfRestitution`, `slidingFriction` | `SurfaceProps.turfStiffness` | `Lawn`, per position |

`TANGENTIAL_STIFFNESS_RATIO` (`k_t/k` = 2/7) is a module constant in `contactLaw.ts`. All `ζ`, `k` and `c` are
computed at the start of `simulateImpact`: face–ball and ball–ball once, ball–turf once per ball from its
`surfaceAt` sample. Tests and the probe script override them through `ContactState` and `World` (`defaultWorld`
overrides, as phase 2's tests do).

**Tangential force (Cundall–Strack).** Each closed contact stores a tangential elastic displacement `ξ`. Per step
`ξ += v_t·dt`, re-projected onto the current tangent plane; the trial force `F_t = −k_t·ξ − c_t·v_t`, with
`k_t = TANGENTIAL_STIFFNESS_RATIO·k` (Silbert et al. 2001) and `c_t = 2ζ·√(k_t·m_eff)`. If `|F_t| > μ·N` the
contact slides: `F_t` is scaled to `μ·N` and `ξ` is reset so that the spring alone carries it, `−k_t·ξ = F_t`
(Cundall and Strack 1979), storing at most `(μ·N)²/(2·k_t)`. Resetting to `−(F_t + c_t·v_t)/k_t` instead leaves the
spring holding a displacement that only cancels the dashpot (pre-flight: about 3 mm, 0.35 J, for a ball sliding on
the turf), energy no motion returns. `ξ` is cleared when the contact opens. Sticking is true sticking, with no creep.

**Geometry.**

- Face–ball: the ball's signed distance to a face plane; the contact point is the ball's nearest point. If that point
  lies outside the face disc, the contact is not formed and `impact-off-face` is raised; the result is then outside
  the model, as a jump flag is in phase 2 (hampered and edge strokes are deferred).
- Ball–ball: centre distance against `2R`.
- Ball–turf: `δ = R − z`, unilateral; the turf is immovable. Turf properties come from `lawn.surfaceAt` (§7).

**Turf contact is geometric.** A ball is *in turf contact* while `z < R`, whatever its normal force; the clamped law
can release (`N = 0`) while the ball is still rising out of its hollow. `turf-lift` is raised when `z` first reaches
`R` from below; the handover (§6) uses the same definition.

Rolling resistance is omitted during the impact (0.065·g over 5 ms is about 3 mm/s).

## 5. Integration

Semi-implicit Euler at a fixed `dt`: forces from the current state; velocities, then positions, from them. The head's
orientation is a unit quaternion advanced by its angular velocity and renormalised with `√` each step; angular
velocity follows Euler's equations in the body frame.

- **Step.** `dt` is a constant of the engine version, set at about 1/100 of the shortest sourced contact duration and
  confirmed by the convergence test (pre-flight: 5e-6 s). It does not adapt to inputs, which keeps the step count,
  and so results, identical across runs.
- **Order.** Bodies in fixed order (head, then balls in `BALL_IDS` order); contacts in the order of §4. Forces are
  summed in that order.
- **Initial state.** Balls at rest start at their static turf sink `mg/k_turf`, with zero velocity, so the impact does
  not open with a spurious bounce. Touching balls start at zero overlap. The head may start with a gap to the ball.
- **Termination.** Once at least one face–ball contact has closed, the impact ends when three conditions hold:
  - the drive window has closed;
  - no face–ball or ball–ball contact has been closed for `RELEASE_STEPS` consecutive steps;
  - no ball in turf contact is still bouncing in it.

  A ball bounces while its vertical oscillation energy about the static sink `δ₀ = m·g/k` exceeds the static
  spring's, `½·m·v_z² + ½·k·(δ − δ₀)² > ½·k·δ₀²`: it will still reach `δ = 0` and leave the turf. So the turf's
  rebound, which dominates lift, is integrated rather than discarded. Below that the ball only settles in its hollow,
  and the handover discards at most `m·g·δ₀/2` (§6). A ball rolling at its sink does not hold the impact open.
  (pre-flight: without this, a 3 m/s strike descending at 0.5 rad ended at 3 ms with the ball still 1.9 mm deep, and
  lift came out at 0.26 m/s instead of 0.91 m/s; a test on `|v_z|` alone ended at the bottom of a bounce, where
  `v_z = 0`, and halving `dt` moved some handovers by a third.) Before the first face–ball contact, only the cap ends
  it.
- **Head re-approach.** If at termination the head is closing on any ball (relative normal velocity towards it), the
  impact ends anyway and raises `impact-head-approaching`: a second strike is a double tap, a fault, and is not
  modelled.
- **Cap.** `IMPACT_CAP` (60 ms: 5× the longest of 2000 fuzz impacts, 11.6 ms) ends the impact with an `impact-cap`
  event rather than hanging; it also covers a head that never reaches the ball (a whiff).
- **Grounded head.** If any point of the head goes below the turf plane, `impact-mallet-grounded` is raised once.
  Mallet–turf contact is not modelled.

The diagnostics are `impact-cap`, `impact-head-approaching`, `impact-mallet-grounded` and `impact-off-face`. Each
marks a result outside the validated model, as the jump flag does in phase 2.

## 6. Handover

Per product spec §5, with turf contact as defined in §4:

- A ball with `z ≥ R` is handed over airborne, as it is.
- A ball with `z < R` is placed on the lawn (`z = R`); it keeps an upward vertical velocity above the settle speed,
  and so starts airborne; otherwise its vertical velocity is zeroed. The stored elastic energy of the residual sink
  is discarded (negligible: `mg·δ₀/2`).
- Ball–ball contacts release while `δ > 0` (§4), so a pair can end the impact still overlapping. Each overlapping
  pair is separated along its normal to zero gap, each ball moved half the overlap (equal masses), velocities
  unchanged, pairs in the fixed order of §4. No ball is moved below the turf. When the lower ball's half-move is
  clamped at `z = R`, the other ball takes the rest along the new line of centres. Clamping alone leaves about
  `½·overlap·n_z²`, first order in the overlap (pre-flight: 4e-8 m, beyond phase 2's `CONTACT_TOLERANCE` of 1e-9). The
  fixed-order pass repeats until no pair overlaps by more than 1e-12 m (at most 64 passes), because one pass cannot
  separate a chain of three balls: separating the second pair pushes the middle ball back into the first. The largest
  single-pair overlap removed is reported in `ImpactResult`.

Positions are as at the end of the impact after these corrections; phase 2's time starts at zero there.

## 7. Turf and lawn conditions

Product spec §2 carries turf parameters per ball and routes lawn variation (sparse patches, wet lawns, slopes)
through `lawn.surfaceAt`. The author also wants the turf to be able to change slowly through a match as the lawn
dries (decided 2026-10-03; not modelled now). So no turf property is a module constant:

- `SurfaceProps` gains `turfStiffness` (N/m) and `turfRestitution`, beside `slidingFriction` and
  `rollingResistance`. The impact samples `lawn.surfaceAt` once per ball at its start (a ball moves millimetres in
  the impact); crossing a surface boundary within an impact is deferred (§11).
- `World.ballTurfRestitution` is removed; `turfAt` (world.ts) and phase 2's landing read
  `surfaceAt(position).turfRestitution`. On a uniform lawn the value is unchanged, so phase 2 is bit-identical
  (exit criterion 5). `validateWorld` checks both new fields where it already samples the surface; the world tests'
  restitution case moves from `ballTurfRestitution` to the surface.
- A shot uses one `Lawn` snapshot, built by the caller (`ShotSetup.lawn`). A changing lawn changes how that snapshot
  is built, not the engine. Mapping lawn speed or moisture to turf stiffness and restitution is not sourced and is
  not modelled in P2b.1; the fields make it possible.

`ENGINE_VERSION` moves to 0.4.0.

## 8. Reference data

Each value in the existing `reference/*.json` form (value, unit, bounds, source, provenance: direct, derived or
analogue). Sourcing is the plan's first task; a value with no source is labelled analogue with wide bounds, never
invented.

| File · value | Likely source | Note |
|---|---|---|
| `contact.json` · ball–turf deformation or contact time | Derived from Gugan's transient hollow (about 50 mm across at about 5 m/s → `δ` ≈ 7.4 mm → `k` ≈ 2×10⁵ N/m, about 4.6 ms), cross-checked against his video timings ("The Physics of Croquet Strokes", oxfordcroquet.org/tech/gugan4/) | Feeds the default lawn's `turfStiffness`; expected to dominate lift |
| `contact.json` · ball–ball contact time | Gugan's DVD analysis, Table 1: 0.75 ms (0.50–0.87 ms), direct | `World.ballBallContactTime`; sets `dt` |
| `contact.json` · face–ball contact time | Hall, "When a Mallet Strikes a Ball"; Gugan | |
| `contact.json` · `k_t/k` | Silbert et al. 2001 (DEM) | 2/7 |
| `mallet.json` · one face: restitution and friction | Gugan Table I (ball on wood 0.817); Gugan's face friction ≈ 0.5 | Other face materials are P2b.2's |
| `mallet.json` · one typical head: mass, length, radius, socket position, inertia | Manufacturers' specifications; Hall | For P2b.1's hand-built tests; weighting variants and profile defaults are P2b.2's |

Turf friction stays the sourced `ballTurfSliding` (0.48, bounds to 1.0, which already covers Gugan's estimate for a
ball pressed into the turf); P2b.2's calibration may move within the bounds.

## 9. Testing

1. **Analytic cases**, each isolating one mechanism with overrides:
   - one contact of each pair (gravity off; for face–ball, the head free and undriven): contact time and restitution
     match the clamped closed form, on both branches;
   - two balls head-on with no turf and no gravity exchange velocities per `e`;
   - a ball dropped on the turf (gravity on) rebounds at `turfRestitution`;
   - a ball on a fixed, inclined face (head mass overridden very large, undriven; gravity on; no turf) sticks below
     `tan θ = 7μ/2` (it rolls; `μ` is the threshold only for a body that cannot roll) and slips above it;
   - a centre strike, chained into phase 2, rolls at 5/7 of launch speed (product spec §9, now fed by a real impact);
   - a socket force on a free head (no balls, no gravity) rotates it with the sign and size torque predicts over a
     short window.
2. **Invariants:**
   - total mechanical energy, with the drive's work and gravity's work counted, never rises by more than
     `ENERGY_TOLERANCE` over the impact (pre-flight measured no rise at all, so 1e-9 covers rounding only);
   - momentum conserved apart from the turf's, the drive's and gravity's impulses;
   - normal forces ≥ 0; friction inside its cone;
   - mirror symmetry bit-exact for setups mirrored across the strike line (sign flips are exact in IEEE arithmetic);
   - bit-identical repeat runs.
3. **Convergence:** halving `dt` moves every scenario's handover velocity and spin by less than
   `CONVERGENCE_TOLERANCE` (3e-3 of the head speed: twice the worst scenario, 1.5e-3). Random strokes converge
   first-order but more slowly (pre-flight: 17 of 200 fuzz strokes above 3e-3, worst 1.06e-2, halving with each
   halving of `dt`). They are recorded for P2b.2 and P5, not gated: halving `dt` would double the impact's cost.
4. **Handover:** airborne, on-turf and residual-overlap cases are accepted by `simulateFreeMotion`.
5. **Validation:** each rejection of §3 throws `RangeError`.
6. **Fuzz:** random strike positions, speeds, angles and drive profiles within pre-flight's ranges; no hang; no
   `impact-cap`; peak penetrations under `PENETRATION_BOUND` (0.2·R; pre-flight worst 6.0 mm, the turf). A draw
   whose checking drive could stop the head short of the ball (a whiff, which only the cap ends) is drawn again.
7. **Phase 2 unchanged:** shot mix and `SLOW_TESTS` reproduce exactly after §7.

## 10. Pre-flight

As for P2a.2: the plan is executed literally in a scratch worktree before implementation, to fix `dt`,
`CONVERGENCE_TOLERANCE`, `ENERGY_TOLERANCE`, `RELEASE_STEPS`, `IMPACT_CAP`, `PENETRATION_BOUND`, `ζ_max` and the
fuzz input ranges; confirm both branches of the clamped restitution relation; and run `scripts/impactProbe.ts` once.
Findings are folded into this document and the plan before the real run. (Done 2026-10-03: see the "Amended
2026-10-03 (pre-flight)" note and the plan's Pre-flight table.)

## 11. Deferred

| Item | How P2b.1 keeps it open |
|---|---|
| Three- and four-ball cannons, including near a hoop or the peg | N-body pair list (§4); required in the final implementation |
| Ball–upright and ball–peg contact in the impact | A further pair type in the same list; until then a ball touching an obstacle is rejected (§3) |
| Mallet–turf contact (a grounded head) | Detected and flagged (`impact-mallet-grounded`) |
| Hampered and edge strokes (contact off the face disc) | Flagged (`impact-off-face`) |
| A second strike (double tap) | Flagged (`impact-head-approaching`) |
| Per-contact open/close events | P2b.2 decides with `ShotResult` |
| Other face materials; end-weighted heads | P2b.2, with profile defaults |
| Hertzian contact for hard pairs | Contact law isolated per pair |
| Turf properties changing within one impact (surface boundary) | Sampled once per ball; piecewise regions per product spec §2 |
| Lawn drying through a match; lawn speed → turf stiffness/restitution | `SurfaceProps` fields and per-shot `Lawn` snapshot (§7) |
