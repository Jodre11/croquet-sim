/**
 * Evaluates a ShotResult at an arbitrary time, for rendering, observation and tests.
 */
import { advance, trajectory, type Trajectory } from "./motion";
import { pushedState, pushedTrajectory } from "./push";
import type { BallId, BallState, Segment, ShotResult } from "./types";

/** Returns the state a time `local` (0 ≤ local ≤ t1 − t0) after the segment's start. */
export function segmentState(segment: Segment, local: number): BallState {
    return segment.push
        ? pushedState(segment.start, segment.push, local)
        : advance(segment.start, segment.phase, segment.params, local);
}

/** Returns the segment's centre trajectory, with t measured from the segment's start. */
export function segmentTrajectory(segment: Segment): Trajectory {
    return segment.push
        ? pushedTrajectory(segment.start, segment.push)
        : trajectory(segment.start, segment.phase, segment.params);
}

/** Returns the ball's state at time t, clamped to [0, duration]. Throws if the ball was not in play. */
export function stateAtTime(result: ShotResult, ball: BallId, t: number): BallState {
    const segments = result.segments[ball];
    const first = segments?.[0];
    if (!segments || !first) {
        throw new RangeError(`ball ${ball} is not in this result`);
    }
    let segment = first;
    for (const s of segments) {
        if (s.t0 <= t) {
            segment = s;
        }
    }
    return segmentState(segment, Math.min(Math.max(t - segment.t0, 0), segment.t1 - segment.t0));
}
