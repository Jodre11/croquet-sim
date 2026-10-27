# P2b.2b.2c.3a — The Unified Hand Model After Contact: Design Note

Task 4 Step 2, for the gate's stage 1 (2026-10-27). It answers plan decision 6's five questions against the code at
2f94f39 and section R of `2026-10-27-p2b2b2c3a-stage1.txt`. Each answer gives the options, the presets each moves,
a recommendation and its departures. "Swing law" is `handLoad` after relaxAt with `arc.mode` swing
(`track.ts:1887-1926`); "carry law" is `carryLoad` (`track.ts:1567-1686`). No code, no probes: the sizes below are
read from the code and the reference constants, not measured; the ratchet measures them.

## What the code does today, in one place

| Term | Swing law | Carry law |
|---|---|---|
| Swung body | the mallet and the arm mass m_a = 0.8 kg rigid at the top grip (`swungBody`, `track.ts:207`; chosen at `track.ts:915`) | the mallet and each holding hand's skin, 0.031 kg, at its grip (`carryBody`, `track.ts:228`) |
| Top hand's feed | γ_T × the whole F_s outside a check, γ_T × its moment share inside one, plus F_d (`track.ts:1896`) | its moment share plus F_d, γ_T never read (`track.ts:1594`, `1866`) |
| Bottom hand's feed | none outside a check, g_B × its moment share inside one (`track.ts:1911`) | its moment share (`track.ts:1650`, `1867`) |
| Holding the path | a top-hand damper c(γ_T) on the top grip's velocity lag, no spring (`track.ts:1897`) | each forearm flexed to the intended path from the actual grips, through its chain (`track.ts:1609-1658`) |
| Bottom hand's guide | a one-sided rate guide on the pitch-rate lag, × `guideEffort`; two-sided to [0, ω_path] in a check (`track.ts:1916-1918`) | the flex to a bottom target that turns with the planned pitch (`track.ts:1637-1658`) |
| Twist | g_B × the twist share in a check only, plus the twist damper (`track.ts:1912`) | g_B × the twist share always, plus the twist damper (`track.ts:1668`) |
| Opening | by reach, signed: (r − b)·(π − π_c) > `reachSlack` (`track.ts:1890`) | at the pendulum phase's start (`releasing`, `track.ts:1432`; `track.ts:1671-1674`) |
| After opening | a push along e, `guideEffort` × max(0, c_B × lag) (`track.ts:1906-1909`) | `pendulumEffort` × F_pendulum along e until the shaft is vertical (`track.ts:1683`) |
| Push intent, posture hold | none | min(R̃, F_push) along aim to the pendulum phase (`track.ts:1459`); the hold from first departure (`track.ts:1446`) |
| Check's share | `checkShare` (`track.ts:1731-1742`) | guarded off by `!carry` (`track.ts:1731`) |
| Finish | apex, or a check's rest (`integrate.ts:390-418`) | the first apex after the pendulum phase (`integrate.ts:415-416`) |

Two facts carry most of the recommendations below:
- **The rolls' grips are all 1** (γ_T = g_B = 1, `profile.ts:302-313`) and their `guideEffort` is 1 (`profile.ts:204`,
  `221`, `239`). Multiplying by 1 is exact in IEEE 754, signed zeros included, and `Math.sqrt(1)` is 1. So scaling
  a carry-law term by a grip or by `guideEffort` keeps the rolls bit-identical; adding a zero term would not.
- **On a free-pendulum path the bottom hand's moment share is about zero.** The moment shares (`track.ts:1771-1772`)
  put on the bottom hand the moment about the top grip that the path needs. A free path (λ = 0) is the solution of
  I_P·θ̈ = −W·sin θ − M·d·(A·t̂) for the same body (`computeFree`, `track.ts:853`; `freeAlpha`, `track.ts:709`), so
  that moment is zero up to the head's pitch error from the path and, inside a pulse, the pulse's own torque. The
  swing presets at canonical have no pulse outside a check (drive 0: `DEFAULT_DRIVE`, `profile.ts:322-330`;
  α = drive·speedGain·…, `buildContact.ts:785`). So the carry law's shares already reproduce the swing law's
  "top hand takes all, bottom hand none" there, but not to the bit.

## 1. The swung body: the chains on every stroke (A1)

**What moves on the swing presets, and why.** Under A1 `prepareTrack` builds `carryBody` on every stroke, with
`released` (`track.ts:915`, `937`), and the chains take hold at relaxAt (`track.ts:1603-1608`). Three mechanisms:
1. *The body.* The 0.8 kg arm mass at the top grip goes; 0.031 kg of skin sits at each grip. At the face, along aim,
   with the shaft upright, the effective mass (`effectiveMass`, `track.ts:252`) goes from about 1.1095 kg to about
   1.1075 kg on the drive (−0.18 %; arithmetic from `reference/mallet.json`, the head's pitch inertia taken as its
   measured moment about the shaft, the face being square). Through the effective mass alone the ball's speed off
   the face falls by about 0.05 %. The free table barely moves: a point mass at the pivot adds nothing to I_P, M·d or
   W in exact arithmetic (`pendulumOf`, `track.ts:442`), and the bottom skin adds 0.031·(r − b)², about 0.2 % of I_P.
   Every swing-preset run moves by rounding from t = 0, since the body also sets the pre-contact feed-forward and the
   firm gains (`track.ts:942-944`, `1798-1858`).
2. *The hold after contact.* The top hand's damper, c(1) = 2ζ·M·2π/T ≈ 234 N·s/m on M = 2.125 kg (`handGains`,
   `track.ts:269`; T = 0.08 s, ζ = 0.7), gives way to the chain driven by the arm's flex: k = k₀ + κ·|F| ≈ 170 N/m and
   c ≈ 12 N·s/m at |F| ≈ 20 N, or c_hold = 20.7 N·s/m while the posture hold acts (`flex.ts:25-36`). The chain's
   hand and fingers (0.26 kg) ride on the palm and fingers' 152 kN/m (a period of about 8 ms), the forearm
   (0.344 kg) on the wrist: within a 1 ms impact the hands barely load the mallet; over the follow-through about
   0.6 kg per hand rides with each grip. The hands thus hold the head's speed less through and after the impact.
3. *The bottom hand.* Its guide gives way to the flex (question 2) and its push after opening to the pendulum
   phase's push (question 3).

Predicted direction per preset (sizes for the ratchet):
- **Single-ball, drive.** Less push after contact. The drive's guide is its main lever on the ratio (2.435 at
  `guideEffort` 1, 3.753 at 0.75; `profile.ts:133-136`): weaker hands raise the drive's ratio and push its
  re-contact later or remove it. A1's retune of the drive's `guideEffort` is the likely response, upwards if any.
- **AC stop.** Its grips are 0.1 / 0.1, so its hands already hold little; the move is mainly the check's guide
  (two-sided, c_B(0.1)·(r − b), `track.ts:1917`) becoming the flex. A weaker brake leaves the head moving faster
  into the 10 ms before the hold: the ratio falls. It stands at 6.66 in a band of 6.55–7.75 (`profile.ts:289`), so
  a fall of 0.11 leaves the band: the A1 retune of its grip is likely.
- **GC stop.** Grips 1 / 1: its check's guide is the strongest (c_B(1) ≈ 234 N·s/m on a 0.355 m lever) and loses
  most. Its ratio falls. A1 allows no retune here: a ruled departure.
- **Rolls.** Bit-identical: their body and chains are today's.

**Is the rigid arm mass the chains' limit?** No. With the chain's elements stiff, each hand's 0.634 kg rides rigidly
at its own grip; today's limit is 0.8 kg at the top grip alone (`contact.json` `armMass` against the chain's masses).
They are different constants, so the chains do not reduce to today's swing presets in any limit.

**How the swing law's grips act through the chains.**
- *Option A — the grip scales the share only.* Each chain's arm is fed γ × its share (`chainFed`, `track.ts:1377`),
  the flex at full gain. The AC stop's loose hands (0.1) still hold the path at k_hold = 744 N/m: it moves most.
- *Option B (recommended) — the grip scales the share and the flex gains, as `handGains` scales the coupling.* Fed
  γ × its share; k(γ) = γ·k, c(γ) = √γ·c (`track.ts:269-281` is the precedent). The chain's own m·a and weight stay
  fed in full (`chainFed`), so a loose hand does not hang on the mallet. Rolls: ×1, bit-identical.
- *Option C — the grip scales the palm and finger elements (K3, K4).* A series spring still passes the arm's whole
  static force, so a loose grip would not be loose; and the hands' constants are kept (global constraints). Rejected.

**Departures (B):** every swing-preset run, from t = 0 by rounding and after contact by the mechanisms above; the
impact probe's snapshots on the swing presets gain `chains` (`chainsOf`, `integrate.ts:424`). The downswing still
plans on `swungBody` with the arm mass (`downswingInput`, `buildContact.ts:598`), as the rolls already do; no
backswing refit follows, since a point mass at the pivot leaves the plan's pendulum unchanged in exact arithmetic.

## 2. One control law after contact

Each hand, while it holds, through its chain, its forearm flexed to its point on the intended path. Term by term:

| Term | Unified | Governed by (spec §4) | Rolls | Swing presets |
|---|---|---|---|---|
| Top hand's feed | γ_T × its moment share, plus F_d | the grip (1) | ×1: identical | γ_T·F_s becomes γ_T × its share: differs by the bottom's share, about 0 (above) |
| Bottom hand's feed | g_B × its moment share | the grip (1) | identical | gains g_B × about 0 outside a check; inside one, as today |
| The damper | the flex's gains, × γ, √γ (question 1, B) | the grip (1) | identical | moves (question 1) |
| The rate guide | the bottom hand's flex to the turning target, its gains × `guideEffort`; a check's in full | 3c (`guideEffort`) | ×1: identical | one-sided rate guide becomes a two-sided, weaker flex: moves |
| The check's share | `checkShare` on any stroke with a brake; drop `!carry` (`track.ts:1731`) | 3c (the drive, α < 0) | α > 0: identical | identical term |
| Twist | g_B × the twist share always, plus the twist damper | the grip (1) | identical | gains g_B × the twist share, about 0 on a planar swing, outside a check |
| Posture hold | `holdWeight` from first departure, only with a push (length > 0) | 3b | identical | none: no push |
| Push intent, sensing | `pushIntent` and `pushResponse` only with a push | 3b | identical | none |
| Pendulum phase | `pendulumAt`, `pendulumEffort` on the push | 3c on 3b | identical | none: no push (question 3) |
| Slid anchor's decay | on every stroke: drop `!carry` (`track.ts:1849`) | every stroke | never reached: a roll is never gripped and has a downswing (`track.ts:1811`) | identical |

- *Option A (recommended) — the table above.* The carry law is the base; the swing law's terms become its grips and
  efforts, each a multiplier the rolls hold at 1. The first-departure latch (`integrate.ts:1154`), `ballsOnHead`
  (`integrate.ts:1106`) and the push intent run wherever the push has length. The chains step on every stroke with
  chains (`integrate.ts:1251`, `1420` lose their `carry` guard; `advanceChains` already skips null chains).
- *Option B — the swing law as the base.* The rolls' flex, hold, push intent and pendulum phase would have to be
  rebuilt as dampers and guides: every roll moves, against "the rolls stay held out" (A1). Rejected.
- *Option C — A with the guide kept one-sided* (the bottom flex never pulls the head back). That is a clamp only the
  swing presets would want, and the rolls' flex does pull: a rule whose only sensible settings are today's two
  laws. Rejected under §8.

**Departures (A):** the swing presets' guide becomes a flex, and their push after opening goes (question 3). Rolls:
none. The drive after its grip move puts a hand's width between the grips: the moment shares divide by a − b
(`track.ts:1771-1772`), so any residual moment comes through as a larger couple. Stage 2 watches its `grip-limit`.

## 3. The bottom hand's opening rule

Section R, all 678 roll runs: at the pendulum phase's start the shaft has turned **back** since contact, half roll
−34.6 mm, full −59.4, pass −97.0 at canonical, against a 30 mm slack (`reachSlack`, `profile.ts:266`), r − b 385,
310 and 360 mm. Signed as `track.ts:1890` signs it, 0 of 678 cross early; by size 604 do (half 152 of 226, full and
pass 226 of 226; the largest |travel| at release 1.23, 2.73 and 3.72 slacks). At canonical, by size, the bottom hand
would open at 59 ms against 66 (half), 40 against 81 (full), 36 against 83 (pass), as section R prints the times.

- *Option A (recommended) — the earlier of the reach, signed as today, and the push's pendulum phase.* Forward only
  (the head swinging ahead of the hands) counts. The physical reading: the slack is how far the bottom hand can
  follow a shaft turning away from it before its fingers open. A shaft turning back drives into the bottom hand's
  palm; it is the hand pushing it, and its arm folds as the push's posture. Rolls: bit-identical (0 of 678 cross;
  the test only reads `pitchNow` and `contactPitch`, `track.ts:1861-1863`). Swing presets: no push, so the reach
  alone, as today.
- *Option B — by size.* 604 of 678 rolls open early, mid-push on every full and pass roll: the hand doing the push
  lets go. Every roll moves, by up to 47 ms of release. Rejected.
- *Option C — the pendulum phase alone, the reach dropped.* The swing presets have no push and would never open:
  the bottom hand holds through the follow-through. Every swing preset moves. Rejected.

**A push of length 0 has no pendulum phase: this must be built.** `computePush` today gives it one at contact:
`travelTime` returns `contactAt` for a distance of 0 or less (`track.ts:764-766`, `793`), so `releasing` would be
true from contact (`track.ts:1432-1435`). The recommendation is no push at length 0 (`push` null, question 5).

**What opens with the hand.** On opening, by either cause: the bottom chain goes, the body becomes `released`
(`swungOf`, `track.ts:1263`), the top hand feeds the whole F_ff (`track.ts:1594`). After it the bottom hand pushes
along e with `pendulumEffort` × F_pendulum until the shaft is vertical, on every stroke (`track.ts:1683`). An
opening by reach before the pendulum phase leaves the push intent on the top hand alone until then; no preset run
does it (section R).

**Departures (A):** the swing presets lose their push after opening, `guideEffort` × max(0, c_B·lag)
(`track.ts:1906-1909`), since their `pendulumEffort` is 0: less follow-through on single-ball and the drive, the
same direction as question 1. Keeping that push on every stroke instead would add `guideEffort` 1 × c_B(1) to every
roll's pendulum phase and move them all.

## 4. The finish from the inputs

`finishKind` reads `arc.mode` (`integrate.ts:390-395`). Proposed: a brake (α < 0) takes the check's hold; else a
push (length > 0) the carried finish; else the free swing. Rolls (α > 0, a push): carried, identical. Stops: check,
identical. Single-ball and drive (α = 0, no push): swing, identical. The finish's kind moves no preset.

**A brake with a push.** Spec criterion 5's braked roll and pushed stop. The brake wins: the player stops the
mallet against the hands. The check finishes when the head is at rest relative to the hands (`integrate.ts:414`),
which a moving push meets at once; so the check, like the swing finish (`integrate.ts:407-409`), waits until the push
has ended. The swing finish's advance guard becomes the push's (question 5).

**The hold through the chains or the firm grip.** From `holdFrom` a check grips firmly (`gripped`, the pre-contact
branch, `track.ts:1798-1858`; `integrate.ts:1372-1373`, `1398`), not through the chains, and `continueStroke`
steps the chains only on a carry (`integrate.ts:1420`).
- *Option A (recommended) — the firm grip, as today.* The chains let go at the hold. The stops' hold keeps its law;
  only their 10 ms before it moves (question 1).
- *Option B — the hold through the chains with the posture hold.* k_hold = 744 N/m against the firm k(1) ≈ 8.6 kN/m
  on `carryBody` (`handGains`): the mallet drifts after a stop, against the ruled "no follow-through". Both stops'
  follow-through moves.

**A check on a held slope (λ = 1).** `holdPendulum` reads `freeOf(track, true)` (`track.ts:1106-1107`), and a fully
held slope has no table: `prepareTrack` returns before tabulating (`track.ts:956-958`) and `freeOf` throws a plain
Error (`track.ts:1002-1010`). Reachable today only by a hand-built swing arc at `slopeHold` 1 with α < 0.
- *Option A (recommended) — the hold on the track, not the table.* `held` moves from `FreePendulum` to
  `PreparedTrack`; `pendulumAt` returns it before its λ branches (`track.ts:1018-1046`). For λ < 1 it returns
  the same {θ_hold, 0, 0} the table did (`track.ts:1032-1034`, `1055-1057`): bit-identical. At λ = 1 θ_hold is the
  held path's (`heldPath`, `track.ts:1067`).
- *Option B — at λ = 1 no hold, the held slope's own rest.* `heldPath` brings ω_e to rest over `holdWindow`; a roll's
  brake leaves ω_e ≠ 0 (speedGain 0.1, `profile.ts:197`), so the mallet turns on after the check: not a hold.
- *Option C — reject a brake at λ = 1 with a named error.* Fails criterion 5's braked roll.

**Departures:** none on the presets.

## 5. The push through on every stroke, the advance merged into it

Today a still-hand stroke cannot push: with `handReach` > 0 and no advance, `computeReach` finds no travel and returns
null (`track.ts:737-739`), and only the advance moves still hands (`pivotAt`, `track.ts:663-672`). The advance is
swing-only and refused on a check (`checkAdvance`, `buildContact.ts:641-648`). The rolls' push runs at the plan's
own pace on the hands' arc and stops at once at the push length (`carryPivot`, `track.ts:806-823`). The swing
strokes' reach (`computeReach`) is the same push without the arc.

- *Option A (recommended) — one push: its pace the plan's travel plus the advance's, on the hands' arc, capped at
  the push length.* `push` is built wherever `handReach` > 0 and is null at 0, where today's resting reach runs
  (`restingReach`, `track.ts:717`): bit-identical for the still-hand presets. Its pace is the plan's along-aim
  travel (`travelTime`, `track.ts:762`), plus, where a shot gives `timing.advance`, the advance's ramp, cruise and
  ease (`advanceTravel`, `track.ts:634`); the path is the hands' arc (`handArcRadius`, `handArcLow`, or
  `stroke.feet`). The push intent, the posture hold and the pendulum phase act on it on every stroke. The free
  table includes it, as it does the advance today (`freeAlpha` reads `pivotAt`, `track.ts:711`). The reach and the
  separate advance go; `checkAdvance`'s check rule goes (a stop may push), its ramp check stays.
  - Rolls: no advance, so the plan's pace alone: bit-identical.
  - Swing presets: `handReach` 0, no push: identical.
  - Moved: shots and tests with `timing.advance`, or a swing stroke with `handReach` > 0. The advance's path becomes
    the hands' arc (it is level today, `track.ts:298-300`), and the push intent, posture hold and pendulum phase
    now act on it: with `pendulumAt` 0.8 the bottom hand opens at 0.8 of the push.
- *Option B — the advance kept as the still hands' push, the plan's pace otherwise.* A rule on whether the hands
  move at contact chooses between two pace laws: a dressed-up version of today's two. Rejected under §8.
- *Option C — the advance's ease at the end of every push.* It removes the push's velocity step at its end (a step
  the free table cannot see at λ < 1), but moves every roll. Recorded for P2b.2b.2c.3b's push map; not here.

A stop with a push through (criterion 5): the brake holds the pendulum relative to the hands, the push carries the
held mallet forward on the hands' arc, and the check finishes once the push has ended (question 4). A drive with a
push: the free pendulum about hands that travel the push, its table including their motion.

**Departures (A):** the advance's tests and any sweep setting `timing.advance` or a swing `handReach` > 0; no preset
at canonical. The push's stop at once stays a velocity step for any λ < 1 stroke that pushes (listed; C deferred).

## Summary

| Question | Recommendation | Presets moved |
|---|---|---|
| 1. The swung body | chains and `carryBody` on every stroke; each grip scales its hand's share and flex gains (k × γ, c × √γ); chain elements fixed | single-ball, drive (ratio up, re-contact later), AC stop (ratio down, likely out of band: A1 retune), GC stop (ratio down, ruled); rolls identical |
| 2. One control law | the carry law as base; γ_T, g_B, `guideEffort` as multipliers the rolls hold at 1; check's share, twist and anchor decay on every stroke; hold, intent and pendulum phase with a push | the swing presets, through the guide becoming a flex; rolls identical |
| 3. Opening rule | the earlier of the reach, **signed** as `track.ts:1890`, and the pendulum phase; a push of length 0 has none (built: today it would start at contact) | rolls identical (0 of 678 cross signed; 604 would by size); swing presets lose their push after opening |
| 4. The finish | brake → check's hold (waits for the push's end); push → carried; neither → free swing; the hold kept on the firm grip; `held` moved to the track for λ = 1 | none |
| 5. The push through | one push, its pace the plan's travel plus the advance's, on the hands' arc, capped at the push length; null at length 0 | none at canonical; the advance's tests and sweeps |
