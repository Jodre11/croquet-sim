# Rolls: flat push, rising finish — design

Status: draft, 2026-11-14. Part of the hands-from-lean work (PR 2, branch `hands-from-lean`); it lands before the
envelope is re-dispatched (plan `2026-11-12-hands-from-lean.md`, Task 7).

## 1. Why

On the hands from the lean, the text-book full roll is clean up to power 1.0 and gets the right ratio at short range
for about half the old effort. Above power 1.0 it fails. The strike itself does not change with power: the shaft
is at 31° and the ball is within 0.4 mm of the face's centre. What fails is what follows the strike:

| Power | Hold   | Outcome                                                                 |
|-------|--------|-------------------------------------------------------------------------|
| 1.0   | both   | clean, 8.36 m on the 10 s lawn, slips in the follow-through            |
| 1.05  | found  | engine error (hand-over: head overlaps the ball, 0.093 m sideways move) |
| 1.05  | fitted | impact-off-face at 146.7 ms                                             |
| 1.10  | both   | impact-head-deep at 142 ms                                              |
| 1.25+ | both   | impact-off-face at about 20 ms                                          |

The trace at power 1.1 (fitted hold) shows these steps:

1. Contact. The top hand is at about 600 mm.
2. During the push, the lean slips from 31° to 25°.
3. At about 100 ms the push runs out of reach. The top hand eases to a stop.
4. The bottom hand's carry (`carryAt`) turns the shaft about the top hand, so the head swings under the hands.
5. The top hand sinks to about 560 mm, and the head reaches the turf as the shaft passes vertical. It is 1 mm deep at
   142 ms, with 123 N from the turf, and 9.8 mm deep at 193 ms.

The cause is geometric. The head's lowest point is about 0.59 m from the top hand, and at contact the top hand is about
0.59 m above the lawn. A head that turns about a top hand held at that height reaches the turf at vertical even before
the hand sinks.

## 2. The rulings this implements

The user ruled on two points on 2026-11-14 (memory `roll-push-flat`). Hand positions stay as ruled; this design moves
none of them (memory `hands-validity-source`).

1. The push: "the player's goal is to maintain a forward motion of the mallet head, parallel to the plane of the
   lawn, maintaining the lean for as long as reach permits."
2. The end of reach: "top hand slows and the mallet head continues but fixed by the shaft. Thus arcing around which
   [causes] the top hand to rise a little and the bottom hand more."

The user confirmed the sketch of this behaviour on 2026-11-14:
- through the push, the head runs flat with the lean held;
- at the end of reach, the top hand eases to a stop and rises just enough for the arcing head to clear the turf;
- the head then swings past the hands and up, and the bottom hand rises more than the top hand.

## 3. Design

### 3.1 The finish: the top hand rises with the turn

Today the top hand's height in the finish comes from the hands' arc (`arcHeight`, radius `handArcRadius` = 1.5 m),
evaluated at the top hand's stop on that arc (`handsFinishAt`, `carryPivot`). This design adds a rise R to that
height. R is a function of the shaft's planned turn:

    z_T(t) = z_arc(s(t)) + R(θ(t))

- θ(t) is the planned pitch, i.e. the pendulum plus the carry (`carriedPendulum`).
- θ₀ is the pitch at the start of the finish (`push.finish.from`).
- d(θ) is how far the head's lowest point lies below the top hand at pitch θ. It comes from `arc.radius` (top hand to
  socket) and the `MalletHead` (half-length and radius), with the head square to the shaft.
- R(θ) = max over θ′ between θ₀ and θ of max(0, d(θ′) − d(θ₀)).
  - So the top hand rises exactly as far as the head would otherwise fall below its height at the push's end.
  - Once risen, it holds.
  - R = 0 before the finish, and R = 0 for any turn that never lowers the head.

Its derivatives are Ṙ = R′(θ)·θ̇ and R̈ = R″(θ)·θ̇² + R′(θ)·θ̈ while the head is still falling, and zero once R holds.

**Continuity.**
- At the finish's start, θ̇ and θ̈ from the carry are both 0 (the minimum-jerk stop, `handsFinishAt` at x = 0), so the
  hands' place, velocity and acceleration are continuous there.
- Where the hold engages, R′ = 0 (d is at its peak), so the velocity is continuous. The acceleration steps by
  R″·θ̇².

**Assumption A1.** That acceleration step is accepted. It is a jerk spike in the hands' feed-forward, not a jump in
place or velocity. If the chains ring on it, replace the hold with a minimum-jerk blend over HAND_EASE.

**The bottom hand.** No law of its own. It sits on the rigid shaft, so as the head swings forward past vertical it
rises more than the top hand. That is ruling 2's "the bottom hand more", which falls out of the geometry.

**Where.** `carryPivot` in `src/engine/impact/track.ts` gains the rise term. The rise needs θ, so it reads
`carriedPendulum`; `pivotAt` is evaluated before the pendulum in `pathAt`, and that order must be checked so the rise
does not recurse. `handsAt` and the hands' feed-forward pick it up through the pivot unchanged.

**Assumption A2.** In this design, `followThrough` and HAND_EASE keep their preset values. The full roll's
`followThrough` is 0, so its turn brakes over HAND_EASE from the apex. With the rise, the head clears wherever that
turn ends.

**Open question Q1 (the user's hypothesis, 2026-11-14).** How far the arc carries, and how fast the top hand eases,
may need to vary with power, and with the ratio that separates a pass roll from a full roll. The finish can affect the
ratio only while the striker's ball is still on the face. The lab step in §4 therefore measures, at each power and for
each roll, when the ball leaves the face relative to the end of reach.
- **The ball leaves before reach runs out.** The finish only has to keep the head clear, and A2 stands.
- **The ball is still on the face.** `followThrough` and the ease become quantities that vary with power and roll type.
  The design is amended to state them as a law of power, and the envelope maps them. The amendment goes to the user
  before it is implemented.

### 3.2 The push: the lean held while reach lasts

The full roll's planned slope is already held (`slopeHold` = 1). After the pulse window, `heldPath` brings the turn's
rate to rest over one more window and then holds θ. The hands' arc is close to flat: over a 0.30 m push on a 1.5 m
radius, its sag is about 7.5 mm.

So in the plan the head already runs close to flat, and the 31° → 25° slip at power is the execution departing from
it. Before anything changes here, the first implementation step decides which of two causes it is. It traces, at
powers 0.8, 1.1 and 1.25:
- the planned θ against the actual θ through the push;
- the pitch hold's moment against its bound, holdFirmness × `gripCouple`.

- **The hold saturates** (the moment sits on its bound). The grip cannot hold the lean at that power. Raising the
  bound is a gripping question, not a path question, so the step stops and reports to the user with the trace. It
  does not tune holdFirmness on its own initiative.
- **The plan itself turns** (the residual ω_e·W/2 of `heldPath`, or the pulse running into the push). The held slope
  ends at θ₀, the pitch at contact, through the whole push length. The pulse's θ still ends where it does today, so
  the strike is unchanged.

**Assumption A3.** The failure at about 20 ms from power 1.25 lies inside the push. §3.1 does not reach it, so §3.2 is
the candidate fix. If the trace shows a cause other than the lean, the step reports it and the design is amended
rather than widened.

### 3.3 Out of scope

- Hand positions, the hands' law and the text books' leans.
- The stops: they have no push, so the rise is never evaluated for them.
- The half roll: R is evaluated for every push, but on the low-power half roll the head does not fall below its
  push-end height, so R stays 0 and its records should not move. The verification checks this.
- The hand-over engine error at power 1.05 (found hold). It is a second contact after the strike, so the flat finish
  should remove its trigger. If it survives §3.1 and §3.2, it becomes its own investigation.

## 4. Verification

**Unit tests** (`src/engine/impact/track.test.ts`):
1. On the text-book full roll's geometry, at power 1.1, the planned head's lowest point never falls below its height
   at the finish's start from that start to rest.
2. The top hand's planned place and velocity are continuous at the finish's start and where the hold engages (sampled
   either side at 1 µs).
3. With no push, and on a push whose turn never lowers the head, the planned pivot equals the current one bit for bit.
4. The bottom hand's rise from the push's end to rest exceeds the top hand's, on the text-book full roll at power 1.1.

**Lab, locally, before any dispatch:**
- The text book at the same 14 powers on the found and fitted holds.
  - Target: clean beyond power 1.0.
  - Whatever still fails is reported by verdict, against the table in §1.
- Stage 1 for the full roll (`SECTION=run TYPE=full-roll STAGE=1`, 3 shards), compared cell by cell with the run of
  2026-11-14 on the new hands.
  - The low-power cells must not move.
- The half roll's stage 1 for one plan, to confirm it does not move.
- For Q1, on the text-book full and pass rolls at each of the 14 powers: the time the striker's ball leaves the face,
  against the push's end (`push.end`) and the finish's apex.

**Visual:** the viewer's side view at powers 0.8, 1.1 and 1.25, for the user to judge against the agreed sketch. Model
output is not evidence that the motion is right; the user's judgement is.

**Then:** re-dispatch the envelope as planned in Task 7, with the same per-type dispatches.
