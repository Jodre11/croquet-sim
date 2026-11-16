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
- **The bottom hand guides, from the departure (user, 2026-11-16; amendment 1, §3.1a).** The bottom hand "guides
  rather than pushes independently" (the user, deferring the detail to the texts and Gugan). From t_r it pushes the
  shaft along the aim no harder than its share of the feed-forward. Chosen over applying it from contact, which would
  change the strike and reopen the croquet-ratio fit.
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

### 3.1a Amendment 1 (2026-11-16): the bottom hand guides

Task 2's gate failed with §3.1 alone: in C10H the re-anchor fired at 0.62 ms at rate 0.50, yet the hands' force along
the aim peaked at 103 N after it, and the head struck the ball again about every 7 ms until 54 ms. A step trace found
two sources:

- **The bottom hand–arm chain's own momentum.** Its forearm (the chain's 0.6 kg) still moves at the pre-impact 5 m/s
  when the head has fallen to about 3 m/s. Only the arm's slow flex slows it, so the palm and finger springs pass its
  momentum to the shaft: 140–160 N in the first 2 ms and about 60 N to 10 ms, about 1.2 N·s, while the top hand pulls
  back. The re-anchor moves the plan, not the chain, so it cannot touch this.
- **The push intent**, about 30 N to 5 ms, as the hands still sense the balls' resistance.

The sources:
- Gugan finds the mallet after a two-ball roll's impact moving at about ball 1's speed, with no clear evidence of
  acceleration (§10.1).
- Riches (https://www.oxfordcroquet.com/coach/riches/croqtech/index.asp, the half roll) has both hands moving forward
  at the same rate to hold the handle's slope, a firm grip, and the head following through onto the ground, with no
  push. He describes a push only for the pass roll.
- The user: the bottom hand guides rather than pushes independently.

The amendment:
- **The guide.** From t_r, while the bottom hand holds the shaft, its force along the aim is at most its share of the
  feed-forward along the aim. An excess slides its hold along the aim by the grip limit's slide (the excess over the
  palm's and fingers' stiffness), so the chain's momentum is not passed on. Across the aim and in pitch it is
  unchanged: it still steers and holds the slope. Only a forward excess slides (my call: "guides, not pushes").
- **The push intent ends at t_r**, by the 2026-11-15 ruling that the surge is for the ball before it leaves.
- **Unchanged:** everything before t_r; the top hand; a bottom hand once it has opened (a drive's pendulum push); the
  chains' masses and stiffnesses.

Amendment 1 brought the hands' peak after the departure to 38 N, yet C10H's face still touched ball 1 until 46 ms.
Amendment 2 (user, 2026-11-16) extended the guide to the top hand and took the forward acceleration out of the
feed-forward from t_r. It was tried and reverted: the hands then passed no forward force, yet the face still touched
until 29 ms, and the full and pass rolls lost about a third of ball 1's travel (C1F L1 0.67 m against Gugan's 1.21).
The late touches are the head's own momentum catching a ball that slows in its slide, not the hands (probe file,
"Amendment 2 tried"). The user accepted the late touches (2026-11-16): the gate's "no face interval after 15 ms"
is dropped, and amendment 1 stands; Gugan's video cannot resolve second contacts this light, and he reports one in
C1F.

### 3.1b Amendment 3 (2026-11-16): a check keeps its own law

The suite found the stops broken by §3.1 and amendment 1. The bottom hand's guide alone brought both canonical stops'
follow-throughs to the grip limit and gave the AC stop's a turf yield and the depth limit, against the user's rule that
the default stroke must not damage the turf. The re-anchor alone stretched the check's braking (rate about 0.47) past
the hold, which starts at the window's end. A check already fits its braking to a head the strike has slowed: the
hands apply the head's share of the planned deceleration (checkShare), so it comes to rest when the path does. The
re-anchor and the guide do that job a second time. So on a check (α < 0, `finishKind`) the departure is latched and
reported, but the hands neither re-anchor nor guide. The stops then play as before this design. My call: it reads the
plan's own kind of finish, which the integrator already branches on, rather than adding a stroke type.

**The follow-through reads the warp too (my call).** The follow-through's cap, the release and the finish's tests
(push freed, release, check apex) compared the plan's own instants with real time. Under a warp at rate k from
t_r, those instants fall later in real time by (1/k − 1) of the time after t_r, so the full roll's finish was cut
short at the cap and its release came early. They now read the plan's time through the warp (`anchoredTime`,
`plannedTime`, `src/engine/impact/track.ts`). Before t_r, and on a stroke with no anchor, nothing changes.

### 3.1c Amendment 5 (2026-11-16, draft): a speed-matched restart

**Why.** At the fitted friction (§3.2a, μ 0.16) the canonical half roll's ratio fell from 2.02 to 1.64, and C10H's to
1.48 against Gugan's 2.30. The striker's ball leaves the balls' contact at 2.79 m/s, but the face strikes it again at
17, 27, 37 and 43–50 ms and hands it to the lawn at 3.36 m/s. A step trace (probe file, "Amendment 5") shows the head
does the catching, not the ball slowing:
- the strike leaves the head at 2.45 m/s by 2 ms, slower than the ball (2.77);
- the hands then push the head forward at 25–28 N to 40 ms, and it speeds up steadily to 3.5 m/s by 42 ms;
- between catches the ball, off the turf from 9 to 39 ms, keeps its speed: 2.73, 2.99, 3.23, 3.42 m/s.

The re-anchor (§3.1) runs the plan at a fixed rate k of its own pace. The half roll's plan still accelerates after
contact, so the path's along-aim speed, k times the plan's, rises, and the hands' feed-forward (k² times the plan's
acceleration) and the flex towards the path both drive the head after it. Amendment 2 dropped the feed-forward's
forward part only; the flex towards the rising path kept the touches to 29 ms. Gugan finds the mallet after impact
moving at "essentially the same" speed as ball 1 (§10.1).

**The law.** From the departure t_r, the plan's time τ runs at the head's along-aim speed s over the fastest along-aim
pace the plan has reached since t_r:

    dτ/dt = s / max_{τ_r ≤ u ≤ τ} p(u),    τ(t_r) = t_r,

p(u) the planned head's along-aim speed (headOnPath, as reanchor reads it). While the plan speeds up the path moves
along the aim at s: the head is carried on at its own pace, neither chased nor pushed. Once the plan slows (its
finish), the divisor holds at the plan's peak, the rate is fixed, and the path slows in proportion to the plan:
k = s/peak, as §3.1's warp with the peak in place of the pace at t_r. A plan that only slows after t_r gives
exactly §3.1's warp. Unchanged from §3.1: s and the rate held to [0, 1], the lag along the aim (`by`), the across-aim
and pitch lags kept, one restart per stroke, no restart on a check (amendment 3), the guide (amendment 1) and the push
intent's end.

**The kinematics.** With τ' = dτ/dt and τ'' its rate, a path velocity is the plan's times τ', and an acceleration the
plan's times τ'² plus the plan's velocity times τ''. §3.1's warp has τ'' = 0; here τ'' is nonzero while the plan
speeds up (τ'' = −τ'²·p'(τ)/p(τ), which brings the along-aim acceleration to zero). The feed-forward reads both terms.
τ(t) is tabulated at the impact's step from t_r (the plan's pace is not closed-form after the dip and the lift), and
anchoredTime and plannedTime invert it by search on the table; τ is strictly increasing while s > 0.

**Expected.** In C10H the head holds about 2.45–2.8 m/s after the strike, the ball (about 2.8 m/s) draws away, and
the face's touches after the strike window end or thin out. The half rolls' ratios rise towards their pre-fit values
or beyond. The full and pass rolls' plans also accelerate after contact, so their heads lose the gain too. Amendment
2's loss of a third of ball 1's travel there came with no forward feed-forward at all; this keeps the head's own pace,
but a loss is possible and is reported.

**Verification** (in addition to §4, at μ 0.06 first, then the fit re-run under amendment 4):
- C10H: the head's along-aim speed after the strike stays within 0.1 m/s of s until the plan slows; the face–striker
  intervals after the strike window; the striker's ball at the handover against the read (2.79 m/s at μ 0.16);
- the canonical half roll's ratio against its 2.0 (shapes design ruling 15) and C3H's and C10H's L2/L1 against
  Gugan's; the full and pass rolls' L1 against Gugan's C1F, C3F, C3P and C10P, beside amendment 1's;
- drives and stops: as §4. A check is untouched. A drive whose plan only slows after t_r keeps §3.1's warp exactly;
  whether the drives' plans speed up after contact is not yet checked (assumption: little, so they move little).

My calls: the peak rather than the current pace, since dividing by the current pace would hold the path at s through
the finish, which would then never slow; tabulating τ rather than a closed form.

### 3.2 The balls' friction

`ballBallFriction` is fitted after §3.1 lands, on C10H alone: the value in [0.06, 0.5] at which the croqueted ball's
Ω₂ at the read instant is Gugan's −35%, by bisection (Ω₂ falls as μ rises, as the probe found), to 0.005. If −35% is
not bracketed in [0.06, 0.5] (Ω₂ plateauing once the balls' contact sticks, say), the plan stops and reports. Its
provenance turns from "analogue" to "derived" (fitted, the note giving the fit, the read instant and the held-out
checks); the bounds stay [0.06, 0.5]. One parameter, one target.

The same value serves every ball–ball contact (the impact's coupled contact and free motion's collisions,
`resolveBallBall`), so splits and scatter shots change too; their checks are re-run and reported (§4).

### 3.2a Amendment 4 (2026-11-16): the croqueted ball read at its own instant

The fit as written found no bracket: at the shared read (7–16 ms in C10H) Ω₂ is −2% at μ 0.06 and −8% at 0.5. A
trace at μ 0.15 showed why. The friction impulse that spins the croqueted ball backwards also drives it down (for a
sphere, ΔωR = 2.5·J/m beside Δv = J/m), about 0.9 m/s in C10H. The turf stops it: the ball sinks 2.55 mm, the bed
pushes up to 169 N, and its sliding friction wears Ω₂ from −35% at the balls' parting to −7% by 8 ms, when the ball
hops clear. Gugan describes the same (§10.2): every roll's croqueted ball starts with backspin that ground friction
then turns towards roll, followed in detail only for C1F (Table 6's note); Table 6's Ω₂ is that starting spin.

So the croqueted ball is read at its own instant: READ_DELAY (1 ms) after its first contact with the striker's ball
ends, before the ground has worked on it. The striker's ball keeps readTimeOf's instant. The fit is otherwise as
§3.2, on C10H's Ω₂ there. Ω₂ is not monotone in μ (it reaches about −45% at 0.3, where the balls' contact sticks,
and returns to −35% at 0.5); the bisection from 0.06 finds the lower crossing. The user chose this reading
(2026-11-16). Held out: C3H reads its starting spin too, against Gugan's 0; his three U ≈ 3 m/s rows all read 0,
plausibly worn already by the ground as his C1F was.

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
