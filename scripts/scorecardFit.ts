/**
 * The joint fit (reality scorecard design §5): Nelder–Mead over the free parameters the sensitivity map shows matter,
 * in their bounds normalised to [0, 1], minimising the card's objective (§3.2). Every evaluation is appended to
 * docs/superpowers/probes/scorecard/<date>-<label>.jsonl, and a re-run replays the log before running anything new, so
 * an interrupted fit resumes. The best set is written as a record (label <label>-best); reference/ is never changed.
 * Not part of the engine. Run with
 * `npx --no-install tsx scripts/scorecardFit.ts <base record.json> [--budget N] [--label L]` (label default fit).
 */
import { FREE_PARAMS } from "./scorecard/params";
import { RECORD_DIR, readRecord, recordOf, runCard, writeRecord, type CardRecord } from "./scorecard/run";

declare const process: { readonly argv: readonly string[] };

interface Files {
    existsSync(path: string): boolean;
    readFileSync(path: string, encoding: "utf8"): string;
    appendFileSync(path: string, data: string): void;
}
const fsName = "node:fs";
const fs = (await import(/* @vite-ignore */ fsName)) as Files;

/** The map's parameters with an effect of more than 1 z on a fit target (2026-11-16 map), in FREE_PARAMS order. */
export const FIT_PARAMS: readonly string[] = [
    "faceFriction",
    "ballBallFriction",
    "tangentialStiffnessRatio",
    "handCouplingPeriod",
    "handCouplingDampingRatio",
    "armMass",
    "ballTurfSliding",
];

const args = process.argv.slice(2);
const basePath = args[0];
if (basePath === undefined) throw new Error("usage: scorecardFit.ts <base record.json> [--budget N]");
const budgetAt = args.indexOf("--budget");
const BUDGET = budgetAt < 0 ? 150 : Number(args[budgetAt + 1]);
const base = await readRecord(basePath);
const params = FIT_PARAMS.map((name) => {
    const p = FREE_PARAMS.find((q) => q.name === name);
    if (p === undefined) throw new Error(`unknown parameter ${name}`);
    return p;
});
const day = new Date().toISOString().slice(0, 10);
const labelAt = args.indexOf("--label");
const LABEL = labelAt < 0 ? "fit" : (args[labelAt + 1] as string);
const LOG = `${RECORD_DIR}/${day}-${LABEL}.jsonl`;

const toValues = (x: readonly number[]): Record<string, number> =>
    Object.fromEntries(
        params.map((p, i) => {
            const u = Math.min(1, Math.max(0, x[i] as number));
            return [p.name, p.bounds[0] + u * (p.bounds[1] - p.bounds[0])];
        }),
    );
const key = (x: readonly number[]): string => x.map((u) => Math.min(1, Math.max(0, u)).toFixed(4)).join(",");

const seen = new Map<string, CardRecord>();
if (fs.existsSync(LOG)) {
    for (const line of fs.readFileSync(LOG, "utf8").split("\n")) {
        if (line.trim() === "") continue;
        const { x, record } = JSON.parse(line) as { x: number[]; record: CardRecord };
        seen.set(key(x), record);
    }
}
let evaluations = 0;
let best: { x: number[]; record: CardRecord } | null = null;

async function evaluate(x: readonly number[]): Promise<number> {
    const k = key(x);
    let record = seen.get(k);
    if (record === undefined) {
        if (evaluations >= BUDGET) return Infinity;
        const overrides = toValues(x);
        record = recordOf(`${LABEL}-${evaluations}`, overrides, await runCard(overrides, undefined, base.jobSeconds));
        seen.set(k, record);
        fs.appendFileSync(LOG, `${JSON.stringify({ x, record })}\n`);
    }
    evaluations += 1;
    if (best === null || record.objective < best.record.objective) best = { x: [...x], record };
    console.log(`#${evaluations} ${record.objective.toFixed(3)} best ${best.record.objective.toFixed(3)} ${k}`);
    return record.objective;
}

/** Nelder–Mead in [0, 1]ⁿ (points clamped at evaluation), standard coefficients, from `start` with step `step`. */
async function nelderMead(start: readonly number[], step: number): Promise<void> {
    const n = start.length;
    const simplex: { x: number[]; f: number }[] = [{ x: [...start], f: await evaluate(start) }];
    for (let i = 0; i < n; i++) {
        const x = [...start];
        x[i] = (x[i] as number) + ((x[i] as number) + step <= 1 ? step : -step);
        simplex.push({ x, f: await evaluate(x) });
    }
    const clamp = (x: number[]): number[] => x.map((u) => Math.min(1, Math.max(0, u)));
    while (evaluations < BUDGET) {
        simplex.sort((a, b) => a.f - b.f);
        const worst = simplex[n] as { x: number[]; f: number };
        const centroid = Array.from(
            { length: n },
            (_, j) => simplex.slice(0, n).reduce((s, p) => s + (p.x[j] as number), 0) / n,
        );
        const along = (t: number): number[] => clamp(centroid.map((c, j) => c + t * (c - (worst.x[j] as number))));
        const xr = along(1);
        const fr = await evaluate(xr);
        const first = simplex[0] as { f: number };
        const second = simplex[n - 1] as { f: number };
        if (fr < first.f) {
            const xe = along(2);
            const fe = await evaluate(xe);
            simplex[n] = fe < fr ? { x: xe, f: fe } : { x: xr, f: fr };
        } else if (fr < second.f) {
            simplex[n] = { x: xr, f: fr };
        } else {
            const xc = fr < worst.f ? along(0.5) : along(-0.5);
            const fc = await evaluate(xc);
            if (fc < Math.min(fr, worst.f)) {
                simplex[n] = { x: xc, f: fc };
            } else {
                const lead = (simplex[0] as { x: number[] }).x;
                for (let i = 1; i <= n; i++) {
                    const x = clamp(
                        (simplex[i] as { x: number[] }).x.map(
                            (u, j) => (lead[j] as number) + 0.5 * (u - (lead[j] as number)),
                        ),
                    );
                    simplex[i] = { x, f: await evaluate(x) };
                }
            }
        }
        const spread = Math.max(...simplex.map((p) => p.f)) - Math.min(...simplex.map((p) => p.f));
        if (spread < 0.05) break;
    }
}

const start = params.map((p) => (p.entry.value - p.bounds[0]) / (p.bounds[1] - p.bounds[0]));
await nelderMead(start, 0.25);
const found = best as { x: number[]; record: CardRecord } | null;
if (found !== null) {
    const record = { ...found.record, label: `${LABEL}-best` };
    const path = await writeRecord(record, base);
    console.log(`best objective ${record.objective.toFixed(3)} (base ${base.objective.toFixed(3)}) at`);
    for (const p of params) {
        const v = record.values[p.name] as number;
        const u = (v - p.bounds[0]) / (p.bounds[1] - p.bounds[0]);
        console.log(`  ${p.name} ${v.toPrecision(4)} (${(100 * u).toFixed(0)}% of [${p.bounds[0]}, ${p.bounds[1]}])`);
    }
    console.log(`record ${path}; ${evaluations} evaluations`);
}
