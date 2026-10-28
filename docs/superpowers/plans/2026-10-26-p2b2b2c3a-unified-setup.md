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

**Decisions from gate stage 1** (spec amendment A2, 2026-10-27). Items 1–3 ratify decisions 1, 2, 4 and 8's feet as
built or planned; none sends Task 3 back. Items 4–8 become decisions 11–15. Task 7 builds 11–14, Task 8 builds 15.
Figures cited as `track.ts:<n>` are at 6bf5df1.

11. **The swung body: the chains on every stroke** (A2 item 4).
    - `prepareTrack` builds `body = carryBody(head, hands.chain, arc.radius, hands.bottom)` and
      `released = carryBody(head, hands.chain, arc.radius, null)` on every stroke. `PreparedTrack.released` becomes
      `SwungBody` (never null). `swungBody` and the arm mass stay for the downswing's plan (`downswingInput`).
    - Each hand's chain is fed its grip times its moment share: the top γ_T × its share plus F_d, the bottom g_B × its
      share. `chainFed` still adds the chain's own m·a and weight in full.
    - Each hand's flex gains scale with its grip, as `handGains` scales the coupling: k(γ) = γ·k, c(γ) = √γ·c. A new
      export in `flex.ts`:
      ```ts
      /** `gains` for a grip γ in (0, 1]: k·γ and c·√γ (P2b.2b.2c.3a A2 item 4). */
      export function gripGains(gains: FlexGains, grip: number): FlexGains;
      ```
    - The chain's elements (K1–K4, C1–C4, the masses) are unchanged. The rolls' grips are 1, and × 1 and √1 are exact,
      so the rolls keep their bits.
12. **One control law after contact: the carry law as the base** (A2 item 5). `handLoad` drops its swing branch
    (`track.ts:1887-1926`); `carryLoad` runs on every stroke from relaxAt.
    - **The top hand** feeds γ_T × its share plus F_d through its chain, flexed at `gripGains(·, γ_T)`. Once the
      bottom hand has opened, it feeds γ_T × the whole F_ff (`scale(whole, γ_T)`, so the rolls' `whole` keeps its
      bits).
    - **The bottom hand** feeds g_B × its share, flexed to its turning target at `gripGains(·, g_B·e)`, where e is
      `guideEffort` outside a check and 1 inside one. The rolls' `guideEffort` is 1.
    - **The check's share** (`checkShare`) acts on any stroke with α < 0: `checking` drops `!carry`.
    - **The twist** is g_B × the twist share plus the bottom's twist damper, as `carryLoad` has it, on every stroke.
    - **Only with a push** (`track.push !== null`):
      - the posture hold: `holdWeight` is read only then, and the hold weight is 0 otherwise (`flexGains`' rhythmic
        gains, no added term);
      - the push intent (`pushIntent`) and the sensed resistance (`ballsOnHead`, `senseResistance`);
      - the first-departure latch (`grip.departedAt`, `ImpactRun.departure`);
      - the pendulum phase (`releasing`).
    - **The chains** step on every stroke (`integrate.ts` drops the `carry` guards on `advanceChains`); the probe's
      snapshots carry `chains` on every stroke.
    - **Removed:** the top hand's damper c(γ_T) after contact, the one-sided rate guide, the swing law's
      `guideEffort` × max(0, c_B × lag) push after opening, and the `!carry` guard on the check.
13. **The bottom hand opens at the earlier of the signed reach and the pendulum phase** (A2 item 6).
    - The test moves to the top of `handLoad`'s contact branch, before the body is chosen: once
      (r − b)·(π − π_c) > `reachSlack` (signed, as `track.ts:1890`) or `releasing(track, t)`, set `grip.releasedAt`
      and `releaseDelta` once.
    - `handLoad` then takes its body from `swungOf(track, grip)` in every branch, so the integrator and `handLoad`
      agree on a reach opening too. The rolls open at the same step as today, so they keep their bits (0 of 678 cross
      the signed slack, section R).
    - After opening, on every stroke, the bottom hand pushes along e with `pendulumEffort` × F_pendulum until the shaft
      is vertical (`track.ts:1683`), and the `rising` and `vertical` latches run. Every preset's `pendulumEffort` is
      0.
    - A push of length 0 has no pendulum phase: Task 8 (decision 15).
14. **The finish from the inputs** (A2 item 7).
    - `finishKind` becomes an export keyed on the inputs, with no mode read:
      ```ts
      /** The finish of `plan` (P2b.2b.2c.3a A2 item 7): a brake (α < 0) a check, else a push a carry, else a swing. */
      export function finishKind(plan: PreparedTrack): FinishKind;
      ```
    - A check finishes once the push has ended (no push, or t ≥ `push.end`) and the head is at rest relative to the
      hands. A push whose plan never reaches the push length (`push.end` null) never ends, and the run reaches
      `follow-cap`, flagged and listed.
    - The hold stays on the firm grip (handLoad's `gripped`), and the chains let go at it: the gripped branch sets
      `grip.topChain` and `grip.bottomChain` to null.
    - `held` moves from `FreePendulum` to `PreparedTrack` (`held: { from: number; theta: number } | null`).
      `pendulumAt` returns it, for t past the window and at or after `from`, before its λ branches. `freePath` drops
      its own `held` read, and `holdPendulum(track, from)` works at any λ and reads θ from `pendulumAt`. For λ < 1 it
      returns the same {θ_hold, 0, 0} as the table did: bit-identical.
15. **One push on every stroke, the advance merged into it** (A2 item 8).
    - `prepareTrack` builds `push = computePush(track)` wherever `arc.handReach > 0`, and `null` at 0. With no push,
      `reach` is `restingReach` (today's path for a handReach of 0); with one, `reach` is null.
    - `computeReach` goes. `PreparedTrack.advance` goes, and `Push` gains `advance: Advance | null`
      (`advanceOf(arc, arc.advance)`, unchanged in shape).
    - The push's along-aim travel is the plan's travel plus the advance's (`advanceTravel`) where there is one, on the
      hands' arc, capped at the push length, where it stops at once.
    - `travelTime` (so `push.end` and `push.pendulum`) and `carryPivot` count both. With no advance they keep today's
      arithmetic (branch, no added zero).
    - `pivotAt` is `reachedPivot`: no separate advance.
    - `checkAdvance` drops its mode and check rules, so a stop may push, and keeps the handReach, speed and ramp
      checks.
    - The swing finish's advance guard goes: a stroke with a push never finishes as a swing.
    - `FollowThrough.advanced` reads `plan.push?.advance`.
    - Deferred to P2b.2b.2c.3b: the ease at a push's end (A2 item 8), and the couple's share of C as an effort or
      envelope cost (A2 item 3).
16. **Departures the note did not predict.** The preset digest plays every roll at drives −1 and −0.5, where α < 0.
    Under decisions 12 and 14 those runs take the check's share inside the window and the check's hold after it, so
    they move: the note's "rolls identical" holds only for α ≥ 0. They are counted in Task 7 and ruled at stage 2.
    - **Until Task 8**, `prepareTrack` still chooses the push against the reach and the advance by `arc.mode`. It is
      the last `arc.mode` read in `track.ts`, and Task 8 removes it.
    - **After Task 7**, `integrate.ts` reads no mode.

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
| `src/engine/impact/flex.ts`, `tests/engine/impact/flex.test.ts` | `gripGains` (Task 7) |
| `tests/engine/impact/advance.test.ts` | The push on every stroke (Task 8) |
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

Spec §4's after-contact rows, amendment A2 items 4–7; decisions 11–14, 16.

**Files:**
- Modify: `src/engine/impact/track.ts` (`PreparedTrack.released`, `PreparedTrack.held`, `FreePendulum.held`,
  `prepareTrack`, `pendulumAt`, `freePath`, `holdPendulum`, `handLoad`, `carryLoad`, `holdWeight`, the docs that say
  "carry mode" or "swing mode" for what now acts on every stroke), `src/engine/impact/flex.ts` (`gripGains`),
  `src/engine/impact/integrate.ts` (`finishKind`, `finished`, the departure latch, `ballsOnHead`, the chains' steps,
  `continueStroke`)
- Test: `tests/engine/impact/flex.test.ts`, `tests/engine/impact/track.test.ts`, `tests/engine/impact/hands.test.ts`,
  `tests/engine/impact/followThrough.test.ts`
- Migrate: every test or script that reads `track.released` as nullable or `free.held`
  (`grep -rn -E "\.released\b|\.held\b" tests scripts`)

**Interfaces:**
- `gripGains(gains: FlexGains, grip: number): FlexGains` (decision 11).
- `finishKind(plan: PreparedTrack): FinishKind`, exported with `type FinishKind = "swing" | "check" | "carry"`
  (decision 14).
- `PreparedTrack.released: SwungBody`; `PreparedTrack.held: { readonly from: number; readonly theta: number } | null`;
  `FreePendulum` loses `held`.
- No `arc.mode` read in `integrate.ts`. In `track.ts` only `prepareTrack`'s choice of the push against the reach and
  the advance (decision 16).

- [ ] **Step 1: Write the failing tests**

In `tests/engine/impact/flex.test.ts`:
- `it("scales a hand's flex by its grip: k·γ and c·√γ")`: `gripGains({ stiffness: 200, damping: 10 }, 0.25)` is
  `{ stiffness: 50, damping: 5 }` to 1e-12. At grip 1 each field is `toBe` the input's.

In `tests/engine/impact/track.test.ts`, `describe("the swung body on every stroke (P2b.2b.2c.3a A2 item 4)")`:
- `it("holds a swing arc's mallet by both hands' skin, and by the top's alone once released")`: `prepareTrack` of a
  hand-built arc with `mode: "swing"` and `slopeHold: 0` gives `body` equal to
  `carryBody(TEST_HEAD, hands.chain, arc.radius, hands.bottom)`, and `released` equal to
  `carryBody(TEST_HEAD, hands.chain, arc.radius, null)`.
- `it("holds a checked stroke on its held path at λ = 1")`: a still arc with `slopeHold: 1` and α −300.
  - `holdPendulum(track, from)`, with `from` the window's end, does not throw.
  - `pathAt(held, from + 0.01).theta` and `pathAt(held, from + 0.05).theta` are each `toBe`
    `pathAt(track, from).theta`.
- `it("holds a free table's pendulum where it was")`: the same at `slopeHold: 0`, where each is `toBe` the table's θ
  at `from`.

In `tests/engine/impact/hands.test.ts`, `describe("one law after contact (P2b.2b.2c.3a A2 item 5)")`. Each test runs
one `handLoad` step after relaxAt, with the head on the path and `newGripState()`, unless it says otherwise:
- `it("feeds each hand its grip times its moment share, the dip in full")`: the swing arc `TIMED` with `slopeHold: 0`
  at t = 0.009 against the same with both grips 1.
  - For γ_T in {0.1, 1}: `sub(load.top, dip)` is within 1e-9 of γ_T × `sub(firm.top, dip)`.
  - For g_B in {0.25, 1}: `load.bottom` is within 1e-9 of g_B × `firm.bottom`.
  - The chains take hold in equilibrium (`holdChain`), so the first step's grip forces are the feeds.
- `it("scales the bottom hand's flex by guideEffort outside a check, and leaves a check in full")`:
  - On `still()`: `grip.bottomStiffness` at `guideEffort` 0.5 is 0.5 × its value at 1, to 1e-12 relative, and 0 at
    `guideEffort` 0.
  - On `still({ omega0: 3, alpha: -300 })` at t = 0.005: `grip.bottomStiffness` at 0 is `toBe` its value at 1.
- `it("holds the posture only with a push")`:
  - On a swing arc (no push), `grip.topStiffness` with `departedAt` null is `toBe` its value with `departedAt` −1e9.
  - On a carry arc with a push, the two differ.
- `it("lets go of the chains at a stop's hold")`: a `handLoad` step with `gripped` true on a grip that holds both
  chains leaves `grip.topChain` and `grip.bottomChain` null.
- `it("records a ball's first departure only with a push")`: `integrate` of a swing arc striking a ball has no
  `departure`. The existing carry test keeps its one.

In `tests/engine/impact/hands.test.ts`, `describe("the bottom hand's opening (P2b.2b.2c.3a A2 item 6)")`:
- `it("never opens on a shaft turning back through the slack")`: as "release by reach"'s first test, turned through
  −(reachSlack + 1e-3)/lever. `grip.releasedAt` stays null.
- `it("then pushes forward along e with pendulumEffort·F_pendulum until vertical")`: an opened grip
  (`releasedAt` 1e-3, `bottomChain` null) on a swing arc.
  - At `pendulumEffort` 0.5, `load.bottom` is within 1e-9 of 0.5·`pendulumForce`·e.
  - At `pendulumEffort` 0 its length is 0.
  - Past vertical (`grip.vertical` true) its length is 0.

In `tests/engine/impact/followThrough.test.ts`, `describe("the finish from the inputs (P2b.2b.2c.3a A2 item 7)")`:
- `it("names each preset's finish by its inputs, not its type")`: `finishKind` of each canonical plan.
  - "swing" for single-ball and the drive; "check" for both stops; "carry" for the three rolls at their canonical
    drive.
  - "check" for the half roll at drive −1.
- `it("finishes a braked held stroke with the check's hold")`: the half roll at drive −1, through `simulateStroke`, has
  no throw, no `follow-cap`, and `follow.finish` at or after its `push.end`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/engine/impact/flex.test.ts tests/engine/impact/track.test.ts` and
`npx vitest run tests/engine/impact/hands.test.ts tests/engine/impact/followThrough.test.ts`
Expected: FAIL (no `gripGains`, no `finishKind` export, the swing law still runs).

- [ ] **Step 3: Implement decisions 11–14**

As the decisions state. Keep every roll's arithmetic: multiply by a grip or `guideEffort` rather than branch on 1, and
add no zero terms (Global Constraints).

- [ ] **Step 4: Rewrite the swing law's tests**

Each test below asserts a term decision 12 removes. Rewrite it against the unified law, or delete it where a Step 1
test replaces it, and say which in the commit message:
- `hands.test.ts`, "the feed-forward split": "feeds the top hand the whole F_s in swing mode outside a check" (replaced
  by the feed test) and "splits F_s over both hands inside a check" (kept, on the unified law).
- "the bottom hand's rate guide": every test. The check's share assertions on `feedForward` stay. The guide's
  assertions on `bottom` go, and "scales the push by guideEffort" is replaced by Step 1's test.
- "release by reach": "then pushes only forward along e on its velocity lag" (replaced).
- "let a relaxed top hand sink the head at (1 − γ_T)·m·g/c(γ_T)" (the top damper goes): trace, then rewrite it as
  the loose hand's feed, γ_T × its share of the weight.
- The push intent's and the chain's "is never read in swing mode": the first becomes "is never read without a push";
  the second, "holds a swing arc through the chains too", where `grip.topChain` is non-null after a contact step.
- `track.test.ts`: `released` expected null on a swing arc.

Any other failure: trace the mechanism, then re-baseline with "P2b.2b.2c.3a: <the change> (was <old>)".

- [ ] **Step 5: Tests, checks and the ratchet (in the background)**

Run the four checks. Rerun the ratchet into `<temp>/after/*-task7.txt` (`DROP=slopeHold`). Expected:
- **Preset digest:**
  - every single-ball, drive, AC stop and GC stop line moves;
  - every roll line at drives 0, 0.5 and 1 is bit-identical;
  - every roll line at drives −0.5 and −1 moves (decision 16);
  - any new `throws`, or a roll at α ≥ 0 that moves, stops the task.
- **`impactDigest` and `impactProbe`:** identical where they play force tables. A moved line is traced to decision
  11–14 or stops the task.
- **`shotMix`:** moves where it plays a swing preset or a braked roll.

Count the moved lines per preset and drive, with each preset's ratio and finish time at canonical old and new, in
`<temp>/after/task7-moved.txt`. The controller runs `SLOW_TESTS`.

- [ ] **Step 6: Commit**

Message: `Hold every stroke through the hand–arm chains under one law after contact`, with the moved counts and each
rewritten test's old and new figure.

---
### Task 8: The push through on every stroke

Spec §2 (3b), §3 (the hands after contact), §4 (the push, the hands after contact), amendment A2 item 8;
decision 15.

**Files:**
- Modify: `src/engine/impact/track.ts` (`Push`, `PreparedTrack.advance`, `PreparedTrack.reach`'s doc, `prepareTrack`,
  `computePush`, `computeReach` removed, `travelTime`, `carryPivot`, `pivotAt`, `reachedPivot`),
  `src/engine/impact/integrate.ts` (`finished`'s advance guard, `FollowThrough.advanced`),
  `src/engine/swing/buildContact.ts` (`checkAdvance`, `planStroke`'s doc)
- Test: `tests/engine/impact/advance.test.ts`, `tests/engine/impact/track.test.ts` (the reach's tests),
  `tests/engine/impact/followThrough.test.ts`
- Migrate: `scripts/singleBallProbe.ts` (`track.advance`), and every other reader of `track.advance` or `track.reach`

**Interfaces:**
- `Push` gains `readonly advance: Advance | null`. `PreparedTrack.advance` is removed.
- `PreparedTrack.push` is non-null exactly where `arc.handReach > 0`. `PreparedTrack.reach` is `restingReach` where
  the push is null, and null otherwise.
- After this task, no `arc.mode` read in `track.ts` or `integrate.ts`.

- [ ] **Step 1: Write the failing tests**

In `tests/engine/impact/advance.test.ts`, `describe("the push on every stroke (P2b.2b.2c.3a A2 item 8)")`:
- `it("pushes still hands with an advance along the hands' arc")`: single-ball with `handReach` 0.3 and
  `timing.advance` 0.
  - `track.push` and `track.push.advance` are non-null.
  - At `push.end`, the hands have travelled 0.3 along aim from contact, to 1e-9.
  - Their height above the push's origin is `push.level − √(ρ_h² − (0.3 − push.low)²)`, to 1e-12.
- `it("builds no push at length 0, the hands resting along aim")`:
  - The canonical single-ball and the half roll with `handReach` 0 have `track.push` null.
  - Their hands' along-aim travel from contact is 0 at contact + 0.1 s.
  - The half roll's run has no pendulum phase: `release`, if present, has `deltaTheta` past the signed slack.
- `it("plays a stop with a push through end to end")` (criterion 5): the AC stop at drive −1 with `handReach` 0.15
  and `timing.advance` 0, through `simulateShot`.
  - No `impact-cap`, no `follow-cap`, and finite states.
  - `finishKind` is "check", and `follow.finish` is at or after `push.end`.
- `it("plays a drive with a push through end to end")` (criterion 5): the drive at drive 0 with `handReach` 0.15 and
  `timing.advance` 0. No `impact-cap`, no `follow-cap`, and `finishKind` "carry".
- `it("finishes a pushed swing stroke as a carry")`: single-ball with `handReach` 0.3 and `timing.advance` 0.
  - Its follow-through's pitch rate about n is positive at some sample after `release.t`.
  - It is at or below 0 at the finish.
  - It has no `follow-cap`.
- `it("merges an advance into a roll's push")`: the half roll with `timing.advance` 0 against without.
  - `push.end` is earlier with the advance.
  - The hands' along-aim travel never exceeds `handReach` + 1e-12, sampled every 1 ms to contact + 2 s.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/engine/impact/advance.test.ts`
Expected: FAIL (no push on a swing stroke; the advance is rejected on a roll and a check).

- [ ] **Step 3: Implement decision 15**

Remove the last `arc.mode` read in `track.ts` (decision 16).

- [ ] **Step 4: Rewrite the advance's and the reach's tests**

- `advance.test.ts`, "rejects carry mode, a check, no travel and a non-finite timing": now "rejects no travel and a
  non-finite timing". The roll's and the GC stop's advance plan.
- The advance's other tests now run on the push, on the hands' arc, with the push intent, the posture hold and the
  pendulum phase acting on it. Trace each moved figure ("flattens the head's rise", "resumes the arc", "carries the
  hands handReach in all"). Re-baseline it with "P2b.2b.2c.3a: the advance on the push's arc (was <old>)", or
  rewrite it where its claim no longer holds, and say which in the commit message.
- `track.test.ts`'s reach tests (`computeReach`'s t1, its null where the plan falls short, a swing arc's reach): they
  become the push's on the same arcs, or go where Step 1 covers them.

- [ ] **Step 5: Tests, checks and the ratchet (in the background)**

Expected:
- **Preset digest:** bit-identical to Task 7's. No digest run sets an advance, the swing presets' `handReach` is 0
  (`restingReach`, as `computeReach` gave it), and the rolls' push is unchanged.
- **`impactDigest`, `impactProbe` and `shotMix`:** identical to Task 7's.
- A moved line is traced, or it stops the task.

- [ ] **Step 6: Commit**

Message: `Push through on every stroke, the advance merged into the push`.

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
  `grep -rn -i -E "\b(swing|carry)[- ]mode\b|\b(carry|swing) only\b" src/engine`, which must print nothing. The
  word boundaries keep "swing model" and "downswing only" out (Task 9's finding).

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
