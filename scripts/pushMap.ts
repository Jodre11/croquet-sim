/**
 * The rolls' push map (P2b.2b.2c.3b design; plan `docs/superpowers/plans/2026-10-29-p2b2b2c3b-push-map.md`): the
 * shards that play each roll type's grid, and the probe sections that read them. Recorded, not gated. Sections:
 * - lawn: plan decision 3, whether the impact depends on the lawn's speed: for each roll's canonical setup on the
 *   open lawn, the largest change in any handed-over ball's velocity between the 6 s and 14 s lawns' impacts and the
 *   10 s lawn's (impactLawnShift).
 * - matrix: plan Task B5, the workflow's jobs (shardMatrix) for TYPES (comma-separated, or all), STAGE, SHARDS (jobs)
 *   and ONLY (all, or one job of each type), printed and appended to GITHUB_OUTPUT when set.
 * - run: plan decision 9, one shard of TYPE's plans at STAGE (stagePlans; the text book alone, or by default the whole
 *   grid) on LAWNS (by default the grid's): the plans whose index is ≡ k mod N (SHARD=k/N), each played at the grid's
 *   powers on its lawns (playSample), appended to OUT as one JSON line per plan (shardLine) as it finishes. A sample
 *   the engine throws on is kept as its message at that power, and one outside the samples as the plan's; the shard
 *   goes on. OUT must be named `<TYPE>-<k>of<N>.jsonl`. Indices whose lines OUT already holds whole (doneIndices) are
 *   skipped, so a shard that died is re-run in place; a torn last line is ended first and its plan played again.
 * - merge: exactly the files `<TYPE>-<k>of<N>.jsonl` in IN merged (mergeLines) at STAGE and LAWNS as run played them,
 *   so no other run's file is read: the missing plan indices, the engine's errors (outside and inside the samples),
 *   the reads an engine error leaves out and the graded reads left unbanded for an unread neighbour are reported
 *   apart; each plan's reads at the grid's ranges and lawns (readsOf) are written to `<IN>/<TYPE>.reads.json` under
 *   the run's URL and commit (RecordHeader). A plan missing fails the process, after the write.
 * - cost: plan Task 5, the map's time: with PART=j/J, the j-th of J parts of COST_PLANS pass-roll plans drawn evenly
 *   is played at the grid's powers, each sample's seconds appended to `<IN>/cost-<j>of<J>.jsonl`; without PART, those
 *   files are tallied: the mean and 95th percentile per sample and each type's projected CPU hours on today's grid.
 * - stage1: plan Task B6, gate stage 1 (design A7 item 10), from IN's stage-1 shard files, every type. Per type: the
 *   text book played at its canonical power on the 10 s lawn at the found hold and at the fitted one, its range, ratio,
 *   label and whether it is in its band; its planned contact speed against its preset's within ±2 % (criterion 4); per
 *   lawn its reach (reachOf) and the class beyond it; its sweep sample by sample; and on the full and pass rolls the
 *   jumpiness bound (B-d7). It plays the two canonical samples itself. The workflow runs it after the merge.
 * - summary: plan Task 6 and Task 8, one roll's map from IN's shard files merged as merge merges them, and read at the
 *   grid's ranges and lawns (readsOf). The anchor (design §3.3) on the half roll, today's default (textBook), played at
 *   the canonical power on the 10 s lawn, which gives the canonical's range, and read at that range from its own sweep
 *   at the grid's powers. Its band is offGridBand's: unplayable if its play or read has a class, else its coarse cell's
 *   worst corner graded at that range from the merged sweeps (cellReads), an unplayable corner counting as edgy. On the
 *   full and pass rolls §3.3's anchor does not apply; instead A1's text-book validation, read the same way, and whether
 *   it lands in its region (A1's band). Then the region's admissible plans per range and lawn by band; the classes per
 *   range and lawn; the lawn's effect on the ratio; the least-effort plan per range and lawn; the non-monotone sweeps;
 *   and the set-ups with no admissible read, outside the envelope outright (§3.5), mixed or incomplete; on the pass
 *   roll over every split (no least-effort plans or set-ups) and again per graded split. It plays the text book's
 *   samples itself.
 * - super: plan Task 8 Step 2, decision 12's super pass roll (design §3.4): the pass roll's text book's lean and feet,
 *   drive 1, handReach 0.3 m, at each graded split × SUPER_ONSETS × SUPER_WINDOWS (superPlans), each played at the
 *   grid's powers on its lawns. With OUT (named `super-<k>of<N>.jsonl`) it plays one shard (SHARD=k/N) as run does,
 *   each sample kept with 29.2.5's reading of its strike (strikeReading). With IN instead it tallies those files: per
 *   split and lawn the least ratio found, its plan and class, and the least admissible and whether it is below
 *   MULTIPLES_RATIO; then each excluded plan's samples by class, with 29.2.5's reading (the separation (mm) before
 *   each later mallet contact and whether it joined within MERGE_SEPARATION) for its unlawful samples and any played
 *   sample with a re-contact.
 * - jumpiness: plan B-d7, the ratio's largest difference between neighbouring follow-through grid points at the full
 *   and pass rolls' text books at canonical power, with practice and as the first pass alone, and practice's share.
 *   The bound is over points the map admits; every played point's is printed beside it.
 * Run with `env SECTION=lawn npx --yes tsx scripts/pushMap.ts`. The environment: SECTION names the section; matrix
 * takes TYPES, STAGE, SHARDS and ONLY; run takes TYPE (any shot type), STAGE, LAWNS, SHARD (k/N, default 0/1) and OUT
 * (a file); merge takes TYPE, STAGE, LAWNS and IN (a directory); cost takes IN and PART; stage1 takes IN; summary takes
 * TYPE (a roll) and IN; super takes SHARD and OUT, or IN; jumpiness takes TYPE, by default both rolls. Not part of the
 * test suite.
 */
import { MERGE_SEPARATION } from "../src/engine/faults";
import { simulateImpact } from "../src/engine/impact/simulateImpact";
import { length, sub } from "../src/engine/math/vec3";
import { ENGINE_VERSION } from "../src/engine/simulate";
import { planStroke, plannedSpeed } from "../src/engine/swing/buildContact";
import type { ShotSetup } from "../src/engine/swing/types";
import { BALL_IDS, type BallState, type BallStates } from "../src/engine/types";
import { swingReference } from "../src/reference/index";
import { canonicalSetup } from "../tests/engine/support/shot";
import { openWorld, opened } from "./openLawn";
import {
    MAP_CLASSES,
    MULTIPLES_RATIO,
    SUPER_ONSETS,
    SUPER_WINDOWS,
    cellReads,
    classCounts,
    doneIndices,
    excludedSetUps,
    followThroughPlans,
    grade,
    gridFor,
    inRegion,
    lawnSpreads,
    mergeLines,
    neighbourGaps,
    nonMonotoneCount,
    offGridBand,
    onLawns,
    pickDefault,
    planKey,
    plansOf,
    labelOf,
    quantile,
    reachOf,
    readAt,
    readsJson,
    readsOf,
    regionCounts,
    regionPhrase,
    regionSpan,
    sampleErrors,
    shardLine,
    shardMatrix,
    spreadSummary,
    stagePlans,
    strikeReading,
    superLeast,
    superPlans,
    type Band,
    type EngineErrorSample,
    type LaterContact,
    type MapGrid,
    type Merged,
    type NeighbourGap,
    type Reads,
    type RecordHeader,
    type Stage,
    type StrikeReading,
    type SweepRead,
    type SweepSample,
} from "./pushMapGrid";
import {
    MAP_TYPES,
    ROLL_TYPES,
    bodyBackswing,
    canonicalPower,
    firstPassRead,
    mapSetup,
    playJudged,
    playSample,
    textBook,
    type MapClass,
    type MapPlan,
    type MapSample,
    type MapType,
    type RollType,
} from "./pushMapRun";

declare const process: {
    readonly env: Readonly<Record<string, string | undefined>>;
    readonly argv: readonly string[];
    exitCode?: number;
};

/** The lawns the map plays (s): `reference/lawn.json`'s sourced span and its normal lawn (design §3.2). */
export const MAP_LAWNS: readonly number[] = [6, 10, 14];

/**
 * Numerical, not physical: the largest handover shift (m/s) below which one impact serves every lawn (plan decision
 * 3); a double's round-off on speeds of order 1 m/s, far below any physical effect.
 */
export const LAWN_SHIFT_LIMIT = 1e-9;

/** The handover of `setup`'s impact on the open lawn of `lawnSpeed` (s). */
function handoverOn(setup: ShotSetup, lawnSpeed: number): BallStates {
    const world = openWorld(lawnSpeed);
    return simulateImpact(planStroke(setup, world).contact, setup.balls, world).handover;
}

/**
 * The largest |Δv| (m/s) over `setup`'s handed-over balls between the impacts on the 6 s and 14 s open lawns and the
 * impact on the 10 s open lawn (plan decision 3): 0 when the lawn's speed leaves the impact untouched. `setup` must
 * already stand on the open lawn (`opened`).
 */
export function impactLawnShift(setup: ShotSetup): number {
    const base = handoverOn(setup, 10);
    let largest = 0;
    for (const lawn of [6, 14]) {
        const other = handoverOn(setup, lawn);
        for (const id of BALL_IDS) {
            const a = base[id];
            const b = other[id];
            if (a === undefined || b === undefined) {
                continue;
            }
            largest = Math.max(largest, length(sub((a as BallState).velocity, (b as BallState).velocity)));
        }
    }
    return largest;
}

function sectionLawn(): void {
    console.log(
        "== lawn. Plan decision 3: for each roll's canonical setup on the open lawn, the largest change (m/s) in any " +
            "handed-over ball's velocity between the 6 s and 14 s lawns' impacts and the 10 s lawn's ==",
    );
    let shared = true;
    for (const type of ROLL_TYPES) {
        const shift = impactLawnShift(opened(canonicalSetup(type)));
        shared &&= shift < LAWN_SHIFT_LIMIT;
        console.log(`${type}: ${shift.toExponential(3)} m/s`);
    }
    console.log(
        `lawn tally: ${shared ? "shared impact" : "per-lawn impacts"} (every shift ` +
            `${shared ? "below" : "not below"} ${LAWN_SHIFT_LIMIT} m/s)`,
    );
}

/** The file system calls the run and merge sections use (tsx runs under Node; the project has no Node types). */
interface Files {
    existsSync(path: string): boolean;
    readFileSync(path: string, encoding: "utf8"): string;
    appendFileSync(path: string, data: string): void;
    writeFileSync(path: string, data: string): void;
    readdirSync(path: string): string[];
}

async function files(): Promise<Files> {
    const specifier = "node:fs";
    return (await import(/* @vite-ignore */ specifier)) as Files;
}

/** The roll named by TYPE. */
function rollType(): RollType {
    const type = process.env.TYPE;
    const known = ROLL_TYPES.find((t) => t === type);
    if (known === undefined) {
        throw new Error(`TYPE must be one of ${ROLL_TYPES.join(", ")}`);
    }
    return known;
}

/** The shot type named by `name`. */
function mapType(name: string | undefined): MapType {
    const known = MAP_TYPES.find((t) => t === name);
    if (known === undefined) {
        throw new Error(`a type must be one of ${MAP_TYPES.join(", ")}, not ${name}`);
    }
    return known;
}

/** The stage named by STAGE (design A7 item 10), by default the full map. */
function stageOf(): Stage {
    const text = process.env.STAGE ?? "2";
    if (text !== "1" && text !== "2") {
        throw new Error(`STAGE must be 1 or 2, not ${text}`);
    }
    return text === "1" ? 1 : 2;
}

/** An environment variable that must be set. */
function required(name: string): string {
    const value = process.env[name];
    if (value === undefined || value === "") {
        throw new Error(`${name} must be set`);
    }
    return value;
}

/** SHARD's k and N (k/N, 0 ≤ k < N), default 0/1. */
function shardOf(): { readonly k: number; readonly n: number } {
    const text = process.env.SHARD ?? "0/1";
    const match = /^(\d+)\/(\d+)$/.exec(text);
    const k = Number(match?.[1]);
    const n = Number(match?.[2]);
    if (match === null || !(n > 0) || !(k < n)) {
        throw new Error(`SHARD must be k/N with 0 ≤ k < N, not ${text}`);
    }
    return { k, n };
}

/** A shard's file name (decision 9): `<type>-<k>of<N>.jsonl`, the one pattern merge reads. */
function shardName(type: MapType, k: number, n: number): string {
    return `${type}-${k}of${n}.jsonl`;
}

/** Whether `name` is one of `type`'s shard files (shardName's pattern exactly). */
function isShardOf(type: MapType, name: string): boolean {
    return new RegExp(`^${type}-\\d+of\\d+\\.jsonl$`).test(name);
}

/** The workflow's matrix and types (plan Task B5), as `GITHUB_OUTPUT`'s lines and printed. */
async function sectionMatrix(): Promise<void> {
    const text = required("TYPES");
    const types = text === "all" ? MAP_TYPES : text.split(",").map(mapType);
    const stage = stageOf();
    const counts = types.map((type) => ({ type, plans: stagePlans(type, gridFor(type), stage).length }));
    const only = process.env.ONLY ?? "all";
    if (only !== "all" && !/^\d+$/.test(only)) {
        throw new Error(`ONLY must be all or a job's number, not ${only}`);
    }
    const matrix = shardMatrix(counts, Number(required("SHARDS")), only === "all" ? null : Number(only));
    const lines = `matrix=${JSON.stringify(matrix)}\ntypes=${types.join(" ")}\n`;
    console.log(lines);
    const output = process.env.GITHUB_OUTPUT;
    if (output !== undefined) {
        (await files()).appendFileSync(output, lines);
    }
}

async function sectionRun(): Promise<void> {
    const type = mapType(process.env.TYPE);
    const { k, n } = shardOf();
    const out = required("OUT");
    const name = shardName(type, k, n);
    if (!out.endsWith(`/${name}`) && out !== name) {
        throw new Error(`OUT must name the shard's file ${name}, the pattern merge reads`);
    }
    const fs = await files();
    const grid = onLawns(gridFor(type), process.env.LAWNS);
    const plans = stagePlans(type, grid, stageOf());
    const text = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
    const done = doneIndices(text);
    if (text !== "" && !text.endsWith("\n")) {
        // A shard killed mid-write left a torn line: end it, so the next plan's line stands on its own.
        fs.appendFileSync(out, "\n");
    }
    console.log(
        `== run. Plan decision 9: ${type}, shard ${k}/${n} of ${plans.length} plans, ${grid.powers.length} powers, ` +
            `lawns ${grid.lawns.join(", ")} s; ${done.size} already in ${out} ==`,
    );
    let played = 0;
    let errors = 0;
    let seconds = 0;
    for (let index = k; index < plans.length; index += n) {
        if (done.has(index)) {
            continue;
        }
        const plan = plans[index] as (typeof plans)[number];
        const start = performance.now();
        let line: string;
        try {
            const samples: SweepSample[] = grid.powers.map((power) => {
                try {
                    return playSample(type, plan, power, grid.lawns);
                } catch (error) {
                    errors++;
                    return { power, engineError: error instanceof Error ? error.message : String(error) };
                }
            });
            line = shardLine(index, plan, { samples });
        } catch (error) {
            errors++;
            line = shardLine(index, plan, { engineError: error instanceof Error ? error.message : String(error) });
        }
        fs.appendFileSync(out, `${line}\n`);
        const elapsed = (performance.now() - start) / 1000;
        seconds += elapsed;
        played++;
        console.log(`plan ${index}: ${elapsed.toFixed(2)} s`);
    }
    const mean = played > 0 ? seconds / played : NaN;
    console.log(
        `run tally: ${played} plans in ${seconds.toFixed(1)} s, ${mean.toFixed(2)} s per plan, ` +
            `${(mean / grid.powers.length).toFixed(3)} s per sample; ${errors} engine errors`,
    );
}

/**
 * Numerical, not physical: the most plan indices merge lists per line, to keep its output readable; the counts are
 * always printed whole.
 */
const LISTED = 40;

/** Exactly `type`'s shard files in `dir` (shardName's pattern) merged against the grid's `plans`, and their count. */
function mergeShards(
    fs: Files,
    type: MapType,
    dir: string,
    plans: readonly MapPlan[],
): { readonly merged: Merged; readonly shards: number } {
    const shards = fs
        .readdirSync(dir)
        .filter((name) => isShardOf(type, name))
        .sort();
    const lines: string[] = [];
    for (const name of shards) {
        lines.push(...fs.readFileSync(`${dir}/${name}`, "utf8").split("\n"));
    }
    return { merged: mergeLines(plans, lines), shards: shards.length };
}

async function sectionMerge(): Promise<void> {
    const type = mapType(process.env.TYPE);
    const dir = required("IN");
    const fs = await files();
    const grid = onLawns(gridFor(type), process.env.LAWNS);
    const stage = stageOf();
    const plans = stagePlans(type, grid, stage);
    const { merged, shards } = mergeShards(fs, type, dir, plans);
    console.log(`== merge. Plan decision 9: ${type}, stage ${stage}, ${shards} shard files, ${plans.length} plans ==`);
    console.log(`swept: ${merged.samples.size}`);
    const { missing } = merged;
    const shown = missing.slice(0, LISTED).join(", ") + (missing.length > LISTED ? ", …" : "");
    console.log(`missing: ${missing.length}${missing.length > 0 ? ` (${shown})` : ""}`);
    const byMessage = new Map<string, number[]>();
    for (const [index, message] of merged.engineErrors) {
        byMessage.set(message, [...(byMessage.get(message) ?? []), index]);
    }
    console.log(`engine errors outside the samples: ${merged.engineErrors.size} plans`);
    for (const [message, indices] of byMessage) {
        const listed = indices.slice(0, LISTED).join(", ") + (indices.length > LISTED ? ", …" : "");
        console.log(`  ${indices.length} × ${message}: plans ${listed}`);
    }
    const inSamples = sampleErrors(merged.samples);
    console.log(`engine errors in the samples: ${[...inSamples.values()].reduce((a, b) => a + b, 0)} samples`);
    for (const [message, count] of inSamples) {
        console.log(`  ${count} × ${message}`);
    }
    console.log(`duplicate lines: ${merged.duplicates}; torn lines: ${merged.torn}`);
    const { reads, nonMonotone, noRead } = readsOf(grid, plans, merged.samples);
    console.log(
        `reads: ${reads.size}; left unread (an engine error decides them): ${noRead}; plans whose range is not ` +
            `monotone in p on some lawn: ${nonMonotone}`,
    );
    if (stage === 2) {
        // A text book alone has no neighbours, so stage 1 has nothing to band.
        const { unbanded } = grade(type, grid, reads);
        console.log(`graded reads left unbanded (a neighbour unread): ${unbanded}`);
    }
    const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_SHA } = process.env;
    const header: RecordHeader = {
        run:
            GITHUB_RUN_ID === undefined
                ? null
                : `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`,
        commit: GITHUB_SHA ?? null,
        engine: ENGINE_VERSION,
        type,
        stage,
        lawns: grid.lawns,
    };
    const path = `${dir}/${type}.reads.json`;
    fs.writeFileSync(path, readsJson(header, reads));
    console.log(`written: ${path}`);
    if (missing.length > 0) {
        // A dead shard fails the run (Review Focus 5): the reads are still written, for what they hold.
        process.exitCode = 1;
    }
}

/** Numerical, not physical: how many pass-roll plans the cost section times (plan Task 5). */
const COST_PLANS = 20;

/** The plan indices the cost section times: COST_PLANS drawn evenly from `count` plans. */
function costIndices(count: number): number[] {
    return Array.from({ length: COST_PLANS }, (_, i) => Math.floor((i * count) / COST_PLANS));
}

async function sectionCost(): Promise<void> {
    const fs = await files();
    const dir = required("IN");
    const passGrid = gridFor("pass-roll");
    const passPlans = plansOf("pass-roll", passGrid);
    if (process.env.PART !== undefined) {
        const match = /^(\d+)\/(\d+)$/.exec(process.env.PART);
        const j = Number(match?.[1]);
        const parts = Number(match?.[2]);
        if (match === null || !(parts > 0) || !(j < parts)) {
            throw new Error(`PART must be j/J with 0 ≤ j < J, not ${process.env.PART}`);
        }
        const indices = costIndices(passPlans.length).filter((_, i) => i % parts === j);
        for (const index of indices) {
            const plan = passPlans[index] as (typeof passPlans)[number];
            for (const power of passGrid.powers) {
                const start = performance.now();
                let error = "";
                try {
                    playSample("pass-roll", plan, power, passGrid.lawns);
                } catch (thrown) {
                    error = thrown instanceof Error ? thrown.message : String(thrown);
                }
                const seconds = (performance.now() - start) / 1000;
                fs.appendFileSync(
                    `${dir}/cost-${j}of${parts}.jsonl`,
                    `${JSON.stringify({ index, power, seconds, error })}\n`,
                );
            }
            console.log(`plan ${index} timed`);
        }
        return;
    }
    const times: number[] = [];
    let errors = 0;
    for (const name of fs.readdirSync(dir).filter((n) => /^cost-\d+of\d+\.jsonl$/.test(n))) {
        for (const line of fs.readFileSync(`${dir}/${name}`, "utf8").split("\n")) {
            if (line === "") {
                continue;
            }
            const row = JSON.parse(line) as { seconds: number; error: string };
            times.push(row.seconds);
            errors += row.error === "" ? 0 : 1;
        }
    }
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(
        `== cost. Plan Task 5: ${COST_PLANS} pass-roll plans drawn evenly, ${times.length} samples (each its impact ` +
            `once and its ${passGrid.lawns.length} lawns, decision 3's shared impact), ${errors} engine errors ==`,
    );
    console.log(
        `seconds per sample: mean ${mean.toFixed(3)}, 95th percentile ${quantile(times, 0.95).toFixed(3)}, ` +
            `max ${Math.max(...times).toFixed(3)}`,
    );
    let total = 0;
    for (const type of ROLL_TYPES) {
        const grid = gridFor(type);
        const plans = plansOf(type, grid).length;
        const samples = plans * grid.powers.length;
        const hours = (samples * mean) / 3600;
        total += hours;
        console.log(`${type}: ${plans} plans, ${samples} samples, ${hours.toFixed(1)} CPU h`);
    }
    console.log(`whole map: ${total.toFixed(1)} CPU h at the mean`);
}

/** The lawn the anchor is read on (s): the normal lawn, the canonical's (design §3.3; plan Task 6). */
const ANCHOR_LAWN = 10;

/** Numerical, not physical: the lawn's effect counted above a 2 % spread in the ratio (plan Task 6's threshold). */
const LAWN_SPREAD_LIMIT = 0.02;

const DEG = Math.PI / 180;

/** A plan's inputs for the output: degrees, m, 1, m, ms. */
function planText(plan: MapPlan): string {
    return (
        `lean ${(plan.lean / DEG).toFixed(1)}°, feet ${plan.feet.toFixed(3)} m, drive ${plan.drive}, ` +
        `handReach ${plan.handReach} m, window ${(plan.window * 1000).toFixed(0)} ms, speedGain ${plan.speedGain}` +
        (plan.split === 0 ? "" : `, split ${(plan.split / DEG).toFixed(0)}°`)
    );
}

/** A read's class, ratio, efforts (%) and couple share for the output. */
function readText(read: SweepRead | undefined): string {
    if (read === undefined) {
        return "no read";
    }
    const klass = read.klass === null ? "admissible" : `${read.klass} (${read.reason ?? ""})`;
    return (
        `${klass}, ratio ${read.ratio.toFixed(3)}, stroke ${read.strokeEffort.toFixed(1)} %, push ` +
        `${read.pushEffort.toFixed(1)} %, couple share ${read.coupleShare.toFixed(3)}, p ${read.power.toFixed(3)}`
    );
}

/** A roll type's name for the output: "half roll". */
function typeName(type: RollType): string {
    return type.replace("-", " ");
}

/**
 * `type`'s text book (textBook, today's default, at its preset's hold as fitted) played at its canonical power on the
 * 10 s lawn, which gives the
 * canonical's range, and read at that range from its own sweep at the grid's powers, its band by A3 item 1's off-grid
 * rule (offGridBand over cellReads). On the half roll it is the anchor (design §3.3; plan Task 6); on the full and pass
 * rolls it is A1's text-book validation (each type's text book must land in its band), §3.3's anchor being the half
 * roll's alone.
 */
function printTextBook(type: RollType, grid: MapGrid, samples: ReadonlyMap<number, readonly SweepSample[]>): void {
    const anchored = type === "half-roll";
    const who = anchored ? "the anchor" : "the text book";
    const anchor = textBook(type);
    const world = openWorld(ANCHOR_LAWN);
    const backswing = swingReference[type].defaultBackswing.value;
    const power = backswing / bodyBackswing(mapSetup(type, anchor, 1), world);
    const heading =
        "-- the text book (A1's validation; §3.3's anchor is the half roll's): " +
        `today's ${typeName(type)} default, read at its canonical range on the ${ANCHOR_LAWN} s lawn --`;
    console.log(anchored ? "-- the anchor (design §3.3): today's half-roll default, the text book --" : heading);
    console.log(`plan: ${planText(anchor)}; canonical power p ${power.toFixed(4)} (backswing ${backswing} m)`);
    let exact: SweepSample;
    try {
        exact = playSample(type, anchor, power, [ANCHOR_LAWN], "preset");
    } catch (error) {
        exact = { power, engineError: error instanceof Error ? error.message : String(error) };
    }
    if ("engineError" in exact) {
        console.log(`played at that power: the engine threw (${exact.engineError}); no range, so no read or band`);
        return;
    }
    const lawnRead = exact.byLawn[ANCHOR_LAWN];
    const range = lawnRead?.range ?? NaN;
    const ratio = lawnRead?.ratio ?? NaN;
    const exactClass = `${exact.klass ?? "admissible"}${exact.reason === null ? "" : ` (${exact.reason})`}`;
    if (!Number.isFinite(range)) {
        console.log(
            `played at that power on the ${ANCHOR_LAWN} s lawn: ${exactClass}; the range was not reached, so ` +
                `${who} has no read at it and no cell band`,
        );
        return;
    }
    console.log(
        `played at that power on the ${ANCHOR_LAWN} s lawn: range ${range.toFixed(3)} m (the canonical's), ` +
            `${exactClass}, ratio ${ratio.toFixed(3)}, ${regionPhrase(type)}: ${inRegion(type, ratio) ? "yes" : "no"}`,
    );
    const least = grid.ranges[0] ?? NaN;
    if (range < least) {
        console.log(
            `the canonical's range lies below the grid's least, ${least} m: no grid read holds it, so ${who} and ` +
                "its cell are read at it from their sweeps (readAt)",
        );
    } else if (!grid.ranges.includes(range)) {
        console.log(
            `the canonical's range lies between the grid's ranges: no grid read holds it, so ${who} and its cell ` +
                "are read at it from their sweeps (readAt)",
        );
    }
    const sweep: SweepSample[] = grid.powers.map((p) => {
        try {
            return playSample(type, anchor, p, [ANCHOR_LAWN], "preset");
        } catch (error) {
            return { power: p, engineError: error instanceof Error ? error.message : String(error) };
        }
    });
    const read = readAt(sweep, range, ANCHOR_LAWN);
    console.log(
        `read from its sweep at the grid's ${grid.powers.length} powers: ` +
            `${read === null ? "no read (an engine error decides it)" : readText(read)}`,
    );
    console.log(
        `the read's ratio in the ${typeName(type)}'s region ${regionSpan(type)}: ` +
            `${read !== null && inRegion(type, read.ratio) ? "yes" : "no"}`,
    );
    const classed = exact.klass !== null || (read !== null && read.klass !== null);
    const corners = cellReads(type, grid, samples, anchor, { range, lawn: ANCHOR_LAWN });
    // An engine error deciding the read leaves no evidence either way, as a missing read does on the grid.
    const band = read === null && !classed ? null : offGridBand(classed, corners);
    let why: string;
    if (classed) {
        why = "its play or its read has a class";
    } else if (read === null) {
        why = "its sweep has no read at the range (an engine error decides it)";
    } else if (corners === null) {
        why = "its cell lies outside the grid's axes (or its onset is not 0), so no corner bands it";
    } else if (band === null) {
        why = "a corner of its cell is unbanded";
    } else {
        why = "the worst corner of its coarse cell, an unplayable corner counting as edgy (A2 item 2)";
    }
    console.log(`band: ${band ?? "none"}; ${why}`);
    if (!anchored) {
        const yes = (b: boolean): string => (b ? "yes" : "no");
        const admissible = (k: MapClass | null): string => (k === null ? "yes" : `no, ${k}`);
        const readIn = read !== null && inRegion(type, read.ratio);
        const lands = exact.klass === null && read !== null && read.klass === null && readIn;
        console.log(
            `A1's text-book validation (the text book must land in its region, A1's band): played, admissible ` +
                `${admissible(exact.klass)}${exact.reason === null ? "" : ` (${exact.reason})`}, ratio ` +
                `${regionPhrase(type)} ${yes(inRegion(type, ratio))}; read, admissible ` +
                `${read === null ? "no read" : admissible(read.klass)}, ratio ${regionPhrase(type)} ${yes(readIn)}; ` +
                `lands in its region (A1's band), admissible: ${yes(lands)}`,
        );
    }
    if (corners !== null) {
        console.log(
            `its cell's ${corners.length} corners, graded at ${range.toFixed(3)} m on the ${ANCHOR_LAWN} s lawn from ` +
                "the merged sweeps:",
        );
        for (const corner of corners) {
            console.log(`  ${planText(corner.plan)}: ${corner.band ?? "unbanded"}, ${readText(corner.read)}`);
        }
    }
}

/** A spread summary's line: count, median, 95th percentile and maximum (%), and the count above LAWN_SPREAD_LIMIT. */
function spreadText(spreads: readonly number[]): string {
    const s = spreadSummary(spreads, LAWN_SPREAD_LIMIT);
    const pc = (x: number): string => `${(x * 100).toFixed(2)} %`;
    return (
        `${s.count} plan-ranges, median ${pc(s.median)}, 95th percentile ${pc(s.p95)}, max ${pc(s.max)}, ` +
        `${s.above} above ${LAWN_SPREAD_LIMIT * 100} %`
    );
}

/** The heading's split scope (plan Task 8: the pass roll per split): "" for every plan, else ", split 10°". */
function splitScope(split: number | null): string {
    return split === null ? "" : `, split ${(split / DEG).toFixed(0)}°`;
}

/**
 * The map's tallies over `grid`'s plans (plansOf; Task 6's, after the anchor): the region's admissible graded plans
 * per range and lawn by band, the classes, the lawn's effect, the least-effort plan per range and lawn at each of
 * `scope.splits` (none skips it), the non-monotone sweeps and, with `scope.setUps`, the set-ups with no admissible
 * read. `banded` is graded on the type's whole grid, so a plan's neighbours across splits count. `scope.split` names
 * the scope in the headings (null: every plan, the headings Task 6's exactly).
 */
function printTallies(
    type: RollType,
    grid: MapGrid,
    reads: Reads,
    banded: ReadonlyMap<string, Band>,
    scope: { readonly split: number | null; readonly splits: readonly number[]; readonly setUps: boolean },
): void {
    const plans = plansOf(type, grid);
    const at = splitScope(scope.split);
    const metres = (r: number): string => `${r.toFixed(2)} m`;
    console.log(`-- the region (A1): admissible graded plans with the ratio ${regionPhrase(type)}, by band${at} --`);
    const region = regionCounts(type, grid, reads, banded);
    for (const range of grid.ranges) {
        const cells = region
            .filter((c) => c.range === range)
            .map(
                (c) =>
                    `${c.lawn} s viable ${c.viable}, edgy ${c.edgy}${c.unbanded > 0 ? `, unbanded ${c.unbanded}` : ""}`,
            );
        console.log(`${metres(range)}: ${cells.join("; ")}`);
    }

    console.log(`-- the classes (§3.5): every plan's read, graded and beyond, per range and lawn${at} --`);
    for (const c of classCounts(grid, plans, reads)) {
        const parts = ["admissible", ...MAP_CLASSES, "unread"] as const;
        console.log(`${metres(c.range)}, ${c.lawn} s: ${parts.map((k) => `${k} ${c.counts[k]}`).join(", ")}`);
    }

    console.log(
        "-- the lawn's effect (§3.2's guess): per plan and range, the ratio's spread across the lawns, " +
            `(max − min) / mean${at} --`,
    );
    const all = lawnSpreads(grid, plans, reads, false);
    const admissible = lawnSpreads(grid, plans, reads, true);
    console.log(`of ${plans.length * grid.ranges.length} plan-ranges (${plans.length} per range):`);
    console.log(`every read with a ratio on each lawn: ${spreadText(all.map((s) => s.spread))}`);
    console.log(`admissible on each lawn: ${spreadText(admissible.map((s) => s.spread))}`);
    for (const range of grid.ranges) {
        const here = admissible.filter((s) => s.range === range).map((s) => s.spread);
        console.log(`  ${metres(range)}, admissible: ${spreadText(here)}`);
    }

    for (const split of scope.splits) {
        console.log(
            `-- the least-effort plan per range and lawn (pickDefault: the region's least mean effort)${at} --`,
        );
        for (const range of grid.ranges) {
            for (const lawn of grid.lawns) {
                const { plan, viable } = pickDefault(type, reads, banded, { range, lawn, split });
                if (plan === null) {
                    console.log(`${metres(range)}, ${lawn} s: none in the region`);
                    continue;
                }
                const key = planKey(plan, range, lawn);
                console.log(
                    `${metres(range)}, ${lawn} s: ${planText(plan)}; ${banded.get(key)}; ${readText(reads.get(key))}`,
                );
                if (viable !== null && viable !== plan) {
                    const vkey = planKey(viable, range, lawn);
                    console.log(`  least-effort viable: ${planText(viable)}; ${readText(reads.get(vkey))}`);
                } else if (viable === null) {
                    console.log("  least-effort viable: none");
                }
            }
        }
    }

    console.log(
        `-- non-monotone sweeps (decision 2)${at}: ${nonMonotoneCount(grid, plans, reads)} of ${plans.length} --`,
    );
    if (!scope.setUps) {
        return;
    }

    const excluded = excludedSetUps(grid, plans, reads);
    const outright = excluded.filter((e) => e.klass !== "mixed" && e.klass !== "incomplete");
    const mixed = excluded.filter((e) => e.klass === "mixed");
    const incomplete = excluded.filter((e) => e.klass === "incomplete");
    const setUpText = (e: (typeof excluded)[number]): string => {
        const beyond = !grid.lean.graded.includes(e.setUp.lean) || !grid.feet.graded.includes(e.setUp.feet);
        return (
            `lean ${(e.setUp.lean / DEG).toFixed(1)}°, feet ${e.setUp.feet.toFixed(3)} m` +
            `${e.setUp.split === 0 ? "" : `, split ${(e.setUp.split / DEG).toFixed(0)}°`}` +
            `${beyond ? " (beyond)" : ""}: ${e.klass}, ${e.reads} reads, ${e.unread} unread`
        );
    };
    const groups = [
        ["outside the envelope outright (§3.5: every read present, the one class)", outright],
        ["no admissible read, every read present, classes mixed", mixed],
        ["no admissible read, but some reads missing (incomplete, not outright)", incomplete],
    ] as const;
    for (const [title, list] of groups) {
        console.log(`-- ${title}${at}: ${list.length} set-ups --`);
        for (const e of list) {
            console.log(`  ${setUpText(e)}`);
        }
    }
}

/**
 * Task 6's report of `type`'s map, from IN's shard files merged as merge merges them (sections stage1 and summary).
 * `label` opens the title line. The half roll's anchor, or another type's text book (printTextBook); then the tallies
 * (printTallies) over every plan, and, on the pass roll, again per graded split.
 */
async function summaryOf(type: RollType, label: string): Promise<void> {
    const dir = required("IN");
    const fs = await files();
    const grid = gridFor(type);
    const plans = plansOf(type, grid);
    const { merged, shards } = mergeShards(fs, type, dir, plans);
    const { reads, noRead } = readsOf(grid, plans, merged.samples);
    const { banded, unbanded } = grade(type, grid, reads);
    const inSamples = [...sampleErrors(merged.samples).values()].reduce((a, b) => a + b, 0);
    const metres = (r: number): string => `${r.toFixed(2)} m`;
    const splits = type === "pass-roll" ? grid.split.graded : [];
    const degrees = splits.map((s) => `${(s / DEG).toFixed(0)}°`).join(", ");
    console.log(
        `== ${label}: the ${type}'s map, ${plans.length} plans, ${merged.samples.size} sweeps from ` +
            `${shards} shard files in ${dir}; ranges ${grid.ranges.map(metres).join(", ")}; lawns ` +
            `${grid.lawns.join(", ")} s${splits.length > 0 ? `; splits ${degrees} graded` : ""} ==`,
    );
    console.log(
        `plans missing: ${merged.missing.length}; engine errors outside the samples: ${merged.engineErrors.size} ` +
            `plans, in the samples: ${inSamples} samples; torn lines: ${merged.torn}; duplicate lines: ` +
            `${merged.duplicates}`,
    );
    console.log(
        `reads: ${reads.size}; left unread (an engine error decides them): ${noRead}; graded reads left unbanded ` +
            `(a neighbour unread): ${unbanded}`,
    );
    printTextBook(type, grid, merged.samples);
    if (type !== "pass-roll") {
        printTallies(type, grid, reads, banded, { split: null, splits: [0], setUps: true });
        return;
    }
    console.log(
        "-- every split together (the least-effort plans and the set-ups are per split, below), then each graded " +
            "split (plan Task 8) --",
    );
    printTallies(type, grid, reads, banded, { split: null, splits: [], setUps: false });
    for (const split of splits) {
        const one: MapGrid = { ...grid, split: { graded: [split], beyond: [] } };
        printTallies(type, one, reads, banded, { split, splits: [split], setUps: true });
    }
}

/** Each type's band on the continuum (labelOf); the single-ball stroke has no ratio, so no band. */
const OWN_LABEL: Readonly<Record<MapType, string | null>> = {
    drive: "drive",
    "stop-ac": "AC stop",
    "half-roll": "half roll",
    "full-roll": "full roll",
    "pass-roll": "pass roll",
    "single-ball": null,
};

/** Criterion 4's tolerance on a text book's planned contact speed against its preset's (design A7 item 10). */
const SPEED_TOLERANCE = 0.02;

/** The bound B-d7 measured under B-d8 (the envelope probe, Task B4): the rolls' largest gap between pushed neighbours. */
const JUMPINESS_BOUND: Readonly<Partial<Record<MapType, number>>> = { "full-roll": 0.402, "pass-roll": 0.579 };

/** A sample's figures on `lawn` for gate stage 1: class, range, ratio, label, hold and practice passes. */
function gateSampleText(s: SweepSample, lawn: number): string {
    if ("engineError" in s) {
        return `engine error (${s.engineError})`;
    }
    const read = s.byLawn[lawn];
    const klass = s.klass === null ? "admissible" : `${s.klass} (${s.reason ?? ""})`;
    const ratio = read?.ratio ?? NaN;
    const figures = Number.isFinite(ratio) ? `ratio ${ratio.toFixed(3)} (${labelOf(ratio)})` : "no ratio";
    const hold = s.firmness === null ? "no hold" : `firmness ${s.firmness.toFixed(3)}, sigma ${s.sigma?.toFixed(3)}`;
    return `${klass}, range ${(read?.range ?? NaN).toFixed(3)} m, ${figures}, ${hold}, passes ${s.passes}`;
}

/** `type`'s text book at its canonical power at both holds, its speed and its band (plan Task B6). */
function printGateBook(type: MapType): void {
    const book = textBook(type);
    const world = openWorld(ANCHOR_LAWN);
    const power = canonicalPower(type, world);
    const speed = plannedSpeed(mapSetup(type, book, power), world);
    const preset = swingReference[type].defaultSpeed.value;
    const off = speed / preset - 1;
    console.log(`plan: ${planText(book)}; canonical power p ${power.toFixed(4)}`);
    console.log(
        `planned contact speed ${speed.toFixed(3)} m/s, preset's ${preset.toFixed(3)} m/s, ` +
            `${(100 * off).toFixed(2)} %: within ±${100 * SPEED_TOLERANCE} %: ` +
            `${Math.abs(off) <= SPEED_TOLERANCE ? "yes" : "no"}`,
    );
    const own = OWN_LABEL[type];
    for (const hold of ["found", "preset"] as const) {
        let played: SweepSample;
        try {
            played = playSample(type, book, power, [ANCHOR_LAWN], hold);
        } catch (error) {
            played = { power, engineError: error instanceof Error ? error.message : String(error) };
        }
        const ratio = "engineError" in played ? NaN : (played.byLawn[ANCHOR_LAWN]?.ratio ?? NaN);
        const band = own === null ? "no band" : `in the ${own}'s band: ${labelOf(ratio) === own ? "yes" : "no"}`;
        console.log(
            `at the ${hold === "found" ? "found" : "fitted"} hold, ${ANCHOR_LAWN} s lawn: ` +
                `${gateSampleText(played, ANCHOR_LAWN)}; ${band}`,
        );
    }
}

async function sectionStage1(): Promise<void> {
    const dir = required("IN");
    const fs = await files();
    for (const type of MAP_TYPES) {
        const grid = gridFor(type);
        const { merged, shards } = mergeShards(fs, type, dir, stagePlans(type, grid, 1));
        console.log(`== stage1. Plan Task B6: ${type}, ${shards} shard files, missing ${merged.missing.length} ==`);
        printGateBook(type);
        const sweep = merged.samples.get(0) ?? [];
        for (const lawn of grid.lawns) {
            const { best, beyond } = reachOf(sweep, lawn);
            const reach =
                best === null
                    ? "no admissible play"
                    : `p ${best.power}, ${best.range.toFixed(2)} m` +
                      (Number.isFinite(best.ratio) ? `, ratio ${best.ratio.toFixed(3)}` : "");
            const next =
                beyond === null ? "none beyond" : `p ${beyond.power}: ${beyond.klass} (${beyond.reason ?? ""})`;
            console.log(`reach on the ${lawn} s lawn: ${reach}; ${next}`);
        }
        const bound = JUMPINESS_BOUND[type];
        if (bound !== undefined) {
            console.log(`jumpiness bound (B-d7, under B-d8): ${bound}`);
        }
        for (const lawn of grid.lawns) {
            console.log(`-- the sweep on the ${lawn} s lawn --`);
            for (const s of sweep) {
                console.log(`p ${s.power}: ${gateSampleText(s, lawn)}`);
            }
        }
        console.log("");
    }
}

async function sectionSummary(): Promise<void> {
    await summaryOf(rollType(), "summary. Plan Task 8");
}

/** A super shard's file name: `super-<k>of<N>.jsonl`, the one pattern the super tally reads. */
function superName(k: number, n: number): string {
    return `super-${k}of${n}.jsonl`;
}

/** A super sample: playJudged's sample with 29.2.5's reading of its strike (strikeReading), or the engine's error. */
type SuperSample = (MapSample & { readonly strike: StrikeReading | null }) | EngineErrorSample;

/** The super pass roll's plan for the output: planText's, with the hands' onset (ms). */
function superPlanText(plan: MapPlan): string {
    return `${planText(plan)}, onset ${(plan.onset * 1000).toFixed(0)} ms`;
}

/**
 * 29.2.5's reading for the output (plan Task 8 Step 2): the separation (mm) before each later mallet contact, and its
 * kind.
 */
function strikeText(reading: StrikeReading | null): string {
    if (reading === null) {
        return "29.2.5: no strike judged (the sample was not played)";
    }
    const mm = (m: number): string => `${(m * 1000).toFixed(3)} mm`;
    if (reading.parted === null) {
        return (
            "29.2.5: the balls never parted, so every mallet contact after the first is possible 29.1.6.1; the " +
            "separations are not available (the judge keeps no taps unparted)"
        );
    }
    const parted = `29.2.5: parted at ${(reading.parted * 1000).toFixed(3)} ms`;
    if (reading.later.length === 0) {
        return `${parted}; no later contact apart from the strike`;
    }
    const joined = reading.later.filter((c) => c.kind === "joined");
    const before = reading.later.filter((c) => c.kind === "before-parting");
    const apart = reading.later.filter((c) => c.kind === "recontact");
    const most = (list: readonly LaterContact[]): string => mm(Math.max(...list.map((c) => c.separation)));
    const parts = [
        `${joined.length} later contacts joined within MERGE_SEPARATION ${mm(MERGE_SEPARATION)}` +
            (joined.length > 0 ? ` (largest separation ${most(joined)})` : ""),
    ];
    if (before.length > 0) {
        parts.push(`${before.length} apart but begun before the parting (largest separation ${most(before)})`);
    }
    const listed = apart
        .slice(0, LISTED)
        .map((c) => `separation ${mm(c.separation)}, ${c.fault ? "fault" : "no fault"}`)
        .join("; ");
    parts.push(
        apart.length === 0
            ? "no re-contact after the parting"
            : `${apart.length} re-contacts, not joined: ${listed}${apart.length > LISTED ? "; …" : ""}`,
    );
    return `${parted}; ${parts.join("; ")}`;
}

/**
 * A sample's figures on `lawn` for the output: power, range (m), ratio, class (reason) and its practice passes
 * (P2b.2b.2c.3b.1 design §6).
 */
function superSampleText(sample: MapSample, lawn: number): string {
    const read = sample.byLawn[lawn];
    const klass = sample.klass === null ? "admissible" : `${sample.klass} (${sample.reason ?? ""})`;
    return (
        `p ${sample.power.toFixed(3)}, range ${(read?.range ?? NaN).toFixed(3)} m, ratio ` +
        `${(read?.ratio ?? NaN).toFixed(3)}, ${klass}, passes ${sample.passes}`
    );
}

/** The super sample's strike reading; none for the engine's error. */
function strikeOf(sample: SuperSample): StrikeReading | null {
    return "strike" in sample ? sample.strike : null;
}

/**
 * One super shard (plan decision 12): the super plans whose index is ≡ k mod N (SHARD=k/N), each played at the grid's
 * powers on its lawns (playJudged) with 29.2.5's reading of its strike, appended to OUT as one JSON line per plan, and
 * resumed as run resumes.
 */
function superShard(fs: Files, plans: readonly MapPlan[], grid: MapGrid, out: string): void {
    const type: RollType = "pass-roll";
    const { k, n } = shardOf();
    const name = superName(k, n);
    if (!out.endsWith(`/${name}`) && out !== name) {
        throw new Error(`OUT must name the super shard's file ${name}, the pattern the tally reads`);
    }
    const text = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
    const done = doneIndices(text);
    if (text !== "" && !text.endsWith("\n")) {
        // A shard killed mid-write left a torn line: end it, so the next plan's line stands on its own.
        fs.appendFileSync(out, "\n");
    }
    console.log(
        `== super. Plan decision 12: shard ${k}/${n} of ${plans.length} plans, ${grid.powers.length} powers, ` +
            `lawns ${grid.lawns.join(", ")} s; ${done.size} already in ${out} ==`,
    );
    let played = 0;
    let errors = 0;
    let seconds = 0;
    for (let index = k; index < plans.length; index += n) {
        if (done.has(index)) {
            continue;
        }
        const plan = plans[index] as MapPlan;
        const start = performance.now();
        let line: string;
        try {
            const samples: SuperSample[] = grid.powers.map((power) => {
                try {
                    const { sample, strike } = playJudged(type, plan, power, grid.lawns);
                    return { ...sample, strike: strikeReading(strike, MERGE_SEPARATION) };
                } catch (error) {
                    errors++;
                    return { power, engineError: error instanceof Error ? error.message : String(error) };
                }
            });
            line = shardLine(index, plan, { samples });
        } catch (error) {
            errors++;
            line = shardLine(index, plan, { engineError: error instanceof Error ? error.message : String(error) });
        }
        fs.appendFileSync(out, `${line}\n`);
        const elapsed = (performance.now() - start) / 1000;
        seconds += elapsed;
        played++;
        console.log(`plan ${index}: ${elapsed.toFixed(2)} s`);
    }
    const mean = played > 0 ? seconds / played : NaN;
    console.log(
        `super tally: ${played} plans in ${seconds.toFixed(1)} s, ${(mean / grid.powers.length).toFixed(3)} s per ` +
            `sample; ${errors} engine errors`,
    );
}

/**
 * The super pass roll (plan Task 8 Step 2; decision 12; design §3.4). With OUT, one shard (superShard). Without, the
 * shards `super-<k>of<N>.jsonl` in IN merged: per graded split and lawn, the least ratio found, its plan and class,
 * and the least admissible ratio and whether it is below MULTIPLES_RATIO ("multiples further"); then each excluded
 * plan (a sample with a class) with its samples' class tally, and 29.2.5's reading (strikeText) for its unlawful
 * samples and any played sample with a re-contact.
 */
async function sectionSuper(): Promise<void> {
    const type: RollType = "pass-roll";
    const fs = await files();
    const grid = gridFor(type);
    const book = textBook(type);
    const splits = grid.split.graded;
    const plans = superPlans(book, splits);
    const out = process.env.OUT;
    if (out !== undefined && out !== "") {
        superShard(fs, plans, grid, out);
        return;
    }
    const dir = required("IN");
    const names = fs
        .readdirSync(dir)
        .filter((name) => /^super-\d+of\d+\.jsonl$/.test(name))
        .sort();
    const lines: string[] = [];
    for (const name of names) {
        lines.push(...fs.readFileSync(`${dir}/${name}`, "utf8").split("\n"));
    }
    const merged = mergeLines(plans, lines);
    const ms = (s: number): string => `${(s * 1000).toFixed(0)} ms`;
    const degrees = splits.map((s) => `${(s / DEG).toFixed(0)}°`).join(", ");
    console.log(
        `== super. Plan decision 12 (design §3.4): the pass roll's text book (lean ${(book.lean / DEG).toFixed(1)}°, ` +
            `feet ${book.feet.toFixed(3)} m), drive 1, handReach 0.3 m; onsets ${SUPER_ONSETS.map(ms).join(", ")}; ` +
            `windows ${SUPER_WINDOWS.map(ms).join(", ")}; splits ${degrees}; ${plans.length} plans × ` +
            `${grid.powers.length} powers on lawns ${grid.lawns.join(", ")} s; ${names.length} shard files in ` +
            `${dir} ==`,
    );
    const inSamples = [...sampleErrors(merged.samples).values()].reduce((a, b) => a + b, 0);
    console.log(
        `plans missing: ${merged.missing.length}; engine errors outside the samples: ${merged.engineErrors.size} ` +
            `plans, in the samples: ${inSamples} samples; torn lines: ${merged.torn}; duplicate lines: ` +
            `${merged.duplicates}`,
    );
    const entries: { readonly plan: MapPlan; readonly sample: SuperSample }[] = [];
    for (const [index, sweep] of merged.samples) {
        for (const sample of sweep) {
            entries.push({ plan: plans[index] as MapPlan, sample: sample as SuperSample });
        }
    }

    console.log(
        "-- per split and lawn: the least ratio found (any class), and the least admissible, below " +
            `${MULTIPLES_RATIO} ("multiples further") or not --`,
    );
    for (const split of splits) {
        const here = entries.filter((e) => e.plan.split === split);
        for (const lawn of grid.lawns) {
            const { least, admissible } = superLeast(here, lawn);
            const at = `split ${(split / DEG).toFixed(0)}°, ${lawn} s`;
            if (least === null) {
                console.log(`${at}: no sample with a ratio`);
                continue;
            }
            console.log(`${at}: least ${least.ratio.toFixed(3)}: ${superPlanText(least.plan)}`);
            console.log(
                `  ${superSampleText(least.sample, lawn)}; ${strikeText(strikeOf(least.sample as SuperSample))}`,
            );
            if (admissible === null) {
                console.log(`  least admissible: none; below ${MULTIPLES_RATIO} admissibly: no`);
                continue;
            }
            console.log(
                `  least admissible ${admissible.ratio.toFixed(3)}: ${superPlanText(admissible.plan)}; ` +
                    `${superSampleText(admissible.sample, lawn)}`,
            );
            console.log(
                `  ${strikeText(strikeOf(admissible.sample as SuperSample))}; below ${MULTIPLES_RATIO} admissibly: ` +
                    `${admissible.ratio < MULTIPLES_RATIO ? "yes" : "no"}`,
            );
        }
    }

    console.log(
        "-- the excluded plans (a sample with a class): each plan's samples by class; in full, with their figures on " +
            `the ${ANCHOR_LAWN} s lawn and 29.2.5's reading (the separation before each later mallet contact, and ` +
            "whether it joined within MERGE_SEPARATION), the unlawful samples and any played sample with a " +
            "re-contact; the other classes as counts --",
    );
    let excluded = 0;
    for (const [index, sweep] of [...merged.samples].sort((a, b) => a[0] - b[0])) {
        const played = (sweep as readonly SuperSample[]).filter(
            (s): s is MapSample & { readonly strike: StrikeReading | null } => !("engineError" in s),
        );
        const classed = played.filter((s) => s.klass !== null);
        if (classed.length === 0) {
            continue;
        }
        excluded++;
        const tally = ["admissible", ...MAP_CLASSES]
            .map((k) => [k, played.filter((s) => (s.klass ?? "admissible") === k).length] as const)
            .filter(([, count]) => count > 0)
            .map(([k, count]) => `${k} ${count}`);
        const errors = sweep.length - played.length;
        console.log(
            `plan ${index}: ${superPlanText(plans[index] as MapPlan)}; ${tally.join(", ")}` +
                `${errors > 0 ? `, engine errors ${errors}` : ""}`,
        );
        const recontacts = (s: { readonly strike: StrikeReading | null }): boolean =>
            s.strike?.later.some((c) => c.kind === "recontact") ?? false;
        for (const s of played) {
            if (s.klass === "unlawful" || recontacts(s)) {
                console.log(`  ${superSampleText(s, ANCHOR_LAWN)}; ${strikeText(s.strike)}`);
            }
        }
    }
    console.log(`excluded plans: ${excluded} of ${merged.samples.size} swept`);
}

/** The ratio grid's read-out bin (plan B-d7): past it, the bound's cause is found before the full map. */
const JUMPINESS_LIMIT = 0.1;

/** The lawn the jumpiness bound reads (s): the normal lawn, the impact's. */
const JUMPINESS_LAWN = 10;

/** Numerical, not physical: the worst neighbours the jumpiness section prints per type. */
const JUMPINESS_LISTED = 5;

/** One follow-through point's plays (plan B-d7): the map's, and its first pass at the same hold. */
interface JumpinessRow {
    readonly plan: MapPlan;
    readonly ratio: number;
    readonly firstPass: number;
    readonly admissible: boolean;
}

/** Plays `plan` both ways and prints its line; an engine error is printed, its ratios NaN, and the sweep goes on. */
function jumpinessRow(type: RollType, plan: MapPlan, power: number): JumpinessRow {
    const at = `drive ${plan.drive}, handReach ${plan.handReach} m, window ${plan.window * 1000} ms`;
    try {
        const sample = playSample(type, plan, power, [JUMPINESS_LAWN]);
        const ratio = sample.byLawn[JUMPINESS_LAWN]?.ratio ?? NaN;
        const firstPass =
            sample.passes === 0 ? NaN : firstPassRead(type, plan, power, sample.firmness, JUMPINESS_LAWN).ratio;
        console.log(
            `${at}: ratio ${ratio.toFixed(3)}, first pass ${firstPass.toFixed(3)}, ${sample.klass ?? "admissible"}` +
                `${sample.reason === null ? "" : ` (${sample.reason})`}, passes ${sample.passes}, ` +
                `sigma ${sample.sigma?.toFixed(3) ?? "none"}`,
        );
        return { plan, ratio, firstPass, admissible: sample.klass === null };
    } catch (error) {
        console.log(`${at}: engine error: ${error instanceof Error ? error.message : String(error)}`);
        return { plan, ratio: NaN, firstPass: NaN, admissible: false };
    }
}

/** A neighbour pair's largest gap as text, or that no pair has one. */
function boundText(gaps: readonly NeighbourGap[]): string {
    return `${gaps[0]?.gap.toFixed(3) ?? "none"} over ${gaps.length} pairs`;
}

function jumpinessOf(type: RollType): void {
    const grid = gridFor(type);
    const book = textBook(type);
    const power = canonicalPower(type, openWorld(JUMPINESS_LAWN));
    console.log(`\n${type}, power ${power.toFixed(4)}, lean and feet at the text book's, ${JUMPINESS_LAWN} s lawn:`);
    const rows = followThroughPlans(book, grid).map((plan) => jumpinessRow(type, plan, power));
    const admissible = rows.filter((r) => r.admissible);
    const practised = neighbourGaps(
        grid,
        admissible.map((r) => ({ plan: r.plan, ratio: r.ratio })),
    );
    const firstPass = neighbourGaps(
        grid,
        admissible.map((r) => ({ plan: r.plan, ratio: r.firstPass })),
    );
    const everyPlay = neighbourGaps(
        grid,
        rows.map((r) => ({ plan: r.plan, ratio: r.ratio })),
    );
    const firstOf = (gap: NeighbourGap): number => {
        const ofPlan = (plan: MapPlan): number =>
            rows.find(
                (r) =>
                    r.plan.drive === plan.drive && r.plan.handReach === plan.handReach && r.plan.window === plan.window,
            )?.firstPass ?? NaN;
        return Math.abs(ofPlan(gap.a) - ofPlan(gap.b));
    };
    console.log(`${type} tally: ${admissible.length} of ${rows.length} points admissible`);
    console.log(`  bound, admissible neighbours, practised: ${boundText(practised)}`);
    console.log(`  bound, the same neighbours, first pass: ${boundText(firstPass)}`);
    console.log(`  bound, every played point, practised: ${boundText(everyPlay)}`);
    // A handReach of 0 beside 0.1 m is no push against a push, a real difference, not jumpiness (plan B-d8).
    const pushes = neighbourGaps(
        grid,
        admissible.filter((r) => r.plan.handReach > 0).map((r) => ({ plan: r.plan, ratio: r.ratio })),
    );
    console.log(`  bound, admissible pushes alone, practised: ${boundText(pushes)}`);
    for (const gap of pushes.slice(0, JUMPINESS_LISTED)) {
        console.log(
            `  ${gap.gap.toFixed(3)} along ${gap.dimension}, ${gap.a[gap.dimension]} to ${gap.b[gap.dimension]}, at ` +
                `drive ${gap.a.drive}, handReach ${gap.a.handReach} m, window ${gap.a.window * 1000} ms; ` +
                `first pass ${firstOf(gap).toFixed(3)}`,
        );
    }
    const bound = pushes[0]?.gap ?? NaN;
    console.log(`  ${bound <= JUMPINESS_LIMIT ? "within" : "not within"} the ${JUMPINESS_LIMIT} read-out bin (B-d7)`);
}

async function sectionJumpiness(): Promise<void> {
    console.log(
        "== jumpiness. Plan B-d7, design A7 item 9: the ratio's largest difference between neighbouring drive, " +
            "handReach and window grid points, at the text book's canonical power, played with the map's found hold " +
            "and practice, and as the first pass alone at the same hold ==",
    );
    const types: readonly RollType[] = process.env.TYPE === undefined ? ["full-roll", "pass-roll"] : [rollType()];
    for (const type of types) {
        jumpinessOf(type);
    }
}

const SECTIONS: Readonly<Record<string, () => void | Promise<void>>> = {
    lawn: sectionLawn,
    jumpiness: sectionJumpiness,
    matrix: sectionMatrix,
    run: sectionRun,
    merge: sectionMerge,
    cost: sectionCost,
    stage1: sectionStage1,
    summary: sectionSummary,
    super: sectionSuper,
};

if (process.argv[1]?.endsWith("pushMap.ts")) {
    const name = process.env.SECTION ?? "";
    const section = SECTIONS[name];
    if (section === undefined) {
        throw new Error(`SECTION must be one of ${Object.keys(SECTIONS).join(", ")}`);
    }
    await section();
}
