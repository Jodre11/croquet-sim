import { describe, expect, it } from "vitest";
import { buildModel, type ContactGeometry, type Evaluated } from "../../src/engine/contactModel";
import { ZERO, dot, length, normalize, scale, sub, vec3, type Vec3 } from "../../src/engine/math/vec3";
import { MODE_SEARCH_LIMIT, solveGroup, type CandidateOutcome } from "../../src/engine/modeSolve";
import { classify, contactSlip, rollingSpin } from "../../src/engine/motion";
import {
    DIRECTION_TOLERANCE,
    HOLD_SLACK,
    RESTING_SPEED,
    contactSlipDuration,
    freeAcceleration,
    pushDuration,
    pushedState,
    pushedTrajectory,
    solveNearestHold,
    solveRestingContacts,
    type ContactBody,
    type RestingContact,
    type RestingSolution,
} from "../../src/engine/push";
import type { BallState, MotionParams, PushMotion } from "../../src/engine/types";
import { randomCluster, type Cluster } from "./support/clusters";
import { kineticEnergy } from "./support/energy";
import { rng } from "./support/rng";

const R = 0.046;
const G = 9.80665;
const SLIDE = 3;
const ROLL = 0.5;
const P: MotionParams = { radius: R, slidingDecel: SLIDE, rollingDecel: ROLL, gravity: G };
const BALL = { radius: R, mass: 0.454 };
const UP = vec3(0, 0, 1);
const GRAVITY = vec3(0, 0, -G);
const MU = 0.05;
const C30 = Math.sqrt(3) / 2;
const SLOW = Boolean(import.meta.env.SLOW_TESTS);

function body(state: BallState, params: MotionParams = P): ContactBody {
    return { state, params, turfNormal: UP, pivotCapacity: Infinity };
}

function ball(x: number, y: number, velocity: Vec3 = ZERO, angularVelocity: Vec3 = ZERO, params = P): ContactBody {
    return body({ position: vec3(x, y, R), velocity, angularVelocity }, params);
}

function rolling(x: number, y: number, velocity: Vec3, spinZ = 0): ContactBody {
    return ball(x, y, velocity, rollingSpin(velocity, spinZ, R));
}

const pair = (friction: number): RestingContact[] => [{ a: 0, b: 1, fixed: false, friction }];
const line = (friction: number): RestingContact[] => [
    { a: 0, b: 1, fixed: false, friction },
    { a: 1, b: 2, fixed: false, friction },
];

/** No fallback of any kind. */
function exact(s: RestingSolution): boolean {
    return !s.approximate.some(Boolean) && !s.approximateSlip.some(Boolean) && !s.budgetHold.some(Boolean);
}

const coupled = (s: RestingSolution): boolean[] => s.modes.map((m) => m !== "open");

describe("the frictionless limit (μ = 0): P2a.1's closed forms", () => {
    it("pushes a resting ball with a ball driven by topspin", () => {
        // Blue has no velocity but topspin Ω, so its slip is −RΩ and friction drives it forward at SLIDE. Red resists
        // statically, then rolls (effective inertia 7m/5, rolling resistance ROLL). Common acceleration:
        // A = (SLIDE − (7/5)·ROLL) / (1 + 7/5) = (5·SLIDE − 7·ROLL) / 12.
        const omega = 60;
        const s = solveRestingContacts([ball(0, 0, ZERO, vec3(0, omega, 0)), ball(2 * R, 0)], [], pair(0));
        const A = (5 * SLIDE - 7 * ROLL) / 12;
        expect(coupled(s)).toEqual([true]);
        expect(s.slips).toEqual([null]);
        expect(exact(s)).toBe(true);
        const blue = s.members[0];
        const red = s.members[1];
        expect(blue?.phase).toBe("sliding");
        expect(red?.phase).toBe("rolling");
        expect(blue?.push?.acceleration.x).toBeCloseTo(A, 12);
        expect(red?.push?.acceleration.x).toBeCloseTo(A, 12);
        expect(blue?.push?.acceleration.y).toBeCloseTo(0, 15);
        // Blue's slip −RΩ decays at A + (5/2)·SLIDE; the push ends when it reaches zero.
        const end = pushDuration(blue?.state as BallState, "sliding", blue?.push as PushMotion, R);
        expect(end).toBeCloseTo((R * omega) / (A + 2.5 * SLIDE), 12);
        expect(pushDuration(red?.state as BallState, "rolling", red?.push as PushMotion, R)).toBe(Infinity);
        const atEnd = pushedState(blue?.state as BallState, blue?.push as PushMotion, end);
        expect(Math.abs(contactSlip(atEnd, R).x)).toBeLessThan(1e-12);
    });

    it("holds a resting ball that the push cannot move", () => {
        // Drive 0.5 m/s² is below the static resistance (7/5)·0.49 of the ball in front.
        const weak: MotionParams = { radius: R, slidingDecel: 0.5, rollingDecel: 0.49, gravity: G };
        const s = solveRestingContacts(
            [ball(0, 0, ZERO, vec3(0, 60, 0), weak), ball(2 * R, 0, ZERO, ZERO, weak)],
            [],
            pair(0),
        );
        expect(coupled(s)).toEqual([true]);
        expect(s.members[1]?.phase).toBe("stationary");
        expect(s.members[1]?.push?.acceleration).toEqual(ZERO);
        expect(s.members[0]?.push?.acceleration.x).toBeCloseTo(0, 15);
    });

    it("gives a pushed rolling ball 5/7 of the push (effective inertia 7m/5)", () => {
        const v = vec3(0.5, 0, 0);
        const s = solveRestingContacts([ball(0, 0, v, vec3(0, 40, 0)), rolling(2 * R, 0, v)], [], pair(0));
        const A = (SLIDE - (7 / 5) * ROLL) / (1 + 7 / 5);
        expect(coupled(s)).toEqual([true]);
        expect(s.members[0]?.push?.acceleration.x).toBeCloseTo(A, 12);
        expect(s.members[1]?.push?.acceleration.x).toBeCloseTo(A, 12);
    });

    it("releases balls whose accelerations separate them", () => {
        const v = vec3(0.5, 0, 0);
        const s = solveRestingContacts([ball(0, 0, v), rolling(2 * R, 0, v)], [], pair(0));
        expect(coupled(s)).toEqual([false]);
        expect(s.members).toEqual([null, null]);
    });

    it("makes the normal speeds equal on a slow approach, keeps rolling balls rolling and loses energy", () => {
        const a = rolling(0, 0, vec3(0.5 + RESTING_SPEED / 2, 0.1, 0));
        const b = rolling(2 * R, 0, vec3(0.5, -0.2, 0));
        const { members } = solveRestingContacts([a, b], [], pair(0));
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
        const s = solveRestingContacts(
            [ball(0, 0, ZERO, vec3(0, 60, 0))],
            [vec3(R + 0.008, 0, 0)],
            [{ a: 0, b: 0, fixed: true, friction: 0 }],
        );
        expect(coupled(s)).toEqual([true]);
        expect(s.members[0]?.push?.acceleration.x).toBeCloseTo(0, 15);
        const end = pushDuration(s.members[0]?.state as BallState, "sliding", s.members[0]?.push as PushMotion, R);
        expect(end).toBeCloseTo((R * 60) / (2.5 * SLIDE), 12);
    });

    it("solves a ball driven into two touching balls at an angle (wedge, three bodies)", () => {
        const bodies = [ball(0, 0, ZERO, vec3(0, 60, 0)), ball(2 * R * C30, -R), ball(2 * R * C30, R)];
        const contacts: RestingContact[] = [
            { a: 0, b: 1, fixed: false, friction: 0 },
            { a: 0, b: 2, fixed: false, friction: 0 },
            { a: 1, b: 2, fixed: false, friction: 0 },
        ];
        const s = solveRestingContacts(bodies, [], contacts);
        expect(exact(s)).toBe(true);
        expect(coupled(s)).toEqual([true, true, false]);
        const x = s.members.map((m) => m?.push?.acceleration ?? ZERO);
        const normal = (i: number, j: number): Vec3 =>
            normalize(sub(bodies[j]?.state.position as Vec3, bodies[i]?.state.position as Vec3));
        expect(dot(sub(x[0] as Vec3, x[1] as Vec3), normal(0, 1))).toBeCloseTo(0, 12);
        expect(dot(sub(x[0] as Vec3, x[2] as Vec3), normal(0, 2))).toBeCloseTo(0, 12);
        expect(dot(sub(x[1] as Vec3, x[2] as Vec3), normal(1, 2))).toBeLessThan(0);
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
            const s = solveRestingContacts([a, b], [], pair(0));
            const sa = s.members[0]?.state ?? a.state;
            const sb = s.members[1]?.state ?? b.state;
            const weight = (st: BallState): number => (classify(st, R) === "sliding" ? 1 : 7 / 5);
            const xa = s.members[0]?.push?.acceleration ?? freeAcceleration(sa, P);
            const xb = s.members[1]?.push?.acceleration ?? freeAcceleration(sb, P);
            const relative = dot(sub(xa, xb), e);
            if (coupled(s)[0]) {
                pushes++;
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

describe("resting contact in flight", () => {
    // Blue, in flight and at rest, leans on red (on the turf, at rest) at 30° from the vertical: n = (−s, 0, −c) from
    // blue to red, s = sin 30°, c = cos 30°. Down-slope, blue's contact point slips along ŝ = (c, 0, −s).
    const s = 0.5;
    const c = C30;
    function lean(rollingDecel: number): ContactBody[] {
        const p: MotionParams = { radius: R, slidingDecel: SLIDE, rollingDecel, gravity: G };
        return [
            body({ position: vec3(2 * R * s, 0, R + 2 * R * c), velocity: ZERO, angularVelocity: ZERO }, p),
            body({ position: vec3(0, 0, R), velocity: ZERO, angularVelocity: ZERO }, p),
        ];
    }

    it("slides a ball in flight down a ball the turf holds, slipping on it", () => {
        // Red held. Rolling down red would need friction (2/7)·tan 30°·N > μN, so the contact slips: N = g·c and
        // x_blue = g(s − μc)·(c, 0, −s), which at μ = 0 is P2a.1's (g·s·c, 0, −g·s²). Red takes the load and holds.
        for (const mu of [0, MU]) {
            const sol = solveRestingContacts(lean(5), [], pair(mu));
            expect(exact(sol)).toBe(true);
            expect(coupled(sol)).toEqual([true]);
            expect(sol.members[0]?.phase).toBe("airborne");
            const x = sol.members[0]?.push?.acceleration as Vec3;
            expect(x.x).toBeCloseTo(G * (s - mu * c) * c, 12);
            expect(x.y).toBeCloseTo(0, 15);
            expect(x.z).toBeCloseTo(-G * (s - mu * c) * s, 12);
            expect(sol.members[1]?.phase).toBe("stationary");
            expect(sol.members[1]?.push?.acceleration).toEqual(ZERO);
        }
        expect(solveRestingContacts(lean(5), [], pair(MU)).members[0]?.push?.angularAcceleration.y).toBeCloseTo(
            23.078282679409,
            9,
        );
    });

    it("pushes the ball on the turf away when it cannot hold, its load and contact offset included", () => {
        // Red rolls along −x. Its load is g + N(c + μs) and the force acts at ê = (s, 0, c), so (spec §5)
        // 7/5·a_r = N(μ(1 + c) − s) + k(g + N(c + μs)) with k = 7/5·rollingDecel/g, and blue keeps the closing rate:
        // N = g·c + s·a_r. Hence a_r = [g·c(μ(1+c) − s) + k·g(1 + c(c + μs))]/[7/5 + s(s − μ(1+c)) − k·s(c + μs)] and
        // x_blue = (N(s − μc), 0, −g + N(c + μs)). Even at μ = 0 this differs from P2a.1, which ignored both.
        const roll = 0.5;
        const k = (1.4 * roll) / G;
        for (const mu of [0, MU]) {
            const ar =
                (G * c * (mu * (1 + c) - s) + k * G * (1 + c * (c + mu * s))) /
                (1.4 + s * (s - mu * (1 + c)) - k * s * (c + mu * s));
            const N = G * c + s * ar;
            const sol = solveRestingContacts(lean(roll), [], pair(mu));
            expect(exact(sol)).toBe(true);
            expect(sol.members[1]?.phase).toBe("rolling");
            expect(sol.members[1]?.push?.acceleration.x).toBeCloseTo(ar, 12);
            expect(sol.members[1]?.push?.acceleration.z).toBe(0);
            expect(sol.members[1]?.push?.direction.x).toBeCloseTo(-1, 12);
            const x = sol.members[0]?.push?.acceleration as Vec3;
            expect(x.x).toBeCloseTo(N * (s - mu * c), 12);
            expect(x.z).toBeCloseTo(-G + N * (c + mu * s), 12);
        }
        expect(solveRestingContacts(lean(roll), [], pair(MU)).members[1]?.push?.acceleration.x).toBeCloseTo(
            -1.4087116241113,
            12,
        );
    });
});

describe("resting chains", () => {
    // Ball 0 has topspin (drive +SLIDE along x) and touches ball 1, which touches ball 2; 1 and 2 are at rest.
    function chain(rollingDecel: number, bend = 0): ContactBody[] {
        const p: MotionParams = { radius: R, slidingDecel: SLIDE, rollingDecel, gravity: G };
        return [
            ball(0, 0, ZERO, vec3(0, 60, 0), p),
            ball(2 * R, 0, ZERO, ZERO, p),
            ball(2 * R + 2 * R * Math.cos(bend), 2 * R * Math.sin(bend), ZERO, ZERO, p),
        ];
    }

    describe("frictionless (μ = 0)", () => {
        it("holds a line of two resting balls that the push could move one at a time but not together", () => {
            // Drive 3 lies between one ball's resistance (7/5)·1.5 = 2.1 and the pair's 4.2.
            for (const bend of [0, 1e-3]) {
                const s = solveRestingContacts(chain(1.5, bend), [], line(0));
                expect(exact(s)).toBe(true);
                for (const m of s.members) {
                    expect(m?.phase ?? "stationary").not.toBe("rolling");
                    const x = m?.push?.acceleration ?? ZERO;
                    expect(Math.abs(x.x) + Math.abs(x.y)).toBeLessThan(1e-12);
                }
            }
        });

        it("pushes the line forward together when the drive beats both resistances", () => {
            const s = solveRestingContacts(chain(ROLL), [], line(0));
            const expected = (SLIDE - 2 * (7 / 5) * ROLL) / (1 + 2 * (7 / 5));
            expect(coupled(s)).toEqual([true, true]);
            for (const m of s.members) {
                expect(m?.push?.acceleration.x).toBeCloseTo(expected, 12);
                expect(m?.push?.acceleration.y).toBeCloseTo(0, 12);
            }
            expect(s.members[1]?.phase).toBe("rolling");
            expect(s.members[2]?.push?.direction.x).toBeCloseTo(1, 12);
        });

        it("holds a line bent by 30° and releases the middle ball of one bent by 60°", () => {
            const held = solveRestingContacts(chain(1.5, Math.PI / 6), [], line(0));
            expect(exact(held)).toBe(true);
            expect(held.members[1]?.phase).toBe("stationary");
            // Ball 1 slides along ball 2 perpendicular to n12:
            // a = (SLIDE·cos30° − (7/5)·ROLL₁)/((7/5)/cos30° + cos30°).
            const roll = 1.5;
            const s = solveRestingContacts(chain(roll, Math.PI / 3), [], line(0));
            expect(exact(s)).toBe(true);
            const a = (SLIDE * C30 - (7 / 5) * roll) / (7 / 5 / C30 + C30);
            expect(s.members[0]?.push?.acceleration.x).toBeCloseTo(a, 12);
            expect(s.members[1]?.phase).toBe("rolling");
            expect(s.members[1]?.push?.acceleration.y).toBeCloseTo(-a / Math.sqrt(3), 12);
            expect(s.members[2]?.phase).toBe("stationary");
        });

        it(
            "solves the line exactly across the limit of holding, deciding as the closed form does (44.3°–44.7°)",
            { timeout: 60_000 },
            () => {
                // With ball 2 at its limit λ = 2.1, ball 1's excess is |(3 − 2.1·cosθ, −2.1·sinθ)| − 2.1: zero at
                // cosθ = 9/12.6 (θ ≈ 44.4153°).
                for (let step = 0; step <= 400; step++) {
                    const theta = ((44.3 + step * 0.001) * Math.PI) / 180;
                    const s = solveRestingContacts(chain(1.5, theta), [], line(0));
                    expect(exact(s), `θ step ${step}`).toBe(true);
                    const excess = Math.hypot(3 - 2.1 * Math.cos(theta), 2.1 * Math.sin(theta)) - 2.1;
                    if (Math.abs(excess) > 1e-6) {
                        expect(s.members[1]?.phase === "stationary", `θ step ${step}`).toBe(excess < 0);
                    }
                }
            },
        );

        it("releases balls from rest only along their own frozen direction, so resistance never does work", () => {
            const random = rng(29);
            let released = 0;
            for (let n = 0; n < 1000; n++) {
                const drive = random() * 2 * Math.PI;
                const toB = drive + (random() - 0.5) * 2;
                const toC = toB + (random() - 0.5) * 2;
                const p: MotionParams = {
                    radius: R,
                    slidingDecel: SLIDE,
                    rollingDecel: 0.2 + random() * 2.3,
                    gravity: G,
                };
                const b = vec3(2 * R * Math.cos(toB), 2 * R * Math.sin(toB), R);
                const cc = vec3(b.x + 2 * R * Math.cos(toC), b.y + 2 * R * Math.sin(toC), R);
                const spin = vec3(-Math.sin(drive) * 60, Math.cos(drive) * 60, 0);
                const bodies = [
                    body({ position: vec3(0, 0, R), velocity: ZERO, angularVelocity: spin }, p),
                    body({ position: b, velocity: ZERO, angularVelocity: ZERO }, p),
                    body({ position: cc, velocity: ZERO, angularVelocity: ZERO }, p),
                ];
                const contacts = line(0);
                if (Math.hypot(cc.x, cc.y) < 2 * R + 1e-12) {
                    contacts.push({ a: 0, b: 2, fixed: false, friction: 0 });
                }
                const s = solveRestingContacts(bodies, [], contacts);
                expect(exact(s), `case ${n}`).toBe(true);
                if (contacts.length === 2) {
                    // Held, ball 0 pushes ball 1 along n01 with the part of its drive that points that way; ball 1 can
                    // lean on ball 2 only by a compression λ ∈ [0, c] along n12. It holds exactly when that load is
                    // within c of the segment {λ·n12 : 0 ≤ λ ≤ c}.
                    const cap = (7 / 5) * p.rollingDecel;
                    const n01 = normalize(vec3(b.x, b.y, 0));
                    const n12 = normalize(sub(cc, b));
                    const push = Math.max(0, dot(freeAcceleration(bodies[0]?.state as BallState, p), n01));
                    const along = Math.min(Math.max(push * dot(n01, n12), 0), cap);
                    const gap = Math.hypot(push * n01.x - along * n12.x, push * n01.y - along * n12.y) - cap;
                    if (Math.abs(gap) > 1e-6) {
                        expect((s.members[1]?.phase ?? "stationary") === "stationary", `case ${n}`).toBe(gap < 0);
                    }
                }
                for (const m of s.members.slice(1)) {
                    if (m?.push && m.phase === "rolling") {
                        released++;
                        const x = m.push.acceleration;
                        const d = m.push.direction;
                        const along = dot(x, d);
                        expect(along).toBeGreaterThan(0);
                        expect(Math.abs(x.x * d.y - x.y * d.x)).toBeLessThanOrEqual(
                            DIRECTION_TOLERANCE * along + 1e-15,
                        );
                    } else {
                        const x = m?.push?.acceleration ?? ZERO;
                        expect(Math.abs(x.x) + Math.abs(x.y)).toBeLessThan(1e-12);
                    }
                }
            }
            expect(released).toBeGreaterThan(100);
        });
    });

    describe("with friction (μ = 0.05)", () => {
        it("holds a straight line that the push could move one ball at a time", () => {
            // Blue's contact slips down on ball 1, loading it; N₀₁ = SLIDE/(1 + μ·μs) still cannot move both.
            for (const bend of [0, 1e-3]) {
                const s = solveRestingContacts(chain(1.5, bend), [], line(MU));
                expect(exact(s)).toBe(true);
                expect(s.members[1]?.phase).toBe("stationary");
                expect(s.members[2]?.phase ?? "stationary").toBe("stationary");
            }
        });

        it("pushes the line forward together, both contacts slipping vertically", () => {
            // The resting balls roll from rest, so their contact slips at 2X and cannot stick. With
            // c = (1 − μ − kμ)/(1 + μ·μs), e = (1 + μ − kμ)/(1 − μ − kμ): X = [c·μs − k(1 + e)]·g/(7/5·(1 + e) + c).
            const s = solveRestingContacts(chain(ROLL), [], line(MU));
            expect(exact(s)).toBe(true);
            expect(s.modes).toEqual(["slip", "slip"]);
            expect(s.slips[1]?.z).toBeCloseTo(-1, 12);
            for (const m of s.members) {
                expect(m?.push?.acceleration.x).toBeCloseTo(0.34085645955159, 12);
            }
        });

        it("holds a line bent by 30°", () => {
            const s = solveRestingContacts(chain(1.5, Math.PI / 6), [], line(MU));
            expect(exact(s)).toBe(true);
            expect(s.members[1]?.phase).toBe("stationary");
        });

        it("releases the middle ball of a line bent by 60°, its contact with the held end slipping sideways", () => {
            // B = [(1 − μ)(cos30° − μ/2) − kμ]/(1 + μ·μs), a = (B·SLIDE − k·g)/(7/(5·cos30°) + B), x₁ = (a, −a·tan30°).
            // Ball 2 takes N₁₂·√(1 + μ²) = 1.3604 of resistance, within 2.1.
            const s = solveRestingContacts(chain(1.5, Math.PI / 3), [], line(MU));
            expect(exact(s)).toBe(true);
            expect(s.members[1]?.phase).toBe("rolling");
            expect(s.members[1]?.push?.acceleration.x).toBeCloseTo(0.095769964237268, 12);
            expect(s.members[1]?.push?.acceleration.y).toBeCloseTo(-0.055292814632668, 12);
            expect(s.members[1]?.push?.direction.x).toBeCloseTo(C30, 9);
            expect(s.members[2]?.phase).toBe("stationary");
            expect(s.slips[1]?.x).toBeCloseTo(C30, 9);
            expect(s.slips[1]?.y).toBeCloseTo(-0.5, 9);
        });
    });
});

describe("friction on a push (design §6)", () => {
    it("pushes a resting ball with a ball driven by topspin: the generalised closed form", () => {
        // Contact slip −R(ω_a + ω_b)·ẑ points down, so kinetic friction μN lifts blue and loads red: L = g ∓ μN.
        // Blue: A = μs(g − μN) − N; red rolls: 7/5·A = N(1 − μ) − k(g + μN). Hence A = (c·μs − k)·g/(7/5 + c),
        // c = (1 − μ − kμ)/(1 + μ·μs). Blue's slip ends at T = R·Ω₀/(A + 5/2·[μs·g + μN(1 − μs)]), before the contact
        // slip would (at 0.40704 s).
        const s = solveRestingContacts([ball(0, 0, ZERO, vec3(0, 60, 0)), ball(2 * R, 0)], [], pair(MU));
        expect(exact(s)).toBe(true);
        expect(s.modes).toEqual(["slip"]);
        expect(s.slips[0]).toEqual(vec3(0, 0, -1));
        const blue = s.members[0];
        const red = s.members[1];
        expect(blue?.push?.acceleration.x).toBeCloseTo(0.89895492703632, 12);
        expect(red?.push?.acceleration.x).toBeCloseTo(0.89895492703632, 12);
        expect(blue?.push?.angularAcceleration.y).toBeCloseTo(-166.9465607446, 9);
        const T = pushDuration(blue?.state as BallState, "sliding", blue?.push as PushMotion, R);
        expect(T).toBeCloseTo(0.32173469194794, 12);
        const slipEnd = contactSlipDuration(
            blue?.state as BallState,
            blue?.push as PushMotion,
            red?.state as BallState,
            red?.push as PushMotion,
            vec3(1, 0, 0),
            s.slips[0] as Vec3,
            R,
        );
        expect(slipEnd).toBeCloseTo(0.40704441282875, 12);
    });

    it("gives a pushed rolling ball the same push as one at rest", () => {
        const v = vec3(0.5, 0, 0);
        const s = solveRestingContacts([ball(0, 0, v, vec3(0, 40, 0)), rolling(2 * R, 0, v)], [], pair(MU));
        expect(exact(s)).toBe(true);
        expect(s.members[0]?.push?.acceleration.x).toBeCloseTo(0.89895492703632, 12);
        expect(s.members[1]?.push?.acceleration.x).toBeCloseTo(0.89895492703632, 12);
    });

    it("holds a ball driven against an upright, which friction lifts, until both its slips end together", () => {
        // Upright friction μu·N lifts the ball (L = g − μu·N), so N = SLIDE/(1 + μu·μs). The turf slip and the contact
        // slip are both −R·ω_y while the ball is still: both end at T = 2R·Ω(1 + μu·μs)/(5·SLIDE·(1 + μu)).
        const s = solveRestingContacts(
            [ball(0, 0, ZERO, vec3(0, 60, 0))],
            [vec3(R + 0.008, 0, 0)],
            [{ a: 0, b: 0, fixed: true, friction: 0.1 }],
        );
        expect(exact(s)).toBe(true);
        const m = s.members[0];
        expect(m?.push?.acceleration.x).toBeCloseTo(0, 14);
        const T = pushDuration(m?.state as BallState, "sliding", m?.push as PushMotion, R);
        expect(T).toBeCloseTo(0.3447796972648, 12);
        const slipEnd = contactSlipDuration(
            m?.state as BallState,
            m?.push as PushMotion,
            null,
            null,
            vec3(1, 0, 0),
            s.slips[0] as Vec3,
            R,
        );
        expect(slipEnd).toBeCloseTo(T, 12);
    });

    it("still holds a resting ball that the push cannot move", () => {
        // N = SLIDE/(1 + μ·μs); red needs N(1 − μ) = 0.4738 of its resistance k·(g + μN) = 0.6877.
        const weak: MotionParams = { radius: R, slidingDecel: 0.5, rollingDecel: 0.49, gravity: G };
        const s = solveRestingContacts(
            [ball(0, 0, ZERO, vec3(0, 60, 0), weak), ball(2 * R, 0, ZERO, ZERO, weak)],
            [],
            pair(MU),
        );
        expect(exact(s)).toBe(true);
        expect(s.members[1]?.phase).toBe("stationary");
    });

    it("lifts a ball off the turf when friction takes its load", () => {
        // Blue (topspin) and red (stronger backspin) drive into each other; the contact slips up on red. With μ = 4,
        // μ·μs > 1: on the turf red's load would be negative, so red is solved airborne and rises at
        // 2g(μ·μs − 1)/(2 − μ·μs).
        const s = solveRestingContacts(
            [ball(0, 0, ZERO, vec3(0, 60, 0)), ball(2 * R, 0, ZERO, vec3(0, -80, 0))],
            [],
            pair(4),
        );
        expect(exact(s)).toBe(true);
        expect(s.members[1]?.phase).toBe("airborne");
        expect(s.members[1]?.state.position.z).toBe(R);
        expect(s.members[1]?.push?.acceleration.z).toBeCloseTo(5.6504842256315, 12);
    });

    it("locks spin about the vertical axis while a ball rolls, and lets friction change it while it slides", () => {
        // Sidespin makes the contact slip sideways, so its friction torques both balls about the vertical. The rolling
        // ball's patch grips; the sliding ball's does not.
        const v = vec3(0.5, 0, 0);
        const s = solveRestingContacts([ball(0, 0, v, vec3(0, 40, 10)), rolling(2 * R, 0, v, 20)], [], pair(MU));
        expect(exact(s)).toBe(true);
        expect(s.members[0]?.phase).toBe("sliding");
        expect(s.members[1]?.phase).toBe("rolling");
        expect(s.members[1]?.push?.angularAcceleration.z).toBe(0);
        expect(Math.abs(s.members[0]?.push?.angularAcceleration.z ?? 0)).toBeGreaterThan(1);
    });

    it("reports approximate-slip when a direction solve fails, slipping against the stuck force", () => {
        const p: MotionParams = { radius: R, slidingDecel: SLIDE, rollingDecel: 5, gravity: G };
        const bodies = [
            body({ position: vec3(R, 0, R + 2 * R * C30), velocity: ZERO, angularVelocity: ZERO }, p),
            body({ position: vec3(0, 0, R), velocity: ZERO, angularVelocity: ZERO }, p),
        ];
        const s = solveRestingContacts(bodies, [], pair(MU), { hooks: { failDirections: true } });
        expect(s.approximateSlip).toEqual([true, true]);
        expect(s.approximate).toEqual([false, false]);
        expect(Number.isFinite(s.slipExcess)).toBe(true);
        expect(s.slips[0]?.x).toBeCloseTo(C30, 9);
    });

    it("holds every group, solving nothing, once the budget is spent", () => {
        const s = solveRestingContacts([ball(0, 0, ZERO, vec3(0, 60, 0)), ball(2 * R, 0)], [], pair(MU), {
            budget: 0,
        });
        expect(s.budgetHold).toEqual([true, true]);
        expect(s.approximate).toEqual([false, false]);
        expect(s.holdExcess).toBe(0);
        expect(s.work).toBe(0);
        expect(s.members[1]?.phase).toBe("stationary");
    });
});

describe("limits of holding with friction (design §6)", () => {
    // Each sweep straddles a closed-form limit; outside a band of 1e-7 (radians, or relative), at least ten times
    // HOLD_SLACK's effect on the limit, the solver decides as the closed form does, and never falls back.
    const OFFSETS = [-1e-3, -1e-4, -1e-5, -1e-6, -1e-7, 1e-7, 1e-6, 1e-5, 1e-4, 1e-3];
    const held = (s: RestingSolution): boolean => s.members[1]?.phase === "stationary";

    it("holds the bent line up to θ* = 52.3717420825° (ball 1 at capacity, the 1–2 contact on its cone edge)", () => {
        const limit = (52.3717420825 * Math.PI) / 180;
        for (const offset of OFFSETS) {
            const theta = limit + offset;
            const p: MotionParams = { radius: R, slidingDecel: SLIDE, rollingDecel: 1.5, gravity: G };
            const bodies = [
                ball(0, 0, ZERO, vec3(0, 60, 0), p),
                ball(2 * R, 0, ZERO, ZERO, p),
                ball(2 * R + 2 * R * Math.cos(theta), 2 * R * Math.sin(theta), ZERO, ZERO, p),
            ];
            const s = solveRestingContacts(bodies, [], line(MU));
            expect(exact(s), `offset ${offset}`).toBe(true);
            expect(held(s), `offset ${offset}`).toBe(offset < 0);
        }
    });

    it("holds the wedge for rollingDecel above rollingDecel* = 1.1234083693595", () => {
        // A topspin pusher at rest into two touching balls at ±30°: N(1 − μ) ≤ 7/5·μr·(g + μN) with
        // N = μs·g/(2(cos 30° + μ·μs)), μs = 0.3.
        const limit = 1.1234083693595;
        for (const offset of OFFSETS) {
            const p: MotionParams = {
                radius: R,
                slidingDecel: 0.3 * G,
                rollingDecel: limit * (1 + offset),
                gravity: G,
            };
            const bodies = [
                ball(0, 0, ZERO, vec3(0, 60, 0), p),
                ball(2 * R * C30, -R, ZERO, ZERO, p),
                ball(2 * R * C30, R, ZERO, ZERO, p),
            ];
            const contacts: RestingContact[] = [
                { a: 0, b: 1, fixed: false, friction: MU },
                { a: 0, b: 2, fixed: false, friction: MU },
                { a: 1, b: 2, fixed: false, friction: MU },
            ];
            const s = solveRestingContacts(bodies, [], contacts);
            expect(exact(s), `offset ${offset}`).toBe(true);
            expect(held(s), `offset ${offset}`).toBe(offset > 0);
        }
    });

    it("holds a ball pushed against an upright up to β* = 20.447782900°", () => {
        // A topspin pusher drives red into an upright (radius 8 mm, μ 0.1) standing at angle β round red, in the
        // standard world's turf (μs 0.3, μr 0.05). The hold limit maximises the upright's stuck friction direction
        // (closed form in the planning ledger); the release onset is lower (20.290321024°), and holding first decides.
        const limit = (20.4477829 * Math.PI) / 180;
        const p: MotionParams = { radius: R, slidingDecel: 0.3 * G, rollingDecel: 0.05 * G, gravity: G };
        for (const offset of OFFSETS) {
            const beta = limit + offset;
            const axis = vec3(2 * R + (R + 0.008) * Math.cos(beta), (R + 0.008) * Math.sin(beta), 0);
            const s = solveRestingContacts(
                [ball(0, 0, ZERO, vec3(0, 60, 0), p), ball(2 * R, 0, ZERO, ZERO, p)],
                [axis],
                [
                    { a: 0, b: 1, fixed: false, friction: MU },
                    { a: 1, b: 0, fixed: true, friction: 0.1 },
                ],
            );
            expect(exact(s), `offset ${offset}`).toBe(true);
            expect(held(s), `offset ${offset}`).toBe(offset < 0);
        }
    });

    it("lets the hold-first candidate stand within NEAR_HOLD_SLACK once the search fails, and not beyond", () => {
        // Measured past θ*: holding is within HOLD_SLACK up to θ* + 5.6e-9 rad, and within NEAR_HOLD_SLACK only from
        // 5.7e-9 to 6.4e-9 rad (past that the 1–2 contact leaves its cone); 1e-6 rad past, holding misses that cone by
        // about 8.9e-7 m/s². With every direction solve failing no release is consistent, so the search ends with
        // nothing and only the first is held exactly (design §4 step 7).
        const limit = (52.3717420825 * Math.PI) / 180;
        const p: MotionParams = { radius: R, slidingDecel: SLIDE, rollingDecel: 1.5, gravity: G };
        const solve = (theta: number): RestingSolution =>
            solveRestingContacts(
                [
                    ball(0, 0, ZERO, vec3(0, 60, 0), p),
                    ball(2 * R, 0, ZERO, ZERO, p),
                    ball(2 * R + 2 * R * Math.cos(theta), 2 * R * Math.sin(theta), ZERO, ZERO, p),
                ],
                [],
                line(MU),
                { hooks: { failDirections: true } },
            );
        const sliver = solve(limit + 6.0e-9);
        expect(exact(sliver)).toBe(true);
        expect(held(sliver)).toBe(true);
        expect(exact(solve(limit + 1e-6))).toBe(false);
    });

    it("takes the upright its held ball touches before a fallback stands", () => {
        // Red cannot hold the pusher alone, and with every direction solve failing it cannot be released either, so
        // the pair falls back holding red. The upright straight behind red never converges while red is held; only
        // widening the group to every contact of its held balls finds the exact hold against it.
        const p: MotionParams = { radius: R, slidingDecel: 0.3 * G, rollingDecel: 0.05 * G, gravity: G };
        const s = solveRestingContacts(
            [ball(0, 0, ZERO, vec3(0, 60, 0), p), ball(2 * R, 0, ZERO, ZERO, p)],
            [vec3(3 * R + 0.008, 0, 0)],
            [
                { a: 0, b: 1, fixed: false, friction: MU },
                { a: 1, b: 0, fixed: true, friction: 0.1 },
            ],
            { hooks: { failDirections: true } },
        );
        expect(exact(s)).toBe(true);
        expect(held(s)).toBe(true);
        expect(s.modes[1]).not.toBe("open");
    });
});

describe("random clusters with friction", () => {
    const CLUSTERS = SLOW ? 20_000 : 200;

    it(
        // Unbudgeted: it checks the search, not the work budget, which 144 of 20,000 clusters exceed (design §5).
        `solves ${CLUSTERS} random four-ball clusters with obstacles exactly, well within the search cap`,
        { timeout: SLOW ? 3_600_000 : 120_000 },
        () => {
            const random = rng(43);
            let worst = 0;
            for (let made = 0; made < CLUSTERS;) {
                const c = randomCluster(random);
                if (!c) {
                    continue;
                }
                made++;
                const s = solveRestingContacts(c.bodies, c.axes, c.contacts);
                expect(exact(s), `cluster ${made}: ${c.label}`).toBe(true);
                worst = Math.max(worst, s.searched);
            }
            expect(worst).toBeLessThan(MODE_SEARCH_LIMIT);
        },
    );

    it(
        "never pulls, keeps friction in its cone and against the slip, and never adds energy",
        { timeout: 60_000 },
        () => {
            const random = rng(47);
            for (let made = 0; made < 150;) {
                const c = randomCluster(random);
                if (!c) {
                    continue;
                }
                made++;
                const model = buildModel(c.bodies, c.axes, c.contacts, GRAVITY);
                const g = solveGroup(model, { units: 0 }, Infinity);
                expect(g.kind, c.label).toBe("exact");
                const out = g.outcome as CandidateOutcome;
                const ev = out.ev as Evaluated;
                c.contacts.forEach((k, q) => {
                    if (out.cand.contacts[q] === "open") {
                        return;
                    }
                    const geometry = model.geometry[q] as ContactGeometry;
                    const P = ev.force[q] as Vec3;
                    const N = dot(P, geometry.n);
                    const T = sub(P, scale(geometry.n, N));
                    expect(N, c.label).toBeGreaterThanOrEqual(-1e-9);
                    expect(length(T), c.label).toBeLessThanOrEqual(k.friction * N + 1e-9);
                    // T acts on b; a's contact point slips (or starts to slip) along `slip` relative to b's, so
                    // T·slip ≥ 0 means friction opposes the slip and does no positive work.
                    const slip = geometry.slipping ? geometry.slip : (ev.relative[q] as Vec3);
                    expect(dot(T, slip), c.label).toBeGreaterThanOrEqual(-1e-9);
                });
                let power = 0;
                c.bodies.forEach((b, i) => {
                    power +=
                        dot(b.state.velocity, ev.accel[i] as Vec3) +
                        0.4 * R * R * dot(b.state.angularVelocity, ev.spin[i] as Vec3);
                });
                expect(power, c.label).toBeLessThanOrEqual(1e-9);
            }
        },
    );

    it("mirrors a mirrored cluster and is bit-identical across runs", () => {
        const random = rng(53);
        const mirror = (c: Cluster): Cluster => ({
            ...c,
            bodies: c.bodies.map((b) => ({
                ...b,
                state: {
                    position: vec3(b.state.position.x, -b.state.position.y, b.state.position.z),
                    velocity: vec3(b.state.velocity.x, -b.state.velocity.y, b.state.velocity.z),
                    // Reflecting y flips the pseudovector's x and z components.
                    angularVelocity: vec3(
                        -b.state.angularVelocity.x,
                        b.state.angularVelocity.y,
                        -b.state.angularVelocity.z,
                    ),
                },
            })),
            axes: c.axes.map((a) => vec3(a.x, -a.y, a.z)),
        });
        for (let made = 0; made < 40;) {
            const c = randomCluster(random);
            if (!c) {
                continue;
            }
            made++;
            const a = solveRestingContacts(c.bodies, c.axes, c.contacts);
            expect(solveRestingContacts(c.bodies, c.axes, c.contacts)).toStrictEqual(a);
            const m = mirror(c);
            const b = solveRestingContacts(m.bodies, m.axes, m.contacts);
            expect(b.modes, c.label).toEqual(a.modes);
            a.members.forEach((member, i) => {
                expect(b.members[i]?.phase, c.label).toBe(member?.phase);
                const xa = member?.push?.acceleration ?? ZERO;
                const xb = b.members[i]?.push?.acceleration ?? ZERO;
                expect(xb.x, c.label).toBeCloseTo(xa.x, 9);
                expect(xb.y, c.label).toBeCloseTo(-xa.y, 9);
            });
        }
    });
});

describe("clusters at the limit of holding (μ = 0, P2a.1's fixtures)", () => {
    // Ball 0 is driven by topspin `spin` into resting balls; uprights of radius UPRIGHT stand at `axes`.
    const UPRIGHT = 0.01;
    interface Fixture {
        readonly bodies: ContactBody[];
        readonly axes: Vec3[];
        readonly contacts: RestingContact[];
    }
    function cluster(
        positions: readonly (readonly [number, number])[],
        axes: readonly (readonly [number, number])[],
        spin: Vec3,
        roll: number,
    ): Fixture {
        const p: MotionParams = { radius: R, slidingDecel: SLIDE, rollingDecel: roll, gravity: G };
        const bodies = positions.map(([x, y], i) => ball(x, y, ZERO, i === 0 ? spin : ZERO, p));
        const uprights = axes.map(([x, y]) => vec3(x, y, 0));
        const contacts: RestingContact[] = [];
        positions.forEach(([xa, ya], a) => {
            positions.forEach(([xb, yb], b) => {
                if (b > a && Math.hypot(xb - xa, yb - ya) < 2 * R + 1e-9) {
                    contacts.push({ a, b, fixed: false, friction: 0 });
                }
            });
            uprights.forEach((u, k) => {
                if (Math.hypot(u.x - xa, u.y - ya) < R + UPRIGHT + 1e-9) {
                    contacts.push({ a, b: k, fixed: true, friction: 0 });
                }
            });
        });
        return { bodies, axes: uprights, contacts };
    }

    // What every solution must satisfy: the driver never pushed backwards; balls released from rest move along their
    // frozen resistance, and held balls stay put; no contact left converging and coupled contacts kept closed; and
    // kinetic energy, spin included, never rising.
    function expectSound(c: Fixture, s: RestingSolution, label: string): void {
        expect(s.holdExcess, label).toBeGreaterThanOrEqual(0);
        const x = c.bodies.map((b, i) => s.members[i]?.push?.acceleration ?? freeAcceleration(b.state, b.params));
        const drive = freeAcceleration(c.bodies[0]?.state as BallState, c.bodies[0]?.params as MotionParams);
        expect(dot(x[0] as Vec3, drive), label).toBeGreaterThanOrEqual(-1e-12);
        c.bodies.slice(1).forEach((_, j) => {
            const m = s.members[j + 1];
            const xi = x[j + 1] as Vec3;
            if (m?.phase === "rolling") {
                const d = m.push?.direction as Vec3;
                const along = dot(xi, d);
                expect(along, label).toBeGreaterThan(0);
                expect(Math.abs(xi.x * d.y - xi.y * d.x), label).toBeLessThanOrEqual(DIRECTION_TOLERANCE * along);
            } else {
                expect(Math.abs(xi.x) + Math.abs(xi.y), label).toBeLessThan(1e-12);
            }
        });
        c.contacts.forEach((k, n) => {
            const a = c.bodies[k.a]?.state.position as Vec3;
            const centre = k.fixed ? (c.axes[k.b] as Vec3) : (c.bodies[k.b]?.state.position as Vec3);
            const normal = normalize(vec3(centre.x - a.x, centre.y - a.y, 0));
            const closing = dot(sub(x[k.a] as Vec3, k.fixed ? ZERO : (x[k.b] as Vec3)), normal);
            expect(closing, `${label} contact ${n}`).toBeLessThanOrEqual(1e-9);
            if (s.modes[n] !== "open") {
                expect(Math.abs(closing), `${label} contact ${n}`).toBeLessThanOrEqual(1e-9);
            }
        });
        const energy = (t: number): number =>
            c.bodies.reduce((sum, b, i) => {
                const m = s.members[i];
                return sum + kineticEnergy(m?.push ? pushedState(m.state, m.push, t) : b.state, BALL);
            }, 0);
        for (const t of [1e-4, 1e-3, 1e-2]) {
            expect(energy(t), label).toBeLessThanOrEqual(energy(0) + 1e-12);
        }
    }

    // A triangle 1-2-3 against an upright, and a bent chain 0-1-2: before P2a.1's exact release solve both were
    // arrested near their limits of holding. Robustness, not arithmetic, is asserted: exact and sound.
    const TRIANGLE = {
        positions: [
            [0, 0],
            [0.09161267455944855, -0.008433140581335576],
            [0.17656861236453797, -0.04373878647059491],
            [0.16466622969910946, 0.047488036815572995],
        ] as const,
        axes: [[0.203653596203564, -0.0927531073415373]] as const,
        spin: vec3(14.017717263720547, 58.33955435820873, 0),
    };
    const BENT = {
        positions: [
            [0, 0],
            [0.08022471315813423, 0.045033269908980454],
            [0.16880420327012668, 0.02018022318429436],
        ] as const,
        axes: [] as const,
        spin: vec3(-21.362101956587257, 56.06835649451811, 0),
    };

    it("solves the triangle held against an upright and the bent chain exactly near their limits", () => {
        for (const roll of [0.6312, 0.635, 0.64]) {
            const c = cluster(TRIANGLE.positions, TRIANGLE.axes, TRIANGLE.spin, roll);
            const s = solveRestingContacts(c.bodies, c.axes, c.contacts);
            expectSound(c, s, `triangle roll ${roll}`);
            expect(exact(s), `triangle roll ${roll}`).toBe(true);
        }
        for (const roll of [1.4982518, 1.4982522, 1.4982528]) {
            const c = cluster(BENT.positions, BENT.axes, BENT.spin, roll);
            const s = solveRestingContacts(c.bodies, c.axes, c.contacts);
            expectSound(c, s, `bent roll ${roll}`);
            expect(exact(s), `bent roll ${roll}`).toBe(true);
        }
    });

    // Random 3–4-ball clusters: a driver touching ball 1, then balls touching a random resting ball or nestling against
    // two touching ones, and an optional upright beside a resting ball.
    function randomFixture(random: () => number, roll: number): Fixture | null {
        const positions: [number, number][] = [[0, 0]];
        const first = (random() - 0.5) * 1.2;
        positions.push([2 * R * Math.cos(first), 2 * R * Math.sin(first)]);
        const extra = 1 + Math.floor(random() * 2);
        for (let n = 0; n < extra; n++) {
            const i = 1 + Math.floor(random() * (positions.length - 1));
            const [xi, yi] = positions[i] as [number, number];
            const partners = positions
                .map((_, j) => j)
                .filter(
                    (j) =>
                        j > 0 &&
                        j !== i &&
                        Math.hypot((positions[j]?.[0] ?? 0) - xi, (positions[j]?.[1] ?? 0) - yi) < 2 * R + 1e-9,
                );
            let angle = (random() - 0.5) * 2 * Math.PI;
            if (partners.length > 0 && random() < 0.6) {
                const [xj, yj] = positions[partners[Math.floor(random() * partners.length)] as number] as [
                    number,
                    number,
                ];
                angle = Math.atan2(yj - yi, xj - xi) + (random() < 0.5 ? Math.PI / 3 : -Math.PI / 3);
            }
            const q: [number, number] = [xi + 2 * R * Math.cos(angle), yi + 2 * R * Math.sin(angle)];
            if (positions.some(([x, y]) => Math.hypot(x - q[0], y - q[1]) < 2 * R - 1e-9)) {
                return null;
            }
            positions.push(q);
        }
        const axes: [number, number][] = [];
        if (random() < 0.5) {
            const who = 1 + Math.floor(random() * (positions.length - 1));
            const angle = (random() - 0.5) * 2 * Math.PI;
            const [xw, yw] = positions[who] as [number, number];
            const axis: [number, number] = [xw + (R + UPRIGHT) * Math.cos(angle), yw + (R + UPRIGHT) * Math.sin(angle)];
            if (positions.some(([x, y], i) => i !== who && Math.hypot(x - axis[0], y - axis[1]) < R + UPRIGHT - 1e-9)) {
                return null;
            }
            axes.push(axis);
        }
        const drive = (random() - 0.5) * 1.0;
        return cluster(positions, axes, vec3(-Math.sin(drive) * 60, Math.cos(drive) * 60, 0), roll);
    }

    it("neither arrests nor falls back on either side of any limit of holding", { timeout: 120_000 }, () => {
        const random = rng(11);
        let solves = 0;
        let limits = 0;
        for (let made = 0; made < 16;) {
            const shape = randomFixture(random, 1);
            if (!shape) {
                continue;
            }
            made++;
            const solve = (roll: number): RestingSolution => {
                const bodies = shape.bodies.map((b) => ({ ...b, params: { ...b.params, rollingDecel: roll } }));
                const c = { ...shape, bodies };
                const s = solveRestingContacts(c.bodies, c.axes, c.contacts);
                solves++;
                expect(exact(s), `cluster ${made} roll ${roll}`).toBe(true);
                expectSound(c, s, `cluster ${made} roll ${roll}`);
                return s;
            };
            const phases = (s: RestingSolution): string => s.members.map((m) => m?.phase ?? "-").join();
            // Scan rollingDecel, bisect every change of phase down to rounding, then probe either side of it.
            let low = 0.2;
            let before = phases(solve(low));
            for (let k = 1; k <= 20; k++) {
                const high = 0.2 + (2.3 * k) / 20;
                const after = phases(solve(high));
                if (after !== before) {
                    limits++;
                    let lo = low;
                    let hi = high;
                    for (let n = 0; n < 50; n++) {
                        const mid = (lo + hi) / 2;
                        if (phases(solve(mid)) === before) {
                            lo = mid;
                        } else {
                            hi = mid;
                        }
                    }
                    for (let e = 3; e <= 12; e++) {
                        solve(lo - Math.pow(10, -e));
                        solve(hi + Math.pow(10, -e));
                    }
                }
                before = after;
                low = high;
            }
        }
        expect(limits).toBeGreaterThan(10);
        expect(solves).toBeGreaterThan(2000);
    });

    it("keeps the nearest-hold fallback sound and its hold excess honest", () => {
        const random = rng(5);
        let moved = 0;
        let released = 0;
        let held = 0;
        for (let made = 0; made < 300;) {
            const c = randomFixture(random, 0.2 + random() * 2.3);
            if (!c) {
                continue;
            }
            made++;
            const s = solveNearestHold(c.bodies, c.axes, c.contacts);
            expectSound(c, s, `cluster ${made}`);
            expect(s.approximate.every((a, i) => a || s.members[i] === null)).toBe(true);
            for (const m of s.members.slice(1)) {
                expect(m?.phase ?? "stationary").toBe("stationary");
            }
            // Gauss's principle with the driver the only moving ball: w·|x − f|² ≤ w·|f|², so x·f ≥ ½·|x|².
            const x = s.members[0]?.push?.acceleration ?? ZERO;
            const f = freeAcceleration(c.bodies[0]?.state as BallState, c.bodies[0]?.params as MotionParams);
            expect(dot(x, f)).toBeGreaterThanOrEqual(0.5 * dot(x, x) - 1e-12);
            moved += dot(x, x) > 0 ? 1 : 0;
            // Where the exact solve releases a ball, holding every resting ball is infeasible, so the excess is
            // positive.
            const exactSolution = solveRestingContacts(c.bodies, c.axes, c.contacts);
            if (exactSolution.members.slice(1).some((m) => m?.phase === "rolling")) {
                released++;
                expect(s.holdExcess, `cluster ${made}`).toBeGreaterThan(0);
            }
            held += s.holdExcess <= HOLD_SLACK ? 1 : 0;
        }
        expect(moved).toBeGreaterThan(100);
        expect(released).toBeGreaterThan(30);
        expect(held).toBeGreaterThan(30);
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

    it("ends a slipping contact when its slip stops or turns past DIRECTION_TOLERANCE", () => {
        // A ball sliding past an obstacle: the contact slip is its velocity along ŷ (normal x̂), slowing at 2 m/s².
        const start: BallState = { position: vec3(0, 0, R), velocity: vec3(0, 1, 0), angularVelocity: ZERO };
        const stop = { acceleration: vec3(0, -2, 0), angularAcceleration: ZERO, direction: ZERO };
        const n = vec3(1, 0, 0);
        expect(contactSlipDuration(start, stop, null, null, n, vec3(0, 1, 0), R)).toBeCloseTo(0.5, 15);
        const turn = { acceleration: vec3(0, 0, 1), angularAcceleration: ZERO, direction: ZERO };
        expect(contactSlipDuration(start, turn, null, null, n, vec3(0, 1, 0), R)).toBeCloseTo(DIRECTION_TOLERANCE, 15);
        const grow = { acceleration: vec3(0, 1, 0), angularAcceleration: ZERO, direction: ZERO };
        expect(contactSlipDuration(start, grow, null, null, n, vec3(0, 1, 0), R)).toBe(Infinity);
    });
});
