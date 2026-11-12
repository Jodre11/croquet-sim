# The rolls' hands: implementation plan

**Goal:** the full and pass rolls played at the user's hands (top mid-shaft, bottom on the ring), the touch on the
head a planning fault, and the envelope and the viewer rebuilt for those two rolls.

**Spec:** `docs/superpowers/specs/2026-11-12-roll-hands-design.md` (reviewed; §8). Executed natively, task by task, one
fresh review of the whole branch at the end.

**Branch:** `roll-hands`. Housekeeping (Task 0) is its own branch and PR, landing first.

## Global constraints

- UK English; 4 spaces; 120 columns; a doc comment on exported APIs, elsewhere only a non-obvious why.
- Every new number is sourced or labelled a placeholder with its ruling (spec §2).
- The miss is recorded, never fitted away (spec §4's ruling). No drive, window or hold is retuned to a ratio.
- Results come in the tasks' own runs; no side probes (memory: follow the process).
- "The checks" below: `npm run format:check`, `npm run lint`, `npx tsc --noEmit`, `npm run check` (svelte-check),
  `npm test`, `npm run build`, all green before each commit that touches code.

## Review focus

1. A bottom hand placed exactly by the derivation (the pass roll's fist) must plan; the Law's check is at the socket,
   not the ring (Task 1 tests both sides).
2. A shot's `stroke.grip.bottom` below the edge must name `stroke.grip.bottom`, not the preset (Task 1).
3. The half roll, drive, stops and single ball must not move by a bit: Task 2 runs `tests/lab/playPin.test.ts` for
   those types unchanged.
4. The defaults are recomputed across all six types, so a wanted label can change type even where neither roll is
   the winner before (Task 4 diffs the defaults by type).
5. The viewer must load the rebuilt data inside its 6 MB budget (`scripts/viewerData.ts` fails above it).

---

### Task 0: Housekeeping (separate PR, first)

- [ ] `npm outdated`; bump everything to the latest GA except TypeScript 7 (memory: deferred until typescript-eslint
      supports 7.1). the checks green.
- [ ] The repository has no workflow now; the restored map workflow's actions and runner (`actions/checkout@v7`,
      `actions/setup-node@v7`, `ubuntu-26.04` at `6ff648c^`) are checked in Task 3 when it is restored.
- [ ] Branch `housekeeping-2026-11-12`, PR, merge; rebase `roll-hands` on it.

### Task 1: The fault (Law 29.1.1)

**Files:** `reference/laws.json`, `src/engine/swing/buildContact.ts` (validation, after the `(0, top)` check at
~line 373), `src/engine/swing/profile.ts` (`RING_HEIGHT`, `FINGER_REACH`), `tests/engine/swing/buildContact.test.ts`.

- [ ] Test `rejects a bottom hand touching the head (Law 29.1.1)`: a canonical full roll with `stroke.grip.bottom =
      HAND_BREADTH/2 − 0.001` throws a message containing `Law 29.1.1` and `stroke.grip.bottom`; `HAND_BREADTH/2 +
      0.001` plans. A `bottom` of 0 still throws "must lie in". Run; fails.
- [ ] Add `"29.1.1"` to `reference/laws.json` with the quote "touches the head of the mallet with a hand", its URL and
      retrieval date, in the shape of `"29.1.5"`.
- [ ] Export `RING_HEIGHT = 0.025` and `FINGER_REACH = 0.075` from `profile.ts` beside `HAND_BREADTH`, each doc comment
      naming the placeholder and the ruling (2026-11-12, "Use estimates").
- [ ] In validation: `if (bottom - HAND_BREADTH / 2 <= 0) fail(...)` with spec §3's message. `HAND_BREADTH` is imported
      from `profile.ts` only if that adds no import cycle (`profile.ts` imports `buildContact.ts`); otherwise move
      `HAND_BREADTH` to `swing/types.ts`'s neighbour `swing/body.ts` (new) and re-export it from `profile.ts`.
- [ ] Run the test file, then the checks; commit "Reject a bottom hand on the mallet's head (Law 29.1.1)".

### Task 2: The hands, measured (gate)

**Files:** `src/engine/swing/profile.ts` (the two presets and their comments), `reference/swing.json`
(`defaultBackswing` for both rolls), `src/engine/simulate.ts` (`ENGINE_VERSION` 0.31.0), the pinning tests,
`docs/superpowers/probes/2026-11-12-roll-hands.txt` (new).

- [ ] Set `full-roll` to `{ top: MALLET.shaftLength / 2, bottom: RING_HEIGHT + FINGER_REACH + HAND_BREADTH / 2, ... }`
      and `pass-roll` to `{ top: MALLET.shaftLength / 2, bottom: RING_HEIGHT + HAND_BREADTH / 2, ... }`, grips as now;
      rewrite both comments: the user's account (spec §1) the source, Riches' quotes kept as cues.
- [ ] Re-derive both rolls' default backswings with `scripts/fitStrokeShape.ts` (its 3 m/s section); write them to
      `reference/swing.json`.
- [ ] Measure into the probe file, at canonical power on the 10 s lawn: each roll's canonical ratio and class (the
      existing canonical tests' setups), the head's lowest point through the follow-through, and the full roll's
      contact speed from its body-limited top at intensity 1 (`scripts/assistFit.ts`'s print). Each against its
      reference: full roll band 1.0–1.2, pass roll 0.83, no turf contact on the pass roll, 9 m/s.
- [ ] If the pass roll's head meets the turf: shorten its follow-through as ruling 18 did, to the longest clear value
      in 0.01 s steps below 0.1 s, and record it.
- [ ] `npx vitest run`; for each failing pin of the two rolls, re-pin to the measured value with a comment naming this
      design and the old value. Any other type's pin failing is a defect: stop and find it. `tests/lab/playPin.json`
      re-pinned for the two rolls only.
- [ ] `ENGINE_VERSION` 0.31.0; the checks; commit "Play the full and pass rolls at the user's hands".
- [ ] **Gate:** the probe file's measurements to the user, one question at a time (memory: gate questions format).
      A missed band is recorded, per the spec's ruling; the gate confirms the record and the follow-through change.

### Task 3: The map re-run for the two rolls

- [ ] Restore `.github/workflows/push-map.yml` from `6ff648c^`; bump its actions and runner to the latest (Task 0's
      rule). Dispatch needs the file on `main`: a small PR "Restore the map's workflow for the rolls' re-run", merged.
- [ ] Dispatch stage 2: `gh workflow run push-map.yml --ref roll-hands -f types=full-roll,pass-roll -f stage=2`, the
      shards as the record's runs used (the maps file's header). Wait on the run's own notification, not polling.
- [ ] Fetch the four unchanged types' merged reads (`<type>.reads.json`, `<type>.fitted.reads.json`) from the
      record's runs named in `docs/superpowers/probes/2026-11-11-p2b2b2c3b-maps.txt`'s header, with `gh run download`.
      If they have expired: assumption, rebuild them from the committed CSVs with a `SECTION=reads` added to
      `pushMap.ts` (the inverse of the record's rows, `parseRecord`), tested on one type round-trip.
- [ ] `SECTION=record` over all six types' reads → `reference/derived`; `SECTION=gripplans`, then the grip stage for
      the two rolls only, and `SECTION=gripfit` over their new shards with the four others' from the record's grip run
      (the same fetch, the same fallback).
- [ ] Diff `envelope-defaults.json` by type and label (Review focus 4) into the probe file.
- [ ] Commit the record "Re-run the full and pass rolls' map at the user's hands"; a PR removing the workflow again.

### Task 4: The viewer and outcomes

- [ ] `env OUT=public/viewer npx --no-install tsx scripts/viewerData.ts`; within budget.
- [ ] Smoke test in the browser pane: a full roll and a pass roll default each played; screenshots of contact to the
      user; Run timings into the probe file.
- [ ] Roadmap: "Rolls' hands outcomes (2026-11-12)", the measurements, the misses, the defaults' change by type, and
      carried: what punishes low hands (its own design, next), the wanted-shot-to-type question.
- [ ] The checks; commit; one fresh whole-branch review (`code-review-suite:pre-review`); PR; merge.
