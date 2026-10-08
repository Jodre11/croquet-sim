# P2b.2b.2a — The Whole Stroke: Backswing, Downswing and Follow-Through Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A player controls a stroke by how far the mallet is taken back and how hard and quickly it is swung, not by
a speed. This phase models the head from the backswing's top, through the downswing, the existing impact and the
follow-through to the finish. The head's speed at contact becomes an outcome.

**Architecture:**

- `ShotSetup.stroke.speed` gives way to `backswing` (m) and `intensity?` ([0, 1]).
- A new `src/engine/swing/downswing.ts` builds the contact-free downswing:
  - swing mode integrates the pendulum, under gravity and the player's effort pulse, with the hands slaved to its
    angle;
  - carry mode is closed-form, the hands leading on their own tempo.
- `SwingArc` gains an optional `downswing`. Before a drive window begins, `track.ts` reads the path from it, so the
  impact starts a lead before contact anywhere on the real downswing. That lead now also covers a turf strike.
- With `trajectory: true`, `integrate` continues the same loop after the end rule with the balls removed, up to the
  stroke type's finish.
- `swing/trajectory.ts` stitches the downswing, the impact and the follow-through into one `SwingTrajectory`.
- A sourcing pass and `scripts/fitStrokeShape.ts` fill `reference/swing.json`, from which `defaultProfile.shape` and
  the canonical setups' backswings come.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Vitest, ESLint, Prettier. No new dependencies;
`npx --yes tsx` runs the scripts.

**Spec:** `docs/superpowers/specs/2026-10-06-p2b2b2a-stroke-shape-design.md`. Read all of it, including its "Amended
2026-10-07" note. Also read:

- **Swing spec:** `docs/superpowers/specs/2026-10-04-p2b2b1-swing-shot-design.md`: §3.2 the path, §3.3 the hands,
  §3.5 the end rule, §5 the swing model, §6 `simulateShot`.
- **Roadmap:** `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`. Read the P2 and P3 rows, "P2b.2
  decisions" and "P2b.2b.1 outcomes carried forward".
- **The previous plan:** `docs/superpowers/plans/2026-10-04-p2b2b1-swing-shot.md`, for the conventions this plan
  keeps. Read its "Global Constraints" and its Task 8 (the swing model) and Task 10 (`simulateShot`).

**Decisions made while planning** (each folded into the spec's amendment note in Task 10):

- **No pre-flight.** Unlike P2b.2b.1, this plan has no separate pre-flight run.
  - Every test asserts an analytic property or a qualitative mechanism. Figures that only a run can give are measured
    by `scripts/strokeProbe.ts` (Task 10) and recorded in the roadmap.
  - Where a behaviour test fails, apply the rule under "Global Constraints".
- **Carry mode is evaluated in closed form, not interpolated from a table** (spec §3.4 says "tabulated at the same
  step").
  - The closed form is exact and cheaper. The turf scan still visits it at every `FREE_STEP`, so the scan is the
    same.
  - Swing mode keeps the table.
- **The hands' planned path before contact is a function of time.**
  - In swing mode, σ(t) comes from the downswing table's θ(t). In carry mode, σ(t) = (t − t_r)/T_h.
  - An early pendulum window replaces the pendulum's dynamics only (spec §3.5); the hands keep the table's σ(t)
    until their own window. An early hands window replaces the hands' path likewise.
  - This keeps the two arcs independently timed, as in P2b.2b.1.
- **The dip is not felt by the pendulum before contact.**
  - The downswing table is contact-free and dipless. A dip timed early still lowers the pivot in `pathAt`, whose
    derivatives stay exact, but the table's θ does not respond to it.
  - P2b.2b.1's free pendulum after the window does include the dip, and keeps it.
- **`StrokeSample` gains `velocity`**, the head centre's velocity.
  - Exit criterion 3 bounds the velocity's continuity at every segment boundary, and samples of position alone
    cannot show it.
  - P2b.2b.3 needs the velocity too.
- **`buildContact` is split** so the solver and the fit can compute a planned speed without preparing a track:
  - `contactPose` covers steps 1–5;
  - `planStroke` covers the whole contact, the approach and the contact speed, computing the turf scan once
    (spec "the turf scan and `swingApproach` share one pass");
  - `buildContact(setup, world)` is `planStroke(setup, world).contact`;
  - `plannedSpeed(setup, world)` is the pose and the downswing only. `simulateShot` uses `planStroke`.
- **The follow-through is a second loop, not a flag through the main one.**
  - `integrateStroke` runs the impact exactly as `integrate` does, records head samples, fixes the run, then
    continues on its own small loop with no pairs but the head–turf pair.
  - That loop uses a fresh head–turf timeline, so the run's `timeline` arrays are never mutated after `finish`.
  - The spring and the grip state carry over.
  - `integrate` is `integrateStroke` without the follow-through, so force tables and `integrate`'s callers are
    bit-identical.
- **A finish's kind comes from the prepared drive:** carry mode → `carry`; swing mode with `arc.alpha < 0` (a check)
  → `check`; otherwise `swing`. With `DEFAULT_DRIVE`, this gives the spec's per-type assignment.
- **`SwingShape` carries both `effort` and `handTempo` for every stroke type**, as the spec's interface does.
  - A mode reads only its own. The default profile fills the unread member from the read one, as
    `defaultProfile`'s comment says.
  - The test profile sets both.
- **Unsourced shape figures take labelled placeholders, which the user confirms at Task 1's gate.** The placeholder
  rules:
  - **`pendulumShare`:** 1 for the swing presets (spec §3.3). For a roll, 1 − its P2b.2b.1 `handShare` (half roll
    0.4, full roll 0.1, pass roll 0.15).
  - **`handAngle`:** 30° (0.5236 rad) for every roll; unread by the swing presets.
  - **`handTempo.slow` for a roll:** the single-ball preset's gravity-only fall time from its h₀, so a roll's
    unhurried tempo matches a pendulum's.

## Global Constraints

- **Formatting.**
  - 4-space indentation, 120-column limit, LF line endings, UTF-8.
  - Check lengths with `env LC_ALL=en_GB.UTF-8 grep -nE "^[^|].{120,}$" <file>`; table rows in markdown are exempt.
  - Run `npx prettier --write` on every code file you touch; `npm run format:check` must pass.
  - `.prettierignore` lists `docs/`, so wrap markdown by hand. Prettier does not re-wrap comments or strings, so wrap
    any comment over 120 columns by hand, and split any template literal over 120 columns with `+`.
  - JSON `quote`, `source` and `note` strings stay on one line, as in the existing reference files.
- **Engine purity.**
  - `src/engine/**` is pure and deterministic: no DOM, no time of day, no randomness.
  - Iterate balls in `BALL_IDS` order and pairs in pair-list order. The head–turf pair comes after every other pair.
- **Determinism lint.**
  - Engine code uses only IEEE-exact operations: `+ − * /`, comparisons, `Math.sqrt`, `Math.abs`, `Math.min`,
    `Math.max`, `Math.round`, `Math.floor`, `Math.ceil`, the constant `Math.PI`, and the engine's own `sinCos` and
    `atan2` (`src/engine/math/elementary.ts`).
  - No `Math.sin/cos/acos/atan2/asin/exp/log/pow/hypot` and no `**` in engine code. `npm run lint` enforces it.
  - arccos is `atan2(√(1 − c²), c)`.
  - Tests and scripts may use any `Math` function.
- **Style.**
  - No non-null assertions (`!`); the repo style is `x as T` after indexing.
  - Braces on every `if`.
  - Write `0 - x` rather than unary minus in engine arithmetic, so that mirrored set-ups stay exact.
  - Exported functions carry a header comment. A named numerical constant says why it is not physical.
  - Use `import type` for type-only imports (`verbatimModuleSyntax`).
  - Argument lists: all on one line, or each on its own line, which they must be when there are more than three or
    the line would pass 120 columns.
- **Units.** SI. Time inside the impact is s from its start (t = 0, a lead L before contact); time on the downswing
  and in `SwingTrajectory` is s from contact (negative before it).
- **Engine version.** `ENGINE_VERSION` becomes `"0.7.0"` (Task 9).
- **Force tables stay bit-identical to P2b.2b.1** (exit criterion 4).
  - Task 2 Step 1 saves the baseline digest.
  - After Tasks 2, 7 and 9, `scripts/impactDigest.ts` with `OBSTACLE_STROKES=2000` is byte-identical to it (`cmp`).
  - After Task 9, `npx --yes tsx scripts/shotMix.ts` prints work units p99 143,084, p99.9 362,050 and max 408,030
    exactly, and `SLOW_TESTS=1 npm test` passes.
- **Slow tests** run only when `SLOW_TESTS` is set (`import.meta.env.SLOW_TESTS`).
- **RED steps.** Vitest does not type-check. Where a test uses a missing export or field, the RED run shows runtime
  failures (`… is not a function`, `Cannot read properties of undefined`, an assertion on `undefined`, or
  `Cannot find module …`), and `npm run check` shows the type errors.
- **Behaviour figures.** A test that rests on model behaviour carries its reasoning in a comment.
  - Where one fails, trace the mechanism (snapshots, the probe) before changing an expectation. Fix the code if it
    departs from the spec.
  - A changed expectation, preset or constant goes to the user if it touches the spec, and is folded into the spec's
    amendment note and this plan.
- **Circularity.** Nothing in this phase is tuned to a coaching ratio (spec §6.2; roadmap "P2b.2 decisions"). The
  ratios are only recorded.
- **Bash.** One command per call: no `&&`, `||`, `;`, `$(…)` or subshells. Redirecting a script's output to a file
  with `>` is allowed.
- **The temp directory.** `<temp>` in a Run line is the literal session temp path,
  `/tmp/claude-1618a1b2-741c-45aa-b361-1ef503149581`, written out in full: worktree sessions refuse
  `$CLAUDE_TEMP_DIR`. A subagent is given this literal path in its prompt.
- **Commits.**
  - Short imperative sentence (repo style), signed.
  - Write the message to a fresh file `<temp>/msg-<task>.txt` and commit with `git commit -F <that path>`. Signing
    works inside the sandbox; never disable it, and never tell a subagent to.
  - Check with `git log -1 "--format=%G? %h"` (expect `G`; quote the format, as zsh globs `?`). If signing refuses,
    leave the change staged and report it.
  - Never use `--no-verify`, `-c commit.gpgsign=false` or bare `git stash`.
- **Checks after every task:** `npm test`, `npm run lint`, `npm run check` and `npm run format:check` all pass.
- **Known noise.** The editor's TypeScript LSP reports spurious "Cannot find module/name" diagnostics. `npm run
  check` is the source of truth.
- **Worktree.** All work happens in `/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2a-stroke-shape` on
  branch `worktree-p2b2b2a-stroke-shape`. A fresh worktree needs `npm ci` before any test run.

## Review Focus

The spec implies each input below, but none of its listed tests exercises it. The task that owns each one pins it
with a test.

1. **A tiny backswing.** A 2 mm backswing at intensity 0 must give a small, positive planned speed (no stall, no
   RangeError), run its impact and end before the cap. Pinned in Task 6 ("plays a 2 mm backswing as a gentle
   tap").
2. **A full backswing at full intensity.** A backswing that takes the shaft to 85° at intensity 1, with the default
   placeholder effort, must integrate to contact with a finite speed above the gravity-only one. Its pulse may be
   clipped at contact. Pinned in Task 3 ("integrates a near-horizontal backswing at full intensity").
3. **Any aim on the downswing.** With aim π, −π/2 or 7 rad, the release pose must put the head behind the ball
   along −aim. Pinned in Task 6 ("starts the downswing behind the ball along any aim"). Task 8's trajectory test
   checks that the first sample is the release pose.
4. **The lead's two sources.** A downswing meeting the turf, combined with an action timed earlier than the turf
   lead, starts at the action's lead; an action timed later than it starts at the turf's. A slow, low swing whose
   turf lead passes `MAX_LEAD` is rejected, naming the turf, not an action. Pinned in Task 6 ("takes the larger of the
   action's lead and the turf's" and "rejects a downswing that meets the turf more than MAX_LEAD early").
5. **A follow-through that is already finished.** A stop whose head is at rest relative to the hands when the impact
   ends must finish at the impact's end, with one boundary sample and no extra step. A carry whose reach never binds
   finishes on speed alone or caps. Pinned in Task 7 ("finishes at the impact's end when the head is already at
   rest" and "caps a carry whose hands never stop").

---
## File Structure

| Path | Change |
|---|---|
| `reference/swing.json` | New: sourced stroke-shape figures (Task 1); the fit's derived entries (Task 4) |
| `reference/sources/` | New: raw fetched text and extracted figures (Task 1) |
| `reference/README.md` | The `provisional` field; swing.json's per-type layout (Task 1) |
| `src/reference/schema.ts` | `Sourced.provisional?` (Task 1) |
| `src/reference/index.ts` | `swingReference` (Task 1 sourced fields, Task 4 derived fields) |
| `src/engine/impact/types.ts` | `Downswing`; `SwingArc.downswing?` (Task 2) |
| `src/engine/impact/track.ts` | `downswingAt`, `downswingHands`, `downswingSamples`, `pendulumOf`, `handsAt`; the pre-window branches; `omegaArc`, `pivotVelocityHand`; `FREE_SPAN` 1.2 (Task 2) |
| `src/engine/impact/simulateImpact.ts` | Downswing validation (Task 2); `simulateStroke` (Task 7) |
| `src/engine/swing/types.ts` | `SwingShape` (Task 3); `ShotSetup.stroke.backswing`, `.intensity`; `SwingProfile.shape`; `SwingDrive` loses `handShare` (Task 5) |
| `src/engine/swing/downswing.ts` | New: `MAX_BACK_ANGLE`, `MAX_FALL`, `planDownswing`, `scanDownswing` (Task 3) |
| `src/engine/swing/buildContact.ts` | `contactPose` (Task 4); `planStroke`, `plannedSpeed`, `MAX_LEAD` 0.15, `TURF_MARGIN`, the rejections, `swingApproach` from the downswing (Task 5) |
| `src/engine/swing/profile.ts` | `shape` from `swingReference`; `handShare` removed (Task 5) |
| `src/engine/impact/integrate.ts` | `integrateStroke`, `FollowThrough`, `FOLLOW_CAP`, `FOLLOW_SAMPLE`, `FINISH_SPEED`; `WAKE_MARGIN`'s comment (Tasks 7, 10) |
| `src/engine/swing/trajectory.ts` | New: `StrokeSample`, `SwingTrajectory`, `strokeTrajectory` (Task 8) |
| `src/engine/shot.ts` | `ShotOptions`; `simulateShot(setup, world?, options?)`; `contactSpeed`, `trajectory`; world wins over `lawnSpeed` (Task 8) |
| `src/engine/index.ts`, `src/engine/simulate.ts` | Exports; `ENGINE_VERSION` 0.7.0 (Task 9) |
| `scripts/fitStrokeShape.ts` | New: the §6.2 fit (Task 4) |
| `scripts/strokeProbe.ts` | New: the §8 measurements (Task 10) |
| `scripts/swingProbe.ts` | Migrated to `backswing` (Task 5) |
| `tests/reference/reference.test.ts` | `swingReference` (Tasks 1, 4) |
| `tests/engine/impact/track.test.ts` | The downswing branch (Task 2) |
| `tests/engine/swing/downswing.test.ts` | New: analytic cases (Task 3) |
| `tests/engine/swing/buildContact.test.ts` | `contactPose` (Task 4); migrated, rejections (Task 5); the lead, the fat stroke (Task 6) |
| `tests/engine/support/shot.ts` | `testProfile` gains `shape`; `canonicalSetup` takes the default backswing; `backswingFor` (Task 5) |
| `tests/engine/shot.test.ts`, `tests/engine/index.test.ts` | Migrated (Task 5); trajectory and exit criteria (Task 8); exports (Task 9) |
| `tests/engine/impact/followThrough.test.ts` | New: the follow-through (Task 7) |
| `tests/engine/swing/trajectory.test.ts` | New: the trajectory (Task 8) |
| `docs/superpowers/specs/2026-10-04-p2b2b1-swing-shot-design.md` | Spec §9's amendments (Task 10) |
| `docs/superpowers/specs/2026-10-06-p2b2b2a-stroke-shape-design.md` | This plan's decisions in its amendment note (Task 10) |
| `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md` | Spec §11's changes; outcomes (Task 10) |
| `docs/superpowers/probes/` | New: the probe's raw output (Task 10) |

Each task keeps every commit green, and force tables stay bit-identical throughout:

- **Task 1** adds sourced data and its loader. It ends at a gate where the user confirms `swing.json`.
- **Task 2** lets the path read a downswing table; nothing supplies one yet.
- **Task 3** adds the downswing as pure functions.
- **Task 4** extracts `contactPose` and adds the fit. The fit writes the derived defaults and the loader reads them.
- **Task 5** switches the swing model to `backswing` and migrates every caller.
- **Task 6** pins the lead, the fat stroke and the review-focus inputs on the switched model.
- **Task 7** adds the follow-through to the integrator.
- **Task 8** adds the trajectory and the new `simulateShot`.
- **Task 9** adds the exports and the version, and runs the bit-identity gates.
- **Task 10** adds the probe and records the outcomes, the roadmap and the spec amendments.

---
### Task 1: Source the stroke shape into `reference/swing.json`

Spec §6.1. This task gathers, for each stroke type, the figures that the fit (Task 4) and the defaults consume:

- the backswing range;
- the split between the pendulum and the hands, and the hands' angle;
- kinematic pairs, if found;
- the finish;
- the roll's tempo.

Every figure carries its provenance and a quotation. A figure that is not found gets the placeholder rule in
"Decisions made while planning", marked `"provisional": "placeholder"`. Sourcing is bounded: do not chase data the
fit does not consume (spec §6.1, last sentence; the review's subtraction). The task ends at a user gate.

**Files:**
- Create: `reference/swing.json`, `reference/sources/README.md`, `reference/sources/*.html.txt`
- Modify: `.prettierignore`, `reference/README.md`, `src/reference/schema.ts`, `src/reference/index.ts`
- Test: `tests/reference/schema.test.ts`, `tests/reference/reference.test.ts`

**Interfaces:**
- Produces:
  - `Sourced.provisional?: "placeholder"` (schema.ts);
  - `SWING_REFERENCE_TYPES` (the seven stroke types in the presets' order) and `type SwingReferenceType`;
  - `interface KinematicPair extends Sourced { backswing: number; contactSpeed: number | null; downswingTime:
    number | null }`;
  - `interface StrokeShapeReference { pendulumShare: ReferenceValue; handAngle: ReferenceValue; backswingRange:
    { low: ReferenceValue; high: ReferenceValue } | null; finish: ReferenceQuote; tempo: ReferenceQuote | null;
    kinematics: readonly KinematicPair[] }` (Task 4 adds the derived fields);
  - `swingReference: Readonly<Record<SwingReferenceType, StrokeShapeReference>>`.

- [ ] **Step 1: Fetch the sources**

Keep raw text under `reference/sources/` so that later runs can reproduce it. Add `reference/sources/` as its own
line to `.prettierignore`, since raw text is not Prettier's to format. Fetch each page with `curl -k -sSL -o
reference/sources/<name>.html.txt <url>`. The Oxford Croquet sites' certificate is broken, so `-k` is needed. Fetch:

- Riches, *Croquet Technique*: the index, <http://www.oxfordcroquet.com/coach/riches/croqtech/index.asp>, then
  every chapter the index links that covers:
  - the swing and the stance (the single-ball stroke);
  - the drive (the straight croquet stroke);
  - the stop shot;
  - the half roll;
  - the full roll;
  - the pass roll.
  Name each file `riches-<chapter>.html.txt`.
- Gugan, "The Physics of Croquet Strokes: Analysis of the CA high-speed DVD",
  <https://oxfordcroquet.org/tech/gugan4/>, as `gugan4.html.txt`. It holds the CA DVD's mallet speeds per stroke.
- Gugan, "Croquet Drives, Pass-Rolls, Stop-Shots and Scatter-Shots", <https://oxfordcroquet.org/tech/gugan5/>, as
  `gugan5.html.txt`.
- The Croquet Association's *Project Croquet Dynamics* (2006). Find its URL with the `web-search` skill (query:
  `"Project Croquet Dynamics" croquet association 2006`). Fetch it if it is published; if not, record that in the
  sources README.
- For croquet or pendulum-swing measurements of a backswing against a contact speed, or of a downswing time, run one
  `web-search` query (`croquet mallet backswing height swing speed measurement`). Fetch only a result that gives
  such pairs.

- [ ] **Step 2: Extract the figures**

Write `reference/sources/README.md`. For every fetched file give its URL, the fetch date (2026-10-07) and a section
per stroke type. Each section quotes, verbatim and with the file it came from:

- the backswing: how far back or how high, any range or comparison between strokes ("a short backswing", "the mallet
  head taken back to knee height");
- how the backswing is split between the pendulum and the hands and body, and the hands' path ("the hands move back
  with the body", "the top hand stays still");
- any figure of backswing against contact speed, or of downswing time;
- the finish ("the mallet head following through the ball and onto the ground");
- for the rolls, the tempo ("a slow, smooth swing").

Search the files with Grep on the stroke names. The raw files are HTML, so strip the tags when quoting. A section
with nothing to quote says so.

Convert each numeric figure to SI:

- a height above the ground to the head centre's rise, that is, the given height minus the head's radius at address
  (38.1 mm, `malletReference.headDiameter` / 2);
- a backswing given as an angle to a head rise of ℓ_h·(1 − cos angle), with ℓ_h = 0.8431 m (the swing presets' top
  hand, 0.805 m, plus ρ). Record each conversion in the entry's `note`.

- [ ] **Step 3: Write `reference/swing.json`**

The file holds one object per stroke type, keyed by the type, with the entries below. Use the repo's entry shapes
(`reference/README.md`). Write values in SI and keep every string on one line.

- `pendulumShare`, a value (`"unit": "1"`, `"bounds": [0, 1]`):
  - The swing presets (single-ball, drive, stop-ac, stop-gc) take 1, `provenance` `"derived"`. Source: `"P2b.2b.2a
    design §3.3 (docs/superpowers/specs/2026-10-06-p2b2b2a-stroke-shape-design.md): every default swing preset has
    pendulumShare 1, the top hand staying put"`, with a Riches quote in the note if the chapter says the top hand is
    still.
  - Each roll takes its sourced split, or the placeholder: 1 − its P2b.2b.1 `handShare` (half roll 0.4, full roll
    0.1, pass roll 0.15). A placeholder has `provenance` `"derived"`, `"provisional": "placeholder"`, and the source
    `"P2b.2b.2a plan, placeholder rule: 1 − the P2b.2b.1 handShare (docs/superpowers/plans/2026-10-07-p2b2b2a-stroke-shape.md)"`.
- `handAngle`, a value (`"unit": "rad"`, `"bounds": [0, 1.5707963267948966]`):
  - Each roll takes its sourced angle, or the placeholder 0.5235987755982988 (30°), marked as above.
  - The swing presets take the same placeholder, with the note "unread while pendulumShare is 1".
- `backswingLow` and `backswingHigh`, values (`"unit": "m"`), present together and only where a range was sourced
  for that stroke type.
- `finish`, a quote. Where nothing was found, use the P2b.2b.1 design §3.2 finish (the swing's free pendulum, the
  stop's check, the roll's held slope) as a `"derived"` quote, citing that spec.
- `tempo`, a quote, for the rolls, where Riches describes one.
- `kinematics`, an array of `{ "backswing", "contactSpeed" | "downswingTime", "source", "provenance", "note" }`, only
  where pairs were found.

An example entry:

```json
"half-roll": {
    "pendulumShare": {
        "value": 0.4,
        "unit": "1",
        "bounds": [0, 1],
        "source": "P2b.2b.2a plan, placeholder rule: 1 − the P2b.2b.1 handShare (docs/superpowers/plans/2026-10-07-p2b2b2a-stroke-shape.md)",
        "provenance": "derived",
        "provisional": "placeholder",
        "note": "No split between the pendulum and the hands was found for the half roll (reference/sources/README.md). P2b.2b.1's preset gave the hands 60 % of the head's speed (swing spec §5.4)."
    },
    "handAngle": { "...": "as above" },
    "finish": {
        "quote": "<verbatim Riches text>",
        "source": "John Riches, Croquet Technique, '<chapter>' (Oxford Croquet), <url>",
        "provenance": "direct"
    }
}
```

- [ ] **Step 4: Write the failing tests**

In `tests/reference/schema.test.ts`, add to `describe("readValue", …)`:

```ts
    it("reads a placeholder's provisional mark and rejects any other", () => {
        const placeholder = { diameter: { ...good.diameter, provisional: "placeholder" } };
        expect(readValue(placeholder, "diameter", "ball").provisional).toBe("placeholder");
        expect(readValue(good, "diameter", "ball")).not.toHaveProperty("provisional");
        const other = { diameter: { ...good.diameter, provisional: "guess" } };
        expect(() => readValue(other, "diameter", "ball")).toThrow(/provisional/);
    });
```

In `tests/reference/reference.test.ts`, add `SWING_REFERENCE_TYPES` and `swingReference` to the import from
`../../src/reference/index`, add `import { STROKE_TYPES } from "../../src/engine/swing/types";`, and append:

```ts
describe("swing reference (P2b.2b.2a design §6.1)", () => {
    it("has an entry for every stroke type, in the presets' order", () => {
        expect(SWING_REFERENCE_TYPES).toEqual(STROKE_TYPES);
        expect(Object.keys(swingReference)).toEqual([...STROKE_TYPES]);
    });

    it("keeps the top hand still in every swing preset", () => {
        for (const type of ["single-ball", "drive", "stop-ac", "stop-gc"] as const) {
            expect(swingReference[type].pendulumShare.value, type).toBe(1);
        }
    });

    it("gives every stroke type a share in [0, 1], a hands' angle in (0, 90°) and a finish", () => {
        for (const type of SWING_REFERENCE_TYPES) {
            const shape = swingReference[type];
            expect(shape.pendulumShare.value, type).toBeGreaterThanOrEqual(0);
            expect(shape.pendulumShare.value, type).toBeLessThanOrEqual(1);
            expect(shape.handAngle.value, type).toBeGreaterThan(0);
            expect(shape.handAngle.value, type).toBeLessThan(Math.PI / 2);
            expect(shape.finish.quote.length, type).toBeGreaterThan(0);
        }
    });

    it("gives every sourced range low ≤ high, and every kinematic pair one measure", () => {
        for (const type of SWING_REFERENCE_TYPES) {
            const { backswingRange, kinematics } = swingReference[type];
            if (backswingRange !== null) {
                expect(backswingRange.low.value, type).toBeLessThanOrEqual(backswingRange.high.value);
                expect(backswingRange.low.value, type).toBeGreaterThan(0);
            }
            for (const pair of kinematics) {
                expect(pair.backswing, type).toBeGreaterThan(0);
                expect((pair.contactSpeed === null) !== (pair.downswingTime === null), type).toBe(true);
            }
        }
    });

    it("marks every placeholder as derived", () => {
        for (const type of SWING_REFERENCE_TYPES) {
            for (const entry of [swingReference[type].pendulumShare, swingReference[type].handAngle]) {
                if (entry.provisional === "placeholder") {
                    expect(entry.provenance, type).toBe("derived");
                }
            }
        }
    });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npx vitest run tests/reference`
Expected: FAIL. The placeholder test fails on `provisional` being `undefined`, and the swing reference tests fail
with `SWING_REFERENCE_TYPES` undefined.

- [ ] **Step 6: Implement**

In `src/reference/schema.ts`, extend `Sourced`:

```ts
/** Attribution carried by every reference entry. */
export interface Sourced {
    readonly source: string;
    readonly provenance: Provenance;
    readonly note?: string;
    /** "placeholder": a labelled stand-in until data or a fit replaces it (P2b.2b.2a design §6.2). */
    readonly provisional?: "placeholder";
}
```

and replace the end of `readSourced` (from `const sourced: Sourced = …` to the function's end) with:

```ts
    let sourced: Sourced = { source, provenance: provenance as Provenance };
    if ("note" in section) {
        sourced = { ...sourced, note: readString(section, "note", path) };
    }
    if ("provisional" in section) {
        if (readString(section, "provisional", path) !== "placeholder") {
            throw new ReferenceDataError(`${path}.provisional`, 'must be "placeholder"');
        }
        sourced = { ...sourced, provisional: "placeholder" };
    }
    return sourced;
```

In `src/reference/index.ts`, add `import swingJson from "../../reference/swing.json";` beside the other JSON imports
and `ReferenceValue` to the type imports from `./schema`. Then append:

```ts
/** The stroke types reference/swing.json keys, in the presets' order (the engine's STROKE_TYPES). */
export const SWING_REFERENCE_TYPES = [
    "single-ball",
    "drive",
    "stop-ac",
    "stop-gc",
    "half-roll",
    "full-roll",
    "pass-roll",
] as const;

/** A key of `swingReference`. */
export type SwingReferenceType = (typeof SWING_REFERENCE_TYPES)[number];

/**
 * A sourced kinematic pair (P2b.2b.2a design §6.1): a backswing (m, the head centre's rise) against the contact speed
 * (m/s) or the downswing time (s) measured with it; exactly one of the two.
 */
export interface KinematicPair extends Sourced {
    readonly backswing: number;
    readonly contactSpeed: number | null;
    readonly downswingTime: number | null;
}

/** One stroke type's stroke-shape figures (reference/swing.json; P2b.2b.2a design §6). */
export interface StrokeShapeReference {
    readonly pendulumShare: ReferenceValue;
    readonly handAngle: ReferenceValue;
    /** The sourced backswing range (m), or null where none was found. */
    readonly backswingRange: { readonly low: ReferenceValue; readonly high: ReferenceValue } | null;
    readonly finish: ReferenceQuote;
    /** The rolls' sourced tempo, or null. */
    readonly tempo: ReferenceQuote | null;
    readonly kinematics: readonly KinematicPair[];
}

function has(section: unknown, key: string): boolean {
    return typeof section === "object" && section !== null && key in section;
}

function readPairs(entry: unknown, path: string): readonly KinematicPair[] {
    if (!has(entry, "kinematics")) {
        return [];
    }
    return readArray(entry, "kinematics", path).map((item, i) => {
        const at = `${path}.kinematics[${i}]`;
        const contactSpeed = has(item, "contactSpeed") ? readNumber(item, "contactSpeed", at) : null;
        const downswingTime = has(item, "downswingTime") ? readNumber(item, "downswingTime", at) : null;
        if ((contactSpeed === null) === (downswingTime === null)) {
            throw new ReferenceDataError(at, "must give exactly one of contactSpeed and downswingTime");
        }
        return {
            backswing: readNumber(item, "backswing", at),
            contactSpeed,
            downswingTime,
            ...readSourced(item, at),
        };
    });
}

function readShape(section: unknown, type: SwingReferenceType): StrokeShapeReference {
    const path = `swing.${type}`;
    if (!has(section, type)) {
        throw new ReferenceDataError(path, "missing");
    }
    const entry = (section as Record<string, unknown>)[type];
    const low = has(entry, "backswingLow");
    if (low !== has(entry, "backswingHigh")) {
        throw new ReferenceDataError(path, "backswingLow and backswingHigh must be given together");
    }
    const backswingRange = low
        ? { low: readValue(entry, "backswingLow", path), high: readValue(entry, "backswingHigh", path) }
        : null;
    if (backswingRange !== null && !(backswingRange.low.value <= backswingRange.high.value)) {
        throw new ReferenceDataError(path, "backswingLow must not exceed backswingHigh");
    }
    return {
        pendulumShare: readValue(entry, "pendulumShare", path),
        handAngle: readValue(entry, "handAngle", path),
        backswingRange,
        finish: readQuote(entry, "finish", path),
        tempo: has(entry, "tempo") ? readQuote(entry, "tempo", path) : null,
        kinematics: readPairs(entry, path),
    };
}

/** The stroke shape per stroke type (P2b.2b.2a design §6): sourced figures and labelled placeholders. */
export const swingReference: Readonly<Record<SwingReferenceType, StrokeShapeReference>> = Object.fromEntries(
    SWING_REFERENCE_TYPES.map((type) => [type, readShape(swingJson, type)]),
) as Record<SwingReferenceType, StrokeShapeReference>;
```

In `reference/README.md`, add to "Entry shapes" after the Quote bullet:

```markdown
- **Placeholder:** any entry may carry `"provisional": "placeholder"`: a labelled stand-in, by a stated rule, until
  data or a fit replaces it (swing.json; P2b.2b.2a design §6.2). Its `provenance` is `"derived"` and its `source`
  names the rule.
- **Stroke shape** (swing.json): one object per stroke type, keyed by the type, holding values and quotes as above
  and an optional `kinematics` array of `{ "backswing", "contactSpeed" | "downswingTime", "source", "provenance",
  "note"? }`. Raw fetched sources and the extracted quotations live in `reference/sources/`.
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/reference`
Expected: PASS.

- [ ] **Step 8: Run every check**

Run, one per call: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`.
Expected: all pass.

- [ ] **Step 9: Commit**

Message: `Source the stroke shape into swing.json`. Stage by path: `.prettierignore`, `reference/swing.json`,
`reference/sources`, `reference/README.md`, `src/reference/schema.ts`, `src/reference/index.ts`,
`tests/reference/schema.test.ts`, `tests/reference/reference.test.ts`.

- [ ] **Step 10: User gate**

Stop and show the user:

- per stroke type, each figure in `swing.json`, its provenance and whether it is a placeholder;
- what was not found.

Ask the user to confirm the placeholders, or to supply figures from their own play. Do not start Task 2 until they
confirm. If they change a figure, amend `swing.json` in a follow-up commit (`Amend swing.json after review`). If
Step 1 found kinematic pairs, say so: Task 4 Step 2 then needs a design decision from them.

---
### Task 2: The path reads a downswing before contact

Spec §3.5 (first two bullets) and §4.4 (`FREE_SPAN`). `SwingArc` gains an optional `downswing`. Before contactAt,
and before each drive window begins, `track.ts` takes the pendulum and the hands from it. Where it is absent,
everything stays bit-identical. No producer exists yet; the tests build downswings by hand.

**Files:**
- Modify: `src/engine/impact/types.ts`, `src/engine/impact/track.ts`, `src/engine/impact/simulateImpact.ts`
- Test: `tests/engine/impact/track.test.ts`

**Interfaces:**
- Produces:
  - in `impact/types.ts`, `interface Downswing { release; thetaTop; span; handsTop; across; drop; tempo: number |
    null; theta; omega; alpha }` (fields documented below), and `SwingArc.downswing?: Downswing`;
  - in `impact/track.ts`:
    - `interface Swing { theta: number; omega: number; alpha: number }`;
    - `interface Motion { P: Vec3; V: Vec3; A: Vec3 }`, now exported;
    - `interface Pendulum { weight: number; inertial: number; inertia: number }`;
    - `downswingSamples(down): number`;
    - `downswingTime(down, k): number`;
    - `downswingAt(down, t): Swing`, with t in s from contact;
    - `downswingHands(down, t, swing): Motion`;
    - `pendulumOf(head, body, radius, gravity): Pendulum`;
    - `handsAt(track, t): { position: Vec3; velocity: Vec3 }`;
    - `PreparedTrack.omegaArc` and `PreparedTrack.pivotVelocityHand`;
    - `FREE_SPAN` = 1.2.

- [ ] **Step 1: Save the bit-identity baseline**

Run: `env OBSTACLE_STROKES=2000 npx --yes tsx scripts/impactDigest.ts > <temp>/digest-before.txt`
Expected: the file ends with `obstacle 1999 …` and `timeline obstacle 1999 …` lines. Every later bit-identity check
compares against it.

- [ ] **Step 2: Write the failing tests**

In `tests/engine/impact/track.test.ts`:

- Add `downswingAt`, `downswingHands`, `downswingSamples`, `downswingTime`, `handsAt` and `pendulumOf` to the import
  from `track`.
- Add `Downswing` to the type import from `types`.
- Add `import { validateImpact } from "../../../src/engine/impact/simulateImpact";`.
- Add `import { testWorld } from "../support/fixtures";`.
- Add `onArc` to the import from `../support/impact`.
- Append:

```ts
/**
 * A swing-mode downswing of constant α from rest at θ_top to θ_c over T (s): θ = θ_top + ½·α·τ², τ from the release
 * −T, tabulated every FREE_STEP with its last sample at contact. The hands end at `pivot`, from `pivot` − across −
 * drop.
 */
function uniformDownswing(
    thetaTop: number,
    thetaC: number,
    T: number,
    pivot: Vec3,
    across: Vec3 = vec3(0, 0, 0),
    drop: Vec3 = vec3(0, 0, 0),
): Downswing {
    const alpha = (2 * (thetaC - thetaTop)) / (T * T);
    const theta: number[] = [];
    const omega: number[] = [];
    const accel: number[] = [];
    for (let k = 0; k * FREE_STEP < T; k++) {
        const tau = k * FREE_STEP;
        theta.push(thetaTop + 0.5 * alpha * tau * tau);
        omega.push(alpha * tau);
        accel.push(alpha);
    }
    theta.push(thetaC);
    omega.push(alpha * T);
    accel.push(alpha);
    return {
        release: -T,
        thetaTop,
        span: thetaC - thetaTop,
        handsTop: sub(sub(pivot, across), drop),
        across,
        drop,
        tempo: null,
        theta,
        omega,
        alpha: accel,
    };
}

/** Lead (s), the downswing's length T (s) and its angles: the head swung through 0.6 rad onto a level contact. */
const LEAD = 0.02;
const FALL = 0.05;
const TOP = -0.6;
const CONTACT = 0;
const OMEGA_C = (2 * (CONTACT - TOP)) / FALL;

/**
 * A level swing arc whose head reaches contact at LEAD on a uniform downswing, coasting on at ω₀ until windows at
 * LEAD, its hands moved by `across` and `drop` along it (and on at V_c = 2·across·ω₀/span after it).
 */
function downswingArc(o: Partial<SwingArc> = {}, across = vec3(0, 0, 0), drop = vec3(0, 0, 0)): SwingArc {
    const handsVelocity = scale(across, (2 * OMEGA_C) / (CONTACT - TOP));
    // levelArc's still pivot is where the hands arrive at contact.
    const base = levelArc(vec3(1, 2, 0.05), {
        theta0: CONTACT - OMEGA_C * LEAD,
        omega0: OMEGA_C,
        contactAt: LEAD,
        arcStart: LEAD,
        handStart: LEAD,
        ...o,
    });
    return {
        ...base,
        pivot: sub(base.pivot, scale(handsVelocity, LEAD)),
        pivotVelocity: handsVelocity,
        downswing: uniformDownswing(TOP, CONTACT, FALL, base.pivot, across, drop),
    };
}

describe("the downswing (P2b.2b.2a design §3.5)", () => {
    const radial = (theta: number) => sub(scale(vec3(1, 0, 0), Math.sin(theta)), scale(UP, Math.cos(theta)));
    const alpha = (2 * (CONTACT - TOP)) / (FALL * FALL);

    it("samples every FREE_STEP from the release, the last sample at contact", () => {
        const down = uniformDownswing(TOP, CONTACT, FALL, vec3(0, 0, 1));
        const n = downswingSamples(down);
        expect(n).toBe(down.theta.length);
        expect(downswingTime(down, 0)).toBe(-FALL);
        expect(downswingTime(down, 3)).toBeCloseTo(-FALL + 3 * FREE_STEP, 15);
        expect(downswingTime(down, n - 1)).toBe(0);
        expect(downswingTime(down, n - 2)).toBeLessThan(0);
    });

    it("drives the path before contact: θ, ω and α from the table, the socket on its circle", () => {
        const arc = downswingArc();
        const track = prepare(arc);
        for (const t of [0, 0.005, 0.0123, 0.019, 0.0199999]) {
            const tau = t - LEAD + FALL;
            const p = pathAt(track, t);
            const theta = TOP + 0.5 * alpha * tau * tau;
            expect(dot(p.angularVelocity, vec3(0, -1, 0)), `ω at ${t}`).toBeCloseTo(alpha * tau, 9);
            expect(p.pendulumAcceleration, `α at ${t}`).toBeCloseTo(alpha, 9);
            const pivot = (arc.downswing as Downswing).handsTop;
            expect(dist(p.socket, add(pivot, scale(radial(theta), arc.radius))), `socket at ${t}`).toBeLessThan(1e-8);
        }
    });

    it("holds the top at rest before the release", () => {
        const late = { contactAt: 0.08, theta0: CONTACT - OMEGA_C * 0.08, arcStart: 0.08, handStart: 0.08 };
        const arc = downswingArc(late);
        const p = pathAt(prepare(arc), 0);
        expect(length(p.angularVelocity)).toBe(0);
        expect(length(p.socketVelocity)).toBe(0);
        expect(p.pendulumAcceleration).toBe(0);
        expect(dist(p.socket, add((arc.downswing as Downswing).handsTop, scale(radial(TOP), arc.radius)))).toBeLessThan(
            1e-12,
        );
    });

    it("coasts on from contact exactly as an arc with no downswing", () => {
        const arc = downswingArc();
        const a = prepare(arc);
        const b = prepare({ ...arc, downswing: undefined });
        for (const t of [LEAD, LEAD + 0.005, LEAD + 0.04, LEAD + 0.3]) {
            expect(pathAt(a, t), `t ${t}`).toEqual(pathAt(b, t));
        }
    });

    it("is continuous at contact and where an early window starts", () => {
        const onTime = prepare(downswingArc());
        const early = prepare(downswingArc({ arcStart: 0.01, alpha: -50 }));
        for (const [track, t] of [
            [onTime, LEAD],
            [early, 0.01],
            [early, LEAD],
        ] as const) {
            const before = pathAt(track, t - 1e-12);
            const after = pathAt(track, t + 1e-12);
            expect(dist(before.socket, after.socket), `socket at ${t}`).toBeLessThan(1e-9);
            expect(dist(before.socketVelocity, after.socketVelocity), `velocity at ${t}`).toBeLessThan(1e-6);
        }
    });

    it("starts an early window from the downswing's state there", () => {
        const track = prepare(downswingArc({ arcStart: 0.01, alpha: -50 }));
        const tau = 0.01 - LEAD + FALL;
        expect(track.thetaArc).toBeCloseTo(TOP + 0.5 * alpha * tau * tau, 9);
        expect(track.omegaArc).toBeCloseTo(alpha * tau, 9);
        expect(track.omegaEnd).toBeCloseTo(alpha * tau - 50 * 0.01, 9);
    });

    it("moves the hands with the pendulum in swing mode, arriving level at V_c = 2·across·ω₀/span", () => {
        const across = vec3(0.05, 0, 0);
        const drop = vec3(0, 0, -0.02);
        const arc = downswingArc({}, across, drop);
        const track = prepare(arc);
        const down = arc.downswing as Downswing;
        expect(dist(handsAt(track, LEAD - FALL).position, down.handsTop)).toBeLessThan(1e-12);
        const atContact = handsAt(track, LEAD - 1e-9);
        expect(dist(atContact.position, add(add(down.handsTop, across), drop))).toBeLessThan(1e-8);
        expect(Math.abs(atContact.velocity.z)).toBeLessThan(1e-6);
        expect(atContact.velocity.x).toBeCloseTo((2 * 0.05 * OMEGA_C) / (CONTACT - TOP), 6);
        // Halfway in σ the vertical part has fallen half its drop, at its fastest. The table's linear interpolation of
        // the quadratic θ errs by up to α·FREE_STEP²/8, 1.5e-9 rad.
        const swing = downswingAt(down, -FALL + FALL / Math.SQRT2);
        expect((swing.theta - TOP) / (CONTACT - TOP)).toBeCloseTo(0.5, 7);
        const half = downswingHands(down, -FALL + FALL / Math.SQRT2, swing);
        expect(half.P.z - down.handsTop.z).toBeCloseTo(-0.01, 9);
    });

    it("evaluates carry mode in closed form: σ = (t − t_r)/T_h, θ = θ_top + span·σ²", () => {
        const across = vec3(0.1, 0, 0);
        const drop = vec3(0, 0, -0.03);
        const down: Downswing = {
            release: -0.4,
            thetaTop: -0.5,
            span: 0.3,
            handsTop: vec3(1, 2, 1),
            across,
            drop,
            tempo: 0.4,
            theta: [],
            omega: [],
            alpha: [],
        };
        expect(downswingSamples(down)).toBe(Math.ceil(0.4 / FREE_STEP) + 1);
        for (const t of [-0.4, -0.3, -0.1, 0]) {
            const sigma = (t + 0.4) / 0.4;
            const swing = downswingAt(down, t);
            expect(swing.theta, `θ at ${t}`).toBeCloseTo(-0.5 + 0.3 * sigma * sigma, 14);
            expect(swing.omega, `ω at ${t}`).toBeCloseTo((2 * 0.3 * sigma) / 0.4, 14);
            const hands = downswingHands(down, t, swing);
            const rise = 3 * sigma ** 2 - 2 * sigma ** 3;
            const P = add(add(vec3(1, 2, 1), scale(across, sigma * sigma)), scale(drop, rise));
            expect(dist(hands.P, P), `P at ${t}`).toBeLessThan(1e-14);
        }
        expect(dist(downswingHands(down, 0, downswingAt(down, 0)).V, scale(across, 2 / 0.4))).toBeLessThan(1e-14);
    });

    it("gives the pendulum's constants as the free pendulum uses them", () => {
        const body = swungBody(TEST_HEAD, ARMED, 0.8);
        const p = pendulumOf(TEST_HEAD, body, 0.8, STANDARD_GRAVITY);
        const lh = TEST_HEAD.socket.z + 0.8;
        const d = lh - body.offset;
        expect(p).toEqual({
            weight: TEST_HEAD.mass * STANDARD_GRAVITY * lh,
            inertial: body.mass * d,
            inertia: body.inertia.y + body.mass * d * d,
        });
    });

    it("tabulates the free pendulum over 1.2 s: the longest lead, the follow-through's cap and a guard", () => {
        expect(FREE_SPAN).toBe(1.2);
    });

    it("rejects a malformed downswing", () => {
        const good = downswingArc();
        const down = good.downswing as Downswing;
        const bad: readonly [string, Downswing, RegExp][] = [
            ["a release at or after contact", { ...down, release: 0 }, /release must be negative/],
            ["a table of one sample", { ...down, theta: [0], omega: [0], alpha: [0] }, /tabulated in swing mode/],
            ["a table that stops short of contact", { ...down, release: -1 }, /must end at contact/],
            ["a tempo in swing mode", { ...down, tempo: 0.05 }, /tabulated in swing mode/],
        ];
        // The head is placed on the good arc: a malformed table must fail validation, not the placement.
        const placed = onArc(trackDrive(good));
        for (const [name, downswing, pattern] of bad) {
            const contact = { ...placed, drive: trackDrive({ ...good, downswing }) };
            expect(() => validateImpact(contact, {}, testWorld()), name).toThrow(pattern);
        }
        const carry: SwingArc = { ...good, mode: "carry", downswing: { ...down, tempo: 0.3, release: -0.2 } };
        const carried = { ...placed, drive: trackDrive(carry) };
        expect(() => validateImpact(carried, {}, testWorld())).toThrow(/closed-form in carry mode/);
    });
});
```

The `uniformDownswing` table is quadratic in θ, so interpolating θ linearly between samples errs by at most
α·FREE_STEP²/8 (1.5e-9 rad here, about 1.2e-9 m at the socket), within the 1e-8 bounds.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/impact/track.test.ts`
Expected: FAIL. The new tests fail with `downswingSamples is not a function` and the like. `FREE_SPAN` is 0.55, so
its test fails. The existing tests pass.

- [ ] **Step 4: Add the type**

In `src/engine/impact/types.ts`, before `SwingArc`, add:

```ts
/**
 * The contact-free downswing (P2b.2b.2a design §3), in s from the planned contact: from the release t_r < 0, the
 * pendulum and the hands at rest at the backswing's top, to contact. The hands' path is P(σ) = P_b + Δ_h·σ² +
 * Δ_z·(3σ² − 2σ³), σ from 0 at the top to 1 at contact. Swing mode tabulates θ, ω and α every FREE_STEP from the
 * release, its last sample at contact, with σ = (θ − θ_top)/span; carry mode is closed-form, σ = (t − t_r)/tempo and
 * θ = θ_top + span·σ².
 */
export interface Downswing {
    /** t_r (s from contact, negative). */
    readonly release: number;
    /** θ at the top, and θ_c − θ_top (rad, ≥ 0). */
    readonly thetaTop: number;
    readonly span: number;
    /** The hands at the top P_b, and Δ = P_c − P_b split into its horizontal part Δ_h and vertical part Δ_z (m). */
    readonly handsTop: Vec3;
    readonly across: Vec3;
    readonly drop: Vec3;
    /** Carry mode's hands' tempo T_h (s), with release = −tempo; null in swing mode. */
    readonly tempo: number | null;
    /** Swing mode's table (rad, rad/s, rad/s²); empty in carry mode. */
    readonly theta: readonly number[];
    readonly omega: readonly number[];
    readonly alpha: readonly number[];
}
```

and append to `SwingArc`'s fields, after `groundDepth`:

```ts
    /**
     * The downswing before contactAt (P2b.2b.2a design §3.5): before each window begins, and before contactAt, the
     * pendulum and the hands follow it. Absent, the path coasts at ω₀ and V₀ (P2b.2b.1).
     */
    readonly downswing?: Downswing;
```

- [ ] **Step 5: Implement the path's downswing branch**

In `src/engine/impact/track.ts`:

1. Add `Downswing` to the type import from `./types`. Replace the `FREE_SPAN` constant and its comment with:

```ts
/**
 * Span (s) of the free pendulum's table from the pendulum's window's end (design §3.2). Numerical: a tracked stroke
 * runs at most MAX_LEAD (0.15 s, the longest lead-in) plus FOLLOW_CAP (1 s, the follow-through's cap after contact)
 * from t = 0, and the table starts at the window's end, so 1.2 s covers every stroke with a 50 ms guard (P2b.2b.2a
 * design §4.4). simulateImpact is public and accepts any contactAt or cap: beyond the table θ and ω hold.
 */
export const FREE_SPAN = 1.2;
```

2. Export the `Motion` interface (`export interface Motion`), and after it add:

```ts
/** The pendulum's θ (rad), ω (rad/s) and α (rad/s²). */
export interface Swing {
    readonly theta: number;
    readonly omega: number;
    readonly alpha: number;
}

/**
 * The pendulum about the top hand (design §3.2): I_P·θ̈ = −weight·sin θ − inertial·(A·t̂) + τ, with weight = m·g·ℓ_h
 * (N·m), inertial = M·d (kg·m) and inertia = I_P (kg·m²).
 */
export interface Pendulum {
    readonly weight: number;
    readonly inertial: number;
    readonly inertia: number;
}

/**
 * The pendulum of `body` swinging `head` about a top hand `radius` from the socket under `gravity`: ℓ_h = ρ + r,
 * d = ℓ_h − δ, I_P = I'_y + M·d² (design §3.2).
 */
export function pendulumOf(head: MalletHead, body: SwungBody, radius: number, gravity: number): Pendulum {
    const lh = head.socket.z + radius;
    const d = lh - body.offset;
    return { weight: head.mass * gravity * lh, inertial: body.mass * d, inertia: body.inertia.y + body.mass * d * d };
}

/** How many samples the downswing's scan visits (P2b.2b.2a design §3.4): its table's, or carry mode's like it. */
export function downswingSamples(down: Downswing): number {
    if (down.tempo === null) {
        return down.theta.length;
    }
    return Math.ceil((0 - down.release) / FREE_STEP) + 1;
}

/** The time (s from contact) of sample k: the release plus k·FREE_STEP, the last sample at contact. */
export function downswingTime(down: Downswing, k: number): number {
    return k === downswingSamples(down) - 1 ? 0 : down.release + k * FREE_STEP;
}

/**
 * The downswing's pendulum at time t (s from contact, at most 0; P2b.2b.2a design §3.3, §3.4): held at the top before
 * the release; in carry mode θ = θ_top + span·σ²; in swing mode its table, interpolated linearly.
 */
export function downswingAt(down: Downswing, t: number): Swing {
    if (t < down.release) {
        return { theta: down.thetaTop, omega: 0, alpha: 0 };
    }
    if (down.tempo !== null) {
        const T = down.tempo;
        const sigma = Math.min(t - down.release, T) / T;
        return {
            theta: down.thetaTop + down.span * sigma * sigma,
            omega: (2 * down.span * sigma) / T,
            alpha: (2 * down.span) / (T * T),
        };
    }
    const n = down.theta.length;
    if (t >= 0) {
        // Contact exactly: σ is then exactly 1 and the hands arrive level.
        const last = n - 1;
        return {
            theta: down.theta[last] as number,
            omega: down.omega[last] as number,
            alpha: down.alpha[last] as number,
        };
    }
    const i = Math.max(0, Math.min(Math.floor((t - down.release) / FREE_STEP), n - 2));
    const t0 = down.release + i * FREE_STEP;
    const t1 = i + 1 === n - 1 ? 0 : down.release + (i + 1) * FREE_STEP;
    const f = Math.min(Math.max((t - t0) / (t1 - t0), 0), 1);
    const lerp = (values: readonly number[]): number => {
        const a = values[i] as number;
        return a + f * ((values[i + 1] as number) - a);
    };
    return { theta: lerp(down.theta), omega: lerp(down.omega), alpha: lerp(down.alpha) };
}

/**
 * The downswing's hands at time t (s from contact; P2b.2b.2a design §3.3), the pendulum at `swing`: P(σ) and its
 * derivatives, σ led by the pendulum in swing mode (σ = (θ − θ_top)/span) and by time in carry mode. At rest at the
 * top before the release.
 */
export function downswingHands(down: Downswing, t: number, swing: Swing): Motion {
    if (t < down.release) {
        return { P: down.handsTop, V: vec3(0, 0, 0), A: vec3(0, 0, 0) };
    }
    let sigma: number;
    let rate: number;
    let accel: number;
    if (down.tempo !== null) {
        sigma = Math.min(t - down.release, down.tempo) / down.tempo;
        rate = 1 / down.tempo;
        accel = 0;
    } else {
        sigma = (swing.theta - down.thetaTop) / down.span;
        rate = swing.omega / down.span;
        accel = swing.alpha / down.span;
    }
    const slope = add(scale(down.across, 2 * sigma), scale(down.drop, 6 * sigma - 6 * sigma * sigma));
    const bend = add(scale(down.across, 2), scale(down.drop, 6 - 12 * sigma));
    const rise = (3 - 2 * sigma) * sigma * sigma;
    return {
        P: add(add(down.handsTop, scale(down.across, sigma * sigma)), scale(down.drop, rise)),
        V: scale(slope, rate),
        A: add(scale(bend, rate * rate), scale(slope, accel)),
    };
}

/** The pendulum before its window: on the downswing before contactAt, if there is one, else coasting at ω₀. */
function beforeWindow(arc: SwingArc, t: number): Swing {
    if (arc.downswing !== undefined && t < arc.contactAt) {
        return downswingAt(arc.downswing, t - arc.contactAt);
    }
    return { theta: arc.theta0 + arc.omega0 * t, omega: arc.omega0, alpha: 0 };
}

/** The planned pivot before the hands' window: on the downswing before contactAt, if there is one, else P₀ + V₀·t. */
function beforeHands(arc: SwingArc, t: number): Motion {
    if (arc.downswing !== undefined && t < arc.contactAt) {
        const u = t - arc.contactAt;
        return downswingHands(arc.downswing, u, downswingAt(arc.downswing, u));
    }
    return { P: add(arc.pivot, scale(arc.pivotVelocity, t)), V: arc.pivotVelocity, A: vec3(0, 0, 0) };
}
```

`Motion` and `SwungBody` must be declared before these functions use them in types. Place the block after the
`Motion` and `Lowering` declarations.

3. In `PreparedTrack`, replace the two window comments and fields with:

```ts
    /** θ and ω where the pendulum's window begins; θ and ω where it ends. */
    readonly thetaArc: number;
    readonly omegaArc: number;
    readonly thetaEnd: number;
    readonly omegaEnd: number;
    /** The planned pivot and its velocity where the hands' window begins; the pivot and its velocity where it ends. */
    readonly pivotHand: Vec3;
    readonly pivotVelocityHand: Vec3;
    readonly pivotEnd: Vec3;
    readonly pivotVelocityEnd: Vec3;
```

4. Replace `planPivot`'s body with:

```ts
    const { arc } = track;
    if (t <= arc.handStart) {
        return beforeHands(arc, t);
    }
    if (t <= arc.handStart + arc.handWindow) {
        const tau = t - arc.handStart;
        return {
            P: add(
                add(track.pivotHand, scale(track.pivotVelocityHand, tau)),
                scale(arc.pivotAcceleration, 0.5 * tau * tau),
            ),
            V: add(track.pivotVelocityHand, scale(arc.pivotAcceleration, tau)),
            A: arc.pivotAcceleration,
        };
    }
    const u = t - (arc.handStart + arc.handWindow);
    return { P: add(track.pivotEnd, scale(track.pivotVelocityEnd, u)), V: track.pivotVelocityEnd, A: vec3(0, 0, 0) };
```

and its header with `/** The planned pivot at time t: before the hands' window (the downswing, or P₀ + V₀·t), then
P_h + V_h·τ + ½·A·τ², then P_e + V_e·u (no reach, no dip). */`.

5. In `pendulumAt`, replace the first branch with:

```ts
    if (t <= arc.arcStart) {
        return beforeWindow(arc, t);
    }
```

and, in the window branch, `arc.omega0` with `track.omegaArc` (twice). Change its return type to `Swing`.

6. In `computeFree`, replace the `lh`, `d` and the three `free` constants with
   `const pendulum = pendulumOf(head, body, arc.radius, gravity);` and build the record as
   `{ tw: arc.arcStart + arc.window, theta, omega, ...pendulum }`. The expressions are the same, so the table is
   bit-identical.

7. In `prepareTrack`, replace the `thetaArc` and `pivotHand` constants and the matching record fields with:

```ts
    const atArc = beforeWindow(arc, arc.arcStart);
    const atHands = beforeHands(arc, arc.handStart);
```

and in `plain`:

```ts
        thetaArc: atArc.theta,
        omegaArc: atArc.omega,
        thetaEnd: atArc.theta + atArc.omega * w + 0.5 * arc.alpha * w * w,
        omegaEnd: atArc.omega + arc.alpha * w,
        pivotHand: atHands.P,
        pivotVelocityHand: atHands.V,
        pivotEnd: add(add(atHands.P, scale(atHands.V, wh)), scale(arc.pivotAcceleration, 0.5 * wh * wh)),
        pivotVelocityEnd: add(atHands.V, scale(arc.pivotAcceleration, wh)),
```

Without a downswing, `beforeWindow` computes `arc.theta0 + arc.omega0 * arc.arcStart` and returns `arc.omega0`, and
`beforeHands` computes `add(arc.pivot, scale(arc.pivotVelocity, arc.handStart))` and returns `arc.pivotVelocity`.
These are the expressions they replace, so every figure is bit-identical.

8. After `pathAt`, add:

```ts
/** The top hand's planned place and velocity at time t (design §3.2): the pivot with the reach and the dip. */
export function handsAt(track: PreparedTrack, t: number): { readonly position: Vec3; readonly velocity: Vec3 } {
    const pivot = pivotAt(track, t);
    const dip = dipAt(track, t);
    return { position: sub(pivot.P, vec3(0, 0, dip.z)), velocity: sub(pivot.V, vec3(0, 0, dip.v)) };
}
```

9. Update the file header's second sentence to: "Before contact the path follows the downswing when the arc has one
   (P2b.2b.2a design §3.5); otherwise each arc runs at its initial rate until its window."

- [ ] **Step 6: Validate the downswing**

In `src/engine/impact/simulateImpact.ts`:

- import `FREE_STEP` from `./track` beside `pitchAxis` and `prepareTrack`;
- add `Downswing` and `StrokeMode` to the type import from `./types`;
- before `validateTrack`, add:

```ts
/**
 * Checks a tracked drive's downswing (P2b.2b.2a design §3): a negative release; a finite top, a non-negative span;
 * finite hands, Δ_h in the swing plane and Δ_z vertical; in carry mode a positive tempo with release = −tempo and no
 * table; in swing mode no tempo, a positive span and a finite table of θ, ω and α of one length, at least 2, whose
 * samples every FREE_STEP from the release end at contact.
 */
function validateDownswing(down: Downswing, mode: StrokeMode, n: Vec3): void {
    finiteNumber(down.release, "arc.downswing.release");
    if (!(down.release < 0)) {
        fail(`arc.downswing.release must be negative (got ${down.release})`);
    }
    finiteNumber(down.thetaTop, "arc.downswing.thetaTop");
    finiteNumber(down.span, "arc.downswing.span");
    friction(down.span, "arc.downswing.span");
    finite(down.handsTop, "arc.downswing.handsTop");
    finite(down.across, "arc.downswing.across");
    finite(down.drop, "arc.downswing.drop");
    if (!(Math.abs(dot(down.across, n)) <= UNIT_TOLERANCE * length(down.across))) {
        fail("arc.downswing.across must lie in the swing plane");
    }
    if (!(down.drop.x === 0 && down.drop.y === 0)) {
        fail("arc.downswing.drop must be vertical");
    }
    if (mode === "carry") {
        const { tempo } = down;
        if (tempo === null || !(tempo > 0) || down.release !== 0 - tempo || down.theta.length > 0) {
            fail("arc.downswing must be closed-form in carry mode: a positive tempo, release = −tempo, no table");
        }
        return;
    }
    const count = down.theta.length;
    if (
        down.tempo !== null ||
        !(down.span > 0) ||
        count < 2 ||
        down.omega.length !== count ||
        down.alpha.length !== count
    ) {
        fail("arc.downswing must be tabulated in swing mode: no tempo, a positive span, θ, ω and α of one length ≥ 2");
    }
    for (let i = 0; i < count; i++) {
        finiteNumber(down.theta[i] as number, `arc.downswing.theta[${i}]`);
        finiteNumber(down.omega[i] as number, `arc.downswing.omega[${i}]`);
        finiteNumber(down.alpha[i] as number, `arc.downswing.alpha[${i}]`);
    }
    const last = down.release + (count - 2) * FREE_STEP;
    if (!(last < 0 && last + FREE_STEP >= 0)) {
        fail("arc.downswing's table must end at contact: its samples every FREE_STEP from the release");
    }
}
```

- at the end of `validateTrack`, add:

```ts
    if (arc.downswing !== undefined) {
        validateDownswing(arc.downswing, arc.mode, n);
    }
```

- append to `validateTrack`'s header: "; and a downswing, if given, well formed (validateDownswing)".

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/impact/track.test.ts`
Expected: PASS.

- [ ] **Step 8: Check bit-identity**

Run: `env OBSTACLE_STROKES=2000 npx --yes tsx scripts/impactDigest.ts > <temp>/digest-task2.txt`
Then: `cmp <temp>/digest-before.txt <temp>/digest-task2.txt`
Expected: no output (identical).

- [ ] **Step 9: Run every check**

Run, one per call: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`.
Expected: all pass. Every existing tracked test passes unchanged, so tracked drives without a downswing are
unchanged.

- [ ] **Step 10: Commit**

Message: `Let the swing path follow a downswing before contact`. Stage the four files by path.

---
### Task 3: The downswing

Spec §3.1–§3.4 and §7.1's analytic cases (exit criterion 1). `planDownswing` turns a contact pose, a stroke type's
`SwingShape` and the player's backswing and intensity into a `Downswing`:

- swing mode integrates the pendulum forward from rest at the top, with the hands slaved to its angle;
- carry mode is closed-form.

`scanDownswing` finds its closest approach to the turf. These are pure functions; Task 5 wires them in.

**Files:**
- Create: `src/engine/swing/downswing.ts`
- Modify: `src/engine/swing/types.ts`
- Test: `tests/engine/swing/downswing.test.ts`

**Interfaces:**
- Consumes (Task 2):
  - `Downswing`;
  - `FREE_STEP`;
  - `downswingAt`, `downswingHands`, `downswingSamples`, `downswingTime`;
  - `type Pendulum`;
  - `swingOrientation`.
- Produces:
  - in `swing/types.ts`, `interface SwingShape { pendulumShare: number; handAngle: number; effort: { torqueMax:
    number; tempoSlow: number; tempoFast: number }; handTempo: { slow: number; fast: number }; defaultIntensity:
    number }`;
  - in `swing/downswing.ts`:
    - `MAX_BACK_ANGLE` (π/2) and `MAX_FALL` (2 s);
    - `interface DownswingInput { mode; aim; thetaContact; pivot; lever; pendulum; shape; backswing; intensity }`;
    - `interface PlannedDownswing { downswing: Downswing; omega: number; handsVelocity: Vec3 }`;
    - `planDownswing(input): PlannedDownswing`;
    - `interface DownswingScan { clearance: number; before: number; grounded: number | null }`;
    - `scanDownswing(down, head, aim, radius): DownswingScan`.

- [ ] **Step 1: Add `SwingShape`**

In `src/engine/swing/types.ts`, after `SwingDrive`, add:

```ts
/**
 * How a stroke type's whole stroke is shaped (P2b.2b.2a design §3, §5.1). `pendulumShare` (in [0, 1]) of the
 * backswing's height comes from the pendulum and the rest from the hands, which start back and up along `handAngle`
 * (rad above horizontal; read only when the share is below 1). Swing mode reads `effort`: the player's torque pulse
 * peaks at intensity·torqueMax (N·m) over a duration from `tempoSlow` (s, intensity 0) to `tempoFast` (s, intensity
 * 1). Carry mode reads `handTempo`: the hands' downswing lasts from `slow` (s, intensity 0) to `fast` (s, intensity 1).
 * `defaultIntensity` (in [0, 1]) stands for a shot that gives none.
 */
export interface SwingShape {
    readonly pendulumShare: number;
    readonly handAngle: number;
    readonly effort: { readonly torqueMax: number; readonly tempoSlow: number; readonly tempoFast: number };
    readonly handTempo: { readonly slow: number; readonly fast: number };
    readonly defaultIntensity: number;
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/engine/swing/downswing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { headLowestPoint } from "../../../src/engine/impact/contacts";
import { rotate } from "../../../src/engine/impact/rigidBody";
import {
    downswingAt,
    downswingHands,
    downswingSamples,
    downswingTime,
    pendulumOf,
    swingOrientation,
    swungBody,
} from "../../../src/engine/impact/track";
import { add, length, scale, sub, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import {
    MAX_BACK_ANGLE,
    MAX_FALL,
    planDownswing,
    scanDownswing,
    type DownswingInput,
} from "../../../src/engine/swing/downswing";
import type { SwingShape } from "../../../src/engine/swing/types";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import { TEST_HANDS, TEST_HEAD } from "../support/impact";

const AIM = vec3(1, 0, 0);
const UP = vec3(0, 0, 1);
const RADIUS = 0.8;
const RHO = TEST_HEAD.socket.z;
/** ℓ_h, the head centre's distance from the top hand. */
const LEVER = RHO + RADIUS;
const PIVOT = vec3(0, 0, 0.9);
/** The test head on a 0.8 m arc with no arm mass: the swung body is the head. */
const PENDULUM = pendulumOf(TEST_HEAD, swungBody(TEST_HEAD, TEST_HANDS, RADIUS), RADIUS, STANDARD_GRAVITY);
const DEG = Math.PI / 180;

function shape(o: Partial<SwingShape> = {}): SwingShape {
    return {
        pendulumShare: 1,
        handAngle: 0.5,
        effort: { torqueMax: 0, tempoSlow: 0.4, tempoFast: 0.2 },
        handTempo: { slow: 0.4, fast: 0.2 },
        defaultIntensity: 0,
        ...o,
    };
}

function input(o: Partial<DownswingInput> = {}): DownswingInput {
    return {
        mode: "swing",
        aim: AIM,
        thetaContact: 0,
        pivot: PIVOT,
        lever: LEVER,
        pendulum: PENDULUM,
        shape: shape(),
        backswing: 0.3,
        intensity: 0,
        ...o,
    };
}

/** F(φ, k) = ∫₀^φ dψ/√(1 − k²·sin²ψ) by Simpson's rule over 4000 intervals (the integrand is smooth). */
function ellipticF(phi: number, k: number): number {
    const n = 4000;
    const h = phi / n;
    const f = (psi: number): number => 1 / Math.sqrt(1 - k * k * Math.sin(psi) ** 2);
    let sum = f(0) + f(phi);
    for (let i = 1; i < n; i++) {
        sum += (i % 2 === 1 ? 4 : 2) * f(i * h);
    }
    return (sum * h) / 3;
}

/** The head's speed at contact on a still pivot, or with the hands at `handsVelocity`. */
function contactSpeed(thetaContact: number, omega: number, handsVelocity: Vec3 = vec3(0, 0, 0)): number {
    const tangent = add(scale(AIM, Math.cos(thetaContact)), scale(UP, Math.sin(thetaContact)));
    return length(add(handsVelocity, scale(tangent, omega * LEVER)));
}

/** The pulse's torque (N·m) τ after the release. */
function pulse(tau: number, peak: number, duration: number): number {
    const u = tau / duration;
    return u >= 0 && u <= 1 ? 0.5 * peak * (1 - Math.cos(2 * Math.PI * u)) : 0;
}

describe("the backswing's top (design §3.2)", () => {
    it("raises the head by the backswing: the pendulum's share about the hands, the rest with the hands", () => {
        for (const pendulumShare of [1, 0.6]) {
            const { downswing } = planDownswing(input({ thetaContact: 0.1, shape: shape({ pendulumShare }) }));
            const pendulumRise = LEVER * (Math.cos(0.1) - Math.cos(downswing.thetaTop));
            const handsRise = downswing.handsTop.z - PIVOT.z;
            expect(pendulumRise, `share ${pendulumShare}`).toBeCloseTo(pendulumShare * 0.3, 12);
            expect(handsRise, `share ${pendulumShare}`).toBeCloseTo((1 - pendulumShare) * 0.3, 12);
            expect(downswing.thetaTop).toBeLessThan(0);
        }
    });

    it("takes the hands back along handAngle", () => {
        const { downswing } = planDownswing(input({ shape: shape({ pendulumShare: 0.6 }) }));
        const back = sub(PIVOT, downswing.handsTop);
        expect(back.x).toBeCloseTo(0.12 / Math.tan(0.5), 12);
        expect(back.y).toBe(0);
        expect(-back.z).toBeCloseTo(0.12, 12);
    });

    it("rejects a backswing that takes the shaft beyond MAX_BACK_ANGLE", () => {
        const level = LEVER * (1 - Math.cos(MAX_BACK_ANGLE));
        expect(() => planDownswing(input({ backswing: level + 0.01 }))).toThrow(/beyond/);
    });
});

describe("the swing-mode downswing (design §3.1, §3.4)", () => {
    it("matches the energy integral with gravity alone and the hands still, within 0.1 %", () => {
        for (const thetaContact of [0, 0.1, -0.2]) {
            const { downswing, omega } = planDownswing(input({ thetaContact }));
            const fall = PENDULUM.weight * (Math.cos(thetaContact) - Math.cos(downswing.thetaTop));
            const kinetic = 0.5 * PENDULUM.inertia * omega * omega;
            expect(Math.abs(kinetic / fall - 1), `θ_c ${thetaContact}`).toBeLessThanOrEqual(1e-3);
        }
    });

    it("falls in the pendulum's elliptic-integral time, within 0.1 %", () => {
        for (const thetaContact of [0, 0.1]) {
            const { downswing } = planDownswing(input({ thetaContact }));
            const k = Math.sin(-downswing.thetaTop / 2);
            const omegaN = Math.sqrt(PENDULUM.weight / PENDULUM.inertia);
            const phiC = Math.asin(Math.sin(thetaContact / 2) / k);
            const expected = (ellipticF(Math.PI / 2, k) + ellipticF(phiC, k)) / omegaN;
            expect(Math.abs(-downswing.release / expected - 1), `θ_c ${thetaContact}`).toBeLessThanOrEqual(1e-3);
        }
    });

    it("balances work and energy with the player's effort, within 0.1 %", () => {
        const effort = { torqueMax: 2, tempoSlow: 0.4, tempoFast: 0.2 };
        const { downswing, omega } = planDownswing(input({ intensity: 1, shape: shape({ effort }) }));
        let work = 0;
        for (let k = 0; k + 1 < downswingSamples(downswing); k++) {
            const t0 = downswingTime(downswing, k);
            const t1 = downswingTime(downswing, k + 1);
            const torque = 0.5 * (pulse(t0 - downswing.release, 2, 0.2) + pulse(t1 - downswing.release, 2, 0.2));
            work += torque * ((downswing.theta[k + 1] as number) - (downswing.theta[k] as number));
        }
        const fall = PENDULUM.weight * (1 - Math.cos(downswing.thetaTop));
        expect(work).toBeGreaterThan(0);
        expect(Math.abs((0.5 * PENDULUM.inertia * omega * omega) / (fall + work) - 1)).toBeLessThanOrEqual(1e-3);
    });

    it("swings faster and sooner with more intensity", () => {
        const effort = { torqueMax: 2, tempoSlow: 0.4, tempoFast: 0.2 };
        const at = (intensity: number) => planDownswing(input({ intensity, shape: shape({ effort }) }));
        expect(at(0.5).omega).toBeGreaterThan(at(0).omega);
        expect(at(1).omega).toBeGreaterThan(at(0.5).omega);
        expect(at(1).downswing.release).toBeGreaterThan(at(0).downswing.release);
    });

    it("integrates a near-horizontal backswing at full intensity", () => {
        // Review focus 2: the shaft taken back to 85°, the pulse clipped at contact if it outlasts the fall.
        const backswing = LEVER * (1 - Math.cos(85 * DEG));
        const effort = { torqueMax: 3, tempoSlow: 0.6, tempoFast: 0.3 };
        const still = planDownswing(input({ backswing, shape: shape({ effort }) }));
        const full = planDownswing(input({ backswing, intensity: 1, shape: shape({ effort }) }));
        expect(Number.isFinite(full.omega)).toBe(true);
        expect(full.omega).toBeGreaterThan(still.omega);
    });

    it("slaves the hands to the pendulum: P_b at the top, P_c at contact, level there, at V_c = 2·Δ_h·ω₀/span", () => {
        const planned = planDownswing(input({ shape: shape({ pendulumShare: 0.6 }) }));
        const { downswing, omega, handsVelocity } = planned;
        const top = downswingHands(downswing, downswing.release, downswingAt(downswing, downswing.release));
        expect(length(sub(top.P, downswing.handsTop))).toBe(0);
        expect(length(top.V)).toBe(0);
        const end = downswingHands(downswing, 0, downswingAt(downswing, 0));
        expect(length(sub(end.P, PIVOT))).toBeLessThan(1e-12);
        expect(Math.abs(end.V.z)).toBe(0);
        expect(length(sub(handsVelocity, scale(downswing.across, (2 * omega) / downswing.span)))).toBeLessThan(1e-12);
        expect(length(sub(end.V, handsVelocity))).toBeLessThan(1e-12);
    });

    it("tabulates θ, ω and α every FREE_STEP from the release, θ_c last", () => {
        const { downswing, omega } = planDownswing(input({ thetaContact: 0.1 }));
        const n = downswing.theta.length;
        expect(downswing.omega).toHaveLength(n);
        expect(downswing.alpha).toHaveLength(n);
        expect(downswing.theta[0]).toBe(downswing.thetaTop);
        expect(downswing.omega[0]).toBe(0);
        expect(downswing.theta[n - 1]).toBe(0.1);
        expect(downswing.omega[n - 1]).toBe(omega);
        expect(downswing.tempo).toBeNull();
        expect(downswingTime(downswing, n - 2)).toBeLessThan(0);
    });

    it("rejects a pendulum with no inertia, a stall and a fall beyond MAX_FALL", () => {
        // With no inertia the left-hand coefficient is 0 at the top (P′(0) = 0); with no weight and no effort the
        // pendulum never starts; with 1e-4 of the weight it falls in about 100 times the 0.47 s.
        expect(() => planDownswing(input({ pendulum: { ...PENDULUM, inertia: 0 } }))).toThrow(/effective inertia/);
        expect(() => planDownswing(input({ pendulum: { ...PENDULUM, weight: 0 } }))).toThrow(/stalls/);
        const slow = { ...PENDULUM, weight: PENDULUM.weight * 1e-4 };
        expect(() => planDownswing(input({ pendulum: slow }))).toThrow(new RegExp(`more than ${MAX_FALL} s`));
    });
});

describe("the carry-mode downswing (design §3.3)", () => {
    const carry = (o: Partial<DownswingInput> = {}) =>
        planDownswing(
            input({
                mode: "carry",
                thetaContact: -0.3,
                shape: shape({ pendulumShare: 0.5, handAngle: 0.6, handTempo: { slow: 0.5, fast: 0.25 } }),
                backswing: 0.2,
                ...o,
            }),
        );

    it("starts the hands' tempo before contact and reaches V_c = 2·Δ_h/T_h and ω₀ = 2·span/T_h", () => {
        const { downswing, omega, handsVelocity } = carry();
        expect(downswing.release).toBe(-0.5);
        expect(downswing.tempo).toBe(0.5);
        expect(downswing.theta).toHaveLength(0);
        expect(omega).toBeCloseTo((2 * downswing.span) / 0.5, 14);
        expect(length(sub(handsVelocity, scale(downswing.across, 2 / 0.5)))).toBeLessThan(1e-15);
    });

    it("halves the tempo and doubles the speed at intensity 1", () => {
        const slow = carry();
        const fast = carry({ intensity: 1 });
        expect(fast.downswing.release).toBe(-0.25);
        expect(contactSpeed(-0.3, fast.omega, fast.handsVelocity)).toBeCloseTo(
            2 * contactSpeed(-0.3, slow.omega, slow.handsVelocity),
            12,
        );
    });

    it("holds θ at θ_c with a share of 0, all hands", () => {
        const { downswing, omega } = carry({ shape: shape({ pendulumShare: 0, handAngle: 0.6 }) });
        expect(downswing.thetaTop).toBe(-0.3);
        expect(downswing.span).toBe(0);
        expect(omega).toBe(0);
        expect(downswingAt(downswing, -0.2).theta).toBe(-0.3);
    });
});

describe("scanDownswing (design §3.5)", () => {
    // The hands still and the contact level: swung back by φ the head's front rim is lowest, at P_z − (r + 2ρ)·cos φ −
    // (L/2)·sin φ, least at tan φ* = (L/2)/(r + 2ρ), where it is P_z − √((r + 2ρ)² + (L/2)²). The pivot is set so
    // that this least clearance is −3 mm, leaving 4.6 mm at contact.
    const arm = RADIUS + 2 * RHO;
    const half = TEST_HEAD.length / 2;
    const pivot = vec3(0, 0, Math.hypot(arm, half) - 0.003);
    const clearanceAt = (theta: number): number => pivot.z - arm * Math.cos(theta) - half * Math.abs(Math.sin(theta));

    it("finds the least clearance and when, and the first time the head is below the turf", () => {
        const { downswing } = planDownswing(input({ pivot }));
        const scan = scanDownswing(downswing, TEST_HEAD, AIM, RADIUS);
        expect(scan.clearance).toBeCloseTo(-0.003, 9);
        expect(downswingAt(downswing, -scan.before).theta).toBeCloseTo(-Math.atan2(half, arm), 4);
        const grounded = scan.grounded as number;
        expect(grounded).toBeLessThan(-scan.before + 1e-12);
        expect(clearanceAt(downswingAt(downswing, grounded).theta)).toBeLessThan(0);
        expect(clearanceAt(downswingAt(downswing, grounded - 5e-6).theta)).toBeGreaterThanOrEqual(-1e-12);
    });

    it("places the head as the path does: its socket r along the shaft from the hands", () => {
        const { downswing } = planDownswing(input({ pivot, shape: shape({ pendulumShare: 0.7 }) }));
        const scan = scanDownswing(downswing, TEST_HEAD, AIM, RADIUS);
        let least = Infinity;
        for (let k = 0; k < downswingSamples(downswing); k++) {
            const t = downswingTime(downswing, k);
            const swing = downswingAt(downswing, t);
            const hands = downswingHands(downswing, t, swing);
            const radial = sub(scale(AIM, Math.sin(swing.theta)), scale(UP, Math.cos(swing.theta)));
            const orientation = swingOrientation(AIM, swing.theta);
            const position = sub(add(hands.P, scale(radial, RADIUS)), rotate(orientation, TEST_HEAD.socket));
            const still = vec3(0, 0, 0);
            least = Math.min(
                least,
                headLowestPoint({ position, orientation, velocity: still, angularVelocity: still }, TEST_HEAD),
            );
        }
        expect(scan.clearance).toBeCloseTo(least, 12);
    });

    it("reports no grounding for a swing that stays clear", () => {
        const { downswing } = planDownswing(input());
        expect(scanDownswing(downswing, TEST_HEAD, AIM, RADIUS).grounded).toBeNull();
    });
});
```

Exit criterion 1 asks for "with effort, the work–energy balance within 0.1 %". The trapezoid over the table's θ
steps integrates τ·dθ to second order, far inside that.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/swing/downswing.test.ts`
Expected: FAIL with `Cannot find module '…/src/engine/swing/downswing'`.

- [ ] **Step 4: Implement**

Create `src/engine/swing/downswing.ts`:

```ts
/**
 * The downswing (P2b.2b.2a design §3): from the backswing's top, where the pendulum and the hands are at rest, to the
 * planned contact, with no contact on the way.
 * - The top (§3.2): `pendulumShare` s of the backswing's height h raises the head about the hands, θ_top =
 *   −arccos(cos θ_c − s·h/ℓ_h); the hands start back and up along handAngle φ, d_h·sin φ = (1 − s)·h.
 * - The hands (§3.3) follow P(σ) = P_b + Δ_h·σ² + Δ_z·(3σ² − 2σ³), starting from rest and arriving level.
 * - Swing mode (§3.1, §3.4): the pendulum leads and σ = (θ − θ_top)/(θ_c − θ_top). I_P·θ̈ = −m·g·ℓ_h·sin θ − M·d·(A·t̂)
 *   + τ_p(t) is solved for θ̈ with A = P″·σ̇² + P′·σ̈, and integrated by semi-implicit Euler every FREE_STEP until θ
 *   first reaches θ_c, the crossing step cut by linear interpolation in θ. The effort τ_p is a bell-shaped pulse,
 *   i·τ_max·½·(1 − cos 2πu) over T(i) = T_slow + i·(T_fast − T_slow) from the release, clipped at contact.
 * - Carry mode (§3.3): the hands lead on their own tempo T_h(i), σ = (t − t_r)/T_h, and the slope follows them, θ =
 *   θ_top + (θ_c − θ_top)·σ²; closed-form, so not tabulated (plan, "Decisions made while planning").
 */
import { headLowestPoint } from "../impact/contacts";
import { rotate } from "../impact/rigidBody";
import {
    FREE_STEP,
    downswingAt,
    downswingHands,
    downswingSamples,
    downswingTime,
    swingOrientation,
    type Pendulum,
} from "../impact/track";
import type { Downswing, MalletHead, StrokeMode } from "../impact/types";
import { atan2, sinCos } from "../math/elementary";
import { ZERO, add, dot, scale, sub, vec3, type Vec3 } from "../math/vec3";
import type { SwingShape } from "./types";

/** The furthest the shaft may be taken back (rad from vertical): horizontal. A modelling bound (design §3.2). */
export const MAX_BACK_ANGLE = Math.PI / 2;

/** The longest downswing (s) before it is rejected (design §3.4). A modelling bound: no stroke falls for 2 s. */
export const MAX_FALL = 2;

const UP = vec3(0, 0, 1);

/** What planDownswing needs: the stroke's contact pose and pendulum, its shape and the player's choice. */
export interface DownswingInput {
    readonly mode: StrokeMode;
    /** Unit, horizontal. */
    readonly aim: Vec3;
    /** θ_c (rad, −lean) and the top hand at contact, P_c. */
    readonly thetaContact: number;
    readonly pivot: Vec3;
    /** ℓ_h = ρ + r (m): the head centre's distance from the top hand. */
    readonly lever: number;
    readonly pendulum: Pendulum;
    readonly shape: SwingShape;
    /** h (m), the head centre's height at the top above its height at contact, and the intensity in [0, 1]. */
    readonly backswing: number;
    readonly intensity: number;
}

/** A planned downswing and the path's state at contact. */
export interface PlannedDownswing {
    readonly downswing: Downswing;
    /** ω₀ (rad/s), the pendulum's rate at contact. */
    readonly omega: number;
    /** V_c (m/s), the hands' velocity at contact. */
    readonly handsVelocity: Vec3;
}

function fail(message: string): never {
    throw new RangeError(message);
}

/**
 * Plans the downswing of `input` (design §3.2–§3.4). Throws a RangeError for a backswing beyond MAX_BACK_ANGLE, a
 * swing-mode downswing whose pendulum does not swing (pendulumShare 0), a non-positive effective inertia, a stall
 * (ω falling to zero or below before θ_c), or a fall beyond MAX_FALL. Every other input is taken as checked
 * (buildContact).
 */
export function planDownswing(input: DownswingInput): PlannedDownswing {
    const { mode, aim, thetaContact, pivot, lever, shape, backswing, intensity } = input;
    const share = shape.pendulumShare;
    const [, cosContact] = sinCos(thetaContact);
    const c = cosContact - (share * backswing) / lever;
    const [, cosMax] = sinCos(MAX_BACK_ANGLE);
    if (c < cosMax) {
        fail(
            `the backswing takes the shaft beyond ${MAX_BACK_ANGLE} rad from vertical: a ${backswing} m backswing ` +
                `with pendulumShare ${share} on a ${lever} m pendulum`,
        );
    }
    // A share of 0 holds the slope: the pendulum stays at θ_c.
    const thetaTop = share > 0 ? 0 - atan2(Math.sqrt(1 - c * c), c) : thetaContact;
    const span = thetaContact - thetaTop;
    let across = ZERO;
    let drop = ZERO;
    if (share < 1) {
        const [sp, cp] = sinCos(shape.handAngle);
        const reach = ((1 - share) * backswing) / sp;
        across = scale(aim, reach * cp);
        drop = vec3(0, 0, 0 - reach * sp);
    }
    const handsTop = sub(sub(pivot, across), drop);
    if (mode === "carry") {
        const { slow, fast } = shape.handTempo;
        const tempo = slow + intensity * (fast - slow);
        const downswing: Downswing = {
            release: 0 - tempo,
            thetaTop,
            span,
            handsTop,
            across,
            drop,
            tempo,
            theta: [],
            omega: [],
            alpha: [],
        };
        return { downswing, omega: (2 * span) / tempo, handsVelocity: scale(across, 2 / tempo) };
    }
    if (!(span > 0)) {
        fail("a swing-mode downswing needs its pendulum to swing: pendulumShare must be positive");
    }
    const { weight, inertial, inertia } = input.pendulum;
    const { torqueMax, tempoSlow, tempoFast } = shape.effort;
    const pulse = tempoSlow + intensity * (tempoFast - tempoSlow);
    const peak = intensity * torqueMax;
    const effort = (tau: number): number => {
        const u = tau / pulse;
        if (!(peak > 0 && u >= 0 && u <= 1)) {
            return 0;
        }
        const [, cu] = sinCos(2 * Math.PI * u);
        return 0.5 * peak * (1 - cu);
    };
    // §3.3: (I_P + M·d·(P′·t̂)/span)·θ̈ = −m·g·ℓ_h·sin θ − M·d·(P″·t̂)·σ̇² + τ_p, σ̇ = ω/span.
    const accel = (theta: number, omega: number, tau: number): number => {
        const [s, co] = sinCos(theta);
        const sigma = (theta - thetaTop) / span;
        const slope = add(scale(across, 2 * sigma), scale(drop, 6 * sigma - 6 * sigma * sigma));
        const bend = add(scale(across, 2), scale(drop, 6 - 12 * sigma));
        const tangent = add(scale(aim, co), scale(UP, s));
        const coefficient = inertia + (inertial * dot(slope, tangent)) / span;
        if (!(coefficient > 0)) {
            fail(
                `the downswing's effective inertia is not positive (${coefficient} kg·m² at θ = ${theta} rad): the ` +
                    "hands' backswing moves too steeply for the pendulum",
            );
        }
        const rate = omega / span;
        return (0 - weight * s - inertial * dot(bend, tangent) * rate * rate + effort(tau)) / coefficient;
    };
    const theta: number[] = [thetaTop];
    const omega: number[] = [0];
    const alpha: number[] = [];
    let th = thetaTop;
    let om = 0;
    for (let k = 0; ; k++) {
        const tau = k * FREE_STEP;
        const a = accel(th, om, tau);
        alpha.push(a);
        const omNext = om + a * FREE_STEP;
        const thNext = th + omNext * FREE_STEP;
        if (!(omNext > 0)) {
            fail(
                `the downswing stalls ${tau} s after the release, at θ = ${th} rad, short of θ_c = ` +
                    `${thetaContact} rad`,
            );
        }
        if (thNext >= thetaContact) {
            const f = (thetaContact - th) / (thNext - th);
            const fall = (k + f) * FREE_STEP;
            const omegaContact = om + f * (omNext - om);
            theta.push(thetaContact);
            omega.push(omegaContact);
            alpha.push(accel(thetaContact, omegaContact, fall));
            const downswing: Downswing = {
                release: 0 - fall,
                thetaTop,
                span,
                handsTop,
                across,
                drop,
                tempo: null,
                theta,
                omega,
                alpha,
            };
            return { downswing, omega: omegaContact, handsVelocity: scale(across, (2 * omegaContact) / span) };
        }
        if ((k + 1) * FREE_STEP > MAX_FALL) {
            fail(`the downswing takes more than ${MAX_FALL} s to reach contact`);
        }
        th = thNext;
        om = omNext;
        theta.push(th);
        omega.push(om);
    }
}

/** The downswing's closest approach to the turf (design §3.5). */
export interface DownswingScan {
    /** The head's lowest clearance above the turf (m), negative where it is below it, and when (s before contact). */
    readonly clearance: number;
    readonly before: number;
    /** The first time (s from contact) the head is below the turf, or null if it never is. */
    readonly grounded: number | null;
}

/**
 * Scans the downswing `down` of `head` swung on `aim` about a top hand `radius` from its socket (design §3.5): the
 * head at every sample (downswingSamples), placed on the path as headOnPath places it, its lowest point against the
 * turf plane.
 */
export function scanDownswing(down: Downswing, head: MalletHead, aim: Vec3, radius: number): DownswingScan {
    let clearance = Infinity;
    let before = 0;
    let grounded: number | null = null;
    const n = downswingSamples(down);
    for (let k = 0; k < n; k++) {
        const t = downswingTime(down, k);
        const swing = downswingAt(down, t);
        const hands = downswingHands(down, t, swing);
        const [s, c] = sinCos(swing.theta);
        const socket = add(hands.P, scale(sub(scale(aim, s), scale(UP, c)), radius));
        const orientation = swingOrientation(aim, swing.theta);
        const position = sub(socket, rotate(orientation, head.socket));
        const z = headLowestPoint({ position, orientation, velocity: ZERO, angularVelocity: ZERO }, head);
        if (z < clearance) {
            clearance = z;
            before = 0 - t;
        }
        if (grounded === null && z < 0) {
            grounded = t;
        }
    }
    return { clearance, before, grounded };
}
```

If `headLowestPoint`'s parameter type does not accept the literal, pass a `HeadState`; it reads only the position
and the orientation.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/swing/downswing.test.ts`
Expected: PASS.

If the elliptic-time or energy test fails, print the ratio before touching the tolerance. The semi-implicit Euler at
5 µs over about 0.4 s should agree to about 1e-5. A larger error means the crossing cut or the table's alignment is
wrong.

- [ ] **Step 6: Run every check**

Run, one per call: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`.
Expected: all pass.

- [ ] **Step 7: Commit**

Message: `Plan the downswing from the backswing's top`. Stage `src/engine/swing/types.ts`,
`src/engine/swing/downswing.ts` and `tests/engine/swing/downswing.test.ts`.

---
### Task 4: The contact pose and the stroke-shape fit

Spec §5.3 and §6.2. `buildContact`'s steps 1–5 and 10 become `contactPose`, so the fit can compute a planned speed
without building a contact. `scripts/fitStrokeShape.ts` then fixes, per stroke type and in the spec's order, h₀,
the effort or the hands' tempo, and the default backswing and intensity. It writes them into `swing.json`, and the
loader reads them.

Do the steps in order. The fit reads `swing.json` through the Task 1 loader, and the loader only requires the
derived fields once the fit has written them (Step 6).

**Files:**
- Create: `scripts/fitStrokeShape.ts`
- Modify: `src/engine/swing/buildContact.ts`, `reference/swing.json` (by the script), `src/reference/index.ts`
- Test: `tests/engine/swing/buildContact.test.ts`, `tests/reference/reference.test.ts`

**Interfaces:**
- Consumes:
  - `planDownswing`, `DownswingInput`, `PlannedDownswing` and `MAX_BACK_ANGLE` (Task 3);
  - `pendulumOf` (Task 2);
  - `swingReference` (Task 1).
- Produces, in `swing/buildContact.ts`:
  - `interface ContactPose { head: MalletHead; aim: Vec3; thetaContact: number; orientation: Quaternion;
    headCentre: Vec3; pivot: Vec3; radius: number }`;
  - `contactPose(setup, world): ContactPose`;
  - `interface StrokeChoice { mode: StrokeMode; shape: SwingShape; backswing: number; intensity: number }`;
  - `downswingInput(pose, hands, choice, gravity): DownswingInput`;
  - `poseSpeed(pose, planned): number`.
- Produces, on `StrokeShapeReference`:
  - `defaultBackswing`, `defaultIntensity` and `defaultSpeed` (`ReferenceValue`);
  - `effort: { torqueMax; tempoSlow; tempoFast } | null`, each a `ReferenceValue`, present for the swing presets;
  - `handTempo: { slow; fast } | null`, each a `ReferenceValue`, present for the rolls.

- [ ] **Step 1: Extract `contactPose`, test first**

In `tests/engine/swing/buildContact.test.ts`:

- add `contactPose`, `downswingInput` and `poseSpeed` to the import from `buildContact`;
- add `import { planDownswing } from "../../../src/engine/swing/downswing";`;
- add `pendulumOf` and `swungBody` to the import from `track`;
- add `type SwingShape` to the import from `swing/types`;
- add `TEST_HANDS` to the import from `../support/impact`;
- append:

```ts
describe("contactPose (design §5.2 steps 1–5, 10)", () => {
    it("is the on-time contact's pose: the head, its centre and orientation, the aim and the top hand", () => {
        // Met on the up, low on the face: clear of the turf on the way in (the dip test's stance).
        const setup = shot({ contact: { up: -0.01, side: 0.002 } }, testProfile({ stance: { lean: -0.05 } }));
        const pose = contactPose(setup, WORLD);
        const c = buildContact(setup, WORLD);
        expect(pose.head).toEqual(c.head);
        expect(pose.headCentre).toEqual(c.position);
        expect(pose.orientation).toEqual(c.orientation);
        expect(pose.thetaContact).toBe(0.05);
        expect(pose.radius).toBe(TOP);
        expect(pose.aim).toEqual(arcOf(c).aim);
        expect(pose.pivot).toEqual(arcOf(c).pivot);
    });

    it("gives the downswing the swung body's pendulum, and the planned speed |V_c + ω₀·n × (c − P_c)|", () => {
        const pose = contactPose(shot(), WORLD);
        const hands = { ...TEST_HANDS, armMass: 0.8 };
        const shape: SwingShape = {
            pendulumShare: 1,
            handAngle: 0.5,
            effort: { torqueMax: 0, tempoSlow: 0.4, tempoFast: 0.2 },
            handTempo: { slow: 0.4, fast: 0.2 },
            defaultIntensity: 0,
        };
        const input = downswingInput(pose, hands, { mode: "swing", shape, backswing: 0.3, intensity: 0 }, 9.8);
        expect(input.lever).toBe(RHO + TOP);
        expect(input.pendulum).toEqual(pendulumOf(pose.head, swungBody(pose.head, hands, TOP), TOP, 9.8));
        const planned = planDownswing(input);
        // The hands still: the head swings at ω₀·ℓ_h.
        expect(poseSpeed(pose, planned)).toBeCloseTo(planned.omega * (RHO + TOP), 12);
    });
});
```

Run: `npx vitest run tests/engine/swing/buildContact.test.ts`
Expected: FAIL with `contactPose is not a function`.

In `src/engine/swing/buildContact.ts`:

- import `pendulumOf` and `swungBody` from `../impact/track`;
- import `planDownswing`'s types: `import type { DownswingInput, PlannedDownswing } from "./downswing";`;
- import `Quaternion` as a type from `../impact/rigidBody` beside `rotate` and `solidCylinderInertia`;
- import `StrokeMode` as a type from `../impact/types`;
- import `BallState` as a type from `../types`;
- import `SwingShape` as a type from `./types`;
- add, before `buildContact`:

```ts
/** A stroke's pose at contact (design §5.2 steps 1–5, 10). */
export interface ContactPose {
    readonly head: MalletHead;
    /** Unit, horizontal. */
    readonly aim: Vec3;
    /** θ_c = −lean (rad). */
    readonly thetaContact: number;
    readonly orientation: Quaternion;
    readonly headCentre: Vec3;
    /** The top hand at contact, P_c, and its distance from the socket along the shaft, r (m). */
    readonly pivot: Vec3;
    readonly radius: number;
}

/**
 * The contact pose of `setup` on `world` (design §5.2): the arc radius r = top (step 1), θ_c = −lean (step 2), the
 * head pitched rigidly with the shaft (step 3), its face START_GAP short of the sunk striker at (up, side) (step 4),
 * the pivot r up the shaft from the socket (step 5), and the head a solid cylinder of the profile's mallet (step 10).
 * Takes the setup as checked (buildContact).
 */
export function contactPose(setup: ShotSetup, world: World): ContactPose {
    const { stroke, profile } = setup;
    const striker = setup.balls[setup.striker] as BallState;
    const { lean, top } = profile.stance[stroke.type];
    const { mallet } = profile;
    const rho = mallet.headDiameter / 2;
    const { up, side } = stroke.contact;
    const R = world.ball.radius;
    const surface = world.lawn.surfaceAt(striker.position);
    const sunk = R - (world.ball.mass * world.gravity) / surface.turfStiffness;
    const centre = vec3(striker.position.x, striker.position.y, sunk);
    const radius = top;
    const thetaC = 0 - lean;
    const [sa, ca] = sinCos(stroke.aim);
    const aim = vec3(ca, sa, 0);
    const orientation = swingOrientation(aim, thetaC);
    // f the face's outward normal (body x), its upward axis body z, `side` along body y (left of aim).
    const face = rotate(orientation, vec3(1, 0, 0));
    const upward = rotate(orientation, vec3(0, 0, 1));
    const left = rotate(orientation, vec3(0, 1, 0));
    const faceCentre = sub(sub(sub(centre, scale(face, R + START_GAP)), scale(upward, up)), scale(left, side));
    const headCentre = sub(faceCentre, scale(face, mallet.headLength / 2));
    const socket = add(headCentre, scale(upward, rho));
    const [st, ct] = sinCos(thetaC);
    const pivot = sub(socket, scale(sub(scale(aim, st), vec3(0, 0, ct)), radius));
    const head: MalletHead = {
        mass: mallet.headMass,
        inertia: solidCylinderInertia(mallet.headMass, mallet.headLength, rho),
        length: mallet.headLength,
        radius: rho,
        socket: vec3(0, 0, rho),
    };
    return { head, aim, thetaContact: thetaC, orientation, headCentre, pivot, radius };
}

/** The stroke's choices the downswing needs (design §3): its mode and shape, the backswing (m) and the intensity. */
export interface StrokeChoice {
    readonly mode: StrokeMode;
    readonly shape: SwingShape;
    readonly backswing: number;
    readonly intensity: number;
}

/**
 * The downswing's input for `pose` and `choice` (design §3.1): the pendulum of the swung body (the head and `hands`'
 * arm mass at the top grip) under `gravity`, ℓ_h = ρ + r.
 */
export function downswingInput(
    pose: ContactPose,
    hands: Hands,
    choice: StrokeChoice,
    gravity: number,
): DownswingInput {
    const body = swungBody(pose.head, hands, pose.radius);
    return {
        mode: choice.mode,
        aim: pose.aim,
        thetaContact: pose.thetaContact,
        pivot: pose.pivot,
        lever: pose.head.socket.z + pose.radius,
        pendulum: pendulumOf(pose.head, body, pose.radius, gravity),
        shape: choice.shape,
        backswing: choice.backswing,
        intensity: choice.intensity,
    };
}

/** The head's planned speed at contact (design §3.4): |V_c + ω₀·n × (c − P_c)|. */
export function poseSpeed(pose: ContactPose, planned: PlannedDownswing): number {
    const lever = cross(pitchAxis(pose.aim), sub(pose.headCentre, pose.pivot));
    return length(add(planned.handsVelocity, scale(lever, planned.omega)));
}
```

In `buildContact`, replace the code from `const R = world.ball.radius;` through the `pivot` constant (steps 1–5)
with:

```ts
    const pose = contactPose(setup, world);
    const { aim, orientation, radius, pivot, head } = pose;
    const thetaC = pose.thetaContact;
    const headCentre = pose.headCentre;
```

Delete the later `const head: MalletHead = { … }` (step 10), now in the pose. Keep the rest. The expressions are
unchanged, so every contact is bit-identical. Run:
`npx vitest run tests/engine/swing/buildContact.test.ts tests/engine/shot.test.ts`
Expected: PASS.

- [ ] **Step 2: Stop if kinematic pairs were sourced**

If any `swingReference[type].kinematics` is non-empty, stop and ask the user how the pairs are to be read:

- which intensity a measured stroke stands for;
- the grid's ranges for `torqueMax`, `tempoSlow` and `tempoFast`.

Spec §6.2 builds a deterministic grid search only if pairs exist, and leaves both questions open. Fold their answer
into this task before going on. Otherwise go on: every stroke type takes the placeholder.

- [ ] **Step 3: Write the fit**

Create `scripts/fitStrokeShape.ts`:

```ts
/**
 * The stroke-shape fit (P2b.2b.2a design §5.3, §6.2), for each stroke type in the presets' order:
 * 1. h₀, the backswing that gives CANONICAL_SPEED at intensity 0 (swing mode: gravity alone, the effort unread;
 *    carry mode: the hands at handTempo.slow);
 * 2. swing mode's effort, a labelled placeholder: tempoSlow the gravity-only fall time from h₀, tempoFast half of it,
 *    and torqueMax by bisection so that intensity 1 from h₀ gives SPEED_FACTOR times the speed; carry mode's tempo,
 *    a sourced handTempoSlow if swing.json holds one, else the placeholder (the single-ball stroke's gravity-only fall
 *    time from its h₀), the fast tempo half of it, so intensity 1 doubles the speed;
 * 3. the default: h₀ at intensity 0 if no range was sourced or the sourced range holds h₀; otherwise the range's
 *    nearest bound, at the intensity in [0, 1] whose speed is nearest CANONICAL_SPEED (by bisection where one
 *    reaches it).
 * Never fitted to a ratio (design §6.2). Prints reference/swing.json with its derived entries replaced to stdout and
 * a summary to stderr. Run with `npx --yes tsx scripts/fitStrokeShape.ts > <file>`, copy the file over
 * reference/swing.json and run Prettier on it. Throws if any stroke type has kinematic pairs (plan Task 4 Step 2).
 */
import swingJson from "../reference/swing.json";
import type { Hands, StrokeMode } from "../src/engine/impact/types";
import { contactPose, downswingInput, poseSpeed, type ContactPose } from "../src/engine/swing/buildContact";
import { MAX_BACK_ANGLE, planDownswing, type PlannedDownswing } from "../src/engine/swing/downswing";
import { defaultProfile } from "../src/engine/swing/profile";
import type { StrokeType, SwingShape } from "../src/engine/swing/types";
import { defaultWorld } from "../src/engine/world";
import { SWING_REFERENCE_TYPES, swingReference } from "../src/reference/index";
import { canonicalSetup } from "../tests/engine/support/shot";

/** P2b.2b.1's canonical contact speed (m/s), so the defaults' figures stay comparable (design exit criterion 5). */
const CANONICAL_SPEED = 3;

/** Intensity 1 from h₀ gives this many times the intensity-0 speed (design §6.2). */
const SPEED_FACTOR = 2;

/** Halvings of every bisection: to a double's resolution. */
const BISECTIONS = 60;

/** The source every derived entry cites. */
const FIT_SOURCE =
    "scripts/fitStrokeShape.ts: P2b.2b.2a design §5.3 and §6.2 " +
    "(docs/superpowers/specs/2026-10-06-p2b2b2a-stroke-shape-design.md)";

const WORLD = defaultWorld();

/** One stroke type's fixed inputs: its contact pose, hands, mode and sourced shape (effort and tempo unset). */
interface Case {
    readonly type: StrokeType;
    readonly pose: ContactPose;
    readonly hands: Hands;
    readonly mode: StrokeMode;
    readonly shape: SwingShape;
}

function caseOf(type: StrokeType): Case {
    const stance = defaultProfile.stance[type];
    const ref = swingReference[type];
    return {
        type,
        pose: contactPose(canonicalSetup(type, { world: WORLD }), WORLD),
        hands: {
            bottom: stance.bottom,
            gripTension: stance.gripTension,
            bottomGrip: stance.bottomGrip,
            armMass: defaultProfile.body.armMass,
            reachSlack: defaultProfile.body.reachSlack,
            guideEffort: 1,
        },
        mode: defaultProfile.drive[type].mode,
        shape: {
            pendulumShare: ref.pendulumShare.value,
            handAngle: ref.handAngle.value,
            effort: { torqueMax: 0, tempoSlow: 1, tempoFast: 0.5 },
            handTempo: { slow: 1, fast: 0.5 },
            defaultIntensity: 0,
        },
    };
}

function plan(c: Case, shape: SwingShape, backswing: number, intensity: number): PlannedDownswing {
    const choice = { mode: c.mode, shape, backswing, intensity };
    return planDownswing(downswingInput(c.pose, c.hands, choice, WORLD.gravity));
}

function speed(c: Case, shape: SwingShape, backswing: number, intensity: number): number {
    return poseSpeed(c.pose, plan(c, shape, backswing, intensity));
}

/** The largest backswing the pendulum's share allows (design §3.2), a hair short of the shaft horizontal. */
function maxBackswing(c: Case): number {
    const lever = c.pose.head.socket.z + c.pose.radius;
    const share = c.shape.pendulumShare;
    const room = lever * (Math.cos(c.pose.thetaContact) - Math.cos(MAX_BACK_ANGLE));
    return share > 0 ? (room / share) * (1 - 1e-9) : 2;
}

/** The x in (lo, hi] at which the increasing `f` reaches `target`, by bisection. Throws if f(hi) falls short. */
function solve(f: (x: number) => number, target: number, lo: number, hi: number): number {
    if (f(hi) < target) {
        throw new Error(`the target ${target} is beyond reach: ${f(hi)} at ${hi}`);
    }
    let a = lo;
    let b = hi;
    for (let i = 0; i < BISECTIONS; i++) {
        const mid = (a + b) / 2;
        if (f(mid) < target) {
            a = mid;
        } else {
            b = mid;
        }
    }
    return b;
}

/** Design §5.3 step 2: the default backswing, its intensity and its planned speed. */
function chooseDefault(c: Case, shape: SwingShape, h0: number) {
    const range = swingReference[c.type].backswingRange;
    if (range === null || (h0 >= range.low.value && h0 <= range.high.value)) {
        return { backswing: h0, intensity: 0, speed: speed(c, shape, h0, 0), atBound: false };
    }
    const bound = h0 < range.low.value ? range.low.value : range.high.value;
    const at = (intensity: number): number => speed(c, shape, bound, intensity);
    let intensity: number;
    if (at(0) >= CANONICAL_SPEED) {
        intensity = 0;
    } else if (at(1) <= CANONICAL_SPEED) {
        intensity = 1;
    } else {
        intensity = solve(at, CANONICAL_SPEED, 0, 1);
    }
    return { backswing: bound, intensity, speed: at(intensity), atBound: true };
}

function entry(value: number, unit: string, note: string, placeholder: boolean, bounds?: readonly [number, number]) {
    return {
        value,
        unit,
        ...(bounds === undefined ? {} : { bounds }),
        source: FIT_SOURCE,
        provenance: "derived",
        ...(placeholder ? { provisional: "placeholder" } : {}),
        note,
    };
}

const paired = SWING_REFERENCE_TYPES.filter((type) => swingReference[type].kinematics.length > 0);
if (paired.length > 0) {
    throw new Error(`kinematic pairs found for ${paired.join(", ")}: fitting to them needs a decision (Task 4 Step 2)`);
}

const out = JSON.parse(JSON.stringify(swingJson)) as Record<string, Record<string, unknown>>;
const fmt = (x: number, digits = 4): string => x.toFixed(digits);
let singleBallFall = NaN;
for (const type of SWING_REFERENCE_TYPES) {
    const c = caseOf(type);
    const record = out[type] as Record<string, unknown>;
    let shape = c.shape;
    let h0: number;
    if (c.mode === "swing") {
        h0 = solve((h) => speed(c, shape, h, 0), CANONICAL_SPEED, 0, maxBackswing(c));
        const fall = 0 - plan(c, shape, h0, 0).downswing.release;
        if (type === "single-ball") {
            singleBallFall = fall;
        }
        const pulse = { tempoSlow: fall, tempoFast: fall / 2 };
        const at = (torqueMax: number): number => speed(c, { ...shape, effort: { ...pulse, torqueMax } }, h0, 1);
        let hi = 1;
        while (at(hi) < SPEED_FACTOR * CANONICAL_SPEED) {
            hi *= 2;
        }
        const torqueMax = solve(at, SPEED_FACTOR * CANONICAL_SPEED, 0, hi);
        shape = { ...shape, effort: { ...pulse, torqueMax }, handTempo: { slow: fall, fast: fall / 2 } };
        const rule =
            `Placeholder (design §6.2): no kinematic pairs were sourced. h0 = ${fmt(h0)} m gives ` +
            `${CANONICAL_SPEED} m/s at intensity 0 in ${fmt(fall)} s`;
        const doubled = `${rule}; intensity 1 from h0 gives ${SPEED_FACTOR * CANONICAL_SPEED} m/s.`;
        record.torqueMax = entry(torqueMax, "N·m", doubled, true);
        record.tempoSlow = entry(fall, "s", `${rule}: the gravity-only fall time.`, true);
        record.tempoFast = entry(fall / 2, "s", `${rule}: half the gravity-only fall time.`, true);
    } else {
        const given = record.handTempoSlow as { source?: string; value?: number } | undefined;
        const sourced = given !== undefined && given.source !== FIT_SOURCE ? (given.value as number) : null;
        const slow = sourced ?? singleBallFall;
        const effort = { torqueMax: 0, tempoSlow: slow, tempoFast: slow / 2 };
        shape = { ...shape, handTempo: { slow, fast: slow / 2 }, effort };
        h0 = solve((h) => speed(c, shape, h, 0), CANONICAL_SPEED, 0, maxBackswing(c));
        if (sourced === null) {
            const note =
                'Placeholder (plan, "Decisions made while planning"): no roll tempo was sourced, so the ' +
                "single-ball stroke's gravity-only fall time from its h0.";
            record.handTempoSlow = entry(slow, "s", note, true);
        }
        const half = "Half handTempoSlow, so intensity 1 doubles the speed (design §6.2).";
        record.handTempoFast = entry(slow / 2, "s", half, sourced === null);
    }
    const chosen = chooseDefault(c, shape, h0);
    const why = chosen.atBound
        ? `h0 = ${fmt(h0)} m lies outside the sourced range, so its nearest bound, at the intensity whose speed is ` +
          `nearest ${CANONICAL_SPEED} m/s`
        : `h0 = ${fmt(h0)} m, the backswing that gives ${CANONICAL_SPEED} m/s at intensity 0`;
    record.defaultBackswing = entry(chosen.backswing, "m", `Design §5.3: ${why}.`, false);
    record.defaultIntensity = entry(chosen.intensity, "1", `Design §5.3: ${why}.`, false, [0, 1]);
    const planned = "The planned contact speed at the default backswing and intensity.";
    record.defaultSpeed = entry(chosen.speed, "m/s", planned, false);
    console.error(
        `${type.padEnd(11)} h0 ${fmt(h0)} m; default ${fmt(chosen.backswing)} m at intensity ` +
            `${fmt(chosen.intensity, 3)}, ${fmt(chosen.speed)} m/s; ` +
            (c.mode === "swing"
                ? `fall ${fmt(shape.effort.tempoSlow)} s, torqueMax ${fmt(shape.effort.torqueMax)} N·m`
                : `hands' tempo ${fmt(shape.handTempo.slow)} s`),
    );
}
console.log(JSON.stringify(out, null, 4));
```

Run `npx prettier --write scripts/fitStrokeShape.ts`. Prettier does not split string literals, so split any note
over 120 columns with `+` by hand.

- [ ] **Step 4: Run the fit**

Run: `npx --yes tsx scripts/fitStrokeShape.ts > <temp>/swing.json`
Expected: seven summary lines on stderr. Each default speed is 3.0000 m/s, unless that type's default sits at a
sourced bound.

Then: `cp <temp>/swing.json reference/swing.json`
Then: `npx prettier --write reference/swing.json`

Read the diff (`git diff reference/swing.json`): only the derived keys are added, and every string stays on one
line. Record the summary lines; Task 10's roadmap outcomes quote them.

- [ ] **Step 5: Write the failing reference tests**

Append to the swing describe in `tests/reference/reference.test.ts`:

```ts
    it("holds the fit's defaults: a backswing, an intensity in [0, 1] and its planned speed", () => {
        for (const type of SWING_REFERENCE_TYPES) {
            const shape = swingReference[type];
            expect(shape.defaultBackswing.value, type).toBeGreaterThan(0);
            expect(shape.defaultIntensity.value, type).toBeGreaterThanOrEqual(0);
            expect(shape.defaultIntensity.value, type).toBeLessThanOrEqual(1);
            // Exit criterion 5: 3 m/s within 2 %, or a default at a sourced bound.
            const range = shape.backswingRange;
            const atBound =
                range !== null &&
                (shape.defaultBackswing.value === range.low.value || shape.defaultBackswing.value === range.high.value);
            if (!atBound) {
                expect(Math.abs(shape.defaultSpeed.value / 3 - 1), type).toBeLessThanOrEqual(0.02);
            }
        }
    });

    it("gives the swing presets an effort and the rolls a hands' tempo, fast no slower than slow", () => {
        for (const type of SWING_REFERENCE_TYPES) {
            const { effort, handTempo } = swingReference[type];
            const swing = ["single-ball", "drive", "stop-ac", "stop-gc"].includes(type);
            expect(effort === null, type).toBe(!swing);
            expect(handTempo === null, type).toBe(swing);
            if (effort !== null) {
                expect(effort.torqueMax.value, type).toBeGreaterThanOrEqual(0);
                expect(effort.tempoFast.value, type).toBeLessThanOrEqual(effort.tempoSlow.value);
                expect(effort.tempoFast.value, type).toBeGreaterThan(0);
            }
            if (handTempo !== null) {
                expect(handTempo.fast.value, type).toBeLessThanOrEqual(handTempo.slow.value);
                expect(handTempo.fast.value, type).toBeGreaterThan(0);
            }
        }
    });

    it("halves the placeholder tempos (design §6.2)", () => {
        for (const type of SWING_REFERENCE_TYPES) {
            const { effort, handTempo } = swingReference[type];
            if (effort?.tempoSlow.provisional === "placeholder") {
                expect(effort.tempoFast.value, type).toBeCloseTo(effort.tempoSlow.value / 2, 12);
            }
            if (handTempo?.slow.provisional === "placeholder") {
                expect(handTempo.fast.value, type).toBeCloseTo(handTempo.slow.value / 2, 12);
            }
        }
    });
```

Run: `npx vitest run tests/reference/reference.test.ts`
Expected: FAIL. `defaultBackswing` is undefined because the loader does not read it yet.

- [ ] **Step 6: Read the derived fields**

In `src/reference/index.ts`, add to `StrokeShapeReference`:

```ts
    /** The fit's default backswing (m) and intensity, and the planned speed (m/s) they give (design §5.3). */
    readonly defaultBackswing: ReferenceValue;
    readonly defaultIntensity: ReferenceValue;
    readonly defaultSpeed: ReferenceValue;
    /** Swing mode's effort (the swing presets), or null. */
    readonly effort: {
        readonly torqueMax: ReferenceValue;
        readonly tempoSlow: ReferenceValue;
        readonly tempoFast: ReferenceValue;
    } | null;
    /** Carry mode's hands' tempo (the rolls), or null. */
    readonly handTempo: { readonly slow: ReferenceValue; readonly fast: ReferenceValue } | null;
```

and to `readShape`'s returned record:

```ts
        defaultBackswing: readValue(entry, "defaultBackswing", path),
        defaultIntensity: readValue(entry, "defaultIntensity", path),
        defaultSpeed: readValue(entry, "defaultSpeed", path),
        effort: has(entry, "tempoSlow")
            ? {
                  torqueMax: readValue(entry, "torqueMax", path),
                  tempoSlow: readValue(entry, "tempoSlow", path),
                  tempoFast: readValue(entry, "tempoFast", path),
              }
            : null,
        handTempo: has(entry, "handTempoSlow")
            ? { slow: readValue(entry, "handTempoSlow", path), fast: readValue(entry, "handTempoFast", path) }
            : null,
```

Update the `swingReference` comment: "sourced figures, labelled placeholders and the fit's derived defaults
(scripts/fitStrokeShape.ts)".

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/reference tests/engine/swing`
Expected: PASS.

- [ ] **Step 8: Run every check**

Run, one per call: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`.
Expected: all pass.

- [ ] **Step 9: Commit**

Message: `Fit the stroke-shape defaults into swing.json`. Stage `src/engine/swing/buildContact.ts`,
`scripts/fitStrokeShape.ts`, `reference/swing.json`, `src/reference/index.ts`,
`tests/engine/swing/buildContact.test.ts` and `tests/reference/reference.test.ts`.

---
### Task 5: The swing model takes a backswing

Spec §3, §5.1, §5.2, §5.3 and §7.2. `stroke.speed` gives way to `stroke.backswing` and `stroke.intensity?`:

- `SwingProfile` gains `shape` and `SwingDrive` loses `handShare`.
- `buildContact` plans the downswing and supplies it to the arc; the windows are measured against the planned
  contact speed.
- `swingApproach` reads the downswing's scan. `planStroke` returns the contact, the approach and the contact speed
  from one scan; `plannedSpeed` gives the speed alone.

The lead stays the actions' (Task 6 adds the turf's). Every caller migrates in this task, so that `npm run check`
stays green.

**Files:**
- Modify: `src/engine/swing/types.ts`, `src/engine/swing/profile.ts`, `src/engine/swing/buildContact.ts`,
  `src/engine/shot.ts` (the `approach` doc), `tests/engine/support/shot.ts`, `scripts/swingProbe.ts`
- Test: `tests/engine/swing/buildContact.test.ts`, `tests/engine/shot.test.ts`, `tests/engine/index.test.ts`

**Interfaces:**
- Consumes:
  - `planDownswing` and `scanDownswing` (Task 3);
  - `contactPose`, `downswingInput` and `poseSpeed` (Task 4);
  - `swingReference` with its defaults (Tasks 1 and 4).
- Produces:
  - `ShotSetup.stroke.backswing: number` and `ShotSetup.stroke.intensity?: number`;
  - `SwingProfile.shape: Readonly<Record<StrokeType, SwingShape>>`; `SwingDrive` without `handShare`;
  - `interface StrokePlan { contact: ContactState; approach: SwingApproach; contactSpeed: number }`;
  - `planStroke(setup, world): StrokePlan`;
  - `plannedSpeed(setup, world): number`;
  - `buildContact(setup, world)`, which is `planStroke(setup, world).contact`;
  - `swingApproach(contact)`, read from the contact's downswing;
  - in `tests/engine/support/shot.ts`:
    - `TestProfileOptions.shape?`;
    - `CanonicalOptions.shape?`;
    - `canonicalSetup`, now with the reference's default backswing;
    - `backswingFor(setup, speed, world?): number`.

- [ ] **Step 1: Change the types**

In `src/engine/swing/types.ts`:

1. Remove `handShare` from `SwingDrive`, and replace its comment's sentence "The hands: `handShare` of that speed (in
   [0, 1]; the pendulum supplies the rest), changing by `handGain` times it over `handWindow` (s) at full `drive`."
   with "The hands: from their speed at contact (P2b.2b.2a design §3.3), changing by `handGain` times the head's
   speed over `handWindow` (s) at full `drive`." Change "its changes measured against the head's speed at contact"
   to "its changes measured against the planned contact speed (P2b.2b.2a design §3.4)".
2. Add `readonly shape: Readonly<Record<StrokeType, SwingShape>>;` to `SwingProfile`, after `drive`.
3. In `ShotSetup.stroke`, replace the `speed` field and its comment with:

```ts
        /** The head centre's height at the backswing's top above its height at contact, m (P2b.2b.2a design §3.2). */
        readonly backswing: number;
        /** Effort and tempo, one control in [0, 1]; absent: the preset's defaultIntensity (P2b.2b.2a design §3.1). */
        readonly intensity?: number;
```

4. In the file header, replace "and, per shot, how the player times each." with "and, per shot, how far back the
   player takes the mallet, how hard and quickly they swing it, and how they time each action (P2b.2b.2a)."

- [ ] **Step 2: Give the default profile its shapes**

In `src/engine/swing/profile.ts`:

- import `swingReference` beside the other references;
- import `STROKE_TYPES` and `type SwingShape` from `./types`;
- delete every preset's `handShare` line.
- In the roll comments, replace "the hands 60 % of the head's speed" with "the hands' speed from the downswing
  (P2b.2b.2a design §3.3)". Do the same for the full roll's "the hands 90 % of the head's speed and still
  accelerating" (keep "still accelerating") and the pass roll's "the hands' 85 %".
- Add this bullet to the header, after the Drive bullet:

```ts
 * - Shape (P2b.2b.2a design §5.3): reference/swing.json, sourced or labelled placeholders, its effort and tempos fitted
 *   by scripts/fitStrokeShape.ts. The swing presets read the effort and the rolls the hands' tempo; the unread member
 *   repeats the read one's tempos.
```

- Before `defaultProfile`, add:

```ts
/** A stroke type's shape from reference/swing.json (design §5.3). */
function shapeOf(type: StrokeType): SwingShape {
    const ref = swingReference[type];
    const effort =
        ref.effort === null
            ? null
            : {
                  torqueMax: ref.effort.torqueMax.value,
                  tempoSlow: ref.effort.tempoSlow.value,
                  tempoFast: ref.effort.tempoFast.value,
              };
    const tempo = ref.handTempo;
    const handTempo = tempo === null ? null : { slow: tempo.slow.value, fast: tempo.fast.value };
    if (effort === null && handTempo === null) {
        throw new Error(`reference/swing.json gives ${type} neither an effort nor a hands' tempo`);
    }
    return {
        pendulumShare: ref.pendulumShare.value,
        handAngle: ref.handAngle.value,
        effort: effort ?? { torqueMax: 0, tempoSlow: handTempo?.slow ?? 0, tempoFast: handTempo?.fast ?? 0 },
        handTempo: handTempo ?? { slow: effort?.tempoSlow ?? 0, fast: effort?.tempoFast ?? 0 },
        defaultIntensity: ref.defaultIntensity.value,
    };
}
```

- Add after `drive: { … },` in `defaultProfile`:

```ts
    shape: Object.fromEntries(STROKE_TYPES.map((type) => [type, shapeOf(type)])) as Record<StrokeType, SwingShape>,
```

- [ ] **Step 3: Update the test support**

In `tests/engine/support/shot.ts`:

- import `MAX_BACK_ANGLE` from `../../../src/engine/swing/downswing`;
- import `plannedSpeed` from `../../../src/engine/swing/buildContact`;
- add `type SwingShape` to the `swing/types` import;
- import `swingReference` beside `lawnReference`.

Then:

1. Add `readonly shape?: Partial<SwingShape>;` to `TestProfileOptions`. In `testProfile`:
   - delete `handShare: 0,`;
   - add the shape below;
   - add `shape: every(shape),` to the returned profile;
   - append to the comment: "; and the same shape for every type, the pendulum alone (share 1) by gravity alone (no
     effort), a 0.4 s pulse or hands' tempo halving at intensity 1, intensity 0 by default".

```ts
    const shape: SwingShape = {
        pendulumShare: 1,
        handAngle: 0.5,
        effort: { torqueMax: 0, tempoSlow: 0.4, tempoFast: 0.2 },
        handTempo: { slow: 0.4, fast: 0.2 },
        defaultIntensity: 0,
        ...o.shape,
    };
```

2. Add `readonly shape?: Partial<SwingShape>;` to `CanonicalOptions` (comment: "fields of the preset's own shape").
   In `canonicalSetup`'s profile, add
   `shape: { ...defaultProfile.shape, [type]: { ...defaultProfile.shape[type], ...over.shape } },`, and replace
   `speed: 3,` with `backswing: swingReference[type].defaultBackswing.value,`. In its comment, replace "3 m/s" with
   "the default backswing (reference/swing.json: 3 m/s planned at the default intensity, exit criterion 5)".
3. Append:

```ts
const SOLVED = new Map<string, number>();

/**
 * The backswing (m) at which `setup`'s planned contact speed is `speed` (P2b.2b.2a design §5.3): bisection over (0,
 * the MAX_BACK_ANGLE bound] at the setup's intensity, or its preset's default, 60 halvings. Memoised on what the
 * planned speed depends on: the type, the intensity, the profile's entries for the type, the speed and gravity (not
 * the drive, the contact point, the timing or the balls). Test support only.
 */
export function backswingFor(setup: ShotSetup, speed: number, world: World = defaultWorld()): number {
    const { stroke, profile } = setup;
    const { type } = stroke;
    const stance = profile.stance[type];
    const shape = profile.shape[type];
    const key = JSON.stringify([
        type,
        stroke.intensity ?? null,
        profile.mallet,
        profile.body,
        stance,
        profile.drive[type].mode,
        shape,
        speed,
        world.gravity,
    ]);
    const known = SOLVED.get(key);
    if (known !== undefined) {
        return known;
    }
    const lever = profile.mallet.headDiameter / 2 + stance.top;
    const room = lever * (Math.cos(stance.lean) - Math.cos(MAX_BACK_ANGLE));
    let hi = shape.pendulumShare > 0 ? (room / shape.pendulumShare) * (1 - 1e-9) : 2;
    const at = (backswing: number): number => plannedSpeed({ ...setup, stroke: { ...stroke, backswing } }, world);
    if (at(hi) < speed) {
        throw new Error(`backswingFor: ${speed} m/s is beyond the ${type} stroke's reach (${at(hi)} m/s at ${hi} m)`);
    }
    let lo = 0;
    for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (at(mid) < speed) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    SOLVED.set(key, hi);
    return hi;
}
```

`Math.cos(stance.lean)` is cos θ_c, since θ_c = −lean.

- [ ] **Step 4: Migrate the tests (RED for the new behaviour)**

**`tests/engine/swing/buildContact.test.ts`:**

1. Imports:
   - add `planStroke` and `plannedSpeed` to the `buildContact` import;
   - add `downswingAt` to the `track` import;
   - add `Downswing` to the `types` type import;
   - add `swingReference` to the reference import;
   - add `backswingFor` to the `../support/shot` import.
2. Add, below `const DEG`:

```ts
/**
 * The default test backswing (m): about 3.1 m/s by gravity alone on the test profile's pendulum (r = 0.8 m, the test
 * head, no arm mass).
 */
const BACKSWING = 0.5;
```

   and in `shot()` replace `speed: 3,` with `backswing: BACKSWING,`.
3. Replace the test "splits the head's speed between the hands and the pendulum" with:

```ts
    it("starts an on-time head at its planned speed: the hands' V_c and the pendulum's ω₀ at contact", () => {
        for (const pendulumShare of [1, 0.6]) {
            const setup = shot({}, testProfile({ shape: { pendulumShare } }));
            const { contact: c, contactSpeed } = planStroke(setup, WORLD);
            const arc = arcOf(c);
            const down = arc.downswing as Downswing;
            expect(length(c.velocity), `share ${pendulumShare}`).toBeCloseTo(contactSpeed, 12);
            expect(dist(arc.pivotVelocity, scale(down.across, (2 * arc.omega0) / down.span))).toBeLessThan(1e-12);
            const swing = scale(cross(pitchAxis(arc.aim), sub(c.position, arc.pivot)), arc.omega0);
            expect(dist(c.velocity, add(arc.pivotVelocity, swing))).toBeLessThan(1e-12);
            expect(plannedSpeed(setup, WORLD)).toBe(contactSpeed);
        }
    });
```

4. In "drives both arcs over their windows against the head's speed":
   - rename it "…against the planned speed";
   - set its profile to `testProfile({ drive: { speedGain: 0.4, window: 0.02, handGain: 0.3, handWindow: 0.03 },
     shape: { pendulumShare: 0.5 } })`;
   - build with `const { contact: c, contactSpeed } = planStroke(shot({ drive: -0.5 }, profile), WORLD);`;
   - replace `3` with `contactSpeed` in both expectations;
   - drop the last expectation and its comment.
5. In "starts the impact at the earliest early action…", "starts the head exactly on its own path" and the mirrored
   test, replace each `handShare: x` with a shape of `pendulumShare: 1 - x`, moved from `drive` into
   `shape: { … }`.
6. Replace the `describe("swingApproach", …)` block with:

```ts
describe("swingApproach", () => {
    it("finds a low swing's downswing in the turf before contact, at its least clearance", () => {
        // Level, the ball met 10 mm above the face centre: the head's lowest point is h₀ − 0.01 − ρ clear at contact.
        // The top hand is still, so swung back by φ the head's front rim dips to P_z − (r + 2ρ)·cos φ − (L/2)·sin φ,
        // least at tan φ* = (L/2)/(r + 2ρ): about 3.64 mm in the turf (P2b.2b.1's coasting figure: the same circle).
        const c = buildContact(shot({ contact: { up: 0.01, side: 0 } }), WORLD);
        expect(headLowestPoint(c, c.head)).toBeCloseTo(SUNK_Z - 0.01 - RHO, 12);
        const pivotZ = SUNK_Z - 0.01 + RHO + TOP;
        const approach = swingApproach(c);
        expect(approach.clearance).toBeCloseTo(pivotZ - Math.hypot(TOP + 2 * RHO, LENGTH / 2), 9);
        const down = arcOf(c).downswing as Downswing;
        expect(downswingAt(down, -approach.before).theta).toBeCloseTo(-Math.atan2(LENGTH / 2, TOP + 2 * RHO), 4);
    });

    it("measures back from the planned contact, whatever the lead", () => {
        const profile = testProfile({ shape: { pendulumShare: 0.7 } });
        const onTime = swingApproach(buildContact(shot({}, profile), WORLD));
        const early = swingApproach(buildContact(shot({ timing: { arc: -0.02, hands: 0, dip: 0 } }, profile), WORLD));
        expect(early).toEqual(onTime);
    });

    it("ignores every action: the downswing is planned without them", () => {
        const shape = { pendulumShare: 0.7 };
        const acting = testProfile({ drive: { speedGain: 0.4, handGain: 0.2, handDrop: 0.004 }, shape });
        const plain = testProfile({ drive: { speedGain: 0.4, handGain: 0.2 }, shape });
        const timing = { arc: -0.03, hands: -0.02, dip: -0.04 };
        const a = swingApproach(buildContact(shot({ drive: -1, timing }, acting), WORLD));
        const b = swingApproach(buildContact(shot({}, plain), WORLD));
        expect(a).toEqual(b);
    });

    it("is the plan's approach, from the same scan", () => {
        const plan = planStroke(shot({}, testProfile({ shape: { pendulumShare: 0.7 } })), WORLD);
        expect(swingApproach(plan.contact)).toEqual(plan.approach);
    });
});
```

7. Replace `CANONICAL_APPROACH` and the canonical describe's first test with:

```ts
/**
 * The downswing's least clearance on each canonical setup. The swing presets swing about a still top hand, so theirs
 * is the circle's: P2b.2b.1's coasting approach on prototype aeadd4c's geometry (the level presets' minimum lies
 * 36.25 ms before contact at 3 m/s, the AC stop's 56 ms). The rolls' hands rise behind contact and their pendulum
 * swings the head up, already past the rim's lowest angle, so theirs is at contact: CANONICAL_CLEARANCE.
 */
const CANONICAL_APPROACH: Readonly<Record<StrokeType, number>> = {
    "single-ball": 0.51544e-3,
    drive: 0.51544e-3,
    "stop-ac": 7.2281e-3,
    "stop-gc": 0.51544e-3,
    "half-roll": 21.1109e-3,
    "full-roll": 51.6104e-3,
    "pass-roll": 54.7165e-3,
};

describe("the default profile's canonical setups", () => {
    it.each(STROKE_TYPES)("%s starts at contact, by its planned clearance, its approach as planned", (type) => {
        const world = defaultWorld();
        const c = buildContact(canonicalSetup(type, { world }), world);
        expect(arcOf(c).contactAt).toBe(0);
        expect(headLowestPoint(c, c.head)).toBeCloseTo(CANONICAL_CLEARANCE[type], 6);
        expect(swingApproach(c).clearance).toBeCloseTo(CANONICAL_APPROACH[type], 6);
    });

    it.each(STROKE_TYPES)("%s plans its default speed (exit criterion 5)", (type) => {
        const world = defaultWorld();
        const speed = plannedSpeed(canonicalSetup(type, { world }), world);
        expect(speed).toBeCloseTo(swingReference[type].defaultSpeed.value, 9);
    });
```

   Keep the AC stop and GC stop tests that follow inside the describe.

8. In `describe("defaultProfile")`, add:

```ts
    it("takes each stroke type's shape from swing.json, the swing presets' pendulum alone", () => {
        for (const type of STROKE_TYPES) {
            const shape = defaultProfile.shape[type];
            const ref = swingReference[type];
            expect(shape.pendulumShare, type).toBe(ref.pendulumShare.value);
            expect(shape.handAngle, type).toBe(ref.handAngle.value);
            expect(shape.defaultIntensity, type).toBe(ref.defaultIntensity.value);
            if (ref.effort !== null) {
                expect(shape.effort, type).toEqual({
                    torqueMax: ref.effort.torqueMax.value,
                    tempoSlow: ref.effort.tempoSlow.value,
                    tempoFast: ref.effort.tempoFast.value,
                });
            }
            const tempo = ref.handTempo;
            if (tempo !== null) {
                expect(shape.handTempo, type).toEqual({ slow: tempo.slow.value, fast: tempo.fast.value });
            }
        }
        expect(STROKE_TYPES.slice(0, 4).map((type) => defaultProfile.shape[type].pendulumShare)).toEqual([1, 1, 1, 1]);
    });
```

9. In `describe("buildContact rejections")`:

   - widen `missing` to `(record: "stance" | "drive" | "shape")`;
   - above `const cases`, add:

```ts
    // The low swing's downswing is deepest about 36 ms before contact (the swingApproach test): a dip timed then
    // starts the impact with the head in the turf.
    const low = shot({ contact: { up: 0.01, side: 0 } });
    const deepest = swingApproach(buildContact(low, WORLD)).before;
```

   - Replace the `"a non-positive speed"` case and the `"a hand share above 1"` case. Add the new cases below, and
     change the `"a head in the turf where an early action begins"` case to use `deepest`:

```ts
        ["a stroke type missing from the shape", shot({ type: "drive" }, missing("shape")), /shape has no entry/],
        ["a non-finite backswing", shot({ backswing: NaN }), /stroke\.backswing must be finite/],
        ["a backswing of 0", shot({ backswing: 0 }), /stroke\.backswing must be positive/],
        ["an intensity above 1", shot({ intensity: 1.2 }), /stroke\.intensity must lie in \[0, 1\]/],
        [
            "a pendulum share above 1",
            shot({}, testProfile({ shape: { pendulumShare: 1.1 } })),
            /pendulumShare must lie in \[0, 1\]/,
        ],
        [
            "a hands' angle of 90° with a hands' share",
            shot({}, testProfile({ shape: { pendulumShare: 0.5, handAngle: Math.PI / 2 } })),
            /handAngle must lie in \(0, 90°\)/,
        ],
        [
            "a share of 0 in swing mode",
            shot({}, testProfile({ shape: { pendulumShare: 0 } })),
            /pendulumShare must be positive in swing mode/,
        ],
        [
            "a non-positive slow tempo",
            shot({}, testProfile({ shape: { effort: { torqueMax: 0, tempoSlow: 0, tempoFast: 0 } } })),
            /effort\.tempoSlow must be positive/,
        ],
        [
            "a fast tempo slower than the slow",
            shot({}, testProfile({ shape: { effort: { torqueMax: 0, tempoSlow: 0.2, tempoFast: 0.3 } } })),
            /effort\.tempoFast must not exceed .*effort\.tempoSlow/,
        ],
        [
            "a negative peak torque",
            shot({}, testProfile({ shape: { effort: { torqueMax: -1, tempoSlow: 0.4, tempoFast: 0.2 } } })),
            /torqueMax must be non-negative/,
        ],
        [
            "a carry's fast hands' tempo slower than the slow",
            shot({}, testProfile({ drive: { mode: "carry" }, shape: { handTempo: { slow: 0.2, fast: 0.3 } } })),
            /handTempo\.fast must not exceed .*handTempo\.slow/,
        ],
        [
            "a default intensity above 1",
            shot({}, testProfile({ shape: { defaultIntensity: 1.5 } })),
            /defaultIntensity must lie in \[0, 1\]/,
        ],
        ["a backswing beyond the shaft horizontal", shot({ backswing: 2 }), /beyond/],
        [
            "a head in the turf where an early action begins",
            shot({ contact: { up: 0.01, side: 0 }, timing: { arc: 0, hands: 0, dip: -deepest } }),
            /in the turf .* s before contact/,
        ],
```

**`tests/engine/shot.test.ts`:**

- add `backswingFor` to the `./support/shot` import;
- in "ends a gentle tap before the cap", replace `{ stroke: { speed: 0.1 } }` with
  `{ stroke: { backswing: backswingFor(canonicalSetup("single-ball"), 0.1) } }`;
- in the guide-effort test, replace `{ stroke: { speed: 2, guideEffort } }` with
  `{ stroke: { backswing: backswingFor(canonicalSetup("drive"), 2), guideEffort } }`.

**`tests/engine/index.test.ts`:** replace `speed: 2,` with `backswing: 0.3,`.

Run: `npx vitest run tests/engine/swing/buildContact.test.ts`
Expected: FAIL: `planStroke is not a function`, and the canonical setups fail because `shot()` builds no shape yet.

- [ ] **Step 5: Rewrite `buildContact.ts`**

Replace `src/engine/swing/buildContact.ts` with the file below. It keeps Task 4's `contactPose`, `StrokeChoice`,
`downswingInput` and `poseSpeed` unchanged; copy them from the current file into the marked place.

```ts
/**
 * The swing model (P2b.2b.1 design §5.2; P2b.2b.2a design §3). From a ShotSetup and the world it derives the mallet
 * head, its wooden face, its state where the impact starts and the tracked drive:
 * 1. the contact pose (contactPose): the arc radius r = top, θ_c = −lean, the head pitched rigidly with the shaft, its
 *    face START_GAP short of the sunk striker at (up, side), the pivot r up the shaft;
 * 2. the downswing (downswing.ts) from the backswing's top: ω₀ and the hands' V_c at contact, and from them the
 *    planned contact speed;
 * 3. the arcs' changes, against the planned speed: α = drive·speedGain·(speed/ℓ)/window, ℓ the pivot's distance from
 *    the head's centre, and A = drive·handGain·speed·aim/handWindow; the dip, handDrop over dropTime; the mode, the
 *    ground depth and the reach (the shot's, else the preset's); the coupling HAND_COUPLING; the hands the stance's,
 *    with the profile's body;
 * 4. the lead L, the earliest action's: the impact starts L before contact, on the downswing, and the grips relax at
 *    contact;
 * 5. the approach: the downswing's lowest clearance over the turf, from one scan (planStroke, swingApproach).
 * The head starts on its own path (headOnPath at t = 0), so the hands start with no error to take up.
 */
import { contactReference, malletReference } from "../../reference/index";
import { headLowestPoint } from "../impact/contacts";
import { rotate, solidCylinderInertia, type Quaternion } from "../impact/rigidBody";
import {
    HAND_COUPLING,
    headOnPath,
    pendulumOf,
    pitchAxis,
    prepareTrack,
    swingOrientation,
    swungBody,
} from "../impact/track";
import type { ContactState, FaceMaterial, Hands, MalletHead, StrokeMode, SwingArc, TrackDrive } from "../impact/types";
import { sinCos } from "../math/elementary";
import { add, cross, length, scale, sub, vec3, type Vec3 } from "../math/vec3";
import type { BallState, World } from "../types";
import { planDownswing, scanDownswing, type DownswingInput, type PlannedDownswing } from "./downswing";
import type { ShotSetup, SwingDrive, SwingShape, SwingStance } from "./types";

/**
 * Gap (m) between the face and the striker's sunk surface at contact (design §5.2 step 4). Numerical, not physical:
 * it keeps rounding from starting the face inside the ball, and at 1 m/s the head closes it within a step.
 */
export const START_GAP = 1e-6;

/**
 * The longest lead-in (s): how early an action may be timed (design §5.2 step 8). A modelling bound, not physical: a
 * head so far from the ball when the impact starts is a gross mis-hit.
 */
export const MAX_LEAD = 0.06;

/** The engine's face: wood (reference/mallet.json), with the sourced face–ball contact time. */
const WOOD: FaceMaterial = {
    restitution: malletReference.faceRestitution.value,
    friction: malletReference.faceFriction.value,
    contactTime: contactReference.faceBallContactTime.value,
};

/** A stance's numbers, each checked finite by name (a missing one included). */
const STANCE_NUMBERS: readonly (keyof SwingStance)[] = ["lean", "top", "bottom", "gripTension", "bottomGrip"];

/** A drive entry's numbers (all but its mode), each checked finite by name. */
const DRIVE_NUMBERS: readonly Exclude<keyof SwingDrive, "mode">[] = [
    "speedGain",
    "window",
    "handGain",
    "handWindow",
    "handDrop",
    "dropTime",
    "handReach",
    "groundDepth",
    "guideEffort",
];

/** A shape's scalar numbers, each checked finite by name. */
const SHAPE_NUMBERS: readonly ("pendulumShare" | "handAngle" | "defaultIntensity")[] = [
    "pendulumShare",
    "handAngle",
    "defaultIntensity",
];

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

function nonNegative(value: number, name: string): void {
    if (!(value >= 0)) {
        fail(`${name} must be non-negative (got ${value})`);
    }
}

function grip(value: number, name: string): void {
    if (!(value > 0 && value <= 1)) {
        fail(`${name} must lie in (0, 1] (got ${value})`);
    }
}

function unit(value: number, name: string): void {
    if (!(value >= 0 && value <= 1)) {
        fail(`${name} must lie in [0, 1] (got ${value})`);
    }
}

/** A tempo pair: both positive, the fast no slower than the slow. */
function tempos(slow: number, fast: number, slowName: string, fastName: string): void {
    positive(slow, slowName);
    positive(fast, fastName);
    if (fast > slow) {
        fail(`${fastName} must not exceed ${slowName} (got ${fast} > ${slow})`);
    }
}

/** Checks `setup` (see buildContact). */
function validate(setup: ShotSetup): void {
    const { stroke, profile } = setup;
    if (!setup.balls[setup.striker]) {
        fail(`striker ${setup.striker} is not in the setup`);
    }
    const { type, timing } = stroke;
    const stance = profile.stance[type];
    const push = profile.drive[type];
    const shape = profile.shape[type];
    if (!stance) {
        fail(`profile.stance has no entry for ${type}`);
    }
    if (!push) {
        fail(`profile.drive has no entry for ${type}`);
    }
    if (!shape) {
        fail(`profile.shape has no entry for ${type}`);
    }
    if (push.mode !== "swing" && push.mode !== "carry") {
        fail(`profile.drive.${type}.mode must be "swing" or "carry" (got ${String(push.mode)})`);
    }
    finiteNumber(stroke.aim, "stroke.aim");
    finiteNumber(stroke.backswing, "stroke.backswing");
    finiteNumber(stroke.drive, "stroke.drive");
    finiteNumber(stroke.contact.up, "stroke.contact.up");
    finiteNumber(stroke.contact.side, "stroke.contact.side");
    finiteNumber(timing.arc, "stroke.timing.arc");
    finiteNumber(timing.hands, "stroke.timing.hands");
    finiteNumber(timing.dip, "stroke.timing.dip");
    for (const [name, value] of [
        ["stroke.intensity", stroke.intensity],
        ["stroke.handReach", stroke.handReach],
        ["stroke.guideEffort", stroke.guideEffort],
    ] as const) {
        if (value !== undefined) {
            finiteNumber(value, name);
        }
    }
    for (const key of STANCE_NUMBERS) {
        finiteNumber(stance[key], `profile.stance.${type}.${key}`);
    }
    for (const key of DRIVE_NUMBERS) {
        finiteNumber(push[key], `profile.drive.${type}.${key}`);
    }
    const where = `profile.shape.${type}`;
    for (const key of SHAPE_NUMBERS) {
        finiteNumber(shape[key], `${where}.${key}`);
    }
    finiteNumber(shape.effort.torqueMax, `${where}.effort.torqueMax`);
    finiteNumber(shape.effort.tempoSlow, `${where}.effort.tempoSlow`);
    finiteNumber(shape.effort.tempoFast, `${where}.effort.tempoFast`);
    finiteNumber(shape.handTempo.slow, `${where}.handTempo.slow`);
    finiteNumber(shape.handTempo.fast, `${where}.handTempo.fast`);
    const { mallet, body } = profile;
    for (const [key, value] of Object.entries(mallet)) {
        finiteNumber(value, `profile.mallet.${key}`);
        positive(value, `profile.mallet.${key}`);
    }
    finiteNumber(body.armMass, "profile.body.armMass");
    finiteNumber(body.reachSlack, "profile.body.reachSlack");

    const { lean, top, bottom, gripTension, bottomGrip } = stance;
    positive(top, `profile.stance.${type}.top`);
    if (top > mallet.shaftLength) {
        fail(
            `the top hand is off the shaft: profile.stance.${type}.top is ${top} m, beyond shaftLength ` +
                `${mallet.shaftLength} m`,
        );
    }
    if (!(bottom > 0 && bottom < top)) {
        fail(`profile.stance.${type}.bottom must lie in (0, top) = (0, ${top}) m (got ${bottom})`);
    }
    if (!(Math.abs(lean) < Math.PI / 2)) {
        fail(`profile.stance.${type}.lean must lie within ±90° (got ${lean} rad)`);
    }
    positive(stroke.backswing, "stroke.backswing");
    if (stroke.intensity !== undefined) {
        unit(stroke.intensity, "stroke.intensity");
    }
    if (!(Math.abs(stroke.drive) <= 1)) {
        fail(`stroke.drive must lie in [-1, 1] (got ${stroke.drive})`);
    }
    const rho = mallet.headDiameter / 2;
    const { up, side } = stroke.contact;
    if (!(Math.sqrt(up * up + side * side) < rho)) {
        fail(`the contact lies off the face: (${up}, ${side}) m from its centre, whose radius is ${rho} m`);
    }
    positive(push.window, `profile.drive.${type}.window`);
    positive(push.handWindow, `profile.drive.${type}.handWindow`);
    positive(push.dropTime, `profile.drive.${type}.dropTime`);
    nonNegative(push.speedGain, `profile.drive.${type}.speedGain`);
    grip(gripTension, `profile.stance.${type}.gripTension`);
    grip(bottomGrip, `profile.stance.${type}.bottomGrip`);
    nonNegative(push.handDrop, `profile.drive.${type}.handDrop`);
    nonNegative(push.handReach, `profile.drive.${type}.handReach`);
    if (stroke.handReach !== undefined) {
        nonNegative(stroke.handReach, "stroke.handReach");
    }
    nonNegative(push.groundDepth, `profile.drive.${type}.groundDepth`);
    unit(push.guideEffort, `profile.drive.${type}.guideEffort`);
    if (stroke.guideEffort !== undefined) {
        unit(stroke.guideEffort, "stroke.guideEffort");
    }
    nonNegative(body.armMass, "profile.body.armMass");
    nonNegative(body.reachSlack, "profile.body.reachSlack");
    unit(shape.pendulumShare, `${where}.pendulumShare`);
    unit(shape.defaultIntensity, `${where}.defaultIntensity`);
    if (shape.pendulumShare < 1 && !(shape.handAngle > 0 && shape.handAngle < Math.PI / 2)) {
        fail(`${where}.handAngle must lie in (0, 90°) when pendulumShare < 1 (got ${shape.handAngle} rad)`);
    }
    if (push.mode === "swing") {
        if (!(shape.pendulumShare > 0)) {
            fail(`${where}.pendulumShare must be positive in swing mode, where the pendulum leads (got 0)`);
        }
        const { torqueMax, tempoSlow, tempoFast } = shape.effort;
        tempos(tempoSlow, tempoFast, `${where}.effort.tempoSlow`, `${where}.effort.tempoFast`);
        nonNegative(torqueMax, `${where}.effort.torqueMax`);
    } else {
        tempos(shape.handTempo.slow, shape.handTempo.fast, `${where}.handTempo.slow`, `${where}.handTempo.fast`);
    }
}

/** The hands of `setup`'s stance with its profile's body, and the shot's guide effort, else the preset's. */
function handsOf(setup: ShotSetup): Hands {
    const { stroke, profile } = setup;
    const stance = profile.stance[stroke.type];
    return {
        bottom: stance.bottom,
        gripTension: stance.gripTension,
        bottomGrip: stance.bottomGrip,
        armMass: profile.body.armMass,
        reachSlack: profile.body.reachSlack,
        guideEffort: stroke.guideEffort ?? profile.drive[stroke.type].guideEffort,
    };
}

/** The downswing of a checked `setup` posed at `pose`, at the shot's intensity, else its preset's default. */
function downswingOf(setup: ShotSetup, pose: ContactPose, hands: Hands, gravity: number): PlannedDownswing {
    const { stroke, profile } = setup;
    const shape = profile.shape[stroke.type];
    const choice: StrokeChoice = {
        mode: profile.drive[stroke.type].mode,
        shape,
        backswing: stroke.backswing,
        intensity: stroke.intensity ?? shape.defaultIntensity,
    };
    return planDownswing(downswingInput(pose, hands, choice, gravity));
}

// ── contactPose, ContactPose, StrokeChoice, downswingInput and poseSpeed from Task 4, unchanged ──

/** The downswing's closest approach to the turf before contact (P2b.2b.2a design §3.5). */
export interface SwingApproach {
    /** The head's lowest clearance above the turf (m); negative where it is in it. */
    readonly clearance: number;
    /** When, in s before the planned contact. */
    readonly before: number;
}

/** A stroke planned (design §3, §5.2): its contact state, its approach and its planned contact speed (m/s). */
export interface StrokePlan {
    readonly contact: ContactState;
    readonly approach: SwingApproach;
    readonly contactSpeed: number;
}

/**
 * Plans `setup` on `world` (P2b.2b.1 design §5.2; P2b.2b.2a design §3): the contact state, from one scan of the
 * downswing the approach, and the planned contact speed. Throws a RangeError naming the check for:
 * - a striker absent from the setup, or a stroke type missing from the profile's stance, drive or shape;
 * - a mode other than "swing" or "carry";
 * - a non-finite number, or a non-positive mallet dimension or mass;
 * - top ≤ 0, or top > shaftLength; bottom outside (0, top); |lean| ≥ 90°;
 * - backswing ≤ 0; an intensity outside [0, 1]; |drive| > 1; the contact off the face;
 * - window, handWindow or dropTime ≤ 0; speedGain < 0; gripTension or bottomGrip outside (0, 1]; handDrop < 0; the
 *   preset's or the shot's handReach < 0; groundDepth < 0; the preset's or the shot's guideEffort outside [0, 1];
 *   armMass < 0; reachSlack < 0;
 * - pendulumShare or defaultIntensity outside [0, 1]; handAngle outside (0, 90°) when pendulumShare < 1; in swing
 *   mode a pendulumShare of 0, an effort tempo ≤ 0 or tempoFast > tempoSlow, or torqueMax < 0; in carry mode a hands'
 *   tempo ≤ 0 or fast > slow;
 * - the downswing's (downswing.ts): a backswing beyond MAX_BACK_ANGLE, a non-positive effective inertia, a stall or a
 *   fall beyond MAX_FALL;
 * - an action timed more than MAX_LEAD early;
 * - the head's lowest point below the turf at contact, or where the impact starts.
 * A swing that meets the turf between the impact's start and the ball is not rejected: the impact simulates it.
 */
export function planStroke(setup: ShotSetup, world: World): StrokePlan {
    validate(setup);
    const { stroke, profile } = setup;
    const { type, timing } = stroke;
    const push = profile.drive[type];
    // Step 4's lead: the earliest action's, none on time.
    const lead = Math.max(0, 0 - timing.arc, 0 - timing.hands, 0 - timing.dip);
    if (lead > MAX_LEAD) {
        fail(`an action is timed more than ${MAX_LEAD} s early (${lead} s before contact)`);
    }
    const pose = contactPose(setup, world);
    const { head, aim, radius, pivot, orientation, headCentre } = pose;
    const still = vec3(0, 0, 0);
    const atContact = headLowestPoint(
        { position: headCentre, orientation, velocity: still, angularVelocity: still },
        head,
    );
    if (atContact < 0) {
        fail(`the head is in the turf at contact: its lowest point is ${0 - atContact} m below it`);
    }
    const hands = handsOf(setup);
    const planned = downswingOf(setup, pose, hands, world.gravity);
    const contactSpeed = poseSpeed(pose, planned);
    const scan = scanDownswing(planned.downswing, head, aim, radius);
    const { omega: omega0, handsVelocity } = planned;
    const lever = length(cross(pitchAxis(aim), sub(headCentre, pivot)));
    // Steps 3 and 4, the arc expressed from the start, L before contact.
    const arc: SwingArc = {
        pivot: sub(pivot, scale(handsVelocity, lead)),
        pivotVelocity: handsVelocity,
        pivotAcceleration: scale(aim, (stroke.drive * push.handGain * contactSpeed) / push.handWindow),
        handStart: lead + timing.hands,
        handWindow: push.handWindow,
        aim,
        radius,
        theta0: pose.thetaContact - omega0 * lead,
        omega0,
        alpha: (stroke.drive * push.speedGain * contactSpeed) / (lever * push.window),
        arcStart: lead + timing.arc,
        window: push.window,
        dip: { start: lead + timing.dip, duration: push.dropTime, depth: push.handDrop },
        contactAt: lead,
        mode: push.mode,
        handReach: stroke.handReach ?? push.handReach,
        groundDepth: push.groundDepth,
        downswing: planned.downswing,
    };
    const drive: TrackDrive = {
        kind: "track",
        arc,
        coupling: { period: HAND_COUPLING.period, dampingRatio: HAND_COUPLING.dampingRatio, relaxAt: lead },
        hands,
    };
    const start = headOnPath(prepareTrack(drive, head, world.gravity), head, 0);
    const clearance = headLowestPoint(start, head);
    if (clearance < 0) {
        fail(
            `the head is in the turf ${lead} s before contact, where the earliest action begins: its lowest point is ` +
                `${0 - clearance} m below it (the stance is too low for that timing)`,
        );
    }
    return {
        contact: { head, face: WOOD, ...start, drive },
        approach: { clearance: scan.clearance, before: scan.before },
        contactSpeed,
    };
}

/** The contact state of `setup` on `world` (planStroke, whose checks it throws). */
export function buildContact(setup: ShotSetup, world: World): ContactState {
    return planStroke(setup, world).contact;
}

/**
 * The planned contact speed (m/s) of `setup` on `world` (design §3.4): the pose and the downswing only, no contact
 * state built. Throws planStroke's checks of the setup and the downswing's.
 */
export function plannedSpeed(setup: ShotSetup, world: World): number {
    validate(setup);
    const pose = contactPose(setup, world);
    return poseSpeed(pose, downswingOf(setup, pose, handsOf(setup), world.gravity));
}

/**
 * How close a tracked contact state's downswing comes to the turf before the planned contact (design §3.5): the
 * scan planStroke makes. Throws for a contact state with no downswing.
 */
export function swingApproach(contact: ContactState): SwingApproach {
    if (contact.drive.kind !== "track" || contact.drive.arc.downswing === undefined) {
        fail("swingApproach needs a tracked contact state with a downswing");
    }
    const { arc } = contact.drive;
    const { clearance, before } = scanDownswing(arc.downswing, contact.head, arc.aim, arc.radius);
    return { clearance, before };
}
```

The guard `!setup.balls[setup.striker]` keeps the striker check first, as before. `contactPose` reads the striker,
so it must come after `validate`, which it does.

In `src/engine/shot.ts`, change `approach`'s comment to "The downswing's lowest clearance over the turf before
contact, and when (P2b.2b.2a design §3.5)."

- [ ] **Step 6: Migrate the swing probe**

In `scripts/swingProbe.ts`:

- import `backswingFor` beside `canonicalSetup`;
- replace `canonical` with the version below. Every call site keeps passing `speed`.

```ts
/** `type`'s canonical setup with `stroke` fields replaced; a `speed` (m/s) sets the backswing that plans it. */
function canonical(
    type: StrokeType,
    stroke: Partial<ShotSetup["stroke"]> & { readonly speed?: number } = {},
): ShotSetup {
    const { speed, ...rest } = stroke;
    const base = canonicalSetup(type);
    const setup = { ...base, stroke: { ...base.stroke, ...rest } };
    if (speed === undefined) {
        return setup;
    }
    return { ...setup, stroke: { ...setup.stroke, backswing: backswingFor(setup, speed, WORLD) } };
}
```

Run: `npx --yes tsx scripts/swingProbe.ts` with `SECTION=mass`: `env SECTION=mass npx --yes tsx scripts/swingProbe.ts`
Expected: it runs; the figures are for Task 10, not this task.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/swing tests/engine/shot.test.ts tests/engine/index.test.ts`
Expected: PASS.

The canonical-approach expectations and the `shot.test.ts` mechanisms rest on model behaviour. The swing presets'
paths after contact are those of P2b.2b.1, give or take the default speed's last digits. The rolls' hands now carry
the head from the downswing's tempo, so their figures move. Where one fails, follow the rule in "Global
Constraints": trace it with `scripts/swingProbe.ts`'s sections before touching an expectation, and bring a changed
mechanism to the user.

- [ ] **Step 8: Run every check**

Run, one per call: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`.
Expected: all pass.

- [ ] **Step 9: Commit**

Message: `Swing the mallet from a backswing, not a speed`. Stage the files above by path.

---
### Task 6: A downswing that meets the turf starts the impact early

Spec §3.5, last three bullets. The lead L becomes the larger of the earliest action's lead and `TURF_MARGIN` before
the downswing first meets the turf. `MAX_LEAD` rises to 150 ms. A fat stroke is simulated, not rejected: the
head–turf pair slows the head before the ball. The start-in-the-turf rejection goes, since the start now always
precedes the first ground contact.

**Files:**
- Modify: `src/engine/swing/buildContact.ts`
- Test: `tests/engine/swing/buildContact.test.ts`

**Interfaces:**
- Consumes: `scanDownswing(...).grounded` (Task 3); `planStroke` (Task 5).
- Produces: `MAX_LEAD` = 0.15; `TURF_MARGIN` = 0.005 (exported).

- [ ] **Step 1: Write the failing tests**

In `tests/engine/swing/buildContact.test.ts`:

- add `TURF_MARGIN` to the `buildContact` import;
- add `import { scanDownswing } from "../../../src/engine/swing/downswing";`;
- add `recorder` to the `../support/impact` import.

In the swingApproach test "finds a low swing's downswing in the turf before contact, at its least clearance", the
impact now starts before contact. Measure the contact clearance on the pose: add `contactPose` to the
`buildContact` import, and replace `expect(headLowestPoint(c, c.head)).toBeCloseTo(SUNK_Z - 0.01 - RHO, 12);` with:

```ts
        const pose = contactPose(shot({ contact: { up: 0.01, side: 0 } }), WORLD);
        const still = vec3(0, 0, 0);
        const atContact = { position: pose.headCentre, orientation: pose.orientation };
        const lowest = headLowestPoint({ ...atContact, velocity: still, angularVelocity: still }, pose.head);
        expect(lowest).toBeCloseTo(SUNK_Z - 0.01 - RHO, 12);
```

In `describe("buildContact rejections")`:

- delete `low`, `deepest` and their comment;
- delete the case "a head in the turf where an early action begins";
- replace the case "an action over 60 ms early" with:

```ts
        ["an action over 150 ms early", shot({ timing: { arc: -0.16, hands: 0, dip: 0 } }), /more than 0\.15 s early/],
```

Then append:

```ts
describe("the lead (design §3.5)", () => {
    /** The low swing of the swingApproach test: its downswing dips 3.6 mm into the turf. */
    const low = (stroke: Partial<Stroke> = {}) => shot({ contact: { up: 0.01, side: 0 }, ...stroke });
    const grounded = (c: ContactState): number => {
        const arc = arcOf(c);
        return scanDownswing(arc.downswing as Downswing, c.head, arc.aim, arc.radius).grounded as number;
    };

    it("starts a fat stroke TURF_MARGIN before its downswing first meets the turf", () => {
        const c = buildContact(low(), WORLD);
        const g = grounded(c);
        expect(g).toBeLessThan(0);
        expect(arcOf(c).contactAt).toBeCloseTo(TURF_MARGIN - g, 15);
        expect(headLowestPoint(c, c.head)).toBeGreaterThan(0);
        // A clean swing's lead stays the actions'.
        expect(arcOf(buildContact(shot(), WORLD)).contactAt).toBe(0);
    });

    it("takes the larger of the action's lead and the turf's", () => {
        // Review focus 4.
        const turf = TURF_MARGIN - grounded(buildContact(low(), WORLD));
        const earlier = buildContact(low({ timing: { arc: 0, hands: 0, dip: -(turf + 0.01) } }), WORLD);
        expect(arcOf(earlier).contactAt).toBeCloseTo(turf + 0.01, 15);
        const later = buildContact(low({ timing: { arc: -(turf - 0.002), hands: 0, dip: 0 } }), WORLD);
        expect(arcOf(later).contactAt).toBeCloseTo(turf, 15);
        expect(arcOf(later).arcStart).toBeCloseTo(0.002, 12);
    });

    it("rejects a downswing that meets the turf more than MAX_LEAD early, naming the turf", () => {
        // Review focus 4. A slow low swing: 5 cm back, the ball met 12 mm above the face centre. Its head enters the
        // turf about 0.245 rad back, where the gravity swing from 0.35 rad has barely begun: about 0.2 s before
        // contact.
        const slow = shot({ backswing: 0.05, contact: { up: 0.012, side: 0 } });
        expect(() => buildContact(slow, WORLD)).toThrow(/meets the turf .* before contact/);
    });

    it("simulates a fat stroke: the turf slows the head before the ball, against the same swing raised clear", () => {
        // Spec §7.1. Raised clear: the ball met at the face centre, the head 10 mm higher on the same pendulum, so both
        // plan the same speed.
        const fatPlan = planStroke(low(), WORLD);
        const cleanPlan = planStroke(shot(), WORLD);
        expect(fatPlan.contactSpeed).toBeCloseTo(cleanPlan.contactSpeed, 12);
        const firstStrike = (plan: typeof fatPlan) => {
            const probe = recorder();
            const impact = simulateImpact(plan.contact, { blue: BLUE }, WORLD, { probe });
            const strike = (impact.timeline["face/blue"] ?? [])[0];
            expect(strike).toBeDefined();
            const start = (strike as { start: number }).start;
            const at = probe.snapshots.find((s) => s.t >= start - 1e-12);
            return { impact, start, speed: length((at as { head: { velocity: Vec3 } }).head.velocity) };
        };
        const fat = firstStrike(fatPlan);
        const clean = firstStrike(cleanPlan);
        const dug = fat.impact.timeline["head/turf"]?.[0];
        expect(dug).toBeDefined();
        expect((dug as { start: number }).start).toBeLessThan(fat.start);
        expect(fat.speed).toBeLessThan(clean.speed);
    });

    it("plays a 2 mm backswing as a gentle tap", () => {
        // Review focus 1: about 0.19 m/s by gravity alone on the test pendulum.
        const setup = shot({ backswing: 0.002 });
        const { contact, contactSpeed } = planStroke(setup, WORLD);
        expect(contactSpeed).toBeGreaterThan(0.1);
        expect(contactSpeed).toBeLessThan(0.3);
        const kinds = simulateImpact(contact, setup.balls, WORLD).events.map((e) => e.kind);
        expect(kinds).not.toContain("impact-cap");
    });

    it("starts the downswing behind the ball along any aim", () => {
        // Review focus 3.
        for (const aim of [Math.PI, -Math.PI / 2, 7]) {
            const c = buildContact(shot({ aim }), WORLD);
            const arc = arcOf(c);
            const track = prepareTrack(c.drive as TrackDrive, c.head, WORLD.gravity);
            const top = headOnPath(track, c.head, arc.contactAt + (arc.downswing as Downswing).release);
            const back = horizontal(sub(top.position, c.position));
            const along = vec3(Math.cos(aim), Math.sin(aim), 0);
            expect(dot(back, along), `aim ${aim}`).toBeLessThan(-0.1);
            expect(length(cross(back, along)), `aim ${aim}`).toBeLessThan(1e-9);
        }
    });
});
```

Run: `npx vitest run tests/engine/swing/buildContact.test.ts`
Expected: FAIL. `TURF_MARGIN` is undefined. The fat stroke is rejected "in the turf … where the earliest action
begins" or starts at 0. The slow low swing throws the start-in-the-turf message rather than naming the turf. The
150 ms case is accepted no more.

- [ ] **Step 2: Implement**

In `src/engine/swing/buildContact.ts`:

1. Replace `MAX_LEAD` and its comment with:

```ts
/**
 * The longest lead-in (s): how early the impact may start, for an early action or a downswing meeting the turf
 * (P2b.2b.2a design §3.5). A modelling bound, not physical: a head on the lawn that long before the ball is a gross
 * mis-hit the impact cannot afford. Provisional, to be confirmed against the sourced downswing times.
 */
export const MAX_LEAD = 0.15;

/**
 * How long (s) before the downswing first meets the turf the impact starts (P2b.2b.2a design §3.5). Numerical, not
 * physical: 5 ms of open steps before the head–turf pair closes.
 */
export const TURF_MARGIN = 0.005;
```

2. In `planStroke`, rename the early `lead` to `actions` (its check keeps its message, now with `actions`). After
   `const scan = …`, add:

```ts
    // Step 4's lead: the earliest action's, or TURF_MARGIN before the downswing first meets the turf if earlier.
    const turf = scan.grounded === null ? 0 : TURF_MARGIN - scan.grounded;
    if (turf > MAX_LEAD) {
        fail(
            `the downswing meets the turf ${0 - (scan.grounded as number)} s before contact, so the impact would ` +
                `start more than ${MAX_LEAD} s early: a gross mis-hit`,
        );
    }
    const lead = Math.max(actions, turf);
```

3. Delete the start-in-the-turf check after `const start = …`, and the `clearance` constant. The start lies at
   least TURF_MARGIN before the first ground contact, or before an action earlier still, so it is clear.
4. In the header, make step 4 "the lead L, the earliest action's, or TURF_MARGIN before the downswing first meets
   the turf if that is earlier (P2b.2b.2a design §3.5): the impact starts L before contact, on the downswing, so a fat
   stroke's turf strike is integrated; the grips relax at contact".
5. In `planStroke`'s rejection list, replace the last two bullets with "an action timed more than MAX_LEAD early, or
   a downswing meeting the turf more than MAX_LEAD − TURF_MARGIN before contact;" and "the head's lowest point below
   the turf at contact". Replace the closing sentence with "A downswing that meets the turf before the ball is not
   rejected: the impact starts before it and simulates it (design §3.5)."

- [ ] **Step 3: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/swing/buildContact.test.ts tests/engine/shot.test.ts`
Expected: PASS.

The fat stroke and the slow low swing rest on model behaviour (planning estimates in their comments). If the slow
swing's turf lead falls short of `MAX_LEAD`, lower its backswing until it passes: print `grounded` first. If the
fat stroke's head is not slower at the strike, look at the snapshots' head–turf force before changing anything.

- [ ] **Step 4: Run every check**

Run, one per call: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`.
Expected: all pass.

- [ ] **Step 5: Commit**

Message: `Start the impact before a downswing meets the turf`. Stage the two files.

---
### Task 7: The follow-through

Spec §4.1, §4.2 and §7.1's follow-through cases. `integrateStroke` runs the impact exactly as `integrate` does and
records the head every `FOLLOW_SAMPLE`. When the end rule fires it fixes the `ImpactRun`, then continues with the
balls removed until the stroke type's finish or `FOLLOW_CAP`. The hands keep their grip state, and the head–turf
pair keeps its spring on a fresh timeline. `simulateStroke` is `simulateImpact` with the follow-through.

**Files:**
- Modify: `src/engine/impact/integrate.ts`, `src/engine/impact/simulateImpact.ts`
- Test: `tests/engine/impact/followThrough.test.ts` (new)

**Interfaces:**
- Consumes: `handsAt` (Task 2); `buildContact` and the test support (Task 5).
- Produces, in `impact/integrate.ts`:
  - `FOLLOW_CAP` = 1, `FOLLOW_SAMPLE` = 1e-3, `FINISH_SPEED` = 1e-3;
  - `type FollowFlag = "follow-cap" | "follow-head-deep"`;
  - `interface StrokeState { t: number; head: HeadState }`;
  - `interface FollowThrough { samples: readonly StrokeState[]; impactEnd: number; finish: number; flags: readonly
    FollowFlag[] }`, with times in s from t = 0;
  - `interface StrokeRun { run: ImpactRun; follow: FollowThrough | null }`;
  - `integrateStroke(setup, options?, follow?): StrokeRun`;
  - `integrate(setup, options?)`, unchanged in behaviour.
- Produces, in `impact/simulateImpact.ts`: `simulateStroke(contact, balls, world, options?): { result: ImpactResult;
  follow: FollowThrough }`, which throws a RangeError for a force table.

- [ ] **Step 1: Write the failing tests**

Create `tests/engine/impact/followThrough.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
    FINISH_SPEED,
    FOLLOW_CAP,
    FOLLOW_SAMPLE,
    type FollowThrough,
    type StrokeState,
} from "../../../src/engine/impact/integrate";
import { simulateImpact, simulateStroke } from "../../../src/engine/impact/simulateImpact";
import { handsAt, pitchAxis, prepareTrack, type Reach } from "../../../src/engine/impact/track";
import type { ContactState, TrackDrive } from "../../../src/engine/impact/types";
import { dot, length, sub } from "../../../src/engine/math/vec3";
import { buildContact } from "../../../src/engine/swing/buildContact";
import { ON_TIME } from "../../../src/engine/swing/profile";
import type { ShotSetup, SwingProfile } from "../../../src/engine/swing/types";
import type { World } from "../../../src/engine/types";
import { defaultWorld } from "../../../src/engine/world";
import { ballAt, testWorld } from "../support/fixtures";
import { canonicalSetup, testProfile } from "../support/shot";

const WORLD = testWorld();

/** A test-profile stroke at blue (5, 3), aim 0.4, 0.5 m back (about 3.1 m/s), on time. */
function shot(stroke: Partial<ShotSetup["stroke"]> = {}, profile: SwingProfile = testProfile()): ShotSetup {
    return {
        balls: { blue: ballAt(5, 3) },
        striker: "blue",
        stroke: {
            type: "single-ball",
            aim: 0.4,
            backswing: 0.5,
            drive: 0,
            contact: { up: 0, side: 0 },
            timing: ON_TIME,
            ...stroke,
        },
        live: [],
        continuation: false,
        hampered: false,
        jumpAttempt: false,
        lawnSpeed: 10,
        profile,
    };
}

/** A carry with moving hands: half the backswing from the hands, a 0.15 m reach; 0.25 m back, about 2.8 m/s. */
const CARRY = testProfile({ drive: { mode: "carry", handReach: 0.15 }, shape: { pendulumShare: 0.5 } });

function stroke(setup: ShotSetup, world: World = WORLD, dt?: number) {
    const contact = buildContact(setup, world);
    return { contact, ...simulateStroke(contact, setup.balls, world, dt === undefined ? {} : { dt }) };
}

const rateOf = (contact: ContactState, s: StrokeState): number =>
    dot(s.head.angularVelocity, pitchAxis((contact.drive as TrackDrive).arc.aim));

const last = (follow: FollowThrough): StrokeState => follow.samples[follow.samples.length - 1] as StrokeState;

describe("the follow-through (design §4)", () => {
    it("leaves the impact exactly as simulateImpact returns it", () => {
        for (const setup of [shot(), shot({ drive: -1 }), shot({ backswing: 0.25 }, CARRY)]) {
            const { contact, result } = stroke(setup);
            expect(result).toEqual(simulateImpact(contact, setup.balls, WORLD));
        }
    });

    it("samples the head every FOLLOW_SAMPLE from the impact's start, at the impact's end and at the finish", () => {
        const { contact, result, follow } = stroke(shot());
        expect(follow.impactEnd).toBe(result.duration);
        const first = follow.samples[0] as StrokeState;
        expect(first.t).toBe(0);
        expect(first.head.position).toEqual(contact.position);
        expect(follow.samples.some((s) => s.t === follow.impactEnd)).toBe(true);
        expect(last(follow).t).toBe(follow.finish);
        for (let i = 1; i < follow.samples.length; i++) {
            const gap = (follow.samples[i] as StrokeState).t - (follow.samples[i - 1] as StrokeState).t;
            expect(gap).toBeGreaterThan(0);
            expect(gap).toBeLessThanOrEqual(FOLLOW_SAMPLE + 1e-12);
        }
    });

    it("finishes a swing at the pendulum's apex: the first pitch rate at or below zero after the impact", () => {
        const { contact, follow } = stroke(shot());
        expect(follow.flags).toEqual([]);
        expect(follow.finish).toBeGreaterThan(follow.impactEnd);
        expect(rateOf(contact, last(follow))).toBeLessThanOrEqual(0);
        for (const s of follow.samples.filter((x) => x.t >= follow.impactEnd && x.t < follow.finish)) {
            expect(rateOf(contact, s), `t ${s.t}`).toBeGreaterThan(0);
        }
    });

    it("finishes at the impact's end when the head is already at rest", () => {
        // Review focus 5. The canonical GC stop's check brings its head to rest by the impact's end (P2b.2b.1: −3.2e-4
        // m/s along aim), the hands still: the finish is the impact's end, one sample there and no step after.
        const world = defaultWorld();
        const { contact, follow } = stroke(canonicalSetup("stop-gc", { world }), world);
        expect(follow.flags).toEqual([]);
        expect(follow.finish).toBe(follow.impactEnd);
        expect(follow.samples.filter((s) => s.t === follow.impactEnd)).toHaveLength(1);
        const plan = prepareTrack(contact.drive as TrackDrive, contact.head, world.gravity);
        const end = last(follow);
        expect(length(sub(end.head.velocity, handsAt(plan, end.t).velocity))).toBeLessThan(FINISH_SPEED);
    });

    it("finishes a carry once the hands' reach has ended and the head is at rest", () => {
        const { contact, follow } = stroke(shot({ backswing: 0.25 }, CARRY));
        expect(follow.flags).toEqual([]);
        const reach = prepareTrack(contact.drive as TrackDrive, contact.head, WORLD.gravity).reach as Reach;
        expect(reach).not.toBeNull();
        expect(follow.finish).toBeGreaterThanOrEqual(reach.tStop);
        expect(length(last(follow).head.velocity)).toBeLessThan(FINISH_SPEED);
    });

    it("caps a carry whose hands never stop", () => {
        // Review focus 5: a 10 m reach never binds, so the carry never finishes.
        const endless = testProfile({ drive: { mode: "carry", handReach: 10 }, shape: { pendulumShare: 0.5 } });
        const { contact, follow } = stroke(shot({ backswing: 0.25 }, endless));
        expect(follow.flags).toEqual(["follow-cap"]);
        const contactAt = (contact.drive as TrackDrive).arc.contactAt;
        expect(follow.finish).toBeGreaterThanOrEqual(contactAt + FOLLOW_CAP);
        expect(follow.finish).toBeLessThan(contactAt + FOLLOW_CAP + 1e-5);
    });

    it("flags a follow-through that drives the head deep, not the impact", () => {
        // The carry's descent at the reach's end puts the head's lowest point groundDepth below the turf: 10 mm,
        // past HEAD_DEEP_LIMIT, after the ball has gone.
        const deep = testProfile({
            drive: { mode: "carry", handReach: 0.15, groundDepth: 0.01 },
            shape: { pendulumShare: 0.5 },
        });
        const { result, follow } = stroke(shot({ backswing: 0.25 }, deep));
        expect(follow.flags).toContain("follow-head-deep");
        expect(result.events.map((e) => e.kind)).not.toContain("impact-head-deep");
    });

    it("converges in dt: the swing's finish time and pose", () => {
        const at = (dt: number) => {
            const { follow } = stroke(shot(), WORLD, dt);
            return { finish: follow.finish, position: last(follow).head.position };
        };
        const [a, b, c] = [at(1e-5), at(5e-6), at(2.5e-6)];
        const coarse = Math.abs(a.finish - b.finish);
        const fine = Math.abs(b.finish - c.finish);
        // First order: halving dt about halves the change; the finish is also quantised to a step.
        expect(fine).toBeLessThanOrEqual(Math.max(0.75 * coarse, 2e-5));
        expect(length(sub(b.position, c.position))).toBeLessThan(1e-3);
    });

    it("refuses a force table", () => {
        const { contact } = stroke(shot());
        const samples = [{ t: 0, force: contact.velocity }];
        const forced: ContactState = { ...contact, drive: { kind: "force", samples } };
        expect(() => simulateStroke(forced, { blue: ballAt(5, 3) }, WORLD)).toThrow(/tracked drive/);
    });
});
```

Run: `npx vitest run tests/engine/impact/followThrough.test.ts`
Expected: FAIL: `simulateStroke is not a function`.

- [ ] **Step 2: Implement the continuation**

In `src/engine/impact/integrate.ts`:

1. Add `handsAt` and `type GripState` to the import from `./track`, and `emptyTimeline` is already imported.
2. After `LOOK_AHEAD`, add:

```ts
/**
 * How long after the planned contact (s) the follow-through may run before it ends with `follow-cap` (P2b.2b.2a
 * design §4.2). A modelling bound, not physical: a stroke's finish comes well within a second.
 */
export const FOLLOW_CAP = 1;

/** Spacing (s) of the stroke's samples (P2b.2b.2a design §4.3). Numerical: 1 ms moves a 3 m/s head 3 mm. */
export const FOLLOW_SAMPLE = 1e-3;

/** Speed (m/s) below which a check's or a carry's head is at rest (P2b.2b.2a design §4.2). Numerical, not physical. */
export const FINISH_SPEED = 1e-3;
```

3. After `ImpactOptions`, add:

```ts
/** A follow-through's flags (P2b.2b.2a design §4.1): the cap reached, or the head driven past HEAD_DEEP_LIMIT. */
export type FollowFlag = "follow-cap" | "follow-head-deep";

/** The head at time t (s from t = 0). */
export interface StrokeState {
    readonly t: number;
    readonly head: HeadState;
}

/** A tracked stroke's impact and follow-through (P2b.2b.2a design §4.1); times in s from t = 0. */
export interface FollowThrough {
    /** The head every FOLLOW_SAMPLE from t = 0, and at the impact's end and at the finish. */
    readonly samples: readonly StrokeState[];
    readonly impactEnd: number;
    readonly finish: number;
    readonly flags: readonly FollowFlag[];
}

/** integrateStroke's result: the impact as integrate returns it, and its follow-through if asked for. */
export interface StrokeRun {
    readonly run: ImpactRun;
    readonly follow: FollowThrough | null;
}

/** A stroke type's finish (P2b.2b.2a design §4.2). */
type FinishKind = "swing" | "check" | "carry";

/** The finish of `plan`: carry mode's, a check's (α < 0 in swing mode), else a swing's. */
function finishKind(plan: PreparedTrack): FinishKind {
    if (plan.arc.mode === "carry") {
        return "carry";
    }
    return plan.arc.alpha < 0 ? "check" : "swing";
}

/**
 * True once the head in `state` at time t has reached its finish (P2b.2b.2a design §4.2): a swing at the pendulum's
 * apex, its pitch rate about n at or below zero; a check at rest relative to the hands; a carry at rest once the
 * hands' reach has ended (never, where the reach does not bind).
 */
function finished(kind: FinishKind, plan: PreparedTrack, state: HeadState, t: number): boolean {
    switch (kind) {
        case "swing":
            return dot(state.angularVelocity, plan.axis) <= 0;
        case "check":
            return length(sub(state.velocity, handsAt(plan, t).velocity)) < FINISH_SPEED;
        case "carry":
            return plan.reach !== null && t >= plan.reach.tStop && length(state.velocity) < FINISH_SPEED;
    }
}
```

4. Rename `integrate` to `integrateStroke`, with the signature and header below:

```ts
/**
 * Integrates the impact from `setup` until it ends (see the file header) and, with `follow` and a tracked drive, the
 * follow-through (P2b.2b.2a design §4.1). The impact is the same either way: recording the samples only reads the
 * state, and the run is fixed before the follow-through starts.
 */
export function integrateStroke(setup: ImpactSetup, options: ImpactOptions = {}, follow = false): StrokeRun {
```

   In its body:

   - after `let steps = 0;`, add:

```ts
    const samples: StrokeState[] | null = follow && tracked ? [{ t: 0, head: setup.start }] : null;
    const every = Math.max(1, Math.round(FOLLOW_SAMPLE / dt));
```

   - after `const now = steps * dt;` (the line after `steps++;`), add:

```ts
        if (samples !== null && steps % every === 0) {
            samples.push({ t: now, head: state });
        }
```

   - replace the function's tail (from `const run = finish(…)` to the end) with:

```ts
    const run = finish(setup, state, balls, pairs, turf, jumps, events, steps, steps * dt, touchingAtStart);
    const done =
        grip.releasedAt === null ? run : { ...run, release: { t: grip.releasedAt, deltaTheta: grip.releaseDelta } };
    if (samples === null || plan.kind !== "track") {
        return { run: done, follow: null };
    }
    return { run: done, follow: continueStroke(setup, plan, state, grip, turf, steps, dt, samples) };
}

/** Integrates the impact from `setup` until it ends (see the file header). */
export function integrate(setup: ImpactSetup, options: ImpactOptions = {}): ImpactRun {
    return integrateStroke(setup, options).run;
}
```

5. Add, after `integrate`:

```ts
/**
 * The follow-through (P2b.2b.2a design §4.1): the impact's loop continued from `start` at step `first`, with the balls
 * removed. The hands keep `grip`; the head–turf pair keeps its spring on a fresh timeline, so the run's timeline is
 * never touched. Appends to `samples` the head at the impact's end, every FOLLOW_SAMPLE, and at the finish: the
 * stroke type's, or FOLLOW_CAP after contact with `follow-cap`. Flags `follow-head-deep` once, as the impact flags
 * `impact-head-deep`.
 */
function continueStroke(
    setup: ImpactSetup,
    plan: PreparedTrack,
    start: HeadState,
    grip: GripState,
    turf: HeadTurfState | null,
    first: number,
    dt: number,
    samples: StrokeState[],
): FollowThrough {
    const { head } = setup;
    const every = Math.max(1, Math.round(FOLLOW_SAMPLE / dt));
    const kind = finishKind(plan);
    const cap = plan.arc.contactAt + FOLLOW_CAP;
    const headWeight = vec3(0, 0, 0 - head.mass * setup.gravity);
    const ground: HeadTurfState | null =
        turf === null ? null : { law: turf.law, spring: turf.spring, peak: 0, line: emptyTimeline(), slide: 0 };
    const flags: FollowFlag[] = [];
    const none: BallState[] = [];
    if ((samples[samples.length - 1] as StrokeState).t !== first * dt) {
        samples.push({ t: first * dt, head: start });
    }
    let state = start;
    let steps = first;
    let deep = false;
    for (;;) {
        const t = steps * dt;
        if (finished(kind, plan, state, t)) {
            break;
        }
        if (t >= cap) {
            flags.push("follow-cap");
            break;
        }
        const hand = handLoad(plan, state, head, t, grip);
        const loads: StepLoads = {
            headForce: add(hand.force, headWeight),
            headTorque: hand.torque,
            forces: [],
            torques: [],
        };
        if (ground !== null) {
            applyHeadTurf(ground, state, head, dt, loads, t, null);
        }
        state = advance(state, none, [], loads, setup, 0, dt);
        steps++;
        if (ground !== null && !deep && headLowestPoint(state, head) < 0 - HEAD_DEEP_LIMIT) {
            deep = true;
            flags.push("follow-head-deep");
        }
        if (steps % every === 0) {
            samples.push({ t: steps * dt, head: state });
        }
    }
    const end = steps * dt;
    if ((samples[samples.length - 1] as StrokeState).t !== end) {
        samples.push({ t: end, head: state });
    }
    return { samples, impactEnd: first * dt, finish: end, flags };
}
```

6. In the file header, append a paragraph:

```ts
 *
 * With a follow-through (integrateStroke, P2b.2b.2a design §4.1) a tracked drive's loop continues once the impact has
 * ended, the balls removed: the hands and the head–turf pair act on the head until the stroke type's finish, or
 * FOLLOW_CAP after contact. The impact's result is fixed before it starts.
```

`ImpactSetup.balls` is unused once `advance` gets an empty ball list: `advance` iterates `balls`, so passing `[]`
skips every ball.

- [ ] **Step 3: Add `simulateStroke`**

In `src/engine/impact/simulateImpact.ts`:

- import `integrateStroke` and `type FollowThrough` beside `integrate` (keep `integrate` if anything else uses it;
  otherwise drop it);
- import `ImpactRun` as a type;
- replace `simulateImpact`'s body tail with a shared helper:

```ts
/** The impact's result: `run` with its balls handed over to phase 2 (design §6). */
function handedOver(run: ImpactRun, world: World): ImpactResult {
    const handed = handover(run.balls, world.ball.radius, obstaclesOf(world));
    return { ...run, handover: handed.balls, overlapCorrection: handed.overlapCorrection };
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
    return handedOver(integrate(prepareImpact(contact, balls, world), options), world);
}

/**
 * Simulates a tracked stroke's impact, as simulateImpact, and its follow-through (P2b.2b.2a design §4.1). Throws a
 * RangeError for a force table, or on invalid input.
 */
export function simulateStroke(
    contact: ContactState,
    balls: BallStates,
    world: World,
    options: ImpactOptions = {},
): { readonly result: ImpactResult; readonly follow: FollowThrough } {
    if (contact.drive.kind !== "track") {
        fail("simulateStroke needs a tracked drive");
    }
    validateWorld(world);
    validateImpact(contact, balls, world);
    const { run, follow } = integrateStroke(prepareImpact(contact, balls, world), options, true);
    return { result: handedOver(run, world), follow: follow as FollowThrough };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/impact`
Expected: PASS.

Several of these tests rest on model behaviour. The GC stop at rest, the carry's settling and the descent's depth
are reasoned in their comments. Where one fails, inspect the samples (speed, pitch rate, lowest point against t)
before changing an expectation. A finish that is never reached on a canonical setup is an exit-criterion question
for the user.

- [ ] **Step 5: Check bit-identity and run every check**

Run: `env OBSTACLE_STROKES=2000 npx --yes tsx scripts/impactDigest.ts > <temp>/digest-task7.txt`
Then: `cmp <temp>/digest-before.txt <temp>/digest-task7.txt`
Expected: identical.

Run, one per call: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`.
Expected: all pass.

- [ ] **Step 6: Commit**

Message: `Continue the stroke through its follow-through`. Stage the three files.

---
### Task 8: The trajectory and the new `simulateShot`

Spec §4.3, §5.1 and §9's first bullet; exit criteria 3 and 4's identity clause.

- `strokeTrajectory` stitches the downswing (the prepared path, every `FOLLOW_SAMPLE` from the release) to the
  follow-through's samples.
- `simulateShot(setup, world?, options?)` uses `planStroke`, and returns `contactSpeed` and, with `trajectory: true`,
  the trajectory.
- A passed `world` wins over `lawnSpeed`.

**Files:**
- Create: `src/engine/swing/trajectory.ts`
- Modify: `src/engine/shot.ts`
- Test: `tests/engine/swing/trajectory.test.ts` (new), `tests/engine/shot.test.ts`

**Interfaces:**
- Consumes: `FollowThrough`, `FollowFlag`, `FOLLOW_SAMPLE` and `simulateStroke` (Task 7); `planStroke` (Task 5).
- Produces:
  - `interface StrokeSample { t; head; orientation; velocity; top; bottom }`, with t in s from contact;
  - `interface SwingTrajectory { samples; release; impactStart; impactEnd; finish; flags }`;
  - `strokeTrajectory(contact, follow, gravity): SwingTrajectory`;
  - `interface ShotOptions { trajectory?: boolean }`;
  - `ShotOutcome.contactSpeed: number` and `ShotOutcome.trajectory?: SwingTrajectory`;
  - `simulateShot(setup, world?, options?)`.

- [ ] **Step 1: Write the failing tests**

Create `tests/engine/swing/trajectory.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FOLLOW_SAMPLE } from "../../../src/engine/impact/integrate";
import { rotate } from "../../../src/engine/impact/rigidBody";
import { headOnPath, prepareTrack } from "../../../src/engine/impact/track";
import type { Downswing, TrackDrive } from "../../../src/engine/impact/types";
import { add, length, scale, sub, vec3 } from "../../../src/engine/math/vec3";
import { simulateShot } from "../../../src/engine/shot";
import type { StrokeSample, SwingTrajectory } from "../../../src/engine/swing/trajectory";
import { defaultWorld } from "../../../src/engine/world";
import { canonicalSetup } from "../support/shot";

const WORLD = defaultWorld();
const outcome = simulateShot(canonicalSetup("drive", { world: WORLD }), WORLD, { trajectory: true });
const trajectory = outcome.trajectory as SwingTrajectory;
const drive = outcome.contact.drive as TrackDrive;
const down = drive.arc.downswing as Downswing;
const head = outcome.contact.head;

describe("strokeTrajectory (design §4.3)", () => {
    it("runs from the release through the impact to the finish, in time order", () => {
        expect(trajectory.top).toBe(down.release);
        expect(trajectory.impactStart).toBe(0 - drive.arc.contactAt);
        expect(trajectory.impactEnd).toBeCloseTo(outcome.impact.duration - drive.arc.contactAt, 12);
        expect(trajectory.finish).toBeGreaterThanOrEqual(trajectory.impactEnd);
        const { samples } = trajectory;
        expect((samples[0] as StrokeSample).t).toBeCloseTo(trajectory.top, 12);
        expect((samples[samples.length - 1] as StrokeSample).t).toBeCloseTo(trajectory.finish, 12);
        for (let i = 1; i < samples.length; i++) {
            const gap = (samples[i] as StrokeSample).t - (samples[i - 1] as StrokeSample).t;
            expect(gap).toBeGreaterThan(0);
            expect(gap).toBeLessThanOrEqual(FOLLOW_SAMPLE + 1e-12);
        }
    });

    it("starts at the backswing's top: the head at rest, the top hand at P_b", () => {
        const first = trajectory.samples[0] as StrokeSample;
        expect(length(first.velocity)).toBeLessThan(1e-12);
        expect(length(sub(first.top, down.handsTop))).toBeLessThan(1e-9);
    });

    it("is continuous where the impact starts and ends (exit criterion 3)", () => {
        const at = (t: number) => trajectory.samples.filter((s) => Math.abs(s.t - t) < 1e-12);
        const [start] = at(trajectory.impactStart);
        const path = headOnPath(prepareTrack(drive, head, WORLD.gravity), head, 0);
        expect(length(sub((start as StrokeSample).head, path.position))).toBeLessThan(1e-6);
        expect(length(sub((start as StrokeSample).velocity, path.velocity))).toBeLessThan(1e-4);
        const ends = at(trajectory.impactEnd);
        expect(ends).toHaveLength(1);
        expect((ends[0] as StrokeSample).head).toEqual(outcome.impact.head.position);
        expect((ends[0] as StrokeSample).velocity).toEqual(outcome.impact.head.velocity);
    });

    it("keeps both hands on the shaft: r and `bottom` from the socket along it", () => {
        for (const s of trajectory.samples) {
            const shaft = rotate(s.orientation, vec3(0, 0, 1));
            const socket = add(s.head, rotate(s.orientation, head.socket));
            expect(length(sub(s.top, add(socket, scale(shaft, drive.arc.radius))))).toBeLessThan(1e-12);
            expect(length(sub(s.bottom, add(socket, scale(shaft, drive.hands.bottom))))).toBeLessThan(1e-12);
        }
    });
});
```

In `tests/engine/shot.test.ts`:

- add `planStroke` to the `buildContact` import;
- add `headOnPath` and `prepareTrack` to a `track` import beside `effectiveMass` and `swungBody`;
- add `import type { StrokeSample, SwingTrajectory } from "../../src/engine/swing/trajectory";`.

Then add inside `describe("simulateShot")`:

```ts
    it("returns the plan's contact speed and approach", () => {
        const setup = canonicalSetup("half-roll");
        const outcome = simulateShot(setup);
        const plan = planStroke(setup, WORLD);
        expect(outcome.contactSpeed).toBe(plan.contactSpeed);
        expect(outcome.approach).toEqual(plan.approach);
    });

    it("returns the same impact with or without the trajectory (exit criterion 4)", () => {
        const setup = canonicalSetup("half-roll");
        const plain = simulateShot(setup);
        const traced = simulateShot(setup, undefined, { trajectory: true });
        expect(plain).not.toHaveProperty("trajectory");
        expect(traced.impact).toEqual(plain.impact);
        expect(traced.motion).toEqual(plain.motion);
        expect(traced.trajectory).toBeDefined();
    });

    it("lets a passed world win: lawnSpeed is then neither read nor checked", () => {
        // Spec §9 (user decision, 2026-10-06).
        const setup = { ...canonicalSetup("single-ball"), lawnSpeed: 0 };
        expect(() => simulateShot(setup)).toThrow(/lawnSpeed/);
        expect(simulateShot(setup, WORLD).motion.aborted).toBe(false);
    });

    it.each(STROKE_TYPES)("runs the %s canonical setup from the top to its finish (exit criterion 3)", (type) => {
        const outcome = simulateShot(canonicalSetup(type), WORLD, { trajectory: true });
        const trajectory = outcome.trajectory as SwingTrajectory;
        expect(trajectory.flags).not.toContain("follow-cap");
        expect(outcome.impact.entryJumps?.count).toBe(0);
        const drive = outcome.contact.drive as TrackDrive;
        const { head } = outcome.contact;
        const path = headOnPath(prepareTrack(drive, head, WORLD.gravity), head, 0);
        const start = trajectory.samples.find((s) => Math.abs(s.t - trajectory.impactStart) < 1e-12) as StrokeSample;
        expect(length(sub(start.head, path.position))).toBeLessThan(1e-6);
        expect(length(sub(start.velocity, path.velocity))).toBeLessThan(1e-4);
        expect(trajectory.finish).toBeGreaterThanOrEqual(trajectory.impactEnd);
    });
```

The existing "runs the %s canonical setup with no entry jump and no ball above R + 5 mm" keeps exit criterion 3's
height bound. Its comment's figures are P2b.2b.1's; add "(P2b.2b.1; Task 10 re-measures them)".

Run: `npx vitest run tests/engine/swing/trajectory.test.ts tests/engine/shot.test.ts`
Expected: FAIL: `outcome.trajectory` is undefined, `contactSpeed` is undefined, and the passed-world case throws.

- [ ] **Step 2: Add the trajectory**

Create `src/engine/swing/trajectory.ts`:

```ts
/**
 * The whole stroke's trajectory (P2b.2b.2a design §4.3): the head's pose and the hands' positions from the backswing's
 * top to the finish, for P2b.2b.3 to sweep. Before the impact the samples come from the downswing, on the path the
 * impact starts on; inside the impact and after it, from the integrator. The shaft is the segment from the socket to
 * the top hand, rigid on the head.
 */
import { FOLLOW_SAMPLE, type FollowFlag, type FollowThrough } from "../impact/integrate";
import { rotate, type Quaternion } from "../impact/rigidBody";
import { headOnPath, prepareTrack } from "../impact/track";
import type { ContactState, HeadState } from "../impact/types";
import { add, scale, vec3, type Vec3 } from "../math/vec3";

const UP = vec3(0, 0, 1);

/** One sample of the whole stroke (design §4.3): the head's pose and velocity, and the hands on its shaft. */
export interface StrokeSample {
    /** s from contact. */
    readonly t: number;
    /** The head's centre, its orientation and its centre's velocity (m/s). */
    readonly head: Vec3;
    readonly orientation: Quaternion;
    readonly velocity: Vec3;
    /** The top hand (the pivot) and the bottom hand, on the shaft. */
    readonly top: Vec3;
    readonly bottom: Vec3;
}

/** The whole stroke from the backswing's top to the finish, every FOLLOW_SAMPLE and at each boundary (design §4.3). */
export interface SwingTrajectory {
    readonly samples: readonly StrokeSample[];
    /** s from contact: the release t_r, the impact's start and end, and the finish. */
    readonly release: number;
    readonly impactStart: number;
    readonly impactEnd: number;
    readonly finish: number;
    readonly flags: readonly FollowFlag[];
}

/**
 * The trajectory of a tracked `contact` with a downswing, given its follow-through `follow` under `gravity` (design
 * §4.3): the path every FOLLOW_SAMPLE from the release until the impact starts, then `follow`'s samples. Throws a
 * RangeError for a contact state with no downswing.
 */
export function strokeTrajectory(contact: ContactState, follow: FollowThrough, gravity: number): SwingTrajectory {
    const { drive, head } = contact;
    if (drive.kind !== "track" || drive.arc.downswing === undefined) {
        throw new RangeError("strokeTrajectory needs a tracked contact state with a downswing");
    }
    const { arc, hands } = drive;
    const sample = (t: number, state: HeadState): StrokeSample => {
        const shaft = rotate(state.orientation, UP);
        const socket = add(state.position, rotate(state.orientation, head.socket));
        return {
            t: t - arc.contactAt,
            head: state.position,
            orientation: state.orientation,
            velocity: state.velocity,
            top: add(socket, scale(shaft, arc.radius)),
            bottom: add(socket, scale(shaft, hands.bottom)),
        };
    };
    const samples: StrokeSample[] = [];
    const track = prepareTrack(drive, head, gravity);
    const release = arc.contactAt + arc.downswing.release;
    for (let k = 0; release + k * FOLLOW_SAMPLE < 0; k++) {
        const t = release + k * FOLLOW_SAMPLE;
        samples.push(sample(t, headOnPath(track, head, t)));
    }
    for (const s of follow.samples) {
        samples.push(sample(s.t, s.head));
    }
    return {
        samples,
        release: arc.downswing.release,
        impactStart: 0 - arc.contactAt,
        impactEnd: follow.impactEnd - arc.contactAt,
        finish: follow.finish - arc.contactAt,
        flags: follow.flags,
    };
}
```

- [ ] **Step 3: Update `simulateShot`**

In `src/engine/shot.ts`:

1. Import `simulateStroke` beside `simulateImpact`; import `planStroke` (and keep the `SwingApproach` type) from
   `./swing/buildContact`, dropping `buildContact` and `swingApproach`; import `strokeTrajectory` and `type
   SwingTrajectory` from `./swing/trajectory`.
2. Before `ShotOutcome`, add:

```ts
/** simulateShot's options (P2b.2b.2a design §5.1). */
export interface ShotOptions {
    /**
     * Integrate the follow-through and return the whole stroke's trajectory (default false). It costs up to a second
     * of tracked steps, which the P5 budget does not afford on every shot.
     */
    readonly trajectory?: boolean;
}
```

3. In `ShotOutcome`, after `approach`, add:

```ts
    /**
     * The head's planned speed at contact (m/s; P2b.2b.2a design §3.4), from the contact-free downswing.
     * `contact.velocity` is the head's where the impact starts, a lead before contact.
     */
    readonly contactSpeed: number;
```

   and after `motion`:

```ts
    /** The whole stroke from the backswing's top to the finish, with `trajectory: true` (P2b.2b.2a design §4.3). */
    readonly trajectory?: SwingTrajectory;
```

4. Replace `simulateShot` with:

```ts
/**
 * Simulates a whole shot (design §6.1; P2b.2b.2a design §5.1): checks the setup, then runs planStroke, simulateImpact
 * (simulateStroke with `trajectory`), strokeContext, judgeFaults and simulateFreeMotion(impact.handover) in that
 * order, and with `trajectory` stitches the whole stroke. A passed `world` wins: `setup.lawnSpeed` is then neither
 * read nor checked; without one it must suit defaultWorld (P2b.2b.2a design §9). Throws the named RangeError of
 * whichever stage rejects the input: a lawn speed that is not positive or that the default world cannot use, a setup
 * check (design §6.2), the swing model's checks, or the impact's.
 */
export function simulateShot(setup: ShotSetup, world?: World, options: ShotOptions = {}): ShotOutcome {
    if (world === undefined && (!(setup.lawnSpeed > 0) || !Number.isFinite(setup.lawnSpeed))) {
        fail(`lawnSpeed must be a positive finite number (got ${setup.lawnSpeed})`);
    }
    const w = world ?? defaultWorld(setup.lawnSpeed);
    validateWorld(w);
    validateSetup(setup, w);
    const { contact, approach, contactSpeed } = planStroke(setup, w);
    let impact: ImpactResult;
    let trajectory: SwingTrajectory | undefined;
    if (options.trajectory === true) {
        const stroke = simulateStroke(contact, setup.balls, w);
        impact = stroke.result;
        trajectory = strokeTrajectory(contact, stroke.follow, w.gravity);
    } else {
        impact = simulateImpact(contact, setup.balls, w);
    }
    const context = strokeContext(setup, impact);
    const faults = judgeFaults(context, impact);
    const motion = simulateFreeMotion(impact.handover, w);
    return {
        contact,
        approach,
        contactSpeed,
        context,
        impact,
        faults,
        motion,
        ...(trajectory === undefined ? {} : { trajectory }),
    };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/swing/trajectory.test.ts tests/engine/shot.test.ts`
Expected: PASS.

The canonical runs' "no follow-cap" is exit criterion 3, and it rests on each preset reaching its finish. The AC stop
is the one to watch: P2b.2b.1 measured its head ending the impact pitching back on the turf at −0.037 m/s. If any
canonical setup caps, print its last samples' speed relative to the hands and its pitch rate, and take the finding
to the user before changing a finish rule or `FOLLOW_CAP`.

- [ ] **Step 5: Run every check**

Run, one per call: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`.
Expected: all pass.

- [ ] **Step 6: Commit**

Message: `Return the whole stroke's trajectory from simulateShot`. Stage the four files.

---
### Task 9: Exports, version and the bit-identity gates

Exit criteria 4 and 6.

**Files:**
- Modify: `src/engine/index.ts`, `src/engine/simulate.ts`
- Test: `tests/engine/index.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/engine/index.test.ts`:

- add to the `Exported` tuple: `engine.SwingShape`, `engine.SwingTrajectory`, `engine.StrokeSample` and
  `engine.ShotOptions`;
- change `expect(engine.ENGINE_VERSION).toBe("0.6.0");` to `"0.7.0"`;
- add a comment line above the tuple: "P2b.2b.2a adds the stroke shape's types (spec §1, exit criterion 6)".

Run: `npx vitest run tests/engine/index.test.ts`
Expected: FAIL on the version. `npm run check` fails on the four missing types.

- [ ] **Step 2: Implement**

In `src/engine/index.ts`:

- change the shot export to `export { simulateShot, type ShotOptions, type ShotOutcome } from "./shot";`;
- add `type SwingShape` to the `./swing/types` export list, in alphabetical order with the others;
- add `export type { StrokeSample, SwingTrajectory } from "./swing/trajectory";`.

In `src/engine/simulate.ts`, set `ENGINE_VERSION = "0.7.0"`.

Search for other pins of the old version: `grep -rn "0\.6\.0" src tests`. Update any test that pins it.

- [ ] **Step 3: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/index.test.ts`
Expected: PASS. Then `npm run check`: passes.

- [ ] **Step 4: Run the bit-identity gates**

- Run: `env OBSTACLE_STROKES=2000 npx --yes tsx scripts/impactDigest.ts > <temp>/digest-task9.txt`
  Then: `cmp <temp>/digest-before.txt <temp>/digest-task9.txt`
  Expected: identical.
- Run: `npx --yes tsx scripts/shotMix.ts`
  Expected: work units p99 143,084, p99.9 362,050, max 408,030, exactly.
- Run: `env SLOW_TESTS=1 npm test`
  Expected: PASS.

If any gate differs, stop. A force-table or phase-2 change is a defect in this branch: find the commit that moved
it with the digest at each task's commit before fixing.

- [ ] **Step 5: Run every check**

Run, one per call: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`.
Expected: all pass.

- [ ] **Step 6: Commit**

Message: `Export the stroke shape and bump the engine to 0.7.0`. Stage the three files (and any test that pinned the
version).

---
### Task 10: The probe, the outcomes and the documents

Spec §4.4 (the cost and `WAKE_MARGIN`), §8, §9 and §11, and exit criterion 5's recording.

- `scripts/strokeProbe.ts` measures what bears on technique. Its raw output is kept.
- The migrated `scripts/swingProbe.ts` re-measures P2b.2b.1's figures on the new downswing.
- The roadmap, the swing spec and this phase's spec are brought up to date.

**Files:**
- Create: `scripts/strokeProbe.ts`, `docs/superpowers/probes/2026-10-07-p2b2b2a-strokeProbe.txt`,
  `docs/superpowers/probes/2026-10-07-p2b2b2a-swingProbe.txt`
- Modify: `src/engine/impact/integrate.ts` (`WAKE_MARGIN`'s comment), `scripts/swingProbe.ts` (its 0.51 s label),
  `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`,
  `docs/superpowers/specs/2026-10-04-p2b2b1-swing-shot-design.md`,
  `docs/superpowers/specs/2026-10-06-p2b2b2a-stroke-shape-design.md`

- [ ] **Step 1: Write the probe**

Create `scripts/strokeProbe.ts`:

```ts
/**
 * Stroke probe (P2b.2b.2a design §8: measurements recorded in the roadmap, not gated). On the default world with the
 * default profile's canonical setups (tests/engine/support/shot.ts), reports:
 * - speeds: per preset, the planned contact speed against the backswing at intensity 0, 0.5 and 1, with the
 *   downswing's time;
 * - canonical: per preset at its default backswing, with the trajectory: the planned speed, the downswing's time and
 *   lowest clearance (and when), the lead, the impact's length, the finish's time and flags, the head's rise and
 *   travel along aim from contact to the finish (the apex, or the roll's reach), and the coaching ratio against
 *   P2b.2b.1's;
 * - fat: the canonical single-ball stroke met higher on the face (the head lower), 2 to 7 mm: the lead, the dig, and
 *   the planned against the real speed at the first face–ball contact;
 * - cost: per preset, planStroke (the downswing and the 1.2 s free table), the impact's and the follow-through's steps
 *   and µs/step.
 * Run with `npx --yes tsx scripts/strokeProbe.ts`; environment: SECTION (one of the names above; default all), REPEAT
 * (timed runs per stroke, default 20). Not part of the test suite; its output goes into the roadmap's outcomes.
 */
import { IMPACT_DT } from "../src/engine/impact/integrate";
import { simulateImpact, simulateStroke } from "../src/engine/impact/simulateImpact";
import type { Downswing, TrackDrive } from "../src/engine/impact/types";
import { dot, length, sub, type Vec3 } from "../src/engine/math/vec3";
import { simulateShot, type ShotOutcome } from "../src/engine/shot";
import { planStroke } from "../src/engine/swing/buildContact";
import type { StrokeSample, SwingTrajectory } from "../src/engine/swing/trajectory";
import { STROKE_TYPES, type ShotSetup, type StrokeType } from "../src/engine/swing/types";
import type { BallId, BallState } from "../src/engine/types";
import { defaultWorld } from "../src/engine/world";
import { recorder } from "../tests/engine/support/impact";
import { canonicalSetup } from "../tests/engine/support/shot";

// The project has no Node types; this script runs under tsx and reads only its environment.
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

const SECTION = process.env.SECTION ?? "all";
const REPEAT = Number(process.env.REPEAT ?? "20");
const WORLD = defaultWorld();
const fmt = (x: number, digits = 4): string => x.toFixed(digits);
const ms = (t: number): string => fmt(t * 1e3, 1);
const mm = (x: number): string => fmt(x * 1e3, 2);

/** P2b.2b.1's canonical ratios at 3 m/s (roadmap, "P2b.2b.1 outcomes carried forward"). */
const P2B2B1_RATIO: Partial<Record<StrokeType, number>> = {
    drive: 3.32,
    "stop-ac": 6.46,
    "half-roll": 2.83,
    "full-roll": 2.14,
    "pass-roll": 1.59,
};

const withStroke = (setup: ShotSetup, stroke: Partial<ShotSetup["stroke"]>): ShotSetup => ({
    ...setup,
    stroke: { ...setup.stroke, ...stroke },
});

const downOf = (outcome: { contact: ShotOutcome["contact"] }): Downswing =>
    (outcome.contact.drive as TrackDrive).arc.downswing as Downswing;

/** Croqueted ÷ striker distance from the start to rest; NaN for a single-ball stroke. */
function ratio(setup: ShotSetup, outcome: ShotOutcome): number {
    const croqueted = setup.croqueted;
    if (croqueted === undefined) {
        return NaN;
    }
    const travelled = (id: BallId): number =>
        length(sub(outcome.motion.rest[id] as Vec3, (setup.balls[id] as BallState).position));
    return travelled(croqueted) / travelled(setup.striker);
}

function speeds(): void {
    console.log("== Planned contact speed (m/s) and downswing time (ms) against backswing, intensity 0 / 0.5 / 1 ==");
    for (const type of STROKE_TYPES) {
        const base = canonicalSetup(type, { world: WORLD });
        const cells = [0.02, 0.05, 0.1, 0.2, 0.3, 0.5, 0.7].map((backswing) => {
            const row = [0, 0.5, 1].map((intensity) => {
                try {
                    const plan = planStroke(withStroke(base, { backswing, intensity }), WORLD);
                    return `${fmt(plan.contactSpeed, 3)} (${ms(0 - downOf(plan).release)})`;
                } catch (e) {
                    return `rejected (${(e as Error).message.slice(0, 48)})`;
                }
            });
            return `${fmt(backswing, 2)} m: ${row.join(" / ")}`;
        });
        console.log(`${type.padEnd(11)} ${cells.join("; ")}`);
    }
}

function canonical(): void {
    console.log("== Canonical setups at the default backswing, with the trajectory ==");
    for (const type of STROKE_TYPES) {
        const setup = canonicalSetup(type, { world: WORLD });
        const outcome = simulateShot(setup, WORLD, { trajectory: true });
        const { arc } = outcome.contact.drive as TrackDrive;
        const trajectory = outcome.trajectory as SwingTrajectory;
        const nearest = trajectory.samples.reduce((a, s) => (Math.abs(s.t) < Math.abs(a.t) ? s : a));
        const end = trajectory.samples[trajectory.samples.length - 1] as StrokeSample;
        const r = ratio(setup, outcome);
        const before = P2B2B1_RATIO[type];
        console.log(
            `${type.padEnd(11)} backswing ${mm(setup.stroke.backswing)} mm, intensity ` +
                `${fmt(setup.stroke.intensity ?? setup.profile.shape[type].defaultIntensity, 3)}, planned ` +
                `${fmt(outcome.contactSpeed)} m/s; downswing ${ms(0 - downOf(outcome).release)} ms, lowest ` +
                `${mm(outcome.approach.clearance)} mm ${ms(outcome.approach.before)} ms before contact; lead ` +
                `${ms(arc.contactAt)} ms; impact to ${ms(trajectory.impactEnd)} ms after contact; finish ` +
                `${ms(trajectory.finish)} ms [${trajectory.flags.join(", ")}]; head at the finish ` +
                `${mm(end.head.z - nearest.head.z)} mm up and ${mm(dot(sub(end.head, nearest.head), arc.aim))} mm ` +
                `along aim from contact; ratio ${Number.isNaN(r) ? "none" : fmt(r, 2)}` +
                `${before === undefined ? "" : ` (P2b.2b.1 ${fmt(before, 2)})`}`,
        );
    }
}

function fat(): void {
    console.log("== Fat strokes: the canonical single-ball stroke met higher on the face, the head lower ==");
    const base = canonicalSetup("single-ball", { world: WORLD });
    for (const up of [0.002, 0.004, 0.006, 0.007]) {
        const setup = withStroke(base, { contact: { up, side: 0 } });
        try {
            const plan = planStroke(setup, WORLD);
            const { arc } = plan.contact.drive as TrackDrive;
            const probe = recorder();
            const impact = simulateImpact(plan.contact, setup.balls, WORLD, { probe });
            const strike = (impact.timeline["face/blue"] ?? [])[0];
            const at = strike === undefined ? undefined : probe.snapshots.find((s) => s.t >= strike.start - 1e-12);
            const turf = impact.timeline["head/turf"]?.[0];
            const real = at === undefined ? "none" : fmt(length(at.head.velocity));
            const dug = turf === undefined ? "never" : `from ${ms(turf.start - arc.contactAt)} ms`;
            console.log(
                `up ${mm(up)} mm: lead ${ms(arc.contactAt)} ms, lowest ${mm(plan.approach.clearance)} mm; planned ` +
                    `${fmt(plan.contactSpeed)} m/s, real ${real} m/s at the first strike; turf ${dug}` +
                    `, ${mm(impact.peakPenetration["head/turf"] ?? 0)} mm deep; flags ` +
                    `[${impact.events.map((e) => e.kind).join(", ")}]`,
            );
        } catch (e) {
            console.log(`up ${mm(up)} mm: rejected (${(e as Error).message})`);
        }
    }
}

function cost(): void {
    console.log("== Cost (machine-dependent) ==");
    for (const type of STROKE_TYPES) {
        const setup = canonicalSetup(type, { world: WORLD });
        let start = performance.now();
        for (let i = 0; i < REPEAT; i++) {
            planStroke(setup, WORLD);
        }
        const planMs = (performance.now() - start) / REPEAT;
        const plan = planStroke(setup, WORLD);
        const down = downOf(plan);
        const downSteps = down.tempo === null ? down.theta.length - 1 : 0;
        start = performance.now();
        let impactSteps = 0;
        for (let i = 0; i < REPEAT; i++) {
            impactSteps = simulateImpact(plan.contact, setup.balls, WORLD).steps;
        }
        const impactUs = ((performance.now() - start) * 1e3) / REPEAT;
        start = performance.now();
        let followSteps = 0;
        for (let i = 0; i < REPEAT; i++) {
            const { follow } = simulateStroke(plan.contact, setup.balls, WORLD);
            followSteps = Math.round((follow.finish - follow.impactEnd) / IMPACT_DT);
        }
        const strokeUs = ((performance.now() - start) * 1e3) / REPEAT;
        console.log(
            `${type.padEnd(11)} planStroke ${fmt(planMs, 2)} ms (downswing ${downSteps} steps, and the free table); ` +
                `impact ${impactSteps} steps at ${fmt(impactUs / impactSteps, 3)} µs/step; follow-through ` +
                `${followSteps} steps at ${fmt((strokeUs - impactUs) / Math.max(followSteps, 1), 3)} µs/step`,
        );
    }
}

const SECTIONS: Readonly<Record<string, () => void>> = { speeds, canonical, fat, cost };
for (const [name, section] of Object.entries(SECTIONS)) {
    if (SECTION === "all" || SECTION === name) {
        section();
    }
}
```

Run `npx prettier --write scripts/strokeProbe.ts`, then split any line still over 120 columns by hand.

- [ ] **Step 2: Fix the swing probe's run-length label**

In `scripts/swingProbe.ts`, the header's "the WAKE_MARGIN reach filter's headroom over a 0.51 s impact" becomes "…over
the longest impact (MAX_LEAD plus TRACK_IMPACT_CAP)". The comment above the gentle AC stop's run, "timed 60 ms
early", becomes "timed MAX_LEAD early". Do the same for the tracking section's comment "give 60 ms of firm grip".

- [ ] **Step 3: Run the probes and keep the output**

Run: `mkdir -p docs/superpowers/probes`

Run each in the background; they take minutes:

```bash
npx --yes tsx scripts/strokeProbe.ts > docs/superpowers/probes/2026-10-07-p2b2b2a-strokeProbe.txt
```

```bash
npx --yes tsx scripts/swingProbe.ts > docs/superpowers/probes/2026-10-07-p2b2b2a-swingProbe.txt
```

Read both files in full. For the swing probe, compare each section with "P2b.2b.1 outcomes carried forward" in the
roadmap, and note what moved and why (the rolls' hands now come from the downswing).

- [ ] **Step 4: Re-derive `WAKE_MARGIN`'s rationale**

From the swing probe's `cost` section, take the reach filter's step count and its largest displacement beyond the
summed path. That run is the longest impact: a 150 ms lead plus `TRACK_IMPACT_CAP`, 120,000 steps. In
`src/engine/impact/integrate.ts`, replace the `WAKE_MARGIN` comment's sentences from "A tracked drive's longest
run…" to "…(pre-flight confirms it, P2b.2b.1 design §3.5)." with:

```ts
 * A tracked drive's longest impact, a 150 ms lead-in and TRACK_IMPACT_CAP (120,000 steps), would reach about 1e-10 m
 * at the same rate, 10× headroom; the probe measured <the figure> over a 120,000-step one (P2b.2b.2a design §4.4).
 * The follow-through has no balls to wake.
```

Write the measured figure in place of `<the figure>`, in the form `1.49e-11 m`. Keep `WAKE_MARGIN` at 1e-9 unless
the measured headroom (1e-9 over the figure) is below 10×. In that case stop and bring it to the user (spec §4.4).

- [ ] **Step 5: Amend the swing spec (spec §9)**

In `docs/superpowers/specs/2026-10-04-p2b2b1-swing-shot-design.md`:

- After the existing amendment notes near the top, add a paragraph:

```markdown
**Amended 2026-10-07 (P2b.2b.2a).** `simulateShot`'s `world` wins: when one is passed, `setup.lawnSpeed` is neither
read nor checked (§6.1, §6.2). The dip after contact is untracked in carry mode and also inside a swing-mode check
(§3.3). §8.1's re-contact test is a straight drive, not a split, and its tracking runs to the cap, 0.45 s, not
"over 0.15 s". `FREE_SPAN` assumed `buildContact`'s lead, though `simulateImpact` is public; P2b.2b.2a re-derives
it as 1.2 s (its design §4.4).
```

- In §6.1 (around line 978), change the `simulateShot` signature comment to
  `// world wins; else defaultWorld(setup.lawnSpeed)`.
- In §6.2 (around line 999), change "`lawnSpeed` is accepted by `defaultWorld`" to "without a `world`, `lawnSpeed` is
  accepted by `defaultWorld` (a passed `world` wins, P2b.2b.2a)".
- In §3.3 (around line 538), after "No preset dips in carry mode.", add "Inside a swing-mode check the dip is
  likewise untracked (P2b.2b.2a)."
- In §8.1 (around line 1076), change "follows it over 0.15 s" to "follows it over the impact, up to the 0.45 s cap,".
- In §8.1 (around line 1114), change "A croquet split whose striker's ball" to "A straight drive whose striker's
  ball".
- At lines 178 and 414, append "(1.2 s since P2b.2b.2a)" after "0.55 s".

- [ ] **Step 6: Record this plan's decisions in the phase spec**

In `docs/superpowers/specs/2026-10-06-p2b2b2a-stroke-shape-design.md`, after the "Amended 2026-10-07 (spec review…)"
paragraph, add:

```markdown
**Amended 2026-10-07 (plan).** Carry mode is evaluated in closed form, not tabulated (§3.4); its scan visits it at
every `FREE_STEP`. Before contact the hands' path is a function of time (σ from the table in swing mode), so an early
pendulum window replaces only the pendulum's dynamics and an early hands window only the hands' (§3.5). The dip is
not felt by the pendulum before contact (the table is dipless; `pathAt`'s derivatives stay exact). `StrokeSample`
carries the head's velocity (§4.3), which exit criterion 3 bounds. `buildContact` is `planStroke(…).contact`, and
`plannedSpeed` gives the speed alone (§2). The follow-through is a second loop, the run fixed before it (§4.1). A
finish's kind follows the prepared drive: carry mode, a check (α < 0), or a swing (§4.2). A carry whose reach never
binds finishes only at the cap. Where a sourced range forces the default backswing below h₀, the intensity whose
speed is nearest 3 m/s is 0 (§5.3 step 2). The unsourced shape figures took the plan's placeholder rules, confirmed
by the user at the sourcing gate.
```

Adjust the last sentence to what the user decided at Task 1's gate.

- [ ] **Step 7: Update the roadmap (spec §11)**

In `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`:

1. **P2 row, deliverables.** Replace the sentence that begins "**P2b.2b.2:** the whole stroke shape" (up to its
   "29.1.6.3.") with:

```markdown
**P2b.2b.2** is split (decided 2026-10-06). **P2b.2b.2a** (`specs/2026-10-06-p2b2b2a-stroke-shape-design.md`): the
stroke shape. The backswing from its top, the downswing under gravity and the player's effort (effort and tempo one
bounded intensity; a swing's pendulum leads, a roll's hands lead), the lead-in (a downswing meeting the turf simulated,
the lead up to 150 ms), the follow-through to the stroke type's finish, and one `SwingTrajectory` from top to finish;
the amplitude an input and the contact speed an outcome; the shape's figures sourced or labelled placeholders, the
effort fitted to kinematics only. **P2b.2b.2b:** the contact laws: the low-speed face–ball law (a roll as a carry);
the turf's response under load; head–turf stiffness and friction sourcing, and whether turf drag needs a ploughing
term; the end-weighted head; face presets beyond wood. **P2b.2b.2c:** calibration and validation: coaching-ratio
reference data and the swing defaults; the contact-time fit; the hand coupling's T and ζ, the arm mass, the reach
slack and the grips fitted to the stop and drive ratios; the rolls, the stop → pass-roll ordering, pull and
stop-shot lift as held-out validation; the GC stop's distances; crush calibration; 29.1.6.3.
```

2. **P2 row, exit criteria.** Replace "P2b.2b.2: the stroke shape … no jump flag)." with:

```markdown
P2b.2b.2a: the downswing's analytic cases (the energy integral and the work–energy balance within 0.1 %); every
preset's canonical setup run from top to finish with no re-entry guard hit, no ball above R + 5 mm and no
`follow-cap`, its trajectory continuous at every boundary; force tables bit-identical; each preset's default planning
3 m/s within 2 % (or its sourced bound's nearest). P2b.2b.2b: the contact laws' analytic cases. P2b.2b.2c: standard
stroke ratios within tolerance of sourced figures (stop shot and drive are calibration targets, the rolls held-out
validation; see "P2b.2 decisions"); stop → pass-roll monotonic; pull emerges on wide rolls without special-casing;
stop-shot lift emerges in the AC stop (striker's ball clear of the turf during the transfer, meeting the croqueted
ball just above its equator, no jump flag).
```

3. **P3 row.** After "with the default "typical club player" profile from P2b.2b.2;", insert "fitting the effort and
   tempo (`torqueMax`, `tempoSlow`, `tempoFast`, the hands' tempo) per player;".
4. **"P2b.2 decisions".** Append the bullet below. Wrap it at 120 columns.

```markdown
- **P2b.2b.2a design (2026-10-06/07).** User decisions:
  - P2b.2b.2 is split into 2a (the stroke shape), 2b (the contact laws) and 2c (calibration and validation), each with
    its own spec, plan and PR.
  - Amplitude is the input and the contact speed an outcome: `stroke.backswing` (the head's height at the top above
    its contact height) replaces `stroke.speed`.
  - The downswing is gravity plus the player's effort. Effort and tempo are one bounded control, `intensity` in
    [0, 1], independent of the backswing and variable per shot; at 0 the player lets the mallet fall.
  - Effort is fitted to sourced kinematic data only, never to ratios; without data it takes a labelled placeholder
    (intensity 1 doubles the speed). Per-player fitting is P3's.
  - The hands and the pendulum start together at the top: in swing mode the pendulum leads and the hands follow its
    angle; in carry mode (rolls) the hands and body lead on their own tempo and the slope follows. The hands arrive
    with no vertical velocity.
  - A downswing that meets the turf is simulated (the fat stroke), the lead up to 150 ms.
  - Three segments: the downswing, the unchanged impact, and the follow-through continuing the integrator with the
    balls removed, only on request; one `SwingTrajectory` from top to finish for P2b.2b.3.
  - `simulateShot`'s passed `world` wins over `setup.lawnSpeed`.
```

5. **Outcomes.** Add a section `## P2b.2b.2a outcomes carried forward (for P2b.2b.2b and P2b.2b.2c)` before
   "Provisional numbers". It is measured by `scripts/strokeProbe.ts` and `scripts/swingProbe.ts`, with the raw
   output in `docs/superpowers/probes/` and node's version stated. Record, as observations not gates:
   - **Sourcing:** what `swing.json` holds sourced and what is a placeholder, and the user's gate decisions.
   - **The fit** (Task 4 Step 4's summary): per preset h₀, the default backswing and intensity, the planned speed,
     and the placeholder effort or tempo.
   - **Speeds** (`speeds`): the planned speed against the backswing at intensity 0, 0.5 and 1, and the downswing
     times. Note whether `MAX_LEAD` (150 ms, provisional) sits comfortably inside the downswing times (spec §3.5).
   - **Canonical** (`canonical`): per preset, the downswing time, the lowest clearance, the lead, the impact's
     length, the finish and its flags, the head's rise and travel at the finish, and the ratio against P2b.2b.1's.
   - **Fat strokes** (`fat`): the planned against the real speed at the first strike, and the dig.
   - **Re-measured P2b.2b.1 figures** (the swing probe): ratios, canonical runs, flags, the GC stop, the late re-hit,
     the coupling, tracking. Say for each whether it moved, and why.
   - **Cost** (for P5): the downswing, the follow-through, the 1.2 s free table and the reach filter's headroom.
   - **Carried open items:** the handover's list (the 12 AC-stop `impact-cap` runs, the 29.1.6.1 possible faults,
     the GC stop's effective mass, the full roll at 4 m/s, the AC stop's back-pitch, the end rule's front-face
     look-ahead, the reference gaps, P4 and P5 deferrals), each as now re-measured.

- [ ] **Step 8: Check the documents**

Run, for each markdown file touched: `env LC_ALL=en_GB.UTF-8 grep -nE "^[^|].{120,}$" <file>`
Expected: no output.

- [ ] **Step 9: Run every check**

Run, one per call: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`.
Expected: all pass.

- [ ] **Step 10: Commit**

Message: `Probe the stroke shape and record its outcomes`. Stage `scripts/strokeProbe.ts`, `scripts/swingProbe.ts`,
`src/engine/impact/integrate.ts`, the two probe files, the roadmap and the two specs, by path.

---
## After the last task

Run the whole-branch review: `superpowers:requesting-code-review`, then `superpowers:finishing-a-development-branch`.
The PR body begins with a short non-technical summary: this is the first of three parts of P2b.2b.2, giving the
mallet a real swing from the top of the backswing to the finish. Then it lists the changes, links the spec and this
plan, and quotes the exit criteria with their evidence. The user merges.
