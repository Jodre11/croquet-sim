/**
 * Event-time detection. Each ball's centre follows a quadratic within a segment, so the squared distance between
 * two balls (or a ball and a vertical cylinder) is a quartic in time; its earliest approaching root is the contact
 * time. Boundary distances are quadratics.
 *
 * Bodies that are already touching are not handled here: whether they collide, push or separate at t = 0 is decided
 * by the caller from `approachSpeed` and the resting-contact solver (push.ts), which resolution uses too.
 */
import { realRootsInInterval } from "./math/poly";
import { dot, horizontal, length, type Vec3 } from "./math/vec3";
import type { Trajectory } from "./motion";

/** Surfaces closer than this (m) are treated as touching. */
export const CONTACT_TOLERANCE = 1e-9;

/** Returns true when two bodies whose centres are `offset` apart are within CONTACT_TOLERANCE of `distance`. */
export function isTouching(offset: Vec3, distance: number): boolean {
    return length(horizontal(offset)) - distance <= CONTACT_TOLERANCE;
}

/**
 * Returns the speed (m/s) at which two bodies close along their line of centres: positive when approaching,
 * negative when separating. `offset` is the first centre minus the second and `relativeVelocity` the first
 * velocity minus the second. This is the single "approaching" predicate: detection and resolution both call it with
 * the same states, so they can never disagree about whether a touching pair is approaching.
 */
export function approachSpeed(offset: Vec3, relativeVelocity: Vec3): number {
    const d = horizontal(offset);
    const l = length(d);
    return l === 0 ? 0 : (0 - dot(d, horizontal(relativeVelocity))) / l;
}

/**
 * Returns the earliest t in (0, horizon] at which the horizontal relative trajectory a + b·t + c·t² comes within
 * `distance` of the origin while the separation is decreasing, or null if it does not. Bodies that start touching
 * report either a new contact after the gap has opened beyond CONTACT_TOLERANCE, or the moment they would overlap by
 * more than CONTACT_TOLERANCE (a safety net: the caller decides at t = 0 and normally prevents that). Throws
 * RangeError for a non-finite horizon.
 */
export function approachTime(a: Vec3, b: Vec3, c: Vec3, distance: number, horizon: number): number | null {
    if (!Number.isFinite(horizon)) {
        throw new RangeError("approachTime needs a finite horizon");
    }
    const A = horizontal(a);
    const B = horizontal(b);
    const C = horizontal(c);
    // f(t) = |A + B·t + C·t²|² − distance², expanded in ascending powers of t.
    const f0 = dot(A, A) - distance * distance;
    const f1 = 2 * dot(A, B);
    const f2 = dot(B, B) + 2 * dot(A, C);
    const f3 = 2 * dot(B, C);
    const f4 = dot(C, C);
    const slope = (t: number): number => f1 + t * (2 * f2 + t * (3 * f3 + t * 4 * f4));
    // f is never of degree 1 (f4 = 0 forces C = 0, then f2 = |B|² = 0 forces f1 = 0), so every root used here comes
    // from bisection and keeps the sign f has just before it: a reported contact time is never inside an overlap. A
    // near-double root (a graze within rounding of tangency) may be missed, but that overlap is at rounding level.

    const firstFalling = (offset: number, from: number): number | null =>
        realRootsInInterval([f0 + offset, f1, f2, f3, f4], from, horizon).find((t) => t > 0 && slope(t) < 0) ?? null;
    if (!isTouching(A, distance)) {
        return firstFalling(0, 0);
    }
    // f = +band where the gap is +CONTACT_TOLERANCE and f = −band (to first order) where it is −CONTACT_TOLERANCE.
    // Roots of f between the two are rounding noise of a contact that never opened, so they are ignored.
    const band = 2 * distance * CONTACT_TOLERANCE;
    const overlap = firstFalling(band, 0);
    const leave = realRootsInInterval([f0 - band, f1, f2, f3, f4], 0, horizon).find((t) => slope(t) > 0);
    const again = leave === undefined ? null : firstFalling(0, leave);
    if (overlap === null) {
        return again;
    }
    return again === null ? overlap : Math.min(overlap, again);
}

/**
 * Returns the earliest t in [0, horizon] at which g changes from negative to non-negative, for ascending
 * coefficients g: 0 if g(0) ≥ 0, otherwise the first root found by `realRootsInInterval`. That root is the lower end
 * of a bisection bracket (g there may still be marginally negative) or, for linear g, the correctly rounded quotient
 * (g there may be marginally either side). Callers use it only for thresholds where that does not matter (halt
 * margin, out of court, a coupled contact opening), never to keep bodies apart. Returns null if there is none.
 */
export function firstNonNegative(coeffs: readonly number[], horizon: number): number | null {
    if ((coeffs[0] ?? 0) >= 0) {
        return 0;
    }
    const roots = realRootsInInterval(coeffs, 0, horizon);
    return roots[0] ?? null;
}

/** Court extent (m): x ∈ [0, width], y ∈ [0, length]. */
export interface Bounds {
    readonly width: number;
    readonly length: number;
}

/** Returns how far the point lies beyond the nearest boundary line (negative when inside the court). */
export function outwardDistance(position: Vec3, bounds: Bounds): number {
    return Math.max(-position.x, position.x - bounds.width, -position.y, position.y - bounds.length);
}

/**
 * Returns the earliest t in [0, horizon] at which the trajectory's outward distance beyond any boundary line
 * reaches `threshold`, or null.
 */
export function boundaryCrossingTime(
    traj: Trajectory,
    bounds: Bounds,
    threshold: number,
    horizon: number,
): number | null {
    const { c0, c1, c2 } = traj;
    // Outward distance beyond each line, minus the threshold, as a quadratic in t: west, east, south, north.
    const lines: readonly (readonly number[])[] = [
        [-c0.x - threshold, -c1.x, -c2.x],
        [c0.x - bounds.width - threshold, c1.x, c2.x],
        [-c0.y - threshold, -c1.y, -c2.y],
        [c0.y - bounds.length - threshold, c1.y, c2.y],
    ];
    let best: number | null = null;
    for (const g of lines) {
        const t = firstNonNegative(g, horizon);
        if (t !== null && (best === null || t < best)) {
            best = t;
        }
    }
    return best;
}
