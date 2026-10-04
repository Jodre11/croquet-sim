/**
 * Hands the balls at the end of the impact to phase 2 (P2b.1 design §6).
 *
 * A ball clear of the turf (z ≥ R) goes as it is. A ball still in turf contact (z < R) is placed on the lawn,
 * z = R. It keeps an upward vertical velocity of at least SETTLE_SPEED, so it starts airborne; otherwise it loses its
 * vertical velocity, phase 2's own rule for a ball on the plane. The stored energy of its residual sink, m·g·δ₀/2, is
 * discarded.
 *
 * Contacts release while δ > 0, so a pair can end the impact still overlapping. Each such pair, in BALL_IDS order, is
 * pushed apart along its normal to zero gap, each ball half the overlap, velocities unchanged. A ball is never moved
 * below the turf: a downward half-move leaves it at z = R, and the other ball takes the rest (`separated`).
 *
 * Balls are also cleared from every obstacle they overlap (hoop uprights and the peg; P2b.2a design §6): moved
 * horizontally outward along the obstacle's normal to zero gap (outsideObstacle), velocities unchanged. Each pass
 * separates the ball pairs, then the ball–obstacle pairs, ball by ball and obstacle by obstacle.
 *
 * One pass cannot separate a chain of three balls: separating the second pair pushes the middle ball back into the
 * first. The same fixed-order pass therefore repeats until no pair overlaps by more than HANDOVER_RESIDUAL, at most
 * HANDOVER_PASSES times. A pair alone is separated by the first pass.
 */
import { add, horizontal, length, scale, sub, vec3, type Vec3 } from "../math/vec3";
import { SETTLE_SPEED } from "../resolve";
import { BALL_IDS, type BallId, type BallState, type BallStates } from "../types";
import { outsideObstacle, type ObstacleGeometry } from "./contacts";

/**
 * Overlap (m) a handover may leave. Numerical, not physical: far below phase 2's CONTACT_TOLERANCE (1e-9), so phase 2
 * accepts the pair, and above the ulp-level rounding of a separated pair.
 */
const HANDOVER_RESIDUAL = 1e-12;

/** Bound on the separation passes. Numerical, not physical: a chain's overlap shrinks geometrically per pass. */
const HANDOVER_PASSES = 64;

/**
 * The balls as phase 2 receives them, and the largest overlap (m) removed from a pair of balls or a ball and an
 * obstacle.
 */
export interface Handover {
    readonly balls: BallStates;
    readonly overlapCorrection: number;
}

function placed(s: BallState, radius: number): BallState {
    if (s.position.z >= radius) {
        return s;
    }
    return {
        position: vec3(s.position.x, s.position.y, radius),
        velocity: s.velocity.z >= SETTLE_SPEED ? s.velocity : horizontal(s.velocity),
        angularVelocity: s.angularVelocity,
    };
}

function aboveTurf(p: Vec3, radius: number): Vec3 {
    return p.z >= radius ? p : vec3(p.x, p.y, radius);
}

/**
 * Centres `a` and `b` moved apart along their line of centres to 2R, half each, neither below the turf. A half-move
 * clamped at the turf leaves the pair short by about ½·overlap·n_z², first order in the overlap; the other ball, which
 * moves away from the turf, then takes the rest along the new line of centres.
 */
function separated(a: Vec3, b: Vec3, radius: number): readonly [Vec3, Vec3] {
    const offset = sub(b, a);
    const distance = length(offset);
    const move = scale(offset, (2 * radius - distance) / (2 * distance));
    const towardsA = sub(a, move);
    const towardsB = add(b, move);
    const pa = aboveTurf(towardsA, radius);
    const pb = aboveTurf(towardsB, radius);
    const rest = sub(pb, pa);
    const apart = length(rest);
    const short = 2 * radius - apart;
    if (!(short > 0)) {
        return [pa, pb];
    }
    const push = scale(rest, short / apart);
    if (pa !== towardsA) {
        return [pa, add(pb, push)];
    }
    if (pb !== towardsB) {
        return [sub(pa, push), pb];
    }
    return [pa, pb];
}

/** The largest overlap (m) of any pair of balls or any ball and obstacle (0 when none), and what overlaps. */
function worstOverlap(
    states: readonly BallState[],
    ids: readonly BallId[],
    obstacles: readonly ObstacleGeometry[],
    radius: number,
): { overlap: number; what: string } {
    let worst = { overlap: 0, what: "" };
    for (let i = 0; i < states.length; i++) {
        const p = (states[i] as BallState).position;
        for (let j = i + 1; j < states.length; j++) {
            const distance = length(sub((states[j] as BallState).position, p));
            if (2 * radius - distance > worst.overlap) {
                worst = { overlap: 2 * radius - distance, what: `balls ${ids[i]} and ${ids[j]}` };
            }
        }
        for (const o of obstacles) {
            const overlap = radius + o.radius - length(horizontal(sub(p, o.centre)));
            if (overlap > worst.overlap) {
                worst = { overlap, what: `ball ${ids[i]} and ${o.id}` };
            }
        }
    }
    return worst;
}

/**
 * Places the balls for phase 2, separates overlapping pairs and clears balls from `obstacles` (see the file header).
 * Throws an Error, naming the worst overlap, if `passes` (HANDOVER_PASSES; tests may lower it) leave one above
 * HANDOVER_RESIDUAL: phase 2 would otherwise reject the overlap with a RangeError far from its cause.
 */
export function handover(
    balls: BallStates,
    radius: number,
    obstacles: readonly ObstacleGeometry[] = [],
    passes = HANDOVER_PASSES,
): Handover {
    if (!(passes >= 1) || !Number.isInteger(passes)) {
        throw new RangeError(`handover passes must be a positive integer (got ${passes})`);
    }
    const ids = BALL_IDS.filter((id) => balls[id]);
    const states = ids.map((id) => placed(balls[id] as BallState, radius));
    let overlapCorrection = 0;
    let separatedAll = false;
    for (let pass = 0; pass < passes; pass++) {
        for (let i = 0; i < states.length; i++) {
            for (let j = i + 1; j < states.length; j++) {
                const a = states[i] as BallState;
                const b = states[j] as BallState;
                const offset = sub(b.position, a.position);
                const distance = length(offset);
                const overlap = 2 * radius - distance;
                if (overlap > 0) {
                    const [pa, pb] = separated(a.position, b.position, radius);
                    states[i] = { ...a, position: pa };
                    states[j] = { ...b, position: pb };
                    overlapCorrection = Math.max(overlapCorrection, overlap);
                }
            }
        }
        for (let i = 0; i < states.length; i++) {
            for (const o of obstacles) {
                const s = states[i] as BallState;
                const overlap = radius + o.radius - length(horizontal(sub(s.position, o.centre)));
                if (overlap > 0) {
                    states[i] = { ...s, position: outsideObstacle(s.position, radius, o) };
                    overlapCorrection = Math.max(overlapCorrection, overlap);
                }
            }
        }
        if (!(worstOverlap(states, ids, obstacles, radius).overlap > HANDOVER_RESIDUAL)) {
            separatedAll = true;
            break;
        }
    }
    if (!separatedAll) {
        const worst = worstOverlap(states, ids, obstacles, radius);
        throw new Error(
            `handover: ${worst.what} still overlap by ${worst.overlap} m after ` +
                `${passes} pass${passes === 1 ? "" : "es"}`,
        );
    }
    const result: BallStates = {};
    ids.forEach((id, i) => {
        result[id] = states[i] as BallState;
    });
    return { balls: result, overlapCorrection };
}
