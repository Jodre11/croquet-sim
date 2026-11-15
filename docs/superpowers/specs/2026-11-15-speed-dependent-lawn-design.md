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

- **c, `rollingSpeedSlope` (reference/lawn.json, provenance "derived").** 0.184 per m/s, the least-squares line
  μr = a + b·u through all 36 ball travels of Gugan 4 Tables 5 and 6 (B1MS left out, its error noted in Gugan's text),
  c = b/a. Each ball's u is its settled rolling speed v·(5 + 2Ω)/7, the standard sliding-sphere result, in place of
  Gugan's equation (D1); Table 5's bracketed Ω2 values are Gugan's own assumed 0.07. Its μr is u²/(2·g·L).
  Bounds: 0.153–0.220, the bootstrap's 68% interval (4000 resamples). Table 6 alone gives 0.154 (0.101–0.222).
- **μ0, from the lawn speed (`rollingResistanceForLawnSpeed`).** The ball that rolls `speedDistance` and stops in T
  seconds. Under the law, from launch speed u0, with k = g·μ0·c:
  T = ln(1 + c·u0)/k and D = (u0 − ln(1 + c·u0)/c)/k. Then D/T = u0/ln(1 + c·u0) − 1/c, which rises with u0, so u0
  is found by bisection and μ0 = ln(1 + c·u0)/(g·c·T). At c = 0 this is today's 2D/(g·T²) exactly. The sliding
  phase is neglected, as now.

### 3.2 The motion: speed bands

The engine's event detection needs each segment's path to be a polynomial in t (`Trajectory`, `detect.ts`), and the
law's exact path is exponential. So rolling runs in speed bands of width ROLLING_BAND = 0.25 m/s, edges at multiples
of it, each band at a constant deceleration.

- **A band's deceleration.** For a segment rolling from u down to the band's lower edge u_lo (u_lo = ⌈u/Δ⌉·Δ − Δ, so a
  ball on an edge starts the band below it), the law's distance is
  D = ((u − u_lo) − ln((1 + c·u)/(1 + c·u_lo))/c)/(g·μ0·c), and the band's deceleration is (u² − u_lo²)/(2·D). Its
  distance is the law's exactly; its time differs from the law's by a small fraction.
- **A band's end.** The rolling segment ends when the speed reaches u_lo, at (u − u_lo)/a. There the ball rolls on
  at exactly u_lo with its spin locked to its velocity, and the next band's segment opens; no phase event is raised,
  the phase being unchanged. In the lowest band the ball comes to rest, as now.
- **`MotionParams`** gains `rollingFloor` (u_lo, m/s; 0 for a uniform lawn). `motionParamsAt` takes the ball's
  horizontal speed and sets `rollingDecel` and `rollingFloor` from it.
- **A lawn with c = 0** is today's: one band from the speed to rest, its deceleration μ0·g. `rollingSpeedSlope` is
  optional on `SurfaceProps`, absent meaning 0, so explicit test surfaces keep their behaviour.
- **Sliding is unchanged** (μs). Pushed bodies (`push.ts`, `modeSolve.ts`) use the rolling deceleration of their
  segment's band, as they use its params now.

### 3.3 Assumptions

- The law is linear in speed. Gugan's Fig. 7 shows the trend, not its form; a line is the simplest fit to it.
- c is fixed across lawns (the user's ruling); only μ0 varies with lawn speed.
- The band width, 0.25 m/s, trades segments for timing accuracy; distances are exact at any width.

### 3.4 Out of scope

- The half roll's low-speed shortfall in its speed ratio (1.49 against Gugan's 1.81 at about 3.4 m/s): a stroke
  matter, not the lawn's.
- Lawn variation by place or traffic.

## 4. Verification

- **Unit.** μ0 at c = 0 equals 2D/(g·T²). A ball rolled from the solved u0 travels `speedDistance` and stops at T
  (distance to 1e-9 m, time within a set tolerance). A band's distance equals the law's to 1e-12 relative.
- **Results.** The half roll's distance ratio at powers 1.0 and 1.2 (10 s lawn) against Gugan's 2.46 and 2.30, and
  how far a power reaches a full lawn. Every pinned distance moves and is re-pinned, the change recorded here.
