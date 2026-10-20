# P2b.2b.2c.2 — The Croquet Strokes' Fit: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The drive and the AC stop reach Gugan 5's ratios at 3 m/s by fitting parameters every stroke shares; the arm
returns a slid grip's anchor; the distance question gets a recorded, sourced verdict; and the jab and the grip-limit
control are re-measured on the fitted model.

**Architecture:**

- `track.ts`: `handLoad` takes the step's `dt`. In swing mode's pre-contact spring branch, a hand under its limit with
  a slid offset has that offset multiplied by exp(−dt/τ_arm) after its force is computed, τ_arm = c_hold/k_hold from
  the hands' `flex.hold`. Every other branch, and every hand whose offset is null, is untouched to the bit.
- `integrate.ts`: both callers pass `dt`; the follow-through probe's snapshot carries each hand's force and offset.
- `scripts/ratioFit.ts` (new): the fit's evaluator (both ratios at their targets' speeds for any value of the five
  shared candidates, without editing `contact.json`), the two-dimensional solver, and the distance check's runs.
  `scripts/fitRatios.ts` (new) solves the ruled pair and prints the updated `contact.json`.
- `scripts/croquetFitProbe.ts` (new): the pre-flight gate's sections A–H (spec §10), each runnable alone.
- `reference/swing.json` gains a `ratioTargets` block; `src/reference/index.ts` reads it.
- The tasks land in the spec's ratchet order (§8.2): the baseline and the tidy; the sources and the targets; the
  evaluator and the distance check's baseline; the checking force; the sensitivity probe and its gate; the fit; the
  held-out re-runs; the pre-flight gate; the documents; the version.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), Vitest, ESLint, Prettier. No
new dependencies. `npx --yes tsx` runs the scripts.

**Spec:** `docs/superpowers/specs/2026-10-19-p2b2b2c2-croquet-fit-design.md`. Read all of it, especially "Decisions",
§3 (the distance check), §4.1 (where the anchor slides, the decay order), §5.2 (candidates, bounds, the
effective-mass constraint), §7, §8 and §10. Also read:

- **Roadmap:** `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`: "P2b.2 decisions", "P2b.2b.2b.3
  outcomes (2026-10-17)", "P2b.2b.2c.1 outcomes (2026-10-19)" and its "Carried open items", "Provisional numbers".
  Line 12 is one enormous table row: grep it narrowly, never print it whole.
- **The previous plan:** `docs/superpowers/plans/2026-10-18-p2b2b2c1-single-ball.md`, for the conventions kept here
  (the preset digest, the gate, the documents).

**Decisions made while planning.** Task 9 folds each into the spec's Amendments.

1. **`handLoad`'s signature** becomes `handLoad(track, state, head, t, grip, dt, gripped = false)`: `dt` is required
   and sits before `gripped`, so no caller can forget it. Both integrator callers pass their `dt`; every test caller
   passes its loop's step, or `IMPACT_DT` for a single call.
2. **τ_arm comes from `hands.flex.hold`**, τ_arm = `hold.damping / hold.stiffness` (20.7/744 = 27.8226 ms on the
   default body). A null `hold` keeps every offset as today. The test hands (`TEST_FLEX`, `hold: null`) therefore keep
   every existing grip-limit test bit-identical; the new tests set a hold.
3. **Where the decay acts** (spec §4.1, constraint 3): in `handLoad`'s `!contact` branch, only when `spring` is true
   and `arc.mode !== "carry"`, per hand, only for a hand that did not saturate in this call and whose offset is
   non-null. The load returned is computed with the offset as it stood; the offset is then replaced by
   `scale(offset, exp(0 - dt / tau))` (`exp` from `src/engine/math/elementary.ts`). A hand that saturates slides as
   today and does not decay in the same call.
4. **The probe sees the grip.** `FollowSnapshot` gains `top: Vec3`, `bottom: Vec3` (each hand's force applied during
   the step) and `offsets: { readonly top: Vec3 | null; readonly bottom: Vec3 | null }` (copies, in the head's frame,
   after the step's `handLoad`). Probe-only: no run's arithmetic changes.
5. **The evaluator does not edit `contact.json`.** The ball–ball contact time enters through the world
   (`ballBallContactTime`, and every hoop's and the peg's `contactTime` set equal to it, spec §5.2); `armMass` and
   `reachSlack` through `canonicalSetup`'s `body`; T and ζ by replacing the planned contact's `TrackDrive.coupling`
   `period` and `dampingRatio` before `simulateImpact` (HAND_COUPLING enters the engine only at
   `buildContact.ts:747`). A parity test pins that, at today's values, the evaluator equals `simulateShot` to the bit.
6. **The fit's speed is exact.** Every evaluation plans its target's speed exactly: `strokeFor(setup, speed, world)`
   on the candidate's world and body (the arm mass enters the downswing). The canonical default-backswing runs are the
   recorded check (section D), as `strokeProbe` reports them.
7. **The solver** (`solvePair`): Newton on the two errors (ratio − target), the Jacobian by forward differences of
   1 % of each bound's width (backward at an upper bound), each iterate clamped into its bounds; at most 20
   iterations; converged when both |errors| ≤ 0.01 (spec §5.3). Otherwise it returns the evaluated point minimising
   max(|e_drive|/tol_drive, |e_stop|/tol_stop), the spec's "closest" (exit criterion 6), with `converged: false`.
8. **The targets' schema.** `swing.json` gains top-level `ratioTargets: { drive: { ratio, speed }, "stop-ac": { ratio,
   speed } }`, each entry a `readValue` entry: `ratio` (unit `1`, value the target, bounds the tolerance band,
   provenance `direct`, Gugan 5 as source) and `speed` (unit `m/s`). `index.ts` exports `ratioTargetsReference`.
9. **The distance check's open lawn** moves from `singleBallProbe.ts` to `scripts/openLawn.ts` (`OPEN_LAWN`,
   `OPEN_START`, `openWorld()`, `opened(setup)`), both probes importing it. The ball's speed "at the face's release" is
   the striker's ball at the first impact step after its first face contact ends, else at handover, as
   `singleBallProbe`'s `release` reads it.
10. **The preset digest covers the follow-through.** Every run in it is `simulateShot(…, { trajectory: true })`, so the
    stops' holds, where the checking force acts, are in the ratchet.
11. **The sensitivity probe's slope** at today's value is a central difference of ±1 % of the bound's width (one-sided
    at a bound: `reachSlack` sits at its upper one). A pair's distinctness is the angle between its two slope vectors
    in the (drive, stop) plane, each slope times its bound's width; its linear reach is the 2×2 solve of today's errors
    against those slopes, reachable when the solution lies within both bounds.

## Global Constraints

- **Formatting.**
  - Use 4-space indentation, a 120-column limit, LF line endings and UTF-8.
  - Check line lengths with `env LC_ALL=en_GB.UTF-8 grep -nE "^[^|].{120,}$" <file>`. Table rows in markdown are
    exempt, and roadmap lines 12 and 29 are known pre-existing hits.
  - Run `npx prettier --write` on every code and JSON file you touch. `npm run format:check` must pass.
  - `.prettierignore` lists `docs/`, so wrap markdown by hand. Prettier does not re-wrap comments or strings: wrap any
    comment over 120 columns by hand, and break any template literal over 120 columns with `+`.
- **Engine purity.** `src/engine/**` is pure and deterministic: no DOM, no time of day, no randomness.
- **Determinism lint.** Engine code uses only `+ − * /`, comparisons, `Math.sqrt`, `Math.abs`, `Math.min`,
  `Math.max`, `Math.round`, `Math.floor`, `Math.ceil`, `Math.PI`, `Number.isFinite`, and the engine's `sinCos`,
  `atan2`, `ln`, `exp` and `pow` (`src/engine/math/elementary.ts`). No `Math.exp`, `Math.pow`, `**` and the like.
  Tests and scripts may use any `Math`.
- **Style.** No non-null assertions (`!`); `x as T` after indexing. Braces on every `if`. `0 - x`, not unary minus,
  in engine arithmetic. Exported functions carry a header comment. A constant that is not physical says "Numerical,
  not physical" and why. `import type` for type-only imports. Argument lists all on one line, or one per line when
  more than three or past 120 columns. Comments give reasons, not process labels ("plan decision N", "Task N").
- **Units.** SI: m, s, kg, N, N·m, rad, rad/s.
- **Vocabulary.** "Split", "ratio" and "cut" keep their croquet meanings only: a ratio is the croqueted ball's
  distance over the striker's ball's. The pendulum/hands share is "phasing", the turf's drag "ploughing". A hand
  **saturates**, its anchor **slides**; the **checking force** is the arm's return of a slid anchor (spec,
  "Vocabulary").
- **Engine version.** `ENGINE_VERSION` becomes `"0.14.0"` (Task 10).
- **The ratchet** (spec §8.2): after Task 1 every baseline bit-identical, the probes changed only in the labels fixed;
  after Task 4 every run whose offset stays null bit-identical, every moved run a stop's hold, listed; after Task 6
  every preset may move, each moved run counted per preset. Code with an input absent keeps today's arithmetic: branch
  on it rather than add a zero term (`x + 0` turns −0 into +0, and the digest keeps the sign of zero).
- **The ratchet's runs** run in the background and must finish, and match, before that task's commit. `pgrep -fl tsx`
  must print no digest or probe process before a commit. Each output file must be non-empty. `shotMix` and
  `impactProbe` print times; compare with them dropped: `grep -v "ms per shot" <file> > <file>.cmp` and
  `grep -v "µs/step" <file> > <file>.cmp`.
- **Slow tests** run only when `SLOW_TESTS` is set, by the controller, never while an implementer is editing. The CI
  runner is 1.3–4× slower than local: a test over about 5 s locally gets an explicit timeout of at least 4× its local
  time.
- **Subagents** are dispatched in the foreground with a 600 s timeout; the controller runs the long probes, the
  digests and `SLOW_TESTS` itself. SDD scripts run from inside the worktree.
- **RED steps.** Vitest does not type-check: a test using a missing export or field fails at runtime, and
  `npm run check` shows the type errors.
- **Behaviour figures.** A test resting on model behaviour carries its reasoning in a comment. Where a test fails,
  trace the mechanism before changing an expectation. A re-baselined figure gets the comment "P2b.2b.2c.2: the croquet
  fit (was <old>)". No test is loosened to pass. A changed expectation the spec does not predict goes to the user at
  the pre-flight gate (Task 8) and into the Amendments (Task 9).
- **Circularity.** The fit's only targets are Gugan 5's drive and stop ratios. The CA bands, the 2–4 m/s sweep, the
  distance check, the jab, the control run and the rolls are recorded or held out, never tuned to. The user's figures
  are checks, never targets. The face's contact time is never a candidate.
- **Kept as they are.** Gugan's jab check stays `it.runIf(SLOW).fails` unless Task 7 shows it passing. The "weak
  stroke stopped dead" test stays `it.todo`. The turf rebound stays. Nothing is scripted per stroke type.
- **Process.** Follow the plan's steps; no side probes: figures come from the steps that produce them. Both gates
  (Tasks 5 and 8) **always stop for the user**, whatever they show. Put each question to the user one at a time, with
  options, pros, cons and a recommendation; record each ruling verbatim in the spec's Amendments.
- **Bash.** One command per call: no `&&`, `||`, `;`, `$(…)` or subshells. Redirecting a script's output with `>` or
  `2>` is allowed. No `bash -c` or `node -e`; `python3 -I` for JSON checks. Oxford Croquet pages need `curl -k`.
- **The temp directory.** `<temp>` is the executing session's literal temp path (`CLAUDE_TEMP_DIR`), written out in
  full; a subagent is given it in its prompt. Throwaway scripts go in `<temp>/scripts/`, outputs in
  `<temp>/baseline/`, `<temp>/after/` and `<temp>/sources/`. `<date>` is the day the step runs, YYYY-MM-DD. Throwaway
  scripts import the worktree by absolute path.
- **Sources.** Cite, don't mirror: the URL, the date, the SHA-256 of the fetched file and short annotated quotes in
  `reference/sources/README.md`; commit no fetched file.
- **Commits.** A short imperative sentence (repo style), signed. Write the message to a fresh `<temp>/msg-task<N>.txt`
  and commit with `git commit -F <that path>`. Check with `git log -1 "--format=%G? %h"`; expect `G`. If signing
  refuses, leave the change staged and report it. Stage by explicit path. Never `--no-verify`,
  `-c commit.gpgsign=false` or bare `git stash`.
- **Checks after every task:** `npm test`, `npm run lint`, `npm run check` and `npm run format:check`, one per call,
  all pass. Task 1 records the baseline count.
- **Known noise.** The editor's TypeScript LSP may report stale "Cannot find module" diagnostics; `npm run check` is
  the source of truth.
- **Worktree.** All work happens in `/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2c2-croquet-fit`, on
  branch `worktree-p2b2b2c2-croquet-fit`, from `main` at ee16a93 (PR #30). The spec and this plan are its first two
  commits; `main` takes only merges. The branch stays local until the PR.

## Review Focus

The spec implies each input below, but none of its listed tests exercises it. The owning task pins each with a test.

1. **A step far longer than τ_arm, and a body with no hold.** At dt = 10·τ_arm the offset must shrink by exp(−10) and
   stay a finite vector, never turn null or NaN; with `hold: null` it must stay exactly as it was. Pinned in Task 4
   ("keeps the offset finite at a long step, and as it was without a hold").
2. **A load that returns past F_max after the anchor has partly recovered.** The hand must slide on from the recovered
   offset, transmit F_max to 1e-9 and store no more than F_max²/(2k). Pinned in Task 4 ("slides on from the recovered
   offset when the load returns past F_max").
3. **Targets out of reach within the bounds.** The solver must never evaluate a point outside the bounds, and must
   return the closest evaluated point with `converged: false`, never an extrapolation. Pinned in Task 3 ("stays within
   its bounds and returns the closest point when the targets are out of reach").
4. **The evaluator drifting from the engine.** At today's values the evaluator's ratio must equal `simulateShot`'s on
   the same setup to the bit, before the fit and, once `contact.json` holds the fitted values, after it. Pinned in
   Task 3 ("reproduces simulateShot's ratio to the bit at today's values"), which reads `contact.json` and so re-checks
   the fitted values from Task 6 on.
5. **A ratio with no striker travel.** A run whose striker's ball does not move must throw a named `RangeError`, never
   hand Infinity or NaN to the solver. Pinned in Task 3 ("throws when the striker's ball does not move").

---
## File Structure

| Path | Change |
|---|---|
| `scripts/singleBallProbe.ts`, `reference/swing.json`, `tests/engine/swing/buildContact.test.ts`, `tests/engine/swing/defaultStroke.test.ts`, `tests/engine/shot.test.ts`, `src/engine/swing/downswing.ts`, `tests/engine/support/shot.ts` | The tidy (Task 1) |
| `reference/sources/README.md` | The CA unit and measuring point, Gugan 5's stop speed, le Maitre, the ball makes (Task 2) |
| `reference/swing.json`, `src/reference/index.ts`, `tests/reference/reference.test.ts` | `ratioTargets` (Task 2) |
| `scripts/openLawn.ts` | New: the open lawn, moved from `singleBallProbe.ts` (Task 3) |
| `scripts/ratioFit.ts` | New: the evaluator, the solver, the distance check's runs (Task 3) |
| `scripts/croquetFitProbe.ts` | New: the gate's sections, A (Task 3), B (Task 4), C (Task 5), D (Task 6), E and F (Task 7), G and H (Task 8) |
| `tests/engine/ratioFit.test.ts` | New (Task 3; Task 6 adds the read-back test) |
| `src/engine/impact/track.ts`, `src/engine/impact/integrate.ts` | The checking force; the probe's grip (Task 4) |
| `tests/engine/impact/gripLimit.test.ts`, `tests/engine/impact/hands.test.ts`, `tests/engine/impact/mallet.test.ts` | `dt` passed (Task 4); the new cases in `gripLimit.test.ts` |
| `scripts/fitRatios.ts` | New: solves the ruled pair, prints `contact.json` (Task 6) |
| `reference/contact.json` | The fitted values (Task 6) |
| `src/engine/swing/profile.ts`, `reference/swing.json` | The drive's and the AC stop's grips, only if the gate rules them in (Task 6) |
| Existing tests | Re-baselined (Task 6); `tests/engine/turfStrike.test.ts` (Task 7) |
| `src/engine/simulate.ts` | `ENGINE_VERSION` 0.14.0 (Task 10) |
| `docs/superpowers/probes/<date>-p2b2b2c2-*.txt` | The gates' and the probes' output (Tasks 5, 8, 9) |
| The roadmap, the spec | §11's figures, this plan's decisions, the gates' rulings (Task 9) |

Every commit stays green: Tasks 1–3 change no run; Task 4 moves only the stops' holds; Task 5 commits the probe only;
Task 6 commits the fit with the re-baselined tests.

---
### Task 1: The baseline and the tidy

Spec §8.2 (the baseline, before any change), §9; exit criterion 1.

**Files:**
- Modify: `scripts/singleBallProbe.ts` (output strings at `:490`, `:625`, `:706`, `:773`), `reference/swing.json`
  (the notes at its lines 7 and 40), `tests/engine/swing/buildContact.test.ts:926`,
  `tests/engine/swing/defaultStroke.test.ts:23`, `tests/engine/shot.test.ts:315`, `:327`, `:408`,
  `src/engine/swing/downswing.ts:87`, `tests/engine/support/shot.ts:401`
- Temp, never committed: `<temp>/scripts/presetDigest.mts`, `<temp>/baseline/*`

**Interfaces:**
- Produces: `<temp>/baseline/<name>.txt` for `presetDigest`, `impactDigest`, `shotMix`, `impactProbe`, `strokeProbe`,
  `swingProbe` and `singleBallProbe`, `<temp>/baseline/shotMix-cost.txt`, the test count, and `presetDigest.mts`,
  which later tasks run unchanged.

- [ ] **Step 1: Confirm the branch's code is `main`'s**

Run: `git diff --stat main -- src tests scripts reference`
Expected: no output.

Run: `mkdir -p <temp>/scripts <temp>/baseline <temp>/after <temp>/sources`

- [ ] **Step 2: Write the preset digest**

Create `<temp>/scripts/presetDigest.mts` as `docs/superpowers/plans/2026-10-15-p2b2b2b3-turf-strike.md`'s Task 1
Step 2 block, with every import's worktree `p2b2b2b3-turf-strike` replaced by `p2b2b2c2-croquet-fit`, its header's
references made this plan's, and every grid run given `{ trajectory: true }` (plan decision 10). Each line keeps its
label, its outcome's SHA-256 and its head–turf intervals; rejected runs print their message.

- [ ] **Step 3: Capture the baseline (in the background)**

Run each with `run_in_background: true`:

Run: `npx --yes tsx <temp>/scripts/presetDigest.mts > <temp>/baseline/presetDigest.txt`
Run: `npx --yes tsx scripts/impactDigest.ts > <temp>/baseline/impactDigest.txt`
Run: `npx --yes tsx scripts/shotMix.ts > <temp>/baseline/shotMix.txt`
Run: `npx --yes tsx scripts/impactProbe.ts > <temp>/baseline/impactProbe.txt`
Run: `npx --yes tsx scripts/strokeProbe.ts > <temp>/baseline/strokeProbe.txt`
Run: `npx --yes tsx scripts/swingProbe.ts > <temp>/baseline/swingProbe.txt`
Run: `npx --yes tsx scripts/singleBallProbe.ts <temp>/baseline/task3-rejected.txt > <temp>/baseline/singleBallProbe.txt`

`singleBallProbe`'s section I reads a rejected-runs list from its argument: create `<temp>/baseline/task3-rejected.txt`
empty first, and pass that same path every time the probe runs in this plan.

When all have finished and `pgrep -fl tsx` prints none, take the cost baseline alone:
Run: `env COUNT=800 npx --yes tsx scripts/shotMix.ts > <temp>/baseline/shotMix-cost.txt`

Run: `npm test` and record the passed and skipped counts.

- [ ] **Step 4: The tidy**

1. `singleBallProbe.ts`: each output string's "plan decision N" and "ruling N" becomes the design section and the
   gate's date it stands for, as commit c757c22 did for the comments (e.g. "(design §5.2, the pre-flight gate,
   2026-10-18)"); the design's Amendments say which ruling each was.
2. `swing.json`: the two notes' "the pre-flight gate's ruling N (2026-10-19)" become "the pre-flight gate
   (2026-10-18)" with the ruling's substance in a few words. Check the date against the P2b.2b.2c.1 design's Amendments
   first; c757c22 dated the gate 2026-10-18.
3. `buildContact.test.ts:926`'s title and `defaultStroke.test.ts:23`'s `describe`: "the pre-flight gate's ruling 2"
   becomes "the default backswing fixed, speeds above it by effort (the pre-flight gate, 2026-10-18)".
4. `shot.test.ts`: "(exit criterion 3)" in the three titles names its design: the effective mass's is "(P2b.2b.1
   design, exit criterion 3)"; for the two canonical-run titles, find with `grep -n "top to finish\|its finish"
   docs/superpowers/specs/*.md` the design whose exit criterion that is, and name it.
5. `downswing.ts:87`: the −0 comment states why: `effortTorque` returns +0, not −0, at intensity 0 and at or beyond
   ω_max, because the integrator's sums keep the sign of zero and the gravity-only swing must stay bit-identical.
6. `strokeFor` (`tests/engine/support/shot.ts:381-401`): `SwingProfile` carries no default backswing, so the reading
   stays; its header comment says that h_0 comes from `swingReference` for that reason, so a setup with another mallet
   or body still starts from the default player's h_0.

- [ ] **Step 5: Run the checks**

Run the four checks. Expected: pass, with Step 3's counts.

- [ ] **Step 6: The ratchet (in the background)**

Rerun Step 3's lines into `<temp>/after/` (the tidy's outputs `-task1`). Compare each with `cmp` (`.cmp` files for
`shotMix` and `impactProbe`).
Expected: all identical except `singleBallProbe`, whose `diff` shows only the label strings of item 1.

- [ ] **Step 7: Commit**

Stage the files above by path. Message: `Give the single-ball stroke's probe and notes their reasons, not labels`.

---
### Task 2: The sources and the targets

Spec §5.1, §6; exit criterion 2; plan decision 8.

**Files:**
- Modify: `reference/sources/README.md`, `reference/swing.json`, `src/reference/index.ts`,
  `tests/reference/reference.test.ts`
- Temp: `<temp>/sources/*`

**Interfaces:**
- Produces: `ratioTargetsReference: Readonly<Record<"drive" | "stop-ac", { readonly ratio: ReferenceValue;
  readonly speed: ReferenceValue }>>` from `src/reference/index.ts`; the CA travel unit and measuring point; the stop's
  fit speed.

- [ ] **Step 1: Fetch and read the sources**

Each into its own new directory under `<temp>/sources/`, fetched twice and hashed with `shasum -a 256`; record the
digest only if both agree. Oxford Croquet with `curl -k`. Find each passage with `grep -n` (after `pdftotext -layout`
for a PDF). Use the web-search skill for any URL not in the README.

1. *Project Croquet Dynamics* (the CA PDF the README cites) and Gugan 4 (oxfordcroquet.org/tech/gugan4/), Table 2: the
   unit of the A1D–A4D ball travel, quoted, and where and how the ball speed was measured, quoted.
2. Gugan 5 (oxfordcroquet.org/tech/gugan5/): whether the stop shots' mallet speed is stated, quoted; the make of ball
   in its drives, if stated.
3. le Maitre's drive ratio by ball make (the 2.7–4.2 spread): the makes and each ratio. If it cannot be found, record
   the search and carry the item.
4. The make behind `faceRestitutionFit` and `faceContactTimeFit` (Gugan 2000, the README's strike-law section): quoted.

- [ ] **Step 2: Cite them**

A section `## P2b.2b.2c.2: the croquet strokes' fit (design §3, §5.1, §6)` in `reference/sources/README.md`: each
source's row (URL, date, SHA-256, quotes) and a line per check: the CA unit and the ball speed's measuring point; the
stop's speed ("stated: X m/s", or "not stated: the stop is fitted at 3 m/s"); the makes and whether they differ.

- [ ] **Step 3: Write the failing test**

In `tests/reference/reference.test.ts`:

```ts
describe("the ratio targets (P2b.2b.2c.2 design §5.1)", () => {
    it("gives Gugan 5's drive and stop ratios with his tolerances as bounds", () => {
        expect(ratioTargetsReference.drive.ratio.value).toBe(4.23);
        expect(ratioTargetsReference.drive.ratio.bounds).toEqual([4.03, 4.43]);
        expect(ratioTargetsReference["stop-ac"].ratio.value).toBe(7.15);
        expect(ratioTargetsReference["stop-ac"].ratio.bounds).toEqual([6.55, 7.75]);
        expect(ratioTargetsReference.drive.speed.value).toBe(3);
    });
    it("rejects a target outside its tolerance band or a missing speed", () => {
        // Each a copy of swing.json with one field broken, read through the module's parser.
        expect(() => readRatioTargets(withTarget("drive", { ratio: { value: 5 } }))).toThrow(ReferenceDataError);
        expect(() => readRatioTargets(withTarget("stop-ac", { speed: undefined }))).toThrow(ReferenceDataError);
    });
});
```

`readRatioTargets(json)` is the parser `index.ts` exports for the test; `withTarget` deep-copies `swing.json` with one
entry changed.

- [ ] **Step 4: Run to verify it fails**

Run: `npx vitest run tests/reference`
Expected: FAIL (`ratioTargetsReference` undefined).

- [ ] **Step 5: Implement**

- `swing.json`: `ratioTargets` per plan decision 8. The stop's `speed` is Step 2's (3 m/s if Gugan 5 states none, its
  note saying so). Each note gives the CA band beside the target (drive 3.0–4.0, stop 4.1–6.2) and, for the drive,
  that 4.03 sits just above the CA's 4.0 (recorded, not resolved, spec §5.1).
- `index.ts`: `readRatioTargets(json)` reads both entries with `readValue` and checks each ratio's value lies within
  its bounds and each speed is positive, throwing `ReferenceDataError`; `ratioTargetsReference` is its result on
  `swing.json`. The `swing.json` reader ignores the new block where it walks the presets.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/reference`
Expected: PASS.

- [ ] **Step 7: Checks and commit**

Run the four checks. Commit the four files. Message: `Cite the fit's sources and record Gugan 5's ratio targets`.

---
### Task 3: The evaluator and the distance check's baseline

Spec §3, §5.3; exit criterion 3 (before); plan decisions 5–7, 9.

**Files:**
- Create: `scripts/openLawn.ts`, `scripts/ratioFit.ts`, `scripts/croquetFitProbe.ts`, `tests/engine/ratioFit.test.ts`
- Modify: `scripts/singleBallProbe.ts` (imports the open lawn)

**Interfaces:**
- Consumes: `ratioTargetsReference` (Task 2); `canonicalSetup`, `strokeFor` (`tests/engine/support/shot.ts`);
  `planStroke`, `simulateImpact`, `simulateFreeMotion`.
- Produces, in `scripts/ratioFit.ts`:
  - `interface FitParams { readonly ballBallContactTime: number; readonly handCouplingPeriod: number;
    readonly handCouplingDampingRatio: number; readonly armMass: number; readonly reachSlack: number }`;
    `const TODAY: FitParams` (from `contactReference`); `type Candidate = keyof FitParams`;
    `const BOUNDS: Readonly<Record<Candidate, readonly [number, number]>>` (from `contactReference`'s bounds);
  - `fitWorld(p: FitParams, base?: World): World` (plan decision 5; `base` defaults to `defaultWorld()`);
  - `fitSetup(type: StrokeType, p: FitParams, speed: number, world?: World): ShotSetup` (the canonical setup with
    `p`'s body, its stroke from `strokeFor` at `speed`);
  - `runFit(setup: ShotSetup, p: FitParams, world: World): { readonly impact: ImpactResult;
    readonly motion: ShotResult; readonly release: BallState }` (planStroke, the coupling replaced, simulateImpact
    with a probe reading the release, simulateFreeMotion);
  - `ratioOf(setup: ShotSetup, motion: ShotResult): number` (throws a RangeError naming the stroke when the striker's
    travel is not positive);
  - `ratiosAt(p: FitParams): { readonly drive: number; readonly stop: number }` at the targets' speeds;
  - `solvePair(evaluate: (x: readonly [number, number]) => readonly [number, number], start: readonly [number,
    number], bounds: readonly [readonly [number, number], readonly [number, number]], targets: readonly [number,
    number], tolerances: readonly [number, number]): { readonly point: readonly [number, number];
    readonly values: readonly [number, number]; readonly converged: boolean; readonly evaluations: number }`;
  - `const CA_STROKES` (A1D–A4D: mallet speed, ball speed, travel, from the README) and
    `releaseSpeedFor(ballSpeed: number, p?: FitParams): number` (the planned speed, bisected, whose release ball speed
    equals `ballSpeed`).
- In `scripts/openLawn.ts`: `OPEN_LAWN`, `OPEN_START`, `openWorld(): World`, `opened(setup: ShotSetup): ShotSetup`.

- [ ] **Step 1: Write the failing tests**

```ts
describe("the fit's evaluator (P2b.2b.2c.2 design §5)", () => {
    it("reproduces simulateShot's ratio to the bit at today's values", () => {
        // Review focus 4. The coupling, the world's contact times and the body replaced by today's own values.
        for (const type of ["drive", "stop-ac"] as const) {
            const setup = fitSetup(type, TODAY, 3);
            const { motion } = runFit(setup, TODAY, fitWorld(TODAY));
            const outcome = simulateShot(setup, defaultWorld());
            expect(ratioOf(setup, motion)).toBe(ratioOf(setup, outcome.motion));
        }
    });
    it("moves the ratio when only the coupling's period moves", () => {
        // The override reaches the impact: a period at its lower bound changes the drive's ratio.
        const p = { ...TODAY, handCouplingPeriod: BOUNDS.handCouplingPeriod[0] };
        const setup = fitSetup("drive", p, 3);
        expect(ratioOf(setup, runFit(setup, p, fitWorld(p)).motion)).not.toBe(ratiosAt(TODAY).drive);
    });
    it("throws when the striker's ball does not move", () => {
        // Review focus 5.
        const setup = fitSetup("drive", TODAY, 3);
        expect(() => ratioOf(setup, stillMotion(setup))).toThrow(/striker's ball .* did not move/);
    });
});

describe("the pair's solver (design §5.3)", () => {
    // A synthetic linear map: ratios = A·x + b, its root at (0.3, 0.6) in the unit square.
    it("finds the root of a linear map to 0.01 on each ratio", () => {
        const r = solvePair(linear, [0.5, 0.5], UNIT, [4.23, 7.15], [0.2, 0.6]);
        expect(r.converged).toBe(true);
        expect(Math.abs(r.values[0] - 4.23)).toBeLessThanOrEqual(0.01);
        expect(Math.abs(r.values[1] - 7.15)).toBeLessThanOrEqual(0.01);
    });
    it("stays within its bounds and returns the closest point when the targets are out of reach", () => {
        // Review focus 3. The root lies at x = 1.4, outside [0, 1]: every evaluation is checked inside the bounds.
        const seen: (readonly [number, number])[] = [];
        const r = solvePair((x) => (seen.push(x), farLinear(x)), [0.5, 0.5], UNIT, [4.23, 7.15], [0.2, 0.6]);
        expect(r.converged).toBe(false);
        expect(seen.every(([a, b]) => a >= 0 && a <= 1 && b >= 0 && b <= 1)).toBe(true);
        expect(worst(r.values)).toBe(Math.min(...seen.map((x) => worst(farLinear(x)))));
    });
});
```

`stillMotion(setup)` is a `ShotResult` whose rest positions equal the setup's; `linear`, `farLinear`, `UNIT` and
`worst` (max of each error over its tolerance) are local helpers.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/engine/ratioFit.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

- `scripts/openLawn.ts`: move `OPEN_LAWN`, `OPEN_START`, `openWorld` and `opened` from `singleBallProbe.ts` verbatim,
  each exported with its comment; `singleBallProbe.ts` imports them.
- `scripts/ratioFit.ts`: per its Interfaces block and plan decisions 5–7, 9. Its header comment states that it never
  edits `contact.json`, how each candidate enters, and that the evaluator equals the engine at today's values.
  `releaseSpeedFor` bisects the planned speed over [0.1, 9] m/s (the ceiling), 60 halvings, on the single-ball preset.
- `scripts/croquetFitProbe.ts`: header comment per repo style; `SECTION` as the other probes; section **A**, the
  distance check (spec §3), every figure to 4 decimals:
  - the CA unit and the measuring point, as Task 2 recorded them (a constant with its README line);
  - per CA stroke on the open lawn: the strike's share (planned at the CA mallet speed: the release ball speed against
    the CA's, the ratio of the two) and the lawn's share (planned at `releaseSpeedFor(CA ball speed)`: the travel to
    rest in the CA's unit against the CA's travel, the ratio); A1D marked a very short stroke (Hall's longer
    contacts);
  - Gugan 5's drive on the drive preset at 3 m/s on the open lawn: the croqueted ball's travel in yards against about
    seven;
  - every speed reached by `strokeFor`, its regime printed.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/ratioFit.test.ts`
Expected: PASS.

- [ ] **Step 5: The baseline distance check and the ratchet (in the background)**

Run: `env SECTION=A npx --yes tsx scripts/croquetFitProbe.ts > <temp>/baseline/distance.txt`
Run: `npx --yes tsx scripts/singleBallProbe.ts <temp>/baseline/task3-rejected.txt > <temp>/after/singleBallProbe-task3.txt`
Expected: `distance.txt` non-empty, no RangeError; `singleBallProbe` identical to Task 1's after-tidy output.

- [ ] **Step 6: Checks and commit**

Run the four checks. Commit the five files. Message: `Add the croquet fit's evaluator and the distance check`.

---
### Task 4: The arms' checking force

Spec §4, §8.1, §8.2.2; exit criterion 4; plan decisions 1–4.

**Files:**
- Modify: `src/engine/impact/track.ts` (`handLoad` `:1586-1720`, its header comment; `GripState`'s comment),
  `src/engine/impact/integrate.ts` (`:1068`, `:1356`, `FollowSnapshot`, the follow probe call at `:1383`),
  `src/engine/impact/types.ts` (`Hands.gripLimit`'s comment), `tests/engine/impact/hands.test.ts`,
  `tests/engine/impact/mallet.test.ts`, `scripts/croquetFitProbe.ts`
- Test: `tests/engine/impact/gripLimit.test.ts`

**Interfaces:**
- Produces: `handLoad(track, state, head, t, grip, dt: number, gripped = false): HandLoad`;
  `FollowSnapshot.top`, `.bottom`, `.offsets` (plan decision 4); section B of `croquetFitProbe.ts`.

- [ ] **Step 1: Pass `dt` and expose the grip to the probe**

Add the `dt` parameter (unused yet) and plan decision 4's snapshot fields. Update every caller: the two in
`integrate.ts` with their `dt`; every test call (45 in the three test files) with its loop's step or `IMPACT_DT`.

Run: `npx vitest run tests/engine/impact`
Expected: PASS.

- [ ] **Step 2: Section B and the drift on `main`'s arithmetic**

Section **B** of `croquetFitProbe.ts`: for the AC and GC stops' canonical setups at 3 m/s and their `swingProbe` grid
(5 speeds × 5 drives × 3 heights × 3 sides, as the preset digest), each run with `trajectory` through
`simulateStroke` and a follow probe: the peak and the final |offset| of each hand (mm), the time of the peak, the
peak |force| of each hand over the follow-through (N), and the `follow-grip-limit` flag; then the run with the largest
peak, and the count of runs with any offset set, per preset.

Run (in the background): `env SECTION=B npx --yes tsx scripts/croquetFitProbe.ts > <temp>/baseline/drift.txt`
Expected: the canonical GC stop's peak near 378 mm (spec §4.3). If no run shows 378 mm, record the largest and which
run gives it; the gate shows both.

Run the ratchet's first four lines into `<temp>/after/*-task4a.txt` and compare with Task 1's.
Expected: all identical (Step 1 changes no arithmetic).

- [ ] **Step 3: Write the failing tests**

In `gripLimit.test.ts`, a `describe("the arms' checking force (P2b.2b.2c.2 design §4, §8.1)")` on the file's
`running` track with a hold, `HOLD = { stiffness: 744, damping: 20.7 }`, `TAU = 20.7 / 744`:

```ts
it("leaves a hand's forces as they were until its offset is first set", () => {
    // §8.1.1: with and without a hold, every step's load is equal until the first saturation.
    expect(loadsUntilSaturation(withHold(HOLD))).toEqual(loadsUntilSaturation(withHold(null)));
});
it("slides at the limit exactly as before, transmitting F_max", () => {
    // §8.1.2: at a saturating step the offset and force equal the hold-less run's.
    const [a, b] = saturatingStep(withHold(HOLD), withHold(null));
    expect(a.offset).toEqual(b.offset);
    expect(Math.abs(length(a.top) - LIMIT) / LIMIT).toBeLessThan(1e-9);
});
it("relaxes the offset by exp(−dt/τ_arm) under the limit, after the step's force", () => {
    // §8.1.3 and constraint 3: test first, decay after.
    for (const dt of [1e-5, 1e-3, 5e-3]) {
        const { before, after, load, loadWithoutDecay } = underLimitStep(withHold(HOLD), dt);
        expect(load).toEqual(loadWithoutDecay);
        for (const k of ["x", "y", "z"] as const) {
            expect(after[k]).toBeCloseTo(before[k] * Math.exp(-dt / TAU), 12);
        }
    }
});
it("relaxes a sliding bottom hand's offset too", () => {
    // §8.1.5.
    const { before, after } = underLimitStep(withHold(HOLD), 1e-3, "bottom");
    expect(length(after)).toBeCloseTo(length(before) * Math.exp(-1e-3 / TAU), 12);
});
it("keeps a carry hand's slid offset: carry mode's chain already holds the arm", () => {
    // §8.1.5, constraint 4: the existing carry case, then an under-limit step, its offset unchanged.
    expect(carryOffsetAfterEasing(withHold(HOLD))).toEqual(carryOffsetBeforeEasing(withHold(HOLD)));
});
it("keeps the offset finite at a long step, and as it was without a hold", () => {
    // Review focus 1.
    const long = underLimitStep(withHold(HOLD), 10 * TAU);
    expect(length(long.after)).toBeCloseTo(length(long.before) * Math.exp(-10), 12);
    expect(Number.isFinite(long.after.x)).toBe(true);
    const none = underLimitStep(withHold(null), 1e-3);
    expect(none.after).toEqual(none.before);
});
it("slides on from the recovered offset when the load returns past F_max", () => {
    // Review focus 2: saturate, relax 20 steps, saturate again; F_max to 1e-9, stretch energy ≤ F_max²/(2k).
    for (const step of resaturation(withHold(HOLD))) {
        expect(Math.abs(length(step.top) - LIMIT) / LIMIT).toBeLessThan(1e-9);
        expect(step.energy).toBeLessThanOrEqual(((LIMIT * LIMIT) / (2 * K)) * (1 + 1e-9));
    }
});
```

`withHold(h)` is `running(LIMIT)` with `hands.flex.hold` set to `h`. The helpers drive `handLoad` as the file's
existing cases do (a head held, then moved to halve the stretch). Elsewhere (`tests/engine/shot.test.ts`;
`followSamples(setup)` runs `planStroke` then `simulateStroke` with a follow probe and returns its snapshots):

```ts
it("never lets a hand exceed F_max in the GC stop's canonical follow-through", () => {
    // §8.1.4: every follow probe sample's hand forces.
    for (const s of followSamples(canonicalSetup("stop-gc"))) {
        expect(length(s.top)).toBeLessThanOrEqual(GRIP_LIMIT * (1 + 1e-9));
        expect(length(s.bottom)).toBeLessThanOrEqual(GRIP_LIMIT * (1 + 1e-9));
    }
});
it("gives the default body an arm that returns a slid anchor in 27.8 ms", () => {
    const hold = defaultProfile.body.flex.hold as FlexHold;
    expect(hold.damping / hold.stiffness).toBeCloseTo(20.7 / 744, 15);
});
```

- [ ] **Step 4: Run to verify they fail**

Run: `npx vitest run tests/engine/impact/gripLimit.test.ts tests/engine/shot.test.ts`
Expected: FAIL on the relaxation cases (the offset unchanged).

- [ ] **Step 5: Implement the decay**

Plan decision 3 in `handLoad`'s `!contact` branch, after both hands' limit tests and before `return load(…)`, guarded
by `spring`, `!carry`, a non-null `hands.flex.hold`, the hand not saturated in this call and its offset non-null. The
header comment gains a sentence: under its limit in swing mode a slid anchor returns towards the hands' planned path
at the arm's rate τ_arm = c_hold/k_hold (P2b.2b.2c.2 design §4.1), the force reaching the head only through the grip.
`GripState`'s and `Hands.gripLimit`'s comments say the offset persists in carry mode and relaxes in swing mode.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/impact tests/engine/shot.test.ts`
Expected: PASS.

- [ ] **Step 7: The ratchet and the drift after (in the background)**

Rerun the four baselines into `<temp>/after/*-task4.txt` and compare with Task 1's.
Expected: `impactDigest`, `shotMix` and `impactProbe` identical. In `presetDigest` every changed line is an AC or GC
stop run; list them per preset in `<temp>/after/task4-moved.txt`. Any other changed line is a defect: trace it.

Run: `env SECTION=B npx --yes tsx scripts/croquetFitProbe.ts > <temp>/after/drift.txt`
Check: every run with a moved digest line has an offset set in `drift.txt`'s baseline, and the reverse; the drive's
and the AC stop's canonical ratios in `strokeProbe` unchanged (the hold starts after the impact). Add each moved run's
peak before and after to `task4-moved.txt`.

- [ ] **Step 8: Checks and commit**

Run the four checks. Commit the files above. Message: `Let the arm return a slid grip's anchor in swing mode`.

---
### Task 5: The sensitivity probe and its gate

Spec §5.2; exit criteria 5 and 8; plan decision 11.

**Files:**
- Modify: `scripts/croquetFitProbe.ts` (section C)
- Create: `docs/superpowers/probes/<date>-p2b2b2c2-sensitivity.txt`

**Interfaces:**
- Consumes: `ratiosAt`, `BOUNDS`, `TODAY`, `fitSetup`, `runFit` (Task 3); `effectiveMass`, `swungBody`
  (`track.ts`, as `tests/engine/shot.test.ts`'s effective-mass test reads them).
- Produces: section C; the user's ruling on the pair.

- [ ] **Step 1: Write section C**

1. Today's ratios at the targets' speeds, and their errors over each tolerance.
2. Per candidate, seven points evenly across its bounds (today's value added if not among them): both ratios, any
   flag, `follow-cap`, RangeError or re-entry guard hit; and for every point the drive's effective mass at the face
   centre along aim against the head's mass, marked where outside 10 % (spec §5.2). The ball–ball contact time moves
   the obstacles' with it.
3. Per candidate: the slopes at today's value (plan decision 11), each times its bound's width; "no effect" where both
   are under 0.01 per bound width.
4. Per pair of candidates (10 pairs): the angle between their slope vectors, the linear estimate's solution and
   whether it lies within both bounds, and whether it needs a value the effective-mass check marked.
5. A ranked list: reachable pairs first, by angle nearest 90°; the recommendation is the first with no marked value.
6. Only if no pair is reachable: the drive's and the AC stop's `gripTension` and `bottomGrip` (`profile.ts:270`,
   `:275`) swept the same way, each on its own preset only.

- [ ] **Step 2: Run it (in the background)**

Run: `env SECTION=C npx --yes tsx scripts/croquetFitProbe.ts > docs/superpowers/probes/<date>-p2b2b2c2-sensitivity.txt`
Expected: non-empty; no RangeError at today's values.

- [ ] **Step 3: Present the gate and stop**

Put to the user, one question at a time with options, pros, cons and a recommendation: the pair to fit (the ranked
list, its angles and reach, any effective-mass marks and any value on a prototype bound); then, only if needed, the
per-preset grips; then any bound to widen. **Wait for each ruling.** Record each verbatim in the spec's Amendments
(working tree; committed in Task 9).

- [ ] **Step 4: Checks and commit**

Run the four checks. Commit `scripts/croquetFitProbe.ts` and the sensitivity file.
Message: `Add the croquet fit's sensitivity probe and its figures`.

---
### Task 6: The fit

Spec §5.3, §8.2.3, §8.3, §8.4; exit criteria 6–8, 10, 11; plan decisions 6, 7.

**Files:**
- Create: `scripts/fitRatios.ts`
- Modify: `reference/contact.json`, `scripts/croquetFitProbe.ts` (section D), `tests/engine/ratioFit.test.ts`; if the
  gate ruled them in, `src/engine/swing/profile.ts` and `reference/swing.json`; if a default moved,
  `reference/swing.json` by `scripts/fitStrokeShape.ts`; every test the fit moves

**Interfaces:**
- Consumes: the gate's ruled pair (two `Candidate`s, or grips); `solvePair`, `ratiosAt`.
- Produces: the fitted values in `contact.json`; section D.

- [ ] **Step 1: Write the fit**

`scripts/fitRatios.ts`: reads the ruled pair from its arguments (`npx --yes tsx scripts/fitRatios.ts <candidate>
<candidate>`), solves with `solvePair` from today's values within `BOUNDS` (or a widened bound passed as
`<candidate>=lo:hi`), and prints `contact.json` to stdout with each fitted value set, provenance `derived`, its note
gaining "Fitted (P2b.2b.2c.2 design §5.3) with <other> to Gugan 5's drive 4.23 ± 0.2 and stop 7.15 ± 0.6 at <speeds>;
<converged | closest>." The ball–ball contact time, if fitted, keeps Gugan's cluster in its note, and
`ballObstacleContactTime`'s value follows it, its bounds kept. It prints to stderr each iteration's point and ratios,
and whether a fitted value lies on a bound.

- [ ] **Step 2: Run it**

Run: `npx --yes tsx scripts/fitRatios.ts <the ruled pair> > <temp>/after/contact-fit.json 2> <temp>/after/fit.txt`
Copy it over `reference/contact.json` and run `npx prettier --write reference/contact.json`.
Check with `python3 -I` that only the fitted entries (and `ballObstacleContactTime`'s value, if the contact time was
fitted) differ from `git show HEAD:reference/contact.json`.
If `fit.txt` says "closest", stop and show the user before going on (exit criterion 6).

- [ ] **Step 3: Write the read-back test**

In `tests/engine/ratioFit.test.ts`:

```ts
it("puts the drive and the AC stop within Gugan 5's tolerances", () => {
    const { drive, stop } = ratiosAt(TODAY);
    expect(Math.abs(drive - 4.23)).toBeLessThanOrEqual(0.2);
    expect(Math.abs(stop - 7.15)).toBeLessThanOrEqual(0.6);
});
```

`TODAY` now reads the fitted `contact.json`, so Task 3's parity test now checks the engine against the fit's own
evaluator on the fitted values (review focus 4's read-back). Run: `npx vitest run tests/engine/ratioFit.test.ts`.
Expected: PASS.

- [ ] **Step 4: The defaults and the effective mass**

Run: `npx vitest run tests/engine/shot.test.ts`
Check the effective-mass test (within 10 % of the head's mass) and each default's planned 3 m/s within 2 %. If a
default moved past 2 % (only `armMass` reaches the downswing), run `npx --yes tsx scripts/fitStrokeShape.ts >
<temp>/after/swing-fit.json 2> <temp>/after/fitshape.txt`, copy it over `reference/swing.json`, Prettier it, and
record why for the gate.

- [ ] **Step 5: Section D**

Section **D** of `croquetFitProbe.ts`: the fitted values against today's and their bounds (flagging any on a bound);
both ratios at 2, 2.5, 3, 3.5 and 4 m/s (`strokeFor`) with the CA bands beside them; the canonical default-backswing
runs' ratios (as `strokeProbe`); the drive's effective mass against the head's.

- [ ] **Step 6: Re-baseline**

Run: `npm test`
Every failing test: trace why its figure moved (a fitted parameter's path into it), then re-baseline it with the
comment "P2b.2b.2c.2: the croquet fit (was …)". A move the spec does not predict is listed for the gate before it is
re-baselined. Gugan's jab check: Global Constraints, "Kept as they are".

Run (the controller, in the background): `env SLOW_TESTS=1 npx vitest run tests/engine/impact/fuzz.test.ts`
Expected: every obstacle penetration under 0.06 R (spec §5.2). Only needed if the contact time was fitted.

- [ ] **Step 7: The ratchet (in the background)**

Rerun the four baselines, `strokeProbe` and `swingProbe` into `<temp>/after/*-task6.txt` and compare with Task 4's.
Count the moved `presetDigest` lines per preset into `<temp>/after/task6-moved.txt`, with the rolls' canonical ratios
before and after. `impactDigest` and the shot mix's phase 2: identical unless the fitted parameter enters them (the
ball–ball contact time enters every two-ball impact; the hands' parameters only a swing's); list which and why. Check
`swingProbe`'s late re-hit sweep: no run ends with the head overlapping a ball as handed over.

- [ ] **Step 8: Checks and commit**

Run the four checks. Commit the files above. Message: `Fit the shared contact and hand parameters to Gugan 5's
ratios`.

---
### Task 7: The held-out re-runs

Spec §7; exit criterion 9.

**Files:**
- Modify: `scripts/croquetFitProbe.ts` (sections E and F), `tests/engine/turfStrike.test.ts`

**Interfaces:**
- Consumes: the fitted model; `turfStrikeProbe.ts`'s `up` and dip grid (`grid`, `:248`).
- Produces: sections E and F; the jab's and the biting test's status.

- [ ] **Step 1: Sections E and F**

- **E. Gugan's jab:** the test's sweep (AC stop, 3 m/s, jabs 0–8 mm in 0.5 mm steps): per jab, whether it qualifies,
  the first and second face intervals' starts, the fraction of U, the striker's ball's departure fraction, and the
  verdict against [0.295, 0.463].
- **F. The control pair and the search:** the biting setup (single-ball, 4 m/s, `up` 0.01 m, dip −0.02 s, jab 5 mm,
  `backswingLimit` `MAX_BACK_ANGLE`) beside its control at `up` 0: each hand's peak force and its time, the
  saturation times, the head–turf intervals. Then jabs 1, 2, 3 and 4 mm over the regimes grid's `up` and dip: every
  run where a hand reaches F_max only within a head–turf interval and whose control at `up` 0 does not saturate.

- [ ] **Step 2: Run them (in the background)**

Run: `env SECTION=E npx --yes tsx scripts/croquetFitProbe.ts > <temp>/after/jab.txt`
Run: `env SECTION=F npx --yes tsx scripts/croquetFitProbe.ts > <temp>/after/control.txt`

- [ ] **Step 3: Act on them**

- The jab: run `env SLOW_TESTS=1 npx vitest run tests/engine/turfStrike.test.ts` (the controller). If `.fails` turns
  red (the check passes), remove `.fails` and rewrite its comment with E's fractions. Otherwise keep `.fails`, its
  comment re-measured from E (the fractions, the departure fraction) with the cause stated.
- The biting test: if F found a run, move the test onto the first one found (its `up`, dip and jab) and rewrite its
  comment from F's figures; add an assertion that the control at `up` 0 raises no `grip-limit` event. If none was
  found, leave the test as it is and add F's search to its comment as "searched, none found (P2b.2b.2c.2)".

- [ ] **Step 4: Checks and commit**

Run the four checks and the slow turf-strike file. Commit the two files. Message: `Re-run Gugan's jab and the
grip-limit control on the fitted model`.

---
### Task 8: The pre-flight gate

Spec §10, §11; exit criteria 3, 4, 13.

**Files:**
- Modify: `scripts/croquetFitProbe.ts` (sections G and H; `all` runs A–H in order)
- Create: `docs/superpowers/probes/<date>-p2b2b2c2-gate.txt`

- [ ] **Step 1: Sections G and H**

- **G. The rolls:** each roll's canonical ratio at 3 m/s before (Task 1's `strokeProbe`, passed as a path argument)
  and after; recorded for step 3, not judged.
- **H. The ball makes:** Task 2's findings as recorded in the README, quoted, and whether the makes differ.

- [ ] **Step 2: Run the gate (alone, in the background)**

Run: `npx --yes tsx scripts/croquetFitProbe.ts <temp>/baseline/strokeProbe.txt > docs/superpowers/probes/<date>-p2b2b2c2-gate.txt`
Add above section A the baseline distance check (`<temp>/baseline/distance.txt`), labelled as `main`'s model, and
above section B the drift before (`<temp>/baseline/drift.txt`).

- [ ] **Step 3: Present the gate and stop**

Put each section A–H to the user in turn, one question at a time with options, pros, cons and a recommendation: A's
verdict on the distances (stroke, lawn, or the CA's lawn unknown), which also sets the effort ceiling's row (spec
§11); B's drift before and after, against Riches' "NO FOLLOW-THROUGH"; C's ruling as recorded; D's values, ratios and
effective mass; E; F; G; H; and every test re-baselined unpredicted. **Wait for each ruling**, recorded verbatim in the
Amendments. A section ruled against is fixed and the gate re-run.

- [ ] **Step 4: Commit**

Run the four checks. Commit the probe and the gate file. Message: `Run the croquet fit's pre-flight gate`.

---
### Task 9: The probes, the figures and the documents

Spec §11; exit criterion 14.

**Files:**
- Create: `docs/superpowers/probes/<date>-p2b2b2c2-{strokeProbe,swingProbe,impactProbe}.txt`
- Modify: the roadmap; the spec's Amendments

- [ ] **Step 1: Run the probes (in the background)**

Run each into its `docs/superpowers/probes/<date>-p2b2b2c2-<name>.txt`: `scripts/strokeProbe.ts`,
`scripts/swingProbe.ts`, `scripts/impactProbe.ts`. Then, alone:
`env COUNT=800 npx --yes tsx scripts/shotMix.ts > <temp>/after/shotMix-cost.txt`.

- [ ] **Step 2: The roadmap**

- The P2 row (grep line 12 narrowly; edit with exact strings): P2b.2b.2c.2's spec and plan paths and its exit
  criteria's outcome.
- A new section "P2b.2b.2c.2 outcomes (<date>)": every figure of the gate's sections; the ratchet's counts (Tasks 4
  and 6); the canonical runs; the sweep's cap and flag tallies as P2b.2b.2c.1 recorded them; the late re-hit's
  crossings; the cost (`shotMix`'s engine time against Task 1's, and the gate's run).
- "Where swing and carry mode branch": swing mode's checking force.
- "Provisional numbers": the ±15 % stroke-ratio row replaced by Gugan 5's tolerances; the grip limit's row noting the
  checking force; a row per fitted parameter (its value, "derived from the fit to Gugan 5's ratios", confirmed next by
  P3's per-player fit); the effort ceiling's row with the distance check's ruled verdict.
- "Carried open items": the slid anchor's drift closed (or as ruled); the jab and the biting test as they stand.

- [ ] **Step 3: The spec's Amendments**

Fold in plan decisions 1–11, each in a sentence with its reason, beside the gates' rulings already recorded.

- [ ] **Step 4: Checks and commit**

Check the line lengths of every markdown file touched. Commit the probe files, the roadmap and the spec.
Message: `Record the croquet fit's probes and outcomes`.

---
### Task 10: The version and the exit criteria

Exit criteria 1–15.

**Files:**
- Modify: `src/engine/simulate.ts:77`, any test pinning the version string

- [ ] **Step 1: Bump the version**

`ENGINE_VERSION = "0.14.0"`. Run `grep -rn "0\.13\.0" src tests` and update any test that pins the engine version.

- [ ] **Step 2: Run everything**

Run: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`, one per call.
Run: `env SLOW_TESTS=1 npm test` (the controller, in the background).
Expected: all pass; Gugan's jab check as Task 7 left it.

- [ ] **Step 3: Walk the exit criteria**

For each of spec §1's fifteen criteria, name the test, ratchet file or gate line that shows it met, in the commit
message's body. Any criterion not met stops for the user.

- [ ] **Step 4: Commit**

Commit `src/engine/simulate.ts` and any version test. Message: `Bump the engine version to 0.14.0`.

Then use superpowers:finishing-a-development-branch (the final review, `/pre-review`, the PR).
