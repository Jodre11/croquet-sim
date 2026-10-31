# P2b.2b.2c.3b.1 The Level Head Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On every stroke with a push, keep the head level within the band through contact and push, by a top-hand
path learned from practice strokes, with the bottom hand holding the contact's lean and the hands carrying on up their
arc past the push length.

**Architecture:** The track (`src/engine/impact/track.ts`) gains three push-only changes: the hold no longer relaxes
and the bottom hand no longer opens; the planned slope after contact is the contact's lean; the planned pivot carries
on past `handReach` along the hands' arc and eases to rest, plus an optional sampled lift. A new engine module
`practice.ts` plays a stroke up to three times, updating the lift from the head's error until the stroke reads in the
band. The push map plays every sample through it and gains the `unpractised` class.

**Tech Stack:** TypeScript, Vitest, tsx scripts.

**Spec:** `docs/superpowers/specs/2026-10-31-p2b2b2c3b1-level-head-design.md` (and amendment A6 of
`docs/superpowers/specs/2026-10-26-p2b2b2c3-push-map-design.md`).

## Global Constraints

- Every change applies only where `track.push !== null` (`handReach` > 0). Strokes without a push play bit for bit as
  today.
- No input is added or removed; no flex law, contact law, turf law or lawn changes.
- `PRACTICE_PASSES` = 3. The finish's ease is V²/(2·`handReach`), over a further push length, V the pivot's pace along aim at the push's end.
- `ENGINE_VERSION` becomes "0.19.0" (`src/engine/simulate.ts:77`).
- Style: 4-space indent, 120 columns, the repo's doc-comment density (every exported symbol documented, citing the
  spec section); Prettier and `npm run check` clean.
- Commits signed, by explicit path: `git commit -F <file> -- <paths>`; no attribution trailers.
- Long runs under `nice -n 20`; temp files only in `/tmp/claude-9ac5334a-b67e-4d3b-af3b-5ce3d59b809f/`.

## Review Focus

1. A push stroke whose ball never departs (strikes nothing): the hold and the bottom hand behave as on any other push,
   and practice measures h₀ at `contactAt` — the band test then reads `impact-no-strike` only as the push map does.
2. A push whose plan never reaches `handReach` (`push.end` null): no finish starts, the pivot runs as today's plan, and
   the follow-through ends at the cap; nothing reads NaN.
3. A braked push (`finishKind` "check"): the finish's ease and the check's end rule agree; the check still waits for
   the hands to rest.
4. A lift sampled shorter than the next pass's follow-through: it holds its last value, and V and A are zero there.
5. An advance whose own ease ends at `handReach`: the finish starts from the total pace (plan plus advance), with no
   step in V.

Each line's test is in the owning task below.

---

### Task 1: The push holds and keeps the bottom hand on

**Files:**
- Modify: `src/engine/impact/track.ts` (`holdWeight` ~1466, `openBottom` ~1722)
- Test: `tests/engine/impact/hands.test.ts`

**Interfaces:**
- Produces: on a push, `holdWeight(track, t, grip)` returns 1 at every t; `openBottom` never sets `grip.releasedAt`.
  Without a push both behave as today.

- [ ] **Step 1: Write the failing tests** in `hands.test.ts`:
  `"a push's hold never relaxes and its bottom hand never opens"` — play today's full roll (the push map's `textBook`
  set-up at power 0.1535, as `scripts/pathTrace.ts` builds it) through `simulateStroke` with a probe; assert every
  follow and impact snapshot's hold weight is 1 (expose it on the snapshot's `hand` if it is not already) and
  `grip.releasedAt` stays null (read through the snapshot's `hand.chains.bottom` being non-null to the end).
  Review Focus 1: the same on a push set-up with the balls removed from its path.
- [ ] **Step 2: Run** `npx vitest run tests/engine/impact/hands.test.ts` — expect FAIL (the weight relaxes from the
  first departure; the bottom hand opens at the pendulum phase).
- [ ] **Step 3: Implement.** `holdWeight` returns 1 when `track.push !== null`. `openBottom` opens neither by the reach
  nor by `releasing` when `track.push !== null`; it still records `contactPitch`. Update both doc comments, citing the
  spec §2 and A6 (superseding gate round 13 ruling and P2b.2b.2c.3a A2 item 6 on a push).
- [ ] **Step 4: Run** the file — PASS; then `npx vitest run tests/engine/impact` — every test outside the push's own
  expectations passes. Tests that pin today's push behaviour (the relax, the pendulum release) are updated to the new
  rule in this task, each change named in the commit message.
- [ ] **Step 5: Commit** `src/engine/impact/track.ts` and the touched tests.

### Task 2: The contact's lean held after contact — DROPPED (2026-10-31)

Dropped after its build: holding θ(contactAt) exactly stepped the mallet's rotation to 0 at contact (spec §2). The
rolls' λ = 1 slope already holds the lean once the pulse eases; nothing is built. The steps below are kept as written.

**Files:**
- Modify: `src/engine/impact/track.ts` (`pendulumAt` ~1044, `prepareTrack` ~937)
- Test: `tests/engine/impact/track.test.ts`

**Interfaces:**
- Produces: on a push, `pathAt(track, t)` for t > `arc.contactAt` has θ = θ(contactAt), ω = α = 0. Without a push,
  today's slope.

- [ ] **Step 1: Write the failing test** `"a push holds the contact's lean"`: on today's full-roll track, θ at
  contactAt + 0.05, + 0.2 and + 0.5 s equals θ at contactAt to 1e-12, ω and α are 0; on a stop's track (no push),
  θ at contactAt + 0.05 differs from today's value by 0 (compare against the value computed before the change,
  pinned in the test as a literal).
- [ ] **Step 2: Run** `npx vitest run tests/engine/impact/track.test.ts` — FAIL.
- [ ] **Step 3: Implement.** In `prepareTrack`, on a push, record θ_c = the pendulum's θ at `contactAt`; `pendulumAt`
  returns `{theta: θ_c, omega: 0, alpha: 0}` for t > contactAt on a push. The pulse before contact is unchanged. If
  `contactAt` falls inside the pendulum's window, the window's remainder is replaced by the hold — note it in the doc
  comment (the strike's pulse ends at contact on a push).
- [ ] **Step 4: Run** the file and `npx vitest run tests/engine` — PASS (update push-shape pins as in Task 1).
- [ ] **Step 5: Commit.**

### Task 3: The finish

**Files:**
- Modify: `src/engine/impact/track.ts` (`Push`, `computePush` ~774, `carryPivot` ~816), `src/engine/impact/integrate.ts`
  (`finished` ~406)
- Test: `tests/engine/impact/track.test.ts`, `tests/engine/impact/followThrough.test.ts`

**Interfaces:**
- Produces: `Push` gains `finishSpeed: number` (V, m/s along aim at `end`), `finishDecel: number` (V²/(2·handReach))
  and `rest: number | null` (s, `end + V/decel`; null when `end` is null). `carryPivot` past `end`:
  s = handReach + V·u − ½·decel·u² until `rest`, then handReach + V²/(2·decel), on `arcHeight`'s circle.
  `finished` for a "carry": t ≥ `push.rest` (spec §5: the follow-through ends at the hands' rest); a push with
  `rest` null runs to the cap.

- [ ] **Step 1: Write the failing tests.** In `track.test.ts`: `"the hands carry on up the arc past the push"` — on
  today's full-roll track, `handsAt` along aim at `rest` is 2·handReach to 1e-9; its velocity along
  aim is continuous at `end` (left and right limits within 1e-9) and 0 from `rest`; its height past `end` rises
  (z increasing between `end` and `rest`). Review Focus 5: the same continuity on a push with an advance. Review
  Focus 2: a push whose plan never reaches `handReach` has `rest` null and `handsAt` finite to the cap.
  In `followThrough.test.ts`: `"a carry ends with its hands at rest"` — today's full roll's follow-through finishes
  without `follow-cap` and at t ≥ `push.rest`. Review Focus 3: a braked push still finishes as a check, after `rest`.
- [ ] **Step 2: Run** both files — FAIL.
- [ ] **Step 3: Implement** `computePush`'s new fields (V from the plan's pace plus the advance's at `end`), the
  finish branch in `carryPivot` (replacing the stop at once), and the carry's end rule in `finished`. The check's
  rule waits for `rest` in place of `end`. Doc comments cite spec §5.
- [ ] **Step 4: Run** `npx vitest run tests/engine` — PASS (update push-shape pins as in Task 1).
- [ ] **Step 5: Commit.**

### Task 4: The lift on the plan

**Files:**
- Modify: `src/engine/impact/types.ts` (`SwingArc`), `src/engine/impact/track.ts` (`pivotAt`)
- Create: `src/engine/impact/lift.ts`
- Test: `tests/engine/impact/lift.test.ts`

**Interfaces:**
- Produces: `export interface Lift { readonly from: number; readonly step: number; readonly values: readonly number[] }`
  (m, upward, sampled at `from + i·step`), `SwingArc.lift?: Lift`, and
  `export function liftAt(lift: Lift, t: number): Lowering` (z, v, a): 0 before `from`, Catmull–Rom (cubic Hermite,
  finite-difference slopes, end slopes 0) between samples, the last value with v = a = 0 past the last sample.
  `pivotAt` adds `liftAt` to P, V and A's vertical components on a push with a lift.

- [ ] **Step 1: Write the failing tests** `"liftAt interpolates, holds and starts at rest"`: values [0, 0.001, 0.003,
  0.002] at step 0.001 from 0.1 — z at the samples equals them; z, v continuous at 0.1015 (left/right within 1e-9);
  before 0.1 all zero; past 0.103 z = 0.002, v = a = 0 (Review Focus 4). And `"pivotAt carries the lift"`: a full-roll
  track with a constant lift of 0.01 m has `handsAt` z higher by 0.01 at contactAt + 0.05 than without.
- [ ] **Step 2: Run** `npx vitest run tests/engine/impact/lift.test.ts` — FAIL.
- [ ] **Step 3: Implement** `lift.ts` and the `pivotAt` addition; `validateImpact` (or the arc's validation) rejects a
  lift with non-finite values, a non-positive step or an empty `values`.
- [ ] **Step 4: Run** the file and `npx vitest run tests/engine` — PASS.
- [ ] **Step 5: Commit.**

### Task 5: The band in the engine

**Files:**
- Create: `src/engine/impact/band.ts`
- Modify: `scripts/pushMapRun.ts` (delete its `onPoint`, `leanOf`; import), `scripts/strokeProbe.ts` (same)
- Test: `tests/engine/impact/band.test.ts`

**Interfaces:**
- Produces: `export function onPoint(steps, striker, id, head, aim, radius): OnPoint` and its `OnPoint`,
  `OnPointStep` types, moved verbatim; and
  `export function bandMiss(run: { result: ImpactResult; follow: FollowThrough }, point: OnPoint, striker: BallId): string | null`
  — the first of spec §3's reads in the push map's order (`impact-off-face`, off point, `impact-head-deep`,
  `turf-yield`, `follow-turf-yield`, `follow-head-deep`, `impact-mallet-grounded` at or before the striker's first face
  contact), or null in the band.

- [ ] **Step 1: Write the failing test** `"bandMiss reads today's full roll as turf"`: today's full roll played as in
  Task 1's test before practice → `"follow-turf-yield"`; a half roll at its canonical power → null.
- [ ] **Step 2: Run** — FAIL (no module).
- [ ] **Step 3: Implement** the move and `bandMiss`. `runClass` in `pushMapRun.ts` keeps its own order (superhuman
  first) and reads `onPoint` from the engine.
- [ ] **Step 4: Run** `npx vitest run` — PASS, `tests/engine/pushMapRun.test.ts` included.
- [ ] **Step 5: Commit.**

### Task 6: Practice strokes

**Files:**
- Create: `src/engine/impact/practice.ts`
- Test: `tests/engine/impact/practice.test.ts`

**Interfaces:**
- Consumes: `simulateStroke`, `prepareTrack`, `headLowestPoint` (`contacts.ts:392`), `liftAt`, `onPoint`, `bandMiss`.
- Produces:
  ```ts
  export const PRACTICE_PASSES = 3;
  export interface PractisedStroke {
      readonly result: ImpactResult;
      readonly follow: FollowThrough;
      readonly point: OnPoint;
      readonly passes: number;
      /** null in the band; else the last pass's bandMiss reason. */
      readonly miss: string | null;
      readonly lift: Lift | null;
  }
  export function practiseStroke(
      contact: ContactState,
      balls: BallStates,
      world: World,
      striker: BallId,
      probeFor?: (pass: number) => ImpactProbe | undefined,
  ): PractisedStroke;
  ```
  On a contact without a push it plays once and returns `passes` 1, `lift` null.

- [ ] **Step 1: Write the failing tests.**
  - `"a stroke in the band plays once"`: the half roll at its canonical power → passes 1, lift null, miss null, and
    its result equals `simulateStroke`'s on the same inputs.
  - `"the lift follows the update rule"`: with a stub run (export an internal `nextLift(previous, error, from, step,
    window, pushEnd)` for the test), e = [0, −1, −2, −3] mm at step 0.001 from contactAt with the push's end after
    the second sample and window 0.002 → δz = −w·e before the push's end and −w·(max(e(T), 0) + min(e, 0)) after,
    T the push's end (spec §4 item 2 as amended); w the minimum-jerk ramp; held past the last sample. Added after
    review: `"the lift is continuous across the push's end"` (e > 0 at T: δz just before and after T agree).
  - `"an unconverged stroke reports its miss"`: a contact built to dig (today's full roll with the lift capped to
    zero through a test seam, or a lean that grounds the follow-through) → passes 3, miss non-null.
- [ ] **Step 2: Run** `npx vitest run tests/engine/impact/practice.test.ts` — FAIL.
- [ ] **Step 3: Implement.** Each pass wraps `probeFor(pass)` with its own probe collecting (t, `headLowestPoint`)
  on every impact step and follow sample, and the on-point steps. h₀ is the lowest point at the first step at or after
  `contactAt`. e is resampled at `FOLLOW_SAMPLE` from `contactAt` to the last sample (linear between collected points).
  The push's end time comes from `prepareTrack(drive, head, gravity).push.end`. The next pass's contact is the same
  with `drive.arc.lift` replaced. Doc comment cites spec §4.
- [ ] **Step 4: Run** the file and `npx vitest run` — PASS.
- [ ] **Step 5: Commit.**

### Task 7: The push map practises and the version moves

**Files:**
- Modify: `scripts/pushMapRun.ts` (`playJudged`, `MapClass`, `MapSample`, `runClass`), `scripts/pushMapGrid.ts`
  (`MAP_CLASSES`), `scripts/pushMap.ts` (class tallies), `src/engine/simulate.ts` (`ENGINE_VERSION` "0.19.0"),
  `scripts/pathTrace.ts` (play through `practiseStroke`; header notes the pass count)
- Test: `tests/engine/pushMapRun.test.ts`, `tests/engine/pushMapGrid.test.ts`

**Interfaces:**
- Produces: `MapClass` gains `"unpractised"` (after `"turf"` in `MAP_CLASSES`); `MapSample.passes: number`
  (`unplayed` samples 0). `runClass` returns `"unpractised"` with the practice's miss as its reason when its own class
  would be `"mishit"` or `"turf"` and `practiseStroke` reported a miss.

- [ ] **Step 1: Write the failing tests:** a played sample reports `passes` ≥ 1; `MAP_CLASSES` includes
  `"unpractised"`; a stub practised run with a miss and a turf read classes as `"unpractised"`.
- [ ] **Step 2: Run** both files — FAIL.
- [ ] **Step 3: Implement**; `playJudged` passes a `probeFor` that resets its step, time and velocity collections at
  each pass, so the sample reads the last pass. Bump `ENGINE_VERSION`.
- [ ] **Step 4: Run** `npm test`, `npm run check`, `npx prettier --check .` — all clean.
- [ ] **Step 5: Commit.**

### Task 8: Acceptance trace (stops for the user)

**Files:**
- Create: `docs/superpowers/probes/2026-10-31-path-trace-practised*.svg`, `...-practised.txt` (from
  `scripts/pathTrace.ts`, its output names suffixed `-practised`)

- [ ] **Step 1: Run** `nice -n 20 npx tsx scripts/pathTrace.ts` on A6's three cases.
- [ ] **Step 2: Check the spec's acceptance (§6):** today's full roll at its canonical power and the full roll at
  speedGain 0.5 report a pass count ≤ 3 with no miss, and after the push's end their lowest point stays ≥ h₀
  (read from the table). Record the pass counts and the pass roll's outcome in the txt's header.
- [ ] **Step 3: Commit** the probe outputs.
- [ ] **Step 4: Stop for the user** with the three SVGs, whether or not acceptance holds. If it fails, nothing is
  tuned: the trace goes to the user with the failing reads. Then the push map's Tasks 6–8 re-run (its plan), and gate
  2 resumes.
