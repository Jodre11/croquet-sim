# P2b.2b.2b.1 — The Stance from the Hands: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A player sets a stroke's stance by where the top hand is at contact, not by an angle.
`SwingStance.handsAhead` replaces `lean`; the lean follows from the rigid geometry, and the point of impact from the
lean. The rolls take the face angles Gugan measured.

**Architecture:**

- `buildContact.ts` gains `handsAheadFor` (lean → hands) and `stanceLean` (hands → lean). Both use one helper that
  computes A and B in one operation order.
- `contactPose`, `validate` and the test support read the lean through `stanceLean`.
- `profile.ts` keeps each preset's lean, quoted, and derives its `handsAhead` when the profile loads, with the reference
  mallet and ball.
- The rolls move to Gugan 4 Table 6's 24°, 31° and 34°. `scripts/fitStrokeShape.ts` refits their defaults, and the
  probes record the outcome.
- Force tables and the upright presets stay bit-identical, because an upright shaft reads back exactly 0.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), Vitest, ESLint, Prettier. No
new dependencies. `npx --yes tsx` runs the scripts.

**Spec:** `docs/superpowers/specs/2026-10-08-p2b2b2b1-hands-stance-design.md`. Read all of it. Also read:

- **Swing spec:** `docs/superpowers/specs/2026-10-04-p2b2b1-swing-shot-design.md`, §5.1–§5.5 (the stance, its
  derivation, the rejections, the default profile, the canonical setups).
- **Stroke-shape spec:** `docs/superpowers/specs/2026-10-06-p2b2b2a-stroke-shape-design.md`, §5.3 and §6.2 (the
  defaults and the fit).
- **Roadmap:** `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`. Read the P2 and P3 rows, the "Model
  limits" of "P2b.2b.1 outcomes carried forward", "P2b.2b.2a outcomes carried forward" and "User play data and checks
  (2026-10-08)".
- **The previous plan:** `docs/superpowers/plans/2026-10-07-p2b2b2a-stroke-shape.md`, for the conventions this plan
  keeps (its "Global Constraints", and Task 10 for the probe and the documents).

**Decisions made while planning** (each is folded into the spec's amendment note in Task 5):

- **Module exports, not API exports.** `StanceGeometry`, `handsAheadFor` and `stanceLean` are exported from
  `src/engine/swing/buildContact.ts`, because `profile.ts` and the tests import them. They are not exported from
  `src/engine/index.ts` (spec §2: they "stay internal until P3 or P4 reads them").
- **The mechanism lands before the new leans.**
  - Task 2 switches the stance to the hands but keeps the old roll leans (15°, 45°, 48°), round-tripped through the
    hands. Every test stays green, and the rolls move only by rounding.
  - Task 3 moves the rolls to Gugan's leans, with the refit. A reviewer can then accept the mechanism and the new
    defaults separately.
- **Bit-identity is checked on the engine with fixed backswings.**
  - A throwaway full-precision digest, `<temp>/scripts/presetDigest.mts`, runs on fixed backswings. It covers the
    upright presets and the AC stop over `up` ± 3 mm.
  - The probes' sweeps solve their backswing through `backswingFor`, and its memo now keys on `up` (spec §5.2). Before
    this change, a sweep reused the backswing solved at its first `up`; now each `up` solves its own. So a swept run can
    move at rounding level because of the test-support solver alone, with the engine unchanged.
  - The probes are therefore compared at their printed precision, and any line that moves is explained.
- **`testProfile` takes a `lean` or a `handsAhead`, not both**, and throws if given both.
- **`validate` compares `handsAhead` with −D and A directly**, with D = √(A² + B²), as spec §3.4 states. A test can
  then sit exactly on each bound.
- **The probes' stance lines are new lines.** Their existing lines stay comparable, line for line, with the baseline.

## Global Constraints

- **Formatting.**
  - Use 4-space indentation, a 120-column limit, LF line endings and UTF-8.
  - Check line lengths with `env LC_ALL=en_GB.UTF-8 grep -nE "^[^|].{120,}$" <file>`. Table rows in markdown are exempt.
  - Run `npx prettier --write` on every code file and JSON file you touch. `npm run format:check` must pass.
  - `.prettierignore` lists `docs/`, so wrap markdown by hand.
  - Prettier does not re-wrap comments or strings. Wrap any comment over 120 columns by hand, and split any template
    literal over 120 columns with `+`.
- **Engine purity.** `src/engine/**` is pure and deterministic: no DOM, no time of day, no randomness.
- **Determinism lint.**
  - Engine code uses only IEEE-exact operations: `+ − * /`, comparisons, `Math.sqrt`, `Math.abs`, `Math.min`,
    `Math.max`, `Math.round`, `Math.floor`, `Math.ceil`, the constant `Math.PI`, and the engine's own `sinCos` and
    `atan2` (`src/engine/math/elementary.ts`).
  - Engine code has no `Math.sin`, `Math.cos`, `Math.atan2`, `Math.asin`, `Math.exp`, `Math.log`, `Math.pow` or
    `Math.hypot`, and no `**`. `npm run lint` enforces it.
  - Tests and scripts may use any `Math` function.
- **Style.**
  - No non-null assertions (`!`); the repo style is `x as T` after indexing.
  - Braces on every `if`.
  - Write `0 - x` rather than unary minus in engine arithmetic.
  - Exported functions carry a header comment.
  - Use `import type` for type-only imports.
  - Argument lists go all on one line, or each argument on its own line. Use one per line when there are more than
    three, or when the line would pass 120 columns.
- **Units.** SI: m, rad, s. The spec's tables give degrees and mm for reading only.
- **Engine version.** `ENGINE_VERSION` becomes `"0.8.0"` (Task 4).
- **Bit-identity** (spec exit criterion 3).
  - Force-table drives stay bit-identical to `main`. The single-ball, drive and GC-stop presets stay bit-identical on
    fixed backswings at every `up`.
  - Task 1 Step 1 captures the baseline. Task 4 compares against it.
  - The AC stop round-trips its lean only to rounding (a few 1e-17 rad). Its drift is recorded, not gated.
- **The baseline runs** (Task 1 Step 1) run in the background. They must finish before Task 2 Step 3, the first change
  to behaviour. Check with `pgrep -fl tsx`, which must print no probe, digest or fit process. Each baseline file must
  be non-empty.
- **Slow tests** run only when `SLOW_TESTS` is set.
- **RED steps.** Vitest does not type-check. Where a test uses a missing export or field, the RED run shows runtime
  failures (`… is not a function`, an assertion on `undefined` or `NaN`), and `npm run check` shows the type errors.
- **Behaviour figures.**
  - A test that rests on model behaviour carries its reasoning in a comment.
  - Where a test fails, trace the mechanism (the test's own setup, then the probe) before changing an expectation.
  - Fix the code if it departs from the spec.
  - A changed expectation that the spec does not predict goes to the user, and is folded into the spec's amendment
    note (Task 5).
- **Circularity.** Nothing in this phase is tuned to a coaching ratio or to the user's play data (roadmap "P2b.2
  decisions"). Ratios are only recorded.
- **Bash.**
  - One command per call: no `&&`, `||`, `;`, `$(…)` or subshells.
  - Redirecting a script's output to a file with `>` or `2>` is allowed.
  - Never use a shell command string (`bash -c`, `node -e`).
- **The temp directory.**
  - `<temp>` in a Run line is the executing session's literal temp path (its `CLAUDE_TEMP_DIR`, e.g.
    `/tmp/claude-<session id>`), written out in full: worktree sessions refuse `$CLAUDE_TEMP_DIR`. A subagent is
    given this literal path in its prompt.
  - Throwaway scripts go in `<temp>/scripts/`. Their outputs go in `<temp>/baseline/` and `<temp>/after/`. A
    downloaded page goes in its own new directory, `<temp>/fetch/`.
  - If execution moves to a new session, use that session's path. Re-capture the baseline from a worktree of the
    baseline commit, `git worktree add <new temp>/baseline-tree 77c63f9`, then run `npm ci` there. Copy the throwaway
    scripts with their import root changed to that tree.
- **Commits.**
  - Write a short imperative sentence (repo style), signed.
  - Write the message to a fresh file `<temp>/msg-task<N>.txt` and commit with `git commit -F <that path>`.
  - Check with `git log -1 "--format=%G? %h"`. Expect `G`; quote the format, as zsh globs `?`. If signing refuses,
    leave the change staged and report it.
  - Never use `--no-verify`, `-c commit.gpgsign=false` or bare `git stash`.
- **Checks after every task:** `npm test`, `npm run lint`, `npm run check` and `npm run format:check` all pass. The
  baseline is 889 tests passed and 2 skipped.
- **Known noise.** The editor's TypeScript LSP reports spurious "Cannot find module/name" diagnostics. `npm run check`
  is the source of truth.
- **Worktree.**
  - All work happens in `/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b1-hands-stance`, on branch
    `worktree-p2b2b2b1-hands-stance`.
  - `npm ci` has been run there. The branch is local only.

## Review Focus

The spec implies each input below, but none of its listed tests exercises it. The task that owns each one pins it with
a test.

1. **A changed mallet or ball under a fixed stance.** The hands stay where they are and the lean follows (spec §4).
   This happens when a P3 profile switches mallets, or when the default profile runs on a world whose ball differs from
   the reference. Pinned in Task 2 ("keeps a stance's hands, its lean following, when the mallet or the ball changes").
2. **The test support's backswing solver across contact heights.** Under fixed hands the lean follows `up`. A memo keyed
   without `up` would silently return the backswing of another contact height. Pinned in Task 2 ("solves a leaning
   stance's backswing per contact height").
3. **A contact off the face with the hands out of range.** The off-face rejection must win, since A > 0 rests on it
   (spec §3.4). Pinned in Task 2's rejection table.
4. **The contact height under fixed hands.** At the rate spec §3.3 states, a higher contact:
   - steepens a forward lean;
   - leans a backward one further back;
   - leaves an upright one exactly upright.

   Pinned in Task 1 ("leans further under the same hands as the contact rises").
5. **A stance that still carries `lean` and no `handsAhead`.** This is a profile stored or hand-built before this
   change. It must be rejected, naming `handsAhead`, not read as NaN. Pinned in Task 2's rejection table.

---
## File Structure

| Path | Change |
|---|---|
| `src/engine/swing/buildContact.ts` | `StanceGeometry`, `handsAheadFor`, `stanceLean` (Task 1); `contactPose` and `validate` read the lean from the hands, and the range check (Task 2) |
| `src/engine/swing/types.ts` | `SwingStance.handsAhead` replaces `lean` (Task 2) |
| `src/engine/swing/profile.ts` | Each preset's hands derived from its lean (Task 2); the rolls' leans Gugan's (Task 3) |
| `src/engine/simulate.ts` | `ENGINE_VERSION` 0.8.0 (Task 4) |
| `reference/swing.json` | The rolls' refitted defaults (Task 3) |
| `reference/sources/README.md` | Gugan 4 Table 6 cited (Task 3) |
| `tests/engine/support/shot.ts` | `testProfile` converts a lean; `backswingFor` reads the lean, and its memo key (Task 2); `CANONICAL_CLEARANCE` (Task 3) |
| `tests/engine/swing/buildContact.test.ts` | The geometry (Task 1); the migration, the pose, the rejections and the review focus (Task 2); exit criterion 2 and `CANONICAL_APPROACH` (Task 3) |
| `tests/engine/swing/trajectory.test.ts` | One comment's figures re-measured (Task 3) |
| `tests/engine/index.test.ts`, `tests/engine/impact/simulateImpact.test.ts` | The version (Task 4) |
| `scripts/swingProbe.ts`, `scripts/strokeProbe.ts` | The stance in the canonical tables (Task 5) |
| `docs/superpowers/probes/2026-10-08-p2b2b2b1-swingProbe.txt`, `…-strokeProbe.txt` | New: the probes' raw output (Task 5) |
| The roadmap, the swing spec, the stroke-shape spec, this phase's spec | Spec §7 and §9, and this plan's decisions (Task 5) |

Every commit stays green:

- **Task 1** adds the two pure functions. Nothing reads them yet.
- **Task 2** makes the stance carry the hands, with the old leans kept, so behaviour moves only by rounding.
- **Task 3** moves the rolls to Gugan's leans and refits their defaults.
- **Task 4** bumps the version and runs the bit-identity gates.
- **Task 5** probes, and brings the documents up to date.

---
### Task 1: The hands–lean geometry

Spec §3.2, §3.3 and §5.1's first two cases; review focus 4. First, the baseline for exit criterion 3.

**Files:**
- Modify: `src/engine/swing/buildContact.ts` (the elementary import; new code after `tempos`, before `validate`)
- Test: `tests/engine/swing/buildContact.test.ts` (the import list; a new `describe` at the end of the file)
- Temp, never committed: `<temp>/scripts/presetDigest.mts`, `<temp>/scripts/releaseAccel.mts`, `<temp>/baseline/*`

**Interfaces:**
- Consumes: `START_GAP` (`buildContact.ts`); `sinCos` and `atan2` (`src/engine/math/elementary.ts`).
- Produces, as exports of `src/engine/swing/buildContact.ts` (not of `src/engine/index.ts`):
  - `interface StanceGeometry { readonly ballRadius: number; readonly headLength: number; readonly headRadius: number }`
  - `function handsAheadFor(lean: number, top: number, up: number, geometry: StanceGeometry): number`
  - `function stanceLean(handsAhead: number, top: number, up: number, geometry: StanceGeometry): number`
  - The private `stanceArms(top: number, up: number, geometry: StanceGeometry): readonly [number, number]`, which
    returns [A, B] (Task 2's `validate` uses it).

- [ ] **Step 1: Capture the baseline**

First confirm that the branch's code is `main`'s:

Run: `git diff --stat main -- src tests scripts reference`
Expected: no output. The branch's commits are docs only.

Run: `mkdir -p <temp>/scripts <temp>/baseline <temp>/after`

Create `<temp>/scripts/presetDigest.mts`:

```ts
/**
 * Full-precision digest of swing presets on fixed backswings, for P2b.2b.2b.1's bit-identity gate (plan Task 1 Step 1,
 * Task 4). Throwaway, never committed. Run from the worktree: env TYPES=<types, comma-separated> npx --yes tsx <this>.
 */
import { createHash } from "node:crypto";
import { simulateShot } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b1-hands-stance/src/engine/shot";
import { contactPose } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b1-hands-stance/src/engine/swing/buildContact";
import type { StrokeType } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b1-hands-stance/src/engine/swing/types";
import { defaultWorld } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b1-hands-stance/src/engine/world";
import { canonicalSetup } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b1-hands-stance/tests/engine/support/shot";

const WORLD = defaultWorld();
const TYPES = (process.env.TYPES ?? "single-ball,drive,stop-gc").split(",") as StrokeType[];
/** JSON.stringify drops the sign of zero; keep it, so that the digest is bit-exact. */
const exact = (_key: string, value: unknown): unknown => (Object.is(value, -0) ? "-0" : value);

for (const type of TYPES) {
    const base = canonicalSetup(type, { world: WORLD });
    const up0 = base.stroke.contact.up;
    for (const backswing of [0.1, 0.3, 0.5]) {
        for (const drive of [-1, 0, 1]) {
            for (const up of [up0 - 0.003, up0, up0 + 0.003]) {
                const setup = { ...base, stroke: { ...base.stroke, backswing, drive, contact: { up, side: 0 } } };
                const label = `${type} backswing ${backswing} drive ${drive} up ${up}`;
                try {
                    const outcome = simulateShot(setup, WORLD);
                    const theta = contactPose(setup, WORLD).thetaContact;
                    const sha = createHash("sha256").update(JSON.stringify(outcome, exact)).digest("hex");
                    console.log(`${label}: θ_c ${theta}, planned ${outcome.contactSpeed} m/s, sha256 ${sha}`);
                } catch (error) {
                    console.log(`${label}: rejected (${(error as Error).message})`);
                }
            }
        }
    }
}
```

Create `<temp>/scripts/releaseAccel.mts`. It re-measures the figures in the comment of `trajectory.test.ts`'s "starts at
the impact's start, the head at rest at the top, when the lead outlasts the downswing":

```ts
/** The full roll's head acceleration either side of its release (trajectory.test.ts). Throwaway, never committed. */
import { length, sub } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b1-hands-stance/src/engine/math/vec3";
import { simulateShot } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b1-hands-stance/src/engine/shot";
import type { StrokeSample, SwingTrajectory } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b1-hands-stance/src/engine/swing/trajectory";
import { defaultWorld } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b1-hands-stance/src/engine/world";
import { canonicalSetup } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b1-hands-stance/tests/engine/support/shot";

const WORLD = defaultWorld();
const shot = canonicalSetup("full-roll", {
    world: WORLD,
    shape: { handTempo: { slow: 0.13, fast: 0.065 } },
    stroke: { timing: { arc: -0.1455, hands: 0, dip: 0 } },
});
const trajectory = simulateShot(shot, WORLD, { trajectory: true }).trajectory as SwingTrajectory;
const samples = trajectory.samples;
const i = samples.findIndex((s) => s.t >= trajectory.release);
const accel = (a: StrokeSample, b: StrokeSample): number => length(sub(b.velocity, a.velocity)) / (b.t - a.t);
const before = accel(samples[i - 2] as StrokeSample, samples[i - 1] as StrokeSample);
const after = accel(samples[i] as StrokeSample, samples[i + 1] as StrokeSample);
console.log(`release ${trajectory.release} s; impact start ${trajectory.impactStart} s`);
console.log(`head acceleration before the release ${before.toFixed(1)} m/s², after ${after.toFixed(1)} m/s²`);
console.log(`Δa·Δt²/8 at 1 ms: ${(((after - before) * 1e-6) / 8 * 1e6).toFixed(1)} µm`);
```

Run each command below in the background (`run_in_background: true`), one per call. The probes take minutes, and
Steps 2–7 go on meanwhile:

- `env OBSTACLE_STROKES=2000 npx --yes tsx scripts/impactDigest.ts > <temp>/baseline/digest.txt`
- `npx --yes tsx scripts/swingProbe.ts > <temp>/baseline/swingProbe.txt`
- `npx --yes tsx scripts/strokeProbe.ts > <temp>/baseline/strokeProbe.txt`
- `env TYPES=single-ball,drive,stop-gc npx --yes tsx <temp>/scripts/presetDigest.mts > <temp>/baseline/upright.txt`
- `env TYPES=stop-ac npx --yes tsx <temp>/scripts/presetDigest.mts > <temp>/baseline/ac.txt`
- `npx --yes tsx <temp>/scripts/releaseAccel.mts > <temp>/baseline/release.txt`
- `npx --yes tsx scripts/fitStrokeShape.ts > <temp>/baseline/swing-fit.json 2> <temp>/baseline/fit-summary.txt`

When `release.txt` is written, read it. The method must reproduce the test comment's figures at 45°: "from ~38 to ~205
m/s²" and "about 20 µm". If it does not, record what it gives. Task 3 then keeps the comment's figures, labelled as
measured at P2b.2b.2a's 45°, rather than re-measuring them by an unchecked method.

- [ ] **Step 2: Write the failing tests**

In `tests/engine/swing/buildContact.test.ts`, add `handsAheadFor` and `stanceLean` to the import from
`"../../../src/engine/swing/buildContact"`, keeping its alphabetical order:

```ts
import {
    MAX_LEAD,
    START_GAP,
    TURF_MARGIN,
    buildContact,
    contactPose,
    downswingInput,
    handsAheadFor,
    planStroke,
    plannedSpeed,
    poseSpeed,
    stanceLean,
    swingApproach,
} from "../../../src/engine/swing/buildContact";
```

Append at the end of the file:

```ts
describe("the stance's geometry (P2b.2b.2b.1 design §3.2, §3.3)", () => {
    /** The test ball and head: R, L and ρ. */
    const GEOMETRY = { ballRadius: R, headLength: LENGTH, headRadius: RHO };
    /** B = R + START_GAP + L/2, in the engine's operation order. */
    const B = R + START_GAP + LENGTH / 2;

    it("reads every lean back from the top hand's position, within 1e-12 rad", () => {
        for (let degrees = -30; degrees <= 80; degrees += 5) {
            for (const top of [0.3, 0.45, 0.6, 0.75, 0.9]) {
                for (const up of [-0.03, -0.015, 0, 0.015, 0.03]) {
                    const lean = degrees * DEG;
                    const back = stanceLean(handsAheadFor(lean, top, up, GEOMETRY), top, up, GEOMETRY);
                    expect(Math.abs(back - lean), `${degrees}° at top ${top} m, up ${up} m`).toBeLessThan(1e-12);
                }
            }
        }
    });

    it("puts an upright shaft's top hand B behind the ball's centre and reads it back as exactly 0", () => {
        // Design §3.2: S² is formed as A² + (B − X)(B + X), so at X = −B it is fl(A²), S is A, and the lean's sine is
        // exactly 0. This keeps the upright presets bit-identical (exit criterion 3).
        for (const top of [0.3, 0.6, 0.9]) {
            for (const up of [-0.03, 0, 0.03]) {
                const hands = handsAheadFor(0, top, up, GEOMETRY);
                expect(hands, `top ${top} m, up ${up} m`).toBe(0 - B);
                expect(stanceLean(hands, top, up, GEOMETRY), `top ${top} m, up ${up} m`).toBe(0);
            }
        }
    });

    it("places the top hand at X = A·sin α − B·cos α, A = ρ + top − up", () => {
        const [top, up, lean] = [0.6, 0.01, 0.5];
        const A = RHO + top - up;
        expect(handsAheadFor(lean, top, up, GEOMETRY)).toBeCloseTo(A * Math.sin(lean) - B * Math.cos(lean), 14);
    });

    it("leans further under the same hands as the contact rises, by sin α/(A·cos α + B·sin α) per metre", () => {
        // Review focus 4 (design §3.3): at fixed X, dα = −sin α·dA/(A·cos α + B·sin α), and dA = −d(up). A higher
        // contact steepens a forward lean and leans a backward one further back; an upright shaft stays upright.
        const top = 0.6;
        const h = 1e-5;
        for (const lean of [-0.1, 0.5]) {
            const hands = handsAheadFor(lean, top, 0, GEOMETRY);
            const slope = (stanceLean(hands, top, h, GEOMETRY) - stanceLean(hands, top, 0 - h, GEOMETRY)) / (2 * h);
            const A = RHO + top;
            const expected = Math.sin(lean) / (A * Math.cos(lean) + B * Math.sin(lean));
            expect(slope / expected, `lean ${lean} rad`).toBeCloseTo(1, 6);
        }
        expect(stanceLean(handsAheadFor(0, top, 0, GEOMETRY), top, 0.01, GEOMETRY)).toBe(0);
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/swing/buildContact.test.ts -t "stance's geometry"`
Expected: FAIL, with `handsAheadFor is not a function`.

- [ ] **Step 4: Implement**

In `src/engine/swing/buildContact.ts`, change `import { sinCos } from "../math/elementary";` to:

```ts
import { atan2, sinCos } from "../math/elementary";
```

After the `tempos` function, before `/** Checks \`setup\` (see planStroke). */`, insert:

```ts
/** The rigid geometry between a stance's top hand and its lean (P2b.2b.2b.1 design §3.2): R, L and ρ (m). */
export interface StanceGeometry {
    readonly ballRadius: number;
    readonly headLength: number;
    readonly headRadius: number;
}

/**
 * [A, B] (P2b.2b.2b.1 design §3.2): A = ρ + top − up, B = R + START_GAP + L/2. One operation order serves both
 * directions, so a lean derived by handsAheadFor reads back through stanceLean with the same bits of A and B.
 */
function stanceArms(top: number, up: number, geometry: StanceGeometry): readonly [number, number] {
    const { ballRadius, headLength, headRadius } = geometry;
    return [headRadius + top - up, ballRadius + START_GAP + headLength / 2];
}

/**
 * The top hand's horizontal distance (m) ahead of the striker's ball's centre along aim at contact (P2b.2b.2b.1
 * design §3.2): X = A·sin α − B·cos α. The shaft leans `lean` (α, rad, positive pitching the face down), the top
 * hand is `top` (m) up the shaft from the socket, and the ball is met `up` (m) above the face's centre.
 */
export function handsAheadFor(lean: number, top: number, up: number, geometry: StanceGeometry): number {
    const [a, b] = stanceArms(top, up, geometry);
    const [s, c] = sinCos(lean);
    return a * s - b * c;
}

/**
 * The shaft's lean (rad) at contact that puts the top hand `handsAhead` (m) ahead of the ball's centre: handsAheadFor
 * inverted on the branch where the hands rise with the lean (P2b.2b.2b.1 design §3.2). With
 * S = √(A² + (B − X)·(B + X)), α = atan2(A·X + B·S, A·S − B·X). At X = −B the product vanishes, so an upright shaft
 * reads back as exactly 0. `handsAhead` must lie in (−D, A), with D² = A² + B²; planStroke checks it.
 */
export function stanceLean(handsAhead: number, top: number, up: number, geometry: StanceGeometry): number {
    const [a, b] = stanceArms(top, up, geometry);
    const s = Math.sqrt(a * a + (b - handsAhead) * (b + handsAhead));
    return atan2(a * handsAhead + b * s, a * s - b * handsAhead);
}
```

Run `npx prettier --write src/engine/swing/buildContact.ts tests/engine/swing/buildContact.test.ts`. Then check line
lengths.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/swing/buildContact.test.ts -t "stance's geometry"`
Expected: PASS, 4 tests.

- [ ] **Step 6: Run every check**

Run, one per call: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`.
Expected: all pass; `npm test` shows 893 passed and 2 skipped.

- [ ] **Step 7: Commit**

Message: `Relate the top hand's position to the shaft's lean`. Stage `src/engine/swing/buildContact.ts` and
`tests/engine/swing/buildContact.test.ts` by path.

---
### Task 2: The stance takes the hands

Spec §3.1, §3.4, §4 (the derivation; the leans as they are), §5.1's pose and rejection cases, and §5.2; review focus
1, 2, 3 and 5. The roll leans stay at 15°, 45° and 48° here (see "Decisions made while planning").

**Files:**
- Modify: `src/engine/swing/types.ts` (the header's stance bullet, and `SwingStance`, at 36–47)
- Modify: `src/engine/swing/buildContact.ts` (the header, `STANCE_NUMBERS`, `validate`, `contactPose`, `planStroke`'s
  doc and call, `plannedSpeed`)
- Modify: `src/engine/swing/profile.ts` (the imports, the header's stance bullet, the stance block at 201–222)
- Modify: `tests/engine/support/shot.ts` (`TestProfileOptions`, `testProfile`, `backswingFor`)
- Test: `tests/engine/swing/buildContact.test.ts`

**Interfaces:**
- Consumes: Task 1's `StanceGeometry`, `handsAheadFor`, `stanceLean` and the private `stanceArms`.
- Produces:
  - `SwingStance` is `{ handsAhead; top; bottom; gripTension; bottomGrip }`, with no `lean`.
  - `TestProfileOptions.stance?: Partial<SwingStance> & { readonly lean?: number }`, plus `up?: number` and
    `ballRadius?: number`.
  - In `profile.ts`, the private `REFERENCE_GEOMETRY` and
    `leaning(lean: number, up: number, hands: Omit<SwingStance, "handsAhead">): SwingStance`. Task 3 edits their call
    sites.
  - The private `validate(setup: ShotSetup, ballRadius: number)`.
  - The error message `profile.stance.<type>.handsAhead must lie in (−D, A) = (…, …) m …`.

- [ ] **Step 1: Write the failing tests and migrate the lean tests**

In `tests/engine/swing/buildContact.test.ts`:

1. Add `type SwingStance` to the import from `"../../../src/engine/swing/types"`, in alphabetical order.

2. Replace the test "turns the lean into the contact angle, a negative lean rising into the ball" with:

```ts
    it("turns the hands' position into the contact angle, a negative lean rising into the ball", () => {
        // testProfile turns a lean into the hands that give it at the shot's `up`; the lean reads back to rounding.
        const leaning = buildContact(shot({}, testProfile({ stance: { lean: 0.2 } })), WORLD);
        expect(arcOf(leaning).theta0).toBeCloseTo(-0.2, 12);
        const profile = testProfile({ stance: { lean: -0.05 }, up: -0.01 });
        const rising = buildContact(shot({ contact: { up: -0.01, side: 0 } }, profile), WORLD);
        expect(arcOf(rising).theta0).toBeCloseTo(0.05, 12);
        expect(rising.velocity.z).toBeGreaterThan(0);
    });
```

3. In "pitches the face down by the lean, the head rigid on the shaft", change the profile line to:

```ts
            const profile = testProfile({ stance: { lean: degrees * DEG }, mallet: { headLength: 0.1 }, up: -0.02 });
```

4. In "dips the hands as the profile says, whatever the drive, still meeting the ball on the up", change the profile
   line to:

```ts
            const profile = testProfile({
                stance: { lean: -0.05 },
                up: -0.01,
                drive: { handDrop: 0.014, dropTime: 0.02 },
            });
```

5. In "gives a setup mirrored across a vertical plane an exactly mirrored contact and impact", add `up: -0.003,` after
   the `stance: { lean: 0.1, gripTension: 0.8, bottomGrip: 0.5 },` line. Both shots meet the ball at `up` −0.003.

6. In `describe("contactPose (design §5.2 steps 1–5, 10)")`'s first test:
   - change the setup to
     `shot({ contact: { up: -0.01, side: 0.002 } }, testProfile({ stance: { lean: -0.05 }, up: -0.01 }))`;
   - change `expect(pose.thetaContact).toBe(0.05);` to `expect(pose.thetaContact).toBeCloseTo(0.05, 12);`.

7. Add two tests at the end of that `describe`:

```ts
    it("puts the top hand handsAhead ahead of the ball along aim, the face pitched by stanceLean's lean", () => {
        // P2b.2b.2b.1 design §5.1. `side` moves nothing along aim.
        const aim = vec3(Math.cos(0.4), Math.sin(0.4), 0);
        const geometry = { ballRadius: R, headLength: LENGTH, headRadius: RHO };
        for (const handsAhead of [-0.25, -0.1, 0.12]) {
            for (const up of [-0.01, 0, 0.01]) {
                const setup = shot({ contact: { up, side: 0.004 } }, testProfile({ stance: { handsAhead } }));
                const pose = contactPose(setup, WORLD);
                const ahead = dot(sub(pose.pivot, vec3(5, 3, 0)), aim);
                expect(Math.abs(ahead - handsAhead), `${handsAhead} m at up ${up} m`).toBeLessThan(1e-12);
                const lean = stanceLean(handsAhead, TOP, up, geometry);
                expect(pose.thetaContact).toBe(0 - lean);
                expect(Math.abs(rotate(pose.orientation, vec3(1, 0, 0)).z + Math.sin(lean))).toBeLessThan(1e-12);
            }
        }
    });

    it("keeps a stance's hands, its lean following, when the mallet or the ball changes", () => {
        // Review focus 1 (P2b.2b.2b.1 design §4): a stance entered as hands keeps them, and the rigid geometry moves
        // its lean.
        const aim = vec3(Math.cos(0.4), Math.sin(0.4), 0);
        const base = testProfile({ stance: { lean: 0.5 } });
        const hands = base.stance["single-ball"].handsAhead;
        const cases = [
            {
                profile: { ...base, mallet: { ...base.mallet, headLength: 0.3 } },
                world: WORLD,
                geometry: { ballRadius: R, headLength: 0.3, headRadius: RHO },
            },
            {
                profile: base,
                world: testWorld({ ball: { ...WORLD.ball, radius: 0.05 } }),
                geometry: { ballRadius: 0.05, headLength: LENGTH, headRadius: RHO },
            },
        ];
        for (const { profile, world, geometry } of cases) {
            const pose = contactPose(shot({}, profile), world);
            expect(Math.abs(dot(sub(pose.pivot, vec3(5, 3, 0)), aim) - hands)).toBeLessThan(1e-12);
            const lean = stanceLean(hands, TOP, 0, geometry);
            expect(pose.thetaContact).toBe(0 - lean);
            expect(Math.abs(lean - 0.5)).toBeGreaterThan(1e-3);
        }
    });
```

8. After "plans the speed the test support's solver asks for", add:

```ts
    it("solves a leaning stance's backswing per contact height", () => {
        // Review focus 2. Under fixed hands the lean follows `up` (P2b.2b.2b.1 design §3.3), and with an effort pulse
        // the planned speed follows the lean, so a memo keyed without `up` would hand one height another's backswing.
        const profile = testProfile({
            stance: { lean: 0.4 },
            shape: { effort: { torqueMax: 3, tempoSlow: 0.4, tempoFast: 0.2 } },
        });
        for (const up of [-0.01, 0.01]) {
            const setup = shot({ intensity: 1, contact: { up, side: 0 } }, profile);
            const backswing = backswingFor(setup, 2.5, WORLD);
            const planned = plannedSpeed({ ...setup, stroke: { ...setup.stroke, backswing } }, WORLD);
            expect(planned, `up ${up} m`).toBeCloseTo(2.5, 9);
        }
    });
```

9. In `describe("buildContact rejections")`, after the `missing` helper, add:

```ts
    /** The test stance's A and D at `up` 0 (P2b.2b.2b.1 design §3.2, §3.4), in validate's operation order. */
    const A = RHO + TOP;
    const B = R + START_GAP + LENGTH / 2;
    const D = Math.sqrt(A * A + B * B);
    /** A stance from before P2b.2b.2b.1: a lean and no handsAhead (review focus 5). */
    const legacy = (): SwingProfile => {
        const p = testProfile();
        const old = { lean: 0, top: 0.8, bottom: 0.4, gripTension: 1, bottomGrip: 1 } as unknown as SwingStance;
        return { ...p, stance: { ...p.stance, "single-ball": old } };
    };
```

10. In `cases`, replace the row `["a lean of 90°", …]` with:

```ts
        [
            "the top hand at A, the shaft flat",
            shot({}, testProfile({ stance: { handsAhead: A } })),
            /handsAhead must lie in/,
        ],
        ["the top hand beyond A", shot({}, testProfile({ stance: { handsAhead: 0.9 } })), /handsAhead must lie in/],
        [
            "the top hand at −D, off the stance's branch",
            shot({}, testProfile({ stance: { handsAhead: 0 - D } })),
            /handsAhead must lie in/,
        ],
        ["the top hand below −D", shot({}, testProfile({ stance: { handsAhead: -1 } })), /handsAhead must lie in/],
        [
            "a non-finite hands' position",
            shot({}, testProfile({ stance: { handsAhead: NaN } })),
            /profile\.stance\.single-ball\.handsAhead must be finite/,
        ],
        [
            "a stance with a lean but no handsAhead",
            shot({}, legacy()),
            /profile\.stance\.single-ball\.handsAhead must be finite \(got undefined\)/,
        ],
        [
            "a contact off the face, before the hands' range",
            shot({ contact: { up: 0.03, side: 0.02 } }, testProfile({ stance: { handsAhead: 2 } })),
            /off the face/,
        ],
```

    The last row is review focus 3.

11. In `describe("the default profile's canonical setups")`, add:

```ts
    it("keeps the upright presets exactly upright at any contact height", () => {
        // Exit criterion 3: their hands lie B behind the ball's centre, which reads back as exactly 0 at any `up`.
        const world = defaultWorld();
        for (const type of ["single-ball", "drive", "stop-gc"] as const) {
            for (const up of [-0.03, -0.01, 0, 0.01, 0.03]) {
                const pose = contactPose(canonicalSetup(type, { world, stroke: { contact: { up, side: 0 } } }), world);
                expect(pose.thetaContact, `${type} at up ${up} m`).toBe(0);
            }
        }
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/swing/buildContact.test.ts`
Expected: FAIL on:
- the pose test (the pivot is still placed by `lean` 0);
- the mallet-and-ball test;
- the four range rows, the non-finite row and the legacy row (none is rejected yet).

The memo test and the upright test pass already. They guard behaviour that Step 3 could break.

- [ ] **Step 3: Implement**

First confirm that the baseline runs have finished (see "Global Constraints").

`src/engine/swing/types.ts`:

- In the header's list, change "- a stance for that type, and where the two hands sit on the mallet, which sets the
  head's angle;" to "- a stance for that type: where the top hand is at contact and where the two hands sit on the
  mallet, which set the head's angle;".
- Replace `SwingStance` and its comment with:

```ts
/**
 * How the player stands to a stroke type and holds the mallet: where the top hand is at contact, `handsAhead` (m), its
 * horizontal distance ahead of the striker's ball's centre along aim (negative behind); the top and bottom hands'
 * distances from the socket along the shaft (m, 0 < bottom < top); and the top hand's grip tension γ_T and the bottom
 * hand's grip g_B from contact on (in (0, 1]). The shaft's lean at contact follows (stanceLean, P2b.2b.2b.1 design §3).
 */
export interface SwingStance {
    readonly handsAhead: number;
    readonly top: number;
    readonly bottom: number;
    readonly gripTension: number;
    readonly bottomGrip: number;
}
```

`src/engine/swing/buildContact.ts`:

- In the header's step 1, change "θ_c = −lean," to "θ_c = −lean, the lean from the top hand's position (stanceLean,
  P2b.2b.2b.1 design §3.2),". Wrap at 120 columns.
- `const STANCE_NUMBERS: readonly (keyof SwingStance)[] = ["handsAhead", "top", "bottom", "gripTension", "bottomGrip"];`
- Change `validate`'s signature and doc to:

```ts
/** Checks `setup` on a world whose ball has radius `ballRadius` (see planStroke). */
function validate(setup: ShotSetup, ballRadius: number): void {
```

- In `validate`, change `const { lean, top, bottom, gripTension, bottomGrip } = stance;` to
  `const { handsAhead, top, bottom, gripTension, bottomGrip } = stance;`, and delete the lean check:

```ts
    if (!(Math.abs(lean) < Math.PI / 2)) {
        fail(`profile.stance.${type}.lean must lie within ±90° (got ${lean} rad)`);
    }
```

- In `validate`, directly after the contact-off-face check, insert:

```ts
    // A > 0 rests on the contact lying on the face, checked just above (P2b.2b.2b.1 design §3.4).
    const [a, b] = stanceArms(top, up, { ballRadius, headLength: mallet.headLength, headRadius: rho });
    const d = Math.sqrt(a * a + b * b);
    if (!(handsAhead > 0 - d && handsAhead < a)) {
        fail(
            `profile.stance.${type}.handsAhead must lie in (−D, A) = (${0 - d}, ${a}) m for its top hand and the ` +
                `contact's up (got ${handsAhead}): at A the shaft lies flat, at −D the hands leave the stance's branch`,
        );
    }
```

- In `planStroke` and `plannedSpeed`, change `validate(setup);` to `validate(setup, world.ball.radius);`.
- In `planStroke`'s doc, change "- top ≤ 0, or top > shaftLength; bottom outside (0, top); |lean| ≥ 90°;" to
  "- top ≤ 0, or top > shaftLength; bottom outside (0, top);". Then change "- backswing ≤ 0; an intensity outside
  [0, 1]; |drive| > 1; the contact off the face;" to:

```ts
 * - backswing ≤ 0; an intensity outside [0, 1]; |drive| > 1; the contact off the face; handsAhead outside (−D, A) for
 *   the stroke's top hand and contact (P2b.2b.2b.1 design §3.4: at A the shaft lies flat, at −D the hands leave the
 *   stance's branch);
```

- In `contactPose`, replace `const { lean, top } = profile.stance[stroke.type];` with
  `const { handsAhead, top } = profile.stance[stroke.type];`. After `const R = world.ball.radius;`, add:

```ts
    const lean = stanceLean(handsAhead, top, up, { ballRadius: R, headLength: mallet.headLength, headRadius: rho });
```

- In `contactPose`'s doc, change "θ_c = −lean (step 2)" to "θ_c = −lean, the lean from the top hand's position
  (step 2; P2b.2b.2b.1 design §3.2)". Wrap at 120 columns.

`src/engine/swing/profile.ts`:

- Imports:

```ts
import {
    ballReference,
    contactReference,
    malletReference,
    swingReference,
    type StrokeShapeReference,
} from "../../reference/index";
import { ReferenceDataError } from "../../reference/schema";
import type { StrokeMode } from "../impact/types";
import { handsAheadFor } from "./buildContact";
import {
    STROKE_TYPES,
    type StrokeTiming,
    type StrokeType,
    type SwingDrive,
    type SwingProfile,
    type SwingShape,
    type SwingStance,
} from "./types";
```

- In the header, replace the "- Stance: …" bullet's first sentence ("Stance: the hands measured from the socket along
  the shaft, and the leans, after John Riches, Croquet Technique (Oxford Croquet), quoted per preset below.") with:

```ts
 * - Stance: the hands measured from the socket along the shaft, and the leans, after John Riches, Croquet Technique
 *   (Oxford Croquet), quoted per preset below. Each preset is defined by its lean at its typical contact. Its top
 *   hand's position at contact, the stance's input, is derived from that lean with the reference mallet and ball
 *   (P2b.2b.2b.1 design §4).
```

  Keep the bullet's remaining sentences.

- After `const DEG = Math.PI / 180;`, add:

```ts
/**
 * The reference ball and mallet each default stance's hands are derived for (P2b.2b.2b.1 design §4). R and ρ are
 * computed as defaultWorld and contactPose compute them, so an upright preset's hands and its pose's B agree to the
 * bit.
 */
const REFERENCE_GEOMETRY = {
    ballRadius: ballReference.diameter.value / 2,
    headLength: malletReference.headLength.value,
    headRadius: malletReference.headDiameter.value / 2,
};

/**
 * A default stance defined by its shaft's lean (rad) at contact `up` (m) on the face, its typical contact. The top hand
 * is placed where that lean puts it with the reference mallet and ball (design §4).
 */
function leaning(lean: number, up: number, hands: Omit<SwingStance, "handsAhead">): SwingStance {
    return { handsAhead: handsAheadFor(lean, hands.top, up, REFERENCE_GEOMETRY), ...hands };
}
```

- Replace each stance entry's value. Keep every comment, except for the two additions noted in the code:

```ts
    stance: {
        // The top hand fixed at the top of the handle; the bottom hand high and light, a guide only (prototype).
        "single-ball": leaning(0, 0, { top: 0.805, bottom: 0.7, gripTension: 1, bottomGrip: 0.1 }),
        // As single-ball, the bottom hand a little lower and firmer, still only a guide (prototype).
        drive: leaning(0, 0, { top: 0.805, bottom: 0.6, gripTension: 1, bottomGrip: 0.25 }),
        // Feet set back, the ball met on the up: the shaft leans back 4°, so the strike rises 4° and the face tilts up
        // 4°, within the feasibility spike's 3–5° tilt (a 5° lean leaves the head only 4.03 mm clear at contact). Both
        // grips relax at contact (prototype). The lean is defined at its canonical contact, 20 mm below the face's
        // centre.
        "stop-ac": leaning(-4 * DEG, -0.02, { top: 0.805, bottom: 0.45, gripTension: 0.1, bottomGrip: 0.1 }),
        // The lower hand low and firm, checking the swing through its lever just after contact (prototype).
        "stop-gc": leaning(0, 0, { top: 0.805, bottom: 0.45, gripTension: 1, bottomGrip: 1 }),
        // Riches: "Most players place the bottom hand almost half-way down the handle for this shot, leaving the other
        // hand at the top", the mallet "making an angle of about 75 degrees with the ground".
        "half-roll": leaning(15 * DEG, 0, { top: 0.805, bottom: 0.42, gripTension: 1, bottomGrip: 1 }),
        // Riches: "Your lower hand should be placed at least two-thirds of the way down the handle, and your top hand
        // will also need to be moved, to about one-third of the way down the handle", giving "an angle of
        // approximately 45 degrees between the mallet handle and the ground".
        "full-roll": leaning(45 * DEG, 0, { top: 0.61, bottom: 0.3, gripTension: 1, bottomGrip: 1 }),
        // Riches: "The bottom hand should be placed at the very bottom of the mallet shaft for this shot"; the slope at
        // least the full roll's.
        "pass-roll": leaning(48 * DEG, 0, { top: 0.45, bottom: 0.09, gripTension: 1, bottomGrip: 1 }),
    },
```

`tests/engine/support/shot.ts`:

- Imports: add `import { handsAheadFor, plannedSpeed, stanceLean } from "../../../src/engine/swing/buildContact";`
  in place of the `plannedSpeed` import, and `import { TEST_BALL } from "./fixtures";` after the
  `lawnReference, swingReference` import.
- Replace `TestProfileOptions` and `testProfile`'s doc and opening with:

```ts
/**
 * What `testProfile` changes: the mallet, the body, and one stance, one drive and one shape entry for every stroke
 * type. A stance may give a `lean` (rad) instead of `handsAhead`. It stands for the hands that give that lean with the
 * profile's own mallet (after `mallet`), at the contact height `up` (m, default 0) on a ball of radius `ballRadius` (m,
 * default TEST_BALL.radius). Give the shot's own `up` where it is not 0.
 */
export interface TestProfileOptions {
    readonly mallet?: Partial<SwingProfile["mallet"]>;
    readonly body?: Partial<SwingProfile["body"]>;
    readonly stance?: Partial<SwingStance> & { readonly lean?: number };
    readonly up?: number;
    readonly ballRadius?: number;
    readonly drive?: Partial<SwingDrive>;
    readonly shape?: Partial<SwingShape>;
}

/**
 * A profile with the test head (1 kg, 0.23 m long, 0.064 m across, on a 0.9 m shaft) and no arm mass, so that the
 * swung body is the head, as TEST_HANDS has it. Every stroke type has the same stance: level (lean 0, the top hand over
 * the socket at contact), the hands 0.8 m and 0.4 m from the socket, firm grips. Every type has the same drive: a
 * swing-mode coast with no dip or reach, and a full guide. Every type has the same shape: the pendulum alone (share 1),
 * by gravity alone (no effort), a 0.4 s pulse or hands' tempo halving at intensity 1, and intensity 0 by default.
 * Throws if the stance gives both a `lean` and `handsAhead`.
 */
export function testProfile(o: TestProfileOptions = {}): SwingProfile {
    const mallet = { headMass: 1, headLength: 0.23, headDiameter: 0.064, shaftLength: 0.9, ...o.mallet };
    const { lean, ...given }: Partial<SwingStance> & { readonly lean?: number } = o.stance ?? {};
    if (lean !== undefined && given.handsAhead !== undefined) {
        throw new Error("testProfile: give the stance a lean or handsAhead, not both");
    }
    const top = given.top ?? 0.8;
    const geometry = {
        ballRadius: o.ballRadius ?? TEST_BALL.radius,
        headLength: mallet.headLength,
        headRadius: mallet.headDiameter / 2,
    };
    const stance: SwingStance = {
        handsAhead: handsAheadFor(lean ?? 0, top, o.up ?? 0, geometry),
        top,
        bottom: 0.4,
        gripTension: 1,
        bottomGrip: 1,
        ...given,
    };
```

  In the `return`, change the `mallet:` line to `mallet,`.

- In `backswingFor`'s doc, replace the lines from " * the MAX_BACK_ANGLE bound]" to " * Test support only." with:

```ts
 * the MAX_BACK_ANGLE bound] at the setup's intensity, or its preset's default, 60 halvings. Memoised on what the
 * planned speed depends on: the type, the intensity, the contact's height (under fixed hands the lean follows it,
 * P2b.2b.2b.1 design §3.3), the profile's entries for the type, the speed, gravity and the ball's radius. It is not
 * memoised on the drive, the contact's side, the timing or the balls. Throws a RangeError for a speed beyond the
 * bound's reach. Test support only.
```

- In the memo key, add `stroke.contact.up,` after `stroke.intensity ?? null,`, and `world.ball.radius,` after
  `world.gravity,`.
- Replace `const room = lever * (Math.cos(stance.lean) - Math.cos(MAX_BACK_ANGLE));` with:

```ts
    const lean = stanceLean(stance.handsAhead, stance.top, stroke.contact.up, {
        ballRadius: world.ball.radius,
        headLength: profile.mallet.headLength,
        headRadius: profile.mallet.headDiameter / 2,
    });
    const room = lever * (Math.cos(lean) - Math.cos(MAX_BACK_ANGLE));
```

Run `npx prettier --write` on the five files. Then check line lengths.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/swing/buildContact.test.ts`
Expected: PASS.

Run: `npm test`
Expected: PASS, 903 passed and 2 skipped. That is Task 1's 893, plus four new tests (the pose, the mallet and ball, the
memo, the upright) and seven new rejection rows, less the removed 90° row. If the count differs, account for the
difference rather than chase the number.

The canonical rolls' tests ("starts at contact, by its planned clearance", exit criterion 5, `shot.test.ts`,
`trajectory.test.ts`) must pass unchanged. Their leans read back to rounding. A failure there is a defect in this task.

- [ ] **Step 5: Run every check**

Run, one per call: `npm run lint`, `npm run check`, `npm run format:check`.
Expected: all pass.

- [ ] **Step 6: Commit**

Message: `Take the stance from the top hand's position at contact`. Stage the five files by path.

---
### Task 3: The rolls at Gugan's face angles

Spec §1 exit criteria 2 and 5, §4 (the rolls' leans, the refit, the sources), and §5.2's re-recorded figures.

**Files:**
- Modify: `src/engine/swing/profile.ts` (the header's stance bullet; the single-ball and roll comments; the roll leans)
- Modify: `reference/swing.json` (the fit's output)
- Modify: `reference/sources/README.md` (a new section)
- Modify: `tests/engine/support/shot.ts` (`CANONICAL_CLEARANCE` and its comment)
- Modify: `tests/engine/swing/trajectory.test.ts` (one comment, if its figures moved)
- Test: `tests/engine/swing/buildContact.test.ts` (`DEFAULT_LEAN`, exit criterion 2, `CANONICAL_APPROACH`)

**Interfaces:**
- Consumes: Task 2's `leaning(lean, up, hands)` in `profile.ts`, and `contactPose`.
- Produces:
  - the rolls' stances at 24°, 31° and 34°;
  - the refitted `swing.json` roll entries (`defaultBackswing`, `defaultSpeed` and their notes);
  - the regenerated roll figures in `CANONICAL_CLEARANCE` and `CANONICAL_APPROACH`.

  Task 5 records all of them.

- [ ] **Step 1: Write the failing test**

In `tests/engine/swing/buildContact.test.ts`, above `describe("the default profile's canonical setups")`, add:

```ts
/** Each preset's default lean in degrees (P2b.2b.2b.1 design §4): the swing presets' unchanged, the rolls' Gugan's. */
const DEFAULT_LEAN: Readonly<Record<StrokeType, number>> = {
    "single-ball": 0,
    drive: 0,
    "stop-ac": -4,
    "stop-gc": 0,
    "half-roll": 24,
    "full-roll": 31,
    "pass-roll": 34,
};
```

Inside that `describe`, add:

```ts
    it.each(STROKE_TYPES)("%s's canonical pose has its default lean (exit criterion 2)", (type) => {
        const world = defaultWorld();
        const pose = contactPose(canonicalSetup(type, { world }), world);
        const lean = DEFAULT_LEAN[type] * DEG;
        if (lean === 0) {
            expect(pose.thetaContact).toBe(0);
        } else {
            expect(Math.abs(pose.thetaContact + lean)).toBeLessThan(1e-12);
        }
    });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/engine/swing/buildContact.test.ts -t "exit criterion 2"`
Expected: FAIL for half-roll, full-roll and pass-roll (15°, 45° and 48°), and PASS for the other four.

- [ ] **Step 3: Set the rolls' leans and their sources**

In `src/engine/swing/profile.ts`:

- Replace the header's stance bullet (the four lines Task 2 wrote, and the bullet's remaining sentences) with:

```ts
 * - Stance: the hands measured from the socket along the shaft, after John Riches, Croquet Technique (Oxford Croquet),
 *   quoted per preset below. The swing presets keep their own leans. The rolls' leans are Don Gugan's measured face
 *   angles (Gugan 4, Table 6), with Riches' angles kept as cues (user decision, 2026-10-08). Each preset is defined by
 *   its lean at its typical contact. Its top hand's position at contact, the stance's input, is derived from that lean
 *   with the reference mallet and ball (P2b.2b.2b.1 design §4). The swing presets keep the top hand at the top of the
 *   handle, 0.805 m from the socket (the sourced 35 in grip less the socket's height at address). The bottom hands and
 *   the grips are the prototype's calibration (proto-two-hands, aeadd4c).
```

- Replace the single-ball comment with:

```ts
        // The top hand fixed at the top of the handle; the bottom hand high and light, a guide only (prototype). Riches
        // has the hands "slightly forward of the mallet head" until the instant of contact; at contact the model's are
        // over the socket (lean 0).
```

- Replace the three roll entries and their comments with:

```ts
        // Riches: "Stand further forward over the balls, with your front toe level with the back of your striker's
        // ball"; "Most players place the bottom hand almost half-way down the handle for this shot, leaving the other
        // hand at the top". His handle "making an angle of about 75 degrees with the ground" (a 15° lean) is a cue,
        // superseded by Gugan 4 Table 6's face angles, 23.5° and 25° (C3H, C10H): 24°, their mean to the table's 1°.
        "half-roll": leaning(24 * DEG, 0, { top: 0.805, bottom: 0.42, gripTension: 1, bottomGrip: 1 }),
        // Riches: "Your lower hand should be placed at least two-thirds of the way down the handle, and your top hand
        // will also need to be moved, to about one-third of the way down the handle"; and, to send the striker's ball
        // further, "move your hands down the handle and stand further forward to increase both the slope of the handle
        // and the fractional distance travelled by the striker's ball". His "approximately 45 degrees between the
        // mallet handle and the ground" is a cue, superseded by Gugan 4 Table 6: 31°, 29°, 33° and 30° (C1F, C3F,
        // C10F, C25F), mean 31°.
        "full-roll": leaning(31 * DEG, 0, { top: 0.61, bottom: 0.3, gripTension: 1, bottomGrip: 1 }),
        // Riches: "The bottom hand should be placed at the very bottom of the mallet shaft for this shot", the handle
        // sloping "at least as much as for a full roll" (48° until P2b.2b.2b.1), a cue superseded by Gugan 4 Table 6:
        // 36°, 34° and 32° (C3P, C10P, C25P), mean 34°.
        "pass-roll": leaning(34 * DEG, 0, { top: 0.45, bottom: 0.09, gripTension: 1, bottomGrip: 1 }),
```

Every quotation above was checked against the fetched Riches page (2026-10-08). Do not reword inside the quotation
marks.

Run: `npx vitest run tests/engine/swing/buildContact.test.ts -t "exit criterion 2"`
Expected: PASS, 7 tests.

- [ ] **Step 4: Refit the rolls' defaults**

Run: `npx --yes tsx scripts/fitStrokeShape.ts > <temp>/after/swing-fit.json 2> <temp>/after/fit-summary.txt`
Expected: it exits 0. If it throws (for example, monotonicity at a roll), stop and report it with the summary.

Run: `cp <temp>/after/swing-fit.json reference/swing.json`
Run: `npx prettier --write reference/swing.json`
Run: `git diff --stat reference/swing.json`
Run: `git diff reference/swing.json`
Run: `diff <temp>/baseline/swing-fit.json <temp>/after/swing-fit.json`

Expected:
- only the half-, full- and pass-roll entries change: `defaultBackswing`, `defaultSpeed`, and the notes that quote
  h0;
- the single-ball, drive and GC-stop entries are byte-identical;
- the AC stop's entries are unchanged, or move only in their last digits.

Read `<temp>/after/fit-summary.txt` and keep it for Task 5. Record any AC-stop change, figure by figure, for Task 5.

Run: `npx vitest run tests/reference/reference.test.ts`
Expected: PASS. Each roll's default plans 3 m/s within 2 % (exit criterion 5).

- [ ] **Step 5: Regenerate the rolls' canonical clearances**

Run: `npx vitest run tests/engine/swing/buildContact.test.ts -t "starts at contact"`
Expected: FAIL for the three rolls, on `CANONICAL_CLEARANCE`. Vitest prints each received value in full.

In `tests/engine/support/shot.ts`, set the three roll entries of `CANONICAL_CLEARANCE` to the received values. Round
them to 0.1 µm, in the existing `21.1109e-3` form.

Cross-check each value against the head's lowest point at a forward lean α, the face's lower rim:
h₀ + (R + START_GAP)·sin α − ρ·cos α, with h₀ = 45.9971 mm, R + START_GAP = 46.0385 mm and ρ = 38.1 mm. It
reproduces the old 45° figure, 51.6104 mm. Each new value must agree with it to 0.1 µm. If one does not, stop: the pose
is not where the spec puts it.

Replace the `CANONICAL_CLEARANCE` comment with:

```ts
/**
 * The head's lowest point above the turf (m) at contact in each canonical setup on the default world, with the default
 * profile. It is measured on prototype aeadd4c's geometry: h₀ = R − sink = 45.997 mm, ρ = 38.1 mm, L = 228.6 mm. The
 * head is pitched by −lean, so the figure is independent of the arc radius. The rolls' figures were re-measured at
 * Gugan's leans (P2b.2b.2b.1). For a forward lean α at `up` 0 the lowest point is the face's lower rim, at
 * h₀ + (R + START_GAP)·sin α − ρ·cos α.
 */
```

Run the same command again.
Expected: FAIL for the rolls on `CANONICAL_APPROACH`, unless a roll's approach equals its new clearance to within
5e-7 m.

In `tests/engine/swing/buildContact.test.ts`, set the three roll entries of `CANONICAL_APPROACH` to the received values
in the same form.
- If each equals the roll's clearance, the comment's "so theirs is at contact" still holds.
- If one does not (its lowest no longer at contact), change the comment to state, from the failure output, which roll
  is lowest before contact.

Run the same command again.
Expected: PASS.

- [ ] **Step 6: Re-measure the trajectory test's comment**

Run: `npx --yes tsx <temp>/scripts/releaseAccel.mts > <temp>/after/release.txt`

Read it against `<temp>/baseline/release.txt`.
- If the baseline reproduced the comment's figures (Task 1 Step 1), set the comment's figures from the new output, to
  the comment's precision: "from ~38 to ~205 m/s²" and "about 20 µm" in
  `tests/engine/swing/trajectory.test.ts`'s "starts at the impact's start…".
- Its "15.5 ms before the release" depends only on the timing and the tempo, so it must be unchanged. If it moved,
  stop and report it.
- If the baseline did not reproduce the figures, add "(measured at P2b.2b.2a's 45° lean)" after "about 20 µm" instead.

- [ ] **Step 7: Run the whole suite**

Run: `npm test`
Expected: PASS.

The roll tests that rest on behaviour must still hold at the new leans:
- `shot.test.ts`: no entry jump and no ball above R + 5 mm; from top to finish (exit criterion 4); the pass roll's
  punch;
- `trajectory.test.ts`;
- `skipFree.test.ts`.

Where one fails, apply "Behaviour figures" under "Global Constraints". Trace the mechanism with the test's setup, and
bring the failure to the user before changing any expectation. The diagnosis (spec, "What the diagnosis found")
predicts that they hold.

- [ ] **Step 8: Cite Gugan 4 Table 6**

Run: `mkdir -p <temp>/fetch/gugan4`
Run: `curl -k -sSL -o <temp>/fetch/gugan4/gugan4.html https://oxfordcroquet.org/tech/gugan4/`
Run: `shasum -a 256 <temp>/fetch/gugan4/gugan4.html`
Run: `grep -n -A 12 "Angle of mallet face" <temp>/fetch/gugan4/gugan4.html`
Run: `grep -n -o "the same as the forward angle of the mallet shaft" <temp>/fetch/gugan4/gugan4.html`

The page is HTML, so a table's cells may sit on the lines after its label; `-A 12` shows them. Several tables have the
label; read Table 6's, whose columns are C3H … C25P.

Expected: Table 6's α row reads 23.5, 25, 31, 29, 33, 30, 36, 34 and 32 (C3H … C25P). The definition reads "the mallet
angle, α, the same as the forward angle of the mallet shaft". If either differs, stop and report it.

In `reference/sources/README.md`:

- If the SHA-256 differs from the Gugan 4 row's `50356f46…`, replace the row's digest with the new one. After the
  "All fetched 2026-10-07 with `curl -k -sSL` …" sentence, add "Gugan 4 was re-fetched 2026-10-08 for P2b.2b.2b.1; its
  digest is that fetch's." The design session's fetch hashed `8468137a…`, so a difference is expected. The page is
  dynamic and the extracted figures are what matter.
- Append this section:

```markdown
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
```

Run: `env LC_ALL=en_GB.UTF-8 grep -nE "^[^|].{120,}$" reference/sources/README.md`
Expected: no output.

- [ ] **Step 9: Run every check**

Run, one per call: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`.
Expected: all pass.

- [ ] **Step 10: Commit**

Message: `Lean the rolls at Gugan's measured face angles`. Stage `src/engine/swing/profile.ts`, `reference/swing.json`,
`reference/sources/README.md`, `tests/engine/support/shot.ts`, `tests/engine/swing/buildContact.test.ts` and, if
changed, `tests/engine/swing/trajectory.test.ts`, by path.

---
### Task 4: The version and the bit-identity gates

Spec §1 exit criteria 3 and 6.

**Files:**
- Modify: `src/engine/simulate.ts` (`ENGINE_VERSION`, line 75)
- Test: `tests/engine/index.test.ts` (line 69), `tests/engine/impact/simulateImpact.test.ts` (lines 22–23)

**Interfaces:**
- Consumes: Task 1 Step 1's baseline files in `<temp>/baseline/`.
- Produces: `ENGINE_VERSION === "0.8.0"`, and the gates' results (the AC stop's drift) for Task 5.

- [ ] **Step 1: Write the failing tests**

- In `tests/engine/index.test.ts`, change `expect(engine.ENGINE_VERSION).toBe("0.7.0");` to `"0.8.0"`.
- In `tests/engine/impact/simulateImpact.test.ts`, change `it("is version 0.7.0", …)` to `it("is version 0.8.0", …)`,
  and its expectation to `"0.8.0"`.

Run: `npx vitest run tests/engine/index.test.ts tests/engine/impact/simulateImpact.test.ts`
Expected: FAIL on the two version checks only.

- [ ] **Step 2: Implement**

In `src/engine/simulate.ts`, set `export const ENGINE_VERSION = "0.8.0";`.

Run: `git grep -n "0\.7\.0" -- src tests`
Expected: no output.

- [ ] **Step 3: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/index.test.ts tests/engine/impact/simulateImpact.test.ts`
Expected: PASS.

- [ ] **Step 4: Run the bit-identity gates**

Run each one per call. Put the long ones in the background, and wait for all of them:

- Run: `env OBSTACLE_STROKES=2000 npx --yes tsx scripts/impactDigest.ts > <temp>/after/digest.txt`
  Then: `cmp <temp>/baseline/digest.txt <temp>/after/digest.txt`
  Expected: identical (no output).
- Run: `npx --yes tsx scripts/shotMix.ts`
  Expected: work units p99 143,084, p99.9 362,050 and max 408,030, exactly.
- Run: `env SLOW_TESTS=1 npm test`
  Expected: PASS.
- Run: `env TYPES=single-ball,drive,stop-gc npx --yes tsx <temp>/scripts/presetDigest.mts > <temp>/after/upright.txt`
  Then: `cmp <temp>/baseline/upright.txt <temp>/after/upright.txt`
  Expected: identical. This covers 81 runs: every θ_c is 0, and every outcome's SHA-256 is unchanged.
- Run: `env TYPES=stop-ac npx --yes tsx <temp>/scripts/presetDigest.mts > <temp>/after/ac.txt`
  Then: `diff <temp>/baseline/ac.txt <temp>/after/ac.txt`
  Expected: the hashes may differ, because the lean round-trips only to rounding. Record for Task 5:
  - the largest |Δθ_c| over the 27 runs (expect a few 1e-17 rad, spec exit criterion 3);
  - the largest relative change in the planned speed;
  - whether any run changed between rejected and accepted. If any did, stop and report it.

If the digest, the shot mix, the slow tests or the upright digest differ, stop. That is a defect in this branch. Find
the task commit that moved it by re-running the gate at each commit, before fixing anything.

- [ ] **Step 5: Run every check**

Run, one per call: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`.
Expected: all pass.

- [ ] **Step 6: Commit**

Message: `Bump the engine to 0.8.0 for the stance from the hands`. Stage the three files by path.

---
### Task 5: The probe, the outcomes and the documents

Spec §6, §7, §9 and §1's closing line. The probes record the stance in the player's terms and re-measure the rolls.
The roadmap gains this phase's decisions, findings and outcomes. The handover was their only other copy, so this task
carries them in full. The earlier specs are amended.

**Files:**
- Modify: `scripts/strokeProbe.ts`, `scripts/swingProbe.ts`
- Create: `docs/superpowers/probes/2026-10-08-p2b2b2b1-strokeProbe.txt`,
  `docs/superpowers/probes/2026-10-08-p2b2b2b1-swingProbe.txt`
- Modify: `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`,
  `docs/superpowers/specs/2026-10-04-p2b2b1-swing-shot-design.md`,
  `docs/superpowers/specs/2026-10-06-p2b2b2a-stroke-shape-design.md`,
  `docs/superpowers/specs/2026-10-08-p2b2b2b1-hands-stance-design.md`
- Temp: `<temp>/scripts/fullRollKnee.mts`

**Interfaces:**
- Consumes: `contactPose` (`buildContact.ts`); Task 3's fit summary and regenerated figures; Task 4's AC-stop drift.
- Produces: the probes' stance lines and output; the documents.

- [ ] **Step 1: Print the stance in the probes' canonical tables**

`scripts/strokeProbe.ts`:

- Change `import { planStroke } from "../src/engine/swing/buildContact";` to
  `import { contactPose, planStroke } from "../src/engine/swing/buildContact";`.
- After `ratio`, add:

```ts
/** A preset's stance in the player's terms (P2b.2b.2b.1 design §6): the top hand, the lean, the point of impact. */
function stanceText(setup: ShotSetup): string {
    const lean = 0 - contactPose(setup, WORLD).thetaContact;
    const hands = setup.profile.stance[setup.stroke.type].handsAhead;
    return (
        `stance: the top hand ${fmt(hands)} m ahead of the ball's centre, lean ${fmt((lean * 180) / Math.PI, 2)}°, ` +
        `impact ${mm(WORLD.ball.radius * Math.sin(lean))} mm above the centre`
    );
}
```

- In `canonical()`, after the `console.log(…)` for each type, add:

```ts
        console.log(`${"".padEnd(11)} ${stanceText(setup)}`);
```

- In the header, after "…and the coaching ratio against P2b.2b.1's;" change the canonical bullet's end to "…and the
  coaching ratio against P2b.2b.1's; then the stance in the player's terms (the top hand ahead of the ball's centre,
  the lean and the point of impact, P2b.2b.2b.1);". Wrap at 120 columns.

`scripts/swingProbe.ts`:

- Add `contactPose` to the import from `"../src/engine/swing/buildContact"`:
  `import { MAX_LEAD, buildContact, contactPose, swingApproach } from "../src/engine/swing/buildContact";`.
- After `ratio`, add the same `stanceText`, with `R` in place of `WORLD.ball.radius`.
- In `canonicalRuns()`, after the second `console.log(…)`, add:

```ts
        console.log(`${"".padEnd(11)} ${stanceText(r.setup)}`);
```

- In the header's canonical bullet, after "…and how often each impact flag fired", add "; then the stance in the
  player's terms (P2b.2b.2b.1)". Wrap at 120 columns.

Run `npx prettier --write scripts/strokeProbe.ts scripts/swingProbe.ts`. Then check line lengths.

- [ ] **Step 2: Run the probes and keep the output**

Run each in the background, one per call:

- `npx --yes tsx scripts/strokeProbe.ts > docs/superpowers/probes/2026-10-08-p2b2b2b1-strokeProbe.txt`
- `npx --yes tsx scripts/swingProbe.ts > docs/superpowers/probes/2026-10-08-p2b2b2b1-swingProbe.txt`

Create `<temp>/scripts/fullRollKnee.mts`. It re-measures the "User play data and checks (2026-10-08)" full-roll line
at knee height, the same runs as that line:

```ts
/** The full roll from knee (0.45 m) on the default 10 s lawn, distances in yards. Throwaway, never committed. */
import { length, sub, type Vec3 } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b1-hands-stance/src/engine/math/vec3";
import { simulateShot } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b1-hands-stance/src/engine/shot";
import type { BallState } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b1-hands-stance/src/engine/types";
import { defaultWorld } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b1-hands-stance/src/engine/world";
import { canonicalSetup } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b1-hands-stance/tests/engine/support/shot";

const WORLD = defaultWorld(10);
const YARD = 0.9144;
for (const intensity of [0, 0.4, 0.8, 1]) {
    const setup = canonicalSetup("full-roll", { world: WORLD, stroke: { backswing: 0.45, intensity } });
    const outcome = simulateShot(setup, WORLD);
    const yards = (id: "blue" | "red"): number =>
        length(sub(outcome.motion.rest[id] as Vec3, (setup.balls[id] as BallState).position)) / YARD;
    const [striker, croqueted] = [yards("blue"), yards("red")];
    console.log(
        `intensity ${intensity}: ${outcome.contactSpeed.toFixed(2)} m/s; croqueted ${croqueted.toFixed(1)} yd, ` +
            `striker ${striker.toFixed(1)} yd, ratio ${(croqueted / striker).toFixed(2)}`,
    );
}
```

Run: `npx --yes tsx <temp>/scripts/fullRollKnee.mts > <temp>/after/fullRollKnee.txt`
Run: `node --version`

- [ ] **Step 3: Compare with the baseline**

Run: `diff <temp>/baseline/strokeProbe.txt docs/superpowers/probes/2026-10-08-p2b2b2b1-strokeProbe.txt`
Run: `diff <temp>/baseline/swingProbe.txt docs/superpowers/probes/2026-10-08-p2b2b2b1-swingProbe.txt`

Read both probe files in full, then the diffs. Put every changed line into exactly one class:

1. **The cost sections:** machine-dependent; ignore them.
2. **The new stance lines.** Each preset's should match spec §4's table:
   - `handsAhead` −0.1603 m (the single-ball, drive and GC stop), −0.2202 (AC stop), +0.1964 (half and full roll),
     +0.1400 (pass roll);
   - leans 0, −4, 24, 31 and 34°;
   - impact 0, −3.2, 18.7, 23.7 and 25.7 mm.

   A difference in the 4th decimal of `handsAhead` goes into the spec's §4 table as a correction.
3. **The rolls' lines:** moved by design. Record them.
4. **The AC stop's off-canonical `up` sweep rows** (its `presets`, `rehit` and `timings` lines): moved by design.
   Record them. Its canonical lines must be unchanged at the printed precision.
5. **The upright presets.** No line may change, except where a sweep solves its backswing through `backswingFor` at an
   `up` other than the sweep's first. There, a rounding-level change is possible from the solver alone (see "Decisions
   made while planning"). Name each such line and why. Any other change is a defect: stop and report it.

Also note the swing probe's reach-filter residue (`cost`, the longest impact, an AC-stop run) against the baseline's.

- [ ] **Step 4: Update the roadmap**

In `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`, make the edits below. The P2 row is one long table
line, so replace each quoted substring exactly.

1. **P2 row, the P2b.2b.2b deliverable.** Replace "**P2b.2b.2b:** the contact laws: the low-speed face–ball law (a roll
   as a carry); the turf's response under load; head–turf stiffness and friction sourcing, and whether turf drag needs
   a ploughing term; the end-weighted head; face presets beyond wood." with:

```markdown
**P2b.2b.2b** is split (decided 2026-10-08; see "P2b.2b.2b decisions and findings (2026-10-08)"), each step its own PR, all before P2b.2b.2c. **P2b.2b.2b.1** (`specs/2026-10-08-p2b2b2b1-hands-stance-design.md`): the stance from the hands. The top hand's position at contact, `handsAhead`, replaces the shaft's lean as the input; the lean follows from the rigid geometry and the point of impact from the lean; the rolls take the face angles Gugan measured (24°, 31°, 34°). **P2b.2b.2b.2:** the strike and the turf. A Hertzian face–ball law with Gugan's measured e(U) and T(U); the ball–turf law under load (a transient hollow and ramp, a speed-dependent restitution, impulsive friction); the rolls' descent through contact, which reopens P2b.2b.2a's "hands arrive with no vertical velocity"; the hand's part in the second contact; the end-weighted head and the market's mallet dimensions, the square head a new collider shape. **P2b.2b.2b.3:** turf strike beyond a graze (decided 2026-10-07): the head in the new turf, a ploughing drag so that a weak stroke is stopped dead, and a grip that breaks under a hard stroke, checked against Gugan's jab stop; it precedes P2b.2b.2c because the AC stop's calibration rests on the head–turf law.
```

2. **P2 row, the old turf-strike item.** Delete " **Turf strike beyond a graze** (decided 2026-10-07; phase to be
   decided): a ploughing drag, so that a weak stroke is stopped dead, and a grip that breaks under a hard stroke."
   (with its leading space). It is now P2b.2b.2b.3.
3. **P2 row, the deferred articulated body.** Replace "a fully articulated body (shoulder, elbow and wrist) beyond
   P2b.2b.1's translating pivot, with the bottom hand's position as the input from which the shaft's lean and the
   push–swing balance follow;" with:

```markdown
a fully articulated body beyond P2b.2b.1's translating pivot: the feet, and the shoulder, elbow and wrist between them and the hands, from which the hands' position would follow (since P2b.2b.2b.1 the top hand's position at contact is the stance's input, and the bottom hand's position follows the rigid shaft);
```

4. **P2 row, exit criteria.** Replace "P2b.2b.2b: the contact laws' analytic cases." with:

```markdown
P2b.2b.2b.1: the stance's analytic cases (the hands–lean round trip within 1e-12 rad, an upright shaft exactly upright at any contact height, the pose); every preset's canonical pose at its default lean; force tables and the upright presets bit-identical; the rolls' canonical setups run from top to finish as P2b.2b.2a's; each roll's refitted default planning 3 m/s within 2 %. P2b.2b.2b.2 and P2b.2b.2b.3: each law's analytic cases, and the rolls stop failing (no chatter, no dead stop, credible distances); the ratios recorded, not gated (user, 2026-10-08).
```

5. **P3 row.** Replace "(plus grip style, weighting and face; home-lawn speed, fitted parameter bounds, versioning;
   which drive fields are fitted is decided here, the stance (hands, grips and lean) and the body being entered)"
   with:

```markdown
(plus grip style, pre-filling the hands, weighting and face, with face presets beyond wood, of which only PTFE has measured data; home-lawn speed, fitted parameter bounds, versioning; which drive fields are fitted is decided here, the stance (the top hand's position at contact and the grips) and the body being entered; how an entered stance behaves when the player's mallet changes, its hands kept and its lean following, or its defaults re-derived per mallet; exporting `stanceLean` and `handsAheadFor` once a reader needs them)
```

6. **"P2b.2b.1 outcomes carried forward", Model limits.** Replace:

```markdown
  - The bottom hand's position is not an input: each preset sets the shaft's lean and the hands' share directly
    until the articulated body. Casting versus planted swings belong to P4.
```

with:

```markdown
  - The bottom hand's position is not an input. Since P2b.2b.2b.1 the stance's input is the top hand's position at
    contact, from which the shaft's lean follows; the bottom hand's position follows the rigid shaft. The feet and the
    body are the articulated body's. Casting versus planted swings belong to P4.
```

7. **"User play data and checks (2026-10-08)", the full-roll line.** Replace the bullet "- **The full roll** (the same
   runs): …the 4 m/s breakdown is P2b.2b.1's carried full-roll anomaly." with the line below. Fill each `<…>` from
   `<temp>/after/fullRollKnee.txt` (intensity 1) and from Step 3's ratios; do not use a probe of your own.

```markdown
- **The full roll** (the same runs, re-measured at Gugan's 31° in P2b.2b.2b.1): from knee at intensity 1 the head
  meets the ball at <speed> m/s, the croqueted ball travels <croqueted> yd and the striker's ball <striker> yd, ratio
  <ratio>. At P2b.2b.2a's 45° the croqueted ball travelled under 10 yd even at intensity 1 from knee, and above about
  4 m/s the striker's ball stopped dead (ratio 35–62, against about 1). <One sentence: what still falls short, and
  whose it is: a distance short of a long hoop is P2b.2b.2c's effort ceiling; a remaining re-catch or throw-back is
  P2b.2b.2b.2's.>
```

8. **New section.** Insert the section below before "## Provisional numbers — where each is confirmed". Fill its last
   bullet from Steps 2–3 and Tasks 3–4. Then wrap every line at 120 columns.

```markdown
## P2b.2b.2b decisions and findings (2026-10-08)

- **The split** (user decisions). P2b.2b.2b, the contact laws, lands in three steps, each with its own spec, plan and
  PR, before P2b.2b.2c:
  - **P2b.2b.2b.1** (`specs/2026-10-08-p2b2b2b1-hands-stance-design.md`): the stance from the hands. The user said a
    player "thinks primarily about hand position and point of impact". The input is `handsAhead`, the top hand's
    horizontal distance ahead of the striker's ball's centre along aim at contact. The lean follows from the rigid
    geometry, and the point of impact from the lean (R·sin α above the centre). The user chose this over taking the
    point of impact as the input, and over "lean now, hands later".
  - **P2b.2b.2b.2:** the strike and the turf. A Hertzian face–ball law with Gugan's measured e(U) and T(U); the
    ball–turf law under load (a transient hollow and ramp, a speed-dependent restitution, impulsive friction); the
    rolls' descent through contact, which reopens P2b.2b.2a's "hands arrive with no vertical velocity"; the hand's
    part in the second contact (Cross); the end-weighted head and the market's mallet dimensions. Modern heads are
    square, a new collider shape.
  - **P2b.2b.2b.3:** turf strike beyond a graze. The head in the new turf, ploughing and the grip breaking, checked
    against Gugan 5's jab stop. It precedes P2b.2b.2c because the AC stop's calibration rests on the head–turf law.
  - P2b.2b.2c is unchanged. Face presets beyond wood move to P3: only PTFE has measured data.
- **The success criterion** of P2b.2b.2b as a whole is qualitative. Each law has its analytic cases, and the rolls
  stop failing: no chatter, no dead stop, credible distances. The ratios are recorded, not gated; P2b.2b.2c
  calibrates them.
- **The rolls' face angles.** Gugan's measured values are taken over Riches' (user decision): half 24°, full 31°, pass
  34°, the means of Gugan 4 Table 6 at its 1° resolution. Riches' 15°, 45° and 48° stay in `profile.ts` as coaching
  cues. Gugan's two-ball drives and stops (Table 5, −8° to −2°) go to P2b.2b.2c as a sourced check.
- **Housekeeping** needed no PR. The lockfile already pinned svelte 5.57.2, typescript-eslint 8.71.1 and vite 8.3.3;
  only a stale `node_modules` lagged. TypeScript 7.0.2 is blocked: typescript-eslint 8.71.1 needs TypeScript
  `>=4.8.4 <6.1.0`, and svelte-check needs `^5 || ^6`. The actions (checkout v7, setup-node v7) and `ubuntu-26.04` are
  current. The repo has no IaC.
- **The diagnosis** (a throwaway probe during design, on P2b.2b.2a's defaults; not kept).
  - **At 45°, the full roll.**
    - Contact 1 is the strike. It throws the head up and back and drives the striker's ball 2.2 mm into the turf.
    - Contact 2, at 5.6 ms, is the turf's linear spring (e 0.5) throwing the ball back into the face at 0.58 m/s.
    - Contacts 3–5 are the hands pushing the head onto the ball at 0.1–0.2 m/s, each bouncing at e 0.817.
    - The carry (26–46 ms) pins the ball, with turf forces up to 176 N and 0.9 N·s of friction. The ball slows from
      1.97 to 1.09 m/s while the head runs on.
    - At the 0.3 m reach the face drops onto the ball. From 3.75 m/s that happens inside the impact: the dead stop,
      ratio 23.6 at 3.75 m/s, 41.8 at 4.5 and 61.6 from knee. Below that speed it happens in phase 2, as the counted
      re-hit.
    - The croqueted ball leaves at 0.78 of the head's speed within 1.3 ms. From knee at intensity 1 the head reaches
      5.96 m/s and the croqueted ball goes 9.6 yd. A 30 yd roll needs a head at about 9.5 m/s: the effort ceiling,
      P2b.2b.2c's.
  - **At Gugan's leans**, the same planned speeds (ratio at 3 m/s / 4.5 m/s / from knee):
    - full roll at 31°: 1.84 / 1.74 / 1.81, with no re-hit, the croqueted ball from knee at 5.56 m/s;
    - pass roll at 34°: 1.01 / 0.90 / 0.94;
    - half roll at 24°: 2.57 / 2.62 / 2.70.

    Gugan's own ratios: full 1.20–1.24, pass 0.94–1.21, half 2.30–2.46.
  - The re-catches (0.1–0.4 m/s) and the turf's throw-back persist at every lean; they are P2b.2b.2b.2's. The model's
    descent at contact is 2–4°, against Gugan's stroke angle β of 6–16° on the rolls.
  - Implicated: the face law and the turf under load. Not implicated: head–turf contact (the head never touches the
    turf in these rolls) and the faces. The end-weighting is secondary.
- **Sources for P2b.2b.2b.2 and P2b.2b.2b.3** (cited, not mirrored; the Oxford Croquet pages fetched with `curl -k`).
  - **The roll's contact.**
    - The CA's Project Croquet Dynamics (https://croquet.org.uk/?d=1475): 30–58 ms of apparent contact on rolls.
    - Gugan 4 §10 (https://oxfordcroquet.org/tech/gugan4/): a 1 ms strike, then a second contact of about 5 ms. In
      rolls "the mallet makes an almost immediate second impact which may last for several milliseconds, and over
      this time controls the speed of the ball". The ground gives the spin.
    - Hall (https://oxfordcroquet.org/tech/hall/): over 7 ms on a full roll.
    - Cross, Eur. J. Phys. 38 014001 (2017) (https://oxfordcroquet.org/tech/cross1/): seven taps; "the ball sticks to
      the mallet", nudged at the mallet's speed. Cross puts it down to ground friction and the hand and arm.
    - Riches, on the half roll: "hit DOWNWARD on the striker's ball", the ball "squeezed forward".
    - Gugan 5 (https://oxfordcroquet.org/tech/gugan5/): a pass ratio of 0.83 from speed alone; ratios near 1 come
      from the angle.
  - **The face.** Gugan, Am. J. Phys. 68, 920 (2000), DOI 10.1119/1.1285850 (https://oxfordcroquet.org/tech/gugan/),
    on wood:
    - T falls from 0.97 to 0.79 ms over 2.19–5.50 m/s, T ∝ U^−0.23.
    - 1 − e² = 0.213 + 0.077·U^0.4, so e tends to about 0.89 at low speed. A speed-dependent e alone cannot stop the
      chatter.
    - Cross: the bottom hand near the head gives "a large increase in M" and lowers e.
  - **The turf under load.**
    - Gugan 4 Table 4(b): the distance to maximum penetration is 3.5–18 mm, as the ball "rolls along its transient
      pit". Impulsive sliding µ ≈ 1.0, double Hall's 0.48.
    - Penner, Can. J. Phys. 80, 931 (2002) (http://raypenner.com/golf-run.pdf; golf): an equivalent tilted plane,
      θc 15.4°; e = 0.510 − 0.0375|v| + 0.000903v².
    - Cross, Eur. J. Phys. 42 065006 (2021): the indentation forms a ramp.
    - Biber, Bristol PhD (2023): a nonlinear elasto-plastic turf.
  - **Head–turf:** no measurements exist.
    - Gugan 5's jab: the second tap at 0.400U against 0.463U unrestricted (0.295U at best).
    - Law forms: Katsuragi and Durian, Nature Physics 3, 420 (2007), DOI 10.1038/nphys583; Reece's earthmoving
      equation.
  - **End-weighting.**
    - Russ (https://oxfordcroquet.org/tech/russ/), head and shaft about the shaft's axis, kg·cm²: traditional round
      9" 33.4, rectangular 12" 37.6, RPM 11" 92 and 104, Pidcock 2000 146, Pidcock 3000 172.
    - Towlson (https://oxfordcroquet.org/tech/towlson/).
    - The engine's solid cylinder gives 47; JC Croquet claims about 150.
  - **Faces.**
    - Gugan 1 (https://oxfordcroquet.org/tech/gugan1/): PTFE's e falls about twice as fast as wood's.
    - Plummer: metal faces make rolls harder (anecdote).
- **The mallet survey** (makers' claims; Plummer's weighings are the only independent figures).
  - Heads run from 9" to 13.0" (the Terminator, 330 mm), mostly 10–12". Faces are mostly square, 50–64 mm; round heads
    are legacy only.
  - Heads weigh 0.87–1.05 kg (stated) and 0.99–1.04 kg (measured). Whole mallets weigh 1.10–1.55 kg, and overall
    length runs 30–42".
  - Against `mallet.json`: the head-length bound (9–12") and the shaft bound (32–36") are too narrow, and the round
    76 mm head is off-market. The head-mass bounds are fine.
  - The user's 42" shaft is within the market. Their 13.5" head is beyond any listed model, so bespoke.
  - Pages: https://oxfordcroquet.org/equip/mallets/, https://oxfordcroquet.org/equip/makingmallets/,
    https://www.woodmallets.com/croquet-mallet-options/, https://terminatormallets.com/uk-pricelist/,
    https://invictusmallets.com/pages/compare-mallets, https://croquetdev.com/mallets.html,
    https://www.croquet.org.uk/?p=games/tech/ChoosingMallet.
- **P2b.2b.2b.1 outcomes.** Measured by `scripts/strokeProbe.ts` and `scripts/swingProbe.ts` (node <version>) on the
  default world and the default profile's canonical setups. The raw output is in
  `docs/superpowers/probes/2026-10-08-p2b2b2b1-strokeProbe.txt` and `…-swingProbe.txt`. Observations, not gates.
  - **The stance**, per preset (the probes' stance lines): the top hand ahead of the ball's centre, the lean and the
    point of impact.
  - **The fit**, from Task 3's summary: the rolls' h₀ and default backswings, each planning 3.0000 m/s. The swing
    presets' entries are byte-identical; give the AC stop's change, if any.
  - **Bit-identity:**
    - the impact digest (with 2000 obstacle strokes) is identical;
    - the shot mix gives work units p99 143,084, p99.9 362,050 and max 408,030;
    - `SLOW_TESTS=1` passes;
    - the upright presets' full-precision digest is identical over 81 runs on fixed backswings;
    - the AC stop's drift: the largest |Δθ_c| and the largest relative change in planned speed over its 27 runs,
      and its canonical figures at the printed precision;
    - the reach-filter residue.
  - **The rolls**, against P2b.2b.2a's:
    - the ratios over 2–4 m/s;
    - the canonical runs (downswing, lowest clearance, impact, finish, the head at the finish, ratio);
    - the late re-hit's crossings;
    - the striker's face intervals (the re-catches);
    - the cap and flag tallies and rejections of the `presets` sweep;
    - the 29.1.6.1 possible faults.
  - **The AC stop's and the rolls' off-canonical `up` sweep rows**, re-recorded. Under fixed hands the lean follows the
    contact height (P2b.2b.2b.1 design §3.3).
  - **Test figures:** the rolls' new `CANONICAL_CLEARANCE` and `CANONICAL_APPROACH`, and whatever Task 3 Step 6
    re-measured.
  - **What still waits for P2b.2b.2b.2 and P2b.2b.2b.3:** say which of the diagnosis's failures remain.
  - **Public:** `SwingStance.handsAhead` replaces `lean` in `src/engine/index.ts`'s types (`ENGINE_VERSION` 0.8.0).
```

- [ ] **Step 5: Amend the swing spec (spec §7)**

In `docs/superpowers/specs/2026-10-04-p2b2b1-swing-shot-design.md`:

1. After the paragraph that begins "**Amended 2026-10-07 (P2b.2b.2a).**" and ends "…relative to the hands after its
   check.", add:

```markdown
**Amended 2026-10-08 (P2b.2b.2b.1; user decisions).**

- **The stance's input** is the top hand's position at contact, `handsAhead`: its horizontal distance ahead of the
  striker's ball's centre along aim. The shaft's lean follows from the rigid geometry (`stanceLean`), and the point of
  impact on the ball follows from the lean (P2b.2b.2b.1 design §3).
- **The rejection** of |`lean`| ≥ 90° becomes `handsAhead` outside (−D, A) (its §3.4).
- **The rolls' default leans** are Gugan's measured face angles, 24°, 31° and 34° (Gugan 4 Table 6). Riches' 15°, 45°
  and 48° are kept as coaching cues.
- **The hands are derived:** each preset's `handsAhead` comes from its lean, with the reference mallet and ball (its
  §4).

§5.1–§5.4 and §7 are updated where they state the stance.
```

2. In §5.1, replace the `SwingStance` comment and interface with Task 2's new `SwingStance` block, without the
   `export` keyword (as §5.1 writes it).
3. In §5.2, replace step 2, "2. **Contact angle.** θ_c = −`lean`: positive is a rising strike, negative a descending
   one.", with "2. **Contact angle.** θ_c = −lean, the lean the top hand's position gives (`stanceLean`, P2b.2b.2b.1
   design §3.2): positive is a rising strike, negative a descending one." Wrap at 120 columns, indenting continuation
   lines by three spaces.
4. In §5.3, replace "|`lean`| ≥ 90°;" with "`handsAhead` outside (−D, A) for the stroke's `top` and `up` (P2b.2b.2b.1
   design §3.4);". Then rewrap the paragraph at 120 columns.
5. In §5.4's first paragraph, replace "The hand positions and leans follow Riches on the 0.9144 m shaft, measured from
   the socket;" with "The hand positions follow Riches on the 0.9144 m shaft, measured from the socket, and the rolls'
   leans Gugan's measured face angles (P2b.2b.2b.1);". Then rewrap the paragraph.
6. Replace §5.4's stance table (the one headed "| Preset | lean (°) | top (m) | …") with the table below. Use Step 3's
   printed `handsAhead` where it differs in the 4th decimal.

```markdown
| Preset | lean (°) | handsAhead (m) | top (m) | bottom (m) | gripTension | bottomGrip |
|---|---|---|---|---|---|---|
| single-ball | 0 | −0.1603 | 0.805 | 0.70 | 1 | 0.1 |
| drive | 0 | −0.1603 | 0.805 | 0.60 | 1 | 0.25 |
| stop-ac | −4 | −0.2202 | 0.805 | 0.45 | 0.1 | 0.1 |
| stop-gc | 0 | −0.1603 | 0.805 | 0.45 | 1 | 1 |
| half-roll | 24 | +0.1964 | 0.805 | 0.42 | 1 | 1 |
| full-roll | 31 | +0.1964 | 0.61 | 0.30 | 1 | 1 |
| pass-roll | 34 | +0.1400 | 0.45 | 0.09 | 1 | 1 |
```

7. Replace §5.4's "**Hands.**" paragraph with:

```markdown
**Hands.** The swing presets keep the top hand at the top of the handle (0.805 m from the socket, from the sourced
35 in grip). Riches places the half roll's bottom hand "almost half-way down the handle for this shot, leaving the
other hand at the top" (bottom 0.42 m). For the full roll, "Your lower hand should be placed at least two-thirds of the
way down the handle, and your top hand will also need to be moved, to about one-third of the way down the handle"
(top 0.61 m, bottom 0.30 m). For the pass roll, "The bottom hand should be placed at the very bottom of the mallet
shaft for this shot" (top 0.45 m, bottom 0.09 m). The rolls' leans are Gugan's measured face angles: 24°, 31° and 34°
(Gugan 4 Table 6, the means at its 1° resolution; user decision, 2026-10-08). They supersede Riches' "about 75 degrees
with the ground" (a 15° lean), "approximately 45 degrees", and the pass roll's slope "at least as much as for a full
roll" (48° until P2b.2b.2b.1); `profile.ts` keeps these as coaching cues. Each preset's `handsAhead` is derived from
its lean with the reference mallet and ball (P2b.2b.2b.1 design §4).
```

8. Replace §5.4's "**Geometry.**" paragraph with the paragraph below. Take the three figures from Task 3's
   `CANONICAL_CLEARANCE`, in mm to one decimal.

```markdown
**Geometry.** For a forward lean α, the head's lowest point at contact is its face's lower rim. It lies
h₀ + (R + `START_GAP`)·sin α − (`up` + ρ)·cos α above the turf, where h₀ is R less the static sink. At `up` 0 it is
<half>, <full> and <pass> mm for the rolls' 24°, 31° and 34° (51.6 mm at P2b.2b.1's 45°). That is geometry, not a
tunable.
```

9. In §7, replace "The stance's hand positions and leans are profile values sourced to Riches in `profile.ts`'s
   comments, not reference keys;" with "The stance's hand positions (Riches) and leans (the rolls' from Gugan 4 Table 6,
   P2b.2b.2b.1) are profile values sourced in `profile.ts`'s comments, not reference keys;". Then rewrap the paragraph.

- [ ] **Step 6: Amend the stroke-shape spec (spec §7)**

In `docs/superpowers/specs/2026-10-06-p2b2b2a-stroke-shape-design.md`:

- After the "**Findings (2026-10-07, implementation and probe).**" list, before "## 1. Goal and exit criteria", add:

```markdown
**Amended 2026-10-08 (P2b.2b.2b.1).** The rolls' defaults (§5.3) are refitted at Gugan's measured leans, 24°, 31° and
34°, by `scripts/fitStrokeShape.ts`, unchanged. The swing presets' entries are byte-identical (P2b.2b.2b.1 design §4).
```

- At the end of §5.3, after "…it is not exported.", add the sentence "Since P2b.2b.2b.1 the rolls are fitted at Gugan's
  leans (its §4)."

- [ ] **Step 7: Record this plan's decisions in the phase spec**

In `docs/superpowers/specs/2026-10-08-p2b2b2b1-hands-stance-design.md`, after the "**What the diagnosis found**"
paragraph and before "## 1. Goal and exit criteria", add the note below. Its last line is one sentence for each user
decision or unexpected finding from the run; drop that line if there were none.

```markdown
**Amended 2026-10-08 (plan and implementation).**

- **Exports.** `StanceGeometry`, `handsAheadFor` and `stanceLean` are exports of `buildContact.ts`, not of the
  engine's API (§2).
- **Order.** The mechanism landed first, with the old roll leans round-tripped. The rolls then moved to Gugan's
  leans, with the refit.
- **Bit-identity.** The upright presets' bit-identity is checked by a full-precision digest on fixed backswings. The
  probes' sweeps solve their backswing through `backswingFor`, whose memo now keys on `up`, so a swept run can move at
  rounding level from the solver alone (§1 exit criterion 3, §5.2).
- **Test support.** `testProfile` takes a lean or a `handsAhead`, not both.
- <One sentence for each user decision or finding from the run.>
```

If Step 3 corrected a `handsAhead` figure, correct §4's table to match.

- [ ] **Step 8: Check the documents**

For each markdown file touched, run `env LC_ALL=en_GB.UTF-8 grep -nE "^[^|].{120,}$" <file>`.
Expected: no output.

Then check that no fill-in is left:

Run: `git grep -n -E "<(speed|croqueted|striker|ratio|version|half|full|pass|One sentence)" -- docs/superpowers`
Expected: hits in this plan only.

- [ ] **Step 9: Run every check**

Run, one per call: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`.
Expected: all pass.

- [ ] **Step 10: Commit**

Message: `Probe the stance from the hands and record its outcomes`. Stage by path:
- the two scripts;
- the two probe files;
- the roadmap;
- the three specs.

---
## After the last task

1. **Review.** Run the whole-branch review with `superpowers:requesting-code-review`, then
   `superpowers:finishing-a-development-branch`.
2. **Push and open the PR.**
   - The PR body begins with a short non-technical summary. This is the first of three steps of P2b.2b.2b (the
     contact laws): the player now sets a stroke by where the hands are at contact, and the rolls take the face angles
     measured from the Croquet Association's high-speed video. Those angles alone end the full roll's dead stop.
   - Then it lists the changes, links the spec and this plan, and quotes the exit criteria with their evidence.
   - The user merges.
3. **After the merge.** Tidy from the main checkout, retire the handover (`status: consumed`), and offer `/handover`
   before brainstorming P2b.2b.2b.2.
