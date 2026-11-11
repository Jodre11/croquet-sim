/**
 * The inputs' spans (side-on viewer spec §2): each input continuous within the span the map graded for the hold, its
 * grid values as ticks; beyond the span the band is unknown and the control stops there.
 */
import type { BandTable } from "../lab/judge";

/** The tuned inputs (spec §2): lean, feet, push length, after contact, push window. */
export const INPUTS = ["lean", "feet", "handReach", "drive", "window"] as const;
export type Input = (typeof INPUTS)[number];

/** One input's span: its least and most graded values, and every graded value as a tick. */
export interface Span {
    readonly least: number;
    readonly most: number;
    readonly ticks: readonly number[];
}

/** Each input's span over `table`'s graded values (spec §2). */
export function inputSpans(table: BandTable): Readonly<Record<Input, Span>> {
    const spanOf = (input: Input): Span => {
        const axis = table.axes[input];
        const ticks = axis.values.filter((_, i) => axis.graded[i]);
        return { least: Math.min(...ticks), most: Math.max(...ticks), ticks };
    };
    return Object.fromEntries(INPUTS.map((input) => [input, spanOf(input)])) as Record<Input, Span>;
}

/** `value` kept within `span`. */
export function clampTo(span: Span, value: number): number {
    return Math.min(span.most, Math.max(span.least, value));
}
