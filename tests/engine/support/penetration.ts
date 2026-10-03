import { horizontal, length, sub, type Vec3 } from "../../../src/engine/math/vec3";
import { segmentState } from "../../../src/engine/sample";
import { BALL_IDS, type Segment, type ShotResult, type World } from "../../../src/engine/types";
import { obstaclesOf } from "../../../src/engine/world";

/**
 * Worst interpenetration (m) between balls or with obstacles, sampled every millisecond and at every segment's
 * t0 and t1 boundaries.
 *
 * The sample times are visited in ascending order with one cursor per ball, so each ball's segment is found by
 * advancing its cursor rather than by scanning all its segments (stateAtTime's rule: the last segment with t0 ≤ t).
 * That keeps the cost linear in samples plus segments; shots with thousands of segments made the scan quadratic.
 */
export function worstPenetration(result: ShotResult, world: World): number {
    const R = world.ball.radius;
    const ids = BALL_IDS.filter((id) => result.segments[id]);
    const obstacles = obstaclesOf(world);
    const times: number[] = [];
    for (let t = 0; t <= result.duration; t += 0.001) {
        times.push(t);
    }
    for (const id of ids) {
        for (const s of result.segments[id] ?? []) {
            times.push(s.t0, s.t1);
        }
    }
    times.sort((a, b) => a - b);
    const tracks = ids.map((id) => result.segments[id] as readonly Segment[]);
    const cursors = ids.map(() => 0);
    let worst = 0;
    for (const t of times) {
        const centres: Vec3[] = tracks.map((segments, k) => {
            let i = cursors[k] as number;
            while (i + 1 < segments.length && (segments[i + 1] as Segment).t0 <= t) {
                i++;
            }
            cursors[k] = i;
            const s = segments[i] as Segment;
            return segmentState(s, Math.min(Math.max(t - s.t0, 0), s.t1 - s.t0)).position;
        });
        centres.forEach((a, i) => {
            centres.slice(i + 1).forEach((b) => {
                worst = Math.max(worst, 2 * R - length(sub(a, b)));
            });
            for (const o of obstacles) {
                worst = Math.max(worst, R + o.radius - length(horizontal(sub(a, o.centre))));
            }
        });
    }
    return worst;
}
