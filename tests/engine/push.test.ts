import { describe, expect, it } from "vitest";
import { ZERO, dot, normalize, sub, vec3, type Vec3 } from "../../src/engine/math/vec3";
import { classify, contactSlip, rollingSpin } from "../../src/engine/motion";
import {
    DIRECTION_TOLERANCE,
    HOLD_SLACK,
    RESTING_SPEED,
    freeAcceleration,
    holdCertificate,
    pushDuration,
    pushedState,
    pushedTrajectory,
    solveNearestHold,
    solveRestingContacts,
    type ContactBody,
    type RestingContact,
    type RestingSolution,
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

    it("holds a bent line only when the contact between the resting balls can carry the load (30° holds)", () => {
        // Ball 1 takes load 3 along x; leaning on ball 2 at 30° it can shed up to 2.1 along n12, leaving
        // |(3 − 2.1·cos30°, −2.1·sin30°)| = 1.58 ≤ 2.1.
        const { members, arrested } = solveRestingContacts(chain(1.5, Math.PI / 6), [], LINE);
        expect(arrested).toEqual([false, false, false]);
        for (const m of members) {
            const x = m?.push?.acceleration ?? ZERO;
            expect(Math.abs(x.x) + Math.abs(x.y)).toBeLessThan(1e-12);
        }
        expect(members[1]?.phase).toBe("stationary");
    });

    it("releases the middle ball of a line bent by 60°, which its neighbour cannot hold", () => {
        // Best case for holding: ball 1's load 3·x̂ less a compression along n12 (60°) leaves 3·sin60° = 2.6 > 2.1.
        // Ball 2 stays held; ball 1 slides along it, perpendicular to n12, i.e. along d = (cos30°, −sin30°). With
        // ball 0's acceleration a along x: x₁ = (a, −a·tan30°), so |x₁| = a / cos30°. Along d, ball 1's equation is
        // (7/5)·(|x₁| + ROLL₁) = N·cos30° with N = SLIDE − a on ball 0. Hence
        // a = (SLIDE·cos30° − (7/5)·ROLL₁) / ((7/5)/cos30° + cos30°), and ball 2 takes N·cos60° ≤ 2.1.
        const roll = 1.5;
        const { members, coupled, arrested } = solveRestingContacts(chain(roll, Math.PI / 3), [], LINE);
        expect(arrested).toEqual([false, false, false]);
        const cos30 = Math.sqrt(3) / 2;
        const a = (SLIDE * cos30 - (7 / 5) * roll) / (7 / 5 / cos30 + cos30);
        expect(coupled).toEqual([true, true]);
        expect(members[0]?.push?.acceleration.x).toBeCloseTo(a, 12);
        expect(members[1]?.phase).toBe("rolling");
        expect(members[1]?.push?.acceleration.x).toBeCloseTo(a, 12);
        expect(members[1]?.push?.acceleration.y).toBeCloseTo(-a / Math.sqrt(3), 12);
        expect(members[1]?.push?.direction.x).toBeCloseTo(cos30, 9);
        expect(members[1]?.push?.direction.y).toBeCloseTo(-0.5, 9);
        expect(members[2]?.phase).toBe("stationary");
        expect((SLIDE - a) * 0.5).toBeLessThanOrEqual((7 / 5) * roll);
    });

    it("never arrests the line across the limit of holding, and decides as the closed form does (44.3°–44.7°)", () => {
        // With ball 2 at its limit λ = 2.1, ball 1's excess is |(3 − 2.1·cosθ, −2.1·sinθ)| − 2.1, which is zero at
        // cosθ = 9/12.6 (θ ≈ 44.4153°). Beyond it both resting balls start to move, very slowly at first.
        for (let step = 0; step <= 400; step++) {
            const theta = ((44.3 + step * 0.001) * Math.PI) / 180;
            const { members, arrested } = solveRestingContacts(chain(1.5, theta), [], LINE);
            expect(arrested, `θ step ${step}`).toEqual([false, false, false]);
            const excess = Math.hypot(3 - 2.1 * Math.cos(theta), 2.1 * Math.sin(theta)) - 2.1;
            if (Math.abs(excess) > 1e-6) {
                expect(members[1]?.phase === "stationary", `θ step ${step}`).toBe(excess < 0);
            }
        }
    });

    it("gives a hold certificate whose compressions keep every ball within its resistance", () => {
        const n = vec3(Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), 0);
        const certificate = holdCertificate([vec3(3, 0, 0), ZERO], [2.1, 2.1], [{ a: 0, b: 1, normal: n }], []);
        expect(certificate).not.toBeNull();
        const lambda = (certificate as number[])[0] as number;
        expect(lambda).toBeGreaterThanOrEqual(0);
        expect(Math.hypot(3 - lambda * n.x, -lambda * n.y)).toBeLessThanOrEqual(2.1 + HOLD_SLACK);
        expect(lambda).toBeLessThanOrEqual(2.1 + HOLD_SLACK);
        const bent = vec3(0.5, Math.sqrt(3) / 2, 0);
        expect(holdCertificate([vec3(3, 0, 0), ZERO], [2.1, 2.1], [{ a: 0, b: 1, normal: bent }], [])).toBeNull();
        // An obstacle behind the pushed ball takes the whole load in compression.
        expect(holdCertificate([vec3(3, 0, 0)], [0.1], [], [{ ball: 0, into: vec3(1, 0, 0) }])).not.toBeNull();
        // It cannot pull: an obstacle on the other side does not help.
        expect(holdCertificate([vec3(3, 0, 0)], [0.1], [], [{ ball: 0, into: vec3(-1, 0, 0) }])).toBeNull();
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
            const { members, arrested } = solveRestingContacts(bodies, [], contacts);
            expect(arrested, `case ${n}`).toEqual([false, false, false]);
            if (contacts.length === 2) {
                // Brute-force cross-check of the hold decision. Held, ball 0 pushes ball 1 along n01 with the part of
                // its drive that points that way; ball 1 can lean on ball 2 only by a compression λ ∈ [0, c] along
                // n12. So ball 1 holds exactly when that load is within c of the segment {λ·n12 : 0 ≤ λ ≤ c}.
                const c = (7 / 5) * p.rollingDecel;
                const n01 = normalize(vec3(b.x, b.y, 0));
                const n12 = normalize(sub(bodies[2]?.state.position as Vec3, b));
                const push = Math.max(0, dot(freeAcceleration(bodies[0]?.state as BallState, p), n01));
                const along = Math.min(Math.max(push * dot(n01, n12), 0), c);
                const gap = Math.hypot(push * n01.x - along * n12.x, push * n01.y - along * n12.y) - c;
                if (Math.abs(gap) > 1e-6) {
                    expect((members[1]?.phase ?? "stationary") === "stationary", `case ${n}`).toBe(gap < 0);
                }
            }
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

describe("clusters at the limit of holding", () => {
    // Ball 0 is driven by topspin `spin` into resting balls; uprights of radius UPRIGHT stand at `axes`.
    const UPRIGHT = 0.01;
    interface Cluster {
        readonly bodies: ContactBody[];
        readonly axes: Vec3[];
        readonly contacts: RestingContact[];
    }
    function cluster(
        positions: readonly (readonly [number, number])[],
        axes: readonly (readonly [number, number])[],
        spin: Vec3,
        roll: number,
    ): Cluster {
        const p: MotionParams = { radius: R, slidingDecel: SLIDE, rollingDecel: roll };
        const bodies = positions.map(([x, y], i) => ({
            state: { position: vec3(x, y, R), velocity: ZERO, angularVelocity: i === 0 ? spin : ZERO },
            params: p,
        }));
        const uprights = axes.map(([x, y]) => vec3(x, y, 0));
        const contacts: RestingContact[] = [];
        positions.forEach(([xa, ya], a) => {
            positions.forEach(([xb, yb], b) => {
                if (b > a && Math.hypot(xb - xa, yb - ya) < 2 * R + 1e-9) {
                    contacts.push({ a, b, fixed: false });
                }
            });
            uprights.forEach((u, k) => {
                if (Math.hypot(u.x - xa, u.y - ya) < R + UPRIGHT + 1e-9) {
                    contacts.push({ a, b: k, fixed: true });
                }
            });
        });
        return { bodies, axes: uprights, contacts };
    }

    // Checks what every solution must satisfy: no ball's motion discarded; the driver never pushed backwards; balls
    // released from rest move along their frozen resistance (so it does no positive work), and held balls stay put;
    // no contact left converging and coupled contacts kept closed; and kinetic energy, spin included, never rising.
    function expectSound(c: Cluster, s: RestingSolution, label: string): void {
        expect(
            s.arrested.some((a) => a),
            label,
        ).toBe(false);
        const x = c.bodies.map((b, i) => s.members[i]?.push?.acceleration ?? freeAcceleration(b.state, b.params));
        const drive = freeAcceleration(c.bodies[0]?.state as BallState, c.bodies[0]?.params as MotionParams);
        const x0 = x[0] as Vec3;
        expect(dot(x0, drive), label).toBeGreaterThanOrEqual(-1e-12);
        c.bodies.slice(1).forEach((_, j) => {
            const m = s.members[j + 1];
            const xi = x[j + 1] as Vec3;
            if (m?.phase === "rolling") {
                const d = m.push?.direction as Vec3;
                const along = dot(xi, d);
                expect(along, label).toBeGreaterThan(0);
                expect(Math.abs(xi.x * d.y - xi.y * d.x), label).toBeLessThanOrEqual(DIRECTION_TOLERANCE * along);
            } else {
                expect(Math.abs(xi.x) + Math.abs(xi.y), label).toBe(0);
            }
        });
        c.contacts.forEach((k, n) => {
            const a = c.bodies[k.a]?.state.position as Vec3;
            const centre = k.fixed ? (c.axes[k.b] as Vec3) : (c.bodies[k.b]?.state.position as Vec3);
            const normal = normalize(vec3(centre.x - a.x, centre.y - a.y, 0));
            const closing = dot(sub(x[k.a] as Vec3, k.fixed ? ZERO : (x[k.b] as Vec3)), normal);
            expect(closing, `${label} contact ${n}`).toBeLessThanOrEqual(1e-9);
            if (s.coupled[n]) {
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

    // Driver and a triangle 1-2-3, ball 2 against an upright. Before the exact release solve, rollingDecel from
    // 0.63112 to at least 0.6408 arrested the whole group, the spinning driver included.
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

    // A bent chain 0-1-2. Arrested before for rollingDecel 1.49825176 to 1.4982529, where both resting balls move
    // very slowly and holding both is infeasible by a little more than HOLD_SLACK.
    const BENT = {
        positions: [
            [0, 0],
            [0.08022471315813423, 0.045033269908980454],
            [0.16880420327012668, 0.02018022318429436],
        ] as const,
        axes: [] as const,
        spin: vec3(-21.362101956587257, 56.06835649451811, 0),
    };

    it("moves the driver of a triangle held against an upright, exactly, where it was arrested", () => {
        for (const roll of [0.6312, 0.635, 0.64]) {
            const c = cluster(TRIANGLE.positions, TRIANGLE.axes, TRIANGLE.spin, roll);
            const s = solveRestingContacts(c.bodies, c.axes, c.contacts);
            expectSound(c, s, `roll ${roll}`);
            expect(
                s.approximate.some((a) => a),
                `roll ${roll}`,
            ).toBe(false);
            expect(
                dot(s.members[0]?.push?.acceleration ?? ZERO, s.members[0]?.push?.acceleration ?? ZERO),
            ).toBeGreaterThan(0);
        }
    });

    it("releases both balls of a bent chain just past its limit of holding, exactly, where it was arrested", () => {
        for (const roll of [1.4982518, 1.4982522, 1.4982528]) {
            const c = cluster(BENT.positions, BENT.axes, BENT.spin, roll);
            const s = solveRestingContacts(c.bodies, c.axes, c.contacts);
            expectSound(c, s, `roll ${roll}`);
            expect(
                s.approximate.some((a) => a),
                `roll ${roll}`,
            ).toBe(false);
            expect(s.members[1]?.phase).toBe("rolling");
            expect(s.members[2]?.phase).toBe("rolling");
        }
    });

    // Random 3–4-ball clusters: a driver touching ball 1, then balls touching a random resting ball or nestling
    // against two touching ones, and an optional upright beside a resting ball.
    function randomCluster(random: () => number, roll: number): Cluster | null {
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

    it("neither arrests nor falls back on either side of any limit of holding (random clusters)", () => {
        const random = rng(11);
        let solves = 0;
        let approximate = 0;
        let limits = 0;
        for (let made = 0; made < 16;) {
            const shape = randomCluster(random, 1);
            if (!shape) {
                continue;
            }
            made++;
            const solve = (roll: number): RestingSolution => {
                const bodies = shape.bodies.map((b) => ({ ...b, params: { ...b.params, rollingDecel: roll } }));
                const c = { ...shape, bodies };
                const s = solveRestingContacts(c.bodies, c.axes, c.contacts);
                solves++;
                approximate += s.approximate.some((a) => a) ? 1 : 0;
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
                        solve(lo - 10 ** -e);
                        solve(hi + 10 ** -e);
                    }
                }
                before = after;
                low = high;
            }
        }
        expect(limits).toBeGreaterThan(10);
        expect(solves).toBeGreaterThan(2000);
        expect(approximate).toBe(0);
    });

    it("keeps the nearest-hold fallback sound: resting balls stay put, the driver is never pushed back (random)", () => {
        const random = rng(5);
        let moved = 0;
        for (let made = 0; made < 300;) {
            const c = randomCluster(random, 0.2 + random() * 2.3);
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
        }
        expect(moved).toBeGreaterThan(100);
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
