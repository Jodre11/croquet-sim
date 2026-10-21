/**
 * The croquet strokes' fit (P2b.2b.2c.2 design §5.3): the gate's ruled pair of shared candidates solved together so
 * that the drive and the AC stop reach Gugan 5's croquet ratios at their targets' speeds (scripts/ratioFit.ts's
 * evaluator and solver), from today's values within contact.json's bounds, or within a bound the gate widened.
 * Run with `npx --yes tsx scripts/fitRatios.ts <candidate> <candidate> > <file>`, a candidate written
 * `<candidate>=lo:hi` to widen its bounds; copy the file over reference/contact.json and run Prettier on it.
 * Prints reference/contact.json with each fitted value set, its provenance `derived` and its note naming the fit, to
 * stdout. The ball–ball contact time, if fitted, keeps Gugan's measured cluster in its note, and
 * `ballObstacleContactTime`'s value follows it (its note derives it as equal), its bounds kept. Prints every
 * evaluation's point and ratios, the result, and any fitted value on a bound, to stderr.
 *
 * Dormant since P2b.2b.2c.2b, whose impact work found the drive's excess in the strike's squeeze, not in the fit's
 * parameters. It is kept for a possible later fit of the hands' parameters. Three review items are open before it runs
 * again: parseCandidate's leniency, the exit code on "closest", and section C's "reachable" verdict across a jump
 * (scripts/croquetFitProbe.ts); the roadmap carries them.
 */
import contactJson from "../reference/contact.json";
import { ratioTargetsReference } from "../src/reference/index";
import { BOUNDS, TODAY, ratiosAt, solvePair, type Candidate, type FitParams } from "./ratioFit";

type Pair = readonly [number, number];

/** A ruled candidate and the bounds the fit keeps it to. */
interface Ruled {
    readonly key: Candidate;
    readonly bounds: Pair;
    readonly widened: boolean;
}

const CANDIDATES = Object.keys(BOUNDS) as Candidate[];

function parseCandidate(arg: string): Ruled {
    const [name, range] = arg.split("=") as [string, string | undefined];
    if (!(CANDIDATES as string[]).includes(name)) {
        throw new Error(`fitRatios: unknown candidate "${name}"; the candidates are ${CANDIDATES.join(", ")}`);
    }
    const key = name as Candidate;
    if (range === undefined) {
        return { key, bounds: BOUNDS[key], widened: false };
    }
    const ends = range.split(":").map(Number);
    const [lo, hi] = ends as [number, number];
    if (ends.length !== 2 || !Number.isFinite(lo) || !Number.isFinite(hi) || !(lo < hi)) {
        throw new Error(`fitRatios: "${arg}" must widen ${key}'s bounds as ${key}=lo:hi, with lo < hi`);
    }
    if (lo > BOUNDS[key][0] || hi < BOUNDS[key][1]) {
        throw new Error(
            `fitRatios: "${arg}" narrows ${key}'s bounds [${BOUNDS[key].join(", ")}]; a bound is only widened`,
        );
    }
    return { key, bounds: [lo, hi], widened: true };
}

// The project has no Node types; this script runs under tsx and reads only its arguments.
declare const process: { readonly argv: readonly string[] };

const args = process.argv.slice(2);
if (args.length !== 2) {
    throw new Error(
        `fitRatios: expected two candidates, got ${args.length}; the candidates are ${CANDIDATES.join(", ")}`,
    );
}
const pair = args.map(parseCandidate) as [Ruled, Ruled];
if (pair[0].key === pair[1].key) {
    throw new Error(`fitRatios: the pair must name two candidates, got ${pair[0].key} twice`);
}

const drive = ratioTargetsReference.drive;
const stop = ratioTargetsReference["stop-ac"];
const toleranceOf = (bounds: readonly [number, number] | undefined): number =>
    bounds === undefined ? Number.NaN : (bounds[1] - bounds[0]) / 2;
const targets: Pair = [drive.ratio.value, stop.ratio.value];
const tolerances: Pair = [toleranceOf(drive.ratio.bounds), toleranceOf(stop.ratio.bounds)];

// Six significant figures keep the note's figures as the reference gives them (0.2, not 0.20000000000000018).
const plain = (x: number): string => String(Number(x.toPrecision(6)));
const fmt = (x: number): string => x.toFixed(4);

const paramsAt = (x: Pair): FitParams => ({ ...TODAY, [pair[0].key]: x[0], [pair[1].key]: x[1] });
const pointText = (x: Pair): string => `${pair[0].key} ${x[0]}, ${pair[1].key} ${x[1]}`;

let evaluation = 0;
const evaluate = (x: Pair): Pair => {
    const { drive: d, stop: s } = ratiosAt(paramsAt(x));
    evaluation++;
    console.error(`#${evaluation}: ${pointText(x)}: drive ${fmt(d)}, stop ${fmt(s)}`);
    return [d, s];
};

const start: Pair = [TODAY[pair[0].key], TODAY[pair[1].key]];
console.error(
    `fitting ${pair[0].key} [${pair[0].bounds.join(", ")}] and ${pair[1].key} [${pair[1].bounds.join(", ")}] ` +
        `to drive ${plain(targets[0])} ± ${plain(tolerances[0])} and stop ${plain(targets[1])} ± ` +
        `${plain(tolerances[1])}, from ${pointText(start)}`,
);
const result = solvePair(evaluate, start, [pair[0].bounds, pair[1].bounds], targets, tolerances);
const outcome = result.converged ? "converged" : "closest";
console.error(
    `${outcome} after ${result.evaluations} evaluations: ${pointText(result.point)}: drive ` +
        `${fmt(result.values[0])} (error ${fmt(result.values[0] - targets[0])}), stop ${fmt(result.values[1])} ` +
        `(error ${fmt(result.values[1] - targets[1])})`,
);
pair.forEach((ruled, j) => {
    const v = result.point[j] as number;
    const side = v === ruled.bounds[0] ? "lower" : v === ruled.bounds[1] ? "upper" : null;
    console.error(
        side === null
            ? `${ruled.key} ${v} lies inside its bounds`
            : `${ruled.key} ${v} lies on its ${side} bound: flagged for the gate`,
    );
});

const speeds =
    drive.speed.value === stop.speed.value
        ? `${plain(drive.speed.value)} m/s`
        : `${plain(drive.speed.value)} and ${plain(stop.speed.value)} m/s`;

type Entry = { value: number; bounds?: number[]; provenance: string; note: string };
const out = JSON.parse(JSON.stringify(contactJson)) as Record<string, Entry>;
pair.forEach((ruled, j) => {
    const other = (pair[j === 0 ? 1 : 0] as Ruled).key;
    const item = out[ruled.key] as Entry;
    item.value = result.point[j] as number;
    if (ruled.widened) {
        item.bounds = [...ruled.bounds];
    }
    item.provenance = "derived";
    item.note =
        `${item.note} Fitted (P2b.2b.2c.2 design §5.3) with ${other} to Gugan 5's drive ${plain(targets[0])} ± ` +
        `${plain(tolerances[0])} and stop ${plain(targets[1])} ± ${plain(tolerances[1])} at ${speeds}; ${outcome}.`;
});
const fitted = pair.findIndex((ruled) => ruled.key === "ballBallContactTime");
if (fitted >= 0) {
    (out.ballObstacleContactTime as Entry).value = result.point[fitted] as number;
}
console.log(JSON.stringify(out, null, 4));
