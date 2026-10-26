# P2b.2b.2c.3a — The Unified Set-Up: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One stroke model with no `StrokeMode`. Every set-up input (grip, lean, feet, strike, push through, after
first contact) is optional on every shot, and each stroke type keeps only its text-book defaults. The drive's grip moves
to hands together. `ENGINE_VERSION` becomes 0.18.0.

**Architecture:**

- `src/engine/swing/downswing.ts`, `src/engine/impact/track.ts` (paths): one downswing law, the planned slope with
  the grip's couple as its bound (Task 3).
- `src/engine/impact/track.ts` (hands), `src/engine/impact/integrate.ts`: one hand model after contact, the finish
  from the inputs, and the push through on every stroke (Tasks 7 and 8, after stage 1's ruling).
- `src/engine/swing/buildContact.ts`, `src/engine/swing/types.ts`, `src/engine/impact/types.ts`,
  `src/engine/impact/simulateImpact.ts`: the per-shot inputs, their validation, and `StrokeMode` removed (Tasks 6,
  9 and 10).
- `src/engine/swing/profile.ts`: `slopeHold` per preset (Task 3), the drive's grip (Task 12).
- `scripts/setupProbe.ts` (new): this step's probe sections.
- Order, as spec §6 (one commit per mechanism, the drive's grip last) and §7 (two gate stages):
  1. the baseline;
  2. the feet's reading;
  3. the downswing law;
  4. the hand model's design note;
  5. gate stage 1;
  6. the small branches;
  7. the hand model;
  8. the push through;
  9. `StrokeMode` removed;
  10. the per-shot inputs;
  11. the checks;
  12. the drive's grip;
  13. gate stage 2;
  14. the records and the version.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), Vitest, ESLint, Prettier. No
new dependencies. `npx --yes tsx` runs the scripts.

**Spec:** `docs/superpowers/specs/2026-10-26-p2b2b2c3a-unified-setup-design.md`. Read all of it. It is this plan's
source of decisions; do not re-open them. Also read:

- **The previous plan:** `docs/superpowers/plans/2026-10-23-p2b2b2c2d-follow-through.md`, for the conventions kept here:
  the preset digest (Task 1), the ratchet, the gates and the documents.
- **The follow-on design:** `docs/superpowers/specs/2026-10-26-p2b2b2c3-push-map-design.md` §3.5 (the envelope
  record) and its admissibility list. Nothing here implements 3b, but 3b reads every input this step adds.
- **Roadmap:** `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`, "P2b.2b.2c.2d outcomes" and
  "Provisional numbers". Line 12 is one enormous table row: grep it narrowly, never print it whole.

**Decisions made while planning.** Each is the builder's call under spec §9 or a reading of the code. Stage 1 rules
1–4; Task 14 folds every ruled one into the spec's Amendments.

1. **The planned slope is `slopeHold`, λ in [0, 1]** (spec §4.1).
   - λ is how far the hands hold the shaft's slope against its free swing. 0 lets it swing; 1 holds today's hands-led
     slope.
   - `SwingShape.slopeHold` sets the preset's value: 0 on single-ball, the drive and both stops, 1 on the rolls. Task
     10 adds `stroke.slopeHold` for a single shot.
   - **The plan.** Let D_f be the free swing's fall (today's table, the hands led by σ_f = (θ − θ_top)/span), and T
     the hands' tempo at the intensity, or D_f when `handTempo` is null. The plan lasts D = (1 − λ)·D_f + λ·T. At u =
     τ/D (τ from the release), σ(u) = (1 − λ)·σ_f(u·D_f) + λ·u², and θ = θ_top + span·σ. ω and α follow by the chain
     rule, with σ̇_f = ω_f/span and σ̈_f = α_f/span.
   - **The representation.**
     - λ = 0 is today's table itself.
     - λ = 1 is today's closed form. It needs no table when a tempo is given.
     - 0 < λ < 1 is a table every FREE_STEP over D, with its last sample at contact, as today's table ends.
     - The endpoints are computed directly, not through the blend, so the defaults keep their bits. The blend
       converges to them (Review Focus 3).
   - Both of today's paths are points in this family, and the values between them are legal, so a player can plan in
     between. It is continuous in λ, as spec §4.1 requires.
   - The swing presets' `handTempo` stays null. Null now means "my own free swing's fall": a tempo derived, not fitted.
2. **The couple's bound** (spec §4.1, "bounded by the body").
   - Along a plan with λ > 0, the couple the hands must supply is
     τ_c = I_P·α + W·sin θ + M·d·(A·t̂) − τ_p(ω), from the swung body's pendulum (`downswingInput`'s) and the
     hands' A from `downswingHands`.
   - It is checked at every sample (`downswingSamples`) against C = min(γ_T, g_B)·F_max·(r − b), where F_max is
     `gripLimit` (435 N; Young et al. 2009) and (r − b) is the hands' spread.
   - Past C the planner throws a RangeError naming the couple needed, when, and C with its parts.
   - At λ = 0 nothing is checked: the free swing needs no couple by construction.
   - The form is the design's. The firmness factor min(γ_T, g_B) is labelled a placeholder: the grips are firm before
     contact elsewhere in the model, and spec decision 3 reads the AC stop's 0.1/0.1 as "too loose to fight the
     pendulum".
   - This is also spec §9's effort law: the body's torque τ_p acts on every stroke, and on a held plan it lightens the
     couple.
3. **The rest of the downswing loses its mode.**
   - The body's θ_max limits every backswing (`MAX_BACK_ANGLE` stays exported as its ceiling).
   - `handTempo` is optional everywhere and checked when given.
   - A plan with λ < 1 needs `pendulumShare` > 0. So does λ = 1 with a null tempo, since its fall must be derived.
   - The arc's arrival slope (`arcArrival`) is computed on every stroke; it is 0 with no push. The table form carries
     the Hermite term: `downswingHands` adds it to a table when `tangent.z !== 0`, and only then, so the bits are kept.
   - `validateDownswing(down, n)` checks by representation: `tempo !== null` means the closed form, otherwise a table.
     A table's tangent may be non-zero.
   - `DownswingInput` and `StrokeChoice` lose `mode` and gain `slopeHold: number`. `DownswingInput` also gains
     `couple: number` (C, N·m), which `downswingInput` computes from the hands, the pose's radius and `gripLimit`.
4. **After contact, the pulse and the hold follow λ too** (spec §4: "inside the pulse | §4.1's law").
   - `SwingArc` gains `slopeHold: number`.
   - `pendulumAt` reads the free table at λ = 0 and the kinematic pulse-and-hold at λ = 1. Between them it blends:
     θ = (1 − λ)·θ_free + λ·θ_held, and likewise ω and α.
   - `prepareTrack` tabulates the free pendulum whenever λ < 1.
   - Until Task 7, `mode` still chooses the body, the push, the advance and the hand law.
5. **Stage 1 rules three approaches** (spec §7):
   - the feet's reading, from Task 2's evidence;
   - decisions 1, 2 and 4 as built in Task 3;
   - the hand model and the law after contact, from Task 4's note.

   Tasks 7 and 8 implement the ruling. Task 6 Step 1 first writes the ruled note into this plan as decisions 11 and
   on. A ruling that changes Task 3 sends it back before Task 6.
6. **Task 4's note answers spec §4's after-contact rows and §9's open items.**
   - **The swung body:** the Dong et al. chains on every stroke (spec amendment A1, ruled while planning). The note
     predicts how the swing presets move and why, and how the swing law's grips (γ_T, g_B) act through the chains.
   - **One control law after contact:** how the swing law (the grip-scaled share, the damper, the rate guide with
     `guideEffort`, the check's share) and the carry law (the flex to the intended path, the posture hold relaxing
     from the first departure, the push intent, the pendulum phase) become one. Each of its terms is governed by an
     input, as spec §4 assigns it.
   - **The bottom hand's opening rule.** The note's starting proposal: the earlier of the reach slack and the push's
     pendulum phase, where a push of length 0 has no pendulum phase. It measures whether any roll run turns through
     the slack before its pendulum phase (Task 4 Step 2).
   - **The finish from the inputs:** a brake takes the check's hold, a push the carried finish, neither the free
     swing. It also covers a check on a held slope (λ = 1), which today has no free table to hold.
   - **The push through on every stroke, and the advance merged into it** (spec §2, 3b). Spec criterion 5's stop or
     drive with a push through needs the hands to travel, and today only the advance moves still hands.
   - Each answer comes with a recommendation and its listed departures. It contains no code.
7. **`mode` stays until Task 9.** Each mechanism removes its own branches. Task 9 removes the type, the fields and the
   last readers.
   - Until then, `testProfile` derives the default `shape.slopeHold` from `drive.mode`: 1 for carry, 0 otherwise.
   - Every hand-built test arc with `mode: "carry"` also sets `slopeHold: 1`. The swing arcs set 0.
8. **The per-shot inputs** (spec §2; Task 10). Each is optional; absent, today's path runs.
   - `stroke.grip?: { top?, bottom?, gripTension?, bottomGrip? }` overrides the stance's four values one by one, with
     errors named `stroke.grip.<key>`.
   - `stroke.lean?: number` is in rad, forward positive, finite and at most π/4 (the on-point limit). Given, it sets
     `handsAhead = handsAheadFor(lean, top, up, geometry)` with the shot's top, the world's ball and the profile's
     mallet.
   - Without a lean, a shot that changes `top` or `contact.up` keeps `handsAhead`, as today.
   - `stroke.feet?: number` is in m along aim from the striker's ball's centre to the hands' arc's lowest point. It
     sets s_low = feet − x_c, where x_c = aim·(P_c − ball) is the hands at contact. It needs |s_low| < handArcRadius.
   - `SwingArc` gains `lowPoint?: number`, s_low in m. Absent, the arc uses `handArcLow·handReach`.
     `arcArrival(radius, low)` takes s_low (m). `computePush` reads `lowPoint` when present.
   - `stroke.slopeHold?: number` is in [0, 1].
9. **The drive's grip** (spec §5, Task 12).
   - The bottom hand moves to 0.805 − w, where w is a 50th-percentile adult hand breadth.
   - Cite w (cite, don't mirror) or label it a placeholder at 0.09 m.
   - The drive's `guideEffort` 0.75 is re-checked on the same 0.25 grid and with the same re-contact rule (profile.ts's
     comment). It is re-tuned only if the gate rules it so.
10. **The probe.** `scripts/setupProbe.ts` takes `SECTION` (a letter or `all`), as `followThroughProbe.ts` does.

    | Section | Content | Task |
    |---|---|---|
    | F | The feet's reading (§3) | 2 |
    | R | Each roll run's shaft turn, from contact to its pendulum phase, against the reach slack | 4 |
    | P | The planned slope: λ sweep, the couple against C per preset, D_f and T | 3 |
    | X | The cross-mode cases (criterion 5) | 11 |
    | D | The drive's grip: `guideEffort` 0–1 by 0.25, re-contacts, ratio | 12 |

    Criterion 6 reuses `followThroughProbe` section O and `swingProbe`'s rehit section.

## Global Constraints

- **Formatting.**
  - Use 4-space indentation, a 120-column limit, LF line endings and UTF-8.
  - Check line lengths with `env LC_ALL=en_GB.UTF-8 grep -nE "^[^|].{120,}$" <file>`. Table rows in markdown are
    exempt, and roadmap lines 12 and 29 are known pre-existing hits.
  - Run `npx prettier --write` on every code and JSON file you touch. `npm run format:check` must pass.
  - `.prettierignore` lists `docs/`, so wrap markdown by hand.
- **Engine purity.** `src/engine/**` is pure and deterministic: no DOM, no time of day, no randomness.
- **Determinism lint.** Engine code uses only `+ − * /`, comparisons, `Math.sqrt`, `Math.abs`, `Math.min`,
  `Math.max`, `Math.round`, `Math.floor`, `Math.ceil`, `Math.PI`, `Number.isFinite`, and the engine's `sinCos`,
  `atan2`, `ln`, `exp` and `pow`.
- **Style.**
  - No non-null assertions (`!`); write `x as T` after indexing.
  - Braces on every `if`. Write `0 - x`, not unary minus, in engine arithmetic.
  - Exported functions carry a header comment.
  - A constant that is not physical says "Numerical, not physical" and why. An unsourced one says "Placeholder".
  - Use `import type` for type-only imports.
  - Argument lists go all on one line, or one per line when more than three or past 120 columns.
  - Comments give reasons, not process labels.
- **Units.** SI. Figures printed in mm, ms or degrees say so.
- **Vocabulary.**
  - "Split", "ratio" and "cut" keep their croquet meanings only.
  - The pendulum/hands share is "phasing", the turf's drag "ploughing".
  - No new type, field or comment calls anything a "mode" of the stroke.
- **The anti-goals** (spec §8). No flag, type check, or input whose only sensible values are the two old modes. No
  departure hidden inside a tolerance: list it.
- **Engine version.** `ENGINE_VERSION` becomes `"0.18.0"` (Task 14).
- **The ratchet** (spec §6): the preset digest (`phys` and `faults`), `impactDigest`, `impactProbe` and `shotMix`,
  compared with Task 1's baseline and the previous task's run.
  - Code with an input absent keeps today's arithmetic. Branch on it rather than add a zero term: `x + 0` turns −0
    into +0.
  - A run that now throws is a departure. List it with its message.
  - Any change outside the task's expected set stops the task and goes to the controller with a trace.
- **The ratchet's runs** run in the background and must finish, and match, before that task's commit.
  - `pgrep -fl tsx` must print no digest or probe process before a commit.
  - Each output file must be non-empty.
  - Compare `shotMix` and `impactProbe` with their timing lines dropped (`grep -v "ms per shot"`, `grep -v "µs/step"`).
- **Slow tests** run only when `SLOW_TESTS` is set, by the controller, never while an implementer is editing.
- **Subagents.**
  - Dispatch them named, in the foreground, with a timeout of 600 s or less.
  - Use opus for Task 4 and for any task that traces a departure; sonnet for mechanical migrations.
  - They deliver their result by `SendMessage` to the controller and never dispatch subagents.
  - Implementers stage their work and stop before committing until the controller reports the ratchet matches.
  - The controller runs the digests, probes and `SLOW_TESTS` itself.
- **RED steps.** Vitest does not type-check: a test using a missing export fails at runtime, and `npm run check` shows
  the type errors.
- **Behaviour figures.**
  - A test resting on model behaviour carries its reasoning in a comment.
  - Where a test fails, trace the mechanism before changing an expectation.
  - A re-baselined figure gets "P2b.2b.2c.3a: <the change> (was <old>)", and the commit message gives old and new.
  - No test is loosened to pass.
- **Circularity.** The rolls are held out: never tuned to a ratio. The AC stop and the drive are calibration targets
  against Gugan 5 only. Refits are the backswings to 3 m/s (spec §4.1) and, under spec amendment A1, the AC stop's
  and the drive's own grip or `guideEffort` where stage 2 rules a retune; each is recorded old and new. No other
  default moves except the drive's grip, `slopeHold` (new) and what a gate rules.
- **Kept as they are.** The face, ball–ball and turf laws, the mallet, the lawn's pace, the hands' constants,
  `pushForce`, `handAcceleration`, the rolls' and stops' grips and leans, and the jump shot's turf rebound (spec §8).
- **Process.**
  - Follow the plan's steps; no side probes: figures come from the steps that produce them.
  - The gates (Tasks 5 and 13) **stop for the user**, whatever they show.
  - Put each question to the user one at a time, with options, pros, cons and a recommendation.
  - Record each ruling verbatim in the spec's Amendments.
  - Ask before any push or PR.
- **Bash.**
  - One command per call: no `&&`, `||`, `;`, `$(…)` or subshells.
  - Redirecting a script's output with `>` or `2>` is allowed.
  - No `bash -c` or `node -e`; use `python3 -I` for JSON checks.
  - Never `git -C` into another worktree. Run the baseline only through `npm --prefix <temp>/main-tree` or
    `npx tsx <path>`. `npm --prefix` needs the `/private/tmp/…` spelling of `<temp>`.
- **The temp directory.**
  - `<temp>` is the executing session's literal `CLAUDE_TEMP_DIR`, given to each subagent in its prompt.
  - Throwaway scripts go in `<temp>/scripts/`, outputs in `<temp>/baseline/` and `<temp>/after/`.
  - `<date>` is the day the step runs. `<wt>` is this worktree's absolute path.
- **Sources.** Cite, don't mirror: the URL, the date, the SHA-256 of the fetched file and short annotated quotes in
  `reference/sources/README.md`; commit no fetched file.
- **Commits.**
  - Use a short imperative sentence (repo style), signed.
  - Write the message to `<temp>/msg-task<N>.txt` and commit with `git commit -F <that path>`.
  - Check with `git log -1 "--format=%G? %h"` and expect `G`.
  - Stage by explicit path. Never `--no-verify` or a bare `git stash`.
- **Checks after every task:** `npm test`, `npm run lint`, `npm run check` and `npm run format:check`, one per call,
  all pass. The baseline is 1358 passed, 13 skipped, 1 todo.
- **Worktree.**
  - All work happens in `/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2c3-push-map`, on branch
    `worktree-p2b2b2c3-push-map` (kept, user 2026-10-26), based on `main` at 6c45bcd. 3a's PR opens from it.
  - The designs and this plan are its first commits; the engine there is main's.
  - Run `npm ci` before anything; never symlink `node_modules`.

## Review Focus

The spec implies each input below, but no task's listed tests exercise it. The owning task pins each one.

1. **A lean past the on-point limit, or one whose hands leave the stance's branch.**
   - `stroke.lean` = π/4 is accepted. π/4·(1 + 1e-9), NaN and ±Infinity throw, naming `stroke.lean`.
   - A lean whose derived `handsAhead` falls outside (−D, A) throws the existing check's message.
   - Pinned in Task 10.
2. **A grip override that breaks the shaft's order.**
   - `stroke.grip.bottom` alone at or above the preset's `top` throws, naming `stroke.grip.bottom`.
   - `stroke.grip.top` beyond `shaftLength` throws, naming `stroke.grip.top`.
   - A grip of 0 or above 1 throws, naming `stroke.grip.gripTension` or `stroke.grip.bottomGrip`.
   - Pinned in Task 10.
3. **A plan the grip cannot hold, and λ near its ends.**
   - The drive at λ = 1 with its hands together (bottom at 0.715 m in a test profile, before Task 12 moves it)
     throws the couple's RangeError if its couple exceeds C. Otherwise the test asserts the couple's peak against C,
     with the figure.
   - λ = 1 with a null tempo and `pendulumShare` 0 throws, naming the missing free swing.
   - λ = 1e-9 and λ = 1 − 1e-9 give θ at every sample within 1e-6 rad of λ = 0's and λ = 1's.
   - Pinned in Task 3.
4. **Feet that put the arc's lowest point out of reach, or that have nothing to move.**
   - |s_low| ≥ handArcRadius throws, naming `stroke.feet`.
   - On a stroke with no push and still hands (single-ball), any feet leave the path identical to the shot without
     feet.
   - Pinned in Task 10.
5. **The planner given a croquet type with no croqueted ball.**
   - `planStroke` direct on the AC stop with `croqueted` absent plans no dip raise: its downswing equals the shot's
     with an on-time dip.
   - `simulateShot` still rejects the setup under the Laws (`shot.ts`).
   - Pinned in Task 6.

---
## File Structure

| Path | Change |
|---|---|
| `src/engine/swing/downswing.ts`, `tests/engine/swing/downswing.test.ts`, `tests/engine/swing/backswingLimit.test.ts`, `tests/engine/swing/effort.test.ts` | The planned slope, the couple (Task 3) |
| `src/engine/impact/track.ts`, `tests/engine/impact/track.test.ts`, `tests/engine/impact/hands.test.ts` | The paths by λ (Task 3); the hand model (Task 7); the push (Task 8) |
| `src/engine/impact/integrate.ts`, `tests/engine/impact/followThrough.test.ts` | The finish and the latches (Task 7) |
| `src/engine/swing/buildContact.ts`, `tests/engine/swing/buildContact.test.ts` | Validation, the dip raise, the jab (Tasks 3, 6, 9, 10) |
| `src/engine/swing/types.ts`, `src/engine/impact/types.ts`, `src/engine/index.ts`, `tests/engine/index.test.ts` | The inputs, `slopeHold`, `StrokeMode` removed (Tasks 3, 9, 10) |
| `src/engine/impact/simulateImpact.ts`, `tests/engine/impact/simulateImpact.test.ts` | `validateDownswing`, `slopeHold`, the mode check (Tasks 3, 9) |
| `src/engine/swing/profile.ts` | `slopeHold` (Task 3), `shapeOf` (Task 3), the drive's grip (Task 12) |
| `tests/engine/support/*.ts`, `scripts/*.ts` | Migrated with each mechanism |
| `scripts/setupProbe.ts`, `tests/engine/setupProbe.test.ts` | New (Task 2 on) |
| `reference/sources/README.md` | The hand breadth (Task 12) |
| `docs/superpowers/probes/<date>-p2b2b2c3a-*.txt`, the roadmap, the spec | The gates, the figures, the rulings |
| `src/engine/simulate.ts:77` | `ENGINE_VERSION` 0.18.0 (Task 14) |

---
### Task 1: The baseline

Spec §6.

**Files:** temp only: `<temp>/main-tree/`, `<temp>/scripts/presetDigest.mts`, `<temp>/baseline/*`.

**Interfaces:**
- Produces `presetDigest.mts`, which later tasks run with `ROOT` set, and `<temp>/baseline/<name>.txt` for
  `presetDigest`, `impactDigest`, `shotMix` and `impactProbe`.

- [ ] **Step 1: The baseline worktree**

Run: `mkdir -p <temp>/scripts <temp>/baseline <temp>/after`
Run: `git worktree add --detach <temp>/main-tree 6c45bcd`
Run: `npm --prefix <temp>/main-tree ci`
Expected: both succeed.

- [ ] **Step 2: The digest**

Create `<temp>/scripts/presetDigest.mts` as the 2026-10-23 plan's Task 1 Step 2 describes:
- every import resolves from `process.env.ROOT`;
- each line prints `phys <sha>` and `faults <sha>`, keeping the sign of zero;
- a run that throws prints `throws <message>` on its line instead.

The 2026-10-22 plan's Task 1 Step 2 has the earlier form.

- [ ] **Step 3: Capture the baseline (in the background)**

Run each with `run_in_background: true`:
- `env ROOT=<temp>/main-tree npx --yes tsx <temp>/scripts/presetDigest.mts > <temp>/baseline/presetDigest.txt`
- `npx --yes tsx <temp>/main-tree/scripts/impactDigest.ts > <temp>/baseline/impactDigest.txt`
- `npx --yes tsx <temp>/main-tree/scripts/shotMix.ts > <temp>/baseline/shotMix.txt`
- `npx --yes tsx <temp>/main-tree/scripts/impactProbe.ts > <temp>/baseline/impactProbe.txt`

Expected: four non-empty files, and no `throws` line in the digest that the 2d outcomes don't record.

No commit.

---
### Task 2: The feet's reading

Spec §3 ("The builder verifies the reading at the gate's stage 1"), §7 stage 1.

**Files:**
- Create: `scripts/setupProbe.ts` (section F), `tests/engine/setupProbe.test.ts`
- Output: `docs/superpowers/probes/<date>-p2b2b2c3a-stage1.txt`

**Interfaces:**
- Produces, exported from `scripts/setupProbe.ts`:
  `feetReading(setup: ShotSetup, world: World): FeetReading`, where `FeetReading` is
  `{ handsAt: number; lowPoint: number; arrival: number; attack: number; lean: number }`:
  - `handsAt` is x_c (m), the hands at contact along aim from the striker's ball's centre;
  - `lowPoint` is the arc's lowest point along aim from the ball's centre, x_c + handArcLow·handReach (m);
  - `arrival` is `arcArrival` at the preset's values;
  - `attack` is the head's planned velocity's angle above horizontal at contact (rad), from `planStroke`'s arc:
    V_c + ω₀·n × (c − P_c);
  - `lean` is the shaft's lean at contact (rad).
- Later sections add to this script.

- [ ] **Step 1: Write the failing tests**

In `tests/engine/setupProbe.test.ts`, `describe("the feet's reading (P2b.2b.2c.3a design §3)")`:
- `it("puts the half roll's lowest point half its push ahead of its hands")`: `lowPoint − handsAt` equals
  0.5 × 0.15 to 1e-12.
- `it("gives the single-ball stroke no arrival and a level attack: its hands are still")`: `arrival` is 0, and
  `attack` is within 1e-12 rad of 0. Its hands are still and θ_c is 0, so the head swings through horizontally.
- `it("separates the feet from the lean once the hands move")`: on the half roll with `handArcLow` set to 0, 0.5 and
  1 (lean held), `lean` is identical across the three and `attack` differs between each pair by more than 1e-6 rad.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/engine/setupProbe.test.ts`
Expected: FAIL (the module does not exist).

- [ ] **Step 3: Implement `feetReading` and section F**

Section F prints, for every preset's canonical setup, `handsAt`, `lowPoint`, `arrival`, `attack` and `lean`, in mm
and degrees. Then, for each preset, it prints the same at `handArcLow` 0, 0.25, 0.5, 0.75 and 1 with the lean held.

- [ ] **Step 4: Run the tests and the section**

Run: `npx vitest run tests/engine/setupProbe.test.ts` — expected PASS.
Run: `env SECTION=F npx --yes tsx scripts/setupProbe.ts > docs/superpowers/probes/<date>-p2b2b2c3a-stage1.txt`

Confirm or refute each claim of spec §3 and its caveats in a short note at the file's head. The claims: the feet and
the lean are inseparable on a still top hand; they separate once the hands move; the low point is measured from the
hands, not the ball; the swing presets' feet change nothing.

- [ ] **Step 5: Checks and commit**

Run the four checks. No engine change, so no ratchet. Stage the script, the test and the probe file. Message:
`Add the set-up probe's reading of the feet`.

---
### Task 3: The downswing law

Spec §4.1, §4's first, second, sixth, seventh and eighth rows, and §6 ("one law"); decisions 1–4.

**Files:**
- Modify: `src/engine/swing/downswing.ts`, `src/engine/swing/buildContact.ts` (`validate`, `downswingOf`,
  `downswingInput`, `StrokeChoice`, `arcArrival`, `planStroke`'s arc), `src/engine/swing/profile.ts` (`shapeOf`,
  `SLOPE_HOLD`), `src/engine/swing/types.ts` (`SwingShape.slopeHold`), `src/engine/impact/types.ts`
  (`SwingArc.slopeHold`, `Downswing`'s doc), `src/engine/impact/track.ts` (`downswingHands`, `pendulumAt`,
  `prepareTrack`), `src/engine/impact/simulateImpact.ts` (`validateDownswing`, `slopeHold` in `validateTrack`)
- Migrate: `tests/engine/support/shot.ts` (`testProfile`'s default λ, decision 7), `tests/engine/support/impact.ts`,
  every test arc and `DownswingInput`/`StrokeChoice` literal named in this plan's grep
  (`grep -rn -E "mode: \"(swing|carry)\"" tests scripts`), `scripts/effortFit.ts`
- Test: `tests/engine/swing/downswing.test.ts`, `tests/engine/swing/buildContact.test.ts`,
  `tests/engine/impact/track.test.ts`
- Probe: `scripts/setupProbe.ts` section P

**Interfaces:**
- `planDownswing(input: DownswingInput): PlannedDownswing`. `DownswingInput` drops `mode` and adds
  `slopeHold: number` and `couple: number`. The rest is unchanged.
- `StrokeChoice` drops `mode` and adds `slopeHold: number`.
- `shapeOf(type: StrokeType, ref: StrokeShapeReference): Omit<SwingShape, "slopeHold">`. The profile spreads in
  `slopeHold: SLOPE_HOLD[type]`.
- `arcArrival(radius: number, low: number): number`, where `low` is s_low in m. Its callers pass
  `handArcLow * push`.
- `SwingShape.slopeHold: number` and `SwingArc.slopeHold: number`, each in [0, 1].
- In `downswing.ts`, the largest |τ_c| over the samples and its time (s from contact). The probe and the tests read
  it; `planDownswing` throws on it:
  ```ts
  export function requiredCouple(
      input: DownswingInput,
      down: Downswing,
  ): { readonly peak: number; readonly at: number };
  ```

- [ ] **Step 1: Write the failing tests**

The endpoints need no new test: the existing downswing tests pin both of today's paths, and the ratchet holds every
preset to the bit.

In `tests/engine/swing/downswing.test.ts`, `describe("the planned slope (P2b.2b.2c.3a design §4.1)")`:
- `it("derives a null tempo from the free swing's own fall")`: at λ = 1 with `handTempo` null, `release` equals
  λ = 0's `release` to 1e-15.
- `it("blends continuously between them")` (Review Focus 3): λ = 1e-9 against λ = 0, and λ = 1 − 1e-9 against
  λ = 1, compare θ at 20 evenly spaced times. Each is within 1e-6 rad.
- `it("plans a blend that starts at rest at the top and ends at θ_c at contact")`: λ = 0.5 on the half roll with
  `handTempo` given. θ[0] is θ_top, ω[0] is 0, the last θ is θ_c to 1e-12, and `release` is
  −(0.5·D_f + 0.5·T) to 1e-12.
- `it("rejects a plan the grip cannot hold")` (Review Focus 3): the half roll at λ = 1, with `gripLimit` lowered to
  1e-3 N, throws `/the grip cannot hold the planned slope/`.
- `it("asks nothing of the couple on a free swing")`: `requiredCouple` is not called at λ = 0, and `planDownswing`
  succeeds with `gripLimit` 1e-9.
- `it("needs a free swing to derive a missing tempo")` (Review Focus 3): λ = 1, `handTempo` null and
  `pendulumShare` 0 throw `/needs its pendulum to swing/`.
- `it("holds every backswing to the body's limit")`: a roll whose backswing passes θ_max throws the θ_max message.
  This replaces `backswingLimit.test.ts`'s carry case, which expected MAX_BACK_ANGLE.

In `tests/engine/impact/track.test.ts`, `describe("the slope after contact follows λ")`:
- `it("blends the free and held paths")`: at λ = 0.5, `pathAt(track, t).theta` is
  0.5·(θ at λ = 0) + 0.5·(θ at λ = 1) to 1e-12, at three times after the window.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/engine/swing/downswing.test.ts tests/engine/impact/track.test.ts`
Expected: FAIL (no `slopeHold`, no `requiredCouple`).

- [ ] **Step 3: Implement decisions 1–4**

- `planDownswing` computes the free table when λ < 1, or when λ = 1 with a null tempo (D_f is needed). It returns:
  - the table at λ = 0;
  - the closed form at λ = 1;
  - otherwise the blended table.
- It checks the couple when λ > 0 (`requiredCouple` against `input.couple`). The message names the couple needed, its
  time, C, the spread, F_max and the two grips.
- `downswingInput` computes `couple`. `downswingOf` passes `slopeHold` (the shape's; Task 10 adds the shot's) and an
  `arrival` from `arcArrival` on every stroke.
- `validate`:
  - drops the swing/carry block;
  - checks `slopeHold` in [0, 1] by name;
  - requires `pendulumShare` > 0 when λ < 1, or when λ = 1 with a null tempo;
  - checks `tempos` when a tempo is given.
- `planStroke`'s arc carries `slopeHold`.
- `downswingHands` adds the Hermite term to a table only when `tangent.z !== 0`.
- `pendulumAt` follows decision 4. `prepareTrack` tabulates the free table when `arc.slopeHold < 1`; it keeps `mode`
  for the body, the push and the advance.
- `validateDownswing(down, n)` checks by representation. `validateTrack` checks `slopeHold` by name and keeps its mode
  check until Task 9.
- Rewrite `downswing.ts`'s header, the `Downswing` doc and the `SwingShape` doc without "swing mode"/"carry mode".
- Migrate the callers listed under **Files**.

- [ ] **Step 4: Section P**

Section P prints, for every preset's canonical setup:
- λ, D_f (where computed), T, and the couple's peak and time against C;
- for the half roll and the drive, the planned speed at λ = 0, 0.25, 0.5, 0.75 and 1.

The drive at λ = 1 is Review Focus 3's figure.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/engine/swing tests/engine/impact` — expected PASS. Trace any other failure.

- [ ] **Step 6: Checks and the ratchet (in the background)**

Run the four checks. Rerun the ratchet into `<temp>/after/*-task3.txt`. Expected:
- every `phys` and `faults` line identical to Task 1's, except a run now rejected by θ_max on a roll or by the
  couple's bound, which prints `throws`;
- `impactDigest`, `shotMix` and `impactProbe` identical.

List any thrown runs in `<temp>/after/task3-moved.txt`. Run section P into the stage 1 probe file (append).

- [ ] **Step 7: Commit**

Message: `Plan every downswing's slope and bound it by the grip's couple`.

---
### Task 4: The hand model's design note

Spec §4's after-contact rows, §9; decisions 5, 6.

**Files:**
- Create: `docs/superpowers/probes/<date>-p2b2b2c3a-hand-model.md` (the note)
- Modify: `scripts/setupProbe.ts` (section R)

- [ ] **Step 1: Section R**

For every roll run in the preset digest's grid, played with the impact's probe, section R prints:
- the shaft's pitch turn since contact, times (r − b), at the pendulum phase's start (`impact.release`), against
  `reachSlack`;
- the first time before then, if any, that it exceeded the slack, from the snapshots' head orientation.

Append it to the stage 1 probe file. Expected: a count of roll runs that cross the slack early (0 supports decision
6's opening rule).

- [ ] **Step 2: The note**

Dispatch `hand-model-note` (opus, foreground, 600 s; it writes only the note, and reports by `SendMessage`). Its brief:
- read the spec, decision 6, `track.ts`'s `handLoad`, `carryLoad`, `prepareTrack`, `computePush`, `computeReach`,
  `advanceOf` and `integrate.ts`'s finish and latches, and section R's figures;
- answer decision 6's five questions;
- for each, give options, the presets each option moves and why, and a recommendation;
- read the code before asserting a mechanism; no code changes, no probes of its own.

The controller reads the note against the code and corrects any claim the code contradicts.

- [ ] **Step 3: Commit**

Stage the note, the script and the probe file. Message: `Write the unified hand model's design note`.

---
### Task 5: Gate stage 1

Spec §7 stage 1; decision 5.

- [ ] **Step 1: The questions**

Put each to the user one at a time, with options, pros, cons and a recommendation:
1. the feet's reading (Task 2's note);
2. the planned slope, `slopeHold` and its blend (decisions 1 and 4, section P);
3. the couple's bound and its firmness factor (decision 2);
4. each of the note's five answers, in its order.

- [ ] **Step 2: Record**

Write each ruling verbatim into the spec's Amendments, and the figures into the stage 1 probe file. If Task 3's design
is ruled otherwise, amend this plan and redo Task 3 before Task 6.

- [ ] **Step 3: Commit**

Stage the spec and the probe file. Message: `Record gate stage 1's rulings on the unified set-up`.

---
### Task 6: The small branches

Spec §1 criterion 1 (the dip raise), §4 (the jab; a slid grip anchor's decay).

**Files:**
- Modify: this plan (Step 1); `src/engine/swing/buildContact.ts` (the jab's check, the dip raise),
  `src/engine/impact/track.ts` (the slid anchor's decay)
- Test: `tests/engine/swing/buildContact.test.ts`, `tests/engine/impact/gripLimit.test.ts`

- [ ] **Step 1: Write the ruled note into this plan**

Add decisions 11 on from stage 1's rulings. Rewrite Tasks 7 and 8's steps to match them: tests with assertions,
signatures, the ratchet's expected set. Commit the plan alone: `Amend the unified set-up's plan with stage 1's
rulings`.

- [ ] **Step 2: Write the failing tests**

- `it("accepts a jab on a held slope")`: the half roll with `jab: 0.002` plans, and its `arc.dip.depth` is 0.002.
- `it("raises the dip by whether a croqueted ball is given")` (Review Focus 5): the AC stop with `croqueted` deleted
  and `timing.dip` −0.01 gives `arc.downswing` equal to the same shot's with `timing.dip` 0 (no raise). With
  `croqueted` given, the raise is today's.
- `it("returns a slid anchor on a held stroke too")`: in `gripLimit.test.ts`, a carry arc with no downswing, its
  anchor slid, decays at τ_arm under the limit as the swing case does.

- [ ] **Step 3: Implement**

- Drop the jab's carry rejection, and its line in `planStroke`'s doc.
- The dip raise reads `setup.croqueted !== undefined` in place of `CROQUET_STROKES.includes(type)`.
- The decay drops `!carry`.

- [ ] **Step 4: Tests, checks and the ratchet**

Expected:
- all bit-identical to Task 3's. Every digest setup gives a croqueted ball exactly on the croquet types, and the
  decay acts only where the hands hold a position spring before contact. A preset's roll has a downswing and is never
  gripped, so it has none;
- a moved line goes to the controller with a trace.

- [ ] **Step 5: Commit**

Message: `Let every stroke jab, slide its grip back, and raise its dip by the croqueted ball`.

---
### Task 7: The hand model

Spec §4's after-contact rows; decisions 6, 11 on.

**Files:** `src/engine/impact/track.ts` (`prepareTrack`, `handLoad`, `carryLoad`, `releasing`),
`src/engine/impact/integrate.ts` (`finishKind`, `finished`, the latches, `continueStroke`), their tests and the
migrated callers, as decisions 11 on name them.

**Interfaces:** as decisions 11 on name them. Fixed whatever the ruling:
- no `arc.mode` read in `track.ts` or `integrate.ts` after this task;
- `finishKind(plan)` keys on `arc.alpha < 0` (a brake), the push and neither;
- `ImpactRun.departure` is recorded on any stroke with a push.

- [ ] **Step 1: Write the failing tests** that decisions 11 on name. Whatever the ruling, they include:
  - `it("finishes a braked held stroke with the check's hold")`: the half roll at drive −1 plays to a finish of kind
    check, with no throw and no `follow-cap`;
  - `it("finishes a pushed swing stroke as a carry")`: the single-ball stroke with a push through finishes at its
    first apex after rising.
- [ ] **Step 2: Run them; expected FAIL.**
- [ ] **Step 3: Implement the ruled law.**
- [ ] **Step 4: Tests, checks and the ratchet.** Expected: the departures the ruling predicted, counted per preset
  in `<temp>/after/task7-moved.txt`; nothing else moves.
- [ ] **Step 5: Commit** with a message naming the ruled hand model.

---
### Task 8: The push through on every stroke

Spec §2 (3b), §3 (the hands after contact), §4 (the push, the hands after contact); decisions 6, 11 on.

**Files:** `src/engine/impact/track.ts` (`computePush`, `computeReach`, `advanceOf`, `pivotAt`, `reachedPivot`),
`src/engine/swing/buildContact.ts` (`checkAdvance`), their tests and callers, as decisions 11 on name them.

**Interfaces:** as decisions 11 on name them. Fixed: `PreparedTrack.push` is built on every stroke with a push length
above 0, and the advance no longer runs beside it.

- [ ] **Step 1: Write the failing tests** that decisions 11 on name. They include spec criterion 5's push cases:
  - `it("plays a stop with a push through end to end")`: the AC stop (drive −1) with `handReach` 0.15 and the
    ruled way to move its hands, through `simulateShot`, gives no `impact-cap`, no `follow-cap` and finite states;
  - the same for the drive at drive 0.
- [ ] **Step 2: Run them; expected FAIL.**
- [ ] **Step 3: Implement the ruled mechanism.**
- [ ] **Step 4: Tests, checks and the ratchet.** Expected: the presets bit-identical to Task 7's, since a push length
  of 0 keeps the hands at rest along aim. Runs with an advance or a swing preset's push move, listed.
- [ ] **Step 5: Commit**: `Push through on every stroke, the advance merged into the push`.

---
### Task 9: `StrokeMode` removed

Spec §1 criteria 1 and 8; decision 7.

**Files:**
- Modify: `src/engine/impact/types.ts` (`StrokeMode`, `SwingArc.mode`, `Hands`' doc), `src/engine/swing/types.ts`
  (`SwingDrive.mode`, every "carry only"/"swing only" doc), `src/engine/swing/profile.ts` (`DRIVE`),
  `src/engine/swing/buildContact.ts` (the mode check, `DRIVE_NUMBERS`' type, `planStroke`'s doc),
  `src/engine/impact/simulateImpact.ts` (the mode check), `src/engine/index.ts`
- Migrate: every remaining `mode` in `tests` and `scripts` (`grep -rn -E "StrokeMode|\.mode\b|mode:" tests scripts`
  less the contact model's, `simulate.ts`'s stick/slip and `contactModel.ts`'s)
- Test: `tests/engine/index.test.ts`, `tests/engine/impact/simulateImpact.test.ts`

- [ ] **Step 1: Write the failing tests**

- `index.test.ts`: `"StrokeMode" in engine` is false, and `SwingArc` and `SwingDrive` have no `mode` (a type test via
  `expectTypeOf` or a `// @ts-expect-error` literal).
- `simulateImpact.test.ts`: the `arc.mode must be "swing" or "carry"` case is replaced by
  `it("accepts a hand-built arc with no mode on any slope")`: an arc at λ = 0.5 with no `mode` simulates.

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Remove and rewrite**

- Remove the type, both fields and both checks.
- The docs of `holdWindow`, `pendulumAt`, `pendulumEffort`, `handArcRadius`, `handArcLow`, `advance` (if it survives
  Task 8) and `guideEffort` apply to every stroke.
- Spec criterion 1 requires that no comment or name in `src/engine` says "swing mode" or "carry mode". Check with
  `grep -rn -i -E "(swing|carry)[- ]mode|carry only|swing only" src/engine`, which must print nothing.

- [ ] **Step 4: Tests, checks and the ratchet.** Expected: bit-identical to Task 8's.

- [ ] **Step 5: Commit**: `Remove the stroke's mode`.

---
### Task 10: The per-shot inputs

Spec §1 criterion 2, §2; decision 8.

**Files:**
- Modify: `src/engine/swing/types.ts` (`ShotSetup.stroke`), `src/engine/swing/buildContact.ts` (`validate`,
  `contactPose`, `handsOf`, `downswingOf`, `planStroke`'s arc and doc), `src/engine/impact/types.ts`
  (`SwingArc.lowPoint`), `src/engine/impact/track.ts` (`computePush`), `src/engine/impact/simulateImpact.ts`
  (`lowPoint`'s check)
- Test: `tests/engine/swing/buildContact.test.ts`

**Interfaces:**
- `ShotSetup.stroke` gains `grip?`, `lean?`, `feet?` and `slopeHold?` (decision 8).
- An internal `stanceOf(setup: ShotSetup, geometry: StanceGeometry): SwingStance` merges the preset's stance with the
  shot's grip and lean. `contactPose`, `handsOf` and `validate` read it.

- [ ] **Step 1: Write the failing tests**

`describe("the per-shot set-up (P2b.2b.2c.3a design §2)")`:
- `it("changes nothing when no input is given")`: each preset's `planStroke` with `{}` spread on the stroke equals
  today's.
- `it("overrides one grip value alone")`: `grip: { bottomGrip: 0.5 }` on the half roll gives `hands.bottomGrip` 0.5
  and the other three the preset's.
- `it("sets the lean through handsAhead")`: `lean: 0.3` on the drive gives `contactPose`'s `thetaContact` −0.3 to
  1e-12.
- `it("keeps handsAhead when the top hand moves without a lean")`: `grip: { top: 0.7 }` on the drive keeps the
  preset's `handsAhead`.
- `it("places the hands' arc from the ball")`: `feet` on the half roll set to its canonical x_c + 0.075 gives an arc
  identical to the shot's without feet, to 1e-12 on `arrival`. With `feet` + 0.05, `arc.lowPoint` is s_low + 0.05.
- Review Focus 1, 2 and 4's cases, each asserting the RangeError's name.
- `it("plans a single shot's slope")`: `slopeHold: 0.5` on the drive gives `arc.slopeHold` 0.5.

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement decision 8.** List each new check in `planStroke`'s doc.

- [ ] **Step 4: Tests, checks and the ratchet.** Expected: bit-identical to Task 9's: no digest setup gives an input.

- [ ] **Step 5: Commit**: `Add the grip, lean, feet and slope plan as per-shot inputs`.

---
### Task 11: The checks

Spec §1 criteria 3, 5 and 6, §4.1 ("Refits allowed").

**Files:** `scripts/setupProbe.ts` (section X), `src/engine/swing/profile.ts` or `reference/swing.json` (refits only),
`tests/engine/setupProbe.test.ts`; output `docs/superpowers/probes/<date>-p2b2b2c3a-checks.txt`.

- [ ] **Step 1: Section X and its test**

Section X plays criterion 5's cases end to end through `simulateShot`:
- the AC stop and the drive, each with a push through (Task 8's form);
- the half roll braked at drive −1;
- the full roll at λ = 0.5.

It prints each one's events, flags, finish and ratio. In `setupProbe.test.ts`,
`it("plays the cross-mode cases with no guard hit")` asserts no `impact-cap`, `follow-cap` or thrown run for each.

- [ ] **Step 2: Criterion 6**

Run `followThroughProbe` section O and `swingProbe`'s rehit section into the checks file. For each preset whose
planned speed has left 3 m/s ± 2 %, refit its default backswing by bisection (`backswingForContact`) to 3 m/s. Record
old and new in the probe file, and land it as its own commit: `Refit <preset>'s backswing to 3 m/s`.

- [ ] **Step 3: The departures' list**

From every task's `moved` file, write per preset: the moved runs, by how much (ratio, finish time, flags), and the
mechanism. Append it to the checks file. Spec criterion 3 and decision 4 require that no departure is left unlisted.

- [ ] **Step 4: Checks and commit**: `Check the unified set-up's cross-mode cases and canonical runs`.

---
### Task 12: The drive's grip

Spec decision 3, §1 criterion 4, §5; decision 9.

**Files:** `src/engine/swing/profile.ts` (the drive's stance and its comment), `reference/sources/README.md`,
`scripts/setupProbe.ts` (section D), the tests that read the drive's grip.

- [ ] **Step 1: The hand breadth.** Find a 50th-percentile adult hand breadth with the `web-search` skill. Cite it
  (cite, don't mirror) under a new `## P2b.2b.2c.3a: the unified set-up` section, or label 0.09 m a placeholder.
- [ ] **Step 2: Move the grip.** The drive's `bottom` becomes 0.805 − w. The comment quotes Riches's stop-shot line
  ("With both hands at the top of the handle") and the user's account 3 and 7.
- [ ] **Step 3: Section D.** It reruns the drive's `guideEffort` grid (0, 0.25, 0.5, 0.75, 1) as profile.ts's comment
  describes: the re-contact after the parting, its time and speed change, and the ratio. It also reruns the AC stop's
  Gugan 5 stop (band 6.55–7.75) and its no-damage stance (no `impact-head-deep`, no `turf-yield`).
- [ ] **Step 4: Tests, checks and the ratchet.** Expected: only drive runs move, counted. A test reading the drive's
  `bottom` gets "P2b.2b.2c.3a: the drive's hands together (was 0.6)".
- [ ] **Step 5: Commit**: `Bring the drive's hands together at the top of the handle`. `guideEffort` stays 0.75
  unless stage 2 rules otherwise.

---
### Task 13: Gate stage 2

Spec §7 stage 2.

- [ ] **Step 1:** Put each to the user one at a time, with options and a recommendation:
  1. every departure from bit-identity (Task 11 Step 3);
  2. the drive's grip and its `guideEffort` (section D);
  3. the AC stop's band and stance, with a retune of its own grip if it has left the band (spec amendment A1);
  4. the cross-mode cases;
  5. each refit.
- [ ] **Step 2:** Land any re-tune the gate rules, each as its own commit with its moved runs counted.
- [ ] **Step 3:** Record each ruling verbatim in the spec's Amendments. Commit:
  `Record gate stage 2's rulings on the unified set-up`.

---
### Task 14: The records and the version

Spec §1 criterion 7.

- [ ] **Step 1:** Add the roadmap's "P2b.2b.2c.3a outcomes (<date>)": the figures, the departures, the rulings and
  the carried items. Fold this plan's ruled decisions into the spec's Amendments.
- [ ] **Step 2:** Set `ENGINE_VERSION` to `"0.18.0"` (`src/engine/simulate.ts:77`) and update the test that pins it.
- [ ] **Step 3:** Run the four checks and `SLOW_TESTS`. Then commit: `Record P2b.2b.2c.3a's outcomes and set engine
  0.18.0`.
- [ ] **Step 4:** Remove `<temp>/main-tree` with `git worktree remove`, and ask the user before pushing or opening the
  PR.
