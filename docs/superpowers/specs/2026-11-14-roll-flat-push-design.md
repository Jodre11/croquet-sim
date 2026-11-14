# Rolls: flat push, rising finish — design

Status: reviewed, 2026-11-14. Part of the hands-from-lean work (PR 2, branch `hands-from-lean`). It lands before the
envelope is re-dispatched (plan `2026-11-12-hands-from-lean.md`, Task 7).

## 1. Why

On the hands from the lean, the text-book full roll is clean up to power 1.0. At short range it reaches the right
ratio for about half the old effort. Above power 1.0 it fails, although the strike does not change with power: the
shaft is at 31° and the ball is within 0.4 mm of the face's centre. What fails is what follows the strike.

| Power | Hold   | Outcome                                                                 |
|-------|--------|-------------------------------------------------------------------------|
| 1.0   | both   | clean, 8.36 m on the 10 s lawn, slips in the follow-through             |
| 1.05  | found  | engine error (hand-over: head overlaps the ball, 0.093 m sideways move) |
| 1.05  | fitted | impact-off-face at 146.7 ms                                             |
| 1.10  | both   | impact-head-deep at 142 ms                                              |
| 1.25+ | both   | impact-off-face at about 20 ms                                          |

The trace at power 1.1 (fitted hold):

1. Through the push the lean slips from 31° to 25°.
2. At about 100 ms reach runs out and the top hand eases to a stop.
3. The bottom hand's carry (`carryAt`) turns the shaft about the top hand, and the head swings under the hands.
4. Meanwhile the top hand sinks from about 600 mm to about 560 mm.
5. The head is 1 mm deep at 142 ms, with 123 N from the turf, and 9.8 mm deep at 193 ms.

The cause is geometric. The head's lowest point is about 0.59 m from the top hand, and the top hand is about 0.59 m
up at contact. So a head turning about a top hand held at that height reaches the turf at vertical, before the hand
even sinks.

## 2. The rulings this implements

Both rulings are the user's, made on 2026-11-14 (memory `roll-push-flat`). The hand positions stay as ruled, and this
design moves none of them (memory `hands-validity-source`).

1. The push: "the player's goal is to maintain a forward motion of the mallet head, parallel to the plane of the
   lawn, maintaining the lean for as long as reach permits."
2. The end of reach: "top hand slows and the mallet head continues but fixed by the shaft. Thus arcing around which
   [causes] the top hand to rise a little and the bottom hand more."

The user also confirmed a sketch of the motion on 2026-11-14:
- Through the push, the head runs flat with the lean held.
- At the end of reach, the top hand eases to a stop and rises just enough for the arcing head to clear the turf.
- The head swings past the hands and up, and the bottom hand rises more than the top hand.

Ruling 2 carries no qualification on power, so the rise applies at every power.

## 3. Design

### 3.1 The finish: the top hand rises with the turn

Today the top hand's height through the finish comes from the hands' arc: `arcHeight`, with `handArcRadius` = 1.5 m,
at the top hand's stop on that arc (`handsFinishAt`, `carryPivot`). This design adds a rise R to it:

    z_T(t) = z_arc(s(t)) + R(θ(t))

**The head's depth, d(θ).** d is how far the head's lowest point lies below the top hand at pitch θ, measured in the
swing plane with the head square to the shaft. It is taken over the head's true section:

    d(θ) = (r + h)·cosθ + a·|sinθ| + b·cosθ + e

- r is `arc.radius`, from the top hand to the socket.
- h is `faceHalfHeight`: the socket stands h above the head's centre.
- For a box (the default head): a = L/2 − e, b = h_z − e, and e is the edge radius.
- For a cylinder: a = L/2, b = ρ, and e = 0.

`prepareTrack` already takes the `MalletHead`. It stores r + h, a, b and e on the `Push`, so `carryPivot` needs nothing
more.

**The pitch θ.** R reads the kinematic pitch: `heldPath` plus `carryAt`. That is the planned pitch exactly when
`slopeHold` = 1, which is every roll's default. It never reads the free table. The free table's α reads the pivot
(`freeAlpha` → `pivotAt`, and `computeFree` while building it), so reading it would make R recurse. On a push with a
`stroke.slopeHold` below 1, R is therefore an approximation from the kinematic part, and the code says so.

**The rise, R.** Through the finish the planned pitch only moves one way:
- the carry's rate V·(1 − g)/r is never negative;
- the held path's rate decays monotonically to rest.

So R has a closed form:

    R(θ) = d(min(θ, θ*)) − d(θ₀)   while that is positive, else 0

- θ₀ is the pitch at the finish's start (`push.finish.from`).
- θ* is d's peak, where tan θ* = a/(r + h + b), about 12° short of vertical on the default head.
- R grows while the head would otherwise fall. From θ* on, R holds: the top hand stays up and the head swings up past
  the hands.
- `prepareTrack` asserts the monotonicity (θ is non-decreasing over the finish, sampled at its steps). If a stroke
  breaks it, the assertion fails loudly instead of letting R go wrong in silence.

**The arc's own rise.** z_arc already rises a little in the finish, because the top hand's stop carries it V·HAND_EASE/2
along the arc past its lowest point. R is added on top of that rise, not netted against it. So the head's lowest point
never falls below its height at the push's end, and it ends up to the arc's own rise above it: at most about 20 mm at
the full roll's powers.

**Continuity.**
- At the finish's start, θ̇ and θ̈ from the carry are both 0, which is the minimum-jerk stop (`handsFinishAt` at x = 0).
  So the hands' place, velocity and acceleration are all continuous there.
- At θ*, R′ = 0, so the velocity is continuous. The acceleration steps by R″·θ̇².

**Amendment 1 (implementation, 2026-11-14).** The continuity claim above was wrong. At the finish's start the held
pitch is still turning: the text book is planned at −27.0° there, not at its −31° contact pitch. So R's rate starts
non-zero, and the top hand's planned vertical velocity stepped by 0.15 m/s at power 1.1. The rise is therefore phased
in on the top hand's own minimum-jerk stop:
- R_eff = g·R, with g = x³(10 − 15x + 6x²) over the finish's ease, from `from` to `apex`, the same ramp as
  `handsFinishAt`;
- after the apex, R_eff = R.

This keeps place, velocity and acceleration continuous at the finish's start. While R is being phased in, the arc's
own rise covers the shortfall. At powers 0.8, 1.1 and 1.25 the planned head never dips below its height at the push's
end (worst dip 0.00 mm; head at 36–37 mm there).

**Assumption A1.** That acceleration step is accepted: it is a jerk spike in the hands' feed-forward, not a jump in
place or velocity. If the chains ring on it, replace the hold with a minimum-jerk blend over HAND_EASE.

**The bottom hand.** No law of its own. It sits on the rigid shaft, so once the head swings past vertical it rises more
than the top hand. That is ruling 2's "the bottom hand more", and it follows from the geometry. It happens only if the
planned turn passes vertical (see Q1).

**Where.**
- `carryPivot` in `src/engine/impact/track.ts` gains R and its derivatives:
  - Ṙ = R′(θ)·θ̇ and R̈ = R″(θ)·θ̇² + R′(θ)·θ̈ before θ*;
  - 0 from θ* on.
- `handsAt` and the hands' feed-forward pick R up through the pivot, unchanged.

**Assumption A2.** `followThrough` and HAND_EASE keep their preset values. The full roll's `followThrough` is 0, so its
turn brakes over HAND_EASE from the apex.

**Open question Q1 (the user's hypothesis, 2026-11-14).** How far the arc carries, and how fast the top hand eases, may
need to vary with power, and with the ratio that separates a pass roll from a full roll. The finish can affect the ratio
only while the striker's ball is still on the face. The lab step in §4 settles it.
- **The ball leaves the face before reach runs out.** The finish only has to keep the head clear, and A2 stands.
- **The ball is still on the face.** Then `followThrough` and the ease become quantities that vary with power and roll
  type. The design is amended to state them as a law of power, which the envelope maps. The amendment goes to the user
  before any implementation.

### 3.2 The push: the lean held while reach lasts

Ruling 1 asks for the lean to be held through the push. The full roll's planned slope is already held:
- `slopeHold` is 1.
- After the pulse window, `heldPath` brings the turn's rate to rest over one more window, then holds θ.
- The hands' arc sags only about 7.5 mm over a 0.30 m push on a 1.5 m radius.

So the plan already runs close to flat, and the 31° → 25° slip at power must come from one of two places:
- **The plan's own residual turn**, ω_e·W/2 in `heldPath`.
- **The hold yielding.** The pitch hold's moment is bounded by holdFirmness × `gripCouple`.

**First evidence (2026-11-14).** The plan alone turns the text book from −31.0° at contact to:

| Power | Planned pitch at the push's end | Push ends at |
|-------|---------------------------------|--------------|
| 0.8   | −27.7°                          | 120 ms       |
| 1.1   | −27.0°                          | 66 ms        |
| 1.25  | −27.1°                          | 52 ms        |

That accounts for about 4° of the 6° slip at power 1.1. The remainder, and the hold's moment against its bound, are
still for the trace below.

This design pre-commits no fix for either. Its first implementation step traces, at powers 0.8 (a clean control), 1.1
and 1.25:
- the planned θ and the actual θ through the push;
- the pitch hold's moment and its bound.

It then stops and reports to the user with the trace and the cause. A fix comes as an amendment to this section,
stating the changed law and its continuity, and it is agreed before it is built.
- If the hold saturates, that is a gripping question, and holdFirmness is not tuned on the step's own initiative.
- The trace also shows whether the failure at 1.25+ around 20 ms lies in the push or in the pulse and strike.

### 3.3 Out of scope

- The hand positions, the hands' law, and the text books' leans.
- The stops. They have no push, so R is never evaluated.
- The hand-over engine error at power 1.05 (found hold). It is a second contact after the strike, so the flat finish
  should remove its trigger. If it survives §3.1, it becomes its own investigation.

R applies to the half roll too, which leans and carries for `followThrough` = 0.2. Its finish changes; whether its
records move is checked in §4.

## 4. Verification

**Unit tests** (`src/engine/impact/track.test.ts`):
1. On the text-book full roll's geometry at power 1.1, the planned head's lowest point never falls below its height at
   the finish's start, from that start to rest.
2. The top hand's planned place and velocity are continuous at the finish's start and at θ*. Sample either side at
   1 µs.
3. With no push, the planned pivot equals the current one bit for bit.
4. On a planned turn that passes vertical, the bottom hand's rise from the push's end exceeds the top hand's.
5. d(θ) matches a brute-force lowest point of the head's section, for the box and the cylinder, at pitches from −40° to
   40°.

**Baseline.** Both the old and the new runs are generated locally, in the same session, at the same shards:
- the old one from the engine at c1e91a2 (pre-change, the hands from the lean);
- the new one from the change.

The powers are the map grid's for the type (`gridFor(type).powers` in `scripts/pushMapGrid.ts`). The runs are:
1. The text book on both holds at those powers, on the full roll.
2. Stage 1 for the full roll (`SECTION=run TYPE=full-roll STAGE=1`, 3 shards).
3. Stage 1 for one half-roll plan.

**Gates.**
- **Above power 1.0.** Each verdict is reported against the table in §1. The target is clean.
- **Cells clean on the baseline.** R changes their finish, so they are not expected to match bit for bit. The verdict
  must not change, and the ratio and distances must stay within 1 % (assumption A4). Any cell that moves further is
  listed. That is evidence for Q1 that the finish is shaping the shot, and it is reported to the user before going on.

**Q1.** This reads the face–ball contact intervals the impact already records (`ContactInterval` `start` and `end` in
`src/engine/impact/types.ts`), so nothing new is instrumented.
- **Full roll, at the grid's powers:** the last face–ball interval's end, against `push.end` and the finish's apex; and
  the planned pitch at rest.
- **Pass roll:** measured only if the full roll shows the ball still on the face when reach runs out.

**Results (2026-11-14, §3.1 with amendment 1, uncommitted engine).**

Text book on the 10 s lawn, old against new:

| Power | Old (both holds)                     | New (both holds)                          |
|-------|--------------------------------------|-------------------------------------------|
| 1.05  | engine error (found), off-face       | unpractised `follow-turf-yield`           |
| 1.10  | `impact-head-deep`                   | unpractised `follow-turf-yield`           |
| 1.25+ | off-face at about 20 ms              | unchanged (inside the push, as A3 expects) |

The ratio gate fails on the found hold:

| Power | Old ratio | New ratio |
|-------|-----------|-----------|
| 0.35  | 1.016     | 1.074     |
| 0.50  | 1.286     | 1.367     |
| 0.65  | 1.544     | 1.725     |

On the fitted hold the ratios held within 1 % except at 0.8 (1.296 → 1.243) and 1.0 (1.207 → 1.178).

Five pinned tests fail on these values: `pushMapRun.test.ts` (4) and `firmness.test.ts` (1).

**Q1, measured.** The striker's ball, on its last face interval:

| Power | Full roll                                        | Pass roll                    |
|-------|--------------------------------------------------|------------------------------|
| 0.2   | leaves before reach runs out                     | leaves before reach runs out |
| 0.35  | on the face from about 23 ms to the impact's end (450 ms), through the push's end (274 ms) and the finish's apex (374 ms) | same               |
| 0.5   | same as 0.35                                     | same, and the face also touches the croqueted ball at about 316 ms |
| 0.65+ | leaves before reach runs out (e.g. at 113 ms against 148 ms at 0.65) | leaves before reach runs out |

So at about 0.35–0.5 the finish does shape the shot, and Q1's second branch holds. The amendment stating
`followThrough` and the ease as a law of power goes to the user before it is built.

**Visual.** The viewer's side view at powers 0.8, 1.1 and 1.25, for the user to judge against the agreed sketch. Model
output is not evidence that the motion is right; the user's judgement is.

**Then.** Re-dispatch the envelope as Task 7 plans, with the same per-type dispatches.
