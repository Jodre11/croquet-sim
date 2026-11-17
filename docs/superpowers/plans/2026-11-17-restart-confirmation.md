# The restart's confirmation (gap G2) implementation plan

**Goal:** the restart fires before Gugan's second contact at C25, so the hands stop chasing the plan, while C10H's
0.38 ms re-press is still rejected.

**Spec:** `docs/superpowers/specs/2026-11-17-push-strength-design.md`. Executed natively in this session.

**Status:** done, 2026-11-17. Candidate (a) adopted (RESTART_HOLD 0.5 ms), and (b) failed at C25P (0.98 ms summed).
The results are in the gap register, under G2.

## Global constraints

- No new reference value; `reference/` unchanged. RESTART_HOLD stays numerical, its doc comment naming the gaps.
- The departure latch, the push's end at the departure, one restart per stroke, no re-anchor on a check, and the s and
  lag read at the restart's step are unchanged (spec §3.1).
- ENGINE_VERSION bumps (0.34.0 → 0.35.0).

## Review focus

- A pair that reopens while not departing must not start or reset the count (the existing "does not latch" test).
- A non-striker ball's parting must not feed the striker's count (`opened.p === p`).
- A check is still not re-anchored.
- A stroke with no re-catch (the drive) still restarts once.

## Task 1: the discriminating run (gate)

- [ ] Add a temporary confirmation switch in `src/engine/impact/integrate.ts`: `law: "run" | "total"`, `hold: number`.
  `"run"` is today's single-interval test; `"total"` sums the pair's open steps since the departure.
- [ ] Add `gapProbe.ts restart --law run|total --hold <s>`: for C10H, C3H, C10F, C10P, C25F, C25P print the departure,
  the restart, the open gaps before it, face contacts after it, w₁/U against Gugan, the head speed at the departure
  and at the restart; and the canonical half roll's ratio.
- [ ] Run today's law, (a) run 0.5 ms, (b) total 1 ms. Apply spec §3.2: C25 restart < 5 ms; C10H |s − s_departure| <
  0.1 m/s; C10H no face contact after 15 ms. Larger margin wins; neither → stop and report.
- [ ] Record the table in the gap register under G2.

## Task 2: the chosen law

- [ ] Remove the switch; hard-code the winner. RESTART_HOLD's doc comment records the law and the gaps it separates.
- [ ] Unit tests beside amendment 6's in `tests/engine/impact/flatPush.test.ts`:
  - C10H's re-pressed parting is not confirmed (restart later than the first parting + its re-press);
  - a re-catch after an accepted gap restarts at the confirming step (C25F);
  - C25F restarts before 5 ms.
- [ ] Update amendment 6's test for the chosen law's semantics if it pins the single interval.
- [ ] Bump ENGINE_VERSION.

## Task 3: verification

- [ ] The C25 hands' peak and mean force along the aim during face contact after the restart, against F_push 92.2 N.
- [ ] Full suite; any expected failures move only as the run reports.
- [ ] Full scorecard at the reference values against 23.92: family terms, C25 rows, coaching ratios, lift.
- [ ] The margin at the fit parameters' map bounds (C25 gaps, C10H gap).
- [ ] Record in the gap register; commit; push.

The refit is not in this plan (spec §4): G1's card read lands first.
