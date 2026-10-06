import { describe, expect, it } from "vitest";
import { ZERO, vec3 } from "../../../src/engine/math/vec3";
import { contactReference } from "../../../src/reference/index";
import { lawFromStiffness } from "../../../src/engine/impact/contactLaw";
import { IMPACT_DT, driveAt, integrate } from "../../../src/engine/impact/integrate";
import { IDENTITY } from "../../../src/engine/impact/rigidBody";
import { TEST_BALL } from "../support/fixtures";
import { TEST_HEAD, freeBall, isolated } from "../support/impact";

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

    it("raises turf-lift once, when a ball driven into the turf first rises back to z = R", () => {
        const setup = isolated({
            gravity: 9.80665,
            balls: [freeBall("blue", vec3(0, 0, R), vec3(0, 0, -2), lawFromStiffness(TEST_BALL.mass, 0.5, 2e5, 0.3))],
        });
        const run = integrate(setup, { cap: 20e-3 });
        expect(run.events.filter((e) => e.kind === "turf-lift")).toHaveLength(1);
    });

    it("stays open while a struck ball is still bouncing out of its hollow", () => {
        // The face strike lasts about 0.6 ms; the ball, driven 1 m/s into the turf, needs about 4 ms to leave it.
        const start = {
            position: vec3(-R - 1e-4 - TEST_HEAD.length / 2, 0, R),
            orientation: IDENTITY,
            velocity: vec3(2, 0, 0),
            angularVelocity: ZERO,
        };
        const turf = lawFromStiffness(TEST_BALL.mass, 0.5, 2e5, 0.3);
        const run = integrate(
            isolated({ start, gravity: 9.80665, balls: [freeBall("blue", vec3(0, 0, R), vec3(0, 0, -1), turf)] }),
            { cap: 20e-3 },
        );
        expect(run.events.filter((e) => e.kind === "impact-cap")).toEqual([]);
        expect(run.events.filter((e) => e.kind === "turf-lift")).toHaveLength(1);
        expect(run.balls.blue?.position.z as number).toBeGreaterThanOrEqual(R);
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
