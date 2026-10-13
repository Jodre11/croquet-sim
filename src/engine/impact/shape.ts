/**
 * The mallet head's shape (P2b.2b.2b.2c design §3): its section across the body x axis, along which the head runs its
 * length. The body frame: x along the head (the faces' outward normal at +x), y to the side, z up the shaft.
 */
import { vec3, type Vec3 } from "../math/vec3";

/** A round head (P2b.1): a solid cylinder of `radius` (m) about body x. */
export interface CylinderShape {
    readonly kind: "cylinder";
    readonly radius: number;
}

/**
 * A square-section head (design §3.2): a core box of half-extents c = (L/2 − e, h_y − e, h_z − e) Minkowski-summed with
 * a sphere of radius e, so its edges are rounded with continuous normals; e = 0 is a sharp box. `halfWidth` h_y and
 * `halfHeight` h_z (m) are the face's half-extents; 0 ≤ e < min(h_y, h_z, L/2).
 */
export interface BoxShape {
    readonly kind: "box";
    readonly halfWidth: number;
    readonly halfHeight: number;
    readonly edgeRadius: number;
}

/** The head's section (design §3.1). */
export type HeadShape = CylinderShape | BoxShape;

/** A region of the rounded box a ball can touch (design §3.2). */
export type BoxRegion = "face" | "back" | "side" | "top" | "bottom" | "edge" | "corner";

/** A body-frame point's signed distance (m) from the rounded box, its outward unit normal (body frame) and region. */
export interface BoxDistance {
    readonly distance: number;
    readonly normal: Vec3;
    readonly region: BoxRegion;
}

/**
 * The face's half-height h_z (m, design §3.1): the socket's height above the head's centre, (0, 0, h_z), and the
 * stance's ρ. A cylinder's is its radius, a box's its halfHeight.
 */
export function faceHalfHeight(shape: HeadShape): number {
    return shape.kind === "cylinder" ? shape.radius : shape.halfHeight;
}

/** The core box's half-extents c = (L/2 − e, h_y − e, h_z − e) (m) of a box head `length` (m) long (design §3.2). */
export function boxCore(shape: BoxShape, length: number): Vec3 {
    const e = shape.edgeRadius;
    return vec3(length / 2 - e, shape.halfWidth - e, shape.halfHeight - e);
}

/** −1 below zero, else 1: a coordinate of zero counts as positive (plan decision 3). */
function side(value: number): number {
    return value >= 0 ? 1 : -1;
}

/**
 * The rounded box's signed distance d = ‖max(q, 0)‖ + min(max_i q_i, 0) − e from a body-frame point `p`, with
 * q_i = |p_i| − c_i (design §3.2), its outward normal ∇d and its region, by the count of positive q_i: x alone, the
 * `face` (p_x ≥ 0) or the `back`; y alone, a `side`; z alone, the `top` (p_z ≥ 0) or the `bottom`; two, an `edge`;
 * three, a `corner`. A point inside the core takes the axis of its largest q_i, ties to x, then y, then z, and that
 * axis's region. With one positive q_i the distance is that q_i less e, exactly.
 */
export function boxDistance(shape: BoxShape, length: number, p: Vec3): BoxDistance {
    const c = boxCore(shape, length);
    const e = shape.edgeRadius;
    const qx = Math.abs(p.x) - c.x;
    const qy = Math.abs(p.y) - c.y;
    const qz = Math.abs(p.z) - c.z;
    const sx = side(p.x);
    const sy = side(p.y);
    const sz = side(p.z);
    const front = sx > 0 ? "face" : "back";
    const upper = sz > 0 ? "top" : "bottom";
    const count = (qx > 0 ? 1 : 0) + (qy > 0 ? 1 : 0) + (qz > 0 ? 1 : 0);
    if (count <= 1) {
        // One positive q_i, or none (inside the core): the axis of the largest, ties to x, then y, then z.
        if (qx >= qy && qx >= qz) {
            return { distance: qx - e, normal: vec3(sx, 0, 0), region: front };
        }
        if (qy >= qz) {
            return { distance: qy - e, normal: vec3(0, sy, 0), region: "side" };
        }
        return { distance: qz - e, normal: vec3(0, 0, sz), region: upper };
    }
    const ox = Math.max(qx, 0);
    const oy = Math.max(qy, 0);
    const oz = Math.max(qz, 0);
    const size = Math.sqrt(ox * ox + oy * oy + oz * oz);
    return {
        distance: size - e,
        normal: vec3((sx * ox) / size, (sy * oy) / size, (sz * oz) / size),
        region: count === 2 ? "edge" : "corner",
    };
}
