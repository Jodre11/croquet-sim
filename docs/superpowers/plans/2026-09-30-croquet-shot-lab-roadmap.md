# Croquet Shot Lab — Implementation Roadmap

**Spec:** `docs/superpowers/specs/2026-09-30-croquet-shot-lab-design.md`

The spec is delivered as five sequenced plans. Each plan produces working, tested software on its own and is
written only once its predecessor has landed, so it can build on real interfaces and sourced reference data
rather than guessed ones.

| Plan | Delivers | Exit criteria |
|---|---|---|
| **P1 — Foundations and free-motion engine** (`2026-09-30-p1-free-motion-engine.md`) | Repo scaffold and CI; sourced reference data for ball, court, Laws, lawn speed and free-motion friction/restitution; deterministic event-driven phase-2 engine (sliding → rolling → stationary, ball–ball, uprights, peg, halt margin); out-of-court and hoop-passage events; hoop-run verdict; `ShotResult` sampling | Analytic cases pass (5/7 rule, head-on exchange, stop distances); energy/momentum invariants; mirror symmetry; determinism; event solver agrees with brute-force integration within 1 mm |
| **P2 — Impact phase and swing model** | Reference data for coaching ratios, mallets, stance/drive defaults, face and turf contact; compliant small-step N-body impact integrator (mallet rigid body, balls, turf) driven by a force profile; swing model `ShotSetup → ContactState`; `simulateShot(setup)` wiring phase 1 into P1's phase 2; jump flag | Standard stroke ratios within tolerance of sourced figures; stop → pass-roll monotonic; pull emerges on wide rolls without special-casing |
| **P3 — Profiles and calibration** | Profile type and default "typical club player" profile; median-of-attempts input; optimiser fitting drive profile per stroke type; plausibility bounds and rejection | Round trip recovers fitted parameters within ±5 % and distances within ±2 %; out-of-bounds fits rejected |
| **P4 — Planner, renderer and share links** | Svelte planner (placement with snap-back, nudge, croquet-stroke snap-into-contact, stroke controls, target hoop, lawn speed), Canvas 2D renderer, compare ghost overlay, honesty note, versioned fragment link format with migration and notices, wrapped local storage for profiles | Playwright suites at tablet/desktop/phone viewports in Chromium, WebKit, Firefox; link round-trips reproduce results |
| **P5 — Delivery and budgets** | GitHub Pages deploy workflow; performance budget in CI (Chromium CPU throttle calibrated once against the reference iPad); bundle-size budget; cross-engine determinism test | All budgets enforced in CI; site live |

## Provisional numbers — where each is confirmed

| Spec number | Confirmed in | How |
|---|---|---|
| Safari / iPadOS 16+ floor, last two majors of Chrome/Edge/Firefox | P1 Task 1 | Explicit Vite `build.target`; revisited in P4 when Playwright WebKit runs |
| 1 mm cross-engine rest-position agreement | P1 (design), P5 (test) | P1 restricts engine code to IEEE-exact operations (`+ − × ÷ √`), enforced by lint, which should make results bit-identical across engines; P5's cross-engine test measures it |
| 1 mm jump threshold | P2 | Chosen against the sourced turf compliance and the impact-phase resolution |
| ±15 % stroke-ratio tolerance | P2 | Set from the spread of the sourced coaching ratios |
| ±5 % / ±2 % calibration round trip | P3 | Round-trip test |
| ≤ 2,000-character links | P4 | Measured on worst-case setup plus profile |
| ≤ 200 ms simulation, ≤ 250 KB gzipped | P5 | Throttled CI measurement and bundle report |

## Decisions deferred to the relevant plan

- **GitHub remote** (public or private) — needed before P1's CI workflow runs and before P5's Pages deploy. Ask
  when P1 is ready to push.
- **Reference data sourced in P2** — coaching ratios, mallet values, stance and drive defaults, face-material
  friction/restitution, turf compliance.
