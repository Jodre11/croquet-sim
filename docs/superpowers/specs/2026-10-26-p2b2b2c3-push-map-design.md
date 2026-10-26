# P2b.2b.2c.3 — The Rolls' Push Map: Design

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
7. **Each roll type keeps its own stance** ("Own stance per type (Recommended)"): three maps, each under its own type's
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
2. the defaults per roll type, range and lawn speed (§5) are picked by decision 5 and readable by the engine's callers;
3. the checks of §6 are run, recorded and ruled at the gate;
4. the half roll's canonical setup stays within 1.4–2.5, every roll's canonical setup within ±2 % of its own planned
   contact speed (§5), and every swing preset's within ±2 % of 3 m/s;
5. no run of any preset's late re-hit sweep ends with the head overlapping a ball as handed over;
6. the ratchet (§8) and the pre-flight gate (§10) are run and ruled;
7. the figures are recorded in the roadmap's "P2b.2b.2c.3 outcomes", and `ENGINE_VERSION` moves to 0.18.0 if any default
   changes, as the branch's last step.

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

A roll is played in carry mode. The plan is the shot's own inputs, all already in `ShotSetup.stroke` (no new engine
input is planned; §12 if the builder finds one is needed):

- **how hard:** `backswing` and `intensity` (the carry mode's hands' tempo, `handTempo`, slow at 0 to fast at 1);
- **how much follow-through:** `drive` (0 natural … +1 pushed through) and `handReach` (the push's length);
- **how sharp:** `window` (the pulse's duration, `MIN_WINDOW` 1 ms to `MAX_WINDOW` 0.1 s; shorter is a higher peak
  acceleration);
- **when:** `timing.hands` (the hands' onset; positive is late), used for the super pass roll (§3.4);
- **the split** (pass roll only): set as the croqueted ball's offset from a fixed aim, as P2b.2b.2c.2d's checks set it;
  the split at rest (the angle between the two balls' paths) is recorded beside it, and account 7's test reads the
  split at rest (the design's call).

Each grid point fixes the follow-through (drive, handReach, window, onset) and solves how hard (backswing, then
intensity once the backswing reaches the body's limit, matching P2b.2b.2c.1's rule that speeds beyond the gravity-only
default are reached by intensity) so that the striker's ball comes to rest at the grid's range. The solved plan's
ratio, effort and believability are recorded.

### 3.2 The grids (the design's call)

- **Range:** the striker's ball's distance to rest. From short rolls to a full court length, 32 m; the builder sets the
  spacing (at least six ranges, denser where regions change).
- **Lawn speed:** 6, 8, 10, 12 and 14 s, `reference/lawn.json`'s sourced span, 10 s the normal lawn. The design's guess,
  to be measured: once both balls roll, the lawn slows them alike, so the ratio depends little on lawn speed and the
  lawn mainly moves which range needs which power. If that holds at 10 s and at the ends, the builder may thin the
  middle lawns.
- **Split** (pass roll): at least 0°, 10°, 20° and 30°.
- **Follow-through:** drive, handReach and window over their valid ranges, coarse first and refined where a region's
  edge or the least-effort plan lies.
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

## 4. Believability (admissibility)

A plan is admissible when its run:

- raises no `impact-head-deep`, `turf-yield`, `follow-turf-yield` or `follow-head-deep` (decision 6);
- raises no possible 29.1.6.1 (a re-contact after the parting at or above `EFFECT_SPEED` or `EFFECT_ANGLE`);
- keeps the head behind the striker's ball: never overtaking it and dropping into its path (the roadmap's
  P2b.2b.2c.3 entry; the on-point test of P2b.2b.2b.2b: the head's centre behind the ball's along aim, every face
  contact no higher than R·sin 45° above the ball's centre, the lean at most 45°);
- does not exceed the grip limit, and needs intensity ≤ 1 and the backswing within the body's limit.

A push intent that saturates at `pushForce` is admissible at 100 % push effort; how often defaults saturate is recorded
(carried item L).

## 5. The defaults

For each roll type, range and lawn speed in the grids, the default plan is the admissible plan in that type's region
with the lowest mean of its two effort percentages (decision 5); ties go to the plan nearer the half roll's anchor in
follow-through. The table of defaults is reference data, its provenance the map's run (derived), with its script and
commands recorded. For the rolls it replaces `DRIVE[type]`'s follow-through and `DEFAULT_DRIVE` (the design's call);
the swing strokes' entries are untouched. How callers read it (a lookup by type, range and lawn speed, interpolated or
nearest) is the builder's (§12). Each roll's canonical setup takes the whole default plan (how hard and the
follow-through) at the range its current canonical reaches on a 10 s lawn, so the canonical runs a plan the map ran
(the design's call); its planned contact speed follows from that plan.

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
- The roadmap's "P2b.2b.2c.3 outcomes" with the figures, the gate's rulings verbatim, and the carried open items.

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
- The form of the defaults' lookup and where the table lives.
- The plots' form.
- Whether the map runs within the project's time budget; if a full grid is too slow, a coarser grid with the reasons
  recorded.

## Amendments

(none yet)
