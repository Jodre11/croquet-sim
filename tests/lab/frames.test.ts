import { describe, expect, it } from "vitest";
import { IMPACT_STEP, playFrames } from "../../src/lab/frames";
import { canonicalPower, openWorld, playSample, textBook, type MapType } from "../../src/lab/index";
import { encodePinned } from "./pinCodec";

const FIRMNESS = 0.5;

/** The viewer's frames (side-on viewer plan Task 4; spec §1 item 2: the frame probes change no play). */
describe("playFrames", () => {
    it.each(["drive", "pass-roll"] as const)(
        "%s: the text book's sample is playSample's, its frames in time order, the impact every 0.1 ms",
        (type: MapType) => {
            const plan = textBook(type);
            const power = canonicalPower(type, openWorld(10));
            const framed = playFrames(type, plan, power, FIRMNESS);
            expect(encodePinned(framed.sample)).toBe(encodePinned(playSample(type, plan, power, [10], FIRMNESS)));
            expect(framed.rejected).toBeNull();
            const times = framed.frames.map((f) => f.t);
            expect(times.length).toBeGreaterThan(100);
            for (let i = 1; i < times.length; i++) {
                expect(times[i] as number).toBeGreaterThan(times[i - 1] as number);
            }
            expect(framed.frames.some((f) => f.face > 0)).toBe(true);
            const inside = framed.frames.filter((f) => f.t >= framed.impactStart && f.t <= framed.impactEnd);
            expect(inside.length).toBeGreaterThan(10);
            for (let i = 1; i < inside.length; i++) {
                const gap = (inside[i] as { t: number }).t - (inside[i - 1] as { t: number }).t;
                expect(gap).toBeGreaterThanOrEqual(IMPACT_STEP * (1 - 1e-6));
                expect(gap).toBeLessThan(IMPACT_STEP * 1.1);
            }
            // Both are croquet strokes: the striker's ball and the croqueted ball depart.
            expect(framed.departures.length).toBe(2);
        },
        120_000,
    );
});
