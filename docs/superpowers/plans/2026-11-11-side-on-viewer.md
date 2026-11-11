# The side-on viewer: implementation plan

**Goal:** the app's first screen. A player picks a shot, tunes its inputs, sees the envelope's judgement, and watches
the swing and contact side on, played by the engine in the browser.

**Spec:** `docs/superpowers/specs/2026-11-11-side-on-viewer-design.md` (decisions 1–12, §1–§7). Read it with this plan.

**Architecture:** the map's play moves, unchanged in its bits, from `scripts/` into a browser-safe `src/lab/`. A
script packs the envelope's record into `public/viewer/`. The Svelte app draws on a Canvas 2D, runs the planner on
the main thread and the play and the search in a Web Worker.

**Tech stack:** TypeScript 6, Svelte 5, Vite 8, Vitest 5 (Node environment), Canvas 2D, Web Workers.

## Global constraints

- 4 spaces, 120 columns, UK English; a brief doc comment on each exported function citing the spec's section.
- `src/` imports neither `tests/` nor `scripts/`; `src/lab` and `src/viewer` read no `process.env` and import no
  `node:` module.
- No change to the engine (`src/engine/**`), its public API or `ENGINE_VERSION`; no change to `reference/derived`'s
  record files.
- The play's bits are the record's: `src/lab` keeps the map's `Math.cos` and `Math.sin` (spec §3.1).
- Checks before each commit: `npm run format:check`, `npm run lint`, `npx tsc --noEmit -p .`, `npm run check`,
  `npm test -- --testTimeout=120000`.
- Temporary files in the session's temp directory; commit by explicit path.

## Review focus

1. **A plan whose cell has an unread corner:** the badge says "unknown", never viable (spec §3.3). Tested in Task 3.
2. **A pick with no default** (the AC stop beyond 4.59 m on the 6 s lawn): the screen says so and keeps the set-up.
   Tested in Task 6.
3. **A Run started while a roll's search is running:** the worker restarts and only the newer Run's result is shown.
   Tested in Task 5.
4. **A grip stepped to that doesn't play:** the fault is shown, and no search runs (spec §2). Tested in Task 5.
5. **The pass roll's split at a set-up between grid splits:** judged by the corner rule like every axis. Tested in
   Task 3.

---

### Task 1: Pin the play

**Files:** create `tests/lab/playPin.test.ts` and its fixture `tests/lab/playPin.json`.

- [x] A one-off capture (in the temp directory, not committed) plays, on today's code, each `MAP_TYPES` text book at
  power 0.5 and its `canonicalPower`, each at the found hold and at firmness 0.5 (`playJudged(type, textBook(type),
  power, [10], hold)`), and writes each sample as JSON (`JSON.stringify` keeps every bit of a double).
- [x] The test replays the same 24 plays and expects each sample to deep-equal the fixture's. It runs against
  `scripts/pushMapRun.ts` now and against `src/lab` after Task 2. Mark it slow (the rolls' found holds take 20–25 s
  each): `{ timeout: 600_000 }`.
- [x] Checks; commit "Pin the map's play before it moves".

  *As built:* `tests/lab/pinCodec.ts` lists the plays and encodes a sample as JSON with NaN, ±Infinity and −0 tagged
  (`JSON.stringify` writes them as null and 0), and the test compares the encoded text, so equal text is equal bits.
  The fixture is 18 KB. The test takes 161 s, almost all of it the full and pass rolls' found holds (19–24 s each).
  The full suite was not re-run: the task adds only this test.

### Task 2: The play in `src/lab`

**Files:** create `src/lab/canonical.ts`, `src/lab/lawn.ts`, `src/lab/play.ts`, `src/lab/firmness.ts`,
`src/lab/index.ts`; modify `scripts/pushMapRun.ts`, `scripts/firmness.ts`, `scripts/openLawn.ts`,
`scripts/ratioFit.ts`, `scripts/setupProbe.ts`, `tests/engine/support/shot.ts`, `tests/lab/playPin.test.ts`,
`eslint.config.js`.

**Interfaces:** produces, from `src/lab/index.ts`: `MapType`, `MAP_TYPES`, `MapPlan`, `MapHold`, `MapSample`,
`textBook`, `mapSetup`, `canonicalPower`, `playJudged`, `playSample`, `searchFirmness`, `openWorld`, `labelOf`.

- [ ] Move the closure of `playJudged` and `mapSetup`, and nothing beyond it:
  - `pushMapRun.ts`'s play into `play.ts`;
  - `searchFirmness` into `firmness.ts`;
  - `openWorld` and `opened` into `lawn.ts`;
  - `travelOf` and `feetReading` with their callees;
  - from `tests/engine/support/shot.ts`, `canonicalSetup` and what it needs (`CANONICAL_STRIKER`,
    `DEFAULT_CROQUET_GAP`, `PASS_SPLIT`, `CanonicalOptions`, and the test constants it reads from `./fixtures` and
    `./impact`) into `canonical.ts`;
  - `labelOf` alone from `scripts/pushMapGrid.ts` (the viewer names a ratio's band), into `play.ts`; the grid stays a
    script (spec §3.1).
- [ ] Re-export from the old places, so the 40 files importing `tests/engine/support/shot.ts` and every script are
  unchanged but for their imports.
- [ ] Add an ESLint block for `src/lab/**` and `src/viewer/**` forbidding imports from `tests/`, `scripts/` and `node:`
  (`no-restricted-imports`).
- [ ] Point `playPin.test.ts` at `src/lab`; it passes unchanged. Run `SECTION=summary TYPE=half-roll` on a small
  shard before and after, and compare the output byte for byte.
- [ ] Checks; commit "Move the map's play into src/lab, its bits unchanged".

### Task 3: The viewer's data and its judging

**Files:** create `scripts/viewerData.ts`, `src/lab/judge.ts`, `public/viewer/*` (generated, committed),
`tests/lab/judge.test.ts`, `tests/engine/viewerData.test.ts`.

**Interfaces:** `src/lab/judge.ts` produces:
- `BandTable` (per hold: the axes' grid values, and per point band, class and power);
- `readBandTable(bytes: ArrayBuffer): BandTable`;
- `judge(table: BandTable, plan: MapPlan, range: number, lawn: number): { band: "viable" | "edgy" | "non-viable" |
  "unknown"; klass: string | null; power: number | null }`;
- `nearestGrip(plans: readonly GripPlan[], type: MapType, plan: MapPlan, power: number): GripPlan | null`.

- [ ] `viewerData.ts` (`env OUT=public/viewer npx --no-install tsx scripts/viewerData.ts`) reads the found-hold
  record CSVs, `envelope-defaults.json` and `envelope-grip.json.gz`. It writes:
  - `defaults.json`: the `found` picks only;
  - `bands-<type>.bin`: a header with the axes' values, then per point a band and class byte and a float32 power, in
    the grid's index order;
  - `grips.json`: per plan the type, inputs, power, three grips and timing losses;
  - `sources.json`: the inputs' SHA-256s.

  It fails if the total gzipped size passes 6 MB.
- [ ] Tests:
  - every record row's band, class and power read back through `readBandTable` and `judge` at its grid point equal
    the record's (power to six significant figures);
  - on a constructed table:
    - a mid-cell plan with one unplayable corner is edgy;
    - with all four unplayable, non-viable;
    - with an unread corner, unknown;
    - its power is the corners' linear mix;
    - with no corner power, `power` is null;
  - the pass roll's split at 3° is judged from 2° and 4°;
  - `nearestGrip` picks by standardised distance, skips plans without a reliable grip, and takes held-out plans as
    candidates.
- [ ] Checks; commit "Pack the envelope for the viewer and judge a set-up from it".

### Task 4: The frames

**Files:** create `src/lab/frames.ts`, `tests/lab/frames.test.ts`.

**Interfaces:** `playFrames(type: MapType, plan: MapPlan, power: number, firmness: number): FramedPlay`, where
`FramedPlay` holds the sample, the frames (as `scripts/sideOnExport.ts`'s `exportPlay` builds them: t, the head's
pose, both hands, the balls, the turf force and the face's force), the flags, the events, the slip's time and the
trajectory's release, impact end and finish.

- [ ] Port `exportPlay`'s probes and sampling.
- [ ] Test: `playFrames`'s sample deep-equals `playSample(type, plan, power, [10], firmness)` for the drive's and the
  pass roll's text books; the frames are in time order, and the impact is sampled every 0.1 ms.
- [ ] Checks; commit "Record a play's frames for the viewer".

### Task 5: The worker and the planned path

**Files:** create `src/viewer/worker.ts`, `src/viewer/runner.ts`, `src/viewer/plannedPath.ts`, `src/viewer/grip.ts`,
and their tests under `tests/viewer/`.

**Interfaces:**
- `runner.ts`: `createRunner(spawn: () => WorkerLike): Runner`, with `run(request: RunRequest): Promise<RunResult |
  "superseded">`. A newer `run` terminates the current worker and spawns a fresh one.
- `RunRequest`: `{ type, plan, power, grip: { firmness, source: "neighbour" | "player" } }`.
  - The worker plays at `firmness`.
  - If the play is not admissible and the source is "neighbour", it searches and returns that play with `searched:
    true`.
  - A "player" grip is never searched.
- `plannedPath(type, plan, power): PathSample[]`: `planStroke` and the trajectory up to contact, on the main thread.
- `grip.ts`: `stepGrip(current: number, bounds: { least: number; firmest: number }, dir: -1 | 1): number`, in
  0.0625 steps, clamped.

- [ ] Tests with a fake `WorkerLike`:
  - a second `run` resolves the first as "superseded" and terminates its worker;
  - a neighbour grip that fails searches, and a player grip that fails does not;
  - `stepGrip` clamps at the bounds.

  `plannedPath` on the drive's text book takes under 100 ms (spec §1 item 4), measured in the test and logged.
- [ ] Checks; commit "Run plays in a restartable worker and plan the path on the main thread".

### Task 6: The screen

**Files:** modify `src/App.svelte`, `src/main.ts`; create `src/viewer/*.svelte` (`ShotPicker`, `Inputs`, `Grip`,
`Badges`, `SideOn`, `TopDown`, `TimeBar`, `Readout`), `src/viewer/time.ts`, `src/viewer/spans.ts`, `src/viewer/app.css`;
tests for the pure modules.

- [ ] Shot picker:
  - the label, the range (snapped to the 16 ranges), the lawn, and the split where the label's defaults hold one;
  - it loads the pick's `viable ?? least` default from `defaults.json` and names its hold;
  - with no default, it says so and keeps the set-up (spec §2).
- [ ] Inputs (`spans.ts`: each input's span and ticks from the band table's axes), the grip with Looser and Firmer, and
  the badges (before Run: `judge`; after Run: the play's own outcome beside it; the departures; the timing risk from
  the nearest grip plan).
- [ ] The side-on canvas:
  - decisions 1, 5 and 6: the mallet drawn back over the balls, both hands on the shaft, the top hand's and the face's
    paths with angle ticks, the flags and the turf depth;
  - the planned path dotted, redrawn on every input change, and the played path after a Run.

  The top-down inset (decision 7).
- [ ] The time bar (`time.ts`: `playbackRate(t, impactStart, impactEnd)` easing to 1/50 within 20 ms of the impact;
  the scrubber, speed and the slow-down's toggle) and the readout.
- [ ] Tests:
  - `playbackRate` is 1 far from the impact and 1/50 inside it, continuous at the edges;
  - `spans` match the band table's axes;
  - the picker's lookup returns null for the AC stop at 6.35 m on the 6 s lawn.
- [ ] One theme from CSS variables. `npm run build` succeeds.
- [ ] Checks; commit "Build the side-on viewer's screen".

### Task 7: The gate

**Files:** create `docs/superpowers/probes/<date>-side-on-viewer.txt`; modify the roadmap; delete
`scripts/sideOnExport.ts` and `scripts/sideOnPage.html`.

- [ ] Smoke test with the `playwright-cli` skill on `npm run dev`: for one default of each hold, open it, Run, and
  check the readout and that the canvas drew frames. Record the steps and results in the probe file.
- [ ] Time a Run per hold in Chromium (spec §1 item 5) and record the times.
- [ ] **Stop for the user** with the screen: decisions 1–7 checked by eye (spec §1 item 3), one question at a time.
  Record the rulings in the spec as amendments.
- [ ] After the user's acceptance, delete the prototype (spec decision 10), and write the roadmap's "Side-on viewer
  outcomes" with the carried items: a continuous range (spec §7 item 2), Rust in WASM (decision 12), a dark theme.
  Run the checks, commit, push, and open the PR.
