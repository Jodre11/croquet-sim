/**
 * The inputs' spans (side-on viewer spec §2): each input continuous within the span the map graded for the hold, its
 * grid values as ticks; beyond the span the band is unknown and the control stops there.
 */
import { defaultProfile } from "../engine/swing/profile";
import type { MapPlan, MapType } from "../lab/index";
import type { BandTable } from "../lab/judge";
import type { StrokeExtras } from "../lab/play";

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

/** The lean's playable most (rad): forward of every roll the map grades (hands-from-lean design §5.1). */
export const LEAN_MOST = Math.PI / 4;

/** The inputs whose playable span is every type's least to most graded or swept value (design §5.1). */
const SWEPT = ["feet", "handReach"] as const;

/** The playable span (design §5.1): continuous over every shot type, the picked type's graded values as ticks. */
export function playableSpans(tables: readonly BandTable[], picked: BandTable): Readonly<Record<Input, Span>> {
    const own = inputSpans(picked);
    const every = (input: Input): number[] => tables.flatMap((t) => [...t.axes[input].values]);
    const span = (input: Input, least: number, most: number): Span => ({ least, most, ticks: own[input].ticks });
    return {
        lean: span("lean", Math.min(...every("lean")), LEAN_MOST),
        ...(Object.fromEntries(
            SWEPT.map((input) => [input, span(input, Math.min(...every(input)), Math.max(...every(input)))]),
        ) as Record<(typeof SWEPT)[number], Span>),
        drive: span("drive", -1, 1),
        window: span("window", 0.001, 0.1),
    };
}

/** The extras' playable spans (design §5.1): each hand's grip tension and the follow-through (s). */
export const EXTRA_SPANS = {
    gripTension: { least: 0.05, most: 1, step: 0.05 },
    bottomGrip: { least: 0.05, most: 1, step: 0.05 },
    followThrough: { least: 0, most: 0.3, step: 0.01 },
} as const;

/** The extras the viewer moves, each at its value. */
export type ExtraValues = Readonly<Record<keyof typeof EXTRA_SPANS, number>>;

/** `type`'s defaults for the extras: its stance's grip tensions and its shape's follow-through. */
export function extraDefaults(type: MapType): ExtraValues {
    const stance = defaultProfile.stance[type];
    return {
        gripTension: stance.gripTension,
        bottomGrip: stance.bottomGrip,
        followThrough: defaultProfile.shape[type].followThrough,
    };
}

/** `plan` with each input kept within `spans`: the nearest set-up the type's table grades. */
export function clampPlan(spans: Readonly<Record<Input, Span>>, plan: MapPlan): MapPlan {
    return { ...plan, ...Object.fromEntries(INPUTS.map((input) => [input, clampTo(spans[input], plan[input])])) };
}

/**
 * Whether `plan` with `extras` lies off `table`'s grid (design §5.1): an input beyond the type's graded span, or an
 * extra moved from `defaults`. Off the grid the record has no band and no power for the set-up.
 */
export function offGrid(table: BandTable, plan: MapPlan, extras: StrokeExtras, defaults: ExtraValues): boolean {
    const spans = inputSpans(table);
    const outside = INPUTS.some((input) => clampTo(spans[input], plan[input]) !== plan[input]);
    const moved = (Object.keys(defaults) as (keyof ExtraValues)[]).some(
        (key) => extras[key] !== undefined && extras[key] !== defaults[key],
    );
    return outside || moved;
}
