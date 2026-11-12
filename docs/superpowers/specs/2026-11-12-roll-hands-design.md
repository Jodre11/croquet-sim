# The rolls' hands: design

**Status:** draft, 2026-11-12. **Follows:** the side-on viewer (`2026-11-11-side-on-viewer-design.md`), where the
full and pass rolls' hands were first seen side on.

## 1. Why

Seen in the side-on viewer, the full and pass rolls hold the mallet too high. Both presets have the top hand 0.61 m
and the bottom hand 0.30 m from the socket (shapes design §8, ruling 17, which gave the pass roll the full roll's
grips). The user's account (2026-11-12), stated as the rules of the grip:

- "On both full and pass rolls top hand is in the middle of the shaft."
- "For the full roll a finger is extended down the back of the shaft to touch the brass ring."
- "For the pass roll, the hand is fisted and touching the brass ring."
- "There is normally a brass ring on the shaft just before the mallet head. The hand can touch the brass ring but not
  the mallet head. Touching the mallet head is a fault."

The half roll's hands (Riches: top hand at the top of the handle, bottom hand almost half-way down) look right and are
unchanged. The drive, stops and single-ball stroke are unchanged.

## 2. The hands

A hand is a point on the shaft, its centre, measured from the socket (`SwingStance.top`, `.bottom`), as now.

| Quantity | Value | Basis |
|---|---|---|
| Shaft | 0.9144 m | `reference/mallet.json` `shaftLength`, sourced |
| Top hand, full and pass rolls | 0.4572 m | mid-shaft, the user's account |
| Brass ring's top above the socket | 0.025 m | placeholder, user ruling 2026-11-12 ("Use estimates") |
| Hand breadth | 0.0879 m | `HAND_BREADTH`, ANSUR II, sourced |
| Extended index finger's reach below the palm | 0.075 m | placeholder, same ruling |
| Pass roll's bottom hand | 0.025 + 0.0879/2 = 0.069 m | fist on the ring |
| Full roll's bottom hand | 0.025 + 0.075 + 0.0879/2 = 0.144 m | finger on the ring |

The ring and the finger's reach enter as named constants beside `HAND_BREADTH` in `swing/profile.ts`, each labelled a
placeholder with this ruling; the ring goes in `reference/mallet.json` as `ringHeight` (placeholder, no source), since
it is the mallet's. The bottom hands are derived from them, not typed in. The pass roll's lean (32°) and the full
roll's (31°) are unchanged.

## 3. The fault

Law 29.1.1 of the WCF Laws of Association Croquet (7th edition): a fault is committed if the striker "touches the head
of the mallet with a hand" (https://worldcroquet.org/wp-content/uploads/2021/04/Laws-Rulings-Commentary-combined-published-master-.pdf,
retrieved 2026-11-12). Planning rejects a stance or a shot's grip whose bottom hand's lower edge, `bottom −
HAND_BREADTH/2`, lies below the ring's top, naming Law 29.1.1. This is a set-up check, as `bottom < top` is now; the
hand is not modelled sliding on the shaft. The pass roll's fist sits exactly on the ring, so the check is inclusive.

## 4. The rolls' fits

Lowering both hands changes the grip's couple, the swung body and the pendulum (`buildContact`'s `swungBody`,
`gripCouple`, `pendulumOf`), so every fit made on the old hands is re-measured:

- The canonical full roll (ruling 16: drive 0.25 over 80 ms, ratio 1.161, band 1.0–1.2) and pass roll (ruling 17:
  drive 0.5 over 60 ms at a 4° split, 0.814 against Gugan 5's 0.83; ruling 18's 0.1 s follow-through, 0.859).
- Each roll's default backswing at 3 m/s, its hold firmness (ruling 15) and its turf clearance (ruling 18).

- The arms' assist (`reference/swing.json` `assistForce`, 241 N, `scripts/assistFit.ts`), fitted on the full roll as
  the weakest held roll, so that it meets the 9 m/s ceiling from its body-limited top. Refitting it moves every held
  roll, the half roll included; holding it as the body's, fixed, leaves the half roll untouched but the full roll may
  no longer reach the ceiling. **Gate**, with the measurements: refit or hold. Held is the default (assumption), the
  assist being a property of the body, not of a stance.

The order: measure both canonical rolls at the new hands with their current defaults. Where a roll lands in its band,
lawful and clear of the turf, its defaults stay. Where it does not, its `drive` and `window` are swept as ruling 16
swept them and the nearest lawful setting to the band is proposed. **Gate:** the measured ratios, and any refit, go to
the user before anything downstream is rebuilt.

**The known risk.** The pass roll's earlier low hands (top 0.45 m, bottom 0.09 m) had no lawful fit at its own 20°
split (ruling 17), which is why it took the full roll's grips. The split has since moved to 4°, and the full roll's
push to 80 ms pulses, so that result does not carry over, but it may recur. If neither roll has a lawful fit at the
new hands, the gate decides between keeping the user's hands with the miss recorded, or finding what in the model
punishes low hands (a candidate: the grip's couple, whose lever `r − b` grows as the bottom hand drops).

## 5. Downstream

After the gate:

1. `ENGINE_VERSION` bumped; the tests pinning the full and pass rolls' ratios, grips and backswings re-pinned, each
   with this design named.
2. The push map re-run for `full-roll` and `pass-roll` only, the other four types' stances unchanged; the map's
   workflow restored from `push-map-run`'s history, as the push-map outcomes allow. The record's rows for those types
   replaced, the band tables and the viewer's defaults rebuilt (`scripts/viewerData.ts`).
3. The viewer's smoke test re-run on both rolls.

The record's gap with today's play (side-on viewer outcomes, carried) is not this work, but the re-run makes the two
rolls' record today's engine's; the gap stays open for the other types.

## 6. Not in this design

- **Which type plays a wanted shot.** The viewer's defaults pick any type whose ratio lands in the wanted band: the
  pass roll plays 278 of the half roll's 317 defaults and 232 of the full roll's 273. Lower hands may change that, so
  the question waits for the rebuilt record.
- The half roll's hands, the hand modelled sliding to the ring, a measured ring or finger.

## 7. Housekeeping

Dependency, action and runner freshness, per the repository's practice, as a separate small PR landing first.
