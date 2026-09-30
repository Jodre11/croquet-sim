import { describe, expect, it } from "vitest";
import { judgeHoopRun } from "../../src/engine/hoopRun";
import { simulateFreeMotion } from "../../src/engine/simulate";
import { STANDARD_GRAVITY } from "../../src/engine/world";
import { rollingBallAt, testHoop, testWorld } from "./support/fixtures";

const ROLL = 0.05 * STANDARD_GRAVITY;
const world = testWorld({ hoops: [testHoop("1", 15, 10.5)] });
const NORTH = { hoopId: "1", direction: 1 } as const;

describe("judgeHoopRun", () => {
    it("reports a clean run", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(15, 9.5, 0, 1.5) }, world);
        expect(judgeHoopRun(result, "blue", NORTH, world)).toBe("ran");
    });

    it("reports a ball starting on the wrong side as not eligible", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(15, 11.5, 0, -1.5) }, world);
        expect(judgeHoopRun(result, "blue", NORTH, world)).toBe("not-eligible");
    });

    it("judges the run relative to the target direction", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(15, 11.5, 0, -1.5) }, world);
        expect(judgeHoopRun(result, "blue", { hoopId: "1", direction: -1 }, world)).toBe("ran");
    });

    it("reports an upright rebound as no passage", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(15 + 0.0953 / 2 + 0.008, 9.5, 0, 1.5) }, world);
        expect(judgeHoopRun(result, "blue", NORTH, world)).toBe("no-passage");
    });

    it("reports a ball going round the hoop as no passage", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(15.5, 9.5, 0, 1.5) }, world);
        expect(judgeHoopRun(result, "blue", NORTH, world)).toBe("no-passage");
    });

    it("reports a ball stopping part-way through as incomplete", () => {
        // Starts 0.1 m short of the plane and stops 0.02 m past it (threshold is R + r = 0.054 m).
        const result = simulateFreeMotion({ blue: rollingBallAt(15, 10.4, 0, Math.sqrt(2 * ROLL * 0.12)) }, world);
        expect(judgeHoopRun(result, "blue", NORTH, world)).toBe("incomplete");
    });

    it("rejects an unknown hoop or ball", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(15, 9.5, 0, 1.5) }, world);
        expect(() => judgeHoopRun(result, "blue", { hoopId: "9", direction: 1 }, world)).toThrow(RangeError);
        expect(() => judgeHoopRun(result, "red", NORTH, world)).toThrow(RangeError);
    });
});
