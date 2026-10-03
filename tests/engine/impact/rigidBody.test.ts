import { describe, expect, it } from "vitest";
import { length, sub, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import {
    IDENTITY,
    angularAcceleration,
    axisAngle,
    integrateOrientation,
    multiply,
    rotate,
    rotateInverse,
    solidCylinderInertia,
    type Quaternion,
} from "../../../src/engine/impact/rigidBody";
import { rng } from "../support/rng";

function near(a: Vec3, b: Vec3, tolerance: number): boolean {
    return length(sub(a, b)) <= tolerance;
}

function randomUnit(random: () => number): Vec3 {
    const v = vec3(random() - 0.5, random() - 0.5, random() - 0.5);
    return vec3(v.x / length(v), v.y / length(v), v.z / length(v));
}

describe("rotations", () => {
    it("turns x into y a quarter turn about z", () => {
        expect(near(rotate(axisAngle(vec3(0, 0, 1), Math.PI / 2), vec3(1, 0, 0)), vec3(0, 1, 0), 1e-15)).toBe(true);
    });

    it("pitches the +x face down for a positive turn about y", () => {
        const n = rotate(axisAngle(vec3(0, 1, 0), 0.3), vec3(1, 0, 0));
        expect(near(n, vec3(Math.cos(0.3), 0, -Math.sin(0.3)), 1e-15)).toBe(true);
    });

    it("undoes a rotation with its inverse and keeps lengths", () => {
        const random = rng(17);
        for (let n = 0; n < 200; n++) {
            const q = axisAngle(randomUnit(random), (random() - 0.5) * 10);
            const v = vec3(random() - 0.5, random() - 0.5, random() - 0.5);
            expect(near(rotateInverse(q, rotate(q, v)), v, 1e-15)).toBe(true);
            expect(Math.abs(length(rotate(q, v)) - length(v))).toBeLessThan(1e-15);
        }
    });

    it("composes as b followed by a", () => {
        const a = axisAngle(vec3(0, 0, 1), 0.7);
        const b = axisAngle(vec3(1, 1, 0), -1.1);
        const v = vec3(0.3, -0.2, 0.9);
        expect(near(rotate(multiply(a, b), v), rotate(a, rotate(b, v)), 1e-15)).toBe(true);
    });

    it("leaves vectors alone under the identity", () => {
        expect(rotate(IDENTITY, vec3(1, 2, 3))).toEqual(vec3(1, 2, 3));
    });
});

describe("integrateOrientation", () => {
    it("turns by ω·t about a fixed axis", () => {
        let q: Quaternion = IDENTITY;
        for (let n = 0; n < 1000; n++) {
            q = integrateOrientation(q, vec3(0, 0, 1), 1e-3);
        }
        // Each step turns by exactly 2·atan(ω·dt/2), which falls short of ω·dt by (ω·dt)³/12: 8.3e-8 rad over 1000
        // steps.
        const turned = 1000 * 2 * Math.atan(0.5e-3);
        expect(near(rotate(q, vec3(1, 0, 0)), vec3(Math.cos(turned), Math.sin(turned), 0), 1e-12)).toBe(true);
        expect(near(rotate(q, vec3(1, 0, 0)), vec3(Math.cos(1), Math.sin(1), 0), 1e-7)).toBe(true);
    });

    it("stays a unit quaternion", () => {
        const random = rng(19);
        let q: Quaternion = IDENTITY;
        for (let n = 0; n < 10000; n++) {
            q = integrateOrientation(q, vec3(random() * 50, random() * 50, random() * 50), 1e-4);
        }
        expect(Math.abs(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z - 1)).toBeLessThan(1e-15);
    });
});

describe("angularAcceleration", () => {
    it("divides the torque by the moment of inertia about each principal axis", () => {
        expect(angularAcceleration(vec3(1, 2, 4), vec3(0, 0, 0), vec3(1, 1, 1))).toEqual(vec3(1, 0.5, 0.25));
    });

    it("carries the gyroscopic term −ω × (I·ω)", () => {
        // ω × Iω = (1, 1, 0) × (1, 2, 0) = (0, 0, 1).
        expect(angularAcceleration(vec3(1, 2, 3), vec3(1, 1, 0), vec3(0, 0, 0))).toEqual(vec3(0, 0, -1 / 3));
    });

    it("leaves spin about a principal axis unchanged without torque", () => {
        expect(angularAcceleration(vec3(1, 2, 3), vec3(0, 5, 0), vec3(0, 0, 0))).toEqual(vec3(0, 0, 0));
    });
});

describe("solidCylinderInertia", () => {
    it("gives ½·m·r² about the axis and m·(3r² + L²)/12 across it", () => {
        const i = solidCylinderInertia(1, 0.23, 0.032);
        expect(i.x).toBeCloseTo(0.5 * 0.032 * 0.032, 15);
        expect(i.y).toBeCloseTo((3 * 0.032 * 0.032 + 0.23 * 0.23) / 12, 15);
        expect(i.z).toBe(i.y);
    });
});
