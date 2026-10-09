# P2b.2b.2b.2a — The Strike and the Turf: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The face–ball contact follows Gugan's measured e(U) and T(U) through a Hertzian law set at each closure, and
the ball–turf contact is a bed of slowly recovering cells. A ball driven into the lawn runs along its own transient
pit, meets the pit's leading wall as a ramp and loses more energy the faster it strikes. A ball landing in phase 2
meets the same bed.

**Architecture:**

- `elementary.ts` gains `exp` and `pow` from exact operations.
- `contactLaw.ts` gains the Hertzian face law:
  - a dimensionless table of the damping ĉ(U) and duration τ(U), built once;
  - `closeFace`, which sets k and c from the closing speed;
  - the force, its tangent law and its stored energy.
- `turfBed.ts` (new) is the bed:
  - each ball's sparse cells on one world lattice;
  - their update and recovery;
  - the resultant and its friction spring;
  - the static sink and the fresh-bed potential behind the bouncing rule.
- `landing.ts` (new) runs one ball on a fresh bed. Phase 2's landings call it, and `scripts/turfFit.ts` fits the bed
  with it.
- The integrator then reads both laws:
  - each face–ball pair carries its closure;
  - each ball–turf pair is its ball's bed.
- The tasks land the pure modules first, then the fit and the user's low-speed gate, then the wiring:
  - the face;
  - the turf in the impact;
  - the landings in phase 2.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), Vitest, ESLint, Prettier. No
new dependencies. `npx --yes tsx` runs the scripts.

**Spec:** `docs/superpowers/specs/2026-10-09-p2b2b2b2a-strike-turf-laws-design.md`. Read all of it. Also read:

- **Impact spec:** `docs/superpowers/specs/2026-10-03-p2b1-impact-integrator-design.md`, §4 (the contact law) and §5
  (the integrator).
- **Roadmap:** `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`. Read the P2 row and all of "P2b.2b.2b
  decisions and findings (2026-10-08)", especially "Sources for P2b.2b.2b.2 and P2b.2b.2b.3" and "The model's roll
  against the roll as played".
- **The previous plan:** `docs/superpowers/plans/2026-10-08-p2b2b2b1-hands-stance.md`, for the conventions this plan
  keeps (its "Global Constraints", and Task 5 for the probe and the documents).

**Decisions made while planning.** Task 11 folds each into the spec's amendment note.

1. **The two-ball guard is on the footprints, not on 2R + h** (user confirmed, 2026-10-09).
   - Spec §4.1 throws when two balls that both hold cells lie within 2R + h of each other horizontally. Every croquet
     stroke starts with two touching balls, 2R apart, both resting on the bed, so that guard would reject every
     croquet stroke, including the rolls. A roqueted ball bouncing near another would trip it too.
   - The user: the area of actual turf contact is always much smaller than the ball's cross-section.
   - The plan throws instead when two balls holding cells have centres closer horizontally than ρ_a + ρ_b + h, with
     ρ = √(R² − z²) each ball's footprint radius. That is when their footprints could reach one column.
   - Two touching balls at the static sink (ρ ≈ 5.4 mm) stay about 80 mm clear of it. Even at A4R's 7.2 mm
     (ρ ≈ 25 mm) the guard needs centres within about 52 mm, which two whole balls cannot reach.
2. **The tangential spring keeps its force when its stiffness grows.**
   - Spec §3.5 and §4.3 make k_t follow the normal's current tangent stiffness. A stuck spring ξ held while k_t grows
     would store ½·k_t·ξ² more with no slip: energy from nothing.
   - `carrySpring` therefore scales the carried ξ by k_before/k_now when k_t has grown, and keeps ξ when it has
     shrunk, so the stored energy never rises without slip.
   - The linear laws' stiffness never changes, so their pairs stay bit-identical.
3. **A probe sample carries its stored energy.** `ContactSample` gains `storedEnergy`:
   - ½·k·δ² for a linear pair;
   - (2/5)·k·δ^{5/2} for the face;
   - Σ ½·A·k_w·w² over the bed's cells.

   It also gains `closingSpeed` for a face pair. `impactEnergy` (test support) reads `storedEnergy` in place of
   ½·k·δ².
4. **Fits are a new reference entry shape.** `{ form, coefficients, range, rangeUnit, source, provenance, note }` is
   read by `readFit` and documented in `reference/README.md`. The bed's fitted pair carries no bounds (spec §4.4), so
   `tests/reference/reference.test.ts`'s "every impact value has bounds" names it as the one exemption.
5. **The face table is built on the first closure, not at module load.** The numbers are the same; only a module that
   never closes a face is spared the 50 ms build.
6. **The bouncing rule is written in its reduced form**, ½·m·v_z² + U_f(δ) − m·g·δ > 0. It is the spec's E > E(0)
   with both sides expanded, and the doc comment shows the step.
7. **The new flags are events.** `impact-turf-pit` is an `ImpactEvent`, like `impact-off-face`. `landing-cap` is a
   `ShotEvent`, because phase 2's result carries events, not flags.
8. **The shadow-energy test** (`shadowEnergy.test.ts`):
   - drops its face case, because a Hertzian spring has no exact shadow energy under semi-implicit Euler;
   - moves its turf case to a bed with zero recovery, which is a set of linear springs, one per cell, each with its own
     onset;
   - `invariants.test.ts` carries the Hertzian and bed energies through `storedEnergy`.
9. **`TurfAt` returns the sliding friction alone** (a number), since phase 2 no longer reads the turf's restitution.
10. **Phase 2 gains a landing probe**, `SimulationOptions.landings`, for the shot mix's per-landing figures and its
    work counts. Spec §6 asks for both.
11. **The low-speed gate always stops for the user.** It reports the figures and waits, whatever they show (the
    handover's reading of §4.4).
12. **The shot mix's world takes the default lawn's bed**, so its landing figures are the fitted lawn's. Its phase 2
    is otherwise the test world, as before.

## Global Constraints

- **Formatting.**
  - Use 4-space indentation, a 120-column limit, LF line endings and UTF-8.
  - Check line lengths with `env LC_ALL=en_GB.UTF-8 grep -nE "^[^|].{120,}$" <file>`. Table rows in markdown are
    exempt, and roadmap line 29 is a known pre-existing hit.
  - Run `npx prettier --write` on every code file and JSON file you touch. `npm run format:check` must pass.
  - `.prettierignore` lists `docs/`, so wrap markdown by hand.
  - Prettier does not re-wrap comments or strings. Wrap any comment over 120 columns by hand, and split any template
    literal over 120 columns with `+`.
- **Engine purity.** `src/engine/**` is pure and deterministic: no DOM, no time of day, no randomness. Module state is
  allowed only for the face table, which is computed from constants.
- **Determinism lint.**
  - Engine code uses only IEEE-exact operations: `+ − * /`, comparisons, `Math.sqrt`, `Math.abs`, `Math.min`,
    `Math.max`, `Math.round`, `Math.floor`, `Math.ceil`, the constant `Math.PI`, and the engine's own `sinCos`,
    `atan2`, `ln`, `exp` and `pow` (`src/engine/math/elementary.ts`).
  - Engine code has no `Math.sin`, `Math.cos`, `Math.atan2`, `Math.asin`, `Math.exp`, `Math.log`, `Math.pow` or
    `Math.hypot`, and no `**`. `npm run lint` enforces it.
  - Tests and scripts may use any `Math` function.
- **Style.**
  - No non-null assertions (`!`); the repo style is `x as T` after indexing.
  - Braces on every `if`.
  - Write `0 - x` rather than unary minus in engine arithmetic.
  - Exported functions carry a header comment, and a constant that is not physical says "Numerical, not physical"
    with its reason.
  - Use `import type` for type-only imports.
  - Argument lists go all on one line, or each argument on its own line. Use one per line when there are more than
    three, or when the line would pass 120 columns.
- **Units.** SI: m, s, kg, N, rad. The spec's millimetres and milliseconds are for reading only.
- **Engine version.** `ENGINE_VERSION` becomes `"0.9.0"` (Task 10).
- **Bit-identity** (spec exit criterion 2).
  - Phase 2 shots with no landing stay bit-identical to `main`. Task 1 captures a digest, and Task 9 compares with it.
  - Ball–ball and ball–obstacle pairs keep the linear law. They change only through the bodies they meet.
- **The baseline runs** (Task 1 Step 3) run in the background. They must finish before Task 3's first engine change.
  Check with `pgrep -fl tsx`, which must print no digest or shot-mix process. Each baseline file must be non-empty.
- **Slow tests** run only when `SLOW_TESTS` is set.
- **RED steps.** Vitest does not type-check. Where a test uses a missing export or field, the RED run shows runtime
  failures (`… is not a function`, an assertion on `undefined` or `NaN`), and `npm run check` shows the type errors.
- **Behaviour figures.**
  - A test that rests on model behaviour carries its reasoning in a comment.
  - Where a test fails, trace the mechanism (the test's own setup, then the probe) before changing an expectation.
  - Fix the code if it departs from the spec.
  - A re-baselined figure gets a comment naming this step ("P2b.2b.2b.2a: Hertzian face" or "…: turf bed").
  - A changed expectation that the spec does not predict goes to the user, and is folded into the spec's amendment
    note (Task 11).
- **Circularity.**
  - The laws are fitted only to material measurements: Gugan's e(U) and T(U), and A4R's e and penetration.
  - Nothing is tuned to a coaching ratio or to the user's play data. Ratios and the roll as played are only
    recorded.
- **Process.** Follow the plan's steps. There are no side probes during the run: figures come from the steps that
  produce them.
- **Bash.**
  - One command per call: no `&&`, `||`, `;`, `$(…)` or subshells.
  - Redirecting a script's output to a file with `>` or `2>` is allowed.
  - Never use a shell command string (`bash -c`, `node -e`). Use `python3 -I` rather than `jq` with `test(`.
- **The temp directory.**
  - `<temp>` in a Run line is the executing session's literal temp path (its `CLAUDE_TEMP_DIR`, e.g.
    `/tmp/claude-<session id>`), written out in full: worktree sessions refuse `$CLAUDE_TEMP_DIR`. A subagent is
    given this literal path in its prompt.
  - Throwaway scripts go in `<temp>/scripts/`, their outputs in `<temp>/baseline/` and `<temp>/after/`, and a
    downloaded page in its own new directory, `<temp>/fetch/`.
  - If execution moves to a new session, use that session's path. Re-capture the baseline from a worktree of `main`
    (`git worktree add <new temp>/baseline-tree 5031574`, then `npm ci` there), with the throwaway scripts' import
    root changed to that tree.
- **Commits.**
  - Write a short imperative sentence (repo style), signed.
  - Write the message to a fresh file `<temp>/msg-task<N>.txt` and commit with `git commit -F <that path>`.
  - Check with `git log -1 "--format=%G? %h"`. Expect `G`; quote the format, as zsh globs `?`. If signing refuses,
    leave the change staged and report it.
  - Never use `--no-verify`, `-c commit.gpgsign=false` or bare `git stash`.
- **Checks after every task:** `npm test`, `npm run lint`, `npm run check` and `npm run format:check` all pass. The
  baseline is 911 tests passed and 2 skipped.
- **Known noise.** The editor's TypeScript LSP reports spurious "Cannot find module/name" diagnostics. `npm run check`
  is the source of truth.
- **Worktree.**
  - All work happens in `/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b2a-strike-turf-laws`, on branch
    `worktree-p2b2b2b2a-strike-turf-laws`.
  - The branch is local only. Run `npm ci` there first if `node_modules` is missing.

## Review Focus

The spec implies each input below, but none of its listed tests exercises it. The task that owns each one pins it with
a test.

1. **A face closure at a closing speed of zero or less.** This is a rim graze, or a ball touched while the face is
   already separating. The law must take the 0.5 m/s closure, not produce NaN or a negative stiffness. Pinned in
   Task 3 ("takes the 0.5 m/s law at a closing speed of zero or less").
2. **Two touching balls resting on the bed.** This is the start of every croquet stroke. They must run, with no guard
   thrown and no cell shared. Pinned in Task 8 ("starts two touching balls on the bed with no guard").
3. **A ball far from the lattice's origin, or mirrored far off the axis.** Its cell keys, its box and its pair order
   must not depend on how far it lies from (0, 0). It costs the same at y = 35 m as at y = 0, and mirrors exactly at
   y = ±10 m. Pinned in Task 4 ("loads a ball far from the origin as one near it, offset by whole cells" and the
   mirror case at y = 10 m).
4. **A grazing touchdown.** A landing with v_z of −1e-6 m/s must settle in a few steps, not run to the cap. Pinned in
   Task 5 ("settles a grazing touchdown at once").
5. **A long run of small hops in phase 2.** Each landing's e is below 1, so a ball dropped from 1 mm must still come to
   rest after a finite, recorded number of landings, with no `landing-cap`. Pinned in Task 9 ("settles a 1 mm drop
   in a few landings").

---
## File Structure

| Path | Change |
|---|---|
| `src/engine/math/elementary.ts` | `exp`, `pow` (Task 1) |
| `scripts/shotMix.ts` | Landing counts (Task 1); the default lawn's bed and the landing probe's figures (Task 9) |
| `src/reference/schema.ts`, `src/reference/index.ts`, `reference/README.md` | The fit shape and `readFit` (Task 2); `bedModulus`, `bedRecovery` (Task 6) |
| `reference/contact.json` | `faceRestitutionFit`, `faceContactTimeFit` (Task 2); `bedModulus`, `bedRecovery` (Task 6); notes (Tasks 7, 8) |
| `reference/mallet.json`, `reference/friction.json` | Notes: checks and held-out values (Tasks 7, 8, 9) |
| `reference/sources/README.md` | Gugan's paper, Penner and Hall cited (Task 2) |
| `src/engine/impact/types.ts` | `FaceLaw` (Task 3); `BedLaw` (Task 4); `FaceMaterial` loses two fields (Task 7); `impact-turf-pit` (Task 8) |
| `src/engine/impact/contactLaw.ts` | The Hertzian face law and `carrySpring` (Task 3) |
| `src/engine/impact/turfBed.ts` | New: the bed (Task 4); `bedLawOf` (Task 6) |
| `src/engine/impact/landing.ts` | New: a landing on a fresh bed (Task 5) |
| `scripts/turfFit.ts` | New: the bed's fit, its held-out checks and the low-speed gate's figures (Task 6) |
| `src/engine/types.ts`, `src/engine/world.ts` | `SurfaceProps.bedModulus`, `bedRecovery` (Task 6); `turfAt` and `landing-cap` (Task 9) |
| `src/engine/impact/integrate.ts` | Face closures, `storedEnergy` (Task 7); the bed pair, the bouncing rule, the lift, the pit flag, the guard (Task 8) |
| `src/engine/impact/simulateImpact.ts` | The face law (Task 7); the bed's sink and validation (Task 8) |
| `src/engine/impact/handover.ts` | Header (Task 8) |
| `src/engine/swing/buildContact.ts` | `WOOD` (Task 7); the bed's sink (Task 8) |
| `src/engine/simulate.ts`, `src/engine/resolve.ts` | Landings on the bed, `resolveLanding` deleted (Task 9); `ENGINE_VERSION` (Task 10) |
| `tests/engine/support/impact.ts`, `fixtures.ts`, `bruteForce.ts`, `shot.ts` | Migrations (Tasks 6–9) |
| `tests/engine/math/elementary.test.ts`, `tests/engine/impact/contactLaw.test.ts` | Tasks 1 and 3 |
| `tests/engine/impact/turfBed.test.ts`, `landing.test.ts` | New (Tasks 4, 5, 6) |
| Every impact and phase 2 test that pins the old laws | Re-baselined (Tasks 7–9) |
| `scripts/strokeProbe.ts`, `swingProbe.ts`, `impactProbe.ts`, `impactDigest.ts` | Migrations (Tasks 7, 8); new probe sections (Task 11) |
| `docs/superpowers/probes/2026-10-09-p2b2b2b2a-*.txt` | New: raw probe output (Tasks 6, 11) |
| The roadmap, this phase's spec | Spec §8, and this plan's decisions (Task 11) |

Every commit stays green:

- **Task 1** adds `exp` and `pow` and the shot mix's landing count. Nothing in the engine reads them yet.
- **Tasks 2–5** add reference data and pure modules that nothing reads yet.
- **Task 6** fits the bed and adds its fields to the lawn. Nothing reads them yet. It ends at the user's gate.
- **Task 7** moves the face to the Hertzian law.
- **Task 8** moves the balls onto the bed in the impact.
- **Task 9** moves phase 2's landings onto the bed.
- **Task 10** bumps the version and runs the gates.
- **Task 11** probes, and brings the documents up to date.

---
### Task 1: The baseline, and `exp` and `pow`

Spec §3.4 (`exp`, `pow`) and §6 (the "before" runs).

**Files:**
- Modify: `scripts/shotMix.ts` (landing counts)
- Modify: `src/engine/math/elementary.ts` (append `exp` and `pow`)
- Test: `tests/engine/math/elementary.test.ts` (the import; two new `describe`s at the end)
- Temp, never committed: `<temp>/scripts/phase2Digest.mts`, `<temp>/scripts/compareDigest.mts`, `<temp>/baseline/*`

**Interfaces:**
- Produces, from `src/engine/math/elementary.ts`:
  - `function exp(x: number): number`
  - `function pow(x: number, y: number): number`

- [ ] **Step 1: Confirm that the branch's code is `main`'s**

Run: `git diff --stat main -- src tests scripts reference`
Expected: no output. The branch's commits are docs only.

Run: `mkdir -p <temp>/scripts <temp>/baseline <temp>/after`

- [ ] **Step 2: Count the shot mix's landings**

In `scripts/shotMix.ts`, add `landings` to `Shot` and count each shot's landing events. Replace the `Shot` interface and
the push:

```ts
interface Shot {
    readonly name: string;
    readonly solves: number;
    readonly largest: number;
    readonly work: number;
    readonly solverMs: number;
    readonly engineMs: number;
    readonly fallbacks: number;
    /** Landing events in the shot: each bounce on the turf counts one. */
    readonly landings: number;
}
```

```ts
    const landings = result.events.filter((e) => e.kind === "landing").length;
    shots.push({ name, solves, largest, work, solverMs, engineMs, fallbacks, landings });
```

Widen `row`'s key to `"solves" | "work" | "solverMs" | "engineMs" | "landings"`. After the `fallback events` line, add:

```ts
console.log(row("landings per shot", "landings"));
console.log(`landings in all: ${shots.reduce((s, x) => s + x.landings, 0)}`);
```

Update the file header's list of what it reports ("… and the engine's time, and the landings per shot").

- [ ] **Step 3: Capture the baseline (in the background)**

Create `<temp>/scripts/phase2Digest.mts`:

```ts
/**
 * Phase 2 digest for P2b.2b.2b.2a's exit criterion 2 (plan Task 1, Task 9): random shots through simulateFreeMotion
 * on the default world. Each line holds the shot's index, its landing count and the SHA-256 of its result without
 * the engine version. Throwaway, never committed. Run from the worktree: npx --yes tsx <this> > <out>.
 */
import { createHash } from "node:crypto";
import { vec3 } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b2a-strike-turf-laws/src/engine/math/vec3";
import { simulateFreeMotion } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b2a-strike-turf-laws/src/engine/simulate";
import type { BallId, BallStates } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b2a-strike-turf-laws/src/engine/types";
import { defaultWorld } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b2a-strike-turf-laws/src/engine/world";
import { rng } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b2a-strike-turf-laws/tests/engine/support/rng";

const WORLD = defaultWorld();
const R = WORLD.ball.radius;
const IDS: readonly BallId[] = ["blue", "red", "black", "yellow"];
const random = rng(41);
const uni = (a: number, b: number): number => a + (b - a) * random();
for (let n = 0; n < 600; n++) {
    const count = 1 + Math.floor(random() * 3);
    const balls: BallStates = {};
    for (let k = 0; k < count; k++) {
        // A third of the balls start rising, so that a share of the shots land.
        const rising = random() < 0.3;
        balls[IDS[k] as BallId] = {
            position: vec3(5 + 4 * k, uni(5, 30), R),
            velocity: vec3(uni(-3, 3), uni(-3, 3), rising ? uni(0.1, 1.5) : 0),
            angularVelocity: vec3(uni(-60, 60), uni(-60, 60), uni(-5, 5)),
        };
    }
    const result = simulateFreeMotion(balls, WORLD);
    const landings = result.events.filter((e) => e.kind === "landing").length;
    const hash = createHash("sha256")
        .update(JSON.stringify({ ...result, engineVersion: "" }))
        .digest("hex");
    console.log(`${n} ${landings} ${hash}`);
}
```

Create `<temp>/scripts/compareDigest.mts`:

```ts
/**
 * Compares two phase-2 digests (plan Task 9): every shot the baseline ran with no landing must hash identically.
 * Throwaway. Run: npx --yes tsx <this> <baseline> <after>.
 */
import { readFileSync } from "node:fs";

const [, , before, after] = process.argv as [string, string, string, string];
const parse = (path: string): string[][] =>
    readFileSync(path, "utf8")
        .trim()
        .split("\n")
        .map((line) => line.split(" "));
const a = parse(before);
const b = parse(after);
let still = 0;
let moved = 0;
let landed = 0;
for (let i = 0; i < a.length; i++) {
    const [index, landings, hash] = a[i] as [string, string, string];
    if (landings !== "0") {
        landed++;
        continue;
    }
    if ((b[i] as string[])[2] === hash) {
        still++;
    } else {
        moved++;
        console.log(`moved without a landing: shot ${index}`);
    }
}
console.log(`no-landing shots identical ${still}, moved ${moved}; shots with a landing ${landed}`);
```

Run each in the background, with `run_in_background: true`:

Run: `npx --yes tsx <temp>/scripts/phase2Digest.mts > <temp>/baseline/phase2Digest.txt`
Run: `npx --yes tsx scripts/impactDigest.ts > <temp>/baseline/impactDigest.txt`
Run: `npx --yes tsx scripts/shotMix.ts > <temp>/baseline/shotMix.txt`

These must finish before Task 3. Steps 4 to 8 do not change the engine's behaviour (`exp` and `pow` are new and unread),
so they may run alongside.

- [ ] **Step 4: Write the failing tests**

In `tests/engine/math/elementary.test.ts`, import `exp` and `pow` beside `atan2, ln, sinCos`. Append:

```ts
describe("exp", () => {
    it("agrees with Math.exp to a few ulps over [−700, 700]", () => {
        const random = rng(5);
        for (let n = 0; n < 5000; n++) {
            const x = (random() - 0.5) * 1400;
            expect(close(exp(x), Math.exp(x), 4), `x = ${x}`).toBe(true);
        }
    });

    it("is accurate near 0, where the bed's decay and the fits' powers read it", () => {
        const random = rng(6);
        for (let n = 0; n < 2000; n++) {
            const x = (random() - 0.5) * 2 * Math.pow(10, -Math.floor(random() * 12));
            expect(close(exp(x), Math.exp(x), 2), `x = ${x}`).toBe(true);
        }
        expect(exp(0)).toBe(1);
    });

    it("handles the edges", () => {
        expect(exp(Number.NaN)).toBeNaN();
        expect(exp(Infinity)).toBe(Infinity);
        expect(exp(-Infinity)).toBe(0);
        expect(exp(800)).toBe(Infinity);
        expect(exp(-800)).toBe(0);
    });
});

describe("pow", () => {
    it("agrees with Math.pow for the bases and exponents the engine uses", () => {
        const random = rng(7);
        for (const y of [0.4, -0.23, 0.2, 2.5, -1.5]) {
            for (let n = 0; n < 1000; n++) {
                const x = 0.05 + 20 * random();
                // exp(y·ln x) amplifies ln's few ulps by |y·ln x| ≤ 7.5 here.
                expect(close(pow(x, y), Math.pow(x, y), 16), `x = ${x}, y = ${y}`).toBe(true);
            }
        }
    });

    it("is 0 for a zero base and a positive exponent, and NaN for any other non-positive base", () => {
        expect(pow(0, 0.4)).toBe(0);
        expect(pow(0, -1)).toBeNaN();
        expect(pow(-2, 0.4)).toBeNaN();
        expect(pow(1, 0.4)).toBe(1);
    });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/math/elementary.test.ts`
Expected: FAIL, `exp is not a function` and `pow is not a function`.

- [ ] **Step 6: Implement**

Append to `src/engine/math/elementary.ts`, and add `exp` and `pow` to the file header's list ("Elementary functions …
ln, exp, pow, sinCos and atan2"):

```ts
/** 1/ln 2, the reduction's multiplier. Its rounding can only move k at a tie, which the remainder r absorbs. */
const INV_LN2 = 1.4426950408889634;

/** Above EXP_MAX e^x overflows; below EXP_MIN it underflows to 0 (Math.exp's limits, rounded outward). */
const EXP_MAX = 709.79;
const EXP_MIN = -745.14;

/**
 * e^x. x = k·ln 2 + r with |r| ≤ ½·ln 2 (Cody and Waite, as ln), e^r by its Taylor series to r¹⁷ (the next term is
 * below 1e-21 of the sum), then scaled by 2^k in exact steps. NaN for NaN, +Infinity above EXP_MAX, 0 below EXP_MIN.
 */
export function exp(x: number): number {
    if (Number.isNaN(x)) {
        return NaN;
    }
    if (x > EXP_MAX) {
        return Infinity;
    }
    if (x < EXP_MIN) {
        return 0;
    }
    let k = Math.round(x * INV_LN2);
    const r = x - k * LN2_HI - k * LN2_LO;
    // e^r = 1 + r·(1 + r/2·(1 + r/3·(…))), by Horner from the innermost term.
    let y = 1;
    for (let n = 17; n >= 1; n--) {
        y = 1 + (r / n) * y;
    }
    while (k >= 64) {
        y *= TWO_64;
        k -= 64;
    }
    while (k <= -64) {
        y *= TWO_MINUS_64;
        k += 64;
    }
    while (k > 0) {
        y *= 2;
        k -= 1;
    }
    while (k < 0) {
        y *= 0.5;
        k += 1;
    }
    return y;
}

/**
 * x^y for x > 0, as exp(y·ln x): accurate to a few ulps times |y·ln x|. 0 for x = 0 and y > 0; NaN for any other base
 * not positive.
 */
export function pow(x: number, y: number): number {
    if (x > 0) {
        return exp(y * ln(x));
    }
    return x === 0 && y > 0 ? 0 : NaN;
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/math/elementary.test.ts`
Expected: PASS. If an `exp` case misses 4 ulps, read the failing x before changing anything. If the error is in the
2^k scaling (near the limits), cut the test's range, not the bound, and record why in a comment.

- [ ] **Step 8: Run every check**

Run: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`
Expected: all pass (916 passed, 2 skipped).

- [ ] **Step 9: Commit**

Wait for the baseline runs (`pgrep -fl tsx` prints none of them; each `<temp>/baseline/*.txt` is non-empty).

```bash
git add src/engine/math/elementary.ts tests/engine/math/elementary.test.ts scripts/shotMix.ts
git commit -F <temp>/msg-task1.txt
```

Message: `Add exp and pow from exact operations, and count the shot mix's landings`

---
### Task 2: Gugan's face fits as reference data

Spec §3.1. Decision 4.

**Files:**
- Modify: `src/reference/schema.ts` (`ReferenceFit`, `readFit`)
- Modify: `src/reference/index.ts` (`contactReference.faceRestitutionFit`, `faceContactTimeFit`)
- Modify: `reference/contact.json` (two entries), `reference/README.md` (the fit shape)
- Modify: `reference/sources/README.md` (a section for this phase's sources)
- Test: `tests/reference/reference.test.ts`, `tests/reference/schema.test.ts` (if it exists; else the reference test)
- Temp: `<temp>/fetch/gugan/page.html`

**Interfaces:**
- Produces, from `src/reference/schema.ts`:
  - `interface ReferenceFit extends Sourced { readonly form: string; readonly coefficients: Readonly<Record<string,
    number>>; readonly range: readonly [number, number]; readonly rangeUnit: string }`
  - `function readFit(section: unknown, key: string, path: string, names: readonly string[]): ReferenceFit`
- Produces, from `src/reference/index.ts`: `contactReference.faceRestitutionFit` (coefficients `a`, `b`, `p`) and
  `contactReference.faceContactTimeFit` (coefficients `t0`, `u0`, `q`).

- [ ] **Step 1: Fetch and check the source**

Run: `mkdir -p <temp>/fetch/gugan`
Run: `curl -k -sSL -o <temp>/fetch/gugan/page.html https://oxfordcroquet.org/tech/gugan/`
Run: `grep -c "" <temp>/fetch/gugan/page.html`
Expected: a non-empty page.

Find the fits and the contact-time figures in the page:

Run: `grep -nE "0\.213|0\.077|0\.97|0\.79|2\.19|5\.50|Hertz" <temp>/fetch/gugan/page.html`

Confirm each figure the spec quotes (§3.1):

- 1 − e² = 0.213 + 0.077·U^0.4;
- T from 0.97 ms at 2.19 m/s to 0.79 ms at 5.50 m/s;
- T ∝ U^−0.23, against Hertz's U^−0.2.

Copy the sentences that state them, verbatim with the tags stripped, into a scratch note for Step 3. Also note the
paper's title as the page gives it.

If a figure differs from the spec, stop and report it to the user before going on. The plan's code reads only the fit's
coefficients.

Compute the digest the way `reference/sources/README.md` states:

Run: `grep -vE ">(Views|Hits): [0-9]+<" <temp>/fetch/gugan/page.html > <temp>/fetch/gugan/stripped.html`
Run: `shasum -a 256 <temp>/fetch/gugan/stripped.html`

- [ ] **Step 2: Write the failing tests**

In `tests/reference/reference.test.ts`, inside `describe("impact reference data", …)`, add:

```ts
    it("loads Gugan's face fits, which reproduce his tabulated restitutions and contact times", () => {
        const e = contactReference.faceRestitutionFit;
        const { a, b, p } = e.coefficients as { a: number; b: number; p: number };
        expect(e.range).toEqual([0.5, 6]);
        expect(e.rangeUnit).toBe("m/s");
        const restitution = (u: number): number => Math.sqrt(1 - (a + b * Math.pow(u, p)));
        // Spec §3.1: e from 0.854 at 0.5 m/s to 0.793 at 6 m/s.
        expect(restitution(0.5)).toBeCloseTo(0.854, 3);
        expect(restitution(6)).toBeCloseTo(0.793, 3);
        const t = contactReference.faceContactTimeFit;
        const { t0, u0, q } = t.coefficients as { t0: number; u0: number; q: number };
        const duration = (u: number): number => t0 * Math.pow(u / u0, q);
        // T falls from 0.97 ms at 2.19 m/s to 0.79 ms at 5.50 m/s; spec §3.3's extrapolations at 0.5 and 6 m/s.
        expect(duration(2.19)).toBeCloseTo(0.97e-3, 8);
        expect(duration(5.5) * 1e3).toBeCloseTo(0.79, 2);
        expect(duration(0.5) * 1e3).toBeCloseTo(1.36, 2);
        expect(duration(6) * 1e3).toBeCloseTo(0.77, 2);
    });
```

In "gives every impact value bounds, so the probe can sweep them", iterate only the values. A fit has a range instead:

```ts
    it("gives every impact value bounds, so the probe can sweep them, and every fit a range", () => {
        for (const v of [...Object.values(contactReference), ...Object.values(malletReference)]) {
            if ("range" in v) {
                expect(v.range[0], v.source).toBeLessThan(v.range[1]);
            } else {
                expect(v.bounds, v.source).toBeDefined();
            }
        }
    });
```

Add schema cases beside the existing `readValue` cases. Find them with `grep -rn "readValue" tests/reference`:

```ts
describe("readFit", () => {
    const fit = {
        form: "y = a + b·x",
        coefficients: { a: 1, b: 2 },
        range: [0, 1],
        rangeUnit: "m",
        source: "s",
        provenance: "direct",
    };

    it("reads a fit's form, its named coefficients and its range", () => {
        const read = readFit({ f: fit }, "f", "t", ["a", "b"]);
        expect(read.coefficients).toEqual({ a: 1, b: 2 });
        expect(read.range).toEqual([0, 1]);
        expect(read.form).toBe("y = a + b·x");
    });

    it("rejects a missing coefficient, naming it, and a range with lo ≥ hi", () => {
        expect(() => readFit({ f: fit }, "f", "t", ["a", "c"])).toThrow(/t\.f\.coefficients\.c/);
        expect(() => readFit({ f: { ...fit, range: [1, 1] } }, "f", "t", ["a"])).toThrow(/range/);
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/reference`
Expected: FAIL, `readFit is not a function`, and `faceRestitutionFit` undefined.

- [ ] **Step 4: Implement**

In `src/reference/schema.ts`, after `readValue`:

```ts
/** A sourced fit: its formula, its named coefficients (SI), and the range of the variable it was measured over. */
export interface ReferenceFit extends Sourced {
    readonly form: string;
    readonly coefficients: Readonly<Record<string, number>>;
    readonly range: readonly [number, number];
    readonly rangeUnit: string;
}

/** Reads a sourced fit, checking that it has every coefficient in `names` and a range lo < hi. */
export function readFit(section: unknown, key: string, path: string, names: readonly string[]): ReferenceFit {
    const item = entry(section, key, path);
    const itemPath = `${path}.${key}`;
    const form = readString(item, "form", itemPath);
    const table = entry(item, "coefficients", itemPath);
    const coefficients: Record<string, number> = {};
    for (const name of names) {
        coefficients[name] = readNumber(table, name, `${itemPath}.coefficients`);
    }
    const range = readArray(item, "range", itemPath);
    const [lo, hi] = range;
    if (range.length !== 2 || typeof lo !== "number" || typeof hi !== "number" || !(lo < hi)) {
        throw new ReferenceDataError(`${itemPath}.range`, "must be [lo, hi] with lo < hi");
    }
    return {
        form,
        coefficients,
        range: [lo, hi],
        rangeUnit: readString(item, "rangeUnit", itemPath),
        ...readSourced(item, itemPath),
    };
}
```

In `src/reference/index.ts`, import `readFit` and add to `contactReference` after `faceBallContactTime`:

```ts
    faceRestitutionFit: readFit(contactJson, "faceRestitutionFit", "contact", ["a", "b", "p"]),
    faceContactTimeFit: readFit(contactJson, "faceContactTimeFit", "contact", ["t0", "u0", "q"]),
```

Update `contactReference`'s doc comment: "… the tangential ratio, Gugan's face fits, the hand coupling …".

In `reference/contact.json`, after `faceBallContactTime`, add the two entries. Use the paper's title as fetched. Fill
each `note` with the verbatim sentences from Step 1, the agreement with Gugan 1 Table I (85.7 at 0.50 m/s to 79.5 at
6.01 m/s), and the extrapolation:

```json
    "faceRestitutionFit": {
        "form": "1 - e^2 = a + b * U^p, U the closing speed (m/s)",
        "coefficients": { "a": 0.213, "b": 0.077, "p": 0.4 },
        "range": [0.5, 6],
        "rangeUnit": "m/s",
        "source": "Don Gugan, '<title as fetched>', Am. J. Phys. 68, 920 (2000), DOI 10.1119/1.1285850, https://oxfordcroquet.org/tech/gugan/",
        "provenance": "direct",
        "note": "<the verbatim sentences>. A croquet ball on a wooden face. e falls from 0.854 at 0.5 m/s to 0.793 at 6 m/s, agreeing with Gugan 1 Table I (85.7 % at 0.50 m/s to 79.5 % at 6.01 m/s; mallet.json faceRestitution). The range is that of Gugan's measured e; the engine clamps a closing speed to it (P2b.2b.2b.2a design §3.3)."
    },
    "faceContactTimeFit": {
        "form": "T = t0 * (U / u0)^q, U the closing speed (m/s)",
        "coefficients": { "t0": 0.00097, "u0": 2.19, "q": -0.23 },
        "range": [0.5, 6],
        "rangeUnit": "m/s",
        "source": "Don Gugan, '<title as fetched>', Am. J. Phys. 68, 920 (2000), DOI 10.1119/1.1285850, https://oxfordcroquet.org/tech/gugan/",
        "provenance": "derived",
        "note": "<the verbatim sentences>. Measured over 2.19-5.50 m/s (0.97 to 0.79 ms); Hertz predicts U^-0.2. Extrapolated as its power law over the face's range (1.36 ms at 0.5 m/s, 0.77 ms at 6 m/s; P2b.2b.2b.2a design §3.3). Held out: Hall's longer contacts on slow strokes (1.3-2.9 ms on a 0.6 m stroke; faceBallContactTime's note)."
    },
```

In `reference/README.md`, under "Entry shapes", after **Quote**, add:

```markdown
- **Fit:** `{ "form": "<formula>", "coefficients": { "<name>": <number, SI>, … }, "range": [lo, hi], "rangeUnit":
  "<unit of the fitted variable>", "source": …, "provenance": …, "note": …? }` (contact.json's face fits; P2b.2b.2b.2a
  design §3.1). The range is where the fit was measured; the engine states how it treats speeds outside it.
```

In `reference/sources/README.md`, after the stroke-shape sources, add a section:

```markdown
## The strike and turf laws (P2b.2b.2b.2a design §3.1, §4)

Fetched 2026-10-09 with `curl -k -sSL`; digest of the page with its counter line removed, as above.

| Short name | Work | URL | SHA-256 (counter line removed) |
|---|---|---|---|
| Gugan 2000 | Don Gugan, "<title as fetched>", Am. J. Phys. 68, 920 (2000), DOI 10.1119/1.1285850 | https://oxfordcroquet.org/tech/gugan/ | `<digest from Step 1>` |

Gugan 4 (above) gives A4R's ground restitution and penetrations (Table 4(b), §7.1), which the bed is fitted to
(`scripts/turfFit.ts`). Penner, Can. J. Phys. 80, 931 (2002), and Hall, "When a Mallet Strikes a Ball", are cited
in `reference/friction.json` and are not re-fetched here.

- Gugan 2000, <the sentence stating 1 − e²>: the face's restitution against its closing speed on wood. It does not
  cover faces other than wood, or speeds outside 0.5–6 m/s.
- Gugan 2000, <the sentence stating T>: the contact's duration over 2.19–5.50 m/s. Outside that range it is
  extrapolated.
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/reference`
Expected: PASS.

- [ ] **Step 6: Run every check**

Run: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/reference/schema.ts src/reference/index.ts reference/contact.json reference/README.md reference/sources/README.md tests/reference
git commit -F <temp>/msg-task2.txt
```

Message: `Add Gugan's face restitution and contact-time fits as reference data`

---
### Task 3: The Hertzian face law

Spec §3.2–§3.5 and §5.1's face-law cases (the table, the clamp, the force, the tangential stiffness); review focus 1;
decision 2 (`carrySpring`), decision 5. The law is not wired into the integrator until Task 7.

**Files:**
- Modify: `src/engine/impact/types.ts` (`FaceLaw`)
- Modify: `src/engine/impact/contactLaw.ts` (the header; new code after `tangentialForce`)
- Test: `tests/engine/impact/contactLaw.test.ts` (new `describe`s at the end)

**Interfaces:**
- Consumes: `exp`, `pow` (Task 1); `contactReference.faceRestitutionFit`, `faceContactTimeFit` (Task 2).
- Produces, from `src/engine/impact/types.ts`:
  `interface FaceLaw { readonly mass: number; readonly friction: number }`.
- Produces, from `src/engine/impact/contactLaw.ts`:
  - `const FACE_SPEED_MIN: number`, `const FACE_SPEED_MAX: number` (0.5 and 6 m/s)
  - `function faceRestitutionAt(speed: number): number`, `function faceContactTimeAt(speed: number): number`
  - `interface HertzBounce { readonly restitution: number; readonly duration: number }`
  - `function hertzBounce(damping: number, step?: number): HertzBounce`
  - `interface HertzClosure { readonly speed: number; readonly stiffness: number; readonly damping: number;
    readonly friction: number }`
  - `function closeFace(law: FaceLaw, speed: number): HertzClosure`
  - `function hertzForce(closure: HertzClosure, depth: number, rate: number): number`
  - `function hertzTangent(closure: HertzClosure, depth: number): PairLaw`
  - `function hertzEnergy(closure: HertzClosure, depth: number): number`
  - `function carrySpring(spring: Vec3, normal: Vec3, before: number, now: number): Vec3`

- [ ] **Step 1: Write the failing tests**

Append to `tests/engine/impact/contactLaw.test.ts`. Import the new names, `FaceLaw`, `TANGENTIAL_STIFFNESS_RATIO` and
`vec3`:

```ts
/**
 * A clamped Hertz–Kuwabara–Kono contact integrated directly (RK4, `steps` steps over 3 ms of contact): reduced mass m
 * meeting at U, m·δ'' = −√δ·(k·δ + c·δ′). Returns e (the velocity at release over U) and T (when the force falls to
 * zero), with the release interpolated within its step.
 */
function directBounce(m: number, k: number, c: number, U: number, h = 1e-8): { e: number; T: number } {
    const accel = (x: number, v: number): number => (x > 0 ? -(Math.sqrt(x) * (k * x + c * v)) / m : 0);
    let x = 0;
    let v = U;
    let t = 0;
    let phi = c * v;
    for (;;) {
        const k1x = v;
        const k1v = accel(x, v);
        const k2x = v + (h / 2) * k1v;
        const k2v = accel(x + (h / 2) * k1x, v + (h / 2) * k1v);
        const k3x = v + (h / 2) * k2v;
        const k3v = accel(x + (h / 2) * k2x, v + (h / 2) * k2v);
        const k4x = v + h * k3v;
        const k4v = accel(x + h * k3x, v + h * k3v);
        const nx = x + (h / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
        const nv = v + (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
        const nphi = k * nx + c * nv;
        if (t > 0 && nphi <= 0) {
            const theta = phi / (phi - nphi);
            return { e: -(v + theta * (nv - v)) / U, T: t + theta * h };
        }
        x = nx;
        v = nv;
        t += h;
        phi = nphi;
    }
}

const FACE: FaceLaw = { mass: 0.3, friction: 0.5 };

describe("the face fits", () => {
    it("give Gugan's e and T at the ends of the range", () => {
        expect(faceRestitutionAt(0.5)).toBeCloseTo(0.854, 3);
        expect(faceRestitutionAt(6)).toBeCloseTo(0.793, 3);
        expect(faceContactTimeAt(2.19)).toBeCloseTo(0.97e-3, 9);
        expect(FACE_SPEED_MIN).toBe(0.5);
        expect(FACE_SPEED_MAX).toBe(6);
    });
});

describe("hertzBounce", () => {
    it("is elastic and lasts Hertz's τ = 3.2181 undamped (the dimensionless law)", () => {
        // Undamped Hertz: τ = 2·∫₀¹ dx/√(1 − x^{5/2}) in these units, 3.21806… (pre-flight, RK4 at 1e-5).
        const b = hertzBounce(0);
        expect(b.restitution).toBeCloseTo(1, 8);
        expect(b.duration).toBeCloseTo(3.218065, 5);
    });

    it("falls monotonically in e as the damping grows", () => {
        let last = 1;
        for (const c of [0.05, 0.1, 0.2, 0.5, 1]) {
            const e = hertzBounce(c).restitution;
            expect(e).toBeLessThan(last);
            last = e;
        }
    });
});

describe("closeFace", () => {
    it.each([0.5, 2.19, 2.83, 4.0, 5.5, 6.0])(
        "sets k and c so that a direct integration at %s m/s gives the fit's e within 1e-4 and T within 0.1 %",
        (U) => {
            const closure = closeFace(FACE, U);
            const { e, T } = directBounce(FACE.mass, closure.stiffness, closure.damping, U);
            expect(Math.abs(e - faceRestitutionAt(U))).toBeLessThan(1e-4);
            expect(Math.abs(T - faceContactTimeAt(U)) / faceContactTimeAt(U)).toBeLessThan(1e-3);
        },
    );

    it("takes the clamped speed's law outside [0.5, 6] m/s", () => {
        expect(closeFace(FACE, 0.2)).toEqual({ ...closeFace(FACE, 0.5), speed: 0.2 });
        expect(closeFace(FACE, 9)).toEqual({ ...closeFace(FACE, 6), speed: 9 });
    });

    it("takes the 0.5 m/s law at a closing speed of zero or less (review focus 1)", () => {
        for (const U of [0, -0.3, -0]) {
            const closure = closeFace(FACE, U);
            expect(closure.stiffness).toBe(closeFace(FACE, 0.5).stiffness);
            expect(closure.damping).toBe(closeFace(FACE, 0.5).damping);
            expect(Number.isFinite(closure.stiffness) && closure.stiffness > 0).toBe(true);
        }
    });

    it("scales k and c with the reduced mass, as a law in m, k and U must", () => {
        const light = closeFace({ mass: 0.2, friction: 0.5 }, 3);
        const heavy = closeFace({ mass: 0.4, friction: 0.5 }, 3);
        expect(heavy.stiffness / light.stiffness).toBeCloseTo(2, 12);
        expect(heavy.damping / light.damping).toBeCloseTo(2, 12);
    });
});

describe("the Hertzian force", () => {
    const closure = closeFace(FACE, 3);

    it("rises from zero at touch with no step, and never pulls", () => {
        expect(hertzForce(closure, 0, 3)).toBe(0);
        expect(hertzForce(closure, 1e-12, 3)).toBeLessThan(1e-3);
        for (const rate of [-10, -1, 0, 1, 10]) {
            expect(hertzForce(closure, 1e-5, rate)).toBeGreaterThanOrEqual(0);
        }
    });

    it("has k_t = (2/7)·(3/2)·k·√δ and c_t = c·√δ·√(2/7) at a closed contact", () => {
        const depth = 2e-5;
        const law = hertzTangent(closure, depth);
        expect(law.tangentialStiffness).toBeCloseTo(
            TANGENTIAL_STIFFNESS_RATIO * 1.5 * closure.stiffness * Math.sqrt(depth),
            6,
        );
        expect(law.tangentialDamping).toBeCloseTo(
            closure.damping * Math.sqrt(depth) * Math.sqrt(TANGENTIAL_STIFFNESS_RATIO),
            9,
        );
        expect(law.friction).toBe(FACE.friction);
    });

    it("stores (2/5)·k·δ^{5/2}, the work of the elastic part", () => {
        const depth = 3e-5;
        expect(hertzEnergy(closure, depth)).toBeCloseTo(0.4 * closure.stiffness * Math.pow(depth, 2.5), 12);
    });
});

describe("carrySpring", () => {
    const n = vec3(0, 0, 1);

    it("projects the spring onto the tangent plane", () => {
        expect(carrySpring(vec3(1e-6, 2e-6, 3e-6), n, 5, 5)).toEqual(vec3(1e-6, 2e-6, 0));
    });

    it("keeps the force when the stiffness grows, and the displacement when it shrinks", () => {
        const grown = carrySpring(vec3(1e-6, 0, 0), n, 100, 400);
        expect(grown.x * 400).toBeCloseTo(1e-6 * 100, 18);
        expect(carrySpring(vec3(1e-6, 0, 0), n, 400, 100)).toEqual(vec3(1e-6, 0, 0));
    });

    it("leaves a spring loaded from rest as it is", () => {
        expect(carrySpring(vec3(1e-6, 0, 0), n, 0, 400)).toEqual(vec3(1e-6, 0, 0));
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/impact/contactLaw.test.ts`
Expected: FAIL, the new names are not functions.

- [ ] **Step 3: Add `FaceLaw`**

In `src/engine/impact/types.ts`, after `FaceMaterial`:

```ts
/**
 * A face's law against a ball (P2b.2b.2b.2a design §3.6): the pair's reduced mass (kg) and the face's friction. Each
 * closure sets the Hertzian k and c from it with the wood fits (contactLaw.ts closeFace).
 */
export interface FaceLaw {
    readonly mass: number;
    readonly friction: number;
}
```

- [ ] **Step 4: Implement the law**

In `src/engine/impact/contactLaw.ts`, extend the header with a second paragraph:

```ts
 *
 * The face–ball law (P2b.2b.2b.2a design §3) is Hertzian, F = √δ·(k·δ + c·δ′), clamped at zero (Kuwabara and Kono
 * 1987; Brilliantov et al. 1996). Scaled by the reduced mass m, k and the closing speed U (length L = (m·U²/k)^{2/5},
 * time L/U), it has one parameter, the dimensionless damping ĉ = c·L^{3/2}/(m·U). Its central collision's e(ĉ) and
 * duration τ(ĉ) follow by integration (hertzBounce). A closure at U takes ĉ and τ from a table over U, built once from
 * Gugan's wood fits, and sets L = U·T(U)/τ, k = m·U²/L^{5/2} and c = ĉ·m·U/L^{3/2}, so that the fits hold.
```

Change the imports and add the reference import:

```ts
import { contactReference } from "../../reference/index";
import { atan2, ln, pow } from "../math/elementary";
import { dot, length, scale, sub, type Vec3 } from "../math/vec3";
import type { FaceLaw } from "./types";
```

Append after `tangentialForce`:

```ts
/**
 * A tangential spring ξ carried into a step (P2b.2b.2b.2a design §3.5, §4.3; plan decision 2): projected onto the
 * tangent plane of unit normal `normal`, then, if its stiffness has grown from `before` to `now`, scaled by
 * before/now. The force it carries then does not grow, and its stored energy ½·k_t·ξ² never rises without slip. A
 * stiffness that shrinks keeps ξ, so the force and the energy fall with it. A spring loaded from rest (`before` 0) is
 * kept. A linear law's stiffness never changes, so its pairs are as before.
 */
export function carrySpring(spring: Vec3, normal: Vec3, before: number, now: number): Vec3 {
    const carried = sub(spring, scale(normal, dot(spring, normal)));
    return now > before && before > 0 ? scale(carried, before / now) : carried;
}

const RESTITUTION_FIT = contactReference.faceRestitutionFit.coefficients as {
    readonly a: number;
    readonly b: number;
    readonly p: number;
};
const TIME_FIT = contactReference.faceContactTimeFit.coefficients as {
    readonly t0: number;
    readonly u0: number;
    readonly q: number;
};

/** The face fits' speed range (m/s): a closure's speed is clamped to it (design §3.3). */
export const FACE_SPEED_MIN = contactReference.faceRestitutionFit.range[0];
export const FACE_SPEED_MAX = contactReference.faceRestitutionFit.range[1];

/** Gugan's restitution of a wooden face at closing speed U (m/s): √(1 − (a + b·U^p)). */
export function faceRestitutionAt(speed: number): number {
    return Math.sqrt(1 - (RESTITUTION_FIT.a + RESTITUTION_FIT.b * pow(speed, RESTITUTION_FIT.p)));
}

/** Gugan's contact time (s) of a wooden face at closing speed U (m/s): t0·(U/u0)^q. */
export function faceContactTimeAt(speed: number): number {
    return TIME_FIT.t0 * pow(speed / TIME_FIT.u0, TIME_FIT.q);
}

/** A dimensionless central collision: its restitution, and its duration in units of L/U. */
export interface HertzBounce {
    readonly restitution: number;
    readonly duration: number;
}

/**
 * Step of the dimensionless integration, in units of L/U. Numerical, not physical: RK4 at this step agrees with one at
 * 1e-5 to 1e-6 in e and 6e-7 relative in τ over ĉ ∈ [0, 1] (pre-flight). The force's √x is not smooth at the touch,
 * which costs RK4 its order in the first steps, but at ĉ ≈ 0.2 that error is below 1e-5.
 */
const HERTZ_STEP = 2e-3;

/**
 * The clamped law's central collision at damping ĉ (design §3.4): x'' = −√x·(x + ĉ·x′) from x = 0, x′ = 1, by RK4,
 * until the force √x·(x + ĉ·x′) falls to zero. The release is interpolated linearly within its step, both its time
 * and the velocity at it, whose negative is e.
 */
export function hertzBounce(damping: number, step = HERTZ_STEP): HertzBounce {
    const accel = (x: number, v: number): number => (x > 0 ? 0 - Math.sqrt(x) * (x + damping * v) : 0);
    const h = step;
    let x = 0;
    let v = 1;
    let s = 0;
    let force = damping;
    for (;;) {
        const k1x = v;
        const k1v = accel(x, v);
        const k2x = v + (h / 2) * k1v;
        const k2v = accel(x + (h / 2) * k1x, v + (h / 2) * k1v);
        const k3x = v + (h / 2) * k2v;
        const k3v = accel(x + (h / 2) * k2x, v + (h / 2) * k2v);
        const k4x = v + h * k3v;
        const k4v = accel(x + h * k3x, v + h * k3v);
        const nx = x + (h / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
        const nv = v + (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
        // x + ĉ·x′ carries the force's sign while x > 0, and falls through zero at the release (at x = 0 if ĉ = 0).
        const next = nx + damping * nv;
        if (s > 0 && next <= 0) {
            const theta = force / (force - next);
            return { restitution: 0 - (v + theta * (nv - v)), duration: s + theta * h };
        }
        x = nx;
        v = nv;
        s += h;
        force = next;
    }
}

/**
 * Spacing (m/s) of the closure table's speed grid. Numerical, not physical: linear interpolation between its points
 * misses the fit's e by at most 3.3e-5 at mid-grid (pre-flight), within §5.1's 1e-4.
 */
const TABLE_SPACING = 0.1;

/** Bisection steps on ĉ: from a bracket of width 1, 2^-30 ≈ 1e-9, far below the table's interpolation error. */
const DAMPING_STEPS = 30;

interface TableRow {
    readonly damping: number;
    readonly duration: number;
}

/** The ĉ whose bounce has restitution `target`, by bisection on [0, hi], hi doubled from 1 until e(hi) ≤ target. */
function dampingFor(target: number): number {
    let lo = 0;
    let hi = 1;
    while (hertzBounce(hi).restitution > target) {
        hi *= 2;
    }
    for (let n = 0; n < DAMPING_STEPS; n++) {
        const mid = lo + (hi - lo) / 2;
        if (hertzBounce(mid).restitution > target) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    return lo + (hi - lo) / 2;
}

let table: readonly TableRow[] | null = null;

/**
 * The closure table (design §3.4; plan decision 5): ĉ(U) and τ(U) at U = FACE_SPEED_MIN + i·TABLE_SPACING, the last
 * point FACE_SPEED_MAX. Built once, on the first closure, from constants only, so every run reads the same table.
 */
function closureTable(): readonly TableRow[] {
    if (table !== null) {
        return table;
    }
    const count = Math.round((FACE_SPEED_MAX - FACE_SPEED_MIN) / TABLE_SPACING);
    const rows: TableRow[] = [];
    for (let i = 0; i <= count; i++) {
        const speed = i === count ? FACE_SPEED_MAX : FACE_SPEED_MIN + i * TABLE_SPACING;
        const damping = dampingFor(faceRestitutionAt(speed));
        rows.push({ damping, duration: hertzBounce(damping).duration });
    }
    table = rows;
    return rows;
}

/**
 * A face–ball contact's law from its closure until it opens (design §3.3): the closing speed U as met (m/s), the
 * Hertzian stiffness k (N/m^{3/2}) and damping c (N·s/m^{3/2}) set from U clamped to [FACE_SPEED_MIN,
 * FACE_SPEED_MAX], and the face's friction.
 */
export interface HertzClosure {
    readonly speed: number;
    readonly stiffness: number;
    readonly damping: number;
    readonly friction: number;
}

/**
 * Closes a face–ball pair of law `law` at closing speed `speed` (design §3.3): ĉ and τ interpolated linearly in the
 * clamped speed u, then L = u·T(u)/τ, k = m·u²/L^{5/2} and c = ĉ·m·u/L^{3/2}. A speed of zero or less, or NaN, takes
 * the slowest law.
 */
export function closeFace(law: FaceLaw, speed: number): HertzClosure {
    const u = speed > FACE_SPEED_MIN ? Math.min(speed, FACE_SPEED_MAX) : FACE_SPEED_MIN;
    const rows = closureTable();
    const at = (u - FACE_SPEED_MIN) / TABLE_SPACING;
    const i = Math.min(rows.length - 2, Math.floor(at));
    const f = at - i;
    const a = rows[i] as TableRow;
    const b = rows[i + 1] as TableRow;
    const damping = a.damping + (b.damping - a.damping) * f;
    const duration = a.duration + (b.duration - a.duration) * f;
    const L = (u * faceContactTimeAt(u)) / duration;
    const root = Math.sqrt(L);
    return {
        speed,
        stiffness: (law.mass * u * u) / (L * L * root),
        damping: (damping * law.mass * u) / (L * root),
        friction: law.friction,
    };
}

/** The face's normal force (N) at penetration `depth` > 0 closing at `rate` (m/s): √δ·(k·δ + c·δ′), clamped at 0. */
export function hertzForce(closure: HertzClosure, depth: number, rate: number): number {
    return Math.max(0, Math.sqrt(depth) * (closure.stiffness * depth + closure.damping * rate));
}

/**
 * The closed face's current linearised law at `depth` (design §3.5): the normal's tangent stiffness (3/2)·k·√δ and
 * damping c·√δ, k_t = TANGENTIAL_STIFFNESS_RATIO of that stiffness, c_t = c_n·√(k_t/k_n), and the friction.
 */
export function hertzTangent(closure: HertzClosure, depth: number): PairLaw {
    const root = Math.sqrt(depth);
    const stiffness = 1.5 * closure.stiffness * root;
    const damping = closure.damping * root;
    return {
        stiffness,
        damping,
        tangentialStiffness: TANGENTIAL_STIFFNESS_RATIO * stiffness,
        tangentialDamping: damping * Math.sqrt(TANGENTIAL_STIFFNESS_RATIO),
        friction: closure.friction,
    };
}

/** The face's stored elastic energy (J) at `depth`: (2/5)·k·δ^{5/2}. */
export function hertzEnergy(closure: HertzClosure, depth: number): number {
    return 0.4 * closure.stiffness * depth * depth * Math.sqrt(depth);
}
```

`ln` stays imported for `dampingRatio` and `log1p`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/impact/contactLaw.test.ts`
Expected: PASS.

If a `closeFace` case misses its bound, check `hertzBounce` against `directBounce` at the case's ĉ before changing
`TABLE_SPACING` or `HERTZ_STEP`. If a constant has to change, re-state its "pre-flight" figure from the run.

- [ ] **Step 6: Run every check**

Run: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/engine/impact/types.ts src/engine/impact/contactLaw.ts tests/engine/impact/contactLaw.test.ts
git commit -F <temp>/msg-task3.txt
```

Message: `Add the Hertzian face law, set at each closure from Gugan's fits`

---
### Task 4: The turf bed

Spec §4.1–§4.3, §4.6's static sink and bouncing rule, and §5.1's bed cases that need no fitted values; review focus 3;
decisions 2 and 6.

**Files:**
- Modify: `src/engine/impact/types.ts` (`BedLaw`)
- Create: `src/engine/impact/turfBed.ts`
- Create: `tests/engine/impact/turfBed.test.ts`

**Interfaces:**
- Consumes: `exp` (Task 1); `carrySpring`, `tangentialForce`, `TANGENTIAL_STIFFNESS_RATIO`, `PairLaw`
  (`contactLaw.ts`).
- Produces, from `src/engine/impact/types.ts`:
  `interface BedLaw { readonly modulus: number; readonly recovery: number; readonly friction: number;
  readonly cell: number }`.
- Produces, from `src/engine/impact/turfBed.ts`:
  - `const BED_CELL = 0.002`, `const BED_DROP = 1e-6`
  - `interface BallBed` (mutable: `spring`, `tangent`, `held`, `step`, `visits`; readonly `law`, `decay`, `cells`)
  - `function newBallBed(law: BedLaw, dt: number): BallBed`
  - `interface BedLoad { force; torque; normal; normalForce; tangentialForce; spring; law: PairLaw; held }`
  - `function bedLoad(bed: BallBed, s: BallState, radius: number, dt: number): BedLoad | null`
  - `function bedRelax(bed: BallBed): void`
  - `function bedEnergy(bed: BallBed): number`
  - `function heldDepth(bed: BallBed): number`
  - `function freshForce(x: number, y: number, radius: number, depth: number, law: BedLaw): number`
  - `function staticSink(x: number, y: number, radius: number, weight: number, law: BedLaw): number`
  - `interface FreshBed { readonly law: BedLaw; readonly engage: readonly number[] }`
  - `function freshBed(x: number, y: number, radius: number, law: BedLaw): FreshBed`
  - `function freshPotential(fresh: FreshBed, depth: number): number`
  - `function isBouncing(fresh: FreshBed, mass: number, gravity: number, vz: number, depth: number): boolean`

- [ ] **Step 1: Add `BedLaw`**

In `src/engine/impact/types.ts`, after `FaceLaw`:

```ts
/**
 * The turf bed's law under a ball (P2b.2b.2b.2a design §4): the bed modulus k_w (N/m³), its recovery time τ_r (s;
 * 0, in isolated tests only, makes every cell an undamped spring), the sliding friction µ and the cell's side h (m).
 */
export interface BedLaw {
    readonly modulus: number;
    readonly recovery: number;
    readonly friction: number;
    readonly cell: number;
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/engine/impact/turfBed.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ZERO, add, length, scale, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import type { BallState } from "../../../src/engine/types";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import {
    BED_CELL,
    bedLoad,
    bedRelax,
    freshBed,
    freshForce,
    freshPotential,
    isBouncing,
    newBallBed,
    staticSink,
    type BallBed,
} from "../../../src/engine/impact/turfBed";
import type { BedLaw } from "../../../src/engine/impact/types";
import { TEST_BALL } from "../support/fixtures";

const R = TEST_BALL.radius;
const M = TEST_BALL.mass;
const G = STANDARD_GRAVITY;
const W = M * G;
const DT = 5e-6;
/** A plausible bed, not the fitted one (fixtures' policy): k_w 3e8 N/m³, τ_r 2 ms, µ 0.48. */
const LAW: BedLaw = { modulus: 3e8, recovery: 2e-3, friction: 0.48, cell: BED_CELL };

const at = (x: number, y: number, z: number, v: Vec3 = ZERO, w: Vec3 = ZERO): BallState => ({
    position: vec3(x, y, z),
    velocity: v,
    angularVelocity: w,
});

/** One ball on `bed` under gravity, by the impact's semi-implicit Euler, for `steps` steps; returns every state. */
function run(bed: BallBed, start: BallState, steps: number, gravity = G): BallState[] {
    const inertia = 0.4 * M * R * R;
    const states = [start];
    let s = start;
    for (let n = 0; n < steps; n++) {
        const load = bedLoad(bed, s, R, DT);
        const force = add(vec3(0, 0, -M * gravity), load === null ? ZERO : load.force);
        const v = add(s.velocity, scale(force, DT / M));
        const w = load === null ? s.angularVelocity : add(s.angularVelocity, scale(load.torque, DT / inertia));
        s = { position: add(s.position, scale(v, DT)), velocity: v, angularVelocity: w };
        bedRelax(bed);
        states.push(s);
    }
    return states;
}

describe("a fresh bed under a slowly pressed ball", () => {
    it("matches the Winkler closed form F = π·k_w·(R·δ² − δ³/3) within 1 % at δ ≤ 2 mm", () => {
        // A sphere on a Winkler bed: F = k_w·∫ w dA over the cap, w = δ − r²/(2R) to first order; exactly
        // F = π·k_w·(R·δ² − δ³/3). A 0.5 mm lattice reaches the continuum within 1 % at δ ≥ 0.5 mm.
        const fine: BedLaw = { ...LAW, cell: 5e-4 };
        for (const depth of [5e-4, 1e-3, 2e-3]) {
            const exact = Math.PI * LAW.modulus * (R * depth * depth - (depth * depth * depth) / 3);
            expect(Math.abs(freshForce(0.01, 0.02, R, depth, fine) / exact - 1), `δ = ${depth}`).toBeLessThan(1e-2);
        }
    });

    it("sinks to where its weight is carried, about 0.32 mm on this bed", () => {
        const sink = staticSink(0, 0, R, W, LAW);
        expect(freshForce(0, 0, R, sink, LAW)).toBeGreaterThanOrEqual(W);
        expect(freshForce(0, 0, R, sink - 1e-12, LAW)).toBeLessThan(W);
        // Pre-flight: 0.3217 mm at a cell centre, 0.3213–0.3229 mm across offsets.
        expect(sink).toBeGreaterThan(3.1e-4);
        expect(sink).toBeLessThan(3.3e-4);
    });

    it.each([
        ["a cell centre", 0.5 * BED_CELL, 0.5 * BED_CELL],
        ["an offset of h/3 in x and y", BED_CELL / 3, BED_CELL / 3],
    ])("keeps a ball placed at its static sink at %s within 1 µm for 50 ms", (_, x, y) => {
        // The lattice's sideways push on a resting ball is at most about 6e-4 of its weight (pre-flight; 1.5e-5 at
        // h/3), so it drifts less than 1 µm in 50 ms at these offsets.
        const sink = staticSink(x, y, R, W, LAW);
        const start = at(x, y, R - sink);
        const states = run(newBallBed(LAW, DT), start, 10_000);
        for (const s of states) {
            expect(length(add(s.position, scale(start.position, -1)))).toBeLessThan(1e-6);
        }
    });
});

describe("the bouncing rule", () => {
    it("puts the threshold at (2/3)·m·g·δ₀ on a Winkler bed in the continuum limit", () => {
        // U_f(δ) = π·k_w·R·δ³/3 at small δ, and F(δ₀) = m·g, so m·g·δ₀ − U_f(δ₀) = (2/3)·m·g·δ₀.
        const fine: BedLaw = { ...LAW, cell: 5e-5 };
        const sink = staticSink(0, 0, R, W, fine);
        const fresh = freshBed(0, 0, R, fine);
        const threshold = W * sink - freshPotential(fresh, sink);
        expect(Math.abs(threshold / ((2 / 3) * W * sink) - 1)).toBeLessThan(1e-2);
    });

    it("keeps a ball released from rest just below the threshold's height in the turf, and lifts one just above", () => {
        // From rest at depth δ, the ball reaches the surface exactly when U_f(δ) − m·g·δ = 0: isBouncing's own sign.
        const sink = staticSink(0, 0, R, W, LAW);
        const fresh = freshBed(0, 0, R, LAW);
        let lo = sink;
        let hi = 4 * sink;
        for (let n = 0; n < 60; n++) {
            const mid = (lo + hi) / 2;
            if (isBouncing(fresh, M, G, 0, mid)) {
                hi = mid;
            } else {
                lo = mid;
            }
        }
        // The undamped bed's ball returns its stored energy, so it reaches the threshold's depth from below.
        const elastic: BedLaw = { ...LAW, recovery: 0 };
        const below = run(newBallBed(elastic, DT), at(0, 0, R - 0.97 * hi), 4000);
        const above = run(newBallBed(elastic, DT), at(0, 0, R - 1.03 * hi), 4000);
        expect(Math.max(...below.map((s) => s.position.z))).toBeLessThan(R);
        expect(Math.max(...above.map((s) => s.position.z))).toBeGreaterThan(R);
    });

    it.each([1, 3, 5])("classifies a ball rolling at %s m/s across a fresh bed not bouncing within 20 ms", (speed) => {
        const sink = staticSink(0, 0, R, W, LAW);
        const start = at(0, 0, R - sink, vec3(speed, 0, 0), vec3(0, speed / R, 0));
        const bed = newBallBed(LAW, DT);
        const states = run(bed, start, 4000);
        const fresh = freshBed(0, 0, R, LAW);
        const last = states[states.length - 1] as BallState;
        expect(bed.held).toBeGreaterThan(0);
        // §4.6: should this fail, the plan stops and raises it with the user (spec §4.6, "Still bouncing").
        expect(isBouncing(fresh, M, G, last.velocity.z, R - last.position.z)).toBe(false);
    });
});

describe("a cell's recovery", () => {
    it("recovers as w₀·exp(−t/τ_r) within 1e-12 relative once released", () => {
        const bed = newBallBed(LAW, DT);
        bedLoad(bed, at(0.0011, 0.0013, R - 1e-3), R, DT);
        // The ball vanishes upward: every cell it held releases at its depth and then only recovers.
        const depths = new Map([...bed.cells].map(([key, cell]) => [key, cell.w]));
        bedLoad(bed, at(0.0011, 0.0013, 10), R, DT);
        for (let n = 0; n < 200; n++) {
            bedRelax(bed);
        }
        for (const [key, cell] of bed.cells) {
            const expected = (depths.get(key) as number) * Math.exp((-200 * DT) / LAW.recovery);
            expect(Math.abs(cell.w / expected - 1)).toBeLessThan(1e-12);
        }
    });
});

describe("the ramp and friction", () => {
    it("pushes back against a ball rolling across a fresh bed: the ramp", () => {
        const sink = staticSink(0, 0, R, W, LAW);
        const bed = newBallBed(LAW, DT);
        const states = run(bed, at(0, 0, R - sink, vec3(2, 0, 0), vec3(0, 2 / R, 0)), 2000);
        const s = states[states.length - 1] as BallState;
        const load = bedLoad(bed, s, R, DT);
        // Rolling without slip, friction carries little; the leading cells' normals lean back against the motion.
        expect((load?.normal.x as number) < 0).toBe(true);
    });

    it("slides a ball at µ against the resultant normal", () => {
        const sink = staticSink(0, 0, R, W, LAW);
        const bed = newBallBed(LAW, DT);
        // Sliding at 2 m/s with no spin: the contact point slips forward, so friction is at the cone.
        const states = run(bed, at(0, 0, R - sink, vec3(2, 0, 0)), 400);
        const load = bedLoad(bed, states[states.length - 1] as BallState, R, DT);
        expect(load).not.toBeNull();
        const l = load as NonNullable<typeof load>;
        expect(length(l.tangentialForce) / l.normalForce).toBeCloseTo(LAW.friction, 9);
        expect(l.tangentialForce.x).toBeLessThan(0);
    });
});

describe("determinism", () => {
    it.each([0, 10])("gives the exactly mirrored load for a ball mirrored across y = 0 at |y| = %s m", (y) => {
        const sink = staticSink(0.3, y + 0.0007, R, W, LAW);
        const a = newBallBed(LAW, DT);
        const b = newBallBed(LAW, DT);
        const sa = at(0.3, y + 0.0007, R - sink, vec3(1.5, 0.4, -0.2), vec3(3, -7, 1));
        const sb = at(0.3, 0 - (y + 0.0007), R - sink, vec3(1.5, -0.4, -0.2), vec3(-3, -7, -1));
        const ra = run(a, sa, 300);
        const rb = run(b, sb, 300);
        const last = ra.length - 1;
        const pa = (ra[last] as BallState).position;
        const pb = (rb[last] as BallState).position;
        expect([pa.x, -pa.y, pa.z]).toEqual([pb.x, pb.y, pb.z]);
        const la = bedLoad(a, ra[last] as BallState, R, DT);
        const lb = bedLoad(b, rb[last] as BallState, R, DT);
        expect(la?.force.y).toBe(-(lb?.force.y as number));
        expect(la?.force.z).toBe(lb?.force.z);
    });

    it("loads a ball far from the origin as one near it, offset by whole cells (review focus 3)", () => {
        // Whole cells apart, the columns' offsets from the centre agree to rounding, so the forces agree to 1e-9;
        // the loop visits the same number of columns, wherever the ball lies.
        const near = newBallBed(LAW, DT);
        const far = newBallBed(LAW, DT);
        const dx = 12_500 * BED_CELL;
        const dy = 17_500 * BED_CELL;
        const ln = bedLoad(near, at(0.0003, 0.0007, R - 4e-4), R, DT);
        const lf = bedLoad(far, at(dx + 0.0003, dy + 0.0007, R - 4e-4), R, DT);
        expect(Math.abs((lf?.normalForce as number) / (ln?.normalForce as number) - 1)).toBeLessThan(1e-9);
        expect(far.visits).toBe(near.visits);
        expect(lf?.held).toBe(ln?.held);
    });
});
```

`run`'s gravity parameter stays for Task 6's fitted cases.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/impact/turfBed.test.ts`
Expected: FAIL, cannot resolve `turfBed`.

- [ ] **Step 4: Implement**

Create `src/engine/impact/turfBed.ts`:

```ts
/**
 * The turf bed (P2b.2b.2b.2a design §4): a Winkler bed of square Kelvin–Voigt cells that a ball presses down and that
 * recovers at a finite rate. Each ball has its own sparse set of cells on one world lattice, cell (i, j) centred at
 * ((i + ½)·h, (j + ½)·h), so the lattice is symmetric about x = 0 and y = 0.
 *
 * A cell is created, held, when the ball's lowest surface over its centre first goes below z = 0. A held cell's
 * surface follows the ball's, w = −z_b, with w′ = −dz_b/dt the total derivative at the cell's fixed centre (the
 * ball's horizontal motion over its own curved surface included). It pushes A·k_w·(w + τ_r·w′) along the sphere's
 * inward normal over its centre, through the ball's centre, its vertical component that force. So the cells on a
 * moving ball's leading wall push back as well as up: the ramp. A held cell whose force would pull lets go. Released,
 * it recovers freely, w′ = −w/τ_r, exactly over each step (bedRelax). It is held again when the ball's surface
 * reaches it, and dropped once released below BED_DROP. The pair's friction is one Cundall–Strack spring at µ, on the
 * bed's current tangent stiffness k_w·A·N over its N held cells (design §4.3).
 *
 * Determinism (design §4.1). Every cell's update depends only on the cell and the ball, so the order of updates does
 * not matter. The resultant is summed over each mirror pair (j, −j − 1) first, then over the pairs in ascending
 * (i, p) order, p = max(j, −j − 1). A set-up mirrored across y = 0 therefore gives the mirrored resultant bit for bit,
 * wherever the ball lies.
 */
import { exp } from "../math/elementary";
import { ZERO, add, cross, dot, length, scale, sub, vec3, type Vec3 } from "../math/vec3";
import type { BallState } from "../types";
import { TANGENTIAL_STIFFNESS_RATIO, carrySpring, tangentialForce, type PairLaw } from "./contactLaw";
import type { BedLaw } from "./types";

/**
 * Side (m) of the bed's cells (design §4.1). Numerical, not physical: §5.1's grid convergence (1 mm against 2 mm)
 * bounds its effect, and about 20 cells carry a ball at rest.
 */
export const BED_CELL = 0.002;

/** Depth (m) below which a released cell is dropped (design §4.2). Numerical, not physical: 1 µm against pits in mm. */
export const BED_DROP = 1e-6;

/**
 * A cell's key, (i + KEY_OFFSET)·KEY_STRIDE + (j + KEY_OFFSET): exact for |i|, |j| < 2^20, about 2 km of lawn at
 * 2 mm, far beyond any court.
 */
const KEY_OFFSET = 1048576;
const KEY_STRIDE = 2097152;

const ROOT_RATIO = Math.sqrt(TANGENTIAL_STIFFNESS_RATIO);

interface Cell {
    /** Surface depth (m), never negative: the cell's surface lies at z = −w. */
    w: number;
    held: boolean;
    /** The load (BallBed.step) that last updated it. */
    seen: number;
}

/**
 * One ball's cells on the bed (design §4.1), its friction spring ξ and the tangential stiffness that spring last
 * carried (0 while no cell is held), the cells it held at the last load, the loads so far, and the columns visited
 * (a cost count for the probes).
 */
export interface BallBed {
    readonly law: BedLaw;
    /** exp(−dt/τ_r): a released cell's recovery over one step. */
    readonly decay: number;
    readonly cells: Map<number, Cell>;
    spring: Vec3;
    tangent: number;
    held: number;
    step: number;
    visits: number;
}

/** A ball's bed with no cell yet, stepping at `dt` (s). */
export function newBallBed(law: BedLaw, dt: number): BallBed {
    return {
        law,
        decay: exp(0 - dt / law.recovery),
        cells: new Map(),
        spring: ZERO,
        tangent: 0,
        held: 0,
        step: 0,
        visits: 0,
    };
}

/** The bed's load on a ball in one step (design §4.3), all on the ball, world frame. */
export interface BedLoad {
    /** The held cells' resultant plus friction (N), and friction's moment about the ball's centre (N·m). */
    readonly force: Vec3;
    readonly torque: Vec3;
    /** The resultant's unit direction and size (N): the pair's normal and normal force, as the probe sees them. */
    readonly normal: Vec3;
    readonly normalForce: number;
    /** Friction's force, the spring after the step, and the linearised law it used. */
    readonly tangentialForce: Vec3;
    readonly spring: Vec3;
    readonly law: PairLaw;
    readonly held: number;
}

/**
 * The cells' index range [lo, hi] along one axis for a footprint of radius ρ about `centre`, padded by one cell each
 * side: every column whose centre lies within ρ is inside, and a column outside is more than ρ + h/2 away.
 */
function span(centre: number, rho: number, h: number): readonly [number, number] {
    return [Math.floor((centre - rho) / h) - 1, Math.floor((centre + rho) / h) + 1];
}

/**
 * Updates the cell of column (i, j) under ball state `s` (design §4.2), creating it, held, where the ball's lowest
 * surface over its centre lies below z = 0. Returns its push on the ball (N), or null unless it is held.
 */
function column(bed: BallBed, i: number, j: number, s: BallState, radius: number): Vec3 | null {
    bed.visits += 1;
    const { law } = bed;
    const h = law.cell;
    const key = (i + KEY_OFFSET) * KEY_STRIDE + (j + KEY_OFFSET);
    const dx = (i + 0.5) * h - s.position.x;
    const dy = (j + 0.5) * h - s.position.y;
    const r2 = dx * dx + dy * dy;
    const R2 = radius * radius;
    const reaches = r2 < R2;
    const root = reaches ? Math.sqrt(R2 - r2) : 0;
    const zb = reaches ? s.position.z - root : Infinity;
    let cell = bed.cells.get(key);
    if (cell === undefined) {
        if (!(zb < 0)) {
            return null;
        }
        cell = { w: 0, held: true, seen: bed.step };
        bed.cells.set(key, cell);
    }
    cell.seen = bed.step;
    if (!(zb < 0)) {
        // The ball's surface has risen above the undeformed turf here: a held cell followed it to w = 0.
        if (cell.held) {
            cell.held = false;
            cell.w = 0;
        }
        return null;
    }
    if (!cell.held && zb > 0 - cell.w) {
        return null;
    }
    const w = 0 - zb;
    // w′ = −dz_b/dt at the cell's fixed centre, with z_b = c_z − √(R² − dx² − dy²) and dx, dy falling as c moves.
    const rate = (dx * s.velocity.x + dy * s.velocity.y) / root - s.velocity.z;
    const force = h * h * law.modulus * (w + law.recovery * rate);
    cell.w = w;
    if (force < 0) {
        cell.held = false;
        return null;
    }
    cell.held = true;
    // Along the inward normal (−dx, −dy, root)/R, scaled so that its vertical component is the cell's force.
    return vec3((force * (0 - dx)) / root, (force * (0 - dy)) / root, force);
}

/**
 * Updates `bed` under ball state `s` and returns its load for a step of `dt` (design §4.2, §4.3), or null while it
 * holds no cell (its friction spring then reset). Visits every column under the ball's footprint ρ = √(R² − z²), and
 * releases every held cell outside it, so a cell's state depends only on itself and the ball (see the file header).
 * Friction acts where the resultant's line meets the ball's surface, below the centre, at µ times the resultant's
 * size; its spring follows §3.5's rule on the bed's tangent stiffness k_w·A·N, carried by carrySpring.
 */
export function bedLoad(bed: BallBed, s: BallState, radius: number, dt: number): BedLoad | null {
    bed.step += 1;
    const h = bed.law.cell;
    const { x, y, z } = s.position;
    let resultant = ZERO;
    let held = 0;
    if (z < radius) {
        const rho = Math.sqrt(radius * radius - z * z);
        const [i0, i1] = span(x, rho, h);
        const [j0, j1] = span(y, rho, h);
        // p = max(j, −j − 1) over [j0, j1]: each p sums its mirror pair (p, −p − 1), whichever of them lie in range.
        const pLo = j0 >= 0 ? j0 : j1 < 0 ? 0 - j1 - 1 : 0;
        const pHi = Math.max(j1, 0 - j0 - 1);
        for (let i = i0; i <= i1; i++) {
            for (let p = pLo; p <= pHi; p++) {
                const q = 0 - p - 1;
                const a = p >= j0 && p <= j1 ? column(bed, i, p, s, radius) : null;
                const b = q >= j0 && q <= j1 ? column(bed, i, q, s, radius) : null;
                const pair = a === null ? b : b === null ? a : add(a, b);
                if (pair !== null) {
                    held += (a === null ? 0 : 1) + (b === null ? 0 : 1);
                    resultant = add(resultant, pair);
                }
            }
        }
    }
    for (const cell of bed.cells.values()) {
        if (cell.held && cell.seen !== bed.step) {
            cell.held = false;
            cell.w = 0;
        }
    }
    bed.held = held;
    if (held === 0) {
        bed.spring = ZERO;
        bed.tangent = 0;
        return null;
    }
    const size = length(resultant);
    const normal = size > 0 ? scale(resultant, 1 / size) : vec3(0, 0, 1);
    const arm = scale(normal, 0 - radius);
    const u = add(s.velocity, cross(s.angularVelocity, arm));
    const slip = sub(u, scale(normal, dot(u, normal)));
    const stiffness = bed.law.modulus * h * h * held;
    const damping = stiffness * bed.law.recovery;
    const law: PairLaw = {
        stiffness,
        damping,
        tangentialStiffness: TANGENTIAL_STIFFNESS_RATIO * stiffness,
        tangentialDamping: damping * ROOT_RATIO,
        friction: bed.law.friction,
    };
    const carried = carrySpring(bed.spring, normal, bed.tangent, law.tangentialStiffness);
    const tangential = tangentialForce(law, add(carried, scale(slip, dt)), slip, size);
    bed.spring = tangential.spring;
    bed.tangent = law.tangentialStiffness;
    return {
        force: add(resultant, tangential.force),
        torque: cross(arm, tangential.force),
        normal,
        normalForce: size,
        tangentialForce: tangential.force,
        spring: tangential.spring,
        law,
        held,
    };
}

/**
 * Advances the bed's released cells over one step (design §4.2): each recovers by `decay`, exactly, and is dropped
 * once below BED_DROP. Called after the step's bodies have moved.
 */
export function bedRelax(bed: BallBed): void {
    for (const [key, cell] of bed.cells) {
        if (cell.held) {
            continue;
        }
        cell.w *= bed.decay;
        if (cell.w < BED_DROP) {
            bed.cells.delete(key);
        }
    }
}

/** The bed's stored energy (J): Σ ½·A·k_w·w² over its cells, held and released (design §5.2). */
export function bedEnergy(bed: BallBed): number {
    let sum = 0;
    for (const cell of bed.cells.values()) {
        sum += cell.w * cell.w;
    }
    return 0.5 * bed.law.cell * bed.law.cell * bed.law.modulus * sum;
}

/** The deepest held cell's depth (m): how far the ball's surface lies below z = 0 over its held cells; 0 if none. */
export function heldDepth(bed: BallBed): number {
    let deepest = 0;
    for (const cell of bed.cells.values()) {
        if (cell.held) {
            deepest = Math.max(deepest, cell.w);
        }
    }
    return deepest;
}

/**
 * The cells' summed force (N) on a ball centred over (x, y) at depth δ = R − z, pressed slowly into a fresh bed:
 * Σ A·k_w·w over the columns it reaches below z = 0, in bedLoad's order and arithmetic, so that a ball placed at
 * staticSink's depth starts with the cells carrying exactly this.
 */
export function freshForce(x: number, y: number, radius: number, depth: number, law: BedLaw): number {
    const z = radius - depth;
    if (!(z < radius)) {
        return 0;
    }
    const h = law.cell;
    const R2 = radius * radius;
    const rho = Math.sqrt(R2 - z * z);
    const [i0, i1] = span(x, rho, h);
    const [j0, j1] = span(y, rho, h);
    const pLo = j0 >= 0 ? j0 : j1 < 0 ? 0 - j1 - 1 : 0;
    const pHi = Math.max(j1, 0 - j0 - 1);
    const one = (i: number, j: number): number => {
        const dx = (i + 0.5) * h - x;
        const dy = (j + 0.5) * h - y;
        const r2 = dx * dx + dy * dy;
        if (!(r2 < R2)) {
            return 0;
        }
        const zb = z - Math.sqrt(R2 - r2);
        return zb < 0 ? h * h * law.modulus * (0 - zb) : 0;
    };
    let total = 0;
    for (let i = i0; i <= i1; i++) {
        for (let p = pLo; p <= pHi; p++) {
            const q = 0 - p - 1;
            const a = p >= j0 && p <= j1 ? one(i, p) : 0;
            const b = q >= j0 && q <= j1 ? one(i, q) : 0;
            total += a + b;
        }
    }
    return total;
}

/**
 * The depth δ₀ (m) at which a ball of weight `weight` (N) centred over (x, y) rests on a fresh bed (design §4.6): the
 * smallest double at which freshForce carries it, by doubling from 0.1 mm and then bisection to adjacent doubles, so
 * the result is deterministic. Throws a RangeError if the bed cannot carry it within the ball's radius.
 */
export function staticSink(x: number, y: number, radius: number, weight: number, law: BedLaw): number {
    let hi = 1e-4;
    while (freshForce(x, y, radius, hi, law) < weight) {
        hi *= 2;
        if (hi > radius) {
            throw new RangeError("the bed cannot carry the ball's weight within its radius");
        }
    }
    let lo = 0;
    for (;;) {
        const mid = lo + (hi - lo) / 2;
        if (mid <= lo || mid >= hi) {
            return hi;
        }
        if (freshForce(x, y, radius, mid, law) < weight) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
}

/** A fresh bed under a ball's position (design §4.6): every column's engagement depth R − √(R² − r²), ascending. */
export interface FreshBed {
    readonly law: BedLaw;
    readonly engage: readonly number[];
}

/** The fresh bed under a ball centred over (x, y): the engagement depth of every column whose centre it reaches. */
export function freshBed(x: number, y: number, radius: number, law: BedLaw): FreshBed {
    const h = law.cell;
    const R2 = radius * radius;
    const [i0, i1] = span(x, radius, h);
    const [j0, j1] = span(y, radius, h);
    const engage: number[] = [];
    for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
            const dx = (i + 0.5) * h - x;
            const dy = (j + 0.5) * h - y;
            const r2 = dx * dx + dy * dy;
            if (r2 < R2) {
                engage.push(radius - Math.sqrt(R2 - r2));
            }
        }
    }
    engage.sort((a, b) => a - b);
    return { law, engage };
}

/** U_f(δ): the work (J) to press the ball slowly to depth δ into the fresh bed, Σ ½·A·k_w·(δ − d)² over d < δ. */
export function freshPotential(fresh: FreshBed, depth: number): number {
    let sum = 0;
    for (const d of fresh.engage) {
        if (!(d < depth)) {
            break;
        }
        const w = depth - d;
        sum += w * w;
    }
    return 0.5 * fresh.law.cell * fresh.law.cell * fresh.law.modulus * sum;
}

/**
 * True while a ball in the turf at depth δ = R − z, moving vertically at v_z, still bounces (design §4.6; plan
 * decision 6). Its vertical oscillation energy E = ½·m·v_z² + U_f(δ) − U_f(δ₀) − m·g·(δ − δ₀) exceeds what it needs to
 * reach the surface from rest at δ₀, E(0) = m·g·δ₀ − U_f(δ₀). Expanded, E − E(0) = ½·m·v_z² + U_f(δ) − m·g·δ, which
 * no longer depends on δ₀.
 */
export function isBouncing(fresh: FreshBed, mass: number, gravity: number, vz: number, depth: number): boolean {
    return 0.5 * mass * vz * vz + freshPotential(fresh, depth) - mass * gravity * depth > 0;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/impact/turfBed.test.ts`
Expected: PASS.

Trace any failure before changing an expectation:

- **The rolling ball "not bouncing".** If it fails, record the ball's E − E(0) over the 20 ms and stop. Raise it with
  the user, as spec §4.6 says. Do not loosen the rule.
- **The 1 µm rest.** If it fails at h/3, measure the drift's direction. A sideways roll from the lattice's push goes
  to the user with its size. A vertical drift is a bug: the start must be at rest.

- [ ] **Step 6: Run every check**

Run: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/engine/impact/types.ts src/engine/impact/turfBed.ts tests/engine/impact/turfBed.test.ts
git commit -F <temp>/msg-task4.txt
```

Message: `Add the turf bed: recovering cells, their ramp and friction, the sink and the bouncing rule`

---
### Task 5: A landing on a fresh bed

Spec §4.7's landing, cap and settling, and §5.1's landing cases that need no fitted values; review focus 4.

**Files:**
- Create: `src/engine/impact/landing.ts`
- Create: `tests/engine/impact/landing.test.ts`

**Interfaces:**
- Consumes: `IMPACT_DT` (`integrate.ts`); `SETTLE_SPEED` (`resolve.ts`); the bed (Task 4).
- Produces, from `src/engine/impact/landing.ts`:
  - `const LANDING_CAP = 0.05`
  - `type LandingOutcome = "left" | "settled" | "capped"`
  - `interface Landing { readonly state: BallState; readonly outcome: LandingOutcome; readonly duration: number;
    readonly travel: number; readonly peakDepth: number; readonly steps: number; readonly visits: number }`
  - `function land(s: BallState, ball: BallParams, gravity: number, law: BedLaw, cap?: number): Landing`

- [ ] **Step 1: Write the failing tests**

Create `tests/engine/impact/landing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ZERO, horizontal, length, vec3 } from "../../../src/engine/math/vec3";
import { LANDING_CAP, land } from "../../../src/engine/impact/landing";
import { BED_CELL } from "../../../src/engine/impact/turfBed";
import type { BedLaw } from "../../../src/engine/impact/types";
import { SETTLE_SPEED } from "../../../src/engine/resolve";
import type { BallState } from "../../../src/engine/types";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import { TEST_BALL } from "../support/fixtures";
import { rng } from "../support/rng";

const R = TEST_BALL.radius;
const M = TEST_BALL.mass;
const G = STANDARD_GRAVITY;
/** A plausible bed, not the fitted one (fixtures' policy). */
const LAW: BedLaw = { modulus: 3e8, recovery: 2e-3, friction: 0.48, cell: BED_CELL };

const falling = (v: ReturnType<typeof vec3>, w = ZERO): BallState => ({
    position: vec3(3.0007, 4.0011, R),
    velocity: v,
    angularVelocity: w,
});

const energy = (s: BallState): number =>
    0.5 * M * (s.velocity.x ** 2 + s.velocity.y ** 2 + s.velocity.z ** 2) +
    0.2 * M * R * R * (s.angularVelocity.x ** 2 + s.angularVelocity.y ** 2 + s.angularVelocity.z ** 2);

describe("a landing on a fresh bed", () => {
    it("leaves a vertical landing with no spin rising, at the touchdown point, gaining no horizontal motion or spin", () => {
        const l = land(falling(vec3(0, 0, -3)), TEST_BALL, G, LAW);
        expect(l.outcome).toBe("left");
        expect(l.state.position).toEqual(vec3(3.0007, 4.0011, R));
        expect(l.state.velocity.z).toBeGreaterThan(SETTLE_SPEED);
        expect(l.state.velocity.z).toBeLessThan(3);
        // The lattice's sideways push is about 1e-4 of the weight; over a few ms it moves nothing measurable.
        expect(length(horizontal(l.state.velocity))).toBeLessThan(1e-4);
        expect(length(l.state.angularVelocity)).toBeLessThan(1e-2);
        expect(l.peakDepth).toBeGreaterThan(0);
        expect(l.duration).toBeGreaterThan(0);
    });

    it("leaves the ball on the turf, with its horizontal velocity and spin, when it lands slower than settling", () => {
        const l = land(falling(vec3(0.3, 0, -0.02), vec3(0, 0.3 / R, 0)), TEST_BALL, G, LAW);
        expect(l.outcome).toBe("settled");
        expect(l.state.velocity.z).toBe(0);
        expect(l.state.position.z).toBe(R);
        expect(l.state.velocity.x).toBeGreaterThan(0);
    });

    it("settles a grazing touchdown at once (review focus 4)", () => {
        const l = land(falling(vec3(0.5, 0, -1e-6), vec3(0, 0.5 / R, 0)), TEST_BALL, G, LAW);
        expect(l.outcome).toBe("settled");
        // A few ms of settling into the sink, not the cap.
        expect(l.duration).toBeLessThan(0.2 * LANDING_CAP);
    });

    it("slows a slanted landing's horizontal speed and moves its spin towards rolling at the new speed", () => {
        // No spin at 3 m/s forward: the contact point slips forward, so the ramp and friction slow the ball and
        // friction spins it forward. Direction asserted; the sizes are recorded by the probe (spec §6).
        const before = falling(vec3(3, 0, -2));
        const l = land(before, TEST_BALL, G, LAW);
        expect(l.state.velocity.x).toBeLessThan(3);
        expect(l.state.angularVelocity.y).toBeGreaterThan(0);
        const slipBefore = Math.abs(before.velocity.x - R * before.angularVelocity.y);
        const slipAfter = Math.abs(l.state.velocity.x - R * l.state.angularVelocity.y);
        expect(slipAfter).toBeLessThan(slipBefore);
        expect(l.travel).toBeGreaterThan(0);
    });

    it("settles a landing forced past its cap, and says so", () => {
        const l = land(falling(vec3(0, 0, -3)), TEST_BALL, G, LAW, 10 * 5e-6);
        expect(l.outcome).toBe("capped");
        expect(l.steps).toBe(10);
        expect(l.state.velocity.z).toBe(0);
        expect(l.state.position.z).toBe(R);
    });

    it("never gains energy (random landings)", () => {
        const random = rng(17);
        for (let n = 0; n < 40; n++) {
            const before = falling(
                vec3((random() - 0.5) * 6, (random() - 0.5) * 6, -0.05 - 4 * random()),
                vec3((random() - 0.5) * 100, (random() - 0.5) * 100, (random() - 0.5) * 20),
            );
            const l = land(before, TEST_BALL, G, LAW);
            // Kinetic energy at the touchdown point: the landing's gravity work over its depth is returned on leaving,
            // less what the bed keeps, so the ball never leaves with more.
            expect(energy(l.state), `landing ${n}`).toBeLessThanOrEqual(energy(before) * (1 + 1e-9));
        }
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/impact/landing.test.ts`
Expected: FAIL, cannot resolve `landing`.

- [ ] **Step 3: Implement**

Create `src/engine/impact/landing.ts`:

```ts
/**
 * A ball's landing in phase 2 (P2b.2b.2b.2a design §4.7): the ball alone, under gravity, on a fresh bed (turfBed.ts),
 * by the impact's semi-implicit Euler at IMPACT_DT, from touchdown (z = R) with its velocity and spin. The landing
 * ends:
 * - when the ball holds no cell and rises: it leaves;
 * - when, holding cells, it no longer bounces (§4.6's rule): it settles, its vertical velocity and depth set to rest
 *   on the flat turf, its horizontal velocity and spin kept;
 * - at LANDING_CAP: it is settled as above, and capped.
 * The outcome applies at the touchdown point: phase 2's clock and position do not carry the contact's few
 * milliseconds and millimetres (a recorded simplification). As before, a ball leaving slower than SETTLE_SPEED stays
 * on the turf.
 */
import { add, horizontal, length, scale, sub, vec3 } from "../math/vec3";
import { SETTLE_SPEED } from "../resolve";
import type { BallParams, BallState } from "../types";
import { IMPACT_DT } from "./integrate";
import { bedLoad, bedRelax, freshBed, isBouncing, newBallBed } from "./turfBed";
import type { BedLaw } from "./types";

/**
 * Longest landing (s) before it is settled with `landing-cap` (design §4.7): ten times the longest bed contact the
 * fit implies. A modelling bound, not physical.
 */
export const LANDING_CAP = 0.05;

/** How a landing ended: left the turf, settled on it, or settled at the cap. */
export type LandingOutcome = "left" | "settled" | "capped";

/** A landing's result: the ball as phase 2 takes it, and the contact's figures for the probes (design §6). */
export interface Landing {
    readonly state: BallState;
    readonly outcome: LandingOutcome;
    /** The contact's duration (s), the centre's horizontal travel in it (m) and its deepest δ = R − z (m). */
    readonly duration: number;
    readonly travel: number;
    readonly peakDepth: number;
    /** Steps integrated, and bed columns visited: the landing's cost. */
    readonly steps: number;
    readonly visits: number;
}

/**
 * Lands ball state `s` (its centre over the touchdown point, moving down) on a fresh bed of law `law` (see the file
 * header). `cap` (s) exists for tests.
 */
export function land(s: BallState, ball: BallParams, gravity: number, law: BedLaw, cap = LANDING_CAP): Landing {
    const R = ball.radius;
    const dt = IMPACT_DT;
    const inertia = 0.4 * ball.mass * R * R;
    const weight = vec3(0, 0, 0 - ball.mass * gravity);
    const touchdown = vec3(s.position.x, s.position.y, R);
    const bed = newBallBed(law, dt);
    const fresh = freshBed(touchdown.x, touchdown.y, R, law);
    let state: BallState = { ...s, position: touchdown };
    let steps = 0;
    let peak = 0;
    let outcome: LandingOutcome;
    for (;;) {
        const load = bedLoad(bed, state, R, dt);
        const force = load === null ? weight : add(weight, load.force);
        const velocity = add(state.velocity, scale(force, dt / ball.mass));
        const spin =
            load === null ? state.angularVelocity : add(state.angularVelocity, scale(load.torque, dt / inertia));
        state = { position: add(state.position, scale(velocity, dt)), velocity, angularVelocity: spin };
        bedRelax(bed);
        steps++;
        peak = Math.max(peak, R - state.position.z);
        if (load === null && velocity.z > 0) {
            outcome = "left";
            break;
        }
        if (load !== null && !isBouncing(fresh, ball.mass, gravity, velocity.z, R - state.position.z)) {
            outcome = "settled";
            break;
        }
        if (steps * dt >= cap) {
            outcome = "capped";
            break;
        }
    }
    const leaves = outcome === "left" && state.velocity.z >= SETTLE_SPEED;
    return {
        state: {
            position: touchdown,
            velocity: leaves ? state.velocity : horizontal(state.velocity),
            angularVelocity: state.angularVelocity,
        },
        outcome: outcome === "left" && !leaves ? "settled" : outcome,
        duration: steps * dt,
        travel: length(horizontal(sub(state.position, touchdown))),
        peakDepth: peak,
        steps,
        visits: bed.visits,
    };
}
```

If the import of `IMPACT_DT` from `integrate.ts` creates a cycle that `npm run check` or Vitest reports, move
`IMPACT_DT` and its comment into a new `src/engine/impact/step.ts`, and re-export it from `integrate.ts` unchanged.
Today `integrate.ts` does not import `landing.ts`, so no cycle is expected.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/impact/landing.test.ts`
Expected: PASS.

- [ ] **Step 5: Run every check**

Run: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/engine/impact/landing.ts tests/engine/impact/landing.test.ts
git commit -F <temp>/msg-task5.txt
```

Message: `Add a ball's landing on a fresh bed`

---
### Task 6: The bed's fit, its lawn fields and the low-speed gate

Spec §4.4 (the fit and the gate), §4.5's first two held-out checks, §4.6's stability check, and §5.1's fitted bed
cases (the A4R impact, e falling with speed, grid convergence) and the 5 m/s landing. Decisions 4, 11 and 12.

**Files:**
- Create: `scripts/turfFit.ts`
- Modify: `reference/contact.json` (`bedModulus`, `bedRecovery`), `src/reference/index.ts`
- Modify: `src/engine/types.ts` (`SurfaceProps`), `src/engine/world.ts` (`validateWorld`, `defaultWorld`)
- Modify: `src/engine/impact/turfBed.ts` (`bedLawOf`)
- Modify: `tests/engine/support/fixtures.ts` (`TEST_TURF`), and every test or script that builds a `SurfaceProps`
  literal (`grep -rn "turfRestitution:" tests scripts`)
- Test: `tests/engine/impact/turfBed.test.ts`, `tests/engine/impact/landing.test.ts`, `tests/engine/world.test.ts`,
  `tests/reference/reference.test.ts`
- Create: `docs/superpowers/probes/2026-10-09-p2b2b2b2a-turfFit.txt`

**Interfaces:**
- Consumes: `land` (Task 5); the bed (Task 4).
- Produces:
  - `SurfaceProps.bedModulus: number` (N/m³) and `SurfaceProps.bedRecovery: number` (s)
  - `contactReference.bedModulus`, `contactReference.bedRecovery`
  - `function bedLawOf(surface: SurfaceProps): BedLaw` (`turfBed.ts`): `{ modulus: bedModulus, recovery:
    bedRecovery, friction: slidingFriction, cell: BED_CELL }`

- [ ] **Step 1: Write the fit**

Create `scripts/turfFit.ts`:

```ts
/**
 * The turf bed's fit (P2b.2b.2b.2a design §4.4) and its records. Fits the bed modulus k_w and recovery time τ_r to
 * Gugan 4 §7.1 and Table 4(b), roll A4R: a free ball meeting a fresh bed vertically at 5 m/s leaves at 2.5 m/s (e 0.5)
 * after a maximum penetration of 7.2 mm. Then it prints:
 * - the held-out penetrations of A2R and A3R (§4.5);
 * - e from 0.1 to 6 m/s against Penner's golf fit;
 * - the bounce counts of drops from 0.05, 0.1 and 0.3 m (the low-speed gate);
 * - the explicit step's margin against the fitted bed's damping (§4.6);
 * - the grid check at 1 mm.
 * Run with `npx --yes tsx scripts/turfFit.ts`. Not part of the test suite.
 */
import { land } from "../src/engine/impact/landing";
import { BED_CELL } from "../src/engine/impact/turfBed";
import type { BedLaw } from "../src/engine/impact/types";
import { vec3 } from "../src/engine/math/vec3";
import { ballReference, frictionReference } from "../src/reference/index";
import { STANDARD_GRAVITY } from "../src/engine/world";

const BALL = { radius: ballReference.diameter.value / 2, mass: ballReference.mass.value };
const G = STANDARD_GRAVITY;
const MU = frictionReference.ballTurfSliding.value;
const TARGET_E = 0.5;
const TARGET_DEPTH = 7.2e-3;
const SPEED = 5;
const TOLERANCE = 1e-4;

const lawOf = (modulus: number, recovery: number, cell = BED_CELL): BedLaw => ({
    modulus,
    recovery,
    friction: MU,
    cell,
});

/** A free vertical impact at `speed` on a fresh bed: its e (rebound over impact speed) and its peak depth. */
function impact(law: BedLaw, speed: number): { e: number; depth: number; duration: number } {
    const l = land(
        { position: vec3(0.0007, 0.0011, BALL.radius), velocity: vec3(0, 0, 0 - speed), angularVelocity: vec3(0, 0, 0) },
        BALL,
        G,
        law,
    );
    return { e: l.outcome === "left" ? l.state.velocity.z / speed : 0, depth: l.peakDepth, duration: l.duration };
}

/** The modulus whose peak depth at SPEED is TARGET_DEPTH for recovery τ: bisection in ln k_w (depth falls with k_w). */
function modulusFor(recovery: number): number {
    let lo = 1e7;
    let hi = 1e10;
    for (let n = 0; n < 60; n++) {
        const mid = Math.sqrt(lo * hi);
        if (impact(lawOf(mid, recovery), SPEED).depth > TARGET_DEPTH) {
            lo = mid;
        } else {
            hi = mid;
        }
        if (hi / lo - 1 < 1e-7) {
            break;
        }
    }
    return Math.sqrt(lo * hi);
}

/** τ_r at which e at SPEED is TARGET_E, k_w re-solved at each trial: bisection in ln τ (e falls as τ grows). */
function fit(): { modulus: number; recovery: number } {
    let lo = 1e-5;
    let hi = 1e-1;
    for (let n = 0; n < 60; n++) {
        const mid = Math.sqrt(lo * hi);
        const e = impact(lawOf(modulusFor(mid), mid), SPEED).e;
        if (e > TARGET_E) {
            lo = mid;
        } else {
            hi = mid;
        }
        if (hi / lo - 1 < 1e-7) {
            break;
        }
    }
    const recovery = Math.sqrt(lo * hi);
    return { modulus: modulusFor(recovery), recovery };
}

/** Landings of a ball dropped from `height` until it stays on the turf (no air, no horizontal motion). */
function bounces(law: BedLaw, height: number): number {
    let speed = Math.sqrt(2 * G * height);
    let count = 0;
    for (;;) {
        count++;
        const l = land(
            { position: vec3(0.0007, 0.0011, BALL.radius), velocity: vec3(0, 0, 0 - speed), angularVelocity: vec3(0, 0, 0) },
            BALL,
            G,
            law,
        );
        if (l.outcome !== "left") {
            return count;
        }
        speed = l.state.velocity.z;
    }
}

const fitted = fit();
const law = lawOf(fitted.modulus, fitted.recovery);
const check = impact(law, SPEED);
console.log(`== Fit (A4R: e ${TARGET_E} and ${TARGET_DEPTH * 1e3} mm at ${SPEED} m/s) ==`);
console.log(`bedModulus ${fitted.modulus.toPrecision(6)} N/m³, bedRecovery ${fitted.recovery.toPrecision(6)} s`);
console.log(
    `check: e ${check.e.toFixed(6)} (rel ${Math.abs(check.e / TARGET_E - 1).toExponential(2)}), ` +
        `depth ${(check.depth * 1e3).toFixed(4)} mm (rel ${Math.abs(check.depth / TARGET_DEPTH - 1).toExponential(2)}), ` +
        `contact ${(check.duration * 1e3).toFixed(3)} ms`,
);
const ok = Math.abs(check.e / TARGET_E - 1) <= TOLERANCE && Math.abs(check.depth / TARGET_DEPTH - 1) <= TOLERANCE;
console.log(`within ${TOLERANCE} relative on both: ${ok}`);

console.log("== Held out: A2R and A3R (Gugan 4 Table 4(b): 4.0 and 5.0 mm) ==");
for (const [name, up] of [
    ["A2R", 1.52],
    ["A3R", 1.76],
] as const) {
    const r = impact(law, up / TARGET_E);
    console.log(`${name} at ${(up / TARGET_E).toFixed(2)} m/s: depth ${(r.depth * 1e3).toFixed(2)} mm, e ${r.e.toFixed(3)}`);
}

console.log("== e against impact speed (Penner's golf fit e = 0.510 − 0.0375v + 0.000903v², an analogue) ==");
for (const v of [0.1, 0.2, 0.3, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6]) {
    const r = impact(law, v);
    const penner = 0.51 - 0.0375 * v + 0.000903 * v * v;
    console.log(
        `${v.toFixed(2)} m/s: e ${r.e.toFixed(4)}, depth ${(r.depth * 1e3).toFixed(3)} mm, ` +
            `contact ${(r.duration * 1e3).toFixed(3)} ms; Penner ${penner.toFixed(3)}`,
    );
}

console.log("== Low-speed gate: landings until the ball stays on the turf ==");
for (const h of [0.05, 0.1, 0.3]) {
    console.log(`drop ${h} m (${Math.sqrt(2 * G * h).toFixed(3)} m/s): ${bounces(law, h)} landings`);
}

console.log("== Stability (§4.6): the bed's damping at A4R's footprint against the 5 µs step ==");
const footprint = Math.PI * 2 * BALL.radius * TARGET_DEPTH;
const damping = fitted.modulus * fitted.recovery * footprint;
console.log(
    `c ≈ ${damping.toPrecision(4)} N·s/m, 2m/c ${((2 * BALL.mass) / damping * 1e3).toFixed(3)} ms, ` +
        `c·dt/m ${((damping * 5e-6) / BALL.mass).toExponential(3)}`,
);

console.log("== Grid convergence (§5.1): h = 1 mm against 2 mm ==");
for (const v of [2, 5, 6]) {
    const a = impact(law, v);
    const b = impact(lawOf(fitted.modulus, fitted.recovery, 1e-3), v);
    console.log(
        `${v} m/s: e ${a.e.toFixed(4)} / ${b.e.toFixed(4)} (rel ${Math.abs(b.e / a.e - 1).toExponential(2)}), ` +
            `depth ${(a.depth * 1e3).toFixed(3)} / ${(b.depth * 1e3).toFixed(3)} mm`,
    );
}
```

The fit nests one bisection inside another. Each trial is one landing of about 5 ms, or 1000 steps, so the run takes
minutes. Run it in the background:

Run: `npx --yes tsx scripts/turfFit.ts > docs/superpowers/probes/2026-10-09-p2b2b2b2a-turfFit.txt`

Check the output:

- `within 0.0001 relative on both: true`. If it is false, or the bisection hits a bracket end (k_w near 1e7 or 1e10,
  τ_r near 1e-5 or 0.1), stop. Report to the user: the two targets have no joint solution on this bed.
- The stability line has 2m/c above 0.1 ms and c·dt/m below 0.05. If it fails, stop and report: §4.6's step is unsafe.
- Grid convergence within 1 % on e and on the depth at all three speeds. If not, record it and report it at the gate.

- [ ] **Step 2: Write the fitted values and their reader**

In `reference/contact.json`, after `ballTurfStiffness`, add two entries with the fitted values to six significant
figures:

```json
    "bedModulus": {
        "value": <k_w>,
        "unit": "N/m^3",
        "source": "Fitted (scripts/turfFit.ts) to Don Gugan, 'The Physics of Croquet Strokes: Analysis of the CA high-speed DVD', section 7.1 and Table 4(b) (2009; Oxford Croquet), https://oxfordcroquet.org/tech/gugan4/",
        "provenance": "derived",
        "note": "The turf bed's modulus (P2b.2b.2b.2a design §4.2, §4.4). Two targets, two parameters, with bedRecovery: a free ball meeting a fresh bed vertically at 5 m/s leaves at e 0.5 after a maximum penetration of 7.2 mm (A4R; Gugan: \"the downward velocity of the ball can be estimated to be close to 5 m/s immediately after impact, so comparing this with the upward velocity of 2.48 m/s gives a CoR for the ground of about 0.5\"). Solved to 1e-4 relative on both; the energy balance at 7.2 mm gives about 3e8 N/m³ for an elastic bed. No bounds: one court only (Gugan: \"courts can be expected to vary greatly\"); lawn presets and their bounds are P3's."
    },
    "bedRecovery": {
        "value": <τ_r>,
        "unit": "s",
        "source": "Fitted (scripts/turfFit.ts) to Don Gugan, 'The Physics of Croquet Strokes: Analysis of the CA high-speed DVD', section 7.1 and Table 4(b) (2009; Oxford Croquet), https://oxfordcroquet.org/tech/gugan4/",
        "provenance": "derived",
        "note": "The turf bed's recovery time τ_r = η/k_w (P2b.2b.2b.2a design §4.2, §4.4), fitted with bedModulus to A4R (see its note). Held out: A2R and A3R's penetrations, 4.0 and 5.0 mm (docs/superpowers/probes/2026-10-09-p2b2b2b2a-turfFit.txt). No bounds (P3)."
    },
```

In `src/reference/index.ts`, add to `contactReference` after `ballTurfStiffness`:

```ts
    bedModulus: readValue(contactJson, "bedModulus", "contact"),
    bedRecovery: readValue(contactJson, "bedRecovery", "contact"),
```

In `tests/reference/reference.test.ts`, the bounds test exempts the fitted pair (decision 4):

```ts
    it("gives every impact value bounds, so the probe can sweep them, and every fit a range", () => {
        // The bed's fitted pair has no bounds: one court only, and lawn presets are P3's (P2b.2b.2b.2a design §4.4).
        const unbounded = [contactReference.bedModulus, contactReference.bedRecovery];
        for (const v of [...Object.values(contactReference), ...Object.values(malletReference)]) {
            if ("range" in v) {
                expect(v.range[0], v.source).toBeLessThan(v.range[1]);
            } else if (!unbounded.includes(v)) {
                expect(v.bounds, v.source).toBeDefined();
            }
        }
    });
```

Also add `expect(contactReference.bedModulus.value).toBeGreaterThan(0)` and the same for `bedRecovery` to "loads
contact durations, turf stiffness and the tangential ratio".

- [ ] **Step 3: Add the lawn fields**

In `src/engine/types.ts`, rewrite `SurfaceProps`'s doc and add the fields:

```ts
/**
 * Turf properties at a point. `slidingFriction` and `rollingResistance` are dimensionless (multiply by g for a
 * deceleration). `bedModulus` (N/m³) and `bedRecovery` (s) are the turf bed's under a ball (P2b.2b.2b.2a design §4),
 * in the impact and at phase 2's landings. `turfStiffness` (N/m) and `turfRestitution` are the plane law the mallet
 * head meets (P2b.2b.1 design §4.1). Every turf property lives here so that a lawn can vary them by position, and a
 * match can change them between shots through the Lawn it passes in.
 */
export interface SurfaceProps {
    readonly slidingFriction: number;
    readonly rollingResistance: number;
    readonly turfStiffness: number;
    readonly turfRestitution: number;
    readonly bedModulus: number;
    readonly bedRecovery: number;
}
```

In `src/engine/world.ts`, `validateWorld`, after `requirePositive(surface.turfStiffness, …)`:

```ts
    requirePositive(surface.bedModulus, "lawn.bedModulus");
    requirePositive(surface.bedRecovery, "lawn.bedRecovery");
```

In `defaultWorld`'s surface:

```ts
        bedModulus: contactReference.bedModulus.value,
        bedRecovery: contactReference.bedRecovery.value,
```

In `src/engine/impact/turfBed.ts`, import `type SurfaceProps` from `../types` and add:

```ts
/** The bed's law at a lawn surface (design §4.4): its modulus and recovery, its sliding friction, and BED_CELL. */
export function bedLawOf(surface: SurfaceProps): BedLaw {
    return {
        modulus: surface.bedModulus,
        recovery: surface.bedRecovery,
        friction: surface.slidingFriction,
        cell: BED_CELL,
    };
}
```

In `tests/engine/support/fixtures.ts`:

```ts
/** Ball–turf contact of the test lawn (impact phase and landings). Plausible, not sourced. */
export const TEST_TURF = { turfStiffness: 2e5, turfRestitution: 0.5, bedModulus: 3e8, bedRecovery: 2e-3 } as const;
```

Run: `grep -rn "turfRestitution:" tests scripts src`

Add `bedModulus` and `bedRecovery` to every other `SurfaceProps` literal it finds. Take them from `TEST_TURF` in tests
and from `contactReference` in scripts.

In `tests/engine/world.test.ts`, add rejection cases beside the existing `turfStiffness` one. Find it with
`grep -n "turfStiffness" tests/engine/world.test.ts`. Use the same pattern, with `bedModulus: 0` and `bedRecovery:
-1` naming `lawn.bedModulus` and `lawn.bedRecovery`.

- [ ] **Step 4: Add the fitted cases**

In `tests/engine/impact/turfBed.test.ts`, import `contactReference` and `land`, and add:

```ts
describe("the fitted bed (scripts/turfFit.ts)", () => {
    const FITTED: BedLaw = {
        modulus: contactReference.bedModulus.value,
        recovery: contactReference.bedRecovery.value,
        friction: 0.48,
        cell: BED_CELL,
    };
    // The reference ball, which the fit used (scripts/turfFit.ts).
    const BALL = { radius: ballReference.diameter.value / 2, mass: ballReference.mass.value };
    const vertical = (law: BedLaw, speed: number): { e: number; depth: number } => {
        const l = land(
            { position: vec3(0.0007, 0.0011, BALL.radius), velocity: vec3(0, 0, -speed), angularVelocity: ZERO },
            BALL,
            G,
            law,
        );
        return { e: l.state.velocity.z / speed, depth: l.peakDepth };
    };

    it("gives A4R's e 0.5 and 7.2 mm at 5 m/s within the fit's tolerance", () => {
        const r = vertical(FITTED, 5);
        expect(Math.abs(r.e / 0.5 - 1)).toBeLessThan(1e-4);
        expect(Math.abs(r.depth / 7.2e-3 - 1)).toBeLessThan(1e-4);
    });

    it("loses more the faster the ball strikes: e falls monotonically over 1–6 m/s", () => {
        let last = 1;
        for (const v of [1, 2, 3, 4, 5, 6]) {
            const e = vertical(FITTED, v).e;
            expect(e, `${v} m/s`).toBeLessThan(last);
            last = e;
        }
    });

    it.each([2, 5, 6])("agrees between h = 1 mm and h = 2 mm within 1 %% at %s m/s", (v) => {
        const a = vertical(FITTED, v);
        const b = vertical({ ...FITTED, cell: 1e-3 }, v);
        expect(Math.abs(b.e / a.e - 1)).toBeLessThan(1e-2);
        expect(Math.abs(b.depth / a.depth - 1)).toBeLessThan(1e-2);
    });
});
```

Import `ballReference` and `contactReference` from `src/reference/index` in both test files.

In `tests/engine/impact/landing.test.ts`, add the spec's 5 m/s landing on the fitted bed:

```ts
    it("leaves a vertical 5 m/s landing with no spin at e = 0.5 on the fitted bed", () => {
        const fitted: BedLaw = {
            modulus: contactReference.bedModulus.value,
            recovery: contactReference.bedRecovery.value,
            friction: 0.48,
            cell: BED_CELL,
        };
        const ball = { radius: ballReference.diameter.value / 2, mass: ballReference.mass.value };
        const l = land({ ...falling(vec3(0, 0, -5)), position: vec3(0.0007, 0.0011, ball.radius) }, ball, G, fitted);
        expect(Math.abs(l.state.velocity.z / 5 - 0.5)).toBeLessThan(5e-5);
    });
```

- [ ] **Step 5: Run every check**

Run: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`
Expected: all pass. Nothing in the engine reads the new fields yet, so no other figure moves.

- [ ] **Step 6: Commit**

```bash
git add scripts/turfFit.ts reference/contact.json src/reference/index.ts src/engine/types.ts src/engine/world.ts src/engine/impact/turfBed.ts tests docs/superpowers/probes/2026-10-09-p2b2b2b2a-turfFit.txt
git commit -F <temp>/msg-task6.txt
```

Add any script that Step 3's grep changed. Message: `Fit the turf bed to A4R and add it to the lawn`

- [ ] **Step 7: User gate — the low-speed figures (decision 11)**

Stop here and report to the user from `docs/superpowers/probes/2026-10-09-p2b2b2b2a-turfFit.txt`:

- the fitted k_w and τ_r, and the fit's check;
- e from 0.1 to 6 m/s beside Penner's golf fit;
- the bounce counts for drops of 0.05, 0.1 and 0.3 m;
- A2R and A3R's penetrations against 4.0 and 5.0 mm;
- the stability and grid lines.

Say plainly whether low-speed e runs well above about 0.6, and whether the counts pile up (spec §4.4).

If either does, set out the options the spec names, with a recommendation:

- a rate-independent floor;
- cells unloading stiffer than they load, with Penner's low-speed 0.51 as an analogue;
- any other the figures suggest.

Use the `AskUserQuestion` tool. Offer a chart of e(v) against Penner's if it helps.

Do not start Task 7 until the user has decided. If the user changes the bed's law, that change is a spec amendment
and a re-plan of Tasks 4–6 before going on.

---
### Task 7: The face in the impact

Spec §3 wired: §3.6's types, §5.1's face cases through the integrator, §5.2's re-baselining of the face. Decision 3.

**Files:**
- Modify: `src/engine/impact/types.ts` (`FaceMaterial`)
- Modify: `src/engine/impact/integrate.ts` (`ImpactSetup.face`, `ContactSample`, `PairState`, `lawOf`, `applyPair`,
  the open-pair resets)
- Modify: `src/engine/impact/simulateImpact.ts` (`prepareImpact`'s face, `validateImpact`)
- Modify: `src/engine/swing/buildContact.ts` (`WOOD`)
- Modify: `scripts/swingProbe.ts`, `scripts/impactProbe.ts` (their face constants; the probe's face sweep)
- Modify: `reference/mallet.json` (`faceRestitution`'s note), `reference/contact.json` (`faceBallContactTime`'s note)
- Modify: `tests/engine/support/impact.ts` (`TEST_FACE`, `faceLaw`, `impactEnergy`)
- Test: `tests/engine/impact/analytic.test.ts`, `tests/engine/impact/shadowEnergy.test.ts`, and every test that
  fails on the face's figures

**Interfaces:**
- Consumes: Task 3's law.
- Produces:
  - `interface FaceMaterial { readonly friction: number }`
  - `ImpactSetup.face: FaceLaw`
  - `ContactSample.storedEnergy: number`, and `ContactSample.closingSpeed?: number` (face pairs only)

- [ ] **Step 1: Change the types and the test support (RED)**

In `src/engine/impact/types.ts`:

```ts
/**
 * A face's Coulomb friction against a ball. Its restitution and contact duration are the wood fits (contact.json;
 * P2b.2b.2b.2a design §3.6), the only face with measured data: other faces are P3's.
 */
export interface FaceMaterial {
    readonly friction: number;
}
```

In `tests/engine/support/impact.ts`:

```ts
export const TEST_FACE: FaceMaterial = { friction: 0.4 };
```

```ts
/** The face law of a test head of mass `headMass` against a test ball, with TEST_FACE's friction (or `face`'s). */
export function faceLaw(face: FaceMaterial = TEST_FACE, headMass = TEST_HEAD.mass): FaceLaw {
    return { mass: (headMass * TEST_BALL.mass) / (headMass + TEST_BALL.mass), friction: face.friction };
}
```

`impactEnergy` reads the stored energy:

```ts
    for (const c of s.contacts) {
        e += c.storedEnergy + 0.5 * c.law.tangentialStiffness * lengthSq(c.spring);
    }
```

Update its doc: "… and the stored energy of each contact, as the integrator reports it (`storedEnergy`) …".

- [ ] **Step 2: Write the face's integrator cases (RED)**

In `tests/engine/impact/analytic.test.ts`, replace the face–ball case with:

```ts
    it.each([0.5, 2.19, 2.83, 4.0, 5.5, 6.0])(
        "face–ball at %s m/s: the free, undriven head strikes a free ball with Gugan's e and T (dt = 1e-7 s)",
        (U) => {
            const law = faceLaw({ friction: 0 });
            const start = {
                position: vec3(-R - 1e-5 - TEST_HEAD.length / 2, 0, 1),
                orientation: IDENTITY,
                velocity: vec3(U, 0, 0),
                angularVelocity: ZERO,
            };
            const probe = counter("face/blue");
            const run = integrate(isolated({ start, face: law, balls: [freeBall("blue", vec3(0, 0, 1))] }), {
                dt: FINE,
                cap: 4e-3,
                probe,
            });
            const T = faceContactTimeAt(U);
            expect(Math.abs(probe.closed * FINE - T) / T).toBeLessThan(LAW_TOLERANCE * 10);
            const e = ((run.balls.blue?.velocity.x as number) - run.head.velocity.x) / U;
            expect(Math.abs(e - faceRestitutionAt(U))).toBeLessThan(LAW_TOLERANCE);
        },
    );
```

Spec §5.1 asks for T within 0.3 %, which is `LAW_TOLERANCE * 10`. Restate `LAW_TOLERANCE`'s comment so that it covers
this case, from the figures of the run.

Add, in a new `describe("face closures", …)`:

```ts
    it("sets a re-touch's k and c from its own closing speed", () => {
        // The croquet scenario's face re-catches blue after blue meets red (P2b.2b.2b.1's re-catches).
        const probe = recorder();
        const scenario = SCENARIOS.find((s) => s.name === "croquet") as (typeof SCENARIOS)[number];
        const result = simulateImpact(scenario.contact, scenario.balls, testWorld(), { probe });
        const faces = probe.snapshots.flatMap((s) => s.contacts.filter((c) => c.key === "face/blue"));
        const speeds = [...new Set(faces.map((c) => c.closingSpeed))];
        expect((result.timeline["face/blue"] ?? []).length).toBe(speeds.length);
        for (const c of faces) {
            const closure = closeFace(faceLaw(), c.closingSpeed as number);
            expect(c.law.stiffness).toBe(1.5 * closure.stiffness * Math.sqrt(c.depth));
        }
    });
```

Here `faceLaw()` uses `TEST_HEAD`, which is the scenarios' head. If the scenario has only one face interval, pick
another scenario that re-touches. "push" re-touches by construction, since its drive pushes the head on into the
ball. Say which in the test's comment.

In `tests/engine/impact/shadowEnergy.test.ts`, delete the face case (decision 8) and add to the header: "The face is
Hertzian since P2b.2b.2b.2a: a nonlinear spring has no exact shadow energy under this scheme, so the face's energy is
checked by invariants.test.ts through `storedEnergy`."

- [ ] **Step 3: Run the impact tests to verify they fail**

Run: `npx vitest run tests/engine/impact`
Expected: FAIL. The face cases fail, and `storedEnergy` and `closingSpeed` are undefined.

- [ ] **Step 4: Wire the law into the integrator**

In `src/engine/impact/integrate.ts`:

- Import `carrySpring`, `closeFace`, `hertzEnergy`, `hertzForce`, `hertzTangent` and `type HertzClosure` from
  `./contactLaw`, and `type FaceLaw` from `./types`.
- Change `ImpactSetup.face` to `readonly face: FaceLaw;`, with the doc "The face's law: each closure's k and c follow
  from it (P2b.2b.2b.2a design §3.3)".
- Add to `ContactSample`:

```ts
    /** The pair's stored normal energy (J): ½·k·δ², the face's (2/5)·k·δ^{5/2}, or the bed's Σ ½·A·k_w·w². */
    readonly storedEnergy: number;
    /** A face–ball pair's closing speed at its closure (m/s), which set its k and c; absent for other pairs. */
    readonly closingSpeed?: number;
```

- Change `PairState`:

```ts
interface PairState {
    readonly pair: Pair;
    /** The pair's linear law; null for a face–ball pair, whose law follows from its closure. */
    readonly law: PairLaw | null;
    /** A face–ball pair's closure while it is closed (design §3.3); null while open, and for every other pair. */
    closure: HertzClosure | null;
    /** Elastic tangential displacement ξ; cleared whenever the pair is open. */
    spring: Vec3;
    /** The tangential stiffness ξ last carried (carrySpring); 0 while the pair is open. */
    tangent: number;
    peak: number;
    readonly line: PairTimeline;
    wakeAt: number;
    readonly regions: readonly PairTimeline[] | null;
}
```

- `lawOf` returns `null` for `"face-ball"`; its return type becomes `PairLaw | null`. The pair-list map initialises
  `closure: null, tangent: 0`.
- Where an open pair resets its spring (`p.spring = ZERO;` in the loop's open branch), also reset `p.closure = null;`
  and `p.tangent = 0;`.
- `applyPair` takes the face law (`face: FaceLaw`, after `p`), and computes the normal force and the law per kind:

```ts
    const along = dot(u, contact.normal);
    let law: PairLaw;
    let normal: number;
    let storedEnergy: number;
    if (pair.kind === "face-ball") {
        if (p.closure === null) {
            p.closure = closeFace(face, 0 - along);
        }
        law = hertzTangent(p.closure, contact.depth);
        normal = hertzForce(p.closure, contact.depth, 0 - along);
        storedEnergy = hertzEnergy(p.closure, contact.depth);
    } else {
        law = p.law as PairLaw;
        normal = normalForce(law, contact.depth, 0 - along);
        storedEnergy = 0.5 * law.stiffness * contact.depth * contact.depth;
    }
    const slip = sub(u, scale(contact.normal, along));
    // ξ carried over onto the current tangent plane (and held to its force if k_t grew), then advanced by the slip.
    const carried = carrySpring(p.spring, contact.normal, p.tangent, law.tangentialStiffness);
    const tangential = tangentialForce(law, add(carried, scale(slip, dt)), slip, normal);
    p.spring = tangential.spring;
    p.tangent = law.tangentialStiffness;
```

  The sample gains `law`, `storedEnergy`, and `...(p.closure === null ? {} : { closingSpeed: p.closure.speed })`.
  The call site passes `setup.face`.
- The file header's step 1 gains: "a face–ball pair closes with its own Hertzian law (contactLaw.ts closeFace;
  P2b.2b.2b.2a design §3.3)".

For the linear pairs, `carrySpring` with an unchanged stiffness is the old projection, operation for operation, so
ball–ball and ball–obstacle pairs compute exactly as before.

In `src/engine/impact/simulateImpact.ts`:

- `prepareImpact`: `face: { mass: faceMass, friction: contact.face.friction },`. Remove `lawFromContactTime`'s use for
  the face (it stays for ball–ball and obstacles).
- `validateImpact`: delete `positive(face.contactTime, …)` and `restitution(face.restitution, …)`. Its doc's
  "a non-positive … contact time" and "a restitution outside (0, 1] (face, …)" lose the face.

In `src/engine/swing/buildContact.ts`:

```ts
/** The engine's face: wood (reference/mallet.json); its restitution and contact time are contact.json's fits. */
const WOOD: FaceMaterial = { friction: malletReference.faceFriction.value };
```

Remove the now-unused `contactReference` import if nothing else there reads it.

In `scripts/swingProbe.ts` and `scripts/impactProbe.ts`, the face constants keep `friction` alone. In `impactProbe.ts`'s
`sweep`, delete the face contact-time rows and their bounds, and say in the section's header line that the face law
is Gugan's fits, not a swept time.

In `reference/mallet.json`, append to `faceRestitution`'s note: " Since P2b.2b.2b.2a a check, no longer read by the
engine: the face's restitution is contact.json's faceRestitutionFit (0.817 is the fit's value near 2.83 m/s)." In
`reference/contact.json`, append to `faceBallContactTime`'s note: " Since P2b.2b.2b.2a a check, no longer read by the
engine: the face's contact time is faceContactTimeFit (0.8 ms is the fit's value near 2.83 m/s)."

- [ ] **Step 5: Run the face's cases**

Run: `npx vitest run tests/engine/impact/analytic.test.ts tests/engine/impact/contactLaw.test.ts`
Expected: the new face cases PASS. The ball–turf cases still use the plane law and still pass.

- [ ] **Step 6: Re-baseline what the face moves**

Run: `npm test`

Expect failures in tests that pin the old linear face's figures:

- `followThrough`, `hands`, `headBall`, `headTurf`, `simulateImpact`, `timeline`, `integrate`, `invariants`, `fuzz`;
- `shot.test.ts` and the swing tests' outcomes;
- `faults.test.ts`'s whole-stroke sequences.

For each failure, in order:

1. Read the test's intent.
   - If it pins a figure of the old face (a contact time, a post-strike speed, an interval count, a ratio), re-record
     the figure with a comment, `// P2b.2b.2b.2a: Hertzian face (was <old>)`.
   - If its intent rests on the linear law's closed form, restate it against `faceRestitutionAt`/`faceContactTimeAt`,
     or move it to §5.1's cases.
2. A test whose intent changes (a fault no longer found, a flag no longer raised or newly raised, an end-to-end
   criterion broken) is not re-recorded. Trace it to the mechanism and write it down. If the spec does not predict
   it, stop and bring it to the user.
3. `fuzz.test.ts`'s bounds (penetration, energy) are re-measured, not loosened, unless the run shows the new law needs
   it. Record the old and new worst figures in the comment.

Run: `npx vitest run tests/engine/impact/invariants.test.ts`
Expected: PASS. It reads `storedEnergy` now. A rise in energy points to the spring carry or the energy formula, and
is a bug to fix, not a tolerance to raise.

- [ ] **Step 7: Run every check**

Run: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/engine/impact src/engine/swing/buildContact.ts scripts/swingProbe.ts scripts/impactProbe.ts reference/mallet.json reference/contact.json tests
git commit -F <temp>/msg-task7.txt
```

Message: `Strike the ball with the Hertzian face law in the impact`

---
### Task 8: The balls on the bed in the impact

Spec §4.6 wired, and §5.1's integration cases: the pit flag, the lift, the guard. Also §5.2's re-baselining of the
turf: the shadow and invariant tests, and the stance's sink. Decisions 1, 7 and 8; review focus 2.

**Files:**
- Modify: `src/engine/impact/types.ts` (the `impact-turf-pit` event)
- Modify: `src/engine/impact/integrate.ts`
- Modify: `src/engine/impact/contacts.ts` (`turfContact` removed; `pairContact`'s turf case)
- Modify: `src/engine/impact/simulateImpact.ts` (`staticSink` removed; the bed's sink, law and validation)
- Modify: `src/engine/impact/handover.ts` (header)
- Modify: `src/engine/swing/buildContact.ts` (`contactPose`'s sink)
- Modify: `reference/contact.json` (`ballTurfStiffness`'s note), `reference/friction.json` (`ballTurfSliding`'s note)
- Modify: `scripts/impactProbe.ts` (the turf sweep), `scripts/impactDigest.ts` (if it prints the old turf law)
- Modify: `tests/engine/support/impact.ts` (`freeBall`), `tests/engine/support/shot.ts` (`CANONICAL_CLEARANCE`, if
  defined there)
- Test: `tests/engine/impact/*.test.ts`, `tests/engine/swing/buildContact.test.ts`, and every test that fails on the
  turf's figures

**Interfaces:**
- Consumes: the bed (Tasks 4, 6).
- Produces:
  - `ImpactBall.turf: BedLaw | null`
  - `const TURF_PIT_DEPTH = 1e-3` (`integrate.ts`)
  - `ImpactEvent` `{ kind: "impact-turf-pit"; t: number; ball: BallId }`

- [ ] **Step 1: Write the failing integration cases**

In `tests/engine/support/impact.ts`, `freeBall`'s last parameter becomes `turf: BedLaw | null = null`. Add:

```ts
/** A plausible test bed (fixtures' TEST_TURF): k_w 3e8 N/m³, τ_r 2 ms, µ `friction`, 2 mm cells. */
export function testBed(friction = 0.3): BedLaw {
    return { modulus: TEST_TURF.bedModulus, recovery: TEST_TURF.bedRecovery, friction, cell: BED_CELL };
}
```

Append to `tests/engine/impact/integrate.test.ts`. Import `testBed`, `TURF_PIT_DEPTH`, `staticSink`, `simulateImpact`,
`testWorld` and `ballAt`:

```ts
describe("the bed in the impact", () => {
    it("raises turf-lift once, when a ball rising out of the bed lets go of its last cell", () => {
        const run = integrate(
            isolated({ gravity: STANDARD_GRAVITY, balls: [freeBall("blue", vec3(0, 0, R), vec3(0, 0, -3), testBed())] }),
            { cap: 20e-3 },
        );
        const lifts = run.events.filter((e) => e.kind === "turf-lift");
        expect(lifts).toHaveLength(1);
        expect(run.balls.blue?.velocity.z as number).toBeGreaterThan(0);
    });

    it("flags impact-turf-pit for a ball ending pressed more than 1 mm into the bed, and not otherwise", () => {
        // Driven down at 3 m/s and cut off by the cap 2 ms in, the ball is still deep in its pit; at rest at its
        // sink (about 0.3 mm) it is not.
        const deep = integrate(
            isolated({ gravity: STANDARD_GRAVITY, balls: [freeBall("blue", vec3(0, 0, R), vec3(0, 0, -3), testBed())] }),
            { cap: 2e-3 },
        );
        expect(deep.events.some((e) => e.kind === "impact-turf-pit")).toBe(true);
        const sink = staticSink(0, 0, R, TEST_BALL.mass * STANDARD_GRAVITY, testBed());
        const resting = integrate(
            isolated({ gravity: STANDARD_GRAVITY, balls: [freeBall("blue", vec3(0, 0, R - sink), ZERO, testBed())] }),
            { cap: 2e-3 },
        );
        expect(resting.events.some((e) => e.kind === "impact-turf-pit")).toBe(false);
        expect(TURF_PIT_DEPTH).toBe(1e-3);
    });

    it("throws a RangeError when two balls holding cells come within a cell of each other's footprint", () => {
        // Two balls pressed 7 mm in (footprints about 25 mm) with centres 40 mm apart overlap the guard's reach.
        const balls = [
            freeBall("blue", vec3(0, 0, R - 7e-3), ZERO, testBed()),
            freeBall("red", vec3(0.04, 0, R - 7e-3), ZERO, testBed()),
        ];
        expect(() => integrate(isolated({ gravity: STANDARD_GRAVITY, balls }), { cap: 1e-4 })).toThrow(RangeError);
    });

    it("starts two touching balls on the bed with no guard (review focus 2)", () => {
        const world = testWorld();
        const result = simulateImpact(strike(ballAt(5, 0).position, { speed: 3 }), {
            blue: ballAt(5, 0),
            red: ballAt(5 + 2 * R, 0),
        }, world);
        expect(result.handover.red?.velocity.x as number).toBeGreaterThan(0);
    });
});
```

In `tests/engine/impact/shadowEnergy.test.ts`, replace the turf case with a bed with zero recovery (decision 8):

```ts
    it("is conserved to rounding through a bounce on an undamped bed, with gravity", () => {
        // τ_r = 0 makes every cell an undamped linear spring in z for vertical motion, w = δ − d_c, engaging at its
        // own depth d_c and pushing straight up on a ball that moves only vertically over a cell centre's symmetric
        // point; the shadow energy sums the cells as the linear springs above, each with its own onset and release.
        const law: BedLaw = { modulus: 3e8, recovery: 0, friction: 0, cell: BED_CELL };
        const setup = isolated({
            gravity: STANDARD_GRAVITY,
            balls: [freeBall("blue", vec3(0, 0, R + 1e-3), vec3(0, 0, -2), law)],
        });
        const engage = freshBed(0, 0, R, law).engage;
        const k = law.cell * law.cell * law.modulus;
        const springs: Spring[] = engage.map((d) => ({
            law: { ...lawFromStiffness(M, 1, k, 0), stiffness: k },
            depth: (s: RunState): number => R - (s.balls[0] as BallState).position.z - d,
        }));
        const { drift, jumps } = shadowDrift(setup, springs, 20e-3);
        expect(drift).toBeLessThan(SHADOW_TOLERANCE);
        expect(jumps).toBeGreaterThan(JUMP_MARGIN * SHADOW_TOLERANCE);
    });
```

Each cell's dynamic depth −z_b = √(R² − r²) − z differs from R − z − d_c by rounding only. If the drift exceeds
`SHADOW_TOLERANCE` by rounding alone, compute the spring's depth exactly as `turfBed.ts`'s `column` does
(`Math.sqrt(R*R - r2) - z`, with that column's r²), and say so in the comment.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/engine/impact/integrate.test.ts tests/engine/impact/shadowEnergy.test.ts`
Expected: FAIL. `TURF_PIT_DEPTH` is undefined, and the bed is not yet the turf pair.

- [ ] **Step 3: Wire the bed into the integrator**

In `src/engine/impact/types.ts`, add to `ImpactEvent` and its doc:

```ts
 * - `impact-turf-pit`: when the impact ended, a ball's surface lay more than TURF_PIT_DEPTH below the turf over a
 *   cell it held (P2b.2b.2b.2a design §4.6); the handover places it on the flat lawn, and the pit is discarded.
```

```ts
    | { readonly kind: "impact-turf-pit"; readonly t: number; readonly ball: BallId }
```

Also rewrite `turf-lift`'s description: "a ball that held cells of the bed first held none while rising".

In `src/engine/impact/integrate.ts`:

1. **Header.** Rewrite the turf sentences:

   > The balls stand on the turf bed (turfBed.ts; P2b.2b.2b.2a design §4): each ball–turf pair is its ball's own
   > cells, stepped with the pair, and a ball is in the turf while it holds a cell. The impact ends once a face–ball
   > contact has closed, the drive window has closed, no face–ball, ball–ball, ball–obstacle or head–turf contact has
   > been closed for RELEASE_STEPS steps, and no ball in the turf is still bouncing (turfBed.ts isBouncing: its
   > vertical energy measured from rest at the surface on a fresh bed is positive), or at the cap. At the end a ball
   > still pressed more than TURF_PIT_DEPTH into its pit raises `impact-turf-pit`. Two balls whose footprints come
   > within a cell of each other while both hold cells throw a RangeError (plan decision 1).

2. **Imports.** Add `bedEnergy`, `bedLoad`, `bedRelax`, `freshBed`, `heldDepth`, `isBouncing`, `newBallBed`,
   `type BallBed` and `type FreshBed` from `./turfBed`, and `type BedLaw` from `./types`.

3. **Constant.**

   ```ts
   /**
    * Depth (m) of a held cell past which an impact's end raises `impact-turf-pit` (P2b.2b.2b.2a design §4.6). A
    * modelling bound, not physical: the handover discards a pit, and one deeper than this is a result to look at.
    */
   export const TURF_PIT_DEPTH = 1e-3;
   ```

4. **`ImpactBall.turf: BedLaw | null`**, with the doc "its turf bed's law (null: no turf under it, for isolated test
   cases)".

5. **`lawOf`** returns `null` for `"ball-turf"`. Delete the old `isBouncing`.

6. **Beds.** In `integrateStroke`, after `travel`:

   ```ts
   const beds: (BallBed | null)[] = setup.balls.map((b) => (b.turf === null ? null : newBallBed(b.turf, dt)));
   const fresh: (FreshBed | null)[] = setup.balls.map((b) =>
       b.turf === null ? null : freshBed(b.state.position.x, b.state.position.y, R, b.turf),
   );
   ```

   `TurfTrack.inTurf` starts all `false`. The first step's load sets it.

7. **The pair loop's turf branch.** First in the loop body, before `hit`:

   ```ts
            if (pair.kind === "ball-turf") {
                const sb = balls[pair.b] as BallState;
                const bed = beds[pair.b] as BallBed;
                const load = bedLoad(bed, sb, R, dt);
                if (load === null) {
                    recordStep(p.line, false, 0, t);
                    continue;
                }
                p.peak = Math.max(p.peak, R - sb.position.z);
                loads.forces[pair.b] = add(loads.forces[pair.b] as Vec3, load.force);
                loads.torques[pair.b] = add(loads.torques[pair.b] as Vec3, load.torque);
                if (options.probe) {
                    samples.push({
                        key: pair.key,
                        normal: load.normal,
                        depth: R - sb.position.z,
                        normalForce: load.normalForce,
                        tangentialForce: load.tangentialForce,
                        spring: load.spring,
                        law: load.law,
                        storedEnergy: bedEnergy(bed),
                    });
                }
                recordStep(p.line, true, load.normalForce, t);
                continue;
            }
   ```

8. **The guard.** After the head–turf pair and before `advance`:

   ```ts
        guardFootprints(balls, beds, R, ids);
   ```

   ```ts
   /**
    * Throws a RangeError when two balls both hold cells and their footprints come within a cell of each other (plan
    * decision 1, amending design §4.1): centres closer horizontally than ρ_a + ρ_b + h, ρ = √(R² − z²) each ball's
    * footprint radius. A ball's cells are its own, so footprints that could reach one column are outside the model;
    * two balls touching at rest are far clear of it.
    */
   function guardFootprints(
       balls: readonly BallState[],
       beds: readonly (BallBed | null)[],
       radius: number,
       ids: readonly BallId[],
   ): void {
       for (let a = 0; a < beds.length; a++) {
           const ba = beds[a];
           if (ba === null || ba === undefined || ba.held === 0) {
               continue;
           }
           for (let b = a + 1; b < beds.length; b++) {
               const bb = beds[b];
               if (bb === null || bb === undefined || bb.held === 0) {
                   continue;
               }
               const pa = (balls[a] as BallState).position;
               const pb = (balls[b] as BallState).position;
               const reach =
                   Math.sqrt(Math.max(0, radius * radius - pa.z * pa.z)) +
                   Math.sqrt(Math.max(0, radius * radius - pb.z * pb.z)) +
                   Math.max(ba.law.cell, bb.law.cell);
               if (length(horizontal(sub(pa, pb))) < reach) {
                   throw new RangeError(`balls ${ids[a]} and ${ids[b]} press the turf within a cell of each other`);
               }
           }
       }
   }
   ```

9. **After `advance`:** `for (const bed of beds) { if (bed !== null) { bedRelax(bed); } }`.

10. **`trackTurf`** takes `beds` and `fresh`:

    ```ts
    function trackTurf(
        balls: readonly BallState[],
        setup: ImpactSetup,
        beds: readonly (BallBed | null)[],
        fresh: readonly (FreshBed | null)[],
        track: TurfTrack,
        now: number,
        events: ImpactEvent[],
    ): boolean {
        const R = setup.ball.radius;
        let turfMoving = false;
        for (let i = 0; i < balls.length; i++) {
            const bed = beds[i];
            if (bed === null || bed === undefined) {
                continue;
            }
            const s = balls[i] as BallState;
            const holding = bed.held > 0;
            if (track.inTurf[i] && !holding && s.velocity.z > 0 && !track.lifted[i]) {
                track.lifted[i] = true;
                events.push({ kind: "turf-lift", t: now, ball: (setup.balls[i] as ImpactBall).id });
            }
            track.inTurf[i] = holding;
            const base = fresh[i] as FreshBed;
            if (holding && isBouncing(base, setup.ball.mass, setup.gravity, s.velocity.z, R - s.position.z)) {
                turfMoving = true;
            }
        }
        return turfMoving;
    }
    ```

11. **The pit flag.** After the loop, before `finish`:

    ```ts
        beds.forEach((bed, i) => {
            if (bed !== null && heldDepth(bed) > TURF_PIT_DEPTH) {
                events.push({ kind: "impact-turf-pit", t: steps * dt, ball: ids[i] as BallId });
            }
        });
    ```

In `src/engine/impact/contacts.ts`:

- Delete `turfContact`.
- `pairContact`'s `"ball-turf"` case throws `new Error("the ball–turf pair is the bed's (turfBed.ts bedLoad)")`. The
  integrator handles the pair before calling it.
- In the header, "or the turf on a ball" becomes "(the ball–turf pair is the bed's, turfBed.ts)".

Remove `UP` if nothing else there uses it.

In `src/engine/impact/simulateImpact.ts`:

- Delete `staticSink`. Import `bedLawOf` and `staticSink` from `./turfBed`.
- `prepareImpact`, per ball:

  ```ts
        const law = bedLawOf(surface);
        const sink = staticSink(s.position.x, s.position.y, ball.radius, ball.mass * gravity, law);
        let position = vec3(s.position.x, s.position.y, s.position.z - sink);
  ```

  and `turf: law` in the entry.
- `validateImpact`, per ball: replace the `turfStiffness` and `turfRestitution` checks with:

  ```ts
        positive(surface.bedModulus, `bedModulus at ball ${id}`);
        positive(surface.bedRecovery, `bedRecovery at ball ${id}`);
  ```

  `sunk` becomes `R - staticSink(p.x, p.y, R, world.ball.mass * world.gravity, bedLawOf(surface))`. Keep the checks
  under the head.
- The header and the docs of `validateImpact` and `prepareImpact`: "its static turf sink m·g/k_turf" becomes "its
  static sink on the bed (turfBed.ts staticSink, at its own position)". The validation list names the bed's two
  fields.

In `src/engine/impact/handover.ts`, the header's "The stored energy of its residual sink, m·g·δ₀/2, is discarded"
becomes "The bed's stored energy at its residual sink, U_f(δ₀), is discarded with the bed (P2b.2b.2b.2a design
§4.6)".

In `src/engine/swing/buildContact.ts`, `contactPose`:

```ts
    const sunk =
        R - staticSink(striker.position.x, striker.position.y, R, world.ball.mass * world.gravity, bedLawOf(surface));
```

In `reference/contact.json`, append to `ballTurfStiffness`'s note: " Since P2b.2b.2b.2a it feeds the head–turf plane
law alone; the balls stand on the bed (bedModulus, bedRecovery)." In `reference/friction.json`, append to
`ballTurfSliding`'s note: " Since P2b.2b.2b.2a Gugan's impulsive µ ≈ 1.0 (Gugan 4 Table 4(b)) is a held-out check,
not an input: it attributes all the ball's horizontal slowing in its pit to friction on flat ground, and the bed's
ramp supplies part of it (P2b.2b.2b.2a design §4.3, §4.5)."

In `scripts/impactProbe.ts`, `withTurf` becomes `withBed(modulus, recovery)`. The sweep's turf rows run the fitted
values ×½ and ×2 each, labelled "bed modulus" and "bed recovery". The bed has no bounds to sweep.

- [ ] **Step 4: Run the integration cases**

Run: `npx vitest run tests/engine/impact/integrate.test.ts tests/engine/impact/shadowEnergy.test.ts tests/engine/impact/turfBed.test.ts`
Expected: PASS.

- [ ] **Step 5: Re-baseline what the bed moves**

Run: `npm test`

Follow Task 7 Step 6's procedure. Expect, in particular:

- `analytic.test.ts`'s ball–turf cases and "a ball dropped on the turf": the plane law's closed form no longer applies.
  - The drop moves to the bed, as a lift and a rebound below the impact speed.
  - The plane's per-e cases are deleted. Their intent (contact time and rebound) now lives in `turfBed.test.ts`'s
    fitted cases and `landing.test.ts`.
- `integrate.test.ts`'s "stays open while a struck ball is still bouncing out of its hollow": re-stated on the bed, as
  the impact still open while `isBouncing` holds.
- `handover.test.ts`: unchanged in behaviour. Its figures move only if a test reads the sink.
- `buildContact.test.ts`'s `CANONICAL_APPROACH`, and `CANONICAL_CLEARANCE` wherever the support defines it (`grep -rn
  "CANONICAL_CLEARANCE" tests`):
  - re-recorded by about 0.26 mm in contact height (spec §4.6);
  - each figure's comment gives its new analytic expression, with the bed's sink in place of m·g/k_turf;
  - the stance's analytic cases (the round trip, the upright shaft) must not move.
- `invariants.test.ts`: must pass as it stands. It reads the bed through `storedEnergy`, its momentum check through
  the `turf/` samples' normal force and friction, and its mirror check through the bed's pair order. A failure is a
  bug.
- The rolls' outcomes in `shot.test.ts`:
  - re-recorded where they pin figures;
  - exit criterion 3's test (`runs the %s canonical setup from the top to its finish`) must pass unchanged.

- [ ] **Step 6: Run every check**

Run: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`
Expected: all pass.

Run: `env SLOW_TESTS=1 npx vitest run tests/engine/impact/fuzz.test.ts`
Expected: PASS. A new fuzz bound is re-measured with its old and new worst figures in its comment.

- [ ] **Step 7: Commit**

```bash
git add src/engine reference scripts/impactProbe.ts scripts/impactDigest.ts tests
git commit -F <temp>/msg-task8.txt
```

Message: `Stand the balls on the turf bed in the impact`

---
### Task 9: Landings on the bed in phase 2

Spec §4.7 wired, and §5.2's re-baselining of P2a.1's landing cases and the brute-force cross-check. Decisions 7, 9 and
10; review focus 5. Exit criterion 2's phase-2 gate.

**Files:**
- Modify: `src/engine/simulate.ts` (the landing case, `SimulationOptions.landings`, `LandingRecord`)
- Modify: `src/engine/types.ts` (`ShotEvent` `landing-cap`), `src/engine/index.ts` (export `LandingRecord` if the
  public types list `SimulationOptions`; check with `grep -n "SimulationOptions" src/engine/index.ts`)
- Modify: `src/engine/resolve.ts` (`resolveLanding` deleted, `TurfAt`), `src/engine/world.ts` (`turfAt`)
- Modify: `tests/engine/support/bruteForce.ts`
- Modify: `scripts/shotMix.ts` (decision 12; the landing figures)
- Modify: `reference/friction.json` (`ballTurfRestitution`'s note)
- Test: `tests/engine/resolve.test.ts`, `tests/engine/lift.test.ts`, `tests/engine/crossCheck.test.ts`,
  `tests/engine/simulate.test.ts`, and any other phase-2 test that fails on a landing

**Interfaces:**
- Consumes: `land`, `LANDING_CAP` (Task 5); `bedLawOf` (Task 6).
- Produces:
  - `ShotEvent` `{ kind: "landing-cap"; t: number; ball: BallId }`
  - `type TurfAt = (position: Vec3) => number` (`resolve.ts`): the sliding friction
  - `function turfAt(world: World, position: Vec3): number` (`world.ts`)
  - `interface LandingRecord { readonly t: number; readonly ball: BallId; readonly before: BallState;
    readonly landing: Landing }` and `SimulationOptions.landings?: (record: LandingRecord) => void` (`simulate.ts`)

- [ ] **Step 1: Write the failing tests**

In `tests/engine/lift.test.ts`, restate "lands where and when the ballistic closed form says, and rebounds with the
turf's restitution":

- The landing time and point stay the closed form's.
- The state after it equals `land(touchdown, world.ball, world.gravity, bedLawOf(surface)).state` exactly.
- Its e lies below 1 and above 0.

Restate "bounces with geometrically shrinking hops and settles": each hop rises lower than the one before, the ball
settles, and the landing count is recorded in the comment from the run. Add:

```ts
    it("settles a 1 mm drop in a few landings, with no landing-cap (review focus 5)", () => {
        const world = testWorld();
        const result = simulateFreeMotion(
            { blue: { position: vec3(5, 5, R + 1e-3), velocity: ZERO, angularVelocity: ZERO } },
            world,
        );
        const landings = result.events.filter((e) => e.kind === "landing").length;
        expect(landings).toBeGreaterThan(0);
        // Recorded from the run; each landing's e < 1 bounds it, and the settle rule ends it.
        expect(landings).toBeLessThan(20);
        expect(result.events.some((e) => e.kind === "landing-cap")).toBe(false);
        expect(result.aborted).toBe(false);
    });

    it("raises landing-cap when a landing is forced past its cap", () => {
        // A bed recovering so slowly and so soft that a 3 m/s landing cannot leave or settle in 50 ms.
        const soft = uniformLawn(30, 40, {
            slidingFriction: 0.3,
            rollingResistance: 0.05,
            ...TEST_TURF,
            bedModulus: 1e5,
            bedRecovery: 10,
        });
        const result = simulateFreeMotion(
            { blue: { position: vec3(5, 5, R + 0.5), velocity: vec3(0, 0, -2), angularVelocity: ZERO } },
            testWorld({ lawn: soft }),
        );
        expect(result.events.some((e) => e.kind === "landing-cap")).toBe(true);
    });

    it("reports every landing to the probe, with the ball before it and the landing's figures", () => {
        const records: LandingRecord[] = [];
        const result = simulateFreeMotion(
            { blue: { position: vec3(5, 5, R + 0.05), velocity: vec3(1, 0, 0), angularVelocity: ZERO } },
            testWorld(),
            undefined,
            { landings: (r) => records.push(r) },
        );
        expect(records).toHaveLength(result.events.filter((e) => e.kind === "landing").length);
        expect(records[0]?.before.velocity.z as number).toBeLessThan(0);
        expect(records[0]?.landing.duration as number).toBeGreaterThan(0);
    });
```

The `landing-cap` case's lawn is chosen so that the bed cannot carry the ball within 50 ms. If its parameters do not
cap, run the landing alone with `land` to find a law that does. Explain the choice in the comment.

In `tests/engine/resolve.test.ts`:

- Delete `describe("resolveLanding", …)`. Its intents now live in `landing.test.ts`: the rebound, the slip moving
  towards rolling, the settle threshold, and "never gains energy".
- The helpers `TURF`, `SLICK` and `TURF_MATERIAL` become friction numbers. Find their call sites with
  `grep -n "TURF\|SLICK" tests/engine/resolve.test.ts`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/engine/lift.test.ts tests/engine/resolve.test.ts`
Expected: FAIL. `landing-cap` is not raised, `landings` is not called, and the type errors show in `npm run check`.

- [ ] **Step 3: Implement**

In `src/engine/types.ts`, add to `ShotEvent`:

```ts
    | {
          /**
           * A landing that had neither left the turf nor settled after LANDING_CAP was settled (P2b.2b.2b.2a design
           * §4.7): outside the validated model, as the jump flag is.
           */
          readonly kind: "landing-cap";
          readonly t: number;
          readonly ball: BallId;
      }
```

In `src/engine/resolve.ts`:

- Delete `resolveLanding`, and the header's "and a ball landing on the turf".
- `TurfAt`: `export type TurfAt = (position: Vec3) => number;`, with the doc "The turf's sliding friction at a
  position".
- `turfFriction(s, load, ball, friction: number)` uses `friction` for `turf.friction`. Its two callers pass
  `turfAt(...)`.

In `src/engine/world.ts`:

```ts
/** Returns the turf's sliding friction at `position`, for impulses on a ball there. */
export function turfAt(world: World, position: Vec3): number {
    return world.lawn.surfaceAt(position).slidingFriction;
}
```

In `src/engine/simulate.ts`:

- Import `land` and `type Landing` from `./impact/landing`, and `bedLawOf` from `./impact/turfBed`. Drop
  `resolveLanding` from the `./resolve` import.
- Add to the header's flight paragraph: "A ball in flight … until it lands (on the turf bed, impact/landing.ts;
  P2b.2b.2b.2a design §4.7) or strikes something".
- Add:

```ts
/** One landing as the probe sees it (P2b.2b.2b.2a design §6): when, which ball, its state at touchdown, the landing. */
export interface LandingRecord {
    readonly t: number;
    readonly ball: BallId;
    readonly before: BallState;
    readonly landing: Landing;
}
```

- `SimulationOptions` gains `readonly landings?: (record: LandingRecord) => void;`, with the doc "Called after every
  landing (scripts/shotMix.ts records them)".
- `Simulation` gains `readonly landings: ((record: LandingRecord) => void) | null;`, set from `options.landings ??
  null`.
- The landing case:

```ts
            case "landing": {
                const { track } = next;
                const group = groupOf(sim, [track]);
                const previous = couplingsOf(sim, group);
                const s = stateAt(track, now);
                release(sim, group, now);
                const R = world.ball.radius;
                const touchdown = { ...s, position: vec3(s.position.x, s.position.y, R) };
                const law = bedLawOf(world.lawn.surfaceAt(touchdown.position));
                const landing = land(touchdown, world.ball, world.gravity, law);
                reopen(sim, track, track.id, landing.state, now);
                sim.events.push({ kind: "landing", t: now, ball: track.id });
                if (landing.outcome === "capped") {
                    sim.events.push({ kind: "landing-cap", t: now, ball: track.id });
                }
                sim.landings?.({ t: now, ball: track.id, before: touchdown, landing });
                if (previous.length > 0) {
                    settle(sim, group, now, previous);
                }
                break;
            }
```

If `index.ts` exports `SimulationOptions`, export `LandingRecord` beside it.

In `tests/engine/support/bruteForce.ts`, the landing calls `land(touchdown, world.ball, world.gravity,
bedLawOf(world.lawn.surfaceAt(touchdown.position))).state`. Its header now says it shares the engine's landing
(`impact/landing.ts`). `BARE_TURF` becomes `(): number => 0`.

In `reference/friction.json`, append to `ballTurfRestitution`'s note: " Since P2b.2b.2b.2a phase 2's landings meet the
turf bed (contact.json bedModulus, bedRecovery), whose e falls with speed; this constant feeds the head–turf plane law
alone."

In `scripts/shotMix.ts` (decision 12):

- The world takes the default lawn's bed:

```ts
const SURFACE = testWorld().lawn.surfaceAt(vec3(0, 0, 0));
const WORLD: World = testWorld({
    hoops: HOOPS,
    lawn: uniformLawn(30, 40, {
        ...SURFACE,
        bedModulus: contactReference.bedModulus.value,
        bedRecovery: contactReference.bedRecovery.value,
    }),
});
```

- The timed run passes `landings: (r) => …`. It collects each landing's duration, travel, steps and visits, and its
  spin before and after (`|ω|` of `r.before` and `r.landing.state`).
- Each `Shot` gains `landingSteps` and `landingVisits`, the sums over its landings.
- Print:
  - the percentiles of the landings' duration (ms) and travel (mm);
  - the share of landings whose |ω| fell;
  - the median ratio of |ω| after to before;
  - `row("landing steps per shot", …)` and `row("landing column visits per shot", …)`;
  - the `landing-cap` count.

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run tests/engine/lift.test.ts tests/engine/resolve.test.ts tests/engine/impact/landing.test.ts`
Expected: PASS.

- [ ] **Step 5: Re-baseline what the landings move, and check exit criterion 2**

Run: `npm test`

Follow Task 7 Step 6's procedure. Tests with a landing move, and are restated for the bed:

- P2a.1's landing, bouncing-settle and hopping cases;
- `crossCheck.test.ts`'s hopping scenarios.

The brute force now shares the landing, so the 1 mm agreement must hold. A test with no landing must not move: if one
does, it is a bug.

Run: `npx --yes tsx <temp>/scripts/phase2Digest.mts > <temp>/after/phase2Digest.txt`
Run: `npx --yes tsx <temp>/scripts/compareDigest.mts <temp>/baseline/phase2Digest.txt <temp>/after/phase2Digest.txt`
Expected: `moved 0`. Every shot with no landing is bit-identical (exit criterion 2). Record the counts for Task 11.

Run: `env SLOW_TESTS=1 npx vitest run tests/engine/crossCheck.test.ts tests/engine/push.test.ts`
Expected: PASS.

- [ ] **Step 6: Run every check**

Run: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/engine reference/friction.json scripts/shotMix.ts tests
git commit -F <temp>/msg-task9.txt
```

Message: `Land phase 2's balls on the turf bed`

---
### Task 10: The version and the gates

Spec exit criteria 3 and 5.

**Files:**
- Modify: `src/engine/simulate.ts` (`ENGINE_VERSION`)
- Test: `tests/engine/index.test.ts`, `tests/engine/impact/simulateImpact.test.ts` (wherever `"0.8.0"` appears; `grep
  -rn "0\.8\.0" tests src`)

- [ ] **Step 1: Write the failing tests**

Change every `"0.8.0"` the grep finds in `tests/` to `"0.9.0"`.

Run: `npx vitest run tests/engine/index.test.ts tests/engine/impact/simulateImpact.test.ts`
Expected: FAIL on the version.

- [ ] **Step 2: Implement**

In `src/engine/simulate.ts`: `export const ENGINE_VERSION = "0.9.0";`

- [ ] **Step 3: Run the gates**

Run: `npm test`
Expected: PASS, including `shot.test.ts`'s exit criterion 3 on every stroke type: no `follow-cap`, no entry jump,
continuity at every seam.

Run: `env SLOW_TESTS=1 npm test`
Expected: PASS.

Exit criterion 3's "no ball centre more than 5 mm above R" and "no `RangeError`" are read off Task 11's `strokeProbe`
canonical run. Note any breach for Task 11 Step 3. A breach is a stop: report it to the user before committing Task 11.

- [ ] **Step 4: Run every check**

Run: `npm run lint`, `npm run check`, `npm run format:check`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/engine/simulate.ts tests
git commit -F <temp>/msg-task10.txt
```

Message: `Bump the engine to 0.9.0 for the strike and turf laws`

---
### Task 11: The probe, the outcomes and the documents

Spec §6, §7 and §8, exit criterion 4, and this plan's decisions.

**Files:**
- Modify: `scripts/strokeProbe.ts` (new sections `pit` and `asPlayed`)
- Create: `docs/superpowers/probes/2026-10-09-p2b2b2b2a-strokeProbe.txt`, `…-swingProbe.txt`, `…-shotMix.txt`,
  `…-impactDigest.txt`
- Modify: `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`
- Modify: `docs/superpowers/specs/2026-10-09-p2b2b2b2a-strike-turf-laws-design.md` (an amendment note)

- [ ] **Step 1: Add the held-out and roll-as-played sections to the stroke probe**

In `scripts/strokeProbe.ts`, add two sections to `SECTIONS`. Each uses `simulateStroke` with `recorder()` on the
canonical roll setups, as `fat` already uses `simulateImpact` with a probe.

- **`pit`.** For each roll's canonical setup at 2 and 3 m/s, over the striker's `turf/<id>` samples while it holds
  cells:
  - the apparent friction, Σ|horizontal turf force|·dt over Σ vertical turf force·dt, against Gugan's µ ≈ 1.0 (§4.5);
  - the distance the striker's centre travels from its first sample with a held cell to its deepest point, against
    Gugan's 3.5–18 mm;
  - the deepest δ.

  Also the rolling ball's loss over 50 mm on a fresh bed: `land` cannot do this, so integrate a ball as the
  `turfBed.test.ts` helper does. Start it rolling at 2 m/s at its sink, and print its speed after 50 mm of travel
  against 2 m/s.
- **`asPlayed`.** The full roll at 2 m/s (canonical, `up` as canonical), from the samples:
  - the pitch at contact and its extremes through the contact window (the head's orientation about the pitch axis,
    as `fat` reads the lean);
  - the head's distance behind the striker's ball along aim over the contact, from the face to the ball's surface;
  - the hands' force at the end of their reach (`hand.force` near `arc.contactAt + handReach / v`), and the striker's
    ball's speed lost while the face is on it after that.

  These are the baseline for P2b.2b.2b.2b, against the roadmap's "The model's roll against the roll as played".

Keep each section's printing in the style of `canonical`. No figure is asserted.

- [ ] **Step 2: Run the probes and keep the output**

Run each in the background, then wait for all four:

Run: `npx --yes tsx scripts/strokeProbe.ts > docs/superpowers/probes/2026-10-09-p2b2b2b2a-strokeProbe.txt`
Run: `npx --yes tsx scripts/swingProbe.ts > docs/superpowers/probes/2026-10-09-p2b2b2b2a-swingProbe.txt`
Run: `npx --yes tsx scripts/shotMix.ts > docs/superpowers/probes/2026-10-09-p2b2b2b2a-shotMix.txt`
Run: `npx --yes tsx scripts/impactDigest.ts > <temp>/after/impactDigest.txt`

The impact digest is large. Run `shasum -a 256` and `grep -c ""` on both `<temp>/baseline/impactDigest.txt` and
`<temp>/after/impactDigest.txt`. Write the two digests, the two line counts and the first 40 lines of the "after" file
to `docs/superpowers/probes/2026-10-09-p2b2b2b2a-impactDigest.txt`, with a heading line naming the runs. Every case
moves (spec §5.2), and the digests must differ.

- [ ] **Step 3: Compare with the baseline**

Against `docs/superpowers/probes/2026-10-08-p2b2b2b1-*.txt` and `<temp>/baseline/shotMix.txt`, collect for the roadmap:

- each preset's ratios at 2, 2.5, 3, 3.5 and 4 m/s, and its face intervals (the re-catches);
- the rolls' canonical runs: clearance, impact and finish times, the highest ball centre, braking hands,
  `impact-off-face`, entry jumps, the late re-hit's crossings;
- exit criterion 3, as Task 10 Step 3 noted:
  - every canonical run with no ball centre above R + 5 mm and no `RangeError`;
  - a breach stops here for the user;
- the `presets` sweep's cap and flag tallies, `impact-turf-pit` among them;
- the shot mix:
  - work units against P2b.2b.2b.1's (p99 143,084, p99.9 362,050, max 408,030);
  - the landings' steps and visits;
  - landings per shot before and after;
  - `landing-cap`;
  - the landings' durations and travel;
  - the spin before and after, against the user's observation that a bounce reduces spin;
- the held-out checks from `turfFit.txt` and the `pit` section;
- the full roll at 2 m/s against the roll as played.

A figure the spec does not predict, and that changes a judgement (a new fault, a new cap, a lost finish), goes to the
user before the documents are written.

- [ ] **Step 4: Update the roadmap (spec §8)**

In `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`:

- **The P2 row.** Replace the **P2b.2b.2b.2** sentence with three:
  - **P2b.2b.2b.2a** (`specs/2026-10-09-p2b2b2b2a-strike-turf-laws-design.md`): the strike and turf laws, a Hertzian
    face–ball law with Gugan's e(U) and T(U), and a recovering turf bed under the balls and their landings.
  - **P2b.2b.2b.2b:** the roll's stroke (the descent through contact and the hands, to the roll as played).
  - **P2b.2b.2b.2c:** the mallet (the square head, end-weighting, the market's dimensions).

  In the exit criteria, add P2b.2b.2b.2a's: the laws' analytic cases; phase 2 bit-identical without a landing; every
  preset's canonical setup run end to end; the strokes and landings recorded.
- **"P2b.2b.2b decisions and findings (2026-10-08)".** Append:
  - the split and the user's decisions of 2026-10-09 (spec "Decisions");
  - the user's observation on spin after a bounce;
  - the user's lawn observation and its consequence: record, beside the deferred "divots and lasting turf damage" in
    the P2 row, a winter-rules variant that bans jump shots, because soft lawns deform and are damaged (handover,
    2026-10-09).
- **A new section, "P2b.2b.2b.2a outcomes (2026-10-09)",** before "Provisional numbers". It holds:
  - Step 3's figures;
  - the fit (k_w, τ_r) and the low-speed gate's figures, with the user's decision at the gate;
  - exit criterion 2's digest counts;
  - the probe files' names;
  - "Public": `FaceMaterial` loses `restitution` and `contactTime`; `SurfaceProps` gains `bedModulus` and
    `bedRecovery`; `ShotEvent` gains `landing-cap`; `ImpactEvent` gains `impact-turf-pit`; `ENGINE_VERSION` 0.9.0.
- **"Provisional numbers":** unchanged.

- [ ] **Step 5: Record this plan's decisions in the phase spec**

At the end of `docs/superpowers/specs/2026-10-09-p2b2b2b2a-strike-turf-laws-design.md`, add "## Amendments
(implementation, 2026-10-09)". List decisions 1–12 above, one bullet each:

- decision 1 states the user's confirmation;
- any expectation that changed and that the user decided on (Task 7 Step 6, Task 8 Step 5, the gate) gets its own
  bullet.

Do not rewrite the spec's body.

- [ ] **Step 6: Check the documents**

Run: `env LC_ALL=en_GB.UTF-8 grep -nE "^[^|].{120,}$" docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`
Expected: line 29 only.

Run: `env LC_ALL=en_GB.UTF-8 grep -nE "^[^|].{120,}$" docs/superpowers/specs/2026-10-09-p2b2b2b2a-strike-turf-laws-design.md`
Expected: no output.

- [ ] **Step 7: Run every check**

Run: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add scripts/strokeProbe.ts docs/superpowers
git commit -F <temp>/msg-task11.txt
```

Message: `Record the strike and turf laws' outcomes`
