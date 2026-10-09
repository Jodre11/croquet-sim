# P2b.2b.2b.2a — The Strike and the Turf: Design

**Product spec:** `2026-09-30-croquet-shot-lab-design.md` §4 (impact phase).
**Impact spec:** `2026-10-03-p2b1-impact-integrator-design.md` (§4 the contact law, §5 the integrator).
**Stance spec:** `2026-10-08-p2b2b2b1-hands-stance-design.md` (the rolls' leans; its amendments).
**Roadmap:** P2 row; "P2b.2b.2b decisions and findings (2026-10-08)", including "The roll as played", "Sources for
P2b.2b.2b.2 and P2b.2b.2b.3" and "The model's roll against the roll as played".

**Why this split** (user decision, 2026-10-09). P2b.2b.2b.2 is split into three steps, each with its own spec, plan
and PR, landing in this order before P2b.2b.2b.3:

- **P2b.2b.2b.2a** (this document): the contact laws. A Hertzian face–ball law with Gugan's measured e(U) and T(U),
  and the ball–turf law under load: a bed that is slow to recover, so that the ball runs along a transient pit and
  the restitution falls with speed.
- **P2b.2b.2b.2b:** the roll's stroke. The rolls' descent through contact (reopening P2b.2b.2a's "hands arrive with no
  vertical velocity") and the hand's part in the second contact, to the roll as played: the angle held and never
  beyond 45°, the head behind the ball, the hands releasing rather than braking, the mallet arcing back through
  vertical.
- **P2b.2b.2b.2c:** the mallet. The square head as a new collider shape, the end-weighted head (Russ: 33–172 kg·cm²
  about the shaft against the engine's solid cylinder's 47) and the market's dimensions.

The laws come first because the diagnosis implicates them first (roadmap, "The diagnosis"); the stroke is then
fixed on the new laws, and the mallet, secondary in the diagnosis, last.

**Circularity.** The laws are fitted only to material measurements (restitution, contact time, penetration). Nothing
is tuned to a coaching ratio or to the user's play data; "the roll as played" is P2b.2b.2b.2b's behavioural target,
not this step's.

## 1. Goal and exit criteria

The face–ball contact reproduces Gugan's measured speed dependence of restitution and contact time on wood. The
ball–turf contact is a bed of cells that the ball presses down and that recovers at a finite rate, so that a ball
driven into the lawn rolls along its own transient pit, meets the pit's leading wall as a ramp, and loses more energy
the faster it strikes. A ball landing in phase 2 rebounds with the same bed's restitution at its landing speed. No
stroke or hand behaviour changes.

Exit criteria:

1. The analytic cases of §5.1 hold.
2. Phase 2 is unchanged but for its landings (§4.6): the P1 and P2a digests and tests with no landing are
   bit-identical; those with a landing move and are re-recorded. In `scripts/impactDigest.ts` the cases with no
   face–ball and no ball–turf contact are bit-identical; the rest move and are re-recorded.
3. Every preset's canonical setup meets P2b.2b.2b.1's exit criterion 4: `simulateShot` with `trajectory: true` from top
   to finish with no `RangeError`, no re-entry guard hit, no ball centre more than 5 mm above R, no `follow-cap`, the
   trajectory continuous at every boundary.
4. The held-out checks (§3.4, §4.5) and the strokes' figures (§6) are recorded in the roadmap. They are observations,
   not gates.
5. `ENGINE_VERSION` is "0.9.0".

## 2. Architecture

```
src/engine/math/elementary.ts        new exp (exact operations, as ln); pow for positive bases from ln and exp
src/engine/impact/contactLaw.ts      the Hertzian face law: its table, closure solve and force (§3)
src/engine/impact/turfBed.ts         new: the bed's cells, their update and the resultant on a ball (§4)
src/engine/impact/contacts.ts        the ball–turf pair reads the bed instead of the plane
src/engine/impact/integrate.ts       face–ball pairs carry their closure law; ball–turf pairs step the bed
src/engine/impact/simulateImpact.ts  builds the face law per closure and the bed per impact; the new flag
src/engine/impact/types.ts           the face law's state; the flag impact-turf-pit
src/engine/types.ts, world.ts        SurfaceProps gains bedModulus and bedRecovery; turfAt gives the landing's e(v)
src/engine/resolve.ts                a landing reads e at its own downward speed (§4.6)
src/engine/simulate.ts               ENGINE_VERSION 0.9.0
reference/contact.json               faceRestitutionFit, faceContactTimeFit, bedModulus, bedRecovery; checks
reference/friction.json              ballTurfSliding's note: Gugan's µ ≈ 1.0 is now a held-out check (§4.3)
scripts/turfFit.ts                   new: fits bedModulus and bedRecovery (§4.4)
scripts/strokeProbe.ts, swingProbe.ts, shotMix.ts, impactDigest.ts   re-run and re-recorded
```

Unchanged: ball–ball and ball–obstacle pairs stay on the linear law (§3.6); the head–turf pair stays on the plane
law with `turfStiffness` and `turfRestitution` (P2b.2b.2b.3's); phase 2's flat turf (§4.6).
Everything stays under the determinism lint (`+ − × ÷ √` and the engine's elementary functions).

## 3. The face–ball law

### 3.1 Sources

Gugan, Am. J. Phys. 68, 920 (2000), DOI 10.1119/1.1285850 (https://oxfordcroquet.org/tech/gugan/), a ball on a
wooden face:

- restitution: 1 − e² = 0.213 + 0.077·U^0.4, so e falls from 0.854 at 0.5 m/s to 0.793 at 6 m/s; it agrees with Gugan 1
  Table I (85.7 at 0.50 m/s to 79.5 at 6.01 m/s, `contact.json` `faceRestitution`);
- contact time: T falls from 0.97 to 0.79 ms over 2.19–5.50 m/s, T ∝ U^−0.23. Hertz predicts U^−0.2.

Both fits enter `contact.json` as `faceRestitutionFit` and `faceContactTimeFit`, with their sources, ranges and the
power-law form T(U) = 0.97 ms·(U / 2.19 m/s)^−0.23. The existing `faceRestitution` (0.817) and
`faceBallContactTime` (0.8 ms) stay as the fits' values near 2.83 m/s, labelled as checks; the engine no longer reads
them.

### 3.2 The force

F = k·δ^{3/2} + c·√δ·δ′, clamped at zero so it never pulls (Kuwabara and Kono 1987; Brilliantov et al. 1996). δ is
the penetration and δ′ its rate, positive closing. The force rises from zero at touch with no step, which a plain
dashpot on a Hertzian spring would give.

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
integrates anything. Targets: e within 1e-4 of the fit and T within 0.1 % (§5.1). e(ĉ) is monotone decreasing; the
table's grid spacing is chosen in the plan to meet the targets.

`exp` is added to `elementary.ts` (argument reduction by ln 2, as `ln` uses), with `pow(x, y) = exp(y·ln x)` for x > 0,
for U^0.4 and U^−0.23. Both are tested against `Math.*` like the existing functions.

### 3.5 Tangential

Cundall–Strack as now, but its stiffness k_t is 2/7 (`TANGENTIAL_STIFFNESS_RATIO`) of the normal's current tangent
stiffness k_n = (3/2)·k·√δ, so that it grows with the contact as Mindlin's does. Its damping keeps the linear law's
ratio to the normal's, c_t = c_n·√(k_t/k_n) with c_n = c·√δ the normal's current damping (as `pairLaw` relates them
now). Friction µ stays `faceFriction` (0.5).

### 3.6 What stays linear

The ball–ball pair: Gugan 4 Table 1 gives a ball–ball contact time with no significant speed dependence (0.75 ms over
1.90–7.64 m/s), which a Hertzian law would contradict. The ball–obstacle pairs: no measurement exists (`contact.json`
`ballObstacleContactTime`). The head–turf pair: P2b.2b.2b.3's.

## 4. The turf bed

### 4.1 Cells

Within the impact, the turf near each ball is a sparse grid of square cells of side h = 2 mm, fixed in the ground and
aligned with world x and y, keyed by integer cell coordinates and visited in a fixed order. A cell is created when a
ball's surface first reaches its centre's column below z = 0. Each cell holds its surface depth w ≥ 0 (its surface at
z = −w) and whether a ball holds it.

### 4.2 Each cell's law

A cell is a Kelvin–Voigt unit of area A = h²: its force on the ball is A·(k_w·w + η·w′), with the bed modulus k_w
(N/m³) and τ_r = η/k_w the bed's recovery time.

- **Held:** while the ball's surface over the cell's centre is at or below the cell's surface, the cell's surface
  follows it (w = −z_b, w′ = −z_b′, with z_b the ball's lowest surface height over the cell's centre).
- **Released:** when the held cell's force would be negative (the ball rising faster than w/τ_r), the cell lets go
  and recovers freely, w′ = −w/τ_r, integrated exactly over the step (w·(1 − dt/τ_r) is replaced by the exact decay
  from `exp`). A released cell is held again when the ball's surface reaches it. A cell is dropped once released with
  w < 1 µm.

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
size of the resultant normal, acting where the resultant's line meets the ball's surface. Gugan's µ ≈ 1.0 was derived
by attributing all the ball's horizontal slowing in the pit to friction on a flat ground; the ramp supplies part of
it, so 1.0 becomes a held-out check (§4.5) and is not an input (user decision, 2026-10-09).

### 4.4 The fit

`SurfaceProps` gains `bedModulus` (k_w, N/m³) and `bedRecovery` (τ_r, s). The default lawn's values are fitted by
`scripts/turfFit.ts` to Gugan 4 §7.1 and Table 4(b), roll A4R: a free ball meeting the bed vertically at 5 m/s leaves
at 2.5 m/s (e = 0.5, "a CoR for the ground of about 0.5") after a maximum penetration of 7.2 mm. Two targets, two
parameters; the fit is solved to 1e-4 relative on each and the results enter `contact.json` with the derivation.
Bounds are recorded from the same fit at the stiffer end of `ballTurfStiffness`'s bounds and at Bristol's 0.15 drop
(Gugan's note in `friction.json` `ballTurfRestitution`), as a slower lawn, not used. An order-of-magnitude estimate for
the plan: the energy balance at 7.2 mm gives k_w ≈ 3e8 N/m³.

### 4.5 Held-out checks (recorded, not gated)

- Gugan's A2R and A3R penetrations, 4.0 and 5.0 mm, at their implied downward speeds 3.04 and 3.52 m/s (upward speeds
  1.52 and 1.76 m/s over e 0.5).
- e against impact speed from 1 to 6 m/s, compared in shape with Penner's golf fit e = 0.510 − 0.0375|v| + 0.000903v²
  (Can. J. Phys. 80, 931 (2002)), not matched.
- The apparent friction in the rolls, the horizontal over the vertical turf impulse while the striker's ball is in its
  pit, against Gugan's µ ≈ 1.0.
- The distance from first contact to maximum penetration in the rolls, against Gugan's 3.5–18 mm.
- The hollow's diameter at A4R against Gugan's "about 50 mm". This follows nearly from the geometry
  (2·√(2·R·δ) = 51 mm at 7.2 mm), so it is recorded but not counted as evidence.

### 4.6 Boundaries of the bed

- **Phase 2** keeps the flat turf. When the impact ends, the bed is dropped. If a ball's surface is then more than
  1 mm below z = 0 over any held cell, the outcome carries the new flag `impact-turf-pit`, recorded and not gated.
- **Phase 2's landings** take the bed's restitution at their own downward speed (user decision, 2026-10-09), so one
  turf law holds inside and after the impact. The bed is not simulated in phase 2. Instead, when a world is built, a
  table of e against the normal impact speed is computed once from free vertical impacts on a fresh bed with the
  lawn's `bedModulus` and `bedRecovery` and the world's ball, at speeds spaced evenly in ln v over [0.05, 8] m/s,
  memoised by those four values. A landing interpolates linearly in ln v and holds the end values outside the range.
  `turfAt` returns that e for the landing's speed; its impulsive friction (µ_s·Λ, Hall's 0.48) is unchanged. The
  oblique landing's ramp is not modelled in phase 2: the table is the normal response only. The table's spacing is
  chosen in the plan so that interpolation stays within 1e-3 of a direct bed impact.
- **Settling.** The bed's e rises towards 1 at low speed, where its contact lasts long against τ_r, so a small hop
  takes more bounces to fall below `SETTLE_SPEED` than at the constant 0.5. Every e from the table is below 1, so the
  run of bounces stays finite; the bounce counts are recorded on the shot mix (§6). Should a count prove excessive the
  plan raises it with the user rather than adding a cut-off.
- **The head** does not press the bed. The head–turf pair keeps the plane law with `turfStiffness` and
  `turfRestitution`, now used by it alone (P2b.2b.2b.3).
- **Balls** each have their own cells; two balls sharing a cell is not handled in this step. A ball whose footprint
  reaches a cell another ball holds raises a `RangeError` in tests; in practice two balls are never both pressed in
  within 2 mm of each other.
- **Stability.** The explicit step is 5 µs. The bed's total damping at the A4R footprint is of order η·π·2Rδ ≈ 1.3e3
  N·s/m at τ_r = 2 ms, giving 2m/c ≈ 0.7 ms, two orders above the step. The plan checks this against the fitted τ_r.

## 5. Testing

### 5.1 Analytic cases

- **Elementary:** `exp` and `pow` against `Math.*` to a few ulps over the ranges used.
- **Face law:**
  - central collisions of a ball on a free face at U = 0.5, 2.19, 2.83, 4.0, 5.5 and 6.0 m/s, through the integrator,
    give the fit's e within 1e-4 and T within 0.1 %;
  - a closure below 0.5 m/s, or above 6 m/s, takes the clamped speed's law;
  - the force never pulls;
  - a re-touch after opening sets new k and c from its own U;
  - the table's inversion round-trips: ĉ → e → ĉ within the bisection's resolution;
  - k_t equals (2/7)·(3/2)·k·√δ at every step of a contact.
- **Bed:**
  - a sphere pressed slowly into a fresh bed: the force matches the Winkler closed form within 1 % at δ ≤ 2 mm;
  - a single released cell recovers as w₀·exp(−t/τ_r) within 1e-12 relative;
  - a free vertical impact at 5 m/s gives e = 0.5 and 7.2 mm within the fit's tolerance;
  - e falls monotonically over 1–6 m/s;
  - grid convergence: h = 1 mm and h = 2 mm agree within 1 % on e and on the maximum penetration at 2, 5 and 6 m/s;
  - a ball rolling without slipping across a fresh bed under its own weight: the ramp's horizontal force opposes the
    motion, and the bed's loss over 50 mm is reported;
  - a ball sliding horizontally on a held bed slides at Hall's µ against the resultant normal.
- **Landing table:** each entry equals a direct free vertical impact on the bed at its speed; interpolation between
  entries stays within 1e-3 of a direct impact at the midpoints; the table is identical for equal inputs and rebuilt
  for a lawn with other bed values; a phase-2 landing at 5 m/s rebounds at e = 0.5 within the fit's tolerance; every
  entry lies in (0, 1).
- **Integration:** `impact-turf-pit` is raised by a set-up that ends with a ball in a deep pit and not otherwise.

### 5.2 Bit-identity and migration

- P1 and P2a: every digest and test without a landing bit-identical. Those with a landing (P2a.1's landing,
  bouncing-settle and hopping cases, its brute-force cross-check) move: their analytic expectations are restated for
  e(v) and their figures re-recorded.
- `scripts/impactDigest.ts`: the cases with no face–ball and no ball–turf contact bit-identical; the others moved,
  their digest re-recorded.
- Tests that pin figures of the old linear face law or the plane turf for balls (force tables in P2b.1, P2b.2a and
  P2b.2b.1 tests) are re-baselined with the new figures, each with a comment naming this step. Their analytic intent
  (restitution, contact time, sticking, the 5/7 roll) moves to §5.1's cases where the old law's closed form no longer
  applies.
- The P2b.2b.2b.1 test figures that depend only on geometry (the stance, `CANONICAL_CLEARANCE`) are unchanged.

## 6. Probe (recorded in the roadmap)

`strokeProbe.ts`, `swingProbe.ts`, `shotMix.ts` and `impactDigest.ts` are re-run on `main` before and on the branch
after, the raw output saved as `docs/superpowers/probes/2026-10-09-p2b2b2b2a-*.txt`. Recorded:

- each preset's ratios over 2, 2.5, 3, 3.5 and 4 m/s, and its face intervals (the re-catches);
- the rolls' canonical runs as in P2b.2b.2b.1's outcomes (clearance, impact and finish times, the highest ball
  centre, braking hands, `impact-off-face`, entry jumps, the late re-hit's crossings);
- the full roll at 2 m/s against "the roll as played": the pitch's drift through the contact, the head's distance
  behind the striker's ball, the hands' braking at the end of the reach and what it costs the striker's ball. These are
  P2b.2b.2b.2b's starting figures;
- the held-out checks of §3.1 (Hall's slow strokes, 1.3–2.9 ms on a 0.6 m stroke) and §4.5;
- the cap and flag tallies of the `presets` sweep, `impact-turf-pit` among them;
- the shot mix's work units against P2b.2b.2b.1's (p99 143,084, p99.9 362,050, max 408,030), and the bed's share;
- the landing table's cost at world build, and the shot mix's phase-2 bounce counts before and after (§4.6).

## 7. Deferred

- **P2b.2b.2b.2b:** the rolls' descent through contact; the hands holding the angle, keeping the head behind the ball,
  releasing rather than braking, the arc back through vertical. HAND_COUPLING's limits (it cannot pass 1 ms taps)
  remain until then.
- **P2b.2b.2b.2c:** the square head, end-weighting, the market's dimensions in `mallet.json`.
- **P2b.2b.2b.3:** the head in the bed, ploughing, the grip breaking.
- **Later:** the ramp and pit in phase 2's oblique landings (§4.6 takes the normal response only); cells shared by two
  balls; a pit that outlasts the impact; lawn presets beyond the default (P3); face materials beyond wood (P3).

## 8. Roadmap changes (in this PR)

- The P2 row: P2b.2b.2b.2 is split into 2a, 2b and 2c as above, with this spec named for 2a; the exit criteria gain
  2a's (the laws' analytic cases; the strokes recorded).
- "P2b.2b.2b decisions and findings (2026-10-08)": the split and the user's design decisions of 2026-10-09 (the face
  law set at closure, the bed of recovering cells, Hall's friction with Gugan's 1.0 held out, the bed as a field,
  phase 2's landings taking the bed's e(v)).
- A new "P2b.2b.2b.2a outcomes" section with §6's figures.
- "Provisional numbers" unchanged.
