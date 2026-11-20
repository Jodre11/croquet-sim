# The soft follow-through (gap G6, C3F's late hit)

Status: draft, 2026-11-20. Gap register G6 (`docs/superpowers/probes/scorecard/2026-11-16-gap-register.md`, "G6's
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

The scorecard must see a second hit wherever one happens, or no follow-through rule can be checked. Today the impact
ends when `stillReaching` finds no ball the face would reach within `LOOK_AHEAD`. The follow-through that comes after
has no head–ball contact.

**Change.** A tracked impact stays open while the planned path, from now to the hands' rest (`push.freed`, else the
drive's end), would bring the face within reach of a ball. Each ball is taken on at its present velocity, with no
deceleration. That is conservative: a slowing ball is caught sooner, so the impact may stay open a little longer than
it needs to, never shorter. The test reuses `outOfReach` and the face plane, sampling the remaining path every
`FOLLOW_SAMPLE`. `TRACK_IMPACT_CAP` (0.45 s) still bounds the impact. A run that reaches the cap while the path is
still closing raises `impact-cap` as today.

**Why not ball contact in the follow-through?** Phase 2 moves the balls after the impact. Contact in the follow-through
would mean running phase 2 inside it. Keeping the impact open lets the existing contact code see the hit, and raise
`impact-off-face` when it lands off the face.

**The late hit, named.** A late hit is a head–striker contact interval that starts more than `LATE_GAP` after the
striker's previous interval ended. `LATE_GAP` is 50 ms, twice the end of Gugan's A1R tap (25 ms); this is an
assumption. A late hit raises a new impact event, `impact-late-hit` (t, ball). In decision 5's order it comes with
`impact-off-face`, and it classes the play as a mishit, so practice may also leave it unpractised. The early taps,
within milliseconds of the strike, are untouched.

### 2.2 The reach scales with pace

The hands' travel after contact becomes handReach · min(1, U/U_ref(type)):

- **U** is the plan's head speed at contact, which `buildContact` already has.
- **U_ref** is a new per-type constant in the profile (`REACH_REF_SPEED`): the planned contact speed of the type's
  text book at its canonical power, read once and recorded. At canonical power or above, the scale is exactly 1, so
  the canonical strokes keep their pins to the bit.
- **Why linear:** a reach in proportion to U keeps the push's duration the same at every pace. A softer stroke is the
  same stroke played slower, not a shorter one played at the same tempo. This is an assumption; the run tests it.
- **Applies to** every preset with handReach above 0: the half, full and pass rolls. The swing presets have none.
- `pendulumAt` stays a fraction of the reach, so the pendulum phase comes proportionally sooner.
- An explicit `stroke.handReach` is the player's own choice and is not scaled.

### 2.3 The finish no longer stretches

`finishShare(V)` becomes min(1, V/FINISH_REF_PACE), with V the finish's pace (m/s), in place of amendment 3's stretch:

- a slow finish eases over a shorter time and carries for less;
- its travel, V·ease/2, falls as V²;
- at or above 4 m/s the share is 1, as today, so the full roll's rise, verified at power 1.0–1.1, is unchanged there;
- `FINISH_SHARE_MAX` is retired.

This supersedes flat push design amendment 3.

### 2.4 The brake, if the run needs it

The engine already has a brake: `stroke.drive` < 0 decelerates the hands over `handWindow`. After §2.2 and §2.3, the
run (§3) surveys the soft shots:

- **None of them late-hits:** no brake is added, and the user's "may brake" stays the player's own choice.
- **Some still late-hit:** the text book's drive for that type falls linearly from its default at U_brake to −1 at
  U_stop. Both are read from the survey: U_brake is the highest planned U at which any sampled stroke of the type
  late-hits, and U_stop is the lowest power the map plays. Both are recorded, and nothing is tuned to C3F.

### 2.5 Not in scope

- A follow-through set for the situation: a hoop, the peg or another ball in the path (the user: "moot for now").
- The refit. It follows this change, on its card.

## 3. The run

1. **Baseline survey.** Engine at the current HEAD, with §2.1's detection only: every Table 6 roll, the canonical
   strokes at the map's powers (`MAP_LAWNS`, the push map's power grid), and Gugan 4's single-ball rolls A1R–A4R.
   For each, report late hits (count and first t), `impact-off-face`, class and ratio. This shows how widespread the
   hidden fault is.
2. **§2.2 and §2.3.** The same survey, and the full scorecard against `2026-11-20-primed-push`.
3. **§2.4** only if step 2 leaves soft shots that late-hit, then the survey and card again.

**Expected.** The canonical pins hold to the bit at canonical power. The low-power Table 6 rolls (C1F, C3F, C3P, C3H)
and their ratios move. C3F plays clean. No canonical stroke late-hits.

**Stop.** The run stops and reports to the user if:
- any canonical pin moves;
- a Table 6 roll's w₁/U moves away from Gugan's by more than 1 z;
- after §2.4, any stroke still late-hits.

## 4. Assumptions

- `LATE_GAP` is 50 ms.
- The reach scales linearly with U.
- U_ref is the canonical power's planned contact speed.
- Balls move at constant velocity in the end test's look-ahead.
- The brake's ramp, if needed, is linear between U_brake and U_stop.
