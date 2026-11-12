# The rolls' hands: design

**Status:** superseded 2026-11-12 by `2026-11-12-hands-from-lean-design.md`; reviewed (panel: subtraction, completeness, framing; §8). **Follows:** the side-on viewer
(`2026-11-11-side-on-viewer-design.md`), where the full and pass rolls' hands were first seen side on.

## 1. Why

Seen side on, the full and pass rolls hold the mallet higher than the user plays them. Both presets have the top hand
0.61 m and the bottom hand 0.30 m from the socket. For the full roll these are Riches' ("lower hand ... at least
two-thirds of the way down the handle, ... top hand ... to about one-third of the way down"), chosen on the user's
"Go with Riches" (unified set-up design, accounts 3–4, 2026-10-26), though the user's account then already put the
top hand at mid-shaft and the bottom hand at the shaft's foot. The pass roll took the full roll's grips in shapes
ruling 17, having had no lawful fit at its own low hands (top 0.45 m, bottom 0.09 m).

The user's account (2026-11-12) now replaces Riches for both rolls' hands, as Gugan's face angles replaced Riches'
leans; Riches' quotes in `profile.ts` stay as cues:

- "On both full and pass rolls top hand is in the middle of the shaft."
- "For the full roll a finger is extended down the back of the shaft to touch the brass ring."
- "For the pass roll, the hand is fisted and touching the brass ring."
- "There is normally a brass ring on the shaft just before the mallet head. The hand can touch the brass ring but not
  the mallet head. Touching the mallet head is a fault."

These are the rolls' text-book hands. The user's earlier point that grips vary "from grip to player to mallet" stays
carried to the envelope of grips, as it was (account 4–5). The half roll's hands look right and are unchanged; so are
the drive's, the stops' and the single-ball stroke's.

## 2. The hands

A hand is a point on the shaft, its centre, measured from the socket (`SwingStance.top`, `.bottom`), as now.

| Quantity | Value | Basis |
|---|---|---|
| Shaft | 0.9144 m | `reference/mallet.json` `shaftLength`, sourced |
| Top hand, full and pass rolls | 0.4572 m | half the shaft, the user's account |
| Ring's top above the socket, `RING_HEIGHT` | 0.025 m | placeholder, user ruling 2026-11-12 ("Use estimates") |
| Hand breadth, `HAND_BREADTH` | 0.0879 m | ANSUR II, sourced |
| Extended index finger's reach below the palm, `FINGER_REACH` | 0.075 m | placeholder, same ruling |
| Pass roll's bottom hand | `RING_HEIGHT + HAND_BREADTH/2` = 0.069 m | fist on the ring |
| Full roll's bottom hand | `RING_HEIGHT + FINGER_REACH + HAND_BREADTH/2` = 0.144 m | finger on the ring |

`RING_HEIGHT` and `FINGER_REACH` are constants beside `HAND_BREADTH` in `swing/profile.ts`, each labelled a
placeholder with this ruling. The ring stays there, not in `reference/mallet.json` or `MalletSpec`, until a measured
ring exists. The top hand is `MALLET.shaftLength / 2`, the bottom hands the expressions above. The leans (full roll
31°, pass roll 32°) are unchanged; `handsAhead` follows from the new top hand, as `stanceFromLean` derives it.

## 3. The fault

Law 29.1.1 of the WCF Laws of Association Croquet (7th edition): a fault is committed if the striker "touches the head
of the mallet with a hand" (https://worldcroquet.org/wp-content/uploads/2021/04/Laws-Rulings-Commentary-combined-published-master-.pdf,
retrieved 2026-11-12). The ring is the shaft's, so a hand on it is lawful; the limit is the head.

- `reference/laws.json` gains a `"29.1.1"` entry with that quote, as the other Laws are kept.
- Planning (`buildContact`'s validation) rejects a grip whose bottom hand's lower edge, `bottom − HAND_BREADTH/2`, is
  at or below the socket (0), with the message "the bottom hand touches the mallet's head (Law 29.1.1): <name> is
  <bottom> m, its lower edge <edge> m from the socket", `<name>` from `gripName("bottom")` (`stroke.grip.bottom` or
  the preset's). It runs after the existing `(0, top)` check, so `bottom ≤ 0` keeps its current message.
- A set-up check only: the hand is not modelled sliding on the shaft, and `simulateImpact`'s own hands check is
  unchanged. Tests: a bottom hand with its edge 1 mm above the socket plans; one 1 mm below is rejected with the Law.

## 4. The rolls' defaults

**Ruling (user, 2026-11-12, "Keep hands, record miss"):** the user's hands go in whatever the ratios. A roll that
misses its band is recorded as a miss, not refitted; the map is re-run at these hands; and what in the model punishes
low hands (a candidate: the grip's couple, whose lever `r − b` grows as the bottom hand drops) becomes its own design,
next. A miss is likely: the pass roll's new hands are nearly the 0.45/0.09 m that had no lawful fit (ruling 17).

At the new hands, each roll's defaults are handled as follows:

| Default | Handling |
|---|---|
| `drive`, `window` (rulings 16, 17) | kept; the canonical ratio measured and recorded against the band (full roll 1.0–1.2, pass roll Gugan 5's 0.83) |
| Hold firmness (ruling 15), 1 for both | kept; measured |
| Default backswing at 3 m/s (`reference/swing.json` `defaultBackswing`) | re-derived by `scripts/fitStrokeShape.ts`, a calibration to the canonical speed, not a fit to a ratio |
| Follow-through (ruling 18) | kept unless the pass roll's head meets the turf, which the user ruled out; then shortened as ruling 18 did, the nearest clear value |
| The arms' assist (`assistForce`, fitted on the full roll by `scripts/assistFit.ts`) | held, a property of the body; the full roll's speed from its body-limited top at intensity 1 re-measured; reopened only if it misses the 9 m/s ceiling |

**Gate:** the measurements (each roll's canonical ratio, lawfulness, turf clearance, top speed, and any follow-through
change) go to the user before anything downstream is rebuilt.

## 5. Downstream

After the gate:

1. `ENGINE_VERSION` bumped (0.30.0 → 0.31.0); the tests pinning the full and pass rolls' ratios, grips and backswings
   re-pinned, each with this design named.
2. The push map re-run for `full-roll` and `pass-roll` only, the other four types' stances unchanged: the workflow
   `.github/workflows/push-map.yml` restored from `6ff648c^` (it is also on the `push-map-workflow` branch), stage 2
   then the grip stage for those types. Their rows in `reference/derived` replaced; the defaults
   (`envelope-defaults.json`, the least complex plan per label across all six types) recomputed from the merged
   record; the band tables and the viewer's data rebuilt (`scripts/viewerData.ts`). The workflow is removed again
   afterwards.
3. The viewer's smoke test re-run on both rolls, and the roadmap's outcomes written.

The record's gap with today's play (side-on viewer outcomes, carried) is not this work, but the re-run makes the two
rolls' record today's engine's; the gap stays open for the other types.

## 6. Not in this design

- **Which type plays a wanted shot.** The viewer's defaults pick any type whose ratio lands in the wanted band: the
  pass roll plays 278 of the half roll's 317 defaults and 232 of the full roll's 273. Lower hands may change that, so
  the question waits for the rebuilt record.
- What punishes low hands (§4's ruling: its own design).
- The half roll's hands, the hand sliding to the ring, a measured ring or finger, a range of grips.

## 7. Housekeeping

Dependency, action and runner freshness, per the repository's practice, as a separate small PR landing first; it
covers the restored workflow's actions and runners.

## 8. Review (2026-11-12)

Panel of three (subtraction, completeness, framing), each ACCEPT_WITH_CHANGES. Applied: the ring has one home, a
placeholder constant (was also `reference/mallet.json`, whose schema needs a source); the fault's limit is the head,
as the Law and the user's account have it (was the ring's top); Law 29.1.1 quoted in `laws.json` with the check's
order, message and tests; §1 states that the account replaces Riches' and the user's earlier ruling; the assist is
held, reopened only on a measured miss; each default's handling named; the workflow's restore point named. Asked:
what happens on a miss ("Keep hands, record miss"). Decided: the new hands are the text-book default, the range of
grips staying carried.
