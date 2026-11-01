# P2b.2b.2c.3b.1 shapes: design

Status: draft for the user's review, 2026-11-01.

Parent: docs/superpowers/specs/2026-10-31-p2b2b2c3b1-level-head-design.md, amendment B1 (§11, rulings 1–9). This
design implements B1's first phase: the strokes' shapes. It supersedes the parent's §5 (the finish's ease to rest).

## 1. Goal and scope

Get the planned and played shapes of the drive, half roll, full roll and pass roll right, judged by the user's eye on
side-on traces. Then, in a later phase, the envelope finds which push lengths, push accelerations and swing powers
reach each outcome (B1 ruling 4).

In scope:
- one finish for every stroke (§2);
- the half roll's text book as a drive with lean (§3);
- the lean's runaway on the push, which drives the top hand's flex (§4);
- the traces that the user judges (§5).

Out of scope:
- the envelope, the push map and their runs (the push map's Tasks 6–8 re-run and gate 2 stay deferred);
- the hands' assist and the flick, beyond their zero default;
- the drive's own flex (B1 ruling 8: it stays as it is, and the CA film is a later check);
- HAND_COUPLING and its ratioFit.

## 2. One finish (B1 rulings 2, 3, 7, 9)

Every stroke ends the same way from its push's end. On a stroke with no push, the push ends at contact.

- **The hands.** From the push's end they carry on along their arc (radius ρ_h = handArcRadius, low point s_low) as a
  point pendulum under gravity, starting from the pace V at the push's end: φ̈ = −(g/ρ_h)·sin φ, with
  sin φ = (s − s_low)/ρ_h. They stop at their apex (φ̇ = 0) and hold there. A long push leaves V low and φ already
  past the low point, so little swing is left. That is ruling 9's reduced follow-through, emerging rather than scripted.
  With V = 0 (no push) the hands stay still, as a drive's do today.
- **The mallet.** From the push's end the slope hold λ releases to 0. The shaft's planned pitch then runs as the free
  pendulum about the top hand (FreePendulum's equation, the hands' acceleration included through its inertial term),
  from its state at the push's end. On a stroke with no push it is today's swing, unchanged.
- **The end.** The finish ends at the mallet's apex after the push's end: its pitch rate about the axis at or below zero,
  today's swing criterion. The "carry" kind and push.rest's ease to rest (parent §5) are removed. A check (α < 0)
  keeps its hold.
- **The assist.** An input `finishAssist`, a torque on the swing scaled like the pendulum's effort, in [0, 1] and 0 by
  default. Through it the envelope will later tune ruling 7's assist on long shots and ruling 9's flick. In this
  phase it is only validated and carried, never set.

Assumption: the free pendulum about a moving top hand counts as ruling 7's one pendulum, the arms and mallet swinging
on together under gravity, with the hands only guiding. It reduces exactly to today's drive at zero push, so the drive
and its ratioFit stand.

## 3. Half roll's text book (B1 ruling 6)

The half roll becomes a drive with lean: stance lean 24° (unchanged, Gugan 4 Table 6), `handReach` 0, slope hold λ 0
(a held slope with still hands would hold the head still), DEFAULT_DRIVE 0. Its push values become the drive's,
speedGain 0.2 over 5 ms. That is an assumption, since a drive is the half roll's model. A short push stays a valid
shot variant through `stroke.handReach`. Its grip (bottom hand 0.42 m, firm) is unchanged.

The half roll's ratio band, 1.4–2.5, is read on the trace, not gated: the envelope tunes it.

## 4. The lean's runaway (B1 rulings 5, 8)

The rolls' played lean runs from the plan's ~30° up to 55°, and their top hand drifts up to 48 mm along and 33 mm low
off its path. The cause is not yet known, so this item starts with a diagnosis.

1. **Diagnose.** A probe script plays the full and pass rolls' text books, unpractised and practised, and logs every
   millisecond through the push:
   - the planned and played lean;
   - each hand's offset from its path;
   - each hand's force: feed-forward, flex and chain;
   - the balls' resistance.

   It says which of these sets the lean's growth: the feed-forward missing the balls' resistance; the firm bottom hand
   (g_B 1) levering the shaft about a yielding top hand; or practice's lift.
2. **Gate.** The probe's findings and a recommended fix go to the user. The fix is chosen there, not in this design.
3. **Fix and target.** The default target is a played lean within 5° of the plan through the push, and the top hand
   within 10 mm of its path. Both figures are assumptions, and the user's eye on the traces has the last word. Per ruling
   8, the flex stays with the top hand: the bottom hand stays near its path, and HAND_COUPLING is not changed.

## 5. Check

`scripts/pathTrace.ts` plays the drive, half roll, full roll and pass roll text books through practice at canonical
power. It draws the planned and played head, both hands and the balls' motion, as it does today. Each trace's
legend states:
- its ratio, the striker's ball's and the croqueted ball's distances to rest;
- the played lean's range;
- the top hand's largest offset;
- the follow-through's apex.

The traces are committed as probes and published to the user. Acceptance is the user's judgement by eye. No envelope
or push-map runs.

## 6. Versions, records and tests

- ENGINE_VERSION 0.20.0. Pinned tests that move with the finish or the half roll are re-pinned in the same commit, each
  with its reason.
- Tests:
  - the hands' finish conserves the pendulum's energy to the integrator's tolerance and stops at its apex;
  - at zero push the finish is bit-identical to today's drive;
  - a longer push at the same V gives a lower follow-through apex;
  - `finishAssist` outside [0, 1] fails validation and at 0 changes nothing;
  - the half roll has no push and finishes as a swing.
- Housekeeping: `npm outdated` runs first, and anything behind GA ships as its own small PR before this work.

## 7. Known risks

- Releasing λ at the push's end can step the planned pitch rate where the held slope and the free pendulum disagree.
  The practice's carry-through rule (parent §4 item 2) may need the same continuity. The tests above pin the step's
  size.
- The half roll's ratio moves with its lost push and may leave its band. It is read, not gated, in this phase.
- The diagnosis may find the runaway lies in practice itself, which would reopen parent §4.
