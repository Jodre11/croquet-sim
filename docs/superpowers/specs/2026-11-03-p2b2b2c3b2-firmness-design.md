# P2b.2b.2c.3b.2 the body's backswing, the arms' assist and the found firmness: design

Status: built (engine 0.29.0, 2026-11-03); reviewed (three-lens panel, 2026-11-03). See Amendments.

Parent: docs/superpowers/specs/2026-10-26-p2b2b2c3-push-map-design.md, amendment A7 (items 3, 4, 10, 12; item 14
added with this design). This is A7 item 12's phase: the assist and the found firmness, with a body limit on the
backswing added (user, 2026-11-03).

## 1. Goal and scope

Before the envelope map runs (A7), three things must hold on every shot type:
- how hard a shot is played means the same physical effort on every type, so that the map's superhuman class reads a
  real limit (§3);
- a long roll reaches its range by the player's effort, within the body's strength, not by an unbounded backswing (§4);
- the hands' hold is the one the player would anticipate, found by the model rather than chosen (§5).

Out of scope:
- the map's own changes for six types (A7 item 12's plan amendment) and its runs;
- whether a grip-limit inside contact should read superhuman: the map's gate stage 1 reads it (§8);
- any text book's values (A7 item 7): the presets keep their fitted firmness, and the found firmness at the text books
  is gate stage 1's record (A7 item 10), not this phase's.

## 2. What limits a long shot (probe, 2026-11-03)

`docs/superpowers/probes/2026-11-03-p2b2b2c3b2-reach.txt`, engine 0.28.0, canonical setups on the open lawn.

- **The rolls' power is unphysical.** The map's h_body divides by pendulumShare, so the full roll's is 2.77 m, its
  hands about 5 m back along their line, and it meets the ball at 19 m/s at power 1 with no intensity. Only the shaft's
  angle is limited today (θ_max), not the height the hands lift the head (part 1).
- **Within a knee-height backswing the rolls are short of pace.** At a 0.47 m backswing and full intensity the half,
  full and pass rolls meet the ball at 6.5–6.6 m/s; the full roll's croqueted ball then runs 6.4 m on the 6 s lawn,
  14.8 m on the 10 s and 27.3 m on the 14 s (part 4). The drive, its hands still, reaches 9.0 m/s on its shaft torque
  alone and sends the croqueted ball 45.5 m on the 10 s lawn. The rolls' fast end is a placeholder,
  `handTempo.fast`, half the gravity tempo (reference/swing.json), not a strength. This is B1 ruling 7's case: beyond
  about 6 m "the player adds to the swing".
- **The hold decides at speed.** Played above the limit, the half roll at 6.64 m/s slips its bottom grip at firmness 0
  and 0.25 and holds at 0.5 and 1; the full and pass rolls play clean at firmness 0 and slide off the face at 0.25 and
  above (part 3). Within the limit, at their fitted firmness, the half roll at full intensity reaches the grip limit and
  the full and pass rolls slide off the face at every intensity (part 4). That firmness decides it within the limit too
  is a premise the plan's first probe confirms.

## 3. The body's limit on the backswing's height (user, 2026-11-03)

The backswing h (m) is the head centre's height at the top above its height at contact (`DownswingInput`). Today
`planDownswing` limits only the pendulum's share, through the shaft's angle θ_max; the hands' share (1 − pendulumShare)·h
along handAngle has no limit.

- **The figure.** `SwingProfile.body` gains `headRiseLimit` (m), the greatest height the head is lifted above its
  contact height at the top of any backswing, whatever share the hands give. 0.48 m, θ_max's own knee-height figure
  (P2b.2b.2c.1 design §5.2, reference/swing.json `body.backswingLimit`): the user's ruling, chosen with part 4's
  figures in front of them. A reference/swing.json entry records it as the user's, provisional.
- **The check.** `planDownswing` checks h > headRiseLimit first, then θ_max, and throws a RangeError whose message
  names "the body's limit" and the head's rise. `DownswingInput` and buildContact's choice carry the figure beside
  backswingLimit (`buildContact.ts:615, 709, 747`); validation rejects a non-finite or non-positive limit. The test
  profile (`tests/engine/support/shot.ts` testProfile) sets it to 2 m, as it sets θ_max to MAX_BACK_ANGLE: no limit in
  practice. The DownswingInput literals in downswing, effort, turfStrike and buildContact tests gain the field.
- **The solvers.** Three bisections bracket the backswing at θ_max's reach and read a planner RangeError as "past the
  limit" only when it names θ_max: backswingFor and strokeFor (`tests/engine/support/shot.ts:397`),
  backswingForContact (`scripts/followThrough.ts:241`) and the map's rejectedClass (`scripts/pushMapRun.ts:350`).
  Each clamps its bracket's reach to headRiseLimit too and matches "the body's limit", which both messages carry.
- **The map's power.** `bodyBackswing` returns the lesser of θ_max's backswing and headRiseLimit, so p = 1 is the same
  body limit on every type, and rejectedClass reads the new message as superhuman.
- **What moves.** No canonical play: every type's default backswing (0.424–0.449 m) lies under 0.48 m. A roll's
  backswing above 0.48 m now throws. The map's tests that rest on the half roll's h_body of 1.02 m
  (`tests/engine/pushMapRun.test.ts:86-116`: maxPower's (1, 2), the failure at p = 2) are re-measured and re-pinned.

## 4. The arms' assist (B1 ruling 7; user, 2026-11-03: "Build the assist")

On a hands-led downswing (pendulumShare < 1 with λ > 0) the hands' pace is set by their tempo T: the hands' velocity at
contact is (2·Δ_h + tangent)/T (`downswing.ts` held). T runs from `handTempo.slow` at intensity 0 to `handTempo.fast`
at 1, a placeholder halving. The assist replaces that placeholder with the arms' strength.

- **The law.** The arms, swinging from the shoulders, push the hands along their path with a force–velocity law linear
  in the hands' speed, as the shaft's effort is (Hill 1938, P2b.2b.2c.1 design §4.4): F_a = i·F_0·max(0, 1 − v/v_max),
  F_0 (N) the arms' isometric swing force and v_max (m/s) the hands' speed at which they can add no more. Both are new
  `SwingProfile.body` figures (`assistForce`, `assistSpeed`), each sourced in the plan from published arm-swing
  strength and hand-speed measurements, or a labelled placeholder where none is found.
- **The tempo.** At intensity 0 the tempo is `handTempo.slow`, as now, so every canonical play keeps its bits. At
  intensity i the tempo T(i) is the one at which the arms supply the extra force the faster swing needs:
  m·2·|Δ_h|·(1/T² − 1/T_slow²) = i·F_0·max(0, 1 − v(T)/v_max), with v(T) = 2·|Δ_h|/T the hands' speed at contact and m
  the swung mass, the head and shaft plus `armMass` (the mass the downswing already carries at the top grip). The left
  side rises and the right side falls as T shortens, so T(i) is unique; it is solved by bisection on
  [2·|Δ_h|/v_max, T_slow], the right side vanishing at the lower end. If the hands already reach v_max at T_slow the
  arms add nothing and T = T_slow. `handTempo.fast` is removed.
- **Where it acts.** Only where handTempo is read today: λ > 0 with a hands' tempo. The drive, the AC stop and every
  shape with pendulumShare 1 keep their shaft torque and are unchanged. The blend (0 < λ < 1) takes T(i) where it took
  the placeholder's tempo.
- **What it is not.** It acts on the downswing, before contact. Ruling 7's "assists the mallet through it" in the
  finish moves neither ball once the ball has left (A7 item 13) and is not built.
- **What moves.** Every hands-led play with intensity above 0: the map's rolls above p = 1. No canonical pin, as no
  preset carries an intensity.

## 5. The found firmness (A7 item 4)

For a plan, the model finds the firmness the player would anticipate: the least at which the plan plays admissibly.

- **Where.** `findFirmness` in `scripts/firmness.ts`, beside the map that is its only caller (`scripts/pushMapRun.ts`).
  It plays the plan as `playJudged` does (planStroke, practiseStroke, strokeContext, judgeFaults, runClass) with
  `stroke.holdFirmness` set from σ. Play is unchanged: a stroke's firmness is its override, else its preset's. If gate
  stage 2 makes the found firmness play's default (A7 item 7), the finder and runClass move into the engine then.
- **In what.** The hold acts through its share σ = min(1, holdFirmness·v/HOLD_SPEED) of the grip's couple (shapes
  design §8, ruling 15 as built), v the planned contact speed, which planning gives before the hold acts
  (`buildContact.ts:927`). The search runs in σ over [0, σ_max], σ_max = min(1, v/HOLD_SPEED), since firmness is
  validated to [0, 1]; the firmness for σ is σ·HOLD_SPEED/v.
- **The search.** σ on a grid of 0.1 from 0 to σ_max (σ_max itself the last point); the least admissible point σ*; if
  σ* > 0, four halvings of [σ* − 0.1, σ*] (or of [0, σ*] at the first step), keeping the admissible end. It returns
  the least admissible σ found. An admissible island below the grid's step can be missed; the design's call, for cost
  (at most 16 plays, each practised).
- **The result.** `{ sigma, firmness, klass: null }` when admissible; `{ sigma: null, firmness: null, klass, reason }`
  when no σ is, with the class and reason of the play at σ_max (A7 item 4). A planning rejection does not depend on σ
  (the hold acts after planning), so it propagates as the planner's RangeError and the caller classifies it
  (rejectedClass), as the map does today. The map stores the firmness; σ is a diagnostic beside it.

## 6. Versions and records

ENGINE_VERSION moves to 0.29.0 (the new limit rejects backswings that played, and the assist changes every hands-led
play with intensity). No canonical pin moves. The probe file gains part 4 and the assist's figures once sourced.

## 7. Tests

- A roll's backswing just above headRiseLimit throws, naming the body's limit; one at it plans. The drive's check
  order: just above 0.48 m throws the head-rise message, which runs first.
- The six canonical text books play unchanged (existing pins).
- bodyBackswing is at most headRiseLimit on every type; the rolls' at it.
- The three solvers bracket within headRiseLimit: strokeFor(roll, 2.5) (`defaultStroke.test.ts:82`) either solves
  within the limit or throws the named limit, as re-measured.
- The assist: at intensity 0 a roll's tempo is handTempo.slow, bit for bit; the contact speed rises with intensity and
  stays below the speed at which the arms add nothing (v_max); a stroke with pendulumShare 1 is unchanged by
  assistForce.
- findFirmness: a plan admissible at σ = 0 returns 0; one that slips below some σ and holds above it returns a σ inside
  that grid step, admissible; one inadmissible at every σ returns its class and reason at σ_max; one below 3 m/s
  searches no σ above v/HOLD_SPEED. The cases are chosen in the plan by a probe within the new limit.

Housekeeping first, as its own small PR: `npm outdated` (2026-11-03) finds svelte-check 4.7.7 → 4.7.8 and vitest
5.0.5 → 5.1.0. TypeScript 7 stays deferred until typescript-eslint supports it.

## 8. Known risks

- The assist's figures may not be found in print; placeholders then set how far the rolls reach, and the map's long
  end reads them.
- 0.48 m with the assist may still leave the rolls short of the slow lawn's far range. That is an envelope finding.
- Non-monotone admissibility in σ (the half roll wants a firm hold, the full roll a soft one) means "least" is the grid's
  least, refined.
- A grip-limit 0.2 ms into contact may be the impact's momentary load rather than a slipping hand. It still reads
  superhuman; the map's gate stage 1 looks at how much of the envelope it decides.

## Amendments (as built, 2026-11-03)

1. **headRiseLimit's provenance** is "derived", not "user": the reference schema allows only direct, analogue and
   derived. The note records the user's ruling.
2. **The assist's figures:** F_0 = 241.2 N and v_max = 12.19 m/s, fitted by `scripts/assistFit.ts` on the weakest held
   roll (the full roll) at its top, meeting 9 m/s at intensity 1. Under the shared pair the half roll reaches 11.7 m/s
   at intensity 1 and trips the grip limit at map power ≥ 1.5 at every firmness (probe part 5).
3. **The search is split out** as `searchSigma(sigmaMax, play)`, so its grid and halvings are tested on a synthetic
   play; `findFirmness(setup, world)` keeps the planned signature. playJudged's classification without its probes is
   `playedClass` in `scripts/pushMapRun.ts`.
4. **The map does not store the firmness yet.** Gate 1 found that a firm hold on a slow full or pass roll (map power
   0.5 to 0.9, firmness from about 0.18) throws in the handover: the head overlaps the croqueted ball by 1.5 to 2.5 mm
   sideways, where the rule clears at most 1 mm. That is an engine defect, not a class, and findFirmness propagates
   it, so wiring it into playSample waits on the fix.
5. **The handover's head on the ball, fixed (engine 0.29.1).** Amendment 4's ball is the striker's, not the croqueted
   one. Traced at power 0.8 (firmness 0.2375), the slow full roll held firm leaves the face (`impact-off-face`), the head
   rides up over the striker's ball, its bottom pressing the ball 2.35 mm into the turf, and carries it until
   TRACK_IMPACT_CAP (450 ms), the contact still closed. All five throwing cases (full roll 0.5, 0.6, 0.8, 0.9; pass roll
   0.5) end so, with `impact-cap` and `impact-turf-pit`. The head-clearance rule is for the lift's artefact of an impact
   that ended (P2b.2b.2b.2b design §5: "the impact must not end there"); a capped impact did not end, and the overlap is
   its live contact. The handover now hands such a ball over where it lifted it, the head's overlap left, when the rule
   cannot clear it after a capped impact; an impact that ended still throws, and a capped one still has what the rule
   can clear cleared. Those holds now read `unpractised` (`impact-off-face`), as their neighbours do; the push's held
   lean and the follow-through are not at fault. With it the map stores the firmness: `playSample`/`playJudged` play
   each sample in `searchFirmness` (the search keeping its play, so a sample costs no play beyond the search's, at most
   16), `MapSample` carries `firmness` and `sigma` (null where none admits, the sample then its play at σ_max, or
   unplayed), and `hold: "preset"` plays the preset's hold for the fitted text books (the map's text-book read, the
   path traces and their tests).
