# P2b.2b.2b.2c — The Mallet: Design

**Product spec:** `2026-09-30-croquet-shot-lab-design.md` §4 (impact phase).
**Swing spec:** `2026-10-04-p2b2b1-swing-shot-design.md` (the head as a solid cylinder, the swung body, the re-entry
guard).
**Stance spec:** `2026-10-08-p2b2b2b1-hands-stance-design.md` (`handsAhead`, the leans, `REFERENCE_GEOMETRY`).
**Laws spec:** `2026-10-09-p2b2b2b2a-strike-turf-laws-design.md` (the Hertzian face law's closure).
**Roll spec:** `2026-10-11-p2b2b2b2b-roll-stroke-design.md` (carry mode, the handover rule, the preset digest).
**Roadmap:** P2 row; "P2b.2b.2b decisions and findings (2026-10-08)": "End-weighting" and "The mallet survey";
"P2b.2b.2b.2b outcomes (2026-10-12)".

**Why this step.** P2b.2b.2b.2 lands in three steps (user decision, 2026-10-09): the laws (2a), the roll's stroke (2b),
then the mallet (this document). The engine's head is a uniform solid cylinder 9" long and 76 mm across, a legacy
Jaques head off the market, with a massless shaft:

- modern heads are square in section (faces mostly 50–64 mm), mostly 10–12" long;
- they are end-weighted: Russ measured 33–172 kg·cm² about the shaft, against the engine's 47;
- whole mallets weigh 1.10–1.55 kg against heads of 0.87–1.05 kg, so the shaft the engine omits is a few hundred
  grams, high on the swung body, where it moves the pendulum's moment about the top hand.

**Circularity.** Every figure here is a measurement or a maker's published specification of a real mallet, never a
coaching ratio, Gugan's or Hall's roll figures, or the user's play. The ratios are recorded, not gated; P2b.2b.2c
calibrates them.

**Vocabulary.** "Split" and "ratio" keep their croquet meanings only. "Face" is the flat end the Laws mean; a contact
on a bevel or a side is not on the face.

## Decisions (user, 2026-10-12)

- **Housekeeping needs no PR.** The lockfile pins the latest of every dependency; only a stale `node_modules` lagged.
  TypeScript 7 stays blocked (typescript-eslint 8.71.1 needs `<6.1.0`, svelte-check 4.7.6 `^5 || ^6`); the actions
  (checkout v7, setup-node v7) and `ubuntu-26.04` are current; the repo has no IaC.
- **The default mallet becomes a market-typical square, end-weighted head**, over the user's bespoke mallet and over
  keeping the cylinder as the default. Every preset moves and is re-recorded. The cylinder stays as a supported shape.
- **The end-weighting enters as the measured moment about the shaft** (Russ's quantity), over a composite construction
  of body and inserts (unpublished by makers) and over a uniform box only.
- **The shaft gains mass in this step**, a uniform thin rod, over deferring it to P2b.2b.2c.
- **The square head is a rounded box**, a box with an edge radius, over a sharp box: continuous normals across the
  bevels, and a sharp box as its zero-radius limit.
- **A discriminated head shape** (approach A), over a single rounded box replacing the cylinder and over a generic
  support-function collider: the cylinder's code stays byte-for-byte, so each step has a bit-identical before and
  after.
- **The face law keeps the head's mass** in its reduced mass. The end-weighting acts through the rigid body (the face
  force at the contact point on the full tensor), not through the law; the off-centre closure, where the effective mass
  at the contact point is lower than the head's, is P2b.2b.2c's.
- **The default is anchored on one real, measured mallet, the Pidcock 2000 11"** (§5.3), over per-field medians of
  the market, which can combine into a head that cannot exist. The sourcing pass found no mallet with every figure
  published; the user chose the Pidcock 2000 with Plummer's typical figures for its gaps, each flagged, over Fenwick
  Elliott's "Watts 2" head (coherent, but not a known market model) and over Towlson's Bamford/Hobbs head (calculated
  I, a narrow 12" head).
- **The edge radius is 3 mm, a flagged placeholder**: no bevel figure is published anywhere. Chosen over a sharp box
  and over 5 mm.

Settled at spec review (2026-10-12), each with one sensible resolution:

- **The head–turf law keeps the head's mass** (`simulateImpact.ts`'s `lawFromStiffness(contact.head.mass, …)`), as the
  face law does. P2b.2b.2b.3 rebuilds the head–turf law next, so re-closing it here on the mallet's mass would be
  re-fitted at once.
- **Force-table runs stay the bare head's instrument**: `validateImpact` rejects a force plan whose head is not a
  cylinder or whose shaft has mass. Every production stroke is tracked (`buildContact.ts`'s `kind: "track"`), so the
  box and the shaft never meet `faceContact` or `stepHead`.
- **The measured moment is the box's alone, and required for it.** A round head keeps its uniform solid; a round
  head with a measured moment (Russ's traditional 9") waits for the bespoke-mallet preset, out of scope.
- **The box keeps independent width and height.** The market's faces are often rectangular (DB 50×60 mm, Wood
  Mallets 60×55 mm), and the roadmap's scope is the market's dimensions; the cost is one inertia term.

## 1. Goal and exit criteria

The head is a cylinder or a rounded box, with its moment about the shaft set from a measurement; the shaft is a
uniform rod rigid on it; the default profile is a real, market-central modern mallet.

Exit criteria:

1. The analytic cases of §7.1 hold.
2. The ratchet of §7.2 holds: after each of its steps 2–4 the impact digest, the phase-2 digest (`shotMix`) and a
   full-precision digest of every preset's canonical and sweep runs are bit-identical to the baseline.
3. After the default's switch (§7.2 step 5), `impactDigest` and `shotMix` remain bit-identical; every preset's lean is
   kept within 1e-12 rad; each preset's re-fitted default plans 3 m/s within 2 %.
4. Every preset's canonical setup meets P2b.2b.2b.1's exit criterion 4: `simulateShot` with `trajectory: true` runs
   from top to finish with no `RangeError`, no re-entry guard hit, no ball centre more than 5 mm above R, no
   `follow-cap`, and the trajectory continuous at every boundary. The pass roll's turf rebound (19.17 mm on the old
   head, accepted 2026-10-12) is re-measured and listed; a larger rise goes to the gate.
5. No impact ends with the head overlapping a ball as handed over, over the late re-hit sweep of every preset.
6. The pre-flight gate (§8) has run and the user has ruled on it.
7. The figures of §9 are recorded in the roadmap. They are observations, not gates.
8. `ENGINE_VERSION` is "0.11.0".

## 2. Architecture

```
src/engine/impact/types.ts          MalletHead: radius → shape (HeadShape union), + shaft {mass, length}
src/engine/impact/shape.ts          new: HeadShape, faceHalfHeight, the rounded box's distance, regions and support
src/engine/impact/rigidBody.ts      + boxInertia(m, L, h_y, h_z, I_shaft) (§4.1); solidCylinderInertia unchanged
src/engine/impact/contacts.ts       headBallContact, headLowestPoint, headBottom, headClosing dispatch on shape.kind;
                                    the cylinder branches unchanged; faceContact stays cylinder-only
src/engine/impact/track.ts          + malletBody(head); swungBody and carryBody build on it; the weight terms (§4.3)
src/engine/impact/integrate.ts      stillReaching dispatches on shape; region names per shape; the shaft's weight
src/engine/impact/simulateImpact.ts cylinderDistance → headDistance; validateImpact's shape and shaft rules (§5.1)
src/engine/swing/types.ts           SwingProfile.mallet: head union, shaftMass
src/engine/swing/buildContact.ts    validate and contactPose per shape; ρ → faceHalfHeight(shape)
src/engine/swing/profile.ts         the default mallet (§5); REFERENCE_GEOMETRY from it
src/reference/index.ts              malletReference reads the new fields
reference/mallet.json               the market's bounds and the new fields (§5)
reference/sources/README.md         the sources' rows
tests/engine/support/impact.ts      TEST_HEAD: shape cylinder, shaft {mass 0, length 0.9}; headKinetic and
                                    impactEnergy count the shaft
scripts/swingProbe.ts, strokeProbe.ts, impactProbe.ts   shape-aware head fixture and bounding sphere
src/engine/simulate.ts              ENGINE_VERSION "0.11.0"
```

The fault judge (`faults.ts`) and `detect.ts` do not change: the judge reads only `impact-off-face`, and `detect.ts`
knows nothing of the head.

## 3. The head's shape and its collider

### 3.1 The type

`MalletHead.radius` gives way to `shape: HeadShape`:

```ts
type HeadShape =
    | { readonly kind: "cylinder"; readonly radius: number }
    | { readonly kind: "box"; readonly halfWidth: number; readonly halfHeight: number; readonly edgeRadius: number };
```

The body frame is unchanged: x along the head (the face normal), y to the side, z up the shaft. `faceHalfHeight(shape)`
is the cylinder's radius or the box's `halfHeight`. It replaces ρ wherever ρ means the socket's height above the
head's centre: the socket at (0, 0, h_z), the stance's arms (`buildContact.ts`), the downswing's lever, `pendulumOf`
and the carry's grip heights (`track.ts`).

### 3.2 The rounded box

The box is a core box of half-extents c = (L/2 − e, h_y − e, h_z − e), Minkowski-summed with a sphere of radius e
(h_y = `halfWidth`, h_z = `halfHeight`, e = `edgeRadius`). For a ball centre p in the body frame, with
q_i = |p_i| − c_i:

- the signed distance is d = ‖max(q, 0)‖ + min(max_i q_i, 0) − e;
- the depth is R − d, and the contact normal is the gradient of d, rotated to the world;
- the contact point is the ball's centre less R along the normal (as the cylinder's).

The regions come from the count of positive q_i:

| Positive q_i | Region |
|---|---|
| x only | `face` (p_x ≥ 0, as the cylinder's) or `back` |
| y only | `side` |
| z only | `top` or `bottom` |
| two | `edge` |
| three | `corner` |
| none (inside the core) | the axis of the largest q_i, ties to x, then y, then z; its face region |

The cylinder's on-axis barrel throw has no box analogue: a centre inside the core is resolved by the tie rule. Region
names reach `ImpactRun.headRegions` and the re-entry guard's labels unchanged in form; the box adds the names above.

### 3.3 On the face

A contact is on the face only on the flat part: |p_y| ≤ h_y − e and |p_z| ≤ h_z − e, with the region `face`. A bevel
contact is an `edge` (or a `corner`) and raises `impact-off-face`, as the cylinder's rim does now. `validate`'s check
that the stance's contact point lies on the face becomes, for the box, |side| ≤ h_y − e and |up| ≤ h_z − e.

### 3.4 The other primitives

- `faceContact` (force tables) stays cylinder-only: `validateImpact` rejects a force plan with a box head (Decisions).
- `headLowestPoint`: z − Σ_i c_i·|R_zi| − e, R_zi the world-up components of the body axes.
- `headBottom`: the support point −Σ_i sign(R_zi)·c_i·x̂_i − e·ẑ. With sign(0) = 0, a level face samples its midline;
  that is the tie rule. It is used only to sample `surfaceAt`.
- `headClosing` and `stillReaching`: the lateral reach |p_y| < h_y + R and |p_z| < h_z + R.
- `cylinderDistance` (impact validation) becomes `headDistance`, dispatched on shape.

**Risk, the handover.** A box's flat top gives exactly vertical normals where the barrel gave tilted ones. The handover
rule throws on an overlap whose normal's horizontal part is below `VERTICAL_NORMAL`. Exit criterion 5 and the gate
watch for it; a throw there is the gate's, not fixed in passing.

### 3.5 Not in this step

A shaft collider: P2b.2b.3 sweeps the shaft against obstacles.

## 4. The mass properties

### 4.1 The head's inertia

The box head carries a required `inertiaAboutShaft` (kg·m², Russ's quantity: about the shaft axis through the head's
centre). `boxInertia` gives:

- I_z = `inertiaAboutShaft`;
- I_y = I_z + m·(h_z² − h_y²)/3, which is I_z for a square section;
- I_x = m·(h_y² + h_z²)/3.

The assumption is that every slice along the head has the same section, so the weighting varies along x alone, as end
inserts do. The edge rounding is ignored in the section's moment, an error of order (e/h)².

The realisable range, a `RangeError` outside it: m·h_y²/3 ≤ I_z ≤ m·(L²/4 + h_y²/3), from all mass on the shaft's
axis to all mass at the faces. There is no lower bound at the uniform solid: Russ's traditional round 9" head (33.4
kg·cm²) sits below a uniform 9" solid (about 47). For reference, a uniform box of the default's size gives 67.8
kg·cm² (m·(L² + 4h_y²)/12), computed by hand; there is no uniform-box path in the code.

The cylinder keeps `solidCylinderInertia`, unchanged (Decisions).

Russ's figure includes the shaft about its own axis. A thin rod adds 0 there; a real 14 mm shaft adds about 0.3
kg·cm², under 0.3 % of the modern range. The figure is used as the head's, and the error is recorded.

### 4.2 The shaft

`MalletHead` gains `shaft: { mass, length }`, a thin uniform rod from the socket (0, 0, h_z) up body z, rigid on the
head. `malletBody(head)` returns the existing `SwungBody` form:

- M = m + m_s;
- δ = m_s·(h_z + ℓ/2)/M;
- I' = (I_x + e, I_y + e, I_z), e = m·δ² + m_s·((h_z + ℓ/2 − δ)² + ℓ²/12).

`swungBody` and `carryBody` build on `malletBody` rather than the bare head; the arm mass and the hand skin add as
now, and `stepSwung` integrates it. Force-table runs keep `stepHead` on the bare head: `validateImpact` requires their
shaft's mass to be 0 (Decisions). With `shaft.mass` 0 the code takes a literal branch that returns today's head (mass,
inertia, offset 0), with no added zero terms, so the cylinder's digests stay bit-identical.

`validateImpact`'s shaft rules (`RangeError`): `shaft.length` finite and positive, `shaft.mass` finite and ≥ 0, and
both 0 shaft mass and a cylinder head on a force plan.

### 4.3 The weight terms

Every gravity term today puts the weight m·g at the head's centre. The shaft's weight m_s·g acts at its own centre,
h_z + ℓ/2 above the head's centre along body z, so it carries a torque about the head's centre and about the hands.
Each term changes as follows, and each takes the literal branch at m_s = 0:

- **The integrator's loads** (`integrate.ts`, the force and track loops): the shaft's weight is a force at the shaft's
  centre, its torque about the swung body's centre added, beside `headWeight` at the head's centre.
- **`pendulumOf`**: its weight term becomes m·g·ℓ_h + m_s·g·(ℓ_h − h_z − ℓ/2), ℓ_h the head's centre's distance below
  the top hand along the shaft. It is not M·g·d: the arm mass in the swung body has inertia but no weight, as now.
- **`PreparedTrack`** carries the shaft's weight beside `headWeight`, and the hands' feed-forward torque (`track.ts`,
  "the head's weight, which acts at the head's centre") adds the shaft's at its centre.
- **The tests' energy helpers** (`headKinetic`, `impactEnergy`) count the shaft's kinetic and potential energy, so
  §7.1's work–energy check sees the whole mallet.

### 4.4 What moves

- the pendulum's I_P = I'_y + M·d² and its weight term (`pendulumOf`);
- the effective mass at the face (`effectiveMass` takes `malletBody`);
- the twist gains (`handGains`), which scale with I_z: end-weighting stiffens the hands' twist at the same period;
- the hands' load, through the weight terms of §4.3;
- the downswing's fit (`fitStrokeShape`), through the pendulum.

The head–turf law, like the face law, keeps the head's mass (Decisions).

The face law's reduced mass keeps the head's mass (Decisions): for a centred strike on the bare head the effective mass
at the face is m, which is the closure Gugan's T(U) was fitted to.

## 5. The profile, the reference data and the default

### 5.1 `SwingProfile.mallet`

```ts
{
    headMass, headLength,
    head: { kind: "round"; diameter }
        | { kind: "box"; faceWidth; faceHeight; edgeRadius; inertiaAboutShaft },   // inertia in kg·m²
    shaftLength, shaftMass,
}
```

`headDiameter` moves into `head`. `contactPose` maps the profile's mallet to `MalletHead.shape` and `.shaft`. This is a
breaking change to a public type, so `ENGINE_VERSION` goes to "0.11.0". The tests' cylinder helpers take
`{ kind: "round", diameter }` and `shaftMass: 0`.

`buildContact.validate` (`RangeError`):

- every length and mass finite, the masses positive and `shaftMass` ≥ 0;
- 0 ≤ e < min(h_y, h_z, L/2);
- a box's `inertiaAboutShaft` within §4.1's range;
- the stance's contact point on the flat face, per shape (§3.3).

### 5.2 `reference/mallet.json`

The bounds, each from §5.3's market spread:

| Field | Bounds | Provenance tag |
|---|---|---|
| `headLength` | 9–13" (0.2286–0.3302 m) | `direct` |
| `headMass` | 0.85–1.1 kg, unchanged | `direct` (a fill for the Pidcock 2000; the note says so) |
| `faceWidth` | 50–65 mm (the makers) | `direct` (a fill; the note says so) |
| `faceHeight` | 44–64 mm (the makers' 44–63, Plummer's square 64) | `direct` (a fill; the note says so) |
| `edgeRadius` | none | `analogue`, with `provisional: "placeholder"` |
| `inertiaAboutShaft` | 33.4–172 kg·cm² (Russ) | `direct` |
| `shaftMass` | 0.227–0.398 kg (RPM's "8-10oz" low end to Plummer's 14 oz) | `derived` |
| `shaftLength` | 30–42" (0.762–1.0668 m) | `direct`, unchanged value |
| `headDiameter` | 0.0635–0.0762 m, unchanged; its note gains that the round head is now one shape of two | `direct` |

As now, the bounds are checked on the reference values at load only, and `malletReference` reads the new fields.

### 5.3 The default mallet

The anchor is the Pidcock 2000 11" (Manor House, now made by Dave Trimmer): a wooden body with brass blocks at its
ends and composite faces, the common peripherally weighted build. It is the only market mallet with a measured moment
that also has a published length and whole mass. All sources were fetched on 2026-10-12; their rows (URL, date,
SHA-256, by the README's counter-stripping convention) go into `reference/sources/README.md`.

| Field | Value | Provenance |
|---|---|---|
| `inertiaAboutShaft` | 0.0146 kg·m² (146 kg·cm²) | Russ, measured on a bifilar torsion pendulum, head and shaft together: "Pidcock 2000 11" \| n/a \| 146 \| 60%". The shaft's own share is "less than 1" kg·cm² (Russ); Towlson's 0.29. Used as the head's; the error is under 0.7 %. |
| `headLength` | 0.2794 m (11") | Russ's "11"" and Plummer's sample table, "Pidcock 2000 \| 280 \| 11 \| 1325". 11" is in the market's "10 - 11"" trend (Plummer). |
| `headMass` | 1.0 kg | **Fill.** Not published for the Pidcock 2000. Plummer: "Typical isolated heads weigh around 1 kg" (today's `mallet.json` value). |
| `head` | box, `faceWidth` = `faceHeight` = 0.05715 m (2.25") | **Fill.** Not published for the Pidcock 2000. Plummer: "Typical mallet faces are 2.25" - 2.5" (57 - 64 mm) square"; the lower end, near Invictus's 56 mm and DB's 50–60 mm. |
| `edgeRadius` | 0.003 m | **Placeholder.** No figure anywhere. Plummer: "The corners and edges of the face should be rounded or bevelled"; Law 5.5.3: the edges "however they are bevelled or shaped, are not part of the end-faces". |
| `shaftMass` | 0.325 kg | **Derived.** Plummer's whole mass for the Pidcock 2000, 1325 g, less the 1.0 kg fill. Inside the published shafts: RPM's handle "8-10oz" (227–283 g), Wood's "10 ounces", Plummer's "around 14 oz. (398 g)". |
| `shaftLength` | 0.9144 m (36") | Today's value (USCA, Croquet Network); Plummer: "shaft length 36" (915 mm) or longer". Not published for the Pidcock 2000. |

Checks on the set:

- **Realisable** (§4.1): with m 1.0 kg, L 0.2794 m and h_y 0.028575 m, I_z lies in [2.72, 197.9] kg·cm²; 146 is 73.8 %
  of the maximum. The uniform box of the same size gives 67.8.
- **Two specimens.** Russ's 146 and Plummer's 1325 g come from different mallets; neither source says otherwise. The
  spec records it, as it does the fills.
- **Shaft length's convention.** DB, Terminator, the CA and Wood quote the overall length from the ground, including
  the head's height; the engine's `shaftLength` runs from the socket. The 36" figures used here are shaft lengths
  (USCA: "a 36” wood shaft"; Plummer: "shaft length").
- **The market's spread**, recorded beside the default: faces 50–65 mm wide and 44–63 mm high (makers); heads 240–330
  mm; whole mallets 1.10–1.47 kg in the pages fetched here (the roadmap's survey, 1.10–1.55); measured moments
  33–172 kg·cm² (Russ, with the shaft) and 110–160 (Fenwick Elliott's turntable, heads alone).

### 5.4 The knock-on

- `REFERENCE_GEOMETRY` takes the new L and h_z, so every preset's `handsAhead` is recomputed to keep its lean: 0° on the
  upright presets, −4° on the AC stop, Gugan's 24°, 31° and 34° on the rolls.
- `fitStrokeShape` re-fits h₀ and the default backswings so each preset still plans 3 m/s.

## 6. Placeholders

Each is flagged in `mallet.json`'s note and in `profile.ts`'s comment, as `handAngle` is:

- `edgeRadius` 3 mm: unsourced; no bevel figure is published.
- `headMass` 1.0 kg, the face's 57.15 mm and `shaftLength` 36": the market's typical figures standing in for the
  Pidcock 2000's own, which are unpublished.
- `shaftMass` 0.325 kg: derived from a fill.
- The rod's thinness: the shaft's moment about its own axis is taken as 0 (§4.1).

## 7. Testing

### 7.1 Analytic cases

- **The rounded box:**
  - distance and normal against a brute-force sampled surface (points on the box ⊕ sphere), within the sampling's
    bound;
  - each region of §3.2 hit by a constructed centre;
  - the normal continuous across every bevel at e > 0, and the e → 0 limit against a sharp box's distance;
  - the tie rule inside the core;
  - `headLowestPoint` and `headBottom` against sampled support points over random orientations;
  - the flat face's boundary: a centre just inside is `face`, just outside an `edge` with `impact-off-face`.
- **Shape-neutrality:** a centred, square-on tracked strike with no turf in reach, on a box head (e = 0, h_y = h_z = r)
  and on a cylinder of radius r, with the same mass, the box's `inertiaAboutShaft` set to the cylinder's I_z and no
  shaft. Only the face plane is met and I_y = I_z on both; I_x differs and is not excited. The outcomes (the balls'
  states and the head's at the handover) agree within 1e-12 relative. They are not bit-identical: the box's face
  distance, (|p_x| − (L/2 − e)) − e, rounds differently from the cylinder's |p_x| − L/2.
- **The inertia:**
  - the closed forms of §4.1; I_y = I_z on a square section; the I_y correction on a rectangular one;
  - both realisable extremes accepted, and a value just past either rejected;
  - an off-centre strike on a free box head: the head's spin about its z axis after the strike times I_z equals the
    integrated torque ∫(r × F)·ẑ dt about its centre, within 1e-9 relative. (The twist rate alone is not ∝ 1/I_z: the
    impulse itself depends on I_z through the contact point's velocity.)
- **The shaft:**
  - `malletBody`'s closed form, and its exact reduction at m_s = 0 (the same object fields, bit for bit);
  - the mallet swung freely about the top hand, no arm mass: its small-angle period 2π·√(I_P/W), W the weight term
    of §4.3, within 0.1 %;
  - the downswing's work–energy balance still within 0.1 %.
- **Validation:** each `RangeError` of §5.1.

### 7.2 The ratchet

1. **Baseline**, on `main` before any engine change, none committed: the throwaway `presetDigest.mts` (SHA-256 per
   canonical and sweep run, `engineVersion` normalised, the sign of zero kept), `impactDigest`, `shotMix`.
2. **The union, cylinder only:** all three bit-identical.
3. **The box and the inertia, added, not the default:** all three bit-identical.
4. **The shaft, `shaftMass` 0 everywhere:** all three bit-identical.
5. **The default switched:** the preset digest moves by design; `impactDigest` and `shotMix` stay bit-identical. A
   change not predicted goes to the user.

A re-baselined test figure carries a comment naming this step, as in P2b.2b.2b.2b.

### 7.3 Probes

`swingProbe.ts`, `strokeProbe.ts` and `impactProbe.ts` change as tooling only: a shape-aware head fixture, the bounding
sphere hypot(L/2, h_y, h_z) for a box, the regions listed per shape. Their runs on the new default are recorded in
`docs/superpowers/probes/<run date>-p2b2b2b2c-*.txt`.

## 8. The pre-flight gate

After §7.2 step 5 and before any result is trusted, every preset's canonical runs at 2 and 3 m/s, the three rolls
first, are run on the old head and the new. The run stops for the user with §9's figures for those runs, old against
new, and any handover throw. Nothing is re-baselined until the user rules.

## 9. Figures to record

Per preset, against P2b.2b.2b.2b's: the ratios over 2–4 m/s; the canonical runs' clearance, impact, finish and head
position; the highest ball centre; the face intervals and their regions; the cap and flag tallies of the `presets`
sweep; the late re-hit's crossings; the effective mass by the strike against its closed form; the refitted h₀ and
backswings; the lean's drift through each roll's push.

## 10. Out of scope

- A shaft collider (P2b.2b.3).
- The face law's off-centre closure; faces beyond wood; calibration (P2b.2b.2c).
- Turf strike beyond a graze (P2b.2b.2b.3).
- The user's bespoke mallet as a preset.
- The P2b.2b.2b.2b follow-ups (the roadmap's list), unless the new head changes one; any such change is recorded.
