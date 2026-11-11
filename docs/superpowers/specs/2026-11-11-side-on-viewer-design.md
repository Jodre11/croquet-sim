# The side-on viewer: design

**Status:** design, 2026-11-11. **Follows:** the push map (P2b.2b.2c.3b, merged as PR 47); before P2b.2b.2c.3c
(the push-map design's A2 item 3, A7 item 12). **Roadmap:** "Decisions deferred to the relevant plan", the side-on
stroke view.

## Intent

The user (2026-10-26): "whenever we demonstrate a shot, I would like to have a side-on rendering of the stroke. This
doesn't have to be held by real hands, but the mallet should be rendered swinging through the air as it hits the balls.
This would allow me … initially to validate the strokes and then later it would be an excellent training aid for
learning how changing the envelope affects the contact movement." The viewer is the app's first real screen: a player
picks a shot, tunes its inputs, sees whether the envelope judges the settings viable, edgy or non-viable, and watches
the swing and contact side on. It serves the user's two goals (push-map design A10): defaults per shot that a player
tunes, judged against the envelope; and a grip chosen from the data within bounds the player moves.

## The user's decisions

Agreed 2026-10-30 to 2026-10-31, during P2b.2b.2c.3b:

1. The mallet starts drawn back over the balls in their set-up.
2. Controls for the five inputs: the lean, the feet, the strike, the push-through, and after first contact (accelerate
   or brake). The planned path redraws live as a dotted line.
3. Run animates the swing, the contact and the balls' first departure. Contact is the focus; the run-out is secondary.
4. Time: an automatic slow-down around contact, and a manual speed control with a scrubber, each optional.
5. Both hands are marked on the shaft, where they stay. Only the top hand's planned path is drawn as a guide, with
   ticks along it showing the shaft's angle. The leading face's path is drawn with ticks showing the face's angle.
6. Flags (turf yield, mishit, re-contact) are overlaid where they occur, with the turf depth shown.
7. A top-down inset shows the split and the balls' directions.

Ruled 2026-11-11 (one question at a time, each the recommended option):

8. **The engine runs in the browser.** A Run plays once at the reliable grip of the nearest swept plan in the grip
   record (`reference/derived/envelope-grip.json.gz`). "Looser" and "Firmer" step from it towards that plan's least
   and firmest grips. The model's own found-hold search runs only where the chosen grip does not play, and the viewer
   says so while it runs. The user had assumed that adjacent shots' grips would give a sensible grip; tested on the
   record's 2,000 held-out plans, the nearest starting plan's reliable grip plays in 84–98 % of them per type and
   moves the range and ratio by a median 0 % (90th percentile 0–2.4 %). Many plans' outcome is the same at every grip
   that plays (28 % of half rolls to 100 % of single balls), which is why a fit of the grip itself mostly failed
   (A10 item 3) while the neighbour works. Measured in Node on the development machine, one play takes 0.14–0.46 s
   on the drive, the AC stop, the single ball and the half roll, and 2–5 s on the full and pass rolls; the found-hold
   search 0.2–1.6 s on the swing strokes and 19–25 s on the full and pass rolls.
9. **A shot starts from its default.** The player picks the type, the striker's range, the lawn (6, 10 or 14 s) and,
   on the pass roll, the split; the viewer loads that default from `envelope-defaults.json` (A10 item 5). The inputs
   then tune it, and a badge shows its band (viable, edgy, non-viable with its class) as they move. The record keys
   its defaults by the ratio label reached, not the type, so what the pick is is §7's open question 1.
10. **It is the app's first screen**, in the Svelte app with Canvas 2D drawing and the engine in a Web Worker, so P4
    reuses its renderer and worker. The prototype (`scripts/sideOnExport.ts`, `scripts/sideOnPage.html`) is retired
    once the viewer shows what it shows.
11. **The strike is set as the range.** The player sets the striker's distance; the viewer reads the power for it from
    the record, shows it beside the stroke effort, plays once, and shows the range achieved beside the range asked.
12. **Later, not now** (user, 2026-11-11): "when this works we can look at migrating to Rust in WASM for optimal
    performance."


## 1. Exit criteria

1. The band table equals the record at every grid point (a unit test in Node), and each type's default opens, plays
   and animates in the browser (the smoke test, §4).
2. The play the viewer runs is the map's: `src/lab`'s play (§3.1) is bit-identical, in Node, to the map's before the
   move on pinned samples, and the viewer's frame probes change no play.
3. Each of the user's decisions 1–7 is visible on screen, checked by the user at the gate.
4. Moving any input redraws the planned path within 100 ms on the drive's text book (the planner alone, no impact).
5. A Run's time is measured per type in Chromium on the development machine and recorded; there is no budget yet
   (P5 sets the budgets).
6. The checks pass: format, lint, `tsc`, `svelte-check` and the unit suite; the smoke test is run and its result
   recorded.

## 2. The screen

- **Shot:** the shot wanted, the range (the strike, decision 11), the lawn, and the split where the shot is a pass
  roll's. The record's defaults are keyed by the ratio label reached (`labelOf`, the ten labels of push-map design A7
  item 2, the single ball's its own), split, range and lawn, not by the type's hold: a label's defaults are swept from
  several holds, the least complex winning (A9 item 6). How decision 9's pick maps onto that, and whether the range
  is continuous, are §7's open questions; this section assumes their recommended answers (the label, 16 snapped
  ranges). The default loaded is the pick's `viable` plan where it has one, else its `least` (A9 item 6), and the
  screen names the hold it is played from ("from the full roll's hold"). Where the record has no default for the pick
  (the AC stop beyond 4.59 m on the 6 s lawn, among others), the screen says so and keeps the current set-up.
- **Inputs:** lean, feet, push length (`handReach`), after contact (`drive`, −1 brake to +1 accelerate, 0 natural),
  push window (`window`). Each is continuous within the span the map swept for the hold (the grid's graded span;
  beyond it the band is unknown and the control stops there). Grid values are marked as ticks. Onset and the full
  roll's speed gain are held at the loaded default's (A10 item 2).
- **Grip:** the chosen grip's firmness, with Looser and Firmer (decision 8) stepping by the grip sweep's 0.0625 within
  the neighbour plan's least and firmest. Shown with its source: "from the nearest swept plan" with its distance
  (A10 item 3), or "found by search". A grip the player stepped to is never overridden: if it does not play, the Run
  shows the fault. The search runs only for the neighbour's own grip; if it finds no grip that plays, the Run shows
  the play at full firmness and its class, as the map records it.
- **Badges:** before a Run, the envelope's judgement of the set-up from the band table (§3.3); after it, beside that,
  the Run's own outcome at the chosen grip (admissible or its class), since the table was graded at the found hold
  and the Run plays at another. Also the departures (timed and set-up counts, A9 items 7–10) and, for a plan with a
  timed change, the timing risk: the nearest grip plan's loss when played 5 and 10 ms early (A10 item 2).
- **Side-on canvas:** decisions 1, 5, 6; the balls; the turf line; the planned path dotted before a Run, the played
  path after it.
- **Top-down inset:** decision 7.
- **Time bar:** play and pause, speed, scrubber, automatic slow-down around contact (decision 4). The slow-down's form
  is the builder's (assumption: the playback rate eases down to 1/50 over the 20 ms each side of the impact).
- **Readout:** range asked and achieved, ratio and its label, stroke and push effort, power, the events and faults.

## 3. The parts

### 3.1 One play, shared by the map and the viewer

The functions on the map's play's call path move into a browser-safe module, `src/lab/` (assumption: the name), and
only those: `mapSetup`, `playJudged` and what they call in `scripts/pushMapRun.ts`, `searchFirmness`
(`scripts/firmness.ts`), `openWorld` and `opened` (`scripts/openLawn.ts`), `travelOf` (`scripts/ratioFit.ts`),
`feetReading` (`scripts/setupProbe.ts`), and the set-up helpers `pushMapRun.ts` takes from
`tests/engine/support/shot.ts`. The scripts and tests import them from `src/lab`; `src/` never imports `tests/` or a
script, and `src/lab` reads no `process.env` and imports no Node module. The grid (`scripts/pushMapGrid.ts`) stays a
script: the viewer's spans and ticks come from its data (§3.3).

The play keeps its `Math.cos` and `Math.sin` (`pushMapRun.ts`'s set-up), so `src/lab` plays the record's bits; the
engine's IEEE-exact lint is not extended to it. Bit-identity is asserted in Node; V8 runs the same `Math` in Chromium,
and other browsers' last bits are P5's cross-engine question. Pinned samples of each type (the found hold and a fixed
hold, at two powers) are captured before the move and asserted after it. The engine's public API
(`src/engine/index.ts`) is unchanged; `src/lab` imports engine internals, as the scripts do, since it is the map's
model, not the planner's.

The viewer's play adds probes for the frames (the prototype's: the head's pose, the hands, the balls, the turf force
and the face's force per step) and the trajectory (`strokeTrajectory`), and reads the departure from the handover.

### 3.2 The worker

The planned path (the planner alone) runs on the main thread, within exit criterion 4's 100 ms. A Web Worker runs
the play and the search. A newer Run terminates the worker and starts a fresh one, so a 25 s search never delays
what the player asked for next. The UI never waits on the worker.

### 3.3 The viewer's data

`scripts/viewerData.ts` (assumption: the name) builds the viewer's files from `reference/derived` into `public/viewer/`,
fetched by the app at run time (Vite's public directory, served under the app's `base`), committed with their
sources' SHA-256s, as the record is:

- **The defaults:** `envelope-defaults.json`'s `found` picks, without `fitted` or the header.
- **The band table:** per hold (type), from the found-hold record, each grid point's band, class and power at each
  range and lawn, indexed by the grid's axes, whose values the file carries. The record's band is viable, edgy, or
  blank; blank with a class is unplayable, blank without one (an unread neighbour, A3) is unknown. Powers are stored
  as 32-bit floats, which read back to the record's printed six significant figures. Budget: 6 MB gzipped for
  everything the viewer loads (assumption; the band, class and power columns alone gzip to about 2.8 MB as text).
- **The grip table:** each grip plan's type, inputs, power, three grips and timing losses (the plans are on the 10 s
  lawn; the viewer uses them on every lawn).

**Judging a set-up** (push-map design A3 item 1, A10 item 1). On a grid point the band is the record's. Between grid
points the set-up takes its cell's worst corner, an unplayable corner counting as edgy; a cell whose corners are all
unplayable is non-viable; an unknown corner makes it unknown. The power at a range is interpolated linearly in each
axis from the corners that have one; with none, Run is disabled and the screen says why.

**The nearest grip plan** (decision 8): among the grip table's plans of the same hold that have a reliable grip, the
least squared distance over the standardised inputs (lean, feet, drive, handReach, window, split, speedGain) and
power, each standardised by its standard deviation over those plans, as tested in decision 8. Starting and held-out
plans are both candidates.

### 3.4 Drawing

Canvas 2D, sized to the device's pixel ratio; side-on in the aim's vertical plane, as the prototype draws. The scale
fits the mallet's whole swing and the first 0.25 m of the balls' departure (the prototype's `DEPARTURE`). One theme,
its colours as CSS variables so a dark theme is cheap later.

## 4. Testing

- `src/lab`: the pinned samples bit-identical (§3.1), and the frame probes leaving a play unchanged.
- `viewerData`: every grid point's band, class and power read back equal to the record's; the corner rule, the
  interpolation and the nearest grip plan on constructed cases.
- The viewer's logic (the time bar's slow-down, the input spans, the badge's states, the worker's restart) as pure
  functions in the Node test environment; no DOM test environment is added.
- A smoke test with the `playwright-cli` skill, run by hand at the gate and recorded, not in CI: open, pick a default
  of each hold, Run, and check the readout and that frames were drawn.

## 5. Non-goals

- No game, planner placement or share links (P4); no player profiles (P3).
- No change to the engine's play or its public API; no change to the record.
- No flick (push-map design A7 item 13 closed it).
- No Rust or WASM yet (decision 12).
- No new map runs. The viewer reads the envelope as it is.

## 6. Housekeeping

`npm outdated` reports nothing; CI runs `ubuntu-26.04` with `actions/checkout@v7` and `actions/setup-node@v7`. No
new dependency is needed: the smoke test uses the `playwright-cli` skill outside the project.

## 7. Open questions, and assumptions to confirm at the gate

Open (spec review, 2026-11-11; each recommendation is assumed above until the user rules):

1. **What the player picks a shot by.** Recommended: the shot wanted, a ratio label, as the record keys its defaults;
   the screen names the hold the default uses. Alternative: the type's hold, which needs the defaults re-picked per
   type, and some type, range and lawn combinations would have none.
2. **The range control.** Recommended: snapped to the record's 16 ranges, the power read straight from the record.
   Alternative: continuous, the power interpolated in log range and the default loaded from the nearest grid range.

Assumptions: the module's and script's names; `src/lab` importing engine internals; the slow-down's form; the 6 MB
budget; the grip plans' 10 s lawn used on every lawn; no Run budget until P5.
