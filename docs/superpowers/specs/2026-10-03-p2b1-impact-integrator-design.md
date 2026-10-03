# P2b.1 — Impact Integrator: Design

**Product spec:** `2026-09-30-croquet-shot-lab-design.md` §3 (`ContactState`), §4 (output of the swing model), §5
("Phase 1 — Impact"), §9 and §11. That spec fixes the behaviour; this document fixes how the engine delivers it.
**Roadmap:** P2 row. P2b is split: **P2b.1** (this document) is the impact integrator alone, driven by hand-built
`ContactState`s; **P2b.2** adds the swing model, the coaching and profile reference data, `simulateShot(setup)` and
the stroke-level exit criteria.

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
6. The fuzz (§9.8) never hangs, never reaches `IMPACT_CAP` on realistic inputs, and keeps penetration bounded.

Recorded, not gated (roadmap "P2b.1 outcomes carried forward", for P2b.2):

- The stiffness sensitivity sweep (§9.5).
- The stop-shot probe (§9.6): whether the striker's ball clears the turf during the transfer and meets the
  croqueted ball above its equator. The formal stop-shot-lift criterion belongs to P2b.2, which owns the drive
  profile.
- Impact engine time per stroke, for P5's budget.

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
`atan2` from `math/elementary.ts`).

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
    /** Head centre of mass, orientation (unit quaternion body → world), velocities, at t = 0. */
    position: Vec3;
    orientation: Quaternion;
    velocity: Vec3;
    angularVelocity: Vec3;
    /** Samples in increasing t, from 0 to the end of the drive window; zero force after the last. */
    drive: readonly DriveSample[];
}

function simulateImpact(contact: ContactState, balls: BallStates, world: World): ImpactResult;
```

The drive is the total force the hands apply to the head, excluding gravity; gravity acts on the head separately.
Supporting the head's weight is therefore part of the drive (the swing model's job in P2b.2; hand-built profiles in
P2b.1 tests include it explicitly).

`ImpactResult` holds each ball's final `BallState`, the head's final state, the impact `duration`, the impact's
events (`contact-open` and `contact-close` for each pair, `turf-lift` for a ball leaving the turf, and the
diagnostics `impact-cap`, `impact-mallet-grounded` and `impact-off-face`), the peak penetration per pair, and the step
count. Impact events stay in `ImpactResult`; how they join `ShotResult` is P2b.2's decision with `simulateShot`.

Wiring into `simulateShot` is P2b.2's. P2b.1 adds a test helper that chains `simulateImpact` → handover →
`simulateFreeMotion`.

## 4. Contact model

**Pairs.** Face–ball, ball–ball and ball–turf. Every contact is one entry in a single list of pairs, iterated in a
fixed order (face–ball, then ball–ball, then ball–turf, each in `BALL_IDS` order), so three- and four-ball cannons
need no restructuring. Ball–obstacle (upright, peg) is a further pair type, deferred (§11).

**Normal force.** For penetration `δ > 0` and closing rate `δ̇`, `N = max(0, k·δ + c·δ̇)`. Clamping at zero means a
contact never pulls; it releases when the force reaches zero, before `δ` returns to zero. For a linear system the
release condition is scale-invariant, so the restitution of the clamped law is still independent of speed. The
damping ratio `ζ` that gives the sourced `e` solves the clamped relation (Schwager & Pöschel, "Coefficient of
restitution and linear–dashpot model revisited", Granular Matter 9, 2007):

```
ln e = −(ζ / √(1 − ζ²)) · (π − atan2(2ζ√(1 − ζ²), 1 − 2ζ²))      (ζ < 1/√2)
```

solved by bisection once per pair, at world or contact-state construction. The pre-flight confirms the relation
numerically before the plan depends on it; the analytic test (§9.1) pins it.

**Stiffness from a contact duration.** The sourced quantity is a contact duration `T` (or, for turf, a deformation
that gives one; §8). For the clamped law `T = (π − atan2(2ζ√(1 − ζ²), 1 − 2ζ²)) / ω_d` with `ω_d = ω₀√(1 − ζ²)`, so
`k = m_eff·ω₀²` and `c = 2ζ·m_eff·ω₀`. `m_eff` is the pair's reduced mass from translational masses (ball–turf: the
ball's mass; face–ball: head and ball). The sourced `e` is therefore exact for central collisions, which is how
restitution is defined and measured; off-centre face contacts, where the head's rotation changes the effective mass,
are approximate.

**Tangential force (Cundall–Strack).** Each closed contact stores a tangential elastic displacement `ξ`. Per step
`ξ += v_t·dt`, re-projected onto the current tangent plane; the trial force `F_t = −k_t·ξ − c_t·v_t`, with
`k_t = (2/7)·k` (Silbert et al. 2001) and `c_t` from the same `ζ`. If `|F_t| > μ·N` the contact slides:
`F_t` is scaled to `μ·N` and `ξ` is reset to the value consistent with it. `ξ` is cleared when the contact opens.
Sticking is true sticking, with no creep.

**Geometry.**

- Face–ball: the ball's signed distance to a face plane; the contact point is the ball's nearest point. If that point
  lies outside the face disc, the contact is not formed and `impact-off-face` is raised; the result is then outside
  the model, as a jump flag is in phase 2 (hampered and edge strokes are deferred).
- Ball–ball: centre distance against `2R`.
- Ball–turf: `δ = R − z`, unilateral; the turf is immovable. Turf properties come from `lawn.surfaceAt` (§7).

Rolling resistance is omitted during the impact (0.065·g over 5 ms is about 3 mm/s).

## 5. Integration

Semi-implicit Euler at a fixed `dt`: forces from the current state; velocities, then positions, from them. The head's
orientation is a unit quaternion advanced by its angular velocity and renormalised with `√` each step; angular
velocity follows Euler's equations in the body frame.

- **Step.** `dt` is a constant of the engine version, set at about 1/100 of the shortest sourced contact duration and
  confirmed by the convergence test. It does not adapt to inputs, which keeps the step count, and so results,
  identical across runs.
- **Order.** Bodies in fixed order (head, then balls in `BALL_IDS` order); contacts in the order of §4. Forces are
  summed in that order.
- **Initial state.** Balls at rest start at their static turf sink `mg/k_turf`, with zero velocity, so the impact does
  not open with a spurious bounce. Touching balls start at zero overlap.
- **Termination.** When the drive window has closed and no face–ball or ball–ball contact has been closed for
  `RELEASE_STEPS` consecutive steps. Turf contact does not count.
- **Cap.** `IMPACT_CAP` (initially 50 ms, set by pre-flight) ends the impact with an `impact-cap` event rather than
  hanging.
- **Grounded head.** If any point of the head goes below the turf plane, `impact-mallet-grounded` is raised once.
  Mallet–turf contact is not modelled.

## 6. Handover

Per product spec §5: a ball clear of the turf is handed over airborne as it is. A ball still in turf contact is
placed on the lawn (`z = R`); it keeps an upward vertical velocity above the settle speed, and so starts airborne;
otherwise its vertical velocity is zeroed. The stored elastic energy of the residual sink is discarded (negligible:
`mg·δ₀/2`). Positions are as at the end of the impact; phase 2's time starts at zero there.

## 7. Turf and lawn conditions

Turf properties vary over the lawn and, later, through a match as the lawn dries. None is a module constant:

- `SurfaceProps` gains `turfStiffness` (N/m) and `turfRestitution`, beside `slidingFriction` and
  `rollingResistance`. The impact samples `lawn.surfaceAt` once per ball at its start (a ball moves millimetres in
  the impact); crossing a surface boundary within an impact is deferred (§11).
- `World.ballTurfRestitution` is removed; `turfAt` (world.ts) and phase 2's landing read
  `surfaceAt(position).turfRestitution`. On a uniform lawn the value is unchanged, so phase 2 is bit-identical
  (exit criterion 5).
- A shot uses one `Lawn` snapshot, built by the caller from the lawn conditions (`ShotSetup.lawn`). Drying through a
  match changes how that snapshot is built, not the engine. Mapping lawn speed or moisture to turf stiffness and
  restitution is not sourced and is not modelled in P2b.1; the fields make it possible.

`ENGINE_VERSION` moves to 0.4.0.

## 8. Reference data

Each value in the existing `reference/*.json` form (value, unit, bounds, source, provenance: direct, derived or
analogue). Sourcing is the plan's first task; a value with no source is labelled analogue with wide bounds, never
invented.

| File · value | Likely source | Note |
|---|---|---|
| `contact.json` · ball–turf deformation or contact time | Derived from Gugan's transient hollow (about 50 mm across at about 5 m/s → `δ` ≈ 7.4 mm → `k` ≈ 2×10⁵ N/m, about 4.6 ms), cross-checked against his video timings ("The Physics of Croquet Strokes", oxfordcroquet.org/tech/gugan4/) | Feeds the default lawn's `turfStiffness`; expected to dominate lift |
| `contact.json` · ball–ball contact time | Gugan's DVD analysis if it resolves it; otherwise billiard balls (about 0.2 ms) as analogue | Sets `dt` |
| `contact.json` · face–ball contact time | Hall, "When a Mallet Strikes a Ball"; Gugan | |
| `contact.json` · `k_t/k` | Silbert et al. 2001 (DEM) | 2/7 |
| `mallet.json` · face restitution and friction per face material | Gugan Table I (ball on wood 0.817); Gugan's face friction ≈ 0.5; manufacturers for plastic and composite faces | Product spec §11 |
| `mallet.json` · a typical head: mass, length, radius, socket position, centred and end-weighted inertia | Manufacturers' specifications; Hall | For P2b.1's hand-built tests; profile defaults are P2b.2's |

Turf friction stays the sourced `ballTurfSliding` (0.48, bounds to 1.0, which already covers Gugan's estimate for a
ball pressed into the turf); P2b.2's calibration may move within the bounds.

## 9. Testing

1. **Analytic cases**, each isolating one mechanism with overrides:
   - one contact of each pair: contact time and restitution match the clamped closed form;
   - two balls head-on with no turf exchange velocities per `e`;
   - a ball dropped on the turf rebounds at `turfRestitution`;
   - a ball held on an inclined face sticks below `tan θ = μ` and slips above it;
   - a centre strike, chained into phase 2, rolls at 5/7 of launch speed (product spec §9, now fed by a real impact);
   - a socket force rotates the head with the sign and size torque predicts over a short window.
2. **Invariants:** energy never increases (the drive's work counted as input); momentum conserved apart from the
   turf's and the drive's impulses; normal forces ≥ 0; friction inside its cone; mirror symmetry; bit-identical
   repeat runs.
3. **Convergence:** halving `dt` moves every handover velocity by less than `CONVERGENCE_TOLERANCE` (about 0.5 %,
   fixed by pre-flight measurement).
4. **Handover:** airborne and on-turf cases are accepted by `simulateFreeMotion`; one airborne case lands and
   settles.
5. **Stiffness sensitivity:** each stiffness swept across its bounds; handover changes recorded. Expected: the hard
   pairs barely matter (with `e` exact), the turf dominates lift.
6. **Stop-shot probe:** one plausible hand-built stop-shot `ContactState` (head level or slightly descending,
   checked drive); turf clearance and contact height recorded.
7. **Phase 2 unchanged:** shot mix and `SLOW_TESTS` reproduce exactly after §7.
8. **Fuzz:** random strike positions, speeds, angles and drive profiles; no hang; `impact-cap` never on realistic
   inputs; penetration bounded.

Impact engine time per stroke is measured and recorded for P5.

## 10. Pre-flight

As for P2a.2: the plan is executed literally in a scratch worktree before implementation, to fix `dt`,
`CONVERGENCE_TOLERANCE`, `RELEASE_STEPS` and `IMPACT_CAP`, confirm the clamped restitution relation, and run the
stop-shot probe and sensitivity sweep once. Findings are folded into this document and the plan before the real run.

## 11. Deferred

| Item | How P2b.1 keeps it open |
|---|---|
| Three- and four-ball cannons, including near a hoop or the peg | N-body pair list (§4); required in the final implementation |
| Ball–upright and ball–peg contact in the impact | A further pair type in the same list |
| Mallet–turf contact (a grounded head) | Detected and flagged (`impact-mallet-grounded`) |
| Hampered and edge strokes (contact off the face disc) | Flagged (`impact-off-face`) |
| Hertzian contact for hard pairs | Contact law isolated per pair |
| Turf properties changing within one impact (surface boundary) | Sampled once per ball; piecewise regions per product spec §2 |
| Lawn drying through a match; lawn speed → turf stiffness/restitution | `SurfaceProps` fields and per-shot `Lawn` snapshot (§7) |
