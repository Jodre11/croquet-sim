import { describe, expect, it } from "vitest";
import { judge, readBandTable, readPoint, type TableBand } from "../../src/lab/judge";
import { MAP_TYPES, type MapPlan } from "../../src/lab/play";
import { parseRecord } from "../../scripts/pushMapChecks";

/** The Node calls the test uses (the project has no Node types). */
interface Node {
    readonly fs: { readFileSync(path: string): Uint8Array; readFileSync(path: string, encoding: "utf8"): string };
    readonly zlib: { gunzipSync(data: Uint8Array): Uint8Array };
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

const six = (x: number): number => Number(x.toPrecision(6));

/** The judgement of a record row on its own grid point (spec §3.3). */
function judgedBand(band: TableBand, klass: string | null): string {
    if (band === "viable" || band === "edgy") {
        return band;
    }
    return band === "unplayable" || klass !== null ? "non-viable" : "unknown";
}

/** The viewer's band tables against the record (side-on viewer spec §1 item 1, §4). */
describe("the viewer's data", () => {
    it("was packed from today's record", async () => {
        const { fs, crypto } = await node();
        const { sources } = JSON.parse(fs.readFileSync("public/viewer/sources.json", "utf8")) as {
            readonly sources: Readonly<Record<string, string>>;
        };
        for (const [path, sha] of Object.entries(sources).filter(([p]) => p.startsWith("reference/"))) {
            expect(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex"), path).toBe(sha);
        }
    });

    it.each(MAP_TYPES)(
        "%s: every record row reads back with its band, class and power",
        async (type) => {
            const { fs, zlib } = await node();
            const bytes = fs.readFileSync(`public/viewer/bands-${type}.bin`);
            const table = readBandTable(
                bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
            );
            const csv = new TextDecoder().decode(
                zlib.gunzipSync(fs.readFileSync(`reference/derived/envelope-${type}.csv.gz`)),
            );
            const rows = parseRecord(csv);
            let present = 0;
            for (let i = 0; i < table.codes.length; i++) {
                present += (table.codes[i] as number) >> 5;
            }
            expect(present).toBe(rows.length);
            const mismatches: string[] = [];
            for (const row of rows) {
                const plan = row as unknown as MapPlan;
                const klass = row.klass === "" ? null : row.klass;
                const point = readPoint(table, plan, row.range, row.lawn);
                const power = Number.isNaN(row.power) ? null : row.power;
                const read =
                    point === null ? null : { ...point, power: point.power === null ? null : six(point.power) };
                if (JSON.stringify(read) !== JSON.stringify({ band: row.band, klass, power })) {
                    mismatches.push(`${JSON.stringify(row)} read ${JSON.stringify(point)}`);
                    continue;
                }
                const graded = (["speedGain", "split", "lean", "feet", "drive", "handReach", "window"] as const).every(
                    (d) => table.axes[d].graded[table.axes[d].values.indexOf(plan[d])],
                );
                if (graded) {
                    const judged = judge(table, plan, row.range, row.lawn);
                    const want = judgedBand(row.band as TableBand, klass);
                    const judgedPower = judged.power === null ? null : six(judged.power);
                    const wrongKlass = want === "non-viable" && judged.klass !== klass;
                    if (judged.band !== want || judgedPower !== power || wrongKlass) {
                        mismatches.push(`${JSON.stringify(row)} judged ${JSON.stringify(judged)}`);
                    }
                }
            }
            expect(mismatches.slice(0, 5)).toEqual([]);
        },
        120_000,
    );
});
