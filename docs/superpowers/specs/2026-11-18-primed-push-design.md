# The primed push (gap G6)

Status: draft, 2026-11-18, amended after review the same day. Gap register G6
(`docs/superpowers/probes/scorecard/2026-11-16-gap-register.md`, "G6", "G6's push", "G6's primed push, tried"); the
reality scorecard design's §6 route for a gap the fit cannot reach.

## 1. Why

The user's rulings:
- 2026-11-18, "Design primed push": a push already on at contact, so the head keeps its speed through the strike. The
  grip stays at 0.08 s.
- 2026-11-18, "Carry, not chase": the push carries the head with the striker's ball and never drives it past.
- 2026-11-18, after review, "Add force–velocity": the run also tries the arm's force–velocity relation, a physical
  bound, beside the carry bound.
- 2026-11-18, after review, "Let the run decide": one press on every push stroke, the half roll's included; if the
  half rolls fail, the run stops and reports.

**The gap.** In the full and pass rolls the striker's ball leaves too slowly (card `2026-11-18-lift-split`, w₁/U z
−1.8 to −5.0 in all seven). The head keeps 0.39–0.42 U; Gugan's keep W ≈ w₁, 0.50–0.67 U (Gugan 4 §10, Table 6: no
mallet speeds "because they are essentially the same as for ball 1"; https://oxfordcroquet.org/tech/gugan4/, read
2026-11-18, page SHA-256 `862e21c87e857206eff63a9956407386e8167178c3e0275d619e2d02ae450b32`).

**Why the present push does not act.** `pushIntent` (`src/engine/impact/track.ts`) is P = min(R̃, F_push)·aim: R̃ the
balls' resistance as the hands sense it, lagged by τ_push 0.125 s (gate ruling 2026-10-11), ending at the face's
departure (the user, 2026-11-15; roll launch amendment 1). The departure comes 0.6–0.8 ms after the strike, so the
intent reaches 5–36 N and gives 1–2% of the hands' impulse. The extra impulse G6 wants is a steady 36–115 N over the
strike to the read in six rolls of seven: about F_push, 92.2 N (register, "G6's push"). F_push is isometric (Das and
Wang, `reference/contact.json` pushForce): a push with the hand still. That the wanted force matches it does not
confirm 92.2 N for moving hands, which is what the force–velocity candidate tests.

**What the trial showed.** A steady F_push from contact to the pendulum phase brings C3F, C3P and C10P within 0.03 of
Gugan, but has three faults: in C1F the head outruns the ball (W 0.92 U against w₁ 0.83); Ω₁ falls to 61–68% in the
slow rolls (Gugan 93–100); and C3H moves away from Gugan (0.44 → 0.51). Held only to the restart, it gains 0.01–0.09
and still moves C3H to 0.469 (register, "G6's primed push, tried"). The register reports W > w₁ for C1F only; a bound
that acts only on the chase may leave the other two faults as they are. The stop (§2.4) is a likely outcome, not only
a risk.

## 2. Design

### 2.1 The press

On every stroke with a push (the half, full and pass rolls; `profile.drive[type].handReach` > 0), from the first step
at which a face–ball pair is closed, the hands press along aim, P = F·aim, with no sensed build. F is F_push or less,
by the candidate (§2.2).

- **On.** The first face–ball contact, not the plan's contact (`coupling.relaxAt`): a stroke with a lead (an early
  action, TURF_MARGIN) has its impact start before the face reaches the ball, and the press must not drive the head
  then. The arrival speed U stays the shot's input.
- **Off.** At the pendulum phase (`push.pendulum`, where it is not null), once the impact's balls are removed (the
  follow-through), or by the candidate's bound, whichever comes first. With the balls removed P is nil, as the present
  intent is after the departure, so the finish is unchanged.
- **The striker's ball** is the ball of the first face–ball pair to close: "in every stroke the face meets the
  striker's first" (`integrate.ts`, the departure latch). The impact latches it then.
- **Speeds.** W, w₁ and the hands' speed v are centre speeds along aim, read from the state at the start of the step,
  as the hands' load is (`handLoad` runs before the step's contacts). v is the mean of the two grips' speeds along aim.
- **One law on every push stroke** (the unified shot model rule): F_push (`reference/contact.json` pushForce, 92.2 N,
  bounds 48.49–106.34) and the chosen candidate are the same on the half, full and pass rolls. Strokes without a push
  are untouched.

### 2.2 Candidates

The plan's first task runs (a) and (b) as throwaway edits to `pushIntent`, as the register's primed trial was; the
outcome chooses (§2.3). Changing a candidate's name or a numerical constant needs no further ruling.

- **(a) Carry.** F = F_push, until the first step after the departure at which W ≥ w₁; then P is nil for the rest of
  the stroke. Before the departure the head is on the ball, so the bound reads from the departure on.
- **(b) Force–velocity.** F = F_push·max(0, 1 − v/v₀): the arm's push falls as the hands speed up, F_push the
  isometric end and v₀ the unloaded speed of a multi-joint push. No ball bound. The plan's first step finds v₀ in a
  published source for a multi-joint arm push (a linear relation is the usual multi-joint form), cites it and adds it
  to `reference/contact.json` with its source and bounds; no value is guessed. If no source gives a usable v₀, (b) is
  dropped and the run reports so.
- **(c) Both.** (b) with (a)'s latch. Built only if (b) fails §2.3 on "no chase" alone.

### 2.3 The choice by outcome

Each candidate is scored on C3H, C10H, C1F, C3F, C10F, C25F, C3P, C10P and C25P against today's run (`gapProbe.ts
w1-trace`, and `push` for the hands' impulse). For each roll the run reports w₁/U, Ω₁ and W/U at the read, W − w₁
through the impact, the hands' impulse along aim split as in "G6's push", the face contacts and the restart instant.

A candidate qualifies if:
- **Closer.** Each of the seven full and pass rolls' w₁/U is closer to Gugan than today's, and none overshoots Gugan
  by more than 0.03.
- **The ball rolls.** Ω₁ at the read is not below today's by more than 5 points in any roll.
- **The half rolls hold.** C3H and C10H's w₁/U are no further from Gugan than today's by more than 0.02, and the
  canonical half roll's ratio (2.0, shapes ruling 15) moves by no more than 0.1.
- **No chase.** At the read, W − w₁ ≤ 0.01 U in every roll. (a) meets this by construction; it is an assertion for
  (a) and a check for (b).

Among the candidates that qualify, the one with the smaller Σz² over the seven full and pass rolls' w₁/U wins.

### 2.4 If none qualifies

Stop and report the table. The routes left need a ruling: the half roll without a push (Riches: no push in the half
roll; the preset's push length set to 0, an input change), the press sized from an existing input (`handReach` or
`stroke.drive`), or the shot's existing `stroke.drive` set for the rolls. A magnitude that differs by stroke type is
forbidden by the one-default rule.

### 2.5 After a candidate qualifies

Only then is the engine changed for good:
- **The law** in `pushIntent`, with (b)'s v₀ in the reference data if (b) or (c) wins.
- **What retires.** The primed law reads neither R̃ nor τ_push, which exist only for the intent, so they are removed:
  `pushResponse`, `senseResistance` and their calls in `integrate.ts` (the impact's and the follow-through's),
  `GripState.resistance`, `Hands.pushResponseTime`, `profile.body.pushResponseTime`, `PUSH_RESPONSE_TIME`, and
  `reference/contact.json`'s pushResponseTime, whose entry is replaced by a note that the 2026-10-11 lag was
  superseded on 2026-11-18. Their tests go with them.
- **Superseded rulings' tests are rewritten, not left failing:** the intent nil after the departure
  (`tests/engine/impact/flatPush.test.ts`, `hands.test.ts`) becomes the chosen law's.
- **The lab's push readout.** `pushEffort` (100·peak intent / F_push, `src/lab/play.ts`) would read 100% on every
  push stroke under (a). It becomes `pushImpulse`, the press's impulse along aim (N·s), in `play.ts`, the viewer's
  readout (`src/viewer/Readout.svelte`), the push-map checks and grid tests and the pins (`tests/lab/playPin.json`).
- **The guide's cap** (amendment 1) still reads the feed-forward, which now holds P after the departure.
- **ENGINE_VERSION** (0.36.0, `src/engine/simulate.ts`) bumps.

### 2.6 Unchanged

- The grip's 0.08 s, its limit, the hands' masses and gains.
- The restart's law (G2), the warp (amendment 5), the guide's law (amendment 1) and the pitch hold's end at the
  restart (amendment 7).
- The strokes without a push, every stroke before its first face contact, and the follow-through.
- F_push's value and bounds.

## 3. Verification

- **The discriminating run** (§2.3) is the plan's first task, and its gate.
- **Unit tests** (`tests/engine/impact/`, beside the push intent's):
  - P is nil before the first face–ball contact, tested with a lead > 0;
  - P is F·aim from the first contact step, with no resistance sensed, F as the chosen candidate gives;
  - under (a), P is nil from a step after the departure where W ≥ w₁; under (b), F falls linearly with v and is nil
    at v ≥ v₀;
  - P is nil in the pendulum phase, once the balls are removed, and on a stroke without a push;
  - the striker's ball is the first to touch the face, on a croquet stroke.
- **The suite.** Expected failures move only as the run reports; §2.5's rewritten tests pass.
- **The scorecard.** A full card at the reference values against `2026-11-18-lift-split`: every family's Σz², the
  rolls' w₁/U, w₂/U, L1 and L2 rows, the coaching ratios and lift.
- **The refit** follows as a separate step.

## 4. Risks

- **The stop is likely** (§1): neither bound may cure Ω₁'s fall or C3H's move. The run's W − w₁ trace shows which
  rolls each bound acts in.
- **The C25 rolls may stay short.** The primed trial left them at 0.44–0.47 against 0.50–0.56. If they do, report the
  hands' impulse against the wanted 0.89 and 1.55 N·s; a remaining gap is the register's next entry.
- **(a) is an outcome rule.** It acts on a sensed speed difference with no delay, standing in for a cause the model
  does not hold. If it wins, its doc comment says so; (b) is the physical alternative.
- **A threshold.** (a)'s latch acts on W − w₁; the run's face contacts show whether it makes a new contact or chatter.

## Amendment 1 (2026-11-18): press while on the ball

The discriminating run (register, "G6's primed push, the discriminating run") qualified neither candidate: (a)'s latch
fires at the re-catch where the head carries the ball, and (b)'s v, the hands' speed in the world, is at or above the
bench press throw's v₀ from C3F up. The user's ruling (2026-11-18, "Press while on the ball") replaces both:

- **(d) On the ball.** F = F_push while the striker's face–ball pair is closed at the start of the step, and nil
  while it is open. The press comes back at each re-catch. §2.1's on, off and striker rules stand.
- It needs no new constant and no speed bound; it cannot chase, since nothing presses across a gap. (b)'s v₀ is not
  entered in the reference data.
- §2.3's checks and §2.5 apply unchanged, with (d) the only candidate. If it fails, stop and report as §2.4.

**The run and the ruling** (register, "G6's primed push, on the ball"). (d) passes "closer", "no chase" and "the half
rolls hold", and misses "the ball rolls" by the letter: Ω₁ falls 6, 6 and 7 points in C3F, C10F and C25P against 5,
every value within Gugan's 87–100. The user's ruling (2026-11-18, "Yes, implement it"): (d) is implemented as §2.5
lists. The striker's pair is open once the balls are removed, so the follow-through needs no separate flag.

**As implemented** (2026-11-20). `pushImpulse` (N·s, the intent's time integral) already existed beside `pushEffort` in
the lab, so nothing was renamed: the viewer's readout shows `pushImpulse`, and `pushEffort` stays as the push map's
decision 5 reads it (100 % on every push stroke that touches the ball, a constant shift that leaves decision 5's order
among push strokes unchanged). `pushResponseTime` left `reference/contact.json`, its supersession noted in
`pushForce`'s note and the sources README; the scorecard's free parameters are fourteen. Expected moves: the canonical
half, full and pass rolls' ratios 1.782 → 1.757, 1.335 → 1.306, 1.285 → 1.243; the full roll at a tap plays lawfully
at firmness 0 (was 29.1.6.1 at every hold); the full roll's least non-slipping hold σ 0.0625 → 0.16875; no full roll
sinks the ball under the head (handover cover lost, as the pass roll's was); the pinned plays re-pinned.
