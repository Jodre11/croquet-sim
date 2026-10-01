import { describe, expect, it } from "vitest";
import { vec3 } from "../../src/engine/math/vec3";
import { SETTLE_SPEED } from "../../src/engine/resolve";
import { simulateFreeMotion } from "../../src/engine/simulate";
import type { BallId, ShotResult } from "../../src/engine/types";
import { STANDARD_GRAVITY } from "../../src/engine/world";
import { TEST_BALL, airborneAt, ballAt, testWorld } from "./support/fixtures";

const R = TEST_BALL.radius;
const G = STANDARD_GRAVITY;
const E_TURF = 0.5;

function landings(result: ShotResult, ball: BallId): number[] {
    return result.events.filter((e) => e.kind === "landing" && e.ball === ball).map((e) => e.t);
}

describe("flight and landing", () => {
    it("lands where and when the ballistic closed form says, and rebounds with the turf's restitution", () => {
        const h = 0.1;
        const v = vec3(1, 0.5, 0.8);
        const result = simulateFreeMotion({ blue: airborneAt(5, 5, R + h, v, vec3(-0.5 / R, 1 / R, 0)) }, testWorld());
        const t = (v.z + Math.sqrt(v.z * v.z + 2 * G * h)) / G;
        expect(landings(result, "blue")[0]).toBeCloseTo(t, 12);
        const second = result.segments.blue?.[1];
        expect(second?.t0).toBeCloseTo(t, 12);
        expect(second?.start.position.x).toBeCloseTo(5 + v.x * t, 12);
        expect(second?.start.position.y).toBeCloseTo(5 + v.y * t, 12);
        expect(second?.start.position.z).toBe(R);
        // The spin matches the horizontal velocity (no turf slip), so the landing leaves it unchanged.
        expect(second?.start.velocity.x).toBeCloseTo(v.x, 12);
        expect(second?.start.velocity.z).toBeCloseTo(E_TURF * (G * t - v.z), 12);
    });

    it("bounces with geometrically shrinking hops and settles on the turf (drop test)", () => {
        const h = 0.5;
        const result = simulateFreeMotion({ blue: airborneAt(5, 5, R + h) }, testWorld());
        const v1 = Math.sqrt(2 * G * h);
        const times = landings(result, "blue");
        let expected = 0;
        while (v1 * E_TURF ** expected >= SETTLE_SPEED) {
            expected++;
        }
        expect(times.length).toBe(expected);
        expect(times[0]).toBeCloseTo(Math.sqrt((2 * h) / G), 12);
        for (let k = 1; k < times.length; k++) {
            const flight = (2 * v1 * E_TURF ** k) / G;
            expect((times[k] as number) - (times[k - 1] as number)).toBeCloseTo(flight, 10);
        }
        expect(result.rest.blue).toEqual(vec3(5, 5, R));
        expect(result.aborted).toBe(false);
    });

    it("starts a ball on the lawn plane airborne only if it rises at least at the settle speed", () => {
        const slow = simulateFreeMotion({ blue: ballAt(5, 5, vec3(1, 0, 0.5 * SETTLE_SPEED)) }, testWorld());
        expect(slow.segments.blue?.[0]?.phase).toBe("sliding");
        expect(landings(slow, "blue")).toEqual([]);
        const fast = simulateFreeMotion({ blue: ballAt(5, 5, vec3(1, 0, 0.1)) }, testWorld());
        expect(fast.segments.blue?.[0]?.phase).toBe("airborne");
        expect(landings(fast, "blue")[0]).toBeCloseTo(0.2 / G, 12);
    });
});

describe("the boundary in flight", () => {
    it("judges out of court on the horizontal projection and halts a ball in flight on the turf", () => {
        const world = testWorld({ haltMargin: 0.1 });
        const result = simulateFreeMotion({ blue: airborneAt(0.3, 5, R, vec3(-2, 0, 3)) }, world);
        const out = result.events.find((e) => e.kind === "out-of-court");
        expect(out?.t).toBeCloseTo(0.15, 12);
        expect(result.events.some((e) => e.kind === "halted")).toBe(true);
        expect(landings(result, "blue")).toEqual([]);
        expect(result.rest.blue?.x).toBeCloseTo(-0.1, 9);
        expect(result.rest.blue?.z).toBe(R);
    });
});
