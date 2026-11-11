/**
 * Plan Task C4's checks (design §6 as A7 item 10 restates it, §7, the effect measure; the user's pull and the holes,
 * 2026-11-09 and 2026-11-11): measures over the committed record (`reference/derived/envelope-<type>.csv.gz`), each
 * band's defaults (`envelope-defaults.json`) and the map's shard samples. Each is measured, not passed or failed; the
 * gate rules on them. Not part of the engine.
 */
import { labelOf, quantile, type BandPick, type SweepSample } from "./pushMapGrid";
import type { MapPlan, MapType } from "./pushMapRun";

/** One row of the record (sectionRecord's columns), the fields the checks read; NaN where the record is empty. */
export interface RecordRow extends MapPlan {
    readonly type: MapType;
    readonly range: number;
    readonly lawn: number;
    /** The graded band, "viable" or "edgy", or "" where the read is not banded. */
    readonly band: string;
    /** The read's class, "" where it plays. */
    readonly klass: string;
    readonly ratio: number;
    readonly strokeEffort: number;
    readonly pushEffort: number;
    readonly pushImpulse: number;
    readonly splitAtRest: number;
    readonly power: number;
}

/** The fields of one CSV line (RFC 4180, as sectionRecord's `field` quotes them). */
export function csvFields(line: string): string[] {
    const out: string[] = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i] as string;
        if (quoted) {
            if (c === '"' && line[i + 1] === '"') {
                cell += '"';
                i++;
            } else if (c === '"') {
                quoted = false;
            } else {
                cell += c;
            }
        } else if (c === '"') {
            quoted = true;
        } else if (c === ",") {
            out.push(cell);
            cell = "";
        } else {
            cell += c;
        }
    }
    out.push(cell);
    return out;
}

const NUMERIC = [
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
    "ratio",
    "strokeEffort",
    "pushEffort",
    "pushImpulse",
    "splitAtRest",
    "power",
] as const;

/** The record's rows from one type's decompressed CSV, its `#` header lines skipped. */
export function parseRecord(text: string): RecordRow[] {
    const lines = text.split("\n").filter((l) => l !== "" && !l.startsWith("#"));
    const head = csvFields(lines[0] ?? "");
    const at = (name: string): number => head.indexOf(name);
    return lines.slice(1).map((line) => {
        const f = csvFields(line);
        const row: Record<string, unknown> = {
            type: f[at("type")],
            band: f[at("band")] ?? "",
            klass: f[at("class")] ?? "",
        };
        for (const name of NUMERIC) {
            const text = f[at(name)] ?? "";
            row[name] = text === "" ? NaN : Number(text);
        }
        return row as unknown as RecordRow;
    });
}

/** Whether the row's read is graded admissible (the coverage plot's test): banded viable or edgy, with a ratio. */
export function isAdmissible(row: RecordRow): boolean {
    return (row.band === "viable" || row.band === "edgy") && Number.isFinite(row.ratio);
}

/** §6 item 2: per type, the drive slices and how many have the ratio rise as drive rises. */
export interface DriveRises {
    readonly slices: number;
    readonly rising: number;
    /** The largest rise between neighbouring drives (1); 0 where none rises. */
    readonly largest: number;
}

/**
 * §6 item 2 (A7 item 10): within a type, at a fixed range and lawn and every other input held, the admissible reads
 * ordered by drive; a slice rises where the ratio at a greater drive exceeds the ratio at its neighbour below. Slices
 * of one read are not counted.
 */
export function driveRises(rows: readonly RecordRow[]): DriveRises {
    const slices = new Map<string, RecordRow[]>();
    for (const row of rows.filter(isAdmissible)) {
        const key = JSON.stringify([
            row.type,
            row.lean,
            row.feet,
            row.handReach,
            row.window,
            row.onset,
            row.split,
            row.speedGain,
            row.range,
            row.lawn,
        ]);
        slices.set(key, [...(slices.get(key) ?? []), row]);
    }
    let counted = 0;
    let rising = 0;
    let largest = 0;
    for (const slice of slices.values()) {
        if (slice.length < 2) {
            continue;
        }
        counted++;
        const sorted = [...slice].sort((a, b) => a.drive - b.drive);
        let rose = false;
        for (let i = 1; i < sorted.length; i++) {
            const rise = (sorted[i] as RecordRow).ratio - (sorted[i - 1] as RecordRow).ratio;
            if (rise > 0) {
                rose = true;
                largest = Math.max(largest, rise);
            }
        }
        rising += rose ? 1 : 0;
    }
    return { slices: counted, rising, largest };
}

/** The coverage plot's ratio bin (1; pushMapPlots' RATIO_BIN, A7 item 9's read-out bin). */
export const RATIO_BIN = 0.6;

/** The coverage plot's top bin's least ratio (1): ratios above gather in its bin. */
export const RATIO_TOP = 9.6;

/** A lawn's length (m): a full court length, the record's longest range (A7 item 5). */
export const LAWN_LENGTH = 32;

/** A run of empty ratio bins at one range, with covered bins either side (the user, 2026-11-11). */
export interface Hole {
    readonly range: number;
    /** The empty run's ratios (1), least and most. */
    readonly least: number;
    readonly most: number;
    /** Whether the croqueted ball would lie past a lawn's length throughout the run (range × least > LAWN_LENGTH). */
    readonly pastBoundary: boolean;
}

/** The ratio bin of `ratio`, the top bin gathering everything above RATIO_TOP. */
function binOf(ratio: number): number {
    return Math.min(Math.round(RATIO_TOP / RATIO_BIN), Math.floor(ratio / RATIO_BIN));
}

/**
 * The holes inside the reachable area on one lawn (plan Task C4): at each range, the runs of ratio bins no admissible
 * two-ball read reaches with a reached bin below and above; the single-ball stroke has no ratio and is left out.
 */
export function holesOf(rows: readonly RecordRow[], lawn: number): Hole[] {
    const covered = new Map<number, Set<number>>();
    for (const row of rows) {
        if (row.lawn !== lawn || row.type === "single-ball" || !isAdmissible(row)) {
            continue;
        }
        const bins = covered.get(row.range) ?? new Set<number>();
        bins.add(binOf(row.ratio));
        covered.set(row.range, bins);
    }
    const holes: Hole[] = [];
    for (const [range, bins] of [...covered].sort((a, b) => a[0] - b[0])) {
        const sorted = [...bins].sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i++) {
            const below = sorted[i - 1] as number;
            const above = sorted[i] as number;
            if (above - below > 1) {
                const least = (below + 1) * RATIO_BIN;
                holes.push({
                    range,
                    least,
                    most: above * RATIO_BIN,
                    pastBoundary: range * least > LAWN_LENGTH,
                });
            }
        }
    }
    return holes;
}

/** A type's admissible reads' ratio span at one range and lawn, with the leans that reach its ends. */
export interface RatioSpan {
    readonly least: number;
    readonly leastLean: number;
    readonly most: number;
    readonly mostLean: number;
}

/** `type`'s admissible ratio span at `range` and `lawn`, null where it has no admissible read there. */
export function ratioSpan(rows: readonly RecordRow[], type: MapType, range: number, lawn: number): RatioSpan | null {
    const here = rows.filter((r) => r.type === type && r.range === range && r.lawn === lawn && isAdmissible(r));
    if (here.length === 0) {
        return null;
    }
    const least = here.reduce((a, b) => (b.ratio < a.ratio ? b : a));
    const most = here.reduce((a, b) => (b.ratio > a.ratio ? b : a));
    return { least: least.ratio, leastLean: least.lean, most: most.ratio, mostLean: most.lean };
}

/** One type's admissible ratio span at one lean, beside a hole (leanSpans). */
export interface LeanSpan {
    readonly type: MapType;
    readonly lean: number;
    readonly least: number;
    readonly most: number;
}

/**
 * The hole's neighbours, to explain it (plan Task C4: the grid's lean steps, or the physics): per type and lean, the
 * admissible ratio span at the hole's range and `lawn` among the reads within `margin` of the hole, by type then lean.
 */
export function leanSpans(rows: readonly RecordRow[], hole: Hole, lawn: number, margin: number): LeanSpan[] {
    const spans = new Map<string, { type: MapType; lean: number; least: number; most: number }>();
    for (const row of rows) {
        if (
            row.range !== hole.range ||
            row.lawn !== lawn ||
            !isAdmissible(row) ||
            row.ratio < hole.least - margin ||
            row.ratio > hole.most + margin
        ) {
            continue;
        }
        const key = `${row.type}|${row.lean}`;
        const span = spans.get(key) ?? { type: row.type, lean: row.lean, least: row.ratio, most: row.ratio };
        span.least = Math.min(span.least, row.ratio);
        span.most = Math.max(span.most, row.ratio);
        spans.set(key, span);
    }
    return [...spans.values()].sort((a, b) => a.type.localeCompare(b.type) || a.lean - b.lean);
}

/** The median of `values`, NaN where empty. */
export function median(values: readonly number[]): number {
    return quantile(values, 0.5);
}

/**
 * The user's pull (2026-11-09; a first reading): the pass roll's admissible reads at one lawn and set split, the
 * median split at rest (rad) per lean, ascending by lean.
 */
export function splitAtRestByLean(
    rows: readonly RecordRow[],
    lawn: number,
    split: number,
): { readonly lean: number; readonly n: number; readonly median: number }[] {
    const byLean = new Map<number, number[]>();
    for (const row of rows) {
        if (
            row.type === "pass-roll" &&
            row.lawn === lawn &&
            row.split === split &&
            isAdmissible(row) &&
            Number.isFinite(row.splitAtRest)
        ) {
            byLean.set(row.lean, [...(byLean.get(row.lean) ?? []), row.splitAtRest]);
        }
    }
    return [...byLean]
        .sort((a, b) => a[0] - b[0])
        .map(([lean, values]) => ({ lean, n: values.length, median: median(values) }));
}

/** The effect measure (§7): samples carrying both verdicts, and how they differ. */
export interface EffectTally {
    readonly samples: number;
    /** Faulted by the shipped span measure alone. */
    readonly shippedOnly: number;
    /** Faulted by the contact-only candidate alone. */
    readonly contactOnly: number;
}

/**
 * §7's effect measure: over a type's sweeps, the played samples' two verdicts (the shipped span measure's and the
 * contact-only candidate's, decision 11) counted where they differ; with `fitted`, the fitted hold's samples.
 */
export function effectTally(sweeps: Iterable<readonly SweepSample[]>, fitted: boolean): EffectTally {
    let samples = 0;
    let shippedOnly = 0;
    let contactOnly = 0;
    for (const sweep of sweeps) {
        for (const s of sweep) {
            const sample = fitted ? s.fitted : s;
            if (sample === undefined || "engineError" in sample) {
                continue;
            }
            const { shipped, contactOnly: candidate } = sample.effectVerdicts;
            samples++;
            shippedOnly += shipped && !candidate ? 1 : 0;
            contactOnly += candidate && !shipped ? 1 : 0;
        }
    }
    return { samples, shippedOnly, contactOnly };
}

/** A band's default (the viable pick where there is one, else the least complex edgy one; A9 item 6). */
export function defaultOf(pick: BandPick): BandPick["least"] {
    return pick.viable ?? pick.least;
}

/** How many times `values` falls from one entry to the next. */
export function drops(values: readonly number[]): number {
    let count = 0;
    for (let i = 1; i < values.length; i++) {
        count += (values[i] as number) < (values[i - 1] as number) ? 1 : 0;
    }
    return count;
}

/** The share (0–1) of `rows` for which `test` holds, NaN where empty. */
export function share<T>(rows: readonly T[], test: (row: T) => boolean): number {
    return rows.length === 0 ? NaN : rows.filter(test).length / rows.length;
}

/** The label of a row's ratio on the continuum (labelOf). */
export function labelOfRow(row: RecordRow): string {
    return labelOf(row.ratio);
}
