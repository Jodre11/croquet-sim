# P2b.2b.2c.3b — The Rolls' Push Map: Design

Follows P2b.2b.2c.3a, the unified set-up (`specs/2026-10-26-p2b2b2c3a-unified-setup-design.md`; amendment A1).

Brainstormed 2026-10-26 from the roadmap's P2b.2b.2c.3 entry and "P2b.2b.2c.2d outcomes (2026-10-25)", "Carried open
items". Every statement attributed to the user is theirs, from the brainstorm; everything else is marked as the design's
call or left to the builder (§12). The user's quotes were dictated; transcription slips are corrected ("exhilaration"
→ acceleration, "Ray" and "role" → roll, "past role" → pass roll, "bulls" → balls, "stikers" → striker's) and one
missing verb is bracketed.

## Intent

A roll is not one stroke with one push. The user, a high-handicap player: "What we're assessing is the amount of
follow-through and the rate of acceleration of the follow-through that gives the desired outcome for that stroke type.
Then picking that as a default for the roll at certain ranges. So what I'm interested in is how that profile changes at
different ranges. … anchor on a half roll. Then sort of plot out what is required to get the extra levels of power. I'm
sure the lawn has an effect here too. And that is also a variable."

So this step builds **the push map**: for each roll type, at each range and lawn speed, which plans (how hard the
stroke, how much follow-through, how sharp its acceleration) land the balls in that roll's outcome, and what each costs
the player in effort. The defaults per range are picked from it. The roadmap's "natural push's growth with the swing's
power" is the map's least-effort path across range; the "sourced recruitment law" is the check on that path's form.

## Scope (user, 2026-10-26: "That split works, go with it")

In: the push's growth with power, its law, and the rolls' held-out validation; the carried roll items I (the full-roll
variant), K (the super pass roll's partial emergence), L (the push's headroom), O (the rolls' follow-through digs), and
the effect measure's turf drag (the contact-only candidate).

Out, to later steps: the GC stop's distances, crush calibration, 29.1.6.3, pull, stop-shot lift. Out of this PR: the
housekeeping (`typescript-eslint` 8.72.0, `vite` 8.3.5) ships as its own PR first (user: "Separate PR first");
TypeScript 7 waits for `typescript-eslint`'s support (user: "we can wait").

## The user's account (hypotheses, not facts)

1. **Two parts.** "the initial downward hit into the ground is quite hard, especially if you want to play a firm
   stroke. Once you get the ball rolling, it's more about a controlled follow-through."
2. **Momentum, not strength.** "if you really push hard and accelerate, it's quite possible to push both balls off the
   lawn. However, it's also easy to underplay it, so it's more about getting the right level of momentum. And if you can
   do that smoothly so you keep behind the ball, that's useful."
3. **The hard opening hit.** "If you are too hard on this hit with a weak follow through the croqueted ball get more
   power and you don't have time to apply the same to striker's ball putting you close to a half roll."
4. **Planned, not reactive.** "On a strong or fast push I'm not cognitively able to adapt to the behaviour of the ball.
   The movement is pre-planned based on the desired outcome. On a softer shot, I suppose there is more time, more feel."
5. **The pass roll accelerates.** "if I want to pass, I want an accelerating push. If it is a hard pass I need to
   'punch' through to get the acceleration."
6. **The super pass roll.** "I suspect I would [strike] soft, to impart less to the croqueted ball, then, once the split
   is initiated and the path unoccluded, inject an accelerated follow-through into the stroke."
7. **Soft pass rolls need a wider split.** "For softer pass rolls a wider split may be necessary so that there is
   enough angle for the croqueted ball to get out of the way in time."
8. **The push grows with intended power.** "The push increases with the intended power. I'm not good enough at the shot
   to judge this perfectly from experience. A better reference or a degree of fitting would benefit us here."
9. **Roll types are categories.** "a full roll and indeed a pass roll are a broad category of outcomes where the balls
   finish up at certain ratios."

Carried from P2b.2b.2c.2d: "on a soft shot, no follow through force is applied … on a harder shot, you swing through
naturally. On a very hard shot, you might apply a lot of extra follow through"; the full roll may want the pass roll's
stronger push.

## Decisions (user, 2026-10-26)

1. **The push is a plan, fixed before the stroke.** Nothing in the engine reacts to the impact on the player's behalf
   (account 4; consistent with the flattening hypothesis's ruling). Feel on soft strokes (closed-loop correction) is a
   future item, not this step.
2. **Anchor on the half roll** ("Anchor on half roll (Recommended)"). The half roll's existing default plan sits inside
   its band without ever having been fitted (2.20 at 3 m/s; 2.02–2.28 over 2–4 m/s against the CA's 1.4–2.5) and is the
   map's origin. The half roll must stay in band at its canonical setup: the guard that the new work breaks nothing that
   already works.
3. **Roll types are outcome regions, not target points** (account 9). A plan belongs to a roll type's region at a range
   if its balls finish within that type's ratio band (§2). The full and pass rolls' plans are therefore *chosen from*
   their regions; their ratios are no longer held out. What stays a genuine test is in §6.
4. **Effort is shown as two percentages** ("both numbers as percentages of max would help me to imagine feasibility"):
   the stroke's (the planned contact speed as a percentage of the most the body can give that type, its backswing at
   the body's limit and intensity 1; "Speed as % of max (Recommended)", so the backswing and the intensity count
   together) and the push's peak (the hands' push intent's peak as a percentage of `body.pushForce`, 92.2 N).
7. *(Superseded by A1: the preset is the text book starting point, and the lean and the feet are swept, §3.2.)*
   **Each roll type keeps its own stance** ("Own stance per type (Recommended)"): three maps, each under its own type's
   preset stance and shape (the leans 24°, 31° and 34° from Gugan 4 Table 6, Riches's hand positions, the preset's
   `speedGain` and `handGain`), untouched by this step. A plan counts only in its own type's band.
5. **The default is the least-effort plan** ("if there are choices of combination the lowest mean would probably be
   favoured"): within a region at a range, the plan with the lowest mean of the two percentages.
6. **The no-damage rule applies to the rolls** ("Exclude them, the no-damage rule applies to rolls too"; the AC stop's
   rule, 2026-10-25: "it is okay for the mallet to rub on the lawn and disturb the grass. It should not damage the
   turf"). A plan that raises `impact-head-deep`, `turf-yield`, `follow-turf-yield` or `follow-head-deep` is excluded
   from every region. This closes carried item O by construction: no default may dig.

## 1. Goal and exit criteria

The step is done when:

1. the push map (§3) is computed for the half, full and pass rolls over the range and lawn grids, recorded, and plotted
   (§9);
2. the defaults per roll type, range and lawn speed (§5) are picked by decision 5 and recorded as a reference table,
   beside the envelope record (§3.5);
3. the checks of §6 are run, recorded and ruled at the gate;
4. the half roll's canonical setup stays within 1.4–2.5, every roll's canonical setup within ±2 % of its own planned
   contact speed (§5), and every swing preset's within ±2 % of 3 m/s;
5. no run of any preset's late re-hit sweep ends with the head overlapping a ball as handed over;
6. the ratchet (§8) and the pre-flight gate (§10) are run and ruled;
7. the figures are recorded in the roadmap's "P2b.2b.2c.3b outcomes", and `ENGINE_VERSION` moves to 0.19.0 (after
   P2b.2b.2c.3a's 0.18.0) if any default changes, as the branch's last step. 3b is its own branch and PR, started
   after 3a merges.

## 2. The outcome regions

Ratio = the croqueted ball's distance to rest ÷ the striker's ball's, as everywhere in the project. The bands, the
CA's ("P2b.2 decisions (2026-10-04)"):

| Region | Ratio |
|---|---|
| half roll | 1.4–2.5 |
| full roll | 1.0–1.2 |
| pass roll | below 1 (the CA's 0.9–1.2 straddles 1; Gugan 5's theory about 0.83) |

The pass roll is a split shot: played straight, the striker's ball cannot pass the croqueted ball and the ratio floors
at 1 ("P2b.2 decisions"; the canonical pass roll played dead straight gives about 1.03–1.07). So the pass roll's map
carries the split angle as a further dimension (account 7).

A plan is **admissible** only if it is believable (§4). Regions are drawn from admissible plans alone.

## 3. The push map

### 3.1 The plan space

The plan is the shot's own inputs in `ShotSetup.stroke`, as P2b.2b.2c.3a leaves them (no mode; the set-up inputs
`grip`, `lean` and `feet` on every stroke). No further engine input is planned; §12 if the builder finds one is needed.

- **the set-up:** `lean` and `feet` (3a), swept at every range (§3.2); the grip at the type's;
- **how hard:** `backswing` and `intensity` (as 3a's strike defines them);
- **how much follow-through:** `drive` (0 natural … +1 pushed through) and `handReach` (the push's length);
- **how sharp:** `window` (the pulse's duration, `MIN_WINDOW` 1 ms to `MAX_WINDOW` 0.1 s; shorter is a higher peak
  acceleration);
- **when:** `timing.hands` (the hands' onset; positive is late), used for the super pass roll (§3.4);
- **the split** (pass roll only): set as the croqueted ball's offset from a fixed aim, as P2b.2b.2c.2d's checks set it;
  the split at rest (the angle between the two balls' paths) is recorded beside it, and account 7's test reads the
  split at rest (the design's call).

Each grid point fixes the set-up and the follow-through (drive, handReach, window; onset 0 outside §3.4) and solves how
hard (backswing, then
intensity once the backswing reaches the body's limit, matching P2b.2b.2c.1's rule that speeds beyond the gravity-only
default are reached by intensity) so that the striker's ball comes to rest at the grid's range. The solved plan's
ratio, effort and believability are recorded.

### 3.2 The grids (the design's call)

- **Range:** the striker's ball's distance to rest. From short rolls to a full court length, 32 m; the builder sets the
  spacing (at least six ranges, denser where regions change).
- **Lawn speed:** 6, 10 and 14 s first, `reference/lawn.json`'s sourced span and its normal lawn. The design's guess,
  to be measured: once both balls roll, the lawn slows them alike, so the ratio depends little on lawn speed and the
  lawn mainly moves which range needs which power. 8 and 12 s are added only if the guess fails (spec review).
- **Split** (pass roll): at least 0°, 10°, 20° and 30°.
- **Follow-through:** drive, handReach and window over their valid ranges, coarse first and refined where a region's
  edge or the least-effort plan lies. Onset fixed at 0 (on time) outside §3.4's sweep.
- **The set-up** (A1; the user, 2026-10-26, overriding the spec review's staging): the lean and the feet are swept at
  every range, coarse first and refined where a region's edge lies. The user expects most combinations to fail: "many
  combinations either mishit the ball, drive the mallet into the lawn, or [need the] superhuman to achieve anything.
  So that run should reveal … the shape of the envelope … And we should record that so that further testing doesn't
  waste its time." So the sweep is also the envelope's first survey (§3.5).
- Measured on an open lawn (`scripts/openLawn.ts`, generalised to a lawn speed) so that no run leaves the court.

### 3.3 The anchor

The half roll's current default plan (`profile.ts`: drive 1, window 0.02 s, handReach 0.15 m, at its canonical 3 m/s)
is the map's origin: the half roll's map is computed first, and its default plan must lie in the half-roll region at its
own range. If it does not, the step stops at the gate.

### 3.4 The super pass roll (carried item K)

Account 6 as a plan: a soft strike, then the hands' accelerating push, late (`timing.hands` > 0) and sharp (small
`window`), while the mallet stays with the striker's ball. A targeted sweep of onset × window on the pass roll's map,
at the splits of §3.2, measures whether a plan sending the striker's ball "multiples further" (ratio well below 1)
exists and is admissible. Lawful only if the mallet does not separate visibly from the ball and then change it
(`reference/laws.json` 29.2.5: contacts within `MERGE_SEPARATION` 2 mm join one contact; a later re-contact is possible
29.1.6.1 from 10 % or 2°); a separated catch-up is Gugan 5's push, "always faults", and excluded by §4.

### 3.5 The envelope record

Every plan the sweep tries is recorded with its outcome, and every excluded plan with the first reason it fails, in
classes the user named: **mishit** (off the face, or the ball met beyond the on-point limit), **damages the turf**
(`impact-head-deep`, `turf-yield`, `follow-turf-yield`, `follow-head-deep`, or the head in the turf at contact),
**superhuman** (intensity above 1, the backswing beyond θ_max, a saturated grip, the couple past C: A2 item 1),
**unlawful** (possible 29.1.6.1, the head overtaking the ball), and **unreachable** (A2 item 2: the range not reached,
or the plan rejected by the engine). The record is kept as reference data beside the defaults (derived; its script,
commands and SHA-256 recorded), in a form later steps can query by set-up and follow-through, so further testing skips
combinations already shown to fail. A set-up that fails for the same reason at every range is marked as outside the
envelope outright, and refinement skips it. The record summarises the envelope's shape per roll type and lawn: which
lean and feet combinations are viable at which ranges, and which reason bounds each edge.

## 4. Believability (admissibility)

A plan is admissible when its run:

- raises no `impact-head-deep`, `turf-yield`, `follow-turf-yield` or `follow-head-deep` (decision 6);
- raises no possible 29.1.6.1 (a re-contact after the parting at or above `EFFECT_SPEED` or `EFFECT_ANGLE`);
- keeps the head behind the striker's ball: never overtaking it and dropping into its path (the roadmap's
  P2b.2b.2c.3 entry; the on-point test of P2b.2b.2b.2b: the head's centre behind the ball's along aim, every face
  contact no higher than R·sin 45° above the ball's centre, the lean at most 45°);
- never saturates either hand's grip (since P2b.2b.2b.3 a saturated grip slides its anchor and raises no finding; a
  slid anchor means the mallet slipped in the hands), and needs intensity ≤ 1 and the backswing within the body's
  limit θ_max (P2b.2b.2c.3a; it also sets 100 % stroke effort);
- holds its planned slope within the grip's couple C (`gripCouple`; A2 item 1).

A push intent that saturates at `pushForce` is admissible at 100 % push effort; how often defaults saturate is recorded
(carried item L).

## 5. The defaults

For each roll type, range and lawn speed in the grids (and, for the pass roll, each split: the split is the player's
outcome choice, not effort, so the pass roll's defaults are keyed by it too), the default plan is the admissible plan
in that type's region with the lowest mean of its two effort percentages (decision 5); ties go to the plan nearer the
half roll's anchor in follow-through. The table of defaults is reference data, its provenance the map's run (derived),
with its script and commands recorded. No engine lookup by range is built (spec review): no engine input takes a
target range, and the planner or UI that would read one is later work.

The profile's per-type values (`DRIVE[type]`'s follow-through, `DEFAULT_DRIVE`, the text book lean and feet) change
only to the canonical range's default: each roll's canonical setup takes the whole default plan (how hard and the
follow-through) at the range its current canonical reaches on a 10 s lawn (the pass roll at its canonical split), so
the canonical runs a plan the map ran (the design's call); its planned contact speed follows from that plan. The swing
strokes' entries are untouched.

A range at which a type's region is empty has no default; the gap is recorded and ruled, not filled.

## 6. What stays a test

Nothing here is solved for; each is measured on the map and ruled at the gate.

1. **The half roll in band** at its canonical setup and its anchor plan in its region (decision 2).
2. **The ratio is ordered in the follow-through.** Within each type's map, at a fixed range and lawn, the ratio does
   not rise as drive rises with the window, `handReach` and onset held fixed (measured per slice; the design's call);
   across the three maps the defaults keep the half → full → pass order at each range (the roadmap's stop → pass-roll
   ordering, extended).
3. **Each region exists and is admissible** at the ranges a player uses it.
4. **The least-effort path's form.** Along range, each type's default follow-through should grow smoothly with
   power (account 8), its effort percentages rising monotonically. Its form is compared with impulse-variability
   scaling (Schmidt, Zelaznik, Hawkins, Frank and Quinn 1979, "Motor-output variability: A theory for the accuracy of
   rapid motor acts", Psychological Review 86: a rapid act's force-time profile keeps its shape and is scaled), read
   and cited before it is used, under the project's citation rule (URL, date, SHA-256, annotated quotes only), and
   with the CA's measured roll contact times, 30–58 ms. A miss is recorded, not fitted away.
5. **The user's expectations:**
   - account 3: a hard opening strike with a weak follow-through lands in, or towards, the half-roll region;
   - account 7: a soft, straight pass roll cannot reach the pass-roll region, and widening the split frees it;
   - account 2: a hard, accelerating push can drive both balls past a full court length;
   - account 5: the pass roll's least-effort plan accelerates through contact, sharper at longer ranges.
6. **The effort percentages are believable** for a club player at the ranges they play (recorded for the user's
   judgement; the user: "both numbers … would help me to imagine feasibility").

## 7. The carried items

- **I, the full-roll variant:** recorded against the full-roll region and its default (the variant 1.11–1.22 at 2–4 m/s
  against the default's 1.82–2.08).
- **K:** §3.4.
- **L, the headroom:** the defaults' push percentages, and how many saturate.
- **O:** closed by decision 6; the canonical full and pass rolls' digging re-measured on their new defaults.
- *(Moved to P2b.2b.2c.3c by A2, item 3.)* **The AC stop's two grips** (P2b.2b.2c.3a, decision 3): its default,
  lowered and loose jab variant played beside a hands-together AC stop (Riches's text book), Gugan 5's stop and the
  turf's damage recorded for each, for the user's ruling on which the bottom hand's height should be by outcome.
- **The effect measure:** the contact-only candidate (the striker's ball's velocity change summed over the face
  intervals alone, the gaps excluded) measured beside the shipped span measure on the map's runs, the verdicts that
  differ counted per type, and ruled at the gate. The shipped measure stays unless the gate rules otherwise.

## 8. The ratchet

As P2b.2b.2c.2d's: a baseline worktree at the branch's base (installed with `npm ci`, never a symlinked
`node_modules`), the preset digest (`phys` and `faults` per run), `impactDigest`, `impactProbe` and `shotMix`. Every
commit before a default changes is bit-identical; each default's change is counted per preset, every moved run listed.
The implementers stage and stop; the controller runs the digests, probes and slow tests and confirms the ratchet before
each commit.

## 9. Records

- The map's raw output and its reading in `docs/superpowers/probes/`, each with its script's SHA-256 and commands.
- **Plots** (account: "plot out what is required"): per roll type and lawn speed, the regions over range × the push's
  impulse (the integral of the hands' push intent; the design's call for the follow-through axis), the least-effort path
  drawn on them, and the two effort percentages along range. Static images or a
  page in the records; the builder's choice of form.
- **A side-on stroke plot** (user, 2026-10-26: "it would be very useful"), a throwaway validation aid ahead of the
  roadmap's side-on stroke view: for each text book set-up and each default shown at the gate, the mallet's head and
  shaft drawn side-on through the swing and the impact, with the balls, from `SwingTrajectory` and the impact's states.
  Static frames or an animation; the builder's choice. Not product code.
- The roadmap's "P2b.2b.2c.3b outcomes" with the figures, the gate's rulings verbatim, and the carried open items.

## 10. The pre-flight gate

Two stages, as P2b.2b.2c.2d's. Stage 1 after the half roll's map: the anchor (§3.3), its region and the lawn's effect
(§3.2's guess). Stage 2 after the full and pass rolls' maps and the defaults: §6's tests, §7's items, the effort
figures. One question at a time, with options and a recommendation.

## 11. Non-goals and anti-goals

- Not fitting any ratio. A region is a band a plan lands in; the defaults are chosen within it by effort, never tuned
  to a target ratio.
- No reactive control: nothing in the engine adjusts the push during the stroke (decision 1).
- No default that damages the turf (decision 6), breaks the Laws or lets the head overtake the ball.
- No change to the swing strokes (single-ball, drive, the stops); their digests stay bit-identical.
- The later step's items (§Scope) and the deferred minors from P2b.2b.2c.2d's final review (M-2..M-6) and its other open
  items stay carried unless the builder finds one blocks this work.
- Anti-goal: a map whose regions exist only at efforts no player could produce. That is a finding for the gate, not
  something to hide by moving the limits.

## 12. What's left to the builder

- The grids' spacing and the refinement scheme; thinning the lawns if §3.2's guess holds.
- The solve for how hard (§3.1): the method, its tolerance on range, and how it treats a plan whose range is
  unreachable.
- Where the defaults' table lives.
- The plots' form.
- Whether the map runs within the project's time budget; if a full grid is too slow, a coarser grid with the reasons
  recorded.

## Amendments

**A1 (user, 2026-10-26, after the builder check): the set-up space; the step splits.** The user: "When a player sets up
a shot they do a number of things in a rough order. … 1. Hand Position on the mallet, effecting the angle of attack of
the mallet face. 2. Feet position relative to the strikers ball, affecting where in the arc contact will be made. 3a.
Power and acceleration of the strike. 3b. Magnitude and acceleration of the push through. 3c. Magnitude and
(de/ac)celeration after initial contact. I feel like these all apply to every shot and the relative set up of these
define what the shot type is." Then: "a stance is really a definition of how the mallet is held which affects the
'lean', in practice different players do this in different ways but it is the lean that changes"; "depending on the
situation, sometimes some value in between would be selected"; "same is true for foot position, the defaults for a
'text book' example of that shot change. We still need to validate our model against the text book but, eventually,
all the above need to be an envelope of valid combinations. I suspect many combinations may achieve the same outcome
once variable push acceleration is in the mix."

Consequences:
- P2b.2b.2c.3 splits. **P2b.2b.2c.3a, the unified set-up** (its own design, first): the lean, the feet (where on the
  arc contact falls) and the push through become per-shot inputs on every stroke, and the swing/carry mode split goes;
  each type keeps only its "text book" defaults, its results at them bit-identical. **P2b.2b.2c.3b, this design**,
  follows on it.
- Decision 7 is superseded: each type's preset is its text book example, the map's starting point, not a fixed stance.
  The map sweeps the lean and the feet as dimensions beside the follow-through, at every range (the spec review's
  staging overridden by the user, §3.2), so the regions show which combinations,
  in-between leans included, make each roll at each range.
- The text book validation stays: each type's text book set-up must land in its band (the half roll's, decision 2, the
  first).
- The full envelope of valid combinations over every input is the eventual aim; this step maps the slice the rolls
  need. Many combinations may reach one outcome; the default among them stays the least-effort one (decision 5), and
  the map records how many admissible plans share each outcome.

**A2 (user, 2026-10-28, after P2b.2b.2c.3a merged): 3a's outcomes, the edgy band, and the carried items' split.** 3a's
figures and rulings are in the roadmap's "P2b.2b.2c.3a outcomes (2026-10-28)" and its design's amendments A1–A3
(`ENGINE_VERSION` 0.18.0). The housekeeping shipped first as its own PR (`svelte` 5.57.3, `typescript-eslint` 8.72.1;
`vite` already current); 3b's branch starts from main after it.

1. **The plan space after 3a** (§3.1). The swept inputs are §3.1's; every other input of `ShotSetup.stroke` is held at
   the type's (the design's call): the grip (the rolls unchanged by 3a), `slopeHold` λ (1 on every roll,
   `SLOPE_HOLD`), `guideEffort`, `pendulumAt`, `pendulumEffort`, `jab`, `contact`, `timing.arc`, `timing.dip` and
   `timing.advance` (absent, so `handReach` alone sets the push's length). The couple a held plan needs is bounded by
   C = min(γ_T, g_B)·F_max·(r − b) (`gripCouple`); a plan past it is superhuman (§3.5, §4; the engine's `RangeError`
   from the downswing's plan is recorded as that class). Its share of C is `requiredCouple`'s peak over C.
2. **The edgy band** (user: "we could visualize the dimensions in some space … and then show which part, which area
   of the envelope is viable, which is a bit edgy, and which is unplayable"; chosen "Include, grid margin"). Every
   plan the map tries is graded in one of three bands:
   - **unplayable:** excluded, with its first reason (§3.5's classes);
   - **edgy:** admissible, but a neighbouring grid point one step away along any swept execution dimension (the lean,
     the feet, `drive`, `handReach`, `window`; on the pass roll the split; on §3.4's sweep `timing.hands`) is
     unplayable. The user's account of the edge: "if you play a shot on the edge of the envelope and you erroneously
     apply or go do something slightly erroneous, you'll push your shot out of the envelope and fault in some way,
     either missing the ball or damaging the lawn";
   - **viable:** admissible with every such neighbour admissible.

   The rules (the design's calls):
   - A neighbour is the grid's own point at the same range and lawn, its how hard solved as every grid point's is
     (§3.1), so grading needs no runs beyond the grid's. How hard is solved, not swept, and carries no margin.
   - Bands are graded on the coarse grid, its step in each dimension recorded in physical units; a refined point
     takes the band of the coarse cell it lies in, so refinement neither narrows the margin nor adds neighbour runs.
   - At an input's own bound (`drive` ±1, `handReach` 0, `MIN_WINDOW`, `MAX_WINDOW`) a neighbour past it does not
     exist and is skipped; past the lean's 45° it is unplayable (mishit). The lean, feet and split grids extend one
     coarse step beyond the span the builder grades, so every graded point has its neighbours.
   - A neighbour whose range cannot be reached, or whose plan the engine rejects (a stall, `MAX_FALL`, the couple
     past C), is unplayable, in §3.5's **unreachable** class (new) or its superhuman class.
   - A plan whose only failing neighbour leaves the type's region but stays admissible is viable: the edge is the
     envelope's, not the region's.

   §3.5's record carries each plan's band. §5's default stays the least-effort admissible plan (decision 5), its band
   recorded; where it is edgy, the least-effort viable plan is recorded beside it for the gate's ruling. §9's plots
   shade the bands on their regions; the full grading is queried from §3.5's record.
3. **3a's carried items, split** (chosen "Rolls in 3b, swing to 3c"). 3b keeps §8's bit-identical commits and §11's
   untouched swing strokes, and is a measuring step, so it takes only the items the map needs and that move nothing:
   - the couple's share of C (3a A2 item 3), recorded per plan beside §5's two effort percentages; whether it joins
     their mean is ruled at the gate (decision 5 unchanged until then);
   - the pass roll's braked impact-off-face (3a: 20 runs at drive −1, 8 at −0.5): whether the map's own pass-roll runs
     at those drives reproduce it, recorded.

   **P2b.2b.2c.3c, the swing strokes' hold and grips**, a new step after 3b, takes the rest:
   - the GC stop's head at 0.742 m/s at the impact's end;
   - a bounded roll damper on the hold, and a softer hold onset (the settle's `it.fails`);
   - the AC stop's two-branch step flip at the default gap;
   - the user's jab hypotheses (the weak lower grip lets the mallet die on rebound; a lower bottom hand gives the
     leverage to stop it, and whether min(γ_T, g_B) underrates that lever), and §7's AC stop's two grips, now its
     default hands together (1/0.1/0.717) beside the jab's per-shot grip (0.45, 0.1/0.1);
   - the ease at a push's end (3a A2 item 8; it moves every roll: user, at this design's review, "Move to 3c"), the
     rolls' defaults re-checked on it;
   - retiring `armMass`: inert only in `ratioFit`'s ratio, it is still the top grip's point mass in the swung body the
     downswing plans with (`track.ts`, `swungBody`), so it moves the planned strokes and `requiredCouple`;
   - the late re-hit measured on the integrated follow-through, where it disagrees with the planned path on the
     canonical drive (3a A3 item 6); 3b's criterion 5 stays judged on the planned path, as shipped;
   - the envelope cases off the map's space: the full roll at λ 0.5 leaving the face late (λ is held at 1 here), and
     the AC stop's pushed, braked and hit-through turf damage (3a A3 items 9, 15, 16), as seeds of a swing map.

   3b's outcomes record this split in the roadmap and move 3a's carried list to 3c's items.
4. **The ratchet** (§8): the baseline worktree at 3b's base on main; the preset digest drops no keys (3a's `slopeHold`
   and `mode` drop no longer needed).

**A3 (user, 2026-10-29, gate stage 1, on `docs/superpowers/probes/2026-10-29-p2b2b2c3b-stage1.txt`): the half roll's
map ruled; the build's readings.** The rulings, each the option the user chose:

1. **The anchor** ("Accept, edgy"). Today's half-roll default plays admissibly at its canonical 1.676 m on the 10 s
   lawn, ratio 2.199, inside 1.4–2.5; §3.3's test passes. Its band is edgy: its coarse cell's `handReach` 0.2 m
   corner is unlawful (29.1.6.1), the 0.1 m corner admissible. The canonical's range lies below the range grid's
   least, 2 m, and the anchor's `handReach` 0.15 m between the grid's values, so the anchor and its cell are read at
   that range from their own sweeps; an off-grid plan that is itself admissible takes its cell's worst corner, an
   unplayable corner counting as edgy.
2. **The lawns** ("Keep 6, 10, 14 s"). The lawn moves the ratio far more than §3.2 guessed: over the plans admissible
   on all three lawns the ratio's spread (max − min over mean) has median 7.1 %, 95th percentile 31 %, maximum 48 %,
   93 % of them above 2 %. The defaults stay keyed per lawn, nothing interpolated between lawns; the spread is a
   finding of the map.
3. **The half roll's region and least-effort path** ("Accept as found"). The least-effort plan up to 6.56 m has
   `handReach` 0 (no push: push effort 0 %) and is mostly edgy; viable plans are scarce, and the region thins by
   9.75 m and is empty from 14.5 m on the 6 and 10 s lawns. The default is the least-effort plan, edgy allowed, its
   viable runner-up recorded beside it (A2 item 2); the push-free path and the empty long ranges are checked at gate
   stage 2 against the full and pass rolls.
4. **The time budget** ("Accept the overrun"). Plan Task 5 took all three of decision 7's cuts (`window` 0.01, 0.02
   and 0.04 s; the lean's and the feet's graded k to ±1, beyond ±2; ten powers), and the map still projects at about
   65 CPU h, about 8 h wall on 8 shards against §12's 6 h. The full and pass rolls run on the thinned grid as is; no
   fourth cut.

The build's readings (the design's calls, made in plan Tasks 3–6 and recorded here):
- `mapSetup` and `maxPower` take an optional `CanonicalOptions` for the profile and stance only (a world or stroke in
  it throws). `maxPower` bisects [0, 1] when p = 1 fails (below 1 the couple need not rise with p) and is NaN when
  nothing plans; a NaN effort is never the default.
- The impact's own errors are the engine's, never a class: kept per sample, a bracket that holds one has no read, and
  a plan with an unread neighbour is left unbanded; the merge and stage reports count them (stage 1: 10 samples, all
  the handover's overlap rule, 8 of 30240 reads unread, 6 unbanded).
- A plan takes a beyond value in at most one dimension (a beyond value is only ever a neighbour).
- The pass roll's split 0° takes its +10° plan's read as its −10° neighbour (the stroke is mirror-symmetric in split).
- A grid end that is not an input's own bound (`handReach` 0.3 m, the thinned `window`'s 0.01 and 0.04 s) skips its
  neighbour and is flagged in the record's `edge` column.
- A range past the sweep's top played sample takes the first classed sample's class above it, else superhuman ("range
  beyond p_max": p = 2 is the body's limit at full intensity); unreachable is kept for a range below the least power's
  and for planStroke's other rejections.
- The default's tie-break is the half roll's anchor in follow-through (§5), on every type.
- The record carries each read's first reason, the split at rest and the edge flags; its header row has no `#`, the
  provenance lines above it do.

### A4. The full roll's pendulum push is swept (user, 2026-10-29)

The full roll's map came back with its region empty: at every range and lawn, no admissible plan has its ratio in
1.0–1.2. Up to 14.5 m there are 115 to 194 admissible plans per range and lawn, but every one sends the croqueted ball
well over 1.2 times the striker's distance. Today's full roll default is turf at its canonical range when played, with
ratio 1.843, and its read is a mishit with ratio 1.954. Decision 7 held each type's `speedGain` and `handGain` at its
preset, so the map never tried the push that put the full roll in band before. That push is P2b.2b.2c.2d's checks,
I.1: the full roll with the pass roll's pendulum push (`speedGain` 0.5 over 15 ms, `handGain` 0.1), with ratios
1.11–1.22 at 2–4 m/s. The full roll's preset has `speedGain` 0.1, and drive's span −1…1 only scales it, so a push
that strong lay outside the grid. The user's account of the stroke ("the same as the half roll, but you give it some
follow through and a smooth, maybe slightly accelerating push") is that push.

Ruling ("Sweep speedGain too"):
1. The full roll's grid gains `speedGain` as an axis: 0.1 (the preset), 0.25, 0.5 (I.1's variant) and 1, graded, none
   beyond. It is a neighbour dimension on the full roll only. Its bound is 0, so 0.1 and 1 are grid edges, flagged as
   such. `handGain` stays at the preset's 0.1, which is the variant's too. The `window` axis already sets the hands'
   window with the pendulum's.
2. The half and pass rolls keep their preset `speedGain` (0.1 and 0.5) as a single value, so their plans and bands are
   unchanged. The axis is outermost in the plan order, so the full roll's 1260 plans swept before A4 keep their
   indices and only the 3780 new ones are played. The shard lines from before A4 gain the preset's `speedGain`, which
   is what they played. The half roll's re-merge after that reproduces its stage-1 tallies exactly.
3. The record gains a `speedGain` column, and the default's tie-break gains `speedGain` over its span, 1.
4. This supersedes decision 7's "the preset's `speedGain`" for the full roll only. The pass roll's map uses the push
   that is already its preset, so it has not been shown to share the full roll's gap. If its region also comes back
   empty or thin, the same axis is the remedy, ruled at gate 2.

### A5. What "multiples further" means on the pass roll (user, 2026-10-30)

The super tally (§3.4) read "multiples further" as a ratio below `MULTIPLES_RATIO` 0.5. The user's calibration:

1. **The take-off is not a pass roll.** When the croqueted ball is to go nowhere and the striker's ball a long way, the
   player plays a take-off; its ratio near 0 comes from a thin contact at a wide split, not from the roll.
2. **The pass roll is the hard case.** It sends the croqueted ball some distance, such as halfway, and the striker's
   ball all the way: a ratio near 0.5 is a very difficult shot. "Getting the striker ball to go anywhere near twice as
   far as the croquet ball would be a very impressive shot."
3. **The super test, read so.** §3.4 asks whether the late, sharp push lowers the pass roll's ratio admissibly below
   what the map's plans reach at the same split and lawn. A ratio of 0.5 is the shot's exceptional end, not the bar
   it must clear; `MULTIPLES_RATIO` stays as the report's marker for that end, and the threshold itself is for gate 2.

The super tally's finding, recorded for gate 2: none of its 80 plans plays admissibly on any lawn at any split. The
least ratios, of any class, are 1.008–1.072 at 0°, 0.527–0.721 at 10°, 0.753–0.902 at 20° and 0.655–0.784 at 30°.
The 0.527 play is unlawful (29.1.6.1: a re-contact 17 mm after parting), and the rest are turf, mishits off the face
with re-contacts at p 0.1–0.2, and superhuman reads at higher powers. Why the follow-through yields the turf (the
planned path, the hands' guiding, or the yield threshold against "rub, not damage") is not settled by the map; the
side-on swing viewer, the phase after 3b, is to show it.

### A6. The head travels parallel to the turf (gate 2, user, 2026-10-31)

Gate 2 asked why the rolls' follow-throughs yield the turf. The user's reading was that the mallet head's path must be
wrong, and a side-on trace (`scripts/pathTrace.ts`; `docs/superpowers/probes/2026-10-31-path-trace*`) tested it on
today's full roll, an in-band full roll at speedGain 0.5 and today's pass roll:

1. **The planned path stays clear of the turf.** Its lowest point after contact is 30.9 mm, 10.4 mm and 31.2 mm.
2. **The played head leaves it.** Through the impact the head lags and the shaft tilts back (31° to 43.5° on the full
   roll, against the plan's 29°), and the head rises, to 115 mm on the full roll. The hands stop at once at the push
   length and the arms' hold relaxes from the first departure, so the mallet then swings through vertical as a free
   pendulum and yields the turf at the bottom of that swing: −3.4 mm at 350 ms, −1.5 mm at 252 ms and −3.8 mm at
   374 ms after first contact. None of the three yields the turf during the impact.

The ruling:

1. **The player's intent is the head, not the hand.** The head travels on a path parallel to the turf, through the
   contact and the push alike. The top hand moves however keeping it there needs: a shallow, possibly flattened arc
   whose travel along aim is the push's length, and whose dip and rise come from the shaft's flex and the head's angle
   as the player adjusts.
2. **The hand eases out and keeps its hold.** It no longer stops at once at the push length, and its hold no longer
   relaxes once the balls have gone.
3. **This changes every stroke with a push**, so the maps of Tasks 6–8 are re-run once the change is in; the gate's
   other items wait for those maps. How the intent is realised (what height counts as level, which of the hand's arc
   and the head's angle is planned and which follows, and how the hold's effort counts against the superhuman class)
   is settled one question at a time and recorded here.
4. **What is planned (user, 2026-10-31).** Most of it is planned: the strokes are too quick for the player to adjust
   as they go. Only on a slow push is there time to adjust; on a harder shot the player plays through what was planned.
   So the plan sets the hand's whole path, its travel along aim from the push length and its dip and rise, as the
   path that keeps the head level against the load the player expects, the head tilting back and recovering.
   That expectation includes some flex in contact, more on a harder shot: the planned path anticipates it, so the
   head played through the flex stays in the band, rather than the plan being a rigid path the flex then bends away.
   Corrections from what the player feels arrive only after a reaction delay, so they shape slow pushes alone. Level
   is the head's lowest point at first contact (an assumption). Holding it beyond a player's strength reads
   superhuman. (Supersedes an earlier reading of this item, in which the plan set only the travel along aim and the
   hand's height followed by feedback.)
5. **The finish (user, 2026-10-31).** Once the push is done the stroke may finish with a flick, or with the head
   carrying on along its arc, especially in the push shot. Either way the head leaves the turf rather than swinging
   down into it.
6. **Level within bounds (user, 2026-10-31).** The hand's dip and rise is tied to any change in the mallet's lean, and to
   the player it all happens in a flash. The path is never perfect: it wanders within bounds, and the bound is what
   keeps the face in contact with the ball, or, once the ball has gone, on the path that would keep that contact. So
   level is a band, not a line: no new constant, since the band is set by the face's own reach about the ball's
   contact (during contact the existing impact-off-face read is that test). The planned path aims to keep the head in
   the band; the hands do not hold it rigidly, and correct its drift only after the reaction delay of item 4.
7. **The finish is one arc (user, 2026-10-31).** A flick is not a second finish: it is the same continuation of the
   head's arc once contact ends, accelerating. So there is no new input. The finish carries the head on along its arc,
   and how hard it accelerates there comes from the existing after-first-contact input (accelerate or brake); a flick
   is that arc at the accelerating end.

What A6 supersedes in the engine, as built (`src/engine/impact/track.ts`): the push's pendulum phase (P2b.2b.2b.2b
design §4.2), from pendulumAt·handReach on, in which the push intent is nil and the mallet swings free; the arms' hold
relaxing from the first departure (gate round 13 ruling, "Relax from first departure", 2026-10-12; `holdWeight`); and
the hands stopping at once at the push length (`carryPivot`). Each is a ruling of an earlier phase, so the change is an
engine phase of its own, specified and planned before the maps are re-run.

The sequence (user, 2026-10-31): 3b pauses at gate 2. The level head is specified, planned and built as its own phase,
P2b.2b.2c.3b.1 (3c being the swing strokes' hold and grips, A2; on this branch, an assumption;
`2026-10-31-p2b2b2c3b1-level-head-design.md`), the maps of Tasks 6–8 are re-run on it (the half roll has a push too),
and gate 2 then resumes.

### A7. The envelope covers every shot (user, 2026-11-02; spec review applied)

The user: "Now that we now have a unified shot model we need to do the envelope for all the types of shot including the
drive and the AC stop." Asked whether the shots must work "from a fast lawn tap all the way up to a slow full lawn", the
answer was yes: every fit so far (shapes design §8, rulings 14–19) was made at one power, about 3 m/s at contact, on
the 10 s lawn. Then: "Ultimately, then, the player will be able to achieve the range of ratios across any shot to
anywhere on the lawn. And we'll have the types of shot, but they're all variations on a different way to hold the mallet
and do the stroke using a unified shot model"; "Ultimately we need to be able to do somewhere between a half roll and a
full roll or somewhere between a drive and a half roll or all the other inbetweens."

1. **The types.** The map runs for the drive, the AC stop, the half, full and pass rolls and the single-ball stroke,
   each from its text book set-up (shapes design §8). The GC stop is left out (user, 2026-11-02: "Single ball in. GC
   Stop is similar to a rush anyway"): its outcome is the target ball reached across a gap, which the map does not
   measure, and its distances are out of scope (§Scope).
2. **One continuum, the types named on it.** The map's outcome is the pair (range, ratio) over the whole plan space,
   not a region per type. Every admissible plan counts wherever its ratio falls, whichever type's text book it was
   swept from: a plan swept from the half roll's that lands at 1.3 is an in-between shot, not a failed half roll. The
   bands are labels drawn over the continuum: the rolls' (§2), the drive's 3.0–4.0 and the AC stop's 4.1–6.2 (the
   CA's, given in the notes of `reference/swing.json`'s `ratioTargets` beside Gugan 5's targets for his mallet). The
   gaps between them (1.2–1.4, 2.5–3.0, 4.0–4.1) are outcomes like any other. At each range and lawn the envelope
   answers which ratios are reachable admissibly, and by which plans. The single-ball stroke has no croqueted ball: its
   envelope is the admissible plans at each range.
3. **The player's inputs** (user, 2026-11-02): "The player adjusts the hand position (lean), the foot position (arc
   bottom relative to ball), the swing power or effort, the push length, the punch/acceleration or flick." They replace
   §3.1's list and A2 item 1's:
   - the lean (`lean`) and the feet (`feet`), swept;
   - the swing's power or effort: how hard (`backswing`, `intensity`), solved for the range as §3.1 solves it, within
     the body's limit on every type, a hands-led stroke's pace from the arms' assist (item 14);
   - the push length (`handReach`), swept;
   - the punch or acceleration: `drive` and `window` through contact, swept. The flick is not built (item 13).
   How the mallet is held on the handle (the hands' places and grips) is the type's: the type is that hold. Every
   swept input runs its full span on every type, so a stop with a push, or one hit through, is an in-between shot;
   each type's text book values lie on its grid. The full roll's `speedGain` axis (A4) stays the full roll's alone;
   the AC stop's `jab` is held at the type's (at 3 m/s it moved no ratio, shapes design §8).
4. **The hold's firmness is the model's, not the player's** (user, 2026-11-02: "The model should find the hold
   firmness that works but this is not chosen by the player, it is anticipated sub conciously based on the other
   inputs"). For each plan the model finds the firmness (`holdFirmness`, [0, 1]; shapes ruling 15) the player would
   anticipate: the least at which the plan plays admissibly (the design's call: the least grip that works). A plan no
   firmness makes admissible fails, with the first reason of its play at full firmness. At each text book the found
   firmness is recorded beside the fitted one (the half roll's 0.1). `followThrough`'s carry (shapes ruling 14) is
   held at the type's (item 13).
5. **The range.** The striker's ball's distance to rest, from a tap of 0.25 m to a full court length, 32 m (the
   design's call for the least range); the builder sets the spacing, denser at the short end, and adds powers below
   `POWERS`'s 0.1 (`scripts/pushMapGrid.ts`) to reach it. The lawns stay 6, 10 and 14 s (A3 item 2), so the grid's
   corners are the user's: a tap on the fast lawn and a full court length on the slow one. A cell in which either ball
   would pass a court length is recorded as off the court and not solved (at the stop's 5.9 a 32 m striker's ball
   would send the croqueted ball about 190 m).
6. **The split** (§3.2), re-based on shapes ruling 17, where the pass roll's ratio moves almost wholly within 0–10°: at
   least 0°, 2°, 4°, 6°, 8°, 10°, 20° and 30°. It is a swept input from the pass roll's text book, and the pass roll's
   defaults stay keyed by it (§5).
7. **The map records; the text books are revisited on what it finds** (user, 2026-11-02: "Record and revisit, based
   on what we find, we might find low effort options that get us close to Gugan"). No type's profile values change
   from the map itself: each keeps the shapes phase's fit (half roll 2.0, full roll 1.161, pass roll 0.859, drive
   3.925, AC stop 5.86). At gate stage 2 each text book is set beside the map's least-effort plans near its targets
   (Gugan's where he measured one: the drive's 4.23, the AC stop's 7.15, the pass roll's 0.83) and the user rules
   whether to move it; a moved text book is a change of its own, with its version. §5's canonical-range rule and its profile changes are superseded, and §11's
   untouched swing strokes holds for every type's text book. Each band's least-effort plan per range and lawn
   (decision 5) is recorded as reference data with the text book it was swept from; the in-between ratios are read
   from §3.5's record and §9's plots over (range, ratio), at a bin width set at read-out and no finer than item 9's
   bound. No table per bin is built.
8. **Restated.** A6 items 4–7 (the planned hand path and the free finish) are replaced by the shapes phase as built
   (ruling 14: the top hand stops, the bottom hand carries, the mallet is never let go). A2 item 2's last rule reads
   "edges are the envelope's alone": no plan's band depends on a region. A3's tie-break is the plan nearer its own
   text book in follow-through. A4 item 2's "the pass roll's preset `speedGain` 0.5" is now 0.1 (shapes ruling 17).
   §3.3's anchor is every type's: each text book lands in its band at its canonical setup (the drive 3.925, the AC
   stop 5.86, the half roll 2.0 today), and the step stops at the gate if one does not.
9. **The ratio's jumpiness.** Neighbouring follow-through settings on the full and pass rolls give ratios up to 0.3
   apart (shapes rulings 16–17; the practice passes suspected). The graded bands read a plan's neighbours, so the
   bound on neighbouring settings, and the practice passes' share of it, is measured before the map and recorded
   beside every band. Its cause is a carried item unless the bound exceeds the grid's step, when it is found first.
10. **Exit criteria and the gate** (§1, §6, §10), restated. Criterion 1: the map over the six types. Criterion 4: each
    text book within its band and within ±2 % of its planned contact speed. Criterion 7: `ENGINE_VERSION` moves to the
    next minor after 0.28.0 with the body's limit, the assist and the found firmness (item 14). §6 item 2 keeps its within-type slice test; the ordering
    across maps is superseded (on one continuum it holds by construction), and item 3 reads "which ratios each range
    reaches". Gate stage 1 is each text book alone swept over range and lawn (none of the other axes), with item 9's
    bound and the found firmness at the text books; stage 2 is the full map.
11. **The time budget** (§12, A3 item 4). The three rolls projected at about 65 CPU h on the thinned grid; three more
    types, the short ranges and the firmness solve (a bisection per plan) multiply it several times. The builder
    thins as A3 item 4 did, records the cuts, and asks before a cut that drops a type, a lawn or the tap's end of the
    range. The map runs on GitHub Actions (user, 2026-11-02: "Yes, add it"): the repository is public, so standard
    hosted runners are free and unmetered, 4 vCPUs each, 20 jobs at once on the Free plan, each job at most 6 h and a
    matrix at most 256 jobs (GitHub's Actions limits, https://docs.github.com/en/actions/reference/limits, read
    2026-11-02). A manually dispatched workflow runs the map's shards as a matrix, each shard sized to finish inside
    6 h, uploads each shard's output as an artifact, and a last job merges them into §3.5's record; the record keeps
    the run's URL and commit. Every figure the map is compared against (the ratchet's baselines, gate stage 1's
    text books) is run on the same runners, never compared across machines.
12. **The sequence.** The shapes phase (P2b.2b.2c.3b.1) closes at its gate 2 and merges first. The body's limit
    on the backswing, the assist and the found firmness (item 14) are then specified, planned and built as their own phase
    (`2026-11-03-p2b2b2c3b2-firmness-design.md`), the maps' plan is amended for the new
    types and inputs, and gate stage 1 runs before the full map. The side-on swing viewer stays the phase after.
13. **No flick** (user, 2026-11-03, on whether the flick is still needed now the shapes are right: "It is simply the
    amount or arcing acceleration as the ball leaves contact"). Once the ball has left the face the head cannot change
    its speed or the ratio, so a flick reaches no range and no ratio that the stroke before it does not. What reaches
    a longer range is the swing's speed (backswing and effort) and the punch while the ball is still on
    the face (`drive`, `window`). The finish the flick would shape is ruling 14's, the head carried on along its arc
    and clear of the turf, already every stroke's. Its one bearing on the outcome is a follow-through that meets the
    ball again, a fault, and that is `followThrough`'s carry, held at the type's. So the flick is not built, and the
    level-head B1 ruling 9's flick, which the shapes design §1 left to this phase, is closed.
14. **The body's limit, and the assist from the arms' strength** (user, 2026-11-03). A probe on engine 0.28.0
    (`docs/superpowers/probes/2026-11-03-p2b2b2c3b2-reach.txt`) found the rolls' power unphysical: h_body divides by
    pendulumShare, so the full roll's is 2.77 m, 19 m/s at power 1. The phase adds a body limit on the backswing's
    height on every type (0.48 m, θ_max's own knee-height figure), so that power, and the superhuman class, mean the
    same on every type. Within it the rolls meet the ball at about 6.6 m/s at most, their fast tempo a placeholder, and
    the full roll's croqueted ball runs about 15 m on the 10 s lawn; asked with those figures, the user chose to build
    the assist (a rescope that would have dropped it rested on the drive's speed alone). The assist is the arms'
    strength driving a hands-led downswing, a force–velocity law in place of `handTempo.fast`; ruling 7's assist in
    the finish moves neither ball (item 13) and is not built.

### A8. Gate stage 1's rulings (user, 2026-11-05)

1. **The AC stop has no built-in dip** (engine 0.30.0). The user: "For a soft shot the player has the control and
   strength the 'stop the mallet. dead' without the assistance of lawn friction"; a harder stop is where the player adds
   a little jab, and the hardest that doesn't break the turf. The preset's fixed 11 mm `handDrop` (a user decision of
   2026-10-05) was the same action as `stroke.jab`, built in at every power. At stage 1 it left no admissible stop: it
   struck the turf on soft shots and slipped the hands from p 0.5. Without it stage 1's replay finds every power to p 1
   admissible on all three lawns, the canonical ratio 5.861 (was 5.862) and its range unchanged, and Gugan 5's stop
   stays in its band (6.69 at 1 mm, 7.31 at gap 0). The jab stays the shot's own input, held at the type's (A7 item 3).
2. **The AC stop's hold stays the type's for this map; its variants go to P2b.2b.2c.3c** (A2 item 3), so the stop's
   envelope ends near p 1, about 5.4 m of croqueted ball on the 10 s lawn. The evidence
   (`docs/superpowers/probes/2026-11-05-p2b2b2c3b-stop-holds.txt`, the 10 s lawn, p 0.94 and up) supports the user's
   lever hypothesis: lowering the bottom hand to 0.45 m stops the head in about 35 ms (129 ms hands together at p 1) and
   nearly halves the peak hand force; relaxing both grips cuts that force about 2.5 times further and leaves the stop's
   time alone, and only the lowered, relaxed hold keeps within the grip limit to p 1.5. The jab rescues no hand, and
   adds to the hands' load on some holds; it helps most where the hands alone stop slowly (hands together, relaxed, p
   1.05: 151 to 77 ms at 5 mm). 5 mm is usually the hardest on the depths tried (0, 3, 5, 8 mm) that keeps the turf
   whole. For 3c: whether a slack hold's fast stop is the lever or a flaw of the model, the 32 m stop at p 1.5, the slip
   at the moment the check gives way to the hold, the soft shots at these holds, and the ratio's jump between its two
   branches as the hold changes.
3. **The map records both holds.** Every sample is played at the least hold that plays (A7 item 4) and at the type's
   fitted hold, each with its own reads, and the found hold's reads carry its firmness. The least hold alone would not
   say what the text book's own hold does: at the full roll's canonical stroke the least hold gives a ratio of 1.673,
   outside its band, and the fitted one 1.161. Which of the two a shot's default should use is for gate stage 2.
4. **The grid gains p 1.05 and p 1.1,** making 14 powers. Above p 1 the backswing is at the body's limit and the
   intensity takes over, so the distance climbs fastest there: the AC stop's striker's ball goes from 1.06 m at p 1 to
   3.30 m at p 1.25 on the 10 s lawn, about 3.5 steps of the range grid. With 1.71 m at p 1.05 and 2.01 m at p 1.1, no
   bracket there spans more than about 1.5 steps.
5. **A slip after the balls have gone is recorded, not ruled out** (amends §3.5's "a saturated grip" and plan decision
   5). `follow-grip-limit` comes after the impact, so it cannot affect the balls, and the fault judge doesn't read grip,
   so the shot is legal; the map admits it and marks the play `followSlip`. A slip during the impact (`grip-limit`) can
   affect the balls and stays superhuman. The found hold is the least that plays without slipping, falling back to the
   least that plays where no hold keeps it from slipping (user, 2026-11-05): a player grips firmly enough not to lose
   the mallet if they can. Taking the least that plays regardless raised the full roll's jumpiness bound from 0.402 to
   1.273, as the search stopped at slack holds that slip (at drive −1, reach 0.1 m, window 20 ms, σ 0.025 and ratio 2.32
   where σ 0.1 had read 1.28).
