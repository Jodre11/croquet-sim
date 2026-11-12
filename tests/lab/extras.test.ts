import { describe, expect, it } from "vitest";
import { playFrames } from "../../src/lab/frames";
import { mapSetup, textBook } from "../../src/lab/play";

describe("StrokeExtras (hands-from-lean plan Task 1)", () => {
    const plan = textBook("half-roll");

    it("leaves the set-up untouched when none are given", () => {
        expect(mapSetup("half-roll", plan, 1, {}, 0, {})).toEqual(mapSetup("half-roll", plan, 1));
    });

    it("writes the grips' tensions and the follow-through into the stroke", () => {
        const setup = mapSetup("half-roll", plan, 1, {}, 0, { gripTension: 0.5, bottomGrip: 0.4, followThrough: 0.05 });
        expect(setup.stroke.grip?.gripTension).toBe(0.5);
        expect(setup.stroke.grip?.bottomGrip).toBe(0.4);
        expect(setup.stroke.followThrough).toBe(0.05);
    });

    it("changes a play's follow-through only after the impact", () => {
        const base = playFrames("half-roll", plan, 1, 0.1);
        const short = playFrames("half-roll", plan, 1, 0.1, 10, { followThrough: 0 });
        const before = (frames: typeof base.frames) => frames.filter((f) => f.t <= base.impactEnd);
        expect(before(short.frames)).toEqual(before(base.frames));
        expect(short.finish).not.toBe(base.finish);
    });
});
