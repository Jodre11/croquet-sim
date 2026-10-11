# P2b.2b.2b.2b — The Roll's Stroke: Design

**Product spec:** `2026-09-30-croquet-shot-lab-design.md` §4 (impact phase).
**Stroke shape spec:** `2026-10-06-p2b2b2a-stroke-shape-design.md` (the carry mode; "hands arrive with no vertical
velocity", reopened here).
**Stance spec:** `2026-10-08-p2b2b2b1-hands-stance-design.md` (the rolls' leans and grips).
**Laws spec:** `2026-10-09-p2b2b2b2a-strike-turf-laws-design.md` (the Hertzian face, the turf bed; "Why this split";
its amendments).
**Roadmap:** P2 row; "P2b.2b.2b decisions and findings (2026-10-08)", including "The roll as played" and "The model's
roll against the roll as played"; "P2b.2b.2b.2a outcomes (2026-10-09)".

**Why this step.** P2b.2b.2b.2 lands in three steps (user decision, 2026-10-09): the laws (2a, done), the roll's
stroke (this document), then the mallet (2c). On 2a's laws the rolls still fail in the stroke, not the laws:

- the canonical full roll's hands brake while the face is on the ball;
- nothing holds the face angle once the ball pitches the mallet;
- the mallet never arcs back through vertical;
- the pass roll's follow-through pins the striker's ball in its pit at every speed, with ratios of 7.45–29.21 over
  2–4 m/s and the "punch beats coast" test `it.fails`;
- 15 of the pass roll's 225 late re-hit runs end with the head overlapping the striker's ball as handed over.

**Circularity.** The new law's numbers come from published measurements of the human arm (physiology), never from a
coaching ratio, Gugan's or Hall's roll figures, or the user's play. Those are recorded beside the model as held-out
checks. The roll as played (below) is the behavioural target. Ratios are recorded, not gated, and P2b.2b.2c
calibrates them.

**Vocabulary.** "Split" and "ratio" keep their croquet meanings only. Split: the balls go off in significantly
different directions. Ratio: the relative travel of the two balls. The distribution of time and effort between a
roll's two phases is its **phasing**. The second phase is the **pendulum phase**: the same rotation about the top hand
that the downswing already calls the pendulum (`pendulumShare`), so the word gains no new meaning. If the croquet
literature has an established term, it is a later rename.

## The roll as played (user, 2026-10-11)

This extends the roadmap's "The roll as played" (2026-10-08) with the brainstorm's account. It describes behaviour, not
a number to fit.

- **Two phases.** A roll needs an initial, conscious hands-forward push with the mallet at the stance's angle. Then,
  depending on the power and the ratio wanted, the player continues or accelerates the pendulum action towards the end
  of the stroke. The body takes whatever position it needs to maintain the push, so the model cares about the hands,
  not the body.
- **The hands' path.**
  - The hands consciously travel forward, but they dip a little during the push: that keeps the face on the ball while
    the mallet's angle rises from about 31° to about 42°.
  - The dip is a flex: the arms and wrists give as the balls and turf resist the push.
  - The recovery from the flex is part of what drives the balls forward.
  - The hands rise again in the pendulum phase.
  - The low point falls partway through the push or at its end, later for a longer push.
  - The user's sense is of the hands on a shallow arc whose centre is high above, perhaps more ovoid than circular.
- **The angle.** It rises through the push as the flex gives, a few degrees above the contact lean being normal, but
  never beyond 45°. The head stays behind the striker's ball, and the repeated face touches are part of the push.
- **The phasing, per shot.**
  - The ball's position back in the stance sets the push's length.
  - The player then chooses how hard to push and when to start the pendulum phase. A harder push needs the pendulum
    phase sooner.
  - A harder, punchier pendulum phase sends the striker's ball further.
  - A close-range roll uses a short push and little pendulum phase. A full-lawn roll needs a long, fast push with
    excellent timing of the pendulum phase.
  - Starting the pendulum phase too soon is a common mistake and gives a poor shot.
  - The player thinks mainly of where the balls should end up and lets the rest happen subconsciously. Choosing the
    inputs from a target is the planner's job (P4), not this step's.

## Decisions (user, 2026-10-11)

- **Compliant hands on an intended path**, over a prescribed hands' arc and over today's path plus an angle spring
  alone. The dip, its timing and its recovery are to emerge from the load, not be drawn. "Let's model it and see what
  emerges, it may need refinement."
- **The intended path is the hands' own arc** (user, 2026-10-11, correcting the first draft's level path). The hands
  travel a shallow arc in the swing plane, centred high above. It descends into contact, so the hands arrive moving
  down. It bottoms out partway through the push and rises through the pendulum phase. The flex sits on top of it,
  adding the load-driven dip and recovery. The arc's shape is a preset input per player, unsourced and flagged as a
  placeholder like `handAngle` (§4.1, §6). A circle first; "more ovoid than circular" is a later refinement.
- **The flex law's form** (§3): stiffness rising linearly with the hand's force, damping at a constant damping ratio,
  both from the arm literature.
- **The pendulum phase** (§4): the bottom hand stops holding and drives the mallet's rotation about the top hand. Its
  driven effort ships in this step, over letting go alone with the effort deferred to P2b.2b.2c (spec review, user
  decision 2026-10-11): it is the player's control for sending the striker's ball further.
- **The hands descend at contact** (user, 2026-10-11: the low point falls "partway through the push: the hands still
  descend at contact"; the first draft wrongly kept level-arriving hands). This reopens P2b.2b.2a's "hands arrive with
  no vertical velocity", as the roadmap's scope for this step says. The carry downswing's hands' path ends tangent to
  the hands' arc (§4.1). The head's descent at contact follows from the arc and the pendulum, and Gugan's 6–16° is a
  held-out check, never a target.
- **A pre-flight gate** (§8) stops for the user on the canonical rolls before anything else is built on the mechanism.
- **Calibration waits.** "We can calibrate when/if it works": P2b.2b.2c.

## 1. Goal and exit criteria

In carry mode (the three rolls) the hands hold the mallet through a measured, compliant flex from contact on. They push
forward without braking, and they hand over to a pendulum phase that swings the mallet through vertical. The stroke's
inputs gain the pendulum phase's start and effort. The handover keeps a lifted ball clear of the head.

Exit criteria:

1. The analytic cases of §7.1 hold.
2. The pass roll's "punch beats coast" test passes, and its `it.fails` is removed. The test stays as it is, comparing
   `stroke.drive` +1 with 0 (the push's punch), at the canonical pendulum phase.
3. No impact ends with the head overlapping a ball as handed over, over the late re-hit sweep of every preset
   (`scripts/swingProbe.ts`).
4. **The head stays on point behind the striker's ball** (user, 2026-10-11: "we mustn't repeat the failure of
   letting the mallet head roll over the top of the ball"). It is the old 45° roll's dead-stop mechanism, and the
   flex's dip, which steepens the lean, could revive it. On every roll's canonical runs at 2 and 3 m/s, and on every
   run of the `presets` sweep (225 a roll), from contact until the face last leaves the striker's ball:
   - the head's centre stays behind the striker's ball's centre along aim;
   - every face contact point on the striker's ball lies below the ball's centre height plus R·sin 45° (the face
     meeting the ball no higher than a 45° lean puts it);
   - the lean never exceeds 45°.

   A run that fails is counted and listed. Any failure on a canonical run stops the plan for the user.
5. The swing-mode presets (single-ball, drive, AC stop, GC stop) are bit-identical: the impact digest's cases, the
   phase-2 digest, and a full-precision digest of every swing preset's canonical and sweep runs (a throwaway script,
   as P2b.2b.2b.1's plan's `presetDigest`), with the outcome's `engineVersion` normalised. The
   one allowed exception is a case whose impact ends with the head overlapping a lifted ball, which the handover rule
   (§5) moves. Each such case is listed (2a recorded none outside the pass roll).
6. Every preset's canonical setup meets P2b.2b.2b.1's exit criterion 4: `simulateShot` with `trajectory: true` runs from
   top to finish with no `RangeError`, no re-entry guard hit, no ball centre more than 5 mm above R, no `follow-cap`,
   and the trajectory continuous at every boundary.
7. The pre-flight gate (§8) has run and the user has ruled on it.
8. The figures of §9 are recorded in the roadmap. They are observations, not gates.
9. `ENGINE_VERSION` is "0.10.0".

The pass roll's ratios, the crossings and the longest impact are recorded against 2a's (§9), not gated: exit criterion
2 is the test of the pinned pass roll, and the ratio is P2b.2b.2c's to calibrate.

## 2. Architecture

```
src/engine/impact/flex.ts            new: the hands' flex law, k = k₀ + κ·|F_ff|, c at the damping ratio ζ_arm (§3)
src/engine/impact/track.ts           carry mode after contact: both hands on the flex to the intended path; the push
                                     with no brake; the pendulum phase (§4); in carry only, the reach's brake, its
                                     scripted descent and release by reach removed; GripState gains the phase state
src/engine/impact/types.ts           SwingArc gains pendulumAt and pendulumEffort, loses groundDepth; FlexLaw
src/engine/impact/integrate.ts       carry's finish at the swing's apex after the pendulum phase starts (§4.3); the
                                     impact's end waits for the pendulum phase (§4.2)
src/engine/impact/handover.ts        the head-clearance rule (§5)
src/engine/impact/simulateImpact.ts  handedOver passes the head; validation of the new inputs
src/engine/swing/types.ts            ShotSetup.stroke gains pendulumAt? and pendulumEffort?; SwingDrive gains their
                                     defaults and the hands' arc (handArcRadius, handArcLow), and loses groundDepth
src/engine/swing/downswing.ts        carry: the hands' path ends tangent to the hands' arc, descending (§4.1)
src/engine/swing/buildContact.ts     planStroke carries the pendulum inputs and the hands' arc into the arc
src/engine/swing/profile.ts          the rolls' canonical pendulumAt, pendulumEffort and hands' arc (§6)
scripts/fitStrokeShape.ts            re-run for the rolls: their defaultBackswing h₀ moves with the new downswing
src/engine/simulate.ts               ENGINE_VERSION 0.10.0
reference/contact.json               armStiffness (k₀), armStiffnessPerForce (κ), armDampingRatio (ζ_arm),
                                     armEndpointMass (m_arm), pendulumForce (F_pendulum), each sourced (§3.2)
scripts/strokeProbe.ts               asPlayed for all three rolls; the pendulum-timing sweep (§9)
scripts/swingProbe.ts                re-run: braking hands, the late re-hit sweep with the handover rule
```

Unchanged:

- the swing mode (single-ball, drive, AC stop, GC stop), whose `handLoad` branch is untouched;
- the downswing's coupling in carry mode: the hands lead with today's feed-forward, springs and dampers until
  `relaxAt` (contact). Only the carry hands' path's last part changes, to arrive descending (§4.1);
- the face–ball and turf laws, the head–turf law (P2b.2b.2b.3's), and the mallet (P2b.2b.2b.2c's).

Everything stays under the determinism lint.

## 3. The flex

### 3.1 The law

From contact on, in carry mode, each hand h (top and bottom grip) applies its feed-forward plus a spring-damper in
three dimensions to its point on the intended path (§4.1):

- F_h = F_ff,h − k_h·(x_h − x̂_h) − c_h·(v_h − v̂_h), where x_h is the grip point on the shaft and x̂_h its intended
  position.
- **F_ff,h is the hand's share of today's feed-forward** (`handLoad`'s topShare and bottomShare): the swung body's
  weight and the intended motion's inertia, split over the two grips so that their moments give the intended motion's
  wrench. The player holds the mallet's weight and drives its intended motion. The flex is the arm's give under the
  load beyond that, the balls and turf resisting the push, as the user describes it. Without the feed-forward the head's
  weight alone would sag the hands 2–22 cm at k₀. This was the lead's call in the spec review, not the user's; it is
  revisitable at the pre-flight gate (§8), which can show the springs-carry-all variant if the dip looks wrong.
- **k_h = k₀ + κ·|F_ff,h|**: the stiffness rises linearly with the force the arm generates voluntarily, which is what
  Perreault et al. measured (stiffness against voluntary isometric force). It is driven by the feed-forward, not by the
  spring's own force, so it has no feedback loop. A law on the total force, F ≈ k·x with k = k₀ + κ·|F|, runs away at
  x = 1/κ.
- **c_h = 2·ζ_arm·√(k_h·m_arm)**, with m_arm the arm's measured endpoint mass (Fortineau et al., 227–893 g): the
  damping ratio is held constant, as Perreault measured.
- The run's flex and phase state (each hand's last stiffness, the pendulum phase's start) lives in `GripState`, which
  already carries the grip's state from the impact into the follow-through.

The two hands sit at different distances from the socket (`bottom` < `top`), so their springs together resist the
mallet's pitch with a stiffness of about k·d², d = top − bottom. **The angle hold emerges from the two hands' flex**,
with no separate angle spring. When the ball and turf pitch the mallet up, the springs store the load, and their
recovery drives the face on: the user's flex and recovery.

Today's carry branch after contact (`track.ts` `handLoad`) is replaced. That branch drops to velocity-only coupling at
contact (grip-tension and bottom-grip shares plus dampers on velocity lag), so nothing restores the angle. The twist
about the shaft keeps today's damper and grip share, since the roll's question is the pitch.

### 3.2 Sources

Physiology, cited and not mirrored (repo rule):

- **Low-effort endpoint stiffness and damping:** 45–445 N/m and 2.2–17.5 N·s/m, mass 227–893 g, over 31 participants
  in a rhythmic task (Fortineau, Siegler, Makarov and Rodriguez-Ayerbe, *PLoS One* 18(12):e0295640, 2023, DOI
  10.1371/journal.pone.0295640). Earlier ranges quoted there: 150–700 N/m (Burdet et al., *Nature* 414:446, 2001,
  DOI 10.1038/35106566), 44–189 N/m (Tsuji and Tanaka) and 49–339 N/m (Erden and Billard).
- **Stiffness rises linearly with the arm's force, and the damping ratio stays nearly constant** across forces and
  postures (Perreault, Kirsch and Crago, *Exp. Brain Res.* 157(4):507–517, 2004, DOI 10.1007/s00221-004-1864-7).
- **Stiffness rises linearly with grip force**, independent of posture: Kyy at the centre 167 N/m at 5 N of grasp to
  205 N/m at 20 N (Takagi, Xiong, Kambara and Koike, *Sci. Rep.* 10:379, 2020, DOI 10.1038/s41598-019-57267-0).

**Sourcing gaps, closed by the plan's first task.** κ (stiffness per newton of the hand's force), ζ_arm, m_arm (a
value within Fortineau's range, and its basis) and F_pendulum (the wrist and forearm's forward push, §4.2) need
numbers. Perreault's papers (2002, 2004) are paywalled, and the
low-force studies do not reach a roll's 100–150 N. The task finds open figures (Europe PMC full texts, theses,
reviews). If it cannot, it **stops for the user** with the candidates, and does not guess.

### 3.3 Scale

Today's coupling is about 11,000 N/m (`HAND_COUPLING`, T 0.08 s on the 1.8 kg swung body). The measured arm is 10–100×
softer at low effort and much stiffer under a roll's push. The flex may therefore be centimetres, not millimetres. That
is plausible for the user's dip, but it is what the pre-flight gate (§8) is for.

## 4. The push, the pendulum phase and the finish

### 4.1 The push (contact to the pendulum phase)

- **The hands' arc.** The top hand's intended path is a circular arc in the swing plane, of radius `handArcRadius`
  (ρ_h). Its lowest point lies `handArcLow` × push length ahead of the hands' contact position along aim. At along-aim
  travel s from contact, the intended height is z_low + ρ_h − √(ρ_h² − (s − s_low)²), s_low = `handArcLow` × push
  length. The hands therefore arrive descending at asin(s_low/ρ_h), bottom out at s_low, and rise after it. Along
  aim the intended motion keeps today's carry profile: the hands' acceleration over `handWindow` at full `drive`, then
  a coast. Both grip points' intended positions follow it rigidly at the arc's planned pitch θ(t) (below).
- **It starts from the actual grips.** The intended path starts from the grips' **actual** positions and velocities at
  `relaxAt` (contact), not the planned ones: the carry downswing has no position spring, so the two differ, and
  starting from the plan would put a step force on the mallet at contact. From there x̂_h(t) is the actual start plus
  the planned motion since `relaxAt`. The dip (`handDrop` over `dropTime`) still adds to the intended path as today.
- **The downswing arrives on the arc.** Today's carry hands' path P(σ) = P_b + Δ_h·σ² + Δ_z·(3σ² − 2σ³) arrives level
  (the Δ_z cubic's slope is 0 at σ = 1, `downswing.ts`). Its vertical term becomes the cubic Hermite with the same ends
  and an end slope matching the arc's tangent at contact, so position and velocity are continuous at contact. The
  head's speed at contact changes, so `scripts/fitStrokeShape.ts` re-fits the rolls' `defaultBackswing` h₀ to their
  planned speed (as P2b.2b.2b.1 did). The swing-mode presets' downswings are untouched.
- **The push length** is the shot's `handReach` (absent: the preset's). The intended path stops advancing once it has
  travelled the push length along aim. It stops at once, not on a deceleration ramp: the flex is soft, so the hands
  pass from push to rest through the springs, not through a scripted brake.
- **Removed, in carry mode only:**
  - the reach's constant deceleration over its last 0.2 (`computeReach`'s brake, `track.ts`);
  - the carry descent's rest-to-rest lowering by `groundDepth` (`SwingDrive.groundDepth` and `SwingArc.groundDepth`
    go; only carry reads them);
  - the bottom hand's release by reach (`lever·Δθ > reachSlack`, about 5.5° on the full roll against the ~11° rise of
    the roll as played). The pendulum phase is now the bottom hand's one release, and `ImpactRun.release` reports its
    start.

  `computeReach` and `pivotAt` are shared with swing mode, where a shot's `handReach` still brakes as today. The hands'
  dip is the arc's plus the flex's.
- **The planned pitch θ(t).** The pendulum term in the push is today's: the arc's `speedGain` over `window` from the
  contact pitch, then today's "slope held" ramp to zero rate, after which θ holds. It sets the intended pitch that the
  two hands' intended positions follow; the actual pitch departs from it only through the flex.

### 4.2 The pendulum phase

It starts when the intended path has travelled `pendulumAt` × push length along aim (`pendulumAt` in [0, 1]):

- **The bottom hand changes job.** It lets go of its spring and instead pushes forward, perpendicular to the shaft in
  the swing plane, with `pendulumEffort` × F_pendulum (`pendulumEffort` in [0, 1]). That rotates the mallet about the
  top hand. At effort 0 it simply lets go, and the mallet swings on its own momentum and weight. The push lasts until
  the shaft passes vertical (pitch 0), then the bottom hand is off the mallet. A constant push past vertical could
  outweigh gravity's moment and never let the swing top out.
- **The top hand stays on its flex spring.** Its stiffness follows its force (§3.1), so as the push's load eases it
  relaxes towards k₀ and becomes a soft pivot rather than a brake. Its intended position keeps to the intended path,
  which stops at the push length. The hands' rise emerges as the mallet swings up past vertical and the flex recovers.
- **The impact waits for it.** The pendulum phase's start time is known from the plan (the intended path's travel), so
  `trackEnd` (`integrate.ts`) includes it. The impact cannot end before the pendulum phase starts, or `pendulumAt` and
  `pendulumEffort` would act only in the ball-free follow-through and could never touch the balls. `stillReaching`'s
  look-ahead uses the intended path's velocity, which is zero once it stops at the push length.
- **Starting it too soon is allowed** (user: "a common mistake… not a good shot"). With no bottom hand holding the
  angle before the push has done its work, the head climbs over the striker's ball or leaves it early. The run gives a
  poor ratio or a fault flag from the physics, not a rejected input.

### 4.3 The finish

In carry mode the follow-through ends at the swing's first apex after the pendulum phase starts: the pitch rate about
the swing axis falls to zero or below. This reuses the swing mode's apex rule (`integrate.ts` `finished`) in place of
carry's "t ≥ reach.tStop and the head at rest". Whether the mallet passed vertical (pitch > 0, positive swinging
forward) is recorded by the probe, not required to finish. A swing that tops out short of vertical still ends at its
apex rather than oscillating about the top hand, which has no rotational damper, until the cap. `FOLLOW_CAP` (1 s)
stays as the guard.

## 5. The handover rule

`handedOver` (`simulateImpact.ts`) passes the run's head pose and the `MalletHead` to `handover`. After `placed` lifts
each ball from its pit to z = R, and before the ball-pair and obstacle separation:

- the head's contact with the lifted ball is read from `contacts.ts`' `headBallContact`: its depth and its normal,
  whichever of face, rim or barrel it is;
- a ball the head overlaps moves horizontally along that normal's horizontal part, by depth / |n_horizontal|, so that
  a tilted face clears too, until it is clear to within `CONTACT_TOLERANCE`. It keeps its velocity;
- the head check joins the existing pass loop over ball pairs and obstacles (`handover.ts`), so a ball the pair pass
  pushes back into the head is moved again, within the same `HANDOVER_PASSES` bound;
- `overlapCorrection` takes the largest move, as it does today (it is a maximum, not a sum).

**Its bound.** The rule is for the lift's artefact, which is at most the static sink (about 0.44 mm). An overlap
deeper than the ball's static sink plus `CONTACT_TOLERANCE`, or a normal within 1e-6 of vertical (a head on top of the
ball, with no horizontal way out), is not this rule's. The handover throws an Error naming the ball, since the impact
must not end there.

The pass roll's 15 overlaps (0.002–0.078 mm) become corrections of that size.

## 6. Inputs, presets and validation

- **`ShotSetup.stroke`** gains `pendulumAt?` and `pendulumEffort?`, each in [0, 1], absent meaning the preset's.
  `handReach?` stays and is documented as the push length in carry mode.
- **`SwingDrive`** gains `pendulumAt` and `pendulumEffort` (the defaults), `handArcRadius` (m) and `handArcLow` (in
  [0, 1], a fraction of the push length), and loses `groundDepth`. The hands' arc is the player's, a preset value like
  the stance, not a per-shot input.
- **The rolls' canonical values** are presets, not fits:
  - half roll: push 0.15 m;
  - full and pass rolls: push 0.3 m;
  - every roll: `pendulumAt` 0.8 (where today's reach began braking) and `pendulumEffort` 0 (let it swing);
  - every roll: `handArcRadius` 1.5 m and `handArcLow` 0.5, **placeholders**, unsourced and flagged as `handAngle` is.
    The radius is about a standing player's shoulder height, the user's "origin much higher in the sky". The low point
    halfway along the push is the middle of the user's "partway through the push … or at its end". On the full roll's
    0.3 m push, the hands arrive descending at asin(0.15/1.5) ≈ 5.7°.
- **The swing-mode presets** carry the two fields for the type's sake and never read them.
- **Validation:** `pendulumAt`, `pendulumEffort` and `handArcLow` finite and within [0, 1]; `handArcRadius` finite and
  greater than the push length (so the arc is defined over the whole push); the flex's sourced values positive; ζ_arm
  within (0, 1]. The rest is as today.

The pre-flight gate (§8) may move these defaults on the user's ruling. Nothing is tuned to a ratio.

## 7. Testing

### 7.1 Analytic cases

- **The flex alone.** A still grip point given a step load F deflects F/k and rings at ζ_arm. The stiffness after the
  load is k₀ + κ·F.
- **The pitch stiffness.** Two hands on a rigid mallet resist a small pitch δθ with a moment k_top·r_top² +
  k_bot·r_bot² about the pitch axis within 1 %, the grip points at their distances from the pitch axis.
- **The hands' arc.** The carry downswing's hands arrive at contact with position and velocity continuous onto the
  arc, descending at asin(s_low/ρ_h), and the intended path bottoms out at s_low.
- **No brake.** A carry run with no ball: once the intended path stops, the hands' force along aim stays within the
  flex's spring and damper. There is no feed-forward deceleration term.
- **The pendulum phase at effort 0** is a free pendulum about the top hand: with the top hand's damping set to zero it
  conserves the mallet's energy about the pivot to within the integrator's error over its swing.
- **The pendulum phase at effort 1** adds the work F_pendulum·(path of the bottom grip) up to vertical, within 1 %,
  and none after it.
- **The finish** falls at the swing's first apex after the pendulum phase starts, whether past vertical or short of it,
  never at the cap.
- **The flex has no runaway:** a step load held for 1 s settles to F/k with k fixed by the feed-forward.
- **The impact's end** never comes before the pendulum phase's start.
- **The handover rule** clears a lifted ball beneath a head resting just clear of the pit, by the overlap's size, also
  against a tilted face; leaves a ball the head does not touch bit-identical; and throws past its bound.
- **The pass roll's "punch beats coast"** (`tests/engine/shot.test.ts`) passes.

### 7.2 Bit-identity

The swing-mode presets are bit-identical (exit criterion 5). The rolls move. Their tests' recorded figures
(`CANONICAL_*`, the stroke tests' ratios and timings) are re-recorded from the plan's run, and each change is listed
in the amendments.

## 8. The pre-flight gate

Once the flex (§3), the push (§4.1) and the pendulum phase (§4.2) land, the plan **stops for the user** before the
handover rule, the probes, the presets' defaults or the roadmap are recorded. It shows the three canonical rolls at 2
and 3 m/s:

- **first, the head on point** (exit criterion 4): the head's centre behind the striker's ball's centre along aim, the
  face's contact points against R·sin 45° above the ball's centre, and the peak lean against 45°, through every face
  interval. A climb over the ball is the mechanism failing, whatever else the figures show;
- the lean through contact and the pitch through vertical;
- the hands' dip: its depth, when it bottoms out, and its recovery;
- the head's descent at contact and through the push (its path's angle below horizontal while the face is on the
  ball), against Gugan's stroke angle β of 6–16° and beside 2a's contact figures (half 9.70°, full 3.05°, pass 4.48°
  at 3 m/s);
- the face intervals;
- the ratio;
- a slow-motion export (as 2a's review).

The user rules: go on, change the defaults (the hands' arc's placeholders among them), or change the mechanism
(including the weight support of §3.1). The gate always stops, whatever the figures show.

## 9. Probe (recorded in the roadmap)

- **`asPlayed` for all three rolls** (today: the full roll at 2 m/s only): the figures of §8, plus the hands' force
  along aim at the pendulum phase's start and its minimum (no brake), and the striker's speed lost while the face is
  on it.
- **The pendulum-timing sweep:** `pendulumAt` over 0.2–1.0 at a slow and a fast push (short and long range), the ratio
  and the striker's distance at each. It records how sensitive the outcome is to timing, which the user expects to be
  highest on a long, fast push. Recorded only.
- **The held-out checks** (each against a measurement it was never fitted to):
  - the head's descent at contact and through the push against Gugan 4's stroke angle, 6–16° on rolls;
  - the apparent contact against the CA's 30–58 ms (Project Croquet Dynamics);
  - the second contact against Gugan 4's and Hall's several milliseconds;
  - the face intervals against Cross's seven taps, "the ball sticks to the mallet";
  - the rolls' ratios beside Gugan's: full 1.20–1.24, pass 0.94–1.21, half 2.30–2.46.
- **2a's items, re-recorded:** the ratios over 2–4 m/s for every preset; the striker's face intervals; the late re-hit
  sweep's crossings and the handover's overlaps (none, exit criterion 3); the cap and flag tallies; the longest impact
  against the 450 ms cap; braking hands (`swingProbe.ts`); and cost per step against P5's provisional budget.

## 10. Deferred

- **P2b.2b.2b.2c:** the square head, end-weighting, the market's dimensions.
- **P2b.2b.2b.3:** the head in the bed, ploughing, the grip breaking.
- **P2b.2b.2c:** calibration: the rolls' ratios, the phasing's defaults against strokes as played, and the effort
  ceiling.
- **P3/P4:** per-player phasing, choosing the inputs from where the balls should end up (the planner), and the
  mapping of perceived effort to intensity.
- **Later:** a direction-dependent (elliptical) arm stiffness. The literature measures an ellipse, and the user's
  "more ovoid than circular" may be its trace; this step's flex is isotropic unless the pre-flight gate asks for more.

## 11. Roadmap changes (in this PR)

- The P2 row: P2b.2b.2b.2b named with this spec; its exit criteria as §1.
- "P2b.2b.2b decisions and findings": the user's account and decisions of 2026-10-11, and the vocabulary note.
- A new "P2b.2b.2b.2b outcomes" section with §9's figures and the pre-flight gate's ruling.
- "Provisional numbers" unchanged.

**Housekeeping** shipped first, as its own PR (#23): `eslint-plugin-svelte` 3.23.1 and `prettier` 3.9.10. TypeScript 7
is still blocked by typescript-eslint and svelte-check, and the actions and runner are current. The 2a pre-review's
follow-ups landed in #24.
