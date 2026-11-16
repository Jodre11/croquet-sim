/**
 * One scorecard job in its own process (reality scorecard design §3.4): applies the parameter override before any
 * engine module loads, runs the job and prints its measurements as one RESULT line of JSON. Run by scripts/scorecard.ts
 * as `npx --no-install tsx scripts/scorecard/worker.ts '<{"job": …, "overrides": {…}}>'`.
 */
import { applyOverrides, type Overrides } from "./params";

declare const process: { readonly argv: readonly string[]; exitCode?: number };

const { job, overrides } = JSON.parse(process.argv[2] ?? "{}") as { job: string; overrides: Overrides };
applyOverrides(overrides);
const { JOBS } = await import("./jobs");
const run = JOBS[job];
if (run === undefined) {
    throw new Error(`unknown scorecard job ${job}`);
}
const started = Date.now();
const measured = run();
console.log(`RESULT ${JSON.stringify({ job, seconds: (Date.now() - started) / 1000, measured })}`);
