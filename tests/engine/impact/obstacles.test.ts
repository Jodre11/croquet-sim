import { describe, expect, it } from "vitest";
import { CONTACT_TOLERANCE } from "../../../src/engine/detect";
import { judgeFaults, type StrokeContext } from "../../../src/engine/faults";
import { length, sub, vec3 } from "../../../src/engine/math/vec3";
import { simulateFreeMotion } from "../../../src/engine/simulate";
import { IMPACT_CAP } from "../../../src/engine/impact/integrate";
import { simulateImpact } from "../../../src/engine/impact/simulateImpact";
import type { World } from "../../../src/engine/types";
import { TEST_BALL, ballAt, hoopWithUprightAt, testHoop, testWorld } from "../support/fixtures";
import { strike } from "../support/impact";

const R = TEST_BALL.radius;
const r = testHoop("1", 0, 0).uprightRadius;
const BLUE = ballAt(10, 10);
const HAMPERED: StrokeContext = {
    striker: "blue",
    kind: "single-ball",
    live: [],
    hampered: true,
    jumpAttempt: false,
    group: false,
};

/** The test world with hoop "1" placed so that its upright "1/a" stands at (x, y). */
function uprightAt(x: number, y: number): World {
    return testWorld({ hoops: [hoopWithUprightAt("1", x, y)] });
}

const laws = (context: StrokeContext, ...args: Parameters<typeof simulateImpact>): string[] =>
    judgeFaults(context, simulateImpact(...args)).findings.map((f) => f.law);

describe("crush geometry (C29.13.1)", () => {
    it("raises 29.1.8 for a ball 1 mm from an upright struck straight at it", () => {
        const world = uprightAt(10 + R + r + 1e-3, 10);
        const result = simulateImpact(strike(BLUE.position, { speed: 3 }), { blue: BLUE }, world);
        expect(judgeFaults(HAMPERED, result).findings.map((f) => f.law)).toContain("29.1.8");
        expect(() => simulateFreeMotion(result.handover, world)).not.toThrow();
    });

    it("does not for a ball 20 mm from it, which it never reaches", () => {
        const world = uprightAt(10 + R + r + 0.02, 10);
        const result = simulateImpact(strike(BLUE.position, { speed: 3 }), { blue: BLUE }, world);
        expect(result.timeline["blue@1/a"]).toBeUndefined();
        expect(judgeFaults(HAMPERED, result).findings.map((f) => f.law)).not.toContain("29.1.8");
    });

    it("does not for a ball 5 mm from it, which it reaches", () => {
        const world = uprightAt(10 + R + r + 0.005, 10);
        const result = simulateImpact(strike(BLUE.position, { speed: 3 }), { blue: BLUE }, world);
        expect(result.timeline["blue@1/a"]).toBeDefined();
        expect(judgeFaults(HAMPERED, result).findings.map((f) => f.law)).not.toContain("29.1.8");
    });
});

describe("a ball touching an upright", () => {
    it.each([
        ["exactly", 0],
        ["overlapping by rounding", 5e-10],
    ])("struck directly away from it (touching %s) raises neither 29.1.8 nor 29.1.9", (_label, overlap) => {
        // 1/a on the east side (1/b stands further east, out of the way); the head strikes from the east, towards -x.
        const world = uprightAt(10 + R + r - overlap, 10);
        const result = simulateImpact(strike(BLUE.position, { speed: 2, yaw: Math.PI }), { blue: BLUE }, world);
        expect(result.touchingAtStart).toEqual(["blue@1/a"]);
        expect(result.timeline["blue@1/a"]).toBeUndefined();
        expect(result.timeline["blue@1/b"]).toBeUndefined();
        expect(result.handover.blue?.velocity.x).toBeLessThan(0);
        const found = judgeFaults(HAMPERED, result).findings.map((f) => f.law);
        expect(found).not.toContain("29.1.8");
        expect(found).not.toContain("29.1.9");
    });

    it("struck into it raises both 29.1.8 and 29.1.9", () => {
        const world = uprightAt(10 + R + r, 10);
        const found = laws(HAMPERED, strike(BLUE.position, { speed: 2 }), { blue: BLUE }, world);
        expect(found).toContain("29.1.8");
        expect(found).toContain("29.1.9");
    });

    it("at rest and never struck does not hold the impact open", () => {
        const yellow = ballAt(12, 12);
        const world = uprightAt(12 + R + r, 12);
        const result = simulateImpact(strike(BLUE.position), { blue: BLUE, yellow }, world);
        expect(result.events.some((e) => e.kind === "impact-cap")).toBe(false);
        expect(result.duration).toBeLessThan(IMPACT_CAP);
        expect(result.timeline["yellow@1/a"]).toBeUndefined();
        const moved = length(sub(result.handover.yellow?.position ?? vec3(0, 0, 0), yellow.position));
        expect(moved).toBeLessThanOrEqual(CONTACT_TOLERANCE);
    });
});

describe("a close scatter shot (C29.12.2)", () => {
    it("along the line of centres onto a dead ball raises 29.1.7 or 29.1.6.2", () => {
        const red = ballAt(10 + 2 * R + 1e-3, 10);
        const found = laws({ ...HAMPERED, hampered: false }, strike(BLUE.position), { blue: BLUE, red }, testWorld());
        expect(found.some((law) => law === "29.1.7" || law === "29.1.6.2")).toBe(true);
    });
});
