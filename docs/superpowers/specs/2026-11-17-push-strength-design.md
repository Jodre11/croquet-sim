# The arms' push strength through an unbroken push (gap G2)

Status: draft, 2026-11-17. Gap register G2 (`docs/superpowers/probes/scorecard/2026-11-16-gap-register.md`); the
reality scorecard design's §6 route for a gap the fit cannot reach.

## 1. Why

The user's ruling (2026-11-17, "Keep, design G2"): keep the reference values, design G2, then refit. The joint fit's
one large gain came from moving faceFriction across G2's cliff, which crosses the gap without closing it.

**The gap.** In the C25 rolls the striker's ball leaves too fast: t6 w₁/U 0.73 against Gugan's 0.50 (C25F, z 10.6)
and 0.76 against 0.56 (C25P, z 8.5), and both fail the card's playability check. The `strike` probe found:
- at C10 the face makes five short contacts, 5.4–5.7 ms in all, and the hands' impulse along the aim is
  0.34–0.42 N·s;
- at C25, from 2.5 ms, the face stays on ball 1 for 36–38 ms, and the head re-accelerates from 0.47U to 0.65U;
- the hands' impulse there is 5.2–6.3 N·s, a mean of about 140 N, above the strongest sourced push, 106 N.

**The mechanism.** The roll launch design anticipated this case in §3.1, "an unbroken push": while the face holds the
ball, the restart has not fired, so the plan has not yielded to the head. Its excess pace, it said, "is the push
itself, a later design". This is that design.

Through a push the hands' load is made of three terms:
- each arm's flex (`flexForce`: the feed-forward, then −k·offset − c·lag towards the planned hands, k the hold
  stiffness of 744 N/m plus κ·|F_ff|);
- the push intent, held to F_push;
- the hand–arm chains.

The flex's target moves at the plan's pace whatever the head does. Behind it the arm can then deliver any force the
gap asks of the spring and damper. Each term is sourced on its own, but together they can exceed what a person's arms
can push.

## 2. Ruling and its basis

- **The source.** `reference/contact.json` pushForce, F_push = 92.2 N (bounds 48.5–106.3): Das and Wang's largest
  standing forward push at the hand. Its note already reads it as the cap on both hands together.
- **The law (my call, within the user's ruling).** The arms are strength-limited: through a push their muscles cannot
  drive the mallet along the aim harder than F_push, however far the plan runs ahead. Only the muscles are limited. The
  chains' own momentum, passed through the palm and finger springs, is inertia and stays as it is (roll launch
  amendment 1 deals with it after the departure).
- **Rejected:**
  - Letting the plan yield from contact (the restart moved to first contact). That undoes the 2026-11-15 ruling that
    the push adds pace before the ball leaves.
  - A short-range stiffness limit. It needs a displacement source we do not have.
  - Refitting the coupling. The fit already showed a cliff, not a band.

## 3. Design

### 3.1 The cap

Through a push (`track.push !== null`), in carry mode (`carryLoad`), from contact until the restart:

- Each arm's flex drive is computed as now: D_top, D_bottom (`flexForce`, the force the arm applies to its chain's
  forearm). This includes the push intent through the feed-forward.
- Their forward sum along the aim is a = (D_top + D_bottom)·aim. If a > F_push, the excess e = a − F_push is shed:
  - **Split.** Each arm sheds e·(its forward drive)/a, counting only arms whose forward drive is positive. My call:
    pro rata, so neither arm pushes against the other.
  - **The yield.** An arm sheds its part by sliding its flex target back along the aim by part/k_arm, so the spring
    gives way. The slid target is kept as the arm's yield offset in `GripState` (`topYield`, `bottomYield`, world-frame
    vectors along the aim). Once an arm's yield offset is non-zero, its damper term is also reduced to the shed share,
    because a target that cannot keep pace has no pace for the damper to chase. The drive is then recomputed, so the
    forward sum lands on F_push to rounding.
- **Bounded on one side only.** The cap holds only a forward excess. Backward and across-aim drives, and pitch, are
  untouched: the hands still steer, hold the slope and brake.
- **Under the cap the yield returns.** A yield offset decays towards zero at the arm's hold rate,
  exp(−dt·k_hold/c_hold), as a slid grip anchor does under its limit (P2b.2b.2c.2 design §4.1). An arm with spare
  strength therefore catches up with the plan.
- **At the restart the yield is cleared.** The re-anchor puts the plan at the head, so the gap it measured is gone.
- **A stroke with no push** keeps its offsets null and runs bit for bit.

### 3.2 Unchanged

- Everything before contact, and every stroke without a push.
- The push intent's law and τ_push.
- The grip limit and its slide (applied after the cap, to each hand's chain force as now).
- The bottom hand's guide from the departure, the restart (amendments 5–7), a check's own law, and the chains' masses
  and stiffnesses.

### 3.3 Reported, not tuned

`HandLoad` gains `pushHeld: boolean`, true at any step where the cap shed force, so the lab and the probes can show it.
No new reference value is needed: F_push already exists. This is new physics within the scorecard's non-goals: no
technique ruling changes and `reference/` is untouched. ENGINE_VERSION bumps.

## 4. Verification

**The discriminating run.** This is the plan's first task, and its gate: `gapProbe strike` at the reference values.
- **Expected:** at C25F and C25P the hands' along-aim force through the push is ≤ F_push at every step; C25F w₁/U
  falls towards 0.50, from 0.73; C25P becomes playable.
- **Expected at C10:** where the drive peaks under F_push, nothing moves.
- **If C25F w₁/U does not fall by at least half its excess** (to 0.62 or below), the design has the wrong mechanism.
  Stop and report, rather than tune.

**Then:**
- **Unit tests** (`tests/engine/impact/`):
  - a constant forward drive above F_push is held to it, split pro rata between the arms;
  - a drive under the cap is unchanged bit for bit;
  - the yield decays at the hold rate and is cleared at the restart;
  - a stroke with no push never sets a yield.
- **The suite.** Expected failures move only where §4's report says they move.
- **The scorecard.** A full card at the reference values, against the baseline (23.92):
  - every family's Σz²;
  - the C25 rows;
  - the pass and full rolls' coaching ratios (1.12 and 1.16 now), since their pushes also run under the cap;
  - lift.
- **G1's card read.** The croqueted ball's Ω₂ and v₂ become R·Δφ/Δx over its first 15 mm (register G1). This lands as
  its own commit, so each change's effect shows separately.
- **The refit.** The joint fit re-run from the reference values, budget 150, logged as before. It goes to the user's
  gate with the same comparison as 2026-11-17.

## 5. Risks

- **The pass roll's push.** The pass roll is the one shot Riches describes as pushed. If its push needs more than
  F_push, it shortens, and its ratio, already over its band, falls towards it. That is the right direction, but it is
  reported.
- **F_push is one arm's strength.** No open two-handed standing figure exists, so a two-handed push may be stronger.
  The bound, 106 N, is the evidence's ceiling. If C25 still overshoots at 106, strength is not the whole story.
- **A drive's chain momentum still exceeds 92 N for about 2 ms.** That is inertia, outside the cap by design. If the
  C25 excess turns out to be chain momentum rather than flex, the discriminating run shows it as no change.
