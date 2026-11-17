# G1: the croqueted ball's window read, then the refit

**Goal:** the scorecard reads Table 6's v₂ and Ω₂ the way Gugan's video reads them, an average over a short strip of
travel, not an instant; then the joint fit runs again on the card with G2's restart and this read.

**Source:** the gap register, G1's recommendation (`docs/superpowers/probes/scorecard/2026-11-16-gap-register.md`).
Executed natively in this session.

**Status:** done, 2026-11-17. Card 19.47 → 18.80; refit 16.64, the coupling period at its lower bound (a ruling for
the user). Results in the gap register under G1 and "The refit".

## Global constraints

- A card change only: no engine change, no ENGINE_VERSION bump, `reference/` unchanged.
- The window is READ_WINDOW = 15 mm of the croqueted ball's horizontal travel from the end of its first contact with
  the striker's ball. Assumption: Gugan does not state the window; 10–20 mm brackets it (register, G1).
- Over the window: Ω₂ = ∫R·ω dt / ∫v dt (R·Δφ/Δx), v₂ = Δx/Δt, ω the spin about the roll axis.
- The striker's ball's read (w₁, Ω₁) is unchanged; so are the probes' instant reads (`croquetedRead`).

## Review focus

- A run ending before 15 mm of travel: the read is over what was travelled, marked, never a throw.
- A ball that is airborne in the window still travels horizontally; its spin still counts.
- Samples are unevenly spaced: the integrals are trapezoidal in time.

## Task 1: the window read

- [ ] `spin2` (R·ω₂ about the roll axis, m/s) on `ReadSample` in `scripts/ratioFit.ts`.
- [ ] `windowRead(samples, start, distance)` in `scripts/table6.ts` → `{ t, v2, roll2, travelled }`; unit test on
  synthetic samples: constant v and spin give that v and ratio; a rising spin gives its travel-weighted mean; a short
  run returns `travelled` below `distance`.
- [ ] `rollFigures` reads v₂/U and Ω₂ from it.

## Task 2: the card and the refit

- [ ] Card at the reference values (label `2026-11-17-window`), against the restart card's 19.47.
- [ ] The joint fit as `scripts/scorecardFit.ts` ran it on 2026-11-16 (same seven parameters, bounds and stop).
- [ ] Record both in the gap register (G1, the joint fit); commit; push.
