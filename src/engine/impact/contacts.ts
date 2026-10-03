/**
 * Contacts of the impact phase (P2b.1 design §4): the pair list and each pair's geometry. A pair is body A acting on
 * body B along the unit normal n from A to B: the mallet face on a ball, the earlier ball in BALL_IDS order on the
 * later one, or the turf on a ball. Penetration δ > 0 means the pair is closed. The contact point lies on the
 * normal's line, δ/2 inside ball B's undeformed surface: x = c_B − (R − δ/2)·n. Ball–upright and ball–peg pairs are a
 * further kind, deferred (design §11).
 */
import { add, cross, dot, length, scale, sub, vec3, type Vec3 } from "../math/vec3";
import type { BallId, BallState } from "../types";
import { rotate } from "./rigidBody";
import type { HeadState, MalletHead } from "./types";

/** The kinds of pair, in the order the pair list holds them. */
export type PairKind = "face-ball" | "ball-ball" | "ball-turf";

/** One pair. `b` indexes the impact's balls; `a` does too for a ball–ball pair and is −1 for the face or the turf. */
export interface Pair {
    readonly kind: PairKind;
    readonly key: string;
    readonly a: number;
    readonly b: number;
}

/** A closed pair: unit normal from A to B, penetration (m) and contact point. */
export interface Penetration {
    readonly normal: Vec3;
    readonly depth: number;
    readonly point: Vec3;
}

/** A ball whose centre projects outside a face disc but which reaches the face's rim (design §4). */
export const OFF_FACE = "off-face";

const UP = vec3(0, 0, 1);
const FACES = [1, -1] as const;

/**
 * The pair list in its fixed order: face–ball, then ball–ball, then ball–turf, each in ball order (`ids` are in
 * BALL_IDS order). A ball has a turf pair only where `turf` says so (isolated test cases leave the turf out).
 */
export function pairList(ids: readonly BallId[], turf: readonly boolean[]): Pair[] {
    const pairs: Pair[] = ids.map((id, b): Pair => ({ kind: "face-ball", key: `face/${id}`, a: -1, b }));
    ids.forEach((first, a) => {
        for (let b = a + 1; b < ids.length; b++) {
            pairs.push({ kind: "ball-ball", key: `${first}/${ids[b] as BallId}`, a, b });
        }
    });
    ids.forEach((id, b) => {
        if (turf[b]) {
            pairs.push({ kind: "ball-turf", key: `turf/${id}`, a: -1, b });
        }
    });
    return pairs;
}

/** Outward unit normal and disc centre of face `side` (+1: the body +x end; −1: the −x end), world frame. */
function faceOf(state: HeadState, head: MalletHead, side: 1 | -1): { readonly normal: Vec3; readonly centre: Vec3 } {
    const normal = rotate(state.orientation, vec3(side, 0, 0));
    return { normal, centre: add(state.position, scale(normal, head.length / 2)) };
}

/**
 * The face–ball contact of a ball centred at `centre`. For each face in turn (+x, then −x), d is the centre's signed
 * distance from the face plane along the face's outward normal. A ball with 0 < d < R whose centre projects inside the
 * face disc is in contact, δ = R − d. One whose projection lies outside the disc, but whose cross-section in the face
 * plane (radius √(R² − d²)) still reaches the disc, touches the rim instead: OFF_FACE. Otherwise null.
 */
export function faceContact(
    state: HeadState,
    head: MalletHead,
    centre: Vec3,
    radius: number,
): Penetration | typeof OFF_FACE | null {
    for (const side of FACES) {
        const face = faceOf(state, head, side);
        const offset = sub(centre, face.centre);
        const d = dot(offset, face.normal);
        if (!(d > 0 && d < radius)) {
            continue;
        }
        const radial = length(sub(offset, scale(face.normal, d)));
        if (radial <= head.radius) {
            const depth = radius - d;
            return { normal: face.normal, depth, point: sub(centre, scale(face.normal, radius - depth / 2)) };
        }
        if (radial < head.radius + Math.sqrt(radius * radius - d * d)) {
            return OFF_FACE;
        }
    }
    return null;
}

/**
 * The contact of ball a with ball b (centres `a`, `b`), or null while they are at least 2R apart. Coincident centres
 * have no normal and throw a RangeError; simulateImpact's validation rejects such set-ups before integrating.
 */
export function ballBallContact(a: Vec3, b: Vec3, radius: number): Penetration | null {
    const offset = sub(b, a);
    const distance = length(offset);
    const depth = 2 * radius - distance;
    if (!(depth > 0)) {
        return null;
    }
    if (distance === 0) {
        throw new RangeError("ball–ball contact between coincident centres has no normal");
    }
    const normal = scale(offset, 1 / distance);
    return { normal, depth, point: sub(b, scale(normal, radius - depth / 2)) };
}

/** The turf's contact with a ball centred at `centre`: closed while z < R, whatever its force (design §4). */
export function turfContact(centre: Vec3, radius: number): Penetration | null {
    const depth = radius - centre.z;
    if (!(depth > 0)) {
        return null;
    }
    return { normal: UP, depth, point: vec3(centre.x, centre.y, centre.z - (radius - depth / 2)) };
}

/** The contact of `pair` in the current state, OFF_FACE, or null while it is open. */
export function pairContact(
    pair: Pair,
    state: HeadState,
    head: MalletHead,
    balls: readonly BallState[],
    radius: number,
): Penetration | typeof OFF_FACE | null {
    const centre = (balls[pair.b] as BallState).position;
    switch (pair.kind) {
        case "face-ball":
            return faceContact(state, head, centre, radius);
        case "ball-ball":
            return ballBallContact((balls[pair.a] as BallState).position, centre, radius);
        case "ball-turf":
            return turfContact(centre, radius);
    }
}

/**
 * Velocity of the material point at `point` of a body moving with `velocity`, spinning with `angularVelocity` about
 * `centre`.
 */
export function pointVelocity(centre: Vec3, velocity: Vec3, angularVelocity: Vec3, point: Vec3): Vec3 {
    return add(velocity, cross(angularVelocity, sub(point, centre)));
}

/**
 * Height of the head's lowest point. With a the unit axis, the lower end disc's rim is lowest:
 * z − (L/2)·|a_z| − r·√(1 − a_z²).
 */
export function headLowestPoint(state: HeadState, head: MalletHead): number {
    const az = rotate(state.orientation, vec3(1, 0, 0)).z;
    return state.position.z - (head.length / 2) * Math.abs(az) - head.radius * Math.sqrt(Math.max(0, 1 - az * az));
}

/**
 * True when a face is still closing on the ball (design §5, head re-approach). The ball's centre must lie in front of
 * the face, with its surface within one ball radius of the face plane (0 < d < 2R). Its centre must project within
 * reach of the disc. And the face point under it must approach it along the face normal. A ball further off is not a
 * second strike of this stroke: a ball lying ahead in the line of play would otherwise be flagged on every stroke.
 */
export function headClosing(state: HeadState, head: MalletHead, ball: BallState, radius: number): boolean {
    for (const side of FACES) {
        const face = faceOf(state, head, side);
        const offset = sub(ball.position, face.centre);
        const d = dot(offset, face.normal);
        if (!(d > 0 && d < 2 * radius) || length(sub(offset, scale(face.normal, d))) >= head.radius + radius) {
            continue;
        }
        const under = sub(ball.position, scale(face.normal, radius));
        const facePoint = pointVelocity(state.position, state.velocity, state.angularVelocity, under);
        if (dot(sub(ball.velocity, facePoint), face.normal) < 0) {
            return true;
        }
    }
    return false;
}
