import { describe, expect, it } from "vitest";
import { add, horizontal, length, scale, sub, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import { SETTLE_SPEED } from "../../../src/engine/resolve";
import { simulateShot } from "../../../src/engine/shot";
import { simulateFreeMotion } from "../../../src/engine/simulate";
import type { BallState } from "../../../src/engine/types";
import { defaultWorld, uprightsOf } from "../../../src/engine/world";
import { headBallContact, obstacleContact, type ObstacleGeometry } from "../../../src/engine/impact/contacts";
import { CONTACT_TOLERANCE } from "../../../src/engine/detect";
import { handover } from "../../../src/engine/impact/handover";
import { TURF_PIT_DEPTH } from "../../../src/engine/impact/integrate";
import { handoverLimit } from "../../../src/engine/impact/simulateImpact";
import { axisAngle, rotate } from "../../../src/engine/impact/rigidBody";
import type { HeadState } from "../../../src/engine/impact/types";
import { TEST_BALL, airborneAt, hoopWithUprightAt, testWorld } from "../support/fixtures";
import { TEST_HEAD, TEST_RHO } from "../support/impact";
import { LEGACY_MALLET, backswingFor, canonicalSetup } from "../support/shot";

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

    // Gate ruling 2026-10-12 ("Option 1 alone"): a ball the impact leaves sunk deeper than its static sink is lifted by
    // its actual depth, so the head's overlap after the lift can be that deep. Traced on four full-roll and pass-roll
    // sweep runs (lifts of 534 to 723 µm against a static sink of 437 µm).
    it("clears a ball sunk deeper than its static sink, lifted into the face by its actual depth", () => {
        const ball = { position: vec3(R - 5.5e-4, 0, R), velocity: vec3(0, 0, 0), angularVelocity: vec3(0, 0, 0) };
        const sunk = { blue: handoverLimit(6e-4, 4.4e-4) };
        const out = handover({ blue: ball }, R, [], undefined, { state: headAt(R), head: TEST_HEAD, limits: sunk });
        const moved = (out.balls.blue as BallState).position;
        expect(headBallContact(headAt(R), TEST_HEAD, moved, R)?.depth ?? 0).toBeLessThanOrEqual(1e-9);
        expect(out.overlapCorrection).toBeCloseTo(5.5e-4, 12);
    });

    it("still throws for a ball lifted past the turf-pit depth", () => {
        const ball = { position: vec3(R - 1.2e-3, 0, R), velocity: vec3(0, 0, 0), angularVelocity: vec3(0, 0, 0) };
        const pit = { blue: handoverLimit(2e-3, 4.4e-4) };
        expect(() =>
            handover({ blue: ball }, R, [], undefined, { state: headAt(R), head: TEST_HEAD, limits: pit }),
        ).toThrow(/head overlaps ball blue/);
    });

    it("limits a lift by its actual depth, capped at the turf-pit depth, never below the static sink", () => {
        const sink = 4.4e-4;
        expect(handoverLimit(-1e-3, sink)).toBe(sink + CONTACT_TOLERANCE);
        expect(handoverLimit(0, sink)).toBe(sink + CONTACT_TOLERANCE);
        expect(handoverLimit(3e-4, sink)).toBe(sink + CONTACT_TOLERANCE);
        expect(handoverLimit(6e-4, sink)).toBe(6e-4 + CONTACT_TOLERANCE);
        expect(handoverLimit(5e-3, sink)).toBe(TURF_PIT_DEPTH + CONTACT_TOLERANCE);
    });

    it("throws for a head on top of a ball", () => {
        // A vertical normal has no horizontal part, so the rule has no sideways way out of the overlap.
        const state: HeadState = {
            position: vec3(0, 0, 2 * R + TEST_RHO - 1e-4),
            orientation: axisAngle(vec3(0, 0, 1), 0),
            velocity: vec3(0, 0, 0),
            angularVelocity: vec3(0, 0, 0),
        };
        const ball = { position: vec3(0, 0, R), velocity: vec3(0, 0, 0), angularVelocity: vec3(0, 0, 0) };
        expect(() => handover({ blue: ball }, R, [], undefined, { state, head: TEST_HEAD, limits })).toThrow(
            /head overlaps ball blue/,
        );
    });

    it("throws for a head almost on top of a ball, whose sideways move would exceed the ball's radius", () => {
        // The face pitched to within 1e-3 rad of straight down, so |n_h| ≈ 1e-3. The overlap, 0.1 mm, is within the
        // ball's limit, but depth/|n_h| ≈ 0.1 m moves the ball well over R (36.8 mm): a numerical artefact.
        const pitch = Math.PI / 2 - 1e-3;
        const n = rotate(axisAngle(vec3(0, 1, 0), pitch), vec3(1, 0, 0));
        const reach = TEST_HEAD.length / 2 + R - 1e-4;
        const ballAt = vec3(0, 0, R);
        const state: HeadState = {
            position: sub(ballAt, scale(n, reach)),
            orientation: axisAngle(vec3(0, 1, 0), pitch),
            velocity: vec3(0, 0, 0),
            angularVelocity: vec3(0, 0, 0),
        };
        const ball = { position: ballAt, velocity: vec3(0, 0, 0), angularVelocity: vec3(0, 0, 0) };
        expect(headBallContact(state, TEST_HEAD, ballAt, R)?.region).toBe("face");
        expect(() => handover({ blue: ball }, R, [], undefined, { state, head: TEST_HEAD, limits })).toThrow(
            /head overlaps ball blue.*sideways move .* exceeds the ball's radius/,
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

describe("handover of a ball sunk under the head, on whole rolls", () => {
    // Gate ruling 2026-10-12 ("Option 1 alone"). Four preset-sweep runs end with the striker's ball 534 to 723 µm
    // deep in the turf, past its 437 µm static sink, under the head: the 1 m/s full roll at the 450 ms cap with the
    // rim pressing it down, the 2 m/s pass roll 0.25 ms after its last face interval. The handover lifts the ball by
    // that depth, so the head's overlap after the lift (515 to 577 µm) is cleared by the lift, not thrown.
    const world = defaultWorld();
    it.each([
        ["full-roll", 1, -1, -0.01],
        ["full-roll", 1, -1, 0],
        ["full-roll", 1, -1, 0.01],
        ["pass-roll", 2, 1, 0],
    ] as const)("hands over the %s at %s m/s, drive %s, side %s, with the head cleared of a lifted ball", (...run) => {
        const [type, speed, drive, side] = run;
        // P2b.2b.2b.2c: on the legacy round head; the default box clears the turf (gate).
        // P2b.2b.2c.2b: the croquet gap's default, 1 mm; pinned at gap 0, where the sunk ball's lift was measured: at
        // 1 mm the face meets the striker's ball again 4.2 ms in (full roll) and 3.7 ms in (pass roll), after the
        // balls' contact, and every run's overlapCorrection is 0 (full roll 407.6–409.2 ms long, pass roll 169.4 ms).
        const base = canonicalSetup(type, { croquetGap: 0, mallet: LEGACY_MALLET });
        const up = base.stroke.contact.up + (type === "full-roll" ? 0.003 : -0.003);
        const stroke = { ...base.stroke, drive, contact: { up, side } };
        const setup = { ...base, stroke: { ...stroke, backswing: backswingFor({ ...base, stroke }, speed, world) } };
        const outcome = simulateShot(setup, world);
        expect(outcome.impact.overlapCorrection).toBeGreaterThan(5e-4);
    });
});
