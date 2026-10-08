# P2b.2b.2b.1 — The Stance from the Hands: Design

**Product spec:** `2026-09-30-croquet-shot-lab-design.md` §4 (swing model).
**Swing spec:** `2026-10-04-p2b2b1-swing-shot-design.md` (§5.1 types, §5.2 derivation, §5.3 rejections, §5.4 the
default profile).
**Stroke-shape spec:** `2026-10-06-p2b2b2a-stroke-shape-design.md` (§5.3 defaults, §6 the fit).
**Roadmap:** P2 row; "P2b.2b.2a outcomes carried forward"; "User play data and checks (2026-10-08)".

**Why this split** (user decisions, 2026-10-08). P2b.2b.2b, the contact laws, is split into three steps, each with
its own PR, landing before P2b.2b.2c:

- **P2b.2b.2b.1** (this document): the stance from the hands. A player sets a stroke by where the hands are and where
  the face meets the ball, not by an angle; the rolls take the face angles Gugan measured.
- **P2b.2b.2b.2:** the strike and the turf. A Hertzian face–ball law with Gugan's measured e(U) and T(U); the ball–turf
  law under load (a transient hollow the ball runs along, a speed-dependent restitution, impulsive friction); the
  rolls' descent through contact; the hand's part in the second contact; the end-weighted head and the market's mallet
  dimensions.
- **P2b.2b.2b.3:** turf strike beyond a graze. The head in the new turf, a ploughing drag and the grip breaking, checked
  against Gugan's "jab" stop. It precedes P2b.2b.2c because the AC stop's calibration rests on the head–turf law.

Face presets beyond wood move to P3's player profiles: only a PTFE face has measured data. The success criterion of
P2b.2b.2b as a whole (user, 2026-10-08) is qualitative: each law has its analytic cases, and the rolls stop failing
(no chatter, no dead stop, credible distances); the ratios are recorded, not gated, and P2b.2b.2c calibrates them.

**What the diagnosis found** (throwaway probe, 2026-10-08; recorded in the roadmap). The full roll's dead stop above
about 4 m/s, its ratios of 35–62 and its follow-through re-hit come from a face leaning 45°: the carry pins the
striker's ball into the turf, the head outruns it, and at the hands' reach the face drops onto it. At Gugan's measured
31° the full roll gives ratios of 1.74–1.84 from 3 m/s to a knee-high backswing at full intensity, with no dead stop
and no re-hit; the pass roll at 34° gives 0.90–1.01. The re-catches at 0.1–0.4 m/s and the turf's throw-back remain at
every lean: they are P2b.2b.2b.2's.

**Amended 2026-10-08 (plan and implementation).**

- **Exports.** `StanceGeometry`, `handsAheadFor` and `stanceLean` are exports of `buildContact.ts`, not of the
  engine's API (§2).
- **Order.** The mechanism landed first, with the old roll leans round-tripped. The rolls then moved to Gugan's
  leans, with the refit.
- **Bit-identity.** The upright presets' bit-identity is checked by a full-precision digest on fixed backswings. The
  probes' sweeps solve their backswing through `backswingFor`, whose memo now keys on `up`, so a swept run can move at
  rounding level from the solver alone (§1 exit criterion 3, §5.2).
- **Test support.** `testProfile` takes a lean or a `handsAhead`, not both.
- **Findings from the run.** The outcome embeds `engineVersion`, so after the 0.8.0 bump the upright presets' digest
  is compared with the version normalised ("0.8.0" read as "0.7.0"); so compared it is identical over 81 runs, and no
  upright-preset line of either probe changed, not even in the swept rows. The AC stop's lean round-trips to 3e-17 rad
  at its canonical `up`, but off-canonical it moves by design (§3.3, about −0.082 rad/m at −4°): −2.4538e-4 rad at
  `up` −23 mm and +2.4713e-4 rad at −17 mm, the planned speed by at most 4.3e-9 relative, with no run rejected or
  accepted anew. The refit's `defaultSpeed` (3 against 3.0000000000000004) and the AC stop's `torqueMax` change in
  the last digit only, fit noise. At Gugan's leans the full roll's dead stop and canonical re-hit are gone, but the
  pass and half rolls' re-catches grew (11 and 7 face intervals), the full roll's ratio rises to 3.38 at 2 m/s, and
  the pass roll's sweep now reaches the cap on 14 runs: P2b.2b.2b.2's.

## 1. Goal and exit criteria

The stance is given in the player's terms. The grips along the shaft stay as they are; the shaft's lean at contact
is replaced by where the top hand is at contact: its horizontal distance ahead of the striker's ball's centre along the
aim. Riches gives the same two controls: "stand further forward and move your hands further down the handle to get
more slope on the mallet". The lean follows from the rigid geometry, and the point of impact on the ball follows from
the lean. The rolls' default hands are placed where Gugan's measured face angles put them.

Exit criteria:

1. The analytic cases of §5.1 hold.
2. Every preset's canonical contact pose (swing spec §5.5) has its default lean (§4): exactly 0 for single-ball, the
   drive and the GC stop, at any `up`; within 1e-12 rad of −4°, 24°, 31° and 34° for the AC stop and the half, full
   and pass rolls.
3. Force-table drives are bit-identical to `main`: `scripts/impactDigest.ts` byte-identical; the shot-mix work units
   (p99 143,084, p99.9 362,050, max 408,030), `SLOW_TESTS=1` and the obstacle fuzz reproduce exactly. The single-ball,
   drive and GC-stop presets are bit-identical in every result, their swept `up` included. The AC stop's lean
   round-trips only to rounding (a few 1e-17 rad), so its canonical figures are required unchanged at the probes'
   printed precision, its drift recorded, the probe's AC-stop reach-filter residue among them; its and the rolls'
   off-canonical `up` sweeps move by design (§3.3) and are re-recorded.
4. The three rolls' canonical setups meet P2b.2b.2a's exit criterion 3 at their new leans: `simulateShot` with
   `trajectory: true` from top to finish with no `RangeError`, no re-entry guard hit, no ball centre more than 5 mm
   above R, no `follow-cap`, the trajectory continuous at every boundary.
5. Each roll's refitted defaults (`fitStrokeShape.ts`) plan its canonical contact speed within ±2 % of 3 m/s, as in
   P2b.2b.2a's exit criterion 5; the single-ball, drive and GC-stop `swing.json` entries are byte-identical, and the
   AC stop's move at most at rounding level, recorded.
6. `ENGINE_VERSION` is "0.8.0".

The rolls' ratios, distances and re-hits are recorded in the roadmap as observations (§6).

## 2. Architecture

```
src/engine/swing/types.ts         SwingStance.handsAhead replaces .lean
src/engine/swing/buildContact.ts  new stanceLean, handsAheadFor; contactPose and validation read the lean from them
src/engine/swing/profile.ts       default leans (§4), each preset's handsAhead derived from its lean at load
src/engine/simulate.ts            ENGINE_VERSION 0.8.0
reference/swing.json              the rolls' refitted defaults (fitStrokeShape.ts, unchanged)
reference/sources/README.md       Gugan 4 Table 6 cited
tests/engine/support/shot.ts      testProfile converts a test's lean; backswingFor's memo key gains the contact height
```

`profile.ts` imports the two functions from `buildContact.ts`, which imports nothing from `profile.ts`. `SwingStance`
is already exported, so its shape changes in the public API; the two functions stay internal until P3 or P4 reads them.
Everything stays under the determinism lint (`+ − × ÷ √`, the engine's `sinCos` and `atan2`).

## 3. The stance

### 3.1 Type

```ts
/**
 * How the player stands to a stroke type and holds the mallet: where the top hand is at contact, `handsAhead` (m), its
 * horizontal distance ahead of the striker's ball's centre along aim (negative behind), the top and bottom hands'
 * distances from the socket along the shaft (m, 0 < bottom < top), the top hand's grip tension γ_T and the bottom
 * hand's grip g_B from contact on (in (0, 1]). The shaft's lean at contact follows (stanceLean).
 */
export interface SwingStance {
    readonly handsAhead: number;
    readonly top: number;
    readonly bottom: number;
    readonly gripTension: number;
    readonly bottomGrip: number;
}
```

The profile has no stored reader outside the engine until P3, so `lean` is replaced, not kept alongside.

### 3.2 The geometry

`contactPose` (swing spec §5.2 steps 3–5) places the face R + `START_GAP` short of the ball's sunk centre along −f,
offset `up` along the face's upward axis; the head's centre L/2 behind the face's centre; the socket ρ above the head's
centre along the shaft; and the top hand `top` up the shaft from the socket. With the shaft leaning α (positive pitches
the face down), f = cos α·aim − sin α·ẑ and the shaft's direction is sin α·aim + cos α·ẑ, so the top hand lies

X = A·sin α − B·cos α,   A = ρ + top − up,   B = R + START_GAP + L/2

ahead of the ball's centre along aim. `side` and the sink move nothing along aim. A > 0, since |up| < ρ (the contact
lies on the face) and top > 0.

`handsAheadFor(lean, top, up, geometry)` evaluates X with the engine's `sinCos`. `stanceLean(handsAhead, top, up,
geometry)` inverts it. With D² = A² + B², X = D·sin(α − φ) for φ = atan2(B, A); on the branch where α − φ lies in
[−90°, 90°], cos(α − φ) = S/D with

S = √(A² + (B − X)·(B + X)),   α = atan2(A·X + B·S, A·S − B·X).

S² is formed as A² + (B − X)(B + X), not D² − X², so that at X = −B the product vanishes, S = √(fl(A²)) = A exactly,
the sine's numerator A·X + B·S is exactly 0, and the lean is exactly 0. An upright shaft therefore round-trips with no
rounding, which keeps exit criterion 3's bit-identity for the upright presets. `geometry` is the ball's radius, the
head's length and its radius. One helper computes A and B for both functions, in one operation order, so that a lean
derived by `handsAheadFor` and read back by `stanceLean` sees the same A and B bits.

On the branch, X rises strictly with α, from −D (α = φ − 90°) to A (α = 90°), so `handsAhead` alone, with the grips,
fixes the lean. The other branch (α below φ − 90°, the hands far behind and below the socket) is not a stance.

### 3.3 The point of impact

The face is flat, so it meets the ball where its normal passes through the ball's centre: R·sin α above the centre, on
its back, whatever `up` (which moves the face, not the point on the ball). The player's two cues are one angle: hands
further forward, or the same hands lower on the handle, steepen the lean and raise the point of impact.

With the hands held still, the lean follows the contact height on the face: at fixed X, dα = −sin α·dA/(A·cos α +
B·sin α), the denominator positive on the branch. A higher `up` lowers A, which steepens a forward lean (the head sits
lower under hands that have not moved) and leans a backward one, the AC stop's, further back; an upright shaft stays
exactly upright (X = −B gives 0 at any A). On the rolls it is about 0.05° per millimetre (the full roll 31.47° at
`up` +10 mm, 30.54° at −10 mm).

### 3.4 Rejections

`planStroke` replaces "|lean| ≥ 90°" by: `handsAhead` outside (−D, A) for the stroke's `top` and `up`, a `RangeError`
naming `profile.stance.<type>.handsAhead`, its value and the range; at or beyond A the shaft would lean past 90°, at
or below −D the hands lie off the branch. `validate` gains the world's ball radius (`planStroke` and `plannedSpeed`
pass it), and the check runs after the contact-off-face check, since A > 0 rests on |up| < ρ. `handsAhead` joins the
finite-number checks in place of `lean`. Every other rejection, the head below the turf at contact among them, stays
as it is.

## 4. The default stance

The leans stay in `profile.ts`, beside the grips, quoted; each preset's `handsAhead` is derived from its lean when the
profile loads, by `handsAheadFor` with the reference mallet and ball, at the preset's typical contact on the face (`up`
0; −20 mm for the AC stop, its canonical contact). The stored input is the hand position; the lean is only where its
default comes from. R is `ballReference.diameter.value / 2` and ρ is `headDiameter / 2`, computed as `defaultWorld` and
`contactPose` compute them, so the upright presets' derived X and the pose's B agree to the bit.

The defaults are defined by their leans for the mallet and ball the profile is built with: the reference ones here, so
a change to the reference mallet (P2b.2b.2b.2's market dimensions) re-derives the hands and keeps the leans. A stance
entered as hands keeps its hands when its mallet changes, and its lean follows; whether P3 re-derives a player's
defaults per mallet is P3's decision (§8).

| Preset | Lean | Source | top, bottom (m) | handsAhead (m) | Impact above the centre (mm) |
|---|---|---|---|---|---|
| single-ball, drive, GC stop | 0° | unchanged | 0.805; 0.70, 0.60, 0.45 | −0.1603 (over the socket) | 0 |
| stop-ac | −4° | unchanged | 0.805, 0.45 | −0.2202 | −3.2 |
| half-roll | 24° | Gugan 4 Table 6 | 0.805, 0.42 | +0.1964 | 18.7 |
| full-roll | 31° | Gugan 4 Table 6 | 0.61, 0.30 | +0.1964 | 23.7 |
| pass-roll | 34° | Gugan 4 Table 6 | 0.45, 0.09 | +0.1400 | 25.7 |

**The rolls' leans.** Don Gugan, "The Physics of Croquet Strokes: Analysis of the CA high-speed DVD", Table 6, measured
from the Croquet Association's 8,000 frame/s video, the angle α of the mallet face, "the same as the forward angle of
the mallet shaft": half rolls 23.5° and 25° (C3H, C10H); full rolls 31°, 29°, 33° and 30° (C1F, C3F, C10F, C25F); pass
rolls 36°, 34° and 32° (C3P, C10P, C25P). The defaults are the means at the table's 1° resolution: 24°, 31° and 34°.
They replace Riches' "about 75 degrees with the ground" (15°) and "approximately 45 degrees" (45°), and the pass roll's
48° ("at least as much as for a full roll"), which `profile.ts` keeps in its comments as coaching cues, superseded by
the measurement (user decision, 2026-10-08). Riches' hand positions on the handle stay.

**The swing presets' leans** are unchanged, and so is their provenance. Gugan's uppish two-ball drives and stops
measure −8° to −2° (Table 5), against the drive's 0° and the AC stop's −4°. Both are P2b.2b.2c's calibration targets,
so the measurement goes to P2b.2b.2c as a sourced check, not into this step.

**Riches' cues**, quoted in `profile.ts` beside the derived values: the single-ball hands "slightly forward of the
mallet head" until contact; "Stand further forward over the balls, with your front toe level with the back of your
striker's ball" (half roll); "move your hands down the handle and stand further forward to increase both the slope of
the handle and the fractional distance travelled by the striker's ball". The feet are not modelled (§8).

**Sources.** `reference/sources/README.md` gains a section citing Gugan 4 Table 6 and the definition of α, each shot's
angle listed. Gugan 4 is already in its table; if the page as fetched now hashes differently, the row records the new
fetch date and SHA-256. Nothing is mirrored.

**Refit.** `scripts/fitStrokeShape.ts` reads the pose through `contactPose`, so it needs no change; re-run, it rewrites
the rolls' defaults (each `defaultBackswing` h₀ for 3 m/s at intensity 0, and the hands' tempos the placeholder rule
derives from it), and leaves the swing presets' entries byte-identical.

## 5. Testing

### 5.1 Analytic cases

- The round trip: `stanceLean(handsAheadFor(α, …), …)` returns α within 1e-12 rad over leans −30° to 80° in 5° steps,
  tops 0.3–0.9 m and `up` −0.03 to 0.03 m.
- An upright shaft: X = −B gives a lean of exactly 0 for every top and `up`.
- The pose: at `up` 0 and at `up` ±10 mm, `contactPose` puts the top hand `handsAhead` ahead of the ball's centre
  along aim, within 1e-12 m, the face pitched by the lean `stanceLean` gives.
- Rejections: `handsAhead` at or beyond A, at or below −D, and non-finite, each naming `handsAhead`.

### 5.2 Migration and bit-identity

The tests that set a lean to test the lean ("turns the lean into the contact angle", "pitches the face down by the
lean", the rejection of a lean of 90° and the others in `buildContact.test.ts`) build their stance through
`testProfile`. It accepts a `lean`, with the shot's `up` (default 0) and the ball's radius (default `TEST_BALL.radius`),
and converts it with `handsAheadFor` and the profile's own mallet after its overrides; the tests that build their shot
at `up` ≠ 0 pass it. The exact checks of θ_c at a non-zero lean (`toBe(-0.2)` and the like) become 1e-12 tolerances;
at lean 0 they stay exact. A test of the 90° bound becomes a test of `handsAhead` at A. `backswingFor` reads the lean
through `stanceLean`; its memo key adds `stroke.contact.up` and the world's ball radius, and its doc no longer says the
planned speed ignores the contact point. `CANONICAL_CLEARANCE` is regenerated for the three rolls, and every roll
figure the lean moves in a test is re-recorded, each listed in the plan. Exit criterion 3's bit-identity is checked
against `main`.

## 6. Probe (recorded in the roadmap)

`scripts/swingProbe.ts` and `scripts/strokeProbe.ts` re-run in full, raw output kept under `docs/superpowers/probes/`
(dated 2026-10-08). Their canonical tables gain each preset's `handsAhead`, lean and point of impact, the player's
terms. Recorded against P2b.2b.2a's: the rolls' ratios over 2–4 m/s, their canonical runs (downswing, impact, finish,
re-hit), the re-catches, the cap and flag tallies and the faults; the single-ball, drive and GC-stop figures confirmed
bit-identical and the AC stop's canonical figures unchanged at the printed precision; the AC stop's and the rolls'
off-canonical `up` sweep rows re-recorded, their lean following the contact height (§3.3). The "User play data and
checks" full-roll line is re-measured (knee, intensity 1, distances in yards on a 10 s lawn).

## 7. Amendments to earlier specs (docs, in this PR)

- **Swing spec §5.1–§5.4** (user decisions, 2026-10-08): the stance's input is `handsAhead`, the lean follows (§3); the
  rejection of |lean| ≥ 90° becomes §3.4's; the default profile's leans are §4's, the rolls' from Gugan 4 Table 6 with
  Riches' angles kept as cues; the "Geometry" paragraph's 45° clearance is restated for the new leans. An amendment note
  heads the spec, and the sections' text is updated where it states the stance.
- **Stroke-shape spec §5.3:** the rolls' defaults are refitted at the new leans.

## 8. Deferred

- To P2b.2b.2b.2: Gugan's stroke angle β (6–16° descending on the rolls, against the model's 2–4°: P2b.2b.2a's hands
  arrive at contact with no vertical velocity); the face–ball and ball–turf laws; the hand's part in the second
  contact; the end-weighted head; the market's mallet dimensions and shapes.
- To P2b.2b.2c: Gugan's face angles for the drives and stops (−8° to −2°) as a sourced check; every ratio.
- To the articulated body (beyond P2b): the feet and the body between them and the hands, from which the hands'
  position would follow; the bottom hand's position in space, which follows the rigid shaft here.
- To P3: grip style pre-filling the hands (product spec §4), per-player hand positions and how an entered stance
  behaves when the player's mallet changes (§4), face presets beyond wood; exporting `stanceLean` and `handsAheadFor`
  when a reader needs them.

## 9. Roadmap changes (in this PR)

- The P2 row: P2b.2b.2b split into 2b.1, 2b.2 and 2b.3 as above, with their exit criteria; "Turf strike beyond a
  graze" becomes 2b.3; the face presets beyond wood move to the P3 row, whose "the stance (hands, grips and lean)" is
  restated as the top hand's position and the grips.
- A new section, "P2b.2b.2b decisions and findings (2026-10-08)": the split and its success criterion; the diagnosis;
  the sourcing for 2b.2 and 2b.3 (the roll's second contact, the face's e(U) and T(U), the turf under load, head–turf
  and ploughing, end-weighting, faces), each with its URL; the mallet survey against `mallet.json`.
- "P2b.2b.1 outcomes carried forward", model limits: "The bottom hand's position is not an input: each preset sets the
  shaft's lean…" restated (the top hand's position is the input; the bottom hand's follows the shaft); the deferred
  articulated body narrowed to the feet and the body.
- The rolls' re-measured figures (§6), and the full-roll line of "User play data and checks (2026-10-08)".
