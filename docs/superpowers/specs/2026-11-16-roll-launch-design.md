# Roll launch: the hands after impact, and the balls' friction: design

Status: drafted 2026-11-16, for review. Branch `hands-from-lean`.

## 1. Why

Against Gugan's nine filmed rolls (Gugan 4, Table 6, https://oxfordcroquet.org/tech/gugan4/), the lawn is no longer the
gap (speed-dependent lawn design §6): run through the lawn, the model's launches give the model's travels, and
Gugan's give his. The launches are wrong. A step-by-step trace of C10H (half roll, U 6.5 m/s, 13 s lawn, preset hold)
found two causes.

**The hands chase a swing that never slowed.** From contact each hand flexes, a spring and damper on its hand–arm
chain, towards its point on the planned path (`carryLoad`, `src/engine/impact/track.ts`). The plan never slows for the
impact: the head falls from 6.5 to 2.5 m/s in the first 0.6 ms while the plan carries on, so the gap grows and the
hands pull harder. Their forward force jumps from 4 N to about 80 N by 0.8 ms and stays at 80–115 N for 25 ms. The
head speeds up from 2.5 to 4.1 m/s and strikes the striker's ball again at 4, 8, 13, 18 and 23 ms, each strike adding
pace and stripping topspin: the ball ends at 3.33 m/s rolling 58%. At about 1.8 ms, before the extra strikes, it was at
2.61 m/s rolling 114%; Gugan measures 2.6 m/s at 94%. Gugan sees one impact of about 1 ms and a second contact over a
few ms, and the mallet after impact moving at "essentially the same" speed as the striker's ball (§10.1), with "no
clear evidence of acceleration" through the apparent contact. The full and pass rolls' model contacts of 146–303 ms
look like the same chase (not yet traced).

**The balls' friction is a billiard ball's.** The striker's ball, driven down by the leaning face at −2.5 m/s, slides
down the croqueted ball's near side at about 3.9 m/s through their contact, and the friction there spins the
croqueted ball backwards: the mechanism Gugan describes (§10.2). At the model's ball–ball friction of 0.06 the spin is
capped at 2.5·μ = 15% of the speed, and it gets exactly that. Gugan measures −35% on C10H. At 0.15 the croqueted ball
leaves at 6.66 m/s and −35% (Gugan 6.8 m/s and −35%). The value 0.06 is an analogue (billiard balls; reference
`friction.json`); a croquet ball's surface is stippled, noticeably rougher (the user, 2026-11-16), and the bounds
already run to 0.5.

**Like for like.** Gugan's speeds are "averages taken a few milliseconds after impact". The repo already turns that
into a stated instant (squeeze design, `scripts/ratioFit.ts`: READ_DELAY 1 ms after the latest end among the face and
ball–ball contacts that begin within STRIKE_WINDOW, 15 ms, of the first). The lawn design's §6 read the balls at the
handover, about 55 ms later, after the turf had worn most of the croqueted ball's backspin away; this design reads at
the established instant.

## 2. The rulings this implements

- **Plan restarts (user, 2026-11-16).** After the impact the hands' intended motion restarts from the mallet's actual
  motion: the planned follow-through carries on from there, and the hands no longer try to recover the speed the
  impact took. Chosen over a reaction delay (the hands weak for a reaction time, then chasing the old plan) and a
  softer hold (tuning, not mechanism).
- **The balls' friction fits Gugan (user, 2026-11-16).** The rougher croquet ball justifies a value above the billiard
  one; it is set from C10H.

## 3. Design

### 3.1 The restart

The repo already has this remedy, applied late and to push strokes only: flat push design amendment 6 (2026-11-15),
`reanchor` (`src/engine/impact/track.ts`), called at the parting (`src/engine/impact/integrate.ts`). From the parting
the plan runs at k times its own pace, k the head's along-aim speed over the planned head's held to [0, 1], velocities
scaled by k and accelerations by k², and moves back along the aim by the socket's lag behind it; across-aim and pitch
lags are kept. The hands then carry on from where the head is, no faster than it. In C10H the parting falls about 55 ms
after contact, after the chase of §1 has done its work. **The restart is amendment 6 moved earlier and to every
stroke**, not a second mechanism:

- **When.** At t_r, the departure latch's instant (`grip.departedAt`, integrate.ts): the first step at which a
  face–ball pair that closed at the previous step is open, with the ball's material at the last contact point moving
  away from the head's along the last normal. The latch exists today for push strokes only; it is taken on every
  tracked stroke. As there, the integrator does not know which ball is the striker's, so any ball's counts (in every
  stroke the face meets only the striker's first). The away test is what keeps a one-step flicker of the contact from
  setting t_r early. Gugan's second contact (the ball, slowed by the croqueted ball, meeting the mallet again within a
  few ms) then arises from the restarted motion.
- **What.** `reanchor` at t_r, unchanged in its law (the rate k, the lag along the aim, the warp of `handsAt` and
  `pathAt`). It fires once: the parting no longer re-anchors (`track.anchor` is set by then). The push gate goes.
- **Why the warp, not an additive restart (my call).** Carrying the plan's velocity changes at full size from the
  head's own pace would drive the hands backwards once a follow-through planned to slow from 6.5 m/s had slowed by
  more than the 3.15 m/s the head has after impact. The warp keeps the plan's shape at the head's pace, as amendment 6
  already does, with the user's ruling of 2026-11-15 ("the surge is only needed for added power, before the ball
  leaves").
- **Force at t_r.** The re-anchor moves the target to the head, so the flex's along-aim spring and damper terms drop to
  the feed-forward's in the step at t_r: a step in the hands' force, on purpose (the hands stop chasing). The
  across-aim and pitch terms are untouched.
- **Unchanged:** the feed-forward's law (it now reads the warped plan's accelerations from t_r, as it already does
  from the parting), the push intent, the flex gains and their hold weight, the grip limit and its sliding, the bottom
  hand's opening and the pendulum push after it (the re-anchor moves the path, not a hand, so an opened bottom hand
  needs nothing), a stop's gripped hold, and everything before t_r.
- **Amendment 5's catch check stays** as the guard: a stroke without a catch is bit-identical, so it costs nothing
  unless the head still catches a ball. A replay integrates from the start and re-latches t_r; up to the held-open
  catch the run is the same, so t_r is too.
- **Every tracked stroke** re-anchors, drives and splits included (unified shot model: one mechanism, no stroke-type
  switch). My call; the drives' and splits' changes are reported (§4).
- **An unbroken push.** Where the face holds the ball from first contact through the push (the full and pass rolls'
  146–303 ms contacts may be single intervals), t_r falls at the push's end and nothing changes during it: the push's
  added pace before the ball leaves is the 2026-11-15 ruling. Their excess pace, if it remains, is the push itself, a
  later design; §4 reports it so a "no change" there reads as that, not as a failure.

### 3.2 The balls' friction

`ballBallFriction` is fitted after §3.1 lands, on C10H alone: the value in [0.06, 0.5] at which the croqueted ball's
Ω₂ at the read instant is Gugan's −35%, by bisection (Ω₂ falls as μ rises, as the probe found), to 0.005. If −35% is
not bracketed in [0.06, 0.5] (Ω₂ plateauing once the balls' contact sticks, say), the plan stops and reports. Its
provenance turns from "analogue" to "derived" (fitted, the note giving the fit, the read instant and the held-out
checks); the bounds stay [0.06, 0.5]. One parameter, one target.

The same value serves every ball–ball contact (the impact's coupled contact and free motion's collisions,
`resolveBallBall`), so splits and scatter shots change too; their checks are re-run and reported (§4).

### 3.3 The comparison

A committed probe, `scripts/table6Probe.ts`, a thin caller of ratioFit's `readOut`: the textbook stroke of each
roll's type at the power whose planned head speed is Gugan's U, on the 13 s lawn (Gugan's court, lawn design §5.1),
preset hold. `readOut`'s `ReadSample` gains each ball's rolling fraction and `ReadOut` the face–ball and ball–ball
intervals, so the probe adds no second read-out. It reads both balls at `readTimeOf`'s instant, prints w₁/U, Ω₁, v₂/U,
Ω₂, the read instant, the face–ball contacts (start and end) and each ball's travel and their ratio, beside Gugan's
row, and its output is recorded under `docs/superpowers/probes/`. Gugan's figures it compares against are the ones the
lawn design §6 already quotes, cited by URL.

### 3.4 Assumptions

- t_r is the departure latch's instant, on every tracked stroke (§3.1).
- The restart is amendment 6's warp, not an additive restart (§3.1).
- Every tracked stroke re-anchors (§3.1).
- The friction is fitted on C10H's Ω₂ alone, C3H held out.
- The acceptance bands in §4 are judgement, set from Gugan's "precision limited to a few percent" and the scatter
  between his two half rolls; they are reported, not tuned to.

### 3.5 Out of scope

- The turf's response at low speed (the user's "soft touch" idea, 2026-11-16): the bed is fitted to one bounce, e 0.5
  at 5 m/s, and at 2 m/s gives 0.57 against a golf-green analogue's 0.44. Deferred; it bears on how fast the pressed
  croqueted ball loses its backspin and how high the striker's ball rebounds.
- The push map's re-fit and the firmness search: re-run for the pins, not re-designed.
- Gugan's mallet after impact for the full and pass rolls (not tabulated: "essentially the same as for ball 1").

## 4. Verification

- **The restart, unit tests** (`tests/engine/impact/`, beside amendment 6's in `flatPush.test.ts`): the departure
  latch is taken on a stroke with no push; `reanchor` re-anchors a stroke with no push; the anchor is set at t_r and
  the parting leaves it unchanged; before t_r every target is bit-for-bit today's; a one-step separation with the
  ball not moving away does not latch.
- **C10H trace:** after t_r the hands' forward force stays within the feed-forward's order (no 80–115 N chase), and no
  face–ball contact begins after the strike's window. If the head still catches the ball within 15 ms, stop and report
  before fitting the friction.
- **Half rolls against Gugan, at the read instant (acceptance):** w₁/U and v₂/U within 0.05 of Gugan's, Ω₁ within 15
  points, C3H's Ω₂ within 15 points of his 0 (C10H's is the fit). The distance ratios reported beside his.
- **Full and pass rolls (reported, not gated):** every face–ball contact closing within the strike's window, w₁/U
  against Gugan's 0.52–0.67, and whether C10F, C25F and C25P still fail (off the face, grip limit).
- **Everything else:** the full suite; each pinned value that moves is re-pinned with its cause in a comment, the
  drives' and splits' changes (§3.1, §3.2), the squeeze design's croquet-fit checks and the scatter-shot checks
  reported. A drive or split result moving outside its own design's acceptance stops the plan for the user.

## 5. Results

To be filled in.
