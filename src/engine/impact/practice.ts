/**
 * Practice strokes (P2b.2b.2c.3b.1 design §4): the same shot, balls and lawn included, played up to PRACTICE_PASSES
 * times, the planned pivot's lift (lift.ts) learned from the head's error until the stroke reads in the band (band.ts,
 * design §3). A wrapper around simulateStroke (design §10): a stroke without a push, or one in the band after its
 * first pass, plays once.
 */
import { BALL_IDS, type BallId, type BallStates, type World } from "../types";
import { bandMiss, onPoint, type OnPoint, type OnPointStep } from "./band";
import { headLowestPoint } from "./contacts";
import { FOLLOW_SAMPLE, type FollowThrough, type ImpactProbe } from "./integrate";
import { liftAt } from "./lift";
import { simulateStroke } from "./simulateImpact";
import { prepareTrack } from "./track";
import type { ContactState, ImpactResult, Lift, TrackDrive } from "./types";

/** How many times a stroke may be played (design §4): a compute budget, not a ruling on what a practised player is. */
export const PRACTICE_PASSES = 3;

/** A practised stroke (design §4): its last pass's run and on-point read, the passes played and its lift. */
export interface PractisedStroke {
    readonly result: ImpactResult;
    readonly follow: FollowThrough;
    readonly point: OnPoint;
    readonly passes: number;
    /** null in the band; else the last pass's bandMiss reason. */
    readonly miss: string | null;
    /** The lift the last pass played (design §4, "The plan carries it"); null where it played none. */
    readonly lift: Lift | null;
}

/** The minimum-jerk ramp from 0 to 1 over s in [0, 1], 10s³ − 15s⁴ + 6s⁵, held at its ends outside. */
function ramp(s: number): number {
    if (s <= 0) {
        return 0;
    }
    if (s >= 1) {
        return 1;
    }
    return s * s * s * (10 - 15 * s + 6 * s * s);
}

/**
 * The next pass's lift (design §4, item 2): at each sample t_i = from + i·step of `error` (e_k, m, the head's lowest
 * point above h₀), δz_{k+1} = δz_k − w·e_k before `pushEnd` and δz_k − w·min(e_k, 0) from it on, since the finish is
 * meant to rise; w the minimum-jerk ramp from 0 to 1 over `window` (s) from `from`, the planned contact. δz_k is
 * `previous` read at t_i (0 where null; past its last sample its held value). The result has `error`'s samples:
 * past them it holds its last value (liftAt). A `pushEnd` of null, a push whose finish never starts, corrects the
 * whole error. Exported for its unit test.
 */
export function nextLift(
    previous: Lift | null,
    error: readonly number[],
    from: number,
    step: number,
    window: number,
    pushEnd: number | null,
): Lift {
    const values = error.map((e, i) => {
        const t = from + i * step;
        const before = previous === null ? 0 : liftAt(previous, t).z;
        const corrected = pushEnd !== null && t >= pushEnd ? Math.min(e, 0) : e;
        return before - ramp((t - from) / window) * corrected;
    });
    return { from, step, values };
}

/** A pass's collected head: (t, lowest point) on every impact step and follow-through step, in time order. */
interface Trace {
    readonly times: number[];
    readonly lows: number[];
}

/**
 * The error e(t) = h(t) − h₀ (design §3) every `step` from `from` to the trace's last time, linear between the
 * collected points; h₀ the lowest point at the first collected step at or after `from`. Empty when no step reaches
 * `from`.
 */
function errorOf(trace: Trace, from: number, step: number): number[] {
    const { times, lows } = trace;
    const first = times.findIndex((t) => t >= from);
    if (first < 0) {
        return [];
    }
    const h0 = lows[first] as number;
    const last = times[times.length - 1] as number;
    const error: number[] = [];
    let j = 0;
    for (let i = 0; from + i * step <= last; i++) {
        const t = from + i * step;
        while (j < times.length - 2 && (times[j + 1] as number) < t) {
            j++;
        }
        const t0 = times[j] as number;
        const h0j = lows[j] as number;
        const t1 = times[j + 1] ?? t0;
        const h1j = lows[j + 1] ?? h0j;
        const h = t1 > t0 ? h0j + ((h1j - h0j) * (t - t0)) / (t1 - t0) : h0j;
        error.push(h - h0);
    }
    return error;
}

/**
 * Plays `contact` on `balls` in `world` as a practised stroke (design §4). Pass 1 plays the plan as given (δz ≡ 0
 * unless the contact already carries a lift). After each pass the stroke is read against the band (bandMiss); in it,
 * that pass is the result. Otherwise, while passes remain, the lift is updated from the pass's error (nextLift: from
 * the planned contact, `arc.contactAt`, every FOLLOW_SAMPLE to the pass's last step, the ramp over `arc.window`, the
 * push's end from prepareTrack) and the shot is played again with the arc's lift replaced. After PRACTICE_PASSES the
 * last pass is the result, `miss` its reason (the push map's `unpractised`, design §4 item 3). A contact without a
 * push plays once, its lift null. `probeFor(pass)` (1-based) gives a probe that sees each pass's steps alongside
 * practice's own. Throws a RangeError for a force table, or on invalid input (simulateStroke).
 */
export function practiseStroke(
    contact: ContactState,
    balls: BallStates,
    world: World,
    striker: BallId,
    probeFor?: (pass: number) => ImpactProbe | undefined,
): PractisedStroke {
    const index = BALL_IDS.filter((id) => balls[id] !== undefined).indexOf(striker);
    const radius = world.ball.radius;
    let played = contact;
    let push: { readonly end: number | null } | null | undefined;
    for (let pass = 1; ; pass++) {
        const drive = played.drive as TrackDrive;
        const outer = probeFor?.(pass);
        const trace: Trace = { times: [], lows: [] };
        const steps: OnPointStep[] = [];
        const probe: ImpactProbe = {
            step(s) {
                trace.times.push(s.t);
                trace.lows.push(headLowestPoint(s.head, played.head));
                steps.push({ head: s.head, balls: s.balls, contacts: s.contacts });
                outer?.step(s);
            },
            follow(s) {
                trace.times.push(s.t);
                trace.lows.push(headLowestPoint(s.head, played.head));
                outer?.follow?.(s);
            },
        };
        const run = simulateStroke(played, balls, world, { probe });
        const point = onPoint(steps, index, striker, played.head, drive.arc.aim, radius);
        const miss = bandMiss(run, point, striker);
        // simulateStroke has validated the drive: the push is read once, after the first pass.
        push ??= prepareTrack(drive, played.head, world.gravity, false).push;
        const lift = drive.arc.lift ?? null;
        if (miss === null || push === null || pass >= PRACTICE_PASSES) {
            return { ...run, point, passes: pass, miss, lift };
        }
        const { contactAt, window } = drive.arc;
        const error = errorOf(trace, contactAt, FOLLOW_SAMPLE);
        if (error.length === 0) {
            // No step reached the planned contact: there is no error to learn from.
            return { ...run, point, passes: pass, miss, lift };
        }
        const next = nextLift(lift, error, contactAt, FOLLOW_SAMPLE, window, push.end);
        played = { ...played, drive: { ...drive, arc: { ...drive.arc, lift: next } } };
    }
}
