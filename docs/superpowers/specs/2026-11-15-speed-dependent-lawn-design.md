# Speed-dependent lawn friction: design

Status: approved by the user (2026-11-15, option 1). Branch `hands-from-lean`.

## 1. Why

Once the half roll could reach Gugan's long-roll speeds (flat push design, amendment 7), its distance ratio climbed
with speed, to 2.59 at 7.1 m/s against Gugan's measured 2.30 at 6.5 m/s (Gugan 4, Table 6, C10H). The launch is not the
cause. Taking each ball's speed once its skid has settled into rolling, u = v·(5 + 2Ω)/7, the model's speed ratio at
that power is 1.60 against Gugan's 1.63. The cause is the lawn: the model's ball decelerates uniformly, so its travel
goes as u², while Gugan's balls do not. His squared speed ratios, 3.44 and 2.67 for the two half rolls, came out as
measured distance ratios of 2.46 and 2.30.

Gugan 4 §10.3 and Fig. 7 report it directly: the coefficient of lawn friction shows "an unmistakable increase" at
higher ball speeds, across all stroke types and uncorrelated with the roll on the ball. His conjectured causes (less
trodden grass for longer strokes; a strong stroke's small-scale bumping, with episodes of sliding friction) are
unconfirmed, and the scatter is about three times the measurement error. He cites Cross for speed-dependent friction in
simple experiments.

## 2. The rulings this implements

- **Option 1 (user, 2026-11-15).** Lawn friction rises with ball speed.
- **Scaling across lawns (user, 2026-11-15).** The speed dependence keeps its shape on every lawn, and the whole law
  scales so the lawn-speed test still takes its stated seconds over 32 m. A faster lawn therefore needs slower balls for
  the same distance, and the effect is smaller there.
- **Air drag plus a straight-line lawn term (user, 2026-11-15, option 1 of the law).** The ball's air drag, which
  grows with the square of its speed, is modelled as physics; the lawn's own term, rising in a straight line with
  speed, covers the rest of Gugan's effect.

## 3. Design

### 3.1 The law

While rolling, a ball of speed u (m/s) decelerates at a(u) = min(g·μ0·(1 + c·u) + k·u², g·μs).

- **k, the air drag (1/m): ½·ρ·Cd·π·R²/m,** on `World` as the optional `airDrag` (absent meaning 0), set by
  `defaultWorld` from the ball's diameter and mass (reference/ball.json) and two new reference values:
  - `airDensity` 1.2041 kg/m³, dry air at 20 °C and 101.325 kPa (reference/air.json).
  - `ballDragCoefficient` 0.47, the smooth sphere's subcritical value. Bounds 0.44–0.51: Morrison's sphere-drag
    correlation (2016) over the Reynolds numbers of a rolling ball at 1–9 m/s (about 6000–55000).
  The ground's effect on a rolling ball's drag is not modelled.
- **c, `rollingSpeedSlope` (reference/lawn.json, provenance "derived").** Fitted to all 36 ball travels of Gugan 4
  Tables 5 and 6 (B1MS left out, its error noted in Gugan's text), with k as above. Each ball's u is its settled
  rolling speed v·(5 + 2Ω)/7, the standard sliding-sphere result, in place of Gugan's equation (D1); Table 5's
  bracketed Ω2 values are Gugan's own assumed 0.07. The fit is least squares on ln L, with Gugan's court's μ0 free.
  Value and bounds: §3.5. Misfits on the same data: uniform lawn 1.74; constant lawn plus air drag 1.31; square law
  0.73; straight line alone 0.58 (c 0.34); air drag plus the line 0.60. A first fit to u²/(2·g·L) as μr gave 0.184;
  it weighs the errors differently and is not used.
- **μ0, from the lawn speed (`rollingResistanceForLawnSpeed`).** The ball that rolls `speedDistance` and stops in T
  seconds under a(u): T = ∫₀^u0 du/a and D = ∫₀^u0 u·du/a. For a trial u0, μ0 is found by bisection so the distance
  is D; u0 is then found by bisection so the time is T. The integrals are Gauss–Legendre over 0.25 m/s panels. With
  c = 0 and k = 0 the closed form 2D/(g·T²) is kept exactly. The sliding phase is neglected, as now. The result is
  cached per lawn speed.

### 3.2 The motion: speed bands

The engine's event detection needs each segment's path to be a polynomial in t (`Trajectory`, `detect.ts`), and the
law's exact path is exponential. So rolling runs in speed bands of width ROLLING_BAND = 0.25 m/s, edges at multiples
of it, each band at a constant deceleration.

- **A band's lower edge.** u_lo is the largest multiple of Δ strictly below u − ε, ε = SPEED_EPSILON, and at least 0:
  a ball on an edge, or within ε above it after rounding, starts the band below it. So a rescaled velocity that comes
  back a hair above its edge cannot open a zero-length segment.
- **A band's deceleration.** For a segment rolling from u down to u_lo, the law's distance is D = ∫ v·dv/a(v) over
  [u_lo, u], by 8-point Gauss–Legendre (the integrand's nearest singularity lies at least 1/c from the band, so the
  rule is exact to rounding), and the band's deceleration is (u² − u_lo²)/(2·D). Its distance is the law's; its time
  differs from the law's by under 0.5% at Δ = 0.25 m/s. Quadrature has no cancellation at low speed.
- **A band's end.** The rolling segment ends when the speed reaches u_lo, at (u − u_lo)/a (`phaseDuration`). There
  `endOfPhase` sets the ball rolling at exactly u_lo along its direction, spin locked to velocity; the next band's
  segment opens with no phase event, the phase being unchanged. In the lowest band (u_lo = 0) it comes to rest, as
  now.
- **A ball at rest, or a stationary segment,** gets `rollingDecel` μ0·g, the law at u = 0, so a held ball's
  resistance (`rollCap`) and when it breaks loose are what they are today on the same μ0.
- **`MotionParams`** gains an optional `rollingFloor` (u_lo, m/s; absent meaning 0). `motionParamsAt` takes the ball's
  horizontal speed and sets `rollingDecel` and `rollingFloor` from it. The brute-force oracle
  (tests/engine/support/bruteForce.ts) and the hand-built params in tests/engine/support/clusters.ts stay at c = 0;
  the banded rolling is checked against the law directly (§4).
- **A world with c = 0 and no air drag** is today's: one band from the speed to rest, its deceleration μ0·g.
  `rollingSpeedSlope` on `SurfaceProps` and `airDrag` on `World` are optional, absent meaning 0, so explicit test
  surfaces and worlds keep their behaviour.
- **The law's ceiling.** a(u) is capped at g·μs, which `validateWorld` requires of μ0 as now and resting-contact
  pushing relies on (world.ts). The speed where it binds on each lawn is reported by the unit tests at 6, 10 and 14 s; on a 6 s lawn it binds at
  12.4 m/s, below the 14.7 m/s the lawn-speed ball starts at, so that ball's first metres run at g·μs.
- **Sliding is unchanged** (μs). A pushed body (`push.ts`, `modeSolve.ts`) keeps the band of its push segment's start
  for the whole segment, including any crossing of a band edge within it; the next segment re-bands. Push segments
  are short contact episodes, so the error is small and confined to them.

### 3.3 Assumptions

- The lawn's term is linear in speed. Gugan's Fig. 7 shows the trend, not its form; a line fits his travels better
  than a square law.
- c is fixed across lawns (the user's ruling); only μ0 varies with lawn speed.
- Air drag acts while rolling only. Flight and sliding are brief and keep their exact closed forms. Cd is held at
  0.47 rather than following Re, and still air is assumed.
- The band width, 0.25 m/s, trades segments for timing accuracy; distances are exact at any width.

### 3.5 The fitted slope

Least squares on ln L over the 36 travels, with k = 0.00415 1/m as in §3.1, gives c = 0.27 s/m with Gugan's court's
μ0 at 0.0257; the misfit is 0.60, against 1.74 for a uniform lawn. Of 1000 bootstrap resamples of the travels, 68%
fall in 0.21–0.34 and 95% in 0.16–0.43; `reference/lawn.json` holds 0.27 with the 95% bounds.

### 3.4 Out of scope

- The half roll's low-speed shortfall in its speed ratio (1.49 against Gugan's 1.81 at about 3.4 m/s): a stroke
  matter, not the lawn's.
- Lawn variation by place or traffic.

## 4. Verification

- **Unit.** μ0 at c = 0 equals 2D/(g·T²). A ball rolled through `simulate` from the solved u0 travels
  `speedDistance` (to 1e-6 m) and stops at T within 0.5%. A band's distance equals a fine reference quadrature of
  the law's to 1e-12 relative, down to 2e-9 m/s (at or below SPEED_EPSILON, 1e-9, a ball is at rest and takes
  a(0)). A speed a hair above an edge opens the band below it. With c = 0 and
  no air drag, every existing engine test passes unchanged.
- **Results.** The half roll's distance ratio at powers 1.0 and 1.2 (10 s lawn) against Gugan's 2.46 and 2.30; the
  segment count and run time of a 30 m roll against today's; how far a power reaches a full lawn. Every pinned
  distance moves and is re-pinned, the change recorded here.
- **Acceptance.** The half roll's ratio at power 1.2 lies within 0.15 of Gugan's 2.30. If it does not, the result
  is recorded and the work stops for the user; c is not re-fitted to the model's output.

## 5. Results (2026-11-15)

- **Fit.** c = 0.27 s/m (95% 0.16–0.43), §3.5.
- **The half roll's ratio, 10 s lawn, text book.** Power 1.0: 2.04 against Gugan's 2.46. Power 1.2: 2.16 against
  his 2.30, inside the acceptance's 0.15. From 1.2 to 2.0 the ratio rises only from 2.16 to 2.23 (was up to 2.59).
  At its canonical power the ratio is 1.932 (was 2.099). The low-speed shortfall stays out of scope (§3.4).
- **Reach.** The half roll's striker's ball goes 2.36 m at power 1.0, 7.75 m at 1.2, 11.9 m at 1.5 and 15.9 m at
  2.0, and the croqueted ball 4.8, 16.7, 26.3 and 35.6 m, every sample clean. The croqueted ball reaches a full lawn
  (about 32 m) near power 1.8 (was about 1.45). On the 10 s lawn a rolling ball needs 7.85 m/s to go 30 m, against
  4.94 m/s on a uniform lawn of the same μ0. (First recorded with the striker's travel read as the croqueted ball's;
  corrected 2026-11-15.)
- **Cost.** A 30 m roll runs in 33 segments and 0.08 ms, against 2 segments and 0.005 ms uniform.
- **The ceiling.** On a 6 s lawn the cap at g·μs binds at 12.4 m/s, below the lawn-speed ball's 14.7 m/s (§3.2).
- **Lawn speed.** A lawn too fast for the ceiling now solves to a μ0 above μs, which `validateWorld` rejects as before.
- **Re-pinned.** `tests/lab/playPin.json` (every play's distances); the push-map ratios: full roll 1.057 (was
  1.068), half roll 1.932 (was 2.099), pass roll 0.8946 (was 0.8835), the full roll's p = 1 sample (10 s ratio 1.191,
  was 1.256); firmness's full roll 1.23 (was 1.263).
- **Suite.** 1776 pass; three slow tests (band, hands, the pass roll's punch) time out at 15 s only under the full
  suite's load, each taking 5–7 s alone.

### 5.1 Like for like: Gugan's lawn speed (user, 2026-11-15)

The 10 s lawn's μ0 (0.0415) is about 1.6 times Gugan's court's (0.0257, §3.5); his court's μ0 matches a 13.23 s
lawn. Re-measured on a 13 s lawn (μ0 0.0265; a rolling ball needs 5.83 m/s to go 30 m), the half roll's text book:

| Power | Striker's ball (m) | Croqueted ball (m) | Ratio | Gugan |
|---|---|---|---|---|
| 0.891 (canonical) | 3.03 | 6.2 | 2.046 | |
| 1.0 | 3.56 | 7.2 | 2.032 | 2.46 |
| 1.2 | 11.48 | 24.4 | 2.126 | 2.30 |
| 1.4 | 15.86 | 34.0 | 2.142 | |
| 1.6 | 18.92 | 40.6 | 2.145 | |
| 1.8 | 21.29 | 45.9 | 2.154 | |
| 2.0 | 23.18 | 50.1 | 2.161 | |

Every sample is clean. At power 1.2 the ratio lies 0.17 below Gugan's 2.30, outside the acceptance's 0.15 (on the
10 s lawn it was 0.14 inside). Per §4 the result is recorded and the work stops for the user; c is not re-fitted.
The croqueted ball reaches a full lawn near power 1.35.

## 6. Against Gugan's filmed rolls (2026-11-15)

Each of Gugan 4 Table 6's nine rolls against the model's text book of the same type, played on a 13 s lawn (§5.1) at
the power whose planned head speed at contact is Gugan's U, at the text book's own hold. Model / Gugan; w1 and v2 are
the balls' speeds at the impact's end, Ω their rolling fractions (%), L their travels (m).

| Roll | U m/s | Power | Class | w1/U | v2/U | Ω1 | Ω2 | L1 | L2 | L2/L1 |
|---|---|---|---|---|---|---|---|---|---|---|
| C3H | 3.55 | 1.006 | clean | 0.53 / 0.38 | 0.89 / 0.94 | 66 / 92 | 16 / 0 | 4.31 / 3.12 | 8.15 / 7.67 | 1.89 / 2.46 |
| C10H | 6.5 | 1.152 | clean | 0.51 / 0.40 | 0.96 / 1.05 | 58 / 94 | −2 / −35 | 10.87 / 7.83 | 21.4 / 18.0 | 1.97 / 2.30 |
| C1F | 1.2 | 0.352 | clean | 1.20 / 0.67 | 1.23 / 0.72 | 41 / 100 | 100 / 39 | 2.59 / 1.21 | 3.57 / 1.21 | 1.38 / 1.00 |
| C3F | 2.71 | 0.799 | clean | 0.97 / 0.59 | 1.00 / 0.89 | 73 / 93 | 100 / 0 | 8.66 / 3.66 | 10.05 / 4.39 | 1.16 / 1.20 |
| C10F | 5.1 | 1.112 | off the face | | | | | | | / 1.24 |
| C25F | 8.01 | 1.621 | off the face | | | | | | | / 1.24 |
| C3P | 3.07 | 0.921 | clean | 1.12 / 0.58 | 0.90 / 0.79 | 25 / 97 | 75 / 0 | 10.40 / 3.73 | 9.26 / 4.51 | 0.89 / 1.21 |
| C10P | 4.9 | 1.093 | clean | 1.25 / 0.52 | 0.93 / 0.94 | 13 / 87 | 29 / −30 | 23.76 / 10.35 | 16.6 / 9.76 | 0.70 / 0.94 |
| C25P | 8.85 | 1.849 | grip limit | | | | | | | / 1.15 |

At the hold the map finds, the full and pass rolls' travels are alike: C3F 8.83 and 12.52 m, C10P 23.88 and 16.65 m.

- **The lawn is not the gap.** Each ball's launch run through the law (skid at μs, then §3.1) gives the model's own
  travels; Gugan's launches run through it give his within about 20%.
- **Full and pass rolls: the balls leave faster than the mallet.** w1/U 0.97–1.25 against Gugan's 0.52–0.67, and the
  striker's ball two to three times his travel. The model's contact runs 146–303 ms; Gugan's rolls show a 1 ms
  impact and a few milliseconds of second contact, with "no clear evidence of acceleration" through it. At his faster
  rolls the model's full roll leaves the face and its pass roll reaches the grip limit.
- **Half rolls: the striker's ball too fast and rolling too little.** w1/U 0.51–0.53 against 0.38–0.40 and Ω1 58–66%
  against 92–94%; the croqueted ball's speed matches (v2/U within 0.09), but it leaves with no backspin where C10H's
  had −35%. The ratio's shortfall is the striker's ball's extra travel.
