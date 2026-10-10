import { describe, expect, it } from "vitest";
import { ZERO, vec3 } from "../../../src/engine/math/vec3";
import { contactReference } from "../../../src/reference/index";
import { IMPACT_DT, RELEASE_STEPS, TURF_PIT_DEPTH, driveAt, integrate } from "../../../src/engine/impact/integrate";
import { IDENTITY } from "../../../src/engine/impact/rigidBody";
import { simulateImpact } from "../../../src/engine/impact/simulateImpact";
import { staticSink } from "../../../src/engine/impact/turfBed";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import { TEST_BALL, ballAt, testWorld } from "../support/fixtures";
import { TEST_HEAD, freeBall, isolated, strike, testBed } from "../support/impact";

const R = TEST_BALL.radius;

describe("driveAt", () => {
    const samples = [
        { t: 0, force: vec3(0, 0, 10) },
        { t: 1e-3, force: vec3(20, 0, 10) },
        { t: 3e-3, force: vec3(0, 0, 10) },
    ];

    it("interpolates linearly between samples", () => {
        expect(driveAt(samples, 0.5e-3)).toEqual(vec3(10, 0, 10));
        expect(driveAt(samples, 2e-3)).toEqual(vec3(10, 0, 10));
    });

    it("holds the last sample at its time and is zero after it", () => {
        expect(driveAt(samples, 3e-3)).toEqual(vec3(0, 0, 10));
        expect(driveAt(samples, 3.000001e-3)).toBe(ZERO);
    });
});

describe("step", () => {
    it("is about 1/100 of the shortest sourced contact duration", () => {
        const shortest = Math.min(
            contactReference.ballBallContactTime.bounds?.[0] as number,
            contactReference.faceBallContactTime.bounds?.[0] as number,
        );
        expect(IMPACT_DT).toBeLessThanOrEqual(shortest / 50);
        expect(IMPACT_DT).toBeGreaterThanOrEqual(shortest / 200);
    });
});

describe("events and termination", () => {
    it("runs to the cap when the head never reaches a ball, and says so", () => {
        const run = integrate(isolated({ balls: [freeBall("blue", vec3(0, 0, 1))] }), { cap: 1e-3 });
        expect(run.events).toEqual([{ kind: "impact-cap", t: run.duration }]);
        expect(run.duration).toBeGreaterThanOrEqual(1e-3);
        expect(run.steps).toBe(Math.round(run.duration / IMPACT_DT));
    });

    it("ends RELEASE_STEPS after the last hard contact once the drive window has closed", () => {
        const start = {
            position: vec3(-R - 1e-4 - TEST_HEAD.length / 2, 0, 1),
            orientation: IDENTITY,
            velocity: vec3(2, 0, 0),
            angularVelocity: ZERO,
        };
        const run = integrate(isolated({ start, balls: [freeBall("blue", vec3(0, 0, 1))] }));
        expect(run.events.filter((e) => e.kind === "impact-cap")).toEqual([]);
        expect(run.duration).toBeLessThan(5e-3);
        expect(run.peakPenetration["face/blue"]).toBeGreaterThan(0);
    });

    it("waits for the drive window to close", () => {
        const start = {
            position: vec3(-R - 1e-4 - TEST_HEAD.length / 2, 0, 1),
            orientation: IDENTITY,
            velocity: vec3(2, 0, 0),
            angularVelocity: ZERO,
        };
        const drive = {
            kind: "force" as const,
            samples: [
                { t: 0, force: ZERO },
                { t: 20e-3, force: ZERO },
            ],
        };
        const run = integrate(isolated({ start, drive, balls: [freeBall("blue", vec3(0, 0, 1))] }));
        expect(run.duration).toBeGreaterThanOrEqual(20e-3);
    });

    it("stays open while a struck ball is still bouncing out of its hollow", () => {
        // P2b.2b.2b.2a: turf bed (was the plane law, 2e5 N/m at e 0.5, with its ball leaving at z = R). The face
        // strike closes in under 1 ms; the ball, driven 1 m/s into the test bed, is still bouncing (turfBed.ts
        // isBouncing) well after the face has let go and RELEASE_STEPS have passed, so the impact runs on until it
        // lets go of its last cell, rising.
        const start = {
            position: vec3(-R - 1e-4 - TEST_HEAD.length / 2, 0, R),
            orientation: IDENTITY,
            velocity: vec3(2, 0, 0),
            angularVelocity: ZERO,
        };
        const run = integrate(
            isolated({
                start,
                gravity: STANDARD_GRAVITY,
                balls: [freeBall("blue", vec3(0, 0, R), vec3(0, 0, -1), testBed())],
            }),
            { cap: 20e-3 },
        );
        const face = run.timeline["face/blue"] ?? [];
        const faceEnd = (face[face.length - 1] as { end: number }).end;
        const lift = run.events.filter((e) => e.kind === "turf-lift");
        expect(run.events.filter((e) => e.kind === "impact-cap")).toEqual([]);
        expect(lift).toHaveLength(1);
        expect((lift[0] as { t: number }).t).toBeGreaterThan(faceEnd + RELEASE_STEPS * IMPACT_DT);
        expect(run.duration).toBeGreaterThanOrEqual((lift[0] as { t: number }).t);
        expect(run.balls.blue?.velocity.z as number).toBeGreaterThan(0);
    });

    it("flags a ball at the rim once and forms no face contact", () => {
        // The face plane R/2 short of the ball's centre, the face axis R/2 beyond the disc's edge: the ball's
        // cross-section in the face plane (radius √3·R/2) overlaps the disc while its centre projects outside it.
        const start = {
            position: vec3(-R / 2 - TEST_HEAD.length / 2, -(TEST_HEAD.radius + R / 2), 1),
            orientation: IDENTITY,
            velocity: vec3(1, 0, 0),
            angularVelocity: ZERO,
        };
        const run = integrate(isolated({ start, balls: [freeBall("blue", vec3(0, 0, 1))] }), { cap: 5e-3 });
        expect(run.events.filter((e) => e.kind === "impact-off-face")).toHaveLength(1);
        expect(run.peakPenetration["face/blue"]).toBeUndefined();
        expect(run.events.some((e) => e.kind === "impact-cap")).toBe(true);
    });

    it("flags a head that goes below the turf plane once", () => {
        const start = {
            position: vec3(0, 0, TEST_HEAD.radius + 1e-4),
            orientation: IDENTITY,
            velocity: vec3(0, 0, -1),
            angularVelocity: ZERO,
        };
        const run = integrate(isolated({ start }), { cap: 2e-3 });
        const grounded = run.events.filter((e) => e.kind === "impact-mallet-grounded");
        expect(grounded).toHaveLength(1);
        // The lowest point crosses z = 0 at 1e-4 s; the event is raised at the end of the step that crosses it.
        expect((grounded[0] as { t: number }).t).toBeCloseTo(1e-4, 4);
    });

    it("is bit-identical when repeated", () => {
        const start = {
            position: vec3(-R - 1e-4 - TEST_HEAD.length / 2, 0.003, 1),
            orientation: IDENTITY,
            velocity: vec3(2, 0.1, -0.2),
            angularVelocity: vec3(0, 3, 1),
        };
        const setup = isolated({ start, gravity: 9.80665, balls: [freeBall("blue", vec3(0, 0, 1))] });
        expect(integrate(setup)).toStrictEqual(integrate(setup));
    });
});

describe("the bed in the impact", () => {
    it("raises turf-lift once, when a ball rising out of the bed lets go of its last cell", () => {
        const run = integrate(
            isolated({
                gravity: STANDARD_GRAVITY,
                balls: [freeBall("blue", vec3(0, 0, R), vec3(0, 0, -3), testBed())],
            }),
            { cap: 20e-3 },
        );
        const lifts = run.events.filter((e) => e.kind === "turf-lift");
        expect(lifts).toHaveLength(1);
        expect(run.balls.blue?.velocity.z as number).toBeGreaterThan(0);
    });

    it("flags impact-turf-pit for a ball ending pressed more than 1 mm into the bed, and not otherwise", () => {
        // Driven down at 3 m/s and cut off by the cap 2 ms in, the ball is still deep in its pit; at rest at its
        // sink (about 0.3 mm) it is not.
        const deep = integrate(
            isolated({
                gravity: STANDARD_GRAVITY,
                balls: [freeBall("blue", vec3(0, 0, R), vec3(0, 0, -3), testBed())],
            }),
            { cap: 2e-3 },
        );
        expect(deep.events.some((e) => e.kind === "impact-turf-pit")).toBe(true);
        const sink = staticSink(0, 0, R, TEST_BALL.mass * STANDARD_GRAVITY, testBed());
        const resting = integrate(
            isolated({ gravity: STANDARD_GRAVITY, balls: [freeBall("blue", vec3(0, 0, R - sink), ZERO, testBed())] }),
            { cap: 2e-3 },
        );
        expect(resting.events.some((e) => e.kind === "impact-turf-pit")).toBe(false);
        expect(TURF_PIT_DEPTH).toBe(1e-3);
    });

    it("throws a RangeError when two balls holding cells come within a cell of each other's footprint", () => {
        // Two balls pressed 7 mm in (footprints about 25 mm) with centres 40 mm apart overlap the guard's reach.
        const balls = [
            freeBall("blue", vec3(0, 0, R - 7e-3), ZERO, testBed()),
            freeBall("red", vec3(0.04, 0, R - 7e-3), ZERO, testBed()),
        ];
        expect(() => integrate(isolated({ gravity: STANDARD_GRAVITY, balls }), { cap: 1e-4 })).toThrow(RangeError);
    });

    it("starts two touching balls on the bed with no guard (review focus 2)", () => {
        const world = testWorld();
        const result = simulateImpact(
            strike(ballAt(5, 0).position, { speed: 3 }),
            {
                blue: ballAt(5, 0),
                red: ballAt(5 + 2 * R, 0),
            },
            world,
        );
        expect(result.handover.red?.velocity.x as number).toBeGreaterThan(0);
    });
});
