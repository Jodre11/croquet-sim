# P2b.1 — Impact Integrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add phase 1 to the engine: a compliant, fixed-step, N-body impact integrator (mallet head, balls, turf)
driven by a hand-built `ContactState`, which hands each ball's full 3D state to `simulateFreeMotion`.

**Architecture:** A new directory `src/engine/impact/`. `contactLaw.ts` holds the clamped Kelvin–Voigt normal force
(damping solved from the sourced restitution) and the Cundall–Strack tangential spring–slider. `rigidBody.ts` holds
quaternions and Euler's equations for the head. `contacts.ts` holds the pair list (face–ball, ball–ball, ball–turf,
in that fixed order) and each pair's geometry. `integrate.ts` runs semi-implicit Euler at a fixed `dt`.
`handover.ts` places the balls for phase 2. `simulateImpact.ts` validates the input, solves every law once, sinks
each ball to its static turf depth and runs the rest. Before any of that, turf restitution and stiffness move into
`SurfaceProps`, with phase 2 left bit-identical.

**Tech Stack:** TypeScript (strict), Vitest, ESLint, Prettier. No new dependencies; `npx --yes tsx` runs the scripts.

**Spec:** `docs/superpowers/specs/2026-10-03-p2b1-impact-integrator-design.md` (read all of it). Product spec:
`docs/superpowers/specs/2026-09-30-croquet-shot-lab-design.md` §4, §5 ("Phase 1 — Impact"), §9. Roadmap:
`docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`, P2 row, P2b.1.

**Decisions made while planning** (folded into the spec as its "Amended 2026-10-03 (plan)" note):

- **Sourcing moved two numbers.** Gugan measured the ball–ball contact time directly: 0.75 ms (0.50–0.87 ms), not the
  0.2 ms billiard analogue. So `dt` is set from 0.5 ms, the shortest bound of any sourced contact time.
- **Turf stiffness comes from the measured maximum penetration.** Gugan measured 7.2 mm at about 5 m/s. It is derived
  with the model's own damping: at `e = 0.5` the clamped law peaks at 0.7071·v/ω₀, so `k ≈ 1.1×10⁵ N/m`. The
  undamped energy balance, about 2.2×10⁵ N/m, is the upper bound.
- **Stick and slip on an inclined face.** A ball can roll, so its contact sticks below `tan θ = 7μ/2`, not `μ`.
  `tan θ = μ` holds only for a body that cannot roll. The analytic case tests `7μ/2`.
- **"Within reach" for head re-approach.** A ball counts only if its surface is within one ball radius of the face
  plane. Otherwise any ball lying ahead in the line of play would raise `impact-head-approaching` on every stroke.
- **Where the handover is reported.** `ImpactResult` carries the handed-over balls (`handover`) and the largest
  overlap correction, beside the raw final states. `handover.ts` exports the pure function that computes them.
- **Where `simulateImpact` lives.** It goes in its own file, `impact/simulateImpact.ts`, with validation and
  preparation. `integrate.ts` keeps only the loop. This lets tests drive isolated cases (gravity off, no turf, moving
  balls) through `integrate()`, which `simulateImpact` would rightly reject.
- **Orientation check.** `simulateImpact` also rejects a non-unit orientation quaternion (|q|² − 1 beyond 1e-12),
  because a non-unit quaternion scales every rotated vector.

## Global Constraints

- **Formatting.**
  - 4-space indentation, 120-column limit (check with `grep -nE '^.{121,}$' <file>`), LF line endings, UTF-8.
  - Run `npx prettier --write` on every file you touch; `npm run format:check` must pass.
  - `.prettierignore` lists `docs/`, so wrap markdown by hand. Prettier does not re-wrap comments or strings.
  - Code blocks in this plan keep some long lines whole for readability. Prettier wraps the code. Wrap any comment
    over 120 columns by hand. JSON `source` and `note` strings stay on one line, as in the existing reference files.
- **Engine purity.** Engine code (`src/engine/**`) is pure and deterministic: no DOM, no time-of-day, no randomness.
  Iterate balls in `BALL_IDS` order and pairs in pair-list order. Sum forces in that order.
- **Determinism lint.**
  - Engine code uses only IEEE-exact operations: `+ − * /`, comparisons, `Math.sqrt`, `Math.abs`, `Math.min`,
    `Math.max`, `Math.round`, `Math.floor`.
  - No `Math.sin/cos/atan2/exp/log/pow/hypot`, no `**`. Use `ln`, `sinCos` and `atan2` from
    `src/engine/math/elementary.ts`.
  - No `exp` is needed: the damping solve compares `ln e`.
  - `npm run lint` enforces all of this.
- **Style.**
  - No non-null assertions (`!`). The repo style is `x as number` / `x as Vec3` after indexing.
  - Braces on every `if`.
  - Public/exported functions carry a header comment. Cognitively complex code carries explanatory comments. A named
    numerical constant says why it is not physical.
- **Units.** SI. A ball on the turf in phase 2 has `z = R` and `vz = 0` exactly. Inside the impact a ball at rest sits
  at its static sink `z = R − m·g/k_turf`.
- **Pre-flight values.** Named constants marked PROVISIONAL are fixed by pre-flight (below). Implement them with the
  provisional values given.
- **Engine version.** `ENGINE_VERSION` becomes `"0.4.0"` (Task 7).
- **Phase 2 stays bit-identical** (exit criterion 5). After Task 2 and again after Task 7:
  - `npx --yes tsx scripts/shotMix.ts` prints work units p99 143,084, p99.9 362,050, max 408,030 exactly;
  - `SLOW_TESTS=1 npm test` passes.
- **Slow tests.** They run only when `SLOW_TESTS` is set, via `it.skipIf(!import.meta.env.SLOW_TESTS)`.
- **Croquet has exactly four balls.** A double tap is a fault and is flagged, not modelled.
- **Commits.**
  - Short imperative sentence (repo style), signed.
  - Write the message to a file in `$CLAUDE_TEMP_DIR` and run `git commit -F <file>`. The Bash hook blocks inline
    heredocs, and signing needs the sandbox disabled for the SSH agent.
  - Check with `git log -1 "--format=%G? %h"` (expect `G`). If signing refuses, leave the change staged and report it.
  - Never use `--no-verify`, `-c commit.gpgsign=false` or bare `git stash`.
- **Checks after every task:** `npm test`, `npm run lint`, `npm run check` and `npm run format:check` all pass.

## Review Focus

The inputs and conditions below are not exercised by the analytic cases, but are the ones most likely to bite. Each
line names its pinning test.

1. **A ball that is struck must not drift before the strike.** Balls start at their static sink, in equilibrium. A
   ball the head never reaches must end the impact at rest: speed below 1e-9 m/s, and handed over at `z = R` exactly.
   A spurious bounce here would launch every untouched ball. Pinned in Task 7 ("leaves a ball nobody strikes at
   rest").
2. **A ball still in its hollow or still overlapping at the end.** Contacts release while `δ > 0`, so the impact can end
   with a ball below `z = R` or a pair slightly overlapping. `simulateFreeMotion` must accept every handover:
   - on the turf;
   - airborne;
   - overlapping on the turf;
   - overlapping with an inclined normal.

   Pinned in Task 7 (handover tests) and Task 8 (fuzz, chained into phase 2).
3. **A ball lying ahead in the line of play.** It must not raise `impact-head-approaching`. Only a ball within one
   radius of a face counts. Pinned in Task 5 ("ignores a ball a metre ahead").
4. **A ball at the rim of the face.** No force forms, the flag is raised once, and the impact ends at the cap; it does
   not hang. Pinned in Task 6 ("flags a ball at the rim once").
5. **Restitution near the critical damping band.** `e` between `e^(−2) ≈ 0.135` and `e^(−π/2) ≈ 0.208` includes the
   sourced turf lower bound of 0.15. The damping solve must be continuous across `ζ = 1/√2` and `ζ = 1`, and the
   bisection must land on the right branch. Pinned in Task 4 (continuity, branch and round-trip tests).

---

## Pre-flight

As for P2a.2 (spec §10), this plan is executed literally in a scratch worktree before the real run. The values below
are the provisional ones the code is written with. Pre-flight measures each one and replaces it in this plan and in
the spec. Every step that quotes a figure from these constants is updated with it.

| Constant | Where | Provisional | Fixed by |
|---|---|---|---|
| `IMPACT_DT` | `impact/integrate.ts` | 5e-6 s (1/100 of 0.5 ms) | Task 8 convergence: largest `dt` that keeps every scenario under `CONVERGENCE_TOLERANCE` at `dt` vs `dt/2`, rounded down to 1, 2 or 5 × 10ⁿ |
| `RELEASE_STEPS` | `impact/integrate.ts` | 50 | Task 8: smallest count for which ×4 changes no handover velocity by more than 0.1·`CONVERGENCE_TOLERANCE` |
| `IMPACT_CAP` | `impact/integrate.ts` | 0.05 s | Task 8 fuzz: at least 5× the longest fuzz impact |
| `ZETA_MAX` | `impact/contactLaw.ts` | 1e6 | Task 4: `e(ZETA_MAX) < 1e-12`, and the bisection converges for every `e` in [1e-12, 1] |
| `CONVERGENCE_TOLERANCE` | `tests/engine/impact/convergence.test.ts` | 5e-3 | Task 8: 2× the worst measured relative change, at most 5e-3 |
| `ENERGY_TOLERANCE` | `tests/engine/impact/invariants.test.ts` | 1e-3 | Task 8: 2× the worst measured relative rise |
| `PENETRATION_BOUND` | `tests/engine/impact/fuzz.test.ts` | 0.3·R | Task 8: 1.5× the worst fuzz peak, at most 0.3·R |
| Fuzz ranges | `tests/engine/impact/fuzz.test.ts` | as written there | Task 8: widest ranges that raise no `impact-cap` |
| Analytic tolerances | Task 6 | as written there | Task 6: 2× the measured error |

Pre-flight also confirms both branches of the clamped restitution relation (Task 4's ODE cross-check) and runs
`scripts/impactProbe.ts` once (Task 9). Record each measured figure next to the step it came from, as
"(pre-flight: …)".

---

## File Structure

| Path | Change |
|---|---|
| `reference/contact.json` | New: ball–turf stiffness, ball–ball and face–ball contact times, `k_t/k` |
| `reference/mallet.json` | New: one face (restitution, friction), one typical round head (mass, length, diameter) |
| `src/reference/index.ts` | `contactReference`, `malletReference` |
| `src/engine/types.ts` | `SurfaceProps.turfStiffness`, `.turfRestitution`; `World.ballBallContactTime`; `World.ballTurfRestitution` removed |
| `src/engine/world.ts` | `turfAt` and `validateWorld` read the surface; `defaultWorld` fills the new fields |
| `src/engine/impact/types.ts` | New: `MalletHead`, `FaceMaterial`, `DriveSample`, `HeadState`, `ContactState`, `ImpactEvent`, `ImpactRun`, `ImpactResult` |
| `src/engine/impact/rigidBody.ts` | New: `Quaternion`, rotations, orientation update, Euler's equations, cylinder inertia |
| `src/engine/impact/contactLaw.ts` | New: clamped-law contact time and restitution, damping solve, `PairLaw`, normal and tangential forces |
| `src/engine/impact/contacts.ts` | New: pair list, face/ball/turf geometry, off-face, head lowest point, head re-approach |
| `src/engine/impact/integrate.ts` | New: drive interpolation, the fixed-step loop, events, termination, probe |
| `src/engine/impact/handover.ts` | New: `ImpactRun.balls` → phase 2 states |
| `src/engine/impact/simulateImpact.ts` | New: validation, preparation (laws, sink), `simulateImpact` |
| `src/engine/simulate.ts` | `ENGINE_VERSION` 0.4.0 |
| `tests/engine/support/fixtures.ts` | `TEST_TURF`; `testWorld` gains the new fields |
| `tests/engine/support/impact.ts` | New: test head and face, strike builder, isolated setups, recorder, energy, scenarios, mirror |
| `tests/engine/world.test.ts`, `tests/engine/crossCheck.test.ts`, `tests/reference/reference.test.ts` | New fields |
| `tests/engine/impact/*.test.ts` | New: `rigidBody`, `contactLaw`, `contacts`, `integrate`, `analytic`, `simulateImpact`, `handover`, `invariants`, `convergence`, `fuzz` |
| `scripts/impactProbe.ts` | New: stiffness sensitivity, stop-shot probe, timing |
| `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md` | P2b.1 met; outcomes carried forward |

Task order keeps every commit green:

- Task 1 adds data only.
- Task 2 moves the turf fields with phase 2 bit-identical.
- Tasks 3–6 add the impact modules bottom-up.
- Task 7 adds the entry point and handover.
- Task 8 adds the whole-system tests.
- Task 9 adds the probe and records outcomes.

---

### Task 1: Reference data for the impact

Two new topic files, in the existing entry shape (`reference/README.md`). The values and quotations below were sourced
while planning. The pages are cited in each entry, and every quotation is verbatim. Copy the entries exactly. Before
committing, open each URL and confirm each quoted sentence is still on the page. If one is not, keep the value, mark
the note "(quotation not re-found on <date>)" and report it.

**Files:**
- Create: `reference/contact.json`, `reference/mallet.json`
- Modify: `src/reference/index.ts`
- Test: `tests/reference/reference.test.ts`

**Interfaces:**
- Produces:
  - `contactReference.ballTurfStiffness`, `.ballBallContactTime`, `.faceBallContactTime` and
    `.tangentialStiffnessRatio`, each a `ReferenceValue`;
  - `malletReference.faceRestitution`, `.faceFriction`, `.headMass`, `.headLength` and `.headDiameter`, each a
    `ReferenceValue`.

- [ ] **Step 1: Write the failing test**

Append to `tests/reference/reference.test.ts`. Update the import to add `contactReference, malletReference`:

```ts
describe("impact reference data", () => {
    it("loads contact durations, turf stiffness and the tangential ratio", () => {
        expect(contactReference.ballTurfStiffness.value).toBeGreaterThan(0);
        expect(contactReference.ballBallContactTime.value).toBeGreaterThan(0);
        expect(contactReference.faceBallContactTime.value).toBeGreaterThan(0);
        expect(contactReference.tangentialStiffnessRatio.value).toBeCloseTo(2 / 7, 15);
    });

    it("loads one face and one typical head", () => {
        expect(malletReference.faceRestitution.value).toBeGreaterThan(0);
        expect(malletReference.faceRestitution.value).toBeLessThanOrEqual(1);
        expect(malletReference.faceFriction.value).toBeGreaterThanOrEqual(0);
        expect(malletReference.headMass.value).toBeGreaterThan(0);
        expect(malletReference.headLength.value).toBeGreaterThan(malletReference.headDiameter.value);
    });

    it("gives every impact value bounds, so the probe can sweep them", () => {
        for (const v of [...Object.values(contactReference), ...Object.values(malletReference)]) {
            expect(v.bounds, v.source).toBeDefined();
        }
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/reference/reference.test.ts`
Expected: FAIL, `contactReference` is not exported.

- [ ] **Step 3: Create `reference/contact.json`**

```json
{
    "ballTurfStiffness": {
        "value": 110000,
        "unit": "N/m",
        "bounds": [100000, 270000],
        "source": "Don Gugan, 'The Physics of Croquet Strokes: Analysis of the CA high-speed DVD', section 7.1 and Table 4(b) (2009; Oxford Croquet), https://oxfordcroquet.org/tech/gugan4/",
        "provenance": "derived",
        "note": "Gugan, roll stroke A4R from 8000 frame/s video: \"The transient hollow formed in the ground is surprisingly large, about 50 mm in diameter for A4R.\" and \"the downward velocity of the ball can be estimated to be close to 5 m/s immediately after impact, so comparing this with the upward velocity of 2.48 m/s gives a CoR for the ground of about 0.5.\" Table 4(b) 'Maximum penetration into ground, mm': A2R 4.0, A3R 5.0, A4R 7.2 (upward speeds leaving the ground 1.52, 1.76, 2.48 m/s). The 50 mm chord on a ball of radius 46.04 mm gives 7.38 mm, agreeing with the measured 7.2 mm. Derivation with the impact model's own law (linear spring-dashpot clamped at zero force, damping from e = 0.5, damping ratio 0.2553): the peak penetration at impact speed v is 0.7071·v/ω0 with ω0 = sqrt(k/m), so k = m·(0.7071·v/δmax)² = 0.5·m·v²/δmax² = 0.5 × 0.45359 × 25 / 0.0072² = 1.09e5 N/m (A4R), giving a contact time of 5.5 ms. Bounds: lower 1.0e5 (the same derivation allowing for the hollow already 2.2 mm deep when the mallet releases the ball); upper 2.7e5 from the undamped energy balance k = m·v²/δmax² over A2R to A4R (taking each downward speed as upward speed / 0.5): 2.62e5, 2.25e5, 2.15e5 N/m. Gugan's timing favours the stiffer end: \"assuming that the almost linear region after about 5 ms is due to flight\". One court only; Gugan: \"courts can be expected to vary greatly depending on their composition, their grass covering, and their dampness\". Feeds the default lawn's turfStiffness."
    },
    "ballBallContactTime": {
        "value": 0.00075,
        "unit": "s",
        "bounds": [0.0005, 0.00087],
        "source": "Don Gugan, 'The Physics of Croquet Strokes: Analysis of the CA high-speed DVD', section 4, Table 1 row 5 (2009; Oxford Croquet), https://oxfordcroquet.org/tech/gugan4/",
        "provenance": "direct",
        "note": "Table 1 'Ball /ball contact time, Tb, ms' for seven clean scatter shots at ball speeds 1.90-7.64 m/s: 0.75, 0.75, 0.50, 0.75, 0.75, 0.87, 0.75. Gugan: \"The ball on ball contact times, Tb, (row 5) show no significant variation with ball speed, and cluster around 0.75 ms (i.e. 6 video frames), close to those for mallet on ball contact times\". Resolution is one frame (0.125 ms). Bounds are the table's range. Stan Hall's 1.8 ms (https://oxfordcroquet.org/tech/hall/) is for balls starting in contact and driven by the mallet, not a free collision."
    },
    "faceBallContactTime": {
        "value": 0.0008,
        "unit": "s",
        "bounds": [0.0006, 0.0012],
        "source": "Stan Hall, 'When a Mallet Strikes a Ball', Table 1 (Oxford Croquet), https://oxfordcroquet.org/tech/hall/; Don Gugan, 'The Physics of Croquet Strokes: Analysis of the CA high-speed DVD', Tables 2, 3 and 4(a) (2009; Oxford Croquet), https://oxfordcroquet.org/tech/gugan4/",
        "provenance": "direct",
        "note": "Hall, electrical timing: \"For single ball strokes the contact time is almost constant at 1 ms except for very short distances in which case the time is longer.\" (averages 0.84-1.18 ms from 7.3 to 2.4 m/s; 2.9 ms for a 0.6 m stroke). Gugan, high-speed video, 'Duration of contact, Th, ms (± 0.1 ms)': drives 1.00, 0.75, 0.60, 0.60; stop shots 0.75, 0.63, 0.63; rolls 1.13, 1.25, 1.00, 0.88. Value 0.8 ms is the centre of the drive and stop-shot figures; bounds run from Gugan's shortest to Hall's 2.4 m/s average. Gugan notes Hertzian theory predicts shorter contacts for stronger strokes but \"the effect is weak\"; the linear law here makes it speed-independent."
    },
    "tangentialStiffnessRatio": {
        "value": 0.2857142857142857,
        "unit": "1",
        "bounds": [0.2857142857142857, 0.6666666666666666],
        "source": "L. E. Silbert, D. Ertaş, G. S. Grest, T. C. Halsey, D. Levine, S. J. Plimpton, 'Granular flow down an inclined plane: Bagnold scaling and rheology', Phys. Rev. E 64, 051302 (2001), DOI 10.1103/PhysRevE.64.051302, https://arxiv.org/abs/cond-mat/0105071",
        "provenance": "analogue",
        "note": "A discrete-element modelling convention, not a croquet measurement. Silbert et al.: \"For Hertzian contacts [37], the ratio kt /kn depends on the Poisson ratio of the material, and is about 2/3 for most materials. For ease in our simulations, we use a value kt /kn =2/7, which makes the period of normal and shear contact oscillations equal to each other for Model L [38]. However, the contact dynamics are not very sensitive to the precise value of this ratio.\" Bounds are 2/7 and the Hertzian 2/3. The engine's TANGENTIAL_STIFFNESS_RATIO (impact/contactLaw.ts) must equal this value."
    }
}
```

- [ ] **Step 4: Create `reference/mallet.json`**

```json
{
    "faceRestitution": {
        "value": 0.817,
        "unit": "1",
        "bounds": [0.795, 0.857],
        "source": "Don Gugan, 'Experiments on the Game of Croquet; Bouncing and Rolling Balls', Table I (2002; Oxford Croquet, updated 20 April 2026), https://oxfordcroquet.org/tech/gugan1/",
        "provenance": "direct",
        "note": "Ball on a wooden face, \"using a round head typical of older style mallets, but with faces in very good condition\". Table I, Jaques 'Eclipse' ball on wood, e × 100 at 0.50, 1.00, 1.64, 2.04, 2.00, 2.83, 3.51, 4.43, 5.47, 6.01 m/s: 85.7, 84.2, 82.9, 82.4, 82.7, 81.7, 81.1, 80.6, 79.9, 79.5. Value at 2.83 m/s; bounds are the speed range. Gugan: \"altering the clamping pressure on the wood and plastic mallet heads over a wide range of tightness made no difference to the values of e(U).\" Speed dependence is not modelled. Other face materials are P2b.2's."
    },
    "faceFriction": {
        "value": 0.5,
        "unit": "1",
        "bounds": [0.2, 0.6],
        "source": "Don Gugan, 'The Physics of Croquet Strokes: Analysis of the CA high-speed DVD', appendix B (2009; Oxford Croquet), https://oxfordcroquet.org/tech/gugan4/; bounds: Engineering ToolBox, 'Friction - Coefficients for Common Materials and Surfaces' (2025), https://www.engineeringtoolbox.com/friction-coefficients-d_778.html",
        "provenance": "analogue",
        "note": "No measured mallet-face friction was found. Gugan: \"although λ is unknown for the mallet face, typical values of sliding friction are ≈ 0.5, and the inequality is surely satisfied.\" and \"the video images show that the contact is far from point-like, and give no evidence for sliding along the mallet face.\" Bounds reuse ballPegFriction's wood-clean metal range 0.2-0.6 (friction.json). Weakly supported."
    },
    "headMass": {
        "value": 1.0,
        "unit": "kg",
        "bounds": [0.85, 1.1],
        "source": "Ian Plummer, 'Mallet Making Notes' (Oxford Croquet), https://oxfordcroquet.org/equip/makingmallets/; bounds: Croquet Association, 'Choosing a Croquet Mallet', https://www.croquet.org.uk/?p=games%2Ftech%2FChoosingMallet, and Oxford Croquet, 'Equipment - Croquet Mallets', https://oxfordcroquet.org/equip/mallets/",
        "provenance": "direct",
        "note": "Plummer: \"Typical isolated heads weigh around 1 kg.\" His table gives a 229 mm wooden head (George Wood Mallets) at 987 g. Bounds derived: whole mallets \"in the range 2lb 12oz to 3lb 4oz\" (CA, 1.25-1.47 kg) less \"A typical isolated shaft weights around 14 oz. (398 g)\" (Oxford Croquet), 0.85-1.08 kg, rounded up to 1.1."
    },
    "headLength": {
        "value": 0.2286,
        "unit": "m",
        "bounds": [0.2286, 0.3048],
        "source": "Croquet Association, 'Choosing a Croquet Mallet', https://www.croquet.org.uk/?p=games%2Ftech%2FChoosingMallet; Oxford Croquet, 'Equipment - Croquet Mallets', https://oxfordcroquet.org/equip/mallets/",
        "provenance": "direct",
        "note": "CA: \"A standard mallet has a head length of 9 to 9.5\", and this is recommended for beginners. Expert players may use longer head lengths up to 12\". Oxford Croquet: \"Older mallet heads could be as short as 9\" (230 mm) but the trend now is for 10 - 11\" (250 - 280 mm) heads.\" SI: 9 in × 0.0254 = 0.2286 m; 12 in = 0.3048 m."
    },
    "headDiameter": {
        "value": 0.0762,
        "unit": "m",
        "bounds": [0.0635, 0.0762],
        "source": "Jaques London, 'Croquet Mallet - Richmond', https://www.jaqueslondon.co.uk/products/croquet-mallet-richmond; lower bound: Oxford Croquet, 'Equipment - Croquet Mallets', https://oxfordcroquet.org/equip/mallets/",
        "provenance": "direct",
        "note": "Jaques (round head): \"Head 9\" Wide x 3\" Diameter or 23cm Wide x 76mm Diameter.\" (3 in = 0.0762 m). The only round-head diameter found. Lower bound from square heads, \"Typical mallet faces are 2.25\" - 2.5\" (57 - 64 mm) square.\" (2.5 in = 0.0635 m). The shaft joins the head at its mid-point at right angles (Laws 5.5.1, \"a head with a shaft firmly connected to its mid-point and at right-angles to it\", quoted at https://oxfordcroquet.org/tech/towlson/). Inertia is derived in the engine for a uniform solid cylinder (rigidBody.ts solidCylinderInertia). That is Towlson's \"IRnd = Mw ( L2 + 3a2 ) / 12\" about the shaft axis: 4.7e-3 kg m² for this head. Russ ('Mallets: End-weighting and the Moment of Inertia', https://oxfordcroquet.org/tech/russ/) measured 33.4 kg cm² (3.3e-3 kg m²) for a 'Traditional' round wooden 9\" head. Weakly supported."
    }
}
```

- [ ] **Step 5: Expose them in `src/reference/index.ts`**

Add the imports beside the existing JSON imports (alphabetical):

```ts
import contactJson from "../../reference/contact.json";
import malletJson from "../../reference/mallet.json";
```

Append:

```ts
/** Impact-phase contact data: turf stiffness, contact durations and the tangential stiffness ratio. */
export const contactReference = {
    ballTurfStiffness: readValue(contactJson, "ballTurfStiffness", "contact"),
    ballBallContactTime: readValue(contactJson, "ballBallContactTime", "contact"),
    faceBallContactTime: readValue(contactJson, "faceBallContactTime", "contact"),
    tangentialStiffnessRatio: readValue(contactJson, "tangentialStiffnessRatio", "contact"),
} as const;

/** One mallet face and one typical round head (P2b.1; other faces and weightings are P2b.2's). */
export const malletReference = {
    faceRestitution: readValue(malletJson, "faceRestitution", "mallet"),
    faceFriction: readValue(malletJson, "faceFriction", "mallet"),
    headMass: readValue(malletJson, "headMass", "mallet"),
    headLength: readValue(malletJson, "headLength", "mallet"),
    headDiameter: readValue(malletJson, "headDiameter", "mallet"),
} as const;
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/reference/`
Expected: PASS.

- [ ] **Step 7: Format, lint, check, commit**

Run `npx prettier --write reference/contact.json reference/mallet.json src/reference/index.ts
tests/reference/reference.test.ts`, then `npm test`, `npm run lint`, `npm run check` and `npm run format:check`.

```bash
git add reference/contact.json reference/mallet.json src/reference/index.ts tests/reference/reference.test.ts
git commit -F "$CLAUDE_TEMP_DIR/msg.txt"   # "Source the impact reference data"
```

---

### Task 2: Turf parameters into `SurfaceProps`

No turf property is a module constant (spec §7). `SurfaceProps` gains `turfStiffness` and `turfRestitution`;
`World.ballTurfRestitution` goes; `World.ballBallContactTime` arrives. On a uniform lawn phase 2 reads the same
restitution, so it must stay bit-identical.

**Files:**
- Modify: `src/engine/types.ts:58-62` (`SurfaceProps`), `:64-70` (`Lawn` comment), `:98-113` (`World`)
- Modify: `src/engine/world.ts:67-70` (`turfAt`), `:100-111` (`validateWorld`), `:126-173` (`defaultWorld`)
- Modify: `tests/engine/support/fixtures.ts`, `tests/engine/world.test.ts`, `tests/engine/crossCheck.test.ts:213-216`

**Interfaces:**
- Consumes: `contactReference.ballTurfStiffness`, `.ballBallContactTime` (Task 1).
- Produces:
  - `SurfaceProps { slidingFriction; rollingResistance; turfStiffness; turfRestitution }`;
  - `World.ballBallContactTime: number`;
  - `TEST_TURF = { turfStiffness: 2e5, turfRestitution: 0.5 }` (fixtures).

- [ ] **Step 1: Write the failing tests**

In `tests/engine/world.test.ts`:

- import `TEST_TURF` from `./support/fixtures`;
- change the rolling-resistance case's literal to `{ slidingFriction: 0.1, rollingResistance: 0.2, ...TEST_TURF }`;
- replace the `["ball–turf restitution above 1", { ballTurfRestitution: 1.5 }]` row with the three rows below;
- in `defaultWorld`, replace `expect(world.ballTurfRestitution).toBeGreaterThan(0);` with the block below.

```ts
        [
            "turf restitution above 1",
            { lawn: uniformLawn(30, 40, { slidingFriction: 0.3, rollingResistance: 0.05, ...TEST_TURF, turfRestitution: 1.5 }) },
        ],
        [
            "non-positive turf stiffness",
            { lawn: uniformLawn(30, 40, { slidingFriction: 0.3, rollingResistance: 0.05, ...TEST_TURF, turfStiffness: 0 }) },
        ],
        ["non-positive ball–ball contact time", { ballBallContactTime: 0 }],
```

```ts
        const surface = world.lawn.surfaceAt(vec3(1, 1, 0));
        expect(surface.turfRestitution).toBeGreaterThan(0);
        expect(surface.turfStiffness).toBeGreaterThan(0);
        expect(world.ballBallContactTime).toBeGreaterThan(0);
```

Rename the `turfAt` test to `"pairs the surface's turf restitution with its sliding friction"`; its expectation
`{ restitution: 0.5, friction: 0.3 }` stays.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/engine/world.test.ts`
Expected: FAIL to type-check or run. `TEST_TURF` is not exported, and `ballBallContactTime` is not a `World` field.

- [ ] **Step 3: Change the types**

In `src/engine/types.ts`, replace `SurfaceProps`:

```ts
/**
 * Turf properties at a point. `slidingFriction` and `rollingResistance` are dimensionless (multiply by g for a
 * deceleration). `turfStiffness` (N/m) and `turfRestitution` are the ball–turf contact's spring and restitution: phase 2
 * uses the restitution for landings, the impact (phase 1) both. Every turf property lives here so that a lawn can vary
 * them by position, and a match can change them between shots through the Lawn it passes in.
 */
export interface SurfaceProps {
    readonly slidingFriction: number;
    readonly rollingResistance: number;
    readonly turfStiffness: number;
    readonly turfRestitution: number;
}
```

In `Lawn`, change the `surfaceAt` comment to:
`/** Surface properties at a position. v1 lawns are uniform; the engine samples this at each segment start, and once per ball at the start of an impact. */`
Wrap it at 120 columns as a two-line `/** … */`.

In `World`, delete `ballTurfRestitution` and its comment, and add after `ballUpright`:

```ts
    /** Duration (s) of a central ball–ball collision in the impact phase; with ballBall.restitution it sets that contact's stiffness. */
    readonly ballBallContactTime: number;
```

Wrap the comment at 120 columns.

- [ ] **Step 4: Change `world.ts`**

`turfAt`:

```ts
/** Returns the turf's restitution and sliding friction at `position`, for impulses on a ball there. */
export function turfAt(world: World, position: Vec3): ContactMaterial {
    const surface = world.lawn.surfaceAt(position);
    return { restitution: surface.turfRestitution, friction: surface.slidingFriction };
}
```

In `validateWorld`, replace `requireMaterial({ restitution: world.ballTurfRestitution, friction: 0 }, "ballTurf");`
with:

```ts
    requirePositive(surface.turfStiffness, "lawn.turfStiffness");
    requireMaterial({ restitution: surface.turfRestitution, friction: 0 }, "lawn.turf");
    requirePositive(world.ballBallContactTime, "ballBallContactTime");
```

In `defaultWorld`, import `contactReference`, and make two changes:

- add `turfStiffness: contactReference.ballTurfStiffness.value` and
  `turfRestitution: frictionReference.ballTurfRestitution.value` to `surface`;
- in the returned world, replace `ballTurfRestitution: …` with
  `ballBallContactTime: contactReference.ballBallContactTime.value`.

- [ ] **Step 5: Change the fixtures and the cross-check literal**

`tests/engine/support/fixtures.ts`:

```ts
/** Ball–turf contact of the test lawn (impact phase). Plausible, not sourced. */
export const TEST_TURF = { turfStiffness: 2e5, turfRestitution: 0.5 } as const;
```

In `testWorld`, use `lawn: uniformLawn(30, 40, { slidingFriction: 0.3, rollingResistance: 0.05, ...TEST_TURF })`.
Replace `ballTurfRestitution: 0.5,` with `ballBallContactTime: 7e-4,`.

`tests/engine/crossCheck.test.ts`: add `TEST_TURF` to its `./support/fixtures` import. Add `...TEST_TURF,` inside the
`uniformLawn(30, 40, { … })` literal at line 213.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: every test passes, unchanged except the world tests above. `tsc` via `npm run check` reports no use of
`ballTurfRestitution` left; `grep -rn ballTurfRestitution src tests scripts` finds only `frictionReference`.

- [ ] **Step 7: Verify phase 2 is bit-identical**

Run: `SLOW_TESTS=1 npm test` → all pass.
Run: `npx --yes tsx scripts/shotMix.ts` → work units per shot p99 143,084, p99.9 362,050, max 408,030, exactly. Any
other figure means phase 2 changed: stop and find out why before committing.

- [ ] **Step 8: Format, lint, check, commit**

```bash
git add src/engine/types.ts src/engine/world.ts tests/engine/support/fixtures.ts tests/engine/world.test.ts tests/engine/crossCheck.test.ts
git commit -F "$CLAUDE_TEMP_DIR/msg.txt"   # "Move turf restitution and stiffness into SurfaceProps"
```

---

### Task 3: Rigid-body kinematics for the head

**Files:**
- Create: `src/engine/impact/rigidBody.ts`
- Test: `tests/engine/impact/rigidBody.test.ts`

**Interfaces:**
- Produces:
  - `interface Quaternion { w; x; y; z }` (body → world) and `IDENTITY`;
  - `axisAngle(axis: Vec3, angle: number): Quaternion`;
  - `multiply(a, b): Quaternion` (b, then a);
  - `rotate(q, v): Vec3` and `rotateInverse(q, v): Vec3`;
  - `integrateOrientation(q, omegaWorld: Vec3, dt): Quaternion`;
  - `angularAcceleration(inertia: Vec3, omegaBody: Vec3, torqueBody: Vec3): Vec3`;
  - `solidCylinderInertia(mass, length, radius): Vec3`.

- [ ] **Step 1: Write the failing tests**

Create `tests/engine/impact/rigidBody.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { length, sub, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import {
    IDENTITY,
    angularAcceleration,
    axisAngle,
    integrateOrientation,
    multiply,
    rotate,
    rotateInverse,
    solidCylinderInertia,
    type Quaternion,
} from "../../../src/engine/impact/rigidBody";
import { rng } from "../support/rng";

function near(a: Vec3, b: Vec3, tolerance: number): boolean {
    return length(sub(a, b)) <= tolerance;
}

function randomUnit(random: () => number): Vec3 {
    const v = vec3(random() - 0.5, random() - 0.5, random() - 0.5);
    return vec3(v.x / length(v), v.y / length(v), v.z / length(v));
}

describe("rotations", () => {
    it("turns x into y a quarter turn about z", () => {
        expect(near(rotate(axisAngle(vec3(0, 0, 1), Math.PI / 2), vec3(1, 0, 0)), vec3(0, 1, 0), 1e-15)).toBe(true);
    });

    it("pitches the +x face down for a positive turn about y", () => {
        const n = rotate(axisAngle(vec3(0, 1, 0), 0.3), vec3(1, 0, 0));
        expect(near(n, vec3(Math.cos(0.3), 0, -Math.sin(0.3)), 1e-15)).toBe(true);
    });

    it("undoes a rotation with its inverse and keeps lengths", () => {
        const random = rng(17);
        for (let n = 0; n < 200; n++) {
            const q = axisAngle(randomUnit(random), (random() - 0.5) * 10);
            const v = vec3(random() - 0.5, random() - 0.5, random() - 0.5);
            expect(near(rotateInverse(q, rotate(q, v)), v, 1e-15)).toBe(true);
            expect(Math.abs(length(rotate(q, v)) - length(v))).toBeLessThan(1e-15);
        }
    });

    it("composes as b followed by a", () => {
        const a = axisAngle(vec3(0, 0, 1), 0.7);
        const b = axisAngle(vec3(1, 1, 0), -1.1);
        const v = vec3(0.3, -0.2, 0.9);
        expect(near(rotate(multiply(a, b), v), rotate(a, rotate(b, v)), 1e-15)).toBe(true);
    });

    it("leaves vectors alone under the identity", () => {
        expect(rotate(IDENTITY, vec3(1, 2, 3))).toEqual(vec3(1, 2, 3));
    });
});

describe("integrateOrientation", () => {
    it("turns by ω·t about a fixed axis", () => {
        let q: Quaternion = IDENTITY;
        for (let n = 0; n < 1000; n++) {
            q = integrateOrientation(q, vec3(0, 0, 1), 1e-3);
        }
        expect(near(rotate(q, vec3(1, 0, 0)), vec3(Math.cos(1), Math.sin(1), 0), 1e-9)).toBe(true);
    });

    it("stays a unit quaternion", () => {
        const random = rng(19);
        let q: Quaternion = IDENTITY;
        for (let n = 0; n < 10000; n++) {
            q = integrateOrientation(q, vec3(random() * 50, random() * 50, random() * 50), 1e-4);
        }
        expect(Math.abs(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z - 1)).toBeLessThan(1e-15);
    });
});

describe("angularAcceleration", () => {
    it("divides the torque by the moment of inertia about each principal axis", () => {
        expect(angularAcceleration(vec3(1, 2, 4), vec3(0, 0, 0), vec3(1, 1, 1))).toEqual(vec3(1, 0.5, 0.25));
    });

    it("carries the gyroscopic term −ω × (I·ω)", () => {
        // ω × Iω = (1, 1, 0) × (1, 2, 0) = (0, 0, 1).
        expect(angularAcceleration(vec3(1, 2, 3), vec3(1, 1, 0), vec3(0, 0, 0))).toEqual(vec3(0, 0, -1 / 3));
    });

    it("leaves spin about a principal axis unchanged without torque", () => {
        expect(angularAcceleration(vec3(1, 2, 3), vec3(0, 5, 0), vec3(0, 0, 0))).toEqual(vec3(0, 0, 0));
    });
});

describe("solidCylinderInertia", () => {
    it("gives ½·m·r² about the axis and m·(3r² + L²)/12 across it", () => {
        const i = solidCylinderInertia(1, 0.23, 0.032);
        expect(i.x).toBeCloseTo(0.5 * 0.032 * 0.032, 15);
        expect(i.y).toBeCloseTo((3 * 0.032 * 0.032 + 0.23 * 0.23) / 12, 15);
        expect(i.z).toBe(i.y);
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/engine/impact/rigidBody.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/engine/impact/rigidBody.ts`**

```ts
/**
 * Rigid-body kinematics of the mallet head (P2b.1 design §5): unit quaternions for its orientation, the orientation
 * update of semi-implicit Euler and Euler's equations in the body frame. Exact operations only (sinCos from
 * elementary.ts), like the rest of the engine.
 */
import { sinCos } from "../math/elementary";
import { add, cross, normalize, scale, sub, vec3, type Vec3 } from "../math/vec3";

/** A rotation as a unit quaternion w + x·i + y·j + z·k. It maps body coordinates to world coordinates. */
export interface Quaternion {
    readonly w: number;
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** The identity rotation: body axes coincide with world axes. */
export const IDENTITY: Quaternion = Object.freeze({ w: 1, x: 0, y: 0, z: 0 });

/** The right-handed rotation by `angle` (rad) about `axis` (any non-zero length). */
export function axisAngle(axis: Vec3, angle: number): Quaternion {
    const [s, c] = sinCos(angle / 2);
    const u = scale(normalize(axis), s);
    return { w: c, x: u.x, y: u.y, z: u.z };
}

/** The product a·b: rotation b, then rotation a. */
export function multiply(a: Quaternion, b: Quaternion): Quaternion {
    return {
        w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
        x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
        y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
        z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    };
}

/** Rotates a body-frame vector into the world frame: v + w·t + u × t with t = 2·u × v (u the vector part). */
export function rotate(q: Quaternion, v: Vec3): Vec3 {
    const u = vec3(q.x, q.y, q.z);
    const t = scale(cross(u, v), 2);
    return add(add(v, scale(t, q.w)), cross(u, t));
}

/** Rotates a world-frame vector into the body frame (the conjugate rotation). */
export function rotateInverse(q: Quaternion, v: Vec3): Vec3 {
    return rotate({ w: q.w, x: 0 - q.x, y: 0 - q.y, z: 0 - q.z }, v);
}

/**
 * Advances an orientation by a world-frame angular velocity over dt: q + (dt/2)·(0, ω)·q, renormalised with √. For a
 * fixed axis this turns by 2·atan(ω·dt/2) per step, within (ω·dt)³/12 of ω·dt.
 */
export function integrateOrientation(q: Quaternion, omega: Vec3, dt: number): Quaternion {
    const h = dt / 2;
    const w = q.w - h * (omega.x * q.x + omega.y * q.y + omega.z * q.z);
    const x = q.x + h * (omega.x * q.w + omega.y * q.z - omega.z * q.y);
    const y = q.y + h * (omega.y * q.w + omega.z * q.x - omega.x * q.z);
    const z = q.z + h * (omega.z * q.w + omega.x * q.y - omega.y * q.x);
    const n = Math.sqrt(w * w + x * x + y * y + z * z);
    return { w: w / n, x: x / n, y: y / n, z: z / n };
}

/** Body-frame angular acceleration from Euler's equations, I·ω̇ = τ − ω × (I·ω), for principal moments `inertia`. */
export function angularAcceleration(inertia: Vec3, omega: Vec3, torque: Vec3): Vec3 {
    const momentum = vec3(inertia.x * omega.x, inertia.y * omega.y, inertia.z * omega.z);
    const net = sub(torque, cross(omega, momentum));
    return vec3(net.x / inertia.x, net.y / inertia.y, net.z / inertia.z);
}

/** Principal moments of a uniform solid cylinder whose axis is body x: ½·m·r² along it, m·(3r² + L²)/12 across it. */
export function solidCylinderInertia(mass: number, length: number, radius: number): Vec3 {
    const across = (mass * (3 * radius * radius + length * length)) / 12;
    return vec3(0.5 * mass * radius * radius, across, across);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/impact/rigidBody.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Format, lint, check, commit**

```bash
git add src/engine/impact/rigidBody.ts tests/engine/impact/rigidBody.test.ts
git commit -F "$CLAUDE_TEMP_DIR/msg.txt"   # "Add rigid-body kinematics for the mallet head"
```

---

### Task 4: The contact law

**Files:**
- Create: `src/engine/impact/contactLaw.ts`
- Test: `tests/engine/impact/contactLaw.test.ts`

**Interfaces:**
- Consumes: `ln`, `atan2` (`math/elementary.ts`).
- Produces:
  - constants `TANGENTIAL_STIFFNESS_RATIO = 2/7` and `ZETA_MAX`;
  - `contactTimeFactor(zeta): number` (ω₀·T) and `lnRestitution(zeta): number`;
  - `dampingRatio(restitution): number`;
  - `interface PairLaw { stiffness; damping; tangentialStiffness; tangentialDamping; friction }`;
  - `lawFromContactTime(massEff, restitution, contactTime, friction): PairLaw`;
  - `lawFromStiffness(massEff, restitution, stiffness, friction): PairLaw`;
  - `normalForce(law, depth, rate): number`;
  - `interface Tangential { force: Vec3; spring: Vec3; sliding: boolean }`;
  - `tangentialForce(law, spring, slip, normal): Tangential`.

- [ ] **Step 1: Write the failing tests**

Create `tests/engine/impact/contactLaw.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { contactReference } from "../../../src/reference/index";
import { length, scale, sub, vec3 } from "../../../src/engine/math/vec3";
import {
    TANGENTIAL_STIFFNESS_RATIO,
    ZETA_MAX,
    contactTimeFactor,
    dampingRatio,
    lawFromContactTime,
    lawFromStiffness,
    lnRestitution,
    normalForce,
    tangentialForce,
} from "../../../src/engine/impact/contactLaw";

/**
 * Independent check of the clamped law: integrates δ'' = −2ζ·δ' − δ (m = k = 1) from δ = 0, δ' = 1 by RK4 until the
 * force δ + 2ζ·δ' first falls to zero, and returns the release time and the rebound speed −δ' there (linear
 * interpolation inside the last step).
 */
function clampedByOde(zeta: number): { time: number; restitution: number } {
    const h = 1e-4;
    const f = (d: number, v: number): [number, number] => [v, -2 * zeta * v - d];
    let d = 0;
    let v = 1;
    let t = 0;
    for (;;) {
        const [k1d, k1v] = f(d, v);
        const [k2d, k2v] = f(d + (h / 2) * k1d, v + (h / 2) * k1v);
        const [k3d, k3v] = f(d + (h / 2) * k2d, v + (h / 2) * k2v);
        const [k4d, k4v] = f(d + h * k3d, v + h * k3v);
        const nd = d + (h / 6) * (k1d + 2 * k2d + 2 * k3d + k4d);
        const nv = v + (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
        const before = d + 2 * zeta * v;
        const after = nd + 2 * zeta * nv;
        if (t > 0 && after <= 0) {
            const s = before / (before - after);
            return { time: t + s * h, restitution: -(v + s * (nv - v)) };
        }
        d = nd;
        v = nv;
        t += h;
    }
}

describe("clamped restitution and contact time", () => {
    it("is undamped at ζ = 0: half a period, e = 1", () => {
        expect(contactTimeFactor(0)).toBe(Math.PI);
        expect(lnRestitution(0)).toBe(0);
    });

    it("gives e = exp(−π/2) at ζ = 1/√2 and exp(−2) at ζ = 1", () => {
        expect(lnRestitution(Math.SQRT1_2)).toBeCloseTo(-Math.PI / 2, 13);
        expect(contactTimeFactor(1)).toBe(2);
        expect(lnRestitution(1)).toBe(-2);
    });

    it("is continuous across ζ = 1/√2 and ζ = 1", () => {
        for (const z of [Math.SQRT1_2, 1]) {
            expect(Math.abs(contactTimeFactor(z - 1e-9) - contactTimeFactor(z + 1e-9))).toBeLessThan(1e-6);
            expect(Math.abs(lnRestitution(z - 1e-9) - lnRestitution(z + 1e-9))).toBeLessThan(1e-6);
        }
    });

    it("matches the overdamped closed form at ζ = 2", () => {
        const tau = (2 * Math.log(2 + Math.sqrt(3))) / Math.sqrt(3);
        expect(contactTimeFactor(2)).toBeCloseTo(tau, 13);
        expect(lnRestitution(2)).toBeCloseTo(-2 * tau, 13);
    });

    it("agrees with direct integration of the clamped law on every branch", () => {
        for (const zeta of [0, 0.3, 0.7, 0.75, 0.9, 1, 1.2, 2.5]) {
            const ode = clampedByOde(zeta);
            expect(Math.abs(contactTimeFactor(zeta) - ode.time), `ζ = ${zeta}`).toBeLessThan(1e-6);
            expect(Math.abs(Math.exp(lnRestitution(zeta)) - ode.restitution), `ζ = ${zeta}`).toBeLessThan(1e-6);
        }
    });

    it("falls monotonically to below 1e-12 at ZETA_MAX", () => {
        let previous = 1;
        for (let z = 0.01; z < 50; z *= 1.1) {
            const ln = lnRestitution(z);
            expect(ln).toBeLessThan(previous);
            previous = ln;
        }
        expect(lnRestitution(ZETA_MAX)).toBeLessThan(Math.log(1e-12));
    });
});

describe("dampingRatio", () => {
    it("round-trips every restitution in (0, 1]", () => {
        for (const e of [1, 0.999999, 0.9, 0.817, 0.72, 0.5, 0.2079, 0.15, Math.exp(-2), 0.1, 1e-3, 1e-9]) {
            const z = dampingRatio(e);
            expect(Math.abs(lnRestitution(z) - Math.log(e)), `e = ${e}`).toBeLessThanOrEqual(
                1e-12 * Math.max(1, Math.abs(Math.log(e))),
            );
        }
        expect(dampingRatio(1)).toBe(0);
    });

    it("lands on the right branch around the critical band", () => {
        expect(dampingRatio(0.25)).toBeLessThan(Math.SQRT1_2);
        expect(dampingRatio(0.15)).toBeGreaterThan(Math.SQRT1_2);
        expect(dampingRatio(0.15)).toBeLessThan(1);
        expect(dampingRatio(0.1)).toBeGreaterThan(1);
        expect(dampingRatio(Math.exp(-2))).toBeCloseTo(1, 6);
    });

    it("returns ZETA_MAX below the smallest restitution it represents", () => {
        expect(dampingRatio(1e-300)).toBe(ZETA_MAX);
    });
});

describe("pair laws", () => {
    it("reproduces the contact time and sets k_t = 2/7·k", () => {
        const law = lawFromContactTime(0.3, 0.8, 8e-4, 0.4);
        const zeta = dampingRatio(0.8);
        const omega = Math.sqrt(law.stiffness / 0.3);
        expect(contactTimeFactor(zeta) / omega).toBeCloseTo(8e-4, 15);
        expect(law.damping).toBeCloseTo(2 * zeta * Math.sqrt(law.stiffness * 0.3), 9);
        expect(law.tangentialStiffness).toBe(TANGENTIAL_STIFFNESS_RATIO * law.stiffness);
        expect(law.tangentialDamping).toBeCloseTo(2 * zeta * Math.sqrt(law.tangentialStiffness * 0.3), 9);
        expect(law.friction).toBe(0.4);
    });

    it("takes a stiffness as given", () => {
        const law = lawFromStiffness(0.45, 0.5, 2e5, 0.3);
        expect(law.stiffness).toBe(2e5);
        expect(law.damping).toBeCloseTo(2 * dampingRatio(0.5) * Math.sqrt(2e5 * 0.45), 9);
    });

    it("matches the sourced tangential ratio", () => {
        expect(TANGENTIAL_STIFFNESS_RATIO).toBe(contactReference.tangentialStiffnessRatio.value);
    });
});

describe("forces", () => {
    const law = lawFromStiffness(0.45, 0.5, 2e5, 0.3);

    it("never pulls", () => {
        expect(normalForce(law, 1e-4, -100)).toBe(0);
        expect(normalForce(law, 1e-4, 0)).toBe(20);
    });

    it("keeps a stuck contact's trial force and spring", () => {
        const spring = vec3(1e-6, 0, 0);
        const t = tangentialForce(law, spring, vec3(0, 0, 0), 100);
        expect(t.sliding).toBe(false);
        expect(t.spring).toBe(spring);
        expect(t.force).toEqual(scale(spring, -law.tangentialStiffness));
    });

    it("scales a sliding contact's force onto the cone and resets its spring to match", () => {
        const slip = vec3(0.3, -0.1, 0);
        const t = tangentialForce(law, vec3(1e-3, 2e-4, 0), slip, 2);
        expect(t.sliding).toBe(true);
        expect(length(t.force)).toBeCloseTo(0.3 * 2, 12);
        const reproduced = sub(scale(t.spring, -law.tangentialStiffness), scale(slip, law.tangentialDamping));
        expect(length(sub(reproduced, t.force))).toBeLessThan(1e-12);
    });

    it("carries no friction without load", () => {
        const t = tangentialForce(law, vec3(1e-3, 0, 0), vec3(0.1, 0, 0), 0);
        expect(length(t.force)).toBe(0);
        expect(t.sliding).toBe(true);
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/engine/impact/contactLaw.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/engine/impact/contactLaw.ts`**

```ts
/**
 * The contact law of the impact phase (P2b.1 design §4): a linear spring–dashpot (Kelvin–Voigt) normal force, clamped
 * so that it never pulls, whose damping is solved from the sourced restitution; and Cundall–Strack tangential
 * friction, a spring–slider with true sticking.
 *
 * Clamped linear dashpot (Schwager and Pöschel, "Coefficient of restitution and linear–dashpot model revisited",
 * Granular Matter 9, 2007). For m·δ'' + c·δ' + k·δ = 0 from δ = 0, δ' = v, with ω₀ = √(k/m) and ζ = c/(2·√(k·m)), the
 * contact releases when its force k·δ + c·δ' falls to zero, at ω₀·T = τ(ζ):
 *   ζ < 1:  τ = atan2(2ζ·w, 2ζ² − 1) / w,   w = √(1 − ζ²)
 *   ζ = 1:  τ = 2
 *   ζ > 1:  τ = 2·ln(ζ + s) / s,            s = √(ζ² − 1)
 * and in every branch the velocity at release is −v·exp(−ζ·τ), so ln e = −ζ·τ(ζ). The underdamped form is the paper's
 * π − arctan(2ζw / (1 − 2ζ²)), written with atan2 so that one expression covers both sides of ζ = 1/√2; the overdamped
 * form is its ln((ζ + s)/(ζ − s))/s, using (ζ − s) = 1/(ζ + s) to avoid cancellation at large ζ. The release condition
 * is linear in v, so e does not depend on the impact speed. ζ·τ(ζ) increases strictly from 0 towards infinity, so the
 * ζ giving a restitution is found by bisection on ln e, which needs no exp.
 */
import { atan2, ln } from "../math/elementary";
import { add, length, scale, sub, type Vec3 } from "../math/vec3";

/** k_t/k, a contact's tangential stiffness relative to its normal stiffness (Silbert et al. 2001; contact.json). */
export const TANGENTIAL_STIFFNESS_RATIO = 2 / 7;

/**
 * Upper end of the damping-ratio bisection. A numerical bound, not physical: e(ζ) ≈ 1/(4ζ²) for large ζ, so
 * e(ZETA_MAX) ≈ 2.5e-13, below any restitution a contact is given. PROVISIONAL (pre-flight).
 */
export const ZETA_MAX = 1e6;

/** ω₀·T: the clamped law's contact duration in units of 1/ω₀, for damping ratio ζ ≥ 0. */
export function contactTimeFactor(zeta: number): number {
    if (zeta < 1) {
        const w = Math.sqrt(1 - zeta * zeta);
        return atan2(2 * zeta * w, 2 * zeta * zeta - 1) / w;
    }
    if (zeta === 1) {
        return 2;
    }
    const s = Math.sqrt(zeta * zeta - 1);
    return (2 * ln(zeta + s)) / s;
}

/** ln e of the clamped law at damping ratio ζ: −ζ·τ(ζ). */
export function lnRestitution(zeta: number): number {
    return 0 - zeta * contactTimeFactor(zeta);
}

/**
 * The damping ratio whose clamped law has restitution `restitution` ∈ (0, 1]: 0 for 1, ZETA_MAX for anything at or
 * below e(ZETA_MAX). Bisects on ln e until the bracket's ends are adjacent doubles, so the result is deterministic.
 */
export function dampingRatio(restitution: number): number {
    if (restitution >= 1) {
        return 0;
    }
    const target = ln(restitution);
    if (lnRestitution(ZETA_MAX) >= target) {
        return ZETA_MAX;
    }
    let lo = 0;
    let hi = ZETA_MAX;
    for (;;) {
        const mid = lo + (hi - lo) / 2;
        if (mid <= lo || mid >= hi) {
            return lo;
        }
        if (lnRestitution(mid) > target) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
}

/** The coefficients of one contact: normal stiffness and damping, tangential stiffness and damping, and friction. */
export interface PairLaw {
    readonly stiffness: number;
    readonly damping: number;
    readonly tangentialStiffness: number;
    readonly tangentialDamping: number;
    readonly friction: number;
}

function pairLaw(massEff: number, zeta: number, stiffness: number, friction: number): PairLaw {
    const tangentialStiffness = TANGENTIAL_STIFFNESS_RATIO * stiffness;
    return {
        stiffness,
        damping: 2 * zeta * Math.sqrt(stiffness * massEff),
        tangentialStiffness,
        tangentialDamping: 2 * zeta * Math.sqrt(tangentialStiffness * massEff),
        friction,
    };
}

/**
 * The law of a pair with reduced mass `massEff` whose central collision lasts `contactTime` (s) with `restitution`:
 * ω₀ = τ(ζ)/T, k = m·ω₀², c = 2ζ·m·ω₀ (design §4). Restitution is exact for central collisions.
 */
export function lawFromContactTime(
    massEff: number,
    restitution: number,
    contactTime: number,
    friction: number,
): PairLaw {
    const zeta = dampingRatio(restitution);
    const omega = contactTimeFactor(zeta) / contactTime;
    return pairLaw(massEff, zeta, massEff * omega * omega, friction);
}

/** The law of a pair with reduced mass `massEff`, normal stiffness `stiffness` (N/m) and `restitution`. */
export function lawFromStiffness(massEff: number, restitution: number, stiffness: number, friction: number): PairLaw {
    return pairLaw(massEff, dampingRatio(restitution), stiffness, friction);
}

/** Normal force (N) of a closed contact with penetration `depth` > 0, closing at `rate` (m/s; negative opening). */
export function normalForce(law: PairLaw, depth: number, rate: number): number {
    return Math.max(0, law.stiffness * depth + law.damping * rate);
}

/** A contact's tangential force on body B, its elastic displacement after the step, and whether it slid. */
export interface Tangential {
    readonly force: Vec3;
    readonly spring: Vec3;
    readonly sliding: boolean;
}

/**
 * Cundall–Strack friction. `spring` is the elastic tangential displacement ξ carried into this step, already projected
 * onto the current tangent plane and advanced by slip·dt; `slip` is the tangential velocity of B's contact point
 * relative to A's. The trial force −k_t·ξ − c_t·slip is kept while it lies within the Coulomb cone μ·N: the contact
 * sticks, truly, with no creep. Otherwise it slides: the force is scaled onto the cone and ξ is reset to the
 * displacement that gives exactly that force, so a sliding contact stores no excess.
 */
export function tangentialForce(law: PairLaw, spring: Vec3, slip: Vec3, normal: number): Tangential {
    const trial = sub(scale(spring, 0 - law.tangentialStiffness), scale(slip, law.tangentialDamping));
    const size = length(trial);
    const limit = law.friction * normal;
    if (size <= limit) {
        return { force: trial, spring, sliding: false };
    }
    const force = scale(trial, limit / size);
    // −k_t·ξ − c_t·slip = force  ⇒  ξ = −(force + c_t·slip)/k_t.
    const reset = scale(add(force, scale(slip, law.tangentialDamping)), -1 / law.tangentialStiffness);
    return { force, spring: reset, sliding: true };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/impact/contactLaw.test.ts`
Expected: PASS (17 tests).

If the ODE cross-check fails on one branch, the closed form for that branch is wrong: fix the formula, never the
tolerance. Pre-flight records the largest ODE difference per branch here.

- [ ] **Step 5: Format, lint, check, commit**

```bash
git add src/engine/impact/contactLaw.ts tests/engine/impact/contactLaw.test.ts
git commit -F "$CLAUDE_TEMP_DIR/msg.txt"   # "Add the impact contact law"
```

---

### Task 5: Impact types and contact geometry

**Files:**
- Create: `src/engine/impact/types.ts`, `src/engine/impact/contacts.ts`
- Test: `tests/engine/impact/contacts.test.ts`

**Interfaces:**
- Consumes: `Quaternion`, `rotate`, `axisAngle` (Task 3).
- Produces (`types.ts`): `MalletHead`, `FaceMaterial`, `DriveSample`, `HeadState`, `ContactState`, `ImpactEvent`,
  `ImpactRun`, `ImpactResult`, exactly as below.
- Produces (`contacts.ts`):
  - `type PairKind`; `interface Pair { kind; key; a; b }`; `interface Penetration { normal; depth; point }`;
  - `OFF_FACE`;
  - `pairList(ids, turf): Pair[]`;
  - `faceContact(state, head, centre, radius)`, `ballBallContact(a, b, radius)`, `turfContact(centre, radius)` and
    `pairContact(pair, state, head, balls, radius)`;
  - `pointVelocity(centre, velocity, angularVelocity, point): Vec3`;
  - `headLowestPoint(state, head): number`;
  - `headClosing(state, head, ball, radius): boolean`.

- [ ] **Step 1: Write `src/engine/impact/types.ts`** (types only; the tests in Step 2 compile against it)

```ts
/**
 * Data types of the impact phase (P2b.1 design §3). The impact takes a ContactState (the mallet head and its face,
 * its state at t = 0, and the drive the hands apply) and the balls at rest, and returns each ball's state for phase 2.
 */
import type { Vec3 } from "../math/vec3";
import type { BallId, BallStates } from "../types";
import type { Quaternion } from "./rigidBody";

/** The mallet head: a solid cylinder whose axis is the body x axis; the two end discs are its faces. */
export interface MalletHead {
    readonly mass: number;
    /** Principal moments about the centre of mass, body frame (axis, and the two transverse axes). */
    readonly inertia: Vec3;
    readonly length: number;
    readonly radius: number;
    /** Where the shaft meets the head, body frame. The drive force acts here. */
    readonly socket: Vec3;
}

/** A face's restitution and Coulomb friction against a ball, and the duration (s) of a central strike. */
export interface FaceMaterial {
    readonly restitution: number;
    readonly friction: number;
    readonly contactTime: number;
}

/** Applied force at time t (s from the start of the impact), world frame. Linear between samples. */
export interface DriveSample {
    readonly t: number;
    readonly force: Vec3;
}

/** The head's centre of mass, orientation (unit quaternion body → world) and velocities, all world frame. */
export interface HeadState {
    readonly position: Vec3;
    readonly orientation: Quaternion;
    readonly velocity: Vec3;
    readonly angularVelocity: Vec3;
}

/**
 * What the swing delivers to the impact: the head and its face, its state at t = 0, and the drive. The drive is the
 * total force the hands apply to the head, excluding gravity, so it carries the head's weight. Samples are in strictly
 * increasing t, the first at t = 0, the last ending the drive window; the force is zero after it.
 */
export interface ContactState extends HeadState {
    readonly head: MalletHead;
    readonly face: FaceMaterial;
    readonly drive: readonly DriveSample[];
}

/**
 * Something that happened during the impact; t is seconds from its start. `turf-lift`: a ball's centre first rose to
 * z = R from below. The others mark a result outside the validated model, as phase 2's jump flag does:
 * - `impact-cap`: the impact reached IMPACT_CAP;
 * - `impact-head-approaching`: when it ended the head was still closing on a ball within reach (a second strike, a
 *   double tap, is a fault and is not modelled);
 * - `impact-mallet-grounded`: part of the head went below the turf plane (mallet–turf contact is not modelled);
 * - `impact-off-face`: a ball reached the rim of a face rather than the face (edge strokes are not modelled).
 */
export type ImpactEvent =
    | { readonly kind: "turf-lift"; readonly t: number; readonly ball: BallId }
    | { readonly kind: "impact-cap"; readonly t: number }
    | { readonly kind: "impact-head-approaching"; readonly t: number; readonly ball: BallId }
    | { readonly kind: "impact-mallet-grounded"; readonly t: number }
    | { readonly kind: "impact-off-face"; readonly t: number; readonly ball: BallId };

/** What the integrator returns: the bodies at the end of the impact and what happened on the way. */
export interface ImpactRun {
    readonly balls: BallStates;
    readonly head: HeadState;
    readonly duration: number;
    readonly events: readonly ImpactEvent[];
    /** Deepest penetration (m) of every pair that closed, keyed "face/<ball>", "<ball>/<ball>" or "turf/<ball>". */
    readonly peakPenetration: Readonly<Record<string, number>>;
    readonly steps: number;
}

/** The impact's outcome, with the balls as handed over to phase 2 (design §6). */
export interface ImpactResult extends ImpactRun {
    readonly handover: BallStates;
    /** Largest overlap (m) the handover removed from a pair of balls. */
    readonly overlapCorrection: number;
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/engine/impact/contacts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ZERO, length, sub, vec3 } from "../../../src/engine/math/vec3";
import {
    OFF_FACE,
    ballBallContact,
    faceContact,
    headClosing,
    headLowestPoint,
    pairList,
    pointVelocity,
    turfContact,
    type Penetration,
} from "../../../src/engine/impact/contacts";
import { IDENTITY, axisAngle } from "../../../src/engine/impact/rigidBody";
import type { HeadState, MalletHead } from "../../../src/engine/impact/types";
import type { BallState } from "../../../src/engine/types";

const R = 0.046;
const HEAD: MalletHead = { mass: 1, inertia: vec3(1, 1, 1), length: 0.2, radius: 0.03, socket: vec3(0, 0, 0.03) };

/** The head at rest with its +x face centred at the origin's left, facing +x. */
function headAt(x: number, velocity = ZERO): HeadState {
    return { position: vec3(x - 0.1, 0, 0.1), orientation: IDENTITY, velocity, angularVelocity: ZERO };
}

describe("pairList", () => {
    it("orders face–ball, then ball–ball, then ball–turf, each in ball order", () => {
        const keys = pairList(["blue", "red", "yellow"], [true, false, true]).map((p) => p.key);
        expect(keys).toEqual([
            "face/blue",
            "face/red",
            "face/yellow",
            "blue/red",
            "blue/yellow",
            "red/yellow",
            "turf/blue",
            "turf/yellow",
        ]);
    });
});

describe("faceContact", () => {
    it("measures a centred ball's penetration along the face normal", () => {
        const c = faceContact(headAt(0), HEAD, vec3(R - 1e-4, 0, 0.1), R) as Penetration;
        expect(c.normal).toEqual(vec3(1, 0, 0));
        expect(c.depth).toBeCloseTo(1e-4, 15);
        expect(c.point.x).toBeCloseTo(-5e-5, 15);
    });

    it("forms no contact with a ball short of the face", () => {
        expect(faceContact(headAt(0), HEAD, vec3(R + 1e-4, 0, 0.1), R)).toBeNull();
    });

    it("uses the back face too", () => {
        const back = faceContact(headAt(0), HEAD, vec3(-0.2 - R + 1e-4, 0, 0.1), R) as Penetration;
        expect(back.normal.x).toBeCloseTo(-1, 15);
        expect(back.depth).toBeCloseTo(1e-4, 12);
    });

    it("turns a ball beyond the disc but touching the rim into OFF_FACE", () => {
        expect(faceContact(headAt(0), HEAD, vec3(R - 1e-3, 0.03 + 0.01, 0.1), R)).toBe(OFF_FACE);
        expect(faceContact(headAt(0), HEAD, vec3(R - 1e-3, 0.03 + R, 0.1), R)).toBeNull();
    });

    it("follows the head's orientation", () => {
        const q = axisAngle(vec3(0, 0, 1), Math.PI / 2);
        const state: HeadState = { position: vec3(0, -0.1, 0.1), orientation: q, velocity: ZERO, angularVelocity: ZERO };
        const c = faceContact(state, HEAD, vec3(0, R - 1e-4, 0.1), R) as Penetration;
        expect(length(sub(c.normal, vec3(0, 1, 0)))).toBeLessThan(1e-15);
        expect(c.depth).toBeCloseTo(1e-4, 12);
    });
});

describe("ball and turf contacts", () => {
    it("closes two balls closer than 2R along the line of centres", () => {
        const c = ballBallContact(vec3(0, 0, R), vec3(2 * R - 1e-5, 0, R), R) as Penetration;
        expect(c.normal).toEqual(vec3(1, 0, 0));
        expect(c.depth).toBeCloseTo(1e-5, 15);
        expect(ballBallContact(vec3(0, 0, R), vec3(2 * R, 0, R), R)).toBeNull();
    });

    it("closes the turf while z < R, whatever the velocity", () => {
        const c = turfContact(vec3(1, 2, R - 2e-5), R) as Penetration;
        expect(c.normal).toEqual(vec3(0, 0, 1));
        expect(c.depth).toBeCloseTo(2e-5, 15);
        expect(turfContact(vec3(1, 2, R), R)).toBeNull();
    });
});

describe("head geometry", () => {
    it("finds the lowest point of a level and of a tilted head", () => {
        expect(headLowestPoint(headAt(0), HEAD)).toBeCloseTo(0.07, 15);
        const tilted: HeadState = { ...headAt(0), orientation: axisAngle(vec3(0, 1, 0), 0.5) };
        const az = Math.sin(0.5);
        expect(headLowestPoint(tilted, HEAD)).toBeCloseTo(0.1 - 0.1 * az - 0.03 * Math.cos(0.5), 12);
    });

    it("gives a point's velocity on a spinning body", () => {
        expect(pointVelocity(ZERO, vec3(1, 0, 0), vec3(0, 0, 2), vec3(0, 1, 0))).toEqual(vec3(-1, 0, 0));
    });
});

describe("headClosing", () => {
    const ball = (x: number, vx: number): BallState => ({
        position: vec3(x, 0, 0.1),
        velocity: vec3(vx, 0, 0),
        angularVelocity: ZERO,
    });

    it("flags a ball just ahead that the face is catching", () => {
        expect(headClosing(headAt(0, vec3(2, 0, 0)), HEAD, ball(R + 1e-3, 1), R)).toBe(true);
    });

    it("does not flag a ball moving away faster than the face", () => {
        expect(headClosing(headAt(0, vec3(2, 0, 0)), HEAD, ball(R + 1e-3, 3), R)).toBe(false);
    });

    it("ignores a ball a metre ahead", () => {
        expect(headClosing(headAt(0, vec3(2, 0, 0)), HEAD, ball(1, 0), R)).toBe(false);
    });

    it("ignores a ball behind the back face", () => {
        expect(headClosing(headAt(0, vec3(2, 0, 0)), HEAD, ball(-0.2 - R - 1e-3, 0), R)).toBe(false);
    });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/engine/impact/contacts.test.ts`
Expected: FAIL, `contacts.ts` not found.

- [ ] **Step 4: Implement `src/engine/impact/contacts.ts`**

```ts
/**
 * Contacts of the impact phase (P2b.1 design §4): the pair list and each pair's geometry. A pair is body A acting on
 * body B along the unit normal n from A to B: the mallet face on a ball, the earlier ball in BALL_IDS order on the
 * later one, or the turf on a ball. Penetration δ > 0 means the pair is closed. The contact point lies on the
 * normal's line, δ/2 inside ball B's undeformed surface: x = c_B − (R − δ/2)·n. Ball–upright and ball–peg pairs are a
 * further kind, deferred (design §11).
 */
import { add, cross, dot, length, scale, sub, vec3, type Vec3 } from "../math/vec3";
import type { BallId, BallState } from "../types";
import { rotate } from "./rigidBody";
import type { HeadState, MalletHead } from "./types";

/** The kinds of pair, in the order the pair list holds them. */
export type PairKind = "face-ball" | "ball-ball" | "ball-turf";

/** One pair. `b` indexes the impact's balls; `a` does too for a ball–ball pair and is −1 for the face or the turf. */
export interface Pair {
    readonly kind: PairKind;
    readonly key: string;
    readonly a: number;
    readonly b: number;
}

/** A closed pair: unit normal from A to B, penetration (m) and contact point. */
export interface Penetration {
    readonly normal: Vec3;
    readonly depth: number;
    readonly point: Vec3;
}

/** A ball whose centre projects outside a face disc but which reaches the face's rim (design §4). */
export const OFF_FACE = "off-face";

const UP = vec3(0, 0, 1);
const FACES = [1, -1] as const;

/**
 * The pair list in its fixed order: face–ball, then ball–ball, then ball–turf, each in ball order (`ids` are in
 * BALL_IDS order). A ball has a turf pair only where `turf` says so (isolated test cases leave the turf out).
 */
export function pairList(ids: readonly BallId[], turf: readonly boolean[]): Pair[] {
    const pairs: Pair[] = ids.map((id, b): Pair => ({ kind: "face-ball", key: `face/${id}`, a: -1, b }));
    ids.forEach((first, a) => {
        for (let b = a + 1; b < ids.length; b++) {
            pairs.push({ kind: "ball-ball", key: `${first}/${ids[b] as BallId}`, a, b });
        }
    });
    ids.forEach((id, b) => {
        if (turf[b]) {
            pairs.push({ kind: "ball-turf", key: `turf/${id}`, a: -1, b });
        }
    });
    return pairs;
}

/** Outward unit normal and disc centre of face `side` (+1: the body +x end; −1: the −x end), world frame. */
function faceOf(state: HeadState, head: MalletHead, side: 1 | -1): { readonly normal: Vec3; readonly centre: Vec3 } {
    const normal = rotate(state.orientation, vec3(side, 0, 0));
    return { normal, centre: add(state.position, scale(normal, head.length / 2)) };
}

/**
 * The face–ball contact of a ball centred at `centre`. For each face in turn (+x, then −x), d is the centre's signed
 * distance from the face plane along the face's outward normal. A ball with 0 < d < R whose centre projects inside the
 * face disc is in contact, δ = R − d. One whose projection lies outside the disc, but whose cross-section in the face
 * plane (radius √(R² − d²)) still reaches the disc, touches the rim instead: OFF_FACE. Otherwise null.
 */
export function faceContact(
    state: HeadState,
    head: MalletHead,
    centre: Vec3,
    radius: number,
): Penetration | typeof OFF_FACE | null {
    for (const side of FACES) {
        const face = faceOf(state, head, side);
        const offset = sub(centre, face.centre);
        const d = dot(offset, face.normal);
        if (!(d > 0 && d < radius)) {
            continue;
        }
        const radial = length(sub(offset, scale(face.normal, d)));
        if (radial <= head.radius) {
            const depth = radius - d;
            return { normal: face.normal, depth, point: sub(centre, scale(face.normal, radius - depth / 2)) };
        }
        if (radial < head.radius + Math.sqrt(radius * radius - d * d)) {
            return OFF_FACE;
        }
    }
    return null;
}

/** The contact of ball a with ball b (centres `a`, `b`), or null while they are at least 2R apart. */
export function ballBallContact(a: Vec3, b: Vec3, radius: number): Penetration | null {
    const offset = sub(b, a);
    const distance = length(offset);
    const depth = 2 * radius - distance;
    if (!(depth > 0)) {
        return null;
    }
    const normal = scale(offset, 1 / distance);
    return { normal, depth, point: sub(b, scale(normal, radius - depth / 2)) };
}

/** The turf's contact with a ball centred at `centre`: closed while z < R, whatever its force (design §4). */
export function turfContact(centre: Vec3, radius: number): Penetration | null {
    const depth = radius - centre.z;
    if (!(depth > 0)) {
        return null;
    }
    return { normal: UP, depth, point: vec3(centre.x, centre.y, centre.z - (radius - depth / 2)) };
}

/** The contact of `pair` in the current state, OFF_FACE, or null while it is open. */
export function pairContact(
    pair: Pair,
    state: HeadState,
    head: MalletHead,
    balls: readonly BallState[],
    radius: number,
): Penetration | typeof OFF_FACE | null {
    const centre = (balls[pair.b] as BallState).position;
    switch (pair.kind) {
        case "face-ball":
            return faceContact(state, head, centre, radius);
        case "ball-ball":
            return ballBallContact((balls[pair.a] as BallState).position, centre, radius);
        case "ball-turf":
            return turfContact(centre, radius);
    }
}

/** Velocity of the material point at `point` of a body moving with `velocity`, spinning with `angularVelocity` about `centre`. */
export function pointVelocity(centre: Vec3, velocity: Vec3, angularVelocity: Vec3, point: Vec3): Vec3 {
    return add(velocity, cross(angularVelocity, sub(point, centre)));
}

/**
 * Height of the head's lowest point. With a the unit axis, the lower end disc's rim is lowest:
 * z − (L/2)·|a_z| − r·√(1 − a_z²).
 */
export function headLowestPoint(state: HeadState, head: MalletHead): number {
    const az = rotate(state.orientation, vec3(1, 0, 0)).z;
    return state.position.z - (head.length / 2) * Math.abs(az) - head.radius * Math.sqrt(Math.max(0, 1 - az * az));
}

/**
 * True when a face is still closing on the ball (design §5, head re-approach). The ball's centre must lie in front of
 * the face, with its surface within one ball radius of the face plane (0 < d < 2R). Its centre must project within
 * reach of the disc. And the face point under it must approach it along the face normal. A ball further off is not a
 * second strike of this stroke: a ball lying ahead in the line of play would otherwise be flagged on every stroke.
 */
export function headClosing(state: HeadState, head: MalletHead, ball: BallState, radius: number): boolean {
    for (const side of FACES) {
        const face = faceOf(state, head, side);
        const offset = sub(ball.position, face.centre);
        const d = dot(offset, face.normal);
        if (!(d > 0 && d < 2 * radius) || length(sub(offset, scale(face.normal, d))) >= head.radius + radius) {
            continue;
        }
        const under = sub(ball.position, scale(face.normal, radius));
        const facePoint = pointVelocity(state.position, state.velocity, state.angularVelocity, under);
        if (dot(sub(ball.velocity, facePoint), face.normal) < 0) {
            return true;
        }
    }
    return false;
}
```

Wrap the `pointVelocity` header comment to 120 columns.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/impact/contacts.test.ts`
Expected: PASS (15 tests).

- [ ] **Step 6: Format, lint, check, commit**

```bash
git add src/engine/impact/types.ts src/engine/impact/contacts.ts tests/engine/impact/contacts.test.ts
git commit -F "$CLAUDE_TEMP_DIR/msg.txt"   # "Add impact types and contact geometry"
```

---

### Task 6: The integrator

The fixed-step loop, its events and its termination, tested on isolated set-ups, each isolating one mechanism (spec
§9.1). The isolated set-ups go straight to `integrate()`: they need gravity off, no turf or moving balls, all of which
`simulateImpact` (Task 7) rightly rejects.

**Files:**
- Create: `src/engine/impact/integrate.ts`
- Create: `tests/engine/support/impact.ts` (shared by Tasks 6–9)
- Test: `tests/engine/impact/integrate.test.ts`, `tests/engine/impact/analytic.test.ts`

**Interfaces:**
- Consumes: Tasks 3–5.
- Produces (`integrate.ts`):
  - constants `IMPACT_DT`, `RELEASE_STEPS` and `IMPACT_CAP`;
  - `interface ImpactBall { id; state; turf: PairLaw | null }`;
  - `interface ImpactSetup { head; start: HeadState; drive; face: PairLaw; ballBall: PairLaw; ball: BallParams; gravity;
    balls: readonly ImpactBall[] }`;
  - `interface ContactSample { key; normal; depth; normalForce; tangentialForce; spring; law }`;
  - `interface ImpactSnapshot { t; drive; head; balls: readonly BallState[]; contacts }`;
  - `interface ImpactProbe { step(s) }` and `interface ImpactOptions { dt?; cap?; probe? }`;
  - `driveAt(drive, t): Vec3`;
  - `integrate(setup, options?): ImpactRun`.
- Produces (`tests/engine/support/impact.ts`):
  - `TEST_HEAD`, `TEST_FACE`, `coast()`, `drive()` and `strike()`;
  - `isolated()`, `faceLaw()` and `freeBall()`;
  - `counter()`, `recorder()` and `impactEnergy()`;
  - `SCENARIOS` and the `mirror*` helpers.

- [ ] **Step 1: Write the test support file**

Create `tests/engine/support/impact.ts`:

```ts
/**
 * Test-only mallet, face and impact helpers. Plausible but deliberately NOT sourced (as fixtures.ts), so expectations
 * do not move when reference data does. src/ must never import this file.
 */
import { ZERO, add, lengthSq, scale, sub, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import { lawFromContactTime, type PairLaw } from "../../../src/engine/impact/contactLaw";
import type {
    ImpactBall,
    ImpactProbe,
    ImpactSetup,
    ImpactSnapshot,
} from "../../../src/engine/impact/integrate";
import {
    IDENTITY,
    axisAngle,
    multiply,
    rotate,
    rotateInverse,
    solidCylinderInertia,
    type Quaternion,
} from "../../../src/engine/impact/rigidBody";
import type {
    ContactState,
    DriveSample,
    FaceMaterial,
    HeadState,
    MalletHead,
} from "../../../src/engine/impact/types";
import type { BallParams, BallState, BallStates } from "../../../src/engine/types";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import { TEST_BALL, ballAt } from "./fixtures";

const R = TEST_BALL.radius;

/** A 1.0 kg solid round head, 0.23 m long and 0.064 m across, shaft socket on top at the middle. */
export const TEST_HEAD: MalletHead = {
    mass: 1,
    inertia: solidCylinderInertia(1, 0.23, 0.032),
    length: 0.23,
    radius: 0.032,
    socket: vec3(0, 0, 0.032),
};

export const TEST_FACE: FaceMaterial = { restitution: 0.8, friction: 0.4, contactTime: 6e-4 };

/** A drive that carries the head's weight plus `force` (world frame) for `window` seconds. */
export function drive(force: Vec3, window: number, head: MalletHead = TEST_HEAD): DriveSample[] {
    const total = add(force, vec3(0, 0, head.mass * STANDARD_GRAVITY));
    return [
        { t: 0, force: total },
        { t: window, force: total },
    ];
}

/** A drive that only carries the head's weight for `window` seconds: the head coasts. */
export function coast(window = 3e-3, head: MalletHead = TEST_HEAD): DriveSample[] {
    return drive(ZERO, window, head);
}

/** How a test head meets a ball. Angles in rad; offsets in m, in the face's own frame. */
export interface StrikeOptions {
    readonly speed?: number;
    /** Head axis and travel turned about z from +x. */
    readonly yaw?: number;
    /** Head axis pitched nose-down (positive: the front face points below horizontal). */
    readonly pitch?: number;
    /** Travel below horizontal. */
    readonly descent?: number;
    /** Ball centre offset from the face axis along the head's body y and body z. */
    readonly lateral?: number;
    readonly vertical?: number;
    /** Gap (m) between the front face and the ball at t = 0. */
    readonly gap?: number;
    /** Drive, as a function of the unit direction of travel; default `coast()`. */
    readonly drive?: (travel: Vec3) => readonly DriveSample[];
    readonly head?: MalletHead;
    readonly face?: FaceMaterial;
}

/** A contact state whose front (+x) face, `gap` short of the ball centred at `centre`, travels towards it. */
export function strike(centre: Vec3, o: StrikeOptions = {}): ContactState {
    const head = o.head ?? TEST_HEAD;
    const yaw = axisAngle(vec3(0, 0, 1), o.yaw ?? 0);
    const orientation = multiply(yaw, axisAngle(vec3(0, 1, 0), o.pitch ?? 0));
    const axis = rotate(orientation, vec3(1, 0, 0));
    const across = add(
        scale(rotate(orientation, vec3(0, 1, 0)), o.lateral ?? 0),
        scale(rotate(orientation, vec3(0, 0, 1)), o.vertical ?? 0),
    );
    const faceCentre = sub(sub(centre, scale(axis, R + (o.gap ?? 1e-3))), across);
    const descent = o.descent ?? 0;
    const travel = rotate(yaw, vec3(Math.cos(descent), 0, -Math.sin(descent)));
    return {
        head,
        face: o.face ?? TEST_FACE,
        position: sub(faceCentre, scale(axis, head.length / 2)),
        orientation,
        velocity: scale(travel, o.speed ?? 2),
        angularVelocity: ZERO,
        drive: o.drive ? o.drive(travel) : coast(3e-3, head),
    };
}

/** The face law of TEST_FACE (or `face`) against a test ball, for a head of mass `headMass`. */
export function faceLaw(face: FaceMaterial = TEST_FACE, headMass = TEST_HEAD.mass): PairLaw {
    const massEff = (headMass * TEST_BALL.mass) / (headMass + TEST_BALL.mass);
    return lawFromContactTime(massEff, face.restitution, face.contactTime, face.friction);
}

/** A ball free in space at `position`, without turf under it. */
export function freeBall(id: ImpactBall["id"], position: Vec3, velocity: Vec3 = ZERO, turf: PairLaw | null = null): ImpactBall {
    return { id, state: { position, velocity, angularVelocity: ZERO }, turf };
}

/**
 * An isolated set-up for `integrate`: by default the head parked far away (it never touches anything) and undriven,
 * gravity off, the test face and test ball–ball laws, no balls. Override what a case needs.
 */
export function isolated(overrides: Partial<ImpactSetup> = {}): ImpactSetup {
    const start: HeadState = { position: vec3(-100, 0, 10), orientation: IDENTITY, velocity: ZERO, angularVelocity: ZERO };
    return {
        head: TEST_HEAD,
        start,
        drive: [{ t: 0, force: ZERO }],
        face: faceLaw(),
        ballBall: lawFromContactTime(TEST_BALL.mass / 2, 0.8, 7e-4, 0.05),
        ball: TEST_BALL,
        gravity: 0,
        balls: [],
        ...overrides,
    };
}

/** A probe that counts the steps in which pair `key` carried a positive normal force, and keeps the last snapshot. */
export function counter(key: string): ImpactProbe & { closed: number; last: ImpactSnapshot | null } {
    const probe = {
        closed: 0,
        last: null as ImpactSnapshot | null,
        step(s: ImpactSnapshot): void {
            if (s.contacts.some((c) => c.key === key && c.normalForce > 0)) {
                probe.closed++;
            }
            probe.last = s;
        },
    };
    return probe;
}

/** A probe that keeps every snapshot (use with short impacts only). */
export function recorder(): ImpactProbe & { readonly snapshots: ImpactSnapshot[] } {
    const snapshots: ImpactSnapshot[] = [];
    return {
        snapshots,
        step: (s) => {
            snapshots.push(s);
        },
    };
}

function headKinetic(state: HeadState, head: MalletHead): number {
    const w = rotateInverse(state.orientation, state.angularVelocity);
    const rot = head.inertia.x * w.x * w.x + head.inertia.y * w.y * w.y + head.inertia.z * w.z * w.z;
    return 0.5 * head.mass * lengthSq(state.velocity) + 0.5 * rot;
}

/** Kinetic, gravitational and stored spring energy (J) of a snapshot. */
export function impactEnergy(s: ImpactSnapshot, head: MalletHead, ball: BallParams, gravity: number): number {
    const inertia = 0.4 * ball.mass * ball.radius * ball.radius;
    let e = headKinetic(s.head, head) + head.mass * gravity * s.head.position.z;
    for (const b of s.balls) {
        e += 0.5 * ball.mass * lengthSq(b.velocity) + 0.5 * inertia * lengthSq(b.angularVelocity);
        e += ball.mass * gravity * b.position.z;
    }
    for (const c of s.contacts) {
        e += 0.5 * c.law.stiffness * c.depth * c.depth + 0.5 * c.law.tangentialStiffness * lengthSq(c.spring);
    }
    return e;
}

/** World position of the head's socket. */
export function socketAt(state: HeadState, head: MalletHead): Vec3 {
    return add(state.position, rotate(state.orientation, head.socket));
}

/** Kinetic energy of the initial state of a ContactState (head only; the balls start at rest). */
export function initialHeadEnergy(c: ContactState): number {
    return headKinetic(c, c.head);
}

/** A named public-path scenario on the test world: a contact state and balls at rest on the line y = 0. */
export interface Scenario {
    readonly name: string;
    readonly contact: ContactState;
    readonly balls: BallStates;
}

const BLUE = ballAt(5, 0);

/**
 * The scenarios the invariants, convergence and mirror tests share: a centre strike, a straight croquet stroke, a cut
 * (yawed, off-centre), a steep descending strike above the equator that drives the ball into the turf, a checked
 * stroke and a pushed stroke.
 */
export const SCENARIOS: readonly Scenario[] = [
    { name: "centre", contact: strike(BLUE.position), balls: { blue: BLUE } },
    {
        name: "croquet",
        contact: strike(BLUE.position, { speed: 3 }),
        balls: { blue: BLUE, red: ballAt(5 + 2 * R, 0) },
    },
    {
        name: "cut",
        contact: strike(BLUE.position, { speed: 2.5, yaw: 0.3, lateral: 0.01 }),
        balls: { blue: BLUE },
    },
    {
        name: "descending",
        contact: strike(BLUE.position, { speed: 3, descent: 0.5, pitch: 0.5 }),
        balls: { blue: BLUE },
    },
    {
        name: "check",
        contact: strike(BLUE.position, { speed: 3, drive: (t) => drive(scale(t, -150), 2e-3) }),
        balls: { blue: BLUE },
    },
    {
        name: "push",
        contact: strike(BLUE.position, { speed: 2, drive: (t) => drive(scale(t, 150), 3e-3) }),
        balls: { blue: BLUE },
    },
];

/** Reflection across the plane y = 0: positions, velocities and forces flip y. */
export function mirrorVec(v: Vec3): Vec3 {
    return vec3(v.x, 0 - v.y, v.z);
}

/** Angular velocity is a pseudovector: under the reflection it flips x and z. */
export function mirrorSpin(w: Vec3): Vec3 {
    return vec3(0 - w.x, w.y, 0 - w.z);
}

/** The reflected rotation M·R·M as a quaternion: (w, −x, y, −z). */
export function mirrorQuat(q: Quaternion): Quaternion {
    return { w: q.w, x: 0 - q.x, y: q.y, z: 0 - q.z };
}

export function mirrorBall(s: BallState): BallState {
    return {
        position: mirrorVec(s.position),
        velocity: mirrorVec(s.velocity),
        angularVelocity: mirrorSpin(s.angularVelocity),
    };
}

export function mirrorContact(c: ContactState): ContactState {
    return {
        ...c,
        position: mirrorVec(c.position),
        orientation: mirrorQuat(c.orientation),
        velocity: mirrorVec(c.velocity),
        angularVelocity: mirrorSpin(c.angularVelocity),
        drive: c.drive.map((s) => ({ t: s.t, force: mirrorVec(s.force) })),
    };
}
```

- [ ] **Step 2: Write the failing integrator tests**

Create `tests/engine/impact/integrate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ZERO, vec3 } from "../../../src/engine/math/vec3";
import { contactReference } from "../../../src/reference/index";
import { lawFromStiffness } from "../../../src/engine/impact/contactLaw";
import { IMPACT_DT, driveAt, integrate } from "../../../src/engine/impact/integrate";
import { IDENTITY } from "../../../src/engine/impact/rigidBody";
import { TEST_BALL } from "../support/fixtures";
import { TEST_HEAD, freeBall, isolated } from "../support/impact";

const R = TEST_BALL.radius;

describe("driveAt", () => {
    const samples = [
        { t: 0, force: vec3(0, 0, 10) },
        { t: 1e-3, force: vec3(20, 0, 10) },
        { t: 3e-3, force: vec3(0, 0, 10) },
    ];

    it("interpolates linearly between samples", () => {
        expect(driveAt(samples, 0.5e-3)).toEqual(vec3(10, 0, 10));
        expect(driveAt(samples, 2e-3)).toEqual(vec3(10, 0, 10));
    });

    it("holds the last sample at its time and is zero after it", () => {
        expect(driveAt(samples, 3e-3)).toEqual(vec3(0, 0, 10));
        expect(driveAt(samples, 3.000001e-3)).toBe(ZERO);
    });
});

describe("step", () => {
    it("is about 1/100 of the shortest sourced contact duration", () => {
        const shortest = Math.min(
            contactReference.ballBallContactTime.bounds?.[0] as number,
            contactReference.faceBallContactTime.bounds?.[0] as number,
        );
        expect(IMPACT_DT).toBeLessThanOrEqual(shortest / 50);
        expect(IMPACT_DT).toBeGreaterThanOrEqual(shortest / 200);
    });
});

describe("events and termination", () => {
    it("runs to the cap when the head never reaches a ball, and says so", () => {
        const run = integrate(isolated({ balls: [freeBall("blue", vec3(0, 0, 1))] }), { cap: 1e-3 });
        expect(run.events).toEqual([{ kind: "impact-cap", t: run.duration }]);
        expect(run.duration).toBeGreaterThanOrEqual(1e-3);
        expect(run.steps).toBe(Math.round(run.duration / IMPACT_DT));
    });

    it("ends RELEASE_STEPS after the last hard contact once the drive window has closed", () => {
        const start = { position: vec3(-R - 1e-4 - TEST_HEAD.length / 2, 0, 1), orientation: IDENTITY, velocity: vec3(2, 0, 0), angularVelocity: ZERO };
        const run = integrate(isolated({ start, balls: [freeBall("blue", vec3(0, 0, 1))] }));
        expect(run.events.filter((e) => e.kind === "impact-cap")).toEqual([]);
        expect(run.duration).toBeLessThan(5e-3);
        expect(run.peakPenetration["face/blue"]).toBeGreaterThan(0);
    });

    it("waits for the drive window to close", () => {
        const start = { position: vec3(-R - 1e-4 - TEST_HEAD.length / 2, 0, 1), orientation: IDENTITY, velocity: vec3(2, 0, 0), angularVelocity: ZERO };
        const drive = [
            { t: 0, force: ZERO },
            { t: 20e-3, force: ZERO },
        ];
        const run = integrate(isolated({ start, drive, balls: [freeBall("blue", vec3(0, 0, 1))] }));
        expect(run.duration).toBeGreaterThanOrEqual(20e-3);
    });

    it("raises turf-lift once, when a ball driven into the turf first rises back to z = R", () => {
        const setup = isolated({
            gravity: 9.80665,
            balls: [freeBall("blue", vec3(0, 0, R), vec3(0, 0, -2), lawFromStiffness(TEST_BALL.mass, 0.5, 2e5, 0.3))],
        });
        const run = integrate(setup, { cap: 20e-3 });
        expect(run.events.filter((e) => e.kind === "turf-lift")).toHaveLength(1);
    });

    it("flags a ball at the rim once and forms no face contact", () => {
        // The face plane R/2 short of the ball's centre, the face axis R/2 beyond the disc's edge: the ball's
        // cross-section in the face plane (radius √3·R/2) overlaps the disc while its centre projects outside it.
        const start = { position: vec3(-R / 2 - TEST_HEAD.length / 2, -(TEST_HEAD.radius + R / 2), 1), orientation: IDENTITY, velocity: vec3(1, 0, 0), angularVelocity: ZERO };
        const run = integrate(isolated({ start, balls: [freeBall("blue", vec3(0, 0, 1))] }), { cap: 5e-3 });
        expect(run.events.filter((e) => e.kind === "impact-off-face")).toHaveLength(1);
        expect(run.peakPenetration["face/blue"]).toBeUndefined();
        expect(run.events.some((e) => e.kind === "impact-cap")).toBe(true);
    });

    it("flags a head that goes below the turf plane once", () => {
        const start = { position: vec3(0, 0, TEST_HEAD.radius + 1e-4), orientation: IDENTITY, velocity: vec3(0, 0, -1), angularVelocity: ZERO };
        const run = integrate(isolated({ start }), { cap: 2e-3 });
        const grounded = run.events.filter((e) => e.kind === "impact-mallet-grounded");
        expect(grounded).toHaveLength(1);
        // The lowest point crosses z = 0 at 1e-4 s; the event is raised at the end of the step that crosses it.
        expect((grounded[0] as { t: number }).t).toBeCloseTo(1e-4, 4);
    });

    it("is bit-identical when repeated", () => {
        const start = { position: vec3(-R - 1e-4 - TEST_HEAD.length / 2, 0.003, 1), orientation: IDENTITY, velocity: vec3(2, 0.1, -0.2), angularVelocity: vec3(0, 3, 1) };
        const setup = isolated({ start, gravity: 9.80665, balls: [freeBall("blue", vec3(0, 0, 1))] });
        expect(integrate(setup)).toStrictEqual(integrate(setup));
    });
});
```

The long `start` literals are kept on one line here so that each start state reads whole; Prettier wraps them.

- [ ] **Step 3: Write the failing analytic tests**

Create `tests/engine/impact/analytic.test.ts`. Each case isolates one mechanism (spec §9.1). The ball–turf and
dropped-ball cases run at their own small `dt`, so that the comparison tests the law, not the step. Tolerances
marked PROVISIONAL are set by pre-flight to twice the measured error.

```ts
import { describe, expect, it } from "vitest";
import { ZERO, add, cross, dot, length, scale, sub, vec3 } from "../../../src/engine/math/vec3";
import {
    contactTimeFactor,
    dampingRatio,
    lawFromContactTime,
    lawFromStiffness,
} from "../../../src/engine/impact/contactLaw";
import { integrate, type ImpactSnapshot } from "../../../src/engine/impact/integrate";
import { IDENTITY, axisAngle, rotate, solidCylinderInertia } from "../../../src/engine/impact/rigidBody";
import type { MalletHead } from "../../../src/engine/impact/types";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import { TEST_BALL } from "../support/fixtures";
import { TEST_FACE, TEST_HEAD, counter, faceLaw, freeBall, isolated } from "../support/impact";

const R = TEST_BALL.radius;
const M = TEST_BALL.mass;
/** PROVISIONAL (pre-flight): relative tolerance on contact times and restitutions at dt = 1e-7 s. */
const LAW_TOLERANCE = 2e-3;
const FINE = 1e-7;

function closedForm(massEff: number, restitution: number, stiffness: number): number {
    return contactTimeFactor(dampingRatio(restitution)) / Math.sqrt(stiffness / massEff);
}

describe("one contact of each pair", () => {
    it("face–ball: the free, undriven head strikes a free ball with the face's contact time and restitution", () => {
        const law = faceLaw({ ...TEST_FACE, friction: 0 });
        const start = { position: vec3(-R - 1e-4 - TEST_HEAD.length / 2, 0, 1), orientation: IDENTITY, velocity: vec3(2, 0, 0), angularVelocity: ZERO };
        const probe = counter("face/blue");
        const run = integrate(isolated({ start, face: law, balls: [freeBall("blue", vec3(0, 0, 1))] }), { dt: FINE, probe });
        expect(Math.abs(probe.closed * FINE - TEST_FACE.contactTime) / TEST_FACE.contactTime).toBeLessThan(LAW_TOLERANCE);
        const e = ((run.balls.blue?.velocity.x as number) - run.head.velocity.x) / 2;
        expect(Math.abs(e - TEST_FACE.restitution) / TEST_FACE.restitution).toBeLessThan(LAW_TOLERANCE);
    });

    it("ball–ball: two balls head-on, no turf, no gravity, exchange velocity per e", () => {
        const e = 0.8;
        const T = 7e-4;
        const probe = counter("blue/red");
        const run = integrate(
            isolated({
                ballBall: lawFromContactTime(M / 2, e, T, 0),
                balls: [freeBall("blue", vec3(0, 0, 1), vec3(1, 0, 0)), freeBall("red", vec3(2 * R + 1e-5, 0, 1))],
            }),
            { dt: FINE, cap: 1e-3, probe },
        );
        expect(Math.abs(probe.closed * FINE - T) / T).toBeLessThan(LAW_TOLERANCE);
        expect(run.balls.blue?.velocity.x as number).toBeCloseTo((1 - e) / 2, 3);
        expect(run.balls.red?.velocity.x as number).toBeCloseTo((1 + e) / 2, 3);
    });

    // e = 0.5 below ζ = 1/√2; 0.15 between 1/√2 and 1 (the sourced turf lower bound); 0.1 overdamped.
    for (const e of [0.5, 0.15, 0.1]) {
        it(`ball–turf, e = ${e}: contact time and rebound match the clamped closed form`, () => {
            const k = 2e5;
            const probe = counter("turf/blue");
            const run = integrate(
                isolated({ balls: [freeBall("blue", vec3(0, 0, R), vec3(0, 0, -1), lawFromStiffness(M, e, k, 0))] }),
                { dt: FINE, cap: 8e-3, probe },
            );
            const T = closedForm(M, e, k);
            expect(Math.abs(probe.closed * FINE - T) / T).toBeLessThan(LAW_TOLERANCE);
            expect(Math.abs((run.balls.blue?.velocity.z as number) - e) / e).toBeLessThan(LAW_TOLERANCE);
        });
    }
});

describe("a ball dropped on the turf", () => {
    it("rebounds at the turf's restitution, gravity on", () => {
        const e = 0.5;
        const v = 5;
        let rebound = NaN;
        const probe = {
            step(s: ImpactSnapshot): void {
                const b = s.balls[0] as { position: { z: number }; velocity: { z: number } };
                if (Number.isNaN(rebound) && b.velocity.z > 0 && b.position.z >= R) {
                    rebound = b.velocity.z;
                }
            },
        };
        const run = integrate(
            isolated({ gravity: STANDARD_GRAVITY, balls: [freeBall("blue", vec3(0, 0, R), vec3(0, 0, -v), lawFromStiffness(M, e, 2e5, 0.3))] }),
            { dt: FINE, cap: 10e-3, probe },
        );
        expect(run.events.filter((x) => x.kind === "turf-lift")).toHaveLength(1);
        // Gravity acts through the 5 ms contact: g·T/v ≈ 1 % of the rebound.
        expect(Math.abs(rebound / v - e)).toBeLessThan(0.02);
    });
});

describe("a ball on a fixed inclined face", () => {
    // A ball can roll, so its contact sticks (rolls without slip, a = 5/7·g·sinθ) while tanθ ≤ 7μ/2 and slips
    // (a = g·(sinθ − μ·cosθ)) above it. The face belongs to a head of enormous mass whose weight the drive carries.
    const mu = 0.2;
    const huge: MalletHead = { ...TEST_HEAD, mass: 1e9, inertia: solidCylinderInertia(1e9, 0.23, 0.032) };

    function slide(theta: number): { acceleration: number; slip: number } {
        const law = lawFromContactTime((1e9 * M) / (1e9 + M), 0.8, 6e-4, mu);
        // The +x face's outward normal tilted θ from vertical, towards +x.
        const orientation = axisAngle(vec3(0, 1, 0), -(Math.PI / 2 - theta));
        const n = rotate(orientation, vec3(1, 0, 0));
        const position = vec3(0, 0, 1);
        const faceCentre = add(position, scale(n, huge.length / 2));
        const sink = (M * STANDARD_GRAVITY * Math.cos(theta)) / law.stiffness;
        const centre = add(faceCentre, scale(n, R - sink));
        const weight = vec3(0, 0, huge.mass * STANDARD_GRAVITY);
        const t = 0.02;
        const run = integrate(
            isolated({
                head: huge,
                start: { position, orientation, velocity: ZERO, angularVelocity: ZERO },
                drive: [
                    { t: 0, force: weight },
                    { t: 1, force: weight },
                ],
                face: law,
                gravity: STANDARD_GRAVITY,
                balls: [freeBall("blue", centre)],
            }),
            { cap: t },
        );
        const b = run.balls.blue as { velocity: ReturnType<typeof vec3>; angularVelocity: ReturnType<typeof vec3> };
        const down = vec3(Math.cos(theta), 0, -Math.sin(theta));
        const contactPoint = add(b.velocity, cross(b.angularVelocity, scale(n, -R)));
        const slip = length(sub(contactPoint, scale(n, dot(contactPoint, n))));
        return { acceleration: dot(b.velocity, down) / run.duration, slip };
    }

    it("sticks and rolls below tanθ = 7μ/2", () => {
        const theta = Math.atan(0.5);
        const { acceleration, slip } = slide(theta);
        const expected = (5 / 7) * STANDARD_GRAVITY * Math.sin(theta);
        expect(Math.abs(acceleration - expected) / expected).toBeLessThan(0.02);
        // A stuck contact only carries the tangential spring's decaying ringing (below 1e-3 m/s); the slipping case
        // below reaches about 0.03 m/s.
        expect(slip).toBeLessThan(1e-3);
    });

    it("slips above tanθ = 7μ/2", () => {
        const theta = Math.atan(0.9);
        const { acceleration, slip } = slide(theta);
        const expected = STANDARD_GRAVITY * (Math.sin(theta) - mu * Math.cos(theta));
        expect(Math.abs(acceleration - expected) / expected).toBeLessThan(0.02);
        expect(slip).toBeGreaterThan(0.01);
    });
});

describe("a socket force on a free head", () => {
    it("pitches it with the sign and size the torque predicts", () => {
        const F = 10;
        const window = 1e-3;
        const run = integrate(
            isolated({
                start: { position: vec3(0, 0, 1), orientation: IDENTITY, velocity: ZERO, angularVelocity: ZERO },
                drive: [
                    { t: 0, force: vec3(F, 0, 0) },
                    { t: 1, force: vec3(F, 0, 0) },
                ],
            }),
            { cap: window },
        );
        // Socket (0, 0, r) × (F, 0, 0) = (0, r·F, 0): about +y, which turns the +x face down.
        const expected = (TEST_HEAD.socket.z * F * window) / TEST_HEAD.inertia.y;
        expect(Math.abs(run.head.angularVelocity.y - expected) / expected).toBeLessThan(1e-3);
        expect(Math.abs(run.head.velocity.x - (F * window) / TEST_HEAD.mass)).toBeLessThan(1e-12);
    });
});
```

The 5/7 roll through a real impact needs `simulateImpact` and phase 2; it is in Task 7.

- [ ] **Step 4: Run them to verify they fail**

Run: `npx vitest run tests/engine/impact/integrate.test.ts tests/engine/impact/analytic.test.ts`
Expected: FAIL, `integrate.ts` not found.

- [ ] **Step 5: Implement `src/engine/impact/integrate.ts`**

```ts
/**
 * The impact integrator (P2b.1 design §5): semi-implicit (symplectic) Euler at a fixed step over the mallet head, the
 * balls and the turf. Each step:
 * 1. computes every force from the current state: the drive (at the socket) and gravity, then each closed pair in
 *    pair-list order;
 * 2. updates every velocity from those forces, the head's spin through Euler's equations in its body frame;
 * 3. updates every position, and the head's orientation, from the new velocities.
 *
 * Bodies and pairs are visited in a fixed order and forces summed in it, so repeated runs are bit-identical, and
 * set-ups mirrored across a vertical plane give exactly mirrored results.
 *
 * The impact ends once a face–ball contact has closed, the drive window has closed, and no face–ball or ball–ball
 * contact has been closed for RELEASE_STEPS steps (turf contact does not count); or at the cap. Isolated set-ups (tests)
 * may give balls any state and leave the turf out; simulateImpact.ts prepares and validates real ones.
 */
import { ZERO, add, cross, dot, scale, sub, vec3, type Vec3 } from "../math/vec3";
import type { BallId, BallParams, BallState, BallStates } from "../types";
import { normalForce, tangentialForce, type PairLaw } from "./contactLaw";
import { OFF_FACE, headClosing, headLowestPoint, pairContact, pairList, pointVelocity, type Pair } from "./contacts";
import { angularAcceleration, integrateOrientation, rotate, rotateInverse } from "./rigidBody";
import type { DriveSample, HeadState, ImpactEvent, ImpactRun, MalletHead } from "./types";

/**
 * Integration step (s): about 1/100 of the shortest sourced contact duration, 0.5 ms (the lower bound of the ball–ball
 * contact time, contact.json), confirmed by the convergence test. A constant of the engine version, never adapted to
 * the input, so the step count and results are identical across runs. PROVISIONAL (pre-flight).
 */
export const IMPACT_DT = 5e-6;

/**
 * Consecutive steps without a closed face–ball or ball–ball contact after which the impact may end. A numerical
 * allowance for a contact to re-close (a croquet stroke's balls part and meet again), not physical. PROVISIONAL
 * (pre-flight).
 */
export const RELEASE_STEPS = 50;

/** Longest impact (s); reaching it ends the impact with an `impact-cap` event rather than hanging. PROVISIONAL (pre-flight). */
export const IMPACT_CAP = 0.05;

/** A ball entering the integrator: its state and its turf law (null: no turf under it, for isolated test cases). */
export interface ImpactBall {
    readonly id: BallId;
    readonly state: BallState;
    readonly turf: PairLaw | null;
}

/** Everything the integrator needs, every law already solved. */
export interface ImpactSetup {
    readonly head: MalletHead;
    readonly start: HeadState;
    readonly drive: readonly DriveSample[];
    readonly face: PairLaw;
    readonly ballBall: PairLaw;
    readonly ball: BallParams;
    readonly gravity: number;
    /** In BALL_IDS order. */
    readonly balls: readonly ImpactBall[];
}

/** One closed pair in one step, as the probe sees it: forces applied during the step, on body B. */
export interface ContactSample {
    readonly key: string;
    readonly normal: Vec3;
    readonly depth: number;
    readonly normalForce: number;
    readonly tangentialForce: Vec3;
    readonly spring: Vec3;
    readonly law: PairLaw;
}

/** The state after one step (t is its end), with the drive and contact forces applied during it. */
export interface ImpactSnapshot {
    readonly t: number;
    readonly drive: Vec3;
    readonly head: HeadState;
    /** In setup order. */
    readonly balls: readonly BallState[];
    readonly contacts: readonly ContactSample[];
}

/** Measurement seam: called after every step (tests and scripts/impactProbe.ts). */
export interface ImpactProbe {
    step(snapshot: ImpactSnapshot): void;
}

/** Options of an impact. `dt` and `cap` exist for tests (convergence, isolated cases). */
export interface ImpactOptions {
    readonly dt?: number;
    readonly cap?: number;
    readonly probe?: ImpactProbe;
}

/** The drive at time t: linear between samples, the last sample's force at its own time, and zero after it. */
export function driveAt(drive: readonly DriveSample[], t: number): Vec3 {
    const last = drive[drive.length - 1] as DriveSample;
    if (t > last.t) {
        return ZERO;
    }
    let i = 0;
    while (i + 1 < drive.length && (drive[i + 1] as DriveSample).t <= t) {
        i++;
    }
    const s = drive[i] as DriveSample;
    if (i + 1 === drive.length) {
        return s.force;
    }
    const next = drive[i + 1] as DriveSample;
    return add(s.force, scale(sub(next.force, s.force), (t - s.t) / (next.t - s.t)));
}

interface PairState {
    readonly pair: Pair;
    readonly law: PairLaw;
    /** Elastic tangential displacement ξ; cleared whenever the pair is open. */
    spring: Vec3;
    peak: number;
}

function lawOf(setup: ImpactSetup, pair: Pair): PairLaw {
    switch (pair.kind) {
        case "face-ball":
            return setup.face;
        case "ball-ball":
            return setup.ballBall;
        case "ball-turf":
            return (setup.balls[pair.b] as ImpactBall).turf as PairLaw;
    }
}

/** Integrates the impact from `setup` until it ends (see the file header). */
export function integrate(setup: ImpactSetup, options: ImpactOptions = {}): ImpactRun {
    const dt = options.dt ?? IMPACT_DT;
    const cap = options.cap ?? IMPACT_CAP;
    const { head, ball } = setup;
    const R = ball.radius;
    const ballInertia = 0.4 * ball.mass * R * R;
    const driveEnd = (setup.drive[setup.drive.length - 1] as DriveSample).t;
    const headWeight = vec3(0, 0, 0 - head.mass * setup.gravity);
    const ballWeight = vec3(0, 0, 0 - ball.mass * setup.gravity);
    const ids = setup.balls.map((b) => b.id);
    const hasTurf = setup.balls.map((b) => b.turf !== null);
    const pairs: PairState[] = pairList(ids, hasTurf).map((pair) => ({
        pair,
        law: lawOf(setup, pair),
        spring: ZERO,
        peak: 0,
    }));
    const balls: BallState[] = setup.balls.map((b) => b.state);
    const events: ImpactEvent[] = [];
    const inTurf = balls.map((s, i) => hasTurf[i] === true && s.position.z < R);
    const lifted = balls.map(() => false);
    const offFace = balls.map(() => false);
    let state: HeadState = setup.start;
    let grounded = false;
    let struck = false;
    let quiet = 0;
    let steps = 0;

    for (;;) {
        const t = steps * dt;
        const drive = driveAt(setup.drive, t);
        let headForce = add(drive, headWeight);
        let headTorque = cross(rotate(state.orientation, head.socket), drive);
        const forces: Vec3[] = balls.map(() => ballWeight);
        const torques: Vec3[] = balls.map(() => ZERO);
        const samples: ContactSample[] = [];
        let hardClosed = false;

        for (const p of pairs) {
            const { pair } = p;
            const contact = pairContact(pair, state, head, balls, R);
            if (contact === OFF_FACE || contact === null) {
                p.spring = ZERO;
                if (contact === OFF_FACE && !offFace[pair.b]) {
                    offFace[pair.b] = true;
                    events.push({ kind: "impact-off-face", t, ball: ids[pair.b] as BallId });
                }
                continue;
            }
            if (pair.kind !== "ball-turf") {
                hardClosed = true;
            }
            if (pair.kind === "face-ball") {
                struck = true;
            }
            p.peak = Math.max(p.peak, contact.depth);
            const sb = balls[pair.b] as BallState;
            const sa = pair.kind === "ball-ball" ? (balls[pair.a] as BallState) : null;
            // u: velocity of B's material point at the contact relative to A's (the turf's is zero).
            const va =
                pair.kind === "face-ball"
                    ? pointVelocity(state.position, state.velocity, state.angularVelocity, contact.point)
                    : sa
                      ? pointVelocity(sa.position, sa.velocity, sa.angularVelocity, contact.point)
                      : ZERO;
            const u = sub(pointVelocity(sb.position, sb.velocity, sb.angularVelocity, contact.point), va);
            const along = dot(u, contact.normal);
            const normal = normalForce(p.law, contact.depth, 0 - along);
            const slip = sub(u, scale(contact.normal, along));
            // ξ carried over, projected onto the current tangent plane, then advanced by this step's slip.
            const carried = sub(p.spring, scale(contact.normal, dot(p.spring, contact.normal)));
            const tangential = tangentialForce(p.law, add(carried, scale(slip, dt)), slip, normal);
            p.spring = tangential.spring;
            const force = add(scale(contact.normal, normal), tangential.force);
            forces[pair.b] = add(forces[pair.b] as Vec3, force);
            torques[pair.b] = add(torques[pair.b] as Vec3, cross(sub(contact.point, sb.position), force));
            if (pair.kind === "face-ball") {
                headForce = sub(headForce, force);
                headTorque = sub(headTorque, cross(sub(contact.point, state.position), force));
            } else if (sa) {
                forces[pair.a] = sub(forces[pair.a] as Vec3, force);
                torques[pair.a] = sub(torques[pair.a] as Vec3, cross(sub(contact.point, sa.position), force));
            }
            if (options.probe) {
                samples.push({
                    key: pair.key,
                    normal: contact.normal,
                    depth: contact.depth,
                    normalForce: normal,
                    tangentialForce: tangential.force,
                    spring: tangential.spring,
                    law: p.law,
                });
            }
        }

        // Velocities from the forces, then positions from the new velocities.
        const velocity = add(state.velocity, scale(headForce, dt / head.mass));
        const bodyOmega = rotateInverse(state.orientation, state.angularVelocity);
        const bodyTorque = rotateInverse(state.orientation, headTorque);
        const spun = add(bodyOmega, scale(angularAcceleration(head.inertia, bodyOmega, bodyTorque), dt));
        const angularVelocity = rotate(state.orientation, spun);
        state = {
            position: add(state.position, scale(velocity, dt)),
            orientation: integrateOrientation(state.orientation, angularVelocity, dt),
            velocity,
            angularVelocity,
        };
        for (let i = 0; i < balls.length; i++) {
            const s = balls[i] as BallState;
            const v = add(s.velocity, scale(forces[i] as Vec3, dt / ball.mass));
            const w = add(s.angularVelocity, scale(torques[i] as Vec3, dt / ballInertia));
            balls[i] = { position: add(s.position, scale(v, dt)), velocity: v, angularVelocity: w };
        }
        steps++;
        const now = steps * dt;

        for (let i = 0; i < balls.length; i++) {
            if (!hasTurf[i]) {
                continue;
            }
            const below = (balls[i] as BallState).position.z < R;
            if (inTurf[i] && !below && !lifted[i]) {
                lifted[i] = true;
                events.push({ kind: "turf-lift", t: now, ball: ids[i] as BallId });
            }
            inTurf[i] = below;
        }
        if (!grounded && headLowestPoint(state, head) < 0) {
            grounded = true;
            events.push({ kind: "impact-mallet-grounded", t: now });
        }
        options.probe?.step({ t: now, drive, head: state, balls: [...balls], contacts: samples });

        quiet = hardClosed ? 0 : quiet + 1;
        if (struck && now >= driveEnd && quiet >= RELEASE_STEPS) {
            break;
        }
        if (now >= cap) {
            events.push({ kind: "impact-cap", t: now });
            break;
        }
    }

    const duration = steps * dt;
    const final: BallStates = {};
    for (let i = 0; i < balls.length; i++) {
        const s = balls[i] as BallState;
        const id = ids[i] as BallId;
        final[id] = s;
        if (headClosing(state, head, s, R)) {
            events.push({ kind: "impact-head-approaching", t: duration, ball: id });
        }
    }
    const peakPenetration: Record<string, number> = {};
    for (const p of pairs) {
        if (p.peak > 0) {
            peakPenetration[p.pair.key] = p.peak;
        }
    }
    return { balls: final, head: state, duration, events, peakPenetration, steps };
}
```

Wrap the `IMPACT_CAP` comment to 120 columns.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/impact/integrate.test.ts tests/engine/impact/analytic.test.ts`
Expected: PASS.

If an analytic case misses its tolerance:

- Check the measured error at `dt = 1e-8`.
- If the error shrinks, the step is the cause. Keep the 1e-7 run and record the error for pre-flight.
- If it does not shrink, the model or its wiring is wrong. Debug with `superpowers:systematic-debugging`; never
  loosen a tolerance to pass.

- [ ] **Step 7: Format, lint, check, commit**

```bash
git add src/engine/impact/integrate.ts tests/engine/support/impact.ts tests/engine/impact/integrate.test.ts tests/engine/impact/analytic.test.ts
git commit -F "$CLAUDE_TEMP_DIR/msg.txt"   # "Add the fixed-step impact integrator"
```

---

### Task 7: Entry point, validation and handover

**Files:**
- Create: `src/engine/impact/handover.ts`, `src/engine/impact/simulateImpact.ts`
- Modify: `src/engine/simulate.ts:75` (`ENGINE_VERSION = "0.4.0"`)
- Test: `tests/engine/impact/handover.test.ts`, `tests/engine/impact/simulateImpact.test.ts`

**Interfaces:**
- Consumes: Tasks 2–6; `SETTLE_SPEED` (`resolve.ts`); `CONTACT_TOLERANCE` (`detect.ts`); `obstaclesOf` and
  `validateWorld` (`world.ts`).
- Produces:
  - `interface Handover { balls: BallStates; overlapCorrection: number }`;
  - `handover(balls: BallStates, radius: number): Handover`;
  - `validateImpact(contact, balls, world): void`;
  - `prepareImpact(contact, balls, world): ImpactSetup`;
  - `simulateImpact(contact, balls, world, options?): ImpactResult`.

- [ ] **Step 1: Write the failing handover tests**

Create `tests/engine/impact/handover.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { length, sub, vec3 } from "../../../src/engine/math/vec3";
import { SETTLE_SPEED } from "../../../src/engine/resolve";
import { simulateFreeMotion } from "../../../src/engine/simulate";
import { handover } from "../../../src/engine/impact/handover";
import { TEST_BALL, airborneAt, testWorld } from "../support/fixtures";

const R = TEST_BALL.radius;

describe("handover", () => {
    it("hands a ball clear of the turf over as it is", () => {
        const s = airborneAt(5, 5, R + 1e-3, vec3(1, 0, 0.5));
        expect(handover({ blue: s }, R).balls.blue).toBe(s);
    });

    it("places a ball in turf contact on the lawn and drops a slow vertical velocity", () => {
        const h = handover({ blue: airborneAt(5, 5, R - 2e-5, vec3(1, 0, SETTLE_SPEED / 2)) }, R).balls.blue;
        expect(h?.position).toEqual(vec3(5, 5, R));
        expect(h?.velocity).toEqual(vec3(1, 0, 0));
    });

    it("keeps an upward velocity of at least the settle speed, so the ball starts airborne", () => {
        const h = handover({ blue: airborneAt(5, 5, R - 2e-5, vec3(1, 0, 0.4)) }, R).balls.blue;
        expect(h?.position.z).toBe(R);
        expect(h?.velocity.z).toBe(0.4);
    });

    it("separates an overlapping pair on the turf to zero gap and reports the correction", () => {
        const out = handover({ blue: airborneAt(5, 5, R), red: airborneAt(5 + 2 * R - 1e-6, 5, R) }, R);
        const gap = length(sub(out.balls.red?.position ?? vec3(0, 0, 0), out.balls.blue?.position ?? vec3(0, 0, 0))) - 2 * R;
        expect(Math.abs(gap)).toBeLessThan(1e-15);
        expect(out.overlapCorrection).toBeCloseTo(1e-6, 15);
        expect(() => simulateFreeMotion(out.balls, testWorld())).not.toThrow();
    });

    it("never moves a ball below the turf when the normal is inclined", () => {
        const out = handover(
            { blue: airborneAt(5, 5, R), red: airborneAt(5 + 1.8 * R, 5, R + Math.sqrt(4 * R * R - 3.24 * R * R) - 1e-6) },
            R,
        );
        expect(out.balls.blue?.position.z).toBeGreaterThanOrEqual(R);
        expect(out.overlapCorrection).toBeGreaterThan(0);
        expect(() => simulateFreeMotion(out.balls, testWorld())).not.toThrow();
    });

    it("reports no correction when nothing overlaps", () => {
        expect(handover({ blue: airborneAt(5, 5, R), red: airborneAt(6, 5, R) }, R).overlapCorrection).toBe(0);
    });
});
```

- [ ] **Step 2: Write the failing entry-point tests**

Create `tests/engine/impact/simulateImpact.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { length, vec3 } from "../../../src/engine/math/vec3";
import { stateAtTime } from "../../../src/engine/sample";
import { ENGINE_VERSION, simulateFreeMotion } from "../../../src/engine/simulate";
import type { BallStates, World } from "../../../src/engine/types";
import { uniformLawn } from "../../../src/engine/world";
import { simulateImpact } from "../../../src/engine/impact/simulateImpact";
import type { ContactState } from "../../../src/engine/impact/types";
import { TEST_BALL, TEST_TURF, ballAt, testWorld } from "../support/fixtures";
import { drive, strike } from "../support/impact";

const R = TEST_BALL.radius;
const WORLD = testWorld();
const BLUE = ballAt(5, 0);

describe("simulateImpact", () => {
    it("is version 0.4.0", () => {
        expect(ENGINE_VERSION).toBe("0.4.0");
    });

    it("starts a centre-struck ball rolling at 5/7 of its launch speed in phase 2", () => {
        const result = simulateImpact(strike(BLUE.position), { blue: BLUE }, WORLD);
        const h = result.handover.blue;
        expect(h?.position.z).toBe(R);
        expect(h?.velocity.z).toBe(0);
        const launch = length(h?.velocity ?? vec3(0, 0, 0));
        const free = simulateFreeMotion(result.handover, WORLD);
        const rolling = free.events.find((e) => e.kind === "phase" && e.ball === "blue" && e.phase === "rolling");
        expect(rolling).toBeDefined();
        const v = length(stateAtTime(free, "blue", (rolling as { t: number }).t).velocity);
        // Turf friction during the ~1 ms impact moves a few mm/s between speed and spin; it shifts this by < 1 %.
        expect(Math.abs(v / launch - 5 / 7) / (5 / 7)).toBeLessThan(0.01);
    });

    it("hands a ball driven into the turf over airborne, and phase 2 lands it", () => {
        const result = simulateImpact(strike(BLUE.position, { speed: 3, descent: 0.5, pitch: 0.5 }), { blue: BLUE }, WORLD);
        expect(result.events.some((e) => e.kind === "turf-lift")).toBe(true);
        expect(result.handover.blue?.velocity.z).toBeGreaterThan(0);
        const free = simulateFreeMotion(result.handover, WORLD);
        expect(free.events.some((e) => e.kind === "landing" && e.ball === "blue")).toBe(true);
    });

    it("leaves a ball nobody strikes at rest", () => {
        const balls: BallStates = { blue: BLUE, yellow: ballAt(8, 3) };
        const result = simulateImpact(strike(BLUE.position), balls, WORLD);
        expect(length(result.balls.yellow?.velocity ?? vec3(1, 0, 0))).toBeLessThan(1e-9);
        expect(result.handover.yellow?.position).toEqual(vec3(8, 3, R));
        expect(result.handover.yellow?.velocity).toEqual(vec3(0, 0, 0));
    });

    it("sends both balls of a croquet stroke forward, the croqueted one faster", () => {
        const result = simulateImpact(strike(BLUE.position, { speed: 3 }), { blue: BLUE, red: ballAt(5 + 2 * R, 0) }, WORLD);
        const blue = result.handover.blue?.velocity.x as number;
        const red = result.handover.red?.velocity.x as number;
        expect(red).toBeGreaterThan(blue);
        expect(blue).toBeGreaterThan(0);
        expect(() => simulateFreeMotion(result.handover, WORLD)).not.toThrow();
    });

    it("flags a ball within reach that the head is still closing on", () => {
        // Blue is struck 30 mm off the face axis. Red sits on the axis's other side, 65 mm from it (within the reach
        // r + R = 78 mm), its centre 1.5·R in front of the face plane (within 2R), and 95 mm from blue's line, so blue
        // passes it. The head, slower than blue after the strike, is still coming on to red when the impact ends.
        const contact = strike(BLUE.position, { speed: 2, lateral: -0.03 });
        const red = ballAt(5 + 0.5 * R - 1e-3, 0.095);
        const result = simulateImpact(contact, { blue: BLUE, red }, WORLD);
        expect(result.events.filter((e) => e.kind === "impact-head-approaching")).toEqual([
            { kind: "impact-head-approaching", t: result.duration, ball: "red" },
        ]);
    });
});

describe("validation", () => {
    const ok = strike(BLUE.position);
    const cases: [string, ContactState, BallStates, World][] = [
        ["a moving ball", ok, { blue: { ...BLUE, velocity: vec3(0.1, 0, 0) } }, WORLD],
        ["a spinning ball", ok, { blue: { ...BLUE, angularVelocity: vec3(0, 1, 0) } }, WORLD],
        ["a ball off the lawn plane", ok, { blue: { ...BLUE, position: vec3(5, 0, R + 1e-3) } }, WORLD],
        ["overlapping balls", ok, { blue: BLUE, red: ballAt(5 + 2 * R - 1e-6, 0) }, WORLD],
        ["a ball touching the peg", strike(vec3(15 - 0.02 - R, 20, R)), { blue: ballAt(15 - 0.02 - R, 20) }, WORLD],
        ["the head in a ball", strike(BLUE.position, { gap: -1e-4 }), { blue: BLUE }, WORLD],
        ["the head in the turf", { ...ok, position: vec3(ok.position.x, ok.position.y, 0.01) }, { blue: BLUE }, WORLD],
        ["an empty drive", { ...ok, drive: [] }, { blue: BLUE }, WORLD],
        ["a drive not starting at 0", { ...ok, drive: [{ t: 1e-4, force: vec3(0, 0, 0) }] }, { blue: BLUE }, WORLD],
        ["a drive not increasing", { ...ok, drive: [...drive(vec3(0, 0, 0), 1e-3), { t: 1e-3, force: vec3(0, 0, 0) }] }, { blue: BLUE }, WORLD],
        ["a non-positive head mass", { ...ok, head: { ...ok.head, mass: 0 } }, { blue: BLUE }, WORLD],
        ["a non-positive inertia", { ...ok, head: { ...ok.head, inertia: vec3(1, 0, 1) } }, { blue: BLUE }, WORLD],
        ["a non-positive head length", { ...ok, head: { ...ok.head, length: -1 } }, { blue: BLUE }, WORLD],
        ["a non-positive head radius", { ...ok, head: { ...ok.head, radius: 0 } }, { blue: BLUE }, WORLD],
        ["a non-positive contact time", { ...ok, face: { ...ok.face, contactTime: 0 } }, { blue: BLUE }, WORLD],
        ["zero face restitution", { ...ok, face: { ...ok.face, restitution: 0 } }, { blue: BLUE }, WORLD],
        ["face restitution above 1", { ...ok, face: { ...ok.face, restitution: 1.1 } }, { blue: BLUE }, WORLD],
        ["negative face friction", { ...ok, face: { ...ok.face, friction: -0.1 } }, { blue: BLUE }, WORLD],
        ["zero ball–ball restitution", ok, { blue: BLUE }, testWorld({ ballBall: { restitution: 0, friction: 0.05 } })],
        [
            "zero turf restitution",
            ok,
            { blue: BLUE },
            testWorld({ lawn: uniformLawn(30, 40, { slidingFriction: 0.3, rollingResistance: 0.05, ...TEST_TURF, turfRestitution: 0 }) }),
        ],
        ["a non-unit orientation", { ...ok, orientation: { w: 2, x: 0, y: 0, z: 0 } }, { blue: BLUE }, WORLD],
    ];

    it.each(cases)("rejects %s", (_label, contact, balls, world) => {
        expect(() => simulateImpact(contact, balls, world)).toThrow(RangeError);
    });

    it("accepts touching balls", () => {
        expect(() => simulateImpact(ok, { blue: BLUE, red: ballAt(5 + 2 * R, 0) }, WORLD)).not.toThrow();
    });
});
```

The peg case puts the ball 0 m from the peg's surface. The test world's peg is at (15, 20) with radius 0.02.
"The head in the turf" lowers the head's centre to 1 cm, which puts its rim below the plane.

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/engine/impact/handover.test.ts tests/engine/impact/simulateImpact.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 4: Implement `src/engine/impact/handover.ts`**

```ts
/**
 * Hands the balls at the end of the impact to phase 2 (P2b.1 design §6).
 *
 * A ball clear of the turf (z ≥ R) goes as it is. A ball still in turf contact (z < R) is placed on the lawn,
 * z = R. It keeps an upward vertical velocity of at least SETTLE_SPEED, so it starts airborne; otherwise it loses its
 * vertical velocity, phase 2's own rule for a ball on the plane. The stored energy of its residual sink, m·g·δ₀/2, is
 * discarded.
 *
 * Contacts release while δ > 0, so a pair can end the impact still overlapping. Each such pair, in BALL_IDS order, is
 * pushed apart along its normal to zero gap, each ball half the overlap, velocities unchanged. A ball is never moved
 * below the turf: a downward half-move leaves it at z = R. That leaves an overlap of order (overlap·n_z)²/R, far inside
 * phase 2's CONTACT_TOLERANCE for the micrometre overlaps an impact leaves.
 */
import { add, horizontal, length, scale, sub, vec3, type Vec3 } from "../math/vec3";
import { SETTLE_SPEED } from "../resolve";
import { BALL_IDS, type BallState, type BallStates } from "../types";

/** The balls as phase 2 receives them, and the largest overlap (m) removed from a pair. */
export interface Handover {
    readonly balls: BallStates;
    readonly overlapCorrection: number;
}

function placed(s: BallState, radius: number): BallState {
    if (s.position.z >= radius) {
        return s;
    }
    return {
        position: vec3(s.position.x, s.position.y, radius),
        velocity: s.velocity.z >= SETTLE_SPEED ? s.velocity : horizontal(s.velocity),
        angularVelocity: s.angularVelocity,
    };
}

function aboveTurf(p: Vec3, radius: number): Vec3 {
    return p.z >= radius ? p : vec3(p.x, p.y, radius);
}

/** Places the balls for phase 2 and separates overlapping pairs (see the file header). */
export function handover(balls: BallStates, radius: number): Handover {
    const ids = BALL_IDS.filter((id) => balls[id]);
    const states = ids.map((id) => placed(balls[id] as BallState, radius));
    let overlapCorrection = 0;
    for (let i = 0; i < states.length; i++) {
        for (let j = i + 1; j < states.length; j++) {
            const a = states[i] as BallState;
            const b = states[j] as BallState;
            const offset = sub(b.position, a.position);
            const distance = length(offset);
            const overlap = 2 * radius - distance;
            if (overlap > 0) {
                const move = scale(offset, overlap / (2 * distance));
                states[i] = { ...a, position: aboveTurf(sub(a.position, move), radius) };
                states[j] = { ...b, position: aboveTurf(add(b.position, move), radius) };
                overlapCorrection = Math.max(overlapCorrection, overlap);
            }
        }
    }
    const result: BallStates = {};
    ids.forEach((id, i) => {
        result[id] = states[i] as BallState;
    });
    return { balls: result, overlapCorrection };
}
```

- [ ] **Step 5: Implement `src/engine/impact/simulateImpact.ts`**

```ts
/**
 * Phase 1 of a shot (P2b.1 design §3). Checks the ContactState and the balls. Solves every contact law once: face–ball
 * and ball–ball once, ball–turf once per ball from the surface where it lies. Starts each ball at its static turf sink
 * m·g/k_turf, so that the impact does not open with a spurious bounce. Integrates the impact and hands the balls over
 * to phase 2.
 */
import { CONTACT_TOLERANCE } from "../detect";
import { horizontal, length, sub, vec3, type Vec3 } from "../math/vec3";
import { BALL_IDS, type BallState, type BallStates, type World } from "../types";
import { obstaclesOf, validateWorld } from "../world";
import { lawFromContactTime, lawFromStiffness } from "./contactLaw";
import { OFF_FACE, faceContact, headLowestPoint } from "./contacts";
import { handover } from "./handover";
import { integrate, type ImpactBall, type ImpactOptions, type ImpactSetup } from "./integrate";
import type { ContactState, DriveSample, ImpactResult } from "./types";

/** Tolerance on |q|² − 1 for a ContactState's orientation. Numerical, not physical: a few ulps of a normalised q. */
const UNIT_TOLERANCE = 1e-12;

function fail(message: string): never {
    throw new RangeError(message);
}

function positive(value: number, name: string): void {
    if (!(value > 0) || !Number.isFinite(value)) {
        fail(`${name} must be a positive finite number (got ${value})`);
    }
}

function restitution(value: number, name: string): void {
    if (!(value > 0 && value <= 1)) {
        fail(`${name} must lie in (0, 1] (got ${value})`);
    }
}

function friction(value: number, name: string): void {
    if (!(value >= 0) || !Number.isFinite(value)) {
        fail(`${name} must be non-negative (got ${value})`);
    }
}

function finite(v: Vec3, name: string): void {
    if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) {
        fail(`${name} must be finite`);
    }
}

/**
 * Throws a RangeError if the impact's input is invalid (design §3):
 * - a ball not at rest on the turf;
 * - two balls overlapping, or a ball touching an obstacle within CONTACT_TOLERANCE (ball–obstacle contact is not
 *   modelled in the impact);
 * - the head in a ball or in the turf at t = 0;
 * - a drive that is empty, does not start at 0 or does not increase strictly;
 * - a non-positive mass, inertia, length, radius or contact time;
 * - a restitution outside (0, 1] or a negative friction;
 * - a non-unit orientation.
 */
export function validateImpact(contact: ContactState, balls: BallStates, world: World): void {
    const { head, face } = contact;
    const R = world.ball.radius;
    positive(head.mass, "head.mass");
    positive(head.inertia.x, "head.inertia.x");
    positive(head.inertia.y, "head.inertia.y");
    positive(head.inertia.z, "head.inertia.z");
    positive(head.length, "head.length");
    positive(head.radius, "head.radius");
    finite(head.socket, "head.socket");
    positive(face.contactTime, "face.contactTime");
    restitution(face.restitution, "face.restitution");
    friction(face.friction, "face.friction");
    positive(world.ballBallContactTime, "ballBallContactTime");
    restitution(world.ballBall.restitution, "ballBall.restitution");
    finite(contact.position, "position");
    finite(contact.velocity, "velocity");
    finite(contact.angularVelocity, "angularVelocity");
    const q = contact.orientation;
    if (!(Math.abs(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z - 1) <= UNIT_TOLERANCE)) {
        fail("orientation must be a unit quaternion");
    }
    if (contact.drive.length === 0 || (contact.drive[0] as DriveSample).t !== 0) {
        fail("drive must start at t = 0");
    }
    contact.drive.forEach((s, i) => {
        finite(s.force, `drive[${i}].force`);
        if (!Number.isFinite(s.t) || (i > 0 && !(s.t > (contact.drive[i - 1] as DriveSample).t))) {
            fail("drive times must increase strictly");
        }
    });
    if (headLowestPoint(contact, head) < 0) {
        fail("head penetrates the turf");
    }
    const present = BALL_IDS.filter((id) => balls[id]);
    const obstacles = obstaclesOf(world);
    present.forEach((id, i) => {
        const { position: p, velocity: v, angularVelocity: w } = balls[id] as BallState;
        const still = v.x === 0 && v.y === 0 && v.z === 0 && w.x === 0 && w.y === 0 && w.z === 0;
        if (!still || p.z !== R || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
            fail(`ball ${id} is not at rest on the turf`);
        }
        const surface = world.lawn.surfaceAt(p);
        positive(surface.turfStiffness, `turfStiffness at ball ${id}`);
        restitution(surface.turfRestitution, `turfRestitution at ball ${id}`);
        friction(surface.slidingFriction, `slidingFriction at ball ${id}`);
        for (const o of obstacles) {
            if (length(horizontal(sub(p, o.centre))) - R - o.radius <= CONTACT_TOLERANCE) {
                fail(`ball ${id} touches ${o.id}`);
            }
        }
        for (const other of present.slice(i + 1)) {
            if (length(sub(p, (balls[other] as BallState).position)) - 2 * R < 0 - CONTACT_TOLERANCE) {
                fail(`balls ${id} and ${other} overlap`);
            }
        }
        const touch = faceContact(contact, head, p, R);
        if (touch !== null && touch !== OFF_FACE) {
            fail(`head penetrates ball ${id}`);
        }
    });
}

/**
 * Solves every law and places each ball at its static turf sink: z = R − m·g/k_turf, where its turf spring carries
 * exactly its weight. Touching balls stay touching, as equal balls on equal turf sink equally. Input must have passed
 * validateImpact.
 */
export function prepareImpact(contact: ContactState, balls: BallStates, world: World): ImpactSetup {
    const { ball, gravity } = world;
    const entries: ImpactBall[] = [];
    for (const id of BALL_IDS) {
        const s = balls[id];
        if (!s) {
            continue;
        }
        const surface = world.lawn.surfaceAt(s.position);
        const sink = (ball.mass * gravity) / surface.turfStiffness;
        entries.push({
            id,
            state: { ...s, position: vec3(s.position.x, s.position.y, s.position.z - sink) },
            turf: lawFromStiffness(ball.mass, surface.turfRestitution, surface.turfStiffness, surface.slidingFriction),
        });
    }
    const faceMass = (contact.head.mass * ball.mass) / (contact.head.mass + ball.mass);
    return {
        head: contact.head,
        start: {
            position: contact.position,
            orientation: contact.orientation,
            velocity: contact.velocity,
            angularVelocity: contact.angularVelocity,
        },
        drive: contact.drive,
        face: lawFromContactTime(faceMass, contact.face.restitution, contact.face.contactTime, contact.face.friction),
        ballBall: lawFromContactTime(
            ball.mass / 2,
            world.ballBall.restitution,
            world.ballBallContactTime,
            world.ballBall.friction,
        ),
        ball,
        gravity,
        balls: entries,
    };
}

/**
 * Simulates the impact of `contact` on the balls at rest (design §3): validates, prepares, integrates and hands over.
 * Throws a RangeError on invalid input (validateImpact). Wiring into a whole shot is P2b.2's `simulateShot`.
 */
export function simulateImpact(
    contact: ContactState,
    balls: BallStates,
    world: World,
    options: ImpactOptions = {},
): ImpactResult {
    validateWorld(world);
    validateImpact(contact, balls, world);
    const run = integrate(prepareImpact(contact, balls, world), options);
    const handed = handover(run.balls, world.ball.radius);
    return { ...run, handover: handed.balls, overlapCorrection: handed.overlapCorrection };
}
```

- [ ] **Step 6: Bump the engine version**

`src/engine/simulate.ts:75`: `export const ENGINE_VERSION = "0.4.0";`

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/impact/`
Expected: PASS.

The 5/7 case depends on the head striking within 1 % of the ball's centre height. The 22 µm sink offsets it by 0.05 %.
If it fails, print `result.handover.blue` and check the spin first.

- [ ] **Step 8: Verify phase 2 is still bit-identical**

Run: `SLOW_TESTS=1 npm test`, then `npx --yes tsx scripts/shotMix.ts`.
Expected: all pass, and work units p99 143,084, p99.9 362,050, max 408,030, unchanged.

- [ ] **Step 9: Format, lint, check, commit**

```bash
git add src/engine/impact/handover.ts src/engine/impact/simulateImpact.ts src/engine/simulate.ts tests/engine/impact/handover.test.ts tests/engine/impact/simulateImpact.test.ts
git commit -F "$CLAUDE_TEMP_DIR/msg.txt"   # "Add simulateImpact with validation and handover to phase 2"
```

---

### Task 8: Invariants, convergence and fuzz

Whole-system tests on the shared scenarios (spec §9.2, §9.3, §9.6). Pre-flight runs this task first with the
provisional constants, measures, and fixes the constants of the Pre-flight table. In the real run, the constants are
already the measured ones.

**Files:**
- Test: `tests/engine/impact/invariants.test.ts`, `tests/engine/impact/convergence.test.ts`,
  `tests/engine/impact/fuzz.test.ts`

**Interfaces:**
- Consumes: `simulateImpact`, `IMPACT_DT`, `ImpactSnapshot`, and from `tests/engine/support/impact.ts` `SCENARIOS`,
  `recorder`, `impactEnergy`, `socketAt`, `initialHeadEnergy`, `strike`, `drive` and the `mirror*` helpers.

- [ ] **Step 1: Write the invariant tests**

Create `tests/engine/impact/invariants.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ZERO, add, dot, length, scale, sub, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import { BALL_IDS, type BallState, type BallStates } from "../../../src/engine/types";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import type { ImpactSnapshot } from "../../../src/engine/impact/integrate";
import { simulateImpact } from "../../../src/engine/impact/simulateImpact";
import { TEST_BALL, testWorld } from "../support/fixtures";
import {
    SCENARIOS,
    impactEnergy,
    initialHeadEnergy,
    mirrorBall,
    mirrorContact,
    mirrorQuat,
    mirrorSpin,
    mirrorVec,
    recorder,
    socketAt,
} from "../support/impact";

/** PROVISIONAL (pre-flight): largest rise of energy, net of the drive's work, relative to the energy put in. */
const ENERGY_TOLERANCE = 1e-3;
const WORLD = testWorld();

describe.each(SCENARIOS)("$name", ({ contact, balls }) => {
    const probe = recorder();
    const result = simulateImpact(contact, balls, WORLD, { probe });
    const g = STANDARD_GRAVITY;

    // Both checks start from the first snapshot rather than t = 0, so that the balls' sink and their turf springs are
    // counted the same way at both ends.
    const [first, ...rest] = probe.snapshots as [ImpactSnapshot, ...ImpactSnapshot[]];

    it("never gains energy beyond the drive's work", () => {
        const base = impactEnergy(first, contact.head, TEST_BALL, g);
        let previous = first;
        let work = 0;
        // Energy put in: the head's initial kinetic energy plus every increment of drive work, whatever its sign.
        let budget = initialHeadEnergy(contact);
        for (const s of rest) {
            const dw = dot(s.drive, sub(socketAt(s.head, contact.head), socketAt(previous.head, contact.head)));
            work += dw;
            budget += Math.abs(dw);
            previous = s;
            const rise = impactEnergy(s, contact.head, TEST_BALL, g) - base - work;
            expect(rise, `t = ${s.t}`).toBeLessThanOrEqual(ENERGY_TOLERANCE * budget);
        }
    });

    it("conserves momentum apart from the turf's, the drive's and gravity's impulses", () => {
        const m = TEST_BALL.mass;
        const momentum = (s: ImpactSnapshot): Vec3 =>
            s.balls.reduce((p, b) => add(p, scale(b.velocity, m)), scale(s.head.velocity, contact.head.mass));
        const weight = vec3(0, 0, -(contact.head.mass + m * first.balls.length) * g);
        let impulse = ZERO;
        let previous = first;
        // A snapshot carries the forces applied during the step that ends at it.
        for (const s of rest) {
            let external = add(s.drive, weight);
            for (const c of s.contacts.filter((x) => x.key.startsWith("turf/"))) {
                external = add(external, add(scale(c.normal, c.normalForce), c.tangentialForce));
            }
            impulse = add(impulse, scale(external, s.t - previous.t));
            previous = s;
        }
        const change = sub(momentum(previous), momentum(first));
        expect(length(sub(change, impulse))).toBeLessThan(1e-9 * contact.head.mass * length(contact.velocity));
    });

    it("never pulls, and keeps friction inside its cone", () => {
        for (const s of probe.snapshots) {
            for (const c of s.contacts) {
                expect(c.normalForce).toBeGreaterThanOrEqual(0);
                expect(length(c.tangentialForce)).toBeLessThanOrEqual(c.law.friction * c.normalForce * (1 + 1e-12) + 1e-15);
            }
        }
    });

    it("is bit-identical when repeated", () => {
        expect(simulateImpact(contact, balls, WORLD)).toStrictEqual(result);
    });

    it("is exactly mirrored by a set-up mirrored across the strike line", () => {
        const reflected: BallStates = {};
        for (const id of BALL_IDS.filter((x) => balls[x])) {
            reflected[id] = mirrorBall(balls[id] as BallState);
        }
        const mirrored = simulateImpact(mirrorContact(contact), reflected, WORLD);
        const same = (a: Vec3, b: Vec3): boolean => a.x === b.x && a.y === b.y && a.z === b.z;
        for (const id of BALL_IDS.filter((x) => balls[x])) {
            const a = result.handover[id] as BallState;
            const b = mirrored.handover[id] as BallState;
            expect(same(mirrorVec(a.position), b.position), `${id} position`).toBe(true);
            expect(same(mirrorVec(a.velocity), b.velocity), `${id} velocity`).toBe(true);
            expect(same(mirrorSpin(a.angularVelocity), b.angularVelocity), `${id} spin`).toBe(true);
        }
        const q = mirrorQuat(result.head.orientation);
        const p = mirrored.head.orientation;
        expect(q.w === p.w && q.x === p.x && q.y === p.y && q.z === p.z).toBe(true);
        expect(mirrored.steps).toBe(result.steps);
        expect(mirrored.events.map((e) => [e.kind, e.t])).toEqual(result.events.map((e) => [e.kind, e.t]));
    });
});
```

Mirrored set-ups put every ball on the line y = 0, so that the reflection y → −y is exact in IEEE arithmetic: sign
flips are exact, and each sum mirrors term by term.

- [ ] **Step 2: Write the convergence test**

Create `tests/engine/impact/convergence.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { length, sub } from "../../../src/engine/math/vec3";
import { BALL_IDS, type BallState } from "../../../src/engine/types";
import { IMPACT_DT } from "../../../src/engine/impact/integrate";
import { simulateImpact } from "../../../src/engine/impact/simulateImpact";
import { TEST_BALL, testWorld } from "../support/fixtures";
import { SCENARIOS } from "../support/impact";

/** PROVISIONAL (pre-flight): largest change of a handover velocity when dt halves, relative to the head's speed. */
const CONVERGENCE_TOLERANCE = 5e-3;
const WORLD = testWorld();

describe.each(SCENARIOS)("$name", ({ contact, balls }) => {
    it("moves no handover velocity by more than CONVERGENCE_TOLERANCE when dt halves", () => {
        const coarse = simulateImpact(contact, balls, WORLD);
        const fine = simulateImpact(contact, balls, WORLD, { dt: IMPACT_DT / 2 });
        const speed = length(contact.velocity);
        for (const id of BALL_IDS.filter((x) => balls[x])) {
            const a = coarse.handover[id] as BallState;
            const b = fine.handover[id] as BallState;
            const dv = length(sub(a.velocity, b.velocity)) / speed;
            const dw = (TEST_BALL.radius * length(sub(a.angularVelocity, b.angularVelocity))) / speed;
            expect(dv, `${id} velocity`).toBeLessThan(CONVERGENCE_TOLERANCE);
            expect(dw, `${id} spin`).toBeLessThan(CONVERGENCE_TOLERANCE);
        }
    });
});
```

- [ ] **Step 3: Write the fuzz test**

Create `tests/engine/impact/fuzz.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { scale } from "../../../src/engine/math/vec3";
import { simulateFreeMotion } from "../../../src/engine/simulate";
import type { BallState, BallStates } from "../../../src/engine/types";
import { simulateImpact, validateImpact } from "../../../src/engine/impact/simulateImpact";
import type { ContactState } from "../../../src/engine/impact/types";
import { TEST_BALL, ballAt, testWorld } from "../support/fixtures";
import { TEST_HEAD, drive, strike } from "../support/impact";
import { rng } from "../support/rng";

const R = TEST_BALL.radius;
/** PROVISIONAL (pre-flight): deepest penetration any pair may reach inside the fuzz ranges. */
const PENETRATION_BOUND = 0.3 * R;
const WORLD = testWorld();

/**
 * One random stroke inside the PROVISIONAL (pre-flight) ranges. A draw that validateImpact rejects (the head below the
 * turf at a steep pitch) is drawn again; the sequence stays deterministic.
 */
function randomStroke(random: () => number): { contact: ContactState; balls: BallStates } {
    const uni = (a: number, b: number): number => a + (b - a) * random();
    const blue = ballAt(10, 10);
    for (;;) {
        const force = random() < 1 / 3 ? 0 : uni(-300, 300);
        const window = uni(0.5e-3, 5e-3);
        const contact = strike(blue.position, {
            speed: uni(0.5, 8),
            yaw: uni(-0.3, 0.3),
            descent: uni(0, 0.5),
            pitch: uni(-0.2, 0.6),
            lateral: uni(-0.8, 0.8) * TEST_HEAD.radius,
            vertical: uni(-0.6, 0.6) * TEST_HEAD.radius,
            drive: (t) => drive(scale(t, force), window),
        });
        const balls: BallStates = { blue };
        if (random() < 0.5) {
            const a = uni(-1, 1);
            balls.red = ballAt(10 + 2 * R * Math.cos(a), 10 + 2 * R * Math.sin(a));
        }
        try {
            validateImpact(contact, balls, WORLD);
        } catch {
            continue;
        }
        return { contact, balls };
    }
}

describe("impact fuzz", () => {
    const count = import.meta.env.SLOW_TESTS ? 2000 : 200;

    it(`ends, never hits the cap and keeps penetrations bounded over ${count} strokes`, { timeout: 600_000 }, () => {
        const random = rng(23);
        for (let n = 0; n < count; n++) {
            const { contact, balls } = randomStroke(random);
            const result = simulateImpact(contact, balls, WORLD);
            expect(result.events.some((e) => e.kind === "impact-cap"), `stroke ${n}`).toBe(false);
            for (const [key, depth] of Object.entries(result.peakPenetration)) {
                expect(depth, `stroke ${n} ${key}`).toBeLessThan(PENETRATION_BOUND);
            }
            for (const s of Object.values(result.handover) as BallState[]) {
                const values = [s.position, s.velocity, s.angularVelocity].flatMap((v) => [v.x, v.y, v.z]);
                expect(values.every(Number.isFinite), `stroke ${n}`).toBe(true);
            }
            expect(() => simulateFreeMotion(result.handover, WORLD), `stroke ${n}`).not.toThrow();
        }
    });
});
```

The stroke completes the ball set-up before validating, so a draw whose croqueted ball the head would already touch
is drawn again too.

- [ ] **Step 4: Run them; pre-flight measures here**

Run: `npx vitest run tests/engine/impact/invariants.test.ts tests/engine/impact/convergence.test.ts
tests/engine/impact/fuzz.test.ts`, then `SLOW_TESTS=1 npx vitest run tests/engine/impact/fuzz.test.ts`.

Expected: PASS.

In pre-flight, add temporary `console.log`s and measure:

- the worst energy rise ratio;
- the worst convergence ratio at `IMPACT_DT` and at 2× and 5× it;
- the longest fuzz impact;
- the worst fuzz peak per pair kind;
- the change in handover velocities with `RELEASE_STEPS` ×4 (edit the constant temporarily).

Set the Pre-flight table's constants from them. Remove the logs before committing.

A failing invariant is a bug, not a tolerance to raise. In particular, a mirror mismatch means some operation is not
sign-symmetric: find it.

- [ ] **Step 5: Format, lint, check, commit**

```bash
git add tests/engine/impact/invariants.test.ts tests/engine/impact/convergence.test.ts tests/engine/impact/fuzz.test.ts
git commit -F "$CLAUDE_TEMP_DIR/msg.txt"   # "Test impact invariants, convergence and fuzz"
```

---

### Task 9: Impact probe and roadmap outcomes

The probe records, but does not gate:

- stiffness sensitivity;
- the stop-shot probe;
- impact engine time.

These are spec §1's "recorded, not gated" items for P2b.2 and P5.

**Files:**
- Create: `scripts/impactProbe.ts`
- Modify: `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md` (P2 row exit criteria: P2b.1 met; new
  section "P2b.1 outcomes carried forward")

**Interfaces:**
- Consumes: `simulateImpact`, `defaultWorld`, `uniformLawn`, `contactReference`, `malletReference`,
  `solidCylinderInertia`, and `strike`, `drive` and `recorder` from `tests/engine/support/impact.ts` (as
  `scripts/shotMix.ts` uses the test fixtures).

- [ ] **Step 1: Write `scripts/impactProbe.ts`**

```ts
/**
 * Impact probe (P2b.1 design §1: recorded, not gated). On the default world, with the sourced head and face
 * (reference/mallet.json, contact.json), reports:
 * - stiffness sensitivity: each stiffness swept across its reference bounds, and the handover;
 * - the stop-shot probe: whether the striker's ball clears the turf while it transfers its momentum, and where it
 *   meets the croqueted ball;
 * - impact engine time per stroke.
 * Run with `npx --yes tsx scripts/impactProbe.ts`; environment: REPEAT (timed runs per stroke, default 200). Not
 * part of the test suite; its output goes into the roadmap's "P2b.1 outcomes carried forward".
 */
import { vec3, type Vec3 } from "../src/engine/math/vec3";
import { simulateImpact } from "../src/engine/impact/simulateImpact";
import { solidCylinderInertia } from "../src/engine/impact/rigidBody";
import type { ContactState, FaceMaterial, MalletHead } from "../src/engine/impact/types";
import type { BallState, BallStates, World } from "../src/engine/types";
import { defaultWorld, uniformLawn } from "../src/engine/world";
import { contactReference, malletReference } from "../src/reference/index";
import { drive, recorder, strike } from "../tests/engine/support/impact";

// The project has no Node types; this script runs under tsx and reads only its environment.
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

const REPEAT = Number(process.env.REPEAT ?? "200");
const BASE = defaultWorld();
const R = BASE.ball.radius;
const radius = malletReference.headDiameter.value / 2;
const HEAD: MalletHead = {
    mass: malletReference.headMass.value,
    inertia: solidCylinderInertia(malletReference.headMass.value, malletReference.headLength.value, radius),
    length: malletReference.headLength.value,
    radius,
    socket: vec3(0, 0, radius),
};
const FACE: FaceMaterial = {
    restitution: malletReference.faceRestitution.value,
    friction: malletReference.faceFriction.value,
    contactTime: contactReference.faceBallContactTime.value,
};
const at = (x: number, y: number): BallState => ({ position: vec3(x, y, R), velocity: vec3(0, 0, 0), angularVelocity: vec3(0, 0, 0) });
const BLUE = at(10, 10);
const RED = at(10 + 2 * R, 10);

interface Stroke {
    readonly name: string;
    readonly balls: BallStates;
    contact(face: FaceMaterial): ContactState;
}

/** A checked stroke: the hands pull back with 100 N along the travel for 3 ms, plus the head's weight. */
const checked = (t: Vec3): ReturnType<typeof drive> => drive(vec3(-100 * t.x, -100 * t.y, -100 * t.z), 3e-3, HEAD);

const STROKES: readonly Stroke[] = [
    { name: "centre 3 m/s", balls: { blue: BLUE }, contact: (face) => strike(BLUE.position, { head: HEAD, face, speed: 3 }) },
    { name: "croquet 3 m/s", balls: { blue: BLUE, red: RED }, contact: (face) => strike(BLUE.position, { head: HEAD, face, speed: 3 }) },
    {
        name: "descending 10°",
        balls: { blue: BLUE },
        contact: (face) => strike(BLUE.position, { head: HEAD, face, speed: 3, descent: 0.1745, pitch: 0.1745 }),
    },
    {
        name: "stop shot",
        balls: { blue: BLUE, red: RED },
        contact: (face) => strike(BLUE.position, { head: HEAD, face, speed: 3, descent: 0.0524, drive: checked }),
    },
];

function withTurf(stiffness: number): World {
    const surface = BASE.lawn.surfaceAt(vec3(0, 0, 0));
    return { ...BASE, lawn: uniformLawn(BASE.lawn.width, BASE.lawn.length, { ...surface, turfStiffness: stiffness }) };
}

const fmt = (x: number, digits = 4): string => x.toFixed(digits);

function report(label: string, stroke: Stroke, face: FaceMaterial, world: World): void {
    const r = simulateImpact(stroke.contact(face), stroke.balls, world);
    const b = r.handover.blue as BallState;
    const red = r.handover.red;
    const flags = r.events.filter((e) => e.kind !== "turf-lift").map((e) => e.kind);
    console.log(
        `${label.padEnd(28)} ${stroke.name.padEnd(16)} blue v=(${fmt(b.velocity.x)}, ${fmt(b.velocity.z)}) ` +
            `ωy=${fmt(b.angularVelocity.y, 2)} ${red ? `red vx=${fmt(red.velocity.x)} ` : ""}` +
            `lift=${r.events.some((e) => e.kind === "turf-lift")} ${fmt(r.duration * 1e3, 3)} ms ${r.steps} steps` +
            `${flags.length > 0 ? ` flags=${flags.join(",")}` : ""}`,
    );
}

function sweep(): void {
    console.log("== Stiffness sensitivity (each swept across its reference bounds) ==");
    const [flo, fhi] = contactReference.faceBallContactTime.bounds as [number, number];
    const [blo, bhi] = contactReference.ballBallContactTime.bounds as [number, number];
    const [tlo, thi] = contactReference.ballTurfStiffness.bounds as [number, number];
    for (const stroke of STROKES) {
        report("reference", stroke, FACE, BASE);
        for (const T of [flo, fhi]) {
            report(`face contact ${fmt(T * 1e3, 2)} ms`, stroke, { ...FACE, contactTime: T }, BASE);
        }
        for (const T of [blo, bhi]) {
            report(`ball–ball contact ${fmt(T * 1e3, 2)} ms`, stroke, FACE, { ...BASE, ballBallContactTime: T });
        }
        for (const k of [tlo, thi]) {
            report(`turf ${k.toExponential(2)} N/m`, stroke, FACE, withTurf(k));
        }
    }
}

function stopShot(): void {
    console.log("== Stop-shot probe ==");
    const stroke = STROKES[3] as Stroke;
    const probe = recorder();
    const r = simulateImpact(stroke.contact(FACE), stroke.balls, BASE, { probe });
    let impulse = 0;
    let clear = 0;
    let height = 0;
    let minLift = Infinity;
    let maxLift = -Infinity;
    for (const [i, s] of probe.snapshots.entries()) {
        const c = s.contacts.find((x) => x.key === "blue/red" && x.normalForce > 0);
        if (!c) {
            continue;
        }
        const dt = s.t - (i > 0 ? (probe.snapshots[i - 1]?.t as number) : 0);
        const blue = s.balls[0] as BallState;
        const lift = blue.position.z - R;
        minLift = Math.min(minLift, lift);
        maxLift = Math.max(maxLift, lift);
        impulse += c.normalForce * dt;
        if (lift >= 0) {
            clear += c.normalForce * dt;
        }
        // The contact point on red is c_red − R·n, so it lies −R·n_z above red's equator.
        height += -R * c.normal.z * c.normalForce * dt;
    }
    console.log(
        `blue z − R during transfer: ${fmt(minLift * 1e3, 3)} … ${fmt(maxLift * 1e3, 3)} mm; ` +
            `impulse share with blue clear of the turf ${fmt((100 * clear) / impulse, 1)} %; ` +
            `mean contact height above red's equator ${fmt((height / impulse) * 1e3, 3)} mm`,
    );
    console.log(`events: ${r.events.map((e) => `${e.kind}@${fmt(e.t * 1e3, 3)}ms`).join(", ")}`);
}

function timing(): void {
    console.log(`== Impact engine time per stroke (${REPEAT} runs after 20 warm-up) ==`);
    for (const stroke of STROKES) {
        const contact = stroke.contact(FACE);
        for (let i = 0; i < 20; i++) {
            simulateImpact(contact, stroke.balls, BASE);
        }
        const times: number[] = [];
        let steps = 0;
        for (let i = 0; i < REPEAT; i++) {
            const start = performance.now();
            steps = simulateImpact(contact, stroke.balls, BASE).steps;
            times.push(performance.now() - start);
        }
        times.sort((a, b) => a - b);
        const q = (p: number): number => times[Math.min(times.length - 1, Math.floor(p * times.length))] as number;
        console.log(`${stroke.name.padEnd(16)} ${steps} steps: median ${fmt(q(0.5), 3)} ms, p99 ${fmt(q(0.99), 3)} ms, max ${fmt(q(1), 3)} ms`);
    }
}

sweep();
stopShot();
timing();
```

The stroke angles are radians: 0.1745 rad is 10° and 0.0524 rad is 3°.

- [ ] **Step 2: Run it**

Run: `npx --yes tsx scripts/impactProbe.ts`
Expected: three sections print without throwing. Save the output to `$CLAUDE_TEMP_DIR/impactProbe.txt`.

- [ ] **Step 3: Record the outcomes in the roadmap**

In the P2 row's exit-criteria cell, change `P2b.1: …` to begin `P2b.1 (met): …`. Add a section after
"P2a.2 outcomes carried forward". Fill each bullet with the measured figures from the run, wrapped at 120 columns:

```markdown
## P2b.1 outcomes carried forward

- **Impact engine.** `simulateImpact` (phase 1): clamped linear spring–dashpot contacts, damping solved from the
  sourced restitution, Cundall–Strack friction, semi-implicit Euler at `IMPACT_DT` = <value> s, mallet head driven by a
  socket force. `ENGINE_VERSION` 0.4.0. Turf stiffness and restitution live in `SurfaceProps`; phase 2 bit-identical
  (shot mix p99 143,084, p99.9 362,050, max 408,030 work units).
- **Stiffness sensitivity (for P2b.2).** <for each stroke: how much each sweep moved the handover; whether the hard
  pairs barely matter and the turf dominates lift, as the design expected>.
- **Stop-shot probe (for P2b.2).** <blue's lift range during the transfer, the impulse share with blue clear of the
  turf, the contact height above red's equator, and any flags (a double tap?)>. The formal stop-shot-lift criterion is
  P2b.2's, with its drive profile.
- **Impact engine time (for P5).** <per stroke: steps, median and p99 ms, machine and Node version>.
- **Sourcing notes.** Turf stiffness is derived from one court's video (Gugan), from the peak penetration with the
  model's damping (1.1e5 N/m); the undamped energy balance and Gugan's timing favour up to 2.7e5. Face friction is an
  estimate (0.5). One round wooden head only; other faces, weightings and square heads are P2b.2's.
- **Not used yet.** `simulateImpact` is not exported from `src/engine/index.ts`; P2b.2's `simulateShot` wires and
  exports it.
```

- [ ] **Step 4: Format, lint, check, commit**

```bash
git add scripts/impactProbe.ts docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md
git commit -F "$CLAUDE_TEMP_DIR/msg.txt"   # "Add the impact probe and record P2b.1 outcomes"
```

---

## Self-review against the spec

| Spec | Covered by |
|---|---|
| §1 exit 1 (analytic cases) | Task 6 analytic tests; Task 7 5/7 roll |
| §1 exit 2 (invariants, bit-identical repeats) | Task 8 invariants; Task 6 repeat test |
| §1 exit 3 (`dt` convergence) | Task 8 convergence |
| §1 exit 4 (handover accepted, airborne or on turf) | Task 7 handover and entry-point tests; Task 8 fuzz chains every stroke into phase 2 |
| §1 exit 5 (phase 2 bit-identical) | Task 2 Step 7; Task 7 Step 8 |
| §1 exit 6 (fuzz) | Task 8 fuzz |
| §1 recorded items | Task 9 probe and roadmap |
| §3 interface, units, validation | Task 5 types; Task 7 `validateImpact` and its 21 rejection cases |
| §4 pairs, normal, ζ solve, stiffness, ownership table, tangential, geometry, geometric turf contact | Tasks 4, 5, 7 (`prepareImpact`) |
| §5 step, order, sink, termination, re-approach, cap, grounded, diagnostics | Task 6; Task 7 (sink, re-approach) |
| §6 handover | Task 7 |
| §7 turf in `SurfaceProps`, `ENGINE_VERSION` | Tasks 2 and 7 |
| §8 reference data | Task 1 |
| §9.1–9.7 | Tasks 6–8 |
| §10 pre-flight | Pre-flight section; Task 8 Step 4 |
| §11 deferred | Flags in Task 6; nothing implemented |
