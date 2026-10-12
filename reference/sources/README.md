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

## P2b.2b.2b.2b: the arm's flex and pendulum push

The sources behind `reference/contact.json`'s `armStiffness`, `armStiffnessPerForce`, `armDampingRatio`,
`armEndpointMass` and `pendulumForce` (P2b.2b.2b.2b design §3.1–§3.2, §4.2). Published measurements of the human arm
only; none is tuned to a croquet figure. Fetched 2026-10-11 with `curl -sS`; digests are of the raw file. Europe PMC's
REST API serves the open full texts; the search results give the paywalled papers' abstracts.

| Short name | Work | URL | SHA-256 |
|---|---|---|---|
| Fortineau | Fortineau, Siegler, Makarov and Rodriguez-Ayerbe, "Human arm endpoint-impedance in rhythmic human-robot interaction exhibits cyclic variations", *PLoS One* 18(12):e0295640 (2023), DOI 10.1371/journal.pone.0295640 | https://www.ebi.ac.uk/europepmc/webservices/rest/PMC10721195/fullTextXML | `f8f90e0aacad2b7c92a280601f91f80c398dfef9e7ce00c44124bbfa242ed067` |
| Fortineau S1 | The same paper's S1 Data (PDF): K, B and M per participant and condition | https://journals.plos.org/plosone/article/file?type=supplementary&id=10.1371/journal.pone.0295640.s001 | `809c734912522d4611bc3587a882c888b970871374393368b667070934f8db85` |
| Takagi | Takagi, Xiong, Kambara and Koike, "Endpoint stiffness magnitude increases linearly with a stronger power grasp", *Sci. Rep.* 10:379 (2020), DOI 10.1038/s41598-019-57267-0 | https://www.ebi.ac.uk/europepmc/webservices/rest/PMC6962455/fullTextXML | `89ed60740fa3b19e786bd4caf42a8e6680462e7d98034e9d3280ab5f12e21208` |
| Napper | Napper, Sayal, Holmes and Cudlip, "Sex differences in wrist strength: a systematic review", *PeerJ* 11:e16557 (2023), DOI 10.7717/peerj.16557 | https://www.ebi.ac.uk/europepmc/webservices/rest/PMC10725665/fullTextXML | `39cab2ef9a9ff77569284d05e09b94d0013717b55a4956ae423ff6e5f833f64a` |
| Perreault 2004 | Perreault, Kirsch and Crago, "Multijoint dynamics and postural stability of the human arm", *Exp. Brain Res.* 157(4):507–517 (2004), DOI 10.1007/s00221-004-1864-7 (paywalled; abstract only) | https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:10.1007/s00221-004-1864-7&resultType=core&format=json | `66155cefad7cd0f116ca8d5ef1ce985343de0e6e14b152d263527b5b6461da0a` |

- Fortineau, Experiment H (31 participants at two target heights): "The average estimated stiffness was 116 N/m (SD
  60), with a minimum value of 45 N/m and a maximum of 401 N/m. The average estimated damping was 9.9 Ns/m (SD 3.1),
  with a minimum value of 2.2 Ns/m and a maximum of 16.8 Ns/m." and "The average mass estimated for h 1 * was 459 g
  (SD 126) and 434 g (SD 94) for h 2 * with a minimum value of 272 g and a maximum of 893 g." (S1 Data label the
  second condition h3*.) Over both experiments: "endpoint-impedance parameters ranged from 45 to 445 N/m, 2.2 to 17.5
  Ns/m, and 227 to 893 g for the stiffness, damping, and mass, respectively." `armStiffness` is the 116 N/m mean;
  `armEndpointMass` the mean of the two mass means, 446.5 g. The task is low-effort and rhythmic, a ball bounced on a
  simulated paddle; it does not reach a roll's push.
- Fortineau S1, Tables 1–3: B/(2·√(K·M)) over Experiment H's 62 estimations spans 0.058–1.42 (12 exceed 1), the bounds
  of `armDampingRatio`; its value, 0.69, is the same ratio of the means, 9.9/(2·√(116·0.4465)).
- Perreault 2004, abstract: "Elasticity increased nearly linearly with increases in voluntary force generation while
  viscosity increased nonlinearly. This differential regulation resulted in limb dynamics that had a remarkably
  consistent damping ratio across all subjects and all tested conditions." It gives the law's shape (a stiffness linear
  in force, a constant damping ratio) but no number. The abstracts of Perreault, Kirsch and Crago 2001 (*Exp. Brain
  Res.* 141:312, DOI 10.1007/s002210100880) and 2002 (*J. Neurophysiol.* 87:2808, DOI 10.1152/jn.2002.87.6.2808) give
  none either, and their full texts were not reachable (paywalled, or HTTP 403).
- Takagi, Table 1, K yy at the centre posture: "166.9 ± 20.3" N/m at 5 N of grasp force to "205.2 ± 27.2" N/m at
  20 N, and "The endpoint stiffness magnitude increased linearly with the grasp force, and this linear relationship did
  not depend on the arm's posture or position in the workspace." `armStiffnessPerForce` is that slope, 2.55 N/m per N,
  an **analogue**: the force is the hand's grasp on the handle, not the arm's push. K yy's slope over the other
  postures and the second experiment is 2.46–2.56; K xx's is 0.23–0.91.
- Napper, Table 3, Hallbeck, "Flexion and extension forces generated by wrist-dedicated muscles over the range of
  motion", *Appl. Ergon.* 25(6):379 (1994), 30 males and 30 females, force transducer, isometric wrist-flexion force
  (N) over wrist postures from 90° flexion to 90° extension: males "Average over all postures: 73.15", from 47.54 (75°
  extension) to 104.24 (90° flexion); females "Average over all postures: 55.42", from 39.11 (75° extension) to 79.89
  (75° flexion). `pendulumForce` is the mean of the two, 64.3 N, bounded by 39.11–104.24 N. Hallbeck's paper is
  paywalled and was not fetched; the review's table is open. It is the force at the hand, with no lever arm given.

### The gate ruling (2026-10-11): the hands' push intent

The source behind `reference/contact.json`'s `pushForce`, the cap on the hands' push intent ("match resistance,
capped"). Fetched 2026-10-11 with `curl -sS -L`; the digest is of the raw PDF. Measurements of the human arm only.

| Short name | Work | URL | SHA-256 |
|---|---|---|---|
| Das and Wang | Das and Wang, "Isometric Pull-Push Strengths in Workspace: 1. Strength Profiles", *Int. J. Occup. Saf. Ergon. (JOSE)* 10(1):43–58 (2004), DOI 10.1080/10803548.2004.11076594 | https://www.ciop.pl/CIOPPortalWAR/file/8665/2013031212638&das1.pdf | `884a7e5e214f7fdce557bc01b3c4e5d0502c159acf232320de0ff36d859dc513` |

- Das and Wang, method: "The participants studied consisted of 8 men and 8 women, university students of working
  age"; "Radial pull and push exertions were measured for each of the 24 measurement locations defined by reach level
  (normal, maximum and extreme), vertical angle (φ) relative to the elbow (normal reach) or shoulder (maximum and
  extreme reach), and horizontal angle (θ) relative to the right shoulder"; the participants "were instructed not to
  actively use their left arm to either assist or stabilize themselves". One arm, isometric, 5 s exertions, the middle
  3 s averaged.
- Table 7, "Push Strength (N) of Standing Men", φ 0°, θ 90° (horizontal, straight ahead), mean: normal reach 89.39,
  maximum 77.92, extreme 106.34. Table 8, "Push Strength (N) of Standing Women", the same row: "660.22" (a misprint for
  66.22: its SD is 18.48 and the row's other means are 48–108 N), 48.49, 78.11. `pushForce` is the mean of the two
  extreme-reach means, the largest for both sexes, (106.34 + 78.11)/2 = 92.2 N; its bounds are the row's lowest and
  highest means, 48.49 and 106.34 N.
- No open two-handed standing push figure was reachable: Halim et al., "Elbow-Height Handle and Staggered Stance
  Exhibited Greatest Force in Pushing and Pulling", *Malays. J. Med. Health Sci.* 18(5):104 (2022), DOI
  10.47836/mjmhs.18.5.15, measures one, but its journal host did not answer and its PDF link returned 404. Seo and
  Armstrong's push studies (*Ergonomics* 2009, seated; 2010) returned no full text from Europe PMC (HTTP 500). One
  arm's push therefore caps the two hands' together.

The amendment (user, 2026-10-11: "The hands are primed and the brain is expecting the resistance but they are still
human hands") adds `pushResponseTime`, τ_push, at which the hands' sensed resistance follows the balls'. The rule
takes a voluntary force rise from force onset (no reflex latency), not a reflex loop's delay. Fetched 2026-10-11; the
digest is of the raw fullTextXML as Europe PMC returned it.

| Short name | Work | URL | SHA-256 |
|---|---|---|---|
| Augustsson | Augustsson, Gunhamn and Andersson, "Relationship Between Early and Maximal Isometric Upper-Body Push and Pull Force Production Among Elite Female and Male Swedish Track and Field Throwers", *Sports* 13(7):226 (2025), DOI 10.3390/sports13070226 | https://www.ebi.ac.uk/europepmc/webservices/rest/PMC12300538/fullTextXML | `d2df6c4d784f29551977e6564dcd9ff8e0b624da348f4628411947e2a696c588` |

- Augustsson, method: 17 female and 13 male elite throwers; an isometric bench press (push) at 50 % of the range of
  motion, both hands on the bar, "instructions to exert maximal force against the bar as quickly and forcefully as
  possible for 4 s"; "Force onset was manually identified … following the protocol described by Tillin et al.".
- Table 2, "Force @ 50 ms, %" to "Force @ 250 ms, %" of peak, bench press: females 39, 60, 72, 80, 84; males 37, 56,
  66, 72, 77. The time to 1 − 1/e (63.2 %) of peak, linear between 100 and 150 ms, is 113.4 ms (females) and 136.1 ms
  (males); `pushResponseTime` is their mean, 124.7 ms, rounded to 0.125 s. Its bounds are τ = −t/ln(1 − F(t)/F_peak)
  at each reported time, 101.2 ms (females at 50 ms) to 170.1 ms (males at 250 ms): the rise slows, so it is not
  exactly exponential.
- Not used: Sensors 18:1004 (2018, PMC5948752) quotes activation time constants of "5–40 ms" for the elbow muscles,
  from models (Winters and Stark 1985; Stroeve 1999), not a measured voluntary force rise; Maffiuletti et al.,
  *Eur. J. Appl. Physiol.* 116:1091 (2016, PMC4875063), a review, gives an electromechanical delay of "<13 ms for
  voluntary contractions" and no time constant.

### The gate ruling, round 2 (2026-10-11): the hands' fast impedance

The user's round 2 ruling ("Add fast impedance") made each hand a mass on its grip tissue, a stiff spring and damper,
in series with the arm's slow flex. Until round 3, `reference/contact.json` held that lumped hand as `handMass`
(0.259 kg), `gripStiffness` and `gripDamping`, from one model fitted to the measured driving-point impedance of the
hand–arm system; round 3 (below) replaced them. Fetched
2026-10-11 with `curl -sS -L`; the digest is of the raw PDF (the NIOSH author manuscript). Europe PMC's
`PMC4656148/fullTextXML` returned HTTP 500. Measurements of the human hand only.

| Short name | Work | URL | SHA-256 |
|---|---|---|---|
| Dong et al. | Dong, Welcome, McDowell and Wu, "Modeling of the biodynamic responses distributed at the fingers and palm of the hand in three orthogonal directions", *J. Sound Vib.* 332(4):1125–1140 (2013; the manuscript and Europe PMC print volume 232), DOI 10.1016/j.jsv.2012.10.003, PMC4656148 | https://stacks.cdc.gov/view/cdc/36218/cdc_36218_DS1.pdf | `b4ec02c52f3d966a4c945c37c3dd9b32b41f3119eea39b807b78166a494b5520` |

- Dong et al., method: "seven subjects participated in the measurements of the driving-point mechanical impedance
  distributed at the fingers and the palm of the hand exposed to three-dimensional vibrations. A broadband random
  vibration in the 16–500 Hz range was used"; "The applied hand forces were 30 N grip and 50 N push."
- The model: "M4 represents the effective mass of finger skin contacting the handle whereas M2 is the effective mass due
  to the remaining finger tissues"; "Whereas M3 represents the effective mass of palm skin contacting the handle, M1
  represents the remaining effective mass of the palm–wrist–forearm substructures" (z_h); in the x_h and y_h models
  "M1 in these models represents only the effective mass of the palm–hand dorsum substructure". M1 rides on the palm's
  contact spring and damper (K3, C3), M2 on the fingers' (K4, C4), the two branches in parallel on the handle.
- The direction: x_h, normal to the palm, along which a palm pushes a shaft forward; z_h's M1 includes the forearm.
- Table 2, "Comparisons of the mean property-based and mean response-based 5-DOF models", x_h, Property: M1 0.178 kg,
  M2 0.081 kg, K3 43,205 N/m, K4 109,271 N/m, C3 57.0 N s/m, C4 65.8 N s/m. "A study indicated that the mean
  property-based models are more reliable than the mean response-based models [30]; hence, the mean property-based
  models were used in the following applications."
- The lumping, held until round 3: one hand mass on one tissue spring and damper, m_h = M1 + M2 = 0.259 kg,
  k_t = K3 + K4 = 152,476 N/m, c_t = C3 + C4 = 122.8 N·s/m; the skin masses M3 and M4, rigid on the handle, were left
  out. Bounds: the same sums over
  the paper's other x_h models, the mean response-based 5-DOF (Table 1: 0.267 kg, 155,780 N/m, 131.9 N·s/m) and 4-DOF
  (0.297 kg, 162,586 N/m, 129.7 N·s/m), and the proposed ISO 10068 revision's 5-DOF (Table 3: 0.4574 kg, 69,844 N/m,
  210.1 N·s/m; "the palm contact stiffness (K3) in the model for the xh or yh direction is unrealistically much lower
  than that in the new model").

The round 3 ruling (user, 2026-10-11, "Full arm chain") replaces the lumped hand by the same model's whole chain,
un-lumped: `forearmMass` M0, `handMass` M1, `fingerMass` M2, `palmSkinMass` M3, `fingerSkinMass` M4,
`shoulderStiffness`/`shoulderDamping` K0/C0, `wristStiffness`/`wristDamping` K1/C1, `knuckleStiffness`/`knuckleDamping`
K2/C2, `palmStiffness`/`palmDamping` K3/C3 and `fingerStiffness`/`fingerDamping` K4/C4, each from the same file (no new
fetch), x_h, mean property-based (Table 2), provenance "direct".

- The topology, from the text: "The upper portions of the diagrams represent the fingers positioned on one side of the
  handle, and are simulated using two masses (M4 and M2) coupled via linear stiffness (K4) and viscous damping (C4)";
  "The lower portions of the diagrams constitute the palm–wrist–forearm substructures represented by two masses (M3
  and M1) coupled via K3 and C3"; "A group of spring–damper elements (K1 and C1 in the 4-DOF and K0 and C0 in the 5-DOF)
  was used to represent the boundary condition of each model"; in x_h and y_h "flexible connectors are required to link
  the effective masses of the palm and hand dorsum to that of the forearm ... the effective mass of the wrist and
  forearm is represented by M0 in the 5-DOF model"; K2, C2 is "a connection with very little stiffness (K2) but
  relatively large damping (C2) between the fingers and the hand dorsum". So: ground–K0–M0–K1–M1–K3–M3 (handle) and
  M1–K2–M2–K4–M4 (handle). The figures themselves were not read (the PDF's text layer has no drawing); the topology is
  confirmed by its undamped natural frequencies with the handle held, 26.7, 90.8 and 188.3 Hz, against Table 2's f0,
  f1, f2 of 26.7, 90.9 and 188.5 Hz (and the response-based set's 22.6, 80.3, 191.2 Hz, exactly Table 1's).
- Table 2, x_h, Property: M0 0.344, M1 0.178, M2 0.081, M3 0.015, M4 0.016 kg; K0 1611, K1 9988, K2 3991, K3 43,205,
  K4 109,271 N/m; C0 12.8, C1 36.0, C2 56.2, C3 57.0, C4 65.8 N s/m.
- Bounds: each parameter over the paper's three x_h 5-DOF sets, the response-based (Table 1), the property-based
  (Table 2) and the proposed ISO revision's (Table 3).
- K0 and C0 are recorded but not used by the engine: the arm's measured slow flex (`armStiffness`, Fortineau) is the
  same path from the forearm to the body, so it takes their place rather than sit in series with them.
