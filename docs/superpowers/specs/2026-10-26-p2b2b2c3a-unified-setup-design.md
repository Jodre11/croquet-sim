# P2b.2b.2c.3a — The Unified Set-Up: Design

Brainstormed 2026-10-26, split from P2b.2b.2c.3 (the push map's design,
`specs/2026-10-26-p2b2b2c3-push-map-design.md`, amendment A1, now P2b.2b.2c.3b, which follows this step). Every
statement attributed to the user is theirs; the rest is the design's call or left to the builder (§9). The user's
quotes were dictated; transcription slips are corrected.

## Intent

The user: "When a player sets up a shot they do a number of things in a rough order. … 1. Hand Position on the mallet,
effecting the angle of attack of the mallet face. 2. Feet position relative to the strikers ball, affecting where in the
arc contact will be made. 3a. Power and acceleration of the strike. 3b. Magnitude and acceleration of the push through.
3c. Magnitude and (de/ac)celeration after initial contact. I feel like these all apply to every shot and the relative
set up of these define what the shot type is."

Today the engine does the opposite: a stroke type is a preset, and each preset is locked to a **mode**, swing
(single-ball, drive, the stops) or carry (the rolls), which chooses different physics in the downswing, after contact
and in the hands. A stop cannot push through and a roll cannot brake. This step removes the split: one stroke model,
every set-up input available on every stroke, each stroke type only its "text book" defaults. It is the project's
unified-shot-model goal (every shot type from its inputs alone, nothing scripted) applied to the set-up.

## The user's account (2026-10-26)

1. **Grip and lean.** "a stance is really a definition of how the mallet is held which affects the 'lean', in practice
   different players do this in different ways but it is the lean that changes." "depending on the situation, sometimes
   some value in between would be selected."
2. **The feet.** "same is true for foot position, the defaults for a 'text book' example of that shot change."
3. **The text book grips.** "for a drive and stop, both hands would be together at the top of the shaft" ("together in
   that they are touching or close to touching but they both grip the shaft independently, one hand above the other");
   "for a half roll, the top hand would be at the top of mallet shaft, the bottom hand at the middle of the shaft"; "for
   a full/pass roll, the top hand at the middle of the mallet, the bottom hand at bottom of the shaft" ("the bottom
   hand's finger is normally extended, which raises it slightly up the shaft and yes Riches is correct in that the top
   hand may be higher than middle shaft"). "Between a drive and a half roll only the bottom hand moves."
4. **Riches is the text book, and it varies.** "Go with Riches but my point is, it varies from grip to player to
   mallet. Then in a game varies between strokes."
5. **The envelope, later.** "We still need to validate our model against the text book but, eventually, all the above
   need to be an envelope of valid combinations."
6. **Near-identity.** "Near-identical is fine if the gate rules on it."
7. **The split grip is a beginner's fault.** Told the engine's drive holds the bottom hand a third of the way down and
   the AC stop at the middle: "that's something we intentionally have to coach new players not to do as it really
   affects their ability to vary their ratios. They imagine that holding the mallet is like holding a sledgehammer,
   which is not the case. It's very much about using the natural pendulum swing."
8. **The exceptions.** "for a normal drive and stop, the hands are in the position as described. But there are special
   cases …: The GC stop shot where the mallet is held level with one hand at the top and one hand in the middle. So
   it's held like half roll but without the lean. This gives the player the leverage to stop the swing and achieve the
   jab more accurately." And the jump shot, "where the ball is intentionally played downward into the ground with
   enough force for the elastic force of the lawn to make the ball jump forward. Here the hands are together but they
   often move somewhat down the mallet with the feet further forward and this creates the angle of attack but without
   the hands having to come down the mallet so enough force can be applied but the hit is more like … a half roll but
   hard and without any push."
9. **The AC stop varies.** "some players when playing the stop shot, the AC stop shot, do put the bottom hand down a
   bit to allow them to jab or to reduce the follow through of the swing at the same time as using the Gugan's jab to
   stop the ball, the mallet on the ground. Once again it varies."

## Decisions (user, 2026-10-26)

1. **Every set-up input applies to every stroke**, continuous, per shot: the grip (where each hand holds the shaft),
   the lean, the feet, the strike, the push through and what follows first contact.
2. **No mode.** `StrokeMode` and every branch on it go; how far the mallet swings from the hands or is carried by them
   follows from the set-up.
3. **Text book defaults from Riches** (Gugan 4 Table 6 for the rolls' leans, as now). The drive takes Riches's
   "both hands at the top of the handle" (stop shot; `reference/sources/README.md`), the bottom hand just below the
   top, in this step ("Move in 3a (Recommended)"): under §4.1 a split grip would fight the pendulum, so hands-together
   is what keeps it near today's free swing (account 7). The AC stop keeps its lowered, loose grip as the jab variant
   (account 9; "Go with 1 as recommended but keep a memory of it because it may prove useful to vary that bottom hand
   in the AC stop depending on the outcomes"): it fits Gugan 5's jab stop, and its grips (0.1 / 0.1) are too loose to
   fight the pendulum. P2b.2b.2c.3b plays a hands-together AC stop beside it. The GC stop keeps its half-roll grip
   without the lean, top hand at the top and bottom hand at the middle (account 8), as it is now. Single-ball is
   unchanged. The half, full and pass rolls keep their current Riches grips. What the drive's move breaks (its
   `guideEffort` 0.75, ruled re-contact-free) is re-checked and re-tuned in this step, ruled at the gate.
4. **Near-identical, ruled at the gate.** Where the unified model cannot reproduce a preset to the bit, the change is
   measured, listed per run and ruled.

## 1. Goal and exit criteria

1. `StrokeMode` is gone from the engine's types and code; no physics path branches on a stroke type or a mode. The dip
   raise (`buildContact.ts`, today `CROQUET_STROKES.includes(type)`) reads whether a croqueted ball is given. `shot.ts`'s
   validation (a croqueted ball exactly when the type is a croquet stroke) and the fault context stay keyed on the type:
   they classify the stroke under the Laws, not its physics (spec review).
2. The set-up inputs (§2) are fields of `ShotSetup.stroke`, each optional, validated with a named error; absent, the
   type's text book default and today's path.
3. Every preset at its current values (before the drive's grip moves) is bit-identical, or its departure is measured
   per run, listed and ruled at the gate (decision 4).
4. The drive's grip moves to Riches's (decision 3) as its own commit, every moved run counted, and the drive's
   re-contact-free guide re-checked and, if broken, re-tuned, ruled. The AC stop's Gugan 5 stop (band 6.55–7.75) and
   no-damage stance are re-checked after §4.1.
5. The cross-mode inputs work: a stop or drive with a push through, a roll braked after first contact, each played end
   to end with no guard hit, as analytic or constructed cases.
6. Every preset's canonical setup runs from top to finish, each default planning 3 m/s within ±2 %; no run of the late
   re-hit sweep ends with the head overlapping a ball as handed over.
7. The ratchet (§6) and the pre-flight gate (§7) are run and ruled; the figures recorded in the roadmap's
   "P2b.2b.2c.3a outcomes"; `ENGINE_VERSION` 0.18.0 as the branch's last step. 3a is its own branch and PR, merged
   before P2b.2b.2c.3b starts (3b then sets 0.19.0).
8. **The public types** (`engine/index.ts` exports `StrokeMode`, `SwingArc`, `SwingDrive`, `SwingShape`): `StrokeMode`
   and the `mode` fields of `SwingArc` and `SwingDrive` are removed; the fields documented "carry only" or "swing only"
   (`holdWindow`, `pendulumAt`, `pendulumEffort`, `handArcRadius`, `handArcLow`, `advance`, `guideEffort`) apply to
   every stroke, their docs rewritten; a hand-built arc is valid on any stroke with no mode. The tests and scripts that
   build arcs or profiles with a mode migrate in the same commits.

## 2. The set-up inputs

| The user's | The engine today | After this step |
|---|---|---|
| 1. Grip | `profile.stance[type]`: `top`, `bottom`, `gripTension`, `bottomGrip` | per-shot `stroke.grip` (the four, each overridable alone), default the type's |
| 1. Lean | follows from `handsAhead` and the grips at the shot's `contact.up` (`stanceLean`) | per-shot `stroke.lean` (at most 45°, the on-point limit); given, it sets `handsAhead` (`handsAheadFor`); absent, today's path |
| 2. Feet | `handArcLow` × the push length, from the hands at contact | per-shot `stroke.feet` (§3); given, it places the hands' arc; absent, today's `handArcLow` path |
| 3a. Strike | `backswing`, `intensity`, `timing` | unchanged, on every stroke |
| 3b. Push through | the rolls' push intent, hands' arc and hold; the swing strokes' advance (`timing.advance`) and reach; `handReach` and `handGain` on every stroke (0 on the swing presets) | one mechanism on every stroke (the design's call): the hands' travel along aim with the push intent behind it; the advance is merged into it, not kept beside it |
| 3c. After first contact | `drive`, `window`, `guideEffort`, `pendulumAt`, `pendulumEffort` | unchanged in meaning, on every stroke |

The names are the design's proposal; the builder may refine them.

**Given or absent** (spec review): a set-up input given on a shot takes effect; absent, the type's default runs through
today's code path, so no default changes meaning. A shot whose `contact.up` differs from its preset's and gives no lean
keeps `handsAhead`, as today; one that gives a lean keeps it. No sweep moves by this.

## 3. The feet (to be verified)

The design's reading, not yet checked against the code: in a pendulum about a fixed top hand the shaft's angle at
contact is both the lean and the place on the arc, so the feet cannot be separated from the lean there. They separate
once the hands move: the feet set where the hands' own path bottoms out relative to the ball, so whether the head is
still descending, level or rising when it meets the ball. Carry mode's hands' arc (`handArcRadius`, `handArcLow`: a
circle about a standing player's shoulder height, lowest a fraction of the push ahead of contact) is that already, for
the rolls alone. The proposal: `stroke.feet` is where the hands' arc bottoms out, measured along aim from the striker's
ball (the user: "Feet position relative to the strikers ball"; the design's call), on every stroke, held fixed when the
push length or the lean changes. Absent, today's `handArcLow` path runs unchanged (spec review), so the defaults are
bit-exact and the feet need no default expressed from the ball. `stroke.feet` supersedes `handArcLow` on a shot that
gives it; `handArcLow` and `handArcRadius` stay in `SwingDrive` as the defaults' path. The builder verifies the reading
at the gate's stage 1.

Caveats from the builder check (checked against the code): today the arc's low point is `handArcLow` × the push length,
measured from the hands' planned position at contact, not from the ball (`track.ts`, `arcArrival` in
`buildContact.ts`); before contact only the arc's slope at contact is matched, through a Hermite tangent that scales
with the hands' backswing travel and is zero when the top hand is still; and the swing strokes' hands rest after
contact or advance level, so the feet change nothing on a swing stroke until the push moves the hands.

## 4. The mode's branches, and what governs each

Every place the engine branches on the mode, and the design's proposal for the input that replaces it. Each proposal
must reproduce today's behaviour at the type's defaults (decision 4).

| Branch | Swing | Carry | Governed by |
|---|---|---|---|
| Downswing lead (`downswing.ts`) | the pendulum leads under gravity and the body's effort, tabulated | the hands lead on their tempo, the slope prescribed (θ = θ_top + span·σ²), closed form | one law (§4.1). `pendulumShare` is only the backswing height's split (1 on the swing presets; 0.4, 0.1, 0.15 on the half, full and pass rolls) and does not choose the lead |
| Inside the pulse (`track.ts`) | gravity acts through the pendulum's pulse (the table) | kinematic | §4.1's law |
| Finish (`finishKind`, `integrate.ts`) | swing; a check (α < 0) holds the pendulum, the hands gripped | carry | from 3c and the grip (the design's call): a brake takes the check's hold on any stroke, a push the carried finish, neither the free swing; no type or mode read |
| Sensed resistance, `pushResponse`, the first-departure latch, the chains' advance (`integrate.ts`) | none | carry only | 3b, active on every stroke with a push through |
| A slid grip anchor's decay (`track.ts`) | swing only | none | every stroke |
| `handTempo` required (`shapeOf`, `validate`) | none | required | §4.1 |
| `validateDownswing`, the arc's mode check (`simulateImpact.ts`) | swing table | carry closed form | §4.1; the mode check goes |
| Backswing limit | the body's θ_max | horizontal | the body's θ_max on every stroke, the rolls' backswings checked against it (it also sets P2b.2b.2c.3b's 100 % stroke effort) |
| The swung body after contact (`track.ts`) | the arm mass rigid at the top grip | each hand's Dong et al. chain with the arm's flex | one hand model on every stroke; which one, and whether the rigid arm mass is its limit, is the builder's to resolve and the gate's to rule |
| The push through | none | the push intent along aim to `pushForce`, the hold | 3b, zero on today's swing strokes |
| After the pulse | free pendulum | held slope, then the pendulum phase | 3c |
| The bottom hand opening | by `reachSlack` | at the pendulum phase's start | one rule; the builder's |
| The hands after contact | the advance (optional), level | the hands' arc to the push length | the feet (§3) and 3b |
| The jab | swing only | rejected | every stroke |
| `guideEffort` | swing only | not read | every stroke |
| Effort law | torque–velocity (Hill) | the hands' tempo | the strike: the body's effort on every stroke; how the hands' tempo relates to it is the builder's to resolve |

### 4.1 One downswing law: the grip decides how far the hands hold the slope (the design's call)

The swing strokes' law already integrates the pendulum under gravity and effort with the hands' path accelerating the
pivot (the −M·d·(A·t̂) term). The rolls' law prescribes the slope instead. The physical difference is the grip: two
hands spread down the shaft form a couple that can hold the slope, while two hands together at the top cannot and the
mallet swings. The proposal: every stroke uses the dynamic law, the hands following their planned path on their tempo,
plus a torque from the two hands' couple tracking the planned slope, its strength set by the grip (the hands' spread
a − b and their firmness) and bounded by the body. Hands together at the top give almost no couple and today's free
pendulum; a roll's spread, firm grip holds the slope as today's closed form does. That is continuous physics read from
the grip, not a mode in disguise; a blend weight or a switch whose only sensible values are the old two modes would be
(§8). The builder works out the couple's law, sources its bound or labels it, and lists every departure for the gate.

**The planned slope** (spec review): every stroke plans a slope path through the downswing, and the couple acts on the
error from it. A swing preset's default plan is its own free pendulum's path (today's table), so its tracking error is
zero and the couple, whatever the grip, does nothing at its defaults: the GC stop's firm, split grip included, which
departs only where a shot plans a slope other than its free swing. A roll's default plan is today's hands-led
prescription (θ = θ_top + span·σ² on its tempo). The plan's parametrisation is the builder's, under one constraint: it
is continuous, both of today's paths are points in it, and a player can plan in between; a choice between the two
alone would be a mode in disguise. The swing presets gain whatever tempo the plan needs, derived from their own free
swing, not fitted.

**Refits allowed** (the design's call, resolving the builder check's conflict with §8): where the one law moves a
preset's planned contact speed, its default backswing is refitted to plan 3 m/s again, as P2b.2b.2c.2d refitted the
AC stop's. The rolls' and the swing strokes' `handTempo` and the body's effort are reconciled under §4.1; each refit
and each reconciled value is recorded with its old and new figure. No other default moves.

## 5. Text book defaults

Each type's present values become its defaults, but for the drive's grip (decision 3). The grips in the engine's
shaft frame (0.914 m, from the socket): the top hand at 0.805 m; the bottom hand just below it on the drive (a hand's
width, the builder's figure, cited or labelled), against 0.60 today; the AC stop, the GC stop and single-ball unchanged
(0.805 / 0.45, 0.805 / 0.45, 0.805 / 0.70); the rolls unchanged (half 0.805 /
0.42, full 0.61 / 0.30, pass 0.45 / 0.09). The user's account (3, 8) is carried beside Riches as a hypothesis.

A later check, recorded for P2b.2b.2c.3b or after (account 7): a drive or stop played with the split grip varies its
ratio less than with the hands together.

## 6. The ratchet

As P2b.2b.2c.2d's: a baseline worktree at the branch's base (installed with `npm ci`, never a symlinked
`node_modules`), the preset digest (`phys` and `faults`), `impactDigest`, `impactProbe`, `shotMix`. One commit per
mechanism, not per row of §4's table (the downswing lead, the pulse, `handTempo` and `validateDownswing` are one law,
§4.1), each bit-identical or its moved runs counted per preset and listed; the drive's grip move last. The
implementers stage and stop; the controller runs the digests, probes and slow tests before each commit.

## 7. The pre-flight gate

Stage 1 after the feet's verification (§3) and the first mechanism unified: the reading, the approach for the hand
model and the planned slope.
Stage 2 at the end: every departure from bit-identity, the drive's grip move, the cross-mode cases. One question at a time,
with options and a recommendation.

## 8. Non-goals and anti-goals

- No push map, no new defaults beyond the grips (P2b.2b.2c.3b).
- No side-on view (the roadmap's deferred decisions; a throwaway plot at P2b.2b.2c.3b's gate).
- No body model: the hands stand in for the arms and the feet as now.
- No jump shot (account 8): a future set-up case the same inputs should produce (hands together, slid down the shaft,
  the feet forward, a hard downward hit with no push), relying on the turf's rebound, which no change here may remove.
  Other special shots likewise.
- Anti-goal: a unified model that keeps a mode in disguise (a flag, a type check, or an input whose only legal values
  are the two old modes).
- Anti-goal: hiding a departure from today's results inside a tolerance instead of listing it.

## 9. What's left to the builder

- The input names and their validation.
- The unified hand model after contact, and the effort law joining the body's torque and the hands' tempo, within
  §4's constraints; each departure listed for the gate.
- The bottom hand's opening rule.
- The order the branches are removed in.
- The text book figure for "a hand's width".

## Amendments

(none yet)
