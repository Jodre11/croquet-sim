/**
 * The planned pivot's lift (P2b.2b.2c.3b.1 design §4, "The plan carries it"): a vertical offset sampled at a fixed
 * step, read back with its pace and acceleration from a smooth fit through the samples (design §10), so the hands'
 * feed-forward includes the lift's acceleration.
 *
 * The fit is Catmull–Rom: on each interval a cubic Hermite through its two samples, the slope at an interior sample
 * the central finite difference of its neighbours and at the first and last samples 0. Height and pace are continuous;
 * the acceleration is bounded and steps at the samples. Before the first sample the lift is 0 and past the last it
 * holds the last value at rest (design §4, "The window and its edges").
 */
import type { Lift } from "./types";

/** A vertical offset's height, pace and acceleration (m, m/s, m/s²): a lowering's downward, a lift's upward. */
export interface Lowering {
    readonly z: number;
    readonly v: number;
    readonly a: number;
}

const AT_REST: Lowering = { z: 0, v: 0, a: 0 };

/** The slope (m/s) at sample i: the central difference of its neighbours, 0 at the first and last samples. */
function slopeAt(values: readonly number[], step: number, i: number): number {
    if (i <= 0 || i >= values.length - 1) {
        return 0;
    }
    return ((values[i + 1] as number) - (values[i - 1] as number)) / (2 * step);
}

/** The minimum-jerk ramp from 0 to 1 over s in [0, 1], 10s³ − 15s⁴ + 6s⁵, held at its ends outside. */
export function ramp(s: number): number {
    if (s <= 0) {
        return 0;
    }
    if (s >= 1) {
        return 1;
    }
    return s * s * s * (10 - 15 * s + 6 * s * s);
}

/**
 * The lift at time t (design §4): 0 before `from`, the Catmull–Rom fit between samples, and past the last sample its
 * value with v = a = 0. A first value other than 0 steps at `from`; practice's lift starts at 0 (its ramp w is 0
 * there). From a release's `at` (flat push design, amendment 4), the push's correction `held` eases to 0 by the
 * minimum-jerk ramp over the release's window, and the finish part (0 without parts) is read by the same fit.
 */
export function liftAt(lift: Lift, t: number): Lowering {
    const { release } = lift;
    if (release === undefined || t < release.at) {
        return fitAt(lift.from, lift.step, lift.values, t);
    }
    const finish = lift.parts === undefined ? AT_REST : fitAt(lift.from, lift.step, lift.parts.finish, t);
    const w = release.window;
    const s = (t - release.at) / w;
    if (s >= 1) {
        return finish;
    }
    const z = release.held * (1 - ramp(s));
    const v = (0 - release.held * 30 * s * s * (1 - s) * (1 - s)) / w;
    const a = (0 - release.held * 60 * s * (1 - s) * (1 - 2 * s)) / (w * w);
    return { z: z + finish.z, v: v + finish.v, a: a + finish.a };
}

/** The Catmull–Rom fit of `values`, sampled every `step` from `from`, at t (liftAt without a release). */
function fitAt(from: number, step: number, values: readonly number[], t: number): Lowering {
    if (t < from) {
        return AT_REST;
    }
    const last = values.length - 1;
    if (t >= from + last * step) {
        return { z: values[last] as number, v: 0, a: 0 };
    }
    const i = Math.min(Math.floor((t - from) / step), last - 1);
    const u = (t - from) / step - i;
    const p0 = values[i] as number;
    const p1 = values[i + 1] as number;
    const m0 = slopeAt(values, step, i) * step;
    const m1 = slopeAt(values, step, i + 1) * step;
    const u2 = u * u;
    const u3 = u2 * u;
    const z = (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (3 * u2 - 2 * u3) * p1 + (u3 - u2) * m1;
    const dz = (6 * u2 - 6 * u) * p0 + (3 * u2 - 4 * u + 1) * m0 + (6 * u - 6 * u2) * p1 + (3 * u2 - 2 * u) * m1;
    const ddz = (12 * u - 6) * p0 + (6 * u - 4) * m0 + (6 - 12 * u) * p1 + (6 * u - 2) * m1;
    return { z, v: dz / step, a: ddz / (step * step) };
}
