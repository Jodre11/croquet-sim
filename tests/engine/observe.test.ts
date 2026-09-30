import { describe, expect, it } from "vitest";
import { vec3 } from "../../src/engine/math/vec3";
import { advance } from "../../src/engine/motion";
import { observe } from "../../src/engine/observe";
import { simulateFreeMotion } from "../../src/engine/simulate";
import { STANDARD_GRAVITY, motionParamsAt } from "../../src/engine/world";
import { ballAt, rollingBallAt, testHoop, testWorld } from "./support/fixtures";

const ROLL = 0.05 * STANDARD_GRAVITY;

/** Rolling speed that stops a ball after `distance` metres. */
function speedFor(distance: number): number {
    return Math.sqrt(2 * ROLL * distance);
}

describe("out of court", () => {
    it("applies an 'any part over the line' rule (threshold −R)", () => {
        const world = testWorld({ outOfCourt: { ballRadii: -1, uprightRadii: 0 } });
        // Stops with its centre 0.03 m inside the west line, so part of the ball is over it.
        const result = simulateFreeMotion({ blue: rollingBallAt(1, 5, -speedFor(0.97), 0) }, world);
        expect(result.events.filter((e) => e.kind === "out-of-court")).toHaveLength(1);
    });

    it("applies a 'centre over the line' rule (threshold 0)", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(1, 5, -speedFor(0.97), 0) }, testWorld());
        expect(result.events.some((e) => e.kind === "out-of-court")).toBe(false);
    });

    it("records going out before being halted, once", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(1, 5, -4, 0) }, testWorld());
        const out = result.events.filter((e) => e.kind === "out-of-court");
        const halted = result.events.find((e) => e.kind === "halted");
        expect(out).toHaveLength(1);
        expect(out[0]?.t).toBeLessThan(halted?.t ?? 0);
        expect((out[0] as { position: { x: number } }).position.x).toBeCloseTo(0, 6);
    });
});

describe("hoop passages", () => {
    const world = testWorld({ hoops: [testHoop("1", 15, 10)] });

    it("records one northward passage through the hoop", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(15, 9, 0, 1.5) }, world);
        const passages = result.events.filter((e) => e.kind === "hoop-passage");
        expect(passages).toEqual([expect.objectContaining({ ball: "blue", hoopId: "1", direction: 1 })]);
    });

    it("records a southward passage with direction −1", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(15, 11, 0, -1.5) }, world);
        expect(result.events.find((e) => e.kind === "hoop-passage")).toEqual(
            expect.objectContaining({ direction: -1 }),
        );
    });

    it("records nothing for a ball passing beside the hoop", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(15.5, 9, 0, 1.5) }, world);
        expect(result.events.some((e) => e.kind === "hoop-passage")).toBe(false);
    });

    it("records exactly one passage across a sweep of speeds (Review Focus 5)", () => {
        // Sliding-to-rolling transitions fall at different distances, some near the hoop plane.
        for (let i = 0; i < 50; i++) {
            const v = 1 + (2 * i) / 49;
            const result = simulateFreeMotion({ blue: ballAt(15, 9.5, vec3(0, v, 0)) }, world);
            expect(
                result.events.filter((e) => e.kind === "hoop-passage"),
                `speed ${v}`,
            ).toHaveLength(1);
        }
    });

    it("records exactly one passage when a segment boundary falls on the hoop plane (Review Focus 5, I1)", () => {
        // Hand-built segments whose boundary is the analytic crossing time, so the boundary state lies on the plane
        // to within rounding, on either side of it.
        const params = motionParamsAt(world, vec3(15, 9, 0));
        const a = params.rollingDecel;
        for (let i = 0; i < 2000; i++) {
            const v = 1.5 + i / 1000;
            const start = rollingBallAt(15, 9, 0, v);
            const crossing = (v - Math.sqrt(v * v - 2 * a)) / a;
            const segments = [
                { t0: 0, t1: crossing, phase: "rolling" as const, start, params },
                {
                    t0: crossing,
                    t1: crossing + 0.5,
                    phase: "rolling" as const,
                    start: advance(start, "rolling", params, crossing),
                    params,
                },
            ];
            const passages = observe({ blue: segments }, world).filter((e) => e.kind === "hoop-passage");
            expect(passages, `speed ${v}`).toHaveLength(1);
            expect(passages[0]?.t).toBeCloseTo(crossing, 9);
        }
    });

    it("does not count an upright rebound as a passage", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(15 + 0.0953 / 2 + 0.008, 9, 0, 1.5) }, world);
        expect(result.events.some((e) => e.kind === "ball-obstacle" && e.obstacleId.startsWith("1/"))).toBe(true);
        expect(result.events.some((e) => e.kind === "hoop-passage")).toBe(false);
    });
});
