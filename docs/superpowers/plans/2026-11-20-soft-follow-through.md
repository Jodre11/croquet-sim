# The soft follow-through: implementation plan

**Goal:** see the late hit the follow-through makes in slow rolls, then remove it the way a player does: the reach
and the finish shrink with pace, and the player brakes if that is still not enough.

**Spec:** `docs/superpowers/specs/2026-11-20-soft-follow-through-design.md`. Executed natively in this session.

## Global constraints

- **One shot model.** Nothing is scripted per stroke, and nothing is tuned to C3F.
- **The canonical strokes keep their pins to the bit** from Task 3 on. Task 2's moves are re-pinned as §2.1's.
- **Late hits are judged by the existing judges:** `impact-off-face`, 29.1.6.1 and 29.1.6.2. There is no new event.
- **An explicit `stroke.handReach`, `options.cap` or `lowPoint` is honoured as given.**
- **Public repo:** sources are cited (URL, date, SHA-256, short quotes), never mirrored.
- **Stop rules (spec §3), from Task 3 on.** Stop and report if any canonical pin moves, if a Table 6 roll's w₁/U
  moves more than 1 z away from Gugan's, or, after Task 5, if any stroke still late-hits.

## Review focus

1. **A ball still in flight at the impact's end** (the turf lift): the projection must bring it down under gravity
   and land it, not carry it upwards in a straight line. This is the baseline C3F case.
2. **A croquet stroke:** both balls are projected together, ball–ball contact included, so the croqueted ball cannot
   pass through the striker's ball.
3. **A test's explicit `options.cap`** (flatPush.test.ts, "A cap just past the re-anchor"): it is never moved.
4. **A finish pace just above 0:** the floor holds the ease at 25 ms. At V = 0 the share stays 1.
5. **A stroke whose feet set `lowPoint`,** or with an explicit `stroke.handReach`: it is not rescaled.

---

### Task 1: The late-hit survey (spec §3), run at HEAD for reference

**Files:** create `scripts/lateHitSurvey.ts`.

**Interfaces:**
- Consumes `playJudged`, `textBook`, `canonicalPower` (`src/lab/play.ts`), `ROLLS`, `powerFor`, `LAWN`
  (`scripts/table6.ts`), and `openWorld` (`scripts/openLawn.ts`).
- Produces a CLI, `npx --no-install tsx scripts/lateHitSurvey.ts --label <label>`. It writes
  `docs/superpowers/probes/late-hit/<date>-<label>.txt`.

- [x] **Write the script.** Its rows:
  - every Table 6 roll at its U on the 13 s lawn;
  - the half, full and pass roll text books at p ∈ {0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0, canonical} on lawns 6, 10
    and 14 s.

  Per row, from the kept practised run (`PlayWatch.played`):
  - the striker's face intervals by region, from `headRegions`;
  - each late hit: an interval that starts after the striker's first parting from the head and is not one of the
    strike's taps. Report its start t, its region, and, for a face one, the re-contact's gap and effect from
    `strike.recontacts`;
  - `contactSpeed`, the class with its reason, and the ratio.

  It ends with a count of late hits per type.
- [x] Run it at HEAD (04e9ca0's engine) with `--label primed-push`. This is the reference: it shows what the current
  end test sees.
- [x] Commit the script and its output, then push.

### Task 2: Mend amendment 5's catch (spec §2.1)

**Files:**
- `src/engine/impact/integrate.ts` (`catchAt`, `integrateStroke`)
- `src/engine/impact/types.ts` (`ImpactSetup`)
- `src/engine/impact/simulateImpact.ts` (`prepareImpact` or `simulateStroke`)
- `src/engine/simulate.ts` (only if an export is needed)
- tests

**Interfaces:**
- `ImpactSetup` gains `project?: (run: ImpactRun, t: number) => readonly (BallState | undefined)[]`. It gives the
  balls in setup order at time t ≥ the impact's end, carried on by phase 2 from that run's balls: handover's
  placement, then `simulateFreeMotion`, then `stateAtTime`.
- `simulateImpact.ts` builds the closure with the world, and memoises the free motion per run.
- `catchAt` uses `project` when it is present. Without it, as for force tables or a bare `integrate` call, it keeps
  the straight line.
- Check that `src/engine/simulate.ts` does not import `integrate.ts` or `simulateImpact.ts` (no import cycle;
  `npx tsc --noEmit` and lint).

- [x] **Failing tests.** They go in `tests/engine/impact/flatPush.test.ts`, as a new describe: "the follow-through
  catch, carried by phase 2 (soft follow-through design §2.1)".
  1. **Ball in flight:** the impact ends while the ball is airborne, rising. Its projected position at a later t has
     z equal to the ball radius once it has landed, not z0 + vz·t. Use a constructed run passed through the
     closure.
  2. **Rolling ball:** a rolling ball's projected along-aim travel at t equals `advance` with the lawn's rolling
     deceleration, within 1e-9 m.
  3. **C3F, a regression guard** (it already passes under law (d)): played through `playRoll` at its U on the 13 s
     lawn, the kept run raises `impact-off-face` and has a head–striker interval after 250 ms.
  4. **Explicit cap:** an explicit `options.cap` just past the re-anchor still ends the play before any catch. This
     is the existing test, unchanged.
- [x] **Cap test:** without `options.cap`, a catch at or past `contactAt + TRACK_IMPACT_CAP` is replayed once, with
  the cap at the catch plus `TRACK_IMPACT_CAP`.
- [x] **Run the tests;** expect 1, 2 and the cap test to fail.
- [x] **Implement.** `catchAt(setup, stroke)` samples `follow.samples` after `impactEnd` against `project(run, s.t)`
  with `headBallContact`. In `integrateStroke`, when `options.cap` is undefined and the catch is at or past the cap,
  replay once with the cap moved to the catch plus `TRACK_IMPACT_CAP`. After that replay, a catch at or past the new
  cap is not replayed. ENGINE_VERSION goes to 0.38.0.
- [x] **Run** `npm test`, `npx tsc --noEmit` and `npm run lint`. Each moved pin is re-pinned with a "soft
  follow-through design §2.1 (was …)" note. Regenerate `tests/lab/playPin.json` with `scripts/repinPlays.ts`.
- [x] **Run** the survey (`--label catch-seen`) and the scorecard (`--label catch-seen --compare
  2026-11-20-primed-push`).
- [x] **Register entry** "G6's late hits, seen": the survey's counts per type against Task 1's, and the card's
  families.
- [x] Commit and push.

### Task 3: The reach scales with pace (spec §2.2)

**Files:**
- `src/engine/swing/buildContact.ts`
- `src/engine/swing/profile.ts` (`REACH_REF_SPEED`)
- `src/engine/swing/types.ts` (`SwingArc.contactSpeed`)
- tests: `tests/engine/swing/buildContact.test.ts`, and a new guard in `tests/engine/pushMapRun.test.ts`

**Interfaces:**
- `SwingArc` gains `readonly contactSpeed: number`, in m/s: `buildContact`'s `poseSpeed(pose, planned)`.
- `profile.ts` exports `REACH_REF_SPEED: Readonly<Record<StrokeType, number | null>>`. It is null where the preset's
  handReach is 0.

- [ ] **Read the values.** A scratch script, not committed, prints each roll text book's `drive.arc.contactSpeed` at
  `canonicalPower(type, openWorld(10))`. Record each value rounded down to 1e-3 m/s, with a comment naming how it was
  read.
- [ ] **Failing tests.**
  1. **Canonical:** at canonical power, `arc.handReach` equals the preset's exactly, for the half, full and pass rolls.
  2. **Half speed:** at `contactSpeed` = U_ref/2 (lower power), `arc.handReach` is half the preset's, within 1e-12.
  3. **Low point:** in the same case, `arc.lowPoint` is handArcLow·(unscaled handReach), and `arc.downswing` is
     identical to the unscaled plan's.
  4. **Explicit reach:** an explicit `stroke.handReach` is not scaled.
  5. **Feet:** a set `lowPoint`, from the feet, is unchanged.
  6. **Guard,** in `pushMapRun.test.ts`: each roll's canonical `contactSpeed` is ≥ `REACH_REF_SPEED[type]` and
     < `REACH_REF_SPEED[type] + 1e-3`.
- [ ] **Implement** in `buildContact`: handReach = (stroke.handReach ?? push.handReach·min(1, contactSpeed/U_ref)),
  where U_ref is null-safe. Where `low` is undefined, set lowPoint to handArcLow·(stroke.handReach ?? push.handReach)
  from the unscaled reach. The `arrival` already uses the unscaled reach. ENGINE_VERSION goes to 0.39.0.
- [ ] **Suite, tsc and lint.** No canonical pin may move (stop rule). Other moves are re-pinned with their notes.
- [ ] **Survey** (`--label reach-scaled`) and card (`--compare <Task 2's card>`). Check the stop rules.
- [ ] **Register entry** "G6's soft follow-through: the reach". Commit and push.

### Task 4: The finish no longer stretches (spec §2.3)

**Files:** `src/engine/impact/track.ts` (`finishShare`, `FINISH_SHARE_MIN`, retire `FINISH_SHARE_MAX`), and the tests
that reference the stretch (`advance.test.ts`, `track.test.ts`, `followThrough.test.ts`; they call `finishShare`
symbolically, so only assertions that name the stretch change).

- [ ] **Failing tests** in `track.test.ts`:
  - `finishShare(8)` = 1, `finishShare(4)` = 1, `finishShare(2)` = 0.5;
  - `finishShare(0.5)` = 0.25 and `finishShare(1e-5)` = 0.25 (the floor);
  - `finishShare(0)` = 1.
- [ ] **Implement** `finishShare(V) = V > 0 ? Math.max(FINISH_SHARE_MIN, Math.min(1, V / FINISH_REF_PACE)) : 1`, with
  `FINISH_SHARE_MIN` = 0.25 documented as the spec's assumption. Update amendment 3's comments to say it is superseded
  by the soft follow-through design §2.3. ENGINE_VERSION goes to 0.40.0.
- [ ] **Suite, tsc and lint.** No canonical pin may move.
- [ ] **Survey** (`--label finish-shrunk`) and card. Check the stop rules.
- [ ] **Register entry** "G6's soft follow-through: the finish". Commit and push.

### Task 5: The brake, only if Task 4's survey leaves late hits (spec §2.4)

- [ ] If no stroke late-hits, record "no brake needed" in the register and the spec, and skip the rest of this task.
- [ ] Otherwise:
  - read U_brake per type from the survey, as the highest `contactSpeed` with a late hit;
  - stop and present the drive's fall below U_brake to the user as a choice, with the survey's figures (spec §2.4:
    its shape is chosen from the survey);
  - implement the ruling in `src/lab/play.ts` `textBook` (the player's plan), not in the engine;
  - then the suite, the survey and the card, the stop rules, the register, commit and push.

### Task 6: Close

- [ ] Add "As implemented (date)" to the spec: the values recorded, the assumptions kept, and the moves.
- [ ] Tick this plan. Update the G6 register entry's "Next" with the refit on the last card. Commit and push.
