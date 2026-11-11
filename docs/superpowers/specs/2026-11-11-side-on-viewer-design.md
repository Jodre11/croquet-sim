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
   then tune it, and a badge shows its band (viable, edgy, non-viable with its class) as they move.
10. **It is the app's first screen**, in the Svelte app with Canvas 2D drawing and the engine in a Web Worker, so P4
    reuses its renderer and worker. The prototype (`scripts/sideOnExport.ts`, `scripts/sideOnPage.html`) is retired
    once the viewer shows what it shows.
11. **The strike is set as the range.** The player sets the striker's distance; the viewer reads the power for it from
    the record, shows it beside the stroke effort, plays once, and shows the range achieved beside the range asked.
12. **Later, not now** (user, 2026-11-11): "when this works we can look at migrating to Rust in WASM for optimal
    performance."

## 1. Exit criteria

1. Every type's default, at every range and lawn in the record, opens, plays and animates in the browser; the
   badge's band equals the record's at grid points.
2. The play in the browser is the map's play: for pinned samples of each type, the viewer's play at a given hold is
   bit-identical to `playJudged`'s at that hold (§3.1).
3. Each of the user's decisions 1–7 is visible on screen, checked by the user at the gate.
4. Moving any input redraws the planned path within 100 ms on the drive's text book (the planner alone, no impact).
5. A Run's time is measured per type in Chromium on the development machine and recorded; there is no budget yet
   (assumption: P5 sets the budgets).
6. The checks pass: format, lint, `tsc`, `svelte-check`, the unit suite, and a browser smoke test.

## 2. The screen

- **Shot:** type, lawn, range (the strike, decision 11), split on the pass roll. Changing any of them loads the
  default (decision 9).
- **Inputs:** lean, feet, push length (`handReach`), after contact (`drive`, −1 brake to +1 accelerate, 0 natural),
  push window (`window`). Each is continuous within the span the map swept for the type (the grid's graded span;
  beyond it the band is unknown and the control stops there). Grid values are marked as ticks. Onset and speed gain
  are held at the type's (A10 item 2); the full roll's speed gain is not a control (assumption: A10 item 2's "the
  player sets neither").
- **Grip:** the chosen grip's firmness, with Looser and Firmer (decision 8) stepping by the grip sweep's 0.0625 within
  the neighbour plan's least and firmest. Shown with its source: "from the nearest swept plan" (and its distance,
  A10 item 3) or "found by search".
- **Badges:** the band; the departures (timed and set-up counts, A9 items 7–10); the timing risk, the nearest
  starting plan's loss when played 5 and 10 ms early (A10 item 2), shown only for plans with a timed change.
- **Side-on canvas:** decisions 1, 5, 6; the balls; the turf line; the planned path dotted before a Run, the played
  path after it.
- **Top-down inset:** decision 7.
- **Time bar:** play and pause, speed, scrubber, automatic slow-down around contact (decision 4). The slow-down's form
  is the builder's (assumption: the playback rate eases down to 1/50 over the 20 ms each side of the impact).
- **Readout:** range asked and achieved, ratio and its label, stroke and push effort, power, the events and faults.

## 3. The parts

### 3.1 One play, shared by the map and the viewer

The map's play (`scripts/pushMapRun.ts`'s `mapSetup` and `playJudged`, `scripts/firmness.ts`'s `searchFirmness`, and
the helpers they import from `scripts/openLawn.ts`, `ratioFit.ts`, `setupProbe.ts` and `pushMapGrid.ts`) moves into a
browser-safe module, `src/lab/` (assumption: the name), with no Node imports. The scripts import it from there. Its
plays are bit-identical to today's: pinned samples of each type (the found hold and a fixed hold, at two powers) are
captured before the move and asserted after it. The engine's public API (`src/engine/index.ts`) is unchanged; `src/lab`
may import engine internals, as the scripts do, since it is the map's model, not the planner's (assumption).

The viewer's play adds probes for the frames (the prototype's: the head's pose, the hands, the balls, the turf force
and the face's force per step) and the trajectory (`strokeTrajectory`), and reads the departure from the handover.

### 3.2 The worker

A Web Worker owns the engine. Requests: plan (the planned path for the current inputs), play (at a hold), and search
(the found hold). A newer request of the same kind cancels the older one's result (the engine call itself runs to the
end; assumption: no mid-play cancellation). The UI never blocks on the engine.

### 3.3 The viewer's data

Built from `reference/derived` by a script (`scripts/viewerData.ts`, assumption: the name) into compact files the app
loads, committed beside the record with its sources' SHA-256s, as the record is:

- **The defaults:** `envelope-defaults.json`'s found-hold picks, as is.
- **The band table:** per type, each grid point's band, class and power at each range and lawn, indexed by the grid's
  axes. About 1.08 M points; the size budget for everything the viewer loads is 3 MB gzipped (assumption).
- **The grip table:** each grip plan's inputs, power, three grips and timing losses.

A plan between grid points takes the worst band of its cell's corners (push-map design A3 item 1's rule), and its
power at a range is interpolated from the corners' powers, linearly in each axis and in log range (A10 item 1). A
cell's corner that is unread or off the grid makes the band unknown, never viable.

### 3.4 Drawing

Canvas 2D, sized to the device's pixel ratio; side-on in the aim's vertical plane, as the prototype draws. The scale
fits the mallet's whole swing and the first 0.25 m of the balls' departure (the prototype's `DEPARTURE`). Colours,
type and layout follow the app's first conventions, set here (assumption: a light and a dark theme from CSS
variables, as the dataviz palette's surfaces).

## 4. Testing

- `src/lab`: the pinned samples bit-identical (§3.1); the data packer round-trips the record (every grid point's band,
  class and power read back equal); the corner rule and the interpolation on constructed cells.
- The worker's request handling with a fake engine (cancelling, ordering).
- Svelte components by `vitest` with the DOM where they hold logic (the time bar's slow-down, the input spans).
- A browser smoke test with the `playwright-cli` skill: open, pick each type's default, Run, and check the readout and
  that frames were drawn.

## 5. Non-goals

- No game, planner placement or share links (P4); no player profiles (P3).
- No change to the engine's play or its public API; no change to the record.
- No flick (push-map design A7 item 13 closed it).
- No Rust or WASM yet (decision 12).
- No new map runs. The viewer reads the envelope as it is.

## 6. Housekeeping

`npm outdated` reports nothing; CI runs `ubuntu-26.04` with `actions/checkout@v7` and `actions/setup-node@v7`. None is
needed before this phase.

## 7. Assumptions to confirm at the gate

The module's and script's names; `src/lab` importing engine internals; the slow-down's form; the 3 MB budget; no
mid-play cancellation; the full roll's speed gain not a control; no Run budget until P5; the themes.
