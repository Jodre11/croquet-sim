/**
 * Post-hoc observation of events that do not change the motion: a ball going out of court and a ball's centre
 * crossing a hoop's plane between the uprights. Both are found from the recorded segments.
 */
import { boundaryCrossingTime } from "./detect";
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
function passages(id: BallId, segments: readonly Segment[], hoop: Hoop): ShotEvent[] {
    const events: ShotEvent[] = [];
    const record = (t: number, position: Vec3, direction: 1 | -1): void => {
        const lateral = dot(horizontal(sub(position, hoop.centre)), hoopLateral(hoop));
        if (Math.abs(lateral) < hoopHalfSpan(hoop)) {
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

/** Returns out-of-court and hoop-passage events for the recorded segments, in ball order. */
export function observe(segmentsByBall: Partial<Record<BallId, readonly Segment[]>>, world: World): ShotEvent[] {
    const events: ShotEvent[] = [];
    for (const id of BALL_IDS) {
        const segments = segmentsByBall[id];
        if (!segments) {
            continue;
        }
        events.push(...outOfCourt(id, segments, world));
        for (const hoop of world.hoops) {
            events.push(...passages(id, segments, hoop));
        }
    }
    return events;
}
