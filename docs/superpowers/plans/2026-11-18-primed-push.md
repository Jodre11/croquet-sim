# The primed push: implementation plan

**Goal:** close G6 (the rolls' slow striker's ball) with a push already on at contact, chosen by outcome.

**Spec:** `docs/superpowers/specs/2026-11-18-primed-push-design.md`. Executed natively in this session.

## Global constraints

- One law on every push stroke (half, full, pass); strokes without a push untouched.
- F_push 92.2 N (`reference/contact.json` pushForce); v₀ sourced, never guessed.
- The grip's 0.08 s and the restart, warp, guide and pitch hold unchanged.
- Public repo: sources cited (URL, date, SHA-256, short quotes), never mirrored.

## Review focus

1. A stroke with a lead: the press must not act before the face first touches the ball (U unchanged).
2. A croquet stroke: the striker's ball is the first to touch the face, not the croqueted ball.
3. The follow-through: P nil once the balls are removed, so the finish is unchanged.
4. A push whose pendulum phase is null: the press still ends (balls removed, or the bound).
5. The half rolls: C3H and C10H and the canonical ratio 2.0 must hold (§2.3).

---

### Task 1: The v₀ source

- [x] Find a published multi-joint arm push v₀. Found: Zhang, Gassier, Eymard, Pommel, Berthier, Rahmani and Hautier,
  "Predicting Throwing Performance with Force-Velocity Mechanical Properties of the Upper Limb in Experienced Handball
  Players", J. Hum. Kinet. (2025), DOI 10.5114/jhk/190224, full text
  https://www.ebi.ac.uk/europepmc/webservices/rest/PMC11812159/fullTextXML (read 2026-11-18, SHA-256
  `b1debb98b1e76824bd5cfb70cc9cf2a8269674df57c041370fb79631c01e31ac`). Twenty-seven experienced male handball players,
  single-arm ballistic bench press throw on a Smith machine, linear F–V: V₀ 2.03 ± 0.29 m/s (Table 1).
- Value for the trial: v₀ = 2.03 m/s; bounds mean ± 2 SD, 1.45–2.61 m/s. Entered in `reference/contact.json` only if
  (b) or (c) wins (Task 3).

### Task 2: The discriminating run (spec §2.3), throwaway

**Files (reverted after the run):** `src/engine/impact/track.ts` (`pushIntent`, `GripState`), `src/engine/impact/
integrate.ts` (the striker's latch and speed, the follow-through flag).

- [ ] Throwaway edit, law chosen by an environment variable `G6_LAW` = `a` | `b` | `c`:
  - `GripState` gains `striker` (index of the first ball whose face–ball pair closes), `strikerSpeed` (its centre
    speed along aim at the end of the last step), `latched` and `ballsGone`.
  - `integrate.ts` sets `striker` at the first closed face–ball pair, `strikerSpeed` after each step's pairs, and
    `ballsGone` at the follow-through's start.
  - `pushIntent(track, t, grip, state, head)`: nil before `striker`, once `ballsGone`, in the pendulum phase; (a)
    F_push until W ≥ w₁ after the departure (latched); (b) F_push·max(0, 1 − v/v₀), v the mean of the two grips'
    speeds along aim; (c) (b) with (a)'s latch.
- [ ] Run `npx tsx scripts/gapProbe.ts w1-trace` and `push` under the reference law, (a) and (b); (c) only if (b) fails
  on "no chase" alone. Report per roll: w₁/U, Ω₁ and W/U at the read, the hands' impulse split, the restart instant.
- [ ] Canonical half roll ratio under each law.
- [ ] Score against §2.3; revert the edit (`git checkout` both files).
- [ ] Record the table and the outcome in the register ("G6's primed push, the discriminating run"); commit and push.

**Gate:** none qualifies → stop and report (spec §2.4).

### Task 3: The chosen law, for good (spec §2.5)

**Files:** `src/engine/impact/track.ts`, `src/engine/impact/integrate.ts`, `src/engine/impact/types.ts`,
`src/engine/swing/{buildContact,profile,types}.ts`, `src/engine/impact/simulateImpact.ts`, `reference/contact.json`,
`reference/index.ts`, `src/lab/play.ts`, `src/viewer/Readout.svelte`, `src/engine/simulate.ts`, tests.

- [x] Write the unit tests of spec §3 (lead > 0; first contact step; the bound; pendulum, balls removed, no push; the
  striker on a croquet stroke); run them, expect failure.
- [x] Implement the law; retire R̃ and τ_push as §2.5 lists; v₀ in `reference/contact.json` if (b) or (c).
- [x] The viewer reads `pushImpulse` (N·s), which already existed; `pushEffort` kept (spec, "As implemented").
- [x] Rewrite the superseded tests (`flatPush.test.ts`, `hands.test.ts`). ENGINE_VERSION 0.37.0.
- [x] `npm test`, `npx tsc --noEmit`, `npm run lint`; expected failures move only as the run reported.
- [x] Commit and push.

### Task 4: The card

- [x] Full scorecard at the reference values against `2026-11-18-lift-split`: every family's Σz², the rolls' w₁/U,
  w₂/U, L1, L2, the coaching ratios and lift. Record in the register; commit and push.
