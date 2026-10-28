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

### The gate ruling, round 11 (2026-10-12): the arms hold their posture through the push

The user's ruling ("Posture holding in the push"): through the push each arm's flex takes the endpoint impedance the
arm shows while it holds a posture, and the rest of the stroke keeps Fortineau's rhythmic values
(`armStiffness`, `armDampingRatio`). Both fetched 2026-10-12 with `curl -sS -L`; the digests are of the raw PDFs.
Measurements of the human arm only.

| Short name | Work | URL | SHA-256 |
|---|---|---|---|
| Patel et al. | Patel, O'Neill and Artemiadis, "On the effect of muscular co-contraction on the 3D human arm impedance", *IEEE Trans. Biomed. Eng.* (2014), DOI 10.1109/TBME.2014.2323938, the accepted manuscript | https://horc-lab.github.io/pdf/patel2014effect.pdf | `9249e7dffcd03f2a29382419cf2995cf16dcc579da035c1f9748f85ed84d1a15` |
| Tsuji et al. | Tsuji, Morasso, Goto and Ito, "Human hand impedance characteristics during maintained posture", *Biol. Cybern.* 72:475–485 (1995), DOI 10.1007/BF00199890, a scan with no text layer, read from page renders | http://www.neuro-it.net/pdf_dateien/summer_2004/Tsuij%201995.PDF | `3571c22c3bb22d2c0fcfddb0dd8a88e96a642c750f90690662aeb26c49747db4` |

- Patel et al., method: four male subjects, "strapped to the chair and their right arm was coupled to the robot arm via
  a mechanical coupling", near the wrist; 8 mm perturbations "in 18 different directions in 3D space" over 100 ms, in
  seven configurations, at co-contraction 0, 50, 75 and 100 % of a maximum. Fig. 1A draws the human-centred frame with
  X up, Y lateral and Z forward from the subject.
- Patel et al., Table I, "ARM STIFFNESS CHARACTERISTICS FOR 0% CO-CONTRACTION, AVERAGED ACROSS ALL SUBJECTS", K zz (the
  fore–aft axis, along aim at a grip) over configurations 1–7: 1353.4, 854.3, 701.1, 504.2, 489.2, 601.2, 704.3 N/m;
  `armHoldStiffness` is their mean, 744 N/m, bounds 489.2–1353.4. Co-contraction raises the stiffness "anisotropic[ally]
  …, affecting primarily the secondary and tertiary axes"; the 0 % values are used, a posture held without deliberate
  co-contraction. Damping is not reported: "the opposing forces due to inertia (I) and damping (B) were very small".
- Tsuji et al., method: "While a subject maintains a given hand location, small external disturbances are applied to
  his hand by a manipulandum", in a horizontal plane; "hand stiffness and viscosity increase with the grip force of the
  subject".
- Tsuji et al., Table 4, "Estimated hand impedance while the subjects grasped the handle in order to keep the hand
  location", B yy (y from the shoulder towards the hand) for subjects A and C at four hand locations: 16.85, 30.02,
  19.32, 10.84, 27.69, 29.09, 19.91, 11.93 N s/m; `armHoldDamping` is their mean, 20.7 N·s/m, bounds 10.84–30.02.
- κ (`armStiffnessPerForce`, Takagi's grasp-force analogue) stays on top of `armHoldStiffness`: Patel's subjects held
  no handle, so his values carry no grasp force. The hold relaxes to the rhythmic flex from the ball's first departure
  from the face (gate round 13 ruling, "Relax from first departure", 2026-10-12) with `pushResponseTime`, the muscles'
  measured force rise (Augustsson et al.), so the hands' force never steps.

## P2b.2b.2b.2c: the mallet (design §5.3)

The sources behind the mallet's head, shaft and moment of inertia. Makers' published specifications and measurements of
real mallets only; none is tuned to a croquet figure. All fetched 2026-10-12, by the convention above: Oxford Croquet
pages with `curl -k -sSL -o page.html <URL>`, then `grep -vE ">(Views|Hits): [0-9]+<" page.html | shasum -a 256`, the
digest of the page with its counter line removed.

Every digest was reproduced by a second fetch the same day. For CA and Invictus, only the filtered digests reproduce.

| Short name | URL | SHA-256 |
|---|---|---|
| Russ | https://oxfordcroquet.org/tech/russ/ | `9b2ea41d79bf950f2565e4ec085bfbdb8fd6b14a5049395588559302b90f3a82` (counter removed) |
| Towlson | https://oxfordcroquet.org/tech/towlson/ | `be91d69449049248b33525b6d3ccc28bafeeb77e00cd0b501561c0e1e99f3d75` (counter removed) |
| Plummer, Mallets | https://oxfordcroquet.org/equip/mallets/ | `7b5d31075f23805c6d80a30775f30770feadc51f598265b2a37136d2e7e159ab` (counter removed) |
| Plummer, Mallet Making Notes | https://oxfordcroquet.org/equip/makingmallets/ | `19c16141ede05a28afeec8cf565940708dfd2075511ffed73505d3456fd9423f` (counter removed) |
| Pidcock, Manor House (oxfordcroquet.com, "Hits" counter) | http://oxfordcroquet.com/equip/mallets/pidcock.asp | `51a391b96eee5324f73b6574b52ba855032f666b32b11c00adfeede8b245adc2` (counter removed) |
| Pidcock, "Factors to Consider when Buying a Mallet" (SWF archive) | https://swfcroquet.org.uk/archive/SWAN/pidcock.htm | `9fb9bb4a7caacc146c36b299cfc7957a467a13f8e5979008ffe9263b8481f852` |
| CA, Choosing a Croquet Mallet | https://www.croquet.org.uk/?p=games/tech/ChoosingMallet | raw changes per fetch (Cloudflare token); stable: `grep -vF '__CF$cv$params' page.html \| shasum -a 256` → `803efdf07d1e9ac541c63f074c82186e8d5d6f1ddbcbe1ccab3ac880def48e91` |
| Wood Mallets, Mallet Options | https://www.woodmallets.com/croquet-mallet-options/ | `622477428686ab594cb686acec5db233a5457b9fb1f4f1b8a7987fb88ce0e0da` (`curl -sSL --compressed`; digest of the decompressed HTML) |
| Terminator UK price list | https://terminatormallets.com/uk-pricelist/ | `02cc45ef17cddfb6d4baf29c6046f902a1deef3e4da263f95860ff1edce987d9` |
| Invictus compare | https://invictusmallets.com/pages/compare-mallets | raw changes per fetch (Shopify IDs); stable: `grep -vE 'reqid\|requestId\|eventMetadataId\|shopify-y' page.html \| shasum -a 256` → `db1dca7d02661249347911ebd89448302944300ffb22e2a53e4b2208ab1d3206` |
| croquetdev Mallets | https://croquetdev.com/mallets.html | `f24dd2673e7e5cb4b326b77bc707fb4dc7536841ffc30847de14b1cb2324e0d9` |
| DB Mallets specifications | https://dbmallets.co.uk/our-mallets/specifications/ | `9dd9802e3019d00684795a8c127af1a86a062a28e2dd73f1546c71685c5ba605` (`--compressed`) |
| Croquet Network 2016 directory | https://www.croquetnetwork.com/croquet-network-home/2016/2/26/2016-croquet-mallet-directory.html | `d38c7abc52ca02c5d3063f0b35eef755d047b54ed30fbb8f0609bf402014acc1` (`--compressed`) |
| Fenwick Elliott, Testing MoI (Russ's "ref. 3"; dead host, Wayback) | http://web.archive.org/web/2015id_/http://www.insearchoftheperfectmallet.com/Testingmoi.htm | `a3bd77a697bc6b929bfe06537e09d41054982385f25c1cd2654af85755c1b536` |
| Fenwick Elliott, raw data spreadsheet | http://web.archive.org/web/2015id_/http://www.insearchoftheperfectmallet.com/spreadsheetcalcs.xls | `c3d4bf9a8f7d7f75dcfa4e53c8dad769d558ec6313683820d2b2272ee1f44000` |
| Fenwick Elliott, MoI theory (Russ's "ref. 2") | http://web.archive.org/web/2015id_/http://www.insearchoftheperfectmallet.com/moi.htm | `b161266905fc854bccf062a67c23f6a0efd62343dec68eff7500f5976d642fb7` |
| RPM True Force (Wayback) | http://web.archive.org/web/2016id_/http://rpmallets.co.nz/index.php?route=product/product&product_id=50 | `149110f376dd241f389b0ad100579a514595aa39da13d8153f4ee5dd89cff614` |
| RPM Carbon Rigid handle (Wayback) | http://web.archive.org/web/2016id_/http://rpmallets.co.nz/index.php?route=product/product&product_id=55 | `3aa68bdccf228f53c28c02db3b0ae80f88f2735564abdebde141533214cd46ec` |

### What each gives the model

- **Russ's method.** A bifilar torsion pendulum with the mallet upside-down in a cradle: "MoI = W.R2.T2 / 4.π2.L
  where: W is the total weight in kg of the mallet (+ shaft, where applicable)"; "it is the MoI of the head and shaft
  together that counts". It gives the moment about the shaft (`inertiaAboutShaft`), head and shaft together.
- **The shaft's share of Russ's figure.** "For a typical wood shaft with diameter approx. 2.5cm this can be calculated
  to be less than 1" (kg·cm²). Towlson gives 0.29 kg·cm². The model takes Russ's figure as the head's (design §4.1).
- **Russ's table rows:** "Pidcock 2000 11"" n/a / 146 / 60%; "Pidcock 3000 12"" 172; RPM 11" plain 92, with metal sole
  104; traditional round 9" 34.1 theory / 33.4 measured; rectangular 12" 34.7 / 37.6; DIY tube with brass and lead
  111. Russ gives no dimensions or masses for any mallet; his "effectiveness" percentages cannot recover the masses.
- **Plummer, Making Notes:** "Pidcock 2000 | 280 | 11 | 1325 | 2-14.5" (mm, in, g, lb-oz; 2 lb 14.5 oz is 1318 g);
  "Typical isolated heads weigh around 1 kg"; "A typical isolated shaft weights around 14 oz. (398 g)"; "You can get
  away with it if you put a really big radius or chamfer on the edges".
- **Plummer, Mallets:** "Typical mallet faces are 2.25" - 2.5" (57 - 64 mm) square"; "the trend now is for 10 - 11"
  (250 - 280 mm) heads"; "shaft length 36" (915 mm) or longer"; "The corners and edges of the face should be rounded or
  bevelled. If the edges are sharp then they may cut the ball or crack and flake during a mis-hit."
- **Law 5.5.3 (quoted by Towlson):** "The edges of the end-faces, however they are bevelled or shaped, are not part of
  the end-faces". No source publishes a bevel's size: `edgeRadius` is a placeholder.
- **Towlson** on the Pidcock 2000's build: "attach blocks of brass to the ends of the wood, and the faces are then
  attached to the metal (this is also the method used by Alan Pidcock in Manor House's '2000' model)".
- **Shaft weights:** RPM's handle "will add 8-10oz to your all up weight"; Wood Mallets: "The whole handle weighs and
  average of just 10 ounces".
- **The market's spread** (design §5.3): faces 50–65 mm wide and 44–63 mm high, heads 240–330 mm and whole mallets
  1.10–1.47 kg in the makers' pages above; measured moments 33–172 kg·cm² (Russ, with the shaft) and 110–160
  (Fenwick Elliott's turntable, heads alone).
- **Two specimens.** Russ's 146 and Plummer's 1325 g come from different specimens; neither source links them.
- **Not used:** Fenwick Elliott's RPM "Series 2000" figure of 80.5 kg·cm². The spreadsheet gives the same number for the
  Dawson Millennium, which suggests a spreadsheet error.

## P2b.2b.2b.3: the turf strike (design §6.2)

The sources behind the mallet head's ploughing law in turf: the rootzone's bearing (`turfYield`), the root mat's
strength (`turfMatStrength`), Reece's equation (`turfPloughFactor`) and the hand's breakaway strength (`gripLimit`).
Fetched 2026-10-16, each digest reproduced by a second fetch into a separate directory; the digests are of the raw
file (a web page is fetched with `--compressed`). An Oxford Croquet page is hashed with its counter line removed:
`grep -vE ">(Views|Hits): [0-9]+<" page.html | shasum -a 256`. Nothing fetched is committed.

| Short name | Work | URL | SHA-256 |
|---|---|---|---|
| Crum | Crum, "Engineering properties of high sand content soils used in golf putting greens and sports fields", MSU Research Update | https://archive.lib.msu.edu/tic/mitgc/article/199959.pdf | `58157c94013a67ebf3fc758113b4c8d3248e14012501f102b593ab54d4502ec9` |
| Mascitti 2017 | Mascitti, McNitt and Serensits, *Int. Turfgrass Soc. Res. J.* 13:330–337 (2017), doi 10.2134/itsrj2017.01.0010 | https://propel.umass.edu/sites/default/files/publications/2026-04/Mascitti%20et%20al.%2C%202017.pdf | `abfca285e1bea92240c274022c0810be6f65df2dc2764f6a6e6064c7915c6bed` |
| Mak & Chen 2014 | Mak and Chen, "Simulation of draft forces of a sweep in a loamy sand soil using the discrete element method", *Canadian Biosystems Engineering* 56:2.1–2.7 (2014) | https://library.csbe-scgab.ca/docs/journal/56/C14202.pdf | `2a91352a6fb847637ff918f4fad2f88bf2d360b9b8fc48173fd6020c7c7d092e` |
| Young 2009 | Young, Woolley, Armstrong and Ashton-Miller, "Hand-handhold coupling: effect of handle shape, orientation, and friction on breakaway strength", *Human Factors* 51(5):705–717 (2009), doi 10.1177/0018720809355969 (an open full-text copy; title, authors and pages confirmed from it) | https://archive.org/download/wikipedia-scholarly-sources-corpus/10.1177%252F0016986208330564.zip/10.1177%252F0018720809355969.pdf | `fbb87758079f74490bcd4aa3befe71b774f6e21525fab4a3f29d002263a4aca6` |
| Seo 2008 | Seo, Armstrong, Chaffin and Ashton-Miller, "The effect of handle friction and inward or outward torque on maximum axial push force", *Human Factors* 50(2):227–236 (2008) | https://stacks.cdc.gov/view/cdc/215050/cdc_215050_DS1.pdf | `11584ef7b610a0dde46774e7060b007d66583a12f509884d1cec5fde3ebd1908` |
| Katsuragi & Durian 2007 | Katsuragi and Durian, "Unified force law for granular impact cratering" (arXiv cond-mat/0703072; abstract at https://arxiv.org/abs/cond-mat/0703072) | https://arxiv.org/pdf/cond-mat/0703072 | `116f0e0beea2217cc73e0f8a0f5bff37a4ff389b8385671d84aa9365f5ab0e24` |
| Anderson 2018 | Anderson, Fleming, Sherratt and Severn, "Novel field equipment for assessing the stability of natural and hybrid turfs", *Sports Engineering* 21:321–331 (2018) | https://link.springer.com/content/pdf/10.1007/s12283-018-0273-2.pdf | `657f6488edd226715ec976d9b2e83bb20b93f809e9ae1c8a9b8bb4f50548d300` |
| Woods 2012 | Woods, "A report on putting green performance characteristics" (Asian Turfgrass Center, August 2012) | https://www.files.asianturfgrass.com/20120802_data_report.pdf | `07fab7ff79311beaf11b392d61b3885b5e82275bc4e508a7c18654bbe5cec045` |
| Caldwell 2023 | Caldwell, "Development and comparison of 3D dynamic models of golf clubhead-ball impacts", MASc thesis, University of Waterloo (2023) | https://uwspace.uwaterloo.ca/bitstreams/6b9d555c-f631-4399-90ed-768f01b850f4/download | `c579bf849033671c308dcff652a05852c69ccfe65c08c240f056d60fb67af317` |
| Tutelman | Tutelman, "Required grip pressure" (2 July 2020), quoting Schmidt (2007), Loughborough PhD thesis | https://www.tutelman.com/golf/swing/gripPressure.php | `df56ef3afcfdaacc2aebffa53b901412e8c284b7f4be62afce8719480ecc6704` (`--compressed`) |
| Gugan 5 | Gugan, Oxford Croquet, tech/gugan5 (cited since P2b.2b.2b.2a) | https://oxfordcroquet.org/tech/gugan5/ | `057c2161fc7e53b9f35655e6a9ba1b1d9bb0d182e3d37825116546ed317cb42e` (`curl -sSLk --compressed`; counter line removed; equals the digest recorded above) |

### What each gives the model

- **Crum:** the sand rootzone's ultimate bearing, "on the order of 45 psi" for the well-graded sands and "up to 25 psi"
  for the poorly graded, gives `turfYield`'s bounds (310 and 172 kPa) and its default, 240 kPa, between them.
- **Mascitti, McNitt & Serensits 2017:** the shear vane's torque range, 17.8–33.6 N·m (the extreme means in its
  Table 3), and the vane: "12 vertically oriented fins (2.0-cm length) welded at right angles to a cutting head
  (7.0-cm diam.)"; "The fins on the shear strength tester measure 20 mm. The sod profile was 44 mm thick, so the fins
  did not penetrate past the depth of sod harvest", and the mat "comprised ~75% of the penetration depth of the fins":
  the 2.0 cm is the fins' depth in the turf, that is their height. The conversion is ours:
  T = π·c·(D²H/2 + D³/12) = 2.437e-4 m³·c, so c is 73–138 kPa, default 105 kPa (`turfMatStrength`).
- **Mak & Chen 2014:** Reece's equation, which they call the Universal Earthmoving Equation and give "according to
  McKyes (1985)" as "D = (ρb·g·d²·Nγ + c·d·Nc + ρb·v²·d·Na)·w·sin(α + δ)" (their Eq. 1), and their Table 2 at 50 mm:
  Nγ 2.45, Nc 1.71 and Na 0.35, at a rake angle of 18.5° (`turfPloughFactor`; the other two cited, not used).
- **Young 2009:** the breakaway strength, "for a vertical cylinder (435 ± 27 N)" (`gripLimit`); for comparison, the
  fixed horizontal cylinder ("high friction") gave 668 ± 40 and 691 ± 132 N in Experiments 1 and 2, the low-friction
  horizontal cylinder 552 ± 104 N, and the vertical rail 337 ± 24 N.
- **Anderson 2018:** vane strengths "of the compacted Fireclay samples were 204, 156 and 64 kPa at 14.8, 17.5 and 20%
  gravimetric water content, respectively", and test densities "(1.2–1.6 Mg/m3)": the turf varies from lawn to lawn and
  day to day.
- **Katsuragi & Durian 2007:** the inertial drag 0.8·ρ·A·v² ("0.8 g Db v²" in their text, in the page's own symbols),
  cited as the check on dropping Reece's inertia term.
- **Seo 2008:** hand–handle friction coefficients of 0.33 (aluminium) and 0.77 (rubber), and axial push forces of
  65–179 N in the tables and text, cited.
- **Tutelman (Schmidt 2007):** "The total force near impact is only 160N, or 36 pounds" for a Ryder Cup professional,
  and for another trace "the force at impact is about 500N, or 113 pounds": golfers' grip 160–500 N at impact, cited.
- **Woods 2012:** "Surface hardness measured with a 500 g Clegg impact hammer ranged from 57 to 137 gravities, with a
  mean of 88.3": Clegg 57–137 g on greens, cited.
- **Caldwell 2023:** the only golf club–ground model found; of its contact forces, "there is no experimental data to
  compare these contact forces", cited.
- **Gugan 5:** stop-shots "by using a downward 'jab' just before impact, so that friction between the ground and the
  heel of the mallet stops it soon after impact"; "a mallet speed of 0.400U for the second tap, compared with 0.463U
  for the unrestricted swing" (the mean of the seven lowest ratios); "even for the best 'stop' ... the mallet speed has
  only been reduced to 0.295U" (the jab check, spec §7.3).
- **No source** measures a club's or a mallet's loss of speed in turf.

## P2b.2b.2c.1: the single-ball stroke (design §4.3, §4.4)

The source behind the effort law's shape: the torque a muscle can give falls as its speed of shortening rises. Looked
up 2026-10-18. Nothing fetched is committed.

| Short name | Work | URL | SHA-256 |
|---|---|---|---|
| Hill 1938 | A. V. Hill, "The heat of shortening and the dynamic constants of muscle", *Proc. R. Soc. Lond. B* 126(843):136–195 (1938), doi 10.1098/rspb.1938.0050 | https://royalsocietypublishing.org/rspb/article/126/843/136/29289/The-heat-of-shortening-and-the-dynamic-constants | none: no open full text was reachable |

### What each gives the model

- **Hill 1938:** the force–velocity relation of a shortening muscle, (P + a)(v + b) = constant, whose force falls as the
  speed of shortening rises; it shapes the torque that falls to zero at ω_max (design §4.4), which the model takes in a
  linear simplification, i·τ_0·max(0, 1 − ω/ω_max), not Hill's hyperbola. No open full text could be fetched on
  2026-10-18: the Royal Society's PDF, abstract page, the AHA "Classic Pages" excerpt and the SciSpace copy all answer
  HTTP 403, and the Scribd copy is a user upload, not a stable file. So the digest is not recorded and the relation is
  cited from the DOI and the abstract page, not from a quotation of the full text. The only text seen is the search
  index's abstract: "The hope was recently expressed (Hill 1937, p. 116) that with the development of a more accurate
  and rapid technique for muscle heat measurement, a much more consistent picture might emerge of the energy relations
  of muscles shortening (or lengthening) and doing positive (or negative) work." The form (P + a)(v + b) is the textbook
  statement of the paper's result, unverified here against its text.
- **The speed ceiling** is set from the CA's A4D mallet speed of 8.18 m/s already cited above ("Backswing against
  contact speed"): 1.1 × 8.18 = 9.0 m/s, rounded (plan decision 11).

## P2b.2b.2c.2: the croquet strokes' fit (design §3, §5.1, §6)

The sources behind `reference/swing.json`'s `ratioTargets` and the checks the fit and the distance check rest on.
Fetched 2026-10-19, each twice, with `curl -sSLk --compressed`. Where the page carries a per-fetch counter (Gugan's
"Views" line, Oxford Croquet's "Hits" line), the digest is of the page with that line removed
(`grep -v 'foot-item3">Views'`, `grep -v "Hits: "`), and the two fetches then agree. The CA's PDF is hashed raw.

| Short name | Work | URL | SHA-256 |
|---|---|---|---|
| Gugan 5 | Gugan, "Croquet Drives, Pass-Rolls, Stop-Shots and Scatter-Shots" (page updated 20.iv.26) | https://oxfordcroquet.org/tech/gugan5/ | `057c2161fc7e53b9f35655e6a9ba1b1d9bb0d182e3d37825116546ed317cb42e` (counter line removed; equals the digest recorded above) |
| Gugan 4 | Gugan, "The Physics of Croquet Strokes: Analysis of the CA high-speed DVD" | https://oxfordcroquet.org/tech/gugan4/ | `1b2eecb6b8c48253b30fe2c951c16a5edc99044edca324352ded51f3a5ff7e50` (counter line removed; equals the digest recorded above) |
| CA Dynamics | Croquet Association, *Project Croquet Dynamics* (2006), version 4 (PDF) | https://croquet.org.uk/?d=1475 | `f4df395c3a77aba0baef9f33fd5c1e7445833ad0a38d0a89d02cdd4781a873d2` (raw; equals the digest recorded above) |
| Gugan 2000 | Gugan, "Inelastic collision and the Hertz theory of impact" | https://oxfordcroquet.org/tech/gugan/ | `bf8f1a991888f30de81e05ff9f17362d4a0da975afef63fcdf93f5b2d4944b94` (counter line removed; equals the digest recorded above) |
| le Maitre | R. le Maitre, "Test Results and Comments on the Strike Shot, Croquet Stop Shot, Croquet Drive or Roll, and the Roquet Shot" (page updated 8.iv.25) | http://www.oxfordcroquet.com/tech/rlm/1/index.asp | `ff4579581171fe710296af8aed34eaf151edaa342ddd4b6fb2e69fde92ec4037` (`Hits:` line removed) |

Found with the web-search skill ("le Maitre croquet ball make drive distance ratio ..."); the page is `tech/rlm/1` on
`oxfordcroquet.com`, the `.org` site's older host.

### Check 1: the CA's ball-travel unit and where the ball speed was measured

- Unit: metres. Gugan 4, Table 2, row 1: "Total ball travel, L, m (from TEXT file)", values 0.93, 9.74 (A1D, A2D); the
  CA's own table heads the column "Ball Travel" with no unit, and its text says "ball movements of between 1 and 50m
  was obtained". Gugan 5 gives the CA's strokes in metres as well ("C1D ... ratio of 4.0 at distance 6.21 m").
- Measuring point: just after the impact, not at the release of a rolling ball. Gugan 4, §3: "The values of speed in
  the tables are thus averages taken a few milliseconds *after* impact, and over times and distances of only a few ms
  and mm respectively". The CA, §5: the software allows "accurate speed measurement of both balls and mallets".
  Gugan 4, §5 notes the A4D ball speed differs between his reading (10.03 m/s) and the TEXT file's (8.62 m/s).
- Consequence for the distance check: the ball speed it compares is the speed a few milliseconds after the strike,
  which the probe reads at the face's release (plan decision 9).

### Check 2: the stop's mallet speed

- Not stated as a speed: Gugan 5, Experimental, gives the drives' mallet speed ("The drives were of modest strength,
  with a mallet speed of about 3 m/s sending the croqueted ball about seven yards ...") and says of the stop-shots only
  "and the stop-shots were of similar strength". The stop is fitted at 3 m/s, and its `swing.json` note says so.
- Gugan 5's later "mallet speed of 0.400U for the second tap" is a fraction of the contact speed U, not a speed.

### Check 3: the balls' makes, and whether they differ

- Gugan 5 (the targets): "The balls were Dawson 'Internationals', all in excellent condition: independent
  measurements of their CoR were not made". Its mallet: "older type hard-faced, square design of weight 3.25lbs".
- Gugan 2000 (`faceRestitutionFit`, `faceContactTimeFit`): "The ball used was a Jaques "Eclipse" ball (commonly used
  in the game of croquet), which fell on a wooden mallet", M = 454 g, R = 46 mm; the mallet "of unrecorded wood and
  grain".
- Gugan 4 and the CA's report name no make for the video's balls.
- So the makes differ: the face fits come from a Jaques Eclipse and the targets from Dawson Internationals.
  le Maitre shows that the make matters (below). The difference is recorded, not corrected; the fit takes the face fits
  as sourced and moves only its listed candidates.

### Check 4: le Maitre's ratios by make (the 2.7–4.2 spread)

The 2.7–4.2 figures are the **stop shot's**, not the drive's. le Maitre, "Croquet Stop Shot": "Calculation of the ratio
of distance travelled by the forward ball to the backward ball gives a value of 4.2 for Walker, 3.7 for Barlow, 3.2
for old Jaques and 2.7 for new Jaques balls." His "Croquet Roll or Drive Shot" table (the mallet head weighted to
2210 g, "more mallet energy ... because of the follow through") gives forward and backward distances (m) and the
ratio:

| Ball | Stop shot ratio | Drive or roll: forward, backward (m) | Drive or roll ratio |
|---|---|---|---|
| Walker | 4.2 | 8.260, 3.300 | 2.8 |
| Barlow | 3.7 | 7.000, 3.460 | 2.0 |
| Old Jaques | 3.2 | 7.290, 3.440 | 2.1 |
| New Jaques | 2.7 | 6.340, 3.180 | 1.8 |

His ratio is the forward ball's distance over the backward ball's, from a test rig on a bowling green with balls of
the 1980s (he cites "the new rule book of 1986"). His "drive or roll" is the follow-through stroke with a weighted
head, a different stroke from Gugan 5's pendulum drive (4.23), and his stop shots (2.7–4.2) sit below Gugan 5's
jab stop-shots (7.15), so neither set is a target. They are recorded as the spread by make: the stop ratio falls from
4.2 to 2.7 as the ball's restitution falls.

## P2b.2b.2c.2b: the croquet stroke's squeeze (design §4, §5, §7)

The sources behind `scripts/filmedStrokes.ts`: Gugan 4's filmed strokes, the impact's yardstick, and Gugan 5's drive
and stop, the end-to-end check. Fetched 2026-10-21, each twice, with `curl -sSLk --compressed`. The digest is of the
page with its counter line removed (`grep -v 'foot-item3">Views'`); the two fetches then agree, and each equals the
digest recorded above. Fig. 4's image has no counter and is hashed raw; its two fetches agree.

| Short name | Work | URL | SHA-256 |
|---|---|---|---|
| Gugan 4 | Gugan, "The Physics of Croquet Strokes: Analysis of the CA high-speed DVD" (Don Gugan 17.iii.09; page updated 4.v.26) | https://oxfordcroquet.org/tech/gugan4/ | `1b2eecb6b8c48253b30fe2c951c16a5edc99044edca324352ded51f3a5ff7e50` (counter line removed; equals the digest recorded above) |
| Gugan 4, Fig. 4 | The same page's Fig. 4, "Contact times for all 2-ball drives, stop-shots, and close double-tap scatter shots" (JPEG, 732 × 724 px) | https://oxfordcroquet.org/tech/gugan4/fig4.jpg | `7bdacd510dc58989849aa9cb55fa45456e37dc3aa7c8d661102fb91ae79f9438` (raw) |
| Gugan 5 | Gugan, "Croquet Drives, Pass-Rolls, Stop-Shots and Scatter-Shots" (page updated 20.iv.26) | https://oxfordcroquet.org/tech/gugan5/ | `057c2161fc7e53b9f35655e6a9ba1b1d9bb0d182e3d37825116546ed317cb42e` (counter line removed; equals the digest recorded above) |

### Gugan 4, Table 5: the ten filmed two-ball strokes (`FILMED_STROKES`)

Table 5, "Collected data for all 2-ball drives, stop-shots, and close, double-tap scatter shots". Its columns, in
order: B2GS, B1GS, B1MS, B2MS, C3S, C10S, C20S, C1D, C3D, C10D. The rows `FILMED_STROKES` holds, verbatim as printed
(row 2 in mm; `filmedStrokes.ts` holds it in m):

| Row | Heading | B2GS | B1GS | B1MS | B2MS | C3S | C10S | C20S | C1D | C3D | C10D | Field |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Initial mallet speed, U, m/s | 1.68 | 1.75 | 5.10 | 5.87 | 1.92 | 3.57 | 5.80 | 2.50 | 4.96 | 7.00 | `malletSpeed` |
| 2 | Ball 1 - ball 2 separation, mm | 6 | 1 | 2 | 6 | 0 | 0.5* | 0 | 1* | 1* | 1* | `gap`, `nominal` (the asterisk) |
| 5 | Final mallet speed, W, m/s | 0.53 | 0.54 | 1.70 | 1.90 | 0.56 | 1.07 | 1.80 | 0.76 | 1.46 | 2.32 | `malletAfter` |
| 6 | Final speed ball 1, w1, m/s | 0.98 | 0.93 | 2.78 | 3.25 | 0.97 | 1.92 | 2.90 | 1.24 | 2.80 | 3.44 | `striker` |
| 9 | Final speed ball 2, v2, m/s | 1.75 | 1.80 | 5.6 | 6.13 | 2.20 | 4.10 | 6.30 | 2.88 | 5.50 | 7.76 | `croqueted` |
| 16 | Ratio, (v2/w1)r² | 3.6 | 4.3 | 4.9 | 3.6 | 6.5 | 5.2 | 5.5 | 4.8 | 4.2 | 5.1 | `squaredRatio` |
| 17 | Ratio, L2/L1 | 3.4 | 4.2 | <u>6.5</u> | 2.8 | 6.6 | 4.2 | 4.1 | 4.0 | 3.0 | 3.8 | `distanceRatio` (B1MS: `null`) |

Rows 12–14 (v2/w1, v2/U, w1/W), printed but not held, are the checks: C3S 2.27, 1.15, 1.73; C20S 2.17, 1.09, 1.61.
Computed from rows 1, 5, 6 and 9 they are C3S 2.268, 1.146, 1.732 and C20S 2.172, 1.086, 1.611, equal to the printed
values at their two decimals.

- **The notes.** "N.b. (i), the asterisks in row 2 indicate where balls were nominally in contact, but were in fact
  clearly separated, sometimes by more than the surface milling. (ii), the values of final mallet speed in row 5, W,
  are those *after* the double tap. (iii), the value underlined in row 7 for stroke B1MS is in error, and this leads
  to anomalies in rows 16 and 17 which are also underlined, see text." The page underlines B1MS's row 8 (L1 = 2.45 m),
  row 17 (6.5) and row 18 (µ1), so note (iii) counts one row short of the table as printed: the error is in L1, and the
  anomalies are the distance ratio and the lawn friction. Row 16 is computed from the speeds and roll, not from L1, and
  is not underlined. The text: "the value of 2.45 m for its travel distance L1 (row 8 of Table 5) taken from TEXT is
  anomalous ... a likely explanation is an inversion error in recording, e.g. writing 2.45 instead of 5.42". So B1MS's
  `distanceRatio` is held as `null` and its `squaredRatio` as printed.
- **What the speeds are.** §3: "The values of speed in the tables are thus averages taken a few milliseconds *after*
  impact ... their precision is limited to a few percent".
- **The three means**, §9.3, which `GUGAN_MEANS` holds and the test reproduces from the rows above (1.096, 1.709 and
  2.074 from the ten strokes):
  - v2/U: "The values of this ratio in row 13 of Table 5 show no clear systematic variation and, within the precision
    of measurement of about 3% for the speeds, are approximately constant at 1.10 ± 0.02 (sem)".
  - w1/W: "the mean from all ten measured values of the ratio is 1.71 ± 0.05".
  - v2/w1: "the only useful statistic is the mean value of the ratio, 2.07 ± 0.06".
- **Presets.** Each stroke is played on the preset design §5.2 names: the C…D strokes (drives) on `drive`, the C…S
  (stop-shots) on `stop-ac`, the B… (close scatter shots) on `single-ball`.

### Gugan 4, Fig. 4: the filmed timing (`FIG4_TIMING`)

Caption: "N.b. (i), times shown by frame number from time of first contact, with frame rate 8,000/sec. (ii), first
contact of mallet with ball 1, heavy line to left; second contact, heavy line to right. No clear separation could be
seen for stroke C1D because of shadows over the point of contact. (iii), ball 1 on ball 2 contact, cross hatched line."
§5.2: "The initial contact can be identified by the first slight movement of the ball, but its end is often uncertain
to a frame or two". So the cross-hatched bar's start is when the croqueted ball is first seen moving, and its end when
the croqueted ball leaves.

Both readings, in frames from the mallet's first contact (1 frame = 0.125 ms), each ±0.5 frame on top of Gugan's "a
frame or two". The research reading is the brainstorm's (2026-10-21), made by eye from the image. The re-reading is
this step's: the bars' ends located by pixel on the fetched image, with the frame scale from its 5- and 25-frame
gridlines (x = 205.5 and 618.5 px, so 20.65 px a frame, frame 0 at 102.25 px), rounded to 0.1 frame.
`FIG4_TIMING` holds the re-reading.

| Stroke | Research: mallet 1 | ball–ball | mallet 2 | Re-read: mallet 1 | ball–ball | mallet 2 |
|---|---|---|---|---|---|---|
| C3S | 0–5.2 | 4.8–11.3 | 11.0–19.1 | 0–5.2 | 4.8–11.2 | 11.0–19.1 |
| C20S | 0–5.2 | 4.0–10.0 | 9.8–16.2 | 0–5.1 | 4.0–10.0 | 9.8–16.2 |
| C1D | 0–6.5, then unresolved to 12.8 | 6.0–13.2 | 12.8–21.1 | 0–6.5, then unresolved to 12.8 | 5.9–13.2 | 12.8–21.1 |
| C10S | 0–6.1 | 4.8–11.1 | 10.9–19.0 | 0–6.1 | 4.8–11.2 | 10.9–19.0 |
| C3D | 0–7.9 | 4.8–11.3 | 10.8–16.2 | 0–7.9 | 4.8–11.2 | 10.9–16.2 |
| C10D | 0–~6.0 | 3.8–9.3 | ~6.3–13.3 | 0–6.0 | 3.9–9.4 | 6.3–13.3 |

The two agree within 0.1 frame everywhere. C1D's first heavy line ends at 6.5 frames and a light line runs on to the
second contact at 12.8 (the caption's shadow); `FIG4_TIMING` holds 6.5 as its first contact's end.

### Gugan 4, Table 1 and Table 2: the free collisions and the face (`FREE_COLLISIONS`, `TABLE2_FACE`)

Table 1, "Data for ball on ball collisions from HSAVI scatter-shots, series B. N.b. (i), The half-shaded columns
indicate double-taps, leading to low values of L2/L1 in row 3." Columns B4GS, B3GS, B7MS, B6MS, B3MS, B4MS, B5MS;
spacing (row 1) 33, 13, 13, 33, 13, 33, 33 mm:

| Row | Heading | B4GS | B3GS | B7MS | B6MS | B3MS | B4MS | B5MS |
|---|---|---|---|---|---|---|---|---|
| 5 | Ball /ball contact time, Tb, ms | 0.75 | 0.75 | 0.50 | 0.75 | 0.75 | 0.87 | 0.75 |
| 6 | Initial speed of ball 1, v1, m/s | 1.90 | 2.27 | 3.54 | 5.54 | 6.40 | 7.25 | 7.64 |
| 7 | Final speed of ball 2, v2, m/s | 1.57 | 1.97 | 3.00 | 4.90 | 5.60 | 6.13 | 6.53 |
| 8 | Ratio, v2/v1 | 0.83 | 0.87 | 0.85 | 0.88 | 0.88 | 0.85 | 0.85 |
| — | Double tap | | / | / | | / | / | |

- "examination of stroke B7MS showed that although not classified as faulty, it too was a clear double tap". "The
  three *clean* scatter shots in Table 1" are B4GS, B6MS and B5MS. The 0.50 ms (B7MS) and 0.87 ms (B4MS) readings are
  both in double-tap columns; Gugan marks the strokes as double taps but does not say that the double tap set the
  reading. "The ball on ball contact times, Tb, (row 5) show no significant variation with ball speed, and cluster
  around 0.75 ms (i.e. 6 video frames)". e: row 8 "has a mean value of 0.86 ± 0.01 ... This yields e = 0.72 ± 0.02".
- `FREE_COLLISIONS` holds the three clean strokes (1.90, 5.54 and 7.64 m/s, each 0.75 ms), each with Gugan's stated
  e = 0.72. That 0.72 is the seven-stroke mean: row 8 sums to 6.01, 6.01/7 = 0.859, and (A7), v2 = v1(1 + e)/2, gives
  e ≈ 0.717. For context only, not held: the three clean strokes' own e = 2·v2/v1 − 1 from rows 6 and 7 are 0.653,
  0.769 and 0.709, the scatter about that mean.
- The frame rate, §2: "images taken at a rate of 8000 per second (125 microseconds/frame)". `VIDEO_FRAME` is 1/8000 s.

Table 2, "Data for horizontal motion of ball in single-ball drives", re-read 2026-10-22 from a fresh fetch whose digest
equals the one recorded above. Its columns A1D–A4D; the rows `TABLE2_FACE` holds, verbatim as printed (row 4 in ms;
`filmedStrokes.ts` holds it in s):

| Row | Heading | A1D | A2D | A3D | A4D | Field |
|---|---|---|---|---|---|---|
| 4 | Duration of contact, Τh, ms (± 0.1 ms) | 1.00 | 0.75 | 0.60 | 0.60 | `contactTime` |
| 7 | Mallet speed before impact, U, m/s | 0.76 | 3.26 | 5.70 | 8.54 | `speed` |
| 8 | Mallet speed after impact, V, m/s | 0.41 | 1.53 | 2.72 | 4.02 | `malletAfter` |
| 9 | Ball speed after impact, v, m/s | 0.97 | 4.22 | 6.70 | 10.03 | `ballAfter` |

- `SINGLE_BALL_FACE` is A2D's rows 7 and 4, the column the face's law is anchored on; A1D, A3D and A4D are held out.
- A4D's v, §5: "the difference in ball speed v for A4D (10.03 m/s here, 8.62 m/s in TEXT) is significant"; the
  table's 10.03 is held. Row 13, "Ratio, (v - V)/U, ( = e)", 0.74, 0.82, 0.70, 0.70, is printed, not held.
- The caveat, §5.2, in full: "Even at 8000 frames per second the duration of contact is hard to measure because of lack
  of a clear view at the points of contact and separation, cf. figure 1(b) . The initial contact can be identified by
  the first slight movement of the ball, but its end is often uncertain to a frame or two". `TABLE2_CAVEAT` holds it
  as the design quotes it, elided between its first clause and its last.

### `VISIBLE_SHIFT`: the video's visibility threshold

Gugan 4 states a resolution, §2: the images "are about 200 x 40 millimetre (mm) when expanded to life-size ... in
principle it should be possible to measure the x and y positions, and the angles in the xy-plane for ball(s) and
mallet to about ± 0.2 mm and about ± 0.2 degrees of arc. In practice however, the accuracy is reduced because the
images show less than half the height of the ball, because the mallet had no clear reference marks, and also because
of parallax, of indifferent focus, and of shadow over crucial parts of the image: the uncertainties of measurement
prove to be several times greater than might be hoped." `VISIBLE_SHIFT` is therefore 0.2 mm, his stated resolution, as
plan decision 6 directs, rather than the 0.1 mm fallback. The "several times greater" in practice is recorded, not
applied: it gives no figure.

### Gugan 5: the drive and the stop (`GUGAN5`)

- The drive: "'pendulum' type drives, trying not to exert any extra force on the mallet shaft during the stroke";
  "The drives were of modest strength, with a mallet speed of about 3 m/s"; "The dozen values of distance ratio shown
  in figure 2 have a mean value of 4.23 ± 0.2 (where the uncertainty is the standard error of the mean) ... The
  experimental scatter, i.e. the standard deviation of individual strokes, however is 0.6".
- The stop: "stop-shots made trying to obtain the greatest possible distance ratio between the balls by using a
  downward 'jab' just before impact"; "the stop-shots were of similar strength"; "The mean value of the ratio for the
  twelve strokes is 7.15 ± 0.6, but the scatter is about ± 2.0".
- The mallet: "The mallet used was an older type hard-faced, square design of weight 3.25lbs: but the relevant mass
  for the analysis is the mass of the head of the mallet, which was found by taking moments about its point of balance
  to be 2.30lbs, thus giving a value for the mass ratio, M/m, of 2.30 ± 0.01."
- The balls: "The balls were Dawson 'Internationals' ... the makers report that under the standard bounce test '…
  International balls rebound … 35½" – 36" …' (Bryan Dawson, private communication) corresponding to a CoR, e = 0 .772
  ± 0.003" (the space in "0 .772" is the page's).

## P2b.2b.2c.2c: the contact laws (design §2, §4, §5.3, §6)

The sources behind the face's and the ball–ball contact laws, the search's candidates and the release check. Fetched
2026-10-22, each twice, with `curl -sSLk --compressed`; nothing fetched is committed. An Oxford Croquet page's raw
bytes differ between fetches only in its view counter (for Cross: "Views: 207" then "Views: 208"), so its digest is of
the page with the counter line removed (`grep -vE ">(Views|Hits): [0-9]+<" page.html | shasum -a 256`); the two
fetches then agree. The Laws PDF is hashed raw; its two fetches agree.

| Short name | Work | URL | SHA-256 |
|---|---|---|---|
| Cross 2017 | Cross, "Physics of croquet", *European Journal of Physics* 38(1):014001 (2017; online 2016-10-25), doi 10.1088/0143-0807/38/1/014001 (the CA's copy) | https://oxfordcroquet.org/tech/cross1/ | `9b16082ef872f501a5bf8b7e77b82e6022319a80592a922d152977fb6255220d` (counter line removed) |
| Sutherland 1995 | Sutherland, "Croquet Mechanics - A Numerical Analysis" (a 1995 report of computer modelling; the CA's copy, listed January 2021) | https://oxfordcroquet.org/tech/sutherland/ | `ec037ecf5c80e0fd527888c3ebfc65f2033b181585d1d92dcdfce271bab2c596` (counter line removed) |
| Hall 1994 | Stan Hall, "When a Mallet Strikes a Ball" (1994) | https://oxfordcroquet.org/tech/hall/ | `fc29166ad675c241fce8ecc3ec75f91beb81da42687496a56a4f2c91ec1cddd0` (counter line removed) |
| Plummer 2000 | Plummer, "Multiple Taps in Croquet Strokes - Electrical Conduction Tests" (2000) | https://oxfordcroquet.org/tech/multiple/ | `146921583e445265336b70e03645d63aadc860659440a9248d7de4a74276980d` (counter line removed) |
| CA, Croquet Dynamics | the CA's "Croquet Dynamics", the CA team's reading of the film | https://oxfordcroquet.org/tech/video/ | `e1d46aa5b8c62cc57e06d5e731a1d0fb66181624dc5b63bdd4ffc1688f5680f1` (counter line removed) |
| WCF Laws 2021 | World Croquet Federation, Laws of Association Croquet, 7th edition (February 2021), with the Official Rulings and Commentary (April 2021) | https://worldcroquet.org/wp-content/uploads/2021/04/Laws-Rulings-Commentary-combined-published-master-.pdf | `88aa26095b31cf1ce4da724d8c9bbcdfb0861c8c17a0980bf9d1301f266dab04` (raw) |

Sutherland 1995's URL is not recorded in the design or the 2026-10-21 probes. It was found on the CA's technical index,
https://oxfordcroquet.org/tech/, whose row "Croquet Mechanics - A Numerical Analysis" links `sutherland/`.

### What each source gives the model

- **Cross 2017** (§2.3): "there are effectively two separate collisions when k1 is significantly larger than k2"; the
  three collisions otherwise "merge into one long collision, in which case the distribution of energy between the two
  balls and the mallet depends on their relative stiffness." k1 is the face's stiffness and k2 the ball–ball's. His
  values are assumed, not measured, and are not used.
- **Sutherland 1995** (§2.3 context, not quoted by the design): "figures of contact times produced by the model are in
  reasonable agreement with measurements made by Prof." (the sentence continues on the page); the mallet–ball impact
  is "an extremely short impact time - a couple of milliseconds". Read for the contact times' order only.
- **CA, Croquet Dynamics** (§5.3): "cases where balls started quite close to one another did not show double taps as
  the mallet and strikers ball were still in contact when contact was made with the second ball."
- **Plummer 2000** (§5.3): "Single ball strokes and most croquet strokes showed no sign of multiple contacts but
  roll-shots indicated multiple contacts were taking place under the experimental conditions."; "2.65 volts was
  applied to the face of the mallet through an 82K Ohm resistor from a low impedance source (NiCad batteries)." The
  design's drive (1.3–1.4 ms) and stop (1.8–2.0 ms) contact times are the design's reading of the page, not re-checked
  here.
- **Hall 1994** (§5.3): "The time at which ball 2 moved away from ball 1 was fairly constant at about 1.8ms. The mallet
  remained in contact with ball 1 for a further period of 1.1 ms on average."; "The contact time between mallet and
  striker's ball exceeded the contact time between the balls for all except take-off strokes, the excess time being
  about 1.1ms."
- **WCF Laws 2021** (§6), not read again here; the design's quotes of Law 29.2.5 and the commentary at C29.11.1–C29.11.3
  and C28.3.2 stand as quoted in §6.

### The physics papers (not fetched; quoted from the 2026-10-22 research)

Each is cited by what the design takes from it. DOIs are those Crossref returns for the citation on 2026-10-22.

| Work | DOI | Used for |
|---|---|---|
| Jia, Mason and Erdmann, "Multiple impacts: A state transition diagram approach", *Int. J. Robotics Research* 32:84–114 (2013) | 10.1177/0278364912461539 | §2.3: the outcome "depends on the stiffness ratio k2/k1 but not on individual values of k1 and k2 ... It depends on the mass ratio m2/m1"; citing Brogliato (1999, pp. 306–307) |
| Brogliato, *Nonsmooth Mechanics*, 2nd ed., Springer (1999) | not confirmed | §2.3: the source Jia et al. cite, pp. 306–307; not read |
| Donahue, Hrenya, Zelinskaya and Nakagawa, "Newton's cradle undone: Experiments and collision models for the normal collision of three solid spheres", *Phys. Fluids* 20:113301 (2008) | 10.1063/1.3020444 | §2.3 (abstract only): a striker on a touching doublet differs qualitatively from a slightly separated one; "a three-body (soft-sphere) treatment is essential." |
| Hinch and Saint-Jean, "The fragmentation of a line of balls by an impact", *Proc. R. Soc. A* 455:3201–3220 (1999) | 10.1098/rspa.1999.0447 | §2.3: "all the contacts are lost" under a linear law as under Hertz |
| Herrmann and Seitz, "How does the ball-chain work?", *Am. J. Phys.* 50:977–981 (1982) | 10.1119/1.12936 | §2.3: the law's shape does not decide whether contacts open |
| Schwager and Pöschel, "Coefficient of restitution and linear–dashpot model revisited", *Granular Matter* 9:465–469 (2007) | 10.1007/s10035-007-0065-z | §2.3: the pulling dashpot, which both laws clamp at zero force |
| Hunt and Crossley, "Coefficient of Restitution Interpreted as Damping in Vibroimpact", *J. Appl. Mech.* 42:440–445 (1975) | 10.1115/1.3423596 | §4.2 candidate f: a dissipation that vanishes as the balls just touch |
| Kuwabara and Kono, "Restitution Coefficient in a Collision between Two Spheres", *Jpn. J. Appl. Phys.* 26:1230 (1987) | 10.1143/jjap.26.1230 | §4.2 candidate f: the √δ damping form the face already uses |
| Rosas, Romero, Nesterenko and Lindenberg, "Observation of Two-Wave Structure in Strongly Nonlinear Dissipative Granular Chains", *Phys. Rev. Lett.* 98:164301 (2007) | 10.1103/physrevlett.98.164301 | §4.2 candidate f: "A quasistatic precompression appears behind the primary pulse ... This precompression is due entirely to dissipation and does not exist at zero viscosity" |
| Carretero-González, Khatri, Porter, Kevrekidis and Daraio, "Dissipative Solitary Waves in Granular Crystals", *Phys. Rev. Lett.* 102:024102 (2009) | 10.1103/physrevlett.102.024102 | §4.2 candidate f: measured bead damping is not a linear dashpot, an exponent "close to α = 1.75" |

## P2b.2b.2c.2d: the follow-through (design §3.1)

The source behind the follow-through's pulse shape (`track.ts`, `pendulumAt` and `planPivot`).

### The minimum-jerk model (not fetched)

On 2026-10-24 every copy tried was behind a bot check, so nothing was fetched or hashed: the journal's PDF
(https://www.jneurosci.org/content/5/7/1688.full.pdf, a Cloudflare challenge), and Europe PMC's and PMC's copies of
PMC6565116 (a challenge page each). The DOI and the bibliographic details are those Crossref returns on 2026-10-24.
Nothing is quoted from the paper.

| Work | DOI | Used for |
|---|---|---|
| Flash and Hogan, "The coordination of arm movements: an experimentally confirmed mathematical model", *J. Neurosci.* 5(7):1688–1703 (1985) | 10.1523/jneurosci.05-07-01688.1985 | §3.1: voluntary movement as the smoothest one, minimising the integral of the squared jerk |

What the model takes from it is the principle only. The pulse's profile is the design's: a change of velocity Δv over T
with zero acceleration at both ends, a(s) = 6·Δv/T·s(1 − s), s = (t − start)/T, so that v rises as Δv·(3s² − 2s³), its
peak 1.5·Δv/T and its jerk ±6·Δv/T² at the ends. It is not the paper's point-to-point position profile and is not
checked against the paper.

### The re-contact rule re-checked (2026-10-25; `reference/laws.json`, 29.2.5)

The sources behind 29.2.5's note: the Law's test, and the readings that support judging a re-contact after the parting
by its effect (the user's reading, design decision 10; kept by the user's ruling "Keep 2 mm, relabel" on 2026-10-25).
Fetched 2026-10-25, the Oxford pages with `curl -k` from oxfordcroquet.com, whose pages carry a banner naming the
oxfordcroquet.org location; nothing fetched is committed. The Oxford pages are hashed with their counter line removed
(`grep -vE ">(Views|Hits): [0-9]+<" page.html | shasum -a 256`), the Laws PDF raw. The digests are of the files as
fetched that day and were not reproduced by a second fetch. Hall 1994's and Gugan 5's differ from those recorded
above, taken from the .org host (Gugan's copy here reads "Updated 18.iii.25"); every quotation below was checked
against these files.

| Short name | Work | URL | SHA-256 |
|---|---|---|---|
| WCF Laws 2021 | as above | https://worldcroquet.org/wp-content/uploads/2021/04/Laws-Rulings-Commentary-combined-published-master-.pdf | `88aa26095b31cf1ce4da724d8c9bbcdfb0861c8c17a0980bf9d1301f266dab04` (raw; equals the digest recorded above) |
| Vincent 2023 | Ian Vincent, "Notes For Referees", Association Croquet World Championship 2023 (July 2023; page updated 14.v.25) | https://oxfordcroquet.com/ref/ref-notes/ (now https://oxfordcroquet.org/ref/ref-notes/) | `53d054b428bbb85062284467260ace95c3cead269f33fe92be9fa7766753705a` (counter line removed) |
| Hall 1994 | Stan Hall, "When a Mallet Strikes a Ball" (page updated 28.iii.25) | https://oxfordcroquet.com/tech/hall/ (now https://oxfordcroquet.org/tech/hall/) | `b685ae3ef61fb53ea4cac4b2acbd2676759b1c16a67337279f390b4ad7ec1b57` (counter line removed) |
| Gugan 5 | Don Gugan, "Croquet Drives, Pass-Rolls Stop-Shots and Scatter-Shots" (page updated 18.iii.25) | https://oxfordcroquet.com/tech/gugan5/ (now https://oxfordcroquet.org/tech/gugan5/) | `c90770de4810efb9f81d48d65d3b9d97d675d37fbcba3ab3c5e82ebb5a0a64c9` (counter line removed) |

- **WCF Laws 2021**, Law 29.2.5: a fault "only if ... [the adjudicator] sees a separation between mallet and ball
  followed by a second contact between them": a visual test, with no timing, gap or effect. Law 29.2.7's "deduced
  from observation of the trajectories and speeds of the balls involved compared to what would occur in a lawful
  stroke of the same type" limits 29.1.7. C29.4: "Two faults – those covered by Laws 29.1.6.2 and 29.1.7 – can be
  deduced to have occurred on the basis of how the ball(s) involved travel as a result of the stroke". C29.11.5 extends
  the test "on the basis of the movement of the balls" to 29.1.6.2 only. So no Law or commentary gives an effect test
  for 29.1.6.1. C29.11.1, on multiple and prolonged contacts: "These are amalgamated partly in recognition of the
  difficulty in distinguishing between them." C29.11.4 (29.1.6.3): a contact "materially longer than the contact that
  necessarily occurs in a stroke of the same type". C29.12.1's "2mm" is a ball–ball gap in scatter shots, not a
  mallet separation, and is not cited for `mergeSeparation`.
- **Vincent 2023**, para 53: "It is not acceptable to say that more than one hit may have occurred on the basis of the
  stroke’s sound or the striker’s action. In practice, this means that only a gross mis-playing of the stroke can be
  judged to be a fault." Referee guidance for one championship, not a ruling; it supports a generous standard, not an
  effect test.
- **Hall 1994**: "three separate contacts of 1ms each with a gap of 1/10ms between them. The distinction between the
  contacts could not be detected by the unaided senses. A double tap became audible with an interval of 6ms between
  contacts." A scale in time, not distance; the open item of a time cap on the joining cites it.
- **Gugan 5**: the third of the three phases every stroke shows is "a double-tap by the mallet as it catches up with
  the striker's ball and delivers to it a further impulse"; "for straight croquet drives the inevitable conclusion
  from the physics of the stroke is that 90% of the energy and distance of the striker's ball comes from the
  double-tap I3"; a "further and often extended contact" much later is "better described as a push. Such pushes are of
  course always faults". The near-instant catch-up the model makes (gate 1, B.2, onset −20 ms: 0.16 mm and 0.085 ms
  after the parting, +151 % speed) is this lawful double tap.

## P2b.2b.2c.3a: the unified set-up

The source behind the drive's grip (design decision 3, §5; `profile.ts`, `HAND_BREADTH`): the drive's bottom hand
sits a hand's breadth below its top hand, after Riches's "With both hands at the top of the handle" (stop-shot, above)
and the user's account 3 (both hands "touching or close to touching", "one hand above the other").

### The hand breadth (2026-10-28)

Fetched 2026-10-28 with `curl -sSL`; the digest is of the raw PDF as fetched that day; nothing fetched is committed.
The user ruled the figure on 2026-10-28: the men's 50th percentile. The women's 50th percentile was rejected, and the
table gives no pooled figure.

| Short name | Work | URL | SHA-256 |
|---|---|---|---|
| NCSU anthropometry | The Ergonomics Center (NC State University), "Anthropometric Data for U.S. Adults (all dimensions in inches)", © 11/2024, a one-page summary of Gordon et al. 2014 (ANSUR II) | https://ergocenter.ncsu.edu/wp-content/uploads/sites/358/2026/02/01-Anthropometry-Summary-Tables.pdf | `a1ea470e6d67d5870a1b35da9fdf4a7d60f1982ee0b187827b1b3a7a3f820ee6` (raw) |

- **NCSU anthropometry**, row 29: "Hand breadth 3.19 3.46 3.78 0.17 2.83 3.07 3.35 0.15", the men's 5th, 50th and
  95th percentiles and SD, then the women's, in inches. The model takes the men's 50th percentile, 3.46 in = 87.9 mm
  (0.087884 m). The table gives no definition of the measurement beyond its name and a numbered figure; the model
  reads it as the breadth across the palm and takes that as the span one hand takes on the shaft, an assumption: a
  hand wrapped round the shaft may take more or less of it than the flat palm's breadth, and the user's "close to
  touching" allows a gap the model does not add.
- Its references line: "Gordon, Claire C. et. al (2014). 2012 Anthropometric Survey of U.S. Army Personnel: Methods
  and Summary Statistics." The population is US Army personnel, not croquet players; the figure stands for a typical
  adult hand, not a measured player's.
