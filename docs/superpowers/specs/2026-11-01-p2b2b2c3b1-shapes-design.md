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

Two rulings from the user while the plan ran. They amend §2 and §3, and the user's eye on the traces judges them.

**Ruling 10, the release follows the striker's ball.** "Generally the finish starts as the striker's ball is leaving
the mallet for the last time. In a slower push the player can judge it." The release (§2) becomes the earlier of:
- the push's planned end, as now; and
- t_d + τ_sense, where t_d is the end of the striker's ball's last contact with the face and τ_sense is the player's
  prepared response to feeling it go.

Neither case is scripted; which one rules emerges from the push's pace:
- in a slow push the ball leaves well before the hands reach handReach, the player feels it and eases off, and the
  finish starts at t_d + τ_sense;
- in a fast push the push ends before the player can feel the ball go, and the release stays at the push's planned end.

Without a push nothing changes: the release is still the held path's rest, or contact.

τ_sense is a new body input beside pushResponseTime, which is a force rise and has no sensing delay in it (its note).
Value 0.1 s, lower bound 0.07 s: Forgaard, Franks, Bennett, Maslovat and Chua, "Mechanical perturbations can elicit
triggered reactions in the absence of a startle response", Exp Brain Res (2018), DOI 10.1007/s00221-017-5134-x. In a
prepared simple-reaction task against a wrist perturbation, two thirds of responses began within 100 ms and the
earliest at about 70 ms. Assumptions:
- an unloading at the face is felt as fast as their perturbation;
- EMG onset stands in for the release, since the release eases the push rather than starting a new force.

The upper bound and the reference entry (URL, date, SHA-256, quotes) are sourced when the input lands.

Consequences for §2:
- t_d is known only in play. The finish table is seeded at the release from the planned θ, ω and the hands' state then,
  so with a push it is built in the integrator at the release, not in prepareTrack. Its equations, its end and the
  check's rule are unchanged.
- The hands' release speed V becomes the plan's along-aim pace at the release, not Push.finishSpeed.
- Practice plays each pass with its own release, and so learns with it.
- With no balls, t_d never comes and the release is the push's end, as now.

**Ruling 11, the half roll keeps a minimal push.** "The bottom hand always pushes through the contact to maintain the
arc swing" and "the push on the half roll is minimal". This supersedes §3: the half roll keeps its roll mechanics (its
pendulumShare, slope hold and spread grip) with a minimal push. handReach is 0.05 m, an assumption, since B1 ruling 4
makes push length an envelope input; it replaces 0.15 m, which ruling 6 found too much. Its trace is judged by eye.

Task 5's pitch hold stands, and so does its open question: whether the hands' remaining drift under the balls (35–50 mm
back, 45–75 mm up) is accepted or traced to what should answer the balls' upward push.
