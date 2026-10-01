import { horizontal, length, sub, type Vec3 } from "../../../src/engine/math/vec3";
import { stateAtTime } from "../../../src/engine/sample";
import { BALL_IDS, type ShotResult, type World } from "../../../src/engine/types";
import { obstaclesOf } from "../../../src/engine/world";

/**
 * Worst interpenetration (m) between balls or with obstacles, sampled every millisecond and at every segment's
 * t0 and t1 boundaries.
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
    let worst = 0;
    for (const t of times) {
        const centres: Vec3[] = ids.map((id) => stateAtTime(result, id, t).position);
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
