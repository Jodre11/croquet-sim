# The jab's heel friction: design

Status: draft, 2026-11-27. Rulings open (§5).

## 1. Goal

Play Gugan 5's jab stop as Gugan played it and have the model give his results (user, 2026-11-27: "play the shots as
Gugan did and the model models the same results that Gugan got"). Gugan 5 says of the jab that "friction between the
ground and the heel of the mallet stops it soon after impact". He measured the second tap at 0.400U, against 0.463U
for an unrestricted mallet, and the best stop at 0.295U; the stop's ratio was 7.15. The model gives 0.428U and 5.59
(gap register, "The stop shots aren't stoppy").

## 2. What the model does now (measured, 2026-11-27)

The probe is Gugan 5's setup: lean −7°, 5 mm jab, dip from 10 ms early, the head/turf load traced at every step.

- **First tap:** 10.01–10.57 ms; the head falls from 3.00 to 1.29 m/s along the aim. **Second tap:** from 11.05 ms.
- **The heel grounds at 10.58 ms**, between the taps, as the jab intends.
- **Between the taps the turf pushes back 3–15 N along the aim**, with 6–26 N vertical. The impulse is about
  0.004 N·s, so the head slows by under 0.005 m/s before the second tap.
- **Gugan's brake needs about 175 N.** From 0.428U to 0.400U at U = 3.0 m/s is 0.084 m/s on the 1.04 kg effective
  mass (Gugan's 2.30 lb) within about 0.5 ms. To reach the 7.15 ratio, the head probably needs more.
- **The friction law is not what falls short.** The turf's horizontal load is already about 0.6 of its vertical,
  which is the sole friction's cap (µ = 0.5, plus a little ploughing). The shortfall is the bearing. Only the back
  corner touches, a few BED_CELL columns at under 0.3 mm, so N_b stays under 30 N.

**Why only the corner touches.** The canonical stop strikes the ball 22.5 mm below the face centre (canonicalUp). At
−6° lean, that leaves the back corner 5.8 mm above the turf at contact. At a level lean the sole is about 39 mm up.
Each extra degree of back lean drops the corner by about 5.6 mm. The head is in the turf at contact from about −7.5°.

**What a grounded sole would bear.** The default box head's sole is about 0.279 × 0.057 m (0.016 m²). On the fitted
bed (k_w = 1.62e8 N/m³), a sole pressed 0.2 mm into the turf bears about 520 N. At µ = 0.5 that gives a 260 N brake.
The bearing stays elastic up to p_y/k_w = 1.48 mm: at 0.2 mm the pressure is about 32 kPa, against a yield of 240 kPa.
So the turf takes no set and raises no turf-yield. The head's own downward momentum at the jab's −0.34 m/s is about
0.35 N·s, enough to supply that bearing for the half millisecond. **The brake Gugan describes is within the present
law's reach, if the sole lands rather than its corner.**

**Grounding the head is a timing problem.** A probe with the sole 1 mm above the turf at contact (lean 0°, contact
16 mm above the face centre) grounded the head 5 ms into the swing, long before the ball. The dip's own hand drop
carried it into the turf, and it then ploughed for 66 ms (turf-yield, impact-head-deep). The sole's height at the
planned contact has to allow for the dip's depth up to that moment.

## 3. Options

**A. Ground the sole at the first tap; the law stays as it is (recommended).**

The jab stop is planned so that the sole, level or heel-first at a small back lean, reaches the turf at the end of
the first tap. The dip then presses it in between the taps.

- **A new planner target:** `soleAtContact` (m), the head's lowest point above the turf at the planned contact,
  counted with the dip's drop to that moment. The planner solves the stance's contact height `up` for it, as it
  already solves the lean's hands.
- **Gugan 5's setup:** the stop's lean and `soleAtContact` are fitted to the jab check's 0.400U at 5 mm, with the
  ratio held out as the test.
- **No new constants.** The friction (µ 0.5), the bed and the yield keep their sources.
- **For:** it is the physics Gugan names, uses only sourced constants, and leaves the turf undamaged.
- **Against:** the jab stop's stance changes. The ball is struck about 14 mm above the face centre, not 22.5 mm below
  it. A stop played that way may change the croqueted ball's spin and the striker's ball's hop.
- **Against:** the plain stop (Table 5, as filmed) must keep its present stance, so the stance depends on the jab.

**B. Make the turf stiffer under impact.**

The turf's columns would be stiffer at impact rates (a Clegg-type impact modulus), so the corner alone bears hundreds
of newtons.

- **For:** the stance stays as it is.
- **Against:** k_w and τ_r were fitted together to Gugan 4's ball bounce (A4R: e 0.5, 7.2 mm). A stiffer bed breaks
  that fit, or needs a second, rate-dependent term with no croquet measurement behind it.
- **Against:** the corner's pressure would pass p_y, so the corner yields: turf-yield every jab.

**C. Let the heel bite.**

The heel's back edge would dig into the turf and plough, Reece's N_c on the edge's depth.

- **For:** it matches the word "jab".
- **Against:** the corner would have to go well beyond 2 mm to reach about 175 N, which is impact-head-deep and turf
  damage on every jab stop. That breaks the user's turf rule, unless a jab is exempted from it.

## 4. Acceptance (option A)

1. **Gugan 5's jab check:** the second tap within ±0.02U of 0.400U at the 5 mm jab, and the jab check's `.fails`
   test passing.
2. **Gugan 5's stop ratio:** moves toward 7.15. This is held out, not fitted; report it whatever it is.
3. **No turf damage:** no turf-yield or impact-head-deep on Gugan 5's jab stop or on the default AC stop.
4. **Table 5 unchanged:** played plain, as filmed; the objective stays at 6.64 ± 0.01.
5. **Engine:** version bumped, the card re-run, and the gap register entry updated.

## 5. Rulings for the user

1. **Option.** A, B or C. Recommended: A. **Ruled A** (user, 2026-11-27): "A is what the player does in practice".
2. **The default AC stop.** Does the default AC stop (power-dependent, the coaches' row) adopt the grounded jab, or
   only Gugan 5's setup? Recommended: the default too, since the jab is the default since 2026-11-27 and a jab whose
   heel never reaches the turf is not Gugan's jab.
3. **Turf contact.** A grounded sole rubs the turf without damage. Is a jab allowed to raise turf-yield if the fit
   needs it? Recommended: no. Keep the turf rule, and report the shortfall instead.
