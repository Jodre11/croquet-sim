# P2b.2a — Obstacles in the Impact and the Fault Judge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ball–upright and ball–peg contact to the impact, record a contact timeline of every pair, and judge the
mallet faults of the AC Laws (Law 29) from that timeline and a stroke context.

**Architecture:** The obstacle becomes a fourth pair kind, `ball-obstacle`, appended to the impact's single pair list
after `ball-turf`, with the same clamped spring–dashpot and Cundall–Strack friction as every other pair; the obstacle
is immovable and carries its own contact time. `impact/timeline.ts` records, per pair, the intervals in which it was in
contact (closed, or a face at the rim), and the integrator returns them as `ImpactRun.timeline` with
`touchingAtStart`. Validation accepts a ball touching an obstacle and `prepareImpact` moves it to zero gap; the
handover also clears balls from obstacles. A pure judge, `src/engine/faults.ts`, reads the timeline and a
`StrokeContext` and applies Law 29; mechanics stay Law-agnostic.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Vitest, ESLint, Prettier. No new dependencies;
`npx --yes tsx` runs the scripts.

**Spec:** `docs/superpowers/specs/2026-10-04-p2b2a-obstacles-faults-design.md` (read all of it, including its
"Amended 2026-10-04" notes). Impact spec: `docs/superpowers/specs/2026-10-03-p2b1-impact-integrator-design.md` (§4
pairs, §6 handover). Product spec: `docs/superpowers/specs/2026-09-30-croquet-shot-lab-design.md` §5. Roadmap:
`docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`, P2 row and "P2b.2 decisions (2026-10-04)". Laws:
World Croquet Federation, *Laws of Association Croquet*, 7th edition, with Official Rulings and Commentary,
<https://worldcroquet.org/wp-content/uploads/2021/04/Laws-Rulings-Commentary-combined-published-master-.pdf> (Law 29
and C29.10–C29.20; extract with `curl -sSL -o <file>.pdf <url>` then `pdftotext -layout <file>.pdf <file>.txt`).

**Decisions made while planning** (folded into the spec as its "Amended 2026-10-04 (plan)" note):

- **29.1.13 is judged on penetration, not force.** The judge reads the impact only, which carries no contact laws, so
  it cannot form k·`CONTACT_TOLERANCE`. It tests the striker–croqueted pair's `peakPenetration` against
  `CONTACT_TOLERANCE` instead: the same criterion for the spring term, and a pushed pair exceeds it within one step
  (1 m/s × 5 µs = 5 µm ≫ 1 nm).
- **Exemption ties favour the striker.** The spec puts a face interval starting with the roquet after it. Likewise an
  object hit starting with the roquet is not after it, and one starting with a mallet contact is not before it. "Another
  object" excludes the roqueted ball (C29.20.4: "hits something else"). The roquet is the earliest first closing on a
  live ball not touching at t = 0.
- **The exemption covers every 29.1.6 and 29.1.7 row,** including the head-re-approach possible 29.1.6.2 (taken at
  the impact's end) and 29.1.6.1.
- **Findings.** `Finding.ball` is the striker's ball, except 29.1.11 (the ball the mallet touched) and 29.1.13 (the
  croqueted ball, `t` = the impact's duration). 29.1.8 and 29.1.9 give one finding per obstacle. Findings come in the
  table's row order; the judge does not rank them.
- **`clearanceAfter`** is attached to an interval when the next one opens: the largest d − R over the gap's steps,
  d being the ball centre's distance from the nearer face plane (the larger of the two faces' signed distances), read
  from each step's starting state. A trailing gap is not recorded.
- **One helper, `outsideObstacle`,** places a ball at δ ≤ 0 exactly, for both `prepareImpact` and the handover.
  `handover` gains an `obstacles` parameter.
- **Obstacle laws are solved once per obstacle** (every ball has the same mass).
- **`validateImpact` also requires `ballUpright` and peg restitution in (0, 1]:** the law needs e > 0, and phase 2's
  `validateWorld` allows 0.
- **`laws.json` keys are Law numbers** (`"29.1.8"`) plus `"groupOfBalls"`. 29.1.6 is split into its three sub-clauses,
  and the sub-item numbers inside a quote are dropped.
- **`ballObstacleContactTime` bounds** were [0.435, 1.5] ms until pre-flight ran the obstacle fuzz at both (now
  [0.435, 1.0] ms; below).

**Decisions made in pre-flight** (folded into the spec as its "Amended 2026-10-04 (pre-flight)" note):

- **A reach filter** (user decision, 2026-10-04). Pairing every ball with every obstacle cost 1.61–1.88× P2b.1's
  µs/step on the default world, so a ball–obstacle pair is skipped while the ball cannot yet reach the obstacle: a
  per-pair travel budget (the ball's summed horizontal path length against the gap when the pair was last found open).
  It is exact by construction, and pre-flight confirmed it bit for bit (full digest and obstacle fuzz). Cost with it:
  1.04–1.33×. Task 10.
- **The 29.1.7 exemption.** A dead ball's hit is exempt only if the mallet contact it falls in is exempt at its own
  start and the hit does not start after the roquet: the mallet contact, the roquet and the hit start together (spec
  §7's ordering; the last sentence of Law 29.2.4). Task 8.
- **The contact-time upper bound is 1.0e-3 s:** the largest for which the obstacle fuzz keeps penetrations under
  0.06·R with a margin (0.055·R); 1.1e-3 s passes by 0.5 % and 1.5e-3 s gives 0.081·R. Task 2.
- **The fuzz reaches stay 0.06 m and 0.1 m.** Every reach tried, up to 0.2 m and 0.3 m, passes; widening only dilutes
  the share of strokes that meet an obstacle (17.45 % down to 6.35 %). Task 9.
- **`outsideObstacle` steps by an ulp of the coordinates,** not of the reach: ε·(max(|x|, |y|) of the obstacle's
  centre + R + r). The plan's ε·target steps could not outgrow the rounding of 10 m coordinates and threw on 26 % of
  random overlaps. Task 4.

## Global Constraints

- **Formatting.**
  - 4-space indentation, 120-column limit (check with `grep -nE '^.{121,}$' <file>`), LF line endings, UTF-8.
  - Run `npx prettier --write` on every file you touch; `npm run format:check` must pass.
  - `.prettierignore` lists `docs/`, so wrap markdown by hand. Prettier does not re-wrap comments or strings.
  - Code blocks here keep some long lines whole; Prettier wraps code. Wrap any comment over 120 columns by hand. JSON
    `quote`, `source` and `note` strings stay on one line, as in the existing reference files.
- **Engine purity.** `src/engine/**` is pure and deterministic: no DOM, no time-of-day, no randomness. Iterate balls in
  `BALL_IDS` order, obstacles in `obstaclesOf` order, pairs in pair-list order. Sum forces in that order.
- **Determinism lint.** Engine code uses only IEEE-exact operations: `+ − * /`, comparisons, `Math.sqrt`, `Math.abs`,
  `Math.min`, `Math.max`, `Math.round`, `Math.floor`. No `Math.sin/cos/atan2/exp/log/pow/hypot`, no `**`. `npm run
  lint` enforces it. Tests and scripts may use any `Math` function.
- **Style.**
  - No non-null assertions (`!`); the repo style is `x as T` after indexing.
  - Braces on every `if`.
  - Exported functions carry a header comment. A named numerical constant says why it is not physical.
  - `import type` for type-only imports (`verbatimModuleSyntax`).
- **Units.** SI. A ball on the turf in phase 2 has `z = R`, `vz = 0` exactly; inside the impact a resting ball sits at
  its static sink `z = R − m·g/k_turf`.
- **Engine version.** `ENGINE_VERSION` becomes `"0.5.0"` (Task 7).
- **P2b.1 stays bit-identical where no ball meets an obstacle** (spec exit criterion 2):
  - Before Task 1, save the baseline digest (Task 1, Step 1: 4,755 lines). After Tasks 1, 5, 6 and 7, the digest's
    P2b.1 lines (every line not starting `timeline `) are byte-identical to it.
  - After Tasks 3, 7 and 10, `npx --yes tsx scripts/shotMix.ts` prints work units p99 143,084, p99.9 362,050, max
    408,030 exactly, and `SLOW_TESTS=1 npm test` passes.
- **The reach filter is exact** (Task 10): the whole digest, `timeline ` lines included (4,961 lines), and the full
  results of the 2000 obstacle-fuzz strokes are byte-identical before and after it.
- **Slow tests** run only when `SLOW_TESTS` is set (`import.meta.env.SLOW_TESTS`).
- **Pre-flight is done** (2026-10-04; see "Pre-flight" below). Every constant and tolerance here is the measured or
  ruled value, with the figure it derives from in its comment. Do not repeat pre-flight.
- **RED steps.** Vitest does not type-check: where a test uses a missing export or field, the RED run shows runtime
  failures (`… is not a function`, `Cannot read properties of undefined`, an assertion on `undefined`), and `npm run
  check` shows the type errors.
- **Bash.** One command per call: no `&&`, `||`, `;`, `$(…)` or subshells.
- **Commits.**
  - Short imperative sentence (repo style), signed.
  - Write the message to `$CLAUDE_TEMP_DIR/msg.txt` and run `git commit -F "$CLAUDE_TEMP_DIR/msg.txt"`. Signing needs
    the sandbox disabled for the SSH agent.
  - Check with `git log -1 "--format=%G? %h"` (expect `G`). If signing refuses, leave the change staged and report it.
  - Never use `--no-verify`, `-c commit.gpgsign=false` or bare `git stash`.
- **Checks after every task:** `npm test`, `npm run lint`, `npm run check` and `npm run format:check` all pass.
- **Worktree.** A fresh worktree needs `npm ci` before any test run.

## Review Focus

The inputs below are implied by the spec but exercised by none of its listed tests. Each is pinned by a test in the
task that owns the code.

1. **A ball touching both an obstacle and another ball at t = 0** (a cannon by a hoop; cannons are deferred, but such
   a setup is valid input). The zero-gap move (≤ 1 nm) must not make validation or the impact fail. Pinned in Task 7
   ("accepts a ball touching the peg and another ball").
2. **A crush by a ball other than the striker's.** `red@1/a` overlapping a face interval on red must not raise 29.1.8
   for the striker, and the obstacle-key prefix must not match another ball's keys. Pinned in Task 8 ("does not
   charge the striker with another ball's crush").
3. **A ball pushed into an upright by another ball at handover.** The separation passes must converge with ball–ball
   and ball–obstacle moves interleaved, and phase 2 must accept the result. Pinned in Task 7 ("separates a ball pushed
   into an upright by another ball").
4. **A whiff:** no `face/<striker>` interval at all. A single-ball stroke yields no findings; a croquet stroke yields
   29.1.13 alone, and nothing throws. Pinned in Task 8 ("judges a whiff").
5. **A `live` ball absent from the impact.** It is ignored, not an error, and cannot be a roquet. Pinned in Task 8
   ("ignores a live ball that is not in the impact").

---

## Pre-flight

Spec §10. Pre-flight ran on 2026-10-04: this plan was executed literally from `b218ff1` in a scratch worktree, every
task passed a spec and quality review, and the values below were measured. They are folded into the code blocks and
comments here and into the spec's "Amended 2026-10-04 (pre-flight)" note. This section is a record; the real run does
not repeat it.

| Value | Where | Planned | Measured |
|---|---|---|---|
| `ballObstacleContactTime` bounds | `reference/contact.json` | [4.35e-4, 1.5e-3] s | Obstacle fuzz, 2000 strokes, hoop and peg `contactTime` swept. Worst obstacle penetration grows about 2.5 mm per ms: 4.35e-4 s 0.0235·R; 7e-4 s 0.038·R; 1.0e-3 s 0.055·R; 1.1e-3 s 0.0597·R; 1.12e-3 s 0.061·R (fails); 1.5e-3 s 0.081·R (fails). No `impact-cap` anywhere. Ruling: upper bound 1.0e-3 s (the largest with a margin); lower bound stays 4.35e-4 s, its one failure being the `outsideObstacle` defect below |
| `OBSTACLE_PENETRATION_BOUND` | `tests/engine/impact/fuzz.test.ts` | 0.2·R | Worst obstacle-pair peak penetration 1.745 mm = 0.038·R (stroke 1826, `blue@1/a`); 1.5× → 0.06·R. Worst ball–ball 1.83 mm |
| Obstacle fuzz ranges | `tests/engine/support/impact.ts` (`UPRIGHT_REACH`, `PEG_REACH`) | 0.06 m, 0.1 m | Share of strokes in which an obstacle pair closes: (0.06, 0.1) 17.45 %; (0.1, 0.15) 12.8 %; (0.15, 0.2) 9.0 %; (0.2, 0.3) 6.35 %; none caps, worst penetration flat at about 1.77 mm. Ruling: keep 0.06 m and 0.1 m; `OBSTACLE_SHARE` 0.087. 2000 strokes take about 4.4 s |
| Per-step cost of every obstacle pair | `scripts/impactProbe.ts` timing | — | µs/step on the default world against `main`, side by side. Without a filter: centre 0.587 / 0.365 (1.61×), croquet 1.058 / 0.598 (1.77×), descending 0.566 / 0.301 (1.88×), stop shot 1.043 / 0.593 (1.76×); removing the hoops restores `main`'s cost, and an early squared-distance reject gave only 1.55 → 1.52×. The user chose a reach filter (Task 10). With it: centre 0.433 / 0.355 (1.22×), croquet 0.756 / 0.730 (1.04×), descending 0.405 / 0.304 (1.33×), stop shot 0.750 / 0.585 (1.28×) |
| Shortest face–ball gap in single clean strikes | `scripts/impactProbe.ts` | — | 978 strokes, 3 with more than one face interval; shortest gap 2,990 µs; no one-step gaps. No minimum gap needed (spec §5) |
| Crush distance | `scripts/impactProbe.ts` | — | 1 / 2 / 3 / 4 / 6 m/s: 1.088 / 2.188 / 3.261 / 4.365 / 6.549 mm, about 1.09 mm per m/s; C29.13.1 says 1–2 mm (exit criterion 5: recorded, not gated) |
| Analytic tolerances | Tasks 5, 6 | As written there | dt 1e-7 s. Head-on contact time exact (7,000 steps), restitution 8.98e-5; peg restitution (e = 0.4) 1.81e-4 → own bound 4e-4; slip \|Δv_t/Δv_n − μ\| 6.0e-5 (bound 2e-4 kept); slip spin 1.005e-3 (2e-3 kept); stick Δv_t/Δv_n = 0.654·μ (0.9·μ kept); stick spin 1.48e-3 → 3e-3. Double tap \|length − (T + c/k)\| 4.73 µs against 2·dt = 10 µs (kept) |
| Double-tap geometry | Task 6 | Wall 2 mm ahead | 2 mm holds: face [55, 680) µs (peak 2,832 N, clearance after 0.950 mm) and [1,945, 2,575) µs (3,332 N); wall [1,140, 1,930) µs and [2,535, 3,325) µs; first start exactly 11·dt |

Defects pre-flight found, all fixed in this plan:

- `outsideObstacle` (Task 4) grew its target by ε·target (about 7e-18 m), which cannot outgrow the rounding of 10 m
  coordinates (about 1.8e-15 m): a synthetic stress test threw on 26 % of random overlaps, and obstacle-fuzz stroke 1084
  threw at a contact time of 4.35e-4 s. The step is now ε·(max(|x|, |y|) of the obstacle's centre + R + r); the first
  attempt is unchanged, so the digest is bit-identical. A regression test reproduces stroke 1084. Stress replicas
  (2e6 random overlaps, coordinates to ±100 m) cleared at attempt index 0 or 1; near the origin (obstacle spans of
  ±1e-3 and ±0.05 m, 1e6 inputs each), where the step is about ε·(R + r), a few needed index 2, never more, so
  `OUTSIDE_STEPS` stays 4 and its comment claims no more than that.
- Task 4's `PairKind` addition left `lawOf` non-exhaustive (`npm run check` failed): Task 4 now adds a throwing
  placeholder case, which Task 5 replaces.
- Task 4's tests: the pair-key slices (4 and 5, not 5 and 6), the sign of the contact point's offset (+5e-5), and the
  "at R + r" case, which rounds to a depth of 1.7e-16 and needs +1e-12.
- Task 8's 29.1.7 branch exempted a dead-ball hit inside a mallet contact that opened before the roquet; the ruling
  above fixes it, with new sequence tests.
- Task 9's touching-away case struck the ball towards upright 1/b; it is mirrored (1/a east, yaw π). The 20 mm
  near-miss never reaches the upright (nor does 10 mm, at 3 m/s on the test world), so a 5 mm case that reaches it was
  added. `randomObstacleStroke` gained a draw cap and retries only `RangeError`.
- Task 2's 29.1.5 note misquoted C29.10.8 ("the end-face"; it reads "an end-face"). The digest is 4,755 lines, not
  about 3,000. Several comments the plan dictated ran over 120 columns (Tasks 5, 7).

The stop-shot probe's "impulse share with blue clear of the turf 0.0 %" is the same on `main`: not a regression.

---

## File Structure

| Path | Change |
|---|---|
| `scripts/impactDigest.ts` | P2b.1 fields as an explicit list; `timeline` lines for the new fields |
| `reference/contact.json` | `ballObstacleContactTime` |
| `reference/laws.json` | Law 29 quotes (29.1.5–29.1.9, 29.1.11, 29.1.13, 29.2.3–29.2.7) and the Glossary's "Group of balls" |
| `reference/README.md` | `laws.json` also holds Law 29 quotes keyed by Law number |
| `src/reference/index.ts` | `contactReference.ballObstacleContactTime`; `lawsReference.faults`; `FAULT_LAW_KEYS` |
| `src/engine/types.ts` | `Cylinder.contactTime`, `Hoop.contactTime` |
| `src/engine/world.ts` | `uprightsOf` copies it; `validateWorld` checks it; `defaultWorld` fills it |
| `src/engine/impact/contacts.ts` | `ball-obstacle` pairs and keys, `obstacleContact`, `obstacleGap`, `outsideObstacle`, `pairTouching`, `faceClearance` |
| `src/engine/impact/timeline.ts` | New: the per-pair interval recorder |
| `src/engine/impact/types.ts` | `ContactInterval`; `ImpactRun.timeline`, `.touchingAtStart` |
| `src/engine/impact/integrate.ts` | `ImpactObstacle`, `ImpactSetup.obstacles`, obstacle laws, the timeline, the reach filter |
| `src/engine/impact/simulateImpact.ts` | Touching accepted, overlap rejected; obstacle laws; zero-gap placement |
| `src/engine/impact/handover.ts` | Clears balls from obstacles |
| `src/engine/faults.ts` | New: `StrokeContext`, `Finding`, `FaultReport`, `judgeFaults`, `JUDGED_LAWS` |
| `src/engine/simulate.ts` | `ENGINE_VERSION` 0.5.0 |
| `tests/engine/support/fixtures.ts` | Obstacle contact times; `hoopWithUprightAt` |
| `tests/engine/support/impact.ts` | `isolated` gains `obstacles`; obstacle fuzz strokes |
| `tests/engine/crossCheck.test.ts` | The upright gains `contactTime` |
| `tests/engine/world.test.ts`, `tests/reference/reference.test.ts` | New fields |
| `tests/engine/impact/{contacts,analytic,simulateImpact,handover,fuzz}.test.ts` | Obstacle cases |
| `tests/engine/impact/timeline.test.ts` | New: recorder and integrator timeline |
| `tests/engine/impact/obstacles.test.ts` | New: crush geometry and whole-impact fault cases |
| `tests/engine/faults.test.ts` | New: the judge |
| `scripts/impactProbe.ts` | Crush distance, face gaps, µs/step |
| `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md` | P2b.2a met; outcomes carried forward |

Task order keeps every commit green and bit-identical:

- Task 1 changes only the digest script.
- Task 2 adds data only.
- Task 3 adds the contact time to the world, phase 2 unchanged.
- Tasks 4–6 add the obstacle geometry, the obstacle pairs and the timeline bottom-up.
- Task 7 changes validation, placement, handover and the version.
- Task 8 adds the judge.
- Task 9 adds the whole-system tests and the obstacle fuzz.
- Task 10 adds the reach filter. It edits Task 6's pair loop, and its exactness check needs the full digest (Task 6's
  `timeline ` lines) and the obstacle fuzz (Task 9) as they stand before it; Tasks 7–9 do not touch `integrate.ts` or
  `contacts.ts`' geometry, so it applies cleanly here, and Task 11's probe then measures the filtered cost.
- Task 11 extends the probe and records outcomes.

---

### Task 1: The digest prints the P2b.1 fields explicitly

The digest prints `JSON.stringify` of the whole result, so new fields would change its P2b.1 lines. It must print an
explicit P2b.1 field list (spec §1, exit criterion 2). This task records the baseline every later bit-identity check
compares against.

**Files:**
- Modify: `scripts/impactDigest.ts`

**Interfaces:**
- Produces: the digest's P2b.1 lines, byte-identical to the baseline; later tasks add lines starting `timeline `.

- [ ] **Step 1: Save the baseline**

From the worktree root, with no engine change yet (`npm ci` first in a fresh worktree):

Run: `npx --yes tsx scripts/impactDigest.ts > "$CLAUDE_TEMP_DIR/digest-base.txt"`
Expected: 4,755 lines, starting `scenario centre test-world {`.

Also record phase 2's figures: `npx --yes tsx scripts/shotMix.ts` prints p99 143,084, p99.9 362,050, max 408,030.

- [ ] **Step 2: Print an explicit field list**

In `scripts/impactDigest.ts`, change the import and add the helper below `exact`:

```ts
import { simulateImpact } from "../src/engine/impact/simulateImpact";
import type { ImpactResult } from "../src/engine/impact/types";
```

```ts
/** The fields P2b.1's results had, in its order. Later fields print on their own `timeline` lines. */
function p2b1(result: ImpactResult): unknown {
    const { balls, head, duration, events, peakPenetration, steps, handover, overlapCorrection } = result;
    return { balls, head, duration, events, peakPenetration, steps, handover, overlapCorrection };
}
```

Replace `exact(result)` with `exact(p2b1(result))` in the scenario loop, and the fuzz line with
`console.log(\`fuzz ${n} ${exact(p2b1(simulateImpact(contact, balls, TEST_WORLD)))}\`);`. Extend the header comment,
after "…must too.", with these two lines (the inline code spans stay whole on one line):

```ts
 * Lines starting `timeline ` carry fields added after P2b.1; every other line keeps P2b.1's format, so
 * `grep -v '^timeline '` of a later run is byte-comparable with P2b.1's digest.
```

- [ ] **Step 3: Verify byte-identity**

Run: `npx --yes tsx scripts/impactDigest.ts > "$CLAUDE_TEMP_DIR/digest-1.txt"`
Run: `cmp "$CLAUDE_TEMP_DIR/digest-base.txt" "$CLAUDE_TEMP_DIR/digest-1.txt"`
Expected: no output (identical).

- [ ] **Step 4: Format, check, commit**

Run `npx prettier --write scripts/impactDigest.ts`, then the four checks.

```bash
git add scripts/impactDigest.ts
git commit -F "$CLAUDE_TEMP_DIR/msg.txt"   # "Print the digest's P2b.1 fields as an explicit list"
```

---

### Task 2: Reference data for obstacles and faults

The obstacle contact time is derived (spec §4, §8); the Law 29 text is quoted verbatim (§7, §8). Before committing,
open each URL and confirm each quoted sentence is still there. If one is not, keep the entry, add "(quotation not
re-found on <date>)" to its note and report it. (Pre-flight re-found every quotation on 2026-10-04, by script, modulo
whitespace and apostrophe style.) The Law 29 entries cite the April 2021 combined PDF, which alone carries the
commentary; the existing entries cite the February 2021 Laws PDF. A quote that ends one of a Law's sub-clauses ends
at its own punctuation, and the joining "or" is dropped (29.1.6.1 reads "…29.2.5); or").

**Files:**
- Modify: `reference/contact.json`, `reference/laws.json`, `reference/README.md`, `src/reference/index.ts`
- Test: `tests/reference/reference.test.ts`

**Interfaces:**
- Produces:
  - `contactReference.ballObstacleContactTime: ReferenceValue`;
  - `FAULT_LAW_KEYS` (readonly tuple of the keys below) and `type FaultLawKey`;
  - `lawsReference.faults: Readonly<Record<FaultLawKey, ReferenceQuote>>`.

- [ ] **Step 1: Write the failing test**

Append to `tests/reference/reference.test.ts`, and add `FAULT_LAW_KEYS` to its import:

```ts
describe("obstacle and fault reference data", () => {
    it("derives the obstacle contact time from the ball–ball one, within the Hertzian lower bound", () => {
        const T = contactReference.ballObstacleContactTime;
        expect(T.value).toBe(contactReference.ballBallContactTime.value);
        const [lo] = T.bounds as [number, number];
        expect(lo).toBeCloseTo((contactReference.ballBallContactTime.bounds as [number, number])[0] * 0.87, 12);
    });

    it("quotes every Law the fault judge relies on", () => {
        for (const key of FAULT_LAW_KEYS) {
            expect(lawsReference.faults[key].quote.length, key).toBeGreaterThan(0);
        }
        expect(Object.keys(lawsReference.faults)).toEqual([...FAULT_LAW_KEYS]);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/reference/reference.test.ts`
Expected: FAIL, 2 tests: `TypeError: Cannot read properties of undefined (reading 'value')` and
`TypeError: FAULT_LAW_KEYS is not iterable` (`FAULT_LAW_KEYS` is not exported yet).

- [ ] **Step 3: Add the obstacle contact time to `reference/contact.json`**

Add after `ballBallContactTime`:

```json
"ballObstacleContactTime": {
    "value": 0.00075,
    "unit": "s",
    "bounds": [0.000435, 0.001],
    "source": "Derived from ballBallContactTime (this file): Don Gugan, 'The Physics of Croquet Strokes: Analysis of the CA high-speed DVD', section 4, Table 1 row 5 (2009; Oxford Croquet), https://oxfordcroquet.org/tech/gugan4/",
    "provenance": "derived",
    "note": "No measurement of a ball striking a hoop upright or the peg was found. Oxford Croquet's 'Measuring Hoop Rigidity' (https://oxfordcroquet.org/tech/rigidity/) proposes methods and reports no data; Rod Cross's high-speed experiments (https://oxfordcroquet.org/tech/cross1/) cover ball-ball and mallet-ball contacts only. Derivation (P2b.2a design §4): for the impact's linear law a ball meeting an immovable body has the same natural frequency as two balls meeting, since the ball-ball pair has half the stiffness (two balls in series) and half the effective mass; the analogue value is therefore ballBallContactTime, 0.75 ms. Lower bound: Hertzian contact time scales as (m*^2/(E*^2 R*))^(1/5), and a ball on a rigid body has twice the reduced mass, radius and effective modulus of two equal balls, so T x 2^(-1/5) = 0.87 T; 0.87 x 0.5 ms (the ball-ball lower bound) = 0.435 ms. Upper bound: an upright gives in the turf, which the rigid model omits and no source quantifies; the allowance is 1.0 ms, the largest bound for which the obstacle fuzz keeps every obstacle penetration under its bound (0.06 R), with a margin: 1.0 ms gave 0.055 R, and 1.5 ms (2 x 0.75 ms) gave 0.081 R (P2b.2a pre-flight, 2000 strokes). Every hoop and the peg carries its own contact time (World), so a later version can vary hoop setting stiffness hoop by hoop or by lawn."
},
```

- [ ] **Step 4: Add the Law 29 quotes to `reference/laws.json`**

Add after `hoopRunComplete` (each `quote` is the Law's text verbatim; sub-item numbers are dropped and `[...]` marks
an omission, as in the existing entries):

```json
"29.1.5": {
    "quote": "Subject to the exemptions and limitations specified in Law 29.2 a fault is committed during the striking period if the striker: [...] strikes the striker’s ball with any part of the mallet other than an end-face of the head in any of the strokes specified in Law 29.2.3;",
    "source": "World Croquet Federation, The Laws of Association Croquet, 7th Edition (February 2021), with Official Rulings and Commentary (current as at April 2021), Law 29.1.5 and commentary C29.10; https://worldcroquet.org/wp-content/uploads/2021/04/Laws-Rulings-Commentary-combined-published-master-.pdf",
    "provenance": "direct",
    "note": "Judged on the first mallet contact only, C29.10.8: \"The fault of striking the ball with part of the mallet other than an end-face, covered by this law, applies only to the first contact. Any subsequent contact, however it occurs, is covered by Law 29.1.6.2 (multiple contacts between mallet and striker’s ball) and the exemptions specified in Law 29.2.4\". The impact models the end-face and its rim: a first contact at the rim (impact-off-face) is a contact other than an end-face. Applies only to the strokes of Law 29.2.3 (StrokeContext.hampered, jumpAttempt, group)."
},
"29.1.6.1": {
    "quote": "a fault is committed during the striking period if the striker: [...] allows the mallet: to contact the striker’s ball more than once in a croquet stroke, or continuation stroke when the striker's ball is touching another ball (for exemptions see Law 29.2.4 and for limitations see Law 29.2.5);",
    "source": "World Croquet Federation, The Laws of Association Croquet, 7th Edition (February 2021), with Official Rulings and Commentary (current as at April 2021), Law 29.1.6.1 and commentary C29.11; https://worldcroquet.org/wp-content/uploads/2021/04/Laws-Rulings-Commentary-combined-published-master-.pdf",
    "provenance": "direct",
    "note": "A possible fault only (Law 29.2.5), C29.11.2: \"A fault may be declared under Law 29.1.6.1 only if an adjudicator or the striker sees a separation between the mallet and the striker’s ball followed by the mallet hitting the striker’s ball a second time (see Law 29.2.5).\" Any part of the mallet counts, C29.11.9: \"subsequent contact with any part of the mallet, not just the end-face, is a fault under Laws 29.1.6.1 or 29.1.6.2\"."
},
"29.1.6.2": {
    "quote": "a fault is committed during the striking period if the striker: [...] allows the mallet: [...] to contact the striker’s ball more than once in any other stroke (for exemptions see Law 29.2.4);",
    "source": "World Croquet Federation, The Laws of Association Croquet, 7th Edition (February 2021), with Official Rulings and Commentary (current as at April 2021), Law 29.1.6.2 and commentary C29.11; https://worldcroquet.org/wp-content/uploads/2021/04/Laws-Rulings-Commentary-combined-published-master-.pdf",
    "provenance": "direct",
    "note": "Decidable from the mechanics, C29.11.5: \"(Law 29.2 imposes no limitation on how a fault under Law 29.1.6.2 may be judged.)\" A dead ball gives no exemption, C29.11.7: \"A scatter shot when the striker’s ball lies very close to but not in contact with a dead ball does not benefit from the Law 29.2.4 exemption.\""
},
"29.1.6.3": {
    "quote": "a fault is committed during the striking period if the striker: [...] allows the mallet: [...] to remain in contact with the striker's ball for an observable period in any stroke (for exemptions see Law 29.2.4 and for limitations see Law 29.2.6);",
    "source": "World Croquet Federation, The Laws of Association Croquet, 7th Edition (February 2021), with Official Rulings and Commentary (current as at April 2021), Law 29.1.6.3 and commentary C29.11; https://worldcroquet.org/wp-content/uploads/2021/04/Laws-Rulings-Commentary-combined-published-master-.pdf",
    "provenance": "direct",
    "note": "Not judged (P2b.2a design §7): it needs a sourced norm of contact time per stroke type, C29.11.8: \"considers to be audibly prolonged compared to the sound of a normal stroke of the same type (Law 29.2.6)\". The timeline keeps the face-striker intervals for when one is sourced."
},
"29.1.7": {
    "quote": "a fault is committed during the striking period if the striker: [...] allows the mallet to be in contact with the striker's ball after the striker's ball has hit another ball (for exemptions see Law 29.2.4 and for limitations see Law 29.2.7);",
    "source": "World Croquet Federation, The Laws of Association Croquet, 7th Edition (February 2021), with Official Rulings and Commentary (current as at April 2021), Law 29.1.7 and commentary C29.12; https://worldcroquet.org/wp-content/uploads/2021/04/Laws-Rulings-Commentary-combined-published-master-.pdf",
    "provenance": "direct",
    "note": "A possible fault (Law 29.2.7). C29.12.1: \"This plugs the gap by making it a fault if the mallet is still in contact with the striker’s ball when the latter hits another ball.\" C29.12.3: \"Law 29.1.7 does not normally apply to croquet strokes, since the striker’s ball is not hitting another ball\": the croqueted ball never counts."
},
"29.1.8": {
    "quote": "a fault is committed during the striking period if the striker: [...] strikes the striker's ball so as to cause it to touch a hoop upright or, unless the striker's ball is pegged out in the stroke, the peg when in contact with the mallet;",
    "source": "World Croquet Federation, The Laws of Association Croquet, 7th Edition (February 2021), with Official Rulings and Commentary (current as at April 2021), Law 29.1.8 and commentary C29.13; https://worldcroquet.org/wp-content/uploads/2021/04/Laws-Rulings-Commentary-combined-published-master-.pdf",
    "provenance": "direct",
    "note": "C29.13.1: \"this means that the nearest point of the ball must be within 1-2 mm of the upright before there is any real chance of a crush on that upright.\" The crush distance the impact produces is recorded against it (P2b.2a exit criterion 5). The pegged-out exception needs peg points and is not modelled: a crush on the peg is reported as a fault."
},
"29.1.9": {
    "quote": "a fault is committed during the striking period if the striker: [...] strikes the striker's ball when it lies in contact with a hoop upright or, unless the striker's ball is pegged out in the stroke, the peg otherwise than in a direction away therefrom;",
    "source": "World Croquet Federation, The Laws of Association Croquet, 7th Edition (February 2021), with Official Rulings and Commentary (current as at April 2021), Law 29.1.9 and commentary C29.14; https://worldcroquet.org/wp-content/uploads/2021/04/Laws-Rulings-Commentary-combined-published-master-.pdf",
    "provenance": "direct",
    "note": "C29.14.1: \"If its initial movement is in a different direction, even slightly, the hoop or the peg has contributed to the direction of travel of the ball and the stroke was a fault.\" Judged as the touching obstacle carrying force while the mallet is in contact. The pegged-out exception is not modelled."
},
"29.1.11": {
    "quote": "a fault is committed during the striking period if the striker: [...] touches any ball, other than the striker's ball, with the mallet;",
    "source": "World Croquet Federation, The Laws of Association Croquet, 7th Edition (February 2021), with Official Rulings and Commentary (current as at April 2021), Law 29.1.11 and commentary C29.16; https://worldcroquet.org/wp-content/uploads/2021/04/Laws-Rulings-Commentary-combined-published-master-.pdf",
    "provenance": "direct",
    "note": "Judged as any face or rim contact on a ball other than the striker's. C29.20.3: \"There is no exemption, for example, for any contact between the mallet and the croqueted ball\"."
},
"29.1.13": {
    "quote": "a fault is committed during the striking period if the striker: [...] in a croquet stroke, plays away from or fails to move or shake the croqueted ball;",
    "source": "World Croquet Federation, The Laws of Association Croquet, 7th Edition (February 2021), with Official Rulings and Commentary (current as at April 2021), Law 29.1.13 and commentary C29.18; https://worldcroquet.org/wp-content/uploads/2021/04/Laws-Rulings-Commentary-combined-published-master-.pdf",
    "provenance": "direct",
    "note": "Only \"fails to move or shake\" is judged: the croqueted pair never penetrates beyond CONTACT_TOLERANCE. \"Plays away from\" needs the swing direction (P2b.2b), C29.18.1: \"A fault is committed if the striker plays away from the croqueted ball even though it moves or shakes\"."
},
"29.2.3": {
    "quote": "The actions specified in Laws 29.1.5 and 29.1.14 are faults only if they occur in: a hampered stroke; or a single-ball stroke in which the striker is attempting to make the striker’s ball jump; or a stroke in which the striker’s ball is part of a group of balls.",
    "source": "World Croquet Federation, The Laws of Association Croquet, 7th Edition (February 2021), with Official Rulings and Commentary (current as at April 2021), Law 29.2.3; https://worldcroquet.org/wp-content/uploads/2021/04/Laws-Rulings-Commentary-combined-published-master-.pdf",
    "provenance": "direct",
    "note": "StrokeContext.hampered, .jumpAttempt and .group, supplied by the caller."
},
"29.2.4": {
    "quote": "Contact between the mallet and the striker's ball is not a fault under Laws 29.1.6 or 29.1.7 if it occurs after the striker's ball: makes a roquet; or scores the peg point; or hits a ball pegged out in the stroke. The exemption of Law 29.2.4.1 does not apply, however, if the striker's ball has hit another object after making the roquet.",
    "source": "World Croquet Federation, The Laws of Association Croquet, 7th Edition (February 2021), with Official Rulings and Commentary (current as at April 2021), Law 29.2.4 and commentary C29.20; https://worldcroquet.org/wp-content/uploads/2021/04/Laws-Rulings-Commentary-combined-published-master-.pdf",
    "provenance": "direct",
    "note": "C29.20.4: \"It is a fault if, after making a roquet, the striker's ball hits something else and then touches the mallet again. The objects referred to are hoops, the peg or another ball.\" Its worked examples C29.20.4.1-5 are the judge's table tests. Only 29.2.4.1 is judged; 29.2.4.2 and 29.2.4.3 need peg points."
},
"29.2.5": {
    "quote": "A multiple contact between the mallet and the striker’s ball is a fault under Law 29.1.6.1 only if the striker or a referee or other person asked to adjudicate the stroke, aided by nothing more than spectacles or contact lenses, sees a separation between mallet and ball followed by a second contact between them.",
    "source": "World Croquet Federation, The Laws of Association Croquet, 7th Edition (February 2021), with Official Rulings and Commentary (current as at April 2021), Law 29.2.5; https://worldcroquet.org/wp-content/uploads/2021/04/Laws-Rulings-Commentary-combined-published-master-.pdf",
    "provenance": "direct",
    "note": "Makes 29.1.6.1 a possible fault; the finding carries each gap's duration and clearance."
},
"29.2.6": {
    "quote": "The mallet remaining in contact with the striker’s ball for an observable period is a fault under Law 29.1.6.3 if the prolonged contact is visible or audible to the striker or a referee or other person asked to adjudicate the stroke, aided by nothing more than spectacles, contact lenses or hearing aids.",
    "source": "World Croquet Federation, The Laws of Association Croquet, 7th Edition (February 2021), with Official Rulings and Commentary (current as at April 2021), Law 29.2.6; https://worldcroquet.org/wp-content/uploads/2021/04/Laws-Rulings-Commentary-combined-published-master-.pdf",
    "provenance": "direct",
    "note": "Limits 29.1.6.3, which is not judged yet."
},
"29.2.7": {
    "quote": "The mallet being in contact with the striker’s ball after the striker’s ball has hit another ball is a fault under Law 29.1.7 if the continuation of contact is visible or audible to the striker or a referee or other person asked to adjudicate the stroke, aided by nothing more than spectacles, contact lenses or hearing aids, or if it can be deduced from observation of the trajectories and speeds of the balls involved compared to what would occur in a lawful stroke of the same type.",
    "source": "World Croquet Federation, The Laws of Association Croquet, 7th Edition (February 2021), with Official Rulings and Commentary (current as at April 2021), Law 29.2.7; https://worldcroquet.org/wp-content/uploads/2021/04/Laws-Rulings-Commentary-combined-published-master-.pdf",
    "provenance": "direct",
    "note": "Makes 29.1.7 a possible fault; the finding carries how long the mallet contact lasted before and after the hit."
},
"groupOfBalls": {
    "quote": "Either a 3-ball group or a 4-ball group. A 3-ball group is formed by one ball being in contact with two other balls. A 4-ball group is formed by the fourth ball being in contact with a 3-ball group.",
    "source": "World Croquet Federation, The Laws of Association Croquet, 7th Edition (February 2021), with Official Rulings and Commentary (current as at April 2021), Glossary, 'Group of balls' (with Law 18.4); https://worldcroquet.org/wp-content/uploads/2021/04/Laws-Rulings-Commentary-combined-published-master-.pdf",
    "provenance": "direct",
    "note": "Decides StrokeContext.group (29.2.3.3). The caller supplies it; P2b.2b's simulateShot derives it from the setup, contact being within CONTACT_TOLERANCE. A croquet stroke's two touching balls alone are not a group."
}
```

- [ ] **Step 5: Expose them in `src/reference/index.ts`**

Add `contactReference.ballObstacleContactTime: readValue(contactJson, "ballObstacleContactTime", "contact"),` after
`ballBallContactTime`. Above `lawsReference`, add:

```ts
/** Law 29 (faults) and the Glossary entries the fault judge relies on, keyed by Law number (reference/laws.json). */
export const FAULT_LAW_KEYS = [
    "29.1.5",
    "29.1.6.1",
    "29.1.6.2",
    "29.1.6.3",
    "29.1.7",
    "29.1.8",
    "29.1.9",
    "29.1.11",
    "29.1.13",
    "29.2.3",
    "29.2.4",
    "29.2.5",
    "29.2.6",
    "29.2.7",
    "groupOfBalls",
] as const;

/** A key of `lawsReference.faults`. */
export type FaultLawKey = (typeof FAULT_LAW_KEYS)[number];

function readFaultLaws(section: unknown): Readonly<Record<FaultLawKey, ReferenceQuote>> {
    return Object.fromEntries(FAULT_LAW_KEYS.map((key) => [key, readQuote(section, key, "laws")])) as Record<
        FaultLawKey,
        ReferenceQuote
    >;
}
```

and add `faults: readFaultLaws(lawsJson),` to `lawsReference`, whose comment becomes "Laws expressed as signed-offset
thresholds, and the quoted Laws of the fault judge."

- [ ] **Step 6: Document the keys in `reference/README.md`**

After the "Offset rule" bullet, add:

```markdown
- **Fault law** (laws.json): a quote keyed by its Law number (`"29.1.8"`) or Glossary entry (`"groupOfBalls"`), the
  text the fault judge (`src/engine/faults.ts`) applies.
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/reference/`
Expected: PASS.

- [ ] **Step 8: Format, check, commit**

Run `npx prettier --write reference/contact.json reference/laws.json src/reference/index.ts
tests/reference/reference.test.ts`, then the four checks.

```bash
git add reference/contact.json reference/laws.json reference/README.md src/reference/index.ts tests/reference/reference.test.ts
git commit -F "$CLAUDE_TEMP_DIR/msg.txt"   # "Source the obstacle contact time and quote Law 29"
```

---

### Task 3: Obstacle contact times in the world

Every hoop and the peg carry their own impact contact time (spec §3, §4), so hoop setting stiffness can later vary hoop
by hoop. Phase 2 ignores the field and stays bit-identical.

**Files:**
- Modify: `src/engine/types.ts` (`Cylinder`, `Hoop`), `src/engine/world.ts` (`uprightsOf`, `validateWorld`,
  `defaultWorld`)
- Modify: `tests/engine/support/fixtures.ts`, `tests/engine/crossCheck.test.ts`
- Test: `tests/engine/world.test.ts`

**Interfaces:**
- Consumes: `contactReference.ballObstacleContactTime` (Task 2).
- Produces:
  - `Cylinder.contactTime: number` and `Hoop.contactTime: number` (s);
  - `hoopWithUprightAt(id: string, x: number, y: number): Hoop` (fixtures): a test hoop whose upright `<id>/a` stands
    at (x, y).

- [ ] **Step 1: Write the failing tests**

In `tests/engine/world.test.ts`, add `contactReference` (from `../../src/reference/index`) and `hoopWithUprightAt`
(from `./support/fixtures`) to the imports. In "hoops and obstacles", add:

```ts
    it("gives both uprights their hoop's impact contact time", () => {
        const hoop = { ...testHoop("1", 10, 10), contactTime: 1.2e-3 };
        const [a, b] = uprightsOf(hoop, { restitution: 0.5, friction: 0.1 });
        expect(a.contactTime).toBe(1.2e-3);
        expect(b.contactTime).toBe(1.2e-3);
    });

    it("places a hoop by its first upright", () => {
        const [a] = uprightsOf(hoopWithUprightAt("1", 7, 8), { restitution: 0.5, friction: 0.1 });
        expect(length(sub(a.centre, vec3(7, 8, 0)))).toBeLessThan(1e-14);
    });
```

Add two cases to the `validateWorld` rejection table:

```ts
        ["non-positive hoop contact time", { hoops: [{ ...testHoop("1", 5, 5), contactTime: 0 }] }],
        ["non-positive peg contact time", { peg: { ...testWorld().peg, contactTime: -1 } }],
```

In "defaultWorld" › "builds a valid world from the reference data", add:

```ts
        const T = contactReference.ballObstacleContactTime.value;
        expect(world.hoops.every((h) => h.contactTime === T)).toBe(true);
        expect(world.peg.contactTime).toBe(T);
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/engine/world.test.ts`
Expected: FAIL, 5 tests (runtime: `contactTime` undefined on the uprights and the default world, `hoopWithUprightAt
is not a function`, the two new rejections do not throw). `npm run check` shows the type errors.

- [ ] **Step 3: Add the field to the types**

In `src/engine/types.ts`, replace `Cylinder` and add the field to `Hoop`:

```ts
/**
 * A fixed vertical cylinder: a hoop upright or the peg. `contactTime` (s) is the duration of a central strike in the
 * impact, which with `material.restitution` sets that contact's stiffness; phase 2 ignores it.
 */
export interface Cylinder {
    readonly id: string;
    readonly centre: Vec3;
    readonly radius: number;
    readonly material: ContactMaterial;
    readonly contactTime: number;
}
```

```ts
    /** Height (m) of the underside of the crown above the lawn. */
    readonly crownClearance: number;
    /**
     * Duration (s) of a central ball–upright strike in the impact, copied to both uprights. Per hoop, so that hoop
     * setting stiffness can vary hoop by hoop or by lawn.
     */
    readonly contactTime: number;
```

- [ ] **Step 4: Copy, check and fill it in `src/engine/world.ts`**

In `uprightsOf`, give both cylinders `contactTime: hoop.contactTime` (after `material`; Prettier then puts each
literal on its own lines). In `validateWorld`, after the
`peg.radius` check add `requirePositive(world.peg.contactTime, "peg.contactTime");` and inside the hoop loop add
`requirePositive(hoop.contactTime, \`hoop ${hoop.id} contactTime\`);`. In `defaultWorld`, add
`contactTime: contactReference.ballObstacleContactTime.value,` to each hoop (after `crownClearance`) and to the peg
(after `material`).

- [ ] **Step 5: Update the fixtures**

In `tests/engine/support/fixtures.ts`:
- the test world's peg gains `contactTime: 7e-4`;
- `testHoop` gains `contactTime: 7e-4` (after `crownClearance`);
- add, importing `hoopHalfSpan` and `hoopLateral` from `world.ts` and `add`, `scale` from `vec3.ts`:

```ts
/** A test hoop placed so that its upright `<id>/a` stands at (x, y). */
export function hoopWithUprightAt(id: string, x: number, y: number): Hoop {
    const hoop = testHoop(id, 0, 0);
    const centre = add(vec3(x, y, 0), scale(hoopLateral(hoop), -hoopHalfSpan(hoop)));
    return { ...hoop, centre };
}
```

In `tests/engine/crossCheck.test.ts`, `upright()` returns `contactTime: 7e-4` after `material`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/world.test.ts`
Expected: PASS. Then `npm test`: PASS.

- [ ] **Step 7: Verify phase 2 is unchanged**

Run: `npx --yes tsx scripts/shotMix.ts`
Expected: work units p99 143,084, p99.9 362,050, max 408,030.
Run: `SLOW_TESTS=1 npm test`
Expected: PASS.

- [ ] **Step 8: Format, check, commit**

```bash
git add src/engine/types.ts src/engine/world.ts tests/engine/support/fixtures.ts tests/engine/crossCheck.test.ts tests/engine/world.test.ts
git commit -F "$CLAUDE_TEMP_DIR/msg.txt"   # "Give every hoop and the peg an impact contact time"
```

---

### Task 4: Obstacle geometry and pair keys

The obstacle is an infinite vertical cylinder (spec §4). This task adds the pair kind, its keys and geometry, the
zero-gap placement, the touching test and the face clearance the timeline needs. Nothing calls them yet, but the new
pair kind makes `lawOf`'s switch in `integrate.ts` non-exhaustive, so this task adds a placeholder case there that
throws; nothing produces a ball–obstacle pair until Task 5, which replaces it with the obstacle's law.

**Files:**
- Modify: `src/engine/impact/contacts.ts`, `src/engine/impact/integrate.ts` (`lawOf` placeholder)
- Test: `tests/engine/impact/contacts.test.ts`

**Interfaces:**
- Consumes: `CONTACT_TOLERANCE` (`src/engine/detect.ts`).
- Produces (all in `contacts.ts`):
  - `type PairKind = "face-ball" | "ball-ball" | "ball-turf" | "ball-obstacle"`; for a `ball-obstacle` pair, `a` is
    the obstacle's index;
  - `interface ObstacleGeometry { readonly id: string; readonly centre: Vec3; readonly radius: number }` (a `Cylinder`
    satisfies it);
  - `faceKey(ball: BallId): string` → `"face/<ball>"`; `ballPairKey(a: BallId, b: BallId): string` →
    `"<earlier>/<later>"` in `BALL_IDS` order; `obstacleKey(ball: BallId, obstacleId: string): string` →
    `"<ball>@<id>"`;
  - `pairList(ids, turf, obstacles: readonly string[] = []): Pair[]`;
  - `obstacleContact(centre: Vec3, radius: number, obstacle: ObstacleGeometry): Penetration | null`;
  - `outsideObstacle(centre: Vec3, radius: number, obstacle: ObstacleGeometry): Vec3`;
  - `pairContact(pair, state, head, balls, radius, obstacles: readonly ObstacleGeometry[] = [])`;
  - `pairTouching(pair: Pair, balls: readonly BallState[], radius: number, obstacles: readonly ObstacleGeometry[]):
    boolean`;
  - `faceClearance(state: HeadState, head: MalletHead, centre: Vec3, radius: number): number`.

- [ ] **Step 1: Write the failing tests**

In `tests/engine/impact/contacts.test.ts`, add `horizontal` to the vec3 import, `CONTACT_TOLERANCE` from
`../../../src/engine/detect`, and `ballPairKey`, `faceClearance`, `faceKey`, `obstacleContact`, `obstacleKey`,
`outsideObstacle`, `pairTouching`, `type ObstacleGeometry` to the contacts import. Add:

```ts
const POST: ObstacleGeometry = { id: "1/a", centre: vec3(1, 2, 0), radius: 0.008 };

describe("pair keys", () => {
    it("names each pair as the pair list does", () => {
        expect(faceKey("red")).toBe("face/red");
        expect(ballPairKey("yellow", "blue")).toBe("blue/yellow");
        expect(ballPairKey("blue", "yellow")).toBe("blue/yellow");
        expect(obstacleKey("red", "1/a")).toBe("red@1/a");
    });

    it("appends ball–obstacle pairs after the turf, ball by ball, obstacles in order", () => {
        const pairs = pairList(["blue", "red"], [true, true], ["1/a", "peg"]);
        expect(pairs.map((p) => p.key).slice(4)).toEqual(["turf/red", "blue@1/a", "blue@peg", "red@1/a", "red@peg"]);
        expect(pairs.slice(5).map((p) => [p.kind, p.a, p.b])).toEqual([
            ["ball-obstacle", 0, 0],
            ["ball-obstacle", 1, 0],
            ["ball-obstacle", 0, 1],
            ["ball-obstacle", 1, 1],
        ]);
    });
});

describe("obstacleContact", () => {
    it("closes horizontally, whatever the ball's height, with the point δ/2 inside the ball", () => {
        const c = obstacleContact(vec3(1 - R - 0.008 + 1e-4, 2, 0.3), R, POST) as Penetration;
        expect(length(sub(c.normal, vec3(-1, 0, 0)))).toBeLessThan(1e-15);
        expect(c.depth).toBeCloseTo(1e-4, 12);
        expect(c.point.x).toBeCloseTo(1 - 0.008 + 5e-5, 12);
        expect(c.point.z).toBe(0.3);
    });

    it("is open at or beyond R + r", () => {
        expect(obstacleContact(vec3(1, 2 + R + 0.008 + 1e-12, R), R, POST)).toBeNull();
        expect(obstacleContact(vec3(1, 2 + R + 0.009, R), R, POST)).toBeNull();
    });

    it("rejects a centre on the axis, which has no normal", () => {
        expect(() => obstacleContact(vec3(1, 2, R), R, POST)).toThrow(RangeError);
    });
});

describe("outsideObstacle", () => {
    it("moves an overlapping ball horizontally out to a penetration of at most zero, exactly", () => {
        const centre = vec3(1 - R - 0.008 + 5e-10, 2, 0.04);
        const out = outsideObstacle(centre, R, POST);
        expect(obstacleContact(out, R, POST)).toBeNull();
        expect(R + 0.008 - length(horizontal(sub(out, POST.centre)))).toBeLessThanOrEqual(0);
        expect(Math.abs(out.x - centre.x)).toBeLessThanOrEqual(CONTACT_TOLERANCE);
        expect(out.y).toBe(centre.y);
        expect(out.z).toBe(centre.z);
    });

    it("returns a ball already clear as it is", () => {
        const centre = vec3(1 - R - 0.008 - 1e-6, 2, R);
        expect(outsideObstacle(centre, R, POST)).toBe(centre);
    });

    it("rejects a centre on the axis", () => {
        expect(() => outsideObstacle(vec3(1, 2, R), R, POST)).toThrow(RangeError);
    });

    it("clears an obstacle near 10 m, where rounding the coordinates leaves the zero-gap point inside", () => {
        // The obstacle fuzz's stroke 1084 at a contact time of 4.35e-4 s: rebuilding the zero-gap centre rounds each
        // coordinate to an ulp of about 1.8e-15 m, which an ulp of the 0.054 m reach cannot outgrow.
        const upright: ObstacleGeometry = {
            id: "1/a",
            centre: vec3(9.994171732064325, 9.893448694383892, 0),
            radius: 0.008,
        };
        const centre = vec3(10.045430749591583, 9.910421543349976, 0.04602418280255443);
        const out = outsideObstacle(centre, R, upright);
        const distance = length(horizontal(sub(out, upright.centre)));
        expect(obstacleContact(out, R, upright)).toBeNull();
        expect(R + 0.008 - distance).toBeLessThanOrEqual(0);
        expect(distance - (R + 0.008)).toBeLessThan(8 * Number.EPSILON * 10);
        expect(out.z).toBe(centre.z);
    });
});

describe("pairTouching", () => {
    const pairs = pairList(["blue", "red"], [true, true], ["1/a"]);
    const byKey = (key: string) => pairs.find((p) => p.key === key) as (typeof pairs)[number];
    const at = (x: number, y: number): BallState => ({
        position: vec3(x, y, R),
        velocity: ZERO,
        angularVelocity: ZERO,
    });

    it("counts a ball–ball or ball–obstacle gap within CONTACT_TOLERANCE as touching", () => {
        const balls = [at(1 - R - 0.008 - 5e-10, 2), at(1 - R - 0.008 - 5e-10 - 2 * R, 2)];
        expect(pairTouching(byKey("blue/red"), balls, R, [POST])).toBe(true);
        expect(pairTouching(byKey("blue@1/a"), balls, R, [POST])).toBe(true);
        expect(pairTouching(byKey("red@1/a"), balls, R, [POST])).toBe(false);
    });

    it("does not count a gap of twice the tolerance, nor face or turf pairs", () => {
        const balls = [at(1 - R - 0.008 - 2e-9, 2), at(5, 5)];
        expect(pairTouching(byKey("blue@1/a"), balls, R, [POST])).toBe(false);
        expect(pairTouching(byKey("face/blue"), balls, R, [POST])).toBe(false);
        expect(pairTouching(byKey("turf/blue"), balls, R, [POST])).toBe(false);
    });
});

describe("faceClearance", () => {
    it("is the ball's separation from the nearer face plane", () => {
        expect(faceClearance(headAt(0), HEAD, vec3(R + 1e-3, 0, 0.1), R)).toBeCloseTo(1e-3, 15);
        expect(faceClearance(headAt(0), HEAD, vec3(R - 1e-4, 0, 0.1), R)).toBeCloseTo(-1e-4, 15);
        expect(faceClearance(headAt(0), HEAD, vec3(-0.2 - R - 2e-3, 0, 0.1), R)).toBeCloseTo(2e-3, 15);
    });
});
```

In "pairContact" › "routes each pair kind…", pass obstacles and expect the obstacle pairs too: build the pairs with
`pairList(["blue", "red"], [true, true], ["1/a"])`, call `pairContact(p, state, HEAD, balls, R, [far])` with
`const far: ObstacleGeometry = { id: "1/a", centre: vec3(R - 1e-4 + R + 0.008 - 1e-5, 0, 0), radius: 0.008 };` (blue
overlaps it by 1e-5), and add to the expected object `"blue@1/a": obstacleContact(p0.position, R, far)` and
`"red@1/a": obstacleContact(p1.position, R, far)`, plus `expect(byKey["blue@1/a"]).not.toBeNull();`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/engine/impact/contacts.test.ts`
Expected: FAIL, every new test (runtime: the new exports are undefined, `… is not a function`).

- [ ] **Step 3: Implement**

In `src/engine/impact/contacts.ts`:

Replace the header's last sentence ("Ball–upright and ball–peg pairs are a further kind, deferred (design §11).") with
"The ball–obstacle pair (P2b.2a design §4) acts from a hoop upright or the peg, an immovable vertical cylinder, along
the horizontal normal from its axis to the ball's centre." Change the imports:

```ts
import { CONTACT_TOLERANCE } from "../detect";
import { add, cross, dot, horizontal, length, scale, sub, vec3, type Vec3 } from "../math/vec3";
import { BALL_IDS, type BallId, type BallState } from "../types";
```

Replace `PairKind`, the `Pair` comment and `pairList`, and add the keys and `ObstacleGeometry`:

```ts
/** The kinds of pair, in the order the pair list holds them. */
export type PairKind = "face-ball" | "ball-ball" | "ball-turf" | "ball-obstacle";

/**
 * One pair. `b` indexes the impact's balls. `a` indexes them too for a ball–ball pair, indexes the obstacles for a
 * ball–obstacle pair, and is −1 for the face or the turf.
 */
export interface Pair {
    readonly kind: PairKind;
    readonly key: string;
    readonly a: number;
    readonly b: number;
}

/** A fixed vertical cylinder as the impact's geometry sees it (a Cylinder satisfies it). */
export interface ObstacleGeometry {
    readonly id: string;
    readonly centre: Vec3;
    readonly radius: number;
}

/** Key of the face–ball pair of `ball`. */
export function faceKey(ball: BallId): string {
    return `face/${ball}`;
}

/** Key of the pair of balls `a` and `b`: the earlier in BALL_IDS order first. */
export function ballPairKey(a: BallId, b: BallId): string {
    return BALL_IDS.indexOf(a) < BALL_IDS.indexOf(b) ? `${a}/${b}` : `${b}/${a}`;
}

/** Key of the pair of `ball` and obstacle `obstacleId`. */
export function obstacleKey(ball: BallId, obstacleId: string): string {
    return `${ball}@${obstacleId}`;
}

/**
 * The pair list in its fixed order: face–ball, then ball–ball, then ball–turf, each in ball order (`ids` are in
 * BALL_IDS order), then ball–obstacle, ball by ball, `obstacles` (ids, in obstaclesOf order) within each ball. A ball
 * has a turf pair only where `turf` says so (isolated test cases leave the turf out).
 */
export function pairList(ids: readonly BallId[], turf: readonly boolean[], obstacles: readonly string[] = []): Pair[] {
    const pairs: Pair[] = ids.map((id, b): Pair => ({ kind: "face-ball", key: faceKey(id), a: -1, b }));
    ids.forEach((first, a) => {
        for (let b = a + 1; b < ids.length; b++) {
            pairs.push({ kind: "ball-ball", key: ballPairKey(first, ids[b] as BallId), a, b });
        }
    });
    ids.forEach((id, b) => {
        if (turf[b]) {
            pairs.push({ kind: "ball-turf", key: `turf/${id}`, a: -1, b });
        }
    });
    ids.forEach((id, b) => {
        obstacles.forEach((obstacle, a) => {
            pairs.push({ kind: "ball-obstacle", key: obstacleKey(id, obstacle), a, b });
        });
    });
    return pairs;
}
```

After `turfContact`, add:

```ts
/**
 * The contact of `obstacle` with a ball centred at `centre`, or null while they are at least R + r apart
 * horizontally. The obstacle is an infinite vertical cylinder (a ball above a crown is phase 2's jump flag), so the
 * normal is horizontal whatever the ball's height. A centre on the axis has no normal and throws a RangeError.
 */
export function obstacleContact(centre: Vec3, radius: number, obstacle: ObstacleGeometry): Penetration | null {
    const offset = horizontal(sub(centre, obstacle.centre));
    const distance = length(offset);
    const depth = radius + obstacle.radius - distance;
    if (!(depth > 0)) {
        return null;
    }
    if (distance === 0) {
        throw new RangeError(`ball–obstacle contact with a centre on the axis of ${obstacle.id} has no normal`);
    }
    const normal = scale(offset, 1 / distance);
    return { normal, depth, point: sub(centre, scale(normal, radius - depth / 2)) };
}

/**
 * Bound on outsideObstacle's corrections. Numerical, not physical. Each correction lengthens the target distance by
 * step = ε·(max(|x|, |y|) of the obstacle's centre + R + r), at least an ulp of every rebuilt coordinate. The
 * rounding of the rebuilt centre is under one step, apart from a few ulps of R + r (from f, offset·f, the squared sum
 * and the square root), which matter only for an obstacle near the origin. A correction or two clears it, and the rest
 * are spare.
 */
const OUTSIDE_STEPS = 4;

/**
 * `centre` moved horizontally outward from `obstacle` until its penetration R + r − d is at most zero, as
 * obstacleContact computes it; or `centre` itself when it already is (P2b.2a design §4, §6). The target distance grows
 * by about an ulp of the coordinates per correction, until rounding them no longer leaves the ball inside, so the ball
 * ends at most a few such ulps beyond zero gap. Throws a RangeError for a centre on the axis (no outward direction),
 * and an Error if the corrections run out.
 */
export function outsideObstacle(centre: Vec3, radius: number, obstacle: ObstacleGeometry): Vec3 {
    const offset = horizontal(sub(centre, obstacle.centre));
    const distance = length(offset);
    const reach = radius + obstacle.radius;
    if (!(reach - distance > 0)) {
        return centre;
    }
    if (distance === 0) {
        throw new RangeError(`a ball centred on the axis of ${obstacle.id} has no outward direction`);
    }
    const step = Number.EPSILON * (Math.max(Math.abs(obstacle.centre.x), Math.abs(obstacle.centre.y)) + reach);
    let target = reach;
    for (let i = 0; i < OUTSIDE_STEPS; i++) {
        const f = target / distance;
        const moved = vec3(obstacle.centre.x + offset.x * f, obstacle.centre.y + offset.y * f, centre.z);
        if (!(reach - length(horizontal(sub(moved, obstacle.centre))) > 0)) {
            return moved;
        }
        target += step;
    }
    throw new Error(`could not place a ball outside ${obstacle.id}`);
}
```

Replace `pairContact`:

```ts
/** The contact of `pair` in the current state, OFF_FACE, or null while it is open. */
export function pairContact(
    pair: Pair,
    state: HeadState,
    head: MalletHead,
    balls: readonly BallState[],
    radius: number,
    obstacles: readonly ObstacleGeometry[] = [],
): Penetration | typeof OFF_FACE | null {
    const centre = (balls[pair.b] as BallState).position;
    switch (pair.kind) {
        case "face-ball":
            return faceContact(state, head, centre, radius);
        case "ball-ball":
            return ballBallContact((balls[pair.a] as BallState).position, centre, radius);
        case "ball-turf":
            return turfContact(centre, radius);
        case "ball-obstacle":
            return obstacleContact(centre, radius, obstacles[pair.a] as ObstacleGeometry);
    }
}

/**
 * True when ball–ball or ball–obstacle `pair` is touching, its gap within CONTACT_TOLERANCE, in `balls` (P2b.2a design
 * §3, `touchingAtStart`); always false for face–ball and ball–turf pairs.
 */
export function pairTouching(
    pair: Pair,
    balls: readonly BallState[],
    radius: number,
    obstacles: readonly ObstacleGeometry[],
): boolean {
    const centre = (balls[pair.b] as BallState).position;
    if (pair.kind === "ball-ball") {
        return length(sub(centre, (balls[pair.a] as BallState).position)) - 2 * radius <= CONTACT_TOLERANCE;
    }
    if (pair.kind === "ball-obstacle") {
        const o = obstacles[pair.a] as ObstacleGeometry;
        return length(horizontal(sub(centre, o.centre))) - radius - o.radius <= CONTACT_TOLERANCE;
    }
    return false;
}
```

After `faceContact`, add:

```ts
/**
 * Separation (m) of a ball centred at `centre` from the head's faces: d − R for the nearer face plane, d being the
 * centre's signed distance from a face plane along its outward normal, the larger of the two faces' (P2b.2a design §5,
 * `clearanceAfter`). Negative while the ball reaches into that plane.
 */
export function faceClearance(state: HeadState, head: MalletHead, centre: Vec3, radius: number): number {
    const front = faceOf(state, head, 1);
    const back = faceOf(state, head, -1);
    const d = Math.max(dot(sub(centre, front.centre), front.normal), dot(sub(centre, back.centre), back.normal));
    return d - radius;
}
```

In `src/engine/impact/integrate.ts`, `lawOf`'s switch gains a placeholder case, after `ball-turf`, so that it stays
exhaustive (`npm run check` fails without it). Task 5 replaces it:

```ts
        case "ball-obstacle":
            throw new Error("ball–obstacle pairs have no contact law yet");
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/impact/contacts.test.ts`
Expected: PASS. Then `npm test`: PASS (`pairList`'s existing keys are unchanged).

- [ ] **Step 5: Format, check, commit**

```bash
git add src/engine/impact/contacts.ts src/engine/impact/integrate.ts tests/engine/impact/contacts.test.ts
git commit -F "$CLAUDE_TEMP_DIR/msg.txt"   # "Add ball–obstacle pair geometry and pair keys"
```

---

### Task 5: Obstacle pairs in the integrator

Every ball is paired with every obstacle (spec §4). The obstacle is immovable: the pair's force acts on the ball only,
and its relative velocity is the ball's contact-point velocity. Obstacle pairs are hard pairs for `RELEASE_STEPS`,
which `hardClosed` (`pair.kind !== "ball-turf"`) already gives them. A pair that never closes touches no sum, so P2b.1
stays bit-identical.

**Files:**
- Modify: `src/engine/impact/integrate.ts`, `src/engine/impact/simulateImpact.ts` (`prepareImpact`)
- Modify: `tests/engine/support/impact.ts` (`isolated`)
- Test: `tests/engine/impact/analytic.test.ts`

**Interfaces:**
- Consumes: Task 4's `pairList`, `pairContact`, `ObstacleGeometry`; Task 3's `Cylinder.contactTime`.
- Produces:
  - `interface ImpactObstacle extends ObstacleGeometry { readonly law: PairLaw }` (integrate.ts);
  - `ImpactSetup.obstacles: readonly ImpactObstacle[]`, in `obstaclesOf` order;
  - `prepareImpact` fills it, each law `lawFromContactTime(ball.mass, o.material.restitution, o.contactTime,
    o.material.friction)`.

- [ ] **Step 1: Write the failing tests**

In `tests/engine/impact/analytic.test.ts`, add imports: `type ImpactObstacle` from `integrate`, `prepareImpact` from
`../../../src/engine/impact/simulateImpact`, `type PairLaw` from `contactLaw`, `type BallState` from
`../../../src/engine/types`, and `ballAt`, `testWorld`, `hoopWithUprightAt` from `../support/fixtures`, `strike` from
`../support/impact`. Append:

```ts
describe("a ball against a fixed obstacle", () => {
    const post = (law: PairLaw, radius = 0.008): ImpactObstacle => ({ id: "post", centre: vec3(0, 0, 0), radius, law });

    it("head-on into an upright: the obstacle's contact time and restitution", () => {
        const e = 0.6;
        const T = 7e-4;
        const probe = counter("blue@post");
        const run = integrate(
            isolated({
                obstacles: [post(lawFromContactTime(M, e, T, 0))],
                balls: [freeBall("blue", vec3(-(R + 0.008 + 1e-5), 0, 1), vec3(1, 0, 0))],
            }),
            { dt: FINE, cap: 1e-3, probe },
        );
        // Pre-flight: the contact time is exact here (7,000 closed steps; T/dt is an integer, so by chance), and the
        // restitution is off by 8.98e-5.
        expect(Math.abs(probe.closed * FINE - T) / T).toBeLessThan(LAW_TOLERANCE);
        expect(Math.abs((run.balls.blue?.velocity.x as number) + e) / e).toBeLessThan(LAW_TOLERANCE);
    });

    /**
     * A ball meeting a 10 m cylinder (its normal turns by about 1.4e-4 rad during the contact) at 1 m/s along the
     * normal and `vt` across it. Returns the velocity changes along (negative) and across the normal, and the spin.
     */
    function oblique(vt: number, mu: number): { dvn: number; dvt: number; spin: number } {
        const wall: ImpactObstacle = {
            id: "wall",
            centre: vec3(10 + R + 1e-5, 0, 0),
            radius: 10,
            law: lawFromContactTime(M, 0.6, 7e-4, mu),
        };
        const run = integrate(
            isolated({ obstacles: [wall], balls: [freeBall("blue", vec3(0, 0, 1), vec3(1, vt, 0))] }),
            { dt: FINE, cap: 1e-3 },
        );
        const b = run.balls.blue as BallState;
        return { dvn: b.velocity.x - 1, dvt: b.velocity.y - vt, spin: b.angularVelocity.z };
    }

    // The tangential force acts at R − δ/2 from the centre: Δω_z = (R − δ/2)·m·Δv_t / (2/5·m·R²) ≈ 5·Δv_t/(2R).
    const spinOf = (dvt: number): number => (2.5 * dvt) / R;

    it("slips throughout above the cone: the tangential impulse is μ times the normal one", () => {
        const mu = 0.1;
        const { dvn, dvt, spin } = oblique(2, mu);
        // Pre-flight: the normal's turn shifts the ratio by 6.0e-5, and the spin's lever arm (R − δ/2, not R) is off by
        // 1.005e-3.
        expect(Math.abs(dvt / dvn - mu)).toBeLessThan(2e-4);
        expect(Math.abs(spin - spinOf(dvt)) / Math.abs(spinOf(dvt))).toBeLessThan(2e-3);
    });

    it("sticks inside the cone: the tangential impulse stays below μ times the normal one", () => {
        const mu = 0.1;
        const { dvn, dvt, spin } = oblique(0.2, mu);
        // A sticking contact returns at most 2·(2/7)·v_t = 0.114 m/s; the cone allows μ·1.6 = 0.16. Pre-flight:
        // Δv_t/Δv_n = 0.654·μ, and the spin is off by 1.48e-3 (bound about 2× it).
        expect(dvt).toBeLessThan(0);
        expect(dvt / dvn).toBeLessThan(0.9 * mu);
        expect(Math.abs(spin - spinOf(dvt)) / Math.abs(spinOf(dvt))).toBeLessThan(3e-3);
    });

    it("looks each pair's law up by its own obstacle: two balls against two obstacles of different restitution", () => {
        const wall = (id: string, y: number, e: number): ImpactObstacle => ({
            id,
            centre: vec3(0, y, 0),
            radius: 0.008,
            law: lawFromContactTime(M, e, 7e-4, 0),
        });
        const gap = R + 0.008 + 1e-5;
        const run = integrate(
            isolated({
                obstacles: [wall("p0", 0, 0.6), wall("p1", 1, 0.3)],
                balls: [
                    // Ball 0 meets obstacle 1 and ball 1 meets obstacle 0, so neither index can stand in for the other.
                    freeBall("blue", vec3(-gap, 1, 1), vec3(1, 0, 0)),
                    freeBall("red", vec3(-gap, 0, 1), vec3(1, 0, 0)),
                ],
            }),
            { dt: FINE, cap: 1e-3 },
        );
        expect(Math.abs((run.balls.blue?.velocity.x as number) + 0.3) / 0.3).toBeLessThan(LAW_TOLERANCE);
        expect(Math.abs((run.balls.red?.velocity.x as number) + 0.6) / 0.6).toBeLessThan(LAW_TOLERANCE);
    });

    it("gives each upright its hoop's law and the peg its own (prepareImpact)", () => {
        const base = testWorld();
        const world = testWorld({
            hoops: [{ ...hoopWithUprightAt("1", 8, 8), contactTime: 9e-4 }],
            peg: { ...base.peg, material: { restitution: 0.4, friction: 0.1 } },
        });
        const blue = ballAt(5, 0);
        const setup = prepareImpact(strike(blue.position), { blue }, world);
        expect(setup.obstacles.map((o) => o.id)).toEqual(["1/a", "1/b", "peg"]);
        const upright = lawFromContactTime(M, world.ballUpright.restitution, 9e-4, world.ballUpright.friction);
        expect(setup.obstacles[0]?.law).toEqual(upright);
        expect(setup.obstacles[1]?.law).toEqual(upright);
        const peg = setup.obstacles[2] as ImpactObstacle;
        expect(peg.law).toEqual(lawFromContactTime(M, 0.4, world.peg.contactTime, 0.1));
        const run = integrate(
            isolated({
                obstacles: [{ ...peg, centre: vec3(0, 0, 0) }],
                balls: [freeBall("blue", vec3(-(R + peg.radius + 1e-5), 0, 1), vec3(1, 0, 0))],
            }),
            { dt: FINE, cap: 1e-3 },
        );
        // Pre-flight: off by 1.81e-4 at e = 0.4 (the error grows as e falls); bound about 2× it.
        expect(Math.abs((run.balls.blue?.velocity.x as number) + 0.4) / 0.4).toBeLessThan(4e-4);
    });
});
```

Also replace the `LAW_TOLERANCE` comment (the value stays 3e-4):

```ts
/**
 * Relative tolerance on contact times and restitutions at dt = 1e-7 s. Pre-flight: the worst measured errors are the
 * ball–ball contact time (1.43e-4, one step of 1e-7 s in 7e-4 s) and the obstacle head-on restitution (8.98e-5); the
 * peg case, at e = 0.4, has its own bound.
 */
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/engine/impact/analytic.test.ts`
Expected: FAIL, 5 tests (runtime: `setup.obstacles` is undefined, and `isolated` ignores `obstacles`, so no ball
rebounds). `npm run check` shows the type errors.

- [ ] **Step 3: Implement in `integrate.ts`**

In the header, the paragraph ending "…exactly mirrored results." and the termination paragraph become:

```ts
 * Bodies and pairs are visited in a fixed order and forces summed in it, so repeated runs are bit-identical, and
 * set-ups mirrored across a vertical plane give exactly mirrored results. Obstacles (hoop uprights and the peg) are
 * immovable: a ball–obstacle pair's force acts on the ball alone.
 *
 * The impact ends once a face–ball contact has closed, the drive window has closed, no face–ball, ball–ball or
 * ball–obstacle contact has been closed for RELEASE_STEPS steps, and no ball in turf contact is still bouncing in it;
 * or at the cap. A ball bounces while its vertical oscillation energy about the static sink δ₀ = m·g/k,
 * ½·m·v_z² + ½·k·(δ − δ₀)², exceeds the static spring's ½·k·δ₀²: it will reach δ = 0 and leave the turf, so the
 * turf's rebound, which dominates lift, is integrated rather than discarded at handover. Below that the ball only
 * settles in its hollow, and the handover discards at most m·g·δ₀/2 (design §6). Isolated set-ups (tests) may give
 * balls any state and leave the turf out; simulateImpact.ts prepares and validates real ones.
```

The `RELEASE_STEPS` comment becomes:

```ts
/**
 * Consecutive steps without a closed face–ball, ball–ball or ball–obstacle contact after which the impact may
 * end. A numerical allowance for a contact to re-close (a croquet stroke's balls part and meet again), not physical.
 * Pre-flight: ×4 moves no ball's state 50 ms after the strike by more than 2.8e-4 of the head speed.
 */
```

Import `type ObstacleGeometry` from `./contacts`. After `ImpactBall`, add:

```ts
/** A fixed obstacle in the impact: its geometry and its ball–obstacle law (P2b.2a design §4). */
export interface ImpactObstacle extends ObstacleGeometry {
    readonly law: PairLaw;
}
```

In `ImpactSetup`, after `balls`, add:

```ts
    /** Hoop uprights, then the peg (obstaclesOf order); every ball is paired with each. */
    readonly obstacles: readonly ImpactObstacle[];
```

In `lawOf`, replace Task 4's placeholder case with:

```ts
        case "ball-obstacle":
            return (setup.obstacles[pair.a] as ImpactObstacle).law;
```

In `applyPair`, extend the comment on `u`: "(the turf's and an obstacle's are zero)". The reaction branches already
skip obstacles (only the face and a ball–ball pair's ball A take one); no code change.

In `integrate`, build the pair list with the obstacles, and pass them to `pairContact`:

```ts
    const pairs: PairState[] = pairList(
        ids,
        hasTurf,
        setup.obstacles.map((o) => o.id),
    ).map((pair) => ({
        pair,
        law: lawOf(setup, pair),
        spring: ZERO,
        peak: 0,
    }));
```

```ts
            const contact = pairContact(pair, state, head, balls, R, setup.obstacles);
```

- [ ] **Step 4: Fill the obstacles in `prepareImpact`**

In `simulateImpact.ts`, before `return`, add `const obstacles = obstaclesOf(world);` and, after `balls: entries,`:

```ts
        obstacles: obstacles.map((o) => ({
            id: o.id,
            centre: o.centre,
            radius: o.radius,
            law: lawFromContactTime(ball.mass, o.material.restitution, o.contactTime, o.material.friction),
        })),
```

Its file header becomes:

```ts
/**
 * Phase 1 of a shot (P2b.1 design §3). Checks the ContactState and the balls. Solves every contact law once: face–ball
 * and ball–ball once, ball–turf once per ball from the surface where it lies. Starts each ball at its static turf sink
 * m·g/k_turf, so that the impact does not open with a spurious bounce. Each obstacle's law is solved once: the ball's
 * mass (the obstacle is immovable), the obstacle's material and its own contact time. Integrates the impact and hands
 * the balls over to phase 2.
 */
```

- [ ] **Step 5: `isolated` gains no obstacles**

In `tests/engine/support/impact.ts`, `isolated` adds `obstacles: [],` after `balls: [],`, and its comment reads
"…gravity off, the test face and test ball–ball laws, no balls and no obstacles."

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/impact/`
Expected: PASS. Then `npm test`: PASS.

- [ ] **Step 7: Verify bit-identity**

Run: `npx --yes tsx scripts/impactDigest.ts > "$CLAUDE_TEMP_DIR/digest-5.txt"`
Run: `cmp "$CLAUDE_TEMP_DIR/digest-base.txt" "$CLAUDE_TEMP_DIR/digest-5.txt"`
Expected: no output.

- [ ] **Step 8: Format, check, commit**

```bash
git add src/engine/impact/integrate.ts src/engine/impact/simulateImpact.ts tests/engine/support/impact.ts tests/engine/impact/analytic.test.ts
git commit -F "$CLAUDE_TEMP_DIR/msg.txt"   # "Pair every ball with every obstacle in the impact"
```

---

### Task 6: The contact timeline

The integrator records, per pair, the intervals in which it was in contact (spec §5), and which pairs touched at t = 0
(§3). A face–ball pair at the rim (`OFF_FACE`) is in contact, adding no force as before, so a contact crossing the rim
stays one interval. Recording reads the state only, so P2b.1's numbers stay bit-identical.

**Files:**
- Create: `src/engine/impact/timeline.ts`
- Modify: `src/engine/impact/types.ts`, `src/engine/impact/integrate.ts`, `scripts/impactDigest.ts`
- Test: `tests/engine/impact/timeline.test.ts`

**Interfaces:**
- Consumes: Task 4's `faceClearance`, `pairTouching`; Task 5's `ImpactObstacle`.
- Produces:
  - `interface ContactInterval { readonly start: number; readonly end: number; readonly peakForce: number; readonly
    clearanceAfter?: number }` (impact/types.ts);
  - `ImpactRun.timeline: Readonly<Record<string, readonly ContactInterval[]>>`: only pairs that were in contact, keys
    in pair-list order;
  - `ImpactRun.touchingAtStart: readonly string[]`: in pair-list order;
  - timeline.ts: `interface PairTimeline`, `emptyTimeline()`, `recordStep(line, inContact, force, t)`,
    `noteClearance(line, clearance)`, `inGap(line)`, `closeTimeline(line, duration)`.

- [ ] **Step 1: Write the failing tests**

Create `tests/engine/impact/timeline.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ZERO, vec3 } from "../../../src/engine/math/vec3";
import { lawFromContactTime, lawFromStiffness } from "../../../src/engine/impact/contactLaw";
import { faceClearance } from "../../../src/engine/impact/contacts";
import { IMPACT_DT, integrate, type ImpactObstacle, type ImpactSnapshot } from "../../../src/engine/impact/integrate";
import { IDENTITY } from "../../../src/engine/impact/rigidBody";
import { closeTimeline, emptyTimeline, inGap, noteClearance, recordStep } from "../../../src/engine/impact/timeline";
import type { ContactInterval, HeadState } from "../../../src/engine/impact/types";
import type { BallState } from "../../../src/engine/types";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import { TEST_BALL } from "../support/fixtures";
import { TEST_FACE, TEST_HEAD, faceLaw, freeBall, isolated, recorder } from "../support/impact";

const R = TEST_BALL.radius;
const M = TEST_BALL.mass;

describe("the timeline recorder", () => {
    it("opens at a step's start, ends at the first step out of contact and keeps the largest force", () => {
        const line = emptyTimeline();
        recordStep(line, false, 0, 0);
        recordStep(line, true, 5, 1e-5);
        recordStep(line, true, 9, 2e-5);
        recordStep(line, true, 0, 3e-5);
        recordStep(line, false, 0, 4e-5);
        expect(closeTimeline(line, 1e-4)).toEqual([{ start: 1e-5, end: 4e-5, peakForce: 9 }]);
    });

    it("gives the interval before a gap that gap's largest clearance once the next interval opens", () => {
        const line = emptyTimeline();
        recordStep(line, true, 1, 0);
        recordStep(line, false, 0, 1e-5);
        expect(inGap(line)).toBe(true);
        noteClearance(line, 1e-4);
        noteClearance(line, 3e-4);
        noteClearance(line, 2e-4);
        recordStep(line, true, 2, 4e-5);
        expect(inGap(line)).toBe(false);
        recordStep(line, false, 0, 5e-5);
        noteClearance(line, 7e-4);
        expect(closeTimeline(line, 1e-4)).toEqual([
            { start: 0, end: 1e-5, peakForce: 1, clearanceAfter: 3e-4 },
            { start: 4e-5, end: 5e-5, peakForce: 2 },
        ]);
    });

    it("counts a single step out of contact as a gap, and ends an open interval at the duration", () => {
        const line = emptyTimeline();
        recordStep(line, true, 1, 0);
        recordStep(line, false, 0, 1e-5);
        recordStep(line, true, 1, 2e-5);
        expect(closeTimeline(line, 3e-5)).toEqual([
            { start: 0, end: 1e-5, peakForce: 1 },
            { start: 2e-5, end: 3e-5, peakForce: 1 },
        ]);
        expect(inGap(emptyTimeline())).toBe(false);
    });
});

describe("the integrator's timeline", () => {
    it("records a double tap off a wall: two face intervals, the wall between them, and the gap's clearance", () => {
        const law = faceLaw({ ...TEST_FACE, friction: 0 });
        const gap = 1.01e-4;
        const start: HeadState = {
            position: vec3(-R - gap - TEST_HEAD.length / 2, 0, 1),
            orientation: IDENTITY,
            velocity: vec3(2, 0, 0),
            angularVelocity: ZERO,
        };
        // 2 mm leaves the first face contact released before the wall closes. Pre-flight: face [55, 680) µs and
        // [1945, 2575) µs, wall [1140, 1930) µs between them, clearance after the first 0.950 mm.
        const wall: ImpactObstacle = {
            id: "wall",
            centre: vec3(R + 2e-3 + 10, 0, 0),
            radius: 10,
            law: lawFromContactTime(M, 0.6, 7e-4, 0),
        };
        const probe = recorder();
        const run = integrate(
            isolated({
                start,
                face: law,
                drive: [
                    { t: 0, force: ZERO },
                    { t: 3e-3, force: ZERO },
                ],
                obstacles: [wall],
                balls: [freeBall("blue", vec3(0, 0, 1))],
            }),
            { probe },
        );
        const faces = run.timeline["face/blue"] ?? [];
        expect(faces).toHaveLength(2);
        const [first, second] = faces as [ContactInterval, ContactInterval];
        // The face plane reaches the ball during step 10 (gap / speed = 10.1 steps): the pair is closed from step 11.
        expect(first.start).toBe(11 * IMPACT_DT);
        // Clamped law: the force releases with δ = c·e·v/k still positive, which then closes at e·v: c/k later.
        // Pre-flight: 4.73 µs off.
        expect(
            Math.abs(first.end - first.start - (TEST_FACE.contactTime + law.damping / law.stiffness)),
        ).toBeLessThanOrEqual(2 * IMPACT_DT);
        expect(first.peakForce).toBeGreaterThan(0);
        const wallFirst = (run.timeline["blue@wall"] ?? [])[0] as ContactInterval;
        expect(wallFirst.start).toBeGreaterThanOrEqual(first.end);
        expect(wallFirst.start).toBeLessThan(second.start);
        // clearanceAfter is the largest d − R over the gap's steps, each read from the state at the step's start:
        // step i starts from the state after step i − 1, snapshot i − 1.
        const clearanceOf = (s: ImpactSnapshot): number =>
            faceClearance(s.head, TEST_HEAD, (s.balls[0] as BallState).position, R);
        let largest = -Infinity;
        for (let i = Math.round(first.end / IMPACT_DT); i < Math.round(second.start / IMPACT_DT); i++) {
            largest = Math.max(largest, clearanceOf(probe.snapshots[i - 1] as ImpactSnapshot));
        }
        expect(first.clearanceAfter).toBe(largest);
        expect(largest).toBeGreaterThan(0);
        expect(largest).toBeLessThan(2e-3);
    });

    it("keeps a contact that crosses the face's rim as one interval, opened at the rim", () => {
        // Blue starts 1 mm outside the disc and 20 µm short of the face plane, moving into it and towards the axis:
        // it reaches the rim (OFF_FACE) first, then the face.
        const start: HeadState = {
            position: vec3(-TEST_HEAD.length / 2, 0, 1),
            orientation: IDENTITY,
            velocity: ZERO,
            angularVelocity: ZERO,
        };
        const ball = freeBall("blue", vec3(R + 2e-5, TEST_HEAD.radius + 1e-3, 1), vec3(-0.1, -2, 0));
        const run = integrate(isolated({ start, balls: [ball] }), { cap: 2e-3 });
        const rim = run.events.find((e) => e.kind === "impact-off-face");
        const faces = run.timeline["face/blue"] ?? [];
        expect(rim).toBeDefined();
        expect(faces).toHaveLength(1);
        expect(faces[0]?.start).toBe(rim?.t);
        expect(faces[0]?.peakForce).toBeGreaterThan(0);
    });

    it("ends an interval still open when the impact ends at the impact's duration", () => {
        const k = 2e5;
        const sink = (M * STANDARD_GRAVITY) / k;
        const run = integrate(
            isolated({
                gravity: STANDARD_GRAVITY,
                balls: [freeBall("blue", vec3(0, 0, R - sink), ZERO, lawFromStiffness(M, 0.5, k, 0.3))],
            }),
            { cap: 1e-4 },
        );
        const turf = run.timeline["turf/blue"] ?? [];
        expect(turf).toEqual([{ start: 0, end: run.duration, peakForce: expect.any(Number) }]);
        // The ball rests at its static sink, so its turf spring carries its weight throughout.
        expect(turf[0]?.peakForce).toBeGreaterThan(0);
    });

    it("lists exactly the ball–ball and ball–obstacle pairs touching at t = 0", () => {
        const post: ImpactObstacle = {
            id: "post",
            centre: vec3(0, 0, 0),
            radius: 0.01,
            law: lawFromContactTime(M, 0.6, 7e-4, 0.1),
        };
        const x = -(R + 0.01);
        const run = integrate(
            isolated({
                obstacles: [post],
                balls: [
                    freeBall("blue", vec3(x, 0, 1)),
                    freeBall("red", vec3(x - 2 * R, 0, 1)),
                    freeBall("black", vec3(1, 0, 1)),
                    freeBall("yellow", vec3(1 + 2 * R + 1e-6, 0, 1)),
                ],
            }),
            { cap: 1e-5 },
        );
        expect(run.touchingAtStart).toEqual(["blue/red", "blue@post"]);
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/engine/impact/timeline.test.ts`
Expected: FAIL (`timeline.ts` does not exist: the file fails to load).

- [ ] **Step 3: Add the types**

In `src/engine/impact/types.ts`, before `ImpactRun`, add:

```ts
/**
 * One contact interval of a pair (P2b.2a design §5): [start, end) in s from the impact's start, whole steps, and the
 * largest normal force (N) in it (0 at a face's rim, or for a pair overlapping but released). For a face–ball pair,
 * `clearanceAfter` (m) is the largest separation from the face in the gap before the next interval.
 */
export interface ContactInterval {
    readonly start: number;
    readonly end: number;
    readonly peakForce: number;
    readonly clearanceAfter?: number;
}
```

In `ImpactRun`, after `steps`, add:

```ts
    /**
     * Contact intervals of every pair that was in contact, keyed as `peakPenetration` is, plus "<ball>@<obstacle id>".
     * In contact means closed, or a face–ball pair at the rim (the Laws count any part of the mallet).
     */
    readonly timeline: Readonly<Record<string, readonly ContactInterval[]>>;
    /** Keys of the ball–ball and ball–obstacle pairs touching (within CONTACT_TOLERANCE) at t = 0, in pair order. */
    readonly touchingAtStart: readonly string[];
```

and extend the `peakPenetration` comment's key list with `"<ball>@<obstacle id>"`.

- [ ] **Step 4: Create `src/engine/impact/timeline.ts`**

```ts
/**
 * The contact timeline (P2b.2a design §5): each pair's intervals of contact. An interval opens at the start of the
 * first step in which the pair is in contact and ends at the start of the first step in which it is not; one still
 * open when the impact ends ends at its duration. Any step out of contact separates two intervals, as the Laws count
 * any second contact. A face–ball pair's gaps also keep their largest clearance, attached to the interval before the
 * gap once the next one opens.
 */
import type { ContactInterval } from "./types";

/** One pair's record while the impact runs. */
export interface PairTimeline {
    readonly intervals: ContactInterval[];
    /** Start (s) of the open interval, or null while the pair is out of contact. */
    start: number | null;
    /** Largest normal force (N) in the open interval. */
    peak: number;
    /** Largest clearance (m) noted in the current gap, or null. */
    clearance: number | null;
}

/** A pair's record before the first step. */
export function emptyTimeline(): PairTimeline {
    return { intervals: [], start: null, peak: 0, clearance: null };
}

/** Records the step starting at `t`: in contact with normal force `force` (0 at the rim or released), or not. */
export function recordStep(line: PairTimeline, inContact: boolean, force: number, t: number): void {
    if (inContact) {
        if (line.start !== null) {
            line.peak = Math.max(line.peak, force);
            return;
        }
        const last = line.intervals[line.intervals.length - 1];
        if (last && line.clearance !== null) {
            line.intervals[line.intervals.length - 1] = { ...last, clearanceAfter: line.clearance };
        }
        line.start = t;
        line.peak = force;
        line.clearance = null;
        return;
    }
    if (line.start !== null) {
        line.intervals.push({ start: line.start, end: t, peakForce: line.peak });
        line.start = null;
    }
}

/** True while the pair is out of contact after at least one interval: a gap whose clearance is worth noting. */
export function inGap(line: PairTimeline): boolean {
    return line.start === null && line.intervals.length > 0;
}

/** Notes a clearance (m) measured in the current gap. */
export function noteClearance(line: PairTimeline, clearance: number): void {
    line.clearance = line.clearance === null ? clearance : Math.max(line.clearance, clearance);
}

/** The pair's intervals once the impact ends at `duration`; an open interval ends there. */
export function closeTimeline(line: PairTimeline, duration: number): readonly ContactInterval[] {
    if (line.start === null) {
        return line.intervals;
    }
    return [...line.intervals, { start: line.start, end: duration, peakForce: line.peak }];
}
```

- [ ] **Step 5: Record it in `integrate.ts`**

Header: add a paragraph after the termination paragraph: "Every step also records whether each pair is in contact
(closed, or a face at the rim), building the contact timeline (timeline.ts; P2b.2a design §5); the pairs touching at
t = 0 are listed in `touchingAtStart`. Recording only reads the state."

Imports: add `faceClearance` and `pairTouching` to the `./contacts` import, and:

```ts
import { closeTimeline, emptyTimeline, inGap, noteClearance, recordStep, type PairTimeline } from "./timeline";
import type { ContactInterval, DriveSample, HeadState, ImpactEvent, ImpactRun, MalletHead } from "./types";
```

`PairState` gains `readonly line: PairTimeline;` (comment: "The pair's contact timeline."). `applyPair` returns the
normal force: change its return type to `number`, add `return normal;` at its end, and make its comment:

```ts
/**
 * The normal and tangential force of one closed pair, from the current state; returns the normal force (N). Advances
 * the pair's tangential spring, adds the force to body B and its reaction to body A (the head, the other ball, or the
 * immovable turf), and appends the pair as the probe sees it to `samples` (null without a probe).
 */
```

`finish` takes `touchingAtStart: readonly string[]` after `duration`, and builds the timeline:

```ts
    const timeline: Record<string, readonly ContactInterval[]> = {};
    for (const p of pairs) {
        const intervals = closeTimeline(p.line, duration);
        if (intervals.length > 0) {
            timeline[p.pair.key] = intervals;
        }
    }
    return { balls: final, head: state, duration, events, peakPenetration, steps, timeline, touchingAtStart };
```

(its comment: "…every pair's peak penetration, the contact timeline and the pairs touching at the start.").

In `integrate`, each `PairState` gains `line: emptyTimeline(),`. After `const balls …`, add:

```ts
    const touchingAtStart = pairs.filter((p) => pairTouching(p.pair, balls, R, setup.obstacles)).map((p) => p.pair.key);
```

Replace the pair loop:

```ts
        for (const p of pairs) {
            const { pair } = p;
            const contact = pairContact(pair, state, head, balls, R, setup.obstacles);
            if (contact === OFF_FACE || contact === null) {
                p.spring = ZERO;
                if (contact === OFF_FACE && !offFace[pair.b]) {
                    offFace[pair.b] = true;
                    events.push({ kind: "impact-off-face", t, ball: ids[pair.b] as BallId });
                }
                recordStep(p.line, contact === OFF_FACE, 0, t);
                if (pair.kind === "face-ball" && contact === null && inGap(p.line)) {
                    noteClearance(p.line, faceClearance(state, head, (balls[pair.b] as BallState).position, R));
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
            const force = applyPair(p, contact, state, balls, dt, loads, options.probe ? samples : null);
            recordStep(p.line, true, force, t);
        }
```

and pass `touchingAtStart` to `finish`:
`return finish(setup, state, balls, pairs, events, steps, steps * dt, touchingAtStart);`.

- [ ] **Step 6: Print the new fields in the digest**

In `scripts/impactDigest.ts`, add below `p2b1`:

```ts
/** The fields added after P2b.1, printed on their own `timeline` lines. */
function later(result: ImpactResult): unknown {
    return { timeline: result.timeline, touchingAtStart: result.touchingAtStart };
}
```

After each scenario's result line add ``console.log(`timeline scenario ${s.name} ${exact(later(result))}`);``, and
replace the fuzz line with:

```ts
    const result = simulateImpact(contact, balls, TEST_WORLD);
    console.log(`fuzz ${n} ${exact(p2b1(result))}`);
    console.log(`timeline fuzz ${n} ${exact(later(result))}`);
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/impact/`
Expected: PASS. Then `npm test`: PASS. (`toStrictEqual` determinism checks in `integrate.test.ts` and
`invariants.test.ts` now also compare the timeline.)

- [ ] **Step 8: Verify bit-identity**

Run: `npx --yes tsx scripts/impactDigest.ts > "$CLAUDE_TEMP_DIR/digest-6.txt"`
Run: `grep -v "^timeline " "$CLAUDE_TEMP_DIR/digest-6.txt" > "$CLAUDE_TEMP_DIR/digest-6-p2b1.txt"`
Run: `cmp "$CLAUDE_TEMP_DIR/digest-base.txt" "$CLAUDE_TEMP_DIR/digest-6-p2b1.txt"`
Expected: no output. `digest-6.txt` has 4,961 lines (the 4,755 plus 206 `timeline ` lines). Spot-check one
`timeline scenario centre` line: `face/blue` has one interval, `turf/blue` one from 0.

- [ ] **Step 9: Format, check, commit**

```bash
git add src/engine/impact/timeline.ts src/engine/impact/types.ts src/engine/impact/integrate.ts scripts/impactDigest.ts tests/engine/impact/timeline.test.ts
git commit -F "$CLAUDE_TEMP_DIR/msg.txt"   # "Record each pair's contact timeline in the impact"
```

---

### Task 7: Touching obstacles, zero gap, handover and version

Validation accepts a ball touching an obstacle and rejects only an overlap beyond `CONTACT_TOLERANCE` (spec §6).
`prepareImpact` moves a touching ball to zero gap (§4). The handover clears balls from obstacles in the same repeated
pass (§6). `ENGINE_VERSION` moves to 0.5.0 (§10).

**Files:**
- Modify: `src/engine/impact/simulateImpact.ts`, `src/engine/impact/handover.ts`, `src/engine/impact/types.ts`
  (`overlapCorrection` comment), `src/engine/simulate.ts` (`ENGINE_VERSION`)
- Test: `tests/engine/impact/simulateImpact.test.ts`, `tests/engine/impact/handover.test.ts`

**Interfaces:**
- Consumes: Task 4's `outsideObstacle`, `obstacleContact`, `ObstacleGeometry`.
- Produces:
  - `handover(balls: BallStates, radius: number, obstacles: readonly ObstacleGeometry[] = [], passes =
    HANDOVER_PASSES): Handover`;
  - `simulateImpact` hands over with `obstaclesOf(world)`; `overlapCorrection` covers ball–obstacle overlaps;
  - `ENGINE_VERSION === "0.5.0"`.

- [ ] **Step 1: Write the failing tests**

In `tests/engine/impact/simulateImpact.test.ts`: add `CONTACT_TOLERANCE` (from `../../../src/engine/detect`),
`obstacleContact` (from `contacts`), `prepareImpact` (from `simulateImpact`), `type ImpactBall` (from `integrate`).

Change "is version 0.4.0" to:

```ts
    it("is version 0.5.0", () => {
        expect(ENGINE_VERSION).toBe("0.5.0");
    });
```

In the validation table, replace the "a ball touching the peg" case with:

```ts
        [
            "a ball overlapping the peg",
            strike(vec3(15 - 0.02 - R + 1e-6, 20, R)),
            { blue: ballAt(15 - 0.02 - R + 1e-6, 20) },
            WORLD,
            /ball blue overlaps peg/,
        ],
        [
            "zero ball–upright restitution",
            ok,
            { blue: BLUE },
            testWorld({ ballUpright: { restitution: 0, friction: 0.1 } }),
            /ballUpright\.restitution/,
        ],
        [
            "zero peg restitution",
            ok,
            { blue: BLUE },
            testWorld({ peg: { ...WORLD.peg, material: { restitution: 0, friction: 0.1 } } }),
            /peg\.material\.restitution/,
        ],
        [
            "a non-positive peg contact time",
            ok,
            { blue: BLUE },
            testWorld({ peg: { ...WORLD.peg, contactTime: 0 } }),
            /peg\.contactTime/,
        ],
```

Append:

```ts
describe("a ball touching an obstacle", () => {
    const PEG = WORLD.peg;
    const reach = R + PEG.radius;

    it.each([
        ["exactly", 0],
        ["overlapping by rounding", 5e-10],
    ])("is accepted when touching %s, and starts at zero gap", (_label, overlap) => {
        const blue = ballAt(15 - reach + overlap, 20);
        // Struck away from the peg (yaw π: the head on the peg's side, travelling −x).
        const contact = strike(blue.position, { yaw: Math.PI });
        const p = (prepareImpact(contact, { blue }, WORLD).balls[0] as ImpactBall).state.position;
        expect(obstacleContact(p, R, PEG)).toBeNull();
        expect(R + PEG.radius - length(sub(vec3(p.x, p.y, 0), PEG.centre))).toBeLessThanOrEqual(0);
        expect(Math.abs(p.x - blue.position.x)).toBeLessThanOrEqual(CONTACT_TOLERANCE);
        expect(p.y).toBe(blue.position.y);
        expect(() => simulateImpact(contact, { blue }, WORLD)).not.toThrow();
    });

    it("accepts a ball touching the peg and another ball", () => {
        const blue = ballAt(15 - reach, 20);
        const red = ballAt(15 - reach - 2 * R, 20);
        const result = simulateImpact(strike(red.position, { yaw: 1.2 }), { blue, red }, WORLD);
        expect(result.touchingAtStart).toEqual(["blue/red", "blue@peg"]);
        expect(result.events.some((e) => e.kind === "impact-cap")).toBe(false);
        expect(() => simulateFreeMotion(result.handover, WORLD)).not.toThrow();
    });
});
```

(Add `sub` to the vec3 import.)

In `tests/engine/impact/handover.test.ts`, add imports: `horizontal`, `type Vec3` (vec3), `obstacleContact`,
`type ObstacleGeometry` (contacts), `type BallState` (types), `hoopWithUprightAt` (fixtures), `uprightsOf` (world).
Change `handover(chain, R, 1)` to `handover(chain, R, [], 1)` and the two `handover(…, R, passes)` calls to
`handover(…, R, [], passes)`. Append:

```ts
describe("handover with obstacles", () => {
    const HOOP = hoopWithUprightAt("1", 6, 5);
    const POST = uprightsOf(HOOP, { restitution: 0.6, friction: 0.1 })[0];
    const WORLD = testWorld({ hoops: [HOOP] });
    const gapTo = (p: Vec3, o: ObstacleGeometry): number => length(horizontal(sub(p, o.centre))) - R - o.radius;

    it("moves a ball overlapping an upright out to zero gap, horizontally, velocities unchanged", () => {
        const s = airborneAt(6 - R - 0.008 + 1e-6, 5, R, vec3(-1, 0.5, 0));
        const out = handover({ blue: s }, R, [POST]);
        const h = out.balls.blue as BallState;
        expect(obstacleContact(h.position, R, POST)).toBeNull();
        expect(gapTo(h.position, POST)).toBeLessThan(1e-12);
        expect(h.position.y).toBe(5);
        expect(h.position.z).toBe(R);
        expect(h.velocity).toEqual(s.velocity);
        expect(out.overlapCorrection).toBeCloseTo(1e-6, 12);
        expect(() => simulateFreeMotion(out.balls, WORLD)).not.toThrow();
    });

    it("separates a ball pushed into an upright by another ball", () => {
        const bx = 6 - R - 0.008 + 1e-6;
        const out = handover({ blue: airborneAt(bx, 5, R), red: airborneAt(bx - 2 * R + 1e-6, 5, R) }, R, [POST]);
        const blue = (out.balls.blue as BallState).position;
        const red = (out.balls.red as BallState).position;
        expect(gapTo(blue, POST)).toBeGreaterThanOrEqual(-1e-12);
        expect(length(sub(blue, red)) - 2 * R).toBeGreaterThanOrEqual(-1e-12);
        expect(() => simulateFreeMotion(out.balls, WORLD)).not.toThrow();
    });

    it("throws, naming the ball and the obstacle, when the passes cannot clear a ball between two posts", () => {
        // The posts' surfaces are 2R − 0.1 mm apart: no position clears both.
        const a: ObstacleGeometry = { id: "A", centre: vec3(6, 5, 0), radius: 0.008 };
        const b: ObstacleGeometry = { id: "B", centre: vec3(6 + 0.016 + 2 * R - 1e-4, 5, 0), radius: 0.008 };
        const squeezed = { blue: airborneAt(6 + 0.008 + R - 5e-5, 5, R) };
        expect(() => handover(squeezed, R, [a, b], 1)).toThrow(/ball blue and A still overlap by [0-9.e-]+ m after 1/);
        expect(() => handover(squeezed, R, [a, b])).toThrow(/after 64 passes/);
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/engine/impact/simulateImpact.test.ts tests/engine/impact/handover.test.ts`
Expected: FAIL (runtime: the version, the overlap message, zero gap, and `handover` reading `[]` as its pass count).
`npm run check` shows the type errors.

- [ ] **Step 3: Validation and zero gap in `simulateImpact.ts`**

Imports: `horizontal, length, sub, vec3, type Vec3` stay; add `outsideObstacle` to the `./contacts` import.

In the `validateImpact` header, replace the second bullet with:

```ts
 * - two balls overlapping, or a ball overlapping an obstacle, by more than CONTACT_TOLERANCE (a ball touching one is
 *   accepted, and prepareImpact starts it at zero gap);
```

and change "a restitution outside (0, 1]" to "a restitution outside (0, 1] (face, ball–ball, ball–upright, peg)".
After the `ballBall.restitution` check add:

```ts
    restitution(world.ballUpright.restitution, "ballUpright.restitution");
    restitution(world.peg.material.restitution, "peg.material.restitution");
```

Replace the obstacle check in the ball loop:

```ts
        for (const o of obstacles) {
            if (length(horizontal(sub(p, o.centre))) - R - o.radius < 0 - CONTACT_TOLERANCE) {
                fail(`ball ${id} overlaps ${o.id}`);
            }
        }
```

In `prepareImpact`, compute `const obstacles = obstaclesOf(world);` at the top (and use it for the setup's
`obstacles`), and place each ball:

```ts
        let position = vec3(s.position.x, s.position.y, s.position.z - sink);
        for (const o of obstacles) {
            position = outsideObstacle(position, ball.radius, o);
        }
        entries.push({
            id,
            state: { ...s, position },
            turf: lawFromStiffness(ball.mass, surface.turfRestitution, surface.turfStiffness, surface.slidingFriction),
        });
```

Add to its header: "A ball touching an obstacle, which validateImpact accepts within CONTACT_TOLERANCE, is moved
horizontally outward until its penetration is at most zero (at most CONTACT_TOLERANCE): a closed pair from t = 0 would
hold the impact open against turf friction and fake a crush on a legal stroke (P2b.2a design §4)."

In `simulateImpact`: `const handed = handover(run.balls, world.ball.radius, obstaclesOf(world));`.

- [ ] **Step 4: Obstacles in the handover**

In `src/engine/impact/handover.ts`, extend the header with a paragraph before the last: "Balls are also cleared from
every obstacle they overlap (hoop uprights and the peg; P2b.2a design §6): moved horizontally outward along the
obstacle's normal to zero gap (outsideObstacle), velocities unchanged. Each pass separates the ball pairs, then the
ball–obstacle pairs, ball by ball and obstacle by obstacle." Import `outsideObstacle` and `type ObstacleGeometry` from
`./contacts`. The `Handover` interface's comment becomes:

```ts
/**
 * The balls as phase 2 receives them, and the largest overlap (m) removed from a pair of balls or a ball and an
 * obstacle.
 */
```

Replace `worstOverlap`:

```ts
/** The largest overlap (m) of any pair of balls or any ball and obstacle (0 when none), and what overlaps. */
function worstOverlap(
    states: readonly BallState[],
    ids: readonly BallId[],
    obstacles: readonly ObstacleGeometry[],
    radius: number,
): { overlap: number; what: string } {
    let worst = { overlap: 0, what: "" };
    for (let i = 0; i < states.length; i++) {
        const p = (states[i] as BallState).position;
        for (let j = i + 1; j < states.length; j++) {
            const distance = length(sub((states[j] as BallState).position, p));
            if (2 * radius - distance > worst.overlap) {
                worst = { overlap: 2 * radius - distance, what: `balls ${ids[i]} and ${ids[j]}` };
            }
        }
        for (const o of obstacles) {
            const overlap = radius + o.radius - length(horizontal(sub(p, o.centre)));
            if (overlap > worst.overlap) {
                worst = { overlap, what: `ball ${ids[i]} and ${o.id}` };
            }
        }
    }
    return worst;
}
```

(Import `type BallId` from `../types`.) Replace `handover`'s comment and signature:

```ts
/**
 * Places the balls for phase 2, separates overlapping pairs and clears balls from `obstacles` (see the file header).
 * Throws an Error, naming the worst overlap, if `passes` (HANDOVER_PASSES; tests may lower it) leave one above
 * HANDOVER_RESIDUAL: phase 2 would otherwise reject the overlap with a RangeError far from its cause.
 */
export function handover(
    balls: BallStates,
    radius: number,
    obstacles: readonly ObstacleGeometry[] = [],
    passes = HANDOVER_PASSES,
): Handover {
```

Inside the pass loop, after the ball–ball loops, add:

```ts
        for (let i = 0; i < states.length; i++) {
            for (const o of obstacles) {
                const s = states[i] as BallState;
                const overlap = radius + o.radius - length(horizontal(sub(s.position, o.centre)));
                if (overlap > 0) {
                    states[i] = { ...s, position: outsideObstacle(s.position, radius, o) };
                    overlapCorrection = Math.max(overlapCorrection, overlap);
                }
            }
        }
```

Replace the two `worstOverlap(states, radius)` calls with `worstOverlap(states, ids, obstacles, radius)`, and the
error with:

```ts
        throw new Error(
            `handover: ${worst.what} still overlap by ${worst.overlap} m after ` +
                `${passes} pass${passes === 1 ? "" : "es"}`,
        );
```

- [ ] **Step 5: The result's comment and the version**

In `impact/types.ts`, `ImpactResult.overlapCorrection`'s comment becomes "Largest overlap (m) the handover removed
from a pair of balls or a ball and an obstacle." In `src/engine/simulate.ts`, `ENGINE_VERSION = "0.5.0"`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/impact/`
Expected: PASS. Then `npm test`: PASS.

- [ ] **Step 7: Verify bit-identity**

Run: `npx --yes tsx scripts/impactDigest.ts > "$CLAUDE_TEMP_DIR/digest-7.txt"`
Run: `grep -v "^timeline " "$CLAUDE_TEMP_DIR/digest-7.txt" > "$CLAUDE_TEMP_DIR/digest-7-p2b1.txt"`
Run: `cmp "$CLAUDE_TEMP_DIR/digest-base.txt" "$CLAUDE_TEMP_DIR/digest-7-p2b1.txt"`
Expected: no output.
Run: `npx --yes tsx scripts/shotMix.ts`
Expected: p99 143,084, p99.9 362,050, max 408,030.
Run: `SLOW_TESTS=1 npm test`
Expected: PASS.

- [ ] **Step 8: Format, check, commit**

```bash
git add src/engine/impact/simulateImpact.ts src/engine/impact/handover.ts src/engine/impact/types.ts src/engine/simulate.ts tests/engine/impact/simulateImpact.test.ts tests/engine/impact/handover.test.ts
git commit -F "$CLAUDE_TEMP_DIR/msg.txt"   # "Accept balls touching obstacles and clear them at handover"
```

---

### Task 8: The fault judge

A pure function of a `StrokeContext` and an `ImpactResult` (spec §3, §7), under the determinism lint, internal until
P2b.2b exports it. Read the spec's §7 table and exemption paragraphs, and both decision lists above (the 29.1.7
exemption is a pre-flight decision), before starting.

**Files:**
- Create: `src/engine/faults.ts`
- Test: `tests/engine/faults.test.ts`

**Interfaces:**
- Consumes: `ImpactResult`, `ContactInterval` (Task 6); `faceKey`, `ballPairKey`, `obstacleKey` (Task 4);
  `CONTACT_TOLERANCE`; `lawsReference.faults`, `FaultLawKey` (Task 2, tests only).
- Produces (faults.ts): `StrokeContext`, `FaultTier`, `Finding`, `FaultReport`,
  `judgeFaults(context: StrokeContext, impact: ImpactResult): FaultReport`, `JUDGED_LAWS`.

- [ ] **Step 1: Write the failing tests**

Create `tests/engine/faults.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { JUDGED_LAWS, judgeFaults, type FaultReport, type StrokeContext } from "../../src/engine/faults";
import { ZERO } from "../../src/engine/math/vec3";
import { IDENTITY } from "../../src/engine/impact/rigidBody";
import type { ContactInterval, ImpactEvent, ImpactResult } from "../../src/engine/impact/types";
import type { BallStates } from "../../src/engine/types";
import { lawsReference, type FaultLawKey } from "../../src/reference/index";
import { ballAt } from "./support/fixtures";

/** A time unit for hand-built timelines (s). */
const T = 1e-4;
const ALL: BallStates = { blue: ballAt(5, 5), red: ballAt(6, 5), black: ballAt(7, 5), yellow: ballAt(8, 5) };

function iv(start: number, end: number, peakForce = 100, clearanceAfter?: number): ContactInterval {
    return clearanceAfter === undefined ? { start, end, peakForce } : { start, end, peakForce, clearanceAfter };
}

/** A hand-built impact: the given timeline, touching pairs, events and penetrations; all four balls present. */
function impact(over: {
    timeline?: Record<string, readonly ContactInterval[]>;
    touchingAtStart?: readonly string[];
    events?: readonly ImpactEvent[];
    peakPenetration?: Record<string, number>;
    balls?: BallStates;
}): ImpactResult {
    const balls = over.balls ?? ALL;
    return {
        balls,
        head: { position: ZERO, orientation: IDENTITY, velocity: ZERO, angularVelocity: ZERO },
        duration: 100 * T,
        events: over.events ?? [],
        peakPenetration: over.peakPenetration ?? {},
        steps: 2000,
        timeline: over.timeline ?? {},
        touchingAtStart: over.touchingAtStart ?? [],
        handover: balls,
        overlapCorrection: 0,
    };
}

const SINGLE: StrokeContext = {
    striker: "blue",
    kind: "single-ball",
    live: ["red", "black", "yellow"],
    hampered: false,
    jumpAttempt: false,
    group: false,
};
const DEAD: StrokeContext = { ...SINGLE, live: [] };
const CROQUET: StrokeContext = { ...SINGLE, kind: "croquet", croqueted: "red", live: [] };

const laws = (report: FaultReport): string[] => report.findings.map((f) => `${f.law} ${f.tier}`);

describe("judgeFaults: one positive and one negative case per row", () => {
    it("29.1.8: the striker's ball touches an upright while the mallet is in contact", () => {
        const hit = impact({ timeline: { "face/blue": [iv(0, 6 * T)], "blue@1/a": [iv(5 * T, 8 * T, 40)] } });
        expect(laws(judgeFaults(SINGLE, hit))).toEqual(["29.1.8 fault"]);
        expect(judgeFaults(SINGLE, hit).findings[0]).toMatchObject({ ball: "blue", t: 5 * T });
        const after = impact({ timeline: { "face/blue": [iv(0, 6 * T)], "blue@1/a": [iv(6 * T, 8 * T)] } });
        expect(laws(judgeFaults(SINGLE, after))).toEqual([]);
    });

    it("29.1.9: struck while touching an upright that then carries force during the contact (with 29.1.8)", () => {
        const into = impact({
            touchingAtStart: ["blue@1/a"],
            timeline: { "face/blue": [iv(0, 6 * T)], "blue@1/a": [iv(T, 3 * T, 50)] },
        });
        expect(laws(judgeFaults(SINGLE, into))).toEqual(["29.1.8 fault", "29.1.9 fault"]);
        const away = impact({ touchingAtStart: ["blue@1/a"], timeline: { "face/blue": [iv(0, 6 * T)] } });
        expect(laws(judgeFaults(SINGLE, away))).toEqual([]);
        const unloaded = impact({
            touchingAtStart: ["blue@1/a"],
            timeline: { "face/blue": [iv(0, 6 * T)], "blue@1/a": [iv(T, 2 * T, 0)] },
        });
        expect(laws(judgeFaults(SINGLE, unloaded))).toEqual(["29.1.8 fault"]);
    });

    it("29.1.11: the mallet touches a ball other than the striker's", () => {
        const touched = impact({ timeline: { "face/blue": [iv(0, 2 * T)], "face/red": [iv(T, 3 * T, 30)] } });
        expect(laws(judgeFaults(SINGLE, touched))).toEqual(["29.1.11 fault"]);
        expect(judgeFaults(SINGLE, touched).findings[0]).toMatchObject({
            ball: "red",
            t: T,
            evidence: { peakForce: 30 },
        });
        expect(laws(judgeFaults(SINGLE, impact({ timeline: { "face/blue": [iv(0, 2 * T)] } })))).toEqual([]);
    });

    it("29.1.13: a croquet stroke that fails to move the croqueted ball", () => {
        const base = { touchingAtStart: ["blue/red"], timeline: { "face/blue": [iv(0, 2 * T)] } };
        const still = impact({ ...base, peakPenetration: { "blue/red": 5e-10 } });
        expect(laws(judgeFaults(CROQUET, still))).toEqual(["29.1.13 fault"]);
        expect(judgeFaults(CROQUET, still).findings[0]).toMatchObject({ ball: "red", t: 100 * T });
        expect(laws(judgeFaults(CROQUET, impact(base)))).toEqual(["29.1.13 fault"]);
        const moved = impact({
            touchingAtStart: ["blue/red"],
            timeline: { "face/blue": [iv(0, 2 * T)], "blue/red": [iv(0, 3 * T)] },
            peakPenetration: { "blue/red": 2e-3 },
        });
        expect(laws(judgeFaults(CROQUET, moved))).toEqual([]);
    });

    it("29.1.6.2 fault: a single-ball stroke with two mallet contacts", () => {
        const twice = impact({ timeline: { "face/blue": [iv(0, 2 * T, 100, 1e-4), iv(5 * T, 7 * T)] } });
        const report = judgeFaults(SINGLE, twice);
        expect(laws(report)).toEqual(["29.1.6.2 fault"]);
        expect(report.findings[0]).toMatchObject({ t: 5 * T, evidence: { contacts: 2, clearance1: 1e-4 } });
        expect(report.findings[0]?.evidence.gap1).toBeCloseTo(3 * T, 15);
        expect(laws(judgeFaults(SINGLE, impact({ timeline: { "face/blue": [iv(0, 2 * T)] } })))).toEqual([]);
    });

    it("29.1.6.2 possible fault: the head still closing on the striker's ball when the impact ends", () => {
        const approaching: ImpactEvent = { kind: "impact-head-approaching", t: 100 * T, ball: "blue" };
        const closing = impact({ timeline: { "face/blue": [iv(0, 2 * T)] }, events: [approaching] });
        expect(laws(judgeFaults(SINGLE, closing))).toEqual(["29.1.6.2 possible-fault"]);
        const other = impact({
            timeline: { "face/blue": [iv(0, 2 * T)] },
            events: [{ ...approaching, ball: "red" }],
        });
        expect(laws(judgeFaults(SINGLE, other))).toEqual([]);
        const afterRoquet = impact({
            timeline: { "face/blue": [iv(0, 2 * T)], "blue/red": [iv(3 * T, 4 * T)] },
            events: [approaching],
        });
        expect(laws(judgeFaults(SINGLE, afterRoquet))).toEqual([]);
    });

    it("29.1.7 possible fault: the mallet still in contact when the striker's ball hits a dead ball", () => {
        const hit = impact({ timeline: { "face/blue": [iv(0, 6 * T)], "blue/red": [iv(4 * T, 7 * T)] } });
        const report = judgeFaults(DEAD, hit);
        expect(laws(report)).toEqual(["29.1.7 possible-fault"]);
        expect(report.findings[0]?.t).toBe(4 * T);
        expect(report.findings[0]?.evidence.contactBefore).toBeCloseTo(4 * T, 15);
        expect(report.findings[0]?.evidence.contactAfter).toBeCloseTo(2 * T, 15);
        expect(laws(judgeFaults(SINGLE, hit))).toEqual([]);
        const touching = impact({
            touchingAtStart: ["blue/red"],
            timeline: { "face/blue": [iv(0, 6 * T)], "blue/red": [iv(0, 7 * T)] },
        });
        expect(laws(judgeFaults({ ...DEAD, kind: "continuation-touching" }, touching))).toEqual([]);
        const croquet = impact({
            touchingAtStart: ["blue/red"],
            timeline: { "face/blue": [iv(0, 6 * T)], "blue/red": [iv(0, 7 * T)] },
            peakPenetration: { "blue/red": 2e-3 },
        });
        expect(laws(judgeFaults(CROQUET, croquet))).toEqual([]);
    });

    it("29.1.6.1 possible fault: two mallet contacts in a croquet stroke or a continuation while touching", () => {
        const twice = impact({
            touchingAtStart: ["blue/red"],
            timeline: { "face/blue": [iv(0, 2 * T, 100, 1e-4), iv(5 * T, 7 * T)], "blue/red": [iv(0, 6 * T)] },
            peakPenetration: { "blue/red": 2e-3 },
        });
        const report = judgeFaults(CROQUET, twice);
        expect(laws(report)).toEqual(["29.1.6.1 possible-fault"]);
        expect(report.findings[0]?.evidence).toMatchObject({ contacts: 2, clearance1: 1e-4 });
        expect(laws(judgeFaults({ ...DEAD, kind: "continuation-touching" }, twice))).toEqual([
            "29.1.6.1 possible-fault",
        ]);
        const once = impact({
            touchingAtStart: ["blue/red"],
            timeline: { "face/blue": [iv(0, 2 * T)], "blue/red": [iv(0, 6 * T)] },
            peakPenetration: { "blue/red": 2e-3 },
        });
        expect(laws(judgeFaults(CROQUET, once))).toEqual([]);
    });

    it("29.1.5: a first contact at the rim in a stroke of Law 29.2.3", () => {
        const rim: ImpactEvent = { kind: "impact-off-face", t: 0, ball: "blue" };
        const atRim = impact({ timeline: { "face/blue": [iv(0, 3 * T)] }, events: [rim] });
        for (const flag of ["hampered", "jumpAttempt", "group"] as const) {
            expect(laws(judgeFaults({ ...SINGLE, [flag]: true }, atRim)), flag).toEqual(["29.1.5 fault"]);
        }
        expect(laws(judgeFaults(SINGLE, atRim))).toEqual([]);
        const laterRim = impact({ timeline: { "face/blue": [iv(0, 3 * T)] }, events: [{ ...rim, t: 2 * T }] });
        expect(laws(judgeFaults({ ...SINGLE, hampered: true }, laterRim))).toEqual([]);
    });
});

describe("judgeFaults: the commentary's roquet sequences (C29.20.4), R = blue, K = red (live), object = 1/a", () => {
    const cases: [
        string,
        Record<string, readonly ContactInterval[]>,
        string[],
        { live?: StrokeContext["live"]; touchingAtStart?: readonly string[] }?,
    ][] = [
        [
            "C29.20.4.1: mallet, mallet, roquet — fault",
            { "face/blue": [iv(0, T), iv(2 * T, 3 * T)], "blue/red": [iv(4 * T, 5 * T)] },
            ["29.1.6.2 fault"],
        ],
        [
            "C29.20.4.2: mallet, roquet, mallet — no fault",
            { "face/blue": [iv(0, T), iv(4 * T, 5 * T)], "blue/red": [iv(2 * T, 3 * T)] },
            [],
        ],
        [
            "C29.20.4.3: mallet, roquet, object, mallet — fault",
            {
                "face/blue": [iv(0, T), iv(6 * T, 7 * T)],
                "blue/red": [iv(2 * T, 3 * T)],
                "blue@1/a": [iv(4 * T, 5 * T)],
            },
            ["29.1.6.2 fault"],
        ],
        [
            "C29.20.4.4: mallet, roquet, mallet, object — no fault",
            {
                "face/blue": [iv(0, T), iv(4 * T, 5 * T)],
                "blue/red": [iv(2 * T, 3 * T)],
                "blue@1/a": [iv(6 * T, 7 * T)],
            },
            [],
        ],
        [
            "C29.20.4.5: mallet, object, roquet, mallet — no fault",
            {
                "face/blue": [iv(0, T), iv(6 * T, 7 * T)],
                "blue@1/a": [iv(2 * T, 3 * T)],
                "blue/red": [iv(4 * T, 5 * T)],
            },
            [],
        ],
        [
            "a mallet contact starting with the roquet is after it — no fault",
            { "face/blue": [iv(0, T), iv(2 * T, 3 * T)], "blue/red": [iv(2 * T, 3 * T)] },
            [],
        ],
        [
            "a mallet contact open when the roquet starts is one contact, before it; a later one is exempt — no fault",
            { "face/blue": [iv(0, 3 * T), iv(5 * T, 6 * T)], "blue/red": [iv(2 * T, 4 * T)] },
            [],
        ],
        [
            "an object starting with the roquet does not intervene — no fault",
            {
                "face/blue": [iv(0, T), iv(6 * T, 7 * T)],
                "blue/red": [iv(2 * T, 3 * T)],
                "blue@1/a": [iv(2 * T, 3 * T)],
            },
            [],
        ],
        [
            "an object starting with the second mallet contact does not intervene — 29.1.8 only, no 29.1.6.2",
            {
                "face/blue": [iv(0, T), iv(6 * T, 7 * T)],
                "blue/red": [iv(2 * T, 3 * T)],
                "blue@1/a": [iv(6 * T, 7 * T)],
            },
            ["29.1.8 fault"],
        ],
        [
            "the roquet is the earliest live ball; the other live ball is then an object — fault",
            {
                "face/blue": [iv(0, T), iv(6 * T, 7 * T)],
                "blue/black": [iv(2 * T, 3 * T)],
                "blue/red": [iv(4 * T, 5 * T)],
            },
            ["29.1.6.2 fault"],
            { live: ["red", "black"] },
        ],
        [
            "a live ball touching at t = 0 is not a roquet — fault",
            { "face/blue": [iv(0, T), iv(5 * T, 6 * T)], "blue/red": [iv(0, 3 * T)] },
            ["29.1.6.2 fault"],
            { touchingAtStart: ["blue/red"] },
        ],
        [
            "a second hit on the roqueted ball is not another object — no fault",
            { "face/blue": [iv(0, T), iv(6 * T, 7 * T)], "blue/red": [iv(2 * T, 3 * T), iv(4 * T, 5 * T)] },
            [],
        ],
        [
            "a hit on a dead ball after the roquet is another object — fault",
            {
                "face/blue": [iv(0, T), iv(6 * T, 7 * T)],
                "blue/red": [iv(2 * T, 3 * T)],
                "blue/black": [iv(4 * T, 5 * T)],
            },
            ["29.1.6.2 fault"],
        ],
    ];

    it.each(cases)("%s", (_label, timeline, expected, extra) => {
        const context: StrokeContext = { ...SINGLE, live: extra?.live ?? ["red"] };
        const hit = impact({ timeline, touchingAtStart: extra?.touchingAtStart });
        expect(laws(judgeFaults(context, hit))).toEqual(expected);
    });
});

describe("judgeFaults: 29.1.7 and the roquet exemption", () => {
    const context: StrokeContext = { ...SINGLE, live: ["red"] };

    it("is not exempt when the mallet contact was already open before the roquet", () => {
        const hit = impact({
            timeline: { "face/blue": [iv(0, 6 * T)], "blue/red": [iv(2 * T, 3 * T)], "blue/black": [iv(4 * T, 5 * T)] },
        });
        expect(laws(judgeFaults(context, hit))).toEqual(["29.1.7 possible-fault"]);
    });

    it("is not exempt when the dead ball is hit with the roquet but the contact opened before it", () => {
        const hit = impact({
            timeline: { "face/blue": [iv(0, 6 * T)], "blue/red": [iv(2 * T, 3 * T)], "blue/black": [iv(2 * T, 3 * T)] },
        });
        expect(laws(judgeFaults(context, hit))).toEqual(["29.1.7 possible-fault"]);
    });

    it("is exempt when the mallet contact, the roquet and the dead-ball hit all start together", () => {
        const hit = impact({
            timeline: {
                "face/blue": [iv(2 * T, 6 * T)],
                "blue/red": [iv(2 * T, 3 * T)],
                "blue/black": [iv(2 * T, 3 * T)],
            },
        });
        expect(laws(judgeFaults(context, hit))).toEqual([]);
    });

    it("judges a dead-ball hit when the striker is not the first ball", () => {
        const hit = impact({
            timeline: { "face/red": [iv(0, 6 * T)], "blue/red": [iv(2 * T, 3 * T)], "red/black": [iv(4 * T, 5 * T)] },
        });
        expect(laws(judgeFaults({ ...context, striker: "red", live: ["blue"] }, hit))).toEqual([
            "29.1.7 possible-fault",
        ]);
    });

    it("finds the roquet by the canonical pair key when the striker is not the first ball", () => {
        // A missed roquet would leave the second mallet contact unexempt: 29.1.6.2.
        const hit = impact({ timeline: { "face/red": [iv(0, T), iv(4 * T, 5 * T)], "blue/red": [iv(2 * T, 3 * T)] } });
        expect(laws(judgeFaults({ ...context, striker: "red", live: ["blue"] }, hit))).toEqual([]);
    });
});

describe("judgeFaults: other cases", () => {
    it("never makes a croquet-stroke re-contact a fault", () => {
        const twice = impact({
            touchingAtStart: ["blue/red"],
            timeline: { "face/blue": [iv(0, 2 * T), iv(3 * T, 4 * T), iv(6 * T, 7 * T)], "blue/red": [iv(0, 5 * T)] },
            peakPenetration: { "blue/red": 2e-3 },
            events: [{ kind: "impact-head-approaching", t: 100 * T, ball: "blue" }],
        });
        const report = judgeFaults(CROQUET, twice);
        expect(report.findings.filter((f) => f.tier === "fault")).toEqual([]);
        expect(laws(report)).toEqual(["29.1.6.1 possible-fault"]);
    });

    it("does not charge the striker with another ball's crush", () => {
        const other = impact({ timeline: { "face/blue": [iv(0, 6 * T)], "red@1/a": [iv(T, 5 * T)] } });
        expect(laws(judgeFaults(SINGLE, other))).toEqual([]);
    });

    it("judges a whiff: nothing in a single-ball stroke, 29.1.13 alone in a croquet stroke", () => {
        expect(laws(judgeFaults(SINGLE, impact({})))).toEqual([]);
        expect(laws(judgeFaults(CROQUET, impact({ touchingAtStart: ["blue/red"] })))).toEqual(["29.1.13 fault"]);
    });

    it("ignores a live ball that is not in the impact", () => {
        const two = impact({ balls: { blue: ALL.blue, red: ALL.red }, timeline: { "face/blue": [iv(0, 2 * T)] } });
        expect(laws(judgeFaults({ ...SINGLE, live: ["yellow"] }, two))).toEqual([]);
    });

    it("reports one 29.1.8 finding per obstacle", () => {
        const both = impact({
            timeline: { "face/blue": [iv(0, 6 * T)], "blue@1/a": [iv(T, 2 * T)], "blue@peg": [iv(3 * T, 4 * T)] },
        });
        expect(judgeFaults(SINGLE, both).findings.map((f) => [f.law, f.t])).toEqual([
            ["29.1.8", T],
            ["29.1.8", 3 * T],
        ]);
    });

    it("judges only Laws quoted in reference/laws.json", () => {
        for (const law of JUDGED_LAWS) {
            expect(lawsReference.faults[law as FaultLawKey].quote.length, law).toBeGreaterThan(0);
        }
    });
});

describe("judgeFaults: a context that does not fit the impact", () => {
    const two = impact({ balls: { blue: ALL.blue, red: ALL.red } });
    const cases: [string, StrokeContext, ImpactResult, RegExp][] = [
        ["a striker absent from it", { ...SINGLE, striker: "yellow", live: [] }, two, /striker yellow is not in/],
        [
            "a croquet stroke without a croqueted ball",
            { ...SINGLE, kind: "croquet", live: [] },
            two,
            /needs a croqueted/,
        ],
        ["the striker as the croqueted ball", { ...CROQUET, croqueted: "blue" }, two, /cannot be the striker blue/],
        ["a croqueted ball absent from it", { ...CROQUET, croqueted: "yellow" }, two, /croqueted ball yellow is not/],
        ["a croqueted ball in another kind", { ...SINGLE, croqueted: "red" }, two, /only for a croquet stroke/],
        ["the striker listed as live", { ...SINGLE, live: ["blue", "red"] }, two, /striker blue cannot be live/],
    ];

    it.each(cases)("throws for %s", (_label, context, result, message) => {
        expect(() => judgeFaults(context, result)).toThrow(RangeError);
        expect(() => judgeFaults(context, result)).toThrow(message);
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/engine/faults.test.ts`
Expected: FAIL (`faults.ts` does not exist).

- [ ] **Step 3: Create `src/engine/faults.ts`**

```ts
/**
 * The fault judge (P2b.2a design §7): the mallet faults of the Laws of Association Croquet, judged from an impact's
 * contact timeline and the stroke's context. Source: World Croquet Federation, The Laws of Association Croquet, 7th
 * edition, with the Official Rulings and Commentary, Law 29; every Law used is quoted in reference/laws.json. The
 * impact stays Law-agnostic: it records when each pair was in contact, and only this file applies the Laws.
 *
 * Tiers. A `fault` is decided by the mechanics. A `possible-fault` is one the Laws make conditional on what an
 * adjudicator sees or hears (29.2.5–29.2.7): the finding carries the measured quantity, and no perception threshold is
 * invented.
 *
 * A mallet contact is a `face/<ball>` interval: the face or its rim (C29.11.9, C29.20.2); the rest of the mallet is not
 * modelled. Intervals are [start, end) in whole steps.
 *
 * Exemption 29.2.4.1. The roquet is the striker's ball's earliest first closing on a live ball it was not touching at
 * t = 0. A mallet contact at time t is exempt from 29.1.6 and 29.1.7 if the roquet started at or before t and the
 * striker's ball hit no other object (an obstacle, or a ball other than the roqueted one; C29.20.4) after the roquet
 * started and before t. Ties favour the exemption: a face interval starting with the roquet is after it, and an object
 * hit starting with the roquet or with the contact does not intervene. A face interval already open when the roquet
 * starts is one contact, before it.
 *
 * Exemption for 29.1.7. The dead ball's hit is exempt only if the mallet contact it falls in is exempt at the
 * contact's own start (a contact already open before the roquet is not), and the hit does not start after the roquet:
 * the mallet contact, the roquet and the dead-ball hit all start together (Law 29.2.4: contact after the ball has hit
 * another object after the roquet is not exempt).
 *
 * 29.1.9 ("carries force while overlapping the mallet contact") is judged at interval granularity: an obstacle
 * interval that overlaps a mallet contact counts if its `peakForce` is positive, not the force during the overlap.
 */
import { CONTACT_TOLERANCE } from "./detect";
import { ballPairKey, faceKey, obstacleKey } from "./impact/contacts";
import type { ContactInterval, ImpactResult } from "./impact/types";
import { BALL_IDS, type BallId } from "./types";

/** What the judge needs to know about the stroke beyond the impact (P2b.2a design §3). */
export interface StrokeContext {
    readonly striker: BallId;
    readonly kind: "single-ball" | "croquet" | "continuation-touching";
    /** Required for, and only for, a croquet stroke. */
    readonly croqueted?: BallId;
    /** Balls the striker may roquet in this stroke (decides the Law 29.2.4.1 exemption); never the striker. */
    readonly live: readonly BallId[];
    readonly hampered: boolean;
    readonly jumpAttempt: boolean;
    /** The striker's ball is part of a group of balls (29.2.3.3). */
    readonly group: boolean;
}

/** Decidable from the mechanics, or conditional on what an adjudicator perceives. */
export type FaultTier = "fault" | "possible-fault";

/**
 * One finding. `ball` is the ball it concerns: the striker's, except for 29.1.11 (the ball the mallet touched) and
 * 29.1.13 (the croqueted ball). `t` (s from the impact's start) is when it happened; 29.1.13 judges the whole impact
 * and gives its duration. `evidence` holds measured quantities in s, m or N (`contacts` is a count).
 */
export interface Finding {
    readonly law: string;
    readonly tier: FaultTier;
    readonly ball: BallId;
    readonly t: number;
    readonly evidence: Readonly<Record<string, number>>;
}

/** Every finding of a stroke, in the order of the design's table; the judge does not rank them. */
export interface FaultReport {
    readonly findings: readonly Finding[];
}

/** The Laws the judge reports, each quoted in reference/laws.json. */
export const JUDGED_LAWS = [
    "29.1.5",
    "29.1.6.1",
    "29.1.6.2",
    "29.1.7",
    "29.1.8",
    "29.1.9",
    "29.1.11",
    "29.1.13",
] as const;

const NONE: readonly ContactInterval[] = [];

function fail(message: string): never {
    throw new RangeError(message);
}

function validate(context: StrokeContext, impact: ImpactResult): void {
    const present = (id: BallId): boolean => impact.balls[id] !== undefined;
    const { striker, croqueted } = context;
    if (!present(striker)) {
        fail(`striker ${striker} is not in the impact`);
    }
    if (context.kind === "croquet") {
        if (croqueted === undefined) {
            fail("a croquet stroke needs a croqueted ball");
        }
        if (croqueted === striker) {
            fail(`the croqueted ball cannot be the striker ${striker}`);
        }
        if (!present(croqueted)) {
            fail(`croqueted ball ${croqueted} is not in the impact`);
        }
    } else if (croqueted !== undefined) {
        fail(`croqueted is given only for a croquet stroke (got ${context.kind})`);
    }
    if (context.live.includes(striker)) {
        fail(`the striker ${striker} cannot be live`);
    }
}

/** The striker's view of the impact: its mallet contacts, its roquet, the objects it hit, its obstacle pairs. */
interface StrikerView {
    readonly faces: readonly ContactInterval[];
    readonly roquet: ContactInterval | null;
    /** Every interval of the striker's ball with an obstacle, or with a ball other than the roqueted one. */
    readonly objects: readonly ContactInterval[];
    /** Keys of the striker's ball–obstacle pairs that were in contact, in pair order. */
    readonly obstacleKeys: readonly string[];
}

function viewOf(context: StrokeContext, impact: ImpactResult): StrikerView {
    const { striker } = context;
    const others = BALL_IDS.filter((id) => id !== striker && impact.balls[id] !== undefined);
    let roquet: ContactInterval | null = null;
    let roqueted: BallId | null = null;
    for (const id of others) {
        const key = ballPairKey(striker, id);
        const first = impact.timeline[key]?.[0];
        const eligible = context.live.includes(id) && !impact.touchingAtStart.includes(key);
        if (first && eligible && (roquet === null || first.start < roquet.start)) {
            roquet = first;
            roqueted = id;
        }
    }
    const prefix = obstacleKey(striker, "");
    const obstacleKeys = Object.keys(impact.timeline).filter((key) => key.startsWith(prefix));
    const objects = [
        ...others.filter((id) => id !== roqueted).flatMap((id) => impact.timeline[ballPairKey(striker, id)] ?? NONE),
        ...obstacleKeys.flatMap((key) => impact.timeline[key] ?? NONE),
    ];
    return { faces: impact.timeline[faceKey(striker)] ?? NONE, roquet, objects, obstacleKeys };
}

/** True when a mallet contact at time t is exempt under Law 29.2.4.1 (see the file header). */
function exempt(view: StrikerView, t: number): boolean {
    const { roquet } = view;
    if (roquet === null || roquet.start > t) {
        return false;
    }
    return !view.objects.some((o) => o.start > roquet.start && o.start < t);
}

/** True when two intervals share a step. */
function overlap(a: ContactInterval, b: ContactInterval): boolean {
    return a.start < b.end && b.start < a.end;
}

/** The earliest instant at which an interval of `others` overlaps a face interval, with that interval; or null. */
function firstOverlap(
    faces: readonly ContactInterval[],
    others: readonly ContactInterval[],
): { readonly t: number; readonly face: ContactInterval; readonly other: ContactInterval } | null {
    let best: { t: number; face: ContactInterval; other: ContactInterval } | null = null;
    for (const other of others) {
        for (const face of faces) {
            if (overlap(face, other)) {
                const t = Math.max(face.start, other.start);
                if (best === null || t < best.t) {
                    best = { t, face, other };
                }
            }
        }
    }
    return best;
}

/** Evidence of a multiple contact: the count of non-exempt contacts, and each face gap (s) with its clearance (m). */
function contactEvidence(count: number, faces: readonly ContactInterval[]): Record<string, number> {
    const evidence: Record<string, number> = { contacts: count };
    for (let i = 1; i < faces.length; i++) {
        const before = faces[i - 1] as ContactInterval;
        evidence[`gap${i}`] = (faces[i] as ContactInterval).start - before.end;
        if (before.clearanceAfter !== undefined) {
            evidence[`clearance${i}`] = before.clearanceAfter;
        }
    }
    return evidence;
}

/**
 * Judges the mallet faults of a stroke from its impact (P2b.2a design §7). Throws a RangeError for a context that does
 * not fit the impact: a striker absent from it; a croquet stroke without a croqueted ball, or with the striker or an
 * absent ball as the croqueted one; a croqueted ball given for another kind of stroke; the striker listed as live.
 */
export function judgeFaults(context: StrokeContext, impact: ImpactResult): FaultReport {
    validate(context, impact);
    const { striker, kind } = context;
    const view = viewOf(context, impact);
    const { faces } = view;
    const findings: Finding[] = [];
    const add = (law: string, tier: FaultTier, ball: BallId, t: number, evidence: Record<string, number> = {}) => {
        findings.push({ law, tier, ball, t, evidence });
    };

    // 29.1.8: the striker's ball touches an obstacle while in contact with the mallet; one finding per obstacle.
    for (const key of view.obstacleKeys) {
        const hit = firstOverlap(faces, impact.timeline[key] ?? NONE);
        if (hit) {
            const together = Math.min(hit.face.end, hit.other.end) - hit.t;
            add("29.1.8", "fault", striker, hit.t, { obstacleForce: hit.other.peakForce, together });
        }
    }
    // 29.1.9: struck while touching an obstacle, which then carries force during a mallet contact (C29.14.1).
    for (const key of view.obstacleKeys) {
        if (!impact.touchingAtStart.includes(key)) {
            continue;
        }
        const loaded = (impact.timeline[key] ?? NONE).filter((o) => o.peakForce > 0);
        const hit = firstOverlap(faces, loaded);
        if (hit) {
            add("29.1.9", "fault", striker, hit.t, { obstacleForce: hit.other.peakForce });
        }
    }
    // 29.1.11: the mallet touches another ball.
    for (const id of BALL_IDS) {
        const touched = id === striker ? undefined : impact.timeline[faceKey(id)];
        if (touched && touched.length > 0) {
            const peakForce = touched.reduce((m, i) => Math.max(m, i.peakForce), 0);
            add("29.1.11", "fault", id, (touched[0] as ContactInterval).start, { peakForce });
        }
    }
    // 29.1.13: a croquet stroke that never presses the croqueted ball beyond CONTACT_TOLERANCE.
    if (kind === "croquet") {
        const croqueted = context.croqueted as BallId;
        const depth = impact.peakPenetration[ballPairKey(striker, croqueted)] ?? 0;
        if (depth <= CONTACT_TOLERANCE) {
            add("29.1.13", "fault", croqueted, impact.duration, { peakPenetration: depth });
        }
    }
    const contacts = faces.filter((f) => !exempt(view, f.start));
    // 29.1.6.2: a single-ball stroke with two or more non-exempt mallet contacts, or the head still closing at the end.
    if (kind === "single-ball" && contacts.length >= 2) {
        add(
            "29.1.6.2",
            "fault",
            striker,
            (contacts[1] as ContactInterval).start,
            contactEvidence(contacts.length, faces),
        );
    }
    if (kind === "single-ball") {
        for (const e of impact.events) {
            if (e.kind === "impact-head-approaching" && e.ball === striker && !exempt(view, e.t)) {
                add("29.1.6.2", "possible-fault", striker, e.t);
            }
        }
    }
    // 29.1.7: the striker's ball first hits a ball it was not touching while a mallet contact is open; a live ball is a
    // roquet (exempt), and a croquet stroke's croqueted ball never counts (C29.12.3).
    for (const id of BALL_IDS) {
        const excluded =
            id === striker || context.live.includes(id) || (kind === "croquet" && id === context.croqueted);
        const key = ballPairKey(striker, id);
        const first = excluded ? undefined : impact.timeline[key]?.[0];
        if (!first || impact.touchingAtStart.includes(key)) {
            continue;
        }
        const face = faces.find((f) => f.start <= first.start && first.start < f.end);
        const roquetStart = view.roquet?.start;
        const exemptHit = face !== undefined && roquetStart !== undefined && first.start <= roquetStart;
        if (face && !(exemptHit && exempt(view, face.start))) {
            add("29.1.7", "possible-fault", striker, first.start, {
                contactBefore: first.start - face.start,
                contactAfter: face.end - first.start,
            });
        }
    }
    // 29.1.6.1: a croquet stroke, or a continuation while touching, with two or more non-exempt mallet contacts.
    if (kind !== "single-ball" && contacts.length >= 2) {
        const second = contacts[1] as ContactInterval;
        add("29.1.6.1", "possible-fault", striker, second.start, contactEvidence(contacts.length, faces));
    }
    // 29.1.5: in a stroke of Law 29.2.3, the first mallet contact is at the rim (C29.10.8: the first contact only).
    if (context.hampered || context.jumpAttempt || context.group) {
        const first = faces[0];
        const rim = impact.events.find((e) => e.kind === "impact-off-face" && e.ball === striker);
        if (first && rim && rim.t <= first.start) {
            add("29.1.5", "fault", striker, first.start);
        }
    }
    return { findings };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/faults.test.ts`
Expected: PASS, 39 tests. Then `npm test` and `npm run lint` (the determinism lint covers the new file): PASS.

- [ ] **Step 5: Format, check, commit**

```bash
git add src/engine/faults.ts tests/engine/faults.test.ts
git commit -F "$CLAUDE_TEMP_DIR/msg.txt"   # "Judge the Laws' mallet faults from the impact's timeline"
```

---

### Task 9: Whole-impact fault cases and the obstacle fuzz

Real impacts through `simulateImpact` and the judge (spec §9.6–§9.8, exit criteria 3–5).

**Files:**
- Create: `tests/engine/impact/obstacles.test.ts`
- Modify: `tests/engine/support/impact.ts`, `tests/engine/impact/fuzz.test.ts`

**Interfaces:**
- Consumes: everything above; `hoopWithUprightAt` (Task 3).
- Produces (support/impact.ts): `OBSTACLE_FUZZ_SEED`, `randomObstacleStroke(random, base: World): { contact:
  ContactState; balls: BallStates; world: World }`.

- [ ] **Step 1: Write the whole-impact tests**

Create `tests/engine/impact/obstacles.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CONTACT_TOLERANCE } from "../../../src/engine/detect";
import { judgeFaults, type StrokeContext } from "../../../src/engine/faults";
import { length, sub, vec3 } from "../../../src/engine/math/vec3";
import { simulateFreeMotion } from "../../../src/engine/simulate";
import { IMPACT_CAP } from "../../../src/engine/impact/integrate";
import { simulateImpact } from "../../../src/engine/impact/simulateImpact";
import type { World } from "../../../src/engine/types";
import { TEST_BALL, ballAt, hoopWithUprightAt, testHoop, testWorld } from "../support/fixtures";
import { strike } from "../support/impact";

const R = TEST_BALL.radius;
const r = testHoop("1", 0, 0).uprightRadius;
const BLUE = ballAt(10, 10);
const HAMPERED: StrokeContext = {
    striker: "blue",
    kind: "single-ball",
    live: [],
    hampered: true,
    jumpAttempt: false,
    group: false,
};

/** The test world with hoop "1" placed so that its upright "1/a" stands at (x, y). */
function uprightAt(x: number, y: number): World {
    return testWorld({ hoops: [hoopWithUprightAt("1", x, y)] });
}

const laws = (context: StrokeContext, ...args: Parameters<typeof simulateImpact>): string[] =>
    judgeFaults(context, simulateImpact(...args)).findings.map((f) => f.law);

describe("crush geometry (C29.13.1)", () => {
    it("raises 29.1.8 for a ball 1 mm from an upright struck straight at it", () => {
        const world = uprightAt(10 + R + r + 1e-3, 10);
        const result = simulateImpact(strike(BLUE.position, { speed: 3 }), { blue: BLUE }, world);
        expect(judgeFaults(HAMPERED, result).findings.map((f) => f.law)).toContain("29.1.8");
        expect(() => simulateFreeMotion(result.handover, world)).not.toThrow();
    });

    it("does not for a ball 20 mm from it, which it never reaches", () => {
        const world = uprightAt(10 + R + r + 0.02, 10);
        const result = simulateImpact(strike(BLUE.position, { speed: 3 }), { blue: BLUE }, world);
        expect(result.timeline["blue@1/a"]).toBeUndefined();
        expect(judgeFaults(HAMPERED, result).findings.map((f) => f.law)).not.toContain("29.1.8");
    });

    it("does not for a ball 5 mm from it, which it reaches", () => {
        const world = uprightAt(10 + R + r + 0.005, 10);
        const result = simulateImpact(strike(BLUE.position, { speed: 3 }), { blue: BLUE }, world);
        expect(result.timeline["blue@1/a"]).toBeDefined();
        expect(judgeFaults(HAMPERED, result).findings.map((f) => f.law)).not.toContain("29.1.8");
    });
});

describe("a ball touching an upright", () => {
    it.each([
        ["exactly", 0],
        ["overlapping by rounding", 5e-10],
    ])("struck directly away from it (touching %s) raises neither 29.1.8 nor 29.1.9", (_label, overlap) => {
        // 1/a on the east side (1/b stands further east, out of the way); the head strikes from the east, towards -x.
        const world = uprightAt(10 + R + r - overlap, 10);
        const result = simulateImpact(strike(BLUE.position, { speed: 2, yaw: Math.PI }), { blue: BLUE }, world);
        expect(result.touchingAtStart).toEqual(["blue@1/a"]);
        expect(result.timeline["blue@1/a"]).toBeUndefined();
        expect(result.timeline["blue@1/b"]).toBeUndefined();
        expect(result.handover.blue?.velocity.x).toBeLessThan(0);
        const found = judgeFaults(HAMPERED, result).findings.map((f) => f.law);
        expect(found).not.toContain("29.1.8");
        expect(found).not.toContain("29.1.9");
    });

    it("struck into it raises both 29.1.8 and 29.1.9", () => {
        const world = uprightAt(10 + R + r, 10);
        const found = laws(HAMPERED, strike(BLUE.position, { speed: 2 }), { blue: BLUE }, world);
        expect(found).toContain("29.1.8");
        expect(found).toContain("29.1.9");
    });

    it("at rest and never struck does not hold the impact open", () => {
        const yellow = ballAt(12, 12);
        const world = uprightAt(12 + R + r, 12);
        const result = simulateImpact(strike(BLUE.position), { blue: BLUE, yellow }, world);
        expect(result.events.some((e) => e.kind === "impact-cap")).toBe(false);
        expect(result.duration).toBeLessThan(IMPACT_CAP);
        expect(result.timeline["yellow@1/a"]).toBeUndefined();
        const moved = length(sub(result.handover.yellow?.position ?? vec3(0, 0, 0), yellow.position));
        expect(moved).toBeLessThanOrEqual(CONTACT_TOLERANCE);
    });
});

describe("a close scatter shot (C29.12.2)", () => {
    it("along the line of centres onto a dead ball raises 29.1.7 or 29.1.6.2", () => {
        const red = ballAt(10 + 2 * R + 1e-3, 10);
        const found = laws({ ...HAMPERED, hampered: false }, strike(BLUE.position), { blue: BLUE, red }, testWorld());
        expect(found.some((law) => law === "29.1.7" || law === "29.1.6.2")).toBe(true);
    });
});
```

- [ ] **Step 2: Add the obstacle fuzz strokes to `tests/engine/support/impact.ts`**

Add `testHoop`, `hoopWithUprightAt` to the fixtures import and `vec3` is already imported. Append:

```ts
/** Seed of the obstacle fuzz's stroke sequence (fuzz.test.ts). */
export const OBSTACLE_FUZZ_SEED = 29;

/**
 * Largest surface gap (m) from blue to upright 1/a. Pre-flight: no reach tried, up to 0.2 m (peg 0.3 m), raises an
 * impact-cap; wider reaches only dilute the share of strokes meeting an obstacle (17.45 % here, 6.35 % at 0.2 m).
 */
const UPRIGHT_REACH = 0.06;
/** Largest surface gap (m) from blue to the peg (with UPRIGHT_REACH, pre-flight). */
const PEG_REACH = 0.1;
/** Draws allowed before randomObstacleStroke gives up: a bound against a livelock, not a physical value. */
const OBSTACLE_DRAW_CAP = 1000;

/**
 * One random stroke of the impact fuzz (randomStroke) with hoop "1" and the peg moved within reach of blue: upright
 * "1/a" up to UPRIGHT_REACH from blue's surface and the peg up to PEG_REACH, each at a random bearing. A draw that
 * puts two obstacles within a ball's width of each other, or that validateImpact rejects, is drawn again.
 */
export function randomObstacleStroke(
    random: () => number,
    base: World,
): { contact: ContactState; balls: BallStates; world: World } {
    const uni = (a: number, b: number): number => a + (b - a) * random();
    const r = testHoop("1", 0, 0).uprightRadius;
    for (let attempt = 0; attempt < OBSTACLE_DRAW_CAP; attempt++) {
        const { contact, balls } = randomStroke(random, base);
        const ua = uni(-Math.PI, Math.PI);
        const ud = R + r + uni(0, UPRIGHT_REACH);
        const hoop = hoopWithUprightAt("1", 10 + ud * Math.cos(ua), 10 + ud * Math.sin(ua));
        const pa = uni(-Math.PI, Math.PI);
        const pd = R + base.peg.radius + uni(0, PEG_REACH);
        const peg = { ...base.peg, centre: vec3(10 + pd * Math.cos(pa), 10 + pd * Math.sin(pa), 0) };
        const world: World = { ...base, hoops: [hoop], peg };
        const [a, b] = uprightsOf(hoop, base.ballUpright);
        const crowded = [a, b].some((u) => length(sub(u.centre, peg.centre)) < u.radius + peg.radius + 2 * R + 1e-3);
        if (crowded) {
            continue;
        }
        try {
            validateImpact(contact, balls, world);
        } catch (error) {
            if (error instanceof RangeError) {
                continue;
            }
            throw error;
        }
        return { contact, balls, world };
    }
    throw new Error(`randomObstacleStroke: no valid stroke in ${OBSTACLE_DRAW_CAP} draws`);
}
```

(Import `length` from vec3 and `uprightsOf` from `world.ts`.) Only a `RangeError`, what `validateImpact` throws, is
drawn again; anything else is a defect and propagates.

- [ ] **Step 3: Add the obstacle fuzz to `tests/engine/impact/fuzz.test.ts`**

Add `OBSTACLE_FUZZ_SEED`, `randomObstacleStroke` to the support import. Append:

```ts
/**
 * 1.5× the worst obstacle-pair penetration over 2000 obstacle-fuzz strokes (pre-flight: 1.745 mm = 0.038 R). The
 * contact-time upper bound, 1.0e-3 s, keeps it at 0.055 R.
 */
const OBSTACLE_PENETRATION_BOUND = 0.06 * R;
/** Half the share of strokes in which an obstacle pair closes (pre-flight: 17.45 % of 2000). */
const OBSTACLE_SHARE = 0.087;

describe("obstacle fuzz", () => {
    const count = import.meta.env.SLOW_TESTS ? 2000 : 200;

    it(
        `ends, never hits the cap, keeps penetrations bounded and hands over cleanly over ${count} strokes`,
        {
            timeout: 600_000,
        },
        () => {
            const random = rng(OBSTACLE_FUZZ_SEED);
            let touched = 0;
            for (let n = 0; n < count; n++) {
                const { contact, balls, world } = randomObstacleStroke(random, WORLD);
                const result = simulateImpact(contact, balls, world);
                expect(
                    result.events.some((e) => e.kind === "impact-cap"),
                    `stroke ${n}`,
                ).toBe(false);
                for (const [key, depth] of Object.entries(result.peakPenetration)) {
                    const bound = key.includes("@") ? OBSTACLE_PENETRATION_BOUND : PENETRATION_BOUND;
                    expect(depth, `stroke ${n} ${key}`).toBeLessThan(bound);
                }
                if (Object.keys(result.timeline).some((key) => key.includes("@"))) {
                    touched++;
                }
                for (const s of Object.values(result.handover) as BallState[]) {
                    const values = [s.position, s.velocity, s.angularVelocity].flatMap((v) => [v.x, v.y, v.z]);
                    expect(values.every(Number.isFinite), `stroke ${n}`).toBe(true);
                }
                expect(() => simulateFreeMotion(result.handover, world), `stroke ${n}`).not.toThrow();
            }
            expect(touched).toBeGreaterThan(OBSTACLE_SHARE * count);
        },
    );
});
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/engine/impact/obstacles.test.ts tests/engine/impact/fuzz.test.ts`
Expected: PASS. Then `SLOW_TESTS=1 npx vitest run tests/engine/impact/fuzz.test.ts`: PASS (about 9 s for both fuzzes).

- [ ] **Step 5: Format, check, commit**

```bash
git add tests/engine/impact/obstacles.test.ts tests/engine/support/impact.ts tests/engine/impact/fuzz.test.ts
git commit -F "$CLAUDE_TEMP_DIR/msg.txt"   # "Test crushes, touching starts and an obstacle fuzz through real impacts"
```

---

### Task 10: The reach filter

Pre-flight measured the cost of pairing every ball with every obstacle at 1.61–1.88× P2b.1's µs/step on the default
world (12 uprights and the peg), and the user chose a reach filter (spec §4; "Decisions made in pre-flight"). A
ball–obstacle pair is skipped while the ball cannot yet have reached the obstacle: each ball's horizontal path length
is summed, and a pair found open is not evaluated again until the ball has travelled its gap, less `WAKE_MARGIN`. The
filter must be exact: a skipped pair is open, so evaluating it would add no force and change no state, and the pairs
evaluated are visited, and their forces summed, in the same order. This task proves it bit for bit (Steps 1 and 6).

**Files:**
- Modify: `src/engine/impact/contacts.ts` (`obstacleGap`), `src/engine/impact/integrate.ts`
- Test: `tests/engine/impact/contacts.test.ts`, `tests/engine/impact/analytic.test.ts`
- Throwaway (never committed): `scripts/obstacleFuzzExact.ts`

**Interfaces:**
- Consumes: Task 6's pair loop and timeline; Task 9's `OBSTACLE_FUZZ_SEED`, `randomObstacleStroke`.
- Produces: `obstacleGap(centre: Vec3, radius: number, obstacle: ObstacleGeometry): number` (contacts.ts). Results
  are unchanged.

- [ ] **Step 1: Save the unfiltered outputs**

Before any change, create `scripts/obstacleFuzzExact.ts` (throwaway; Step 6 deletes it):

```ts
/** Throwaway (P2b.2a Task 10): the obstacle fuzz's 2000 strokes, every field at full precision. Never committed. */
import { simulateImpact } from "../src/engine/impact/simulateImpact";
import { testWorld } from "../tests/engine/support/fixtures";
import { OBSTACLE_FUZZ_SEED, randomObstacleStroke } from "../tests/engine/support/impact";
import { rng } from "../tests/engine/support/rng";

function exact(value: unknown): string {
    return JSON.stringify(value, (_key, v: unknown) => {
        if (typeof v !== "number") {
            return v;
        }
        if (Object.is(v, -0)) {
            return "-0";
        }
        return Number.isFinite(v) ? v : String(v);
    });
}

const random = rng(OBSTACLE_FUZZ_SEED);
const base = testWorld();
for (let n = 0; n < 2000; n++) {
    const { contact, balls, world } = randomObstacleStroke(random, base);
    console.log(`obstacle ${n} ${exact(simulateImpact(contact, balls, world))}`);
}
```

Run: `npx --yes tsx scripts/impactDigest.ts > "$CLAUDE_TEMP_DIR/digest-10-before.txt"`
Expected: 4,961 lines.
Run: `npx --yes tsx scripts/obstacleFuzzExact.ts > "$CLAUDE_TEMP_DIR/obstacle-10-before.txt"`
Expected: 2,000 lines.

- [ ] **Step 2: Write the failing tests**

In `tests/engine/impact/contacts.test.ts`, add `obstacleGap` to the contacts import, and after the "obstacleContact"
describe:

```ts
describe("obstacleGap", () => {
    it("is the horizontal surface gap: positive apart, zero at R + r, negative overlapping", () => {
        expect(obstacleGap(vec3(1 - R - 0.008 - 0.3, 2, 0.4), R, POST)).toBeCloseTo(0.3, 14);
        expect(Math.abs(obstacleGap(vec3(1, 2 + R + 0.008, R), R, POST))).toBeLessThan(1e-15);
        expect(obstacleGap(vec3(1 - R - 0.008 + 1e-4, 2, R), R, POST)).toBeCloseTo(-1e-4, 15);
    });

    it("is negative exactly where obstacleContact closes", () => {
        const points = [
            vec3(1 - R - 0.008 + 1e-4, 2, 0.3),
            vec3(1, 2 + R + 0.008 + 1e-12, R),
            vec3(1, 2 + R + 0.008 - 1e-12, R),
            vec3(1.03, 2.04, R),
            vec3(1.5, 1.5, R),
        ];
        for (const p of points) {
            expect(obstacleGap(p, R, POST) < 0, `${p.x}, ${p.y}`).toBe(obstacleContact(p, R, POST) !== null);
        }
    });
});
```

In `tests/engine/impact/analytic.test.ts`, in "a ball against a fixed obstacle", after the head-on case (it reuses that
case's law, step and tolerance):

```ts
    it("from 10 mm away, past the reach filter: the same contact time, restitution and a single interval", () => {
        const e = 0.6;
        const T = 7e-4;
        const probe = counter("blue@post");
        // 100,000 steps of approach, nearly all of them with the pair skipped as out of reach.
        const run = integrate(
            isolated({
                obstacles: [post(lawFromContactTime(M, e, T, 0))],
                balls: [freeBall("blue", vec3(-(R + 0.008 + 0.01), 0, 1), vec3(1, 0, 0))],
            }),
            { dt: FINE, cap: 0.012, probe },
        );
        expect(Math.abs(probe.closed * FINE - T) / T).toBeLessThan(LAW_TOLERANCE);
        expect(Math.abs((run.balls.blue?.velocity.x as number) + e) / e).toBeLessThan(LAW_TOLERANCE);
        expect(run.timeline["blue@post"]).toHaveLength(1);
    });
```

It passes with or without the filter: it is a behaviour test (pre-flight: the filter skipped the pair in 112,088 of
the 120,000 steps).

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/engine/impact/contacts.test.ts tests/engine/impact/analytic.test.ts`
Expected: FAIL, the 2 `obstacleGap` tests (`TypeError: obstacleGap is not a function`); the analytic case passes.

- [ ] **Step 4: Add `obstacleGap` to `contacts.ts`**

After `obstacleContact`:

```ts
/**
 * Horizontal surface gap (m) between `obstacle` and a ball centred at `centre`, d − R − r: the negated penetration
 * obstacleContact computes, rounded identically, so the pair is closed exactly where the gap is negative.
 */
export function obstacleGap(centre: Vec3, radius: number, obstacle: ObstacleGeometry): number {
    return 0 - (radius + obstacle.radius - length(horizontal(sub(centre, obstacle.centre))));
}
```

- [ ] **Step 5: The filter in `integrate.ts`**

Header: add a paragraph after the timeline paragraph:

```ts
 *
 * A ball–obstacle pair is skipped while the ball cannot yet have reached the obstacle: each ball's horizontal path
 * length is summed, and a pair found open is not evaluated again until the ball has travelled its gap (less
 * WAKE_MARGIN). The filter is exact: a skipped pair is open, so evaluating it would add no force and change no state,
 * and the pairs evaluated are visited, and their forces summed, in the same order.
```

Imports: the vec3 import becomes
`import { ZERO, add, cross, dot, horizontal, length, scale, sub, vec3, type Vec3 } from "../math/vec3";`, and
`obstacleGap` joins the `./contacts` import (after `headLowestPoint`).

After `IMPACT_CAP`, add:

```ts
/**
 * Slack (m) subtracted from a ball–obstacle pair's gap before it is skipped (see the file header). Numerical, not
 * physical: it covers the drift between a ball's summed path length and its rounded position updates. A step rounds
 * each horizontal coordinate by at most half an ulp (about 2e-15 m on a full-size lawn), so the ball's distance from
 * an obstacle by at most √2 times that. At the default IMPACT_DT and IMPACT_CAP (12,000 steps) the drift stays under
 * 1e-10 m; a test's finer step, on coordinates under 1 m, drifts less.
 */
const WAKE_MARGIN = 1e-9;
```

The `ImpactSetup.obstacles` comment becomes:

```ts
    /**
     * Hoop uprights, then the peg (obstaclesOf order); every ball is paired with each; pairs a ball cannot yet reach
     * are skipped.
     */
```

`PairState` gains, after `line`:

```ts
    /** A ball–obstacle pair is skipped while ball B's path length is below this (m); 0 for every other pair. */
    wakeAt: number;
```

`advance` takes `travel: number[]` after `balls`; its comment's last sentence becomes "Returns the head's new state,
replaces each ball's in `balls` and adds each ball's horizontal path length this step to `travel`." In its ball loop,
after `balls[i] = …`, add:

```ts
        // Horizontal speed suffices, and wakes no pair early for a ball bouncing in the turf: an obstacle is a vertical
        // cylinder, its gap horizontal.
        travel[i] = (travel[i] as number) + length(horizontal(v)) * dt;
```

In `integrate`, each `PairState` gains `wakeAt: 0,` (after `line`), and after `const balls …` add
`const travel = balls.map(() => 0);`. In the pair loop, before `pairContact`, add:

```ts
            // A skipped pair was open when last evaluated: its spring is already ZERO and it has no open interval, so
            // evaluating it would change nothing.
            if (pair.kind === "ball-obstacle" && (travel[pair.b] as number) < p.wakeAt) {
                continue;
            }
```

and in the open branch, after `p.spring = ZERO;`:

```ts
                if (pair.kind === "ball-obstacle") {
                    const gap = obstacleGap(
                        (balls[pair.b] as BallState).position,
                        R,
                        setup.obstacles[pair.a] as ImpactObstacle,
                    );
                    p.wakeAt = (travel[pair.b] as number) + gap - WAKE_MARGIN;
                }
```

A pair evaluated as closed keeps its `wakeAt`, at or below the ball's `travel`, so it is evaluated again next step. The
call to `advance` becomes `state = advance(state, balls, travel, loads, setup, ballInertia, dt);`.

- [ ] **Step 6: Run the tests and verify exactness**

Run: `npx vitest run tests/engine/impact/`
Expected: PASS.
Run: `npx --yes tsx scripts/impactDigest.ts > "$CLAUDE_TEMP_DIR/digest-10-after.txt"`
Run: `cmp "$CLAUDE_TEMP_DIR/digest-10-before.txt" "$CLAUDE_TEMP_DIR/digest-10-after.txt"`
Expected: no output: the whole digest, `timeline ` lines included, is unchanged.
Run: `npx --yes tsx scripts/obstacleFuzzExact.ts > "$CLAUDE_TEMP_DIR/obstacle-10-after.txt"`
Run: `cmp "$CLAUDE_TEMP_DIR/obstacle-10-before.txt" "$CLAUDE_TEMP_DIR/obstacle-10-after.txt"`
Expected: no output: every obstacle-fuzz result, timeline and `touchingAtStart` included, is unchanged. If either
`cmp` prints anything, the filter skipped a pair that would have closed: stop and report.
Run: `rm scripts/obstacleFuzzExact.ts`
Run: `npx --yes tsx scripts/shotMix.ts`
Expected: p99 143,084, p99.9 362,050, max 408,030.
Run: `npm test`, then `SLOW_TESTS=1 npm test`
Expected: PASS.

- [ ] **Step 7: Format, check, commit**

Run `npx prettier --write src/engine/impact/contacts.ts src/engine/impact/integrate.ts
tests/engine/impact/contacts.test.ts tests/engine/impact/analytic.test.ts`, then the four checks. `git status` shows
no `scripts/obstacleFuzzExact.ts`.

```bash
git add src/engine/impact/contacts.ts src/engine/impact/integrate.ts tests/engine/impact/contacts.test.ts tests/engine/impact/analytic.test.ts
git commit -F "$CLAUDE_TEMP_DIR/msg.txt"   # "Skip ball–obstacle pairs a ball cannot yet reach"
```

---

### Task 11: Probe figures and roadmap outcomes

Records what spec §10 and exit criterion 5 ask to be recorded, not gated: the crush distance, the shortest face–ball
gap in single clean strikes, and the per-step cost. Pre-flight already printed every figure (see "Pre-flight"); the
probe is deterministic apart from its timings, so the real run's crush and face-gap lines must match those.

**Files:**
- Modify: `scripts/impactProbe.ts`, `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`

**Interfaces:**
- Consumes: `judgeFaults` (Task 8), `randomStroke`, `FUZZ_SEED`, `testWorld`, `rng`.

- [ ] **Step 1: Extend the probe**

In `scripts/impactProbe.ts`, the header's list ends, and its run line reads:

```ts
 * - the crush distance: the largest gap to an upright straight ahead that still raises 29.1.8, per head speed
 *   (C29.13.1 says 1–2 mm);
 * - face–ball gaps in single clean strikes (the P2b.1 fuzz strokes with blue alone);
 * - impact engine time per stroke and per step.
 * Run with `npx --yes tsx scripts/impactProbe.ts`; environment: REPEAT (timed runs per stroke, default 200). Not
 * part of the test suite; its output goes into the roadmap's outcomes sections.
```

The imports become:

```ts
import { judgeFaults, type StrokeContext } from "../src/engine/faults";
import { IMPACT_DT } from "../src/engine/impact/integrate";
import { add, scale, vec3, type Vec3 } from "../src/engine/math/vec3";
import { simulateImpact } from "../src/engine/impact/simulateImpact";
import { solidCylinderInertia } from "../src/engine/impact/rigidBody";
import type { ContactState, FaceMaterial, MalletHead } from "../src/engine/impact/types";
import type { BallState, BallStates, Hoop, World } from "../src/engine/types";
import { defaultWorld, hoopHalfSpan, hoopLateral, uniformLawn } from "../src/engine/world";
import { contactReference, malletReference } from "../src/reference/index";
import { testWorld } from "../tests/engine/support/fixtures";
import { drive, FUZZ_SEED, randomStroke, recorder, strike } from "../tests/engine/support/impact";
import { rng } from "../tests/engine/support/rng";
```

After `timing()`, before the calls at the end, add:

```ts
const HAMPERED: StrokeContext = {
    striker: "blue",
    kind: "single-ball",
    live: [],
    hampered: true,
    jumpAttempt: false,
    group: false,
};

/** The default world with hoop 1 moved so that its upright "1/a" stands at (x, y). */
function withUprightAt(x: number, y: number): World {
    const hoop = BASE.hoops[0] as Hoop;
    const centre = add(vec3(x, y, 0), scale(hoopLateral(hoop), -hoopHalfSpan(hoop)));
    return { ...BASE, hoops: [{ ...hoop, centre }] };
}

function crushes(gap: number, speed: number): boolean {
    const upright = (BASE.hoops[0] as Hoop).uprightRadius;
    const world = withUprightAt(BLUE.position.x + R + upright + gap, BLUE.position.y);
    const r = simulateImpact(strike(BLUE.position, { head: HEAD, face: FACE, speed }), { blue: BLUE }, world);
    return judgeFaults(HAMPERED, r).findings.some((f) => f.law === "29.1.8");
}

function crushDistance(): void {
    console.log("== Crush distance (largest gap to an upright straight ahead raising 29.1.8; C29.13.1: 1–2 mm) ==");
    for (const speed of [1, 2, 3, 4, 6]) {
        if (!crushes(0, speed)) {
            console.log(`${speed} m/s: no crush even touching`);
            continue;
        }
        if (crushes(0.02, speed)) {
            console.log(`${speed} m/s: a crush at 20 mm`);
            continue;
        }
        let lo = 0;
        let hi = 0.02;
        for (let i = 0; i < 30; i++) {
            const mid = (lo + hi) / 2;
            if (crushes(mid, speed)) {
                lo = mid;
            } else {
                hi = mid;
            }
        }
        console.log(`${speed} m/s: ${fmt(lo * 1e3, 3)} mm`);
    }
}

function faceGaps(): void {
    console.log("== Face–ball gaps in single clean strikes (2000 P2b.1 fuzz strokes, blue alone) ==");
    const world = testWorld();
    const random = rng(FUZZ_SEED);
    let strokes = 0;
    let doubles = 0;
    let oneStep = 0;
    let shortest = Infinity;
    for (let n = 0; n < 2000; n++) {
        const { contact, balls } = randomStroke(random, world);
        if (balls.red) {
            continue;
        }
        strokes++;
        const faces = simulateImpact(contact, balls, world).timeline["face/blue"] ?? [];
        if (faces.length > 1) {
            doubles++;
        }
        for (let i = 1; i < faces.length; i++) {
            const gap = (faces[i]?.start as number) - (faces[i - 1]?.end as number);
            shortest = Math.min(shortest, gap);
            if (gap < 1.5 * IMPACT_DT) {
                oneStep++;
            }
        }
    }
    console.log(
        `${strokes} strokes, ${doubles} with more than one face interval; shortest gap ` +
            `${Number.isFinite(shortest) ? `${fmt(shortest * 1e6, 1)} µs` : "none"}; one-step gaps: ${oneStep}`,
    );
}
```

In `timing()`, change the line to also print µs per step:

```ts
        console.log(
            `${stroke.name.padEnd(16)} ${steps} steps: median ${fmt(q(0.5), 3)} ms ` +
                `(${fmt((q(0.5) * 1e3) / steps, 3)} µs/step), p99 ${fmt(q(0.99), 3)} ms, max ${fmt(q(1), 3)} ms`,
        );
```

and add `crushDistance();` and `faceGaps();` before `timing();` at the end.

- [ ] **Step 2: Run the probe**

Run: `npx --yes tsx scripts/impactProbe.ts`
Expected: every section prints, and the deterministic lines match pre-flight's:

```text
== Crush distance (largest gap to an upright straight ahead raising 29.1.8; C29.13.1: 1–2 mm) ==
1 m/s: 1.088 mm
2 m/s: 2.188 mm
3 m/s: 3.261 mm
4 m/s: 4.365 mm
6 m/s: 6.549 mm
== Face–ball gaps in single clean strikes (2000 P2b.1 fuzz strokes, blue alone) ==
978 strokes, 3 with more than one face interval; shortest gap 2990.0 µs; one-step gaps: 0
```

If a line differs, or a one-step gap appears, stop and report it. The timings vary from run to run; pre-flight's
side-by-side figures are the record (Step 3), and the real run does not re-measure `main`. The stop-shot probe's
"impulse share with blue clear of the turf 0.0 %" is as on `main`. Keep the output for Step 3.

- [ ] **Step 3: Record the outcomes in the roadmap**

In the P2 row, change "P2b.2a: see its spec §1 (obstacle analytic cases; bit-identical without obstacles in reach; no
obstacle overlap handed to phase 2; fault table and ORLAC C29.20.4 sequences; crush geometry)." to "P2b.2a (met):
obstacle analytic cases (contact time, restitution, stick and slip, the peg's own material); P2b.1 bit-identical
without obstacles in reach (digest, shot mix, slow tests); no obstacle overlap handed to phase 2 (obstacle fuzz); fault
table and the C29.20.4 sequences; crush geometry, with the crush distance recorded."

Add a section before "## Provisional numbers — where each is confirmed":

```markdown
## P2b.2a outcomes carried forward (for P2b.2b)

- **Crush distance.** The largest gap to an upright straight ahead that still raises 29.1.8, on the default world
  with the sourced head and face (`scripts/impactProbe.ts`), per head speed: <copy the probe's five lines>. That is
  about 1.1 mm per m/s, so above about 1 m/s it exceeds the commentary's (C29.13.1) 1–2 mm for a real chance of a
  crush. The impact's face contact (0.8 ms, a rigid linear face) is shorter than a real one, which the commentary
  says travels up to about 1 cm in contact.
- **Face–ball gaps.** In the P2b.1 fuzz's single clean strikes: <copy the probe's line>. No gap is one step, so no
  minimum gap is applied (spec §5).
- **Cost of pairing every ball with every obstacle.** On the default world (12 uprights and the peg) it raised the
  impact's cost per step to 1.61–1.88× P2b.1's, so a reach filter skips a ball–obstacle pair while the ball cannot yet
  reach the obstacle (a per-pair travel budget, exact by construction; spec §4). With it, pre-flight measured µs/step
  against `main` side by side: centre 0.433 against 0.355 (1.22×), croquet 0.756 against 0.730 (1.04×), descending
  0.405 against 0.304 (1.33×), stop shot 0.750 against 0.585 (1.28×).
- **Obstacle contact time.** `ballObstacleContactTime` is the ball–ball analogue (0.75 ms), bounded [0.435, 1.0] ms:
  the lower bound is the Hertzian rigid-flat case, and the upper bound the largest for which the obstacle fuzz keeps
  every obstacle penetration under 0.06·R with a margin (1.5 ms gave 0.081·R). Hoop setting stiffness varying hoop by
  hoop is open through each hoop's `contactTime`; hoop-rigidity data would revisit the upper bound.
- **For P2b.2b's `simulateShot`.** It builds `StrokeContext` (deriving `group` with the Glossary's definition) and
  exports `judgeFaults` with the impact. Judgeable once its swing model exists: 29.1.13's "plays away from" (the swing
  direction) and, with a sourced per-stroke contact-time norm, 29.1.6.3. `impact-head-approaching` becomes a possible
  29.1.6.2 in single-ball strokes; the tracked swing path should integrate the re-contact instead.
- **Not used yet.** `judgeFaults` and `simulateImpact` stay internal until P2b.2b exports them.
```

Replace the two `<…>` placeholders with the lines the probe printed in Step 2 (they equal the pre-flight figures in
the "Pre-flight" section); leave no angle brackets in the committed file. The cost and contact-time bullets are
pre-filled from pre-flight.

- [ ] **Step 4: Format, check, commit**

Run `npx prettier --write scripts/impactProbe.ts`, then the four checks and `SLOW_TESTS=1 npm test`.

```bash
git add scripts/impactProbe.ts docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md
git commit -F "$CLAUDE_TEMP_DIR/msg.txt"   # "Record the crush distance and the P2b.2a outcomes"
```

---

## Self-review against the spec

| Spec | Where |
|---|---|
| §1.1 obstacle analytic cases | Task 5 (head-on, oblique stick and slip, peg's own material) |
| §1.2 bit-identity; digest field list and prefixed new lines | Tasks 1, 5, 6, 7 (digest `cmp`); Task 10 (whole digest and obstacle fuzz unchanged by the filter); Tasks 3, 7, 10 (shot mix, slow tests) |
| §1.3 no obstacle overlap handed over; fuzz never hangs, no cap, bounded penetration | Task 7 (handover), Task 9 (fuzz) |
| §1.4 every table row ±; C29.20.4.1–5; croquet re-contact never a fault | Task 8 |
| §1.5 crush geometry, distance recorded | Task 9, Task 11 |
| §3 interface: `Cylinder`/`Hoop.contactTime`, `ContactInterval`, `timeline`, `touchingAtStart`, `overlapCorrection`, `StrokeContext`, `Finding`, `FaultReport`, `judgeFaults`, context errors | Tasks 3, 6, 7, 8 |
| §4 pair kind and order, every ball × every obstacle, reach filter, zero-gap start, hard pair, geometry, law, default contact time and bounds | Tasks 2, 4, 5, 7, 10; cost in Task 11 |
| §5 timeline (rim counts, peak force, clearance, no minimum gap; turf recorded) | Task 6; shortest gap in Task 11 |
| §6 validation (touching accepted, overlap rejected, `validateWorld` contact time); handover clears obstacles | Tasks 3, 7 |
| §7 fault table, exemption and ordering, not-judged list | Task 8 (not-judged Laws have no rule; 29.1.6.3 quoted, unjudged) |
| §8 reference data | Task 2 |
| §9.1–§9.8 tests | Tasks 5 and 10, 1/6/7, 7, 7, 6, 8 and 9, 9, 9 |
| §10 pre-flight (done 2026-10-04); `ENGINE_VERSION` 0.5.0 | Pre-flight section (a record); Task 7 |
| §11 deferred | Nothing to build; per-hoop `contactTime` (Task 3) keeps hoop stiffness open |
