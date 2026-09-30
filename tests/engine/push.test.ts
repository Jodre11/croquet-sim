import { describe, expect, it } from "vitest";
import { ZERO, dot, normalize, sub, vec3, type Vec3 } from "../../src/engine/math/vec3";
import { classify, contactSlip, rollingSpin } from "../../src/engine/motion";
import {
    DIRECTION_TOLERANCE,
    RESTING_SPEED,
    freeAcceleration,
    pushDuration,
    pushedState,
    pushedTrajectory,
    solveRestingContacts,
    type ContactBody,
} from "../../src/engine/push";
import type { BallState, MotionParams } from "../../src/engine/types";
import { kineticEnergy } from "./support/energy";
import { rng } from "./support/rng";

const R = 0.046;
const SLIDE = 3;
const ROLL = 0.5;
const P: MotionParams = { radius: R, slidingDecel: SLIDE, rollingDecel: ROLL };
const BALL = { radius: R, mass: 0.454 };

function ball(x: number, y: number, velocity: Vec3 = ZERO, angularVelocity: Vec3 = ZERO): ContactBody {
    return { state: { position: vec3(x, y, R), velocity, angularVelocity }, params: P };
}

function rolling(x: number, y: number, velocity: Vec3): ContactBody {
    return ball(x, y, velocity, rollingSpin(velocity, 0, R));
}

const PAIR = [{ a: 0, b: 1, fixed: false }];

describe("solveRestingContacts", () => {
    it("pushes a resting ball with a ball driven by topspin (analytic case)", () => {
        // Blue has no velocity but topspin Ω, so its slip is −RΩ and friction drives it forward at SLIDE. Red resists
        // statically, then rolls (effective inertia 7m/5, rolling resistance ROLL). Common acceleration:
        // A = (SLIDE − (7/5)·ROLL) / (1 + 7/5) = (5·SLIDE − 7·ROLL) / 12.
        const omega = 60;
        const { members, coupled, arrested } = solveRestingContacts(
            [ball(0, 0, ZERO, vec3(0, omega, 0)), ball(2 * R, 0)],
            [],
            PAIR,
        );
        const A = (5 * SLIDE - 7 * ROLL) / 12;
        expect(coupled).toEqual([true]);
        expect(arrested).toEqual([false, false]);
        const blue = members[0];
        const red = members[1];
        expect(blue?.phase).toBe("sliding");
        expect(red?.phase).toBe("rolling");
        expect(blue?.push?.acceleration.x).toBeCloseTo(A, 12);
        expect(red?.push?.acceleration.x).toBeCloseTo(A, 12);
        expect(blue?.push?.acceleration.y).toBeCloseTo(0, 15);
        // Equal and opposite contact force, N = m·(SLIDE − A) on blue = (7m/5)·(A + ROLL) on red, and compressive.
        const n = SLIDE - A;
        expect(n).toBeGreaterThan(0);
        expect(n).toBeCloseTo((7 / 5) * (A + ROLL), 12);
        // Blue's slip −RΩ decays at A + (5/2)·SLIDE; the push ends when it reaches zero.
        const end = pushDuration(blue?.state as BallState, "sliding", blue?.push as never, R);
        expect(end).toBeCloseTo((R * omega) / (A + 2.5 * SLIDE), 12);
        expect(pushDuration(red?.state as BallState, "rolling", red?.push as never, R)).toBe(Infinity);
        const atEnd = pushedState(blue?.state as BallState, blue?.push as never, end);
        expect(Math.abs(contactSlip(atEnd, R).x)).toBeLessThan(1e-12);
    });

    it("holds a resting ball that the push cannot move", () => {
        // Drive 0.5 m/s² is below the static resistance (7/5)·0.49 of the ball in front.
        const weak: MotionParams = { radius: R, slidingDecel: 0.5, rollingDecel: 0.49 };
        const { members, coupled } = solveRestingContacts(
            [
                { state: ball(0, 0, ZERO, vec3(0, 60, 0)).state, params: weak },
                { state: ball(2 * R, 0).state, params: weak },
            ],
            [],
            PAIR,
        );
        expect(coupled).toEqual([true]);
        expect(members[1]?.phase).toBe("stationary");
        expect(members[1]?.push?.acceleration).toEqual(ZERO);
        expect(members[0]?.push?.acceleration.x).toBeCloseTo(0, 15);
    });

    it("gives a pushed rolling ball 5/7 of the push (effective inertia 7m/5)", () => {
        // Blue slides forward with topspin (free acceleration +SLIDE); red rolls ahead at the same speed (−ROLL).
        const v = vec3(0.5, 0, 0);
        const { members, coupled } = solveRestingContacts(
            [ball(0, 0, v, vec3(0, 40, 0)), rolling(2 * R, 0, v)],
            [],
            PAIR,
        );
        const A = (SLIDE - (7 / 5) * ROLL) / (1 + 7 / 5);
        expect(coupled).toEqual([true]);
        expect(members[0]?.push?.acceleration.x).toBeCloseTo(A, 12);
        expect(members[1]?.push?.acceleration.x).toBeCloseTo(A, 12);
    });

    it("releases balls whose accelerations separate them", () => {
        // Blue brakes hard (sliding, no spin); red ahead only rolls to a stop.
        const v = vec3(0.5, 0, 0);
        const { members, coupled } = solveRestingContacts([ball(0, 0, v), rolling(2 * R, 0, v)], [], PAIR);
        expect(coupled).toEqual([false]);
        expect(members).toEqual([null, null]);
    });

    it("makes the normal speeds equal on a slow approach, keeps rolling balls rolling and loses energy", () => {
        const a = rolling(0, 0, vec3(0.5 + RESTING_SPEED / 2, 0.1, 0));
        const b = rolling(2 * R, 0, vec3(0.5, -0.2, 0));
        const { members } = solveRestingContacts([a, b], [], PAIR);
        const sa = members[0]?.state as BallState;
        const sb = members[1]?.state as BallState;
        expect(sa.velocity.x).toBeCloseTo(sb.velocity.x, 15);
        expect(sa.velocity.y).toBe(0.1);
        expect(sb.velocity.y).toBe(-0.2);
        expect(classify(sa, R)).toBe("rolling");
        expect(classify(sb, R)).toBe("rolling");
        const before = kineticEnergy(a.state, BALL) + kineticEnergy(b.state, BALL);
        expect(kineticEnergy(sa, BALL) + kineticEnergy(sb, BALL)).toBeLessThanOrEqual(before);
    });

    it("holds a ball driven against an upright", () => {
        const axis = vec3(R + 0.008, 0, 0);
        const { members, coupled } = solveRestingContacts(
            [ball(0, 0, ZERO, vec3(0, 60, 0))],
            [axis],
            [{ a: 0, b: 0, fixed: true }],
        );
        expect(coupled).toEqual([true]);
        expect(members[0]?.push?.acceleration.x).toBeCloseTo(0, 15);
        // The slip still decays, at (5/2)·SLIDE: the ball spins down against the upright.
        const end = pushDuration(members[0]?.state as BallState, "sliding", members[0]?.push as never, R);
        expect(end).toBeCloseTo((R * 60) / (2.5 * SLIDE), 12);
    });

    it("solves a ball driven into two touching balls at an angle (wedge, three bodies)", () => {
        const c = Math.sqrt(3) / 2;
        const bodies = [ball(0, 0, ZERO, vec3(0, 60, 0)), ball(2 * R * c, -R), ball(2 * R * c, R)];
        const contacts = [
            { a: 0, b: 1, fixed: false },
            { a: 0, b: 2, fixed: false },
            { a: 1, b: 2, fixed: false },
        ];
        const { members, coupled, arrested } = solveRestingContacts(bodies, [], contacts);
        expect(arrested).toEqual([false, false, false]);
        expect(coupled).toEqual([true, true, false]);
        const x = members.map((m) => m?.push?.acceleration ?? ZERO);
        const normal = (i: number, j: number): Vec3 =>
            normalize(sub(bodies[j]?.state.position as Vec3, bodies[i]?.state.position as Vec3));
        // Coupled contacts do not converge or open; the red–black contact opens.
        expect(dot(sub(x[0] as Vec3, x[1] as Vec3), normal(0, 1))).toBeCloseTo(0, 12);
        expect(dot(sub(x[0] as Vec3, x[2] as Vec3), normal(0, 2))).toBeCloseTo(0, 12);
        expect(dot(sub(x[1] as Vec3, x[2] as Vec3), normal(1, 2))).toBeLessThan(0);
        // The set-up is symmetric about the x axis, and so is the solution.
        expect(x[1]?.x).toBeCloseTo(x[2]?.x ?? NaN, 12);
        expect(x[1]?.y).toBeCloseTo(-(x[2]?.y ?? NaN), 12);
        expect(x[0]?.x).toBeGreaterThan(0);
    });

    it("never pulls, never leaves a contact converging and balances the contact force (random pairs)", () => {
        const random = rng(17);
        let pushes = 0;
        for (let n = 0; n < 2000; n++) {
            const angle = random() * 2 * Math.PI;
            const e = vec3(Math.cos(angle), Math.sin(angle), 0);
            const v = vec3(random() * 2 - 1, random() * 2 - 1, 0);
            const closing = (random() * 2 - 1) * RESTING_SPEED;
            const spin = (): Vec3 => vec3(random() * 100 - 50, random() * 100 - 50, random() * 10 - 5);
            const a = random() < 0.5 ? ball(0, 0, v, spin()) : rolling(0, 0, v);
            const vb = sub(v, vec3(e.x * closing, e.y * closing, 0));
            const b =
                random() < 0.5 ? ball(2 * R * e.x, 2 * R * e.y, vb, spin()) : rolling(2 * R * e.x, 2 * R * e.y, vb);
            const { members, coupled } = solveRestingContacts([a, b], [], PAIR);
            const sa = members[0]?.state ?? a.state;
            const sb = members[1]?.state ?? b.state;
            const weight = (s: BallState): number => (classify(s, R) === "sliding" ? 1 : 7 / 5);
            const xa = members[0]?.push?.acceleration ?? freeAcceleration(sa, P);
            const xb = members[1]?.push?.acceleration ?? freeAcceleration(sb, P);
            const relative = dot(sub(xa, xb), e);
            if (coupled[0]) {
                pushes++;
                // N on b along e equals −N on a (effective momentum), is compressive, and holds them together.
                const nb = weight(sb) * dot(sub(xb, freeAcceleration(sb, P)), e);
                const na = weight(sa) * dot(sub(xa, freeAcceleration(sa, P)), e);
                expect(nb).toBeGreaterThanOrEqual(-1e-12);
                expect(na + nb).toBeCloseTo(0, 12);
                expect(relative).toBeCloseTo(0, 12);
            } else {
                expect(relative).toBeLessThanOrEqual(1e-9);
            }
            expect(kineticEnergy(sa, BALL) + kineticEnergy(sb, BALL)).toBeLessThanOrEqual(
                kineticEnergy(a.state, BALL) + kineticEnergy(b.state, BALL) + 1e-12,
            );
        }
        expect(pushes).toBeGreaterThan(100);
    });
});

describe("pushed motion", () => {
    it("moves with constant acceleration and matches its trajectory", () => {
        const start: BallState = { position: vec3(1, 2, R), velocity: vec3(0.5, 0, 0), angularVelocity: vec3(0, 3, 1) };
        const push = { acceleration: vec3(0.2, -0.1, 0), angularAcceleration: vec3(1, 2, 0), direction: vec3(1, 0, 0) };
        const s = pushedState(start, push, 2);
        expect(s.position.x).toBeCloseTo(1 + 0.5 * 2 + 0.1 * 4, 14);
        expect(s.position.y).toBeCloseTo(2 - 0.05 * 4, 14);
        expect(s.position.z).toBe(R);
        expect(s.angularVelocity).toEqual(vec3(2, 7, 1));
        const p = pushedTrajectory(start, push);
        expect(p.c2).toEqual(vec3(0.1, -0.05, 0));
        expect(pushedState(start, push, 0)).toBe(start);
    });

    it("ends a rolling push when the ball stops or turns past DIRECTION_TOLERANCE", () => {
        const start: BallState = { position: vec3(0, 0, R), velocity: vec3(1, 0, 0), angularVelocity: ZERO };
        const stop = { acceleration: vec3(-2, 0, 0), angularAcceleration: ZERO, direction: vec3(1, 0, 0) };
        expect(pushDuration(start, "rolling", stop, R)).toBeCloseTo(0.5, 15);
        const turn = { acceleration: vec3(0, 1, 0), angularAcceleration: ZERO, direction: vec3(1, 0, 0) };
        expect(pushDuration(start, "rolling", turn, R)).toBeCloseTo(DIRECTION_TOLERANCE, 15);
        expect(pushDuration(start, "stationary", stop, R)).toBe(Infinity);
    });
});
