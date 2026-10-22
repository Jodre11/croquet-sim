# P2b.2b.2c.2c — The Face and Ball–Ball Contact Laws: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The face's T(U) and the ball–ball contact time are re-set from Gugan 4's Tables 2 and 1, converted from video
time to law time. The touching stops C3S and C20S are judged at gap 0, with a bounded search if they miss. A double tap
within the strike is reported, never flagged. The checks run and the two-stage gate rules on them; `ENGINE_VERSION`
becomes 0.16.0.

**Architecture:**

- `scripts/squeeze.ts`: the conversion harnesses.
  - `freeCollision` gains the law time, the force-on time and a camera threshold.
  - New: `freeFace` (a free head on a free ball), `faceScaleFor` and `ballBallTimeFor` (video time → law time), and
    `cameraIntervals` (spec §5.3's sampled camera).
- `scripts/filmedStrokes.ts`: Table 2's four columns, and §5.2's per-stroke uncertainty bands.
- `src/engine/faults.ts`: the parting of the balls, and the taps within the strike on `FaultReport` (spec §6). This is
  the engine's first change.
- `reference/contact.json`: the admitted laws' constants. This is the engine's second change, landed only after
  stage 1 of the gate. A candidate the gate admits (f or g) lands as its own engine change.
- `scripts/croquetFitProbe.ts`:
  - section I re-pointed at this step's laws and candidates;
  - section F gains the camera model and the four sources;
  - new sections N (the double taps over the grid), O (the hands' effect) and P (the camera threshold's reach).
- Order, as spec §8.2's ratchet:
  1. the baseline and the tidy;
  2. the double tap;
  3. the harnesses;
  4. the laws, measured in copies;
  5. the search, if needed;
  6. gate stage 1;
  7. the admitted laws landed;
  8. the measurements;
  9. the checks;
  10. gate stage 2;
  11. the default gap;
  12. the documents;
  13. the version.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), Vitest, ESLint, Prettier. No
new dependencies. `npx --yes tsx` runs the scripts.

**Spec:** `docs/superpowers/specs/2026-10-22-p2b2b2c2c-contact-laws-design.md`. Read all of it, especially
"Decisions", "My calls", §2, §4, §5.3, §6, §9 and "Amendments". It is this plan's only source of decisions; do not
re-open them. Also read:

- **The previous plan:** `docs/superpowers/plans/2026-10-21-p2b2b2c2b-squeeze.md`, for the conventions kept here (the
  preset digest, the throwaway copies with `CANDIDATE` and `TODAY_ROOT`, the gate, the documents).
- **Roadmap:** `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`, "P2b.2b.2c.2b outcomes (2026-10-22)"
  and its "Carried open items", and "Provisional numbers". Line 12 is one enormous table row: grep it narrowly, never
  print it whole.
- **Evidence:** `docs/superpowers/probes/2026-10-21-p2b2b2c2b-gate.txt` (sections E, F, I and "gate A's checks").

**Decisions made while planning.** Task 12 folds each into the spec's Amendments.

1. **The digest splits physics from faults.** The preset digest prints two SHA-256s per run: `phys`, the outcome
   with `faults` set to `undefined`, and `faults`, the fault report alone. Both keep the sign of zero. §8.2's "only
   the fault lists move" is then checkable line by line.
2. **The law time and the force-on time.**
   - `freeCollision` and `freeFace` return `lawTime` and `forceTime`, not `contactTime`:
     - `lawTime` is the steps in which the pair is listed among the step's contacts with `depth > 0`, times dt
       (spec "Vocabulary"; the timeline's δ-based interval).
     - `forceTime` is the steps with `normalForce > 0`, times dt.
   - The existing test and section I move to the new names.
3. **A threshold option.** `visible`, `videoIntervals`, `freeCollision` and `freeFace` take an optional `shift` (m),
   default `VISIBLE_SHIFT`. §7.9's 0.4 and 0.6 mm and the camera's three thresholds pass it. With the option absent,
   every call is today's to the bit.
4. **The face's conversion uses Hertz similarity.**
   - The engine reads T(U) from `contact.json` at load, so the harness cannot re-run the face at another t0. It does
     not need to: under the face's Hertz law a free head on a free ball scales exactly. Every length goes with
     L ∝ T and every time with T, so stretching T by s at a fixed U gives the same motion with lengths × s.
   - Hence videoTime(s·T; shift) = s · videoTime(T; shift/s).
   - `faceScaleFor(target, speed)` solves s·freeFace(speed, { shift: VISIBLE_SHIFT/s }).videoTime = target by
     bisection on s ∈ [0.3, 3]. The new t0 is s · T_today(3.26 m/s).
   - The argument is checked after landing: freeFace on the landed law at VISIBLE_SHIFT gives 0.75 ms (Task 7).
5. **The ball–ball conversion is direct.**
   - `ballBallTimeFor(target)` builds `lawFromContactTime(m_b/2, 0.72, T, 0)` and takes the T that minimises the
     largest |freeCollision(v).videoTime − target| over Table 1's three speeds.
   - It uses ternary search on T ∈ [0.5, 1.5] × target, 60 iterations, at dt 1e-7 s (spec §2.2).
   - The bounds [0.5, 0.87] ms convert by the same call.
6. **The touching stops' band** (spec §5.2). `SPEED_UNCERTAINTY = 0.03`. `touchingBand(value)` is
   value · 0.03 · √2: each judged figure is a ratio of two speeds, each 3 %, in quadrature. A figure passes when
   |model − row| ≤ its band. The probe prints the six bands.
7. **The copies.** §2's laws and every candidate run in throwaway copies under `<temp>/copies/<name>/`, never
   committed, as the last step's b and e did:
   - each copy holds `src`, `tests`, `scripts`, `reference` and `package.json`, with `node_modules` linked to the
     worktree's;
   - each is run from inside the copy with `TODAY_ROOT=<wt>`;
   - `CANDIDATE` takes `laws`, `face`, `ballball`, `f` or `g`.

   The three law copies:

   | Copy | Change |
   |---|---|
   | `laws` | Both re-sets |
   | `face` | The face's T(U) alone |
   | `ballball` | The ball–ball time and the obstacle's alone |

   The gate may admit either law alone (spec §4.3).
8. **The double tap's report.**
   - `FaultReport` gains `strike?: StrikeTaps`, present only for a croquet stroke and a continuation stroke touching
     another ball, so a single-ball run's report is byte-identical.
   - `interface StrikeTaps { readonly parted: number | null; readonly taps: readonly ContactInterval[]; readonly
     breaks: readonly number[] }`:
     - `parted` is the balls' parting (s), or null when no touching pair had an interval;
     - `taps` are the non-exempt face contacts beginning before `parted`, each with its `clearanceAfter`, and empty
       when `parted` is null;
     - `breaks` are the lengths (s) of the sub-frame breaks merged across, in time order.
   - `export const PARTING_BREAK = 1.25e-4` in `faults.ts`: one film frame, the finest record of balls parting
     (spec §6). A break shorter than it is not a parting; one of PARTING_BREAK or longer is.
9. **No parting, no change.** When `parted` is null (the balls never met in the impact), 29.1.6.1 is judged as today.
   Every re-contact is then possible-fault 29.1.6.1, the rule the Laws give without a parting to place it.
10. **The q fit offered to the gate** (spec §2.1).
    - Each column's Τh is converted to its own law time by `faceScaleFor` at that column's U.
    - log T = log t0 + q·log(min(U, 6)/3.26) is then fitted by least squares over all four columns. The clamp puts
      A4D at 6 m/s, as the engine plays it.
    - It is printed, and run as a candidate copy (`laws-q`) only if the held-out columns miss and the gate takes it.
11. **The hands' effect** (spec §7.6).
    - The free-head variant is a copy (`free-head-today` from `<temp>/main-tree`, `free-head` from the worktree after
      Task 7).
    - The edit: in `src/engine/impact/integrate.ts`, where a tracked drive's hand force and torque are summed into the
      head's, both are zero while t < 5e-3 s.
    - Section O loads `ratioFit` from each root named in `HANDS_ROOTS` (`label=path`, comma-separated) and prints
      C3S, C20S (gap 0) and C3D (1 mm). For each it gives the judged figures and the face intervals (law time).
12. **The probe's sections.**

    | Section | Content |
    |---|---|
    | A | The distance check, kept |
    | D | The sweep, with 0.04 mm added |
    | E | The filmed strokes, with §5.2's bands |
    | F | The timing, with the camera and the four sources |
    | G | The convergence |
    | I | The laws and the search |
    | J–M | The checks, kept |
    | N | The double taps over the digest grid |
    | O | The hands |
    | P | The camera threshold's reach |

    `all` runs A, D–G, I–P in that order; B, C and H run only by name.

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
  `atan2`, `ln`, `exp` and `pow`. Tests and scripts may use any `Math`.
- **Style.** No non-null assertions (`!`); `x as T` after indexing. Braces on every `if`. `0 - x`, not unary minus,
  in engine arithmetic. Exported functions carry a header comment. A constant that is not physical says "Numerical,
  not physical" and why. `import type` for type-only imports. Argument lists all on one line, or one per line when
  more than three or past 120 columns. Comments give reasons, not process labels ("plan decision N", "Task N").
- **Units.** SI. Figures printed in mm or ms say so.
- **Vocabulary.**
  - "Split", "ratio" and "cut" keep their croquet meanings only.
  - The gap, the squeeze, U, W, w₁ and v₂ are as the squeeze spec defines them. Law time, video time, tap and double
    tap are as this spec's "Vocabulary" defines them.
  - The pendulum/hands share is "phasing", the turf's drag "ploughing".
- **Engine version.** `ENGINE_VERSION` becomes `"0.16.0"` (Task 13).
- **The ratchet** (spec §8.2): the preset digest (`phys` and `faults`), `impactDigest`, `shotMix` and `impactProbe`.
  - After Task 1: bit-identical.
  - After Task 2: every `phys` hash, `impactDigest`, `shotMix` and `impactProbe` bit-identical; only `faults` hashes
    move, each listed.
  - After Task 7: every run with a face or ball–ball contact may move. The moved runs are counted per preset; every
    unmoved run must be one with neither contact.
  - After Task 11: only croquet runs move, counted per preset.
  - Code with an input absent keeps today's arithmetic: branch on it rather than add a zero term (`x + 0` turns −0
    into +0).
- **The ratchet's runs** run in the background and must finish, and match, before that task's commit.
  - `pgrep -fl tsx` must print no digest or probe process before a commit.
  - Each output file must be non-empty.
  - Compare `shotMix` and `impactProbe` with their timing lines dropped: `grep -v "ms per shot" <file> > <file>.cmp`
    and `grep -v "µs/step" <file> > <file>.cmp`.
- **Slow tests** run only when `SLOW_TESTS` is set, by the controller, never while an implementer is editing. A test
  over about 5 s locally gets an explicit timeout of at least 4× its local time.
- **Subagents** are dispatched in the foreground with a 600 s timeout and named.
  - The controller runs the long probes, the digests, the copies and `SLOW_TESTS` itself.
  - Implementers stop before committing until the controller reports the ratchet matches.
  - Subagents deliver their result by `SendMessage` to the controller.
- **RED steps.** Vitest does not type-check: a test using a missing export fails at runtime, and `npm run check` shows
  the type errors.
- **Behaviour figures.**
  - A test resting on model behaviour carries its reasoning in a comment.
  - Where a test fails, trace the mechanism before changing an expectation.
  - A re-baselined figure gets the comment "P2b.2b.2c.2c: <the change> (was <old>)", and its commit message gives
    old and new.
  - No test is loosened to pass. A changed expectation the spec does not predict goes to the gate and into the
    Amendments.
- **Circularity.** Constants come only from Tables 1 and 2, or a written argument. Never match one to C3S, C20S or any
  stroke it is judged on. `VISIBLE_SHIFT` and the bands are never changed to make a figure pass (spec §12).
- **Kept as they are.**
  - e(U), the face's speed clamp [0.5, 6] m/s, the ball–ball e 0.72 and phase 2's impulsive law.
  - The default mallet, the lawn's pace, the hands, and the fitter (dormant).
  - Gugan's jab check stays `it.runIf(SLOW).fails` unless it now passes, and the weak stroke stays `it.todo`.
  - Nothing is scripted per stroke type.
- **Process.**
  - Follow the plan's steps; no side probes: figures come from the steps that produce them.
  - The gates (Tasks 6 and 10) **stop for the user**, whatever they show.
  - Put each question to the user one at a time, with options, pros, cons and a recommendation, and record each ruling
    verbatim in the spec's Amendments.
- **Bash.**
  - One command per call: no `&&`, `||`, `;`, `$(…)` or subshells.
  - Redirecting a script's output with `>` or `2>` is allowed.
  - No `bash -c` or `node -e`; use `python3 -I` for JSON checks.
  - Oxford Croquet pages need `curl -sSLk --compressed`.
  - Never `git -C` into another worktree; run git in a copy or the baseline worktree only through `npm --prefix` or
    `npx tsx <path>`.
- **The temp directory.**
  - `<temp>` is the executing session's literal `CLAUDE_TEMP_DIR`, written out in full; a subagent is given it in its
    prompt.
  - Throwaway scripts go in `<temp>/scripts/`, outputs in `<temp>/baseline/` and `<temp>/after/`, sources in
    `<temp>/sources/`, copies in `<temp>/copies/`.
  - `<date>` is the day the step runs, YYYY-MM-DD. `<wt>` is this worktree's absolute path.
- **Sources.** Cite, don't mirror: the URL, the date, the SHA-256 of the fetched file and short annotated quotes in
  `reference/sources/README.md`; commit no fetched file.
- **Commits.**
  - Use a short imperative sentence (repo style), signed.
  - Write the message to a fresh `<temp>/msg-task<N>.txt` and commit with `git commit -F <that path>`.
  - Check with `git log -1 "--format=%G? %h"`; expect `G`. If signing refuses, leave the change staged and report
    it.
  - Stage by explicit path. Never `--no-verify`, `-c commit.gpgsign=false` or bare `git stash`.
- **Checks after every task:** `npm test`, `npm run lint`, `npm run check` and `npm run format:check`, one per call,
  all pass. The baseline is 1249 passed, 1 expected fail, 10 skipped, 1 todo.
- **Known noise.** The editor's LSP may report stale "Cannot find module" diagnostics; `npm run check` is the source
  of truth.
- **Worktree.** All work happens in `/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2c2c-contact-laws`, on
  branch `worktree-p2b2b2c2c-contact-laws`, rebased on `main` at d854668 (PR #34). The spec and this plan are its
  first commits. The branch stays local until the PR.

## Review Focus

The spec implies each input below, but none of its listed tests exercises it. The owning task pins each with a test.

1. **A croquet stroke whose balls never meet.** With no ball–ball interval (the croqueted ball never pressed),
   `strike.parted` is null, `taps` is empty and a second face contact is possible-fault 29.1.6.1 as today; nothing
   throws. Pinned in Task 2 ("judges as today when the balls never meet").
2. **A break exactly one frame long.**
   - A ball–ball break of exactly `PARTING_BREAK` is a parting, and one of `PARTING_BREAK − 1e-9` is not.
   - A re-contact beginning exactly at the parting is flagged ("at or after").
   - Pinned in Task 2 ("places the parting at a break of one frame, not just under", "flags a re-contact beginning
     at the parting").
3. **A continuation stroke touching an obstacle as well as a ball.** Only ball pairs in `touchingAtStart` place the
   parting; an obstacle pair never does. Pinned in Task 2 ("ignores a touching obstacle when placing the parting").
4. **A face speed outside the fits' range.**
   - `freeFace` at A1D's 0.76 m/s and A4D's 8.54 m/s runs and reports `clamped: true` for A4D only.
   - `faceScaleFor` throws a `RangeError` naming the target and the bracket's two video times when the bracket does
     not straddle it, never returning an end.
   - Pinned in Task 3 ("reports the clamp", "throws when the target lies outside the bracket").
5. **A ball–ball interval still open when the impact ends.** `closeTimeline` ends it at the duration. The parting is
   then the duration, every re-contact precedes it and none is flagged; `parted` is finite. Pinned in Task 2 ("parts
   at the impact's end when the balls never separate").

---
## File Structure

| Path | Change |
|---|---|
| `scripts/ratioFit.ts`, `scripts/croquetFitProbe.ts`, `tests/engine/ratioFit.test.ts`, `tests/engine/squeezeConvergence.test.ts` | The tidy (Task 1) |
| `reference/sources/README.md` | The new sources (Task 1) |
| `src/engine/faults.ts`, `src/engine/index.ts`, `tests/engine/faults.test.ts`, `reference/laws.json` | The double tap (Task 2) |
| `scripts/squeeze.ts`, `scripts/filmedStrokes.ts`, `tests/engine/squeeze.test.ts`, `tests/engine/filmedStrokes.test.ts` | The harnesses, Table 2, the bands (Task 3) |
| `scripts/croquetFitProbe.ts` | Section I (Task 4), N–P and F's camera (Tasks 8, 9) |
| `docs/superpowers/probes/<date>-p2b2b2c2c-laws.txt` | Stage 1's evidence (Tasks 4, 5) |
| `reference/contact.json`, `tests/reference/reference.test.ts`, `tests/engine/impact/*.test.ts` | The admitted laws (Task 7) |
| `src/engine/impact/contactLaw.ts` (and its tests) | An admitted candidate f or g only (Task 7) |
| `tests/engine/support/shot.ts`, the pinned tests | The default gap, if ruled (Task 11) |
| `docs/superpowers/probes/<date>-p2b2b2c2c-*.txt`, the roadmap, the spec | The gate, the figures, the rulings (Tasks 10, 12) |
| `src/engine/simulate.ts:77` | `ENGINE_VERSION` 0.16.0 (Task 13) |

---
### Task 1: The baseline and the tidy

Spec §10, §8.2 (after the tidy: bit-identical); plan decision 1.

**Files:**
- Modify: `scripts/ratioFit.ts`, `scripts/croquetFitProbe.ts`, `tests/engine/ratioFit.test.ts`,
  `tests/engine/squeezeConvergence.test.ts`, `reference/sources/README.md`
- Temp, never committed: `<temp>/main-tree/`, `<temp>/scripts/presetDigest.mts`, `<temp>/baseline/*`,
  `<temp>/sources/*`

**Interfaces:**
- Produces:
  - `<temp>/baseline/<name>.txt` for `presetDigest`, `impactDigest`, `shotMix`, `impactProbe`, `strokeProbe` and
    `swingProbe`, plus `<temp>/baseline/shotMix-cost.txt`;
  - the baseline worktree `<temp>/main-tree` at d854668;
  - `presetDigest.mts`, which later tasks run unchanged with `ROOT` set.
- In `scripts/ratioFit.ts`:
  - `export function leanOf(setup: ShotSetup, world: World): number`;
  - `export const GAPPED_STROKES: readonly string[]` (the eight with gap > 0) and `ALL_STROKES` (the ten);
  - `meansOf(runs, names: readonly string[])`, which averages over exactly `names` and throws a `RangeError` naming
    any that is absent or `open`;
  - `readTimeOf` sets `open` when a counted face *or* ball–ball interval has not ended by the window's end;
  - `gugansMallet` caches by (world, type, speed) in one `WeakMap`.
- `croquetFitProbe.ts` uses one world, `STRIKE_WORLD`, wherever it called `defaultWorld()` or `fitWorld(TODAY)` for
  a strike.

- [ ] **Step 1: The baseline worktree**

Run: `mkdir -p <temp>/scripts <temp>/baseline <temp>/after <temp>/sources <temp>/copies`
Run: `git worktree add --detach <temp>/main-tree main`
Run: `npm --prefix <temp>/main-tree ci`
Expected: both succeed; `git rev-parse main` prints d854668….

- [ ] **Step 2: The preset digest**

Create `<temp>/scripts/presetDigest.mts` from the 2026-10-21 plan's Task 1 Step 3, with three changes:
- its header names this plan;
- every import resolves from `process.env.ROOT`;
- each line prints `phys <sha>` (the outcome with `faults: undefined`) and `faults <sha>` (plan decision 1), both
  through the same sign-of-zero replacer.

- [ ] **Step 3: Capture the baseline (in the background)**

Run each with `run_in_background: true`:

Run: `env ROOT=<temp>/main-tree npx --yes tsx <temp>/scripts/presetDigest.mts > <temp>/baseline/presetDigest.txt`
Run: `npx --yes tsx <temp>/main-tree/scripts/impactDigest.ts > <temp>/baseline/impactDigest.txt`
Run: `npx --yes tsx <temp>/main-tree/scripts/shotMix.ts > <temp>/baseline/shotMix.txt`
Run: `npx --yes tsx <temp>/main-tree/scripts/impactProbe.ts > <temp>/baseline/impactProbe.txt`
Run: `npx --yes tsx <temp>/main-tree/scripts/strokeProbe.ts > <temp>/baseline/strokeProbe.txt`
Run: `npx --yes tsx <temp>/main-tree/scripts/swingProbe.ts > <temp>/baseline/swingProbe.txt`

When all have finished and `pgrep -fl tsx` prints none, take the cost baseline alone:
Run: `env COUNT=800 npx --yes tsx <temp>/main-tree/scripts/shotMix.ts > <temp>/baseline/shotMix-cost.txt`

- [ ] **Step 4: Write the failing tests**

In `tests/engine/ratioFit.test.ts`:

```ts
describe("the read-out's tidy (P2b.2b.2c.2c design §10)", () => {
    const I = (start: number, end: number) => ({ start, end });
    it("flags a strike whose ball–ball contact is still open at the window's end", () => {
        expect(readTimeOf([I(0, 8e-4)], [I(5e-4, 16e-3)]).open).toBe(true);
    });
    it("averages over exactly the named strokes, and throws for one not counted", () => {
        const runs = [run("C1D", 1.1, false), run("C3D", 1.2, false), run("C3S", 9, true)];
        expect(meansOf(runs, ["C1D", "C3D"]).v2U).toBeCloseTo(1.15, 12);
        expect(() => meansOf(runs, ["C1D", "C3S"])).toThrow(/C3S/);
        expect(() => meansOf(runs, ["C1D", "B4GS"])).toThrow(/B4GS/);
    });
    it("holds the eight gapped strokes and all ten by name", () => {
        expect(GAPPED_STROKES).toEqual(FILMED_STROKES.filter((s) => s.gap > 0).map((s) => s.name));
        expect(ALL_STROKES).toEqual(FILMED_STROKES.map((s) => s.name));
    });
});
```

`run(name, v2U, open)` is a local helper that builds a `filmedStrokeRuns` element with only the fields `meansOf`
reads. The test file's own `leanOf` is removed and the exported one imported.

- [ ] **Step 5: Run to verify they fail**

Run: `npx vitest run tests/engine/ratioFit.test.ts`
Expected: FAIL (the new exports are undefined; `open` is false; `meansOf` ignores its second argument).

- [ ] **Step 6: The tidy**

- Do the Interfaces block's changes. `squeezeConvergence.test.ts` and every `meansOf` caller pass `GAPPED_STROKES`
  or `ALL_STROKES` explicitly. `strokeProbe.ts`'s `leanOf` stays (spec §10).
- Fetch the sources into `<temp>/sources/<name>/`, each twice with `curl -sSLk --compressed`, hashed with
  `shasum -a 256`; record a digest only if both fetches agree:
  - Cross 2017 (https://oxfordcroquet.org/tech/cross1/);
  - Hall 1994 (https://oxfordcroquet.org/tech/hall/);
  - Plummer 2000 (https://oxfordcroquet.org/tech/multiple/);
  - the CA's "Croquet Dynamics" (https://oxfordcroquet.org/tech/video/);
  - the WCF Laws PDF (spec §6's URL);
  - Sutherland 1995, at the URL the research used (grep the spec and the 2026-10-21 probes; if none is recorded,
    find it on oxfordcroquet.org/tech/ and record how).
- Add a section `## P2b.2b.2c.2c: the contact laws (design §2, §4, §5.3, §6)` to `reference/sources/README.md`:
  - each fetched source's URL, date, SHA-256 and short annotated quotes (those the spec quotes);
  - the physics papers of §2.3 and §4.2 by full citation and DOI, with the spec's quotes, marked "not fetched;
    quoted from the 2026-10-22 research" where no page was hashed.

- [ ] **Step 7: Run the tests, the checks and the ratchet (in the background)**

Run: `npx vitest run tests/engine/ratioFit.test.ts` — expected PASS. Run the four checks.

Rerun Step 3's first four lines from the worktree into `<temp>/after/*-task1.txt`, with `ROOT=<wt>` and the
worktree's own `scripts/…`. Compare each with `cmp`, using the `.cmp` files for `shotMix` and `impactProbe`.
Expected: all identical.

- [ ] **Step 8: Commit**

Stage the five files. Message: `Tidy the strike's read-out and cite the contact laws' sources`.

---
### Task 2: The double tap, reported and not flagged

Spec §6, §8.1 (the double tap), §8.2 (only the fault lists move); exit criterion 5; plan decisions 8, 9.

**Files:**
- Modify: `src/engine/faults.ts:86-89` (the report), `:345-349` (29.1.6.1); `src/engine/index.ts:4`;
  `reference/laws.json` (29.1.6.1's note)
- Test: `tests/engine/faults.test.ts`

**Interfaces:**
- Produces, from `src/engine/faults.ts` (and re-exported from `index.ts`):
  - `PARTING_BREAK`;
  - `interface StrikeTaps` (plan decision 8);
  - `FaultReport.strike?: StrikeTaps`.
- 29.1.6.1's evidence gains `afterParting` (the count of non-exempt contacts after the first that begin at or after
  the parting).

- [ ] **Step 1: Write the failing tests**

In `tests/engine/faults.test.ts`, a `describe("judgeFaults: the double tap within the strike (P2b.2b.2c.2c design
§6)")`. Build the timelines with the file's `iv` and `impact` helpers. `croquet` is the file's croquet context with
blue striking and red croqueted.

```ts
it("reports a re-contact before the balls part, and does not flag it", () => {
    const report = judgeFaults(croquet, impact({ face: [iv(0, 6e-4, 100, 3e-5), iv(9e-4, 1.6e-3)],
        pair: [iv(1e-4, 1.4e-3)] }));
    expect(laws(report)).not.toContain("29.1.6.1 possible-fault");
    expect(report.strike?.parted).toBe(1.4e-3);
    expect(report.strike?.taps.map((t) => [t.start, t.clearanceAfter])).toEqual([[0, 3e-5], [9e-4, undefined]]);
});
it("flags a re-contact after the balls part, as today, at its start", () => {
    const report = judgeFaults(croquet, impact({ face: [iv(0, 6e-4), iv(2e-3, 2.5e-3)], pair: [iv(1e-4, 1.4e-3)] }));
    const f = report.findings.find((x) => x.law === "29.1.6.1");
    expect(f?.t).toBe(2e-3);
    expect(f?.evidence.afterParting).toBe(1);
    expect(f?.evidence.contacts).toBe(2);
});
it("flags a re-contact beginning at the parting", () => {
    // Review focus 2: "at or after".
    const report = judgeFaults(croquet, impact({ face: [iv(0, 6e-4), iv(1.4e-3, 2e-3)], pair: [iv(1e-4, 1.4e-3)] }));
    expect(laws(report)).toContain("29.1.6.1 possible-fault");
});
it("places the parting at a break of one frame, not just under", () => {
    // Review focus 2. A break shorter than PARTING_BREAK is no parting; the intervals either side are one.
    const under = [iv(1e-4, 5e-4), iv(5e-4 + PARTING_BREAK - 1e-9, 1.4e-3)];
    const at = [iv(1e-4, 5e-4), iv(5e-4 + PARTING_BREAK, 1.4e-3)];
    const face = [iv(0, 4e-4), iv(8e-4, 1.2e-3)];
    const merged = judgeFaults(croquet, impact({ face, pair: under }));
    expect(merged.strike?.parted).toBe(1.4e-3);
    expect(merged.strike?.breaks).toEqual([PARTING_BREAK - 1e-9]);
    expect(laws(merged)).not.toContain("29.1.6.1 possible-fault");
    expect(laws(judgeFaults(croquet, impact({ face, pair: at })))).toContain("29.1.6.1 possible-fault");
});
it("judges as today when the balls never meet", () => {
    // Review focus 1.
    const report = judgeFaults(croquet, impact({ face: [iv(0, 6e-4), iv(9e-4, 1.6e-3)], pair: [] }));
    expect(report.strike).toEqual({ parted: null, taps: [], breaks: [] });
    expect(laws(report)).toContain("29.1.6.1 possible-fault");
});
it("parts at the impact's end when the balls never separate", () => {
    // Review focus 5: closeTimeline ends the open interval at the duration.
    const report = judgeFaults(croquet, impact({ face: [iv(0, 6e-4), iv(9e-4, 1.6e-3)], pair: [iv(1e-4, 3e-3)],
        duration: 3e-3 }));
    expect(report.strike?.parted).toBe(3e-3);
    expect(laws(report)).not.toContain("29.1.6.1 possible-fault");
});
it("parts a continuation stroke at the later first interval of the balls it touched", () => {
    // Blue touches red and black at the start; red parts at 1.0 ms, black at 1.5 ms.
    const report = judgeFaults(continuation, threeBalls({ red: [iv(0, 1e-3)], black: [iv(0, 1.5e-3)],
        face: [iv(0, 4e-4), iv(1.2e-3, 1.4e-3)] }));
    expect(report.strike?.parted).toBe(1.5e-3);
    expect(laws(report)).not.toContain("29.1.6.1 possible-fault");
});
it("ignores a touching obstacle when placing the parting", () => {
    // Review focus 3: an upright touching at the start, its interval to 5 ms, does not delay the parting.
    const report = judgeFaults(continuation, threeBalls({ red: [iv(0, 1e-3)], black: [iv(0, 1.5e-3)],
        hoop: [iv(0, 5e-3)], face: [iv(0, 4e-4), iv(2e-3, 2.4e-3)] }));
    expect(report.strike?.parted).toBe(1.5e-3);
    expect(laws(report)).toContain("29.1.6.1 possible-fault");
});
it("filters an exempt contact before the rule applies, and leaves the single-ball stroke's report as it was", () => {
    // Blue, touching red, roquets live black at 0.3 ms; its face contact at 0.5 ms is then exempt (29.2.4.1) and is
    // neither a tap nor flagged, though red parts at 1.0 ms.
    const roquet = judgeFaults({ ...continuation, live: ["black"] }, threeBalls({ red: [iv(0, 1e-3)],
        black: [iv(3e-4, 9e-4)], blackTouching: false, face: [iv(0, 2e-4), iv(5e-4, 7e-4)] }));
    expect(roquet.strike?.taps.map((t) => t.start)).toEqual([0]);
    expect(laws(roquet)).not.toContain("29.1.6.1 possible-fault");
    const single = judgeFaults(singleBall, impact({ face: [iv(0, 6e-4), iv(9e-4, 1.6e-3)], pair: [] }));
    expect(single.strike).toBeUndefined();
    expect(laws(single)).toContain("29.1.6.2 fault");
});
```

- `continuation` is a `continuation-touching` context with blue striking.
- `threeBalls` extends `impact` with blue–black and blue–hoop pairs and their `touchingAtStart`. Black touches at the
  start unless `blackTouching: false`. Use the file's obstacle key helper.
- If `impact` lacks a `duration` override, add one.
- The existing 29.1.6.1 cases keep passing unchanged; any that now reports instead of flagging is a defect to trace.
- Wrap lines past 120 columns, and run Prettier.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/engine/faults.test.ts`
Expected: FAIL (`PARTING_BREAK` and `strike` are undefined, and the re-contact before the parting is flagged).

- [ ] **Step 3: Implement**

- `partingOf(context, impact): { parted: number | null; breaks: number[] }`, unexported.
  - The pairs are the croqueted pair for a croquet stroke. For a continuation stroke they are each
    `ballPairKey(striker, id)` in `touchingAtStart`.
  - Each pair's first interval is merged forward across every following break shorter than `PARTING_BREAK`; each
    merged break's length is recorded.
  - `parted` is the latest of the pairs' merged first ends, or null when no pair has an interval.
- `judgeFaults`'s 29.1.6.1 block becomes:
  - for `kind !== "single-ball"`, build `strike`;
  - with `parted` null, keep today's rule;
  - otherwise flag only when a non-exempt contact after the first begins at or after `parted`, at that contact's
    start, with `contactEvidence(...)` plus `afterParting`.
- The report spreads `strike` only when it is built.
- The file header gains a paragraph on the double tap, citing 29.2.5, C29.11.1–3 and C28.3.2 and the follow-through
  step for re-contacts after the parting.
- `PARTING_BREAK`'s comment says it is the film's frame, the finest record of balls parting, and that a shorter break
  is a step-scale artefact no eye could see.
- In `reference/laws.json`, add C29.11.1, C29.11.3 and C28.3.2 to 29.1.6.1's note, as spec §6 quotes them. 29.2.5 and
  C29.11.2 are already quoted.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/faults.test.ts tests/reference`
Expected: PASS.

- [ ] **Step 5: Checks and the ratchet (in the background)**

Run the four checks. Rerun the ratchet's four lines into `<temp>/after/*-task2.txt`.

Expected:
- every `phys` hash, `impactDigest`, `shotMix` (`.cmp`) and `impactProbe` (`.cmp`) identical to Task 1's;
- the moved `faults` hashes are all croquet or continuation runs.

List each moved run in `<temp>/after/task2-moved.txt`, per preset, marking those whose findings changed (a 29.1.6.1
gone) beside those that only gained `strike`.

- [ ] **Step 6: Commit**

Stage the four files. Message: `Report a double tap within the strike instead of flagging it`.

---
### Task 3: The harnesses, Table 2 and the bands

Spec §2.1, §2.2, §5.2, §5.3 (the camera), §7.9 (the threshold); plan decisions 2–6.

**Files:**
- Modify: `scripts/squeeze.ts`, `scripts/filmedStrokes.ts`, `tests/engine/squeeze.test.ts`,
  `tests/engine/filmedStrokes.test.ts`, `scripts/croquetFitProbe.ts` (the renamed fields only)

**Interfaces:**
- In `scripts/filmedStrokes.ts`:
  - `TABLE2_FACE: readonly { readonly name: "A1D" | "A2D" | "A3D" | "A4D"; readonly speed: number; readonly
    contactTime: number; readonly ballAfter: number; readonly malletAfter: number }[]`. These are Table 2's rows 7
    and 4, and the rows giving the ball's and the mallet's speeds after; each row number is cited.
    `SINGLE_BALL_FACE` becomes the A2D entry's `{ speed, contactTime }`.
  - `SPEED_UNCERTAINTY = 0.03` and `touchingBand(value: number): number` (plan decision 6).
  - `TABLE2_CAVEAT`, the spec's quoted caveat, as a string for the probe.
- In `scripts/squeeze.ts`:
  - `visible(distance, shift = VISIBLE_SHIFT)` and `videoIntervals(samples, shift = VISIBLE_SHIFT)`.
  - `interface Timed { readonly restitution: number; readonly lawTime: number; readonly forceTime: number;
    readonly videoTime: number }`.
  - `freeCollision(speed, law, o?: { dt?; shift? }): Timed`.
  - `freeFace(speed: number, o?: { readonly dt?: number; readonly shift?: number }): Timed & { readonly clamped:
    boolean }`. This is the default mallet's head (`planStroke(canonicalSetup("single-ball")).contact.head`) moving
    free (`freeTracked`) at `speed` onto a free default ball touching its face. The restitution is (ball − head
    speed after) / speed. The video time runs from the ball's displacement first exceeding `shift` to the face–ball
    separation (`faceClearance`) first exceeding it. `clamped` is set when speed lies outside [FACE_SPEED_MIN,
    FACE_SPEED_MAX].
  - `faceScaleFor(target: number, speed: number, o?: { readonly dt?: number; readonly shift?: number }): number`
    (plan decision 4).
  - `ballBallTimeFor(target: number, o?: { readonly dt?: number; readonly shift?: number }): { readonly time: number;
    readonly misses: readonly number[] }` (plan decision 5), where the misses are signed (video − target) at
    `FREE_COLLISIONS`' speeds.
  - `cameraIntervals(samples, o?: { readonly shift?: number; readonly phases?: number }): readonly (readonly
    VideoInterval[])[]`. For each phase k of `phases` (default 16) the samples are taken at the frame times
    (n + k/phases)·VIDEO_FRAME, using the first sample at or after each, and run through `videoIntervals`. Times
    are in s; the probe prints them in frames.

- [ ] **Step 1: Write the failing tests**

In `tests/engine/squeeze.test.ts`, with `contactTime` renamed to `forceTime` in the existing cases:

```ts
describe("the conversion harnesses (P2b.2b.2c.2c design §2, §5.3)", () => {
    const today = lawFromContactTime(WORLD.ball.mass / 2, 0.72, WORLD.ballBallContactTime, 0);
    it("times today's law at its law time, the force a little shorter", () => {
        const r = freeCollision(1.9, today, { dt: 1e-7 });
        expect(Math.abs(r.lawTime - WORLD.ballBallContactTime)).toBeLessThanOrEqual(2e-7);
        expect(r.forceTime).toBeLessThanOrEqual(r.lawTime);
    });
    it("is today's to the bit with no shift given, and shorter on video with a larger one", () => {
        expect(freeCollision(1.9, today, { dt: 1e-7 })).toEqual(freeCollision(1.9, today, { dt: 1e-7, shift: 2e-4 }));
        expect(freeCollision(1.9, today, { dt: 1e-7, shift: 4e-4 }).videoTime).toBeLessThan(
            freeCollision(1.9, today, { dt: 1e-7 }).videoTime,
        );
    });
    it("plays the face law alone to its own T(U) and e(U)", () => {
        // A free head on a free ball is the law's central collision, whose time and restitution are T(U) and e(U)
        // (contactLaw.test.ts's free case), to the step and the clamp's restitution check.
        const r = freeFace(3.26, { dt: 1e-8 });
        expect(Math.abs(r.lawTime - faceContactTimeAt(3.26)) / faceContactTimeAt(3.26)).toBeLessThan(1e-3);
        expect(r.clamped).toBe(false);
    });
    it("reports the clamp", () => {
        // Review focus 4.
        expect(freeFace(0.76, { dt: 1e-8 }).clamped).toBe(false);
        expect(freeFace(8.54, { dt: 1e-8 }).clamped).toBe(true);
    });
    it("finds the face's scale by Hertz similarity: scale 1 reproduces today's video time", () => {
        const today = freeFace(3.26, { dt: 1e-8 }).videoTime;
        expect(Math.abs(faceScaleFor(today, 3.26, { dt: 1e-8 }) - 1)).toBeLessThan(1e-3);
    });
    it("throws when the target lies outside the bracket", () => {
        // Review focus 4.
        expect(() => faceScaleFor(1e-6, 3.26)).toThrow(/outside/);
    });
    it("finds a ball–ball time whose video time is within a frame of 0.75 ms at all three speeds", () => {
        const { time, misses } = ballBallTimeFor(7.5e-4);
        expect(misses.every((m) => Math.abs(m) <= VIDEO_FRAME)).toBe(true);
        // Gate A's trace put it near 0.93 ms; the bracket is wide, so this only guards a gross error.
        expect(time).toBeGreaterThan(7.5e-4);
        expect(time).toBeLessThan(1.2e-3);
    });
    it("samples the camera at 16 phases, a release unseen when the gap never shows on a frame", () => {
        const blink = [0, 1, 2, 3].map((i) => ({ t: i * 2e-5, separation: i === 2 ? 3e-4 : 0 }));
        expect(cameraIntervals(blink).length).toBe(16);
        expect(cameraIntervals(blink).every((p) => p.length === 1)).toBe(true);
    });
});
```

In `tests/engine/filmedStrokes.test.ts`:

```ts
it("holds Table 2's four columns, A2D as the anchor", () => {
    expect(TABLE2_FACE.map((c) => [c.name, c.speed, c.contactTime])).toEqual([
        ["A1D", 0.76, 1e-3],
        ["A2D", 3.26, 7.5e-4],
        ["A3D", 5.7, 6e-4],
        ["A4D", 8.54, 6e-4],
    ]);
    expect(SINGLE_BALL_FACE).toEqual({ speed: 3.26, contactTime: 7.5e-4 });
});
it("gives each ratio a band of 3 % per speed in quadrature", () => {
    expect(touchingBand(1.15)).toBeCloseTo(1.15 * 0.03 * Math.SQRT2, 15);
});
```

Write the `blink` samples so that the 0.3 mm separation falls between every phase's frame times. If the chosen times
let one phase see it, adjust the times, not the assertion.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/engine/squeeze.test.ts tests/engine/filmedStrokes.test.ts`
Expected: FAIL (the new exports are undefined, and `lawTime` is absent).

- [ ] **Step 3: Implement** per the Interfaces block and plan decisions 2–5.

- Fetch Gugan 4's Table 2 again (`<temp>/sources/gugan4/`) for the speed rows.
- The README's Table 2 line gains the four columns, their row numbers and the caveat.
- `squeeze.ts`'s header gains a paragraph on the law and force times, the threshold option, the face's similarity
  argument (plan decision 4, with the scaling written out), and the camera.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/squeeze.test.ts tests/engine/filmedStrokes.test.ts`
Expected: PASS. If the 0.75 ms target cannot be met within a frame at all three speeds, `ballBallTimeFor` still
returns its best. Record the misses: it is a finding for the gate (criterion 2), not a reason to change the
assertion's frame. Mark that one test `it.fails` with the figures in its comment.

- [ ] **Step 5: Checks, the ratchet and commit**

Run the four checks. Rerun the ratchet into `<temp>/after/*-task3.txt`; expect it identical to Task 2's. Commit the
five files plus README. Message: `Convert the video's contact times to the laws' with Hertz similarity`.

---
### Task 4: The laws, measured in copies

Spec §2, §4.1, §5, §5.3; gate stage 1's sections A and B; exit criteria 1–4; plan decisions 6, 7, 10.

**Files:**
- Modify: `scripts/croquetFitProbe.ts` (section I)
- Create: `docs/superpowers/probes/<date>-p2b2b2c2c-laws.txt`
- Temp: `<temp>/copies/{laws,face,ballball}/`, `<temp>/after/constants.txt`

**Interfaces:**
- Consumes: Task 3's harnesses, `TABLE2_FACE` and `touchingBand`.
- Produces:
  - in `croquetFitProbe.ts`: `CANDIDATE` accepting `laws`, `face`, `ballball`, `laws-q`, `f` or `g`; `CONSTANTS`
    entries for each, each a written argument;
  - section I's `I.0` (the conversions) and its battery under §5.2's bands;
  - the constants in `<temp>/after/constants.txt`.

- [ ] **Step 1: Re-point section I**

- **I.0, the conversions** (run on the worktree's engine, today's laws):
  - For the face, at each Table 2 column: the free harness's law and video times on today's law,
    `faceScaleFor(Τh, U)`, and the law time it implies.
  - Then the new t0 (A2D's scale × `faceContactTimeAt(3.26)`, u0 3.26, q −0.23).
  - Each held-out column's video time on the new law. By plan decision 4 that is s_A2D · videoTime at shift/s_A2D at
    the column's U; compare it with Τh ± 0.1 ms, noting the clamp at A4D.
  - Table 2's implied restitution per column ((ballAfter − malletAfter)/U) beside e(U), and `TABLE2_CAVEAT`.
  - Plan decision 10's q fit and its t0, printed always and marked "offered" if a held-out column misses.
  - For the ball–ball: `ballBallTimeFor(7.5e-4)` with its three misses and law and force times, and the bounds
    converted (`ballBallTimeFor(5e-4)`, `ballBallTimeFor(8.7e-4)`).
  - Write every constant to `<temp>/after/constants.txt`, to full precision, as the JSON fragments Task 7 will apply.
- **Test 1** uses `touchingBand` per figure (plan decision 6) instead of the means' sem. It prints each band.
- **Test 4** judges all three `FREE_COLLISIONS` speeds (spec §2.2), not two.
- **Test 5** judges Table 2's face contact at A2D in the full single-ball stroke within ± 0.1 ms of 0.75 ms, as video
  time. That means `videoIntervals` over the face's separation, as section F's `timingOf` takes it. The law time is
  printed beside it, and the free harness's video time beside both (spec §4.1, test 5). It also judges the CA's
  single-ball strokes as today.
- Every law candidate also prints the squeeze's direction (as today) and spec §5.3's law-time timing for C3S and
  C20S: whether the face lets go before the croqueted ball leaves.
- Remove candidates a, c and d's blocks from `all` (their results stand in the last probe file); keep their code
  reachable by `SECTION=I-old`.

- [ ] **Step 2: Run I.0 (in the background)**

Run: `env SECTION=I npx --yes tsx scripts/croquetFitProbe.ts > <temp>/after/I0.txt`
Expected: non-empty. The face's A2D scale is near 0.74 and the ball–ball time near 0.93 ms (spec §2.1, §2.2). A gross
departure means a harness error: stop and trace it.

- [ ] **Step 3: The copies**

For each of `laws`, `face` and `ballball`, copy `src`, `tests`, `scripts`, `reference` and `package.json` into
`<temp>/copies/<name>/` and link `node_modules` to `<wt>/node_modules`. Then apply `constants.txt` to the copy's
`reference/contact.json`:

| Copy | `faceContactTimeFit` | `ballBallContactTime` | `ballObstacleContactTime` |
|---|---|---|---|
| `face` | `t0`, `u0` 3.26 | unchanged | unchanged |
| `ballball` | unchanged | `value` and `bounds` | `value`; its lower bound 0.87 × the new lower |
| `laws` | as `face` | as `ballball` | as `ballball` |

- [ ] **Step 4: Run each copy's battery (in the background, one at a time)**

From each copy: `env SECTION=I CANDIDATE=<name> TODAY_ROOT=<wt> npx --yes tsx scripts/croquetFitProbe.ts >
<temp>/after/I-<name>.txt`.

From the `laws` copy only, also run section E (each stroke with its band, the means over GAPPED_STROKES and
ALL_STROKES) and section F's law-time timing:
`env SECTION=E npx --yes tsx scripts/croquetFitProbe.ts > <temp>/after/E-laws.txt` and the same for F.

From the `ballball` and `laws` copies: `npx vitest run tests/engine/impact/fuzz.test.ts`. Record the largest obstacle
penetration over R against 0.06 (spec §2.2); a breach goes to the gate.

Expected: every file is non-empty and every candidate has a result.

- [ ] **Step 5: The probe file**

Write `docs/superpowers/probes/<date>-p2b2b2c2c-laws.txt`: `I0.txt`, then each copy's output under a heading, then
the fuzz's figures.

- [ ] **Step 6: Checks and commit**

Run the four checks. Commit the probe script and the probe file. Message: `Measure the re-set contact laws against
Gugan's tables and the touching stops`.

**Branch:** if the `laws` copy passes test 1, skip Task 5 and go to Task 6. Otherwise run Task 5.

---
### Task 5: The search (only if test 1 failed on §2's laws)

Spec §4.2, §4.3; gate stage 1's section C.

**Files:**
- Modify: `scripts/croquetFitProbe.ts` (`CONSTANTS.f`, `CONSTANTS.g`)
- Modify: `docs/superpowers/probes/<date>-p2b2b2c2c-laws.txt` (appended)
- Temp: `<temp>/copies/{f,g}/`, each a copy of `laws`

- [ ] **Step 1: Candidate f, the ball–ball damping's form**

In `<temp>/copies/f/src/engine/impact/contactLaw.ts`:
- `normalForce` becomes k·δ + c·√δ·δ′, clamped at 0, for the ball–ball pair only. This is Kuwabara and Kono's √δ
  form, as the face uses it. A ball–obstacle pair keeps the linear law: their derivation rests on it.
- The ball–ball pair's `PairLaw` takes the new c. Set k and c by plan decision 5's minimax: video time within a frame
  of 0.75 ms at the three speeds, with e kept within 0.72 ± 0.02 at each. Use a two-dimensional search on (k, c); a
  nested ternary search is enough.
- Write the constants and their search into the copy's header comment and into `CONSTANTS.f`, citing Rosas et al.
  2007 and Carretero-González et al. 2009 (spec §4.2).

- [ ] **Step 2: Candidate g, the ball–ball spring's shape**

In `<temp>/copies/g/`, the ball–ball force is Hertz, √δ·(k·δ + c·δ′), clamped at 0, with fixed k and c set in the
same way (spec §4.2, g).

- [ ] **Step 3: Run them (in the background, one at a time)**

From each copy: `env SECTION=I CANDIDATE=<f|g> TODAY_ROOT=<wt> npx --yes tsx scripts/croquetFitProbe.ts >
<temp>/after/I-<f|g>.txt`. Append both to the probe file under headings.

A candidate added with a physical reason and a source (spec §4.2's last paragraph) goes the same way, its reason in
`CONSTANTS`. None may hide a separation at gap 0.

- [ ] **Step 4: Checks and commit**

Run the four checks. Commit the probe script and the probe file. Message: `Search the ball–ball law's form for the
touching stops`.

---
### Task 6: Gate stage 1, the laws

Spec §9 stage 1. **Stop for the user.**

- [ ] **Step 1: Put sections A, B and C to the user, one question at a time**

Each question carries options, pros, cons and a recommendation:

- **A**, the laws:
  - the conversion factors at each column;
  - the held-out columns against ± 0.1 ms, and the q fit if offered (plan decision 10);
  - the free collisions;
  - the obstacle fuzz;
  - which of `laws`, `face` and `ballball` to admit.
- **B**, the touching stops and the means under the bands, with the law-time timing beside spec §5.3's sources.
- **C** (if run), each candidate's result, and whether one lands.

If the gate takes the q fit, run a `laws-q` copy through Task 4 Steps 3–5 and put A and B again on it before going
on.

- [ ] **Step 2: Record and commit**

Record each ruling verbatim in the spec's Amendments. Commit the spec. Message: `Record the contact laws' first gate`.

---
### Task 7: The admitted laws, landed

Spec §2, §8.1 (the analytic cases), §8.2 (after each law), §8.4; exit criteria 1, 2.

Land only what stage 1 admitted. If it admitted both laws, do this task's steps for each in turn, face first, with a
ratchet and a commit after each. An admitted candidate (f or g) lands last, as its own commit, with bit-identity when
switched off.

**Files:**
- Modify: `reference/contact.json` (`faceContactTimeFit`, `faceBallContactTime`'s note; `ballBallContactTime`,
  `ballObstacleContactTime`)
- Modify: `tests/reference/reference.test.ts:149-157`, `tests/engine/impact/contactLaw.test.ts:228`,
  `tests/engine/squeeze.test.ts` (the `it.fails`); every test the laws move
- For a candidate: `src/engine/impact/contactLaw.ts` and its call site in `simulateImpact.ts:507`, with
  `tests/engine/impact/contactLaw.test.ts`

**Interfaces:**
- Consumes: `<temp>/after/constants.txt` (Task 4).
- Produces: the engine on the admitted laws.

- [ ] **Step 1: Write the failing tests** (the face)

In `tests/reference/reference.test.ts`, replace the T(U) expectations (keep e's):

```ts
// P2b.2b.2c.2c: T(U) re-anchored on Gugan 4's Table 2 A2D in video time, q kept (was 0.97 ms at 2.19 m/s).
expect(t.coefficients).toEqual({ t0: T0, u0: 3.26, q: -0.23 });
expect(duration(3.26) / T0 - 1).toBeCloseTo(0, 6);
```

`T0` is `constants.txt`'s value, written out as a literal.

In `tests/engine/squeeze.test.ts`:

```ts
it("plays the landed face law alone to Table 2's A2D within its ± 0.1 ms, as the video times it", () => {
    // Checks the similarity argument that set t0: on the landed law the free face reads 0.75 ms at VISIBLE_SHIFT.
    expect(Math.abs(freeFace(3.26, { dt: 1e-8 }).videoTime - 7.5e-4)).toBeLessThanOrEqual(1e-4);
    expect(Math.abs(freeFace(3.26, { dt: 1e-8 }).videoTime - 7.5e-4)).toBeLessThanOrEqual(2e-6);
});
it("keeps e(U) to the bit", () => {
    expect(faceRestitutionAt(3.26)).toBe(E_TODAY_3_26);
});
```

`E_TODAY_3_26` is today's value, captured before the edit and written as a literal. The 2e-6 bound is the harness's
own agreement (dt 1e-8 and the bisection); the ± 0.1 ms is the spec's.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/reference tests/engine/squeeze.test.ts`
Expected: FAIL on the coefficients and the free face's video time.

- [ ] **Step 3: Implement**

Apply the face's constants to `reference/contact.json`:
- source: Gugan 4, Table 2 (A2D), with the exponent from Gugan 2000;
- provenance "derived";
- the note records the harness, the factor at each column, the held-out columns, Table 2's caveat and the clamp.

`faceBallContactTime`'s note places 0.8 ms on the new fit (spec §2.1).

- [ ] **Step 4: Re-baseline and run**

Run: `npm test`. For every failing test, trace why its figure moved (the face's time), then re-baseline it per Global
Constraints. `tests/engine/impact/contactLaw.test.ts:228`'s 0.97 ms at 2.19 m/s becomes the new law's value there. A
move in a run with no face contact is a defect: trace it.

- [ ] **Step 5: The ratchet (in the background)**

Rerun the ratchet's four lines into `<temp>/after/*-task7-face.txt` and compare them with Task 3's. Count the moved
runs per preset in `<temp>/after/task7-face-moved.txt`, and check that every unmoved run had no face contact.

- [ ] **Step 6: Checks and commit**

Run the four checks. Commit `contact.json` and the re-baselined tests. Message: `Re-anchor the face's contact time on
the CA's film`.

- [ ] **Step 7: The ball–ball law, as Steps 1–6**

The tests:
- `tests/engine/squeeze.test.ts`'s `it.fails` becomes `it` at all three speeds, with e within 0.72 ± 1e-9 of the law's
  (spec §8.1);
- `reference.test.ts:162-167` keeps pinning the obstacle's time equal to the ball–ball time and its lower bound at
  0.87 × the ball–ball lower bound;
- a new case pins `ballBallContactTime.bounds` to `constants.txt`'s converted pair.

Apply `ballBallContactTime` (value, bounds, the note with the video figures moved into it; source Table 1, provenance
"derived") and `ballObstacleContactTime` (value, the lower bound, the note's derivation restated).

Re-baseline, then run `npx vitest run tests/engine/impact/fuzz.test.ts`; a penetration over 0.06 R stops for the user.

Ratchet into `<temp>/after/*-task7-ball.txt` and count every moved hoop and peg run. Message: `Set the ball–ball
contact time so the video reads Table 1's 0.75 ms`.

- [ ] **Step 8: An admitted candidate (only if stage 1 admitted f or g)**

Land the copy's law behind its own `PairLaw` field, so that a pair without it keeps today's arithmetic.
- Analytic cases: its free collisions reproduce Table 1 as Task 5 found; a pair without the field is bit-identical.
- Run the ratchet as above.
- Message: the law's own sentence.

---
### Task 8: The measurements on the admitted laws

Spec §3 (the sweep), §5, §5.3 (the camera), §6 (the taps over the grid), §7.7, §8.3; gate stage 2's D, E and G.

**Files:**
- Modify: `scripts/croquetFitProbe.ts` (sections D, E, F; new N), `tests/engine/ratioFit.test.ts`

**Interfaces:**
- Consumes: `cameraIntervals` (Task 3); `FaultReport.strike` (Task 2).
- Produces: sections D, E, F and N on the admitted laws, and the strike window's boundary test.

- [ ] **Step 1: The strike window's boundary (§7.7)**

In `tests/engine/ratioFit.test.ts`:

```ts
it("counts a contact beginning at the window's end, and not one beginning after it", () => {
    const I = (start: number, end: number) => ({ start, end });
    expect(readTimeOf([I(0, 8e-4), I(STRIKE_WINDOW, STRIKE_WINDOW + 1e-4)], []).time).toBeCloseTo(
        STRIKE_WINDOW + 1e-4 + READ_DELAY,
        15,
    );
    expect(readTimeOf([I(0, 8e-4), I(STRIKE_WINDOW + 1e-9, 0.02)], []).time).toBeCloseTo(8e-4 + READ_DELAY, 15);
});
```

Run: `npx vitest run tests/engine/ratioFit.test.ts`. Expected: PASS (it pins today's behaviour).

- [ ] **Step 2: The sections**

- **D** gains 0.04 mm (Herrmann and Seitz). It runs at C3S's and C20S's U on the AC stop and at C1D's on the drive,
  and reports C3S and C20S across 0–0.5 mm beside their gap-0 result, with the bands (spec §3).
- **E** judges C3S and C20S at gap 0 by `touchingBand`, and the means over `GAPPED_STROKES` and `ALL_STROKES`. It keeps
  W/U and the energy beside Table 5's, and Gugan's note (ii).
- **F**, for the six croquet strokes:
  - the law column and the video column, as today;
  - the camera's frame counts (range over 16 phases) at 0.2, 0.4 and 0.6 mm, each release the camera cannot see
    marked "unseen";
  - Plummer's and Hall's rows with the law times and the force-on times;
  - the four sources' findings and their departures (spec §5.3's table).

  A stroke whose three bodies stay loaded throughout is reported, not failed.
- **N**, the double taps:
  - over the preset digest's grid (`digestGrid`, section M's), every croquet run's `faults.strike`: the count of taps,
    each tap's start and end (ms), the largest `clearanceAfter` (mm), and the merged breaks with their lengths;
  - a tally per preset;
  - every run still flagged under 29.1.6.1, listed with its re-contact's start against its parting.

- [ ] **Step 3: Run them (in the background)**

Run: `env SECTION=<X> npx --yes tsx scripts/croquetFitProbe.ts > <temp>/after/<X>.txt` for X = D, E, F, N, G.
Run (the controller): `env SLOW_TESTS=1 npx vitest run tests/engine/squeezeConvergence.test.ts`.
Expected: non-empty. A convergence miss is a finding for the gate (spec §8.3), not a change.

- [ ] **Step 4: Checks and commit**

Run the four checks. Commit the probe and the test. Message: `Probe the strike, the camera and the double taps on the
new laws`.

---
### Task 9: The checks

Spec §7.1–§7.6, §7.8, §7.9; gate stage 2's F; plan decision 11.

**Files:**
- Modify: `scripts/croquetFitProbe.ts` (new sections O, P; J–M kept)
- Temp: `<temp>/copies/{free-head-today,free-head,shift-0.4,shift-0.6}/`

- [ ] **Step 1: Section O (the hands, §7.6)**

Per plan decision 11. Make the two copies:
- `free-head-today` from `<temp>/main-tree`'s `src`, `scripts`, `tests`, `reference` and `package.json`;
- `free-head` from the worktree.

Apply the integrate edit to each. Section O prints, per root and stroke, the judged figures and the face intervals,
then the difference between the coupled and free runs, on today's laws and on the admitted ones.

Run: `env SECTION=O HANDS_ROOTS=today=<temp>/main-tree,today-free=<temp>/copies/free-head-today,admitted=<wt>,
admitted-free=<temp>/copies/free-head npx --yes tsx scripts/croquetFitProbe.ts > <temp>/after/O.txt` (one line).

- [ ] **Step 2: Section P (the camera threshold's reach, §7.9)**

- Two copies of the worktree, `shift-0.4` and `shift-0.6`. Each re-sets both laws by Task 4's I.0 with `shift` 4e-4
  or 6e-4 (`faceScaleFor` and `ballBallTimeFor` take it) and applies the constants as Task 4 Step 3.
- From each, run section E. Section P reads both outputs and the worktree's own, and reports for criteria 3 and 4
  whether the touching stops' pass and the means hold at each threshold.

`VISIBLE_SHIFT` is never changed.

- [ ] **Step 3: The kept checks (in the background)**

Run sections J (§7.1, at e 0.72 and 0.772, and the jab sweep), K (§7.3), L (§7.2), M (§7.5, §7.8) and A (§7.4,
including Gugan 5's drive distance at the default gap beside the lawn's pace), each into `<temp>/after/<X>.txt`.

Run (the controller): `env SLOW_TESTS=1 npx vitest run tests/engine/turfStrike.test.ts`. If the face's law changed
(it did, if admitted), M re-runs the grip-limit control run.

Expected: non-empty. Gugan's jab stays `.fails` unless it now passes, which is then a finding for the gate.

- [ ] **Step 4: Checks and commit**

Run the four checks. Commit the probe. Message: `Probe the hands, the camera threshold and Gugan 5's checks on the new
laws`.

---
### Task 10: Gate stage 2, the consequences

Spec §9 stage 2. **Stop for the user.**

**Files:**
- Create: `docs/superpowers/probes/<date>-p2b2b2c2c-gate.txt`

- [ ] **Step 1: Run the gate (alone, in the background)**

Run: `npx --yes tsx scripts/croquetFitProbe.ts > docs/superpowers/probes/<date>-p2b2b2c2c-gate.txt`

Append, each under a heading:
- `task2-moved.txt` and Task 7's moved-run files;
- `O.txt` and the section P inputs;
- the cost: `env COUNT=800 npx --yes tsx scripts/shotMix.ts`, run alone, against Task 1's.

- [ ] **Step 2: Put each section to the user, one question at a time**

Each question carries options, pros, cons and a recommendation:

- **D**: the default gap (move to 0 only if C3S and C20S pass at gap 0; "My calls"), the sweep, and the five tests
  pinned at gap 0 (spec §3).
- **E**: the double taps' counts, timings and separations over the grid; any re-contact still flagged; every merged
  break with its length.
- **F**, one ruling at a time:
  - §7.1's drive and stop at e 0.72;
  - §7.4;
  - §7.5;
  - §7.6;
  - §7.7;
  - §7.9.

  Then, as one batch, §7.1's 0.772 variant and jab sweep, §7.2, §7.3 and §7.8; the user may take any singly.
- **G**: the ratchet's moved runs, the convergence and the cost.
- Every test re-baselined that the spec did not predict.

**Wait for each ruling**, and record it verbatim in the Amendments. A section ruled against is fixed and the gate
re-run.

- [ ] **Step 3: Commit**

Run the four checks. Commit the gate file and the spec. Message: `Run the contact laws' pre-flight gate`.

---
### Task 11: The default gap (only as gate D ruled)

Spec §3; exit criterion 6.

**Files:**
- Modify: `tests/engine/support/shot.ts` (`DEFAULT_CROQUET_GAP`); the pinned tests (`tests/engine/shot.test.ts:372`,
  `:617`, `:652`, `:655`; `tests/engine/impact/handover.test.ts:300`); every test the move breaks

- [ ] **Step 1: Move the default**

`DEFAULT_CROQUET_GAP = 0`, its comment citing the gate's ruling and C3S's and C20S's pass. Nothing else goes in this
commit. If gate D kept 1 mm, make no change: re-check the pinned tests' mechanisms, record them, and still run Step 3
(exit criterion 9 holds on the new laws whatever the default).

- [ ] **Step 2: Re-baseline and unpin**

Run: `npm test`.
- At gap 0, remove the five pins (their explicit `croquetGap: 0`), since the default now gives it. Re-check each
  one's mechanism and record it in the commit body.
- Every other failing test: trace it, then re-baseline it with "P2b.2b.2c.2c: the croquet gap's default, 0 (was
  1 mm)".
- A non-croquet move is a defect.

- [ ] **Step 3: The canonical runs, the convergence and the ratchet (in the background)**

Run: `npx vitest run tests/engine/shot.test.ts` — every preset's canonical setup from top to finish, each default
planning 3 m/s within 2 %.
Run (the controller): `env SLOW_TESTS=1 npx vitest run tests/engine/squeezeConvergence.test.ts`.

Rerun the ratchet, `strokeProbe` and `swingProbe` into `<temp>/after/*-task11.txt`.
- Every moved `presetDigest` line must be a croquet run; count them per preset in `<temp>/after/task11-moved.txt`.
- `swingProbe`'s late re-hit sweep: no run ends with the head overlapping a ball as handed over.

- [ ] **Step 4: Checks and commit**

Run the four checks. Commit the support file and the tests. Message: `Start the croquet strokes' balls touching, as
the film shows them`.

---
### Task 12: The probes, the figures and the documents

Spec §11; exit criterion 10.

**Files:**
- Create: `docs/superpowers/probes/<date>-p2b2b2c2c-{strokeProbe,swingProbe,impactProbe}.txt`
- Modify: the roadmap; the spec's Amendments; `reference/sources/README.md` (any source added since Task 1)

- [ ] **Step 1: Run the probes (in the background)**

Run each of `scripts/strokeProbe.ts`, `scripts/swingProbe.ts` and `scripts/impactProbe.ts` into its
`docs/superpowers/probes/<date>-p2b2b2c2c-<name>.txt`.

- [ ] **Step 2: The roadmap**

- **The P2 row:** grep line 12 narrowly and edit with exact strings. Mark P2b.2b.2c.2c delivered, with its spec and
  plan paths and its outcome. P2b.2b.2c.2d gains the user's braking stop (decision 2) and the judging of re-contacts
  after the balls part (§6).
- **A new section "P2b.2b.2c.2c outcomes (<date>)":** every item of spec §11, the test count, and the gates' rulings in
  brief.
- **"Provisional numbers":** the face's T(U), `ballBallContactTime` and the default gap.
- **"Carried open items":** whatever the gates carried.

- [ ] **Step 3: The spec's Amendments**

Fold in plan decisions 1–12, each in a sentence with its reason, beside the gates' rulings already recorded.

- [ ] **Step 4: Checks and commit**

Check the line lengths of every markdown file touched. Commit the probe files, the roadmap, the spec and the README.
Message: `Record the contact laws' probes and outcomes`.

Delete the previous session's research directories (`/tmp/claude-7b239ef3-bb5f-4178-93d5-bb8630eba4c8/`'s `gugan4/`,
`research-cradle/`, `research-gugan/` and `research-laws/`) once the README cites every source they held.

---
### Task 13: The version and the exit criteria

Spec §1; exit criteria 1–10.

**Files:**
- Modify: `src/engine/simulate.ts:77`, and any test pinning the version string

- [ ] **Step 1: Bump the version**

`ENGINE_VERSION = "0.16.0"`. Run `grep -rn "0\.15\.0" src tests` and update any test that pins the engine version.

- [ ] **Step 2: Run everything**

Run: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`, one per call.
Run (the controller, in the background): `env SLOW_TESTS=1 npm test`.
Expected: all pass; Gugan's jab as the gate left it.

- [ ] **Step 3: Walk the exit criteria**

For each of spec §1's ten criteria, name the test, ratchet file or gate line that shows it met, in the commit
message's body. Any criterion not met stops for the user.

- [ ] **Step 4: Commit**

Commit `src/engine/simulate.ts` and any version test. Message: `Bump the engine version to 0.16.0`.

Remove the baseline worktree and the copies: `git worktree remove <temp>/main-tree`, then `rm -rf <temp>/copies`.
Then use superpowers:finishing-a-development-branch (the final review, `/pre-review`, the PR).
