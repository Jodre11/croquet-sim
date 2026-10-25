# P2b.2b.2c.2d — The Follow-Through: a Player's Control on Every Croquet Stroke: Design

**Product spec:** `2026-09-30-croquet-shot-lab-design.md` §4 (impact phase).
**Stroke shape spec:** `2026-10-06-p2b2b2a-stroke-shape-design.md` (the pendulum's and the hands' pulses, `drive`).
**Roll stroke spec:** `2026-10-11-p2b2b2b2b-roll-stroke-design.md` (carry mode's push, the flex, the push intent).
**Single-ball spec:** `2026-10-18-p2b2b2c1-single-ball-design.md` (swing mode's advance, `handAcceleration`).
**Contact laws spec:** `2026-10-22-p2b2b2c2c-contact-laws-design.md` (the step before; decision 2 sends the user's
braking stop here, §6 and gate E send the re-contacts after the parting here).
**Evidence:** `docs/superpowers/probes/2026-10-20-p2b2b2c2-drive-double-hit.md` (the drive's late catch);
`docs/superpowers/probes/2026-10-23-p2b2b2c2c-gate.txt` (the 0.75 mm figures).
**Roadmap:** P2 row's P2b.2b.2c.2d entry; "P2b.2b.2c.2c outcomes (2026-10-23)" and its "Carried open items".

**Why this step.** The follow-through is the player's main control, beyond speed and stance, over how far the
striker's ball goes compared with the croqueted ball. Today it is fixed per stroke type in the profile, delivered as
box pulses with unbounded jerk, and a brake begun before contact, though expressible, is untested and drops gravity
while it acts. The visible miss is the full roll: ratio 1.86 against coaching's about 1, beside the half roll's 2.20,
because it carries the profile's prototype push. The drive's default catches the rolling striker's ball at 96.4 ms (a
push, a fault), and 922 of 950 grid runs at 0.75 mm are flagged as possible fault 29.1.6.1 for a re-contact after the
balls part, whatever its size or effect.

**The user's account** (2026-10-23, verbatim):

- "I suspect that the follow through will be useful in making subtle adjustments to both stop shots and even the
  drive."
- "In the stop shot you are actively reducing the follow through. In fact probably trying not to follow through at all
  before you even hit the ball. Just timing it just right. And the drive varies depending on what you want to happen.
  Whether you want the Strikers ball to come up shorter or longer."
- "Obviously for roll shots a half roll is more of an angled drive. Full rolls on pass rolls rely on follow through to
  make the Strokes ball keep up with the Croquette ball." (Dictated: "striker's ball", "croqueted ball".)
- "For the full/pass roll the acceleration or jerk of the follow through may be relevant. Probably for any follow
  through but most shots are played smooth."
- On where the push comes from: "some combination of the arms, the wrists, your weight stepping or leaning forward, or
  something else, depending on magnitude."
- On the stop: "In my mind, I aim to stop the mallet dead as soon as contact is complete. I often mistime this and end
  up under hitting the shot. However, I suspect it would be impossible for the human body to do this in response to
  impact. The deceleration must be planned and anticipated and must initiate before the mallet reaches the ball."
- On the brake and the jab: "I time the dip with the slow down, using the ground to slow the mallet, it is coupled at
  the same moment."
- On how the follow-through reaches the balls: "those actions that I'm describing definitely do affect the play. So it
  would suggest that the hand's action is affecting a number of extra contacts with the ball i.e. no follow-through
  stops that quick micro-hit if there wasn't such a thing exists or a bit of extra follow-through causes the ball to be
  topped a bit. I don't know."
- On judging a re-contact: "In reality I think the allowance is much more generous than this." "It's the sort of
  second hit that changes the momentum or direction of the ball. Believe in some people's mind there is no rule
  although it seems to be stated in the laws." "I think in practice a long succession of micro hits with small
  separation would be viewed as all part of the same contact."

**Circularity.** The user's play data and hypotheses are checks, never fit targets. As the roadmap sets it, the AC stop
and the drive are calibration targets (Gugan 5's 7.15 ± 0.6 and 4.23 ± 0.2 at 3 m/s at the ball); the rolls are
held-out validation and are never tuned to a ratio. A roll's default changes only by a written argument from the
sources or the user's account of how it is played, and its ratio is then observed.

**Vocabulary.** As the contact laws spec's: "split", "ratio" and "cut" keep their croquet meanings only; the **gap**,
the **squeeze**, the **tap** and the **double tap** as there. New here:

- **Follow-through:** what the player does to the mallet from shortly before contact to the finish: braked, left to
  swing (natural), or pushed through.
- **Magnitude:** the existing `stroke.drive` in [−1, +1]: −1 stopped short (the brake), 0 natural, +1 pushed through.
- **Sharpness:** how quickly the follow-through's change is delivered, its duration (`stroke.window`, §3.2); shorter
  is sharper.
- **Brake:** a follow-through with magnitude < 0.
- **Parting:** as `faults.ts`'s `partingOf`: the end of the croqueted pair's first contact.
- **Contact speed:** the head's speed along aim at its first face contact with the striker's ball, as struck; the
  **planned speed** is the contact-free downswing's figure the planner solves for (`poseSpeed`). They differ under an
  early pulse.

## Decisions (user, 2026-10-23)

1. **Housekeeping first, separately**: npm bumps, GitHub Actions majors and runners, checked against the registries,
   in their own small PR that lands before this step's branch.
2. **The follow-through is a control on every croquet stroke**, not a per-type style: on the stop it is withheld, on
   the drive it fine-tunes the striker's ball longer or shorter, the half roll plays as an angled drive, and the full
   and pass rolls depend on it (user: "This seems right", to the playback).
3. **The four follow-throughs** the user described earlier (force the arc, push the hands straight along the line,
   natural, stopped short) become positions on one range of magnitude, each stroke type with a default on it (the
   playback, accepted).
4. **Sharpness matters**, most of all on the full and pass rolls; most strokes are played smooth, so smooth is the
   default.
5. **The brake is planned, not reactive**: it begins before contact, at a moment and strength the player chooses;
   nothing in the engine responds to the impact. Mistiming (the under-hit) comes out of the physics.
6. **The brake and the dip are one movement**: on the stop they share one timing.
7. **The push recruits more of the body with magnitude** (wrists, arms, then weight). The model keeps its two hands on
   the shaft (the articulated body stays deferred beyond P2b); the push is delivered through the hands.
8. **Scope** as played back and accepted (user: "That looks right, go ahead"): in, the control (magnitude and
   sharpness), the coupled brake and dip, better defaults per type, the judging of re-contacts after the parting,
   #35's refactors first, the user's roll hypotheses and the jab qualifier tested (not fitted), `STRIKE_WINDOW`
   re-checked; Gugan 5's "super pass-rolls" a check that must emerge, not be built. Out: any fit of the rolls, an
   articulated body, the whole swing swept against hoops and the peg (P2b.2b.3).
9. **The natural push's growth with the swing's power is deferred** to P2b.2b.2c.3, beside the sourced recruitment law
   it needs (spec review, "Defer it (Recommended)"). The rolls' hypotheses are tested on an unchanged push.
10. **A re-contact is judged by its effect, and micro-hits are one contact** (§7): a succession of micro-hits with
    small separations is one continuing contact; a distinct second hit after a real separation is possible fault
    29.1.6.1 only if it materially changes the striker's ball's speed or direction. Both thresholds are ruled at the
    gate from the measured spread.
11. **Where the ball is met on the arc is swept before any default moves** (user, 2026-10-24, after planning; §3.5).
    The user: "The prime factor which a player varies when they decide the type of shot is foot position relative to
    the ball, [that] is always key, before any consideration of follow through. Obviously, this moves the nadir/apex
    of the arc backwards or forwards relative to the ball", with the order "stops furthest back, drives, default
    adjusted accordingly, then "feet" moving forward according to the roll". Ruled: "Fold into gate 1": the stance
    sweep runs at the gate's stage 1, which rules whether the stance becomes a calibrated default.
12. **Gravity acts through the pulse on every swing stroke** (user, 2026-10-24, "A: every stroke"): drive 0 included,
    so single-ball and drive runs move, in their own commit and counted (§3.1, §9 step 2). This replaces the first
    reading of §6 and §9, under which drive 0 stayed bit-identical; the two could not both hold.

My calls (the user may overrule any of them):

- **No new magnitude input.** `stroke.drive` already is the range from stopped short to pushed through; renaming it
  would churn the public API for no behaviour. The preset decides where the push goes (the pendulum's `speedGain`,
  "force the arc", on the swing strokes; the hands' `handGain` and reach, "push the hands along the line", on the
  rolls), as today; no shot-level arc-versus-hands split is added.
- **Sharpness is a duration in seconds**, `stroke.window`, not a unitless dial; it sets both pulses' duration (the
  presets' `window` and `handWindow` are equal in all seven).
- **The pulses become smooth** (§3.1), finite in jerk, so that sharpness is a peak acceleration and a jerk, not only a
  length.
- **Gravity always acts on an early pulse** (§3.1): the pulse replaces the player's effort from its start, never
  gravity.
- **The push's force cap stays the measured arm figure** (`pushForce` 92.2 N); the gate is told whether it binds on each
  roll (§8), the lead for the deferred recruitment law.
- **The grips still relax at the planned contact** under an early brake: the player relaxes on the strike they
  predicted (contact laws spec, decision 2), so a mistimed brake relaxes at the wrong moment too.
- **The planner includes the planned dip on croquet strokes only** (§4.2), so the single-ball graze stays playable.
- **The AC stop calibrates at the contact speed** (§6): 3 m/s at the ball, as Gugan 5 measured it.
- **The step's gate has two stages** (§10): the mechanisms, and the re-contact thresholds, are ruled before any default
  moves.

## 1. Goal and exit criteria

The goal: a player can set how a croquet stroke follows through (braked, natural or pushed, and how sharply), the
engine plays it from that input alone, the stroke types' defaults are better grounded, and a re-contact after the
balls part is judged as the Laws are applied in play.

Exit criteria:

1. **The tidy** (§2): #35's two refactors, the preset digest's `phys` and `faults` bit-identical.
2. **The smooth pulse** (§3.1), with its analytic cases: Δv and duration as the box's; zero acceleration at both ends;
   the peak acceleration and jerk as the closed form gives; gravity acting through an early pulse.
3. **Sharpness as an input** (§3.2): `stroke.window`, validated; absent, the preset's; its analytic cases.
4. **The routes** (§3.4): the follow-through grid run on every croquet preset at both gate stages, the ratio's change
   recorded with each route's share; monotonicity in the magnitude judged and taken to the gate, not failed. The stance
   sweep (§3.5) run at stage 1 and ruled.
5. **The planned brake** (§4): a brake begun before contact plays end to end; the dip coupled to it; a brake that
   leaves no face contact reported as such, never a throw; on the brake sweep the contact speed non-increasing as the
   onset moves earlier or the brake strengthens.
6. **Re-contacts after the parting** (§7): micro-hits merged, each distinct re-contact reported with its effect;
   possible fault 29.1.6.1 raised only for a re-contact past both ruled thresholds.
7. **Better defaults** (§6) ruled at the gate's stage 2: the AC stop within Gugan 5's tolerance at 3 m/s at the ball;
   the drive's late catch diagnosed and ruled; the full roll's hypothesis variant recorded and ruled; each default's
   moved runs counted.
8. **The checks** (§8) run, recorded and ruled.
9. **Every preset's canonical setup** runs from top to finish, each default within 2 % of 3 m/s (the planned speed;
   for a default with an early pulse, the contact speed, the planned speed reported beside it); no run of the late
   re-hit sweep ends with the head overlapping a ball as handed over; the step convergence (dt/2, dt, 2·dt) re-checked
   on the moved defaults.
10. **The ratchet** (§9), the two-stage gate (§10), the figures recorded (§11), and `ENGINE_VERSION` 0.17.0.

## 2. The tidy (#35), first

Issue #35's two readability refactors in `src/engine/faults.ts`, behaviour unchanged, as the step's first commit:

1. The 29.1.6.1 block (about line 424): compute the faulting contacts first, then one `add()`, attaching `afterParting`
   only when the parting is non-null.
2. `partingOf`'s `keys` ternary and its `as BallId` cast extracted into a helper (e.g. `touchedPairKeys`) that states
   `croqueted` is defined for a croquet stroke.

Acceptance: the preset digest's `phys` and `faults` bit-identical; `npm test`, lint, check and format clean. §7 then
builds on the restructured block.

## 3. The control

### 3.1 The smooth pulse

Today each follow-through change is a box pulse: the pendulum's α = drive·speedGain·contactSpeed/(lever·window)
constant over [arcStart, arcStart + window] (`buildContact.ts:719-720`, `track.ts:938-944`), and the hands'
A = aim·drive·handGain·contactSpeed/handWindow constant over [handStart, handStart + handWindow]
(`buildContact.ts:712-713`, `track.ts:580-598`). The window's length already sets how quickly the change comes, but
its acceleration steps on and off, so its jerk is unbounded and a "smooth" push cannot be told from a "sharp" one of
the same length by anything but that length. The user's "acceleration or jerk" asks for both.

Each pulse keeps its Δv (Δω for the pendulum) and its duration T, and takes a smooth acceleration profile with zero
acceleration at both ends: the minimum-jerk profile for a change of velocity over T with those end conditions,
a(s) = 6·Δv/T · s(1 − s), s = (t − start)/T, so v rises as Δv(3s² − 2s³). Its peak acceleration is 1.5·Δv/T and its
jerk ±6·Δv/T². The builder cites the minimum-jerk model of voluntary movement (Flash and Hogan 1985) by URL, date and
hash per the repo's source practice, quoting only what is used.

**Gravity always acts** (my call). Today, once a pulse starts before contact, the pendulum leaves the downswing's table
and runs on the constant α alone, dropping gravity and the player's effort (`track.ts:938-944`); after the window it
swings free with gravity but no effort (`track.ts:679-684`). So an early brake would also cancel gravity's own
acceleration, and part of the under-hit would be an artefact. From this step, within a pulse the pendulum's θ̈ is
gravity's term (as `freeAlpha` computes it, the pivot's acceleration included) plus the pulse's; the player's effort
ends at the pulse's start (the player's own torque turns from driving to the pulse), and after the window the free
pendulum carries on as today. At the presets' defaults the effort is nil (intensity 0), so on a pulse begun at contact
only gravity's share within the window changes. The plan derives θ and ω through the pulse (by integration, as the
free pendulum's table is made) so that `trajectory.ts` stays continuous at every boundary.

After the window: swing mode's free pendulum as today; carry mode's quartic hold as today, its formula unchanged but
starting from α₀ = 0, the smooth pulse's end, and keeping the preset's window whatever the shot's `stroke.window`
(my call: the hold is not the pulse).

The analytic cases: the integral of a over T is Δv; a(0) = a(T) = 0; the peak and the jerk as above; gravity's share
over an early pulse against a hand integration; continuity of θ, ω and the pivot at every seam.

### 3.2 Sharpness: `stroke.window`

`ShotSetup.stroke.window` (s, > 0; absent, the preset's `window`): the duration of both follow-through pulses, the
pendulum's and the hands'. It is validated with the other stroke inputs (finite, > 0, and within a bound the builder
sets from the lead and the impact's caps, stated in the plan). Shorter is sharper: the same Δv over a shorter T, a
higher peak and jerk. Swing mode's advance keeps the body's `handAcceleration` (a body property the player never sets,
P2b.2b.2c.1).

### 3.3 Magnitude: `stroke.drive`, unchanged in meaning

−1 stopped short (the brake), 0 natural, +1 pushed through, scaling both pulses as today. On a swing stroke the push is
the pendulum's (force the arc); on a roll it is the hands' and the push's reach (push the hands along the line). The
documentation of `drive` in `swing/types.ts` gains this mapping and the four follow-throughs' names, none of which the
engine reads.

### 3.4 How a follow-through reaches the balls

The face–ball contact lasts about a millisecond, so a follow-through cannot act on the balls by force after they have
gone. The last step measured the hands' reach within the strike (contact laws spec §7.6): on the landed laws, the head
freed of the hands for 5 ms moves v₂/U by under 0.003 and w₁/W by up to 0.031. That is not negligible: distance goes
about as speed squared, so 1.8 % on the striker's ball is about 3.6 % on the ratio, about 0.15 on the drive's 4.23,
most of Gugan 5's ± 0.2. The user (above) holds that the follow-through "definitely" affects play, through the extra
micro-hits or by topping the ball.

So the design assumes no route. A follow-through can reach the balls by three, each measured apart on every sweep and
in every default's record:

1. **Before contact:** a pulse begun early changes the head's speed and pitch as it arrives, so the contact speed and
   the face's contact point `up` (the user's "topped") move. Recorded: the contact speed, the contact point and the
   lean at first touch.
2. **Within the strike:** the double tap (the drive and AC stop canonical runs tap twice before the parting, at
   0.005–0.670 and 1.010–1.845 ms on the drive). Recorded: each tap's impulse on the striker's ball (§7's new interval
   impulse) and its share of w₁.
3. **After the parting:** a re-contact, which may be a fault (§7). Recorded: its impulse, its effect and its class.

**"The follow-through adjusts the stroke"** means, in the model: with the stance, the backswing and the intensity held
fixed, the ratio moves monotonically with the magnitude, and the record says which route carried the change. The rate
is reported, not required: if the drive's ratio barely moves, that goes to the gate as a finding about the model,
beside the user's experience that it does.

**The follow-through grid**, one probe for criterion 4 and the sharpness check: on every croquet preset at 3 m/s,
magnitude −1, −0.5, 0, +0.5 and +1 by window ×0.5, ×1 and ×2. Stage 1 plays it at `ON_TIME` on the old defaults;
stage 2 plays it again at each preset's new defaults (`DEFAULT_TIMING`, §6). The AC stop's onset axis is §4.3's.

### 3.5 Where the ball is met on the arc: the stance sweep

Decision 11. The stance's input, the top hand's distance ahead of the ball's centre at contact (`handsAhead`), sets the
shaft's lean at contact, and in swing mode the pendulum swings about the top hand, so θ_c = −lean is where on the arc
the ball is met: the AC stop 4° past the arc's lowest point, on the up; the single-ball stroke, the drive and the GC
stop at it; the rolls 24°, 31° and 34° before it (Gugan's measured face angles; in carry mode the hands' own arc has its
lowest point halfway through the push). No step has varied it on the calibration strokes: P2b.2b.2c.2's fit moved the
grips and the hand coupling only, and `gugansMallet` (`scripts/ratioFit.ts:669`) throws if the lean moves. The feet
are still not modelled (§12); the hands' offset stands in for them. In the presets the lean moves with the grips (the
AC stop's hands relaxed at 0.1, the drive's firm), so the drive-to-stop rise in ratio (4.29 to 6.50, Gugan 5's strokes
at 0.75 mm, the last step's gate D) cannot be read as the lean's alone.

**The turf's limit** (a static pose on the default mallet, 2026-10-24): each degree of backward lean lowers the head's
heel about 5.6 mm, the head turning about the face's contact. At the AC stop's contact (`up` −0.02 m) the head's lowest
point at contact clears the turf by 14.55 mm at −4°, 3.35 mm at −6° and is 7.79 mm in it at −8°, so the lean stops at
about −6.5°; holding the head as high as its face allows reaches about −8°. The arc's lowest point is not the bound: the
shaft is upright there and the head level, 30 mm or more clear.

**The sweep**, at stage 1 (§10), before any default moves: the AC stop and the drive played as Gugan 5's strokes
(Gugan's mallet, the default gap, 3 m/s contact speed, the drive at `guideEffort` 0, the stop at jab 0), on time and
at each preset's own `drive`, over leans −8° to +4° in 1° steps, each lean set through `handsAhead` at the preset's top
hand and contact. A lean whose head lies in the turf at contact is printed as turf-limited, not played. The AC stop is
also played at `up` −0.025 m (the head held high) for the leans past −6°. Each stroke is played at its own grips and at
the other's (`bottom`, `gripTension`, `bottomGrip`), to part the lean's effect from the grips'. Recorded per run: the
ratio against its band, (v₂/w₁)², the contact and planned speeds, the contact point and lean at first touch, the head's
least clearance from the turf over the strike, the taps, the re-contacts after the parting (§7) and any turf contact.
The canonical drive (its own `guideEffort`) is also played across the leans, recording whether and when its late catch
comes (beside §6's diagnosis).

**The ruling.** Stage 1 rules whether the stance becomes a calibrated default for the AC stop, the drive, both or
neither. If it does, stage 2's candidates (§6) are found at the ruled stance, the AC stop's brake calibrated there. A
moved stance is a default like the others: counted in ratchet step 6, its argument and the ruling in `profile.ts`'s
comment. The two strokes are Gugan 5's calibration targets, so choosing their stance against his ratios is calibration,
stated as such. The rolls keep Gugan's measured leans and stay held-out. The user's order (the stop furthest back, the
drive next, forward through the rolls) is a hypothesis: the record says whether the drive's best lean falls between the
stop's and the rolls', never tuned to.

## 4. The planned brake (the stop)

### 4.1 Before contact

A brake (drive < 0) begun before contact is already expressible (`timing.arc` < 0 moves `arcStart` before
`contactAt`; `buildContact.ts:678-723`), but untested. The step makes it a supported, tested play:

- **Its strength is defined against the planned speed**, as today: drive·speedGain·planned speed is the speed the
  brake removes, on top of gravity (§3.1). The head therefore meets the ball slower and later than planned when the
  brake starts early; that is the user's under-hit, and it must emerge, not be modelled.
- **The grips relax at the planned contact**, not the meeting (my call above).
- **A brake that leaves no face contact**: the head braked to rest swings on as the free pendulum and may still creep
  into the ball late and slowly; that is a contact, played as physics. A stroke with no face contact with the
  striker's ball before the impact ends (its cap included) is reported as such, through the existing no-contact
  outcome if one exists or a new one (the builder checks which), never a throw or a non-finite state.
- `checkShare` (the "brake to rest, not past it" rule, `track.ts:1609`) is re-read for a brake that began before
  contact; if its after-contact limit no longer holds the brake to rest, the plan says how it is extended.

### 4.2 The dip coupled to the brake

The dip starts with the pendulum's pulse: its start is `lead + timing.arc + timing.dip`, so `timing.dip` is the dip's
offset from the pulse (0, coupled, as the user plays it). This holds on every stroke, whatever the sign of `drive`, so
nothing jumps as the magnitude crosses 0 (my call; only a stroke with a dip, `handDrop + jab` > 0, can move). Only the
start is coupled: the dip keeps its own `dropTime` and its rest-to-rest profile, unchanged and not scaled by
`stroke.window`. `stroke.jab` deepens the coupled dip as today.

**The lead** becomes max(0, −arc, −hands, −(arc + dip), the turf margin), and `MAX_LEAD` is checked against it, so the
dip never starts before t = 0. **Existing callers** that set both `timing.arc` ≠ 0 and `timing.dip` ≠ 0
(`buildContact.test.ts:350` and `:465`, `scripts/swingProbe.ts:1022-1024`, and any the builder's search finds) are
rewritten to keep their dip's absolute time (dip′ = dip − arc), so they stay bit-identical; `timing.dip`'s
documentation in `swing/types.ts` states the new reference.

**The planner includes the planned dip on croquet strokes** (my call): a dip begun before contact is part of the
player's croquet stroke, so on the croquet presets the contact pose (`contactPose`), the turf scan that sets the lead
(`scanDownswing`) and the "head in turf at contact" check include the dip's travel by the planned contact. The shot's
`contact.up` is honoured, and route 1's contact-point change comes only from the brake's effect on the head's speed
and pitch; the AC stop's calibration is not confounded by a contact point drifting with the onset. On single-ball
strokes the planner ignores the dip before contact, as today, so the deliberate graze (`turfStrike.test.ts`, "grazes:
the head grounds before the ball", a dip of −5 ms with a jab) keeps its meaning and stays bit-identical.

### 4.3 The brake sweep

On the AC stop at 3 m/s contact speed, at the default gap and jabs 0 and 2.5 mm: the onset `timing.arc` from −20 ms
to +5 ms in 2.5 ms steps, the magnitude −0.25, −0.5, −0.75 and −1, at the preset's window and at half and double it.
Recorded: the planned and contact speeds, the ratio, the head's speed at the parting, when and whether the head grounds
(before or after the second tap), the taps, and any stroke with no face contact. Criterion 5's monotonicity is judged
on the same sweep at a fixed backswing (the planned speed fixed); the rest goes to the gate.

## 5. (Deferred) the natural push's growth with power

Deferred to P2b.2b.2c.3 by decision 9. The roadmap's P2 row records the move.

## 6. Better defaults

Stage 2 of the gate (§10) rules each, on the mechanisms stage 1 accepted, at the stance stage 1 ruled (§3.5):

- **Where the defaults live** (my call): the onset is a new per-type planner default, `DEFAULT_TIMING` in `profile.ts`
  beside `DEFAULT_DRIVE` (every type `ON_TIME` but those this section moves), exported as `DEFAULT_DRIVE` is and read
  by `canonicalSetup`; the brake's strength is carried by `DEFAULT_DRIVE`, never the preset's `speedGain`.
  `croquetFitProbe`'s `digestGrid` spreads the canonical stroke, its timing included, so a moved `DEFAULT_TIMING` moves
  that preset's grid runs too; a moved preset field (`guideEffort`, the full roll's push) moves every grid run of its
  preset. Each is counted in ratchet step 6.
- **AC stop**: a planned brake begun before contact with the dip coupled, from the sweep (§4.3): the onset and
  strength whose Gugan 5 stop (Gugan's mallet, the default gap, jab 0) lies within 7.15 ± 0.6 at **3 m/s contact
  speed** (my call: Gugan 5's speed is the mallet's at impact, and a player who plans the brake swings for the speed
  they want), the latest onset that does preferred (the user: "as soon as contact is complete"). A calibration target,
  so chosen against it. The probe solves the backswing for the contact speed under the brake (extending `guganSetup`
  and `backswingFor`, or beside them; the builder's choice), and reports the planned speed beside it.
- **Drive: diagnose first.** The roadmap asks that the late catch "come out of the physics". Today it rests on the
  bottom hand's `guideEffort` 1 re-accelerating the head about 95 ms after contact, a guide with no decay (the
  double-hit probe §3a, §4). Stage 1 asks whether that re-acceleration is physical: a trace of the guide's force and
  the head's speed from contact to the catch, beside the user's account that the drive's follow-through varies with
  intent. The candidates shown at stage 2: a lower default `guideEffort` (the largest on a 0.25 grid whose canonical
  drive has no re-contact after the parting, judged as §7 judges it), or a decay of the guide after contact, argued
  from the account or a source, never fitted. Gugan 5's drive check keeps `guideEffort` 0 (his strokes, like for like,
  "no push"), so the drive's calibration is unaffected by this default; the default is judged on the canonical drive.
- **Half roll**: unchanged but for the smooth pulse (an angled drive, user decision 2).
- **Full roll: the user's hypothesis tested.** The hypothesis (roadmap, "Carried open items": the full roll "may want
  the pass roll's stronger push") came from an observed ratio, the pass roll played straight giving 1.07, so adopting it
  would be a selection by ratio on a held-out stroke. The variant (the full roll with the pass roll's `speedGain`,
  `handGain` and window, its own stance and reach) is run and recorded against coaching's about 1 and beside the half
  and pass rolls. The default stays unchanged unless the gate rules otherwise; such a ruling states the variant's
  provenance and that the full roll then stops being held-out.
- **Pass roll**: unchanged but for the smooth pulse.
- **GC stop and single-ball**: unchanged but for the smooth pulse and gravity through it (decision 12: at drive 0 the
  pulse's shape changes nothing, gravity moves them).

Each default's argument and source sits in `profile.ts`'s comments, as the presets' do now.

## 7. Re-contacts after the parting

Today any face contact beginning at or after the parting raises possible fault 29.1.6.1 (`faults.ts:434-439`). The
Laws (`reference/laws.json`): Law 29.2.5, a fault "only if the striker or a referee ... sees a separation between
mallet and ball followed by a second contact"; C29.11.2, "a laxer standard is applied to croquet strokes ... The
principal target of this fault in croquet strokes is 'shepherding' ... after the balls have parted contact, or very
extreme pass rolls"; C28.3.2, balls parting by "a few millimetres at most ... not meeting the standard required for a
multiple contact fault". Law 29.2.7 lets a related fault be "deduced from observation of the trajectories and speeds of
the balls involved compared to what would occur in a lawful stroke". The user (decision 10): in practice the allowance
is "much more generous", the fault is "the sort of second hit that changes the momentum or direction of the ball", and
"a long succession of micro hits with small separation would be viewed as all part of the same contact".

**The interval's impulse.** `ContactInterval` (`impact/types.ts:372-377`) gains `impulse`, the face's impulse on the
ball over the interval (a vector, N·s), accumulated in the timeline (`impact/timeline.ts`). The judge reads it; the
striker's ball's velocity at the interval's start comes from the same accumulation or the probe's step record (the
builder's choice, stated in the plan).

**Merging.** After the parting, consecutive face intervals separated by a gap whose `clearanceAfter` is below
`MERGE_SEPARATION` are one continuing contact, as the parting already merges breaks under `PARTING_BREAK`. Its impulse
is the sum.

**Judging.** Each distinct re-contact after the parting (a merged contact that begins after a separation of at least
`MERGE_SEPARATION`) is reported on `FaultReport.strike` with its separation, its gap's duration, its time after the
parting, its impulse and its **effect**: the change it makes to the striker's ball's speed (as a fraction) and to its
direction (degrees, horizontal). It is possible fault 29.1.6.1 only if its effect passes `EFFECT_SPEED` or
`EFFECT_ANGLE`.

**The thresholds** `MERGE_SEPARATION`, `EFFECT_SPEED` and `EFFECT_ANGLE` are ruled at the gate's stage 1 (§10) from
the spread of separations and effects over the 950-run grid and the follow-through grid, generous as the user reads
the Laws; until then the code carries them as labelled placeholders and the analytic cases use constructed intervals
on both sides of each. They sit in `reference/laws.json` beside 29.2.5's quote, with the readings above.

**Unchanged, deliberately:** the branch with no parting (`faults.ts:429-433`), and single-ball 29.1.6.2
(`faults.ts:385-393`), which C29.11.5 leaves without Law 29.2's limitation. 29.1.6.3 (prolonged contact) stays unjudged
(P2b.2b.2c.3); a long merged contact is reported with its duration for it. The ratchet counts, per preset, the flagged
runs before and after on the 950-run grid (today 922).

## 8. The checks

Each run on the moved defaults (stage 2) unless stated, recorded and taken to the gate:

1. **Gugan 5's drive and stop** at the default gap, 3 m/s contact speed, Gugan's mallet; the stop over jabs 0–6.5 mm.
2. **The user's roll hypotheses** (roadmap, "Carried open items"): the full roll's ratio against the half and pass
   rolls' over `swingProbe`'s 2–4 m/s, with and without §6's variant; the pass roll played dead straight; the pass
   roll's split at 10° and 20° off aim, the striker's ball's share of it. Recorded, never fitted.
3. **Gugan's jab qualifier** (`turfStrike.test.ts`, `it.runIf(SLOW).fails`): whether the coupled dip grounds the head
   before the second tap; the test's `fails` removed only if it then passes.
4. **Super pass-rolls** (Gugan 5: a strong early second tap from "a lot of arm follow through"): the pass roll at
   magnitude +1 and the sharpest admissible window: whether an early, strong second tap emerges, and how §7 judges it.
5. **The push's cap**: on each roll, whether the push intent saturates at `pushForce`, and for how long.
6. **The strike's window**, `STRIKE_WINDOW` 15 ms: re-checked against the moved late contacts.
7. **Step convergence** (dt/2, dt, 2·dt) on the moved AC stop and drive, as gate section G was.

## 9. The ratchet

Against a baseline worktree at `main` (installed with `npm ci`, never a symlinked `node_modules`), the preset digest
(`phys`, `faults`), `impactDigest`, `impactProbe` and `shotMix`, after each commit:

1. The tidy: all bit-identical.
2. The smooth pulse, then gravity, as two commits (decision 12): the pulse's shape alone leaves every run at drive 0
   bit-identical (its end states are the box's); gravity then moves every swing-mode run, drive 0 included, counted
   per preset, and leaves every carry-mode run bit-identical.
3. `stroke.window` absent: bit-identical to step 2.
4. The coupled dip, the lead and the planner's dip: bit-identical on every run whose dip starts at or after contact
   with `timing.arc` 0, and on the rewritten callers; croquet runs with a dip under way at contact counted.
5. The re-contact judging: `phys` bit-identical; `faults` moved, counted per preset.
6. Each default (§6), alone, a ruled stance (§3.5) among them: its moved canonical and grid runs counted.

Any change outside its step's expected set stops the step and goes to the gate with a trace.

## 10. The pre-flight gate

**Stage 1, the mechanisms**, before any default moves: the smooth pulse's ratchet; the follow-through grid at
`ON_TIME` on the old defaults (§3.4); the stance sweep and whether the stance becomes a default (§3.5); the brake sweep
(§4.3); the drive's diagnosis (§6); and the re-contacts' spread and the three thresholds (§7). The user rules on each,
one question at a time with a recommendation.

**Stage 2, the defaults and checks**: §6's candidates, the follow-through grid at the new defaults, and §8's checks,
ruled likewise. The rulings, verbatim, go in the design's Amendments.

## 11. Records

As the last steps: the probe output under `docs/superpowers/probes/2026-10-2x-p2b2b2c2d-*.txt`; the roadmap's P2 row
(the natural push moved to P2b.2b.2c.3) and a "P2b.2b.2c.2d outcomes" section with its carried open items; the
provisional numbers table gains the smooth pulse's form, the three re-contact thresholds and each moved default;
`STRIKE_WINDOW`'s row re-checked.

## 12. Non-goals and anti-goals

Non-goals: an articulated body, the feet among it (§3.5 sweeps the hands' offset in their place); the natural push's
growth with power and a recruitment law for the push (P2b.2b.2c.3); 29.1.6.3; the head swept against hoops and the
peg (P2b.2b.3); the touching stops at gap 0 (carried); the lawn's pace.

Anti-goals (a failure even if it works):

- A roll's default tuned to its coaching ratio, or any user hypothesis used as a fit target.
- A follow-through style named in the engine or scripted per stroke type; every follow-through is played from the
  inputs.
- Anything in the engine that reacts to the impact on the player's behalf.
- A fault suppressed by tuning a default rather than diagnosed.
- An unsourced constant without a placeholder label.

## 13. What's left to the builder

The plan's task order within §9's sequence; the pulse's θ and ω integration through an early pulse; the bound on
`stroke.window`; how a stroke with no face contact is reported if no outcome exists for it; how `checkShare` extends
to an early brake; how the probe solves for the contact speed; where the striker's ball's velocity at a re-contact is
read; the probes' layout and their section letters; the tests' names and files.

## Amendments

- **2026-10-24, gate stage 1** (rulings verbatim as the option chosen; figures in
  `docs/superpowers/probes/2026-10-24-p2b2b2c2d-stage1.txt` and
  `docs/superpowers/probes/2026-10-24-p2b2b2c2d-gate1.txt`):
    - **Q1, the smooth pulse and gravity: "Accept all (Recommended)".** Plan decisions 1–3 accepted as landed, with
      the moves the ratchet surfaced: the GC stop's follow-through grip-limit flag gone (hand peak 434.3 N to 30.3 N);
      the check's never-past-rest residual (−9.67e-10 rad/s); the planner's croquet dip (§4.2), so the AC stop's dip
      30 ms early no longer grounds the head (along the lawn early 1.34586 against 1.34934 m/s on time); an opt-in
      hands advance now reversing the head within the window (planned ω −0.0817 against 3.5968 rad/s); a check's hold
      stepping ω to 0 at its start; and 3 m/s at the ball unreachable under an early brake without intensity.
    - **Q2, the routes: "Record as a finding (Recommended)".** On time on the old defaults the magnitude reaches the
      drive's and the AC stop's ratio almost only through re-contacts after the parting (route 3); the contact speed,
      point and lean (route 1) do not move, and the taps' impulses (route 2) within 0.03 N·s. The rolls barely move;
      5 of 15 preset-window rows are monotonic. Carried as an open item; no change in this step.
    - **Q2b, the stance: "Stop to −6°, drive as is (Recommended)".** The AC stop's stance becomes a calibrated default
      at a lean of −6° (Gugan 5's stop 7.157 on its own grips, against 7.15 ± 0.6); the drive keeps 0° (4.295, already
      nearest 4.23). Stage 2's candidates are found at the stop's −6°. The user's order holds at the nearest-target
      leans (stop −6°, drive 0°, rolls +24° to +34°). This is calibration against Gugan 5, stated as such.
    - **Q3, the planned brake: "Accept, trace the 3.6e-7 (Recommended)".** The under-hit emerges and the no-strike
      reporting stands. Of exit criterion 5's 26 violations, the 2 real ones (0.23 % and 0.40 %, weakest and sharpest
      brake, −7.5 against −5 ms) are recorded as physics; the uniform 3.584e-7 m/s step between onsets 0 and +2.5 ms
      is traced before stage 2.
    - **The early dip on croquet strokes: "Keep it planned (Recommended)".** §4.2's call stands: a dip begun before
      contact on a croquet stroke is planned into the swing; a mistimed early dip shows in the speed, not by grounding;
      the single-ball graze is unchanged. The user's 2026-10-17 ordering (early slower along the lawn) holds, with no
      turf strike.
    - **Q4, the drive's late catch: "Not physical; grid only (Recommended)".** The bottom hand's guide pushing 31 N at
      92 ms, re-accelerating the head into the rolling ball at 96.4 ms (+49 %), is not how a drive is played. Stage 2
      shows the `guideEffort` 0.25 grid only (the largest whose canonical drive has no re-contact after the parting);
      a decay of the guide after contact is an open item, pending a source or a fuller account.
    - **Q5a, `MERGE_SEPARATION`: "2 mm"** (1 mm was recommended).
    - **Q5a′, contacts straddling the parting: "Join the strike (Recommended)".** A face contact whose separation from
      the previous one is below `MERGE_SEPARATION` joins that contact's group; a group that began before the parting
      is the strike, its contacts reported among the taps and never judged as a re-contact. This supersedes the
      grouping built in the step's re-contact commit (a fresh group at the parting). The rolls' micro-hits after the
      parting (0.01–0.5 mm apart) therefore join the strike, as decision 10's "part of the same contact" reads.
    - **Q5b, `EFFECT_SPEED`: "10 % (Recommended)".**
    - **Q5c, `EFFECT_ANGLE`: "2° (Recommended)".**
    - **2026-10-25, the joining re-checked: "Keep 2 mm, relabel (Recommended)".** Q5a′ stands as built. The research
      (`reference/sources/README.md`, "The re-contact rule re-checked") found no Law, ruling or referee guidance that
      joins contacts by distance or judges a croquet stroke's re-contact by its effect, so `reference/laws.json` now
      marks the effect test as the user's reading, not the Law; the B.2 catch-up at onset −20 ms (0.16 mm and
      0.085 ms after the parting, +151 % speed) is Gugan 5's lawful double tap. Open item: the joining has no time
      cap, so a long chain under 2 mm after the parting (C29.11.2's shepherding) would join the strike unjudged.
- **2026-10-25, gate stage 2a: the defaults** (rulings verbatim as the option chosen; figures in
  `docs/superpowers/probes/2026-10-25-p2b2b2c2d-candidates.txt`, sections E, F and G):
    - **Q1, the AC stop's brake: "Stance only".** The user: "the players has to mentally initiate before the strike
      but this is more cognitive than active". The AC stop's default is the −6° stance with the brake on time (onset
      0, the preset's own strength): Gugan 5's stop 7.157. No early brake. Section E's before-contact candidate
      (−2.5 ms, every strength passing, 7.197 to 7.547) is recorded, not adopted; its candidate after contact
      (+2.5 and +5 ms, 6.599 and 6.589) is the same at every strength, because the brake begins after the strike.
    - **Q2, the drive: "0.75 (Recommended)".** The drive's default `guideEffort` goes from 1 to 0.75, the largest on
      the 0.25 grid whose canonical drive has no re-contact after the parting (§6; the ratio 2.435 to 3.753). Gugan
      5's drive keeps `guideEffort` 0 (4.295), so the drive's calibration is unchanged.
    - **Q3, the full roll: "Keep, revisit at 2c.3 (Recommended)".** The full roll stays unchanged and held-out. The
      variant (the pass roll's `speedGain`, `handGain`, `window` and `handWindow`, its own stance and reach) gives
      1.177, 1.134 and 1.216 at 2, 3 and 4 m/s, against the default's 2.051, 1.856 and 1.859 and coaching's about
      1. This is recorded as support for the user's hypothesis, to be tested again once P2b.2b.2c.3's push grows
      with the swing's power.
    - **Q4, the other presets: "Confirm, carry to 2c.3 (Recommended)".** The half roll, the pass roll, the GC stop and
      single-ball stay unchanged but for the smooth pulse (and gravity through it for the swing strokes). The pass
      roll at 2 m/s re-contacts the ball 132 ms after the parting (+57.6 %, possible 29.1.6.1), recorded as a finding.
      The user's account, carried to P2b.2b.2c.3 as a hypothesis: "on a soft shot, no follow through force is
      applied. So I think that avoids the second contact. Whereas on a harder shot, you swing through naturally. On
      a very hard shot, you might apply a lot of extra follow through."
- **2026-10-25, the AC stop's stance re-ruled** (figures in
  `docs/superpowers/probes/2026-10-25-p2b2b2c2d-stance-turf.txt`):
    - **The rule.** The user: "it is okay for the mallet to rub on the lawn and disturb the grass. It should not
      damage the turf". The default stroke therefore raises no `impact-head-deep` and the soil does not yield
      (`turf-yield`). This supersedes Q1's −6° stance, which went 3.6 mm deep and yielded the soil.
    - **The ruling: "−5°, head 5 mm up".** The user chose lean −5° with the contact 5 mm lower (`up` −0.025 m, was
      −0.020 m with −6°). −5° at −25 mm raises no head-deep and no yield on Gugan's mallet and on the default mallet
      (Gugan 5's stop 6.7395, 1 mm step spread 0.0110), but its contact lies 0.6 mm from the edge of the face's flat
      (±25.575 mm), so the digest grid's row 3 mm lower falls off the face. −4° at −25 mm never touches the turf but
      its ratio, 6.5359, falls just below the band; −6° at −25 mm and −7° at −25 mm still go deep. The −30 mm heights
      are rejected: the contact falls off the face's flat.
    - **The face-edge correction: "22.5 mm below centre (Recommended)".** The AC stop's stance is lean −5° at `up`
      −0.0225 m, 3 mm clear of the flat's edge, so every grid row is played. Measured (round 3, candidate R7): Gugan 5's
      stop 6.6610 on Gugan's mallet solved at the stance and 6.5753 by section S's method (band 6.55–7.75); no
      head-deep and no yield on either mallet, the depth margin 1.309 mm and 1.101 mm; the head touches the turf
      from about 16.5–17.4 ms, after the 15 ms strike window, at 29–48 N; the 1 mm step spread 0.0083 passes. It sits
      closer to the band's floor than −5° at −25 mm (6.5753 against 6.6462 by section S's method). The row 3 mm above
      the contact (−19.5 mm) yields the soil and goes 2.3 mm deep.
    - **The user's account, carried as a hypothesis to a later phase:** "during contact the player would let the
      plane of the mallet flatten out parallel to the lawn. I'm assuming this would mitigate damage and increase
      friction". The engine has no flattening, and the model may not react on the player's behalf, so nothing here
      adopts it.
    - **Gugan's calibration mallet is solved at the preset's own stance.** Section S's 7.157 at −6° used the mallet
      solved at the previous −4° stance (head 0.9065 kg); solved at −6° (head 0.8914 kg) the same stance gives 7.339.
      The stop's calibration against Gugan 5 therefore moves with the stance, and the slow test holds 6.66 at −5° and
      −22.5 mm.
- **Gate 2b (2026-10-25): the checks** (rulings verbatim as the option chosen; figures in
  `docs/superpowers/probes/2026-10-25-p2b2b2c2d-checks.txt`, sections A and H–O, with swingProbe's late re-hit):
    - **A, the follow-through grid at the new defaults: "Accept, record (Recommended)".** No default changes. Of 75
      runs, 6 of 15 preset-window rows are monotonic in the magnitude (5 at stage 1); the rolls' flat, non-monotonic
      response and the taps' shares' sum missing 1 + v₂/w₁ by more than 1 % on the rolls are recorded.
    - **H, Gugan 5's drive and stop: "Accept (Recommended)".** Both calibration targets lie in their bands: the drive
      4.2947, the stop 6.6610 at jab 0, rising to 7.2213 at 6.5 mm. The stop's distance from 7.15 is the cost of the
      no-damage stance; a jab's dig into the turf is a recorded consequence.
    - **I, the user's roll hypotheses: "Record, carry to 2c.3 (Recommended)".** At 2, 2.5, 3, 3.5 and 4 m/s the full
      roll gives 2.05, 2.08, 1.86, 1.82 and 1.86, and section G's variant 1.18, 1.11, 1.13, 1.18 and 1.22, support
      for the user's hypothesis; the pass roll 0.61 to 0.96, and 1.03 played dead straight. At 10° and 20° off aim
      the split at rest is 14.4° and 28.6°, the striker's ball's share of it 0.34. Nothing changes.
    - **J, Gugan's jab qualifier: "Keep .fails, record (Recommended)".** On the coupled dip none of the 17 jab depths
      qualifies: the second tap comes at about 1.05 ms and the head grounds after it, at 16.5 ms with no jab and
      10.8 ms at 8 mm, going `impact-head-deep` from 2 mm. The test keeps `.fails` and the qualifier stays open.
    - **K, super pass-rolls: "Record, carry to 2c.3 (Recommended)".** A partial emergence: at magnitude +1 and
      MIN_WINDOW the second tap comes 2.33 ms after the first (2.59 ms canonical) with 0.29 of its impulse (0.21),
      the ratio 1.08 (0.88), and no re-contact after the parting. Carried to P2b.2b.2c.3's recruitment law.
    - **L, the push's cap: "Record, carry to 2c.3 (Recommended)".** No roll's push intent reaches `pushForce`
      92.2 N: the peaks are 16.7, 15.8 and 25.8 N (half, full and pass), acting for 66 to 83 ms. The headroom is
      carried to the recruitment law.
    - **M, the strike's window: "Keep 15 ms, record (Recommended)".** Asked twice: the first wording wrongly said
      that contacts after the window are judged as re-contacts; `STRIKE_WINDOW` (`scripts/ratioFit.ts`) only sets
      when the ratio is read. Re-asked with the correction, the user gave the same answer. On section A's grid 9
      runs have a contact straddling the window's end and 42 one beginning beyond it (the earliest at 15.025 ms, a
      pass roll); section B's sweeps have none straddling.
    - **N, step convergence: "Record as converged (Recommended)".** The canonical AC stop gives 5.7349, 5.7352 and
      5.6551 at dt/2, dt and 2·dt, a miss at 0.1334 of the tolerance, but dt/2 and dt agree to 0.0003. The 2·dt
      run's later turf touch (17.04 against 16.48 ms) coincides with the departure; that is a correlation, not
      traced as the cause. No step digs or yields the soil. The drive at 1 mm, 0.1012, is the known `.fails`; 8 of
      the 10 rows pass.
    - **O, every preset top to finish: "Carry to 2c.3 (Recommended)".** All 7 canonical setups lie within ±2 % of
      3 m/s at the planned speed (no default has an early pulse), with no findings. The late re-hit: no canonical
      run crosses a ball, the sweeps' crossings graze by at most 0.105 mm, and none overlaps a ball at the impact's
      end. The full and pass rolls' canonical follow-throughs raise `follow-turf-yield` and `follow-head-deep`; the
      no-damage rule is applied to the rolls' follow-through in P2b.2b.2c.3.
