import { describe, expect, it } from "vitest";
import { ZERO, length, sub, vec3 } from "../../../src/engine/math/vec3";
import {
    OFF_FACE,
    ballBallContact,
    faceContact,
    headClosing,
    headLowestPoint,
    pairContact,
    pairList,
    pointVelocity,
    turfContact,
    type Penetration,
} from "../../../src/engine/impact/contacts";
import { IDENTITY, axisAngle } from "../../../src/engine/impact/rigidBody";
import type { HeadState, MalletHead } from "../../../src/engine/impact/types";
import type { BallState } from "../../../src/engine/types";

const R = 0.046;
const HEAD: MalletHead = { mass: 1, inertia: vec3(1, 1, 1), length: 0.2, radius: 0.03, socket: vec3(0, 0, 0.03) };

/** The head at rest with its +x face centred at the origin's left, facing +x. */
function headAt(x: number, velocity = ZERO): HeadState {
    return { position: vec3(x - 0.1, 0, 0.1), orientation: IDENTITY, velocity, angularVelocity: ZERO };
}

describe("pairList", () => {
    it("orders face–ball, then ball–ball, then ball–turf, each in ball order", () => {
        const keys = pairList(["blue", "red", "yellow"], [true, false, true]).map((p) => p.key);
        expect(keys).toEqual([
            "face/blue",
            "face/red",
            "face/yellow",
            "blue/red",
            "blue/yellow",
            "red/yellow",
            "turf/blue",
            "turf/yellow",
        ]);
    });
});

describe("faceContact", () => {
    it("measures a centred ball's penetration along the face normal", () => {
        const c = faceContact(headAt(0), HEAD, vec3(R - 1e-4, 0, 0.1), R) as Penetration;
        expect(c.normal).toEqual(vec3(1, 0, 0));
        expect(c.depth).toBeCloseTo(1e-4, 15);
        expect(c.point.x).toBeCloseTo(-5e-5, 15);
    });

    it("forms no contact with a ball short of the face", () => {
        expect(faceContact(headAt(0), HEAD, vec3(R + 1e-4, 0, 0.1), R)).toBeNull();
    });

    it("uses the back face too", () => {
        const back = faceContact(headAt(0), HEAD, vec3(-0.2 - R + 1e-4, 0, 0.1), R) as Penetration;
        expect(back.normal.x).toBeCloseTo(-1, 15);
        expect(back.depth).toBeCloseTo(1e-4, 12);
    });

    it("turns a ball beyond the disc but touching the rim into OFF_FACE", () => {
        // 1 mm into the face plane the ball's cross-section has radius √(R² − (R − 1e-3)²) ≈ 9.5 mm.
        expect(faceContact(headAt(0), HEAD, vec3(R - 1e-3, 0.03 + 0.005, 0.1), R)).toBe(OFF_FACE);
        expect(faceContact(headAt(0), HEAD, vec3(R - 1e-3, 0.03 + 0.01, 0.1), R)).toBeNull();
        expect(faceContact(headAt(0), HEAD, vec3(R - 1e-3, 0.03 + R, 0.1), R)).toBeNull();
    });

    it("follows the head's orientation", () => {
        const q = axisAngle(vec3(0, 0, 1), Math.PI / 2);
        const state: HeadState = {
            position: vec3(0, -0.1, 0.1),
            orientation: q,
            velocity: ZERO,
            angularVelocity: ZERO,
        };
        const c = faceContact(state, HEAD, vec3(0, R - 1e-4, 0.1), R) as Penetration;
        expect(length(sub(c.normal, vec3(0, 1, 0)))).toBeLessThan(1e-15);
        expect(c.depth).toBeCloseTo(1e-4, 12);
    });
});

describe("ball and turf contacts", () => {
    it("closes two balls closer than 2R along the line of centres", () => {
        const c = ballBallContact(vec3(0, 0, R), vec3(2 * R - 1e-5, 0, R), R) as Penetration;
        expect(c.normal).toEqual(vec3(1, 0, 0));
        expect(c.depth).toBeCloseTo(1e-5, 15);
        expect(ballBallContact(vec3(0, 0, R), vec3(2 * R, 0, R), R)).toBeNull();
    });

    it("rejects coincident ball centres, which have no normal", () => {
        expect(() => ballBallContact(vec3(1, 2, R), vec3(1, 2, R), R)).toThrow(RangeError);
    });

    it("closes the turf while z < R, whatever the velocity", () => {
        const c = turfContact(vec3(1, 2, R - 2e-5), R) as Penetration;
        expect(c.normal).toEqual(vec3(0, 0, 1));
        expect(c.depth).toBeCloseTo(2e-5, 15);
        expect(turfContact(vec3(1, 2, R), R)).toBeNull();
    });
});

describe("pairContact", () => {
    it("routes each pair kind to its leaf contact with the right bodies", () => {
        // Blue touches the face, red and the turf; red is clear of the face.
        const state: HeadState = { ...headAt(0), position: vec3(-0.1, 0, R - 2e-5) };
        const balls: BallState[] = [
            { position: vec3(R - 1e-4, 0, R - 2e-5), velocity: ZERO, angularVelocity: ZERO },
            { position: vec3(3 * R - 2e-4, 0, R - 1e-5), velocity: ZERO, angularVelocity: ZERO },
        ];
        const [p0, p1] = [balls[0] as BallState, balls[1] as BallState];
        const pairs = pairList(["blue", "red"], [true, true]);
        const byKey = Object.fromEntries(pairs.map((p) => [p.key, pairContact(p, state, HEAD, balls, R)]));
        expect(byKey).toEqual({
            "face/blue": faceContact(state, HEAD, p0.position, R),
            "face/red": faceContact(state, HEAD, p1.position, R),
            "blue/red": ballBallContact(p0.position, p1.position, R),
            "turf/blue": turfContact(p0.position, R),
            "turf/red": turfContact(p1.position, R),
        });
        expect(byKey["face/blue"]).not.toBeNull();
        expect(byKey["blue/red"]).not.toBeNull();
        expect(byKey["turf/red"]).not.toBeNull();
    });
});

describe("head geometry", () => {
    it("finds the lowest point of a level and of a tilted head", () => {
        expect(headLowestPoint(headAt(0), HEAD)).toBeCloseTo(0.07, 15);
        const tilted: HeadState = { ...headAt(0), orientation: axisAngle(vec3(0, 1, 0), 0.5) };
        const az = Math.sin(0.5);
        expect(headLowestPoint(tilted, HEAD)).toBeCloseTo(0.1 - 0.1 * az - 0.03 * Math.cos(0.5), 12);
    });

    it("gives a point's velocity on a spinning body", () => {
        expect(pointVelocity(ZERO, vec3(1, 0, 0), vec3(0, 0, 2), vec3(0, 1, 0))).toEqual(vec3(-1, 0, 0));
    });
});

describe("headClosing", () => {
    const ball = (x: number, vx: number): BallState => ({
        position: vec3(x, 0, 0.1),
        velocity: vec3(vx, 0, 0),
        angularVelocity: ZERO,
    });

    it("flags a ball just ahead that the face is catching", () => {
        expect(headClosing(headAt(0, vec3(2, 0, 0)), HEAD, ball(R + 1e-3, 1), R)).toBe(true);
    });

    it("does not flag a ball moving away faster than the face", () => {
        expect(headClosing(headAt(0, vec3(2, 0, 0)), HEAD, ball(R + 1e-3, 3), R)).toBe(false);
    });

    it("ignores a ball a metre ahead", () => {
        expect(headClosing(headAt(0, vec3(2, 0, 0)), HEAD, ball(1, 0), R)).toBe(false);
    });

    it("ignores a ball behind the back face", () => {
        expect(headClosing(headAt(0, vec3(2, 0, 0)), HEAD, ball(-0.2 - R - 1e-3, 0), R)).toBe(false);
    });
});
