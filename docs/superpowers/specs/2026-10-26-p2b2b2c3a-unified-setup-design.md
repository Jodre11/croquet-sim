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

**A1 — the hand model and the calibration (user, 2026-10-26, while planning).** One hand model after contact cannot
keep both the swing strokes and the rolls bit-identical. Asked which constraint gives way, the user chose "Chains +
allow retune": the Dong et al. chains become the hand model on every stroke (§4, "The swung body after contact"). If
the AC stop leaves Gugan 5's band (6.55–7.75) or the drive's re-contact-free `guideEffort` breaks, stage 2 may retune
that preset's own grip or `guideEffort`, against Gugan 5 only. This amends §4.1's "No other default moves" for those
two presets alone; every retune is recorded with its old and new figures. The rolls stay held out.

**A2 — gate stage 1 (user, 2026-10-27).** The figures are in `probes/2026-10-27-p2b2b2c3a-stage1.txt` (sections F, P,
R) and the hand model's note in `probes/2026-10-27-p2b2b2c3a-hand-model.md`. Each ruling as chosen:
1. **The feet** (§3 confirmed on all four claims). The user: "the bottom of the swing is generally a little bit in
   front of where the tip of the feet … it varies per player … the name is good because it's what the player would
   think about, but it also has a variable relationship to the bottom of the arc. But that doesn't mean that we should
   model that. What we want to move is the bottom of the arc. We could just assume a fixed offset or just a zero
   offset." Chosen: "Zero offset". `stroke.feet` is the hands' arc's lowest point along aim from the striker's ball;
   the toe's varying offset behind it is documented, not modelled.
2. **The planned slope.** "Accept as built": `slopeHold` λ in [0, 1]; between the ends both the slope's progress and
   the hands' progress blend (the builder's refinement of the plan's decision 1, so that the hands and the planned
   speed are continuous at λ → 1); the ends run today's code; a null `handTempo` takes the free swing's own fall.
3. **The couple's bound.** First "Accept" C = min(γ_T, g_B)·F_max·(r − b), the firmness factor a placeholder; re-asked
   after the user's note that "the grip barely limits the new slope plan"; chosen "A: plan decides, grip bounds". This
   amends §4.1's "the grip decides how far the hands hold the slope": the plan (λ) decides and the grip bounds it,
   since hands together can hold a slope (the drive's grip gives C = 9.8 N·m against 7.0 N·m for a held drive).
   Recorded for P2b.2b.2c.3b: the couple's share of C as a cost on the stroke's effort or a bound of the envelope.
4. **The swung body.** "Share and flex gains": the chains and `carryBody` on every stroke; each hand fed γ × its moment
   share, its flex gains k·γ and c·√γ; the chain's own weight and m·a fed in full; the chain's elements unchanged.
5. **One control law.** "A: rolls' law as base": the carry law is the base; γ_T, g_B and `guideEffort` are multipliers
   the rolls hold at 1; the check's share, the twist share and the slid anchor's decay act on every stroke; the
   posture hold, the push intent and its sensing, and the pendulum phase act only with a push.
6. **The bottom hand's opening.** "A: signed reach or phase": the earlier of the forward reach (signed, as today) and
   the push's pendulum phase; a push of length 0 has no pendulum phase.
7. **The finish.** "Accept the note's A/A": a brake (α < 0) takes the check's hold, which waits for the push's end;
   otherwise a push the carried finish; otherwise the free swing. The hold stays on the firm grip, the chains letting
   go; it is kept on the track, not the free table, so a check on a held slope (λ = 1) holds the held path.
8. **The push through.** "A: one push": on every stroke, its pace the plan's travel plus any advance, on the hands'
   arc, capped at the push length, none at length 0; the reach and the separate advance go; a stop may push. The ease
   at a push's end is deferred to P2b.2b.2c.3b.

**A3 — gate stage 2 (user, 2026-10-28).** Each ruling as chosen, in the order put:
1. **A hand's width** (§5, §9; before Task 12). The men's 50th percentile hand breadth, 3.46 in (87.9 mm), from the
   NCSU Ergonomics Center's summary of ANSUR II (cited in `reference/sources/README.md`); the women's 3.07 in rejected,
   the table giving no pooled figure. The drive's bottom hand is at 0.805 − `HAND_BREADTH` = 0.717 m.
2. **Single-ball and the GC stop's departures** (1a). "Accept both (Recommended)": accepted as the unified model's. The
   GC stop's head still moving at 0.742 m/s at the impact's end is recorded for P2b.2b.2c.3b (A1 allows no GC retune).
3. **The braked drives' follow-cap** (1b). First "Trace first (Recommended)". The trace found the check's gripped hold
   stiff and damped in pitch in proportion to the hand spacing, so the drive's 0.088 m spacing left a pitch mode of
   ~0.9 s at ζ ~0.08 that the finish test caught only at an apex. Then "Fix the hold now (Recommended)": the gripped
   hold gets its own pitch spring and damper, independent of the hand spacing, sized from `track.firm`'s 0.08 s period
   at ζ 0.7; its own commit, every check's follow-through re-measured and the moved runs counted. On the fix:
   - the seam check, "Scale the slack (Recommended)": exit criterion 3's seam position slack scales with the after-side
     change in acceleration, as the velocity bound does;
   - the couple, "Bound it, then re-count (Recommended)": the hold's pitch couple is bounded by
     C = min(γ_T, g_B)·F_max·(r − b), A2's bound (`gripCouple`, shared with the downswing); the GC stop's creep at a
     20 N grip limit accepted as an artificial-limit case;
   - the re-count, "Keep bound, accept 8 (Recommended)": 8 of 27 braked drives at drive −0.5 still reach the
     follow-through's cap, on a ~1 cm/s sway across the aim; the impact and the ratio are untouched.
4. **`ratioFit`'s inert `armMass`** (1c). "Accept, retire in 3b (Recommended)".
5. **The stiff-grip fat stroke** (1d). "Accept, close it (Recommended)": the stroke is finite; Task 14 closes the
   roadmap's carried defect, removed with the old swing law rather than fixed directly.
6. **The late re-hit crossings and hoop 1's graze** (1e). "Accept, note the gap (Recommended)": accepted as
   measurements, criterion 6 met. The planned path's measure disagrees with the integrated run on the canonical drive
   (a crossing 112.6 ms after contact on the one, none on the other); recorded.
7. **The drive's grip** (2). "Accept grip, set 1 (Recommended)": the grip and its figures accepted (canonical ratio
   3.9253, the follow-through's turf flags gone, turf lift at 5.66 ms); `guideEffort` 0.75 → 1, as on every preset,
   its basis (the largest re-contact-free value) no longer selecting it; its own commit, the moved runs counted.
8. **The AC stop's grip** (3, A1's retune). First "Search its grip (Recommended)": the AC stop's own γ_T, g_B and bottom
   hand searched against Gugan 5's band, no turf damage and a convergence spread under 0.06, lean and contact kept. No
   grip met all three: the bottom hand sets the ratio, and at the default gap the second tap's stick or slide takes one
   of two branches ~0.6 apart by time step. Then "Land 0.25/0.1/0.6 (Recommended)", superseded before it landed: its
   premise of no damage held at the impact only, and its follow-through damaged the turf. Final, "1/0.1/0.717
   (Recommended)": γ_T 1, g_B 0.1, the bottom hand at 0.805 − `HAND_BREADTH`, hands together as the drive (Riches and
   account 3). Gugan 5 gives 6.6029 at the 0.75 mm gap and 7.6089 at gap 0, the canonical 5.0401, no turf damage. The
   band test and the 1 mm convergence case lose `it.fails`; the default gap's convergence keeps it. The jab (account 9;
   bottom hand 0.45, grips 0.1/0.1) stays a per-shot grip.
9. **The cross-mode cases** (4). "Accept all four (Recommended)": criterion 5 met, section X rerun after the hold fix
   with the same flags and events. No refits to rule (section O, 7 of 7 within ±2 %).
10. **Decision 16's braked rolls.** "Accept (Recommended)": against the baseline only drives −1 and −0.5 move; they
    finish 60–700 ms sooner, lose almost all follow-through turf damage and caps, and gain follow-grip-limit.
11. **The AC stop's seam allowance** (11 times its jump after the hold fix). "Re-measure after retune (Recommended)".
    At 1/0.1/0.717 the jump exceeded its bound, so "Trace it first (Recommended)": no state discontinuity; the jump is
    the 1 ms trapezoid across the hold's onset, the head entering the hold at −1.45 rad/s in pitch with the couple at
    its bound on 72 % of steps. Then "Sample first held step (Recommended)": a check's follow-through records one
    sample after its first held step.
12. **The AC stop's follow-grip-limit.** "Accept, add 3b item (Recommended)". The user: "There is a physical limit to
    how quickly the hands can stop the mallet when you're playing a stop shot. And that's why it's beneficial to have
    the lower hand a bit lower so you get more leverage. It's also why Gugan's jab in the AC stop shot offers useful
    assistance worth the finesse."
13. **The hold's settle time** (136.6 ms against 1.5 T, 120 ms). "Mark it it.fails (Recommended)": the bound kept, the
    test citing the hold's inherited pitch rate.
14. **`backswingForContact`'s low end.** "Fix it in this commit (Recommended)": it throws when the target is below the
    speed at zero backswing, with a test.

Recorded for P2b.2b.2c.3b:
- the GC stop's head at 0.742 m/s at the impact's end;
- retire `armMass` from `ratioFit`'s fitted dimensions and the profile;
- a bounded roll damper on the hold;
- measure the late re-hit on the integrated follow-through;
- the full roll at λ 0.5 leaving the face late, and the pass roll's braked impact-off-face (20 runs at drive −1, 8 at
  −0.5), as envelope cases;
- trace the AC stop's two-branch step flip at the default gap (the band passes on the high branch);
- the user's hypotheses, tested on the jab: that the weak lower grip lets the mallet die on rebound (the screen shows
  g_B barely moving the ratio or the damage at 0.717); and that a lower bottom hand gives the leverage to stop the
  mallet, and whether min(γ_T, g_B) in `gripCouple` underrates that lever;
- soften the hold's onset, seating the held path at the head's pitch and rate (the settle time's fix);
- the couple's share of C as an effort cost (A2, item 3).
