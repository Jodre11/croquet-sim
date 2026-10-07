/**
 * Finite-difference continuity at a SwingTrajectory's segment boundaries (P2b.2b.2a design §4.3, exit criterion 3).
 * Test support only.
 */
import type { TrackDrive } from "../../../src/engine/impact/types";
import { add, length, scale, sub } from "../../../src/engine/math/vec3";
import type { StrokeSample, SwingTrajectory } from "../../../src/engine/swing/trajectory";

/** Two samples closer than this in time (s) are taken to be at the same instant. */
const SAME_TIME = 1e-12;

/** Interior sample pairs on either side of a boundary that set its acceleration bound. */
const INTERIOR_PAIRS = 5;

/** The margin on the interior pairs' largest acceleration. */
const ACCEL_MARGIN = 1.5;

/** The velocity slack (m/s) on top of the acceleration bound: exit criterion 3's tolerance. */
export const VELOCITY_SLACK = 1e-4;

/** The position tolerance (m) against the trapezoid rule: exit criterion 3's. */
export const POSITION_SLACK = 1e-6;

/** One boundary's check: the pair of samples whose producers differ, and how far it departs from smooth motion. */
export interface BoundaryJump {
    readonly name: string;
    /** The pair's earlier sample index and its spacing (s). */
    readonly index: number;
    readonly dt: number;
    /** |Δp − ½(v₀ + v₁)·Δt| (m). */
    readonly position: number;
    /** |Δv| (m/s), and its bound: ACCEL_MARGIN times one side's largest interior |Δv|/Δt, times Δt, plus slack. */
    readonly velocity: number;
    readonly bound: number;
}

const at = (samples: readonly StrokeSample[], i: number): StrokeSample => samples[i] as StrokeSample;

/** |Δv|/Δt of the pair (i, i + 1). */
function rate(samples: readonly StrokeSample[], i: number): number {
    const a = at(samples, i);
    const b = at(samples, i + 1);
    return length(sub(b.velocity, a.velocity)) / (b.t - a.t);
}

/** Which side of a boundary sets its acceleration bound: the one whose motion carries no impulsive force. */
type Side = "before" | "after";

/** The jump across the pair (i, i + 1), bounded by the INTERIOR_PAIRS pairs before i or after i + 1 (`side`). */
function jumpAt(samples: readonly StrokeSample[], name: string, i: number, side: Side): BoundaryJump {
    const a = at(samples, i);
    const b = at(samples, i + 1);
    const dt = b.t - a.t;
    const trapezoid = scale(add(a.velocity, b.velocity), 0.5 * dt);
    let accel = 0;
    for (let k = 1; k <= INTERIOR_PAIRS; k++) {
        if (side === "before" && i - k >= 0) {
            accel = Math.max(accel, rate(samples, i - k));
        }
        if (side === "after" && i + k + 1 < samples.length) {
            accel = Math.max(accel, rate(samples, i + k));
        }
    }
    return {
        name,
        index: i,
        dt,
        position: length(sub(sub(b.head, a.head), trapezoid)),
        velocity: length(sub(b.velocity, a.velocity)),
        bound: ACCEL_MARGIN * accel * dt + VELOCITY_SLACK,
    };
}

/** The last sample index at or before t (s from contact), within SAME_TIME. */
function lastAtOrBefore(samples: readonly StrokeSample[], t: number): number {
    let i = 0;
    while (i + 1 < samples.length && at(samples, i + 1).t <= t + SAME_TIME) {
        i++;
    }
    return i;
}

/**
 * The jump at each segment boundary of `trajectory`, the stroke's tracked `drive`, across the pair of samples whose
 * producers differ: the release (its sample, the head held at rest before it, against the next; inside the impact,
 * where the impact starts before it, the pair spanning it); the impact's
 * start (the downswing's last sample against the integrator's first; none when the impact starts before the
 * release); the impact's end (the impact loop's last state against the follow-through's first sample); and, for a
 * stop, the hold's start, max(the check's window's end, the impact's end), the pair spanning the first held step. The
 * acceleration bound comes from the downswing's side at the impact's start, and elsewhere from the side away from
 * the impact: the downswing after the release, the follow-through after the impact's end and the hold. A boundary at
 * the last sample (a follow-through finished where the impact ended) has no pair and no jump.
 */
export function boundaryJumps(trajectory: SwingTrajectory, drive: TrackDrive): BoundaryJump[] {
    const { samples } = trajectory;
    const { arc } = drive;
    const jumps: BoundaryJump[] = [jumpAt(samples, "release", lastAtOrBefore(samples, trajectory.top), "after")];
    const start = lastAtOrBefore(samples, trajectory.impactStart);
    if (start > 0) {
        jumps.push(jumpAt(samples, "impact start", start - 1, "before"));
    }
    const end = lastAtOrBefore(samples, trajectory.impactEnd);
    if (end + 1 < samples.length) {
        jumps.push(jumpAt(samples, "impact end", end, "after"));
    }
    // integrate.ts's continueStroke: a check (swing mode, α < 0) holds from max(the window's end, the impact's end).
    if (arc.mode === "swing" && arc.alpha < 0) {
        const hold = lastAtOrBefore(samples, Math.max(arc.arcStart + arc.window - arc.contactAt, trajectory.impactEnd));
        if (hold + 1 < samples.length) {
            jumps.push(jumpAt(samples, "hold", hold, "after"));
        }
    }
    return jumps;
}
