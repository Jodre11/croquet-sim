import { describe, expect, it } from "vitest";
import { length, sub, vec3 } from "../../../src/engine/math/vec3";
import { SETTLE_SPEED } from "../../../src/engine/resolve";
import { simulateFreeMotion } from "../../../src/engine/simulate";
import { handover } from "../../../src/engine/impact/handover";
import { TEST_BALL, airborneAt, testWorld } from "../support/fixtures";

const R = TEST_BALL.radius;

describe("handover", () => {
    it("hands a ball clear of the turf over as it is", () => {
        const s = airborneAt(5, 5, R + 1e-3, vec3(1, 0, 0.5));
        expect(handover({ blue: s }, R).balls.blue).toBe(s);
    });

    it("places a ball in turf contact on the lawn and drops a slow vertical velocity", () => {
        const h = handover({ blue: airborneAt(5, 5, R - 2e-5, vec3(1, 0, SETTLE_SPEED / 2)) }, R).balls.blue;
        expect(h?.position).toEqual(vec3(5, 5, R));
        expect(h?.velocity).toEqual(vec3(1, 0, 0));
    });

    it("keeps an upward velocity of at least the settle speed, so the ball starts airborne", () => {
        const h = handover({ blue: airborneAt(5, 5, R - 2e-5, vec3(1, 0, 0.4)) }, R).balls.blue;
        expect(h?.position.z).toBe(R);
        expect(h?.velocity.z).toBe(0.4);
    });

    it("separates an overlapping pair on the turf to zero gap and reports the correction", () => {
        const out = handover({ blue: airborneAt(5, 5, R), red: airborneAt(5 + 2 * R - 1e-6, 5, R) }, R);
        const gap =
            length(sub(out.balls.red?.position ?? vec3(0, 0, 0), out.balls.blue?.position ?? vec3(0, 0, 0))) - 2 * R;
        expect(Math.abs(gap)).toBeLessThan(1e-15);
        // 5 + 2R − 1e-6 is exact only to an ulp of 5 (8.9e-16).
        expect(out.overlapCorrection).toBeCloseTo(1e-6, 14);
        expect(() => simulateFreeMotion(out.balls, testWorld())).not.toThrow();
    });

    it("never moves a ball below the turf when the normal is inclined", () => {
        const out = handover(
            {
                blue: airborneAt(5, 5, R),
                red: airborneAt(5 + 1.8 * R, 5, R + Math.sqrt(4 * R * R - 3.24 * R * R) - 1e-6),
            },
            R,
        );
        expect(out.balls.blue?.position.z).toBeGreaterThanOrEqual(R);
        expect(out.overlapCorrection).toBeGreaterThan(0);
        // Clamping blue's half-move would leave ½·overlap·n_z² ≈ 4e-8 m; red takes it, so the pair ends touching.
        const gap =
            length(sub(out.balls.red?.position ?? vec3(0, 0, 0), out.balls.blue?.position ?? vec3(0, 0, 0))) - 2 * R;
        expect(Math.abs(gap)).toBeLessThan(1e-15);
        expect(() => simulateFreeMotion(out.balls, testWorld())).not.toThrow();
    });

    it("separates a chain of three overlapping balls", () => {
        const out = handover(
            {
                blue: airborneAt(5, 5, R),
                red: airborneAt(5 + 2 * R - 1e-6, 5, R),
                yellow: airborneAt(5 + 4 * R - 2e-6, 5, R),
            },
            R,
        );
        const at = (id: "blue" | "red" | "yellow") => out.balls[id]?.position ?? vec3(0, 0, 0);
        for (const [a, b] of [
            ["blue", "red"],
            ["red", "yellow"],
            ["blue", "yellow"],
        ] as const) {
            expect(length(sub(at(b), at(a))) - 2 * R).toBeGreaterThanOrEqual(-1e-12);
        }
        expect(() => simulateFreeMotion(out.balls, testWorld())).not.toThrow();
    });

    it("reports no correction when nothing overlaps", () => {
        expect(handover({ blue: airborneAt(5, 5, R), red: airborneAt(6, 5, R) }, R).overlapCorrection).toBe(0);
    });
});
