/**
 * The contact timeline (P2b.2a design §5): each pair's intervals of contact. An interval opens at the start of the
 * first step in which the pair is in contact and ends at the start of the first step in which it is not; one still
 * open when the impact ends ends at its duration. Any step out of contact separates two intervals, as the Laws count
 * any second contact. A face–ball pair's gaps also keep their largest clearance, attached to the interval before the
 * gap once the next one opens; and, given the face's record of each step, its intervals keep the face's impulse and the
 * ball's velocities at their ends (P2b.2b.2c.2d design §7).
 */
import { add, type Vec3 } from "../math/vec3";
import type { ContactInterval } from "./types";

/** The face's record of one face–ball step: its impulse on the ball (N·s), the ball's velocity at the step's start. */
export interface FaceStep {
    readonly impulse: Vec3;
    readonly velocity: Vec3;
}

/** One pair's record while the impact runs. */
export interface PairTimeline {
    readonly intervals: ContactInterval[];
    /** Start (s) of the open interval, or null while the pair is out of contact. */
    start: number | null;
    /** Largest normal force (N) in the open interval. */
    peak: number;
    /** Largest clearance (m) noted in the current gap, or null. */
    clearance: number | null;
    /** The face's impulse (N·s) summed over the open interval, or null without the face's record. */
    impulse: Vec3 | null;
    /** The ball's velocity (m/s) at the open interval's first step, or null without the face's record. */
    before: Vec3 | null;
}

/** A pair's record before the first step. */
export function emptyTimeline(): PairTimeline {
    return { intervals: [], start: null, peak: 0, clearance: null, impulse: null, before: null };
}

/** The interval [start, end) that closes the open one, with the face's record when it was kept. */
function closed(line: PairTimeline, start: number, end: number, after: Vec3 | undefined): ContactInterval {
    const interval = { start, end, peakForce: line.peak };
    if (line.impulse === null || line.before === null || after === undefined) {
        return interval;
    }
    return { ...interval, impulse: line.impulse, velocities: { before: line.before, after } };
}

/**
 * Records the step starting at `t`: in contact with normal force `force` (0 at the rim or released), or not. A
 * face–ball pair passes `face`, the step's record; the open interval sums its impulses and keeps the velocity at its
 * first step, and the first step out of contact gives the velocity at its end.
 */
export function recordStep(line: PairTimeline, inContact: boolean, force: number, t: number, face?: FaceStep): void {
    if (inContact) {
        if (line.start !== null) {
            line.peak = Math.max(line.peak, force);
            if (face !== undefined && line.impulse !== null) {
                line.impulse = add(line.impulse, face.impulse);
            }
            return;
        }
        const last = line.intervals[line.intervals.length - 1];
        if (last && line.clearance !== null) {
            line.intervals[line.intervals.length - 1] = { ...last, clearanceAfter: line.clearance };
        }
        line.start = t;
        line.peak = force;
        line.clearance = null;
        line.impulse = face === undefined ? null : face.impulse;
        line.before = face === undefined ? null : face.velocity;
        return;
    }
    if (line.start !== null) {
        line.intervals.push(closed(line, line.start, t, face?.velocity));
        line.start = null;
    }
}

/** True while the pair is out of contact after at least one interval: a gap whose clearance is worth noting. */
export function inGap(line: PairTimeline): boolean {
    return line.start === null && line.intervals.length > 0;
}

/** Notes a clearance (m) measured in the current gap. */
export function noteClearance(line: PairTimeline, clearance: number): void {
    line.clearance = line.clearance === null ? clearance : Math.max(line.clearance, clearance);
}

/**
 * The pair's intervals once the impact ends at `duration`; an open interval ends there, a face–ball one with the ball's
 * final `velocity` as its end's.
 */
export function closeTimeline(line: PairTimeline, duration: number, velocity?: Vec3): readonly ContactInterval[] {
    if (line.start === null) {
        return line.intervals;
    }
    return [...line.intervals, closed(line, line.start, duration, velocity)];
}
