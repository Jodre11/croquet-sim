# P2b.2b.1 — Tracked Drive, Mallet–Turf Contact, Swing Model and `simulateShot` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a `ShotSetup` into a whole shot: a swing model builds the mallet head's state and the path the hands
follow, the impact integrates the head pulled along that path (re-contacts and the head meeting the turf included), the
fault judge rules on it, and phase 2 rolls the balls out.

**Architecture:** `ContactState.drive` becomes a union. The force table stays as `{ kind: "force", samples }`,
bit-identical. The new `{ kind: "track", arc, coupling }` drives the head along a pendulum arc about a pivot that can
translate, through a spring–damper on the socket and the orientation, with the path's rigid motion fed forward
(`src/engine/impact/track.ts`). A head–turf pair joins the impact for tracked drives. A swing model
(`src/engine/swing/`) derives the arc, the head's placement and its start state from a `ShotSetup` and a
`SwingProfile`. `src/engine/shot.ts` wires `buildContact` → `simulateImpact` → `strokeContext` → `judgeFaults` →
`simulateFreeMotion`. The judge gains 29.1.13's "plays away from" and 29.1.14.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Vitest, ESLint, Prettier. No new dependencies;
`npx --yes tsx` runs the scripts.

**Spec:** `docs/superpowers/specs/2026-10-04-p2b2b1-swing-shot-design.md`. Read all of it, including its "Amended
2026-10-04 (spec review…)" note. Also read:

- Impact spec: `docs/superpowers/specs/2026-10-03-p2b1-impact-integrator-design.md` (§3 `ContactState`, §5
  integrator).
- Fault spec: `docs/superpowers/specs/2026-10-04-p2b2a-obstacles-faults-design.md` (§3 `StrokeContext`, §7 table).
- Roadmap: `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`, the P2 and P3 rows, "P2b.2 decisions"
  (the "P2b.2b.1 design" bullet) and "P2b.2a outcomes carried forward".
- Laws: World Croquet Federation, *Laws of Association Croquet*, 7th edition, with Official Rulings and Commentary,
  <https://worldcroquet.org/wp-content/uploads/2021/04/Laws-Rulings-Commentary-combined-published-master-.pdf>. You
  need Law 29.1.14, C29.18 and C29.19. Extract with `curl -sSL -o <file>.pdf <url>`, then
  `pdftotext -layout <file>.pdf <file>.txt`.

**Decisions made while planning** (fold them into the spec as its "Amended 2026-10-04 (plan)" note when the plan PR
goes up):

- **C29.18 checked (spec §6.4).** The commentary has one paragraph, C29.18.1: "A fault is committed if the striker
  plays away from the croqueted ball even though it moves or shakes, as it may do if it was ‘propped up’ by the
  striker’s ball on the edge of a depression." It gives no angular test, so any cut-off is the engine's reading,
  not the Laws'. User decision (2026-10-05): keep the spec's "angle > 90°" (a swing 80° off the line is not a
  fault), with no graded or stricter threshold. `laws.json` records it as the engine's reading.
- **The judge needs the line of centres.** `judgeFaults(context, impact)` keeps its signature, but `ImpactResult`
  holds no starting positions. So `StrokeContext` gains `lineOfCentres?: Vec3` beside `aim?: Vec3`: the unit
  horizontal vector from the striker's centre to the croqueted ball's at the start. In a croquet stroke `aim` requires
  it. `strokeContext` fills both.
- **`ImpactSetup.headTurf: PairLaw | null`**, not a boolean. The pair needs its solved law, and null leaves the pair
  out, as `ImpactBall.turf = null` does. `prepareImpact` sets it for a `track` drive and null for a force table.
  - `impact-head-deep` is raised when the setup has the pair; otherwise `impact-mallet-grounded` is raised as today.
    For prepared setups that is exactly the spec's per-drive rule. Isolated tests may give a force-table head the
    pair, to test the turf in isolation.
- **Head–turf contact point.** The pair acts at the head's lowest point itself, with no δ/2 shift: the head is not a
  sphere, and the spec says both forces act at that point.
- **Reference keys.** `contact.json` gets two flat keys, `handCouplingPeriod` and `handCouplingDampingRatio`, rather
  than a nested `handCoupling`, so that `readValue` and the bounds test apply unchanged.
- **Default shaft and grip are sourced.** The spec's 0.91 m and 0.85 m become:
  - `shaftLength` 0.9144 m (36 in), from USCA and Croquet Network;
  - `topHandHeight` 0.889 m (35 in), from George Wood's fitting rule: measure from the ground to an inch above the top
    hand, and that is the overall length.

  Then r = 0.889 − h₀ − ρ ≈ 0.805 m, where the spec has 0.77 m. No canonical clearance depends on r (below).
- **The canonical striker is not at the court's centre.** The peg stands there (`court.json`: 12.8016, 16.002), so
  the spec's setup would fail validation. It stands at (9.6012, 4.0) instead, aim +y. That is a lane midway between
  the hoop columns at x = 6.4008 and 12.8016, clear of every hoop and the peg for 28 m (spec §5.5 calls a canonical
  setup that cannot start "a defect in the table").
- **Canonical clearances** (spec §5.5 asks the plan to compute them). The head's lowest point above the turf at t = 0
  on the default world (h₀ = R − sink = 45.997 mm, ρ = 38.1 mm, L = 228.6 mm) is:
  - single-ball, drive and stop-gc: 7.897 mm;
  - stop-ac: 0.803 mm;
  - half-roll: 30.923 mm;
  - full-roll: 41.194 mm;
  - pass-roll: 46.404 mm.

  These do not depend on r: the head's pitch is −`shaftLean` whatever θ_c (spec §5.2). Task 7 pins them.
- **Tracking bound** (spec §8.1). A throwaway prototype of `pathAt` and `handLoad` used the engine's own
  `rigidBody.ts` at T = 40 ms, ζ = 0.7, dt = 5 µs over 0.12 s. Measured errors:

  | Path | Socket | Angle |
  |---|---|---|
  | Coasting arc | 2.9e-7 m | 3.7e-8 rad |
  | Power roll (pivot accelerating at 8 m/s²) | 7.6e-7 m | 1.5e-6 rad |
  | Full check (300 m/s² tangential) | 7.4e-6 m | 4.7e-5 rad |

  The residual is semi-implicit Euler's O(dt·a) lag, held by the coupling. The tests use a 40 ms test coupling, not
  `HAND_COUPLING`, and assert:
  - coast: 1e-6 m and 1e-6 rad;
  - roll: 2e-6 m and 3e-6 rad;
  - check: halving dt at least nearly halves the error. The check path is bounded by convergence, not by a fixed
    figure.

  Pre-flight re-measures all three.
- **Oscillator and relaxed-grip cases** are run on a stationary path with the error along the socket's arm, so
  translation does not couple into rotation. The prototype matched the closed forms within 2.9e-4 and 2.0e-4 of
  amplitude.
- **`HAND_COUPLING` is planned at T = 0.08 s, ζ = 0.7** (spec §3.4). This is an estimate: at 40 ms the damper's
  impulse in a 3 m/s strike is about 9 % of the 1.70 N·s transfer, and it falls as 1/T. The pre-flight search
  (Task 11, `search`) sets the value. Task 9's exit-criterion-3 test then passes by construction.
- **The re-contact test is a straight croquet drive** (Task 4), not a split. A straight drive is the clearest case
  of a striker's ball leaving slower than the head.
- **Constants live by their reader:**
  - `HAND_COUPLING` in `impact/track.ts`;
  - `HEAD_TURF_FRICTION` in `impact/simulateImpact.ts`;
  - `HEAD_DEEP_LIMIT` and `TRACK_IMPACT_CAP` in `impact/integrate.ts`;
  - `START_GAP` in `swing/buildContact.ts`.

  `swing/profile.ts` exports `DEFAULT_DRIVE`, the planner's default `drive` per preset (spec §5.4).
- **An AC stop resting on the turf runs to the cap.** The spec's end rule counts a closed head–turf pair as a hard
  contact, so a head that stays on the turf ends with `impact-cap`. That is expected; pre-flight counts how often
  (§9).

## Global Constraints

- **Formatting.**
  - 4-space indentation, 120-column limit, LF line endings, UTF-8.
  - Check lengths with `env LC_ALL=en_GB.UTF-8 grep -nE "^.{121,}$" <file>`. macOS awk counts bytes.
  - Run `npx prettier --write` on every code file you touch; `npm run format:check` must pass.
  - `.prettierignore` lists `docs/`, so wrap markdown by hand. Prettier does not re-wrap comments or strings, so wrap
    any comment over 120 columns by hand.
  - JSON `quote`, `source` and `note` strings stay on one line, as in the existing reference files.
- **Engine purity.**
  - `src/engine/**` is pure and deterministic: no DOM, no time of day, no randomness.
  - Iterate balls in `BALL_IDS` order, obstacles in `obstaclesOf` order and pairs in pair-list order. The head–turf
    pair comes after every other pair. Sum forces in that order.
- **Determinism lint.**
  - Engine code uses only IEEE-exact operations: `+ − * /`, comparisons, `Math.sqrt`, `Math.abs`, `Math.min`,
    `Math.max`, `Math.round`, `Math.floor`, the constant `Math.PI`, and the engine's own `sinCos` and `atan2`
    (`src/engine/math/elementary.ts`).
  - No `Math.sin/cos/atan2/asin/exp/log/pow/hypot` and no `**` in engine code. `npm run lint` enforces it.
  - Tests and scripts may use any `Math` function.
- **Style.**
  - No non-null assertions (`!`); the repo style is `x as T` after indexing.
  - Braces on every `if`.
  - Write `0 - x` rather than unary minus in engine arithmetic, as the impact files do. It keeps mirrored set-ups
    exact.
  - Exported functions carry a header comment. A named numerical constant says why it is not physical.
  - Use `import type` for type-only imports (`verbatimModuleSyntax`).
- **Units.** SI. A ball on the turf in phase 2 has `z = R`, `vz = 0` exactly. Inside the impact a resting ball sits
  at its static sink, `z = R − m·g/k_turf`.
- **Engine version.** `ENGINE_VERSION` becomes `"0.6.0"` (Task 10).
- **Force tables stay bit-identical to P2b.2a** (spec exit criterion 2).
  - Task 1 Step 1 saves the baseline digest, including 2,000 obstacle-fuzz strokes.
  - After Tasks 1, 4, 5 and 6, the whole digest is byte-identical to that baseline (`cmp`), `timeline ` and
    `obstacle ` lines included.
  - After Task 10, `npx --yes tsx scripts/shotMix.ts` prints work units p99 143,084, p99.9 362,050 and max 408,030
    exactly, and `SLOW_TESTS=1 npm test` passes.
- **Slow tests** run only when `SLOW_TESTS` is set (`import.meta.env.SLOW_TESTS`).
- **RED steps.** Vitest does not type-check. Where a test uses a missing export or field, the RED run shows runtime
  failures (`… is not a function`, `Cannot read properties of undefined`, an assertion on `undefined`), and
  `npm run check` shows the type errors.
- **Bash.** One command per call: no `&&`, `||`, `;`, `$(…)` or subshells.
- **Commits.**
  - Short imperative sentence (repo style), signed.
  - Write the message to `$CLAUDE_TEMP_DIR/msg.txt` and run `git commit -F "$CLAUDE_TEMP_DIR/msg.txt"`. Signing needs
    the sandbox disabled for the SSH agent.
  - Check with `git log -1 "--format=%G? %h"` (expect `G`; quote the format, as zsh globs `?`). If signing refuses,
    leave the change staged and report it.
  - Never use `--no-verify`, `-c commit.gpgsign=false` or bare `git stash`.
- **Checks after every task:** `npm test`, `npm run lint`, `npm run check` and `npm run format:check` all pass.
- **Known noise.** The editor's TypeScript LSP reports spurious "Cannot find module/name" diagnostics on every file.
  `npm run check` is the source of truth.
- **Worktree.** A fresh worktree needs `npm ci` before any test run.

## Review Focus

The inputs below are implied by the spec but exercised by none of its listed tests. Each is pinned by a test in the
task that owns the code.

1. **A gentle stroke.** A 0.1 m/s single-ball tap, as on a hoop approach, must end before the cap with no
   `impact-head-approaching`: the slow head must not be judged still closing on a ball that outruns it. Pinned in
   Task 9 ("ends a gentle tap before the cap").
2. **Any aim direction.** The planner passes any angle: aim π (along −x, where `atan2` returns π), −π/2, or 7 rad.
   The face must point along the aim, and the head must start on its path. Pinned in Task 7 ("points the face along
   any aim").
3. **A head resting almost level on the turf.** For |a_z| tiny the lowest point jumps between the two end rims. A
   head tilted ±1e-9 rad must settle at m·g/k with no spin growing. Pinned in Task 6 ("rests a nearly level head
   without spinning it").
4. **`judgeFaults` called directly with `aim` in a single-ball stroke.** A context with `aim` and no
   `lineOfCentres`, outside a croquet stroke, must neither throw nor find 29.1.13. Pinned in Task 8 ("ignores aim
   outside a croquet stroke").
5. **A tracked stroke into an upright.** P2b.2a's crush must still be found when the hands keep pushing: a striker
   touching an upright straight ahead gives 29.1.8, and phase 2 accepts the handover. Pinned in Task 9 ("finds a
   crush when the tracked head drives the ball into an upright").

---

## Pre-flight

Spec §9; roadmap standing decision: pre-flight runs this plan literally in a scratch worktree from the plan PR's head,
measures, and folds the findings back into this plan and the spec as a docs PR. The real run starts after that PR
merges. Until then this section lists what pre-flight measures and where each figure goes.

| Value | Where it lands | Planned | How pre-flight measures it |
|---|---|---|---|
| `handCouplingPeriod` (T at ζ = 0.7) | `reference/contact.json` (Task 2), its note | 0.08 s | Task 11 `search`: shortest T from 40 ms upward, in 1 ms steps, with hand impulse ≤ 5 % of the transfer on the canonical single-ball setup |
| Tracking bounds | `tests/engine/impact/track.test.ts` (Task 4) | coast 1e-6 m and 1e-6 rad; roll 2e-6 m and 3e-6 rad; check ratio < 0.6 | Run the tests and print the figures; keep a 1.5× to 3× margin |
| Coupling sweep | roadmap outcomes (Task 11) | — | Task 11 `sweep`: T 10–200 ms × ζ 0.2–1 on the canonical setups. Records hand impulse and peak hand force in the strike, the path lag at each roll push's end, and the stop, drive and roll ratios as observations |
| `TRACK_IMPACT_CAP` | `src/engine/impact/integrate.ts` (Task 4) | 0.12 s | Task 11 `presets`: longest tracked impact that ends without the cap over the preset sweep. Confirm, or revise with the user |
| Flag counts | roadmap outcomes | — | Task 11 `presets`: counts of `impact-head-deep`, `impact-cap` and `impact-head-approaching` |
| µs/step | roadmap outcomes (for P5) | — | Task 11 `timing`: tracked canonical impacts against `scripts/impactProbe.ts`'s force strokes |
| Behaviour tests | Tasks 4, 6, 9 | as written | The re-contact, end-rule, head–turf, braking, punch, gentle-tap and crush tests rest on model behaviour. Where one fails, find out why before changing an expectation; a changed expectation goes to the user if it touches the spec |

If the search's T differs from 0.08 s, pre-flight changes three things:

- the `value` and note in Task 2's JSON block;
- the "Decisions made while planning" bullet;
- the figure in spec §3.4's note, if quoted.

If Task 9's exit-criterion-3 test fails at the planned T before Task 11 exists, run Task 11's `search` early.

---

## File Structure

| Path | Change |
|---|---|
| `scripts/impactDigest.ts` | Optional obstacle-fuzz lines (`OBSTACLE_STROKES`) |
| `reference/contact.json` | `handCouplingPeriod`, `handCouplingDampingRatio`, `headTurfFriction`, `headDeepLimit` |
| `reference/mallet.json` | `shaftLength`, `topHandHeight` |
| `reference/laws.json` | 29.1.14 (new); 29.1.13's note with C29.18 in full; 29.2.3's note |
| `src/reference/index.ts` | The new values; `FAULT_LAW_KEYS` gains "29.1.14" |
| `src/engine/impact/types.ts` | `ForceDrive`, `SwingArc`, `Coupling`, `TrackDrive`, `Drive`; `impact-head-deep`; `ImpactRun.headTurfSlide` |
| `src/engine/impact/track.ts` | New: `HAND_COUPLING`, path evaluation, `prepareTrack`, `headOnPath`, `handLoad` |
| `src/engine/impact/contacts.ts` | `HEAD_TURF_KEY`, `headBottom`, `headTurfContact` |
| `src/engine/impact/integrate.ts` | Tracked drive, track end rule, `TRACK_IMPACT_CAP`, head–turf pair, `HEAD_DEEP_LIMIT`, probe fields |
| `src/engine/impact/simulateImpact.ts` | Track validation and preparation; the head–turf law; `HEAD_TURF_FRICTION` |
| `src/engine/swing/types.ts` | New: `StrokeType`, `CROQUET_STROKES`, `SwingProfile`, `ShotSetup` |
| `src/engine/swing/profile.ts` | New: `defaultProfile`, `DEFAULT_DRIVE` |
| `src/engine/swing/buildContact.ts` | New: `START_GAP`, `buildContact` |
| `src/engine/faults.ts` | `StrokeContext.aim`, `.lineOfCentres`; 29.1.13 "plays away from"; 29.1.14 |
| `src/engine/shot.ts` | New: `ShotOutcome`, `strokeContext`, `simulateShot` |
| `src/engine/world.ts` | Header comment only (the engine now reads references in three places) |
| `src/engine/index.ts` | Exports (spec §6.5) |
| `src/engine/simulate.ts` | `ENGINE_VERSION` 0.6.0 |
| `tests/engine/support/impact.ts` | Force-drive wrapping; `TEST_COUPLING`, `levelArc`, `onArc`; `isolated` gains `headTurf`; `mirrorContact` mirrors arcs |
| `tests/engine/support/shot.ts` | New: `testProfile`, `CANONICAL_STRIKER`, `canonicalSetup` |
| `tests/engine/impact/{analytic,timeline,simulateImpact}.test.ts` | Force-drive wrapping; track validation cases |
| `tests/engine/impact/track.test.ts` | New: path, tracking, end rule |
| `tests/engine/impact/headTurf.test.ts` | New: the head–turf pair |
| `tests/engine/impact/contacts.test.ts` | Head bottom and head–turf contact |
| `tests/engine/swing/buildContact.test.ts` | New: the swing model |
| `tests/engine/faults.test.ts` | 29.1.13 "plays away from", 29.1.14 |
| `tests/engine/shot.test.ts` | New: `strokeContext`, `simulateShot`, mechanisms |
| `tests/engine/index.test.ts`, `tests/reference/reference.test.ts` | Exports; new reference values |
| `scripts/swingProbe.ts` | New: pre-flight measurements (spec §9) |
| `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md` | P2b.2b.1 met; outcomes carried forward |

Task order keeps every commit green and force tables bit-identical:

- Task 1 wraps the force table in `{ kind: "force", samples }`; nothing else moves.
- Task 2 adds data only.
- Task 3 adds the path as pure functions.
- Task 4 adds the tracked drive to the integrator, through isolated set-ups only.
- Task 5 widens `ContactState.drive` to the union and validates and prepares tracked contacts.
- Task 6 adds the head–turf pair.
- Task 7 adds the swing model.
- Task 8 adds the new judgements.
- Task 9 adds `simulateShot`.
- Task 10 adds the exports and the version.
- Task 11 adds the probe and records the outcomes.

---

### Task 1: The force table becomes `{ kind: "force", samples }`

Spec §3.1 and exit criterion 2. The drive becomes a tagged object so that Task 5 can add the `track` member. This task
is mechanical: every number stays bit-identical. It first records the baseline every later bit-identity check compares
against, with the obstacle fuzz added to the digest.

**Files:**
- Modify: `scripts/impactDigest.ts`, `src/engine/impact/types.ts`, `src/engine/impact/integrate.ts`,
  `src/engine/impact/simulateImpact.ts`, `tests/engine/support/impact.ts`, `tests/engine/impact/analytic.test.ts`,
  `tests/engine/impact/timeline.test.ts`, `tests/engine/impact/simulateImpact.test.ts`

**Interfaces:**
- Produces:
  - `interface ForceDrive { readonly kind: "force"; readonly samples: readonly DriveSample[] }`;
  - `type Drive = ForceDrive` (Task 5 widens it);
  - `ContactState.drive: Drive` and `ImpactSetup.drive: ForceDrive` (Task 4 widens it);
  - `driveAt(samples, t)`, unchanged.

- [ ] **Step 1: Add the obstacle fuzz to the digest, then save the baseline**

In `scripts/impactDigest.ts`, extend the support import and add an opt-in section at the end. The default output is
unchanged, so this baseline is `main`'s.

```ts
import {
    FUZZ_SEED,
    OBSTACLE_FUZZ_SEED,
    SCENARIOS,
    randomObstacleStroke,
    randomStroke,
    recorder,
} from "../tests/engine/support/impact";
```

```ts
const OBSTACLE_STROKES = Number(process.env.OBSTACLE_STROKES ?? "0");
```

(below `const STROKES = …`), and after the fuzz loop:

```ts
const obstacleRandom = rng(OBSTACLE_FUZZ_SEED);
for (let n = 0; n < OBSTACLE_STROKES; n++) {
    const { contact, balls, world } = randomObstacleStroke(obstacleRandom, TEST_WORLD);
    const result = simulateImpact(contact, balls, world);
    console.log(`obstacle ${n} ${exact(p2b1(result))}`);
    console.log(`timeline obstacle ${n} ${exact(later(result))}`);
}
```

Change the header's run line to:

```ts
 * Run with `npx --yes tsx scripts/impactDigest.ts > before.txt`; environment: STROKES (fuzz strokes, default 200),
 * OBSTACLE_STROKES (obstacle-fuzz strokes, as fuzz.test.ts draws them; default 0).
```

From the worktree root (`npm ci` first in a fresh worktree):

Run: `env OBSTACLE_STROKES=2000 npx --yes tsx scripts/impactDigest.ts > "$CLAUDE_TEMP_DIR/digest-base.txt"`
Expected: it starts `scenario centre test-world {`; record the line count (`wc -l`) for the commit message.

Run: `npx --yes tsx scripts/shotMix.ts`
Expected: work units p99 143,084, p99.9 362,050, max 408,030. Record these.

- [ ] **Step 2: Wrap the force table in the types**

In `src/engine/impact/types.ts`, replace the `ContactState` block (its comment and interface) with:

```ts
/**
 * A force-table drive: the total force the hands apply to the head at the socket, excluding gravity, so it carries the
 * head's weight. Samples are in strictly increasing t, the first at t = 0, the last ending the drive window; the force
 * is zero after it.
 */
export interface ForceDrive {
    readonly kind: "force";
    readonly samples: readonly DriveSample[];
}

/** What the hands do to the head during the impact (P2b.2b.1 design §3.1). */
export type Drive = ForceDrive;

/** What the swing delivers to the impact: the head and its face, its state at t = 0, and the drive. */
export interface ContactState extends HeadState {
    readonly head: MalletHead;
    readonly face: FaceMaterial;
    readonly drive: Drive;
}
```

- [ ] **Step 3: Read the samples in the integrator and the validation**

In `src/engine/impact/integrate.ts`:
- Change the types import to
  `import type { ContactInterval, DriveSample, ForceDrive, HeadState, ImpactEvent, ImpactRun, MalletHead } from "./types";`.
- In `ImpactSetup`, use `readonly drive: ForceDrive;`.
- In `integrate`, use
  `const driveEnd = (setup.drive.samples[setup.drive.samples.length - 1] as DriveSample).t;` and
  `const drive = driveAt(setup.drive.samples, t);`.

In `src/engine/impact/simulateImpact.ts`, replace the two drive checks in `validateImpact` with:

```ts
    const { samples } = contact.drive;
    if (samples.length === 0 || (samples[0] as DriveSample).t !== 0) {
        fail("drive must start at t = 0");
    }
    samples.forEach((s, i) => {
        finite(s.force, `drive[${i}].force`);
        if (!Number.isFinite(s.t) || (i > 0 && !(s.t > (samples[i - 1] as DriveSample).t))) {
            fail("drive times must increase strictly");
        }
    });
```

`prepareImpact`'s `drive: contact.drive` is unchanged.

- [ ] **Step 4: Wrap the test helpers and the hand-built drives**

In `tests/engine/support/impact.ts`:
- `strike` returns `drive: { kind: "force", samples: o.drive ? o.drive(travel) : coast(3e-3, head) },`;
- `isolated`'s default is `drive: { kind: "force", samples: [{ t: 0, force: ZERO }] },`;
- `mirrorContact`'s drive line is
  `drive: { kind: "force", samples: c.drive.samples.map((s) => ({ t: s.t, force: mirrorVec(s.force) })) },`.

`drive()`, `coast()` and `StrikeOptions.drive` keep returning sample arrays, so `scripts/impactProbe.ts` and the
scenarios are unchanged.

In `tests/engine/impact/analytic.test.ts`, the two `isolated({ … drive: [ … ] … })` calls (in the slide helper, about
line 135, and in "a socket force on a free head", about line 179) become `drive: { kind: "force", samples: [ … ] },`
with the same two samples. In `tests/engine/impact/timeline.test.ts`, the double-tap case's `drive: [ … ]` (about line
82) becomes `drive: { kind: "force", samples: [ … ] },` likewise.

In `tests/engine/impact/simulateImpact.test.ts`, the three drive rows become:

```ts
        [
            "an empty drive",
            { ...ok, drive: { kind: "force", samples: [] } },
            { blue: BLUE },
            WORLD,
            /drive must start at t = 0/,
        ],
        [
            "a drive not starting at 0",
            { ...ok, drive: { kind: "force", samples: [{ t: 1e-4, force: vec3(0, 0, 0) }] } },
            { blue: BLUE },
            WORLD,
            /drive must start at t = 0/,
        ],
        [
            "a drive not increasing",
            {
                ...ok,
                drive: { kind: "force", samples: [...drive(vec3(0, 0, 0), 1e-3), { t: 1e-3, force: vec3(0, 0, 0) }] },
            },
            { blue: BLUE },
            WORLD,
            /drive times must increase strictly/,
        ],
```

(Each row's array is typed by the table's element type. If `npm run check` reports the literal `"force"` widened to
`string`, add `as const` after `"force"`.)

- [ ] **Step 5: Verify**

Run: `npm test`, `npm run check`, `npm run lint`
Expected: all pass (534 passed, 2 skipped, as on `main`).

Run: `env OBSTACLE_STROKES=2000 npx --yes tsx scripts/impactDigest.ts > "$CLAUDE_TEMP_DIR/digest-1.txt"`
Run: `cmp "$CLAUDE_TEMP_DIR/digest-base.txt" "$CLAUDE_TEMP_DIR/digest-1.txt"`
Expected: no output (identical).

- [ ] **Step 6: Format, check, commit**

Run `npx prettier --write` on the eight files, then the four checks.

```bash
git add scripts/impactDigest.ts src/engine/impact/types.ts src/engine/impact/integrate.ts src/engine/impact/simulateImpact.ts tests/engine/support/impact.ts tests/engine/impact/analytic.test.ts tests/engine/impact/timeline.test.ts tests/engine/impact/simulateImpact.test.ts
git commit -F "$CLAUDE_TEMP_DIR/msg.txt"   # "Tag the force-table drive, bit-identical"
```

---

### Task 2: Reference data for the swing, the head–turf pair and 29.1.14

Spec §7 and §6.4. Before committing, open each URL and confirm each quoted sentence is still there. The Laws PDF is
in the spec header; for the mallet pages, use WebFetch. If a quotation cannot be re-found, keep the entry, add
"(quotation not re-found on <date>)" to its note and report it. Planning re-found the Laws quotations on 2026-10-04
in the April 2021 combined PDF; the mallet quotations came from search abstracts and must be confirmed on the pages
themselves. Apostrophes and quotation marks follow the source (the Laws PDF uses ’ and ‘ ’).

**Files:**
- Modify: `reference/contact.json`, `reference/mallet.json`, `reference/laws.json`, `src/reference/index.ts`
- Test: `tests/reference/reference.test.ts`

**Interfaces:**
- Produces:
  - `contactReference.handCouplingPeriod`, `.handCouplingDampingRatio`, `.headTurfFriction`, `.headDeepLimit`, each a
    `ReferenceValue`;
  - `malletReference.shaftLength` and `.topHandHeight`, each a `ReferenceValue`;
  - `FAULT_LAW_KEYS` with `"29.1.14"` after `"29.1.13"`;
  - `lawsReference.faults["29.1.14"]`.

- [ ] **Step 1: Write the failing test**

Append to `tests/reference/reference.test.ts`:

```ts
describe("swing and head–turf reference data", () => {
    it("loads the provisional hand coupling", () => {
        expect(contactReference.handCouplingPeriod.value).toBeGreaterThan(0);
        expect(contactReference.handCouplingDampingRatio.value).toBe(0.7);
    });

    it("loads the head–turf friction and the deep-head limit", () => {
        expect(contactReference.headTurfFriction.value).toBe(0.5);
        expect(contactReference.headDeepLimit.value).toBe(0.002);
    });

    it("loads the default shaft and top hand, the hand an inch below the handle's length", () => {
        expect(malletReference.shaftLength.value).toBeCloseTo(36 * 0.0254, 12);
        expect(malletReference.topHandHeight.value).toBeCloseTo(35 * 0.0254, 12);
    });

    it("quotes 29.1.14 after 29.1.13", () => {
        const keys: readonly string[] = FAULT_LAW_KEYS;
        expect(keys.indexOf("29.1.14")).toBe(keys.indexOf("29.1.13") + 1);
        expect(lawsReference.faults["29.1.14"].quote).toContain("damages the court with the mallet");
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/reference/reference.test.ts`
Expected: FAIL, 4 tests: `Cannot read properties of undefined (reading 'value')` (three) and
`expected -1 to be 9` (or the `quote` read on `undefined`).

- [ ] **Step 3: Add the values to `reference/contact.json`**

Add after `tangentialStiffnessRatio` (mind the comma after its closing brace):

```json
"handCouplingPeriod": {
    "value": 0.08,
    "unit": "s",
    "bounds": [0.01, 0.2],
    "source": "P2b.2b.1 design §3.4 (docs/superpowers/specs/2026-10-04-p2b2b1-swing-shot-design.md): a criterion, searched in pre-flight with scripts/swingProbe.ts",
    "provenance": "derived",
    "note": "Provisional; P2b.2b.2 sources or fits it. The hands hold the mallet head through a spring-damper of this natural period (firm grip) and handCouplingDampingRatio, on the socket's position and the head's orientation. Criterion: on a 3 m/s centre strike on a single ball with a firm grip, the hands' impulse beyond the feed-forward over the face-ball contact is at most 5 % of the ball's momentum change over it, so that the transfer is the head's, not the hands'. The damper dominates that impulse and falls as 1/T: about 9 % of the 1.70 N s transfer at 40 ms, so about 80 ms meets it. Pre-flight holds the damping ratio at 0.7 and searches upward from 40 ms in 1 ms steps for the shortest period meeting it. A 5 ms period, critically damped, would draw about 4 kN of hand force in the strike, comparable to the 3.7 kN peak face force. Bounds: the pre-flight sweep's range (10-200 ms)."
},
"handCouplingDampingRatio": {
    "value": 0.7,
    "unit": "1",
    "bounds": [0.2, 1],
    "source": "P2b.2b.1 design §3.4 (docs/superpowers/specs/2026-10-04-p2b2b1-swing-shot-design.md)",
    "provenance": "derived",
    "note": "Provisional; P2b.2b.2 sources or fits it. Held at 0.7 while handCouplingPeriod is searched (design §3.4); used for translation and rotation alike. Bounds: the pre-flight sweep's range (0.2-1)."
},
"headTurfFriction": {
    "value": 0.5,
    "unit": "1",
    "bounds": [0.3, 0.7],
    "source": "Stan Hall, 'When a Mallet Strikes a Ball', section 'Coefficients of Friction' (1994; Oxford Croquet, updated 28 April 2026), https://oxfordcroquet.org/tech/hall/",
    "provenance": "analogue",
    "note": "No measured friction of a mallet head on turf was found. Analogue: Hall slid croquet balls embedded in polystyrene along a croquet court: \"For a fairly fast court (normal, cut to 6mm) the coefficient was 0.48. For a fairly heavy court, the coefficient was 0.53.\" (friction.json ballTurfSliding). A wooden head's base or rim sliding on the same turf is taken alike: 0.5, between the two. Bounds: an allowance for wood against plastic and for a rim against a flat (P2b.2b.1 design §7). P2b.2b.2 sources it, and decides whether a heel ploughing into the turf needs a drag term."
},
"headDeepLimit": {
    "value": 0.002,
    "unit": "m",
    "bounds": [0.002, 0.0072],
    "source": "P2b.2b.1 design §4.2 (docs/superpowers/specs/2026-10-04-p2b2b1-swing-shot-design.md); upper bound: Don Gugan, 'The Physics of Croquet Strokes: Analysis of the CA high-speed DVD', Table 4(b) (2009; Oxford Croquet), https://oxfordcroquet.org/tech/gugan4/",
    "provenance": "derived",
    "note": "A model limit, not a property of turf. The impact's turf is a plane with a linear spring, fitted to a ball pressed into it (ballTurfStiffness); a mallet head's edge or rim presses a footprint that law was not fitted to, so a head driven more than this below the turf plane raises impact-head-deep. Provisional. Upper bound: the deepest ball penetration Gugan measured, 7.2 mm (Table 4(b), roll A4R)."
}
```

- [ ] **Step 4: Add the shaft and the top hand to `reference/mallet.json`**

Add after `headDiameter`:

```json
"shaftLength": {
    "value": 0.9144,
    "unit": "m",
    "bounds": [0.8128, 0.9652],
    "source": "USCA 9-wicket, 'Updated Advice & Information on Choosing a Mallet' (2014), http://www.9wicketcroquet.com/howtoplay/153/updated-advice-information-on-choosing-a-mallet; Croquet Network, 'Buying Your First Croquet Mallet' (2023), https://www.croquetnetwork.com/croquet-network-home/2023/5/28/buying-your-first-croquet-mallet; upper bound: TheSportsReviewer, 'What is the Standard Size of a Croquet Mallet?' (2023), https://thesportsreviewer.com/what-is-the-standard-size-of-a-croquet-mallet/",
    "provenance": "direct",
    "note": "USCA: \"A “standard mallet” traditionally would weigh 3 pounds total (1.362Kg), have a 36” wood shaft and a 9-11” head length.\" and \"In general , people under 5 feet 4 inches use 32 inch shafts; up to 5 feet 10’ a 34 inch shaft and above 5’ 11” a 36 inch shaft.\" Croquet Network: \"as a general rule for a first mallet, I think an 11-inch head and a 36-inch shaft is a good starting point.\" SI: 36 in x 0.0254 = 0.9144 m. Bounds 32-38 in: USCA's shortest, and TheSportsReviewer: \"this measurement typically ranges between 32 inches (81 cm) and 38 inches (97 cm)\". The default profile's shaft (P2b.2b.1 design §5.4); provisional."
},
"topHandHeight": {
    "value": 0.889,
    "unit": "m",
    "bounds": [0.7874, 0.9398],
    "source": "George Wood Mallets, 'Croquet Mallet FAQ' (2026), https://www.woodmallets.com/croquet-mallet-options/",
    "provenance": "derived",
    "note": "George Wood, on choosing a handle length: \"measure from the ground to an inch above where your top hand naturally and comfortably holds the handle.\" and \"This should be the overall length.\" The top hand is therefore about an inch below the handle's length: 36 in - 1 in = 35 in x 0.0254 = 0.889 m for shaftLength's 36 in. Bounds: the same rule over shaftLength's bounds, 31-37 in. It is the top hand's height above the ground at address, with the head level and its centre at the ball's height; the swing's arc radius is this less the socket's height (P2b.2b.1 design §5.2). The default profile's grip; provisional."
}
```

- [ ] **Step 5: Quote 29.1.14 and complete 29.1.13 and 29.2.3 in `reference/laws.json`**

Add after `29.1.13`:

```json
"29.1.14": {
    "quote": "a fault is committed during the striking period if the striker: [...] in any of the strokes specified in Law 29.2.3, damages the court with the mallet to the extent that a subsequent stroke played over the damaged area could be significantly affected.",
    "source": "World Croquet Federation, The Laws of Association Croquet, 7th Edition (February 2021), with Official Rulings and Commentary (current as at April 2021), Law 29.1.14 and commentary C29.19; https://worldcroquet.org/wp-content/uploads/2021/04/Laws-Rulings-Commentary-combined-published-master-.pdf",
    "provenance": "direct",
    "note": "Judged as a possible fault (P2b.2b.1 design §6.4): the Law sets no objective test, C29.19.5: \"The law does not specify an objective test as to whether a subsequent stroke played over the damaged area could be ‘significantly affected’, but it is explicit that it is the potential effect on subsequent strokes, rather than cosmetic appearance, that must be considered. The effect on gentle, as well as hard strokes, must be taken into account. The potential effect must be significant: the guidance offered is that damage significantly affects a stroke if a ball passing over the (unrepaired) damage, at a speed such that it will stop about a mallet’s (shaft) length away, would come to rest more than a ball’s width from where it would have done if the damage was not there.\" C29.19.4: \"The damage must be caused by the mallet, not just the ball.\" The impact's turf is a plane that keeps no damage (divots are deferred), so the finding carries the head's deepest penetration, its peak turf force and its slide along the turf, and no damage threshold is invented. Applies only to the strokes of Law 29.2.3 (StrokeContext.hampered, jumpAttempt, group)."
},
```

Replace 29.1.13's `note` with:

```json
"note": "Both clauses are judged. \"Fails to move or shake\": the croqueted pair never penetrates beyond CONTACT_TOLERANCE (evidence peakPenetration). \"Plays away from\" (P2b.2b.1 design §6.4): the swing direction makes an angle of more than 90° with the horizontal line from the striker's centre to the croqueted ball's (evidence angle). C29.18 in full, C29.18.1: \"A fault is committed if the striker plays away from the croqueted ball even though it moves or shakes, as it may do if it was ‘propped up’ by the striker’s ball on the edge of a depression.\" The commentary sets no angular test; more than 90° is the engine's reading of \"away from\" (checked against C29.18 on 2026-10-04; kept by the user's decision on 2026-10-05, with no graded or stricter threshold)."
```

Replace 29.2.3's `note` with:

```json
"note": "StrokeContext.hampered, .jumpAttempt and .group, supplied by the caller (simulateShot derives group); they gate 29.1.5 and 29.1.14."
```

- [ ] **Step 6: Expose them in `src/reference/index.ts`**

In `FAULT_LAW_KEYS`, add `"29.1.14",` after `"29.1.13",`. In `contactReference`, add after `tangentialStiffnessRatio`:

```ts
    handCouplingPeriod: readValue(contactJson, "handCouplingPeriod", "contact"),
    handCouplingDampingRatio: readValue(contactJson, "handCouplingDampingRatio", "contact"),
    headTurfFriction: readValue(contactJson, "headTurfFriction", "contact"),
    headDeepLimit: readValue(contactJson, "headDeepLimit", "contact"),
```

and change its comment to:

```ts
/**
 * Impact-phase contact data: turf stiffness, contact durations, the tangential ratio, the hand coupling and the
 * head–turf pair.
 */
```

In `malletReference`, add after `headDiameter`:

```ts
    shaftLength: readValue(malletJson, "shaftLength", "mallet"),
    topHandHeight: readValue(malletJson, "topHandHeight", "mallet"),
```

and change its comment to:

```ts
/** One mallet face, one typical round head, and the default shaft and grip (P2b.1, P2b.2b.1). */
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/reference/reference.test.ts`
Expected: PASS. The existing "gives every impact value bounds" also covers the six new values.

Run: `npm test`
Expected: all pass. `faults.test.ts`'s JUDGED_LAWS quote test is unaffected; Task 8 adds 29.1.14 to `JUDGED_LAWS`.

- [ ] **Step 8: Format, check, commit**

Run the four checks (Prettier formats the JSON).

```bash
git add reference/contact.json reference/mallet.json reference/laws.json src/reference/index.ts tests/reference/reference.test.ts
git commit -F "$CLAUDE_TEMP_DIR/msg.txt"   # "Add the swing, head–turf and 29.1.14 reference data"
```

---

### Task 3: The swing path

Spec §3.1 and §3.2. These are pure functions: the arc and pivot during and after the window, the head's target
orientation, and a head placed on the path. Nothing reads them yet.

**Files:**
- Modify: `src/engine/impact/types.ts`, `tests/engine/support/impact.ts`
- Create: `src/engine/impact/track.ts`, `tests/engine/impact/track.test.ts`

**Interfaces:**
- Produces (types.ts):
  - `interface SwingArc { pivot; pivotVelocity; pivotAcceleration; aim: Vec3; radius; theta0; omega0; alpha; window: number; shaftToHead: Quaternion }`;
  - `interface Coupling { period; dampingRatio; tension: number }`;
  - `interface TrackDrive { kind: "track"; arc: SwingArc; coupling: Coupling }`.
- Produces (track.ts):
  - `pitchAxis(aim: Vec3): Vec3`, which is aim × ẑ;
  - `aimRotation(aim: Vec3): Quaternion`;
  - `swingOrientation(aim: Vec3, shaftToHead: Quaternion, theta: number): Quaternion`;
  - `interface PreparedTrack` with `kind: "track"`, `arc`, `axis`, `base`, `thetaEnd`, `omegaEnd`, `pivotEnd`,
    `pivotVelocityEnd`, `stiffness`, `damping`, `angularStiffness`, `angularDamping` and `carried`;
  - `prepareTrack(drive: TrackDrive, head: MalletHead, gravity: number): PreparedTrack`;
  - `interface PathPoint { socket; socketVelocity; socketAcceleration: Vec3; orientation: Quaternion; angularVelocity; angularAcceleration: Vec3 }`;
  - `pathAt(track: PreparedTrack, t: number): PathPoint`;
  - `headOnPath(track: PreparedTrack, head: MalletHead, t: number): HeadState`.
- Produces (support/impact.ts): `TEST_COUPLING: Coupling` = { period 0.04, dampingRatio 0.7, tension 1 }.

- [ ] **Step 1: Add the types**

In `src/engine/impact/types.ts`, after `DriveSample`, add:

```ts
/**
 * The path the hands drive the socket along (P2b.2b.1 design §3.1): a pendulum arc in a vertical plane about a pivot
 * that may itself move in that plane (the body's weight moving from back to front). Arc and pivot accelerate
 * constantly for `window`, then run on at constant rates.
 */
export interface SwingArc {
    /** The top hand at t = 0, world frame. */
    readonly pivot: Vec3;
    /** At t = 0, in the swing plane (no component along the pitch axis aim × ẑ). */
    readonly pivotVelocity: Vec3;
    /** During the window, in the swing plane. */
    readonly pivotAcceleration: Vec3;
    /** Unit, horizontal: the swing plane's forward direction. */
    readonly aim: Vec3;
    /** Pivot to socket (m). */
    readonly radius: number;
    /** Arc angle at t = 0 (rad), from the lowest point, positive forward. */
    readonly theta0: number;
    /** Arc rate at t = 0 (rad/s). */
    readonly omega0: number;
    /** Arc acceleration during the window (rad/s²). */
    readonly alpha: number;
    /** Length of the drive window (s). */
    readonly window: number;
    /** The head's orientation relative to the shaft frame. */
    readonly shaftToHead: Quaternion;
}

/**
 * The hands' grip on the head: the natural period (s) and damping ratio of a firm grip, used for both translation and
 * rotation, and the grip's tension in (0, 1] (1 firm; lower is relaxed, design §3.3).
 */
export interface Coupling {
    readonly period: number;
    readonly dampingRatio: number;
    readonly tension: number;
}

/** A tracked drive (design §3): the hands pull the socket along `arc` and hold the head through `coupling`. */
export interface TrackDrive {
    readonly kind: "track";
    readonly arc: SwingArc;
    readonly coupling: Coupling;
}
```

In `tests/engine/support/impact.ts`, add `Coupling` to the types import and, below `TEST_FACE`:

```ts
/** A coupling for tracked test heads: plausible, not sourced (design §3.4 sets the engine's). */
export const TEST_COUPLING: Coupling = { period: 0.04, dampingRatio: 0.7, tension: 1 };
```

- [ ] **Step 2: Write the failing tests**

Create `tests/engine/impact/track.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { add, cross, dot, length, scale, sub, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import { IDENTITY, multiply, rotate, type Quaternion } from "../../../src/engine/impact/rigidBody";
import {
    aimRotation,
    headOnPath,
    pathAt,
    pitchAxis,
    prepareTrack,
    swingOrientation,
} from "../../../src/engine/impact/track";
import type { SwingArc } from "../../../src/engine/impact/types";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import { TEST_COUPLING, TEST_HEAD, socketAt } from "../support/impact";

const AIM = vec3(0.6, 0.8, 0);
const N = pitchAxis(AIM);

/** Rotation by `angle` about the shaft frame's pitch axis (body −y): a positive angle tilts the forward axis up. */
function shaftPitch(angle: number): Quaternion {
    return { w: Math.cos(angle / 2), x: 0, y: -Math.sin(angle / 2), z: 0 };
}

const conj = (q: Quaternion): Quaternion => ({ w: q.w, x: -q.x, y: -q.y, z: -q.z });
const dist = (a: Vec3, b: Vec3): number => length(sub(a, b));

/** A power roll's path: the arc speeding up while the pivot moves forward, the head pitched face-down. */
const ROLL: SwingArc = {
    pivot: vec3(2, 3, 1.5),
    pivotVelocity: scale(AIM, 0.3),
    pivotAcceleration: scale(AIM, 8),
    aim: AIM,
    radius: 0.8,
    theta0: -0.1,
    omega0: 3.5,
    alpha: 25,
    window: 0.03,
    shaftToHead: shaftPitch(-0.6),
};

const prepare = (arc: SwingArc) =>
    prepareTrack({ kind: "track", arc, coupling: TEST_COUPLING }, TEST_HEAD, STANDARD_GRAVITY);

/** The closed forms of design §3.2, with Math.* (the engine uses its own sinCos). */
function closedForm(arc: SwingArc, t: number) {
    const s = Math.min(t, arc.window);
    const u = Math.max(0, t - arc.window);
    const omegaEnd = arc.omega0 + arc.alpha * arc.window;
    const theta = arc.theta0 + arc.omega0 * s + 0.5 * arc.alpha * s * s + omegaEnd * u;
    const omega = t <= arc.window ? arc.omega0 + arc.alpha * t : omegaEnd;
    const V = add(arc.pivotVelocity, scale(arc.pivotAcceleration, s));
    const P = add(
        add(add(arc.pivot, scale(arc.pivotVelocity, s)), scale(arc.pivotAcceleration, 0.5 * s * s)),
        scale(V, u),
    );
    const radial = sub(scale(arc.aim, Math.sin(theta)), vec3(0, 0, Math.cos(theta)));
    const tangent = add(scale(arc.aim, Math.cos(theta)), vec3(0, 0, Math.sin(theta)));
    return {
        theta,
        omega,
        socket: add(P, scale(radial, arc.radius)),
        socketVelocity: add(V, scale(tangent, arc.radius * omega)),
    };
}

describe("the swing path", () => {
    const track = prepare(ROLL);

    it("follows the closed forms during and after the window", () => {
        for (const t of [0, 0.011, 0.03, 0.07]) {
            const p = pathAt(track, t);
            const c = closedForm(ROLL, t);
            expect(dist(p.socket, c.socket), `socket at ${t}`).toBeLessThan(1e-12);
            expect(dist(p.socketVelocity, c.socketVelocity), `velocity at ${t}`).toBeLessThan(1e-12);
            expect(dot(p.angularVelocity, N)).toBeCloseTo(c.omega, 12);
            expect(dot(p.angularAcceleration, N)).toBeCloseTo(t <= ROLL.window ? ROLL.alpha : 0, 12);
        }
    });

    it("is continuous at the window's end", () => {
        const before = pathAt(track, ROLL.window);
        const after = pathAt(track, ROLL.window + 1e-12);
        expect(dist(before.socket, after.socket)).toBeLessThan(1e-11);
        expect(dist(before.socketVelocity, after.socketVelocity)).toBeLessThan(1e-9);
        expect(dist(before.angularVelocity, after.angularVelocity)).toBeLessThan(1e-9);
    });

    it("differentiates consistently: velocity, acceleration and spin match central differences", () => {
        const h = 1e-6;
        for (const t of [0.012, 0.05]) {
            const lo = pathAt(track, t - h);
            const mid = pathAt(track, t);
            const hi = pathAt(track, t + h);
            expect(dist(scale(sub(hi.socket, lo.socket), 1 / (2 * h)), mid.socketVelocity)).toBeLessThan(1e-6);
            expect(dist(scale(sub(hi.socketVelocity, lo.socketVelocity), 1 / (2 * h)), mid.socketAcceleration))
                .toBeLessThan(1e-4);
            // hi ⊗ conj(lo) turns by 2h·|ω| about ω: its vector part is sin(h·|ω|)·ω̂ ≈ h·ω.
            const turn = multiply(hi.orientation, conj(lo.orientation));
            const spin = scale(vec3(turn.x, turn.y, turn.z), Math.sign(turn.w) / h);
            expect(dist(spin, mid.angularVelocity)).toBeLessThan(1e-6);
        }
    });

    it("holds the head's tilt while the pivot alone moves: a straight line at a constant orientation", () => {
        const push = prepare({ ...ROLL, omega0: 0, alpha: 0 });
        const start = pathAt(push, 0);
        for (const t of [0.01, 0.03, 0.08]) {
            const p = pathAt(push, t);
            expect(p.orientation).toEqual(start.orientation);
            const moved = sub(p.socket, start.socket);
            expect(length(cross(moved, AIM))).toBeLessThan(1e-12);
            expect(dot(moved, AIM)).toBeGreaterThan(0);
        }
    });

    it("brings a full check to rest at the window's end and holds it there", () => {
        const still = vec3(0, 0, 0);
        const check = prepare({
            ...ROLL,
            pivotVelocity: still,
            pivotAcceleration: still,
            alpha: -ROLL.omega0 / ROLL.window,
        });
        for (const t of [ROLL.window, 0.05, 0.12]) {
            expect(Math.abs(dot(pathAt(check, t).angularVelocity, N)), `at ${t}`).toBeLessThan(1e-12);
        }
        expect(dist(pathAt(check, 0.05).socket, pathAt(check, 0.12).socket)).toBeLessThan(1e-12);
    });

    it("turns the shaft frame's forward axis with the arc: the tangent to the socket's circle", () => {
        const level = prepare({ ...ROLL, shaftToHead: IDENTITY });
        for (const t of [0, 0.02, 0.06]) {
            const forward = rotate(pathAt(level, t).orientation, vec3(1, 0, 0));
            const theta = closedForm(ROLL, t).theta;
            expect(dist(forward, add(scale(AIM, Math.cos(theta)), vec3(0, 0, Math.sin(theta))))).toBeLessThan(1e-12);
        }
    });

    it("orients the path by swingOrientation, so the swing model can place a head on it", () => {
        expect(pathAt(track, 0).orientation).toEqual(swingOrientation(AIM, ROLL.shaftToHead, ROLL.theta0));
    });

    it("turns body x to any aim", () => {
        for (const angle of [0, 2, Math.PI, -Math.PI / 2, 7]) {
            const aim = vec3(Math.cos(angle), Math.sin(angle), 0);
            expect(dist(rotate(aimRotation(aim), vec3(1, 0, 0)), aim), `aim ${angle}`).toBeLessThan(1e-15);
        }
    });
});

describe("a head on the path", () => {
    const track = prepare(ROLL);

    it("has its socket on the path", () => {
        for (const t of [0, 0.02, 0.06]) {
            expect(dist(socketAt(headOnPath(track, TEST_HEAD, t), TEST_HEAD), pathAt(track, t).socket)).toBeLessThan(
                1e-14,
            );
        }
    });

    it("moves with the path's rigid motion: its velocity is its position's derivative", () => {
        const h = 1e-6;
        for (const t of [0.012, 0.05]) {
            const lo = headOnPath(track, TEST_HEAD, t - h);
            const hi = headOnPath(track, TEST_HEAD, t + h);
            const mid = headOnPath(track, TEST_HEAD, t);
            expect(dist(scale(sub(hi.position, lo.position), 1 / (2 * h)), mid.velocity)).toBeLessThan(1e-6);
            expect(mid.angularVelocity).toEqual(pathAt(track, t).angularVelocity);
        }
    });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/engine/impact/track.test.ts`
Expected: FAIL. The suite cannot import `../../../src/engine/impact/track` ("Failed to load url" / "Cannot find
module").

- [ ] **Step 4: Write `src/engine/impact/track.ts`**

```ts
/**
 * The tracked drive's path (P2b.2b.1 design §3.1, §3.2). The hands pull the mallet head's socket along a pendulum arc
 * in a vertical plane about a pivot (the top hand) that may itself move in that plane, and hold the head's orientation
 * to the arc's. Arc and pivot accelerate constantly for the drive window, then run on at the rates they reached.
 *
 * Frames. n = aim × ẑ is the pitch axis: a positive rotation about it tilts aim upward. The shaft frame's forward axis
 * lies along aim at θ = 0, the arc's lowest point, and turns with θ. The socket's target is
 * P + r·(sin θ·aim − cos θ·ẑ); the head's target orientation is rot(n, θ) ⊗ q_aim ⊗ shaftToHead, q_aim turning body x
 * to aim. Exact operations only (sinCos and atan2 from elementary.ts), like the rest of the engine.
 */
import { atan2, sinCos } from "../math/elementary";
import { add, cross, scale, sub, vec3, type Vec3 } from "../math/vec3";
import { multiply, rotate, type Quaternion } from "./rigidBody";
import type { HeadState, MalletHead, SwingArc, TrackDrive } from "./types";

const UP = vec3(0, 0, 1);

/** The pitch axis n = aim × ẑ of a horizontal unit `aim`: a positive rotation about it tilts aim upward. */
export function pitchAxis(aim: Vec3): Vec3 {
    return vec3(aim.y, 0 - aim.x, 0);
}

/** The rotation about ẑ that turns body x to the horizontal unit vector `aim`. */
export function aimRotation(aim: Vec3): Quaternion {
    const [s, c] = sinCos(atan2(aim.y, aim.x) / 2);
    return { w: c, x: 0, y: 0, z: s };
}

/** The rotation by `theta` about the horizontal unit `axis`. */
function pitch(axis: Vec3, theta: number): Quaternion {
    const [s, c] = sinCos(theta / 2);
    return { w: c, x: axis.x * s, y: axis.y * s, z: 0 };
}

/**
 * The head's orientation on the path at arc angle `theta`: rot(n, θ) ⊗ (q_aim ⊗ shaftToHead). pathAt computes it the
 * same way, so a head the swing model places with it starts exactly on the path.
 */
export function swingOrientation(aim: Vec3, shaftToHead: Quaternion, theta: number): Quaternion {
    return multiply(pitch(pitchAxis(aim), theta), multiply(aimRotation(aim), shaftToHead));
}

/**
 * A tracked drive prepared once (design §3.2, §3.3): the path's state at the window's end, from which it runs on, and
 * the coupling's gains for this head.
 */
export interface PreparedTrack {
    readonly kind: "track";
    readonly arc: SwingArc;
    /** The pitch axis n. */
    readonly axis: Vec3;
    /** q_aim ⊗ shaftToHead. */
    readonly base: Quaternion;
    readonly thetaEnd: number;
    readonly omegaEnd: number;
    readonly pivotEnd: Vec3;
    readonly pivotVelocityEnd: Vec3;
    /** k = γ·m·(2π/T)² and c = 2ζ·√(k·m) of the socket's spring–damper (N/m, N·s/m). */
    readonly stiffness: number;
    readonly damping: number;
    /** K_θ,i = γ·I_i·(2π/T)² and C_θ,i = 2ζ·√(K_θ,i·I_i) per principal axis, body frame. */
    readonly angularStiffness: Vec3;
    readonly angularDamping: Vec3;
    /** The share of the head's weight the hands carry, γ·m·g (N). */
    readonly carried: number;
}

/** Prepares `drive` for `head` under `gravity` (design §3.2, §3.3). */
export function prepareTrack(drive: TrackDrive, head: MalletHead, gravity: number): PreparedTrack {
    const { arc, coupling } = drive;
    const w = arc.window;
    const rate = (2 * Math.PI) / coupling.period;
    const gain = coupling.tension * rate * rate;
    const stiffness = gain * head.mass;
    const I = head.inertia;
    const angularStiffness = vec3(gain * I.x, gain * I.y, gain * I.z);
    const twice = 2 * coupling.dampingRatio;
    return {
        kind: "track",
        arc,
        axis: pitchAxis(arc.aim),
        base: multiply(aimRotation(arc.aim), arc.shaftToHead),
        thetaEnd: arc.theta0 + arc.omega0 * w + 0.5 * arc.alpha * w * w,
        omegaEnd: arc.omega0 + arc.alpha * w,
        pivotEnd: add(add(arc.pivot, scale(arc.pivotVelocity, w)), scale(arc.pivotAcceleration, 0.5 * w * w)),
        pivotVelocityEnd: add(arc.pivotVelocity, scale(arc.pivotAcceleration, w)),
        stiffness,
        damping: twice * Math.sqrt(stiffness * head.mass),
        angularStiffness,
        angularDamping: vec3(
            twice * Math.sqrt(angularStiffness.x * I.x),
            twice * Math.sqrt(angularStiffness.y * I.y),
            twice * Math.sqrt(angularStiffness.z * I.z),
        ),
        carried: coupling.tension * head.mass * gravity,
    };
}

/** The path at one instant: the socket's target and its derivatives, and the head's target orientation and spin. */
export interface PathPoint {
    readonly socket: Vec3;
    readonly socketVelocity: Vec3;
    readonly socketAcceleration: Vec3;
    readonly orientation: Quaternion;
    readonly angularVelocity: Vec3;
    readonly angularAcceleration: Vec3;
}

/**
 * The path at time t (design §3.2). During the window θ = θ₀ + ω₀·t + ½·α·t² and P = P₀ + V₀·t + ½·A·t²; after it, θ
 * and P run on from the window's end at the rates they reached. Evaluates sinCos(θ) and sinCos(θ/2).
 */
export function pathAt(track: PreparedTrack, t: number): PathPoint {
    const { arc } = track;
    let theta: number;
    let omega: number;
    let alpha: number;
    let P: Vec3;
    let V: Vec3;
    let A: Vec3;
    if (t <= arc.window) {
        theta = arc.theta0 + arc.omega0 * t + 0.5 * arc.alpha * t * t;
        omega = arc.omega0 + arc.alpha * t;
        alpha = arc.alpha;
        P = add(add(arc.pivot, scale(arc.pivotVelocity, t)), scale(arc.pivotAcceleration, 0.5 * t * t));
        V = add(arc.pivotVelocity, scale(arc.pivotAcceleration, t));
        A = arc.pivotAcceleration;
    } else {
        const u = t - arc.window;
        theta = track.thetaEnd + track.omegaEnd * u;
        omega = track.omegaEnd;
        alpha = 0;
        P = add(track.pivotEnd, scale(track.pivotVelocityEnd, u));
        V = track.pivotVelocityEnd;
        A = vec3(0, 0, 0);
    }
    const [s, c] = sinCos(theta);
    const radial = sub(scale(arc.aim, s), scale(UP, c));
    const tangent = add(scale(arc.aim, c), scale(UP, s));
    const r = arc.radius;
    return {
        socket: add(P, scale(radial, r)),
        socketVelocity: add(V, scale(tangent, r * omega)),
        socketAcceleration: sub(add(A, scale(tangent, r * alpha)), scale(radial, r * omega * omega)),
        orientation: multiply(pitch(track.axis, theta), track.base),
        angularVelocity: scale(track.axis, omega),
        angularAcceleration: scale(track.axis, alpha),
    };
}

/**
 * The head with its socket on the path at time t, moving with the path's rigid motion: its centre of mass at p + d,
 * d = q_path(−socket), with velocity v_p + ω × d and the path's spin.
 */
export function headOnPath(track: PreparedTrack, head: MalletHead, t: number): HeadState {
    const p = pathAt(track, t);
    const d = rotate(p.orientation, scale(head.socket, -1));
    return {
        position: add(p.socket, d),
        orientation: p.orientation,
        velocity: add(p.socketVelocity, cross(p.angularVelocity, d)),
        angularVelocity: p.angularVelocity,
    };
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/engine/impact/track.test.ts`
Expected: PASS, 10 tests. If a tolerance fails by a small factor, print the figure and report it; do not loosen it
silently.

- [ ] **Step 6: Format, check, commit**

Run `npx prettier --write` on the four files, then the four checks.

```bash
git add src/engine/impact/types.ts src/engine/impact/track.ts tests/engine/support/impact.ts tests/engine/impact/track.test.ts
git commit -F "$CLAUDE_TEMP_DIR/msg.txt"   # "Add the swing path of the tracked drive"
```

---

### Task 4: The tracked drive in the integrator

Spec §3.3–§3.5 and §3.7 (`hand`). Each step, the hands apply F = F_ff + k·(p − s) + c·(v_p − v_s) at the socket and
a couple τ_h. The end rule waits for the window and for the head to stop closing on any ball. The cap is
`TRACK_IMPACT_CAP`. The tests here use isolated set-ups (`integrate` directly); `ContactState` stays force-only until
Task 5.

**Files:**
- Modify: `src/engine/impact/track.ts`, `src/engine/impact/integrate.ts`, `tests/engine/support/impact.ts`,
  `tests/engine/impact/track.test.ts`

**Interfaces:**
- Consumes: Task 3's `PreparedTrack`, `pathAt`, `headOnPath`, `prepareTrack`; `contactReference.handCoupling*`
  (Task 2).
- Produces:
  - `HAND_COUPLING: { period: number; dampingRatio: number }`;
  - `interface HandLoad { force: Vec3; feedForward: Vec3; torque: Vec3 }`;
  - `handLoad(track: PreparedTrack, state: HeadState, head: MalletHead, t: number): HandLoad`;
  - `TRACK_IMPACT_CAP = 0.12`;
  - `ImpactSetup.drive: ForceDrive | PreparedTrack`;
  - `ImpactSnapshot.hand?: { force: Vec3; feedForward: Vec3 }`;
  - `levelArc(centre: Vec3, o?: ArcOptions): SwingArc` (support).

- [ ] **Step 1: Add the test helper**

In `tests/engine/support/impact.ts`, add `SwingArc` to the types import and, after `TEST_COUPLING`:

```ts
/** How `levelArc` meets a ball: SI units; the pivot's motion is along +x. */
export interface ArcOptions {
    readonly speed?: number;
    readonly radius?: number;
    readonly gap?: number;
    readonly alpha?: number;
    readonly window?: number;
    readonly pivotVelocity?: number;
    readonly pivotAcceleration?: number;
    readonly head?: MalletHead;
}

/**
 * An arc that brings a level test head, its +x face `gap` short of the ball centred at `centre`, to the ball at the
 * arc's lowest point, its centre of mass moving along +x at `speed` while the pivot is still.
 */
export function levelArc(centre: Vec3, o: ArcOptions = {}): SwingArc {
    const head = o.head ?? TEST_HEAD;
    const radius = o.radius ?? 0.8;
    const socket = add(vec3(centre.x - R - (o.gap ?? 1e-6) - head.length / 2, centre.y, centre.z), head.socket);
    const aim = vec3(1, 0, 0);
    return {
        pivot: vec3(socket.x, socket.y, socket.z + radius),
        pivotVelocity: scale(aim, o.pivotVelocity ?? 0),
        pivotAcceleration: scale(aim, o.pivotAcceleration ?? 0),
        aim,
        radius,
        theta0: 0,
        omega0: (o.speed ?? 3) / (radius + head.socket.z),
        alpha: o.alpha ?? 0,
        window: o.window ?? 0.01,
        shaftToHead: IDENTITY,
    };
}
```

- [ ] **Step 2: Write the failing tests**

Append to `tests/engine/impact/track.test.ts`, and extend its imports:

```ts
import { ZERO, horizontal } from "../../../src/engine/math/vec3";
import {
    IMPACT_DT,
    RELEASE_STEPS,
    TRACK_IMPACT_CAP,
    integrate,
    type ImpactBall,
    type ImpactProbe,
} from "../../../src/engine/impact/integrate";
import { HAND_COUPLING, type PreparedTrack } from "../../../src/engine/impact/track";
import type { ContactInterval, Coupling } from "../../../src/engine/impact/types";
import { contactReference } from "../../../src/reference/index";
import { TEST_BALL } from "../support/fixtures";
import { freeBall, isolated, levelArc, recorder } from "../support/impact";
```

(merge these into the existing import lines rather than repeating a module), then:

```ts
const R = TEST_BALL.radius;

/** Rotation angle (rad) taking orientation b to a: twice the size of the vector part of a ⊗ conj(b). */
function angleBetween(a: Quaternion, b: Quaternion): number {
    const e = multiply(a, conj(b));
    return 2 * length(vec3(e.x, e.y, e.z));
}

/** A coasting arc, the head pitched up 0.2 rad in the shaft frame, the pivot still. */
const COAST: SwingArc = {
    pivot: vec3(2, 3, 1.5),
    pivotVelocity: ZERO,
    pivotAcceleration: ZERO,
    aim: AIM,
    radius: 0.8,
    theta0: -0.3,
    omega0: 3.75,
    alpha: 0,
    window: 0.01,
    shaftToHead: shaftPitch(0.2),
};

/** The largest socket (m) and orientation (rad) errors from the path over an isolated run with no ball. */
function tracking(arc: SwingArc, dt = IMPACT_DT, cap = TRACK_IMPACT_CAP) {
    const track = prepare(arc);
    let socket = 0;
    let angle = 0;
    const probe: ImpactProbe = {
        step(s) {
            const p = pathAt(track, s.t);
            socket = Math.max(socket, dist(socketAt(s.head, TEST_HEAD), p.socket));
            angle = Math.max(angle, angleBetween(p.orientation, s.head.orientation));
        },
    };
    const start = headOnPath(track, TEST_HEAD, 0);
    const run = integrate(isolated({ start, drive: track, gravity: STANDARD_GRAVITY }), { probe, dt, cap });
    return { socket, angle, run };
}

describe("a tracked head with no ball", () => {
    it("reads its provisional coupling from the reference data", () => {
        expect(HAND_COUPLING).toEqual({
            period: contactReference.handCouplingPeriod.value,
            dampingRatio: contactReference.handCouplingDampingRatio.value,
        });
    });

    it("follows a coasting arc with a firm grip, to the integrator's own error", () => {
        const { socket, angle } = tracking(COAST);
        // Planning prototype (θ₀ = 0, no head pitch): 2.9e-7 m and 3.7e-8 rad.
        expect(socket).toBeLessThan(1e-6);
        expect(angle).toBeLessThan(1e-6);
    });

    it("follows a power roll's arc and its translating pivot", () => {
        const { socket, angle } = tracking(ROLL);
        // Planning prototype: 7.6e-7 m and 1.5e-6 rad.
        expect(socket).toBeLessThan(2e-6);
        expect(angle).toBeLessThan(3e-6);
    });

    it("converges on a full check as the step shrinks: the residual is the integrator's, not the feed-forward's", () => {
        const check: SwingArc = { ...COAST, alpha: -COAST.omega0 / COAST.window };
        const coarse = tracking(check, 1e-5, 0.06);
        const fine = tracking(check, 5e-6, 0.06);
        // Planning prototype at 5 µs: 7.4e-6 m and 4.7e-5 rad, semi-implicit Euler's O(dt·a) lag held by the coupling.
        expect(fine.socket).toBeLessThan(0.6 * coarse.socket);
        expect(fine.angle).toBeLessThan(0.6 * coarse.angle);
    });

    it("runs a whiff to TRACK_IMPACT_CAP", () => {
        const { run } = tracking(COAST);
        expect(run.events.map((e) => e.kind)).toEqual(["impact-cap"]);
        expect(run.duration).toBeGreaterThanOrEqual(TRACK_IMPACT_CAP);
        expect(run.duration).toBeLessThan(TRACK_IMPACT_CAP + 2 * IMPACT_DT);
    });

    it("reports the hand force and its feed-forward, equal for a head on the path", () => {
        const track = prepare(COAST);
        const probe = recorder();
        const start = headOnPath(track, TEST_HEAD, 0);
        integrate(isolated({ start, drive: track, gravity: STANDARD_GRAVITY }), { probe, cap: 1e-4 });
        const first = probe.snapshots[0];
        const hand = first?.hand as { force: Vec3; feedForward: Vec3 };
        expect(dist(hand.force, hand.feedForward)).toBeLessThan(1e-9);
        expect(first?.drive).toEqual(hand.force);
        const forced = recorder();
        integrate(isolated(), { probe: forced, cap: 1e-4 });
        expect(forced.snapshots[0]).not.toHaveProperty("hand");
    });
});

/** The vertical socket error from the path at each step's end, and the largest horizontal error. */
function settle(coupling: Coupling, lift: number, cap: number) {
    const STILL: SwingArc = {
        pivot: vec3(2, 3, 1.5),
        pivotVelocity: ZERO,
        pivotAcceleration: ZERO,
        aim: vec3(1, 0, 0),
        radius: 0.8,
        theta0: 0,
        omega0: 0,
        alpha: 0,
        window: 0.01,
        shaftToHead: IDENTITY,
    };
    const track: PreparedTrack = prepareTrack({ kind: "track", arc: STILL, coupling }, TEST_HEAD, STANDARD_GRAVITY);
    const errors: { t: number; e: number }[] = [];
    let sideways = 0;
    const probe: ImpactProbe = {
        step(s) {
            const d = sub(socketAt(s.head, TEST_HEAD), pathAt(track, s.t).socket);
            errors.push({ t: s.t, e: d.z });
            sideways = Math.max(sideways, length(horizontal(d)));
        },
    };
    const start = headOnPath(track, TEST_HEAD, 0);
    const lifted = { ...start, position: add(start.position, vec3(0, 0, lift)) };
    integrate(isolated({ start: lifted, drive: track, gravity: STANDARD_GRAVITY }), { probe, cap });
    return { errors, sideways, track };
}

/** A damped oscillator from x(0) = x0 + offset at rest, settling to `offset`. */
function oscillator(x0: number, offset: number, omega: number, zeta: number, t: number): number {
    const root = Math.sqrt(1 - zeta * zeta);
    const wd = omega * root;
    return x0 * Math.exp(-zeta * omega * t) * (Math.cos(wd * t) + (zeta / root) * Math.sin(wd * t)) + offset;
}

describe("the hands' spring–damper", () => {
    it("returns a head started 1 mm off the path as the damped oscillator of period T and ratio ζ predicts", () => {
        // The offset lies along the socket's arm (body z), so the spring's moment is zero and the motion is 1-D.
        const { errors, sideways } = settle(TEST_COUPLING, 1e-3, 0.06);
        const omega = (2 * Math.PI) / TEST_COUPLING.period;
        for (const { t, e } of errors) {
            // Planning prototype: within 2.9e-4 of the amplitude.
            expect(Math.abs(e - oscillator(1e-3, 0, omega, TEST_COUPLING.dampingRatio, t))).toBeLessThan(1e-5);
        }
        expect(sideways).toBeLessThan(1e-12);
    });

    it("lets a relaxed grip sag towards (1 − γ)·m·g/k below the path", () => {
        const coupling = { ...TEST_COUPLING, tension: 0.5 };
        const { errors, track } = settle(coupling, 0, TRACK_IMPACT_CAP);
        const sag = (0.5 * TEST_HEAD.mass * STANDARD_GRAVITY) / track.stiffness;
        const omega = Math.sqrt(0.5) * ((2 * Math.PI) / coupling.period);
        for (const { t, e } of errors) {
            // Planning prototype: within 2.0e-4 of the sag.
            expect(Math.abs(e - oscillator(sag, -sag, omega, coupling.dampingRatio, t))).toBeLessThan(0.01 * sag);
        }
        const last = errors[errors.length - 1] as { e: number };
        expect(Math.abs(last.e + sag)).toBeLessThan(1e-3 * sag);
    });
});

describe("the tracked end rule", () => {
    const BALL = vec3(0, 0, 1);

    function strikeRun(balls: ImpactBall[], cap?: number) {
        const arc = levelArc(BALL);
        const track = prepareTrack({ kind: "track", arc, coupling: TEST_COUPLING }, TEST_HEAD, 0);
        return { arc, run: integrate(isolated({ start: headOnPath(track, TEST_HEAD, 0), drive: track, balls }), { cap }) };
    }

    it("ends a clean single-ball strike within RELEASE_STEPS of the window's end or the ball outrunning the head", () => {
        const { arc, run } = strikeRun([freeBall("blue", BALL)]);
        const faces = run.timeline["face/blue"] ?? [];
        expect(faces).toHaveLength(1);
        const settled = Math.max(arc.window, (faces[0] as ContactInterval).end);
        expect(run.duration).toBeGreaterThanOrEqual(settled);
        expect(run.duration).toBeLessThanOrEqual(settled + (RELEASE_STEPS + 1) * IMPACT_DT);
        expect(run.events).toEqual([]);
    });

    it("integrates a straight croquet drive's re-contact rather than flagging it", () => {
        const { run } = strikeRun([freeBall("blue", BALL), freeBall("red", vec3(2 * R, 0, 1))]);
        expect((run.timeline["face/blue"] ?? []).length).toBeGreaterThanOrEqual(2);
        expect(run.events.map((e) => e.kind)).toEqual([]);
    });

    it("keeps running while the head closes on a ball, and flags it if the cap comes first", () => {
        // At 2 ms the striker's ball has left the croqueted ball slower than the head, which is closing on it.
        const { run } = strikeRun([freeBall("blue", BALL), freeBall("red", vec3(2 * R, 0, 1))], 2e-3);
        expect(run.events.map((e) => e.kind)).toEqual(["impact-cap", "impact-head-approaching"]);
    });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/engine/impact/track.test.ts`
Expected: FAIL. `HAND_COUPLING` and `TRACK_IMPACT_CAP` are undefined. The tracked runs throw inside `driveAt`
(`Cannot read properties of undefined (reading 'length')`), because `integrate` still reads `setup.drive.samples`.

- [ ] **Step 4: Add the coupling constant and the hand load to `track.ts`**

Add to the imports `import { contactReference } from "../../reference/index";` and `rotateInverse`, and add after
`UP`:

```ts
/**
 * The hands' grip on the head, period (s) and damping ratio of a firm grip (design §3.4). Provisional: the shortest
 * period at damping ratio 0.7 for which the hands' impulse in a 3 m/s centre strike is at most 5 % of the transfer
 * (reference/contact.json). P2b.2b.2 sources or fits it.
 */
export const HAND_COUPLING = {
    period: contactReference.handCouplingPeriod.value,
    dampingRatio: contactReference.handCouplingDampingRatio.value,
} as const;
```

Extend the file header with:

```ts
 *
 * The hand load (design §3.3). Each step the hands apply F = F_ff + k·(p − s) + c·(v_p − v_s) at the socket and a
 * couple τ_h = τ_ff + K_θ·θ_err + C_θ·(ω_path − ω) about the centre of mass, per principal axis in the body frame. The
 * feed-forward is the wrench that makes the path's rigid motion exact: F_ff = m·a_c + γ·m·g·ẑ and
 * τ_ff = I·α_path + ω_path × (I·ω_path) − r_s × F_ff. The spring and damper act only on what the balls and the turf
 * do to the head; a relaxed grip (γ < 1) carries γ of the head's weight and holds it more softly.
```

and append:

```ts
/** The hands' load in one step (design §3.3, §3.7). */
export interface HandLoad {
    /** F, at the socket, world frame. */
    readonly force: Vec3;
    /** F_ff, F's feed-forward part. */
    readonly feedForward: Vec3;
    /** τ_h about the centre of mass, world frame; F's own moment r_s × F is not included. */
    readonly torque: Vec3;
}

/** θ_err = 2·sign(w)·vec(target ⊗ q̄), w the product's scalar part: the rotation taking q to `target` (world frame). */
function rotationError(target: Quaternion, q: Quaternion): Vec3 {
    const e = multiply(target, { w: q.w, x: 0 - q.x, y: 0 - q.y, z: 0 - q.z });
    const k = e.w < 0 ? -2 : 2;
    return vec3(k * e.x, k * e.y, k * e.z);
}

/** The hands' load on the head in `state` at time t (design §3.3). */
export function handLoad(track: PreparedTrack, state: HeadState, head: MalletHead, t: number): HandLoad {
    const path = pathAt(track, t);
    const w = path.angularVelocity;
    const d = rotate(path.orientation, scale(head.socket, -1));
    const pathAcceleration = add(
        add(path.socketAcceleration, cross(path.angularAcceleration, d)),
        cross(w, cross(w, d)),
    );
    const feedForward = add(scale(pathAcceleration, head.mass), vec3(0, 0, track.carried));
    const arm = rotate(state.orientation, head.socket);
    const socket = add(state.position, arm);
    const socketVelocity = add(state.velocity, cross(state.angularVelocity, arm));
    const force = add(
        add(feedForward, scale(sub(path.socket, socket), track.stiffness)),
        scale(sub(path.socketVelocity, socketVelocity), track.damping),
    );
    const q = state.orientation;
    const I = head.inertia;
    const wb = rotateInverse(q, w);
    const ab = rotateInverse(q, path.angularAcceleration);
    const inertial = add(
        vec3(I.x * ab.x, I.y * ab.y, I.z * ab.z),
        cross(wb, vec3(I.x * wb.x, I.y * wb.y, I.z * wb.z)),
    );
    const error = rotateInverse(q, rotationError(path.orientation, q));
    const lag = rotateInverse(q, sub(w, state.angularVelocity));
    const K = track.angularStiffness;
    const C = track.angularDamping;
    const spring = vec3(K.x * error.x + C.x * lag.x, K.y * error.y + C.y * lag.y, K.z * error.z + C.z * lag.z);
    const body = sub(add(inertial, spring), cross(head.socket, rotateInverse(q, feedForward)));
    return { force, feedForward, torque: rotate(q, body) };
}
```

- [ ] **Step 5: Drive the integrator with it**

In `src/engine/impact/integrate.ts`:

Imports: add `type ForceDrive` to the `./types` import, and
`import { handLoad, type HandLoad, type PreparedTrack } from "./track";`.

In the file header, item 1 becomes:

```ts
 * 1. computes every force from the current state: the hands' load at the socket (a force table, or a tracked drive's
 *    spring–damper with its feed-forward, track.ts) and gravity, then each closed pair in pair-list order;
```

and after the end-rule paragraph (ending "…discards at most m·g·δ₀/2 (design §6).") add:

```ts
 * A tracked drive (P2b.2b.1 design §3.5) ends on the same conditions, the arc's window standing for the drive's, and
 * only once the head is no longer closing on any ball within reach (headClosing): a re-contact is integrated, not
 * flagged. Its cap is TRACK_IMPACT_CAP.
```

After `IMPACT_CAP`, add:

```ts
/**
 * Longest impact (s) of a tracked drive (P2b.2b.1 design §3.5): about twice the 58 ms longest roll contact the Croquet
 * Association measured, so that a roll's push and a drive's re-contact are integrated. A force table keeps IMPACT_CAP.
 */
export const TRACK_IMPACT_CAP = 0.12;
```

In `WAKE_MARGIN`'s comment, replace "at the default IMPACT_DT and IMPACT_CAP (12,000 steps) it stays near 1e-11 m, so
the margin keeps about 100× headroom" with "at the default IMPACT_DT and TRACK_IMPACT_CAP (24,000 steps) it stays near
2e-11 m, so the margin keeps about 50× headroom".

In `ImpactSetup`, the drive becomes:

```ts
    /** The hands: a force table, or a tracked drive prepared once (track.ts). */
    readonly drive: ForceDrive | PreparedTrack;
```

In `ImpactSnapshot`, document `drive` and add `hand`:

```ts
    /** The hands' force at the socket: the force table's value, or a tracked drive's F. */
    readonly drive: Vec3;
```

```ts
    /** A tracked drive's F and its feed-forward F_ff (P2b.2b.1 design §3.7); absent for a force table. */
    readonly hand?: { readonly force: Vec3; readonly feedForward: Vec3 };
```

(`hand` goes after `contacts`, so that a force table's snapshot keeps its keys and their order.)

Add a helper above `integrate`:

```ts
/** True while the head is closing on any ball within reach (headClosing): a tracked impact runs on (design §3.5). */
function closingOnAny(state: HeadState, head: MalletHead, balls: readonly BallState[], radius: number): boolean {
    return balls.some((s) => headClosing(state, head, s, radius));
}
```

In `integrate`, replace the lines from `const dt = …` to `const driveEnd = …` with:

```ts
    const dt = options.dt ?? IMPACT_DT;
    const { head, ball, drive: plan } = setup;
    const cap = options.cap ?? (plan.kind === "force" ? IMPACT_CAP : TRACK_IMPACT_CAP);
    const R = ball.radius;
    const ballInertia = 0.4 * ball.mass * R * R;
    const driveEnd = plan.kind === "force" ? (plan.samples[plan.samples.length - 1] as DriveSample).t : plan.arc.window;
```

Replace the start of the loop body, from `const t = steps * dt;` to the end of the `loads` initialiser, with:

```ts
        const t = steps * dt;
        let drive: Vec3;
        let headTorque: Vec3;
        let hand: HandLoad | null = null;
        if (plan.kind === "force") {
            drive = driveAt(plan.samples, t);
            headTorque = cross(rotate(state.orientation, head.socket), drive);
        } else {
            hand = handLoad(plan, state, head, t);
            drive = hand.force;
            headTorque = add(cross(rotate(state.orientation, head.socket), drive), hand.torque);
        }
        const loads: StepLoads = {
            headForce: add(drive, headWeight),
            headTorque,
            forces: balls.map(() => ballWeight),
            torques: balls.map(() => ZERO),
        };
```

(The force-table branch computes exactly what the loop computed before, so force tables stay bit-identical.) Replace
the probe call with:

```ts
        if (options.probe) {
            const snapshot: ImpactSnapshot = { t: now, drive, head: state, balls: [...balls], contacts: samples };
            options.probe.step(
                hand === null ? snapshot : { ...snapshot, hand: { force: hand.force, feedForward: hand.feedForward } },
            );
        }
```

and the end test with:

```ts
        quiet = hardClosed ? 0 : quiet + 1;
        const released = struck && now >= driveEnd && quiet >= RELEASE_STEPS && !turfMoving;
        if (released && (plan.kind === "force" || !closingOnAny(state, head, balls, R))) {
            break;
        }
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/engine/impact/track.test.ts`
Expected: PASS. If a behaviour test (re-contact, cap) fails, print `run.timeline` and `run.events` and report them
before changing anything.

Run: `npm test`, `npm run check`, `npm run lint`
Expected: all pass.

- [ ] **Step 7: Verify force tables are bit-identical**

Run: `env OBSTACLE_STROKES=2000 npx --yes tsx scripts/impactDigest.ts > "$CLAUDE_TEMP_DIR/digest-4.txt"`
Run: `cmp "$CLAUDE_TEMP_DIR/digest-base.txt" "$CLAUDE_TEMP_DIR/digest-4.txt"`
Expected: no output.

- [ ] **Step 8: Format, check, commit**

```bash
git add src/engine/impact/track.ts src/engine/impact/integrate.ts tests/engine/support/impact.ts tests/engine/impact/track.test.ts
git commit -F "$CLAUDE_TEMP_DIR/msg.txt"   # "Drive the impact along a tracked swing path"
```

---

### Task 5: Tracked contact states: the `Drive` union, validation and preparation

Spec §3.1 and §3.6. `ContactState.drive` becomes `ForceDrive | TrackDrive`. `validateImpact` checks a tracked
drive, and `prepareImpact` prepares it once.

**Files:**
- Modify: `src/engine/impact/types.ts`, `src/engine/impact/simulateImpact.ts`, `tests/engine/support/impact.ts`,
  `tests/engine/impact/simulateImpact.test.ts`

**Interfaces:**
- Consumes: `prepareTrack`, `pitchAxis`, `headOnPath` (Tasks 3, 4).
- Produces:
  - `type Drive = ForceDrive | TrackDrive`;
  - `onArc(arc: SwingArc, coupling?: Coupling, head?: MalletHead, face?: FaceMaterial): ContactState` (support);
  - `mirrorContact`, which also mirrors a tracked drive.

- [ ] **Step 1: Add the support helper**

In `tests/engine/support/impact.ts`, add `TrackDrive` and `Drive` to the types import,
`import { headOnPath, prepareTrack } from "../../../src/engine/impact/track";`, and after `levelArc`:

```ts
/** A tracked contact state: `head` on `arc`'s path at t = 0, held by `coupling`, with `face`. */
export function onArc(
    arc: SwingArc,
    coupling: Coupling = TEST_COUPLING,
    head: MalletHead = TEST_HEAD,
    face: FaceMaterial = TEST_FACE,
): ContactState {
    const drive: TrackDrive = { kind: "track", arc, coupling };
    return { head, face, ...headOnPath(prepareTrack(drive, head, STANDARD_GRAVITY), head, 0), drive };
}
```

Replace `mirrorContact` with:

```ts
/**
 * The drive reflected across y = 0. A tracked drive's shaftToHead is reflected as an orientation is: the path's
 * orientation rot(n, θ) ⊗ q_aim ⊗ shaftToHead reflects factor by factor.
 */
function mirrorDrive(d: Drive): Drive {
    if (d.kind === "force") {
        return { kind: "force", samples: d.samples.map((s) => ({ t: s.t, force: mirrorVec(s.force) })) };
    }
    const { arc } = d;
    return {
        ...d,
        arc: {
            ...arc,
            pivot: mirrorVec(arc.pivot),
            pivotVelocity: mirrorVec(arc.pivotVelocity),
            pivotAcceleration: mirrorVec(arc.pivotAcceleration),
            aim: mirrorVec(arc.aim),
            shaftToHead: mirrorQuat(arc.shaftToHead),
        },
    };
}

export function mirrorContact(c: ContactState): ContactState {
    return {
        ...c,
        position: mirrorVec(c.position),
        orientation: mirrorQuat(c.orientation),
        velocity: mirrorVec(c.velocity),
        angularVelocity: mirrorSpin(c.angularVelocity),
        drive: mirrorDrive(c.drive),
    };
}
```

- [ ] **Step 2: Write the failing tests**

Append to `tests/engine/impact/simulateImpact.test.ts`, extending the imports with `add` (vec3), `Coupling`,
`SwingArc` (types) and `TEST_COUPLING`, `levelArc`, `onArc` (support):

```ts
describe("simulateImpact with a tracked drive", () => {
    const ARC = levelArc(BLUE.position);
    const tracked = onArc(ARC);
    const withArc = (over: Partial<SwingArc>): ContactState => ({
        ...tracked,
        drive: { kind: "track", arc: { ...ARC, ...over }, coupling: TEST_COUPLING },
    });
    const withCoupling = (over: Partial<Coupling>): ContactState => ({
        ...tracked,
        drive: { kind: "track", arc: ARC, coupling: { ...TEST_COUPLING, ...over } },
    });

    it("runs a tracked strike and hands the ball over moving", () => {
        const result = simulateImpact(tracked, { blue: BLUE }, WORLD);
        expect(result.handover.blue?.velocity.x).toBeGreaterThan(0);
        expect(result.events.some((e) => e.kind === "impact-cap")).toBe(false);
        expect(result.duration).toBeGreaterThanOrEqual(ARC.window);
    });

    it("accepts a head that does not start on its path", () => {
        const off = { ...tracked, position: add(tracked.position, vec3(-1e-3, 0, 1e-3)) };
        expect(() => simulateImpact(off, { blue: BLUE }, WORLD)).not.toThrow();
    });

    it("prepares the path once", () => {
        const setup = prepareImpact(tracked, { blue: BLUE }, WORLD);
        expect(setup.drive.kind).toBe("track");
        expect(setup.drive.kind === "track" && setup.drive.thetaEnd).toBe(ARC.omega0 * ARC.window);
    });

    const rejections: readonly [string, ContactState, RegExp][] = [
        ["a non-positive radius", withArc({ radius: 0 }), /arc\.radius/],
        ["a non-positive window", withArc({ window: 0 }), /arc\.window/],
        ["a non-finite arc rate", withArc({ omega0: NaN }), /arc\.omega0 must be finite/],
        ["a non-finite pivot", withArc({ pivot: vec3(NaN, 0, 1) }), /arc\.pivot must be finite/],
        ["an aim that is not unit", withArc({ aim: vec3(1.1, 0, 0) }), /arc\.aim must be a horizontal unit vector/],
        ["an aim that is not horizontal", withArc({ aim: vec3(0.8, 0, 0.6) }), /arc\.aim/],
        ["a shaftToHead that is not unit", withArc({ shaftToHead: { w: 1.1, x: 0, y: 0, z: 0 } }), /arc\.shaftToHead/],
        ["a non-positive period", withCoupling({ period: 0 }), /coupling\.period/],
        ["a negative damping ratio", withCoupling({ dampingRatio: -0.1 }), /coupling\.dampingRatio/],
        ["a zero tension", withCoupling({ tension: 0 }), /coupling\.tension/],
        ["a tension above 1", withCoupling({ tension: 1.5 }), /coupling\.tension/],
        [
            "a pivot velocity out of the swing plane",
            withArc({ pivotVelocity: vec3(0, 0.1, 0) }),
            /arc\.pivotVelocity must lie in the swing plane/,
        ],
        [
            "a pivot acceleration out of the swing plane",
            withArc({ pivotAcceleration: vec3(0, 1, 0) }),
            /arc\.pivotAcceleration must lie in the swing plane/,
        ],
    ];

    it.each(rejections)("rejects %s", (_name, contact, pattern) => {
        expect(() => simulateImpact(contact, { blue: BLUE }, WORLD)).toThrow(pattern);
    });
});
```

(`thetaEnd` is θ₀ + ω₀·w + ½·0·w² with θ₀ = 0: exactly ω₀·w.)

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/engine/impact/simulateImpact.test.ts`
Expected: FAIL. The new suite errors at collection with `onArc is not a function`, or `simulateImpact` throws
`drive must start at t = 0` on the tracked contacts (it reads `samples` of a track drive).

- [ ] **Step 4: Widen the union**

In `src/engine/impact/types.ts`, change `Drive` to:

```ts
/** What the hands do to the head during the impact (P2b.2b.1 design §3.1): a force table, or a tracked drive. */
export type Drive = ForceDrive | TrackDrive;
```

- [ ] **Step 5: Validate and prepare tracked drives**

In `src/engine/impact/simulateImpact.ts`:

Imports: `dot` (vec3); `import { pitchAxis, prepareTrack } from "./track";`;
`import type { Quaternion } from "./rigidBody";` (keep `rotateInverse` imported as a value); and the types import
becomes `import type { ContactState, DriveSample, ForceDrive, ImpactResult, TrackDrive } from "./types";`.

Add after `finite`:

```ts
function finiteNumber(value: number, name: string): void {
    if (!Number.isFinite(value)) {
        fail(`${name} must be finite (got ${value})`);
    }
}

function unitQuaternion(q: Quaternion, name: string): void {
    if (!(Math.abs(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z - 1) <= UNIT_TOLERANCE)) {
        fail(`${name} must be a unit quaternion`);
    }
}

/** Checks a force table: not empty, starting at t = 0, times increasing strictly, every force finite. */
function validateForce(drive: ForceDrive): void {
    const { samples } = drive;
    if (samples.length === 0 || (samples[0] as DriveSample).t !== 0) {
        fail("drive must start at t = 0");
    }
    samples.forEach((s, i) => {
        finite(s.force, `drive[${i}].force`);
        if (!Number.isFinite(s.t) || (i > 0 && !(s.t > (samples[i - 1] as DriveSample).t))) {
            fail("drive times must increase strictly");
        }
    });
}

/**
 * Checks a tracked drive (P2b.2b.1 design §3.6): every number finite; a positive radius and window; aim a horizontal
 * unit vector and shaftToHead a unit quaternion, within UNIT_TOLERANCE; a positive period, a non-negative damping
 * ratio and a tension in (0, 1]; the pivot's velocity and acceleration in the swing plane, their component along the
 * pitch axis within UNIT_TOLERANCE of their size.
 */
function validateTrack(drive: TrackDrive): void {
    const { arc, coupling } = drive;
    finite(arc.pivot, "arc.pivot");
    finite(arc.pivotVelocity, "arc.pivotVelocity");
    finite(arc.pivotAcceleration, "arc.pivotAcceleration");
    finite(arc.aim, "arc.aim");
    finiteNumber(arc.theta0, "arc.theta0");
    finiteNumber(arc.omega0, "arc.omega0");
    finiteNumber(arc.alpha, "arc.alpha");
    positive(arc.radius, "arc.radius");
    positive(arc.window, "arc.window");
    const { aim } = arc;
    if (!(Math.abs(aim.z) <= UNIT_TOLERANCE && Math.abs(dot(aim, aim) - 1) <= UNIT_TOLERANCE)) {
        fail("arc.aim must be a horizontal unit vector");
    }
    unitQuaternion(arc.shaftToHead, "arc.shaftToHead");
    positive(coupling.period, "coupling.period");
    friction(coupling.dampingRatio, "coupling.dampingRatio");
    restitution(coupling.tension, "coupling.tension");
    const n = pitchAxis(aim);
    if (!(Math.abs(dot(arc.pivotVelocity, n)) <= UNIT_TOLERANCE * length(arc.pivotVelocity))) {
        fail("arc.pivotVelocity must lie in the swing plane");
    }
    if (!(Math.abs(dot(arc.pivotAcceleration, n)) <= UNIT_TOLERANCE * length(arc.pivotAcceleration))) {
        fail("arc.pivotAcceleration must lie in the swing plane");
    }
}
```

In `validateImpact`, replace the orientation check with `unitQuaternion(contact.orientation, "orientation");`, and
the drive checks (Task 1's block) with:

```ts
    if (contact.drive.kind === "force") {
        validateForce(contact.drive);
    } else {
        validateTrack(contact.drive);
    }
```

Add to its header list, after the drive item:

```ts
 * - a tracked drive whose arc or coupling is out of range (P2b.2b.1 design §3.6; the head need not start on the path);
```

In `prepareImpact`, the drive becomes:

```ts
        drive: contact.drive.kind === "force" ? contact.drive : prepareTrack(contact.drive, contact.head, gravity),
```

- [ ] **Step 6: Run the tests, verify bit-identity**

Run: `npm test`, `npm run check`, `npm run lint`
Expected: all pass.

Run: `env OBSTACLE_STROKES=2000 npx --yes tsx scripts/impactDigest.ts > "$CLAUDE_TEMP_DIR/digest-5.txt"`
Run: `cmp "$CLAUDE_TEMP_DIR/digest-base.txt" "$CLAUDE_TEMP_DIR/digest-5.txt"`
Expected: no output.

- [ ] **Step 7: Format, check, commit**

```bash
git add src/engine/impact/types.ts src/engine/impact/simulateImpact.ts tests/engine/support/impact.ts tests/engine/impact/simulateImpact.test.ts
git commit -F "$CLAUDE_TEMP_DIR/msg.txt"   # "Validate and prepare tracked contact states"
```

---

### Task 6: Mallet–turf contact

Spec §4 and §3.7 (`headTurf`). For a tracked drive, the head gets a `head/turf` pair after every other pair. It uses
the turf's clamped spring–dashpot with the head's mass and Cundall–Strack friction with `HEAD_TURF_FRICTION`, acting
at the head's lowest point. It records an interval timeline, a peak penetration and the slide, and raises
`impact-head-deep` past 2 mm. A force table keeps raising `impact-mallet-grounded` and gets no pair.

**Files:**
- Modify: `src/engine/impact/contacts.ts`, `src/engine/impact/types.ts`, `src/engine/impact/integrate.ts`,
  `src/engine/impact/simulateImpact.ts`, `tests/engine/support/impact.ts`, `tests/engine/impact/contacts.test.ts`
- Create: `tests/engine/impact/headTurf.test.ts`

**Interfaces:**
- Consumes: `contactReference.headTurfFriction` and `.headDeepLimit` (Task 2); `lawFromStiffness`.
- Produces:
  - `HEAD_TURF_KEY = "head/turf"`;
  - `headBottom(state: HeadState, head: MalletHead): Vec3`;
  - `headTurfContact(state: HeadState, head: MalletHead): Penetration | null`;
  - `ImpactSetup.headTurf: PairLaw | null`;
  - `ImpactSnapshot.headTurf?: Vec3`;
  - `ImpactRun.headTurfSlide?: number`;
  - the `{ kind: "impact-head-deep"; t: number }` event;
  - `HEAD_DEEP_LIMIT` (integrate.ts) and `HEAD_TURF_FRICTION` (simulateImpact.ts).

- [ ] **Step 1: Write the failing tests**

Append to `tests/engine/impact/contacts.test.ts` (add `HEAD_TURF_KEY`, `headBottom`, `headTurfContact` to its contacts
import, and `TEST_HEAD` from `../support/impact`; import `axisAngle`, `IDENTITY` and `rotate` from rigidBody if
absent):

```ts
describe("the head's lowest point and its turf contact", () => {
    const centre = vec3(1, 2, 0.05);
    const at = (orientation: Quaternion) => ({
        position: centre,
        orientation,
        velocity: vec3(0, 0, 0),
        angularVelocity: vec3(0, 0, 0),
    });

    it("lies under the centre for a level head", () => {
        expect(headBottom(at(IDENTITY), TEST_HEAD)).toEqual(vec3(1, 2, 0.05 - TEST_HEAD.radius));
    });

    it("is the lower end's rim for a tilted head, as low as headLowestPoint says", () => {
        // Front face tilted up 0.3 rad: the rear (−x) end is lower.
        const q = axisAngle(vec3(0, 1, 0), -0.3);
        const p = headBottom(at(q), TEST_HEAD);
        const axis = rotate(q, vec3(1, 0, 0));
        expect(p.z).toBeCloseTo(headLowestPoint(at(q), TEST_HEAD), 15);
        expect(dot(sub(p, centre), axis)).toBeCloseTo(-TEST_HEAD.length / 2, 15);
    });

    it("closes only below the turf, acting upward at the lowest point", () => {
        expect(headTurfContact(at(IDENTITY), TEST_HEAD)).toBeNull();
        const low = { ...at(IDENTITY), position: vec3(1, 2, TEST_HEAD.radius - 1e-4) };
        const contact = headTurfContact(low, TEST_HEAD);
        expect(contact?.normal).toEqual(vec3(0, 0, 1));
        expect(contact?.depth).toBeCloseTo(1e-4, 15);
        expect(contact?.point).toEqual(headBottom(low, TEST_HEAD));
        expect(HEAD_TURF_KEY).toBe("head/turf");
    });
});
```

Create `tests/engine/impact/headTurf.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { lawFromStiffness } from "../../../src/engine/impact/contactLaw";
import { HEAD_TURF_KEY, headLowestPoint } from "../../../src/engine/impact/contacts";
import {
    HEAD_DEEP_LIMIT,
    IMPACT_DT,
    TRACK_IMPACT_CAP,
    integrate,
    type ImpactSnapshot,
} from "../../../src/engine/impact/integrate";
import { IDENTITY, axisAngle, type Quaternion } from "../../../src/engine/impact/rigidBody";
import { HEAD_TURF_FRICTION, prepareImpact } from "../../../src/engine/impact/simulateImpact";
import { headOnPath, prepareTrack } from "../../../src/engine/impact/track";
import type { TrackDrive } from "../../../src/engine/impact/types";
import { ZERO, length, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import { TEST_TURF, ballAt, testWorld } from "../support/fixtures";
import { TEST_COUPLING, TEST_HEAD, isolated, levelArc, onArc, recorder, strike } from "../support/impact";

const g = STANDARD_GRAVITY;
const MU = 0.5;
const LAW = lawFromStiffness(TEST_HEAD.mass, TEST_TURF.turfRestitution, TEST_TURF.turfStiffness, MU);
/** Where the turf carries the head's whole weight: m·g/k. */
const SINK = (TEST_HEAD.mass * g) / TEST_TURF.turfStiffness;

/** An undriven head with its centre at height z, falling under gravity onto the test turf. */
function onTurf(z: number, velocity: Vec3 = ZERO, orientation: Quaternion = IDENTITY) {
    return isolated({
        start: { position: vec3(0, 0, z), orientation, velocity, angularVelocity: ZERO },
        gravity: g,
        headTurf: LAW,
    });
}

describe("the head–turf pair", () => {
    it("settles a level head lowered onto the turf at m·g/k, without turning it", () => {
        const probe = recorder();
        const run = integrate(onTurf(TEST_HEAD.radius), { cap: 0.05, probe });
        expect(Math.abs(0 - headLowestPoint(run.head, TEST_HEAD) - SINK) / SINK).toBeLessThan(0.01);
        expect(length(run.head.angularVelocity)).toBe(0);
        expect(run.timeline[HEAD_TURF_KEY]).toHaveLength(1);
        expect(run.peakPenetration[HEAD_TURF_KEY]).toBeGreaterThan(SINK);
        expect(run.events.map((e) => e.kind)).toEqual(["impact-cap"]);
        expect(probe.snapshots[0]?.headTurf).toEqual(ZERO);
        const last = probe.snapshots[probe.snapshots.length - 1] as ImpactSnapshot;
        expect(Math.abs((last.headTurf as Vec3).z - TEST_HEAD.mass * g) / (TEST_HEAD.mass * g)).toBeLessThan(0.01);
    });

    it("slows a head sliding sideways at μ·g while it slides, and records the slide's closed form", () => {
        // Sliding along body y at the static sink: friction at the barrel's bottom line also spins the head about its
        // axis, so its bottom slips at v₀ − 3·μ·g·t (I = m·r²/2) and stops slipping at t = v₀/(3·μ·g), having slid
        // v₀²/(6·μ·g).
        const v0 = 1;
        const probe = recorder();
        const run = integrate(onTurf(TEST_HEAD.radius - SINK, vec3(0, v0, 0)), { cap: 0.1, probe });
        const stops = v0 / (3 * MU * g);
        const mid = probe.snapshots.find((s) => s.t >= stops / 2) as ImpactSnapshot;
        const expected = v0 - MU * g * mid.t;
        expect(Math.abs(mid.head.velocity.y - expected) / (MU * g * mid.t)).toBeLessThan(0.01);
        const slide = (v0 * v0) / (6 * MU * g);
        expect(Math.abs((run.headTurfSlide as number) - slide) / slide).toBeLessThan(0.01);
    });

    it("raises impact-head-deep just over HEAD_DEEP_LIMIT, and not just under", () => {
        const over = integrate(onTurf(TEST_HEAD.radius - HEAD_DEEP_LIMIT - 1e-6), { cap: 1e-3 });
        expect(over.events.filter((e) => e.kind === "impact-head-deep").map((e) => e.t)).toEqual([IMPACT_DT]);
        expect(over.events.some((e) => e.kind === "impact-mallet-grounded")).toBe(false);
        const under = integrate(onTurf(TEST_HEAD.radius - HEAD_DEEP_LIMIT + 1e-6), { cap: 1e-3 });
        expect(under.events.some((e) => e.kind === "impact-head-deep")).toBe(false);
    });

    it("rests a nearly level head without spinning it, though its lowest point jumps between the end rims", () => {
        for (const tilt of [1e-9, -1e-9]) {
            let spin = 0;
            const probe = {
                step(s: ImpactSnapshot) {
                    spin = Math.max(spin, length(s.head.angularVelocity));
                },
            };
            const run = integrate(onTurf(TEST_HEAD.radius, ZERO, axisAngle(vec3(0, 1, 0), tilt)), { cap: 0.05, probe });
            // Each end in turn carries the head; the moment switches sign step by step and stays bounded.
            expect(spin, `tilt ${tilt}`).toBeLessThan(0.01);
            expect(Math.abs(0 - headLowestPoint(run.head, TEST_HEAD) - SINK) / SINK).toBeLessThan(0.02);
        }
    });

    it("brings a relaxed head, held 1 mm above the turf, down onto it to rest", () => {
        // γ = 0.1: the sag (1 − γ)·m·g/k is 3.6 mm at T = 40 ms.
        const contact = onArc(levelArc(vec3(0, 0, TEST_HEAD.radius + 1e-3), { speed: 0 }), {
            ...TEST_COUPLING,
            tension: 0.1,
        });
        const track = prepareTrack(contact.drive as TrackDrive, TEST_HEAD, g);
        const start = headOnPath(track, TEST_HEAD, 0);
        const run = integrate(isolated({ start, drive: track, gravity: g, headTurf: LAW }));
        const line = run.timeline[HEAD_TURF_KEY] ?? [];
        expect(line.length).toBeGreaterThanOrEqual(1);
        expect(line[line.length - 1]?.end).toBe(run.duration);
        expect(length(run.head.velocity)).toBeLessThan(1e-3);
        expect(run.duration).toBeGreaterThanOrEqual(TRACK_IMPACT_CAP);
    });

    it("is given to a tracked drive and not to a force table", () => {
        const world = testWorld();
        const blue = ballAt(5, 0);
        const turf = world.lawn.surfaceAt(blue.position);
        expect(prepareImpact(onArc(levelArc(blue.position)), { blue }, world).headTurf).toEqual(
            lawFromStiffness(TEST_HEAD.mass, turf.turfRestitution, turf.turfStiffness, HEAD_TURF_FRICTION),
        );
        expect(prepareImpact(strike(blue.position), { blue }, world).headTurf).toBeNull();
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/engine/impact/headTurf.test.ts tests/engine/impact/contacts.test.ts`
Expected: FAIL. `headBottom is not a function`; `HEAD_DEEP_LIMIT` is undefined; the head falls through the turf
(`impact-mallet-grounded` raised, no `head/turf` timeline).

- [ ] **Step 3: Add the geometry to `contacts.ts`**

Append:

```ts
/** Key of the head–turf pair (P2b.2b.1 design §4.3). */
export const HEAD_TURF_KEY = "head/turf";

/**
 * The head's lowest point (P2b.2b.1 design §4.1). With a the unit axis and |a_z| < 1, it is
 * c − (L/2)·sign(a_z)·a − r·u, u the unit vector of ẑ − a_z·a: the lower end disc's rim, straight below the axis. For
 * a_z = 0 it lies under the centre, on the barrel; for |a_z| = 1, the face disc is level and it is the disc's centre.
 * Its height is headLowestPoint's, up to rounding.
 */
export function headBottom(state: HeadState, head: MalletHead): Vec3 {
    const a = rotate(state.orientation, vec3(1, 0, 0));
    const half = head.length / 2;
    const end = a.z > 0 ? scale(a, half) : a.z < 0 ? scale(a, 0 - half) : vec3(0, 0, 0);
    const rise = vec3(0 - a.z * a.x, 0 - a.z * a.y, 1 - a.z * a.z);
    const size = length(rise);
    const across = size > 0 ? scale(rise, head.radius / size) : vec3(0, 0, 0);
    return sub(sub(state.position, end), across);
}

/** The turf's contact with the head: closed while its lowest point is below the turf plane, along ẑ, acting there. */
export function headTurfContact(state: HeadState, head: MalletHead): Penetration | null {
    const point = headBottom(state, head);
    if (!(point.z < 0)) {
        return null;
    }
    return { normal: UP, depth: 0 - point.z, point };
}
```

- [ ] **Step 4: Add the event and the slide to `types.ts`**

In the `ImpactEvent` comment, the list becomes:

```ts
 * - `impact-cap`: the impact reached its cap (IMPACT_CAP, or TRACK_IMPACT_CAP for a tracked drive);
 * - `impact-head-approaching`: when it ended the head was still closing on a ball within reach (a force table's
 *   second strike, a double tap, is a fault and is not modelled; a tracked drive integrates it and so raises this only
 *   at the cap);
 * - `impact-mallet-grounded`: part of the head went below the turf plane with no head–turf pair (a force table:
 *   mallet–turf contact is not modelled);
 * - `impact-head-deep`: the head went more than HEAD_DEEP_LIMIT below the turf plane, where the head–turf pair is not
 *   credible (P2b.2b.1 design §4.2);
 * - `impact-off-face`: a ball reached the rim of a face rather than the face (edge strokes are not modelled).
```

and add `| { readonly kind: "impact-head-deep"; readonly t: number }` after the `impact-mallet-grounded` member. In
`ImpactRun`, `peakPenetration`'s comment lists `"head/turf"` among its keys, and add after `touchingAtStart`:

```ts
    /**
     * Path length (m) of the head's lowest point along the turf while the head–turf pair was closed (P2b.2b.1 design
     * §4.3), summed per step from its horizontal velocity; absent when the pair never closed.
     */
    readonly headTurfSlide?: number;
```

- [ ] **Step 5: Integrate the pair**

In `src/engine/impact/integrate.ts`:

Imports: add `import { contactReference } from "../../reference/index";`; add `HEAD_TURF_KEY` and `headTurfContact`
to the contacts import; add `type PairLaw` from `./contactLaw` (already imported); and add `horizontal` and `vec3` from
vec3 (already there).

After `TRACK_IMPACT_CAP` add:

```ts
/**
 * Depth (m) below the turf plane past which a head with the head–turf pair raises `impact-head-deep` (P2b.2b.1 design
 * §4.2; reference/contact.json): a model limit, past which a plane turf with a linear spring is not credible for it.
 */
export const HEAD_DEEP_LIMIT = contactReference.headDeepLimit.value;
```

In `ImpactSetup`, add after `obstacles`:

```ts
    /**
     * The head–turf pair's law (P2b.2b.1 design §4.1), or null to leave the pair out: prepareImpact solves it for a
     * tracked drive and gives a force table none. Isolated set-ups (tests) may give any head the pair.
     */
    readonly headTurf: PairLaw | null;
```

In `ImpactSnapshot`, after `hand`:

```ts
    /** The turf's total force on the head (zero while the pair is open); absent without the head–turf pair. */
    readonly headTurf?: Vec3;
```

After `applyPair`, add:

```ts
/** The head–turf pair while the impact runs (design §4). */
interface HeadTurfState {
    readonly law: PairLaw;
    /** Elastic tangential displacement ξ; cleared whenever the pair is open. */
    spring: Vec3;
    peak: number;
    readonly line: PairTimeline;
    /** Path length (m) of the contact point along the turf while the pair is closed. */
    slide: number;
}

/**
 * The head–turf pair in one step (design §4.1), from the current state: the turf's clamped spring–dashpot and
 * Cundall–Strack friction act on the head at its lowest point. Adds the force and its moment to the head's loads,
 * records the step and the slide, and returns the force on the head, or null while the pair is open.
 */
function applyHeadTurf(
    p: HeadTurfState,
    state: HeadState,
    head: MalletHead,
    dt: number,
    loads: StepLoads,
    t: number,
): Vec3 | null {
    const contact = headTurfContact(state, head);
    if (contact === null) {
        p.spring = ZERO;
        recordStep(p.line, false, 0, t);
        return null;
    }
    p.peak = Math.max(p.peak, contact.depth);
    const u = pointVelocity(state.position, state.velocity, state.angularVelocity, contact.point);
    const normal = normalForce(p.law, contact.depth, 0 - u.z);
    const slip = horizontal(u);
    const tangential = tangentialForce(p.law, add(horizontal(p.spring), scale(slip, dt)), slip, normal);
    p.spring = tangential.spring;
    const force = add(vec3(0, 0, normal), tangential.force);
    loads.headForce = add(loads.headForce, force);
    loads.headTorque = add(loads.headTorque, cross(sub(contact.point, state.position), force));
    p.slide += length(slip) * dt;
    recordStep(p.line, true, normal, t);
    return force;
}
```

Replace `finish` with:

```ts
/**
 * The run's result once the loop has ended at `duration`: each ball's final state, an `impact-head-approaching` event
 * for every ball the head is still closing on, every pair's peak penetration, the contact timeline, the pairs touching
 * at the start and, if the head–turf pair closed, the slide.
 */
function finish(
    setup: ImpactSetup,
    state: HeadState,
    balls: readonly BallState[],
    pairs: readonly PairState[],
    turf: HeadTurfState | null,
    events: ImpactEvent[],
    steps: number,
    duration: number,
    touchingAtStart: readonly string[],
): ImpactRun {
    const final: BallStates = {};
    for (let i = 0; i < balls.length; i++) {
        const s = balls[i] as BallState;
        const id = (setup.balls[i] as ImpactBall).id;
        final[id] = s;
        if (headClosing(state, setup.head, s, setup.ball.radius)) {
            events.push({ kind: "impact-head-approaching", t: duration, ball: id });
        }
    }
    const peakPenetration: Record<string, number> = {};
    for (const p of pairs) {
        if (p.peak > 0) {
            peakPenetration[p.pair.key] = p.peak;
        }
    }
    const timeline: Record<string, readonly ContactInterval[]> = {};
    for (const p of pairs) {
        const intervals = closeTimeline(p.line, duration);
        if (intervals.length > 0) {
            timeline[p.pair.key] = intervals;
        }
    }
    const run = { balls: final, head: state, duration, events, peakPenetration, steps, timeline, touchingAtStart };
    const turfIntervals = turf === null ? [] : closeTimeline(turf.line, duration);
    if (turf === null || turfIntervals.length === 0) {
        return run;
    }
    peakPenetration[HEAD_TURF_KEY] = turf.peak;
    timeline[HEAD_TURF_KEY] = turfIntervals;
    return { ...run, headTurfSlide: turf.slide };
}
```

In `integrate`, after `const offFace = …`, add:

```ts
    const turf: HeadTurfState | null =
        setup.headTurf === null
            ? null
            : { law: setup.headTurf, spring: ZERO, peak: 0, line: emptyTimeline(), slide: 0 };
    let deep = false;
```

After the pair loop (before `state = advance(…)`), add:

```ts
        // The head–turf pair comes after every other pair (design §4.1).
        const turfForce = turf === null ? null : applyHeadTurf(turf, state, head, dt, loads, t);
        if (turfForce !== null) {
            hardClosed = true;
        }
```

Replace the grounded check with:

```ts
        if (turf === null) {
            if (!grounded && headLowestPoint(state, head) < 0) {
                grounded = true;
                events.push({ kind: "impact-mallet-grounded", t: now });
            }
        } else if (!deep && headLowestPoint(state, head) < 0 - HEAD_DEEP_LIMIT) {
            deep = true;
            events.push({ kind: "impact-head-deep", t: now });
        }
```

the probe call with:

```ts
        if (options.probe) {
            const snapshot: ImpactSnapshot = { t: now, drive, head: state, balls: [...balls], contacts: samples };
            options.probe.step(
                hand === null && turf === null
                    ? snapshot
                    : {
                          ...snapshot,
                          ...(hand === null ? {} : { hand: { force: hand.force, feedForward: hand.feedForward } }),
                          ...(turf === null ? {} : { headTurf: turfForce ?? ZERO }),
                      },
            );
        }
```

and the final call with `return finish(setup, state, balls, pairs, turf, events, steps, steps * dt, touchingAtStart);`.

Extend the file header's step list, item 1, with ", then the head–turf pair if the set-up has it (P2b.2b.1 design
§4)". Its end-rule paragraph lists "face–ball, ball–ball, ball–obstacle or head–turf contact".

In `tests/engine/support/impact.ts`, `isolated`'s defaults gain `headTurf: null,` (after `obstacles: []`).

- [ ] **Step 6: Solve the pair's law in `prepareImpact`**

In `src/engine/impact/simulateImpact.ts`, import `contactReference` from `../../reference/index`, add `headBottom` to
the contacts import and `PairLaw` to the contactLaw import (as a type), and add after `PLACEMENT_PASSES`:

```ts
/**
 * Friction of the mallet head on the turf (P2b.2b.1 design §4.1; reference/contact.json): the analogue of a ball
 * sliding on the turf. Provisional; P2b.2b.2 sources it.
 */
export const HEAD_TURF_FRICTION = contactReference.headTurfFriction.value;

/**
 * The head–turf law of a tracked drive, or null for a force table (design §4.1): the turf's stiffness, and damping
 * solved from its restitution with the head's mass, sampled once at the head's lowest point at t = 0.
 */
function headTurfLaw(contact: ContactState, world: World): PairLaw | null {
    if (contact.drive.kind === "force") {
        return null;
    }
    const surface = world.lawn.surfaceAt(headBottom(contact, contact.head));
    return lawFromStiffness(contact.head.mass, surface.turfRestitution, surface.turfStiffness, HEAD_TURF_FRICTION);
}
```

In `validateImpact`'s tracked branch, after `validateTrack(contact.drive);`, check the surface under the head:

```ts
        const surface = world.lawn.surfaceAt(headBottom(contact, head));
        positive(surface.turfStiffness, "turfStiffness under the head");
        restitution(surface.turfRestitution, "turfRestitution under the head");
```

In `prepareImpact`'s returned set-up, add `headTurf: headTurfLaw(contact, world),` after `obstacles`.

- [ ] **Step 7: Run the tests, verify bit-identity**

Run: `npx vitest run tests/engine/impact/headTurf.test.ts tests/engine/impact/contacts.test.ts`
Expected: PASS. If a behaviour figure misses (the relaxed head's rest speed, the near-level spin), print it and report
it.

Run: `npm test`, `npm run check`, `npm run lint`
Expected: all pass.

Run: `env OBSTACLE_STROKES=2000 npx --yes tsx scripts/impactDigest.ts > "$CLAUDE_TEMP_DIR/digest-6.txt"`
Run: `cmp "$CLAUDE_TEMP_DIR/digest-base.txt" "$CLAUDE_TEMP_DIR/digest-6.txt"`
Expected: no output.

- [ ] **Step 8: Format, check, commit**

```bash
git add src/engine/impact/contacts.ts src/engine/impact/types.ts src/engine/impact/integrate.ts src/engine/impact/simulateImpact.ts tests/engine/support/impact.ts tests/engine/impact/contacts.test.ts tests/engine/impact/headTurf.test.ts
git commit -F "$CLAUDE_TEMP_DIR/msg.txt"   # "Add mallet–turf contact for tracked drives"
```

---

### Task 7: The swing model

Spec §5. `buildContact(setup, world)` derives the arc radius, the contact angle, the head's pitch, its placement on
the ball, the pivot, the arc rate and the window's drive. It starts the head exactly on its own path. `defaultProfile`
ships the provisional presets.

**Files:**
- Create: `src/engine/swing/types.ts`, `src/engine/swing/profile.ts`, `src/engine/swing/buildContact.ts`,
  `tests/engine/support/shot.ts`, `tests/engine/swing/buildContact.test.ts`
- Modify: `src/engine/world.ts` (header comment)

**Interfaces:**
- Consumes:
  - `HAND_COUPLING`, `headOnPath`, `pitchAxis`, `prepareTrack` and `swingOrientation` (track.ts);
  - `headLowestPoint`;
  - `malletReference.shaftLength` and `.topHandHeight` (Task 2).
- Produces (swing/types.ts):
  - `type StrokeType`;
  - `CROQUET_STROKES` and `STROKE_TYPES: readonly StrokeType[]`;
  - `interface SwingStance { ballAhead; shaftLean; gripTension }` and
    `interface SwingDrive { speedGain; bodySpeed; bodyAccel; window }`;
  - `interface SwingProfile`;
  - `interface ShotSetup` (spec §5.1).
- Produces (swing/profile.ts): `defaultProfile: SwingProfile` and `DEFAULT_DRIVE: Readonly<Record<StrokeType, number>>`.
- Produces (swing/buildContact.ts): `START_GAP = 1e-6` and `buildContact(setup: ShotSetup, world: World): ContactState`.
- Produces (support/shot.ts):
  - `testProfile(over?)`;
  - `CANONICAL_STRIKER = { x: 9.6012, y: 4 }`;
  - `canonicalSetup(type, world?, profile?): ShotSetup`;
  - `CANONICAL_CLEARANCE: Readonly<Record<StrokeType, number>>`.

- [ ] **Step 1: Write the types**

Create `src/engine/swing/types.ts`:

```ts
/**
 * The swing model's inputs (P2b.2b.1 design §5.1): the stroke types, the physical swing profile and a shot's setup.
 * The product spec's grip style, weighting and face material have no engine reader yet: the planner and P3's stored
 * profile carry grip style, and the engine's head is centre-weighted with a wooden face.
 */
import type { HoopTarget } from "../hoopRun";
import type { BallId, BallStates } from "../types";

/** The strokes the swing model plays. */
export type StrokeType = "single-ball" | "drive" | "stop-ac" | "stop-gc" | "half-roll" | "full-roll" | "pass-roll";

/** The croquet strokes; the rest are single-ball. */
export const CROQUET_STROKES: readonly StrokeType[] = [
    "drive",
    "stop-ac",
    "stop-gc",
    "half-roll",
    "full-roll",
    "pass-roll",
];

/** Every stroke type: the single-ball stroke, then the croquet strokes. */
export const STROKE_TYPES: readonly StrokeType[] = ["single-ball", ...CROQUET_STROKES];

/**
 * How the player stands to a stroke type: the ball ahead of the arc's lowest point (m), the shaft's lean at contact
 * (rad, positive pitches the face down), and the grip's tension from contact on (1 firm, lower relaxed).
 */
export interface SwingStance {
    readonly ballAhead: number;
    readonly shaftLean: number;
    readonly gripTension: number;
}

/**
 * How the hands drive a stroke type: over `window` (s) at full `drive`, the hands' arc speed changes by `speedGain`
 * times its speed at contact; the body moves forward at `bodySpeed` (m/s) at contact and accelerates at `bodyAccel`
 * (m/s²).
 */
export interface SwingDrive {
    readonly speedGain: number;
    readonly bodySpeed: number;
    readonly bodyAccel: number;
    readonly window: number;
}

/** The physical part of a player's profile (design §5.1); P3 wraps it into the stored profile. */
export interface SwingProfile {
    readonly mallet: {
        readonly headMass: number;
        readonly headLength: number;
        readonly headDiameter: number;
        readonly shaftLength: number;
    };
    readonly grip: { readonly topHandHeight: number };
    readonly stance: Readonly<Record<StrokeType, SwingStance>>;
    readonly drive: Readonly<Record<StrokeType, SwingDrive>>;
}

/** A shot to simulate (design §5.1, product spec §3). */
export interface ShotSetup {
    readonly balls: BallStates;
    readonly striker: BallId;
    readonly croqueted?: BallId;
    readonly stroke: {
        readonly type: StrokeType;
        /** Swing direction, rad from +x, horizontal. */
        readonly aim: number;
        /** The head's centre-of-mass speed at contact, m/s. */
        readonly speed: number;
        /** −1 check … 0 coast … +1 push. */
        readonly drive: number;
        /** The ball's centre from the face's centre (m): `up` along the face's upward axis, `side` to the left of aim. */
        readonly contact: { readonly up: number; readonly side: number };
    };
    readonly live: readonly BallId[];
    readonly continuation: boolean;
    readonly hampered: boolean;
    readonly jumpAttempt: boolean;
    readonly targetHoop?: HoopTarget;
    readonly lawnSpeed: number;
    readonly profile: SwingProfile;
}
```

Create `src/engine/swing/profile.ts`:

```ts
/**
 * The default swing profile, "typical club player" (P2b.2b.1 design §5.4). Every value is provisional. The mallet,
 * shaft and grip are reference/mallet.json's. The stance and drive entries are estimates within the feasibility
 * spike's ranges, chosen before any ratio was measured and never tuned to one (roadmap, "P2b.2 decisions"); P2b.2b.2
 * sources them.
 *
 * The presets follow the user's account of play (design §5.4). AC stop: feet set back, so the ball is met slightly on
 * the up, the face tilted up, the hands checking and relaxing so the head sags onto the turf. GC stop: a hard, level
 * shot with no follow-through, the lower hand checking the swing. Power rolls: the body's weight moving from back to
 * front with the face tilt held. Pass roll: a split, the bottom hand punching through contact.
 */
import { malletReference } from "../../reference/index";
import type { StrokeType, SwingProfile } from "./types";

const DEG = Math.PI / 180;

/** The default profile (design §5.4). */
export const defaultProfile: SwingProfile = {
    mallet: {
        headMass: malletReference.headMass.value,
        headLength: malletReference.headLength.value,
        headDiameter: malletReference.headDiameter.value,
        shaftLength: malletReference.shaftLength.value,
    },
    grip: { topHandHeight: malletReference.topHandHeight.value },
    stance: {
        "single-ball": { ballAhead: 0, shaftLean: 0, gripTension: 1 },
        drive: { ballAhead: 0, shaftLean: 0, gripTension: 1 },
        // About 9° of rise at the default arc radius; the face tilted up 4°.
        "stop-ac": { ballAhead: 0.13, shaftLean: -4 * DEG, gripTension: 0.1 },
        "stop-gc": { ballAhead: 0, shaftLean: 0, gripTension: 1 },
        "half-roll": { ballAhead: -0.05, shaftLean: 25 * DEG, gripTension: 1 },
        "full-roll": { ballAhead: -0.07, shaftLean: 35 * DEG, gripTension: 1 },
        "pass-roll": { ballAhead: -0.08, shaftLean: 40 * DEG, gripTension: 1 },
    },
    drive: {
        "single-ball": { speedGain: 0.2, bodySpeed: 0, bodyAccel: 0, window: 0.01 },
        drive: { speedGain: 0.2, bodySpeed: 0, bodyAccel: 0, window: 0.005 },
        "stop-ac": { speedGain: 1, bodySpeed: 0, bodyAccel: 0, window: 0.01 },
        "stop-gc": { speedGain: 1, bodySpeed: 0, bodyAccel: 0, window: 0.01 },
        "half-roll": { speedGain: 0.2, bodySpeed: 0.2, bodyAccel: 5, window: 0.02 },
        "full-roll": { speedGain: 0.2, bodySpeed: 0.3, bodyAccel: 8, window: 0.03 },
        "pass-roll": { speedGain: 0.5, bodySpeed: 0.4, bodyAccel: 10, window: 0.015 },
    },
};

/** The planner's default `drive` per stroke type (design §5.4): −1 check … 0 coast … +1 push. */
export const DEFAULT_DRIVE: Readonly<Record<StrokeType, number>> = {
    "single-ball": 0,
    drive: 0,
    "stop-ac": -1,
    "stop-gc": -1,
    "half-roll": 1,
    "full-roll": 1,
    "pass-roll": 1,
};
```

In `src/engine/world.ts`, the header's second sentence becomes: "`defaultWorld` reads the sourced reference data for
the world; the impact's and the swing model's own constants are read by the modules that use them (impact/track.ts,
impact/integrate.ts, impact/simulateImpact.ts, swing/; P2b.2b.1 design §7)." (wrap at 120 columns).

- [ ] **Step 2: Write the test support**

Create `tests/engine/support/shot.ts`:

```ts
/**
 * Test-only swing profiles and the canonical setups (P2b.2b.1 design §5.5). `testProfile` is plausible but NOT
 * sourced, as fixtures.ts. src/ must never import this file.
 */
import {
    CROQUET_STROKES,
    STROKE_TYPES,
    type ShotSetup,
    type StrokeType,
    type SwingDrive,
    type SwingProfile,
    type SwingStance,
} from "../../../src/engine/swing/types";
import { DEFAULT_DRIVE, defaultProfile } from "../../../src/engine/swing/profile";
import { vec3 } from "../../../src/engine/math/vec3";
import type { BallStates, World } from "../../../src/engine/types";
import { defaultWorld } from "../../../src/engine/world";
import { lawnReference } from "../../../src/reference/index";

/** What `testProfile` changes: one stance and one drive entry for every stroke type, the grip and the shaft. */
export interface TestProfileOptions {
    readonly stance?: Partial<SwingStance>;
    readonly drive?: Partial<SwingDrive>;
    readonly topHandHeight?: number;
    readonly shaftLength?: number;
}

/** A profile with the test head (1 kg, 0.23 m, 0.064 m across) and the same stance and drive for every stroke type. */
export function testProfile(o: TestProfileOptions = {}): SwingProfile {
    const stance: SwingStance = { ballAhead: 0, shaftLean: 0, gripTension: 1, ...o.stance };
    const drive: SwingDrive = { speedGain: 0.2, bodySpeed: 0, bodyAccel: 0, window: 0.01, ...o.drive };
    const every = <T>(entry: T): Record<StrokeType, T> =>
        Object.fromEntries(STROKE_TYPES.map((type) => [type, entry])) as Record<StrokeType, T>;
    return {
        mallet: { headMass: 1, headLength: 0.23, headDiameter: 0.064, shaftLength: o.shaftLength ?? 0.9 },
        grip: { topHandHeight: o.topHandHeight ?? 0.85 },
        stance: every(stance),
        drive: every(drive),
    };
}

/**
 * Where the canonical setups put the striker: a lane of the default court midway between the hoop columns at
 * x = 6.4008 and 12.8016, clear of every hoop and the peg for 28 m along +y. The design's court centre holds the peg.
 */
export const CANONICAL_STRIKER = { x: 9.6012, y: 4 } as const;

/**
 * A preset's canonical setup (design §5.5): the striker at CANONICAL_STRIKER, aim +y, 3 m/s, the preset's default
 * drive, `side` 0, `up` 0 except the AC stop's −0.012 m. A croquet stroke's croqueted ball touches the striker ahead
 * along aim, 20° off it for the pass roll; no other balls; `live` empty.
 */
export function canonicalSetup(
    type: StrokeType,
    world: World = defaultWorld(),
    profile: SwingProfile = defaultProfile,
): ShotSetup {
    const R = world.ball.radius;
    const aim = Math.PI / 2;
    const at = (x: number, y: number) => ({
        position: vec3(x, y, R),
        velocity: vec3(0, 0, 0),
        angularVelocity: vec3(0, 0, 0),
    });
    const { x, y } = CANONICAL_STRIKER;
    const balls: BallStates = { blue: at(x, y) };
    const croquet = CROQUET_STROKES.includes(type);
    if (croquet) {
        const line = aim + (type === "pass-roll" ? (20 * Math.PI) / 180 : 0);
        balls.red = at(x + 2 * R * Math.cos(line), y + 2 * R * Math.sin(line));
    }
    return {
        balls,
        striker: "blue",
        ...(croquet ? { croqueted: "red" as const } : {}),
        stroke: {
            type,
            aim,
            speed: 3,
            drive: DEFAULT_DRIVE[type],
            contact: { up: type === "stop-ac" ? -0.012 : 0, side: 0 },
        },
        live: [],
        continuation: false,
        hampered: false,
        jumpAttempt: false,
        lawnSpeed: lawnReference.defaultSpeed.value,
        profile,
    };
}

/**
 * The head's lowest point above the turf (m) at t = 0 in each canonical setup on the default world, with the default
 * profile (computed while planning: h₀ = R − sink, ρ = 38.1 mm, L = 228.6 mm; independent of the arc radius).
 */
export const CANONICAL_CLEARANCE: Readonly<Record<StrokeType, number>> = {
    "single-ball": 7.8971e-3,
    drive: 7.8971e-3,
    "stop-ac": 0.8028e-3,
    "stop-gc": 7.8971e-3,
    "half-roll": 30.9234e-3,
    "full-roll": 41.194e-3,
    "pass-roll": 46.4037e-3,
};
```

- [ ] **Step 3: Write the failing tests**

Create `tests/engine/swing/buildContact.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { headLowestPoint } from "../../../src/engine/impact/contacts";
import { rotate, solidCylinderInertia } from "../../../src/engine/impact/rigidBody";
import { simulateImpact } from "../../../src/engine/impact/simulateImpact";
import { HAND_COUPLING, headOnPath, pitchAxis, prepareTrack } from "../../../src/engine/impact/track";
import type { ContactState, TrackDrive } from "../../../src/engine/impact/types";
import { add, cross, dot, horizontal, length, scale, sub, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import { buildContact, START_GAP } from "../../../src/engine/swing/buildContact";
import { defaultProfile } from "../../../src/engine/swing/profile";
import { STROKE_TYPES, type ShotSetup, type SwingProfile } from "../../../src/engine/swing/types";
import type { BallState } from "../../../src/engine/types";
import { defaultWorld } from "../../../src/engine/world";
import { malletReference, contactReference } from "../../../src/reference/index";
import { TEST_BALL, TEST_TURF, ballAt, testWorld } from "../support/fixtures";
import { mirrorBall, mirrorContact, mirrorQuat, mirrorSpin, mirrorVec } from "../support/impact";
import { CANONICAL_CLEARANCE, canonicalSetup, testProfile } from "../support/shot";

const WORLD = testWorld();
const R = TEST_BALL.radius;
/** The striker's sunk centre height, where the face is placed against it. */
const SUNK_Z = R - (TEST_BALL.mass * WORLD.gravity) / TEST_TURF.turfStiffness;
const BLUE = ballAt(5, 3);
/** The test profile's arc radius: top hand 0.85 m less the socket's height at address, h₀ + ρ. */
const RADIUS = 0.85 - SUNK_Z - 0.032;

type Stroke = ShotSetup["stroke"];

function shot(stroke: Partial<Stroke> = {}, profile: SwingProfile = testProfile(), blue: BallState = BLUE): ShotSetup {
    return {
        balls: { blue },
        striker: "blue",
        stroke: { type: "single-ball", aim: 0.4, speed: 3, drive: 0, contact: { up: 0, side: 0 }, ...stroke },
        live: [],
        continuation: false,
        hampered: false,
        jumpAttempt: false,
        lawnSpeed: 10,
        profile,
    };
}

const arcOf = (c: ContactState) => (c.drive as TrackDrive).arc;
const dist = (a: Vec3, b: Vec3): number => length(sub(a, b));
const same = (a: Vec3, b: Vec3): boolean => a.x === b.x && a.y === b.y && a.z === b.z;

describe("buildContact, step by step", () => {
    it("measures the arc radius from the top hand to the socket at address", () => {
        expect(arcOf(buildContact(shot(), WORLD)).radius).toBeCloseTo(RADIUS, 15);
    });

    it("turns ballAhead into the contact angle, positive for a rising strike", () => {
        const c = buildContact(shot({}, testProfile({ stance: { ballAhead: 0.1 } })), WORLD);
        expect(arcOf(c).theta0).toBeCloseTo(Math.asin(0.1 / RADIUS), 12);
    });

    it("pitches the face down by the shaft lean, whatever the contact angle", () => {
        for (const degrees of [-10, 0, 10]) {
            const ballAhead = RADIUS * Math.sin((degrees * Math.PI) / 180);
            const c = buildContact(shot({}, testProfile({ stance: { ballAhead, shaftLean: 0.3 } })), WORLD);
            const face = rotate(c.orientation, vec3(1, 0, 0));
            expect(Math.asin(face.z), `θc ${degrees}°`).toBeCloseTo(-0.3, 12);
            const aim = vec3(Math.cos(0.4), Math.sin(0.4), 0);
            expect(length(cross(horizontal(face), aim))).toBeLessThan(1e-12);
            expect(dot(face, aim)).toBeGreaterThan(0);
        }
    });

    it("puts the face 1 µm short of the sunk ball, meeting it at the requested point", () => {
        const c = buildContact(shot({ contact: { up: 0.01, side: -0.005 } }), WORLD);
        const face = rotate(c.orientation, vec3(1, 0, 0));
        const upward = rotate(c.orientation, vec3(0, 0, 1));
        const left = rotate(c.orientation, vec3(0, 1, 0));
        const offset = sub(vec3(5, 3, SUNK_Z), add(c.position, scale(face, c.head.length / 2)));
        expect(dot(offset, face)).toBeCloseTo(R + START_GAP, 12);
        expect(dot(offset, upward)).toBeCloseTo(0.01, 12);
        expect(dot(offset, left)).toBeCloseTo(-0.005, 12);
        expect(dist(left, vec3(-Math.sin(0.4), Math.cos(0.4), 0))).toBeLessThan(1e-12);
    });

    it("moves the centre of mass at the requested speed, with and without the body", () => {
        for (const bodySpeed of [0, 0.5]) {
            const c = buildContact(shot({}, testProfile({ drive: { bodySpeed } })), WORLD);
            const arc = arcOf(c);
            expect(length(c.velocity), `bodySpeed ${bodySpeed}`).toBeCloseTo(3, 12);
            const swing = scale(cross(pitchAxis(arc.aim), sub(c.position, arc.pivot)), arc.omega0);
            expect(dist(c.velocity, add(arc.pivotVelocity, swing))).toBeLessThan(1e-12);
            expect(dist(arc.pivotVelocity, scale(arc.aim, bodySpeed))).toBeLessThan(1e-15);
        }
    });

    it("drives the arc and the pivot over the window, and grips with the stance's tension", () => {
        const profile = testProfile({
            stance: { gripTension: 0.6 },
            drive: { speedGain: 0.4, bodySpeed: 0.1, bodyAccel: 6, window: 0.02 },
        });
        const c = buildContact(shot({ drive: -0.5 }, profile), WORLD);
        const arc = arcOf(c);
        expect(arc.alpha).toBeCloseTo((-0.5 * 0.4 * arc.omega0) / 0.02, 10);
        expect(dist(arc.pivotAcceleration, scale(arc.aim, -3))).toBeLessThan(1e-15);
        expect(arc.window).toBe(0.02);
        expect((c.drive as TrackDrive).coupling).toEqual({
            period: HAND_COUPLING.period,
            dampingRatio: HAND_COUPLING.dampingRatio,
            tension: 0.6,
        });
    });

    it("builds the profile's mallet with a wooden face", () => {
        const c = buildContact(shot(), WORLD);
        expect(c.head).toEqual({
            mass: 1,
            inertia: solidCylinderInertia(1, 0.23, 0.032),
            length: 0.23,
            radius: 0.032,
            socket: vec3(0, 0, 0.032),
        });
        expect(c.face).toEqual({
            restitution: malletReference.faceRestitution.value,
            friction: malletReference.faceFriction.value,
            contactTime: contactReference.faceBallContactTime.value,
        });
    });

    it("starts the head exactly on its own path", () => {
        const c = buildContact(shot({ drive: 0.7 }, testProfile({ stance: { ballAhead: -0.05, shaftLean: 0.4 } })), WORLD);
        const start = headOnPath(prepareTrack(c.drive as TrackDrive, c.head, WORLD.gravity), c.head, 0);
        expect({
            position: c.position,
            orientation: c.orientation,
            velocity: c.velocity,
            angularVelocity: c.angularVelocity,
        }).toEqual(start);
    });

    it("points the face along any aim", () => {
        for (const aim of [Math.PI, -Math.PI / 2, 7]) {
            const c = buildContact(shot({ aim }), WORLD);
            const face = rotate(c.orientation, vec3(1, 0, 0));
            expect(dist(face, vec3(Math.cos(aim), Math.sin(aim), 0)), `aim ${aim}`).toBeLessThan(1e-12);
            const start = headOnPath(prepareTrack(c.drive as TrackDrive, c.head, WORLD.gravity), c.head, 0);
            expect(c.position).toEqual(start.position);
        }
    });
});

describe("buildContact, mirrored", () => {
    it("gives a setup mirrored across a vertical plane an exactly mirrored contact and impact", () => {
        const profile = testProfile({
            stance: { ballAhead: 0.05, shaftLean: 0.1, gripTension: 0.8 },
            drive: { bodySpeed: 0.2, bodyAccel: 3 },
        });
        const stroke = { aim: 0.4, drive: 0.5, contact: { up: -0.003, side: 0.004 } };
        const a = buildContact(shot(stroke, profile, ballAt(5, 3)), WORLD);
        const b = buildContact(
            shot({ ...stroke, aim: -0.4, contact: { up: -0.003, side: -0.004 } }, profile, ballAt(5, -3)),
            WORLD,
        );
        const m = mirrorContact(a);
        expect(same(m.position, b.position) && same(m.velocity, b.velocity)).toBe(true);
        expect(same(m.angularVelocity, b.angularVelocity)).toBe(true);
        const [q, p] = [m.orientation, b.orientation];
        expect(q.w === p.w && q.x === p.x && q.y === p.y && q.z === p.z).toBe(true);
        const [ma, mb] = [arcOf(m), arcOf(b)];
        expect(same(ma.pivot, mb.pivot) && same(ma.pivotAcceleration, mb.pivotAcceleration)).toBe(true);
        expect(ma.omega0 === mb.omega0 && ma.alpha === mb.alpha && ma.theta0 === mb.theta0).toBe(true);
        const ra = simulateImpact(a, { blue: ballAt(5, 3) }, WORLD);
        const rb = simulateImpact(b, { blue: ballAt(5, -3) }, WORLD);
        const ha = ra.handover.blue as BallState;
        const hb = rb.handover.blue as BallState;
        expect(same(mirrorBall(ha).position, hb.position) && same(mirrorVec(ha.velocity), hb.velocity)).toBe(true);
        expect(same(mirrorSpin(ha.angularVelocity), hb.angularVelocity)).toBe(true);
        expect(rb.steps).toBe(ra.steps);
        const [qa, qb] = [mirrorQuat(ra.head.orientation), rb.head.orientation];
        expect(qa.w === qb.w && qa.x === qb.x && qa.y === qb.y && qa.z === qb.z).toBe(true);
    });
});

describe("the default profile's canonical setups", () => {
    it.each(STROKE_TYPES)("%s starts the head clear of the turf by its planned clearance", (type) => {
        const world = defaultWorld();
        const c = buildContact(canonicalSetup(type, world), world);
        expect(headLowestPoint(c, c.head)).toBeCloseTo(CANONICAL_CLEARANCE[type], 6);
    });

    it("rises about 9° into the AC stop at the default arc radius", () => {
        const world = defaultWorld();
        const theta = arcOf(buildContact(canonicalSetup("stop-ac", world), world)).theta0;
        expect((theta * 180) / Math.PI).toBeCloseTo(9.29, 1);
        expect(defaultProfile.stance["stop-ac"].ballAhead).toBe(0.13);
    });
});

describe("buildContact rejections", () => {
    const missing = (record: "stance" | "drive"): SwingProfile => {
        const p = testProfile();
        const kept = Object.fromEntries(Object.entries(p[record]).filter(([type]) => type !== "drive"));
        return { ...p, [record]: kept } as unknown as SwingProfile;
    };
    const cases: readonly [string, ShotSetup, RegExp][] = [
        ["the striker absent", { ...shot(), striker: "red" }, /striker red is not in the setup/],
        ["a stroke type missing from the stance", shot({ type: "drive" }, missing("stance")), /profile\.stance has no entry for drive/],
        ["a stroke type missing from the drive", shot({ type: "drive" }, missing("drive")), /profile\.drive has no entry for drive/],
        ["a non-finite number", shot({ aim: NaN }), /stroke\.aim must be finite/],
        ["the top hand at the socket", shot({}, testProfile({ topHandHeight: 0.07 })), /arc radius must be positive/],
        ["the top hand off the shaft", shot({}, testProfile({ shaftLength: 0.5 })), /off the shaft/],
        ["the ball beyond the arc", shot({}, testProfile({ stance: { ballAhead: 0.8 } })), /ballAhead/],
        ["a non-positive speed", shot({ speed: 0 }), /stroke\.speed must be positive/],
        ["a drive beyond ±1", shot({ drive: 1.5 }), /stroke\.drive must lie in/],
        ["a contact off the face", shot({ contact: { up: 0.03, side: 0.02 } }), /off the face/],
        ["a non-positive window", shot({}, testProfile({ drive: { window: 0 } })), /window must be positive/],
        ["a negative speedGain", shot({}, testProfile({ drive: { speedGain: -0.1 } })), /speedGain must be non-negative/],
        ["a grip tension of 0", shot({}, testProfile({ stance: { gripTension: 0 } })), /gripTension must lie in/],
        ["a negative bodySpeed", shot({}, testProfile({ drive: { bodySpeed: -0.1 } })), /bodySpeed must be non-negative/],
        ["a bodySpeed above the speed", shot({}, testProfile({ drive: { bodySpeed: 4 } })), /no non-negative arc rate/],
        ["a head starting in the turf", shot({}, testProfile({ stance: { shaftLean: -0.3 } })), /the head starts in the turf/],
    ];

    it.each(cases)("rejects %s", (_name, setup, pattern) => {
        expect(() => buildContact(setup, WORLD)).toThrow(pattern);
    });
});
```

(Prettier wraps the long table rows. In "a head starting in the turf", tilting the face up 0.3 rad puts the rear rim
(h₀ − (R + L)·sin 0.3 − ρ·cos 0.3 ≈ −0.066 m) in the turf.)

- [ ] **Step 4: Run them to verify they fail**

Run: `npx vitest run tests/engine/swing/buildContact.test.ts`
Expected: FAIL. The suite cannot import `../../../src/engine/swing/buildContact`.

- [ ] **Step 5: Write `src/engine/swing/buildContact.ts`**

```ts
/**
 * The swing model (P2b.2b.1 design §5.2). From a ShotSetup and the world it derives the mallet head, its wooden face,
 * its state at t = 0 and the tracked drive:
 * 1. the arc radius r = topHandHeight − h₀ − ρ, h₀ being the striker's sunk centre height;
 * 2. the contact angle θ_c = atan2(ballAhead, √(r² − ballAhead²)), positive for a rising strike;
 * 3. the head's pitch about n at contact, −shaftLean whatever θ_c: shaftToHead turns −shaftLean − θ_c about the shaft
 *    frame's pitch axis;
 * 4. the face's point at (up, side) from its centre on the line through the sunk centre along −f, R + START_GAP from
 *    it; the head's centre L/2 behind the face's, the socket on top of the head;
 * 5. the pivot, r from the socket back along the arc;
 * 6. ω₀, the larger root of |V₀ + ω₀·n × (c − pivot)| = speed, V₀ = bodySpeed·aim;
 * 7. over the window, α = drive·speedGain·ω₀/window and A = drive·bodyAccel·aim;
 * 8. the head a solid cylinder of the profile's mallet, gripped with HAND_COUPLING at the stance's tension.
 * The head starts on its own path (headOnPath at t = 0), so the hands' spring and damper start slack.
 */
import { contactReference, malletReference } from "../../reference/index";
import { headLowestPoint } from "../impact/contacts";
import { rotate, solidCylinderInertia, type Quaternion } from "../impact/rigidBody";
import { HAND_COUPLING, headOnPath, pitchAxis, prepareTrack, swingOrientation } from "../impact/track";
import type { ContactState, FaceMaterial, MalletHead, SwingArc, TrackDrive } from "../impact/types";
import { atan2, sinCos } from "../math/elementary";
import { add, cross, dot, scale, sub, vec3 } from "../math/vec3";
import type { World } from "../types";
import type { ShotSetup } from "./types";

/**
 * Gap (m) between the face and the striker's sunk surface at t = 0 (design §5.2 step 4). Numerical, not physical: it
 * keeps rounding from starting the face inside the ball, and at 1 m/s the head closes it within a step.
 */
export const START_GAP = 1e-6;

/** The engine's face: wood (reference/mallet.json), with the sourced face–ball contact time. */
const WOOD: FaceMaterial = {
    restitution: malletReference.faceRestitution.value,
    friction: malletReference.faceFriction.value,
    contactTime: contactReference.faceBallContactTime.value,
};

function fail(message: string): never {
    throw new RangeError(message);
}

function finiteNumber(value: number, name: string): void {
    if (!Number.isFinite(value)) {
        fail(`${name} must be finite (got ${value})`);
    }
}

function positive(value: number, name: string): void {
    if (!(value > 0)) {
        fail(`${name} must be positive (got ${value})`);
    }
}

/**
 * The contact state of `setup` on `world` (design §5.2). Throws a RangeError naming the check (design §5.3) for:
 * - a striker absent from the setup, or a stroke type missing from the profile's stance or drive;
 * - a non-finite number, or a non-positive mallet dimension or mass;
 * - an arc radius r ≤ 0, or r > shaftLength (the top hand off the shaft);
 * - |ballAhead| ≥ r; speed ≤ 0; |drive| > 1; the contact off the face (√(up² + side²) ≥ the head's radius);
 * - window ≤ 0; speedGain < 0; gripTension outside (0, 1]; bodySpeed < 0;
 * - no non-negative ω₀ (the body alone moves the head faster than `speed`);
 * - the head's lowest point below the turf at t = 0.
 */
export function buildContact(setup: ShotSetup, world: World): ContactState {
    const { stroke, profile } = setup;
    const striker = setup.balls[setup.striker];
    if (!striker) {
        fail(`striker ${setup.striker} is not in the setup`);
    }
    const { type } = stroke;
    const stance = profile.stance[type];
    const push = profile.drive[type];
    if (!stance) {
        fail(`profile.stance has no entry for ${type}`);
    }
    if (!push) {
        fail(`profile.drive has no entry for ${type}`);
    }
    finiteNumber(stroke.aim, "stroke.aim");
    finiteNumber(stroke.speed, "stroke.speed");
    finiteNumber(stroke.drive, "stroke.drive");
    finiteNumber(stroke.contact.up, "stroke.contact.up");
    finiteNumber(stroke.contact.side, "stroke.contact.side");
    finiteNumber(profile.grip.topHandHeight, "profile.grip.topHandHeight");
    for (const [key, value] of Object.entries(stance)) {
        finiteNumber(value, `profile.stance.${type}.${key}`);
    }
    for (const [key, value] of Object.entries(push)) {
        finiteNumber(value, `profile.drive.${type}.${key}`);
    }
    const { mallet } = profile;
    for (const [key, value] of Object.entries(mallet)) {
        finiteNumber(value, `profile.mallet.${key}`);
        positive(value, `profile.mallet.${key}`);
    }

    const R = world.ball.radius;
    const surface = world.lawn.surfaceAt(striker.position);
    const sunk = R - (world.ball.mass * world.gravity) / surface.turfStiffness;
    const centre = vec3(striker.position.x, striker.position.y, sunk);
    const rho = mallet.headDiameter / 2;
    // Step 1: at address, the head level with its centre at the sunk centre, the socket is at h₀ + ρ.
    const radius = profile.grip.topHandHeight - sunk - rho;
    if (!(radius > 0)) {
        fail(`the arc radius must be positive (topHandHeight ${profile.grip.topHandHeight} m is at or below the socket)`);
    }
    if (radius > mallet.shaftLength) {
        fail(`the top hand is off the shaft: the arc radius ${radius} m exceeds shaftLength ${mallet.shaftLength} m`);
    }
    const { ballAhead, shaftLean, gripTension } = stance;
    if (!(Math.abs(ballAhead) < radius)) {
        fail(`|ballAhead| must be less than the arc radius ${radius} m (got ${ballAhead})`);
    }
    if (!(stroke.speed > 0)) {
        fail(`stroke.speed must be positive (got ${stroke.speed})`);
    }
    if (!(Math.abs(stroke.drive) <= 1)) {
        fail(`stroke.drive must lie in [-1, 1] (got ${stroke.drive})`);
    }
    const { up, side } = stroke.contact;
    if (!(Math.sqrt(up * up + side * side) < rho)) {
        fail(`the contact lies off the face: (${up}, ${side}) m from its centre, whose radius is ${rho} m`);
    }
    if (!(push.window > 0)) {
        fail(`profile.drive.${type}.window must be positive (got ${push.window})`);
    }
    if (!(push.speedGain >= 0)) {
        fail(`profile.drive.${type}.speedGain must be non-negative (got ${push.speedGain})`);
    }
    if (!(gripTension > 0 && gripTension <= 1)) {
        fail(`profile.stance.${type}.gripTension must lie in (0, 1] (got ${gripTension})`);
    }
    if (!(push.bodySpeed >= 0)) {
        fail(`profile.drive.${type}.bodySpeed must be non-negative (got ${push.bodySpeed})`);
    }

    // Step 2.
    const thetaC = atan2(ballAhead, Math.sqrt(radius * radius - ballAhead * ballAhead));
    // Step 3: the shaft frame's pitch axis is its −y; turning by φ about it is (cos φ/2, 0, −sin φ/2, 0).
    const [hs, hc] = sinCos((0 - shaftLean - thetaC) / 2);
    const shaftToHead: Quaternion = { w: hc, x: 0, y: 0 - hs, z: 0 };
    const [sa, ca] = sinCos(stroke.aim);
    const aim = vec3(ca, sa, 0);
    const orientation = swingOrientation(aim, shaftToHead, thetaC);
    // Step 4: f the face's outward normal (body x), its upward axis body z, `side` along body y (left of aim).
    const face = rotate(orientation, vec3(1, 0, 0));
    const upward = rotate(orientation, vec3(0, 0, 1));
    const left = rotate(orientation, vec3(0, 1, 0));
    const faceCentre = sub(sub(sub(centre, scale(face, R + START_GAP)), scale(upward, up)), scale(left, side));
    const headCentre = sub(faceCentre, scale(face, mallet.headLength / 2));
    const socket = add(headCentre, scale(upward, rho));
    // Step 5.
    const [st, ct] = sinCos(thetaC);
    const pivot = sub(socket, scale(sub(scale(aim, st), vec3(0, 0, ct)), radius));
    // Step 6: |w|²·ω² + 2·(V₀·w)·ω + |V₀|² − speed² = 0 with w = n × (c − pivot); the larger root.
    const pivotVelocity = scale(aim, push.bodySpeed);
    const lever = cross(pitchAxis(aim), sub(headCentre, pivot));
    const a = dot(lever, lever);
    const b = dot(pivotVelocity, lever);
    const c = dot(pivotVelocity, pivotVelocity) - stroke.speed * stroke.speed;
    const discriminant = b * b - a * c;
    const omega0 = discriminant >= 0 ? (Math.sqrt(discriminant) - b) / a : -1;
    if (!(omega0 >= 0)) {
        fail(
            `no non-negative arc rate gives stroke.speed ${stroke.speed} m/s: the body alone moves the head faster ` +
                `(bodySpeed ${push.bodySpeed} m/s)`,
        );
    }
    // Step 7.
    const arc: SwingArc = {
        pivot,
        pivotVelocity,
        pivotAcceleration: scale(aim, stroke.drive * push.bodyAccel),
        aim,
        radius,
        theta0: thetaC,
        omega0,
        alpha: (stroke.drive * push.speedGain * omega0) / push.window,
        window: push.window,
        shaftToHead,
    };
    const drive: TrackDrive = {
        kind: "track",
        arc,
        coupling: { period: HAND_COUPLING.period, dampingRatio: HAND_COUPLING.dampingRatio, tension: gripTension },
    };
    // Step 8.
    const head: MalletHead = {
        mass: mallet.headMass,
        inertia: solidCylinderInertia(mallet.headMass, mallet.headLength, rho),
        length: mallet.headLength,
        radius: rho,
        socket: vec3(0, 0, rho),
    };
    const start = headOnPath(prepareTrack(drive, head, world.gravity), head, 0);
    const clearance = headLowestPoint(start, head);
    if (clearance < 0) {
        fail(`the head starts in the turf: its lowest point is ${0 - clearance} m below it`);
    }
    return { head, face: WOOD, ...start, drive };
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/engine/swing/buildContact.test.ts`
Expected: PASS. If a canonical clearance differs from `CANONICAL_CLEARANCE` by more than 5e-7 m, print it; the
table must be corrected to the computed value, and the plan's decision bullet with it.

- [ ] **Step 7: Format, check, commit**

```bash
git add src/engine/swing src/engine/world.ts tests/engine/support/shot.ts tests/engine/swing/buildContact.test.ts
git commit -F "$CLAUDE_TEMP_DIR/msg.txt"   # "Add the swing model and the default profile"
```

---

### Task 8: The fault judge: 29.1.13 "plays away from" and 29.1.14

Spec §6.4. `StrokeContext` gains `aim?` and `lineOfCentres?` (see "Decisions made while planning"). 29.1.13 gains its
second clause, reported after the first. 29.1.14 is a possible fault under Law 29.2.3 when the head–turf pair has an
interval. `judgeFaults`'s signature is unchanged.

**Files:**
- Modify: `src/engine/faults.ts`, `tests/engine/faults.test.ts`

**Interfaces:**
- Consumes: `HEAD_TURF_KEY` (Task 6), `ImpactRun.headTurfSlide` (Task 6), `lawsReference.faults["29.1.14"]` (Task 2).
- Produces:
  - `StrokeContext.aim?: Vec3` and `StrokeContext.lineOfCentres?: Vec3`;
  - `JUDGED_LAWS`, with `"29.1.14"` after `"29.1.13"`;
  - findings `29.1.13 fault { angle }` and `29.1.14 possible-fault { penetration, peakForce, slide }`.

- [ ] **Step 1: Write the failing tests**

In `tests/engine/faults.test.ts`, import `vec3` beside `ZERO`, add `headTurfSlide?: number` to `impact()`'s parameter
type, and spread `...(over.headTurfSlide === undefined ? {} : { headTurfSlide: over.headTurfSlide })` at the end of
its returned object. Then append:

```ts
describe("judgeFaults: 29.1.13 'plays away from' and 29.1.14 (P2b.2b.1)", () => {
    const LINE = vec3(1, 0, 0);
    /** A swing direction `degrees` from the line of centres, built directly rather than through the engine's sinCos. */
    const towards = (degrees: number) => vec3(Math.cos((degrees * Math.PI) / 180), Math.sin((degrees * Math.PI) / 180), 0);
    const pressed = impact({ peakPenetration: { "blue/red": 1e-4 } });

    it("finds a croquet stroke played at more than 90° to the line of centres, and not at less", () => {
        expect(laws(judgeFaults({ ...CROQUET, aim: towards(89.9), lineOfCentres: LINE }, pressed))).toEqual([]);
        const away = judgeFaults({ ...CROQUET, aim: towards(90.1), lineOfCentres: LINE }, pressed);
        expect(laws(away)).toEqual(["29.1.13 fault"]);
        expect(away.findings[0]).toMatchObject({ ball: "red", t: pressed.duration });
        expect(away.findings[0]?.evidence.angle).toBeCloseTo((90.1 * Math.PI) / 180, 12);
    });

    it("reports both 29.1.13 clauses, 'fails to move or shake' first", () => {
        const both = judgeFaults({ ...CROQUET, aim: towards(150), lineOfCentres: LINE }, impact({}));
        expect(both.findings.map((f) => [f.law, Object.keys(f.evidence)])).toEqual([
            ["29.1.13", ["peakPenetration"]],
            ["29.1.13", ["angle"]],
        ]);
    });

    it("leaves 'plays away from' unjudged without a swing", () => {
        expect(laws(judgeFaults(CROQUET, pressed))).toEqual([]);
    });

    it("ignores aim outside a croquet stroke", () => {
        expect(laws(judgeFaults({ ...SINGLE, aim: towards(120) }, impact({})))).toEqual([]);
    });

    it("29.1.14: the head in the turf in a stroke of Law 29.2.3 is a possible fault, with its evidence", () => {
        const dug = impact({
            timeline: { "face/blue": [iv(0, 2 * T)], "head/turf": [iv(3 * T, 9 * T, 40), iv(12 * T, 13 * T, 55)] },
            peakPenetration: { "head/turf": 4e-4 },
            headTurfSlide: 0.012,
        });
        for (const context of [
            { ...SINGLE, hampered: true },
            { ...SINGLE, jumpAttempt: true },
            { ...SINGLE, group: true },
        ]) {
            const report = judgeFaults(context, dug);
            expect(laws(report)).toEqual(["29.1.14 possible-fault"]);
            expect(report.findings[0]).toMatchObject({
                ball: "blue",
                t: 3 * T,
                evidence: { penetration: 4e-4, peakForce: 55, slide: 0.012 },
            });
        }
        expect(laws(judgeFaults(SINGLE, dug))).toEqual([]);
    });

    it("reports 29.1.14 after 29.1.13", () => {
        const dug = impact({ timeline: { "head/turf": [iv(0, T)] } });
        expect(laws(judgeFaults({ ...CROQUET, group: true }, dug))).toEqual([
            "29.1.13 fault",
            "29.1.14 possible-fault",
        ]);
    });

    it("rejects an aim or a line of centres that is not a horizontal unit vector, and an aim without its line", () => {
        expect(() => judgeFaults({ ...CROQUET, aim: vec3(1, 0, 0.1), lineOfCentres: LINE }, pressed)).toThrow(
            /aim must be a horizontal unit vector/,
        );
        expect(() => judgeFaults({ ...CROQUET, aim: LINE, lineOfCentres: vec3(2, 0, 0) }, pressed)).toThrow(
            /lineOfCentres must be a horizontal unit vector/,
        );
        expect(() => judgeFaults({ ...CROQUET, aim: LINE }, pressed)).toThrow(/needs its lineOfCentres/);
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/engine/faults.test.ts`
Expected: FAIL, 5 tests. 29.1.13's angle and 29.1.14 are never found, and the rejections do not throw. "leaves
'plays away from' unjudged" and "ignores aim outside a croquet stroke" already pass.

- [ ] **Step 3: Judge them**

In `src/engine/faults.ts`:

Imports: add `HEAD_TURF_KEY` to the contacts import;
`import { atan2 } from "./math/elementary";` and `import { cross, dot, length, type Vec3 } from "./math/vec3";`.

Extend the file header after the 29.1.9 paragraph:

```ts
 *
 * 29.1.13 has two clauses, reported in this order and told apart by their evidence: "fails to move or shake" (the
 * croqueted pair never penetrates beyond CONTACT_TOLERANCE; evidence peakPenetration), and "plays away from" (the
 * swing direction more than 90° from the line of centres, C29.18.1; evidence angle), judged only when the context
 * carries the swing (P2b.2b.1 design §6.4).
 *
 * 29.1.14 (court damage) is a possible fault: a damaged lawn is something an adjudicator sees, and the Law judges its
 * effect on later strokes (C29.19.5), which the impact's plane turf does not keep. It is found when the head–turf
 * pair has an interval in a stroke of Law 29.2.3; no damage threshold is invented.
```

In `StrokeContext`, add after `group`:

```ts
    /**
     * The swing direction, unit and horizontal (P2b.2b.1 design §6.4); absent when the judge is called without a
     * swing. In a croquet stroke it decides 29.1.13's "plays away from", with `lineOfCentres`.
     */
    readonly aim?: Vec3;
    /**
     * Unit horizontal vector from the striker's centre to the croqueted ball's at the start; required with `aim` in a
     * croquet stroke, since the impact carries no starting positions.
     */
    readonly lineOfCentres?: Vec3;
```

`Finding`'s comment says "`evidence` holds measured quantities in s, m, N or rad (`contacts` is a count)".
`JUDGED_LAWS` gains `"29.1.14",` after `"29.1.13",`. Above `NONE`, add:

```ts
/** Tolerance on a unit vector's |v|² − 1 and vertical component. Numerical, not physical: a few ulps. */
const UNIT_TOLERANCE = 1e-12;

function horizontalUnit(v: Vec3 | undefined, name: string): void {
    if (v !== undefined && !(Math.abs(v.z) <= UNIT_TOLERANCE && Math.abs(dot(v, v) - 1) <= UNIT_TOLERANCE)) {
        fail(`${name} must be a horizontal unit vector`);
    }
}
```

At the end of `validate`, add:

```ts
    horizontalUnit(context.aim, "aim");
    horizontalUnit(context.lineOfCentres, "lineOfCentres");
    if (context.kind === "croquet" && context.aim !== undefined && context.lineOfCentres === undefined) {
        fail("a croquet stroke with an aim needs its lineOfCentres");
    }
```

and extend `judgeFaults`'s header list with "an aim or line of centres that is not a horizontal unit vector, or a
croquet stroke's aim without its line of centres".

Replace the 29.1.13 block with:

```ts
    // 29.1.13: a croquet stroke that never presses the croqueted ball beyond CONTACT_TOLERANCE ("fails to move or
    // shake"), then one played at more than 90° from the line of centres ("plays away from", C29.18.1).
    if (kind === "croquet") {
        const croqueted = context.croqueted as BallId;
        const depth = impact.peakPenetration[ballPairKey(striker, croqueted)] ?? 0;
        if (depth <= CONTACT_TOLERANCE) {
            add("29.1.13", "fault", croqueted, impact.duration, { peakPenetration: depth });
        }
        const { aim, lineOfCentres } = context;
        if (aim !== undefined && lineOfCentres !== undefined) {
            const along = dot(aim, lineOfCentres);
            if (along < 0) {
                const angle = atan2(length(cross(aim, lineOfCentres)), along);
                add("29.1.13", "fault", croqueted, impact.duration, { angle });
            }
        }
    }
    // 29.1.14: in a stroke of Law 29.2.3, the head pressed into the turf (a possible fault; see the file header).
    const turf = impact.timeline[HEAD_TURF_KEY];
    if ((context.hampered || context.jumpAttempt || context.group) && turf && turf.length > 0) {
        add("29.1.14", "possible-fault", striker, (turf[0] as ContactInterval).start, {
            penetration: impact.peakPenetration[HEAD_TURF_KEY] ?? 0,
            peakForce: turf.reduce((m, i) => Math.max(m, i.peakForce), 0),
            slide: impact.headTurfSlide ?? 0,
        });
    }
```

(The local `add` already shadows nothing: faults.ts imports no `add` from vec3, and must not.)

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/engine/faults.test.ts`
Expected: PASS, including the existing test that quotes every judged Law (29.1.14 is quoted by Task 2).

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Format, check, commit**

```bash
git add src/engine/faults.ts tests/engine/faults.test.ts
git commit -F "$CLAUDE_TEMP_DIR/msg.txt"   # "Judge 29.1.13's playing away and 29.1.14"
```

---

### Task 9: `simulateShot`

Spec §6.1–§6.3, exit criteria 3 and 4, and the mechanism tests of §8.1. `simulateShot` checks the setup, then runs
`buildContact`, `simulateImpact`, `strokeContext`, `judgeFaults` and `simulateFreeMotion(impact.handover, world)` in
that order. Phase 2 always runs.

**Files:**
- Create: `src/engine/shot.ts`, `tests/engine/shot.test.ts`

**Interfaces:**
- Consumes: `buildContact` (Task 7), `judgeFaults` and `StrokeContext.aim`/`.lineOfCentres` (Task 8), `simulateImpact`,
  `simulateFreeMotion`, `canonicalSetup` and `testProfile` (Task 7).
- Produces:
  - `interface ShotOutcome { contact: ContactState; context: StrokeContext; impact: ImpactResult; faults: FaultReport; motion: ShotResult }`;
  - `strokeContext(setup: ShotSetup, impact: ImpactResult): StrokeContext`;
  - `simulateShot(setup: ShotSetup, world?: World): ShotOutcome`.

- [ ] **Step 1: Write the failing tests**

Create `tests/engine/shot.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { judgeFaults } from "../../src/engine/faults";
import { IMPACT_DT, type ImpactSnapshot } from "../../src/engine/impact/integrate";
import { IDENTITY } from "../../src/engine/impact/rigidBody";
import { simulateImpact } from "../../src/engine/impact/simulateImpact";
import type { ContactInterval, ImpactResult } from "../../src/engine/impact/types";
import { ZERO, add, dot, length, scale, sub, vec3, type Vec3 } from "../../src/engine/math/vec3";
import { simulateShot, strokeContext } from "../../src/engine/shot";
import { simulateFreeMotion } from "../../src/engine/simulate";
import { buildContact } from "../../src/engine/swing/buildContact";
import { STROKE_TYPES, type ShotSetup, type StrokeType, type SwingProfile } from "../../src/engine/swing/types";
import type { BallState, Hoop, World } from "../../src/engine/types";
import { defaultWorld, hoopHalfSpan, hoopLateral } from "../../src/engine/world";
import { recorder } from "./support/impact";
import { CANONICAL_STRIKER, canonicalSetup, testProfile } from "./support/shot";

const WORLD = defaultWorld();
const R = WORLD.ball.radius;
const { x: X, y: Y } = CANONICAL_STRIKER;
const at = (x: number, y: number): BallState => ({ position: vec3(x, y, R), velocity: ZERO, angularVelocity: ZERO });

/** A hand-built impact for strokeContext: only the pairs touching at the start matter. */
function started(touchingAtStart: readonly string[]): ImpactResult {
    return {
        balls: {},
        head: { position: ZERO, orientation: IDENTITY, velocity: ZERO, angularVelocity: ZERO },
        duration: 0,
        events: [],
        peakPenetration: {},
        steps: 0,
        timeline: {},
        touchingAtStart,
        handover: {},
        overlapCorrection: 0,
    };
}

/** A canonical single-ball setup with red, black and yellow in a row beside blue, along +x. */
function withOthers(over: Partial<ShotSetup> = {}): ShotSetup {
    return {
        ...canonicalSetup("single-ball"),
        balls: { blue: at(X, Y), red: at(X + 2 * R, Y), black: at(X + 4 * R, Y), yellow: at(X + 6 * R, Y) },
        ...over,
    };
}

describe("strokeContext", () => {
    it("builds a croquet stroke's context: the croqueted ball, the swing and the line of centres", () => {
        const context = strokeContext(canonicalSetup("drive"), started(["blue/red"]));
        expect(context).toMatchObject({
            striker: "blue",
            kind: "croquet",
            croqueted: "red",
            live: [],
            hampered: false,
            jumpAttempt: false,
            group: false,
        });
        expect(length(sub(context.aim as Vec3, vec3(0, 1, 0)))).toBeLessThan(1e-12);
        expect(length(sub(context.lineOfCentres as Vec3, vec3(0, 1, 0)))).toBeLessThan(1e-12);
    });

    it("tells a continuation while touching from a single-ball stroke", () => {
        expect(strokeContext(withOthers({ continuation: true }), started(["blue/red"])).kind).toBe(
            "continuation-touching",
        );
        expect(strokeContext(withOthers({ continuation: true }), started([])).kind).toBe("single-ball");
        expect(strokeContext(withOthers(), started(["blue/red"])).kind).toBe("single-ball");
    });

    it("finds the striker's ball in a 3-ball or 4-ball group, and not in a pair alone", () => {
        const s = withOthers();
        expect(strokeContext(s, started(["blue/red"])).group).toBe(false);
        expect(strokeContext(s, started(["blue/red", "red/black"])).group).toBe(true);
        expect(strokeContext(s, started(["blue/red", "blue/black"])).group).toBe(true);
        expect(strokeContext(s, started(["blue/red", "red/black", "black/yellow"])).group).toBe(true);
        expect(strokeContext(s, started(["red/black", "black/yellow"])).group).toBe(false);
        expect(strokeContext(s, started(["blue@1/a", "blue/red"])).group).toBe(false);
    });

    it("copies live, hampered and jumpAttempt", () => {
        const setup = withOthers({ live: ["red", "yellow"], hampered: true, jumpAttempt: true });
        expect(strokeContext(setup, started([]))).toMatchObject({
            live: ["red", "yellow"],
            hampered: true,
            jumpAttempt: true,
        });
    });
});

describe("simulateShot", () => {
    it.each(STROKE_TYPES)("runs the %s canonical setup end to end (exit criterion 4)", (type) => {
        const outcome = simulateShot(canonicalSetup(type));
        expect(outcome.motion.aborted).toBe(false);
        expect(outcome.impact.timeline["face/blue"]?.length).toBeGreaterThan(0);
    });

    it("runs each stage in turn, and hands phase 2 exactly the impact's handover", () => {
        const setup = canonicalSetup("half-roll");
        const outcome = simulateShot(setup);
        expect(outcome.contact).toEqual(buildContact(setup, WORLD));
        expect(outcome.impact).toEqual(simulateImpact(outcome.contact, setup.balls, WORLD));
        expect(outcome.context).toEqual(strokeContext(setup, outcome.impact));
        expect(outcome.faults).toEqual(judgeFaults(outcome.context, outcome.impact));
        expect(outcome.motion).toEqual(simulateFreeMotion(outcome.impact.handover, WORLD));
    });

    it("ends a gentle tap before the cap", () => {
        const setup = canonicalSetup("single-ball");
        const kinds = simulateShot({ ...setup, stroke: { ...setup.stroke, speed: 0.1 } }).impact.events.map(
            (e) => e.kind,
        );
        expect(kinds).not.toContain("impact-cap");
        expect(kinds).not.toContain("impact-head-approaching");
    });

    it("finds a crush when the tracked head drives the ball into an upright", () => {
        const hoop = WORLD.hoops[0] as Hoop;
        const upright = vec3(X, Y + R + hoop.uprightRadius, 0);
        const centre = add(upright, scale(hoopLateral(hoop), -hoopHalfSpan(hoop)));
        const world: World = { ...WORLD, hoops: [{ ...hoop, centre }] };
        const outcome = simulateShot(canonicalSetup("single-ball", world), world);
        expect(outcome.faults.findings.map((f) => f.law)).toContain("29.1.8");
        expect(outcome.motion.aborted).toBe(false);
    });

    const croquet = canonicalSetup("drive");
    const rejections: readonly [string, ShotSetup, RegExp][] = [
        ["an absent striker", { ...withOthers(), striker: "red", balls: { blue: at(X, Y) } }, /striker red is not in/],
        ["a live ball not in the setup", { ...canonicalSetup("single-ball"), live: ["black"] }, /live ball black/],
        ["the striker live", { ...withOthers(), live: ["blue"] }, /cannot be live/],
        ["a live ball listed twice", { ...withOthers(), live: ["red", "red"] }, /listed twice/],
        ["a croquet stroke without a croqueted ball", { ...withOthers(), stroke: croquet.stroke }, /needs a croqueted/],
        ["the striker croqueted", { ...croquet, croqueted: "blue" }, /cannot be the striker/],
        ["a croqueted ball not in the setup", { ...croquet, croqueted: "yellow" }, /croqueted ball yellow is not in/],
        [
            "a croqueted ball not touching",
            { ...croquet, balls: { ...croquet.balls, red: at(X, Y + 2 * R + 0.01) } },
            /must touch the striker/,
        ],
        ["a croqueted ball in a single-ball stroke", { ...withOthers(), croqueted: "red" }, /only for a croquet stroke/],
        ["a non-positive lawn speed", { ...canonicalSetup("single-ball"), lawnSpeed: 0 }, /lawnSpeed/],
        ["a lawn speed the default world cannot use", { ...canonicalSetup("single-ball"), lawnSpeed: 1 }, /rollingResist/],
    ];

    it.each(rejections)("rejects %s", (_name, setup, pattern) => {
        expect(() => simulateShot(setup)).toThrow(pattern);
    });
});

/**
 * One canonical stroke with `profile`, `drive` and `up`, probed; the hands' and the turf's braking impulses along aim
 * (design §3.7), from the end of the first face–ball interval to the end of the impact.
 */
function braking(profile: SwingProfile, type: StrokeType, drive: number, up = 0) {
    const base = canonicalSetup(type, WORLD, profile);
    const setup = { ...base, stroke: { ...base.stroke, drive, contact: { up, side: 0 } } };
    const probe = recorder();
    const impact = simulateImpact(buildContact(setup, WORLD), setup.balls, WORLD, { probe });
    const aim = vec3(0, 1, 0);
    const faceEnd = (impact.timeline["face/blue"]?.[0] as ContactInterval).end;
    let hands = 0;
    let turf = 0;
    for (const s of probe.snapshots) {
        // A snapshot's t is its step's end; the step starting at faceEnd is the first after the interval.
        if (s.t <= faceEnd) {
            continue;
        }
        const hand = s.hand as { force: Vec3; feedForward: Vec3 };
        hands -= dot(sub(hand.force, hand.feedForward), aim) * IMPACT_DT;
        turf -= dot(s.headTurf ?? ZERO, aim) * IMPACT_DT;
    }
    return { impact, hands, turf };
}

describe("the tracked drive in whole strokes", () => {
    it("leaves the head free in a 3 m/s centre strike: the hands' impulse is at most 5 % of the transfer", () => {
        // Exit criterion 3, at HAND_COUPLING with a firm grip.
        const setup = canonicalSetup("single-ball");
        const probe = recorder();
        simulateImpact(buildContact(setup, WORLD), setup.balls, WORLD, { probe });
        const steps = probe.snapshots;
        const inFace = (s: ImpactSnapshot): boolean => s.contacts.some((c) => c.key === "face/blue");
        const first = steps.findIndex(inFace);
        expect(first).toBeGreaterThanOrEqual(0);
        let last = first;
        while (last + 1 < steps.length && inFace(steps[last + 1] as ImpactSnapshot)) {
            last++;
        }
        let hands = 0;
        for (let i = first; i <= last; i++) {
            const hand = (steps[i] as ImpactSnapshot).hand as { force: Vec3; feedForward: Vec3 };
            hands += length(sub(hand.force, hand.feedForward)) * IMPACT_DT;
        }
        const before = first > 0 ? ((steps[first - 1] as ImpactSnapshot).balls[0] as BallState).velocity : ZERO;
        const after = ((steps[last] as ImpactSnapshot).balls[0] as BallState).velocity;
        expect(hands / (WORLD.ball.mass * length(sub(after, before)))).toBeLessThanOrEqual(0.05);
    });

    it("brakes a rising strike, face tilted up, relaxed grip and check, through the turf after contact", () => {
        const profile = testProfile({
            stance: { ballAhead: 0.13, shaftLean: -0.07, gripTension: 0.1 },
            drive: { speedGain: 1, window: 0.01 },
        });
        const { impact, turf } = braking(profile, "stop-ac", -1, -0.012);
        const dug = impact.timeline["head/turf"]?.[0] as ContactInterval;
        expect(dug).toBeDefined();
        expect(dug.start).toBeGreaterThanOrEqual((impact.timeline["face/blue"]?.[0] as ContactInterval).start);
        expect(turf).toBeGreaterThan(0);
    });

    it("brakes a level, firmly gripped strike harder through the hands when checked", () => {
        const profile = testProfile({ drive: { speedGain: 1, window: 0.01 } });
        expect(braking(profile, "stop-gc", -1).hands).toBeGreaterThan(braking(profile, "stop-gc", 0).hands);
    });

    it("sends the striker's ball faster with the pass roll's punch", () => {
        const profile = testProfile({
            stance: { ballAhead: -0.08, shaftLean: 0.7, gripTension: 1 },
            drive: { speedGain: 0.5, bodySpeed: 0.4, bodyAccel: 10, window: 0.015 },
        });
        const speed = (drive: number) =>
            length((braking(profile, "pass-roll", drive).impact.handover.blue as BallState).velocity);
        expect(speed(1)).toBeGreaterThan(speed(0));
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/engine/shot.test.ts`
Expected: FAIL. The suite cannot import `../../src/engine/shot`.

- [ ] **Step 3: Write `src/engine/shot.ts`**

```ts
/**
 * A whole shot (P2b.2b.1 design §6). The swing model builds the contact, the impact integrates it, the fault judge
 * rules on it, and phase 2 rolls the balls out. Phase 2 always runs: impact flags and findings are information, as
 * phase 2's jump flag is. `judgeHoopRun` stays a separate call on the phase 2 result.
 */
import { CONTACT_TOLERANCE } from "./detect";
import { judgeFaults, type FaultReport, type StrokeContext } from "./faults";
import { ballPairKey } from "./impact/contacts";
import { simulateImpact } from "./impact/simulateImpact";
import type { ContactState, ImpactResult } from "./impact/types";
import { sinCos } from "./math/elementary";
import { horizontal, length, normalize, sub, vec3 } from "./math/vec3";
import { simulateFreeMotion } from "./simulate";
import { buildContact } from "./swing/buildContact";
import { CROQUET_STROKES, type ShotSetup } from "./swing/types";
import { BALL_IDS, type BallId, type BallState, type ShotResult, type World } from "./types";
import { defaultWorld, validateWorld } from "./world";

/** Everything a shot produced, stage by stage (design §6.1). */
export interface ShotOutcome {
    readonly contact: ContactState;
    readonly context: StrokeContext;
    readonly impact: ImpactResult;
    readonly faults: FaultReport;
    readonly motion: ShotResult;
}

function fail(message: string): never {
    throw new RangeError(message);
}

/**
 * Checks a setup before the swing model sees it (design §6.2): the striker present; `live` holding only present balls,
 * never the striker, no duplicates; a croquet stroke's croqueted ball present, not the striker, touching the striker
 * (within CONTACT_TOLERANCE); no croqueted ball in a single-ball stroke.
 */
function validateSetup(setup: ShotSetup, world: World): void {
    const { balls, striker, croqueted } = setup;
    const strikerBall = balls[striker];
    if (!strikerBall) {
        fail(`striker ${striker} is not in the setup`);
    }
    const seen: BallId[] = [];
    for (const id of setup.live) {
        if (!balls[id]) {
            fail(`live ball ${id} is not in the setup`);
        }
        if (id === striker) {
            fail(`the striker ${striker} cannot be live`);
        }
        if (seen.includes(id)) {
            fail(`live ball ${id} is listed twice`);
        }
        seen.push(id);
    }
    const { type } = setup.stroke;
    if (!CROQUET_STROKES.includes(type)) {
        if (croqueted !== undefined) {
            fail(`croqueted is given only for a croquet stroke (got ${type})`);
        }
        return;
    }
    if (croqueted === undefined) {
        fail(`a ${type} stroke needs a croqueted ball`);
    }
    if (croqueted === striker) {
        fail(`the croqueted ball cannot be the striker ${striker}`);
    }
    const other = balls[croqueted];
    if (!other) {
        fail(`croqueted ball ${croqueted} is not in the setup`);
    }
    const gap = length(sub(other.position, strikerBall.position)) - 2 * world.ball.radius;
    if (!(gap <= CONTACT_TOLERANCE)) {
        fail(`croqueted ball ${croqueted} must touch the striker (gap ${gap} m)`);
    }
}

/**
 * The fault judge's context for `setup`, given its impact (design §6.3): the kind of stroke; whether the striker's
 * ball is in a group (Glossary, "Group of balls", over the ball–ball pairs touching at the start); the swing direction;
 * and, for a croquet stroke, the line of centres.
 */
export function strokeContext(setup: ShotSetup, impact: ImpactResult): StrokeContext {
    const { striker, balls } = setup;
    const present = BALL_IDS.filter((id) => balls[id] !== undefined);
    const touching = (a: BallId, b: BallId): boolean => a !== b && impact.touchingAtStart.includes(ballPairKey(a, b));
    const croquet = CROQUET_STROKES.includes(setup.stroke.type);
    // A 3-ball group is one ball touching two others, a 4-ball group a fourth touching a 3-ball group: the striker's
    // ball is in one exactly when the balls it is connected to by touching pairs number three or more.
    const connected: BallId[] = [striker];
    for (let i = 0; i < connected.length; i++) {
        for (const id of present) {
            if (!connected.includes(id) && touching(connected[i] as BallId, id)) {
                connected.push(id);
            }
        }
    }
    const touchingAny = present.some((id) => touching(striker, id));
    const kind = croquet ? "croquet" : setup.continuation && touchingAny ? "continuation-touching" : "single-ball";
    const [s, c] = sinCos(setup.stroke.aim);
    const context: StrokeContext = {
        striker,
        kind,
        live: setup.live,
        hampered: setup.hampered,
        jumpAttempt: setup.jumpAttempt,
        group: connected.length >= 3,
        aim: vec3(c, s, 0),
    };
    if (!croquet) {
        return context;
    }
    const croqueted = setup.croqueted as BallId;
    const from = (balls[striker] as BallState).position;
    const to = (balls[croqueted] as BallState).position;
    return { ...context, croqueted, lineOfCentres: normalize(horizontal(sub(to, from))) };
}

/**
 * Simulates a whole shot (design §6.1): checks the setup, then runs buildContact, simulateImpact, strokeContext,
 * judgeFaults and simulateFreeMotion(impact.handover) in that order. `world` defaults to
 * defaultWorld(setup.lawnSpeed). Throws the named RangeError of whichever stage rejects the input: a lawn speed that
 * is not positive or that the default world cannot use, a setup check (validateSetup), the swing model's checks, or
 * the impact's.
 */
export function simulateShot(setup: ShotSetup, world?: World): ShotOutcome {
    if (!(setup.lawnSpeed > 0) || !Number.isFinite(setup.lawnSpeed)) {
        fail(`lawnSpeed must be a positive finite number (got ${setup.lawnSpeed})`);
    }
    const w = world ?? defaultWorld(setup.lawnSpeed);
    validateWorld(w);
    validateSetup(setup, w);
    const contact = buildContact(setup, w);
    const impact = simulateImpact(contact, setup.balls, w);
    const context = strokeContext(setup, impact);
    const faults = judgeFaults(context, impact);
    const motion = simulateFreeMotion(impact.handover, w);
    return { contact, context, impact, faults, motion };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/engine/shot.test.ts`
Expected: PASS. Exit criterion 3 holds once `HAND_COUPLING.period` is the pre-flight search's value. If a mechanism
test fails (braking, punch, gentle tap, crush), print the impulses or events and report them. These rest on the
model's behaviour, and a change of expectation is the user's decision.

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Format, check, commit**

```bash
git add src/engine/shot.ts tests/engine/shot.test.ts
git commit -F "$CLAUDE_TEMP_DIR/msg.txt"   # "Add simulateShot: swing, impact, faults and phase 2 in one call"
```

---

### Task 10: Exports and version 0.6.0

Spec §6.5 and exit criterion 5, then the final bit-identity checks of exit criterion 2.

**Files:**
- Modify: `src/engine/index.ts`, `src/engine/simulate.ts`, `tests/engine/index.test.ts`,
  `tests/engine/impact/simulateImpact.test.ts`

**Interfaces:**
- Produces: the public API of spec §6.5.

- [ ] **Step 1: Write the failing tests**

In `tests/engine/impact/simulateImpact.test.ts`, the version test becomes:

```ts
    it("is version 0.6.0", () => {
        expect(ENGINE_VERSION).toBe("0.6.0");
    });
```

Append to the `describe` in `tests/engine/index.test.ts`:

```ts
    it("exposes the whole shot, the impact and the fault judge (P2b.2b.1)", () => {
        expect(typeof engine.simulateShot).toBe("function");
        expect(typeof engine.simulateImpact).toBe("function");
        expect(typeof engine.judgeFaults).toBe("function");
        expect(engine.CROQUET_STROKES).toEqual(["drive", "stop-ac", "stop-gc", "half-roll", "full-roll", "pass-roll"]);
        expect(engine.defaultProfile.mallet.headMass).toBeGreaterThan(0);
        expect(engine.ENGINE_VERSION).toBe("0.6.0");
    });

    it("simulates a whole single-ball shot on the default world", () => {
        const world = engine.defaultWorld();
        const still = engine.vec3(0, 0, 0);
        const setup: engine.ShotSetup = {
            balls: { blue: { position: engine.vec3(9.6, 4, world.ball.radius), velocity: still, angularVelocity: still } },
            striker: "blue",
            stroke: { type: "single-ball", aim: Math.PI / 2, speed: 2, drive: 0, contact: { up: 0, side: 0 } },
            live: [],
            continuation: false,
            hampered: false,
            jumpAttempt: false,
            lawnSpeed: 12,
            profile: engine.defaultProfile,
        };
        const outcome = engine.simulateShot(setup);
        expect(outcome.motion.aborted).toBe(false);
        expect(outcome.motion.rest.blue?.y).toBeGreaterThan(4);
    });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/engine/index.test.ts tests/engine/impact/simulateImpact.test.ts`
Expected: FAIL. `expected '0.5.0' to be '0.6.0'`, and `engine.simulateShot is not a function`.

- [ ] **Step 3: Export and bump**

In `src/engine/simulate.ts`, set `export const ENGINE_VERSION = "0.6.0";`. Replace `src/engine/index.ts`'s exports
with:

```ts
export { judgeFaults, type FaultReport, type Finding, type StrokeContext } from "./faults";
export { judgeHoopRun, type HoopRunVerdict, type HoopTarget } from "./hoopRun";
export { simulateImpact } from "./impact/simulateImpact";
export type { ContactState, Coupling, Drive, ImpactEvent, ImpactResult, SwingArc } from "./impact/types";
export { vec3, type Vec3 } from "./math/vec3";
export { stateAtTime } from "./sample";
export { simulateShot, type ShotOutcome } from "./shot";
export { ENGINE_VERSION, simulateFreeMotion } from "./simulate";
export { defaultProfile } from "./swing/profile";
export { CROQUET_STROKES, type ShotSetup, type StrokeType, type SwingProfile } from "./swing/types";
export {
    BALL_IDS,
    type BallId,
    type BallParams,
    type BallState,
    type BallStates,
    type ContactMaterial,
    type Cylinder,
    type Hoop,
    type Lawn,
    type MotionParams,
    type MotionPhase,
    type OffsetRule,
    type PushMotion,
    type Segment,
    type ShotEvent,
    type ShotResult,
    type SurfaceProps,
    type World,
} from "./types";
export { STANDARD_GRAVITY, defaultWorld } from "./world";
```

(keeping the header comment).

- [ ] **Step 4: Run every check, and the final bit-identity checks**

Run: `npm test`, `npm run check`, `npm run lint`, `npm run format:check`
Expected: all pass.

Run: `env OBSTACLE_STROKES=2000 npx --yes tsx scripts/impactDigest.ts > "$CLAUDE_TEMP_DIR/digest-10.txt"`
Run: `cmp "$CLAUDE_TEMP_DIR/digest-base.txt" "$CLAUDE_TEMP_DIR/digest-10.txt"`
Expected: no output.

Run: `npx --yes tsx scripts/shotMix.ts`
Expected: work units p99 143,084, p99.9 362,050, max 408,030 exactly.

Run: `env SLOW_TESTS=1 npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/engine/index.ts src/engine/simulate.ts tests/engine/index.test.ts tests/engine/impact/simulateImpact.test.ts
git commit -F "$CLAUDE_TEMP_DIR/msg.txt"   # "Export simulateShot, simulateImpact and judgeFaults; engine 0.6.0"
```

---

### Task 11: The swing probe and the roadmap outcomes

Spec §9 and exit criterion 4's record. Pre-flight runs every section and folds the figures into this plan and the
roadmap (see "Pre-flight"). The real run re-runs the probe, which is deterministic apart from its timings. Its lines
must match pre-flight's; the outcomes are then recorded.

**Files:**
- Create: `scripts/swingProbe.ts`
- Modify: `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`

**Interfaces:**
- Consumes:
  - `buildContact`, `canonicalSetup`, `STROKE_TYPES`;
  - `simulateImpact`, `simulateFreeMotion`;
  - `prepareTrack`, `pathAt`, `HAND_COUPLING`, `TRACK_IMPACT_CAP`;
  - `recorder`, `socketAt`, `strike`.

- [ ] **Step 1: Write the probe**

Create `scripts/swingProbe.ts`:

```ts
/**
 * Swing probe (P2b.2b.1 design §9: pre-flight measurements, recorded in the roadmap, not gated). On the default world
 * with the default profile's canonical setups (tests/engine/support/shot.ts), reports:
 * - search: the shortest hand-coupling period T, from 40 ms in 1 ms steps at ζ = 0.7, for which the hands' impulse in
 *   the canonical 3 m/s single-ball strike is at most 5 % of the transfer (design §3.4);
 * - sweep: T 10–200 ms × ζ 0.2–1 over every canonical setup: the hands' impulse share and peak force in the strike,
 *   the path lag at the window's end, and the croqueted ÷ striker distance (an observation only);
 * - tracking: the largest socket and orientation errors from the path over TRACK_IMPACT_CAP with no ball;
 * - timing: tracked impacts' µs/step against force-table strikes from the same spot;
 * - presets: each preset over speed × drive × contact, counting impact-head-deep, impact-cap and
 *   impact-head-approaching, with the longest impact that ended before the cap.
 * Run with `npx --yes tsx scripts/swingProbe.ts`; environment: SECTION (one of the names above; default all), REPEAT
 * (timed runs per stroke, default 50). Not part of the test suite; its output goes into the roadmap's outcomes.
 */
import { IMPACT_DT, TRACK_IMPACT_CAP, type ImpactSnapshot } from "../src/engine/impact/integrate";
import { multiply, solidCylinderInertia, type Quaternion } from "../src/engine/impact/rigidBody";
import { simulateImpact } from "../src/engine/impact/simulateImpact";
import { HAND_COUPLING, pathAt, prepareTrack } from "../src/engine/impact/track";
import type { ContactState, FaceMaterial, MalletHead, TrackDrive } from "../src/engine/impact/types";
import { ZERO, length, sub, vec3, type Vec3 } from "../src/engine/math/vec3";
import { simulateFreeMotion } from "../src/engine/simulate";
import { buildContact } from "../src/engine/swing/buildContact";
import { STROKE_TYPES, type ShotSetup } from "../src/engine/swing/types";
import type { BallId, BallState } from "../src/engine/types";
import { defaultWorld } from "../src/engine/world";
import { contactReference, malletReference } from "../src/reference/index";
import { recorder, socketAt, strike } from "../tests/engine/support/impact";
import { canonicalSetup } from "../tests/engine/support/shot";

// The project has no Node types; this script runs under tsx and reads only its environment.
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

const SECTION = process.env.SECTION ?? "all";
const REPEAT = Number(process.env.REPEAT ?? "50");
const WORLD = defaultWorld();
const fmt = (x: number, digits = 4): string => x.toFixed(digits);

/** `contact` with its coupling's period and damping ratio replaced, its grip tension kept. */
function withCoupling(contact: ContactState, period: number, dampingRatio: number): ContactState {
    const drive = contact.drive as TrackDrive;
    return { ...contact, drive: { ...drive, coupling: { ...drive.coupling, period, dampingRatio } } };
}

/** The impact of `contact` on `setup`'s balls, with every snapshot. */
function probed(contact: ContactState, setup: ShotSetup) {
    const probe = recorder();
    const impact = simulateImpact(contact, setup.balls, WORLD, { probe });
    return { impact, steps: probe.snapshots };
}

/** Over the first face–blue interval: the hands' impulse beyond the feed-forward ÷ blue's momentum change, and peak. */
function inStrike(steps: readonly ImpactSnapshot[]): { readonly share: number; readonly peak: number } {
    const inFace = (s: ImpactSnapshot): boolean => s.contacts.some((c) => c.key === "face/blue");
    const first = steps.findIndex(inFace);
    if (first < 0) {
        return { share: NaN, peak: NaN };
    }
    let last = first;
    while (last + 1 < steps.length && inFace(steps[last + 1] as ImpactSnapshot)) {
        last++;
    }
    let impulse = 0;
    let peak = 0;
    for (let i = first; i <= last; i++) {
        const hand = (steps[i] as ImpactSnapshot).hand;
        const f = hand ? length(sub(hand.force, hand.feedForward)) : 0;
        impulse += f * IMPACT_DT;
        peak = Math.max(peak, f);
    }
    const before = first > 0 ? ((steps[first - 1] as ImpactSnapshot).balls[0] as BallState).velocity : ZERO;
    const after = ((steps[last] as ImpactSnapshot).balls[0] as BallState).velocity;
    return { share: impulse / (WORLD.ball.mass * length(sub(after, before))), peak };
}

/** Croqueted ÷ striker distance from the start to rest after phase 2; NaN for a single-ball stroke. */
function ratio(setup: ShotSetup, handover: Parameters<typeof simulateFreeMotion>[0]): number {
    const croqueted = setup.croqueted;
    if (croqueted === undefined) {
        return NaN;
    }
    const rest = simulateFreeMotion(handover, WORLD).rest;
    const travel = (id: BallId): number =>
        length(sub(rest[id] as Vec3, (setup.balls[id] as BallState).position));
    return travel(croqueted) / travel(setup.striker);
}

function search(): void {
    console.log("== Hand coupling search (design §3.4): shortest T at ζ = 0.7 with the hands' impulse ≤ 5 % ==");
    const setup = canonicalSetup("single-ball", WORLD);
    const base = buildContact(setup, WORLD);
    for (let ms = 40; ms <= 200; ms++) {
        const { share } = inStrike(probed(withCoupling(base, ms / 1000, 0.7), setup).steps);
        if (ms % 10 === 0 || share <= 0.05) {
            console.log(`T ${ms} ms: ${fmt(share * 100, 2)} %`);
        }
        if (share <= 0.05) {
            console.log(`chosen: T = ${ms / 1000} s (contact.json has ${HAND_COUPLING.period} s)`);
            return;
        }
    }
    console.log("no T up to 200 ms meets the criterion");
}

function sweep(): void {
    console.log("== Coupling sweep: T × ζ over the canonical setups ==");
    for (const ms of [10, 20, 40, 80, 120, 160, 200]) {
        for (const zeta of [0.2, 0.4, 0.7, 1]) {
            for (const type of STROKE_TYPES) {
                const setup = canonicalSetup(type, WORLD);
                const contact = withCoupling(buildContact(setup, WORLD), ms / 1000, zeta);
                const { impact, steps } = probed(contact, setup);
                const { share, peak } = inStrike(steps);
                const drive = contact.drive as TrackDrive;
                const track = prepareTrack(drive, contact.head, WORLD.gravity);
                const end = steps.find((s) => s.t >= drive.arc.window);
                const lag = end ? length(sub(socketAt(end.head, contact.head), pathAt(track, end.t).socket)) : NaN;
                console.log(
                    `T ${String(ms).padStart(3)} ms ζ ${fmt(zeta, 1)} ${type.padEnd(11)} hands ${fmt(share * 100, 2)} % ` +
                        `peak ${fmt(peak, 1)} N lag ${fmt(lag * 1e3, 3)} mm ratio ${fmt(ratio(setup, impact.handover), 2)} ` +
                        `[${impact.events.map((e) => e.kind).join(", ")}]`,
                );
            }
        }
    }
}

/** Rotation angle (rad) from orientation b to a. */
function angleBetween(a: Quaternion, b: Quaternion): number {
    const e = multiply(a, { w: b.w, x: -b.x, y: -b.y, z: -b.z });
    return 2 * length(vec3(e.x, e.y, e.z));
}

function tracking(): void {
    console.log(`== Tracking with no ball over ${TRACK_IMPACT_CAP} s at HAND_COUPLING (a relaxed grip sags) ==`);
    for (const type of STROKE_TYPES) {
        const contact = buildContact(canonicalSetup(type, WORLD), WORLD);
        const track = prepareTrack(contact.drive as TrackDrive, contact.head, WORLD.gravity);
        let socket = 0;
        let angle = 0;
        simulateImpact(contact, {}, WORLD, {
            probe: {
                step(s) {
                    const p = pathAt(track, s.t);
                    socket = Math.max(socket, length(sub(socketAt(s.head, contact.head), p.socket)));
                    angle = Math.max(angle, angleBetween(p.orientation, s.head.orientation));
                },
            },
        });
        console.log(`${type.padEnd(11)} socket ${socket.toExponential(2)} m, angle ${angle.toExponential(2)} rad`);
    }
}

function timing(): void {
    console.log(`== Impact time per step (${REPEAT} runs after 5 warm-up) ==`);
    const time = (name: string, contact: ContactState, setup: ShotSetup): void => {
        for (let i = 0; i < 5; i++) {
            simulateImpact(contact, setup.balls, WORLD);
        }
        const times: number[] = [];
        let steps = 0;
        for (let i = 0; i < REPEAT; i++) {
            const start = performance.now();
            steps = simulateImpact(contact, setup.balls, WORLD).steps;
            times.push(performance.now() - start);
        }
        times.sort((a, b) => a - b);
        const median = times[Math.floor(times.length / 2)] as number;
        console.log(
            `${name.padEnd(16)} ${steps} steps: median ${fmt(median, 3)} ms (${fmt((median * 1e3) / steps, 3)} µs/step)`,
        );
    };
    for (const type of STROKE_TYPES) {
        const setup = canonicalSetup(type, WORLD);
        time(`tracked ${type}`, buildContact(setup, WORLD), setup);
    }
    const radius = malletReference.headDiameter.value / 2;
    const head: MalletHead = {
        mass: malletReference.headMass.value,
        inertia: solidCylinderInertia(malletReference.headMass.value, malletReference.headLength.value, radius),
        length: malletReference.headLength.value,
        radius,
        socket: vec3(0, 0, radius),
    };
    const face: FaceMaterial = {
        restitution: malletReference.faceRestitution.value,
        friction: malletReference.faceFriction.value,
        contactTime: contactReference.faceBallContactTime.value,
    };
    for (const type of ["single-ball", "drive"] as const) {
        const setup = canonicalSetup(type, WORLD);
        const blue = (setup.balls.blue as BallState).position;
        time(`force ${type}`, strike(blue, { head, face, speed: 3, yaw: Math.PI / 2 }), setup);
    }
}

function presets(): void {
    console.log("== Preset sweep: speed × drive × contact for each preset ==");
    for (const type of STROKE_TYPES) {
        const base = canonicalSetup(type, WORLD);
        const up0 = base.stroke.contact.up;
        let runs = 0;
        let rejected = 0;
        let deep = 0;
        let capped = 0;
        let approaching = 0;
        let longest = 0;
        for (const speed of [1, 2, 3, 4, 6]) {
            for (const drive of [-1, -0.5, 0, 0.5, 1]) {
                for (const up of [up0 - 0.003, up0, up0 + 0.003]) {
                    for (const side of [-0.01, 0, 0.01]) {
                        const setup = { ...base, stroke: { ...base.stroke, speed, drive, contact: { up, side } } };
                        let contact: ContactState;
                        try {
                            contact = buildContact(setup, WORLD);
                        } catch (error) {
                            if (error instanceof RangeError) {
                                rejected++;
                                continue;
                            }
                            throw error;
                        }
                        const impact = simulateImpact(contact, setup.balls, WORLD);
                        runs++;
                        const kinds = impact.events.map((e) => e.kind);
                        deep += kinds.includes("impact-head-deep") ? 1 : 0;
                        approaching += kinds.includes("impact-head-approaching") ? 1 : 0;
                        if (kinds.includes("impact-cap")) {
                            capped++;
                        } else {
                            longest = Math.max(longest, impact.duration);
                        }
                    }
                }
            }
        }
        console.log(
            `${type.padEnd(11)} ${runs} runs (${rejected} rejected): impact-head-deep ${deep}, impact-cap ${capped}, ` +
                `impact-head-approaching ${approaching}; longest before the cap ${fmt(longest * 1e3, 2)} ms`,
        );
    }
}

const SECTIONS: Readonly<Record<string, () => void>> = { search, sweep, tracking, timing, presets };
for (const [name, section] of Object.entries(SECTIONS)) {
    if (SECTION === "all" || SECTION === name) {
        section();
    }
}
```

- [ ] **Step 2: Run the probe**

Run: `npx --yes tsx scripts/swingProbe.ts`
Expected: every section prints. The `search` line reads `chosen: T = <x> s (contact.json has <x> s)`, the two
equal. The deterministic lines (search, sweep, tracking, presets) match pre-flight's record. If a line differs, stop
and report it. The full sweep and presets take a few minutes. Keep the output for Step 3.

- [ ] **Step 3: Record the outcomes in the roadmap**

In the P2 row's exit criteria, change "P2b.2b.1: tracked-drive, head–turf and swing-model analytic cases; …; every
default preset runs end to end." to begin "P2b.2b.1 (met):", the rest unchanged.

Add a section before "## Provisional numbers — where each is confirmed":

```markdown
## P2b.2b.1 outcomes carried forward (for P2b.2b.2)

- **Hand coupling.** `HAND_COUPLING` is T = <the search's chosen T> s at ζ = 0.7: the shortest period for which the
  hands' impulse in the canonical 3 m/s centre strike is at most 5 % of the transfer (<the search's lines>).
  Provisional; P2b.2b.2 sources or fits T and ζ.
- **Coupling sweep** (observations, not gates; `scripts/swingProbe.ts`, T 10–200 ms × ζ 0.2–1): <for each preset,
  the share and peak hand force in the strike at the chosen coupling and at the sweep's ends, the roll presets' path
  lag at the window's end, and the ratios observed>.
- **Tracking** at `HAND_COUPLING` with no ball over 0.12 s: <the tracking lines>.
- **Cost** (for P5): <the timing lines>.
- **Cap and flags** over the preset sweep: <the presets lines>. `TRACK_IMPACT_CAP` stays 0.12 s <or: the user's
  revision>.
- **Model limits for P2b.2b.2.**
  - A level head on the turf rests on a point that jumps between its end rims, which gives a bounded chatter.
  - An AC stop whose head stays on the turf runs to the cap.
  - The head–turf stiffness, restitution and friction are the ball's.
  - The default shaft (36 in) and top hand (35 in) are sourced; the stance and drive presets are estimates.
- **Public.** `simulateShot`, `simulateImpact` and `judgeFaults` are exported from `src/engine/index.ts`
  (`ENGINE_VERSION` 0.6.0).
```

Replace each `<…>` with the probe's figures from Step 2 (they equal pre-flight's); leave no angle brackets in the
committed file.

- [ ] **Step 4: Format, check, commit**

Run `npx prettier --write scripts/swingProbe.ts`, then the four checks.

```bash
git add scripts/swingProbe.ts docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md
git commit -F "$CLAUDE_TEMP_DIR/msg.txt"   # "Add the swing probe and record the P2b.2b.1 outcomes"
```

---

## Self-review against the spec

| Spec | Where |
|---|---|
| §1.1 analytic and hand-checked cases (§8.1) | Tasks 3, 4 (path, tracking, oscillator, relaxed grip, re-contact, end rule); 6 (head–turf); 7 (swing model); 8, 9 (`simulateShot`, judgements, mechanisms) |
| §1.2 force tables bit-identical; shot mix, slow tests, obstacle fuzz, reach filter | Tasks 1, 4, 5 and 6 (digest with 2,000 obstacle strokes, `cmp`); Task 10 (digest, shot mix, `SLOW_TESTS`) |
| §1.3 hands' impulse ≤ 5 % in a 3 m/s centre strike | Task 9; T set by Task 11's `search` (pre-flight) |
| §1.4 every canonical setup end to end; §9 recorded | Task 9; Task 11 |
| §1.5 exports, `ENGINE_VERSION` 0.6.0 | Task 10 |
| §3.1 `Drive` union, `SwingArc`, `Coupling` | Tasks 1, 3, 5 |
| §3.2 path, continuity, sinCos per step | Task 3 |
| §3.3 hand load, feed-forward, relaxed grip | Task 4 |
| §3.4 provisional coupling, criterion | Tasks 2, 9, 11 |
| §3.5 track end rule, `TRACK_IMPACT_CAP`, `ImpactOptions.cap` | Task 4 |
| §3.6 validation | Task 5 |
| §3.7 probe `hand`, `headTurf`; braking impulses | Tasks 4, 6; impulses in Task 9 |
| §4 head–turf pair, law sampled once, friction, flags, timeline, slide, limits | Task 6 |
| §5.1–§5.3 types, derivation, rejections | Task 7 |
| §5.4 default profile, `DEFAULT_DRIVE` | Task 7 |
| §5.5 canonical setups and clearances | Task 7 (`canonicalSetup`, `CANONICAL_CLEARANCE`; striker moved off the peg) |
| §6.1–§6.3 `simulateShot`, setup checks, `StrokeContext` | Task 9 |
| §6.4 29.1.13 "plays away from", 29.1.14, `JUDGED_LAWS`, `FAULT_LAW_KEYS` | Tasks 2, 8 (C29.18 checked while planning) |
| §6.5 exports | Task 10 |
| §7 reference data | Task 2 |
| §8.2 bit-identity | As §1.2 |
| §9 pre-flight measurements | Task 11; "Pre-flight" |
| §10 deferred | Nothing to build; Task 11 records the model limits |
| §11 roadmap changes | Done in the spec PR; outcomes in Task 11 |
