/**
 * The rolling ball's deceleration on a speed-dependent lawn (speed-dependent lawn design §3): at speed u (m/s),
 * a(u) = min(g·μ0·(1 + c·u) + k·u², g·μs), the lawn's term rising in a straight line with speed and the ball's air drag
 * with its square. The engine's paths are polynomial in time, so rolling runs in speed bands of ROLLING_BAND, each at
 * the constant deceleration that gives the band the law's own distance.
 */
import { SPEED_EPSILON } from "./motion";

/** The width (m/s) of a rolling speed band (design §3.2). */
export const ROLLING_BAND = 0.25;

/** A lawn's rolling law: g·μ0 (m/s²), the slope c (per m/s), the air drag k (1/m) and the ceiling g·μs (m/s²). */
export interface RollingLaw {
    readonly base: number;
    readonly slope: number;
    readonly drag: number;
    readonly ceiling: number;
}

/** A rolling segment's constant deceleration (m/s²) and the speed (m/s) its band ends at. */
export interface RollingBand {
    readonly decel: number;
    readonly floor: number;
}

/** The law's deceleration (m/s²) at speed u. */
export function rollingDecelAt(law: RollingLaw, u: number): number {
    return Math.min(law.base * (1 + law.slope * u) + law.drag * u * u, law.ceiling);
}

/** True for a law with no speed dependence: the uniform lawn, one band to rest. */
function uniform(law: RollingLaw): boolean {
    return law.slope === 0 && law.drag === 0;
}

// 8-point Gauss–Legendre nodes and weights on [−1, 1].
const NODES = [
    -0.9602898564975363, -0.7966664774136267, -0.525532409916329, -0.1834346424956498, 0.1834346424956498,
    0.525532409916329, 0.7966664774136267, 0.9602898564975363,
];
const WEIGHTS = [
    0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.362683783378362, 0.362683783378362,
    0.3137066458778873, 0.2223810344533745, 0.1012285362903763,
];

/** ∫ f(u) du over [lo, hi] by 8-point Gauss–Legendre. */
function gauss(f: (u: number) => number, lo: number, hi: number): number {
    const half = (hi - lo) / 2;
    const mid = (hi + lo) / 2;
    let sum = 0;
    for (let i = 0; i < NODES.length; i++) {
        sum += (WEIGHTS[i] as number) * f(mid + half * (NODES[i] as number));
    }
    return sum * half;
}

/** The law's rolling distance (m) from speed hi down to lo, panel by panel at the band edges. */
export function rollingDistance(law: RollingLaw, lo: number, hi: number): number {
    let total = 0;
    let top = hi;
    while (top > lo) {
        const bottom = Math.max(lo, bandFloor(top));
        total += gauss((u) => u / rollingDecelAt(law, u), bottom, top);
        top = bottom;
    }
    return total;
}

/** The law's rolling time (s) from speed hi down to lo. */
function rollingTime(law: RollingLaw, lo: number, hi: number): number {
    let total = 0;
    let top = hi;
    while (top > lo) {
        const bottom = Math.max(lo, bandFloor(top));
        total += gauss((u) => 1 / rollingDecelAt(law, u), bottom, top);
        top = bottom;
    }
    return total;
}

/**
 * The lower edge of the band a ball rolling at u is in (design §3.2): the largest multiple of ROLLING_BAND strictly
 * below u − SPEED_EPSILON, and at least 0, so a speed on an edge, or a hair above it after rounding, starts the band
 * below it.
 */
export function bandFloor(u: number): number {
    const k = Math.ceil((u - SPEED_EPSILON) / ROLLING_BAND) - 1;
    return k > 0 ? k * ROLLING_BAND : 0;
}

/**
 * The band a ball rolling at u runs in: down to bandFloor(u), at the deceleration that covers the law's distance
 * there. At rest, or on a uniform lawn, the law at u = 0 to rest (design §3.2).
 */
export function rollingBand(law: RollingLaw, u: number): RollingBand {
    if (uniform(law)) {
        return { decel: law.base, floor: 0 };
    }
    if (!(u > SPEED_EPSILON)) {
        return { decel: rollingDecelAt(law, 0), floor: 0 };
    }
    const floor = bandFloor(u);
    const distance = gauss((v) => v / rollingDecelAt(law, v), floor, u);
    return { decel: (u * u - floor * floor) / (2 * distance), floor };
}

/** Bisects the increasing function f for its root in [lo, hi] to rounding. */
function bisect(f: (x: number) => number, lo: number, hi: number): number {
    for (let i = 0; i < 200; i++) {
        const mid = (lo + hi) / 2;
        if (mid === lo || mid === hi) {
            break;
        }
        if (f(mid) < 0) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    return (lo + hi) / 2;
}

/**
 * μ0 for a lawn of `seconds` over `distance` (design §3.1): the ball rolled from u0 under the law stops after
 * `distance` m in `seconds` s. Uniform (slope and drag 0), the closed form 2D/(g·T²); otherwise μ0 is bisected for
 * the distance at each trial u0, and u0 for the time. The ceiling is the lawn's g·μs.
 */
export function rollingBaseForLawnSpeed(
    seconds: number,
    distance: number,
    gravity: number,
    slope: number,
    drag: number,
    ceiling: number,
): number {
    const closed = (2 * distance) / (gravity * seconds * seconds);
    if (slope === 0 && drag === 0) {
        return closed;
    }
    const lawAt = (mu: number): RollingLaw => ({ base: gravity * mu, slope, drag, ceiling });
    // At a trial u0, the μ0 whose distance is `distance`: the distance falls as μ0 rises. The bracket runs past μs so
    // a lawn too fast for the ceiling returns a μ0 above it, which validateWorld rejects.
    const muFor = (u0: number): number =>
        bisect((mu) => distance - rollingDistance(lawAt(mu), 0, u0), 1e-9, (2 * ceiling) / gravity);
    // The time rises as u0 falls at a fixed distance, so bisect on (time − seconds) reversed.
    const u0 = bisect(
        (v) => seconds - rollingTime(lawAt(muFor(v)), 0, v),
        (2 * distance) / seconds,
        (4 * distance) / seconds,
    );
    return muFor(u0);
}
