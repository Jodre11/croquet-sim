import { describe, expect, it } from "vitest";
import { length, vec3 } from "../../../src/engine/math/vec3";
import { stateAtTime } from "../../../src/engine/sample";
import { ENGINE_VERSION, simulateFreeMotion } from "../../../src/engine/simulate";
import type { BallStates, World } from "../../../src/engine/types";
import { uniformLawn } from "../../../src/engine/world";
import { simulateImpact } from "../../../src/engine/impact/simulateImpact";
import type { ContactState } from "../../../src/engine/impact/types";
import { TEST_BALL, TEST_TURF, ballAt, testWorld } from "../support/fixtures";
import { drive, strike } from "../support/impact";

const R = TEST_BALL.radius;
const WORLD = testWorld();
const BLUE = ballAt(5, 0);

describe("simulateImpact", () => {
    it("is version 0.4.0", () => {
        expect(ENGINE_VERSION).toBe("0.4.0");
    });

    it("starts a centre-struck ball rolling at 5/7 of its launch speed in phase 2", () => {
        const result = simulateImpact(strike(BLUE.position), { blue: BLUE }, WORLD);
        const h = result.handover.blue;
        expect(h?.position.z).toBe(R);
        expect(h?.velocity.z).toBe(0);
        const launch = length(h?.velocity ?? vec3(0, 0, 0));
        const free = simulateFreeMotion(result.handover, WORLD);
        const rolling = free.events.find((e) => e.kind === "phase" && e.ball === "blue" && e.phase === "rolling");
        expect(rolling).toBeDefined();
        const v = length(stateAtTime(free, "blue", (rolling as { t: number }).t).velocity);
        // Turf friction during the ~1 ms impact moves a few mm/s between speed and spin; it shifts this by < 1 %.
        expect(Math.abs(v / launch - 5 / 7) / (5 / 7)).toBeLessThan(0.01);
    });

    it("hands a ball driven into the turf over airborne, and phase 2 lands it", () => {
        const result = simulateImpact(
            strike(BLUE.position, { speed: 3, descent: 0.5, pitch: 0.5 }),
            { blue: BLUE },
            WORLD,
        );
        expect(result.events.some((e) => e.kind === "turf-lift")).toBe(true);
        expect(result.handover.blue?.velocity.z).toBeGreaterThan(0);
        const free = simulateFreeMotion(result.handover, WORLD);
        expect(free.events.some((e) => e.kind === "landing" && e.ball === "blue")).toBe(true);
    });

    it("leaves a ball nobody strikes at rest", () => {
        const balls: BallStates = { blue: BLUE, yellow: ballAt(8, 3) };
        const result = simulateImpact(strike(BLUE.position), balls, WORLD);
        expect(length(result.balls.yellow?.velocity ?? vec3(1, 0, 0))).toBeLessThan(1e-9);
        expect(result.handover.yellow?.position).toEqual(vec3(8, 3, R));
        expect(result.handover.yellow?.velocity).toEqual(vec3(0, 0, 0));
    });

    it("sends both balls of a croquet stroke forward, the croqueted one faster", () => {
        const result = simulateImpact(
            strike(BLUE.position, { speed: 3 }),
            { blue: BLUE, red: ballAt(5 + 2 * R, 0) },
            WORLD,
        );
        const blue = result.handover.blue?.velocity.x as number;
        const red = result.handover.red?.velocity.x as number;
        expect(red).toBeGreaterThan(blue);
        expect(blue).toBeGreaterThan(0);
        expect(() => simulateFreeMotion(result.handover, WORLD)).not.toThrow();
    });

    it("flags a ball within reach that the head is still closing on", () => {
        // Blue is struck 30 mm off the face axis. Red sits on the axis's other side, 65 mm from it (within the reach
        // r + R = 78 mm), its centre 1.5·R in front of the face plane (within 2R), and 95 mm from blue's line, so blue
        // passes it. The head, slower than blue after the strike, is still coming on to red when the impact ends.
        const contact = strike(BLUE.position, { speed: 2, lateral: -0.03 });
        const red = ballAt(5 + 0.5 * R - 1e-3, 0.095);
        const result = simulateImpact(contact, { blue: BLUE, red }, WORLD);
        expect(result.events.filter((e) => e.kind === "impact-head-approaching")).toEqual([
            { kind: "impact-head-approaching", t: result.duration, ball: "red" },
        ]);
    });
});

describe("validation", () => {
    const ok = strike(BLUE.position);
    const cases: [string, ContactState, BallStates, World][] = [
        ["a moving ball", ok, { blue: { ...BLUE, velocity: vec3(0.1, 0, 0) } }, WORLD],
        ["a spinning ball", ok, { blue: { ...BLUE, angularVelocity: vec3(0, 1, 0) } }, WORLD],
        ["a ball off the lawn plane", ok, { blue: { ...BLUE, position: vec3(5, 0, R + 1e-3) } }, WORLD],
        ["overlapping balls", ok, { blue: BLUE, red: ballAt(5 + 2 * R - 1e-6, 0) }, WORLD],
        ["a ball touching the peg", strike(vec3(15 - 0.02 - R, 20, R)), { blue: ballAt(15 - 0.02 - R, 20) }, WORLD],
        ["the head in a ball", strike(BLUE.position, { gap: -1e-4 }), { blue: BLUE }, WORLD],
        // The head's barrel is 0.032 m from its axis (y = 0, z = R); the ball's surface reaches 1 cm into it.
        ["the head's barrel in a ball", ok, { blue: BLUE, red: ballAt(5 - R - 1e-3 - 0.115, 0.032 + R - 0.01) }, WORLD],
        // 0.5·R beyond the rear face plane and 1 cm outside its rim, so the face check sees only the rim (OFF_FACE).
        ["the head's rim in a ball", ok, { blue: BLUE, red: ballAt(5 - 1.5 * R - 1e-3 - 0.23, 0.042) }, WORLD],
        ["the head in the turf", { ...ok, position: vec3(ok.position.x, ok.position.y, 0.01) }, { blue: BLUE }, WORLD],
        ["an empty drive", { ...ok, drive: [] }, { blue: BLUE }, WORLD],
        ["a drive not starting at 0", { ...ok, drive: [{ t: 1e-4, force: vec3(0, 0, 0) }] }, { blue: BLUE }, WORLD],
        [
            "a drive not increasing",
            { ...ok, drive: [...drive(vec3(0, 0, 0), 1e-3), { t: 1e-3, force: vec3(0, 0, 0) }] },
            { blue: BLUE },
            WORLD,
        ],
        ["a non-positive head mass", { ...ok, head: { ...ok.head, mass: 0 } }, { blue: BLUE }, WORLD],
        ["a non-positive inertia", { ...ok, head: { ...ok.head, inertia: vec3(1, 0, 1) } }, { blue: BLUE }, WORLD],
        ["a non-positive head length", { ...ok, head: { ...ok.head, length: -1 } }, { blue: BLUE }, WORLD],
        ["a non-positive head radius", { ...ok, head: { ...ok.head, radius: 0 } }, { blue: BLUE }, WORLD],
        ["a non-positive contact time", { ...ok, face: { ...ok.face, contactTime: 0 } }, { blue: BLUE }, WORLD],
        ["zero face restitution", { ...ok, face: { ...ok.face, restitution: 0 } }, { blue: BLUE }, WORLD],
        ["face restitution above 1", { ...ok, face: { ...ok.face, restitution: 1.1 } }, { blue: BLUE }, WORLD],
        ["negative face friction", { ...ok, face: { ...ok.face, friction: -0.1 } }, { blue: BLUE }, WORLD],
        ["zero ball–ball restitution", ok, { blue: BLUE }, testWorld({ ballBall: { restitution: 0, friction: 0.05 } })],
        [
            "zero turf restitution",
            ok,
            { blue: BLUE },
            testWorld({
                lawn: uniformLawn(30, 40, {
                    slidingFriction: 0.3,
                    rollingResistance: 0.05,
                    ...TEST_TURF,
                    turfRestitution: 0,
                }),
            }),
        ],
        ["a non-unit orientation", { ...ok, orientation: { w: 2, x: 0, y: 0, z: 0 } }, { blue: BLUE }, WORLD],
    ];

    it.each(cases)("rejects %s", (_label, contact, balls, world) => {
        expect(() => simulateImpact(contact, balls, world)).toThrow(RangeError);
    });

    it("accepts touching balls", () => {
        expect(() => simulateImpact(ok, { blue: BLUE, red: ballAt(5 + 2 * R, 0) }, WORLD)).not.toThrow();
    });
});
