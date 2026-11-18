# The primed push: carry, not chase (gap G6)

Status: draft, 2026-11-18. Gap register G6 (`docs/superpowers/probes/scorecard/2026-11-16-gap-register.md`, "G6",
"G6's push", "G6's primed push, tried"); the reality scorecard design's §6 route for a gap the fit cannot reach.

## 1. Why

The user's rulings:
- 2026-11-18, "Design primed push": a push already on at contact, so the head keeps its speed through the strike. The
  grip stays at 0.08 s.
- 2026-11-18, "Carry, not chase": the push carries the head with the striker's ball and never drives it past.

**The gap.** In the full and pass rolls the striker's ball leaves too slowly (card `2026-11-18-lift-split`, w₁/U z
−1.8 to −5.0 in all seven). The head keeps 0.39–0.42 U; Gugan's keep W ≈ w₁, 0.50–0.67 U (Gugan 4 §10, Table 6: no
mallet speeds "because they are essentially the same as for ball 1"; https://oxfordcroquet.org/tech/gugan4/, read
2026-11-18, page SHA-256 `862e21c87e857206eff63a9956407386e8167178c3e0275d619e2d02ae450b32`).

**Why the present push does not act.** `pushIntent` (`src/engine/impact/track.ts`) is P = min(R̃, F_push)·aim: R̃ the
balls' resistance as the hands sense it, lagged by τ_push 0.125 s (gate ruling 2026-10-11), ending at the face's
departure (the user, 2026-11-15; roll launch amendment 1). The departure comes 0.6–0.8 ms after the strike, so the
intent reaches 5–36 N and gives 1–2% of the hands' impulse. The extra impulse G6 wants is a steady 36–115 N over the
strike to the read in six rolls of seven: about F_push, 92.2 N (register, "G6's push").

**Why a bound tied to the ball.** A steady F_push from contact, held to the pendulum phase, brings C3F, C3P and C10P
within 0.03 of Gugan, but in C1F the head outruns the ball (W 0.92 U against w₁ 0.83), Ω₁ falls to 61–68% in the slow
rolls (Gugan 93–100) and C3H moves away from Gugan (0.44 → 0.51). Held only to the restart, it is over in 1.2–2.5 ms
and gains 0.01–0.09 (register, "G6's primed push, tried"). Gugan's W ≈ w₁ and "no clear evidence of acceleration"
rule out the chase; the end must come from the ball, not from the plan's phases.

## 2. Design

### 2.1 The law

From contact, on every stroke with a push (the half, full and pass rolls; `profile.drive[type].handReach` > 0), the
hands press along aim at the arm's push, P = F_push·aim, with no sensed build. The press is bounded by the striker's
ball: it carries the head with the ball and stops where the head would outrun it. It ends at the pendulum phase
(`push.pendulum`) as now.

- Before contact nothing changes: the arrival speed U stays the shot's input.
- One default on every push stroke: F_push (`reference/contact.json` pushForce, 92.2 N) and the bound's law are the
  same on the half, full and pass rolls (the unified shot model rule). Strokes without a push are untouched.
- W and w₁ are the head's and the striker's ball's centre speeds along aim. Before the face's departure the head is
  on the ball, so the bound reads only from the departure on.

### 2.2 Candidate bounds

The plan's first task runs each candidate at the reference values; the outcome chooses (§2.3). Changing a candidate's
name or a numerical constant needs no further ruling.

- **(a) Latched.** P is on from contact until the first step after the departure at which W ≥ w₁, then nil for the
  rest of the stroke. A re-catch (Gugan's second contact) ends it, since the head is then on the ball.
- **(b) Regulated.** After the departure, P = F_push·aim·clamp((w₁ − W)/δ, 0, 1): full while the ball leads by more
  than δ, nil once the head reaches the ball's speed, and on again if the ball draws ahead. δ is numerical, 0.02 U at
  the shot's U; its doc comment records the value and why.

### 2.3 The choice by outcome

Each candidate is scored on C3H, C10H, C1F, C3F, C10F, C25F, C3P, C10P and C25P against today's run (`gapProbe.ts
w1-trace`, and `push` for the hands' impulse). For each roll the run reports w₁/U and Ω₁ at the read, W/U at the read,
the hands' impulse along aim split as in "G6's push", the face contacts and the restart instant.

A candidate qualifies if:
- **Closer.** Each of the seven full and pass rolls' w₁/U is closer to Gugan than today's, and none overshoots Gugan
  by more than 0.03.
- **No chase.** At the read, W − w₁ ≤ 0.01 U in every roll.
- **The ball rolls.** Ω₁ at the read is not below today's by more than 5 points in any roll.
- **The half rolls hold.** C3H and C10H's w₁/U are no further from Gugan than today's by more than 0.02, and the
  canonical half roll's ratio (2.0, shapes ruling 15) moves by no more than 0.1.

Among the candidates that qualify, the one with the smaller Σz² over the seven full and pass rolls' w₁/U wins.

**If neither qualifies:** stop and report. The remaining routes need a ruling: the shot's existing `stroke.drive`
input set for the rolls, or a magnitude that differs by stroke type, which the one-default rule forbids.

### 2.4 What retires

The primed law reads neither R̃ nor τ_push. Both exist only for the intent (`integrate.ts`'s `pushResponse` and
`senseResistance` calls), so they are removed with it: `pushResponse`, `senseResistance`, `GripState.resistance`,
`Hands.pushResponseTime`, `profile.body.pushResponseTime`, `PUSH_RESPONSE_TIME` and `reference/contact.json`'s
pushResponseTime, whose entry records that the 2026-10-11 gate ruling's lag was superseded on 2026-11-18. The intent's
end at the departure (2026-11-15) is superseded by the bound; the guide's cap (amendment 1) still reads the
feed-forward, which now holds P after the departure.

### 2.5 Unchanged

- The grip's 0.08 s, its limit, the hands' masses and gains.
- The restart's law (G2), the warp (amendment 5), the guide (amendment 1) and the pitch hold's end at the restart
  (amendment 7).
- The strokes without a push, and every stroke before contact.
- F_push's value and bounds (48.49–106.34 N).
- ENGINE_VERSION bumps.

## 3. Verification

- **The discriminating run** (§2.3) is the plan's first task, and its gate.
- **Unit tests** (`tests/engine/impact/`, beside the push intent's):
  - P is F_push·aim from the first contact step, with no resistance sensed;
  - under the chosen bound, P is nil at a step after the departure where W ≥ w₁, and (b only) on again where the ball
    draws ahead by more than δ;
  - P is nil before contact, in the pendulum phase, and on a stroke without a push.
- **The suite.** Expected failures move only as the run reports.
- **The scorecard.** A full card at the reference values against `2026-11-18-lift-split`: every family's Σz², the
  rolls' w₁/U, w₂/U, L1 and L2 rows, the coaching ratios and lift.
- **The refit** follows as a separate step.

## 4. Risks

- **The C25 rolls may stay short.** The primed trial left them at 0.44–0.47 against 0.50–0.56. If they do, report the
  hands' impulse against the wanted 0.89 and 1.55 N·s; a remaining gap is the register's next entry, not this design's.
- **The half roll's push.** Its 25 mm push now presses at F_push from contact. Riches has no push in the half roll; if
  the half rolls fail §2.3's check under both bounds, that is the stop case, not a reason for a per-type value.
- **A speed bound is a threshold.** (b)'s δ and (a)'s latch both act on W − w₁; the run's face contacts show whether
  either makes a new contact or a chatter.
