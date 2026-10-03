import { describe, expect, it } from "vitest";
import { ZERO, add, cross, dot, length, scale, sub, vec3 } from "../../../src/engine/math/vec3";
import {
    contactTimeFactor,
    dampingRatio,
    lawFromContactTime,
    lawFromStiffness,
} from "../../../src/engine/impact/contactLaw";
import { integrate, type ImpactSnapshot } from "../../../src/engine/impact/integrate";
import { IDENTITY, axisAngle, rotate, solidCylinderInertia } from "../../../src/engine/impact/rigidBody";
import type { MalletHead } from "../../../src/engine/impact/types";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import { TEST_BALL } from "../support/fixtures";
import { TEST_FACE, TEST_HEAD, counter, faceLaw, freeBall, isolated } from "../support/impact";

const R = TEST_BALL.radius;
const M = TEST_BALL.mass;
/**
 * Relative tolerance on contact times and restitutions at dt = 1e-7 s: twice the worst measured error (pre-flight:
 * 1.43e-4, the ball–ball contact time, one step of 1e-7 s in 7e-4 s).
 */
const LAW_TOLERANCE = 3e-4;
const FINE = 1e-7;

function closedForm(massEff: number, restitution: number, stiffness: number): number {
    return contactTimeFactor(dampingRatio(restitution)) / Math.sqrt(stiffness / massEff);
}

describe("one contact of each pair", () => {
    it("face–ball: the free, undriven head strikes a free ball with the face's contact time and restitution", () => {
        const law = faceLaw({ ...TEST_FACE, friction: 0 });
        const start = {
            position: vec3(-R - 1e-4 - TEST_HEAD.length / 2, 0, 1),
            orientation: IDENTITY,
            velocity: vec3(2, 0, 0),
            angularVelocity: ZERO,
        };
        const probe = counter("face/blue");
        const run = integrate(isolated({ start, face: law, balls: [freeBall("blue", vec3(0, 0, 1))] }), {
            dt: FINE,
            probe,
        });
        expect(Math.abs(probe.closed * FINE - TEST_FACE.contactTime) / TEST_FACE.contactTime).toBeLessThan(
            LAW_TOLERANCE,
        );
        const e = ((run.balls.blue?.velocity.x as number) - run.head.velocity.x) / 2;
        expect(Math.abs(e - TEST_FACE.restitution) / TEST_FACE.restitution).toBeLessThan(LAW_TOLERANCE);
    });

    it("ball–ball: two balls head-on, no turf, no gravity, exchange velocity per e", () => {
        const e = 0.8;
        const T = 7e-4;
        const probe = counter("blue/red");
        const run = integrate(
            isolated({
                ballBall: lawFromContactTime(M / 2, e, T, 0),
                balls: [freeBall("blue", vec3(0, 0, 1), vec3(1, 0, 0)), freeBall("red", vec3(2 * R + 1e-5, 0, 1))],
            }),
            { dt: FINE, cap: 1e-3, probe },
        );
        expect(Math.abs(probe.closed * FINE - T) / T).toBeLessThan(LAW_TOLERANCE);
        expect(run.balls.blue?.velocity.x as number).toBeCloseTo((1 - e) / 2, 3);
        expect(run.balls.red?.velocity.x as number).toBeCloseTo((1 + e) / 2, 3);
    });

    // e = 0.5 below ζ = 1/√2; 0.15 between 1/√2 and 1 (the sourced turf lower bound); 0.1 overdamped.
    for (const e of [0.5, 0.15, 0.1]) {
        it(`ball–turf, e = ${e}: contact time and rebound match the clamped closed form`, () => {
            const k = 2e5;
            const probe = counter("turf/blue");
            const run = integrate(
                isolated({ balls: [freeBall("blue", vec3(0, 0, R), vec3(0, 0, -1), lawFromStiffness(M, e, k, 0))] }),
                { dt: FINE, cap: 8e-3, probe },
            );
            const T = closedForm(M, e, k);
            expect(Math.abs(probe.closed * FINE - T) / T).toBeLessThan(LAW_TOLERANCE);
            expect(Math.abs((run.balls.blue?.velocity.z as number) - e) / e).toBeLessThan(LAW_TOLERANCE);
        });
    }
});

describe("a ball dropped on the turf", () => {
    it("rebounds at the turf's restitution, gravity on", () => {
        const e = 0.5;
        const v = 5;
        let rebound = NaN;
        const probe = {
            step(s: ImpactSnapshot): void {
                const b = s.balls[0] as { position: { z: number }; velocity: { z: number } };
                if (Number.isNaN(rebound) && b.velocity.z > 0 && b.position.z >= R) {
                    rebound = b.velocity.z;
                }
            },
        };
        const run = integrate(
            isolated({
                gravity: STANDARD_GRAVITY,
                balls: [freeBall("blue", vec3(0, 0, R), vec3(0, 0, -v), lawFromStiffness(M, e, 2e5, 0.3))],
            }),
            { dt: FINE, cap: 10e-3, probe },
        );
        expect(run.events.filter((x) => x.kind === "turf-lift")).toHaveLength(1);
        // Gravity acts through the contact, and the rebound is read where the ball regains z = R (pre-flight: 2.3e-3).
        expect(Math.abs(rebound / v - e)).toBeLessThan(5e-3);
    });
});

describe("a ball on a fixed inclined face", () => {
    // A ball can roll, so its contact sticks (rolls without slip, a = 5/7·g·sinθ) while tanθ ≤ 7μ/2 and slips
    // (a = g·(sinθ − μ·cosθ)) above it. The face belongs to a head of enormous mass whose weight the drive carries,
    // applied at its centre of mass: at the usual socket the drive and gravity form a couple that, on the tilted head,
    // spins it at about 60 rad/s² whatever its mass, and the face would no longer be fixed.
    const mu = 0.2;
    const huge: MalletHead = { ...TEST_HEAD, mass: 1e9, inertia: solidCylinderInertia(1e9, 0.23, 0.032), socket: ZERO };

    function slide(theta: number): { acceleration: number; slip: number } {
        const law = lawFromContactTime((1e9 * M) / (1e9 + M), 0.8, 6e-4, mu);
        // The +x face's outward normal tilted θ from vertical, towards +x.
        const orientation = axisAngle(vec3(0, 1, 0), -(Math.PI / 2 - theta));
        const n = rotate(orientation, vec3(1, 0, 0));
        const position = vec3(0, 0, 1);
        const faceCentre = add(position, scale(n, huge.length / 2));
        const sink = (M * STANDARD_GRAVITY * Math.cos(theta)) / law.stiffness;
        const centre = add(faceCentre, scale(n, R - sink));
        const weight = vec3(0, 0, huge.mass * STANDARD_GRAVITY);
        const t = 0.02;
        const run = integrate(
            isolated({
                head: huge,
                start: { position, orientation, velocity: ZERO, angularVelocity: ZERO },
                drive: [
                    { t: 0, force: weight },
                    { t: 1, force: weight },
                ],
                face: law,
                gravity: STANDARD_GRAVITY,
                balls: [freeBall("blue", centre)],
            }),
            { cap: t },
        );
        const b = run.balls.blue as { velocity: ReturnType<typeof vec3>; angularVelocity: ReturnType<typeof vec3> };
        const down = vec3(Math.cos(theta), 0, -Math.sin(theta));
        const contactPoint = add(b.velocity, cross(b.angularVelocity, scale(n, -R)));
        const slip = length(sub(contactPoint, scale(n, dot(contactPoint, n))));
        return { acceleration: dot(b.velocity, down) / run.duration, slip };
    }

    it("sticks and rolls below tanθ = 7μ/2", () => {
        const theta = Math.atan(0.5);
        const { acceleration, slip } = slide(theta);
        const expected = (5 / 7) * STANDARD_GRAVITY * Math.sin(theta);
        // Pre-flight: 2.2e-6 relative, and slip 2.4e-7 m/s (the tangential spring's decaying ringing); the slipping
        // case below reaches 0.03 m/s.
        expect(Math.abs(acceleration - expected) / expected).toBeLessThan(1e-5);
        expect(slip).toBeLessThan(1e-6);
    });

    it("slips above tanθ = 7μ/2", () => {
        const theta = Math.atan(0.9);
        const { acceleration, slip } = slide(theta);
        const expected = STANDARD_GRAVITY * (Math.sin(theta) - mu * Math.cos(theta));
        // Pre-flight: 1.9e-3, the start-up transient while the contact first sticks.
        expect(Math.abs(acceleration - expected) / expected).toBeLessThan(4e-3);
        expect(slip).toBeGreaterThan(0.01);
    });
});

describe("a socket force on a free head", () => {
    it("pitches it with the sign and size the torque predicts", () => {
        const F = 10;
        const window = 1e-3;
        const run = integrate(
            isolated({
                start: { position: vec3(0, 0, 1), orientation: IDENTITY, velocity: ZERO, angularVelocity: ZERO },
                drive: [
                    { t: 0, force: vec3(F, 0, 0) },
                    { t: 1, force: vec3(F, 0, 0) },
                ],
            }),
            { cap: window },
        );
        // Socket (0, 0, r) × (F, 0, 0) = (0, r·F, 0): about +y, which turns the +x face down.
        const expected = (TEST_HEAD.socket.z * F * window) / TEST_HEAD.inertia.y;
        // Pre-flight: 1.2e-10, the gyroscopic and orientation terms over 200 steps.
        expect(Math.abs(run.head.angularVelocity.y - expected) / expected).toBeLessThan(3e-10);
        expect(Math.abs(run.head.velocity.x - (F * window) / TEST_HEAD.mass)).toBeLessThan(1e-12);
    });
});
