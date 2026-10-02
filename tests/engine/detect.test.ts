import { describe, expect, it } from "vitest";
import {
    CONTACT_TOLERANCE,
    approachSpeed,
    approachTime,
    boundaryCrossingTime,
    isTouching,
    normalCurvature,
    outwardDistance,
} from "../../src/engine/detect";
import { ZERO, vec3 } from "../../src/engine/math/vec3";

const R = 0.046;
const TWO_R = 2 * R;
const BOUNDS = { width: 30, length: 40 };

describe("approachTime", () => {
    it("finds a head-on contact just before the surfaces touch", () => {
        const t = approachTime(vec3(-1, 0, 0), vec3(1, 0, 0), ZERO, TWO_R, 5);
        expect(t).toBeCloseTo(1 - TWO_R, 12);
        expect(-1 + (t as number)).toBeLessThanOrEqual(-TWO_R);
    });

    it("misses when the offset exceeds the contact distance", () => {
        expect(approachTime(vec3(-1, 3 * R, 0), vec3(1, 0, 0), ZERO, TWO_R, 5)).toBeNull();
    });

    it("treats an exact tangential graze as no contact", () => {
        expect(approachTime(vec3(-1, TWO_R, 0), vec3(1, 0, 0), ZERO, TWO_R, 5)).toBeNull();
    });

    it("never returns 0: touching bodies are decided by the caller", () => {
        // Approaching at 1 m/s from touching: only the overlap safety net fires, once the overlap reaches the
        // tolerance. Separating: nothing.
        const t = approachTime(vec3(-TWO_R, 0, 0), vec3(1, 0, 0), ZERO, TWO_R, 5);
        expect(t).toBeGreaterThan(0);
        expect(t).toBeCloseTo(CONTACT_TOLERANCE, 15);
        expect(approachTime(vec3(-TWO_R, 0, 0), vec3(-1, 0, 0), ZERO, TWO_R, 5)).toBeNull();
    });

    it("catches touching bodies driven together at zero relative speed before they overlap (B3)", () => {
        // Relative velocity zero, relative acceleration 1 m/s² toward each other: the gap is −t²/2.
        const t = approachTime(vec3(-TWO_R, 0, 0), ZERO, vec3(0.5, 0, 0), TWO_R, 5);
        expect(t).toBeCloseTo(Math.sqrt(2 * CONTACT_TOLERANCE), 9);
    });

    it("does not lose a re-approach that stays inside the tolerance band (B3 regression)", () => {
        // The pathological case from the pre-flight scan: barely separating (f1 > 0) but driven together
        // (f2 < 0), so f never becomes positive. The overlap net must still fire.
        const t = approachTime(vec3(-TWO_R, 0, 0), vec3(-1.8e-8, 0, 0), vec3(1.58, 0, 0), TWO_R, 1);
        expect(t).not.toBeNull();
        expect(t as number).toBeLessThan(1e-4);
    });

    it("finds a new contact after touching bodies separate and come back", () => {
        // x(t) = −2R − t + t²/2 returns to −2R at t = 2.
        const t = approachTime(vec3(-TWO_R, 0, 0), vec3(-1, 0, 0), vec3(0.5, 0, 0), TWO_R, 5);
        expect(t).toBeCloseTo(2, 9);
    });

    it("respects the horizon", () => {
        expect(approachTime(vec3(-1, 0, 0), vec3(1, 0, 0), ZERO, TWO_R, 0.5)).toBeNull();
    });

    it("detects nothing when the mover stops short", () => {
        // Starts 1 m away at 1 m/s decelerating at 1 m/s²: stops after 0.5 m.
        expect(approachTime(vec3(-1, 0, 0), vec3(1, 0, 0), vec3(-0.5, 0, 0), TWO_R, 1)).toBeNull();
    });

    it("finds a contact on a curving path", () => {
        const t = approachTime(vec3(-0.5, -0.2, 0), vec3(1, 0, 0), vec3(0, 0.5, 0), TWO_R, 2);
        expect(t).not.toBeNull();
        const x = -0.5 + (t as number);
        const y = -0.2 + 0.5 * (t as number) * (t as number);
        expect(Math.hypot(x, y)).toBeCloseTo(TWO_R, 9);
    });

    it("measures in 3D: a ball falling on another meets it when the centres are 2R apart", () => {
        // a is 0.05 m to the side of b and 0.3 m higher, falling from rest: z(t) = 0.3 − g·t²/2.
        const g = 9.80665;
        const t = approachTime(vec3(0.05, 0, 0.3), ZERO, vec3(0, 0, -0.5 * g), TWO_R, 1);
        const height = Math.sqrt(TWO_R * TWO_R - 0.05 * 0.05);
        expect(t).toBeCloseTo(Math.sqrt((2 * (0.3 - height)) / g), 9);
    });

    it("rejects a non-finite horizon", () => {
        expect(() => approachTime(vec3(-1, 0, 0), vec3(1, 0, 0), ZERO, TWO_R, Infinity)).toThrow(RangeError);
    });
});

describe("approachSpeed and isTouching", () => {
    it("is positive when closing, negative when separating and zero for sideways motion", () => {
        expect(approachSpeed(vec3(-TWO_R, 0, 0), vec3(2, 0, 0))).toBe(2);
        expect(approachSpeed(vec3(-TWO_R, 0, 0), vec3(-2, 0, 0))).toBe(-2);
        expect(approachSpeed(vec3(-TWO_R, 0, 0), vec3(0, 3, 0))).toBe(0);
        expect(approachSpeed(ZERO, vec3(1, 0, 0))).toBe(0);
    });

    it("treats gaps up to CONTACT_TOLERANCE as touching", () => {
        expect(isTouching(vec3(TWO_R + CONTACT_TOLERANCE / 2, 0, 0), TWO_R)).toBe(true);
        expect(isTouching(vec3(TWO_R + 2 * CONTACT_TOLERANCE, 0, 0), TWO_R)).toBe(false);
        expect(isTouching(vec3(TWO_R - 0.01, 0, 0), TWO_R)).toBe(true);
    });

    it("measures offsets as given, in 3D", () => {
        // Horizontally only 0.6·2R apart, but 3D distance above 2R: not touching.
        expect(isTouching(vec3(TWO_R * 0.6, 0, TWO_R), TWO_R)).toBe(false);
        expect(approachSpeed(vec3(0, 0, TWO_R), vec3(0, 0, -1))).toBe(1);
    });

    it("gives the turning line of centres' closing rate |v_t|²/d, for either sign of the offset", () => {
        // Speed 3 across a line of length 2R, speed 4 along it: only the 3 turns it.
        const v = vec3(4, 3, 0);
        expect(normalCurvature(vec3(TWO_R, 0, 0), v)).toBeCloseTo(9 / TWO_R, 12);
        expect(normalCurvature(vec3(-TWO_R, 0, 0), v)).toBeCloseTo(9 / TWO_R, 12);
        expect(normalCurvature(vec3(0, 0, TWO_R), vec3(0, 0, -1))).toBe(0);
        expect(normalCurvature(ZERO, v)).toBe(0);
    });
});

describe("boundaries", () => {
    it("measures outward distance beyond the nearest line", () => {
        expect(outwardDistance(vec3(1, 20, R), BOUNDS)).toBeCloseTo(-1, 12);
        expect(outwardDistance(vec3(-0.2, 20, R), BOUNDS)).toBeCloseTo(0.2, 12);
        expect(outwardDistance(vec3(15, 40.5, R), BOUNDS)).toBeCloseTo(0.5, 12);
    });

    it("finds the crossing time for a threshold", () => {
        const traj = { c0: vec3(0.5, 20, R), c1: vec3(-1, 0, 0), c2: ZERO };
        expect(boundaryCrossingTime(traj, BOUNDS, 0, 5)).toBeCloseTo(0.5, 12);
        expect(boundaryCrossingTime(traj, BOUNDS, -R, 5)).toBeCloseTo(0.5 - R, 12);
        expect(boundaryCrossingTime(traj, BOUNDS, 0, 0.4)).toBeNull();
    });

    it("returns 0 when already beyond the threshold", () => {
        const traj = { c0: vec3(-0.1, 20, R), c1: ZERO, c2: ZERO };
        expect(boundaryCrossingTime(traj, BOUNDS, 0, 1)).toBe(0);
    });

    it("picks the earliest of several lines (corner)", () => {
        const traj = { c0: vec3(0.3, 0.5, R), c1: vec3(-1, -1, 0), c2: ZERO };
        expect(boundaryCrossingTime(traj, BOUNDS, 0, 5)).toBeCloseTo(0.3, 12);
    });
});
