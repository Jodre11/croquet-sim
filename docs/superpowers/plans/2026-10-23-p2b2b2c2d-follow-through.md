# P2b.2b.2c.2d — The Follow-Through: a Player's Control on Every Croquet Stroke: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The follow-through becomes a player's control on every croquet stroke: magnitude `stroke.drive`, sharpness
`stroke.window`, smooth pulses with gravity acting through them, a planned brake with the dip coupled to it,
re-contacts after the parting judged by their effect, and better-grounded defaults ruled at a two-stage gate;
`ENGINE_VERSION` becomes 0.17.0.

**Architecture:**

- `src/engine/faults.ts`: #35's tidy (Task 1), then the re-contacts after the parting (Tasks 7 and 10).
- `src/engine/impact/track.ts`: the minimum-jerk pulse (Task 2); gravity through swing mode's pulse, the free
  pendulum's table starting at the pulse (Task 3); carry mode's hold keeping the preset's window (Task 4).
- `src/engine/swing/buildContact.ts`, `src/engine/swing/downswing.ts`, `src/engine/swing/types.ts`: `stroke.window`
  (Task 4); the dip coupled to the pulse, the lead, the planner's dip on croquet strokes (Task 5).
- `src/engine/impact/integrate.ts`, `timeline.ts`, `types.ts`: `impact-no-strike` (Task 6); each face–ball interval's
  impulse and the ball's velocities (Task 7).
- `src/engine/swing/profile.ts`: `DEFAULT_TIMING` and the ruled defaults (Task 13).
- `scripts/followThrough.ts` (new): the harness — first touch, the routes, the contact-speed solve. The probe
  `scripts/followThroughProbe.ts` (new) holds this step's sections; `croquetFitProbe.ts` is left as it is but for
  `digestGrid` moving to `scripts/ratioFit.ts`.
- Order, as spec §9's ratchet, with the gate's two stages:
  1. the baseline and the tidy;
  2. the smooth pulse;
  3. gravity through the pulse;
  4. sharpness;
  5. the coupled dip;
  6. the planned brake;
  7. the re-contacts, with placeholder thresholds;
  8. the harness and stage 1's probe sections;
  9. gate stage 1;
  10. the ruled thresholds;
  11. stage 2's candidates;
  12. gate stage 2a (the defaults);
  13. the defaults landed;
  14. the checks;
  15. gate stage 2b (the checks);
  16. the records and the version.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), Vitest, ESLint, Prettier. No
new dependencies. `npx --yes tsx` runs the scripts.

**Spec:** `docs/superpowers/specs/2026-10-23-p2b2b2c2d-follow-through-design.md`. Read all of it, especially
"Decisions" (11 and 12 were added after planning), "My calls", §3 (§3.5 the stance sweep), §4, §6, §7, §9 and §10.
It is this plan's only source of decisions; do not re-open them.
Also read:

- **The previous plan:** `docs/superpowers/plans/2026-10-22-p2b2b2c2c-contact-laws.md`, for the conventions kept here
  (the preset digest with `phys` and `faults`, the gate, the documents).
- **Roadmap:** `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`, the P2 row's P2b.2b.2c.2d entry,
  "P2b.2b.2c.2c outcomes (2026-10-23)" and its "Carried open items", and "Provisional numbers". Line 12 is one
  enormous table row: grep it narrowly, never print it whole.
- **Evidence:** `docs/superpowers/probes/2026-10-20-p2b2b2c2-drive-double-hit.md` (§3a, §4: the drive's late catch);
  `docs/superpowers/probes/2026-10-23-p2b2b2c2c-gate.txt` (section N: 922 of 950 flagged).

**Decisions made while planning.** Task 16 folds each into the spec's Amendments.

1. **Gravity cannot leave drive 0 bit-identical, so the smooth pulse and gravity are two commits.** Ruled by the user,
   2026-10-24 ("A: every stroke"), and recorded as the spec's decision 12, with §6 and §9 step 2 amended.
   - Today the pendulum's window runs on the constant α alone, gravity dropped, even at drive 0 (α = 0;
     `track.ts:938-944`). Once gravity acts through the window (spec §3.1), every swing-mode run moves, drive 0
     included. Spec §9 step 2's "single-ball and drive at drive 0 bit-identical" and §6's "single-ball's default drive 0
     makes it bit-identical" cannot both hold with "gravity always acts".
   - The minimum-jerk pulse alone keeps the box's end states to the bit (decision 2). So Task 2 (the shape) leaves every
     run at drive 0 bit-identical, and its moved runs are those with drive ≠ 0. Task 3 (gravity) moves every
     swing-mode run, counted per preset, and leaves every carry-mode run bit-identical to Task 2.
2. **The arc keeps its fields; the pulse's shape changes.**
   - `SwingArc.alpha` and `pivotAcceleration` stay the box's mean rates, Δω/T and Δv/T, so their signs, `inCheck`,
     `checkAdvance` and `finishKind` read as today.
   - Within the window the acceleration is mean·6s(1 − s), s = τ/T. Since ∫₀¹6s(1 − s) ds = 1 and
     ∫₀¹(3s² − 2s³) ds = ½, the end states are the box's: ω_e = ω_a + mean·T, θ_e = θ_a + ω_a·T + ½·mean·T². Keep
     `thetaEnd`, `omegaEnd`, `pivotEnd` and `pivotVelocityEnd`'s expressions exactly; only the in-window branches of
     `pendulumAt` and `planPivot` change.
   - Within the window: ω = ω_a + mean·T·(3s² − 2s³), θ = θ_a + ω_a·τ + mean·T²·(s³ − s⁴/2), α = 6·mean·s(1 − s);
     the hands likewise with V, P and A.
   - Carry mode's hold starts from α₀ = 0 (spec §3.1): `a0` in `pendulumAt`'s carry branch becomes 0, and its terms
     drop out. Branch on it rather than multiply by zero.
3. **Gravity through the pulse in swing mode only.**
   - Carry mode's arc is kinematic: its downswing runs on the hands' tempo and its hold is a held slope. Gravity never
     enters its plan, and the impact's hand–arm chains carry the mallet's weight. Swing mode's pendulum is the one
     gravity drives before and after the window.
   - Swing mode's free table (`computeFree`) starts at `arcStart`, not at the window's end. It is tabulated by
     semi-implicit Euler every FREE_STEP as today, with θ̈ = freeAlpha(θ, t) + pulse(t) inside the window and
     freeAlpha alone after it. pulse(t) = alpha·6s(1 − s). `FreePendulum.tw` keeps its meaning as the table's first
     time; it becomes `arcStart`.
   - `pendulumAt` in swing mode reads the table for every t > arcStart, its α being freeAlpha + pulse(t).
     `thetaEnd`/`omegaEnd` in swing mode are the table's values at the window's end, by the same interpolation.
     `holdPendulum` and `integrate.ts:1341` read them unchanged.
   - `prepareTrack(…, withFree = false)` tabulates through the pulse only, so that reads up to the window's end still
     work. A read past the pulse still throws. Its two callers (`buildContact.ts:751`, `trajectory.ts:79`) read only
     t ≤ arcStart.
   - The player's effort ends at the pulse's start: freeAlpha has no effort term, as the free pendulum after the window
     has none today. This holds whether the pulse begins before or after contact.
4. **The bounds on `stroke.window`.**
   - `MIN_WINDOW = 1e-3` s and `MAX_WINDOW = 0.1` s, exported from `buildContact.ts`, both "Numerical, not physical".
   - MIN: 200 impact steps resolve a pulse's peak and jerk.
   - MAX: a pulse and carry mode's one-window hold after it, from an onset up to MAX_LEAD early, end well inside
     TRACK_IMPACT_CAP (0.15 + 2 × 0.1 < 0.45 s). The presets' windows are 5–30 ms.
   - A shot's window sets `arc.window` and `arc.handWindow`. `SwingArc` gains `holdWindow?: number`, carry mode's hold
     (the preset's `window`; absent, `window`), so the hold keeps the preset's length (spec §3.1). With
     `stroke.window` absent, `holdWindow` is omitted and every run is Task 3's to the bit.
5. **The dip coupled to the pulse.**
   - `dip.start = lead + timing.arc + timing.dip`.
   - The lead: `max(0, −arc, −hands, −(arc + dip), −advance (if any), turf)`. MAX_LEAD's check reads it, and its
     message names the dip when the dip is the earliest.
   - Every existing caller setting `timing.arc ≠ 0` on a stroke with a dip (handDrop + jab > 0) is rewritten as
     dip′ = dip − arc, so its dip keeps its absolute time. Known ones:
     - `buildContact.test.ts:350`, `:362`, `:465`;
     - `scripts/swingProbe.ts:1022-1024` (its "arc" offsets on the AC stop: `dip: −offset`).
   - Grep `arc: -?0?\.[0-9]` and `arc: -` over `tests` and `scripts` for the rest. A caller on a stroke with no dip is
     left alone: its dip has depth 0 and never acts.
6. **The planner's dip on croquet strokes.**
   - On a croquet stroke whose dip starts before the planned contact, z_c, the dip's travel by contact
     (`lowering(depth, dropTime, 4·depth/dropTime², contactAt − dip.start).z`), raises the planned downswing: the
     downswing, the hands' arc and the scan are planned to a pivot and head z_c higher than the contact pose. The dip
     then lowers them onto the pose at contact.
   - The pose itself, and the "head in turf at contact" check on it, are unchanged: the head meets the ball at the
     shot's `contact.up`.
   - `scanDownswing` gains an optional `lowering?: (u: number) => number` (the dip's z at u s from contact, u ≤ 0)
     subtracted from each sample's height.
   - Single-ball strokes, and every stroke whose dip starts at or after contact, take today's path. Branch on z_c > 0
     and on the stroke being a croquet stroke; never add a zero.
   - `track.ts` exports `dipTravel(depth, duration, e): number`, the z of its unexported `lowering` with
     a = 4·depth/duration²; `dipAt` keeps calling `lowering`.
7. **No strike.** A tracked drive's impact that reaches its cap with no face–ball interval on any ball also pushes
   `{ kind: "impact-no-strike", t }`, beside `impact-cap`. This is a new `ImpactEvent`, documented in `types.ts`'s list.
   A head stopped in the turf keeps `impact-head-stopped` alone. Nothing throws; the balls are handed over as they lie.
8. **`checkShare` under an early brake** (spec §4.1). It already holds the brake to rest: `rate ≤ 0` gives share 0
   whatever the planned rate, so a path that passes rest (planned < 0) never drives a forward-moving head past rest.
   Before relaxAt the grips are firm and follow the path, as the player's planned brake does. No code change: a test
   pins it, and `checkShare`'s comment states it for an early brake.
9. **The face–ball interval's record.**
   - Each face–ball `ContactInterval` gains:
     - `impulse: Vec3`, the face's impulse on the ball over the interval (N·s, world): the sum over its steps of the
       change `applyPair` makes to that ball's force, times dt;
     - `velocities: { readonly before: Vec3; readonly after: Vec3 }`, the ball's velocity at the interval's first step
       and at its end, or at the impact's end for an interval still open (`closeTimeline` gains the final velocity).
   - A rim step adds no impulse. Ball–ball, turf and obstacle intervals carry neither field.
   - `recordStep` gains an optional fifth argument `face?: { readonly impulse: Vec3; readonly velocity: Vec3 }`. Only
     the face–ball call sites pass it, so other pairs' intervals keep their keys.
   - The digests: `presetDigest.mts` gains `DROP`, a comma-separated list of keys its replacer removes; the
     `impactDigest` comparison strips the same keys with `<temp>/scripts/strip.py`. Task 7's `phys` comparison runs with
     `DROP=impulse,velocities`.
10. **The re-contact report.**
    - `StrikeTaps` gains `recontacts: readonly ReContact[]`, empty when `parted` is null. The type:
      ```ts
      export interface ReContact {
          readonly start: number;
          readonly end: number;
          readonly intervals: number;
          readonly separation: number;
          readonly gap: number;
          readonly afterParting: number;
          readonly impulse: Vec3;
          readonly speedChange: number;
          readonly angleChange: number;
          readonly fault: boolean;
      }
      ```
    - Grouping: walk the non-exempt face contacts in order. A contact joins the previous group when the separation
      before it (the previous interval's `clearanceAfter`, 0 when absent) is below `MERGE_SEPARATION`.
    - A group is a re-contact when its first interval starts at or after `parted`. `intervals` is the group's count,
      `separation` the clearance before it, `gap` its start less the previous interval's end, and `afterParting` its
      start less `parted`.
    - `impulse` is the group's sum. `speedChange` is (|v_after| − |v_before|)/|v_before|, from the first interval's
      `before` and the last's `after`; it is +Infinity when |v_before| is 0. `angleChange` is the unsigned horizontal
      angle between them in degrees, 0 when either horizontal speed is 0.
    - `fault`: |speedChange| ≥ EFFECT_SPEED or angleChange ≥ EFFECT_ANGLE.
    - 29.1.6.1 is raised when some re-contact is a fault: at the first such re-contact's start, with today's
      `contactEvidence(...)` plus `afterParting`, the number of faulting re-contacts.
11. **Placeholders that reproduce today's flags.** `MERGE_SEPARATION = 0`, `EFFECT_SPEED = 0` and `EFFECT_ANGLE = 0`,
    each commented "Placeholder until the gate's stage 1 rules it (spec §7)". Under them no contact merges, every group
    is one interval, and every re-contact is a fault (≥ 0). So Task 7 leaves every finding as it is, and only `strike`
    gains `recontacts`. Task 10 lands the ruled values; only then do findings move.
12. **Gate stage 2 sits twice.** The checks of §8 run "on the moved defaults", which the gate must first choose. Stage
    2a (Task 12) rules §6's candidates; Task 13 lands them; Task 14 runs §8's checks, the follow-through grid at the new
    defaults and criterion 9; stage 2b (Task 15) rules those. A check that fails at 2b may send a default back to 2a.
13. **The harness and the probe.**
    - `scripts/followThrough.ts` holds what tests can pin:
      - `firstTouch(setup, world): FirstTouch | null`, where `FirstTouch` is `{ contactSpeed, up, lean, t,
        plannedSpeed }`. `contactSpeed` is the head's velocity along aim at the first step of the first face–ball
        interval on the striker, from the impact's probe; `up` is the ball's centre from the face's centre along the
        face's upward axis there; `lean` is the shaft's lean there (rad, forward positive); `plannedSpeed` is
        `plannedSpeed(setup, world)`. It returns null for a run with no face contact on the striker.
      - `routesOf(setup, world): Routes`, where `Routes` is `{ touch: FirstTouch | null; taps: { start; impulse;
        share }[]; recontacts: readonly ReContact[]; ratio: number }`. `share` is the tap's impulse along aim over the
        striker's w₁·m_ball.
      - `backswingForContact(setup, speed, world): number`: bisection on the backswing for the contact speed, 50
        halvings over the bracket `backswingFor` uses, a RangeError naming both ends' contact speeds when the speed lies
        outside them, never returning an end.
    - `digestGrid` moves from `croquetFitProbe.ts` to `scripts/ratioFit.ts`, exported unchanged.
    - `scripts/followThroughProbe.ts` takes `SECTION` (a letter or `all`), as `croquetFitProbe.ts` does.

    | Section | Content | Task |
    |---|---|---|
    | A | The follow-through grid with each route's share (§3.4) | 8, 14 |
    | B | The brake sweep (§4.3) | 8 |
    | C | The drive's late catch, diagnosed (§6) | 8 |
    | D | The re-contacts' spread over the 950-run grid and A's grid (§7) | 8, 10 |
    | S | The stance sweep: the AC stop and the drive over leans −8° to +4° (§3.5) | 8 |
    | E | The AC stop's calibration at 3 m/s contact speed (§6) | 11 |
    | F | The drive's `guideEffort` candidates (§6) | 11 |
    | G | The full roll's hypothesis variant (§6, §8.2) | 11 |
    | H | Gugan 5's drive and stop, jabs 0–6.5 mm (§8.1) | 14 |
    | I | The rolls' hypotheses (§8.2) | 14 |
    | J | Gugan's jab qualifier (§8.3) | 14 |
    | K | Super pass-rolls (§8.4) | 14 |
    | L | The push's cap (§8.5) | 14 |
    | M | STRIKE_WINDOW re-checked (§8.6) | 14 |
    | N | Step convergence (§8.7) | 14 |
    | O | Criterion 9: every preset's canonical setup top to finish | 14 |

    `all` runs A–D and S before Task 11, and every section after.
14. **The stance in the harness** (spec §3.5, decision 11).
    - `guganSetup`'s options gain:
      - `lean?: number`, the shaft's lean at contact (rad, forward positive), set as the stance's `handsAhead` by
        `handsAheadFor(lean, stance.top, up, geometry)` with the setup's own mallet and ball;
      - `up?: number`, the contact's `up` (m);
      - `grips?: StrokeType`, whose stance's `bottom`, `gripTension` and `bottomGrip` replace the preset's.
    - The overrides apply after the mallet: Gugan's mallet stays the one solved at the preset's own stance (a player
      changes stance, not mallet), so `gugansMallet` and its lean check are unchanged. `lean` is applied last, after
      `up` and `grips`.
    - `scripts/followThrough.ts` exports `turfLimited(setup, world): number`, the head's lowest point at contact (m,
      negative in the turf), by `headLowestPoint` on `contactPose`'s head. Section S prints a lean with a negative
      value as turf-limited and does not play it.

## Global Constraints

- **Formatting.**
  - Use 4-space indentation, a 120-column limit, LF line endings and UTF-8.
  - Check line lengths with `env LC_ALL=en_GB.UTF-8 grep -nE "^[^|].{120,}$" <file>`. Table rows in markdown are
    exempt, and roadmap lines 12 and 29 are known pre-existing hits.
  - Run `npx prettier --write` on every code and JSON file you touch. `npm run format:check` must pass.
  - `.prettierignore` lists `docs/`, so wrap markdown by hand. Wrap comments and break template literals over 120
    columns by hand.
- **Engine purity.** `src/engine/**` is pure and deterministic: no DOM, no time of day, no randomness.
- **Determinism lint.** Engine code uses only `+ − * /`, comparisons, `Math.sqrt`, `Math.abs`, `Math.min`,
  `Math.max`, `Math.round`, `Math.floor`, `Math.ceil`, `Math.PI`, `Number.isFinite`, and the engine's `sinCos`,
  `atan2`, `ln`, `exp` and `pow`. Tests and scripts may use any `Math`.
- **Style.** No non-null assertions (`!`); `x as T` after indexing. Braces on every `if`. `0 - x`, not unary minus,
  in engine arithmetic. Exported functions carry a header comment. A constant that is not physical says "Numerical,
  not physical" and why; an unsourced one awaiting a ruling says "Placeholder". `import type` for type-only imports.
  Argument lists all on one line, or one per line when more than three or past 120 columns. Comments give reasons,
  not process labels ("plan decision N", "Task N").
- **Units.** SI. Figures printed in mm, ms or degrees say so.
- **Vocabulary.**
  - "Split", "ratio" and "cut" keep their croquet meanings only.
  - The gap, the squeeze, the tap and the double tap are as the contact laws spec defines them.
  - Follow-through, magnitude, sharpness, brake, parting, contact speed and planned speed are as this spec's
    "Vocabulary" defines them.
  - The pendulum/hands share is "phasing", the turf's drag "ploughing".
- **Engine version.** `ENGINE_VERSION` becomes `"0.17.0"` (Task 16).
- **The ratchet** (spec §9): the preset digest (`phys` and `faults`), `impactDigest`, `shotMix` and `impactProbe`,
  against Task 1's baseline and the previous task's run.
  - Task 1: all bit-identical.
  - Task 2: every run at drive 0 bit-identical, every carry run at drive 0 included; moved runs counted per preset.
  - Task 3: every carry-mode run bit-identical to Task 2's; swing-mode runs moved, counted per preset.
  - Task 4: bit-identical to Task 3's.
  - Task 5: bit-identical to Task 4's. The digest grid and the canonical setups are all `ON_TIME`.
  - Task 6: bit-identical to Task 5's but for `impact-no-strike` events, listed.
  - Task 7: `phys` (with `DROP=impulse,velocities`), `shotMix`, `impactProbe` and `impactDigest` (stripped)
    bit-identical; `faults` moved only by `strike.recontacts`, and every finding unchanged.
  - Task 10: `phys` bit-identical; findings moved, counted per preset (922 flagged at Task 1).
  - Task 13: each default alone, its moved canonical and grid runs counted.
  - Code with an input absent keeps today's arithmetic: branch on it rather than add a zero term (`x + 0` turns −0
    into +0).
  - Any change outside the task's expected set stops the task and goes to the controller with a trace.
- **The ratchet's runs** run in the background and must finish, and match, before that task's commit.
  - `pgrep -fl tsx` must print no digest or probe process before a commit.
  - Each output file must be non-empty.
  - Compare `shotMix` and `impactProbe` with their timing lines dropped: `grep -v "ms per shot" <file> > <file>.cmp`
    and `grep -v "µs/step" <file> > <file>.cmp`.
- **Slow tests** run only when `SLOW_TESTS` is set, by the controller, never while an implementer is editing. A test
  over about 5 s locally gets an explicit timeout of at least 4× its local time.
- **Subagents** are dispatched in the foreground with a 600 s timeout and named.
  - The controller runs the long probes, the digests and `SLOW_TESTS` itself.
  - Implementers stage their work and stop before committing until the controller reports the ratchet matches.
  - Subagents deliver their result by `SendMessage` to the controller.
- **RED steps.** Vitest does not type-check: a test using a missing export fails at runtime, and `npm run check` shows
  the type errors.
- **Behaviour figures.**
  - A test resting on model behaviour carries its reasoning in a comment.
  - Where a test fails, trace the mechanism before changing an expectation.
  - A re-baselined figure gets the comment "P2b.2b.2c.2d: <the change> (was <old>)", and its commit message gives old
    and new.
  - No test is loosened to pass. A changed expectation the spec and this plan do not predict goes to the gate and into
    the Amendments.
- **Circularity.** The rolls are held-out: never tuned to a ratio. The AC stop and the drive are calibration targets
  against Gugan 5 only. A user hypothesis is run and recorded, never fitted. The re-contact thresholds are ruled from
  the spread, never set to make a count come out.
- **Kept as they are.**
  - The face and ball–ball laws, the default gap, the mallet, the lawn's pace and the hands' constants.
  - `pushForce` 92.2 N, and swing mode's `handAcceleration`.
  - The single-ball 29.1.6.2, the no-parting branch of 29.1.6.1, and 29.1.6.3 unjudged.
  - Gugan's jab check stays `it.runIf(SLOW).fails` unless it now passes; the weak stroke stays `it.todo`.
  - Nothing is scripted per stroke type, and nothing in the engine reacts to the impact on the player's behalf.
- **Process.**
  - Follow the plan's steps; no side probes: figures come from the steps that produce them.
  - The gates (Tasks 9, 12 and 15) **stop for the user**, whatever they show.
  - Put each question to the user one at a time, with options, pros, cons and a recommendation, and record each ruling
    verbatim in the spec's Amendments.
- **Bash.**
  - One command per call: no `&&`, `||`, `;`, `$(…)` or subshells.
  - Redirecting a script's output with `>` or `2>` is allowed.
  - No `bash -c` or `node -e`; use `python3 -I` for JSON checks.
  - Never `git -C` into another worktree; run the baseline only through `npm --prefix <temp>/main-tree` or
    `npx tsx <path>`. `npm --prefix` needs the `/private/tmp/…` spelling of `<temp>`.
  - A heredoc containing the text "diff --git" trips the worktree guard; write such content with the Write tool.
- **The temp directory.**
  - `<temp>` is the executing session's literal `CLAUDE_TEMP_DIR`, written out in full; a subagent is given it in its
    prompt.
  - Throwaway scripts go in `<temp>/scripts/`, outputs in `<temp>/baseline/` and `<temp>/after/`, sources in
    `<temp>/sources/`.
  - `<date>` is the day the step runs, YYYY-MM-DD. `<wt>` is this worktree's absolute path.
- **Sources.** Cite, don't mirror: the URL, the date, the SHA-256 of the fetched file and short annotated quotes in
  `reference/sources/README.md`; commit no fetched file.
- **Commits.**
  - Use a short imperative sentence (repo style), signed.
  - Write the message to a fresh `<temp>/msg-task<N>.txt` and commit with `git commit -F <that path>`.
  - Check with `git log -1 "--format=%G? %h"`; expect `G`. If signing refuses, leave the change staged and report it.
  - Stage by explicit path. Never `--no-verify`, `-c commit.gpgsign=false` or bare `git stash`.
- **Checks after every task:** `npm test`, `npm run lint`, `npm run check` and `npm run format:check`, one per call,
  all pass. The baseline is 1290 passed, 12 skipped, 1 todo.
- **Known noise.** The editor's LSP may report stale "Cannot find module" diagnostics; `npm run check` is the source
  of truth.
- **Worktree.** All work happens in `/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2c2d-follow-through`, on
  branch `worktree-p2b2b2c2d-follow-through`, based on `main` at e4eb8df (PR #36). The spec and this plan are its
  first commits. The branch stays local until the PR.

## Review Focus

The spec implies each input below, but none of its listed tests exercises it. The owning task pins each with a test.

1. **A brake so early or strong that the head never strikes.** The impact ends at its cap with `impact-no-strike`;
   every state is finite. `judgeFaults` reports `strike.parted` null, no taps, no re-contacts, and raises no 29.1.6.1.
   `simulateShot` returns an outcome. Pinned in Task 6 ("a brake that leaves no face contact ends at the cap,
   reported").
2. **`stroke.window` at and beyond its bounds, and with nothing to shape.**
   - MIN_WINDOW and MAX_WINDOW are accepted; `MIN_WINDOW·(1 − 1e-9)`, `MAX_WINDOW·(1 + 1e-9)`, 0, NaN and a negative
     value throw a RangeError naming `stroke.window`.
   - At drive 0 any window gives the same path as no window, to within 1e-12 m.
   - Pinned in Task 4 ("checks stroke.window's bounds", "shapes nothing at drive 0").
3. **A dip offset that puts the dip before the impact's start, or past MAX_LEAD.**
   - arc −0.01 s with dip −0.02 s gives a lead of 0.03 s and a dip starting at t = 0 exactly.
   - arc −0.1 s with dip −0.06 s throws, naming the dip and 0.16 s.
   - Pinned in Task 5 ("leads by the coupled dip", "rejects a coupled dip past MAX_LEAD").
4. **A re-contact's record at its edges.**
   - A gap with no noted clearance (`clearanceAfter` absent) counts as separation 0.
   - An interval still open at the impact's end takes its `after` velocity at the duration.
   - A re-contact from a ball at rest has `speedChange` +Infinity and is a fault.
   - Pinned in Task 7 ("treats a gap with no clearance as separation 0", "closes an open interval's velocities at the
     impact's end", "flags a re-contact that sets a still ball moving").
5. **A croquet stroke whose balls never meet, and a continuation stroke.**
   - With `parted` null, `recontacts` is empty and 29.1.6.1 is judged as today.
   - A continuation stroke's re-contacts are grouped and judged as a croquet stroke's, after its own parting.
   - An exempt contact is filtered out before grouping.
   - Pinned in Task 7 ("keeps the no-parting rule", "judges a continuation stroke's re-contacts after its parting",
     "drops an exempt contact before grouping").

---
## File Structure

| Path | Change |
|---|---|
| `src/engine/faults.ts`, `tests/engine/faults.test.ts` | The tidy (Task 1); the re-contacts (Tasks 7, 10) |
| `src/engine/impact/track.ts`, `tests/engine/impact/track.test.ts`, `reference/sources/README.md` | The smooth pulse (Task 2), gravity (Task 3), the hold (Task 4) |
| `src/engine/impact/types.ts` | `holdWindow` (Task 4), `impact-no-strike` (Task 6), the interval's record (Task 7) |
| `src/engine/swing/buildContact.ts`, `src/engine/swing/types.ts`, `tests/engine/swing/buildContact.test.ts` | `stroke.window` (Task 4); the dip, the lead (Task 5) |
| `src/engine/swing/downswing.ts`, `tests/engine/swing/downswing.test.ts` | The scan's lowering (Task 5) |
| `src/engine/impact/simulateImpact.ts` | `holdWindow`'s validation (Task 4) |
| `src/engine/impact/integrate.ts`, `src/engine/impact/timeline.ts`, `tests/engine/impact/timeline.test.ts`, `tests/engine/impact/simulateImpact.test.ts` | No strike (Task 6); the interval's record (Task 7) |
| `tests/engine/impact/followThrough.test.ts` | The planned brake (Task 6) |
| `reference/laws.json`, `src/reference/index.ts`, `tests/reference/reference.test.ts` | The thresholds and their readings (Tasks 7, 10) |
| `scripts/followThrough.ts`, `scripts/followThroughProbe.ts`, `tests/engine/followThroughHarness.test.ts` | New (Task 8 on) |
| `scripts/ratioFit.ts`, `scripts/croquetFitProbe.ts` | `digestGrid` moved (Task 8) |
| `scripts/swingProbe.ts` and the rewritten tests | The callers (Task 5) |
| `src/engine/swing/profile.ts`, `tests/engine/support/shot.ts` | `DEFAULT_TIMING` and the defaults (Task 13) |
| `docs/superpowers/probes/<date>-p2b2b2c2d-*.txt`, the roadmap, the spec | The gates, the figures, the rulings (Tasks 9, 12, 15, 16) |
| `src/engine/simulate.ts:77` | `ENGINE_VERSION` 0.17.0 (Task 16) |

---
### Task 1: The baseline and the tidy

Spec §2, §9 step 1; exit criterion 1.

**Files:**
- Modify: `src/engine/faults.ts:284-312` (`partingOf`), `:419-441` (29.1.6.1)
- Temp, never committed: `<temp>/main-tree/`, `<temp>/scripts/presetDigest.mts`, `<temp>/scripts/strip.py`,
  `<temp>/baseline/*`

**Interfaces:**
- Produces:
  - the baseline worktree `<temp>/main-tree` at e4eb8df;
  - `<temp>/baseline/<name>.txt` for `presetDigest`, `impactDigest`, `shotMix`, `impactProbe`, `swingProbe`;
  - `presetDigest.mts`, which later tasks run with `ROOT` and optionally `DROP` set;
  - `strip.py`, which removes the keys named in its first argument from every JSON object in an `impactDigest`
    `timeline` line, writing the result to stdout.
- In `faults.ts`, unexported: `touchedPairKeys(context: StrokeContext, impact: ImpactResult): string[]`.

- [ ] **Step 1: The baseline worktree**

Run: `mkdir -p <temp>/scripts <temp>/baseline <temp>/after <temp>/sources`
Run: `git worktree add --detach <temp>/main-tree main`
Run: `npm --prefix <temp>/main-tree ci` (never a symlinked `node_modules`)
Expected: both succeed; `git rev-parse main` prints e4eb8df….

- [ ] **Step 2: The digest tools**

Create `<temp>/scripts/presetDigest.mts` from the 2026-10-22 plan's Task 1 Step 2: its header names this plan, every
import resolves from `process.env.ROOT`, and each line prints `phys <sha>` and `faults <sha>`. Add `DROP`
(plan decision 9): its keys are removed by the replacer from both hashes.

Create `<temp>/scripts/strip.py` (run with `python3 -I`).

- [ ] **Step 3: Capture the baseline (in the background)**

Run each with `run_in_background: true`:

Run: `env ROOT=<temp>/main-tree npx --yes tsx <temp>/scripts/presetDigest.mts > <temp>/baseline/presetDigest.txt`
Run: `npx --yes tsx <temp>/main-tree/scripts/impactDigest.ts > <temp>/baseline/impactDigest.txt`
Run: `npx --yes tsx <temp>/main-tree/scripts/shotMix.ts > <temp>/baseline/shotMix.txt`
Run: `npx --yes tsx <temp>/main-tree/scripts/impactProbe.ts > <temp>/baseline/impactProbe.txt`
Run: `npx --yes tsx <temp>/main-tree/scripts/swingProbe.ts > <temp>/baseline/swingProbe.txt`

- [ ] **Step 4: The tidy**

- `partingOf`'s `keys` comes from `touchedPairKeys`. Its comment says `croqueted` is defined for a croquet stroke,
  since `validate` has checked it.
- The 29.1.6.1 block computes the faulting contacts first, for both branches, then makes one `add()`. It attaches
  `afterParting` only when `parted` is non-null. The findings' order and every evidence key stay as they are.
- No test changes: the existing 29.1.6.1 and double-tap cases are the acceptance.

- [ ] **Step 5: Tests, checks and the ratchet**

Run: `npx vitest run tests/engine/faults.test.ts` — expected PASS. Run the four checks.

Rerun Step 3's first four lines from the worktree into `<temp>/after/*-task1.txt`, with `ROOT=<wt>` and the
worktree's own `scripts/…`. Compare each with `cmp`, using the `.cmp` files for `shotMix` and `impactProbe`.
Expected: all identical.

- [ ] **Step 6: Commit**

Stage `src/engine/faults.ts`. Message: `Tidy the double-tap judge's 29.1.6.1 branches and pair keys` (closes #35 in
the PR body, not the commit).

---
### Task 2: The smooth pulse

Spec §3.1 (the shape), §9 step 2; exit criterion 2 (all but gravity); plan decisions 1, 2.

**Files:**
- Modify: `src/engine/impact/track.ts:580-598` (`planPivot`), `:931-966` (`pendulumAt`'s window and carry hold), the
  file header (lines 1–10), `SwingArc`'s doc in `src/engine/impact/types.ts`; `reference/sources/README.md`
- Test: `tests/engine/impact/track.test.ts`

**Interfaces:**
- Produces: no new names. `pathAt(track, t)` within a window now gives α = 6·alpha·s(1 − s) and
  socketAcceleration's hands' part = 6·pivotAcceleration·s(1 − s).

- [ ] **Step 1: Write the failing tests**

In `tests/engine/impact/track.test.ts`, a `describe("the smooth pulse (P2b.2b.2c.2d design §3.1)")`. Use the file's
`trackDrive` and `ARC` helpers. `ARC` is carry mode (the file's swing case spreads `mode: "swing"` over it), and
carry mode's window is untouched by Task 3's gravity, so these cases stand after it. The hands' window is put wholly
before `contactAt`, where the planned pivot is read directly (carry mode's push starts at contact).

```ts
const T = carryArc.window;
const at = (track: PreparedTrack, s: number) => pathAt(track, carryArc.arcStart + s * T);
it("keeps the box's change over the window, the pulse's mean rate", () => {
    const track = prepareTrack(trackDrive(carryArc), TEST_HEAD, 0);
    const w = (s: number) => dot(at(track, s).angularVelocity, track.axis);
    expect(w(1) - w(0)).toBeCloseTo(carryArc.alpha * T, 12);
    expect(track.thetaEnd).toBe(track.thetaArc + track.omegaArc * T + 0.5 * carryArc.alpha * T * T);
});
it("starts and ends at zero acceleration, peaking at 1.5 times the mean", () => {
    const track = prepareTrack(trackDrive(carryArc), TEST_HEAD, 0);
    expect(at(track, 1e-9).pendulumAcceleration).toBeCloseTo(0, 6);
    expect(at(track, 1).pendulumAcceleration).toBeCloseTo(0, 9);
    expect(at(track, 0.5).pendulumAcceleration).toBeCloseTo(1.5 * carryArc.alpha, 9);
});
it("has the jerk ±6·Δω/T² at the window's ends", () => {
    // dα/dτ = 6·mean/T·(1 − 2s): a finite difference over 1e-7 s at each end.
    const track = prepareTrack(trackDrive(carryArc), TEST_HEAD, 0);
    const h = 1e-7 / T;
    const jerk = (s: number) => (at(track, s + h).pendulumAcceleration - at(track, s).pendulumAcceleration) / 1e-7;
    expect(jerk(0)).toBeCloseTo((6 * carryArc.alpha) / T, 0);
    expect(jerk(1 - h)).toBeCloseTo((-6 * carryArc.alpha) / T, 0);
});
it("shapes the hands' push the same way", () => {
    // A quarter into the window the box has given A·T/4; the minimum-jerk profile A·T·(3/16 − 2/64) = 0.15625·A·T.
    const track = prepareTrack(trackDrive(carryArc), TEST_HEAD, 0);
    const v = (t: number) => handsAt(track, t).velocity;
    const gained = sub(v(carryArc.handStart + T / 4), v(carryArc.handStart));
    expect(length(gained)).toBeCloseTo(0.15625 * length(carryArc.pivotAcceleration) * T, 12);
});
it("starts carry mode's hold from rest acceleration, continuous at the window's end", () => {
    const track = prepareTrack(trackDrive(carryArc), TEST_HEAD, 0);
    const end = carryArc.arcStart + T;
    expect(pathAt(track, end + 1e-9).pendulumAcceleration).toBeCloseTo(pathAt(track, end).pendulumAcceleration, 6);
});
```

`carryArc` is `{ ...ARC, alpha: 40, pivotAcceleration: vec3(0, 3, 0), handStart: ARC.contactAt - 2 * ARC.window }`
(`handWindow` equal to `window`). Read `ARC`'s fields and adjust the literal so both windows lie within the arc's span
and `handStart ≥ 0`. Wrap and Prettier.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/engine/impact/track.test.ts`
Expected: FAIL (constant α in the window; the carry hold steps from α₀ = 5).

- [ ] **Step 3: Implement**

- Change `pendulumAt`'s window branch and `planPivot`'s hands' window branch to plan decision 2's forms. Keep
  `prepareTrack`'s end states as they are.
- The carry hold starts from α₀ = 0: drop its `a0` terms.
- The file header and `SwingArc.alpha`/`pivotAcceleration`'s docs say they are the pulse's mean rates, delivered as
  a minimum-jerk profile.
- Cite Flash and Hogan 1985 ("The coordination of arm movements: an experimentally confirmed mathematical model",
  J. Neurosci. 5(7):1688–1703) in `reference/sources/README.md` under a new section
  `## P2b.2b.2c.2d: the follow-through (design §3.1)`:
  - fetch the open-access PDF twice into `<temp>/sources/flash-hogan/` with `curl -sSL`, hash both with
    `shasum -a 256`, and record the URL, date and digest if they agree;
  - quote only the minimum-jerk profile's statement;
  - if no open copy is fetchable, cite by DOI marked "not fetched".

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/engine/impact` and `npx vitest run tests/engine/swing`.
Expected: the new tests PASS. Any other failure is traced (Global Constraints, "Behaviour figures"): a test at drive
≠ 0 that reads inside a window may move; a test at α = 0 must not.

- [ ] **Step 5: Checks and the ratchet (in the background)**

Run the four checks. Rerun the ratchet into `<temp>/after/*-task2.txt`.

Expected:
- every `presetDigest` line labelled `drive 0`, and every canonical run whose preset's default drive is 0 (single-ball
  and drive), identical to Task 1's;
- every moved line is at drive ≠ 0.

List the moved runs per preset in `<temp>/after/task2-moved.txt`.

- [ ] **Step 6: Commit**

Message: `Deliver the follow-through's pulses as minimum-jerk profiles`.

---
### Task 3: Gravity through the pulse

Spec §3.1 (gravity), §9 step 2; exit criterion 2 (gravity); plan decisions 1, 3.

**Files:**
- Modify: `src/engine/impact/track.ts` (`computeFree`, `prepareTrack`, `pendulumAt`, `FreePendulum`'s and
  `prepareTrack`'s docs)
- Test: `tests/engine/impact/track.test.ts`, `tests/engine/swing/skipFree.test.ts`

**Interfaces:**
- Produces: `FreePendulum.tw` is `arcStart` in swing mode. `pendulumAt` reads the table for every t > arcStart. No
  signature changes.

- [ ] **Step 1: Write the failing tests**

```ts
describe("gravity through the pulse (P2b.2b.2c.2d design §3.1)", () => {
    it("adds gravity's share to the pulse in swing mode, against a hand integration", () => {
        // RK4 at 1e-7 s of θ̈ = (−W·sin θ − M·d·(A·t̂))/I_P + 6·alpha·s(1 − s) over the window, from thetaArc and
        // omegaArc; the table's semi-implicit Euler at FREE_STEP agrees to O(FREE_STEP).
        const track = prepareTrack(trackDrive(swingArc), TEST_HEAD, STANDARD_GRAVITY);
        const hand = integratePulse(track, 1e-7);
        expect(track.omegaEnd).toBeCloseTo(hand.omega, 4);
        expect(track.thetaEnd).toBeCloseTo(hand.theta, 6);
    });
    it("drops the player's effort from an early pulse's start, never gravity", () => {
        // A brake begun 10 ms before contact at intensity 0 on the GC stop (no dip, so Task 5 leaves the case alone):
        // before the pulse the downswing table, from it the free pendulum plus the pulse; θ is continuous at arcStart.
        const early = { arc: -0.01, hands: 0, dip: 0 };
        const c = buildContact(canonicalSetup("stop-gc", { stroke: { timing: early } }), WORLD);
        const track = prepareTrack(c.drive as TrackDrive, c.head, WORLD.gravity);
        const { arcStart } = track.arc;
        expect(pathAt(track, arcStart + 1e-9).theta).toBeCloseTo(pathAt(track, arcStart).theta, 9);
        expect(track.free?.tw).toBe(arcStart);
    });
    it("is continuous in θ, ω and the socket at the window's end", () => {
        const track = prepareTrack(trackDrive(swingArc), TEST_HEAD, STANDARD_GRAVITY);
        const end = swingArc.arcStart + swingArc.window;
        const [a, b] = [pathAt(track, end - 1e-9), pathAt(track, end + 1e-9)];
        expect(b.theta).toBeCloseTo(a.theta, 8);
        expect(length(sub(b.socket, a.socket))).toBeLessThan(1e-8);
    });
    it("leaves carry mode's window as the pulse alone", () => {
        const g = prepareTrack(trackDrive({ ...ARC, alpha: 5 }), TEST_HEAD, STANDARD_GRAVITY);
        const z = prepareTrack(trackDrive({ ...ARC, alpha: 5 }), TEST_HEAD, 0);
        expect(g.thetaEnd).toBe(z.thetaEnd);
    });
});
```

`swingArc` is Task 2's `carryArc` with `mode: "swing"` and `handReach: 0`. `integratePulse(track, h)` is a local RK4
helper reading `track.free`'s `weight`, `inertial` and `inertia`, and the planned pivot's acceleration from
`pathAt(track, t).socketAcceleration` less the pendulum's own terms (or from `handsAt` by finite difference; the
builder's choice, stated in the helper's comment). Update `skipFree.test.ts` if it asserts that a read inside the
window throws (it now must not) or that the table starts at the window's end. The pulse is added to θ̈ only when
`alpha ≠ 0`, so that a table at drive 0 is the bare free pendulum's.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/engine/impact/track.test.ts tests/engine/swing/skipFree.test.ts`
Expected: FAIL (no gravity in the window; `tw` at the window's end).

- [ ] **Step 3: Implement** plan decision 3. `withFree = false` tabulates from `arcStart` to the window's end only.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/engine/impact tests/engine/swing tests/engine/shot.test.ts`.
Expected: the new tests PASS. Every other swing-mode figure that moves is traced to gravity's share in the window,
re-baselined with the comment "P2b.2b.2c.2d: gravity through the pulse (was …)". Carry-mode figures do not move.

- [ ] **Step 5: Checks and the ratchet (in the background)**

Run the four checks and the slow suite (`env SLOW_TESTS=1 npm test`, the controller). Rerun the ratchet into
`<temp>/after/*-task3.txt`.

Expected:
- every carry-preset line (`half-roll`, `full-roll`, `pass-roll`) identical to Task 2's;
- swing-preset lines moved, counted per preset in `<temp>/after/task3-moved.txt`;
- `impactDigest`'s force-table scenarios identical.

- [ ] **Step 6: Commit**

Message: `Let gravity act through the swing's follow-through pulse`.

---
### Task 4: Sharpness: `stroke.window`

Spec §3.2, §3.3, §9 step 3; exit criterion 3; plan decision 4.

**Files:**
- Modify: `src/engine/swing/types.ts` (`stroke.window`; `drive`'s documentation, spec §3.3: the mapping and the four
  follow-throughs' names), `src/engine/swing/buildContact.ts` (validation, the arc), `src/engine/impact/types.ts`
  (`SwingArc.holdWindow?`), `src/engine/impact/track.ts` (the carry hold reads `holdWindow ?? window`),
  `src/engine/impact/simulateImpact.ts:215` (`holdWindow` positive when given)
- Test: `tests/engine/swing/buildContact.test.ts`, `tests/engine/impact/track.test.ts`

**Interfaces:**
- Produces: `ShotSetup.stroke.window?: number`; `MIN_WINDOW`, `MAX_WINDOW` from `buildContact.ts`;
  `SwingArc.holdWindow?: number`.

- [ ] **Step 1: Write the failing tests**

```ts
describe("sharpness: stroke.window (P2b.2b.2c.2d design §3.2)", () => {
    it("sets both pulses' duration, keeping their change", () => {
        const c = buildContact(shot({ drive: 0.5, window: 0.004 }), WORLD);
        const arc = (c.drive as TrackDrive).arc;
        const base = (buildContact(shot({ drive: 0.5 }), WORLD).drive as TrackDrive).arc;
        expect(arc.window).toBe(0.004);
        expect(arc.handWindow).toBe(0.004);
        expect(arc.alpha * arc.window).toBeCloseTo(base.alpha * base.window, 12);
    });
    it("keeps carry mode's hold at the preset's window", () => {
        const c = buildContact(canonicalSetup("full-roll", { stroke: { window: 0.01 } }), WORLD);
        expect((c.drive as TrackDrive).arc.holdWindow).toBe(defaultProfile.drive["full-roll"].window);
    });
    it("checks stroke.window's bounds", () => {
        for (const ok of [MIN_WINDOW, MAX_WINDOW]) {
            expect(() => buildContact(shot({ window: ok }), WORLD)).not.toThrow();
        }
        for (const bad of [MIN_WINDOW * (1 - 1e-9), MAX_WINDOW * (1 + 1e-9), 0, -0.01, NaN]) {
            expect(() => buildContact(shot({ window: bad }), WORLD)).toThrow(/stroke\.window/);
        }
    });
    it("shapes nothing at drive 0", () => {
        // Review focus 2: no change to deliver, so the window cannot matter. Not to the bit: the hands' window's end
        // re-bases P_e + V_e·u at a different time, which rounds differently.
        const a = buildContact(shot({ drive: 0 }), WORLD);
        const b = buildContact(shot({ drive: 0, window: 0.02 }), WORLD);
        const d = sub(pathAt(prep(b), 0.03).socket, pathAt(prep(a), 0.03).socket);
        expect(length(d)).toBeLessThan(1e-12);
    });
    it("leaves a shot without a window as it was", () => {
        const c = buildContact(shot({ drive: 0.5 }), WORLD);
        expect("holdWindow" in (c.drive as TrackDrive).arc).toBe(false);
    });
});
```

`shot` is the file's helper; add `window` to its overrides if it does not pass stroke fields through. `prep` is
`prepareTrack(c.drive as TrackDrive, c.head, WORLD.gravity)`. In the "shapes nothing" case, with α = 0 and A = 0 both
pendulums are the bare free pendulum's table from the same `arcStart` (Task 3 adds no zero pulse).

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/engine/swing/buildContact.test.ts`
Expected: FAIL (`MIN_WINDOW` undefined; the window ignored).

- [ ] **Step 3: Implement** plan decision 4. Validation: finite, then within [MIN_WINDOW, MAX_WINDOW], with a message
naming `stroke.window` and both bounds in s. `planStroke`'s doc comment lists the new check.

- [ ] **Step 4: Run the tests** — `npx vitest run tests/engine/swing tests/engine/impact`; PASS.

- [ ] **Step 5: Checks and the ratchet (in the background)**

Run the four checks. Rerun the ratchet into `<temp>/after/*-task4.txt`. Expected: all identical to Task 3's.

- [ ] **Step 6: Commit**

Message: `Let a shot set its follow-through's sharpness`.

---
### Task 5: The dip coupled to the pulse

Spec §4.2, §9 step 4; plan decisions 5, 6.

**Files:**
- Modify: `src/engine/swing/buildContact.ts:672-766` (the lead, the dip's start, the planner's dip),
  `src/engine/swing/downswing.ts` (`scanDownswing`'s `lowering`), `src/engine/impact/track.ts` (`dipTravel`),
  `src/engine/swing/types.ts` (`StrokeTiming.dip`'s doc: an offset from `timing.arc`, 0 coupled)
- Modify, keeping absolute times: `tests/engine/swing/buildContact.test.ts:350`, `:362`, `:465`,
  `scripts/swingProbe.ts:1022-1024`, and any caller the grep finds
- Test: `tests/engine/swing/buildContact.test.ts`, `tests/engine/swing/downswing.test.ts`

**Interfaces:**
- Produces: `dipTravel(depth: number, duration: number, e: number): number` from `track.ts`;
  `scanDownswing(down, head, aim, radius, lowering?: (u: number) => number)`.

- [ ] **Step 1: Write the failing tests**

```ts
describe("the dip coupled to the pulse (P2b.2b.2c.2d design §4.2)", () => {
    const stop = (timing: StrokeTiming) => canonicalSetup("stop-ac", { stroke: { timing } });
    it("starts the dip with the pulse, offset by timing.dip", () => {
        const c = buildContact(stop({ arc: -0.01, hands: 0, dip: 0 }), WORLD);
        const arc = (c.drive as TrackDrive).arc;
        expect(arc.dip.start).toBe(arc.arcStart);
        const late = (buildContact(stop({ arc: -0.01, hands: 0, dip: 0.004 }), WORLD).drive as TrackDrive).arc;
        expect(late.dip.start).toBeCloseTo(late.arcStart + 0.004, 15);
    });
    it("leads by the coupled dip", () => {
        // Review focus 3: arc −10 ms, dip −20 ms from it, so the dip starts 30 ms early, at t = 0.
        const arc = (buildContact(stop({ arc: -0.01, hands: 0, dip: -0.02 }), WORLD).drive as TrackDrive).arc;
        expect(arc.contactAt).toBeCloseTo(0.03, 15);
        expect(arc.dip.start).toBe(0);
    });
    it("rejects a coupled dip past MAX_LEAD", () => {
        expect(() => buildContact(stop({ arc: -0.1, hands: 0, dip: -0.06 }), WORLD)).toThrow(/dip.*0\.16/);
    });
    it("meets the ball at the shot's contact with the dip under way on a croquet stroke", () => {
        // The AC stop's 11 mm dip begun 10 ms before contact: the planner raises the downswing by the dip's travel,
        // so the head's lowest point at contact is the pose's, CANONICAL_CLEARANCE["stop-ac"].
        const setup = stop({ arc: -0.01, hands: 0, dip: 0 });
        const c = buildContact(setup, WORLD);
        const track = prepareTrack(c.drive as TrackDrive, c.head, WORLD.gravity);
        const atContact = headOnPath(track, c.head, (c.drive as TrackDrive).arc.contactAt);
        expect(headLowestPoint(atContact, c.head)).toBeCloseTo(headLowestPoint(poseAt(setup), c.head), 9);
    });
    it("leaves the single-ball graze unplanned, as before", () => {
        // turfStrike.test.ts's GRAZE: a dip 5 ms before contact on a single-ball stroke, which the planner ignores.
        const graze = canonicalSetup("single-ball", { stroke: { contact: { up: 0.01, side: 0 }, jab: 0.001,
            timing: { arc: 0, hands: 0, dip: -0.005 } } });
        expect(swingApproach(buildContact(graze, WORLD))).toEqual(GRAZE_APPROACH);
    });
});
```

- `poseAt(setup)` is `{ position: pose.headCentre, orientation: pose.orientation, velocity: 0, angularVelocity: 0 }`
  from `contactPose(setup, WORLD)`.
- `GRAZE_APPROACH` is the literal `swingApproach(buildContact(graze, WORLD))` printed on Task 4's commit, before
  Step 3. The graze's backswing is the canonical one; the test needs no speed.
- In `downswing.test.ts`: `scanDownswing` with a `lowering` of a constant 1 mm reports a clearance exactly 1 mm lower
  than without it, at the same `before`.
- Rewrite the known callers (plan decision 5) before Step 2, so that Step 2's failures are only the new tests.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/engine/swing`
Expected: the new tests FAIL; the rewritten callers still PASS on today's code.

- [ ] **Step 3: Implement** plan decisions 5 and 6.

- [ ] **Step 4: Run the tests** — `npx vitest run tests/engine` (the default suite); PASS.

- [ ] **Step 5: Checks and the ratchet (in the background)**

Run the four checks and the slow suite (the controller). Rerun the ratchet into `<temp>/after/*-task5.txt`.

Expected:
- all identical to Task 4's;
- `swingProbe`'s output identical to Task 1's baseline in its `timings` section's AC stop "arc" lines.

A croquet run with a dip under way at contact would be counted, but the grid and the canonical setups have none.

- [ ] **Step 6: Commit**

Message: `Couple the dip to the follow-through's pulse and plan it into croquet strokes`.

---
### Task 6: The planned brake

Spec §4.1; exit criterion 5 (but the sweep, Task 8); plan decisions 7, 8.

**Files:**
- Modify: `src/engine/impact/integrate.ts:1285-1287` (the cap), `src/engine/impact/types.ts:333-365`
  (`impact-no-strike`), `src/engine/impact/track.ts:1056-1070` (`checkShare`'s comment)
- Test: `tests/engine/impact/followThrough.test.ts`, `tests/engine/impact/hands.test.ts` (checkShare)

**Interfaces:**
- Produces: `ImpactEvent` gains `{ readonly kind: "impact-no-strike"; readonly t: number }`.

- [ ] **Step 1: Write the failing tests**

In `followThrough.test.ts`, a `describe("the planned brake (P2b.2b.2c.2d design §4.1)")`:

```ts
it("plays a brake begun before contact end to end, meeting the ball slower and later", () => {
    // The AC stop at drive −1, its brake 10 ms early: the head arrives below its planned speed (the under-hit emerges).
    const setup = canonicalSetup("stop-ac", { stroke: { timing: { arc: -0.01, hands: 0, dip: 0 } } });
    const on = canonicalSetup("stop-ac");
    const touch = (s: ShotSetup) => firstFace(simulateImpact(buildContact(s, WORLD), s.balls, WORLD), s.striker);
    expect(touch(setup).speed).toBeLessThan(touch(on).speed);
    expect(touch(setup).t - leadOf(setup)).toBeGreaterThan(touch(on).t - leadOf(on));
});
it("relaxes the grips at the planned contact, not the meeting", () => {
    const c = buildContact(canonicalSetup("stop-ac", { stroke: { timing: { arc: -0.01, hands: 0, dip: 0 } } }), WORLD);
    expect((c.drive as TrackDrive).coupling.relaxAt).toBe((c.drive as TrackDrive).arc.contactAt);
});
it("a brake that leaves no face contact ends at the cap, reported", () => {
    // Review focus 1: drive −1 begun 60 ms early stops the head short of the ball.
    const setup = canonicalSetup("stop-ac", { stroke: { timing: { arc: -0.06, hands: 0, dip: 0 } } });
    const out = simulateShot(setup, WORLD);
    expect(out.impact.events.map((e) => e.kind)).toContain("impact-no-strike");
    expect(out.impact.timeline["face/blue"] ?? []).toEqual([]);
    expect(out.faults.strike).toEqual({ parted: null, taps: [], breaks: [], recontacts: [] });
    expect(Number.isFinite(out.impact.head.position.z)).toBe(true);
});
```

- `firstFace(impact, striker)` returns the first face interval's start and the head's speed along aim there, from an
  impact probe (follow `croquetFitProbe.ts` section M.1's pattern).
- `leadOf(s)` is the arc's `contactAt`.
- If −60 ms still strikes, trace the head, and choose the earliest onset in −20 ms steps down to −MAX_LEAD that does
  not strike. Write the reason in the comment.
- `recontacts` does not exist until Task 7. Assert `toMatchObject({ parted: null, taps: [], breaks: [] })` here, and
  Task 7 tightens it.

In `hands.test.ts`, beside the existing check cases: a check whose planned rate is negative (the path past rest) with
the head's rate positive gives share 1, and the head's rate 0 or negative gives share 0. Exercise it through
`handLoad` as the file's check tests do.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/engine/impact/followThrough.test.ts tests/engine/impact/hands.test.ts`
Expected: the no-strike test FAILS (no event); the others may already pass. A test that already passes still goes in:
it pins spec §4.1's behaviour.

- [ ] **Step 3: Implement** plan decision 7 and `checkShare`'s comment (plan decision 8).

- [ ] **Step 4: Run the tests** — PASS.

- [ ] **Step 5: Checks and the ratchet (in the background)**

Run the four checks. Rerun the ratchet into `<temp>/after/*-task6.txt`. Expected: identical to Task 5's; any moved
line is a run gaining `impact-no-strike`, listed.

- [ ] **Step 6: Commit**

Message: `Report a stroke whose brake leaves no face contact`.

---
### Task 7: Re-contacts after the parting, with placeholder thresholds

Spec §7, §9 step 5; exit criterion 6 (but the ruled thresholds, Task 10); plan decisions 9–11.

**Files:**
- Modify: `src/engine/impact/types.ts:367-377` (`ContactInterval`), `src/engine/impact/timeline.ts`,
  `src/engine/impact/integrate.ts` (the face–ball `recordStep` and `closeTimeline` calls), `src/engine/faults.ts`
  (`ReContact`, the thresholds, the 29.1.6.1 block, the file header), `src/engine/index.ts` (re-exports),
  `reference/laws.json` (29.2.5: the thresholds as placeholders with the readings of spec §7), `src/reference/index.ts`
- Test: `tests/engine/faults.test.ts`, `tests/engine/impact/timeline.test.ts`,
  `tests/engine/impact/simulateImpact.test.ts`, `tests/reference/reference.test.ts`

**Interfaces:**
- Produces, from `faults.ts` (and `index.ts`): `ReContact`, `ReContactThresholds`, `groupReContacts`,
  `MERGE_SEPARATION`, `EFFECT_SPEED`, `EFFECT_ANGLE`; `StrikeTaps.recontacts`.
- From `impact/types.ts`: `ContactInterval.impulse?: Vec3`,
  `ContactInterval.velocities?: { readonly before: Vec3; readonly after: Vec3 }`.
- `recordStep(line, inContact, force, t, face?)`, `closeTimeline(line, duration, velocity?: Vec3)`.
- The thresholds live in `laws.json` under 29.2.5 as `thresholds: { mergeSeparation, effectSpeed, effectAngle }`, each
  `{ value, unit, note }`. They are read by `src/reference/index.ts`'s loader with its existing schema helpers, and
  `faults.ts` takes its constants from there.

- [ ] **Step 1: Write the failing tests**

In `timeline.test.ts`:

```ts
it("sums a face interval's impulse and keeps the ball's velocities at its ends", () => {
    const line = emptyTimeline();
    const v = (x: number) => vec3(x, 0, 0);
    recordStep(line, true, 10, 0, { impulse: v(1e-3), velocity: v(0) });
    recordStep(line, true, 12, 5e-6, { impulse: v(2e-3), velocity: v(0.5) });
    recordStep(line, false, 0, 1e-5, { impulse: v(0), velocity: v(1.1) });
    expect(line.intervals[0]).toMatchObject({ impulse: v(3e-3), velocities: { before: v(0), after: v(1.1) } });
});
it("closes an open interval's velocities at the impact's end", () => {
    // Review focus 4.
    const line = emptyTimeline();
    recordStep(line, true, 10, 0, { impulse: vec3(1e-3, 0, 0), velocity: vec3(0, 0, 0) });
    expect(closeTimeline(line, 2e-3, vec3(2, 0, 0))[0]?.velocities?.after).toEqual(vec3(2, 0, 0));
});
it("leaves a pair recorded without the face's record as it was", () => {
    const line = emptyTimeline();
    recordStep(line, true, 10, 0);
    recordStep(line, false, 0, 1e-5);
    expect(line.intervals[0]).toEqual({ start: 0, end: 1e-5, peakForce: 10 });
});
```

In `simulateImpact.test.ts`: on a canonical drive's impact, the striker's face intervals' summed impulse along aim
equals m_ball × (the handover's striker velocity along aim) within 2 % (the turf and the croqueted ball account for the
rest). Mark the tolerance's reasoning in a comment; trace before widening it.

In `faults.test.ts`, a `describe("judgeFaults: re-contacts after the parting (P2b.2b.2c.2d design §7)")`. Extend the
file's `iv` with an optional record, `ivr(start, end, impulse, before, after, clearanceAfter?)`.

```ts
it("reports each re-contact after the parting with its effect", () => {
    const report = judgeFaults(croquet, impact({ pair: [iv(1e-4, 1.4e-3)], face: [
        ivr(0, 6e-4, vec3(0, 0.4, 0), vec3(0, 0, 0), vec3(0, 2.5, 0)),
        ivr(2e-3, 2.4e-3, vec3(0, 0.02, 0), vec3(0, 2.5, 0), vec3(0, 2.6, 0.0)),
    ] }));
    const [r] = report.strike?.recontacts ?? [];
    expect(r?.afterParting).toBeCloseTo(6e-4, 15);
    expect(r?.speedChange).toBeCloseTo(0.04, 12);
    expect(r?.angleChange).toBe(0);
    expect(r?.fault).toBe(true);
});
it("flags exactly as before under the placeholders", () => {
    // Plan decision 11: every re-contact a fault, none merged; the finding is today's.
    const before = { face: [iv(0, 6e-4), iv(2e-3, 2.5e-3)], pair: [iv(1e-4, 1.4e-3)] };
    const f = judgeFaults(croquet, impact(before)).findings.find((x) => x.law === "29.1.6.1");
    expect(f).toEqual({ law: "29.1.6.1", tier: "possible-fault", ball: "blue", t: 2e-3,
        evidence: { contacts: 2, gap1: 2e-3 - 6e-4, afterParting: 1 } });
});
it("treats a gap with no clearance as separation 0", () => {
    const report = judgeFaults(croquet, impact({ face: [iv(0, 6e-4), iv(2e-3, 2.5e-3)], pair: [iv(1e-4, 1.4e-3)] }));
    expect(report.strike?.recontacts[0]?.separation).toBe(0);
});
it("flags a re-contact that sets a still ball moving", () => {
    const report = judgeFaults(croquet, impact({ pair: [iv(1e-4, 1.4e-3)], face: [iv(0, 6e-4),
        ivr(2e-3, 2.4e-3, vec3(0, 0.01, 0), vec3(0, 0, 0), vec3(0, 0.2, 0))] }));
    expect(report.strike?.recontacts[0]?.speedChange).toBe(Infinity);
    expect(report.strike?.recontacts[0]?.fault).toBe(true);
});
it("keeps the no-parting rule", () => {
    const report = judgeFaults(croquet, impact({ face: [iv(0, 6e-4), iv(9e-4, 1.6e-3)], pair: [] }));
    expect(report.strike?.recontacts).toEqual([]);
    expect(laws(report)).toContain("29.1.6.1 possible-fault");
});
it("judges a continuation stroke's re-contacts after its parting", () => {
    const report = judgeFaults(continuation, threeBalls({ red: [iv(0, 1e-3)], black: [iv(0, 1.5e-3)],
        face: [iv(0, 4e-4), iv(2e-3, 2.4e-3)] }));
    expect(report.strike?.recontacts.map((r) => r.start)).toEqual([2e-3]);
});
it("drops an exempt contact before grouping", () => {
    // As the double tap's exempt case: blue roquets live black at 0.3 ms, so its 0.5 ms contact is exempt.
    const report = judgeFaults({ ...continuation, live: ["black"] }, threeBalls({ red: [iv(0, 1e-3)],
        black: [iv(3e-4, 9e-4)], blackTouching: false, face: [iv(0, 2e-4), iv(5e-4, 7e-4), iv(2e-3, 2.2e-3)] }));
    expect(report.strike?.recontacts.map((r) => r.start)).toEqual([2e-3]);
});
it("groups micro-hits under the merge separation and judges the group's summed effect", () => {
    // The grouping with a nonzero threshold, through the unexported seam the judge takes its thresholds from.
    const groups = groupReContacts(faces3, 1.4e-3, { mergeSeparation: 1e-4, effectSpeed: 0.05, effectAngle: 5 });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.intervals).toBe(2);
    expect(groups[0]?.fault).toBe(false);
});
```

- `faces3` holds three face intervals: one before the parting with `clearanceAfter` 1e-3 m, then two after it, the
  first with `clearanceAfter` 5e-5 m. Their summed effect is 3 % in speed and 1° in angle.
- `groupReContacts(faces: readonly ContactInterval[], parted: number, thresholds: ReContactThresholds):
  ReContact[]` is exported from `faults.ts` for this test and for the probe (section D's what-if), with
  `interface ReContactThresholds { readonly mergeSeparation: number; readonly effectSpeed: number; readonly
  effectAngle: number }`. Its header says the judge calls it with the non-exempt contacts and the laws' thresholds.
- In `reference.test.ts`: 29.2.5's three thresholds load, each placeholder's note contains "Placeholder", and the
  values are 0.
- Update Task 6's no-strike test to the full `toEqual` with `recontacts: []`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/engine/faults.test.ts tests/engine/impact/timeline.test.ts tests/reference`
Expected: FAIL (no record, no `recontacts`).

- [ ] **Step 3: Implement** plan decisions 9–11.

- The file header's double-tap paragraph gains the re-contact rule, citing Law 29.2.5, C29.11.2, C28.3.2, Law 29.2.7
  and the user's reading (decision 10). 29.1.6.1's judging comment follows.
- `laws.json` 29.2.5's note gains 29.2.7's quote and the readings, as spec §7 quotes them.

- [ ] **Step 4: Run the tests** — `npx vitest run tests/engine tests/reference`; PASS.

- [ ] **Step 5: Checks and the ratchet (in the background)**

Run the four checks. Rerun the ratchet into `<temp>/after/*-task7.txt`, the digest with `DROP=impulse,velocities`, and
strip the same keys from both `impactDigest` files with `strip.py`.

Expected:
- every `phys` hash identical to Task 6's;
- `impactDigest` (stripped), `shotMix` (`.cmp`) and `impactProbe` (`.cmp`) identical;
- `faults` hashes moved for croquet and continuation runs only.

A throwaway check in `<temp>/scripts/findings.mts` prints each croquet run's `findings` JSON at Task 6's commit (from
`<temp>/main-tree` checked out there with `git worktree add --detach <temp>/task6-tree <task6 sha>` and `npm ci`) and
now; they must be identical.

- [ ] **Step 6: Commit**

Message: `Report each re-contact after the parting with its effect`.

---
### Task 8: The harness and stage 1's probe sections

Spec §3.4, §3.5, §4.3, §6 (the drive's diagnosis), §7 (the spread), §10 stage 1; exit criteria 4, 5 (the sweep);
plan decisions 13 and 14.

**Files:**
- Create: `scripts/followThrough.ts`, `scripts/followThroughProbe.ts`, `tests/engine/followThroughHarness.test.ts`
- Modify: `scripts/ratioFit.ts` (`digestGrid` moved in; `guganSetup`'s `lean`, `up` and `grips`),
  `scripts/croquetFitProbe.ts` (imports `digestGrid`)
- Create: `docs/superpowers/probes/<date>-p2b2b2c2d-stage1.txt`

**Interfaces:**
- Produces, from `scripts/followThrough.ts`: `FirstTouch`, `Routes`, `firstTouch`, `routesOf`,
  `backswingForContact` (plan decision 13), `turfLimited` (plan decision 14).
- From `scripts/ratioFit.ts`: `digestGrid(type, world)`, as it was; `guganSetup`'s options `lean?: number`,
  `up?: number`, `grips?: StrokeType` (plan decision 14).

- [ ] **Step 1: Write the failing tests**

```ts
describe("the follow-through harness (P2b.2b.2c.2d design §3.4)", () => {
    it("reads the first touch at the planned speed when nothing acts early", () => {
        // The drive at drive 0, on time: no pulse before contact, so the head meets the ball within a step's travel
        // of its planned speed.
        const setup = canonicalSetup("drive");
        const touch = firstTouch(setup, WORLD);
        expect(touch?.contactSpeed).toBeCloseTo(touch?.plannedSpeed ?? NaN, 2);
        expect(touch?.up).toBeCloseTo(setup.stroke.contact.up, 4);
    });
    it("returns null for a stroke with no face contact", () => {
        const setup = canonicalSetup("stop-ac", { stroke: { timing: NO_STRIKE } });
        expect(firstTouch(setup, WORLD)).toBeNull();
    });
    it("solves the backswing for a contact speed under an early brake", () => {
        const setup = canonicalSetup("stop-ac", { stroke: { timing: { arc: -0.01, hands: 0, dip: 0 } } });
        const backswing = backswingForContact(setup, 3, WORLD);
        const touch = firstTouch({ ...setup, stroke: { ...setup.stroke, backswing } }, WORLD);
        expect(touch?.contactSpeed).toBeCloseTo(3, 6);
        expect(touch?.plannedSpeed).toBeGreaterThan(3);
    });
    it("throws for a contact speed beyond the bracket, naming both ends", () => {
        expect(() => backswingForContact(canonicalSetup("stop-ac"), 40, WORLD)).toThrow(/m\/s.*m\/s/);
    });
    it("sets the stance's lean, contact and grips on Gugan's stroke", () => {
        const lean = (-6 * Math.PI) / 180;
        const setup = guganSetup("stop-ac", 3, 0.75e-3, { world: WORLD, lean, up: -0.025, grips: "drive" });
        expect(Math.abs(leanOf(setup, WORLD) - lean)).toBeLessThanOrEqual(1e-12);
        expect(setup.stroke.contact.up).toBe(-0.025);
        const drive = setup.profile.stance.drive;
        expect(setup.profile.stance["stop-ac"]).toMatchObject({
            bottom: drive.bottom,
            gripTension: drive.gripTension,
            bottomGrip: drive.bottomGrip,
        });
    });
    it("reads the turf's limit on the lean as the static pose gives it", () => {
        // The default mallet's AC stop at up −0.02 m (2026-10-24 pose check): 3.35 mm clear at −6°, 7.79 mm in the
        // turf at −8°.
        const at = (deg: number) =>
            turfLimited(guganSetup("stop-ac", 3, 0.75e-3, { world: WORLD, lean: (deg * Math.PI) / 180 }), WORLD);
        expect(at(-6)).toBeCloseTo(3.35e-3, 4);
        expect(at(-8)).toBeCloseTo(-7.79e-3, 4);
    });
});
```

The second stance test runs on the default mallet (no `gugan`), the mallet the pose check used.

`NO_STRIKE` is the timing Task 6's no-strike test settled on. `routesOf` is exercised by section A's run and Task 9's
review; its taps' shares on the canonical drive must sum to within 1 % of 1 (a sanity line printed by section A).

- [ ] **Step 2: Run to verify they fail** — `npx vitest run tests/engine/followThroughHarness.test.ts`; FAIL.

- [ ] **Step 3: Implement the harness, move `digestGrid`, write sections A–D and S**

- **A** (spec §3.4).
  - Every croquet preset at 3 m/s (the planned speed, `backswingFor`), magnitude −1, −0.5, 0, +0.5, +1, window ×0.5,
    ×1, ×2 of the preset's.
  - Per run, `routesOf`'s figures: contact speed, planned speed, up and lean at first touch, each tap's start, impulse
    along aim and share, each re-contact's class and effect, and the ratio.
  - Per preset and window: whether the ratio is monotonic in the magnitude, and its rate per unit magnitude. Mark it
    "monotonic" or "NOT monotonic", never fail.
  - A sanity line per preset: the canonical run's tap shares' sum.
- **B** (spec §4.3).
  - The AC stop at 3 m/s **contact** speed (`backswingForContact`), the default gap, jab 0 and 2.5 mm, onset −20 to
    +5 ms in 2.5 ms steps, magnitude −0.25, −0.5, −0.75, −1, window ×0.5, ×1, ×2.
  - Per run: planned and contact speeds, the ratio, the head's speed along aim at the parting, when and whether the
    head grounds (before or after the second tap), the taps, and "no strike" where `firstTouch` is null.
  - A second block repeats it at a fixed backswing (the on-time stroke's for 3 m/s) and judges the contact speed
    non-increasing as the onset moves earlier and as the magnitude strengthens (exit criterion 5), printing each
    violation with its pair of runs.
- **C** (spec §6, the drive). The canonical drive.
  - Sample every 1 ms from first contact to 120 ms: the bottom hand's force along aim (from the impact probe's step
    sample's `bottom`), the head's speed along aim, and the striker's ball's speed. Note the re-contact's start.
  - Repeat at `guideEffort` 0 for comparison.
  - Print the double-hit probe's §3a figure beside it (96.4 ms) for the reader.
- **D** (spec §7).
  - Over the 950-run grid (`digestGrid` and the canonical run, the five croquet presets, judged as `simulateShot`
    judges them) and section A's grid: every face gap after the first contact. Record its separation
    (`clearanceAfter`), its duration, whether it begins after the parting, and, for each after-parting interval, its
    effect alone (`groupReContacts` with every threshold 0).
  - Print quantiles (min, 10 %, 25 %, 50 %, 75 %, 90 %, max) of the separations, the speed effects and the angle
    effects.
  - Print a what-if table: the count flagged per preset for MERGE_SEPARATION ∈ {0, 0.1, 0.25, 0.5, 1, 2} mm by
    EFFECT_SPEED ∈ {0, 1, 2, 5, 10} % with EFFECT_ANGLE ∈ {0, 1, 2, 5} °, using `groupReContacts`.
- **S** (spec §3.5).
  - The AC stop and the drive as Gugan 5's strokes: `guganSetup` with `gugan: true`, the default gap, `contactSpeed`
    3 m/s by `backswingForContact`, the drive at `guideEffort` 0, the stop at jab 0, `ON_TIME`, each preset's own
    `drive`.
  - Leans −8° to +4° in 1° steps at the preset's `up`; the AC stop again at `up` −0.025 m for −7° and −8°. Each at the
    stroke's own grips and at the other's (`grips`).
  - A lean with `turfLimited` < 0 prints "turf-limited" with the figure in mm and is not played.
  - Per run: the ratio against its band (drive 4.23 ± 0.2, stop 7.15 ± 0.6, `*` within), (v₂/w₁)², the contact and
    planned speeds, `firstTouch`'s up and lean, the head's least clearance from the turf over the strike window (from
    the impact probe's samples), the taps, the re-contacts after the parting with their effects, and whether the head
    touched the turf.
  - Per stroke and grip set: the lean with the ratio nearest its target, and the ratio's rate per degree over the
    playable leans.
  - A second block: the canonical drive (its own `guideEffort`, default mallet, 3 m/s planned) across the same leans,
    with each re-contact after the parting's start and effect (the late catch).
  - This section's `guganSetup` call needs `contactSpeed`, which Task 11 adds; add it here instead (Task 11's
    interface, unchanged), with Task 11's test moved forward with it.
- Every section's header names the spec section, its inputs and its units, as `croquetFitProbe.ts`'s do.

- [ ] **Step 4: Tests and checks** — the harness tests PASS; the four checks pass. `croquetFitProbe`'s
`SECTION=N` output, captured before the move into `<temp>/after/N-before.txt` and after it, is identical: the move of
`digestGrid` changes nothing.

- [ ] **Step 5: Run stage 1's sections (the controller, in the background)**

Run: `env SECTION=all npx --yes tsx scripts/followThroughProbe.ts > docs/superpowers/probes/<date>-p2b2b2c2d-stage1.txt`
Expected: non-empty; every section's tally line present.

- [ ] **Step 6: Commit**

Stage the five files and the probe output. Message: `Probe the follow-through's routes, the brake and the re-contacts`.

---
### Task 9: Gate stage 1 — the mechanisms

Spec §10 stage 1. **Stop for the user.**

**Files:**
- Modify: the spec (Amendments)

- [ ] **Step 1: Assemble the evidence** in `docs/superpowers/probes/<date>-p2b2b2c2d-gate1.txt`:
  - the ratchet's counts (Tasks 2, 3, 6, 7);
  - section A's monotonicity and rates per preset, with the routes' shares;
  - section B's under-hit, its no-strike runs, its grounding, and exit criterion 5's verdict;
  - section C's trace and its reading;
  - section D's quantiles and what-if table;
  - section S's ratios by lean and grip set, the turf-limited leans, the rates per degree, and the canonical drive's
    late catch by lean.

- [ ] **Step 2: Put each question to the user, one at a time**, with options, pros, cons and a recommendation:
  1. The smooth pulse and gravity: accepted as landed (plan decisions 1–3, their counts)?
  2. The routes: what section A says about how the follow-through reaches the balls, and whether a preset whose ratio
     barely moves is a finding about the model (spec §3.4).
  2b. The stance (spec §3.5): the lean's effect apart from the grips'; whether the user's order (stop furthest back,
     then the drive, forward through the rolls) shows; and whether the AC stop's, the drive's, both or neither's stance
     becomes a calibrated default, and at which lean. Asked before the brake, since stage 2's candidates are found at
     the ruled stance.
  3. The planned brake: does the under-hit emerge; is the no-strike reporting adequate?
  4. The drive's late catch: is the guide's re-acceleration physical (section C)? Which candidates go to stage 2: the
     `guideEffort` grid, a guide decay (an engine change, argued from the account or a source), or both?
  5. `MERGE_SEPARATION`, then `EFFECT_SPEED`, then `EFFECT_ANGLE`, each from section D's spread, generous as the user
     reads the Laws.

- [ ] **Step 3: Record each ruling verbatim** in the spec's Amendments, and commit the spec and `gate1.txt`. Message:
`Record the follow-through gate's first stage`.

If the gate rules a stance in, sections E and F (Task 11) and B's rerun play the AC stop and the drive at it (through
`guganSetup`'s `lean`, and for the canonical drive the stance itself), and Task 13 lands it first.

If the gate rules a guide decay in, write its task (engine change, tests, ratchet) into this plan before Task 11, and
commit the amended plan with the spec.

---
### Task 10: The ruled re-contact thresholds

Spec §7, §9 step 5 (the findings); exit criterion 6.

**Files:**
- Modify: `reference/laws.json` (the three values, notes: ruled, with the gate's date and the spread quoted)
- Test: `tests/reference/reference.test.ts`, `tests/engine/faults.test.ts`, and any test pinning a 29.1.6.1 finding on
  a simulated croquet run

Gate 1 (spec Amendments, 2026-10-24) ruled `MERGE_SEPARATION` 2 mm, `EFFECT_SPEED` 10 %, `EFFECT_ANGLE` 2°, and that
a contact within `MERGE_SEPARATION` of the previous one joins its group, a group begun before the parting being the
strike (its contacts reported among `taps`, never a re-contact). `groupReContacts` changes to that grouping here,
with tests: a post-parting contact within the separation of a pre-parting tap is a tap; one past it is a re-contact.
Before Task 11 the controller traces section B.2's uniform 3.584e-7 m/s step between onsets 0 and +2.5 ms and records
the cause in the gate file.

- [ ] **Step 1: Write the failing tests**
  - `reference.test.ts` pins the three ruled values, and drops the placeholder assertion.
  - In `faults.test.ts`, constructed intervals sit on both sides of each threshold, 1 % inside and outside each.
    Assert: under → merged, or not a fault; at or over → separate, or a fault.

- [ ] **Step 2: Run to verify they fail**; **Step 3: set the values**; **Step 4: run the tests**, tracing every moved
  29.1.6.1 expectation to the thresholds and re-baselining it with the comment form.

- [ ] **Step 5: Checks and the ratchet (in the background)**

Expected: every `phys` hash identical to Task 7's; `faults` moved, counted per preset; the flagged count per preset
before (Task 1: 922 in all) and after, from a rerun of section D's tally, in `<temp>/after/task10-moved.txt`.

- [ ] **Step 6: Commit**

Message: `Judge a re-contact after the parting by its effect, at the ruled thresholds`.

---
### Task 11: Stage 2's candidates

Spec §6; plan decision 12.

**Files:**
- Modify: `scripts/followThroughProbe.ts` (sections E, F, G), `scripts/ratioFit.ts` (`guganSetup` gains
  `timing?: StrokeTiming` and `drive?: number`; `contactSpeed?: boolean`, solving the backswing by
  `backswingForContact`, landed in Task 8 for section S)
- Create: `docs/superpowers/probes/<date>-p2b2b2c2d-candidates.txt`

- [ ] **Step 1: Sections**

- **E** (the AC stop).
  - Gugan's mallet, the default gap, jab 0, 3 m/s contact speed.
  - Over the brake sweep's onsets and magnitudes at the preset's window: the stop's ratio against 7.15 ± 0.6, with the
    planned speed.
  - Mark each passing pair, and name the latest passing onset (the user: "as soon as contact is complete"), with its
    strength, as the candidate.
- **F** (the drive).
  - `guideEffort` 1, 0.75, 0.5, 0.25, 0 on the canonical drive, each judged by §7 at the ruled thresholds. Report
    whether there is a re-contact after the parting and its effect.
  - Mark the largest with none as the candidate.
  - Gugan 5's drive at `guideEffort` 0 beside it, unchanged (its calibration).
- **G** (the full roll). The variant: the full roll with the pass roll's `speedGain`, `handGain` and `window`, its own
  stance and reach. Its ratio over 2, 3 and 4 m/s, beside the default full roll's and the half and pass rolls', against
  coaching's about 1. Print the variant's provenance (the roadmap's carried item) in the header.

- [ ] **Step 2: A test** in `tests/engine/followThroughHarness.test.ts`: `guganSetup` with `contactSpeed: true` and the
  candidate's timing puts `firstTouch`'s contact speed at 3 m/s ± 1e-6 (Task 8 pins it on time; this pins it under
  the candidate's early pulse).

- [ ] **Step 3: Run** `SECTION=E`, `F` and `G` into the candidates file (the controller, in the background). Run the
  four checks.

- [ ] **Step 4: Commit** the probe, `ratioFit.ts`, the test and the output. Message: `Probe the follow-through's
  candidate defaults`.

---
### Task 12: Gate stage 2a — the defaults

Spec §10 stage 2; plan decision 12. **Stop for the user.**

- [ ] **Step 1: Put each question, one at a time**, with a recommendation:
  1. The AC stop's onset and strength (section E's candidate, or another passing pair).
  2. The drive's default: the `guideEffort` candidate, or the decay if Task 9 admitted it, or unchanged.
  3. The full roll: the variant adopted (then no longer held-out, its provenance stated), or the default unchanged.
  4. The half roll, pass roll, GC stop and single-ball: unchanged but for the smooth pulse (spec §6), confirmed.

- [ ] **Step 2: Record each ruling verbatim** in the Amendments; commit the spec. Message: `Record the follow-through
gate's ruling on the defaults`.

---
### Task 13: The defaults landed

Spec §6, §9 step 6.

**Files:**
- Modify: `src/engine/swing/profile.ts` (`DEFAULT_TIMING`; the ruled `DEFAULT_DRIVE`, `guideEffort` or full roll
  entries; each default's argument and source in its comment), `tests/engine/support/shot.ts` (`canonicalSetup` reads
  `DEFAULT_TIMING[type]`)
- Test: `tests/engine/swing/defaultStroke.test.ts` and the re-baselined tests

**Interfaces:**
- Produces: `export const DEFAULT_TIMING: Readonly<Record<StrokeType, StrokeTiming>>` from `profile.ts`, every type
  `ON_TIME` but the ruled AC stop.

Land each ruled default as its own sub-step, with its own ratchet run and count before the next:

- [ ] **Step 0: The ruled stance**, if Task 9 ruled one: the preset's `stanceFromLean` lean (and `up`, if ruled) in
  `profile.ts`, its comment giving section S's figures and the ruling. Test: the preset's `leanOf` at its canonical
  setup is the ruled lean within 1e-12 rad; the canonical setup runs top to finish. Ratchet: only that preset's runs
  move, counted. Message: `Set the <type>'s stance where the gate ruled`.
- [ ] **Step 1: `DEFAULT_TIMING`** with every type `ON_TIME`, and `canonicalSetup` reading it. Test: `DEFAULT_TIMING`
  has every stroke type, each a valid timing, and is `ON_TIME` everywhere. Ratchet: bit-identical.
- [ ] **Step 2: The AC stop's onset and strength.** Test: the canonical AC stop's Gugan 5 stop at 3 m/s contact speed
  lies within 7.15 ± 0.6 (a slow test, `it.runIf(SLOW)`, with a timeout of 4× its local time). Ratchet: only AC stop
  runs move, counted.
- [ ] **Step 3: The drive's default**, if ruled. Test: the canonical drive raises no 29.1.6.1. Ratchet: only drive runs
  move, counted.
- [ ] **Step 4: The full roll**, if ruled. Ratchet: only full-roll runs move, counted.

After each sub-step: the four checks, re-baselined tests traced and commented, the ratchet in the background, then a
commit. Messages: `Default each stroke's follow-through timing`, `Plan the AC stop's brake before contact`,
`<the drive's ruled change>`, `<the full roll's ruled change>`.

---
### Task 14: The checks

Spec §8, §3.4 (stage 2's grid), exit criterion 9.

**Files:**
- Modify: `scripts/followThroughProbe.ts` (sections H–O)
- Create: `docs/superpowers/probes/<date>-p2b2b2c2d-checks.txt`

- [ ] **Step 1: Sections**

- **H**: Gugan 5's drive and stop at the default gap, 3 m/s contact speed, Gugan's mallet; the stop over jabs 0–6.5 mm
  in 0.5 mm steps; each against its band.
- **I**:
  - the full roll's ratio against the half and pass rolls' over 2, 2.5, 3, 3.5 and 4 m/s, with and without section G's
    variant;
  - the pass roll played dead straight (its croqueted ball on aim);
  - the pass roll at 10° and 20° off aim: the split, and the striker's ball's share of it.
  Recorded, never fitted.
- **J**: Gugan's jab qualifier as `croquetFitProbe.ts` section M.1 judges it, on the coupled dip: does the head ground
  before the second tap? The controller then runs `env SLOW_TESTS=1 npx vitest run tests/engine/turfStrike.test.ts`.
  `.fails` is removed only if the assertions now pass (Vitest reports the `.fails` test as failing).
- **K**: the pass roll at magnitude +1 and window MIN_WINDOW: the taps (start, impulse, share), and whether an early,
  strong second tap emerges, with §7's judgement of each re-contact.
- **L**: on each roll's canonical run, whether the push intent reaches `pushForce`, when, and for how long. Read it
  from the impact probe's step sample. If the sample lacks the intent's magnitude, add it to the sample as a
  probe-only field; this is no physics change, and the ratchet confirms it.
- **M**: the latest face–ball contact's end over sections A (stage 2) and B against STRIKE_WINDOW 15 ms, and the count
  beyond it.
- **N**: the moved AC stop and drive at dt/2, dt and 2·dt (as `croquetFitProbe.ts` section G): each judged figure's
  spread.
- **O**: every preset's canonical setup top to finish. For each: the speed against 3 m/s ± 2 % (the planned speed; for
  a default with an early pulse, the contact speed, the planned speed beside it); the outcome's flags; and the late
  re-hit, from `env SECTION=rehit npx --yes tsx scripts/swingProbe.ts` (no run ends with the head overlapping a ball as
  handed over).

- [ ] **Step 2: Run** section A again (stage 2: the new defaults) and H–O into the checks file (the controller, in the
  background). Run the four checks and the slow suite.

- [ ] **Step 3: Commit** the probe and the output. Message: `Run the follow-through's checks on the new defaults`.

---
### Task 15: Gate stage 2b — the checks

Spec §10 stage 2. **Stop for the user.**

- [ ] **Step 1: Put each check's verdict to the user, one at a time**, with a recommendation:
  1. Section A at the new defaults.
  2. Each of H to O.

  A failed check that implicates a default goes back to Task 12's question for it.
- [ ] **Step 2: Record the rulings verbatim** in the Amendments; commit the spec. Message: `Record the follow-through
  gate's ruling on the checks`.

---
### Task 16: The records and the version

Spec §11; exit criterion 10.

**Files:**
- Modify: `src/engine/simulate.ts:77` (`"0.17.0"`), `tests/engine/simulate.test.ts` (if it pins the version), the
  roadmap, the spec (Amendments: plan decisions 1–14 folded in)

- [ ] **Step 1: The version.** A test pins `ENGINE_VERSION` `"0.17.0"` (extend the existing one). Set it. Run the
  four checks.
- [ ] **Step 2: The roadmap.**
  - The P2 row: the natural push's growth moved to P2b.2b.2c.3.
  - A "P2b.2b.2c.2d outcomes (<date>)" section with its carried open items.
  - "Provisional numbers": the smooth pulse's form, MIN_WINDOW and MAX_WINDOW, the three re-contact thresholds, each
    moved default, and `STRIKE_WINDOW`'s row re-checked.
  Grep line 12 narrowly.
- [ ] **Step 3: The spec's Amendments.** Fold each plan decision in, with the gate's rulings already recorded.
- [ ] **Step 4: The final ratchet** against Task 1's baseline, every moved run's count by task, recorded in the outcomes
  section.
- [ ] **Step 5: Commit.** Message: `Record the follow-through's outcomes and set engine 0.17.0`.

Then remove `<temp>/main-tree` (and `<temp>/task6-tree`) with `git worktree remove`, and offer `/handover`.
