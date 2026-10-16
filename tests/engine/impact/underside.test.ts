import { describe, expect, it } from "vitest";
import { headExtent, headLowestPoint, headUnderside } from "../../../src/engine/impact/contacts";
import {
    IDENTITY,
    axisAngle,
    multiply,
    rotate,
    rotateInverse,
    type Quaternion,
} from "../../../src/engine/impact/rigidBody";
import { boxDistance, type BoxShape } from "../../../src/engine/impact/shape";
import type { HeadState, MalletHead } from "../../../src/engine/impact/types";
import { add, sub, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import { TEST_BOX, TEST_HEAD, TEST_SHARP } from "../support/impact";
import { rng } from "../support/rng";

const at = (position: Vec3, orientation: Quaternion = IDENTITY): HeadState => ({
    position,
    orientation,
    velocity: vec3(0, 0, 0),
    angularVelocity: vec3(0, 0, 0),
});

/** True when the world point `p` lies in the head (its own body-frame test). */
function inside(state: HeadState, head: MalletHead, p: Vec3): boolean {
    const b = rotateInverse(state.orientation, sub(p, state.position));
    const { shape } = head;
    if (shape.kind === "box") {
        return boxDistance(shape, head.length, b).distance <= 0;
    }
    return Math.abs(b.x) <= head.length / 2 && b.y * b.y + b.z * b.z <= shape.radius * shape.radius;
}

/**
 * The underside by brute force: the first height inside the head scanning up the vertical line through (x, y) in
 * 0.05 mm steps, then bisected to adjacent doubles; Infinity if the scan finds none.
 */
function brute(state: HeadState, head: MalletHead, x: number, y: number): number {
    const step = 5e-5;
    let z = state.position.z - 0.3;
    while (z <= state.position.z + 0.3 && !inside(state, head, vec3(x, y, z))) {
        z += step;
    }
    if (z > state.position.z + 0.3) {
        return Infinity;
    }
    let lo = z - step;
    let hi = z;
    for (let n = 0; n < 80; n++) {
        const mid = (lo + hi) / 2;
        if (inside(state, head, vec3(x, y, mid))) {
            hi = mid;
        } else {
            lo = mid;
        }
    }
    return hi;
}

/** A random orientation within about ±0.6 rad of level, any yaw. */
function tumble(random: () => number): Quaternion {
    const yaw = axisAngle(vec3(0, 0, 1), (random() * 2 - 1) * Math.PI);
    const pitch = axisAngle(vec3(0, 1, 0), (random() * 2 - 1) * 0.6);
    const roll = axisAngle(vec3(1, 0, 0), (random() * 2 - 1) * 0.6);
    return multiply(yaw, multiply(pitch, roll));
}

describe("the head's underside (P2b.2b.2b.3 design §4.1)", () => {
    it("finds the underside of a level head and of a sharp box exactly, with no NaN on axis-parallel lines", () => {
        // Review focus 2. A level cylinder's underside at y is z − √(r² − y²) inside its length and radius; a level
        // sharp box's is its sole, z − h_z, across its whole footprint; outside each, Infinity.
        const r = (TEST_HEAD.shape as { radius: number }).radius;
        const round = headUnderside(at(vec3(0, 0, 0.1)), TEST_HEAD);
        for (const y of [0, 0.01, 0.031]) {
            expect(round(0.05, y)).toBeCloseTo(0.1 - Math.sqrt(r * r - y * y), 15);
        }
        expect(round(0.05, 0.033)).toBe(Infinity);
        expect(round(0.2, 0)).toBe(Infinity);
        const sharp = headUnderside(at(vec3(0, 0, 0.1)), TEST_SHARP);
        expect(sharp(0.1, 0.03)).toBeCloseTo(0.1 - 0.032, 15);
        expect(sharp(0.1, 0.034)).toBe(Infinity);
        for (const head of [TEST_HEAD, TEST_BOX, TEST_SHARP]) {
            const under = headUnderside(at(vec3(0, 0, 0.1)), head);
            for (let x = -0.13; x <= 0.13; x += 0.001) {
                for (let y = -0.04; y <= 0.04; y += 0.001) {
                    expect(Number.isNaN(under(x, y)), `${x} ${y}`).toBe(false);
                }
            }
        }
    });

    it("finds the rounded box's underside under its rounded edge", () => {
        // TEST_BOX level: under the edge, c_y < |y| < h_y, the underside is z − c_z − √(e² − (|y| − c_y)²).
        const shape = TEST_BOX.shape as BoxShape;
        const e = shape.edgeRadius;
        const cy = shape.halfWidth - e;
        const cz = shape.halfHeight - e;
        const under = headUnderside(at(vec3(0, 0, 0.1)), TEST_BOX);
        for (const y of [cy + 0.0005, cy + 0.0015, cy + 0.0029]) {
            expect(under(0.05, y)).toBeCloseTo(0.1 - cz - Math.sqrt(e * e - (y - cy) * (y - cy)), 14);
            expect(under(0.05, 0 - y)).toBe(under(0.05, y));
        }
    });

    it("agrees with a brute-force search on tumbled heads", () => {
        const random = rng(31);
        for (const head of [TEST_HEAD, TEST_BOX, TEST_SHARP]) {
            for (let n = 0; n < 150; n++) {
                const state = at(vec3(1, 2, 0.05), tumble(random));
                const extent = headExtent(state, head);
                const x = 1 + (random() * 2 - 1) * extent.x;
                const y = 2 + (random() * 2 - 1) * extent.y;
                const found = headUnderside(state, head)(x, y);
                const expected = brute(state, head, x, y);
                if (expected === Infinity) {
                    // The scan steps 0.05 mm: a line through a sliver thinner than that is missed by it alone.
                    const thin = found === Infinity || !inside(state, head, vec3(x, y, found + 5e-5));
                    expect(thin, `${head.shape.kind} ${n}`).toBe(true);
                } else {
                    expect(Math.abs(found - expected), `${head.shape.kind} ${n}`).toBeLessThan(1e-9);
                }
                expect(found, `${head.shape.kind} ${n}`).toBeGreaterThanOrEqual(headLowestPoint(state, head) - 1e-12);
            }
        }
    });

    it("bounds the head within its horizontal extent", () => {
        // Every corner of a box's full box, and every point on a cylinder's end rims, lies within the extent.
        const random = rng(37);
        for (let n = 0; n < 100; n++) {
            const q = tumble(random);
            const state = at(vec3(0, 0, 0), q);
            const box = headExtent(state, TEST_BOX);
            const shape = TEST_BOX.shape as BoxShape;
            for (const sx of [-1, 1]) {
                for (const sy of [-1, 1]) {
                    for (const sz of [-1, 1]) {
                        const corner = rotate(
                            q,
                            vec3((sx * TEST_BOX.length) / 2, sy * shape.halfWidth, sz * shape.halfHeight),
                        );
                        expect(Math.abs(corner.x)).toBeLessThanOrEqual(box.x + 1e-12);
                        expect(Math.abs(corner.y)).toBeLessThanOrEqual(box.y + 1e-12);
                    }
                }
            }
            const round = headExtent(state, TEST_HEAD);
            const r = (TEST_HEAD.shape as { radius: number }).radius;
            for (let k = 0; k < 32; k++) {
                const a = (k * Math.PI) / 16;
                for (const sx of [-1, 1]) {
                    const rim = rotate(
                        q,
                        add(vec3((sx * TEST_HEAD.length) / 2, 0, 0), vec3(0, r * Math.cos(a), r * Math.sin(a))),
                    );
                    expect(Math.abs(rim.x)).toBeLessThanOrEqual(round.x + 1e-12);
                    expect(Math.abs(rim.y)).toBeLessThanOrEqual(round.y + 1e-12);
                }
            }
        }
    });
});
