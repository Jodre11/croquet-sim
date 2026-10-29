/**
 * The rolls' push map (P2b.2b.2c.3b design; plan `docs/superpowers/plans/2026-10-29-p2b2b2c3b-push-map.md`): the
 * shards that play each roll type's grid, and the probe sections that read them. Recorded, not gated. Sections:
 * - lawn: plan decision 3, whether the impact depends on the lawn's speed: for each roll's canonical setup on the
 *   open lawn, the largest change in any handed-over ball's velocity between the 6 s and 14 s lawns' impacts and the
 *   10 s lawn's (impactLawnShift).
 * - run: plan decision 9, one shard of TYPE's grid (pushMapGrid.ts's gridFor and plansOf): the plans whose index is
 *   ≡ k mod N (SHARD=k/N), each played at the grid's powers on its lawns (playSample), appended to OUT as one JSON line
 *   per plan (shardLine) as it finishes. A sample the engine throws on is kept as its message at that power, and one
 *   outside the samples as the plan's; the shard goes on. OUT must be named `<TYPE>-<k>of<N>.jsonl`. Indices whose
 *   lines OUT already holds whole (doneIndices) are skipped, so a shard that died is re-run in place; a torn last line
 *   is ended first and its plan played again.
 * - merge: exactly the files `<TYPE>-<k>of<N>.jsonl` in IN merged (mergeLines), so no other run's file is read: the
 *   missing plan indices, the engine's errors (outside and inside the samples), the reads an engine error leaves out
 *   and the graded reads left unbanded for an unread neighbour are reported apart; each plan's reads at the grid's
 *   ranges and lawns (readsOf) are written to `<IN>/<TYPE>.reads.json`.
 * - cost: plan Task 5, the map's time: with PART=j/J, the j-th of J parts of COST_PLANS pass-roll plans drawn evenly
 *   is played at the grid's powers, each sample's seconds appended to `<IN>/cost-<j>of<J>.jsonl`; without PART, those
 *   files are tallied: the mean and 95th percentile per sample and each type's projected CPU hours on today's grid.
 * - stage1: plan Task 6, the half roll's map, from IN's half-roll shard files merged as merge merges them, and read at
 *   the grid's ranges and lawns (readsOf). The anchor (design §3.3) is today's default (textBook). It is played at the
 *   canonical power on the 10 s lawn, which gives the canonical's range, and then read at that range from its own
 *   sweep at the grid's powers: it lies off the grid (handReach 0.15 m, and a range below the grid's least). Its band
 *   is offGridBand's: unplayable if its play or read has a class, else its coarse cell's worst corner graded at that
 *   range from the merged sweeps (cellReads), an unplayable corner counting as edgy. Then: the region's admissible
 *   plans per range and lawn by band; the classes per range and lawn; the lawn's effect on the ratio; the least-effort
 *   plan per range and lawn; the non-monotone sweeps; and the set-ups with no admissible read, outside the envelope
 *   outright (§3.5), mixed or incomplete. It plays the anchor's 11 samples itself.
 * Run with `env SECTION=lawn npx --yes tsx scripts/pushMap.ts`. The environment: SECTION names the section; run takes
 * TYPE (a roll), SHARD (k/N, default 0/1) and OUT (a file); merge takes TYPE and IN (a directory); cost takes IN and
 * PART; stage1 takes IN. Not part of the test suite.
 */
import { simulateImpact } from "../src/engine/impact/simulateImpact";
import { length, sub } from "../src/engine/math/vec3";
import { planStroke } from "../src/engine/swing/buildContact";
import type { ShotSetup } from "../src/engine/swing/types";
import { BALL_IDS, type BallState, type BallStates } from "../src/engine/types";
import { swingReference } from "../src/reference/index";
import { canonicalSetup } from "../tests/engine/support/shot";
import { openWorld, opened } from "./openLawn";
import {
    MAP_CLASSES,
    cellReads,
    classCounts,
    doneIndices,
    excludedSetUps,
    grade,
    gridFor,
    inRegion,
    lawnSpreads,
    mergeLines,
    nonMonotoneCount,
    offGridBand,
    pickDefault,
    planKey,
    plansOf,
    quantile,
    readAt,
    readsJson,
    readsOf,
    regionCounts,
    sampleErrors,
    shardLine,
    spreadSummary,
    type MapGrid,
    type Merged,
    type SweepRead,
    type SweepSample,
} from "./pushMapGrid";
import { ROLL_TYPES, bodyBackswing, mapSetup, playSample, textBook, type MapPlan, type RollType } from "./pushMapRun";

declare const process: {
    readonly env: Readonly<Record<string, string | undefined>>;
    readonly argv: readonly string[];
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
function shardName(type: RollType, k: number, n: number): string {
    return `${type}-${k}of${n}.jsonl`;
}

/** Whether `name` is one of `type`'s shard files (shardName's pattern exactly). */
function isShardOf(type: RollType, name: string): boolean {
    return new RegExp(`^${type}-\\d+of\\d+\\.jsonl$`).test(name);
}

async function sectionRun(): Promise<void> {
    const type = rollType();
    const { k, n } = shardOf();
    const out = required("OUT");
    const name = shardName(type, k, n);
    if (!out.endsWith(`/${name}`) && out !== name) {
        throw new Error(`OUT must name the shard's file ${name}, the pattern merge reads`);
    }
    const fs = await files();
    const grid = gridFor(type);
    const plans = plansOf(type, grid);
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
    type: RollType,
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
    const type = rollType();
    const dir = required("IN");
    const fs = await files();
    const grid = gridFor(type);
    const plans = plansOf(type, grid);
    const { merged, shards } = mergeShards(fs, type, dir, plans);
    console.log(`== merge. Plan decision 9: ${type}, ${shards} shard files, ${plans.length} plans ==`);
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
    const { unbanded } = grade(type, grid, reads);
    console.log(`graded reads left unbanded (a neighbour unread): ${unbanded}`);
    const path = `${dir}/${type}.reads.json`;
    fs.writeFileSync(path, readsJson(reads));
    console.log(`written: ${path}`);
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
        `handReach ${plan.handReach} m, window ${(plan.window * 1000).toFixed(0)} ms` +
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

/** The anchor (design §3.3; plan Task 6): today's half-roll default, read at the canonical's range on the 10 s lawn. */
function printAnchor(grid: MapGrid, samples: ReadonlyMap<number, readonly SweepSample[]>): void {
    const type: RollType = "half-roll";
    const anchor = textBook(type);
    const world = openWorld(ANCHOR_LAWN);
    const backswing = swingReference[type].defaultBackswing.value;
    const power = backswing / bodyBackswing(mapSetup(type, anchor, 1), world);
    console.log("-- the anchor (design §3.3): today's half-roll default, the text book --");
    console.log(`plan: ${planText(anchor)}; canonical power p ${power.toFixed(4)} (backswing ${backswing} m)`);
    let exact: SweepSample;
    try {
        exact = playSample(type, anchor, power, [ANCHOR_LAWN]);
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
            `played at that power on the ${ANCHOR_LAWN} s lawn: ${exactClass}; the range was not reached, so the ` +
                "anchor has no read at it and no cell band",
        );
        return;
    }
    console.log(
        `played at that power on the ${ANCHOR_LAWN} s lawn: range ${range.toFixed(3)} m (the canonical's), ` +
            `${exactClass}, ratio ${ratio.toFixed(3)}, in 1.4–2.5: ${inRegion(type, ratio) ? "yes" : "no"}`,
    );
    const least = grid.ranges[0] ?? NaN;
    if (range < least) {
        console.log(
            `the canonical's range lies below the grid's least, ${least} m: no grid read holds it, so the anchor and ` +
                "its cell are read at it from their sweeps (readAt)",
        );
    }
    const sweep: SweepSample[] = grid.powers.map((p) => {
        try {
            return playSample(type, anchor, p, [ANCHOR_LAWN]);
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
        `the read's ratio in the half roll's region 1.4–2.5: ` +
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

async function sectionStage1(): Promise<void> {
    const type: RollType = "half-roll";
    const dir = required("IN");
    const fs = await files();
    const grid = gridFor(type);
    const plans = plansOf(type, grid);
    const { merged, shards } = mergeShards(fs, type, dir, plans);
    const { reads, noRead } = readsOf(grid, plans, merged.samples);
    const { banded, unbanded } = grade(type, grid, reads);
    const inSamples = [...sampleErrors(merged.samples).values()].reduce((a, b) => a + b, 0);
    const metres = (r: number): string => `${r.toFixed(2)} m`;
    console.log(
        `== stage1. Plan Task 6: the ${type}'s map, ${plans.length} plans, ${merged.samples.size} sweeps from ` +
            `${shards} shard files in ${dir}; ranges ${grid.ranges.map(metres).join(", ")}; lawns ` +
            `${grid.lawns.join(", ")} s ==`,
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
    printAnchor(grid, merged.samples);

    console.log("-- the region (A1): admissible graded plans with the ratio in 1.4–2.5, by band --");
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

    console.log("-- the classes (§3.5): every plan's read, graded and beyond, per range and lawn --");
    for (const c of classCounts(grid, plans, reads)) {
        const parts = ["admissible", ...MAP_CLASSES, "unread"] as const;
        console.log(`${metres(c.range)}, ${c.lawn} s: ${parts.map((k) => `${k} ${c.counts[k]}`).join(", ")}`);
    }

    console.log(
        "-- the lawn's effect (§3.2's guess): per plan and range, the ratio's spread across the lawns, " +
            "(max − min) / mean --",
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

    console.log("-- the least-effort plan per range and lawn (pickDefault: the region's least mean effort) --");
    for (const range of grid.ranges) {
        for (const lawn of grid.lawns) {
            const { plan, viable } = pickDefault(type, reads, banded, { range, lawn, split: 0 });
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

    console.log(`-- non-monotone sweeps (decision 2): ${nonMonotoneCount(grid, plans, reads)} of ${plans.length} --`);

    const excluded = excludedSetUps(grid, plans, reads);
    const outright = excluded.filter((e) => e.klass !== "mixed" && e.klass !== "incomplete");
    const mixed = excluded.filter((e) => e.klass === "mixed");
    const incomplete = excluded.filter((e) => e.klass === "incomplete");
    const setUpText = (e: (typeof excluded)[number]): string => {
        const beyond = !grid.lean.graded.includes(e.setUp.lean) || !grid.feet.graded.includes(e.setUp.feet);
        return (
            `lean ${(e.setUp.lean / DEG).toFixed(1)}°, feet ${e.setUp.feet.toFixed(3)} m` +
            `${beyond ? " (beyond)" : ""}: ${e.klass}, ${e.reads} reads, ${e.unread} unread`
        );
    };
    const groups = [
        ["outside the envelope outright (§3.5: every read present, the one class)", outright],
        ["no admissible read, every read present, classes mixed", mixed],
        ["no admissible read, but some reads missing (incomplete, not outright)", incomplete],
    ] as const;
    for (const [title, list] of groups) {
        console.log(`-- ${title}: ${list.length} set-ups --`);
        for (const e of list) {
            console.log(`  ${setUpText(e)}`);
        }
    }
}

const SECTIONS: Readonly<Record<string, () => void | Promise<void>>> = {
    lawn: sectionLawn,
    run: sectionRun,
    merge: sectionMerge,
    cost: sectionCost,
    stage1: sectionStage1,
};

if (process.argv[1]?.endsWith("pushMap.ts")) {
    const name = process.env.SECTION ?? "";
    const section = SECTIONS[name];
    if (section === undefined) {
        throw new Error(`SECTION must be one of ${Object.keys(SECTIONS).join(", ")}`);
    }
    await section();
}
