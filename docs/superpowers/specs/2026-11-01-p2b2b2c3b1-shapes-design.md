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

**Ruling 13, the let-go continues the path (user, gate 2).** Carried to the hands' apex, the mallet came to rest with
them, then fell back and swung through under them: a stop and a restart. The user: "the let go should be a smooth
continuation of the path", "with the mallet arcing".

- **The let-go is a fade, not a switch.** From the release to the hands' apex the slope hold and Task 5's pitch hold
  are let go on a minimum-jerk share g = u³(10 − 15u + 6u²), u the time's share of that span: θ = θ_held + g·(θ_free −
  θ_held), the free swing seeded from the held one at the release, and the pitch hold's moment scaled by 1 − g. θ, ω
  and α run on across the release; θ and ω across the apex, where the hands' own deceleration ends in a step (§2) that
  the free swing feels in α. At slopeCarry 1 the span is nil and ruling 12's behaviour stands.
- **slopeCarry's default becomes 0** on every preset: the let-go starts at the push's end, about as the striker's ball
  last leaves (ruling 10). With the fade, the half and full rolls play with no 29.1.6.1 finding at every slopeCarry in
  {0, 0.25, 0.5, 0.75, 1}, unpractised. The pass roll re-hits at every value, as it did before (ruling 12's traces).
- **What moves.** Every pushed stroke's finish: the mallet arcs on past the hands' apex. The full roll's ratio is now
  1.215 (ruling 12: 1.211).
- **The trace** outlines the striker's ball where it last leaves the face.

**Ruling 14, the top hand stops and the bottom hand carries the stroke on (draft, for the user's approval).** With
ruling 13 the mallet arcs on, but too far: the top hand rises freely on §2's point pendulum (0.67–0.94 m on, 0.17–0.47
m up) and the head ends 1.2 m up, past the hands. The user: "in practice, the top hand stops pushing and the bottom
hand continues the stroke", by an amount that "varies depending on the degree of follow through" needed. So the
follow-through is the player's intent per shot, not an outcome of the hands' free rise. This supersedes §2's hands'
finish (and with it ruling 9's emergent follow-through) and ruling 12's slopeCarry.

- **The top hand stops.** From the push's end its pace along its arc falls from V to rest on a minimum-jerk ease over
  `arrestTime`, travelling V·arrestTime/2. It then holds. Assumption: arrestTime 0.1 s on every preset, 0.1 m of travel
  at 2 m/s, until the envelope phase tunes it.
- **The bottom hand carries the head on.** As the top hand slows, the shaft turns about it so that the head keeps the
  push's pace along its path: the pace passes from the hands' travel to the shaft's turn, and the head's speed runs on
  unbroken through the push's end. The bottom hand drives this turn through `followThrough`, the shaft's turn about the
  top hand after the push's end (rad), a new shape input with a stroke override, like slopeCarry.
- **Then the mallet swings free,** let go over ruling 13's minimum-jerk fade, here over the last part of the bottom
  hand's turn rather than the hands' rise. The free swing about the now still top hand rises by about (pace)²/2g:
  0.2 m at 2 m/s.
- **One default for every stroke.** followThrough's default is one value on every preset, an assumption (0.5 rad, about
  30°) until the envelope phase tunes it per shot. It is not a per-type switch. A stroke with no push (the drive) has
  no top-hand push to stop and is unchanged, bit for bit. A check keeps its hold, its top hand stopping the same way,
  with no bottom-hand carry.
- **Removed.** §2's point-pendulum hands' finish, its apex and its quarter-turn check, and slopeCarry (ruling 12).
- **Check.** No 29.1.6.1 finding on the half and full rolls. The traces show the head's speed unbroken through the
  push's end, and finishes of a plausible height. The user judges them by eye.

**Ruling 14 approved, with two changes (user, 2026-11-01).** "We have the right idea now. The shapes look generally
right. Less push on the half roll, follow through tailored to the range."
- **The half roll's push** halves, handReach 0.05 → 0.025 m (an assumption, as ruling 11's was).
- **The follow-through scales with the range.** `followThrough` becomes the bottom hand's carry time (s) at the push's
  pace, not a fixed turn: the shaft's turn about the top hand is then about V·followThrough/r (r the shaft's radius),
  so a faster push, which sends the balls further, turns it further. One default on every preset, 0.2 s (an
  assumption), with a stroke override; the envelope phase tunes it per shot.
- **The let-go.** The free swing is seeded where the bottom hand lets go, from the carried θ and ω, so the follow-through
  sets how high the mallet finishes. Ruling 13's fade runs over the last HAND_EASE (0.1 s, the top hand's arrestTime
  too) of the carry, or the whole carry where it is shorter. With followThrough 0 the mallet swings free at the push's
  end.

**Ruling 14 as built, the bottom hand brings the head to rest (user, 2026-11-01).** The user, on the round-2 traces:
the pass roll's unplayability is "perhaps related to excessive lean", so its angle should be "similar, fractionally
increased from the full roll but with relatively extra follow through timed to the end of contact"; and "the full roll
follow through should be muted, even at long range". A mallet let go free swings on by about V²/2g however short the
carry, so its degree cannot be set and the full roll cannot be muted. So the carry ends held, not free (an
assumption, for the user's check).
- **The carry.** Once the top hand has stopped (its apex, HAND_EASE after the push's end), the bottom hand turns the
  shaft on at the push's pace V for `followThrough`, then brings the turn to rest over HAND_EASE on a minimum-jerk ease
  and holds it. The shaft's turn about the top hand is V·(HAND_EASE + followThrough)/r in all; θ, ω and α run on
  unbroken through the push's end, the top hand's stop, the brake and the hold. A push's mallet is never freed: no
  finish is tabulated for it, and the pitch hold runs throughout. The swing ends when the turn is held at rest
  (push.freed). A stroke with no push is unchanged.
- **Per-preset follow-through** (FOLLOW_THROUGH, s; assumptions): 0.2 on every stroke but the full roll's 0 (muted) and
  the pass roll's 0.3 (relatively further).
- **The pass roll's lean** is 32°, the table's lowest and a degree past the full roll's, a hypothesis from the user's
  view; its default backswing is re-bisected, 0.4313.
- **Results** (the four traces, 10 s lawn). Half roll: ratio 1.041, valid, the finish's lean −17.8° (was −40.5°). Full
  roll: ratio 1.567, valid (was 1.260, unpractised), practised in three passes, the finish's lean 0.7°: muted, but the
  striker's ball now goes less far. Pass roll: still unlawful, 29.1.6.1 at 85 ms, inside the push (it ends at 104 ms):
  the strike holds four contacts, the last 60 ms after the third, whatever the carry (0 to 0.3 s), so the fault is the
  push's, not the follow-through's. The full roll at p = 1.5 now reads superhuman: its top hand stops well short of
  the hands' arc's quarter turn, so the impact is played, and a hand reaches its grip's limit. Engine 0.23.0.

**Ruling 15, the hands' hold sets the ratio through contact (user, 2026-11-01).** The user asked for the full and pass
rolls' follow-through to be fitted to their target ratios, and noted the half roll's striker's ball "is getting too
much". Measured on the canonical text books (10 s lawn):
- The follow-through moves no ratio: on every roll the striker's ball has left the face before the top hand stops
  and the carry begins (full and pass rolls identical from 0 to 0.6 s).
- The half roll's ratio is set by the push's pitch hold (Task 5): 2.18 with no push, about 1.0–1.06 with any push
  from 10 to 100 mm, about 2.2 with the same pushes and no pitch hold. The bottom hand's carry has no effect. With the
  grip's couple scaled to 10 % the ratio is 2.00, at 25 % 1.22.
- The full roll's ratio falls as the hold weakens (1.57 at full, 1.39 at half, off the face at a quarter); without
  the hold its lean runs away (3.72, off point). The pass roll re-hits at every strength but a quarter (grip limit).

The user chose option 1: **how firmly the hands hold the shaft's lean through contact is a per-stroke input**,
`holdFirmness` ∈ [0, 1], a shape input with a stroke override like slopeHold. It scales the grip's couple that bounds
the push's pitch hold (gripCouple): 1 as today, 0 no hold. It acts only with a push. The half roll's is fitted to its
ratio; the full and pass rolls' push (its length and pace) is then fitted to theirs. Targets (assumptions, from §2's
bands): half roll 2.0, full roll 1.1, pass roll 0.83 (Gugan 5's theory, inside the CA's "below 1").

The user asked whether it must also vary with the shot's power. The grip's couple is fixed while the balls' twist on
the shaft grows with power, so a fixed firmness holds relatively harder on a soft shot: the ratio is measured across
power at the fitted firmness and reported, not yet tuned (the envelope phase may make firmness a per-shot intent).

**Ruling 15 as built (user, 2026-11-01: "players do anticipate this resistance").** The hold scales with the planned
contact speed: the arc's share is min(1, holdFirmness·v/HOLD_SPEED), HOLD_SPEED the presets' canonical 3 m/s, so a
shape's firmness is stated at 3 m/s and a softer shot is held less hard. Fits and measurements, 10 s lawn:
- **Half roll:** firmness 0.1 (bisected; 0.1002 gives 1.9995), ratio 2.000, the striker's ball 1.84 m (was 3.50 m).
  Across power at that firmness: 1.99 at half the canonical power, 1.94 at ¾, 2.06 at 1¼; at 1½ the head re-hits the
  striker's ball (29.1.6.1, ratio 1.21). So with the anticipated hold the ratio holds across most of the range.
- **Full roll:** no lever reaches 1.1. Push length 0.2–0.4 m at firmness 1 or 0.6 gives 1.36–1.40 (0.5 m digs,
  follow-turf-yield); firmness 0.5 gives 1.39, a quarter goes off the face. Its firmness stays 1, ratio 1.567.
- **Pass roll:** no lever lands it. Push length 0.1–0.4 m at firmness 1 or 0.5 gives 0.35–0.50, each superhuman
  (grip limit) or unlawful (29.1.6.1); firmness 0.5 and 1 play identically, the hold below its bound. Firmness 1.
- Re-pins: the canonical half roll pins its ratio, 2.0; the turf-strike flag cover keeps the grip's whole couple;
  the whole-roll handover's lift bound moves to 1.5e-4 (the full roll at 1.5 m/s now holds at half the couple).
  Engine 0.24.0.

**Ruling 16, the push's acceleration fitted (user, 2026-11-02: "Fit it now", then "Apply the fit").** The push's
acceleration is set by the shot's `drive` (how hard each pulse changes the rate) and `window` (the pulses' duration;
shorter is sharper), with the preset's `speedGain`. Swept at canonical power on the 10 s lawn:
- **Full roll:** every setting lawful; the ratio 1.16–1.60, varying by up to 0.3 between neighbouring settings (not
  understood; the practice passes are a suspect). No setting reached 1.1. The fit: drive 0.25 over 80 ms pulses,
  held for the preset's 30 ms (`DEFAULT_WINDOW`, the planner's default `window`, beside `DEFAULT_DRIVE`), ratio 1.161
  in three passes, inside the band 1.0–1.2. Lengthening the preset's own window instead lengthens the hold with the
  pulses, and nothing then enters the band (best 1.21).
- **Pass roll:** acceleration is the wrong lever. With none (drive 0, or speedGain 0) the ratio is 0.54 and every
  increase lowers it, to 0.22; no setting is lawful (off the face at short windows, the grip's limit at longer, two
  re-hits). Its miss lies in its set-up (lean, push length, contact), not its acceleration; unchanged.
- Engine 0.25.0.
