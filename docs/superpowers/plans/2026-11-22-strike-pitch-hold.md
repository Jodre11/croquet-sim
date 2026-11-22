# The strike's pitch hold: implementation plan

**Goal:** give the push's pitch hold its own period, `strikePitchPeriod`, landing at 0.08 s with no effect, then sweep
it on the card for G2 and put the best value to the user.

**Architecture:** a reference entry, a `Coupling.strikePeriod` field carried by the drive, one changed call in
`pushPitch`, and a card-only parameter in `RUN_PARAMS`. The swing's grip and the stops' hold keep
`handCouplingPeriod`.

**Spec:** `docs/superpowers/specs/2026-11-22-strike-pitch-hold-design.md` (e5f8b84). Executed natively.

## Global constraints

- **Value on landing 0.08 s; bounds [0.01, 0.08] s**, the upper bound fixed, not tied to `handCouplingPeriod`.
- **Reference entry:** `source` names the spec and the register entry, `provenance: "derived"`,
  `provisional: "placeholder"`, note: unsourced, fitted by the card.
- **Independent periods:** any override of `period` leaves `strikePeriod` at `HAND_COUPLING.strikePeriod`; where
  `period` is Infinity, `strikePeriod` is Infinity.
- **`heldPitch` and `holdPitchGains` keep their signatures.**
- **Engine 0.43.0.**
- **The sweep minimises the card's objective.** Grid only: 0.010, 0.015, 0.020, 0.025, 0.030, 0.040, 0.060, 0.080 s.
  No bisection, no tuning of anything else, no adoption without the user's ruling.
- **No attribution. Commit by explicit path. Lines ≤ 120.**

## Review focus

1. **A stop on a push stroke** (a gripped hold): it takes `period`, never `strikePeriod`.
2. **A stroke with no push** (drives, stops): `pushPitch` returns 0, so the card's drive and stop rows are unchanged
   at any `strikePeriod`.
3. **A sweep script overriding `period`** (`swingProbe.ts`, `scorecardFit.ts`, `ratioFit.ts`, `croquetFitProbe.ts`):
   the hold stays at `strikePeriod`.
4. **`strikePeriod` 0, negative or NaN:** `simulateImpact` rejects it by name.
5. **Landing:** at 0.08 s the card equals `2026-11-21-accel-x1` row for row.

Items 1, 2 and 4 have tests in Task 1; 3 is a read of each script in Task 1; 5 is Task 2's first run.

---

### Task 1: The parameter and the engine (spec §2.1, §2.2, §4)

**Files:**
- Modify: `reference/contact.json` (entry after `handCouplingDampingRatio`), `src/reference/index.ts` (after
  `handCouplingDampingRatio`'s line), `tests/reference/reference.test.ts` (beside line 209 and in the unit map near
  236)
- Modify: `src/engine/impact/types.ts` (`Coupling`), `src/engine/impact/track.ts` (`HAND_COUPLING` 54–57,
  `pushPitch` ~2458), `src/engine/swing/buildContact.ts:1013`, `src/engine/impact/simulateImpact.ts:251`,
  `src/engine/simulate.ts:77`
- Modify, mechanically: `tests/engine/impact/hands.test.ts:178`, `tests/engine/swing/buildContact.test.ts:254`,
  `tests/engine/impact/simulateImpact.test.ts:57`, `tests/engine/index.test.ts:69`, the `Coupling` literals in
  `tests/engine/impact/gripLimit.test.ts`, `tests/engine/impact/mallet.test.ts`, `tests/engine/support/impact.ts`;
  and any `Coupling` built in `scripts/` (`git grep -n "dampingRatio:" -- scripts`)
- Test: `tests/engine/impact/hands.test.ts`, `tests/engine/impact/simulateImpact.test.ts`

**Interfaces:**
- Produces: `Coupling.strikePeriod: number` (s); `HAND_COUPLING.strikePeriod`;
  `contactReference.strikePitchPeriod: ReferenceValue`.

- [ ] **Step 1: Write the failing tests**
  - `reference.test.ts`: `strikePitchPeriod.value` 0.08, `bounds` [0.01, 0.08], `provenance` "derived", unit "s".
  - `hands.test.ts`, "the push's pitch hold takes the strike period": a push track whose coupling has
    `strikePeriod` 0.02 and `period` 0.08, a pitch error e and lag ė under the bound; the hand load's pitch couple
    equals `heldPitch({ ...coupling, period: 0.02 }, I_P, e, ė, bound)`, and differs from the same at 0.08.
  - `hands.test.ts`, "a stop's hold keeps the grip's period": a gripped stop with the same coupling gives
    `heldPitch(coupling, …)` at 0.08.
  - `hands.test.ts`, "no push, no hold": a drive's load is identical at `strikePeriod` 0.02 and 0.08.
  - `simulateImpact.test.ts`: `strikePeriod` 0, −1 and NaN each throw naming `coupling.strikePeriod`.
- [ ] **Step 2:** `npx --no-install vitest run tests/reference tests/engine/impact` — the new tests fail.
- [ ] **Step 3: Implement** per the spec §2.1–§2.2: the entry, the index line, the field (doc comment: the push's
  pitch hold's period, s), `HAND_COUPLING.strikePeriod`, the copy in `buildContact`, `pushPitch`'s
  `{ ...track.coupling, period: track.coupling.strikePeriod }`, the validation, `ENGINE_VERSION` "0.43.0", and the
  mechanical edits. In each script that overrides `period`, check that the spread keeps `strikePeriod`.
- [ ] **Step 4:** `npx --no-install vitest run`, `npx --no-install tsc --noEmit`, `npx --no-install eslint .` — all
  pass.
- [ ] **Step 5: Commit** the files above by path: "Strike pitch hold: strikePitchPeriod, the push's pitch hold's own
  period, landing at the grip's 0.08 s".

### Task 2: The card (spec §2.3, §3 items 1–2)

**Files:**
- Modify: `scripts/scorecard/params.ts` (`RUN_PARAMS`)
- Create: `docs/superpowers/probes/scorecard/2026-11-22-strike-pitch-<T>.json` and tables, one per grid point
- Modify: `docs/superpowers/probes/scorecard/2026-11-16-gap-register.md`

- [ ] **Step 1:** add `free("strikePitchPeriod", contactReference.strikePitchPeriod)` to `RUN_PARAMS`; update its doc
  comment's citation to name this spec beside the push body's.
- [ ] **Step 2: Landing.** `npx --no-install tsx scripts/scorecard.ts --label 2026-11-22-strike-pitch-0.080 --set
  strikePitchPeriod=0.08 --compare docs/superpowers/probes/scorecard/2026-11-21-accel-x1.json` (background). Expected:
  every row equal to `accel-x1`'s, objective 5.13. Any difference: stop and report.
- [ ] **Step 3: The sweep.** The same command at 0.010, 0.015, 0.020, 0.025, 0.030, 0.040 and 0.060 s, one at a time
  in the background (SCORECARD_WORKERS default).
- [ ] **Step 4: Record** in the register: a table of objective and each Table 6 roll's w₁/U (Gugan's beside it) per
  grid point; the best point; every row moving by more than 1 z at it, drives and stops included; C10P's overshoot;
  whether the best is at a bound.
- [ ] **Step 5: Commit** `params.ts`, the card records and the register by path: "Card: strikePitchPeriod sweep; best
  <T> s, objective <x> against 5.13".

### Task 3: Playable and right-looking (spec §3 items 3–5)

**Files:**
- Temporarily modify, never commit: `reference/contact.json` (`strikePitchPeriod.value` = the best grid point)
- Modify: `docs/superpowers/probes/scorecard/2026-11-16-gap-register.md`

- [ ] **Step 1:** set the best value in `reference/contact.json` locally.
- [ ] **Step 2:** `npx --no-install tsx scripts/lateHitSurvey.ts --label 2026-11-22-strike-pitch-<T>` and the same at
  0.08 s (value restored) for the baseline. Expected: no new late hit and no new FAULT on the full, pass and half
  rolls.
- [ ] **Step 3:** with the best value set, show C3F and C3P in the side-on viewer (dev server on 5192) beside the
  same at 0.08 s; send the user screenshots.
- [ ] **Step 4:** restore `reference/contact.json` (`git checkout reference/contact.json`); `git status` shows it clean.
- [ ] **Step 5:** record the survey's result in the register; commit it by path.
- [ ] **Step 6: The ruling.** Put adoption to the user as one gate question (adopt the best value, keep 0.08 s, or
  look further), with pros, cons and a recommendation. On "adopt": set the value, drop `provisional`, note the card and
  ruling in the entry, commit. Either way, record the decision in the register.
