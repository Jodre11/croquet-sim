/**
 * The sensitivity map (reality scorecard design §4): the scorecard at each free parameter's two bounds, the rest held,
 * against a base record; each card written as a record (label map-<name>-lo|hi), and the Δz matrix as
 * docs/superpowers/probes/scorecard/<date>-map.json. A parameter already mapped (its record present) is not re-run, so
 * an interrupted map resumes. Not part of the engine. Run with
 * `npx --no-install tsx scripts/scorecardMap.ts <base record.json> [--params a,b] [--mid a,b]`.
 */
import { FREE_PARAMS } from "./scorecard/params";
import { RECORD_DIR, readRecord, recordOf, runCard, writeRecord, type CardRecord } from "./scorecard/run";
import { scoreAll } from "./scorecard/score";
import { TARGETS } from "./scorecard/targets";

declare const process: { readonly argv: readonly string[] };

interface Files {
    existsSync(path: string): boolean;
    writeFileSync(path: string, data: string): void;
}
const fsName = "node:fs";
const fs = (await import(/* @vite-ignore */ fsName)) as Files;

const args = process.argv.slice(2);
const basePath = args[0];
if (basePath === undefined) throw new Error("usage: scorecardMap.ts <base record.json> [--params a,b] [--mid a,b]");
const option = (name: string): string[] | undefined => {
    const at = args.indexOf(name);
    return at < 0 ? undefined : (args[at + 1] ?? "").split(",");
};
const base = await readRecord(basePath);
const names = option("--params") ?? FREE_PARAMS.map((p) => p.name);
const mids = new Set(option("--mid") ?? []);
const day = new Date().toISOString().slice(0, 10);

const points: { name: string; at: string; value: number }[] = [];
for (const name of names) {
    const p = FREE_PARAMS.find((q) => q.name === name);
    if (p === undefined) throw new Error(`unknown parameter ${name}`);
    const [lo, hi] = p.bounds;
    const now = base.values[name] ?? p.entry.value;
    if (Math.abs(lo - now) > 1e-12) points.push({ name, at: "lo", value: lo });
    if (Math.abs(hi - now) > 1e-12) points.push({ name, at: "hi", value: hi });
    if (mids.has(name)) points.push({ name, at: "mid", value: (lo + hi) / 2 });
}

const cards: Record<string, CardRecord> = {};
for (const pt of points) {
    const label = `map-${pt.name}-${pt.at}`;
    const path = `${RECORD_DIR}/${day}-${label}.json`;
    if (fs.existsSync(path)) {
        cards[label] = await readRecord(path);
        console.log(`${label}: from ${path}`);
        continue;
    }
    const started = Date.now();
    const runs = await runCard({ [pt.name]: pt.value }, undefined, base.jobSeconds);
    const record = recordOf(label, { [pt.name]: pt.value }, runs);
    await writeRecord(record, base);
    cards[label] = record;
    console.log(
        `${label} = ${pt.value}: objective ${record.objective.toFixed(2)} (base ${base.objective.toFixed(2)}), ` +
            `${((Date.now() - started) / 1000).toFixed(0)} s, ${Object.keys(record.errors).length} errors`,
    );
}

const baseZ = Object.fromEntries(scoreAll(TARGETS, base.measured).map((s) => [s.target.id, s.z]));
const matrix: Record<string, { value: number; objective: number; dz: Record<string, number> }> = {};
for (const [label, card] of Object.entries(cards)) {
    const dz: Record<string, number> = {};
    for (const s of scoreAll(TARGETS, card.measured)) {
        const d = s.z - (baseZ[s.target.id] as number);
        if (Math.abs(d) >= 0.05) dz[s.target.id] = Number(d.toFixed(3));
    }
    matrix[label] = { value: Object.values(card.overrides)[0] as number, objective: card.objective, dz };
}
fs.writeFileSync(`${RECORD_DIR}/${day}-map.json`, `${JSON.stringify({ base: basePath, matrix }, null, 2)}\n`);
console.log(`map written: ${RECORD_DIR}/${day}-map.json`);
