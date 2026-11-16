/**
 * Runs the scorecard (reality scorecard design §3.4): every job in its own worker process, WORKERS at a time at nice
 * 10, under a parameter override; and the record's reading, writing and text table. Shared by scripts/scorecard.ts, the
 * sensitivity map and the joint fit.
 */
import { currentValues, type Overrides } from "./params";
import {
    bandOf,
    familySums,
    objectiveOf,
    scoreAll,
    worsened,
    type Band,
    type Measured,
    type Scored,
    type Target,
} from "./score";
import { DERIVED, deriveMeans, TARGETS } from "./targets";

declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

/** The child-process calls the runner uses (tsx runs under Node; the project has no Node types). */
interface Stream {
    on(event: "data", listener: (chunk: { toString(): string }) => void): void;
}
interface Child {
    readonly stdout: Stream;
    readonly stderr: Stream;
    on(event: "close", listener: (code: number | null) => void): void;
}
interface ChildProcesses {
    spawn(command: string, args: readonly string[], options: { readonly cwd?: string }): Child;
}
interface Files {
    existsSync(path: string): boolean;
    mkdirSync(path: string, options: { readonly recursive: true }): void;
    readFileSync(path: string, encoding: "utf8"): string;
    writeFileSync(path: string, data: string): void;
}

async function node<T>(specifier: string): Promise<T> {
    return (await import(/* @vite-ignore */ specifier)) as T;
}

/** Worker processes at once: SCORECARD_WORKERS, else one per core of this machine less two. */
export const WORKERS = Number(process.env.SCORECARD_WORKERS ?? 8);

/** Every job the targets name, in first-named order. */
export function jobsOf(targets: readonly Target[]): string[] {
    return [...new Set(targets.map((t) => t.job))].filter((j) => j !== DERIVED);
}

/** One job's run in its worker: its measurements and wall time, or its error output. */
export interface JobRun {
    readonly job: string;
    readonly seconds: number;
    readonly measured: Readonly<Record<string, Measured>>;
    readonly error?: string;
}

function runJob(cp: ChildProcesses, job: string, overrides: Overrides): Promise<JobRun> {
    const arg = JSON.stringify({ job, overrides });
    const child = cp.spawn("nice", ["-n", "10", "npx", "--no-install", "tsx", "scripts/scorecard/worker.ts", arg], {});
    let out = "";
    let err = "";
    child.stdout.on("data", (c) => (out += c.toString()));
    child.stderr.on("data", (c) => (err += c.toString()));
    return new Promise((resolve) => {
        child.on("close", (code) => {
            const line = out.split("\n").find((l) => l.startsWith("RESULT "));
            if (code !== 0 || line === undefined) {
                resolve({ job, seconds: 0, measured: {}, error: `exit ${code}: ${err.slice(-2000)}` });
                return;
            }
            resolve(JSON.parse(line.slice("RESULT ".length)) as JobRun);
        });
    });
}

/**
 * Runs `jobs` under `overrides`, WORKERS at a time, longest first by `hint` (job → seconds of a previous run);
 * `progress` hears each job as it ends.
 */
export async function runCard(
    overrides: Overrides,
    jobs: readonly string[] = jobsOf(TARGETS),
    hint: Readonly<Record<string, number>> = {},
    progress: (run: JobRun, done: number, total: number) => void = () => {},
): Promise<JobRun[]> {
    const cp = await node<ChildProcesses>("node:child_process");
    const queue = [...jobs].sort((a, b) => (hint[b] ?? 0) - (hint[a] ?? 0));
    const runs: JobRun[] = [];
    const worker = async (): Promise<void> => {
        for (let job = queue.shift(); job !== undefined; job = queue.shift()) {
            const run = await runJob(cp, job, overrides);
            runs.push(run);
            progress(run, runs.length, jobs.length);
        }
    };
    await Promise.all(Array.from({ length: Math.min(WORKERS, jobs.length) }, worker));
    return runs;
}

/** A scorecard record (design §3.4). */
export interface CardRecord {
    readonly date: string;
    readonly label: string;
    /** Every free parameter's value in this run: the reference's, with the override on top. */
    readonly values: Readonly<Record<string, number>>;
    readonly overrides: Overrides;
    readonly measured: Readonly<Record<string, Measured>>;
    readonly jobSeconds: Readonly<Record<string, number>>;
    readonly errors: Readonly<Record<string, string>>;
    readonly objective: number;
    readonly families: Readonly<Record<string, { sum: number; count: number }>>;
}

/** The record of `runs` under `overrides`. */
export function recordOf(label: string, overrides: Overrides, runs: readonly JobRun[]): CardRecord {
    const measured: Record<string, Measured> = {};
    const jobSeconds: Record<string, number> = {};
    const errors: Record<string, string> = {};
    for (const run of runs) {
        Object.assign(measured, run.measured);
        jobSeconds[run.job] = run.seconds;
        if (run.error !== undefined) errors[run.job] = run.error;
    }
    Object.assign(measured, deriveMeans(measured));
    const scored = scoreAll(TARGETS, measured);
    return {
        date: new Date().toISOString(),
        label,
        values: { ...currentValues(), ...overrides },
        overrides,
        measured,
        jobSeconds,
        errors,
        objective: objectiveOf(scored),
        families: familySums(scored, "fit"),
    };
}

/** `record` re-scored against today's targets: its objective and families recomputed from its measures. */
export function rescored(record: CardRecord): CardRecord {
    const measured = { ...record.measured, ...deriveMeans(record.measured) };
    const scored = scoreAll(TARGETS, measured);
    return { ...record, measured, objective: objectiveOf(scored), families: familySums(scored, "fit") };
}

/** The directory the records are written to (design §3.4). */
export const RECORD_DIR = "docs/superpowers/probes/scorecard";

/** Writes `record` as JSON and its text table beside it; returns the JSON's path. */
export async function writeRecord(record: CardRecord, compare?: CardRecord): Promise<string> {
    const fs = await node<Files>("node:fs");
    fs.mkdirSync(RECORD_DIR, { recursive: true });
    const base = `${RECORD_DIR}/${record.date.slice(0, 10)}-${record.label}`;
    fs.writeFileSync(`${base}.json`, `${JSON.stringify(record, null, 2)}\n`);
    fs.writeFileSync(`${base}.txt`, `${tableOf(record, compare)}\n`);
    return `${base}.json`;
}

/** Reads a record. */
export async function readRecord(path: string): Promise<CardRecord> {
    const fs = await node<Files>("node:fs");
    return JSON.parse(fs.readFileSync(path, "utf8")) as CardRecord;
}

const fmt = (x: Measured): string =>
    x === null
        ? "—"
        : typeof x === "boolean"
          ? x
              ? "clean"
              : "NOT clean"
          : Math.abs(x) >= 100
            ? x.toFixed(0)
            : x.toPrecision(3);

function sourceText(t: Target): string {
    if (t.kind === "clean") return "clean";
    if (t.kind === "band")
        return `${fmt((t.band as readonly [number, number])[0])}–${fmt((t.band as readonly [number, number])[1])}`;
    return `${fmt(t.value as number)} ± ${fmt(t.sigma as number)}`;
}

/** The record's text table: each target's measure, source, z and band, by family; with `compare`'s z beside it. */
export function tableOf(record: CardRecord, compare?: CardRecord): string {
    // Only the targets of the jobs this record ran (a --jobs subset), grouped by family in the design's order.
    const ran = new Set([...Object.keys(record.jobSeconds), DERIVED]);
    const families = [...new Set(TARGETS.map((t) => t.family))];
    const shown = TARGETS.filter((t) => ran.has(t.job)).sort(
        (a, b) => families.indexOf(a.family) - families.indexOf(b.family),
    );
    const scored = scoreAll(shown, record.measured);
    const before = compare === undefined ? undefined : scoreAll(shown, compare.measured);
    const lines: string[] = [
        `Scorecard ${record.label}, ${record.date}`,
        `overrides ${JSON.stringify(record.overrides)}`,
        `objective ${record.objective.toFixed(2)}${compare === undefined ? "" : ` (was ${compare.objective.toFixed(2)})`}`,
    ];
    const tally: Record<Band, number> = { pass: 0, near: 0, miss: 0 };
    let family = "";
    scored.forEach((s: Scored, i: number) => {
        if (s.target.family !== family) {
            family = s.target.family;
            lines.push("", `== ${family} ==`);
        }
        tally[s.band] += 1;
        const was = before?.[i];
        const moved = was === undefined ? "" : ` was ${was.z.toFixed(2)}${worsened(was.band, s.band) ? " WORSE" : ""}`;
        lines.push(
            `${s.target.id.padEnd(28)} ${s.target.use.padEnd(8)} ${fmt(s.measured).padStart(9)} / ` +
                `${sourceText(s.target).padEnd(20)} z ${s.z.toFixed(2).padStart(6)} ${s.band}${moved}`,
        );
    });
    lines.push("", `pass ${tally.pass}, near ${tally.near}, miss ${tally.miss}`);
    for (const [job, error] of Object.entries(record.errors)) lines.push(`ERROR ${job}: ${error}`);
    return lines.join("\n");
}

export { bandOf };
