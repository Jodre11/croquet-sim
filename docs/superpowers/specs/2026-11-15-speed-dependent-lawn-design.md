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

## 3. Design

### 3.1 The law

While rolling, μr(u) = μ0·(1 + c·u), with u the ball's speed (m/s).

- **c, `rollingSpeedSlope` (reference/lawn.json, provenance "derived").** Fitted to all 36 ball travels of Gugan 4
  Tables 5 and 6 (B1MS left out, its error noted in Gugan's text). Each ball's u is its settled rolling speed
  v·(5 + 2Ω)/7, the standard sliding-sphere result, in place of Gugan's equation (D1); Table 5's bracketed Ω2 values
  are Gugan's own assumed 0.07. The fit is to the measured travels, least squares on ln L with μ0 free: 0.34 per m/s
  (misfit 0.58, against 1.74 for a uniform lawn). A first fit to u²/(2·g·L) as μr gave 0.184; it weighs the errors
  differently and is not used. **Pending the user's choice** (2026-11-15): with air drag on the ball as well (Cd 0.47,
  ρ 1.204 kg/m³), the lawn's slope re-fits to 0.26 at the same misfit (0.60). Bounds follow from a bootstrap of the
  chosen fit.
- **μ0, from the lawn speed (`rollingResistanceForLawnSpeed`).** The ball that rolls `speedDistance` and stops in T
  seconds. Under the law, from launch speed u0, with k = g·μ0·c:
  T = ln(1 + c·u0)/k and D = (u0 − ln(1 + c·u0)/c)/k. Then D/T = u0/ln(1 + c·u0) − 1/c, which rises with u0, so u0
  is found by bisection and μ0 = ln(1 + c·u0)/(g·c·T). At c = 0 this is today's 2D/(g·T²) exactly. The sliding
  phase is neglected, as now.

### 3.2 The motion: speed bands

The engine's event detection needs each segment's path to be a polynomial in t (`Trajectory`, `detect.ts`), and the
law's exact path is exponential. So rolling runs in speed bands of width ROLLING_BAND = 0.25 m/s, edges at multiples
of it, each band at a constant deceleration.

- **A band's lower edge.** u_lo is the largest multiple of Δ strictly below u − ε, ε = SPEED_EPSILON, and at least 0:
  a ball on an edge, or within ε above it after rounding, starts the band below it. So a rescaled velocity that comes
  back a hair above its edge cannot open a zero-length segment.
- **A band's deceleration.** For a segment rolling from u down to u_lo, the law's distance is
  D = ((u − u_lo) − ln((1 + c·u)/(1 + c·u_lo))/c)/(g·μ0·c), and the band's deceleration is (u² − u_lo²)/(2·D). Its
  distance is the law's exactly; its time differs from the law's by under 0.5% at Δ = 0.25 m/s. D is computed in a
  form that does not cancel at low speed: with x = c·(u − u_lo)/(1 + c·u_lo), the bracket is
  (x·c·u_lo + (x − ln(1 + x)))/c, and x − ln(1 + x) is its series x²/2 − x³/3 + x⁴/4 − x⁵/5 below x = 1e-3, else
  x − log1p(x).
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
- **A lawn with c = 0** is today's: one band from the speed to rest, its deceleration μ0·g. `rollingSpeedSlope` is
  optional on `SurfaceProps`, absent meaning 0, so explicit test surfaces keep their behaviour.
- **The law's ceiling.** μr is capped at μs, which `validateWorld` requires of μ0 as now and resting-contact pushing
  relies on (world.ts). Its speed on each lawn, (μs/μ0 − 1)/c, is reported by the unit tests at 6, 10 and 14 s.
- **Sliding is unchanged** (μs). A pushed body (`push.ts`, `modeSolve.ts`) keeps the band of its push segment's start
  for the whole segment, including any crossing of a band edge within it; the next segment re-bands. Push segments
  are short contact episodes, so the error is small and confined to them.

### 3.3 Assumptions

- The law is linear in speed. Gugan's Fig. 7 shows the trend, not its form; a line is the simplest fit to it.
- c is fixed across lawns (the user's ruling); only μ0 varies with lawn speed.
- The band width, 0.25 m/s, trades segments for timing accuracy; distances are exact at any width.

### 3.4 Out of scope

- The half roll's low-speed shortfall in its speed ratio (1.49 against Gugan's 1.81 at about 3.4 m/s): a stroke
  matter, not the lawn's.
- Lawn variation by place or traffic.

## 4. Verification

- **Unit.** μ0 at c = 0 equals 2D/(g·T²). A ball rolled through `simulate` from the solved u0 travels
  `speedDistance` (to 1e-9 m) and stops at T within 0.5%. A band's distance equals the law's to 1e-12 relative at
  speeds from 1e-3 m/s up, and to 1e-6 relative below. A speed a hair above an edge opens the band below it.
- **Results.** The half roll's distance ratio at powers 1.0 and 1.2 (10 s lawn) against Gugan's 2.46 and 2.30; the
  segment count and run time of a 30 m roll against today's; how far a power reaches a full lawn. Every pinned
  distance moves and is re-pinned, the change recorded here.
- **Acceptance.** The half roll's ratio at power 1.2 lies within 0.15 of Gugan's 2.30. If it does not, the result
  is recorded and the work stops for the user; c is not re-fitted to the model's output.
