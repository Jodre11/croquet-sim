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

**Amendment 2, tried and refuted (2026-11-14).** The law under test: the top hand stops with bounded deceleration, so
the ease and `followThrough` scale by min(1, V/V_ref), with V_ref = 4 m/s. Above V_ref nothing changed: 1.05–1.10
stay `follow-turf-yield`, and 1.25+ are unchanged. Below it, the found hold got worse:

| Power | Ratio, baseline | Ratio, rise only | Ratio, rise + amendment 2 | Striker (m), baseline | Striker (m), amendment 2 |
|-------|-----------------|------------------|---------------------------|-----------------------|--------------------------|
| 0.35  | 1.016           | 1.074            | 3.371                     | 1.97                  | 0.26                     |
| 0.50  | 1.286           | 1.367            | 1.388                     | 2.37                  | 1.28                     |
| 0.65  | 1.544           | 1.725            | 1.197                     | 3.41                  | 2.47                     |
| 0.80  | 1.759           | 1.719            | 1.485                     | 4.11                  | 2.49                     |

A shorter, sharper stop while the striker's ball is still on the face leaves that ball short. So the direction is
wrong: if the finish varies with power, a slow finish should be longer and gentler, not shorter. The fitted hold
barely moved (0.65: 1.278 → 1.375; elsewhere within about 1 %).

**Amendment 3, tried (2026-11-14).** The opposite law: the top hand eases over the same distance, so below
V_ref = 4 m/s the ease and `followThrough` stretch by V_ref/V, capped at 5×. At power 0.35 the ease takes 363 ms.
Above V_ref nothing changes.

Full roll, found hold, against the baseline:

| Power | Ratio, baseline | Ratio, new | Striker (m), baseline | Striker (m), new |
|-------|-----------------|------------|-----------------------|------------------|
| 0.35  | 1.016           | 1.000      | 1.97                  | 1.96             |
| 0.50  | 1.286           | 1.285      | 2.37                  | 3.29             |
| 0.65  | 1.544           | 1.621      | 3.41                  | 4.90             |
| 0.80  | 1.759           | 1.475      | 4.11                  | 5.72             |
| 1.00  | 1.224           | 1.247      | 8.36                  | 8.68             |

On the fitted hold, 0.8 goes from 1.296 to 1.186 and 1.0 from 1.207 to 1.112. The 1 % gate fails at 0.65 and 0.8,
but the moves are towards ratio 1, the full roll's own, and the same effort carries further.

Pass roll, run on both engines the same day:
- Found hold, at 0.5–1.0 the ratio rises by 0.02–0.05 (0.753 → 0.806 at 0.5), towards the full roll's. The pass roll's
  distinction from the full roll narrows slightly.
- At 1.05 the found hold goes from clean to `follow-turf-yield`; the fitted hold already failed that way.
- The fitted hold is within 1 % throughout.

Half roll: unchanged up to power 1.05 (clean cells within 1 %). Above that it is superhuman on both engines.

Still open after amendment 3:
- `follow-turf-yield` at 1.05–1.10, on the full and pass rolls: the planned head clears, so the actual head sinks
  below its plan.
- Off the face at 1.25+ (§3.2).

**Amendment 4, practice's release (2026-11-14/15).** Diagnosis of the grounding at 1.05–1.10:
- With the hands 31° ahead, the face tilts down onto the striker's ball and rides up it. The balls push the face up
  with about 400 N in the first 5 ms, then 50–90 N for about 40 ms; the hands press down with 40–135 N.
- So the head rises 50–70 mm off its plan during the push. The lean does not slip.
- Practice learns a lowering to hold the head down (as much as −67 mm). Under the 2026-10-31 rule it is carried
  through the finish. Once the ball has gone nothing holds the head up, so it grounds at about 150–200 ms.

The law: the push's correction answers the balls' load on the face, so once the balls are done with the face the hands
ease a lowering off.
- **Parts.** Practice stores its lift as a push part P and a finish part F (`Lift.parts.finish`). Over the finish the
  total is unchanged from the 2026-10-31 rule, −w·(max(e(T), 0) + min(e, 0)). P carries −w·e(T) and F only the drops
  beyond T's, so each part is continuous at T.
- **When.** From the impact's end, or the push's end if later (`releaseLift`, called in the follow-through). The
  impact's end is the integrator's own judgement that the balls are done with the face.
- **How.** P's value there eases to 0 by the minimum-jerk ramp over the pendulum's window; F runs on. A raise
  (P ≥ 0) answers no load from the balls and stays. The free table is re-tabulated from the release.

Tried and rejected on the way:
- **Release predicted from the previous pass's last face contact.** The previous pass had less lowering, so its ball
  left earlier. The fade then began with the ball still on the face, and below power 1 the clean cells moved (full
  roll 0.5: 3.29 → 2.16 m).
- **Release at the first step without face contact.** The face taps the ball, and a gap between taps fired it: pass
  roll 0.8 has a 1.4 ms gap at the push's end with the ball on the face until 191 ms. Adding the end rule's
  look-ahead did not help, because the tapped ball briefly outruns the head. Both went `impact-off-face`.
- **Parts split as P = −w·max(e(T), 0) and F = −w·min(e, 0).** Each part steps at T when e(T) < 0. A release at T
  (the full roll at 0.35, whose impact ends before its push) stepped the plan 18 mm in 2 ms and threw the head.

Results, stage 1, 10 s lawn, against amendment 3:
- Every cell from 0.35 to 0.8 is unchanged on all three rolls, at both holds.
- Full roll at the found hold: 1.05 is clean (14.61 m, ratio 1.069), and so is 1.10 (16.98 m, 1.219). At the
  fitted hold, 1.05 is still `follow-turf-yield` and 1.10 is `turf-yield`.
- Pass roll: 1.05 and 1.10 are clean at both holds.
- At 1.0 the found-hold cells move: full roll 8.68 → 8.38 m, ratio 1.247 → 1.419; pass roll 8.52 → 9.22 m. The full
  roll's fitted-hold cell goes 7.82 → 6.88 m.
- Half roll: unchanged.

Still open after amendment 4:
- Off the face at 1.25+ (§3.2), and the hands' share of holding the face down (press down, or ease the lean).
- The user's view (2026-11-15): on the rolls, the full roll most, the flick at release (the arc and the bottom hand's
  push-through, with the top hand's rise correlated) is muted. Amendment 3 stretches a slow finish so that its turn
  no longer falls with power.

**Amendment 5, the follow-through meets the balls (2026-11-15).** Diagnosis. In the working full rolls (0.8 at hold
0.2, 1.0 at hold 0.5) the impact ends at 103 ms. The follow-through then runs the head back into the striker's ball
from 116–123 ms until 238–262 ms, up to 18–22 mm deep. Nothing checks this: the follow-through has no balls, so the
judge never sees the contact and the balls are handed over as though it never happened.
- **Cause.** During the push the ball holds the head about 44 mm behind its path. Once the ball leaves, the hands
  pull the head back onto the path. The head surges to 3.25 m/s against the ball's 3.0 m/s and catches it.
- **Why the end rule misses it.** The rule looks 30 ms ahead at the head's speed, or the path's if faster. At the
  parting both are below the ball's speed (2.86 and 2.52 m/s), and the surge comes later.
- **The pass rolls do not do this.** Their heads stay clear of both balls after the parting.

The law:
- **Check.** After a tracked stroke's follow-through, the head at each follow-through sample is tested against each
  ball, carried on in a straight line from the impact's end at its velocity there (`headBallContact`).
- **Replay.** If the head touches a ball at sample time t, the stroke is integrated again from the start with the
  impact held open until t. From then on the usual end rule applies, so the contact is integrated, judged and
  handed over like any other. The check repeats on the new follow-through until no further catch is found, or until
  the catch lies past the impact's cap.
- **The parting stays where it was.** Amendment 4's release and a check's hold still start from the first end the
  rule found, not from the held-open end, so the replay follows the same head path up to the catch.
- **Assumptions.**
  - A stop (finish kind `check`) is not replayed: its pendulum is held after the check (Riches: no follow-through).
  - The straight-line carry ignores the turf's drag on the ball. A slower ball would be caught sooner, so a marginal
    catch can be missed. Integrating the replayed contact is exact; the carry only decides whether to replay.
- **Cost.** A stroke without a catch is bit-identical. A stroke with one is integrated again (twice or more).

**Amendment 6, no added pace after the parting (2026-11-15).** Amendment 5's check showed the half roll catching its
ball too. Its canonical ratio of about 2.1 depended on the head passing through the striker's ball unchecked. With
the check in place, the half roll at 0.5 was unlawful (29.1.6.1), and at 0.891 it was off the face at 150 ms.
- **Cause.** The lag (amendment 5) is only part of it. The plan holds the head at a level 1.8 m/s for 0.3 s after
  the parting: the hands slow as the swing takes over (§3.1). The balls' load slows the head to 0.9–1.3 m/s during
  contact, and the striker's ball leaves at 1.58 m/s. So the hands speed the head back up past the ball, to 2.07 m/s,
  even on a path moved back by the lag.
- **The user's ruling (2026-11-15).** The surge is only needed for added power, before the ball leaves.

The law:
- **Re-anchor.** At the parting (the first end the rule finds, `reanchor`), the hands' path is changed. The rate k is
  the head's along-aim speed over the planned head's, held to [0, 1]. From the parting on, the plan runs at k times
  its own pace, with velocities scaled by k and accelerations by k². It also moves back along the aim by the
  socket's lag behind the path. So the hands carry on from where the head is, no faster than it.
- **Scope.** A head already level with or ahead of its path keeps its place. One at or above the plan's pace keeps
  its pace. A stroke with no push is unchanged.
- **The free pendulum's table is not re-run.** The re-anchor is kinematic: the hands follow the planned path, slowed.
- **Amendment 5's check stays.** It now finds what catches remain, if any, from the hands' actual follow-through.
- **Assumptions.**
  - The lag across the aim and the pitch's lag are kept, since the surge runs along the aim.
  - k comes from the head's speed at the parting step. The hands' flex oscillates through the push, so k can move
    with it from one power to the next.
- **The impact is the same with or without the follow-through.** A bare impact (`integrate`) also runs the catch
  check, so the shot's impact equals `simulateImpact`'s (exit criteria 3 and 4). It looks only as far as the impact's
  cap, since a catch at or past the cap is not replayed.

Results (10 s lawn; the text books, like for like):

| Stroke | Before amendment 5 | Amendment 5 alone | Amendments 5 and 6 |
|---|---|---|---|
| Half roll 0.891 (canonical) | clean, ratio 2.10 | off the face at 150 ms | clean, 1.75 m, ratio 2.099 |
| Half roll 0.5, found hold | clean | unlawful (29.1.6.1) | clean, 0.66 m, ratio 1.946 |
| Full roll 0.8, hold 0.2 | 4.59 m, 1.101 | off the face | 4.59 m, 1.101 |
| Full roll 1.0, hold 0.5 | 6.88 m, 1.10 | 8.34 m, 1.137 (catch) | 6.89 m, 1.100 |
| Pass roll 0.8, hold 0.15 | 4.72 m, 0.958 | off the face | 4.68 m, 0.987 |

- **No catch remains.** None of the swept cells catches a ball after the parting: pass and full rolls at 0.5, 0.8
  and 1.0 over holds 0.1–1, and the half roll at its canonical power. The other swept cells moved by 0.01 m or less.
- **One catch remains: the unpractised canonical full roll.** Played without practice, it is off the face at 47 ms,
  and its head then catches the ball and rides it to the cap. The practised stroke does not do this.
- **Re-pinned.** The pinned plays moved by at most 0.003 in ratio. The pass roll's canonical ratio moved from 0.884
  to 0.8835. The full roll's found-hold sample at p = 1 now holds at firmness 0.188 (was 0.183), and its ratio on
  the 10 s lawn fell from 1.419 to 1.256. That change has not been traced to a cause.
- **Cost.** A bare impact now also runs its follow-through up to the cap. The firmness searches are about twice as
  slow.

**Visual.** The viewer's side view at powers 0.8, 1.1 and 1.25, for the user to judge against the agreed sketch. Model
output is not evidence that the motion is right; the user's judgement is.

**Then.** Re-dispatch the envelope as Task 7 plans, with the same per-type dispatches.
