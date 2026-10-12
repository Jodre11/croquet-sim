# P2b.2b.2b.2b — The Roll's Stroke: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In carry mode (the three rolls) the hands hold the mallet through a measured, compliant flex from contact on.
They push forward on their own arc without braking, then hand over to a pendulum phase that swings the mallet through
vertical. The stroke's inputs gain the pendulum phase's start and effort, and the handover keeps a lifted ball clear of
the head.

**Architecture:**

- `flex.ts` (new) holds the arm's law: k = k₀ + κ·|F_ff|, c = 2·ζ_arm·√(k·m_arm), and the force of one hand's
  spring-damper.
- The carry downswing ends on the hands' arc: its vertical term becomes a cubic Hermite whose end slope is the arc's
  tangent at contact.
- After contact, `track.ts` gives carry mode a new intended path: the hands' circular arc, travelled along aim at
  today's carry profile, stopping at once at the push length. The reach's brake, its descent and `groundDepth` go, in
  carry only.
- `handLoad`'s carry branch becomes the flex: both grips spring to their intended points, which start from the actual
  grips. At `pendulumAt` × push length the bottom hand lets go and pushes the mallet round the top hand until vertical.
  The impact waits for that moment, and the follow-through finishes at the next apex.
- `handover.ts` moves a ball out of the head along the contact normal's horizontal part.
- The tasks land in this order:
  - the sources;
  - the pure law and the inputs;
  - the arc;
  - the flex and the pendulum phase;
  - the user's pre-flight gate;
  - the handover rule;
  - the gates and the version;
  - the probes and the documents.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), Vitest, ESLint, Prettier. No
new dependencies. `npx --yes tsx` runs the scripts.

**Spec:** `docs/superpowers/specs/2026-10-11-p2b2b2b2b-roll-stroke-design.md`. Read all of it, especially "The roll as
played" and "Decisions". Also read:

- **Roadmap:** `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`, the P2 row, "P2b.2b.2b decisions and
  findings (2026-10-08)" (especially "The roll as played" and "The model's roll against the roll as played") and
  "P2b.2b.2b.2a outcomes (2026-10-09)".
- **Stroke shape spec:** `docs/superpowers/specs/2026-10-06-p2b2b2a-stroke-shape-design.md` §3.3 (the carry
  downswing, which this phase reopens).
- **The previous plan:** `docs/superpowers/plans/2026-10-09-p2b2b2b2a-strike-turf-laws.md`, for the conventions this
  plan keeps.

**Decisions made while planning.** Task 9 folds each into the spec's amendment note. Decision 2 changes a sentence of
the spec, so the user rules on it when they review this plan.

1. **Where the new inputs live.**
   - `SwingArc` gains `pendulumAt`, `pendulumEffort`, `handArcRadius` and `handArcLow`, and loses `groundDepth`.
   - The arm's law is the player's body, like `armMass`:
     - `Hands` gains `flex: FlexLaw` and `pendulumForce`;
     - `SwingProfile.body` gains the same two, which `profile.ts` reads from `reference/contact.json`;
     - `planStroke` copies them into `Hands`.
   - Swing mode carries them all and never reads them.
2. **The intended path starts from the actual grips' positions, not their velocities** (spec §4.1 says both).
   - The intended position is the actual grip at the flex's first step plus the planned motion since then. The intended
     velocity is the plan's.
   - Starting from the actual velocity would offset the intended velocity for the rest of the stroke: it never decays,
     and the push would never come to rest at its length.
   - The carry downswing's dampers keep the actual velocity close to the plan's at contact. The damper's step at that
     moment is printed at the pre-flight gate (Task 6).
   - **The user rules on this at plan review.**
3. **In the pendulum phase the top hand's feed-forward is the whole F_ff**: the weight and the planned motion's
   inertia. It is the only hand on the mallet, as swing mode's top hand outside a check. Its stiffness follows that
   force (spec §3.1).
4. **In carry mode after contact the feed-forward shares are not scaled by the grips** (spec §3.1: "the hand's share
   of today's feed-forward"). Every roll's grips are 1, so the rolls do not notice.
5. **The finish needs a forward swing.**
   - Through the push the shaft leans further (the lean rises from about 31° to 42°), so the pitch rate is negative,
     and today's apex rule would fire at once.
   - The finish is therefore the first step after the pendulum phase starts at which the pitch rate is at or below
     zero, *after it has been positive*: a latch in `GripState`, set by `handLoad`.
   - A head that never swings forward runs to `FOLLOW_CAP` and is flagged `follow-cap`.
6. **The handover rule acts on tracked drives only.** A force table's head is its face alone (P2b.1), so its run may
   end with the barrel through a ball, which no handover rule should move. Force tables stay bit-identical.
7. **The rule's bound per ball** is its static sink at its position at the impact's start (`sinkSolver`), plus
   `CONTACT_TOLERANCE`.
8. **A carry whose hands never reach the pendulum point** (for example, still hands) never starts the pendulum phase.
   The impact's end does not wait for it, and the follow-through runs to `FOLLOW_CAP` with `follow-cap`.
9. **`PathPoint` gains `theta`**, the planned pitch, which the flex's intended bottom grip needs.
10. **`Downswing` gains `tangent`** (the Hermite term, vertical; `ZERO` in swing mode), and `DownswingInput` and
    `StrokeChoice` gain `arrival`, the arc's slope dz/ds at contact.
11. **The analytic finish cases** (spec §7.1) cover a free swing past vertical and a head that never swings forward.
    A free pendulum's lowest point is vertical, so a swing that tops out short of vertical needs a ball, the turf or
    moving hands to hold it back. The probe records that case on the rolls (Tasks 6 and 9).
12. **Exit criterion 4 is measured by a new probe section, `onPoint`** (`scripts/strokeProbe.ts`), on the canonical
    runs at 2 and 3 m/s and on swingProbe's preset grid for each roll.

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
  - Engine code has no `Math.sin`, `Math.cos`, `Math.atan2`, `Math.asin`, `Math.exp`, `Math.log`, `Math.pow` or
    `Math.hypot`, and no `**`. `npm run lint` enforces it.
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
- **Units.** SI: m, s, kg, N, rad. The spec's millimetres, milliseconds and degrees are for reading only.
- **Vocabulary.** "Split" and "ratio" keep their croquet meanings only. The push/pendulum distribution is the
  "phasing", the second phase is the "pendulum phase", and nothing is called a "flick".
- **Engine version.** `ENGINE_VERSION` becomes `"0.10.0"` (Task 8).
- **Bit-identity** (spec exit criterion 5).
  - The swing-mode presets (single-ball, drive, AC stop, GC stop) stay bit-identical, as do force tables and phase 2.
  - Task 1 captures the baseline, and Task 8 compares with it.
  - Swing mode's code paths must not gain arithmetic. Branch on the mode rather than adding a zero term: `x + 0`
    turns −0 into +0, and the digest keeps the sign of zero.
- **The baseline runs** (Task 1 Step 2) run in the background. They must finish before Task 3's first engine change.
  Check with `pgrep -fl tsx`, which must print no digest, probe or shot-mix process. Each baseline file must be
  non-empty.
- **Slow tests** run only when `SLOW_TESTS` is set.
- **RED steps.** Vitest does not type-check. Where a test uses a missing export or field, the RED run shows runtime
  failures (`… is not a function`, an assertion on `undefined` or `NaN`), and `npm run check` shows the type errors.
- **Behaviour figures.**
  - A test that rests on model behaviour carries its reasoning in a comment.
  - Where a test fails, trace the mechanism (the test's own setup, then the probe) before changing an expectation.
  - Fix the code if it departs from the spec.
  - A roll's re-baselined figure gets a comment naming the step: "P2b.2b.2b.2b: hands' arc" (Task 4) or "…: flex"
    (Task 5).
  - A changed expectation that the spec does not predict goes to the user, and is folded into the spec's amendment
    note (Task 9).
- **Circularity.**
  - The arm's numbers come only from published measurements of the human arm.
  - Nothing is tuned to a coaching ratio, to Gugan's or Hall's roll figures, or to the user's play. Those are recorded
    as held-out checks.
  - The hands' arc is a labelled placeholder (`handArcRadius` 1.5 m, `handArcLow` 0.5), like `handAngle`.
- **Process.** Follow the plan's steps. There are no side probes during the run: figures come from the steps that
  produce them. The pre-flight gate (Task 6) **always stops for the user**, whatever it shows.
- **Bash.**
  - One command per call: no `&&`, `||`, `;`, `$(…)` or subshells.
  - Redirecting a script's output to a file with `>` or `2>` is allowed.
  - Never use a shell command string (`bash -c`, `node -e`). Use `python3 -I` rather than `jq` with `test(`.
  - Oxford Croquet pages need `curl -k`.
- **The temp directory.**
  - `<temp>` in a Run line is the executing session's literal temp path (its `CLAUDE_TEMP_DIR`, e.g.
    `/tmp/claude-<session id>`), written out in full: worktree sessions refuse `$CLAUDE_TEMP_DIR`. A subagent is
    given this literal path in its prompt.
  - Throwaway scripts go in `<temp>/scripts/`, their outputs in `<temp>/baseline/` and `<temp>/after/`, and a
    downloaded page in its own new directory under `<temp>/fetch/`.
  - `<date>` in a path or heading is the day the step runs, as YYYY-MM-DD.
  - Throwaway scripts import the worktree by absolute path:
    `/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b2b-roll-stroke/…`.
- **Sources.** Cite, don't mirror (repo rule). Record the URL, the date, the SHA-256 of the fetched page and short
  quotes in `reference/sources/README.md`, and commit no fetched page.
- **Commits.**
  - Write a short imperative sentence (repo style), signed.
  - Write the message to a fresh file `<temp>/msg-task<N>.txt` and commit with `git commit -F <that path>`.
  - Check with `git log -1 "--format=%G? %h"`. Expect `G`; quote the format, as zsh globs `?`. If signing refuses,
    leave the change staged and report it.
  - Stage files by explicit path. Never use `--no-verify`, `-c commit.gpgsign=false` or bare `git stash`.
- **Checks after every task:** `npm test`, `npm run lint`, `npm run check` and `npm run format:check`, one per call,
  all pass. The baseline is 973 passed, 1 expected fail (the pass roll's) and 2 skipped.
- **Known noise.** The editor's TypeScript LSP reports spurious "Cannot find module/name" diagnostics. `npm run check`
  is the source of truth.
- **Worktree.**
  - All work happens in `/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b2b-roll-stroke`, on branch
    `worktree-p2b2b2b2b-roll-stroke`.
  - The branch is local only. Run `npm ci` there first if `node_modules` is missing.

## Review Focus

The spec implies each input below, but none of its listed tests exercises it. The task that owns each one pins it with
a test.

1. **A push of length 0** (`stroke.handReach` 0 on a roll). The arc's low point is then at contact, the hands arrive
   level and the pendulum phase starts at contact. The run must end normally, with no NaN from the arc's square root
   and no division by a zero push. Pinned in Task 4 ("starts the pendulum phase at contact for a push of length 0")
   and Task 5 ("runs a roll with no push to a normal finish").
2. **Hands that never reach the pendulum point** (still hands, `handReach` > 0). The impact must not wait for ever.
   The follow-through must end at `FOLLOW_CAP` with `follow-cap`, not throw. Pinned in Task 5 ("caps a carry whose
   hands never reach the pendulum point").
3. **`pendulumAt` 1 and `pendulumEffort` 1 together**, the latest and hardest pendulum phase. The bottom hand's push
   must stop once the shaft passes vertical and never push the swing past its top. Pinned in Task 5 ("pushes the
   bottom grip up to vertical and not after").
4. **A ball overlapping the head along a vertical normal** (the head resting on top of a lifted ball). The handover
   must throw an Error naming the ball, never move the ball sideways or leave it overlapping. Pinned in Task 7
   ("throws for a head on top of a ball").
5. **A mirrored roll.** The arc, the flex and the pendulum phase must mirror exactly across y = 0, as every tracked
   drive does (`mirrorContact`). A new vector field the mirror misses would break it silently. Pinned in Task 5
   ("mirrors a canonical roll exactly").

---
## File Structure

| Path | Change |
|---|---|
| `reference/contact.json`, `src/reference/index.ts`, `reference/sources/README.md` | The arm's five values (Task 1) |
| `tests/reference/reference.test.ts` | The arm's values loaded and bounded (Task 1) |
| `src/engine/impact/flex.ts` | New: the flex law (Task 2) |
| `src/engine/impact/types.ts` | `FlexLaw`; `Hands.flex`, `pendulumForce`; `SwingArc`'s four fields (Task 3); `Downswing.tangent`, `groundDepth` gone (Task 4) |
| `src/engine/swing/types.ts` | `SwingDrive`'s four fields, `SwingProfile.body`'s two, `ShotSetup.stroke`'s two (Task 3); `groundDepth` gone (Task 4) |
| `src/engine/swing/profile.ts` | The presets' values and the body's law (Task 3); `groundDepth` gone (Task 4) |
| `src/engine/swing/buildContact.ts` | Plumbing and validation (Task 3); `arcArrival` and the arrival (Task 4) |
| `src/engine/impact/simulateImpact.ts` | Validation (Tasks 3, 4); the head passed to the handover (Task 7) |
| `src/engine/swing/downswing.ts` | The carry downswing ends on the arc (Task 4) |
| `src/engine/impact/track.ts` | `ARM_FLEX`, `PENDULUM_FORCE` (Task 3); the arc after contact, `Push` (Task 4); the flex and the pendulum phase in `handLoad`, `GripState` (Task 5) |
| `src/engine/impact/integrate.ts` | The interim finish (Task 4); the finish, the impact's end (Task 5) |
| `src/engine/impact/handover.ts` | The head-clearance rule (Task 7) |
| `src/engine/simulate.ts` | `ENGINE_VERSION` 0.10.0 (Task 8) |
| `reference/swing.json` | The rolls' re-fitted backswings (Task 4) |
| `scripts/fitStrokeShape.ts` | The arrival in its cases (Task 4) |
| `tests/engine/support/impact.ts`, `shot.ts` | Defaults for the new fields (Task 3); `groundDepth` gone (Task 4); `tangent` mirrored (Task 4) |
| `tests/engine/impact/flex.test.ts` | New (Task 2) |
| `tests/engine/impact/track.test.ts`, `hands.test.ts`, `followThrough.test.ts`, `handover.test.ts`, `simulateImpact.test.ts` | Tasks 3–7 |
| `tests/engine/swing/downswing.test.ts`, `buildContact.test.ts` | Tasks 3, 4 |
| `tests/engine/shot.test.ts` | "Punch beats coast" back to `it` (Task 8) |
| `scripts/strokeProbe.ts` | `asPlayed` for all three rolls, `onPoint` (Task 6); `timing` and the held-out checks (Task 9) |
| `scripts/swingProbe.ts` | Carry's reach lines (Task 4); the handover's corrections (Task 9) |
| `docs/superpowers/probes/<date>-p2b2b2b2b-*.txt` | New: raw probe output (Tasks 6, 9) |
| The roadmap, this phase's spec | Spec §11, and this plan's decisions (Task 9) |

Every commit stays green:

- **Tasks 1–3** add reference data, a pure module and inputs that nothing reads yet.
- **Task 4** moves the rolls onto the hands' arc. The old velocity-only hands still carry the mallet.
- **Task 5** replaces the rolls' hands with the flex and the pendulum phase.
- **Task 6** is the user's gate. Nothing after it lands until the user has ruled.
- **Task 7** adds the handover rule.
- **Task 8** runs the gates and bumps the version.
- **Task 9** probes, and brings the documents up to date.

---
### Task 1: The baseline, and the arm's numbers

Spec §3.2 (the sourcing gaps), §1 exit criterion 5 (the "before" runs).

**Files:**
- Modify: `reference/contact.json` (five entries), `src/reference/index.ts` (five readers and the header)
- Modify: `reference/sources/README.md` (a section for this phase's sources)
- Test: `tests/reference/reference.test.ts`
- Temp, never committed: `<temp>/scripts/presetDigest.mts`, `<temp>/baseline/*`, `<temp>/fetch/*`

**Interfaces:**
- Produces, from `src/reference/index.ts`: `contactReference.armStiffness` (k₀, N/m), `armStiffnessPerForce` (κ,
  1/m), `armDampingRatio` (ζ_arm, 1), `armEndpointMass` (m_arm, kg) and `pendulumForce` (F_pendulum, N). Each is a
  `ReferenceValue` with bounds.

- [ ] **Step 1: Confirm that the branch's code is `main`'s**

Run: `git diff --stat main -- src tests scripts reference`
Expected: no output. The branch's commits are docs only.

Run: `mkdir -p <temp>/scripts <temp>/baseline <temp>/after <temp>/fetch`

- [ ] **Step 2: Capture the baseline (in the background)**

Create `<temp>/scripts/presetDigest.mts`:

```ts
/**
 * Full-precision digest of the swing presets' canonical and sweep runs, for P2b.2b.2b.2b's exit criterion 5 (plan
 * Task 1 Step 2, Task 8). Each line is one run: its label and the SHA-256 of its outcome with the engine version
 * normalised and the sign of zero kept. Throwaway, never committed. Run from the worktree: npx --yes tsx <this>.
 */
import { createHash } from "node:crypto";
import { simulateShot } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b2b-roll-stroke/src/engine/shot";
import type { StrokeType } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b2b-roll-stroke/src/engine/swing/types";
import { defaultWorld } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b2b-roll-stroke/src/engine/world";
import { backswingFor, canonicalSetup } from
    "/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2b2b-roll-stroke/tests/engine/support/shot";

const WORLD = defaultWorld();
const TYPES: readonly StrokeType[] = ["single-ball", "drive", "stop-ac", "stop-gc"];
/** JSON.stringify drops the sign of zero; keep it, so that the digest is bit-exact. */
const exact = (key: string, value: unknown): unknown =>
    key === "engineVersion" ? "" : Object.is(value, -0) ? "-0" : value;
const digest = (label: string, run: () => unknown): void => {
    try {
        const sha = createHash("sha256").update(JSON.stringify(run(), exact)).digest("hex");
        console.log(`${label}: ${sha}`);
    } catch (error) {
        console.log(`${label}: rejected (${(error as Error).message})`);
    }
};

for (const type of TYPES) {
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

Run each in the background, with `run_in_background: true`:

Run: `npx --yes tsx <temp>/scripts/presetDigest.mts > <temp>/baseline/presetDigest.txt`
Run: `npx --yes tsx scripts/impactDigest.ts > <temp>/baseline/impactDigest.txt`
Run: `npx --yes tsx scripts/shotMix.ts > <temp>/baseline/shotMix.txt`
Run: `npx --yes tsx scripts/strokeProbe.ts > <temp>/baseline/strokeProbe.txt`
Run: `npx --yes tsx scripts/swingProbe.ts > <temp>/baseline/swingProbe.txt`

The phase-2 digest needs no capture: nothing in this phase reaches phase 2, and the shot mix covers it.

They must finish before Task 3. Steps 3 to 6 change no engine behaviour, so they may run alongside.

- [ ] **Step 3: Source the five numbers**

Spec §3.2. For each value below, find an open figure: a Europe PMC full text, an open-access paper, a thesis or a
review. Fetch each page into its own new directory under `<temp>/fetch/`, and record its URL, the date and its SHA-256
(`shasum -a 256 <file>`).

Europe PMC's REST API works where PMC, Springer, Nature and J Neurophysiol block fetching:

- `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:<doi>&resultType=core&format=json`
- `https://www.ebi.ac.uk/europepmc/webservices/rest/<PMCID>/fullTextXML`

The values, and the rule that picks each:

| Key | Symbol | Rule | Bounds |
|---|---|---|---|
| `armStiffness` | k₀ | Fortineau et al. 2023 (DOI 10.1371/journal.pone.0295640, open access): the mean endpoint stiffness over its 31 participants, if it reports one; otherwise the centre of its 45–445 N/m range, labelled as such | the reported range |
| `armEndpointMass` | m_arm | The same paper's mean endpoint mass; otherwise the centre of 227–893 g | the reported range |
| `armDampingRatio` | ζ_arm | A damping ratio the literature reports for the arm's endpoint (Perreault, Kirsch and Crago 2004 if an open copy or a citing paper quotes it). Failing that, derived from Fortineau's means as c/(2·√(k·m)), provenance `derived` | the range the source gives, or the ratio's spread over Fortineau's per-participant values |
| `armStiffnessPerForce` | κ | The slope of endpoint stiffness against the arm's voluntary force (Perreault 2002 or 2004 if quoted openly, or a later open paper measuring it), in N/m per N. Takagi et al. 2020's slope against **grasp** force is an analogue only, and must be labelled so | the source's spread |
| `pendulumForce` | F_pendulum | The largest forward force a hand applies perpendicular to the shaft by wrist and forearm: a measured maximal wrist-flexion force at the hand, or a maximal wrist-flexion torque divided by the hand's lever arm from the wrist, both cited | the source's spread |

Write each entry in `reference/contact.json`, after `headDeepLimit`, in the file's shape:

```json
"armStiffness": {
    "value": <the number the rule gives>,
    "unit": "N/m",
    "bounds": [<low>, <high>],
    "source": "<authors, title, journal volume:page (year), DOI <doi>, <url>>",
    "provenance": "direct" | "derived" | "analogue",
    "note": "<design §3.1–§3.2: its role in the law; quoted figures; how the rule picked it; the bounds>"
}
```

Units: `armStiffnessPerForce` `"1/m"`, `armDampingRatio` `"1"`, `armEndpointMass` `"kg"`, `pendulumForce` `"N"`.

**Stop for the user** if any of κ, ζ_arm, m_arm or F_pendulum has no open figure that the rule accepts. Report each
candidate you found, with its source, its figure and why the rule rejects it. Do not guess, and do not go on to Step 4
until the user has ruled. Report k₀ the same way if Fortineau's page is unreachable.

- [ ] **Step 4: Write the failing tests**

In `tests/reference/reference.test.ts`, in `describe("swing, coupling and head–turf reference data", …)`, after "loads
the default body's arm mass and reach slack", add:

```ts
    it("loads the arm's flex and pendulum push, each positive within its bounds (P2b.2b.2b.2b design §3.2)", () => {
        const arm = {
            armStiffness: "N/m",
            armStiffnessPerForce: "1/m",
            armDampingRatio: "1",
            armEndpointMass: "kg",
            pendulumForce: "N",
        } as const;
        for (const [key, unit] of Object.entries(arm)) {
            const value = contactReference[key as keyof typeof arm];
            expect(value.unit, key).toBe(unit);
            expect(value.value, key).toBeGreaterThan(0);
            const [low, high] = value.bounds as readonly [number, number];
            expect(value.value, key).toBeGreaterThanOrEqual(low);
            expect(value.value, key).toBeLessThanOrEqual(high);
        }
        // A damping ratio above 1 is overdamped; the flex law takes ζ_arm in (0, 1] (design §6).
        expect(contactReference.armDampingRatio.value).toBeLessThanOrEqual(1);
    });
```

If `ReferenceValue.bounds` is typed optional, keep the `as` cast. "gives every impact value bounds" already covers
the new entries.

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx vitest run tests/reference/reference.test.ts`
Expected: FAIL, `Cannot read properties of undefined (reading 'unit')`.

- [ ] **Step 6: Implement**

In `src/reference/index.ts`, add after `headDeepLimit`:

```ts
    armStiffness: readValue(contactJson, "armStiffness", "contact"),
    armStiffnessPerForce: readValue(contactJson, "armStiffnessPerForce", "contact"),
    armDampingRatio: readValue(contactJson, "armDampingRatio", "contact"),
    armEndpointMass: readValue(contactJson, "armEndpointMass", "contact"),
    pendulumForce: readValue(contactJson, "pendulumForce", "contact"),
```

Extend the `contactReference` header: "…, the head–turf pair, and the arm's flex and pendulum push (P2b.2b.2b.2b)."

In `reference/sources/README.md`, add a section "P2b.2b.2b.2b: the arm's flex and pendulum push". For each source,
give the citation, the URL, the fetch date (<date> as run), the SHA-256 and the quoted figures. Mirror nothing.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/reference/reference.test.ts`
Expected: PASS.

- [ ] **Step 8: Run every check**

Run, one per call: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`.
Expected: all pass.

- [ ] **Step 9: Commit**

Stage `reference/contact.json`, `reference/sources/README.md`, `src/reference/index.ts` and
`tests/reference/reference.test.ts`.

Message: `Source the arm's flex and pendulum push from published measurements`

In the task's report, list the five values, each with its source and provenance.

---
### Task 2: The flex law

Spec §3.1.

**Files:**
- Create: `src/engine/impact/flex.ts`
- Modify: `src/engine/impact/types.ts` (`FlexLaw`)
- Test: `tests/engine/impact/flex.test.ts`

**Interfaces:**
- Produces, from `src/engine/impact/types.ts`:
  - `interface FlexLaw { readonly stiffness: number; readonly stiffnessPerForce: number; readonly dampingRatio:
    number; readonly endpointMass: number }` (k₀ N/m, κ 1/m, ζ_arm, m_arm kg)
- Produces, from `src/engine/impact/flex.ts`:
  - `interface FlexGains { readonly stiffness: number; readonly damping: number }`
  - `function flexGains(law: FlexLaw, force: number): FlexGains`, where `force` is |F_ff| (N)
  - `function flexForce(feedForward: Vec3, gains: FlexGains, offset: Vec3, lag: Vec3): Vec3`, which returns
    F_ff − k·offset − c·lag, with offset = x − x̂ and lag = v − v̂

- [ ] **Step 1: Add `FlexLaw`**

In `src/engine/impact/types.ts`, after `Coupling`:

```ts
/**
 * The arm's flex under a hand (P2b.2b.2b.2b design §3.1): its stiffness k = k₀ + κ·|F_ff| rises linearly with the force
 * the hand applies voluntarily, its feed-forward, and its damping holds the ratio ζ_arm on the arm's endpoint mass:
 * c = 2·ζ_arm·√(k·m_arm). k₀ (N/m), κ (1/m), ζ_arm and m_arm (kg) are reference/contact.json's arm values.
 */
export interface FlexLaw {
    readonly stiffness: number;
    readonly stiffnessPerForce: number;
    readonly dampingRatio: number;
    readonly endpointMass: number;
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/engine/impact/flex.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { flexForce, flexGains } from "../../../src/engine/impact/flex";
import type { FlexLaw } from "../../../src/engine/impact/types";
import { vec3 } from "../../../src/engine/math/vec3";

/** A plausible, unsourced law (as the test support's): k₀ 200 N/m, κ 20 /m, ζ 0.3 on 0.5 kg. */
const LAW: FlexLaw = { stiffness: 200, stiffnessPerForce: 20, dampingRatio: 0.3, endpointMass: 0.5 };

describe("the flex law (P2b.2b.2b.2b design §3.1)", () => {
    it("stiffens linearly with the hand's voluntary force: k = k₀ + κ·|F_ff|", () => {
        expect(flexGains(LAW, 0).stiffness).toBe(200);
        expect(flexGains(LAW, 10).stiffness).toBe(400);
        expect(flexGains(LAW, 100).stiffness).toBe(2200);
    });

    it("holds the damping ratio on the endpoint mass: c = 2·ζ·√(k·m)", () => {
        for (const force of [0, 10, 100]) {
            const { stiffness, damping } = flexGains(LAW, force);
            expect(damping).toBeCloseTo(2 * 0.3 * Math.sqrt(stiffness * 0.5), 12);
        }
    });

    it("gives F_ff less the spring and the damper", () => {
        const gains = flexGains(LAW, 10);
        const force = flexForce(vec3(1, 2, 30), gains, vec3(0.01, 0, -0.02), vec3(0, 0.5, 0));
        expect(force.x).toBeCloseTo(1 - 400 * 0.01, 12);
        expect(force.y).toBeCloseTo(2 - gains.damping * 0.5, 12);
        expect(force.z).toBeCloseTo(30 + 400 * 0.02, 12);
    });

    it("has no runaway: the spring's force is linear in its offset, its stiffness set by F_ff alone", () => {
        // Design §3.1: a law on the total force, k = k₀ + κ·|F|, would run away at x = 1/κ. Here k reads only the
        // feed-forward, so ten times the offset gives exactly ten times the spring's force.
        const gains = flexGains(LAW, 10);
        const fed = vec3(0, 0, 10);
        const small = flexForce(fed, gains, vec3(0.001, 0, 0), vec3(0, 0, 0));
        const large = flexForce(fed, gains, vec3(0.01, 0, 0), vec3(0, 0, 0));
        expect(large.x).toBeCloseTo(10 * small.x, 12);
        expect(large.z).toBe(small.z);
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/impact/flex.test.ts`
Expected: FAIL, `Failed to resolve import "../../../src/engine/impact/flex"`.

- [ ] **Step 4: Implement**

Create `src/engine/impact/flex.ts`:

```ts
/**
 * The hands' flex (P2b.2b.2b.2b design §3.1): from contact on, in carry mode, each hand applies its feed-forward plus a
 * three-dimensional spring-damper to its point on the intended path. Its stiffness rises linearly with the force the
 * arm applies voluntarily (Perreault, Kirsch and Crago 2004), driven by the feed-forward and never by the spring's own
 * force, so it has no feedback loop. Its damping holds a constant ratio on the arm's endpoint mass (Perreault 2004;
 * Fortineau et al. 2023). The numbers are reference/contact.json's arm values.
 */
import { scale, sub, type Vec3 } from "../math/vec3";
import type { FlexLaw } from "./types";

/** One hand's flex gains: its stiffness k (N/m) and damping c (N·s/m). */
export interface FlexGains {
    readonly stiffness: number;
    readonly damping: number;
}

/** The gains of `law` for a hand whose feed-forward has size `force` (N): k = k₀ + κ·|F_ff|, c = 2·ζ·√(k·m_arm). */
export function flexGains(law: FlexLaw, force: number): FlexGains {
    const stiffness = law.stiffness + law.stiffnessPerForce * force;
    return { stiffness, damping: 2 * law.dampingRatio * Math.sqrt(stiffness * law.endpointMass) };
}

/**
 * One hand's force (N, world frame): F = F_ff − k·(x − x̂) − c·(v − v̂), with `offset` = x − x̂ the grip's position
 * from its intended point and `lag` = v − v̂ its velocity from the intended velocity.
 */
export function flexForce(feedForward: Vec3, gains: FlexGains, offset: Vec3, lag: Vec3): Vec3 {
    return sub(sub(feedForward, scale(offset, gains.stiffness)), scale(lag, gains.damping));
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/impact/flex.test.ts`
Expected: PASS.

- [ ] **Step 6: Run every check**

Run, one per call: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`.
Expected: all pass (978 passed, 1 expected fail, 2 skipped, counting Task 1's test).

- [ ] **Step 7: Commit**

Stage `src/engine/impact/flex.ts`, `src/engine/impact/types.ts` and `tests/engine/impact/flex.test.ts`.

Message: `Add the hands' flex law: stiffness from the voluntary force, a constant damping ratio`

---
### Task 3: The stroke's new inputs

Spec §6. Every new field is carried and validated, and nothing reads it yet. `groundDepth` stays until Task 4.

**Files:**
- Modify: `src/engine/impact/types.ts` (`Hands`, `SwingArc`)
- Modify: `src/engine/impact/track.ts` (`ARM_FLEX`, `PENDULUM_FORCE`)
- Modify: `src/engine/swing/types.ts` (`SwingDrive`, `SwingProfile.body`, `ShotSetup.stroke`)
- Modify: `src/engine/swing/profile.ts` (`DRIVE`, `defaultProfile.body`)
- Modify: `src/engine/swing/buildContact.ts` (`DRIVE_NUMBERS`, `validate`, `handsOf`, `planStroke`'s arc, its doc)
- Modify: `src/engine/impact/simulateImpact.ts` (`validateTrack` and its doc)
- Modify: `scripts/fitStrokeShape.ts` (`caseOf`'s hands)
- Modify: `tests/engine/support/impact.ts` (`TEST_HANDS`, `levelArc`), `tests/engine/support/shot.ts` (`testProfile`)
- Modify: every test whose literal `SwingArc`, `Hands` or `GripState` `npm run check` now flags (at least
  `tests/engine/impact/hands.test.ts`'s `COAST` and `tests/engine/impact/track.test.ts` line 63)
- Test: `tests/engine/swing/buildContact.test.ts`, `tests/engine/impact/simulateImpact.test.ts`

**Interfaces:**
- Consumes: `FlexLaw` (Task 2); `contactReference`'s arm values (Task 1).
- Produces:
  - `Hands`: `+ readonly flex: FlexLaw; + readonly pendulumForce: number` (N).
  - `SwingArc`: `+ readonly pendulumAt: number; + readonly pendulumEffort: number; + readonly handArcRadius: number;
    + readonly handArcLow: number`, each with a doc comment.
  - `SwingDrive`: the same four.
  - `SwingProfile.body`: `+ readonly flex: FlexLaw; + readonly pendulumForce: number`.
  - `ShotSetup.stroke`: `+ readonly pendulumAt?: number; + readonly pendulumEffort?: number`.
  - From `track.ts`: `const ARM_FLEX: FlexLaw` and `const PENDULUM_FORCE: number`, read from the reference.
  - From the test support: `TEST_FLEX: FlexLaw` = `{ stiffness: 200, stiffnessPerForce: 20, dampingRatio: 0.3,
    endpointMass: 0.5 }` and `TEST_PENDULUM_FORCE` = 20 (`tests/engine/support/impact.ts`).

- [ ] **Step 1: Write the failing tests**

In `tests/engine/swing/buildContact.test.ts`, near the existing case that checks a carry drive's `handReach` and
`groundDepth` (about line 197), add:

```ts
    it("carries the pendulum phase's inputs, the hands' arc and the arm's law into the drive (P2b.2b.2b.2b §6)", () => {
        const flex = { stiffness: 300, stiffnessPerForce: 5, dampingRatio: 0.4, endpointMass: 0.6 };
        const profile = testProfile({
            drive: { mode: "carry", handReach: 0.2, pendulumAt: 0.7, pendulumEffort: 0.2, handArcRadius: 1.2 },
            body: { flex, pendulumForce: 25 },
        });
        const preset = (buildContact(shot({}, profile), WORLD).drive as TrackDrive).arc;
        expect([preset.pendulumAt, preset.pendulumEffort, preset.handArcRadius, preset.handArcLow]).toEqual([
            0.7, 0.2, 1.2, 0.5,
        ]);
        const own = (buildContact(shot({ pendulumAt: 0.4, pendulumEffort: 1 }, profile), WORLD).drive as TrackDrive)
            .arc;
        expect([own.pendulumAt, own.pendulumEffort]).toEqual([0.4, 1]);
        const { hands } = buildContact(shot({}, profile), WORLD).drive as TrackDrive;
        expect([hands.flex, hands.pendulumForce]).toEqual([flex, 25]);
    });

    it.each([
        ["stroke.pendulumAt", { pendulumAt: 1.1 }, {}, /stroke\.pendulumAt must lie in \[0, 1\]/],
        ["stroke.pendulumEffort", { pendulumEffort: -0.1 }, {}, /stroke\.pendulumEffort must lie in \[0, 1\]/],
        ["the preset's pendulumAt", {}, { pendulumAt: Number.NaN }, /pendulumAt must be finite/],
        ["the preset's handArcLow", {}, { handArcLow: 2 }, /handArcLow must lie in \[0, 1\]/],
        [
            "an arc no longer than the push",
            { handReach: 0.5 },
            { handArcRadius: 0.5 },
            /handArcRadius must exceed the push length/,
        ],
    ] as const)("rejects %s", (_name, stroke, drive, message) => {
        expect(() => buildContact(shot(stroke, testProfile({ drive })), WORLD)).toThrow(message);
    });
```

`shot`, `testProfile` and `WORLD` are the file's existing helpers. If `shot`'s first argument does not take stroke
fields, use the file's own helper for a stroke override, as its `handReach` cases do.

In `tests/engine/impact/simulateImpact.test.ts`, in the table that holds "a negative ground depth" (about line 475),
add rows in the same shape:

```ts
        ["a pendulumAt above 1", withArc({ pendulumAt: 1.5 }), /arc\.pendulumAt must lie in \[0, 1\]/],
        ["a negative pendulumEffort", withArc({ pendulumEffort: -1 }), /arc\.pendulumEffort must lie in \[0, 1\]/],
        ["a handArcLow above 1", withArc({ handArcLow: 1.5 }), /arc\.handArcLow must lie in \[0, 1\]/],
        [
            "an arc no longer than the push",
            withArc({ mode: "carry", handReach: 2, handArcRadius: 2 }),
            /arc\.handArcRadius must exceed arc\.handReach/,
        ],
        [
            "a flex with no stiffness",
            withHands({ flex: { ...TEST_FLEX, stiffness: 0 } }),
            /hands\.flex\.stiffness must be positive/,
        ],
        [
            "a flex damping ratio above 1",
            withHands({ flex: { ...TEST_FLEX, dampingRatio: 1.5 } }),
            /hands\.flex\.dampingRatio must lie in \(0, 1\]/,
        ],
        ["no pendulum force", withHands({ pendulumForce: 0 }), /hands\.pendulumForce must be positive/],
```

Import `TEST_FLEX` from `../support/impact`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/swing/buildContact.test.ts tests/engine/impact/simulateImpact.test.ts`
Expected: FAIL. The arc's new fields are `undefined`, and none of the new rows throws.

- [ ] **Step 3: Add the fields**

`src/engine/impact/types.ts`, in `Hands`, after `guideEffort`:

```ts
    /** Carry mode from contact (P2b.2b.2b.2b design §3.1): each hand's flex. */
    readonly flex: FlexLaw;
    /**
     * F_pendulum (N, design §4.2): the largest forward push the bottom hand gives perpendicular to the shaft in the
     * pendulum phase, by wrist and forearm.
     */
    readonly pendulumForce: number;
```

Extend `Hands`' doc comment: "… In carry mode from contact each hand flexes by `flex`, and the bottom hand's push in
the pendulum phase is at most `pendulumForce` (P2b.2b.2b.2b design §3, §4.2)." `FlexLaw` must be declared before
`Hands`. Move it up if needed.

In `SwingArc`, after `handReach`:

```ts
    /**
     * Carry only (P2b.2b.2b.2b design §4.2): the pendulum phase starts once the intended path has travelled
     * `pendulumAt` (in [0, 1]) of the push length `handReach`; the bottom hand then pushes with `pendulumEffort` (in
     * [0, 1]) of the hands' pendulumForce until the shaft passes vertical.
     */
    readonly pendulumAt: number;
    readonly pendulumEffort: number;
    /**
     * Carry only (design §4.1): the hands' arc, a circle of radius `handArcRadius` (m, above the push length) in the
     * swing plane, lowest `handArcLow` (in [0, 1]) of the push length ahead of the hands at contact.
     */
    readonly handArcRadius: number;
    readonly handArcLow: number;
```

`src/engine/swing/types.ts`, in `SwingDrive`, after `guideEffort`:

```ts
    /** Carry mode's pendulum phase (P2b.2b.2b.2b design §4.2): its start, a fraction of the push, and its effort. */
    readonly pendulumAt: number;
    readonly pendulumEffort: number;
    /** Carry mode's hands' arc (design §4.1, §6): its radius (m) and where it is lowest, a fraction of the push. */
    readonly handArcRadius: number;
    readonly handArcLow: number;
```

Extend `SwingDrive`'s doc: "… In carry mode `handReach` is the push's length. The pendulum phase starts at
`pendulumAt` of it, its effort `pendulumEffort`, and the hands travel their arc, `handArcRadius` and `handArcLow`
(P2b.2b.2b.2b design §4, §6). Swing mode carries these four and never reads them."

In `SwingProfile.body`:

```ts
    /** The player's body: the arm mass at the top grip (kg), the reach slack (m), the arm's flex and pendulum push. */
    readonly body: {
        readonly armMass: number;
        readonly reachSlack: number;
        readonly flex: FlexLaw;
        readonly pendulumForce: number;
    };
```

Import `FlexLaw` as a type from `../impact/types`.

In `ShotSetup.stroke`, after `guideEffort?`:

```ts
        /** Carry mode: the pendulum phase's start, a fraction of the push in [0, 1]; absent: the preset's. */
        readonly pendulumAt?: number;
        /** Carry mode: the bottom hand's push in the pendulum phase, in [0, 1]; absent: the preset's. */
        readonly pendulumEffort?: number;
```

- [ ] **Step 4: The reference constants and the presets**

`src/engine/impact/track.ts`, after `HAND_COUPLING`:

```ts
/** The arm's flex (P2b.2b.2b.2b design §3.1, §3.2), reference/contact.json's measured arm values. */
export const ARM_FLEX: FlexLaw = {
    stiffness: contactReference.armStiffness.value,
    stiffnessPerForce: contactReference.armStiffnessPerForce.value,
    dampingRatio: contactReference.armDampingRatio.value,
    endpointMass: contactReference.armEndpointMass.value,
};

/** F_pendulum (N, design §4.2): the bottom hand's largest push in the pendulum phase (reference/contact.json). */
export const PENDULUM_FORCE = contactReference.pendulumForce.value;
```

Add `FlexLaw` to the type import from `./types`.

`src/engine/swing/profile.ts`:

- Import `ARM_FLEX` and `PENDULUM_FORCE` from `../impact/track`.
- Add to `defaultProfile.body`: `flex: ARM_FLEX, pendulumForce: PENDULUM_FORCE`.
- Add a line to the header's "Body" item: "the arm's flex and pendulum push (P2b.2b.2b.2b), measured".
- Add to every `DRIVE` entry, after `guideEffort`:

```ts
        pendulumAt: 0.8,
        pendulumEffort: 0,
        handArcRadius: 1.5,
        handArcLow: 0.5,
```

- Above `DRIVE`, add:

```ts
// The rolls' pendulum phase and hands' arc (P2b.2b.2b.2b design §6): presets, not fits. pendulumAt 0.8 is where the
// reach used to begin braking, and pendulumEffort 0 lets the mallet swing. The hands' arc is a placeholder, unsourced,
// as handAngle is: a 1.5 m radius, about a standing player's shoulder height (the user's "origin much higher in the
// sky"), lowest halfway along the push (the middle of the user's "partway through the push … or at its end"). The
// swing presets carry the same four values for the type's sake and never read them.
```

- [ ] **Step 5: Plumb and validate in the swing model**

`src/engine/swing/buildContact.ts`:

- Append `"pendulumAt"`, `"pendulumEffort"`, `"handArcRadius"` and `"handArcLow"` to `DRIVE_NUMBERS`.
- In `validate`, add `["stroke.pendulumAt", stroke.pendulumAt]` and `["stroke.pendulumEffort", stroke.pendulumEffort]`
  to the optional finite numbers. After the `guideEffort` checks, add:

```ts
    unit(push.pendulumAt, `profile.drive.${type}.pendulumAt`);
    unit(push.pendulumEffort, `profile.drive.${type}.pendulumEffort`);
    unit(push.handArcLow, `profile.drive.${type}.handArcLow`);
    if (stroke.pendulumAt !== undefined) {
        unit(stroke.pendulumAt, "stroke.pendulumAt");
    }
    if (stroke.pendulumEffort !== undefined) {
        unit(stroke.pendulumEffort, "stroke.pendulumEffort");
    }
    const pushLength = stroke.handReach ?? push.handReach;
    if (!(push.handArcRadius > pushLength)) {
        fail(
            `profile.drive.${type}.handArcRadius must exceed the push length ${pushLength} m, so that the hands' arc ` +
                `is defined over the whole push (got ${push.handArcRadius})`,
        );
    }
    const { flex } = body;
    for (const [key, value] of Object.entries(flex)) {
        finiteNumber(value, `profile.body.flex.${key}`);
        positive(value, `profile.body.flex.${key}`);
    }
    if (!(flex.dampingRatio <= 1)) {
        fail(`profile.body.flex.dampingRatio must lie in (0, 1] (got ${flex.dampingRatio})`);
    }
    finiteNumber(body.pendulumForce, "profile.body.pendulumForce");
    positive(body.pendulumForce, "profile.body.pendulumForce");
```

- `handsOf` adds `flex: profile.body.flex` and `pendulumForce: profile.body.pendulumForce`.
- `planStroke`'s arc adds, after `handReach`:

```ts
        pendulumAt: stroke.pendulumAt ?? push.pendulumAt,
        pendulumEffort: stroke.pendulumEffort ?? push.pendulumEffort,
        handArcRadius: push.handArcRadius,
        handArcLow: push.handArcLow,
```

- `planStroke`'s doc list gains: "the preset's or the shot's pendulumAt or pendulumEffort outside [0, 1]; handArcLow
  outside [0, 1]; handArcRadius not above the push length; a flex value not positive, or a flex damping ratio above
  1; pendulumForce not positive (P2b.2b.2b.2b design §6)".

`src/engine/impact/simulateImpact.ts`, `validateTrack`, after the `guideEffort` check:

```ts
    for (const [name, value] of [
        ["arc.pendulumAt", arc.pendulumAt],
        ["arc.pendulumEffort", arc.pendulumEffort],
        ["arc.handArcLow", arc.handArcLow],
    ] as const) {
        finiteNumber(value, name);
        if (!(value >= 0 && value <= 1)) {
            fail(`${name} must lie in [0, 1] (got ${value})`);
        }
    }
    finiteNumber(arc.handArcRadius, "arc.handArcRadius");
    if (!(arc.handArcRadius > arc.handReach)) {
        fail(`arc.handArcRadius must exceed arc.handReach (got ${arc.handArcRadius} and ${arc.handReach})`);
    }
    for (const [key, value] of Object.entries(hands.flex)) {
        finiteNumber(value, `hands.flex.${key}`);
        positive(value, `hands.flex.${key}`);
    }
    if (!(hands.flex.dampingRatio <= 1)) {
        fail(`hands.flex.dampingRatio must lie in (0, 1] (got ${hands.flex.dampingRatio})`);
    }
    finiteNumber(hands.pendulumForce, "hands.pendulumForce");
    positive(hands.pendulumForce, "hands.pendulumForce");
```

Extend `validateTrack`'s doc with the same list. The radius check applies in both modes, because swing mode's
`handReach` is a real reach. The swing presets' 1.5 m exceeds their reach of 0, and `levelArc`'s 10 m reach gets an
11 m radius below.

- [ ] **Step 6: The test support and the fit script**

`tests/engine/support/impact.ts`:

```ts
/** A plausible, unsourced arm (P2b.2b.2b.2b design §3.1): k₀ 200 N/m, κ 20 /m, ζ 0.3 on 0.5 kg. */
export const TEST_FLEX: FlexLaw = { stiffness: 200, stiffnessPerForce: 20, dampingRatio: 0.3, endpointMass: 0.5 };

/** A plausible, unsourced pendulum push (N). */
export const TEST_PENDULUM_FORCE = 20;
```

- `TEST_HANDS` gains `flex: TEST_FLEX, pendulumForce: TEST_PENDULUM_FORCE`. Import `FlexLaw` as a type.
- `levelArc`'s defaults gain `pendulumAt: 0.8, pendulumEffort: 0, handArcRadius: 11, handArcLow: 0.5`. The 11 m
  radius exceeds the 10 m reach, and its doc says so.

`tests/engine/support/shot.ts`, `testProfile`:

- The drive's defaults gain `pendulumAt: 0.8, pendulumEffort: 0, handArcRadius: 1.5, handArcLow: 0.5`.
- The body becomes `{ armMass: 0, reachSlack: 0.03, flex: TEST_FLEX, pendulumForce: TEST_PENDULUM_FORCE, ...o.body }`.
- Import both from `./impact`. Extend the doc comment.

`scripts/fitStrokeShape.ts`, `caseOf`'s hands: add `flex: defaultProfile.body.flex` and
`pendulumForce: defaultProfile.body.pendulumForce`.

Run: `npm run check`
Fix each literal `SwingArc` or `Hands` it reports in a test by adding the new fields with `levelArc`'s defaults and
TEST_HANDS' values: `hands.test.ts`'s `COAST`, `track.test.ts`'s arc near line 63, and any other it names.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/swing/buildContact.test.ts tests/engine/impact/simulateImpact.test.ts`
Expected: PASS.

- [ ] **Step 8: Run every check**

Run, one per call: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`.
Expected: all pass. Nothing reads the new fields, so no figure moves.

- [ ] **Step 9: Commit**

Wait for the baseline runs: `pgrep -fl tsx` prints none of them, and each `<temp>/baseline/*.txt` is non-empty.

Stage every file this task changed, by path.

Message: `Carry the pendulum phase, the hands' arc and the arm's law into the stroke`

---
### Task 4: The hands' arc

Spec §4.1 (the arc, the downswing's arrival, the push length, the removals in carry mode), §2.

The carry downswing ends tangent to the arc, and after contact the planned path follows it and stops at the push
length. The old velocity-only hands still carry the mallet: Task 5 replaces them.

**Files:**
- Modify: `src/engine/impact/types.ts` (`Downswing.tangent`; `SwingArc.groundDepth` deleted)
- Modify: `src/engine/swing/downswing.ts` (`DownswingInput.arrival`, the carry Hermite, the header)
- Modify: `src/engine/impact/track.ts` (`downswingHands`, `Push`, `travelTime`, `carryPivot`, `pivotAt`,
  `prepareTrack`, `PathPoint.theta`, the header)
- Modify: `src/engine/impact/integrate.ts` (the interim carry finish)
- Modify: `src/engine/impact/simulateImpact.ts` (`validateDownswing`; `groundDepth`'s check deleted)
- Modify: `src/engine/swing/buildContact.ts` (`arcArrival`, `StrokeChoice.arrival`, `downswingOf`, `downswingInput`;
  `groundDepth` deleted)
- Modify: `src/engine/swing/types.ts`, `src/engine/swing/profile.ts` (`groundDepth` deleted)
- Modify: `scripts/fitStrokeShape.ts` (the arrival), `reference/swing.json` (re-fitted)
- Modify: `scripts/strokeProbe.ts`, `scripts/swingProbe.ts` (carry has no reach)
- Modify: `tests/engine/support/impact.ts` (`levelArc`, `mirrorDrive`), `tests/engine/support/shot.ts`
- Test: `tests/engine/impact/track.test.ts`, `tests/engine/swing/downswing.test.ts`,
  `tests/engine/swing/buildContact.test.ts`, `tests/engine/impact/hands.test.ts`,
  `tests/engine/impact/followThrough.test.ts`

**Interfaces:**
- Consumes: Task 3's `SwingArc` fields.
- Produces:
  - `Downswing`: `+ readonly tangent: Vec3`, the Hermite end term T (vertical; `ZERO` in swing mode), with
    P(σ) = P_b + Δ_h·σ² + Δ_z·(3σ² − 2σ³) + T·(σ³ − σ²).
  - `DownswingInput`: `+ readonly arrival: number`, the arc's slope dz/ds at contact (≤ 0; 0 arrives level).
  - `StrokeChoice`: `+ readonly arrival: number`.
  - `buildContact.ts`: `function arcArrival(radius: number, low: number, push: number): number`, which returns
    −s_low/√(ρ_h² − s_low²) with s_low = low·push.
  - `track.ts`:
    - `interface Push { readonly start: number; readonly origin: Vec3; readonly end: number | null; readonly
      pendulum: number | null; readonly low: number; readonly level: number }`
    - `PreparedTrack.push: Push | null` (null in swing mode); in carry mode `PreparedTrack.reach` is null.
    - `PathPoint.theta: number`.

- [ ] **Step 1: Write the failing tests**

`tests/engine/swing/downswing.test.ts`, near "evaluates carry mode in closed form", add:

```ts
    it("ends the carry hands' path tangent to the hands' arc, descending at the arrival slope", () => {
        // P2b.2b.2b.2b design §4.1: the vertical term is the cubic Hermite with the same ends and the arc's slope at
        // contact, so the hands arrive moving down along the arc.
        const arrival = -Math.tan(Math.asin(0.1));
        const { downswing, handsVelocity } = planDownswing({ ...CARRY_INPUT, arrival });
        const at = downswingHands(downswing, 0, downswingAt(downswing, 0));
        const along = Math.hypot(at.V.x, at.V.y);
        expect(at.V.z / along).toBeCloseTo(arrival, 12);
        expect(handsVelocity.z).toBeCloseTo(at.V.z, 12);
        expect(dist(at.P, CARRY_INPUT.pivot)).toBeLessThan(1e-12);
        const top = downswingHands(downswing, downswing.release, downswingAt(downswing, downswing.release));
        expect(length(top.V)).toBe(0);
    });

    it("leaves swing mode's hands as they were: no tangent", () => {
        const { downswing } = planDownswing({ ...SWING_INPUT, arrival: -0.5 });
        expect(downswing.tangent).toEqual(vec3(0, 0, 0));
    });
```

`CARRY_INPUT` and `SWING_INPUT` are the file's carry-mode and swing-mode `DownswingInput`s; if it names them otherwise,
use its names. Give both `arrival: 0` where they are declared. Import `length` from vec3 and declare
`const dist = (a: Vec3, b: Vec3): number => length(sub(a, b));` if the file has none.

`tests/engine/impact/track.test.ts`. Replace `describe("the hands' reach", …)`'s carry case ("in carry mode ends the
head's lowest point groundDepth below the turf …") with a new `describe` after it:

```ts
describe("the hands' arc after contact (P2b.2b.2b.2b design §4.1)", () => {
    const AIM = vec3(1, 0, 0);
    /** A carry from contact at 2 m/s along aim, the hands arriving on a 1.5 m arc lowest halfway along a 0.3 m push. */
    const arrival = -0.15 / Math.sqrt(1.5 * 1.5 - 0.15 * 0.15);
    const ARC = levelArc(vec3(0, 0, 0.5), {
        mode: "carry",
        pivotVelocity: vec3(2, 0, 2 * arrival),
        handReach: 0.3,
        handArcRadius: 1.5,
        handArcLow: 0.5,
        pendulumAt: 0.8,
    });
    const track = prepareTrack(trackDrive(ARC), TEST_HEAD, STANDARD_GRAVITY);
    const push = track.push as Push;
    const start = handsAt(track, 0).position;

    it("has no reach in carry mode, and times the push and the pendulum phase along aim", () => {
        expect(track.reach).toBeNull();
        expect(push.end as number).toBeCloseTo(0.3 / 2, 12);
        expect(push.pendulum as number).toBeCloseTo(0.24 / 2, 12);
        expect(dot(sub(handsAt(track, push.end as number).position, start), AIM)).toBeCloseTo(0.3, 12);
    });

    it("descends at contact at asin(s_low/ρ_h), is lowest at s_low and back at contact height at its end", () => {
        const v = handsAt(track, 1e-9).velocity;
        expect(Math.atan2(-v.z, v.x)).toBeCloseTo(Math.asin(0.15 / 1.5), 9);
        const low = handsAt(track, 0.15 / 2).position;
        expect(low.z - start.z).toBeCloseTo(-(1.5 - Math.sqrt(1.5 * 1.5 - 0.15 * 0.15)), 12);
        for (const t of [0.02, 0.05, 0.1, 0.13]) {
            expect(handsAt(track, t).position.z).toBeGreaterThanOrEqual(low.z);
        }
        expect(handsAt(track, push.end as number).position.z).toBeCloseTo(start.z, 12);
    });

    it("stops the intended path at once at the push length: no brake, no descent", () => {
        for (const t of [push.end as number, 0.2, 0.5]) {
            const hands = handsAt(track, t);
            expect(hands.velocity).toEqual(vec3(0, 0, 0));
            expect(dot(sub(hands.position, start), AIM)).toBeCloseTo(0.3, 12);
        }
    });

    it("is continuous in position at contact, and in velocity for an arc that arrives on it", () => {
        const before = handsAt(track, -1e-9);
        const after = handsAt(track, 1e-9);
        expect(length(sub(before.position, after.position))).toBeLessThan(1e-8);
        expect(length(sub(before.velocity, after.velocity))).toBeLessThan(1e-6);
    });

    it("starts the pendulum phase at contact for a push of length 0", () => {
        // Review focus 1: the arc's low point is at contact, so the hands arrive level and rest there.
        const none = prepareTrack(trackDrive({ ...ARC, handReach: 0 }), TEST_HEAD, STANDARD_GRAVITY);
        const nonePush = none.push as Push;
        expect([nonePush.end, nonePush.pendulum]).toEqual([0, 0]);
        expect(handsAt(none, 0.1).velocity).toEqual(vec3(0, 0, 0));
        expect(Number.isFinite(handsAt(none, 0.1).position.z)).toBe(true);
    });

    it("never starts the push's end or the pendulum phase for hands that never travel", () => {
        const idle = { ...ARC, pivotVelocity: vec3(0, 0, 0) };
        const never = prepareTrack(trackDrive(idle), TEST_HEAD, STANDARD_GRAVITY).push as Push;
        expect([never.end, never.pendulum]).toEqual([null, null]);
    });

    it("leaves swing mode's path as it was: a reach and no push", () => {
        const swing = prepareTrack(trackDrive({ ...ARC, mode: "swing" }), TEST_HEAD, STANDARD_GRAVITY);
        expect(swing.push).toBeNull();
        expect(swing.reach).not.toBeNull();
    });
});
```

Import `handsAt` and `type Push` from track.ts, and `dot`, `length` and `sub` from vec3, if the file lacks them. The
case before contact uses `handsAt(track, -1e-9)`: `levelArc`'s contactAt is 0, so a time before it reads
`beforeHands`, P₀ + V₀·t.

`tests/engine/swing/buildContact.test.ts`, add:

```ts
    it("plans a roll's hands arriving on their arc: the path continuous through contact (P2b.2b.2b.2b §4.1)", () => {
        for (const type of ["half-roll", "full-roll", "pass-roll"] as const) {
            const setup = canonicalSetup(type, { world: WORLD });
            const drive = buildContact(setup, WORLD).drive as TrackDrive;
            const track = prepareTrack(drive, buildContact(setup, WORLD).head, WORLD.gravity);
            const { arc } = drive;
            const before = handsAt(track, arc.contactAt - 1e-9);
            const after = handsAt(track, arc.contactAt + 1e-9);
            expect(length(sub(before.velocity, after.velocity)), type).toBeLessThan(1e-6);
            const v = after.velocity;
            const slope = v.z / Math.hypot(v.x, v.y);
            expect(slope, type).toBeCloseTo(arcArrival(arc.handArcRadius, arc.handArcLow, arc.handReach), 9);
        }
    });

    it("gives the arc's slope at contact: level for no push, −s_low/√(ρ² − s_low²) otherwise", () => {
        expect(arcArrival(1.5, 0.5, 0)).toBe(0);
        expect(arcArrival(1.5, 0.5, 0.3)).toBeCloseTo(-0.15 / Math.sqrt(1.5 * 1.5 - 0.15 * 0.15), 15);
    });
```

`arcArrival(1.5, 0.5, 0)` is `(0 − 0)/1.5`, which is −0. If `toBe(0)` fails on −0, use `toBeCloseTo(0, 15)`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/swing/downswing.test.ts tests/engine/impact/track.test.ts`
Run: `npx vitest run tests/engine/swing/buildContact.test.ts`
Expected: FAIL. `downswing.tangent`, `track.push` and `arcArrival` are undefined, and the hands arrive level.

- [ ] **Step 3: The downswing ends on the arc**

`src/engine/impact/types.ts`, in `Downswing`, after `drop`:

```ts
    /**
     * Carry mode's Hermite end term T (m, vertical; P2b.2b.2b.2b design §4.1): the hands' path gains T·(σ³ − σ²), so
     * its slope at contact is 2·Δ_h + T and it arrives on the hands' arc. ZERO in swing mode, whose hands arrive level.
     */
    readonly tangent: Vec3;
```

Update `Downswing`'s doc: "… P(σ) = P_b + Δ_h·σ² + Δ_z·(3σ² − 2σ³) + T·(σ³ − σ²) …". Delete `SwingArc.groundDepth` and
its comment.

`src/engine/swing/downswing.ts`:

- `DownswingInput` gains, after `intensity`:

```ts
    /** The hands' arc's slope dz/ds at contact (≤ 0; P2b.2b.2b.2b design §4.1). Carry mode only; 0 arrives level. */
    readonly arrival: number;
```

- In the carry branch, replace the `downswing` and the return with:

```ts
        // P2b.2b.2b.2b design §4.1: the vertical Hermite's end slope dP_z/dσ = 2·|Δ_h|·arrival, so that the hands'
        // velocity at contact, (2·Δ_h + T)/tempo, runs along the arc's tangent.
        const tangent = vec3(0, 0, 2 * Math.sqrt(dot(across, across)) * input.arrival);
        const downswing: Downswing = {
            release: 0 - tempo,
            thetaTop,
            span,
            handsTop,
            across,
            drop,
            tangent,
            tempo,
            theta: [],
            omega: [],
            alpha: [],
        };
        return {
            downswing,
            omega: (2 * span) / tempo,
            handsVelocity: scale(add(scale(across, 2), tangent), 1 / tempo),
        };
```

  `scale(across, 2/tempo)` was the old velocity. With T = 0 the new form rounds differently, but only carry reaches
  it, and the rolls move in this task anyway.
- In the swing branch's `downswing`, add `tangent: ZERO`.
- Header: "- The hands (§3.3) follow P(σ) = P_b + Δ_h·σ² + Δ_z·(3σ² − 2σ³), starting from rest; in swing mode they
  arrive level, in carry mode on the hands' arc, through the Hermite term T·(σ³ − σ²) (P2b.2b.2b.2b design §4.1)."

`src/engine/impact/track.ts`, `downswingHands`. Branch on the mode, so swing mode gains no arithmetic:

```ts
    const slope = add(scale(down.across, 2 * sigma), scale(down.drop, 6 * sigma - 6 * sigma * sigma));
    const bend = add(scale(down.across, 2), scale(down.drop, 6 - 12 * sigma));
    const rise = (3 - 2 * sigma) * sigma * sigma;
    const P = add(add(down.handsTop, scale(down.across, sigma * sigma)), scale(down.drop, rise));
    if (down.tempo === null) {
        return { P, V: scale(slope, rate), A: add(scale(bend, rate * rate), scale(slope, accel)) };
    }
    // Carry mode (P2b.2b.2b.2b design §4.1): the Hermite term T·(σ³ − σ²) brings the hands onto the arc.
    const T = down.tangent;
    const carrySlope = add(slope, scale(T, 3 * sigma * sigma - 2 * sigma));
    const carryBend = add(bend, scale(T, 6 * sigma - 2));
    return {
        P: add(P, scale(T, sigma * sigma * sigma - sigma * sigma)),
        V: scale(carrySlope, rate),
        A: add(scale(carryBend, rate * rate), scale(carrySlope, accel)),
    };
```

The swing branch's expressions keep their operand order (P, then V, then A) exactly as before.

`src/engine/impact/simulateImpact.ts`, `validateDownswing`, after the `drop` check:

```ts
    finite(down.tangent, "arc.downswing.tangent");
    if (!(down.tangent.x === 0 && down.tangent.y === 0)) {
        fail("arc.downswing.tangent must be vertical");
    }
```

In its swing-mode branch, also fail unless `down.tangent.z === 0`:
`"arc.downswing.tangent must be zero in swing mode"`. Extend its doc. Delete `friction(arc.groundDepth, …)` and "and
ground depth" from `validateTrack`'s doc.

`tests/engine/support/impact.ts`: in `mirrorDrive`, add `tangent: mirrorVec(down.tangent)` beside `drop`. Delete
`groundDepth` from `levelArc`. Then run `npm run check` and add `tangent: ZERO` (or `vec3(0, 0, 0)`) to every literal
`Downswing` it reports in the tests.

- [ ] **Step 4: The arrival in the swing model**

`src/engine/swing/buildContact.ts`:

```ts
/**
 * The hands' arc's slope dz/ds at contact (P2b.2b.2b.2b design §4.1): the arc of radius `radius` (m) is lowest
 * `low`·`push` ahead of the hands, so at contact it descends at −s_low/√(ρ_h² − s_low²). 0 (level) for no push.
 */
export function arcArrival(radius: number, low: number, push: number): number {
    const s = low * push;
    return (0 - s) / Math.sqrt(radius * radius - s * s);
}
```

- `StrokeChoice` gains `readonly arrival: number;`, with its doc: "and, in carry mode, the hands' arc's slope at
  contact (arcArrival)".
- `downswingInput` passes `arrival: choice.arrival`.
- `downswingOf`'s choice gains:

```ts
        arrival:
            push.mode === "carry"
                ? arcArrival(push.handArcRadius, push.handArcLow, stroke.handReach ?? push.handReach)
                : 0,
```

  with `const push = profile.drive[stroke.type];` declared above it.
- Delete `"groundDepth"` from `DRIVE_NUMBERS`, the `groundDepth` validation, `groundDepth: push.groundDepth` from the
  arc, and "groundDepth < 0;" from `planStroke`'s doc.

`src/engine/swing/types.ts`: delete `groundDepth` from `SwingDrive` and the doc's sentence "In carry mode the head's
lowest point ends `groundDepth` (m) below the turf." `src/engine/swing/profile.ts`: delete every `groundDepth` line.
Reword the rolls' comments: "the head ending N mm below the turf" becomes "the push N m". Keep the `handReach`
numbers. `tests/engine/support/shot.ts`: delete `groundDepth` from `testProfile`'s drive.

`scripts/fitStrokeShape.ts`: `Case` gains `readonly arrival: number`. `caseOf` sets it:

```ts
        arrival:
            defaultProfile.drive[type].mode === "carry"
                ? arcArrival(
                      defaultProfile.drive[type].handArcRadius,
                      defaultProfile.drive[type].handArcLow,
                      defaultProfile.drive[type].handReach,
                  )
                : 0,
```

`plan` passes it: `const choice = { mode: c.mode, shape, backswing, intensity, arrival: c.arrival };`. Import
`arcArrival` from `../src/engine/swing/buildContact`.

- [ ] **Step 5: The arc after contact**

`src/engine/impact/track.ts`. After `Reach`, add:

```ts
/**
 * Carry mode's push (P2b.2b.2b.2b design §4.1, §4.2): from `start` (contactAt), the planned pivot at `origin`, the
 * intended path travels along aim at the plan's pace on the hands' arc. It reaches pendulumAt·handReach at
 * `pendulum` and the push length handReach at `end`, where it stops at once (s from t = 0; null where the plan does
 * not travel that far within REACH_SEARCH). `low` is s_low = handArcLow·handReach (m) and `level` √(ρ_h² − s_low²)
 * (m), the arc's centre's height above the hands at contact.
 */
export interface Push {
    readonly start: number;
    readonly origin: Vec3;
    readonly end: number | null;
    readonly pendulum: number | null;
    readonly low: number;
    readonly level: number;
}
```

In `PreparedTrack`, after `reach`:

```ts
    /** Carry mode's push (P2b.2b.2b.2b design §4.1); null in swing mode. In carry mode `reach` is null. */
    readonly push: Push | null;
```

After `computeReach`, add:

```ts
/**
 * When the planned pivot has travelled `distance` (m) along aim from contactAt (P2b.2b.2b.2b design §4.1, §4.2): by
 * bisection, as computeReach (the plans travel monotonically); contactAt for a distance of 0 or less; null if the plan
 * does not travel that far within REACH_SEARCH.
 */
function travelTime(track: PreparedTrack, distance: number): number | null {
    const { aim, contactAt } = track.arc;
    if (!(distance > 0)) {
        return contactAt;
    }
    const p0 = planPivot(track, contactAt).P;
    const along = (t: number): number => dot(sub(planPivot(track, t).P, p0), aim);
    let lo = contactAt;
    let hi = contactAt + REACH_SEARCH;
    if (along(hi) < distance) {
        return null;
    }
    for (let i = 0; i < REACH_BISECTIONS; i++) {
        const mid = (lo + hi) / 2;
        if (along(mid) < distance) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    return hi;
}

/** Carry mode's push for `track` (design §4.1, §4.2). */
function computePush(track: PreparedTrack): Push {
    const { arc } = track;
    const low = arc.handArcLow * arc.handReach;
    return {
        start: arc.contactAt,
        origin: planPivot(track, arc.contactAt).P,
        end: travelTime(track, arc.handReach),
        pendulum: travelTime(track, arc.pendulumAt * arc.handReach),
        low,
        level: Math.sqrt(arc.handArcRadius * arc.handArcRadius - low * low),
    };
}

/**
 * Carry mode's planned pivot after contactAt (design §4.1): s(t), the plan's travel along aim from the push's origin,
 * until the push's end, then the push length at rest; its height on the hands' arc, z(s) = level − √(ρ_h² −
 * (s − s_low)²) above the origin, with ż = z′·ṡ and z̈ = z″·ṡ² + z′·s̈, z′ = u/√(ρ_h² − u²) and z″ = ρ_h²/(ρ_h² −
 * u²)^{3/2}, u = s − s_low. A plan that runs past the push length without a found end (beyond REACH_SEARCH) also
 * rests there.
 */
function carryPivot(track: PreparedTrack, push: Push, t: number): Motion {
    const { aim, handReach, handArcRadius } = track.arc;
    const plan = planPivot(track, t);
    const raw = dot(sub(plan.P, push.origin), aim);
    const stopped = (push.end !== null && t >= push.end) || raw >= handReach;
    const s = stopped ? handReach : raw;
    const ds = stopped ? 0 : dot(plan.V, aim);
    const dds = stopped ? 0 : dot(plan.A, aim);
    const u = s - push.low;
    const root = Math.sqrt(handArcRadius * handArcRadius - u * u);
    const slope = u / root;
    const curve = (handArcRadius * handArcRadius) / (root * root * root);
    return {
        P: add(add(push.origin, scale(aim, s)), vec3(0, 0, push.level - root)),
        V: add(scale(aim, ds), vec3(0, 0, slope * ds)),
        A: add(scale(aim, dds), vec3(0, 0, curve * ds * ds + slope * dds)),
    };
}
```

`pivotAt` starts with:

```ts
    const { push } = track;
    if (push !== null && t > push.start) {
        return carryPivot(track, push, t);
    }
```

Change its doc: "The pivot at time t: in carry mode after contactAt on the hands' arc (carryPivot); otherwise with the
reach. After t1 the along-aim component eases to rest …". Delete the `descent` lowering from `pivotAt`, and the
`descent` field from `Reach` and from `computeReach`'s returns. Only carry mode set it.

`prepareTrack`:

- `plain` gains `push: null`.
- Replace everything from `const reach = computeReach(plain);` with:

```ts
    if (arc.mode === "carry") {
        return { ...plain, push: computePush(plain) };
    }
    const reached: PreparedTrack = { ...plain, reach: computeReach(plain) };
    return withFree ? { ...reached, free: computeFree(reached, head, gravity) } : reached;
```

- The doc: "Prepares `drive` … the windows' end states; in swing mode the reach and the free pendulum's table; in
  carry mode the push (P2b.2b.2b.2b design §4.1); the swung body and the gains. …". Delete the descent's sentence.
- Remove the `headLowestPoint` import if nothing else uses it.

`PathPoint` gains `/** The pendulum's θ (rad) at this instant. */ readonly theta: number;`, and `pathAt` returns
`theta`.

Header: replace "and in carry mode its descent at the reach's end, lower the pivot from rest to rest" with "lowers the
pivot from rest to rest. In carry mode after contact the pivot travels the hands' arc and stops at the push length
(P2b.2b.2b.2b design §4.1)".

- [ ] **Step 6: The interim carry finish**

`src/engine/impact/integrate.ts`, `finished`'s carry case:

```ts
        case "carry":
            // At rest once the push has ended (never, where it does not end).
            return (
                plan.push !== null &&
                plan.push.end !== null &&
                t >= plan.push.end &&
                length(state.velocity) < FINISH_SPEED
            );
```

Update `finished`'s doc to match. Task 5 replaces this case with the apex after the pendulum phase.

`scripts/strokeProbe.ts`, `asPlayed`: replace `prepareTrack(drive, head, WORLD.gravity).reach` with
`prepareTrack(drive, head, WORLD.gravity).push`. Read `push.pendulum` where it read `reach.t1`, and `push.end` where it
read `reach.tStop`. Print "the hands' push reaches its pendulum point at … ms and ends at … ms", and stop with "the
push does not end" when either is null. Task 6 rewrites the section. `scripts/swingProbe.ts` line ~812: in carry use
`track.push?.end ?? Infinity` in place of `track.reach?.tStop ?? Infinity`, and print "after the push".

- [ ] **Step 7: Run the new tests**

Run: `npx vitest run tests/engine/swing/downswing.test.ts tests/engine/impact/track.test.ts`
Run: `npx vitest run tests/engine/swing/buildContact.test.ts`
Expected: PASS.

- [ ] **Step 8: Re-fit the rolls' backswings**

The hands now arrive descending, so the rolls' planned speed at a given backswing changes.

Run: `npx --yes tsx scripts/fitStrokeShape.ts > <temp>/after/swing.json 2> <temp>/after/fit-summary.txt`
Run: `cp <temp>/after/swing.json reference/swing.json`
Run: `npx prettier --write reference/swing.json`
Run: `git diff --stat reference/swing.json`

Check with `git diff reference/swing.json`. Only the three rolls' derived entries may move (`defaultBackswing`,
`defaultIntensity`, `defaultSpeed` and the tempo entries' notes if their h0 moved). The four swing presets' entries
must be unchanged. If a swing preset moved, stop: swing mode has gained arithmetic.

Keep `<temp>/after/fit-summary.txt` for Task 9.

- [ ] **Step 9: Migrate the tests that read the old carry**

Run: `npm test`

Expected failures, each fixed as follows:

- `track.test.ts`: the reach cases on carry arcs. Make them swing mode, where the reach remains. The descent case was
  replaced in Step 1.
- `hands.test.ts`, `describe("a carry with firm grips", …)`: `CARRY` loses `groundDepth`. Its cases read the push:
  `const push = track.push as Push;`, cap at `push.end as number`, and drop "the descent included" from the title and
  `reach.descent`. The old velocity-only hands still track the path to the push's end. If their errors grow past the
  bounds because the arc curves, re-measure them, and record the new bound with a comment "P2b.2b.2b.2b: hands' arc;
  re-measured". Task 5 replaces this `describe`.
- `followThrough.test.ts`:
  - "finishes a carry once the hands' reach has ended …" reads `push.end` in place of `reach.tStop`.
  - "caps a carry whose hands never stop" also needs `handArcRadius: 11`, so its 10 m push stays valid.
  - "flags a follow-through that drives the head deep" can no longer use `groundDepth: 0.2`. Use a deep, late dip
    instead: drive `{ mode: "carry", handReach: 0.15, handDrop: 0.2, dropTime: 0.05 }` and stroke timing
    `{ arc: 0, hands: 0, dip: 0.1 }`, which lowers the hands 0.2 m from 100 ms, long after the ball. Update its
    comment to say so.
- `buildContact.test.ts`: the cases on `groundDepth` (about lines 197–201 and 627–628). Delete the `groundDepth`
  assertion and the negative-`groundDepth` case.
- `simulateImpact.test.ts`: delete the "a negative ground depth" row.
- The rolls' recorded figures (`CANONICAL_*`, the stroke tests' ratios and timings, the trajectory test's comments)
  move. For each, trace the mechanism once: the run must be the roll on its new arc, with no new flag. Re-record the
  figure with the comment "P2b.2b.2b.2b: hands' arc (was <old>)". List every re-recorded figure in the task's report.
- A swing-mode test that fails is a defect. Stop and find the arithmetic swing mode gained.

- [ ] **Step 10: Run every check**

Run, one per call: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`.
Expected: all pass.

- [ ] **Step 11: Commit**

Stage every file this task changed, by path.

Message: `Put the rolls' hands on their arc through contact and stop the push at its length`

---
### Task 5: The flex and the pendulum phase

Spec §3.1 (the flex), §4.1 (the intended path from the actual grips), §4.2 (the pendulum phase), §4.3 (the finish),
§7.1 (the analytic cases).

**Files:**
- Modify: `src/engine/impact/track.ts` (`GripState`, `FlexStart`, `newGripState`, `handLoad`, `forwardOf`, header)
- Modify: `src/engine/impact/integrate.ts` (`trackEnd`, `finished`, `continueStroke`, the run's `release`, header)
- Modify: `src/engine/impact/types.ts` (`ImpactRun.release`'s doc; `Hands`' doc)
- Test: `tests/engine/impact/hands.test.ts`, `tests/engine/impact/followThrough.test.ts`,
  `tests/engine/impact/simulateImpact.test.ts`

**Interfaces:**
- Consumes: `flexGains`, `flexForce` (Task 2); `Push`, `PathPoint.theta`, `handsAt` (Task 4); Task 3's fields.
- Produces, from `track.ts`:
  - `interface FlexStart { readonly top: Vec3; readonly bottom: Vec3; readonly pivot: Vec3; readonly theta: number;
    readonly pitch: number }`
  - `GripState`: `+ flex: FlexStart | null; + topStiffness: number; + bottomStiffness: number; + vertical: boolean;
    + rising: boolean`
- `ImpactRun.release` in carry mode is the pendulum phase's start.

- [ ] **Step 1: Write the failing tests**

`tests/engine/impact/hands.test.ts`:

- Delete `describe("a carry with firm grips", …)`, and the `CARRY` constant if nothing else uses it.
- Delete "from contact feeds the top hand γ_T of its share plus the dip in full, in carry mode" and "keeps the top
  hand's share after the bottom hand's release, and drops the bottom hand's". Both test the old carry branch.
- Update every literal `GripState` (about lines 406, 493 and 547) with
  `flex: null, topStiffness: 0, bottomStiffness: 0, vertical: false, rising: false`.
- Add `axisAngle` to the import from `rigidBody`, and `type Push` to the track import. Import `TEST_FLEX` and
  `TEST_PENDULUM_FORCE` from `../support/impact`, and `integrateStroke`, `FOLLOW_CAP` from `integrate`.
- Append:

```ts
describe("the flex (P2b.2b.2b.2b design §3.1, §7.1)", () => {
    /** A still carry in a vertical swing plane: the hands never travel, so no pendulum phase. */
    const STILL = (o: Partial<SwingArc> = {}): SwingArc =>
        still({ mode: "carry", handReach: 0.1, pendulumAt: 1, ...o });
    const prepareAt = (arc: SwingArc, gravity: number, hands: Hands = TEST_HANDS): PreparedTrack =>
        prepareTrack(trackDrive(arc, TEST_COUPLING, hands), TEST_HEAD, gravity);

    it("stiffens each hand by κ times its feed-forward: the top hand holds the weight, the bottom none", () => {
        // A vertical shaft at rest: F_ff is the weight, all along the shaft, so the top hand carries it and the bottom
        // hand's share is zero.
        const track = prepareAt(STILL(), STANDARD_GRAVITY);
        const grip = newGripState();
        handLoad(track, headOnPath(track, TEST_HEAD, 0), TEST_HEAD, 0, grip);
        expect(grip.topStiffness).toBeCloseTo(TEST_FLEX.stiffness + TEST_FLEX.stiffnessPerForce * STANDARD_GRAVITY, 9);
        expect(grip.bottomStiffness).toBeCloseTo(TEST_FLEX.stiffness, 9);
    });

    it("rings a head moving along the shaft as the damped oscillator of both grips' springs", () => {
        // Along a vertical shaft both grips' springs (2·k₀, no gravity, no feed-forward) act on the swung body M with
        // both dampers: ω = √(2k₀/M), ζ = c/√(2k₀·M) = ζ_arm·√(2·m_arm/M). TEST_FLEX's 0.5 kg on the 1 kg test head
        // makes that ζ_arm exactly.
        const track = prepareAt(STILL(), 0);
        const start = headOnPath(track, TEST_HEAD, 0);
        const v0 = 0.01;
        const moving = { ...start, velocity: vec3(0, 0, v0) };
        const omega = Math.sqrt((2 * TEST_FLEX.stiffness) / TEST_HEAD.mass);
        const zeta = TEST_FLEX.dampingRatio;
        const wd = omega * Math.sqrt(1 - zeta * zeta);
        let worst = 0;
        const probe: ImpactProbe = {
            step(s) {
                const x = s.head.position.z - start.position.z;
                const expected = (v0 / wd) * Math.exp(-zeta * omega * s.t) * Math.sin(wd * s.t);
                worst = Math.max(worst, Math.abs(x - expected));
            },
        };
        integrate(isolated({ start: moving, drive: track, gravity: 0 }), { probe, cap: 0.6 });
        expect(worst).toBeLessThan(0.01 * (v0 / omega));
    });

    it("resists a small pitch with k_top·r_top² + k_bot·r_bot²: the angle hold from the two grips", () => {
        // No gravity and a still path: F_ff is zero, so both hands are at k₀. A turn δθ about the head's centre moves
        // each grip r·δθ and costs a moment k·r² δθ about the pitch axis.
        const track = prepareAt(STILL({ theta0: -0.5 }), 0);
        const grip = newGripState();
        const on = headOnPath(track, TEST_HEAD, 0);
        handLoad(track, on, TEST_HEAD, 0, grip);
        const turn = 1e-5;
        const turned = { ...on, orientation: multiply(axisAngle(track.axis, turn), on.orientation) };
        const load = handLoad(track, turned, TEST_HEAD, 0, grip);
        const rTop = TEST_HEAD.socket.z + track.arc.radius;
        const rBottom = TEST_HEAD.socket.z + TEST_HANDS.bottom;
        const expected = 0 - TEST_FLEX.stiffness * (rTop * rTop + rBottom * rBottom) * turn;
        expect(Math.abs(dot(load.torque, track.axis) / expected - 1)).toBeLessThan(0.01);
    });

    it("has no runaway: a head held off its intended point by d or 10·d feels exactly ten times the spring", () => {
        const track = prepareAt(STILL(), STANDARD_GRAVITY);
        const grip = newGripState();
        const on = headOnPath(track, TEST_HEAD, 0);
        const fed = handLoad(track, on, TEST_HEAD, 0, grip).force;
        const shifted = (d: number): Vec3 =>
            sub(handLoad(track, { ...on, position: add(on.position, vec3(d, 0, 0)) }, TEST_HEAD, 0, grip).force, fed);
        expect(shifted(1e-2).x).toBeCloseTo(10 * shifted(1e-3).x, 9);
    });

    it("pushes no harder along aim than its springs and dampers once the push has stopped: no brake", () => {
        // Design §7.1: the intended path stops at once, so past the push's end and the pendulum's held slope the
        // planned acceleration is zero and the feed-forward has no deceleration term along aim.
        const arc = STILL({ pivotVelocity: vec3(1, 0, 0), handReach: 0.05, window: 0.005, handWindow: 0.005 });
        const track = prepareAt(arc, 0);
        const end = (track.push as Push).end as number;
        const grip = newGripState();
        for (const t of [end + 0.02, end + 0.05]) {
            const load = handLoad(track, headOnPath(track, TEST_HEAD, t), TEST_HEAD, t, grip);
            expect(Math.abs(dot(load.feedForward, arc.aim))).toBeLessThan(1e-9);
        }
    });
});

describe("the pendulum phase (P2b.2b.2b.2b design §4.2, §4.3, §7.1)", () => {
    /** Hands with an undamped flex, a short pendulum: a 0.5 m top grip, the bottom grip 0.25 m from the socket. */
    const FREE: Hands = { ...TEST_HANDS, bottom: 0.25, flex: { ...TEST_FLEX, dampingRatio: 0 } };
    /** Leaning 0.5 rad, still, the pendulum phase from contact (pendulumAt 0 on still hands). */
    const SWUNG = (effort: number): SwingArc =>
        still({ mode: "carry", radius: 0.5, theta0: -0.5, handReach: 0.1, pendulumAt: 0, pendulumEffort: effort });
    const prepared = (effort: number, gravity = STANDARD_GRAVITY): PreparedTrack =>
        prepareTrack(trackDrive(SWUNG(effort), TEST_COUPLING, FREE), TEST_HEAD, gravity);
    const UP_AXIS = vec3(0, 0, 1);

    /** The swung body's energy, the top hand's feed-forward potential −F_ff·x_top and its spring's energy. */
    function energy(track: PreparedTrack, s: ImpactSnapshot, topStart: Vec3): number {
        const { head } = s;
        const shaft = rotate(head.orientation, UP_AXIS);
        const top = add(head.position, scale(shaft, TEST_HEAD.socket.z + track.arc.radius));
        const w = rotateInverse(head.orientation, head.angularVelocity);
        const I = TEST_HEAD.inertia;
        const kinetic =
            0.5 * TEST_HEAD.mass * dot(head.velocity, head.velocity) +
            0.5 * (I.x * w.x * w.x + I.y * w.y * w.y + I.z * w.z * w.z);
        const weight = TEST_HEAD.mass * STANDARD_GRAVITY;
        const k = FREE.flex.stiffness + FREE.flex.stiffnessPerForce * weight;
        const offset = sub(top, topStart);
        return kinetic + weight * head.position.z - weight * top.z + 0.5 * k * dot(offset, offset);
    }

    /** The top grip of the head on `track`'s path at t = 0, where the flex takes hold. */
    const topAtStart = (track: PreparedTrack): Vec3 => {
        const start = headOnPath(track, TEST_HEAD, 0);
        return add(start.position, scale(rotate(start.orientation, UP_AXIS), TEST_HEAD.socket.z + track.arc.radius));
    };

    it("at effort 0 is a free pendulum about the top hand: an undamped flex conserves the energy", () => {
        // The run is 140,000 steps, so the probe keeps running extremes rather than every snapshot.
        const track = prepared(0);
        const topStart = topAtStart(track);
        let lowest = Infinity;
        let highest = 0 - Infinity;
        let pitch = 0 - Infinity;
        const probe: ImpactProbe = {
            step(s) {
                const e = energy(track, s, topStart);
                lowest = Math.min(lowest, e);
                highest = Math.max(highest, e);
                pitch = Math.max(pitch, 0 - leanOf(s.head));
            },
        };
        const start = headOnPath(track, TEST_HEAD, 0);
        integrate(isolated({ start, drive: track, gravity: STANDARD_GRAVITY }), { probe, cap: 0.7 });
        // The swing's potential range, m·g·ℓ_h·(1 − cos 0.5) with ℓ_h = ρ + r = 0.532 m, sets the scale;
        // semi-implicit Euler's error is O(dt) of it.
        const range = TEST_HEAD.mass * STANDARD_GRAVITY * 0.532 * (1 - Math.cos(0.5));
        expect(highest - lowest).toBeLessThan(1e-3 * range);
        expect(pitch).toBeGreaterThan(0.4);
    });

    it("pushes the bottom grip up to vertical and not after, adding F_pendulum's work within 1 %", () => {
        // Review focus 3 at full effort. The work is F_pendulum·(e·v_B)·dt summed from the kinematics, not from the
        // reported force, up to the first step past vertical.
        const track = prepared(1);
        const topStart = topAtStart(track);
        const aim = track.arc.aim;
        let work = 0;
        let previous = 0;
        let before = NaN;
        let atVertical = NaN;
        let past = false;
        let pushedAfter = 0;
        const probe: ImpactProbe = {
            step(s) {
                if (Number.isNaN(before)) {
                    before = energy(track, s, topStart);
                }
                if (past) {
                    pushedAfter = Math.max(pushedAfter, length((s.hand as NonNullable<ImpactSnapshot["hand"]>).bottom));
                    return;
                }
                if (0 - leanOf(s.head) >= 0) {
                    past = true;
                    return;
                }
                const shaft = rotate(s.head.orientation, UP_AXIS);
                const arm = scale(shaft, TEST_HEAD.socket.z + FREE.bottom);
                const v = add(s.head.velocity, cross(s.head.angularVelocity, arm));
                const forward = sub(aim, scale(shaft, dot(aim, shaft)));
                work += TEST_PENDULUM_FORCE * dot(scale(forward, 1 / length(forward)), v) * (s.t - previous);
                previous = s.t;
                atVertical = energy(track, s, topStart);
            },
        };
        const start = headOnPath(track, TEST_HEAD, 0);
        integrate(isolated({ start, drive: track, gravity: STANDARD_GRAVITY }), { probe, cap: 0.7 });
        expect(past).toBe(true);
        expect(Math.abs((atVertical - before) / work - 1)).toBeLessThan(0.01);
        // One step past vertical the latch is set; every later step's bottom hand is off the mallet.
        expect(pushedAfter).toBe(0);
    });

    it("finishes at the swing's first apex after it starts, past vertical, never at the cap", () => {
        const track = prepared(0);
        const start = headOnPath(track, TEST_HEAD, 0);
        const { follow } = integrateStroke(
            isolated({ start, drive: track, gravity: STANDARD_GRAVITY }),
            { cap: 0.01 },
            true,
        );
        const done = follow as NonNullable<typeof follow>;
        expect(done.flags).not.toContain("follow-cap");
        expect(done.finish).toBeLessThan(FOLLOW_CAP);
        const last = done.samples[done.samples.length - 1] as StrokeState;
        // Released at rest 0.5 rad back, it tops out near 0.5 rad forward (the undamped flex barely moves the pivot).
        expect(-leanOf(last.head)).toBeGreaterThan(0.4);
    });

    it("caps a head that never swings forward", () => {
        // No gravity and still hands: the pendulum phase starts but nothing turns the head forward.
        const track = prepared(0, 0);
        const start = headOnPath(track, TEST_HEAD, 0);
        const { follow } = integrateStroke(isolated({ start, drive: track, gravity: 0 }), { cap: 0.01 }, true);
        expect((follow as NonNullable<typeof follow>).flags).toContain("follow-cap");
    });

    it("caps a carry whose hands never reach the pendulum point", () => {
        // Review focus 2: still hands and pendulumAt 1 never start the pendulum phase, so the follow-through runs on.
        const arc = still({ mode: "carry", radius: 0.5, theta0: -0.5, handReach: 0.1, pendulumAt: 1 });
        const track = prepareTrack(trackDrive(arc, TEST_COUPLING, FREE), TEST_HEAD, STANDARD_GRAVITY);
        expect((track.push as Push).pendulum).toBeNull();
        const start = headOnPath(track, TEST_HEAD, 0);
        const { follow } = integrateStroke(
            isolated({ start, drive: track, gravity: STANDARD_GRAVITY }),
            { cap: 0.01 },
            true,
        );
        expect((follow as NonNullable<typeof follow>).flags).toContain("follow-cap");
    });
});
```

Add these helpers near the top of the file:

```ts
/** The shaft's lean about the pitch axis (rad, forward positive), −θ for a head on a +x aim. */
const leanOf = (head: HeadState): number => {
    const s = rotate(head.orientation, UP);
    return Math.atan2(s.x, s.z);
};
```

`still()` aims along +x, so `leanOf` reads the lean along +x; `-leanOf` is the pitch θ.

`tests/engine/impact/simulateImpact.test.ts`, near the version test, add:

```ts
describe("the roll's impact (P2b.2b.2b.2b design §4.2)", () => {
    it("never ends before the pendulum phase starts, and records its start as the release", () => {
        for (const pendulumAt of [0.5, 1]) {
            const setup = canonicalSetup("full-roll", { stroke: { pendulumAt } });
            const contact = buildContact(setup, WORLD);
            const track = prepareTrack(contact.drive as TrackDrive, contact.head, WORLD.gravity);
            const pendulum = (track.push as Push).pendulum as number;
            const result = simulateImpact(contact, setup.balls, WORLD);
            expect(result.duration, `pendulumAt ${pendulumAt}`).toBeGreaterThanOrEqual(pendulum);
            expect(result.release?.t, `pendulumAt ${pendulumAt}`).toBeCloseTo(pendulum, 4);
        }
    });

    it("runs a roll with no push to a normal finish", () => {
        // Review focus 1: a push of 0 puts the arc's low point at contact and starts the pendulum phase there.
        const setup = canonicalSetup("half-roll", { stroke: { handReach: 0 } });
        const outcome = simulateShot(setup, WORLD, { trajectory: true });
        expect(outcome.impact.events.map((e) => e.kind)).not.toContain("impact-cap");
        expect(Number.isFinite(outcome.impact.duration)).toBe(true);
    });

    it("mirrors a canonical roll exactly", () => {
        // Review focus 5: the arc, the flex and the pendulum phase reflect across y = 0 as every tracked drive does
        // (invariants.test.ts's mirror case). On the test world, whose lawn is uniform, the full roll is aimed along
        // +x with the striker on y = 0, so its mirror is the same court.
        const world = testWorld();
        const R = world.ball.radius;
        const base = canonicalSetup("full-roll", { world, stroke: { aim: 0 } });
        const setup = { ...base, balls: { blue: ballAt(5, 0), red: ballAt(5 + 2 * R, 0) } };
        const contact = buildContact(setup, world);
        const run = simulateImpact(contact, setup.balls, world);
        const reflected: BallStates = { blue: mirrorBall(ballAt(5, 0)), red: mirrorBall(ballAt(5 + 2 * R, 0)) };
        const mirrored = simulateImpact(mirrorContact(contact), reflected, world);
        const same = (a: Vec3, b: Vec3): boolean => a.x === b.x && a.y === b.y && a.z === b.z;
        expect(mirrored.steps).toBe(run.steps);
        for (const id of ["blue", "red"] as const) {
            const a = run.handover[id] as BallState;
            const b = mirrored.handover[id] as BallState;
            expect(same(mirrorVec(a.position), b.position), id).toBe(true);
            expect(same(mirrorVec(a.velocity), b.velocity), id).toBe(true);
        }
    });
});
```

`ballAt` and `testWorld` are `../support/fixtures`'s. `mirrorBall`, `mirrorContact` and `mirrorVec` are
`../support/impact`'s. If `ballAt`'s balls do not sit at the static sink the impact needs, use them as
`invariants.test.ts`'s scenarios do; that file's mirror case passes with them. Import what the case needs.

The pendulum start is a step boundary of the integrator. `toBeCloseTo(…, 4)` allows the first step at or after it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/impact/hands.test.ts tests/engine/impact/simulateImpact.test.ts`
Expected: FAIL. `grip.topStiffness` is undefined, the old carry has no springs, the energy is not conserved, and the
impact does not wait for the pendulum phase.

- [ ] **Step 3: The grip state**

`src/engine/impact/track.ts`. Replace `GripState` and `newGripState`:

```ts
/**
 * Where carry mode's flex took hold (P2b.2b.2b.2b design §4.1): the top and bottom grips there, the planned pivot and
 * the planned pitch θ there, and the shaft's actual pitch. The intended path runs from the actual grips.
 */
export interface FlexStart {
    readonly top: Vec3;
    readonly bottom: Vec3;
    readonly pivot: Vec3;
    readonly theta: number;
    readonly pitch: number;
}

/**
 * One integrate run's grip state (design §3.3): the shaft's arc angle at relaxAt, and when the bottom hand opened (by
 * reach in swing mode; at the pendulum phase's start in carry mode) and the shaft's turn since relaxAt then. In carry
 * mode also where the flex took hold, each hand's last stiffness (N/m; the bottom hand's 0 once it has let go),
 * whether the shaft has passed vertical in the pendulum phase (the bottom hand is then off the mallet) and whether
 * the head has pitched forward in it (the next apex is the finish; P2b.2b.2b.2b design §4.2, §4.3). Mutable;
 * handLoad updates it.
 */
export interface GripState {
    contactPitch: number | null;
    releasedAt: number | null;
    releaseDelta: number;
    flex: FlexStart | null;
    topStiffness: number;
    bottomStiffness: number;
    vertical: boolean;
    rising: boolean;
}

/** A grip state for a new run: no contact yet, the bottom hand closed, no flex. */
export function newGripState(): GripState {
    return {
        contactPitch: null,
        releasedAt: null,
        releaseDelta: 0,
        flex: null,
        topStiffness: 0,
        bottomStiffness: 0,
        vertical: false,
        rising: false,
    };
}
```

- [ ] **Step 4: The flex and the pendulum phase in `handLoad`**

Add a helper above `handLoad`:

```ts
/** e: perpendicular to the shaft `s` in the swing plane, forward; 0 where the shaft lies along the aim. */
function forwardOf(aim: Vec3, s: Vec3): Vec3 {
    const raw = across(aim, s);
    const rawSquared = dot(raw, raw);
    return rawSquared > FORWARD_UNDEFINED ? scale(raw, 1 / Math.sqrt(rawSquared)) : ZERO;
}
```

Replace the old `e` computation (`const raw = …` to `const e = …`) with `const e = forwardOf(arc.aim, s);`.

In `handLoad`, after the `if (!contact) { … }` block, replace the release-by-reach block through the `if (carry)`
return with:

```ts
    const pitchNow = shaftPitch(s, arc.aim);
    const contactPitch = grip.contactPitch ?? pitchNow;
    grip.contactPitch = contactPitch;
    if (carry) {
        return carryLoad(track, state, t, grip, path, {
            top: add(topShare, dip),
            bottom: bottomShare,
            whole: feedForward,
            twist: twistShare,
            pitch: pitchNow,
            rate,
            topArm,
            bottomArm,
            spinLag,
            s,
        });
    }
    // Release by reach (swing mode): the bottom hand opens for good once the shaft has turned through the slack since
    // relaxAt.
    const lever = arc.radius - hands.bottom;
    if (grip.releasedAt === null && lever * (pitchNow - contactPitch) > hands.reachSlack) {
        grip.releasedAt = t;
        grip.releaseDelta = pitchNow - contactPitch;
    }
```

The rest of the swing branch stays as it was. `effort` becomes `hands.guideEffort`, and `firmShare` becomes
`checking`, because carry no longer reaches them. Keep every swing-mode expression's operand order unchanged.

Add `carryLoad` above `handLoad`:

```ts
/** What carryLoad needs from handLoad's step: the feed-forward's shares, the shaft and the grips' arms. */
interface CarryStep {
    /** The top hand's share with the dip, the bottom hand's, and the whole F_ff (N). */
    readonly top: Vec3;
    readonly bottom: Vec3;
    readonly whole: Vec3;
    /** The feed-forward's twist about the shaft (N·m). */
    readonly twist: number;
    /** The shaft's pitch (rad) and its pitch rate about n (rad/s). */
    readonly pitch: number;
    readonly rate: number;
    readonly topArm: Vec3;
    readonly bottomArm: Vec3;
    readonly spinLag: Vec3;
    /** The shaft's axis. */
    readonly s: Vec3;
}

/**
 * Carry mode's hands from contact (P2b.2b.2b.2b design §3.1, §4): each hand's feed-forward plus its flex to its point
 * on the intended path. The path runs from the actual grips where the flex took hold (`grip.flex`), moved by the
 * planned pivot since then; the bottom grip also turns with the planned pitch. Once the intended path has travelled
 * pendulumAt of the push the pendulum phase starts: the top hand alone feeds the whole F_ff and flexes, and the bottom
 * hand lets go and pushes forward along e with pendulumEffort·pendulumForce until the shaft passes vertical, then is
 * off the mallet; no twist acts. Updates `grip`: where the flex took hold, the hands' stiffnesses, the release (the
 * pendulum phase's start), and the vertical and rising latches.
 */
function carryLoad(
    track: PreparedTrack,
    state: HeadState,
    t: number,
    grip: GripState,
    path: PathPoint,
    step: CarryStep,
): HandLoad {
    const { arc, hands } = track;
    const planned = handsAt(track, t);
    const topAt = add(state.position, step.topArm);
    const bottomAt = add(state.position, step.bottomArm);
    if (grip.flex === null) {
        grip.flex = { top: topAt, bottom: bottomAt, pivot: planned.position, theta: path.theta, pitch: step.pitch };
    }
    const from = grip.flex;
    const moved = sub(planned.position, from.pivot);
    const topVelocity = add(state.velocity, cross(state.angularVelocity, step.topArm));
    const load = (top: Vec3, bottom: Vec3, twist: number, fed: Vec3): HandLoad => ({
        force: add(top, bottom),
        feedForward: fed,
        torque: add(add(cross(step.topArm, top), cross(step.bottomArm, bottom)), scale(step.s, twist)),
        top,
        bottom,
    });
    const push = track.push as Push;
    const pendulum = push.pendulum !== null && t >= push.pendulum;
    const topFed = pendulum ? step.whole : step.top;
    const topGains = flexGains(hands.flex, length(topFed));
    grip.topStiffness = topGains.stiffness;
    const top = flexForce(topFed, topGains, sub(topAt, add(from.top, moved)), sub(topVelocity, planned.velocity));
    if (!pendulum) {
        // The bottom grip's intended point turns with the planned pitch about the intended top grip:
        // x̂_B = x_B(0) + ΔP + (r − b)·(radial(θ̂) − radial(θ̂₀)), θ̂ = pitch₀ + θ − θ₀.
        const lever = arc.radius - hands.bottom;
        const [si, ci] = sinCos(from.pitch + (path.theta - from.theta));
        const [s0, c0] = sinCos(from.pitch);
        const radial = sub(scale(arc.aim, si), scale(UP, ci));
        const radialFrom = sub(scale(arc.aim, s0), scale(UP, c0));
        const tangent = add(scale(arc.aim, ci), scale(UP, si));
        const bottomTarget = add(add(from.bottom, moved), scale(sub(radial, radialFrom), lever));
        const turning = lever * dot(path.angularVelocity, track.axis);
        const bottomTargetVelocity = add(planned.velocity, scale(tangent, turning));
        const bottomVelocity = add(state.velocity, cross(state.angularVelocity, step.bottomArm));
        const bottomGains = flexGains(hands.flex, length(step.bottom));
        grip.bottomStiffness = bottomGains.stiffness;
        const bottom = flexForce(
            step.bottom,
            bottomGains,
            sub(bottomAt, bottomTarget),
            sub(bottomVelocity, bottomTargetVelocity),
        );
        const twist = hands.bottomGrip * step.twist + track.bottom.twistDamping * dot(step.spinLag, step.s);
        return load(top, bottom, twist, add(step.top, step.bottom));
    }
    if (grip.releasedAt === null) {
        grip.releasedAt = t;
        grip.releaseDelta = step.pitch - (grip.contactPitch as number);
    }
    grip.bottomStiffness = 0;
    if (step.rate > 0) {
        grip.rising = true;
    }
    if (step.pitch >= 0) {
        grip.vertical = true;
    }
    const bottom = grip.vertical
        ? ZERO
        : scale(forwardOf(arc.aim, step.s), arc.pendulumEffort * hands.pendulumForce);
    return load(top, bottom, 0, topFed);
}
```

Import `flexForce` and `flexGains` from `./flex`, and `length` from vec3. `handLoad`'s local `load` and `carryLoad`'s
are deliberately separate, so the swing branch's sums are untouched. Twist about the shaft is unchanged in the push
(spec §3.1: "keeps today's damper and grip share"). In the pendulum phase no twist acts, as after today's release.

Update `handLoad`'s doc. Replace "…, the bottom hand a one-sided rate guide (swing mode; with g_B·F_B inside a check)
or a two-sided grip (carry mode), until it opens once the shaft has turned through the reach slack." with "…, the
bottom hand a one-sided rate guide (with g_B·F_B inside a check), until it opens once the shaft has turned through the
reach slack. In carry mode from relaxAt both hands flex instead, then the pendulum phase (carryLoad; P2b.2b.2b.2b
design §3, §4)." Update the file header's last sentences the same way.

- [ ] **Step 5: The impact's end and the finish**

`src/engine/impact/integrate.ts`:

```ts
/**
 * When a tracked drive's actions are over: both arcs' windows, the dip if it has depth and, in carry mode, the
 * pendulum phase's start (P2b.2b.2b.2b design §4.2), so that its start and effort can act on the balls.
 */
function trackEnd(plan: PreparedTrack): number {
    const { arc, push } = plan;
    const dip = arc.dip.depth > 0 ? arc.dip.start + arc.dip.duration : 0;
    const pendulum = push === null || push.pendulum === null ? 0 : push.pendulum;
    return Math.max(arc.arcStart + arc.window, arc.handStart + arc.handWindow, dip, pendulum);
}
```

In swing mode this is `Math.max(…, 0)`, a fourth argument that cannot change the maximum of the start times, which
`validateTrack` keeps non-negative. Check that its bits are unchanged (Task 8's digest does).

`finished` gains the grip:

```ts
/**
 * True once the head in `state` at time t has reached its finish (P2b.2b.2a design §4.2): a swing at the pendulum's
 * apex, its pitch rate about n at or below zero; a check at rest relative to the hands; a carry at the first apex
 * after its pendulum phase starts, its pitch rate at or below zero once it has been positive (`grip.rising`;
 * P2b.2b.2b.2b design §4.3).
 */
function finished(kind: FinishKind, plan: PreparedTrack, state: HeadState, t: number, grip: GripState): boolean {
    switch (kind) {
        case "swing":
            return dot(state.angularVelocity, plan.axis) <= 0;
        case "check":
            return length(sub(state.velocity, handsAt(plan, t).velocity)) < FINISH_SPEED;
        case "carry":
            return grip.rising && dot(state.angularVelocity, plan.axis) <= 0;
    }
}
```

`continueStroke` calls `finished(kind, plan, state, t, grip)`. `ImpactRun.release`'s doc in `types.ts` becomes: "A
tracked drive's bottom hand opening (P2b.2b.1 design §3.3): by reach in swing mode, at the pendulum phase's start in
carry mode (P2b.2b.2b.2b design §4.2): when (s), and the shaft's turn since relaxAt (contact) then (rad). …". Update
the file header's tracked-drive paragraph: the drive's end includes the pendulum phase's start in carry mode.

`FINISH_SPEED`'s doc no longer mentions a carry if no carry reads it. Reword it to "a check's head".

- [ ] **Step 6: Run the new tests**

Run: `npx vitest run tests/engine/impact/hands.test.ts tests/engine/impact/simulateImpact.test.ts`
Expected: PASS.

If the energy case fails, read the drift's shape before changing anything:

- A steady trend means a force without its potential, for example the feed-forward's potential missing for a moving
  grip.
- An O(dt) oscillation means the integrator. Halve `dt` and check that it halves.

If the pitch case misses 1 %, check that the turn is about the head's centre and that F_ff is zero.

- [ ] **Step 7: Migrate the follow-through tests**

`tests/engine/impact/followThrough.test.ts`:

- "finishes a carry once the push has ended and the head is at rest" (Task 4's wording) becomes:

```ts
    it("finishes a carry at its first apex after the pendulum phase starts", () => {
        const { contact, follow } = stroke(CARRY);
        const push = prepareTrack(contact.drive as TrackDrive, contact.head, WORLD.gravity).push as Push;
        expect(push.pendulum).not.toBeNull();
        expect(follow.finish).toBeGreaterThan(push.pendulum as number);
        expect(follow.flags).not.toContain("follow-cap");
    });
```

  Use the file's own helper in place of `stroke`. `CARRY`'s profile needs `handArcRadius` above its 0.15 m push,
  which `testProfile`'s 1.5 m default gives.
- "caps a carry whose hands never stop": a 10 m push now reaches its pendulum point after 0.5 s or never. Keep the
  case, and assert `follow-cap`.
- "flags a follow-through that drives the head deep": keep it. If the soft flex no longer drives the head 2 mm deep
  with Task 4's 0.2 m late dip, trace it first: the flex's intended path lowers 0.2 m and the springs follow at
  k ≈ k₀. Deepen the dip to 0.4 m, and say so in the comment.

- [ ] **Step 8: Re-baseline the rolls**

Run: `npm test`

The rolls' figures move again. For each failing roll test:

1. Trace the run once with its own setup. It must be the roll on the flex, with no `impact-cap` and no `follow-cap`.
2. Re-record the figure with the comment "P2b.2b.2b.2b: flex (was <old>)".

The pass roll's "punch beats coast" (`it.fails`) may now pass. Vitest then reports the `it.fails` as a failure. Leave
it as it is in this task: the gate (Task 6) shows it to the user, and Task 8 flips it.

If a roll raises `impact-cap` or `follow-cap` on its canonical setup, do not re-baseline it. Record it for the gate,
and mark the test `it.skip` with the comment "P2b.2b.2b.2b: awaits the pre-flight gate (Task 6)". List every such test
in the task's report.

A swing-mode test that fails is a defect. Stop and find it.

- [ ] **Step 9: Run every check**

Run, one per call: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`.
Expected: all pass, apart from any `it.skip` Step 8 recorded and the pass roll's `it.fails` if it now passes. The
report must say which.

- [ ] **Step 10: Commit**

Stage every file this task changed, by path.

Message: `Hold the roll on the hands' flex and swing it through a pendulum phase`

---
### Task 6: The pre-flight gate

Spec §8. **This task always stops for the user**, whatever the figures show.

**Files:**
- Modify: `scripts/strokeProbe.ts` (`asPlayed` for all three rolls at 2 and 3 m/s; `onPoint`; the header)
- Create: `docs/superpowers/probes/<date>-p2b2b2b2b-gate.txt` (the gate's raw output; use the run's date)
- Temp: `<temp>/scripts/slowMotion.mts`, `<temp>/after/slowMotion.html`

**Interfaces:**
- Consumes: Task 5's engine; `simulateStroke`'s `follow`.
- Produces, in `scripts/strokeProbe.ts`:
  - `function onPoint(steps: readonly ImpactSnapshot[], striker: number, head: MalletHead, aim: Vec3): OnPoint`,
    where `interface OnPoint { readonly behind: number; readonly height: number; readonly lean: number; readonly
    holds: boolean }`. It measures from the first face–striker contact to the last: the least distance of the head's
    centre behind the ball's centre along aim (m), the highest face contact above the ball's centre (m) and the
    largest lean (rad). `holds` is true when behind > 0, height ≤ R·sin 45° and lean ≤ 45°.
  - Sections `asPlayed` (rewritten) and `onPoint`.

- [ ] **Step 1: The on-point measure**

In `scripts/strokeProbe.ts`, after `faceCentre`:

```ts
/** Exit criterion 4 (P2b.2b.2b.2b design §1): the head on point behind the striker's ball through the contact. */
interface OnPoint {
    /** The least distance (m) of the head's centre behind the ball's centre along aim. */
    readonly behind: number;
    /** The highest face contact point (m) above the ball's centre. */
    readonly height: number;
    /** The largest lean (rad). */
    readonly lean: number;
    readonly holds: boolean;
}

/** R·sin 45°: the face meeting the ball no higher than a 45° lean puts it. */
const ON_POINT_HEIGHT = WORLD.ball.radius * Math.SQRT1_2;

/**
 * The head on point (exit criterion 4) over `steps`, from the first step with the face–striker pair closed to the
 * last: the head's centre behind the ball's centre along aim, every face contact point at most R·sin 45° above the
 * ball's centre, and the lean at most 45°.
 */
function onPoint(steps: readonly ImpactSnapshot[], striker: number, head: MalletHead, aim: Vec3): OnPoint {
    const key = `face/${BALL_IDS[striker] as BallId}`;
    const touching = steps.map((s) => s.contacts.some((c) => c.key === key && c.normalForce > 0));
    const first = touching.indexOf(true);
    const last = touching.lastIndexOf(true);
    let behind = Infinity;
    let height = 0 - Infinity;
    let lean = 0 - Infinity;
    for (let i = Math.max(first, 0); first >= 0 && i <= last; i++) {
        const s = steps[i] as ImpactSnapshot;
        const ball = s.balls[striker] as BallState;
        behind = Math.min(behind, dot(sub(ball.position, s.head.position), aim));
        lean = Math.max(lean, leanOf(s.head, aim));
        const hit = headBallContact(s.head, head, ball.position, WORLD.ball.radius);
        if (hit !== null) {
            height = Math.max(height, hit.point.z - ball.position.z);
        }
    }
    const holds = behind > 0 && height <= ON_POINT_HEIGHT && lean <= Math.PI / 4;
    return { behind, height, lean, holds };
}
```

The striker's index is its index in the snapshots' balls, which are in `BALL_IDS` order over the setup's balls.
Compute the key from the setup's striker id rather than from `BALL_IDS[striker]`: pass `striker` as the id, and the
index separately, if the setup's balls skip ids. `recorded` already gives both. Import `headBallContact` from
`../src/engine/impact/contacts`.

- [ ] **Step 2: `asPlayed` for all three rolls**

Extend `recorded` to also return `follow` from `simulateStroke`. A run's steps can number 100,000 or more, past what
`Math.min(...xs)` can spread, so add two helpers:

```ts
/** The least and the greatest of `xs` (Infinity and −Infinity when empty), with no argument spread. */
const least = (xs: readonly number[]): number => xs.reduce((a, b) => Math.min(a, b), Infinity);
const most = (xs: readonly number[]): number => xs.reduce((a, b) => Math.max(a, b), 0 - Infinity);
```

Replace `asPlayed` with:

```ts
/**
 * The rolls against the roll as played (P2b.2b.2b.2b design §8, §9), each at 2 and 3 m/s: first the head on point
 * (exit criterion 4), then the lean through the contact and the pitch through vertical, the hands' dip, the head's
 * descent at contact and through the push against Gugan's 6–16°, the face intervals, the ratio, the hands' force along
 * aim at the pendulum phase's start and its minimum after the push, and the striker's speed lost while the face is on
 * it.
 */
function asPlayed(): void {
    console.log("== The rolls against the roll as played (P2b.2b.2b.2b design §8) ==");
    for (const type of ROLLS) {
        for (const speed of [2, 3]) {
            const setup = atSpeed(type, speed);
            const { plan, impact, steps, striker, follow } = recorded(setup);
            const drive = plan.contact.drive as TrackDrive;
            const { aim, contactAt } = drive.arc;
            const head = plan.contact.head;
            const track = prepareTrack(drive, head, WORLD.gravity);
            const push = track.push as Push;
            const label = `${type.padEnd(11)} ${fmt(speed, 1)} m/s`;
            const point = onPoint(steps, striker, head, aim);
            console.log(
                `${label} ON POINT ${point.holds ? "holds" : "FAILS"}: the head's centre ${mm(point.behind)} mm ` +
                    `behind the ball's centre at least; the face's contacts ${mm(point.height)} mm above it at ` +
                    `most (R·sin 45° ${mm(ON_POINT_HEIGHT)} mm); the lean ${deg(point.lean)}° at most (45°)`,
            );
            const intervals = impact.timeline[`face/${setup.striker}`] ?? [];
            const from = intervals[0]?.start ?? contactAt;
            const to = intervals[intervals.length - 1]?.end ?? impact.duration;
            const window = steps.filter((s) => s.t >= from && s.t <= to);
            const leans = window.map((s) => leanOf(s.head, aim));
            const after = follow.samples.filter((s) => s.t >= impact.duration);
            const pitchPeak = most(after.map((s) => 0 - leanOf(s.head, aim)));
            console.log(
                `${"".padEnd(11)} ${intervals.length} face intervals over ${ms(from)}–${ms(to)} ms; lean at ` +
                    `contact ${deg(leans[0] ?? NaN)}°, ${deg(least(leans))}° to ${deg(most(leans))}° ` +
                    `through the contact; the follow-through's highest pitch ${deg(pitchPeak)}° ` +
                    `(${pitchPeak >= 0 ? "past" : "short of"} vertical), finish at ${ms(follow.finish)} ms ` +
                    `${follow.flags.length > 0 ? follow.flags.join(", ") : "unflagged"}`,
            );
            const topOf = (state: HeadState): Vec3 =>
                add(
                    state.position,
                    scale(rotate(state.orientation, vec3(0, 0, 1)), head.socket.z + drive.arc.radius),
                );
            const z0 = topOf(plan.contact).z;
            const heights = follow.samples.map((s) => ({ t: s.t, dz: topOf(s.head).z - z0 }));
            const lowest = heights.reduce((a, b) => (b.dz < a.dz ? b : a));
            const atPendulum = heights.find((h) => h.t >= (push.pendulum ?? Infinity));
            const atFinish = heights[heights.length - 1] as { t: number; dz: number };
            console.log(
                `${"".padEnd(11)} the hands' dip: lowest ${mm(lowest.dz)} mm at ${ms(lowest.t - contactAt)} ms ` +
                    `after contact; ${atPendulum === undefined ? "no pendulum phase" : `${mm(atPendulum.dz)} mm at ` +
                    `the pendulum phase's start`}; ${mm(atFinish.dz)} mm at the finish`,
            );
            const descentOf = (s: ImpactSnapshot): number =>
                Math.atan2(0 - s.head.velocity.z, dot(s.head.velocity, aim));
            const onBall = steps.filter((s) =>
                s.contacts.some((c) => c.key === `face/${setup.striker}` && c.normalForce > 0),
            );
            const descents = onBall.map(descentOf);
            console.log(
                `${"".padEnd(11)} the head's descent at contact ${deg(descents[0] ?? NaN)}°, ` +
                    `${deg(least(descents))}° to ${deg(most(descents))}° while the face is on the ` +
                    "ball (Gugan's β 6–16°, held out; 2a at 3 m/s: half 9.70°, full 3.05°, pass 4.48°)",
            );
            const pushOf = (s: ImpactSnapshot): number => (s.hand === undefined ? NaN : dot(s.hand.force, aim));
            const atStart = steps.find((s) => s.t >= (push.pendulum ?? Infinity));
            const afterPush = steps.filter((s) => s.t >= (push.end ?? Infinity));
            const weakest = afterPush.length > 0 ? least(afterPush.map(pushOf)) : NaN;
            const ball = (s: ImpactSnapshot): BallState => s.balls[striker] as BallState;
            let lost = 0;
            for (let i = 1; i < steps.length; i++) {
                const s = steps[i] as ImpactSnapshot;
                if (s.contacts.some((c) => c.key === `face/${setup.striker}` && c.normalForce > 0)) {
                    lost += Math.max(
                        0,
                        length(ball(steps[i - 1] as ImpactSnapshot).velocity) - length(ball(s).velocity),
                    );
                }
            }
            const contactStep = steps.find((s) => s.t >= contactAt);
            const hand = contactStep?.hand;
            const damperStep = hand === undefined ? NaN : length(sub(hand.force, hand.feedForward));
            console.log(
                `${"".padEnd(11)} the hands' force along aim at the pendulum phase's start ` +
                    `${atStart === undefined ? "—" : fmt(pushOf(atStart), 1)} N, its least after the push ` +
                    `${fmt(weakest, 1)} N (no brake); the striker's ball loses ${fmt(lost)} m/s while the face is ` +
                    `on it; the flex's step at contact ${fmt(damperStep, 2)} N (decision 2); ratio ` +
                    `${fmt(ratio(setup, simulateShot(setup, WORLD)), 2)}`,
            );
        }
    }
}
```

`ratio` takes a `ShotOutcome`: `simulateShot(setup, WORLD)` gives one. Import `type Push` from track.ts. The
follow-through's `samples` include the impact's samples, so the dip's lowest point covers the whole stroke.

- [ ] **Step 3: `onPoint` over the preset grid**

Add a section:

```ts
/**
 * Exit criterion 4 over swingProbe's preset grid for each roll (speed × drive × contact, 225 runs a roll): the runs
 * whose head leaves its point, each listed.
 */
function onPointSweep(): void {
    console.log("== The head on point (exit criterion 4) over the preset grid ==");
    for (const type of ROLLS) {
        const base = canonicalSetup(type, { world: WORLD });
        const up0 = base.stroke.contact.up;
        let runs = 0;
        const failed: string[] = [];
        for (const speed of [1, 2, 3, 4, 6]) {
            for (const strokeDrive of [-1, -0.5, 0, 0.5, 1]) {
                for (const up of [up0 - 0.003, up0, up0 + 0.003]) {
                    for (const side of [-0.01, 0, 0.01]) {
                        let setup: ShotSetup;
                        try {
                            const stroke = { ...base.stroke, drive: strokeDrive, contact: { up, side } };
                            const backswing = backswingFor({ ...base, stroke }, speed, WORLD);
                            setup = { ...base, stroke: { ...stroke, backswing } };
                            planStroke(setup, WORLD);
                        } catch (error) {
                            if (error instanceof RangeError) {
                                continue;
                            }
                            throw error;
                        }
                        const { plan, steps, striker } = recorded(setup);
                        const drive = plan.contact.drive as TrackDrive;
                        const point = onPoint(steps, striker, plan.contact.head, drive.arc.aim);
                        runs++;
                        if (!point.holds) {
                            failed.push(
                                `${speed} m/s drive ${strokeDrive} up ${mm(up - up0)} mm side ${mm(side)} mm: ` +
                                    `behind ${mm(point.behind)} mm, height ${mm(point.height)} mm, ` +
                                    `lean ${deg(point.lean)}°`,
                            );
                        }
                    }
                }
            }
        }
        console.log(`${type.padEnd(11)} ${runs} runs, ${failed.length} off point`);
        for (const line of failed) {
            console.log(`${"".padEnd(11)} ${line}`);
        }
    }
}
```

Register it as `onPoint: onPointSweep` in `SECTIONS`. Update the file header's list with `asPlayed` (all three rolls,
§8's figures) and `onPoint` (exit criterion 4 over the preset grid).

`recorded` keeps every snapshot, and the sweep runs 675 of them, one at a time. If memory runs short, replace
`recorder()` in the sweep with a probe that keeps only what `onPoint` reads, rather than skip runs.

- [ ] **Step 4: Run the gate's figures**

Run: `env SECTION=asPlayed npx --yes tsx scripts/strokeProbe.ts > docs/superpowers/probes/<date>-p2b2b2b2b-gate.txt`
Run (in the background): `env SECTION=onPoint npx --yes tsx scripts/strokeProbe.ts > <temp>/after/onPoint.txt`

When both finish, append `<temp>/after/onPoint.txt`'s lines to the gate file under a heading line.

- [ ] **Step 5: The slow-motion export**

Create `<temp>/scripts/slowMotion.mts`. For each roll at 2 and 3 m/s:

1. Run `simulateStroke` with a `recorder()` probe.
2. Every 1 ms of the impact take the head's pose, the top and bottom grips and both balls. Every follow-through
   sample, take the head's pose and the grips.
3. Write one self-contained HTML page, `<temp>/after/slowMotion.html`. It shows a side view in the swing plane (along
   aim against height) as an inline SVG animation, with play, pause and a speed control (1/10, 1/40, 1/100 of real
   time). Draw:
   - the head as its outline;
   - the shaft from the socket to the top grip;
   - the grips as dots;
   - the balls as circles;
   - the turf line;
   - the hands' intended path as a faint line;
   - a label with t (ms after contact), the lean and the phase (push or pendulum).

   One panel per run, six in all.

Load the `artifact-design` skill, then publish the page with the Artifact tool as a private artifact titled "Roll
Gate Replay". Give the user the link. If publishing is unavailable, give them the file's path.

- [ ] **Step 6: Stop for the user**

Show the user:

1. **First, the head on point:**
   - the six canonical runs' ON POINT lines;
   - the sweep's count off point per roll;
   - every failing run listed.

   Any failure on a canonical run is the mechanism failing (spec §8).
2. The lean through contact and the pitch through vertical.
3. The hands' dip: its depth, when it bottoms out and its recovery.
4. The head's descent against Gugan's 6–16° and 2a's figures.
5. The face intervals and the ratios.
6. The flex's step at contact (decision 2).
7. The pass roll's "punch beats coast" (exit criterion 2): punched and coasted striker's speeds, from
   `npx vitest run tests/engine/shot.test.ts -t "punch"`.
8. Every test Task 5 marked `it.skip`, with why.
9. The slow-motion link.

Ask the user to rule on one of:

- go on;
- change the defaults: the hands' arc's placeholders, `pendulumAt`, `pendulumEffort` or the push lengths;
- change the mechanism, including the weight support of spec §3.1 (the springs carrying everything) and decision 2.

**Wait for the ruling.** Do not start Task 7 until the user has ruled.

On the ruling:

- **A change to a default or the mechanism:**
  1. Make it.
  2. Re-run Steps 4 and 5.
  3. Stop again.
  4. Record each round in the gate file, with the user's words and date.
- **"Go on":**
  1. Re-baseline any `it.skip` from Task 5 with the comment "P2b.2b.2b.2b: flex, gate ruling <date>", or delete it
     if the ruling makes it moot.
  2. Run every check.

- [ ] **Step 7: Commit**

Stage `scripts/strokeProbe.ts`, the gate file and any file a ruling changed, by path.

Message: `Probe the rolls against the roll as played and record the pre-flight gate`

---
### Task 7: The handover rule

Spec §5, decisions 6 and 7.

**Files:**
- Modify: `src/engine/impact/handover.ts` (`HandoverHead`, the rule in the pass loop, `worstOverlap`, the header)
- Modify: `src/engine/impact/simulateImpact.ts` (`handedOver`, its callers)
- Test: `tests/engine/impact/handover.test.ts`

**Interfaces:**
- Consumes: `headBallContact` (`contacts.ts`), `CONTACT_TOLERANCE` (`../detect`), `SinkSolver`.
- Produces, from `handover.ts`:
  - `interface HandoverHead { readonly state: HeadState; readonly head: MalletHead; readonly limits:
    Readonly<Partial<Record<BallId, number>>> }`
  - `function handover(balls: BallStates, radius: number, obstacles?: readonly ObstacleGeometry[], passes?: number,
    mallet?: HandoverHead | null): Handover`

- [ ] **Step 1: Write the failing tests**

Append to `tests/engine/impact/handover.test.ts`:

```ts
describe("handover with the head (P2b.2b.2b.2b design §5)", () => {
    const R = TEST_BALL.radius;
    /** The test head level, its face toward +x, the face's plane at x = 0, its axis at height h. */
    const headAt = (h: number, pitch = 0): HeadState => ({
        position: vec3(-TEST_HEAD.length / 2, 0, h),
        orientation: axisAngle(vec3(0, 1, 0), pitch),
        velocity: vec3(1, 0, 0),
        angularVelocity: vec3(0, 0, 0),
    });
    const limits = { blue: 4.4e-4 + 1e-9 };

    it("moves a ball lifted into the face out along the face's normal, by the overlap", () => {
        // The ball lies 0.1 mm into the face's plane after the lift: its centre R − 1e-4 ahead of the face.
        const ball = {
            position: vec3(R - 1e-4, 0, R - 3e-4),
            velocity: vec3(0.5, 0, 0),
            angularVelocity: vec3(0, 0, 0),
        };
        const out = handover({ blue: ball }, R, [], undefined, { state: headAt(R), head: TEST_HEAD, limits });
        const moved = out.balls.blue as BallState;
        expect(moved.position.x).toBeCloseTo(R, 12);
        expect(moved.position.z).toBe(R);
        expect(moved.velocity).toEqual(ball.velocity);
        expect(out.overlapCorrection).toBeCloseTo(1e-4, 12);
    });

    it("clears a tilted face too, moving the ball horizontally by depth/|n_h|", () => {
        // The face pitched 0.2 rad down. The ball, at z = R and y = 0, is placed R − 0.1 mm from the face's plane:
        // n·(c − f) = R − 1e-4 solved for c.x. Its offset across the face, about 22 mm, is inside the face's 32 mm
        // radius, so the contact is the face's.
        const state = headAt(R, 0.2);
        const n = rotate(state.orientation, vec3(1, 0, 0));
        const f = add(state.position, scale(n, TEST_HEAD.length / 2));
        const x = f.x + (R - 1e-4 - n.z * (R - f.z)) / n.x;
        const ball = { position: vec3(x, 0, R), velocity: vec3(0, 0, 0), angularVelocity: vec3(0, 0, 0) };
        expect(headBallContact(state, TEST_HEAD, ball.position, R)?.region).toBe("face");
        const out = handover({ blue: ball }, R, [], undefined, { state, head: TEST_HEAD, limits });
        const moved = (out.balls.blue as BallState).position;
        expect(headBallContact(state, TEST_HEAD, moved, R)?.depth ?? 0).toBeLessThanOrEqual(1e-9);
        expect(moved.z).toBe(R);
    });

    it("leaves a ball the head does not touch bit-identical", () => {
        const ball = { position: vec3(R + 1e-3, 0, R), velocity: vec3(0.5, 0, 0), angularVelocity: vec3(1, 2, 3) };
        const out = handover({ blue: ball }, R, [], undefined, { state: headAt(R), head: TEST_HEAD, limits });
        expect(out.balls.blue).toBe(ball);
        expect(out.overlapCorrection).toBe(0);
    });

    it("throws past its bound: deeper than the static sink plus CONTACT_TOLERANCE", () => {
        const ball = { position: vec3(R - 1e-3, 0, R), velocity: vec3(0, 0, 0), angularVelocity: vec3(0, 0, 0) };
        expect(() =>
            handover({ blue: ball }, R, [], undefined, { state: headAt(R), head: TEST_HEAD, limits }),
        ).toThrow(/head overlaps ball blue/);
    });

    it("throws for a head on top of a ball", () => {
        // Review focus 4: a vertical normal has no horizontal way out.
        const state: HeadState = {
            position: vec3(0, 0, 2 * R + TEST_HEAD.radius - 1e-4),
            orientation: axisAngle(vec3(0, 0, 1), 0),
            velocity: vec3(0, 0, 0),
            angularVelocity: vec3(0, 0, 0),
        };
        const ball = { position: vec3(0, 0, R), velocity: vec3(0, 0, 0), angularVelocity: vec3(0, 0, 0) };
        expect(() => handover({ blue: ball }, R, [], undefined, { state, head: TEST_HEAD, limits })).toThrow(
            /head overlaps ball blue/,
        );
    });

    it("moves a ball again that the pair pass pushes back into the head", () => {
        // Red overlaps blue from ahead; separating them pushes blue back into the face, and the head pass clears it.
        const blue = { position: vec3(R - 1e-4, 0, R), velocity: vec3(0, 0, 0), angularVelocity: vec3(0, 0, 0) };
        const red = {
            position: vec3(3 * R - 1e-4 - 2e-4, 0, R),
            velocity: vec3(0, 0, 0),
            angularVelocity: vec3(0, 0, 0),
        };
        const out = handover({ blue, red }, R, [], undefined, { state: headAt(R), head: TEST_HEAD, limits });
        const b = (out.balls.blue as BallState).position;
        const r = (out.balls.red as BallState).position;
        expect(headBallContact(headAt(R), TEST_HEAD, b, R)?.depth ?? 0).toBeLessThanOrEqual(1e-9);
        expect(length(sub(r, b))).toBeGreaterThanOrEqual(2 * R - 1e-12);
    });
});
```

Import what the cases use: `TEST_HEAD` from `../support/impact`; `axisAngle` and `rotate` from `rigidBody`;
`headBallContact` from `contacts`; `add`, `length`, `scale`, `sub` and `vec3` from vec3; and the `BallState` and
`HeadState` types.

The "on top" case puts the level head's barrel on the ball's top: its axis is at height 2R + ρ − 1e-4, so the barrel's
underside is 0.1 mm into the ball. The normal is vertical.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/impact/handover.test.ts`
Expected: FAIL. The ball stays inside the face, and nothing throws.

- [ ] **Step 3: Implement**

`src/engine/impact/handover.ts`:

```ts
/**
 * The head at the impact's end, for the head-clearance rule (P2b.2b.2b.2b design §5): its state and shape, and per
 * ball the deepest overlap (m) the rule may remove, its static sink plus CONTACT_TOLERANCE.
 */
export interface HandoverHead {
    readonly state: HeadState;
    readonly head: MalletHead;
    readonly limits: Readonly<Partial<Record<BallId, number>>>;
}

/**
 * The size² at or below which a contact normal's horizontal part is taken as none: a normal within about 1e-6 rad of
 * vertical, a head on top of the ball (design §5). Numerical, not physical.
 */
const VERTICAL_NORMAL = 1e-12;
```

In `handover`, add the parameter `mallet: HandoverHead | null = null` after `passes`. In the pass loop, after the
obstacle loop, add:

```ts
        if (mallet !== null) {
            for (let i = 0; i < states.length; i++) {
                const s = states[i] as BallState;
                const hit = headBallContact(mallet.state, mallet.head, s.position, radius);
                if (hit === null || !(hit.depth > CONTACT_TOLERANCE)) {
                    continue;
                }
                const flat = horizontal(hit.normal);
                const size = dot(flat, flat);
                const limit = mallet.limits[ids[i] as BallId] ?? CONTACT_TOLERANCE;
                if (hit.depth > limit || !(size > VERTICAL_NORMAL)) {
                    throw new Error(
                        `handover: the head overlaps ball ${ids[i]} by ${hit.depth} m along a normal with ` +
                            `horizontal part ${Math.sqrt(size)}; the rule clears at most ${limit} m, sideways`,
                    );
                }
                // Along n_h/|n_h| by depth/|n_h|, so that a tilted face clears too: flat·depth/|n_h|².
                states[i] = { ...s, position: add(s.position, scale(flat, hit.depth / size)) };
                overlapCorrection = Math.max(overlapCorrection, hit.depth);
            }
        }
```

`worstOverlap` gains `mallet: HandoverHead | null`. After the obstacle loop for ball i it adds:

```ts
        if (mallet !== null) {
            const hit = headBallContact(mallet.state, mallet.head, p, radius);
            if (hit !== null && hit.depth > CONTACT_TOLERANCE && hit.depth > worst.overlap) {
                worst = { overlap: hit.depth, what: `ball ${ids[i]} and the head` };
            }
        }
```

Pass `mallet` at both calls. Imports: `dot` from vec3, `headBallContact` from `./contacts`, `CONTACT_TOLERANCE` from
`../detect`, and the types `HeadState` and `MalletHead` from `./types`.

Header, after the obstacles paragraph:

> A tracked drive's head is also cleared (P2b.2b.2b.2b design §5). A ball the head overlaps by more than
> CONTACT_TOLERANCE is moved horizontally along the horizontal part of the contact's normal, by depth/|n_h|, so that a
> tilted face clears too. Its velocity is kept. That is the lift's artefact, at most the static sink. An overlap
> deeper than the ball's limit, or along a normal with no horizontal part, throws an Error naming the ball.

The pass paragraph gains "then the head".

`src/engine/impact/simulateImpact.ts`:

```ts
/**
 * The impact's result: `run` with its balls handed over to phase 2 (design §6). A tracked drive's head is cleared from
 * the balls too (P2b.2b.2b.2b design §5), each ball's limit its static sink at its starting position plus
 * CONTACT_TOLERANCE; a force table's head is its face alone, so it is not.
 */
function handedOver(
    run: ImpactRun,
    world: World,
    contact: ContactState,
    balls: BallStates,
    sink: SinkSolver,
): ImpactResult {
    let mallet: HandoverHead | null = null;
    if (contact.drive.kind === "track") {
        const limits: Partial<Record<BallId, number>> = {};
        for (const id of BALL_IDS) {
            const b = balls[id];
            if (b !== undefined) {
                limits[id] = sink(b.position) + CONTACT_TOLERANCE;
            }
        }
        mallet = { state: run.head, head: contact.head, limits };
    }
    const handed = handover(run.balls, world.ball.radius, obstaclesOf(world), undefined, mallet);
    return { ...run, handover: handed.balls, overlapCorrection: handed.overlapCorrection };
}
```

`simulateImpact` and `simulateStroke` call `handedOver(…, world, contact, balls, sink)`. Import what is missing.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/impact/handover.test.ts`
Expected: PASS.

- [ ] **Step 5: Run every check**

Run, one per call: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`.
Expected: all pass. A test whose handover moved has a head overlapping a ball at the impact's end. Trace it, and list
it in the report: spec exit criterion 5 allows that exception and asks for the list. If the rule throws in any run,
stop: that impact ended where it must not, and it goes to the user.

- [ ] **Step 6: Commit**

Stage the three files by path.

Message: `Clear a lifted ball from the head at the handover`

---
### Task 8: The gates and the version

Spec §1 exit criteria 2–6 and 9.

**Files:**
- Modify: `src/engine/simulate.ts` (`ENGINE_VERSION`)
- Modify: `tests/engine/index.test.ts`, `tests/engine/impact/simulateImpact.test.ts` (the version)
- Modify: `tests/engine/shot.test.ts` (the pass roll's `it.fails` back to `it`)

**Interfaces:**
- Consumes: Task 1's baseline.

- [ ] **Step 1: Write the failing tests**

- `tests/engine/index.test.ts` line ~69: `toBe("0.10.0")`.
- `tests/engine/impact/simulateImpact.test.ts` line ~36: `"is version 0.10.0"` and `toBe("0.10.0")`.
- `tests/engine/shot.test.ts`: change `it.fails("the pass roll's punch …"` to `it(…`. Replace the comment block above
  it with:

```ts
    // Spec exit criterion 2 (P2b.2b.2b.2b). On the bed (P2b.2b.2b.2a) the canonical pass roll's follow-through kept its
    // face on the striker's ball and pinned it in its pit; the roll's stroke (the flex, the push with no brake and the
    // pendulum phase) lets it go. The test is unchanged: drive +1 against 0, at the canonical pendulum phase.
```

  Append to the test's own comment the figures the gate recorded (punched and coasted striker's speeds), labelled
  "P2b.2b.2b.2b: flex".

- [ ] **Step 2: Run them**

Run: `npx vitest run tests/engine/index.test.ts tests/engine/impact/simulateImpact.test.ts tests/engine/shot.test.ts`
Expected: the version cases FAIL. The pass roll's case passes if the gate said so. If it fails, stop: exit
criterion 2 is not met, and it goes to the user with the gate's figures.

- [ ] **Step 3: Implement**

`src/engine/simulate.ts`: `export const ENGINE_VERSION = "0.10.0";`.

- [ ] **Step 4: Run the gates**

Bit-identity (exit criterion 5):

- Run: `npx --yes tsx <temp>/scripts/presetDigest.mts > <temp>/after/presetDigest.txt`
  Then: `diff <temp>/baseline/presetDigest.txt <temp>/after/presetDigest.txt`
  Expected: identical, or each differing line a run whose impact ended with the head overlapping a lifted ball (the
  handover rule moved it). Prove each with a throwaway that prints that run's `overlapCorrection` before and after.
  Any other line is a defect: stop, and find the commit that moved it by re-running the digest at each task commit.
- Run: `npx --yes tsx scripts/impactDigest.ts > <temp>/after/impactDigest.txt`
  Then: `diff <temp>/baseline/impactDigest.txt <temp>/after/impactDigest.txt`
  Expected: only the engine version, and any roll or carry case. List each moved case.
- Run: `npx --yes tsx scripts/shotMix.ts > <temp>/after/shotMix.txt`
  Then: compare the shot mix's figures with the baseline's. Phase 2 must be unchanged. Engine time is compared with
  `env COUNT=800 npx --yes tsx scripts/shotMix.ts`.

Exit criterion 3 (no impact ends with the head overlapping a ball as handed over):

- Run: `env SECTION=rehit npx --yes tsx scripts/swingProbe.ts > <temp>/after/rehit.txt`
  Expected: every preset's "overlap one at the impact's end" counts 0. swingProbe measures the overlap on the head at
  the impact's end against `impact.handover`. If it reads `impact.balls`, change it to read the handed-over balls, and
  say so in its header. Record each preset's count.

Exit criterion 4 (on point): Task 6's sweep, re-run after any ruling's change.

Exit criterion 6 (every preset's canonical setup runs from top to finish):

- Run: `npx vitest run tests/engine/shot.test.ts -t "canonical setup from the top to its finish"`
  Expected: PASS for all seven presets. That case is P2b.2b.2b.1's exit criterion 4 check: no `RangeError`, no entry
  jumps, no `follow-cap`, continuous at every boundary. Check that it also bounds each ball's centre to within 5 mm
  above R. If it does not, add that assertion, with the comment "P2b.2b.2b.1 exit criterion 4", and commit it with
  this task.

- [ ] **Step 5: Run every check**

Run, one per call: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`, and
`env SLOW_TESTS=1 npm test`.
Expected: all pass.

- [ ] **Step 6: Commit**

Stage the four files by path.

Message: `Bump the engine to 0.10.0 for the roll's stroke`

---
### Task 9: The probes, the outcomes and the documents

Spec §9, §11, and the plan's decisions.

**Files:**
- Modify: `scripts/strokeProbe.ts` (`timing`, `heldOut`; the header)
- Modify: `scripts/swingProbe.ts` (the handover's corrections, if Task 8 changed what it reads)
- Create: `docs/superpowers/probes/<date>-p2b2b2b2b-strokeProbe.txt`,
  `docs/superpowers/probes/<date>-p2b2b2b2b-swingProbe.txt`
- Modify: `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`
- Modify: `docs/superpowers/specs/2026-10-11-p2b2b2b2b-roll-stroke-design.md` (an amendment note)
- Modify: `docs/superpowers/specs/2026-10-06-p2b2b2a-stroke-shape-design.md` (a note: "hands arrive with no vertical
  velocity" reopened for carry by P2b.2b.2b.2b)

- [ ] **Step 1: The pendulum-timing sweep and the held-out checks**

In `scripts/strokeProbe.ts`, add:

```ts
/**
 * The pendulum-timing sweep (P2b.2b.2b.2b design §9): each roll at a slow and a fast push (2 and 4 m/s), pendulumAt
 * from 0.2 to 1.0, the ratio and the striker's distance at each. Recorded only: how sensitive the outcome is to the
 * phasing, which the user expects to be highest on a long, fast push.
 */
function timing(): void {
    console.log("== The pendulum-timing sweep (design §9): ratio and striker's distance against pendulumAt ==");
    for (const type of ROLLS) {
        for (const speed of [2, 4]) {
            const cells: string[] = [];
            for (const pendulumAt of [0.2, 0.4, 0.6, 0.8, 1]) {
                const base = atSpeed(type, speed);
                const setup = withStroke(base, { pendulumAt });
                const outcome = simulateShot(setup, WORLD);
                const start = (setup.balls[setup.striker] as BallState).position;
                const travelled = length(horizontal(sub(outcome.motion.rest[setup.striker] as Vec3, start)));
                const cell = `ratio ${fmt(ratio(setup, outcome), 2)}, striker ${fmt(travelled, 2)} m`;
                cells.push(`${fmt(pendulumAt, 1)}: ${cell}`);
            }
            console.log(`${type.padEnd(11)} ${fmt(speed, 1)} m/s  ${cells.join("; ")}`);
        }
    }
}
```

`outcome.motion.rest` holds each ball's position at rest, as `ratio` reads it.

Add `heldOut()`, which prints for each roll at 3 m/s:

- the head's descent at contact and through the push against Gugan 4's stroke angle, 6–16° (from `asPlayed`'s
  measure, factored into a shared function);
- the apparent contact against the CA's 30–58 ms, from the first face–striker interval's start to the last's end;
- the second contact against Gugan 4's and Hall's several milliseconds: the second face interval's start less the
  first's end;
- the face intervals against Cross's seven taps;
- the ratio against Gugan's: full 1.20–1.24, pass 0.94–1.21, half 2.30–2.46.

Factor the measures `asPlayed` already computes into small functions that both sections call, rather than copy them.
Register `timing` and `heldOut` in `SECTIONS`, and add both to the header.

- [ ] **Step 2: Run the probes and keep the output**

Run (in the background):
`npx --yes tsx scripts/strokeProbe.ts > docs/superpowers/probes/<date>-p2b2b2b2b-strokeProbe.txt`
Run (in the background):
`npx --yes tsx scripts/swingProbe.ts > docs/superpowers/probes/<date>-p2b2b2b2b-swingProbe.txt`

Compare each with `<temp>/baseline/strokeProbe.txt` and `<temp>/baseline/swingProbe.txt`:

- the swing presets' lines must match;
- every roll line that moved is this phase's;
- every changed line is explained in the roadmap's outcomes.

- [ ] **Step 3: Update the roadmap (spec §11)**

In `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`:

- **The P2 row:** name P2b.2b.2b.2b with this spec and plan, and give its exit criteria as spec §1, marked done.
- **"P2b.2b.2b decisions and findings":**
  - the user's account of 2026-10-11 ("The roll as played", as the spec has it);
  - the user's decisions;
  - the vocabulary note;
  - the pre-flight gate's ruling(s), with the user's words and date.
- **A new section "P2b.2b.2b.2b outcomes (<date>)"**, with:
  - the arm's sourced values and their sources;
  - §8's figures for each roll at 2 and 3 m/s;
  - exit criterion 4's sweep counts;
  - the timing sweep;
  - the held-out checks, each against its measurement;
  - 2a's items re-recorded: the ratios over 2–4 m/s for every preset, the striker's face intervals, the late re-hit
    crossings and the handover's corrections (exit criterion 3: none overlapping), the cap and flag tallies, the
    longest impact against the 450 ms cap, braking hands and cost per step against P5's provisional budget;
  - the rolls' re-fitted backswings (Task 4's fit summary);
  - every re-recorded test figure (Tasks 4, 5);
  - every handover correction on a swing preset (Task 7).
- **"Provisional numbers":** unchanged (spec §11).

- [ ] **Step 4: Record this plan's decisions in the phase spec**

Append to the phase spec an "Amendments (plan, <date>)" section. List decisions 1–12 above, each with its
reason, plus the user's ruling on decision 2 and every gate ruling. Then add a line to the stroke-shape spec's §3.3:
"Reopened for carry mode by P2b.2b.2b.2b: the hands arrive on their arc (P2b.2b.2b.2b design §4.1)."

- [ ] **Step 5: Check the documents**

Run: `env LC_ALL=en_GB.UTF-8 grep -nE "^[^|].{120,}$" docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`
Run: `env LC_ALL=en_GB.UTF-8 grep -nE "^[^|].{120,}$" docs/superpowers/specs/2026-10-11-p2b2b2b2b-roll-stroke-design.md`
Run: `env LC_ALL=en_GB.UTF-8 grep -nE "^[^|].{120,}$" docs/superpowers/specs/2026-10-06-p2b2b2a-stroke-shape-design.md`
Expected: only the roadmap's known line 29.

Run: `grep -nE "\bsplit\b|\bratio\b|flick" docs/superpowers/specs/2026-10-11-p2b2b2b2b-roll-stroke-design.md`
Every hit must be the croquet sense, the vocabulary note itself, or a quoted source.

- [ ] **Step 6: Run every check**

Run, one per call: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`.
Expected: all pass.

- [ ] **Step 7: Commit**

Stage the probe outputs, both scripts and the three documents, by path.

Message: `Record the roll's stroke outcomes and the plan's decisions`

Then offer the user `/handover`, and the finishing-a-development-branch skill for the PR.
