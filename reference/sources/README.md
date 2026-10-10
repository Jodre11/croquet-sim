# Stroke-shape sources (P2b.2b.2a design §6.1)

The sources behind `reference/swing.json` and the figures extracted from them. The originals are cited, not mirrored:
each is listed with its URL, its fetch date and the SHA-256 of the file as fetched. Short quotations follow, verbatim
with the HTML tags stripped, each annotated with what it does and does not tell the model (user decision 2026-10-07).
Heights and angles would convert to SI as the plan's Step 2 states; none was found, so none was converted.

## Sources

All first fetched 2026-10-07 with `curl -k -sSL` (the Oxford Croquet sites' certificate is broken). Every Oxford
Croquet page embeds a view counter in its footer (`<div id="foot-item3">Views: N</div>` on oxfordcroquet.org, `<span
class="footerstyle">Hits: N</span>` on oxfordcroquet.com), so the raw file hashes differently on every fetch. Their
digests below are therefore of the page with its counter line removed, taken from a re-fetch on 2026-10-08 and
reproduced by a second fetch the same day:

```
curl -k -sSL -o page.html <URL>
grep -vE ">(Views|Hits): [0-9]+<" page.html | shasum -a 256
```

One quotation from each page was spot-checked against that re-fetch. The CA PDF has no counter; its digest is of the
raw file, and it reproduced on 2026-10-08. To check a later fetch against the one used here, compute its digest the
same way and compare.

| Short name | Work | URL | SHA-256 (Oxford pages: counter line removed) |
|---|---|---|---|
| Riches | John Riches, *Croquet Technique* (Oxford Croquet). The whole book is one page, its chapters anchors in it. | http://www.oxfordcroquet.com/coach/riches/croqtech/index.asp | `22c97859ab5bc2837f046a6e394bc3c4b11ac4819e401ff74b9647b01b635984` |
| Gugan 4 | Don Gugan, "The Physics of Croquet Strokes: Analysis of the CA high-speed DVD" (Oxford Croquet) | https://oxfordcroquet.org/tech/gugan4/ | `1b2eecb6b8c48253b30fe2c951c16a5edc99044edca324352ded51f3a5ff7e50` |
| Gugan 5 | Don Gugan, "Croquet Drives, Pass-Rolls, Stop-Shots and Scatter-Shots" (Oxford Croquet) | https://oxfordcroquet.org/tech/gugan5/ | `057c2161fc7e53b9f35655e6a9ba1b1d9bb0d182e3d37825116546ed317cb42e` |
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

## The strike and turf laws (P2b.2b.2b.2a design §3.1, §4)

Fetched 2026-10-09 with `curl -k -sSL`; digest of the page with its counter line removed, as above.

| Short name | Work | URL | SHA-256 (counter line removed) |
|---|---|---|---|
| Gugan 2000 | Don Gugan, "Inelastic collision and the Hertz theory of impact", Am. J. Phys. 68, 920 (2000), DOI 10.1119/1.1285850 | https://oxfordcroquet.org/tech/gugan/ | `bf8f1a991888f30de81e05ff9f17362d4a0da975afef63fcdf93f5b2d4944b94` |

Gugan 4 (above) gives A4R's ground restitution and penetrations (Table 4(b), §7.1), which the bed is fitted to
(`scripts/turfFit.ts`). Penner, Can. J. Phys. 80, 931 (2002), and Hall, "When a Mallet Strikes a Ball", are cited
in `reference/friction.json` and are not re-fetched here.

- Gugan 2000, "both sets of data can be expressed by K(U) = K0 + K1U^0.4" with K(U) ≡ (1-e²(U)), K0 and K1 "0.213(5)
  and 0.077(4) on wood": the face's restitution against its closing speed on wood. It does not cover faces other than
  wood, or speeds outside 0.5–6 m/s.
- Gugan 2000, "This gave exponents of 0.77 ± 0.03 and -0.23 ± 0.03 for A(U) and T(U), respectively, compared with
  values of 0.8 and -0.2 given by Eqs. (5)." with Table I (T 0.97 ms at 2.19 m/s, 0.79 ms at 5.50 m/s): the contact's
  duration over 2.19–5.50 m/s. Outside that range it is extrapolated.
