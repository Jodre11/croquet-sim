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
src/engine/simulate.ts               a landing calls landing.ts instead of resolveLanding (§4.7)
src/engine/resolve.ts                resolveLanding deleted
src/engine/impact/handover.ts        header: the residual sink is the bed's stored energy (§4.6)
src/engine/types.ts, world.ts        SurfaceProps gains bedModulus and bedRecovery, validated
src/engine/simulate.ts               ENGINE_VERSION 0.9.0; the flag landing-cap
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
restitution e(ĉ) and dimensionless duration τ(ĉ) (T = τ·(m/k)^{2/5}·U^{−1/5}) follow from integrating it. The fits are
fixed and U is clamped, so ĉ and τ depend on U alone. At module load, for each point of a fixed grid in U over
[0.5, 6] m/s, ĉ(U) is found by bisection on e(ĉ) (each trial one dimensionless integration) to the fit's e(U), and
τ(U) recorded, all with exact operations only, so the table is deterministic. A closure interpolates ĉ and τ linearly
in U, then sets k from m, τ and T(U), and c from ĉ. No closure integrates or inverts anything. The grid's spacing and
the integration step are chosen in the plan to meet §5.1's table targets.

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
`buildContact.ts`, `swingProbe.ts` and `impactProbe.ts` stop filling them. The two fits are module constants of
`contactLaw.ts`, read from `contact.json`. The impact's per-pair law for the face (`ImpactSetup.face`, built by tests
in `tests/engine/support/impact.ts`) becomes a `FaceLaw`: the reduced mass and the friction, from which each closure's
k and c follow with the table. A second face material, when P3 brings one, adds its fits as a parameter. Ball–ball
and ball–obstacle pairs keep `PairLaw`.

### 3.7 What stays linear

The ball–ball pair: Gugan 4 Table 1 gives a ball–ball contact time with no significant speed dependence (0.75 ms over
1.90–7.64 m/s), which a Hertzian law would contradict. The ball–obstacle pairs: no measurement exists (`contact.json`
`ballObstacleContactTime`). The head–turf pair: P2b.2b.2b.3's.

## 4. The turf bed

### 4.1 Cells

The turf is a sparse grid of square cells of side h = 2 mm on one world lattice: cell (i, j) is centred at
((i + ½)·h, (j + ½)·h), so the lattice is symmetric about x = 0 and y = 0. Each ball has its own sparse set of cells,
keyed by (i, j). A cell is created when the ball's surface first reaches its centre's column below z = 0. Each holds
its surface depth w ≥ 0 (its surface at z = −w) and whether the ball holds it.

**Summation order.** A ball's resultant is summed so that a set-up mirrored across y = 0 gives the mirrored result
bit for bit (`invariants.test.ts`'s exact mirroring stays): cells j and −j − 1 of the same i are added to each other
first (IEEE addition is commutative, so the pair's sum does not depend on which is which), and the pair sums are then
accumulated in ascending (i, j ≥ 0) order.

**Two balls.** Two balls that both hold cells and whose centres lie within 2R + h of each other horizontally throw a
`RangeError`, as the engine's other geometric guards do: two balls are never both pressed in that close in play, and
the error names the case if one ever is.

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
- e against impact speed: the low-speed gate's sweep over 0.1–6 m/s (§4.4) is the record, compared in shape with
  Penner's golf fit e = 0.510 − 0.0375|v| + 0.000903v² (Can. J. Phys. 80, 931 (2002)).
- The apparent friction in the rolls, the horizontal over the vertical turf impulse while the striker's ball is in its
  pit, against Gugan's µ ≈ 1.0.
- The distance from first contact to maximum penetration in the rolls, against Gugan's 3.5–18 mm.

### 4.6 The bed in the impact

- **Static sink.** A ball at rest on a fresh bed sinks to δ₀ where the held cells carry its weight. On the world
  lattice the summed force depends on the ball's offset within its cell (about 20 cells under a 0.3 mm sink), so
  `turfBed.ts` solves δ₀ for the ball's actual horizontal position, by bisection on the cells' summed force (about
  0.3 mm at k_w ≈ 3e8, against today's linear m·g/turfStiffness of 0.04 mm). The same function replaces `staticSink`
  in `prepareImpact` and `validateImpact` (`simulateImpact.ts`) and in `buildContact.ts`, each at the ball's position,
  so the validated, placed and started positions agree. Each ball starts with the cells under it held at that
  equilibrium, so it starts at rest. The stance's geometry moves by the sink's change (about 0.26 mm in the contact
  height), so `CANONICAL_CLEARANCE`, `CANONICAL_APPROACH` and the stance probe lines are re-recorded; the stance's own
  analytic cases (the round trip, the upright shaft) do not depend on the sink.
- **Depth.** A ball's depth is δ = R − z, the depth of its lowest point below the undeformed surface, whatever the
  cells under it hold.
- **In the turf** means holding at least one cell.
- **Still bouncing.** The rule keeps today's form with a fresh bed's static potential U_f(δ) (the work to press the
  ball slowly to δ into a fresh bed at its position, tabulated with the sink's solve), a function of δ alone. The
  ball's vertical oscillation energy E = ½·m·v_z² + U_f(δ) − U_f(δ₀) − m·g·(δ − δ₀) is compared with what it needs
  to reach the surface from rest at δ₀, E(0) = m·g·δ₀ − U_f(δ₀): a ball is still bouncing while E exceeds it. For the
  linear spring that threshold is ½·m·g·δ₀ = U(δ₀), today's rule (`integrate.ts` `isBouncing`); for a Winkler bed it
  is (2/3)·m·g·δ₀. A ball rolling over its own pit rides at a depth the pit sets, not δ₀; E then measures how far its
  vertical state is from rest on a fresh bed, which is what ends the impact. §5.1 checks that a ball rolling at 1–5
  m/s on the bed is classified not bouncing; should it not be, the plan stops and raises it.
- **The lift event** (`turf-lift`) fires once per ball, as now (`lifted`), the first time a ball that held cells holds
  none while rising.
- **At the impact's end** the bed is dropped and phase 2 starts. `handover.ts` is unchanged in behaviour: a ball below
  R is placed at R, keeping an upward velocity of at least `SETTLE_SPEED` and otherwise losing its vertical velocity.
  Its header's "residual sink m·g·δ₀/2" becomes the bed's stored energy at δ₀, U_f(δ₀), discarded as before. If a
  ball's surface is then more than 1 mm below z = 0 over any cell it holds, the outcome carries the new flag
  `impact-turf-pit`, an outcome flag like `impact-off-face` (recorded, not gated).
- **Probe and validation.** In the impact's probe the bed pair appears as one contact per ball, as the plane did: its
  normal the resultant's direction, its normal force the resultant's size, its tangential force the friction spring's
  and its friction µ (`invariants.test.ts` reads these). `validateImpact` stops checking `turfStiffness` and
  `turfRestitution` at each ball (no ball law reads them) and checks `bedModulus` and `bedRecovery` instead; it keeps
  checking them under the head.
- **The head** does not press the bed. The head–turf pair keeps the plane law (P2b.2b.2b.3).
- **Stability.** The explicit step is 5 µs. The bed's total damping at the A4R footprint is of order η·π·2Rδ ≈ 1.3e3
  N·s/m at τ_r = 2 ms, giving 2m/c ≈ 0.7 ms, two orders above the step. The plan checks this against the fitted τ_r.

### 4.7 Landings in phase 2

A ball landing in phase 2 meets the same bed (user decision, 2026-10-09), so a slanted landing meets the pit and the
ramp, and its spin changes by the bed's friction, not by an impulse.

- **The landing.** Where `simulate.ts` now calls `resolveLanding` (`resolve.ts`) for the restitution impulse
  Λ = (1 + e)·m·|v_z| with impulsive friction, it calls `landing.ts` instead, which runs the ball alone, under gravity,
  on a fresh bed on the world lattice (§4.1), at the impact's 5 µs step, from touchdown (z = R) with its velocity and
  spin. It ends when the ball holds no cell and rises (it leaves), or when it stops bouncing by §4.6's rule (it
  settles: its vertical velocity and depth are set to rest on the flat turf, its horizontal velocity and spin kept).
  `resolveLanding` is deleted, and with it phase 2's only read of `turfRestitution`: `turfAt` keeps the friction alone.
- **Cap.** A landing that has neither left nor settled after 50 ms (ten times the longest bed contact the fit implies)
  is settled as above and the outcome carries the new flag `landing-cap`, recorded like the impact's `impact-cap`, so
  a pathology surfaces without aborting a sweep.
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
  - at a single step of a closed contact, k_t equals (2/7)·(3/2)·k·√δ.
- **Bed:**
  - a sphere pressed slowly into a fresh bed: the force matches the Winkler closed form within 1 % at δ ≤ 2 mm;
  - the static sink: a ball placed at δ₀ with its cells held stays within 1 µm of it for 50 ms, at a cell centre and
    at an offset of h/3 in x and y;
  - the bouncing threshold: on a Winkler bed in the continuum limit, E(0) = m·g·δ₀ − U_f(δ₀) equals (2/3)·m·g·δ₀
    within 1 %; a ball released from rest just below the threshold's height stays in the turf and one just above
    lifts;
  - a ball rolling at 1, 3 and 5 m/s across a fresh bed is classified not bouncing within 20 ms of its first contact;
  - a single released cell recovers as w₀·exp(−t/τ_r) within 1e-12 relative;
  - a free vertical impact at 5 m/s gives e = 0.5 and 7.2 mm within the fit's tolerance;
  - e falls monotonically over 1–6 m/s;
  - grid convergence: h = 1 mm and h = 2 mm agree within 1 % on e and on the maximum penetration at 2, 5 and 6 m/s;
  - a ball rolling without slipping across a fresh bed under its own weight: the ramp's horizontal force opposes the
    motion;
  - a ball sliding horizontally on a held bed slides at Hall's µ against the resultant normal;
  - two balls both holding cells within 2R + h of each other throw a `RangeError`;
  - a ball on the bed mirrored across y = 0 gives the exactly mirrored resultant.
- **Landings:**
  - a vertical landing at 5 m/s with no spin leaves at e = 0.5 within the fit's tolerance;
  - a landing with no spin and no horizontal speed gains none;
  - a landing slower than the settling threshold ends at rest on the turf, with its horizontal velocity and spin kept;
  - a slanted landing loses horizontal speed to the ramp and friction, and its spin moves towards rolling at its new
    speed (direction asserted, size recorded);
  - a landing forced past 50 ms (by a test-only cap of a few steps) settles and raises `landing-cap`.
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
  invariants, and the exact mirroring across the strike line (§4.1's summation order). The shadow energy gains the
  face's Hertzian potential, (2/5)·k·δ^{5/2}, and the bed's stored energy
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
- the cap and flag tallies of the `presets` sweep and the shot mix, `impact-turf-pit` and `landing-cap` among them;
- the shot mix's work units against P2b.2b.2b.1's (p99 143,084, p99.9 362,050, max 408,030), the bed's and the
  landings' shares, and the bounce counts before and after.

## 7. Deferred

- **P2b.2b.2b.2b:** the rolls' descent through contact; the hands holding the angle, keeping the head behind the ball,
  releasing rather than braking, the arc back through vertical. HAND_COUPLING's limits (it cannot pass 1 ms taps)
  remain until then.
- **P2b.2b.2b.2c:** the square head, end-weighting, the market's dimensions in `mallet.json`.
- **P2b.2b.2b.3:** the head in the bed, ploughing, the grip breaking.
- **Later:** a landing's duration and travel in phase 2's clock (§4.7); cells shared by two balls; a pit that outlasts
  the impact or a landing; lawn presets and the bed's bounds (P3); face materials beyond wood (P3). For the lawn
  presets, the user's observation (2026-10-09): "hard dry ground is more elastic than soft grassier lawn. Slow lawns
  deform rather than bounce". In the bed's terms a hard dry lawn is stiffer (higher k_w) and recovers sooner (shorter
  τ_r), and a soft slow lawn the reverse, with more of its loss rate-independent. It is P3's qualitative check, not a
  fit target; Gugan's Bristol drop (0.15 at 6 m/s on a "typically grassed, 'hard' court") suggests the grass cover
  matters as well as the ground's firmness.

## 8. Roadmap changes (in this PR)

- The P2 row: P2b.2b.2b.2 is split into 2a, 2b and 2c as above, with this spec named for 2a; the exit criteria gain
  2a's (the laws' analytic cases; the strokes and landings recorded).
- "P2b.2b.2b decisions and findings (2026-10-08)": the split and the user's decisions of 2026-10-09 listed above, and
  the user's observation on spin after a bounce.
- A new "P2b.2b.2b.2a outcomes" section with §6's figures.
- "Provisional numbers" unchanged.

## Amendments (implementation, 2026-10-09)

The plan's decisions, the user's decisions during the run, the implementation's rulings and the behaviour the design
did not predict. The figures are in the roadmap's "P2b.2b.2b.2a outcomes (2026-10-09)".

**The plan's decisions.**

- **1. The two-ball guard is on the footprints** (§4.1; user confirmed before planning). Every croquet stroke starts
  with two touching balls on the bed, 2R apart, so a guard at 2R + h would reject every croquet stroke. The engine
  throws when two balls holding cells have centres closer horizontally than ρ_a + ρ_b + h, ρ = √(R² − z²) each
  footprint's radius. The user: "also a problem if a ball bounces in roquet / the area of actual turf contact is
  always going to be significantly smaller then the cross section of the ball".
- **2. The tangential spring keeps its force when its stiffness grows** (§3.5, §4.3). The carried ξ is scaled by
  k_before/k_now when k_t grows and kept when it shrinks, so the stored energy never rises without slip. The linear
  laws' pairs are unchanged.
- **3. A probe sample carries its stored energy** (`ContactSample.storedEnergy`: ½·k·δ², (2/5)·k·δ^{5/2} or
  Σ ½·A·k_w·w²) and a face pair's `closingSpeed`.
- **4. Fits are a new reference entry shape**, `{ form, coefficients, range, rangeUnit, source, provenance, note }`,
  read by `readFit`. The bed's fitted pair is the one impact value without bounds.
- **5. The face table is built on the first closure**, not at module load (§3.4); the numbers are the same. It builds
  in about 51 ms.
- **6. The bouncing rule is written in its reduced form**, ½·m·v_z² + U_f(δ) − m·g·δ > 0: §4.6's E > E(0) with both
  sides expanded.
- **7. The new flags are events**: `impact-turf-pit` an `ImpactEvent`, `landing-cap` a `ShotEvent`.
- **8. The shadow-energy test** drops its face case (a Hertzian spring has no exact shadow energy under semi-implicit
  Euler) and moves its turf case to a bed with zero recovery; `invariants.test.ts` carries the Hertzian and bed
  energies through `storedEnergy` (§5.2).
- **9. `TurfAt` returns the sliding friction alone**, since phase 2 no longer reads the turf's restitution (§4.7).
- **10. Phase 2 gains a landing probe**, `SimulationOptions.landings`, for the shot mix's per-landing figures and work
  counts (§6).
- **11. The low-speed gate always stops for the user** (§4.4), whatever its figures show.
- **12. The shot mix's world takes the default lawn's bed**, so its landing figures are the fitted lawn's.

**The user's decisions during the run.**

- **The lattice's sideways push** (§4.1, §5.1). The 2 mm lattice pushes a resting ball sideways with up to about
  1.4e-3 of its weight (none at a cell centre or corner; 1.2e-3 at h/6, 1.3e-3 at h/4 and 1.0e-3 at h/3 on the
  diagonal, 1.4e-3 at h/3 along x), about 70 times the planning estimate. Off-centre a resting ball rolls as
  a = F/(1.4·m): about 0.35 µm in 10 ms and 6.4 µm per axis in 50 ms. Accepted and recorded: §5.1's rest test runs
  10 ms, not 50 ms, with its 1 µm bound, and a test pins the push at no more than 1.5e-3 of the weight off-centre and
  about zero at a cell centre or corner.
- **The low-speed gate** (§4.4): accept and record. The bed keeps its two fitted parameters (k_w 1.62461e8 N/m³,
  τ_r 7.55047e-4 s). Recorded for P3's lawn presets: e 0.62–0.66 over 0.2–1 m/s, rising as the speed falls (the
  Kelvin–Voigt signature), and 0.38 at 0.1 m/s, where Penner's golf analogue rises towards 0.51; drops of 0.05, 0.1
  and 0.3 m settle in 7, 7 and 8 landings; the held-out A2R and A3R penetrations are 5.31 and 5.81 mm against Gugan's
  4.0 and 5.0 (the model's depth goes as about v^0.6 against Gugan's near-linear rise; about 4.9 and 5.5 mm if the
  model's own e converts the rebound speeds). The user observed, anecdotally, that a golf ball is smaller, lighter and
  more elastic than a croquet ball; on turf the ball's own elasticity matters little, and m/R² is about twice as high
  for croquet, so it sinks deeper and Penner's 0.51 is likely a generous analogue. A note beside the comparison, not
  a fit target.
- **The pass roll pinned in its pit** (§1: no stroke or hand behaviour changes). On the bed, the canonical pass roll's
  follow-through (the face leaning 34°, the hands slowing the head over about 60 ms) pins the striker's ball in its
  pit: it is handed over at 0.038 m/s punched and 0.088 m/s coasted (coasted was already 0.29 m/s on the Hertzian
  face alone, from the prototype's 1.099 m/s). The "punch beats coast" test is `it.fails`, owned by P2b.2b.2b.2b
  (the roll's stroke), and the roadmap records it as a model finding.
- **The probe's findings** (§6; user decision after the probe: record all five as findings, before → after):
  - the pass roll's ratio at 2, 2.5, 3, 3.5 and 4 m/s is 7.45, 11.27, 16.00, 20.47 and 29.21 (was 1.57, 1.12, 1.01,
    0.96, 0.95): its dead stop holds at every speed, not just the canonical;
  - in the pass roll's late re-hit sweep, 15 of 225 runs (all at 1 m/s) end the impact with the head overlapping blue
    (was none, on any preset), and 88 cross a ball (was 57). The overlap, 0.002–0.078 mm against a 0.43–0.44 mm
    static sink, is an artefact of the handover: the probe measures it against the handed-over ball, which the handover
    lifts 0.30–0.32 mm out of the bed's deeper pit to z = R beneath a head resting just clear of it. Against blue at the
    impact's last step the head is clear in all 15, so it is not geometric overlap inside the impact. It stays a
    validity item P2b.2b.2b.2b must close, but its fix is a handover rule (the head's clearance against the lifted
    ball), which touches this phase's handover code;
  - the late re-hit sweep's crossings elsewhere: drive 18 of 165 (was 0), half roll 104 of 225 (45), full roll 5 (27),
    GC stop 39 (33), AC stop 12 (13); no canonical crosses a ball;
  - the drive's ratio at 3 m/s is 2.92 (was 3.32), below its coaching 3–4: recorded only, as coaching ratios are never
    targets;
  - the cost (machine-dependent): the roll impacts 6.8–12.0 µs/step (was 1.7–1.8), the pass roll's `simulateImpact`
    344 ms (was 38), and the shot mix's engine time per shot p50 4.1, p99 53 and max 91 ms (was 0.23, 10 and 25),
    recorded beside P5's provisional 200 ms.

  The first three, but for the end overlaps, are one mechanism: under the new laws the face and the follow-through
  keep working on a striker's ball sitting in its pit, the pass roll's pinning above, which the user deferred to
  P2b.2b.2b.2b's stroke work. The end overlaps are the handover's lift of a ball left in its pit, deferred with it.

**The implementation's rulings.**

- **Gugan's 0.79 ms at 5.50 m/s** is a 0.01 ms rounding: the fit gives 0.785 ms, and the test checks |T − 0.79 ms|
  < 0.01 ms.
- **"Rises from zero at touch"** (§3.2) compares the force at δ = 1e-12 m with that at 1e-5 m (below 1e-3 of it). The
  plan's absolute bound of 1e-3 N was mis-scaled: c·√δ·U is about 0.019 N there.
- **The cell-recovery test** releases cells through the law, with an upward velocity, and asserts that they exist; the
  plan's version teleported the ball, which reset every cell.
- **e and T at the impact's 5 µs step** (§5.1, recorded, not gated), which no task scheduled, are printed by
  `scripts/strokeProbe.ts`'s `face` section.
- **The phase-2 mirror test across x = 15** is re-recorded at precision 5: the bed is bit-exact only across y = 0
  (§4.1), and a µm hop's last-ulp difference grows to about 3e-6 m through the collisions.

**Behaviour the design did not predict.**

- **The Hertzian face** (§3). The straight croquet drive's 1.1 ms re-catch merges into its first contact, and its
  `impact-off-face` at 74 ms is gone; the timeline's double tap has three face intervals, not two; the fuzz's worst
  face penetration rises from 1.4 to 1.89 mm (its bounds kept); an inclined-face test runs 0.06 s (was 0.02) with
  bounds 2e-4 and 1e-4 (were 1e-5 and 1e-6), because k_t and c_t ∝ √δ ring down slowly at light load. No scenario
  re-touches the face, so the re-touch test pushes an isolated head.
- **The bed in the impact** (§4.6). The stance's contact height moves 0.396 mm, not about 0.26 mm (that assumed
  k_w ≈ 3e8 N/m³; δ₀ ∝ k_w^−½). A centre-struck ball is handed over rising at about 4.7 mm/s, a µm vertical
  oscillation on the bed cut at the drive window's close, so routine strokes now give phase 2 a µm hop and a landing
  on the bed. A resting ball away from y = 0 drifts at about 1e-16 m/s from rounding.
- **Landings on the bed** (§4.7). A 0.5 m drop settles in 4 landings (was 12), against §4.7's expectation that a small
  hop may take more bounces: the settling rule ends the low-speed bounces. The cap's test lawn with τ_r 10 s did not
  cap, as τ_r is also each cell's damping; the test uses k_w 1e5 N/m³ and τ_r 2e-3 s. Exit criterion 2: the phase-2
  digest's shots with no landing are identical (299, none moved), and the 301 with a landing move.
- **The landings' length and the cap's margin** (§4.7). §4.7 estimated a landing at about 1–5 ms of contact and set
  the cap at ten times the longest; measured landings take 15–25 ms (the shot mix's p50 15.0, p99 24.0 and max 24.8
  ms; the fitted bed's contact 22.6 ms at 0.1 m/s), so the 50 ms cap's margin is about 2×. A softer or less damped P3
  lawn may reach `landing-cap`, so P3's presets must re-check it. The landings' cost, not the solver, now drives phase
  2's engine time.
