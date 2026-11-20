# The body behind the push (gap G2)

Status: draft, 2026-11-20. Gap register G2 (`docs/superpowers/probes/scorecard/2026-11-16-gap-register.md`, "G2",
"The third refit", "G2 stays open, narrowed"); the reality scorecard design's §6 route for a gap the fit cannot reach.

## 1. Why

The user's rulings:
- 2026-11-20, on the shown full roll: its ratio "is way off, closer to a half roll".
- 2026-11-20, "Six fitted, grip 0.08 s": the third refit's six values adopted; the grip period stays 0.08 s.
- 2026-11-20, "Body behind the push": in a roll the player leans in and pushes from the body through firm arms. The
  hands are a moving mass driven by the push and slow only as the balls' resistance makes them; they are not a fixed
  path reset to the head's pace.

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

A push stroke's hands are driven by a body of mass M_b moving along aim. Its state is the deficit δ (m/s) of its
along-aim pace v_b below the plan's hands' along-aim pace v_plan at the plan's time τ:

  v_b = v_plan(τ) − δ,  M_b·dδ/dt = F_g − F_press,  δ ≥ 0 (clamped),

- F_g: the grip's force on the head along aim, both hands' coupling, the press excluded (HandLoad.force · aim, as
  the hands pull the head forward; the head's reaction loads the body). Positive F_g is the head and balls holding the
  hands back.
- F_press: F_push (92.2 N, `reference/contact.json` pushForce) while the press acts today (`pushIntent`: the face on
  the striker's ball, before the pendulum phase), else 0.

The plan keeps the player's intended swing: unloaded, δ stays 0 and the hands run the plan exactly. Load slows the
body below the plan only by what exceeds the press, and the press never drives the hands ahead of the plan (δ ≥ 0):
the hands carry and do not chase, as ruled for the press on 2026-11-18 ("Carry, not chase").

δ starts at 0 at the strike (the first face–ball contact on the striker's ball; `grip.striker` latched).

### 2.2 The path's pace

From the strike to the body's end (§2.4) the hands' path runs on the plan's time τ with τ' = v_b / v_plan(τ),
integrated with the head (explicit step, the integrator's dt; τ'' from the step's dδ/dt and v_plan's slope, for the
feed-forward). The path keeps its place: no lag shift (`Anchor.by` is zero), since the body is continuous from the
strike and nothing resets it.

On these strokes the restart no longer re-anchors: the latch (`grip.departedAt`, `opened`, `restarted`) stays for
what reads it, and `reanchor` is not called. Strokes without a push, and checks, keep the restart as it is.

### 2.3 The press moves onto the body

`pushIntent` no longer enters the head's feed-forward on these strokes; F_press acts in §2.1 only. The head gains its
push through the grip, from hands the strike has not slowed. `HandLoad.intent` keeps reporting F_press for the probe.

### 2.4 The body's end and the finish

The body ends at the first of: the plan's push end (`push.end`) or the pendulum phase's start (`push.pendulum`), in
real time through the body's τ; or v_b ≤ 0. There it hands over to today's machinery as the restart did, with the
body's pace in place of the head's: `anchor = { at, rate: v_b / v_plan, by: 0, warp: warpOf(track, head, at, v_b) }`
(the warp only where the plan still speeds up, as in `reanchor`), offset so that the plan's time at `at` is the
body's τ. `retimeFinish` then runs unchanged (soft follow-through design §2.4): the finish never outpaces the
striker's ball.

### 2.5 M_b

New reference value `pushBodyMass` in `reference/contact.json`, provenance "analogue":
- **Value 2.9 kg.** Walilko, Viano and Bir (2005) measured an Olympic boxer's effective punch mass at 2.9 (SD 2.0) kg:
  the mass a strike from the body through a braced arm presents at the hand, the closest measured analogue of a push
  from the body through firm arms found. (Br J Sports Med 39(10):710–719, DOI 10.1136/bjsm.2004.014126,
  https://pmc.ncbi.nlm.nih.gov/articles/PMC1725037/, read 2026-11-20; the publishers refuse automated fetches, so the
  page is not hashed.)
- **Bounds 0.9–4.9 kg**, its mean ± one SD.
- **Corroboration.** Pan et al. (2018, above): a push raises the hand–arm system's apparent mass, more so below
  25 Hz, the combined grip and push "brought about a greater effective mass from the upper arm".

**armMass is kept** (1.081 kg, rigid at the top grip): it is the arms' inertia swung with the head; M_b is the body
behind the hands, beyond the grip's spring, and is never added to the head. A refit with M_b in place may move
armMass; that is not this design's (§2.7).

### 2.6 Unchanged

Strokes without a push; checks; the grip's law, period (0.08 s) and damping; the press's force and when it acts; the
finish clock and `retimeFinish`; the swing before the strike; every other reference value.

### 2.7 Not in this design

A refit with M_b; fitting M_b (it stays sourced unless the user rules otherwise); the soft drives' mid-swing finish
(register, "The braked drive").

## 3. Verification

**Unit tests** (engine 0.43.0):
1. With no load (F_g ≡ 0) δ stays 0 and the hands' path matches the plan's to rounding.
2. A constant F_g above F_press grows δ at (F_g − F_press)/M_b; at or below F_press δ stays 0.
3. M_b → ∞ (1e9 kg) gives the plan's path through the push: the strike does not slow the hands.
4. The no-push baseline (`fixtures/noPushBaseline.json`: drive, single-ball, stop-ac) is unchanged to the bit.
5. The hand-over at the body's end is continuous in the path's place and pace.

**The discriminating run.** Card `2026-11-2x-push-body` against `2026-11-20-refit3-grip80`, at M_b 2.9 kg and at
each bound (0.9, 4.9). It passes at 2.9 kg if all hold:
- `coach.full-roll` in 1.00–1.20 and `coach.pass-roll` ≤ 0.99;
- the half roll stays in 1.4–2.5;
- Table 6's w₁/U z improves in C3F, C3P, C10F and C1F, and no Table 6 row moves past |z| 3 that was inside it;
- the head does not outrun the striker's ball: in every Table 6 roll W ≤ w₁ + 0.03 U at the read (Gugan: W ≈ w₁);
- the objective is at most 5.13;
- the look holds: clean rides, lift within 0–5 mm.

**Stop rule.** If 2.9 kg fails, the run reports both bounds and stops; no value between them is tried and nothing is
tuned. The user rules on the next step.

## 4. Risks

- **The head catches the ball.** Hands kept near the plan's pace after the strike may pull the head into the
  striker's ball again: Gugan's W ≈ w₁ says head and ball travel together, but a pull past w₁ is a chase. The run's
  W ≤ w₁ + 0.03 U row measures it; `retimeFinish` bounds only the finish.
- **The half roll.** It is in band today; a body behind the push may carry its striker's ball further too and lower
  its ratio. Its row is a pass condition.
- **Explicit τ.** The body's τ is integrated per step, not precomputed like the warp; at dt it must stay smooth
  enough for the feed-forward's τ''. Test 5 and the look rows cover the joins; a jagged τ'' shows in the hands' load.
- **M_b is an analogue.** A punch is a strike, not a held push; the bounds are wide for that reason.
