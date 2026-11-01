# P2b.2b.2c.3b.1 shapes: design

Status: reviewed (two-lens panel, 2026-11-01), for planning.

Parent: docs/superpowers/specs/2026-10-31-p2b2b2c3b1-level-head-design.md, amendment B1 (§11, rulings 1–9). This
design implements B1's first phase, the strokes' shapes, and supersedes the parent's §5 (the finish's ease to rest).

## 1. Goal and scope

This phase gets the planned and played shapes of the drive, half roll, full roll and pass roll right, judged by the
user's eye on side-on traces. In a later phase, the envelope finds which push lengths, push accelerations and swing
powers reach each outcome (B1 ruling 4).

In scope:
- one finish for every stroke (§2);
- the half roll's text book as a drive with lean (§3);
- the lean's runaway on the push, which drives the top hand's flex (§4);
- the traces that the user judges (§5).

Out of scope:
- the envelope, the push map and their runs (the push map's Tasks 6–8 re-run and gate 2 stay deferred);
- the hands' assist (ruling 7) and the flick (ruling 9). The envelope phase adds them, deciding then whether they are
  one input on the finish (by generalising `pendulumEffort`, which today never acts on a push) or a separate one;
- the drive's own flex (ruling 8: it stays as it is, and the CA film is a later check);
- HAND_COUPLING and its ratioFit.

## 2. One finish (B1 rulings 2, 3, 7, 9)

Every stroke ends the same way from its **release**: the push's end, or on a stroke with no push the held path's rest
(arcStart + window + holdWindow, where the planned ω has fallen to 0), or contact where nothing is held.

- **The hands.** From the release they carry on along their arc (radius ρ_h = handArcRadius, low point s_low) as a
  point pendulum under gravity: φ̈ = −(g/ρ_h)·sin φ, with sin φ = (s − s_low)/ρ_h. Their tangential speed at the
  release is V/cos φ_r, where V is the along-aim pace at the push's end (Push.finishSpeed). They stop at their apex
  (φ̇ = 0) and hold there. The planned acceleration steps to 0 at that point. This is accepted: the step is the
  player's arrest, and the mallet swings on independently of it. With V = 0, as on a drive, the hands stay still.
- **Reduced follow-through (ruling 9).** For a point pendulum the rise after the release is (V/cos φ_r)²/2g whatever
  φ_r is. What a long push takes away is the arc travel left, from cos φ_apex = cos φ_r − (V/cos φ_r)²/(2g·ρ_h), along
  with any pace the push has already spent. This emerges from the push and is not scripted.
- **The mallet.** At the release the slope hold λ releases to 0, and the shaft's planned pitch runs as a free pendulum
  about the top hand.
  - It uses FreePendulum's equation, which brings in the hands' acceleration through its inertial term.
  - It starts from the planned θ and ω at the release: the held or blended values, ω about 0 on a fully held slope.
  - θ and ω are continuous at the release; only α steps.
  - This is a second table, the finish table, seeded at the release and run until the finish ends or REACH_SEARCH.
    prepareTrack builds it whenever the stroke releases a hold or has a push, whatever `withFree` is. Practice's
    push-only read (prepareTrack(…, false).push) is unaffected.
  - On a stroke with no push and λ = 0 there is no hold to release: this is today's swing, bit for bit.
- **The end.** The finish ends at the mallet's apex: the first time after the release that its pitch rate about the
  axis, having risen above 0, falls back to 0 or below. If the rate never rises above 0, the finish ends at the hands'
  apex. The "carry" finish kind and push.rest's ease to rest (parent §5) are removed.
- **A check** (α < 0) keeps its mallet's hold, while its hands follow the same hands' finish. It ends at rest relative
  to the hands once they have reached their apex, which replaces the wait on push.rest.
- **The arc's domain.** The hands' apex must stay below a quarter turn: cos φ_apex > 0. prepareTrack checks this, since
  V is known only once the push is planned, and a stroke that would carry the hands past the arc's top fails with a
  named error. lowPointOf's bound (2·handReach − handArcRadius, handArcRadius), which was derived from the removed
  ease, becomes (s_r − handArcRadius, handArcRadius) at validation, s_r being the release's travel (handReach, or 0),
  and the apex check covers the rest.
- **Practice.** Only strokes with a push are practised (practice.ts), so the drive and the new half roll play once.
  This is accepted: ruling 1 allows practice but does not require it. On the rolls, the learned lift carries on
  through the finish as the parent's §4 item 2 rule has it.

Assumption: the free pendulum about moving hands is ruling 7's one pendulum, the arms and mallet swinging on together
under gravity with the hands only guiding. It reduces exactly to today's drive, so the drive and its ratioFit stand.

## 3. Half roll's text book (B1 ruling 6)

The half roll becomes a drive with lean:
- it takes the drive's DRIVE preset whole (speedGain 0.2, window 0.005, handWindow 0.005, handReach 0);
- it takes the drive's shape (pendulumShare 1, the top hand still, reference/swing.json; was 0.4);
- slope hold λ 0 (was 1; λ also plans the downswing, buildContact.ts §7);
- DEFAULT_DRIVE 0.

Its stance lean of 24° (Gugan 4 Table 6) and its grip (bottom hand 0.42 m, firm) are unchanged. Taking the drive's
values whole is an assumption, the user's "a drive with lean" read literally. A short push stays a valid shot variant
through `stroke.handReach`.

The half roll's ratio band, 1.4–2.5, is read on the trace, not gated: the envelope tunes it.

## 4. The lean's runaway (B1 rulings 5, 8)

The rolls' played lean runs from the plan's ~30° up to 55°, and their top hand drifts up to 48 mm along and 33 mm low
off its path. The cause is not yet known, so this item starts with a diagnosis.

1. **Diagnose.** `scripts/pathTrace.ts` gains columns and a switch to play unpractised as well as practised.
   - The new columns: each hand's offset from its path, each hand's force (feed-forward, flex and chain), and the balls'
     resistance. The integrator already snapshots all of these each step (integrate.ts).
   - It plays the full and pass rolls' text books both ways, every millisecond through the push.
   - It shows which of three causes sets the lean's growth: the feed-forward missing the balls' resistance, the firm
     bottom hand (g_B 1) levering the shaft about a yielding top hand, or practice's lift.
2. **Gate.** The findings and a recommended fix go to the user, and the fix is chosen there, not in this design.
3. **Fix and target.** The default target is a played lean within 5° of the plan through the push, and the top hand
   within 10 mm of its path. Both figures are assumptions, and the user's eye on the traces has the last word. Per
   ruling 8 the flex stays with the top hand: the bottom hand stays near its path, and HAND_COUPLING is not changed.

## 5. Check

`scripts/pathTrace.ts` plays the drive, half roll, full roll and pass roll text books at canonical power, through
practice wherever a stroke has a push. It draws the planned and played head, both hands and the balls' motion, as it
does today.

Each trace's legend states:
- the ratio, with the striker's ball's and the croqueted ball's distances to rest;
- the played lean's range;
- the top hand's largest offset;
- the follow-through, as the hands' arc travel after the release (φ_apex − φ_r) and the shaft's pitch at the mallet's
  apex.

The traces are committed as probes and published to the user. Acceptance is the user's judgement by eye, with no
envelope or push-map runs.

## 6. Versions, records and tests

ENGINE_VERSION is 0.20.0. Pinned values that move are re-pinned in the same commit, each with its reason. The known
movers are:
- finishKind's "carry" in scripts/setupProbe.ts;
- the checks built on push.rest;
- the half roll's pins;
- lowPointOf's error text.

Tests:
- With no lift, the hands' finish conserves the point pendulum's energy to the integrator's tolerance and holds at its
  apex.
- At zero push and λ = 0 the finish is bit-identical to today's drive.
- With the same V, a longer push gives less hands' arc travel after the release.
- A held-slope roll's finish runs past the release to a mallet's apex with a positive pitch rate before it: it does not
  end at its first step.
- A no-push stroke with λ > 0 releases at its held path's rest.
- A check with a push ends at rest relative to its hands after their apex.
- A stroke whose hands would pass a quarter turn fails with the named error.
- The half roll has no push and finishes as a swing.

Housekeeping: the svelte and typescript-eslint bumps have already landed (89f029a). `npm outdated` runs first, as the
standing rule asks, and only what it finds behind GA ships as its own small PR before this work.

## 7. Known risks

- The release steps α where the hold and the free pendulum disagree. The tests above bound how far the head strays
  after it.
- The half roll's ratio moves with its lost push and its new shape, and may leave its band. It is read, not gated, in
  this phase.
- The diagnosis may find the runaway lies in practice itself, which would reopen the parent's §4.

## 8. Amendment C1 (user, 2026-11-01)

Three rulings from the user while the plan ran. They amend §3, frame §2's release and extend its hold, and the user's
eye on the traces judges them.

**Ruling 10, the release against the striker's ball.** "Generally the finish starts as the striker's ball is leaving
the mallet for the last time", but "this is not a 100% rule" and it "varies between full and pass rolls": "in the pass
roll the finish intentionally starts before the striker's ball leaves to cause the flick and aid the pass." So the
release's timing against the ball's departure is the player's intent per stroke, not a sensed rule:
- §2's release stays at the push's planned end, and push length sets where it falls against the departure;
- a full roll aims to release about as the striker's ball leaves;
- a pass roll aims to release before it leaves, which is ruling 9's flick.

Push length is an envelope input (B1 ruling 4), and the flick is deferred to the envelope phase (§1), so nothing in this
phase changes. Task 6's traces read, for each roll, the release against the ball's last departure (t_d, the end of
its last face contact), so the user can judge the text books against these aims.

**Ruling 11, the half roll keeps a minimal push.** "The bottom hand always pushes through the contact to maintain the
arc swing" and "the push on the half roll is minimal". This supersedes §3: the half roll keeps its roll mechanics (its
pendulumShare, slope hold and spread grip) with a minimal push. handReach is 0.05 m, an assumption, since B1 ruling 4
makes push length an envelope input; it replaces 0.15 m, which ruling 6 found too much. Its trace is judged by eye.

Task 5's pitch hold stands. The hands' remaining drift under the balls (35–50 mm back, 45–75 mm up) is accepted as
realistic (user, 2026-11-01).

**Ruling 12, the hands guide the mallet on after a short push (draft, for the user's approval).** With the 0.05 m push
the half roll faults: at the push's end the slope releases and the mallet swings free about the top hand. Leaning
forward, its head swings down under the hands, overtakes the striker's ball and hits it again 112 ms after the balls
part (9.5 mm apart, the ball's speed +39%; law 29.1.6.1, three re-contacts in all). The user: "in the half roll the top
hand is close to stationary, so minimal push makes sense", the bottom hand pushing through the contact "to maintain
the arc swing", and "there may be a dip and rise in the top hand, like in longer pushes". So after a short push the
hands do not let go: they carry the mallet on along their arc at its lean, and the mallet swings free only later.

- **The input.** `slopeCarry` ∈ [0, 1], a shape input beside slopeHold: the share of the hands' finish (§2), in arc
  travel from the push's end (φ_r) to the hands' apex (φ_apex), through which the slope hold and Task 5's pitch hold
  stay on. The release (§2) moves to the first time the hands' arc reaches φ_r + slopeCarry·(φ_apex − φ_r). At 0 it
  is the push's end, as now; at 1 the mallet is carried to the hands' apex and swings free from rest relative to them.
- **Between the push's end and the release** the planned path is the held slope carried by the hands' finish: the
  hands on their arc, so the top hand dips to the arc's low point and rises after it, and the shaft at its held pitch.
  From the release, §2's finish runs unchanged: the free pendulum seeded from the planned θ and ω there, its end at the
  mallet's apex.
- **One default for every stroke.** The model is one shot model, not one per stroke type (user, 2026-11-01: "we are
  working toward a unified shot model, not separate models per shot type"). So slopeCarry's default is 1 on every
  preset: after any push the hands guide the mallet on to their apex. What differs between strokes comes from the
  other inputs: a long, fast push leaves the hands high on their arc with little travel left (ruling 9), a short one
  leaves most of it. A stroke with no push has no hands' finish, so slopeCarry acts on nothing there. The value is an
  assumption until the envelope phase tunes it per shot with push length (B1 ruling 4). It is not a per-type switch.
- **What moves.** The full and pass rolls' release moves from their push's end to their hands' apex, so their finishes
  and practice may move too. They are re-pinned with reasons and judged on Task 6's traces. Ruling 10 still holds as
  intent: a pass roll's early release, its flick, is ruling 9's assist and the envelope's to tune, so it is not modelled
  here.
- **Not scripted.** The input sets only how long the hands guide; whether the head stays clear of the ball follows from
  the hands' finish, which slows as the arc rises, against the ball's own run.
- **Check.** The half roll's text book at canonical power plays with no 29.1.6.1 finding, unpractised and practised,
  and its trace shows the top hand's dip and rise. If carrying to the apex still re-hits, that is reported, not tuned
  away.

Assumption: "guide" is a held slope, the shaft's pitch held as through the push, rather than a weaker hold. It is the
smallest change that matches "maintain the arc swing", and the user's eye on the trace judges it.
