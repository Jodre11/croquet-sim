import { describe, expect, it } from "vitest";
import {
    BOX_REGIONS,
    HEAD_REGIONS,
    headBallContact,
    headBottom,
    headClosing,
    headLowestPoint,
    regionsOf,
    type HeadPenetration,
    type HeadRegion,
} from "../../../src/engine/impact/contacts";
import { integrate } from "../../../src/engine/impact/integrate";
import { IDENTITY, axisAngle, boxInertia, multiply, rotate, rotateInverse } from "../../../src/engine/impact/rigidBody";
import { boxCore, boxDistance, faceHalfHeight, type BoxShape } from "../../../src/engine/impact/shape";
import type { HeadState, MalletHead } from "../../../src/engine/impact/types";
import { ZERO, add, length, scale, sub, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import { headShapeOf } from "../../../src/engine/swing/buildContact";
import type { BallState } from "../../../src/engine/types";
import { TEST_BALL } from "../support/fixtures";
import { TEST_BOX, TEST_HEAD, TEST_RHO, freeBall, freeTracked, recorder } from "../support/impact";
import { rng } from "../support/rng";

describe("the head's shape (P2b.2b.2b.2c design §3.1)", () => {
    it("gives a cylinder's face half-height as its radius", () => {
        expect(faceHalfHeight({ kind: "cylinder", radius: 0.0381 })).toBe(0.0381);
    });

    it("maps a round profile head to a cylinder of half its diameter, bit for bit", () => {
        expect(headShapeOf({ kind: "round", diameter: 0.0762 })).toEqual({ kind: "cylinder", radius: 0.0762 / 2 });
    });
});

const R = TEST_BALL.radius;
const SHAPE = TEST_BOX.shape as BoxShape;
const L = TEST_BOX.length;
const E = SHAPE.edgeRadius;
/** The core box's half-extents: (0.112, 0.029, 0.029). */
const C = boxCore(SHAPE, L);
const POSE: HeadState = {
    position: vec3(1, 2, 0.3),
    orientation: multiply(axisAngle(vec3(0, 0, 1), 0.4), axisAngle(vec3(0, 1, 0), -0.3)),
    velocity: ZERO,
    angularVelocity: ZERO,
};
/** A point given in POSE's head frame, in the world frame. */
const at = (b: Vec3): Vec3 => add(POSE.position, rotate(POSE.orientation, b));

/**
 * The distance (m) from a body-frame point to the core box's surface, sampled every `step` on each of its six faces,
 * and the nearest sample: the brute force. The true distance is at most the sampled one, and less by at most step/√2.
 */
function sampled(p: Vec3, step: number): { readonly distance: number; readonly nearest: Vec3 } {
    let distance = Infinity;
    let nearest = ZERO;
    const visit = (q: Vec3): void => {
        const d = length(sub(p, q));
        if (d < distance) {
            distance = d;
            nearest = q;
        }
    };
    const count = (half: number): number => Math.max(1, Math.ceil((2 * half) / step));
    const grid = (half: number, n: number): number[] =>
        Array.from({ length: n + 1 }, (_, i) => -half + (2 * half * i) / n);
    const [xs, ys, zs] = [grid(C.x, count(C.x)), grid(C.y, count(C.y)), grid(C.z, count(C.z))];
    for (const x of xs) {
        for (const y of ys) {
            visit(vec3(x, y, C.z));
            visit(vec3(x, y, -C.z));
        }
        for (const z of zs) {
            visit(vec3(x, C.y, z));
            visit(vec3(x, -C.y, z));
        }
    }
    for (const y of ys) {
        for (const z of zs) {
            visit(vec3(C.x, y, z));
            visit(vec3(-C.x, y, z));
        }
    }
    return { distance, nearest };
}

/**
 * A sharp box's signed distance, half-extents `h`: ‖max(q, 0)‖ + min(max_i q_i, 0), q = |p| − h. The norm is √ of the
 * sum of squares, not Math.hypot, which rounds differently.
 */
function sharp(p: Vec3, h: Vec3): number {
    const q = vec3(Math.abs(p.x) - h.x, Math.abs(p.y) - h.y, Math.abs(p.z) - h.z);
    const [ox, oy, oz] = [Math.max(q.x, 0), Math.max(q.y, 0), Math.max(q.z, 0)];
    return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(q.x, q.y, q.z), 0);
}

describe("the rounded box (P2b.2b.2b.2c design §3.2)", () => {
    it("measures the distance and the normal against the brute-force surface, within the sampling's bound", () => {
        const step = 1e-3;
        const random = rng(11);
        let checked = 0;
        while (checked < 20) {
            const p = vec3((random() - 0.5) * 0.34, (random() - 0.5) * 0.14, (random() - 0.5) * 0.14);
            const brute = sampled(p, step);
            if (brute.distance < 0.01 || (Math.abs(p.x) < C.x && Math.abs(p.y) < C.y && Math.abs(p.z) < C.z)) {
                continue;
            }
            const hit = boxDistance(SHAPE, L, p);
            // The rounded box's distance is the core box's less e.
            expect(hit.distance, `${p.x} ${p.y} ${p.z}`).toBeLessThanOrEqual(brute.distance - E + 1e-12);
            expect(brute.distance - E - hit.distance).toBeLessThanOrEqual(step / Math.SQRT2 + 1e-12);
            const towards = scale(sub(p, brute.nearest), 1 / brute.distance);
            // The nearest sample lies within step/√2 of the true foot, at least 9.3 mm away: 0.076 rad at most.
            expect(length(sub(hit.normal, towards))).toBeLessThan(0.1);
            checked++;
        }
    });

    const D = 0.01;
    const s2 = Math.SQRT1_2;
    const s3 = 1 / Math.sqrt(3);
    const reach = E + R - D;
    // Each region's ball centre and outward normal, head frame: D deep into the rounded box's surface.
    const REGIONS: readonly [HeadRegion, Vec3, Vec3][] = [
        ["face", vec3(C.x + reach, 0.01, -0.005), vec3(1, 0, 0)],
        ["edge", vec3(C.x + reach * s2, C.y + reach * s2, 0.002), vec3(s2, s2, 0)],
        ["corner", vec3(C.x + reach * s3, 0 - C.y - reach * s3, C.z + reach * s3), vec3(s3, 0 - s3, s3)],
        ["side", vec3(0.02, C.y + reach, -0.01), vec3(0, 1, 0)],
        ["top", vec3(-0.03, 0.005, C.z + reach), vec3(0, 0, 1)],
        ["bottom", vec3(0.04, -0.01, 0 - C.z - reach), vec3(0, 0, -1)],
        ["back", vec3(0 - C.x - reach, 0, 0.01), vec3(-1, 0, 0)],
    ];

    it("lists the box's regions in their order, and each shape its own", () => {
        expect(BOX_REGIONS).toEqual(["face", "edge", "corner", "side", "top", "bottom", "back"]);
        expect(REGIONS.map(([region]) => region)).toEqual(BOX_REGIONS);
        expect(regionsOf(TEST_BOX.shape)).toBe(BOX_REGIONS);
        expect(regionsOf(TEST_HEAD.shape)).toBe(HEAD_REGIONS);
    });

    it.each(REGIONS)("reports a ball against the %s with its region, normal, depth and point", (region, centre, n) => {
        const contact = headBallContact(POSE, TEST_BOX, at(centre), R) as HeadPenetration;
        const normal = rotate(POSE.orientation, n);
        expect(contact.region).toBe(region);
        expect(contact.depth).toBeCloseTo(D, 12);
        expect(length(sub(contact.normal, normal))).toBeLessThan(1e-12);
        expect(length(sub(contact.point, sub(at(centre), scale(normal, R - D / 2))))).toBeLessThan(1e-12);
    });

    it("keeps the normal continuous across every bevel at e > 0", () => {
        // Points 2·EPS apart either side of each region boundary, 10 mm out: the normals differ by about EPS/10 mm.
        const EPS = 1e-9;
        const boundaries: readonly [HeadRegion, Vec3, HeadRegion, Vec3][] = [
            ["face", vec3(C.x + 0.01, C.y - EPS, 0), "edge", vec3(C.x + 0.01, C.y + EPS, 0)],
            ["side", vec3(C.x - EPS, C.y + 0.01, 0), "edge", vec3(C.x + EPS, C.y + 0.01, 0)],
            ["top", vec3(0, C.y - EPS, C.z + 0.01), "edge", vec3(0, C.y + EPS, C.z + 0.01)],
            ["edge", vec3(C.x + 0.01, C.y + 0.01, C.z - EPS), "corner", vec3(C.x + 0.01, C.y + 0.01, C.z + EPS)],
            ["back", vec3(-C.x - 0.01, 0, C.z - EPS), "edge", vec3(-C.x - 0.01, 0, C.z + EPS)],
        ];
        for (const [first, a, second, b] of boundaries) {
            const p = boxDistance(SHAPE, L, a);
            const q = boxDistance(SHAPE, L, b);
            expect([p.region, q.region]).toEqual([first, second]);
            expect(length(sub(p.normal, q.normal))).toBeLessThan(1e-6);
            expect(Math.abs(p.distance - q.distance)).toBeLessThan(2 * EPS + 1e-12);
        }
    });

    it("tends to the sharp box as e → 0: exactly at e = 0, within e at e = 1e-9", () => {
        const outer = vec3(L / 2, TEST_RHO, TEST_RHO);
        const random = rng(5);
        for (let i = 0; i < 50; i++) {
            const p = vec3((random() - 0.5) * 0.3, (random() - 0.5) * 0.1, (random() - 0.5) * 0.1);
            expect(boxDistance({ ...SHAPE, edgeRadius: 0 }, L, p).distance).toBe(sharp(p, outer));
            // Off a corner the rounded distance exceeds the sharp one by at most (√3 − 1)·e.
            expect(Math.abs(boxDistance({ ...SHAPE, edgeRadius: 1e-9 }, L, p).distance - sharp(p, outer))).toBeLessThan(
                1e-9,
            );
        }
    });

    it("breaks ties inside the core to x, then y, then z", () => {
        // Binary-exact dimensions, so the ties are exact: c = (0.125, 0.0625, 0.0625), e = 0.
        const exact: BoxShape = { kind: "box", halfWidth: 0.0625, halfHeight: 0.0625, edgeRadius: 0 };
        expect(boxDistance(exact, 0.25, vec3(0.09375, 0.03125, 0))).toEqual({
            distance: -0.03125,
            normal: vec3(1, 0, 0),
            region: "face",
        });
        expect(boxDistance(exact, 0.25, vec3(0, 0.03125, -0.03125))).toEqual({
            distance: -0.03125,
            normal: vec3(0, 1, 0),
            region: "side",
        });
    });

    it("resolves a centre at the head's centre to the side, with no throw", () => {
        // Review focus 1, decision 3: the cylinder throws for a centre on its axis; the box has a normal everywhere.
        const contact = headBallContact(POSE, TEST_BOX, POSE.position, R) as HeadPenetration;
        expect(contact.region).toBe("side");
        expect(length(sub(contact.normal, rotate(POSE.orientation, vec3(0, 1, 0))))).toBeLessThan(1e-15);
        expect(contact.depth).toBeCloseTo(R + TEST_RHO, 12);
    });

    it("finds the lowest point at a corner of the core, less e, over random orientations", () => {
        const random = rng(7);
        for (let i = 0; i < 20; i++) {
            const axis = vec3(random() - 0.5, random() - 0.5, random() - 0.5);
            const state: HeadState = { ...POSE, orientation: axisAngle(axis, random() * 2 * Math.PI) };
            let lowest = Infinity;
            for (const sx of [-1, 1]) {
                for (const sy of [-1, 1]) {
                    for (const sz of [-1, 1]) {
                        const corner = add(
                            state.position,
                            rotate(state.orientation, vec3(sx * C.x, sy * C.y, sz * C.z)),
                        );
                        lowest = Math.min(lowest, corner.z - E);
                    }
                }
            }
            expect(headLowestPoint(state, TEST_BOX)).toBeCloseTo(lowest, 14);
            const bottom = headBottom(state, TEST_BOX);
            expect(bottom.z).toBeCloseTo(lowest, 14);
            // The support point lies on the rounded surface.
            const body = rotateInverse(state.orientation, sub(bottom, state.position));
            expect(Math.abs(boxDistance(SHAPE, L, body).distance)).toBeLessThan(1e-14);
        }
    });

    it("puts a level box's bottom on its midline, under the centre (decision 1)", () => {
        const level: HeadState = { ...POSE, orientation: IDENTITY, position: vec3(1, 2, 0.05) };
        expect(headBottom(level, TEST_BOX)).toEqual(vec3(1, 2, 0.05 - C.z - E));
        expect(headLowestPoint(level, TEST_BOX)).toBe(0.05 - C.z - E);
    });

    it("bounds the face to its flat part: just inside is the face, just outside an edge", () => {
        const ahead = C.x + E + R - 1e-4;
        const inside = headBallContact(POSE, TEST_BOX, at(vec3(ahead, C.y - 1e-6, 0)), R) as HeadPenetration;
        const outside = headBallContact(POSE, TEST_BOX, at(vec3(ahead, C.y + 1e-6, 0)), R) as HeadPenetration;
        expect(inside.region).toBe("face");
        expect(outside.region).toBe("edge");
    });

    it("closes on a ball within the box's lateral reach, not the cylinder's radius", () => {
        // A ball ahead of the face, 2 mm inside the box's reach to the side and up at once: within the box's
        // |p_y| < h_y + R and |p_z| < h_z + R, but √2 times as far from the axis as the cylinder's r + R allows.
        const moving: HeadState = { ...POSE, orientation: IDENTITY, position: ZERO, velocity: vec3(2, 0, 0) };
        const offset = TEST_RHO + R - 0.002;
        const ball = { position: vec3(L / 2 + R + 1e-3, offset, offset), velocity: ZERO, angularVelocity: ZERO };
        expect(headClosing(moving, TEST_BOX, ball, R)).toBe(true);
        expect(headClosing(moving, TEST_HEAD, ball, R)).toBe(false);
        const wide = { ...ball, position: vec3(L / 2 + R + 1e-3, TEST_RHO + R + 1e-3, 0) };
        expect(headClosing(moving, TEST_BOX, wide, R)).toBe(false);
    });

    it("flags a ball struck on the bevel off the face, recording the edge", () => {
        // The ball 4 mm beyond the flat face's side, level with the head: the face meets it on the edge first.
        const centre = vec3(0, 0, 0.5);
        const ball = freeBall("blue", vec3(L / 2 + R + 1e-3, C.y + 0.004, 0.5));
        const run = integrate(freeTracked(TEST_BOX, centre, vec3(2, 0, 0), [ball]), { cap: 0.01 });
        expect(run.events.some((e) => e.kind === "impact-off-face" && e.ball === "blue")).toBe(true);
        expect(Object.keys(run.headRegions ?? {})).toContain("face/blue#edge");
    });

    it("turns a free box head struck off centre as its integrated torque about z: ω_z·I_z = ∫(r × F)·ẑ dt", () => {
        // A free head (freeTracked: no hands, no gravity), level, at 2 m/s on a free ball 10 mm off its face's centre
        // line at its height. Every force acts in the horizontal plane, so the head turns about z alone and ω × I·ω
        // stays 0. The twist rate alone is not ∝ 1/I_z: the impulse itself depends on I_z through the contact point's
        // velocity, so the identity is checked against the integrated torque.
        const centre = vec3(0, 0, 0.5);
        const probe = recorder();
        const ball = freeBall("blue", vec3(L / 2 + R + 1e-3, 0.01, 0.5));
        const setup = freeTracked(TEST_BOX, centre, vec3(2, 0, 0), [ball]);
        integrate(setup, { cap: 0.01, probe });
        let torque = 0;
        let head = setup.start;
        let blue = ball.state;
        let t = 0;
        for (const s of probe.snapshots) {
            for (const c of s.contacts.filter((x) => x.key === "face/blue")) {
                // The force on the head, at the contact point of the step's start (contacts.ts).
                const point = sub(blue.position, scale(c.normal, R - c.depth / 2));
                const onHead = scale(add(scale(c.normal, c.normalForce), c.tangentialForce), -1);
                const r = sub(point, head.position);
                torque += (r.x * onHead.y - r.y * onHead.x) * (s.t - t);
            }
            head = s.head;
            blue = s.balls[0] as typeof blue;
            t = s.t;
        }
        expect(torque).not.toBe(0);
        const spin = head.angularVelocity;
        expect(Math.abs(spin.z * TEST_BOX.inertia.z - torque)).toBeLessThanOrEqual(1e-9 * Math.abs(torque));
        expect(Math.abs(spin.x) + Math.abs(spin.y)).toBeLessThan(1e-12);
    });

    it("strikes a centred ball as a cylinder of the same mass and moments does, within 1e-12 relative", () => {
        // Shape-neutrality (design §7.1): e = 0, h_y = h_z = r, the box's moment about the shaft the cylinder's I_z, no
        // shaft, no turf. Only the face plane is met; I_y = I_z on both, and I_x differs but is not excited. Not
        // bit-identical: the box's face distance, (|p_x| − (L/2 − e)) − e, rounds differently from |p_x| − L/2.
        const sharpBox: MalletHead = {
            ...TEST_BOX,
            inertia: boxInertia(1, 0.23, TEST_RHO, TEST_RHO, TEST_HEAD.inertia.z),
            shape: { kind: "box", halfWidth: TEST_RHO, halfHeight: TEST_RHO, edgeRadius: 0 },
        };
        expect(sharpBox.inertia.y).toBe(TEST_HEAD.inertia.y);
        const centre = vec3(0, 0, 0.5);
        const run = (head: MalletHead) =>
            integrate(freeTracked(head, centre, vec3(2, 0, 0), [freeBall("blue", vec3(L / 2 + R + 1e-3, 0, 0.5))]), {
                cap: 0.01,
            });
        const a = run(sharpBox);
        const b = run(TEST_HEAD);
        const near = (x: Vec3, y: Vec3, scaleOf: number): void => {
            expect(length(sub(x, y))).toBeLessThanOrEqual(1e-12 * scaleOf);
        };
        const ballA = a.balls.blue as BallState;
        const ballB = b.balls.blue as BallState;
        near(ballA.position, ballB.position, length(ballB.position));
        near(ballA.velocity, ballB.velocity, 2);
        near(ballA.angularVelocity, ballB.angularVelocity, 2 / R);
        near(a.head.position, b.head.position, length(b.head.position));
        near(a.head.velocity, b.head.velocity, 2);
        near(a.head.angularVelocity, b.head.angularVelocity, 2 / R);
    });
});
