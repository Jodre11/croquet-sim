<!--
    The side-on viewer, the app's first screen (side-on viewer spec §2, decision 10): pick a shot, tune its inputs, see
    the envelope's judgement, and Run it in the worker to watch the swing and contact side on.
-->
<script lang="ts">
    import { onDestroy } from "svelte";
    import type { FramedPlay } from "./lab/frames";
    import { judge, nearestGripAt, type BandTable, type GripPlan } from "./lab/judge";
    import { MAP_TYPES, openWorld, textBook, type MapPlan, type MapType } from "./lab/index";
    import type { StrokeExtras } from "./lab/play";
    import { defaultProfile } from "./engine/swing/profile";
    import { faceHalfHeight } from "./engine/impact/shape";
    import { headShapeOf } from "./engine/swing/buildContact";
    import { DEFAULT_CROQUET_GAP } from "./lab/canonical";
    import Badges from "./viewer/Badges.svelte";
    import Grip from "./viewer/Grip.svelte";
    import Inputs from "./viewer/Inputs.svelte";
    import Readout from "./viewer/Readout.svelte";
    import ShotPicker from "./viewer/ShotPicker.svelte";
    import SideOn from "./viewer/SideOn.svelte";
    import TimeBar from "./viewer/TimeBar.svelte";
    import TopDown from "./viewer/TopDown.svelte";
    import { loadData, loadTable } from "./viewer/data";
    import { HOLD_NAMES, labelsOf, lookupDefault, snapRange, splitsOf, type DefaultEntry } from "./viewer/defaults";
    import { departuresOf } from "./viewer/departures";
    import type { SideView } from "./viewer/draw";
    import { stepGrip } from "./viewer/grip";
    import { plannedPath, type PathSample } from "./viewer/plannedPath";
    import { createRunner, type WorkerLike } from "./viewer/runner";
    import { clampPlan, extraDefaults, inputSpans, offGrid, playableSpans, sameExtras } from "./viewer/spans";
    import { advance } from "./viewer/time";

    const RADIUS = openWorld(10).ball.radius;
    const HEAD = {
        length: defaultProfile.mallet.headLength,
        halfHeight: faceHalfHeight(headShapeOf(defaultProfile.mallet.head)),
        shaft: defaultProfile.mallet.shaftLength,
    };

    let defaults = $state<readonly DefaultEntry[]>([]);
    let grips = $state<readonly GripPlan[]>([]);
    let table = $state<BandTable | null>(null);
    let tables = $state<readonly BandTable[]>([]);
    let loadError = $state("");

    let label = $state("drive");
    let split = $state(0);
    let range = $state(1);
    let lawn = $state(10);
    let note = $state("");

    let type = $state<MapType>("drive");
    let plan = $state<MapPlan>(textBook("drive"));
    /** The inputs beyond the plan the player moved; each absent one is the type's default. */
    let extras = $state<StrokeExtras>({});
    let defaultEffort = $state<number | null>(null);
    let playerGrip = $state<number | null>(null);
    /** The found hold's firmness and the set-up it was found for: the default's record, or a Run's search. */
    let foundHold = $state<{
        plan: MapPlan;
        extras: StrokeExtras;
        range: number;
        lawn: number;
        firmness: number;
    } | null>(null);

    let framed = $state<FramedPlay | null>(null);
    let played = $state<{ firmness: number; searched: boolean } | null>(null);
    let running = $state(false);
    let searching = $state(false);
    let runError = $state("");

    let t = $state(0);
    let playing = $state(false);
    let speed = $state(0.25);
    let slow = $state(true);

    const ranges = $derived(table?.ranges ?? []);
    const labels = $derived(labelsOf(defaults));
    const splits = $derived(splitsOf(defaults, label));
    const spans = $derived(table === null || tables.length < MAP_TYPES.length ? null : playableSpans(tables, table));
    const typeDefaults = $derived(extraDefaults(type));
    const off = $derived(table !== null && offGrid(table, plan, extras, typeDefaults));
    // Off the grid the power is the nearest graded set-up's (hands-from-lean design §5.1), the record having none.
    const judgement = $derived(
        table === null ? null : judge(table, off ? clampPlan(inputSpans(table), plan) : plan, range, lawn),
    );
    const power = $derived(judgement?.power ?? null);
    const nearest = $derived(power === null ? null : nearestGripAt(grips, type, plan, power));
    // The found hold's firmness while the set-up is the one it was found for (gate ruling 1); null, searched on Run.
    const foundFirmness = $derived(
        foundHold !== null &&
            foundHold.range === range &&
            foundHold.lawn === lawn &&
            JSON.stringify(foundHold.plan) === JSON.stringify(plan) &&
            sameExtras(foundHold.extras, extras, typeDefaults)
            ? foundHold.firmness
            : null,
    );
    const firmness = $derived(playerGrip ?? foundFirmness);
    // The grip spans the whole playable range (hands-from-lean design §5.1); the nearest swept plan's is shown beside.
    const bounds = { least: 0, firmest: 1 };
    const swept = $derived(
        nearest !== null && nearest.grip.least !== null && nearest.grip.firmest !== null
            ? { least: nearest.grip.least, firmest: nearest.grip.firmest }
            : null,
    );
    const planned = $derived.by((): { path: PathSample[] | null; why: string } => {
        if (power === null) {
            return { path: null, why: "no power at this range: no corner of the set-up's cell has one" };
        }
        try {
            return { path: plannedPath(type, plan, power, extras), why: "" };
        } catch (error) {
            return { path: null, why: error instanceof Error ? error.message : String(error) };
        }
    });
    const runBlocked = $derived(
        table === null ? "loading" : power === null || planned.path === null ? planned.why : running ? "running" : "",
    );
    const startBalls = $derived(
        type === "single-ball"
            ? [{ x: 0, z: RADIUS }]
            : [
                  { x: 0, z: RADIUS },
                  { x: (2 * RADIUS + DEFAULT_CROQUET_GAP) * Math.cos(plan.split), z: RADIUS },
              ],
    );
    const view: SideView = $derived({
        path: planned.path,
        framed,
        t,
        balls: startBalls,
        radius: RADIUS,
        head: HEAD,
        feet: plan.feet,
    });
    const departures = $derived(departuresOf(type, plan, framed?.sample.strokeEffort ?? defaultEffort ?? 0));
    // Before a Run the planned path's span, so the swing replays along it (hands-from-lean design §5.2).
    const frameSpan = $derived.by(() => {
        if (framed !== null && framed.frames.length > 0) {
            return { start: (framed.frames[0] as { t: number }).t, end: framed.finish };
        }
        const path = planned.path ?? [];
        const [first, final] = [path[0], path[path.length - 1]];
        return first === undefined || final === undefined ? { start: 0, end: 0 } : { start: first.t, end: final.t };
    });
    const impact = $derived(
        framed === null ? { start: Infinity, end: Infinity } : { start: framed.impactStart, end: framed.impactEnd },
    );

    /** Any input changed (design §5.2): a Run is discarded and the swing replays from its first frame. */
    function replay(): void {
        framed = null;
        played = null;
        t = frameSpan.start;
        playing = true;
    }

    const runner = createRunner(
        () => new Worker(new URL("./viewer/worker.ts", import.meta.url), { type: "module" }) as unknown as WorkerLike,
    );
    onDestroy(() => runner.dispose());

    function pickDefault(asked: { label: string; split: number; range: number; lawn: number }): void {
        // Where the asked split has no default at this range and lawn (the pass roll's 0° at most ranges), the label's
        // first split that has one.
        const next =
            lookupDefault(defaults, asked) !== null
                ? asked
                : (splitsOf(defaults, asked.label)
                      .map((s) => ({ ...asked, split: s }))
                      .find((p) => lookupDefault(defaults, p) !== null) ?? asked);
        ({ label, split, range, lawn } = next);
        const found = lookupDefault(defaults, next);
        if (found === null) {
            note = "The record has no default for this pick; the set-up is kept.";
            return;
        }
        const { pick, from } = found;
        type = pick.type;
        plan = pick.plan;
        defaultEffort = pick.read.strokeEffort;
        extras = {};
        playerGrip = null;
        foundHold =
            pick.read.firmness === null
                ? null
                : { plan: pick.plan, extras: {}, range, lawn, firmness: pick.read.firmness };
        replay();
        note = `The ${from === "viable" ? "viable" : "least-complex"} default, from the ${HOLD_NAMES[pick.type]}'s hold.`;
        void loadTable(pick.type).then((loaded) => {
            if (type === pick.type) {
                table = loaded;
            }
        });
    }

    async function run(): Promise<void> {
        if (power === null) {
            return;
        }
        running = true;
        searching = false;
        runError = "";
        playing = false;
        const asked = { type, plan: $state.snapshot(plan), extras: $state.snapshot(extras), range, lawn };
        const stillAsked = (): boolean =>
            asked.type === type &&
            asked.range === range &&
            asked.lawn === lawn &&
            JSON.stringify(asked.plan) === JSON.stringify(plan) &&
            sameExtras(asked.extras, extras, typeDefaults);
        try {
            const result = await runner.run(
                {
                    type,
                    plan: asked.plan,
                    power,
                    lawn,
                    extras: asked.extras,
                    grip:
                        playerGrip === null
                            ? { source: "found", firmness: foundFirmness }
                            : { source: "player", firmness: playerGrip },
                },
                () => (searching = true),
            );
            // A Run whose inputs have since changed is dropped: the swing shown is the inputs' own.
            if (result === "superseded" || !stillAsked()) {
                return;
            }
            framed = result.framed;
            played = { firmness: result.firmness, searched: result.searched };
            if (result.searched) {
                foundHold = { ...asked, firmness: result.firmness };
            }
            t = frameSpan.start;
            playing = true;
        } catch (error) {
            runError = error instanceof Error ? error.message : String(error);
        } finally {
            running = false;
            searching = false;
        }
    }

    let last: number | null = null;
    function tick(now: number): void {
        if (playing && frameSpan.end > frameSpan.start) {
            const wall = last === null ? 0 : (now - last) / 1000;
            t = advance(t, wall, speed, slow, impact, frameSpan.end);
            if (t >= frameSpan.end) {
                playing = false;
            }
        }
        last = now;
        frame = requestAnimationFrame(tick);
    }
    let frame = requestAnimationFrame(tick);
    onDestroy(() => cancelAnimationFrame(frame));

    // The drive's table plays the first default; every type's spans the sliders once all have landed.
    Promise.all(MAP_TYPES.map(loadTable))
        .then((loaded) => (tables = loaded))
        .catch((error: unknown) => (loadError = error instanceof Error ? error.message : String(error)));
    Promise.all([loadData(), loadTable("drive")])
        .then(([data, drive]) => {
            defaults = data.defaults;
            grips = data.grips;
            table = drive;
            pickDefault({ label: "drive", split: 0, range: snapRange(table.ranges, 4), lawn: 10 });
        })
        .catch((error: unknown) => (loadError = error instanceof Error ? error.message : String(error)));
</script>

<main>
    <header>
        <h1>Croquet Shot Lab</h1>
        <p class="note">The stroke side on, played by the engine in your browser.</p>
    </header>
    {#if loadError !== ""}
        <p class="error">{loadError}</p>
    {/if}
    <div class="layout">
        <aside>
            <ShotPicker {labels} {ranges} {splits} {label} {split} {range} {lawn} {note} onpick={pickDefault} />
            <Inputs
                {plan}
                {spans}
                {extras}
                defaults={typeDefaults}
                onchange={(next) => {
                    plan = next;
                    replay();
                }}
                onextras={(next) => {
                    extras = next;
                    replay();
                }}
            />
            <Grip
                {firmness}
                source={playerGrip === null ? "found" : "player"}
                {bounds}
                {swept}
                distance={nearest?.distance ?? null}
                searched={(played?.searched ?? false) && foundFirmness !== null}
                onstep={(dir) => {
                    if (bounds !== null) {
                        // Stepping starts from the grip shown, else the nearest swept plan's reliable grip.
                        const from = firmness ?? nearest?.grip.reliable ?? (bounds.least + bounds.firmest) / 2;
                        playerGrip = stepGrip(from, bounds, dir);
                    }
                }}
            />
            <div class="row">
                <button
                    type="button"
                    class="run"
                    onclick={run}
                    disabled={runBlocked !== "" && runBlocked !== "running"}
                >
                    Run
                </button>
                <span class="note" data-testid="run-status">
                    {#if searching}
                        The chosen grip does not play: searching for one that does…
                    {:else if running}
                        Playing…
                    {:else if runBlocked !== "" && runBlocked !== "loading"}
                        Run is disabled: {runBlocked}
                    {:else if runError !== ""}
                        {runError}
                    {/if}
                </span>
            </div>
        </aside>
        <section class="stage">
            <Badges
                {judgement}
                outcome={framed === null ? null : { klass: framed.sample.klass, reason: framed.sample.reason }}
                {departures}
                timing={nearest?.grip ?? null}
                offGrid={off ? HOLD_NAMES[type] : null}
            />
            <div class="canvases">
                <SideOn {view} />
                <TopDown split={plan.split} departures={framed?.departures ?? null} />
            </div>
            <TimeBar
                {t}
                start={frameSpan.start}
                end={frameSpan.end}
                {playing}
                {speed}
                {slow}
                disabled={frameSpan.end <= frameSpan.start}
                onseek={(next) => {
                    t = next;
                    playing = false;
                }}
                ontoggle={() => {
                    if (!playing && t >= frameSpan.end) {
                        t = frameSpan.start;
                    }
                    playing = !playing;
                }}
                onspeed={(next) => (speed = next)}
                onslow={(next) => (slow = next)}
            />
            <Readout {range} {lawn} {power} {framed} firmness={played?.firmness ?? null} />
        </section>
    </div>
</main>
