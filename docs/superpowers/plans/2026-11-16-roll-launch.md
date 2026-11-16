# Roll launch: implementation plan

**Goal:** the hands re-anchor to the mallet's own motion as soon as the striker's ball leaves the face, on every
tracked stroke, and the balls' friction is fitted to Gugan's C10H, so the half rolls' launches match Gugan 4 Table 6.

**Spec:** `docs/superpowers/specs/2026-11-16-roll-launch-design.md` (reviewed 2026-11-16). Executed natively, task by
task, one fresh review of the whole branch at the end (memory: no Superpowers).

**Branch:** `hands-from-lean`. Housekeeping (Task 0) is its own branch and PR, landing first.

## Global constraints

- UK English; 4 spaces; 120 columns; a doc comment on exported APIs, elsewhere only a non-obvious why.
- Gugan's figures are cited by URL and quoted only as the lawn design §6 already quotes them (memory: cite, don't
  mirror).
- Results come in the tasks' own runs; no side probes (memory: follow the process).
- Nothing is tuned to a ratio: the friction has one target (C10H's Ω₂), everything else is reported.
- "The checks": `npm run format:check`, `npm run lint`, `npx tsc --noEmit`, `npm run check`, `npm test`,
  `npm run build`, all green before each commit that touches code.

## Review focus

1. **Drives and splits.** They had no latch and no re-anchor before. A drive's hands also open their bottom hand and
   swing a free pendulum, and the re-anchor does not re-run the free pendulum's table (amendment 6). Task 2 compares
   every drive and split pin before and after, and stops if a result leaves its own design's acceptance.
2. **A flicker of contact.** A face–ball pair can reopen within a step or two. The latch needs the ball moving away,
   so a pair that reopens with the ball not moving away must not set t_r (Task 2 test).
3. **The replay.** Amendment 5 replays a caught stroke from the start with the impact held open. The re-anchor must
   fall at the same t_r in the replay as in the first play, so the two follow one path (Task 2 test).
4. **The reported `departure`.** Today it is set only on a push. From Task 2 every tracked stroke reports it, so any
   test or pin that compares a whole impact result changes. That is expected, not a defect, and is re-pinned with
   that cause.
5. **The fit's bracket.** Ω₂ may stop falling once the balls' contact sticks. Task 3 checks the bracket before it
   bisects, and stops if −35% is not inside [0.06, 0.5].

---

### Task 0: Housekeeping (separate PR, first)

- [ ] From `main`, branch `housekeeping-2026-11-16`. `npm outdated` lists eslint 10.14.0 → 10.15.0 and TypeScript
      7.0.2. Bump eslint only; TypeScript 7 stays deferred (memory). `npm install`, then the checks.
- [ ] The repository has no `.github/workflows`, so there are no actions or runners to bump; there is no IaC for
      Trivy.
- [ ] Commit "Bump eslint to 10.15.0", push, open the PR, merge it, then merge `main` into `hands-from-lean`.

### Task 1: The Table 6 probe (the baseline)

**Files:** `scripts/ratioFit.ts` (`ReadSample`, `readOut`), `scripts/table6Probe.ts` (new),
`tests/engine/ratioFit.test.ts`,
`docs/superpowers/probes/2026-11-16-roll-launch-table6.txt` (new).

- [ ] Test: `readOut`'s samples carry each ball's rolling fraction, and the hands' force along aim. On the existing
      `readOut` fixture, `roll1` at the last sample equals R·(ω₁·(ẑ × aim))/(v₁·aim) computed from the impact's
      handed-over striker's ball, to 1e-9. `hands` is 0 before relaxAt. Run it; it fails.
- [ ] `ReadSample` gains `roll1: number`, `roll2: number` (fractions, not percent) and `hands: number` (N, the
      snapshot's `hand.force` along aim, or `drive` along aim without `hand`). `readOut` fills them. Run; it passes.
- [ ] `scripts/table6Probe.ts`. For each Table 6 row, the probe:
      - finds the power whose `plannedSpeed(mapSetup(type, textBook(type), p), world)` is Gugan's U, bisecting
        below the type's top power as the session probe did;
      - calls `readOut` on that setup on `openWorld(13)`;
      - prints w₁/U, Ω₁, v₂/U and Ω₂ at the read instant beside Gugan's, the read time and `open`, and each face–ball
        and ball–ball interval from `impact.timeline` (ms);
      - prints the peak `hands` between READ_DELAY after the first face interval's end and 25 ms;
      - prints the travels L₁ and L₂ = range·ratio and their ratio from `playJudged(type, plan, power, [13],
        "preset")`, beside Gugan's;
      - takes an optional `--ball-friction μ`, which replaces the world's `ballBall.friction`, for Task 3.

      Gugan's rows are the ones the lawn design §6 quotes, with a comment citing the URL.
- [ ] Run it now, before any change, into the probe file under "== Before (2026-11-16) ==". C10H should show the
      re-strikes (face intervals beginning at about 4, 8, 13 and 18 ms) and a peak hands force of about 115 N. If it
      does not, stop: the baseline differs from the spec's §1.
- [ ] The checks; commit "Table 6 probe: the rolls read at Gugan's instant, before the restart".

### Task 2: The re-anchor at the departure, on every tracked stroke

**Files:** `src/engine/impact/integrate.ts` (the latch near line 1281, the parting near 1441, the `pushed` comment
near 1148), `src/engine/impact/track.ts` (`reanchor` near 1352 and its doc), `src/engine/impact/types.ts`
(`departure`'s doc near 498), `src/engine/simulate.ts` (`ENGINE_VERSION` 0.32.0),
`tests/engine/impact/flatPush.test.ts`, the pinning tests, `tests/lab/playPin.json`, `scripts/repinPlays.ts` (new),
the probe file.

**Interfaces:** `reanchor(track, head, state, at)` keeps its signature. Only its `track.push === null` early return
goes, so a track already anchored still returns unchanged.

- [ ] Tests in `flatPush.test.ts`'s amendment 6 block, renamed "the re-anchor at the departure (roll launch design
      §3.1)":
      - `re-anchors a stroke with no push`: a canonical drive's track, a head 40 mm behind and at 60% of pace; the
        anchor's rate is 0.6 to 1e-9.
      - `latches the departure on a stroke with no push`: a canonical drive played through `practiseStroke`; its
        result's `departure` is defined and lies within 5 ms of the first face interval's end.
      - `re-anchors at the departure, not the parting`: the C10H setup (half roll, the probe's power, 13 s lawn); the
        played track's `anchor.at` equals the result's `departure`.
      - `does not latch a pair that reopens with the ball not moving away`: a unit case on the latch. Factor the
        away test out as `departing(sb, state, normal, R): boolean` in `integrate.ts` and test it directly with a
        ball moving with the face and with a ball moving away from it.
      - `re-anchors a replay at the same instant`: a stroke that amendment 5 replays (the probe's C10H, if its catch
        remains; else the existing full roll at power 1, hold 0.5) gives the same `anchor.at` in both plays.

      Run them; they fail.
- [ ] `integrate.ts`:
      - the latch drops its `pushed &&`, using `departing`;
      - in the step that latches, `played = reanchor(played, head, state, t)` when `played !== null`;
      - the parting's `reanchor` call goes, and its comment moves to the latch;
      - the `pushed` comment now says the latch is for every tracked stroke and only the resistance sensing is
        push-only.

      `track.ts`: `reanchor`'s push gate goes, and its doc says it re-anchors at the departure on every tracked
      stroke (roll launch design §3.1). `types.ts`: `departure`'s doc drops "A push's".
- [ ] Run the new tests; they pass. Then `npx vitest run --reporter=json --outputFile=$CLAUDE_TEMP_DIR/t2.json` and
      list every failure.
- [ ] Gate (spec §4). Run the probe into the probe file under "== After the re-anchor ==".
      - **C10H:** the peak hands force after the departure stays below 60 N (my threshold, about half the baseline's
        80–115 N), and no face interval begins after 15 ms.
      - **If C10H's head still catches the ball within 15 ms:** stop and report to the user before Task 3.
      - **Full and pass rolls:** reported only, whether each still has one unbroken first face interval.
- [ ] Re-pin, each moved value with a comment naming this design and its old value. Drive and split pins are compared
      against their own designs' acceptance: a drive or split result outside it stops the plan for the user.
      `scripts/repinPlays.ts` regenerates `tests/lab/playPin.json`: `pinnedPlays()` mapped through `playPinned` and
      `encodePinned`, written in the file's existing shape.
- [ ] `ENGINE_VERSION` 0.32.0; the checks; commit "Re-anchor the hands at the ball's departure, on every tracked
      stroke".

### Task 3: The balls' friction, fitted to C10H

**Files:** `scripts/table6Probe.ts` (the fit section), `reference/friction.json` (`ballBallFriction`), the pinning
tests, `tests/lab/playPin.json`, `src/engine/simulate.ts` (`ENGINE_VERSION` 0.33.0), the probe file.

- [ ] Add the fit to the probe (`--fit`):
      - read C10H's Ω₂ at the read instant at μ 0.06 and 0.5. If −0.35 does not lie between the two, print both and
        stop (spec §3.2);
      - otherwise bisect μ to 0.005 and print it with its Ω₂ and v₂/U.

      Run it into the probe file under "== The fit ==".
- [ ] `reference/friction.json`'s `ballBallFriction`:
      - `value` the fit, rounded to 0.005; `provenance` "derived"; bounds unchanged;
      - `source`: Gugan 4 Table 6, C10H, with the URL;
      - `note`: the fit, the read instant, C3H held out, the billiard figure kept as the lower bound, and the user's
        "stippled, noticeably rougher" observation (2026-11-16).
- [ ] Run the probe at the fitted value into the probe file under "== After the fit ==". Acceptance (spec §4), each
      line printed with pass or miss:
      - C3H and C10H w₁/U and v₂/U within 0.05 of Gugan's;
      - Ω₁ within 15 points;
      - C3H's Ω₂ within 15 points of 0.

      The full and pass rolls are reported only. A miss is recorded, not tuned.
- [ ] `npx vitest run` (JSON reporter); re-pin as Task 2, including the scatter-shot and croquet-fit checks (the
      squeeze design's), each moved value commented with this design and its old value. A scatter or split result
      outside its own design's acceptance stops the plan for the user.
- [ ] `ENGINE_VERSION` 0.33.0; the checks; commit "Fit the balls' friction to Gugan's C10H".

### Task 4: Results

**Files:** the spec's §5, the lawn design's §6 (a pointer note only), the memory.

- [ ] Spec §5:
      - the before and after tables from the probe file (half rolls against acceptance; full and pass reported);
      - the fitted μ;
      - the hands' peak force in C10H, before and after;
      - each moved pin group with its cause;
      - the suite's counts.

      The lawn design §6 gains one line: its Table 6 read the handover, so see this design's §5 for the figures at
      Gugan's instant.
- [ ] Update memory `gugan4-table6-rolls` with the read-instant point (Gugan's speeds are "a few ms after impact";
      compare at `readTimeOf`, not the handover).
- [ ] Commit "Roll launch: results", push. Then the whole-branch review: `/pre-review` (code-review-suite), its
      findings verified and applied or recorded.
