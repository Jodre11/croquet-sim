# P2b.2b.2c.1 — The Single-Ball Stroke: Effort, Backswing and Follow-Through: Design

**Product spec:** `2026-09-30-croquet-shot-lab-design.md` §4 (impact phase).
**Swing spec:** `2026-10-04-p2b2b1-swing-shot-design.md` (swing and carry mode, the hands' path, the reach).
**Stroke-shape spec:** `2026-10-06-p2b2b2a-stroke-shape-design.md` (the downswing, the effort pulse, the finish).
**Stance spec:** `2026-10-08-p2b2b2b1-hands-stance-design.md` (the top hand's position at contact, the lean).
**Roll spec:** `2026-10-11-p2b2b2b2b-roll-stroke-design.md` (the hands' arc, the held slope, the pendulum phase).
**Turf-strike spec:** `2026-10-14-p2b2b2b3-turf-strike-design.md` (the hands' limit, the jab).
**Roadmap:** P2 row; "User play data and checks (2026-10-08)"; "P2b.2b.2b decisions and findings (2026-10-08)";
"P2b.2b.2b.3 outcomes (2026-10-17)"; "Carried open items".

**Why this step.** P2b.2b.2c is split three ways (user, 2026-10-18; §Decisions). This is the first step: the
single-ball stroke, the simplest and most consistent shot in real play, and the first the user would play in the lab
to judge the calibration ("check that effort level correlates with distance"). Today:

- **The effort tops out and turns over.** From a 0.45 m backswing the contact speed is 3.01, 4.99, 5.98, 6.03 and
  6.00 m/s at intensity 0, 0.4, 0.8, 0.9 and 1.0. The pulse τ_p = i·τ_max·½(1 − cos 2πτ/T(i)) shortens as it
  strengthens (T(i) = tempoSlow + i·(tempoFast − tempoSlow), tempoFast = tempoSlow/2), so its impulse grows as
  i(1 − i/2), flat at i = 1; from i ≈ 0.85 it also ends before contact (`src/engine/swing/downswing.ts:131-141`). The
  user's controlled strokes reach what the model gives at its physical maximum.
- **Every default swing is gravity-only.** Every preset's `defaultIntensity` is 0, and each `defaultBackswing` is
  bisected for 3 m/s at intensity 0 (`scripts/fitStrokeShape.ts:197-217`): h₀ = 0.4486 m. The user (2026-10-08):
  nearly every real swing has some help from the hands; a gravity-only swing is typical only of a soft,
  low-amplitude tap.
- **The backswing's limit is a fixed angle**, the shaft horizontal (`MAX_BACK_ANGLE`, `downswing.ts:33`), not the
  player's body.
- **Only one follow-through can be played.** After contact a single-ball stroke's top hand eases to rest along aim
  (`handReach`, `track.ts:624-652`) and the head swings freely up its arc. A follow-through kept level with the lawn
  cannot be expressed: the dip only lowers, and the reach only travels along aim and decelerates.
- **A non-finite head state runs on.** A very stiff grip (ζ ≥ 2, or a 0.01 s period) leaves NaN within 0.5 ms on a
  fat stroke (roadmap "Carried open items"); nothing checks for it, so the impact runs to its cap and hands the NaN
  state on (`integrate.ts:1160`, `:1209-1225`, `:1233`; `continueStroke` `:1324`). It precedes any fitting of the
  hands (step 2).

**Circularity.** The user's play data are checks, never fit targets (roadmap, 2026-10-08). The effort's ceiling is set
from a published contact speed (§4.3), never from the user's yardages, which are then checked against (§8.5). The one
exception is the backswing's limit: no source gives it, so its default comes from the user's account of the stance
(§5.2), and the knee-height check is recorded, not claimed as validation. Coaching ratios are untouched here:
the drive and stop are step 2's calibration targets.

**Vocabulary.** "Split", "ratio" and "cut" keep their croquet meanings only. The pendulum/hands share is **phasing**,
the turf's drag **ploughing**. The **rising** follow-through lets the head swing freely up its arc after contact; the
**level** follow-through keeps the head travelling parallel to the lawn through and after contact. The **advance** is
the hands' forward travel after contact. A **flick** is a contact with the head already rising.

## Decisions (user, 2026-10-18)

- **Housekeeping shipped first**, as #29: eslint 10.13.0, svelte-check 4.7.7, typescript-eslint 8.71.2, vitest 5.0.5.
  TypeScript 7.0.2 stays blocked (typescript-eslint 8.71.2 needs `>=4.8.4 <6.1.0`). The actions (v7) and
  `ubuntu-26.04` are current.
- **P2b.2b.2c is split into three steps**, each its own spec, plan and PR, in this order:
  1. **P2b.2b.2c.1** (this design): the single-ball stroke.
  2. **P2b.2b.2c.2**: the croquet strokes' fit (contact times; the hands' T and ζ, the arm mass, the reach slack and
     the grips, to the drive's and the stop's ratios), the arms' checking force bounding the hands' slid anchor,
     Gugan's jab check re-run, and the carried grip-limit control run (`tests/engine/turfStrike.test.ts`).
  3. **P2b.2b.2c.3**: held-out validation (the rolls, stop → pass-roll, pull, stop-shot lift, Sutherland's stop-shot
     steps), the GC stop's distances, crush calibration and 29.1.6.3.
- **The default club player drives the full lawn.** Only weaker, high-handicap players cannot; a full-lawn full roll
  is more challenging. This overturns the roadmap's check "a full-power drive falls just short of the full length"
  for the default player (amended in the roadmap).
- **Effort has diminishing returns**, but no flat top and no turn-over: more effort always gives more speed.
- **The follow-through is a power source (the user's hypothesis).** Swinging through more freely with an exaggerated
  arc roughly doubles the distance for a small rise in felt effort (the play data's 15 yd and 30 yd strokes).
  Sutherland's model (1995) holds that "follow through!" acts only before contact in a single-ball stroke; the design
  takes no side: whatever power a freer stroke gains, it gains through the head's speed and the hands' coupling at
  contact, produced by the model's own physics (§6).
- **Two follow-through styles are both played**, at different times: the rising style (the user: straighter, more prone
  to over-run) and the level style, achieved "by the player advancing their hands at the right moment. This is where
  we see similarities with the roll." The lab must play both faithfully enough to test the experts' disagreement
  (Riches 1995 calls a rising follow-through for top-spin a folk-law; Plummer credits a rising hoop finish with
  top-spin; the CA manual uses a contact slightly on the upswing to skid the rush). No measurement exists either way.
- **The flick is a discovery goal.** An over-arced, hard stroke can lift the striker's ball and make it bobble; the
  user suspects a contact off the bottom of the arc, and wants the sim to find out. Its deflection after a bad pitch
  needs an uneven lawn, deferred.
- **Anti-goal (user, confirmed):** any of these behaviours scripted rather than produced by the physics. The ultimate
  aim is a unified shot model producing every shot type purely from the right inputs: a direction, not this step's
  goal, "somewhat derived from how we model the shapes of the different shot types". This step adds no per-shot-type
  special case and lists where the modes split the model (§9).
- **The backswing's limit is the player's body.** In the normal between-the-legs stroke the groin limits it; the
  shaft's length matters. A side style, the mallet held to the side, is not limited by the body and allows a backswing
  beyond waist height, at the cost of the stance's stability and off-centre aiming. In a typical club player's stance
  the head tops out "somewhere between knee and waist", varying with the grip and the shaft's length; some players
  lean forward in the swing to allow a longer backswing when power is needed.
- **Anti-goal (user):** the head overtaking the striker's ball and dropping down to block its path, as earlier
  animations of the rolls showed. "This is not what I see in real life."

## 1. Goal and exit criteria

A single-ball stroke's speed rises with effort to a ceiling above a strong player's hard stroke, with diminishing
returns and no turn-over; the default swings are hands-assisted; the backswing ends where the shaft meets the groin;
and a player can play the rising or the level follow-through by when and how the hands advance, with the flick's lift
left to emerge.

Exit criteria:

1. The finite-state guard (§3) holds, its analytic cases pass, and every run that was finite is bit-identical (§8.2).
2. The effort law's analytic cases (§8.1) hold, and on every swing preset over its backswing range the contact speed is
   strictly increasing and concave in intensity on [0, 1] (§4.2).
3. The ceiling (§4.3): every swing preset at intensity 1 from its body-limited top reaches at least 1.1 × 8.18 m/s.
4. The backswing's limit (§5) and its analytic cases hold.
5. Both follow-through styles are played from inputs alone (§6, §8.4), with no style named in the engine.
6. The flick's lift emerges (§7, §8.4), with no special-casing.
7. The head-never-ahead check (§8.4.4) has run on every one-ball stroke (the single-ball and GC stop presets) and its
   tallies have gone to the gate. A head-ahead state does not block the step by itself: no physics is changed to
   suppress it (the anti-scripting goal), and the user rules on each at the gate (my call).
8. The ratchet of §8.2 holds.
9. Every preset's canonical setup meets P2b.2b.2b.1's exit criterion 4, as P2b.2b.2b.3 restated it (top to finish,
   no `RangeError`, no re-entry guard hit, no ball centre above R + 5 mm but the pass roll's turf rebound, re-measured,
   no `follow-cap`, the trajectory continuous at every boundary), and each re-fitted default plans 3 m/s within 2 %.
10. No impact ends with the head overlapping a ball as handed over, over every preset's late re-hit sweep.
11. The pre-flight gate (§10) has run and the user has ruled on it.
12. The figures of §11 are recorded in the roadmap. They are observations, not gates.
13. `ENGINE_VERSION` is "0.13.0".

## 2. Architecture

```
src/engine/impact/
  integrate.ts       the finite-state guard after each advance, in the impact and in continueStroke (§3); the finish
                     rule for a carried swing-mode follow-through (§6.3)
  track.ts           the carried follow-through in swing mode: the advance on the hands' arc and the held slope, then
                     the pendulum phase (§6), reusing the carry mode's carryPivot and pendulumAt pieces
src/engine/swing/
  downswing.ts       the effort law (§4); the body's backswing limit θ_max (§5) replacing MAX_BACK_ANGLE
  types.ts           SwingProfile.body gains the effort law's τ_0, ω_max and onset (§4.4) and the backswing's limit
                     (§5); SwingShape loses torqueMax, tempoSlow and tempoFast in swing mode;
                     ShotSetup.stroke gains the follow-through's carry inputs in swing mode (§6.2)
  buildContact.ts    validation of the new inputs; the planned speed through the new law
  profile.ts         the defaults (§4.4, §5.3, §6.2)
reference/swing.json, reference/sources/README.md
scripts/fitStrokeShape.ts   the re-fit (§4.4, §5.3)
```

The swing/carry split of the downswing stays: carry mode has no effort pulse and is not touched by §4. What changes is
that the follow-through's mode is no longer fixed by the downswing's: a swing-mode stroke may be carried after contact
(§6). The rolls' code paths are reused, not copied.

## 3. The finite-state guard

After every `advance` in the impact (`integrate.ts:1160`) and in `continueStroke` (`:1324`), the mallet's state
(position, orientation, velocities) and every ball's are checked finite. On the first non-finite value the run throws
a `RangeError` naming the time from contact, the step and which state went non-finite. A `RangeError`, not a flag
(my call): it is how the engine already rejects an impossible setup, the planner (P4) already treats a `RangeError`
as a rejected candidate, and a NaN state has no physical meaning to hand on. The check costs a pass over a few dozen
numbers per step and adds no allocation.

## 4. The effort law

### 4.1 What is wrong

The pulse's strength and its brevity both scale with intensity, so their product, the impulse, stops growing at i = 1,
and a pulse that ends before contact pushes the head early and higher on its arc for no gain. Effort and tempo stay
one control (P2b.2b.2a design §3.1); what changes is that the tempo must follow from the effort, not shorten against
it.

### 4.2 The law's constraints

On every swing preset and every backswing in its range, the contact speed U(i) on [0, 1]:

- **is strictly increasing**: more effort always gives more speed;
- **is concave**: each further increment of effort gives less (diminishing returns, the user's account);
- **has no flat top**: dU/di at i = 1 is at least a fixed fraction of its mean over [0, 1] (the plan sets it, at least
  0.25), so the speed keeps rising to full effort;
- **meets gravity at i = 0**: intensity 0 is the gravity-only swing, unchanged, so a soft tap is as today;
- **acts until contact**: the player's torque is applied through the whole downswing, not ended before the face meets
  the ball.

### 4.3 The ceiling

The CA's single-ball measurements (reference/sources/README.md, "Backswing against contact speed"; CA Dynamics, Single
Ball Shots) record a hard single-ball stroke, A4D, at a mallet speed of 8.18 m/s. A measured hard stroke is not a
maximum, so the ceiling sits above it: every swing preset at intensity 1 from its body-limited top (§5) reaches at
least **1.1 × 8.18 = 9.0 m/s** (the 10 % margin is my call). For the default player's drive the user's claim is
checked, not fitted: at the ceiling, the drive's croqueted ball at a 10 s lawn must pass the full 35 yd length through
today's strike laws (§8.5); if it does not, the gate (§10) decides, since the drive's ratio is step 2's.

### 4.4 The law's form

**Preferred form (my call, the builder may choose another that meets §4.2 and records its source):** a Hill-type
torque–velocity law, the player's torque falling as the swing speeds up:

τ_p = i · τ_0 · max(0, 1 − ω/ω_max) · ρ(τ),

with ω the shaft's angular speed, τ_0 the player's isometric torque, ω_max the speed at which the player can add no
more, and ρ a short onset ramp from the backswing's top (so the torque is not a step). It gives diminishing returns
from the physiology itself (Hill 1938, the force–velocity relation of muscle), never turns over, and acts until
contact; the tempo is then an outcome, a harder swing being a quicker one. `tempoSlow` and `tempoFast` leave swing
mode (carry mode keeps its hands' tempo). Hill 1938 is fetched and cited in `reference/sources/README.md` by the plan
(URL, date, SHA-256, a short quote), never mirrored.

**Its figures (my calls).** τ_0 and ω_max are the player's body, so they live in `SwingProfile.body` and are shared by
every swing preset, not per preset in `SwingShape`. Two unknowns need two conditions:

- **ω_max** is set by the share of the player's speed the swing uses at full effort: at intensity 1 from the
  body-limited top, the shaft's angular speed at contact is κ·ω_max, with κ = ⅔ a labelled placeholder (the torque
  left at contact a third of τ_0), taken on the drive preset;
- **τ_0** is then bisected so that the lowest U(1) over the swing presets, each from its body-limited top, is exactly
  9.0 m/s (§4.3), so every preset meets the ceiling.

κ shapes U(i)'s concavity; the gate (§10) sees U(i) at κ = ⅔ beside ½ and ¾. ρ's length is a labelled placeholder.

**The torque ends at contact.** The impact window's law (α = drive·speedGain·U/(ℓ·window), `buildContact.ts:648`) is
untouched: the impact is about a millisecond (Sutherland 1995), and whatever a freer stroke gains, it gains through
the contact speed and the hands' coupling.

### 4.5 The hands-assisted defaults

Riches ("Swing High, Swing Low", 1995): "for most shots the height of the mallet BACKSWING should determine the length
of the shot", and "an unnecessarily high backswing is far better than one which is not high enough". So the default
stroke takes its length from the backswing, with a constant help from the hands:

- every swing preset's `defaultIntensity` becomes one shared, labelled placeholder above 0 (the plan proposes it; the
  gate sees it against the user's checks, §8.5);
- each `defaultBackswing` is re-fitted so the canonical setup plans 3 m/s at that intensity, within 2 %, as today;
- a gravity-only swing (intensity 0) stays available as an input, for the soft tap.

## 5. The backswing's limit

### 5.1 A body figure, not geometry

In the normal between-the-legs stroke the backswing ends where the shaft meets the groin. A geometric limit (the line
from the pivot through the head meeting a groin point) is too sensitive to be built from published figures: on the
default 36" shaft the top hand sits about 0.88 m above the turf and a standing crotch height for a 5'10"–5'11" player
is about 0.82–0.85 m, so a centimetre of groin height moves the limit several degrees, and a little more puts the
groin above the hands, where it limits nothing. A real stance also bends the knees, which no source quantifies.

So the limit is a direct body figure (decided 2026-10-18, §Amendments): `SwingProfile.body` gains **θ_max**, the
shaft's largest angle back from vertical at the backswing's top, documented as "where the shaft meets the groin".
θ_max replaces `MAX_BACK_ANGLE` in `planDownswing`'s check, and the `RangeError` for a backswing beyond it names the
body's limit. θ_max is at most π/2: with a fixed pivot the head cannot rise above the hands.

### 5.2 Its default

The user (2026-10-18): the head tops out "somewhere between knee and waist", varying with the grip and the shaft's
length. On the default mallet a knee-height top (a head rise of about 0.48 m) is about 64° and the shaft horizontal
(the head level with the hands, about 0.85 m) is 90°; a waist-height head is above the hands and out of a fixed
pivot's reach (§5.3). The default θ_max is **75°**, a labelled placeholder from the user's account (a head rise of
about 0.63 m on the default mallet; the plan computes the exact figures). Because the default comes from the user's
account, the knee-height check (§8.5) is no longer independent of it; it is recorded, not claimed as validation.

The default θ_max sets each swing preset's body-limited top, from which the ceiling is fitted (§4.3). At the same
θ_max a longer shaft gives a higher head, a shorter one a lower.

### 5.3 Leaning forward

Some players lean forward in the swing when power is needed, to allow a longer backswing (user, 2026-10-18). That
moves the pivot, which the model's body cannot yet do beyond P2b.2b.1's translating pivot: it belongs with the fully
articulated body, deferred (§12). The grip's and a modified shaft's effect on θ_max are ignored for now (user).

## 6. The follow-through styles

### 6.1 The physics

The rising style is today's: the top hand comes to rest after contact and the head swings freely up its arc. The level
style is the player's hands advancing at the right moment, as in the roll: the hands travel forward along aim on their
own path, the shaft's slope held, so the head travels on with them instead of rising, and then the mallet swings
through as a pendulum. The roll's carry mode already has every piece: the hands' arc (`carryPivot`, `track.ts:703-720`;
an infinite `handArcRadius` is level), the held slope (`track.ts:853-873`) and the pendulum phase (`pendulumAt`,
`pendulumEffort`, `track.ts:839-888`, `:1342-1467`).

### 6.2 The inputs

A swing-mode stroke may carry its follow-through: from a player-set moment the hands advance on the roll's hands' arc
with the slope held, over a player-set travel, and then hand over to the pendulum phase. The inputs are the moment
(after contact, s, or before: an early advance drives the head into the ball, which the fault judge rules on as a
push, as today), the travel, the arc and the pendulum phase's start and effort; their names and grouping are the
builder's, reusing `StrokeTiming.hands`, `handReach`, `pendulumAt` and `pendulumEffort` where their meanings fit. With
no advance set, the stroke is today's swing-mode follow-through, bit-identical (§8.2).

**How the hands move (my calls).** Every swing preset's planned pivot is at rest after contact (handGain 0,
pendulumShare 1), so the roll's `carryPivot` alone would not move it. The advance therefore starts the hands at the
speed along aim that keeps the head's speed along aim continuous at the advance's moment (the shaft's slope then
held), and eases them to rest over the set travel on the roll's hands' arc, as the reach eases today. The slope is
held at its value at the advance's moment, so a late advance holds an already-risen head. The pendulum's angular speed
at that moment is brought to the held slope by the carry mode's quartic over one window (`track.ts:847-870`). The
builder may refine these if §8.1.5's tolerance cannot be met, and records why.

The engine never names a style:
the level and the rising strokes are two ends of a continuum the inputs span, and a mistimed advance falls between
them.

### 6.3 The finish

A carried swing-mode follow-through finishes as a carried roll does: at the first apex after the pendulum phase
starts (`integrate.ts:366-391`), since the swing apex test never fires while the slope is held.

### 6.4 The ball's behaviour

Whether the level stroke "zings" the ball and the rising one runs straighter but over-runs is an outcome, read off the
ball's speed, spin and skid at launch and its travel (phase 2), never a target. The face's friction already gives the
ball its spin.

## 7. The flick

A contact with the head already rising comes from meeting the ball off the bottom of the arc, which the stance
(`handsAhead`), the arc's timing and the ball's place already set. The ball's launch then follows from the face–ball
law: lift and a skid, and a bobble on landing from the turf's rebound (the jump shot's turf rebound must not be damped
away). Nothing is added for it; §8.4 checks that it emerges.

## 8. Testing

### 8.1 Analytic cases

1. **The guard.** A stroke with ζ ≥ 2 (the carried open item's setup) throws a `RangeError` naming the step; a
   constructed state with one NaN velocity is caught at the next step in the impact and in the follow-through.
2. **The effort law.** At i = 0 the swing is gravity-only, to the bit against today's. At fixed ω the torque is
   i·τ_0·(1 − ω/ω_max)·ρ; at ω ≥ ω_max it is 0. The work–energy balance of the downswing holds within 0.1 % (P2b.2b.2a's
   test) at every intensity.
3. **Monotone and concave.** Over i in steps of 0.05 on every swing preset at its default and its body-limited
   backswing: U strictly increasing, its second differences negative, and the slope at 1 as §4.2 requires.
4. **The backswing's limit.** For a constructed θ_max, a backswing to just inside it plans and one just beyond throws,
   naming the body's limit; at the same θ_max a longer shaft gives a higher head, by ℓ(1 − cos θ_max).
5. **The carried swing.** A swing-mode stroke with an advance on an infinite arc keeps the head centre's height within
   a tolerance the plan sets (at most 2 mm) of its height at contact from the advance's start to the pendulum phase;
   with no advance, bit-identical to today's.

### 8.2 The ratchet

Baselines on `main` before any change: the throwaway preset digest, `scripts/impactDigest.ts`, `scripts/shotMix.ts`
phase 2 (timing lines dropped) and `scripts/impactProbe.ts`.

1. After the guard: all four bit-identical.
2. After the groin limit: bit-identical wherever no backswing reaches it; any run it now rejects listed.
3. After the carried follow-through with no advance set: all bit-identical.
4. After the effort law and the re-fit: the impact digest, `impactProbe`, the shot mix's phase 2 and every carry-mode
   run (the rolls) bit-identical; every swing-mode run moves, each preset's moved runs counted and its canonical
   figures listed old → new.

### 8.3 The canonical runs

As exit criterion 9, at the new defaults.

### 8.4 The styles and the flick (gated, qualitative)

On constructed single-ball setups the plan fixes, at 3 and 5 m/s:

1. **Both styles.** A rising and a level stroke at the same planned speed each run top to finish; their launch
   speeds, spins, skid lengths and travels recorded side by side (not gated against each other).
2. **A mistimed advance.** A sweep of the advance's moment from early to late: early runs are judged by the fault judge
   as today; the head's path moves continuously from level to rising; recorded.
3. **The flick.** A sweep of the contact's place along the arc (by the arc's timing and `handsAhead`): the ball's
   launch angle rises with the head's rise angle at contact, and past some rise the ball leaves the turf; recorded,
   with the first sweep step at which the ball is airborne.
4. **The head never ahead.** Over 1–3 and every run of the single-ball and GC stop presets' sweeps: no state with
   the head's centre ahead of the striker's ball's centre along aim and the head's lowest point below the ball's top
   while the ball is within 2R of the head. Failures counted and listed, each with its time, for the gate.

### 8.5 The user's checks (recorded, not gated)

Against "User play data and checks (2026-10-08)", at the default world at 10 s, through `simulateShot`:

- the single ball from a knee-height backswing (0.45 m) over intensity 0–1, against the user's 5, 15 and 30 yd
  strokes (felt effort is not intensity: P3 maps one to the other);
- the default's body-limited top against the user's "about knee height";
- the drive at the ceiling: the croqueted ball against the full 35 yd length (the default club player drives it);
- the full roll's distance at full effort, recorded only (rolls untouched here; a full-lawn roll should be harder
  than a full-lawn drive).

### 8.6 The existing tests

Every test on a swing preset's default backswing or intensity is re-baselined, its comment "P2b.2b.2c.1: the
single-ball stroke (was …)". Gugan's jab check stays `it.runIf(SLOW).fails`; if the new effort makes it pass, `.fails`
turns red and is removed, the gate told.

## 9. The modes' split (recorded for the unified model)

The plan lists, file and line, every place swing and carry mode or a single preset branches (the explore map of
2026-10-18 found about twenty: `SwingDrive.mode` and its four carry-only fields, `shapeOf`, `DRIVE`/`DEFAULT_DRIVE`,
`planDownswing`, `validate`, `arrival`, `prepareTrack`, `pivotAt`, `pendulumAt`, `handLoad`/`carryLoad`, `inCheck`,
`finishKind`, the carry resistance and chains, the check hold, the fit's branch, `canonicalSetup`'s special cases), and
records it in the roadmap as the unified model's debt. This step removes one: the follow-through's mode is no longer
the downswing's.

## 10. The pre-flight gate

The order of work is the ratchet's (§8.2): the guard, the backswing's limit, the carried follow-through with no
advance, then the effort law with its fit of τ_0 and ω_max (§4.4) and the proposed defaults (§4.5) computed. The gate
comes then, before the defaults are committed and the existing tests re-baselined; its sweeps run at the proposed
defaults, and U(i) also at today's for comparison. The plan stops for the user with:

- U(i) for every swing preset from its default and its body-limited top, beside today's;
- the proposed shared `defaultIntensity` and the backswings it gives at 3 m/s, beside the user's checks (§8.5);
- the default body's θ_max and the head's rise at it, on the default mallet and on the user's (42" shaft, 13.5" head);
- the styles' and the flick's sweeps (§8.4);
- any run the groin limit rejects, and the guard's catches on the sweeps (expected none).

The user rules in their own words; each ruling goes into this design's Amendments and the roadmap.

## 11. Recorded figures

In the roadmap's "P2b.2b.2c.1 outcomes": U(i) per swing preset; the ceiling's fitted τ_0 and ω_max; the defaults; the
user's checks (§8.5); the styles' and the flick's sweeps; the head-never-ahead tallies; every preset's canonical
figures and the sweep's cap and flag tallies as P2b.2b.2b.3 recorded them; the modes' split (§9); the cost (the
downswing's steps and `shotMix`'s engine time, run alone).

## 12. Out of scope

- Step 2: the contact-time fit, the hands' T and ζ, the arm mass, the reach slack and the grips, the arms' checking
  force, the drive's and the stop's ratios, ball-make elasticity (le Maitre's 2.7–4.2 by make), the grip-limit control
  run.
- Step 3: the rolls' validation, including the rolls' head-never-ahead check (the anti-goal above, measured on every
  roll's runs and counted as the "head on point" check is), stop → pass-roll, pull, stop-shot lift, the GC stop's
  distances, crush calibration, 29.1.6.3.
- The rolls' effort (`pendulumEffort`, the hands' tempo): untouched.
- The side style and the stance's stability and off-centre aim (P3, with the grip style; accuracy is deferred as
  variability of human input).
- θ_max's dependence on the grip and on modified shaft shapes (user: ignore for now); leaning forward for a longer
  backswing (the fully articulated body, deferred in the P2 row).
- Felt effort against intensity (P3); choosing backswing and intensity per shot (P4).
- The bobbling ball's deflection on an uneven lawn (deferred with lawn variability).
- Merging swing and carry mode (the unified model; §9 records the debt).

## Amendments

- **Builder check (2026-10-18).** Settled as the author's calls: the effort law's τ_0 and ω_max shared in the body,
  fixed by κ and the weakest preset's ceiling (§4.4); the torque ending at contact (§4.4); how the hands move in the
  advance (§6.2); the head-never-ahead check a gate item over the one-ball strokes (exit criterion 7, §8.4); the
  order of work and the gate's defaults (§10).
- **The backswing's limit (user, 2026-10-18).** The geometric groin limit is replaced by a direct body figure θ_max
  (§5.1), as the author recommended; its default from the user's account, the head topping out "somewhere between
  knee and waist", 75° (§5.2).
