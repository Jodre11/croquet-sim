# P2b.2b.2c.1 — The Single-Ball Stroke: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single-ball stroke's speed rises with effort to a ceiling above a strong player's hard stroke, with
diminishing returns and no turn-over; the default swings are hands-assisted; the backswing ends at the player's body;
and the rising and level follow-throughs are both played from inputs, the flick's lift left to emerge.

**Architecture:**

- `integrate.ts` checks the head's and the balls' state finite after every step, in the impact and the
  follow-through, and throws a `RangeError` on the first non-finite value.
- `downswing.ts` replaces the bell-shaped effort pulse by a Hill-type law, τ_p = i·τ_0·max(0, 1 − ω/ω_max), and checks
  a swing-mode backswing against the body's θ_max. τ_0, ω_max and θ_max live in `SwingProfile.body`, from a new
  `body` block in `reference/swing.json`; `SwingShape` loses `effort`.
- `track.ts` adds the hands' advance: from a player-timed moment (on time at contact), the hands push forward along
  aim on a level path and ease to rest over `handReach`, while the mallet swings freely about them. The free
  pendulum's table already reads the pivot's acceleration, so the head's flattened path and its resumed arc come from
  the pendulum's own physics. `integrate.ts` arms the swing finish only after the hands come to rest.
- `scripts/effortFit.ts` (new) solves τ_0 and ω_max jointly and re-fits the swing presets' defaults;
  `scripts/fitStrokeShape.ts` uses it and freezes the carry presets.
- `scripts/singleBallProbe.ts` (new) produces the pre-flight gate's figures, the styles', the flick's and the
  head-never-ahead sweeps, and the user's checks.
- The tasks land in the spec's ratchet order (§8.2, §10): the baseline and sources; the guard; θ_max; the advance;
  the effort law and its fit; the gate; the defaults; the probes and the documents; the version.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), Vitest, ESLint, Prettier. No
new dependencies. `npx --yes tsx` runs the scripts.

**Spec:** `docs/superpowers/specs/2026-10-18-p2b2b2c1-single-ball-design.md`. Read all of it, especially "Decisions",
§4 (the effort law), §5 (θ_max), §6 (the advance), §8 (testing), §10 (the gate) and "Amendments". Also read:

- **Roadmap:** `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`: the P2 row, "User play data and
  checks (2026-10-08)", "P2b.2b.2b.3 outcomes (2026-10-17)" and "Carried open items".
- **The previous plan:** `docs/superpowers/plans/2026-10-15-p2b2b2b3-turf-strike.md`, for the conventions this plan
  keeps (Task 1's preset digest, the gate, the documents).

**Decisions made while planning.** Task 8 folds each into the spec's Amendments. Decisions 1–6 replace spec §6's
held slope and its moment's lower bound, on the user's rulings of 2026-10-18 after the plan's first draft: "In
practice the 'levelness' is temporary, the contact is extended by pushing the hands forward. The intent is not to stop
or interrupt the arc of the mallet head", and on the moment, "the intent is [from contact]. However this is down to
the skill of the player". The first draft held the slope with a firm grip and released the mallet from rest; that
stopped the arc, and is withdrawn.

1. **The mallet swings freely through the advance.** No slope is held and no grip firms up: the hand load stays
   swing mode's after-contact branch throughout (spec §2). The hands' forward acceleration slows the pendulum's turn
   and their deceleration at the end of the travel speeds it up again, through the pivot's acceleration term the free
   pendulum already integrates (`freeAlpha`, `track.ts:612-617`). The head's flattened path is temporary and its arc
   resumes, from the physics alone.
2. **The advance is planned, not latched.** It is the player's hands' motion, independent of what the strike does to
   the head, so `prepareTrack` builds it once and the free table includes it. Swing mode's load does not hold the
   head's rotation to the plan, so a slowed head is not yanked onto it.
3. **The advance's travel** a(t) along aim (t_s the advance's start, W the impact window `arc.window`, V the head's
   planned speed along aim at contact, aim·(V_c + ω₀·n × (c − P_c)), D = handReach): from rest at t_s the hands
   accelerate at V/W for W; run at V until a = 0.8·D; then decelerate at V²/(0.4·D) to rest at D, as the reach eases
   today (`computeReach`). The pivot is the planned pivot (with the reach) plus aim·a(t), and its velocity and
   acceleration likewise; its height is the plan's, so the advance itself is level. The ramp's travel V·W/2 must be
   under 0.8·D. The advance ends at t_e, where the hands come to rest.
4. **The finish** (spec §6.3): the swing finish is armed from t_e once the advance has started. A run whose apex
   comes before t_s finishes there, as today.
5. **The advance's input is a timing**, `StrokeTiming.advance?: number` (s from contact, 0 on time, negative early,
   positive late; absent: no advance), so the player's skill sets it as it sets the arc's, the hands' and the dip's.
   An early advance counts in the lead (`actions` in planStroke) and is bounded by MAX_LEAD as they are; before
   contact the hands then push the head into the ball through the downswing's feed-forward. It is carried as
   `SwingArc.advance?: { readonly start: number; readonly speed: number }` (t_s from t = 0, V), optional so that
   hand-built arcs keep their shape. planStroke throws a `RangeError` for: a non-finite value; carry mode; a checking
   window (`arc.alpha < 0`); no travel (`handReach` ≤ 0); a ramp too long for the travel (V·W/2 ≥ 0.8·handReach).
   `drive`'s push is unchanged and independent.
6. **The advance is recorded** as `FollowThrough.advanced: { start, end }` (s from t = 0), spread in only when the
   advance started before the finish, so every run without one keeps its shape. An advance the finish beats leaves no
   field (spec §6.2: recorded, not an error).
7. **The names.** `SwingEffort { torque: number; speed: number }` (τ_0 in N·m, ω_max in rad/s) in `swing/types.ts`;
   `SwingProfile.body.effort: SwingEffort` and `SwingProfile.body.backswingLimit: number` (θ_max, rad);
   `DownswingInput` and `StrokeChoice` gain both. `SwingShape.effort` goes, and `SwingShape.handTempo` becomes
   `{ slow; fast } | null`, null for a swing preset with no hands' tempo in `swing.json`; validation fails a carry
   stroke with a null one. In `swing.json` the block is `body`, its keys `effortTorque`, `effortSpeed`, `effortShare`
   (κ, read only by the fit) and `backswingLimit`; `src/reference/index.ts` exports it as `swingBodyReference`.
8. **`backswingFor` keeps its bisection's bracket** at MAX_BACK_ANGLE. A midpoint beyond the body's limit (the
   planner's `RangeError` naming it) counts as reaching the speed, and the reach check reads the speed at the limit.
   Every bisection that converges inside θ_max then takes the same steps as today, to the bit (exit criterion 1's
   ratchet). `fitStrokeShape.ts` moves to θ_max in Task 5.
9. **The guard** (`assertFinite` in integrate.ts) checks the head's position, orientation, velocity and angular
   velocity and every ball's position, velocity and angular velocity with `Number.isFinite` on each component, after
   each `advance` in `integrateStroke` and `continueStroke`. Its message: `the <head|ball <id>> state went non-finite
   <t − contactAt> s from contact, at step <n> (<impact|follow-through>)`, contactAt 0 for a force table.
10. **The Hill law** is `effortTorque(effort, intensity, omega)` in downswing.ts: intensity·τ_0·max(0, 1 − ω/ω_max).
    At intensity 0 it returns +0, so the gravity-only swing is today's to the bit. The torque steps on at the top; no
    onset ramp unless the work–energy test (Task 5) fails, and then a labelled placeholder (spec §4.4).
11. **The ceiling** is CEILING = 9.0 m/s, the spec's rounded 1.1 × 8.18 = 8.998, so both its forms hold. τ_0 is fitted
    so that the lowest U(1) over the swing presets, each from its body-limited top, is 9.0 m/s within 1e-9 relative;
    ω_max so that the drive preset's ω at contact at i = 1 from its top is κ·ω_max within 1e-9 relative.
12. **The body-limited top** is h_top = ℓ·(cos θ_c − cos θ_max)/s·(1 − 1e-9), a hair inside the limit as
    `maxBackswing` is today.
13. **The proposed shared `defaultIntensity` is 0.25**, a labelled placeholder: a quarter of full effort, the lightest
    round figure plainly hands-assisted. The gate shows 0.5 beside it. Each swing preset's `defaultBackswing` is the
    bisected backswing in (0, h_top] planning 3 m/s at it. A sourced backswing range that excludes it makes the fit
    throw, for the gate.
14. **"No flat top"** (spec §4.2): (U(1) − U(0.95))/0.05 ≥ 0.25·(U(1) − U(0)), the spec's least fraction.
15. **The advance's test** (spec §8.1.5, whose 2 mm height tolerance assumed the withdrawn held slope): over
    [contact, t_e] the level stroke's head centre rises less than the same stroke's without an advance; its pitch
    rate is positive again after t_e (the arc resumes); and its finish comes after t_e.
16. **Head ahead** (spec §8.4.4): at a sampled state, with d = aim·(c_head − c_ball) and the across distance
    e = |(c_head − c_ball) − d·aim| horizontally, a failure is d > 0, d < L/2 + 2R, e < faceWidth/2 + R, and the
    head's lowest point below the ball's top (c_ball.z + R). Sampled at every impact step (the probe's snapshots) and
    at every follow-through sample against the striker's phase-2 state at the same time (`stateAtTime`, t − the
    impact's duration).
17. **The flick's sweep** varies the contact's place on the arc by the stance's lean, from −20° to +10° in 2° steps
    (`handsAheadFor`, a negative lean puts the hands behind and meets the ball on the up), at the default backswing for
    3 and 5 m/s. Airborne means the striker's phase 2 has a `landing` event.
18. **The user's mallet** (spec §10): a 42 in shaft (1.0668 m) and a 13.5 in head (0.3429 m long), the rest the
    default's; its top hand kept the default's 0.1094 m below the handle's top (top = 0.9574 m).
19. **The gate runs on an uncommitted `swing.json`.** Task 5 commits the law and τ_0/ω_max with the defaults unchanged
    (`KEEP_DEFAULTS=1`); Task 6 writes the proposed defaults into the working tree only; Task 7 commits them after the
    ruling.

## Global Constraints

- **Formatting.**
  - Use 4-space indentation, a 120-column limit, LF line endings and UTF-8.
  - Check line lengths with `env LC_ALL=en_GB.UTF-8 grep -nE "^[^|].{120,}$" <file>`. Table rows in markdown are
    exempt, and roadmap line 29 is a known pre-existing hit.
  - Run `npx prettier --write` on every code and JSON file you touch. `npm run format:check` must pass.
  - `.prettierignore` lists `docs/`, so wrap markdown by hand. Prettier does not re-wrap comments or strings: wrap any
    comment over 120 columns by hand, and break any template literal over 120 columns with `+`.
- **Engine purity.** `src/engine/**` is pure and deterministic: no DOM, no time of day, no randomness.
- **Determinism lint.** Engine code uses only `+ − * /`, comparisons, `Math.sqrt`, `Math.abs`, `Math.min`,
  `Math.max`, `Math.round`, `Math.floor`, `Math.ceil`, `Math.PI`, `Number.isFinite`, and the engine's `sinCos`,
  `atan2`, `ln`, `exp` and `pow` (`src/engine/math/elementary.ts`). No `Math.sin`, `Math.cos`, `Math.atan2`,
  `Math.exp`, `Math.log`, `Math.pow`, `Math.hypot`, `Math.sign` or `**`. Tests and scripts may use any `Math`.
- **Style.** No non-null assertions (`!`); `x as T` after indexing. Braces on every `if`. `0 - x`, not unary minus,
  in engine arithmetic. Exported functions carry a header comment. A constant that is not physical says "Numerical,
  not physical" and why. `import type` for type-only imports. Argument lists all on one line, or one per line when
  more than three or past 120 columns.
- **Units.** SI: m, s, kg, N, N·m, rad, rad/s.
- **Vocabulary.** "Split", "ratio" and "cut" keep their croquet meanings only. The push/pendulum share is "phasing",
  the turf's drag "ploughing". The **advance**, the **rising** and **level** follow-throughs and the **flick** as
  the spec's "Vocabulary" defines them. The engine never names a style (spec §6.2).
- **Engine version.** `ENGINE_VERSION` becomes `"0.13.0"` (Task 9).
- **The ratchet** (spec §8.2): after Task 2 the four baselines are bit-identical; after Task 3 bit-identical but runs
  θ_max now rejects, listed; after Task 4 bit-identical; after Task 5 bit-identical but runs at intensity > 0 (none
  in the four baselines' defaults); after Task 7 the impact digest, `impactProbe`, the shot mix's phase 2 and every
  carry-mode run bit-identical, every moved swing-mode run counted per preset. Code below a new threshold or with an
  input absent keeps today's arithmetic: branch on it rather than add a zero term (`x + 0` turns −0 into +0, and the
  digest keeps the sign of zero).
- **The ratchet's runs** run in the background and must finish, and match, before that task's commit. `pgrep -fl tsx`
  must print no digest or probe process before a commit. Each output file must be non-empty. `shotMix` and
  `impactProbe` print times; compare with them dropped: `grep -v "ms per shot" <file> > <file>.cmp` and
  `grep -v "µs/step" <file> > <file>.cmp`.
- **Slow tests** run only when `SLOW_TESTS` is set. The CI runner is 1.3–4× slower than local: a test over about 5 s
  locally gets an explicit timeout of at least 4× its local time.
- **RED steps.** Vitest does not type-check: a test using a missing export or field fails at runtime (`… is not a
  function`, an assertion on `undefined`), and `npm run check` shows the type errors.
- **Behaviour figures.** A test resting on model behaviour carries its reasoning in a comment. Where a test fails,
  trace the mechanism before changing an expectation; fix the code if it departs from the spec or this plan. A
  re-baselined figure gets the comment "P2b.2b.2c.1: the single-ball stroke (was <old>)". A changed expectation the
  spec does not predict goes to the user at the gate (Task 6) and into the Amendments (Task 8).
- **Circularity.** The user's play data are checks, never fit targets. τ_0 comes from the CA's A4D figure, ω_max from
  κ, θ_max from the user's account of the stance (recorded, not validated). The coaching ratios are untouched.
- **Kept as they are.** Gugan's jab check stays `it.runIf(SLOW).fails`: if it now passes, `.fails` turns red; remove
  it and tell the gate. The "weak stroke stopped dead" test stays `it.todo`. The carry presets' `handTempoSlow`,
  `handTempoFast` and `defaultBackswing` keep their values to the bit.
- **Process.** Follow the plan's steps; no side probes: figures come from the steps that produce them. The pre-flight
  gate (Task 6) **always stops for the user**, whatever it shows.
- **Bash.** One command per call: no `&&`, `||`, `;`, `$(…)` or subshells. Redirecting a script's output with `>` or
  `2>` is allowed. No `bash -c` or `node -e`; `python3 -I` for JSON checks. Oxford Croquet pages need `curl -k`.
- **The temp directory.** `<temp>` is the executing session's literal temp path (`CLAUDE_TEMP_DIR`, e.g.
  `/tmp/claude-<session id>`), written out in full; a subagent is given it in its prompt. Throwaway scripts go in
  `<temp>/scripts/`, outputs in `<temp>/baseline/`, `<temp>/after/` and `<temp>/sources/`. `<date>` is the day the
  step runs, YYYY-MM-DD. Throwaway scripts import the worktree by absolute path:
  `/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2c1-single-ball/…`.
- **Sources.** Cite, don't mirror: the URL, the date, the SHA-256 of the fetched file and short quotes in
  `reference/sources/README.md`; commit no fetched file.
- **Commits.** A short imperative sentence (repo style), signed. Write the message to a fresh `<temp>/msg-task<N>.txt`
  and commit with `git commit -F <that path>`. Check with `git log -1 "--format=%G? %h"`; expect `G`. If signing
  refuses, leave the change staged and report it. Stage by explicit path. Never `--no-verify`,
  `-c commit.gpgsign=false` or bare `git stash`.
- **Checks after every task:** `npm test`, `npm run lint`, `npm run check` and `npm run format:check`, one per call,
  all pass. Task 1 records the baseline count.
- **Known noise.** The editor's TypeScript LSP may report stale "Cannot find module" diagnostics; `npm run check` is
  the source of truth.
- **Worktree.** All work happens in `/Users/jodre11/Repos/croquet-sim/.claude/worktrees/p2b2b2c1-single-ball`, on
  branch `worktree-p2b2b2c1-single-ball`, on `main` at 4647883 (PR #29). The branch is local only.

## Review Focus

The spec implies each input below, but none of its listed tests exercises it. The owning task pins each with a test.

1. **A mistimed advance at either extreme.** An advance timed later than the swing's apex must leave the run equal to
   the run without one (no `advanced` field); one timed early must lengthen the lead like any early action, and one
   earlier than MAX_LEAD must be rejected as they are. Pinned in Task 4 ("takes an early advance into the lead and
   ignores one the finish beats").
2. **A travel too short for the ramp.** A small `handReach` whose ramp V·W/2 reaches 0.8·handReach must throw a named
   `RangeError`, never a negative cruise or a NaN deceleration; one just long enough must plan. Pinned in Task 4
   ("rejects a travel too short for the hands' ramp").
3. **A non-finite ball, not only the head.** A NaN in a ball's angular velocity must be caught too, naming the ball.
   Pinned in Task 2 ("names the ball whose state went non-finite").
4. **ω beyond ω_max and intensity exactly 0.** The torque must be +0, never negative or −0, so the speed never falls
   with effort and the gravity-only swing stays bit-identical. Pinned in Task 5 ("gives +0 at intensity 0 and at or
   beyond ω_max").
5. **A bad body figure.** θ_max of 0, negative, above π/2 or NaN, and τ_0 negative or ω_max not positive, must be
   rejected by planStroke. Pinned in Task 3 ("rejects a backswing limit outside (0, π/2]") and Task 5 ("rejects a
   negative torque or a non-positive speed").

---
## File Structure

| Path | Change |
|---|---|
| `reference/sources/README.md` | Hill 1938; the A4D figure's use for the ceiling (Task 1) |
| `src/engine/impact/integrate.ts` | `assertFinite` (Task 2); the swing finish armed after the advance, `FollowThrough.advanced` (Task 4) |
| `src/engine/swing/downswing.ts` | θ_max in swing mode (Task 3); `effortTorque`, the Hill law (Task 5) |
| `src/engine/swing/types.ts` | `body.backswingLimit` (Task 3); `StrokeTiming.advance` (Task 4); `SwingEffort`, `body.effort`, `SwingShape` without `effort` (Task 5) |
| `src/engine/swing/buildContact.ts` | Validation and plumbing of each (Tasks 3–5) |
| `src/engine/swing/profile.ts` | The body's new figures (Tasks 3, 5); `shapeOf` (Task 5) |
| `src/engine/impact/types.ts` | `SwingArc.advance` (Task 4) |
| `src/engine/impact/track.ts` | `Advance`, `advanceTravel`, the advance in `prepareTrack` and `pivotAt` (Task 4) |
| `reference/swing.json`, `src/reference/index.ts` | `body.backswingLimit` (Task 3); `body.effort*`, the swing presets' effort keys removed (Task 5); new defaults (Task 7) |
| `scripts/effortFit.ts` | New: the joint fit and the defaults' re-fit (Task 5) |
| `scripts/fitStrokeShape.ts` | Swing presets only, carry frozen, θ_max (Task 5) |
| `scripts/singleBallProbe.ts` | New: the gate's figures and sweeps (Task 6) |
| `tests/engine/support/shot.ts` | `backswingFor`'s bracket, `testProfile`'s body (Tasks 3, 5) |
| `tests/engine/impact/finiteGuard.test.ts` | New (Task 2) |
| `tests/engine/swing/backswingLimit.test.ts` | New (Task 3) |
| `tests/engine/impact/advance.test.ts` | New (Task 4) |
| `tests/engine/swing/effort.test.ts` | New (Task 5) |
| Existing tests | Migrated (Tasks 3, 5); re-baselined (Task 7) |
| `src/engine/simulate.ts` | `ENGINE_VERSION` 0.13.0 (Task 9) |
| `docs/superpowers/probes/<date>-p2b2b2c1-*.txt` | The gate's and the probes' output (Tasks 6, 8) |
| The roadmap, the spec | Spec §11's figures, §9's split, this plan's decisions, the gate's rulings (Task 8) |

Every commit stays green: Tasks 2–4 change no default run; Task 5 changes only runs at intensity > 0; Task 6 commits
the probe only; Task 7 commits the defaults with the re-baselined tests.

---
### Task 1: The baseline and the sources

Spec §8.2 (the baseline, before any change), §4.4 (Hill 1938), §10 (U(i) at today's law).

**Files:**
- Modify: `reference/sources/README.md`
- Temp, never committed: `<temp>/scripts/presetDigest.mts`, `<temp>/scripts/effortCurve.mts`,
  `<temp>/scripts/nanRepro.mts`, `<temp>/baseline/*`, `<temp>/sources/*`

**Interfaces:**
- Produces: `<temp>/baseline/{presetDigest,impactDigest,shotMix,impactProbe,strokeProbe,swingProbe,effortCurve}.txt`,
  the test count, and the scripts `presetDigest.mts` and `effortCurve.mts`, which later tasks run unchanged.

- [ ] **Step 1: Confirm the branch's code is `main`'s**

Run: `git diff --stat main -- src tests scripts reference`
Expected: no output (the branch's commits are docs only).

Run: `mkdir -p <temp>/scripts <temp>/baseline <temp>/after <temp>/sources`

- [ ] **Step 2: Write the preset digest**

Create `<temp>/scripts/presetDigest.mts` as the previous plan's Task 1 Step 2
(`docs/superpowers/plans/2026-10-15-p2b2b2b3-turf-strike.md`, the `presetDigest.mts` block), with every import path's
worktree `p2b2b2b3-turf-strike` replaced by `p2b2b2c1-single-ball`, and the header's plan references by this plan's
(Tasks 2–5 and 7). Each line keeps its label, its outcome's SHA-256 and its head–turf intervals; rejected runs print
their message.

- [ ] **Step 3: Write today's effort curve**

Create `<temp>/scripts/effortCurve.mts`. For each swing preset (`single-ball`, `drive`, `stop-ac`, `stop-gc`) of
`canonicalSetup(type)`, at two backswings — its `defaultBackswing` and its top at 75°, h = ℓ·(cos θ_c − cos 75°)
(ℓ = ρ + top, θ_c from `contactPose`) — print `plannedSpeed` at intensity 0, 0.1, …, 1, one line per preset and
backswing, to 6 decimals. Wrap each in try/catch and print the message on a throw. It imports only `canonicalSetup`,
`contactPose` and `plannedSpeed`, whose signatures do not change, so Task 6 runs it again unchanged.

- [ ] **Step 4: Confirm the carried NaN defect reproduces**

Create `<temp>/scripts/nanRepro.mts`: the fat stroke of `tests/engine/swing/buildContact.test.ts:1031`
(`shot({ contact: { up: 0.01, side: 0 } })` on that file's `testProfile`), its contact's drive given
`coupling: { ...coupling, period: 0.01 }`, run through `simulateImpact`. Print whether any number in the handover's
striker state is NaN.

Run: `npx --yes tsx <temp>/scripts/nanRepro.mts`
Expected: NaN found. If not, try `dampingRatio: 2` in place of the period. If neither leaves NaN, record that and stop
for the user: Task 2's first test needs the defect's setup.

- [ ] **Step 5: Capture the baseline (in the background)**

Run each with `run_in_background: true`:

Run: `npx --yes tsx <temp>/scripts/presetDigest.mts > <temp>/baseline/presetDigest.txt`
Run: `npx --yes tsx scripts/impactDigest.ts > <temp>/baseline/impactDigest.txt`
Run: `npx --yes tsx scripts/shotMix.ts > <temp>/baseline/shotMix.txt`
Run: `npx --yes tsx scripts/impactProbe.ts > <temp>/baseline/impactProbe.txt`
Run: `npx --yes tsx scripts/strokeProbe.ts > <temp>/baseline/strokeProbe.txt`
Run: `npx --yes tsx scripts/swingProbe.ts > <temp>/baseline/swingProbe.txt`
Run: `npx --yes tsx <temp>/scripts/effortCurve.mts > <temp>/baseline/effortCurve.txt`

When all have finished and `pgrep -fl tsx` prints none, take the cost baseline alone:
Run: `env COUNT=800 npx --yes tsx scripts/shotMix.ts > <temp>/baseline/shotMix-cost.txt`

Run: `npm test` and record the passed and skipped counts.

They must all finish before Task 2's first engine change; Step 6 may run alongside.

- [ ] **Step 6: Cite Hill 1938**

A. V. Hill, "The heat of shortening and the dynamic constants of muscle", Proc. R. Soc. Lond. B 126 (1938) 136–195,
doi:10.1098/rspb.1938.0050. Find an open full text with the web-search skill (the Royal Society's PDF, or an
archive's). Fetch it twice into two new directories under `<temp>/sources/`, hash each with `shasum -a 256`, and
record the digest only if both agree (else a stable filter, as the README's mallet rows do). `pdftotext -layout` it
and find with `grep -n` the force–velocity relation, (P + a)(v + b) = constant, and a sentence saying the force falls
as the speed of shortening rises. If no open full text exists, cite the DOI and the abstract page, and say so.

Add a section `## P2b.2b.2c.1: the single-ball stroke (design §4.3, §4.4)` to `reference/sources/README.md`: the Hill
row (URL, date, SHA-256, the quotes), and a note that the ceiling is set from the CA's A4D mallet speed of 8.18 m/s
already cited above ("Backswing against contact speed"), 1.1 × it rounded to 9.0 m/s (plan decision 11).

- [ ] **Step 7: Commit**

```bash
git add reference/sources/README.md
git commit -F <temp>/msg-task1.txt
```
Message: `Cite Hill 1938 for the single-ball stroke's effort law`.

---
### Task 2: The finite-state guard

Spec §3, §8.1.1; exit criterion 1.

**Files:**
- Modify: `src/engine/impact/integrate.ts` (after `advance` at `:1160` and `:1324`)
- Test: `tests/engine/impact/finiteGuard.test.ts`

**Interfaces:**
- Produces: `assertFinite(head: HeadState, balls: readonly BallState[], ids: readonly BallId[], t: number,
  step: number, where: "impact" | "follow-through"): void` (exported for its test), throwing as plan decision 9.

- [ ] **Step 1: Write the failing tests**

```ts
describe("the finite-state guard (design §3)", () => {
    it("throws a RangeError naming the step on the stiff-grip fat stroke", () => {
        // The roadmap's carried defect (Task 1 Step 4's setup): NaN within 0.5 ms, today handed on.
        expect(() => simulateImpact(stiffFat, { blue: BLUE }, WORLD)).toThrow(RangeError);
        expect(() => simulateImpact(stiffFat, { blue: BLUE }, WORLD)).toThrow(
            /went non-finite .* s from contact, at step \d+ \(impact\)/,
        );
    });
    it("catches one NaN velocity at the next step, in the impact and in the follow-through", () => {
        expect(() => assertFinite(nanHead, [], [], 0.001, 3, "impact")).toThrow(/head state .* at step 3 \(impact\)/);
        expect(() => assertFinite(nanHead, [], [], 0.2, 40000, "follow-through")).toThrow(/\(follow-through\)/);
        expect(() => assertFinite(finiteHead, [finiteBall], ["blue"], 0.001, 3, "impact")).not.toThrow();
    });
    it("names the ball whose state went non-finite", () => {
        const spun = { ...finiteBall, angularVelocity: vec3(0, Number.NaN, 0) };
        expect(() => assertFinite(finiteHead, [finiteBall, spun], ["blue", "red"], 0, 1, "impact")).toThrow(
            /ball red state/,
        );
    });
    it("leaves a finite stroke's run unchanged", () => {
        // The canonical single-ball stroke at 3 m/s: its outcome equals the stored digest's run (ratchet, Step 5).
        expect(() => simulateShot(canonicalSetup("single-ball"), WORLD, { trajectory: true })).not.toThrow();
    });
});
```

`stiffFat` is Task 1 Step 4's setup; `nanHead` a head state with `velocity.x` NaN; `finiteBall` a resting ball.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/engine/impact/finiteGuard.test.ts`
Expected: FAIL (`assertFinite is not a function`; the fat stroke does not throw).

- [ ] **Step 3: Implement `assertFinite` and call it after both `advance` calls**

In the impact after `advance` (`:1160`) with `steps + 1` and `"impact"`; in `continueStroke` after `:1324` with
`steps + 1` and `"follow-through"`. t from contact is `(steps + 1)·dt − contactAt`, contactAt the tracked drive's
`arc.contactAt` or 0. The check allocates nothing.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/impact/finiteGuard.test.ts`
Expected: PASS.

- [ ] **Step 5: The ratchet (in the background)**

Rerun Task 1 Step 5's first four lines into `<temp>/after/`. Compare each with `cmp` against the baseline (`.cmp`
files for `shotMix` and `impactProbe`).
Expected: all four identical.

- [ ] **Step 6: Checks and commit**

Run the four checks. Commit `src/engine/impact/integrate.ts` and the test.
Message: `Throw a RangeError when the impact's state goes non-finite`.

---
### Task 3: The backswing's limit

Spec §5, §8.1.4, §8.2.2; exit criterion 4.

**Files:**
- Modify: `reference/swing.json` (the `body` block, `backswingLimit`), `src/reference/index.ts`
  (`swingBodyReference`), `src/engine/swing/types.ts`, `src/engine/swing/profile.ts`,
  `src/engine/swing/buildContact.ts`, `src/engine/swing/downswing.ts:72-90`, `tests/engine/support/shot.ts`
  (`testProfile`'s body, `backswingFor`), `tests/reference/reference.test.ts`
- Test: `tests/engine/swing/backswingLimit.test.ts`

**Interfaces:**
- Produces: `SwingProfile.body.backswingLimit: number`; `DownswingInput.backswingLimit` and
  `StrokeChoice.backswingLimit: number`; `swingBodyReference.backswingLimit: ReferenceValue`. Swing mode checks
  θ_max; carry mode keeps MAX_BACK_ANGLE.

- [ ] **Step 1: Write the failing tests**

```ts
describe("the backswing's limit (design §5, §8.1.4)", () => {
    // A constructed θ_max of 60°, on a swing profile with pendulumShare s.
    it("plans a backswing just inside θ_max and rejects one just beyond, naming the body's limit", () => {
        const h = (LEVER * (Math.cos(THETA_C) - Math.cos(LIMIT))) / SHARE;
        expect(() => plan(h * (1 - 1e-9))).not.toThrow();
        expect(() => plan(h * (1 + 1e-9))).toThrow(/the body's backswing limit θ_max/);
    });
    it("raises the head by ℓ(cos θ_c − cos θ_max)/s at θ_max, higher on a longer shaft", () => {
        expect(riseAtLimit(LONG_TOP)).toBeGreaterThan(riseAtLimit(TOP));
        expect(riseAtLimit(TOP)).toBeCloseTo((LEVER * (Math.cos(THETA_C) - Math.cos(LIMIT))) / SHARE, 12);
    });
    it("keeps carry mode's limit at MAX_BACK_ANGLE", () => {
        expect(() => planCarry(hAt(MAX_BACK_ANGLE) * (1 - 1e-9))).not.toThrow();
    });
    it("rejects a backswing limit outside (0, π/2]", () => {
        for (const bad of [0, -0.1, Math.PI / 2 + 1e-9, Number.NaN]) {
            expect(() => planStroke(shot({}, withLimit(bad)), WORLD)).toThrow(/profile\.body\.backswingLimit/);
        }
        expect(() => planStroke(shot({}, withLimit(Math.PI / 2)), WORLD)).not.toThrow();
    });
    it("gives the default player's θ_max as 75°", () => {
        expect(defaultProfile.body.backswingLimit).toBe(swingBodyReference.backswingLimit.value);
        expect(defaultProfile.body.backswingLimit).toBeCloseTo((75 * Math.PI) / 180, 15);
    });
});
```

`riseAtLimit(top)` is the head centre's height at the planned top above its height at contact for the backswing at
the limit (from `planDownswing`'s `thetaTop`); `withLimit(x)` is `testProfile({ body: { backswingLimit: x } })`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/engine/swing/backswingLimit.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

- `swing.json`: a top-level `body` object holding `backswingLimit`: value 1.3089969389957472 (75°), unit `rad`, bounds
  `[1.1170107212763709, 1.5707963267948966]` (64°, the knee-height top, to 90°), provisional `placeholder`, its source
  the spec §5.2 and the user's account (2026-10-18), its note the head's rise at it on the default mallet
  (ℓ·(1 − cos 75°) = 0.6178 m for ℓ = 0.833575 m) and "where the shaft meets the groin". Follow the schema of the
  file's existing entries (`readValue`).
- `index.ts`: `swingBodyReference`, read with `readValue` from the `body` block; `SWING_REFERENCE_TYPES` unchanged.
- `profile.ts`: `body.backswingLimit: swingBodyReference.backswingLimit.value`.
- `buildContact.ts`: validate `body.backswingLimit` finite and in (0, π/2]; pass it through `StrokeChoice` and
  `downswingInput`; add it to `planStroke`'s header comment.
- `downswing.ts`: in swing mode the limit is `input.backswingLimit`, its message `the backswing takes the shaft beyond
  the body's backswing limit θ_max = <x> rad (where the shaft meets the groin): …`; carry mode keeps MAX_BACK_ANGLE
  and its message. MAX_BACK_ANGLE's comment: carry mode's limit and θ_max's ceiling.
- `testProfile`: `backswingLimit: MAX_BACK_ANGLE` in its body, so existing tests keep their behaviour.
- `backswingFor`: plan decision 8. Keep `hi` from MAX_BACK_ANGLE; `at(h)` returns `Infinity` where `plannedSpeed`
  throws a RangeError naming θ_max, and the reach check evaluates the speed at the limit (bisected's bound
  ℓ·(cos θ_c − cos θ_max)/s·(1 − 1e-9)) and throws as today if that falls short. Key the memo on the body as today.
- `reference.test.ts`: the `body` block's entry passes the existing per-entry checks.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/swing/backswingLimit.test.ts tests/engine/swing tests/reference`
Expected: PASS.

- [ ] **Step 5: The ratchet (in the background)**

Rerun the four baselines into `<temp>/after/` and compare.
Expected: `impactDigest`, `shotMix` and `impactProbe` identical. In `presetDigest`, every changed line is a run now
`rejected (… θ_max …)`. List them by preset and speed in `<temp>/after/task3-rejected.txt`; every other line
identical. Any other changed line is a defect: trace it before going on.

- [ ] **Step 6: Checks and commit**

Run the four checks. Commit the files above. Message: `Limit a swing's backswing at the player's body`.

---
### Task 4: The advance

Spec §6, §8.1.5, §8.2.3; exit criterion 5; plan decisions 1–6.

**Files:**
- Modify: `src/engine/swing/types.ts` (`StrokeTiming.advance`), `src/engine/impact/types.ts` (`SwingArc.advance?`),
  `src/engine/swing/buildContact.ts`, `src/engine/impact/track.ts`, `src/engine/impact/integrate.ts`
- Test: `tests/engine/impact/advance.test.ts`

**Interfaces:**
- Consumes: `planPivot`, `pivotAt`, `computeFree` and `freeAlpha` (track.ts), which read the pivot's motion.
- Produces:
  - `StrokeTiming.advance?: number` (s from contact); `SwingArc.advance?: { readonly start: number;
    readonly speed: number }` (t_s from t = 0, V in m/s);
  - in track.ts: `interface Advance { readonly start: number; readonly speed: number; readonly ramp: number;
    readonly cruise: number; readonly decel: number; readonly end: number }` (the ramp's and the cruise's end times,
    the deceleration, t_e); `PreparedTrack.advance: Advance | null`; `advanceTravel(advance: Advance, t: number):
    { readonly a: number; readonly v: number; readonly acc: number }` (exported for tests), 0, 0, 0 before the start;
  - in integrate.ts: `FollowThrough.advanced?: { readonly start: number; readonly end: number }`.

- [ ] **Step 1: Write the failing tests**

```ts
describe("the hands' advance (design §6, §8.1.5)", () => {
    // The canonical single-ball stroke at 3 m/s, the hands pushing 0.3 m from contact, on time.
    const level = (moment = 0) => stroke({ handReach: 0.3 }, { advance: moment });
    const rising = () => stroke({ handReach: 0.3 });

    it("travels the hands exactly handReach, from rest to rest, continuously", () => {
        const a = advanceOf(level());
        expect(advanceTravel(a, a.start)).toEqual({ a: 0, v: 0, acc: a.speed / WINDOW });
        expect(advanceTravel(a, a.end).a).toBeCloseTo(0.3, 12);
        expect(advanceTravel(a, a.end).v).toBeCloseTo(0, 12);
        for (const seam of [a.ramp, a.cruise]) {
            expect(advanceTravel(a, seam - 1e-12).v).toBeCloseTo(advanceTravel(a, seam + 1e-12).v, 9);
        }
    });
    it("slows the pendulum's turn while the hands speed up: the planned ω at the ramp's end is lower", () => {
        expect(plannedOmega(level(), RAMP_END)).toBeLessThan(plannedOmega(rising(), RAMP_END));
    });
    it("flattens the head's rise over the advance", () => {
        // Plan decision 15: the head centre's highest point above its height at contact, contact to t_e.
        const { follow } = run(level());
        const end = (follow.advanced as { end: number }).end;
        expect(rise(level(), end)).toBeLessThan(rise(rising(), end));
    });
    it("resumes the arc once the hands come to rest, and finishes after them", () => {
        const { follow } = run(level());
        const end = (follow.advanced as { end: number }).end;
        expect(pitchRates(level()).some(({ t, rate }) => t > end && rate > 0)).toBe(true);
        expect(follow.finish).toBeGreaterThan(end);
    });
    it("rejects carry mode, a check, no travel and a non-finite timing", () => {
        expect(() => plan(stroke({ handReach: 0.3 }, { advance: 0 }, "half-roll"))).toThrow(/advance .* swing mode/);
        expect(() => plan(stroke({ handReach: 0.3 }, { advance: 0 }, "stop-gc"))).toThrow(/advance .* check/);
        expect(() => plan(stroke({ handReach: 0 }, { advance: 0 }))).toThrow(/advance .* handReach/);
        expect(() => plan(stroke({ handReach: 0.3 }, { advance: Number.NaN }))).toThrow(/advance must be finite/);
    });
    it("rejects a travel too short for the hands' ramp", () => {
        // Review focus 2. V·W/2 ≥ 0.8·handReach throws; just above the bound plans.
        const bound = (V * WINDOW) / 2 / 0.8;
        expect(() => plan(stroke({ handReach: bound }, { advance: 0 }))).toThrow(/advance .* ramp/);
        expect(() => plan(stroke({ handReach: bound * (1 + 1e-9) }, { advance: 0 }))).not.toThrow();
    });
    it("takes an early advance into the lead and ignores one the finish beats", () => {
        // Review focus 1. The arcs differ in the advance, so the runs are compared, not the contact states.
        expect(arcOf(plan(level(-0.02))).contactAt).toBeCloseTo(0.02, 15);
        expect(() => plan(level(-(MAX_LEAD + 0.001)))).toThrow(/more than .* early/);
        const late = run(stroke({ handReach: 0.3 }, { advance: 0.9 }));
        const none = run(rising());
        expect(late.follow.advanced).toBeUndefined();
        expect(late.result).toEqual(none.result);
        expect(late.follow).toEqual(none.follow);
    });
});
```

`stroke(over, timing = {}, type = "single-ball")` builds `canonicalSetup(type, { stroke: { ...over, timing:
{ ...ON_TIME, ...timing } } })` with its backswing from `backswingFor` at 3 m/s; `plan` is `planStroke`; `run` is
`planStroke` then `simulateStroke`, returning `{ result, follow }`; `advanceOf` is the prepared track's `advance`;
`plannedOmega(setup, t)` reads ω from `pathAt` on the prepared track; `rise` and `pitchRates` read the head from the
impact probe's snapshots and the follow probe; V and WINDOW are the canonical stroke's planned along-aim speed and
`window`; RAMP_END is contact + WINDOW.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/engine/impact/advance.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

- `prepareTrack`: in swing mode, `advance` from `arc.advance` (plan decision 3's times and deceleration), set on the
  track before `computeReach` and `computeFree`, so that the free table integrates the hands' acceleration; null
  without one.
- `pivotAt`: after the reach, when `track.advance !== null` and t > its start, add aim·a, aim·v and aim·acc
  (`advanceTravel`) to P, V and A. Without an advance it returns as today, to the bit (branch on null).
- `integrate.ts`: `finished`'s swing case also needs the advance not started (t < start) or ended (t ≥ end);
  `continueStroke` spreads `advanced: { start, end }` into its result only when the advance started before the
  finish.
- `buildContact.ts`: `timing.advance` in the finite checks and in `actions` (the lead) when given; plan decision 5's
  other checks after `arc` is built (the check by `arc.alpha < 0`); V from the planned contact velocity
  (`handsVelocity` + ω₀·n × (c − P_c), along aim); `arc.advance` only when the timing gives one; `planStroke`'s
  header lists the new rejections. The swing presets' default timing (`ON_TIME`) has no advance.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/impact/advance.test.ts`
Expected: PASS. If the head does not flatten or its arc does not resume, trace it through the free table's θ and the
hands' feed-forward (`hand` snapshots) before changing anything; any change to plan decisions 1–3 is recorded in this
plan's decisions and shown at the gate.

- [ ] **Step 5: The ratchet (in the background)**

Rerun the four baselines into `<temp>/after/` and compare with Task 3's.
Expected: all identical.

- [ ] **Step 6: Checks and commit**

Run the four checks. Commit the files above. Message: `Let a swing's hands push forward through and after contact`.

---
### Task 5: The effort law and its fit

Spec §4, §8.1.2, §8.1.3; exit criteria 2 and 3; plan decisions 7, 10–14, 19.

**Files:**
- Modify: `src/engine/swing/downswing.ts`, `src/engine/swing/types.ts`, `src/engine/swing/buildContact.ts`,
  `src/engine/swing/profile.ts`, `src/reference/index.ts`, `reference/swing.json`, `scripts/fitStrokeShape.ts`,
  `tests/engine/support/shot.ts`, `tests/engine/swing/downswing.test.ts`, `tests/engine/swing/buildContact.test.ts`,
  `tests/reference/reference.test.ts`
- Create: `scripts/effortFit.ts`
- Test: `tests/engine/swing/effort.test.ts`

**Interfaces:**
- Produces:
  - `SwingEffort`; `SwingProfile.body.effort`; `DownswingInput.effort`, `StrokeChoice.effort`;
  - `effortTorque(effort: SwingEffort, intensity: number, omega: number): number` in downswing.ts;
  - `swingBodyReference.{effortTorque, effortSpeed, effortShare}`;
  - in `scripts/effortFit.ts`: `const CEILING = 9.0`; `const SWING_PRESETS: readonly StrokeType[]`;
    `bodyTop(type: StrokeType, profile?: SwingProfile): number`; `speedAt(type, backswing, intensity,
    effort: SwingEffort, profile?): number` and `contactRate(...)` (ω at contact); `fitEffort(kappa: number,
    profile?): SwingEffort`; `fitDefault(type, intensity, effort, profile?): { backswing: number; speed: number }`;
    `checkCurve(type, effort, profile?): { increasing: boolean; concave: boolean; endSlope: number;
    meanSlope: number }` over spec §8.1.3's grid. `profile` defaults to `defaultProfile`.

- [ ] **Step 1: Write the failing tests**

```ts
describe("the effort law (design §4, §8.1.2)", () => {
    const E = { torque: 40, speed: 20 };
    it("gives i·τ_0·(1 − ω/ω_max) at fixed ω", () => {
        expect(effortTorque(E, 0.5, 5)).toBeCloseTo(0.5 * 40 * (1 - 5 / 20), 12);
    });
    it("gives +0 at intensity 0 and at or beyond ω_max", () => {
        // Review focus 4.
        for (const [i, w] of [[0, 3], [1, 20], [1, 25], [0, 25]] as const) {
            expect(Object.is(effortTorque(E, i, w), 0), `${i} ${w}`).toBe(true);
        }
    });
    it("keeps the gravity-only swing at intensity 0 whatever the effort", () => {
        expect(planned(0, E)).toEqual(planned(0, { torque: 0, speed: 1 }));
    });
    it("balances the downswing's work and energy within 0.1 % at every intensity", () => {
        for (const i of [0, 0.25, 0.5, 0.75, 1]) {
            expect(Math.abs(workEnergyResidual(i, E)), `${i}`).toBeLessThan(1e-3);
        }
    });
    it("applies the torque until contact: the planned speed rises with ω_max", () => {
        expect(planned(1, { torque: 40, speed: 40 }).omega).toBeGreaterThan(planned(1, E).omega);
    });
    it("rejects a negative torque or a non-positive speed", () => {
        // Review focus 5.
        expect(() => planStroke(shot({}, withEffort({ torque: -1, speed: 20 })), WORLD)).toThrow(
            /profile\.body\.effort\.torque must be non-negative/,
        );
        expect(() => planStroke(shot({}, withEffort({ torque: 1, speed: 0 })), WORLD)).toThrow(
            /profile\.body\.effort\.speed must be positive/,
        );
    });
});

describe("the default player's effort (design §4.2, §4.3, §8.1.3)", () => {
    it("reaches the ceiling on every swing preset from its body-limited top, the weakest exactly", () => {
        const tops = SWING_PRESETS.map((t) => speedAt(t, bodyTop(t), 1, defaultProfile.body.effort));
        for (const u of tops) {
            expect(u).toBeGreaterThanOrEqual(CEILING * (1 - 1e-9));
        }
        expect(Math.min(...tops)).toBeCloseTo(CEILING, 6);
    });
    it("uses κ of ω_max at contact on the drive at full effort", () => {
        const { effort } = defaultProfile.body;
        const rate = contactRate("drive", bodyTop("drive"), 1, effort);
        expect(rate / effort.speed).toBeCloseTo(swingBodyReference.effortShare.value, 6);
    });
    it("is increasing and concave with no flat top on each swing preset's default and top", () => {
        // The fast subset: two backswings, intensity in steps of 0.1. The full grid is the slow test below.
        const { effort } = defaultProfile.body;
        for (const t of SWING_PRESETS) {
            for (const h of [swingReference[t].defaultBackswing.value, bodyTop(t)]) {
                const u = Array.from({ length: 11 }, (_, k) => speedAt(t, h, k / 10, effort));
                for (let k = 1; k < 11; k++) {
                    expect(u[k] as number, `${t} ${h} ${k}`).toBeGreaterThan(u[k - 1] as number);
                }
                for (let k = 1; k < 10; k++) {
                    const second = (u[k + 1] as number) - 2 * (u[k] as number) + (u[k - 1] as number);
                    expect(second, `${t} ${h} ${k}`).toBeLessThan(0);
                }
                const end = ((u[10] as number) - (u[9] as number)) / 0.1;
                expect(end, `${t} ${h}`).toBeGreaterThanOrEqual(0.25 * ((u[10] as number) - (u[0] as number)));
            }
        }
    });
    it.runIf(SLOW)(
        "is increasing and concave with no flat top over the whole backswing range",
        () => {
            for (const t of SWING_PRESETS) {
                const c = checkCurve(t, defaultProfile.body.effort);
                expect(c.increasing, t).toBe(true);
                expect(c.concave, t).toBe(true);
                expect(c.endSlope, t).toBeGreaterThanOrEqual(0.25 * c.meanSlope);
            }
        },
        240_000,
    );
});
```

The tests import from `scripts/effortFit.ts` (the fit's solver and the test agree by construction; the test's
assertions are on the engine's speeds). `workEnergyResidual` is P2b.2b.2a's balance (`downswing.test.ts`), the
torque's work integrated over the table's θ.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/engine/swing/effort.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the law**

- `types.ts`: `SwingEffort`; `body.effort`; `SwingShape` without `effort`, `handTempo` nullable (plan decision 7);
  header comments.
- `downswing.ts`: `effortTorque`; the swing branch's `accelOrFail` reads `effortTorque(input.effort, intensity, om)`
  in place of the pulse, and the header's effort bullet describes the Hill law (Hill 1938). The carry branch reads
  `shape.handTempo` (non-null, checked).
- `buildContact.ts`: drop the shape's effort checks; validate `body.effort.torque` finite ≥ 0 and `.speed` finite
  > 0; a carry stroke with a null `handTempo` fails (`profile.shape.<type>.handTempo is required in carry mode`);
  `handTempo`'s finite checks only when non-null; plumb `effort`; update the header.
- `profile.ts`: `body.effort` from `swingBodyReference`; `shapeOf` gives a swing preset `handTempo` from `swing.json`
  or null, and no effort; a swing preset's entry holding `torqueMax`, `tempoSlow` or `tempoFast` throws a
  `ReferenceDataError` (retired keys); update the file header.
- `index.ts`: drop `effort` from `StrokeShapeReference` and `EFFORT_KEYS`'s reading, rejecting the retired keys
  instead; read the three new body entries.
- `testProfile`: body `effort: { torque: 0, speed: 1 }`; shape without `effort`.
- Migrate the existing tests that build or read `shape.effort` (the list in this step's `grep -rnE
  "torqueMax|tempoSlow|tempoFast|\.effort\b" tests`): a test that set a torque now sets `body.effort`, its expected
  figure re-derived and commented as Global Constraints require.

- [ ] **Step 4: Write the fit**

`scripts/effortFit.ts` as its Interfaces block, the cases built as `fitStrokeShape.ts`'s `caseOf` builds them:

- `fitEffort(kappa)`: the outer bisection on τ_0 over [0, hi], hi doubled from 1 N·m until the lowest U(1) at the
  tops reaches CEILING; for each τ_0 the inner bisection on ω_max over [lo, hi], lo the gravity-only drive's ω at
  contact from its top over κ and hi doubled until ω_c(ω_max) − κ·ω_max < 0; each until the bracket is within 1e-9
  of its upper end, relative (plan decision 11).
- `fitDefault(type, intensity, effort)`: the backswing in (0, bodyTop] planning 3 m/s, 60 halvings.
- `checkCurve`: spec §8.1.3's grid (backswings 0.05 m to the top in ten equal steps, intensity in steps of 0.05):
  increasing strictly in i, second differences in i all negative, and plan decision 14's end slope against the mean
  slope, the worst over the backswings.

Rewrite `scripts/fitStrokeShape.ts` (header and body): read κ and θ_max from `swingBodyReference`; write
`body.effortTorque` and `body.effortSpeed` (provenance `derived`, placeholder, notes giving CEILING, κ and the
weakest preset); for the swing presets drop `torqueMax`, `tempoSlow` and `tempoFast` and, unless
`KEEP_DEFAULTS=1`, write `defaultBackswing`, `defaultIntensity` (0.25, plan decision 13) and `defaultSpeed` from
`fitDefault`; leave every carry preset's values untouched, appending to the notes of its `handTempoSlow`,
`handTempoFast` and `defaultBackswing` "Frozen at engine 0.12.0's fit (P2b.2b.2c.1 design §4.4)." Run `checkCurve`
on every swing preset and throw naming the preset if it fails. Print to stderr τ_0, ω_max, each preset's top, U(1)
at it and the drive's κ·ω_max against its ω at contact. Add `effortShare` (κ = 0.6666666666666666, placeholder, spec
§4.4) to the `body` block by hand first.

- [ ] **Step 5: Run the fit with the defaults kept**

Run: `env KEEP_DEFAULTS=1 npx --yes tsx scripts/fitStrokeShape.ts > <temp>/after/swing-task5.json 2> <temp>/after/fit-task5.txt`
Then copy it over `reference/swing.json` and run `npx prettier --write reference/swing.json`.

Check with `python3 -I` that every carry preset's `handTempoSlow`, `handTempoFast` and `defaultBackswing` values
equal the baseline's (`git show main:reference/swing.json`) exactly, and that no swing preset holds the retired keys.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/swing tests/reference`
Expected: PASS.

- [ ] **Step 7: The ratchet (in the background)**

Rerun the four baselines into `<temp>/after/` and compare with Task 4's.
Expected: all identical (every default intensity is still 0). Any changed line is traced before going on.

- [ ] **Step 8: Checks and commit**

Run the four checks. Commit the files above and `scripts/effortFit.ts`.
Message: `Replace the effort pulse with a Hill-type law fitted to the ceiling`.

---
### Task 6: The pre-flight gate

Spec §8.4, §8.5, §10; exit criteria 6, 7 and 11; plan decisions 13, 16–19.

**Files:**
- Create: `scripts/singleBallProbe.ts`, `docs/superpowers/probes/<date>-p2b2b2c1-gate.txt`
- Modify (working tree only, not committed here): `reference/swing.json`

**Interfaces:**
- Consumes: Task 5's `scripts/effortFit.ts`; `simulateShot`, `planStroke`, `simulateStroke`, `simulateFreeMotion`,
  `stateAtTime`; Task 1's `effortCurve.mts`.
- Produces: the gate's output, sections A–K below.

- [ ] **Step 1: Write the probe**

`scripts/singleBallProbe.ts`, header comment per repo style, one section per item, every figure to 4 decimals:

- **A. U(i)** for every swing preset from its `defaultBackswing` and from `bodyTop`, i = 0, 0.1, …, 1, at κ = ⅔, and
  from the top at κ = ½ and ¾ (each `fitEffort(κ)`).
- **B. The defaults:** the shared intensity, each swing preset's backswing at 3 m/s at 0.25 and at 0.5.
- **C. θ_max:** the head's rise at the default θ_max on the default mallet and the user's (plan decision 18), and
  the knee-height check: the rise against the user's "about knee height" (0.48 m on the default mallet, spec §5.2).
- **D. The styles:** single-ball at 3 and 5 m/s, rising (no advance) and level (`timing.advance` 0, `handReach`
  0.3): the striker's launch speed, spin, skid length (to the phase-2 `phase` event of rolling), travel to rest, the
  face's contact time, the head's highest point over the advance and the follow-through's finish and flags.
- **E. The mistimed advance:** `timing.advance` −0.02, −0.01, −0.005, 0, 0.005, 0.01, 0.02, 0.04, 0.08, 0.16, 0.32 s,
  and `drive` 0, 0.25, 0.5, 0.75, 1 with no advance: the face's contact time, the head's highest point after
  contact, whether the advance started before the finish, the fault judge's faults.
- **F. The flick:** plan decision 17's sweep: the head's rise angle at contact (atan of its velocity's vertical over
  along-aim at the first face contact), the striker's launch angle, airborne or not; the first airborne step.
- **G. Head ahead:** plan decision 16's tally over D–F and the single-ball and GC stop presets' `swingProbe` grid
  (5 speeds × 5 drives × 3 heights × 3 sides), each failure with its run and time.
- **H. The guard:** RangeErrors naming "non-finite" over every run above (expected none).
- **I. θ_max's rejections:** the count from `<temp>/after/task3-rejected.txt` (passed as a path argument).
- **J. The user's checks** (spec §8.5), on `defaultWorld(10)`: the single ball from a 0.45 m backswing at i = 0,
  0.1, …, 1, its distance to rest in yards beside the user's 5, 15 and 30 yd; the drive from its top at i = 1, the
  croqueted ball's distance against the full 35 yd.
- **K. The cost:** the downswing table's length at each preset's default and at its top at i = 1.

- [ ] **Step 2: Write the proposed defaults into the working tree**

Run: `npx --yes tsx scripts/fitStrokeShape.ts > <temp>/after/swing-proposed.json 2> <temp>/after/fit-proposed.txt`
Copy it over `reference/swing.json` (not committed), Prettier it, and check again that the carry presets' values are
unchanged to the bit.

- [ ] **Step 3: Run the gate (in the background)**

Run: `npx --yes tsx scripts/singleBallProbe.ts <temp>/after/task3-rejected.txt > docs/superpowers/probes/<date>-p2b2b2c1-gate.txt`
Run: `npx --yes tsx <temp>/scripts/effortCurve.mts > <temp>/after/effortCurve.txt`

Add to the gate file, above section A, today's U(i) from `<temp>/baseline/effortCurve.txt`, labelled as main's law.

- [ ] **Step 4: Present the gate and stop**

Show the user, from the gate file and the fit's stderr: τ_0, ω_max and κ; U(i) per preset beside today's; the
proposed 0.25 and its backswings beside 0.5 and the user's checks; θ_max's rise on both mallets; the styles' and the
flick's sweeps; θ_max's rejections and the guard's catches; every head-ahead failure, each for a ruling; plan
decision 3's hands' speed profile (the head's planned speed along aim, reached over the window), which the user may
want as an input; any test whose expectation changed
unpredicted. Ask for a ruling in the user's own words on each.

**Wait for the ruling.** Do not start Task 7 until the user has ruled. A ruling that changes a figure (κ, θ_max, the
intensity) is applied in `swing.json` and the fit rerun, and the gate's affected sections rerun and shown again.

- [ ] **Step 5: Commit the probe and the gate's output**

Restore the committed `reference/swing.json` (`git checkout -- reference/swing.json`) only if the ruling changes it;
otherwise keep it for Task 7. Run the four checks with the committed `swing.json`. Commit `scripts/singleBallProbe.ts`
and the gate file. Message: `Add the single-ball stroke's gate probe and its figures`.

---
### Task 7: The hands-assisted defaults

Spec §4.5, §8.2.4, §8.3, §8.6; exit criteria 8 and 9.

**Files:**
- Modify: `reference/swing.json` (the ruled defaults), every test the change moves

**Interfaces:**
- Consumes: the gate's ruling; `<temp>/after/swing-proposed.json` or its ruled variant.

- [ ] **Step 1: Apply the ruled defaults**

`reference/swing.json` is the fit's output under the ruling (Task 6 Step 2), Prettier-formatted.

- [ ] **Step 2: Run the suite and re-baseline**

Run: `npm test`
Every failing test on a swing preset's default backswing or intensity: trace why the figure moved (the new default,
or the law at intensity > 0), then re-baseline it with the comment "P2b.2b.2c.1: the single-ball stroke (was …)". A
failure whose move the spec does not predict goes to the user before it is re-baselined. Gugan's jab check: Global
Constraints, "Kept as they are".

- [ ] **Step 3: The ratchet (in the background)**

Rerun the four baselines into `<temp>/after/` and compare with Task 1's.
Expected: `impactDigest`, `impactProbe` and the shot mix's phase 2 identical; in `presetDigest` every carry-mode line
(the three rolls) identical, and the moved swing-mode lines counted per preset into
`<temp>/after/task7-moved.txt`. Rerun `strokeProbe` and `swingProbe` and list each swing preset's canonical figures
old → new in the same file.

- [ ] **Step 4: Checks and commit**

Run the four checks. Commit `reference/swing.json` and the re-baselined tests.
Message: `Make the swing presets' default strokes hands-assisted`.

---
### Task 8: The probes, the figures and the documents

Spec §9, §11; exit criteria 10 and 12.

**Files:**
- Create: `docs/superpowers/probes/<date>-p2b2b2c1-{strokeProbe,swingProbe,impactProbe,singleBallProbe}.txt`
- Modify: the roadmap; the spec's Amendments

- [ ] **Step 1: Run the probes (in the background)**

Run each into its `docs/superpowers/probes/<date>-p2b2b2c1-<name>.txt`: `scripts/strokeProbe.ts`,
`scripts/swingProbe.ts`, `scripts/impactProbe.ts`, `scripts/singleBallProbe.ts <temp>/after/task3-rejected.txt`.
Then, alone: `env COUNT=800 npx --yes tsx scripts/shotMix.ts > <temp>/after/shotMix-cost.txt`.

Check from `swingProbe`'s output that no run of any preset's late re-hit sweep ends with the head overlapping a ball
as handed over (exit criterion 10), and record the cap and flag tallies.

- [ ] **Step 2: The roadmap**

- The P2 row: P2b.2b.2c.1's spec and plan paths and its exit criteria's outcome.
- A new section "P2b.2b.2c.1 outcomes (<date>)": spec §11's figures (U(i) per preset; τ_0, ω_max, κ; the defaults;
  the user's checks; the styles' and the flick's sweeps; the head-ahead tallies; the canonical figures and the
  sweep's tallies as P2b.2b.2b.3 recorded them; the cost: the downswing's steps and `shotMix`'s engine time against
  Task 1's), and §9's list of where the modes split, noting that the advance and the held slope are no longer carry
  mode's alone.
- "Carried open items": the NaN defect closed by the guard; Gugan's jab and the weak dead stop as they stand.

- [ ] **Step 3: The spec's Amendments**

Fold in plan decisions 1–19, each in a sentence with its reason, and the gate's rulings in the user's words.

- [ ] **Step 4: Checks and commit**

Check the line lengths of every markdown file touched. Commit the probe files, the roadmap and the spec.
Message: `Record the single-ball stroke's probes and outcomes`.

---
### Task 9: The version and the exit criteria

Exit criteria 1–13.

**Files:**
- Modify: `src/engine/simulate.ts:77`, any test pinning the version string

- [ ] **Step 1: Bump the version**

`ENGINE_VERSION = "0.13.0"`. Run `grep -rn "0\.12\.0" src tests` and update any test that pins the engine version.

- [ ] **Step 2: Run everything**

Run: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`, one per call.
Run: `env SLOW_TESTS=1 npm test` (in the background).
Expected: all pass; Gugan's jab check still an expected failure, or removed with the gate told.

- [ ] **Step 3: Walk the exit criteria**

For each of spec §1's thirteen criteria, name the test, ratchet file or probe line that shows it met, in the commit
message's body. Any criterion not met stops for the user.

- [ ] **Step 4: Commit**

Commit `src/engine/simulate.ts` and any version test. Message: `Bump the engine version to 0.13.0`.

Then use superpowers:finishing-a-development-branch.
