# Hands from lean, and the viewer's full-range inputs: implementation plan

**Goal:** the viewer's inputs over the whole playable range, replayed from the first frame on every change, with a
plumb line and foot marker; then the hands placed by one law of lean (and a fist), the head-touch fault, the rolls
measured at a gate, and the envelope re-run for all six types.

**Spec:** `docs/superpowers/specs/2026-11-12-hands-from-lean-design.md` (reviewed; §9). Executed natively, task by
task; one fresh review of each PR's branch before it merges.

**Branches:** Task 0 `housekeeping-2026-11-12`; Tasks 1–3 `viewer-full-range` (PR 1); Tasks 4–8 `hands-from-lean`
(PR 2), from `main` after PR 1. The design documents on `roll-hands` merge with PR 1.

## Global constraints

- UK English; 4 spaces; 120 columns; a doc comment on exported APIs, elsewhere only a non-obvious why.
- Every new number sourced or labelled a placeholder with its ruling (spec §2).
- A miss is recorded, never fitted away (spec §4). No drive, window or hold retuned to a ratio.
- Results come in the tasks' own runs; no side probes.
- "The checks": `npm run format:check`, `npm run lint`, `npx tsc --noEmit`, `npm run check`, `npm test`, `npm run
  build`, all green before each commit that touches code.

## Review focus

1. No extras given → bit-identical play: `tests/lab/playPin.test.ts` unchanged in PR 1 (Task 1).
2. A slider at either end of its range plans or shows the planner's message; it never throws in the UI (Task 2).
3. A Run in flight when an input moves: its result must not overwrite the replayed plan (Task 2).
4. The law at exactly 0°, 24° and 31° gives the anchors to 1e-12, and is continuous either side (Task 4).
5. A custom profile without `followsLean` plays exactly as before (Task 5: `tests/engine/support/shot.ts`'s profile
   pins unchanged).

---

### Task 0: Housekeeping (own PR, first)

- [ ] `npm outdated`; bump to the latest GA, TypeScript 7 excepted (memory: deferred). The checks; PR; merge.

### Task 1: The extras' route (PR 1)

**Files:** `src/lab/play.ts` (`StrokeExtras`, `mapSetup`, `playJudged`), `src/lab/frames.ts` (`playFrames`),
`src/viewer/plannedPath.ts`, `src/viewer/worker.ts`, `src/viewer/runner.ts`, `tests/lab/extras.test.ts` (new).

**Interfaces:** `export interface StrokeExtras { readonly gripTension?: number; readonly bottomGrip?: number; readonly
followThrough?: number; readonly fist?: boolean }` in `play.ts`; each function above gains `extras: StrokeExtras =
{}` as its last parameter; `mapSetup` writes `gripTension`/`bottomGrip` into `stroke.grip` and `followThrough` into
`stroke.followThrough` when given (`fist` is carried and ignored until Task 5).

- [ ] Test `extras.test.ts`: `mapSetup` with `{}` deep-equals without; with `{ bottomGrip: 0.5, followThrough: 0.05 }`
      the setup's `stroke.grip.bottomGrip` is 0.5 and `stroke.followThrough` 0.05; a half-roll `playFrames` with
      `{ followThrough: 0 }` differs from the default in its follow-through frames only after `impactEnd`. Fails.
- [ ] Implement; thread through the worker's message and `runPlay`. `playPin` unchanged.
- [ ] The checks; commit "Carry the viewer's extra inputs to the play beside the map's plan".

### Task 2: Full-range inputs and replay (PR 1)

**Files:** `src/viewer/spans.ts`, `src/viewer/Inputs.svelte`, `src/viewer/Grip.svelte`, `src/viewer/grip.ts`,
`src/viewer/App.svelte`, `src/viewer/Badges.svelte`, `tests/viewer/screen.test.ts`.

**Interfaces:** `playableSpans(tables: readonly BandTable[]): Record<Input, Span>` (spec §5.1's rules: lean least of
all axes to π/4; feet and handReach least to most of all axes; drive −1 to 1; window 1e-3 to 0.1), ticks the picked
type's graded values; `EXTRA_SPANS` for γ_T, g_B (0.05–1, step 0.05) and follow-through (0–0.3 s);
`offGrid(type, plan, extras): boolean` for the badge.

- [ ] Tests in `screen.test.ts`: `playableSpans` over the six tables gives lean least = the minimum of every lean axis
      value and most = π/4, drive [−1, 1], window [0.001, 0.1]; `offGrid` false for a type's default with `{}`, true
      with `{ bottomGrip: 0.5 }` or a lean outside the type's graded span. Fail.
- [ ] Implement. Sliders start at the picked type's default (the extras' defaults from the profile's type values);
      `clampTo` no longer clamps to the type's span. The Grip panel's Looser/Firmer bounds become [0, 1].
- [ ] Reset and replay: any input change discards the Run's frames, sets time to its first frame and plays the planned
      path; a Run's result whose inputs no longer match the current ones is dropped (Review focus 3). A rejected set-up
      shows the planner's message.
- [ ] Badge "not swept for <type>" where `offGrid`.
- [ ] The checks; commit "Let every input span the playable range and replay the swing on any change".

### Task 3: Plumb line and foot marker; PR 1

**Files:** `src/viewer/draw.ts`, `src/viewer/SideOn.svelte`, `tests/viewer/screen.test.ts`.

- [ ] Test `plumbOf(frame, start)`: returns the top hand's x and its distance ahead of the ball's centre; `footOf(path)`
      the arc's lowest point's x at address. Fails; implement; draw dotted plumb and marker with labels (spec §5.5).
- [ ] Smoke test in the browser pane: each type's default at its range, a slider at each end, a Run then a slider move;
      timings and screenshots into `docs/superpowers/probes/2026-11-12-viewer-full-range.txt`.
- [ ] The checks; commit; fresh review of the branch (`code-review-suite:pre-review`); PR (with the design docs);
      merge.

### Task 4: The law (PR 2)

**Files:** `src/engine/swing/profile.ts` (`RING_HEIGHT`, `FINGER_REACH`, `HANDLE_CAP`, `FIST`, `handsForLean`),
`tests/engine/swing/handsForLean.test.ts` (new).

**Interfaces:** `handsForLean(lean: number, mallet: MalletSpec, fist: boolean): { top: number; bottom: number }`;
`blend(u: number): number` on [0, 1], linear (spec §2 assumption 3, a placeholder), the only place the path between
anchors is shaped. The midpoint tests below assert `blend(0.5)`'s value, not 0.5, so a new curve changes one function.

- [ ] Tests: on the reference mallet, lean −0.1 and 0 → (0.805, 0.805 − HAND_BREADTH); 24° → (0.805, 0.4572); 31° and
      40° → (0.144 + GAP, 0.144) with GAP = 0.805 − 0.4572; 12° → top 0.805, bottom the midpoint of 0.717 and 0.4572;
      27.5° → both hands at the midpoints; `fist` lowers both by `FINGER_REACH` at 31° (bottom 0.069); on a 0.762 m
      shaft the handle is 0.762 − HANDLE_CAP. Continuity at each anchor to 1e-9. Fail; implement; pass; commit.

### Task 5: The resolver and the fault (PR 2)

**Files:** `src/engine/swing/types.ts` (`SwingStance.followsLean?`, `stroke.fist?`), `src/engine/swing/buildContact.ts`
(`handsOf` replacing `gripOf`; the Law 29.1.1 check), `reference/laws.json` (`"29.1.1"`), `src/engine/swing/profile.ts`
(the map types' stances `followsLean: true`, their hands from the law), `src/lab/play.ts` (`textBook`, the body
limit), `src/lab/canonical.ts`, `scripts/ratioFit.ts`, `scripts/followThrough.ts`, `src/lab/play.ts` `StrokeExtras.fist`
→ `stroke.fist`, `tests/engine/swing/buildContact.test.ts`.

- [ ] Tests: `handsOf` takes the law for a following stance and a lean, field by field (a shot's `grip.bottom` alone
      keeps the law's top); a stance without `followsLean` keeps its typed hands; `stroke.fist` lowers the hands;
      a bottom hand with its lower edge 1 mm below the socket throws naming `Law 29.1.1` and `stroke.grip.bottom`,
      1 mm above plans; `bottom` 0 still says "must lie in". Fail.
- [ ] Implement; every direct `stance.top`/`stance.bottom` read listed above goes through `handsOf` (a grep for
      `stance.top` and `stance.bottom` outside `buildContact.ts` finds none but tests of custom stances).
- [ ] The checks, with the pins of the moved types failing as expected (next task); commit "Place the hands by the
      lean, and reject a hand on the head (Law 29.1.1)".

### Task 6: Measured, re-pinned (PR 2; gate)

- [ ] Re-derive every type's default backswing at 3 m/s (`scripts/fitStrokeShape.ts`) into `reference/swing.json`.
- [ ] Measure into `docs/superpowers/probes/2026-11-12-hands-from-lean.txt`, canonical power, 10 s lawn: each type's
      text-book ratio and class; the pass roll's lowest head point in its follow-through; the full roll's speed at
      intensity 1 from its body-limited top (`scripts/assistFit.ts`'s print), against 9 m/s.
- [ ] If the pass roll's head meets the turf, its follow-through shortened as ruling 18 did, recorded.
- [ ] Re-pin each failing pin of a type whose hands moved, naming this design and the old value; a pin of the drive's
      or AC stop's text book failing is a defect. `ENGINE_VERSION` 0.31.0. The checks; commit.
- [ ] **Gate:** the measurements and spec §2's assumptions to the user, one question at a time.

### Task 7: The envelope (PR 2)

- [ ] Restore `.github/workflows/push-map.yml` from `6ff648c^`, actions and runner bumped; land it on `main` by a small
      PR so it can be dispatched.
- [ ] Drop the hands term from `complexityOf` and `src/viewer/departures.ts`; `screen.test.ts`'s parity test passes.
- [ ] Dispatch stage 2 for all six types on `hands-from-lean`, then `SECTION=gripplans` and the grip stage; wait on the
      runs' own notifications.
- [ ] `SECTION=record` → `reference/derived`; `SECTION=gripfit`; the defaults' change by type and label into the
      probe file.
- [ ] Commit the record; a PR removing the workflow again.

### Task 8: The viewer's data and outcomes (PR 2)

- [ ] `env OUT=public/viewer npx --no-install tsx scripts/viewerData.ts`, within budget.
- [ ] Smoke test: each type's default, a lean swept 0–40° showing the hands slide, the fist toggled; screenshots to
      the user.
- [ ] Roadmap: "Hands from lean outcomes (2026-11-12)": the measurements, any misses, the defaults' change; carried:
      what punishes low hands, the wanted-shot-to-type question, grabbing a hand.
- [ ] The checks; fresh review of the branch; PR; merge.
