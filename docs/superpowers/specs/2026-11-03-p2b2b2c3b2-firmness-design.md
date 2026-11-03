# P2b.2b.2c.3b.2 found firmness and the body's backswing: design

Status: draft, for the spec panel.

Parent: docs/superpowers/specs/2026-10-26-p2b2b2c3-push-map-design.md, amendment A7 (items 3, 4, 10, 12; item 14
added with this design). This phase is A7 item 12's "assist and found firmness" phase, rescoped (user, 2026-11-03).

## 1. Goal and scope

Before the envelope map runs (A7), two things must hold on every shot type: the hands' hold is the one the player
would anticipate, found by the model rather than chosen; and how hard a shot is played means the same physical effort
on every type, so that the map's "superhuman" class reads a real limit.

In scope:
- the body's limit on the backswing's height, on every stroke (§3);
- the engine's own judgement of an admissible stroke, moved out of the push map (§4);
- the found firmness (§5).

Out of scope:
- the hands' assist. Dropped (user, 2026-11-03: "Yes, rescope"; §2, A7 item 14);
- the map's own changes for six types (A7 item 12's plan amendment) and its runs;
- whether a grip-limit inside contact should read superhuman: the map's gate stage 1 reads it (§7);
- any text book's values (A7 item 7): the presets keep their fitted firmness.

## 2. Why the assist is dropped (probe, 2026-11-03)

`docs/superpowers/probes/2026-11-03-p2b2b2c3b2-reach.txt` plays each type's canonical setup at rising power on engine
0.28.0, as the push map does (`scripts/pushMapRun.ts` mapSetup).

- **Speed is not short.** The drive, its hands still, reaches 9.0 m/s at full intensity with no grip limit; a 32 m
  shot on the 6 s lawn needs about 7–8 m/s at contact. B1 ruling 7's "beyond about 6 m the player adds to the swing"
  is the intensity already in the model (the player's torque, P2b.2b.2c.1 design §4.4).
- **Ruling 7's assist acts on the finish**, and once the ball has left the face nothing there moves either ball (A7
  item 13's reasoning for the flick).
- **What fails a long shot is the hold.** Rolls at speed reach a hand's grip limit (435 N; the full and pass rolls'
  bottom hand 0.2–0.3 ms into contact, the half roll's in its push) or slide off the face. The firmness decides it:
  the half roll at 6.64 m/s holds at firmness 0.5 and 1 and slips at 0 and 0.25; the full roll at 7.75 and 11.56 m/s
  plays clean at 0 and off the face at 0.25 and above. That is §5's work.
- **The rolls' power is unphysical.** h_body, the map's backswing at the body's limit, divides by pendulumShare: the
  full roll's is 2.77 m, its hands reaching 5 m back along their line, and its contact speed 19 m/s at power 1 with
  no intensity. Only the shaft's angle is limited today (θ_max), not the height the hands lift the head. That is §3's
  work.

## 3. The body's limit on the backswing's height

The backswing h (m) is the head centre's height at the top above its height at contact (`DownswingInput`). Today
`planDownswing` limits only the pendulum's share, the shaft's angle θ_max; the hands' share (1 − pendulumShare)·h
along handAngle has no limit.

- **The figure.** `SwingProfile.body` gains `headRiseLimit` (m), the greatest height the head is lifted above its
  contact height at the top of any backswing. Default 0.48 m, θ_max's own figure: θ_max was solved as the angle at
  which the single-ball stroke's head rises 0.48 m, "about knee height" (P2b.2b.2c.1 design §5.2, reference/swing.json
  `body.backswingLimit`). Assumption: the same knee-height rise holds whatever share of it the hands give, since the
  stance's hands and body bound the head's height, not the split. A `reference/swing.json` entry records it as
  derived from that account, provisional, a placeholder.
- **The check.** `planDownswing` throws a RangeError for h > headRiseLimit, naming the body's limit on the head's
  rise, beside θ_max's check, which stands. Validation rejects a non-finite or non-positive limit.
- **What moves.** Nothing canonical: every type's default backswing (0.424–0.449 m) lies under 0.48 m, and the drive's
  θ_max sits at its 0.48 m. A backswing the rolls played above 0.48 m now throws.
- **The map's power.** `bodyBackswing` returns the lesser of θ_max's backswing and headRiseLimit, so p = 1 is the
  same body limit on every type, and `rejectedClass` reads the new message as superhuman.

## 4. The engine's admissible stroke

The push map's classification after the run (`scripts/pushMapRun.ts` ownClass and runClass) moves into the engine as
`judgeStroke` (new file `src/engine/admissible.ts`), so that §5 can use it:

- input: the setup, the practised run (`practiseStroke`'s result and follow-through), the fault report and the on-point
  read, and practice's miss;
- output: `{ klass, reason }`, the first class that applies in decision 5's order (superhuman, mishit, turf,
  unpractised, unlawful) or null, exactly as runClass returns today;
- `MapClass` keeps "unreachable", which only the map's planning raises; the engine's class type is the rest.

runClass becomes a call to it; the map's results are unchanged, bit for bit (its tests stand).

## 5. The found firmness (A7 item 4)

For a stroke, the model finds the firmness the player would anticipate: the least at which the stroke plays
admissibly.

- **Where.** `findFirmness(setup, world)` in `src/engine/firmness.ts`. It plays the stroke as the map does: planStroke,
  practiseStroke, strokeContext and judgeFaults, then judgeStroke (§4).
- **In what.** The hold acts through its share σ = min(1, holdFirmness·v/HOLD_SPEED) of the grip's couple (shapes
  design §8, ruling 15 as built), which saturates at speed: at 11.56 m/s every firmness above 0.26 is σ = 1. So the
  search runs in σ ∈ [0, 1] and returns both σ and the firmness that gives it, σ·HOLD_SPEED/v.
- **The search.** σ on a grid of 0.1 from 0; the least admissible point σ*; if σ* > 0, four halvings of
  [σ* − 0.1, σ*] to its lower edge (to 0.00625). An admissible island below the grid's step can be missed; the
  design's call, for cost (at most 15 plays, each practised).
- **None admissible.** The result is null with the class and reason of the play at σ = 1 (A7 item 4).
- **Opt-in.** Play is unchanged: a stroke's firmness is its override, else its preset's. The finder is called by the
  map and the text-book records; whether play takes the found firmness by default is gate stage 2's ruling (A7 item 7).
- **Recorded.** Each of the six text books (A7 item 1) at its canonical power on the 10 s lawn: the found σ and
  firmness beside the fitted one (the half roll's 0.1, the others' 1), with the ratio at each, in a probe file.

## 6. Versions, records and tests

ENGINE_VERSION moves to 0.29.0 (the new limit rejects backswings that played; A7 item 10's "next minor" with this
phase rather than the assist). No canonical pin moves.

Tests:
- A backswing just above headRiseLimit throws on a roll and on the drive, naming the limit; one at it plans.
- The drive's canonical play and the six canonical text books are unchanged (existing pins).
- bodyBackswing is at most headRiseLimit on every type; the rolls' at it.
- runClass gives the same classes on its existing cases through judgeStroke.
- findFirmness: a stroke admissible at σ = 0 returns 0; a stroke that slips below some σ and holds above it returns a
  σ inside that grid step; a stroke inadmissible at every σ returns null with its reason at σ = 1. The cases are
  chosen in the plan by a probe within the new limit (§2's cases above 0.48 m no longer plan).

Housekeeping first, as its own small PR: `npm outdated` (2026-11-03) finds svelte-check 4.7.7 → 4.7.8 and vitest
5.0.5 → 5.1.0. TypeScript 7 stays deferred until typescript-eslint supports it.

## 7. Known risks

- 0.48 m may be too low for a long roll, whose hands lift the head higher than a drive's pendulum does; the rolls may
  then not reach the slow lawn's far range at all. That is an envelope finding, and the figure is a placeholder the
  user can correct from their own play.
- The found firmness can differ from the fitted one at a text book and so move its ratio there; it is recorded, not
  applied (§5).
- Non-monotone admissibility in σ (the half roll wants a firm hold, the full roll a soft one) means "least" is the grid's
  least, refined; the map reads what it finds.
- A grip-limit 0.2 ms into contact may be the impact's momentary load rather than a slipping hand. It still reads
  superhuman; the map's gate stage 1 looks at how much of the envelope it decides.
