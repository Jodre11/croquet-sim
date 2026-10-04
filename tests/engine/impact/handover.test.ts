import { describe, expect, it } from "vitest";
import { horizontal, length, sub, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import { SETTLE_SPEED } from "../../../src/engine/resolve";
import { simulateFreeMotion } from "../../../src/engine/simulate";
import type { BallState } from "../../../src/engine/types";
import { uprightsOf } from "../../../src/engine/world";
import { obstacleContact, type ObstacleGeometry } from "../../../src/engine/impact/contacts";
import { handover } from "../../../src/engine/impact/handover";
import { TEST_BALL, airborneAt, hoopWithUprightAt, testWorld } from "../support/fixtures";

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

    it("throws, naming the pair, when the passes run out with the balls still overlapping", () => {
        // One pass separates blue/red, then red/yellow pushes red back into blue.
        const chain = {
            blue: airborneAt(5, 5, R),
            red: airborneAt(5 + 2 * R - 1e-6, 5, R),
            yellow: airborneAt(5 + 4 * R - 2e-6, 5, R),
        };
        expect(() => handover(chain, R, [], 1)).toThrow(/balls blue and red still overlap by [0-9.e-]+ m after 1 pass/);
    });

    it.each([0, -1, 1.5, Number.NaN])("rejects %s passes", (passes) => {
        expect(() => handover({ blue: airborneAt(5, 5, R) }, R, [], passes)).toThrow(RangeError);
        expect(() => handover({ blue: airborneAt(5, 5, R) }, R, [], passes)).toThrow(/positive integer/);
    });

    it("reports no correction when nothing overlaps", () => {
        expect(handover({ blue: airborneAt(5, 5, R), red: airborneAt(6, 5, R) }, R).overlapCorrection).toBe(0);
    });
});

describe("handover with obstacles", () => {
    const HOOP = hoopWithUprightAt("1", 6, 5);
    const POST = uprightsOf(HOOP, { restitution: 0.6, friction: 0.1 })[0];
    const WORLD = testWorld({ hoops: [HOOP] });
    const gapTo = (p: Vec3, o: ObstacleGeometry): number => length(horizontal(sub(p, o.centre))) - R - o.radius;

    it("moves a ball overlapping an upright out to zero gap, horizontally, velocities unchanged", () => {
        const s = airborneAt(6 - R - 0.008 + 1e-6, 5, R, vec3(-1, 0.5, 0));
        const out = handover({ blue: s }, R, [POST]);
        const h = out.balls.blue as BallState;
        expect(obstacleContact(h.position, R, POST)).toBeNull();
        expect(gapTo(h.position, POST)).toBeLessThan(1e-12);
        expect(h.position.y).toBe(5);
        expect(h.position.z).toBe(R);
        expect(h.velocity).toEqual(s.velocity);
        expect(out.overlapCorrection).toBeCloseTo(1e-6, 12);
        expect(() => simulateFreeMotion(out.balls, WORLD)).not.toThrow();
    });

    it("separates a ball pushed into an upright by another ball", () => {
        const bx = 6 - R - 0.008 + 1e-6;
        const out = handover({ blue: airborneAt(bx, 5, R), red: airborneAt(bx - 2 * R + 1e-6, 5, R) }, R, [POST]);
        const blue = (out.balls.blue as BallState).position;
        const red = (out.balls.red as BallState).position;
        expect(gapTo(blue, POST)).toBeGreaterThanOrEqual(-1e-12);
        expect(length(sub(blue, red)) - 2 * R).toBeGreaterThanOrEqual(-1e-12);
        expect(() => simulateFreeMotion(out.balls, WORLD)).not.toThrow();
    });

    it("throws, naming the ball and the obstacle, when the passes cannot clear a ball between two posts", () => {
        // The posts' surfaces are 2R − 0.1 mm apart: no position clears both.
        const a: ObstacleGeometry = { id: "A", centre: vec3(6, 5, 0), radius: 0.008 };
        const b: ObstacleGeometry = { id: "B", centre: vec3(6 + 0.016 + 2 * R - 1e-4, 5, 0), radius: 0.008 };
        const squeezed = { blue: airborneAt(6 + 0.008 + R - 5e-5, 5, R) };
        expect(() => handover(squeezed, R, [a, b], 1)).toThrow(/ball blue and A still overlap by [0-9.e-]+ m after 1/);
        expect(() => handover(squeezed, R, [a, b])).toThrow(/after 64 passes/);
    });
});
