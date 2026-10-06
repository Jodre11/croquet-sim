# P2b.2b.1 — Tracked Drive, Mallet–Turf Contact, Swing Model and `simulateShot` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a `ShotSetup` into a whole shot: a swing model builds the mallet head's state, the path the hands follow
and how the two hands hold the shaft; the impact integrates the swung body pulled along that path (re-contacts, the
whole head meeting the balls and the head meeting the turf included); the fault judge rules on it; phase 2 rolls the
balls out.

**Architecture:** `ContactState.drive` becomes a union. The force table stays as `{ kind: "force", samples }`,
bit-identical. The new `{ kind: "track", arc, coupling, hands }` drives the mallet along two arcs (the pendulum about
the top hand, and the hands' path through space with its dip and reach) in one of two modes, swing or carry
(`src/engine/impact/track.ts`). Two hands on a rigid shaft hold it: the top hand a pivot, the bottom hand a rate guide
(swing) or a firm grip (carry), opening by reach; an arm mass rides at the top grip, and the integrator steps the swung
body. A head–turf pair and a whole-head cylinder contact with the balls join the impact for tracked drives. A swing
model (`src/engine/swing/`) derives the arc, the hands, the head's placement and its start state from a `ShotSetup` and
a `SwingProfile`. `src/engine/shot.ts` wires `buildContact` → `swingApproach` → `simulateImpact` → `strokeContext` →
`judgeFaults` → `simulateFreeMotion`. The judge gains 29.1.13's "plays away from" and 29.1.14.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Vitest, ESLint, Prettier. No new dependencies;
`npx --yes tsx` runs the scripts.

**Spec:** `docs/superpowers/specs/2026-10-04-p2b2b1-swing-shot-design.md`. Read all of it, including its "Amended"
notes: "pre-flight and prototype" (2026-10-05) supersedes the earlier notes where they differ, and the re-plan note
(2026-10-05) and the pre-flight note (2026-10-06: the GC stop a single-ball stroke, the late re-hit, a check braking
to rest, the AC stop told from the drive by its ratio, the timings' distances) amend it. Also read:

- Impact spec: `docs/superpowers/specs/2026-10-03-p2b1-impact-integrator-design.md` (§3 `ContactState`, §5
  integrator).
- Fault spec: `docs/superpowers/specs/2026-10-04-p2b2a-obstacles-faults-design.md` (§3 `StrokeContext`, §7 table).
- Roadmap: `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`, the P2 and P3 rows, "P2b.2 decisions"
  and "P2b.2a outcomes carried forward".
- Laws: World Croquet Federation, *Laws of Association Croquet*, 7th edition, with Official Rulings and Commentary,
  <https://worldcroquet.org/wp-content/uploads/2021/04/Laws-Rulings-Commentary-combined-published-master-.pdf>. You
  need Law 29.1.14, C29.18 and C29.19. Extract with `curl -sSL -o <file>.pdf <url>`, then
  `pdftotext -layout <file>.pdf <file>.txt`.

**History.** This plan replaces the first P2b.2b.1 plan (merged in PR #12). Its pre-flight ran that plan literally and
found two model failures (the roll catapult and the relaxed AC check) and about thirty mechanical defects; a throwaway
prototype (`proto-two-hands`, pass 4 at `aeadd4c`, never merged) then converged on the two-hand model the spec now
describes. Every figure below marked "prototype" is from pass 4 with the spec's preset table, or from this plan's own
code run on a scratch copy while planning; pre-flight re-measures them all.

**Decisions made while planning:**

- **Kept from the first plan** (spec "Amended 2026-10-05 (plan)" note): C29.18 sets no angular test, so "more than
  90°" is the engine's reading (user decision); `StrokeContext` gains `lineOfCentres?` beside `aim?`;
  `ImpactSetup.headTurf: PairLaw | null`; the head–turf pair acts at the lowest point itself; `contact.json` uses flat
  keys; the default shaft is 0.9144 m (36 in), sourced; the canonical striker stands at (9.6012, 4), clear of the peg.
- **No `shaftToHead`, no single-point coupling, no `Coupling.tension`.** The head is rigid on the shaft, so its
  orientation on the path is rot(n, θ) ⊗ q_aim, and the top hand's tension is `Hands.gripTension`. The prototype's
  optional knobs (`springAfterContact`, `armSplit`, `reachEase`, `bottomMax`, `freePendulum`) are not carried over.
- **`PreparedTrack` is immutable.** The bottom hand's release is per-run state: `integrate` makes a `GripState` with
  `newGripState()` and passes it to `handLoad`.
- **`HandLoad.torque` is about the head's centre** and complete: every hand force's moment at its grip plus the bottom
  hand's couple. The swung-body step moves it to the swung body's centre with the other loads.
- **The reach** eases the along-aim component only; the off-aim part of the pivot's velocity runs on (spec §3.2).
  `t₁` is found by 80 bisections over 0.5 s after `contactAt`, which assumes the plan's travel along aim is monotone
  there (every `buildContact` path's is). A reach with no span (`handReach` 0, or v₁ 0) gets no carry descent.
- **"Inside a check"** is α < 0 and `arcStart` ≤ t ≤ `arcStart` + `window` (`inCheck`); the prototype had no lower
  bound, which differs only for a pendulum timed late.
- **Exit criterion 3's strike measure sums every ball** (spec §8.1 corrected in this PR). The drive's canonical setup
  is a croquet stroke, and the croqueted ball takes its momentum through the striker's ball within the first
  `face/<striker>` interval: the striker's ball alone gives 0.286 kg against the closed form's 1.0066 kg; both balls
  give 1.00655 kg. The test allows 1 %.
- **The dip after contact on a tilted shaft is not tracked exactly in carry mode** (spec §3.3 qualified in this PR).
  F_d is applied whole at the top grip, and its moment about the swung body's centre is not in τ_ff; in swing mode
  the free pendulum includes the dip in A, so it is consistent. No preset dips in carry mode.
- **The AC stop's dip is 11 mm** (spec: "about 11 mm"). Prototype: the head first meets the turf 12.70 ms after
  contact (the face interval ends at 1.17 ms), 1.73 mm deep; 12 mm reaches 2.11 mm and raises `impact-head-deep`, 10 mm
  reaches 1.32 mm. Every depth from 8.0 to 11.5 mm meets both conditions. Pre-flight confirms.
- **Constants live by their reader:**
  - `HAND_COUPLING`, `FREE_STEP` and `FREE_SPAN` (0.55 s) in `impact/track.ts`;
  - `HEAD_TURF_FRICTION` in `impact/simulateImpact.ts`;
  - `HEAD_DEEP_LIMIT`, `TRACK_IMPACT_CAP` (0.45 s), `LOOK_AHEAD` (0.03 s) and `ENTRY_SLACK` (1e-6 m) in
    `impact/integrate.ts`;
  - `START_GAP` and `MAX_LEAD` in `swing/buildContact.ts`;
  - `swing/profile.ts` exports `defaultProfile`, `DEFAULT_DRIVE` (the planner's default `drive` per preset) and
    `ON_TIME`.
- **Integrator names Tasks 6 and 7 build on** (Task 4): the prepared drive is `plan` (never `track`: `integrate`
  already has a `TurfTrack` named `track`), the run's grip state `grip`, the step's hand load `hand` (null for a force
  table); `advance` delegates to `stepHead` (force, bit-identical) or `stepSwung` (track); `release` is spread onto
  `finish`'s result at the end of `integrate`, and `finish` itself adds `headTurfSlide` (Task 6), `headRegions` and
  `entryJumps` (Task 7).
- **`TRACK_IMPACT_CAP` is 0.45 s** (user decision, 2026-10-05, after the dry run). At 0.15 s the canonical
  drive ran to the cap: in swing mode after contact the look-ahead's v_path is the unstruck free pendulum (2.5–3 m/s),
  so it predicted a catch on every step. Between the drive's two hits the bottom hand's rate guide pushes +4.05 N·s
  along aim and the top hand −3.06 N·s: the guide steers towards the planned (unstruck) arc, so after the strike it
  restores lost speed, which is what makes the follow-through re-hit. The user kept that model and raised the cap so
  every re-hit is integrated. With it the drive ends by itself: at 4 m/s after 2 hits, 138 ms after contact; at 3 m/s
  after 2 hits, 181 ms; at 2 m/s after 4 hits (0, 82, 127 and 159 ms, the last on the rim), 269 ms. In the preset
  sweep the drive's longest natural end is 314.6 ms after contactAt (324.8 before the check to rest) and every other
  preset's at most 309 ms; 0.45 s is about 43 % over 314.6 ms. `FREE_SPAN` covers `MAX_LEAD` plus the cap: 0.55 s.
  (A first sweep at a 0.5 s cap gave 395 ms, but with the table still 0.25 s long, so its path clamped beyond it;
  324.8 ms was the corrected figure before the check to rest.)
- **`guideEffort`** (user decision, 2026-10-06; spec §3.1, §3.3, §5.1). How hard the drive's bottom hand pushes
  after the hit is the player's choice: the usual aim is to restore the arc's speed the hit took, a softer shot uses
  less of that effort and a very soft one none. `Hands.guideEffort` (in [0, 1]) scales, in swing mode after contact,
  the rate guide outside a check and the one-sided push after the release; inside a check the guide is at full
  strength whatever the effort, and carry mode is unaffected. `SwingDrive.guideEffort` is the preset's default and
  `stroke.guideEffort?` the shot's own (shot over preset, as `handReach`); every preset's default is 1, which
  multiplies exactly, so every figure measured at the cap above stands (digest, probe, suite re-run). At 0 the 2 m/s
  canonical drive strikes once and ends by itself at 110.6 ms; at 1 it strikes four times (268.9 ms). The light
  guide's restoration over about 90 ms stands in for the delays between the player's intent and what is observed;
  P2b.2b.2 calibrates how quickly the guide acts against observed strokes (maintained contact, a double tap or a late
  re-hit).
- **The GC stop is a single-ball stroke** (user decision, 2026-10-06; spec "Amended 2026-10-06", §5.1, §5.4, §5.5,
  §9). There is a gap between the striker's ball and the target, about 0.3 m at best; the first plan's touching,
  croquet GC stop was wrong. `CROQUET_STROKES` drops `"stop-gc"`, and `STROKE_TYPES` is listed in full, in the
  presets' order, so every per-type array keeps its order. `canonicalSetup("stop-gc")` puts red on the aim line with
  a gap of `GC_STOP_GAP` = 0.3 m surface to surface and `live: ["red"]`; `CanonicalOptions.targetGap` places the same
  target at any gap, for the GC stop or the single-ball stroke (the probe's gap sweep). The preset is unchanged. Its
  outcome is the distances after the first touch (`gc` in Task 12), not the croquet ratio; P2b.2b.2 calibrates them.
  The GC stop is judged as an AC single-ball stroke; the Golf Croquet Rules wait for a GC-rules phase. Every GC-stop
  figure below that came from the touching setup is marked "re-measured by pre-flight".
- **The late re-hit** (user decision, 2026-10-06; spec §3.5, §9, §10). The impact ends when the look-ahead sees
  nothing the head would reach, and phase 2 moves the balls with no mallet in it, so a ball that comes back into the
  follow-through's arc is never checked. This phase records it as a known limit for every shot and only measures it:
  Task 12's `rehit` section (and the `gc` sweep) sweeps the real head from the impact's end, moved on by its planned
  path's displacement and rotation (`headOnPath`, out to `FREE_SPAN`; user decision, 2026-10-06: measure from the
  real head), against every ball's phase-2 trajectory (`stateAtTime`) and counts crossings; the same sweep, head and
  shaft, counts crossings with the hoops' uprights and crowns and the peg. No engine change and no fault. P2b.2b.3,
  after P2b.2b.2, is the whole swing (user decisions, 2026-10-06; spec "Amended 2026-10-06", §10): the backswing from
  its top, the lead-in and the follow-through, along the path P2b.2b.2 models and calibrates per shot type, its head
  and shaft swept against every ball, the uprights, the crowns and the peg, with head–obstacle and shaft contact, any
  crossing re-opening the impact, and 29.1.6.1, 29.1.6.2, 29.1.11 and 29.1.10 judged. The phase was first placed
  before P2b.2b.2 as P2b.2b.1b; the user moved it after: "first we must model the stroke shape and amplitude and
  calibrate to the different shot types, but we will need the model to be complete enough for the rest later".
  Within this phase's impact 29.1.11 is judged but the head never meets a hoop or the peg, so 29.1.10 is never
  judged: a known limit.
- **A check brakes the head to rest, not past it** (user decision, 2026-10-06; spec §3.3, §8.1). Pre-flight found the
  canonical GC stop's check, its feed-forward sized to stop the unstruck head from 3 m/s (about −300 N over its 10 ms
  window), braking a head the strike had already slowed to 1.145 m/s by 0.83 ms: the head crossed rest at about
  5.6 ms and ended the impact moving back at −1.0928 m/s along aim. A player stops the mallet; they do not pull it
  back. In swing mode from contact, inside a check, the hands now apply the head's share of the planned deceleration,
  `checkShare(rate, planned)` on the pitch rates about n (Task 4): all of it at or above the path's rate, none at or
  below rest, rate/planned between, scaling α_path and the socket's tangential r·α so the wrench stays rigid and its
  split exact. A slowed head then keeps its fraction of the path's rate and comes to rest with the path at the
  window's end; the rate guide's target is the head's rate held within [0, ω_path], so it brakes a head ahead of the
  path, returns one past rest, and neither pushes nor pulls one between. The GC stop's head ends at −3.2e-4 m/s.
  After contact the hands have no position springs, and after the window swing mode's guide pushes only a head
  slower than the free pendulum, which starts from rest at a full check's end and, the canonical stops having just
  passed the lowest point, swings back: nothing pulls a rested head forward into a re-hit. An unstruck check, every
  stroke without a check, carry mode and force tables are unchanged bit for bit. A clamp-and-hold alternative (the
  planned deceleration until rest, then a hold towards rest) was measured and rejected: its switch left the pivot
  moving, and the GC stop's head ended the window at +0.233 m/s.
- **The AC stop is told from the drive by its coaching ratio** (user decision, 2026-10-06; spec §8.1). The striker's
  ball's speed at the impact's end (AC stop 1.3800, drive 1.3919 m/s) differed by 0.86 % between speeds taken 21.6 and
  181 ms after contact. The stops' test compares the ratios after phase 2 instead: AC stop 6.464, drive 3.316.
- **The timings show what makes a better stop shot in play** (user decision, 2026-10-06; spec §9). Task 12's
  `timings` prints, for every variant, both balls' distances after phase 2 and the coaching ratio, beside lawn or
  ball first, the dig, the slide and the launch.
- **Known behaviours pre-flight watches** (no test asserts against them):
  - the canonical drive ends by itself 181.4 ms after contact, after 2 hits; AC-stop runs whose head rests on the turf
    still reach the cap (the resting head is a closed contact);
  - the AC stop's highest ball centre is 4.19 mm above R (pre-flight, with the check to rest; 4.17 before), 0.81 mm
    inside exit criterion 4's 5 mm;
  - the AC stop's head, outside its check once the turf has arrested it, ends the impact pitching slightly back
    (−0.037 m/s along aim, −0.21 rad/s; −0.026 m/s before the check to rest). It happens after the check's window,
    while the head is on the turf and the top hand pulls back (−13.6 N along aim at 20 ms); not yet diagnosed;
  - the full roll at 4 m/s gives a ratio of about 52: its 0.30 m reach runs out with the striker's ball still on the
    face (a known miss, deferred with the steep rolls);
  - the late re-hit: no shot checks a ball coming back into the follow-through after the impact has ended; Task 12's
    `rehit` and `gc` sections count how often the follow-through (the real head moved on by the planned path) would
    cross one, and how often its head or shaft would meet an upright, a crown or the peg;
  - the end rule's look-ahead watches the front face only, so on 6 pass-roll runs of the preset sweep the head meets
    the striker's ball 0.1 ms after the impact ends, on its rim in 3 and its barrel in 3. P2b.2b.3's re-opening of
    the impact covers it.

## Global Constraints

- **Formatting.**
  - 4-space indentation, 120-column limit, LF line endings, UTF-8.
  - Check lengths with `env LC_ALL=en_GB.UTF-8 grep -nE "^.{121,}$" <file>`. macOS awk counts bytes.
  - Run `npx prettier --write` on every code file you touch; `npm run format:check` must pass.
  - `.prettierignore` lists `docs/`, so wrap markdown by hand. Prettier does not re-wrap comments or strings, so wrap
    any comment over 120 columns by hand, and split any template literal over 120 columns with `+`.
  - JSON `quote`, `source` and `note` strings stay on one line, as in the existing reference files.
- **Engine purity.**
  - `src/engine/**` is pure and deterministic: no DOM, no time of day, no randomness.
  - Iterate balls in `BALL_IDS` order, obstacles in `obstaclesOf` order and pairs in pair-list order. The head–turf
    pair comes after every other pair. Sum forces in that order.
- **Determinism lint.**
  - Engine code uses only IEEE-exact operations: `+ − * /`, comparisons, `Math.sqrt`, `Math.abs`, `Math.min`,
    `Math.max`, `Math.round`, `Math.floor`, the constant `Math.PI`, and the engine's own `sinCos` and `atan2`
    (`src/engine/math/elementary.ts`).
  - No `Math.sin/cos/atan2/asin/exp/log/pow/hypot` and no `**` in engine code. `npm run lint` enforces it.
  - Tests and scripts may use any `Math` function.
- **Style.**
  - No non-null assertions (`!`); the repo style is `x as T` after indexing.
  - Braces on every `if`.
  - Write `0 - x` rather than unary minus in engine arithmetic, as the impact files do. It keeps mirrored set-ups
    exact.
  - Exported functions carry a header comment. A named numerical constant says why it is not physical.
  - Use `import type` for type-only imports (`verbatimModuleSyntax`).
- **Units.** SI. A ball on the turf in phase 2 has `z = R`, `vz = 0` exactly. Inside the impact a resting ball sits
  at its static sink, `z = R − m·g/k_turf`.
- **Engine version.** `ENGINE_VERSION` becomes `"0.6.0"` (Task 11).
- **Force tables stay bit-identical to P2b.2a** (spec exit criterion 2).
  - Task 1 Step 1 saves the baseline digest, including 2,000 obstacle-fuzz strokes.
  - After Tasks 1, 4, 5, 6 and 7, the whole digest is byte-identical to that baseline (`cmp`), `timeline ` and
    `obstacle ` lines included.
  - After Task 11, `npx --yes tsx scripts/shotMix.ts` prints work units p99 143,084, p99.9 362,050 and max 408,030
    exactly, and `SLOW_TESTS=1 npm test` passes.
- **Slow tests** run only when `SLOW_TESTS` is set (`import.meta.env.SLOW_TESTS`).
- **RED steps.** Vitest does not type-check. Where a test uses a missing export or field, the RED run shows runtime
  failures (`… is not a function`, `Cannot read properties of undefined`, an assertion on `undefined`, or Vitest's
  `Cannot find module … imported from …` for a missing file), and `npm run check` shows the type errors.
- **Behaviour figures.** A test that rests on model behaviour (a tracking bound, a mechanism, an impulse) carries the
  figure measured while planning and its margin. Where one fails, find out why before changing an expectation; a
  changed expectation goes to the user if it touches the spec.
- **Bash.** One command per call: no `&&`, `||`, `;`, `$(…)` or subshells.
- **The temp directory.** `<temp>` in a Run line is the literal path of `$CLAUDE_TEMP_DIR`, written out in full:
  worktree sessions refuse the variable (pre-flight D1.1, D11.1).
- **Commits.**
  - Short imperative sentence (repo style), signed.
  - Write the message to `$CLAUDE_TEMP_DIR/msg.txt` and commit with `git commit -F <path>`, where `<path>` is the
    literal value of `$CLAUDE_TEMP_DIR` followed by `/msg.txt` (worktree-isolated sessions refuse the variable).
    Signing needs the sandbox disabled for the SSH agent.
  - Check with `git log -1 "--format=%G? %h"` (expect `G`; quote the format, as zsh globs `?`). If signing refuses,
    leave the change staged and report it.
  - Never use `--no-verify`, `-c commit.gpgsign=false` or bare `git stash`.
- **Checks after every task:** `npm test`, `npm run lint`, `npm run check` and `npm run format:check` all pass.
- **Known noise.** The editor's TypeScript LSP reports spurious "Cannot find module/name" diagnostics on every file.
  `npm run check` is the source of truth.
- **Worktree.** A fresh worktree needs `npm ci` before any test run.

## Review Focus

The inputs below are implied by the spec but exercised by none of its listed tests. Each is pinned by a test in the
task that owns the code.

1. **A gentle stroke.** A 0.1 m/s single-ball tap, as on a hoop approach, must end before the cap with no
   `impact-head-approaching`: the slow head must not be judged still closing on a ball that outruns it, and the
   look-ahead must not hold it open. Pinned in Task 10 ("ends a gentle tap before the cap").
2. **Any aim direction.** The planner passes any angle: aim π (along −x, where `atan2` returns π), −π/2, or 7 rad.
   The face must point along the aim, and the head must start on its path. Pinned in Task 8 ("points the face along
   any aim").
3. **A head resting almost level on the turf.** For |a_z| tiny the lowest point jumps between the two end rims. A
   head tilted ±1e-9 rad must settle at m·g/k with no spin growing. Pinned in Task 6 ("rests a nearly level head
   without spinning it up…").
4. **`judgeFaults` called directly with `aim` in a single-ball stroke.** A context with `aim` and no
   `lineOfCentres`, outside a croquet stroke, must neither throw nor find 29.1.13. Pinned in Task 9 ("ignores aim
   outside a croquet stroke").
5. **A tracked stroke into an upright.** P2b.2a's crush must still be found when the hands keep pushing: a striker
   touching an upright straight ahead gives 29.1.8, and phase 2 accepts the handover. Pinned in Task 10 ("finds a
   crush when the tracked head drives the ball into an upright").

---
## Pre-flight

Spec §9; roadmap standing decision: pre-flight runs this plan literally in a scratch worktree from the plan PR's head,
measures, and folds the findings back into this plan and the spec as a docs PR. The real run starts after that PR
merges. Until then this section lists what pre-flight measures and where each figure goes.

This is P2b.2b.1's second pre-flight. The first ran the original plan, found the roll catapult and the relaxed AC
check, and fed the two-hand amendment (spec, "Amended 2026-10-05 (pre-flight and prototype)"); its mechanical defects
D1.1–D11.9 are folded into the tasks. There is no coupling search this time: `HAND_COUPLING` is T = 0.08 s, ζ = 0.7
(user decision, spec §3.4), and exit criterion 3 is the effective-mass test.

Figures marked "prototype" were measured while planning on `aeadd4c` (pass 4) with the spec's preset changes (the AC
stop's dip 11 mm, the pass roll's reach 0.30 m); figures marked "first pre-flight" come from its one-hand model.

| Value | Where it lands | Planned | How pre-flight measures it |
|---|---|---|---|
| Tracking bounds: coasting and roll paths before contact, carry from contact to the reach | `tests/engine/impact/hands.test.ts` (Task 4) | Task 4's bounds | Run Task 4's tracking tests and print the figures; keep a 1.5× to 3× margin. First pre-flight, at the 40 ms test coupling: coast 2.8e-7 m and 1.1e-7 rad; roll with its dip 1.9e-6 m and 5.3e-6 rad (D4.2). Task 12's `tracking` adds the canonical paths at `HAND_COUPLING` |
| Check residual (convergence) | `tests/engine/impact/hands.test.ts` (Task 4) | halving dt halves it | The test's ratio. First pre-flight: 0.4999. This pre-flight: 0.5042 / 0.5038 before contact, 0.4997 / 0.4997 from contact, unchanged by the check to rest (an unstruck head is on its path) |
| Check to rest (user decision, 2026-10-06) | `src/engine/impact/track.ts`, `tests/engine/impact/hands.test.ts` (Task 4); the GC stop's test (Task 10) | a slowed head ends the check at rest, never past it | Task 4's slowed-check test (share drift 2.5e-4, last rate 1.13e-8 rad/s) and Task 10's GC stop test (head −3.2e-4 m/s along aim at the impact's end; −1.0928 before the decision) |
| Swing-mode residual after contact outside a check | roadmap outcomes (Task 12) | none (spec §8.1 leaves it unbounded) | Task 12 `tracking`, the "swing" phase |
| Effective mass (exit criterion 3) | the exit-criterion-3 test (Task 10) | closed form within 10 % of the head's mass; strike within Task 10's tolerance of the closed form | Task 12 `mass`. Prototype: drive closed form 1.007 kg, strike 1.0066 kg over every ball. The strike's momentum change must sum every ball: the drive's striker's ball alone gives 0.286 kg, as it passes momentum to the croqueted ball within the interval |
| The AC stop's dip depth (`handDrop`) | `src/engine/swing/profile.ts` (Task 8); spec §5.4 (table and the AC stop paragraph) | about 11 mm (0.011 m) over 20 ms | Task 12 `dip`: the canonical stop's head–turf penetration under `HEAD_DEEP_LIMIT` and its first `head/turf` interval starting after its first `face/blue` interval ends. Prototype: 8.0–11.5 mm meet both; at 11 mm 1.73 mm, the turf from 12.70 ms after a face interval ending at 1.17 ms; 12 mm raises `impact-head-deep`. Keep 11 mm if it meets both; otherwise report the meeting range to the user, who sets the value. This pre-flight, with the check to rest: 8.0–11.5 mm still meet both; 11 mm 1.80 mm, the turf from 12.52 ms; 11.5 mm 1.996 mm; 12 mm 2.19 mm and `impact-head-deep`: 11 mm kept |
| `TRACK_IMPACT_CAP` | `src/engine/impact/integrate.ts` (Task 4) | 0.45 s (user decision, 2026-10-05; see "Decisions made while planning") | Task 12 `canonical` and `presets`: the longest impact after `contactAt`, and how many runs reach the cap. Confirm, or revise with the user. Planning dry run: the canonical drive ends by itself 181.4 ms after contact after 2 hits; every other canonical setup by 83.4 ms; in the sweep the longest natural end is the drive's 324.8 ms, and only 18 AC-stop runs reach the cap, each with its head resting on the turf. Pre-flight, with the check to rest: the drive's longest 314.6 ms (324.8 before the check to rest), and only 12 AC-stop runs reach the cap (speed 1, drive 0 and 0.5, up −23 and −20 mm), each with its head resting on the turf; 0.45 s is 43 % over 314.6 ms. The GC stop's figures (10.0 ms canonical, 226.0 ms in the sweep) came from its touching setup; pre-flight, on its target setup: 10.0 ms and 217.7 ms |
| Canonical setups (exit criterion 4) | the canonical-runs test (Task 10); roadmap outcomes | no entry jump; no ball centre more than 5 mm above R | Task 12 `canonical`. Prototype: no entry jump; highest 4.17 mm (AC stop) and 2.91 mm (pass roll), the rest under 1 mm (the GC stop's 0.81 mm on its touching setup: re-measured by pre-flight). This pre-flight, with the check to rest: AC stop 4.19 mm, GC stop 1.46 mm on its target setup, the rest unchanged |
| Flag counts | roadmap outcomes | none | Task 12 `presets`: runs raising `impact-head-deep`, `impact-cap`, `impact-head-approaching` and `impact-off-face` |
| Coaching ratios | roadmap outcomes | none (observations) | Task 12 `ratios`, the croquet strokes' canonical setups and 2–4 m/s. Prototype (0.15 s cap): drive 3.33 (3.32 at the 0.45 s cap), AC stop 6.47, half roll 2.83, full roll 2.14, pass roll 1.59. This pre-flight, with the check to rest: drive 3.316, AC stop 6.464, half roll 2.825, full roll 2.143, pass roll 1.592 (only the AC stop's moved). The AC stop's ratio exceeding the drive's is asserted (Task 10, user decision 2026-10-06), its value not. The GC stop's 6.60 was a croquet ratio on its touching setup, retired (user decision, 2026-10-06): the GC stop is a single-ball stroke and has no croquet ratio; see the next row |
| The GC stop's distances after the touch | roadmap outcomes; spec §5.4 and §9 | none (observations; P2b.2b.2 calibrates) | Task 12 `gc`: on the canonical GC stop (0.3 m gap) over 2–4 m/s, how far the striker's ball travels after first touching the target, how far the target travels, and their ratio (target over striker); then the gap from 0.05 to 1 m, `stop-gc` and `single-ball` at each gap. Pre-flight measures; nothing was measured on the target setup while planning |
| The late re-hit's crossings | roadmap outcomes; the P2b.2b.3 design | none (a measurement: no engine change, no fault) | Task 12 `rehit`: per preset, whether the canonical setup's follow-through (the real head at the impact's end, moved on by the planned path's displacement and rotation out to `FREE_SPAN`) would cross a ball's phase-2 trajectory or, head and shaft, a hoop upright, a crown or the peg, and how many runs of the preset sweep would; runs whose real head already overlaps a ball at the impact's end apart; `gc` gives the same per gap. Pre-flight: no run overlaps a ball at the impact's end; the half, full and pass rolls' canonical setups cross, the others do not; sweeps cross in 18 (single-ball), 3 (drive), 13 (AC stop), 38 (GC stop), 53 (half roll), 125 (full roll) and 223 (pass roll) of 225 runs; per gap only `single-ball` crosses, at 0.05–0.2 m. Against the uprights, the crowns and the peg (head and shaft): no run meets one or overlaps one at the impact's end; through hoop 1, centred, the shaft meets the crown 143.2 ms after contactAt, and with the face 10 mm off the ball's centre the head's rim meets an upright at 100.3 ms. (A first record swept `headOnPath` itself, which after a strike runs up to 654 mm ahead of the real head, so most of its counts were overlaps at the first sample) |
| Coupling comparison | roadmap outcomes | none | Task 12 `coupling`: T = 0.04 s against 0.08 s. Prototype ratios at 0.04 s: drive 2.35, half roll 2.03, full roll 1.78, pass roll 1.33; the AC stop within 0.1 (the GC stop's 6.51 / 6.60 on its touching setup: re-measured by pre-flight, as distances after the touch) |
| µs/step and the reach filter | roadmap outcomes (for P5); `WAKE_MARGIN`'s comment in `integrate.ts` (Task 4) if its stated headroom no longer holds | none | Task 12 `cost`: tracked canonical impacts against P2b.2a's force-table strokes; the displacement beyond the summed path over the 0.51 s impact (`MAX_LEAD` plus the cap) against `WAKE_MARGIN`. Planning dry run: 102,000 steps, 1.49e-11 m (67× headroom); the sweep's capped runs at most 2.3e-11 m |
| Timing | roadmap outcomes; the user's review | none | Task 12 `timings`: the AC stop and the full roll, each action −50 to +20 ms, and the AC stop's dip ×0–2: lawn or ball first (or missed), dig, slide, launch, and after phase 2 both balls' distances and the coaching ratio (user decision, 2026-10-06: what makes a better stop shot in play) |
| Presets | `src/engine/swing/profile.ts` (Task 8) | spec §5.4 | Whether every canonical setup runs clean and the stops and rolls keep their character. Report to the user, who refines them from outcomes |
| Behaviour tests | Tasks 4, 6, 7 and 10 | as written | The oscillator, relaxed top hand, feed-forward split, rate guide, release by reach, carry slope, head–ball regions, re-entry guard, re-contact, end rule, head–turf, effective mass, canonical runs, mechanisms (follow-through, accelerating bottom hand, stops, GC check, AC stop, punch, mistimed dip), gentle tap and crush tests rest on model behaviour; so do the check-to-rest tests (Task 4's slowed check and check share, Task 10's GC stop head). The GC stop's tests (its canonical run, the stops, the GC check) now run on its target setup; their pre-flight figures are in Task 10's table. See the rule below |

**Rule for a failing behaviour test.** Where one fails, find out why before changing any expectation: trace the
mechanism (the probe's sections and the snapshots), and fix the code if it departs from the spec. A changed
expectation, a changed preset or a changed constant goes to the user if it touches the spec, and is folded into the
spec's amendment note and this plan.

If pre-flight changes a value, it changes:

- the AC stop's dip: `profile.ts` in Task 8's code block, spec §5.4's table and AC stop paragraph, Task 12 Step 2's
  reference and this table;
- `TRACK_IMPACT_CAP`: Task 4's constant and its comment, `WAKE_MARGIN`'s comment (its step count), Task 3's
  `FREE_SPAN` (`MAX_LEAD` plus the cap) and its comment, spec §3.5 (with its 0.51 s figure), and the roadmap
  amendment bullet in Task 12 Step 3;
- a tracking bound or the effective-mass tolerance: the test in its task, with the measured figure in its comment.

Pre-flight also keeps the probe's full output with its evidence and replaces Task 12 Step 2's prototype reference
with its own record: the real run's deterministic lines must equal it. If a behaviour test fails before Task 12
exists, write Task 12's script uncommitted and run the section that measures it.

Measuring scripts stay in the session's temp directory. Evidence kept under the worktree (never committed) is text:
never a `.ts`, `.mts` or `.js` file, which the repo's checks could pick up; a script kept as evidence is saved with a
`.txt` suffix (D5.2).
## File Structure

| Path | Change |
|---|---|
| `scripts/impactDigest.ts` | Optional obstacle-fuzz lines (`OBSTACLE_STROKES`); force-drive wrapping (Task 1) |
| `reference/contact.json` | `handCouplingPeriod`, `handCouplingDampingRatio`, `armMass`, `reachSlack`, `headTurfFriction`, `headDeepLimit` |
| `reference/mallet.json` | `shaftLength` |
| `reference/laws.json` | 29.1.14 (new); 29.1.13's note with C29.18 in full; 29.2.3's note |
| `src/reference/index.ts` | The new values; `FAULT_LAW_KEYS` gains "29.1.14" |
| `src/engine/impact/types.ts` | `ForceDrive`, `Drive`; `StrokeMode`, `Dip`, `SwingArc`, `Coupling`, `Hands`, `TrackDrive`; `impact-head-deep`; `ImpactRun.release`, `.headTurfSlide`, `.headRegions`, `.entryJumps` |
| `src/engine/impact/track.ts` | New: the path (two arcs, modes, reach, carry descent, free pendulum), the swung body, `effectiveMass`, `inCheck` (Task 3); `HAND_COUPLING`, `GripState`, `handLoad` (Task 4) |
| `src/engine/impact/contacts.ts` | `HEAD_TURF_KEY`, `headBottom`, `headTurfContact` (Task 6); `HeadRegion`, `HEAD_REGIONS`, `headBallContact` (Task 7) |
| `src/engine/impact/integrate.ts` | The two hands and the swung-body step, the track end rule, `TRACK_IMPACT_CAP`, `LOOK_AHEAD`, probe fields (Task 4); head–turf pair, `HEAD_DEEP_LIMIT` (Task 6); whole-head contact, regions, re-entry guard, `ENTRY_SLACK` (Task 7) |
| `src/engine/impact/simulateImpact.ts` | Track validation and preparation (Task 5); the head–turf law, `HEAD_TURF_FRICTION`, the turf under the head (Task 6) |
| `src/engine/types.ts` | `Lawn.surfaceAt` comment (Task 6) |
| `src/engine/swing/types.ts` | New: `StrokeType`, `CROQUET_STROKES`, `STROKE_TYPES`, `SwingStance`, `SwingDrive`, `SwingProfile`, `StrokeTiming`, `ShotSetup` |
| `src/engine/swing/profile.ts` | New: `defaultProfile`, `DEFAULT_DRIVE`, `ON_TIME` |
| `src/engine/swing/buildContact.ts` | New: `START_GAP`, `MAX_LEAD`, `buildContact`, `SwingApproach`, `swingApproach` |
| `src/engine/world.ts` | Header comment only (the engine now reads references in several places) |
| `src/engine/faults.ts` | `StrokeContext.aim`, `.lineOfCentres`; 29.1.13 "plays away from"; 29.1.14; header on whole-head contact |
| `src/engine/shot.ts` | New: `ShotOutcome`, `strokeContext`, `simulateShot` |
| `src/engine/index.ts` | Exports (spec §6.5) |
| `src/engine/simulate.ts` | `ENGINE_VERSION` 0.6.0 |
| `tests/engine/support/impact.ts` | Force-drive wrapping; `TEST_COUPLING`, `TEST_HANDS`, `NO_DIP`, `trackDrive`, `levelArc` (Task 3); `onArc`, `mirrorContact` mirrors arcs (Task 5); `isolated` gains `headTurf` (Task 6) |
| `tests/engine/support/shot.ts` | New: `testProfile`, `CANONICAL_STRIKER`, `canonicalSetup`, `CANONICAL_CLEARANCE`, `GC_STOP_GAP` |
| `tests/engine/impact/{analytic,timeline,integrate,simulateImpact}.test.ts` | Force-drive wrapping; track validation cases |
| `tests/engine/impact/track.test.ts` | New: the path, the swung body, effective mass |
| `tests/engine/impact/hands.test.ts` | New: the two hands, tracking, release, end rule, re-contact |
| `tests/engine/impact/headTurf.test.ts` | New: the head–turf pair |
| `tests/engine/impact/headBall.test.ts` | New: whole-head contact and the re-entry guard |
| `tests/engine/impact/contacts.test.ts` | Head bottom, head–turf contact, head–ball regions |
| `tests/engine/swing/buildContact.test.ts` | New: the swing model |
| `tests/engine/faults.test.ts` | 29.1.13 "plays away from", 29.1.14 |
| `tests/engine/shot.test.ts` | New: `strokeContext`, `simulateShot`, exit criteria 3 and 4, mechanisms |
| `tests/engine/index.test.ts`, `tests/reference/reference.test.ts` | Exports; new reference values |
| `scripts/swingProbe.ts` | New: pre-flight measurements (spec §9) |
| `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md` | Spec §11's changes; P2b.2b.1 met; outcomes carried forward |

Task order keeps every commit green and force tables bit-identical:

- Task 1 wraps the force table in `{ kind: "force", samples }`; nothing else moves.
- Task 2 adds data only.
- Task 3 adds the path and the swung body as pure functions.
- Task 4 adds the two hands to the integrator, through isolated set-ups only.
- Task 5 widens `ContactState.drive` to the union and validates and prepares tracked contacts.
- Task 6 adds the head–turf pair.
- Task 7 gives tracked drives the whole-head contact and the re-entry guard.
- Task 8 adds the swing model.
- Task 9 adds the new judgements.
- Task 10 adds `simulateShot`, the exit-criterion tests and the mechanisms.
- Task 11 adds the exports and the version.
- Task 12 adds the probe and records the outcomes.

---
### Task 1: The force table becomes `{ kind: "force", samples }`

Spec §3.1 and exit criterion 2. The drive becomes a tagged object so that Task 5 can add the `track` member. This task
is mechanical: every number stays bit-identical. It first records the baseline every later bit-identity check compares
against, with the obstacle fuzz added to the digest.

**Files:**
- Modify: `scripts/impactDigest.ts`, `src/engine/impact/types.ts`, `src/engine/impact/integrate.ts`,
  `src/engine/impact/simulateImpact.ts`, `tests/engine/support/impact.ts`, `tests/engine/impact/analytic.test.ts`,
  `tests/engine/impact/timeline.test.ts`, `tests/engine/impact/integrate.test.ts`,
  `tests/engine/impact/simulateImpact.test.ts`

**Interfaces:**
- Produces:
  - `interface ForceDrive { readonly kind: "force"; readonly samples: readonly DriveSample[] }`;
  - `type Drive = ForceDrive` (Task 5 widens it to `ForceDrive | TrackDrive`);
  - `ContactState.drive: Drive` and `ImpactSetup.drive: ForceDrive` (Task 4 widens it to `ForceDrive | PreparedTrack`);
  - `driveAt(samples, t)`, unchanged;
  - `scripts/impactDigest.ts` reads `OBSTACLE_STROKES` (default 0) and prints `obstacle <n>` and
    `timeline obstacle <n>` lines for that many obstacle-fuzz strokes.

- [ ] **Step 1: Add the obstacle fuzz to the digest, then save the baseline**

In `scripts/impactDigest.ts`, replace the support import with:

```ts
import {
    FUZZ_SEED,
    OBSTACLE_FUZZ_SEED,
    SCENARIOS,
    randomObstacleStroke,
    randomStroke,
    recorder,
} from "../tests/engine/support/impact";
```

Below `const STROKES = Number(process.env.STROKES ?? "200");` add:

```ts
const OBSTACLE_STROKES = Number(process.env.OBSTACLE_STROKES ?? "0");
```

After the fuzz loop (the end of the file) add:

```ts
const obstacleRandom = rng(OBSTACLE_FUZZ_SEED);
for (let n = 0; n < OBSTACLE_STROKES; n++) {
    const { contact, balls, world } = randomObstacleStroke(obstacleRandom, TEST_WORLD);
    const result = simulateImpact(contact, balls, world);
    console.log(`obstacle ${n} ${exact(p2b1(result))}`);
    console.log(`timeline obstacle ${n} ${exact(later(result))}`);
}
```

This draws the strokes exactly as `tests/engine/impact/fuzz.test.ts` does (the same seed, on `testWorld()`). In the
header comment, replace the run line with:

```ts
 * Run with `npx --yes tsx scripts/impactDigest.ts > before.txt`; environment: STROKES (fuzz strokes, default 200),
 * OBSTACLE_STROKES (obstacle-fuzz strokes, as fuzz.test.ts draws them; default 0).
```

The default output is unchanged, so this baseline is `main`'s. To confirm it (optional): copy `main`'s script with
`git show HEAD:scripts/impactDigest.ts > scripts/impactDigest.main.ts` (beside the original, so that its imports
resolve; not `git show --output=`), run each script with no environment, `npx --yes tsx scripts/impactDigest.main.ts >
"<temp>/digest-main-default.txt"` and `npx --yes tsx scripts/impactDigest.ts > "<temp>/digest-new-default.txt"`,
`cmp` the two (no output), and delete the copy. From the worktree root (`npm ci` first in a fresh worktree):

Run: `env OBSTACLE_STROKES=2000 npx --yes tsx scripts/impactDigest.ts > "<temp>/digest-base.txt"`
Expected: the file's first line starts `scenario centre test-world {"balls":`. Record its line count (`wc -l`) for the
commit message.

Run: `npx --yes tsx scripts/shotMix.ts`
Expected: the `work units per shot` row reads p99 143084, p99.9 362050, max 408030 (printed to three decimals). Record
the line.

- [ ] **Step 2: Wrap the force table in the types**

In `src/engine/impact/types.ts`, replace the `ContactState` block (its comment and interface) with:

```ts
/**
 * A force-table drive: the total force the hands apply to the head at the socket, excluding gravity, so it carries the
 * head's weight. Samples are in strictly increasing t, the first at t = 0, the last ending the drive window; the force
 * is zero after it.
 */
export interface ForceDrive {
    readonly kind: "force";
    readonly samples: readonly DriveSample[];
}

/** What the hands do to the head during the impact (P2b.2b.1 design §3.1). */
export type Drive = ForceDrive;

/** What the swing delivers to the impact: the head and its face, its state at t = 0, and the drive. */
export interface ContactState extends HeadState {
    readonly head: MalletHead;
    readonly face: FaceMaterial;
    readonly drive: Drive;
}
```

- [ ] **Step 3: Read the samples in the integrator and the validation**

In `src/engine/impact/integrate.ts`, change the types import to:

```ts
import type { ContactInterval, DriveSample, ForceDrive, HeadState, ImpactEvent, ImpactRun, MalletHead } from "./types";
```

In `ImpactSetup`, replace `readonly drive: readonly DriveSample[];` with `readonly drive: ForceDrive;`. In `integrate`,
replace the `driveEnd` line and the `drive` line in the loop with:

```ts
    const driveEnd = (setup.drive.samples[setup.drive.samples.length - 1] as DriveSample).t;
```

```ts
        const drive = driveAt(setup.drive.samples, t);
```

In `src/engine/impact/simulateImpact.ts`, replace the two drive checks in `validateImpact` (the `if` on
`contact.drive.length` and the `forEach` after it) with:

```ts
    const { samples } = contact.drive;
    if (samples.length === 0 || (samples[0] as DriveSample).t !== 0) {
        fail("drive must start at t = 0");
    }
    samples.forEach((s, i) => {
        finite(s.force, `drive[${i}].force`);
        if (!Number.isFinite(s.t) || (i > 0 && !(s.t > (samples[i - 1] as DriveSample).t))) {
            fail("drive times must increase strictly");
        }
    });
```

`prepareImpact`'s `drive: contact.drive` is unchanged: a `ForceDrive` passes through to `ImpactSetup.drive`.

- [ ] **Step 4: Wrap the test helpers and the hand-built drives**

In `tests/engine/support/impact.ts`:
- in `strike`, the drive line becomes
  `drive: { kind: "force", samples: o.drive ? o.drive(travel) : coast(3e-3, head) },`;
- in `isolated`, the default becomes `drive: { kind: "force", samples: [{ t: 0, force: ZERO }] },`;
- in `mirrorContact`, the drive line becomes
  `drive: { kind: "force", samples: c.drive.samples.map((s) => ({ t: s.t, force: mirrorVec(s.force) })) },`.

`drive()`, `coast()` and `StrikeOptions.drive` keep returning sample arrays, so `scripts/impactProbe.ts` and the
scenarios are unchanged.

In `tests/engine/impact/analytic.test.ts`, the two `isolated({ … drive: [ … ] … })` calls (in the `slide` helper, line
135, and in "a socket force on a free head", line 179) become `drive: { kind: "force", samples: [ … ] },` with the same
two samples. In `tests/engine/impact/timeline.test.ts`, the double-tap case's `drive: [ … ]` (line 82) becomes
`drive: { kind: "force", samples: [ … ] },` likewise. These are contextually typed by `Partial<ImpactSetup>`, so the
literal `"force"` needs no `as const`.

In `tests/engine/impact/integrate.test.ts`, "waits for the drive window to close" (line 69) builds the drive in a
variable, which widens `"force"` to `string` without a context; replace it with:

```ts
        const drive = {
            kind: "force" as const,
            samples: [
                { t: 0, force: ZERO },
                { t: 20e-3, force: ZERO },
            ],
        };
```

In `tests/engine/impact/simulateImpact.test.ts`, the three drive rows of `cases` become (the table's element type gives
the literal its context):

```ts
        [
            "an empty drive",
            { ...ok, drive: { kind: "force", samples: [] } },
            { blue: BLUE },
            WORLD,
            /drive must start at t = 0/,
        ],
        [
            "a drive not starting at 0",
            { ...ok, drive: { kind: "force", samples: [{ t: 1e-4, force: vec3(0, 0, 0) }] } },
            { blue: BLUE },
            WORLD,
            /drive must start at t = 0/,
        ],
        [
            "a drive not increasing",
            {
                ...ok,
                drive: { kind: "force", samples: [...drive(vec3(0, 0, 0), 1e-3), { t: 1e-3, force: vec3(0, 0, 0) }] },
            },
            { blue: BLUE },
            WORLD,
            /drive times must increase strictly/,
        ],
```

- [ ] **Step 5: Verify**

Run: `npm test`
Expected: all pass (534 passed, 2 skipped, as on `main`).

Run: `npm run check`
Expected: no errors.

Run: `env OBSTACLE_STROKES=2000 npx --yes tsx scripts/impactDigest.ts > "<temp>/digest-1.txt"`
Run: `cmp "<temp>/digest-base.txt" "<temp>/digest-1.txt"`
Expected: no output (identical).

- [ ] **Step 6: Format, check, commit**

Run: `npx prettier --write scripts/impactDigest.ts src/engine/impact/types.ts src/engine/impact/integrate.ts`
Run: `npx prettier --write src/engine/impact/simulateImpact.ts tests/engine/support/impact.ts`
Run: `npx prettier --write tests/engine/impact/analytic.test.ts tests/engine/impact/timeline.test.ts`
Run: `npx prettier --write tests/engine/impact/integrate.test.ts tests/engine/impact/simulateImpact.test.ts`

Run: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`
Expected: all pass.

Write the message to `$CLAUDE_TEMP_DIR/msg.txt` (with the Write tool, at the directory's literal path), filling in
the line count from Step 1:

```text
Tag the force-table drive, bit-identical

ContactState.drive becomes { kind: "force", samples }, so that a tracked
drive can join it as a second member. Every number is unchanged: the
impact digest, with 2,000 obstacle-fuzz strokes now printed when
OBSTACLE_STROKES is set (<line count> lines), is byte-identical to main's.
```

```bash
git add scripts/impactDigest.ts src/engine/impact/types.ts src/engine/impact/integrate.ts
git add src/engine/impact/simulateImpact.ts tests/engine/support/impact.ts tests/engine/impact/analytic.test.ts
git add tests/engine/impact/timeline.test.ts tests/engine/impact/integrate.test.ts
git add tests/engine/impact/simulateImpact.test.ts
git commit -F <literal value of $CLAUDE_TEMP_DIR>/msg.txt
git log -1 "--format=%G? %h"
```

Run the commit with the sandbox disabled (signing needs the SSH agent) and with the temp directory's literal path:
worktree sessions refuse the variable in `git commit -F`. Expected: `G` and the new commit's hash.

### Task 2: Reference data for the swing body, the coupling, the head–turf pair and 29.1.14

Spec §7 and §6.4. Before committing, open each URL and confirm each quoted sentence is still there. The Laws PDF is in
the spec header; for the mallet pages, use WebFetch (the pages' plain HTML can lack text that WebFetch renders). The
USCA page's TLS certificate is self-signed: fetch it with `curl -sSLk -o <file> <url>`. If a quotation cannot be
re-found, keep the entry, add "(quotation not re-found on <date>)" to its note and report it. The first pre-flight
(2026-10-05) re-found the Laws, USCA, Croquet Network and Hall quotations verbatim. Apostrophes and quotation marks
follow the source (the Laws PDF uses ’ and ‘ ’).

The coupling's period is a user decision (spec §3.4), not a search result: 0.08 s at damping ratio 0.7. `armMass` and
`reachSlack` are the prototype's calibration (`proto-two-hands` aeadd4c), with bounds the prototype tried. No
`topHandHeight` is added: the stance's `top` is the arc radius (spec §5.2).

**Files:**
- Modify: `reference/contact.json`, `reference/mallet.json`, `reference/laws.json`, `src/reference/index.ts`
- Test: `tests/reference/reference.test.ts`

**Interfaces:**
- Produces:
  - `contactReference.handCouplingPeriod`, `.handCouplingDampingRatio` (read by Task 4's `HAND_COUPLING`);
  - `contactReference.armMass`, `.reachSlack` (read by Task 8's `defaultProfile.body`);
  - `contactReference.headTurfFriction`, `.headDeepLimit` (read by Task 6's `HEAD_TURF_FRICTION` and
    `HEAD_DEEP_LIMIT`);
  - `malletReference.shaftLength` (read by Task 8's `defaultProfile.mallet`);
  - each a `ReferenceValue` with bounds;
  - `FAULT_LAW_KEYS` with `"29.1.14"` after `"29.1.13"`, and `lawsReference.faults["29.1.14"]` (Task 9).

- [ ] **Step 1: Write the failing test**

Append to `tests/reference/reference.test.ts`:

```ts
describe("swing, coupling and head–turf reference data", () => {
    it("loads the provisional hand coupling", () => {
        expect(contactReference.handCouplingPeriod.value).toBe(0.08);
        expect(contactReference.handCouplingDampingRatio.value).toBe(0.7);
    });

    it("loads the default body's arm mass and reach slack", () => {
        expect(contactReference.armMass.value).toBe(0.8);
        expect(contactReference.armMass.unit).toBe("kg");
        expect(contactReference.reachSlack.value).toBe(0.03);
        expect(contactReference.reachSlack.unit).toBe("m");
    });

    it("loads the head–turf friction and the deep-head limit", () => {
        expect(contactReference.headTurfFriction.value).toBe(0.5);
        expect(contactReference.headTurfFriction.bounds).toEqual([0.3, 0.7]);
        expect(contactReference.headDeepLimit.value).toBe(0.002);
    });

    it("loads the default shaft, 36 in", () => {
        expect(malletReference.shaftLength.value).toBeCloseTo(36 * 0.0254, 12);
    });

    it("quotes 29.1.14 after 29.1.13", () => {
        const keys: readonly string[] = FAULT_LAW_KEYS;
        expect(keys.indexOf("29.1.14")).toBe(keys.indexOf("29.1.13") + 1);
        expect(lawsReference.faults["29.1.14"].quote).toContain("damages the court with the mallet");
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/reference/reference.test.ts`
Expected: FAIL, 5 tests. The first four with `Cannot read properties of undefined (reading 'value')`; the last with
`expected -1 to be 9` (29.1.13 is index 8). `npm run check` reports the missing properties and the `"29.1.14"` index.

- [ ] **Step 3: Add the values to `reference/contact.json`**

Add after `tangentialStiffnessRatio` (mind the comma after its closing brace). The JSON blocks in this step and Steps
4 and 5 are shown unindented; Prettier indents them in Step 8 (D2.4).

```json
"handCouplingPeriod": {
    "value": 0.08,
    "unit": "s",
    "bounds": [0.01, 0.2],
    "source": "P2b.2b.1 design §3.4 (docs/superpowers/specs/2026-10-04-p2b2b1-swing-shot-design.md): user decision, 2026-10-05",
    "provenance": "derived",
    "note": "Provisional; P2b.2b.2 fits it, with armMass, reachSlack and the grips, to the coaching ratios. The natural period of a firm grip: each hand's gain is k = g·M·(2π/T)² and c = 2ζ·sqrt(k·M), its twist gains alike with the head's inertia about the shaft (design §3.3). It was first to be the shortest period, at damping ratio 0.7, for which the hands' impulse beyond the feed-forward in a 3 m/s centre strike on a single ball stays within 5 % of the ball's momentum change; the one-hand pre-flight search gave 0.077 s (4.98 %), and the user kept 0.08 s (4.80 %). Under the two-hand model that criterion no longer constrains it: from contact the hands track velocity only and the top hand is a pivot on the shaft's line, so the impulse is 0.40 % at 0.08 s and 2.3 % at 0.01 s (two-hand prototype). What keeps the strike the head's is the effective mass the face presents (design §3.4, exit criterion 3). Bounds: the one-hand pre-flight sweep's range (10-200 ms)."
},
"handCouplingDampingRatio": {
    "value": 0.7,
    "unit": "1",
    "bounds": [0.2, 1],
    "source": "P2b.2b.1 design §3.4 (docs/superpowers/specs/2026-10-04-p2b2b1-swing-shot-design.md): user decision, 2026-10-05",
    "provenance": "derived",
    "note": "Provisional; P2b.2b.2 fits it. The damping ratio of a firm grip, for each hand's translation and twist alike (design §3.3). Bounds: the one-hand pre-flight sweep's range (0.2-1)."
},
"armMass": {
    "value": 0.8,
    "unit": "kg",
    "bounds": [0, 1.5],
    "source": "P2b.2b.1 design §3.3 and §7 (docs/superpowers/specs/2026-10-04-p2b2b1-swing-shot-design.md): the two-hand prototype's calibration (branch proto-two-hands, commit aeadd4c)",
    "provenance": "derived",
    "note": "Provisional; P2b.2b.2 fits it to the coaching ratios. The effective mass of the player's arms and hands, carried rigidly at the top grip, so that it and the head swing as one body (design §3.3); it adds inertia, not weight, since the arm's weight is the player's. No measurement of an effective arm mass in a croquet stroke was found. With it the swung body presents 1.007 kg at the drive's face centre along aim (design §3.4). Bounds: the range the prototype tried, from 0 (the head alone) to 1.5 kg."
},
"reachSlack": {
    "value": 0.03,
    "unit": "m",
    "bounds": [0.01, 0.03],
    "source": "P2b.2b.1 design §3.3 and §7 (docs/superpowers/specs/2026-10-04-p2b2b1-swing-shot-design.md): the two-hand prototype's calibration (branch proto-two-hands, commit aeadd4c)",
    "provenance": "derived",
    "note": "Provisional; P2b.2b.2 fits it. The user's release by reach: the bottom hand, on an arm, opens once the shaft's turn since contact carries its grip further than this, (top - bottom)·Δθ > reachSlack (design §3.3). No measurement was found. In the prototype the release opened only in the drive's follow-through, about 110 ms after contact. Bounds: the range the prototype tried (0.01-0.03 m)."
},
"headTurfFriction": {
    "value": 0.5,
    "unit": "1",
    "bounds": [0.3, 0.7],
    "source": "Stan Hall, 'When a Mallet Strikes a Ball', section 'Coefficients of Friction' (1994; Oxford Croquet, updated 28 April 2026), https://oxfordcroquet.org/tech/hall/",
    "provenance": "analogue",
    "note": "No measured friction of a mallet head on turf was found. Analogue: Hall slid croquet balls embedded in polystyrene along a croquet court: \"For a fairly fast court (normal, cut to 6mm) the coefficient was 0.48. For a fairly heavy court, the coefficient was 0.53.\" (friction.json ballTurfSliding). A wooden head's base or rim sliding on the same turf is taken alike: 0.5, between the two. Bounds: an allowance for wood against plastic and for a rim against a flat (P2b.2b.1 design §7). P2b.2b.2 sources it, and decides whether a heel ploughing into the turf needs a drag term."
},
"headDeepLimit": {
    "value": 0.002,
    "unit": "m",
    "bounds": [0.002, 0.0072],
    "source": "P2b.2b.1 design §4.2 (docs/superpowers/specs/2026-10-04-p2b2b1-swing-shot-design.md); upper bound: Don Gugan, 'The Physics of Croquet Strokes: Analysis of the CA high-speed DVD', Table 4(b) (2009; Oxford Croquet), https://oxfordcroquet.org/tech/gugan4/",
    "provenance": "derived",
    "note": "A model limit, not a property of turf. The impact's turf is a plane with a linear spring, fitted to a ball pressed into it (ballTurfStiffness); a mallet head's edge or rim presses a footprint that law was not fitted to, so a head driven more than this below the turf plane raises impact-head-deep. Provisional. Upper bound: the deepest ball penetration Gugan measured, 7.2 mm (Table 4(b), roll A4R)."
}
```

- [ ] **Step 4: Add the shaft to `reference/mallet.json`**

Add after `headDiameter` (mind the comma after its closing brace):

```json
"shaftLength": {
    "value": 0.9144,
    "unit": "m",
    "bounds": [0.8128, 0.9144],
    "source": "USCA 9-wicket, 'Updated Advice & Information on Choosing a Mallet' (2014), http://www.9wicketcroquet.com/howtoplay/153/updated-advice-information-on-choosing-a-mallet; Croquet Network, 'Buying Your First Croquet Mallet' (2023), https://www.croquetnetwork.com/croquet-network-home/2023/5/28/buying-your-first-croquet-mallet",
    "provenance": "direct",
    "note": "USCA: \"A “standard mallet” traditionally would weigh 3 pounds total (1.362Kg), have a 36” wood shaft and a 9-11” head length.\" and \"In general , people under 5 feet 4 inches use 32 inch shafts; up to 5 feet 10’ a 34 inch shaft and above 5’ 11” a 36 inch shaft.\" Croquet Network: \"as a general rule for a first mallet, I think an 11-inch head and a 36-inch shaft is a good starting point.\" SI: 36 in x 0.0254 = 0.9144 m. Bounds 32-36 in, USCA: \"Lengths below 32 inches and above 36 inches are rare.\" The default profile's shaft (P2b.2b.1 design §5.4): a stance's top hand, measured from the socket along it, may not lie beyond it (design §5.3)."
}
```

- [ ] **Step 5: Quote 29.1.14 and complete 29.1.13 and 29.2.3 in `reference/laws.json`**

Add after `29.1.13`:

```json
"29.1.14": {
    "quote": "a fault is committed during the striking period if the striker: [...] in any of the strokes specified in Law 29.2.3, damages the court with the mallet to the extent that a subsequent stroke played over the damaged area could be significantly affected.",
    "source": "World Croquet Federation, The Laws of Association Croquet, 7th Edition (February 2021), with Official Rulings and Commentary (current as at April 2021), Law 29.1.14 and commentary C29.19; https://worldcroquet.org/wp-content/uploads/2021/04/Laws-Rulings-Commentary-combined-published-master-.pdf",
    "provenance": "direct",
    "note": "Judged as a possible fault (P2b.2b.1 design §6.4): the Law sets no objective test, C29.19.5: \"The law does not specify an objective test as to whether a subsequent stroke played over the damaged area could be ‘significantly affected’, but it is explicit that it is the potential effect on subsequent strokes, rather than cosmetic appearance, that must be considered. The effect on gentle, as well as hard strokes, must be taken into account. The potential effect must be significant: the guidance offered is that damage significantly affects a stroke if a ball passing over the (unrepaired) damage, at a speed such that it will stop about a mallet’s (shaft) length away, would come to rest more than a ball’s width from where it would have done if the damage was not there. This deviation could be in distance as well as direction. This test may have to be relaxed on an uneven court.\" C29.19.4: \"The damage must be caused by the mallet, not just the ball.\" The impact's turf is a plane that keeps no damage (divots are deferred), so the finding carries the head's deepest penetration, its peak turf force and its slide along the turf, and no damage threshold is invented. Applies only to the strokes of Law 29.2.3 (StrokeContext.hampered, jumpAttempt, group)."
},
```

Replace 29.1.13's `note` with:

```json
"note": "Both clauses are judged. \"Fails to move or shake\": the croqueted pair never penetrates beyond CONTACT_TOLERANCE (evidence peakPenetration). \"Plays away from\" (P2b.2b.1 design §6.4): the swing direction makes an angle of more than 90° with the horizontal line from the striker's centre to the croqueted ball's (evidence angle). C29.18 in full, C29.18.1: \"A fault is committed if the striker plays away from the croqueted ball even though it moves or shakes, as it may do if it was ‘propped up’ by the striker’s ball on the edge of a depression.\" The commentary sets no angular test; more than 90° is the engine's reading of \"away from\" (checked against C29.18 on 2026-10-04; kept by the user's decision on 2026-10-05, with no graded or stricter threshold)."
```

Replace 29.2.3's `note` with:

```json
"note": "StrokeContext.hampered, .jumpAttempt and .group, supplied by the caller (simulateShot derives group); they gate 29.1.5 and 29.1.14."
```

- [ ] **Step 6: Expose them in `src/reference/index.ts`**

In `FAULT_LAW_KEYS`, add `"29.1.14",` after `"29.1.13",`. Replace the `contactReference` block (its comment and
object) with:

```ts
/**
 * Impact-phase contact data: turf stiffness, contact durations, the tangential ratio, the hand coupling, the default
 * body's arm mass and reach slack, and the head–turf pair.
 */
export const contactReference = {
    ballTurfStiffness: readValue(contactJson, "ballTurfStiffness", "contact"),
    ballBallContactTime: readValue(contactJson, "ballBallContactTime", "contact"),
    ballObstacleContactTime: readValue(contactJson, "ballObstacleContactTime", "contact"),
    faceBallContactTime: readValue(contactJson, "faceBallContactTime", "contact"),
    tangentialStiffnessRatio: readValue(contactJson, "tangentialStiffnessRatio", "contact"),
    handCouplingPeriod: readValue(contactJson, "handCouplingPeriod", "contact"),
    handCouplingDampingRatio: readValue(contactJson, "handCouplingDampingRatio", "contact"),
    armMass: readValue(contactJson, "armMass", "contact"),
    reachSlack: readValue(contactJson, "reachSlack", "contact"),
    headTurfFriction: readValue(contactJson, "headTurfFriction", "contact"),
    headDeepLimit: readValue(contactJson, "headDeepLimit", "contact"),
} as const;
```

Replace the `malletReference` block with:

```ts
/** One mallet face, one typical round head and the default shaft (P2b.1, P2b.2b.1). */
export const malletReference = {
    faceRestitution: readValue(malletJson, "faceRestitution", "mallet"),
    faceFriction: readValue(malletJson, "faceFriction", "mallet"),
    headMass: readValue(malletJson, "headMass", "mallet"),
    headLength: readValue(malletJson, "headLength", "mallet"),
    headDiameter: readValue(malletJson, "headDiameter", "mallet"),
    shaftLength: readValue(malletJson, "shaftLength", "mallet"),
} as const;
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/reference/reference.test.ts`
Expected: PASS. The existing "gives every impact value bounds, so the probe can sweep them" also covers the seven new
values, and `readValue` checks each lies within its bounds.

Run: `npm test`
Expected: all pass. `faults.test.ts`'s quote test over `JUDGED_LAWS` is unaffected; Task 9 adds 29.1.14 to
`JUDGED_LAWS`.

- [ ] **Step 8: Format, check, commit**

Run: `npx prettier --write reference/contact.json reference/mallet.json reference/laws.json`
Run: `npx prettier --write src/reference/index.ts tests/reference/reference.test.ts`

Run: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`
Expected: all pass. Then check that no JSON string was split: Prettier leaves strings on one line.

Write the message to `$CLAUDE_TEMP_DIR/msg.txt` (with the Write tool, at the directory's literal path):

```text
Add the swing, coupling, head–turf and 29.1.14 reference data

The hand coupling (0.08 s, damping ratio 0.7, a user decision), the
default body's arm mass and reach slack (the two-hand prototype's
calibration), the head–turf friction and deep-head limit, the default
36 in shaft, and Law 29.1.14 with C29.18 quoted in full under 29.1.13.
Every value carries its source and bounds.
```

```bash
git add reference/contact.json reference/mallet.json reference/laws.json src/reference/index.ts
git add tests/reference/reference.test.ts
git commit -F <literal value of $CLAUDE_TEMP_DIR>/msg.txt
git log -1 "--format=%G? %h"
```

Run the commit with the sandbox disabled (signing needs the SSH agent) and with the temp directory's literal path.
Expected: `G` and the new commit's hash.
### Task 3: The swing path: two arcs, modes, reach, free pendulum, swung body

Spec §3.1, §3.2, §3.3 ("The swung body", "Gains") and §3.4. These are pure functions: the two arcs (the pendulum, and
the hands' path through space), each before, during and after its window; what follows the pendulum's window in each
mode (swing: a free pendulum tabulated by semi-implicit Euler; carry: the slope held); the hands' reach and, in carry
mode, the descent at its end; the dip; the head's orientation, rigid on the shaft; the swung body and its effective
mass. Nothing in the engine reads them yet; the test support uses `swingOrientation` to place heads.

**Files:**
- Modify: `src/engine/impact/types.ts`, `tests/engine/support/impact.ts`
- Create: `src/engine/impact/track.ts`, `tests/engine/impact/track.test.ts`

**Interfaces:**
- Consumes: Task 1's `types.ts` layout (`ForceDrive` after `HeadState`); `headLowestPoint` (`impact/contacts.ts`, on
  `main`).
- Produces (types.ts), exactly as spec §3.1:
  - `type StrokeMode = "swing" | "carry"`;
  - `interface Dip { start; duration; depth: number }`;
  - `interface SwingArc` with `pivot`, `pivotVelocity`, `pivotAcceleration`, `handStart`, `handWindow`, `aim`,
    `radius`, `theta0`, `omega0`, `alpha`, `arcStart`, `window`, `dip`, `contactAt`, `mode`, `handReach`,
    `groundDepth`;
  - `interface Coupling { period; dampingRatio; relaxAt: number }`;
  - `interface Hands { bottom; gripTension; bottomGrip; armMass; reachSlack; guideEffort: number }`;
  - `interface TrackDrive { kind: "track"; arc: SwingArc; coupling: Coupling; hands: Hands }`.
- Produces (track.ts):
  - `FREE_STEP = 5e-6`, `FREE_SPAN = 0.55`;
  - `pitchAxis(aim: Vec3): Vec3` (aim × ẑ); `aimRotation(aim: Vec3): Quaternion`;
    `swingOrientation(aim: Vec3, theta: number): Quaternion` (rot(n, θ) ⊗ q_aim);
  - `interface SwungBody { mass: number; inertia: Vec3; offset: number }`;
    `swungBody(head: MalletHead, hands: Hands, radius: number): SwungBody`;
  - `effectiveMass(body: SwungBody, head: MalletHead, orientation: Quaternion, direction: Vec3): number`;
  - `interface HandGains { stiffness; damping; twistStiffness; twistDamping: number }`;
  - `interface Reach { t1: number; p1: Vec3; v1; decel; tStop; descent: number }`;
  - `interface FreePendulum { tw: number; theta, omega: readonly number[]; weight; inertial; inertia: number }`;
  - `interface PreparedTrack` with `kind: "track"`, `arc`, `coupling`, `hands`, `axis`, `base`, `thetaArc`,
    `thetaEnd`, `omegaEnd`, `pivotHand`, `pivotEnd`, `pivotVelocityEnd`, `dipAccel`, `reach: Reach | null`,
    `free: FreePendulum | null`, `body: SwungBody`, `headWeight`, `firm`, `top`, `bottom: HandGains` (immutable);
  - `prepareTrack(drive: TrackDrive, head: MalletHead, gravity: number): PreparedTrack`;
  - `interface PathPoint` with `socket`, `socketVelocity`, `socketAcceleration`, `orientation`, `angularVelocity`,
    `angularAcceleration`, `dipAcceleration: Vec3` and `pendulumAcceleration: number`;
  - `pathAt(track: PreparedTrack, t: number): PathPoint`;
  - `headOnPath(track: PreparedTrack, head: MalletHead, t: number): HeadState`;
  - `inCheck(track: PreparedTrack, t: number): boolean`.
- Produces (support/impact.ts): `TEST_COUPLING`, `TEST_HANDS`, `NO_DIP`, `trackDrive(arc, coupling?, hands?)` and
  `levelArc(centre, o?: Partial<SwingArc>)`.

Decisions made while drafting (spec silent or the contract's reading):
- **The reach.** The ease acts on the along-aim component only: after t₁ the pivot is the plan with its along-aim
  part replaced by the eased one, so any other in-plane component (vertical) runs on and V stays continuous. With
  `handReach` 0 the reach is `{ t1: contactAt, tStop: contactAt, v1: 0 }`: the along-aim motion rests from contactAt,
  its velocity dropping to 0 there, as spec §3.2 says. A reach with no span (`handReach` 0, or v₁ 0) has no descent:
  there is no interval to lower the pivot over.
- **Bisection** finds t₁ (80 halvings of the 0.5 s search, `REACH_BISECTIONS`), assuming the plan travels
  monotonically along aim, as the swing model's paths do.
- **The free pendulum's table** steps from the window's end (θ_e, ω_e) with the pivot's acceleration including the
  reach and the dip; the path interpolates θ and ω and evaluates θ̈ at the interpolated θ; beyond the table θ and ω
  clamp to its last sample, and the α still evaluated there (at the held θ, with the pivot's acceleration) is not
  meaningful.
- **ρ** in ℓ_h, δ and the grips is the socket's height above the head's centre (`head.socket.z`), which is the head's
  radius for every head in this repo.
- **`inCheck`** is α < 0 and arcStart ≤ t ≤ arcStart + window (the contract's reading; spec §3.3 "the pendulum's window
  with α < 0").

- [ ] **Step 1: Add the types**

In `src/engine/impact/types.ts`, insert after `DriveSample`'s closing brace (before the `HeadState` comment):

```ts
/**
 * How the hands carry the mallet after contact (P2b.2b.1 design §3.3): a swing (single-ball, drive, stops) or a carry
 * (rolls).
 */
export type StrokeMode = "swing" | "carry";

/** The hands' dip (design §3.2): the pivot lowers by `depth` (m) over `duration` (s) from `start`, rest to rest. */
export interface Dip {
    /** When it begins, s from t = 0. */
    readonly start: number;
    readonly duration: number;
    readonly depth: number;
}

/**
 * The path the hands drive the mallet along (design §3.1), as two arcs: the pendulum, the mallet swinging about the
 * top hand (the pivot) in a vertical plane; and the hands' path through space, the pivot moving in that plane (leaning,
 * pushing forward, the body's weight) and dipping. Each runs at its initial rate until its window and changes rate
 * constantly through it; what follows depends on the mode (design §3.2). The dip lowers the pivot on top.
 */
export interface SwingArc {
    /** The top hand at t = 0, world frame. */
    readonly pivot: Vec3;
    /** Until the hands' window, in the swing plane (no component along the pitch axis aim × ẑ). */
    readonly pivotVelocity: Vec3;
    /** During the hands' window, in the swing plane. */
    readonly pivotAcceleration: Vec3;
    /** When the hands' window begins (s from t = 0), and its length (s). */
    readonly handStart: number;
    readonly handWindow: number;
    /** Unit, horizontal: the swing plane's forward direction. */
    readonly aim: Vec3;
    /** The top grip from the socket along the shaft (m): the stance's `top`. */
    readonly radius: number;
    /** Arc angle at t = 0 (rad), from the lowest point, positive forward. */
    readonly theta0: number;
    /** The pendulum's rate until its window (rad/s), and its acceleration during it (rad/s²). */
    readonly omega0: number;
    readonly alpha: number;
    /** When the pendulum's window begins (s from t = 0), and its length (s). */
    readonly arcStart: number;
    readonly window: number;
    readonly dip: Dip;
    /** The planned contact (s from t = 0), from which the cap and the reach count. */
    readonly contactAt: number;
    readonly mode: StrokeMode;
    /** How far the hands' path travels along aim after contactAt (m). */
    readonly handReach: number;
    /** Carry only: the head's lowest point ends this far below the turf (m). */
    readonly groundDepth: number;
}

/**
 * The hands' coupling (design §3.3): the natural period (s) and damping ratio of a firm grip; the grips relax at
 * `relaxAt` (s from t = 0) and are firm before it.
 */
export interface Coupling {
    readonly period: number;
    readonly dampingRatio: number;
    readonly relaxAt: number;
}

/**
 * Two hands on the rigid, massless shaft, which is the head's up axis through the socket (design §3.1): the top hand at
 * the arc radius, the bottom hand `bottom` from the socket (m, in (0, radius)). From `relaxAt` on the top hand grips
 * with γ_T = `gripTension` and the bottom hand with g_B = `bottomGrip`, both in (0, 1]. The player's arm mass
 * `armMass` (kg) rides rigidly at the top grip. The bottom hand opens once the shaft has turned through `reachSlack`
 * (m of hand travel). `guideEffort` (in [0, 1]) scales the bottom hand's push after contact in swing mode (the rate
 * guide outside a check, and the push after the release): 1 restores the planned arc's speed, 0 is no extra push; a
 * check's guide acts in full (design §3.3; the player's choice, user's account, 2026-10-06).
 */
export interface Hands {
    readonly bottom: number;
    readonly gripTension: number;
    readonly bottomGrip: number;
    readonly armMass: number;
    readonly reachSlack: number;
    readonly guideEffort: number;
}

/** A tracked drive (design §3): two hands drive the mallet along `arc`, holding it through `coupling`. */
export interface TrackDrive {
    readonly kind: "track";
    readonly arc: SwingArc;
    readonly coupling: Coupling;
    readonly hands: Hands;
}
```

- [ ] **Step 2: Add the test support**

In `tests/engine/support/impact.ts`, replace these two imports:

```ts
import { validateImpact } from "../../../src/engine/impact/simulateImpact";
import type { ContactState, DriveSample, FaceMaterial, HeadState, MalletHead } from "../../../src/engine/impact/types";
```

with:

```ts
import { validateImpact } from "../../../src/engine/impact/simulateImpact";
import { swingOrientation } from "../../../src/engine/impact/track";
import type {
    ContactState,
    Coupling,
    Dip,
    DriveSample,
    FaceMaterial,
    Hands,
    HeadState,
    MalletHead,
    SwingArc,
    TrackDrive,
} from "../../../src/engine/impact/types";
import { sinCos } from "../../../src/engine/math/elementary";
```

and add below `TEST_FACE`:

```ts
/** A coupling for tracked test heads: plausible, not sourced (design §3.4 sets the engine's); contact at t = 0. */
export const TEST_COUPLING: Coupling = { period: 0.04, dampingRatio: 0.7, relaxAt: 0 };

/** Two firm hands with no arm mass, so the swung body is the head and head-only closed forms hold; a full guide. */
export const TEST_HANDS: Hands = {
    bottom: 0.4,
    gripTension: 1,
    bottomGrip: 1,
    armMass: 0,
    reachSlack: 0.03,
    guideEffort: 1,
};

/** A dip of no depth. */
export const NO_DIP: Dip = { start: 0, duration: 0.01, depth: 0 };

/** A tracked drive along `arc`, by default with TEST_COUPLING and TEST_HANDS. */
export function trackDrive(arc: SwingArc, coupling: Coupling = TEST_COUPLING, hands: Hands = TEST_HANDS): TrackDrive {
    return { kind: "track", arc, coupling, hands };
}

/**
 * A still, level swing-mode arc whose test head on the path at t = 0 has its centre at `centre`: aim +x, radius 0.8,
 * θ₀, ω₀ and α 0, both windows 0.01 s from t = 0, no dip, contact at t = 0, a reach of 10 m (it never binds) and no
 * ground depth. `o` overrides any field; the pivot follows an overridden aim, radius or θ₀ unless `o` sets it.
 */
export function levelArc(centre: Vec3, o: Partial<SwingArc> = {}): SwingArc {
    const aim = o.aim ?? vec3(1, 0, 0);
    const radius = o.radius ?? 0.8;
    const theta0 = o.theta0 ?? 0;
    const socket = add(centre, rotate(swingOrientation(aim, theta0), TEST_HEAD.socket));
    const [s, c] = sinCos(theta0);
    return {
        pivot: sub(socket, scale(sub(scale(aim, s), vec3(0, 0, c)), radius)),
        pivotVelocity: ZERO,
        pivotAcceleration: ZERO,
        handStart: 0,
        handWindow: 0.01,
        aim,
        radius,
        theta0,
        omega0: 0,
        alpha: 0,
        arcStart: 0,
        window: 0.01,
        dip: NO_DIP,
        contactAt: 0,
        mode: "swing",
        handReach: 10,
        groundDepth: 0,
        ...o,
    };
}
```

- [ ] **Step 3: Write the failing tests**

Create `tests/engine/impact/track.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { add, cross, dot, length, scale, sub, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import { IDENTITY, multiply, rotate, type Quaternion } from "../../../src/engine/impact/rigidBody";
import { headLowestPoint } from "../../../src/engine/impact/contacts";
import {
    FREE_SPAN,
    FREE_STEP,
    aimRotation,
    effectiveMass,
    headOnPath,
    inCheck,
    pathAt,
    pitchAxis,
    prepareTrack,
    swingOrientation,
    swungBody,
    type FreePendulum,
    type PathPoint,
    type PreparedTrack,
    type Reach,
} from "../../../src/engine/impact/track";
import type { Hands, SwingArc } from "../../../src/engine/impact/types";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import { NO_DIP, TEST_COUPLING, TEST_HANDS, TEST_HEAD, levelArc, socketAt, trackDrive } from "../support/impact";

const AIM = vec3(0.6, 0.8, 0);
const N = pitchAxis(AIM);
const UP = vec3(0, 0, 1);

/** The test hands with an arm mass, so the swung body is not the head. */
const ARMED: Hands = { ...TEST_HANDS, armMass: 0.8 };

const conj = (q: Quaternion): Quaternion => ({ w: q.w, x: -q.x, y: -q.y, z: -q.z });
const dist = (a: Vec3, b: Vec3): number => length(sub(a, b));

/** A power roll's path in carry mode: both arcs speeding up from t = 0, the face pitched 0.6 rad down. */
const ROLL: SwingArc = {
    pivot: vec3(2, 3, 1.5),
    pivotVelocity: scale(AIM, 2.5),
    pivotAcceleration: scale(AIM, 20),
    handStart: 0,
    handWindow: 0.03,
    aim: AIM,
    radius: 0.8,
    theta0: -0.6,
    omega0: 0.5,
    alpha: 4,
    arcStart: 0,
    window: 0.03,
    dip: NO_DIP,
    contactAt: 0,
    mode: "carry",
    handReach: 10,
    groundDepth: 0,
};

/** The same, each action timed: the pendulum's window from 10 ms, the hands' from 20 ms, a 10 mm dip from 5 ms. */
const TIMED: SwingArc = {
    ...ROLL,
    arcStart: 0.01,
    handStart: 0.02,
    dip: { start: 0.005, duration: 0.02, depth: 0.01 },
};

const prepare = (arc: SwingArc, hands: Hands = TEST_HANDS): PreparedTrack =>
    prepareTrack(trackDrive(arc, TEST_COUPLING, hands), TEST_HEAD, STANDARD_GRAVITY);

/** Time before, into and after a window starting at `start` lasting `window`. */
function phases(t: number, start: number, window: number) {
    return {
        before: Math.min(t, start),
        into: Math.min(Math.max(t - start, 0), window),
        after: Math.max(t - start - window, 0),
    };
}

/** The dip's downward displacement and speed (design §3.2). */
function dipAt(arc: SwingArc, t: number): { readonly z: number; readonly v: number } {
    const { start, duration: d, depth: D } = arc.dip;
    const e = t - start;
    const a = (4 * D) / (d * d);
    if (e <= 0) {
        return { z: 0, v: 0 };
    }
    if (e <= d / 2) {
        return { z: 0.5 * a * e * e, v: a * e };
    }
    if (e < d) {
        return { z: D - 0.5 * a * (d - e) * (d - e), v: a * (d - e) };
    }
    return { z: D, v: 0 };
}

/** The closed forms of design §3.2 for a carry-mode arc whose reach does not bind, with Math.* (the engine: sinCos). */
function closedForm(arc: SwingArc, t: number) {
    const p = phases(t, arc.arcStart, arc.window);
    const omegaEnd = arc.omega0 + arc.alpha * arc.window;
    const rate = omegaEnd / arc.window;
    const u = Math.min(p.after, arc.window);
    const omega = arc.omega0 + arc.alpha * p.into - rate * u;
    const theta =
        arc.theta0 +
        arc.omega0 * (p.before + p.into) +
        0.5 * arc.alpha * p.into * p.into +
        omegaEnd * u -
        0.5 * rate * u * u;
    const h = phases(t, arc.handStart, arc.handWindow);
    const A = arc.pivotAcceleration;
    const V = add(arc.pivotVelocity, scale(A, h.into));
    const dip = dipAt(arc, t);
    const P = add(
        add(add(arc.pivot, scale(arc.pivotVelocity, h.before + h.into)), scale(A, 0.5 * h.into * h.into)),
        add(scale(add(arc.pivotVelocity, scale(A, arc.handWindow)), h.after), vec3(0, 0, -dip.z)),
    );
    const radial = sub(scale(arc.aim, Math.sin(theta)), vec3(0, 0, Math.cos(theta)));
    const tangent = add(scale(arc.aim, Math.cos(theta)), vec3(0, 0, Math.sin(theta)));
    return {
        theta,
        omega,
        socket: add(P, scale(radial, arc.radius)),
        socketVelocity: add(add(V, vec3(0, 0, -dip.v)), scale(tangent, arc.radius * omega)),
    };
}

/** The top hand's place on the path, P = socket + r·s, and its velocity: the pivot with the reach and the dip. */
function pivotOf(p: PathPoint, radius: number): { readonly P: Vec3; readonly V: Vec3 } {
    const top = scale(rotate(p.orientation, UP), radius);
    return { P: add(p.socket, top), V: add(p.socketVelocity, cross(p.angularVelocity, top)) };
}

describe("the swing path", () => {
    const track = prepare(TIMED);

    it("follows the closed forms before, during and after each window, the dip included", () => {
        for (const t of [0, 0.004, 0.009, 0.012, 0.018, 0.024, 0.045, 0.06, 0.08, 0.12]) {
            const p = pathAt(track, t);
            const c = closedForm(TIMED, t);
            expect(dist(p.socket, c.socket), `socket at ${t}`).toBeLessThan(1e-12);
            expect(dist(p.socketVelocity, c.socketVelocity), `velocity at ${t}`).toBeLessThan(1e-12);
            expect(dot(p.angularVelocity, N), `ω at ${t}`).toBeCloseTo(c.omega, 12);
        }
    });

    it("is continuous at every window's and the dip's boundaries", () => {
        const { arcStart, window, handStart, handWindow, dip } = TIMED;
        const edges = [
            arcStart,
            arcStart + window,
            arcStart + 2 * window,
            handStart,
            handStart + handWindow,
            dip.start,
            dip.start + dip.duration / 2,
            dip.start + dip.duration,
        ];
        for (const t of edges) {
            const before = pathAt(track, t);
            const after = pathAt(track, t + 1e-12);
            expect(dist(before.socket, after.socket), `socket at ${t}`).toBeLessThan(1e-11);
            expect(dist(before.socketVelocity, after.socketVelocity), `velocity at ${t}`).toBeLessThan(1e-9);
            expect(dist(before.angularVelocity, after.angularVelocity), `ω at ${t}`).toBeLessThan(1e-9);
        }
    });

    it("differentiates consistently away from the edges: velocity, acceleration and spin", () => {
        // Central differences straddling a window's or the dip's edge see the step in acceleration (pre-flight D3.1).
        const h = 1e-6;
        for (const t of [0.003, 0.013, 0.022, 0.045, 0.06, 0.08]) {
            const lo = pathAt(track, t - h);
            const mid = pathAt(track, t);
            const hi = pathAt(track, t + h);
            expect(dist(scale(sub(hi.socket, lo.socket), 1 / (2 * h)), mid.socketVelocity)).toBeLessThan(1e-6);
            expect(
                dist(scale(sub(hi.socketVelocity, lo.socketVelocity), 1 / (2 * h)), mid.socketAcceleration),
            ).toBeLessThan(1e-4);
            // hi ⊗ conj(lo) turns by 2h·|ω| about ω: its vector part is sin(h·|ω|)·ω̂ ≈ h·ω.
            const turn = multiply(hi.orientation, conj(lo.orientation));
            const spin = scale(vec3(turn.x, turn.y, turn.z), Math.sign(turn.w) / h);
            expect(dist(spin, mid.angularVelocity)).toBeLessThan(1e-6);
            const rate = (dot(hi.angularVelocity, N) - dot(lo.angularVelocity, N)) / (2 * h);
            expect(mid.pendulumAcceleration).toBeCloseTo(rate, 6);
        }
    });

    it("reports the dip's part of the pivot's acceleration and the pendulum's α", () => {
        const a = (4 * TIMED.dip.depth) / (TIMED.dip.duration * TIMED.dip.duration);
        expect(pathAt(track, 0.004).dipAcceleration.z).toBe(0);
        expect(pathAt(track, 0.009).dipAcceleration.z).toBeCloseTo(-a, 9);
        expect(pathAt(track, 0.018).dipAcceleration.z).toBeCloseTo(a, 9);
        expect(pathAt(track, 0.009).pendulumAcceleration).toBe(0);
        expect(pathAt(track, 0.012).pendulumAcceleration).toBe(TIMED.alpha);
        expect(pathAt(track, 0.045).pendulumAcceleration).toBeCloseTo(-(TIMED.omega0 + TIMED.alpha * 0.03) / 0.03, 9);
    });

    it("holds the head's tilt while the hands alone move: a straight line at a constant orientation", () => {
        const push = prepare({ ...ROLL, omega0: 0, alpha: 0 });
        const start = pathAt(push, 0);
        for (const t of [0.01, 0.03, 0.08]) {
            const p = pathAt(push, t);
            expect(p.orientation).toEqual(start.orientation);
            const moved = sub(p.socket, start.socket);
            expect(length(cross(moved, AIM))).toBeLessThan(1e-12);
            expect(dot(moved, AIM)).toBeGreaterThan(0);
        }
    });

    it("dips the hands by its depth from rest to rest, then holds them there", () => {
        const flat = prepare({ ...TIMED, dip: NO_DIP });
        const { start, duration, depth } = TIMED.dip;
        const below = (t: number): number => pathAt(flat, t).socket.z - pathAt(track, t).socket.z;
        const sinking = (t: number): number => pathAt(flat, t).socketVelocity.z - pathAt(track, t).socketVelocity.z;
        expect(below(start)).toBe(0);
        expect(sinking(start)).toBe(0);
        for (const t of [start + duration, 0.05, 0.12]) {
            expect(below(t), `at ${t}`).toBeCloseTo(depth, 12);
            expect(sinking(t), `at ${t}`).toBeCloseTo(0, 12);
        }
    });

    it("brings a full check to rest at its window's end; carry mode holds it there", () => {
        const still = vec3(0, 0, 0);
        const checked = { ...ROLL, omega0: 3.5, pivotVelocity: still, pivotAcceleration: still, alpha: -3.5 / 0.03 };
        for (const mode of ["swing", "carry"] as const) {
            const w = dot(pathAt(prepare({ ...checked, mode }), ROLL.window).angularVelocity, N);
            expect(Math.abs(w), mode).toBeLessThan(1e-12);
        }
        const carry = prepare(checked);
        for (const t of [0.05, 0.12]) {
            expect(Math.abs(dot(pathAt(carry, t).angularVelocity, N)), `at ${t}`).toBeLessThan(1e-12);
        }
        expect(dist(pathAt(carry, 0.05).socket, pathAt(carry, 0.12).socket)).toBeLessThan(1e-12);
    });

    it("holds θ in carry mode after the second window", () => {
        const held = pathAt(track, TIMED.arcStart + 2 * TIMED.window).orientation;
        for (const t of [0.075, 0.1, 0.2]) {
            expect(pathAt(track, t).orientation, `at ${t}`).toEqual(held);
        }
    });

    it("turns the face with the arc: the head's forward axis is the tangent to the socket's circle", () => {
        for (const t of [0, 0.02, 0.06]) {
            const forward = rotate(pathAt(track, t).orientation, vec3(1, 0, 0));
            const theta = closedForm(TIMED, t).theta;
            expect(dist(forward, add(scale(AIM, Math.cos(theta)), vec3(0, 0, Math.sin(theta))))).toBeLessThan(1e-12);
        }
    });

    it("orients the path by swingOrientation, so the swing model can place a head on it", () => {
        expect(pathAt(track, 0).orientation).toEqual(swingOrientation(AIM, TIMED.theta0));
    });

    it("turns body x to any aim", () => {
        for (const angle of [0, 2, Math.PI, -Math.PI / 2, 7]) {
            const aim = vec3(Math.cos(angle), Math.sin(angle), 0);
            expect(dist(rotate(aimRotation(aim), vec3(1, 0, 0)), aim), `aim ${angle}`).toBeLessThan(1e-15);
        }
    });

    it("tabulates a free pendulum in swing mode only", () => {
        expect(track.free).toBeNull();
        const free = prepare({ ...TIMED, mode: "swing" }).free;
        expect(free?.tw).toBe(TIMED.arcStart + TIMED.window);
        expect(free?.theta).toHaveLength(Math.round(FREE_SPAN / FREE_STEP) + 1);
    });

    it("gives each grip its gains: firm, the top hand's γ_T and the bottom hand's g_B", () => {
        const hands: Hands = { ...ARMED, gripTension: 0.1, bottomGrip: 0.25 };
        const t = prepare(TIMED, hands);
        const rate = (2 * Math.PI) / TEST_COUPLING.period;
        const zeta = TEST_COUPLING.dampingRatio;
        const M = 1.8;
        const Iz = TEST_HEAD.inertia.z;
        for (const [gains, g] of [
            [t.firm, 1],
            [t.top, 0.1],
            [t.bottom, 0.25],
        ] as const) {
            const k = g * M * rate * rate;
            const K = g * Iz * rate * rate;
            expect(gains.stiffness).toBeCloseTo(k, 9);
            expect(gains.damping).toBeCloseTo(2 * zeta * Math.sqrt(k * M), 9);
            expect(gains.twistStiffness).toBeCloseTo(K, 12);
            expect(gains.twistDamping).toBeCloseTo(2 * zeta * Math.sqrt(K * Iz), 12);
        }
    });
});

describe("the free pendulum", () => {
    const CENTRE = vec3(0, 0, 1);

    it("stays at the lowest point from rest under a still pivot", () => {
        const track = prepare(levelArc(CENTRE), ARMED);
        const start = pathAt(track, 0);
        for (const t of [0.02, 0.1, 0.24]) {
            const p = pathAt(track, t);
            expect(p.orientation).toEqual(start.orientation);
            expect(p.socket).toEqual(start.socket);
            expect(dot(p.angularVelocity, track.axis)).toBe(0);
        }
    });

    it("swings released from a small angle at √(m·g·ℓ_h/I_P) over 0.25 s", () => {
        const theta0 = 0.01;
        const arc = levelArc(CENTRE, { theta0 });
        const track = prepare(arc, ARMED);
        const body = swungBody(TEST_HEAD, ARMED, arc.radius);
        const lh = TEST_HEAD.socket.z + arc.radius;
        const d = lh - body.offset;
        const rate = Math.sqrt((TEST_HEAD.mass * STANDARD_GRAVITY * lh) / (body.inertia.y + body.mass * d * d));
        const tw = arc.arcStart + arc.window;
        let worst = 0;
        for (let k = 0; k <= 250; k++) {
            const t = tw + k * 1e-3;
            const p = pathAt(track, t);
            const forward = rotate(p.orientation, vec3(1, 0, 0));
            const theta = Math.atan2(forward.z, forward.x);
            worst = Math.max(worst, Math.abs(theta - theta0 * Math.cos(rate * (t - tw))));
        }
        // Two known errors bound it: semi-implicit Euler's half-step phase lead, Ω·FREE_STEP/2 ≈ 8.6e-6 of θ₀, and the
        // small-angle solution's frequency shift, θ₀²/16 of Ω, ≈ 5.3e-6 of θ₀ over the 0.25 s sampled. They partly
        // cancel: drafting measured 2.2e-6 of θ₀ (6.4e-6 at θ₀ = 0.001, 1.3e-5 at 0.02).
        expect(worst).toBeLessThan(1.5e-5 * theta0);
    });

    it("holds θ and ω at the table's last sample beyond it", () => {
        const track = prepare(levelArc(CENTRE, { theta0: 0.3 }), ARMED);
        const free = track.free as FreePendulum;
        const late = pathAt(track, free.tw + FREE_SPAN + 0.01);
        const later = pathAt(track, free.tw + FREE_SPAN + 0.1);
        expect(later.orientation).toEqual(late.orientation);
        expect(later.angularVelocity).toEqual(late.angularVelocity);
        expect(dot(late.angularVelocity, track.axis)).toBeCloseTo(free.omega[free.omega.length - 1] as number, 15);
    });
});

describe("the hands' reach", () => {
    const CENTRE = vec3(0, 0, 1);
    const pivotAt = (track: PreparedTrack, t: number) => pivotOf(pathAt(track, t), track.arc.radius);

    it("stops the pivot's along-aim motion handReach from contactAt, at rest from t_s, the rest running on", () => {
        // Swing mode, so no descent; the vertical part of the pivot's velocity is off aim and runs on.
        const arc = levelArc(CENTRE, { pivotVelocity: vec3(2, 0, 0.3), handReach: 0.1, contactAt: 0.01 });
        const track = prepare(arc);
        const reach = track.reach as Reach;
        const from = pivotAt(track, arc.contactAt).P;
        expect(reach.t1).toBeCloseTo(arc.contactAt + 0.04, 12);
        expect(reach.tStop).toBeCloseTo(reach.t1 + (0.4 * 0.1) / 2, 12);
        for (const t of [reach.tStop, reach.tStop + 0.02, 0.2]) {
            const p = pivotAt(track, t);
            expect(p.P.x - from.x, `travel at ${t}`).toBeCloseTo(0.1, 12);
            expect(p.V.x, `along-aim speed at ${t}`).toBeCloseTo(0, 12);
            expect(p.V.z, `vertical speed at ${t}`).toBeCloseTo(0.3, 12);
        }
        for (const t of [reach.t1, reach.tStop]) {
            const before = pivotAt(track, t);
            const after = pivotAt(track, t + 1e-12);
            expect(dist(before.P, after.P), `position at ${t}`).toBeLessThan(1e-11);
            expect(dist(before.V, after.V), `velocity at ${t}`).toBeLessThan(1e-9);
        }
    });

    it("rests the along-aim motion from contactAt with a reach of 0", () => {
        const arc = levelArc(CENTRE, { pivotVelocity: vec3(2, 0, 0), handReach: 0, contactAt: 0.02, mode: "carry" });
        const track = prepare(arc);
        const at = pivotAt(track, arc.contactAt).P;
        for (const t of [0.03, 0.1]) {
            expect(dist(pivotAt(track, t).P, at), `at ${t}`).toBeLessThan(1e-12);
        }
        expect(pivotAt(track, 0.01).V.x).toBe(2);
    });

    it("does not bind if the plan does not travel 0.8·handReach within 0.5 s of contactAt", () => {
        const slow = prepare(levelArc(CENTRE, { pivotVelocity: vec3(0.15, 0, 0), handReach: 0.1 }));
        expect(slow.reach).toBeNull();
        expect(pivotAt(slow, 0.2).V.x).toBe(0.15);
        const brisk = prepare(levelArc(CENTRE, { pivotVelocity: vec3(0.17, 0, 0), handReach: 0.1 }));
        expect(brisk.reach?.t1).toBeCloseTo(0.08 / 0.17, 12);
    });

    it("in carry mode ends the head's lowest point groundDepth below the turf at t_s, and holds it", () => {
        const low = vec3(0, 0, 0.05);
        const arc = levelArc(low, { pivotVelocity: vec3(2, 0, 0), handReach: 0.15, mode: "carry", groundDepth: 0.005 });
        const track = prepare(arc);
        const reach = track.reach as Reach;
        expect(reach.descent).toBeCloseTo(0.05 - TEST_HEAD.radius + 0.005, 12);
        for (const t of [reach.tStop, reach.tStop + 0.05]) {
            const lowest = headLowestPoint(headOnPath(track, TEST_HEAD, t), TEST_HEAD);
            expect(lowest, `at ${t}`).toBeCloseTo(-0.005, 12);
        }
        for (const t of [reach.t1, (reach.t1 + reach.tStop) / 2, reach.tStop]) {
            const before = pivotAt(track, t);
            const after = pivotAt(track, t + 1e-12);
            expect(dist(before.V, after.V), `velocity at ${t}`).toBeLessThan(1e-9);
        }
    });
});

describe("a head on the path", () => {
    const track = prepare(TIMED);

    it("has its socket on the path", () => {
        for (const t of [0, 0.02, 0.06]) {
            const head = headOnPath(track, TEST_HEAD, t);
            expect(dist(socketAt(head, TEST_HEAD), pathAt(track, t).socket)).toBeLessThan(1e-14);
        }
    });

    it("moves with the path's rigid motion: its velocity is its position's derivative", () => {
        const h = 1e-6;
        for (const t of [0.013, 0.06]) {
            const lo = headOnPath(track, TEST_HEAD, t - h);
            const hi = headOnPath(track, TEST_HEAD, t + h);
            const mid = headOnPath(track, TEST_HEAD, t);
            expect(dist(scale(sub(hi.position, lo.position), 1 / (2 * h)), mid.velocity)).toBeLessThan(1e-6);
            expect(mid.angularVelocity).toEqual(pathAt(track, t).angularVelocity);
        }
    });

    it("is inside a check only through a window with α < 0", () => {
        const check = prepare({ ...TIMED, alpha: -4 });
        expect([0.005, 0.01, 0.025, 0.04, 0.045].map((t) => inCheck(check, t))).toEqual([
            false,
            true,
            true,
            true,
            false,
        ]);
        expect(inCheck(track, 0.025)).toBe(false);
    });
});

describe("the swung body", () => {
    it("is the head with no arm mass", () => {
        expect(swungBody(TEST_HEAD, TEST_HANDS, 0.8)).toEqual({ mass: 1, inertia: TEST_HEAD.inertia, offset: 0 });
    });

    it("puts the arm mass at the top grip: δ and I' by the parallel-axis theorem", () => {
        const body = swungBody(TEST_HEAD, ARMED, 0.8);
        // The top grip is ρ + r = 0.832 m above the head's centre.
        const delta = (0.8 * 0.832) / 1.8;
        const extra = 1 * delta * delta + 0.8 * (0.832 - delta) * (0.832 - delta);
        expect(body.mass).toBe(1.8);
        expect(body.offset).toBeCloseTo(delta, 15);
        expect(body.inertia.x).toBeCloseTo(TEST_HEAD.inertia.x + extra, 15);
        expect(body.inertia.y).toBeCloseTo(TEST_HEAD.inertia.y + extra, 15);
        expect(body.inertia.z).toBe(TEST_HEAD.inertia.z);
    });
});

describe("the effective mass at the face centre", () => {
    it("is the head's mass with no arm mass, along the head's axis", () => {
        const body = swungBody(TEST_HEAD, TEST_HANDS, 0.8);
        expect(effectiveMass(body, TEST_HEAD, IDENTITY, vec3(1, 0, 0))).toBe(1);
        const q = swingOrientation(AIM, 0.3);
        expect(effectiveMass(body, TEST_HEAD, q, rotate(q, vec3(1, 0, 0)))).toBeCloseTo(1, 12);
    });

    it("matches a hand computation with the arm mass: 1/(1/M + δ²/I'_y) along aim, level", () => {
        // ρ + r = 0.832 m; I_y = m·(3ρ² + L²)/12 = 0.055972/12 kg·m².
        const delta = (0.8 * 0.832) / 1.8;
        const Iy = 0.055972 / 12 + delta * delta + 0.8 * (0.832 - delta) * (0.832 - delta);
        const expected = 1 / (1 / 1.8 + (delta * delta) / Iy);
        const body = swungBody(TEST_HEAD, ARMED, 0.8);
        expect(effectiveMass(body, TEST_HEAD, IDENTITY, vec3(1, 0, 0))).toBeCloseTo(expected, 12);
        expect(expected).toBeCloseTo(1.00668, 5);
    });
});
```

- [ ] **Step 4: Run them to verify they fail**

Run: `npx vitest run tests/engine/impact/track.test.ts`
Expected: FAIL, the suite does not load: `Error: Cannot find module '../../../src/engine/impact/track' imported from
…/tests/engine/impact/track.test.ts` ("Test Files 1 failed", "Tests no tests"). Every other suite that imports
`support/impact.ts` fails to load the same way until Step 5; `npm run check` reports the missing module.

- [ ] **Step 5: Write `src/engine/impact/track.ts`**

```ts
/**
 * The tracked drive's path (P2b.2b.1 design §3.1, §3.2), as two arcs. The pendulum: the mallet swings about the top
 * hand (the pivot) in a vertical plane, the shaft at arc angle θ. The hands' path through space: the pivot moves in
 * that plane, ends after its reach, and dips. Each arc runs at its initial rate until its window and changes rate
 * constantly through it. After its window the pendulum swings freely (swing mode) or slows to a held slope (carry
 * mode). The dip, and in carry mode the descent at the reach's end, lower the pivot from rest to rest. Everything is
 * continuous in position and velocity.
 *
 * Frames. n = aim × ẑ is the pitch axis: a positive rotation about it tilts aim upward. The head is rigid on the shaft,
 * its up axis s: at arc angle θ its orientation is rot(n, θ) ⊗ q_aim, q_aim turning body x to aim, and the socket's
 * target is P + r·(sin θ·aim − cos θ·ẑ). The head and the arm mass at the top grip move as one swung body (design
 * §3.3). Exact operations only (sinCos and atan2 from elementary.ts), like the rest of the engine.
 */
import { atan2, sinCos } from "../math/elementary";
import { add, cross, dot, scale, sub, vec3, type Vec3 } from "../math/vec3";
import { headLowestPoint } from "./contacts";
import { multiply, rotate, rotateInverse, type Quaternion } from "./rigidBody";
import type { Coupling, Hands, HeadState, MalletHead, SwingArc, TrackDrive } from "./types";

const UP = vec3(0, 0, 1);

/**
 * Step (s) of the free pendulum's table (design §3.2): the impact's own step, so the table resolves the swing as
 * finely as the integrator does. Numerical, not physical.
 */
export const FREE_STEP = 5e-6;

/**
 * Span (s) of the free pendulum's table from the pendulum's window's end (design §3.2). Numerical: a tracked impact
 * runs at most MAX_LEAD (0.06 s, the longest lead-in) plus TRACK_IMPACT_CAP (0.45 s) from t = 0, and the table starts
 * at the window's end, so 0.55 s covers every impact with room to spare.
 */
export const FREE_SPAN = 0.55;

/**
 * How long after contactAt (s) the hands' path may take to travel 0.8·handReach before the reach is taken not to bind
 * (design §3.2). A modelling bound, not physical: past it the impact has long ended.
 */
const REACH_SEARCH = 0.5;

/** Bisections of REACH_SEARCH for the reach's start: numerical, enough to reach a double's resolution. */
const REACH_BISECTIONS = 80;

/** The pitch axis n = aim × ẑ of a horizontal unit `aim`: a positive rotation about it tilts aim upward. */
export function pitchAxis(aim: Vec3): Vec3 {
    return vec3(aim.y, 0 - aim.x, 0);
}

/** The rotation about ẑ that turns body x to the horizontal unit vector `aim`. */
export function aimRotation(aim: Vec3): Quaternion {
    const [s, c] = sinCos(atan2(aim.y, aim.x) / 2);
    return { w: c, x: 0, y: 0, z: s };
}

/** The rotation by `theta` about the horizontal unit `axis`. */
function pitch(axis: Vec3, theta: number): Quaternion {
    const [s, c] = sinCos(theta / 2);
    return { w: c, x: axis.x * s, y: axis.y * s, z: 0 };
}

/**
 * The head's orientation on the path at arc angle `theta`: rot(n, θ) ⊗ q_aim. pathAt computes it the same way, so a
 * head the swing model places with it starts exactly on the path.
 */
export function swingOrientation(aim: Vec3, theta: number): Quaternion {
    return multiply(pitch(pitchAxis(aim), theta), aimRotation(aim));
}

/**
 * The swung body (design §3.3): the head and the arm mass at the top grip, one rigid body. Its centre lies `offset`
 * (δ, m) along the head's up axis (body z) from the head's centre; `inertia` is its principal inertia about that
 * centre, body frame.
 */
export interface SwungBody {
    readonly mass: number;
    readonly inertia: Vec3;
    readonly offset: number;
}

/**
 * The swung body of `head` with `hands`' arm mass m_a at the top grip, `radius` from the socket (design §3.3):
 * M = m + m_a, δ = m_a·(ρ + r)/M, and I' = (I_x + e, I_y + e, I_z) with e = m·δ² + m_a·(ρ + r − δ)², ρ the socket's
 * height above the head's centre. With no arm mass it is the head.
 */
export function swungBody(head: MalletHead, hands: Hands, radius: number): SwungBody {
    const arm = hands.armMass;
    const mass = head.mass + arm;
    const grip = head.socket.z + radius;
    const offset = (arm * grip) / mass;
    const extra = head.mass * offset * offset + arm * (grip - offset) * (grip - offset);
    const I = head.inertia;
    return { mass, inertia: vec3(I.x + extra, I.y + extra, I.z), offset };
}

/**
 * The swung body's effective mass (kg) at the face centre along the world unit `direction`, the head at `orientation`
 * (design §3.4): 1/(1/M + (r_f × u)·I'⁻¹·(r_f × u)), r_f = (L/2, 0, −δ) the face centre from the swung body's centre
 * and u the direction, both in the body frame.
 */
export function effectiveMass(body: SwungBody, head: MalletHead, orientation: Quaternion, direction: Vec3): number {
    const u = rotateInverse(orientation, direction);
    const k = cross(vec3(head.length / 2, 0, 0 - body.offset), u);
    const I = body.inertia;
    return 1 / (1 / body.mass + (k.x * k.x) / I.x + (k.y * k.y) / I.y + (k.z * k.z) / I.z);
}

/** One grip's gains (design §3.3), for a grip g. */
export interface HandGains {
    /** k(g) = g·M·(2π/T)² and c(g) = 2ζ·√(k(g)·M) (N/m, N·s/m). */
    readonly stiffness: number;
    readonly damping: number;
    /** About the shaft: K_s(g) = g·I_z·(2π/T)² and C_s(g) = 2ζ·√(K_s(g)·I_z) (N·m/rad, N·m·s/rad). */
    readonly twistStiffness: number;
    readonly twistDamping: number;
}

function handGains(coupling: Coupling, grip: number, body: SwungBody): HandGains {
    const rate = (2 * Math.PI) / coupling.period;
    const gain = grip * rate * rate;
    const stiffness = gain * body.mass;
    const Iz = body.inertia.z;
    const twistStiffness = gain * Iz;
    const twice = 2 * coupling.dampingRatio;
    return {
        stiffness,
        damping: twice * Math.sqrt(stiffness * body.mass),
        twistStiffness,
        twistDamping: twice * Math.sqrt(twistStiffness * Iz),
    };
}

/**
 * The hands' reach (design §3.2): the planned pivot until it has travelled 0.8·handReach along aim from contactAt, at
 * t1 (where it is at p1, with speed v1 along aim); then its along-aim component decelerates at `decel` to rest at
 * tStop and stays there. In carry mode the pivot also descends by `descent` (m) over [t1, tStop], rest to rest.
 */
export interface Reach {
    readonly t1: number;
    readonly p1: Vec3;
    readonly v1: number;
    readonly decel: number;
    readonly tStop: number;
    readonly descent: number;
}

/**
 * The free pendulum after the pendulum's window (swing mode, design §3.2): θ and ω tabulated every FREE_STEP from
 * `tw`, of I_P·θ̈ = −m·g·ℓ_h·sin θ − M·d·(A·t̂). `weight` is m·g·ℓ_h (N·m), `inertial` M·d (kg·m) and `inertia` I_P
 * (kg·m²).
 */
export interface FreePendulum {
    readonly tw: number;
    readonly theta: readonly number[];
    readonly omega: readonly number[];
    readonly weight: number;
    readonly inertial: number;
    readonly inertia: number;
}

/**
 * A tracked drive prepared once (design §3.2, §3.3): each arc's state where its window begins and ends, the dip's
 * acceleration, the reach, the free pendulum, the swung body and the grips' gains. Immutable: a run's grip state lives
 * in the integrator.
 */
export interface PreparedTrack {
    readonly kind: "track";
    readonly arc: SwingArc;
    readonly coupling: Coupling;
    readonly hands: Hands;
    /** The pitch axis n. */
    readonly axis: Vec3;
    /** q_aim. */
    readonly base: Quaternion;
    /** θ where the pendulum's window begins; θ and ω where it ends. */
    readonly thetaArc: number;
    readonly thetaEnd: number;
    readonly omegaEnd: number;
    /** The planned pivot where the hands' window begins; the pivot and its velocity where it ends. */
    readonly pivotHand: Vec3;
    readonly pivotEnd: Vec3;
    readonly pivotVelocityEnd: Vec3;
    /** The dip's acceleration, 4·depth/duration² (m/s²). */
    readonly dipAccel: number;
    /** Null where the reach does not bind. */
    readonly reach: Reach | null;
    /** Swing mode's free pendulum; null in carry mode. */
    readonly free: FreePendulum | null;
    readonly body: SwungBody;
    /** The head's weight m·g (N). */
    readonly headWeight: number;
    /** Gains of a firm grip (g = 1, both hands before relaxAt), the top hand's (γ_T) and the bottom hand's (g_B). */
    readonly firm: HandGains;
    readonly top: HandGains;
    readonly bottom: HandGains;
}

/** A point's position, velocity and acceleration (world frame). */
interface Motion {
    readonly P: Vec3;
    readonly V: Vec3;
    readonly A: Vec3;
}

/** A rest-to-rest lowering (m, m/s, m/s², all downward). */
interface Lowering {
    readonly z: number;
    readonly v: number;
    readonly a: number;
}

const LEVEL: Lowering = { z: 0, v: 0, a: 0 };

/**
 * A lowering by `depth` over `duration` at time `e` from its start, rest to rest: constant acceleration `a`
 * (4·depth/duration²) for the first half, −a for the second.
 */
function lowering(depth: number, duration: number, a: number, e: number): Lowering {
    if (!(depth > 0 && duration > 0 && e > 0)) {
        return LEVEL;
    }
    if (e <= duration / 2) {
        return { z: 0.5 * a * e * e, v: a * e, a };
    }
    if (e < duration) {
        const left = duration - e;
        return { z: depth - 0.5 * a * left * left, v: a * left, a: 0 - a };
    }
    return { z: depth, v: 0, a: 0 };
}

/** The planned pivot at time t: P₀ + V₀·t, then P_h + V₀·τ + ½·A·τ², then P_e + V_e·u (no reach, no dip). */
function planPivot(track: PreparedTrack, t: number): Motion {
    const { arc } = track;
    if (t <= arc.handStart) {
        return { P: add(arc.pivot, scale(arc.pivotVelocity, t)), V: arc.pivotVelocity, A: vec3(0, 0, 0) };
    }
    if (t <= arc.handStart + arc.handWindow) {
        const tau = t - arc.handStart;
        return {
            P: add(add(track.pivotHand, scale(arc.pivotVelocity, tau)), scale(arc.pivotAcceleration, 0.5 * tau * tau)),
            V: add(arc.pivotVelocity, scale(arc.pivotAcceleration, tau)),
            A: arc.pivotAcceleration,
        };
    }
    const u = t - (arc.handStart + arc.handWindow);
    return { P: add(track.pivotEnd, scale(track.pivotVelocityEnd, u)), V: track.pivotVelocityEnd, A: vec3(0, 0, 0) };
}

/**
 * The pivot at time t with the reach (and in carry mode its descent), without the dip. After t1 the along-aim
 * component eases to rest; any other component in the swing plane runs on as planned, so V stays continuous.
 */
function pivotAt(track: PreparedTrack, t: number): Motion {
    const plan = planPivot(track, t);
    const { reach } = track;
    if (reach === null || t <= reach.t1) {
        return plan;
    }
    const { aim } = track.arc;
    const tau = Math.min(t, reach.tStop) - reach.t1;
    const moving = t < reach.tStop;
    const along = dot(reach.p1, aim) + reach.v1 * tau - 0.5 * reach.decel * tau * tau;
    const speed = moving ? reach.v1 - reach.decel * tau : 0;
    const accel = moving ? 0 - reach.decel : 0;
    const span = reach.tStop - reach.t1;
    const down = lowering(reach.descent, span, (4 * reach.descent) / (span * span), tau);
    return {
        P: sub(add(plan.P, scale(aim, along - dot(plan.P, aim))), vec3(0, 0, down.z)),
        V: sub(add(plan.V, scale(aim, speed - dot(plan.V, aim))), vec3(0, 0, down.v)),
        A: sub(add(plan.A, scale(aim, accel - dot(plan.A, aim))), vec3(0, 0, down.a)),
    };
}

/** The dip at time t (design §3.2). */
function dipAt(track: PreparedTrack, t: number): Lowering {
    const { dip } = track.arc;
    return lowering(dip.depth, dip.duration, track.dipAccel, t - dip.start);
}

/** The free pendulum's θ̈ at θ and t (design §3.2), the pivot's acceleration A including the reach and the dip. */
function freeAlpha(track: PreparedTrack, free: FreePendulum, theta: number, t: number): number {
    const [s, c] = sinCos(theta);
    const A = sub(pivotAt(track, t).A, vec3(0, 0, dipAt(track, t).a));
    const along = dot(A, add(scale(track.arc.aim, c), scale(UP, s)));
    return (0 - free.weight * s - free.inertial * along) / free.inertia;
}

/**
 * The reach (design §3.2): where the planned pivot has travelled 0.8·handReach along aim from contactAt (by bisection;
 * the swing model's paths travel monotonically), and the ease to rest over the last 0.2·handReach. A handReach of 0
 * rests the along-aim motion from contactAt. Null if the plan does not travel that far within REACH_SEARCH.
 */
function computeReach(track: PreparedTrack): Reach | null {
    const { aim, contactAt, handReach } = track.arc;
    const p0 = planPivot(track, contactAt).P;
    if (!(handReach > 0)) {
        return { t1: contactAt, p1: p0, v1: 0, decel: 0, tStop: contactAt, descent: 0 };
    }
    const start = 0.8 * handReach;
    const along = (t: number): number => dot(sub(planPivot(track, t).P, p0), aim);
    let lo = contactAt;
    let hi = contactAt + REACH_SEARCH;
    if (along(hi) < start) {
        return null;
    }
    for (let i = 0; i < REACH_BISECTIONS; i++) {
        const mid = (lo + hi) / 2;
        if (along(mid) < start) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    const at = planPivot(track, hi);
    const v1 = Math.max(0, dot(at.V, aim));
    if (!(v1 > 0)) {
        return { t1: hi, p1: at.P, v1: 0, decel: 0, tStop: hi, descent: 0 };
    }
    const ease = 0.4 * handReach;
    return { t1: hi, p1: at.P, v1, decel: (v1 * v1) / ease, tStop: hi + ease / v1, descent: 0 };
}

/** Tabulates swing mode's free pendulum from the window's end by semi-implicit Euler every FREE_STEP (design §3.2). */
function computeFree(track: PreparedTrack, head: MalletHead, gravity: number): FreePendulum {
    const { arc, body } = track;
    const lh = head.socket.z + arc.radius;
    const d = lh - body.offset;
    const theta: number[] = [];
    const omega: number[] = [];
    const free: FreePendulum = {
        tw: arc.arcStart + arc.window,
        theta,
        omega,
        weight: head.mass * gravity * lh,
        inertial: body.mass * d,
        inertia: body.inertia.y + body.mass * d * d,
    };
    let th = track.thetaEnd;
    let om = track.omegaEnd;
    const n = Math.round(FREE_SPAN / FREE_STEP);
    for (let i = 0; i <= n; i++) {
        theta.push(th);
        omega.push(om);
        om += freeAlpha(track, free, th, free.tw + i * FREE_STEP) * FREE_STEP;
        th += om * FREE_STEP;
    }
    return free;
}

/**
 * Prepares `drive` for `head` under `gravity` (design §3.2, §3.3): the windows' end states, the reach, in carry mode
 * the descent D = max(0, z_s + groundDepth) (z_s the head's lowest point on the path at the reach's end without it),
 * in swing mode the free pendulum's table, the swung body and the gains.
 */
export function prepareTrack(drive: TrackDrive, head: MalletHead, gravity: number): PreparedTrack {
    const { arc, coupling, hands } = drive;
    const w = arc.window;
    const wh = arc.handWindow;
    const thetaArc = arc.theta0 + arc.omega0 * arc.arcStart;
    const pivotHand = add(arc.pivot, scale(arc.pivotVelocity, arc.handStart));
    const body = swungBody(head, hands, arc.radius);
    const plain: PreparedTrack = {
        kind: "track",
        arc,
        coupling,
        hands,
        axis: pitchAxis(arc.aim),
        base: aimRotation(arc.aim),
        thetaArc,
        thetaEnd: thetaArc + arc.omega0 * w + 0.5 * arc.alpha * w * w,
        omegaEnd: arc.omega0 + arc.alpha * w,
        pivotHand,
        pivotEnd: add(add(pivotHand, scale(arc.pivotVelocity, wh)), scale(arc.pivotAcceleration, 0.5 * wh * wh)),
        pivotVelocityEnd: add(arc.pivotVelocity, scale(arc.pivotAcceleration, wh)),
        dipAccel: (4 * arc.dip.depth) / (arc.dip.duration * arc.dip.duration),
        reach: null,
        free: null,
        body,
        headWeight: head.mass * gravity,
        firm: handGains(coupling, 1, body),
        top: handGains(coupling, hands.gripTension, body),
        bottom: handGains(coupling, hands.bottomGrip, body),
    };
    const reach = computeReach(plain);
    const reached: PreparedTrack = { ...plain, reach };
    if (arc.mode === "swing") {
        return { ...reached, free: computeFree(reached, head, gravity) };
    }
    if (reach === null || !(reach.tStop > reach.t1)) {
        return reached;
    }
    // The follow-through ends low (Riches): the head's lowest point reaches groundDepth below the turf.
    const end = headLowestPoint(headOnPath(reached, head, reach.tStop), head);
    return { ...reached, reach: { ...reach, descent: Math.max(0, end + arc.groundDepth) } };
}

/** The path at one instant: the socket's target and its derivatives, and the head's target orientation and spin. */
export interface PathPoint {
    readonly socket: Vec3;
    readonly socketVelocity: Vec3;
    readonly socketAcceleration: Vec3;
    readonly orientation: Quaternion;
    readonly angularVelocity: Vec3;
    readonly angularAcceleration: Vec3;
    /** The dip's part of the pivot's acceleration, world frame. */
    readonly dipAcceleration: Vec3;
    /** The pendulum's current angular acceleration α (rad/s²). */
    readonly pendulumAcceleration: number;
}

/** The pendulum's θ, ω and α at time t (design §3.2). */
function pendulumAt(track: PreparedTrack, t: number): { theta: number; omega: number; alpha: number } {
    const { arc } = track;
    if (t <= arc.arcStart) {
        return { theta: arc.theta0 + arc.omega0 * t, omega: arc.omega0, alpha: 0 };
    }
    const tw = arc.arcStart + arc.window;
    if (t <= tw) {
        const tau = t - arc.arcStart;
        return {
            theta: track.thetaArc + arc.omega0 * tau + 0.5 * arc.alpha * tau * tau,
            omega: arc.omega0 + arc.alpha * tau,
            alpha: arc.alpha,
        };
    }
    if (arc.mode === "carry") {
        // The slope is held: the rate falls linearly to zero over one more window, then θ holds.
        const u = Math.min(t - tw, arc.window);
        const rate = track.omegaEnd / arc.window;
        return {
            theta: track.thetaEnd + track.omegaEnd * u - 0.5 * rate * u * u,
            omega: track.omegaEnd - rate * u,
            alpha: u < arc.window ? 0 - rate : 0,
        };
    }
    // Swing mode: the free pendulum, interpolated in its table and clamped to its last sample beyond it.
    const free = track.free as FreePendulum;
    const x = (t - free.tw) / FREE_STEP;
    const last = free.theta.length - 1;
    const i = Math.min(Math.floor(x), last - 1);
    const f = Math.min(x - i, 1);
    const th0 = free.theta[i] as number;
    const om0 = free.omega[i] as number;
    const theta = th0 + f * ((free.theta[i + 1] as number) - th0);
    return {
        theta,
        omega: om0 + f * ((free.omega[i + 1] as number) - om0),
        alpha: freeAlpha(track, free, theta, t),
    };
}

/**
 * The path at time t (design §3.2): the pendulum's θ, ω and α, and the pivot with the reach and the dip, carried to
 * the socket and the head's orientation. Evaluates sinCos(θ) and sinCos(θ/2) (in swing mode after the window,
 * freeAlpha evaluates sinCos(θ) and the pivot once more).
 */
export function pathAt(track: PreparedTrack, t: number): PathPoint {
    const { arc } = track;
    const { theta, omega, alpha } = pendulumAt(track, t);
    const pivot = pivotAt(track, t);
    const dip = dipAt(track, t);
    const P = sub(pivot.P, vec3(0, 0, dip.z));
    const V = sub(pivot.V, vec3(0, 0, dip.v));
    const A = sub(pivot.A, vec3(0, 0, dip.a));
    const [s, c] = sinCos(theta);
    const radial = sub(scale(arc.aim, s), scale(UP, c));
    const tangent = add(scale(arc.aim, c), scale(UP, s));
    const r = arc.radius;
    return {
        socket: add(P, scale(radial, r)),
        socketVelocity: add(V, scale(tangent, r * omega)),
        socketAcceleration: sub(add(A, scale(tangent, r * alpha)), scale(radial, r * omega * omega)),
        orientation: multiply(pitch(track.axis, theta), track.base),
        angularVelocity: scale(track.axis, omega),
        angularAcceleration: scale(track.axis, alpha),
        dipAcceleration: vec3(0, 0, 0 - dip.a),
        pendulumAcceleration: alpha,
    };
}

/**
 * The head with its socket on the path at time t, moving with the path's rigid motion: its centre at p + d,
 * d = q_path(−socket), with velocity v_p + ω × d and the path's spin.
 */
export function headOnPath(track: PreparedTrack, head: MalletHead, t: number): HeadState {
    const p = pathAt(track, t);
    const d = rotate(p.orientation, sub(vec3(0, 0, 0), head.socket));
    return {
        position: add(p.socket, d),
        orientation: p.orientation,
        velocity: add(p.socketVelocity, cross(p.angularVelocity, d)),
        angularVelocity: p.angularVelocity,
    };
}

/** True inside a check: the pendulum's window with α < 0 (design §3.3). */
export function inCheck(track: PreparedTrack, t: number): boolean {
    const { arc } = track;
    return arc.alpha < 0 && t >= arc.arcStart && t <= arc.arcStart + arc.window;
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/engine/impact/track.test.ts`
Expected: PASS, 27 tests. The free pendulum's small-angle case printed 2.2e-6 of θ₀ while drafting (bound 1.5e-5, the
sum of two known errors, given in the test). If a tolerance fails by a small factor, print the figure and report it;
do not loosen it silently.

Run: `npm test`
Expected: all pass, 27 more than after Task 2.

- [ ] **Step 7: Format, check, commit**

```bash
npx prettier --write src/engine/impact/types.ts src/engine/impact/track.ts \
    tests/engine/support/impact.ts tests/engine/impact/track.test.ts
```

Expected: every file unchanged (the code above is prettier's output; pre-flight D3.2).

Run: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`
Expected: all pass.

```bash
git add src/engine/impact/types.ts src/engine/impact/track.ts \
    tests/engine/support/impact.ts tests/engine/impact/track.test.ts
```

Write the message to `msg.txt` in the session's temp directory, then commit with `git commit -F <that literal path>`
(not `"$CLAUDE_TEMP_DIR/…"`: worktree sessions refuse the variable, pre-flight D10.2), the sandbox disabled for
signing. Check with `git log -1 "--format=%G? %h"` (expect `G`).

```text
Add the swing path: two arcs, modes, reach, free pendulum, swung body

The tracked drive's path as pure functions (P2b.2b.1 design §3.1-§3.4):
the pendulum and the hands' path, each before, during and after its
window; swing mode's free pendulum after the window, tabulated by
semi-implicit Euler; carry mode's held slope; the hands' reach and, in
carry mode, the descent to groundDepth; the dip; the head rigid on the
shaft; the swung body (head and arm mass) and its effective mass at
the face centre. Nothing in the engine reads them yet.
```

---
### Task 4: The two hands in the integrator; the track end rule

Spec §3.3 (the hand load), §3.5 (the end rule) and §3.7 (`hand`, `release`). `handLoad` applies the two hands to the
swung body exactly as spec §3.3 states: before `relaxAt` both firm, the rigid path's wrench split over them with
springs and dampers; from it velocity tracking only, the top hand γ_T times its share (the whole F_s in swing mode
outside a check) plus the dip in full, the bottom hand a rate guide (swing) or a two-sided grip (carry) until it opens
by reach. `integrate` steps the swung body for a tracked drive and the head alone for a force table, bit-identically.
A tracked impact ends on the force-table conditions, both windows and the dip standing for the drive window, once the
head is neither closing on a ball nor would reach one within `LOOK_AHEAD`; its cap is `TRACK_IMPACT_CAP` after
`contactAt`. The tests use isolated set-ups (`integrate` directly): `ContactState.drive` stays force-only until Task 5.

**Files:**
- Modify: `src/engine/impact/track.ts`, `src/engine/impact/types.ts`, `src/engine/impact/integrate.ts`
- Create: `tests/engine/impact/hands.test.ts`

**Interfaces:**
- Consumes: Task 3's `PreparedTrack`, `SwungBody`, `pathAt`, `headOnPath`, `inCheck`, `prepareTrack`,
  `swingOrientation`, the support's `TEST_COUPLING`, `TEST_HANDS`, `NO_DIP`, `trackDrive`, `levelArc`;
  `contactReference.handCouplingPeriod` and `.handCouplingDampingRatio` (Task 2); Task 1's `ForceDrive` and the digest
  baseline `"<temp>/digest-base.txt"`.
- Produces (track.ts):
  - `HAND_COUPLING: { period: number; dampingRatio: number }` (`as const`);
  - `interface GripState { contactPitch: number | null; releasedAt: number | null; releaseDelta: number }` (mutable,
    one per run) and `newGripState(): GripState`;
  - `interface HandLoad { force; feedForward; torque; top; bottom: Vec3 }`, `torque` about the head's centre: each
    hand's force's moment at its grip plus the bottom hand's couple;
  - `handLoad(track: PreparedTrack, state: HeadState, head: MalletHead, t: number, grip: GripState): HandLoad`;
  - (module-private) `FORWARD` and `checkShare(rate, planned)`, the share of a check's planned deceleration.
- Produces (types.ts): `ImpactRun.release?: { readonly t: number; readonly deltaTheta: number }`.
- Produces (integrate.ts):
  - `TRACK_IMPACT_CAP = 0.45`, counted from `arc.contactAt`; `LOOK_AHEAD = 0.03`;
  - `ImpactSetup.drive: ForceDrive | PreparedTrack`;
  - `ImpactSnapshot.hand?: { force; feedForward; top; bottom: Vec3 }`, after `contacts`, so a force table's snapshot
    keeps its keys and their order;
  - `ImpactOptions.cap` documented as an absolute time overriding either cap.
- Later tasks build on `integrate`'s loop as left here: the drive is `plan` (`setup.drive`), the run's grip state
  `grip`, the step's hand load `hand` (null for a force table), the end test's flag `settled` and the helper
  `stillReaching`; the run's `release` is spread onto `finish`'s result.

Model notes (spec §3.3 read exactly):
- The feed-forward's inertial terms use the head's own body frame (`state.orientation`) and r_h = −δ·s with the head's
  own shaft s, as the prototype does; on the path they equal the path's.
- The dip's force F_d acts at the top grip (spec §3.3: the top hand feeds it in full). Its moment about the swung
  body's centre, (ρ + r − δ)·s × F_d, is not in τ_ff, so from contact a dip on a tilted shaft is not tracked exactly
  in carry mode or inside a check; the carry tracking test below has no dip after contact. Before contact F_d is part
  of the split wrench, so tracking there is exact.
- The release is measured from the first step at or after `relaxAt`, whose shaft angle `grip.contactPitch` records.
- `hands.guideEffort` scales, in swing mode only, the rate guide outside a check and the push after the release; a
  check's guide and carry mode are unscaled. The effort multiplies, so at 1 every figure is the same bit for bit.
- A check brakes the head to rest, not past it (user decision, 2026-10-06; spec §3.3). In swing mode from contact,
  inside a check, the hands apply `checkShare(rate, planned)` of the planned deceleration, rate and planned being the
  head's and the path's pitch rates about n: 1 at or above the path's, 0 at or below rest, rate/planned between. The
  share scales α_path and the socket's tangential r·α, so the feed-forward and its split stay one rigid wrench, and a
  head the strike has slowed keeps its fraction of the path's rate and comes to rest with it. The rate guide's target
  is the head's rate held within [0, ω_path]. A share of 1 takes the path's accelerations as they are and the guide
  outside a check keeps `dot(spinLag, n)`, so every stroke without a check, and a check on a head on its path, is
  unchanged bit for bit.

- [ ] **Step 1: Write the failing tests**

Create `tests/engine/impact/hands.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ZERO, add, cross, dot, length, scale, sub, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import {
    IMPACT_DT,
    LOOK_AHEAD,
    RELEASE_STEPS,
    TRACK_IMPACT_CAP,
    integrate,
    type ImpactBall,
    type ImpactProbe,
    type ImpactSnapshot,
} from "../../../src/engine/impact/integrate";
import { multiply, rotate, rotateInverse, type Quaternion } from "../../../src/engine/impact/rigidBody";
import {
    HAND_COUPLING,
    handLoad,
    headOnPath,
    newGripState,
    pathAt,
    prepareTrack,
    swingOrientation,
    type GripState,
    type HandLoad,
    type PreparedTrack,
    type Reach,
} from "../../../src/engine/impact/track";
import type { Coupling, Hands, HeadState, SwingArc } from "../../../src/engine/impact/types";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import { contactReference } from "../../../src/reference/index";
import { TEST_BALL } from "../support/fixtures";
import {
    NO_DIP,
    TEST_COUPLING,
    TEST_HANDS,
    TEST_HEAD,
    freeBall,
    isolated,
    levelArc,
    recorder,
    socketAt,
    trackDrive,
} from "../support/impact";

const R = TEST_BALL.radius;
const AIM = vec3(0.6, 0.8, 0);
const UP = vec3(0, 0, 1);

/** The test hands with an arm mass, so the integrator steps a swung body that is not the head. */
const ARMED: Hands = { ...TEST_HANDS, armMass: 0.8 };

/** The test coupling relaxing only after every run here: the whole run is before contact, the grips firm. */
const BEFORE: Coupling = { ...TEST_COUPLING, relaxAt: 1 };

const conj = (q: Quaternion): Quaternion => ({ w: q.w, x: -q.x, y: -q.y, z: -q.z });
const dist = (a: Vec3, b: Vec3): number => length(sub(a, b));

/** Rotation angle (rad) taking orientation b to a: twice the size of the vector part of a ⊗ conj(b). */
function angleBetween(a: Quaternion, b: Quaternion): number {
    const e = multiply(a, conj(b));
    return 2 * length(vec3(e.x, e.y, e.z));
}

/** A coasting swing, the face pitched 0.3 rad down at t = 0, the pivot still. */
const COAST: SwingArc = {
    pivot: vec3(2, 3, 1.5),
    pivotVelocity: ZERO,
    pivotAcceleration: ZERO,
    handStart: 0,
    handWindow: 0.01,
    aim: AIM,
    radius: 0.8,
    theta0: -0.3,
    omega0: 3.75,
    alpha: 0,
    arcStart: 0,
    window: 0.01,
    dip: NO_DIP,
    contactAt: 0,
    mode: "swing",
    handReach: 10,
    groundDepth: 0,
};

/** A power roll in carry mode, each action timed: the pendulum's window from 10 ms, the hands' from 20 ms, a dip. */
const TIMED: SwingArc = {
    ...COAST,
    pivotVelocity: scale(AIM, 2.5),
    pivotAcceleration: scale(AIM, 20),
    handStart: 0.02,
    handWindow: 0.03,
    theta0: -0.6,
    omega0: 0.5,
    alpha: 4,
    arcStart: 0.01,
    window: 0.03,
    dip: { start: 0.005, duration: 0.02, depth: 0.01 },
    mode: "carry",
};

/** A carry from contact: the pendulum's window short, no dip, a reach that binds and a descent to 2 mm deep. */
const CARRY: SwingArc = {
    ...TIMED,
    pivot: vec3(2, 3, 0.8),
    window: 0.01,
    dip: NO_DIP,
    handReach: 0.15,
    groundDepth: 0.002,
};

const prepare = (arc: SwingArc, coupling: Coupling = TEST_COUPLING, hands: Hands = TEST_HANDS): PreparedTrack =>
    prepareTrack(trackDrive(arc, coupling, hands), TEST_HEAD, STANDARD_GRAVITY);

/** A still, level swing for the test head centred at (0, 0, 1); `o` overrides. */
const still = (o: Partial<SwingArc> = {}): SwingArc => levelArc(vec3(0, 0, 1), o);

interface TrackingOptions {
    readonly coupling?: Coupling;
    readonly hands?: Hands;
    readonly dt?: number;
    /** Absent: the integrator's own cap, contactAt + TRACK_IMPACT_CAP (pre-flight D4.1). */
    readonly cap?: number;
}

/** The largest socket (m) and orientation (rad) errors from the path over an isolated run with no ball. */
function tracking(arc: SwingArc, o: TrackingOptions = {}) {
    const track = prepare(arc, o.coupling ?? BEFORE, o.hands ?? ARMED);
    let socket = 0;
    let angle = 0;
    const probe: ImpactProbe = {
        step(s) {
            const p = pathAt(track, s.t);
            socket = Math.max(socket, dist(socketAt(s.head, TEST_HEAD), p.socket));
            angle = Math.max(angle, angleBetween(p.orientation, s.head.orientation));
        },
    };
    const start = headOnPath(track, TEST_HEAD, 0);
    const run = integrate(isolated({ start, drive: track, gravity: STANDARD_GRAVITY }), {
        probe,
        ...(o.dt === undefined ? {} : { dt: o.dt }),
        ...(o.cap === undefined ? {} : { cap: o.cap }),
    });
    return { socket, angle, run };
}

describe("a tracked head with no ball", () => {
    it("reads its provisional coupling from the reference data", () => {
        expect(HAND_COUPLING).toEqual({
            period: contactReference.handCouplingPeriod.value,
            dampingRatio: contactReference.handCouplingDampingRatio.value,
        });
    });

    it("follows a coasting swing before contact, to the integrator's own error", () => {
        const { socket, angle } = tracking(COAST);
        // Drafting measured 1.71e-7 m and 1.15e-7 rad (pre-flight re-measures them).
        expect(socket).toBeLessThan(4e-7);
        expect(angle).toBeLessThan(3e-7);
    });

    it("follows a power roll's arcs and a timed dip before contact", () => {
        const { socket, angle } = tracking(TIMED);
        // Drafting measured 2.53e-6 m and 2.33e-6 rad, halving exactly at dt/2: the integrator's O(dt) error on the
        // dip's steps in acceleration (pre-flight D4.2; re-measured in pre-flight).
        expect(socket).toBeLessThan(5e-6);
        expect(angle).toBeLessThan(5e-6);
    });

    it("converges on a full check as the step shrinks: the residual is the integrator's", () => {
        const check: SwingArc = { ...COAST, alpha: -COAST.omega0 / COAST.window };
        // Before contact over 60 ms, and from contact in swing mode through the check's window. Drafting measured
        // ratios of 0.504 and 0.500: semi-implicit Euler's O(dt·a) lag.
        for (const o of [
            { coupling: BEFORE, cap: 0.06 },
            { coupling: TEST_COUPLING, cap: COAST.window },
        ]) {
            const coarse = tracking(check, { ...o, dt: 1e-5 });
            const fine = tracking(check, { ...o, dt: 5e-6 });
            expect(fine.socket).toBeLessThan(0.6 * coarse.socket);
            expect(fine.angle).toBeLessThan(0.6 * coarse.angle);
        }
    });

    it("checks a head the strike has slowed to rest with the path, at the window's end and never past it", () => {
        // User decision (2026-10-06): a check brakes the head to rest, not past it. A head pitching at half the path's
        // rate from contact gets half the planned deceleration, so it keeps half the path's rate and rests with it.
        const check: SwingArc = { ...COAST, alpha: -COAST.omega0 / COAST.window };
        const track = prepare(check, TEST_COUPLING, ARMED);
        const slowed = prepare({ ...check, omega0: check.omega0 / 2, alpha: 0 }, TEST_COUPLING, ARMED);
        let drift = 0;
        let lowest = Infinity;
        let last = Infinity;
        const probe: ImpactProbe = {
            step(s) {
                const rate = dot(s.head.angularVelocity, track.axis);
                const planned = dot(pathAt(track, s.t).angularVelocity, track.axis);
                if (planned > 0.1 * check.omega0) {
                    drift = Math.max(drift, Math.abs(rate / planned - 0.5));
                }
                lowest = Math.min(lowest, rate);
                last = rate;
            },
        };
        const start = headOnPath(slowed, TEST_HEAD, 0);
        integrate(isolated({ start, drive: track, gravity: STANDARD_GRAVITY }), { probe, cap: check.window });
        // Pre-flight measured a drift of 2.5e-4 in the share and a last (and lowest) rate of 1.13e-8 rad/s, from
        // 1.875 rad/s; the planned deceleration alone left it at −0.832 rad/s, past rest.
        expect(drift).toBeLessThan(5e-4);
        expect(lowest).toBeGreaterThanOrEqual(0);
        expect(Math.abs(last)).toBeLessThan(3e-8);
    });

    it("runs a whiff to TRACK_IMPACT_CAP after the planned contact", () => {
        for (const contactAt of [0, 0.02]) {
            const { run } = tracking({ ...COAST, contactAt }, { coupling: TEST_COUPLING });
            expect(run.events.map((e) => e.kind)).toEqual(["impact-cap"]);
            expect(run.duration).toBeGreaterThanOrEqual(contactAt + TRACK_IMPACT_CAP);
            expect(run.duration).toBeLessThan(contactAt + TRACK_IMPACT_CAP + 2 * IMPACT_DT);
        }
    });

    it("reports both hands' forces and their feed-forward, equal for a head on the path", () => {
        const track = prepare(COAST, BEFORE, ARMED);
        const probe = recorder();
        const start = headOnPath(track, TEST_HEAD, 0);
        integrate(isolated({ start, drive: track, gravity: STANDARD_GRAVITY }), { probe, cap: 1e-4 });
        const first = probe.snapshots[0] as ImpactSnapshot;
        const hand = first.hand as NonNullable<ImpactSnapshot["hand"]>;
        expect(dist(hand.force, hand.feedForward)).toBeLessThan(1e-9);
        expect(add(hand.top, hand.bottom)).toEqual(hand.force);
        expect(first.drive).toEqual(hand.force);
        const forced = recorder();
        integrate(isolated(), { probe: forced, cap: 1e-4 });
        expect(forced.snapshots[0]).not.toHaveProperty("hand");
    });
});

describe("a carry with firm grips", () => {
    const track = prepare(CARRY, TEST_COUPLING, ARMED);
    const reach = track.reach as Reach;

    it("follows the path from contact to the reach's end, the descent included", () => {
        expect(reach.descent).toBeGreaterThan(0.01);
        const { socket, angle } = tracking(CARRY, { coupling: TEST_COUPLING, cap: reach.tStop });
        // Drafting measured 2.76e-6 m and 5.58e-6 rad (pre-flight re-measures them).
        expect(socket).toBeLessThan(6e-6);
        expect(angle).toBeLessThan(1.2e-5);
    });

    it("holds the slope: the head's pitch stays on the path's held θ to the reach's end", () => {
        const pitchOf = (q: Quaternion): number => {
            const s = rotate(q, UP);
            return Math.atan2(-dot(s, AIM), s.z);
        };
        let worst = 0;
        const probe: ImpactProbe = {
            step(s) {
                if (s.t >= CARRY.arcStart + 2 * CARRY.window) {
                    const lag = pitchOf(s.head.orientation) - pitchOf(pathAt(track, s.t).orientation);
                    worst = Math.max(worst, Math.abs(lag));
                }
            },
        };
        const start = headOnPath(track, TEST_HEAD, 0);
        integrate(isolated({ start, drive: track, gravity: STANDARD_GRAVITY }), { probe, cap: reach.tStop });
        // Within the tracking bound above; drafting measured 5.58e-6 rad.
        expect(worst).toBeLessThan(1.2e-5);
    });
});

/** A damped oscillator from x(0) = x0 at rest, settling to 0. */
function oscillator(x0: number, omega: number, zeta: number, t: number): number {
    const root = Math.sqrt(1 - zeta * zeta);
    const wd = omega * root;
    return x0 * Math.exp(-zeta * omega * t) * (Math.cos(wd * t) + (zeta / root) * Math.sin(wd * t));
}

describe("the hands along the shaft", () => {
    it("return a head lifted 1 mm along the shaft before contact as the damped oscillator of period T", () => {
        // Along the vertical shaft only the top hand's spring and damper act, on the swung body's mass M.
        const track = prepare(still(), BEFORE, ARMED);
        const start = headOnPath(track, TEST_HEAD, 0);
        const lifted = { ...start, position: add(start.position, vec3(0, 0, 1e-3)) };
        const omega = (2 * Math.PI) / BEFORE.period;
        let worst = 0;
        let sideways = 0;
        const probe: ImpactProbe = {
            step(s) {
                const d = sub(socketAt(s.head, TEST_HEAD), pathAt(track, s.t).socket);
                worst = Math.max(worst, Math.abs(d.z - oscillator(1e-3, omega, BEFORE.dampingRatio, s.t)));
                sideways = Math.max(sideways, Math.hypot(d.x, d.y));
            },
        };
        integrate(isolated({ start: lifted, drive: track, gravity: STANDARD_GRAVITY }), { probe, cap: 0.06 });
        // Design §8.1: within 1 % of the amplitude. Drafting measured 2.9e-4 of it.
        expect(worst).toBeLessThan(0.01 * 1e-3);
        expect(sideways).toBeLessThan(1e-12);
    });

    it("let a relaxed top hand sink the head at (1 − γ_T)·m·g/c(γ_T), with no turf", () => {
        // Swing mode from contact, a still level path: the top hand carries γ_T of the weight and damps the rest.
        const track = prepare(still(), TEST_COUPLING, { ...ARMED, gripTension: 0.1 });
        const c = track.top.damping;
        const terminal = ((1 - 0.1) * TEST_HEAD.mass * STANDARD_GRAVITY) / c;
        let worst = 0;
        let spin = 0;
        const probe: ImpactProbe = {
            step(s) {
                const expected = -terminal * (1 - Math.exp((-c * s.t) / track.body.mass));
                worst = Math.max(worst, Math.abs(s.head.velocity.z - expected));
                spin = Math.max(spin, length(s.head.angularVelocity));
            },
        };
        const start = headOnPath(track, TEST_HEAD, 0);
        const run = integrate(isolated({ start, drive: track, gravity: STANDARD_GRAVITY }), { probe });
        // Semi-implicit Euler's error on v' = −(c/M)·v − (1 − γ_T)·m·g/M peaks near (c·dt/M)/2·e⁻¹ of the terminal
        // rate, 6.4e-5 here; drafting measured 6.4e-5. The bound is about 3× that analytic estimate.
        expect(worst).toBeLessThan(2e-4 * terminal);
        expect(run.head.velocity.z).toBeCloseTo(-terminal, 5);
        expect(spin).toBe(0);
    });
});

/** The rigid-path wrench of design §3.3 at t: F_ff, and τ_ff about the swung body's centre. */
function rigidWrench(track: PreparedTrack, t: number): { readonly force: Vec3; readonly torque: Vec3 } {
    const p = pathAt(track, t);
    const { body } = track;
    const w = p.angularVelocity;
    const d = rotate(p.orientation, sub(vec3(0, 0, body.offset), TEST_HEAD.socket));
    const centre = add(add(p.socketAcceleration, cross(p.angularAcceleration, d)), cross(w, cross(w, d)));
    const weight = vec3(0, 0, TEST_HEAD.mass * STANDARD_GRAVITY);
    const I = body.inertia;
    const wb = rotateInverse(p.orientation, w);
    const ab = rotateInverse(p.orientation, p.angularAcceleration);
    const spin = add(vec3(I.x * ab.x, I.y * ab.y, I.z * ab.z), cross(wb, vec3(I.x * wb.x, I.y * wb.y, I.z * wb.z)));
    const head = scale(rotate(p.orientation, UP), -body.offset);
    return {
        force: add(scale(centre, body.mass), weight),
        torque: add(rotate(p.orientation, spin), cross(head, weight)),
    };
}

/** The hand load on a head on the path at t, with a fresh grip state unless one is given. */
function loadOnPath(track: PreparedTrack, t: number, grip: GripState = newGripState()): HandLoad {
    return handLoad(track, headOnPath(track, TEST_HEAD, t), TEST_HEAD, t, grip);
}

/** The dip's force M·a_d at t. */
const dipForce = (track: PreparedTrack, t: number): Vec3 => scale(pathAt(track, t).dipAcceleration, track.body.mass);

describe("the feed-forward split", () => {
    it("sums both hands' shares and the couple to F_ff and τ_ff before contact", () => {
        const track = prepare(TIMED, BEFORE, ARMED);
        for (const t of [0.003, 0.012, 0.03]) {
            const load = loadOnPath(track, t);
            const { force, torque } = rigidWrench(track, t);
            // The torque about the swung body's centre, δ·s above the head's.
            const lever = scale(rotate(headOnPath(track, TEST_HEAD, t).orientation, UP), track.body.offset);
            expect(dist(load.force, force), `force at ${t}`).toBeLessThan(1e-9);
            expect(dist(load.feedForward, force), `feed-forward at ${t}`).toBeLessThan(1e-9);
            expect(dist(sub(load.torque, cross(lever, load.force)), torque), `torque at ${t}`).toBeLessThan(1e-9);
        }
    });

    it("from contact feeds the top hand γ_T of its share plus the dip in full, in carry mode", () => {
        const t = 0.009;
        const track = prepare(TIMED, TEST_COUPLING, ARMED);
        const firm = loadOnPath(track, t);
        const soft = loadOnPath(prepare(TIMED, TEST_COUPLING, { ...ARMED, gripTension: 0.1 }), t);
        const dip = dipForce(track, t);
        expect(length(dip)).toBeGreaterThan(100);
        expect(dist(add(firm.top, firm.bottom), rigidWrench(track, t).force)).toBeLessThan(1e-9);
        expect(dist(sub(soft.top, dip), scale(sub(firm.top, dip), 0.1))).toBeLessThan(1e-9);
        expect(length(firm.bottom)).toBeGreaterThan(1);
    });

    it("feeds the top hand the whole F_s in swing mode outside a check", () => {
        const arc: SwingArc = { ...TIMED, mode: "swing" };
        const t = 0.009;
        const track = prepare(arc, TEST_COUPLING, ARMED);
        const { force } = rigidWrench(track, t);
        const dip = dipForce(track, t);
        for (const gripTension of [0.1, 1]) {
            const load = loadOnPath(prepare(arc, TEST_COUPLING, { ...ARMED, gripTension }), t);
            const expected = add(scale(sub(force, dip), gripTension), dip);
            expect(dist(load.top, expected), `γ_T ${gripTension}`).toBeLessThan(1e-9);
            expect(length(load.bottom), `γ_T ${gripTension}`).toBeLessThan(1e-9);
        }
    });

    it("splits F_s over both hands inside a check, the top hand's share scaled by γ_T", () => {
        const arc: SwingArc = { ...TIMED, mode: "swing", alpha: -4 };
        const t = 0.012;
        const track = prepare(arc, TEST_COUPLING, ARMED);
        const firm = loadOnPath(track, t);
        const soft = loadOnPath(prepare(arc, TEST_COUPLING, { ...ARMED, gripTension: 0.1 }), t);
        const dip = dipForce(track, t);
        expect(dist(add(firm.top, firm.bottom), rigidWrench(track, t).force)).toBeLessThan(1e-9);
        expect(dist(sub(soft.top, dip), scale(sub(firm.top, dip), 0.1))).toBeLessThan(1e-9);
        expect(length(firm.bottom)).toBeGreaterThan(1);
    });

    it("keeps the top hand's share after the bottom hand's release, and drops the bottom hand's", () => {
        const track = prepare(TIMED, TEST_COUPLING, ARMED);
        const t = 0.009;
        const held = loadOnPath(track, t);
        const open: GripState = { contactPitch: TIMED.theta0, releasedAt: 0, releaseDelta: 0.1 };
        const released = loadOnPath(track, t, open);
        expect(dist(released.top, held.top)).toBeLessThan(1e-9);
        expect(length(released.bottom)).toBeLessThan(1e-9);
        expect(dist(released.feedForward, released.top)).toBeLessThan(1e-9);
    });
});

/** The unit vector e: perpendicular to the head's shaft in the swing plane, forward. */
function forwardOf(head: HeadState, aim: Vec3): Vec3 {
    const s = rotate(head.orientation, UP);
    const raw = sub(aim, scale(s, dot(aim, s)));
    return scale(raw, 1 / length(raw));
}

describe("the bottom hand's rate guide", () => {
    const lever = 0.8 - TEST_HANDS.bottom;

    /** A head on the path at t, its pitch rate `extra` faster than the path's. */
    function spun(track: PreparedTrack, t: number, extra: number): HeadState {
        const head = headOnPath(track, TEST_HEAD, t);
        return { ...head, angularVelocity: add(head.angularVelocity, scale(track.axis, extra)) };
    }

    it("never pulls outside a check, and is zero while the shaft turns at least as fast as the path", () => {
        const track = prepare(still(), TEST_COUPLING, TEST_HANDS);
        const t = 0.02;
        for (const extra of [0, 0.5]) {
            const load = handLoad(track, spun(track, t, extra), TEST_HEAD, t, newGripState());
            expect(length(load.bottom), `extra ${extra}`).toBe(0);
        }
        const lagging = spun(track, t, -0.5);
        const load = handLoad(track, lagging, TEST_HEAD, t, newGripState());
        const e = forwardOf(lagging, track.arc.aim);
        expect(dot(load.bottom, e)).toBeCloseTo(track.bottom.damping * 0.5 * lever, 9);
        expect(length(sub(load.bottom, scale(e, dot(load.bottom, e))))).toBeLessThan(1e-12);
    });

    it("acts both ways inside a check and carries g_B·F_B", () => {
        const arc = still({ omega0: 3, alpha: -300 });
        const t = 0.005;
        const track = prepare(arc, TEST_COUPLING, TEST_HANDS);
        const light = prepare(arc, TEST_COUPLING, { ...TEST_HANDS, bottomGrip: 0.25 });
        const on = loadOnPath(track, t);
        expect(length(on.bottom)).toBeGreaterThan(1);
        expect(dist(loadOnPath(light, t).bottom, scale(on.bottom, 0.25))).toBeLessThan(1e-9);
        const leading = spun(track, t, 0.5);
        const fast = handLoad(track, leading, TEST_HEAD, t, newGripState());
        const e = forwardOf(leading, arc.aim);
        expect(dot(sub(fast.bottom, on.bottom), e)).toBeCloseTo(-track.bottom.damping * 0.5 * lever, 6);
    });

    it("inside a check gives a slowed head its share of the planned deceleration, and returns one past rest", () => {
        // User decision (2026-10-06): a check brakes the head to rest, not past it (design §3.3).
        const arc = still({ omega0: 3, alpha: -300 });
        const t = 0.005;
        const track = prepare(arc, TEST_COUPLING, TEST_HANDS);
        const planned = dot(pathAt(track, t).angularVelocity, track.axis);
        const at = (share: number): HandLoad =>
            handLoad(track, spun(track, t, (share - 1) * planned), TEST_HEAD, t, newGripState());
        const [rest, half, full] = [at(0), at(0.5), at(1)];
        // Between rest and the path's rate the deceleration is in proportion and the guide neither pushes nor pulls.
        expect(length(sub(full.feedForward, rest.feedForward))).toBeGreaterThan(1);
        expect(dist(half.feedForward, scale(add(rest.feedForward, full.feedForward), 0.5))).toBeLessThan(1e-9);
        expect(dist(half.bottom, scale(add(rest.bottom, full.bottom), 0.5))).toBeLessThan(1e-9);
        // Past rest none of it, and the guide returns the head towards rest.
        const behind = spun(track, t, -1.2 * planned);
        const back = handLoad(track, behind, TEST_HEAD, t, newGripState());
        expect(dist(back.feedForward, rest.feedForward)).toBeLessThan(1e-9);
        const push = dot(sub(back.bottom, rest.bottom), forwardOf(behind, arc.aim));
        expect(push).toBeCloseTo(track.bottom.damping * 0.2 * planned * lever, 6);
    });

    it("scales the push by guideEffort outside a check and after the release, and leaves a check in full", () => {
        const withEffort = (guideEffort: number): Hands => ({ ...TEST_HANDS, guideEffort });
        const t = 0.02;
        const guided = (guideEffort: number): Vec3 => {
            const track = prepare(still(), TEST_COUPLING, withEffort(guideEffort));
            return handLoad(track, spun(track, t, -0.5), TEST_HEAD, t, newGripState()).bottom;
        };
        expect(length(guided(1))).toBeGreaterThan(0);
        expect(length(guided(0))).toBe(0);
        expect(dist(guided(0.5), scale(guided(1), 0.5))).toBeLessThan(1e-12);
        const released = (guideEffort: number): Vec3 => {
            const track = prepare(still(), TEST_COUPLING, withEffort(guideEffort));
            const head = headOnPath(track, TEST_HEAD, t);
            const slow = { ...head, velocity: sub(head.velocity, vec3(0.5, 0, 0)) };
            const open: GripState = { contactPitch: 0, releasedAt: 1e-3, releaseDelta: 0.08 };
            return handLoad(track, slow, TEST_HEAD, t, open).bottom;
        };
        expect(length(released(1))).toBeGreaterThan(0);
        expect(length(released(0))).toBe(0);
        expect(dist(released(0.5), scale(released(1), 0.5))).toBeLessThan(1e-12);
        const check = still({ omega0: 3, alpha: -300 });
        const checked = (guideEffort: number): Vec3 => {
            const track = prepare(check, TEST_COUPLING, withEffort(guideEffort));
            return handLoad(track, spun(track, 0.005, 0.5), TEST_HEAD, 0.005, newGripState()).bottom;
        };
        expect(length(checked(1))).toBeGreaterThan(1);
        expect(checked(0)).toEqual(checked(1));
    });
});

describe("release by reach", () => {
    const track = prepare(still(), TEST_COUPLING, TEST_HANDS);
    const lever = 0.8 - TEST_HANDS.bottom;

    /** The test head turned rigidly about the still pivot through `turn`, moving at `velocity`. */
    function turned(turn: number, velocity: Vec3 = ZERO): HeadState {
        const orientation = swingOrientation(track.arc.aim, turn);
        const s = rotate(orientation, UP);
        const position = sub(track.arc.pivot, scale(s, track.arc.radius + TEST_HEAD.socket.z));
        return { position, orientation, velocity, angularVelocity: ZERO };
    }

    it("opens the bottom hand once the shaft has turned through the slack, recording when and how far", () => {
        const grip = newGripState();
        handLoad(track, turned(0), TEST_HEAD, 0, grip);
        handLoad(track, turned((TEST_HANDS.reachSlack - 1e-3) / lever), TEST_HEAD, 1e-3, grip);
        expect(grip.releasedAt).toBeNull();
        const turn = (TEST_HANDS.reachSlack + 1e-3) / lever;
        handLoad(track, turned(turn), TEST_HEAD, 2e-3, grip);
        expect(grip.releasedAt).toBe(2e-3);
        expect(grip.releaseDelta).toBeCloseTo(turn, 12);
    });

    it("then pushes only forward along e on its velocity lag, with no feed-forward and no couple", () => {
        const grip: GripState = { contactPitch: 0, releasedAt: 1e-3, releaseDelta: 0.08 };
        const turn = 0.08;
        const e = forwardOf(turned(turn), track.arc.aim);
        const resting = handLoad(track, turned(turn), TEST_HEAD, 2e-3, grip);
        expect(length(resting.bottom)).toBe(0);
        expect(dot(resting.torque, rotate(turned(turn).orientation, UP))).toBeCloseTo(0, 12);
        const pushing = handLoad(track, turned(turn, scale(e, -0.5)), TEST_HEAD, 2e-3, grip);
        expect(dot(pushing.bottom, e)).toBeCloseTo(track.bottom.damping * 0.5, 9);
        expect(length(sub(pushing.bottom, scale(e, dot(pushing.bottom, e))))).toBeLessThan(1e-12);
        const ahead = handLoad(track, turned(turn, scale(e, 0.5)), TEST_HEAD, 2e-3, grip);
        expect(length(ahead.bottom)).toBe(0);
    });

    it("records the release in the run, and none for a force table or a shaft that never turns", () => {
        const omega0 = 3 / 0.832;
        const swing = prepare(still({ omega0 }), TEST_COUPLING, TEST_HANDS);
        const start = headOnPath(swing, TEST_HEAD, 0);
        const run = integrate(isolated({ start, drive: swing, gravity: STANDARD_GRAVITY }));
        const release = run.release as { t: number; deltaTheta: number };
        // It opens within one step's turn of the slack; drafting measured it 3.3e-6 m over at t = 20.82 ms.
        const over = lever * release.deltaTheta - TEST_HANDS.reachSlack;
        expect(over).toBeGreaterThan(0);
        expect(over).toBeLessThan(omega0 * IMPACT_DT * lever);
        const rest = headOnPath(track, TEST_HEAD, 0);
        const resting = integrate(isolated({ start: rest, drive: track, gravity: STANDARD_GRAVITY }));
        expect(resting).not.toHaveProperty("release");
        expect(integrate(isolated(), { cap: 1e-4 })).not.toHaveProperty("release");
    });
});

describe("the tracked end rule", () => {
    const BALL = vec3(0, 0, 1);
    const START = vec3(BALL.x - R - 1e-6 - TEST_HEAD.length / 2, 0, BALL.z);
    const RED = vec3(BALL.x + 2 * R, 0, BALL.z);

    /** A level 3 m/s swing (gravity off) into the balls, its face 1 µm short of the ball at BALL. */
    function strikeRun(balls: ImpactBall[], cap?: number) {
        const arc = levelArc(START, { omega0: 3 / (0.8 + TEST_HEAD.socket.z) });
        const track = prepareTrack(trackDrive(arc), TEST_HEAD, 0);
        const probe = recorder();
        const setup = isolated({ start: headOnPath(track, TEST_HEAD, 0), drive: track, balls });
        const run = integrate(setup, { probe, ...(cap === undefined ? {} : { cap }) });
        return { arc, track, run, probe };
    }

    /** True while the front face would reach the ball within LOOK_AHEAD (design §3.5), as the snapshot stands. */
    function reaching(track: PreparedTrack, s: ImpactSnapshot): boolean {
        const p = pathAt(track, s.t);
        const onPath = add(
            p.socketVelocity,
            cross(p.angularVelocity, rotate(p.orientation, scale(TEST_HEAD.socket, -1))),
        );
        const f = rotate(s.head.orientation, vec3(1, 0, 0));
        const ball = s.balls[0] as (typeof s.balls)[number];
        const offset = sub(ball.position, add(s.head.position, scale(f, TEST_HEAD.length / 2)));
        const d = dot(offset, f);
        const ahead = d > 0 && length(sub(offset, scale(f, d))) < TEST_HEAD.radius + R;
        const closing = Math.max(dot(s.head.velocity, f), dot(onPath, f)) - dot(ball.velocity, f);
        return ahead && closing > 0 && d - R < closing * LOOK_AHEAD;
    }

    it("ends a clean single-ball strike within RELEASE_STEPS of the window's end or the look-ahead clearing", () => {
        const { arc, track, run, probe } = strikeRun([freeBall("blue", BALL)]);
        expect(run.timeline["face/blue"] ?? []).toHaveLength(1);
        const clear = Math.max(0, ...probe.snapshots.filter((s) => reaching(track, s)).map((s) => s.t));
        // Drafting: the look-ahead clears at 0.41 ms and the impact ends at the window's end, 10 ms.
        const settled = Math.max(arc.arcStart + arc.window, clear);
        expect(run.duration).toBeGreaterThanOrEqual(settled);
        expect(run.duration).toBeLessThanOrEqual(settled + (RELEASE_STEPS + 1) * IMPACT_DT);
        expect(run.events).toEqual([]);
    });

    it("integrates a straight croquet drive's re-contact rather than flagging it", () => {
        const { run } = strikeRun([freeBall("blue", BALL), freeBall("red", RED)]);
        // Drafting: five face–blue intervals, the second from 1.1 ms, the last a maintained push until the face,
        // pitching up with the gravity-free swing, leaves blue (impact-off-face at 74 ms); the impact ends at 120.5 ms.
        expect((run.timeline["face/blue"] ?? []).length).toBeGreaterThanOrEqual(2);
        const kinds = run.events.map((e) => e.kind);
        expect(kinds).not.toContain("impact-head-approaching");
        expect(kinds).not.toContain("impact-cap");
    });

    it("keeps running while the head closes on a ball, and flags it if the cap comes first", () => {
        // At 2.5 ms the head, slowed below blue by the strike, is closing on it again (drafting: 2.34–3.17 ms).
        const { run } = strikeRun([freeBall("blue", BALL), freeBall("red", RED)], 2.5e-3);
        expect(run.events.map((e) => e.kind)).toEqual(["impact-cap", "impact-head-approaching"]);
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/engine/impact/hands.test.ts`
Expected: FAIL, 26 tests. `HAND_COUPLING` is undefined (`AssertionError: expected undefined to deeply equal
{ period: 0.08, dampingRatio: 0.7 }`); `handLoad` and `newGripState` are not exported (`TypeError: handLoad is not a
function`, `TypeError: newGripState is not a function`); every `integrate` run with a prepared track throws inside
`integrate`, which still reads the samples (`TypeError: Cannot read properties of undefined (reading 'length')`).
`npm run check` reports the missing exports, the `ImpactSetup.drive` type, `hand` not on `ImpactSnapshot` and
`release` not on `ImpactRun`.

- [ ] **Step 3: Add the coupling and the hand load to `track.ts`**

Replace the two imports

```ts
import { atan2, sinCos } from "../math/elementary";
import { add, cross, dot, scale, sub, vec3, type Vec3 } from "../math/vec3";
```

with:

```ts
import { contactReference } from "../../reference/index";
import { atan2, sinCos } from "../math/elementary";
import { ZERO, add, cross, dot, scale, sub, vec3, type Vec3 } from "../math/vec3";
```

Replace `const UP = vec3(0, 0, 1);` with:

```ts
const UP = vec3(0, 0, 1);
const FORWARD = vec3(1, 0, 0);

/**
 * The hands' coupling, period (s) and damping ratio of a firm grip (design §3.4). Provisional, a user decision
 * (reference/contact.json); P2b.2b.2 fits it.
 */
export const HAND_COUPLING = {
    period: contactReference.handCouplingPeriod.value,
    dampingRatio: contactReference.handCouplingDampingRatio.value,
} as const;
```

Append at the end of the file, after `inCheck`:

```ts
/**
 * The share of a check's planned deceleration the hands apply to a head pitching at `rate` (rad/s) about n, the path
 * at `planned` (design §3.3): all of it at or above the path's rate, none at or below rest, and rate/planned between
 * them. A head the strike has slowed then keeps its fraction of the path's rate, so it comes to rest when the path
 * does (a full check's window's end) and never passes rest.
 */
function checkShare(rate: number, planned: number): number {
    if (rate <= 0) {
        return 0;
    }
    if (rate >= planned) {
        return 1;
    }
    return rate / planned;
}

/**
 * One integrate run's grip state (design §3.3): the shaft's arc angle at relaxAt, and when the bottom hand opened and
 * the shaft's turn since relaxAt then. Mutable; handLoad updates it.
 */
export interface GripState {
    contactPitch: number | null;
    releasedAt: number | null;
    releaseDelta: number;
}

/** A grip state for a new run: no contact yet, the bottom hand closed. */
export function newGripState(): GripState {
    return { contactPitch: null, releasedAt: null, releaseDelta: 0 };
}

/** The hands' load in one step (design §3.3, §3.7), world frame. */
export interface HandLoad {
    /** F: both hands' forces. */
    readonly force: Vec3;
    /** F's feed-forward parts. */
    readonly feedForward: Vec3;
    /** About the head's centre: each hand's force's moment at its grip, and the bottom hand's couple. */
    readonly torque: Vec3;
    /** Each hand's force. */
    readonly top: Vec3;
    readonly bottom: Vec3;
}

/** θ_err = 2·sign(w)·vec(target ⊗ q̄), w the product's scalar part: the rotation taking q to `target` (world frame). */
function rotationError(target: Quaternion, q: Quaternion): Vec3 {
    const e = multiply(target, { w: q.w, x: 0 - q.x, y: 0 - q.y, z: 0 - q.z });
    const k = e.w < 0 ? -2 : 2;
    return vec3(k * e.x, k * e.y, k * e.z);
}

/** π(s) = atan2(−s·aim, s·ẑ): the arc angle of a shaft along `s`. */
function shaftPitch(s: Vec3, aim: Vec3): number {
    return atan2(0 - dot(s, aim), s.z);
}

/** The part of `v` perpendicular to the unit `s`. */
function across(v: Vec3, s: Vec3): Vec3 {
    return sub(v, scale(s, dot(v, s)));
}

/**
 * The hands' load on the head in `state` at time t (design §3.3), updating `grip`. The feed-forward is the wrench
 * that makes the path's rigid motion exact for the swung body: F_ff = M·a_c + m·g·ẑ and, about its centre,
 * τ_ff = I'·α_path + ω_path × (I'·ω_path) + r_h × m·g·ẑ. From relaxAt the dip's part F_d = M·a_d is set aside and
 * the rest, F_s, split over the hands so that their moments give τ_ff: the top hand F_∥ + F_T⊥, the bottom hand F_B
 * and the couple τ_ff·s. Before relaxAt both hands grip firmly with springs and dampers. From it they track the
 * path's velocity only: the top hand γ_T times its share (the whole F_s in swing mode outside a check) plus F_d, and
 * its damper; the bottom hand a one-sided rate guide (swing mode; with g_B·F_B inside a check) or a two-sided grip
 * (carry mode), until it opens once the shaft has turned through the reach slack. In swing mode the guide outside a
 * check and the push after the release are scaled by `guideEffort`; a check acts in full. A check in swing mode
 * brakes the head to rest, not past it: the hands apply the head's share of the planned deceleration (checkShare), and
 * the guide steers its pitch rate into [0, ω_path].
 */
export function handLoad(
    track: PreparedTrack,
    state: HeadState,
    head: MalletHead,
    t: number,
    grip: GripState,
): HandLoad {
    const { arc, body, hands } = track;
    const path = pathAt(track, t);
    const w = path.angularVelocity;
    const q = state.orientation;
    const s = rotate(q, UP);
    const rho = head.socket.z;
    const contact = t >= track.coupling.relaxAt;
    const carry = arc.mode === "carry";
    // A check in swing mode after contact brakes the head to rest, not past it: the pitch rates about n.
    const checking = contact && !carry && inCheck(track, t);
    const rate = dot(state.angularVelocity, track.axis);
    const planned = dot(w, track.axis);
    const share = checking ? checkShare(rate, planned) : 1;
    let socketAcceleration = path.socketAcceleration;
    let angularAcceleration = path.angularAcceleration;
    if (share < 1) {
        // The planned deceleration's parts, r·α along the path's tangent at the socket and α_path, scaled.
        const shed = (1 - share) * arc.radius * path.pendulumAcceleration;
        socketAcceleration = sub(socketAcceleration, scale(rotate(path.orientation, FORWARD), shed));
        angularAcceleration = scale(angularAcceleration, share);
    }
    // The swung body's centre on the path, from the socket: body point δ·ẑ − socket.
    const d = rotate(path.orientation, sub(vec3(0, 0, body.offset), head.socket));
    const centre = add(add(socketAcceleration, cross(angularAcceleration, d)), cross(w, cross(w, d)));
    const weight = vec3(0, 0, track.headWeight);
    const feedForward = add(scale(centre, body.mass), weight);
    const I = body.inertia;
    const wb = rotateInverse(q, w);
    const ab = rotateInverse(q, angularAcceleration);
    const spin = add(vec3(I.x * ab.x, I.y * ab.y, I.z * ab.z), cross(wb, vec3(I.x * wb.x, I.y * wb.y, I.z * wb.z)));
    // The hands hold the head's weight, which acts at the head's centre, r_h = −δ·s from the swung body's.
    const tau = add(rotate(q, spin), cross(scale(s, 0 - body.offset), weight));
    const dip = contact ? scale(path.dipAcceleration, body.mass) : ZERO;
    const shared = sub(feedForward, dip);
    const along = scale(s, dot(shared, s));
    const perpendicular = sub(shared, along);
    const G = cross(tau, s);
    const a = rho + arc.radius - body.offset;
    const b = rho + hands.bottom - body.offset;
    const topShare = add(along, scale(sub(G, scale(perpendicular, b)), 1 / (a - b)));
    const bottomShare = scale(sub(scale(perpendicular, a), G), 1 / (a - b));
    const twistShare = dot(tau, s);
    // The grips and their targets on the path.
    const topArm = scale(s, rho + arc.radius);
    const bottomArm = scale(s, rho + hands.bottom);
    const shaft = rotate(path.orientation, UP);
    const topLever = scale(shaft, arc.radius);
    const bottomLever = scale(shaft, hands.bottom);
    const topLag = sub(
        add(path.socketVelocity, cross(w, topLever)),
        add(state.velocity, cross(state.angularVelocity, topArm)),
    );
    const bottomLag = sub(
        add(path.socketVelocity, cross(w, bottomLever)),
        add(state.velocity, cross(state.angularVelocity, bottomArm)),
    );
    const spinLag = sub(w, state.angularVelocity);
    const load = (top: Vec3, bottom: Vec3, twist: number, fed: Vec3): HandLoad => ({
        force: add(top, bottom),
        feedForward: fed,
        torque: add(add(cross(topArm, top), cross(bottomArm, bottom)), scale(s, twist)),
        top,
        bottom,
    });

    if (!contact) {
        const g = track.firm;
        const topGap = sub(add(path.socket, topLever), add(state.position, topArm));
        const bottomGap = sub(add(path.socket, bottomLever), add(state.position, bottomArm));
        const top = add(add(topShare, scale(topGap, g.stiffness)), scale(topLag, g.damping));
        const pull = add(scale(bottomGap, g.stiffness), scale(bottomLag, g.damping));
        const twist =
            twistShare +
            g.twistStiffness * dot(rotationError(path.orientation, q), s) +
            g.twistDamping * dot(spinLag, s);
        return load(top, add(bottomShare, across(pull, s)), twist, add(topShare, bottomShare));
    }

    // Release by reach: the bottom hand opens for good once the shaft has turned through the slack since relaxAt.
    const pitchNow = shaftPitch(s, arc.aim);
    const contactPitch = grip.contactPitch ?? pitchNow;
    grip.contactPitch = contactPitch;
    const lever = arc.radius - hands.bottom;
    if (grip.releasedAt === null && lever * (pitchNow - contactPitch) > hands.reachSlack) {
        grip.releasedAt = t;
        grip.releaseDelta = pitchNow - contactPitch;
    }
    // The player's effort on swing mode's push after contact (design §3.3): 1 restores the planned arc's speed.
    const effort = carry ? 1 : hands.guideEffort;
    const firmShare = carry || checking;
    const topFed = add(scale(firmShare ? topShare : shared, hands.gripTension), dip);
    const top = add(topFed, scale(topLag, track.top.damping));
    const g = track.bottom;
    // e: perpendicular to the shaft in the swing plane, forward.
    const raw = across(arc.aim, s);
    const e = scale(raw, 1 / Math.sqrt(dot(raw, raw)));
    if (grip.releasedAt !== null) {
        return load(top, scale(e, effort * Math.max(0, g.damping * dot(bottomLag, e))), 0, topFed);
    }
    const bottomFed = firmShare ? scale(bottomShare, hands.bottomGrip) : ZERO;
    const twist = (firmShare ? hands.bottomGrip * twistShare : 0) + g.twistDamping * dot(spinLag, s);
    if (carry) {
        return load(top, add(bottomFed, across(scale(bottomLag, g.damping), s)), twist, add(topFed, bottomFed));
    }
    // Swing mode: a rate guide along e on the pitch rate's lag, never pulling outside a check. Inside one its target is
    // the head's own rate held within [0, ω_path]: it brakes a head ahead of the path, returns one past rest towards
    // rest, and leaves one between them to its share of the planned deceleration.
    const held = Math.min(Math.max(rate, 0), Math.max(planned, 0));
    const guide = g.damping * (checking ? held - rate : dot(spinLag, track.axis)) * lever;
    const bottom = add(bottomFed, scale(e, firmShare ? guide : effort * Math.max(0, guide)));
    return load(top, bottom, twist, add(topFed, bottomFed));
}
```

- [ ] **Step 4: Record the release in `ImpactRun`**

In `src/engine/impact/types.ts`, replace the end of `ImpactRun`

```ts
    /** Keys of the ball–ball and ball–obstacle pairs touching (within CONTACT_TOLERANCE) at t = 0, in pair order. */
    readonly touchingAtStart: readonly string[];
}
```

with:

```ts
    /** Keys of the ball–ball and ball–obstacle pairs touching (within CONTACT_TOLERANCE) at t = 0, in pair order. */
    readonly touchingAtStart: readonly string[];
    /**
     * A tracked drive's bottom hand opening by reach (P2b.2b.1 design §3.3): when (s), and the shaft's turn since
     * relaxAt (contact) then (rad). Absent if it never opened, and for a force table.
     */
    readonly release?: { readonly t: number; readonly deltaTheta: number };
}
```

- [ ] **Step 5: Drive the integrator with it**

In `src/engine/impact/integrate.ts`:

In the file header, replace items 1 and 2

```ts
 * 1. computes every force from the current state: the drive (at the socket) and gravity, then each closed pair in
 *    pair-list order;
 * 2. updates every velocity from those forces, the head's spin through Euler's equations in its body frame;
```

with:

```ts
 * 1. computes every force from the current state: the hands' load (a force table at the socket, or a tracked drive's
 *    two hands, track.ts) and gravity, then each closed pair in pair-list order;
 * 2. updates every velocity from those forces, the head's spin through Euler's equations in its body frame (for a
 *    tracked drive, the swung body's: the head and the arm mass, P2b.2b.1 design §3.3);
```

and after the end-rule paragraph's last line,
` * balls any state and leave the turf out; simulateImpact.ts prepares and validates real ones.`, insert:

```ts
 *
 * A tracked drive (P2b.2b.1 design §3.5) ends on the same conditions, both arcs' windows and the dip standing for the
 * drive window, and only once the head is neither closing on any ball within reach (headClosing) nor would reach one
 * ahead of its face within LOOK_AHEAD: a re-contact is integrated, not flagged. Its cap is TRACK_IMPACT_CAP after the
 * planned contact.
```

Add the track import after the timeline import (the types import already names `ForceDrive`, from Task 1; leave it as
it is, pre-flight D4.5):

```ts
import { handLoad, newGripState, pathAt, type HandLoad, type PreparedTrack, type SwungBody } from "./track";
```

Replace everything from `export const IMPACT_CAP = 0.06;` to `const WAKE_MARGIN = 1e-9;` (IMPACT_CAP's value, the
WAKE_MARGIN comment and constant) with the block below. It keeps IMPACT_CAP, adds TRACK_IMPACT_CAP and LOOK_AHEAD,
rewraps the WAKE_MARGIN comment within 120 columns (pre-flight D4.4) and adds `UP`:

```ts
export const IMPACT_CAP = 0.06;

/**
 * Longest impact (s) of a tracked drive after its planned contact (P2b.2b.1 design §3.5), a user decision
 * (2026-10-05). After the strike the bottom hand's rate guide steers the head back towards the planned arc, so a
 * drive's follow-through catches the striker's ball again (four hits in all at 2 m/s); the cap lets every re-hit be
 * integrated. In the preset sweep the longest impact that ends by itself is a drive's, 314.6 ms after contact
 * (pre-flight; 324.8 ms before the check to rest); 0.45 s is about 43 % over it. A force table keeps IMPACT_CAP.
 */
export const TRACK_IMPACT_CAP = 0.45;

/**
 * Horizon (s) of the tracked end rule's look-ahead (design §3.5): the impact runs on while the front face would reach
 * a ball ahead of it within this time. A modelling bound, not physical: a head slowed below the striker's ball by the
 * strike, catching it again, is integrated.
 */
export const LOOK_AHEAD = 0.03;

/**
 * Slack (m) subtracted from a ball–obstacle pair's gap before it is skipped (see the file header). Numerical, not
 * physical: it covers the drift between a ball's summed path length (the travel sum's own rounding included) and its
 * rounded position updates. A step rounds each horizontal coordinate by at most half an ulp (about 2e-15 m on a
 * full-size lawn), so the ball's distance from an obstacle by at most √2 times that per step. The drift accumulates
 * over the run's steps: at the default IMPACT_DT and IMPACT_CAP (12,000 steps) it stays near 1e-11 m, so the margin
 * keeps about 100× headroom. A tracked drive's longest run, a 60 ms lead-in and TRACK_IMPACT_CAP (102,000 steps),
 * would reach about 8.5e-11 m at the same rate, about 12× headroom; planning measured at most 2.3e-11 m over the
 * preset sweep's capped runs, 1.5e-11 m over a 102,000-step one (pre-flight confirms it, P2b.2b.1 design §3.5). A
 * test's finer step, on coordinates under 1 m, drifts less.
 */
const WAKE_MARGIN = 1e-9;

const UP = vec3(0, 0, 1);
```

In `ImpactSetup`, replace `    readonly drive: ForceDrive;` with:

```ts
    /** The hands: a force table, or a tracked drive prepared once (track.ts). */
    readonly drive: ForceDrive | PreparedTrack;
```

Replace `ImpactSnapshot`

```ts
export interface ImpactSnapshot {
    readonly t: number;
    readonly drive: Vec3;
    readonly head: HeadState;
    /** In setup order. */
    readonly balls: readonly BallState[];
    readonly contacts: readonly ContactSample[];
}
```

with:

```ts
export interface ImpactSnapshot {
    readonly t: number;
    /** The hands' force: the force table's value, or a tracked drive's F. */
    readonly drive: Vec3;
    readonly head: HeadState;
    /** In setup order. */
    readonly balls: readonly BallState[];
    readonly contacts: readonly ContactSample[];
    /** A tracked drive's F, its feed-forward parts and each hand's force (P2b.2b.1 design §3.7); absent otherwise. */
    readonly hand?: { readonly force: Vec3; readonly feedForward: Vec3; readonly top: Vec3; readonly bottom: Vec3 };
}
```

In `ImpactOptions`, replace `    readonly cap?: number;` with:

```ts
    /** An absolute time (s) that overrides IMPACT_CAP or a tracked drive's contactAt + TRACK_IMPACT_CAP. */
    readonly cap?: number;
```

Replace the whole of `advance` with its comment, from

```ts
/**
 * One semi-implicit Euler step of every body under `loads`: velocities from the forces, then positions (and the head's
 * orientation) from the new velocities. Returns the head's new state, replaces each ball's in `balls` and adds each
 * ball's horizontal path length this step to `travel`.
 */
function advance(
    state: HeadState,
    balls: BallState[],
    travel: number[],
    loads: StepLoads,
    setup: ImpactSetup,
    ballInertia: number,
    dt: number,
): HeadState {
    const { head, ball } = setup;
    const velocity = add(state.velocity, scale(loads.headForce, dt / head.mass));
    const bodyOmega = rotateInverse(state.orientation, state.angularVelocity);
    const bodyTorque = rotateInverse(state.orientation, loads.headTorque);
    const spun = add(bodyOmega, scale(angularAcceleration(head.inertia, bodyOmega, bodyTorque), dt));
    const angularVelocity = rotate(state.orientation, spun);
    for (let i = 0; i < balls.length; i++) {
        const s = balls[i] as BallState;
        const v = add(s.velocity, scale(loads.forces[i] as Vec3, dt / ball.mass));
        const w = add(s.angularVelocity, scale(loads.torques[i] as Vec3, dt / ballInertia));
        balls[i] = { position: add(s.position, scale(v, dt)), velocity: v, angularVelocity: w };
        // Horizontal speed suffices, and wakes no pair early for a ball bouncing in the turf: an obstacle is a vertical
        // cylinder, its gap horizontal.
        travel[i] = (travel[i] as number) + length(horizontal(v)) * dt;
    }
    return {
        position: add(state.position, scale(velocity, dt)),
        orientation: integrateOrientation(state.orientation, angularVelocity, dt),
        velocity,
        angularVelocity,
    };
}
```

to:

```ts
/** One semi-implicit Euler step of the head alone (a force table) under `loads`. */
function stepHead(state: HeadState, loads: StepLoads, head: MalletHead, dt: number): HeadState {
    const velocity = add(state.velocity, scale(loads.headForce, dt / head.mass));
    const bodyOmega = rotateInverse(state.orientation, state.angularVelocity);
    const bodyTorque = rotateInverse(state.orientation, loads.headTorque);
    const spun = add(bodyOmega, scale(angularAcceleration(head.inertia, bodyOmega, bodyTorque), dt));
    const angularVelocity = rotate(state.orientation, spun);
    return {
        position: add(state.position, scale(velocity, dt)),
        orientation: integrateOrientation(state.orientation, angularVelocity, dt),
        velocity,
        angularVelocity,
    };
}

/**
 * One semi-implicit Euler step of a tracked drive's swung body (P2b.2b.1 design §3.3) under `loads`, which act on the
 * head (forces, and torques about the head's centre c_h): its centre c_s = c_h + δ·s and its spin, the torque about
 * c_s being the torque about c_h plus (c_h − c_s) × F. Returns the head's state, which follows from the body's.
 */
function stepSwung(state: HeadState, loads: StepLoads, body: SwungBody, dt: number): HeadState {
    const offset = scale(rotate(state.orientation, UP), body.offset);
    const centreVelocity = add(state.velocity, cross(state.angularVelocity, offset));
    const torque = sub(loads.headTorque, cross(offset, loads.headForce));
    const velocity = add(centreVelocity, scale(loads.headForce, dt / body.mass));
    const bodyOmega = rotateInverse(state.orientation, state.angularVelocity);
    const bodyTorque = rotateInverse(state.orientation, torque);
    const spun = add(bodyOmega, scale(angularAcceleration(body.inertia, bodyOmega, bodyTorque), dt));
    const angularVelocity = rotate(state.orientation, spun);
    const centre = add(add(state.position, offset), scale(velocity, dt));
    const orientation = integrateOrientation(state.orientation, angularVelocity, dt);
    const next = scale(rotate(orientation, UP), body.offset);
    return {
        position: sub(centre, next),
        orientation,
        velocity: sub(velocity, cross(angularVelocity, next)),
        angularVelocity,
    };
}

/**
 * One semi-implicit Euler step of every body under `loads`: velocities from the forces, then positions (and the head's
 * orientation) from the new velocities. Returns the head's new state, replaces each ball's in `balls` and adds each
 * ball's horizontal path length this step to `travel`.
 */
function advance(
    state: HeadState,
    balls: BallState[],
    travel: number[],
    loads: StepLoads,
    setup: ImpactSetup,
    ballInertia: number,
    dt: number,
): HeadState {
    const { head, ball, drive } = setup;
    const next = drive.kind === "force" ? stepHead(state, loads, head, dt) : stepSwung(state, loads, drive.body, dt);
    for (let i = 0; i < balls.length; i++) {
        const s = balls[i] as BallState;
        const v = add(s.velocity, scale(loads.forces[i] as Vec3, dt / ball.mass));
        const w = add(s.angularVelocity, scale(loads.torques[i] as Vec3, dt / ballInertia));
        balls[i] = { position: add(s.position, scale(v, dt)), velocity: v, angularVelocity: w };
        // Horizontal speed suffices, and wakes no pair early for a ball bouncing in the turf: an obstacle is a vertical
        // cylinder, its gap horizontal.
        travel[i] = (travel[i] as number) + length(horizontal(v)) * dt;
    }
    return next;
}
```

(`stepHead` computes exactly what `advance` computed before, in the same order, so force tables stay bit-identical.)

Add above `integrate`'s doc comment (`/** Integrates the impact from …`), a blank line after:

```ts
/** When a tracked drive's actions are over: both arcs' windows and, if it has depth, the dip (design §3.5). */
function trackEnd(plan: PreparedTrack): number {
    const { arc } = plan;
    const dip = arc.dip.depth > 0 ? arc.dip.start + arc.dip.duration : 0;
    return Math.max(arc.arcStart + arc.window, arc.handStart + arc.handWindow, dip);
}

/**
 * True while a tracked head still reaches for a ball at time t (design §3.5): it is closing on one within reach
 * (headClosing), or its front face would reach one ahead of it within LOOK_AHEAD. A ball is ahead when its centre lies
 * a distance d > 0 in front of the face plane along the face normal f and within ρ + R of the head's axis; the face
 * closes at max(v_head·f, v_path·f) − v_ball·f, v_path the head's velocity on the path, which the hands still drive
 * towards, and would reach it if that is positive and d − R < closing·LOOK_AHEAD.
 */
function stillReaching(
    state: HeadState,
    head: MalletHead,
    balls: readonly BallState[],
    radius: number,
    plan: PreparedTrack,
    t: number,
): boolean {
    if (balls.some((s) => headClosing(state, head, s, radius))) {
        return true;
    }
    const path = pathAt(plan, t);
    const onPath = add(
        path.socketVelocity,
        cross(path.angularVelocity, rotate(path.orientation, scale(head.socket, -1))),
    );
    const f = rotate(state.orientation, vec3(1, 0, 0));
    const face = add(state.position, scale(f, head.length / 2));
    const speed = Math.max(dot(state.velocity, f), dot(onPath, f));
    for (const s of balls) {
        const offset = sub(s.position, face);
        const d = dot(offset, f);
        if (!(d > 0) || length(sub(offset, scale(f, d))) >= head.radius + radius) {
            continue;
        }
        const closing = speed - dot(s.velocity, f);
        if (closing > 0 && d - radius < closing * LOOK_AHEAD) {
            return true;
        }
    }
    return false;
}
```

In `integrate`, replace

```ts
    const dt = options.dt ?? IMPACT_DT;
    const cap = options.cap ?? IMPACT_CAP;
    const { head, ball } = setup;
    const R = ball.radius;
    const ballInertia = 0.4 * ball.mass * R * R;
    const driveEnd = (setup.drive.samples[setup.drive.samples.length - 1] as DriveSample).t;
```

with:

```ts
    const dt = options.dt ?? IMPACT_DT;
    const { head, ball, drive: plan } = setup;
    const cap = options.cap ?? (plan.kind === "force" ? IMPACT_CAP : plan.arc.contactAt + TRACK_IMPACT_CAP);
    const R = ball.radius;
    const ballInertia = 0.4 * ball.mass * R * R;
    const driveEnd = plan.kind === "force" ? (plan.samples[plan.samples.length - 1] as DriveSample).t : trackEnd(plan);
    const grip = newGripState();
```

replace the start of the loop body

```ts
        const t = steps * dt;
        const drive = driveAt(setup.drive.samples, t);
        const loads: StepLoads = {
            headForce: add(drive, headWeight),
            headTorque: cross(rotate(state.orientation, head.socket), drive),
            forces: balls.map(() => ballWeight),
            torques: balls.map(() => ZERO),
        };
```

with:

```ts
        const t = steps * dt;
        let drive: Vec3;
        let headTorque: Vec3;
        let hand: HandLoad | null = null;
        if (plan.kind === "force") {
            drive = driveAt(plan.samples, t);
            headTorque = cross(rotate(state.orientation, head.socket), drive);
        } else {
            hand = handLoad(plan, state, head, t, grip);
            drive = hand.force;
            headTorque = hand.torque;
        }
        const loads: StepLoads = {
            headForce: add(drive, headWeight),
            headTorque,
            forces: balls.map(() => ballWeight),
            torques: balls.map(() => ZERO),
        };
```

(the force-table branch computes exactly what the loop computed before), replace the probe call

```ts
        options.probe?.step({ t: now, drive, head: state, balls: [...balls], contacts: samples });
```

with:

```ts
        if (options.probe) {
            const snapshot: ImpactSnapshot = { t: now, drive, head: state, balls: [...balls], contacts: samples };
            options.probe.step(
                hand === null
                    ? snapshot
                    : {
                          ...snapshot,
                          hand: {
                              force: hand.force,
                              feedForward: hand.feedForward,
                              top: hand.top,
                              bottom: hand.bottom,
                          },
                      },
            );
        }
```

replace the end test

```ts
        quiet = hardClosed ? 0 : quiet + 1;
        if (struck && now >= driveEnd && quiet >= RELEASE_STEPS && !turfMoving) {
            break;
        }
```

with:

```ts
        quiet = hardClosed ? 0 : quiet + 1;
        const settled = struck && now >= driveEnd && quiet >= RELEASE_STEPS && !turfMoving;
        if (settled && (plan.kind === "force" || !stillReaching(state, head, balls, R, plan, now))) {
            break;
        }
```

and replace the return

```ts
    return finish(setup, state, balls, pairs, events, steps, steps * dt, touchingAtStart);
```

with:

```ts
    const run = finish(setup, state, balls, pairs, events, steps, steps * dt, touchingAtStart);
    if (grip.releasedAt === null) {
        return run;
    }
    return { ...run, release: { t: grip.releasedAt, deltaTheta: grip.releaseDelta } };
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/engine/impact/hands.test.ts tests/engine/impact/track.test.ts`
Expected: PASS, 53 tests (26 here, 27 from Task 3). The bounds rest on figures drafting measured on this code
(below); if one fails, print the figure and report it before changing anything.

Run: `npm test`, `npm run check`, `npm run lint`
Expected: all pass, 26 more tests than after Task 3.

Figures measured while drafting (this task's code on a replica of `main` with the first Tasks 1–2; pre-flight
re-measures every one and keeps a 1.5–3× margin):

| Case | Measured | Bound |
|---|---|---|
| Coasting swing before contact (`ARMED`, T 40 ms) | 1.71e-7 m, 1.15e-7 rad | 4e-7 m, 3e-7 rad |
| Power roll with a timed dip before contact | 2.53e-6 m, 2.33e-6 rad (1.27e-6, 1.16e-6 at dt/2) | 5e-6 m, 5e-6 rad |
| Carry from contact to the reach's end (descent 19 mm) | 2.76e-6 m, 5.58e-6 rad | 6e-6 m, 1.2e-5 rad |
| Carry slope, second window's end to the reach's end | 5.58e-6 rad | 1.2e-5 rad |
| Full check, error ratio dt/2 : dt (before contact; from contact) | 0.504; 0.500 (pre-flight, with the check to rest: 0.5042 and 0.5038; 0.4997 and 0.4997, unchanged) | < 0.6 |
| Full check on a head at half the path's rate from contact (pre-flight) | share drift 2.5e-4; last and lowest rate 1.13e-8 rad/s (the planned deceleration alone: −0.832) | 5e-4; ≥ 0 and 3e-8 rad/s |
| Check share at t = 5 ms, ω_path 1.5 rad/s (pre-flight) | feed-forward affine in the share to 1e-9; past rest the guide's push c·0.3·lever | 1e-9; 6 places |
| 1 mm along the shaft (oscillator) | 2.9e-4 of the amplitude | 1 % (spec §8.1) |
| Relaxed top hand (γ_T 0.1) sink rate | 6.4e-5 of the terminal rate | 2e-4 (Euler's (c·dt/M)/2·e⁻¹) |
| Release by reach in a run | 3.3e-6 m over the slack, t = 20.82 ms | under one step's turn |
| Single-ball strike | look-ahead clear at 0.41 ms, ends at the window's end, 10 ms | within RELEASE_STEPS |
| Croquet drive | 5 face–blue intervals, ends at 120.5 ms, `impact-off-face` at 74 ms | ≥ 2, no cap or approach |
| Croquet drive capped at 2.5 ms | head closing on blue over 2.34–3.17 ms | cap, then approaching |

- [ ] **Step 7: Verify force tables are bit-identical**

Run: `env OBSTACLE_STROKES=2000 npx --yes tsx scripts/impactDigest.ts > "<temp>/digest-4.txt"`
Run: `cmp "<temp>/digest-base.txt" "<temp>/digest-4.txt"`
Expected: no output (drafting confirmed it on the replica: 8,961 lines identical).

- [ ] **Step 8: Format, check, commit**

```bash
npx prettier --write src/engine/impact/track.ts src/engine/impact/types.ts src/engine/impact/integrate.ts \
    tests/engine/impact/hands.test.ts
```

Expected: every file unchanged (the code above is prettier's output; pre-flight D4.3).

Run: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`
Expected: all pass.

```bash
git add src/engine/impact/track.ts src/engine/impact/types.ts src/engine/impact/integrate.ts \
    tests/engine/impact/hands.test.ts
```

Write the message to `msg.txt` in the session's temp directory, then commit with `git commit -F <that literal path>`
(pre-flight D10.2), the sandbox disabled for signing. Check with `git log -1 "--format=%G? %h"` (expect `G`).

```text
Drive the impact with two hands on the swung body

A tracked drive's hands (P2b.2b.1 design §3.3): before contact both
grip firmly and the rigid path's wrench is split over them; from
contact they track the path's velocity only, the top hand carrying
gripTension of its share and the dip in full, the bottom hand a rate
guide in swing mode or a two-sided grip in carry mode until it opens
by reach (ImpactRun.release). integrate steps the swung body, head and
arm mass, for a tracked drive and the head alone for a force table,
whose digest is unchanged. The tracked end rule (design §3.5) waits
for both windows and the dip, a closing head and a 30 ms look-ahead;
TRACK_IMPACT_CAP is 0.45 s after contactAt. The probe reports both
hands' forces.
```

---
### Task 5: Tracked contact states: the `Drive` union, validation and preparation

Spec §3.1 and §3.6. `ContactState.drive` becomes `ForceDrive | TrackDrive`. `validateImpact` checks a tracked drive's
arc, coupling and hands, each failure a `RangeError` naming its check, and `prepareImpact` prepares it once into
`ImpactSetup.drive`, which Task 4 already widened to `ForceDrive | PreparedTrack`. The integrator is untouched: Task 4
drives it with prepared tracks through isolated set-ups, and this task only lets a `ContactState` reach it. Task 6
then adds `ImpactSetup.headTurf`.

**Files:**
- Modify: `src/engine/impact/types.ts`, `src/engine/impact/simulateImpact.ts`, `tests/engine/support/impact.ts`,
  `tests/engine/impact/simulateImpact.test.ts`

**Interfaces:**
- Consumes: `prepareTrack`, `headOnPath`, `pitchAxis`, `PreparedTrack.thetaEnd` (Task 3); `TEST_HANDS`, `trackDrive`,
  `levelArc` (support, Task 3); `ImpactSetup.drive: ForceDrive | PreparedTrack` (Task 4).
- Produces:
  - `type Drive = ForceDrive | TrackDrive`;
  - `validateImpact` rejecting a tracked drive out of spec §3.6's ranges;
  - `prepareImpact` returning `drive: prepareTrack(contact.drive, contact.head, world.gravity)` for a tracked drive,
    and the force table itself for a force drive;
  - `onArc(drive: TrackDrive, head?: MalletHead, t?: number): ContactState` (support): the head on the path at t
    (default `TEST_HEAD`, 0), with `TEST_FACE`;
  - `mirrorContact`, which also mirrors a tracked drive.

- [ ] **Step 1: Add the support helpers**

In `tests/engine/support/impact.ts`, add `Drive` to the `../../../src/engine/impact/types` import (before
`DriveSample`; Task 3 already imports `TrackDrive`), and replace Task 3's track import with:

```ts
import { headOnPath, prepareTrack, swingOrientation } from "../../../src/engine/impact/track";
```

After `levelArc`, add:

```ts
/** A tracked contact state: `head` on `drive`'s path at time `t` (s), with the test face. */
export function onArc(drive: TrackDrive, head: MalletHead = TEST_HEAD, t = 0): ContactState {
    return { head, face: TEST_FACE, ...headOnPath(prepareTrack(drive, head, STANDARD_GRAVITY), head, t), drive };
}
```

Replace `mirrorContact` with:

```ts
/**
 * A drive reflected across y = 0. A tracked drive reflects its arc's vectors; its angles, coupling and hands are
 * unchanged: the pitch axis aim × ẑ is a pseudovector and reflects as a spin does, so a turn θ about it reflects to the
 * same θ about the reflected axis, and the path's orientation rot(n, θ) ⊗ q_aim reflects factor by factor.
 */
function mirrorDrive(d: Drive): Drive {
    if (d.kind === "force") {
        return { kind: "force", samples: d.samples.map((s) => ({ t: s.t, force: mirrorVec(s.force) })) };
    }
    const { arc } = d;
    return {
        ...d,
        arc: {
            ...arc,
            pivot: mirrorVec(arc.pivot),
            pivotVelocity: mirrorVec(arc.pivotVelocity),
            pivotAcceleration: mirrorVec(arc.pivotAcceleration),
            aim: mirrorVec(arc.aim),
        },
    };
}

export function mirrorContact(c: ContactState): ContactState {
    return {
        ...c,
        position: mirrorVec(c.position),
        orientation: mirrorQuat(c.orientation),
        velocity: mirrorVec(c.velocity),
        angularVelocity: mirrorSpin(c.angularVelocity),
        drive: mirrorDrive(c.drive),
    };
}
```

The force branch builds exactly what Task 1's `mirrorContact` built, so the mirror tests on the scenarios are
unchanged.

- [ ] **Step 2: Write the failing tests**

In `tests/engine/impact/simulateImpact.test.ts`, extend the imports:

```ts
import { prepareImpact, simulateImpact, validateImpact } from "../../../src/engine/impact/simulateImpact";
import type { ContactState, Coupling, Hands, StrokeMode, SwingArc } from "../../../src/engine/impact/types";
import { TEST_HEAD, drive, levelArc, onArc, strike, trackDrive } from "../support/impact";
```

(replacing the three existing lines from those modules), then append:

```ts
describe("simulateImpact with a tracked drive", () => {
    // A still, level arc with the head's face 1 µm short of blue's sunk centre, swinging through it at 3 m/s: the
    // head's centre is the arc radius plus the socket's height above it from the pivot.
    const STILL = levelArc(sub(SUNK, vec3(R + 1e-6 + TEST_HEAD.length / 2, 0, 0)));
    const ARC: SwingArc = { ...STILL, omega0: 3 / (STILL.radius + TEST_HEAD.socket.z) };
    const DRIVE = trackDrive(ARC);
    const tracked = onArc(DRIVE);
    const withArc = (over: Partial<SwingArc>): ContactState => ({
        ...tracked,
        drive: { ...DRIVE, arc: { ...ARC, ...over } },
    });
    const withCoupling = (over: Partial<Coupling>): ContactState => ({
        ...tracked,
        drive: { ...DRIVE, coupling: { ...DRIVE.coupling, ...over } },
    });
    const withHands = (over: Partial<Hands>): ContactState => ({
        ...tracked,
        drive: { ...DRIVE, hands: { ...DRIVE.hands, ...over } },
    });

    it("runs a tracked strike and hands the ball over moving", () => {
        const result = simulateImpact(tracked, { blue: BLUE }, WORLD);
        // Prototype (aeadd4c, two hands, no arm mass): ends at the window's end, 10 ms, blue at 3.73 m/s, with no event
        // but turf-lift. Pre-flight re-measures.
        expect(result.handover.blue?.velocity.x).toBeGreaterThan(0);
        expect(result.events.some((e) => e.kind === "impact-cap")).toBe(false);
        expect(result.duration).toBeGreaterThanOrEqual(ARC.window);
    });

    it("accepts a head that does not start on its path", () => {
        const off = { ...tracked, position: add(tracked.position, vec3(-1e-3, 0, 1e-3)) };
        expect(() => simulateImpact(off, { blue: BLUE }, WORLD)).not.toThrow();
    });

    it("prepares the path once, and passes a force table through unchanged", () => {
        const setup = prepareImpact(tracked, { blue: BLUE }, WORLD);
        expect(setup.drive.kind).toBe("track");
        // θ_a + ω₀·w + ½·α·w² with θ_a = 0 and α = 0 is exactly ω₀·w (prototype: equal to the last bit).
        expect(setup.drive.kind === "track" && setup.drive.thetaEnd).toBe(ARC.omega0 * ARC.window);
        const forced = strike(BLUE.position);
        expect(prepareImpact(forced, { blue: BLUE }, WORLD).drive).toBe(forced.drive);
    });

    it("accepts pivot motion out of the swing plane by rounding only (1e-12 of its size)", () => {
        const rounded = withArc({ pivotVelocity: vec3(1, 1e-13, 0) });
        expect(() => validateImpact(rounded, { blue: BLUE }, WORLD)).not.toThrow();
        const beyond = withArc({ pivotVelocity: vec3(1, 1e-11, 0) });
        expect(() => validateImpact(beyond, { blue: BLUE }, WORLD)).toThrow(/arc\.pivotVelocity must lie in/);
    });

    const rejections: readonly [string, ContactState, RegExp][] = [
        ["a non-finite pivot", withArc({ pivot: vec3(NaN, 0, 1) }), /arc\.pivot must be finite/],
        [
            "a non-finite pivot velocity",
            withArc({ pivotVelocity: vec3(0, 0, Infinity) }),
            /arc\.pivotVelocity must be finite/,
        ],
        [
            "a non-finite pivot acceleration",
            withArc({ pivotAcceleration: vec3(NaN, 0, 0) }),
            /arc\.pivotAcceleration must be finite/,
        ],
        ["a non-finite aim", withArc({ aim: vec3(NaN, 0, 0) }), /arc\.aim must be finite/],
        ["a non-finite start angle", withArc({ theta0: Infinity }), /arc\.theta0 must be finite/],
        ["a non-finite arc rate", withArc({ omega0: NaN }), /arc\.omega0 must be finite/],
        ["a non-finite arc acceleration", withArc({ alpha: NaN }), /arc\.alpha must be finite/],
        ["a non-positive radius", withArc({ radius: 0 }), /arc\.radius must be a positive finite number/],
        ["a non-positive window", withArc({ window: 0 }), /arc\.window must be a positive finite number/],
        ["a non-positive hands' window", withArc({ handWindow: 0 }), /arc\.handWindow must be a positive/],
        ["a negative arc start", withArc({ arcStart: -0.01 }), /arc\.arcStart must be a non-negative finite time/],
        ["a negative hands' start", withArc({ handStart: -0.01 }), /arc\.handStart must be a non-negative/],
        ["a negative contact time", withArc({ contactAt: -0.01 }), /arc\.contactAt must be a non-negative/],
        ["a dip starting before t = 0", withArc({ dip: { ...ARC.dip, start: -0.01 } }), /arc\.dip\.start must be/],
        ["a dip of no duration", withArc({ dip: { ...ARC.dip, duration: 0 } }), /arc\.dip\.duration must be/],
        ["a negative dip depth", withArc({ dip: { ...ARC.dip, depth: -0.001 } }), /arc\.dip\.depth must be/],
        [
            "an unknown mode",
            withArc({ mode: "glide" as unknown as StrokeMode }),
            /arc\.mode must be "swing" or "carry"/,
        ],
        ["a negative reach", withArc({ handReach: -0.01 }), /arc\.handReach must be non-negative/],
        ["a negative ground depth", withArc({ groundDepth: -0.001 }), /arc\.groundDepth must be non-negative/],
        ["an aim that is not unit", withArc({ aim: vec3(1.1, 0, 0) }), /arc\.aim must be a horizontal unit vector/],
        ["an aim that is not horizontal", withArc({ aim: vec3(0.8, 0, 0.6) }), /arc\.aim must be a horizontal/],
        ["a non-positive period", withCoupling({ period: 0 }), /coupling\.period must be a positive/],
        ["a negative damping ratio", withCoupling({ dampingRatio: -0.1 }), /coupling\.dampingRatio must be/],
        ["a negative relaxation time", withCoupling({ relaxAt: -0.01 }), /coupling\.relaxAt must be a non-negative/],
        ["a bottom hand at the socket", withHands({ bottom: 0 }), /hands\.bottom must lie in \(0, arc\.radius\)/],
        [
            "a bottom hand at the top hand",
            withHands({ bottom: ARC.radius }),
            /hands\.bottom must lie in \(0, arc\.radius\)/,
        ],
        ["a zero grip tension", withHands({ gripTension: 0 }), /hands\.gripTension must lie in \(0, 1\]/],
        ["a grip tension above 1", withHands({ gripTension: 1.5 }), /hands\.gripTension must lie in \(0, 1\]/],
        ["a zero bottom grip", withHands({ bottomGrip: 0 }), /hands\.bottomGrip must lie in \(0, 1\]/],
        ["a bottom grip above 1", withHands({ bottomGrip: 1.5 }), /hands\.bottomGrip must lie in \(0, 1\]/],
        ["a negative arm mass", withHands({ armMass: -0.1 }), /hands\.armMass must be non-negative/],
        ["a negative reach slack", withHands({ reachSlack: -0.01 }), /hands\.reachSlack must be non-negative/],
        ["a negative guide effort", withHands({ guideEffort: -0.1 }), /hands\.guideEffort must lie in \[0, 1\]/],
        ["a guide effort above 1", withHands({ guideEffort: 1.5 }), /hands\.guideEffort must lie in \[0, 1\]/],
        [
            "a pivot velocity out of the swing plane",
            withArc({ pivotVelocity: vec3(0, 0.1, 0) }),
            /arc\.pivotVelocity must lie in the swing plane/,
        ],
        [
            "a pivot acceleration out of the swing plane",
            withArc({ pivotAcceleration: vec3(0, 1, 0) }),
            /arc\.pivotAcceleration must lie in the swing plane/,
        ],
    ];

    it.each(rejections)("rejects %s", (_name, contact, pattern) => {
        expect(() => simulateImpact(contact, { blue: BLUE }, WORLD)).toThrow(RangeError);
        expect(() => simulateImpact(contact, { blue: BLUE }, WORLD)).toThrow(pattern);
    });
});
```

`add` joins the `vec3` import: `import { add, length, sub, vec3 } from "../../../src/engine/math/vec3";`. Each case
breaks one check only, and the checks run in the order Step 5 lists, so no case can pass on another check's error:
the radius case, for instance, fails on `arc.radius` before the bottom hand is compared with it.

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/engine/impact/simulateImpact.test.ts`
Expected: FAIL in the new suite only:
- the strike, the head off its path, the rounding case and every rejection: `validateImpact` still runs Task 1's
  force-table checks, which read `contact.drive.samples` of a tracked drive, so it throws
  `TypeError: Cannot read properties of undefined (reading 'length')` (the rejections fail on `RangeError`);
- "prepares the path once": `prepareImpact` passes the `TrackDrive` through unprepared, so `thetaEnd` is `undefined`
  (`expected undefined to be 0.036057…`).

`npm run check` reports, in `onArc`, `Property 'samples' is missing in type 'TrackDrive' but required in type
'ForceDrive'`; in `mirrorDrive`, `Property 'arc' does not exist on type 'ForceDrive'` (a one-member `Drive` does not
narrow to `never`) and an excess-property error for `arc` in its return; and in the suite's `withArc`,
`withCoupling` and `withHands`, excess-property errors for `arc`, `coupling` and `hands` on `ForceDrive`.

- [ ] **Step 4: Widen the union**

In `src/engine/impact/types.ts`, replace the `Drive` declaration with:

```ts
/** What the hands do to the head during the impact (P2b.2b.1 design §3.1): a force table, or a tracked drive. */
export type Drive = ForceDrive | TrackDrive;
```

- [ ] **Step 5: Validate and prepare tracked drives**

In `src/engine/impact/simulateImpact.ts`:

The file header's first paragraph gains a sentence after "…once per ball from the surface where it lies.":
"Prepares a tracked drive once (track.ts)." Rewrap the paragraph to 120 columns.

Imports: add `dot` to the `../math/vec3` import; add

```ts
import { pitchAxis, prepareTrack } from "./track";
```

after the `./integrate` import; and replace the `./types` import with:

```ts
import type { ContactState, DriveSample, ForceDrive, ImpactResult, TrackDrive } from "./types";
```

Replace `UNIT_TOLERANCE`'s comment with:

```ts
/**
 * Tolerance on |q|² − 1 for a ContactState's orientation, and on a tracked drive's aim and swing plane (P2b.2b.1
 * design §3.6). Numerical, not physical: a few ulps of a normalised vector.
 */
```

Add after `finite`:

```ts
function finiteNumber(value: number, name: string): void {
    if (!Number.isFinite(value)) {
        fail(`${name} must be finite (got ${value})`);
    }
}

/** A time (s from t = 0) that must be finite and not negative. */
function notBefore(value: number, name: string): void {
    if (!(value >= 0) || !Number.isFinite(value)) {
        fail(`${name} must be a non-negative finite time (got ${value})`);
    }
}

/** Checks a force table: not empty, starting at t = 0, times increasing strictly, every force finite. */
function validateForce(drive: ForceDrive): void {
    const { samples } = drive;
    if (samples.length === 0 || (samples[0] as DriveSample).t !== 0) {
        fail("drive must start at t = 0");
    }
    samples.forEach((s, i) => {
        finite(s.force, `drive[${i}].force`);
        if (!Number.isFinite(s.t) || (i > 0 && !(s.t > (samples[i - 1] as DriveSample).t))) {
            fail("drive times must increase strictly");
        }
    });
}

/**
 * Checks a tracked drive (P2b.2b.1 design §3.6), in this order: every vector and angle finite; a positive radius,
 * windows and dip duration; non-negative start times, contact time, dip depth, reach and ground depth; a mode of
 * "swing" or "carry"; aim a horizontal unit vector within UNIT_TOLERANCE; a positive period, a non-negative damping
 * ratio and relaxation time; the bottom hand between the socket and the top hand, both grips in (0, 1], a non-negative
 * arm mass and reach slack, a guide effort in [0, 1]; the pivot's velocity and acceleration in the swing plane, their
 * component along the pitch axis within UNIT_TOLERANCE of their size. The head need not start on the path.
 */
function validateTrack(drive: TrackDrive): void {
    const { arc, coupling, hands } = drive;
    finite(arc.pivot, "arc.pivot");
    finite(arc.pivotVelocity, "arc.pivotVelocity");
    finite(arc.pivotAcceleration, "arc.pivotAcceleration");
    finite(arc.aim, "arc.aim");
    finiteNumber(arc.theta0, "arc.theta0");
    finiteNumber(arc.omega0, "arc.omega0");
    finiteNumber(arc.alpha, "arc.alpha");
    positive(arc.radius, "arc.radius");
    positive(arc.window, "arc.window");
    positive(arc.handWindow, "arc.handWindow");
    positive(arc.dip.duration, "arc.dip.duration");
    notBefore(arc.arcStart, "arc.arcStart");
    notBefore(arc.handStart, "arc.handStart");
    notBefore(arc.contactAt, "arc.contactAt");
    notBefore(arc.dip.start, "arc.dip.start");
    friction(arc.dip.depth, "arc.dip.depth");
    if (arc.mode !== "swing" && arc.mode !== "carry") {
        fail(`arc.mode must be "swing" or "carry" (got ${arc.mode})`);
    }
    friction(arc.handReach, "arc.handReach");
    friction(arc.groundDepth, "arc.groundDepth");
    const { aim } = arc;
    if (!(Math.abs(aim.z) <= UNIT_TOLERANCE && Math.abs(dot(aim, aim) - 1) <= UNIT_TOLERANCE)) {
        fail("arc.aim must be a horizontal unit vector");
    }
    positive(coupling.period, "coupling.period");
    friction(coupling.dampingRatio, "coupling.dampingRatio");
    notBefore(coupling.relaxAt, "coupling.relaxAt");
    if (!(hands.bottom > 0 && hands.bottom < arc.radius)) {
        fail(`hands.bottom must lie in (0, arc.radius) (got ${hands.bottom})`);
    }
    restitution(hands.gripTension, "hands.gripTension");
    restitution(hands.bottomGrip, "hands.bottomGrip");
    friction(hands.armMass, "hands.armMass");
    friction(hands.reachSlack, "hands.reachSlack");
    if (!(hands.guideEffort >= 0 && hands.guideEffort <= 1)) {
        fail(`hands.guideEffort must lie in [0, 1] (got ${hands.guideEffort})`);
    }
    const n = pitchAxis(aim);
    if (!(Math.abs(dot(arc.pivotVelocity, n)) <= UNIT_TOLERANCE * length(arc.pivotVelocity))) {
        fail("arc.pivotVelocity must lie in the swing plane");
    }
    if (!(Math.abs(dot(arc.pivotAcceleration, n)) <= UNIT_TOLERANCE * length(arc.pivotAcceleration))) {
        fail("arc.pivotAcceleration must lie in the swing plane");
    }
}
```

(`friction` and `restitution` are the file's checks for "finite and non-negative" and "in (0, 1]"; their messages
name the quantity, not friction or restitution. `pitchAxis(aim)` is a unit vector once aim has passed its check.)

In `validateImpact`, replace the drive checks (Task 1's block, from `const { samples } = contact.drive;` to the end of
the `forEach`) with:

```ts
    if (contact.drive.kind === "force") {
        validateForce(contact.drive);
    } else {
        validateTrack(contact.drive);
    }
```

In its header list, replace the drive item with:

```ts
 * - a force table that is empty, does not start at 0 or does not increase strictly;
 * - a tracked drive whose arc, coupling or hands are out of range (P2b.2b.1 design §3.6; the head need not start on
 *   its path);
```

In `prepareImpact`, the drive line becomes:

```ts
        drive: contact.drive.kind === "force" ? contact.drive : prepareTrack(contact.drive, contact.head, gravity),
```

and its header comment gains, after its first sentence: "A tracked drive is prepared once (prepareTrack): its windows'
end states, its reach, its swung body and, in swing mode, its free pendulum's table." Rewrap the comment to 120
columns.

- [ ] **Step 6: Run the tests, verify bit-identity**

Run: `npx vitest run tests/engine/impact/simulateImpact.test.ts`
Expected: PASS. If the strike or the off-path case fails, print `result.duration`, `result.events` and
`result.timeline` and report them before changing an expectation: they rest on the hands' model (pre-flight
re-measures).

Run: `npm test`
Expected: all pass.

Run: `env OBSTACLE_STROKES=2000 npx --yes tsx scripts/impactDigest.ts > "<temp>/digest-5.txt"`
Run: `cmp "<temp>/digest-base.txt" "<temp>/digest-5.txt"`
Expected: no output (identical): `validateForce` runs exactly Task 1's checks, and a force table reaches the
integrator as the same object.

- [ ] **Step 7: Format, check, commit**

Run: `npx prettier --write src/engine/impact/types.ts src/engine/impact/simulateImpact.ts`
Run: `npx prettier --write tests/engine/support/impact.ts tests/engine/impact/simulateImpact.test.ts`

Run: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`
Expected: all pass.

Write the message to `$CLAUDE_TEMP_DIR/msg.txt` (with the Write tool, at the directory's literal path):

```text
Validate and prepare tracked contact states

ContactState.drive becomes a force table or a tracked drive. validateImpact
checks a tracked drive's arc, coupling and hands, each failure a RangeError
naming its check (design §3.6); prepareImpact prepares the path once. Force
tables are unchanged: the impact digest is byte-identical.
```

```bash
git add src/engine/impact/types.ts src/engine/impact/simulateImpact.ts tests/engine/support/impact.ts
git add tests/engine/impact/simulateImpact.test.ts
git commit -F <literal value of $CLAUDE_TEMP_DIR>/msg.txt
git log -1 "--format=%G? %h"
```

Run the commit with the sandbox disabled (signing needs the SSH agent) and with the temp directory's literal path.
Expected: `G` and the new commit's hash.
### Task 6: Mallet–turf contact

Spec §4.1–§4.4 and §3.7 (`headTurf`). For a tracked drive the head gets a `head/turf` pair after every other pair: the
turf's clamped spring–dashpot, its damping solved with the head's mass, and Cundall–Strack friction with
`HEAD_TURF_FRICTION`, both acting at the head's lowest point. The pair records an interval timeline, a peak
penetration and the slide, and raises `impact-head-deep` past 2 mm. A force table keeps raising
`impact-mallet-grounded` and gets no pair, so force tables stay bit-identical.

The pair's force and moment are added to the head's loads about the head's centre, as every contact's are. Task 4's
swung-body step already turns the summed loads into the swung body's (c_s = c_h + q(δ ẑ), torque about c_s = torque
about c_h + (c_h − c_s) × F), so the pair needs nothing of its own for the arm mass. The law's effective mass is the
head's (spec §4.1), not the swung body's.

The closed forms are tested where they hold exactly:
- settling at m·g/k, the μ·g slide, the slide's length and the depth flag use an undriven head (the isolated
  set-up's force table), so no hand acts and the head is the only body;
- a relaxed top hand bringing the head to rest on the turf uses a still, level swing-mode path. There the hands act
  along the vertical shaft only: the top hand carries γ_T of the head's weight through its feed-forward and damps the
  fall, and the bottom hand's rate guide is idle because the shaft does not turn. At rest the damper is idle, so the
  turf carries (1 − γ_T)·m·g whatever the arm mass (the arm's weight is the player's and is never applied, spec §3.3).
  The test runs with `armMass` 0 (`TEST_HANDS`) and 0.8 kg.

Pre-flight defects folded here: D6.1 (the contacts test's imports now list `dot`, `rotate` and `type Quaternion`), D6.2
(the integrator's header is given rewrapped), D6.3 (only the imports integrate.ts lacks are added). D6.4 is already in
the amended spec (§4.1 reads `headTurf: PairLaw | null`). The nearly-level head's spin bound, measured at 7.66e-3 rad/s
against 0.01 (a 1.3× margin), is restated from one step's moment impulse and widened to 0.02, with a no-growth check.

Planning check: a scratch build of `main` with this task's code (the tracked parts stubbed) passed the contacts tests
and the four undriven head–turf tests, lint, the type check and prettier, and gave a digest byte-identical to
`main`'s. The relaxed-head figures are the prototype's.

**Files:**
- Modify: `src/engine/impact/contacts.ts`, `src/engine/impact/types.ts`, `src/engine/types.ts` (a comment),
  `src/engine/impact/integrate.ts`, `src/engine/impact/simulateImpact.ts`, `tests/engine/support/impact.ts`,
  `tests/engine/impact/contacts.test.ts`
- Create: `tests/engine/impact/headTurf.test.ts`

**Interfaces:**
- Consumes:
  - `contactReference.headTurfFriction` and `.headDeepLimit` (Task 2); `lawFromStiffness` (contactLaw.ts);
    `headLowestPoint` (contacts.ts, on `main`);
  - `prepareTrack`, `headOnPath`, `PreparedTrack` (Task 3); the tracked drive in `integrate` with
    `ImpactSetup.drive: ForceDrive | PreparedTrack`, `HandLoad` (`force`, `feedForward`, `top`, `bottom`),
    `ImpactSnapshot.hand`, `TRACK_IMPACT_CAP` and the swung-body step (Task 4);
  - `Drive = ForceDrive | TrackDrive` and the tracked branch of `validateImpact` and `prepareImpact` (Task 5);
  - test support: `TEST_COUPLING`, `TEST_HANDS`, `levelArc`, `trackDrive` (Task 3), `onArc` (Task 5).
- Produces:
  - `HEAD_TURF_KEY = "head/turf"`, `headBottom(state: HeadState, head: MalletHead): Vec3`,
    `headTurfContact(state: HeadState, head: MalletHead): Penetration | null` (contacts.ts);
  - `ImpactSetup.headTurf: PairLaw | null`; `ImpactSnapshot.headTurf?: Vec3`;
  - `ImpactRun.headTurfSlide?: number`; the `{ kind: "impact-head-deep"; t: number }` event;
  - `HEAD_DEEP_LIMIT` (integrate.ts) and `HEAD_TURF_FRICTION` (simulateImpact.ts);
  - `isolated(...)` defaults `headTurf: null` (support).

- [ ] **Step 1: Write the failing tests**

In `tests/engine/impact/contacts.test.ts`, the imports become (D6.1: `dot`, `rotate`, `type Quaternion` and
`TEST_HEAD` are new, beside the three contacts exports):

```ts
import { describe, expect, it } from "vitest";
import { CONTACT_TOLERANCE } from "../../../src/engine/detect";
import { ZERO, dot, horizontal, length, sub, vec3 } from "../../../src/engine/math/vec3";
import {
    HEAD_TURF_KEY,
    OFF_FACE,
    ballBallContact,
    ballPairKey,
    faceClearance,
    faceContact,
    faceKey,
    headBottom,
    headClosing,
    headLowestPoint,
    headTurfContact,
    obstacleContact,
    obstacleGap,
    obstacleKey,
    outsideObstacle,
    pairContact,
    pairList,
    pairTouching,
    pointVelocity,
    turfContact,
    type ObstacleGeometry,
    type Penetration,
} from "../../../src/engine/impact/contacts";
import { IDENTITY, axisAngle, rotate, type Quaternion } from "../../../src/engine/impact/rigidBody";
import type { HeadState, MalletHead } from "../../../src/engine/impact/types";
import type { BallState } from "../../../src/engine/types";
import { TEST_HEAD } from "../support/impact";
```

and append:

```ts
describe("the head's lowest point and its turf contact", () => {
    const centre = vec3(1, 2, 0.05);
    const at = (orientation: Quaternion): HeadState => ({
        position: centre,
        orientation,
        velocity: vec3(0, 0, 0),
        angularVelocity: vec3(0, 0, 0),
    });

    it("lies under the centre for a level head", () => {
        expect(headBottom(at(IDENTITY), TEST_HEAD)).toEqual(vec3(1, 2, 0.05 - TEST_HEAD.radius));
    });

    it("is the lower end's rim for a tilted head, as low as headLowestPoint says", () => {
        // Front face tilted up 0.3 rad: the rear (−x) end is lower.
        const q = axisAngle(vec3(0, 1, 0), -0.3);
        const p = headBottom(at(q), TEST_HEAD);
        const axis = rotate(q, vec3(1, 0, 0));
        expect(p.z).toBeCloseTo(headLowestPoint(at(q), TEST_HEAD), 15);
        expect(dot(sub(p, centre), axis)).toBeCloseTo(-TEST_HEAD.length / 2, 15);
    });

    it("closes only below the turf, acting upward at the lowest point", () => {
        expect(headTurfContact(at(IDENTITY), TEST_HEAD)).toBeNull();
        const low = { ...at(IDENTITY), position: vec3(1, 2, TEST_HEAD.radius - 1e-4) };
        const contact = headTurfContact(low, TEST_HEAD);
        expect(contact?.normal).toEqual(vec3(0, 0, 1));
        expect(contact?.depth).toBeCloseTo(1e-4, 15);
        expect(contact?.point).toEqual(headBottom(low, TEST_HEAD));
        expect(HEAD_TURF_KEY).toBe("head/turf");
    });
});
```

Create `tests/engine/impact/headTurf.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { lawFromStiffness } from "../../../src/engine/impact/contactLaw";
import { HEAD_TURF_KEY, headLowestPoint } from "../../../src/engine/impact/contacts";
import {
    HEAD_DEEP_LIMIT,
    IMPACT_DT,
    TRACK_IMPACT_CAP,
    integrate,
    type ImpactProbe,
    type ImpactSnapshot,
} from "../../../src/engine/impact/integrate";
import { IDENTITY, axisAngle, type Quaternion } from "../../../src/engine/impact/rigidBody";
import { HEAD_TURF_FRICTION, prepareImpact, simulateImpact } from "../../../src/engine/impact/simulateImpact";
import { headOnPath, prepareTrack } from "../../../src/engine/impact/track";
import { ZERO, length, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import type { SurfaceProps } from "../../../src/engine/types";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import { TEST_TURF, ballAt, testWorld } from "../support/fixtures";
import {
    TEST_COUPLING,
    TEST_HANDS,
    TEST_HEAD,
    isolated,
    levelArc,
    onArc,
    recorder,
    strike,
    trackDrive,
} from "../support/impact";

const g = STANDARD_GRAVITY;
const MU = 0.5;
const LAW = lawFromStiffness(TEST_HEAD.mass, TEST_TURF.turfRestitution, TEST_TURF.turfStiffness, MU);
/** Where the turf carries the head's whole weight: m·g/k. */
const SINK = (TEST_HEAD.mass * g) / TEST_TURF.turfStiffness;

/** An undriven head with its centre at height z, falling under gravity onto the test turf. */
function onTurf(z: number, velocity: Vec3 = ZERO, orientation: Quaternion = IDENTITY) {
    return isolated({
        start: { position: vec3(0, 0, z), orientation, velocity, angularVelocity: ZERO },
        gravity: g,
        headTurf: LAW,
    });
}

/** A probe that keeps only the last snapshot. */
function lastStep(): ImpactProbe & { last: ImpactSnapshot | null } {
    const probe = {
        last: null as ImpactSnapshot | null,
        step(s: ImpactSnapshot): void {
            probe.last = s;
        },
    };
    return probe;
}

describe("the head–turf pair", () => {
    it("settles a level head lowered onto the turf at m·g/k, without turning it", () => {
        const probe = recorder();
        const run = integrate(onTurf(TEST_HEAD.radius), { cap: 0.05, probe });
        // Pre-flight: 0.28 % off m·g/k; the turf force 0.34 % off m·g, both at the cap.
        expect(Math.abs(0 - headLowestPoint(run.head, TEST_HEAD) - SINK) / SINK).toBeLessThan(0.01);
        expect(length(run.head.angularVelocity)).toBe(0);
        expect(run.timeline[HEAD_TURF_KEY]).toHaveLength(1);
        expect(run.peakPenetration[HEAD_TURF_KEY]).toBeGreaterThan(SINK);
        expect(run.events.map((e) => e.kind)).toEqual(["impact-cap"]);
        expect(probe.snapshots[0]?.headTurf).toEqual(ZERO);
        const last = probe.snapshots[probe.snapshots.length - 1] as ImpactSnapshot;
        expect(Math.abs((last.headTurf as Vec3).z - TEST_HEAD.mass * g) / (TEST_HEAD.mass * g)).toBeLessThan(0.01);
    });

    it("slows a head sliding sideways at μ·g while it slides, and records the slide's closed form", () => {
        // Sliding along body y at the static sink: friction at the barrel's bottom line also spins the head about its
        // axis, so its bottom slips at v₀ − 3·μ·g·t (I = m·r²/2) and stops slipping at t = v₀/(3·μ·g), having slid
        // v₀²/(6·μ·g). Pre-flight: the deceleration within 1e-12 of μ·g, the slide 0.39 % long (the bottom first
        // bounces into its sink).
        const v0 = 1;
        const probe = recorder();
        const run = integrate(onTurf(TEST_HEAD.radius - SINK, vec3(0, v0, 0)), { cap: 0.1, probe });
        const stops = v0 / (3 * MU * g);
        const mid = probe.snapshots.find((s) => s.t >= stops / 2) as ImpactSnapshot;
        const expected = v0 - MU * g * mid.t;
        expect(Math.abs(mid.head.velocity.y - expected) / (MU * g * mid.t)).toBeLessThan(0.01);
        const slide = (v0 * v0) / (6 * MU * g);
        expect(Math.abs((run.headTurfSlide as number) - slide) / slide).toBeLessThan(0.01);
    });

    it("raises impact-head-deep just over HEAD_DEEP_LIMIT, and not just under", () => {
        const over = integrate(onTurf(TEST_HEAD.radius - HEAD_DEEP_LIMIT - 1e-6), { cap: 1e-3 });
        expect(over.events.filter((e) => e.kind === "impact-head-deep").map((e) => e.t)).toEqual([IMPACT_DT]);
        expect(over.events.some((e) => e.kind === "impact-mallet-grounded")).toBe(false);
        const under = integrate(onTurf(TEST_HEAD.radius - HEAD_DEEP_LIMIT + 1e-6), { cap: 1e-3 });
        expect(under.events.some((e) => e.kind === "impact-head-deep")).toBe(false);
    });

    it("rests a nearly level head without spinning it up, though its lowest point jumps between the end rims", () => {
        // As the lowest point jumps from one end rim to the other the turf's moment about the centre switches sign, so
        // the spin chatters. One step's moment impulse at the settling's peak load (1.5·m·g, pre-flight) is
        // 1.5·m·g·(L/2)/I_y·dt ≈ 1.8e-3 rad/s; pre-flight measured the spin at 7.66e-3 rad/s at its largest (about four
        // such impulses) and 5.20e-3 over the run's second half. The bound allows eleven impulses, and the second half
        // must not exceed the first: a spin that grew would pass both within tens of steps.
        for (const tilt of [1e-9, -1e-9]) {
            let early = 0;
            let late = 0;
            const probe: ImpactProbe = {
                step(s) {
                    const spin = length(s.head.angularVelocity);
                    if (s.t <= 0.025) {
                        early = Math.max(early, spin);
                    } else {
                        late = Math.max(late, spin);
                    }
                },
            };
            const run = integrate(onTurf(TEST_HEAD.radius, ZERO, axisAngle(vec3(0, 1, 0), tilt)), { cap: 0.05, probe });
            expect(early, `tilt ${tilt}`).toBeLessThan(0.02);
            expect(late, `tilt ${tilt}`).toBeLessThanOrEqual(early);
            // Pre-flight: 0.12 % off m·g/k, as for the level head.
            expect(Math.abs(0 - headLowestPoint(run.head, TEST_HEAD) - SINK) / SINK).toBeLessThan(0.01);
        }
    });

    it("brings a relaxed head, held 1 mm above the turf, down onto it to rest, whatever the arm mass", () => {
        // γ_T = 0.1 on a still, level path: the top hand carries γ_T·m·g and damps the fall, so the head sinks at under
        // the terminal rate (1 − γ_T)·m·g/c(γ_T), c(γ) = 2ζ·M·(2π/T)·√γ, and cannot reach the turf before
        // 1 mm/terminal. At rest the damper is idle and the turf carries (1 − γ_T)·m·g: the arm's weight is the
        // player's. Pre-flight, at TRACK_IMPACT_CAP: armMass 0, the turf from 18.2 ms (bound 7.9 ms), |v| 2.2e-13 m/s
        // and the load 1.7e-12 off; armMass 0.8 kg, from 26.2 ms (bound 14.2 ms), |v| 6.4e-14 m/s and 9.1e-13 off
        // (the prototype's figures, aeadd4c, were at the 0.15 s cap). The load bounds sit far above those figures, and
        // far below the 89 % more the turf would carry were the 0.8 kg arm's weight applied.
        const gamma = 0.1;
        for (const [armMass, loadTolerance] of [
            [0, 1e-6],
            [0.8, 1e-3],
        ] as const) {
            const hands = { ...TEST_HANDS, gripTension: gamma, armMass };
            const arc = levelArc(vec3(0, 0, TEST_HEAD.radius + 1e-3));
            const track = prepareTrack(trackDrive(arc, TEST_COUPLING, hands), TEST_HEAD, g);
            const probe = lastStep();
            const start = headOnPath(track, TEST_HEAD, 0);
            const run = integrate(isolated({ start, drive: track, gravity: g, headTurf: LAW }), { probe });
            const M = TEST_HEAD.mass + armMass;
            const damping = 2 * TEST_COUPLING.dampingRatio * M * ((2 * Math.PI) / TEST_COUPLING.period);
            const terminal = ((1 - gamma) * TEST_HEAD.mass * g) / (damping * Math.sqrt(gamma));
            const line = run.timeline[HEAD_TURF_KEY] ?? [];
            expect(line, `armMass ${armMass}`).toHaveLength(1);
            expect(line[0]?.start).toBeGreaterThanOrEqual(1e-3 / terminal);
            expect(line[0]?.end).toBe(run.duration);
            expect(run.events.map((e) => e.kind)).toEqual(["impact-cap"]);
            expect(run.duration).toBeGreaterThanOrEqual(TRACK_IMPACT_CAP);
            expect(length(run.head.velocity)).toBeLessThan(1e-6);
            const rest = (1 - gamma) * TEST_HEAD.mass * g;
            const load = ((probe.last as ImpactSnapshot).headTurf as Vec3).z;
            expect(Math.abs(load - rest) / rest, `armMass ${armMass}`).toBeLessThan(loadTolerance);
        }
    });

    it("is given to a tracked drive and not to a force table", () => {
        const world = testWorld();
        const blue = ballAt(5, 0);
        const turf = world.lawn.surfaceAt(blue.position);
        const tracked = onArc(trackDrive(levelArc(vec3(4, 0, 0.1))));
        expect(prepareImpact(tracked, { blue }, world).headTurf).toEqual(
            lawFromStiffness(TEST_HEAD.mass, turf.turfRestitution, turf.turfStiffness, HEAD_TURF_FRICTION),
        );
        expect(prepareImpact(strike(blue.position), { blue }, world).headTurf).toBeNull();
    });

    it("rejects a tracked drive over turf the head–turf law cannot use", () => {
        // The lawn is good at the ball and the court's centre (validateWorld samples there), bad under the head.
        const good = testWorld().lawn.surfaceAt(vec3(15, 20, 0));
        const under = (bad: Partial<SurfaceProps>) =>
            testWorld({
                lawn: { width: 30, length: 40, surfaceAt: (p) => (p.x < 4.5 ? { ...good, ...bad } : good) },
            });
        const blue = ballAt(5, 0);
        const tracked = onArc(trackDrive(levelArc(vec3(4.2, 0, TEST_HEAD.radius + 0.01))));
        expect(() => simulateImpact(tracked, { blue }, under({ turfStiffness: 0 }))).toThrow(
            /turfStiffness under the head must be a positive finite number/,
        );
        expect(() => simulateImpact(tracked, { blue }, under({ turfRestitution: 0 }))).toThrow(
            /turfRestitution under the head must lie in \(0, 1\]/,
        );
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/engine/impact/contacts.test.ts tests/engine/impact/headTurf.test.ts`
Expected: FAIL.
- contacts: `TypeError: headBottom is not a function` and `headTurfContact is not a function` (the `HEAD_TURF_KEY`
  assertion is not reached).
- headTurf: `integrate` ignores the unknown `headTurf` field, so every undriven head falls through the turf (the
  settle and slide assertions fail, `run.timeline["head/turf"]` is `undefined`, `impact-mallet-grounded` is raised).
  `HEAD_DEEP_LIMIT` is `undefined`, so the depth case starts at a NaN height and raises no `impact-head-deep`. The
  relaxed head sinks through the turf (no interval, `toHaveLength(1)` fails on `[]`). `prepareImpact(...).headTurf` is
  `undefined`. `simulateImpact` does not throw on the bad turf under the head.

Run: `npm run check`
Expected: type errors: the missing exports (`headBottom`, `headTurfContact`, `HEAD_TURF_KEY`, `HEAD_DEEP_LIMIT`,
`HEAD_TURF_FRICTION`), `headTurf` unknown in `Partial<ImpactSetup>`, `headTurf` missing from `ImpactSnapshot` and
`ImpactSetup`, `headTurfSlide` missing from `ImpactRun`, and `"impact-head-deep"` not among `ImpactEvent`'s kinds
(TS2367, and `t` read on `never`).

- [ ] **Step 3: Add the geometry to `contacts.ts`**

In the file header, after its last sentence ("…to the ball's centre."), add: "The head–turf pair (P2b.2b.1 design
§4.1) acts from the turf on the head's lowest point, along ẑ." Then append to the file:

```ts
/** Key of the head–turf pair (P2b.2b.1 design §4.3). */
export const HEAD_TURF_KEY = "head/turf";

/**
 * The head's lowest point (P2b.2b.1 design §4.1). With a the unit axis and |a_z| < 1, it is
 * c − (L/2)·sign(a_z)·a − r·u, u the unit vector of ẑ − a_z·a: the lower end disc's rim, straight below the axis. For
 * a_z = 0 it lies under the centre, on the barrel; for |a_z| = 1, the face disc is level and it is the disc's centre.
 * Its height is headLowestPoint's, up to rounding.
 */
export function headBottom(state: HeadState, head: MalletHead): Vec3 {
    const a = rotate(state.orientation, vec3(1, 0, 0));
    const half = head.length / 2;
    const end = a.z > 0 ? scale(a, half) : a.z < 0 ? scale(a, 0 - half) : vec3(0, 0, 0);
    const rise = vec3(0 - a.z * a.x, 0 - a.z * a.y, 1 - a.z * a.z);
    const size = length(rise);
    const across = size > 0 ? scale(rise, head.radius / size) : vec3(0, 0, 0);
    return sub(sub(state.position, end), across);
}

/** The turf's contact with the head: closed while its lowest point is below the turf plane, along ẑ, acting there. */
export function headTurfContact(state: HeadState, head: MalletHead): Penetration | null {
    const point = headBottom(state, head);
    if (!(point.z < 0)) {
        return null;
    }
    return { normal: UP, depth: 0 - point.z, point };
}
```

The pair acts at the lowest point itself, with no δ/2 shift: the head is not a sphere, and spec §4.1 puts both forces
at that point.

- [ ] **Step 4: Add the event and the slide to the types**

In `src/engine/impact/types.ts`, the `ImpactEvent` comment and union become:

```ts
/**
 * Something that happened during the impact; t is seconds from its start. `turf-lift`: a ball's centre first rose to
 * z = R from below. The others mark a result outside the validated model, as phase 2's jump flag does:
 * - `impact-cap`: the impact reached its cap (IMPACT_CAP, or TRACK_IMPACT_CAP for a tracked drive);
 * - `impact-head-approaching`: when it ended the head was still closing on a ball within reach (a force table's
 *   second strike, a double tap, is a fault and is not modelled; a tracked drive integrates it and so raises this only
 *   at the cap);
 * - `impact-mallet-grounded`: part of the head went below the turf plane with no head–turf pair (a force table:
 *   mallet–turf contact is not modelled);
 * - `impact-head-deep`: the head went more than HEAD_DEEP_LIMIT below the turf plane, where the head–turf pair is not
 *   credible (P2b.2b.1 design §4.2);
 * - `impact-off-face`: a ball reached the rim of a face rather than the face (edge strokes are not modelled).
 */
export type ImpactEvent =
    | { readonly kind: "turf-lift"; readonly t: number; readonly ball: BallId }
    | { readonly kind: "impact-cap"; readonly t: number }
    | { readonly kind: "impact-head-approaching"; readonly t: number; readonly ball: BallId }
    | { readonly kind: "impact-mallet-grounded"; readonly t: number }
    | { readonly kind: "impact-head-deep"; readonly t: number }
    | { readonly kind: "impact-off-face"; readonly t: number; readonly ball: BallId };
```

In `ImpactRun`, `peakPenetration`'s comment becomes:

```ts
    /**
     * Deepest penetration (m) of every pair that closed, keyed "face/<ball>", "<ball>/<ball>", "turf/<ball>",
     * "<ball>@<obstacle id>" or "head/turf".
     */
```

and add after `touchingAtStart`:

```ts
    /**
     * Slip distance (m) at the head's contact point with the turf (P2b.2b.1 design §4.3): |horizontal velocity of the
     * head's material at its lowest point|·dt, summed per step while δ > 0; absent when the pair never closed.
     */
    readonly headTurfSlide?: number;
```

In `src/engine/types.ts`, `Lawn.surfaceAt`'s comment becomes:

```ts
    /**
     * Surface properties at a position. v1 lawns are uniform; the engine samples this at each segment start, and at
     * the start of an impact at each ball and under a tracked drive's head.
     */
```

- [ ] **Step 5: Integrate the pair**

In `src/engine/impact/integrate.ts`:

Imports (D6.3: `type PairLaw`, `horizontal` and `vec3` are already imported): add
`import { contactReference } from "../../reference/index";` before the `../math/vec3` import (Task 4 imports it in
`track.ts` only), and add `HEAD_TURF_KEY` and `headTurfContact` to the `./contacts` import.

In the file header, item 1 (as Task 4 left it) becomes:

```ts
 * 1. computes every force from the current state: the hands' load (a force table at the socket, or a tracked drive's
 *    two hands, track.ts) and gravity, then each closed pair in pair-list order, then the head–turf pair if the set-up
 *    has it (P2b.2b.1 design §4);
```

The end-rule paragraph that begins "The impact ends once" becomes (D6.2, rewrapped):

```ts
 * The impact ends once a face–ball contact has closed, the drive window has closed, no face–ball, ball–ball,
 * ball–obstacle or head–turf contact has been closed for RELEASE_STEPS steps, and no ball in turf contact is still
 * bouncing in it; or at the cap. A ball bounces while its vertical oscillation energy about the static sink δ₀ = m·g/k,
 * ½·m·v_z² + ½·k·(δ − δ₀)², exceeds the static spring's ½·k·δ₀²: it will reach δ = 0 and leave the turf, so the
 * turf's rebound, which dominates lift, is integrated rather than discarded at handover. Below that the ball only
 * settles in its hollow, and the handover discards at most m·g·δ₀/2 (design §6). Isolated set-ups (tests) may give
 * balls any state and leave the turf out; simulateImpact.ts prepares and validates real ones.
```

`RELEASE_STEPS`'s comment becomes (pre-flight D6.4):

```ts
/**
 * Consecutive steps without a closed face–ball, ball–ball, ball–obstacle or head–turf contact after which the impact
 * may end. A numerical allowance for a contact to re-close (a croquet stroke's balls part and meet again), not
 * physical. Pre-flight: ×4 moves no ball's state 50 ms after the strike by more than 2.8e-4 of the head speed.
 */
```

After `TRACK_IMPACT_CAP` add:

```ts
/**
 * Depth (m) below the turf plane past which a head with the head–turf pair raises `impact-head-deep` (P2b.2b.1 design
 * §4.2; reference/contact.json): a model limit, past which a plane turf with a linear spring is not credible for it.
 */
export const HEAD_DEEP_LIMIT = contactReference.headDeepLimit.value;
```

In `ImpactSetup`, add after `obstacles`:

```ts
    /**
     * The head–turf pair's law (P2b.2b.1 design §4.1), or null to leave the pair out: prepareImpact solves it for a
     * tracked drive and gives a force table none. Isolated set-ups (tests) may give any head the pair.
     */
    readonly headTurf: PairLaw | null;
```

In `ImpactSnapshot`, after `hand`:

```ts
    /** The turf's total force on the head (zero while the pair is open); absent without the head–turf pair. */
    readonly headTurf?: Vec3;
```

After `applyPair`, add:

```ts
/** The head–turf pair while the impact runs (design §4). */
interface HeadTurfState {
    readonly law: PairLaw;
    /** Elastic tangential displacement ξ; cleared whenever the pair is open. */
    spring: Vec3;
    peak: number;
    readonly line: PairTimeline;
    /** Slip distance (m) at the contact point: |horizontal velocity of the head's material|·dt, summed while closed. */
    slide: number;
}

/**
 * The head–turf pair in one step (design §4.1), from the current state: the turf's clamped spring–dashpot and
 * Cundall–Strack friction act on the head at its lowest point. Adds the force and its moment about the head's centre
 * to the head's loads, records the step and the slide, and returns the force on the head, or null while the pair is
 * open.
 */
function applyHeadTurf(
    p: HeadTurfState,
    state: HeadState,
    head: MalletHead,
    dt: number,
    loads: StepLoads,
    t: number,
): Vec3 | null {
    const contact = headTurfContact(state, head);
    if (contact === null) {
        p.spring = ZERO;
        recordStep(p.line, false, 0, t);
        return null;
    }
    p.peak = Math.max(p.peak, contact.depth);
    const u = pointVelocity(state.position, state.velocity, state.angularVelocity, contact.point);
    const normal = normalForce(p.law, contact.depth, 0 - u.z);
    const slip = horizontal(u);
    const tangential = tangentialForce(p.law, add(horizontal(p.spring), scale(slip, dt)), slip, normal);
    p.spring = tangential.spring;
    const force = add(vec3(0, 0, normal), tangential.force);
    loads.headForce = add(loads.headForce, force);
    loads.headTorque = add(loads.headTorque, cross(sub(contact.point, state.position), force));
    p.slide += length(slip) * dt;
    recordStep(p.line, true, normal, t);
    return force;
}
```

`finish` gains the pair. Its comment, its parameters (`turf` after `pairs`) and its return become:

```ts
/**
 * The run's result once the loop has ended at `duration`: each ball's final state, an `impact-head-approaching` event
 * for every ball the head is still closing on, every pair's peak penetration, the contact timeline, the pairs touching
 * at the start and, if the head–turf pair closed, its peak penetration, intervals and slide.
 */
function finish(
    setup: ImpactSetup,
    state: HeadState,
    balls: readonly BallState[],
    pairs: readonly PairState[],
    turf: HeadTurfState | null,
    events: ImpactEvent[],
    steps: number,
    duration: number,
    touchingAtStart: readonly string[],
): ImpactRun {
    const final: BallStates = {};
    for (let i = 0; i < balls.length; i++) {
        const s = balls[i] as BallState;
        const id = (setup.balls[i] as ImpactBall).id;
        final[id] = s;
        if (headClosing(state, setup.head, s, setup.ball.radius)) {
            events.push({ kind: "impact-head-approaching", t: duration, ball: id });
        }
    }
    const peakPenetration: Record<string, number> = {};
    for (const p of pairs) {
        if (p.peak > 0) {
            peakPenetration[p.pair.key] = p.peak;
        }
    }
    const timeline: Record<string, readonly ContactInterval[]> = {};
    for (const p of pairs) {
        const intervals = closeTimeline(p.line, duration);
        if (intervals.length > 0) {
            timeline[p.pair.key] = intervals;
        }
    }
    const run = { balls: final, head: state, duration, events, peakPenetration, steps, timeline, touchingAtStart };
    const turfIntervals = turf === null ? [] : closeTimeline(turf.line, duration);
    if (turf === null || turfIntervals.length === 0) {
        return run;
    }
    peakPenetration[HEAD_TURF_KEY] = turf.peak;
    timeline[HEAD_TURF_KEY] = turfIntervals;
    return { ...run, headTurfSlide: turf.slide };
}
```

(The body above `const run` is `main`'s, unchanged; Task 4 does not touch `finish`.)

In `integrate`, after `const offFace = …`, add:

```ts
    const turf: HeadTurfState | null =
        setup.headTurf === null
            ? null
            : { law: setup.headTurf, spring: ZERO, peak: 0, line: emptyTimeline(), slide: 0 };
    let deep = false;
```

After the pair loop, before the step advances the bodies (`state = advance(…)`), add:

```ts
        // The head–turf pair comes after every other pair (design §4.1).
        const turfForce = turf === null ? null : applyHeadTurf(turf, state, head, dt, loads, t);
        if (turfForce !== null) {
            hardClosed = true;
        }
```

Replace the grounded check (`if (!grounded && headLowestPoint(state, head) < 0) { … }`) with:

```ts
        if (turf === null) {
            if (!grounded && headLowestPoint(state, head) < 0) {
                grounded = true;
                events.push({ kind: "impact-mallet-grounded", t: now });
            }
        } else if (!deep && headLowestPoint(state, head) < 0 - HEAD_DEEP_LIMIT) {
            deep = true;
            events.push({ kind: "impact-head-deep", t: now });
        }
```

The probe call adds the turf force after Task 4's `hand`, and sends the plain snapshot only when there is neither:

```ts
        if (options.probe) {
            const snapshot: ImpactSnapshot = { t: now, drive, head: state, balls: [...balls], contacts: samples };
            options.probe.step(
                hand === null && turf === null
                    ? snapshot
                    : {
                          ...snapshot,
                          ...(hand === null
                              ? {}
                              : {
                                    hand: {
                                        force: hand.force,
                                        feedForward: hand.feedForward,
                                        top: hand.top,
                                        bottom: hand.bottom,
                                    },
                                }),
                          ...(turf === null ? {} : { headTurf: turfForce ?? ZERO }),
                      },
            );
        }
```

(Task 4's `hand` object is kept as it was; only the condition and the `headTurf` spread are new.) In the `finish(`
call at the end of `integrate`, add `turf` after `pairs`.

The pair's moment is about the head's centre, as `applyPair`'s face moment is; Task 4's step moves it to the swung
body's centre for a tracked drive.

- [ ] **Step 6: Give isolated set-ups no head–turf pair by default**

In `tests/engine/support/impact.ts`, `isolated`'s defaults gain `headTurf: null,` after `obstacles: [],`, and its
comment becomes (D6.5):

```ts
/**
 * An isolated set-up for `integrate`: by default the head parked far away (it never touches anything) and undriven,
 * gravity off, the test face and test ball–ball laws, no balls, no obstacles and no head–turf pair. Override what a
 * case needs.
 */
```

- [ ] **Step 7: Solve the pair's law in `prepareImpact`, and check the turf under the head**

In `src/engine/impact/simulateImpact.ts`, add `import { contactReference } from "../../reference/index";`, add
`headBottom` to the `./contacts` import, and `type PairLaw` to the `./contactLaw` import. The file header becomes
(D6.5):

```ts
/**
 * Phase 1 of a shot (P2b.1 design §3). Checks the ContactState and the balls. Solves every contact law once: face–ball
 * and ball–ball once, ball–turf once per ball from the surface where it lies, and the head–turf law once for a tracked
 * drive, from the surface under the head's lowest point. Prepares a tracked drive once (track.ts). Starts each ball at
 * its static turf sink m·g/k_turf, so that the impact does not open with a spurious bounce. Each obstacle's law is
 * solved once: the ball's mass (the obstacle is immovable), the obstacle's material and its own contact time.
 * Integrates the impact and hands the balls over to phase 2.
 */
```

After `PLACEMENT_PASSES` add:

```ts
/**
 * Friction of the mallet head on the turf (P2b.2b.1 design §4.1; reference/contact.json): the analogue of a ball
 * sliding on the turf. Provisional; P2b.2b.2 sources it.
 */
export const HEAD_TURF_FRICTION = contactReference.headTurfFriction.value;

/**
 * The head–turf law of a tracked drive, or null for a force table (design §4.1): the turf's stiffness, and damping
 * solved from its restitution with the head's mass, sampled once at the head's lowest point at t = 0.
 */
function headTurfLaw(contact: ContactState, world: World): PairLaw | null {
    if (contact.drive.kind === "force") {
        return null;
    }
    const surface = world.lawn.surfaceAt(headBottom(contact, contact.head));
    return lawFromStiffness(contact.head.mass, surface.turfRestitution, surface.turfStiffness, HEAD_TURF_FRICTION);
}
```

In `validateImpact`, Task 5's tracked branch becomes (the two checks after Task 5's `validateTrack` call are new):

```ts
    if (contact.drive.kind === "force") {
        validateForce(contact.drive);
    } else {
        validateTrack(contact.drive);
        const surface = world.lawn.surfaceAt(headBottom(contact, head));
        positive(surface.turfStiffness, "turfStiffness under the head");
        restitution(surface.turfRestitution, "turfRestitution under the head");
    }
```

and its header list gains, after the tracked-drive item:

```ts
 * - for a tracked drive, turf under the head's lowest point with a non-positive stiffness or a restitution outside
 *   (0, 1] (the head–turf law, P2b.2b.1 design §4.1);
```

In `prepareImpact`'s returned set-up, add `headTurf: headTurfLaw(contact, world),` after `obstacles`.

- [ ] **Step 8: Run the tests**

Run: `npx vitest run tests/engine/impact/contacts.test.ts tests/engine/impact/headTurf.test.ts`
Expected: PASS. If a behaviour figure misses (the relaxed head's interval count, rest speed or load; the nearly-level
spin), print it and report it before changing an expectation.

- [ ] **Step 9: Format, check, verify bit-identity**

Run: `npx prettier --write src/engine/impact/contacts.ts src/engine/impact/types.ts src/engine/types.ts
src/engine/impact/integrate.ts src/engine/impact/simulateImpact.ts tests/engine/support/impact.ts
tests/engine/impact/contacts.test.ts tests/engine/impact/headTurf.test.ts`

Run: `env LC_ALL=en_GB.UTF-8 grep -nE "^.{121,}$" src/engine/impact/contacts.ts src/engine/impact/types.ts
src/engine/types.ts src/engine/impact/integrate.ts src/engine/impact/simulateImpact.ts tests/engine/support/impact.ts
tests/engine/impact/contacts.test.ts tests/engine/impact/headTurf.test.ts`
Expected: no output (prettier does not rewrap comments).

Run: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`
Expected: all pass.

Run: `env OBSTACLE_STROKES=2000 npx --yes tsx scripts/impactDigest.ts > "<temp>/digest-6.txt"`
Run: `cmp "<temp>/digest-base.txt" "<temp>/digest-6.txt"`
Expected: no output. A force table gets no pair (`headTurf` null), so its loop computes exactly what it did.

- [ ] **Step 10: Commit**

Write the message to `$CLAUDE_TEMP_DIR/msg.txt`:

```text
Add mallet–turf contact for tracked drives

A tracked drive's head now meets the turf: a head–turf pair after every
other pair, the turf's spring–dashpot solved with the head's mass and
Cundall–Strack friction, both at the head's lowest point. It records its
intervals, peak penetration and slide, raises impact-head-deep past
HEAD_DEEP_LIMIT and reports the turf's force to the probe. Force tables
get no pair and keep impact-mallet-grounded, so they stay bit-identical.
```

Run: `git add src/engine/impact/contacts.ts src/engine/impact/types.ts src/engine/types.ts
src/engine/impact/integrate.ts src/engine/impact/simulateImpact.ts tests/engine/support/impact.ts
tests/engine/impact/contacts.test.ts tests/engine/impact/headTurf.test.ts`

Run, with the sandbox disabled for signing: `git commit -F <msg>`, where `<msg>` is the literal path of
`$CLAUDE_TEMP_DIR/msg.txt` (worktree sessions refuse the variable in a commit).

Run: `git log -1 "--format=%G? %h"`
Expected: `G` and the new commit's hash. If signing refuses, leave the change staged and report it.

---
### Task 7: The whole head meets the balls; the re-entry guard

Spec §4.5 and §3.7 (`headRegions`, `entryJumps`). For a tracked drive each face–ball pair treats the whole head as a
solid cylinder: the ball's centre's signed distance from it, continuous across the face, rim, barrel, back rim and back,
so no part of the head passes through a ball and no contact opens deep by changing region (the roll catapult's
mechanism). The pair keeps its key `face/<ball>`, its timeline and the face pair's law on every region; it also records
its intervals per region (`ImpactRun.headRegions`), and a contact on any region but the face raises `impact-off-face`
for that ball, once. A re-entry guard counts every `face/<ball>` or `head/turf` interval that opens deeper than one
step's closing could make (`ImpactRun.entryJumps`, the catapult's signature; exit criterion 4 asserts none). A force
table keeps the face-only contact (`faceContact`, `OFF_FACE`) and reports neither record, so force tables stay
bit-identical.

Design choices, within the spec:
- **Region intervals carry the pair's normal force** as their peak, so a region's interval equals the pair's when the
  ball touches one region only.
- **`headRegions` is present for every tracked run** (an empty record when no ball was touched), as `entryJumps` is.
- **A centre on the head's axis in the barrel region throws a `RangeError`**, as `ballBallContact` and
  `obstacleContact` do for their degenerate centres. It needs the ball's centre at least r inside both faces, which
  the guard would have flagged long before.
- **`ENTRY_SLACK` = 1e-6 m is a named, exported constant** in integrate.ts (the spec's 1e-6 m), so the tests state the
  worst excess exactly.

Planning check: a scratch build of `main` with Tasks 6 and 7's code, the tracked branch switched by a stub, passed
this task's contacts tests, ran the region, inside-ball and at-speed cases through the whole-head path, passed lint,
the type check and prettier, and gave a digest byte-identical to `main`'s.

**Files:**
- Modify: `src/engine/impact/contacts.ts`, `src/engine/impact/types.ts`, `src/engine/impact/integrate.ts`,
  `tests/engine/impact/contacts.test.ts`
- Create: `tests/engine/impact/headBall.test.ts`

**Interfaces:**
- Consumes: Task 6's `HEAD_TURF_KEY`, `HeadTurfState`, `applyHeadTurf`, `finish(…, turf, …)` and
  `ImpactSetup.headTurf`; Task 4's tracked drive in `integrate` (`ImpactSetup.drive: ForceDrive | PreparedTrack`);
  Task 3's `prepareTrack`, `headOnPath` and the `Hands` type; test support `TEST_COUPLING`, `TEST_HANDS`, `levelArc`,
  `trackDrive` (Task 3), `freeBall`, `isolated` (on `main`).
- Produces:
  - `type HeadRegion = "face" | "rim" | "barrel" | "back-rim" | "back"`, `HEAD_REGIONS: readonly HeadRegion[]` in that
    order, `interface HeadPenetration extends Penetration { region: HeadRegion }`,
    `headBallContact(state: HeadState, head: MalletHead, centre: Vec3, radius: number): HeadPenetration | null`
    (contacts.ts);
  - `ENTRY_SLACK = 1e-6` (integrate.ts);
  - `ImpactRun.headRegions?: Readonly<Record<string, readonly ContactInterval[]>>` (keys `face/<ball>#<region>`) and
    `ImpactRun.entryJumps?: { count: number; worst: number; keys: readonly string[] }` (keys
    `face/<ball>#<region>@<t>` and `head/turf@<t>`), both present for every tracked run and absent for a force table.

- [ ] **Step 1: Write the failing tests**

In `tests/engine/impact/contacts.test.ts`, extend the imports (Task 6's lines):
- the vec3 import becomes `import { ZERO, add, dot, horizontal, length, scale, sub, vec3, type Vec3 } from
  "../../../src/engine/math/vec3";`;
- the contacts import gains `HEAD_REGIONS`, `headBallContact`, `type HeadPenetration` and `type HeadRegion`, in
  alphabetical place (`HEAD_REGIONS` before `HEAD_TURF_KEY`, `headBallContact` before `headBottom`, the types before
  `type ObstacleGeometry`);
- the rigidBody import becomes `import { IDENTITY, axisAngle, multiply, rotate, type Quaternion } from
  "../../../src/engine/impact/rigidBody";`.

Append:

```ts
describe("the whole head against a ball (headBallContact)", () => {
    const POSE: HeadState = {
        position: vec3(1, 2, 0.3),
        orientation: multiply(axisAngle(vec3(0, 0, 1), 0.4), axisAngle(vec3(0, 1, 0), -0.3)),
        velocity: ZERO,
        angularVelocity: ZERO,
    };
    /** A point given in POSE's head frame, in the world frame. */
    const at = (b: Vec3): Vec3 => add(POSE.position, rotate(POSE.orientation, b));
    const s = Math.SQRT1_2;
    const D = 0.01;
    // Each region's surface point and outward normal, head frame (HEAD: L/2 = 0.1, r = 0.03). The rim point lies on
    // the face's edge, radially along (0, 0.6, 0.8).
    const REGIONS: readonly [HeadRegion, Vec3, Vec3][] = [
        ["face", vec3(0.1, 0.01, -0.005), vec3(1, 0, 0)],
        ["rim", vec3(0.1, 0.018, 0.024), vec3(s, 0.6 * s, 0.8 * s)],
        ["barrel", vec3(0.02, 0, -0.03), vec3(0, 0, -1)],
        ["back-rim", vec3(-0.1, 0, -0.03), vec3(-s, 0, -s)],
        ["back", vec3(-0.1, 0, 0.01), vec3(-1, 0, 0)],
    ];

    it("lists the regions in their order", () => {
        expect(HEAD_REGIONS).toEqual(["face", "rim", "barrel", "back-rim", "back"]);
        expect(REGIONS.map(([region]) => region)).toEqual(HEAD_REGIONS);
    });

    it.each(REGIONS)("reports a ball against the %s with its region, normal, depth and point", (region, surface, n) => {
        const centre = at(add(surface, scale(n, R - D)));
        const contact = headBallContact(POSE, HEAD, centre, R) as HeadPenetration;
        const normal = rotate(POSE.orientation, n);
        // A turned pose at metre scale rounds at about 1e-16 m; 1e-12 leaves a wide margin and no room for an error.
        expect(contact.region).toBe(region);
        expect(contact.depth).toBeCloseTo(D, 12);
        expect(length(sub(contact.normal, normal))).toBeLessThan(1e-12);
        expect(length(sub(contact.point, sub(centre, scale(normal, R - D / 2))))).toBeLessThan(1e-12);
    });

    it.each(REGIONS)("is open for a ball just clear of the %s", (_region, surface, n) => {
        expect(headBallContact(POSE, HEAD, at(add(surface, scale(n, R + 1e-9))), R)).toBeNull();
    });

    it("breaks ties as the spec does: a rim only off both, else a disc only where e_x > e_r", () => {
        // Binary-exact dimensions at the origin, so the ties are exact: L/2 = 0.125, r = 0.0625, offsets of 1/32.
        const exact: MalletHead = { ...HEAD, length: 0.25, radius: 0.0625 };
        const origin: HeadState = { position: ZERO, orientation: IDENTITY, velocity: ZERO, angularVelocity: ZERO };
        const cases: readonly [Vec3, HeadRegion, Vec3, number][] = [
            // Inside, e_x = e_r = −1/32: the barrel.
            [vec3(0.09375, 0.03125, 0), "barrel", vec3(0, 1, 0), -0.03125],
            // Ahead of the face, level with its edge, e_x = 1/32 and e_r = 0: the face.
            [vec3(0.15625, 0.0625, 0), "face", vec3(1, 0, 0), 0.03125],
            // Beside the barrel in the face's plane, e_x = 0 and e_r = 1/32: the barrel.
            [vec3(0.125, 0.09375, 0), "barrel", vec3(0, 1, 0), 0.03125],
        ];
        for (const [centre, region, normal, distance] of cases) {
            const contact = headBallContact(origin, exact, centre, R) as HeadPenetration;
            expect(contact.region).toBe(region);
            expect(contact.normal).toEqual(normal);
            expect(contact.depth).toBe(R - distance);
        }
    });

    it("keeps the distance continuous across every region boundary", () => {
        // Points 2·EPS apart either side of each boundary (head frame): the signed distance moves by at most 2·EPS
        // between them, plus rounding (about 1e-16 m at this pose).
        const EPS = 1e-9;
        const boundaries: readonly [HeadRegion, Vec3, HeadRegion, Vec3][] = [
            ["face", vec3(0.11, 0.03 - EPS, 0), "rim", vec3(0.11, 0.03 + EPS, 0)],
            ["rim", vec3(0.1 + EPS, 0, 0.04), "barrel", vec3(0.1 - EPS, 0, 0.04)],
            ["face", vec3(0.095, 0, 0.025 - EPS), "barrel", vec3(0.095, 0, 0.025 + EPS)],
            ["back", vec3(-0.11, 0.03 - EPS, 0), "back-rim", vec3(-0.11, 0.03 + EPS, 0)],
            ["back-rim", vec3(-0.1 - EPS, 0, 0.04), "barrel", vec3(-0.1 + EPS, 0, 0.04)],
            ["back", vec3(-0.095, 0, 0.025 - EPS), "barrel", vec3(-0.095, 0, 0.025 + EPS)],
        ];
        for (const [first, a, second, b] of boundaries) {
            const p = headBallContact(POSE, HEAD, at(a), R) as HeadPenetration;
            const q = headBallContact(POSE, HEAD, at(b), R) as HeadPenetration;
            expect([p.region, q.region]).toEqual([first, second]);
            expect(Math.abs(p.depth - q.depth)).toBeLessThan(2 * EPS + 1e-12);
        }
    });

    it("has no normal for a centre on the axis deep inside the barrel, and throws", () => {
        expect(() => headBallContact(POSE, HEAD, POSE.position, R)).toThrow(RangeError);
        expect(() => headBallContact(POSE, HEAD, POSE.position, R)).toThrow(/centre on the head's axis/);
    });
});
```

Create `tests/engine/impact/headBall.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { lawFromStiffness } from "../../../src/engine/impact/contactLaw";
import { HEAD_TURF_KEY, type HeadRegion } from "../../../src/engine/impact/contacts";
import { ENTRY_SLACK, integrate, type ImpactBall, type ImpactSetup } from "../../../src/engine/impact/integrate";
import { IDENTITY } from "../../../src/engine/impact/rigidBody";
import { headOnPath, prepareTrack } from "../../../src/engine/impact/track";
import type { Hands, SwingArc } from "../../../src/engine/impact/types";
import { ZERO, add, dot, scale, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import type { BallState } from "../../../src/engine/types";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import { TEST_BALL, TEST_TURF } from "../support/fixtures";
import { TEST_COUPLING, TEST_HANDS, TEST_HEAD, freeBall, isolated, levelArc, trackDrive } from "../support/impact";

const R = TEST_BALL.radius;
const L = TEST_HEAD.length;
const RHO = TEST_HEAD.radius;
/** The head's centre on the paths here, level, body frame along the world's; gravity is off unless a case sets it. */
const C = vec3(0, 0, 1);
/** A levelArc's pivot from the head's centre: its radius plus the socket's height. */
const ARM = levelArc(C).radius + TEST_HEAD.socket.z;
const NO_JUMPS = { count: 0, worst: 0, keys: [] };
const TURF = lawFromStiffness(TEST_HEAD.mass, TEST_TURF.turfRestitution, TEST_TURF.turfStiffness, 0.5);

/** An isolated set-up whose head is held on `arc`'s path, by TEST_COUPLING and `hands`, with `balls`. */
function held(
    arc: SwingArc,
    balls: readonly ImpactBall[],
    over: Partial<ImpactSetup> = {},
    hands: Hands = TEST_HANDS,
): ImpactSetup {
    const track = prepareTrack(trackDrive(arc, TEST_COUPLING, hands), TEST_HEAD, over.gravity ?? 0);
    return isolated({ start: headOnPath(track, TEST_HEAD, 0), drive: track, balls, ...over });
}

describe("the whole head against a ball (a tracked drive)", () => {
    const s = Math.SQRT1_2;
    // Each region's surface point, from the head's centre, and its outward normal.
    const REGIONS: readonly [HeadRegion, Vec3, Vec3][] = [
        ["face", vec3(L / 2, 0, 0), vec3(1, 0, 0)],
        ["rim", vec3(L / 2, 0.6 * RHO, 0.8 * RHO), vec3(s, 0.6 * s, 0.8 * s)],
        ["barrel", vec3(0, RHO, 0), vec3(0, 1, 0)],
        ["back-rim", vec3(-L / 2, 0, -RHO), vec3(-s, 0, -s)],
        ["back", vec3(-L / 2, 0, 0), vec3(-1, 0, 0)],
    ];

    it.each(REGIONS)("meets a ball on the %s, records it by region and flags it once off the face", (region, at, n) => {
        // The ball starts 0.1 mm clear and moves in along the normal at 1 m/s; the head is held on a still path.
        // Prototype (aeadd4c): one interval, the ball leaving outward, no entry jump, on every region.
        const ball = freeBall("blue", add(add(C, at), scale(n, R + 1e-4)), scale(n, -1));
        const run = integrate(held(levelArc(C), [ball]), { cap: 5e-3 });
        const key = `face/blue#${region}`;
        expect(Object.keys(run.headRegions ?? {})).toEqual([key]);
        expect(run.timeline["face/blue"]).toHaveLength(1);
        expect(run.headRegions?.[key]).toEqual(run.timeline["face/blue"]);
        expect(dot((run.balls.blue as BallState).velocity, n)).toBeGreaterThan(0);
        const flagged = run.events.filter((e) => e.kind === "impact-off-face").map((e) => ("ball" in e ? e.ball : ""));
        expect(flagged).toEqual(region === "face" ? [] : ["blue"]);
        expect(run.entryJumps).toEqual(NO_JUMPS);
    });

    it("leaves a force table's face pair as it was: a ball passes through the barrel untouched", () => {
        // Passes before this task and after it: the force table keeps faceContact, which has no barrel.
        const ball = freeBall("blue", add(C, vec3(0, RHO + R + 1e-4, 0)), vec3(0, -1, 0));
        const start = { position: C, orientation: IDENTITY, velocity: ZERO, angularVelocity: ZERO };
        const run = integrate(isolated({ start, balls: [ball] }), { cap: 2e-3 });
        expect(run.timeline["face/blue"]).toBeUndefined();
        expect((run.balls.blue as BallState).velocity).toEqual(vec3(0, -1, 0));
        expect(run).not.toHaveProperty("headRegions");
        expect(run).not.toHaveProperty("entryJumps");
    });
});

describe("the re-entry guard", () => {
    it("counts a ball placed inside the head before a step as one entry jump, with its key and region", () => {
        // 2 mm into the barrel at rest: the interval's first step is 2 mm deep with no closing speed. Prototype: one
        // jump, worst 2e-3 − 1e-6 m.
        const ball = freeBall("blue", add(C, vec3(0, RHO + R - 2e-3, 0)));
        const run = integrate(held(levelArc(C), [ball]), { cap: 1e-3 });
        expect(run.entryJumps?.count).toBe(1);
        expect(run.entryJumps?.keys).toEqual(["face/blue#barrel@0"]);
        expect(run.entryJumps?.worst).toBeCloseTo(2e-3 - ENTRY_SLACK, 12);
        expect(Object.keys(run.headRegions ?? {})).toEqual(["face/blue#barrel"]);
    });

    it("counts a head started in the turf as one entry jump on head/turf, and reports none for a force table", () => {
        const low = vec3(0, 0, RHO - 3e-3);
        const over = { gravity: STANDARD_GRAVITY, headTurf: TURF };
        const run = integrate(held(levelArc(low), [], over), { cap: 1e-3 });
        expect(run.entryJumps?.count).toBe(1);
        expect(run.entryJumps?.keys).toEqual([`${HEAD_TURF_KEY}@0`]);
        expect(run.entryJumps?.worst).toBeCloseTo(3e-3 - ENTRY_SLACK, 12);
        const start = { position: low, orientation: IDENTITY, velocity: ZERO, angularVelocity: ZERO };
        expect(integrate(isolated({ start, ...over }), { cap: 1e-3 })).not.toHaveProperty("entryJumps");
    });

    it("counts none for a ball the head closes on at speed, on the face or on the rim", () => {
        // A contact closing at v_n opens at most v_n·dt deep in its first step. Prototype: no jump in any case.
        const cases: readonly [number, number, HeadRegion][] = [
            [3, 0, "face"],
            [10, 0, "face"],
            [3, RHO + 0.02, "rim"],
        ];
        for (const [speed, side, region] of cases) {
            // 1 µm ahead of the face; or, centre 20 mm out from the barrel's line, 0.1 mm off the rim.
            const ahead = side === 0 ? R + 1e-6 : Math.sqrt(R * R - 0.02 * 0.02) + 1e-4;
            const ball = freeBall("blue", add(C, vec3(L / 2 + ahead, side, 0)));
            const run = integrate(held(levelArc(C, { omega0: speed / ARM }), [ball]), { cap: 0.02 });
            expect(Object.keys(run.headRegions ?? {}), `${speed} m/s`).toEqual([`face/blue#${region}`]);
            expect(run.entryJumps, `${speed} m/s on the ${region}`).toEqual(NO_JUMPS);
        }
    });

    it("counts none for a relaxed head settling onto the turf", () => {
        // Task 6's relaxed head, γ_T = 0.1, 1 mm above the turf: it arrives at under 0.13 m/s. Prototype: no jump.
        const hands = { ...TEST_HANDS, gripTension: 0.1 };
        const over = { gravity: STANDARD_GRAVITY, headTurf: TURF };
        const run = integrate(held(levelArc(vec3(0, 0, RHO + 1e-3)), [], over, hands));
        expect(run.timeline[HEAD_TURF_KEY]).toHaveLength(1);
        expect(run.entryJumps).toEqual(NO_JUMPS);
        expect(run.headRegions).toEqual({});
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/engine/impact/contacts.test.ts tests/engine/impact/headBall.test.ts`
Expected: FAIL.
- contacts: `TypeError: headBallContact is not a function`; `HEAD_REGIONS` is `undefined`.
- headBall: a tracked drive still uses `faceContact`, and `run.headRegions` and `run.entryJumps` are `undefined`. The
  region cases fail on `Object.keys(run.headRegions ?? {})` (`[]`), the rim, barrel, back-rim and back balls passing
  into the head with no force; the guard cases fail on `run.entryJumps?.count` (`undefined`). The force-table
  pass-through case passes, before and after this task.

Run: `npm run check`
Expected: type errors: the missing exports (`HEAD_REGIONS`, `headBallContact`, `HeadPenetration`, `HeadRegion`,
`ENTRY_SLACK`) and `headRegions` and `entryJumps` missing from `ImpactRun`.

- [ ] **Step 3: Add the cylinder contact to `contacts.ts`**

In the file header, after the line ending with the sentence Task 6 added, add the line:

```ts
 * For a tracked drive the face–ball pair meets the whole head, a solid cylinder (design §4.5, headBallContact).
```

Then, after `faceContact`, add:

```ts
/** A region of the solid head a ball can touch (P2b.2b.1 design §4.5). */
export type HeadRegion = "face" | "rim" | "barrel" | "back-rim" | "back";

/** Every head region, in the order the integrator records them. */
export const HEAD_REGIONS: readonly HeadRegion[] = ["face", "rim", "barrel", "back-rim", "back"];

/** A head–ball contact on the solid cylinder, with the region touched. */
export interface HeadPenetration extends Penetration {
    readonly region: HeadRegion;
}

/**
 * The contact of a ball centred at `centre` with the whole head as a solid cylinder (P2b.2b.1 design §4.5). With a the
 * head's axis, x the centre's offset along it, ρ_b its distance from the axis and u the unit radial direction,
 * e_x = |x| − L/2 and e_r = ρ_b − r: off both (e_x > 0, e_r > 0) a rim (`rim` for x ≥ 0, else `back-rim`), at
 * √(e_x² + e_r²) along (e_x·sign(x)·a + e_r·u)/distance; otherwise, where e_x > e_r, an end disc (`face` for x ≥ 0,
 * else `back`), at e_x along sign(x)·a; otherwise the barrel, at e_r along u. The distance is the centre's signed
 * distance from the cylinder, continuous across the regions, so a contact never opens deep by changing region.
 * δ = R − distance closes the pair when positive, at c_b − (R − δ/2)·n. A centre on the axis in the barrel region has
 * no normal and throws a RangeError (it lies at least r inside both faces).
 */
export function headBallContact(
    state: HeadState,
    head: MalletHead,
    centre: Vec3,
    radius: number,
): HeadPenetration | null {
    const axis = rotate(state.orientation, vec3(1, 0, 0));
    const offset = sub(centre, state.position);
    const x = dot(offset, axis);
    const across = sub(offset, scale(axis, x));
    const radial = length(across);
    const ex = Math.abs(x) - head.length / 2;
    const er = radial - head.radius;
    const end = x >= 0 ? axis : scale(axis, -1);
    let distance: number;
    let normal: Vec3;
    let region: HeadRegion;
    if (ex > 0 && er > 0) {
        distance = Math.sqrt(ex * ex + er * er);
        normal = scale(add(scale(end, ex), scale(across, er / radial)), 1 / distance);
        region = x >= 0 ? "rim" : "back-rim";
    } else if (ex > er) {
        distance = ex;
        normal = end;
        region = x >= 0 ? "face" : "back";
    } else {
        if (radial === 0) {
            throw new RangeError("head–ball contact with a centre on the head's axis has no normal");
        }
        distance = er;
        normal = scale(across, 1 / radial);
        region = "barrel";
    }
    const depth = radius - distance;
    if (!(depth > 0)) {
        return null;
    }
    return { normal, depth, point: sub(centre, scale(normal, radius - depth / 2)), region };
}
```

- [ ] **Step 4: Add the records to `types.ts`**

In `src/engine/impact/types.ts`, the `impact-off-face` item of `ImpactEvent`'s comment becomes:

```ts
 * - `impact-off-face`: a ball touched the head off its face: a force table's face rim (edge strokes are not
 *   modelled), or any region but the face for a tracked drive (P2b.2b.1 design §4.5; no Law judgement is made of it
 *   in this phase).
```

`ContactInterval`'s comment becomes (D7.3):

```ts
/**
 * One contact interval of a pair (P2b.2a design §5): [start, end) in s from the impact's start, whole steps, and the
 * largest normal force (N) in it (0 at a force table's face rim, or for a pair overlapping but released). For a
 * face–ball pair, `clearanceAfter` (m) is the largest separation from the face in the gap before the next interval.
 */
```

`ImpactRun.timeline`'s comment becomes:

```ts
    /**
     * Contact intervals of every pair that was in contact, keyed as `peakPenetration` is, plus "<ball>@<obstacle id>".
     * In contact means closed, or a force table's face–ball pair at the rim (the Laws count any part of the mallet); a
     * tracked drive's face–ball pair covers the whole head (P2b.2b.1 design §4.5).
     */
```

and add after `headTurfSlide`:

```ts
    /**
     * A tracked drive's head–ball intervals per region of the head (P2b.2b.1 design §4.5), keyed
     * "face/<ball>#<region>", each with the pair's normal force; empty when no ball was touched. Absent for a force
     * table.
     */
    readonly headRegions?: Readonly<Record<string, readonly ContactInterval[]>>;
    /**
     * A tracked drive's re-entry guard (P2b.2b.1 design §4.5): how many face–ball and head–turf intervals began deeper
     * than one step's closing could make (|v_n|·dt + ENTRY_SLACK), the worst excess (m) and their keys,
     * "face/<ball>#<region>@<t>" or "head/turf@<t>" (t the step's start, s); count 0 when none did. Absent for a force
     * table.
     */
    readonly entryJumps?: { readonly count: number; readonly worst: number; readonly keys: readonly string[] };
```

- [ ] **Step 5: Meet the whole head in the integrator, and guard the entries**

In `src/engine/impact/integrate.ts`:

Imports: add `HEAD_REGIONS`, `headBallContact` and `type HeadRegion` to the `./contacts` import, in alphabetical
place (`type HeadRegion` before `type ObstacleGeometry`; `dot`, `sub` and `pointVelocity` are already imported).

In the file header, before the paragraph that begins "Every step also records whether each pair is in contact", add:

```ts
 * A tracked drive's face–ball pairs meet the whole head, a solid cylinder (contacts.ts headBallContact; P2b.2b.1
 * design §4.5): each also records its intervals per region of the head, and a contact off the face raises
 * `impact-off-face` once per ball. A face–ball or head–turf interval that opens deeper than one step's closing could
 * make counts an entry jump (ImpactRun.entryJumps). A force table keeps the face-only contact and neither record.
 *
```

After `HEAD_DEEP_LIMIT` add:

```ts
/**
 * Slack (m) of the re-entry guard (P2b.2b.1 design §4.5): a contact may open up to one step's closing |v_n|·dt deep,
 * plus this. Numerical, not physical: it covers the first step's second-order closing (a curved surface's or the
 * head's turn, about (v·dt)²/R, under 1e-7 m at 10 m/s) and rounding, and is 1/15,000 of the 15 mm at which the
 * catapult's contact opened.
 */
export const ENTRY_SLACK = 1e-6;
```

`PairState` gains, after `wakeAt`:

```ts
    /**
     * A tracked drive's face–ball pair: its timeline per head region, in HEAD_REGIONS order (design §4.5); null for
     * every other pair and for a force table.
     */
    readonly regions: readonly PairTimeline[] | null;
```

After `HeadTurfState` (Task 6), add:

```ts
/** A tracked impact's entry jumps (design §4.5), as ImpactRun.entryJumps reports them. */
interface EntryJumps {
    count: number;
    worst: number;
    readonly keys: string[];
}

/**
 * Counts an entry jump (design §4.5) when a contact opens `depth` deep, deeper than one step's closing at normal speed
 * `closing` could make, plus ENTRY_SLACK; `key` names the pair (and region), t is the step's start.
 */
function noteEntry(jumps: EntryJumps, depth: number, closing: number, dt: number, key: string, t: number): void {
    const excess = depth - (Math.abs(closing) * dt + ENTRY_SLACK);
    if (excess > 0) {
        jumps.count += 1;
        jumps.worst = Math.max(jumps.worst, excess);
        jumps.keys.push(`${key}@${t}`);
    }
}

/**
 * Records one step of a face–ball pair per head region (design §4.5): in contact on `region` with normal force
 * `force`, and out of contact on every other; nothing for a pair without regions.
 */
function recordRegions(
    lines: readonly PairTimeline[] | null,
    region: HeadRegion | null,
    force: number,
    t: number,
): void {
    if (lines === null) {
        return;
    }
    for (let i = 0; i < HEAD_REGIONS.length; i++) {
        const on = HEAD_REGIONS[i] === region;
        recordStep(lines[i] as PairTimeline, on, on ? force : 0, t);
    }
}
```

`applyHeadTurf` (Task 6) gains the guard: add the parameter `jumps: EntryJumps | null` after `t`, end its comment

```ts
 * to the head's loads, records the step and the slide, counts an entry jump if the pair opens too deep (`jumps`, a
 * tracked drive's), and returns the force on the head, or null while the pair is open.
```

(from "to the head's loads"), and after its `const u = pointVelocity(…)` line add:

```ts
    if (jumps !== null && p.line.start === null) {
        noteEntry(jumps, contact.depth, u.z, dt, HEAD_TURF_KEY, t);
    }
```

In `integrate`, the pair list becomes:

```ts
    const tracked = setup.drive.kind === "track";
    const pairs: PairState[] = pairList(
        ids,
        hasTurf,
        setup.obstacles.map((o) => o.id),
    ).map((pair) => ({
        pair,
        law: lawOf(setup, pair),
        spring: ZERO,
        peak: 0,
        line: emptyTimeline(),
        wakeAt: 0,
        regions: tracked && pair.kind === "face-ball" ? HEAD_REGIONS.map(() => emptyTimeline()) : null,
    }));
```

After Task 6's `let deep = false;` add:

```ts
    const jumps: EntryJumps | null = tracked ? { count: 0, worst: 0, keys: [] } : null;
```

The pair loop becomes:

```ts
        for (const p of pairs) {
            const { pair } = p;
            // A skipped pair was open when last evaluated: its spring is already ZERO and it has no open interval, so
            // evaluating it would change nothing.
            if (pair.kind === "ball-obstacle" && (travel[pair.b] as number) < p.wakeAt) {
                continue;
            }
            // A tracked drive's face–ball pair meets the whole head (design §4.5); a force table keeps the face alone.
            const hit =
                p.regions === null ? null : headBallContact(state, head, (balls[pair.b] as BallState).position, R);
            const contact = p.regions === null ? pairContact(pair, state, head, balls, R, setup.obstacles) : hit;
            if (contact === OFF_FACE || contact === null) {
                p.spring = ZERO;
                if (pair.kind === "ball-obstacle") {
                    const gap = obstacleGap(
                        (balls[pair.b] as BallState).position,
                        R,
                        setup.obstacles[pair.a] as ImpactObstacle,
                    );
                    p.wakeAt = (travel[pair.b] as number) + gap - WAKE_MARGIN;
                }
                if (contact === OFF_FACE && !offFace[pair.b]) {
                    offFace[pair.b] = true;
                    events.push({ kind: "impact-off-face", t, ball: ids[pair.b] as BallId });
                }
                recordStep(p.line, contact === OFF_FACE, 0, t);
                recordRegions(p.regions, null, 0, t);
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
            // The re-entry guard reads the interval's first step, before the step is recorded.
            if (hit !== null && jumps !== null && p.line.start === null) {
                const sb = balls[pair.b] as BallState;
                const u = sub(
                    pointVelocity(sb.position, sb.velocity, sb.angularVelocity, hit.point),
                    pointVelocity(state.position, state.velocity, state.angularVelocity, hit.point),
                );
                noteEntry(jumps, hit.depth, dot(u, hit.normal), dt, `${pair.key}#${hit.region}`, t);
            }
            if (hit !== null && hit.region !== "face" && !offFace[pair.b]) {
                offFace[pair.b] = true;
                events.push({ kind: "impact-off-face", t, ball: ids[pair.b] as BallId });
            }
            p.peak = Math.max(p.peak, contact.depth);
            const force = applyPair(p, contact, state, balls, dt, loads, options.probe ? samples : null);
            recordStep(p.line, true, force, t);
            recordRegions(p.regions, hit === null ? null : hit.region, force, t);
        }
```

(A force table's pairs have `regions` null: `hit` is null, `contact` is `pairContact`'s and `recordRegions` returns at
once, so the loop computes what it did.) The head–turf call becomes
`applyHeadTurf(turf, state, head, dt, loads, t, jumps)`.

`finish` gains `jumps: EntryJumps | null` after `turf` (and the call at the end of `integrate` passes `jumps` after
`turf`). Its comment ends "…, if the head–turf pair closed, its peak penetration, intervals and slide, and for a
tracked drive the head–ball intervals per region and the entry jumps." Replace the tail of its body, from
`const run = …` to its end, with:

```ts
    const turfIntervals = turf === null ? [] : closeTimeline(turf.line, duration);
    const turfClosed = turf !== null && turfIntervals.length > 0;
    if (turfClosed) {
        peakPenetration[HEAD_TURF_KEY] = turf.peak;
        timeline[HEAD_TURF_KEY] = turfIntervals;
    }
    const run: ImpactRun = {
        balls: final,
        head: state,
        duration,
        events,
        peakPenetration,
        steps,
        timeline,
        touchingAtStart,
        ...(turfClosed ? { headTurfSlide: turf.slide } : {}),
    };
    if (jumps === null) {
        return run;
    }
    const headRegions: Record<string, readonly ContactInterval[]> = {};
    for (const p of pairs) {
        const lines = p.regions;
        if (lines === null) {
            continue;
        }
        for (let i = 0; i < HEAD_REGIONS.length; i++) {
            const intervals = closeTimeline(lines[i] as PairTimeline, duration);
            if (intervals.length > 0) {
                headRegions[`${p.pair.key}#${HEAD_REGIONS[i] as HeadRegion}`] = intervals;
            }
        }
    }
    return { ...run, headRegions, entryJumps: { count: jumps.count, worst: jumps.worst, keys: [...jumps.keys] } };
```

(TypeScript narrows `turf` to non-null through the `const` alias `turfClosed`, as `turf` is a parameter never
reassigned; a planning scratch build type-checked it.)

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/engine/impact/contacts.test.ts tests/engine/impact/headBall.test.ts`
Expected: PASS.

Run: `npm test`
Expected: PASS. Tasks 3–6's tracked tests that strike through the face meet the same face region now: the face's
distance is rounded as |x| − L/2 rather than from the face's centre, an ulp-level change. If one of them fails, print
its figure and report it before changing an expectation.

- [ ] **Step 7: Format, check, verify bit-identity**

Run: `npx prettier --write src/engine/impact/contacts.ts src/engine/impact/types.ts src/engine/impact/integrate.ts
tests/engine/impact/contacts.test.ts tests/engine/impact/headBall.test.ts`

Run: `env LC_ALL=en_GB.UTF-8 grep -nE "^.{121,}$" src/engine/impact/contacts.ts src/engine/impact/types.ts
src/engine/impact/integrate.ts tests/engine/impact/contacts.test.ts tests/engine/impact/headBall.test.ts`
Expected: no output.

Run: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`
Expected: all pass.

Run: `env OBSTACLE_STROKES=2000 npx --yes tsx scripts/impactDigest.ts > "<temp>/digest-7.txt"`
Run: `cmp "<temp>/digest-base.txt" "<temp>/digest-7.txt"`
Expected: no output.

- [ ] **Step 8: Commit**

Write the message to `$CLAUDE_TEMP_DIR/msg.txt`:

```text
Meet the whole head with the balls, and guard against deep entries

A tracked drive's face–ball pairs now treat the head as a solid cylinder:
the ball's centre's signed distance from it, continuous across the face,
rim, barrel, back rim and back, so no part of the head passes through a
ball and no contact opens deep by changing region. Each pair records its
intervals per region, and a contact off the face raises impact-off-face
once per ball. A re-entry guard counts face–ball and head–turf intervals
that open deeper than one step's closing could make. Force tables keep
the face-only contact and stay bit-identical.
```

Run: `git add src/engine/impact/contacts.ts src/engine/impact/types.ts src/engine/impact/integrate.ts
tests/engine/impact/contacts.test.ts tests/engine/impact/headBall.test.ts`

Run, with the sandbox disabled for signing: `git commit -F <msg>`, where `<msg>` is the literal path of
`$CLAUDE_TEMP_DIR/msg.txt` (worktree sessions refuse the variable in a commit).

Run: `git log -1 "--format=%G? %h"`
Expected: `G` and the new commit's hash. If signing refuses, leave the change staged and report it.

---
### Task 8: The swing model

Spec §5. `buildContact(setup, world)` derives the swing in ten steps:
- the arc radius (the top hand), the contact angle (−`lean`), the head's pitch (rigid on the shaft) and its placement
  on the ball;
- the pivot;
- the two arcs' speeds: the hands' share, and the pendulum's rate;
- their windows, the dip, the mode, the reach and the ground depth, the coupling and the two hands;
- the lead-in for early actions.

It starts the head exactly on its own path. `swingApproach` reports how close the coasting path comes to the lawn
before contact. `defaultProfile` ships the provisional presets of spec §5.4.

Folded here:
- **D7.1.** `buildContact`'s `atContact = headLowestPoint(...)` call is written wrapped, as prettier prints it.
- **D7.2.** The AC stop's dip rationale is corrected. The check does not raise the head: the head still rises through
  the check window, pitching further face-up, so its rear rim drops (8.78 mm clear at contact, 7.99 mm at the window's
  end before the dip, measured while planning on the amended stance). With the 11 mm dip the path's lowest point is
  2.99 mm below the turf at 20 ms, reached first 12.7 ms after contact; the prototype's 14 mm gave 5.98 mm.
- **Old Task 7 defects.** `buildContact` no longer loops `Object.entries` over the drive entry (it now holds the
  string `mode`, which the finiteness check would reject); it checks named numeric fields, so a missing field is
  also caught. `swingApproach` moves every window and the dip to the planned contact as well as zeroing them: the
  coasting path is then the closed-form first branch at every sample, whatever the mode. Without the move, an arc
  timed early in carry mode would sample the carry's slowing pendulum before contact, and in swing mode the free
  pendulum.

Decisions made while drafting:
- **`canonicalSetup(type, over?)`.** `over` is `{ world?, stroke?, stance?, drive?, targetGap? }`: the world
  (default `defaultWorld()`), fields of the stroke, fields of the preset's own stance and drive entries in
  `defaultProfile`, and, for a single-ball stroke, the gap (m, surface to surface) to a target ball (red) on the aim
  line ahead. The GC stop's default gap is `GC_STOP_GAP` = 0.3 m (spec §5.5, user decision 2026-10-06); the other
  single-ball stroke has no target unless `targetGap` is given; a croquet stroke rejects it. A target is live. Task
  10's mechanism tests vary the canonical setups this way (the drive's bottom hand at 0.30 m, the dip timed early,
  `drive` 0, the single-ball stroke at the GC stop's gap). The balls do not follow a changed `aim`.
- **`STROKE_TYPES` is listed in full** in the presets' order (single-ball, drive, AC stop, GC stop, half, full and
  pass roll), not built from `CROQUET_STROKES`, which no longer holds the GC stop: every per-type array in the tests
  keeps its order.
- **Rejection order.** Each check runs in the order spec §5.3 lists them, after the striker, the entries and every
  number's finiteness, so each rejection test trips its own check only.
- **The face-pitch test** uses a 0.1 m head met 20 mm below its face centre. On the 0.23 m test head no `up` on the
  face keeps a 10° rise clear of the turf: the rear rim sits at h₀ − (R + L)·sin θ − (`up` + ρ)·cos θ.

**Measured while planning** (prototype `aeadd4c`, whose `top`-set stance is the spec's geometry: r = `top`,
θ_c = −`lean`, the head rigid on the shaft; scratch scripts run with `npx --yes tsx`):

| Preset | At contact | Approach's lowest | When |
|---|---|---|---|
| single-ball, drive, stop-gc | 7.8971 mm | 0.51544 mm | the 36.5 ms sample (36.0 ms is 1.7e-9 m higher, so either may be reported); the continuous minimum is 0.51508 mm at 36.25 ms |
| stop-ac | 8.7833 mm | 7.2281 mm | 56.0 ms |
| half-roll | 21.1109 mm | at contact | 0 |
| full-roll | 51.6104 mm | at contact | 0 |
| pass-roll | 54.7165 mm | at contact | 0 |

They match the spec's §5.5 figures (7.90 / 8.78 / 21.1 / 51.6 / 54.7 mm; 0.52 mm 36.5 ms out; 7.23 mm 56 ms out). The
level presets' continuous minimum, at tan φ* = (L/2)/(r + 2ρ) and ω₀ = speed/(r + ρ), falls midway between two
samples, so either may be reported; the test allows both. The test cases below were run the same way: the
hand-computed low swing (3.97774 mm at contact; −3.64180 mm at the 36.5 ms sample, the continuous minimum −3.64202 mm
at 36.70 ms) and the head in the turf 0.04 s before contact (3.58 mm below it).

**Files:**
- Create: `src/engine/swing/types.ts`, `src/engine/swing/profile.ts`, `src/engine/swing/buildContact.ts`,
  `tests/engine/support/shot.ts`, `tests/engine/swing/buildContact.test.ts`
- Modify: `src/engine/world.ts` (header comment)

**Interfaces:**
- Consumes:
  - `HAND_COUPLING`, `headOnPath`, `pitchAxis`, `prepareTrack` and `swingOrientation(aim, theta)` (track.ts, Tasks 3
    and 4);
  - `headLowestPoint` (contacts.ts, on `main`);
  - the types `ContactState`, `FaceMaterial`, `Hands`, `MalletHead`, `StrokeMode`, `SwingArc` and `TrackDrive`
    (impact/types.ts, Tasks 3 and 5);
  - `malletReference.shaftLength`, `contactReference.armMass` and `contactReference.reachSlack` (Task 2);
  - `simulateImpact` on a tracked contact state (Task 5 on) and `mirrorContact` mirroring arcs (Task 5), for the
    mirrored test.
- Produces (swing/types.ts): spec §5.1's types and `CROQUET_STROKES`, plus `STROKE_TYPES` (the plan's, for per-type
  ordering in tests and the probe); spec §5.1's `ON_TIME` is produced by swing/profile.ts:
  - `type StrokeType`;
  - `CROQUET_STROKES` (without `"stop-gc"`) and `STROKE_TYPES: readonly StrokeType[]` (every type, in the presets'
    order);
  - `interface SwingStance { lean; top; bottom; gripTension; bottomGrip }`;
  - `interface SwingDrive { mode; speedGain; window; handShare; handGain; handWindow; handDrop; dropTime; handReach;
    groundDepth; guideEffort }`;
  - `interface SwingProfile { mallet; body: { armMass; reachSlack }; stance; drive }`;
  - `interface StrokeTiming { arc; hands; dip }`;
  - `interface ShotSetup`, whose `stroke` has `timing: StrokeTiming`, `handReach?: number` and
    `guideEffort?: number`.
- Produces (swing/profile.ts): `defaultProfile: SwingProfile`, `DEFAULT_DRIVE: Readonly<Record<StrokeType, number>>`
  and `ON_TIME: StrokeTiming` (every timing 0).
- Produces (swing/buildContact.ts):
  - `START_GAP = 1e-6` and `MAX_LEAD = 0.06`;
  - `buildContact(setup: ShotSetup, world: World): ContactState`;
  - `interface SwingApproach { clearance: number; before: number }`;
  - `swingApproach(contact: ContactState): SwingApproach`.
- Produces (support/shot.ts):
  - `TestProfileOptions` and `testProfile(o?)`;
  - `CANONICAL_STRIKER = { x: 9.6012, y: 4 }` and `GC_STOP_GAP = 0.3`;
  - `CanonicalOptions` (with `targetGap?`) and `canonicalSetup(type, over?): ShotSetup`;
  - `CANONICAL_CLEARANCE: Readonly<Record<StrokeType, number>>`.

- [ ] **Step 1: Write the types and the default profile**

Create `src/engine/swing/types.ts`:

```ts
/**
 * The swing model's inputs (P2b.2b.1 design §5.1): the stroke types, the physical swing profile and a shot's setup.
 * They follow how a player plays a stroke (user's account, 2026-10-05):
 * - the shot type, then the balls;
 * - a stance for that type, and where the two hands sit on the mallet, which sets the head's angle;
 * - where and how to hit the striker's ball;
 * - the rehearsed shape of the swing: the pendulum, the hands' path through space, the dip and the reach;
 * - and, per shot, how the player times each.
 * The product spec's grip style, weighting and face material have no engine reader yet.
 */
import type { HoopTarget } from "../hoopRun";
import type { StrokeMode } from "../impact/types";
import type { BallId, BallStates } from "../types";

/** The strokes the swing model plays. */
export type StrokeType = "single-ball" | "drive" | "stop-ac" | "stop-gc" | "half-roll" | "full-roll" | "pass-roll";

/**
 * The croquet strokes; the rest, the GC stop among them, are single-ball. The GC stop's striker's ball crosses a gap
 * to the target ball (user decision, 2026-10-06; design §5.4).
 */
export const CROQUET_STROKES: readonly StrokeType[] = ["drive", "stop-ac", "half-roll", "full-roll", "pass-roll"];

/** Every stroke type, in the presets' order. */
export const STROKE_TYPES: readonly StrokeType[] = [
    "single-ball",
    "drive",
    "stop-ac",
    "stop-gc",
    "half-roll",
    "full-roll",
    "pass-roll",
];

/**
 * How the player stands to a stroke type and holds the mallet: the shaft's lean at contact (rad, positive pitches the
 * face down; the contact angle is −lean), the top and bottom hands' distances from the socket along the shaft (m,
 * 0 < bottom < top), the top hand's grip tension γ_T and the bottom hand's grip g_B from contact on (in (0, 1]).
 */
export interface SwingStance {
    readonly lean: number;
    readonly top: number;
    readonly bottom: number;
    readonly gripTension: number;
    readonly bottomGrip: number;
}

/**
 * The swing's shape (design §5.2 step 7), its changes measured against the head's speed at contact. The mode (§3.3).
 * The pendulum: over `window` (s) at full `drive` its contribution changes by `speedGain` times that speed. The hands:
 * `handShare` of that speed (in [0, 1]; the pendulum supplies the rest), changing by `handGain` times it over
 * `handWindow` (s) at full `drive`. The dip: whatever `drive`, the hands lower by `handDrop` (m) over `dropTime` (s),
 * rest to rest. The reach: the hands' path travels `handReach` (m) along aim after contact, the default for the shot's
 * own. In carry mode the head's lowest point ends `groundDepth` (m) below the turf. In swing mode the bottom hand's
 * push after contact is `guideEffort` (in [0, 1]) of a full restoration of the arc's speed, the default for the shot's
 * own.
 */
export interface SwingDrive {
    readonly mode: StrokeMode;
    readonly speedGain: number;
    readonly window: number;
    readonly handShare: number;
    readonly handGain: number;
    readonly handWindow: number;
    readonly handDrop: number;
    readonly dropTime: number;
    readonly handReach: number;
    readonly groundDepth: number;
    readonly guideEffort: number;
}

/** The physical part of a player's profile (design §5.1); P3 wraps it into the stored profile. */
export interface SwingProfile {
    readonly mallet: {
        readonly headMass: number;
        readonly headLength: number;
        readonly headDiameter: number;
        readonly shaftLength: number;
    };
    /** The player's body: the arm mass at the top grip (kg) and the reach slack (m). */
    readonly body: { readonly armMass: number; readonly reachSlack: number };
    readonly stance: Readonly<Record<StrokeType, SwingStance>>;
    readonly drive: Readonly<Record<StrokeType, SwingDrive>>;
}

/** When each action begins, s from contact: negative early, positive late, 0 on time (design §5.2 step 8). */
export interface StrokeTiming {
    readonly arc: number;
    readonly hands: number;
    readonly dip: number;
}

/** A shot to simulate (design §5.1, product spec §3). */
export interface ShotSetup {
    readonly balls: BallStates;
    readonly striker: BallId;
    readonly croqueted?: BallId;
    readonly stroke: {
        readonly type: StrokeType;
        /** Swing direction, rad from +x, horizontal. */
        readonly aim: number;
        /** The head's centre-of-mass speed at contact, m/s. */
        readonly speed: number;
        /** −1 check … 0 coast … +1 push. */
        readonly drive: number;
        /** The ball's centre from the face's centre (m): `up` along its upward axis, `side` to the left of aim. */
        readonly contact: { readonly up: number; readonly side: number };
        readonly timing: StrokeTiming;
        /** The hands' travel along aim after contact, m; absent: the preset's `handReach`. */
        readonly handReach?: number;
        /** The bottom hand's push after contact, in [0, 1]; absent: the preset's `guideEffort`. */
        readonly guideEffort?: number;
    };
    readonly live: readonly BallId[];
    readonly continuation: boolean;
    readonly hampered: boolean;
    readonly jumpAttempt: boolean;
    readonly targetHoop?: HoopTarget;
    readonly lawnSpeed: number;
    readonly profile: SwingProfile;
}
```

Create `src/engine/swing/profile.ts`:

```ts
/**
 * The default swing profile, "typical club player" (P2b.2b.1 design §5.4). Every value is provisional, to be refined
 * from outcomes; P2b.2b.2 sources or fits them.
 * - Mallet: reference/mallet.json (the head's mass, length and diameter; the 0.9144 m, 36 in, shaft, sourced).
 * - Body: reference/contact.json (`armMass` and `reachSlack`, the prototype's calibration).
 * - Stance: the hands measured from the socket along the shaft, and the leans, after John Riches, Croquet Technique
 *   (Oxford Croquet), quoted per preset below. The swing presets keep the top hand at the top of the handle, 0.805 m
 *   from the socket (the sourced 35 in grip less the socket's height at address). The bottom hands and the grips are
 *   the prototype's calibration (proto-two-hands, aeadd4c).
 * - Drive: the prototype's calibration (aeadd4c), compared with the coaching ratios only as observations (design §9);
 *   the AC stop's dip depth is a user decision (2026-10-05). Every preset's guideEffort is 1, the full restoration of
 *   the arc's speed a full shot aims at; a softer shot uses less, a very soft one none (user's account, 2026-10-06).
 *   P2b.2b.2 sets the per-type defaults; the P4 planner chooses it per shot.
 */
import { contactReference, malletReference } from "../../reference/index";
import type { StrokeTiming, StrokeType, SwingProfile } from "./types";

const DEG = Math.PI / 180;

/** The default profile (design §5.4). Provisional throughout. */
export const defaultProfile: SwingProfile = {
    mallet: {
        headMass: malletReference.headMass.value,
        headLength: malletReference.headLength.value,
        headDiameter: malletReference.headDiameter.value,
        shaftLength: malletReference.shaftLength.value,
    },
    body: {
        armMass: contactReference.armMass.value,
        reachSlack: contactReference.reachSlack.value,
    },
    stance: {
        // The top hand fixed at the top of the handle; the bottom hand high and light, a guide only (prototype).
        "single-ball": { lean: 0, top: 0.805, bottom: 0.7, gripTension: 1, bottomGrip: 0.1 },
        // As single-ball, the bottom hand a little lower and firmer, still only a guide (prototype).
        drive: { lean: 0, top: 0.805, bottom: 0.6, gripTension: 1, bottomGrip: 0.25 },
        // Feet set back, the ball met on the up: the shaft leans back 4°, so the strike rises 4° and the face tilts up
        // 4°, within the feasibility spike's 3–5° tilt (a 5° lean leaves the head only 4.03 mm clear at contact). Both
        // grips relax at contact (prototype).
        "stop-ac": { lean: -4 * DEG, top: 0.805, bottom: 0.45, gripTension: 0.1, bottomGrip: 0.1 },
        // The lower hand low and firm, checking the swing through its lever just after contact (prototype).
        "stop-gc": { lean: 0, top: 0.805, bottom: 0.45, gripTension: 1, bottomGrip: 1 },
        // Riches: "Most players place the bottom hand almost half-way down the handle for this shot, leaving the other
        // hand at the top", the mallet "making an angle of about 75 degrees with the ground".
        "half-roll": { lean: 15 * DEG, top: 0.805, bottom: 0.42, gripTension: 1, bottomGrip: 1 },
        // Riches: "Your lower hand should be placed at least two-thirds of the way down the handle, and your top hand
        // will also need to be moved, to about one-third of the way down the handle", giving "an angle of
        // approximately 45 degrees between the mallet handle and the ground".
        "full-roll": { lean: 45 * DEG, top: 0.61, bottom: 0.3, gripTension: 1, bottomGrip: 1 },
        // Riches: "The bottom hand should be placed at the very bottom of the mallet shaft for this shot"; the slope at
        // least the full roll's.
        "pass-roll": { lean: 48 * DEG, top: 0.45, bottom: 0.09, gripTension: 1, bottomGrip: 1 },
    },
    drive: {
        // Swing: the top hand still (no hand share), the pendulum's light push over 10 ms, then its free swing; no
        // dip, no reach (prototype).
        "single-ball": {
            mode: "swing",
            speedGain: 0.2,
            window: 0.01,
            handShare: 0,
            handGain: 0,
            handWindow: 0.01,
            handDrop: 0,
            dropTime: 0.01,
            handReach: 0,
            groundDepth: 0,
            guideEffort: 1,
        },
        // As single-ball over a 5 ms window: the follow-through rises and dies by itself, and the head catches the
        // striker's ball again (prototype).
        drive: {
            mode: "swing",
            speedGain: 0.2,
            window: 0.005,
            handShare: 0,
            handGain: 0,
            handWindow: 0.005,
            handDrop: 0,
            dropTime: 0.01,
            handReach: 0,
            groundDepth: 0,
            guideEffort: 1,
        },
        // Swing, checked: speedGain 1 at drive −1 brings the pendulum to rest at its window's end. The check does not
        // lift the head: it still rises through the window, pitching further face-up, so its rear rim drops (8.78 mm
        // clear at contact, 7.99 mm at the window's end before the dip). The dip, fed forward in full whatever the
        // relaxed grips, takes the path's lowest point 2.99 mm below the turf at 20 ms, its rear rim first reaching
        // the turf 12.7 ms after contact, after the ball has left (measured while planning). About 11 mm, a user
        // decision (2026-10-05): the prototype's 14 mm drove the head 2.86 mm into the turf, past HEAD_DEEP_LIMIT;
        // pre-flight confirms the value. The hands do not travel, so no reach.
        "stop-ac": {
            mode: "swing",
            speedGain: 1,
            window: 0.01,
            handShare: 0,
            handGain: 0,
            handWindow: 0.01,
            handDrop: 0.011,
            dropTime: 0.02,
            handReach: 0,
            groundDepth: 0,
            guideEffort: 1,
        },
        // Swing, checked through the firm, low bottom hand's lever: a hard, level shot with no follow-through; no dip
        // (prototype). A single-ball stroke, the striker's ball crossing a gap to the target (design §5.4).
        "stop-gc": {
            mode: "swing",
            speedGain: 1,
            window: 0.01,
            handShare: 0,
            handGain: 0,
            handWindow: 0.01,
            handDrop: 0,
            dropTime: 0.01,
            handReach: 0,
            groundDepth: 0,
            guideEffort: 1,
        },
        // Carry (Riches: the slope "MAINTAINED throughout the swing", both hands moving "FORWARD at the SAME RATE",
        // "the mallet head following through the ball and onto the ground"): the hands 60 % of the head's speed, a
        // light pendulum push, a 0.15 m reach, the head ending 5 mm below the turf (prototype).
        "half-roll": {
            mode: "carry",
            speedGain: 0.1,
            window: 0.02,
            handShare: 0.6,
            handGain: 0,
            handWindow: 0.02,
            handDrop: 0,
            dropTime: 0.01,
            handReach: 0.15,
            groundDepth: 0.005,
            guideEffort: 1,
        },
        // Carry: the hands 90 % of the head's speed and still accelerating, a 0.30 m reach, the head ending 2 mm below
        // the turf (prototype). A known miss in this phase (design §10).
        "full-roll": {
            mode: "carry",
            speedGain: 0.1,
            window: 0.03,
            handShare: 0.9,
            handGain: 0.1,
            handWindow: 0.03,
            handDrop: 0,
            dropTime: 0.01,
            handReach: 0.3,
            groundDepth: 0.002,
            guideEffort: 1,
        },
        // Carry, the bottom hand punching in contact: the pendulum's speedGain 0.5 over 15 ms from contact on top of
        // the hands' 85 % and handGain 0.1. A 0.30 m reach; 0.2 m traps the striker's ball against the face, the head
        // ending 2 mm below the turf (prototype). A known miss in this phase (design §10).
        "pass-roll": {
            mode: "carry",
            speedGain: 0.5,
            window: 0.015,
            handShare: 0.85,
            handGain: 0.1,
            handWindow: 0.015,
            handDrop: 0,
            dropTime: 0.01,
            handReach: 0.3,
            groundDepth: 0.002,
            guideEffort: 1,
        },
    },
};

/** The planner's default `drive` per stroke type (design §5.4): −1 check … 0 coast … +1 push. */
export const DEFAULT_DRIVE: Readonly<Record<StrokeType, number>> = {
    "single-ball": 0,
    drive: 0,
    "stop-ac": -1,
    "stop-gc": -1,
    "half-roll": 1,
    "full-roll": 1,
    "pass-roll": 1,
};

/** Every action on time. */
export const ON_TIME: StrokeTiming = { arc: 0, hands: 0, dip: 0 };
```

Every Riches quote above was checked verbatim against the pre-flight's copy of *Croquet Technique* while planning.

In `src/engine/world.ts`, replace the header comment with:

```ts
/**
 * World construction, validation and derived geometry. `defaultWorld` reads the sourced reference data for the world;
 * the impact's and the swing model's own constants are read by the modules that use them (impact/track.ts,
 * impact/integrate.ts, impact/simulateImpact.ts, swing/; P2b.2b.1 design §7).
 */
```

- [ ] **Step 2: Write the test support**

Create `tests/engine/support/shot.ts`:

```ts
/**
 * Test-only swing profiles and the canonical setups (P2b.2b.1 design §5.5). `testProfile` is plausible but NOT
 * sourced, as fixtures.ts. src/ must never import this file.
 */
import { vec3 } from "../../../src/engine/math/vec3";
import { DEFAULT_DRIVE, ON_TIME, defaultProfile } from "../../../src/engine/swing/profile";
import {
    CROQUET_STROKES,
    STROKE_TYPES,
    type ShotSetup,
    type StrokeType,
    type SwingDrive,
    type SwingProfile,
    type SwingStance,
} from "../../../src/engine/swing/types";
import type { BallId, BallStates, World } from "../../../src/engine/types";
import { defaultWorld } from "../../../src/engine/world";
import { lawnReference } from "../../../src/reference/index";

/** What `testProfile` changes: the mallet, the body, and one stance and one drive entry for every stroke type. */
export interface TestProfileOptions {
    readonly mallet?: Partial<SwingProfile["mallet"]>;
    readonly body?: Partial<SwingProfile["body"]>;
    readonly stance?: Partial<SwingStance>;
    readonly drive?: Partial<SwingDrive>;
}

/**
 * A profile with the test head (1 kg, 0.23 m long, 0.064 m across, on a 0.9 m shaft), no arm mass (so the swung body
 * is the head, as TEST_HANDS has it) and the same stance and drive for every stroke type: level, the hands 0.8 m and
 * 0.4 m from the socket with firm grips, a swing-mode coast with no hand share, dip or reach, and a full guide.
 */
export function testProfile(o: TestProfileOptions = {}): SwingProfile {
    const stance: SwingStance = { lean: 0, top: 0.8, bottom: 0.4, gripTension: 1, bottomGrip: 1, ...o.stance };
    const drive: SwingDrive = {
        mode: "swing",
        speedGain: 0.2,
        window: 0.01,
        handShare: 0,
        handGain: 0,
        handWindow: 0.01,
        handDrop: 0,
        dropTime: 0.01,
        handReach: 0,
        groundDepth: 0,
        guideEffort: 1,
        ...o.drive,
    };
    const every = <T>(entry: T): Record<StrokeType, T> =>
        Object.fromEntries(STROKE_TYPES.map((type) => [type, entry])) as Record<StrokeType, T>;
    return {
        mallet: { headMass: 1, headLength: 0.23, headDiameter: 0.064, shaftLength: 0.9, ...o.mallet },
        body: { armMass: 0, reachSlack: 0.03, ...o.body },
        stance: every(stance),
        drive: every(drive),
    };
}

/**
 * Where the canonical setups put the striker: a lane of the default court midway between the hoop columns at
 * x = 6.4008 and 12.8016, clear of every hoop and the peg for 28 m along +y. The design's court centre holds the peg.
 */
export const CANONICAL_STRIKER = { x: 9.6012, y: 4 } as const;

/** The GC stop's gap to its target, surface to surface (m): the user's optimum (design §5.5, 2026-10-06). */
export const GC_STOP_GAP = 0.3;

/**
 * What `canonicalSetup` changes: the world (default `defaultWorld()`), fields of the stroke, fields of the preset's
 * own stance and drive entries in `defaultProfile`, and, for a single-ball stroke, the gap (m, surface to surface) to
 * a target ball on the aim line ahead (default GC_STOP_GAP for the GC stop, no target otherwise). The balls do not
 * follow a changed aim.
 */
export interface CanonicalOptions {
    readonly world?: World;
    readonly stroke?: Partial<ShotSetup["stroke"]>;
    readonly stance?: Partial<SwingStance>;
    readonly drive?: Partial<SwingDrive>;
    readonly targetGap?: number;
}

/**
 * A preset's canonical setup (design §5.5): the striker at CANONICAL_STRIKER, aim +y, 3 m/s, the preset's default
 * drive, every action on time, the preset's reach, `side` 0, `up` 0 except the AC stop's −0.020 m. A croquet stroke's
 * croqueted ball touches the striker ahead along aim, 20° to the left of it for the pass roll, and `live` is empty. A
 * single-ball stroke's target, red, sits on the aim line `targetGap` ahead (the GC stop's GC_STOP_GAP by default),
 * and `live` holds every other ball: the target, if any. No other balls. Throws for a croquet stroke given a gap.
 */
export function canonicalSetup(type: StrokeType, over: CanonicalOptions = {}): ShotSetup {
    const world = over.world ?? defaultWorld();
    const R = world.ball.radius;
    const aim = Math.PI / 2;
    const at = (x: number, y: number) => ({
        position: vec3(x, y, R),
        velocity: vec3(0, 0, 0),
        angularVelocity: vec3(0, 0, 0),
    });
    const { x, y } = CANONICAL_STRIKER;
    const balls: BallStates = { blue: at(x, y) };
    const croquet = CROQUET_STROKES.includes(type);
    const gap = over.targetGap ?? (type === "stop-gc" ? GC_STOP_GAP : undefined);
    if (croquet) {
        if (over.targetGap !== undefined) {
            throw new Error(`canonicalSetup: a ${type} stroke's croqueted ball touches the striker; no targetGap`);
        }
        const line = aim + (type === "pass-roll" ? (20 * Math.PI) / 180 : 0);
        balls.red = at(x + 2 * R * Math.cos(line), y + 2 * R * Math.sin(line));
    } else if (gap !== undefined) {
        balls.red = at(x + (2 * R + gap) * Math.cos(aim), y + (2 * R + gap) * Math.sin(aim));
    }
    const live: BallId[] = !croquet && balls.red !== undefined ? ["red"] : [];
    const profile: SwingProfile = {
        ...defaultProfile,
        stance: { ...defaultProfile.stance, [type]: { ...defaultProfile.stance[type], ...over.stance } },
        drive: { ...defaultProfile.drive, [type]: { ...defaultProfile.drive[type], ...over.drive } },
    };
    return {
        balls,
        striker: "blue",
        ...(croquet ? { croqueted: "red" as const } : {}),
        stroke: {
            type,
            aim,
            speed: 3,
            drive: DEFAULT_DRIVE[type],
            contact: { up: type === "stop-ac" ? -0.02 : 0, side: 0 },
            timing: ON_TIME,
            ...over.stroke,
        },
        live,
        continuation: false,
        hampered: false,
        jumpAttempt: false,
        lawnSpeed: lawnReference.defaultSpeed.value,
        profile,
    };
}

/**
 * The head's lowest point above the turf (m) at contact in each canonical setup on the default world, with the
 * default profile (measured while planning, on prototype aeadd4c's geometry: h₀ = R − sink = 45.997 mm,
 * ρ = 38.1 mm, L = 228.6 mm; the head pitched by −lean, so independent of the arc radius).
 */
export const CANONICAL_CLEARANCE: Readonly<Record<StrokeType, number>> = {
    "single-ball": 7.8971e-3,
    drive: 7.8971e-3,
    "stop-ac": 8.7833e-3,
    "stop-gc": 7.8971e-3,
    "half-roll": 21.1109e-3,
    "full-roll": 51.6104e-3,
    "pass-roll": 54.7165e-3,
};
```

- [ ] **Step 3: Write the failing tests**

Create `tests/engine/swing/buildContact.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { headLowestPoint } from "../../../src/engine/impact/contacts";
import { rotate, solidCylinderInertia } from "../../../src/engine/impact/rigidBody";
import { simulateImpact } from "../../../src/engine/impact/simulateImpact";
import { HAND_COUPLING, headOnPath, pitchAxis, prepareTrack } from "../../../src/engine/impact/track";
import type { ContactState, StrokeMode, TrackDrive } from "../../../src/engine/impact/types";
import { add, cross, dot, horizontal, length, scale, sub, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import { MAX_LEAD, START_GAP, buildContact, swingApproach } from "../../../src/engine/swing/buildContact";
import { ON_TIME, defaultProfile } from "../../../src/engine/swing/profile";
import { STROKE_TYPES, type ShotSetup, type StrokeType, type SwingProfile } from "../../../src/engine/swing/types";
import type { BallState } from "../../../src/engine/types";
import { defaultWorld } from "../../../src/engine/world";
import { contactReference, malletReference } from "../../../src/reference/index";
import { TEST_BALL, TEST_TURF, ballAt, testWorld } from "../support/fixtures";
import { mirrorBall, mirrorContact, mirrorQuat, mirrorSpin, mirrorVec } from "../support/impact";
import { CANONICAL_CLEARANCE, GC_STOP_GAP, canonicalSetup, testProfile } from "../support/shot";

const WORLD = testWorld();
const R = TEST_BALL.radius;
/** The striker's sunk centre height, where the face is placed against it. */
const SUNK_Z = R - (TEST_BALL.mass * WORLD.gravity) / TEST_TURF.turfStiffness;
const BLUE = ballAt(5, 3);
/** The test profile's top hand (the arc radius), and the test head's radius and length. */
const TOP = 0.8;
const RHO = 0.032;
const LENGTH = 0.23;
const DEG = Math.PI / 180;

type Stroke = ShotSetup["stroke"];

function shot(stroke: Partial<Stroke> = {}, profile: SwingProfile = testProfile(), blue: BallState = BLUE): ShotSetup {
    return {
        balls: { blue },
        striker: "blue",
        stroke: {
            type: "single-ball",
            aim: 0.4,
            speed: 3,
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

const arcOf = (c: ContactState) => (c.drive as TrackDrive).arc;
const dist = (a: Vec3, b: Vec3): number => length(sub(a, b));
const same = (a: Vec3, b: Vec3): boolean => a.x === b.x && a.y === b.y && a.z === b.z;
/** ℓ, the pivot's distance from the head's centre across the swing plane's pitch axis (on-time contacts). */
const pivotToCentre = (c: ContactState): number =>
    length(cross(pitchAxis(arcOf(c).aim), sub(c.position, arcOf(c).pivot)));

describe("buildContact, step by step", () => {
    it("takes the arc radius from the top hand", () => {
        expect(arcOf(buildContact(shot(), WORLD)).radius).toBe(TOP);
        expect(arcOf(buildContact(shot({}, testProfile({ stance: { top: 0.6 } })), WORLD)).radius).toBe(0.6);
    });

    it("turns the lean into the contact angle, a negative lean rising into the ball", () => {
        expect(arcOf(buildContact(shot({}, testProfile({ stance: { lean: 0.2 } })), WORLD)).theta0).toBe(-0.2);
        const profile = testProfile({ stance: { lean: -0.05 } });
        const rising = buildContact(shot({ contact: { up: -0.01, side: 0 } }, profile), WORLD);
        expect(arcOf(rising).theta0).toBe(0.05);
        expect(rising.velocity.z).toBeGreaterThan(0);
    });

    it("pitches the face down by the lean, the head rigid on the shaft", () => {
        // A short head met low on its face: on the 0.23 m head no point of the face keeps a 10° rise clear of the turf.
        for (const degrees of [-10, 0, 10]) {
            const profile = testProfile({ stance: { lean: degrees * DEG }, mallet: { headLength: 0.1 } });
            const c = buildContact(shot({ contact: { up: -0.02, side: 0 } }, profile), WORLD);
            const face = rotate(c.orientation, vec3(1, 0, 0));
            expect(Math.asin(face.z), `lean ${degrees}°`).toBeCloseTo(-degrees * DEG, 12);
            const aim = vec3(Math.cos(0.4), Math.sin(0.4), 0);
            expect(length(cross(horizontal(face), aim))).toBeLessThan(1e-12);
            expect(dot(face, aim)).toBeGreaterThan(0);
        }
    });

    it("puts the face 1 µm short of the sunk ball, meeting it at the requested point", () => {
        const c = buildContact(shot({ contact: { up: 0.01, side: -0.005 } }), WORLD);
        const face = rotate(c.orientation, vec3(1, 0, 0));
        const upward = rotate(c.orientation, vec3(0, 0, 1));
        const left = rotate(c.orientation, vec3(0, 1, 0));
        const offset = sub(vec3(5, 3, SUNK_Z), add(c.position, scale(face, c.head.length / 2)));
        expect(dot(offset, face)).toBeCloseTo(R + START_GAP, 12);
        expect(dot(offset, upward)).toBeCloseTo(0.01, 12);
        expect(dot(offset, left)).toBeCloseTo(-0.005, 12);
        expect(dist(left, vec3(-Math.sin(0.4), Math.cos(0.4), 0))).toBeLessThan(1e-12);
    });

    it("splits the head's speed between the hands and the pendulum", () => {
        for (const handShare of [0, 0.5, 1]) {
            const c = buildContact(shot({}, testProfile({ drive: { handShare } })), WORLD);
            const arc = arcOf(c);
            expect(length(c.velocity), `handShare ${handShare}`).toBeCloseTo(3, 12);
            expect(dist(arc.pivotVelocity, scale(arc.aim, handShare * 3))).toBeLessThan(1e-15);
            const swing = scale(cross(pitchAxis(arc.aim), sub(c.position, arc.pivot)), arc.omega0);
            expect(dist(c.velocity, add(arc.pivotVelocity, swing))).toBeLessThan(1e-12);
        }
    });

    it("drives both arcs over their windows against the head's speed", () => {
        const profile = testProfile({
            drive: { speedGain: 0.4, window: 0.02, handShare: 0.5, handGain: 0.3, handWindow: 0.03 },
        });
        const c = buildContact(shot({ drive: -0.5 }, profile), WORLD);
        const arc = arcOf(c);
        // The pendulum's contribution changes by drive·speedGain·speed = −0.6 m/s over its window.
        expect(arc.alpha * pivotToCentre(c) * 0.02).toBeCloseTo(-0.5 * 0.4 * 3, 10);
        expect(dist(arc.pivotAcceleration, scale(arc.aim, (-0.5 * 0.3 * 3) / 0.03))).toBeLessThan(1e-12);
        expect([arc.window, arc.handWindow, arc.arcStart, arc.handStart, arc.contactAt]).toEqual([0.02, 0.03, 0, 0, 0]);
        // The pendulum carries the other half of the head's speed.
        expect(arc.omega0 * pivotToCentre(c)).toBeGreaterThan(0);
    });

    it("copies the mode, the reach and the ground depth, the hands and the body, and grips with HAND_COUPLING", () => {
        const profile = testProfile({
            stance: { top: 0.7, bottom: 0.3, gripTension: 0.6, bottomGrip: 0.25 },
            drive: { mode: "carry", handReach: 0.2, groundDepth: 0.004, guideEffort: 0.4 },
            body: { armMass: 0.8, reachSlack: 0.02 },
        });
        const drive = buildContact(shot({}, profile), WORLD).drive as TrackDrive;
        expect([drive.arc.mode, drive.arc.handReach, drive.arc.groundDepth]).toEqual(["carry", 0.2, 0.004]);
        expect(drive.hands).toEqual({
            bottom: 0.3,
            gripTension: 0.6,
            bottomGrip: 0.25,
            armMass: 0.8,
            reachSlack: 0.02,
            guideEffort: 0.4,
        });
        expect(drive.coupling).toEqual({
            period: HAND_COUPLING.period,
            dampingRatio: HAND_COUPLING.dampingRatio,
            relaxAt: 0,
        });
        // The shot's reach, when it gives one, over the preset's: 0 included.
        const reaching = testProfile({ drive: { handReach: 0.2 } });
        expect(arcOf(buildContact(shot({ handReach: 0.05 }, reaching), WORLD)).handReach).toBe(0.05);
        expect(arcOf(buildContact(shot({ handReach: 0 }, reaching), WORLD)).handReach).toBe(0);
        // The shot's guide effort, when it gives one, over the preset's: 0 included.
        const effortOf = (s: ShotSetup): number => (buildContact(s, WORLD).drive as TrackDrive).hands.guideEffort;
        const guided = testProfile({ drive: { guideEffort: 0.4 } });
        expect(effortOf(shot({}, guided))).toBe(0.4);
        expect(effortOf(shot({ guideEffort: 0 }, guided))).toBe(0);
    });

    it("dips the hands as the profile says, whatever the drive, still meeting the ball on the up", () => {
        for (const drive of [-1, 0, 1]) {
            const profile = testProfile({ stance: { lean: -0.05 }, drive: { handDrop: 0.014, dropTime: 0.02 } });
            const c = buildContact(shot({ drive, contact: { up: -0.01, side: 0 } }, profile), WORLD);
            expect(arcOf(c).dip, `drive ${drive}`).toEqual({ start: 0, duration: 0.02, depth: 0.014 });
            expect(c.velocity.z).toBeGreaterThan(0);
        }
    });

    it("starts the impact at the earliest early action, the head on its coasting path, and at contact on time", () => {
        const profile = testProfile({ drive: { handShare: 0.3 } });
        const onTime = buildContact(shot({}, profile), WORLD);
        const early = buildContact(shot({ timing: { arc: -0.01, hands: 0.004, dip: -0.02 } }, profile), WORLD);
        const arc = arcOf(early);
        expect(arc.contactAt).toBe(0.02);
        expect(arc.arcStart).toBeCloseTo(0.01, 15);
        expect(arc.handStart).toBeCloseTo(0.024, 15);
        expect(arc.dip.start).toBe(0);
        expect((early.drive as TrackDrive).coupling.relaxAt).toBe(0.02);
        expect(arc.theta0).toBeCloseTo(arcOf(onTime).theta0 - arcOf(onTime).omega0 * 0.02, 12);
        // With depthless actions, the head coasts from its start to the contact pose by the lead's end.
        const depthless = buildContact(shot({ timing: { arc: 0, hands: 0, dip: -0.02 } }, profile), WORLD);
        const track = prepareTrack(depthless.drive as TrackDrive, depthless.head, WORLD.gravity);
        expect(dist(headOnPath(track, depthless.head, 0.02).position, onTime.position)).toBeLessThan(1e-12);
        const late = buildContact(shot({ timing: { arc: 0.01, hands: 0.01, dip: 0.01 } }, profile), WORLD);
        expect(arcOf(late).contactAt).toBe(0);
        // The longest lead is allowed.
        const longest = buildContact(shot({ timing: { arc: -MAX_LEAD, hands: 0, dip: 0 } }, profile), WORLD);
        expect(arcOf(longest).contactAt).toBe(MAX_LEAD);
    });

    it("builds the profile's mallet with a wooden face", () => {
        const c = buildContact(shot(), WORLD);
        expect(c.head).toEqual({
            mass: 1,
            inertia: solidCylinderInertia(1, 0.23, 0.032),
            length: 0.23,
            radius: 0.032,
            socket: vec3(0, 0, 0.032),
        });
        expect(c.face).toEqual({
            restitution: malletReference.faceRestitution.value,
            friction: malletReference.faceFriction.value,
            contactTime: contactReference.faceBallContactTime.value,
        });
    });

    it("starts the head exactly on its own path", () => {
        const profile = testProfile({ stance: { lean: 0.4 }, drive: { handShare: 0.6 } });
        const c = buildContact(shot({ drive: 0.7, timing: { arc: -0.005, hands: 0, dip: 0 } }, profile), WORLD);
        const start = headOnPath(prepareTrack(c.drive as TrackDrive, c.head, WORLD.gravity), c.head, 0);
        expect({
            position: c.position,
            orientation: c.orientation,
            velocity: c.velocity,
            angularVelocity: c.angularVelocity,
        }).toEqual(start);
    });

    it("points the face along any aim", () => {
        for (const aim of [Math.PI, -Math.PI / 2, 7]) {
            const c = buildContact(shot({ aim }), WORLD);
            const face = rotate(c.orientation, vec3(1, 0, 0));
            expect(dist(face, vec3(Math.cos(aim), Math.sin(aim), 0)), `aim ${aim}`).toBeLessThan(1e-12);
            const start = headOnPath(prepareTrack(c.drive as TrackDrive, c.head, WORLD.gravity), c.head, 0);
            expect(c.position).toEqual(start.position);
        }
    });
});

describe("swingApproach", () => {
    it("finds a low swing's coasting path in the turf before contact, as computed by hand", () => {
        // Level, the ball met 10 mm above the face centre: the head's lowest point is h₀ − 0.01 − ρ clear at contact.
        // Swung back by φ the head pitches with the shaft, its front rim lowest at P_z − (r + 2ρ)·cos φ − (L/2)·sin φ,
        // P_z the pivot's height: least at tan φ* = (L/2)/(r + 2ρ), 36.70 ms back at ω₀ = speed/(r + ρ), 3.642 mm in
        // the turf. The samples are 0.5 ms apart; the nearest, 36.5 ms back, is the lowest sampled.
        const c = buildContact(shot({ contact: { up: 0.01, side: 0 } }), WORLD);
        expect(headLowestPoint(c, c.head)).toBeCloseTo(SUNK_Z - 0.01 - RHO, 12);
        const pivotZ = SUNK_Z - 0.01 + RHO + TOP;
        const omega0 = 3 / (TOP + RHO);
        const clearance = (back: number): number =>
            pivotZ - (TOP + 2 * RHO) * Math.cos(omega0 * back) - (LENGTH / 2) * Math.sin(omega0 * back);
        const approach = swingApproach(c);
        expect(approach.before).toBeCloseTo(0.0365, 12);
        expect(approach.clearance).toBeCloseTo(clearance(0.0365), 12);
        expect(approach.clearance).toBeCloseTo(-3.6418e-3, 6);
    });

    it("measures back from the planned contact, whatever the lead", () => {
        const profile = testProfile({ drive: { handShare: 0.3 } });
        const onTime = swingApproach(buildContact(shot({}, profile), WORLD));
        const early = swingApproach(buildContact(shot({ timing: { arc: -0.02, hands: 0, dip: 0 } }, profile), WORLD));
        expect(early.before).toBeCloseTo(onTime.before, 12);
        expect(early.clearance).toBeCloseTo(onTime.clearance, 12);
    });

    it("follows the coasting path, every action removed", () => {
        const acting = testProfile({ drive: { speedGain: 0.4, handShare: 0.3, handGain: 0.2, handDrop: 0.004 } });
        const coasting = testProfile({ drive: { speedGain: 0.4, handShare: 0.3, handGain: 0.2 } });
        const timing = { arc: -0.03, hands: -0.02, dip: -0.04 };
        const a = swingApproach(buildContact(shot({ drive: -1, timing }, acting), WORLD));
        const b = swingApproach(buildContact(shot({}, coasting), WORLD));
        expect(a.before).toBeCloseTo(b.before, 12);
        expect(a.clearance).toBeCloseTo(b.clearance, 12);
    });
});

describe("buildContact, mirrored", () => {
    it("gives a setup mirrored across a vertical plane an exactly mirrored contact and impact", () => {
        const profile = testProfile({
            stance: { lean: 0.1, gripTension: 0.8, bottomGrip: 0.5 },
            drive: { handShare: 0.3, handGain: 0.2, handDrop: 0.004 },
        });
        const stroke = { aim: 0.4, drive: 0.5, contact: { up: -0.003, side: 0.004 } };
        const a = buildContact(shot(stroke, profile, ballAt(5, 3)), WORLD);
        const b = buildContact(
            shot({ ...stroke, aim: -0.4, contact: { up: -0.003, side: -0.004 } }, profile, ballAt(5, -3)),
            WORLD,
        );
        const m = mirrorContact(a);
        expect(same(m.position, b.position) && same(m.velocity, b.velocity)).toBe(true);
        expect(same(m.angularVelocity, b.angularVelocity)).toBe(true);
        const [q, p] = [m.orientation, b.orientation];
        expect(q.w === p.w && q.x === p.x && q.y === p.y && q.z === p.z).toBe(true);
        const [ma, mb] = [arcOf(m), arcOf(b)];
        expect(same(ma.pivot, mb.pivot) && same(ma.pivotAcceleration, mb.pivotAcceleration)).toBe(true);
        expect(ma.omega0 === mb.omega0 && ma.alpha === mb.alpha && ma.theta0 === mb.theta0).toBe(true);
        const ra = simulateImpact(a, { blue: ballAt(5, 3) }, WORLD);
        const rb = simulateImpact(b, { blue: ballAt(5, -3) }, WORLD);
        const ha = ra.handover.blue as BallState;
        const hb = rb.handover.blue as BallState;
        expect(same(mirrorBall(ha).position, hb.position) && same(mirrorVec(ha.velocity), hb.velocity)).toBe(true);
        expect(same(mirrorSpin(ha.angularVelocity), hb.angularVelocity)).toBe(true);
        expect(rb.steps).toBe(ra.steps);
        const [qa, qb] = [mirrorQuat(ra.head.orientation), rb.head.orientation];
        expect(qa.w === qb.w && qa.x === qb.x && qa.y === qb.y && qa.z === qb.z).toBe(true);
    });
});

/**
 * The coasting path's lowest clearance before contact on each canonical setup (measured while planning on prototype
 * aeadd4c's geometry). The level presets' continuous minimum lies at 36.25 ms, midway between the samples at 36.0 and
 * 36.5 ms, whose clearances differ by 1.7e-9 m, so either may be reported; the others are one sample.
 */
const CANONICAL_APPROACH: Readonly<Record<StrokeType, { readonly clearance: number; readonly before: number }>> = {
    "single-ball": { clearance: 0.51544e-3, before: 0.03625 },
    drive: { clearance: 0.51544e-3, before: 0.03625 },
    "stop-ac": { clearance: 7.2281e-3, before: 0.056 },
    "stop-gc": { clearance: 0.51544e-3, before: 0.03625 },
    "half-roll": { clearance: 21.1109e-3, before: 0 },
    "full-roll": { clearance: 51.6104e-3, before: 0 },
    "pass-roll": { clearance: 54.7165e-3, before: 0 },
};

describe("the default profile's canonical setups", () => {
    it.each(STROKE_TYPES)("%s starts at contact, by its planned clearance, its approach as planned", (type) => {
        const world = defaultWorld();
        const c = buildContact(canonicalSetup(type, { world }), world);
        expect(arcOf(c).contactAt).toBe(0);
        expect(headLowestPoint(c, c.head)).toBeCloseTo(CANONICAL_CLEARANCE[type], 6);
        const approach = swingApproach(c);
        expect(approach.clearance).toBeCloseTo(CANONICAL_APPROACH[type].clearance, 6);
        // Within 3e-4 s: the planned sample, or (level presets) either sample beside the continuous minimum.
        expect(Math.abs(approach.before - CANONICAL_APPROACH[type].before)).toBeLessThan(3e-4);
    });

    it("rises 4° into the AC stop, the face tilted up as much", () => {
        const world = defaultWorld();
        const c = buildContact(canonicalSetup("stop-ac", { world }), world);
        expect(arcOf(c).theta0).toBeCloseTo(4 * DEG, 15);
        expect(rotate(c.orientation, vec3(1, 0, 0)).z).toBeCloseTo(Math.sin(4 * DEG), 12);
        expect(c.velocity.z).toBeGreaterThan(0);
    });

    it("places the GC stop's target GC_STOP_GAP ahead and live, and refuses a gap on a croquet stroke", () => {
        const world = defaultWorld();
        const setup = canonicalSetup("stop-gc", { world });
        const blue = setup.balls.blue as BallState;
        const red = setup.balls.red as BallState;
        expect(length(sub(red.position, blue.position))).toBeCloseTo(2 * world.ball.radius + GC_STOP_GAP, 12);
        expect(red.position.x).toBeCloseTo(blue.position.x, 12);
        expect(red.position.y).toBeGreaterThan(blue.position.y);
        expect(setup.live).toEqual(["red"]);
        expect(setup).not.toHaveProperty("croqueted");
        expect(() => canonicalSetup("stop-ac", { world, targetGap: 0.1 })).toThrow(/no targetGap/);
    });
});

describe("defaultProfile", () => {
    it("takes the mallet from mallet.json and the body from contact.json", () => {
        expect(defaultProfile.mallet).toEqual({
            headMass: malletReference.headMass.value,
            headLength: malletReference.headLength.value,
            headDiameter: malletReference.headDiameter.value,
            shaftLength: malletReference.shaftLength.value,
        });
        expect(defaultProfile.body).toEqual({
            armMass: contactReference.armMass.value,
            reachSlack: contactReference.reachSlack.value,
        });
    });

    it("swings the single-ball stroke, the drive and the stops, and carries the rolls to their reach", () => {
        const modes = STROKE_TYPES.map((type) => defaultProfile.drive[type].mode);
        expect(modes).toEqual(["swing", "swing", "swing", "swing", "carry", "carry", "carry"]);
        const reaches = STROKE_TYPES.map((type) => defaultProfile.drive[type].handReach);
        expect(reaches).toEqual([0, 0, 0, 0, 0.15, 0.3, 0.3]);
        expect(defaultProfile.drive["stop-ac"].handDrop).toBe(0.011);
        expect(STROKE_TYPES.map((type) => defaultProfile.drive[type].guideEffort)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    });
});

describe("buildContact rejections", () => {
    const missing = (record: "stance" | "drive"): SwingProfile => {
        const p = testProfile();
        const kept = Object.fromEntries(Object.entries(p[record]).filter(([type]) => type !== "drive"));
        return { ...p, [record]: kept } as unknown as SwingProfile;
    };
    const cases: readonly [string, ShotSetup, RegExp][] = [
        ["the striker absent", { ...shot(), striker: "red" }, /striker red is not in the setup/],
        ["a stroke type missing from the stance", shot({ type: "drive" }, missing("stance")), /stance has no entry/],
        ["a stroke type missing from the drive", shot({ type: "drive" }, missing("drive")), /drive has no entry/],
        [
            "a mode other than swing or carry",
            shot({}, testProfile({ drive: { mode: "chip" as StrokeMode } })),
            /mode must be "swing" or "carry"/,
        ],
        ["a non-finite number", shot({ aim: NaN }), /stroke\.aim must be finite/],
        ["a non-finite timing", shot({ timing: { arc: NaN, hands: 0, dip: 0 } }), /stroke\.timing\.arc must be finite/],
        ["a non-finite shot's reach", shot({ handReach: NaN }), /stroke\.handReach must be finite/],
        ["a non-finite shot's guide effort", shot({ guideEffort: NaN }), /stroke\.guideEffort must be finite/],
        [
            "a non-finite arm mass",
            shot({}, testProfile({ body: { armMass: Infinity } })),
            /profile\.body\.armMass must be finite/,
        ],
        ["the top hand at the socket", shot({}, testProfile({ stance: { top: 0 } })), /\.top must be positive/],
        ["the top hand off the shaft", shot({}, testProfile({ stance: { top: 0.95 } })), /off the shaft/],
        ["the bottom hand at the top hand", shot({}, testProfile({ stance: { bottom: 0.8 } })), /\.bottom must lie in/],
        ["the bottom hand at the socket", shot({}, testProfile({ stance: { bottom: 0 } })), /\.bottom must lie in/],
        ["a lean of 90°", shot({}, testProfile({ stance: { lean: Math.PI / 2 } })), /\.lean must lie within/],
        ["a non-positive speed", shot({ speed: 0 }), /stroke\.speed must be positive/],
        ["a drive beyond ±1", shot({ drive: 1.5 }), /stroke\.drive must lie in/],
        ["a contact off the face", shot({ contact: { up: 0.03, side: 0.02 } }), /off the face/],
        ["a non-positive window", shot({}, testProfile({ drive: { window: 0 } })), /\.window must be positive/],
        ["a non-positive hands' window", shot({}, testProfile({ drive: { handWindow: 0 } })), /handWindow/],
        ["a non-positive dip time", shot({}, testProfile({ drive: { dropTime: 0 } })), /dropTime must be positive/],
        ["a negative speedGain", shot({}, testProfile({ drive: { speedGain: -0.1 } })), /speedGain must be non-neg/],
        [
            "a grip tension of 0",
            shot({}, testProfile({ stance: { gripTension: 0 } })),
            /gripTension must lie in \(0, 1\]/,
        ],
        [
            "a bottom grip above 1",
            shot({}, testProfile({ stance: { bottomGrip: 1.5 } })),
            /bottomGrip must lie in \(0, 1\]/,
        ],
        ["a hand share above 1", shot({}, testProfile({ drive: { handShare: 1.1 } })), /handShare must lie in/],
        ["a negative dip", shot({}, testProfile({ drive: { handDrop: -0.001 } })), /handDrop must be non-negative/],
        [
            "a negative preset reach",
            shot({}, testProfile({ drive: { handReach: -0.1 } })),
            /drive\.single-ball\.handReach must be non-negative/,
        ],
        ["a negative shot's reach", shot({ handReach: -0.1 }), /stroke\.handReach must be non-negative/],
        [
            "a negative preset guide effort",
            shot({}, testProfile({ drive: { guideEffort: -0.1 } })),
            /drive\.single-ball\.guideEffort must lie in \[0, 1\]/,
        ],
        ["a shot's guide effort above 1", shot({ guideEffort: 1.5 }), /stroke\.guideEffort must lie in \[0, 1\]/],
        [
            "a negative ground depth",
            shot({}, testProfile({ drive: { groundDepth: -0.001 } })),
            /groundDepth must be non-negative/,
        ],
        ["a negative arm mass", shot({}, testProfile({ body: { armMass: -0.1 } })), /armMass must be non-negative/],
        [
            "a negative reach slack",
            shot({}, testProfile({ body: { reachSlack: -0.01 } })),
            /reachSlack must be non-negative/,
        ],
        ["an action over 60 ms early", shot({ timing: { arc: -0.07, hands: 0, dip: 0 } }), /more than 0\.06 s early/],
        ["a head in the turf at contact", shot({}, testProfile({ stance: { lean: -0.3 } })), /in the turf at contact/],
        [
            "a head in the turf where an early action begins",
            shot({ contact: { up: 0.01, side: 0 }, timing: { arc: 0, hands: 0, dip: -0.04 } }),
            /in the turf 0\.04 s before contact/,
        ],
    ];

    it.each(cases)("rejects %s", (_name, setup, pattern) => {
        expect(() => buildContact(setup, WORLD)).toThrow(pattern);
    });
});
```

Notes on the cases:
- "A head in the turf at contact": tilting the face up 0.3 rad puts the rear rim at
  h₀ − (R + L)·sin 0.3 − ρ·cos 0.3 ≈ −0.066 m (measured −0.06616 m).
- "A head in the turf where an early action begins" is the hand-computed low swing of `swingApproach`'s first test,
  3.58 mm in the turf 0.04 s back (measured).
- The lean's limit is checked before the contact's, so a lean of exactly 90° names the lean.

- [ ] **Step 4: Run them to verify they fail**

Run: `npx vitest run tests/engine/swing/buildContact.test.ts`
Expected: FAIL. The suite does not load (`Tests  no tests`): `Error: Cannot find module
'../../../src/engine/swing/buildContact' imported from …/tests/engine/swing/buildContact.test.ts` (Vitest 5's text,
checked while planning). `npm run check` reports 1 error: Cannot find module '../../../src/engine/swing/buildContact'
or its corresponding type declarations.

- [ ] **Step 5: Write `src/engine/swing/buildContact.ts`**

```ts
/**
 * The swing model (P2b.2b.1 design §5.2). From a ShotSetup and the world it derives the mallet head, its wooden face,
 * its state at t = 0 and the tracked drive:
 * 1. the arc radius r = top: the shaft is rigid, so the pivot is the top hand, `top` from the socket along it;
 * 2. the contact angle θ_c = −lean, positive for a rising strike;
 * 3. the head's pitch about n at contact, θ_c: the head is rigid on the shaft, rot(n, θ_c) ⊗ q_aim, so a positive lean
 *    pitches the face down;
 * 4. the face's point at (up, side) from its centre on the line through the sunk centre along −f, R + START_GAP from
 *    it; the head's centre L/2 behind the face's, the socket on top of the head;
 * 5. the pivot, r from the socket up the shaft;
 * 6. the hands' speed V₀ = handShare·speed·aim, and ω₀, the larger root of |V₀ + ω₀·n × (c − pivot)| = speed;
 * 7. the arcs' changes, against the head's speed: α = drive·speedGain·(speed/ℓ)/window, ℓ the pivot's distance from
 *    the head's centre, and A = drive·handGain·speed·aim/handWindow; the dip, handDrop over dropTime; the mode, the
 *    ground depth and the reach (the shot's, else the preset's); the coupling HAND_COUPLING; the hands the stance's,
 *    with the profile's body;
 * 8. the lead L, the earliest action's: the impact starts L before contact, everything coasting until its action, and
 *    the grips relax at contact;
 * 9. (swingApproach) the coasting path's lowest clearance over the turf in the MAX_LEAD before contact;
 * 10. the head a solid cylinder of the profile's mallet.
 * The head starts on its own path (headOnPath at t = 0), so the hands start with no error to take up.
 */
import { contactReference, malletReference } from "../../reference/index";
import { headLowestPoint } from "../impact/contacts";
import { rotate, solidCylinderInertia } from "../impact/rigidBody";
import { HAND_COUPLING, headOnPath, pitchAxis, prepareTrack, swingOrientation } from "../impact/track";
import type { ContactState, FaceMaterial, Hands, MalletHead, SwingArc, TrackDrive } from "../impact/types";
import { sinCos } from "../math/elementary";
import { add, cross, dot, length, scale, sub, vec3 } from "../math/vec3";
import type { World } from "../types";
import type { ShotSetup, SwingDrive, SwingStance } from "./types";

/**
 * Gap (m) between the face and the striker's sunk surface at contact (design §5.2 step 4). Numerical, not physical:
 * it keeps rounding from starting the face inside the ball, and at 1 m/s the head closes it within a step.
 */
export const START_GAP = 1e-6;

/**
 * The longest lead-in (s): how early an action may be timed (design §5.2 step 8), and how far back swingApproach
 * looks. A modelling bound, not physical: the rigid pendulum's backswing is not credible much further back.
 */
export const MAX_LEAD = 0.06;

/** Spacing (s) of swingApproach's samples. Numerical: 0.5 ms moves a 3 m/s head 1.5 mm. */
const APPROACH_STEP = 5e-4;

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
    "handShare",
    "handGain",
    "handWindow",
    "handDrop",
    "dropTime",
    "handReach",
    "groundDepth",
    "guideEffort",
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

function effort(value: number, name: string): void {
    if (!(value >= 0 && value <= 1)) {
        fail(`${name} must lie in [0, 1] (got ${value})`);
    }
}

/**
 * The contact state of `setup` on `world` (design §5.2). Throws a RangeError naming the check (design §5.3) for:
 * - a striker absent from the setup, or a stroke type missing from the profile's stance or drive;
 * - a mode other than "swing" or "carry";
 * - a non-finite number, or a non-positive mallet dimension or mass;
 * - top ≤ 0, or top > shaftLength (the top hand off the shaft); bottom outside (0, top); |lean| ≥ 90°;
 * - speed ≤ 0; |drive| > 1; the contact off the face (√(up² + side²) ≥ the head's radius);
 * - window, handWindow or dropTime ≤ 0; speedGain < 0; gripTension or bottomGrip outside (0, 1]; handShare outside
 *   [0, 1]; handDrop < 0; the preset's or the shot's handReach < 0; groundDepth < 0; the preset's or the shot's
 *   guideEffort outside [0, 1]; armMass < 0; reachSlack < 0;
 * - an action timed more than MAX_LEAD early;
 * - the head's lowest point below the turf at contact, or where an early action begins.
 * A swing that meets the turf between its start and the ball is not rejected: the impact simulates it.
 */
export function buildContact(setup: ShotSetup, world: World): ContactState {
    const { stroke, profile } = setup;
    const striker = setup.balls[setup.striker];
    if (!striker) {
        fail(`striker ${setup.striker} is not in the setup`);
    }
    const { type, timing } = stroke;
    const stance = profile.stance[type];
    const push = profile.drive[type];
    if (!stance) {
        fail(`profile.stance has no entry for ${type}`);
    }
    if (!push) {
        fail(`profile.drive has no entry for ${type}`);
    }
    if (push.mode !== "swing" && push.mode !== "carry") {
        fail(`profile.drive.${type}.mode must be "swing" or "carry" (got ${String(push.mode)})`);
    }
    finiteNumber(stroke.aim, "stroke.aim");
    finiteNumber(stroke.speed, "stroke.speed");
    finiteNumber(stroke.drive, "stroke.drive");
    finiteNumber(stroke.contact.up, "stroke.contact.up");
    finiteNumber(stroke.contact.side, "stroke.contact.side");
    finiteNumber(timing.arc, "stroke.timing.arc");
    finiteNumber(timing.hands, "stroke.timing.hands");
    finiteNumber(timing.dip, "stroke.timing.dip");
    if (stroke.handReach !== undefined) {
        finiteNumber(stroke.handReach, "stroke.handReach");
    }
    if (stroke.guideEffort !== undefined) {
        finiteNumber(stroke.guideEffort, "stroke.guideEffort");
    }
    for (const key of STANCE_NUMBERS) {
        finiteNumber(stance[key], `profile.stance.${type}.${key}`);
    }
    for (const key of DRIVE_NUMBERS) {
        finiteNumber(push[key], `profile.drive.${type}.${key}`);
    }
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
    if (!(stroke.speed > 0)) {
        fail(`stroke.speed must be positive (got ${stroke.speed})`);
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
    if (!(push.handShare >= 0 && push.handShare <= 1)) {
        fail(`profile.drive.${type}.handShare must lie in [0, 1] (got ${push.handShare})`);
    }
    nonNegative(push.handDrop, `profile.drive.${type}.handDrop`);
    nonNegative(push.handReach, `profile.drive.${type}.handReach`);
    if (stroke.handReach !== undefined) {
        nonNegative(stroke.handReach, "stroke.handReach");
    }
    nonNegative(push.groundDepth, `profile.drive.${type}.groundDepth`);
    effort(push.guideEffort, `profile.drive.${type}.guideEffort`);
    if (stroke.guideEffort !== undefined) {
        effort(stroke.guideEffort, "stroke.guideEffort");
    }
    nonNegative(body.armMass, "profile.body.armMass");
    nonNegative(body.reachSlack, "profile.body.reachSlack");
    // Step 8's lead: the earliest action's, none on time.
    const lead = Math.max(0, 0 - timing.arc, 0 - timing.hands, 0 - timing.dip);
    if (lead > MAX_LEAD) {
        fail(`an action is timed more than ${MAX_LEAD} s early (${lead} s before contact)`);
    }

    const R = world.ball.radius;
    const surface = world.lawn.surfaceAt(striker.position);
    const sunk = R - (world.ball.mass * world.gravity) / surface.turfStiffness;
    const centre = vec3(striker.position.x, striker.position.y, sunk);
    // Steps 1 to 3: the pivot is the top hand, and the head, rigid on the shaft, pitches with it.
    const radius = top;
    const thetaC = 0 - lean;
    const [sa, ca] = sinCos(stroke.aim);
    const aim = vec3(ca, sa, 0);
    const orientation = swingOrientation(aim, thetaC);
    // Step 4: f the face's outward normal (body x), its upward axis body z, `side` along body y (left of aim).
    const face = rotate(orientation, vec3(1, 0, 0));
    const upward = rotate(orientation, vec3(0, 0, 1));
    const left = rotate(orientation, vec3(0, 1, 0));
    const faceCentre = sub(sub(sub(centre, scale(face, R + START_GAP)), scale(upward, up)), scale(left, side));
    const headCentre = sub(faceCentre, scale(face, mallet.headLength / 2));
    const socket = add(headCentre, scale(upward, rho));
    // Step 5.
    const [st, ct] = sinCos(thetaC);
    const pivot = sub(socket, scale(sub(scale(aim, st), vec3(0, 0, ct)), radius));
    // Step 6: |w|²·ω² + 2·(V₀·w)·ω + |V₀|² − speed² = 0 with w = n × (c − pivot); |V₀| ≤ speed, so the larger root is
    // never negative.
    const pivotVelocity = scale(aim, push.handShare * stroke.speed);
    const lever = cross(pitchAxis(aim), sub(headCentre, pivot));
    const a = dot(lever, lever);
    const b = dot(pivotVelocity, lever);
    const c = dot(pivotVelocity, pivotVelocity) - stroke.speed * stroke.speed;
    const omega0 = (Math.sqrt(b * b - a * c) - b) / a;
    // Steps 7 and 8, the arc expressed from the start, L before contact.
    const arc: SwingArc = {
        pivot: sub(pivot, scale(pivotVelocity, lead)),
        pivotVelocity,
        pivotAcceleration: scale(aim, (stroke.drive * push.handGain * stroke.speed) / push.handWindow),
        handStart: lead + timing.hands,
        handWindow: push.handWindow,
        aim,
        radius,
        theta0: thetaC - omega0 * lead,
        omega0,
        alpha: (stroke.drive * push.speedGain * stroke.speed) / (length(lever) * push.window),
        arcStart: lead + timing.arc,
        window: push.window,
        dip: { start: lead + timing.dip, duration: push.dropTime, depth: push.handDrop },
        contactAt: lead,
        mode: push.mode,
        handReach: stroke.handReach ?? push.handReach,
        groundDepth: push.groundDepth,
    };
    const hands: Hands = {
        bottom,
        gripTension,
        bottomGrip,
        armMass: body.armMass,
        reachSlack: body.reachSlack,
        guideEffort: stroke.guideEffort ?? push.guideEffort,
    };
    const drive: TrackDrive = {
        kind: "track",
        arc,
        coupling: { period: HAND_COUPLING.period, dampingRatio: HAND_COUPLING.dampingRatio, relaxAt: lead },
        hands,
    };
    // Step 10.
    const head: MalletHead = {
        mass: mallet.headMass,
        inertia: solidCylinderInertia(mallet.headMass, mallet.headLength, rho),
        length: mallet.headLength,
        radius: rho,
        socket: vec3(0, 0, rho),
    };
    const still = vec3(0, 0, 0);
    const atContact = headLowestPoint(
        { position: headCentre, orientation, velocity: still, angularVelocity: still },
        head,
    );
    if (atContact < 0) {
        fail(`the head is in the turf at contact: its lowest point is ${0 - atContact} m below it`);
    }
    const start = headOnPath(prepareTrack(drive, head, world.gravity), head, 0);
    const clearance = headLowestPoint(start, head);
    if (clearance < 0) {
        fail(
            `the head is in the turf ${lead} s before contact, where the earliest action begins: its lowest point is ` +
                `${0 - clearance} m below it (the stance is too low for that timing)`,
        );
    }
    return { head, face: WOOD, ...start, drive };
}

/** The coasting path's closest approach to the turf before contact (design §5.2 step 9). */
export interface SwingApproach {
    /** The head's lowest clearance above the turf (m); negative where it would have dug in. */
    readonly clearance: number;
    /** When, in s before the planned contact. */
    readonly before: number;
}

/**
 * How close the head's coasting path comes to the turf in the MAX_LEAD before the planned contact of a tracked contact
 * state, sampled every APPROACH_STEP. Every action is removed: no window's change and no dip, and each window and the
 * dip begin at the planned contact, so every sample (all at or before it) lies on the path's coasting branch whatever
 * the mode (a carry's slowing pendulum, a swing's free one and the reach all begin after it). A swing is simulated only
 * from its earliest action (design §5.2 step 8), so this reports the dig an on-time low swing would have made.
 */
export function swingApproach(contact: ContactState): SwingApproach {
    if (contact.drive.kind !== "track") {
        fail("swingApproach needs a tracked contact state");
    }
    const { arc } = contact.drive;
    const still = vec3(0, 0, 0);
    const coasting: TrackDrive = {
        ...contact.drive,
        arc: {
            ...arc,
            alpha: 0,
            pivotAcceleration: still,
            arcStart: arc.contactAt,
            handStart: arc.contactAt,
            dip: { ...arc.dip, start: arc.contactAt, depth: 0 },
        },
    };
    const track = prepareTrack(coasting, contact.head, 0);
    let clearance = Infinity;
    let before = 0;
    const samples = Math.round(MAX_LEAD / APPROACH_STEP);
    for (let k = 0; k <= samples; k++) {
        const back = k * APPROACH_STEP;
        const z = headLowestPoint(headOnPath(track, contact.head, arc.contactAt - back), contact.head);
        if (z < clearance) {
            clearance = z;
            before = back;
        }
    }
    return { clearance, before };
}
```

(`headLowestPoint` reads only the position and orientation of the state it is given. `swingApproach` samples times
before t = 0 when the lead is shorter than `MAX_LEAD`; the path's first branch, θ₀ + ω₀·t and P₀ + V₀·t, holds for
them.)

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/engine/swing/buildContact.test.ts`
Expected: PASS. The canonical clearances and approaches, the hand-computed low swing (3.97774 mm at contact; −3.64180
mm at the 36.5 ms sample) and the two turf rejections were measured while planning on prototype `aeadd4c`'s geometry,
which is the spec's; pre-flight re-measures them. If one differs by more than its test's tolerance (5e-7 m for the
pinned clearances, 5e-13 m against the closed form), print the figure and report it before changing an expectation:
the geometry is the spec's, so a difference is a defect in Tasks 3–8 or in this table.

- [ ] **Step 7: Format and check**

Run: `npx prettier --write src/engine/swing/types.ts src/engine/swing/profile.ts src/engine/swing/buildContact.ts
src/engine/world.ts tests/engine/support/shot.ts tests/engine/swing/buildContact.test.ts` (one command).
Then run each of:
- `npm test` — PASS;
- `npm run lint` — no errors (the determinism lint covers `src/engine/swing/`);
- `npm run check` — no errors;
- `npm run format:check` — clean.

Check line lengths: `env LC_ALL=en_GB.UTF-8 grep -nE "^.{121,}$" src/engine/swing/types.ts
src/engine/swing/profile.ts src/engine/swing/buildContact.ts src/engine/world.ts tests/engine/support/shot.ts
tests/engine/swing/buildContact.test.ts` prints nothing.

- [ ] **Step 8: Commit**

Write the message to `msg.txt` in the session's temp directory (the literal value of `$CLAUDE_TEMP_DIR`, written out
in full below as `<temp>`):

```
Add the swing model: two hands, swing and carry modes, and the default profile

buildContact derives the tracked drive from a ShotSetup: the arc radius from
the top hand, the contact angle from the lean, the head rigid on the shaft,
both arcs' speeds and windows, the dip, the mode, the reach and the ground
depth, the coupling and the two hands, and the lead-in for early actions.
swingApproach reports the coasting path's closest approach to the lawn in the
60 ms before contact. defaultProfile ships the provisional presets after
Riches and the prototype's calibration, with the AC stop's 11 mm dip.
```

```bash
git add src/engine/swing src/engine/world.ts tests/engine/support/shot.ts tests/engine/swing/buildContact.test.ts
git commit -F <temp>/msg.txt
git log -1 "--format=%G? %h"
```

Run each line as its own command. Commit with the sandbox disabled, for the SSH agent's signing. Expect `G`; if
signing refuses, leave the change staged and report it.

---
### Task 9: The fault judge: 29.1.13 "plays away from" and 29.1.14

Spec §6.4. `StrokeContext` gains `aim?` and `lineOfCentres?` (see "Decisions made while planning"). 29.1.13 gains its
second clause, reported after the first. 29.1.14 is a possible fault under Law 29.2.3 when the head–turf pair has an
interval. `judgeFaults`'s signature is unchanged. Folds pre-flight defects D8.1–D8.4.

**Files:**
- Modify: `src/engine/faults.ts`, `tests/engine/faults.test.ts`

**Interfaces:**
- Consumes: `HEAD_TURF_KEY` (Task 6), `ImpactRun.headTurfSlide` (Task 6), `lawsReference.faults["29.1.14"]` and
  `FAULT_LAW_KEYS` with "29.1.14" (Task 2).
- Produces:
  - `StrokeContext.aim?: Vec3` and `StrokeContext.lineOfCentres?: Vec3`;
  - `JUDGED_LAWS`, with `"29.1.14"` after `"29.1.13"`;
  - findings `29.1.13 fault { angle }` and `29.1.14 possible-fault { penetration, peakForce, slide }`.

- [ ] **Step 1: Write the failing tests**

In `tests/engine/faults.test.ts`, change the vec3 import to:

```ts
import { vec3, ZERO } from "../../src/engine/math/vec3";
```

In `impact()`'s parameter type, add after `balls?: BallStates;`:

```ts
    headTurfSlide?: number;
```

and at the end of its returned object, after `overlapCorrection: 0,`:

```ts
        ...(over.headTurfSlide === undefined ? {} : { headTurfSlide: over.headTurfSlide }),
```

Then append at the end of the file:

```ts
describe("judgeFaults: 29.1.13 'plays away from' and 29.1.14 (P2b.2b.1)", () => {
    const LINE = vec3(1, 0, 0);
    /** A swing direction `degrees` from the line of centres, built directly rather than through the engine's sinCos. */
    const towards = (degrees: number) =>
        vec3(Math.cos((degrees * Math.PI) / 180), Math.sin((degrees * Math.PI) / 180), 0);
    const pressed = impact({ peakPenetration: { "blue/red": 1e-4 } });

    it("finds a croquet stroke played at more than 90° to the line of centres, and not at less", () => {
        expect(laws(judgeFaults({ ...CROQUET, aim: towards(89.9), lineOfCentres: LINE }, pressed))).toEqual([]);
        const away = judgeFaults({ ...CROQUET, aim: towards(90.1), lineOfCentres: LINE }, pressed);
        expect(laws(away)).toEqual(["29.1.13 fault"]);
        expect(away.findings[0]).toMatchObject({ ball: "red", t: pressed.duration });
        expect(away.findings[0]?.evidence.angle).toBeCloseTo((90.1 * Math.PI) / 180, 12);
    });

    it("reports both 29.1.13 clauses, 'fails to move or shake' first", () => {
        const both = judgeFaults({ ...CROQUET, aim: towards(150), lineOfCentres: LINE }, impact({}));
        expect(both.findings.map((f) => [f.law, Object.keys(f.evidence)])).toEqual([
            ["29.1.13", ["peakPenetration"]],
            ["29.1.13", ["angle"]],
        ]);
    });

    it("leaves 'plays away from' unjudged without a swing", () => {
        expect(laws(judgeFaults(CROQUET, pressed))).toEqual([]);
    });

    it("ignores aim outside a croquet stroke", () => {
        expect(laws(judgeFaults({ ...SINGLE, aim: towards(120) }, impact({})))).toEqual([]);
    });

    it("29.1.14: the head in the turf in a stroke of Law 29.2.3 is a possible fault, with its evidence", () => {
        const dug = impact({
            timeline: { "face/blue": [iv(0, 2 * T)], "head/turf": [iv(3 * T, 9 * T, 40), iv(12 * T, 13 * T, 55)] },
            peakPenetration: { "head/turf": 4e-4 },
            headTurfSlide: 0.012,
        });
        for (const context of [
            { ...SINGLE, hampered: true },
            { ...SINGLE, jumpAttempt: true },
            { ...SINGLE, group: true },
        ]) {
            const report = judgeFaults(context, dug);
            expect(laws(report)).toEqual(["29.1.14 possible-fault"]);
            expect(report.findings[0]).toMatchObject({
                ball: "blue",
                t: 3 * T,
                evidence: { penetration: 4e-4, peakForce: 55, slide: 0.012 },
            });
        }
        expect(laws(judgeFaults(SINGLE, dug))).toEqual([]);
    });

    it("reports 29.1.14 after 29.1.13", () => {
        const dug = impact({ timeline: { "head/turf": [iv(0, T)] } });
        expect(laws(judgeFaults({ ...CROQUET, group: true }, dug))).toEqual([
            "29.1.13 fault",
            "29.1.14 possible-fault",
        ]);
    });

    it("rejects an aim or a line of centres that is not a horizontal unit vector, and an aim without its line", () => {
        expect(() => judgeFaults({ ...CROQUET, aim: vec3(1, 0, 0.1), lineOfCentres: LINE }, pressed)).toThrow(
            /aim must be a horizontal unit vector/,
        );
        expect(() => judgeFaults({ ...CROQUET, aim: LINE, lineOfCentres: vec3(2, 0, 0) }, pressed)).toThrow(
            /lineOfCentres must be a horizontal unit vector/,
        );
        expect(() => judgeFaults({ ...CROQUET, aim: LINE }, pressed)).toThrow(/needs its lineOfCentres/);
    });
});
```

"ignores aim outside a croquet stroke" pins the Review Focus item 4: a single-ball context with `aim` and no
`lineOfCentres` neither throws nor finds 29.1.13.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/engine/faults.test.ts`
Expected: FAIL, 5 tests, all assertion failures (the context's extra fields are ignored at runtime): "finds a croquet
stroke played at more than 90°" (`[]` where `["29.1.13 fault"]` is expected), "reports both 29.1.13 clauses" (one
finding where two are expected), the two 29.1.14 tests (29.1.14 never found) and "rejects an aim…" (nothing thrown).
"leaves 'plays away from' unjudged without a swing" and "ignores aim outside a croquet stroke" already pass, as do the
existing tests. `npm run check` reports 7 errors, each "'aim' does not exist in type 'StrokeContext'" (tsc reports
the first excess property of each literal, so `lineOfCentres` is not named).

- [ ] **Step 3: Judge them**

In `src/engine/faults.ts`:

Replace the contacts import and add two imports after the `./impact/types` import:

```ts
import { ballPairKey, faceKey, HEAD_TURF_KEY, obstacleKey } from "./impact/contacts";
```

```ts
import { atan2 } from "./math/elementary";
import { cross, dot, length, type Vec3 } from "./math/vec3";
```

In the file header, replace the paragraph

```ts
 * A mallet contact is a `face/<ball>` interval: the face or its rim (C29.11.9, C29.20.2); the rest of the mallet is not
 * modelled. Intervals are [start, end) in whole steps.
```

with

```ts
 * A mallet contact is a `face/<ball>` interval: the face or its rim (C29.11.9, C29.20.2) for a force-table drive, and
 * any part of the head for a tracked drive (P2b.2b.1 design §4.5); the shaft is not modelled. Intervals are
 * [start, end) in whole steps.
```

and add after the 29.1.9 paragraph (the header's last paragraph, before ` */`):

```ts
 *
 * 29.1.13 has two clauses, reported in this order and told apart by their evidence: "fails to move or shake" (the
 * croqueted pair never penetrates beyond CONTACT_TOLERANCE; evidence peakPenetration), and "plays away from" (the
 * swing direction more than 90° from the line of centres: the engine's reading of C29.18.1, which sets no angular
 * test; evidence angle), judged only when the context carries the swing (P2b.2b.1 design §6.4).
 *
 * 29.1.14 (court damage) is a possible fault: a damaged lawn is something an adjudicator sees, and the Law judges its
 * effect on later strokes (C29.19.5), which the impact's plane turf does not keep. It is found when the head–turf
 * pair has an interval in a stroke of Law 29.2.3; no damage threshold is invented.
```

In `StrokeContext`, add after `group`:

```ts
    /**
     * The swing direction, unit and horizontal (P2b.2b.1 design §6.4); absent when the judge is called without a
     * swing. In a croquet stroke it decides 29.1.13's "plays away from", with `lineOfCentres`.
     */
    readonly aim?: Vec3;
    /**
     * Unit horizontal vector from the striker's centre to the croqueted ball's at the start; required with `aim` in a
     * croquet stroke, since the impact carries no starting positions.
     */
    readonly lineOfCentres?: Vec3;
```

In `Finding`'s comment, replace "`evidence` holds measured quantities in s, m or N" with "`evidence` holds measured
quantities in s, m, N or rad". `JUDGED_LAWS` gains `"29.1.14",` after `"29.1.13",`. After the `NONE` constant, add:

```ts
/** Tolerance on a unit vector's |v|² − 1 and vertical component. Numerical, not physical: a few ulps. */
const UNIT_TOLERANCE = 1e-12;

function horizontalUnit(v: Vec3 | undefined, name: string): void {
    if (v !== undefined && !(Math.abs(v.z) <= UNIT_TOLERANCE && Math.abs(dot(v, v) - 1) <= UNIT_TOLERANCE)) {
        fail(`${name} must be a horizontal unit vector`);
    }
}
```

(`fail` is a function declaration below it, hoisted.) At the end of `validate`, after the live check, add:

```ts
    horizontalUnit(context.aim, "aim");
    horizontalUnit(context.lineOfCentres, "lineOfCentres");
    if (context.kind === "croquet" && context.aim !== undefined && context.lineOfCentres === undefined) {
        fail("a croquet stroke with an aim needs its lineOfCentres");
    }
```

In `judgeFaults`'s header comment, replace its third line, ` * absent ball as the croqueted one; a croqueted ball given
for another kind of stroke; the striker listed as live.`, with these two lines (D8.3):

```ts
 * absent ball as the croqueted one; a croqueted ball given for another kind of stroke; the striker listed as live; an
 * aim or line of centres that is not a horizontal unit vector, or a croquet stroke's aim without its line of centres.
```

Replace the 29.1.13 block (from its `// 29.1.13:` comment to the closing brace of `if (kind === "croquet")`) with:

```ts
    // 29.1.13: a croquet stroke that never presses the croqueted ball beyond CONTACT_TOLERANCE ("fails to move or
    // shake"), then one played at more than 90° from the line of centres ("plays away from", C29.18.1).
    if (kind === "croquet") {
        const croqueted = context.croqueted as BallId;
        const depth = impact.peakPenetration[ballPairKey(striker, croqueted)] ?? 0;
        if (depth <= CONTACT_TOLERANCE) {
            add("29.1.13", "fault", croqueted, impact.duration, { peakPenetration: depth });
        }
        const { aim, lineOfCentres } = context;
        if (aim !== undefined && lineOfCentres !== undefined) {
            const along = dot(aim, lineOfCentres);
            if (along < 0) {
                const angle = atan2(length(cross(aim, lineOfCentres)), along);
                add("29.1.13", "fault", croqueted, impact.duration, { angle });
            }
        }
    }
    // 29.1.14: in a stroke of Law 29.2.3, the head pressed into the turf (a possible fault; see the file header).
    const turf = impact.timeline[HEAD_TURF_KEY];
    if ((context.hampered || context.jumpAttempt || context.group) && turf && turf.length > 0) {
        add("29.1.14", "possible-fault", striker, (turf[0] as ContactInterval).start, {
            penetration: impact.peakPenetration[HEAD_TURF_KEY] ?? 0,
            peakForce: turf.reduce((m, i) => Math.max(m, i.peakForce), 0),
            slide: impact.headTurfSlide ?? 0,
        });
    }
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/engine/faults.test.ts`
Expected: PASS, including "judges only Laws quoted in reference/laws.json" (29.1.14 is quoted by Task 2).

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Format and check**

Run: `npx prettier --write src/engine/faults.ts tests/engine/faults.test.ts`
Expected: both files listed; no change beyond whitespace (the code above is already wrapped as prettier wraps it).

Run each in turn: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`.
Expected: all pass. Check line lengths with `env LC_ALL=en_GB.UTF-8 grep -nE "^.{121,}$" src/engine/faults.ts
tests/engine/faults.test.ts` (expect no output).

- [ ] **Step 6: Commit**

Write the message to `msg.txt` in the session's temp directory (the literal value of `$CLAUDE_TEMP_DIR`) with the
Write tool:

```
Judge 29.1.13's playing away and 29.1.14

StrokeContext gains the swing direction and the line of centres. A croquet stroke played more than 90° from its line
of centres is a 29.1.13 fault, reported after "fails to move or shake". The head meeting the turf in a stroke of Law
29.2.3 is a 29.1.14 possible fault, with its penetration, peak force and slide.
```

```bash
git add src/engine/faults.ts tests/engine/faults.test.ts
git commit -F /tmp/claude-<session-id>/msg.txt
git log -1 "--format=%G? %h"
```

Use the literal temp-directory path (worktree sessions refuse the variable) and disable the sandbox for the commit so
the SSH agent can sign. Expected: `G` and the short hash.

---
### Task 10: `simulateShot`, the canonical runs and the mechanisms

Spec §6.1–§6.3, exit criteria 3 and 4, and the `simulateShot`, effective-mass and mechanism cases of §8.1.
`simulateShot` checks the setup, then runs `buildContact`, `swingApproach`, `simulateImpact`, `strokeContext`,
`judgeFaults` and `simulateFreeMotion(impact.handover, world)` in that order. Phase 2 always runs. Folds pre-flight
defects D9.1–D9.4: D9.1 (the AC braking test on a hand-built profile) and D9.3 (the 5 % criterion's thin margin) are
resolved by the two-hand model and the effective-mass criterion, and both tests now run on the canonical setups; D9.2's
GC check is restated as spec §8.1 states it (the total hands' braking impulse positive at `drive` −1 and negative at
`drive` 0); D9.4's two long rejection rows are written as prettier wraps them.

**The GC stop is a single-ball stroke** (user decision, 2026-10-06). Its canonical setup has the target 0.3 m ahead
and live, so `strokeContext` gives it `kind` "single-ball" and no croqueted ball, and the judge rules on it as an AC
single-ball stroke. Its tests keep their mechanisms: one hit; the check's braking signs; and, in place of "slower than
the drive" (a single-ball strike sends the striker's ball off at much the same speed whatever the check), its head
comes to rest along aim and never moves back, where the single-ball stroke's at the same gap follows through. Its
distances after the touch are observations (Task 12 `gc`), never asserted.

**A check brakes the head to rest, not past it** (user decision, 2026-10-06; spec §3.3). Pre-flight found the GC
stop's check, its feed-forward sized for the unstruck head from 3 m/s (about −300 N over the 10 ms window), braking a
head the strike had already slowed to 1.145 m/s: the head crossed rest at about 5.6 ms and ended the impact moving back
at −1.0928 m/s. With the check's share (Task 4) it ends at −3.2e-4 m/s along aim, its pitch rate −5.5e-7 rad/s. The
test asserts the head within 0.01 m/s of rest at the impact's end and never below −0.01 m/s after the strike, and the
single-ball stroke's head above 1 m/s (1.3151).

**The AC stop is told from the drive by its coaching ratio** (user decision, 2026-10-06; spec §8.1). The first test
compared the striker's ball's speed at the impact's end, AC stop 1.3800 against the drive's 1.3919 m/s, a 0.86 %
margin between speeds taken 21.6 and 181 ms after contact (the plan's 1.513 was at the old 0.15 s cap). The stops'
test now compares the coaching ratios after phase 2: AC stop 6.464 against the drive's 3.316.

**Measured figures.** Every behavioural figure below was measured on the prototype (`proto-two-hands` aeadd4c, pass 4)
with its canonical setups built through its own `buildContact` and pass-4 profile, overridden to spec §5.4 where they
differ (AC stop `handReach` 0 and `handDrop` 0.011 m; pass roll `handReach` 0.30 m), except where marked pre-flight
(this plan's code, with the check to rest) and exit criterion 3's strike measure (pre-flight's). Each test's comment
gives its figure. The suite took 2.7 s on the prototype.

| Test | Figure |
|---|---|
| Exit criterion 4, `entryJumps.count` | 0 on all seven canonical setups |
| Exit criterion 4, highest centre above R | single-ball 0.85 mm, drive 0.93, stop-ac 4.17 (pre-flight 4.19, 0.81 mm inside 5 mm); stop-gc pre-flight 1.46 (0.81 touching) |
| (over the impact and the flight apexes) | half roll 0.72 mm, full roll 0.82, pass roll 2.92 |
| Exit criterion 3, closed form | 1.0066 kg (head 1.0 kg) |
| Exit criterion 3, the strike's measure | 1.006555 kg, 2.8e-5 off (closed form 1.006582) |
| Drive's follow-through | hits 0.01–1.20 ms and 91.76–92.61 ms; ends by itself at 181.4 ms (0.45 s cap) |
| No extra push (2 m/s drive, guideEffort 0 / 1) | 1 hit, ends by itself at 110.6 ms / 4 hits, 268.9 ms |
| Accelerating bottom hand (0.30 m, grip 1) | 5 hits, ratio 1.24 against 3.32 |
| Stops | pre-flight: one hit each; coaching ratio 6.464 (AC stop) against the drive's 3.316 |
| GC stop's check against the single-ball stroke (0.3 m gap) | pre-flight: head along aim at the impact's end −3.2e-4 m/s (lowest after the strike the same), single-ball 1.3151 m/s; both end at 10.0 ms; striker's ball 3.6241 against 3.7540 m/s |
| GC check, hands' braking impulse | pre-flight: +1.187 N·s at −1, −0.789 N·s at 0 (touching: +1.697, −2.465) |
| AC stop | pre-flight: face interval ends 1.17 ms; head on turf 12.52–21.38 ms, 1.80 mm deep; the impact ends at 21.63 ms |
| AC stop, braking | pre-flight: turf +0.401 N·s, hands +0.225 N·s; no `impact-head-deep` |
| AC dip depth | pre-flight: 8 mm 0.51 mm deep; 10 mm 1.40; 11 mm 1.80; 11.5 mm 2.00; 12 mm 2.19 and `impact-head-deep`; the turf after the face interval at each |
| Pass-roll punch | striker's ball 1.226 m/s at +1, 1.099 at 0 |
| Dip 30 ms early | head on turf from 20.72 ms, ball struck from 31.05 ms; 1.214 against 1.380 m/s (pre-flight 1.215) |
| Gentle tap (0.1 m/s) | ends at 10 ms, no `impact-cap`, no `impact-head-approaching` |
| Crush | 29.1.8 and 29.1.9; 57.8 ms; phase 2 not aborted |
| 29.1.13 on a whole stroke | 89.9°: no finding (0.11 µm pressed); 90.1°: both clauses in order, angle 1.5725 rad |
| 29.1.14 on a whole stroke | canonical AC stop, hampered: one finding at 12.70 ms (pre-flight 12.52 ms); not hampered: none |
| (its evidence) | penetration 1.73 mm, peak force 219.5 N, slide 1.71 mm (pre-flight 1.80 mm, 228.7 N, 1.83 mm) |

**Exit criterion 3's measure counts both balls** (a correction to spec §8.1, which names the striker's ball alone). On
the drive's canonical setup the croqueted ball touches the striker's, and takes its share of the momentum through it
during the face interval: the striker's ball alone gains 0.653 N·s against 2.299 N·s for both, so its quotient is
0.286 kg, not an effective mass. The sum of both balls' momentum along aim is what the face delivers (the face pair's
own impulse gives 1.0084 kg, the same within 0.2 %). The spec's wording is to be amended to match.

**Files:**
- Create: `src/engine/shot.ts`, `tests/engine/shot.test.ts`

**Interfaces:**
- Consumes:
  - `buildContact`, `swingApproach`, `SwingApproach` (Task 8, `swing/buildContact.ts`); `STROKE_TYPES`,
    `CROQUET_STROKES`, `ShotSetup`, `StrokeType`, `SwingStance` (Task 8, `swing/types.ts`);
  - `canonicalSetup(type, over?)` with `CanonicalOptions` `{ world?, stroke?, stance?, drive?, targetGap? }`,
    `CANONICAL_STRIKER` and `GC_STOP_GAP` (Task 8, `tests/engine/support/shot.ts`);
  - `judgeFaults`, `StrokeContext.aim`/`.lineOfCentres` (Task 9);
  - `swungBody(head, hands, radius)`, `effectiveMass(body, head, orientation, direction)` (Task 3);
    `TrackDrive` (Task 3; in `ContactState.drive` from Task 5);
  - `ImpactRun.entryJumps` (Task 7), `ImpactSnapshot.hand` (Task 4), `ImpactSnapshot.headTurf` (Task 6);
  - `simulateImpact`, `simulateFreeMotion`, `recorder` (existing).
- Produces:
  - `interface ShotOutcome`, with `contact: ContactState`, `approach: SwingApproach`, `context: StrokeContext`,
    `impact: ImpactResult`, `faults: FaultReport` and `motion: ShotResult`;
  - `strokeContext(setup: ShotSetup, impact: ImpactResult): StrokeContext`;
  - `simulateShot(setup: ShotSetup, world?: World): ShotOutcome`.

- [ ] **Step 1: Write the failing tests**

Create `tests/engine/shot.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { judgeFaults } from "../../src/engine/faults";
import { IMPACT_DT, TRACK_IMPACT_CAP, type ImpactProbe, type ImpactSnapshot } from "../../src/engine/impact/integrate";
import { IDENTITY, rotate } from "../../src/engine/impact/rigidBody";
import { simulateImpact } from "../../src/engine/impact/simulateImpact";
import { effectiveMass, swungBody } from "../../src/engine/impact/track";
import type { ContactInterval, HeadState, ImpactResult, TrackDrive } from "../../src/engine/impact/types";
import { ZERO, add, cross, dot, horizontal, length, scale, sub, vec3, type Vec3 } from "../../src/engine/math/vec3";
import { simulateShot, strokeContext, type ShotOutcome } from "../../src/engine/shot";
import { simulateFreeMotion } from "../../src/engine/simulate";
import { buildContact, swingApproach } from "../../src/engine/swing/buildContact";
import { STROKE_TYPES, type ShotSetup } from "../../src/engine/swing/types";
import type { BallId, BallState, Hoop, World } from "../../src/engine/types";
import { defaultWorld, hoopHalfSpan, hoopLateral } from "../../src/engine/world";
import { recorder } from "./support/impact";
import { CANONICAL_STRIKER, GC_STOP_GAP, canonicalSetup } from "./support/shot";

const WORLD = defaultWorld();
const R = WORLD.ball.radius;
const { x: X, y: Y } = CANONICAL_STRIKER;
const at = (x: number, y: number): BallState => ({ position: vec3(x, y, R), velocity: ZERO, angularVelocity: ZERO });

/** A hand-built impact for strokeContext: only the pairs touching at the start matter. */
function started(touchingAtStart: readonly string[]): ImpactResult {
    return {
        balls: {},
        head: { position: ZERO, orientation: IDENTITY, velocity: ZERO, angularVelocity: ZERO },
        duration: 0,
        events: [],
        peakPenetration: {},
        steps: 0,
        timeline: {},
        touchingAtStart,
        handover: {},
        overlapCorrection: 0,
    };
}

/** A canonical single-ball setup with red, black and yellow in a row beside blue, along +x. */
function withOthers(over: Partial<ShotSetup> = {}): ShotSetup {
    return {
        ...canonicalSetup("single-ball"),
        balls: { blue: at(X, Y), red: at(X + 2 * R, Y), black: at(X + 4 * R, Y), yellow: at(X + 6 * R, Y) },
        ...over,
    };
}

/** The canonical drive with the croqueted ball touching the striker, its line of centres `degrees` left of aim. */
function croquetAt(degrees: number): ShotSetup {
    const base = canonicalSetup("drive");
    const line = Math.PI / 2 + (degrees * Math.PI) / 180;
    return { ...base, balls: { ...base.balls, red: at(X + 2 * R * Math.cos(line), Y + 2 * R * Math.sin(line)) } };
}

/** The face–ball intervals of the striker's ball: its hits, over every region of the head (design §4.5). */
const hits = (impact: ImpactResult): readonly ContactInterval[] => impact.timeline["face/blue"] ?? [];

/** The striker's ball's speed at the end of the impact (m/s). */
const strikerSpeed = (impact: ImpactResult): number => length((impact.handover.blue as BallState).velocity);

/** The head's velocity along aim (+y) at the end of the impact (m/s). */
const headSpeed = (impact: ImpactResult): number => dot(impact.head.velocity, vec3(0, 1, 0));

/** The croqueted ball's distance to rest over the striker's (the coaching ratio, design §9). */
function ratio(setup: ShotSetup, outcome: ShotOutcome): number {
    const travelled = (id: BallId): number =>
        length(horizontal(sub(outcome.motion.rest[id] as Vec3, (setup.balls[id] as BallState).position)));
    return travelled("red") / travelled("blue");
}

/**
 * One stroke probed: the hands' and the turf's braking impulses along aim (design §3.7), from the end of the first
 * face–ball interval to the end of the impact, positive when they slow the head.
 */
function braking(setup: ShotSetup) {
    const probe = recorder();
    const impact = simulateImpact(buildContact(setup, WORLD), setup.balls, WORLD, { probe });
    const aim = vec3(0, 1, 0);
    const faceEnd = (hits(impact)[0] as ContactInterval).end;
    let hands = 0;
    let turf = 0;
    for (const s of probe.snapshots) {
        // A snapshot's t is its step's end; the step starting at faceEnd is the first after the interval.
        if (s.t <= faceEnd) {
            continue;
        }
        hands -= dot((s.hand as { force: Vec3 }).force, aim) * IMPACT_DT;
        turf -= dot(s.headTurf ?? ZERO, aim) * IMPACT_DT;
    }
    return { impact, hands, turf };
}

describe("strokeContext", () => {
    it("builds a croquet stroke's context: the croqueted ball, the swing and the line of centres", () => {
        const context = strokeContext(canonicalSetup("drive"), started(["blue/red"]));
        expect(context).toMatchObject({
            striker: "blue",
            kind: "croquet",
            croqueted: "red",
            live: [],
            hampered: false,
            jumpAttempt: false,
            group: false,
        });
        expect(length(sub(context.aim as Vec3, vec3(0, 1, 0)))).toBeLessThan(1e-12);
        expect(length(sub(context.lineOfCentres as Vec3, vec3(0, 1, 0)))).toBeLessThan(1e-12);
    });

    it("judges the GC stop as a single-ball stroke, its target live and GC_STOP_GAP ahead", () => {
        // User decision (2026-10-06): the GC stop is never a croquet stroke.
        const setup = canonicalSetup("stop-gc");
        const red = (setup.balls.red as BallState).position;
        expect(length(sub(red, vec3(X, Y + 2 * R + GC_STOP_GAP, R)))).toBeLessThan(1e-12);
        expect(setup.croqueted).toBeUndefined();
        const context = strokeContext(setup, started([]));
        expect(context).toMatchObject({ striker: "blue", kind: "single-ball", live: ["red"], group: false });
        expect(context.croqueted).toBeUndefined();
        expect(context.lineOfCentres).toBeUndefined();
    });

    it("tells a continuation while touching from a single-ball stroke", () => {
        expect(strokeContext(withOthers({ continuation: true }), started(["blue/red"])).kind).toBe(
            "continuation-touching",
        );
        expect(strokeContext(withOthers({ continuation: true }), started([])).kind).toBe("single-ball");
        expect(strokeContext(withOthers(), started(["blue/red"])).kind).toBe("single-ball");
    });

    it("finds the striker's ball in a 3-ball or 4-ball group, and not in a pair alone", () => {
        const s = withOthers();
        expect(strokeContext(s, started(["blue/red"])).group).toBe(false);
        expect(strokeContext(s, started(["blue/red", "red/black"])).group).toBe(true);
        expect(strokeContext(s, started(["blue/red", "blue/black"])).group).toBe(true);
        expect(strokeContext(s, started(["blue/red", "red/black", "black/yellow"])).group).toBe(true);
        expect(strokeContext(s, started(["red/black", "black/yellow"])).group).toBe(false);
        expect(strokeContext(s, started(["blue@1/a", "blue/red"])).group).toBe(false);
        expect(strokeContext(canonicalSetup("drive"), started(["blue/red"])).group).toBe(false);
    });

    it("copies live, hampered and jumpAttempt", () => {
        const setup = withOthers({ live: ["red", "yellow"], hampered: true, jumpAttempt: true });
        expect(strokeContext(setup, started([]))).toMatchObject({
            live: ["red", "yellow"],
            hampered: true,
            jumpAttempt: true,
        });
    });
});

describe("simulateShot", () => {
    it.each(STROKE_TYPES)("runs the %s canonical setup with no entry jump and no ball above R + 5 mm", (type) => {
        // Exit criterion 4. Prototype (pass 4, design §5.4 values), highest centre above R over the impact and the
        // flights: 0.85 mm single-ball, 0.93 drive, 4.17 stop-ac (the rising strike), 0.72 half roll, 0.82 full roll,
        // 2.92 pass roll; no entry jump anywhere. Pre-flight re-measures them, and measures stop-gc on its target
        // setup (its 0.81 mm was on the retired touching setup).
        const setup = canonicalSetup(type);
        const outcome = simulateShot(setup);
        expect(outcome.impact.entryJumps?.count).toBe(0);
        expect(hits(outcome.impact).length).toBeGreaterThan(0);
        expect(outcome.motion.aborted).toBe(false);
        let highest = 0;
        const probe: ImpactProbe = {
            step: (s) => {
                for (const ball of s.balls) {
                    highest = Math.max(highest, ball.position.z);
                }
            },
        };
        simulateImpact(outcome.contact, setup.balls, WORLD, { probe });
        for (const segments of Object.values(outcome.motion.segments)) {
            for (const { start } of segments ?? []) {
                const vz = start.velocity.z;
                highest = Math.max(highest, start.position.z + (vz > 0 ? (vz * vz) / (2 * WORLD.gravity) : 0));
            }
        }
        expect(highest).toBeLessThanOrEqual(R + 0.005);
    });

    it("runs each stage in turn, and hands phase 2 exactly the impact's handover", () => {
        const setup = canonicalSetup("half-roll");
        const outcome = simulateShot(setup);
        expect(outcome.contact).toEqual(buildContact(setup, WORLD));
        expect(outcome.approach).toEqual(swingApproach(outcome.contact));
        expect(outcome.impact).toEqual(simulateImpact(outcome.contact, setup.balls, WORLD));
        expect(outcome.context).toEqual(strokeContext(setup, outcome.impact));
        expect(outcome.faults).toEqual(judgeFaults(outcome.context, outcome.impact));
        expect(outcome.motion).toEqual(simulateFreeMotion(outcome.impact.handover, WORLD));
    });

    it("judges 'plays away from' on a whole croquet stroke at 90.1° from the line of centres, not at 89.9°", () => {
        // Prototype: at 89.9° no finding (the striker's ball grazes the croqueted ball 0.11 µm deep, past
        // CONTACT_TOLERANCE); at 90.1° both clauses, the croqueted ball behind the striker's never pressed, the angle
        // 1.5725 rad.
        const clauses = (degrees: number) =>
            simulateShot(croquetAt(degrees))
                .faults.findings.filter((f) => f.law === "29.1.13")
                .map((f) => Object.keys(f.evidence));
        expect(clauses(89.9)).toEqual([]);
        expect(clauses(90.1)).toEqual([["peakPenetration"], ["angle"]]);
    });

    it("finds 29.1.14 only in a stroke of Law 29.2.3: the canonical AC stop's head meets the turf", () => {
        // Prototype: the head on the turf from 12.70 ms, 1.73 mm deep, 1.71 mm of slide (pre-flight, with the check to
        // rest: 12.52 ms, 1.80 mm, 1.83 mm).
        const setup = canonicalSetup("stop-ac");
        const dug = simulateShot({ ...setup, hampered: true }).faults.findings.filter((f) => f.law === "29.1.14");
        expect(dug).toHaveLength(1);
        expect(dug[0]).toMatchObject({ tier: "possible-fault", ball: "blue" });
        expect(simulateShot(setup).faults.findings.map((f) => f.law)).not.toContain("29.1.14");
    });

    it("ends a gentle tap before the cap", () => {
        // Review focus 1. Prototype: a 0.1 m/s tap ends at 10 ms, the pendulum's window.
        const kinds = simulateShot(canonicalSetup("single-ball", { stroke: { speed: 0.1 } })).impact.events.map(
            (e) => e.kind,
        );
        expect(kinds).not.toContain("impact-cap");
        expect(kinds).not.toContain("impact-head-approaching");
    });

    it("finds a crush when the tracked head drives the ball into an upright", () => {
        // Review focus 5. Prototype: 29.1.8 and 29.1.9 (the ball touches the upright at the start); 57.8 ms.
        const hoop = WORLD.hoops[0] as Hoop;
        const upright = vec3(X, Y + R + hoop.uprightRadius, 0);
        const centre = add(upright, scale(hoopLateral(hoop), -hoopHalfSpan(hoop)));
        const world: World = { ...WORLD, hoops: [{ ...hoop, centre }] };
        const outcome = simulateShot(canonicalSetup("single-ball", { world }), world);
        expect(outcome.faults.findings.map((f) => f.law)).toContain("29.1.8");
        expect(outcome.motion.aborted).toBe(false);
    });

    const croquet = canonicalSetup("drive");
    const rejections: readonly [string, ShotSetup, RegExp][] = [
        ["an absent striker", { ...withOthers(), striker: "red", balls: { blue: at(X, Y) } }, /striker red is not in/],
        ["a live ball not in the setup", { ...canonicalSetup("single-ball"), live: ["black"] }, /live ball black/],
        ["the striker live", { ...withOthers(), live: ["blue"] }, /cannot be live/],
        ["a live ball listed twice", { ...withOthers(), live: ["red", "red"] }, /listed twice/],
        ["a croquet stroke without a croqueted ball", { ...withOthers(), stroke: croquet.stroke }, /needs a croqueted/],
        ["the striker croqueted", { ...croquet, croqueted: "blue" }, /cannot be the striker/],
        ["a croqueted ball not in the setup", { ...croquet, croqueted: "yellow" }, /croqueted ball yellow is not in/],
        [
            "a croqueted ball not touching",
            { ...croquet, balls: { ...croquet.balls, red: at(X, Y + 2 * R + 0.01) } },
            /must touch the striker/,
        ],
        [
            "a croqueted ball in a single-ball stroke",
            { ...withOthers(), croqueted: "red" },
            /only for a croquet stroke/,
        ],
        ["a non-positive lawn speed", { ...canonicalSetup("single-ball"), lawnSpeed: 0 }, /lawnSpeed/],
        [
            "a lawn speed the default world cannot use",
            { ...canonicalSetup("single-ball"), lawnSpeed: 1 },
            /rollingResist/,
        ],
    ];

    it.each(rejections)("rejects %s", (_name, setup, pattern) => {
        expect(() => simulateShot(setup)).toThrow(RangeError);
        expect(() => simulateShot(setup)).toThrow(pattern);
    });
});

describe("the effective mass (exit criterion 3)", () => {
    it("presents about the head's mass at the face on the canonical drive, and the strike measures it", () => {
        const setup = canonicalSetup("drive");
        const contact = buildContact(setup, WORLD);
        const { arc, hands } = contact.drive as TrackDrive;
        const { head } = contact;
        // Prototype: 1.0066 kg against the head's 1.0 kg.
        const closed = effectiveMass(swungBody(head, hands, arc.radius), head, contact.orientation, arc.aim);
        expect(Math.abs(closed - head.mass)).toBeLessThanOrEqual(0.1 * head.mass);

        // The strike's own measure: the balls' momentum along aim gained over the first face–ball interval, over the
        // face centre's loss of speed along aim. Both balls count: in a croquet stroke the croqueted ball takes its
        // share through the striker's during the interval. Prototype: 1.00655 kg, within 3.3e-5 of the closed form.
        const probe = recorder();
        const impact = simulateImpact(contact, setup.balls, WORLD, { probe });
        const strike = hits(impact)[0] as ContactInterval;
        expect(strike.start).toBeGreaterThan(0);
        // Snapshot i holds the state at the end of step i, t = (i + 1)·IMPACT_DT.
        const state = (t: number) => probe.snapshots[Math.round(t / IMPACT_DT) - 1] as ImpactSnapshot;
        const before = state(strike.start);
        const after = state(strike.end);
        expect(before.t).toBeCloseTo(strike.start, 12);
        expect(after.t).toBeCloseTo(strike.end, 12);
        const faceCentre = vec3(head.length / 2, 0, 0);
        const faceSpeed = (s: HeadState): number =>
            dot(add(s.velocity, cross(s.angularVelocity, rotate(s.orientation, faceCentre))), arc.aim);
        const momentum = (s: ImpactSnapshot): number =>
            s.balls.reduce((p, ball) => p + WORLD.ball.mass * dot(ball.velocity, arc.aim), 0);
        const measured = (momentum(after) - momentum(before)) / (faceSpeed(before.head) - faceSpeed(after.head));
        // 1 %: the hands draw 0.40 % of the single-ball strike's transfer (design §3.4) and the turf's friction on the
        // balls over the 1.2 ms interval less; the prototype's agreement is 300 times closer.
        expect(Math.abs(measured / closed - 1)).toBeLessThanOrEqual(0.01);
    });
});

describe("the mechanisms (design §8.1), on the canonical setups", () => {
    // Every figure below is the prototype's (pass 4 at aeadd4c, with design §5.4's values); pre-flight re-measures.
    it("the drive's follow-through strikes the striker's ball again, and the impact then ends by itself", () => {
        // Prototype: hits at 0.01–1.20 ms and 91.76–92.61 ms. Planning, at the 0.45 s cap: the impact ends by itself
        // 181.4 ms after contactAt, with no impact-cap and no impact-head-approaching.
        const { contact, impact } = simulateShot(canonicalSetup("drive"));
        const [first, second] = hits(impact);
        expect(hits(impact).length).toBeGreaterThanOrEqual(2);
        expect((second as ContactInterval).start).toBeGreaterThan((first as ContactInterval).end);
        expect((second as ContactInterval).end).toBeLessThanOrEqual(impact.duration);
        const kinds = impact.events.map((e) => e.kind);
        expect(kinds).not.toContain("impact-cap");
        expect(kinds).not.toContain("impact-head-approaching");
        expect(impact.duration).toBeLessThan((contact.drive as TrackDrive).arc.contactAt + TRACK_IMPACT_CAP);
    });

    it("no extra push: at guideEffort 0 the 2 m/s drive strikes once and ends by itself; at 1, more than once", () => {
        // Planning: at 0 one hit (0.01–1.20 ms), the impact ending by itself 110.6 ms after contactAt with no
        // impact-cap and no impact-head-approaching; at 1 four hits (from 0.01, 81.94, 126.77 and 159.11 ms), 268.9 ms.
        const at = (guideEffort: number) =>
            simulateShot(canonicalSetup("drive", { stroke: { speed: 2, guideEffort } }));
        const none = at(0);
        expect(hits(none.impact)).toHaveLength(1);
        const kinds = none.impact.events.map((e) => e.kind);
        expect(kinds).not.toContain("impact-cap");
        expect(kinds).not.toContain("impact-head-approaching");
        expect(none.impact.duration).toBeLessThan((none.contact.drive as TrackDrive).arc.contactAt + TRACK_IMPACT_CAP);
        expect(hits(at(1).impact).length).toBeGreaterThan(1);
    });

    it("an accelerating bottom hand turns the drive's double hit into a triple and lowers its ratio", () => {
        // Prototype: bottom hand at 0.30 m, grip 1: five hits and ratio 1.24, against two hits and 3.32.
        const canonical = canonicalSetup("drive");
        const strong = canonicalSetup("drive", { stance: { bottom: 0.3, bottomGrip: 1 } });
        const guided = simulateShot(canonical);
        const pushed = simulateShot(strong);
        expect(hits(pushed.impact).length).toBeGreaterThanOrEqual(3);
        expect(ratio(strong, pushed)).toBeLessThan(ratio(canonical, guided));
    });

    it("the stops strike once, and the AC stop's coaching ratio exceeds the drive's", () => {
        // User decision (2026-10-06): the AC stop is told from the drive by its ratio, not by the striker's ball's
        // speed at the impact's end (1.3800 against 1.3919 m/s, taken 21.6 and 181 ms after contact). Pre-flight: one
        // hit each; ratios 6.464 (AC stop) and 3.316 (drive).
        const drive = canonicalSetup("drive");
        const acStop = canonicalSetup("stop-ac");
        for (const type of ["stop-ac", "stop-gc"] as const) {
            expect(hits(simulateShot(canonicalSetup(type)).impact), type).toHaveLength(1);
        }
        expect(ratio(acStop, simulateShot(acStop))).toBeGreaterThan(ratio(drive, simulateShot(drive)));
    });

    it("the GC stop's check brings its head to rest, never back, where a single-ball stroke's follows through", () => {
        // User decision (2026-10-06): a check brakes the head to rest, not past it. The GC stop is a single-ball
        // stroke, its ball leaving at much the same speed as the single-ball stroke's, so the check shows in the head.
        // Pre-flight: the GC stop's head ends the impact at −3.2e-4 m/s along aim, its lowest after the strike (its
        // pitch rate −5.5e-7 rad/s); the single-ball stroke's at 1.3151 m/s. The planned deceleration alone, sized for
        // the unstruck head, left it at −1.0928 m/s, moving back.
        const probe = recorder();
        const setup = canonicalSetup("stop-gc");
        const gcStop = simulateImpact(buildContact(setup, WORLD), setup.balls, WORLD, { probe });
        const strikeEnd = (hits(gcStop)[0] as ContactInterval).end;
        const lowest = Math.min(
            ...probe.snapshots.filter((s) => s.t > strikeEnd).map((s) => dot(s.head.velocity, vec3(0, 1, 0))),
        );
        const plain = simulateShot(canonicalSetup("single-ball", { targetGap: GC_STOP_GAP })).impact;
        expect(Math.abs(headSpeed(gcStop))).toBeLessThan(0.01);
        expect(lowest).toBeGreaterThan(-0.01);
        expect(headSpeed(plain)).toBeGreaterThan(1);
    });

    it("the GC stop's check brakes the head through the hands: positive at drive −1, negative at 0", () => {
        // D9.2, restated as the design's total hand impulse. On the touching setup the prototype gave +1.697 N·s
        // checked and −2.465 N·s coasting; pre-flight, on the target setup with the check to rest, +1.187 N·s and
        // −0.789 N·s.
        expect(braking(canonicalSetup("stop-gc")).hands).toBeGreaterThan(0);
        expect(braking(canonicalSetup("stop-gc", { stroke: { drive: 0 } })).hands).toBeLessThan(0);
    });

    it("the AC stop's relaxed head meets the turf after the ball and the turf brakes it, not too deep", () => {
        // D9.1, on the canonical stop. Prototype (11 mm dip): the first face interval ends at 1.17 ms, the head on
        // the turf 12.70–21.48 ms, 1.73 mm deep (10 mm: 1.32; 12 mm: 2.11 and impact-head-deep), turf +0.376 N·s.
        // Pre-flight, with the check to rest: 12.52–21.38 ms, 1.80 mm (10 mm: 1.40; 12 mm: 2.19 and deep), +0.401 N·s.
        const { impact, turf } = braking(canonicalSetup("stop-ac"));
        const dug = impact.timeline["head/turf"]?.[0] as ContactInterval;
        expect(dug).toBeDefined();
        expect(dug.start).toBeGreaterThanOrEqual((hits(impact)[0] as ContactInterval).end);
        expect(turf).toBeGreaterThan(0);
        expect(impact.events.map((e) => e.kind)).not.toContain("impact-head-deep");
    });

    it("the pass roll's punch leaves the striker's ball faster than a coasting pass roll", () => {
        // Prototype: 1.226 m/s at drive +1, 1.099 m/s at drive 0.
        const punched = simulateShot(canonicalSetup("pass-roll")).impact;
        const coasted = simulateShot(canonicalSetup("pass-roll", { stroke: { drive: 0 } })).impact;
        expect(strikerSpeed(punched)).toBeGreaterThan(strikerSpeed(coasted));
    });

    it("a dip 30 ms early meets the lawn before the ball and sends the striker's ball off slower", () => {
        // Prototype: the impact starts 30 ms before contact; the head on the turf from 20.72 ms, the ball struck from
        // 31.05 ms; the striker's ball at 1.214 m/s against 1.380 on time.
        const onTime = simulateShot(canonicalSetup("stop-ac")).impact;
        const timing = { arc: 0, hands: 0, dip: -0.03 };
        const early = simulateShot(canonicalSetup("stop-ac", { stroke: { timing } })).impact;
        const dug = early.timeline["head/turf"]?.[0] as ContactInterval;
        expect(dug).toBeDefined();
        expect(dug.start).toBeLessThan((hits(early)[0] as ContactInterval).start);
        expect(strikerSpeed(early)).toBeLessThan(strikerSpeed(onTime));
    });
});
```

The Review Focus items owned here: "ends a gentle tap before the cap" (item 1) and "finds a crush when the tracked head
drives the ball into an upright" (item 5). The crush moves hoop 1 so that an upright touches the canonical striker's
ball straight ahead; the world goes to both `canonicalSetup` (which reads only R from it) and `simulateShot`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/engine/shot.test.ts`
Expected: FAIL. The suite does not load (`Tests  no tests`): `Error: Cannot find module '../../src/engine/shot'
imported from …/tests/engine/shot.test.ts`. `npm run check` reports the missing module.

- [ ] **Step 3: Write `src/engine/shot.ts`**

```ts
/**
 * A whole shot (P2b.2b.1 design §6). The swing model builds the contact, the impact integrates it, the fault judge
 * rules on it, and phase 2 rolls the balls out. Phase 2 always runs: impact flags and findings are information, as
 * phase 2's jump flag is. `judgeHoopRun` stays a separate call on the phase 2 result.
 */
import { CONTACT_TOLERANCE } from "./detect";
import { judgeFaults, type FaultReport, type StrokeContext } from "./faults";
import { ballPairKey } from "./impact/contacts";
import { simulateImpact } from "./impact/simulateImpact";
import type { ContactState, ImpactResult } from "./impact/types";
import { sinCos } from "./math/elementary";
import { horizontal, length, normalize, sub, vec3 } from "./math/vec3";
import { simulateFreeMotion } from "./simulate";
import { buildContact, swingApproach, type SwingApproach } from "./swing/buildContact";
import { CROQUET_STROKES, type ShotSetup } from "./swing/types";
import { BALL_IDS, type BallId, type BallState, type ShotResult, type World } from "./types";
import { defaultWorld, validateWorld } from "./world";

/** Everything a shot produced, stage by stage (design §6.1). */
export interface ShotOutcome {
    readonly contact: ContactState;
    /** The coasting path's lowest clearance over the turf in the 60 ms before contact, and when (design §5.2). */
    readonly approach: SwingApproach;
    readonly context: StrokeContext;
    readonly impact: ImpactResult;
    readonly faults: FaultReport;
    readonly motion: ShotResult;
}

function fail(message: string): never {
    throw new RangeError(message);
}

/**
 * Checks a setup before the swing model sees it (design §6.2): the striker present; `live` holding only present balls,
 * never the striker, no duplicates; a croquet stroke's croqueted ball present, not the striker, touching the striker
 * (within CONTACT_TOLERANCE); no croqueted ball in a single-ball stroke.
 */
function validateSetup(setup: ShotSetup, world: World): void {
    const { balls, striker, croqueted } = setup;
    const strikerBall = balls[striker];
    if (!strikerBall) {
        fail(`striker ${striker} is not in the setup`);
    }
    const seen: BallId[] = [];
    for (const id of setup.live) {
        if (!balls[id]) {
            fail(`live ball ${id} is not in the setup`);
        }
        if (id === striker) {
            fail(`the striker ${striker} cannot be live`);
        }
        if (seen.includes(id)) {
            fail(`live ball ${id} is listed twice`);
        }
        seen.push(id);
    }
    const { type } = setup.stroke;
    if (!CROQUET_STROKES.includes(type)) {
        if (croqueted !== undefined) {
            fail(`croqueted is given only for a croquet stroke (got ${type})`);
        }
        return;
    }
    if (croqueted === undefined) {
        fail(`a ${type} stroke needs a croqueted ball`);
    }
    if (croqueted === striker) {
        fail(`the croqueted ball cannot be the striker ${striker}`);
    }
    const other = balls[croqueted];
    if (!other) {
        fail(`croqueted ball ${croqueted} is not in the setup`);
    }
    const gap = length(sub(other.position, strikerBall.position)) - 2 * world.ball.radius;
    if (!(gap <= CONTACT_TOLERANCE)) {
        fail(`croqueted ball ${croqueted} must touch the striker (gap ${gap} m)`);
    }
}

/**
 * The fault judge's context for `setup`, given its impact (design §6.3): the kind of stroke; whether the striker's
 * ball is in a group (Glossary, "Group of balls", over the ball–ball pairs touching at the start); the swing direction;
 * and, for a croquet stroke, the line of centres from the setup's starting positions.
 */
export function strokeContext(setup: ShotSetup, impact: ImpactResult): StrokeContext {
    const { striker, balls } = setup;
    const present = BALL_IDS.filter((id) => balls[id] !== undefined);
    const touching = (a: BallId, b: BallId): boolean => a !== b && impact.touchingAtStart.includes(ballPairKey(a, b));
    const croquet = CROQUET_STROKES.includes(setup.stroke.type);
    // A 3-ball group is one ball touching two others, a 4-ball group a fourth touching a 3-ball group: the striker's
    // ball is in one exactly when the balls it is connected to by touching pairs number three or more.
    const connected: BallId[] = [striker];
    for (let i = 0; i < connected.length; i++) {
        for (const id of present) {
            if (!connected.includes(id) && touching(connected[i] as BallId, id)) {
                connected.push(id);
            }
        }
    }
    const touchingAny = present.some((id) => touching(striker, id));
    const kind = croquet ? "croquet" : setup.continuation && touchingAny ? "continuation-touching" : "single-ball";
    const [s, c] = sinCos(setup.stroke.aim);
    const context: StrokeContext = {
        striker,
        kind,
        live: setup.live,
        hampered: setup.hampered,
        jumpAttempt: setup.jumpAttempt,
        group: connected.length >= 3,
        aim: vec3(c, s, 0),
    };
    if (!croquet) {
        return context;
    }
    const croqueted = setup.croqueted as BallId;
    const from = (balls[striker] as BallState).position;
    const to = (balls[croqueted] as BallState).position;
    return { ...context, croqueted, lineOfCentres: normalize(horizontal(sub(to, from))) };
}

/**
 * Simulates a whole shot (design §6.1): checks the setup, then runs buildContact, swingApproach, simulateImpact,
 * strokeContext, judgeFaults and simulateFreeMotion(impact.handover) in that order. `world` defaults to
 * defaultWorld(setup.lawnSpeed). Throws the named RangeError of whichever stage rejects the input: a lawn speed that
 * is not positive or that the default world cannot use, a setup check (design §6.2), the swing model's checks, or the
 * impact's.
 */
export function simulateShot(setup: ShotSetup, world?: World): ShotOutcome {
    if (!(setup.lawnSpeed > 0) || !Number.isFinite(setup.lawnSpeed)) {
        fail(`lawnSpeed must be a positive finite number (got ${setup.lawnSpeed})`);
    }
    const w = world ?? defaultWorld(setup.lawnSpeed);
    validateWorld(w);
    validateSetup(setup, w);
    const contact = buildContact(setup, w);
    const approach = swingApproach(contact);
    const impact = simulateImpact(contact, setup.balls, w);
    const context = strokeContext(setup, impact);
    const faults = judgeFaults(context, impact);
    const motion = simulateFreeMotion(impact.handover, w);
    return { contact, approach, context, impact, faults, motion };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/engine/shot.test.ts`
Expected: PASS, 38 tests (7 canonical runs, 11 rejections, 20 others), in a few seconds.

The canonical-run, effective-mass and mechanism tests rest on the model's behaviour. If one fails, print the figure its
comment names (hits, impulses, speeds, heights, penetration) and compare it with the prototype's before changing
anything; a changed expectation is the user's decision, and goes back to the spec if it touches §8.1. The AC stop's two
tests rest on the 11 mm dip: the prototype keeps the head under `HEAD_DEEP_LIMIT` only up to about 11.7 mm, and
pre-flight, with the check to rest, up to about 11.5 mm (1.996 mm there).

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Format**

Run: `npx prettier --write src/engine/shot.ts tests/engine/shot.test.ts`
Expected: both files listed, unchanged (the code above is prettier-clean at printWidth 120).

- [ ] **Step 6: Check**

Run each in turn: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`.
Expected: all pass. `env LC_ALL=en_GB.UTF-8 grep -nE "^.{121,}$" src/engine/shot.ts tests/engine/shot.test.ts` prints
nothing.

- [ ] **Step 7: Commit**

Write the message to `msg.txt` in the session's temp directory (the literal value of `$CLAUDE_TEMP_DIR`) with the
Write tool:

```
Add simulateShot: swing, impact, faults and phase 2 in one call

simulateShot checks the setup, builds the contact, reports the swing's approach to the lawn, integrates the impact,
judges its faults and rolls the balls out. strokeContext gives the judge the stroke's kind, group, swing direction and
line of centres. The tests run every preset's canonical setup with no entry jump and no ball above R + 5 mm, measure
the effective mass at the face against its closed form, and assert the drive's follow-through, the stops, the GC
check, the AC stop on the turf, the pass roll's punch and a mistimed dip.
```

```bash
git add src/engine/shot.ts tests/engine/shot.test.ts
git commit -F /tmp/claude-<session-id>/msg.txt
git log -1 "--format=%G? %h"
```

Use the literal temp-directory path (worktree sessions refuse the variable) and disable the sandbox for the commit so
the SSH agent can sign. Expected: `G` and the short hash.

---
### Task 11: Exports and version 0.6.0

Spec §6.5 and exit criterion 5, then the final bit-identity checks of exit criterion 2. The public API gains exactly
the names spec §6.5 lists; `ForceDrive`, `TrackDrive`, `Dip`, `PreparedTrack` and the swing model's helpers stay
internal (a caller reaches `Dip` as `SwingArc["dip"]`).

**Files:**
- Modify: `src/engine/index.ts`, `src/engine/simulate.ts`, `tests/engine/index.test.ts`,
  `tests/engine/impact/simulateImpact.test.ts`

**Interfaces:**
- Consumes: `simulateShot`, `ShotOutcome` (Task 10, `shot.ts`); `judgeFaults`, `StrokeContext`, `FaultReport`,
  `Finding` (`faults.ts`); `simulateImpact` (`impact/simulateImpact.ts`); `ContactState`, `Drive`, `SwingArc`,
  `Coupling`, `Hands`, `StrokeMode`, `ImpactResult`, `ImpactEvent` (`impact/types.ts`, Tasks 1, 3, 5, 6);
  `SwingApproach` (`swing/buildContact.ts`, Task 8); `defaultProfile`, `ON_TIME` (`swing/profile.ts`, Task 8);
  `CROQUET_STROKES`, `ShotSetup`, `StrokeTiming`, `SwingProfile`, `SwingStance`, `SwingDrive`, `StrokeType`
  (`swing/types.ts`, Task 8).
- Produces: the public API of spec §6.5; `ENGINE_VERSION` `"0.6.0"`.

- [ ] **Step 1: Write the failing tests**

In `tests/engine/impact/simulateImpact.test.ts`, the version test becomes:

```ts
    it("is version 0.6.0", () => {
        expect(ENGINE_VERSION).toBe("0.6.0");
    });
```

In `tests/engine/index.test.ts`, add after the `engine` import:

```ts
/**
 * Every type spec §6.5 adds to the public API (P2b.2b.1). Naming them here makes `npm run check` fail if one is not
 * exported; Vitest does not type-check.
 */
type Exported = [
    engine.ShotSetup,
    engine.StrokeTiming,
    engine.SwingProfile,
    engine.SwingStance,
    engine.SwingDrive,
    engine.StrokeType,
    engine.StrokeMode,
    engine.ShotOutcome,
    engine.SwingApproach,
    engine.ContactState,
    engine.Drive,
    engine.SwingArc,
    engine.Coupling,
    engine.Hands,
    engine.ImpactResult,
    engine.ImpactEvent,
    engine.StrokeContext,
    engine.FaultReport,
    engine.Finding,
];
```

and append to the `describe`:

```ts
    it("exposes the whole shot, the impact and the fault judge (P2b.2b.1)", () => {
        expect(typeof engine.simulateShot).toBe("function");
        expect(typeof engine.simulateImpact).toBe("function");
        expect(typeof engine.judgeFaults).toBe("function");
        expect(engine.CROQUET_STROKES).toEqual(["drive", "stop-ac", "half-roll", "full-roll", "pass-roll"]);
        expect(engine.ON_TIME).toEqual({ arc: 0, hands: 0, dip: 0 });
        expect(engine.defaultProfile.mallet.headMass).toBeGreaterThan(0);
        expect(engine.ENGINE_VERSION).toBe("0.6.0");
        const types: Exported | null = null;
        expect(types).toBeNull();
    });

    it("simulates a whole single-ball shot on the default world", () => {
        const world = engine.defaultWorld();
        const still = engine.vec3(0, 0, 0);
        const blue = { position: engine.vec3(9.6012, 4, world.ball.radius), velocity: still, angularVelocity: still };
        const setup: engine.ShotSetup = {
            balls: { blue },
            striker: "blue",
            stroke: {
                type: "single-ball",
                aim: Math.PI / 2,
                speed: 2,
                drive: 0,
                contact: { up: 0, side: 0 },
                timing: engine.ON_TIME,
            },
            live: [],
            continuation: false,
            hampered: false,
            jumpAttempt: false,
            lawnSpeed: 12,
            profile: engine.defaultProfile,
        };
        const outcome = engine.simulateShot(setup);
        expect(outcome.motion.aborted).toBe(false);
        expect(outcome.motion.rest.blue?.y).toBeGreaterThan(4);
    });
```

The striker stands at the canonical setups' spot (spec §5.5), a lane clear of the hoops and the peg, and is struck
along +y. The `types` line only gives `Exported` a reader, so ESLint's unused-variable rule accepts the alias.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/engine/index.test.ts tests/engine/impact/simulateImpact.test.ts`
Expected: FAIL, 3 tests: `expected '0.5.0' to be '0.6.0'` (the version test), and
`expected 'undefined' to be 'function'` and `TypeError: simulateShot is not a function` (the two new API tests).
`npm run check` reports every name of `Exported` and every new value as missing from the module.

- [ ] **Step 3: Export and bump**

In `src/engine/simulate.ts`, set `export const ENGINE_VERSION = "0.6.0";`. In `src/engine/index.ts`, keep the header
comment and replace the exports with:

```ts
export { judgeFaults, type FaultReport, type Finding, type StrokeContext } from "./faults";
export { judgeHoopRun, type HoopRunVerdict, type HoopTarget } from "./hoopRun";
export { simulateImpact } from "./impact/simulateImpact";
export type {
    ContactState,
    Coupling,
    Drive,
    Hands,
    ImpactEvent,
    ImpactResult,
    StrokeMode,
    SwingArc,
} from "./impact/types";
export { vec3, type Vec3 } from "./math/vec3";
export { stateAtTime } from "./sample";
export { simulateShot, type ShotOutcome } from "./shot";
export { ENGINE_VERSION, simulateFreeMotion } from "./simulate";
export type { SwingApproach } from "./swing/buildContact";
export { ON_TIME, defaultProfile } from "./swing/profile";
export {
    CROQUET_STROKES,
    type ShotSetup,
    type StrokeTiming,
    type StrokeType,
    type SwingDrive,
    type SwingProfile,
    type SwingStance,
} from "./swing/types";
export {
    BALL_IDS,
    type BallId,
    type BallParams,
    type BallState,
    type BallStates,
    type ContactMaterial,
    type Cylinder,
    type Hoop,
    type Lawn,
    type MotionParams,
    type MotionPhase,
    type OffsetRule,
    type PushMotion,
    type Segment,
    type ShotEvent,
    type ShotResult,
    type SurfaceProps,
    type World,
} from "./types";
export { STANDARD_GRAVITY, defaultWorld } from "./world";
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/engine/index.test.ts tests/engine/impact/simulateImpact.test.ts`
Expected: PASS.

- [ ] **Step 5: Format, check, and the final bit-identity checks**

Run: `npx prettier --write src/engine/index.ts src/engine/simulate.ts tests/engine/index.test.ts`
Run: `npx prettier --write tests/engine/impact/simulateImpact.test.ts`

Run: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`
Expected: all pass.

Run: `env OBSTACLE_STROKES=2000 npx --yes tsx scripts/impactDigest.ts > "<temp>/digest-11.txt"`
Run: `cmp "<temp>/digest-base.txt" "<temp>/digest-11.txt"`
Expected: no output (identical).

Run: `npx --yes tsx scripts/shotMix.ts`
Expected: the `work units per shot` row reads `p99 143084.000, p99.9 362050.000, max 408030.000` exactly, as Task 1
Step 1 recorded.

Run: `env SLOW_TESTS=1 npm test`
Expected: all pass, the 2,000-stroke obstacle fuzz and the WAKE_MARGIN reach filter's tests included.

- [ ] **Step 6: Commit**

Write the message to `$CLAUDE_TEMP_DIR/msg.txt` (with the Write tool, at the directory's literal path):

```text
Export simulateShot, simulateImpact and judgeFaults; engine 0.6.0

The public API gains the whole shot, the impact and the fault judge, the
default profile, ON_TIME and CROQUET_STROKES, and the swing, impact and
fault types of design §6.5, StrokeMode and Hands among them. Force tables
are bit-identical to P2b.2a: the impact digest matches the baseline, the
shot mix's work units are unchanged and the slow tests pass.
```

```bash
git add src/engine/index.ts src/engine/simulate.ts tests/engine/index.test.ts
git add tests/engine/impact/simulateImpact.test.ts
git commit -F <literal value of $CLAUDE_TEMP_DIR>/msg.txt
git log -1 "--format=%G? %h"
```

Run the commit with the sandbox disabled (signing needs the SSH agent) and with the temp directory's literal path.
Expected: `G` and the new commit's hash.
### Task 12: The swing probe and the roadmap outcomes

Spec §9, §11 and exit criterion 4's record. Pre-flight runs every section, keeps the full output with its evidence and
folds the figures into this plan and the roadmap (see "Pre-flight"). The real run re-runs the probe, which is
deterministic apart from its timings: every line but the µs/step figures must match pre-flight's record. The outcomes
are then recorded.

The probe folds the first pre-flight's Task 11 defects:

- no template literal runs past 120 columns (D11.1);
- the roadmap template asks only for figures the probe prints, never for a decision (D11.2, D11.3);
- the coupling comparison runs at `HAND_COUPLING`'s own period (D11.4);
- the path lag is measured at the hands' window's end, `handStart + handWindow` (D11.5);
- every impact length is measured after `contactAt` (D11.6);
- a stroke that never strikes the ball reads "missed", not "lawn first" (D11.7);
- the false limit "an AC stop resting on the turf runs to the cap" is gone (D11.8);
- the hands' share in the strike states its denominator: every ball's momentum change, so a croquet stroke's transfer
  to the croqueted ball counts (D11.9).

**Files:**
- Create: `scripts/swingProbe.ts`
- Modify: `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`

**Interfaces:**
- Consumes:
  - `buildContact`, `swingApproach`, `MAX_LEAD` (Task 8, `swing/buildContact.ts`); `defaultProfile`, `ON_TIME`
    (Task 8, `swing/profile.ts`); `CROQUET_STROKES`, `STROKE_TYPES`, `ShotSetup`, `StrokeType` (Task 8,
    `swing/types.ts`);
  - `canonicalSetup` and `GC_STOP_GAP` (Task 8, `tests/engine/support/shot.ts`), called with the stroke type alone
    or with `{ targetGap }` (the GC sweep);
  - `HAND_COUPLING`, `FREE_SPAN`, `prepareTrack`, `pathAt`, `headOnPath`, `inCheck`, `swungBody`, `effectiveMass`,
    `PreparedTrack` (Tasks 3 and 4, `impact/track.ts`);
  - `ballPairKey` (on `main`) and `headBallContact` (Task 7) (`impact/contacts.ts`);
  - `IMPACT_DT`, `TRACK_IMPACT_CAP`, `HEAD_DEEP_LIMIT`, `integrate`, `ImpactSnapshot` with `hand?` (Task 4) and
    `headTurf` (Task 6, spec §3.7) (`impact/integrate.ts`);
  - `ImpactRun.entryJumps`, `headRegions` (Task 7), `release` (Task 4), `headTurfSlide` (Task 6);
  - `prepareImpact`, `simulateImpact`, `simulateFreeMotion`, `stateAtTime` (`sample.ts`, on `main`);
  - `recorder`, `socketAt`, `strike`, `drive` (`tests/engine/support/impact.ts`).
- Produces: `scripts/swingProbe.ts` (a script, no exports); the roadmap's P2b.2b.1 sections.

- [ ] **Step 1: Write the probe**

Create `scripts/swingProbe.ts`:

```ts
/**
 * Swing probe (P2b.2b.1 design §9: pre-flight measurements, recorded in the roadmap, not gated). On the default world
 * with the default profile's canonical setups (design §5.5, tests/engine/support/shot.ts), reports:
 * - ratios: the croqueted ÷ striker distance on each croquet stroke's canonical setup against its coaching range, and
 *   over 2–4 m/s; and the drive at guideEffort 0 and 1 over 2–4 m/s: its ratio, hits and length;
 * - gc: the GC stop, a single-ball stroke (design §5.4): after the striker's first touch on the target, how far the
 *   striker's ball and the target travel and their ratio, on its canonical setup over 2–4 m/s; then the gap from 0.05
 *   to 1 m for the stop-gc and single-ball presets alike, with the late re-hit's crossing at each;
 * - canonical: per canonical setup, the entry jumps, the highest ball centre above R, the head regions touched, the
 *   bottom hand's release, the hands' and the turf's braking impulses (design §3.7), the impact's length after
 *   contactAt and how often each impact flag fired;
 * - presets: each preset over speed × drive × contact: how often impact-head-deep, impact-cap,
 *   impact-head-approaching and impact-off-face fire, and the longest impact after contactAt that ended before the cap;
 * - dip: the AC stop's dip depth from 8 to 14 mm: the head–turf penetration against HEAD_DEEP_LIMIT, and whether the
 *   first head–turf interval starts after the first face–striker interval ends;
 * - coupling: the canonical set at T = 0.04 s against HAND_COUPLING's period (0.08 s), both at its ζ, with the hands'
 *   impulse in the strike against every ball's momentum change and the path lag at the hands' window's end;
 * - mass: the swung body's effective mass at the face centre along aim (design §3.4) against the strike's measure;
 * - tracking: the head's largest distance from the path with no ball and no turf, per phase: firm before contact,
 *   carry up to the reach's end, inside a check, and swing mode after contact outside a check (the residual);
 * - cost: µs/step of the tracked canonical impacts against P2b.2a's force-table strokes, and the WAKE_MARGIN reach
 *   filter's headroom over a 0.51 s impact;
 * - timings: for the AC stop and the full roll, each action from 50 ms early to 20 ms late, and the AC stop's dip from
 *   none to twice its depth: lawn or ball first, the dig, the slide, the striker's ball's launch, and after phase 2
 *   both balls' distances and the coaching ratio;
 * - rehit: the late re-hit (design §3.5, §9), a measurement only: the real head at the impact's end, moved on by the
 *   planned path's displacement and rotation out to FREE_SPAN, against every ball's phase-2 trajectory and, head and
 *   shaft, against the hoops' uprights and crowns and the peg; per preset, the canonical setup's first crossings, how
 *   many runs of the preset sweep cross a ball or an obstacle and how many overlap one at the impact's end, and each
 *   such run; then a single-ball stroke through a hoop, centred and with the face 10 mm off the ball's centre.
 * Run with `npx --yes tsx scripts/swingProbe.ts`; environment: SECTION (one of the names above; default all), REPEAT
 * (timed runs per stroke, default 50). Not part of the test suite; its output goes into the roadmap's outcomes.
 */
import {
    HEAD_DEEP_LIMIT,
    IMPACT_DT,
    TRACK_IMPACT_CAP,
    integrate,
    type ImpactSnapshot,
} from "../src/engine/impact/integrate";
import { ballPairKey, headBallContact } from "../src/engine/impact/contacts";
import { multiply, rotate, solidCylinderInertia, type Quaternion } from "../src/engine/impact/rigidBody";
import { prepareImpact, simulateImpact } from "../src/engine/impact/simulateImpact";
import {
    FREE_SPAN,
    HAND_COUPLING,
    effectiveMass,
    headOnPath,
    inCheck,
    pathAt,
    prepareTrack,
    swungBody,
    type PreparedTrack,
} from "../src/engine/impact/track";
import type {
    ContactState,
    Coupling,
    FaceMaterial,
    HeadState,
    ImpactResult,
    MalletHead,
    TrackDrive,
} from "../src/engine/impact/types";
import { ZERO, add, cross, dot, horizontal, length, scale, sub, vec3, type Vec3 } from "../src/engine/math/vec3";
import { stateAtTime } from "../src/engine/sample";
import { simulateFreeMotion } from "../src/engine/simulate";
import { MAX_LEAD, buildContact, swingApproach } from "../src/engine/swing/buildContact";
import { ON_TIME, defaultProfile } from "../src/engine/swing/profile";
import { CROQUET_STROKES, STROKE_TYPES, type ShotSetup, type StrokeType } from "../src/engine/swing/types";
import { BALL_IDS, type BallId, type BallState, type BallStates, type ShotResult } from "../src/engine/types";
import { defaultWorld, uprightsOf } from "../src/engine/world";
import { contactReference, malletReference } from "../src/reference/index";
import { drive, recorder, socketAt, strike } from "../tests/engine/support/impact";
import { GC_STOP_GAP, canonicalSetup } from "../tests/engine/support/shot";

// The project has no Node types; this script runs under tsx and reads only its environment.
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

const SECTION = process.env.SECTION ?? "all";
const REPEAT = Number(process.env.REPEAT ?? "50");
const WORLD = defaultWorld();
const R = WORLD.ball.radius;
const fmt = (x: number, digits = 4): string => x.toFixed(digits);
const ms = (t: number): string => fmt(t * 1e3, 1);
const mm = (x: number): string => fmt(x * 1e3, 2);

/** integrate.ts's WAKE_MARGIN (not exported): the slack (m) the reach filter takes off a ball–obstacle gap. */
const WAKE_MARGIN = 1e-9;

/** The coaching ranges of design §9 (croqueted ÷ striker distance); none for the single-ball strokes. */
const COACHING: Readonly<Record<StrokeType, string>> = {
    "single-ball": "none",
    drive: "3–4",
    "stop-ac": "6–10",
    "stop-gc": "none",
    "half-roll": "about 2",
    "full-roll": "about 1",
    "pass-roll": "below 1",
};

/** The impact flags design §9 counts. */
const FLAGS = ["impact-head-deep", "impact-cap", "impact-head-approaching", "impact-off-face"] as const;

/** One shot: its contact state, its impact with every snapshot, and phase 2. */
interface Run {
    readonly setup: ShotSetup;
    readonly contact: ContactState;
    readonly impact: ImpactResult;
    readonly steps: readonly ImpactSnapshot[];
    readonly motion: ShotResult;
}

/** The tracked drive of a contact state built by `buildContact`. */
const trackOf = (contact: ContactState): TrackDrive => contact.drive as TrackDrive;

/** `setup` simulated, with its coupling's fields replaced by `coupling` where given. */
function run(setup: ShotSetup, coupling: Partial<Coupling> = {}): Run {
    const built = buildContact(setup, WORLD);
    const track = trackOf(built);
    const contact = { ...built, drive: { ...track, coupling: { ...track.coupling, ...coupling } } };
    const probe = recorder();
    const impact = simulateImpact(contact, setup.balls, WORLD, { probe });
    return { setup, contact, impact, steps: probe.snapshots, motion: simulateFreeMotion(impact.handover, WORLD) };
}

/** `setup` simulated without recording the impact's snapshots (`steps` empty), for the sweeps. */
function quick(setup: ShotSetup): Run {
    const contact = buildContact(setup, WORLD);
    const impact = simulateImpact(contact, setup.balls, WORLD);
    return { setup, contact, impact, steps: [], motion: simulateFreeMotion(impact.handover, WORLD) };
}

/** `type`'s canonical setup with `stroke` fields replaced. */
function canonical(type: StrokeType, stroke: Partial<ShotSetup["stroke"]> = {}): ShotSetup {
    const base = canonicalSetup(type);
    return { ...base, stroke: { ...base.stroke, ...stroke } };
}

/** The ids of `balls` in BALL_IDS order: the order of the impact's snapshots. */
const idsOf = (balls: BallStates): BallId[] => BALL_IDS.filter((id) => balls[id] !== undefined);

/** How far ball `id` travels from its start to rest after phase 2 (m). */
const travelled = (r: Run, id: BallId): number =>
    length(sub(r.motion.rest[id] as Vec3, (r.setup.balls[id] as BallState).position));

/** Croqueted ÷ striker distance from the start to rest after phase 2; NaN for a single-ball stroke. */
function ratio(r: Run): number {
    const croqueted = r.setup.croqueted;
    if (croqueted === undefined) {
        return NaN;
    }
    return travelled(r, croqueted) / travelled(r, r.setup.striker);
}

/**
 * A single-ball stroke's outcome against its target (design §5.4, §9): from the striker's first touch on `target` to
 * rest, how far the striker's ball travels, how far the target travels from its start, and their ratio (target over
 * striker). The touch is the first striker–target interval of the impact (the state at its start, from the recorded
 * steps), else phase 2's first ball–ball event between them. Null if the striker never touches the target.
 */
function afterTouch(
    r: Run,
    target: BallId = "red",
): { readonly inImpact: boolean; readonly t: number; readonly striker: number; readonly target: number } | null {
    const { striker } = r.setup;
    if (r.setup.balls[target] === undefined) {
        return null;
    }
    const rest = (id: BallId): Vec3 => r.motion.rest[id] as Vec3;
    const start = (id: BallId): Vec3 => (r.setup.balls[id] as BallState).position;
    const along = (from: Vec3, to: Vec3): number => length(horizontal(sub(to, from)));
    const interval = r.impact.timeline[ballPairKey(striker, target)]?.[0];
    let at: Vec3;
    let t: number;
    if (interval !== undefined) {
        // Snapshot i holds the state at the end of step i, t = (i + 1)·IMPACT_DT; a touch from t = 0 is the start's.
        const index = Math.round(interval.start / IMPACT_DT) - 1;
        const s = r.steps[index];
        at = s === undefined ? start(striker) : (s.balls[idsOf(r.setup.balls).indexOf(striker)] as BallState).position;
        t = interval.start;
    } else {
        const touch = r.motion.events.find(
            (e) => e.kind === "ball-ball" && e.balls.includes(striker) && e.balls.includes(target),
        );
        if (touch === undefined) {
            return null;
        }
        at = stateAtTime(r.motion, striker, touch.t).position;
        t = r.impact.duration + touch.t;
    }
    return {
        inImpact: interval !== undefined,
        t: t - trackOf(r.contact).arc.contactAt,
        striker: along(at, rest(striker)),
        target: along(start(target), rest(target)),
    };
}

/** `afterTouch` on red as text: where and when the touch came, both distances and their ratio. */
function touchText(r: Run): string {
    if (r.setup.balls.red === undefined) {
        return "no target";
    }
    const a = afterTouch(r);
    if (a === null) {
        return "no touch";
    }
    return (
        `touch ${a.inImpact ? "in the impact" : "in phase 2"} ${ms(a.t)} ms after contactAt; after it the striker ` +
        `${fmt(a.striker, 3)} m, the target ${fmt(a.target, 3)} m, ratio ${fmt(a.target / a.striker, 2)}`
    );
}

/** The follow-through sweep's sample interval (s): a ball at 4 m/s moves 0.4 mm between samples. */
const SWEEP_STEP = 1e-4;

/** The conjugate of unit quaternion `q`: its inverse rotation. */
const conjugate = (q: Quaternion): Quaternion => ({ w: q.w, x: -q.x, y: -q.y, z: -q.z });

/** How deep the head at `state` overlaps a sphere of `radius` centred at `centre` (m); 0 if apart. */
function overlap(state: HeadState, head: MalletHead, centre: Vec3, radius = R): number {
    try {
        return headBallContact(state, head, centre, radius)?.depth ?? 0;
    } catch (error) {
        // A centre on the head's axis, inside the barrel: deep in the head.
        if (!(error instanceof RangeError)) {
            throw error;
        }
        return radius;
    }
}

/** A fixed obstacle the mallet can meet: a rod of `radius` along its axis from `a` to `b`. */
interface Rod {
    readonly id: string;
    readonly a: Vec3;
    readonly b: Vec3;
    readonly radius: number;
}

/**
 * The height (m) up to which the peg is swept: the world's peg is a vertical cylinder with no top, and the mallet's
 * swing stays well below 1 m.
 */
const PEG_TOP = 1;

/**
 * The world's hoops and peg as rods: each upright from the lawn to the crown's axis, the crown (taken to have the
 * uprights' diameter, as reference/court.json does) between the uprights' axes at crownClearance plus its radius, and
 * the peg up to PEG_TOP.
 */
const RODS: readonly Rod[] = [
    ...WORLD.hoops.flatMap((hoop) => {
        const top = hoop.crownClearance + hoop.uprightRadius;
        const [a, b] = uprightsOf(hoop, WORLD.ballUpright).map((u) => vec3(u.centre.x, u.centre.y, 0)) as [Vec3, Vec3];
        const up = vec3(0, 0, top);
        return [
            { id: `${hoop.id}/a`, a, b: add(a, up), radius: hoop.uprightRadius },
            { id: `${hoop.id}/b`, a: b, b: add(b, up), radius: hoop.uprightRadius },
            { id: `${hoop.id}/crown`, a: add(a, up), b: add(b, up), radius: hoop.uprightRadius },
        ];
    }),
    {
        id: "peg",
        a: vec3(WORLD.peg.centre.x, WORLD.peg.centre.y, 0),
        b: vec3(WORLD.peg.centre.x, WORLD.peg.centre.y, PEG_TOP),
        radius: WORLD.peg.radius,
    },
];

/** The spacing (m) of the spheres that stand in for a rod against the head's cylinder. */
const ROD_STEP = 0.002;

/** The closest point to `p` on the segment from `a` to `b`. */
function closestOnSegment(p: Vec3, a: Vec3, b: Vec3): Vec3 {
    const ab = sub(b, a);
    const s = Math.min(1, Math.max(0, dot(sub(p, a), ab) / dot(ab, ab)));
    return add(a, scale(ab, s));
}

/** The closest distance between the segments p1–q1 and p2–q2 (Ericson, Real-Time Collision Detection, §5.1.9). */
function segmentDistance(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): number {
    const d1 = sub(q1, p1);
    const d2 = sub(q2, p2);
    const r = sub(p1, p2);
    const a = dot(d1, d1);
    const e = dot(d2, d2);
    const f = dot(d2, r);
    const c = dot(d1, r);
    const b = dot(d1, d2);
    const denom = a * e - b * b;
    let s = denom > 0 ? Math.min(1, Math.max(0, (b * f - c * e) / denom)) : 0;
    let t = (b * s + f) / e;
    if (t < 0) {
        t = 0;
        s = Math.min(1, Math.max(0, -c / a));
    } else if (t > 1) {
        t = 1;
        s = Math.min(1, Math.max(0, (b - c) / a));
    }
    return length(sub(add(p1, scale(d1, s)), add(p2, scale(d2, t))));
}

/**
 * How deep the head at `state` overlaps `rod` (m); 0 if apart: the deepest of spheres of the rod's radius every
 * ROD_STEP along its axis, each against the head's cylinder (`headBallContact`).
 */
function rodOverlap(state: HeadState, head: MalletHead, rod: Rod): number {
    const reach = Math.hypot(head.length / 2, head.radius) + rod.radius;
    if (length(sub(closestOnSegment(state.position, rod.a, rod.b), state.position)) >= reach) {
        return 0;
    }
    const n = Math.ceil(length(sub(rod.b, rod.a)) / ROD_STEP);
    let deepest = 0;
    for (let k = 0; k <= n; k++) {
        const centre = add(rod.a, scale(sub(rod.b, rod.a), k / n));
        deepest = Math.max(deepest, overlap(state, head, centre, rod.radius));
    }
    return deepest;
}

/**
 * How far the shaft's axis, from the socket to the top hand (`radius` along the head's up axis), lies inside `rod`
 * (m); 0 if apart. The reference data gives the shaft no diameter, so its axis is taken against the rod's radius.
 */
function shaftOverlap(state: HeadState, head: MalletHead, radius: number, rod: Rod): number {
    const socket = add(state.position, rotate(state.orientation, head.socket));
    const top = add(socket, scale(rotate(state.orientation, vec3(0, 0, 1)), radius));
    return Math.max(0, rod.radius - segmentDistance(socket, top, rod.a, rod.b));
}

/** One crossing: when (after contactAt), what met what, and how deep at the first overlapping sample. */
interface Meeting {
    readonly t: number;
    readonly what: string;
    readonly depth: number;
}

/**
 * The late re-hit's measure of one run: the balls and obstacles the mallet overlaps at the impact's end; the first
 * ball crossing, with the head's and the ball's speeds; and the first obstacle crossing.
 */
interface Crossing {
    readonly atEnd: readonly string[];
    readonly first: (Meeting & { readonly headSpeed: number; readonly ballSpeed: number }) | null;
    readonly obstacle: Meeting | null;
}

/**
 * The late re-hit (design §3.5, §9), a measurement only: the real head at the impact's end, moved from there by the
 * planned path's displacement and rotation since then (the rigid motion taking `headOnPath` at the end to
 * `headOnPath` at t), swept out to FREE_SPAN against every ball's phase-2 trajectory and, with the shaft rigid on it,
 * against the hoops' uprights and crowns and the peg (RODS). The planned path is the unstruck one, whose velocity the
 * end rule's look-ahead gives the real head. Reports what the head or the shaft already overlaps at the impact's end,
 * the first ball crossing (the first sample at which the head overlaps a ball it did not overlap at the sample
 * before: its time after contactAt, the ball, the depth, and the head's and the ball's speeds) and the first obstacle
 * crossing likewise (the head or the shaft entering a rod).
 */
function crossing(r: Run): Crossing {
    const tracked = trackOf(r.contact);
    const track = prepareTrack(tracked, r.contact.head, WORLD.gravity);
    const mallet = r.contact.head;
    const ids = idsOf(r.setup.balls);
    const end = r.impact.duration;
    const real = r.impact.head;
    const planned = headOnPath(track, mallet, end);
    const offset = sub(real.position, planned.position);
    const unplanned = conjugate(planned.orientation);
    // Each sample's overlaps, keyed "ball", "head rod" or "shaft rod", and their depths.
    const touching = (head: HeadState, t: number): Map<string, number> => {
        const found = new Map<string, number>();
        for (const id of ids) {
            const depth = overlap(head, mallet, stateAtTime(r.motion, id, t - end).position);
            if (depth > 0) {
                found.set(id, depth);
            }
        }
        for (const rod of RODS) {
            const inHead = rodOverlap(head, mallet, rod);
            if (inHead > 0) {
                found.set(`head ${rod.id}`, inHead);
            }
            const inShaft = shaftOverlap(head, mallet, tracked.arc.radius, rod);
            if (inShaft > 0) {
                found.set(`shaft ${rod.id}`, inShaft);
            }
        }
        return found;
    };
    let inside = touching(real, end);
    const atEnd = [...inside.keys()];
    let first: Crossing["first"] = null;
    let obstacle: Meeting | null = null;
    const samples = Math.floor((FREE_SPAN - end) / SWEEP_STEP);
    for (let i = 1; i <= samples && (first === null || obstacle === null); i++) {
        const t = end + i * SWEEP_STEP;
        const path = headOnPath(track, mallet, t);
        const turn = multiply(path.orientation, unplanned);
        const arm = rotate(turn, offset);
        const head: HeadState = {
            position: add(path.position, arm),
            orientation: multiply(turn, real.orientation),
            velocity: add(path.velocity, cross(path.angularVelocity, arm)),
            angularVelocity: path.angularVelocity,
        };
        const now = touching(head, t);
        for (const [what, depth] of now) {
            if (inside.has(what)) {
                continue;
            }
            const after = t - tracked.arc.contactAt;
            if (what.includes(" ")) {
                obstacle ??= { t: after, what, depth };
            } else if (first === null) {
                const ball = stateAtTime(r.motion, what as BallId, t - end);
                first = {
                    t: after,
                    what,
                    depth,
                    headSpeed: length(head.velocity),
                    ballSpeed: length(ball.velocity),
                };
            }
        }
        inside = now;
    }
    return { atEnd, first, obstacle };
}

/** `crossing` as text. */
function crossingText(r: Run, c: Crossing = crossing(r)): string {
    const { atEnd, first, obstacle } = c;
    const end = atEnd.length > 0 ? `overlaps ${atEnd.join(", ")} at the impact's end; ` : "";
    const balls =
        first === null
            ? "no crossing"
            : `crosses ${first.what} ${ms(first.t)} ms after contactAt, ${fmt(first.depth * 1e3, 3)} mm deep, ` +
              `head ${fmt(first.headSpeed, 3)} m/s, ball ${fmt(first.ballSpeed, 3)} m/s`;
    const rods =
        obstacle === null
            ? "no obstacle"
            : `${obstacle.what} ${ms(obstacle.t)} ms after contactAt, ${fmt(obstacle.depth * 1e3, 3)} mm deep`;
    return `${end}${balls}; ${rods}`;
}

/** The impact's events of each kind in FLAGS, counted. */
function flagCounts(impact: ImpactResult): string {
    return FLAGS.map((kind) => `${kind} ${impact.events.filter((e) => e.kind === kind).length}`).join(", ");
}

/** The first face–striker interval's steps: the index of its first and last snapshot, or null if never struck. */
function firstStrike(r: Run): { readonly first: number; readonly last: number } | null {
    const key = `face/${r.setup.striker}`;
    const inFace = (s: ImpactSnapshot): boolean => s.contacts.some((c) => c.key === key);
    const first = r.steps.findIndex(inFace);
    if (first < 0) {
        return null;
    }
    let last = first;
    while (last + 1 < r.steps.length && inFace(r.steps[last + 1] as ImpactSnapshot)) {
        last++;
    }
    return { first, last };
}

/** The head and ball velocities just before snapshot `index`: the previous snapshot's, or the start's. */
function before(r: Run, index: number): { readonly head: HeadState; readonly balls: readonly Vec3[] } {
    if (index > 0) {
        const s = r.steps[index - 1] as ImpactSnapshot;
        return { head: s.head, balls: s.balls.map((b) => b.velocity) };
    }
    return { head: r.contact, balls: idsOf(r.setup.balls).map((id) => (r.setup.balls[id] as BallState).velocity) };
}

/** The highest ball centre above R (m): over the impact's steps and each phase-2 segment's analytic apex. */
function highest(r: Run): number {
    let top = -Infinity;
    for (const s of r.steps) {
        for (const b of s.balls) {
            top = Math.max(top, b.position.z);
        }
    }
    for (const segments of Object.values(r.motion.segments)) {
        for (const segment of segments ?? []) {
            const { position, velocity } = segment.start;
            const rise = velocity.z > 0 ? (velocity.z * velocity.z) / (2 * WORLD.gravity) : 0;
            top = Math.max(top, position.z + rise);
        }
    }
    return top - R;
}

/**
 * The hands' and the turf's braking impulses (design §3.7, N·s): from the end of the first face–striker interval to
 * the end of the impact, along aim, positive when they slow the head. NaN when the striker was never struck.
 */
function braking(r: Run): { readonly hands: number; readonly turf: number } {
    const interval = r.impact.timeline[`face/${r.setup.striker}`]?.[0];
    if (interval === undefined) {
        return { hands: NaN, turf: NaN };
    }
    const aim = trackOf(r.contact).arc.aim;
    let hands = 0;
    let turf = 0;
    for (const s of r.steps) {
        if (s.t > interval.end) {
            hands -= dot(s.hand?.force ?? ZERO, aim) * IMPACT_DT;
            turf -= dot(s.headTurf ?? ZERO, aim) * IMPACT_DT;
        }
    }
    return { hands, turf };
}

function ratios(): void {
    console.log(
        "== Coaching ratios (design §9): croqueted ÷ striker distance, the croquet strokes' canonical setups and " +
            "2–4 m/s ==",
    );
    for (const type of CROQUET_STROKES) {
        const speeds = [2, 2.5, 3, 3.5, 4].map((speed) => fmt(ratio(run(canonical(type, { speed }))), 2));
        console.log(
            `${type.padEnd(11)} 3 m/s ${speeds[2]} (coaching ${COACHING[type]}); ` +
                `2, 2.5, 3, 3.5, 4 m/s: ${speeds.join(", ")}`,
        );
    }
    // The player's push after contact (design §3.3): none against a full restoration of the arc's speed.
    for (const guideEffort of [0, 1]) {
        const cells = [2, 3, 4].map((speed) => {
            const r = run(canonical("drive", { speed, guideEffort }));
            const hits = r.impact.timeline[`face/${r.setup.striker}`]?.length ?? 0;
            const after = r.impact.duration - trackOf(r.contact).arc.contactAt;
            return `${speed} m/s ${fmt(ratio(r), 2)}, ${hits} hits, ${ms(after)} ms after contactAt`;
        });
        console.log(`drive, guideEffort ${guideEffort}: ${cells.join("; ")}`);
    }
}

function canonicalRuns(): void {
    console.log("== Canonical setups (design §5.5, §9; exit criterion 4) ==");
    for (const type of STROKE_TYPES) {
        const r = run(canonicalSetup(type));
        const { impact } = r;
        const arc = trackOf(r.contact).arc;
        const jumps = impact.entryJumps ?? { count: NaN, worst: 0, keys: [] };
        const regions = Object.keys(impact.headRegions ?? {}).map((key) => key.split("#")[1]);
        const release = impact.release;
        const { hands, turf } = braking(r);
        console.log(
            `${type.padEnd(11)} entry jumps ${jumps.count} (worst ${mm(jumps.worst)} mm` +
                `${jumps.keys.length > 0 ? `: ${jumps.keys.slice(0, 3).join(" ")}` : ""}); ` +
                `highest ball centre ${mm(highest(r))} mm above R; regions ${regions.join(", ")}`,
        );
        console.log(
            `${"".padEnd(11)} release ${release ? `${ms(release.t - arc.contactAt)} ms after contactAt, ` : "none"}` +
                `${release ? `Δθ ${fmt((release.deltaTheta * 180) / Math.PI, 2)}°` : ""}; ` +
                `braking hands ${fmt(hands, 3)} N·s, turf ${fmt(turf, 3)} N·s; ` +
                `${ms(impact.duration - arc.contactAt)} ms after contactAt; ${flagCounts(impact)}`,
        );
    }
}

function presets(): void {
    console.log("== Preset sweep: speed × drive × contact for each preset ==");
    for (const type of STROKE_TYPES) {
        const base = canonicalSetup(type);
        const up0 = base.stroke.contact.up;
        let runs = 0;
        let rejected = 0;
        let longest = 0;
        const counts = new Map<string, number>(FLAGS.map((kind) => [kind, 0]));
        for (const speed of [1, 2, 3, 4, 6]) {
            for (const strokeDrive of [-1, -0.5, 0, 0.5, 1]) {
                for (const up of [up0 - 0.003, up0, up0 + 0.003]) {
                    for (const side of [-0.01, 0, 0.01]) {
                        const setup = canonical(type, { speed, drive: strokeDrive, contact: { up, side } });
                        let contact: ContactState;
                        try {
                            contact = buildContact(setup, WORLD);
                        } catch (error) {
                            if (error instanceof RangeError) {
                                rejected++;
                                continue;
                            }
                            throw error;
                        }
                        const impact = simulateImpact(contact, setup.balls, WORLD);
                        runs++;
                        const kinds = impact.events.map((e) => e.kind);
                        for (const kind of FLAGS) {
                            counts.set(kind, (counts.get(kind) as number) + (kinds.includes(kind) ? 1 : 0));
                        }
                        if (!kinds.includes("impact-cap")) {
                            longest = Math.max(longest, impact.duration - trackOf(contact).arc.contactAt);
                        }
                    }
                }
            }
        }
        const approach = swingApproach(buildContact(base, WORLD));
        console.log(
            `${type.padEnd(11)} ${runs} runs (${rejected} rejected); runs raising ` +
                `${FLAGS.map((kind) => `${kind} ${counts.get(kind) as number}`).join(", ")}`,
        );
        console.log(
            `${"".padEnd(11)} longest before the cap ${ms(longest)} ms after contactAt ` +
                `(TRACK_IMPACT_CAP ${ms(TRACK_IMPACT_CAP)} ms); canonical approach ${mm(approach.clearance)} mm, ` +
                `${ms(approach.before)} ms before contact`,
        );
    }
}

function dip(): void {
    console.log(
        `== The AC stop's dip (design §9): penetration under HEAD_DEEP_LIMIT ${mm(HEAD_DEEP_LIMIT)} mm, ` +
            "the turf met after the ball ==",
    );
    const entry = defaultProfile.drive["stop-ac"];
    const meets: number[] = [];
    for (let tenths = 80; tenths <= 140; tenths += 5) {
        const depth = tenths / 1e4;
        const profile = {
            ...defaultProfile,
            drive: { ...defaultProfile.drive, "stop-ac": { ...entry, handDrop: depth } },
        };
        const r = run({ ...canonicalSetup("stop-ac"), profile });
        const face = r.impact.timeline["face/blue"]?.[0];
        const turf = r.impact.timeline["head/turf"]?.[0];
        const penetration = r.impact.peakPenetration["head/turf"] ?? 0;
        const after = face !== undefined && turf !== undefined && turf.start > face.end;
        if (after && penetration < HEAD_DEEP_LIMIT) {
            meets.push(depth);
        }
        console.log(
            `dip ${fmt(depth * 1e3, 1)} mm: face ends ${face ? `${ms(face.end)} ms` : "never"}, ` +
                `turf starts ${turf ? `${ms(turf.start)} ms` : "never"}; penetration ${mm(penetration)} mm; ` +
                `turf braking ${fmt(braking(r).turf, 3)} N·s; ratio ${fmt(ratio(r), 2)}; ${flagCounts(r.impact)}`,
        );
    }
    const range = meets.length > 0 ? `${mm(meets[0] as number)}–${mm(meets[meets.length - 1] as number)} mm` : "none";
    console.log(`depths meeting both: ${range}; the profile's handDrop is ${mm(entry.handDrop)} mm`);
}

/**
 * Over the first face–striker interval: the hands' impulse beyond the feed-forward, and the balls' total momentum
 * change, its denominator (every ball, so a croquet stroke's transfer to the croqueted ball counts).
 */
function handShare(r: Run): { readonly hands: number; readonly transfer: number } {
    const hit = firstStrike(r);
    if (hit === null) {
        return { hands: NaN, transfer: NaN };
    }
    let hands = 0;
    for (let i = hit.first; i <= hit.last; i++) {
        const hand = (r.steps[i] as ImpactSnapshot).hand;
        hands += (hand ? length(sub(hand.force, hand.feedForward)) : 0) * IMPACT_DT;
    }
    const start = before(r, hit.first).balls;
    const end = (r.steps[hit.last] as ImpactSnapshot).balls;
    let change = ZERO;
    end.forEach((b, i) => {
        change = add(change, sub(b.velocity, start[i] as Vec3));
    });
    return { hands, transfer: WORLD.ball.mass * length(change) };
}

function coupling(): void {
    console.log(
        `== Coupling (design §9): the canonical set at T = 0.04 s against HAND_COUPLING's ${HAND_COUPLING.period} s, ` +
            `ζ ${HAND_COUPLING.dampingRatio} ==`,
    );
    for (const type of STROKE_TYPES) {
        for (const period of [0.04, HAND_COUPLING.period]) {
            const r = run(canonicalSetup(type), { period, dampingRatio: HAND_COUPLING.dampingRatio });
            const { hands, transfer } = handShare(r);
            const tracked = trackOf(r.contact);
            const track = prepareTrack(tracked, r.contact.head, WORLD.gravity);
            const end = r.steps.find((s) => s.t >= tracked.arc.handStart + tracked.arc.handWindow);
            const lag = end ? length(sub(socketAt(end.head, r.contact.head), pathAt(track, end.t).socket)) : NaN;
            const hits = r.impact.timeline[`face/${r.setup.striker}`]?.length ?? 0;
            // A croquet stroke's ratio; a single-ball stroke's distances after the touch on its target (the GC stop).
            const outcome = r.setup.croqueted !== undefined ? `ratio ${fmt(ratio(r), 2)}` : touchText(r);
            console.log(
                `${type.padEnd(11)} T ${fmt(period, 2)} s: ${outcome}, ${hits} hits; ` +
                    `hands beyond feed-forward ${fmt(hands * 1e3, 2)} mN·s of the balls' ${fmt(transfer, 4)} N·s ` +
                    `(${fmt((100 * hands) / transfer, 2)} %); lag at the hands' window's end ${fmt(lag * 1e3, 3)} mm`,
            );
        }
    }
}

/** The face centre's velocity along `aim`. */
function faceSpeed(state: HeadState, head: MalletHead, aim: Vec3): number {
    const arm = rotate(state.orientation, vec3(head.length / 2, 0, 0));
    return dot(add(state.velocity, cross(state.angularVelocity, arm)), aim);
}

function mass(): void {
    console.log("== Effective mass at the face centre along aim (design §3.4; exit criterion 3: within 10 % of m) ==");
    for (const type of STROKE_TYPES) {
        const r = run(canonicalSetup(type));
        const tracked = trackOf(r.contact);
        const head = r.contact.head;
        const closed = effectiveMass(
            swungBody(head, tracked.hands, tracked.arc.radius),
            head,
            r.contact.orientation,
            tracked.arc.aim,
        );
        const hit = firstStrike(r);
        let measured = "never struck";
        if (hit !== null) {
            const start = before(r, hit.first);
            const end = r.steps[hit.last] as ImpactSnapshot;
            const loss = faceSpeed(start.head, head, tracked.arc.aim) - faceSpeed(end.head, head, tracked.arc.aim);
            const momentum = (i: number): number =>
                WORLD.ball.mass *
                dot(sub((end.balls[i] as BallState).velocity, start.balls[i] as Vec3), tracked.arc.aim);
            const all = end.balls.reduce((sum, _, i) => sum + momentum(i), 0);
            const striker = idsOf(r.setup.balls).indexOf(r.setup.striker);
            measured =
                `every ball ${fmt(all / loss)} kg (${fmt((100 * all) / (loss * closed) - 100, 2)} % from the ` +
                `closed form), the striker's ball alone ${fmt(momentum(striker) / loss)} kg`;
        }
        console.log(
            `${type.padEnd(11)} closed form ${fmt(closed)} kg ` +
                `(${fmt((100 * closed) / head.mass - 100, 2)} % from m); strike: ${measured}`,
        );
    }
}

/** Rotation angle (rad) from orientation b to a. */
function angleBetween(a: Quaternion, b: Quaternion): number {
    const e = multiply(a, { w: b.w, x: -b.x, y: -b.y, z: -b.z });
    return 2 * length(vec3(e.x, e.y, e.z));
}

function tracking(): void {
    console.log(
        `== Tracking at HAND_COUPLING (T ${HAND_COUPLING.period} s, ζ ${HAND_COUPLING.dampingRatio}), no ball, ` +
            "no turf: socket (m) and angle (rad) from the path ==",
    );
    for (const type of STROKE_TYPES) {
        // The hands timed MAX_LEAD early give 60 ms of firm grip before contact; the rolls' hand window runs then.
        const contact = buildContact(canonical(type, { timing: { ...ON_TIME, hands: -MAX_LEAD } }), WORLD);
        const setup = { ...prepareImpact(contact, {}, WORLD), headTurf: null };
        const track = setup.drive as PreparedTrack;
        const arc = track.arc;
        const phaseAt = (t: number): string => {
            if (t < arc.contactAt) {
                return "firm";
            }
            if (inCheck(track, t)) {
                return "check";
            }
            if (arc.mode === "swing") {
                return "swing";
            }
            return t <= (track.reach?.tStop ?? Infinity) ? "carry" : "after the reach";
        };
        const worst = new Map<string, { socket: number; angle: number }>();
        integrate(setup, {
            probe: {
                step(s) {
                    const p = pathAt(track, s.t);
                    const phase = phaseAt(s.t);
                    const w = worst.get(phase) ?? { socket: 0, angle: 0 };
                    w.socket = Math.max(w.socket, length(sub(socketAt(s.head, contact.head), p.socket)));
                    w.angle = Math.max(w.angle, angleBetween(p.orientation, s.head.orientation));
                    worst.set(phase, w);
                },
            },
        });
        const phases = [...worst].map(
            ([phase, w]) => `${phase} ${w.socket.toExponential(2)}, ${w.angle.toExponential(2)}`,
        );
        console.log(`${type.padEnd(11)} (γ_T ${track.hands.gripTension}) ${phases.join("; ")}`);
    }
}

const radius = malletReference.headDiameter.value / 2;
const HEAD: MalletHead = {
    mass: malletReference.headMass.value,
    inertia: solidCylinderInertia(malletReference.headMass.value, malletReference.headLength.value, radius),
    length: malletReference.headLength.value,
    radius,
    socket: vec3(0, 0, radius),
};
const FACE: FaceMaterial = {
    restitution: malletReference.faceRestitution.value,
    friction: malletReference.faceFriction.value,
    contactTime: contactReference.faceBallContactTime.value,
};
const at = (x: number, y: number): BallState => ({
    position: vec3(x, y, R),
    velocity: vec3(0, 0, 0),
    angularVelocity: vec3(0, 0, 0),
});
const BLUE = at(10, 10);
const RED = at(10 + 2 * R, 10);
/** A checked stroke: the hands pull back with 100 N along the travel for 3 ms, plus the head's weight. */
const checked = (t: Vec3): ReturnType<typeof drive> => drive(vec3(-100 * t.x, -100 * t.y, -100 * t.z), 3e-3, HEAD);

/** A force-table stroke of scripts/impactProbe.ts. */
interface ForceStroke {
    readonly name: string;
    readonly balls: BallStates;
    readonly contact: ContactState;
}

/** scripts/impactProbe.ts's force-table strokes, as P2b.2a timed them. */
const FORCE_STROKES: readonly ForceStroke[] = [
    {
        name: "centre 3 m/s",
        balls: { blue: BLUE },
        contact: strike(BLUE.position, { head: HEAD, face: FACE, speed: 3 }),
    },
    {
        name: "croquet 3 m/s",
        balls: { blue: BLUE, red: RED },
        contact: strike(BLUE.position, { head: HEAD, face: FACE, speed: 3 }),
    },
    {
        name: "descending 10°",
        balls: { blue: BLUE },
        contact: strike(BLUE.position, { head: HEAD, face: FACE, speed: 3, descent: 0.1745, pitch: 0.1745 }),
    },
    {
        name: "stop shot",
        balls: { blue: BLUE, red: RED },
        contact: strike(BLUE.position, { head: HEAD, face: FACE, speed: 3, descent: 0.0524, drive: checked }),
    },
];

function cost(): void {
    console.log(`== Impact time per step (${REPEAT} runs after 5 warm-up; for P5) ==`);
    const time = (name: string, contact: ContactState, balls: BallStates): void => {
        for (let i = 0; i < 5; i++) {
            simulateImpact(contact, balls, WORLD);
        }
        const times: number[] = [];
        let steps = 0;
        for (let i = 0; i < REPEAT; i++) {
            const start = performance.now();
            steps = simulateImpact(contact, balls, WORLD).steps;
            times.push(performance.now() - start);
        }
        times.sort((a, b) => a - b);
        const median = times[Math.floor(times.length / 2)] as number;
        console.log(
            `${name.padEnd(20)} ${steps} steps: median ${fmt(median, 3)} ms ` +
                `(${fmt((median * 1e3) / steps, 3)} µs/step)`,
        );
    };
    for (const type of STROKE_TYPES) {
        const setup = canonicalSetup(type);
        time(`tracked ${type}`, buildContact(setup, WORLD), setup.balls);
    }
    for (const stroke of FORCE_STROKES) {
        time(`force ${stroke.name}`, stroke.contact, stroke.balls);
    }
    // The longest lead-in (MAX_LEAD) plus the cap: a gentle AC stop (1 m/s, drive 0.5) whose head comes to rest on
    // the turf, a closed contact that holds the impact to the cap, its hands (which carry no share) timed 60 ms early.
    const r = run(canonical("stop-ac", { speed: 1, drive: 0.5, timing: { ...ON_TIME, hands: -MAX_LEAD } }));
    const ids = idsOf(r.setup.balls);
    const travel = ids.map(() => 0);
    let excess = -Infinity;
    for (const s of r.steps) {
        s.balls.forEach((b, i) => {
            // As integrate.ts sums it: each step's horizontal speed after the step times the step.
            travel[i] = (travel[i] as number) + length(horizontal(b.velocity)) * IMPACT_DT;
            const from = (r.setup.balls[ids[i] as BallId] as BallState).position;
            excess = Math.max(excess, length(horizontal(sub(b.position, from))) - (travel[i] as number));
        });
    }
    console.log(
        `reach filter over ${r.impact.steps} steps (${ms(r.impact.duration)} ms): displacement beyond the summed ` +
            `path at most ${excess.toExponential(2)} m against WAKE_MARGIN ${WAKE_MARGIN} m` +
            `${excess > 0 ? ` (${fmt(WAKE_MARGIN / excess, 0)}× headroom)` : ""}`,
    );
}

/** Where the lawn came in a timed stroke: before the ball, after it, or with the ball never struck. */
function order(impact: ImpactResult, striker: BallId): string {
    const struck = impact.timeline[`face/${striker}`]?.[0];
    const dug = impact.timeline["head/turf"]?.[0];
    if (struck === undefined) {
        return "missed";
    }
    return dug !== undefined && dug.start < struck.start ? "lawn first" : "ball first";
}

/**
 * One timed stroke's outcome (design §9): lawn or ball first, the dig and slide, the striker's ball's launch, and after
 * phase 2 both balls' distances and the coaching ratio, so the timings show what makes a better stroke in play.
 */
function timedLine(label: string, setup: ShotSetup): string {
    let r: Run;
    try {
        r = quick(setup);
    } catch (error) {
        if (error instanceof RangeError) {
            return `${label}: rejected (${error.message})`;
        }
        throw error;
    }
    const { impact } = r;
    const v = (impact.handover[setup.striker] as BallState).velocity;
    const flat = Math.hypot(v.x, v.y);
    const croqueted = setup.croqueted as BallId;
    return (
        `${label}: ${order(impact, setup.striker)}, dig ${mm(impact.peakPenetration["head/turf"] ?? 0)} mm, ` +
        `slide ${fmt((impact.headTurfSlide ?? 0) * 1e3, 1)} mm; ball ${fmt(Math.hypot(flat, v.z), 3)} m/s at ` +
        `${fmt((Math.atan2(v.z, flat) * 180) / Math.PI, 2)}°; striker ${fmt(travelled(r, setup.striker), 3)} m, ` +
        `croqueted ${fmt(travelled(r, croqueted), 3)} m, ratio ${fmt(ratio(r), 2)}; ${flagCounts(impact)}`
    );
}

function timings(): void {
    console.log("== Timing (design §9): each action early or late, and the dip's depth ==");
    for (const type of ["stop-ac", "full-roll"] as const) {
        for (const action of ["arc", "hands", "dip"] as const) {
            for (const offset of [-50, -40, -30, -20, -10, -5, 0, 5, 10, 20]) {
                const timing = { ...ON_TIME, [action]: offset / 1000 };
                console.log(timedLine(`${type} ${action} ${offset} ms`, canonical(type, { timing })));
            }
        }
        const entry = defaultProfile.drive[type];
        for (const times of entry.handDrop > 0 ? [0, 0.5, 1, 1.5, 2] : []) {
            const profile = {
                ...defaultProfile,
                drive: { ...defaultProfile.drive, [type]: { ...entry, handDrop: entry.handDrop * times } },
            };
            console.log(timedLine(`${type} dip ×${times}`, { ...canonicalSetup(type), profile }));
        }
    }
}

/** The GC sweep's gaps (m, surface to surface), from 0.05 to 1 m. */
const GAPS = [0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1];

function gc(): void {
    console.log(
        "== The GC stop (design §5.4, §9): after the striker's first touch on the target, both distances and " +
            "their ratio (target over striker); then stop-gc against single-ball over the gap ==",
    );
    for (const speed of [2, 2.5, 3, 3.5, 4]) {
        const r = run(canonical("stop-gc", { speed }));
        console.log(`stop-gc ${fmt(speed, 1)} m/s, gap ${GC_STOP_GAP} m: ${touchText(r)}; ${crossingText(r)}`);
    }
    for (const gap of GAPS) {
        for (const type of ["stop-gc", "single-ball"] as const) {
            const r = run(canonicalSetup(type, { targetGap: gap }));
            const hits = r.impact.timeline[`face/${r.setup.striker}`]?.length ?? 0;
            console.log(
                `gap ${fmt(gap, 2)} m ${type.padEnd(11)} ${hits} hits, ${ms(r.impact.duration)} ms; ` +
                    `${touchText(r)}; ${crossingText(r)}`,
            );
        }
    }
}

/**
 * A single-ball stroke through the world's first hoop, its plane crossing the aim: the canonical single-ball stroke
 * with the striker's ball 0.15 m short of the hoop's centre, on its centre line, and the face `side` off the ball's
 * centre. At side 0 the head passes through the jaws with about 9.5 mm to spare each side (the shaft meets the crown);
 * at 10 mm the head, 10 mm off the ball's line, has 0.5 mm too little and its rim meets an upright.
 */
function throughHoop(side: number): ShotSetup {
    const hoop = WORLD.hoops[0] as (typeof WORLD.hoops)[number];
    const base = canonical("single-ball", { contact: { up: 0, side } });
    const blue: BallState = {
        position: vec3(hoop.centre.x, hoop.centre.y - 0.15, R),
        velocity: vec3(0, 0, 0),
        angularVelocity: vec3(0, 0, 0),
    };
    return { ...base, balls: { blue } };
}

function rehit(): void {
    console.log(
        "== The late re-hit (design §3.5, §9): the real head at the impact's end, moved on by the planned " +
            "follow-through out to FREE_SPAN, against every ball's phase-2 trajectory and, with the shaft, the hoops " +
            "and the peg; measured, not integrated ==",
    );
    for (const type of STROKE_TYPES) {
        const base = canonicalSetup(type);
        const up0 = base.stroke.contact.up;
        let runs = 0;
        let overlapped = 0;
        let balls = 0;
        let obstacles = 0;
        const crossed: string[] = [];
        for (const speed of [1, 2, 3, 4, 6]) {
            for (const strokeDrive of [-1, -0.5, 0, 0.5, 1]) {
                for (const up of [up0 - 0.003, up0, up0 + 0.003]) {
                    for (const side of [-0.01, 0, 0.01]) {
                        let r: Run;
                        try {
                            r = quick(canonical(type, { speed, drive: strokeDrive, contact: { up, side } }));
                        } catch (error) {
                            if (error instanceof RangeError) {
                                continue;
                            }
                            throw error;
                        }
                        runs++;
                        const c = crossing(r);
                        overlapped += c.atEnd.length > 0 ? 1 : 0;
                        balls += c.first === null ? 0 : 1;
                        obstacles += c.obstacle === null ? 0 : 1;
                        if (c.first !== null || c.obstacle !== null || c.atEnd.length > 0) {
                            crossed.push(
                                `speed ${speed}, drive ${strokeDrive}, up ${mm(up)} mm, side ${mm(side)} mm: ` +
                                    crossingText(r, c),
                            );
                        }
                    }
                }
            }
        }
        console.log(
            `${type.padEnd(11)} canonical: ${crossingText(quick(base))}; preset sweep: ${balls} of ${runs} runs ` +
                `cross a ball, ${obstacles} an obstacle, ${overlapped} overlap one at the impact's end`,
        );
        for (const line of crossed) {
            console.log(`${"".padEnd(11)} ${line}`);
        }
    }
    for (const side of [0, 0.01]) {
        console.log(`through hoop 1, side ${mm(side)} mm: ${crossingText(quick(throughHoop(side)))}`);
    }
}

const SECTIONS: Readonly<Record<string, () => void>> = {
    ratios,
    gc,
    canonical: canonicalRuns,
    presets,
    dip,
    coupling,
    mass,
    tracking,
    cost,
    timings,
    rehit,
};
if (SECTION !== "all" && SECTIONS[SECTION] === undefined) {
    throw new Error(`SECTION must be "all" or one of ${Object.keys(SECTIONS).join(", ")}`);
}
for (const [name, section] of Object.entries(SECTIONS)) {
    if (SECTION === "all" || SECTION === name) {
        section();
    }
}
```

Notes on the code:

- `s.headTurf ?? ZERO` reads the snapshot's turf force (spec §3.7), present for a tracked drive whose setup has the
  pair; `s.hand?.force` likewise.
- The timing section uses the full roll as its roll: it has both a pendulum gain and a hand gain over 30 ms windows,
  and pre-flight's first record used it. No roll has a dip, so its dip-timing lines show the dip inert; the AC stop is
  the only preset with a dip-depth sweep. Each line also runs phase 2 (`quick`) and prints both balls' distances to
  rest and the coaching ratio (user decision, 2026-10-06: the probe shows what makes a better stop shot in play, not
  only how the strike went); a stroke that misses the ball moves neither, so its ratio prints `NaN`.
- `tracking` prepares the impact itself and drops the head–turf pair, so the AC stop's dip and a carry's descent below
  the turf do not mix turf forces into the tracking error. A relaxed top hand (the AC stop's γ_T 0.1) sinks below the
  path by design (spec §3.3); its line is printed with γ_T so it is not read as a tracking failure.
- `mass` prints the strike's measure over every ball and over the striker's ball alone. In a croquet stroke the
  striker's ball passes momentum to the croqueted ball within the first face interval, so the striker alone
  understates the head's effective mass (prototype drive: 0.286 kg); the sum over every ball is the measure.
- The 0.51 s run in `cost` is the AC stop at 1 m/s and drive 0.5 with its hands timed `MAX_LEAD` early: its hands
  carry no share and no gain, so the path is that stroke's, started 60 ms before contact, and its head comes to rest
  on the turf, a closed contact, so it runs to the cap. The canonical drive no longer reaches the cap.
- `ratios` runs over `CROQUET_STROKES`: the GC stop is a single-ball stroke (user decision, 2026-10-06) and has no
  croquet ratio. `gc` reports its outcome instead: from the striker's first touch on the target (in the impact for a
  short gap, else in phase 2), how far each ball travels and their ratio. These are observations; P2b.2b.2
  calibrates them. `coupling` prints the same for the GC stop in place of a ratio.
- `gc` and `rehit` measure the late re-hit with `crossing`: the real head at the impact's end, moved on by the
  planned path's displacement and rotation since then (the rigid motion taking `headOnPath` at the end to
  `headOnPath` at t; the unstruck path, whose velocity the end rule's look-ahead gives the real head), every 0.1 ms out
  to `FREE_SPAN`, against each ball's phase-2 state at the same moment (`stateAtTime`, clamped at rest), with Task 7's
  whole-head cylinder. A ball the real head already overlaps at the impact's end is reported apart; a crossing is a
  ball the head enters after that, printed with its depth at the first overlapping sample and the head's and the
  ball's speeds. No engine change and no fault: P2b.2b.3 integrates the second hit. The swept head moves at the
  path's speed from the impact's end, not at its struck speed, so a crossing says the follow-through would reach the
  ball, not that the struck head would. (Pre-flight's first record swept `headOnPath` itself; after a strike the
  planned head runs up to 654 mm ahead of the real one, so it overlapped a ball at the first sample in most runs.)
- The same sweep reports the first obstacle crossing (user decisions, 2026-10-06): `RODS` holds each hoop upright
  (from the lawn to the crown's axis), each crown (taken to have the uprights' diameter, as reference/court.json does,
  between the uprights' axes at `crownClearance` plus its radius) and the peg (up to 1 m: the world's peg has no
  top). The head's cylinder meets a rod where any of the spheres of the rod's radius every 2 mm along its axis
  overlaps it (`headBallContact`); the shaft, from the socket to the top hand (the arc radius along the head's up
  axis), meets a rod where its axis comes within the rod's radius, as the reference data gives the shaft no
  diameter. Only rods near the head are sampled. The canonical lane is clear of the hoops and the peg, so `rehit`
  ends with a single-ball stroke through hoop 1 (`throughHoop`), centred and with the face 10 mm off the ball's
  centre. The backswing is not swept: the plan has no backswing path (P2b.2b.2 models one).
- `rehit` runs phase 2 and the sweep over each preset's 225-run grid (`quick` records no snapshots) and lists every
  run that crosses a ball or an obstacle or overlaps one at the impact's end: a few minutes.

- [ ] **Step 2: Run the probe**

Record the machine first: `node --version`.

Run each section separately, keeping each output for Step 3:

- `SECTION=ratios npx --yes tsx scripts/swingProbe.ts`
- `SECTION=gc npx --yes tsx scripts/swingProbe.ts`
- `SECTION=canonical npx --yes tsx scripts/swingProbe.ts`
- `SECTION=presets npx --yes tsx scripts/swingProbe.ts` (1,575 impacts: a few minutes)
- `SECTION=dip npx --yes tsx scripts/swingProbe.ts`
- `SECTION=coupling npx --yes tsx scripts/swingProbe.ts`
- `SECTION=mass npx --yes tsx scripts/swingProbe.ts`
- `SECTION=tracking npx --yes tsx scripts/swingProbe.ts`
- `SECTION=cost npx --yes tsx scripts/swingProbe.ts`
- `SECTION=timings npx --yes tsx scripts/swingProbe.ts`
- `SECTION=rehit npx --yes tsx scripts/swingProbe.ts` (1,575 shots with phase 2: a few minutes)

Expected: every section prints, with no exception. Every line except the µs/step and median figures in `cost` matches
pre-flight's record. If a deterministic line differs, stop and report it.

Pre-flight's record replaces the reference below. Until then, these are the figures measured while planning, at
T = 0.08 s: the prototype's (`aeadd4c`, pass 4, with the spec's two preset changes applied: the AC stop's dip 11 mm,
the pass roll's reach 0.30 m), which this plan's code reproduced in its dry run, re-measured on this plan's code where
the 0.45 s cap changed them (the drive's ratio and length, the cap's flags, `cost`) or the prototype had none:

| Section | Reference |
|---|---|
| `ratios` (3 m/s; 2, 2.5, 3, 3.5, 4 m/s) | drive 3.32 (2.49, 2.90, 3.32, 3.02, 3.47; prototype at the 0.15 s cap 3.33 (2.86, 2.96, 3.33, …)); AC stop 6.47 (6.66, 6.55, 6.47, 6.41, 6.37; pre-flight, with the check to rest, 6.46 (6.65, 6.54, 6.46, 6.41, 6.37)); no GC stop line (a single-ball stroke; its 6.60 was on the retired touching setup); half roll 2.83 (2.75, 2.79, 2.83, 2.86, 2.88); full roll 2.14 (1.73, 1.99, 2.14, 2.20, 52.47); pass roll 1.59 (1.26, 1.44, 1.59, 1.89, 2.11); the drive at 2, 3 and 4 m/s with `guideEffort` 0: 5.63, 6.04, 6.05, one hit each, ending 110.6, 95.3 and 76.8 ms after contactAt; at 1: 2.49, 3.32, 3.47 with 4, 2 and 2 hits, 268.9, 181.4 and 138.0 ms after contactAt (this plan's code; pre-flight the same) |
| `gc` | pre-flight (nothing was measured on the target setup while planning): the canonical GC stop at 2, 2.5, 3, 3.5 and 4 m/s touches the target in phase 2 (141.7, 106.8, 86.5, 73.0 and 63.3 ms after contactAt); after it the striker's ball travels 0.336, 0.267, 0.264, 0.293 and 0.343 m, the target 0.959, 1.975, 3.217, 4.764 and 6.617 m (ratios 2.86, 7.38, 12.17, 16.28, 19.32); no crossing. Over the gap (3 m/s) every run is one hit and a 10.0 ms impact with the touch in phase 2; striker and target after the touch, `stop-gc` then `single-ball`: 0.05 m 0.157 and 4.238 m (26.97), 0.171 and 4.550 m (26.64); 0.1 m 0.182 and 3.967 m (21.76), 0.199 and 4.265 m (21.45); 0.2 m 0.206 and 3.585 m (17.40), 0.215 and 3.910 m (18.22); 0.3 m 0.264 and 3.217 m (12.17), 0.266 and 3.513 m (13.19); 0.5 m 0.471 and 2.654 m (5.63), 0.458 and 2.950 m (6.45); 0.75 m 0.755 and 2.118 m (2.81), 0.817 and 2.294 m (2.81); 1 m 0.721 and 2.023 m (2.81), 0.783 and 2.198 m (2.81). `stop-gc` never crosses; `single-ball` crosses blue at 0.05, 0.1 and 0.2 m (23.8, 40.7 and 76.4 ms after contactAt; head 2.90–2.99 m/s, ball 0.51–0.53 m/s), none from 0.3 m |
| `canonical` | entry jumps 0 on every setup; highest ball centre above R: single-ball 0.85, drive 0.93, AC stop 4.17, half roll 0.72, full roll 0.82, pass roll 2.91 mm; regions face only, except face and rim for the full and pass rolls; release only in the drive, 110.0 ms after contactAt; braking hands / turf (N·s): single-ball −0.055 / 0, drive −1.253 / 0, AC stop 0.230 / 0.376, half roll −0.706 / 0, full roll −2.108 / 0, pass roll −4.051 / 0; after contactAt (single-ball, drive, AC stop, half, full and pass roll) 10.0, 181.4, 21.7, 40.2, 83.4, 70.0 ms; none reaches the cap; pre-flight, with the check to rest: AC stop 4.19 mm, braking 0.225 / 0.401, 21.6 ms; GC stop 1.46 mm, braking 1.187 / 0, 10.0 ms (touching: 0.81 mm, 1.697 / 0); `impact-off-face` once each on the full and pass rolls; no `impact-head-deep` |
| `dip` | 8.0–11.5 mm meet both conditions; 11 mm: penetration 1.73 mm, the face interval ends at 1.17 ms and the turf interval starts at 12.70 ms, turf braking 0.376 N·s, ratio 6.47; 12 mm reaches 2.11 mm and raises `impact-head-deep`; 14 mm reaches 2.86 mm. Pre-flight, with the check to rest: 8.0–11.5 mm still meet both; 11 mm: 1.80 mm, the turf from 12.52 ms, 0.401 N·s, ratio 6.46; 11.5 mm 2.00 mm (1.996); 12 mm 2.19 mm and `impact-head-deep`; 14 mm 2.93 mm |
| `coupling` (ratio at 0.04 s / 0.08 s) | drive 2.35 / 3.32; AC stop 6.45 / 6.47 (pre-flight, with the check to rest, 6.46 / 6.46); GC stop re-measured by pre-flight, as distances after the touch (touching: 6.51 / 6.60); half roll 2.03 / 2.83; full roll 1.78 / 2.14; pass roll 1.33 / 1.59. Pass 4's single-ball hands' share: 0.754 % at 0.04 s, 0.395 % at 0.08 s |
| `mass` | drive closed form 1.007 kg (spec §3.4); strike over every ball 1.0066 kg; single-ball 1.0018 kg; the drive's striker's ball alone 0.2861 kg |
| `presets` | 225 runs per preset, none rejected; `impact-cap` only on 12 AC-stop runs (speed 1, drive 0 and 0.5, up −23 and −20 mm; the head resting on the turf); `impact-head-approaching` on none; `impact-head-deep` on 72 AC-stop runs; `impact-off-face` drive 81, AC stop 65, GC stop 10, full roll 225, pass roll 180; longest before the cap after contactAt: single-ball 11.3, drive 314.6, AC stop 308.8, GC stop 217.7, half roll 213.7, full roll 298.3, pass roll 303.8 ms (pre-flight, with the check to rest; planning: 18 AC-stop runs at the cap, `impact-off-face` drive 80, the drive's longest 324.8 ms, the touching GC stop's `impact-off-face` 55 and longest 226.0 ms) |
| `tracking` | firm before contact under 2.9e-7 m and 4.8e-7 rad on every preset; GC stop's check 7.1e-6 m; carry to the reach's end under 8.7e-6 m and 1.9e-5 rad; swing mode after contact outside a check (the residual): single-ball 4.2e-4 m, drive 4.9e-5 m, the relaxed AC stop (γ_T 0.1) 0.70 m (this plan's code) |
| `cost` | the 0.51 s run: 102,000 steps, 510.0 ms, displacement beyond the summed path 1.49e-11 m (67× headroom; this plan's code at the 0.45 s cap) |
| `timings` | AC stop: the arc 10–50 ms early misses the ball and runs to the cap; the hands' timing changes the ratio by at most 0.01 (at 20 ms late the launch falls to −0.20°); the dip 20–50 ms early puts the lawn first (1.21–1.22 m/s against 1.380), 5–20 ms late (2.01–2.56 mm) or ×1.5 raises `impact-head-deep`. Full roll: ball first throughout, `impact-off-face` on every line (this plan's code). Both balls' distances after phase 2 and the coaching ratio on every line: pre-flight measures |
| `rehit` | pre-flight (a new section): no run's real head overlaps a ball at the impact's end. Canonical setups: no crossing for single-ball, drive, AC stop and GC stop; the half roll crosses blue 73.3 ms after contactAt (head 1.530 m/s, ball 1.478 m/s), the full roll blue at 107.4 ms (1.687, 1.101 m/s), the pass roll blue at 138.9 ms (the head held at its reach's end, the ball 1.164 m/s). Preset sweeps, runs crossing of 225: single-ball 18, drive 3, AC stop 13, GC stop 38, half roll 53, full roll 125, pass roll 223. No run, canonical or swept, meets an upright, a crown or the peg (head or shaft) or overlaps one at the impact's end. Through hoop 1: centred, no ball crossing, the shaft meets 1/crown 143.2 ms after contactAt (0.110 mm); with the face 10 mm off, the head crosses blue at 59.9 ms (head 2.940 m/s, ball 0.772 m/s) and meets 1/b at 100.3 ms |

- [ ] **Step 3: Record the outcomes in the roadmap**

The spec's amendment of 2026-10-05 lists roadmap changes (§11) that the roadmap on `main` does not yet carry: it still
describes a one-hand spring–damper and the 5 % criterion. Make these edits in
`docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`. The P2 row is a single table line; edit it in place.

1. P2 row, the P2b.2b.1 description. Replace
   `the hands pulling the head through a spring–damper whose grip relaxes at contact; mallet–turf contact,` with
   `two hands on a rigid shaft, in swing mode (single-ball, drive, stops) or carry mode (rolls), tracking the path's
   velocity from contact, the bottom hand releasing by reach; the whole head meeting the balls as a solid cylinder,
   with a re-entry guard; the GC stop a single-ball stroke over a gap to its target; mallet–turf contact,` (one line
   in the file, as the row is).
2. P2 row, the P2b.2b.2 description, with the new phase after it (user decisions, 2026-10-06). Replace
   `**P2b.2b.2:** reference data for coaching ratios and the swing inputs' defaults; contact-time and hand-coupling
   fit; ratio calibration and held-out validation; crush calibration; 29.1.6.3.` with
   `**P2b.2b.2:** the whole stroke shape, the backswing from its top, the lead-in and the follow-through, with its
   amplitude, modelled and calibrated per shot type and complete enough for P2b.2b.3 (the head's and the shaft's
   poses along the whole swing); reference data for coaching ratios and the swing inputs' defaults; contact-time fit;
   the hand coupling's T and ζ, the arm mass, the reach slack and the grips fitted to the ratios; the low-speed
   face–ball law; the turf's response under load; the steep rolls' calibration (the full and pass rolls are
   P2b.2b.1's known misses); the GC stop's distances after the touch; ratio calibration and held-out validation;
   crush calibration; 29.1.6.3. **P2b.2b.3** (decided 2026-10-06; first placed before P2b.2b.2 as P2b.2b.1b, then
   moved after it by the user: "first we must model the stroke shape and amplitude and calibrate to the different
   shot types, but we will need the model to be complete enough for the rest later"): the whole swing. The mallet is
   carried along the swing path P2b.2b.2 calibrates, the backswing from its top, the lead-in and the follow-through
   after the impact ends, and its head and its shaft (rigid on the head, from the socket to the top hand) are swept
   against every ball, the hoops' uprights and crowns, and the peg: in a real game they may lie in the swing's path
   and limit the playable stroke, and the crown stops the shaft when the head reaches through an open hoop (limiting
   the follow-through's arc) or is swung back through the jaws. Head–obstacle and shaft contact are new physics. On
   any crossing the impact integrator re-opens, so a ball that comes back into the follow-through's arc (stopped by a
   target, rebounding off a hoop or the peg, or pulling up short), another ball, a hoop or the peg is met within an
   integrated impact and the fault judge rules on it (29.1.6.1, 29.1.6.2, 29.1.11, 29.1.10; Law 29.3.2 lets the
   opponent leave the balls where they lie after the first stroke in error, so the re-hit's physics matters).
   P2b.2b.1 only counts the follow-through's crossings.`
3. P2 row, the exit criteria. Replace
   `P2b.2b.1: tracked-drive, head–turf and swing-model analytic cases; force-table drives bit-identical to P2b.2a; the
   hands' impulse in a 3 m/s centre strike at most 5 % of the transfer; every default preset runs end to end.` with
   `P2b.2b.1 (met): tracked-drive, head–turf, head–ball and swing-model analytic cases; force-table drives
   bit-identical to P2b.2a; the swung body's effective mass at the face centre within 10 % of the head's mass on the
   drive's canonical setup, and measured by the strike; every default preset's canonical setup runs end to end with
   no re-entry guard hit and no ball centre more than 5 mm above R, its ratios recorded against the coaching ranges,
   the GC stop's distances after the touch over the gap, and the late re-hit's crossings.`; replace
   `P2b.2b.2: standard stroke ratios` with `P2b.2b.2: the stroke shape (backswing, lead-in, follow-through and
   amplitude) calibrated per shot type; standard stroke ratios`; and replace `meeting the croqueted ball just above
   its equator, no jump flag) |` with `meeting the croqueted ball just above its equator, no jump flag). P2b.2b.3: the
   head and the shaft are swept along the whole swing (backswing, lead-in and follow-through) against every ball, the
   uprights, the crowns and the peg; every crossing, including those the P2b.2b.1 probe counts, is integrated as a
   further contact within the impact and judged (29.1.6.1, 29.1.6.2, 29.1.11, 29.1.10); head–obstacle and shaft
   contact analytic cases; the crossing counts re-measured. |`. Then, in the row's deferred list (user decisions,
   2026-10-06), replace `29.1.10, with mallet–obstacle contact;` with `29.1.10 by a part of the body (the mallet's
   part is P2b.2b.3's); variability of swing and aim (accuracy), and conditions such as wind, under which a hoop
   could block a shot or a glancing blow redirect it or limit its power;`, and replace `with the bottom hand's
   position as the input from which the shaft's lean and the push–swing balance follow |` with `with the bottom
   hand's position as the input from which the shaft's lean and the push–swing balance follow; the Golf Croquet
   Rules' faults and remedies, in a GC-rules phase (until then a GC stroke is judged as an AC single-ball stroke) |`.
4. P3 row. Replace `stance including grip tension being entered` with
   `the stance (hands, grips and lean) and the body being entered`.
5. P4 row. Replace `then the rehearsed swing and its timing — target hoop, lawn speed; casting versus planted ways of
   setting up and rehearsing a shot, decided here (user decision 2026-10-05)` with `then the rehearsed swing, its
   reach and its timing — target hoop, lawn speed; casting versus planted ways of setting up and rehearsing a shot,
   and how much of the set-up a weaker shot uses, decided here (user decisions 2026-10-05)`.
6. "P2b.2 decisions", the "P2b.2b.1 design (2026-10-04)" bullet. Replace the two lines

   ```markdown
     force. Its provisional period and damping are set by a criterion (hand impulse in the strike at most 5 % of the
     transfer).
   ```

   with

   ```markdown
     force. Its provisional period and damping are set by a criterion (hand impulse in the strike at most 5 % of the
     transfer); superseded on 2026-10-05 (the amendment below).
   ```

7. "P2b.2 decisions": after the "P2b.2b.1 design (2026-10-04)" bullet's last sub-bullet (it ends "damage)
   judgeable as a possible fault."), add these two bullets, filling the one placeholder from the `dip` section's last
   line:

   ```markdown
   - **P2b.2b.1 amendment (2026-10-05).** After the pre-flight (below), the model was rebuilt on the user's account of
     play and John Riches, *Croquet Technique* (Oxford Croquet,
     <http://www.oxfordcroquet.com/coach/riches/croqtech/index.asp>).
     - Two hands on a rigid shaft. The top hand is the pivot, `top` from the socket; the bottom hand is `bottom` from
       it; an arm mass rides at the top grip. Before contact the rigid path's wrench is split exactly over the hands.
       From contact they track the path's velocity only, the feed-forward scaled by each hand's grip and the dip fed
       forward in full. The bottom hand opens once the shaft has turned through its reach slack.
     - Two modes. Swing (single-ball, drive, stops): after its window the pendulum swings freely and the bottom hand
       is a one-sided rate guide, two-sided through a check. Carry (rolls, after Riches): the slope is held, the
       bottom hand grips two-sided, and the hands' path ends after `handReach`, descending so the head finishes
       `groundDepth` below the turf.
     - The whole head meets the balls as a solid cylinder, with a re-entry guard. The end rule looks 30 ms ahead;
       `TRACK_IMPACT_CAP` is 0.45 s, so that a drive's follow-through re-hits are integrated.
     - The coupling is held at T = 0.08 s and ζ = 0.7 (user decision). From contact the hands draw little in the
       strike at any period, so the 5 % criterion no longer selects T. Exit criterion 3 is instead the swung body's
       effective mass at the face centre along aim, within 10 % of the head's mass (prototype: 1.007 kg for the
       drive).
     - Presets (spec §5.4, provisional; arm mass 0.8 kg, reach slack 0.03 m). Single-ball: lean 0°, hands 0.805 and
       0.70 m from the socket, grips 1 and 0.1, swing. Drive: 0°, 0.805 and 0.60 m, grips 1 and 0.25, swing. AC stop:
       −4°, 0.805 and 0.45 m, grips 0.1 and 0.1, swing with a check and a dip of <the profile's handDrop, as the `dip`
       section prints it> mm over 20 ms. GC stop (a single-ball stroke, its target 0.3 m ahead): 0°, 0.805 and
       0.45 m, grips 1 and 1, swing with a check. Half roll: 15°, 0.805 and 0.42 m, carry, hands' share 0.6, reach
       0.15 m, 5 mm into the ground. Full roll: 45°, 0.61 and 0.30 m, carry, share 0.9, reach 0.30 m, 2 mm. Pass
       roll: 48°, 0.45 and 0.09 m, carry, share 0.85, a pendulum punch (`speedGain` 0.5 over 15 ms), reach 0.30 m,
       2 mm.
     - The full and pass rolls (lean 45° and 48°) are known misses in P2b.2b.1: both carry the striker's ball on a
       steep face, which needs the low-speed face–ball law and the turf's response under load (P2b.2b.2).
   - **P2b.2b.1 pre-flight decisions (2026-10-06).** From the user's account of play.
     - The GC stop is a single-ball stroke, never a croquet stroke: the striker's ball crosses a gap to the target,
       about 0.3 m at best. Closer risks a double hit on the target; longer, the skid runs out and the striker's ball
       follows through; short grass and more power stretch the range. A standard single-ball shot hit full can stop as
       well. On the engine's turf a ball struck at 3 m/s skids about 0.47 m before it rolls, and phase 2 already
       models the sliding collision. Its canonical setup puts the target 0.3 m ahead, live; its outcome is the
       distances after the first touch and their ratio (target over striker), observations that P2b.2b.2
       calibrates, swept over gaps of 0.05–1 m against the single-ball preset. A GC stroke is judged as an AC
       single-ball stroke; the Golf Croquet Rules' faults and remedies go to a GC-rules phase.
     - The late re-hit, in every shot. Once the impact has ended, phase 2 moves the balls with no mallet in it, so a
       ball that comes back into the follow-through's arc is never checked, though Laws 29.1.6.1 and 29.1.6.2 make
       that a fault within the striking period, and Law 29.3.2 lets the opponent leave the balls where they lie after
       the first stroke in error. P2b.2b.1 records it as a known limit and counts the crossings; P2b.2b.3 integrates
       the second hit and judges it.
     - P2b.2b.3 is the whole swing (later the same day). In a real game hoops, the peg and other balls may lie in the
       swing's path and limit the playable stroke, and the head's and the shaft's path is known. So P2b.2b.3 sweeps
       the head and the shaft (rigid on the head, from the socket to the top hand) along the backswing from its top,
       the lead-in and the follow-through, against every ball, the hoops' uprights and crowns, and the peg. When the
       head reaches through an open hoop the shaft is often impeded by the crown, which
       limits the follow-through's arc; a head swung back through the jaws meets it in the backswing. Head–obstacle
       and shaft contact are new physics; any crossing re-opens the impact, and the judge rules on it under 29.1.6.1,
       29.1.6.2, 29.1.11 and 29.1.10, whose commentary C29.15.1 reads: "The main instances are hitting a hoop or the
       peg in the backswing when a ball is in contact with it and hitting a hoop or the peg on the forward swing when
       aiming to hit a ball resting on it." Variability of swing and aim, and conditions such as wind, are deferred
       beyond P2b (P2 row).
     - The phase order (later the same day). The sweep phase was first placed before P2b.2b.2's calibration as
       P2b.2b.1b; the user moved it after, as P2b.2b.3: "first we must model the stroke shape and amplitude and
       calibrate to the different shot types, but we will need the model to be complete enough for the rest later".
       So P2b.2b.2 models the whole stroke shape, the backswing from its top, the lead-in and the follow-through, with
       its amplitude, and calibrates it per shot type alongside its other calibration; its path model gives the
       head's and the shaft's poses along the whole swing, complete enough for P2b.2b.3 to sweep them.
   ```

8. Add these two sections after "P2b.2a outcomes carried forward (for P2b.2b)" (after its "**Not used yet.**"
   bullet) and before "## Provisional numbers — where each is confirmed". Replace each `<…>` with the figures of
   Step 2's output (they equal pre-flight's record); leave no angle brackets in the committed file. Each placeholder
   names the section whose lines it summarises.

   ```markdown
   ## P2b.2b.1 pre-flight outcomes (2026-10-05)

   The first pre-flight ran the P2b.2b.1 plan as merged. Its mechanical defects were folded into the re-plan; two
   model failures changed the design.

   - **The roll catapult.** In the full roll a face pitched 35° down, a path that kept accelerating into the blocked
     ball and sticking face friction made the head climb the ball until the contact left the face disc. Off the face
     the pair applied no force, so the ball sank about 15 mm into the head; when the head's pitch brought the ball's
     centre back inside the disc, the face contact opened at about 15 mm in one step: 68 kN, about 494 J injected,
     the striker's ball sent up at 13 m/s and the croqueted ball off at 17.4 m/s. The pass roll rode through both
     balls with no force at all.
   - **The relaxed AC check.** The feed-forward was the full m·a whatever the grip's tension (γ = 0.1), so the check's
     ≈ −298 N overpowered the relaxed coupling's ≈ +60 N and drove the head backwards; the braking test's turf
     impulse came out −0.221 N·s.
   - **The coupling search** gave T = 0.077 s at the 5 % criterion; the user kept 0.08 s (4.80 %). Under the two-hand
     model the criterion no longer constrains T.
   - **Prototype passes** (branch `proto-two-hands`, a reference, never merged). Pass 1: two hands on a rigid shaft,
     the whole head as a ball collider and the re-entry guard; position springs after contact injected energy.
     Pass 2: the arm mass, velocity tracking from contact, the dip fed forward in full and the 30 ms look-ahead.
     Pass 3: the free pendulum, the hands' reach and the bottom hand's rate guide. Pass 4: Riches' carry mode for the
     rolls; adopted. Pass 5: a firm off-aim roll grip with a gated reach end; not adopted, as it broke the half roll
     and fixed neither steep roll.
   - **Prototype ratios** (pass 4, T = 0.08 s, 3 m/s): drive 3.33, AC stop 6.55 (with a 14 mm dip), GC stop 6.60
     (as a croquet stroke, a setup since retired), half roll 2.83 (2.75–2.88 over 2–4 m/s; 2.03 at T = 0.04 s), full
     roll 2.14, pass roll 1.59 (1.26 at 2 m/s) at a reach of 0.30 m.
   - **The AC stop's dip.** Pass 4's 14 mm drove the head 2.86 mm into the turf, past `HEAD_DEEP_LIMIT`; the user set
     it to about 11 mm, confirmed by the second pre-flight.
   - **The second pre-flight (2026-10-06)** led to seven user decisions (the spec's 2026-10-06 amendment; four are
     recorded under "P2b.2 decisions" above): the GC stop is a single-ball stroke over a gap; the late re-hit is
     counted here and integrated in P2b.2b.3; a check brakes the head to rest, not past it; the AC stop is told from
     the drive by its coaching ratio; the timing sweep prints both balls' distances; P2b.2b.3 is the whole swing; and
     P2b.2b.2 calibrates the stroke shape before P2b.2b.3 sweeps it.

   ## P2b.2b.1 outcomes carried forward (for P2b.2b.2)

   Measured by `scripts/swingProbe.ts` (node <the `node --version` output>). Observations, not gates.

   - **Ratios** (`ratios`; croqueted ÷ striker distance against the coaching ranges): <for each croquet preset, the
     3 m/s ratio and its range, then the 2–4 m/s figures>.
   - **The GC stop** (`gc`; a single-ball stroke, its target 0.3 m ahead): <on the canonical setup over 2–4 m/s, where
     the touch came and the striker's and the target's distances after it with their ratio (target over striker);
     then, per gap from 0.05 to 1 m, the same for `stop-gc` and `single-ball`>. Observations; P2b.2b.2 calibrates.
   - **The late re-hit** (`rehit`, and `gc` per gap; the real head at the impact's end, moved on by the planned
     path's displacement and rotation): <the runs whose real head overlaps a ball at the impact's end; per preset,
     the canonical setup's first crossing or none and the preset sweep's runs that cross; per gap, the crossings of
     `stop-gc` and `single-ball`; the head's and the shaft's crossings with the uprights, the crowns and the peg, per
     preset and in the two strokes through hoop 1>. A known limit of every shot here: phase 2 moves the balls with no
     mallet in it, and within the impact the head never meets a hoop or the peg. P2b.2b.3 integrates the whole
     swing.
   - **Canonical setups** (`canonical`; exit criterion 4): <the entry jumps (all 0), the highest ball centre above R
     per preset, the head regions touched, the release, the hands' and turf's braking impulses, the length after
     contactAt and the flags>.
   - **Cap and flags** (`presets`): <per preset, the runs and rejections, the runs raising each flag, and the longest
     impact after contactAt that ended before the cap>. `TRACK_IMPACT_CAP` is <TRACK_IMPACT_CAP as the `presets`
     lines print it> ms.
   - **The AC stop's dip** (`dip`): <the profile's handDrop, the depths meeting both conditions, and at the profile's
     depth the penetration, when the face interval ends and the turf interval starts, and the turf's braking>.
   - **Coupling** (`coupling`; T = 0.04 s against 0.08 s): <per preset, the ratio and hits at each period, the hands'
     share of every ball's momentum change, and the rolls' lag at the hands' window's end>. T moves the ratios;
     P2b.2b.2 fits it.
   - **Effective mass** (`mass`): <the drive's closed form and its strike measure over every ball, and the other
     presets' closed forms>.
   - **Tracking** at `HAND_COUPLING` with no ball and no turf (`tracking`): <per preset and phase, the socket and
     angle errors; the swing mode's residual after contact outside a check>.
   - **Cost** (for P5; `cost`): <tracked and force-table steps and µs/step>. The reach filter over the 0.51 s impact:
     <the reach-filter line>.
   - **Timing** (`timings`; the user's account: every action is timed, and mistimed, by the player): <from how early
     each action puts the lawn before the ball or misses it, the dig and slide, the striker's ball's speed and launch
     angle against on time, both balls' distances and the coaching ratio (which timings make a better stop shot),
     and the AC stop's dip ×0–2>. For the user's review of the timing model and P2b.2b.2.
   - **Known misses.** The full roll (about 1 in coaching) and the pass roll (below 1) carry the striker's ball on a
     steep face; their ratios above need the low-speed face–ball law and the turf's response under load.
   - **Deferred to P2b.2b.2.** The whole stroke shape, the backswing from its top, the lead-in and the
     follow-through, with its amplitude, calibrated per shot type, its path giving the head's and the shaft's poses
     along the whole swing for P2b.2b.3; sourced swing defaults per preset; the face–ball and ball–ball contact-time
     fit; the hand coupling's T and ζ, `armMass`, `reachSlack` and the grips fitted to the ratios; the stop-shot and
     drive ratio calibration and held-out validation (rolls, pass roll, stop → pass-roll ordering, pull, stop-shot
     lift); the steep rolls' calibration; the GC stop's distances after the touch; the low-speed face–ball law (a
     roll is a 30–60 ms carry, not a collision, and the modelled striker's ball chatters on the face); the turf's
     response under load; the crush-calibration decision; 29.1.6.3 with a sourced contact-time norm; head–turf
     stiffness and friction sourcing, and whether turf drag needs a ploughing term; the end-weighted head; face
     presets beyond wood.
   - **Deferred to P2b.2b.3** (after P2b.2b.2): the whole swing, backswing from its top, lead-in and
     follow-through, its head and shaft against every ball, the uprights, the crowns and the peg, integrated and
     judged (29.1.6.1, 29.1.6.2, 29.1.11, 29.1.10); it sources two reference gaps, the shaft's diameter (not in
     `mallet.json`) and the peg's height (Law 5.1 is not in `court.json`). **Deferred to a GC-rules phase:** the Golf
     Croquet Rules' faults and remedies; a GC stroke is judged as an AC single-ball stroke until then.
   - **Model limits.**
     - The late re-hit: a ball that comes back into the follow-through after the impact has ended is not struck
       again (counted above).
     - Within the impact the head meets the balls and the turf only, never a hoop or the peg, and the shaft meets
       nothing: 29.1.11 is judged there, 29.1.10 never.
     - The end rule's look-ahead watches the front face only, so on 6 pass-roll runs of the preset sweep the head
       meets the striker's ball 0.1 ms after the impact ends, on its rim in 3 and its barrel in 3. P2b.2b.3's
       re-opening of the impact covers it.
     - A level head on the turf rests on a point that jumps between its end rims, which gives a bounded chatter.
     - The turf is a plane under the head: no divot, no lasting dent, no change to the lawn for phase 2.
     - A swing is simulated only from its earliest action; an on-time low swing's dig is reported as the approach
       clearance, not simulated.
     - The bottom hand's position is not an input: each preset sets the shaft's lean and the hands' share directly
       until the articulated body. Casting versus planted swings belong to P4.
     - The head–turf stiffness, restitution and friction are the ball's.
     - The default shaft (36 in) and top hand (35 in) and the hand positions (Riches) are sourced; the grips, gains,
       reaches, arm mass and reach slack are the prototype's calibration.
   - **Public.** `simulateShot`, `simulateImpact` and `judgeFaults` are exported from `src/engine/index.ts`
     (`ENGINE_VERSION` 0.6.0).
   ```

Check the roadmap's new prose, each as its own command:

- `env LC_ALL=en_GB.UTF-8 grep -nE "^.{121,}$" docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md` lists
  only the table rows, which are single lines by markdown table syntax (the P1–P5 rows already are);
- `grep -n "<" docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md` shows only the Riches link's angle
  brackets;
- `grep -n "P2b.2b.3" docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md` shows the new phase in the P2
  row and in the sections added above;
- `grep -n "GC-rules" docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md` shows the deferred GC rules.

- [ ] **Step 4: Format and check**

Run `npx prettier --write scripts/swingProbe.ts`. `.prettierignore` lists `docs/`, so the roadmap is wrapped by hand.

Run, each as its own command:

- `npm test`: passes (the probe is not a test).
- `npm run lint`: passes.
- `npm run check`: passes; `scripts/**` is type-checked.
- `npm run format:check`: passes.

- [ ] **Step 5: Commit**

Write the message with the Write tool to `<CLAUDE_TEMP_DIR>/msg.txt` (the literal session temp path):

```text
Add the swing probe and record the P2b.2b.1 outcomes

scripts/swingProbe.ts measures spec §9 on the canonical setups: the
ratios at 2–4 m/s, the GC stop's distances after the touch over the
gap, entry jumps, ball heights, head regions, release, braking
impulses, impact lengths after contact and flags, the AC stop's dip
depth, T = 0.04 s against 0.08 s, the effective mass, tracking per
phase, cost and the reach filter's headroom, the timing sweep, and the
late re-hit's crossings.

The roadmap gains the two-hand amendment, the GC stop and late re-hit
decisions, P2b.2b.3 and the deferred GC rules, the P2b.2b.1
pre-flight outcomes and the outcomes carried forward to P2b.2b.2, and
marks P2b.2b.1's exit criteria met.
```

Then, each as its own command, with the sandbox disabled for the commit (SSH signing):

```bash
git add scripts/swingProbe.ts docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md
git commit -F <CLAUDE_TEMP_DIR>/msg.txt
git log -1 "--format=%G? %h"
```

Expected: `G` and the new commit's hash.
## P2b.2b.1 outcomes carried forward (for P2b.2b.2)

What P2b.2b.1 leaves for the calibration plan (spec §10; decision record of 2026-10-05). The measured figures are
Task 12's, in the roadmap's "P2b.2b.1 outcomes carried forward (for P2b.2b.2)"; the prototype figures below are pass
4's (`aeadd4c`, T = 0.08 s) unless stated, and the probe re-measures them.

- **Known misses.** The full and pass rolls (lean 45° and 48°) carry the striker's ball on a steep face, which needs
  the low-speed face–ball law and the turf's response under load. The user accepted them as misses in this phase.
  - Full roll: about 2.1 against a coaching ratio of about 1 (2.14 at 3 m/s; 1.73 at 2 m/s). At 4 m/s with the 0.30 m
    reach the prototype's ratio was 52.5: the reach ran out with the striker's ball still on the face (2.04 with a
    0.45 m reach).
  - Pass roll: 1.59 at 3 m/s and 1.26 at 2 m/s against below 1, at the adopted 0.30 m reach. A 0.2 m reach traps the
    striker's ball against the face (16.9).
- **Calibration targets.** The stop shot and the drive are calibration targets; the rolls, the pass roll, the stop →
  pass-roll ordering, pull and stop-shot lift are held-out validation (roadmap, "P2b.2 decisions"). The AC stop is
  now the one croquet stop, so the croquet stop-shot ratios can only calibrate it; it rises 4°, so stop-shot lift
  can be expected of it. The GC stop is a single-ball stroke over a gap (user decision, 2026-10-06): its distances
  after the touch (Task 12 `gc`) are calibrated on their own, against observed play.
- **Fits.** The face–ball and ball–ball contact times, once, inside their sourced bounds. The hand coupling's T and ζ,
  `armMass`, `reachSlack` and the grips, fitted to the ratios. T moves them: the half roll is 2.83 at 0.08 s and 2.03
  at 0.04 s, the drive 3.33 and 2.35 (prototype, the spec's presets); the AC stop barely moves.
- **The stroke shape** (user decision, 2026-10-06). P2b.2b.2 first models the whole stroke shape, the backswing from
  its top, the lead-in and the follow-through, with its amplitude, and calibrates it per shot type. Its path model
  must give the head's and the shaft's poses along the whole swing, complete enough for P2b.2b.3. This phase's path
  starts at most 60 ms before contact (`MAX_LEAD`) and has no backswing.
- **After P2b.2b.2: P2b.2b.3, the whole swing** (user decisions, 2026-10-06; first placed before P2b.2b.2 as
  P2b.2b.1b). A ball that comes back into the follow-through's arc after the impact has ended is not struck again
  here, and the head never meets a hoop or the peg; Task 12 `rehit` and `gc` count how often the follow-through, the
  real head moved on by the planned path, would cross a ball, and its head or shaft an upright, a crown or the peg.
  P2b.2b.3 sweeps the head and the shaft along the whole swing P2b.2b.2 calibrates (the backswing from its top, the
  lead-in and the follow-through) against every ball, the uprights, the crowns and the peg, and re-opens the impact
  integrator on any crossing so the contact is integrated and judged (29.1.6.1, 29.1.6.2, 29.1.11, 29.1.10).
  Variability of swing and aim, and conditions such as wind, are deferred beyond P2b.
- **A GC-rules phase.** The Golf Croquet Rules' faults and remedies; until then a GC stroke is judged as an AC
  single-ball stroke.
- **Sourcing.** The swing defaults per preset (stance, gains, windows, reaches; the hand positions and leans are
  Riches'); head–turf stiffness, restitution and friction, which are the ball's, and whether turf drag needs a
  ploughing term; the end-weighted head with a sourced inertia factor; face presets beyond wood.
- **Laws.** The crush-calibration decision (roadmap, "Open decision: crush calibration"); 29.1.6.3 with a sourced
  contact-time norm.
- **The low-speed face–ball law.** Restitution falling towards inelastic at low closing speed: a roll is a 30–60 ms
  carry, not a collision, and the modelled striker's ball chatters on the face (5 hits in the half roll, 6 in the full
  and pass rolls, prototype).
- **The turf's response under load.** The non-linear yield and rebound of the lawn under a pressing face, so that the
  ball rolls out forward with topspin.
- **Observations to confirm or revise.**
  - The canonical drive's follow-through catches the striker's ball again about 92 ms after contact: after the
    strike the bottom hand's rate guide steers the head back towards the planned (unstruck) arc and restores the
    speed it lost (+4.05 N·s along aim between the hits, the top hand −3.06 N·s). The user kept that model and set
    `TRACK_IMPACT_CAP` to 0.45 s so every re-hit is integrated: the drive ends by itself 181.4 ms after contact
    (planning). Whether the guide should track the planned arc after a strike is P2b.2b.2's question.
  - How hard the bottom hand pushes after the hit, `guideEffort`, is the player's choice (user's account,
    2026-10-06); every preset's default is 1. The player's restoration is not immediate in practice: psychological,
    physical and mechanical delays lie between intent and what is observed, and the light guide's restoration over
    about 90 ms stands in for them (user, 2026-10-06). P2b.2b.2 sets the per-type defaults and calibrates how quickly
    the guide acts against observed strokes (maintained contact, a double tap or a late re-hit). At 0 the 2–4 m/s
    canonical drive strikes once and its ratio is 5.63–6.05, a stop's (6–10); at 1 it is 2.49–3.47 (planning). So
    the effort is what separates a drive from a stop-like shot, which P2b.2b.2 weighs when it sets the defaults.
  - The bottom hand's release by reach opened only in the drive's follow-through (110 ms after contact, prototype);
    it is the user's mechanism and stays, but nearly never acts within an impact.
  - The AC stop's highest ball centre is 4.17 mm above R against exit criterion 4's 5 mm (prototype), the closest of
    the canonical setups.
- **Beyond P2b** (roadmap P2 row; not P2b.2b.2's): 29.1.10 with mallet–obstacle contact; divots and lasting turf
  damage; the articulated body (shoulder, elbow and wrist), with the bottom hand's position as the input from which
  the shaft's lean and the push–swing balance follow; three- and four-ball cannons. Casting versus planted swings, and
  how much of the set-up a weaker shot uses, are P4's.

## Self-review against the spec

| Spec | Where |
|---|---|
| §1 exit criterion 1 (§8.1 cases) | Tasks 3–10 (below) |
| §1 exit criterion 2 (bit-identity) | Task 1 baseline; `cmp` after Tasks 1, 4, 5, 6, 7; shotMix and `SLOW_TESTS` in Task 11 |
| §1 exit criterion 3 (effective mass) | `effectiveMass` (Task 3); the strike measure over every ball (Task 10) |
| §1 exit criterion 4 (canonical runs) | Task 10 ("runs the %s canonical setup…"); flags and ratios recorded by Task 12 |
| §1 exit criterion 5 (exports, 0.6.0) | Task 11 |
| §3.1 types | Task 3 (`SwingArc`, `Dip`, `Coupling`, `Hands`, `TrackDrive`, `StrokeMode`); Task 5 (the union) |
| §3.2 path: windows, modes, free pendulum, carry hold, reach, carry descent, dip | Task 3 |
| §3.3 swung body, gains, feed-forward split, before and from contact, rate guide and `guideEffort`, check, carry, release | Tasks 3 (swung body, gains, `Hands.guideEffort`) and 4 (`handLoad`, `stepSwung`, release, the effort's test) |
| §3.4 coupling and the effective-mass criterion | Task 2 (`HAND_COUPLING` data), Task 3 (`effectiveMass`), Task 10 (the test) |
| §3.5 end rule, `LOOK_AHEAD`, `TRACK_IMPACT_CAP` | Task 4 |
| §3.6 validation | Task 5 (every check one rejection case, `guideEffort` included); Task 6 (the turf under the head) |
| §3.7 probe: hand forces, `headTurf`, `release`, `headRegions`, `entryJumps`, the braking impulses | Tasks 4, 6, 7; impulses in Task 10's helpers and Task 12 |
| §4.1–4.4 head–turf pair, flags, records | Task 6 |
| §4.5 whole-head contact, regions, `impact-off-face`, re-entry guard | Task 7 |
| §5.1–5.3 swing types, derivation, approach, rejections | Task 8 (`guideEffort`: the preset's and the shot's, copied and rejected outside [0, 1]) |
| §5.4 default profile | Task 8 (`profile.ts`, every value's source comment) |
| §5.5 canonical setups and clearances | Task 8 (`canonicalSetup` with the GC stop's target and `targetGap`, `CANONICAL_CLEARANCE`, approaches); Task 10 (the GC stop's context) |
| §6 `simulateShot`, setup checks, `strokeContext`, 29.1.13, 29.1.14, exports | Tasks 9, 10, 11 |
| §7 reference data | Task 2 |
| §8.1 every bullet, including all eight mechanisms ("No extra push" among them) | Tasks 3–10 |
| §9 pre-flight measurements | Task 12 (`swingProbe.ts`, one section each; the GC stop's distances and gap sweep in `gc`, the late re-hit in `rehit`); the Pre-flight table |
| §10 deferred: P2b.2b.3 and the GC-rules phase | Task 12 Step 3 (the roadmap's P2 row and outcomes) |
| §11 roadmap changes | Task 12 Step 3 |

Placeholder scan: no "TBD", "TODO" or "similar to Task N"; every code step carries its code. Type consistency: the
contract's names (`PreparedTrack`, `GripState`, `handLoad`, `HandLoad.torque` about the head's centre, `trackDrive`,
`levelArc`, `onArc`, `canonicalSetup(type, { world?, stroke?, stance?, drive?, targetGap? })`) are used as defined in
the task that produces them.

**Sequential dry run (while planning).** Every task was applied literally, in order, to a scratch copy of `main`
(eb5c332), its RED step compared and its checks run: green at every task, 763 passed and 2 skipped at the end
(`SLOW_TESTS=1`: 765), the digest `cmp`-identical after Tasks 1, 4, 5, 6, 7 and 11, shotMix exact. Task 12's probe ran
all nine sections and reproduced its prototype reference except the reach filter's drift, 1.74e-12 m (575× inside
`WAKE_MARGIN`) against the prototype's 2.1e-14 m. The run found the canonical drive held to the 0.15 s cap by the
look-ahead (the free pendulum's unstruck v_path predicted a catch on every step); the user raised `TRACK_IMPACT_CAP`
to 0.45 s and `FREE_SPAN` to 0.55 s, and the suite, the digest `cmp` and the probe were re-run on that code: the
same counts pass, the digest is unchanged, and Task 12 Step 2's reference carries the changed figures. This is not
the pre-flight: pre-flight still runs the plan from the PR's head and measures spec §9. With its findings folded in,
the suite ends at 775 passed and 2 skipped (`SLOW_TESTS=1`: 777).

The re-contact test is a straight croquet drive (Task 4), not the spec's split: a straight drive is the clearest case
of a striker's ball leaving slower than the head, as in the first plan.
