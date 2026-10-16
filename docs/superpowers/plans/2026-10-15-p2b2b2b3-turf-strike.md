# P2b.2b.2b.3 — Turf Strike Beyond a Graze: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The head ploughs through the turf by its angle of attack and depth: a shallow graze costs a fraction of its
speed, a weak stroke is stopped dead, and a head biting in meets resistance past the hands' limit, where the hands
saturate. The jab becomes a player input, checked against Gugan 5.

**Architecture:**

- `headTurf.ts` (new) holds the head–turf law. Each column of the turf bed's 2 mm world lattice under the head is
  elastic–plastic (bearing, with a set). The bearing columns plough in strips across the motion. One horizontal
  Cundall–Strack spring carries the ploughing and the sole's friction. The law's state lives on the lattice.
- `contacts.ts` gains the head's underside over a column (`headUnderside`) and its horizontal extent (`headExtent`),
  for the cylinder and the rounded box. `headTurfContact` goes.
- `track.ts` clips each hand's force to `gripLimit`. Where a hand holds a position spring its anchor slides, and the
  slid offset persists in `GripState`.
- `integrate.ts` calls the law in the impact and the follow-through, and raises `turf-yield`, `grip-limit` and
  `impact-head-stopped`. Its settle test lets a head at rest in the turf end the impact.
- `SurfaceProps` gains `turfYield` and `turfMatStrength` and loses `turfStiffness` and `turfRestitution`.
  `ShotSetup.stroke.jab` deepens the planned dip.
- The tasks land in the spec's ratchet order (§7.2):
  - the baseline and the sources;
  - the hands' limit;
  - the head's underside;
  - the law, unwired;
  - the law wired in;
  - the jab;
  - the probe, the regimes and the jab check;
  - the user's pre-flight gate;
  - the gates and the version;
  - the probes and the documents.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), Vitest, ESLint, Prettier. No
new dependencies. `npx --yes tsx` runs the scripts.

**Spec:** `docs/superpowers/specs/2026-10-14-p2b2b2b3-turf-strike-design.md`. Read all of it, especially "Decisions",
§4 (the law), §5 (the hands' limit), §7 (testing) and §8 (the gate). Also read:

- **Roadmap:** `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`: the P2 row, "P2b.2b.2b decisions and
  findings (2026-10-08)" (Gugan 5's jab) and "P2b.2b.2b.2c outcomes (2026-10-13)".
- **The previous plan:** `docs/superpowers/plans/2026-10-13-p2b2b2b2c-mallet.md`, for the conventions this plan keeps
  (the baseline, the gate, the documents).
- **The laws spec:** `docs/superpowers/specs/2026-10-09-p2b2b2b2a-strike-turf-laws-design.md` §4 (the turf bed, whose
  lattice, modulus, recovery and tangential law the head now shares).

**Decisions made while planning.** Task 10 folds each into the spec's amendment note. Decisions 1 and 2 change the
spec's law; the user ruled them on 2026-10-15, before the plan was written.

1. **The ploughing depth is measured below the column's entry floor** (user ruling, 2026-10-15). Spec §4.3 measures
   it as the column's elastic deflection e. But yield caps e at p_y/k_w, about 1.48 mm on the default lawn, so the
   ploughing could never pass about 15 N across the face. That contradicts §4.5's sizes and §7.1 case 2 above yield.
   Each column instead keeps the floor it had when the head arrived over it: 0 in fresh turf, and −s in a furrow the
   head has left. A strip's ploughing depth is its deepest column's depth below that entry floor. Fresh turf then
   ploughs at full depth, and a head moving back along its furrow ploughs only below the floor it left, as §4.3
   intends.
2. **The horizontal spring carries the bed's tangential damping** (user ruling, 2026-10-15). Spec §4.3 says "with no
   damping", but an undamped spring keeps a stuck head oscillating, so §7.1 case 3 could never come to rest. Its law is
   bedLoad's: k_t = (2/7)·k_w·h²·n and c_t = √(2/7)·k_w·τ_r·h²·n. The function is contactLaw.ts's `tangentialForce`,
   with friction 1 and the "normal" F_cap, and `carrySpring` carries the spring between steps.
3. **The strips' direction.** The strips lie across the direction of the carried spring plus this step's slip,
   measured at the bearing's centre of pressure. Where both are zero they lie along aim. The spring then advances by
   the slip at the resistance's centre, where it acts. This breaks the spec's circularity: the centre depends on the
   strips, and the strips on the slip.
4. **A strip's point is its deepest ploughing column's underside point.** The first in visit order wins a tie.
5. **The strips are summed in mirror pairs** (k, −k − 1), in ascending p = max(k, −k − 1), as the bed sums its
   columns. A stroke mirrored across y = 0 then gives a mirrored resistance to the bit, wherever the strip boundaries
   fall short of a column's centre.
6. **The pair is closed while any column bears** (e > 0). A column bears whatever its pressure, which is clamped at 0.
   That closure drives the timeline, the slide, the settle test and the entry guard. The timeline's and the peak's
   depth is the deepest bearing column's δ, and the entry guard's closing speed is that column's e′.
7. **A centre of pressure with no bearing force** (every bearing column at pressure 0) is the deepest column's point.
8. **The head's columns** are visited over its horizontal extent, padded one cell as `span` pads a ball's footprint.
   For a box the extent is Σ_i |R_ki|·h_i over the full box's half-extents (L/2, h_y, h_z), which bound the rounded
   box; for a cylinder it is (L/2)·|a_k| + r·√(1 − a_k²).
9. **The rounded box's underside** is exact. A box is the union of three slab-grown boxes, twelve edge cylinders and
   eight corner spheres. The underside is the entry into the box grown by e on every axis wherever that entry lies on
   a flat face; on an edge or a corner it is the lowest entry over the union.
10. **The hands' slid offset is a world-frame vector**, as the chain's preload is (track.ts `holdChain`). It shifts
    the hand's anchor on the shaft: the firm grip's grip point, or carry mode's anchor of the palm and finger springs.
    It slides only where the hand holds a position spring: the firm grip with no downswing or `gripped`, and carry
    mode's chain. Damper-only branches clip.
11. **`HandLoad.saturated`** names the first hand that saturated in the step, the top hand if both did. `grip-limit`
    is raised once per impact; `follow-grip-limit` once per follow-through.
12. **`TEST_GRIP_LIMIT` is 1e5 N** in the test hands and `testProfile`: far above any test hand, so that the tests
    written before the limit keep their figures. The limit's own tests set theirs.
13. **`impact-head-stopped`** fires when no face contact has closed and the head has been at rest for `RELEASE_STEPS`
    consecutive steps. At rest means the spring sticks and the head's centre moves horizontally at under
    `HEAD_REST_SPEED`, 1 mm/s. It overrides the drive window and the look-ahead.
14. **The follow-through keeps the impact's bed**: the sets, the entry floors and the spring. The timeline, the peak and
    the slide stay the impact's, as now.
15. **`turfStiffness` and `turfRestitution` have no reader** but `simulateImpact.ts` and `world.ts` (searched while
    planning). Their reference entries `contact.json`'s `ballTurfStiffness` and `friction.json`'s
    `ballTurfRestitution` are retired with them. `lawFromStiffness` stays in contactLaw.ts, unread by the head.
16. **N_c is `contact.json`'s `turfPloughFactor`**, exported as `PLOUGH_FACTOR` from headTurf.ts.
    `HEAD_TURF_FRICTION` moves from simulateImpact.ts to headTurf.ts.
17. **The head's turf is validated under the head**: bedModulus, bedRecovery, turfYield and turfMatStrength must each
    be positive and finite there.
18. **The jab** deepens `arc.dip.depth` to `handDrop + (jab ?? 0)`. At 0 that is `handDrop` to the bit, since
    `handDrop` is +0 or positive.
19. **The regimes' and the late jab's setups** (spec §7.4) are found by Task 7's probe over a fixed candidate grid,
    then pinned in the tests. If no candidate gives a regime, the task stops for the user.
20. **U and the second tap** (spec §7.3) are read on the face region's intervals (`headRegions["face/blue#face"]`),
    from the head's state at each interval's start.
21. **The cost figures** (spec §9) come from `ImpactSnapshot.headTurfColumns`, the columns visited in the step, which
    is present whenever the snapshot carries `headTurf`.

## Global Constraints

- **Formatting.**
  - Use 4-space indentation, a 120-column limit, LF line endings and UTF-8.
  - Check line lengths with `env LC_ALL=en_GB.UTF-8 grep -nE "^[^|].{120,}$" <file>`. Table rows in markdown are
    exempt, and roadmap line 29 is a known pre-existing hit.
  - Run `npx prettier --write` on every code file and JSON file you touch. `npm run format:check` must pass.
  - `.prettierignore` lists `docs/`, so wrap markdown by hand.
  - Prettier does not re-wrap comments or strings. Wrap any comment over 120 columns by hand, and split any template
    literal over 120 columns with `+`.
- **Engine purity.** `src/engine/**` is pure and deterministic: no DOM, no time of day, no randomness.
- **Determinism lint.**
  - Engine code uses only IEEE-exact operations: `+ − * /`, comparisons, `Math.sqrt`, `Math.abs`, `Math.min`,
    `Math.max`, `Math.round`, `Math.floor`, `Math.ceil`, the constant `Math.PI`, and the engine's own `sinCos`,
    `atan2`, `ln`, `exp` and `pow` (`src/engine/math/elementary.ts`).
  - Engine code has no `Math.sin`, `Math.cos`, `Math.atan2`, `Math.asin`, `Math.exp`, `Math.log`, `Math.pow`,
    `Math.hypot` or `Math.sign`, and no `**`. `npm run lint` enforces it.
  - Tests and scripts may use any `Math` function.
- **Style.**
  - No non-null assertions (`!`); the repo style is `x as T` after indexing.
  - Braces on every `if`.
  - Write `0 - x` rather than unary minus in engine arithmetic.
  - Exported functions carry a header comment. A constant that is not physical says "Numerical, not physical" and
    gives its reason.
  - Use `import type` for type-only imports.
  - Argument lists go all on one line, or each argument on its own line. Use one per line when there are more than
    three, or when the line would pass 120 columns.
- **Units.** SI: m, s, kg, N, Pa, rad. The spec's millimetres and kPa are for reading only.
- **Vocabulary.** "Split", "ratio" and "cut" keep their croquet meanings only. The head's drag through the turf is
  "ploughing", its depth the "ploughing depth"; Reece's literature calls it cutting. The push/pendulum distribution is
  the "phasing". "Heel" is the head's back lower edge.
- **Engine version.** `ENGINE_VERSION` becomes `"0.12.0"` (Task 9).
- **The ratchet** (spec §7.2, exit criterion 2):
  - after Tasks 2 and 3, the preset digest, `impactDigest`, `shotMix` (times dropped) and `impactProbe` (times dropped)
    are bit-identical to Task 1's baseline;
  - after Task 5, `impactDigest`, `impactProbe` and `shotMix` are unchanged, and the preset digest moves only on runs
    whose head meets the turf;
  - after Task 6, everything is bit-identical to Task 5's.
  - Code below a new threshold keeps today's arithmetic. Branch on the threshold or on null rather than adding a zero
    term: `x + 0` turns −0 into +0, and the digest keeps the sign of zero.
- **The ratchet's runs** run in the background. They must finish, and match, before that task's commit. Check with
  `pgrep -fl tsx`, which must print no digest or probe process before you commit. Each output file must be non-empty.
- **Slow tests** run only when `SLOW_TESTS` is set.
- **RED steps.** Vitest does not type-check. Where a test uses a missing export or field, the RED run shows runtime
  failures (`… is not a function`, an assertion on `undefined` or `NaN`), and `npm run check` shows the type errors.
- **Behaviour figures.**
  - A test that rests on model behaviour carries its reasoning in a comment.
  - Where a test fails, trace the mechanism (the test's own setup, then the probe) before changing an expectation.
  - Fix the code if it departs from the spec or this plan's decisions.
  - A re-baselined figure gets the comment "P2b.2b.2b.3: the turf strike (was <old>)".
  - A changed expectation that the spec does not predict goes to the user at the gate, and is folded into the spec's
    amendment note (Task 10).
- **Circularity.** Every figure of the law is a published measurement of turf, soil or the hand, or a labelled
  placeholder. Nothing is tuned to a coaching ratio, to Gugan's jab or to the user's play. Gugan's jab is a held-out,
  banded check (spec §7.3); the coaching ratios are recorded, not gated.
- **Process.** Follow the plan's steps. There are no side probes during the run: figures come from the steps that
  produce them. The pre-flight gate (Task 8) **always stops for the user**, whatever it shows.
- **Bash.**
  - One command per call: no `&&`, `||`, `;`, `$(…)` or subshells.
  - Redirecting a script's output to a file with `>` or `2>` is allowed.
  - Never use a shell command string (`bash -c`, `node -e`). Use `python3 -I` rather than `jq` with `test(`.
  - Oxford Croquet pages need `curl -k`.
- **The temp directory.**
  - `<temp>` in a Run line is the executing session's literal temp path (its `CLAUDE_TEMP_DIR`, e.g.
    `/tmp/claude-<session id>`), written out in full: worktree sessions refuse `$CLAUDE_TEMP_DIR`. A subagent is
    given this literal path in its prompt.
  - Throwaway scripts go in `<temp>/scripts/`, their outputs in `<temp>/baseline/`, `<temp>/after/` and
    `<temp>/sources/`.
  - `<date>` in a path or heading is the day the step runs, as YYYY-MM-DD.
  - Throwaway scripts import the worktree by absolute path:
    `/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b3-turf-strike/…`.
- **Sources.** Cite, don't mirror (repo rule). Record the URL, the date, the SHA-256 of the fetched file and short
  quotes in `reference/sources/README.md`, and commit no fetched file.
- **Commits.**
  - Write a short imperative sentence (repo style), signed.
  - Write the message to a fresh file `<temp>/msg-task<N>.txt` and commit with `git commit -F <that path>`.
  - Check with `git log -1 "--format=%G? %h"`. Expect `G`; quote the format, as zsh globs `?`. If signing refuses,
    leave the change staged and report it.
  - Stage files by explicit path. Never use `--no-verify`, `-c commit.gpgsign=false` or bare `git stash`.
- **Checks after every task:** `npm test`, `npm run lint`, `npm run check` and `npm run format:check`, one per call,
  all pass. The baseline is 1109 passed and 4 skipped.
- **Known noise.** The editor's TypeScript LSP may report spurious "Cannot find module/name" diagnostics. `npm run
  check` is the source of truth.
- **Worktree.**
  - All work happens in `/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b3-turf-strike`, on branch
    `worktree-p2b2b2b3-turf-strike`, rebased on `main` at bae0966 (the typescript-eslint bump, PR #27).
  - The branch is local only. `node_modules` is installed (`npm ci`, 2026-10-15).

## Review Focus

The spec implies each input below, but none of its listed tests exercises it. The task that owns each one pins it with
a test.

1. **A head exactly on the plane.** Its lowest point at z = 0, or a column whose underside is exactly 0, is touching,
   not submerged. It must give no load, no NaN, and a reset spring. Pinned in Task 4 ("gives nothing for a head
   exactly on the turf plane").
2. **A vertical line parallel to a body axis, or through a sharp box** (u_i = 0; e = 0). The slab and quadratic spans
   must not divide by zero or leak a NaN. A line that misses gives Infinity, and one through a sharp box's edge gives
   the flat entry. Pinned in Task 3 ("finds the underside of a level head and of a sharp box exactly, with no NaN on
   axis-parallel lines").
3. **A head pressed straight down.** With no horizontal slip and no spring, the trial is zero. The strips must lie
   along aim, with no NaN in the direction and no resistance. Pinned in Task 4 ("orients the strips along aim while
   the trial is zero").
4. **Both hands saturating in one step, and a bad `gripLimit`.** The event names the top hand. A `gripLimit` of 0, a
   negative one, NaN or Infinity is rejected by both validations. Pinned in Task 2 ("names the top hand when both
   saturate" and the validation rows).
5. **A bad `jab`.** A negative or non-finite jab is rejected, and so is a non-zero jab in carry mode, but a carry
   stroke's explicit jab of 0 is accepted and unchanged to the bit. Pinned in Task 6 ("rejects a negative,
   non-finite or carry-mode jab, and accepts a carry stroke's jab of 0").

---
## File Structure

| Path | Change |
|---|---|
| `reference/sources/README.md` | This phase's sources (Task 1) |
| `reference/contact.json`, `src/reference/index.ts` | `gripLimit` (Task 2); `turfYield`, `turfMatStrength`, `turfPloughFactor` (Task 4); `ballTurfStiffness` retired (Task 5) |
| `reference/friction.json` | `ballTurfRestitution` retired (Task 5) |
| `src/engine/impact/types.ts` | `Hands.gripLimit`, `HandName`, the `grip-limit` event (Task 2); `HeadTurfLaw` (Task 4); the other events (Task 5) |
| `src/engine/impact/track.ts` | `GRIP_LIMIT`, the hands' limit, `GripState`'s offsets, `HandLoad.saturated` (Task 2) |
| `src/engine/impact/contacts.ts` | `headExtent`, `headUnderside` (Task 3); `headTurfContact` removed (Task 5) |
| `src/engine/impact/turfBed.ts` | `mirrorPairsOver`, `cellKey` exported (Task 3) |
| `src/engine/impact/headTurf.ts` | New: the law (Task 4) |
| `src/engine/impact/integrate.ts` | `grip-limit` (Task 2); the law wired in, the settle test, the new events and flags (Task 5) |
| `src/engine/impact/simulateImpact.ts` | `validateTrack`'s gripLimit (Task 2); `headTurfLaw`, the head's turf validation (Task 5) |
| `src/engine/types.ts`, `src/engine/world.ts` | `SurfaceProps`' new fields (Task 4); the old ones removed (Task 5) |
| `src/engine/swing/types.ts`, `buildContact.ts`, `profile.ts` | `body.gripLimit` (Task 2); `stroke.jab` (Task 6) |
| `src/engine/swing/trajectory.ts` | Its `FollowFlag` comment (Task 5) |
| `src/engine/simulate.ts` | `ENGINE_VERSION` 0.12.0 (Task 9) |
| `tests/engine/support/impact.ts`, `support/shot.ts`, `support/fixtures.ts` | `TEST_GRIP_LIMIT` (Task 2); `TEST_SHARP`, `testHeadTurf`, `TEST_TURF`'s fields (Tasks 3–5) |
| `tests/engine/impact/gripLimit.test.ts` | New: the hands' limit (Task 2) |
| `tests/engine/impact/underside.test.ts` | New: the head's underside and extent (Task 3) |
| `tests/engine/impact/headTurfLaw.test.ts` | New: the law alone, §7.1 cases 1–4 and 6 (Task 4) |
| `tests/engine/impact/headTurf.test.ts` | Rewritten for the law in the integrator (Task 5) |
| `tests/engine/turfStrike.test.ts` | New: the regimes, the late jab's flags, Gugan's jab (Task 7) |
| Existing tests | Migrated (Tasks 2, 4, 5); re-baselined (Task 5); the AC stop's turf tests moved onto the box (Task 6) |
| `scripts/turfStrikeProbe.ts` | New: the regimes' search, the jab sweep, the bounds, the cost (Task 7) |
| `scripts/swingProbe.ts` | Its tallied flags (Task 10) |
| `docs/superpowers/probes/<date>-p2b2b2b3-*.txt` | New: the gate's and the probes' output (Tasks 8, 10) |
| The roadmap, this phase's spec | Spec §9's figures, and this plan's decisions (Task 10) |

Every commit stays green:

- **Task 1** adds sources only.
- **Task 2** adds the hands' limit, which no default stroke reaches: every digest is bit-identical.
- **Task 3** adds the underside and refactors the bed's iteration, unread by the law: every digest is bit-identical.
- **Task 4** adds the law and its data, which nothing in the engine calls yet.
- **Task 5** swaps the plane law for the new one and re-baselines the tests whose head meets the turf.
- **Task 6** adds the jab, at 0 everywhere but its own tests, and moves the AC stop's turf tests onto the box.
- **Task 7** adds the probe and the regime and jab tests.
- **Task 8** is the user's gate. Nothing after it lands until the user has ruled.
- **Task 9** runs the gates and bumps the version.
- **Task 10** probes, and brings the documents up to date.

---
### Task 1: The baseline and the sources

Spec §7.2 (the baseline, before any change), §6.2 (the sources), §8 (the canonical runs against the baseline).

**Files:**
- Modify: `reference/sources/README.md` (a section for this phase's sources)
- Temp, never committed: `<temp>/scripts/presetDigest.mts`, `<temp>/scripts/gateFigures.mts`, `<temp>/baseline/*`,
  `<temp>/sources/*`

**Interfaces:**
- Produces: the baseline files
  `<temp>/baseline/{presetDigest,impactDigest,shotMix,impactProbe,strokeProbe,swingProbe,gate}.txt`, and the scripts
  `presetDigest.mts` and `gateFigures.mts`, which later tasks run unchanged.

- [ ] **Step 1: Confirm that the branch's code is `main`'s**

Run: `git diff --stat main -- src tests scripts reference`
Expected: no output. The branch's commits are docs only.

Run: `mkdir -p <temp>/scripts <temp>/baseline <temp>/after <temp>/sources`

- [ ] **Step 2: Write the preset digest**

Create `<temp>/scripts/presetDigest.mts`:

```ts
/**
 * Full-precision digest of every preset's canonical and sweep runs, for P2b.2b.2b.3's ratchet (spec §7.2; plan Task 1
 * Step 2, Tasks 2, 3, 5 and 6). Each line is one run: its label, the SHA-256 of its outcome with the engine version
 * normalised and the sign of zero kept, and its head–turf intervals, so that a run the new law moves can be listed
 * with them. Throwaway, never committed. Run from the worktree: npx --yes tsx <this>.
 */
import { createHash } from "node:crypto";
import { simulateShot } from "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b3-turf-strike/src/engine/shot";
import { STROKE_TYPES } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b3-turf-strike/src/engine/swing/types";
import { defaultWorld } from "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b3-turf-strike/src/engine/world";
import { backswingFor, canonicalSetup } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b3-turf-strike/tests/engine/support/shot";

const WORLD = defaultWorld();
/** JSON.stringify drops the sign of zero; keep it, so that the digest is bit-exact. */
const exact = (key: string, value: unknown): unknown =>
    key === "engineVersion" ? "" : Object.is(value, -0) ? "-0" : value;
const ms = (x: number): string => (x * 1e3).toFixed(3);
const digest = (label: string, run: () => ReturnType<typeof simulateShot>): void => {
    try {
        const outcome = run();
        const sha = createHash("sha256").update(JSON.stringify(outcome, exact)).digest("hex");
        const turf = (outcome.impact.timeline["head/turf"] ?? []).map((i) => `${ms(i.start)}–${ms(i.end)}`);
        console.log(`${label}: ${sha} turf ${turf.join(",") || "none"}`);
    } catch (error) {
        console.log(`${label}: rejected (${(error as Error).message})`);
    }
};

for (const type of STROKE_TYPES) {
    const base = canonicalSetup(type, { world: WORLD });
    digest(`${type} canonical`, () => simulateShot(base, WORLD, { trajectory: true }));
    const up0 = base.stroke.contact.up;
    // swingProbe.ts's preset grid: 5 speeds × 5 drives × 3 heights × 3 sides.
    for (const speed of [1, 2, 3, 4, 6]) {
        for (const drive of [-1, -0.5, 0, 0.5, 1]) {
            for (const up of [up0 - 0.003, up0, up0 + 0.003]) {
                for (const side of [-0.01, 0, 0.01]) {
                    const label = `${type} ${speed} m/s drive ${drive} up ${up} side ${side}`;
                    digest(label, () => {
                        const stroke = { ...base.stroke, drive, contact: { up, side } };
                        const setup = { ...base, stroke };
                        const backswing = backswingFor(setup, speed, WORLD);
                        return simulateShot({ ...setup, stroke: { ...stroke, backswing } }, WORLD);
                    });
                }
            }
        }
    }
}
```

Its imports are the same before and after the API changes, so later tasks run it unchanged.

- [ ] **Step 3: Write the gate's figures**

Create `<temp>/scripts/gateFigures.mts`:

```ts
/**
 * P2b.2b.2b.3's gate figures (spec §8, §9), one line per run: every preset's canonical setup at 2 and 3 m/s, the rolls
 * first: the head–turf intervals, peak and slide, the events, the follow-through's finish and flags, the highest ball
 * centre and the striker's face intervals. Throwaway, never committed: Task 1 runs it on main (the plane law), Task 8
 * on the new law. Run from the worktree: npx --yes tsx <this>.
 */
import type { ImpactProbe, ImpactSnapshot } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b3-turf-strike/src/engine/impact/integrate";
import { simulateStroke } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b3-turf-strike/src/engine/impact/simulateImpact";
import { planStroke } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b3-turf-strike/src/engine/swing/buildContact";
import type { ShotSetup, StrokeType } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b3-turf-strike/src/engine/swing/types";
import { defaultWorld } from "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b3-turf-strike/src/engine/world";
import { backswingFor, canonicalSetup } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b3-turf-strike/tests/engine/support/shot";

const WORLD = defaultWorld();
const R = WORLD.ball.radius;
const ORDER: readonly StrokeType[] = [
    "half-roll",
    "full-roll",
    "pass-roll",
    "single-ball",
    "drive",
    "stop-ac",
    "stop-gc",
];
const mm = (x: number): string => (x * 1e3).toFixed(3);
const ms = (x: number): string => (x * 1e3).toFixed(2);

function run(label: string, setup: ShotSetup): void {
    try {
        const plan = planStroke(setup, WORLD);
        let highest = -Infinity;
        const probe: ImpactProbe = {
            step(s: ImpactSnapshot): void {
                for (const b of s.balls) {
                    highest = Math.max(highest, b.position.z);
                }
            },
        };
        const { result, follow } = simulateStroke(plan.contact, setup.balls, WORLD, { probe });
        const spans = (key: string): string =>
            (result.timeline[key] ?? []).map((i) => `${ms(i.start)}–${ms(i.end)}`).join(", ") || "none";
        console.log(
            `${label}: impact ${ms(result.duration)} ms; head/turf ${spans("head/turf")}, peak ` +
                `${mm(result.peakPenetration["head/turf"] ?? 0)} mm, slide ${mm(result.headTurfSlide ?? 0)} mm; ` +
                `face ${spans(`face/${setup.striker}`)}; highest ball centre ${mm(highest - R)} mm above R; finish ` +
                `${ms(follow.finish)} ms ${follow.flags.join(",") || "unflagged"}; events ` +
                `${result.events.map((e) => e.kind).join(",") || "none"}`,
        );
    } catch (error) {
        console.log(`${label}: threw ${(error as Error).name}: ${(error as Error).message}`);
    }
}

for (const type of ORDER) {
    for (const speed of [2, 3]) {
        const base = canonicalSetup(type, { world: WORLD });
        run(`${type} ${speed} m/s`, { ...base, stroke: { ...base.stroke, backswing: backswingFor(base, speed, WORLD) } });
    }
}
```

- [ ] **Step 4: Capture the baseline (in the background)**

Run each in the background, with `run_in_background: true`:

Run: `/usr/bin/time -p npx --yes tsx <temp>/scripts/presetDigest.mts > <temp>/baseline/presetDigest.txt 2> <temp>/baseline/presetDigest.time`
Run: `npx --yes tsx scripts/impactDigest.ts > <temp>/baseline/impactDigest.txt`
Run: `npx --yes tsx scripts/shotMix.ts > <temp>/baseline/shotMix.txt`
Run: `npx --yes tsx scripts/impactProbe.ts > <temp>/baseline/impactProbe.txt`
Run: `npx --yes tsx scripts/strokeProbe.ts > <temp>/baseline/strokeProbe.txt`
Run: `npx --yes tsx scripts/swingProbe.ts > <temp>/baseline/swingProbe.txt`
Run: `npx --yes tsx <temp>/scripts/gateFigures.mts > <temp>/baseline/gate.txt`

The preset sweep's wall time (`real` in the `.time` file) is the cost baseline the gate compares (the law visits
thousands of columns a step while the head is in the turf; spec §9's cost).

`shotMix` and `impactProbe` print times, which vary from run to run. Later comparisons drop them:
`grep -v "ms per shot" <shotMix file> > <file>.cmp` and `grep -v "µs/step" <impactProbe file> > <file>.cmp`.

They must all finish before Task 2's first engine change. Step 5 changes no engine behaviour, so it may run alongside.
When they finish, check that `<temp>/baseline/gate.txt` has 14 lines, none "threw".

- [ ] **Step 5: Fetch the sources**

Each file goes in its own new directory under `<temp>/sources/`, and nothing is committed. For each source below:

1. Fetch it: `curl -sSL -o <temp>/sources/<short>/<file> <URL>` (`-k` for oxfordcroquet.org; `--compressed` for an
   HTML page).
2. Hash it: `shasum -a 256 <temp>/sources/<short>/<file>`. For an Oxford Croquet page, hash it with the counter line
   removed, as the README's convention: `grep -vE ">(Views|Hits): [0-9]+<" <file> > <file>.stable`, then hash the
   `.stable` file.
3. Fetch it a second time into a second new directory and hash that copy. Record a digest only if both fetches give
   the same one. A file whose raw digest differs between fetches gets a stable filter, as the mallet section's CA and
   Invictus rows do, and the filter goes in its row.
4. For a PDF, `pdftotext -layout <file> <file>.txt`, then find the quotes below with `grep -n` in the text.

| Short name | URL |
|---|---|
| Crum | https://archive.lib.msu.edu/tic/mitgc/article/199959.pdf |
| Mascitti 2017 | https://propel.umass.edu/sites/default/files/publications/2026-04/Mascitti%20et%20al.%2C%202017.pdf |
| Mak & Chen 2014 | https://library.csbe-scgab.ca/docs/journal/56/C14202.pdf |
| Young 2009 | doi:10.1177/0018720809355969 (find an open full text, below) |
| Seo 2008 | https://stacks.cdc.gov/view/cdc/215050/cdc_215050_DS1.pdf |
| Katsuragi & Durian 2007 | https://arxiv.org/abs/cond-mat/0703072 (the PDF: https://arxiv.org/pdf/cond-mat/0703072) |
| Anderson 2018 | https://link.springer.com/content/pdf/10.1007/s12283-018-0273-2.pdf |
| Woods 2012 | https://www.files.asianturfgrass.com/20120802_data_report.pdf |
| Caldwell 2023 | the University of Waterloo thesis (find its UWSpace URL, below) |
| Tutelman | his page on grip pressure (find its URL, below) |
| Gugan 5 | https://oxfordcroquet.org/tech/gugan5/ (already cited; re-hash it) |

**Young 2009, Caldwell 2023 and Tutelman.** Find each URL with the web-search skill before fetching:

- Young 2009: Young, Woolley, Armstrong and Ashton-Miller, "Hand/handhold coupling: effect of handle shape,
  orientation, and friction on breakaway strength", Human Factors 51(5), 705–717 (2009). Look for an open full text
  (PubMed Central first). Confirm the title, authors and pages from it, and correct the row if they differ.
- Caldwell 2023: the Waterloo thesis with a golf club–ground contact model.
- Tutelman: Dave Tutelman's page quoting Schmidt (2007) on golfers' grip force at impact.

If no open full text of Young 2009 gives "435 ± 27 N", **stop and report**: `gripLimit` rests on that figure.

**Gugan 5.** Its digest in the README is `057c2161…cb42e`. If the re-fetched page's stable digest differs, record the
new one in the new section and say so; do not edit the old row.

**Mascitti's fins.** Spec §6.2 assumes that the vane's "2.0-cm length" is its fins' height. Find the vane's description
in the paper's methods or figure, and record what it says. If it says otherwise, **stop and report**: c's bounds
(73–138 kPa) rest on it.

- [ ] **Step 6: The sources' rows**

In `reference/sources/README.md`, append a section "## P2b.2b.2b.3: the turf strike (design §6.2)". Open it with the
fetch convention (one short paragraph: fetched <date>, each digest reproduced by a second fetch, the Oxford Croquet
counter rule). Then add a table of short name, work, URL and SHA-256, one row per source of Step 5, with the digests
Step 5 measured. Then add "### What each gives the model", each item one or two lines, verbatim with markup stripped,
mirroring nothing:

- **Crum:** the sand rootzone's ultimate bearing, "on the order of 45 psi" well graded and "up to 25 psi" poorly
  graded, give `turfYield`'s bounds (310 and 172 kPa) and its default, 240 kPa, between them.
- **Mascitti, McNitt & Serensits 2017:** the shear vane's torque range, 17.8–33.6 N·m, and the vane (7.0 cm across,
  12 fins of 2.0 cm), with Step 5's finding on the fins. The conversion is ours: T = π·c·(D²H/2 + D³/12) =
  2.437e-4 m³·c, so c is 73–138 kPa, default 105 kPa (`turfMatStrength`).
- **Mak & Chen 2014:** Reece's equation D = (ρ·g·d²·N_γ + c·d·N_c + ρ·v²·d·N_a)·w, and N_c 1.71, N_γ 2.45 and N_a
  0.35 at their shallowest tabulated depth at rake 18.5° (`turfPloughFactor`; the other two cited, not used).
- **Young 2009:** the breakaway strength with the load along a vertical cylinder, 435 ± 27 N (`gripLimit`).
- **Anderson 2018:** a clay rootzone's vane strength falling from 204 to 156 to 64 kPa as its water content rises
  from 14.8 to 17.5 to 20 %, and the rootzone density 1.2–1.6 Mg/m³: the turf varies from lawn to lawn and day to day.
- **Katsuragi & Durian 2007:** the inertial drag 0.8·ρ·A·v², cited as the check on dropping Reece's inertia term.
- **Seo 2008:** hand–handle friction 0.33–0.77 and axial push 65–179 N, cited.
- **Tutelman (Schmidt 2007):** golfers' grip 160–500 N at impact, cited.
- **Woods 2012:** Clegg 57–137 g on greens, cited.
- **Caldwell 2023:** the only golf club–ground model found, with "no experimental data to compare these contact
  forces", cited.
- **Gugan 5:** stop-shots "by using a downward 'jab' just before impact, so that friction between the ground and the
  heel of the mallet stops it soon after impact"; the second tap's mallet speed, 0.400U over the seven lowest ratios
  against 0.463U unrestricted, and 0.295U at best (the jab check, spec §7.3).
- **No source** measures a club's or a mallet's loss of speed in turf.

Quote each figure from the fetched text as found. Where the text words a figure differently from this list, quote the
text and keep the figure. Where a figure is missing from its source, **stop and report**.

- [ ] **Step 7: Check the README**

Run: `env LC_ALL=en_GB.UTF-8 grep -nE "^[^|].{120,}$" reference/sources/README.md`
Expected: no hit in the new section.

- [ ] **Step 8: Run every check**

Run, one per call: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`.
Expected: all pass, 1109 passed and 4 skipped.

- [ ] **Step 9: Commit**

Stage `reference/sources/README.md`.

Message: `Cite the turf strike's sources: bearing, root mat, Reece and the hand's breakaway`

---
### Task 2: The hands' limit

Spec §5, §6.3 (`gripLimit`, `grip-limit`, `follow-grip-limit`), §7.1 case 5, §7.2 step 1; decisions 10–12.

**Files:**
- Modify: `reference/contact.json`, `src/reference/index.ts`, `tests/reference/reference.test.ts` (`gripLimit`)
- Modify: `src/engine/impact/types.ts` (`HandName`, `Hands.gripLimit`, the `grip-limit` event)
- Modify: `src/engine/impact/track.ts` (`GRIP_LIMIT`, `GripState`'s offsets, `HandLoad.saturated`, the limit)
- Modify: `src/engine/impact/integrate.ts` (`grip-limit`, `follow-grip-limit`)
- Modify: `src/engine/impact/simulateImpact.ts` (`validateTrack`)
- Modify: `src/engine/swing/types.ts`, `src/engine/swing/buildContact.ts`, `src/engine/swing/profile.ts`
- Modify: `tests/engine/support/impact.ts`, `tests/engine/support/shot.ts` (`TEST_GRIP_LIMIT`)
- Create: `tests/engine/impact/gripLimit.test.ts`
- Modify: `tests/engine/impact/simulateImpact.test.ts`, `tests/engine/swing/buildContact.test.ts` (validation rows)
- Modify: `tests/engine/shot.test.ts` (the impact's and the follow-through's grip-limit, once each)

**Interfaces:**
- Produces:
  - `type HandName = "top" | "bottom"` (impact/types.ts);
  - `Hands.gripLimit: number` (N) and `SwingProfile.body.gripLimit: number` (N);
  - `GRIP_LIMIT: number` (track.ts, 435);
  - `GripState.topOffset: Vec3 | null` and `GripState.bottomOffset: Vec3 | null`;
  - `HandLoad.saturated: HandName | null`;
  - the event `{ kind: "grip-limit"; t: number; hand: HandName }`;
  - `FollowFlag` gains `"follow-grip-limit"`;
  - `TEST_GRIP_LIMIT = 1e5` (tests/engine/support/impact.ts).

- [ ] **Step 1: The reference entry**

In `reference/contact.json`, after `pushResponseTime`, add:

```json
    "gripLimit": {
        "value": 435,
        "unit": "N",
        "bounds": [408, 462],
        "source": "<Young 2009's citation, as Task 1 Step 5 confirmed it>, <its URL>",
        "provenance": "direct",
        "note": "The hand's breakaway strength: the largest force a power grip holds on a handle along a vertical cylinder before the hand slips or the arm gives way, 435 ± 27 N (mean ± SD). The model clips each hand's force on the mallet to it (P2b.2b.2b.3 design §5), whether the grip breaks or the arm gives way (user, 2026-10-14). Bounds: the mean ± one SD. Grip tension does not scale it (P3). The twist is not limited (design §5)."
    },
```

The source string is the citation Task 1 Step 5 confirmed, in the file's "Authors, 'Title', Journal volume(issue),
pages (year), URL" style.

In `src/reference/index.ts`, after `pushResponseTime`, add `gripLimit: readValue(contactJson, "gripLimit", "contact"),`.

In `tests/reference/reference.test.ts`, beside the `headTurfFriction` expectations (lines ~227–229), add:

```ts
        expect(contactReference.gripLimit.value).toBe(435);
        expect(contactReference.gripLimit.bounds).toEqual([408, 462]);
```

- [ ] **Step 2: The types**

`src/engine/impact/types.ts`:

- Before `Hands`, add:

```ts
/** A hand on the shaft (P2b.2b.2b.3 design §5). */
export type HandName = "top" | "bottom";
```

- In `Hands`, after `chain`, add:

```ts
    /**
     * F_max (N, P2b.2b.2b.3 design §5): each hand's force on the mallet is clipped to this magnitude. Where the hand
     * holds a position spring its anchor slides at the limit, and the slid offset persists (GripState).
     */
    readonly gripLimit: number;
```

- In `ImpactEvent`'s doc list, add a bullet: "`grip-limit`: a hand's force first reached its grip's limit
  (P2b.2b.2b.3 design §5), with the hand; recorded, not judged". Add the member:

```ts
    | { readonly kind: "grip-limit"; readonly t: number; readonly hand: HandName }
```

`src/engine/swing/types.ts`, in `SwingProfile.body`, after `chain`, add `readonly gripLimit: number;`, and extend the
body's doc comment: "…, each hand's and arm's hand–arm chain, and the grip's limit (N; P2b.2b.2b.3 design §5)".

- [ ] **Step 3: Write the failing tests**

Create `tests/engine/impact/gripLimit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
    handLoad,
    headOnPath,
    newGripState,
    prepareTrack,
    type PreparedTrack,
} from "../../../src/engine/impact/track";
import type { Coupling, HeadState } from "../../../src/engine/impact/types";
import { add, dot, length, scale, sub, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import { TEST_HANDS, TEST_HEAD, levelArc, trackDrive } from "../support/impact";

/** A firm grip held to its path before relaxAt, with no damping, so that each hand's force is its spring's alone. */
const FIRM: Coupling = { period: 0.04, dampingRatio: 0, relaxAt: 10 };

/** A level path whose pivot runs along aim at 1 m/s, gravity off: the hands' feed-forward is then zero. */
function running(limit: number): PreparedTrack {
    const arc = levelArc(vec3(0, 0, 1), { pivotVelocity: vec3(1, 0, 0) });
    return prepareTrack(trackDrive(arc, FIRM, { ...TEST_HANDS, gripLimit: limit }), TEST_HEAD, 0);
}

/** The top grip's gap to its target on the path at time t, the head held at `head`. */
function topGap(track: PreparedTrack, head: HeadState, t: number): Vec3 {
    const target = headOnPath(track, TEST_HEAD, t);
    return sub(target.position, head.position);
}

describe("the hands' limit (P2b.2b.2b.3 design §5)", () => {
    it("holds a firm hand to F_max against a fixed head, its anchor sliding so that no spring energy builds", () => {
        // Case 5. The path runs away from a head held still: the top hand's spring would stretch by 1 mm a
        // millisecond. Past F_max = 50 N the hand transmits 50 N and its anchor slides, so its spring's extension
        // |gap − offset| stays at F_max/k and stores F_max²/(2k), however far the path runs.
        const limit = 50;
        const track = running(limit);
        const head = headOnPath(track, TEST_HEAD, 0);
        const grip = newGripState();
        const k = track.firm.stiffness;
        let saturatedAt = -1;
        for (let n = 0; n <= 50; n++) {
            const t = n * 1e-3;
            const load = handLoad(track, head, TEST_HEAD, t, grip);
            if (load.saturated !== null && saturatedAt < 0) {
                saturatedAt = t;
            }
            if (saturatedAt >= 0) {
                expect(Math.abs(length(load.top) - limit) / limit, `t ${t}`).toBeLessThan(1e-12);
                const stretch = sub(topGap(track, head, t), grip.topOffset as Vec3);
                expect(0.5 * k * dot(stretch, stretch), `t ${t}`).toBeLessThanOrEqual(
                    ((limit * limit) / (2 * k)) * (1 + 1e-9),
                );
            }
        }
        expect(saturatedAt).toBeGreaterThan(0);
        expect(length(topGap(track, head, 0.05))).toBeGreaterThan(0.04);
    });

    it("returns under the limit with its offset kept once the load falls", () => {
        const limit = 50;
        const track = running(limit);
        const held = headOnPath(track, TEST_HEAD, 0);
        const grip = newGripState();
        for (let n = 0; n <= 20; n++) {
            handLoad(track, held, TEST_HEAD, n * 1e-3, grip);
        }
        const offset = grip.topOffset as Vec3;
        // Move the head on to halve the spring's stretch: the force falls to F_max/2 and the anchor stays put.
        const stretch = sub(topGap(track, held, 0.02), offset);
        const moved: HeadState = { ...held, position: add(held.position, scale(stretch, 0.5)) };
        const load = handLoad(track, moved, TEST_HEAD, 0.02, grip);
        expect(load.saturated).toBeNull();
        expect(Math.abs(length(load.top) - limit / 2) / limit).toBeLessThan(1e-9);
        expect(grip.topOffset).toEqual(offset);
    });

    it("names the top hand when both saturate in one step", () => {
        const track = running(5);
        const head = headOnPath(track, TEST_HEAD, 0);
        const grip = newGripState();
        const load = handLoad(track, head, TEST_HEAD, 0.01, grip);
        expect(length(load.top)).toBeCloseTo(5, 9);
        expect(length(load.bottom)).toBeCloseTo(5, 9);
        expect(load.saturated).toBe("top");
    });

    it("leaves a hand below the limit exactly as it was, with no offset", () => {
        const low = running(1e5);
        const high = running(1e9);
        const head = headOnPath(low, TEST_HEAD, 0);
        const a = newGripState();
        const b = newGripState();
        for (let n = 0; n <= 10; n++) {
            const t = n * 1e-3;
            expect(handLoad(low, head, TEST_HEAD, t, a)).toEqual(handLoad(high, head, TEST_HEAD, t, b));
        }
        expect(a.topOffset).toBeNull();
        expect(a.bottomOffset).toBeNull();
    });

    it("transmits only F_max through a carry hand's chain, and the chain feels it", () => {
        // A still carry under gravity: each hand's chain carries its share of the head's weight and its own skin,
        // about 5 N for the top hand, against a 2 N limit. The hand transmits 2 N; its hold slides until the palm
        // and fingers carry exactly that, so recomputing the chain at the slid anchor gives the same force.
        const arc = levelArc(vec3(0, 0, 1), { mode: "carry", handReach: 0.1, pendulumAt: 1 });
        const hands = { ...TEST_HANDS, gripLimit: 2 };
        const coupling: Coupling = { period: 0.04, dampingRatio: 0.7, relaxAt: 0 };
        const track = prepareTrack(trackDrive(arc, coupling, hands), TEST_HEAD, STANDARD_GRAVITY);
        const head = headOnPath(track, TEST_HEAD, 0);
        const grip = newGripState();
        const first = handLoad(track, head, TEST_HEAD, 0, grip);
        expect(first.saturated).not.toBeNull();
        expect(Math.abs(length(first.top) - 2) / 2).toBeLessThan(1e-9);
        expect(grip.topOffset).not.toBeNull();
        const again = handLoad(track, head, TEST_HEAD, 0, grip);
        expect(Math.abs(length(again.top) - 2) / 2).toBeLessThan(1e-6);
    });
});
```

In `tests/engine/shot.test.ts`, inside `describe("simulateShot", …)`, add:

```ts
    it("raises grip-limit once in the impact and follow-grip-limit once in the follow-through (P2b.2b.2b.3 §5)", () => {
        // A 20 N grip cannot carry the hands' share of the mallet's weight and the downswing's pull, so a hand
        // saturates in the impact and again in the follow-through: each is reported once, the first time.
        const base = canonicalSetup("single-ball");
        const setup = { ...base, profile: { ...base.profile, body: { ...base.profile.body, gripLimit: 20 } } };
        const outcome = simulateShot(setup, WORLD, { trajectory: true });
        expect(outcome.impact.events.filter((e) => e.kind === "grip-limit")).toHaveLength(1);
        expect((outcome.trajectory as SwingTrajectory).flags.filter((f) => f === "follow-grip-limit")).toHaveLength(1);
    });
```

The validation rows (review focus 4) go where the existing ones are:

- `tests/engine/impact/simulateImpact.test.ts`: in the table of tracked-drive rejections (search for
  `hands.pushForce`), add rows for `gripLimit` 0, −1, NaN and Infinity. NaN and Infinity expect
  `/hands.gripLimit must be finite/`; 0 and −1 expect `/hands.gripLimit must be a positive finite number/`.
- `tests/engine/swing/buildContact.test.ts`: in the profile-body rejections (search for `profile.body.pushForce`),
  add rows for `gripLimit` 0, −1, NaN and Infinity, each expecting `/profile.body.gripLimit must be/`.

Follow each table's own row shape; read the neighbouring `pushForce` rows first.

- [ ] **Step 4: Run them**

Run: `npx vitest run tests/engine/impact/gripLimit.test.ts`
Expected: FAIL. `load.saturated` is `undefined` and no force is clipped.

- [ ] **Step 5: The limit in `track.ts`**

At the top, beside `PUSH_RESPONSE_TIME`, add:

```ts
/** F_max (N, P2b.2b.2b.3 design §5): the hands' grip limit (reference/contact.json, Young et al. 2009). */
export const GRIP_LIMIT = contactReference.gripLimit.value;
```

Import `HandName` with the other types from `./types`.

In `GripState`'s doc comment, append: "Each hand's slid offset (m, world frame; P2b.2b.2b.3 design §5): null until the
hand first saturates, then how far its anchor on the shaft has slid, kept for the rest of the stroke." Add the fields
after `departedAt`:

```ts
    topOffset: Vec3 | null;
    bottomOffset: Vec3 | null;
```

and `topOffset: null, bottomOffset: null,` in `newGripState`.

In `HandLoad`, after `bottom`, add:

```ts
    /** The first hand whose force reached the grip's limit in this step, the top if both did; null if neither. */
    readonly saturated: HandName | null;
```

After `forwardOf`, add the two helpers:

```ts
/**
 * `trial` held to the grip's limit F_max (P2b.2b.2b.3 design §5): null while |trial| ≤ F_max, so that a hand below
 * the limit keeps its arithmetic; otherwise `trial` scaled onto F_max.
 */
function heldTo(trial: Vec3, limit: number): Vec3 | null {
    const squared = dot(trial, trial);
    if (!(squared > limit * limit)) {
        return null;
    }
    return scale(trial, limit / Math.sqrt(squared));
}

/** A hand's offset after its anchor slides by `slide` (m; design §5): the first slide, or the sum. */
function slid(offset: Vec3 | null, slide: Vec3): Vec3 {
    return offset === null ? slide : add(offset, slide);
}
```

**`carryLoad`.** Change its `load` helper to take the saturated hand:

```ts
    const load = (top: Vec3, bottom: Vec3, twist: number, fed: Vec3, saturated: HandName | null): HandLoad => ({
        force: add(top, bottom),
        feedForward: fed,
        torque: add(add(cross(step.topArm, top), cross(step.bottomArm, bottom)), scale(step.s, twist)),
        top,
        bottom,
        saturated,
    });
```

Before the chains are created, add the anchors, and create the chains at them:

```ts
    // Each hand's anchor on the shaft, slid by its offset once it has saturated (design §5).
    const topAnchor = grip.topOffset === null ? topAt : add(topAt, grip.topOffset);
    const bottomAnchor = grip.bottomOffset === null ? bottomAt : add(bottomAt, grip.bottomOffset);
    if (grip.topChain === null) {
        grip.topChain = holdChain(chain, topAnchor, topVelocity, topFed, step.topAcceleration, g);
        if (!pendulum) {
            grip.bottomChain = holdChain(chain, bottomAnchor, bottomVelocity, step.bottom, step.bottomAcceleration, g);
        }
    }
```

Replace `const top = chainForces(chain, topArm, topAt, topVelocity, topDrive, g);` with:

```ts
    const limit = hands.gripLimit;
    const spring = chain.palmStiffness + chain.fingerStiffness;
    let saturated: HandName | null = null;
    let top = chainForces(chain, topArm, topAnchor, topVelocity, topDrive, g);
    const topHeld = heldTo(top, limit);
    if (topHeld !== null) {
        // The hand transmits only F_max: its hold slides until the palm and fingers carry exactly that, and the
        // chain feels what the hand transmits (design §5). The force falls by the palm's and fingers' stiffness times
        // the slide.
        grip.topOffset = slid(grip.topOffset, scale(sub(top, topHeld), 1 / spring));
        top = chainForces(chain, topArm, add(topAt, grip.topOffset), topVelocity, topDrive, g);
        saturated = "top";
    }
```

In the `!pendulum` branch, replace
`const bottom = chainForces(chain, bottomArm, bottomAt, bottomVelocity, bottomDrive, g);` with:

```ts
        let bottom = chainForces(chain, bottomArm, bottomAnchor, bottomVelocity, bottomDrive, g);
        const bottomHeld = heldTo(bottom, limit);
        if (bottomHeld !== null) {
            grip.bottomOffset = slid(grip.bottomOffset, scale(sub(bottom, bottomHeld), 1 / spring));
            bottom = chainForces(chain, bottomArm, add(bottomAt, grip.bottomOffset), bottomVelocity, bottomDrive, g);
            saturated = saturated ?? "bottom";
        }
```

and return `load(top, bottom, twist, add(step.top, step.bottom), saturated)`. In the pendulum phase, replace the last
two lines with:

```ts
    const pushed = grip.vertical ? ZERO : scale(forwardOf(arc.aim, step.s), arc.pendulumEffort * hands.pendulumForce);
    const pushedHeld = heldTo(pushed, limit);
    return load(top, pushedHeld ?? pushed, 0, topFed, pushedHeld === null ? saturated : (saturated ?? "bottom"));
```

**`handLoad`.** Change its `load` helper the same way (a fifth parameter `saturated: HandName | null`, copied into
the result).

Replace the `if (!contact) { … }` block with:

```ts
    if (!contact) {
        const g = track.firm;
        const limit = hands.gripLimit;
        // The gaps to the path, less each hand's slid offset once it has saturated (design §5).
        const topReach = sub(add(path.socket, topLever), add(state.position, topArm));
        const bottomReach = sub(add(path.socket, bottomLever), add(state.position, bottomArm));
        const topGap = grip.topOffset === null ? topReach : sub(topReach, grip.topOffset);
        const bottomGap = grip.bottomOffset === null ? bottomReach : sub(bottomReach, grip.bottomOffset);
        // On a downswing the firm grip keeps the hands' planned pace (feed-forward and damper) but has no position
        // spring (P2b.2b.2a user decision 2026-10-07): a head the turf holds back stays where it is put, so a graze
        // costs the head speed instead of the grip refunding it. A gripped stop keeps the spring: it holds the mallet
        // still.
        const spring = gripped || arc.downswing === undefined;
        let top = spring
            ? add(add(topShare, scale(topGap, g.stiffness)), scale(topLag, g.damping))
            : add(topShare, scale(topLag, g.damping));
        const pull = spring
            ? add(scale(bottomGap, g.stiffness), scale(bottomLag, g.damping))
            : scale(bottomLag, g.damping);
        let bottom = add(bottomShare, across(pull, s));
        const twist =
            twistShare +
            g.twistStiffness * dot(rotationError(path.orientation, q), s) +
            g.twistDamping * dot(spinLag, s);
        // At the limit a spring's anchor slides by the excess over its stiffness, so the spring holds F_max and
        // stores no more; a damper alone is capped (design §5).
        let saturated: HandName | null = null;
        const topHeld = heldTo(top, limit);
        if (topHeld !== null) {
            if (spring) {
                grip.topOffset = slid(grip.topOffset, scale(sub(top, topHeld), 1 / g.stiffness));
            }
            top = topHeld;
            saturated = "top";
        }
        const bottomHeld = heldTo(bottom, limit);
        if (bottomHeld !== null) {
            if (spring) {
                grip.bottomOffset = slid(grip.bottomOffset, scale(sub(bottom, bottomHeld), 1 / g.stiffness));
            }
            bottom = bottomHeld;
            saturated = saturated ?? "bottom";
        }
        return load(top, bottom, twist, add(topShare, bottomShare), saturated);
    }
```

The bottom hand's force lies across the shaft (its share and its projected pull do), so its slide does too, and the
next step's projected pull loses exactly the excess.

In the swing-mode contact branch, replace from `const top = add(topFed, …)` to the end of the function with:

```ts
    let top = add(topFed, scale(topLag, track.top.damping));
    let saturated: HandName | null = null;
    const topHeld = heldTo(top, hands.gripLimit);
    if (topHeld !== null) {
        top = topHeld;
        saturated = "top";
    }
    const g = track.bottom;
    const e = forwardOf(arc.aim, s);
    if (grip.releasedAt !== null) {
        const pushed = scale(e, effort * Math.max(0, g.damping * dot(bottomLag, e)));
        const pushedHeld = heldTo(pushed, hands.gripLimit);
        return load(top, pushedHeld ?? pushed, 0, topFed, pushedHeld === null ? saturated : (saturated ?? "bottom"));
    }
    const bottomFed = checking ? scale(bottomShare, hands.bottomGrip) : ZERO;
    const twist = (checking ? hands.bottomGrip * twistShare : 0) + g.twistDamping * dot(spinLag, s);
    // Swing mode: a rate guide along e on the pitch rate's lag, never pulling outside a check. Inside one its target is
    // the head's own rate held within [0, ω_path]: it brakes a head ahead of the path, returns one past rest towards
    // rest, and leaves one between them to its share of the planned deceleration.
    const held = Math.min(Math.max(rate, 0), Math.max(planned, 0));
    const guide = g.damping * (checking ? held - rate : dot(spinLag, track.axis)) * lever;
    const bottom = add(bottomFed, scale(e, checking ? guide : effort * Math.max(0, guide)));
    const bottomHeld = heldTo(bottom, hands.gripLimit);
    return load(
        top,
        bottomHeld ?? bottom,
        twist,
        add(topFed, bottomFed),
        bottomHeld === null ? saturated : (saturated ?? "bottom"),
    );
```

Every damper-only hand is capped there. Add a line to `handLoad`'s header comment: "Each hand's force is held to the
grip's limit F_max (P2b.2b.2b.3 design §5): a position spring's anchor slides at it, by a world-frame offset kept in
`grip`; a damper alone is capped."

- [ ] **Step 6: The events**

`src/engine/impact/integrate.ts`:

- `FollowFlag`: `"follow-cap" | "follow-head-deep" | "follow-grip-limit"`, its doc comment: "…, the head driven past
  HEAD_DEEP_LIMIT, or a hand first reaching its grip's limit in the follow-through (P2b.2b.2b.3 design §4.6)".
- In `integrateStroke`, beside `let deep = false;`, add `let limited = false;`. After `hand = handLoad(…)` and
  `headTorque = hand.torque;`, add:

```ts
            if (hand.saturated !== null && !limited) {
                limited = true;
                events.push({ kind: "grip-limit", t, hand: hand.saturated });
            }
```

- In `continueStroke`, after `const hand = handLoad(path, …);`, add:

```ts
        if (hand.saturated !== null && !flags.includes("follow-grip-limit")) {
            flags.push("follow-grip-limit");
        }
```

- In the file header's follow-through paragraph, append: "A hand first reaching its grip's limit raises `grip-limit`
  in the impact and `follow-grip-limit` in the follow-through (P2b.2b.2b.3 design §5)."

`src/engine/swing/trajectory.ts` copies `FollowFlag` through; its type follows.

- [ ] **Step 7: The validations and the profile**

`src/engine/impact/simulateImpact.ts`, `validateTrack`, after the `pushResponseTime` checks:

```ts
    finiteNumber(hands.gripLimit, "hands.gripLimit");
    positive(hands.gripLimit, "hands.gripLimit");
```

and in its header list, after "pushResponseTime": "a positive gripLimit (P2b.2b.2b.3 design §5)".

`src/engine/swing/buildContact.ts`:

- `validate`, after the `pushResponseTime` checks:

```ts
    finiteNumber(body.gripLimit, "profile.body.gripLimit");
    positive(body.gripLimit, "profile.body.gripLimit");
```

- `handsOf`: add `gripLimit: profile.body.gripLimit,` after `chain`.
- `planStroke`'s header list: "pushForce, pushResponseTime, gripLimit or a hand–arm chain value not positive".

`src/engine/swing/profile.ts`: import `GRIP_LIMIT` with the other track constants; in `defaultProfile.body`, add
`gripLimit: GRIP_LIMIT,` after `chain`. In the file header's Body bullet, add "the grip's limit (Young et al. 2009;
P2b.2b.2b.3)".

`tests/engine/support/impact.ts`, after `TEST_PUSH_RESPONSE_TIME`:

```ts
/**
 * A grip limit (N) far above any test hand's force (P2b.2b.2b.3 plan decision 12), so that tests written before the
 * limit keep their figures; the limit's own tests set theirs.
 */
export const TEST_GRIP_LIMIT = 1e5;
```

and `gripLimit: TEST_GRIP_LIMIT,` in `TEST_HANDS`. `tests/engine/support/shot.ts`: import it, and add
`gripLimit: TEST_GRIP_LIMIT,` to `testProfile`'s body, before `...o.body`. Update `testProfile`'s doc comment to list
`TEST_GRIP_LIMIT`.

- [ ] **Step 8: Run the tests**

Run: `npx vitest run tests/engine/impact/gripLimit.test.ts tests/engine/impact/simulateImpact.test.ts tests/engine/swing/buildContact.test.ts tests/reference/reference.test.ts`
Expected: PASS.

Run: `npx vitest run tests/engine/shot.test.ts -t "grip-limit once"`
Expected: PASS. If a 20 N grip does not saturate in the follow-through, trace its hand forces with a temporary
`console.log` of `|hand.top|` and `|hand.bottom|` in `continueStroke` (removed before the commit), and lower the
test's limit below their peak, saying so in the comment.

If "transmits only F_max through a carry hand's chain" fails on `first.saturated`, trace the chain's force at t = 0
(holdChain places the chain in equilibrium with its share, so the hand's force is its share of the head's weight and
the skin's): if it is under 2 N, lower the test's limit to half the measured force and note it in the test's comment.

- [ ] **Step 9: Run the ratchet (in the background)**

Spec §7.2 step 1: all four bit-identical.

Run each with `run_in_background: true`:

Run: `npx --yes tsx <temp>/scripts/presetDigest.mts > <temp>/after/presetDigest-task2.txt`
Run: `npx --yes tsx scripts/impactDigest.ts > <temp>/after/impactDigest-task2.txt`
Run: `npx --yes tsx scripts/shotMix.ts > <temp>/after/shotMix-task2.txt`
Run: `npx --yes tsx scripts/impactProbe.ts > <temp>/after/impactProbe-task2.txt`

When they finish:

Run: `diff <temp>/baseline/presetDigest.txt <temp>/after/presetDigest-task2.txt`
Run: `diff <temp>/baseline/impactDigest.txt <temp>/after/impactDigest-task2.txt`
Run: `grep -v "ms per shot" <temp>/after/shotMix-task2.txt > <temp>/after/shotMix-task2.txt.cmp`, then
`grep -v "ms per shot" <temp>/baseline/shotMix.txt > <temp>/baseline/shotMix.txt.cmp`, then
`diff <temp>/baseline/shotMix.txt.cmp <temp>/after/shotMix-task2.txt.cmp`
Run: `grep -v "µs/step" <temp>/after/impactProbe-task2.txt > <temp>/after/impactProbe-task2.txt.cmp`, then
`grep -v "µs/step" <temp>/baseline/impactProbe.txt > <temp>/baseline/impactProbe.txt.cmp`, then
`diff <temp>/baseline/impactProbe.txt.cmp <temp>/after/impactProbe-task2.txt.cmp`

Expected: no output from any diff. A preset run that differs is one where a hand saturated: list it in
`<temp>/after/saturated.txt` (its label and both digests), check that its outcome carries a `grip-limit` event, and
carry the list to the gate (Task 8). Any other difference is a defect: stop.

- [ ] **Step 10: Run every check**

Run, one per call: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`.
Expected: all pass.

- [ ] **Step 11: Commit**

Stage the files above by path.

Message: `Hold each hand's force to the grip's breakaway limit, its anchor sliding past it`

---
### Task 3: The head's underside

Spec §4.1 (the columns, the underside of the round head and the rounded box); decisions 8 and 9.

**Files:**
- Modify: `src/engine/impact/contacts.ts` (`headExtent`, `headUnderside`)
- Modify: `src/engine/impact/turfBed.ts` (`cellKey`, `columnSpan`, `mirrorPairsOver` exported; bit-identical)
- Modify: `tests/engine/support/impact.ts` (`TEST_SHARP`)
- Create: `tests/engine/impact/underside.test.ts`

**Interfaces:**
- Produces:
  - `headExtent(state: HeadState, head: MalletHead): Vec3`: the head's horizontal half-extents along world x and y,
    z 0;
  - `headUnderside(state: HeadState, head: MalletHead): (x: number, y: number) => number`: built once per state, it
    gives the world height at which the vertical line through (x, y) enters the head from below, or `Infinity` where
    the line misses it;
  - `cellKey(i: number, j: number): number`, `columnSpan(centre: number, half: number, h: number): readonly
    [number, number]` and `mirrorPairsOver(i0, i1, j0, j1, pair)` (turfBed.ts);
  - `TEST_SHARP: MalletHead` (tests/engine/support/impact.ts).

- [ ] **Step 1: Write the failing tests**

In `tests/engine/support/impact.ts`, after `TEST_BOX`, add:

```ts
/**
 * A sharp 1.0 kg box (edge radius 0; P2b.2b.2b.3 design §7.1), 0.231 m long and 0.065 m wide, as tall as TEST_HEAD:
 * centred over the origin, no column centre of the 2 mm lattice falls on its sole's edges (116 columns along, 32
 * across), so the columns under it are counted exactly. Its inertia is TEST_BOX's; unsourced, as TEST_HEAD.
 */
export const TEST_SHARP: MalletHead = {
    ...TEST_BOX,
    length: 0.231,
    shape: { kind: "box", halfWidth: 0.0325, halfHeight: TEST_RHO, edgeRadius: 0 },
};
```

Create `tests/engine/impact/underside.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { headExtent, headLowestPoint, headUnderside } from "../../../src/engine/impact/contacts";
import { IDENTITY, axisAngle, multiply, rotate, rotateInverse, type Quaternion } from "../../../src/engine/impact/rigidBody";
import { boxDistance, type BoxShape } from "../../../src/engine/impact/shape";
import type { HeadState, MalletHead } from "../../../src/engine/impact/types";
import { add, sub, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import { TEST_BOX, TEST_HEAD, TEST_SHARP } from "../support/impact";
import { rng } from "../support/rng";

const at = (position: Vec3, orientation: Quaternion = IDENTITY): HeadState => ({
    position,
    orientation,
    velocity: vec3(0, 0, 0),
    angularVelocity: vec3(0, 0, 0),
});

/** True when the world point `p` lies in the head (its own body-frame test). */
function inside(state: HeadState, head: MalletHead, p: Vec3): boolean {
    const b = rotateInverse(state.orientation, sub(p, state.position));
    const { shape } = head;
    if (shape.kind === "box") {
        return boxDistance(shape, head.length, b).distance <= 0;
    }
    return Math.abs(b.x) <= head.length / 2 && b.y * b.y + b.z * b.z <= shape.radius * shape.radius;
}

/**
 * The underside by brute force: the first height inside the head scanning up the vertical line through (x, y) in
 * 0.05 mm steps, then bisected to adjacent doubles; Infinity if the scan finds none.
 */
function brute(state: HeadState, head: MalletHead, x: number, y: number): number {
    const step = 5e-5;
    let z = state.position.z - 0.3;
    while (z <= state.position.z + 0.3 && !inside(state, head, vec3(x, y, z))) {
        z += step;
    }
    if (z > state.position.z + 0.3) {
        return Infinity;
    }
    let lo = z - step;
    let hi = z;
    for (let n = 0; n < 80; n++) {
        const mid = (lo + hi) / 2;
        if (inside(state, head, vec3(x, y, mid))) {
            hi = mid;
        } else {
            lo = mid;
        }
    }
    return hi;
}

/** A random orientation within about ±0.6 rad of level, any yaw. */
function tumble(random: () => number): Quaternion {
    const yaw = axisAngle(vec3(0, 0, 1), (random() * 2 - 1) * Math.PI);
    const pitch = axisAngle(vec3(0, 1, 0), (random() * 2 - 1) * 0.6);
    const roll = axisAngle(vec3(1, 0, 0), (random() * 2 - 1) * 0.6);
    return multiply(yaw, multiply(pitch, roll));
}

describe("the head's underside (P2b.2b.2b.3 design §4.1)", () => {
    it("finds the underside of a level head and of a sharp box exactly, with no NaN on axis-parallel lines", () => {
        // Review focus 2. A level cylinder's underside at y is z − √(r² − y²) inside its length and radius; a level
        // sharp box's is its sole, z − h_z, across its whole footprint; outside each, Infinity.
        const r = (TEST_HEAD.shape as { radius: number }).radius;
        const round = headUnderside(at(vec3(0, 0, 0.1)), TEST_HEAD);
        for (const y of [0, 0.01, 0.031]) {
            expect(round(0.05, y)).toBeCloseTo(0.1 - Math.sqrt(r * r - y * y), 15);
        }
        expect(round(0.05, 0.033)).toBe(Infinity);
        expect(round(0.2, 0)).toBe(Infinity);
        const sharp = headUnderside(at(vec3(0, 0, 0.1)), TEST_SHARP);
        expect(sharp(0.1, 0.03)).toBeCloseTo(0.1 - 0.032, 15);
        expect(sharp(0.1, 0.034)).toBe(Infinity);
        for (const head of [TEST_HEAD, TEST_BOX, TEST_SHARP]) {
            const under = headUnderside(at(vec3(0, 0, 0.1)), head);
            for (let x = -0.13; x <= 0.13; x += 0.001) {
                for (let y = -0.04; y <= 0.04; y += 0.001) {
                    expect(Number.isNaN(under(x, y)), `${x} ${y}`).toBe(false);
                }
            }
        }
    });

    it("finds the rounded box's underside under its rounded edge", () => {
        // TEST_BOX level: under the edge, c_y < |y| < h_y, the underside is z − c_z − √(e² − (|y| − c_y)²).
        const shape = TEST_BOX.shape as BoxShape;
        const e = shape.edgeRadius;
        const cy = shape.halfWidth - e;
        const cz = shape.halfHeight - e;
        const under = headUnderside(at(vec3(0, 0, 0.1)), TEST_BOX);
        for (const y of [cy + 0.0005, cy + 0.0015, cy + 0.0029]) {
            expect(under(0.05, y)).toBeCloseTo(0.1 - cz - Math.sqrt(e * e - (y - cy) * (y - cy)), 14);
            expect(under(0.05, 0 - y)).toBe(under(0.05, y));
        }
    });

    it("agrees with a brute-force search on tumbled heads", () => {
        const random = rng(31);
        for (const head of [TEST_HEAD, TEST_BOX, TEST_SHARP]) {
            for (let n = 0; n < 150; n++) {
                const state = at(vec3(1, 2, 0.05), tumble(random));
                const extent = headExtent(state, head);
                const x = 1 + (random() * 2 - 1) * extent.x;
                const y = 2 + (random() * 2 - 1) * extent.y;
                const found = headUnderside(state, head)(x, y);
                const expected = brute(state, head, x, y);
                if (expected === Infinity) {
                    // The scan steps 0.05 mm: a line through a sliver thinner than that is missed by it alone.
                    const thin = found === Infinity || !inside(state, head, vec3(x, y, found + 5e-5));
                    expect(thin, `${head.shape.kind} ${n}`).toBe(true);
                } else {
                    expect(Math.abs(found - expected), `${head.shape.kind} ${n}`).toBeLessThan(1e-9);
                }
                expect(found, `${head.shape.kind} ${n}`).toBeGreaterThanOrEqual(headLowestPoint(state, head) - 1e-12);
            }
        }
    });

    it("bounds the head within its horizontal extent", () => {
        // Every corner of a box's full box, and every point on a cylinder's end rims, lies within the extent.
        const random = rng(37);
        for (let n = 0; n < 100; n++) {
            const q = tumble(random);
            const state = at(vec3(0, 0, 0), q);
            const box = headExtent(state, TEST_BOX);
            const shape = TEST_BOX.shape as BoxShape;
            for (const sx of [-1, 1]) {
                for (const sy of [-1, 1]) {
                    for (const sz of [-1, 1]) {
                        const corner = rotate(q, vec3((sx * TEST_BOX.length) / 2, sy * shape.halfWidth, sz * shape.halfHeight));
                        expect(Math.abs(corner.x)).toBeLessThanOrEqual(box.x + 1e-12);
                        expect(Math.abs(corner.y)).toBeLessThanOrEqual(box.y + 1e-12);
                    }
                }
            }
            const round = headExtent(state, TEST_HEAD);
            const r = (TEST_HEAD.shape as { radius: number }).radius;
            for (let k = 0; k < 32; k++) {
                const a = (k * Math.PI) / 16;
                for (const sx of [-1, 1]) {
                    const rim = rotate(q, add(vec3((sx * TEST_HEAD.length) / 2, 0, 0), vec3(0, r * Math.cos(a), r * Math.sin(a))));
                    expect(Math.abs(rim.x)).toBeLessThanOrEqual(round.x + 1e-12);
                    expect(Math.abs(rim.y)).toBeLessThanOrEqual(round.y + 1e-12);
                }
            }
        }
    });
});
```

Prettier wraps the long lines; leave its output.

- [ ] **Step 2: Run them**

Run: `npx vitest run tests/engine/impact/underside.test.ts`
Expected: FAIL: `headUnderside is not a function`.

- [ ] **Step 3: The bed's iteration, exported (bit-identical)**

In `src/engine/impact/turfBed.ts`:

- Rename `span` to `columnSpan`, export it, and give it its two readers (`mirrorPairs`, `freshBed`). Its header comment
  gains: "The head's columns use it over the head's extent (P2b.2b.2b.3 design §4.1)."
- Export the key:

```ts
/** A column's key on the lattice: (i + KEY_OFFSET)·KEY_STRIDE + (j + KEY_OFFSET), exact for |i|, |j| < 2^20. */
export function cellKey(i: number, j: number): number {
    return (i + KEY_OFFSET) * KEY_STRIDE + (j + KEY_OFFSET);
}
```

  and use it in `column`: `const key = cellKey(i, j);`.
- Split `mirrorPairs` so that the order is reusable over any block:

```ts
/**
 * Visits the columns i0..i1 × j0..j1 in the bed's summation order (see the file header): i ascending, then
 * p = max(j, −j − 1) ascending, calling `pair` once per (i, p) with its mirror pair j = p and j = −p − 1, each null
 * where it lies outside [j0, j1]. The head's turf visits its columns so too (P2b.2b.2b.3 design §4.1).
 */
export function mirrorPairsOver(
    i0: number,
    i1: number,
    j0: number,
    j1: number,
    pair: (i: number, a: number | null, b: number | null) => void,
): void {
    const pLo = j0 >= 0 ? j0 : j1 < 0 ? 0 - j1 - 1 : 0;
    const pHi = Math.max(j1, 0 - j0 - 1);
    for (let i = i0; i <= i1; i++) {
        for (let p = pLo; p <= pHi; p++) {
            const q = 0 - p - 1;
            pair(i, p >= j0 && p <= j1 ? p : null, q >= j0 && q <= j1 ? q : null);
        }
    }
}
```

  and `mirrorPairs` keeps its signature and comment, its body now:

```ts
    const [i0, i1] = columnSpan(x, rho, h);
    const [j0, j1] = columnSpan(y, rho, h);
    mirrorPairsOver(i0, i1, j0, j1, pair);
```

The arithmetic is unchanged, so every bed is bit-identical; Step 6 proves it.

- [ ] **Step 4: The underside and the extent in `contacts.ts`**

Import `boxCore` (already imported) and add, after `headBottom`:

```ts
/**
 * The head's horizontal half-extents (m) about its centre along world x and y, z 0 (P2b.2b.2b.3 design §4.1; plan
 * decision 8): a box's Σ_i |R_ki|·h_i over its full box's half-extents h = (L/2, h_y, h_z), which bound the rounded
 * box; a cylinder's (L/2)·|a_k| + r·√(1 − a_k²), a the unit axis.
 */
export function headExtent(state: HeadState, head: MalletHead): Vec3 {
    const q = state.orientation;
    const ax = rotate(q, vec3(1, 0, 0));
    const half = head.length / 2;
    const { shape } = head;
    if (shape.kind === "box") {
        const ay = rotate(q, vec3(0, 1, 0));
        const az = rotate(q, vec3(0, 0, 1));
        return vec3(
            Math.abs(ax.x) * half + Math.abs(ay.x) * shape.halfWidth + Math.abs(az.x) * shape.halfHeight,
            Math.abs(ax.y) * half + Math.abs(ay.y) * shape.halfWidth + Math.abs(az.y) * shape.halfHeight,
            0,
        );
    }
    const r = shape.radius;
    return vec3(
        Math.abs(ax.x) * half + r * Math.sqrt(Math.max(0, 1 - ax.x * ax.x)),
        Math.abs(ax.y) * half + r * Math.sqrt(Math.max(0, 1 - ax.y * ax.y)),
        0,
    );
}

/** The z with A·z² + 2·B·z + C ≤ 0, as [lo, hi]; every z for A = 0 and C ≤ 0; null where there is none. */
function quadraticSpan(a: number, b: number, c: number): readonly [number, number] | null {
    if (a === 0) {
        return c <= 0 ? [0 - Infinity, Infinity] : null;
    }
    const disc = b * b - a * c;
    if (disc < 0) {
        return null;
    }
    const root = Math.sqrt(disc);
    return [(0 - b - root) / a, (0 - b + root) / a];
}

/** The z with |p + z·u| ≤ half, one slab of a box, as [lo, hi]; every z for u = 0 inside it; null where none. */
function slabSpan(p: number, u: number, half: number): readonly [number, number] | null {
    if (u === 0) {
        return Math.abs(p) <= half ? [0 - Infinity, Infinity] : null;
    }
    const a = (0 - half - p) / u;
    const b = (half - p) / u;
    return a < b ? [a, b] : [b, a];
}

/** The lowest z of two spans' overlap, or Infinity where either is null or they do not overlap. */
function entryOf(a: readonly [number, number] | null, b: readonly [number, number] | null): number {
    if (a === null || b === null) {
        return Infinity;
    }
    const lo = Math.max(a[0], b[0]);
    return lo <= Math.min(a[1], b[1]) ? lo : Infinity;
}

/** Where the line p + z·u (body frame) enters the axis-aligned box of half-extents `half`, or Infinity. */
function boxEntry(p: Vec3, u: Vec3, half: Vec3): number {
    const x = slabSpan(p.x, u.x, half.x);
    const y = slabSpan(p.y, u.y, half.y);
    const z = slabSpan(p.z, u.z, half.z);
    return entryOf(x === null || y === null ? null : [Math.max(x[0], y[0]), Math.min(x[1], y[1])], z);
}

/**
 * Where the line enters a cylinder of radius `radius` along one body axis: `along` and `rate` its axial coordinate
 * and rate, within ±`half`; `a`, `b` and `ua`, `ub` its two across coordinates from the axis and their rates.
 */
function rodEntry(
    along: number,
    rate: number,
    half: number,
    a: number,
    ua: number,
    b: number,
    ub: number,
    radius: number,
): number {
    const round = quadraticSpan(ua * ua + ub * ub, a * ua + b * ub, a * a + b * b - radius * radius);
    return entryOf(slabSpan(along, rate, half), round);
}

const SIGNS = [-1, 1] as const;

/**
 * Where the line p + z·u (body frame) enters the rounded box (P2b.2b.2b.3 plan decision 9). The box grown by e on
 * every axis contains it; where the line enters that box on a flat face (at most one coordinate beyond the core), the
 * entry is exact. Otherwise it enters on an edge or a corner, and the rounded box is the union of three slab-grown
 * boxes, twelve edge cylinders and eight corner spheres: its entry is the lowest of theirs.
 */
function roundedBoxEntry(p: Vec3, u: Vec3, shape: BoxShape, length: number): number {
    const c = boxCore(shape, length);
    const e = shape.edgeRadius;
    const grown = boxEntry(p, u, vec3(c.x + e, c.y + e, c.z + e));
    if (!(grown < Infinity) || e === 0) {
        return grown;
    }
    const q = add(p, scale(u, grown));
    const beyond = (Math.abs(q.x) > c.x ? 1 : 0) + (Math.abs(q.y) > c.y ? 1 : 0) + (Math.abs(q.z) > c.z ? 1 : 0);
    if (beyond <= 1) {
        return grown;
    }
    let lowest = Math.min(
        boxEntry(p, u, vec3(c.x + e, c.y, c.z)),
        boxEntry(p, u, vec3(c.x, c.y + e, c.z)),
        boxEntry(p, u, vec3(c.x, c.y, c.z + e)),
    );
    const uu = dot(u, u);
    for (const s1 of SIGNS) {
        for (const s2 of SIGNS) {
            lowest = Math.min(
                lowest,
                rodEntry(p.x, u.x, c.x, p.y - s1 * c.y, u.y, p.z - s2 * c.z, u.z, e),
                rodEntry(p.y, u.y, c.y, p.x - s1 * c.x, u.x, p.z - s2 * c.z, u.z, e),
                rodEntry(p.z, u.z, c.z, p.x - s1 * c.x, u.x, p.y - s2 * c.y, u.y, e),
            );
            for (const s3 of SIGNS) {
                const d = sub(p, vec3(s1 * c.x, s2 * c.y, s3 * c.z));
                const ball = quadraticSpan(uu, dot(d, u), dot(d, d) - e * e);
                lowest = Math.min(lowest, ball === null ? Infinity : ball[0]);
            }
        }
    }
    return lowest;
}

/**
 * The head's underside over the turf (P2b.2b.2b.3 design §4.1): for head state `state`, a function giving the world
 * height at which the vertical line through (x, y) enters the head from below (a cylinder, or the rounded box: its
 * core box Minkowski-summed with a sphere of the edge radius), or Infinity where the line misses it. The line through
 * (x, y) is p + z·u in the body frame, p the body-frame image of (x, y, 0) and u of ẑ, so its parameter is the world
 * height. The head's frame is computed once, for the head's every column in a step.
 */
export function headUnderside(state: HeadState, head: MalletHead): (x: number, y: number) => number {
    const q = state.orientation;
    const ex = rotateInverse(q, vec3(1, 0, 0));
    const ey = rotateInverse(q, vec3(0, 1, 0));
    const u = rotateInverse(q, UP);
    const base = scale(u, 0 - state.position.z);
    const { shape } = head;
    return (x, y) => {
        const p = add(add(scale(ex, x - state.position.x), scale(ey, y - state.position.y)), base);
        if (shape.kind === "box") {
            return roundedBoxEntry(p, u, shape, head.length);
        }
        const round = quadraticSpan(
            u.y * u.y + u.z * u.z,
            p.y * u.y + p.z * u.z,
            p.y * p.y + p.z * p.z - shape.radius * shape.radius,
        );
        return entryOf(slabSpan(p.x, u.x, head.length / 2), round);
    };
}
```

Add `BoxShape` to the type import from `./shape` if it is not there (it is), and `dot` is already imported. Update the
file header's head–turf sentence: "The head–turf pair (P2b.2b.2b.3 design §4) acts from the turf's columns under the
head's underside (headUnderside), on the turf bed's lattice (headTurf.ts)."

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/engine/impact/underside.test.ts`
Expected: PASS. A brute-force mismatch is a defect in `roundedBoxEntry` or `quadraticSpan`: trace that line's
features (which of the 23 pieces it enters first) before touching the tolerance.

- [ ] **Step 6: Run the ratchet (in the background)**

The bed's iteration is reorganised, so every digest must be bit-identical to Task 1's. Run the four runs of Task 2
Step 9 with `-task3` in place of `-task2`, and compare each against the baseline as there.
Expected: no output from any diff, apart from any run Task 2 listed as saturated (compare those against Task 2's
output instead). Any other difference is a defect: stop.

- [ ] **Step 7: Run every check**

Run, one per call: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`.
Expected: all pass.

- [ ] **Step 8: Commit**

Stage `src/engine/impact/contacts.ts`, `src/engine/impact/turfBed.ts`, `tests/engine/support/impact.ts`,
`tests/engine/impact/underside.test.ts`.

Message: `Find the head's underside over each turf column, round or rounded box`

---
### Task 4: The head–turf law

Spec §4.2, §4.3, §6.2, §6.3 (the new `SurfaceProps` fields), §7.1 cases 1–4 and 6 on the law alone; decisions 1–7,
16 and 21.

**Files:**
- Modify: `reference/contact.json`, `src/reference/index.ts`, `tests/reference/reference.test.ts` (`turfYield`,
  `turfMatStrength`, `turfPloughFactor`)
- Modify: `src/engine/types.ts` (`SurfaceProps.turfYield`, `turfMatStrength`), `src/engine/world.ts`
- Modify: `src/engine/impact/types.ts` (`HeadTurfLaw`)
- Create: `src/engine/impact/headTurf.ts`
- Modify: `tests/engine/support/fixtures.ts` (`TEST_TURF`), `tests/engine/support/impact.ts` (`testHeadTurf`)
- Modify: `tests/engine/world.test.ts` (the new fields' rows)
- Create: `tests/engine/impact/headTurfLaw.test.ts`

**Interfaces:**
- Consumes: Task 3's `headUnderside`, `headExtent`, `cellKey`, `columnSpan`, `mirrorPairsOver`, `TEST_SHARP`.
- Produces:
  - `HeadTurfLaw { modulus, recovery, yieldPressure, matStrength, ploughFactor, friction, cell }` (impact/types.ts);
  - `HEAD_TURF_FRICTION`, `PLOUGH_FACTOR`, `HEAD_REST_SPEED` (headTurf.ts);
  - `HeadTurfBed`, `newHeadTurfBed(law: HeadTurfLaw): HeadTurfBed`;
  - `headTurfLawOf(surface: SurfaceProps): HeadTurfLaw`;
  - `HeadTurfLoad { force, torque, bearing, resistance, cap, depth, closing, slip, sliding, yielded, columns }`;
  - `headTurfLoad(bed: HeadTurfBed, s: HeadState, head: MalletHead, dt: number, aim: Vec3): HeadTurfLoad | null`;
  - `SurfaceProps.turfYield`, `SurfaceProps.turfMatStrength` (Pa);
  - `testHeadTurf(o?: Partial<HeadTurfLaw>): HeadTurfLaw` (tests/engine/support/impact.ts).

- [ ] **Step 1: The reference entries**

In `reference/contact.json`, after `headDeepLimit`, add the three entries below. Each source string is the citation
Task 1 Step 5 confirmed, in the file's style.

```json
    "turfYield": {
        "value": 240000,
        "unit": "Pa",
        "bounds": [172000, 310000],
        "source": "<Crum's citation, as Task 1 found it>, https://archive.lib.msu.edu/tic/mitgc/article/199959.pdf",
        "provenance": "derived",
        "note": "p_y, the turf's bearing yield under the mallet head (P2b.2b.2b.3 design §4.2, §6.2): a column of the head's turf bears k_w·e until k_w·e reaches it, then yields and keeps a set. Crum gives sand rootzones' ultimate bearing \"on the order of 45 psi\" well graded and \"up to 25 psi\" poorly graded: 310 and 172 kPa, the bounds; the default 240 kPa lies between them. One well-grassed, fairly firm lawn, not turf in general (user, 2026-10-14: \"very variable depending on the consistency and moistness of the turf\"); P3's lawn presets vary it."
    },
    "turfMatStrength": {
        "value": 105000,
        "unit": "Pa",
        "bounds": [73000, 138000],
        "source": "<Mascitti, McNitt and Serensits 2017's citation, as Task 1 found it>, https://propel.umass.edu/sites/default/files/publications/2026-04/Mascitti%20et%20al.%2C%202017.pdf",
        "provenance": "derived",
        "note": "c, the root mat's shear strength, Reece's cohesion (design §4.3, §6.2). Mascitti et al.'s shear vane read 17.8–33.6 N·m with a 7.0 cm head of 12 fins 2.0 cm high (<Task 1's finding on the fins>). The conversion is ours: a vane inserted from the surface shears its sides and its bottom end, T = π·c·(D²H/2 + D³/12) = 2.437e-4 m³·c with D 7.0 cm and H 2.0 cm, so c is 73–138 kPa, the bounds, and 105 kPa, the default. The other end conditions bound the doubt: both ends sheared give 53–101 kPa, the sides alone 116–218 kPa. Anderson et al. 2018 find a clay rootzone's vane strength falling from 204 to 64 kPa as it wets. One lawn's spread, not the range of lawns; P3's presets vary it."
    },
    "turfPloughFactor": {
        "value": 1.71,
        "unit": "1",
        "source": "<Mak and Chen 2014's citation, as Task 1 found it>, https://library.csbe-scgab.ca/docs/journal/56/C14202.pdf (after Reece 1964)",
        "provenance": "analogue",
        "note": "N_c, Reece's cohesion factor in D = (ρ·g·d²·N_γ + c·d·N_c + ρ·v²·d·N_a)·w (P2b.2b.2b.3 design §4.3): Mak and Chen's shallowest tabulated depth at rake 18.5°. Labelled: no open table against rake was found, and the head's ploughing depths are millimetres against their 50 mm. The law keeps the cohesion term alone: at d = 2 mm and 3 m/s across 57 mm it gives 20.5 N, the inertia term 0.5 N and the weight term 0.01 N (their N_γ 2.45 and N_a 0.35, a rootzone of 1.2–1.6 Mg/m³ after Anderson et al. 2018). A reference constant, not a SurfaceProps field."
    },
```

In `headTurfFriction`'s note, replace "P2b.2b.2 sources it, and decides whether a heel ploughing into the turf needs a
drag term." with "P2b.2b.2b.3 keeps it as the sole's friction, beside the ploughing (turfMatStrength,
turfPloughFactor)." In `headDeepLimit`'s note, replace "A model limit, not a property of turf. … not credible for it."
up to "Provisional." with: "Not a property of turf: a head driven more than this below the turf plane has gone beyond a
graze and has probably damaged the lawn, and raises impact-head-deep (P2b.2b.2b.3 design §4.4). Since P2b.2b.2b.3 it
is no longer a limit of the model, which ploughs at any depth." Keep its upper-bound sentence.

In `src/reference/index.ts`, after `headDeepLimit`, add:

```ts
    turfYield: readValue(contactJson, "turfYield", "contact"),
    turfMatStrength: readValue(contactJson, "turfMatStrength", "contact"),
    turfPloughFactor: readValue(contactJson, "turfPloughFactor", "contact"),
```

and in `contactReference`'s doc comment, "the head–turf pair" becomes "the head–turf law (its sole's friction, the
turf's yield, the root mat's strength and N_c)".

In `tests/reference/reference.test.ts`, beside the `headDeepLimit` expectation:

```ts
        expect(contactReference.turfYield.value).toBe(240000);
        expect(contactReference.turfYield.bounds).toEqual([172000, 310000]);
        expect(contactReference.turfMatStrength.value).toBe(105000);
        expect(contactReference.turfMatStrength.bounds).toEqual([73000, 138000]);
        expect(contactReference.turfPloughFactor.value).toBe(1.71);
```

- [ ] **Step 2: The surface and the law's type**

`src/engine/types.ts`, `SurfaceProps`: add after `bedRecovery`:

```ts
    readonly turfYield: number;
    readonly turfMatStrength: number;
```

and to its doc comment: "`turfYield` (Pa) and `turfMatStrength` (Pa) are the turf's bearing yield p_y and its root
mat's strength c under the mallet head (P2b.2b.2b.3 design §4, §6.3), which vary from lawn to lawn."

`src/engine/world.ts`: in `defaultWorld`'s surface, after `bedRecovery`, add
`turfYield: contactReference.turfYield.value,` and `turfMatStrength: contactReference.turfMatStrength.value,`. In
`validateWorld`, after the `bedRecovery` check, add:

```ts
    requirePositive(surface.turfYield, "lawn.turfYield");
    requirePositive(surface.turfMatStrength, "lawn.turfMatStrength");
```

`tests/engine/support/fixtures.ts`: `TEST_TURF` gains `turfYield: 2e5, turfMatStrength: 1e5` (keep its other fields
until Task 5), and its comment becomes "Ball–turf and head–turf figures of the test lawn (impact phase). Plausible,
not sourced."

`tests/engine/world.test.ts`: in the rejection table, after the bed recovery row, add two rows in the same shape,
"non-positive turf yield" (`turfYield: 0`) and "non-positive root mat strength" (`turfMatStrength: -1`). In
"builds a valid world", add `expect(surface.turfYield).toBeGreaterThan(0);` and
`expect(surface.turfMatStrength).toBeGreaterThan(0);`.

`src/engine/impact/types.ts`, after `BedLaw`:

```ts
/**
 * The head–turf law (P2b.2b.2b.3 design §4): the turf bed's modulus k_w (N/m³) and recovery τ_r (s) under the head,
 * the turf's bearing yield p_y (Pa), the root mat's strength c (Pa), Reece's cohesion factor N_c, the sole's friction
 * µ, and the column's side h (m), the bed's own lattice.
 */
export interface HeadTurfLaw {
    readonly modulus: number;
    readonly recovery: number;
    readonly yieldPressure: number;
    readonly matStrength: number;
    readonly ploughFactor: number;
    readonly friction: number;
    readonly cell: number;
}
```

`tests/engine/support/impact.ts`, after `testBed`:

```ts
/**
 * A plausible test head–turf law (P2b.2b.2b.3 design §4) on the test bed: k_w 3e8 N/m³, τ_r 2 ms, p_y 200 kPa (so a
 * fresh column yields at 0.67 mm), c 100 kPa, N_c 1.7, µ 0.5, 2 mm columns. Unsourced, as fixtures.ts. `o` overrides.
 */
export function testHeadTurf(o: Partial<HeadTurfLaw> = {}): HeadTurfLaw {
    return {
        modulus: TEST_TURF.bedModulus,
        recovery: TEST_TURF.bedRecovery,
        yieldPressure: TEST_TURF.turfYield,
        matStrength: TEST_TURF.turfMatStrength,
        ploughFactor: 1.7,
        friction: 0.5,
        cell: BED_CELL,
        ...o,
    };
}
```

(import `HeadTurfLaw` with the other types).

- [ ] **Step 3: Write the failing tests**

Create `tests/engine/impact/headTurfLaw.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TANGENTIAL_STIFFNESS_RATIO } from "../../../src/engine/impact/contactLaw";
import {
    HEAD_REST_SPEED,
    headTurfLoad,
    newHeadTurfBed,
    type HeadTurfLoad,
} from "../../../src/engine/impact/headTurf";
import { IDENTITY, axisAngle, multiply, type Quaternion } from "../../../src/engine/impact/rigidBody";
import type { BoxShape } from "../../../src/engine/impact/shape";
import type { HeadState } from "../../../src/engine/impact/types";
import { ZERO, add, length, scale, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import {
    TEST_BOX,
    TEST_RHO,
    TEST_SHARP,
    mirrorQuat,
    mirrorSpin,
    mirrorVec,
    testHeadTurf,
} from "../support/impact";

const DT = 1e-5;
const AIM = vec3(1, 0, 0);
const LAW = testHeadTurf();
const H = LAW.cell;
/** p_y/k_w: the depth (m) at which a fresh column yields, 0.67 mm on the test law. */
const YIELD = LAW.yieldPressure / LAW.modulus;
/** The sharp box's rows of columns across aim when centred over y = 0 (TEST_SHARP's comment). */
const ROWS = 32;

const rel = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);
const same = (a: Vec3, b: Vec3): boolean => a.x === b.x && a.y === b.y && a.z === b.z;

function state(position: Vec3, velocity: Vec3 = ZERO, orientation: Quaternion = IDENTITY, spin: Vec3 = ZERO): HeadState {
    return { position, orientation, velocity, angularVelocity: spin };
}

/** The level sharp box, its sole `depth` below the turf, centred over (x, 0), moving at `velocity`. */
const sunk = (depth: number, x = 0, velocity: Vec3 = ZERO): HeadState =>
    state(vec3(x, 0, TEST_RHO - depth), velocity);

/** The lattice columns whose centres lie under the level sharp box centred over (x, 0), its edges included. */
function under(x = 0): number {
    const { halfWidth } = TEST_SHARP.shape as BoxShape;
    let n = 0;
    for (let i = -300; i < 300; i++) {
        for (let j = -40; j < 40; j++) {
            if (Math.abs((i + 0.5) * H - x) <= TEST_SHARP.length / 2 && Math.abs((j + 0.5) * H) <= halfWidth) {
                n++;
            }
        }
    }
    return n;
}

describe("bearing (P2b.2b.2b.3 design §4.2; §7.1 case 1)", () => {
    it("bears k_w·δ·A for a level box pressed statically below yield, and p_y·A past it", () => {
        const A = under() * H * H;
        const below = headTurfLoad(newHeadTurfBed(LAW), sunk(0.5 * YIELD), TEST_SHARP, DT, AIM) as HeadTurfLoad;
        expect(rel(below.bearing, LAW.modulus * 0.5 * YIELD * A)).toBeLessThan(1e-12);
        expect(below.yielded).toBe(false);
        expect(below.columns).toBe(under());
        expect(length(below.resistance)).toBe(0);
        const past = headTurfLoad(newHeadTurfBed(LAW), sunk(3 * YIELD), TEST_SHARP, DT, AIM) as HeadTurfLoad;
        expect(rel(past.bearing, LAW.yieldPressure * A)).toBeLessThan(1e-12);
        expect(past.yielded).toBe(true);
    });

    it("unloads a yielded column only by its elastic part: a press-and-release cycle loses the plastic work", () => {
        // A law whose yield depth is a binary fraction, y = 2^-11 m, so that every press depth k·2^-17 m is exact and
        // the force's kinks, at the yield and at the set, are nodes of the trapezoid rule, exact on the piecewise
        // linear law. Pressed to 3y and released: in A·p_y·(y/2 + 2y), out A·p_y·y/2, lost A·p_y·s with s = 2y.
        const modulus = 3e8;
        const y = 2 ** -11;
        const law = testHeadTurf({ modulus, yieldPressure: modulus * y });
        const bed = newHeadTurfBed(law);
        const step = 2 ** -17;
        const top = 192;
        const force = (k: number): number => headTurfLoad(bed, sunk(k * step), TEST_SHARP, DT, AIM)?.bearing ?? 0;
        let previous = 0;
        let input = 0;
        for (let k = 1; k <= top; k++) {
            const f = force(k);
            input += 0.5 * (previous + f) * step;
            previous = f;
        }
        let output = 0;
        for (let k = top - 1; k >= 0; k--) {
            const f = force(k);
            output += 0.5 * (previous + f) * step;
            previous = f;
        }
        const plastic = under() * H * H * law.yieldPressure * (top * step - y);
        expect(rel(input - output, plastic)).toBeLessThan(1e-9);
    });
});

describe("ploughing and the sole's friction (design §4.3; §7.1 case 2)", () => {
    it("resists a box translated at constant depth, its spring sliding, with w·d·c·N_c + µ·N_b", () => {
        // Along aim the strips are the lattice's rows, 32 under the sharp box, each ploughing fresh turf at the box's
        // depth d (plan decision 1), so the ploughing is w·d·c·N_c with w = 32·h. Past yield every column bears p_y,
        // so N_b = p_y·h²·n; the spring slides once its stretch passes F_cap/k_t, within a few steps at 1 m/s.
        const d = 3 * YIELD;
        const bed = newHeadTurfBed(LAW);
        let load: HeadTurfLoad | null = null;
        for (let k = 0; k < 400; k++) {
            load = headTurfLoad(bed, sunk(d, k * DT, vec3(1, 0, 0)), TEST_SHARP, DT, AIM);
        }
        const last = load as HeadTurfLoad;
        const ploughing = ROWS * H * d * LAW.matStrength * LAW.ploughFactor;
        const expected = ploughing + LAW.friction * LAW.yieldPressure * H * H * last.columns;
        expect(last.sliding).toBe(true);
        expect(rel(last.cap, expected)).toBeLessThan(1e-12);
        expect(rel(length(last.resistance), last.cap)).toBeLessThan(1e-12);
        expect(last.resistance.x).toBeLessThan(0);
    });

    it("gives nothing for a head exactly on the turf plane, or above it", () => {
        // Review focus 1: the sole exactly at z = 0 touches the turf without entering it.
        const bed = newHeadTurfBed(LAW);
        bed.spring = vec3(1e-6, 0, 0);
        expect(headTurfLoad(bed, sunk(0), TEST_SHARP, DT, AIM)).toBeNull();
        expect(same(bed.spring, ZERO)).toBe(true);
        expect(headTurfLoad(bed, sunk(-1e-3), TEST_SHARP, DT, AIM)).toBeNull();
    });

    it("orients the strips along aim while the trial is zero", () => {
        // Review focus 3. A box pressed straight down has no horizontal slip and no spring: the strips lie along aim.
        // Along +x they are the 32 rows, along +y the 116 columns along the box; there is no resistance and no NaN.
        const d = 0.5 * YIELD;
        const down = sunk(d, 0, vec3(0, 0, -0.5));
        for (const [aim, strips] of [
            [vec3(1, 0, 0), ROWS],
            [vec3(0, 1, 0), 116],
        ] as const) {
            const load = headTurfLoad(newHeadTurfBed(LAW), down, TEST_SHARP, DT, aim) as HeadTurfLoad;
            const ploughing = strips * H * d * LAW.matStrength * LAW.ploughFactor;
            expect(rel(load.cap, ploughing + LAW.friction * load.bearing)).toBeLessThan(1e-12);
            expect(length(load.resistance)).toBe(0);
        }
    });

    it("ploughs only below the floor it left when it moves back along its furrow", () => {
        // Plan decision 1. Forward 0.1 m at depth d past yield, every column the box leaves keeps the set s = d − y.
        // Lifted out and lowered into its furrow, the box arrives over columns whose floor is −s, so each strip
        // ploughs d − s = y: the furrow is not ploughed again.
        const d = 3 * YIELD;
        const bed = newHeadTurfBed(LAW);
        for (let k = 0; k <= 1000; k++) {
            headTurfLoad(bed, sunk(d, k * 1e-4, vec3(1, 0, 0)), TEST_SHARP, 1e-4, AIM);
        }
        expect(headTurfLoad(bed, sunk(-0.01, 0.05), TEST_SHARP, 1e-4, AIM)).toBeNull();
        const back = headTurfLoad(bed, sunk(d, 0.05, vec3(-1, 0, 0)), TEST_SHARP, 1e-4, AIM) as HeadTurfLoad;
        const ploughing = back.cap - LAW.friction * back.bearing;
        expect(rel(ploughing, ROWS * H * YIELD * LAW.matStrength * LAW.ploughFactor)).toBeLessThan(1e-9);
    });
});

describe("the dead stop (design §4.3; §7.1 case 3)", () => {
    it("brings a free head at fixed depth to rest within m·v₀²/(2·F_cap) and its spring's travel, then holds it", () => {
        // The box slides at 2 m/s, 0.5·y deep (below yield, so its columns stay elastic), its depth held. While the
        // spring slides the cap decelerates it, so it slides at most m·v₀²/(2·F_cap); the spring then sticks, holding
        // it within its elastic travel F_cap/k_t, and its dashpot (plan decision 2, overdamped on the test law) brings
        // it to rest. The cap varies by a column as the sole crosses the lattice, so the bound takes its least.
        const depth = 0.5 * YIELD;
        const m = TEST_SHARP.mass;
        const v0 = 2;
        const bed = newHeadTurfBed(LAW);
        let x = 0;
        let v = v0;
        let low = Infinity;
        let high = 0;
        let softest = Infinity;
        let restAt = -1;
        for (let k = 0; k < 200000 && (restAt < 0 || k < restAt + 2000); k++) {
            const load = headTurfLoad(bed, sunk(depth, x, vec3(v, 0, 0)), TEST_SHARP, DT, AIM) as HeadTurfLoad;
            low = Math.min(low, load.cap);
            high = Math.max(high, load.cap);
            softest = Math.min(softest, TANGENTIAL_STIFFNESS_RATIO * LAW.modulus * H * H * load.columns);
            v += (load.resistance.x / m) * DT;
            x += v * DT;
            if (restAt < 0 && !load.sliding && Math.abs(v) < HEAD_REST_SPEED) {
                restAt = k;
            }
            if (restAt >= 0) {
                expect(Math.abs(v), `step ${k}`).toBeLessThan(HEAD_REST_SPEED);
                expect(load.sliding, `step ${k}`).toBe(false);
            }
        }
        expect(restAt).toBeGreaterThan(0);
        expect(x).toBeLessThanOrEqual((m * v0 * v0) / (2 * low) + high / softest);
    });
});

describe("the angle of attack (design §4.3; §7.1 case 4)", () => {
    it("gives a steeper path a greater peak resistance, entering at the same speed and depth", () => {
        // A level sharp box driven at 2 m/s along a straight path φ below horizontal, from its sole on the turf until
        // its sole is 3·y deep. At that depth the geometry is the same whatever φ: every column under the sole has
        // yielded to the same set and ploughs fresh turf at the same depth. The steeper path presses down faster,
        // e′ = v·sin φ, so its columns bear more through the bed's recovery, and the cap is greater.
        const peaks = [5, 10, 20, 40, 80].map((degrees) => {
            const phi = (degrees * Math.PI) / 180;
            const velocity = vec3(2 * Math.cos(phi), 0, -2 * Math.sin(phi));
            const bed = newHeadTurfBed(LAW);
            let peak = 0;
            for (let k = 1; ; k++) {
                const t = k * DT;
                const depth = 2 * Math.sin(phi) * t;
                const at = state(vec3(velocity.x * t, 0, TEST_RHO - depth), velocity);
                peak = Math.max(peak, headTurfLoad(bed, at, TEST_SHARP, DT, AIM)?.cap ?? 0);
                if (depth >= 3 * YIELD) {
                    return peak;
                }
            }
        });
        for (let k = 1; k < peaks.length; k++) {
            expect(peaks[k]).toBeGreaterThan(peaks[k - 1] as number);
        }
    });
});

describe("symmetry and convergence (design §7.1 case 6)", () => {
    it("gives a box mirrored across y = 0 the mirrored load, to the bit", () => {
        const q = multiply(axisAngle(vec3(0, 0, 1), 0.2), axisAngle(vec3(0, 1, 0), -0.08));
        const start = state(vec3(0.0137, 0.0071, 0.02), vec3(1.5, 0.4, -0.3), q, vec3(0.5, -2, 1));
        const mirrored = state(
            mirrorVec(start.position),
            mirrorVec(start.velocity),
            mirrorQuat(q),
            mirrorSpin(start.angularVelocity),
        );
        const moved = (h: HeadState, k: number): HeadState => ({
            ...h,
            position: add(h.position, scale(h.velocity, k * DT)),
        });
        const a = newHeadTurfBed(LAW);
        const b = newHeadTurfBed(LAW);
        let loaded = 0;
        for (let k = 0; k < 60; k++) {
            const la = headTurfLoad(a, moved(start, k), TEST_BOX, DT, AIM);
            const lb = headTurfLoad(b, moved(mirrored, k), TEST_BOX, DT, AIM);
            if (la === null) {
                expect(lb).toBeNull();
                continue;
            }
            loaded++;
            const l = lb as HeadTurfLoad;
            expect(same(l.force, mirrorVec(la.force)), `step ${k}`).toBe(true);
            expect(same(l.torque, mirrorSpin(la.torque)), `step ${k}`).toBe(true);
            expect(l.cap).toBe(la.cap);
            expect(l.sliding).toBe(la.sliding);
        }
        expect(loaded).toBeGreaterThan(10);
    });

    it("converges with the lattice: a tilted box's bearing within a boundary column's share of the exact", () => {
        // The sharp box pitched by 0.1 rad, its heel 3 mm deep, still: the sole's waterline runs across it, and every
        // column a distance x_h behind the waterline is pressed δ = x_h·tan φ. Statically each bears min(k_w·δ, p_y),
        // so N_b = 2·h_y·p_y·(X − x_y/2), X = δ_heel/tan φ and x_y = y/tan φ. A lattice of side h misses at most a
        // boundary column's share, about h/X, which falls with h.
        const phi = 0.1;
        const q = axisAngle(vec3(0, 1, 0), phi);
        const { halfWidth, halfHeight } = TEST_SHARP.shape as BoxShape;
        const half = TEST_SHARP.length / 2;
        // The heel is the sole's −x end under a positive pitch about +y; put it 3 mm deep.
        const heel = 0.003;
        const z = 0 - heel + half * Math.sin(phi) + halfHeight * Math.cos(phi);
        const tilted = state(vec3(0.0003, 0.0001, z), ZERO, q);
        const X = heel / Math.tan(phi);
        const exact = 2 * halfWidth * LAW.yieldPressure * (X - YIELD / Math.tan(phi) / 2);
        for (const cell of [0.002, 0.001, 0.0005]) {
            const load = headTurfLoad(newHeadTurfBed(testHeadTurf({ cell })), tilted, TEST_SHARP, DT, AIM) as HeadTurfLoad;
            expect(rel(load.bearing, exact), `cell ${cell}`).toBeLessThan((2 * cell) / X);
        }
    });
});
```

Check the heel's sign while writing the last case: with `axisAngle(ŷ, φ)` the body x axis tilts to (cos φ, 0, −sin φ),
so the +x end goes down. If so, the heel (the lowest end) is the +x end: keep the formula for z (the lowest corner is
at height z − half·sin φ − h_z·cos φ either way) and fix only the comment.

- [ ] **Step 4: Run them**

Run: `npx vitest run tests/engine/impact/headTurfLaw.test.ts`
Expected: FAIL: the module `headTurf` does not exist.

- [ ] **Step 5: Write `src/engine/impact/headTurf.ts`**

```ts
/**
 * The head–turf law (P2b.2b.2b.3 design §4). The turf is the plane z = 0 and its soil is fixed in the world, so the
 * law's state lives on the turf bed's world lattice (BED_CELL; cell (i, j) centred at ((i + ½)·h, (j + ½)·h)): a
 * column the head has yielded keeps its new floor as the head moves on, and a furrow stays behind it.
 *
 * Each step, while the head's lowest point is below the plane, the law visits every column under the head's
 * horizontal extent, padded one cell, in mirror pairs across y = 0 as the balls' bed does (turfBed.ts
 * mirrorPairsOver). A column is submerged while the head's underside over its centre (headUnderside) lies below
 * z = 0, δ deep:
 * - bearing (§4.2): each column is elastic–plastic, with a set s ≥ 0, its surface at −s and its elastic deflection
 *   e = δ − s. While k_w·e > p_y the set moves to δ − p_y/k_w; it never falls. A column with e > 0 bears
 *   h²·max(0, k_w·(e + τ_r·e′)) upward at its point on the underside, e′ = −u_z of the head's material there;
 * - ploughing (§4.3; plan decision 1, user ruling 2026-10-15): the bearing columns are binned into strips h wide
 *   across the horizontal spring's trial. A strip's ploughing depth is its deepest column's depth below the floor that
 *   column had when the head arrived over it (0 in fresh turf, −s in a furrow the head left), and it resists with up
 *   to h·d_s·c·N_c;
 * - the sole's friction: up to µ·N_b, N_b the bearing's total;
 * - one horizontal Cundall–Strack spring carries both (plan decision 2, user ruling 2026-10-15), with the turf bed's
 *   tangential law over the n bearing columns, k_t = (2/7)·k_w·h²·n and c_t = √(2/7)·k_w·τ_r·h²·n, as bedLoad's,
 *   capped at F_cap = µ·N_b + Σ h·d_s·c·N_c. It acts at the resistance's centre, the strips' points and the bearing's
 *   centre of pressure weighted by their shares of F_cap, and slips on the head's material's horizontal velocity
 *   there. It sticks within the cap, so a head can come to rest in the turf.
 *
 * Determinism. A column's update depends only on the column and the head. The bearing's sums run over each mirror pair
 * first, then over the pairs in ascending (i, p) order; the strips' over each mirror pair of strips (k, −k − 1), then
 * ascending p = max(k, −k − 1) (plan decision 5). A set-up mirrored across y = 0 therefore gives the mirrored load
 * bit for bit.
 */
import { contactReference } from "../../reference/index";
import { ZERO, add, cross, horizontal, length, scale, sub, vec3, type Vec3 } from "../math/vec3";
import type { SurfaceProps } from "../types";
import { TANGENTIAL_STIFFNESS_RATIO, carrySpring, tangentialForce, type PairLaw } from "./contactLaw";
import { headExtent, headLowestPoint, headUnderside, pointVelocity } from "./contacts";
import { BED_CELL, cellKey, columnSpan, mirrorPairsOver } from "./turfBed";
import type { HeadState, HeadTurfLaw, MalletHead } from "./types";

/**
 * Friction of the head's sole on the turf (P2b.2b.1 design §4.1; reference/contact.json): the analogue of a ball
 * sliding on the turf.
 */
export const HEAD_TURF_FRICTION = contactReference.headTurfFriction.value;

/** N_c (design §4.3, §6.2; reference/contact.json): Reece's cohesion factor, Mak & Chen's shallowest table. */
export const PLOUGH_FACTOR = contactReference.turfPloughFactor.value;

/**
 * Horizontal speed (m/s) below which a head whose spring sticks is at rest in the turf (design §4.3). Numerical, not
 * physical: FINISH_SPEED's millimetre a second.
 */
export const HEAD_REST_SPEED = 1e-3;

const UP = vec3(0, 0, 1);
const ROOT_RATIO = Math.sqrt(TANGENTIAL_STIFFNESS_RATIO);

/**
 * A column the head has borne on (design §4.2; plan decision 1): its set s (m), the floor it had when the head last
 * arrived over it (m), and the load that last found it bearing.
 */
interface Column {
    set: number;
    entry: number;
    seen: number;
}

/**
 * The head's turf in one run (design §4): its law, the columns it has borne on, keyed as the bed's cells (cellKey),
 * its horizontal spring ξ and the tangential stiffness that spring last carried (0 while no column bears), the loads
 * so far, and the columns the last load visited (a cost count; plan decision 21).
 */
export interface HeadTurfBed {
    readonly law: HeadTurfLaw;
    readonly columns: Map<number, Column>;
    spring: Vec3;
    tangent: number;
    step: number;
    visits: number;
}

/** A head's turf with no column met yet. */
export function newHeadTurfBed(law: HeadTurfLaw): HeadTurfBed {
    return { law, columns: new Map(), spring: ZERO, tangent: 0, step: 0, visits: 0 };
}

/**
 * The head–turf law at a lawn surface (design §2, §6.2): the bed's modulus and recovery, the turf's yield and root
 * mat, N_c, the sole's friction and BED_CELL.
 */
export function headTurfLawOf(surface: SurfaceProps): HeadTurfLaw {
    return {
        modulus: surface.bedModulus,
        recovery: surface.bedRecovery,
        yieldPressure: surface.turfYield,
        matStrength: surface.turfMatStrength,
        ploughFactor: PLOUGH_FACTOR,
        friction: HEAD_TURF_FRICTION,
        cell: BED_CELL,
    };
}

/** The turf's load on the head in one step (design §4), world frame. */
export interface HeadTurfLoad {
    /** The bearing and the horizontal resistance (N), and their moment about the head's centre (N·m). */
    readonly force: Vec3;
    readonly torque: Vec3;
    /** N_b, the bearing's total (N), upward. */
    readonly bearing: number;
    /** The horizontal resistance (N) and its cap F_cap (N). */
    readonly resistance: Vec3;
    readonly cap: number;
    /** The deepest bearing column's δ (m) and its e′ (m/s), how fast the head closes on it (plan decision 6). */
    readonly depth: number;
    readonly closing: number;
    /** The horizontal slip (m/s) of the head's material at the resistance's centre. */
    readonly slip: Vec3;
    /** True when the spring slid at its cap. */
    readonly sliding: boolean;
    /** True when a column yielded. */
    readonly yielded: boolean;
    /** n, the bearing columns. */
    readonly columns: number;
}

/** One bearing column in one load: its force (N, upward), point, ploughing depth (m), δ (m) and e′ (m/s). */
interface Bearing {
    readonly force: number;
    readonly point: Vec3;
    readonly plough: number;
    readonly depth: number;
    readonly rate: number;
}

/**
 * Column (i, j) under the head (design §4.2; plan decision 1), counting the visit: null unless the head's underside
 * over its centre, `under(x, y)`, lies below the column's floor −s. A column the head arrives over takes its floor as
 * its entry floor; its set moves to δ − p_y/k_w while k_w·e > p_y (calling `onYield`); it bears
 * h²·max(0, k_w·(e + τ_r·e′)).
 */
function bear(
    bed: HeadTurfBed,
    s: HeadState,
    under: (x: number, y: number) => number,
    i: number,
    j: number,
    onYield: () => void,
): Bearing | null {
    bed.visits += 1;
    const { law } = bed;
    const h = law.cell;
    const x = (i + 0.5) * h;
    const y = (j + 0.5) * h;
    const z = under(x, y);
    if (!(z < 0)) {
        return null;
    }
    const depth = 0 - z;
    const key = cellKey(i, j);
    let column = bed.columns.get(key);
    if (column === undefined) {
        column = { set: 0, entry: 0, seen: -1 };
        bed.columns.set(key, column);
    }
    if (!(depth - column.set > 0)) {
        return null;
    }
    if (column.seen !== bed.step - 1) {
        column.entry = column.set;
    }
    column.seen = bed.step;
    if (law.modulus * (depth - column.set) > law.yieldPressure) {
        column.set = depth - law.yieldPressure / law.modulus;
        onYield();
    }
    const point = vec3(x, y, z);
    const rate = 0 - pointVelocity(s.position, s.velocity, s.angularVelocity, point).z;
    const pressure = law.modulus * (depth - column.set + law.recovery * rate);
    return { force: pressure > 0 ? h * h * pressure : 0, point, plough: depth - column.entry, depth, rate };
}

/** A bearing column's moment of its force about `centre` (N·m). */
function turnOf(c: Bearing, centre: Vec3): Vec3 {
    return cross(sub(c.point, centre), vec3(0, 0, c.force));
}

/**
 * Updates `bed` under head state `s` and returns the turf's load on `head` for a step of `dt` (design §4), or null
 * while no column bears (the spring then reset). `aim` (unit, horizontal) orients the strips while the spring's trial
 * is zero (plan decision 3).
 */
export function headTurfLoad(
    bed: HeadTurfBed,
    s: HeadState,
    head: MalletHead,
    dt: number,
    aim: Vec3,
): HeadTurfLoad | null {
    bed.step += 1;
    bed.visits = 0;
    const { law } = bed;
    const h = law.cell;
    const bearings: Bearing[] = [];
    let bearing = 0;
    let torque = ZERO;
    let moment = ZERO;
    let yields = 0;
    const onYield = (): void => {
        yields += 1;
    };
    if (headLowestPoint(s, head) < 0) {
        const under = headUnderside(s, head);
        const extent = headExtent(s, head);
        const [i0, i1] = columnSpan(s.position.x, extent.x, h);
        const [j0, j1] = columnSpan(s.position.y, extent.y, h);
        mirrorPairsOver(i0, i1, j0, j1, (i, ja, jb) => {
            const a = ja === null ? null : bear(bed, s, under, i, ja, onYield);
            const b = jb === null ? null : bear(bed, s, under, i, jb, onYield);
            if (a === null && b === null) {
                return;
            }
            if (a !== null) {
                bearings.push(a);
            }
            if (b !== null) {
                bearings.push(b);
            }
            if (a !== null && b !== null) {
                bearing += a.force + b.force;
                torque = add(torque, add(turnOf(a, s.position), turnOf(b, s.position)));
                moment = add(moment, add(scale(a.point, a.force), scale(b.point, b.force)));
                return;
            }
            const one = (a ?? b) as Bearing;
            bearing += one.force;
            torque = add(torque, turnOf(one, s.position));
            moment = add(moment, scale(one.point, one.force));
        });
    }
    const n = bearings.length;
    if (n === 0) {
        bed.spring = ZERO;
        bed.tangent = 0;
        return null;
    }
    let deepest = bearings[0] as Bearing;
    for (const c of bearings) {
        if (c.depth > deepest.depth) {
            deepest = c;
        }
    }
    // The bearing's centre of pressure, or the deepest column's point where no column presses (plan decision 7).
    const pressure = bearing > 0 ? scale(moment, 1 / bearing) : deepest.point;
    const stiffness = law.modulus * h * h * n;
    const damping = stiffness * law.recovery;
    const spring: PairLaw = {
        stiffness,
        damping,
        tangentialStiffness: TANGENTIAL_STIFFNESS_RATIO * stiffness,
        tangentialDamping: damping * ROOT_RATIO,
        friction: 1,
    };
    const carried = carrySpring(bed.spring, UP, bed.tangent, spring.tangentialStiffness);
    // The strips lie across the trial at the centre of pressure, along aim while it is zero (plan decision 3).
    const lead = add(carried, scale(horizontal(pointVelocity(s.position, s.velocity, s.angularVelocity, pressure)), dt));
    const reach = length(lead);
    const along = reach > 0 ? scale(lead, 1 / reach) : aim;
    const across = vec3(0 - along.y, along.x, 0);
    const strips = new Map<number, Bearing>();
    for (const c of bearings) {
        const k = Math.floor((c.point.x * across.x + c.point.y * across.y) / h);
        const best = strips.get(k);
        if (best === undefined || c.plough > best.plough) {
            strips.set(k, c);
        }
    }
    // Each strip's ploughing, summed over mirror pairs of strips in ascending p (plan decisions 4, 5).
    const perDepth = h * law.matStrength * law.ploughFactor;
    const order = [...new Set([...strips.keys()].map((k) => Math.max(k, 0 - k - 1)))].sort((a, b) => a - b);
    let ploughing = 0;
    let ploughMoment = ZERO;
    for (const p of order) {
        const a = strips.get(p);
        const b = strips.get(0 - p - 1);
        if (a !== undefined && b !== undefined) {
            const ra = perDepth * a.plough;
            const rb = perDepth * b.plough;
            ploughing += ra + rb;
            ploughMoment = add(ploughMoment, add(scale(a.point, ra), scale(b.point, rb)));
        } else {
            const one = (a ?? b) as Bearing;
            const r = perDepth * one.plough;
            ploughing += r;
            ploughMoment = add(ploughMoment, scale(one.point, r));
        }
    }
    const friction = law.friction * bearing;
    const cap = friction + ploughing;
    const centre = cap > 0 ? scale(add(scale(pressure, friction), ploughMoment), 1 / cap) : pressure;
    const slip = horizontal(pointVelocity(s.position, s.velocity, s.angularVelocity, centre));
    const tangential = tangentialForce(spring, add(carried, scale(slip, dt)), slip, cap);
    bed.spring = tangential.spring;
    bed.tangent = spring.tangentialStiffness;
    const resistance = tangential.force;
    return {
        force: add(vec3(0, 0, bearing), resistance),
        torque: add(torque, cross(sub(centre, s.position), resistance)),
        bearing,
        resistance,
        cap,
        depth: deepest.depth,
        closing: deepest.rate,
        slip,
        sliding: tangential.sliding,
        yielded: yields > 0,
        columns: n,
    };
}
```

Check that `horizontal` and `cross` are exported from `../math/vec3` (integrate.ts imports both).

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/engine/impact/headTurfLaw.test.ts tests/reference/reference.test.ts tests/engine/world.test.ts`
Expected: PASS.

A failure is traced before any expectation moves:

- **Case 1 or 2 off by whole columns:** `under()` and the underside disagree on a column at the sole's edge. Print the
  edge columns' underside and fix the geometry, not `under()`.
- **The dead stop never rests:** print v and `sliding` over the last 200 steps. A spring that keeps sliding means the
  cap is not reached by the dashpot's decay; check `carrySpring`'s use (it must be the bed's own pattern).
- **The angle of attack not monotonic:** print each φ's final bearing and ploughing. The bearing must rise with φ
  through τ_r·e′; a ploughing term that falls with φ means the entry floor is wrong (decision 1).
- **The mirror differs:** find the first step and field that differs. Within a step, the bearing's pair sums and the
  strips' pair sums must both follow decision 5.

- [ ] **Step 7: Run every check**

Run, one per call: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`.
Expected: all pass. Nothing in the engine calls the law yet, so no other test moves.

- [ ] **Step 8: Commit**

Stage the files above by path.

Message: `Add the head–turf law: elastic–plastic bearing, ploughing and the sole's friction on one spring`

---
### Task 5: The law wired in

Spec §2, §4.4, §4.6, §6.3, §7.1 case 6 (in the integrator), §7.2 step 2, §7.5; decisions 6, 13–15, 17 and 21.

**Files:**
- Modify: `src/engine/impact/integrate.ts` (the law, the settle test, `turf-yield`, `impact-head-stopped`,
  `follow-turf-yield`, `headTurfColumns`)
- Modify: `src/engine/impact/types.ts` (the events; `impact-head-deep`'s note)
- Modify: `src/engine/impact/simulateImpact.ts` (`headTurfLaw`, the head's turf validation; `HEAD_TURF_FRICTION`
  moved)
- Modify: `src/engine/impact/contacts.ts` (`headTurfContact` removed)
- Modify: `src/engine/types.ts`, `src/engine/world.ts` (`turfStiffness`, `turfRestitution` removed)
- Modify: `reference/contact.json`, `reference/friction.json`, `src/reference/index.ts`,
  `tests/reference/reference.test.ts` (`ballTurfStiffness`, `ballTurfRestitution` retired)
- Modify: `tests/engine/support/fixtures.ts` (`TEST_TURF`)
- Rewrite: `tests/engine/impact/headTurf.test.ts`
- Modify: `tests/engine/impact/contacts.test.ts`, `headBall.test.ts`, `hands.test.ts`, `simulateImpact.test.ts`,
  `tests/engine/world.test.ts`, and every test Step 8 finds moved

**Interfaces:**
- Consumes: Task 4's `headTurfLoad`, `newHeadTurfBed`, `headTurfLawOf`, `HEAD_REST_SPEED`, `testHeadTurf`.
- Produces:
  - `ImpactSetup.headTurf: HeadTurfLaw | null`;
  - the events `{ kind: "turf-yield"; t }` and `{ kind: "impact-head-stopped"; t }`;
  - `FollowFlag` gains `"follow-turf-yield"`;
  - `ImpactSnapshot.headTurfColumns?: number`, beside `headTurf`.

- [ ] **Step 1: Rewrite the head–turf tests (failing)**

Replace `tests/engine/impact/headTurf.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { HEAD_TURF_KEY } from "../../../src/engine/impact/contacts";
import { HEAD_REST_SPEED, headTurfLawOf } from "../../../src/engine/impact/headTurf";
import {
    HEAD_DEEP_LIMIT,
    IMPACT_CAP,
    IMPACT_DT,
    RELEASE_STEPS,
    integrate,
    type ImpactBall,
} from "../../../src/engine/impact/integrate";
import { IDENTITY, axisAngle, multiply, type Quaternion } from "../../../src/engine/impact/rigidBody";
import { prepareImpact, simulateImpact } from "../../../src/engine/impact/simulateImpact";
import { staticSink } from "../../../src/engine/impact/turfBed";
import type { HeadTurfLaw, MalletHead } from "../../../src/engine/impact/types";
import { ZERO, horizontal, length, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import type { SurfaceProps } from "../../../src/engine/types";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import { TEST_BALL, ballAt, testWorld } from "../support/fixtures";
import {
    TEST_BOX,
    TEST_HEAD,
    TEST_RHO,
    freeBall,
    isolated,
    levelArc,
    mirrorQuat,
    mirrorSpin,
    mirrorVec,
    onArc,
    strike,
    testBed,
    testHeadTurf,
    trackDrive,
} from "../support/impact";

const g = STANDARD_GRAVITY;
const R = TEST_BALL.radius;
const LAW = testHeadTurf();
const rel = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);
const same = (a: Vec3, b: Vec3): boolean => a.x === b.x && a.y === b.y && a.z === b.z;

/** An undriven `head` at `position`, under gravity, on the test head–turf law (or `law`); `balls` if any. */
function onTurf(
    head: MalletHead,
    position: Vec3,
    velocity: Vec3 = ZERO,
    orientation: Quaternion = IDENTITY,
    law: HeadTurfLaw = LAW,
    balls: readonly ImpactBall[] = [],
) {
    return isolated({
        head,
        start: { position, orientation, velocity, angularVelocity: ZERO },
        gravity: g,
        headTurf: law,
        balls,
    });
}

describe("the head–turf pair in the impact (P2b.2b.2b.3 design §4)", () => {
    it("ends a dropped box's impact with impact-head-stopped, RELEASE_STEPS after it first rests in the turf", () => {
        // §4.6. A level box set down with no horizontal speed is at rest in the turf from its first bearing step (its
        // spring never loads), and with no face contact the impact ends RELEASE_STEPS later.
        const run = integrate(onTurf(TEST_BOX, vec3(0, 0, TEST_RHO + 1e-4)), { cap: 0.05 });
        const line = run.timeline[HEAD_TURF_KEY] ?? [];
        expect(line.length).toBeGreaterThan(0);
        expect(run.events.map((e) => e.kind)).toEqual(["impact-head-stopped"]);
        expect(run.duration).toBeCloseTo((line[0]?.start as number) + RELEASE_STEPS * IMPACT_DT, 12);
    });

    it("stops a box sliding on the turf dead: impact-head-stopped, not impact-cap", () => {
        // §4.6, §7.4 regime 2 in small. TEST_BOX set down moving 0.1 m/s along aim: at its micrometre sink the sole's
        // friction, about µ·m·g, does nearly all the braking (the ploughing is a few hundredths of a newton), so it
        // stops within about v²/(2·µ·g), 1.0 mm, and comes to rest well inside the cap.
        const v = 0.1;
        const run = integrate(onTurf(TEST_BOX, vec3(0, 0, TEST_RHO), vec3(v, 0, 0)), { cap: 0.1 });
        expect(run.events.map((e) => e.kind)).toEqual(["impact-head-stopped"]);
        expect(length(horizontal(run.head.velocity))).toBeLessThan(HEAD_REST_SPEED);
        expect(run.head.position.x).toBeGreaterThan(0);
        expect(run.head.position.x).toBeLessThan((1.5 * v * v) / (2 * LAW.friction * g));
    });

    it("lets a struck impact end by itself with the head at rest in the turf", () => {
        // §4.6. TEST_BOX sliding on the turf at 0.15 m/s strikes a ball resting on its bed 2 mm ahead, then slides to
        // rest. The pair holds the impact open while the head moves and counts as open once it rests, so the impact
        // ends RELEASE_STEPS after that, well within IMPACT_CAP: the old rule would have run to the cap.
        const sink = staticSink(0.117 + R, 0, R, TEST_BALL.mass * g, testBed());
        const blue = freeBall("blue", vec3(TEST_BOX.length / 2 + 0.002 + R, 0, R - sink), ZERO, testBed());
        const run = integrate(onTurf(TEST_BOX, vec3(0, 0, TEST_RHO), vec3(0.15, 0, 0), IDENTITY, LAW, [blue]));
        const kinds = run.events.map((e) => e.kind);
        expect(run.timeline["face/blue"]?.length).toBeGreaterThan(0);
        expect(kinds).not.toContain("impact-cap");
        expect(kinds).not.toContain("impact-head-stopped");
        expect(run.duration).toBeLessThan(IMPACT_CAP);
        expect(length(horizontal(run.head.velocity))).toBeLessThan(HEAD_REST_SPEED);
    });

    it("raises turf-yield once, when a column first yields", () => {
        // A box pitched 0.3 rad dropped 10 mm meets the turf on its edge: the few columns under it pass the yield
        // depth at once (0.67 mm on the test law), and more yield after; the event is raised once.
        const q = axisAngle(vec3(0, 1, 0), 0.3);
        const run = integrate(onTurf(TEST_BOX, vec3(0, 0, 0.06), ZERO, q), { cap: 0.02 });
        expect(run.events.filter((e) => e.kind === "turf-yield")).toHaveLength(1);
    });

    it("raises impact-head-deep just over HEAD_DEEP_LIMIT, and not just under", () => {
        // Its measure is the head's lowest point, as before (design §4.4): a stroke gone beyond a graze.
        const over = integrate(onTurf(TEST_HEAD, vec3(0, 0, TEST_RHO - HEAD_DEEP_LIMIT - 1e-6)), { cap: 1e-3 });
        expect(over.events.filter((e) => e.kind === "impact-head-deep").map((e) => e.t)).toEqual([IMPACT_DT]);
        expect(over.events.some((e) => e.kind === "impact-mallet-grounded")).toBe(false);
        const under = integrate(onTurf(TEST_HEAD, vec3(0, 0, TEST_RHO - HEAD_DEEP_LIMIT + 1e-6)), { cap: 1e-3 });
        expect(under.events.some((e) => e.kind === "impact-head-deep")).toBe(false);
    });

    it("mirrors a box sliding into the turf across y = 0, to the bit", () => {
        const q = multiply(axisAngle(vec3(0, 0, 1), 0.3), axisAngle(vec3(0, 1, 0), 0.05));
        const start = { position: vec3(0.01, 0.003, TEST_RHO + 0.002), velocity: vec3(0.4, 0.1, -0.2) };
        const a = integrate(onTurf(TEST_BOX, start.position, start.velocity, q), { cap: 5e-3 });
        const b = integrate(
            onTurf(TEST_BOX, mirrorVec(start.position), mirrorVec(start.velocity), mirrorQuat(q)),
            { cap: 5e-3 },
        );
        expect(a.timeline[HEAD_TURF_KEY]?.length).toBeGreaterThan(0);
        expect(same(mirrorVec(a.head.position), b.head.position)).toBe(true);
        expect(same(mirrorVec(a.head.velocity), b.head.velocity)).toBe(true);
        expect(same(mirrorSpin(a.head.angularVelocity), b.head.angularVelocity)).toBe(true);
        const qa = mirrorQuat(a.head.orientation);
        const qb = b.head.orientation;
        expect(qa.w === qb.w && qa.x === qb.x && qa.y === qb.y && qa.z === qb.z).toBe(true);
    });

    it("converges in dt and in the lattice: where a sliding box comes to rest", () => {
        // The box of "stops a box sliding on the turf dead", at IMPACT_DT and at half of it, and on 2 mm and 1 mm
        // columns: its rest position agrees within 1 % (dt) and 2 % (the lattice, whose sole's area and edges move by
        // a column's share).
        const rest = (dt: number, law: HeadTurfLaw): number =>
            integrate(onTurf(TEST_BOX, vec3(0, 0, TEST_RHO), vec3(0.1, 0, 0), IDENTITY, law), { dt, cap: 0.1 }).head
                .position.x;
        const base = rest(IMPACT_DT, LAW);
        expect(rel(rest(IMPACT_DT / 2, LAW), base)).toBeLessThan(0.01);
        expect(rel(rest(IMPACT_DT, testHeadTurf({ cell: 0.001 })), base)).toBeLessThan(0.02);
    });

    it("is given to a tracked drive and not to a force table", () => {
        const world = testWorld();
        const blue = ballAt(5, 0);
        const turf = world.lawn.surfaceAt(blue.position);
        const tracked = onArc(trackDrive(levelArc(vec3(4, 0, 0.1))));
        expect(prepareImpact(tracked, { blue }, world).headTurf).toEqual(headTurfLawOf(turf));
        expect(prepareImpact(strike(blue.position), { blue }, world).headTurf).toBeNull();
    });

    it("rejects a tracked drive over turf the head–turf law cannot use", () => {
        // Decision 17. The lawn is good at the ball and the court's centre (validateWorld samples there), bad under the
        // head.
        const good = testWorld().lawn.surfaceAt(vec3(15, 20, 0));
        const under = (bad: Partial<SurfaceProps>) =>
            testWorld({
                lawn: { width: 30, length: 40, surfaceAt: (p) => (p.x < 4.5 ? { ...good, ...bad } : good) },
            });
        const blue = ballAt(5, 0);
        const tracked = onArc(trackDrive(levelArc(vec3(4.2, 0, TEST_RHO + 0.01))));
        for (const [bad, message] of [
            [{ turfYield: 0 }, /turfYield under the head must be a positive finite number/],
            [{ turfMatStrength: -1 }, /turfMatStrength under the head must be a positive finite number/],
            [{ bedModulus: 0 }, /bedModulus under the head must be a positive finite number/],
            [{ bedRecovery: Number.NaN }, /bedRecovery under the head must be a positive finite number/],
        ] as const) {
            expect(() => simulateImpact(tracked, { blue }, under(bad))).toThrow(message);
        }
    });
});
```

- [ ] **Step 2: Run them**

Run: `npx vitest run tests/engine/impact/headTurf.test.ts`
Expected: FAIL: the integrator still reads a `PairLaw`, so the law's fields are undefined (NaN forces), and the new
events are never raised.

- [ ] **Step 3: The events and the setup's law**

`src/engine/impact/types.ts`, `ImpactEvent`:

- re-note `impact-head-deep`: "the head's lowest point went more than HEAD_DEEP_LIMIT below the turf plane: a stroke
  gone beyond a graze that has probably damaged the lawn (P2b.2b.2b.3 design §4.4), not a limit of the model";
- add `turf-yield`: "a column of the head's turf first yielded (P2b.2b.2b.3 design §4.2); recorded, not judged";
- add `impact-head-stopped`: "the head came to rest in the turf before any face contact (P2b.2b.2b.3 design §4.6):
  the impact ends there and hands the balls over as they lie";
- the members:

```ts
    | { readonly kind: "turf-yield"; readonly t: number }
    | { readonly kind: "impact-head-stopped"; readonly t: number }
```

- `ImpactRun.headTurfSlide`'s comment: "Slip distance (m) of the head's material at the head–turf resistance's centre
  (P2b.2b.2b.3 design §4.3): its horizontal speed there·dt, summed per step while a column bears; absent when the
  pair never closed."

- [ ] **Step 4: The integrator**

`src/engine/impact/integrate.ts`:

1. Imports: drop `headTurfContact` from `./contacts`; add

```ts
import { HEAD_REST_SPEED, headTurfLoad, newHeadTurfBed, type HeadTurfBed, type HeadTurfLoad } from "./headTurf";
```

   and `HeadTurfLaw` to the type import from `./types`. Keep every other import that still has a reader (`npm run
   lint` reports any left unused).

2. `ImpactSetup.headTurf`:

```ts
    /**
     * The head–turf law (P2b.2b.2b.3 design §4), or null to leave the pair out: prepareImpact gives a tracked drive
     * the law of the turf under its head and a force table none. Isolated set-ups (tests) may give any head the pair.
     */
    readonly headTurf: HeadTurfLaw | null;
```

3. `ImpactSnapshot`, after `headTurf`:

```ts
    /** The head's turf columns visited in the step (a cost count; P2b.2b.2b.3 plan decision 21), with `headTurf`. */
    readonly headTurfColumns?: number;
```

4. `FollowFlag`: add `"follow-turf-yield"`, and to its comment "…, or a column of the head's turf first yielding in
   the follow-through".

5. Replace `HeadTurfState` and `applyHeadTurf` with:

```ts
/** The head–turf pair while the impact runs (P2b.2b.2b.3 design §4). */
interface HeadTurfState {
    /** The law's state: the columns, their sets and entry floors, and the horizontal spring (headTurf.ts). */
    readonly bed: HeadTurfBed;
    peak: number;
    readonly line: PairTimeline;
    /** Slip distance (m) at the resistance's centre: the head's material's horizontal speed there·dt, summed. */
    slide: number;
}

/**
 * The head–turf pair in one step (P2b.2b.2b.3 design §4): the turf's columns under the head bear on it, and its
 * ploughing and the sole's friction resist through one spring (headTurf.ts headTurfLoad; the strips along `aim` while
 * that spring's trial is zero). Adds the load and its moment to the head's loads, records the step and the slide,
 * counts an entry jump if the pair opens too deep (`jumps`, a tracked drive's; plan decision 6), and returns the load,
 * or null while no column bears.
 */
function applyHeadTurf(
    p: HeadTurfState,
    state: HeadState,
    head: MalletHead,
    dt: number,
    loads: StepLoads,
    t: number,
    jumps: EntryJumps | null,
    aim: Vec3,
): HeadTurfLoad | null {
    const load = headTurfLoad(p.bed, state, head, dt, aim);
    if (load === null) {
        recordStep(p.line, false, 0, t);
        return null;
    }
    p.peak = Math.max(p.peak, load.depth);
    if (jumps !== null && p.line.start === null) {
        noteEntry(jumps, load.depth, load.closing, dt, HEAD_TURF_KEY, t);
    }
    loads.headForce = add(loads.headForce, load.force);
    loads.headTorque = add(loads.headTorque, load.torque);
    p.slide += length(load.slip) * dt;
    recordStep(p.line, true, load.bearing, t);
    return load;
}

/**
 * True when the head–turf `load` holds the head at rest (P2b.2b.2b.3 design §4.3): its spring sticks and the head's
 * centre moves horizontally at under HEAD_REST_SPEED.
 */
function atRest(load: HeadTurfLoad, state: HeadState): boolean {
    return !load.sliding && length(horizontal(state.velocity)) < HEAD_REST_SPEED;
}
```

6. In `integrateStroke`:
   - after `const releaseAt = …`, add `const aim = plan.kind === "track" ? plan.arc.aim : vec3(1, 0, 0);`;
   - the turf's state: `{ bed: newHeadTurfBed(setup.headTurf), peak: 0, line: emptyTimeline(), slide: 0 }`;
   - beside `let deep = false;`, add `let yielded = false;` and `let resting = 0;`;
   - replace the head–turf call and its `hardClosed` test with:

```ts
        // The head–turf pair comes after every other pair (design §4.1). A head at rest in the turf no longer holds
        // the impact open (P2b.2b.2b.3 design §4.6).
        const turfLoad = turf === null ? null : applyHeadTurf(turf, state, head, dt, loads, t, jumps, aim);
        if (turfLoad !== null) {
            if (turfLoad.yielded && !yielded) {
                yielded = true;
                events.push({ kind: "turf-yield", t });
            }
            if (!atRest(turfLoad, state)) {
                hardClosed = true;
            }
        }
        resting = turfLoad !== null && atRest(turfLoad, state) ? resting + 1 : 0;
```

   - in the probe's snapshot: `...(turf === null ? {} : { headTurf: turfLoad?.force ?? ZERO, headTurfColumns:
     turf.bed.visits })`;
   - after the `settled` break and before the cap:

```ts
        // A head stopped dead in the turf before any face contact ends the impact (P2b.2b.2b.3 design §4.6; plan
        // decision 13): the balls are handed over as they lie.
        if (!struck && resting >= RELEASE_STEPS) {
            events.push({ kind: "impact-head-stopped", t: now });
            break;
        }
```

7. In `continueStroke`, the ground keeps the impact's bed (decision 14):

```ts
    const ground: HeadTurfState | null =
        turf === null ? null : { bed: turf.bed, peak: 0, line: emptyTimeline(), slide: 0 };
```

   and its step:

```ts
        if (ground !== null) {
            const load = applyHeadTurf(ground, state, head, dt, loads, t, null, plan.arc.aim);
            if (load !== null && load.yielded && !flags.includes("follow-turf-yield")) {
                flags.push("follow-turf-yield");
            }
        }
```

8. Comments: `HEAD_DEEP_LIMIT`'s doc becomes "Depth (m) below the turf plane past which a head with the head–turf pair
   raises `impact-head-deep` (P2b.2b.2b.3 design §4.4; reference/contact.json): a stroke gone beyond a graze, which
   has probably damaged the lawn." The file header's step 1 says "then the head–turf pair if the set-up has it
   (P2b.2b.2b.3 design §4: the turf's columns under the head, headTurf.ts)", and its end rule says "…, no face–ball,
   ball–ball or ball–obstacle contact has been closed, and no head–turf contact has held the head other than at rest
   (P2b.2b.2b.3 design §4.6), for RELEASE_STEPS steps, …". Add: "A head at rest in the turf for RELEASE_STEPS steps
   before any face contact ends the impact with `impact-head-stopped`. A column first yielding raises `turf-yield`
   (`follow-turf-yield` in the follow-through)." `continueStroke`'s comment: "the head–turf pair keeps the impact's
   bed (its sets, entry floors and spring) on a fresh timeline".

- [ ] **Step 5: The set-up, the surface and the reference**

`src/engine/impact/simulateImpact.ts`:

- Remove `HEAD_TURF_FRICTION` (it is headTurf.ts's now) and the `lawFromStiffness` import. Import `headTurfLawOf`
  from `./headTurf` and `HeadTurfLaw` with the types.
- `headTurfLaw`:

```ts
/**
 * The head–turf law of a tracked drive, or null for a force table (P2b.2b.2b.3 design §2, §4): the turf under the
 * head's lowest point at t = 0, sampled once (headTurf.ts headTurfLawOf).
 */
function headTurfLaw(contact: ContactState, world: World): HeadTurfLaw | null {
    if (contact.drive.kind === "force") {
        return null;
    }
    return headTurfLawOf(world.lawn.surfaceAt(headBottom(contact, contact.head)));
}
```

- In `validateImpact`'s tracked branch, replace the stiffness and restitution checks with:

```ts
        const surface = world.lawn.surfaceAt(headBottom(contact, head));
        positive(surface.bedModulus, "bedModulus under the head");
        positive(surface.bedRecovery, "bedRecovery under the head");
        positive(surface.turfYield, "turfYield under the head");
        positive(surface.turfMatStrength, "turfMatStrength under the head");
```

  and its header bullet: "for a tracked drive, turf under the head's lowest point with a non-positive or non-finite
  bedModulus, bedRecovery, turfYield or turfMatStrength (the head–turf law, P2b.2b.2b.3 design §4)". The file header's
  first sentence: "…, and the head–turf law once for a tracked drive, from the surface under the head's lowest point
  (headTurf.ts)."

`src/engine/impact/contacts.ts`: delete `headTurfContact`. In `headBottom`'s comment, "It is also the head–turf
pair's contact point (headTurfContact)." becomes "simulateImpact samples the head's turf there."

`src/engine/types.ts`: remove `turfStiffness` and `turfRestitution` from `SurfaceProps` and their sentence from its
comment. `src/engine/world.ts`: remove them from `defaultWorld` and their two checks from `validateWorld`.

`reference/contact.json`: delete `ballTurfStiffness`. `reference/friction.json`: delete `ballTurfRestitution` (decision
15: no other reader). `src/reference/index.ts`: delete both reads, and "turf stiffness" from `contactReference`'s
comment. `tests/reference/reference.test.ts`: delete `"ballTurfRestitution"` from the friction keys' list (line ~62)
and the `ballTurfStiffness` expectation (line ~75).

`tests/engine/support/fixtures.ts`: `TEST_TURF = { bedModulus: 3e8, bedRecovery: 2e-3, turfYield: 2e5,
turfMatStrength: 1e5 } as const`.

- [ ] **Step 6: Migrate the tests that built the plane law**

- `tests/engine/impact/contacts.test.ts` (~lines 340–349): delete the `headTurfContact` cases and its import; keep
  `expect(HEAD_TURF_KEY).toBe("head/turf")`.
- `tests/engine/impact/headBall.test.ts`: `const TURF = testHeadTurf();` (drop `lawFromStiffness` and `TEST_TURF`
  imports). Its two cases (~lines 96 and 125) keep their expectations if they pass.
- `tests/engine/impact/hands.test.ts` ~line 1058: `const turf = testHeadTurf();` (drop the `lawFromStiffness` and
  `TEST_TURF` imports if now unused). "takes no resistance from the turf" keeps its expectations.
- `tests/engine/impact/simulateImpact.test.ts`: delete "accepts a zero turf restitution at a ball, which no ball law
  reads" (~lines 369–379): the field is gone.
- `tests/engine/world.test.ts`: delete the rows "turf restitution above 1" and "non-positive turf stiffness", and the
  two `surface.turfRestitution` / `surface.turfStiffness` expectations.
- `scripts/swingProbe.ts` ~line 818 (`headTurf: null`) and every other script that type-checks against
  `ImpactSetup` or `SurfaceProps`: `npm run check` lists them; give each the new types without changing what it
  measures.

- [ ] **Step 7: Run the head–turf tests**

Run: `npx vitest run tests/engine/impact/headTurf.test.ts tests/engine/impact/headTurfLaw.test.ts`
Expected: PASS. A failure is traced before an expectation moves:

- **"stops a box sliding … dead" ends at the cap:** print `resting` and the last load's `sliding` and horizontal
  speed. A head that rings on its spring means decision 2's damping is not reaching `tangentialForce`.
- **"lets a struck impact end by itself" caps:** check that the turf pair stops setting `hardClosed` once at rest, and
  that the ball's bed is not what holds it (`turfMoving`).

- [ ] **Step 8: Run the whole suite and re-baseline what moved**

Run: `npm test`

Every failing test is one whose head meets the turf, or one that read a removed field. For each:

1. Trace why it moved: print the run's head–turf intervals, peak, slide and events before and after (Task 1's baseline
   files carry the canonical runs' figures in `gate.txt`).
2. If the code departs from the spec or the plan's decisions, fix the code.
3. Otherwise re-baseline the figure with the comment "P2b.2b.2b.3: the turf strike (was <old>)", in the test's own
   comment style, saying in a clause what changed (for example "the turf now bears the heel's footprint at the bed's
   modulus").
4. A test whose premise was the plane law (a figure derived from m·g/k_turf, or a closed form of Coulomb friction at
   one point) is rewritten on the new law's mechanism, with its reasoning in a comment.
5. A test that now raises `impact-head-stopped`, `turf-yield` or `grip-limit` where the spec does not predict it goes
   to the user at the gate (Task 8), listed in `<temp>/after/unpredicted.txt` with its run and mechanism. Keep it
   failing only if the suite cannot be green otherwise; prefer pinning the new figure with an
   "unpredicted, for the gate" note.

The AC stop's three `LEGACY_MALLET` turf tests in `shot.test.ts` stay on the legacy head until Task 6. They may
re-baseline here like any other.

Record every re-baselined test (file, name, old and new figures) in `<temp>/after/rebaselined.txt` for the gate and
Task 10.

- [ ] **Step 9: Run the ratchet (in the background)**

Spec §7.2 step 2. Run each with `run_in_background: true`:

Run: `/usr/bin/time -p npx --yes tsx <temp>/scripts/presetDigest.mts > <temp>/after/presetDigest-task5.txt 2> <temp>/after/presetDigest-task5.time`
Run: `npx --yes tsx scripts/impactDigest.ts > <temp>/after/impactDigest-task5.txt`
Run: `npx --yes tsx scripts/shotMix.ts > <temp>/after/shotMix-task5.txt`
Run: `npx --yes tsx scripts/impactProbe.ts > <temp>/after/impactProbe-task5.txt`

Meanwhile, create `<temp>/scripts/movedRuns.py`:

```python
"""Lists the preset runs whose digest moved between two presetDigest outputs (P2b.2b.2b.3 plan Task 5), with their
head–turf intervals before and after, and flags any that moved with no head–turf contact on either side."""
import sys


def read(path):
    runs = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            label, _, rest = line.rstrip("\n").partition(": ")
            runs[label] = rest
    return runs


def turfless(entry):
    return entry is None or "turf none" in entry or " turf " not in entry


before, after = read(sys.argv[1]), read(sys.argv[2])
moved = unexplained = 0
for label, old in before.items():
    new = after.get(label)
    if new == old:
        continue
    moved += 1
    print(f"{label}\n  before: {old}\n  after:  {new}")
    if turfless(old) and turfless(new):
        unexplained += 1
        print("  ^ moved with no head-turf contact")
print(f"moved {moved}; unexplained {unexplained}")
```

When the runs finish:

- `impactDigest`: `diff <temp>/baseline/impactDigest.txt <temp>/after/impactDigest-task5.txt`. Expected: no output.
  Force tables have no head–turf pair.
- `impactProbe` and `shotMix`, times dropped as in Task 2 Step 9. Expected: no output.
- The preset digest:
  `python3 -I <temp>/scripts/movedRuns.py <temp>/baseline/presetDigest.txt <temp>/after/presetDigest-task5.txt > <temp>/after/moved-task5.txt`.
  Expected: "unexplained 0". Every moved run met the turf on one side or the other, and the full and pass rolls'
  canonical runs are among them (their follow-throughs reach the turf). A moved run with no head–turf contact is a
  defect: stop.
- The cost: compare `real` in `<temp>/after/presetDigest-task5.time` with the baseline's. Write both, and their ratio,
  into `<temp>/after/cost.txt` for the gate. If the sweep takes more than three times as long, note which runs
  dominate (the ones with the longest head–turf intervals in `moved-task5.txt`) in the same file.

Any other difference is a defect: stop.

- [ ] **Step 10: Run every check**

Run, one per call: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`.
Expected: all pass.

- [ ] **Step 11: Commit**

Stage every file changed above by path (`git status --short` lists them).

Message: `Plough the head through the turf: the new law in the impact and the follow-through`

---
### Task 6: The jab

Spec §6.1, §6.3 (`stroke.jab`), §7.2 step 3, §7.5 (the AC stop's turf tests onto the box); decision 18.

**Files:**
- Modify: `src/engine/swing/types.ts` (`ShotSetup.stroke.jab`)
- Modify: `src/engine/swing/buildContact.ts` (`validate`, `planStroke`)
- Modify: `tests/engine/swing/buildContact.test.ts` (the jab's cases)
- Modify: `tests/engine/shot.test.ts` (the three `LEGACY_MALLET` AC-stop turf tests onto the default box)
- Temp: `<temp>/scripts/jabFind.mts`, `<temp>/after/jabFind.txt`

**Interfaces:**
- Produces: `ShotSetup.stroke.jab?: number` (m, ≥ 0; absent: 0); the planned dip's depth `handDrop + jab`.

- [ ] **Step 1: Write the failing tests**

In `tests/engine/swing/buildContact.test.ts`, add a `describe("the jab (P2b.2b.2b.3 design §6.1)", …)` block,
reusing the file's own imports and helpers (`canonicalSetup`, `planStroke`, `WORLD` or its local name):

```ts
describe("the jab (P2b.2b.2b.3 design §6.1)", () => {
    it("deepens the planned dip by the jab, on the dip's own timing", () => {
        const setup = canonicalSetup("stop-ac");
        const plain = planStroke(setup, WORLD).contact.drive as TrackDrive;
        const jabbed = planStroke({ ...setup, stroke: { ...setup.stroke, jab: 0.003 } }, WORLD).contact
            .drive as TrackDrive;
        expect(jabbed.arc.dip.depth).toBe(setup.profile.drive["stop-ac"].handDrop + 0.003);
        expect(jabbed.arc.dip.start).toBe(plain.arc.dip.start);
        expect(jabbed.arc.dip.duration).toBe(plain.arc.dip.duration);
    });

    it.each(STROKE_TYPES)("leaves the %s stroke unchanged to the bit at a jab of 0", (type) => {
        const setup = canonicalSetup(type);
        expect(planStroke({ ...setup, stroke: { ...setup.stroke, jab: 0 } }, WORLD)).toEqual(planStroke(setup, WORLD));
    });

    it("rejects a negative, non-finite or carry-mode jab, and accepts a carry stroke's jab of 0", () => {
        // Review focus 5.
        const ac = canonicalSetup("stop-ac");
        for (const jab of [-0.001, Number.NaN, Infinity]) {
            expect(() => planStroke({ ...ac, stroke: { ...ac.stroke, jab } }, WORLD), `${jab}`).toThrow(
                /stroke\.jab must be/,
            );
        }
        const roll = canonicalSetup("full-roll");
        expect(() => planStroke({ ...roll, stroke: { ...roll.stroke, jab: 0.001 } }, WORLD)).toThrow(
            /stroke\.jab must be 0 in carry mode/,
        );
        expect(planStroke({ ...roll, stroke: { ...roll.stroke, jab: 0 } }, WORLD)).toEqual(planStroke(roll, WORLD));
    });
});
```

Import `STROKE_TYPES` and `TrackDrive` if the file lacks them.

- [ ] **Step 2: Run them**

Run: `npx vitest run tests/engine/swing/buildContact.test.ts -t "the jab"`
Expected: FAIL: the dip is not deepened and no jab is rejected.

- [ ] **Step 3: Implement**

`src/engine/swing/types.ts`, in `ShotSetup.stroke`, after `pendulumEffort`:

```ts
        /**
         * The jab (m, ≥ 0; P2b.2b.2b.3 design §6.1): the hands' planned dip deepens by it on top of the preset's
         * handDrop, on the dip's own timing, to ground the head deliberately. Swing mode only; absent: 0.
         */
        readonly jab?: number;
```

`src/engine/swing/buildContact.ts`:

- In `validate`, add `["stroke.jab", stroke.jab],` to the optional finite list, and after the `pendulumEffort`
  checks:

```ts
    if (stroke.jab !== undefined) {
        nonNegative(stroke.jab, "stroke.jab");
        if (push.mode === "carry" && stroke.jab !== 0) {
            fail(`stroke.jab must be 0 in carry mode, where the hands lead on their own arc (got ${stroke.jab})`);
        }
    }
```

  `finiteNumber` reports a NaN or Infinity as "stroke.jab must be finite", which the test's `/stroke\.jab must be/`
  matches.
- In `planStroke`'s arc: `dip: { start: lead + timing.dip, duration: push.dropTime, depth: push.handDrop +
  (stroke.jab ?? 0) },` (decision 18: at 0 this is `handDrop` to the bit, as `handDrop` is +0 or positive).
- `planStroke`'s header list gains: "a jab negative or non-finite, or non-zero in carry mode (P2b.2b.2b.3 design
  §6.1)". The file header's step 3 says "the dip, handDrop deepened by the shot's jab, over dropTime".

- [ ] **Step 4: Run them**

Run: `npx vitest run tests/engine/swing/buildContact.test.ts`
Expected: PASS.

- [ ] **Step 5: Find the AC stop's jab on the box**

Spec §7.5: the three `LEGACY_MALLET` AC-stop turf tests move onto the default box through `stroke.jab`. Create
`<temp>/scripts/jabFind.mts`:

```ts
/**
 * The canonical AC stop on the default box over jab 0–8 mm in 0.5 mm steps, on time and with its dip 30 ms early:
 * when the head first meets the turf against the striker's first face interval, how deep, and the events (P2b.2b.2b.3
 * plan Task 6 Step 5). Throwaway, never committed. Run from the worktree: npx --yes tsx <this>.
 */
import { simulateShot } from "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b3-turf-strike/src/engine/shot";
import { defaultWorld } from "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b3-turf-strike/src/engine/world";
import { canonicalSetup } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b3-turf-strike/tests/engine/support/shot";

const WORLD = defaultWorld();
const ms = (x: number): string => (x * 1e3).toFixed(2);
for (const dip of [0, -0.03]) {
    for (let k = 0; k <= 16; k++) {
        const jab = k * 0.0005;
        const setup = canonicalSetup("stop-ac", { world: WORLD, stroke: { jab, timing: { arc: 0, hands: 0, dip } } });
        const impact = simulateShot(setup, WORLD).impact;
        const turf = impact.timeline["head/turf"]?.[0];
        const face = impact.timeline["face/blue"]?.[0];
        console.log(
            `dip ${dip} s jab ${(jab * 1e3).toFixed(1)} mm: turf ${turf === undefined ? "none" : ms(turf.start)} ms, ` +
                `face ${face === undefined ? "none" : `${ms(face.start)}–${ms(face.end)}`} ms, peak ` +
                `${((impact.peakPenetration["head/turf"] ?? 0) * 1e3).toFixed(3)} mm, striker ` +
                `${Math.hypot(impact.handover.blue?.velocity.x ?? 0, impact.handover.blue?.velocity.y ?? 0).toFixed(4)} ` +
                `m/s, events ${impact.events.map((e) => e.kind).join(",") || "none"}`,
        );
    }
}
```

Run: `npx --yes tsx <temp>/scripts/jabFind.mts > <temp>/after/jabFind.txt`

From its output choose:

- **J_on**: the shallowest on-time jab (dip 0) whose head first meets the turf at or after the first face interval
  ends, with no `impact-head-deep`;
- **J_early**: the shallowest jab, at J_on or deeper, whose 30 ms early run meets the turf before the first face
  interval starts.

If either does not exist within 8 mm, **stop and report** with the output: the box may not ground on this stroke at
all, which is a gate question.

- [ ] **Step 6: Move the AC stop's turf tests onto the box**

In `tests/engine/shot.test.ts`, the three tests that call `canonicalSetup("stop-ac", { mallet: LEGACY_MALLET … })`
for the turf ("finds 29.1.14 only in a stroke of Law 29.2.3", "the AC stop's relaxed head meets the turf after the
ball and the turf brakes it, not too deep", "a dip 30 ms early meets the lawn before the ball …"):

- replace `mallet: LEGACY_MALLET` with `stroke: { jab: J_ON }` (and, for the early dip, `stroke: { jab: J_EARLY,
  timing }`, its on-time comparison at `jab: J_EARLY` too), with `J_ON` and `J_EARLY` as file constants holding Step
  5's values and a comment:

```ts
/**
 * The jabs (m) at which the canonical AC stop's box grounds its heel (P2b.2b.2b.3 design §6.1, §7.5): the shallowest
 * on time whose head meets the turf after the ball, and the shallowest whose dip 30 ms early meets it before the ball
 * (plan Task 6 Step 5, <date>). They close the mallet's ruling B follow-up: the canonical AC stop clears the turf.
 */
const J_ON = <Step 5's value>;
const J_EARLY = <Step 5's value>;
```

- replace each "P2b.2b.2b.2c: on the legacy round head; the default box clears the turf (gate)." with
  "P2b.2b.2b.3: the turf strike, on the default box through the jab (was on the legacy round head):" and Step 5's
  figures for that run (the turf's start, depth, the striker's speed).

The sunk-ball handover runs (ruling C) keep `LEGACY_MALLET`; the import stays.

Run: `npx vitest run tests/engine/shot.test.ts`
Expected: PASS. A failure is traced on Step 5's output before any expectation moves.

- [ ] **Step 7: Run the ratchet (in the background)**

Spec §7.2 step 3: everything bit-identical to Task 5's. Run the four runs of Task 2 Step 9 with `-task6`, and compare
each with Task 5's outputs (`-task5`) as there (the preset digest with `diff`, not `movedRuns.py`).
Expected: no output from any diff. Any difference is a defect: stop.

- [ ] **Step 8: Run every check**

Run, one per call: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`.
Expected: all pass.

- [ ] **Step 9: Commit**

Stage `src/engine/swing/types.ts`, `src/engine/swing/buildContact.ts`, `tests/engine/swing/buildContact.test.ts`,
`tests/engine/shot.test.ts`.

Message: `Let a player jab the head into the turf, and ground the AC stop's box through it`

---
### Task 7: The probe, the regimes and the jab check

Spec §7.3 (Gugan's jab, gated and banded), §7.4 (the three regimes), §4.6 (the follow-through's flags), §9 (the
figures); decisions 19 and 20.

**Files:**
- Create: `scripts/turfStrikeProbe.ts`
- Create: `tests/engine/turfStrike.test.ts`
- Create: `docs/superpowers/probes/<date>-p2b2b2b3-regimes.txt`

**Interfaces:**
- Consumes: Task 5's events and `headTurfColumns`; Task 6's `stroke.jab`.
- Produces: the probe's sections `regimes`, `jab`, `bounds` and `cost`, each printing the lines Task 8 and Task 10
  read; the found setups, pinned in the test.

- [ ] **Step 1: Write the probe**

Create `scripts/turfStrikeProbe.ts`:

```ts
/**
 * Turf strike probe (P2b.2b.2b.3 design §7.3, §7.4, §8, §9: recorded; the regimes and the jab check are gated by
 * tests/engine/turfStrike.test.ts). On the default world and profile, reports:
 * - regimes: plan decision 19's candidate grids for a light graze, a weak stroke stopped dead, a head biting in, and a
 *   roll's follow-through yielding the turf; each candidate's figures, and the first that qualifies (FOUND), or NONE;
 * - jab: the AC stop at 3 m/s over jab 0–8 mm in 0.5 mm steps (Gugan 5, design §7.3; plan decision 20): U, the second
 *   tap and its ratio, whether the depth qualifies and is a graze, when the head first grounds, its lowest point, and
 *   the events and flags; the check's verdict; then the jab against the hands' check at 3 and 4 m/s: the second tap
 *   with no jab and at the shallowest graze, the hands' peak checking force and the turf's braking impulse;
 * - bounds: the regimes' found setups and the jab sweep's verdict at each end of turfYield's and turfMatStrength's
 *   bounds (design §6.2, §8), the other figures at their defaults;
 * - cost: per canonical setup at 3 m/s, the impact's steps and the head–turf columns visited per step, mean over the
 *   steps that visit any and worst (design §9; plan decision 21).
 * Run with `npx --yes tsx scripts/turfStrikeProbe.ts`; environment: SECTION (one of the names above; default all). Not
 * part of the test suite; its output goes into the gate and the roadmap's outcomes.
 */
import { headLowestPoint } from "../src/engine/impact/contacts";
import { IMPACT_DT, type FollowThrough, type ImpactProbe, type ImpactSnapshot } from "../src/engine/impact/integrate";
import { simulateStroke } from "../src/engine/impact/simulateImpact";
import type { HeadState, ImpactResult, MalletHead } from "../src/engine/impact/types";
import { ZERO, dot, vec3, type Vec3 } from "../src/engine/math/vec3";
import { planStroke } from "../src/engine/swing/buildContact";
import { STROKE_TYPES, type ShotSetup, type StrokeType } from "../src/engine/swing/types";
import type { SurfaceProps, World } from "../src/engine/types";
import { defaultWorld, uniformLawn } from "../src/engine/world";
import { contactReference } from "../src/reference/index";
import { backswingFor, canonicalSetup } from "../tests/engine/support/shot";

// The project has no Node types; this script runs under tsx and reads only its environment.
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

const SECTION = process.env.SECTION ?? "all";
const WORLD = defaultWorld();
const mm = (x: number): string => (x * 1e3).toFixed(3);
const ms = (x: number): string => (x * 1e3).toFixed(2);

/** The default world with its lawn's surface changed by `over` (design §6.3: the seam P3's lawns will vary). */
function lawnWith(over: Partial<SurfaceProps>): World {
    const surface = WORLD.lawn.surfaceAt(vec3(0, 0, 0));
    return { ...WORLD, lawn: uniformLawn(WORLD.lawn.width, WORLD.lawn.length, { ...surface, ...over }) };
}

/** One impact step as the probe keeps it: the head after it, the hands' and the turf's forces during it. */
interface Step {
    readonly t: number;
    readonly head: HeadState;
    readonly hand: Vec3;
    readonly turf: Vec3;
    readonly columns: number;
}

/** One stroke: its setup, impact, follow-through and steps, the head at t = 0, the mallet head and the aim. */
interface Run {
    readonly label: string;
    readonly impact: ImpactResult;
    readonly follow: FollowThrough;
    readonly steps: readonly Step[];
    readonly start: HeadState;
    readonly head: MalletHead;
    readonly aim: Vec3;
}

function run(label: string, setup: ShotSetup, world: World = WORLD): Run {
    const plan = planStroke(setup, world);
    const steps: Step[] = [];
    const probe: ImpactProbe = {
        step(s: ImpactSnapshot): void {
            steps.push({
                t: s.t,
                head: s.head,
                hand: s.hand?.force ?? ZERO,
                turf: s.headTurf ?? ZERO,
                columns: s.headTurfColumns ?? 0,
            });
        },
    };
    const { result, follow } = simulateStroke(plan.contact, setup.balls, world, { probe });
    const drive = plan.contact.drive;
    const aim = drive.kind === "track" ? drive.arc.aim : vec3(1, 0, 0);
    return { label, impact: result, follow, steps, start: plan.contact, head: plan.contact.head, aim };
}

/** A preset's canonical setup at `speed` (m/s), its stroke changed by `stroke`. */
function shot(type: StrokeType, speed: number, stroke: Partial<ShotSetup["stroke"]> = {}): ShotSetup {
    const base = canonicalSetup(type, { world: WORLD, stroke });
    return { ...base, stroke: { ...base.stroke, backswing: backswingFor(base, speed, WORLD) } };
}

/** The head at time t (an interval's start): after the step that ends there, or at t = 0. */
function headAt(r: Run, t: number): HeadState {
    return t === 0 ? r.start : (r.steps.find((s) => s.t === t)?.head ?? r.start);
}

const along = (r: Run, t: number): number => dot(headAt(r, t).velocity, r.aim);
const kinds = (r: Run): readonly string[] => [...r.impact.events.map((e) => e.kind), ...r.follow.flags];
const faceStart = (r: Run): number | undefined => r.impact.timeline["face/blue"]?.[0]?.start;
const turfStart = (r: Run): number | undefined => r.impact.timeline["head/turf"]?.[0]?.start;

function lowest(r: Run): number {
    let low = Infinity;
    for (const s of r.steps) {
        low = Math.min(low, headLowestPoint(s.head, r.head));
    }
    return low;
}

/** A run's figures on one line. */
function figures(r: Run): string {
    const spans = (key: string): string =>
        (r.impact.timeline[key] ?? []).map((i) => `${ms(i.start)}–${ms(i.end)}`).join(", ") || "none";
    const turf = turfStart(r);
    const face = faceStart(r);
    return (
        `head/turf ${spans("head/turf")} ms, peak ${mm(r.impact.peakPenetration["head/turf"] ?? 0)} mm, lowest ` +
        `${mm(lowest(r))} mm; face ${spans("face/blue")} ms; speed along aim at the turf ` +
        `${turf === undefined ? "-" : along(r, turf).toFixed(4)}, at the ball ` +
        `${face === undefined ? "-" : along(r, face).toFixed(4)} m/s; impact ${ms(r.impact.duration)} ms; finish ` +
        `${ms(r.follow.finish)} ms; ${kinds(r).join(",") || "no events"}`
    );
}

/** One candidate of a regime's grid. */
interface Candidate {
    readonly label: string;
    readonly setup: () => ShotSetup;
}

/** Runs `candidates` in order on `world`, printing each, and returns the first that `qualifies`, or null. */
function search(
    name: string,
    candidates: readonly Candidate[],
    qualifies: (r: Run) => boolean,
    world: World,
    quiet = false,
): Run | null {
    if (!quiet) {
        console.log(`-- ${name} --`);
    }
    for (const c of candidates) {
        try {
            const r = run(c.label, c.setup(), world);
            if (!quiet) {
                console.log(`${c.label}: ${figures(r)}`);
            }
            if (qualifies(r)) {
                if (!quiet) {
                    console.log(`FOUND ${name}: ${c.label}`);
                }
                return r;
            }
        } catch (error) {
            if (!quiet) {
                console.log(`${c.label}: threw ${(error as Error).message}`);
            }
        }
    }
    if (!quiet) {
        console.log(`NONE ${name}`);
    }
    return null;
}

/** A grid of `type` at `speed` (m/s) over dip timings (s) and jabs (m), with `extra` stroke fields. */
function grid(
    type: StrokeType,
    speed: number,
    dips: readonly number[],
    jabs: readonly number[],
    extra: Partial<ShotSetup["stroke"]> = {},
): Candidate[] {
    return dips.flatMap((dip) =>
        jabs.map((jab) => ({
            label: `${type} ${speed} m/s dip ${dip} s jab ${mm(jab)} mm`,
            setup: () => shot(type, speed, { ...extra, jab, timing: { arc: 0, hands: 0, dip } }),
        })),
    );
}

/** Plan decision 19's regimes: name, candidates and test, in spec §7.4's order, then the follow-through's flag. */
const REGIMES: readonly { name: string; candidates: Candidate[]; qualifies: (r: Run) => boolean }[] = [
    {
        // A light graze: the dip grounds the head before the ball, never past HEAD_DEEP_LIMIT, and the ball is struck.
        name: "graze",
        candidates: grid("single-ball", 3, [-0.005, -0.01, -0.02, -0.03], [0.001, 0.002, 0.003, 0.004, 0.005, 0.006]),
        qualifies: (r) => {
            const face = faceStart(r);
            const turf = turfStart(r);
            const marks = kinds(r);
            return (
                face !== undefined &&
                turf !== undefined &&
                turf < face &&
                !marks.includes("impact-head-deep") &&
                !marks.includes("grip-limit")
            );
        },
    },
    {
        // A weak stroke stopped dead: at about 1 m/s, the dip early, the head rests in the turf before the ball.
        name: "stopped",
        candidates: grid("single-ball", 1, [-0.03, -0.05, -0.08, -0.12], [0.005, 0.01, 0.02, 0.03], { intensity: 0 }),
        qualifies: (r) => faceStart(r) === undefined && r.impact.events.some((e) => e.kind === "impact-head-stopped"),
    },
    {
        // A head biting in: a hard stroke with a deep jab, the dip early, saturates a hand.
        name: "biting",
        candidates: grid("single-ball", 4, [-0.005, -0.01, -0.02], [0.01, 0.02, 0.03, 0.04]),
        qualifies: (r) => r.impact.events.some((e) => e.kind === "grip-limit"),
    },
    {
        // A roll's follow-through ploughing: its head yields the turf after the impact.
        name: "follow",
        candidates: (["half-roll", "full-roll", "pass-roll"] as const).flatMap((type) =>
            [2, 3, 4].map((speed) => ({ label: `${type} ${speed} m/s`, setup: () => shot(type, speed) })),
        ),
        qualifies: (r) => r.follow.flags.includes("follow-turf-yield"),
    },
];

function regimes(world: World, quiet: boolean): (Run | null)[] {
    if (!quiet) {
        console.log("== regimes (design §7.4; plan decision 19) ==");
    }
    return REGIMES.map((g) => search(g.name, g.candidates, g.qualifies, world, quiet));
}

/** Gugan's figures of one AC stop (design §7.3; plan decision 20), or null with no face interval. */
function gugan(r: Run) {
    const face = r.impact.headRegions?.["face/blue#face"] ?? [];
    const first = face[0];
    if (first === undefined) {
        return null;
    }
    const second = face[1];
    const U = along(r, first.start);
    const tap = second === undefined ? 0 : along(r, second.start);
    const grounds = turfStart(r);
    const qualifies = grounds !== undefined && grounds >= first.start && (second === undefined || grounds < second.start);
    const graze = qualifies && !r.impact.events.some((e) => e.kind === "impact-head-deep");
    return { U, tap, ratio: tap / U, qualifies, graze, grounds, first, second };
}

/** The hands' peak checking force and impulse and the turf's braking impulse along aim after the first face interval. */
function braking(r: Run) {
    const end = r.impact.timeline["face/blue"]?.[0]?.end ?? 0;
    let peak = 0;
    let hands = 0;
    let turf = 0;
    for (const s of r.steps) {
        if (s.t <= end) {
            continue;
        }
        const check = 0 - dot(s.hand, r.aim);
        peak = Math.max(peak, check);
        hands += check * IMPACT_DT;
        turf -= dot(s.turf, r.aim) * IMPACT_DT;
    }
    return { peak, hands, turf };
}

/** The AC stop's jab sweep at 3 m/s on `world` (design §7.3), its verdict, and the shallowest graze (m), if any. */
function sweep(world: World, quiet: boolean): number | null {
    let shallowest: number | null = null;
    const grazes: number[] = [];
    for (let k = 0; k <= 16; k++) {
        const jab = k * 0.0005;
        const r = run(`jab ${mm(jab)} mm`, shot("stop-ac", 3, { jab }), world);
        const g = gugan(r);
        if (g !== null && g.graze) {
            grazes.push(g.ratio);
            shallowest = shallowest ?? jab;
        }
        if (!quiet) {
            console.log(
                `jab ${mm(jab)} mm: ` +
                    (g === null
                        ? "no face interval"
                        : `U ${g.U.toFixed(4)} m/s, second tap ${g.tap.toFixed(4)} m/s, ratio ${g.ratio.toFixed(4)}, ` +
                          `grounds ${g.grounds === undefined ? "never" : `${ms(g.grounds)} ms`}, ` +
                          `${g.qualifies ? (g.graze ? "graze" : "qualifies, deep") : "does not qualify"}`) +
                    `; lowest ${mm(lowest(r))} mm; ${kinds(r).join(",") || "no events"}`,
            );
        }
    }
    const passes = grazes.length > 0 && grazes.every((x) => x >= 0.295 && x <= 0.463);
    console.log(
        `verdict: ${passes ? "PASS" : "FAIL"}; ${grazes.length} grazes, ratios ` +
            `${grazes.map((x) => x.toFixed(4)).join(", ") || "none"}; Gugan's 0.400 (0.295–0.463)`,
    );
    return shallowest;
}

function jab(): void {
    console.log("== jab: the AC stop at 3 m/s (design §7.3) ==");
    const shallowest = sweep(WORLD, false);
    console.log("== jab against the hands' check (design §7.3, §8) ==");
    for (const speed of [3, 4]) {
        for (const j of shallowest === null ? [0] : [0, shallowest]) {
            try {
                const r = run(`stop-ac ${speed} m/s jab ${mm(j)} mm`, shot("stop-ac", speed, { jab: j }));
                const g = gugan(r);
                const b = braking(r);
                console.log(
                    `${r.label}: second tap ${g === null ? "-" : `${g.tap.toFixed(4)} m/s (${g.ratio.toFixed(4)}U)`}; ` +
                        `hands' peak check ${b.peak.toFixed(1)} N, impulse ${b.hands.toFixed(4)} N·s; turf braking ` +
                        `${b.turf.toFixed(4)} N·s; ${kinds(r).join(",") || "no events"}`,
                );
            } catch (error) {
                console.log(`stop-ac ${speed} m/s jab ${mm(j)} mm: threw ${(error as Error).message}`);
            }
        }
    }
}

function bounds(found: readonly (Run | null)[]): void {
    console.log("== bounds (design §6.2, §8) ==");
    const yieldBounds = contactReference.turfYield.bounds as readonly [number, number];
    const matBounds = contactReference.turfMatStrength.bounds as readonly [number, number];
    const ends: readonly [string, Partial<SurfaceProps>][] = [
        [`turfYield ${yieldBounds[0]} Pa`, { turfYield: yieldBounds[0] }],
        [`turfYield ${yieldBounds[1]} Pa`, { turfYield: yieldBounds[1] }],
        [`turfMatStrength ${matBounds[0]} Pa`, { turfMatStrength: matBounds[0] }],
        [`turfMatStrength ${matBounds[1]} Pa`, { turfMatStrength: matBounds[1] }],
    ];
    for (const [name, over] of ends) {
        const world = lawnWith(over);
        console.log(`-- ${name} --`);
        REGIMES.forEach((g, k) => {
            const at = found[k];
            const c = g.candidates.find((x) => x.label === at?.label);
            if (c === undefined) {
                console.log(`${g.name}: none found on the default lawn`);
                return;
            }
            const r = run(c.label, c.setup(), world);
            console.log(`${g.name} (${c.label}): ${g.qualifies(r) ? "occurs" : "DOES NOT OCCUR"}; ${figures(r)}`);
        });
        sweep(world, true);
    }
}

function cost(): void {
    console.log("== cost (design §9) ==");
    for (const type of STROKE_TYPES) {
        const r = run(`${type} 3 m/s`, shot(type, 3));
        const visiting = r.steps.filter((s) => s.columns > 0);
        const mean = visiting.reduce((sum, s) => sum + s.columns, 0) / Math.max(1, visiting.length);
        const worst = visiting.reduce((most, s) => Math.max(most, s.columns), 0);
        console.log(
            `${r.label}: impact ${r.impact.steps} steps, ${visiting.length} with the head in the turf; columns per such ` +
                `step: mean ${mean.toFixed(1)}, worst ${worst}`,
        );
    }
}

if (SECTION === "all" || SECTION === "regimes" || SECTION === "bounds") {
    const found = regimes(WORLD, SECTION === "bounds");
    if (SECTION !== "regimes") {
        bounds(found);
    }
}
if (SECTION === "all" || SECTION === "jab") {
    jab();
}
if (SECTION === "all" || SECTION === "cost") {
    cost();
}
```

Run: `npx prettier --write scripts/turfStrikeProbe.ts`, then `npm run lint` and `npm run check`.

- [ ] **Step 2: Run the regimes**

Run (in the background): `env SECTION=regimes npx --yes tsx scripts/turfStrikeProbe.ts > docs/superpowers/probes/<date>-p2b2b2b3-regimes.txt`

When it finishes, read each `FOUND` line. If any regime prints `NONE`, **stop and report** to the user with its
grid's lines: spec §7.4 requires each regime on a constructed setup, and the grid (decision 19) did not find one. Do
not widen the grid without the user.

- [ ] **Step 3: Write the tests**

Create `tests/engine/turfStrike.test.ts`, with Step 2's found setups in its constants:

```ts
import { describe, expect, it } from "vitest";
import { IMPACT_DT, type ImpactProbe } from "../../src/engine/impact/integrate";
import { simulateImpact } from "../../src/engine/impact/simulateImpact";
import type { TrackDrive } from "../../src/engine/impact/types";
import { dot } from "../../src/engine/math/vec3";
import { simulateShot } from "../../src/engine/shot";
import { buildContact } from "../../src/engine/swing/buildContact";
import type { SwingTrajectory } from "../../src/engine/swing/trajectory";
import type { ShotSetup, StrokeType } from "../../src/engine/swing/types";
import { defaultWorld } from "../../src/engine/world";
import { backswingFor, canonicalSetup } from "./support/shot";

const WORLD = defaultWorld();
const SLOW = Boolean(process.env.SLOW_TESTS);

/**
 * The regimes' setups (design §7.4), found by scripts/turfStrikeProbe.ts's regimes section over plan decision 19's
 * grids (docs/superpowers/probes/<date>-p2b2b2b3-regimes.txt): the first candidate of each grid that qualifies.
 */
const GRAZE = { type: "single-ball", speed: 3, dip: <found>, jab: <found> } as const;
const STOPPED = { type: "single-ball", speed: 1, dip: <found>, jab: <found> } as const;
const BITING = { type: "single-ball", speed: 4, dip: <found>, jab: <found> } as const;
const FOLLOW = { type: "<found roll>", speed: <found> } as const;

/** A preset's canonical setup at `speed` (m/s), its dip `dip` s from contact and deepened by `jab` (m). */
function shot(type: StrokeType, speed: number, stroke: Partial<ShotSetup["stroke"]> = {}): ShotSetup {
    const base = canonicalSetup(type, { stroke });
    return { ...base, stroke: { ...base.stroke, backswing: backswingFor(base, speed, WORLD) } };
}

/** The impact of `setup`, and the head's speed along aim at any step's time. */
function along(setup: ShotSetup) {
    const contact = buildContact(setup, WORLD);
    const aim = (contact.drive as TrackDrive).arc.aim;
    const speeds: number[] = [dot(contact.velocity, aim)];
    const probe: ImpactProbe = {
        step: (s) => {
            speeds.push(dot(s.head.velocity, aim));
        },
    };
    const impact = simulateImpact(contact, setup.balls, WORLD, { probe });
    return { impact, speed: (t: number): number => speeds[Math.round(t / IMPACT_DT)] as number };
}

const timed = (dip: number, jab: number, extra: Partial<ShotSetup["stroke"]> = {}) => ({
    ...extra,
    jab,
    timing: { arc: 0, hands: 0, dip },
});

describe("the three regimes (P2b.2b.2b.3 design §7.4)", () => {
    it("grazes: the head grounds before the ball, under 2 mm, strikes it and keeps most of its speed", () => {
        // <Step 2's figures for GRAZE: the turf interval, the lowest point, the speeds at the turf and at the ball.>
        const { impact, speed } = along(shot(GRAZE.type, GRAZE.speed, timed(GRAZE.dip, GRAZE.jab)));
        const turf = impact.timeline["head/turf"]?.[0];
        const face = impact.timeline["face/blue"]?.[0];
        expect(turf).toBeDefined();
        expect(face).toBeDefined();
        expect(turf?.start as number).toBeLessThan(face?.start as number);
        expect(impact.events.map((e) => e.kind)).not.toContain("impact-head-deep");
        expect(speed(face?.start as number)).toBeGreaterThan(0.5 * speed(turf?.start as number));
    });

    it("stops a weak stroke dead in the turf before the ball: impact-head-stopped, not impact-cap", () => {
        // <Step 2's figures for STOPPED.>
        const setup = shot(STOPPED.type, STOPPED.speed, timed(STOPPED.dip, STOPPED.jab, { intensity: 0 }));
        const { impact } = along(setup);
        const kinds = impact.events.map((e) => e.kind);
        expect(kinds).toContain("impact-head-stopped");
        expect(kinds).not.toContain("impact-cap");
        expect(impact.timeline["face/blue"]).toBeUndefined();
    });

    it("lets a head biting in saturate a hand: grip-limit", () => {
        // <Step 2's figures for BITING.>
        const { impact } = along(shot(BITING.type, BITING.speed, timed(BITING.dip, BITING.jab)));
        expect(impact.events.map((e) => e.kind)).toContain("grip-limit");
    });

    it("flags follow-turf-yield when a roll's follow-through yields the turf (design §4.6)", () => {
        // <Step 2's figures for FOLLOW.>
        const outcome = simulateShot(shot(FOLLOW.type, FOLLOW.speed), WORLD, { trajectory: true });
        const flags = (outcome.trajectory as SwingTrajectory).flags;
        expect(flags.filter((f) => f === "follow-turf-yield")).toHaveLength(1);
    });
});

describe("Gugan's jab (P2b.2b.2b.3 design §7.3; slow)", () => {
    it.runIf(SLOW)("puts every graze's second tap within [0.295, 0.463]·U, with at least one graze", () => {
        // Gugan 5: stop-shots with a downward jab, so that the heel's friction stops the mallet soon after impact;
        // over the seven lowest ratios the second tap's mallet speed is 0.400U, against 0.463U unrestricted, and the
        // best stop reaches 0.295U. A held-out, banded check, not a fit (design, Decisions). U and the second tap are
        // the head centre's speed along aim at the face region's first and second intervals' starts (plan decision
        // 20). A depth qualifies when the head–turf pair first closes after the first face contact begins and before
        // a second or the impact's end; a graze stays within HEAD_DEEP_LIMIT; a graze with no second tap counts 0.
        const ratios: number[] = [];
        for (let k = 0; k <= 16; k++) {
            const { impact, speed } = along(shot("stop-ac", 3, { jab: k * 0.0005 }));
            const face = impact.headRegions?.["face/blue#face"] ?? [];
            const first = face[0];
            if (first === undefined) {
                continue;
            }
            const second = face[1];
            const grounds = impact.timeline["head/turf"]?.[0]?.start;
            const qualifies =
                grounds !== undefined && grounds >= first.start && (second === undefined || grounds < second.start);
            if (qualifies && !impact.events.some((e) => e.kind === "impact-head-deep")) {
                ratios.push((second === undefined ? 0 : speed(second.start)) / speed(first.start));
            }
        }
        expect(ratios.length).toBeGreaterThan(0);
        for (const ratio of ratios) {
            expect(ratio).toBeGreaterThanOrEqual(0.295);
            expect(ratio).toBeLessThanOrEqual(0.463);
        }
    });
});
```

Fill each `<found>` from the `FOUND` line of Step 2 (`FOLLOW.type` is the roll's preset name), and each `<Step 2's
figures …>` comment from that run's line, in the repo's "figures, then mechanism" comment style. `process` may need
the same `declare const process` as the probe if the test files do not already declare it; copy whatever the other
slow tests do (search `SLOW_TESTS` in `tests/`).

- [ ] **Step 4: Run them**

Run: `npx vitest run tests/engine/turfStrike.test.ts`
Expected: the regimes PASS (the setups are Step 2's own); the jab check is skipped.

Run: `env SLOW_TESTS=1 npx vitest run tests/engine/turfStrike.test.ts`
Expected: the jab check runs. **Whatever it shows, do not change the law or the test for it**: the jab check is the
gate's (Task 8). If it fails, record its ratios in `<temp>/after/jab-check.txt` for the gate, and mark the case
`it.fails.runIf(SLOW)` with the comment "P2b.2b.2b.3: failing before the gate's ruling (Task 8)", so that the suite
stays green until the user rules.

- [ ] **Step 5: Run every check**

Run, one per call: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`.
Expected: all pass.

- [ ] **Step 6: Commit**

Stage `scripts/turfStrikeProbe.ts`, `tests/engine/turfStrike.test.ts`, the regimes' probe file.

Message: `Probe the turf strike's regimes and Gugan's jab, and pin each regime's setup`

---
### Task 8: The pre-flight gate

Spec §8, §9. **This task always stops for the user**, whatever the figures show.

**Files:**
- Create: `docs/superpowers/probes/<date>-p2b2b2b3-gate.txt` (the gate's raw output)
- Temp: `<temp>/scripts/regimeSeries.mts`, `<temp>/after/*`

**Interfaces:**
- Consumes: Task 1's baseline and scripts; Task 2's `saturated.txt`; Task 5's `moved-task5.txt`, `cost.txt`,
  `rebaselined.txt` and `unpredicted.txt`; Task 6's `jabFind.txt`; Task 7's probe, found setups and `jab-check.txt`.

- [ ] **Step 1: The regimes over time**

Create `<temp>/scripts/regimeSeries.mts`:

```ts
/**
 * P2b.2b.2b.3's gate (spec §8): each regime's run over time, every 1 ms of the impact: the head's speed along aim, its
 * lowest point, the turf's bearing and horizontal resistance along aim, and each hand's force. The setups are
 * tests/engine/turfStrike.test.ts's. Throwaway, never committed. Run from the worktree: npx --yes tsx <this>.
 */
import { headLowestPoint } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b3-turf-strike/src/engine/impact/contacts";
import type { ImpactProbe } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b3-turf-strike/src/engine/impact/integrate";
import { simulateImpact } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b3-turf-strike/src/engine/impact/simulateImpact";
import type { TrackDrive } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b3-turf-strike/src/engine/impact/types";
import { ZERO, dot, length } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b3-turf-strike/src/engine/math/vec3";
import { buildContact } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b3-turf-strike/src/engine/swing/buildContact";
import type { ShotSetup, StrokeType } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b3-turf-strike/src/engine/swing/types";
import { defaultWorld } from "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b3-turf-strike/src/engine/world";
import { backswingFor, canonicalSetup } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b3-turf-strike/tests/engine/support/shot";

const WORLD = defaultWorld();
// Copy GRAZE, STOPPED and BITING from tests/engine/turfStrike.test.ts.
const REGIMES = [
    { name: "graze", type: "single-ball", speed: 3, dip: 0, jab: 0, intensity: undefined },
    { name: "stopped", type: "single-ball", speed: 1, dip: 0, jab: 0, intensity: 0 },
    { name: "biting", type: "single-ball", speed: 4, dip: 0, jab: 0, intensity: undefined },
] as const;

for (const g of REGIMES) {
    const stroke = { jab: g.jab, timing: { arc: 0, hands: 0, dip: g.dip }, ...(g.intensity === undefined ? {} : { intensity: g.intensity }) };
    const base = canonicalSetup(g.type as StrokeType, { world: WORLD, stroke });
    const setup: ShotSetup = { ...base, stroke: { ...base.stroke, backswing: backswingFor(base, g.speed, WORLD) } };
    const contact = buildContact(setup, WORLD);
    const aim = (contact.drive as TrackDrive).arc.aim;
    console.log(`== ${g.name}: t ms, speed m/s, lowest mm, bearing N, resistance N, top N, bottom N ==`);
    const probe: ImpactProbe = {
        step(s) {
            if (Math.round(s.t * 1e6) % 1000 !== 0) {
                return;
            }
            const turf = s.headTurf ?? ZERO;
            console.log(
                [
                    (s.t * 1e3).toFixed(1),
                    dot(s.head.velocity, aim).toFixed(4),
                    (headLowestPoint(s.head, contact.head) * 1e3).toFixed(3),
                    turf.z.toFixed(1),
                    dot(turf, aim).toFixed(1),
                    length(s.hand?.top ?? ZERO).toFixed(1),
                    length(s.hand?.bottom ?? ZERO).toFixed(1),
                ].join(" "),
            );
        },
    };
    const impact = simulateImpact(contact, setup.balls, WORLD, { probe });
    console.log(`events ${impact.events.map((e) => `${e.kind}@${(e.t * 1e3).toFixed(2)}`).join(", ")}`);
}
```

Set its three entries' `dip` and `jab` (and the stopped run's intensity 0) from `tests/engine/turfStrike.test.ts`.

- [ ] **Step 2: Run the gate's figures (in the background)**

Run each with `run_in_background: true`:

Run: `npx --yes tsx <temp>/scripts/gateFigures.mts > <temp>/after/gate.txt`
Run: `npx --yes tsx <temp>/scripts/regimeSeries.mts > <temp>/after/regimeSeries.txt`
Run: `npx --yes tsx scripts/turfStrikeProbe.ts > <temp>/after/turfStrikeProbe.txt`
Run: `npx --yes tsx scripts/strokeProbe.ts > <temp>/after/strokeProbe.txt`
Run: `npx --yes tsx scripts/swingProbe.ts > <temp>/after/swingProbe.txt`
Run: `env COUNT=800 npx --yes tsx scripts/shotMix.ts > <temp>/after/shotMix-cost.txt`

- [ ] **Step 3: Write the gate file**

When all six finish, write `docs/superpowers/probes/<date>-p2b2b2b3-gate.txt` with these sections, each under a
heading line `== <name> ==`:

1. **The cost** (spec §9; the side note of 2026-10-15): `<temp>/after/cost.txt` (the preset sweep's wall time,
   baseline against now); the probe's `cost` section; `shotMix`'s engine time per shot from `shotMix-cost.txt`
   against the baseline's.
2. **The regimes** (spec §7.4): each found setup's line from the regimes file, then its series from
   `regimeSeries.txt`.
3. **The bounds** (spec §6.2, §8): the probe's `bounds` section.
4. **The jab** (spec §7.3): the probe's `jab` section, the jab check's verdict, and `jab-check.txt` if Task 7 wrote
   it.
5. **The canonical runs** (spec §8, §9): `<temp>/baseline/gate.txt` (the plane law) and `<temp>/after/gate.txt` (the
   new law), line by line, the old line then the new, the rolls first.
6. **The ratchet**: `saturated.txt` (Task 2), `moved-task5.txt` (Task 5), and the swing probe's `presets` and `rehit`
   tallies, old against new.
7. **The tests**: `rebaselined.txt` and `unpredicted.txt` (Task 5), and Task 6's AC-stop jabs (`J_ON`, `J_EARLY`).
8. **Any throw**: every "threw" line in any file above.

- [ ] **Step 4: Stop for the user**

Show the user, in this order:

1. **The cost**: the sweep's wall time against the baseline, the columns visited per step on each canonical setup,
   and `shotMix`'s engine time. Say plainly if the law has made the tests or the sweeps much slower, and which runs
   carry it.
2. **Any throw**, with its run, its message and its mechanism traced from the run's setup.
3. **The three regimes**: each one's setup and its series (forces, depths, speeds over time).
4. **The bounds**: whether each regime still occurs at each end of p_y's and c's bounds, and the jab check's verdict
   there.
5. **The jab**: the sweep at 3 m/s (the depth the heel first grounds, each second tap and its ratio) against Gugan's
   0.400U and its band, the check's verdict, and the no-jab value (the model's hands' check). Then the jab against the
   hands' check at 3 and 4 m/s: the second tap with and without the jab, the hands' peak checking force and the
   turf's braking impulse. If the jab helps less at 4 m/s than at 3, say so: spec §8 sends the arms' checking force to
   P2b.2b.2c, and this step does not change the law for it.
6. **The canonical runs** against the baseline: the head–turf intervals, depth and slide, the follow-through's finish
   and flags (the full and pass rolls' among them), the highest ball centre and the pass roll's rebound against its
   accepted 20.76 mm (exit criterion 5; a larger rise goes to the user here).
7. **The ratchet**: every moved preset run, every saturated run, the late re-hit's crossings and any overlap at the
   impact's end (exit criterion 6).
8. **The tests**: every re-baselined figure and every unpredicted one.

Ask the user to rule on one of:

- go on;
- change a value: p_y or c within their bounds, N_c, F_max, the sole's µ;
- change the mechanism: the law (§4), the hands' limit (§5), or the jab's input (§6.1).

**Wait for the ruling.** Do not start Task 9 until the user has ruled.

On the ruling:

- **A change to a value or the mechanism:**
  1. Make it.
  2. Re-run Task 5 Steps 8–9, Task 6 Step 7, Task 7 Steps 2–4 and this task's Steps 2–3.
  3. Stop again.
  4. Record each round in the gate file, with the user's words and date.
- **"Go on":**
  1. Write the pass roll's re-measured rebound into its skipped test's comment, labelled "P2b.2b.2b.3: the turf
     strike, gate ruling <date>".
  2. If the jab check was marked `it.fails` in Task 7, follow the user's ruling on it (restore it, or keep it marked
     with the ruling in its comment).
  3. Run every check.

- [ ] **Step 5: Commit**

Stage the gate file and any file a ruling changed, by path.

Message: `Record the turf strike's pre-flight gate: the regimes, the jab and the cost`

---
### Task 9: The gates and the version

Spec §1 exit criteria 1–7 and 9.

**Files:**
- Modify: `src/engine/simulate.ts` (`ENGINE_VERSION`)
- Modify: `tests/engine/index.test.ts`, `tests/engine/impact/simulateImpact.test.ts` (the version)

**Interfaces:**
- Consumes: Task 1's baseline, Task 8's ruling.

- [ ] **Step 1: Write the failing tests**

- `tests/engine/index.test.ts` (~line 69): `toBe("0.12.0")`.
- `tests/engine/impact/simulateImpact.test.ts` (~lines 52–53): `"is version 0.12.0"` and `toBe("0.12.0")`.

- [ ] **Step 2: Run them**

Run: `npx vitest run tests/engine/index.test.ts tests/engine/impact/simulateImpact.test.ts`
Expected: the version cases FAIL.

- [ ] **Step 3: Implement**

`src/engine/simulate.ts`: `export const ENGINE_VERSION = "0.12.0";`.

- [ ] **Step 4: Run the gates**

Exit criterion 2 (the ratchet's end):

- Run: `npx --yes tsx scripts/impactDigest.ts > <temp>/after/impactDigest.txt`
  Then: `diff <temp>/baseline/impactDigest.txt <temp>/after/impactDigest.txt`
  Expected: only the engine version, if the digest prints it. Any other line is a defect: stop.
- Run: `npx --yes tsx scripts/shotMix.ts > <temp>/after/shotMix.txt`, then compare its times-dropped file with the
  baseline's, as Task 2 Step 9. Expected: no output.

Exit criteria 1, 3 and 4 (the analytic cases, the regimes, the jab check):

- Run: `env SLOW_TESTS=1 npx vitest run tests/engine/impact/headTurfLaw.test.ts tests/engine/impact/headTurf.test.ts tests/engine/impact/gripLimit.test.ts tests/engine/turfStrike.test.ts`
  Expected: PASS (the jab check as the gate ruled).

Exit criterion 5 (every preset's canonical setup runs from top to finish):

- Run: `npx vitest run tests/engine/shot.test.ts -t "canonical setup from the top to its finish"`
  Expected: PASS for all seven presets.

Exit criterion 6 (no impact ends with the head overlapping a ball as handed over):

- Run: `env SECTION=rehit npx --yes tsx scripts/swingProbe.ts > <temp>/after/rehit.txt`
  Expected: every preset's "overlap one at the impact's end" counts 0. Record each preset's count.

Exit criterion 7: Task 8's ruling is in the gate file.

- [ ] **Step 5: Run every check**

Run, one per call: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`, and
`env SLOW_TESTS=1 npm test`.
Expected: all pass.

- [ ] **Step 6: Commit**

Stage the three files by path.

Message: `Bump the engine to 0.12.0 for the turf strike`

---
### Task 10: The probes, the outcomes and the documents

Spec §9, exit criterion 8; the plan's decisions.

**Files:**
- Modify: `scripts/swingProbe.ts` (its tallied flags and header)
- Create: `docs/superpowers/probes/<date>-p2b2b2b3-turfStrikeProbe.txt`,
  `docs/superpowers/probes/<date>-p2b2b2b3-swingProbe.txt`, `docs/superpowers/probes/<date>-p2b2b2b3-strokeProbe.txt`,
  `docs/superpowers/probes/<date>-p2b2b2b3-impactProbe.txt`
- Modify: `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`
- Modify: `docs/superpowers/specs/2026-10-14-p2b2b2b3-turf-strike-design.md` (an amendment note)

- [ ] **Step 1: The swing probe's tallies**

Spec §9: "the sweep's cap and flag tallies". In `scripts/swingProbe.ts`, add `"turf-yield"`, `"grip-limit"` and
`"impact-head-stopped"` to `FLAGS`, and to its header's `presets` bullet ("how often impact-head-deep, impact-cap,
impact-head-approaching, impact-off-face, turf-yield, grip-limit and impact-head-stopped fire"). Re-word its `dip`
bullet's "the head–turf penetration against HEAD_DEEP_LIMIT" as "the head's lowest point against HEAD_DEEP_LIMIT,
where a stroke goes beyond a graze (P2b.2b.2b.3)".

- [ ] **Step 2: Run the probes and keep the output**

Run each in the background:
`npx --yes tsx scripts/turfStrikeProbe.ts > docs/superpowers/probes/<date>-p2b2b2b3-turfStrikeProbe.txt`
`npx --yes tsx scripts/swingProbe.ts > docs/superpowers/probes/<date>-p2b2b2b3-swingProbe.txt`
`npx --yes tsx scripts/strokeProbe.ts > docs/superpowers/probes/<date>-p2b2b2b3-strokeProbe.txt`
`npx --yes tsx scripts/impactProbe.ts > docs/superpowers/probes/<date>-p2b2b2b3-impactProbe.txt`

Compare each with its baseline in `<temp>/baseline/`:

- `impactProbe`'s lines must match apart from its timings: force tables have no head–turf pair;
- every preset line that moved is this phase's, and is explained in the roadmap's outcomes.

- [ ] **Step 3: Update the roadmap (exit criterion 8)**

In `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`:

- **The P2 row:** name P2b.2b.2b.3 with this spec and plan, its exit criteria as spec §1, marked done.
- **"P2b.2b.2b decisions and findings":** the user's decisions of 2026-10-14 (as the spec's "Decisions" has them), the
  two planning rulings of 2026-10-15 (decisions 1 and 2), and the gate's ruling(s), with the user's words and date.
- **A new section "P2b.2b.2b.3 outcomes (<date>)"**, with spec §9's figures, from the probes against Task 1's
  baseline:
  - the jab sweep at 3 m/s: the depth the heel first grounds, each second tap, its ratio, the head's lowest point,
    `turf-yield` and `grip-limit` (impact events and follow-through flags); the check's verdict; and the 4 m/s run;
  - the regimes' runs and their setups;
  - every preset's canonical figures and the sweep's cap and flag tallies, as P2b.2b.2b.2c recorded them;
  - the full and pass rolls' follow-through finishes;
  - the cost: the columns visited per step (mean and worst), the tracked impacts' steps, the preset sweep's wall time
    against the baseline, and `shotMix`'s engine time run alone;
  - the ratchet's results (exit criterion 2): the saturated runs (Task 2) and the moved preset runs (Task 5);
  - every re-baselined test figure (Task 5) and the AC stop's jabs (Task 6).
- **"Provisional numbers":** add p_y (240 kPa) and c (105 kPa) as one lawn's figures, N_c (1.71, an analogue), and
  F_max (435 N).

- [ ] **Step 4: Record this plan's decisions in the phase spec**

Append to the phase spec an "Amendments (plan, <date>)" section. List decisions 1–21 above, each with its reason; the
user's rulings on decisions 1 and 2 (2026-10-15, before the plan); and every gate ruling. Decisions 1 and 2 also amend
§4.3's text: note there, in the amendment, which sentences they supersede ("its deepest column's elastic deflection
e", "with no damping").

- [ ] **Step 5: Check the documents**

Run: `env LC_ALL=en_GB.UTF-8 grep -nE "^[^|].{120,}$" docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`
Run: `env LC_ALL=en_GB.UTF-8 grep -nE "^[^|].{120,}$" docs/superpowers/specs/2026-10-14-p2b2b2b3-turf-strike-design.md`
Expected: only the roadmap's known line 29.

Run: `grep -nE "\bsplit\b|\bratio\b|\bcut\b|flick" docs/superpowers/specs/2026-10-14-p2b2b2b3-turf-strike-design.md`
Every hit must be the croquet sense, the vocabulary note itself, or a quoted source.

- [ ] **Step 6: Run every check**

Run, one per call: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`.
Expected: all pass.

- [ ] **Step 7: Commit**

Stage the probe outputs, `scripts/swingProbe.ts` and the two documents, by path.

Message: `Record the turf strike's outcomes and the plan's decisions`

Then offer the user `/handover`, and the finishing-a-development-branch skill for the PR.
