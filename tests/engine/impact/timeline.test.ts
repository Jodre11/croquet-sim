import { describe, expect, it } from "vitest";
import { ZERO, vec3 } from "../../../src/engine/math/vec3";
import { lawFromContactTime, lawFromStiffness } from "../../../src/engine/impact/contactLaw";
import { faceClearance } from "../../../src/engine/impact/contacts";
import { IMPACT_DT, integrate, type ImpactObstacle, type ImpactSnapshot } from "../../../src/engine/impact/integrate";
import { IDENTITY } from "../../../src/engine/impact/rigidBody";
import { closeTimeline, emptyTimeline, inGap, noteClearance, recordStep } from "../../../src/engine/impact/timeline";
import type { ContactInterval, HeadState } from "../../../src/engine/impact/types";
import type { BallState } from "../../../src/engine/types";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import { TEST_BALL } from "../support/fixtures";
import { TEST_FACE, TEST_HEAD, faceLaw, freeBall, isolated, recorder } from "../support/impact";

const R = TEST_BALL.radius;
const M = TEST_BALL.mass;

describe("the timeline recorder", () => {
    it("opens at a step's start, ends at the first step out of contact and keeps the largest force", () => {
        const line = emptyTimeline();
        recordStep(line, false, 0, 0);
        recordStep(line, true, 5, 1e-5);
        recordStep(line, true, 9, 2e-5);
        recordStep(line, true, 0, 3e-5);
        recordStep(line, false, 0, 4e-5);
        expect(closeTimeline(line, 1e-4)).toEqual([{ start: 1e-5, end: 4e-5, peakForce: 9 }]);
    });

    it("gives the interval before a gap that gap's largest clearance once the next interval opens", () => {
        const line = emptyTimeline();
        recordStep(line, true, 1, 0);
        recordStep(line, false, 0, 1e-5);
        expect(inGap(line)).toBe(true);
        noteClearance(line, 1e-4);
        noteClearance(line, 3e-4);
        noteClearance(line, 2e-4);
        recordStep(line, true, 2, 4e-5);
        expect(inGap(line)).toBe(false);
        recordStep(line, false, 0, 5e-5);
        noteClearance(line, 7e-4);
        expect(closeTimeline(line, 1e-4)).toEqual([
            { start: 0, end: 1e-5, peakForce: 1, clearanceAfter: 3e-4 },
            { start: 4e-5, end: 5e-5, peakForce: 2 },
        ]);
    });

    it("counts a single step out of contact as a gap, and ends an open interval at the duration", () => {
        const line = emptyTimeline();
        recordStep(line, true, 1, 0);
        recordStep(line, false, 0, 1e-5);
        recordStep(line, true, 1, 2e-5);
        expect(closeTimeline(line, 3e-5)).toEqual([
            { start: 0, end: 1e-5, peakForce: 1 },
            { start: 2e-5, end: 3e-5, peakForce: 1 },
        ]);
        expect(inGap(emptyTimeline())).toBe(false);
    });
});

describe("the integrator's timeline", () => {
    it("records a double tap off a wall: two face intervals, the wall between them, and the gap's clearance", () => {
        const law = faceLaw({ ...TEST_FACE, friction: 0 });
        const gap = 1.01e-4;
        const start: HeadState = {
            position: vec3(-R - gap - TEST_HEAD.length / 2, 0, 1),
            orientation: IDENTITY,
            velocity: vec3(2, 0, 0),
            angularVelocity: ZERO,
        };
        // 2 mm leaves the first face contact released before the wall closes. Pre-flight: face [55, 680) µs and
        // [1945, 2575) µs, wall [1140, 1930) µs between them, clearance after the first 0.950 mm.
        const wall: ImpactObstacle = {
            id: "wall",
            centre: vec3(R + 2e-3 + 10, 0, 0),
            radius: 10,
            law: lawFromContactTime(M, 0.6, 7e-4, 0),
        };
        const probe = recorder();
        const run = integrate(
            isolated({
                start,
                face: law,
                drive: {
                    kind: "force",
                    samples: [
                        { t: 0, force: ZERO },
                        { t: 3e-3, force: ZERO },
                    ],
                },
                obstacles: [wall],
                balls: [freeBall("blue", vec3(0, 0, 1))],
            }),
            { probe },
        );
        const faces = run.timeline["face/blue"] ?? [];
        expect(faces).toHaveLength(2);
        const [first, second] = faces as [ContactInterval, ContactInterval];
        // The face plane reaches the ball during step 10 (gap / speed = 10.1 steps): the pair is closed from step 11.
        expect(first.start).toBe(11 * IMPACT_DT);
        // Clamped law: the force releases with δ = c·e·v/k still positive, which then closes at e·v: c/k later.
        // Pre-flight: 4.73 µs off.
        expect(
            Math.abs(first.end - first.start - (TEST_FACE.contactTime + law.damping / law.stiffness)),
        ).toBeLessThanOrEqual(2 * IMPACT_DT);
        expect(first.peakForce).toBeGreaterThan(0);
        const wallFirst = (run.timeline["blue@wall"] ?? [])[0] as ContactInterval;
        expect(wallFirst.start).toBeGreaterThanOrEqual(first.end);
        expect(wallFirst.start).toBeLessThan(second.start);
        // clearanceAfter is the largest d − R over the gap's steps, each read from the state at the step's start:
        // step i starts from the state after step i − 1, snapshot i − 1.
        const clearanceOf = (s: ImpactSnapshot): number =>
            faceClearance(s.head, TEST_HEAD, (s.balls[0] as BallState).position, R);
        let largest = -Infinity;
        for (let i = Math.round(first.end / IMPACT_DT); i < Math.round(second.start / IMPACT_DT); i++) {
            largest = Math.max(largest, clearanceOf(probe.snapshots[i - 1] as ImpactSnapshot));
        }
        expect(first.clearanceAfter).toBe(largest);
        expect(largest).toBeGreaterThan(0);
        expect(largest).toBeLessThan(2e-3);
    });

    it("keeps a contact that crosses the face's rim as one interval, opened at the rim", () => {
        // Blue starts 1 mm outside the disc and 20 µm short of the face plane, moving into it and towards the axis:
        // it reaches the rim (OFF_FACE) first, then the face.
        const start: HeadState = {
            position: vec3(-TEST_HEAD.length / 2, 0, 1),
            orientation: IDENTITY,
            velocity: ZERO,
            angularVelocity: ZERO,
        };
        const ball = freeBall("blue", vec3(R + 2e-5, TEST_HEAD.radius + 1e-3, 1), vec3(-0.1, -2, 0));
        const run = integrate(isolated({ start, balls: [ball] }), { cap: 2e-3 });
        const rim = run.events.find((e) => e.kind === "impact-off-face");
        const faces = run.timeline["face/blue"] ?? [];
        expect(rim).toBeDefined();
        expect(faces).toHaveLength(1);
        expect(faces[0]?.start).toBe(rim?.t);
        expect(faces[0]?.peakForce).toBeGreaterThan(0);
    });

    it("ends an interval still open when the impact ends at the impact's duration", () => {
        const k = 2e5;
        const sink = (M * STANDARD_GRAVITY) / k;
        const run = integrate(
            isolated({
                gravity: STANDARD_GRAVITY,
                balls: [freeBall("blue", vec3(0, 0, R - sink), ZERO, lawFromStiffness(M, 0.5, k, 0.3))],
            }),
            { cap: 1e-4 },
        );
        const turf = run.timeline["turf/blue"] ?? [];
        expect(turf).toEqual([{ start: 0, end: run.duration, peakForce: expect.any(Number) }]);
        // The ball rests at its static sink, so its turf spring carries its weight throughout.
        expect(turf[0]?.peakForce).toBeGreaterThan(0);
    });

    it("lists exactly the ball–ball and ball–obstacle pairs touching at t = 0", () => {
        const post: ImpactObstacle = {
            id: "post",
            centre: vec3(0, 0, 0),
            radius: 0.01,
            law: lawFromContactTime(M, 0.6, 7e-4, 0.1),
        };
        const x = -(R + 0.01);
        const run = integrate(
            isolated({
                obstacles: [post],
                balls: [
                    freeBall("blue", vec3(x, 0, 1)),
                    freeBall("red", vec3(x - 2 * R, 0, 1)),
                    freeBall("black", vec3(1, 0, 1)),
                    freeBall("yellow", vec3(1 + 2 * R + 1e-6, 0, 1)),
                ],
            }),
            { cap: 1e-5 },
        );
        expect(run.touchingAtStart).toEqual(["blue/red", "blue@post"]);
    });
});
