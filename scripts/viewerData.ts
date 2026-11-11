/**
 * The viewer's data (side-on viewer spec §3.3; plan `docs/superpowers/plans/2026-11-11-side-on-viewer.md`, Task 3):
 * from the found-hold record in `reference/derived`, writes into OUT (default `public/viewer`):
 * - `defaults.json`: `envelope-defaults.json`'s `found` picks;
 * - `bands-<type>.bin`: each type's band table (src/lab/judge.ts's writeBandTable), its axes from the grid (gridFor);
 * - `grips.json`: each grip plan's type, inputs, power, three grips, its outcome at the reliable grip and its timing;
 * - `sources.json`: the inputs' SHA-256s and the command.
 * Fails if the files' total gzipped size passes BUDGET. Run with
 * `env OUT=public/viewer npx --no-install tsx scripts/viewerData.ts`. Not part of the test suite.
 */
import {
    TABLE_DIMENSIONS,
    encodePoint,
    pointCount,
    pointIndex,
    writeBandTable,
    type GripPlan,
    type TableBand,
    type TableHeader,
} from "../src/lab/judge";
import { MAP_TYPES, type MapClass, type MapPlan, type MapType } from "../src/lab/play";
import { parseRecord } from "./pushMapChecks";
import { gridFor } from "./pushMapGrid";

declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

/** The viewer's whole download, gzipped (spec §3.3's assumption): 6 MB. */
export const BUDGET = 6_000_000;

/** The record's directory. */
const RECORD = "reference/derived";

/** The Node calls the script uses (tsx runs under Node; the project has no Node types). */
interface Node {
    readonly fs: {
        readFileSync(path: string): Uint8Array;
        writeFileSync(path: string, data: Uint8Array | string): void;
        mkdirSync(path: string, options: { recursive: boolean }): void;
    };
    readonly zlib: {
        gunzipSync(data: Uint8Array): Uint8Array;
        gzipSync(data: Uint8Array | string, options: { level: number }): Uint8Array;
    };
    readonly crypto: {
        createHash(algorithm: "sha256"): { update(data: Uint8Array): { digest(encoding: "hex"): string } };
    };
}

async function node(): Promise<Node> {
    const load = async (name: string): Promise<unknown> => import(/* @vite-ignore */ name);
    return {
        fs: (await load("node:fs")) as Node["fs"],
        zlib: (await load("node:zlib")) as Node["zlib"],
        crypto: (await load("node:crypto")) as Node["crypto"],
    };
}

/** `type`'s table header: the grid's axes, every value ascending with its graded flag, the ranges and lawns. */
export function tableHeader(type: MapType): TableHeader {
    const grid = gridFor(type);
    const axes = Object.fromEntries(
        TABLE_DIMENSIONS.map((d) => {
            const values = [...grid[d].graded, ...grid[d].beyond].sort((a, b) => a - b);
            return [d, { values, graded: values.map((v) => grid[d].graded.includes(v)) }];
        }),
    ) as unknown as TableHeader["axes"];
    return { type, axes, ranges: grid.ranges, lawns: grid.lawns };
}

/** `type`'s band table's bytes from its record CSV's text. Throws on a row off the grid, repeated, or timed. */
export function bandTableBytes(type: MapType, csv: string): Uint8Array {
    const header = tableHeader(type);
    const n = pointCount(header);
    const codes = new Uint8Array(n);
    const powers = new Float32Array(n).fill(NaN);
    for (const row of parseRecord(csv)) {
        const plan = row as unknown as MapPlan;
        if (row.onset !== 0) {
            throw new Error(`viewerData: ${type} row with onset ${row.onset}; the grid's hands are on time`);
        }
        const index = pointIndex(header, plan, row.range, row.lawn);
        if (index === null) {
            throw new Error(`viewerData: ${type} row off the grid: ${JSON.stringify(row)}`);
        }
        if (codes[index] !== 0) {
            throw new Error(`viewerData: ${type} row repeated: ${JSON.stringify(row)}`);
        }
        codes[index] = encodePoint(row.band as TableBand, row.klass === "" ? null : (row.klass as MapClass));
        powers[index] = row.power;
    }
    return writeBandTable(header, codes, powers);
}

/** The grip record's plan as it is stored. */
interface RecordedGrip {
    readonly type: MapType;
    readonly plan: MapPlan;
    readonly power: number;
    readonly set: "start" | "held";
    readonly entry: {
        readonly plays: readonly { readonly grip: number; readonly range: number; readonly ratio: number }[];
        readonly bounds: {
            readonly least: number | null;
            readonly firmest: number | null;
            readonly reliable: number | null;
        };
        readonly timing: readonly {
            readonly early: number;
            readonly klass: string | null;
            readonly range: number;
            readonly ratio: number;
        }[];
    };
}

/** The grip record's plans as the viewer reads them (spec §3.3). */
export function gripPlans(record: { readonly plans: readonly RecordedGrip[] }): GripPlan[] {
    return record.plans.map((p) => {
        const { least, firmest, reliable } = p.entry.bounds;
        const at = reliable === null ? undefined : p.entry.plays.find((play) => play.grip === reliable);
        return {
            type: p.type,
            plan: p.plan,
            power: p.power,
            set: p.set,
            least,
            firmest,
            reliable,
            range: at?.range ?? null,
            ratio: at?.ratio ?? null,
            timing: p.entry.timing.map(({ early, klass, range, ratio }) => ({ early, klass, range, ratio })),
        };
    });
}

async function main(): Promise<void> {
    const { fs, zlib, crypto } = await node();
    const out = process.env.OUT ?? "public/viewer";
    const sha = (bytes: Uint8Array): string => crypto.createHash("sha256").update(bytes).digest("hex");
    const sources: Record<string, string> = {};
    const read = (path: string): Uint8Array => {
        const bytes = fs.readFileSync(path);
        sources[path] = sha(bytes);
        return bytes;
    };
    const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);
    const files: Record<string, Uint8Array | string> = {};

    const defaults = JSON.parse(text(read(`${RECORD}/envelope-defaults.json`))) as { readonly found: unknown };
    files["defaults.json"] = JSON.stringify(defaults.found);
    for (const type of MAP_TYPES) {
        const csv = text(zlib.gunzipSync(read(`${RECORD}/envelope-${type}.csv.gz`)));
        files[`bands-${type}.bin`] = bandTableBytes(type, csv);
    }
    const grip = JSON.parse(text(zlib.gunzipSync(read(`${RECORD}/envelope-grip.json.gz`)))) as {
        readonly plans: readonly RecordedGrip[];
    };
    files["grips.json"] = JSON.stringify(gripPlans(grip));
    for (const path of ["scripts/viewerData.ts", "src/lab/judge.ts"]) {
        read(path);
    }
    files["sources.json"] = `${JSON.stringify(
        { command: `env OUT=${out} npx --no-install tsx scripts/viewerData.ts`, sources },
        null,
        4,
    )}\n`;

    let total = 0;
    for (const [name, data] of Object.entries(files)) {
        const zipped = zlib.gzipSync(data, { level: 9 }).length;
        total += zipped;
        console.log(`${name}: ${data.length} bytes, ${zipped} gzipped`);
    }
    console.log(`total gzipped: ${total} bytes (budget ${BUDGET})`);
    if (total > BUDGET) {
        throw new Error(`viewerData: ${total} bytes gzipped passes the ${BUDGET}-byte budget`);
    }
    fs.mkdirSync(out, { recursive: true });
    for (const [name, data] of Object.entries(files)) {
        fs.writeFileSync(`${out}/${name}`, data);
    }
}

await main();
