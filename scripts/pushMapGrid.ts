/**
 * The rolls' push map's grid, its power sweeps, the bands and the record (P2b.2b.2c.3b design §3.2, §3.5, §5, A2 item
 * 2; plan `docs/superpowers/plans/2026-10-29-p2b2b2c3b-push-map.md`, Task 4 and decisions 2, 5, 7, 9 and 10). Each plan
 * of a type's grid is played at the grid's powers (pushMapRun.ts's playSample); a grid range is read from that sweep
 * (readAt); every graded plan is banded viable, edgy or unplayable by its neighbours (grade, bands); the default per
 * range, lawn and split is the least-effort admissible plan in the type's region (pickDefault); and the record's rows
 * are written per plan, range and lawn (envelopeRows). The shards' JSON lines are written by shardLine, read back on a
 * resume by doneIndices and merged by mergeLines. Stage 1's tallies (plan Task 6) are lawnSpreads, regionCounts,
 * classCounts, nonMonotoneCount, excludedSetUps, and cellReads with offGridBand (an off-grid plan's band, for the
 * anchor and the text books), with regionSpan and regionPhrase for the output. The super pass roll's (plan Task 8,
 * decision 12) are superPlans, strikeReading (29.2.5's reading of a strike) and superLeast. Not part of the engine.
 */
import { MAX_WINDOW, MIN_WINDOW } from "../src/engine/swing/buildContact";
import { textBook, type MapClass, type MapPlan, type MapSample, type MapType, type RollType } from "./pushMapRun";

const DEG = Math.PI / 180;

/** One dimension's values: `graded` are banded; `beyond` are run only as neighbours (A2 item 2). */
export interface Axis {
    readonly graded: readonly number[];
    readonly beyond: readonly number[];
}

/** A type's grid (decision 7, A4): the plan's axes (rad, m, 1, m, s, rad, 1), the ranges (m), lawns (s) and powers. */
export interface MapGrid {
    readonly lean: Axis;
    readonly feet: Axis;
    readonly drive: Axis;
    readonly handReach: Axis;
    readonly window: Axis;
    readonly split: Axis;
    readonly speedGain: Axis;
    readonly ranges: readonly number[];
    readonly lawns: readonly number[];
    readonly powers: readonly number[];
}

/** Numerical, not physical: the lean's coarse step (decision 7), 6°, a grid spacing chosen for the map's cost. */
const LEAN_STEP = 6 * DEG;

/** Numerical, not physical: the feet's coarse step (m; decision 7), a grid spacing chosen for the map's cost. */
const FEET_STEP = 0.05;

/**
 * Numerical, not physical: the graded steps either side of the text book's lean and feet (decision 7); one more is
 * beyond, run only as a neighbour (A2 item 2). 1, not decision 7's 2: Task 5's second cut under the time budget.
 */
const GRADED_STEPS = 1;

/**
 * Numerical, not physical: the follow-through's coarse grids (decision 7), drive (1) over its whole span −1…1,
 * handReach (m) from its bound 0 to 0.3 m, inside handArcRadius, and window (s), doubling from 10 ms to 40 ms inside
 * MIN_WINDOW…MAX_WINDOW (Task 5's first cut under the time budget drops 5 ms and 80 ms). None has a beyond.
 */
const DRIVES = [-1, -0.5, 0, 0.5, 1];
const HAND_REACHES = [0, 0.1, 0.2, 0.3];
const WINDOWS = [0.01, 0.02, 0.04];

/** The pass roll's split (decision 7; design §3.2's least set): 0°, 10°, 20° and 30° graded, 40° beyond. */
const PASS_SPLITS: Axis = { graded: [0, 10 * DEG, 20 * DEG, 30 * DEG], beyond: [40 * DEG] };

/**
 * The full roll's pendulum push gains (1; A4): its preset's 0.1, the variant's 0.5 that put it in its region in
 * P2b.2b.2c.2d's checks (I.1), and 0.25 and 1 either side. Numerical, not physical: a coarse, roughly doubling grid. 0.1
 * is the least, so the plans swept before A4 keep their indices.
 */
const FULL_SPEED_GAINS = [0.1, 0.25, 0.5, 1];

/**
 * The range grid (m; decision 7, design §3.2): from 2 m to a court's length, 32 m, even in log range. Numerical, not
 * physical: RANGE_COUNT, eight ranges, above the design's least six.
 */
const RANGE_LEAST = 2;
const RANGE_MOST = 32;
const RANGE_COUNT = 8;

/** The lawns (s; design §3.2): `reference/lawn.json`'s sourced span and its normal lawn. */
const LAWNS = [6, 10, 14];

/**
 * Numerical, not physical: the power samples of every sweep (decision 2), denser near p = 1 where the backswing meets
 * the body's limit and the intensity takes over. Ten, decision 7's least: Task 5's third cut under the time budget.
 */
const POWERS = [0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 1, 1.25, 1.5, 2];

/** The type's text book ± k·step for k = −GRADED_STEPS … GRADED_STEPS graded, and ±(GRADED_STEPS + 1) beyond. */
function around(centre: number, step: number): Axis {
    const graded: number[] = [];
    for (let k = -GRADED_STEPS; k <= GRADED_STEPS; k++) {
        graded.push(centre + k * step);
    }
    const far = GRADED_STEPS + 1;
    return { graded, beyond: [centre - far * step, centre + far * step] };
}

/**
 * `type`'s grid (decision 7): the lean and the feet around the type's text book (textBook), the follow-through's
 * grids, the split on the pass roll (0 elsewhere), the speedGain on the full roll (the preset's elsewhere; A4), the
 * ranges, the lawns and the power samples.
 */
export function gridFor(type: MapType): MapGrid {
    const book = textBook(type);
    const ranges: number[] = [];
    for (let i = 0; i < RANGE_COUNT; i++) {
        ranges.push(RANGE_LEAST * Math.pow(RANGE_MOST / RANGE_LEAST, i / (RANGE_COUNT - 1)));
    }
    return {
        lean: around(book.lean, LEAN_STEP),
        feet: around(book.feet, FEET_STEP),
        drive: { graded: DRIVES, beyond: [] },
        handReach: { graded: HAND_REACHES, beyond: [] },
        window: { graded: WINDOWS, beyond: [] },
        split: type === "pass-roll" ? PASS_SPLITS : { graded: [0], beyond: [] },
        speedGain:
            type === "full-roll" ? { graded: FULL_SPEED_GAINS, beyond: [] } : { graded: [book.speedGain], beyond: [] },
        ranges,
        lawns: LAWNS,
        powers: POWERS,
    };
}

/**
 * The plan's swept dimensions, in plansOf's order (outermost first). speedGain is outermost (A4), so a grid at one
 * speedGain orders its plans as before it was swept.
 */
const DIMENSIONS = ["speedGain", "split", "lean", "feet", "drive", "handReach", "window"] as const;

/** One of the plan's swept dimensions. */
export type Dimension = (typeof DIMENSIONS)[number];

/** An axis's values, graded and beyond, ascending: the order neighbours step along. */
function valuesOf(axis: Axis): readonly number[] {
    return [...axis.graded, ...axis.beyond].sort((a, b) => a - b);
}

/**
 * Every plan of the grid, graded and beyond, in a stable order: its index is the shard's key. A beyond value is only
 * ever a graded plan's neighbour one step along one dimension (A2 item 2), so a plan takes a beyond value in one
 * dimension at most; the hands are on time (onset 0, decision 7).
 */
export function plansOf(_type: MapType, grid: MapGrid): readonly MapPlan[] {
    const plans: MapPlan[] = [];
    const values = DIMENSIONS.map((d) => valuesOf(grid[d]));
    const beyond = DIMENSIONS.map((d) => new Set(grid[d].beyond));
    const chosen: number[] = [];
    const visit = (depth: number, outside: number): void => {
        if (depth === DIMENSIONS.length) {
            const [speedGain, split, lean, feet, drive, handReach, window] = chosen as [
                number,
                number,
                number,
                number,
                number,
                number,
                number,
            ];
            plans.push({ lean, feet, drive, handReach, window, onset: 0, split, speedGain });
            return;
        }
        for (const v of values[depth] as readonly number[]) {
            const out = (beyond[depth] as Set<number>).has(v) ? 1 : 0;
            if (outside + out > 1) {
                continue;
            }
            chosen[depth] = v;
            visit(depth + 1, outside + out);
        }
    };
    visit(0, 0);
    return plans;
}

/** Whether every swept value of `plan` is graded in `grid`. */
function isGraded(plan: MapPlan, grid: MapGrid): boolean {
    return DIMENSIONS.every((d) => grid[d].graded.includes(plan[d]));
}

/** A sample the engine threw on (an impact or free-motion error, not the plan's own failure): its power and message. */
export interface EngineErrorSample {
    readonly power: number;
    readonly engineError: string;
}

/** One entry of a shard's sweep: a played or classified sample, or the engine's error at that power. */
export type SweepSample = MapSample | EngineErrorSample;

/** Whether `s` is the engine's error rather than a sample. */
function isEngineError(s: SweepSample): s is EngineErrorSample {
    return "engineError" in s;
}

/** A plan's read at one range and lawn, from its power sweep (decision 2). */
export interface SweepRead {
    readonly klass: MapClass | null;
    /** The first failing sample's reason (playSample's), or the read's own; null when admissible. */
    readonly reason: string | null;
    readonly ratio: number;
    /** rad: the split at rest (decision 6), interpolated as the ratio. */
    readonly splitAtRest: number;
    readonly strokeEffort: number;
    readonly pushEffort: number;
    readonly coupleShare: number;
    readonly pushImpulse: number;
    readonly power: number;
    /** Whether the sweep's range rises with p over every played sample on this lawn. */
    readonly monotone: boolean;
}

/** Linear interpolation from `a` to `b` at `t`. */
function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

/** The reason readAt gives a range beyond every played sample with no classed sample above them (gate ruling A3). */
export const BEYOND_P_MAX = "range beyond p_max";

/** The reason readAt gives a range below every played sample (A2 item 2's unreachable). */
export const BELOW_LEAST = "range below the least power's";

/** A read with no figures: class `klass` for `reason`. */
function failedRead(klass: MapClass, reason: string | null, monotone: boolean): SweepRead {
    return {
        klass,
        reason,
        ratio: NaN,
        splitAtRest: NaN,
        strokeEffort: NaN,
        pushEffort: NaN,
        coupleShare: NaN,
        pushImpulse: NaN,
        power: NaN,
        monotone,
    };
}

/**
 * The sweep `samples` read at `range` (m) on `lawn` (s) (decision 2, with the gate's rulings A3). The played samples
 * (finite range), in power order, bracket the range between neighbours; the first bracket holding it is read, linearly
 * in p, with the ratio, the split at rest, the efforts, the couple's share and the push's impulse interpolated alike.
 * The read is admissible only if both ends are, and every unplayed sample between them: its class and reason are the
 * first failing one's in power order. Where no bracket holds the range:
 * - beyond every played range, it takes the class of the first classed sample above the highest-power played one (none
 *   played: the first classed sample), else it is superhuman, BEYOND_P_MAX (p = 2 is the body's limit at full
 *   intensity);
 * - below every played range, it is unreachable, BELOW_LEAST.
 * The read is null, no evidence, where an engine error decides it: inside the bracket read, first above the top when
 * reading beyond it, or below the lowest played sample when reading below. `monotone` is false where a played
 * sample's range falls below the one before it.
 */
export function readAt(samples: readonly SweepSample[], range: number, lawn: number): SweepRead | null {
    const sorted = [...samples].sort((a, b) => a.power - b.power);
    const rangeOf = (s: SweepSample): number => (isEngineError(s) ? NaN : (s.byLawn[lawn]?.range ?? NaN));
    const played: number[] = [];
    sorted.forEach((s, i) => {
        if (Number.isFinite(rangeOf(s))) {
            played.push(i);
        }
    });
    const reach = played.map((i) => rangeOf(sorted[i] as SweepSample));
    let monotone = true;
    for (let j = 1; j < reach.length; j++) {
        if ((reach[j] as number) < (reach[j - 1] as number)) {
            monotone = false;
        }
    }
    for (let j = 1; j < played.length; j++) {
        const i0 = played[j - 1] as number;
        const i1 = played[j] as number;
        const ra = reach[j - 1] as number;
        const rb = reach[j] as number;
        if (range < Math.min(ra, rb) || range > Math.max(ra, rb)) {
            continue;
        }
        let failing: MapSample | null = null;
        for (let i = i0; i <= i1; i++) {
            const s = sorted[i] as SweepSample;
            if (isEngineError(s)) {
                return null;
            }
            if (failing === null && s.klass !== null) {
                failing = s;
            }
        }
        const a = sorted[i0] as MapSample;
        const b = sorted[i1] as MapSample;
        const t = rb === ra ? 0 : (range - ra) / (rb - ra);
        const la = a.byLawn[lawn];
        const lb = b.byLawn[lawn];
        return {
            klass: failing?.klass ?? null,
            reason: failing === null ? null : failing.reason,
            ratio: lerp(la?.ratio ?? NaN, lb?.ratio ?? NaN, t),
            splitAtRest: lerp(la?.splitAtRest ?? NaN, lb?.splitAtRest ?? NaN, t),
            strokeEffort: lerp(a.strokeEffort, b.strokeEffort, t),
            pushEffort: lerp(a.pushEffort, b.pushEffort, t),
            coupleShare: lerp(a.coupleShare, b.coupleShare, t),
            pushImpulse: lerp(a.pushImpulse, b.pushImpulse, t),
            power: lerp(a.power, b.power, t),
            monotone,
        };
    }
    const most = reach.length === 0 ? -Infinity : Math.max(...reach);
    if (range > most) {
        const top = played.length === 0 ? -1 : (played[played.length - 1] as number);
        for (const s of sorted.slice(top + 1)) {
            if (isEngineError(s)) {
                return null;
            }
            if (s.klass !== null) {
                return failedRead(s.klass, s.reason, monotone);
            }
        }
        return failedRead("superhuman", BEYOND_P_MAX, monotone);
    }
    if (sorted.slice(0, played[0] ?? 0).some(isEngineError)) {
        return null;
    }
    return failedRead("unreachable", BELOW_LEAST, monotone);
}

/** A2 item 2's bands. */
export type Band = "viable" | "edgy" | "unplayable";

/** The key of `plan`'s read at `range` (m) and `lawn` (s): exact, as every plan's values come from its grid's axes. */
export function planKey(plan: MapPlan, range: number, lawn: number): string {
    return JSON.stringify([
        plan.lean,
        plan.feet,
        plan.drive,
        plan.handReach,
        plan.window,
        plan.onset,
        plan.split,
        plan.speedGain,
        range,
        lawn,
    ]);
}

/** A key's plan, range and lawn (planKey's inverse). */
function unkey(key: string): { readonly plan: MapPlan; readonly range: number; readonly lawn: number } {
    const [lean, feet, drive, handReach, window, onset, split, speedGain, range, lawn] = JSON.parse(key) as number[];
    const plan: MapPlan = {
        lean: lean as number,
        feet: feet as number,
        drive: drive as number,
        handReach: handReach as number,
        window: window as number,
        onset: onset as number,
        split: split as number,
        speedGain: speedGain as number,
    };
    return { plan, range: range as number, lawn: lawn as number };
}

/** Every plan's reads, keyed by planKey. */
export type Reads = ReadonlyMap<string, SweepRead>;

/** The on-point test's largest lean (rad; P2b.2b.2b.2b design §1): past it a plan is a mishit (A2 item 2). */
const LEAN_LIMIT = Math.PI / 4;

/**
 * The swept dimensions a neighbour steps along (A2 item 2, A4): the lean, the feet, drive, handReach and window, on
 * the pass roll the split and on the full roll the speedGain.
 */
function neighbourDimensions(type: MapType): readonly Dimension[] {
    return DIMENSIONS.filter(
        (d) => (d !== "split" || type === "pass-roll") && (d !== "speedGain" || type === "full-roll"),
    );
}

/** The inputs' own bounds (A2 item 2, A4), below and above; a neighbour past one does not exist. */
const BOUNDS: Readonly<Partial<Record<Dimension, readonly [number, number]>>> = {
    speedGain: [0, Infinity],
    drive: [-1, 1],
    handReach: [0, Infinity],
    window: [MIN_WINDOW, MAX_WINDOW],
};

/** A neighbour's step: its value, or none past an input's own bound, or none past the grid's edge. */
type Step = { readonly value: number } | { readonly bound: true } | { readonly edge: true };

/** The neighbour's value one `step` (±1) along `d`'s ascending `axis` from `value` (see grade's rules). */
function stepAlong(d: Dimension, axis: readonly number[], value: number, step: number): Step {
    const at = axis.indexOf(value);
    const n = at + step;
    if (n >= 0 && n < axis.length) {
        return { value: axis[n] as number };
    }
    if (d === "split" && value === 0 && axis.length > 1) {
        // The stroke is mirror-symmetric in the split (gate ruling A3): −10°'s read is +10°'s.
        return { value: axis[1] as number };
    }
    const bound = BOUNDS[d];
    if (bound !== undefined && value === bound[step < 0 ? 0 : 1]) {
        return { bound: true };
    }
    return { edge: true };
}

/** grade's result. */
export interface Grading {
    /** The graded plans' bands, keyed by planKey. */
    readonly banded: ReadonlyMap<string, Band>;
    /** Per graded plan, keyed by planKey: the dimensions where a neighbour was skipped at the grid's edge. */
    readonly edges: ReadonlyMap<string, readonly Dimension[]>;
    /** Graded plan reads left unbanded because a neighbour that exists has no read (an engine error, a lost shard). */
    readonly unbanded: number;
}

/**
 * The bands of `type`'s graded plans at each of the grid's ranges and lawns (A2 item 2, gate ruling A3), keyed by
 * planKey. A plan with a class is unplayable. An admissible plan is edgy if a neighbour (the grid's next value, graded
 * or beyond, one step along one swept dimension, at the same range and lawn) has a class, or leans past 45° (a mishit,
 * read or not); else viable. A neighbour admissible but outside the type's region counts as admissible (the edge is
 * the envelope's, not the region's). The edges' rules:
 * - past an input's own bound (drive ±1, handReach 0, MIN_WINDOW, MAX_WINDOW) the neighbour does not exist: skipped;
 * - the split is mirror-symmetric, so split 0°'s −10° neighbour is the +10° plan, read;
 * - past the grid's own last value where that is not an input's bound (handReach 0.3 m, the window's 5 ms and 80 ms,
 *   the full roll's speedGain 0.1 and 1) the neighbour is skipped, and the plan flagged in `edges` with that dimension.
 * A plan with no read is not banded; nor is one with a neighbour that exists but has no read, counted in `unbanded`.
 */
export function grade(type: MapType, grid: MapGrid, reads: Reads): Grading {
    const banded = new Map<string, Band>();
    const edges = new Map<string, readonly Dimension[]>();
    let unbanded = 0;
    const dims = neighbourDimensions(type);
    const values = new Map(dims.map((d) => [d, valuesOf(grid[d])] as const));
    for (const plan of plansOf(type, grid)) {
        if (!isGraded(plan, grid)) {
            continue;
        }
        const neighbours: MapPlan[] = [];
        const atEdge: Dimension[] = [];
        for (const d of dims) {
            for (const step of [-1, 1]) {
                const next = stepAlong(d, values.get(d) as readonly number[], plan[d], step);
                if ("value" in next) {
                    neighbours.push({ ...plan, [d]: next.value });
                } else if ("edge" in next && !atEdge.includes(d)) {
                    atEdge.push(d);
                }
            }
        }
        for (const range of grid.ranges) {
            for (const lawn of grid.lawns) {
                const key = planKey(plan, range, lawn);
                edges.set(key, atEdge);
                const read = reads.get(key);
                if (read === undefined) {
                    continue;
                }
                if (read.klass !== null) {
                    banded.set(key, "unplayable");
                    continue;
                }
                let failing = false;
                let unknown = false;
                for (const next of neighbours) {
                    if (next.lean > LEAN_LIMIT) {
                        failing = true;
                        continue;
                    }
                    const other = reads.get(planKey(next, range, lawn));
                    if (other === undefined) {
                        unknown = true;
                    } else if (other.klass !== null) {
                        failing = true;
                    }
                }
                if (unknown) {
                    unbanded++;
                    continue;
                }
                banded.set(key, failing ? "edgy" : "viable");
            }
        }
    }
    return { banded, edges, unbanded };
}

/** The bands of `type`'s graded plans (grade's `banded`). */
export function bands(type: MapType, grid: MapGrid, reads: Reads): ReadonlyMap<string, Band> {
    return grade(type, grid, reads).banded;
}

/** A type's region: its ratio band (design §2, the CA's: "P2b.2 decisions (2026-10-04)"); edges included. */
interface Region {
    readonly least: number;
    readonly most: number;
    /** Whether `most` itself is outside (the pass roll's "below 1"). */
    readonly openAbove: boolean;
}

/** The regions (design §2): the half roll 1.4–2.5, the full roll 1.0–1.2, the pass roll below 1. */
const REGIONS: Readonly<Record<RollType, Region>> = {
    "half-roll": { least: 1.4, most: 2.5, openAbove: false },
    "full-roll": { least: 1.0, most: 1.2, openAbove: false },
    "pass-roll": { least: 0, most: 1, openAbove: true },
};

/** Whether `ratio` lies in `type`'s region (design §2). */
export function inRegion(type: RollType, ratio: number): boolean {
    const { least, most, openAbove } = REGIONS[type];
    return ratio >= least && (openAbove ? ratio < most : ratio <= most);
}

/** `type`'s region as text (design §2): "1.4–2.5", "1.0–1.2", or "below 1" for the pass roll's open band. */
export function regionSpan(type: RollType): string {
    const { least, most, openAbove } = REGIONS[type];
    return openAbove && least === 0 ? `below ${most}` : `${least.toFixed(1)}–${most.toFixed(1)}`;
}

/** The phrase "the ratio …" takes for `type`'s region: "in 1.4–2.5", "in 1.0–1.2", "below 1". */
export function regionPhrase(type: RollType): string {
    const { least, openAbove } = REGIONS[type];
    return openAbove && least === 0 ? regionSpan(type) : `in ${regionSpan(type)}`;
}

/**
 * The bands on one continuum, in ascending ratio (design A7 item 2): the rolls' (design §2), the drive's 3.0–4.0 and
 * the AC stop's 4.1–6.2 (the CA's, in `reference/swing.json`'s ratioTargets notes); edges included, the pass roll's
 * open at 1.
 */
const LABELS: readonly { readonly name: string; readonly most: number; readonly openAbove: boolean }[] = [
    { name: "pass roll", most: 1, openAbove: true },
    { name: "full roll", most: 1.2, openAbove: false },
    { name: "half roll", most: 2.5, openAbove: false },
    { name: "drive", most: 4, openAbove: false },
    { name: "AC stop", most: 6.2, openAbove: false },
];

/** Each band's least ratio (inclusive), in LABELS' order: the pass roll's runs from 0. */
const LABEL_LEAST = [0, 1, 1.4, 3, 4.1];

/**
 * The label of `ratio` on the continuum (plan B-d3; design A7 item 2): its band's name, else "between <band> and
 * <band>" for a gap between two, else "beyond AC stop" above the last; "" where there is no ratio (the single-ball
 * stroke's).
 */
export function labelOf(ratio: number): string {
    if (!Number.isFinite(ratio)) {
        return "";
    }
    for (let i = 0; i < LABELS.length; i++) {
        const band = LABELS[i] as (typeof LABELS)[number];
        const least = LABEL_LEAST[i] as number;
        if (ratio < least) {
            return `between ${(LABELS[i - 1] as (typeof LABELS)[number]).name} and ${band.name}`;
        }
        if (band.openAbove ? ratio < band.most : ratio <= band.most) {
            return band.name;
        }
    }
    return `beyond ${(LABELS[LABELS.length - 1] as (typeof LABELS)[number]).name}`;
}

/** Decision 5's effort: the mean of the stroke's and the push's percentages. */
function effortOf(read: SweepRead): number {
    return (read.strokeEffort + read.pushEffort) / 2;
}

/** The follow-through grid's spans (m, s, 1), the tie-break's scales (plan Task 4, A4). */
const HAND_REACH_SPAN = Math.max(...HAND_REACHES);
const WINDOW_SPAN = Math.max(...WINDOWS);
const SPEED_GAIN_SPAN = Math.max(...FULL_SPEED_GAINS);

/**
 * The tie-break's distance from the half roll's anchor in follow-through (design §5; plan Task 4, A4): Euclidean over
 * (drive, handReach / HAND_REACH_SPAN, window / WINDOW_SPAN, speedGain / SPEED_GAIN_SPAN).
 */
function anchorDistance(plan: MapPlan, anchor: MapPlan): number {
    return Math.hypot(
        plan.drive - anchor.drive,
        (plan.handReach - anchor.handReach) / HAND_REACH_SPAN,
        (plan.window - anchor.window) / WINDOW_SPAN,
        (plan.speedGain - anchor.speedGain) / SPEED_GAIN_SPAN,
    );
}

/** The half roll's anchor plan (design §3.3), read once. */
let anchorPlan: MapPlan | null = null;

function anchor(): MapPlan {
    anchorPlan ??= textBook("half-roll");
    return anchorPlan;
}

/**
 * `type`'s default at `at` (design §5; decisions 2 and 5): among the banded plans at that range, lawn and split that
 * are admissible (viable or edgy) and whose ratio lies in the type's region, the least mean of the two effort
 * percentages, ties to the plan nearer the half roll's anchor in follow-through. A plan whose effort is NaN is never
 * picked. `viable` is the least-effort viable plan by the same rule: the default itself where it is viable, the
 * runner-up recorded beside an edgy default (A2 item 2). Either is null where none qualifies (the region empty).
 */
export function pickDefault(
    type: RollType,
    reads: Reads,
    banded: ReadonlyMap<string, Band>,
    at: { readonly range: number; readonly lawn: number; readonly split: number },
): { readonly plan: MapPlan | null; readonly viable: MapPlan | null } {
    interface Candidate {
        readonly plan: MapPlan;
        readonly effort: number;
        readonly distance: number;
        readonly band: Band;
    }
    const candidates: Candidate[] = [];
    for (const [key, band] of banded) {
        if (band === "unplayable") {
            continue;
        }
        const { plan, range, lawn } = unkey(key);
        if (range !== at.range || lawn !== at.lawn || plan.split !== at.split) {
            continue;
        }
        const read = reads.get(key);
        if (read === undefined || read.klass !== null || !inRegion(type, read.ratio)) {
            continue;
        }
        const effort = effortOf(read);
        if (!Number.isFinite(effort)) {
            continue;
        }
        candidates.push({ plan, effort, distance: anchorDistance(plan, anchor()), band });
    }
    candidates.sort((a, b) => a.effort - b.effort || a.distance - b.distance);
    return {
        plan: candidates[0]?.plan ?? null,
        viable: candidates.find((c) => c.band === "viable")?.plan ?? null,
    };
}

/** A figure for the record: six significant figures, empty where not finite. */
function figure(x: number): string {
    return Number.isFinite(x) ? String(Number(x.toPrecision(6))) : "";
}

/** A CSV field, quoted per RFC 4180 where it holds a comma, a double quote or a line break. */
function field(text: string): string {
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** The record's columns (decision 10, A4), in SI: rad, m, 1, m, s, s, rad, 1; m, s; %, %, 1, N·s, rad. */
const COLUMNS = [
    "type",
    "lean",
    "feet",
    "drive",
    "handReach",
    "window",
    "onset",
    "split",
    "speedGain",
    "range",
    "lawn",
    "band",
    "edge",
    "class",
    "reason",
    "ratio",
    "strokeEffort",
    "pushEffort",
    "coupleShare",
    "pushImpulse",
    "splitAtRest",
    "power",
    "monotone",
];

/**
 * The record's CSV lines (decision 10), header first: one per plan of the grid (graded and beyond), range and lawn
 * with a read, the plan's inputs exact, its band (empty for a beyond plan, which is not graded, or a plan left
 * unbanded), its grid edges (grade's `edges`, `;`-joined), its class and reason (empty when admissible) and its
 * figures to six significant figures (empty where NaN). Fields are quoted per RFC 4180. The provenance (command,
 * commit and SHA-256) goes above it in `#` lines, written with the file.
 */
export function envelopeRows(type: MapType, grid: MapGrid, reads: Reads, banded: ReadonlyMap<string, Band>): string[] {
    const { edges } = grade(type, grid, reads);
    const rows = [COLUMNS.join(",")];
    for (const plan of plansOf(type, grid)) {
        for (const range of grid.ranges) {
            for (const lawn of grid.lawns) {
                const key = planKey(plan, range, lawn);
                const read = reads.get(key);
                if (read === undefined) {
                    continue;
                }
                const cells = [
                    type,
                    String(plan.lean),
                    String(plan.feet),
                    String(plan.drive),
                    String(plan.handReach),
                    String(plan.window),
                    String(plan.onset),
                    String(plan.split),
                    String(plan.speedGain),
                    String(range),
                    String(lawn),
                    banded.get(key) ?? "",
                    (edges.get(key) ?? []).join(";"),
                    read.klass ?? "",
                    read.reason ?? "",
                    figure(read.ratio),
                    figure(read.strokeEffort),
                    figure(read.pushEffort),
                    figure(read.coupleShare),
                    figure(read.pushImpulse),
                    figure(read.splitAtRest),
                    figure(read.power),
                    read.monotone ? "1" : "0",
                ];
                rows.push(cells.map(field).join(","));
            }
        }
    }
    return rows;
}

/** JSON's stand-in for a number JSON cannot hold (NaN, ±Infinity), restored by reviveNumbers. */
function keepNumbers(_key: string, value: unknown): unknown {
    return typeof value === "number" && !Number.isFinite(value) ? String(value) : value;
}

function reviveNumbers(_key: string, value: unknown): unknown {
    return value === "NaN" || value === "Infinity" || value === "-Infinity" ? Number(value) : value;
}

/**
 * One shard's JSON line for the plan at `index` (decision 9): its sweep, each sample played or the engine's error at
 * that power; or, where the engine threw outside the samples (setting the plan up), the error's message and no
 * sweep. NaN and ±Infinity are kept as strings and restored by mergeLines.
 */
export function shardLine(
    index: number,
    plan: MapPlan,
    outcome: { readonly samples: readonly SweepSample[] } | { readonly engineError: string },
): string {
    return JSON.stringify({ index, plan, ...outcome }, keepNumbers);
}

/** A shard line parsed, or null where it does not parse (a shard killed mid-write). */
interface ShardEntry {
    readonly index: number;
    readonly plan: MapPlan;
    readonly samples?: readonly SweepSample[];
    readonly engineError?: string;
}

function parseLine(line: string): ShardEntry | null {
    try {
        const entry = JSON.parse(line, reviveNumbers) as ShardEntry;
        return typeof entry === "object" && entry !== null && Number.isInteger(entry.index) ? entry : null;
    } catch {
        return null;
    }
}

/**
 * The plan indices a shard's file `text` already holds whole (decision 9's resume): one per line that parses. A torn
 * line, from a shard killed mid-write, is not done, so its plan is played again.
 */
export function doneIndices(text: string): ReadonlySet<number> {
    const done = new Set<number>();
    for (const line of text.split("\n")) {
        const entry = parseLine(line);
        if (entry !== null) {
            done.add(entry.index);
        }
    }
    return done;
}

/** A merge's tally (decision 9). */
export interface Merged {
    /** Each plan's sweep, by index. */
    readonly samples: ReadonlyMap<number, readonly SweepSample[]>;
    /** The plan indices no shard wrote: a dead shard, never an empty region. */
    readonly missing: readonly number[];
    /** The plans the engine threw on outside their samples, with its message: reported apart, never a class. */
    readonly engineErrors: ReadonlyMap<number, string>;
    /** Lines repeating an index already read (a re-run shard); the first is kept. */
    readonly duplicates: number;
    /** Lines that do not parse (a shard killed mid-write). */
    readonly torn: number;
}

/**
 * The shards' `lines` merged against the grid's `plans` (decision 9). Each line's plan must be the grid's at its index,
 * else the shards ran another grid and this throws.
 */
export function mergeLines(plans: readonly MapPlan[], lines: readonly string[]): Merged {
    const samples = new Map<number, readonly SweepSample[]>();
    const engineErrors = new Map<number, string>();
    let duplicates = 0;
    let torn = 0;
    for (const line of lines) {
        if (line.trim() === "") {
            continue;
        }
        const entry = parseLine(line);
        if (entry === null) {
            torn++;
            continue;
        }
        const expected = plans[entry.index];
        if (expected === undefined || JSON.stringify(expected) !== JSON.stringify(entry.plan)) {
            throw new Error(`mergeLines: the line for plan ${entry.index} is not this grid's plan`);
        }
        if (samples.has(entry.index) || engineErrors.has(entry.index)) {
            duplicates++;
            continue;
        }
        if (entry.engineError !== undefined) {
            engineErrors.set(entry.index, entry.engineError);
        } else {
            samples.set(entry.index, entry.samples ?? []);
        }
    }
    const missing: number[] = [];
    for (let i = 0; i < plans.length; i++) {
        if (!samples.has(i) && !engineErrors.has(i)) {
            missing.push(i);
        }
    }
    return { samples, missing, engineErrors, duplicates, torn };
}

/** The engine's errors inside the merged sweeps: per message, the count of samples. */
export function sampleErrors(samples: ReadonlyMap<number, readonly SweepSample[]>): ReadonlyMap<string, number> {
    const counts = new Map<string, number>();
    for (const sweep of samples.values()) {
        for (const s of sweep) {
            if (isEngineError(s)) {
                counts.set(s.engineError, (counts.get(s.engineError) ?? 0) + 1);
            }
        }
    }
    return counts;
}

/**
 * The reads of every swept plan of `plans` at the grid's ranges and lawns (readAt), keyed by planKey; the count of
 * plans whose sweep is not monotone on some lawn (decision 2); and the count of reads left out because an engine error
 * decides them (readAt's null).
 */
export function readsOf(
    grid: MapGrid,
    plans: readonly MapPlan[],
    samples: ReadonlyMap<number, readonly SweepSample[]>,
): { readonly reads: Reads; readonly nonMonotone: number; readonly noRead: number } {
    const reads = new Map<string, SweepRead>();
    let nonMonotone = 0;
    let noRead = 0;
    for (const [index, sweep] of samples) {
        const plan = plans[index] as MapPlan;
        let monotone = true;
        for (const lawn of grid.lawns) {
            for (const range of grid.ranges) {
                const read = readAt(sweep, range, lawn);
                if (read === null) {
                    noRead++;
                    continue;
                }
                monotone &&= read.monotone;
                reads.set(planKey(plan, range, lawn), read);
            }
        }
        if (!monotone) {
            nonMonotone++;
        }
    }
    return { reads, nonMonotone, noRead };
}

/** `reads` as JSON (NaN kept as a string), for `<dir>/<type>.reads.json`. */
export function readsJson(reads: Reads): string {
    return JSON.stringify(Object.fromEntries(reads), keepNumbers);
}

/** readsJson's text read back (NaN and ±Infinity restored). */
export function parseReads(text: string): Reads {
    return new Map(Object.entries(JSON.parse(text, reviveNumbers) as Record<string, SweepRead>));
}

/** A value's `q` quantile (0–1) by the nearest rank; NaN for no values. */
export function quantile(values: readonly number[], q: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))] ?? NaN;
}

/** §3.5's classes in decision 5's order, `unpractised` after turf (P2b.2b.2c.3b.1 design §4 item 3, §6). */
export const MAP_CLASSES: readonly MapClass[] = [
    "unreachable",
    "superhuman",
    "mishit",
    "turf",
    "unpractised",
    "unlawful",
];

/**
 * The lawn's effect (design §3.2's guess; plan Task 6): per plan and grid range, the ratio's spread across the grid's
 * lawns, (max − min) / mean, where the ratio is finite on every lawn; with `admissibleOnly`, only where the read is
 * admissible on every lawn too. One entry per such plan and range.
 */
export function lawnSpreads(
    grid: MapGrid,
    plans: readonly MapPlan[],
    reads: Reads,
    admissibleOnly: boolean,
): { readonly range: number; readonly spread: number }[] {
    const spreads: { range: number; spread: number }[] = [];
    for (const plan of plans) {
        for (const range of grid.ranges) {
            const lawnReads = grid.lawns.map((lawn) => reads.get(planKey(plan, range, lawn)));
            const ratios: number[] = [];
            for (const r of lawnReads) {
                if (r !== undefined && Number.isFinite(r.ratio) && (!admissibleOnly || r.klass === null)) {
                    ratios.push(r.ratio);
                }
            }
            if (ratios.length !== grid.lawns.length || ratios.length === 0) {
                continue;
            }
            const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
            spreads.push({ range, spread: (Math.max(...ratios) - Math.min(...ratios)) / mean });
        }
    }
    return spreads;
}

/** A spread list's summary: its count, median, 95th percentile (nearest rank), maximum, and the count above `limit`. */
export function spreadSummary(
    spreads: readonly number[],
    limit: number,
): {
    readonly count: number;
    readonly median: number;
    readonly p95: number;
    readonly max: number;
    readonly above: number;
} {
    return {
        count: spreads.length,
        median: quantile(spreads, 0.5),
        p95: quantile(spreads, 0.95),
        max: spreads.length === 0 ? NaN : Math.max(...spreads),
        above: spreads.filter((s) => s > limit).length,
    };
}

/** One range and lawn's count of the type's region's admissible graded plans, by band (A1; plan Task 6). */
export interface RegionCount {
    readonly range: number;
    readonly lawn: number;
    readonly viable: number;
    readonly edgy: number;
    /** Admissible in the region but left unbanded (grade's: a neighbour unread). */
    readonly unbanded: number;
}

/**
 * Per grid range and lawn, how many graded plans are admissible with their ratio in `type`'s region (inRegion), by
 * band (A1: how many plans share each outcome).
 */
export function regionCounts(
    type: RollType,
    grid: MapGrid,
    reads: Reads,
    banded: ReadonlyMap<string, Band>,
): RegionCount[] {
    const graded = plansOf(type, grid).filter((p) => isGraded(p, grid));
    const counts: RegionCount[] = [];
    for (const range of grid.ranges) {
        for (const lawn of grid.lawns) {
            let viable = 0;
            let edgy = 0;
            let unbanded = 0;
            for (const plan of graded) {
                const key = planKey(plan, range, lawn);
                const read = reads.get(key);
                if (read === undefined || read.klass !== null || !inRegion(type, read.ratio)) {
                    continue;
                }
                const band = banded.get(key);
                if (band === "viable") {
                    viable++;
                } else if (band === "edgy") {
                    edgy++;
                } else {
                    unbanded++;
                }
            }
            counts.push({ range, lawn, viable, edgy, unbanded });
        }
    }
    return counts;
}

/** One range and lawn's reads by class (plan Task 6): `admissible` has none; `unread` has no read. */
export interface ClassCount {
    readonly range: number;
    readonly lawn: number;
    readonly counts: Readonly<Record<MapClass | "admissible" | "unread", number>>;
}

/** Per grid range and lawn, every plan's read (graded and beyond) counted by its class (§3.5), admissible or unread. */
export function classCounts(grid: MapGrid, plans: readonly MapPlan[], reads: Reads): ClassCount[] {
    const out: ClassCount[] = [];
    for (const range of grid.ranges) {
        for (const lawn of grid.lawns) {
            const counts: Record<MapClass | "admissible" | "unread", number> = {
                unreachable: 0,
                superhuman: 0,
                mishit: 0,
                turf: 0,
                unpractised: 0,
                unlawful: 0,
                admissible: 0,
                unread: 0,
            };
            for (const plan of plans) {
                const read = reads.get(planKey(plan, range, lawn));
                counts[read === undefined ? "unread" : (read.klass ?? "admissible")]++;
            }
            out.push({ range, lawn, counts });
        }
    }
    return out;
}

/** The plans whose sweep is not monotone in p (decision 2), from their reads at the grid's ranges and lawns. */
export function nonMonotoneCount(grid: MapGrid, plans: readonly MapPlan[], reads: Reads): number {
    return plans.filter((plan) =>
        grid.ranges.some((range) =>
            grid.lawns.some((lawn) => reads.get(planKey(plan, range, lawn))?.monotone === false),
        ),
    ).length;
}

/** A set-up (A1): the lean (rad), the feet (m) and the split (rad). */
export interface SetUp {
    readonly lean: number;
    readonly feet: number;
    readonly split: number;
}

/**
 * A set-up with no admissible read: its class where every read is present and shares one; "mixed" where every read is
 * present but the classes differ; "incomplete" where any read is missing (none read included). Its read and unread
 * counts.
 */
export interface Excluded {
    readonly setUp: SetUp;
    readonly klass: MapClass | "mixed" | "incomplete";
    readonly reads: number;
    readonly unread: number;
}

/**
 * The set-ups with no admissible read at any range, follow-through or lawn (design §3.5), in plansOf's order. Those
 * whose every read is present and has the one class are outside the envelope outright (§3.5: "fails for the same
 * reason at every range"); with every read present but the classes differing, "mixed"; with any read missing, so that
 * an admissible read cannot be ruled out, "incomplete".
 */
export function excludedSetUps(grid: MapGrid, plans: readonly MapPlan[], reads: Reads): Excluded[] {
    interface Tally {
        readonly setUp: SetUp;
        readonly classes: Set<MapClass>;
        reads: number;
        unread: number;
        admissible: boolean;
    }
    const bySetUp = new Map<string, Tally>();
    for (const plan of plans) {
        const key = JSON.stringify([plan.lean, plan.feet, plan.split]);
        let entry = bySetUp.get(key);
        if (entry === undefined) {
            entry = {
                setUp: { lean: plan.lean, feet: plan.feet, split: plan.split },
                classes: new Set(),
                reads: 0,
                unread: 0,
                admissible: false,
            };
            bySetUp.set(key, entry);
        }
        for (const range of grid.ranges) {
            for (const lawn of grid.lawns) {
                const read = reads.get(planKey(plan, range, lawn));
                if (read === undefined) {
                    entry.unread++;
                    continue;
                }
                entry.reads++;
                if (read.klass === null) {
                    entry.admissible = true;
                } else {
                    entry.classes.add(read.klass);
                }
            }
        }
    }
    const out: Excluded[] = [];
    for (const { setUp, classes, reads: count, unread, admissible } of bySetUp.values()) {
        if (admissible) {
            continue;
        }
        const [only] = classes;
        let klass: Excluded["klass"] = "mixed";
        if (unread > 0) {
            klass = "incomplete";
        } else if (classes.size === 1 && only !== undefined) {
            klass = only;
        }
        out.push({ setUp, klass, reads: count, unread });
    }
    return out;
}

/** A band's severity, for the worst of several. */
const SEVERITY: Readonly<Record<Band, number>> = { viable: 0, edgy: 1, unplayable: 2 };

/**
 * The grid plans at the corners of the coarse cell `plan` lies in (A2 item 2: a point off the grid takes its cell's
 * band): per swept dimension, `plan`'s value where it is on the axis (graded or beyond), else the two axis values
 * either side of it. Null where a value lies outside its axis, or where the hands' onset is not 0, the grid's only
 * onset (decision 7).
 */
export function cellCorners(plan: MapPlan, grid: MapGrid): MapPlan[] | null {
    if (plan.onset !== 0) {
        return null;
    }
    let corners: MapPlan[] = [plan];
    for (const d of DIMENSIONS) {
        const axis = valuesOf(grid[d]);
        const value = plan[d];
        if (axis.includes(value)) {
            continue;
        }
        const above = axis.findIndex((v) => v > value);
        if (above <= 0) {
            return null;
        }
        const pair = [axis[above - 1] as number, axis[above] as number];
        corners = corners.flatMap((c) => pair.map((v) => ({ ...c, [d]: v })));
    }
    return corners;
}

/** A corner of cellReads's cell: its plan, its read and its band at the range and lawn (undefined where none). */
export interface Corner {
    readonly plan: MapPlan;
    readonly read: SweepRead | undefined;
    readonly band: Band | undefined;
}

/**
 * The corners of the coarse cell of `plan`, which may lie off the grid, at `range` (m) and `lawn` (s), which may lie
 * off the grid too (plan Task 6's anchor): every grid plan's sweep in `samples` is read at that range and lawn
 * (readsOf) and graded there (grade), and each corner (cellCorners) is returned with its read and band. Null where
 * cellCorners finds no cell.
 */
export function cellReads(
    type: MapType,
    grid: MapGrid,
    samples: ReadonlyMap<number, readonly SweepSample[]>,
    plan: MapPlan,
    at: { readonly range: number; readonly lawn: number },
): readonly Corner[] | null {
    const cell = cellCorners(plan, grid);
    if (cell === null) {
        return null;
    }
    const local: MapGrid = { ...grid, ranges: [at.range], lawns: [at.lawn] };
    const { reads } = readsOf(local, plansOf(type, local), samples);
    const { banded } = grade(type, local, reads);
    return cell.map((c) => {
        const key = planKey(c, at.range, at.lawn);
        return { plan: c, read: reads.get(key), band: banded.get(key) };
    });
}

/**
 * The band of a plan off the grid (plan Task 6's anchor; A2 item 2): unplayable where its own play or read has a class
 * (`classed`); else the worst band of its cell's `corners` (cellReads), an unplayable corner counting as a failing
 * neighbour, so edgy. Null where it is admissible and its cell is missing (null) or a corner is unbanded.
 */
export function offGridBand(classed: boolean, corners: readonly Corner[] | null): Band | null {
    if (classed) {
        return "unplayable";
    }
    if (corners === null) {
        return null;
    }
    let band: Band = "viable";
    for (const c of corners) {
        if (c.band === undefined) {
            return null;
        }
        const capped = c.band === "unplayable" ? "edgy" : c.band;
        if (SEVERITY[capped] > SEVERITY[band]) {
            band = capped;
        }
    }
    return band;
}

/**
 * The super pass roll's sweep (plan decision 12; design §3.4): the hands' onset `timing.hands` (s; positive is late)
 * and the pulse's `window` (s), with `drive` 1 and `handReach` 0.3 m, the pushed-through, longest push of the grid.
 * Numerical, not physical: the decision's grid, from on time to 40 ms late and from 2 ms to 20 ms sharp.
 */
export const SUPER_ONSETS: readonly number[] = [0, 0.005, 0.01, 0.02, 0.04];
/** The pulse's windows (s), decision 12's: all inside MIN_WINDOW…MAX_WINDOW, sharper than the map's 10 ms least. */
export const SUPER_WINDOWS: readonly number[] = [0.002, 0.005, 0.01, 0.02];
/** `drive` (1): pushed through, the input's own bound (decision 12). */
const SUPER_DRIVE = 1;
/** `handReach` (m): the map grid's longest push, 0.3 m (decision 12). */
const SUPER_HAND_REACH = 0.3;

/**
 * Numerical, not physical: "multiples further" (design §3.4; plan Task 8 Step 2) read as the striker's ball going at
 * least twice as far as the croqueted ball, a ratio below 0.5.
 */
export const MULTIPLES_RATIO = 0.5;

/**
 * The super pass roll's plans (plan decision 12): `book`'s set-up (the pass roll's text book's lean and feet), drive 1,
 * handReach 0.3 m, at each of `splits` (rad) × SUPER_ONSETS × SUPER_WINDOWS, in that order (split outermost): the
 * index is the super shard's key.
 */
export function superPlans(book: MapPlan, splits: readonly number[]): readonly MapPlan[] {
    const plans: MapPlan[] = [];
    for (const split of splits) {
        for (const onset of SUPER_ONSETS) {
            for (const window of SUPER_WINDOWS) {
                plans.push({
                    lean: book.lean,
                    feet: book.feet,
                    drive: SUPER_DRIVE,
                    handReach: SUPER_HAND_REACH,
                    window,
                    onset,
                    split,
                    speedGain: book.speedGain,
                });
            }
        }
    }
    return plans;
}

/**
 * One mallet contact after the stroke's first, as 29.2.5 reads it (`reference/laws.json`; faults.ts's groupContacts):
 * the separation before it (m, the earlier contact's clearance, 0 when none or below 0), and its kind: `joined`, within
 * MERGE_SEPARATION of the contact before it, so one continuing contact with the strike; `before-parting`, apart but
 * begun before the balls parted, so within the strike; `recontact`, a separate contact after the parting, judged by
 * its effect (`fault`).
 */
export interface LaterContact {
    readonly separation: number;
    readonly kind: "joined" | "before-parting" | "recontact";
    readonly fault: boolean;
}

/** 29.2.5's reading of a sample's strike: when the balls parted (s; null if never) and the later contacts in order. */
export interface StrikeReading {
    readonly parted: number | null;
    readonly later: readonly LaterContact[];
}

/** What strikeReading reads of the judge's strike (faults.ts's StrikeTaps), narrowed for synthetic tests. */
export interface StrikeShape {
    readonly parted: number | null;
    readonly taps: readonly { readonly clearanceAfter?: number }[];
    readonly recontacts: readonly { readonly separation: number; readonly fault: boolean }[];
}

/**
 * 29.2.5's reading of the judge's `strike` (plan Task 8 Step 2): each tap after the first, its separation from the tap
 * before it, joined where below `mergeSeparation` and otherwise begun before the parting (the judge's grouping); then
 * each re-contact, with its separation and its verdict. Null where the judge has no strike (an unplayed sample). Where
 * the balls never parted the judge groups nothing (every contact after the first faults), so `later` is empty.
 */
export function strikeReading(strike: StrikeShape | null, mergeSeparation: number): StrikeReading | null {
    if (strike === null) {
        return null;
    }
    const later: LaterContact[] = [];
    for (let i = 1; i < strike.taps.length; i++) {
        const separation = Math.max(0, (strike.taps[i - 1] as StrikeShape["taps"][number]).clearanceAfter ?? 0);
        later.push({ separation, kind: separation < mergeSeparation ? "joined" : "before-parting", fault: false });
    }
    for (const r of strike.recontacts) {
        later.push({ separation: r.separation, kind: "recontact", fault: r.fault });
    }
    return { parted: strike.parted, later };
}

/** A super sweep's sample with its plan, for superLeast. */
export interface PlannedSample {
    readonly plan: MapPlan;
    readonly sample: SweepSample;
}

/** superLeast's pick: the plan, its sample and the sample's ratio on the lawn. */
export interface LeastRatio {
    readonly plan: MapPlan;
    readonly sample: MapSample;
    readonly ratio: number;
}

/**
 * The least ratio on `lawn` (s) among `samples` (plan Task 8 Step 2), of any class, and the least among the admissible
 * ones; each null where no sample has a finite ratio there. An engine error's sample has none. Ties keep the first.
 */
export function superLeast(
    samples: readonly PlannedSample[],
    lawn: number,
): { readonly least: LeastRatio | null; readonly admissible: LeastRatio | null } {
    let least: LeastRatio | null = null;
    let admissible: LeastRatio | null = null;
    for (const { plan, sample } of samples) {
        if (isEngineError(sample)) {
            continue;
        }
        const ratio = sample.byLawn[lawn]?.ratio ?? NaN;
        if (!Number.isFinite(ratio)) {
            continue;
        }
        if (least === null || ratio < least.ratio) {
            least = { plan, sample, ratio };
        }
        if (sample.klass === null && (admissible === null || ratio < admissible.ratio)) {
            admissible = { plan, sample, ratio };
        }
    }
    return { least, admissible };
}
