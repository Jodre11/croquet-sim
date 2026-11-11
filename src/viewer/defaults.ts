/**
 * The shot picker's lookup (side-on viewer spec §2, decision 9, §7 item 1): the record's defaults keyed by the ratio
 * label reached, split, range and lawn; the pick's `viable` default where it has one, else its `least`.
 */
import type { MapPlan, MapType } from "../lab/index";

/** A default's read, as `envelope-defaults.json` holds it. */
export interface DefaultRead {
    readonly ratio: number | null;
    readonly strokeEffort: number;
    readonly pushEffort: number;
    readonly firmness: number | null;
    readonly power: number;
}

/** One default: the hold (type) it is played from, its plan, band and read. */
export interface DefaultPick {
    readonly type: MapType;
    readonly plan: MapPlan;
    readonly band: string;
    readonly read: DefaultRead;
}

/** One pick of `defaults.json`. */
export interface DefaultEntry {
    readonly label: string;
    readonly split: number;
    readonly range: number;
    readonly lawn: number;
    readonly least?: DefaultPick | null;
    readonly viable?: DefaultPick | null;
}

/** The labels in the continuum's order (push-map design A7 item 2), the single ball's last. */
export const LABEL_ORDER = [
    "pass roll",
    "full roll",
    "between full roll and half roll",
    "half roll",
    "between half roll and drive",
    "drive",
    "between drive and AC stop",
    "AC stop",
    "beyond AC stop",
    "single ball",
] as const;

/** The holds' names as the screen says them ("from the full roll's hold"). */
export const HOLD_NAMES: Readonly<Record<MapType, string>> = {
    drive: "drive",
    "stop-ac": "AC stop",
    "half-roll": "half roll",
    "full-roll": "full roll",
    "pass-roll": "pass roll",
    "single-ball": "single ball",
};

/** The labels `entries` hold, in the continuum's order. */
export function labelsOf(entries: readonly DefaultEntry[]): string[] {
    const held = new Set(entries.map((e) => e.label));
    return LABEL_ORDER.filter((label) => held.has(label));
}

/** The splits (rad) `label`'s defaults hold, ascending. */
export function splitsOf(entries: readonly DefaultEntry[], label: string): number[] {
    return [...new Set(entries.filter((e) => e.label === label).map((e) => e.split))].sort((a, b) => a - b);
}

/** The range among `ranges` nearest `range` in log range (spec §7 item 2: the range snaps to the record's). */
export function snapRange(ranges: readonly number[], range: number): number {
    let best = ranges[0] as number;
    for (const r of ranges) {
        if (Math.abs(Math.log(r / range)) < Math.abs(Math.log(best / range))) {
            best = r;
        }
    }
    return best;
}

/** The default for the pick (spec §2): its viable plan where it has one, else its least; null where it has none. */
export function lookupDefault(
    entries: readonly DefaultEntry[],
    pick: { readonly label: string; readonly split: number; readonly range: number; readonly lawn: number },
): { readonly pick: DefaultPick; readonly from: "viable" | "least" } | null {
    const entry = entries.find(
        (e) => e.label === pick.label && e.split === pick.split && e.range === pick.range && e.lawn === pick.lawn,
    );
    if (entry === undefined) {
        return null;
    }
    if (entry.viable != null) {
        return { pick: entry.viable, from: "viable" };
    }
    return entry.least != null ? { pick: entry.least, from: "least" } : null;
}
