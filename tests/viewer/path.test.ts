import { describe, expect, it } from "vitest";
import { canonicalPower, openWorld, textBook } from "../../src/lab/index";
import { stepGrip } from "../../src/viewer/grip";
import { plannedPath } from "../../src/viewer/plannedPath";

/**
 * The 100 ms bound is asserted only with `VIEWER_TIMING=1` and the test run alone: under the full suite the other
 * workers double even this fork's CPU time. Task 7 measures it in Chromium, where spec §1 item 4 applies.
 */
const TIMED = import.meta.env["VIEWER_TIMING"] === "1";

describe("plannedPath (spec §1 item 4, §3.2)", () => {
    it("plans the drive's text book from the release to the impact's start, within 100 ms when timed", () => {
        const plan = textBook("drive");
        const power = canonicalPower("drive", openWorld(10));
        plannedPath("drive", plan, power);
        const times: number[] = [];
        let path = plannedPath("drive", plan, power);
        for (let i = 1; i <= 5; i++) {
            const start = performance.now();
            path = plannedPath("drive", { ...plan, lean: plan.lean + 0.002 * i }, power);
            times.push(performance.now() - start);
        }
        const took = times.sort((a, b) => a - b)[2] as number;
        console.log(`plannedPath on the drive's text book: median ${took.toFixed(1)} ms, ${path.length} samples`);
        if (TIMED) {
            expect(took).toBeLessThan(100);
        }
        expect(path.length).toBeGreaterThan(10);
        const last = path[path.length - 1] as (typeof path)[number];
        expect(last.t).toBeLessThanOrEqual(0);
        expect(Math.abs(last.face.x)).toBeLessThan(0.1);
    });

    it("throws the planner's RangeError for a set-up it rejects", () => {
        expect(() => plannedPath("drive", { ...textBook("drive"), lean: 1.2 }, 1)).toThrow(RangeError);
    });
});

describe("stepGrip (spec §2)", () => {
    it("steps by 0.0625 and clamps at the bounds", () => {
        const bounds = { least: 0.25, firmest: 0.75 };
        expect(stepGrip(0.5, bounds, 1)).toBe(0.5625);
        expect(stepGrip(0.5, bounds, -1)).toBe(0.4375);
        expect(stepGrip(0.75, bounds, 1)).toBe(0.75);
        expect(stepGrip(0.25, bounds, -1)).toBe(0.25);
        expect(stepGrip(0.3, bounds, -1)).toBe(0.25);
    });
});
