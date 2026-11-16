/**
 * The reality scorecard (reality scorecard design §3): every external target measured on the model in one run, scored
 * against its source, written as a record and a text table under docs/superpowers/probes/scorecard/. Not part of the
 * engine. Run with
 * `npx --no-install tsx scripts/scorecard.ts [--label L] [--set name=value …] [--jobs a,b] [--compare record.json]`;
 * `--table record.json` re-scores a written record against today's targets and rewrites its table, with no run.
 * SCORECARD_WORKERS sets the worker count (default 8).
 */
import {
    jobsOf,
    readRecord,
    recordOf,
    rescored,
    runCard,
    tableOf,
    writeRecord,
    type CardRecord,
} from "./scorecard/run";
import { TARGETS } from "./scorecard/targets";

declare const process: { readonly argv: readonly string[] };

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
    const at = args.indexOf(name);
    return at < 0 ? undefined : args[at + 1];
};
const comparePath = option("--compare");
const compare: CardRecord | undefined = comparePath === undefined ? undefined : await readRecord(comparePath);
const tablePath = option("--table");
if (tablePath !== undefined) {
    const record = rescored(await readRecord(tablePath));
    await writeRecord(record, compare);
    console.log(tableOf(record, compare));
} else {
    const overrides: Record<string, number> = {};
    args.forEach((a, i) => {
        if (a !== "--set") return;
        const [name, value] = (args[i + 1] ?? "").split("=");
        overrides[name as string] = Number(value);
    });
    const label = option("--label") ?? "card";
    const jobs = option("--jobs")?.split(",") ?? jobsOf(TARGETS);
    const started = Date.now();
    const runs = await runCard(overrides, jobs, compare?.jobSeconds ?? {}, (run, done, total) =>
        console.log(
            `[${done}/${total}] ${run.job} ${run.seconds.toFixed(0)} s${run.error === undefined ? "" : " ERROR"}`,
        ),
    );
    const record = recordOf(label, overrides, runs);
    const path = await writeRecord(record, compare);
    console.log(tableOf(record, compare));
    console.log(`\nwall ${((Date.now() - started) / 1000).toFixed(0)} s; record ${path}`);
}
