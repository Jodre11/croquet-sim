/**
 * Hoop-run verdict per the Laws (reference/laws.json): a ball runs its target hoop in a stroke if it starts
 * eligible, passes through in the running direction, and ends the stroke having completed the running.
 *
 * P1 caveat: only position thresholds are judged. Laws 20.2.2 (completing the run in a later stroke) and 20.4.1
 * (entering from the wrong side) need per-ball history and are not modelled.
 */
import { dot, horizontal, sub, type Vec3 } from "./math/vec3";
import type { BallId, ShotResult, World } from "./types";
import { ruleThreshold } from "./world";

/** The hoop the striker's ball is attempting, and the direction (+1 along the hoop normal, −1 against). */
export interface HoopTarget {
    readonly hoopId: string;
    readonly direction: 1 | -1;
}

/** Outcome of a hoop attempt. */
export type HoopRunVerdict = "ran" | "not-eligible" | "no-passage" | "incomplete";

/** Judges whether `ball` ran the target hoop in this shot. */
export function judgeHoopRun(result: ShotResult, ball: BallId, target: HoopTarget, world: World): HoopRunVerdict {
    const hoop = world.hoops.find((h) => h.id === target.hoopId);
    if (!hoop) {
        throw new RangeError(`unknown hoop ${target.hoopId}`);
    }
    const first = result.segments[ball]?.[0];
    const rest = result.rest[ball];
    if (!first || !rest) {
        throw new RangeError(`ball ${ball} is not in this result`);
    }
    const R = world.ball.radius;
    const r = hoop.uprightRadius;
    // Signed distance of the centre from the plane through the uprights' axes, positive in the running direction.
    const signed = (p: Vec3): number => dot(horizontal(sub(p, hoop.centre)), hoop.normal) * target.direction;
    const start = first.start.position;

    if (signed(start) > ruleThreshold(world.hoopRunStart, R, r)) {
        return "not-eligible";
    }
    const own = result.events.filter((e) => e.kind === "hoop-passage" && e.ball === ball && e.hoopId === hoop.id);
    const last = own[own.length - 1];
    if (!last || last.kind !== "hoop-passage" || last.direction !== target.direction) {
        return "no-passage";
    }
    if (signed(rest) < ruleThreshold(world.hoopRunComplete, R, r)) {
        return "incomplete";
    }
    return "ran";
}
