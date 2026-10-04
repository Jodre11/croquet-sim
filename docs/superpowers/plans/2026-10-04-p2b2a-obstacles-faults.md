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
- **`ballObstacleContactTime` bounds** are [0.435, 1.5] ms until pre-flight runs the obstacle fuzz at both.

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
  - Before Task 1, save the baseline digest (Task 1, Step 1). After Tasks 1, 5, 6 and 7, the digest's P2b.1 lines
    (every line not starting `timeline `) are byte-identical to it.
  - After Tasks 3 and 7, `npx --yes tsx scripts/shotMix.ts` prints work units p99 143,084, p99.9 362,050, max 408,030
    exactly, and `SLOW_TESTS=1 npm test` passes.
- **Slow tests** run only when `SLOW_TESTS` is set (`import.meta.env.SLOW_TESTS`).
- **Pre-flight values.** Constants marked "Provisional (pre-flight)" are fixed by pre-flight (below) before the real
  run; the real run implements the values the plan then carries.
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

Spec §10: before the real run, execute this plan literally in a scratch worktree (branched from this plan's branch;
`npm ci` first) and measure the values below. Fold each measured value into this plan's code blocks and comments, and
any finding into the spec (a further "Amended" note), commit those edits on the plan branch, and delete the scratch
worktree. Then run the plan for real.

| Value | Where | Provisional | How pre-flight fixes it |
|---|---|---|---|
| `ballObstacleContactTime` bounds | `reference/contact.json` | [4.35e-4, 1.5e-3] s | Run Task 9's obstacle fuzz (2000 strokes) with the fuzz world's hoop and peg `contactTime` set to each bound. Keep the upper bound if neither raises `impact-cap` or exceeds the penetration bound; otherwise lower it to the largest that passes and record why |
| `OBSTACLE_PENETRATION_BOUND` | `tests/engine/impact/fuzz.test.ts` | 0.2·R | 1.5× the worst obstacle-pair peak penetration over 2000 obstacle-fuzz strokes |
| Obstacle fuzz ranges | `tests/engine/support/impact.ts` (`UPRIGHT_REACH`, `PEG_REACH`) | 0.06 m, 0.1 m | The widest that raise no `impact-cap` in 2000 strokes; record the share of strokes in which an obstacle pair closes, and set `OBSTACLE_SHARE` to half of it |
| Per-step cost of every obstacle pair | `scripts/impactProbe.ts` timing | — | Compare the probe's µs/step on the default world (13 obstacles) with `main`'s (P2b.1). If it rises by more than 50 %, stop and ask the user whether to add a reach filter (spec §4) |
| Shortest face–ball gap in single clean strikes | `scripts/impactProbe.ts` | — | Record it. If any gap is one step (5 µs), stop: that is numerical chatter and the spec is revisited (§5) |
| Crush distance | `scripts/impactProbe.ts` | — | Record it per speed against C29.13.1's 1–2 mm (exit criterion 5: recorded, not gated) |
| Analytic tolerances | Tasks 5, 6 | As written there | About 2× each measured error, recorded beside it |
| Double-tap geometry | Task 6 | Wall 2 mm ahead | Confirm the first face contact releases before the wall closes, and that a second face interval follows |

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
| `src/engine/impact/contacts.ts` | `ball-obstacle` pairs and keys, `obstacleContact`, `outsideObstacle`, `pairTouching`, `faceClearance` |
| `src/engine/impact/timeline.ts` | New: the per-pair interval recorder |
| `src/engine/impact/types.ts` | `ContactInterval`; `ImpactRun.timeline`, `.touchingAtStart` |
| `src/engine/impact/integrate.ts` | `ImpactObstacle`, `ImpactSetup.obstacles`, obstacle laws, the timeline |
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
- Task 10 extends the probe and records outcomes.

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
Expected: about 3,000 lines, starting `scenario centre test-world {`.

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
`console.log(\`fuzz ${n} ${exact(p2b1(simulateImpact(contact, balls, TEST_WORLD)))}\`);`. Extend the header comment:
"Lines starting `timeline ` carry fields added after P2b.1; every other line keeps P2b.1's format, so `grep -v
'^timeline '` of a later run is byte-comparable with P2b.1's digest."

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
re-found on <date>)" to its note and report it.

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
Expected: FAIL, `FAULT_LAW_KEYS` is not exported.

- [ ] **Step 3: Add the obstacle contact time to `reference/contact.json`**

Add after `ballBallContactTime`:

```json
"ballObstacleContactTime": {
    "value": 0.00075,
    "unit": "s",
    "bounds": [0.000435, 0.0015],
    "source": "Derived from ballBallContactTime (this file): Don Gugan, 'The Physics of Croquet Strokes: Analysis of the CA high-speed DVD', section 4, Table 1 row 5 (2009; Oxford Croquet), https://oxfordcroquet.org/tech/gugan4/",
    "provenance": "derived",
    "note": "No measurement of a ball striking a hoop upright or the peg was found. Oxford Croquet's 'Measuring Hoop Rigidity' (https://oxfordcroquet.org/tech/rigidity/) proposes methods and reports no data; Rod Cross's high-speed experiments (https://oxfordcroquet.org/tech/cross1/) cover ball-ball and mallet-ball contacts only. Derivation (P2b.2a design §4): for the impact's linear law a ball meeting an immovable body has the same natural frequency as two balls meeting, since the ball-ball pair has half the stiffness (two balls in series) and half the effective mass; the analogue value is therefore ballBallContactTime, 0.75 ms. Lower bound: Hertzian contact time scales as (m*^2/(E*^2 R*))^(1/5), and a ball on a rigid body has twice the reduced mass, radius and effective modulus of two equal balls, so T x 2^(-1/5) = 0.87 T; 0.87 x 0.5 ms (the ball-ball lower bound) = 0.435 ms. Upper bound: an upright gives in the turf, which the rigid model omits and no source quantifies; 2 x 0.75 ms is a modelling allowance, exercised by the obstacle fuzz at both bounds (P2b.2a pre-flight). Every hoop and the peg carries its own contact time (World), so a later version can vary hoop setting stiffness hoop by hoop or by lawn."
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
    "note": "Judged on the first mallet contact only, C29.10.8: \"The fault of striking the ball with part of the mallet other than the end-face, covered by this law, applies only to the first contact. Any subsequent contact, however it occurs, is covered by Law 29.1.6.2 (multiple contacts between mallet and striker’s ball) and the exemptions specified in Law 29.2.4\". The impact models the end-face and its rim: a first contact at the rim (impact-off-face) is a contact other than an end-face. Applies only to the strokes of Law 29.2.3 (StrokeContext.hampered, jumpAttempt, group)."
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
Expected: FAIL (type errors on `contactTime`; `hoopWithUprightAt` is not exported).

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

In `uprightsOf`, give both cylinders `contactTime: hoop.contactTime` (after `material`). In `validateWorld`, after the
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
zero-gap placement, the touching test and the face clearance the timeline needs. Nothing calls them yet.

**Files:**
- Modify: `src/engine/impact/contacts.ts`
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
        expect(pairs.map((p) => p.key).slice(5)).toEqual(["turf/red", "blue@1/a", "blue@peg", "red@1/a", "red@peg"]);
        expect(pairs.slice(6).map((p) => [p.kind, p.a, p.b])).toEqual([
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
        expect(c.point.x).toBeCloseTo(1 - 0.008 - 5e-5, 12);
        expect(c.point.z).toBe(0.3);
    });

    it("is open at or beyond R + r", () => {
        expect(obstacleContact(vec3(1, 2 + R + 0.008, R), R, POST)).toBeNull();
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
});

describe("pairTouching", () => {
    const pairs = pairList(["blue", "red"], [true, true], ["1/a"]);
    const byKey = (key: string) => pairs.find((p) => p.key === key) as (typeof pairs)[number];
    const at = (x: number, y: number): BallState => ({ position: vec3(x, y, R), velocity: ZERO, angularVelocity: ZERO });

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
Expected: FAIL (the new exports do not exist).

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

/** Bound on outsideObstacle's corrections. Numerical, not physical: each removes the last ulps of an overlap. */
const OUTSIDE_STEPS = 16;

/**
 * `centre` moved horizontally outward from `obstacle` until its penetration R + r − d is at most zero, as
 * obstacleContact computes it; or `centre` itself when it already is (P2b.2a design §4, §6). The target distance grows
 * by an ulp per correction until rounding no longer leaves the ball inside. Throws a RangeError for a centre on the
 * axis (no outward direction), and an Error if the corrections run out.
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
    let target = reach;
    for (let i = 0; i < OUTSIDE_STEPS; i++) {
        const f = target / distance;
        const moved = vec3(obstacle.centre.x + offset.x * f, obstacle.centre.y + offset.y * f, centre.z);
        if (!(reach - length(horizontal(sub(moved, obstacle.centre))) > 0)) {
            return moved;
        }
        target += target * Number.EPSILON;
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/impact/contacts.test.ts`
Expected: PASS. Then `npm test`: PASS (`pairList`'s existing keys are unchanged).

- [ ] **Step 5: Format, check, commit**

```bash
git add src/engine/impact/contacts.ts tests/engine/impact/contacts.test.ts
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
        // Provisional (pre-flight): the same one-step resolution as the ball–ball case.
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
        // Provisional (pre-flight): the normal's turn shifts the ratio by about 7e-5.
        expect(Math.abs(dvt / dvn - mu)).toBeLessThan(2e-4);
        expect(Math.abs(spin - spinOf(dvt)) / Math.abs(spinOf(dvt))).toBeLessThan(2e-3);
    });

    it("sticks inside the cone: the tangential impulse stays below μ times the normal one", () => {
        const mu = 0.1;
        const { dvn, dvt, spin } = oblique(0.2, mu);
        // A sticking contact returns at most 2·(2/7)·v_t = 0.114 m/s; the cone allows μ·1.6 = 0.16.
        expect(dvt).toBeLessThan(0);
        expect(dvt / dvn).toBeLessThan(0.9 * mu);
        expect(Math.abs(spin - spinOf(dvt)) / Math.abs(spinOf(dvt))).toBeLessThan(2e-3);
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
        expect(Math.abs((run.balls.blue?.velocity.x as number) + 0.4) / 0.4).toBeLessThan(LAW_TOLERANCE);
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/engine/impact/analytic.test.ts`
Expected: FAIL (`ImpactObstacle` is not exported; `obstacles` is not a setup field).

- [ ] **Step 3: Implement in `integrate.ts`**

In the header, change "no face–ball or ball–ball contact has been closed for RELEASE_STEPS steps" to "no face–ball,
ball–ball or ball–obstacle contact has been closed for RELEASE_STEPS steps", and add after "…exactly mirrored
results.": "Obstacles (hoop uprights and the peg) are immovable: a ball–obstacle pair's force acts on the ball alone."
Change the `RELEASE_STEPS` comment's first sentence to "Consecutive steps without a closed face–ball, ball–ball or
ball–obstacle contact after which the impact may end."

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

In `lawOf`, add the case:

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

Add to its header comment: "Each obstacle's law is solved once: the ball's mass (the obstacle is immovable), the
obstacle's material and its own contact time."

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
import {
    IMPACT_DT,
    integrate,
    type ImpactObstacle,
    type ImpactSnapshot,
} from "../../../src/engine/impact/integrate";
import { IDENTITY } from "../../../src/engine/impact/rigidBody";
import {
    closeTimeline,
    emptyTimeline,
    inGap,
    noteClearance,
    recordStep,
} from "../../../src/engine/impact/timeline";
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
        // Provisional (pre-flight): 2 mm leaves the first face contact released before the wall closes.
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
        expect(faces.length).toBeGreaterThanOrEqual(2);
        const [first, second] = faces as [ContactInterval, ContactInterval];
        // The face plane reaches the ball during step 10 (gap / speed = 10.1 steps): the pair is closed from step 11.
        expect(first.start).toBe(11 * IMPACT_DT);
        // Clamped law: the force releases with δ = c·e·v/k still positive, which then closes at e·v: c/k later.
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
        expect(run.timeline["turf/blue"]).toEqual([{ start: 0, end: run.duration, peakForce: expect.any(Number) }]);
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
Expected: FAIL (`timeline.ts` does not exist).

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
normal force: change its return type to `number`, its comment's first sentence to "The normal and tangential force of
one closed pair, from the current state; returns the normal force (N).", and add `return normal;` at its end.

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
Expected: no output. Spot-check one `timeline scenario centre` line: `face/blue` has one interval, `turf/blue` one
from 0.

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
Expected: FAIL (version, the overlap message, zero gap, the `obstacles` parameter).

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
`./contacts`. Change the `Handover.overlapCorrection` comment to "the largest overlap (m) removed from a pair of balls
or a ball and an obstacle".

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

(Import `type BallId` from `../types`.) Change `handover`'s signature and comment ("…separates overlapping pairs and
clears balls from `obstacles` (see the file header). Throws an Error, naming the worst pair…") to
`export function handover(balls: BallStates, radius: number, obstacles: readonly ObstacleGeometry[] = [], passes =
HANDOVER_PASSES): Handover`. Inside the pass loop, after the ball–ball loops, add:

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
P2b.2b exports it. Read the spec's §7 table and the "Decisions made while planning" above before starting.

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
        expect(judgeFaults(SINGLE, touched).findings[0]).toMatchObject({ ball: "red", t: T, evidence: { peakForce: 30 } });
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
    const cases: [string, Record<string, readonly ContactInterval[]>, string[]][] = [
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
            { "face/blue": [iv(0, T), iv(6 * T, 7 * T)], "blue/red": [iv(2 * T, 3 * T)], "blue@1/a": [iv(4 * T, 5 * T)] },
            ["29.1.6.2 fault"],
        ],
        [
            "C29.20.4.4: mallet, roquet, mallet, object — no fault",
            { "face/blue": [iv(0, T), iv(4 * T, 5 * T)], "blue/red": [iv(2 * T, 3 * T)], "blue@1/a": [iv(6 * T, 7 * T)] },
            [],
        ],
        [
            "C29.20.4.5: mallet, object, roquet, mallet — no fault",
            { "face/blue": [iv(0, T), iv(6 * T, 7 * T)], "blue@1/a": [iv(2 * T, 3 * T)], "blue/red": [iv(4 * T, 5 * T)] },
            [],
        ],
        [
            "a mallet contact starting with the roquet is after it — no fault",
            { "face/blue": [iv(0, T), iv(2 * T, 3 * T)], "blue/red": [iv(2 * T, 3 * T)] },
            [],
        ],
        [
            "a mallet contact open when the roquet starts is one contact, before it — no fault",
            { "face/blue": [iv(0, 3 * T)], "blue/red": [iv(2 * T, 4 * T)] },
            [],
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

    it.each(cases)("%s", (_label, timeline, expected) => {
        const context: StrokeContext = { ...SINGLE, live: ["red"] };
        expect(laws(judgeFaults(context, impact({ timeline })))).toEqual(expected);
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
        ["a croquet stroke without a croqueted ball", { ...SINGLE, kind: "croquet", live: [] }, two, /needs a croqueted/],
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
        add("29.1.6.2", "fault", striker, (contacts[1] as ContactInterval).start, contactEvidence(contacts.length, faces));
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
        if (face && !exempt(view, first.start)) {
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
Expected: PASS. Then `npm test` and `npm run lint` (the determinism lint covers the new file): PASS.

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

    it("does not for a ball 20 mm from it", () => {
        const world = uprightAt(10 + R + r + 0.02, 10);
        expect(laws(HAMPERED, strike(BLUE.position, { speed: 3 }), { blue: BLUE }, world)).not.toContain("29.1.8");
    });
});

describe("a ball touching an upright", () => {
    it.each([
        ["exactly", 0],
        ["overlapping by rounding", 5e-10],
    ])("struck directly away from it (touching %s) raises neither 29.1.8 nor 29.1.9", (_label, overlap) => {
        const world = uprightAt(10 - R - r + overlap, 10);
        const result = simulateImpact(strike(BLUE.position, { speed: 2 }), { blue: BLUE }, world);
        expect(result.touchingAtStart).toEqual(["blue@1/a"]);
        expect(result.timeline["blue@1/a"]).toBeUndefined();
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

/** Provisional (pre-flight): the widest reach that raises no impact-cap. Surface gap (m) from blue to upright 1/a. */
const UPRIGHT_REACH = 0.06;
/** Provisional (pre-flight): surface gap (m) from blue to the peg. */
const PEG_REACH = 0.1;

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
    for (;;) {
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
        } catch {
            continue;
        }
        return { contact, balls, world };
    }
}
```

(Import `length` from vec3 and `uprightsOf` from `world.ts`.)

- [ ] **Step 3: Add the obstacle fuzz to `tests/engine/impact/fuzz.test.ts`**

Add `OBSTACLE_FUZZ_SEED`, `randomObstacleStroke` to the support import. Append:

```ts
/** Provisional (pre-flight): 1.5× the worst obstacle-pair penetration over 2000 obstacle-fuzz strokes. */
const OBSTACLE_PENETRATION_BOUND = 0.2 * R;
/** Provisional (pre-flight): half the measured share of strokes in which an obstacle pair closes. */
const OBSTACLE_SHARE = 0.1;

describe("obstacle fuzz", () => {
    const count = import.meta.env.SLOW_TESTS ? 2000 : 200;

    it(`ends, never hits the cap, keeps penetrations bounded and hands over cleanly over ${count} strokes`, {
        timeout: 600_000,
    }, () => {
        const random = rng(OBSTACLE_FUZZ_SEED);
        let touched = 0;
        for (let n = 0; n < count; n++) {
            const { contact, balls, world } = randomObstacleStroke(random, WORLD);
            const result = simulateImpact(contact, balls, world);
            expect(result.events.some((e) => e.kind === "impact-cap"), `stroke ${n}`).toBe(false);
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
    });
});
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/engine/impact/obstacles.test.ts tests/engine/impact/fuzz.test.ts`
Expected: PASS. Then `SLOW_TESTS=1 npx vitest run tests/engine/impact/fuzz.test.ts`: PASS.

- [ ] **Step 5: Format, check, commit**

```bash
git add tests/engine/impact/obstacles.test.ts tests/engine/support/impact.ts tests/engine/impact/fuzz.test.ts
git commit -F "$CLAUDE_TEMP_DIR/msg.txt"   # "Test crushes, touching starts and an obstacle fuzz through real impacts"
```

---

### Task 10: Probe figures and roadmap outcomes

Records what spec §10 and exit criterion 5 ask to be recorded, not gated: the crush distance, the shortest face–ball
gap in single clean strikes, and the per-step cost.

**Files:**
- Modify: `scripts/impactProbe.ts`, `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`

**Interfaces:**
- Consumes: `judgeFaults` (Task 8), `randomStroke`, `FUZZ_SEED`, `testWorld`, `rng`.

- [ ] **Step 1: Extend the probe**

In `scripts/impactProbe.ts`, update the header list with "- the crush distance: the largest gap to an upright straight
ahead that still raises 29.1.8, per head speed (C29.13.1 says 1–2 mm); - face–ball gaps in single clean strikes (the
P2b.1 fuzz strokes with blue alone); - impact engine time per stroke and per step." and its last sentence with "its
output goes into the roadmap's outcomes sections." Add imports:

```ts
import { judgeFaults, type StrokeContext } from "../src/engine/faults";
import { IMPACT_DT } from "../src/engine/impact/integrate";
import type { Hoop } from "../src/engine/types";
import { hoopHalfSpan, hoopLateral } from "../src/engine/world";
import { add, scale } from "../src/engine/math/vec3";
import { testWorld } from "../tests/engine/support/fixtures";
import { FUZZ_SEED, randomStroke } from "../tests/engine/support/impact";
import { rng } from "../tests/engine/support/rng";
```

(merge with the existing imports of the same modules). Before `sweep()`'s call, add:

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
Expected: every section prints. No one-step face gaps (pre-flight has confirmed it; if one appears now, stop and report
it). Keep the output for Step 3.

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
  with the sourced head and face (`scripts/impactProbe.ts`), per head speed: <copy the probe's five lines>. The
  commentary (C29.13.1) puts a real chance of a crush within 1–2 mm. The impact's face contact (0.8 ms, a rigid
  linear face) is shorter than a real one, which the commentary says travels up to about 1 cm in contact.
- **Face–ball gaps.** In the P2b.1 fuzz's single clean strikes: <copy the probe's line>. No gap is one step, so no
  minimum gap is applied (spec §5).
- **Cost of pairing every ball with every obstacle.** <the probe's µs/step on the default world> against P2b.1's
  <the pre-flight figure from `main`>; no reach filter (spec §4).
- **Obstacle contact time.** `ballObstacleContactTime` is the ball–ball analogue (0.75 ms); the obstacle fuzz passes
  across its bounds (<the bounds pre-flight settled>). Hoop setting stiffness varying hoop by hoop is open through
  each hoop's `contactTime`.
- **For P2b.2b's `simulateShot`.** It builds `StrokeContext` (deriving `group` with the Glossary's definition) and
  exports `judgeFaults` with the impact. Judgeable once its swing model exists: 29.1.13's "plays away from" (the swing
  direction) and, with a sourced per-stroke contact-time norm, 29.1.6.3. `impact-head-approaching` becomes a possible
  29.1.6.2 in single-ball strokes; the tracked swing path should integrate the re-contact instead.
- **Not used yet.** `judgeFaults` and `simulateImpact` stay internal until P2b.2b exports them.
```

Replace each `<…>` with the figure the probe printed (and, for the cost and bounds, the figures pre-flight recorded);
leave no angle brackets in the committed file.

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
| §1.2 bit-identity; digest field list and prefixed new lines | Tasks 1, 5, 6, 7 (digest `cmp`); Tasks 3, 7 (shot mix, slow tests) |
| §1.3 no obstacle overlap handed over; fuzz never hangs, no cap, bounded penetration | Task 7 (handover), Task 9 (fuzz) |
| §1.4 every table row ±; C29.20.4.1–5; croquet re-contact never a fault | Task 8 |
| §1.5 crush geometry, distance recorded | Task 9, Task 10 |
| §3 interface: `Cylinder`/`Hoop.contactTime`, `ContactInterval`, `timeline`, `touchingAtStart`, `overlapCorrection`, `StrokeContext`, `Finding`, `FaultReport`, `judgeFaults`, context errors | Tasks 3, 6, 7, 8 |
| §4 pair kind and order, every ball × every obstacle, zero-gap start, hard pair, geometry, law, default contact time | Tasks 2, 4, 5, 7 |
| §5 timeline (rim counts, peak force, clearance, no minimum gap; turf recorded) | Task 6; shortest gap in Task 10 |
| §6 validation (touching accepted, overlap rejected, `validateWorld` contact time); handover clears obstacles | Tasks 3, 7 |
| §7 fault table, exemption and ordering, not-judged list | Task 8 (not-judged Laws have no rule; 29.1.6.3 quoted, unjudged) |
| §8 reference data | Task 2 |
| §9.1–§9.8 tests | Tasks 5, 1/6/7, 7, 7, 6, 8 and 9, 9, 9 |
| §10 pre-flight; `ENGINE_VERSION` 0.5.0 | Pre-flight section; Task 7 |
| §11 deferred | Nothing to build; per-hoop `contactTime` (Task 3) keeps hoop stiffness open |
