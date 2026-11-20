# The soft follow-through (gap G6, C3F's late hit)

Status: draft, 2026-11-20, amended after review the same day. Gap register G6
(`docs/superpowers/probes/scorecard/2026-11-16-gap-register.md`, "G6's
primed push, for good" and "C3F's off-face play, traced").

## 1. Why

**The late hit.** On card `2026-11-20-primed-push`, C3F (Gugan 4 Table 6, a full roll at U 2.71 m/s, p 0.799) plays
`unpractised (impact-off-face)`. That one row scores 25 in Σz², more than Table 6 gains. The trace in the register:

- after the strike, the head's path speeds it from 1.07 m/s at 100 ms to 1.46 m/s at 300 ms;
- the striker's ball rolls at 1.25–1.29 m/s, so the head catches it up;
- the head's lower edge lands on top of the ball at 407 ms.

The baseline engine (8d9cc46) overtakes the ball the same way at about 290 ms. Its impact had ended at 96.6 ms, and
the follow-through has no head–ball contact, so that second hit goes unseen. The fault is older than law (d), which
only keeps the impact open long enough to see it.

**The model's rule is the opposite of play.** How far the hands travel after contact is the preset's `handReach`
(0.3 m in the full and pass rolls, 0.025 m in the half roll), whatever the power. Flat push design amendment 3
stretches a slow finish by up to 5× (`finishShare`, `FINISH_REF_PACE` 4 m/s, `FINISH_SHARE_MAX` 5): "a gentle
stroke's finish is long and gentle". That was recorded as an assumption, not a ruling.

**The user's account (2026-11-20).**
- "In low power shots I don't follow through, in very short soft shots I may brake the mallet to prevent a double
  hit."
- Near a hoop or another ball, braking may be needed in harder shots too.

**Sources.** The account agrees with them in direction, though none gives a figure.
- Gugan 4 §8: in every straight two-ball croquet stroke filmed, the mallet "follows closely behind the striker's
  ball" and taps it again within milliseconds. His weakest single-ball roll, A1R (0.92 m/s), taps again 15–25 ms
  after the first contact (https://oxfordcroquet.org/tech/gugan4/, read 2026-11-18, page SHA-256
  `862e21c87e857206eff63a9956407386e8167178c3e0275d619e2d02ae450b32`). Those early taps belong to the roll. A hit
  0.4 s and half a metre on does not.
- A Golf Croquet referees' note, "Double Taps & Crushes": a stroke "played without follow through (ie. as a stun
  shot)" carries "little likelihood of a double tap"
  (https://croquettas.com/wp-content/uploads/2017/07/GC-DoubleTapsCrushes.pdf, read 2026-11-20, SHA-256
  `da202c822ca8a4a0965fe87195d366fb8239b6424f6bbef3027d341151e0f120`).
- Riches (http://www.oxfordcroquet.com/coach/riches/croqtech/index.asp, page SHA-256
  `f9795faa03b603f8d4f656900d4a445abcc2d0986a271f5f64eec175b9e4f9ce`): the stop shot has "NO FOLLOW-THROUGH at all,
  or as little as possible"; the full roll's follow-through "should be as long as possible". Neither is given by
  power.

**The ruling (2026-11-20).** Option 1: how far the hands travel after contact, and the finish, shrink with the
stroke's pace instead of stretching, and the player brakes below a soft-shot threshold. Both are set from the
strokes' outcomes, not tuned to C3F. A follow-through set for the situation (a hoop or ball nearby) needs the
player to configure the shot for it. That is moot for now and out of scope.

## 2. Design

### 2.1 See the late hit

The scorecard must see a second hit wherever one happens, or no follow-through rule can be checked.

**What exists.** Flat push design amendment 5 already looks for this. After the impact ends, `integrateStroke` plays
the follow-through. `catchAt` (`src/engine/impact/integrate.ts`) then looks for a follow-through sample at which the
head touches a ball, and if it finds one the stroke is replayed with the impact held open to that time (`openUntil`).
But `catchAt` carries each ball on in a straight line at its velocity at the impact's end: no gravity, no bounce, no
lawn. The ball also moves at constant speed, so it stays further ahead of the head than the real, slowing ball.

- The model can therefore miss a real catch.
- That is C3F's own pattern: the ball slows by about 0.29 m/s² while the head speeds up.
- The baseline's impact ended at 96.6 ms, while the ball was still in the air after its turf lift (z 0.059 m at
  50 ms, rising). A straight line at that velocity lifts the projected ball over the head. That is a likely reason
  the baseline missed the catch at about 290 ms; it is unverified.

**Change.** `catchAt` carries the balls on with phase 2's own motion: the same ball model the shot's phase 2 uses
(gravity, the turf's bounce and rolling resistance), with the balls alone and no head. It no longer uses a straight
line. `stillReaching`, `LOOK_AHEAD`, the replay loop and `openUntil` are unchanged.

**The cap.** A catch at or past the cap is not replayed today, so it stays unseen, and the cap is only a guard
against an impact that never ends. In that case the stroke is replayed once more, with the cap moved to the catch
plus `TRACK_IMPACT_CAP`. A catch past that cap, or an impact still open there, raises `impact-cap` and classes the
play as unlawful, as today.

**How a late hit is judged.** No new event or criterion is needed. Once the impact is held open to the catch, the
existing contact code judges the late hit:
- **Off the face** (C3F's, on the edge): it raises `impact-off-face`. That is a mishit, and `bandMiss` reads it, so
  practice may leave the play unpractised.
- **On the face**, in a croquet or continuation stroke: it is a re-contact. It is grouped by `MERGE_SEPARATION` and
  is a possible fault under 29.1.6.1 only if its effect reaches `EFFECT_SPEED` or `EFFECT_ANGLE` (design decision
  10, the user's ruling). The play is then unlawful.
- **On the face**, in a single-ball stroke: it is a 29.1.6.2 fault.

The survey reads late hits from the face timeline and `strike.recontacts` (gap, time after the parting, effect).

### 2.2 The reach scales with pace

The hands' travel after contact becomes handReach · min(1, U/U_ref(type)):

- **U** is `contactSpeed` in `buildContact`: `poseSpeed` of the planned downswing, which the hold firmness already
  scales by (`HOLD_SPEED`).
- **U_ref** is a new per-type constant in the profile (`REACH_REF_SPEED`): the text book's `contactSpeed` at its
  canonical power, rounded down to 1e-3 m/s. That makes U/U_ref ≥ 1 there, so the scale is exactly 1 and the
  canonical strokes keep their pins to the bit.
  - A guard test recomputes each canonical `contactSpeed` and asserts it is at least U_ref and within 1e-3 m/s of it,
    so the constant cannot go stale unnoticed when a text book or preset changes.
  - This follows `HOLD_SPEED`'s precedent, a recorded speed that the engine's plan is scaled by.
- **Why linear:** a reach in proportion to U keeps the push's duration the same at every pace. A softer stroke is the
  same stroke played slower, not a shorter one played at the same tempo. This is an assumption; the run tests it.
- **The low point keeps the unscaled reach.** Without the shot's feet, the hands' arc low point is
  handArcLow·handReach. It feeds the downswing's arrival slope, which is planned before `contactSpeed` exists, and the
  push's s_low. So where `lowPoint` is unset, the arc gets lowPoint = handArcLow·handReach from the unscaled reach;
  where it is set, it is left as it is. The downswing and the hands' path at contact are then unchanged, and only
  the push's length moves.
- **Applies to** every preset with handReach above 0: the half, full and pass rolls. The swing presets have none.
- `pendulumAt` stays a fraction of the scaled reach, so the pendulum phase comes proportionally sooner.
- A shot's own `stroke.handReach` is scaled the same way, as the reach at full pace. (Was "not scaled": the text book
  gives every stroke its preset's reach explicitly, so the push map and the survey would never see the scale. Found
  in Task 3, 2026-11-20.)

### 2.3 The finish no longer stretches

`finishShare(V)` becomes max(FINISH_SHARE_MIN, min(1, V/FINISH_REF_PACE)) for V > 0, with V the finish's pace (m/s),
in place of amendment 3's stretch:

- a slow finish eases over a shorter time and carries for less;
- its travel, V·ease/2, falls as V² down to the floor;
- at or above 4 m/s the share is 1, as today, so the full roll's rise, verified at power 1.0–1.1, is unchanged there;
- `FINISH_SHARE_MAX` is retired.

`FINISH_SHARE_MIN` is 0.25: a 25 ms ease and let-go at least. The floor keeps the let-go ramp, which divides by its
span and the span squared, from turning a very soft finish's brake into an impulse. Both the floor and its value are
assumptions. With V = 0 the share stays 1 as today, though nothing moves and no timing then depends on it.

**Ruled in the run (2026-11-20).** The canonical full and pass rolls finish slower than 4 m/s, so §2.3 moves them;
the spec had assumed otherwise. Both already late-hit and still do: the full roll's moves from the edge to the face
(29.1.6.1), ratio 1.025 → 1.001, and the pass roll's ratio goes 1.048 → 1.042. The user accepted the move ("Accept the
move") over a per-type reference pace that would keep the pins: the canonical rolls are moderate pace, so the rule
applies to them, and one constant is not tuned to them. §3's "canonical pins hold" is waived for this step only.

This supersedes flat push design amendment 3.

### 2.4 The brake, if the run needs it

The engine already has a brake: `stroke.drive` < 0. It scales both pulses, the arc's and the hands', which are timed
from `arcStart` and `handStart` around contact. So a brake changes the strike as well as the follow-through: the
player checks the mallet as they hit. That is accepted, and §3's 1 z stop on w₁/U applies to it.

After §2.2 and §2.3, the run (§3) surveys the soft shots:

- **None of them late-hits:** no brake is added, and the user's "may brake" stays the player's own choice.
- **Some still late-hit:** the text book's drive for that type is lowered below some contact speed U_brake. U_brake
  is the highest `contactSpeed` at which any sampled stroke of the type late-hits. The shape of the drive's fall below
  U_brake is chosen from the survey and recorded as an assumption then. Nothing is tuned to C3F.

### 2.5 Not in scope

- A follow-through set for the situation: a hoop, the peg or another ball in the path (the user: "moot for now").
- The refit. It follows this change, on its card.

## 3. The run

1. **§2.1 alone.** Survey every Table 6 roll and the canonical strokes over the push map's power grid on `MAP_LAWNS`.
   For each, report the late hits (count, first t, region, and the re-contact's effect where on the face), the class
   and the ratio. Run the full scorecard against `2026-11-20-primed-push`. This step records how widespread the hidden
   fault is. Any pins it moves are re-pinned here as §2.1's moves, and the stop rules below are judged against this
   step's state.
2. **§2.2, then §2.3,** each in its own step: the survey and the card after each, so the finish's change is judged on
   its own outcome.
3. **§2.4** only if step 2 leaves soft shots that late-hit, then the survey and the card again.

**Expected.**
- The canonical pins hold to the bit through steps 2 and 3.
- The low-power Table 6 rolls (C1F, C3F, C3P, C3H) and their ratios move, and C3F plays clean.
- No canonical stroke late-hits.

**Stop.** In steps 2 and 3, the run stops and reports to the user if:
- any canonical pin moves;
- a Table 6 roll's w₁/U moves away from Gugan's by more than 1 z;
- after §2.4, any stroke still late-hits.

## 4. Assumptions

- The cap is moved once, to the catch plus `TRACK_IMPACT_CAP`.
- The reach scales linearly with `contactSpeed`.
- U_ref is the canonical power's `contactSpeed`, rounded down to 1e-3 m/s.
- The low point keeps the unscaled reach.
- `FINISH_SHARE_MIN` is 0.25.
- If the brake is needed, its shape is chosen from the survey.

## Review (2026-11-20)

Two reviewers, on what to cut and on what is missing. Applied:
- the new late-hit event and its 50 ms gap are cut, and the existing judges classify the hit;
- the end test was wrongly called conservative; §2.1 now mends amendment 5's `catchAt` instead of adding a test
  beside it;
- a catch past the cap is now seen;
- the low point keeps the unscaled reach;
- U is named as `contactSpeed`, and U_ref is guarded by a test;
- the finish's share has a floor;
- the brake's units are fixed, and its effect on the strike is stated;
- §2.2 and §2.3 are measured apart;
- step 1's moves are excused;
- the single-ball rolls A1R–A4R are dropped from the survey, as they have no playable setup.
