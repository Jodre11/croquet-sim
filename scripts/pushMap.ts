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
 * Run with `env SECTION=lawn npx --yes tsx scripts/pushMap.ts`; environment: SECTION (a section's name); for run, TYPE
 * (a roll), SHARD (k/N, default 0/1) and OUT (a file); for merge, TYPE and IN (a directory).
 * Not part of the test suite.
 */
import { simulateImpact } from "../src/engine/impact/simulateImpact";
import { length, sub } from "../src/engine/math/vec3";
import { planStroke } from "../src/engine/swing/buildContact";
import type { ShotSetup } from "../src/engine/swing/types";
import { BALL_IDS, type BallState, type BallStates } from "../src/engine/types";
import { canonicalSetup } from "../tests/engine/support/shot";
import { openWorld, opened } from "./openLawn";
import {
    doneIndices,
    grade,
    gridFor,
    mergeLines,
    plansOf,
    readsJson,
    readsOf,
    sampleErrors,
    shardLine,
    type SweepSample,
} from "./pushMapGrid";
import { ROLL_TYPES, playSample, type RollType } from "./pushMapRun";

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

async function sectionMerge(): Promise<void> {
    const type = rollType();
    const dir = required("IN");
    const fs = await files();
    const grid = gridFor(type);
    const plans = plansOf(type, grid);
    const shards = fs
        .readdirSync(dir)
        .filter((name) => isShardOf(type, name))
        .sort();
    const lines: string[] = [];
    for (const name of shards) {
        lines.push(...fs.readFileSync(`${dir}/${name}`, "utf8").split("\n"));
    }
    const merged = mergeLines(plans, lines);
    console.log(`== merge. Plan decision 9: ${type}, ${shards.length} shard files, ${plans.length} plans ==`);
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

const SECTIONS: Readonly<Record<string, () => void | Promise<void>>> = {
    lawn: sectionLawn,
    run: sectionRun,
    merge: sectionMerge,
};

if (process.argv[1]?.endsWith("pushMap.ts")) {
    const name = process.env.SECTION ?? "";
    const section = SECTIONS[name];
    if (section === undefined) {
        throw new Error(`SECTION must be one of ${Object.keys(SECTIONS).join(", ")}`);
    }
    await section();
}
