import { describe, expect, it } from "vitest";
import { add, horizontal, length, scale, sub, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import { SETTLE_SPEED } from "../../../src/engine/resolve";
import { simulateFreeMotion } from "../../../src/engine/simulate";
import type { BallState } from "../../../src/engine/types";
import { uprightsOf } from "../../../src/engine/world";
import { headBallContact, obstacleContact, type ObstacleGeometry } from "../../../src/engine/impact/contacts";
import { handover } from "../../../src/engine/impact/handover";
import { axisAngle, rotate } from "../../../src/engine/impact/rigidBody";
import type { HeadState } from "../../../src/engine/impact/types";
import { TEST_BALL, airborneAt, hoopWithUprightAt, testWorld } from "../support/fixtures";
import { TEST_HEAD } from "../support/impact";

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

describe("handover with the head (P2b.2b.2b.2b design §5)", () => {
    /** The test head level, its face toward +x, the face's plane at x = 0, its axis at height h. */
    const headAt = (h: number, pitch = 0): HeadState => ({
        position: vec3(-TEST_HEAD.length / 2, 0, h),
        orientation: axisAngle(vec3(0, 1, 0), pitch),
        velocity: vec3(1, 0, 0),
        angularVelocity: vec3(0, 0, 0),
    });
    const limits = { blue: 4.4e-4 + 1e-9 };

    it("moves a ball lifted into the face out along the face's normal, by the overlap", () => {
        // The ball lies 0.1 mm into the face's plane after the lift: its centre R − 1e-4 ahead of the face.
        const ball = {
            position: vec3(R - 1e-4, 0, R - 3e-4),
            velocity: vec3(0.5, 0, 0),
            angularVelocity: vec3(0, 0, 0),
        };
        const out = handover({ blue: ball }, R, [], undefined, { state: headAt(R), head: TEST_HEAD, limits });
        const moved = out.balls.blue as BallState;
        expect(moved.position.x).toBeCloseTo(R, 12);
        expect(moved.position.z).toBe(R);
        expect(moved.velocity).toEqual(ball.velocity);
        expect(out.overlapCorrection).toBeCloseTo(1e-4, 12);
    });

    it("clears a tilted face too, moving the ball horizontally by depth/|n_h|", () => {
        // The face pitched 0.2 rad. The ball, at z = R and y = 0, lies R − 0.1 mm from the face's plane, on the head's
        // axis: the head is raised or lowered so that the axis passes through the ball's centre c = a + (L/2 + R −
        // 1e-4)·n. (A ball at the head's own height would sit about 33 mm off the axis, beyond the face's 32 mm
        // radius, on the rim.)
        const n = rotate(axisAngle(vec3(0, 1, 0), 0.2), vec3(1, 0, 0));
        const reach = TEST_HEAD.length / 2 + R - 1e-4;
        const state = headAt(R - n.z * reach, 0.2);
        const ball = {
            position: add(state.position, scale(n, reach)),
            velocity: vec3(0, 0, 0),
            angularVelocity: vec3(0, 0, 0),
        };
        expect(headBallContact(state, TEST_HEAD, ball.position, R)?.region).toBe("face");
        const out = handover({ blue: ball }, R, [], undefined, { state, head: TEST_HEAD, limits });
        const moved = (out.balls.blue as BallState).position;
        expect(headBallContact(state, TEST_HEAD, moved, R)?.depth ?? 0).toBeLessThanOrEqual(1e-9);
        expect(moved.z).toBe(R);
    });

    it("leaves a ball the head does not touch bit-identical", () => {
        const ball = { position: vec3(R + 1e-3, 0, R), velocity: vec3(0.5, 0, 0), angularVelocity: vec3(1, 2, 3) };
        const out = handover({ blue: ball }, R, [], undefined, { state: headAt(R), head: TEST_HEAD, limits });
        expect(out.balls.blue).toBe(ball);
        expect(out.overlapCorrection).toBe(0);
    });

    it("throws past its bound: deeper than the static sink plus CONTACT_TOLERANCE", () => {
        const ball = { position: vec3(R - 1e-3, 0, R), velocity: vec3(0, 0, 0), angularVelocity: vec3(0, 0, 0) };
        expect(() => handover({ blue: ball }, R, [], undefined, { state: headAt(R), head: TEST_HEAD, limits })).toThrow(
            /head overlaps ball blue/,
        );
    });

    it("throws for a head on top of a ball", () => {
        // Review focus 4: a vertical normal has no horizontal way out.
        const state: HeadState = {
            position: vec3(0, 0, 2 * R + TEST_HEAD.radius - 1e-4),
            orientation: axisAngle(vec3(0, 0, 1), 0),
            velocity: vec3(0, 0, 0),
            angularVelocity: vec3(0, 0, 0),
        };
        const ball = { position: vec3(0, 0, R), velocity: vec3(0, 0, 0), angularVelocity: vec3(0, 0, 0) };
        expect(() => handover({ blue: ball }, R, [], undefined, { state, head: TEST_HEAD, limits })).toThrow(
            /head overlaps ball blue/,
        );
    });

    it("moves a ball again that the pair pass pushes back into the head", () => {
        // Red overlaps blue from ahead; separating them pushes blue back into the face, and the head pass clears it.
        const blue = { position: vec3(R - 1e-4, 0, R), velocity: vec3(0, 0, 0), angularVelocity: vec3(0, 0, 0) };
        const red = {
            position: vec3(3 * R - 1e-4 - 2e-4, 0, R),
            velocity: vec3(0, 0, 0),
            angularVelocity: vec3(0, 0, 0),
        };
        const out = handover({ blue, red }, R, [], undefined, { state: headAt(R), head: TEST_HEAD, limits });
        const b = (out.balls.blue as BallState).position;
        const r = (out.balls.red as BallState).position;
        expect(headBallContact(headAt(R), TEST_HEAD, b, R)?.depth ?? 0).toBeLessThanOrEqual(1e-9);
        expect(length(sub(r, b))).toBeGreaterThanOrEqual(2 * R - 1e-12);
    });
});
