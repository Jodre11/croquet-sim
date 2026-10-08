# Stroke-shape sources (P2b.2b.2a design §6.1)

The sources behind `reference/swing.json` and the figures extracted from them. The originals are cited, not mirrored:
each is listed with its URL, its fetch date and the SHA-256 of the file as fetched. Short quotations follow, verbatim
with the HTML tags stripped, each annotated with what it does and does not tell the model (user decision 2026-10-07).
Heights and angles would convert to SI as the plan's Step 2 states; none was found, so none was converted.

## Sources

All fetched 2026-10-07 with `curl -k -sSL` (the Oxford Croquet sites' certificate is broken). Gugan 4 was re-fetched
2026-10-08 for P2b.2b.2b.1; its digest is that fetch's. To check a later fetch against the one used here, compare its
SHA-256 with the digest below.

| Short name | Work | URL | SHA-256 of the fetched file |
|---|---|---|---|
| Riches | John Riches, *Croquet Technique* (Oxford Croquet). The whole book is one page, its chapters anchors in it. | http://www.oxfordcroquet.com/coach/riches/croqtech/index.asp | `c9693c2efd4171b266ca5756e4ec513a808ea810f799925dfaf93ea6c426181f` |
| Gugan 4 | Don Gugan, "The Physics of Croquet Strokes: Analysis of the CA high-speed DVD" (Oxford Croquet) | https://oxfordcroquet.org/tech/gugan4/ | `de69699eb6ed9c388a7d4545e4503002a1e9e6ef360d144c7bb8dd1b2a63c0dd` |
| Gugan 5 | Don Gugan, "Croquet Drives, Pass-Rolls, Stop-Shots and Scatter-Shots" (Oxford Croquet) | https://oxfordcroquet.org/tech/gugan5/ | `b6e1c2fe9e5487c735e52511fd7dc7c6b5ad7d94db9bb52f1048ca824004d8a5` |
| CA Dynamics | Croquet Association, *Project Croquet Dynamics* (2006), version 4 (PDF) | https://croquet.org.uk/?d=1475 | `f4df395c3a77aba0baef9f33fd5c1e7445833ad0a38d0a89d02cdd4781a873d2` |

Search for a backswing-against-speed or downswing-time measurement (`croquet mallet backswing height swing speed
measurement`): the results were a 3D motion-capture study of wrist flexion (Applied Sciences 2020, 10(12), 4192, not
fetched: its snippet gives wrist-flexion correlations, no backswing against speed), the CA report above and equipment
guides. None gives a pair, so nothing further was fetched.

## Backswing range (low, high), in m

Nothing in any file gives a backswing height, angle or range for any stroke type. Only comparisons:

- Single-ball, Riches, The Roquet: "concentrate on making a SLOW, REASONABLY LONG backswing. The length
  of the backswing will depend on the desired strength of the shot i.e. how far you want the ball to go."
- Rush, Riches: "Take a longer backswing than you would if you were hitting a single ball the same distance".
- Stop-shot, Riches: "The backswing should not be shortened for a stop-shot".
- Three-quarter roll, Riches: "if a maximum backswing is used and the arms are swung confidently from the shoulders".
- Full roll, Riches: "to overcome the 'hitting rather than sweeping' tendency, try using a shorter backswing."
- Pass roll, Riches: "Many players obtain best results by hitting through the TOP HALF of the two balls, with
  very little backswing but an exaggerated (low) follow-through."
- Drive, half roll: nothing on the backswing beyond the half roll's "for long shots it is harder to keep the shoulders
  still and maintain the angle of mallet slope, as a longer backswing with more force is required."

## Pendulum and hands: the split and the hands' path

No split and no hands' backswing angle in any file. What is said:

- Single-ball, Riches: "The arms should swing freely from the shoulders so that the hands move
  FORWARDS throughout the swing, and until the instant of contact they should be slightly forward of the mallet head
  (hence the slight 'pulling' feel)." Also: "Use your TOP hand on the shaft, with the bottom hand completely removed.
  This will force you to take a long backswing and move the top hand FORWARD throughout the swing". This is the
  forward swing, not a still top hand.
- Stop-shot: "Some try to keep the hands still so that the arms do not swing from the shoulders. With both hands at the
  top of the handle, they use the wrists to swing the mallet fairly loosely from the hands."
- Half roll: "It is most important that the forward slope of the mallet handle (and consequently the mallet face)
  should be MAINTAINED throughout the swing; and for this to happen both hands must move FORWARD at the SAME RATE."
  The handle slopes at "about 75 degrees with the ground" (half roll), "approximately 60 degrees" (three-quarter
  roll), "approximately 45 degrees" (full roll). These are the mallet's slope, not the hands' backswing line.
- Full roll: "most players need to start with their elbows bent, and then straighten them during the swing until both
  arms are reaching straight out in front."
- Pass roll: "The shoulders must be kept still while the arms swing forward, with elbows beginning in a bent position
  and being straightened as both arms reach forward during the swing."
- Gugan 4, section on drives: the drives "were made with a pendulum-like swing with a nearly horizontal
  mallet head at impact". Gugan 5: "the drive, especially when the mallet is swung freely from the top of
  the shaft in a 'pendulum' style and falls largely under its own weight."

## Backswing against contact speed, downswing time

None. The CA data give contact (mallet) speeds with no backswing recorded:

- Gugan 4, Table 2 (single-ball drives A1D to A4D): mallet speed U in m/s, with ball travel; no backswing.
- CA Dynamics, Single Ball Shots: "A1D 0.93 0.78 1.04 1 1.4", "A2D 9.74 3.20 4.31 2 0.9", "A3D 24.73
  5.23 6.86 4 0.9", "A4D 45.85 8.18 8.62 5 0.9" (ball travel, mallet speed m/s, ball speed, contact distance mm,
  contact time ms). No backswing.
- Gugan 5: "The drives were of modest strength, with a mallet speed of about 3 m/s sending the croqueted
  ball about seven yards". No backswing.

These are contact speeds against ball travel, not backswing pairs, so `swing.json` has no `kinematics`.

## Finish

- Single-ball, Riches, The Roquet: "The follow-through should be directly along the line of aim, and
  also as low as possible along the ground."
- Drive: "The grip should be firm enough to ensure a smooth follow-through, in spite of the opposing weight of two
  balls, rather than one."
- Stop-shot (AC and GC alike): "The most important and distinctive feature of the stop-shot is that there should be NO
  FOLLOW-THROUGH at all, or as little as possible."
- Half roll: "The grip needs to be firm, with the mallet head following through the ball and onto the ground."
- Full roll: "The follow-through should be as long as possible, with the mallet head moving low along the ground."
- Pass roll: "Many players obtain best results by hitting through the TOP HALF of the two balls, with very little
  backswing but an exaggerated (low) follow-through."

## Roll tempo

- Half roll: nothing.
- Full roll, Riches: "It is also usually necessary, depending on the length of the roll and the
  speed of the court, to incorporate some degree of push and acceleration which, of course, must be smooth and
  combined with a firm grip in order to avoid suspicions of illegality."
- Pass roll: "The grip must be very firm, and the mallet head must be moved forward with a pronounced BUT SMOOTH
  acceleration."
- Three-quarter roll (not a stroke type here): "A SMOOTH acceleration throughout the swing, combined with a firm grip
  to ensure that the mallet is not checked when it contacts the ball, should produce a perfectly legal shot."

No figure for a roll's tempo (a time or a speed) was found.

## The rolls' face angles (P2b.2b.2b.1 design §4; `profile.ts`, not `swing.json`)

Gugan 4, Table 6, row 1, "Angle of mallet face, α, º", measured from the CA's high-speed video. Gugan defines α in the
section on drives as "the mallet angle, α, the same as the forward angle of the mallet shaft, and which when positive
tends to put roll on the ball". The rolls' default leans are the means at the table's 1° resolution (user decision,
2026-10-08):

| Stroke | Shots and α (°) | Mean (°) | Default lean (°) |
|---|---|---|---|
| Half roll | C3H 23.5, C10H 25 | 24.25 | 24 |
| Full roll | C1F 31, C3F 29, C10F 33, C25F 30 | 30.75 | 31 |
| Pass roll | C3P 36, C10P 34, C25P 32 | 34 | 34 |

These replace Riches' "about 75 degrees with the ground" (half roll), "approximately 45 degrees" (full roll), and the
pass roll's handle sloping "at least as much as for a full roll". `profile.ts` keeps them as coaching cues. Table 5's
two-ball drives and stops measure α from −8° to −2°. They are P2b.2b.2c's calibration check, not used here.
