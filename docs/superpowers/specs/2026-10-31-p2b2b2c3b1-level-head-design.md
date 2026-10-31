# P2b.2b.2c.3b.1 — The level head: design

**Status:** reviewed (three-lens panel and the user's choices, 2026-10-31); for the user's review.

**Context.** The push map (P2b.2b.2c.3b) paused at its gate 2: in the full and pass roll regions (ratio ≤ 1.2) almost
no plan reads admissible, and turf is the largest class there (at speedGain 0.5, 10 admissible, 439 turf, 333
mishit; push-map probes, `2026-10-29-p2b2b2c3b-maps.txt`). A side-on trace showed why the turf yields (push-map spec,
amendment A6): the planned head path stays clear of the turf, but the played head leaves it. Through contact the head
lags and the shaft tilts back. At the push's pendulum phase the bottom hand opens, the hands then stop at once at the
push length and the arms' hold relaxes from the ball's first departure, so the mallet swings through vertical in pitch
and digs at the bottom of that swing.

The user's ruling (A6, 2026-10-31) sets this phase's aim:

- the player's intent is the head, which travels parallel to the turf through the contact and the push;
- level is a band, not a line: what keeps the face in contact with the ball, or on the path that would keep it;
- the hand's whole path is planned, its dip and rise tied to the lean, anticipating the tilt and the flex in contact
  (which the user takes to depend only on the impact's power and the grip's elasticity); corrections from feel come
  only after a reaction delay, so they shape slow pushes alone;
- the hand eases out rather than stopping, and keeps its hold;
- the stroke finishes on one arc, the head carrying on along it and rising; a flick is that arc accelerating;
- the anticipation is learned the way players learn it, by practice strokes ("initially practice strokes would be the
  optimal way of doing it"); later a formula or algorithm may pre-calculate it for a given mallet within the envelope.

**Name.** P2b.2b.2c.3c is already the swing strokes' hold and grips (push-map spec, A2). This phase is a step inside
3b, which pauses for it: P2b.2b.2c.3b.1. It takes one item from 3c's list, the ease at a push's end (3a A2 item 8),
because §5 is that ease; the user moved it to 3c because it moves every roll, and this phase moves every roll anyway.
The rest of 3c's list stays there, including the bounded roll damper and softer hold onset, and the late re-hit on the
integrated follow-through.

After this phase, 3b re-runs its maps (Tasks 6–8) on the new engine and resumes gate 2.

## 1. Goals

1. A push's head stays level within the band from first contact to the end of the follow-through, by a planned path
   learned from practice strokes.
2. Past the push's end, the hands carry the head on forward and up along their arc, so the follow-through rises off
   the turf.
3. Nothing scripted per stroke type: the practice, the band, the hold and the finish apply to every stroke with a push
   (`handReach` > 0). A stroke without a push plays bit for bit as today.

## 2. What changes in the engine, as built

| Today (`src/engine/impact/track.ts`) | After this phase, on a push |
|---|---|
| The planned pivot (top hand) after contact: `carryPivot`, along aim on the hands' arc, stopping at once at `handReach` | the same arc plus the practised lift δz(t) (§4); past the finish's start the finish (§5) |
| The arms' hold relaxes from the first departure (`holdWeight`; gate round 13 ruling, 2026-10-12) | full weight through the push and the finish |
| The bottom hand opens at the earlier of the forward reach and the pendulum phase (`openBottom`, `releasing`), the top hand then guiding alone and the bottom pushing with `pendulumEffort` until vertical | the bottom hand stays on through the push and the finish (user, 2026-10-31); neither opens it |
| The push intent ends at the pendulum phase (`pushIntent`) | unchanged: `pendulumAt` still ends the push's force there |
| The planned slope (`slopeHold`, the free and held pendulum) | unchanged through the push; held at its push-end value through the finish (§5) |

So on a push `pendulumAt` keeps one meaning (where the push's force ends) and `pendulumEffort` has no effect; both keep
their meaning on a stroke without a push. The user's note for the swing strokes (3c), recorded here: in a drive with
an exaggerated follow-through the bottom hand releases long after the balls have left, as the mallet swings through.

`handReach` now means where the push ends and the finish begins (§5), not where the hands come to rest. No input is
added or removed.

## 3. The band

Level is h₀, the head's lowest point at first contact. The error at time t is e(t) = h(t) − h₀, h the played head's
lowest point.

The band is not a new constant. A played stroke is in the band when it reads none of:

- an `impact-off-face` flag;
- off point: the push map's on-point test (exit criterion 4: the head's centre behind the ball's, every face contact
  point at most R·sin 45° above the ball's centre, the lean at most 45°);
- the impact's `turf-yield` or `impact-head-deep`, or the follow-through's `follow-turf-yield` or `follow-head-deep`.

A plan the planner rejects before play (the head in the turf at contact, a lean past the limit) is not practised: there
is nothing to practise.

The on-point test lives today only in scripts (`scripts/pushMapRun.ts` `onPoint`, a copy of `scripts/strokeProbe.ts`'s).
It moves into the engine beside practice, and both scripts import it.

## 4. Practice strokes

A practised stroke is the same shot, balls and lawn included, played up to `PRACTICE_PASSES` = 3 times. The cap is a
compute budget, not a ruling on what a practised player is (user, 2026-10-31).

1. Pass 1 plays the plan with δz ≡ 0, the full hold, the bottom hand on and the finish (§2, §5).
2. After pass k, if the stroke is in the band, it is the result. Otherwise the lift is updated by
   δz_{k+1}(t) = δz_k(t) − w(t)·e_k(t), and the shot is played again. Over the finish only a drop is corrected: there
   e_k is replaced by min(e_k, 0), since the finish is meant to rise.
3. A stroke still out of the band after the last pass reads a class of its own, `unpractised`, kept apart from turf and
   mishit (user, 2026-10-31), so gate 2 sees whether the cap binds. Its record keeps what its last pass read.

**The window and its edges.** The lift applies from first contact to the end of the follow-through. w(t) is the
minimum-jerk ramp from 0 to 1 over the stroke's own `window` from first contact, so the lift starts with P, V and A all
zero and the pivot's motion stays continuous at contact (e is 0 there but its slope is not). Past pass k's last sample
δz holds its last value, since the follow-through's length differs between passes.

**The plan carries it.** δz is sampled at the follow-through's sample step (`FOLLOW_SAMPLE`). The planned pivot takes
it as a vertical offset, with V and A from a smooth fit through the samples (§10), so the hands' feed-forward includes
the lift's acceleration. `handsAt`, `headOnPath` and `pathAt` show the practised path.

**The flex** practice anticipates is the engine's own: the arm's flex law (`FlexLaw`, its stiffness rising with the
force) and the grip's coupling. No flex law is added or changed. Effort that practice asks beyond a player's strength
already reads as the grip-limit and superhuman classes.

**Cost.** A stroke in the band after pass 1 runs once. One that needs practice runs up to three times, so the re-run
maps take longer where the rolls need it; the map's sharding and `nice` stay as they are.

**Kept for later.** Each practised stroke reports its passes. The push map records them, so gate 2 sees the cost and
the `unpractised` count. Practice is deterministic, so a later phase that pre-calculates the lift can re-derive it.

## 5. The finish

The finish starts at the later of the push's end (the hands at `handReach` along aim) and the impact's end, so it
never adds to the push while a ball is on the face. On today's full roll the hands reach the push length at about
102 ms and the impact ends at 118 ms.

From there the hands do not stop. They carry on along the hands' arc (the circle of `handArcRadius` whose low point the
feet set), forward and up past its low point, from the pivot's planned velocity along aim at the finish's start (the
plan's pace and any advance's together), and ease to rest at the advance's deceleration V²/(0.4·handReach)
(P2b.2b.2c.1 §6), about a further fifth of the push. The planned slope holds at its value at the finish's start, so
the head trails the rising hands and rises with them. The finish takes the plan's own pace: `drive` acts as today, in
contact only, and the flick (an accelerating finish) waits for the side-on viewer phase (user, 2026-10-31).

A carry ends when the hands are at rest and the head is at rest relative to them (`FINISH_SPEED`), as a check does
today; otherwise at the follow cap. The ease's travel, at most 0.2·`handReach`, stays far inside the arc's reach
(s_low + ρ_h, 1.65 m at the presets), so the arc's height is always defined.

## 6. Versions and records

- `ENGINE_VERSION` moves to the next minor: every stroke with a push plays differently.
- `scripts/pathTrace.ts` is re-run, as it is, on A6's three cases, and the result kept beside the first trace.
- The push map's records gain each read's passes and the `unpractised` class; their schema version moves with them.

## 7. Tests

1. A stroke in the band after pass 1 reports one pass and a lift of zero, and runs `simulateStroke` once.
2. Today's full roll at its canonical power and the full roll at speedGain 0.5 (A6's cases) practise into the band,
   with no turf class and no mishit, within three passes.
3. The lift update follows §4's rule on a stroke built to miss: δz₂ = −w·e₁, with only the drops corrected over the
   finish, and δz₂ held past pass 1's last sample.
4. The pivot's position and velocity are continuous at first contact and at the finish's start on a practised stroke.
5. The finish rises: on today's full roll, after the finish's start the head's lowest point stays above h₀, and the
   hands' speed along aim never steps.
6. On a push the hold weight stays 1 through the push and the finish, and the bottom hand never opens, on a stroke
   whose ball departs.
7. The finish starts no earlier than the impact's end, and the hands come to rest within 0.2·`handReach` past
   `handReach`.
8. A stroke still out of the band after three passes reads `unpractised`.
9. Strokes without a push (the stops and drives) play bit for bit as today.

## 8. Known risks for gate 2

- The full hold and the lift both ask more of the hands, so some reads that were turf may read superhuman instead.
  Superhuman is already the largest class over the whole full-roll map; gate 2 compares the classes before and after.
- If practice rarely converges in three passes, the `unpractised` count shows it, and the cap is revisited there.

## 9. Non-goals

- Feedback after a reaction delay: the practised plan already holds slow pushes in the band, and the engine models no
  disturbance a player would feel and correct (the lawn even, the balls as planned). Revisited when one is modelled.
- The pre-calculated anticipation (§4, "Kept for later").
- The flick, until the side-on viewer phase (§5).
- The swing strokes' late bottom-hand release (3c, §2).
- The side-on swing viewer (the phase after 3b).
- Any change to the strike, the contact laws, the turf laws or the lawn.

## 10. Left to the builder

- The smooth fit that gives the lift's V and A from its samples, provided P and V are continuous and A bounded.
- Where practice lives: a wrapper around `simulateStroke`, or inside it. Its public result reports the passes either
  way.
- The names of new fields and constants, beyond `PRACTICE_PASSES` and `unpractised`.
