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

/**
 * The lift at time t (design §4): 0 before `from`, the Catmull–Rom fit between samples, and past the last sample its
 * value with v = a = 0. A first value other than 0 steps at `from`; practice's lift starts at 0 (its ramp w is 0
 * there).
 */
export function liftAt(lift: Lift, t: number): Lowering {
    const { from, step, values } = lift;
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
