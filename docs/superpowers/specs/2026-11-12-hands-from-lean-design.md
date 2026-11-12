# Hands from lean, and the viewer's full-range inputs: design

**Status:** reviewed, 2026-11-12 (panel: subtraction, completeness, framing; §9). **Supersedes:**
`2026-11-12-roll-hands-design.md` and its plan, whose per-type hands become points on one progression here; its
reviewed parts (the fault at the head, the ring and finger placeholders, the miss recorded) carry over. **Follows:** the
side-on viewer (`2026-11-11-side-on-viewer-design.md`).

## 1. Why

Seen side on, the rolls' hands were wrong, and the user's account (2026-11-12) makes the hands a function of the
mallet's lean rather than of the shot type: "The defaults are just set ups on a wider scale." It is the unified shot
model's goal (shot types emerge from inputs) applied to the hands. The same account asks the viewer to show it: "The
defaults are set per shot type but the range of possibilities encompass all shot types. The sliders should cover the
whole playable range"; "When an input is changed the shot should return to the first frame and that animation should
reflect the adjusted inputs"; "When the foot distance is adjusted the top hand moves horizontally relative to the
strokers ball. Some dotted plumb line and or foot indicator might be useful."

The shot types become defaults on one continuum: a roll's swept leans now play the hands its lean gives, whatever the
type's name. That is intended.

## 2. The hands' progression

The user's account, verbatim where quoted:

- Lean at or behind 0: the drive's hands, "correct" ("For leans behind 0 (backward) e.g. stop shots, the hands are
  correct, like the drive hand position"): top at the top of the handle, bottom a hand's breadth below.
- "For a lean between a half roll and drive (0), the middle hand move[s] between the two positions"; the top hand stays.
- The half roll: "top hand in the drive position, middle hand around half way. The distance between the hands should
  be the same as the distance between hands on the full roll."
- "For a lean between a half roll and a full roll the hands move in lock-step together between the positions."
- The full roll: "the bottom hand should be approximately a finger's length + a brass ring from the base of the mallet
  head. The top hand should maintain the distance between hands of the half roll."
- The pass roll: "the bottom hand should be fisted, lower, touching the brass ring. The top hand should maintain that
  lock-step distance a little lower." The pass and full rolls differ by more than lean (user, 2026-11-12: "we have
  already modelled that": the split and the push, shapes ruling 17), so the fist is a grip choice, not a lean.

As a law, `handsForLean(lean, mallet, fist): { top, bottom }` (m from the socket), piecewise linear in lean between
three anchors, held flat outside them, with the fist moving both hands down together:

| Anchor | Lean | Top | Bottom |
|---|---|---|---|
| Drive | ≤ 0° | `handle` | `handle − HAND_BREADTH` |
| Half roll | 24° | `handle` | `shaft/2` |
| Full roll | ≥ 31° | `finger + GAP` | `finger` = `RING_HEIGHT + FINGER_REACH + HAND_BREADTH/2` |

`shaft` is `mallet.shaftLength`; `handle` is the top of the handle, `shaft − HANDLE_CAP` with `HANDLE_CAP` = 0.9144 −
0.805 m, so the reference mallet's is 0.805 m as now; `GAP = handle − shaft/2` (0.348 m on the reference mallet),
kept from 24° on ("lock-step"). Between 0° and 24° only the bottom hand moves.

**The fist.** With `fist` on, both hands are lowered by `FINGER_REACH`, so the bottom hand is `RING_HEIGHT +
HAND_BREADTH/2` (0.069 m, the fist on the ring) and the top keeps `GAP` above it (0.417 m), at any lean; its
lowest, 0.069 m, is lawful (§3). Default on for the pass roll, off for
every other type.

Values and their basis: the top of the handle (0.805 m on the 36 in shaft) and `HAND_BREADTH` as now (sourced); the
shaft 0.9144 m (sourced); `RING_HEIGHT` 0.025 m and `FINGER_REACH` 0.075 m, placeholders (user ruling 2026-11-12,
"Use estimates"); the anchors' leans the presets' (Gugan 4 Table 6).

**Assumptions** (to the gate):

1. "Around half way" is half the shaft, not half the handle.
2. "From the base of the mallet head" is from the socket, where the shaft meets the head, as every hand is measured.
3. The progression is linear between anchors, a placeholder: the account gives the end points, not the path, and the
   user is "not 100% on how linear the relationship between hand position and lean is" (2026-11-12). The path between
   anchors is one function, `blend(u)` on [0, 1] (linear now), so a measured or ruled curve replaces it without
   touching the anchors; the gate asks the user, with the side-on viewer's lean sweep in front of them.
4. The GC stop keeps its own typed hands (top 0.805 m, bottom 0.45 m): it is not in the map (`MAP_TYPES`), so nothing
   the user has seen places it. Every map type takes the law.

## 3. The engine

- **Where the law applies.** `SwingStance` gains `followsLean?: boolean`. `defaultProfile`'s stances set it, but the
  GC stop's; their typed `top` and `bottom` become the law at their own leans. A stance without it keeps its typed
  hands, so test and probe profiles with custom hands (`tests/engine/support/shot.ts`'s testProfile,
  `scripts/singleBallProbe.ts`) are unchanged.
- **One resolver.** `handsOf(setup): { top, bottom, gripTension, bottomGrip }` is exported from `buildContact.ts` and
  replaces `gripOf`. Field by field (as `gripOf` resolves now): the shot's `stroke.grip` where it gives that field;
  else, for a stance that follows lean, `handsForLean(stroke.lean ?? the stance's lean, profile.mallet, stroke.fist ??
  the type's default)`; else the stance's. So a shot giving only `grip.bottom` with a lean takes its top hand from the
  law. Every site that reads `stance.top` or `stance.bottom` directly uses it instead: `src/lab/play.ts` (the body
  limit's backswing, `textBook`), `src/lab/canonical.ts`, `scripts/ratioFit.ts`, `scripts/followThrough.ts`.
- `stroke.fist?: boolean` is a new stroke field; the type's default is `FIST` in `profile.ts` (the pass roll's true).
- **The fault** (carried, reviewed): Law 29.1.1, "touches the head of the mallet with a hand", quoted in
  `reference/laws.json`; planning rejects a bottom hand whose lower edge, `bottom − HAND_BREADTH/2`, is at or below the
  socket, after the existing `(0, top)` check, naming `gripName("bottom")`. The law's anchors and the fist are lawful
  by construction; the check guards a shot's own grip.
- What stays per type: the defaults of the grips' tensions (γ_T, g_B), the push, hold, follow-through and shape
  presets, and the fist. They are defaults only: the viewer varies them over the playable range (§5.1).
- `ENGINE_VERSION` 0.31.0. The hands move at every positive lean (the drive's swept leans to +12°, the AC stop's to
  +3°, all three rolls) and on the single-ball stroke (bottom 0.70 → 0.717 m). The AC stop's text book (−6°) and the
  drive's (0°) are unchanged to the bit.

## 4. The defaults

**Ruling carried (user, 2026-11-12, "Keep hands, record miss"):** the hands go in whatever the ratios; a roll missing
its band is recorded, not refitted, and what in the model punishes low hands becomes its own design. Each preset's
`drive`, `window` and hold are kept and measured; the default backswings re-derived at 3 m/s
(`scripts/fitStrokeShape.ts`); the pass roll's follow-through shortened as ruling 18 did only if its head meets the
turf; the arms' assist held, reopened only if the full roll misses 9 m/s. **Gate:** the measurements and §2's
assumptions to the user before the envelope is re-run.

## 5. The viewer

1. **Full-range inputs.** The picked type sets each control's starting value; each spans what the engine plays,
   whatever the type, fixed once from the data:

   | Input | Range |
   |---|---|
   | Lean | the least over the six band tables' lean axes (all values, graded or not) to 45°, `buildContact`'s on-point limit |
   | Feet, push length (`handReach`) | the least to the most over the six band tables' axes, every value the map tried |
   | After contact (`drive`) | −1 to 1 (`buildContact`) |
   | Push window | 1–100 ms (`MIN_WINDOW`, `MAX_WINDOW`) |
   | Top and bottom grips (γ_T, g_B), new | 0.05 to 1 in 0.05 steps (`buildContact` accepts (0, 1]) |
   | Follow-through, new | 0 to 0.3 s, the longest any preset has used (the pass roll's before ruling 18) |
   | Bottom hand, new | finger or fist, a toggle |

   A set-up the planner rejects within these shows its message, as now. Ticks mark the picked type's swept values.
   The hold stays in the Grip panel, its found hold and search unchanged (side-on gate ruling 1); its Looser and Firmer
   steps span 0 to 1, not the nearest swept plan's bounds.
2. **The new inputs' route.** `MapPlan` and the record are unchanged. The viewer passes the new inputs as a separate
   `StrokeExtras = { gripTension?, bottomGrip?, followThrough?, fist? }`, an optional last argument to `mapSetup`,
   `playJudged`, `playFrames`, `plannedPath` and the worker's `frames` message, which writes them into the stroke. With
   none given the play is bit-identical (`tests/lab/playPin.test.ts`).
3. **Judgement off the grid.** Inside the picked type's swept span, with no extras moved from the type's defaults,
   the band table judges as now. Otherwise the badge reads "not swept for <type>", and Run still plays the engine and
   reports its class. No band is invented.
4. **Reset and replay.** Any input change discards a finished Run's frames, sets the time to the first frame and
   plays the planned swing for the new set-up from there (under 100 ms to plan, measured 35 ms); the hands are drawn
   where the planner, and so the law, puts them. Run plays the impact as now.
5. **The feet and the hands.** At the current frame, a dotted plumb line from the top hand to the lawn, labelled with
   its distance ahead of the striker's ball's centre; at address, a foot marker on the lawn at the feet's reading
   (the hands' arc's lowest point), labelled likewise.

## 6. The envelope

All six types re-run (every type has swept leans whose hands move), stage 2 then the grip stage, on the restored map
workflow (`.github/workflows/push-map.yml` from `6ff648c^`, its actions and runner bumped). The per-type grids are
unchanged: widening them multiplies the map's cost and the viewer plays the engine live off the grid (§5.3).
`complexityOf`'s set-up departure "the stance's hands off the drive's" is dropped, in `scripts/pushMapGrid.ts` and
its viewer copy `src/viewer/departures.ts`: the hands now follow the lean, which the lean term already counts. The
record, the defaults, the band tables and the viewer's data rebuilt; the workflow removed again afterwards.

## 7. Delivery

Two PRs: first the viewer's full-range inputs, reset and replay and the plumb line (§5, which do not need the law),
on today's engine; then the law, the fault, the gate and the envelope (§2–4, §6), the viewer drawing the new hands as
it plays them.

## 8. Not in this design

- Which type plays a wanted shot (the pass roll plays most roll-band defaults now); revisited on the new record.
- What punishes low hands (its own design, next, per §4's ruling).
- One set of grips' tensions and push presets across types (the rest of the unified model).
- A measured ring or finger; the hand sliding on the shaft.
- Grabbing a hand to set the lean (user: "Ultimately I'd like the user to be able to grab a hand to change the
  lean"): a later viewer phase.

## 9. Review (2026-11-12)

Panel of three (subtraction, completeness, framing), each ACCEPT_WITH_CHANGES. Applied: one resolver (`handsOf`) at
every site that read the stance's hands; the law follows only stances that opt in, so custom profiles keep their
hands, and it reads the mallet's shaft; the new inputs reach the play as `StrokeExtras`, `MapPlan` and the record
unchanged; each slider's range a fixed rule; the hold stays in the Grip panel with its range widened; reset and
replay discard a Run; the plumb line and foot marker placed; `complexityOf`'s hands term dropped, not reworded (the
lean term already counts it), in both copies; the exemption is "not in the map"; the types as one continuum stated;
delivery in two PRs, the viewer first; §5.5 folded into the replay; the grab carried in one line. Asked: the pass
roll's fist, ruled a grip choice ("the pass/full roll variation is more than just a change of lean"). Rejected: cutting
the grip and follow-through sliders, which the user asked for in reply to that very point.
