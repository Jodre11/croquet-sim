# The restart's confirmation at C25 (gap G2)

Status: draft, 2026-11-17. Gap register G2 (`docs/superpowers/probes/scorecard/2026-11-16-gap-register.md`); the
reality scorecard design's §6 route for a gap the fit cannot reach. The file keeps its first name. Its first framing,
a cap on the arms' push strength, was rejected in review (§6).

## 1. Why

The user's rulings:
- 2026-11-17, "Keep, design G2": keep the reference values, design G2, then refit.
- 2026-11-17, "Reframe: fix the restart": G2 is the restart's confirmation, not the arms' strength.

**The gap.** In the C25 rolls the striker's ball leaves too fast: t6 w₁/U 0.73 against Gugan's 0.50 (C25F, z 10.6),
and 0.76 against 0.56 (C25P, z 8.5). Both fail the card's playability check. The joint fit's one large gain came from
crossing this gap's cliff, not closing it.

**The mechanism.** `gapProbe strike` at the reference values, times from first contact:

| Roll | Departure | Face contacts (ms) | Open gap before the re-catch | Restart |
|---|---|---|---|---|
| C10F | 0.63 | 0–0.63, 0.95–1.89, 3.10–4.27, … | 1.21 ms | 2.89 ms |
| C10P | 0.63 | 0–0.63, 0.98–1.95, 3.07–4.28, … | 1.12 ms | 2.95 ms |
| C25F | 0.61 | 0–0.61, 0.83–1.73, **2.67–41.10**, 44.01–45.26 | 0.94 ms | 42.10 ms |
| C25P | 0.60 | 0–0.60, 0.83–1.75, **2.50–38.12**, 42.98–44.24 | 0.75 ms | 39.12 ms |

How the C25 rolls go wrong:
- The push intent ends at the departure (roll launch amendment 1), about 0.6 ms in every roll, so no push is involved.
- At 1.73 ms the head (0.47U) is moving faster than the striker's ball (0.37U), which the croqueted ball has slowed.
  The head catches it again, which is Gugan's second contact.
- The restart (roll launch amendment 6) waits for the face–ball pair to stay open for RESTART_HOLD, 1 ms
  (`src/engine/impact/integrate.ts`). At C25 the gap before the re-catch is 0.94 ms and 0.75 ms, so the restart does
  not fire.
- The hands then chase the plan the strike slowed the head from, which is roll launch §1's diagnosis. They keep the
  face on the ball for 36–38 ms at about 140 N (5.2–6.3 N·s), and the head re-accelerates from 0.47U to 0.65U.
- At C10 the gap is 1.1–1.2 ms, so the restart fires at 2.9 ms and the hands' impulse is 0.34–0.42 N·s.

**The cliff.** The fit's cliff is this threshold. A setting that moves the C25 gap across 1 ms flips the restart from
about 2.7 ms to about 40 ms.

## 2. What the restart's confirmation is for

Amendment 6 (the user's "Confirmed parting", 2026-11-16) added the hold for one reason: in C10H the strike parts at
0.62 ms and presses again at 1 ms, a gap of 0.38 ms. Read there, s was 3.21 m/s against the 2.64 the head had once
the strike had left it.

So the confirmation must:
- reject a parting the strike itself closes again (C10H, 0.38 ms);
- accept the gap before Gugan's second contact (C25, 0.75–0.94 ms; C10, 1.1–1.2 ms).

The present 1 ms sits inside the second range, which is the fault.

## 3. Design

### 3.1 Candidate laws

The plan's first task runs each candidate law at the reference values; the outcome chooses. Changing the law's name
or its constant needs no further ruling. Each candidate keeps the following as they are:
- the departure latch;
- the push intent's end at the departure;
- one restart per stroke;
- no re-anchor on a check;
- the reading of s and the lag from the head at the restart's step.

The candidates:
- **(a) A shorter hold.** RESTART_HOLD = 0.5 ms: above C10H's 0.38 and below C25P's 0.75.
- **(b) Open time counted in total.** The restart fires once the striker's face–ball pair has been open for
  RESTART_HOLD (1 ms) in total since the departure, summed over its open intervals, rather than in one interval.
  - C25F: 0.22 + 0.94 ms, so it fires at about 2.6 ms.
  - C10F: 0.32 + 0.68 ms, so it fires at about 2.6 ms rather than 2.89.
  - C10H's 0.38 ms parting alone does not fire it.

### 3.2 The choice by outcome

The candidates are scored on these rolls, each against today's run: C10H, C3H, C10F, C10P, C25F and C25P. For each,
the run reports:
- the restart instant;
- the face contacts after it;
- w₁/U against Gugan;
- the canonical half roll's ratio (2.0, shapes ruling 15).

A law qualifies if:
- C25F and C25P restart before 5 ms;
- C10H's s at the restart is within 0.1 m/s of the head's speed after the strike leaves it (2.64 m/s at μ 0.06; read
  at the reference μ 0.16);
- C10H's late touches do not come back: none after 15 ms, against amendment 7's 12 ms.

Among the laws that qualify, the one with the larger margin wins. The margin is the smallest distance, across the six
rolls, between any qualifying gap and the threshold, or between C10H's rejected gap and the threshold.

**If neither qualifies:** stop and report. The C25 re-catch may then need the restart to fire on the re-catch itself,
a design of its own.

### 3.3 Unchanged

- Everything before the departure.
- The warp's law (amendment 5), the guide (amendment 1), and the pitch hold's end at the restart (amendment 7).
- A check's own law, the grip limit, and the hands' masses and gains.
- No new reference value. RESTART_HOLD is numerical, not physical: its doc comment records the new value or law and
  the gaps it separates.
- ENGINE_VERSION bumps.

## 4. Verification

- **The discriminating run** (§3.2) is the plan's first task, and its gate.
- **The C25 rolls with the restart firing.** Report the hands' peak and mean force along the aim through any
  remaining face contact.
  - If they still exceed F_push (92.2 N, `reference/contact.json` pushForce) for longer than a strike, the strength cap
    of the first framing comes back as its own design.
  - Otherwise it is dropped.
- **Unit tests** (`tests/engine/impact/`, beside amendment 6's):
  - a pair that reopens within the strike is not confirmed;
  - a re-catch after a gap the law accepts restarts at the confirming step;
  - the C25F trace restarts before 5 ms.
- **The suite.** Expected failures move only as the run reports.
- **The scorecard.** A full card at the reference values, against the baseline (23.92):
  - every family's Σz²;
  - the C25 rows;
  - the pass and full rolls' coaching ratios (1.12 and 1.16 now);
  - lift.
- **The margin.** At each of the fit parameters' sensitivity-map bounds, report the C25 and C10H gaps against the
  chosen threshold. This shows whether the cliff has gone or only moved.
- **The refit** follows as a separate step. G1's card read (register G1) lands as its own change before it.

## 5. Risks

- **Any time threshold is still a threshold.** The margin check (§4) makes the remaining one visible. If it is thin,
  the restart may need a criterion based on the strike's force or the head's speed rather than on time.
- **C10 moves.** Under (b), C10's restart moves earlier by about 0.3 ms. The ratios are reported, not tuned.

## 6. The first framing, rejected

The first draft capped the arms' forward drive at F_push through an "unbroken push". The framing review showed this
wrong:
- the push has already ended at 0.61 ms;
- the 36 ms contact follows a parting, not an unbroken hold;
- the cap would have treated the symptom and left the 1 ms cliff in place.

The user reframed it on 2026-11-17. The cap returns only if §4's C25 run still shows the hands above F_push once the
restart fires.
