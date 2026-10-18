/**
 * Contacts of the impact phase (P2b.1 design §4): the pair list and each pair's geometry. A pair is body A acting on
 * body B along the unit normal n from A to B: the mallet face on a ball, or the earlier ball in BALL_IDS order on the
 * later one (the ball–turf pair is the bed's, turfBed.ts). Penetration δ > 0 means the pair is closed. The contact
 * point lies on the normal's line, δ/2 inside ball B's undeformed surface: x = c_B − (R − δ/2)·n. The ball–obstacle
 * pair (P2b.2a design §4) acts from a hoop upright or the peg, an immovable vertical cylinder, along the horizontal
 * normal from its axis to the ball's centre. The head–turf pair (P2b.2b.2b.3 design §4) acts from the turf's columns
 * under the head's underside (headUnderside), on the turf bed's lattice (headTurf.ts).
 * For a tracked drive the face–ball pair meets the whole head (design §4.5, headBallContact): a solid cylinder or a
 * rounded box (P2b.2b.2b.2c design §3). The force table's face-only contact is the cylinder's alone.
 */
import { CONTACT_TOLERANCE } from "../detect";
import { add, cross, dot, horizontal, length, scale, sub, vec3, type Vec3 } from "../math/vec3";
import { BALL_IDS, type BallId, type BallState } from "../types";
import { rotate, rotateInverse } from "./rigidBody";
import { boxCore, boxDistance, type BoxRegion, type BoxShape, type CylinderShape, type HeadShape } from "./shape";
import type { HeadState, MalletHead } from "./types";

/** The kinds of pair, in the order the pair list holds them. */
export type PairKind = "face-ball" | "ball-ball" | "ball-turf" | "ball-obstacle";

/**
 * One pair. `b` indexes the impact's balls. `a` indexes them too for a ball–ball pair, indexes the obstacles for a
 * ball–obstacle pair, and is −1 for the face or the turf.
 */
export interface Pair {
    readonly kind: PairKind;
    readonly key: string;
    readonly a: number;
    readonly b: number;
}

/** A fixed vertical cylinder as the impact's geometry sees it (a Cylinder satisfies it). */
export interface ObstacleGeometry {
    readonly id: string;
    readonly centre: Vec3;
    readonly radius: number;
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

/** Key of the face–ball pair of `ball`. */
export function faceKey(ball: BallId): string {
    return `face/${ball}`;
}

/** Key of the pair of balls `a` and `b`: the earlier in BALL_IDS order first. */
export function ballPairKey(a: BallId, b: BallId): string {
    return BALL_IDS.indexOf(a) < BALL_IDS.indexOf(b) ? `${a}/${b}` : `${b}/${a}`;
}

/** Key of the pair of `ball` and obstacle `obstacleId`. */
export function obstacleKey(ball: BallId, obstacleId: string): string {
    return `${ball}@${obstacleId}`;
}

/**
 * The pair list in its fixed order: face–ball, then ball–ball, then ball–turf, each in ball order (`ids` are in
 * BALL_IDS order), then ball–obstacle, ball by ball, `obstacles` (ids, in obstaclesOf order) within each ball. A ball
 * has a turf pair only where `turf` says so (isolated test cases leave the turf out).
 */
export function pairList(ids: readonly BallId[], turf: readonly boolean[], obstacles: readonly string[] = []): Pair[] {
    const pairs: Pair[] = ids.map((id, b): Pair => ({ kind: "face-ball", key: faceKey(id), a: -1, b }));
    ids.forEach((first, a) => {
        for (let b = a + 1; b < ids.length; b++) {
            pairs.push({ kind: "ball-ball", key: ballPairKey(first, ids[b] as BallId), a, b });
        }
    });
    ids.forEach((id, b) => {
        if (turf[b]) {
            pairs.push({ kind: "ball-turf", key: `turf/${id}`, a: -1, b });
        }
    });
    ids.forEach((id, b) => {
        obstacles.forEach((obstacle, a) => {
            pairs.push({ kind: "ball-obstacle", key: obstacleKey(id, obstacle), a, b });
        });
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
 * plane (radius √(R² − d²)) still reaches the disc, touches the rim instead: OFF_FACE. Otherwise null. A cylinder's
 * only.
 */
export function faceContact(
    state: HeadState,
    head: MalletHead,
    centre: Vec3,
    radius: number,
): Penetration | typeof OFF_FACE | null {
    const { shape } = head;
    if (shape.kind !== "cylinder") {
        throw new Error("faceContact is the cylinder's (P2b.2b.2b.2c design §3.4): a force table's head is a cylinder");
    }
    for (const side of FACES) {
        const face = faceOf(state, head, side);
        const offset = sub(centre, face.centre);
        const d = dot(offset, face.normal);
        if (!(d > 0 && d < radius)) {
            continue;
        }
        const radial = length(sub(offset, scale(face.normal, d)));
        if (radial <= shape.radius) {
            const depth = radius - d;
            return { normal: face.normal, depth, point: sub(centre, scale(face.normal, radius - depth / 2)) };
        }
        if (radial < shape.radius + Math.sqrt(radius * radius - d * d)) {
            return OFF_FACE;
        }
    }
    return null;
}

/** A region of the solid head a ball can touch (P2b.2b.1 design §4.5; P2b.2b.2b.2c design §3.2). */
export type HeadRegion = "face" | "rim" | "barrel" | "back-rim" | "back" | BoxRegion;

/** The cylinder's regions, in the order the integrator records them. */
export const HEAD_REGIONS: readonly HeadRegion[] = ["face", "rim", "barrel", "back-rim", "back"];

/** The rounded box's regions, in the order the integrator records them (P2b.2b.2b.2c plan decision 2). */
export const BOX_REGIONS: readonly HeadRegion[] = ["face", "edge", "corner", "side", "top", "bottom", "back"];

/** The regions of a head of `shape`, in the integrator's order. */
export function regionsOf(shape: HeadShape): readonly HeadRegion[] {
    return shape.kind === "cylinder" ? HEAD_REGIONS : BOX_REGIONS;
}

/** A head–ball contact on the whole head, with the region touched. */
export interface HeadPenetration extends Penetration {
    readonly region: HeadRegion;
}

/**
 * The contact of a ball centred at `centre` with the whole head as a solid cylinder (P2b.2b.1 design §4.5). With a the
 * head's axis, x the centre's offset along it, ρ_b its distance from the axis and u the unit radial direction,
 * e_x = |x| − L/2 and e_r = ρ_b − r: off both (e_x > 0, e_r > 0) a rim (`rim` for x ≥ 0, else `back-rim`), at
 * √(e_x² + e_r²) along (e_x·sign(x)·a + e_r·u)/distance; otherwise, where e_x > e_r, an end disc (`face` for x ≥ 0,
 * else `back`), at e_x along sign(x)·a; otherwise the barrel, at e_r along u. The distance is the centre's signed
 * distance from the cylinder, continuous across the regions, so a contact never opens deep by changing region.
 * δ = R − distance closes the pair when positive, at c_b − (R − δ/2)·n. A centre on the axis in the barrel region has
 * no normal and throws a RangeError (it lies at least r inside both faces).
 */
function cylinderBallContact(
    state: HeadState,
    head: MalletHead,
    shape: CylinderShape,
    centre: Vec3,
    radius: number,
): HeadPenetration | null {
    const axis = rotate(state.orientation, vec3(1, 0, 0));
    const offset = sub(centre, state.position);
    const x = dot(offset, axis);
    const across = sub(offset, scale(axis, x));
    const radial = length(across);
    const ex = Math.abs(x) - head.length / 2;
    const er = radial - shape.radius;
    const end = x >= 0 ? axis : scale(axis, -1);
    let distance: number;
    let normal: Vec3;
    let region: HeadRegion;
    if (ex > 0 && er > 0) {
        distance = Math.sqrt(ex * ex + er * er);
        normal = scale(add(scale(end, ex), scale(across, er / radial)), 1 / distance);
        region = x >= 0 ? "rim" : "back-rim";
    } else if (ex > er) {
        distance = ex;
        normal = end;
        region = x >= 0 ? "face" : "back";
    } else {
        if (radial === 0) {
            throw new RangeError("head–ball contact with a centre on the head's axis has no normal");
        }
        distance = er;
        normal = scale(across, 1 / radial);
        region = "barrel";
    }
    const depth = radius - distance;
    if (!(depth > 0)) {
        return null;
    }
    return { normal, depth, point: sub(centre, scale(normal, radius - depth / 2)), region };
}

/** The contact of a ball centred at `centre` (world) with a rounded box head (P2b.2b.2b.2c design §3.2). */
function boxBallContact(
    state: HeadState,
    head: MalletHead,
    shape: BoxShape,
    centre: Vec3,
    radius: number,
): HeadPenetration | null {
    const hit = boxDistance(shape, head.length, rotateInverse(state.orientation, sub(centre, state.position)));
    const depth = radius - hit.distance;
    if (!(depth > 0)) {
        return null;
    }
    const normal = rotate(state.orientation, hit.normal);
    return { normal, depth, point: sub(centre, scale(normal, radius - depth / 2)), region: hit.region };
}

/**
 * The contact of a ball centred at `centre` with the whole head (P2b.2b.1 design §4.5): its solid cylinder
 * (cylinderBallContact) or its rounded box (P2b.2b.2b.2c design §3.2; boxBallContact). δ = R − distance closes the
 * pair when positive, at c_b − (R − δ/2)·n. A cylinder throws a RangeError for a centre on its axis in the barrel
 * region; a box has a normal everywhere.
 */
export function headBallContact(
    state: HeadState,
    head: MalletHead,
    centre: Vec3,
    radius: number,
): HeadPenetration | null {
    const { shape } = head;
    return shape.kind === "cylinder"
        ? cylinderBallContact(state, head, shape, centre, radius)
        : boxBallContact(state, head, shape, centre, radius);
}

/**
 * Separation (m) of a ball centred at `centre` from the head's faces: d − R for the nearer face plane, d being the
 * centre's signed distance from a face plane along its outward normal, the larger of the two faces' (P2b.2a design §5,
 * `clearanceAfter`). Negative while the ball reaches into that plane.
 */
export function faceClearance(state: HeadState, head: MalletHead, centre: Vec3, radius: number): number {
    const front = faceOf(state, head, 1);
    const back = faceOf(state, head, -1);
    const d = Math.max(dot(sub(centre, front.centre), front.normal), dot(sub(centre, back.centre), back.normal));
    return d - radius;
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

/**
 * The contact of `obstacle` with a ball centred at `centre`, or null while they are at least R + r apart
 * horizontally. The obstacle is an infinite vertical cylinder (a ball above a crown is phase 2's jump flag), so the
 * normal is horizontal whatever the ball's height. A centre on the axis has no normal and throws a RangeError.
 */
export function obstacleContact(centre: Vec3, radius: number, obstacle: ObstacleGeometry): Penetration | null {
    const offset = horizontal(sub(centre, obstacle.centre));
    const distance = length(offset);
    const depth = radius + obstacle.radius - distance;
    if (!(depth > 0)) {
        return null;
    }
    if (distance === 0) {
        throw new RangeError(`ball–obstacle contact with a centre on the axis of ${obstacle.id} has no normal`);
    }
    const normal = scale(offset, 1 / distance);
    return { normal, depth, point: sub(centre, scale(normal, radius - depth / 2)) };
}

/**
 * Horizontal surface gap (m) between `obstacle` and a ball centred at `centre`, d − R − r: the negated penetration
 * obstacleContact computes, rounded identically, so the pair is closed exactly where the gap is negative.
 */
export function obstacleGap(centre: Vec3, radius: number, obstacle: ObstacleGeometry): number {
    return 0 - (radius + obstacle.radius - length(horizontal(sub(centre, obstacle.centre))));
}

/**
 * Bound on outsideObstacle's corrections. Numerical, not physical. Each correction lengthens the target distance by
 * step = ε·(max(|x|, |y|) of the obstacle's centre + R + r), at least an ulp of every rebuilt coordinate. The
 * rounding of the rebuilt centre is under one step, apart from a few ulps of R + r (from f, offset·f, the squared sum
 * and the square root), which matter only for an obstacle near the origin. A correction or two clears it, and the rest
 * are spare.
 */
const OUTSIDE_STEPS = 4;

/**
 * `centre` moved horizontally outward from `obstacle` until its penetration R + r − d is at most zero, as
 * obstacleContact computes it; or `centre` itself when it already is (P2b.2a design §4, §6). The target distance grows
 * by about an ulp of the coordinates per correction, until rounding them no longer leaves the ball inside, so the ball
 * ends at most a few such ulps beyond zero gap. Throws a RangeError for a centre on the axis (no outward direction),
 * and an Error if the corrections run out.
 */
export function outsideObstacle(centre: Vec3, radius: number, obstacle: ObstacleGeometry): Vec3 {
    const offset = horizontal(sub(centre, obstacle.centre));
    const distance = length(offset);
    const reach = radius + obstacle.radius;
    if (!(reach - distance > 0)) {
        return centre;
    }
    if (distance === 0) {
        throw new RangeError(`a ball centred on the axis of ${obstacle.id} has no outward direction`);
    }
    const step = Number.EPSILON * (Math.max(Math.abs(obstacle.centre.x), Math.abs(obstacle.centre.y)) + reach);
    let target = reach;
    for (let i = 0; i < OUTSIDE_STEPS; i++) {
        const f = target / distance;
        const moved = vec3(obstacle.centre.x + offset.x * f, obstacle.centre.y + offset.y * f, centre.z);
        if (!(reach - length(horizontal(sub(moved, obstacle.centre))) > 0)) {
            return moved;
        }
        target += step;
    }
    throw new Error(`could not place a ball outside ${obstacle.id}`);
}

/** The contact of `pair` in the current state, OFF_FACE, or null while it is open. */
export function pairContact(
    pair: Pair,
    state: HeadState,
    head: MalletHead,
    balls: readonly BallState[],
    radius: number,
    obstacles: readonly ObstacleGeometry[] = [],
): Penetration | typeof OFF_FACE | null {
    const centre = (balls[pair.b] as BallState).position;
    switch (pair.kind) {
        case "face-ball":
            return faceContact(state, head, centre, radius);
        case "ball-ball":
            return ballBallContact((balls[pair.a] as BallState).position, centre, radius);
        case "ball-turf":
            throw new Error("the ball–turf pair is the bed's (turfBed.ts bedLoad)");
        case "ball-obstacle":
            return obstacleContact(centre, radius, obstacles[pair.a] as ObstacleGeometry);
    }
}

/**
 * True when ball–ball or ball–obstacle `pair` is touching, its gap at most CONTACT_TOLERANCE (overlap included), in
 * `balls` (P2b.2a design §3, `touchingAtStart`); always false for face–ball and ball–turf pairs.
 */
export function pairTouching(
    pair: Pair,
    balls: readonly BallState[],
    radius: number,
    obstacles: readonly ObstacleGeometry[],
): boolean {
    const centre = (balls[pair.b] as BallState).position;
    if (pair.kind === "ball-ball") {
        return length(sub(centre, (balls[pair.a] as BallState).position)) - 2 * radius <= CONTACT_TOLERANCE;
    }
    if (pair.kind === "ball-obstacle") {
        const o = obstacles[pair.a] as ObstacleGeometry;
        return length(horizontal(sub(centre, o.centre))) - radius - o.radius <= CONTACT_TOLERANCE;
    }
    return false;
}

/**
 * Velocity of the material point at `point` of a body moving with `velocity`, spinning with `angularVelocity` about
 * `centre`.
 */
export function pointVelocity(centre: Vec3, velocity: Vec3, angularVelocity: Vec3, point: Vec3): Vec3 {
    return add(velocity, cross(angularVelocity, sub(point, centre)));
}

/**
 * Height of the head's lowest point. A cylinder's lower end disc's rim, with a the unit axis:
 * z − (L/2)·|a_z| − r·√(1 − a_z²). A box's (P2b.2b.2b.2c design §3.4): z − Σ_i c_i·|R_zi| − e, R_zi the world-up
 * component of body axis i.
 */
export function headLowestPoint(state: HeadState, head: MalletHead): number {
    const { shape } = head;
    if (shape.kind === "box") {
        const c = boxCore(shape, head.length);
        const q = state.orientation;
        const ax = rotate(q, vec3(1, 0, 0)).z;
        const ay = rotate(q, vec3(0, 1, 0)).z;
        const az = rotate(q, vec3(0, 0, 1)).z;
        return state.position.z - c.x * Math.abs(ax) - c.y * Math.abs(ay) - c.z * Math.abs(az) - shape.edgeRadius;
    }
    const az = rotate(state.orientation, vec3(1, 0, 0)).z;
    return state.position.z - (head.length / 2) * Math.abs(az) - shape.radius * Math.sqrt(Math.max(0, 1 - az * az));
}

/**
 * True when a ball centred `offset` (world) from a face's centre, `d` along its outward unit `normal`, lies out of the
 * face's lateral reach for a ball of `radius` (P2b.2b.1 design §3.5; P2b.2b.2b.2c design §3.4): for a cylinder, the
 * offset across the normal at least r + R; for a box, the offset in the head's frame at least h_y + R to the side or
 * h_z + R up or down.
 */
export function outOfReach(
    state: HeadState,
    head: MalletHead,
    offset: Vec3,
    normal: Vec3,
    d: number,
    radius: number,
): boolean {
    const { shape } = head;
    if (shape.kind === "cylinder") {
        return length(sub(offset, scale(normal, d))) >= shape.radius + radius;
    }
    const p = rotateInverse(state.orientation, offset);
    return Math.abs(p.y) >= shape.halfWidth + radius || Math.abs(p.z) >= shape.halfHeight + radius;
}

/**
 * True when a face is still closing on the ball (design §5, head re-approach). The ball's centre must lie in front of
 * the face, with its surface within one ball radius of the face plane (0 < d < 2R). Its centre must project within
 * the face's lateral reach (outOfReach). And the face point under it must approach it along the face normal. A ball
 * further off is not a second strike of this stroke: a ball lying ahead in the line of play would otherwise be flagged
 * on every stroke.
 */
export function headClosing(state: HeadState, head: MalletHead, ball: BallState, radius: number): boolean {
    for (const side of FACES) {
        const face = faceOf(state, head, side);
        const offset = sub(ball.position, face.centre);
        const d = dot(offset, face.normal);
        if (!(d > 0 && d < 2 * radius) || outOfReach(state, head, offset, face.normal, d, radius)) {
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

/** Key of the head–turf pair (P2b.2b.1 design §4.3). */
export const HEAD_TURF_KEY = "head/turf";

/**
 * The head's lowest point (P2b.2b.1 design §4.1). With a the unit axis and |a_z| < 1, it is
 * c − (L/2)·sign(a_z)·a − r·u, u the unit vector of ẑ − a_z·a: the lower end disc's rim, straight below the axis. For
 * a_z = 0 it lies under the centre, on the barrel; for |a_z| = 1, the face disc is level and it is the disc's centre.
 * Its height is headLowestPoint's, up to rounding. A box's is its support point, −Σ_i sign(R_zi)·c_i·x̂_i − e·ẑ from
 * its centre, sign(0) = 0. simulateImpact samples the head's turf there.
 */
export function headBottom(state: HeadState, head: MalletHead): Vec3 {
    const { shape } = head;
    if (shape.kind === "box") {
        // The support point −Σ_i sign(R_zi)·c_i·x̂_i − e·ẑ, sign(0) = 0: a level face samples its midline (design
        // §3.4; plan decision 1).
        const c = boxCore(shape, head.length);
        const q = state.orientation;
        const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);
        const ax = rotate(q, vec3(1, 0, 0));
        const ay = rotate(q, vec3(0, 1, 0));
        const az = rotate(q, vec3(0, 0, 1));
        const lift = add(add(scale(ax, sign(ax.z) * c.x), scale(ay, sign(ay.z) * c.y)), scale(az, sign(az.z) * c.z));
        return sub(sub(state.position, lift), vec3(0, 0, shape.edgeRadius));
    }
    const a = rotate(state.orientation, vec3(1, 0, 0));
    const half = head.length / 2;
    const end = a.z > 0 ? scale(a, half) : a.z < 0 ? scale(a, 0 - half) : vec3(0, 0, 0);
    const rise = vec3(0 - a.z * a.x, 0 - a.z * a.y, 1 - a.z * a.z);
    const size = length(rise);
    const across = size > 0 ? scale(rise, shape.radius / size) : vec3(0, 0, 0);
    return sub(sub(state.position, end), across);
}

/**
 * The head's horizontal half-extents (m) about its centre along world x and y, z 0 (P2b.2b.2b.3 design §4.1): the
 * fallback bound of headColumns, and a bound on the whole head. A box's Σ_i |R_ki|·h_i over its full box's
 * half-extents h = (L/2, h_y, h_z), which bound the rounded box; a cylinder's (L/2)·|a_k| + r·√(1 − a_k²), a the unit
 * axis.
 */
export function headExtent(state: HeadState, head: MalletHead): Vec3 {
    const q = state.orientation;
    const ax = rotate(q, vec3(1, 0, 0));
    const half = head.length / 2;
    const { shape } = head;
    if (shape.kind === "box") {
        const ay = rotate(q, vec3(0, 1, 0));
        const az = rotate(q, vec3(0, 0, 1));
        return vec3(
            Math.abs(ax.x) * half + Math.abs(ay.x) * shape.halfWidth + Math.abs(az.x) * shape.halfHeight,
            Math.abs(ax.y) * half + Math.abs(ay.y) * shape.halfWidth + Math.abs(az.y) * shape.halfHeight,
            0,
        );
    }
    const r = shape.radius;
    return vec3(
        Math.abs(ax.x) * half + r * Math.sqrt(Math.max(0, 1 - ax.x * ax.x)),
        Math.abs(ax.y) * half + r * Math.sqrt(Math.max(0, 1 - ax.y * ax.y)),
        0,
    );
}

/** A horizontal bound [x0, x1, y0, y1] (m), as headReach gives it. */
export type Reach = readonly [number, number, number, number];

/** Widens `bound` (or none) to take in (x, y). */
function reachTo(bound: Reach | null, x: number, y: number): Reach {
    if (bound === null) {
        return [x, x, y, y];
    }
    return [Math.min(bound[0], x), Math.max(bound[1], x), Math.min(bound[2], y), Math.max(bound[3], y)];
}

/** Widens `bound` (or none) to take in every point of segment a–b with z ≤ `top`. */
function reachBelow(bound: Reach | null, a: Vec3, b: Vec3, top: number): Reach | null {
    let reach = bound;
    if (a.z <= top) {
        reach = reachTo(reach, a.x, a.y);
    }
    if (b.z <= top) {
        reach = reachTo(reach, b.x, b.y);
    }
    if ((a.z < top && b.z > top) || (a.z > top && b.z < top)) {
        const t = (top - a.z) / (b.z - a.z);
        reach = reachTo(reach, a.x + t * (b.x - a.x), a.y + t * (b.y - a.y));
    }
    return reach;
}

/**
 * A horizontal bound [x0, x1, y0, y1] (m) on the head's part below the turf plane, or null where none of it is (the
 * head–turf law's columns; a cost bound only): every (x, y) where headUnderside is below 0 lies
 * within it. A rounded box is its core ⊕ a ball of radius e, so a point below z = 0 lies within e of a core point below
 * z = e: the bound is the core's part below e (its vertices and its edges' crossings of z = e) widened by e. A
 * cylinder's point lies within r of its axis, and below z = 0 only where the axis is below r·√(1 − a_z²): the axis's
 * part below that, widened by r.
 */
export function headReach(state: HeadState, head: MalletHead): Reach | null {
    const q = state.orientation;
    const ax = rotate(q, vec3(1, 0, 0));
    const c0 = state.position;
    const { shape } = head;
    let reach: Reach | null = null;
    let grow: number;
    if (shape.kind === "box") {
        const core = boxCore(shape, head.length);
        grow = shape.edgeRadius;
        const x = scale(ax, core.x);
        const y = scale(rotate(q, vec3(0, 1, 0)), core.y);
        const z = scale(rotate(q, vec3(0, 0, 1)), core.z);
        // The core's twelve edges, four along each body axis: every vertex is an end of some edge.
        for (const s1 of SIGNS) {
            for (const s2 of SIGNS) {
                const xs = add(c0, add(scale(y, s1), scale(z, s2)));
                reach = reachBelow(reach, sub(xs, x), add(xs, x), grow);
                const ys = add(c0, add(scale(x, s1), scale(z, s2)));
                reach = reachBelow(reach, sub(ys, y), add(ys, y), grow);
                const zs = add(c0, add(scale(x, s1), scale(y, s2)));
                reach = reachBelow(reach, sub(zs, z), add(zs, z), grow);
            }
        }
    } else {
        grow = shape.radius;
        const half = scale(ax, head.length / 2);
        const top = shape.radius * Math.sqrt(Math.max(0, 1 - ax.z * ax.z));
        reach = reachBelow(null, sub(c0, half), add(c0, half), top);
    }
    if (reach === null) {
        return null;
    }
    return [reach[0] - grow, reach[1] + grow, reach[2] - grow, reach[3] + grow];
}

/** The z with A·z² + 2·B·z + C ≤ 0, as [lo, hi]; every z for A = 0 and C ≤ 0; null where there is none. */
function quadraticSpan(a: number, b: number, c: number): readonly [number, number] | null {
    if (a === 0) {
        return c <= 0 ? [0 - Infinity, Infinity] : null;
    }
    const disc = b * b - a * c;
    if (disc < 0) {
        return null;
    }
    const root = Math.sqrt(disc);
    return [(0 - b - root) / a, (0 - b + root) / a];
}

/** The z with |p + z·u| ≤ half, one slab of a box, as [lo, hi]; every z for u = 0 inside it; null where none. */
function slabSpan(p: number, u: number, half: number): readonly [number, number] | null {
    if (u === 0) {
        return Math.abs(p) <= half ? [0 - Infinity, Infinity] : null;
    }
    const a = (0 - half - p) / u;
    const b = (half - p) / u;
    return a < b ? [a, b] : [b, a];
}

/** The lowest z of two spans' overlap, or Infinity where either is null or they do not overlap. */
function entryOf(a: readonly [number, number] | null, b: readonly [number, number] | null): number {
    if (a === null || b === null) {
        return Infinity;
    }
    const lo = Math.max(a[0], b[0]);
    return lo <= Math.min(a[1], b[1]) ? lo : Infinity;
}

/** Where the line p + z·u (body frame) enters the axis-aligned box of half-extents `half`, or Infinity. */
function boxEntry(p: Vec3, u: Vec3, half: Vec3): number {
    const x = slabSpan(p.x, u.x, half.x);
    const y = slabSpan(p.y, u.y, half.y);
    const z = slabSpan(p.z, u.z, half.z);
    return entryOf(x === null || y === null ? null : [Math.max(x[0], y[0]), Math.min(x[1], y[1])], z);
}

/**
 * Where the line enters a cylinder of radius `radius` along one body axis: `along` and `rate` its axial coordinate
 * and rate, within ±`half`; `a`, `b` and `ua`, `ub` its two across coordinates from the axis and their rates.
 */
function rodEntry(
    along: number,
    rate: number,
    half: number,
    a: number,
    ua: number,
    b: number,
    ub: number,
    radius: number,
): number {
    const round = quadraticSpan(ua * ua + ub * ub, a * ua + b * ub, a * a + b * b - radius * radius);
    return entryOf(slabSpan(along, rate, half), round);
}

const SIGNS = [-1, 1] as const;

/**
 * A rounded box's half-extents as roundedBoxEntry reads them, worked out once for a head's every column in a step
 * (cost only): its core c, edge radius e, the core grown by e on every axis, and grown on x, y and z alone.
 */
interface BoxFrame {
    readonly c: Vec3;
    readonly e: number;
    readonly grown: Vec3;
    readonly grownX: Vec3;
    readonly grownY: Vec3;
    readonly grownZ: Vec3;
}

function boxFrame(shape: BoxShape, length: number): BoxFrame {
    const c = boxCore(shape, length);
    const e = shape.edgeRadius;
    return {
        c,
        e,
        grown: vec3(c.x + e, c.y + e, c.z + e),
        grownX: vec3(c.x + e, c.y, c.z),
        grownY: vec3(c.x, c.y + e, c.z),
        grownZ: vec3(c.x, c.y, c.z + e),
    };
}

/**
 * Where the line p + z·u (body frame) enters the rounded box `f` (P2b.2b.2b.3 plan decision 9); `uu` is u·u. The box
 * grown by e on every axis contains it; where the line enters that box on a flat face (at most one coordinate beyond
 * the core), the entry is exact. Otherwise it enters on an edge or a corner, and the rounded box is the union of three
 * slab-grown boxes, twelve edge cylinders and eight corner spheres: its entry is the lowest of theirs.
 */
function roundedBoxEntry(p: Vec3, u: Vec3, uu: number, f: BoxFrame): number {
    const { c, e } = f;
    const grown = boxEntry(p, u, f.grown);
    if (!(grown < Infinity) || e === 0) {
        return grown;
    }
    const q = add(p, scale(u, grown));
    const beyond = (Math.abs(q.x) > c.x ? 1 : 0) + (Math.abs(q.y) > c.y ? 1 : 0) + (Math.abs(q.z) > c.z ? 1 : 0);
    if (beyond <= 1) {
        return grown;
    }
    let lowest = Math.min(boxEntry(p, u, f.grownX), boxEntry(p, u, f.grownY), boxEntry(p, u, f.grownZ));
    for (const s1 of SIGNS) {
        for (const s2 of SIGNS) {
            lowest = Math.min(
                lowest,
                rodEntry(p.x, u.x, c.x, p.y - s1 * c.y, u.y, p.z - s2 * c.z, u.z, e),
                rodEntry(p.y, u.y, c.y, p.x - s1 * c.x, u.x, p.z - s2 * c.z, u.z, e),
                rodEntry(p.z, u.z, c.z, p.x - s1 * c.x, u.x, p.y - s2 * c.y, u.y, e),
            );
            for (const s3 of SIGNS) {
                const d = sub(p, vec3(s1 * c.x, s2 * c.y, s3 * c.z));
                const ball = quadraticSpan(uu, dot(d, u), dot(d, d) - e * e);
                lowest = Math.min(lowest, ball === null ? Infinity : ball[0]);
            }
        }
    }
    return lowest;
}

/**
 * The head's underside over the turf (P2b.2b.2b.3 design §4.1): for head state `state`, a function giving the world
 * height at which the vertical line through (x, y) enters the head from below (a cylinder, or the rounded box: its
 * core box Minkowski-summed with a sphere of the edge radius), or Infinity where the line misses it. The line through
 * (x, y) is p + z·u in the body frame, p the body-frame image of (x, y, 0) and u of ẑ, so its parameter is the world
 * height. The head's frame is computed once, for the head's every column in a step.
 */
export function headUnderside(state: HeadState, head: MalletHead): (x: number, y: number) => number {
    const q = state.orientation;
    const ex = rotateInverse(q, vec3(1, 0, 0));
    const ey = rotateInverse(q, vec3(0, 1, 0));
    const u = rotateInverse(q, UP);
    const base = scale(u, 0 - state.position.z);
    const { shape } = head;
    const frame = shape.kind === "box" ? boxFrame(shape, head.length) : null;
    const uu = dot(u, u);
    const radius = shape.kind === "box" ? 0 : shape.radius;
    const { x: cx, y: cy } = state.position;
    return (x, y) => {
        // add(add(scale(ex, dx), scale(ey, dy)), base), spelt out to spare its temporaries: the same operations in the
        // same order, so the same bits.
        const dx = x - cx;
        const dy = y - cy;
        const p = vec3(ex.x * dx + ey.x * dy + base.x, ex.y * dx + ey.y * dy + base.y, ex.z * dx + ey.z * dy + base.z);
        if (frame !== null) {
            return roundedBoxEntry(p, u, uu, frame);
        }
        const round = quadraticSpan(
            u.y * u.y + u.z * u.z,
            p.y * u.y + p.z * u.z,
            p.y * p.y + p.z * p.z - radius * radius,
        );
        return entryOf(slabSpan(p.x, u.x, head.length / 2), round);
    };
}
