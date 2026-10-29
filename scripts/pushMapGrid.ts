/**
 * The rolls' push map's grid, its power sweeps, the bands and the record (P2b.2b.2c.3b design §3.2, §3.5, §5, A2 item
 * 2; plan `docs/superpowers/plans/2026-10-29-p2b2b2c3b-push-map.md`, Task 4 and decisions 2, 5, 7, 9 and 10). Each plan
 * of a type's grid is played at the grid's powers (pushMapRun.ts's playSample); a grid range is read from that sweep
 * (readAt); every graded plan is banded viable, edgy or unplayable by its neighbours (grade, bands); the default per
 * range, lawn and split is the least-effort admissible plan in the type's region (pickDefault); and the record's rows
 * are written per plan, range and lawn (envelopeRows). The shards' JSON lines are written by shardLine, read back on a
 * resume by doneIndices and merged by mergeLines. Not part of the engine.
 */
import { MAX_WINDOW, MIN_WINDOW } from "../src/engine/swing/buildContact";
import { textBook, type MapClass, type MapPlan, type MapSample, type RollType } from "./pushMapRun";

const DEG = Math.PI / 180;

/** One dimension's values: `graded` are banded; `beyond` are run only as neighbours (A2 item 2). */
export interface Axis {
    readonly graded: readonly number[];
    readonly beyond: readonly number[];
}

/** A type's grid (decision 7): the plan's axes (rad, m, 1, m, s, rad), the ranges (m), lawns (s) and powers. */
export interface MapGrid {
    readonly lean: Axis;
    readonly feet: Axis;
    readonly drive: Axis;
    readonly handReach: Axis;
    readonly window: Axis;
    readonly split: Axis;
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
 * beyond, run only as a neighbour (A2 item 2).
 */
const GRADED_STEPS = 2;

/**
 * Numerical, not physical: the follow-through's coarse grids (decision 7), drive (1) over its whole span −1…1,
 * handReach (m) from its bound 0 to 0.3 m, inside handArcRadius, and window (s), doubling from 5 ms to 80 ms inside
 * MIN_WINDOW…MAX_WINDOW. None has a beyond.
 */
const DRIVES = [-1, -0.5, 0, 0.5, 1];
const HAND_REACHES = [0, 0.1, 0.2, 0.3];
const WINDOWS = [0.005, 0.01, 0.02, 0.04, 0.08];

/** The pass roll's split (decision 7; design §3.2's least set): 0°, 10°, 20° and 30° graded, 40° beyond. */
const PASS_SPLITS: Axis = { graded: [0, 10 * DEG, 20 * DEG, 30 * DEG], beyond: [40 * DEG] };

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
 * the body's limit and the intensity takes over. Provisional: Task 5 sets them under the time budget (at least 10).
 */
const POWERS = [0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9, 0.95, 1, 1.05, 1.1, 1.25, 1.5, 1.75, 2];

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
 * grids, the split on the pass roll (0 elsewhere), the ranges, the lawns and the power samples.
 */
export function gridFor(type: RollType): MapGrid {
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
        ranges,
        lawns: LAWNS,
        powers: POWERS,
    };
}

/** The plan's swept dimensions, in plansOf's order (outermost first). */
const DIMENSIONS = ["split", "lean", "feet", "drive", "handReach", "window"] as const;

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
export function plansOf(_type: RollType, grid: MapGrid): readonly MapPlan[] {
    const plans: MapPlan[] = [];
    const values = DIMENSIONS.map((d) => valuesOf(grid[d]));
    const beyond = DIMENSIONS.map((d) => new Set(grid[d].beyond));
    const chosen: number[] = [];
    const visit = (depth: number, outside: number): void => {
        if (depth === DIMENSIONS.length) {
            const [split, lean, feet, drive, handReach, window] = chosen as [
                number,
                number,
                number,
                number,
                number,
                number,
            ];
            plans.push({ lean, feet, drive, handReach, window, onset: 0, split });
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
        range,
        lawn,
    ]);
}

/** A key's plan, range and lawn (planKey's inverse). */
function unkey(key: string): { readonly plan: MapPlan; readonly range: number; readonly lawn: number } {
    const [lean, feet, drive, handReach, window, onset, split, range, lawn] = JSON.parse(key) as number[];
    const plan: MapPlan = {
        lean: lean as number,
        feet: feet as number,
        drive: drive as number,
        handReach: handReach as number,
        window: window as number,
        onset: onset as number,
        split: split as number,
    };
    return { plan, range: range as number, lawn: lawn as number };
}

/** Every plan's reads, keyed by planKey. */
export type Reads = ReadonlyMap<string, SweepRead>;

/** The on-point test's largest lean (rad; P2b.2b.2b.2b design §1): past it a plan is a mishit (A2 item 2). */
const LEAN_LIMIT = Math.PI / 4;

/**
 * The swept dimensions a neighbour steps along (A2 item 2): the lean, the feet, drive, handReach and window, and on
 * the pass roll the split.
 */
function neighbourDimensions(type: RollType): readonly Dimension[] {
    return type === "pass-roll" ? DIMENSIONS : DIMENSIONS.filter((d) => d !== "split");
}

/** The inputs' own bounds (A2 item 2), below and above; a neighbour past one does not exist. */
const BOUNDS: Readonly<Partial<Record<Dimension, readonly [number, number]>>> = {
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
 * - past the grid's own last value where that is not an input's bound (handReach 0.3 m, the window's 5 ms and 80 ms)
 *   the neighbour is skipped, and the plan flagged in `edges` with that dimension.
 * A plan with no read is not banded; nor is one with a neighbour that exists but has no read, counted in `unbanded`.
 */
export function grade(type: RollType, grid: MapGrid, reads: Reads): Grading {
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
export function bands(type: RollType, grid: MapGrid, reads: Reads): ReadonlyMap<string, Band> {
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

/** Decision 5's effort: the mean of the stroke's and the push's percentages. */
function effortOf(read: SweepRead): number {
    return (read.strokeEffort + read.pushEffort) / 2;
}

/** The follow-through grid's spans (m, s), the tie-break's scales (plan Task 4). */
const HAND_REACH_SPAN = Math.max(...HAND_REACHES);
const WINDOW_SPAN = Math.max(...WINDOWS);

/**
 * The tie-break's distance from the half roll's anchor in follow-through (design §5; plan Task 4): Euclidean over
 * (drive, handReach / HAND_REACH_SPAN, window / WINDOW_SPAN).
 */
function anchorDistance(plan: MapPlan, anchor: MapPlan): number {
    return Math.hypot(
        plan.drive - anchor.drive,
        (plan.handReach - anchor.handReach) / HAND_REACH_SPAN,
        (plan.window - anchor.window) / WINDOW_SPAN,
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

/** The record's columns (decision 10), in SI: rad, m, 1, m, s, s, rad; m, s; %, %, 1, N·s, rad. */
const COLUMNS = [
    "type",
    "lean",
    "feet",
    "drive",
    "handReach",
    "window",
    "onset",
    "split",
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
export function envelopeRows(type: RollType, grid: MapGrid, reads: Reads, banded: ReadonlyMap<string, Band>): string[] {
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
