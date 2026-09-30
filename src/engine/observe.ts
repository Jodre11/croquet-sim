/**
 * Post-hoc observation of events that do not affect motion (out of court, hoop passages). Implemented in Task 10.
 */
import type { BallId, Segment, ShotEvent, World } from "./types";

/** Returns observed events for the given segments. */
export function observe(_segments: Partial<Record<BallId, readonly Segment[]>>, _world: World): ShotEvent[] {
    return [];
}
