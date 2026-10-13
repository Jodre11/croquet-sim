/**
 * The mallet head's shape (P2b.2b.2b.2c design §3): its section across the body x axis, along which the head runs its
 * length. The body frame: x along the head (the faces' outward normal at +x), y to the side, z up the shaft.
 */

/** A round head (P2b.1): a solid cylinder of `radius` (m) about body x. */
export interface CylinderShape {
    readonly kind: "cylinder";
    readonly radius: number;
}

/** The head's section (design §3.1). */
export type HeadShape = CylinderShape;

/**
 * The face's half-height h_z (m, design §3.1): the socket's height above the head's centre, (0, 0, h_z), and the
 * stance's ρ. A cylinder's is its radius.
 */
export function faceHalfHeight(shape: HeadShape): number {
    return shape.radius;
}
