# Hands from lean, and the viewer's full-range inputs: design

**Status:** draft, 2026-11-12. **Supersedes:** `2026-11-12-roll-hands-design.md` and its plan, whose per-type hands
become points on one progression here; its reviewed parts (the fault at the head, the ring and finger placeholders,
the miss recorded) carry over. **Follows:** the side-on viewer (`2026-11-11-side-on-viewer-design.md`).

## 1. Why

Seen side on, the rolls' hands were wrong, and the user's account (2026-11-12) makes the hands a function of the
mallet's lean rather than of the shot type: "The defaults are just set ups on a wider scale." It is the unified shot
model's goal (shot types emerge from inputs) applied to the hands. The same account asks the viewer to show it: inputs
over their whole range, the swing replayed from its first frame on every change, the feet and the lean moving the
hands visibly.

## 2. The hands' progression

The user's account, verbatim where quoted:

- Lean at or behind 0 (the drive; the stops): the drive's hands, "correct": top at the top of the handle, bottom a
  hand's breadth below.
- "For a lean between a half roll and drive (0), the middle hand move[s] between the two positions"; the top hand stays.
- The half roll: "top hand in the drive position, middle hand around half way. The distance between the hands should
  be the same as the distance between hands on the full roll."
- "For a lean between a half roll and a full roll the hands move in lock-step together between the positions."
- The full roll: "the bottom hand should be approximately a finger's length + a brass ring from the base of the mallet
  head. The top hand should maintain the distance between hands of the half roll."
- The pass roll: "the bottom hand should be fisted, lower, touching the brass ring. The top hand should maintain that
  lock-step distance a little lower."

As a law, `handsForLean(lean): { top, bottom }` (m from the socket), piecewise linear in lean between four anchors,
held flat outside them:

| Anchor | Lean | Top | Bottom |
|---|---|---|---|
| Drive | ≤ 0° | `TOP_OF_HANDLE` 0.805 | 0.805 − `HAND_BREADTH` = 0.717 |
| Half roll | 24° | 0.805 | `SHAFT/2` = 0.457 |
| Full roll | 31° | 0.144 + `GAP` = 0.492 | `RING_HEIGHT + FINGER_REACH + HAND_BREADTH/2` = 0.144 |
| Pass roll | 32° | 0.069 + `GAP` = 0.417 | `RING_HEIGHT + HAND_BREADTH/2` = 0.069 |

`GAP` = 0.805 − 0.457 = 0.348 m, the half roll's spacing, kept from 24° on ("lock-step"). Between 0° and 24° only the
bottom hand moves. Beyond 32° the pass roll's hands hold.

Values and their basis: `TOP_OF_HANDLE` and `HAND_BREADTH` as now (sourced); the shaft 0.9144 m (sourced);
`RING_HEIGHT` 0.025 m and `FINGER_REACH` 0.075 m, placeholders (user ruling 2026-11-12, "Use estimates"). The anchors'
leans are the presets' (Gugan 4 Table 6 for the half and full rolls; 32° the user's pass-roll hypothesis).

**Assumptions** (the user's words leave a choice; each to the gate):

1. "Around half way" is half the shaft (0.457 m), not half the handle.
2. "From the base of the mallet head" is from the socket, where the shaft meets the head, as every hand is measured.
3. The pass roll's anchor is its preset lean, 32°, only 1° past the full roll, so the fist forms over that degree.
4. The progression is linear between anchors; the account gives the end points, not the path.
5. The GC stop keeps its own low, firm bottom hand (0.45 m) as a stance override: it is a different technique and is
   not in the map. Every other type takes the law.

## 3. The engine

- `handsForLean` lives in `swing/profile.ts` beside the constants above, exported, with a doc comment citing §2.
- The hands of a set-up are, in order: the shot's `stroke.grip` where given; else the GC stop's override; else
  `handsForLean(stroke.lean)` where the stroke gives a lean; else the preset's lean's. The presets' `top` and
  `bottom` become derived from their own leans by the law, not typed. `handsAhead` follows from the lean and the
  derived top, as `stanceFromLean` derives it now.
- What stays per type: the defaults of the grips' tensions (γ_T, g_B), the push, hold, follow-through and shape
  presets. These are how the hands act, not where they are. They are defaults only: the viewer varies each over the
  whole playable range (§5.1), whatever the type.
- **The fault** (carried, reviewed): Law 29.1.1, "touches the head of the mallet with a hand", quoted in
  `reference/laws.json`; planning rejects a bottom hand whose lower edge, `bottom − HAND_BREADTH/2`, is at or below the
  socket, after the existing `(0, top)` check, naming `gripName("bottom")`. The law's anchors are lawful by
  construction; the check guards a shot's own grip.
- `ENGINE_VERSION` 0.31.0. The changed hands move: every positive lean (the drive's swept leans to +12°, the AC stop's
  to +3°, all three rolls), the single-ball stroke (bottom 0.70 → 0.717 m), and the full and pass rolls' anchors. The
  AC stop's text book (−6°) and the drive's (0°) are unchanged to the bit.

## 4. The defaults

**Ruling carried (user, 2026-11-12, "Keep hands, record miss"):** the hands go in whatever the ratios; a roll missing
its band is recorded, not refitted, and what in the model punishes low hands becomes its own design. Each preset's
`drive`, `window` and hold are kept and measured; the default backswings re-derived at 3 m/s
(`scripts/fitStrokeShape.ts`); the pass roll's follow-through shortened as ruling 18 did only if its head meets the
turf; the arms' assist held, reopened only if the full roll misses 9 m/s. **Gate:** the measurements and §2's
assumptions to the user before the envelope is re-run.

## 5. The viewer

1. **Full-range inputs.** The user (2026-11-12): "The defaults are set per shot type but the range of possibilities
   encompass all shot types. The sliders should cover the whole playable range." The picked type sets each slider's
   starting value; the slider spans what the engine plays, whatever the type:

   | Input | Range | Bound |
   |---|---|---|
   | Lean | the lowest any type's planner accepts to 45° | `buildContact`'s on-point limit (π/4) |
   | Feet | the widest any type's arc reaches | the hands' arc check; a set-up past it shows the planner's rejection, as now |
   | Push length (`handReach`) | 0 to the arc's reach | the same check |
   | After contact (`drive`) | −1 to 1 | `buildContact` |
   | Push window | 1–100 ms | `MIN_WINDOW`, `MAX_WINDOW` |
   | Hold firmness | 0 to 1 | the hold's definition |
   | Top and bottom grips (γ_T, g_B), new | (0, 1] | `buildContact`'s grip check |
   | Follow-through, new | 0 to 0.3 s | none in the engine; the longest any preset has used (the pass roll's before ruling 18; 0.2 s now) |

   The two new sliders expose the per-type quantities §3 keeps per type, so they too vary from the type's default
   (assumption: the user's "range of possibilities" covers them). The shape presets (the swing's tempo and slope)
   stay the type's, not inputs. Ticks mark the picked type's swept values.
2. **Judgement off the grid.** Inside the picked type's swept span the band table judges as now. Outside it, or with a
   grip tension or follow-through moved from the type's default (the map sweeps neither), the badge reads "not swept
   for <type>", and Run still plays the engine and reports its class. No band is invented.
3. **Reset and replay.** Any input change sets the time to the first frame and plays the planned swing for the new
   set-up from there, the planned path (under 100 ms, measured 35 ms) carrying the hands as the law places them. Run
   still plays the impact.
4. **The feet and the hands.** A dotted plumb line from the top hand to the lawn, and a foot marker at the feet's
   position along aim, both relative to the striker's ball, with the distance labelled.
5. **The lean and the hands.** The hands drawn where `handsForLean` puts them, so a lean change slides them along the
   shaft in step with its tilt.

## 6. The envelope

All six types re-run (every type has swept leans whose hands move), stage 2 then the grip stage, on the restored map
workflow (`.github/workflows/push-map.yml` from `6ff648c^`, its actions and runner bumped). The per-type grids are
unchanged: widening them to the full range multiplies the map's cost and is not needed for the viewer, which plays
the engine live off the grid (§5.2). `complexityOf`'s set-up departure "the stance's hands off the drive's" becomes
"a positive lean", which is what moves the hands now. The record, the defaults, the band tables and the viewer's data
rebuilt; the workflow removed again afterwards.

## 7. Not in this design

- Which type plays a wanted shot (the pass roll plays most roll-band defaults now); revisited on the new record.
- What punishes low hands (its own design, next, per §4's ruling).
- One set of grips' tensions and push presets across types (the rest of the unified model).
- A measured ring or finger; the hand sliding on the shaft.
- **Grabbing a hand to set the lean** (user, 2026-11-12: "Ultimately I'd like the user to be able to grab a hand to
  change the lean"). Carried to a later viewer phase: dragging the top hand on the canvas sets the lean from the
  shaft's angle about the head at contact, and the hands then slide by `handsForLean` as the slider moves them. This
  design keeps it open: the lean stays the one input the hands follow, and §5.3's reset and replay serves a drag as it
  serves a slider.

## 8. Housekeeping

Dependency freshness as a separate small PR landing first; the restored workflow's actions and runner in §6's step.
