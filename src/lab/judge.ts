/**
 * The viewer's judging of a set-up (side-on viewer spec §3.3; push-map design A3 item 1, A10 item 1): the band table
 * packed by `scripts/viewerData.ts`, read back, and a set-up judged from its cell's corners; and the nearest grip plan
 * (spec decision 8). Not part of the engine.
 */
import type { MapClass, MapPlan, MapType } from "./play";

/** The swept dimensions in the table's index order, outermost first (pushMapGrid.ts's DIMENSIONS), then range, lawn. */
export const TABLE_DIMENSIONS = ["speedGain", "split", "lean", "feet", "drive", "handReach", "window"] as const;
export type TableDimension = (typeof TABLE_DIMENSIONS)[number];

/** The record's bands as stored: "" is blank (spec §3.3). */
export const TABLE_BANDS = ["", "viable", "edgy", "unplayable"] as const;
export type TableBand = (typeof TABLE_BANDS)[number];

/** The record's classes as stored, after "none" (index 0). */
export const TABLE_CLASSES = [
    "unreachable",
    "superhuman",
    "mishit",
    "turf",
    "unpractised",
    "unlawful",
    "off-court",
] as const satisfies readonly MapClass[];

/** The code byte: bit 5 is set where the record has the point, bits 2–4 the class (0 none), bits 0–1 the band. */
const PRESENT = 0x20;

/** One axis of the table: every value swept, ascending, and whether each is graded (pushMapGrid.ts's Axis). */
export interface TableAxis {
    readonly values: readonly number[];
    readonly graded: readonly boolean[];
}

/** The table's header, as JSON in the file. */
export interface TableHeader {
    readonly type: MapType;
    readonly axes: Readonly<Record<TableDimension, TableAxis>>;
    readonly ranges: readonly number[];
    readonly lawns: readonly number[];
}

/** One type's band table (spec §3.3): per point a band, class and power, in the grid's index order. */
export interface BandTable extends TableHeader {
    readonly codes: Uint8Array;
    readonly powers: Float32Array;
}

/** One point of the table as the record has it; null where the record has no row. */
export interface TablePoint {
    readonly band: TableBand;
    readonly klass: MapClass | null;
    readonly power: number | null;
}

/** The code byte of a record row (viewerData's writer). */
export function encodePoint(band: TableBand, klass: MapClass | null): number {
    const b = TABLE_BANDS.indexOf(band);
    const c = klass === null ? 0 : TABLE_CLASSES.indexOf(klass as (typeof TABLE_CLASSES)[number]) + 1;
    if (b < 0 || c < 0) {
        throw new Error(`encodePoint: unknown band "${band}" or class "${klass}"`);
    }
    return PRESENT | (c << 2) | b;
}

/** The number of points in a table with `header`'s axes. */
export function pointCount(header: TableHeader): number {
    return (
        TABLE_DIMENSIONS.reduce((n, d) => n * header.axes[d].values.length, 1) *
        header.ranges.length *
        header.lawns.length
    );
}

/** The flat index of the point at each dimension's value index, `range` index and `lawn` index. */
function flatIndex(header: TableHeader, at: readonly number[], range: number, lawn: number): number {
    let index = 0;
    TABLE_DIMENSIONS.forEach((d, i) => {
        index = index * header.axes[d].values.length + (at[i] as number);
    });
    return (index * header.ranges.length + range) * header.lawns.length + lawn;
}

/** The index of `value` in `values` (exact), else −1. */
function exactIndex(values: readonly number[], value: number): number {
    return values.indexOf(value);
}

/** The point index of `plan` at `range` (m) and `lawn` (s), every value exact; null where one is not on its axis. */
export function pointIndex(header: TableHeader, plan: MapPlan, range: number, lawn: number): number | null {
    const at = TABLE_DIMENSIONS.map((d) => exactIndex(header.axes[d].values, plan[d]));
    const r = exactIndex(header.ranges, range);
    const l = exactIndex(header.lawns, lawn);
    if (at.some((i) => i < 0) || r < 0 || l < 0) {
        return null;
    }
    return flatIndex(header, at, r, l);
}

/** The point at flat `index`. */
function pointAtIndex(table: BandTable, index: number): TablePoint | null {
    const code = table.codes[index] as number;
    if ((code & PRESENT) === 0) {
        return null;
    }
    const c = (code >> 2) & 0x7;
    const power = table.powers[index] as number;
    return {
        band: TABLE_BANDS[code & 0x3] as TableBand,
        klass: c === 0 ? null : (TABLE_CLASSES[c - 1] as MapClass),
        power: Number.isNaN(power) ? null : power,
    };
}

/** The record's point of `plan` at `range` and `lawn`, every value on its axis; null where off the axes or unrecorded. */
export function readPoint(table: BandTable, plan: MapPlan, range: number, lawn: number): TablePoint | null {
    const index = pointIndex(table, plan, range, lawn);
    return index === null ? null : pointAtIndex(table, index);
}

/**
 * The file's bytes (viewerData's writer): a little-endian u32 header length, the header's UTF-8 JSON, padding to 4,
 * the code bytes, padding to 4, then the powers as little-endian float32 (NaN where none).
 */
export function writeBandTable(header: TableHeader, codes: Uint8Array, powers: Float32Array): Uint8Array {
    const json = new TextEncoder().encode(JSON.stringify(header));
    const pad = (n: number): number => (n + 3) & ~3;
    const codesAt = pad(4 + json.length);
    const powersAt = pad(codesAt + codes.length);
    const bytes = new Uint8Array(powersAt + 4 * powers.length);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, json.length, true);
    bytes.set(json, 4);
    bytes.set(codes, codesAt);
    powers.forEach((p, i) => view.setFloat32(powersAt + 4 * i, p, true));
    return bytes;
}

/** A band table from its file's bytes (spec §3.3). */
export function readBandTable(bytes: ArrayBuffer): BandTable {
    const view = new DataView(bytes);
    const length = view.getUint32(0, true);
    const header = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 4, length))) as TableHeader;
    const n = pointCount(header);
    const pad = (k: number): number => (k + 3) & ~3;
    const codesAt = pad(4 + length);
    const powersAt = pad(codesAt + n);
    const powers = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        powers[i] = view.getFloat32(powersAt + 4 * i, true);
    }
    return { ...header, codes: new Uint8Array(bytes.slice(codesAt, codesAt + n)), powers };
}

/** The envelope's judgement of a set-up (spec §2's badge). */
export interface Judgement {
    readonly band: "viable" | "edgy" | "non-viable" | "unknown";
    /** The class of a non-viable set-up (its nearest corner's), else null. */
    readonly klass: string | null;
    /** The power at the range (spec §3.3's interpolation), null where no corner has one. */
    readonly power: number | null;
}

/** One dimension's bracket: the graded value indices either side and the weight of the upper. */
interface Bracket {
    readonly lo: number;
    readonly hi: number;
    readonly t: number;
}

/** `value`'s bracket among `axis`'s graded values; null outside their span. */
function bracketOf(axis: TableAxis, value: number): Bracket | null {
    const graded = axis.values.map((v, i) => ({ v, i })).filter((_, i) => axis.graded[i]);
    for (let k = 0; k < graded.length; k++) {
        const here = graded[k] as { v: number; i: number };
        if (value === here.v) {
            return { lo: here.i, hi: here.i, t: 0 };
        }
        const next = graded[k + 1];
        if (next !== undefined && value > here.v && value < next.v) {
            return { lo: here.i, hi: next.i, t: (value - here.v) / (next.v - here.v) };
        }
    }
    return null;
}

/** The severity of a corner's band in the corner rule, a non-viable corner counting as edgy. */
const SEVERITY = { viable: 0, edgy: 1 } as const;

/**
 * The band of `plan` at `range` (m) and `lawn` (s), both on the table's axes (the range snapped, spec §7 item 2), from
 * `table` (spec §3.3; push-map design A3 item 1): on a grid point the record's (unplayable, or blank with a class, is
 * non-viable; blank without one is unknown); between grid points the cell's worst corner, an unplayable corner counting
 * as edgy, all unplayable non-viable, any unknown corner unknown. Outside the graded span, unknown. The power is the
 * corners' multilinear mix over those that have one, null with none.
 */
export function judge(table: BandTable, plan: MapPlan, range: number, lawn: number): Judgement {
    const r = exactIndex(table.ranges, range);
    const l = exactIndex(table.lawns, lawn);
    const brackets = TABLE_DIMENSIONS.map((d) => bracketOf(table.axes[d], plan[d]));
    if (r < 0 || l < 0 || brackets.some((b) => b === null)) {
        return { band: "unknown", klass: null, power: null };
    }
    const sides = (brackets as Bracket[]).map((b) =>
        b.lo === b.hi
            ? [{ i: b.lo, w: 1 }]
            : [
                  { i: b.lo, w: 1 - b.t },
                  { i: b.hi, w: b.t },
              ],
    );
    let corners: { at: number[]; w: number }[] = [{ at: [], w: 1 }];
    for (const side of sides) {
        corners = corners.flatMap((c) => side.map((s) => ({ at: [...c.at, s.i], w: c.w * s.w })));
    }
    let unknown = false;
    let worst: "viable" | "edgy" = "viable";
    let playable = 0;
    let nearest: { w: number; klass: string | null } = { w: -1, klass: null };
    let mixed = 0;
    let weight = 0;
    for (const c of corners) {
        const point = pointAtIndex(table, flatIndex(table, c.at, r, l));
        if (point !== null && point.power !== null) {
            mixed += c.w * point.power;
            weight += c.w;
        }
        if (point === null || (point.band === "" && point.klass === null)) {
            unknown = true;
            continue;
        }
        const unplayable = point.band === "unplayable" || point.band === "";
        if (unplayable) {
            if (c.w > nearest.w) {
                nearest = { w: c.w, klass: point.klass };
            }
            worst = "edgy";
            continue;
        }
        playable++;
        if (SEVERITY[point.band] > SEVERITY[worst]) {
            worst = point.band;
        }
    }
    const power = weight > 0 ? mixed / weight : null;
    if (unknown) {
        return { band: "unknown", klass: null, power };
    }
    if (playable === 0) {
        return { band: "non-viable", klass: nearest.klass, power };
    }
    return { band: worst, klass: null, power };
}

/** One grip plan of the grip record (spec §3.3), as `grips.json` holds it. */
export interface GripPlan {
    readonly type: MapType;
    readonly plan: MapPlan;
    readonly power: number;
    readonly set: "start" | "held";
    /** The grip sweep's least and firmest grips that play, and its reliable grip; null where none plays. */
    readonly least: number | null;
    readonly firmest: number | null;
    readonly reliable: number | null;
    /** The range (m) and ratio at the reliable grip on the 10 s lawn; null where none. */
    readonly range: number | null;
    readonly ratio: number | null;
    /** The reliable grip played early (s, negative), with its class, range and ratio. */
    readonly timing: readonly {
        readonly early: number;
        readonly klass: string | null;
        readonly range: number;
        readonly ratio: number;
    }[];
}

/** The inputs standardised for the nearest grip plan (spec §3.3), with the power. */
const GRIP_INPUTS = ["lean", "feet", "drive", "handReach", "window", "split", "speedGain"] as const;

/**
 * The nearest grip plan to `plan` at `power` among `plans` of `type` with a reliable grip (spec §3.3, decision 8): the
 * least squared distance over the inputs and the power, each standardised by its standard deviation over those plans
 * (an input with none is skipped). Starting and held-out plans are both candidates. Null where none has a reliable grip.
 */
export function nearestGrip(plans: readonly GripPlan[], type: MapType, plan: MapPlan, power: number): GripPlan | null {
    return nearestGripAt(plans, type, plan, power)?.grip ?? null;
}

/** nearestGrip's plan with its standardised distance (the square root of the least squared distance; spec §2). */
export function nearestGripAt(
    plans: readonly GripPlan[],
    type: MapType,
    plan: MapPlan,
    power: number,
): { readonly grip: GripPlan; readonly distance: number } | null {
    const candidates = plans.filter((p) => p.type === type && p.reliable !== null);
    if (candidates.length === 0) {
        return null;
    }
    const valuesOf = (p: GripPlan): number[] => [...GRIP_INPUTS.map((k) => p.plan[k]), p.power];
    const target = [...GRIP_INPUTS.map((k) => plan[k]), power];
    const columns = candidates.map(valuesOf);
    const spreads = target.map((_, j) => {
        const xs = columns.map((c) => c[j] as number);
        const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
        return Math.sqrt(xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / xs.length);
    });
    let best: GripPlan | null = null;
    let least = Infinity;
    candidates.forEach((p, k) => {
        const row = columns[k] as number[];
        let d = 0;
        spreads.forEach((s, j) => {
            if (s > 0) {
                const z = ((row[j] as number) - (target[j] as number)) / s;
                d += z * z;
            }
        });
        if (d < least) {
            least = d;
            best = p;
        }
    });
    return best === null ? null : { grip: best, distance: Math.sqrt(least) };
}
