/**
 * Post-hoc observation of events that do not change the motion, found from the recorded segments: a ball going out of
 * court, a ball's centre crossing a hoop's plane between the uprights, and jumps outside the validated model. All are
 * judged on the horizontal projection of the centre, in flight or not; a hoop passage made with the ball's top at or
 * above the crown's underside is not recorded (the ball went over the hoop).
 */
import { boundaryCrossingTime, firstNonNegative } from "./detect";
import { realRootsInInterval } from "./math/poly";
import { add, dot, horizontal, scale, sub, type Vec3 } from "./math/vec3";
import type { Trajectory } from "./motion";
import { segmentState, segmentTrajectory } from "./sample";
import { BALL_IDS, type BallId, type Hoop, type Segment, type ShotEvent, type World } from "./types";
import { hoopHalfSpan, hoopLateral, ruleThreshold } from "./world";

function positionAt(p: Trajectory, t: number): Vec3 {
    return add(add(p.c0, scale(p.c1, t)), scale(p.c2, t * t));
}

function outOfCourt(id: BallId, segments: readonly Segment[], world: World): ShotEvent[] {
    const threshold = ruleThreshold(world.outOfCourt, world.ball.radius, 0);
    for (const segment of segments) {
        const path = segmentTrajectory(segment);
        const dt = boundaryCrossingTime(path, world.lawn, threshold, segment.t1 - segment.t0);
        if (dt !== null) {
            return [{ kind: "out-of-court", t: segment.t0 + dt, ball: id, position: positionAt(path, dt) }];
        }
    }
    return [];
}

/** Which side of the hoop's plane a centre lies on: +1 on the side `normal` points to (or on the plane), else −1. */
function side(hoop: Hoop, position: Vec3): 1 | -1 {
    return dot(horizontal(sub(position, hoop.centre)), hoop.normal) >= 0 ? 1 : -1;
}

/**
 * Crossings of one hoop's plane by one ball. The side of the plane at every segment boundary is taken from the
 * recorded states (each segment's start, and the final state), which the solver computed once and shares between
 * adjacent segments, so a crossing at a boundary is seen by exactly one segment. Within a segment only roots strictly
 * inside (0, duration) are used, and they are reconciled with the boundary sides: an odd number of genuine crossings
 * must change the side and an even number must not. A disagreement can only come from a root lost or found by
 * rounding next to a boundary, and is repaired there.
 */
function passages(id: BallId, segments: readonly Segment[], hoop: Hoop, radius: number): ShotEvent[] {
    const events: ShotEvent[] = [];
    const record = (t: number, position: Vec3, direction: 1 | -1): void => {
        const lateral = dot(horizontal(sub(position, hoop.centre)), hoopLateral(hoop));
        const under = position.z + radius < hoop.crownClearance;
        if (Math.abs(lateral) < hoopHalfSpan(hoop) && under) {
            events.push({ kind: "hoop-passage", t, ball: id, hoopId: hoop.id, direction });
        }
    };
    segments.forEach((segment, k) => {
        const duration = segment.t1 - segment.t0;
        const next = segments[k + 1];
        const endState = next ? next.start : segmentState(segment, duration);
        const before = side(hoop, segment.start.position);
        const after = side(hoop, endState.position);
        const path = segmentTrajectory(segment);
        const n = hoop.normal;
        const coeffs = [dot(horizontal(sub(path.c0, hoop.centre)), n), dot(path.c1, n), dot(path.c2, n)];
        const slope = (t: number): number => (coeffs[1] ?? 0) + 2 * (coeffs[2] ?? 0) * t;
        // Interior crossings only; a zero-slope root is a tangency, not a crossing.
        const roots = realRootsInInterval(coeffs, 0, duration).filter((t) => t > 0 && t < duration && slope(t) !== 0);
        const changed = before !== after;
        if (roots.length % 2 === 1 && !changed) {
            // A spurious root beside a boundary: drop the one nearest either end.
            const edge = (t: number): number => Math.min(t, duration - t);
            const nearest = roots.reduce((best, t) => (edge(t) < edge(best) ? t : best));
            roots.splice(roots.indexOf(nearest), 1);
        } else if (roots.length % 2 === 0 && changed) {
            // A crossing lost at a boundary: place it at whichever end lies closer to the plane.
            const atStart =
                Math.abs(coeffs[0] ?? 0) <= Math.abs(dot(horizontal(sub(endState.position, hoop.centre)), n));
            const t = atStart ? 0 : duration;
            record(segment.t0 + t, atStart ? segment.start.position : endState.position, after);
        }
        for (const t of roots) {
            record(segment.t0 + t, positionAt(path, t), slope(t) > 0 ? 1 : -1);
        }
    });
    return events.sort((a, b) => a.t - b.t);
}

/** The segment covering time t (the last one starting at or before it), as a trajectory from t. */
function pathFrom(segments: readonly Segment[], t: number): Trajectory {
    let segment = segments[0] as Segment;
    for (const s of segments) {
        if (s.t0 <= t) {
            segment = s;
        }
    }
    return segmentTrajectory({ ...segment, start: segmentState(segment, t - segment.t0) });
}

/**
 * The first time a's and b's centres come within one radius of each other horizontally (one passes over the other),
 * reported against the higher ball. Only stretches where one of them is airborne are searched: two balls on the turf
 * are always at least two radii apart. A halted ball still counts: it rests at least a halt margin beyond the boundary,
 * where a ball passing over it is out of court anyway.
 */
function overBall(a: BallId, b: BallId, sa: readonly Segment[], sb: readonly Segment[], R: number): ShotEvent[] {
    const end = Math.min((sa[sa.length - 1] as Segment).t1, (sb[sb.length - 1] as Segment).t1);
    const times = [...new Set([...sa, ...sb].map((s) => s.t0))].filter((t) => t < end).sort((x, y) => x - y);
    for (let k = 0; k < times.length; k++) {
        const t0 = times[k] as number;
        const t1 = times[k + 1] ?? end;
        const pa = pathFrom(sa, t0);
        const pb = pathFrom(sb, t0);
        if (pa.c2.z === 0 && pb.c2.z === 0 && pa.c1.z === 0 && pb.c1.z === 0 && pa.c0.z === pb.c0.z) {
            continue;
        }
        const A = horizontal(sub(pa.c0, pb.c0));
        const B = horizontal(sub(pa.c1, pb.c1));
        const C = horizontal(sub(pa.c2, pb.c2));
        // R² − |A + B·t + C·t²|², non-negative once the centres are within one radius horizontally.
        const g = [
            R * R - dot(A, A),
            0 - 2 * dot(A, B),
            0 - (dot(B, B) + 2 * dot(A, C)),
            0 - 2 * dot(B, C),
            0 - dot(C, C),
        ];
        const dt = firstNonNegative(g, t1 - t0);
        if (dt !== null) {
            const higher = positionAt(pa, dt).z >= positionAt(pb, dt).z;
            return [{ kind: "jump", t: t0 + dt, ball: higher ? a : b, over: higher ? b : a }];
        }
    }
    return [];
}

/**
 * The first time the ball's top reaches the lowest crown's underside, if it does. The flag is court-wide by design: a
 * ball that high is far outside the validated (skimming) model wherever it is, and near a hoop the infinite uprights
 * stop being faithful.
 */
function overCrown(id: BallId, segments: readonly Segment[], crown: number, R: number): ShotEvent[] {
    for (const segment of segments) {
        if (segment.phase !== "airborne") {
            continue;
        }
        const path = segmentTrajectory(segment);
        const dt = firstNonNegative([path.c0.z + R - crown, path.c1.z, path.c2.z], segment.t1 - segment.t0);
        if (dt !== null) {
            return [{ kind: "jump", t: segment.t0 + dt, ball: id, over: "crown" }];
        }
    }
    return [];
}

/** Returns out-of-court, hoop-passage and jump events for the recorded segments, in ball order. */
export function observe(segmentsByBall: Partial<Record<BallId, readonly Segment[]>>, world: World): ShotEvent[] {
    const events: ShotEvent[] = [];
    const R = world.ball.radius;
    const ids = BALL_IDS.filter((id) => (segmentsByBall[id]?.length ?? 0) > 0);
    const crown = Math.min(...world.hoops.map((h) => h.crownClearance));
    for (const id of ids) {
        const segments = segmentsByBall[id] as readonly Segment[];
        events.push(...outOfCourt(id, segments, world));
        for (const hoop of world.hoops) {
            events.push(...passages(id, segments, hoop, R));
        }
        if (Number.isFinite(crown)) {
            events.push(...overCrown(id, segments, crown, R));
        }
    }
    ids.forEach((a, i) => {
        for (const b of ids.slice(i + 1)) {
            const sa = segmentsByBall[a] as readonly Segment[];
            const sb = segmentsByBall[b] as readonly Segment[];
            events.push(...overBall(a, b, sa, sb, R));
        }
    });
    return events;
}
