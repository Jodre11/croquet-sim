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

describe("resting chains", () => {
    // Ball 0 has topspin (drive +SLIDE along x) and touches ball 1, which touches ball 2; 1 and 2 are at rest.
    // Each resting ball resists up to (7/5)·rollingDecel on its own, so the line of two resists 2·(7/5)·rollingDecel.
    function chain(rollingDecel: number, bend = 0): ContactBody[] {
        const p: MotionParams = { radius: R, slidingDecel: SLIDE, rollingDecel };
        const at = (x: number, y: number, w: Vec3 = ZERO): ContactBody => ({
            state: { position: vec3(x, y, R), velocity: ZERO, angularVelocity: w },
            params: p,
        });
        return [at(0, 0, vec3(0, 60, 0)), at(2 * R, 0), at(2 * R + 2 * R * Math.cos(bend), 2 * R * Math.sin(bend))];
    }
    const LINE = [
        { a: 0, b: 1, fixed: false },
        { a: 1, b: 2, fixed: false },
    ];

    it("holds a line of two resting balls that the push could move one at a time but not together", () => {
        // Drive 3 lies between one ball's resistance (7/5)·1.5 = 2.1 and the pair's 4.2.
        for (const bend of [0, 1e-3]) {
            const { members, arrested } = solveRestingContacts(chain(1.5, bend), [], LINE);
            expect(arrested).toEqual([false, false, false]);
            for (const m of members) {
                expect(m?.phase ?? "stationary").not.toBe("rolling");
                const x = m?.push?.acceleration ?? ZERO;
                expect(Math.abs(x.x) + Math.abs(x.y)).toBeLessThan(1e-12);
            }
        }
    });

    it("pushes the line forward together when the drive beats both resistances", () => {
        // All three share one acceleration X with Σ wᵢ·(X − fᵢ) = 0: the pusher has w = 1, f = +SLIDE; each resting
        // ball starts rolling with w = 7/5, f = −ROLL. So X = (SLIDE − 2·(7/5)·ROLL) / (1 + 2·(7/5)).
        const { members, coupled } = solveRestingContacts(chain(ROLL), [], LINE);
        const expected = (SLIDE - 2 * (7 / 5) * ROLL) / (1 + 2 * (7 / 5));
        expect(coupled).toEqual([true, true]);
        for (const m of members) {
            expect(m?.push?.acceleration.x).toBeCloseTo(expected, 12);
            expect(m?.push?.acceleration.y).toBeCloseTo(0, 12);
        }
        expect(members[1]?.phase).toBe("rolling");
        expect(members[2]?.push?.direction).toEqual(vec3(1, 0, 0));
    });

    it("releases balls from rest only along their own frozen direction, so resistance never does work (random)", () => {
        const random = rng(29);
        let released = 0;
        for (let n = 0; n < 1000; n++) {
            const drive = random() * 2 * Math.PI;
            const toB = drive + (random() - 0.5) * 2;
            const toC = toB + (random() - 0.5) * 2;
            const p: MotionParams = { radius: R, slidingDecel: SLIDE, rollingDecel: 0.2 + random() * 2.3 };
            const b = vec3(2 * R * Math.cos(toB), 2 * R * Math.sin(toB), R);
            const c = vec3(b.x + 2 * R * Math.cos(toC), b.y + 2 * R * Math.sin(toC), R);
            const spin = vec3(-Math.sin(drive) * 60, Math.cos(drive) * 60, 0);
            const bodies: ContactBody[] = [
                { state: { position: vec3(0, 0, R), velocity: ZERO, angularVelocity: spin }, params: p },
                { state: { position: b, velocity: ZERO, angularVelocity: ZERO }, params: p },
                { state: { position: c, velocity: ZERO, angularVelocity: ZERO }, params: p },
            ];
            const contacts = [...LINE];
            if (Math.hypot(c.x, c.y) < 2 * R + 1e-12) {
                contacts.push({ a: 0, b: 2, fixed: false });
            }
            const { members } = solveRestingContacts(bodies, [], contacts);
            // With no ball held, contact forces are internal: Σ wᵢ·(xᵢ − fᵢ) = 0, where a released ball's resistance
            // fᵢ = −rollingDecel·dᵢ acts along its reported frozen direction. This fails if the direction reported is
            // not the one the accelerations were solved with.
            const held = members.some((m) => m?.push && m.phase === "stationary");
            if (!held) {
                let net = ZERO;
                for (const m of members) {
                    if (!m?.push) {
                        continue;
                    }
                    const fromRest = m.phase === "rolling" && dot(m.state.velocity, m.state.velocity) === 0;
                    const f = fromRest
                        ? vec3(-p.rollingDecel * m.push.direction.x, -p.rollingDecel * m.push.direction.y, 0)
                        : freeAcceleration(m.state, p);
                    const w = m.phase === "sliding" ? 1 : 7 / 5;
                    net = vec3(net.x + w * (m.push.acceleration.x - f.x), net.y + w * (m.push.acceleration.y - f.y), 0);
                }
                expect(Math.abs(net.x) + Math.abs(net.y)).toBeLessThan(1e-9);
            }
            for (const m of members.slice(1)) {
                if (m?.push && m.phase === "rolling") {
                    released++;
                    const x = m.push.acceleration;
                    const d = m.push.direction;
                    const along = dot(x, d);
                    // Rolling resistance −rollingDecel·d does power −rollingDecel·(d·v) with v = x·t: never positive.
                    expect(along).toBeGreaterThan(0);
                    expect(Math.abs(x.x * d.y - x.y * d.x)).toBeLessThanOrEqual(DIRECTION_TOLERANCE * along + 1e-15);
                } else {
                    const x = m?.push?.acceleration ?? ZERO;
                    expect(Math.abs(x.x) + Math.abs(x.y)).toBeLessThan(1e-12);
                }
            }
        }
        expect(released).toBeGreaterThan(100);
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
