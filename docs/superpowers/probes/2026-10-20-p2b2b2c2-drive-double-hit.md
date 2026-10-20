# The drive's `impact-off-face`: a double hit (diagnosis)

2026-10-20. The canonical drive at 3 m/s. Evidence only: no code was changed.

Worktree `p2b2b2c2-croquet-fit` at 0925712 plus the then uncommitted `scripts/fitRatios.ts`; nothing in the repo
changed. Drive preset, canonical setup, 3 m/s (ratioTargetsReference.drive.speed), the fit's evaluator path (fitWorld,
fitSetup, planStroke, coupling replaced as runFit does). Default impact step dt = 5 µs.

The throwaway scripts are not kept. What each measured:
- `offface1`: every step on which the head touches a ball, with the region (recomputed by headBallContact on the
  step's start state), depth, normal, normal force, the ball's and the head's position and velocity; the events,
  timelines, head regions, entry jumps, handover, travels and ratio.
- `offface2`: one line per point (ratio, travels, off-face event, region intervals, the striker's handover velocity,
  the least head–striker clearance after the first face release and before any second contact, by boxDistance), with
  any FitParams key, the impact step, the impact's cap or `guideEffort` overridden.
- `offface3`: the head's recovery after release against the planned path (pathAt), the face's lower edge against the
  ball, the hands' forces along aim.
- `offface4`: two points side by side every 1 ms (the striker's ball and the head).
- `offface5`: two points side by side through the edge contact, with each contact's normal force, depth, tangential
  force and law.

Frame: aim = +y (world x is the lateral axis). Ball radius R = 46.04 mm; head a rounded box 279.4 mm long, half
height/width 28.575 mm, edge radius 3 mm; regions face / edge / corner / side / top / bottom / back (shape.ts:64,
"edge" = two of q_x, q_y, q_z positive, here beyond the face plane and below the core's bottom).

## 1. The canonical drive at TODAY (ratio 3.3085)

- First face contact, blue (striker): [0.005, 1.500] ms, peak 3594 N, region face. blue/red [0.010, 1.370] ms.
  At release (1.5 ms): head 0.800 m/s along aim, blue 1.623 m/s, clearanceAfter 20.5 mm.
- Second contact, blue only: [109.090, 110.600] ms, region **edge** throughout, peak normal force 359 N (358.1 N at
  109.80 ms), peak depth 216 µm, entry depth 2.1 µm (entryJumps count 0). Normal (head → ball) along aim 0.960,
  z −0.280 at entry, rotating to (0.952, −0.306) at exit: the head's lower front rounded edge, meeting blue's rear
  hemisphere about 11 mm above its centre (edge z 57.0 mm against the ball centre's 45.75 mm).
- Positions at entry (relative to blue's start, along aim): blue at +154.6 mm, z 45.75 mm, lateral 0; head centre at
  −31.5 mm, z 61.8 mm (16 mm above the ball centre, risen from 45.6 mm), pitched 9.6° face-up; lateral 0.
- Relative velocity at entry: head 1.806 m/s along aim (vz +0.330), blue 1.155 m/s (vz +0.017): closing 0.65 m/s
  along aim. Impulse on blue: Δv along aim +0.550 m/s (1.155 → 1.705) and Δvz −0.38 m/s (driven down into the turf).
- red: never touched by the head (no face/red interval).
- Event timeline: turf-lift blue 2.96 ms; impact-off-face blue 109.09 ms. turf/blue intervals [0, 2.955],
  [22.9, 46.1], [52.7, 121.7] ms. Impact duration 154.09 ms.

## 2. What it does to the outcome

| Run | 2nd contact | striker travel | croqueted travel | ratio |
|---|---|---|---|---|
| TODAY | edge 359 N at 109 ms | 1.841 m | 6.093 m | 3.3085 |
| TODAY, cap 100 ms (ends before the catch) | none | 1.224 m | 6.158 m | 5.0331 |
| TODAY, guideEffort 0 | none | 1.237 m | 6.204 m | 5.0144 |
| TODAY, guideEffort 0.5 | none | 1.279 m | 6.076 m | 4.7511 |

The croqueted ball's travel barely moves (6.08–6.20 m); the striker's rises by ~0.6 m (+50 %). Yes: the off-face
touch is what lowers the ratio, by speeding the striker's ball (1.155 → 1.705 m/s along aim at the catch, handover
1.348 m/s after the turf's losses). guideEffort 0 at 3 m/s reproduces the roadmap's recorded 5.01.

## 3. Why it switches

Two separate mechanisms, both visible in the fit's figures.

### 3a. Catch or no catch: a geometric threshold, continuous in impulse, robust to dt

After release the bottom hand's guide pushes the head back towards the planned arc (planned socket speed 2.90 →
2.50 m/s over 0–109 ms); the head recovers 0.80 → 1.81 m/s (offface3: 0.92 at 10 ms, 1.31 at 40, 1.67 at 80,
1.81 at 109). The striker's ball skids at 1.62 m/s, then rolls at ~5/7 of it (1.16 m/s). The face–ball gap peaks at
~20.5 mm at 50 ms and closes by 109 ms. Meanwhile the head rises and pitches face-up on its arc (z 45.6 → 61.8 mm,
pitch 0 → 9.6°), lifting its lower front edge (17 → 57 mm). Whether the edge passes over the ball or meets its rear
hemisphere is a race; the closest approach's clearance crosses zero smoothly as the inputs move:

| Point | closest clearance (no catch) or catch | ratio |
|---|---|---|
| period 0.100 s | 2607.6 µm at 142.1 ms | 4.7976 |
| period 0.095 s | 618.6 µm at 140.1 ms | 4.7997 |
| period 0.094 s | 217.5 µm (dt/2: 248.7, 2dt: 141.6) | 4.8003 |
| period 0.0925 s | catch 132.8 ms, 69 N | 4.7479 |
| period 0.090 s | catch 125.6 ms, 143 + 106 N (two catches) | 4.5775 |
| period 0.085 s | catch 116.1 ms, 260 + 142 N | 3.8823 |
| period 0.080 s (TODAY) | catch 109.1 ms, 359 N | 3.3085 |
| damping 0.58 / 0.60 / 0.65 | 1234.6 µm / catch 16 N / catch 233 + 146 N | 4.7993 / 4.7905 / 4.0042 |
| armMass 0.45 / 0.48 / 0.50 / 0.55 / 0.60 / 0.70 | 461.6 µm / 32 N / 82 N / 145+102 / 192+140 / 287+134 | 4.8212 / 4.8022 / 4.7550 / 4.5982 / 4.2394 / 3.7602 |

So the onset is a threshold (a gap that just closes), the impulse grows from zero as the catch moves earlier (grazes
of 16–82 N cost only ~0.05), and the ratio then falls steeply (4.80 → 3.3 over period 0.0925 → 0.080 or armMass
0.48 → 0.80). The "bimodal" 4.77–4.89 / 2.5–3.8 picture is the sweeps' resolution over this steep stretch. At dt/2
and 2dt the threshold side holds at every point tried (period 0.094: no catch at all three; armMass 0.5: catch at
all three, 78 / 82 / 88 N, ratios 4.7573 / 4.7550 / 4.7226).

### 3b. The 3.54 / 3.74 flips among near-identical inputs: a numerical branch inside the catch

The fit's pairs all catch; the flip is not catch versus none. Pair (0.81395394 ms, 10.69562 mm) → 3.5373 and
(0.81395591 ms, 10.69081 mm) → 3.7390: both catch at 78.475 ms with 401 / 404 N, region edge, normal (0.999, +0.046).
The trajectories agree to ≤1 µm and ≤0.1 mm/s until then (offface4). They part in the first steps of the edge
contact:

- Entry step (78.500 ms): depth 12.0 vs 10.9 µm, N 16.9 vs 15.7 N, tangential force 7.4 vs 7.8 N against the
  Coulomb limit μN = 0.5·N = 8.45 vs 7.85 N. A's trial force is under the limit (stick); B's is over it (slip).
- They stay on those branches through the contact: B's |T|/N is 0.500 at every sampled step, A's falls 0.44 → 0.30
  (at 78.800 ms: T 74.5 N, N 249.5 N vs T 123.9 N, N 248.1 N). The friction acts down on blue (its rolling rear
  surface slides upward against the head's edge), so B's ball leaves with vz −0.225 m/s against A's −0.167, sinks
  deeper (turf depth 409 vs 332 µm at 80 ms), and the bounces that follow lose more (turf intervals and handover
  differ: handover 1.3603 vs 1.4117 m/s along aim; travel 1.632 vs 1.726 m).
- The branch follows the step grid, not the inputs: at dt/2 both points give 3.5369 / 3.5370, at 2dt both give
  3.7359 / 3.7357. Same for TODAY: 3.3085 at 5 µs, 3.4838 at 2.5 µs, 3.4661 at 10 µs (the finer and coarser runs add
  a third catch, [123.6, 125.5] ms, 94 N).
- Mechanism, as far as read (contactLaw.ts:158–179, integrate.ts:539–544): in slip the stored spring is reset to
  force/k_t, the damping share included, so the next step's trial (k_t·ξ + c_t·slip) counts the damper again and
  stays over the limit; in stick, carrySpring scales ξ by k_before/k_now as the Hertz k_t grows, so the spring force
  grows more slowly than μN and stays under it. Each branch latches on the entry step. Confidence medium: the latch is
  inferred from the printed forces and the code, not instrumented step by step.

The 10.0 / 10.2 mm pair (3.5542 / 3.7482) shows the same signature (catch at 78.975 / 78.825 ms, 397 / 401 N; vz at
80 ms −0.145 / −0.233 m/s; turf intervals 5 / 4); there reachSlack also differs in substance (bottom hand opens at
41.59 / 42.26 ms), so it is not a pure numerical pair.

## 4. Physical plausibility

For a real double hit (of the model's bodies):
- Kinematics are smooth and ordinary: the head chases the ball for 107 ms at a closing speed falling to 0.65 m/s;
  the catch is where a following-through, rising, face-up head would meet a rolling ball first, with its lower front
  edge on the ball's rear hemisphere above the equator.
- No numerical entry: entry depth 2.1 µm (one step's closing ~3.3 µm), entryJumps 0 at every point; the ball sits on
  the turf normally (centre 0.3 mm below R); the onset time and peak force agree within 0.2 ms and 1 % at dt/2 and
  2dt; the clearance's approach to zero is smooth in the inputs.
- The roadmap already records it as a second contact: P2b.2b.2b.2c outcomes (line 1484) "its second contact (at
  128 / 109 ms at 2 / 3 m/s) meets the box's rounded edge"; the drive had 2 face intervals before the box head
  (line 1487), so the round head's double hit landed on the face and raised no flag.

For an artefact or an unvalidated input:
- What drives the catch is the swing-mode bottom hand's push after contact at guideEffort 1 ("restores the planned
  arc's speed", impact/types.ts:232): the head is re-accelerated at ~9 m/s² towards a planned socket speed of
  2.5–2.9 m/s, more than twice the speed of the ball it just struck. guideEffort 0.5 or 0 removes the catch. Whether
  a player's hands do this in a drive is not established by any measurement found; it is the user's account
  (2026-10-06).
- The size of what follows the catch (the ball driven into the turf and its bounces) is set by a stick/slip branch
  chosen on the contact's entry step (3b): a numerical artefact of the tangential law's discretisation, worth up to
  ~0.2 on the ratio (5 %), and the canonical ratio itself is not dt-converged (3.31 / 3.48 / 3.47).
- `impact-off-face` is a proxy: it reports the region (edge) of a pitched head, not the double hit; on a face-region
  catch the same double hit raises no flag.

## 5. History (git log -S "impact-off-face"; roadmap, line 12 not printed)

The flag is as old as P2b.1 (69bc58a design, 1a5691d contact geometry); a80784f judged the Laws' faults from the
timeline; 4fd0425 met the whole head (tracked drives' regions). The drive's sweep counts:
- Section "P2b.2b.2a outcomes carried forward" (roadmap 615): drive 81 → 91, with the sweep now rejecting 60 runs.
- P2b.2b.2b.2a outcomes, strike and turf laws (roadmap 1209): 91 → 69; the same section records the late re-hit
  ("the face and the follow-through keep working on a striker's ball", 1197–1199).
- P2b.2b.2b.2c outcomes, rounded box mallet (roadmap 1484–1497): 69 → 84; the canonical drive's second contact now
  meets the box's rounded edge and raises the flag; the drive ratio at 3 m/s became 3.31 (was 2.92), with guideEffort
  0 at 3 m/s 5.01 (line 1491).
- P2b.2b.2c.1 outcomes (roadmap 1840–1843): 84 → 96, with the swing presets' 6 m/s runs now played (180 → 225 runs,
  45 → 0 rejected).
- 1d00476 (this branch): the sensitivity probe's figures carry the flag per point.

## Where the cause lives, and what would settle the open points

- Catch onset: the tracked drive's post-contact hand loading in swing mode (track.ts handLoad: the bottom hand's
  guide/push after contact scaled by guideEffort, with the arm mass and coupling setting how fast the head recovers),
  meeting the arc's rise and pitch. Confidence high.
- 3.54 / 3.74 branch: the face–ball tangential law's stick/slip state on the catch's entry step (contactLaw.ts
  tangentialForce / carrySpring as applyPair uses them). Confidence medium.
- Open: whether real drives re-accelerate the head enough to double-hit (needs a measured follow-through head speed
  after a drive, e.g. video); a per-step print of `sliding` and ξ for the two 3b points to confirm the latch; a dt
  sweep (1.25–20 µs) of TODAY to see whether the post-catch ratio converges.
