/**
 * The pinned plays' codec (side-on viewer plan, Task 1): JSON with every double's bits kept. JSON.stringify writes a
 * finite double's shortest round-trip form, but writes NaN and the infinities as null and loses −0's sign, so those
 * are tagged as `{ "$num": "<name>" }`.
 */
import { MAP_TYPES, canonicalPower, playJudged, textBook, type MapType } from "../../scripts/pushMapRun";
import { openWorld } from "../../scripts/openLawn";

/** One pinned play: the type's text book at `power`, at the found hold or a fixed hold firmness. */
export interface PinnedPlay {
    readonly type: MapType;
    readonly power: number;
    readonly hold: "found" | number;
}

/** The hold firmness of the fixed-hold plays. */
export const PIN_FIRMNESS = 0.5;

/** The 24 pinned plays: each type's text book at power 0.5 and its canonical power, at the found and a fixed hold. */
export function pinnedPlays(): PinnedPlay[] {
    const world = openWorld(10);
    return MAP_TYPES.flatMap((type) =>
        [0.5, canonicalPower(type, world)].flatMap((power) =>
            (["found", PIN_FIRMNESS] as const).map((hold) => ({ type, power, hold })),
        ),
    );
}

/** `play`'s sample on the 10 s lawn, as the map plays it. */
export function playPinned(play: PinnedPlay): unknown {
    return playJudged(play.type, textBook(play.type), play.power, [10], play.hold).sample;
}

/** `value` as JSON text with NaN, ±Infinity and −0 tagged, so equal text means equal bits. */
export function encodePinned(value: unknown): string {
    return JSON.stringify(value, (_key, v: unknown) => {
        if (typeof v !== "number") {
            return v;
        }
        if (Number.isNaN(v)) {
            return { $num: "NaN" };
        }
        if (v === Infinity || v === -Infinity) {
            return { $num: v > 0 ? "Infinity" : "-Infinity" };
        }
        return Object.is(v, -0) ? { $num: "-0" } : v;
    });
}
