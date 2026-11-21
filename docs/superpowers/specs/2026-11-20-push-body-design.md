# The body behind the push (gap G2)

Status: draft, 2026-11-20; amended after review 2026-11-21; amendment A1 (the body runs ahead, bounded) 2026-11-21. Gap register G2 (`docs/superpowers/probes/scorecard/2026-11-16-gap-register.md`, "G2",
"The third refit", "G2 stays open, narrowed"); the reality scorecard design's §6 route for a gap the fit cannot reach.

## 1. Why

The user's rulings:
- 2026-11-20, on the shown full roll: its ratio "is way off, closer to a half roll".
- 2026-11-20, "Six fitted, grip 0.08 s": the third refit's six values adopted; the grip period stays 0.08 s.
- 2026-11-20, "Body behind the push": in a roll the player leans in and pushes from the body through firm arms. The
  hands are a moving mass driven by the push and slow only as the balls' resistance makes them; they are not a fixed
  path reset to the head's pace.
- 2026-11-21, "Run ahead, bounded" and "Press window + ball cap" (A1), after the first run failed (register, "G2's push
  body, diagnosed"): the body may run ahead of the plan under the press, never faster than the striker's ball.

**The gap.** On the reference (card `2026-11-20-refit3-grip80`, objective 5.13) the canonical full roll plays at 1.2527
(band 1.00–1.20) and the pass roll at 1.1937 (≤ 0.99); the half roll is in band at 1.644 (1.4–2.5). In Gugan's Table 6
rolls the striker's ball leaves slow: w₁/U z C3F −2.94, C3P −2.56, C10F −2.39, C1F −4.03.

**What the fit says.** Three fits in a row asked for a short grip period; the third took 25 ms and with it brought
the full roll to 1.15 and the pass roll to 1.08 (fit card `2026-11-20-refit3-best`). At 16 Hz (62.5 ms, card
`2026-11-20-grip-wrist16`) the objective is 4.99, the full roll 1.23 and the pass roll 1.18: even the firmest sourced
grip barely helps.

**Why 25 ms is not a grip.** Pan et al. (2018) measured the hand–arm system's resonance against grip and push:
about 8 Hz at a 15 N grip, at a 30 N grip 16 Hz at the wrist and 12.5 Hz at the forearm, little change above 30 N, and
16 Hz at the wrist under a 30 N grip with a 50 N push. Sourced periods are 60–125 ms; 25 ms (40 Hz) is not among
them. (Pan, Xu, Welcome, McDowell, Warren, Wu and Dong, "The relationships between hand coupling force and vibration
biodynamic responses of the hand-arm system", Ergonomics 61(6):818–830, DOI 10.1080/00140139.2017.1398843; author
manuscript https://stacks.cdc.gov/view/cdc/210866/cdc_210866_DS1.pdf, read 2026-11-20, SHA-256
`17a89a9c975140968cecfaa8f9aea872e18fb376db9de59898945b2d2eb4e440`.)

**What the short period stands in for.** At the restart (`reanchor`, `src/engine/impact/track.ts`; roll launch
design §3.1c) the hands' path is re-timed to the head's along-aim pace as the strike leaves it: the impact has just
slowed the head to 0.39–0.42 U, so from there the hands follow a plan run at that pace. A stiff grip makes the head
pull the hands less in the moment before; a body behind the hands would make the strike slow them less at all. The
push probe (`scripts/gapProbe.ts push`) shows the hands' coupling impulse along aim after the departure is −0.08 to
+0.52 N·s at 0.08 s; the press gives 0.22–0.64 N·s on top (register, "G6's push").

## 2. Design

### 2.1 The push body

**Which strokes.** Every tracked stroke with a push that is not a check: `track.push !== null` and
`finishKind(track) !== "check"`. §2.1–§2.4 apply to these strokes and only to them. Every other stroke, the checks
included, is unchanged (§2.6).

On these strokes the hands are driven by a body of mass M_b moving along aim. Its state is the deficit δ (m/s): how far
its along-aim pace v_b falls below the plan's along-aim socket pace v_plan(τ) = path.socketVelocity · aim at the
plan's time τ. τ scales every point of the path alike, so the socket stands for all of them.

  v_b = v_plan(τ) − δ,  M_b·dδ/dt = F_g − F_press,  v_plan − max(v_plan, w₁) ≤ δ ≤ v_plan (clamped),

- F_g, the balls' resistance as the hands feel it: the grips' coupling along aim, that is the hands' force less the
  share of the feed-forward they carry, (HandLoad.force − (HandLoad.feedForward − dip)) · aim, with the head's
  reaction loading the body. It excludes the feed-forward, which is what the plan needs to swing the head and not a
  load on the body. It is positive when the head and the balls hold the hands back.
- F_press: F_push (92.2 N, `reference/contact.json` pushForce) while the press acts today (`pushIntent`: the face on
  the striker's ball, before the pendulum phase), and 0 otherwise.
- w₁: the striker's ball's along-aim pace, read from the same step's state as F_g. Before the strike's first step and
  after the impact's end there is no ball, and the body has not started or has ended (§2.4).

The plan keeps the player's intended swing. A head that tracks its path loads the coupling with nothing, but the
press still acts on the ball, so the body draws ahead of the plan (δ < 0) at (F_press − F_g)/M_b. Load slows it by
what exceeds the press. **A1, the lead.** The first run held δ ≥ 0, and with it the press did no work wherever the
coupling was below it, most of the impact (register, "G2's push body, diagnosed"). The body now keeps the press: it
may run ahead of the plan, bounded twice:
- **The press's window.** Only F_press drives a lead, and it acts only while the face is on the striker's ball before
  the pendulum phase. Once it stops, F_g alone acts: hands ahead of the head load the coupling forward of the head's
  pace, F_g > 0, and the lead decays.
- **The ball's pace.** v_b ≤ max(v_plan, w₁): the hands never move faster than the striker's ball, unless the plan
  itself is faster. This is "Carry, not chase" (2026-11-18: the push carries the head with the striker's ball and
  never drives it past) placed in the body. It is a ruling's limit, not physiology: a player cannot react to the ball
  within the impact.

The ceiling is small: the press's impulse after the departure is 0.22–0.64 N·s (register, "G6's push"), at most
0.08–0.22 m/s of lead at 2.9 kg. That is intended; nothing scales it.

τ' = v_b / v_plan may now exceed 1. With M_b = ∞ the body neither slows nor leads, δ stays 0, and the hands run the
plan: the first run's ∞ row.

δ starts at 0 at the strike, the first face–ball contact on the striker's ball (`grip.striker` latched).

### 2.2 The path's pace

From the strike to the body's end (§2.4) the hands' path runs on the plan's time τ, with τ' = v_b / v_plan(τ),
integrated once per impact step (explicit, at dt). τ'' comes from that step's dδ/dt and v_plan's slope and feeds the
feed-forward. The path keeps its place: there is no lag shift, since the body is continuous from the strike and
nothing resets it.

**Where τ lives.** The body is a new form of `Anchor`, `body: BodyClock`, holding the strike time, the step dt and
append-only arrays of τ and τ' per step. The impact appends to them as it steps; samples already written never change,
so `pathAt`, `plannedTime` and `anchoredTime` stay pure for any t up to the last sample. Between samples they
interpolate. Past the last sample (an instant the body has not yet reached) they extrapolate at the last τ', which is
Infinity for `anchoredTime` at a τ' of 0, as at a fixed rate of 0 today. The hand-over (§2.4) replaces the clock with
a fixed-rate anchor, so after the impact nothing reads the arrays.

**The restart.** On these strokes the restart no longer re-anchors. The latch (`grip.departedAt`, `opened`,
`restarted`) stays for what reads it, the phase-1 grip-limit event included, and `reanchor` is not called.

### 2.3 The press moves onto the body

On these strokes `pushIntent` no longer enters the head's feed-forward; F_press acts in §2.1 only. The head gains its
push through the grip, from hands the strike has not slowed. This is the physical reading of "driven by the push":
the player's force acts on the body and the body acts on the head through the grip. Pressing the head as well would
count the press twice. `HandLoad.intent` keeps reporting F_press for the probe, and its comment is reworded to say
that on these strokes it acts on the body and is not within `feedForward`.

### 2.4 The body's end and the finish

The body ends at the first of these:
- the plan's push end (`push.end`) or the start of the pendulum phase (`push.pendulum`), read on the body's τ;
- the impact's end, after which the balls are removed and nothing is left to resist the hands;
- v_b reaching 0 (δ = v_plan).

A1: the hand-over's rate may exceed 1, a lead carried into the follow-through. `retimeFinish` still bounds the finish
by the striker's ball.

There it hands over to a fixed-rate anchor, `{ at, rate: v_b / v_plan, by: 0, warp: null }`, offset so that the plan's
time at `at` is the body's τ. There is no warp: the push's end and the pendulum phase come after the plan's peak pace,
so a warp there would be a single sample, which `reanchor` already drops. At a rate of 0 the plan freezes and
FOLLOW_CAP ends the stroke, as `reanchor` behaves at rate 0 today. `retimeFinish` then runs unchanged (soft
follow-through design §2.4): the finish never outpaces the striker's ball. The impact's tests on the plan's instants
that already read `plannedTime` (`retimeFinish`'s trigger) now read the body's τ. Those in real time (`waiting`, the
lift's release at `push.end`) stay as they are.

**The reports.** `run.anchor` reports the hand-over. The push probe's "after the departure" window (`gapProbe.ts
push`) moves from `anchor.at` to `run.departure + RESTART_HOLD`, the instant the restart used, so its impulses stay
comparable across cards.

### 2.5 M_b

New reference value `pushBodyMass` in `reference/contact.json`, provenance "analogue":
- **Value 2.9 kg.** Walilko, Viano and Bir (2005) measured an Olympic boxer's effective punch mass at 2.9 (SD 2.0) kg.
  That is the mass a strike from the body through a braced arm presents at the hand, and the closest measured analogue
  found for a push from the body through firm arms. A push also raises the hand–arm system's apparent mass (Pan et
  al. 2018, above). (Br J Sports Med 39(10):710–719, DOI 10.1136/bjsm.2004.014126,
  https://pmc.ncbi.nlm.nih.gov/articles/PMC1725037/, read 2026-11-20. The publishers refuse automated fetches, so
  the page is not hashed.)
- **Bounds 0.9–4.9 kg**, its mean ± one SD.

**armMass is kept** (1.081 kg, rigid at the top grip). armMass is the arms' inertia swung with the head; M_b is the
body behind the hands, beyond the grip's spring, and is never added to the head. A refit with M_b in place may move
armMass; that is not part of this design (§2.7).

### 2.6 Unchanged

- Strokes without a push, and checks.
- The grip's law, its period (0.08 s) and its damping.
- The press's force and when it acts.
- The finish clock and `retimeFinish`.
- The swing before the strike.
- Every other reference value.

Push strokes other than the rolls (the grip plans with a reach, `reference/derived/grip-plans.json`) change too. That
is accepted: the scorecard's objective and the re-pinned moves guard them.

### 2.7 Not in this design

- A refit with M_b.
- Fitting M_b: it stays sourced unless the user rules otherwise.
- The soft drives' mid-swing finish (register, "The braked drive").

## 3. Verification

**Unit tests** (engine 0.44.0; 0.43.0 named the first run's δ ≥ 0, reverted in 5ecad80):
1. A push stroke played with no balls: its head tracks the path, so δ stays below 1e-3·v_plan throughout and the
   hands' path matches the plan's to that tolerance.
2. A constant F_g above F_press grows δ at (F_g − F_press)/M_b; below F_press δ falls at the same rate, through 0, to
   a lead (A1).
2a. The lead stops at the ball's pace: with w₁ held, v_b never exceeds max(v_plan, w₁), and with w₁ below v_plan the
   body never runs ahead of the plan.
2b. With no press (F_press 0, after the window) and F_g > 0, a lead decays.
3. With M_b → ∞ (1e9 kg) the hands follow the plan's path through the push: the strike does not slow them.
4. The no-push baseline (`fixtures/noPushBaseline.json`: drive, single-ball, stop-ac) is unchanged to the bit.
5. The hand-over at the body's end is continuous in the path's place and pace.
6. A stroke with a push that is a check plays as before (gate, §2.1).

**The discriminating run.** Card `2026-11-2x-push-body` against `2026-11-20-refit3-grip80`, at M_b 2.9 kg, with an
M_b = ∞ row in the same run. A1: the ∞ row is replayed as a check on the re-implementation; it must match card
`2026-11-21-push-body-inf` (objective 15.90). With a lead the body no longer only slows the hands, so ∞ is no longer
the most carry. The run passes at 2.9 kg if all of these hold:
- `coach.full-roll` is in 1.00–1.20 and `coach.pass-roll` is at most 0.99;
- the half roll stays in 1.4–2.5;
- Table 6's w₁/U z improves in C3F, C3P, C10F and C1F, and no Table 6 row inside |z| 3 moves past it;
- the head does not outrun the striker's ball: W ≤ w₁ + 0.03 U at the read in every Table 6 roll (Gugan: W ≈ w₁);
- the objective is at most 5.13;
- the look holds: clean rides, lift within 0–5 mm.

**Stop rule.**
- If the ∞ row does not reproduce `2026-11-21-push-body-inf`, the run stops: the re-implementation is wrong.
- If 2.9 kg fails, the run plays the bounds (0.9 and 4.9 kg), reports all three and stops. No other value is tried
  and nothing is tuned.
- The user rules on the next step.

## 4. Risks

- **The head catches the ball.** Hands kept near the plan's pace after the strike may pull the head into the
  striker's ball again: Gugan's W ≈ w₁ says head and ball travel together, but a pull past w₁ is a chase. The run's
  W ≤ w₁ + 0.03 U row measures it; `retimeFinish` bounds only the finish.
- **The half roll.** It is in band today; a body behind the push may carry its striker's ball further too and lower
  its ratio. Its row is a pass condition.
- **Explicit τ.** The body's τ is integrated per step, not precomputed like the warp; at dt it must stay smooth
  enough for the feed-forward's τ''. Test 5 and the look rows cover the joins; a jagged τ'' shows in the hands' load.
- **M_b is an analogue.** A punch is a strike, not a held push; the bounds are wide for that reason.
- **The lead is small (A1).** At most 0.08–0.22 m/s at 2.9 kg, and the 0.08 s grip passes little of it to the head
  within the read; the press on the head in 0.42.0 delivered its impulse directly. The run may fail again. If so, the
  press's route to the ball is the open question, not M_b.
- **Two changes at once.** Ending the re-anchor and moving the press off the head both move the ratio, and the run
  cannot tell them apart. The head loses the press's direct 0.29–0.71 N·s (register, "G6's primed push, on the
  ball"). The ∞ row does not show the re-anchor's share alone: there the press is lost, not idle (register, "G2's push
  body, diagnosed").
