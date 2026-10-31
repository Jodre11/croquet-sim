# P2b.2b.2c.3c — The level head: design

**Status:** draft for the user's review, 2026-10-31.

**Context.** The push map (P2b.2b.2c.3b) paused at its gate 2: the full and pass roll regions are almost empty because
the follow-through yields the turf. A side-on trace showed why (push-map spec, amendment A6): the planned head path
stays clear of the turf, but the played head leaves it. Through contact the head lags and the shaft tilts back; the
hands then stop at once at the push length and the arms' hold relaxes from the ball's first departure, so the mallet
swings through vertical as a free pendulum and digs at the bottom of that swing.

The user's ruling (A6, 2026-10-31) sets this phase's aim:

- the player's intent is the head, which travels parallel to the turf through the contact and the push;
- level is a band, not a line: what keeps the face in contact with the ball, or on the path that would keep it;
- the hand's whole path is planned, its dip and rise tied to the lean, anticipating the tilt and the flex in contact,
  more on a harder shot; corrections from feel come only after a reaction delay, so they shape slow pushes alone;
- the hand eases out rather than stopping, and keeps its hold;
- the stroke finishes on one arc, the head carrying on along it and rising; a flick is that arc accelerating;
- the anticipation is learned the way players learn it: by practice strokes. Later, a formula or algorithm may
  pre-calculate it for a given mallet within the envelope (user, 2026-10-31: "initially practice strokes would be the
  optimal way of doing it").

After this phase, 3b re-runs its maps (Tasks 6–8) on the new engine and resumes gate 2.

## 1. Goals

1. A push's head stays level within the band from first contact to the push's end, by a planned path learned from
   practice strokes.
2. The hands carry the head on along its arc after the push's end, so the follow-through rises off the turf.
3. Nothing scripted per stroke type: the practice, the band and the finish apply to every stroke with a push.

## 2. What changes in the engine, as built

| Today (`src/engine/impact/track.ts`) | After this phase |
|---|---|
| The planned pivot (top hand) after contact: `carryPivot`, along aim on the hands' arc, stopping at once at `handReach` | the same arc plus the practised lift δz(t) (§4), and past `handReach` the finish (§5) |
| The arms' hold relaxes from the first departure (`holdWeight`, gate round 13 ruling, 2026-10-12) | the hold stays at full weight through the push and the finish |
| The pendulum phase from `pendulumAt`·`handReach`: the push intent nil and the bottom hand's `pendulumEffort` | unchanged in that the push intent ends there; the mallet is no longer released, because the hold no longer relaxes and the plan still guides it |
| The planned slope (`pendulumAt`, `slopeHold`) | unchanged: the lean's planned course is today's; its tilt under load is what practice anticipates, through the hand's height |

`pendulumAt` and `pendulumEffort` keep their meaning in the inputs table of P2b.2b.2c.3a §2 (3c, after first contact).
The finish reads `drive` (§5). No input is added or removed.

## 3. The band

Level is the head's height at first contact: h₀, the head's lowest point when the face first meets the ball. Its
error at time t is e(t) = h(t) − h₀, h the played head's lowest point.

The band is not a new constant. It is the region in which the played stroke reads clean under the push map's own
classes (push-map spec §4): no `impact-off-face` or off-point mishit (the face's reach about the ball's contact), and
no turf class (`turf-yield`, `follow-turf-yield`, `impact-head-deep`, `follow-head-deep`). A stroke "in the band" is
one that reads none of them; the practice drives e towards 0, and stops when the stroke is in the band.

## 4. Practice strokes

A practised stroke is the same shot, balls and lawn included, played up to `PRACTICE_PASSES` = 3 times:

1. Pass 1 plays the plan as today's track gives it, plus the finish (§5) and the full hold (§2), with δz ≡ 0.
2. After pass k, if the stroke is in the band, it is the result. Otherwise the lift is updated over the practice window
   by δz_{k+1}(t) = δz_k(t) − e_k(t), and the shot is played again. Over the finish only a drop is corrected: there
   e_k is min(e_k, 0), since the finish is meant to rise.
3. After the last pass the stroke is the result whatever it reads: practice that does not reach the band is reported
   as such, not hidden.

The practice window runs from first contact to the end of the follow-through. δz is sampled at the follow-through's
sample step (`FOLLOW_SAMPLE`); e at contact is 0 by definition, so the lift starts continuous. The planned pivot takes
δz as a vertical offset, with V and A from a smooth fit through the samples (the builder's choice of fit, §10), so the
hands' feed-forward includes the lift's acceleration. The lift is part of the plan: `handsAt`, `headOnPath` and
`pathAt` show the practised path.

The flex that practice anticipates is the engine's own: the user takes it to depend only on the impact's power and the
grip's elasticity (2026-10-31), which is what the arm's flex law (`FlexLaw`, its stiffness rising with the force) and
the grip's coupling already model. No flex law is added or changed.

Practice is deterministic: the same shot practises to the same lift. Effort that practice asks beyond a player's
strength already reads as the existing grip-limit and superhuman classes.

**Cost.** A stroke already in the band takes one pass. One that needs practice takes up to three, so the re-run maps
take longer where the rolls need it; the map's sharding and `nice` stay as they are.

**What is kept for later.** Each practised stroke reports its passes and its final lift. The push map records both, so
gate 2 can judge whether a formula or table over the envelope (for a given mallet) can replace practice. Building
that pre-calculation is not this phase's work.

## 5. The finish

Past the push's end (`handReach` along aim), the hands do not stop at once. They carry on along the hands' arc (the
circle of `handArcRadius` whose low point the feet set), which rises beyond its low point, so the head rises with
them. Along the arc their speed changes at the rate the stroke's `drive` sets after first contact: a braking drive
slows them to rest, an accelerating one carries them faster, which is the flick. The follow-through ends as today
(`finished`, the follow cap). The shaft's planned slope runs on as today's plan has it.

Assumption: the finish's deceleration to rest, where `drive` brakes, uses today's ease, V²/(0.4·handReach), the
advance's (P2b.2b.2c.1 §6), so the finish is about as long as the last fifth of the push.

## 6. Feedback after a reaction delay

The user: on a slow push the player has time to adjust; on a harder shot they play through the plan. In this phase
the practised plan already holds the head in the band on slow pushes, and the engine models no disturbance that a
player would feel and correct (the lawn is even, the balls as planned). So no feedback loop is added. It is a
non-goal here (§9), to be revisited when a disturbance is modelled.

## 7. Versions and records

- `ENGINE_VERSION` moves to the next minor: every stroke with a push plays differently.
- The probes' trace (`scripts/pathTrace.ts`) is re-run on the three cases of A6 and kept beside the first trace, with
  each pass's lowest point drawn, so the user can see practice converge.
- The push map's records gain the practice's passes per read and the final lift's extremes; their schema version
  moves with them.

## 8. Tests

1. A stroke already in the band takes one pass and plays bit for bit as pass 1.
2. Today's full roll at its canonical power and the in-band full roll at speedGain 0.5 (A6's cases) practise into the
   band: no turf class and no mishit, within three passes.
3. The lift's update follows §4's rule on a stroke built to miss: δz₂ = −e₁ over the window, and only the drops over
   the finish.
4. The finish rises: on today's full roll, after the push's end the head's lowest point never falls below h₀, and the
   hands' speed along aim never steps.
5. The hold no longer relaxes: the arms' hold weight is 1 through the push and the finish on a stroke whose ball
   departs.
6. A braking `drive` brings the hands to rest past `handReach`; an accelerating one leaves them faster at the push's
   end than a braking one.
7. The stops and drives (no push) play bit for bit as today.
8. Practice is deterministic: the same shot twice gives the same lift and the same read.

## 9. Non-goals

- Feedback after a reaction delay (§6).
- The pre-calculated anticipation (§4, "What is kept for later").
- The side-on swing viewer (the phase after 3b).
- Any change to the strike, the contact laws, the turf laws or the lawn.
- A separate flick input: the flick is the finish at an accelerating `drive` (A6 item 7).

## 10. Left to the builder

- The smooth fit that gives the lift's V and A from its samples, provided P and V are continuous and A bounded.
- Where practice lives: a wrapper around `simulateStroke`, or inside it. Its public result reports the passes and the
  final lift either way.
- The names of the new fields and constants, beyond `PRACTICE_PASSES`.
