# P2b.2b.2b.2a — The Strike and the Turf: Design

**Product spec:** `2026-09-30-croquet-shot-lab-design.md` §4 (impact phase), §5 (phase 2).
**Impact spec:** `2026-10-03-p2b1-impact-integrator-design.md` (§4 the contact law, §5 the integrator).
**Stance spec:** `2026-10-08-p2b2b2b1-hands-stance-design.md` (the rolls' leans; its amendments).
**Roadmap:** P2 row; "P2b.2b.2b decisions and findings (2026-10-08)", including "The roll as played", "Sources for
P2b.2b.2b.2 and P2b.2b.2b.3" and "The model's roll against the roll as played".

**Why this split** (user decision, 2026-10-09). P2b.2b.2b.2 is split into three steps, each with its own spec, plan
and PR, landing in this order before P2b.2b.2b.3:

- **P2b.2b.2b.2a** (this document): the contact laws. A Hertzian face–ball law with Gugan's measured e(U) and T(U),
  and the ball–turf law under load: a bed that is slow to recover, so that the ball runs along a transient pit and
  the restitution falls with speed. The same bed takes the balls' landings in phase 2.
- **P2b.2b.2b.2b:** the roll's stroke. The rolls' descent through contact (reopening P2b.2b.2a's "hands arrive with no
  vertical velocity") and the hand's part in the second contact, to the roll as played: the angle held and never
  beyond 45°, the head behind the ball, the hands releasing rather than braking, the mallet arcing back through
  vertical.
- **P2b.2b.2b.2c:** the mallet. The square head as a new collider shape, the end-weighted head (Russ: 33–172 kg·cm²
  about the shaft against the engine's solid cylinder's 47) and the market's dimensions.

The laws come first because the diagnosis implicates them first (roadmap, "The diagnosis"); the stroke is then
fixed on the new laws, and the mallet, secondary in the diagnosis, last.

**Circularity.** The laws are fitted only to material measurements (restitution, contact time, penetration). Nothing
is tuned to a coaching ratio or to the user's play data. "The roll as played" is P2b.2b.2b.2b's behavioural target,
not this step's. The user's observation that a bounce or bobble reduces a ball's spin ("not absolute, but an
observable effect", 2026-10-09) is recorded against the model's landings (§6), not built in.

**Decisions** (user, 2026-10-09): the face law's coefficients set at each closure (over a material Kuwabara–Kono law
and over a linear law set at closure); the bed of recovering cells as a field (over Penner's tilted plane, a single
imprint and an elasto-plastic turf); the speed dependence from the bed's recovery (over imposing Penner's e(v)); Hall's
sliding friction with Gugan's µ ≈ 1.0 held out (over a depth- or load-dependent friction); phase 2's landings on the
same bed, integrated, so that a slanted landing meets the pit and the ramp (over the constant 0.5 and over a table of
the bed's vertical e(v)).

## 1. Goal and exit criteria

The face–ball contact reproduces Gugan's measured speed dependence of restitution and contact time on wood. The
ball–turf contact is a bed of cells that the ball presses down and that recovers at a finite rate, so that a ball
driven into the lawn rolls along its own transient pit, meets the pit's leading wall as a ramp, and loses more energy
the faster it strikes. A ball landing in phase 2 meets the same bed. No stroke or hand behaviour changes.

Exit criteria:

1. The analytic cases of §5.1 hold.
2. Phase 2 is unchanged but for its landings (§4.7): the P1 and P2a digests and tests with no landing are
   bit-identical; those with a landing move and are re-recorded. Every `scripts/impactDigest.ts` case has its balls
   on the turf (`impactDigest.ts` places them so), so every case moves and the digest is re-recorded.
3. Every preset's canonical setup meets P2b.2b.2b.1's exit criterion 4: `simulateShot` with `trajectory: true` from top
   to finish with no `RangeError`, no re-entry guard hit, no ball centre more than 5 mm above R, no `follow-cap`, the
   trajectory continuous at every boundary.
4. The held-out checks (§3.1, §4.5) and the figures of §6 are recorded in the roadmap. They are observations, not
   gates.
5. `ENGINE_VERSION` is "0.9.0".

## 2. Architecture

```
src/engine/math/elementary.ts        new exp (exact operations, as ln); pow for positive bases from ln and exp
src/engine/impact/contactLaw.ts      the Hertzian face law: its table, closure solve and force (§3)
src/engine/impact/turfBed.ts         new: the bed's cells, their step, the resultant on a ball, its static sink (§4)
src/engine/impact/landing.ts         new: a phase-2 landing as one ball on a fresh bed (§4.7)
src/engine/impact/contacts.ts        the ball–turf pair reads the bed instead of the plane
src/engine/impact/integrate.ts       face–ball pairs carry their closure law; ball–turf pairs step the bed; the end
                                     rule and the lift event on the bed (§4.6)
src/engine/impact/simulateImpact.ts  the bed's static sink replaces m·g/turfStiffness; the new flag; validation
src/engine/impact/types.ts           FaceMaterial loses restitution and contactTime; the face and bed law types; the
                                     flag impact-turf-pit
src/engine/swing/buildContact.ts     places the striker's ball at the bed's static sink
src/engine/resolve.ts                a landing runs landing.ts instead of the restitution impulse
src/engine/types.ts, world.ts        SurfaceProps gains bedModulus and bedRecovery, validated
src/engine/simulate.ts               ENGINE_VERSION 0.9.0
reference/contact.json               faceRestitutionFit, faceContactTimeFit, bedModulus, bedRecovery
reference/mallet.json                faceRestitution's note: a check, no longer read by the engine
reference/friction.json              ballTurfSliding's note: Gugan's µ ≈ 1.0 is now a held-out check (§4.3)
scripts/turfFit.ts                   new: fits bedModulus and bedRecovery (§4.4)
scripts/strokeProbe.ts, swingProbe.ts, shotMix.ts, impactDigest.ts, impactProbe.ts   updated for the face's new
                                     inputs, re-run and re-recorded
```

Unchanged: ball–ball and ball–obstacle pairs stay on the linear law (§3.6); the head–turf pair stays on the plane
law with `turfStiffness` and `turfRestitution`, now used by it alone (P2b.2b.2b.3's); phase 2's flat turf between
landings. Everything stays under the determinism lint (`+ − × ÷ √` and the engine's elementary functions).

## 3. The face–ball law

### 3.1 Sources

Gugan, Am. J. Phys. 68, 920 (2000), DOI 10.1119/1.1285850 (https://oxfordcroquet.org/tech/gugan/), a ball on a
wooden face:

- restitution: 1 − e² = 0.213 + 0.077·U^0.4, so e falls from 0.854 at 0.5 m/s to 0.793 at 6 m/s; it agrees with Gugan 1
  Table I (85.7 at 0.50 m/s to 79.5 at 6.01 m/s, `mallet.json` `faceRestitution`);
- contact time: T falls from 0.97 to 0.79 ms over 2.19–5.50 m/s, T ∝ U^−0.23. Hertz predicts U^−0.2.

Both fits enter `contact.json` as `faceRestitutionFit` and `faceContactTimeFit`, with their sources, ranges and the
power-law form T(U) = 0.97 ms·(U / 2.19 m/s)^−0.23. `mallet.json`'s `faceRestitution` (0.817) and `contact.json`'s
`faceBallContactTime` (0.8 ms) stay as the fits' values near 2.83 m/s, labelled as checks; the engine no longer reads
them. Held out: Hall's longer contacts on slow strokes (1.3–2.9 ms on a 0.6 m stroke; `faceBallContactTime`'s note).

### 3.2 The force

F = k·δ^{3/2} + c·√δ·δ′, clamped at zero so it never pulls (Kuwabara and Kono 1987; Brilliantov et al. 1996). δ is
the penetration and δ′ its rate, positive closing. The force rises from zero at touch with no step, which a plain
dashpot on a Hertzian spring would give. The law applies to every region of the head a ball can touch (face, rim,
barrel, back-rim, back; `contacts.ts` `headBallContact`), as the linear law does today.

### 3.3 Closure

A face–ball pair closes when δ first becomes positive. Its closing speed U along the normal (the face point's velocity
relative to the ball's, as the pair's rate) fixes the contact's coefficients:

- c is set so that the clamped law's central collision has the fit's e(U);
- k is then set so that it lasts the fit's T(U);
- both with the pair's reduced mass, as now (`simulateImpact.ts` `faceMass`).

k and c hold until the pair opens (δ ≤ 0). A re-touch is a new closure with its own U. U is clamped to [0.5, 6.0]
m/s, the range of Gugan's measured e; the T fit is extrapolated as its power law over that range (1.36 ms at 0.5 m/s,
0.77 ms at 6 m/s). A slow re-touch in a roll's carry takes the 0.5 m/s law.

### 3.4 The table

Scaled by the reduced mass m, k and U, the law has one parameter, a dimensionless damping ĉ. Its central collision's
restitution e(ĉ) and dimensionless duration τ(ĉ) (T = τ·(m/k)^{2/5}·U^{−1/5}) are integrated once at module load,
with exact operations only, on a fixed grid of ĉ, so the table is deterministic. A closure inverts e(ĉ) for ĉ by
bisection with linear interpolation between grid points, then sets k from τ(ĉ) and T(U), and c from ĉ. No closure
integrates anything. e(ĉ) is monotone decreasing; the grid's spacing and the table's integration step are chosen in
the plan to meet §5.1's table targets.

`exp` is added to `elementary.ts` (argument reduction by ln 2, as `ln` uses), with `pow(x, y) = exp(y·ln x)` for x > 0,
for U^0.4, U^−0.23, the fractional powers of §3.4 and the bed's decay. Both are tested against `Math.*` like the
existing functions.

### 3.5 Tangential

Cundall–Strack as now, but its stiffness k_t is 2/7 (`TANGENTIAL_STIFFNESS_RATIO`) of the normal's current tangent
stiffness k_n = (3/2)·k·√δ, so that it grows with the contact as Mindlin's does. Its damping keeps the linear law's
ratio to the normal's, c_t = c_n·√(k_t/k_n) with c_n = c·√δ the normal's current damping (as `pairLaw` relates them
now). Friction µ stays `faceFriction` (0.5).

### 3.6 Types

`FaceMaterial` keeps `friction` and loses `restitution` and `contactTime`: the face's restitution and duration are the
wood fits of §3.1, the only face with measured data (other faces are P3's). `validateImpact` drops their checks;
`buildContact.ts`, `swingProbe.ts` and `impactProbe.ts` stop filling them. The impact's per-pair law for the face
(`ImpactSetup.face`, built by tests in `tests/engine/support/impact.ts`) becomes a `FaceLaw`: the reduced mass, the
friction and the two fits, from which each closure's k and c follow. Ball–ball and ball–obstacle pairs keep `PairLaw`.

### 3.7 What stays linear

The ball–ball pair: Gugan 4 Table 1 gives a ball–ball contact time with no significant speed dependence (0.75 ms over
1.90–7.64 m/s), which a Hertzian law would contradict. The ball–obstacle pairs: no measurement exists (`contact.json`
`ballObstacleContactTime`). The head–turf pair: P2b.2b.2b.3's.

## 4. The turf bed

### 4.1 Cells

The turf near each ball is a sparse grid of square cells of side h = 2 mm, fixed in the ground and aligned with world
x and y, keyed by integer cell coordinates and visited in a fixed order. A cell is created when a ball's surface first
reaches its centre's column below z = 0. Each holds its surface depth w ≥ 0 (its surface at z = −w) and whether a
ball holds it. Each ball has its own cells. A ball whose surface reaches a cell another ball holds throws a
`RangeError`, as the engine's other geometric guards do: two balls are never both pressed in within 2 mm of each other
in play, and the error names the case if one ever is.

### 4.2 Each cell's law

A cell is a Kelvin–Voigt unit of area A = h²: its force on the ball is A·(k_w·w + η·w′), with the bed modulus k_w
(N/m³) and τ_r = η/k_w the bed's recovery time.

- **Held:** while the ball's surface over the cell's centre is at or below the cell's surface, the cell's surface
  follows it: w = −z_b and w′ = −dz_b/dt, with z_b the ball's lowest surface height over the cell's centre and
  dz_b/dt its total derivative at that fixed point, the ball's horizontal motion over its own curved surface included.
  On the pit's leading wall the horizontal motion is what drives w′, so it is what makes the wall's damping act.
- **Released:** when the held cell's force would be negative (the ball rising faster than w/τ_r), the cell lets go
  and recovers freely, w′ = −w/τ_r, integrated exactly over the step by `exp`. A released cell is held again when the
  ball's surface reaches it. A cell is dropped once released with w < 1 µm.

This clamp makes both the transient pit and the speed dependence. A ball moving forward meets fresh cells ahead and
leaves released cells behind that have not yet recovered. A ball rising fast lets cells go at a larger w, leaving
their energy in the ground, so e falls with impact speed. With the cells' force growing with the footprint (a sphere
on a Winkler bed, F ≈ π·R·k_w·δ² at small δ), the impact's duration shortens with speed while τ_r stays fixed, which
is why the loss grows with speed; a linear plane with a recovery lag would give the same e at every speed.

### 4.3 Direction and friction

Each held cell pushes on the ball along the sphere's inward normal at the point over the cell's centre (through the
ball's centre), with its vertical component equal to the cell's force. Cells on the pit's leading wall therefore push
back as well as up: the ramp. Forces through the centre carry no moment, so spin comes from friction alone.

The pair's friction is one Cundall–Strack spring, as now, at `slidingFriction` (Hall's 0.48), limited by µ times the
size of the resultant normal, acting where the resultant's line meets the ball's surface. Its stiffness and damping
follow §3.5's rule on the bed's current vertical tangent stiffness and damping: k_n = k_w·A·N and c_n = η·A·N over
the N held cells, k_t = (2/7)·k_n and c_t = c_n·√(k_t/k_n). With no held cell the spring is reset, as an open pair's
is now.

Gugan's µ ≈ 1.0 was derived by attributing all the ball's horizontal slowing in the pit to friction on a flat ground;
the ramp supplies part of it, so 1.0 is a held-out check (§4.5), not an input.

### 4.4 The fit

`SurfaceProps` gains `bedModulus` (k_w, N/m³) and `bedRecovery` (τ_r, s), each validated positive and finite by
`validateWorld` and `validateImpact`. The default lawn's values are fitted by `scripts/turfFit.ts` to Gugan 4 §7.1
and Table 4(b), roll A4R: a free ball, under gravity, meeting a fresh bed vertically at 5 m/s leaves it at 2.5 m/s
(e = 0.5, "a CoR for the ground of about 0.5") after a maximum penetration of 7.2 mm. The rebound speed is read when
the ball holds no cell. Two targets, two parameters; the fit is solved to 1e-4 relative on each and the results enter
`contact.json` with the derivation. No bounds are given (they are optional in `reference/README.md`); lawn presets
are P3's. An order-of-magnitude estimate for the plan: the energy balance at 7.2 mm gives k_w ≈ 3e8 N/m³.

**Low-speed pre-flight gate** (user decision, 2026-10-09). The bed's only loss is its recovery lag, which grows with
speed, so at low speed its e tends towards 1. Real thatch also loses energy at a rate-independent level: Penner's golf
turf levels off near 0.51, and no croquet measurement below 5 m/s was found (Gugan 1's bounce tests are on wood and
steel). The plan's first task after the fit therefore records the fitted bed's e over 0.1–6 m/s and the bounce counts
of a ball dropped from 0.05, 0.1 and 0.3 m until it settles. If e runs well above about 0.6 at low speed, or the bounce
counts pile up, the plan stops and brings the user the options (for example a rate-independent floor, cells unloading
stiffer than they load, with Penner's low-speed 0.51 as an analogue) before any landing result is trusted.

### 4.5 Held-out checks (recorded, not gated)

- Gugan's A2R and A3R penetrations, 4.0 and 5.0 mm, at their implied downward speeds 3.04 and 3.52 m/s (upward speeds
  1.52 and 1.76 m/s over e 0.5).
- e against impact speed from 1 to 6 m/s, compared in shape with Penner's golf fit e = 0.510 − 0.0375|v| + 0.000903v²
  (Can. J. Phys. 80, 931 (2002)).
- The apparent friction in the rolls, the horizontal over the vertical turf impulse while the striker's ball is in its
  pit, against Gugan's µ ≈ 1.0.
- The distance from first contact to maximum penetration in the rolls, against Gugan's 3.5–18 mm.

### 4.6 The bed in the impact

- **Static sink.** A ball at rest on a fresh bed sinks to δ₀ where the held cells carry its weight. `turfBed.ts`
  solves it once per surface and ball, by bisection on the cells' summed force on the grid (about 0.3 mm at
  k_w ≈ 3e8, against today's linear m·g/turfStiffness of 0.04 mm). It replaces `staticSink`: `prepareImpact` and
  `validateImpact` (`simulateImpact.ts`) and `buildContact.ts` place the balls there, and each ball starts with the
  cells under it held at that equilibrium, so it starts at rest. The stance's geometry moves by the sink's change
  (about 0.26 mm in the contact height), so `CANONICAL_CLEARANCE`, `CANONICAL_APPROACH` and the stance probe lines are
  re-recorded; the stance's own analytic cases (the round trip, the upright shaft) do not depend on the sink.
- **In the turf** means holding at least one cell. **Still bouncing** keeps today's rule with the bed's potential: a
  ball's vertical oscillation energy about δ₀, ½·m·v_z² + U(δ) − U(δ₀) − m·g·(δ − δ₀), exceeds U(δ₀), with
  U(δ) the energy stored in the held cells, Σ ½·A·k_w·w². `isBouncing` (`integrate.ts`) takes this form.
- **The lift event** (`turf-lift`) fires when a ball that held cells holds none, rising.
- **At the impact's end** the bed is dropped and phase 2 starts as today. If a ball's surface is then more than 1 mm
  below z = 0 over any cell it holds, the outcome carries the new flag `impact-turf-pit`, an outcome flag like
  `impact-off-face` (recorded, not gated).
- **The head** does not press the bed. The head–turf pair keeps the plane law (P2b.2b.2b.3).
- **Stability.** The explicit step is 5 µs. The bed's total damping at the A4R footprint is of order η·π·2Rδ ≈ 1.3e3
  N·s/m at τ_r = 2 ms, giving 2m/c ≈ 0.7 ms, two orders above the step. The plan checks this against the fitted τ_r.

### 4.7 Landings in phase 2

A ball landing in phase 2 meets the same bed (user decision, 2026-10-09), so a slanted landing meets the pit and the
ramp, and its spin changes by the bed's friction, not by an impulse.

- **The landing.** Where `resolve.ts` now applies the restitution impulse Λ = (1 + e)·m·|v_z| with impulsive friction,
  `landing.ts` runs the ball alone, under gravity, on a fresh bed anchored where it lands, at the impact's 5 µs step,
  with its velocity and spin. It ends when the ball holds no cell and rises (it leaves), or when it stops bouncing by
  §4.6's rule (it settles: its vertical velocity and depth are set to rest on the flat turf, its horizontal velocity
  and spin kept).
- **Phase 2's clock.** The landing's outcome (velocity and spin) is applied at the landing instant, as the impulse is
  now. The contact's few milliseconds and millimetres of travel are not carried into phase 2's clock or position, so
  phase 2's event order is unchanged. This is a simplification, recorded; the per-landing duration and travel are
  probe figures (§6).
- **Settling.** `SETTLE_SPEED` keeps its role: a ball leaving slower than it stays on the turf. The bed's e rises at
  low speed, so a small hop may take more bounces to settle than at the constant 0.5; each landing's e is below 1, so
  the run stays finite. The bounce counts are recorded (§6); should one prove excessive, the plan raises it with the
  user rather than adding a cut-off.
- **Cost.** Each landing costs its contact's steps over the cells under it, about 1–5 ms of contact. The shot mix's
  work units count them.

## 5. Testing

### 5.1 Analytic cases

- **Elementary:** `exp` and `pow` against `Math.*` to a few ulps over the ranges used.
- **Face law:**
  - the table against a direct fine integration of the dimensionless law at U = 0.5, 2.19, 2.83, 4.0, 5.5 and
    6.0 m/s: e within 1e-4 of the fit and T within 0.1 %;
  - through the integrator at dt = 1e-7 s (as `analytic.test.ts`'s FINE), a ball on a free face at those speeds: e
    within 3e-4 and T within 0.3 % of the fit; the same at the impact's 5 µs step is recorded, not gated;
  - a closure below 0.5 m/s, or above 6 m/s, takes the clamped speed's law;
  - the force never pulls;
  - a re-touch after opening sets new k and c from its own U;
  - the table's inversion round-trips: ĉ → e → ĉ within the bisection's resolution;
  - k_t equals (2/7)·(3/2)·k·√δ at every step of a contact.
- **Bed:**
  - a sphere pressed slowly into a fresh bed: the force matches the Winkler closed form within 1 % at δ ≤ 2 mm;
  - the static sink: a ball placed at δ₀ with its cells held stays within 1 µm of it for 50 ms;
  - a single released cell recovers as w₀·exp(−t/τ_r) within 1e-12 relative;
  - a free vertical impact at 5 m/s gives e = 0.5 and 7.2 mm within the fit's tolerance;
  - e falls monotonically over 1–6 m/s;
  - grid convergence: h = 1 mm and h = 2 mm agree within 1 % on e and on the maximum penetration at 2, 5 and 6 m/s;
  - a ball rolling without slipping across a fresh bed under its own weight: the ramp's horizontal force opposes the
    motion;
  - a ball sliding horizontally on a held bed slides at Hall's µ against the resultant normal;
  - a ball whose surface reaches a cell another ball holds throws a `RangeError`.
- **Landings:**
  - a vertical landing at 5 m/s with no spin leaves at e = 0.5 within the fit's tolerance;
  - a landing with no spin and no horizontal speed gains none;
  - a landing slower than the settling threshold ends at rest on the turf, with its horizontal velocity and spin kept;
  - a slanted landing loses horizontal speed to the ramp and friction, and its spin moves towards rolling at its new
    speed (direction asserted, size recorded).
- **Integration:** `impact-turf-pit` is raised by a set-up that ends with a ball in a deep pit and not otherwise;
  the lift event fires when a ball leaves its last cell.

### 5.2 Bit-identity and migration

- P1 and P2a: every digest and test without a landing bit-identical. Those with a landing (P2a.1's landing,
  bouncing-settle and hopping cases, its brute-force cross-check) move: their analytic expectations are restated for
  the bed and their figures re-recorded.
- `scripts/impactDigest.ts`: every case moves (its balls are on the turf); the digest is re-recorded.
- Force-table and analytic tests that pin the old linear face law or the plane turf for balls (P2b.1, P2b.2a and
  P2b.2b.1 tests) are re-baselined with the new figures, each with a comment naming this step. Their analytic intent
  (restitution, contact time, sticking, the 5/7 roll) moves to §5.1's cases where the old law's closed form no longer
  applies. Ball–ball and ball–obstacle analytic cases are unchanged.
- The shadow-energy and invariant tests (`shadowEnergy.test.ts`, `invariants.test.ts`) keep their momentum
  invariants. The shadow energy gains the face's Hertzian potential, (2/5)·k·δ^{5/2}, and the bed's stored energy
  Σ ½·A·k_w·w² over its cells (held and released), the released cells' recovery counted as loss.
- The stance's figures that depend on the sink (`CANONICAL_CLEARANCE`, `CANONICAL_APPROACH`) are re-recorded (§4.6);
  those that depend only on geometry are unchanged.

## 6. Probe (recorded in the roadmap)

The "before" figures are P2b.2b.2b.1's, already recorded in `docs/superpowers/probes/2026-10-08-p2b2b2b1-*.txt`
(nothing under `src/` or `scripts/` has changed since). `shotMix.ts` (with its new landing counts) and
`impactDigest.ts` are run on `main` before. After, `strokeProbe.ts`, `swingProbe.ts`, `shotMix.ts` and
`impactDigest.ts` are run on the branch, the raw output saved as `docs/superpowers/probes/2026-10-09-p2b2b2b2a-*.txt`.
Recorded:

- each preset's ratios over 2, 2.5, 3, 3.5 and 4 m/s, and its face intervals (the re-catches);
- the rolls' canonical runs as in P2b.2b.2b.1's outcomes (clearance, impact and finish times, the highest ball
  centre, braking hands, `impact-off-face`, entry jumps, the late re-hit's crossings);
- the full roll at 2 m/s against "the roll as played": the pitch's drift through the contact, the head's distance
  behind the striker's ball, the hands' braking at the end of the reach and what it costs the striker's ball, as a
  baseline for P2b.2b.2b.2b;
- the held-out checks of §3.1 and §4.5, and the rolling ball's loss over 50 mm on a fresh bed;
- the landings: per landing in the shot mix, the duration and travel of its contact, and the ball's spin before and
  after against the user's observation that a bounce reduces spin;
- the cap and flag tallies of the `presets` sweep, `impact-turf-pit` among them;
- the shot mix's work units against P2b.2b.2b.1's (p99 143,084, p99.9 362,050, max 408,030), the bed's and the
  landings' shares, and the bounce counts before and after.

## 7. Deferred

- **P2b.2b.2b.2b:** the rolls' descent through contact; the hands holding the angle, keeping the head behind the ball,
  releasing rather than braking, the arc back through vertical. HAND_COUPLING's limits (it cannot pass 1 ms taps)
  remain until then.
- **P2b.2b.2b.2c:** the square head, end-weighting, the market's dimensions in `mallet.json`.
- **P2b.2b.2b.3:** the head in the bed, ploughing, the grip breaking.
- **Later:** a landing's duration and travel in phase 2's clock (§4.7); cells shared by two balls; a pit that outlasts
  the impact or a landing; lawn presets and the bed's bounds (P3); face materials beyond wood (P3).

## 8. Roadmap changes (in this PR)

- The P2 row: P2b.2b.2b.2 is split into 2a, 2b and 2c as above, with this spec named for 2a; the exit criteria gain
  2a's (the laws' analytic cases; the strokes and landings recorded).
- "P2b.2b.2b decisions and findings (2026-10-08)": the split and the user's decisions of 2026-10-09 listed above, and
  the user's observation on spin after a bounce.
- A new "P2b.2b.2b.2a outcomes" section with §6's figures.
- "Provisional numbers" unchanged.
