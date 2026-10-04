/**
 * The contact timeline (P2b.2a design §5): each pair's intervals of contact. An interval opens at the start of the
 * first step in which the pair is in contact and ends at the start of the first step in which it is not; one still
 * open when the impact ends ends at its duration. Any step out of contact separates two intervals, as the Laws count
 * any second contact. A face–ball pair's gaps also keep their largest clearance, attached to the interval before the
 * gap once the next one opens.
 */
import type { ContactInterval } from "./types";

/** One pair's record while the impact runs. */
export interface PairTimeline {
    readonly intervals: ContactInterval[];
    /** Start (s) of the open interval, or null while the pair is out of contact. */
    start: number | null;
    /** Largest normal force (N) in the open interval. */
    peak: number;
    /** Largest clearance (m) noted in the current gap, or null. */
    clearance: number | null;
}

/** A pair's record before the first step. */
export function emptyTimeline(): PairTimeline {
    return { intervals: [], start: null, peak: 0, clearance: null };
}

/** Records the step starting at `t`: in contact with normal force `force` (0 at the rim or released), or not. */
export function recordStep(line: PairTimeline, inContact: boolean, force: number, t: number): void {
    if (inContact) {
        if (line.start !== null) {
            line.peak = Math.max(line.peak, force);
            return;
        }
        const last = line.intervals[line.intervals.length - 1];
        if (last && line.clearance !== null) {
            line.intervals[line.intervals.length - 1] = { ...last, clearanceAfter: line.clearance };
        }
        line.start = t;
        line.peak = force;
        line.clearance = null;
        return;
    }
    if (line.start !== null) {
        line.intervals.push({ start: line.start, end: t, peakForce: line.peak });
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

/** The pair's intervals once the impact ends at `duration`; an open interval ends there. */
export function closeTimeline(line: PairTimeline, duration: number): readonly ContactInterval[] {
    if (line.start === null) {
        return line.intervals;
    }
    return [...line.intervals, { start: line.start, end: duration, peakForce: line.peak }];
}
