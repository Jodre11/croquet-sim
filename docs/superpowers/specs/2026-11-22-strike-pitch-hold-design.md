# The strike's pitch hold (gap G2, the rolls' striker's ball)

Status: draft, 2026-11-22, amended after review the same day. Gap register G2
(`docs/superpowers/probes/scorecard/2026-11-16-gap-register.md`, "the head's speed through the strike" and "where the
grip period acts in the strike").

## 1. Why

**The gap.** In the full and pass rolls of Gugan 4 Table 6 the striker's ball leaves too slowly: w₁/U 0.47–0.55
against Gugan's 0.50–0.67 (card `2026-11-21-accel-x1`, objective 5.13). The register has ruled out the plan's pulse,
both contact frictions, restitution, the turf's friction and bed, and the face angle. What remains is the strike's
momentum balance: after the first 1 ms the head is right (0.56–0.58 U), then loses too much while it pushes the
striker's ball on.

**The lever.** All three refits asked for a short grip period (about 25 ms against the ruled 0.08 s). The user kept
0.08 s and asked for the mechanism the short period stands in for. The register's latest entry found it:

- the impact begins when the grips relax (`coupling.relaxAt` 0 s, the face's first touch at 0.01 ms), so the firm
  grip's springs and dampers (`handGains`) never act in a roll's strike;
- the period reaches the strike only through the bottom hand's twist damper and the push's pitch hold (`pushPitch`,
  `src/engine/impact/track.ts`), the hands' couple holding the shaft's pitch about the top hand;
- at 25 ms alone, with nothing else changed, the hold keeps the face from turning back under the balls' impulse:
  C3F's w₁/U rises 0.520 → 0.546 and C3P's 0.517 → 0.559 (Gugan 0.594, 0.580). C10P overshoots (0.524 → 0.549,
  Gugan 0.520), and the 25 m rolls do not move.

**The user's choices (2026-11-22, gate questions).**
1. "Firms through the strike": a grip that keeps 0.08 s through the swing and firms only around contact, as a
   player tightens at impact.
2. What firms: "The pitch hold".
3. How firm: "Fitted by the card", a new free parameter with the rest held.
4. When: "The whole hold", contact to the path's restart; the swing's grip and the stops' hold keep 0.08 s.

**Sources.** Gugan 4 §5.1 names what sets the mallet's effective mass: "bodily motion, flexure of the shaft, and
firmness of grip" (https://oxfordcroquet.org/tech/gugan4/, read 2026-11-18, page SHA-256
`862e21c87e857206eff63a9956407386e8167178c3e0275d619e2d02ae450b32`). No source gives the firmness of the hold, so the
value is fitted, and the card's outcome decides whether it is kept.

## 2. The design

### 2.1 The parameter

`reference/contact.json` gains `strikePitchPeriod` (s): the natural period of the push's pitch hold, the hands'
couple about the top hand from contact to the path's restart.

- **Value on landing: 0.08 s**, equal to `handCouplingPeriod`, so the change lands with no effect on any shot.
- **Bounds: [0.01, 0.08] s.** The lower bound is `handCouplingPeriod`'s own. The upper bound is the swing grip's
  ruled 0.08 s, fixed: the hold no firmer than the ruled swing ("no firming"), so a fit at the upper bound rejects the
  design. It does not follow later changes to `handCouplingPeriod`.
- **Entry:** `source` names this spec and the register entry; `provenance: "derived"`; `provisional: "placeholder"`
  until the user rules; the note says it is unsourced and fitted by the card.
- `src/reference/index.ts` reads it into `contactReference.strikePitchPeriod` beside `handCouplingPeriod`, and
  `reference.test.ts` asserts its value and bounds.

The damping ratio stays `handCouplingDampingRatio`, shared with the swing's grip. The hold's limit,
`holdFirmness` × `gripCouple`, is unchanged.

**What `handCouplingPeriod` means afterwards.** Today an override of `handCouplingPeriod` also moves the push's pitch
hold. After this change it reaches a roll's strike only through the bottom hand's twist damper, and
`strikePitchPeriod` stays where it is set: the two are independent. Scripts that override the period
(`scorecardFit.ts`, `scorecardMap.ts`, `ratioFit.ts`, `croquetFitProbe.ts`) keep `strikePeriod` fixed. The 2026-11-16
map's sensitivity to `handCouplingPeriod` is therefore mostly this hold's, and it no longer describes the new
`handCouplingPeriod`.

### 2.2 The engine

- `Coupling` (`src/engine/impact/types.ts`) gains `strikePeriod: number` (s), documented as the push's pitch hold's
  period. Reference values reach the track through the drive, as `PUSH_FORCE` does, so the field is kept rather
  than `pushPitch` reading `HAND_COUPLING` directly.
- `HAND_COUPLING` (`track.ts`) gains `strikePeriod: contactReference.strikePitchPeriod.value`;
  `buildContact.ts` copies it into the drive's `coupling` beside `period`.
- `pushPitch` calls `heldPitch({ ...track.coupling, period: track.coupling.strikePeriod }, …)`. `heldPitch` and
  `holdPitchGains` keep their signatures; the stop's hold in `handLoad` is untouched.
- `simulateImpact.ts` validates `positive(coupling.strikePeriod, "coupling.strikePeriod")` beside the period's check.
- Every other `Coupling` literal (tests, probes, `swingProbe.ts`) sets `strikePeriod`. Where it overrides the period
  for a sweep, it leaves `strikePeriod` at `HAND_COUPLING.strikePeriod`; where the period is Infinity
  (`tests/engine/support/impact.ts`), `strikePeriod` is Infinity too.
- `ENGINE_VERSION` 0.42.0 → 0.43.0.

### 2.3 The card

- `RUN_PARAMS` (`scripts/scorecard/params.ts`, the parameters a card may set but the fit never frees) gains
  `strikePitchPeriod`, so `--set strikePitchPeriod=…` works. `FREE_PARAMS` and `FIT_PARAMS` are unchanged.
- The fit is a one-dimensional sweep with every other value held, minimising the card's objective (the same
  objective as 5.13 on `2026-11-21-accel-x1`): the card at 0.010, 0.015, 0.020, 0.025, 0.030, 0.040, 0.060 and
  0.080 s (`scorecard.ts --label 2026-11-22-strike-pitch-<T> --set strikePitchPeriod=<T> --compare
  docs/superpowers/probes/scorecard/2026-11-21-accel-x1.json`). The best grid point is the fit. A best point at
  0.010 s is reported as at the bound; one at 0.080 s rejects the design. No bisection and no new fitting code.

## 3. Acceptance

By outcome: right-looking shots, the expected balls, playable.

1. **No change on landing.** At 0.08 s the card reproduces `2026-11-21-accel-x1` row for row (objective 5.13).
2. **The fit.** The best period's card: its objective against 5.13; each Table 6 roll's w₁/U and its z; C10P's
   overshoot; every row that changes by more than 1 z, drives and stops included.
3. **Playable.** No row becomes unpractised (an off-face play, a late hit, a missed contact). The late hit stays a
   fault: every stroke with a push takes the firmer hold through the carry, the half roll included, so
   `lateHitSurvey.ts` is run on the full, pass and half rolls for any head–ball contact after the ball has left.
4. **Right-looking.** The full and pass rolls at the best period are shown in the side-on viewer, beside 0.08 s, for
   the user's judgement.
5. **The ruling.** The value is adopted into `reference/contact.json` only on the user's ruling; the register records
   the sweep and the decision either way.

Items 3 and 4 run at the best period by a local, uncommitted edit of `strikePitchPeriod` in `reference/contact.json`
(neither `lateHitSurvey.ts` nor the viewer takes `--set`), reverted before the ruling.

## 4. Tests

- `pushPitch` uses `strikePeriod`: a track with `strikePeriod` ≠ `period` gives the couple of `heldPitch` at the
  strike period.
- `simulateImpact` rejects a non-positive `strikePeriod`.
- The existing suites pass with only mechanical edits: the `HAND_COUPLING` and drive-coupling `toEqual` checks
  (`hands.test.ts`, `buildContact.test.ts`) gain `strikePeriod`; the version pins (`simulateImpact.test.ts`,
  `index.test.ts`) read 0.43.0; every `Coupling` literal gains `strikePeriod` as §2.2 sets it.

## 5. Out of scope

- The hold's limit, which may be what holds the 25 m rolls (unchecked; the user chose the pitch hold alone).
- The swing's grip period, the stops' hold, the hand–arm chains and the arms' posture hold.
- A grip that firms over time within the strike.

## 6. Assumptions

- The hold shares the swing grip's damping ratio.
- The sweep's grid stands in for "fitted by the card"; a joint refit is not run.
- The engine's minor version rises, as the field changes `Coupling`'s shape.
