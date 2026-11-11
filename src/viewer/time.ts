/**
 * The time bar's clock (side-on viewer spec §2, decision 4): the automatic slow-down around contact, the builder's form
 * (spec §7's assumption): the playback rate eases from 1 down to SLOW_RATE over EASE either side of the impact.
 */

/** The playback rate inside the impact. */
export const SLOW_RATE = 1 / 50;

/** The easing's span (s) either side of the impact. */
export const EASE = 0.02;

/** Smoothstep: 0 at 0, 1 at 1, flat at both ends. */
function smooth(u: number): number {
    const x = Math.min(1, Math.max(0, u));
    return x * x * (3 - 2 * x);
}

/**
 * The playback rate at play time `t` (s) for an impact from `impactStart` to `impactEnd` (s): SLOW_RATE inside it, 1
 * further than EASE outside it, eased continuously between.
 */
export function playbackRate(t: number, impactStart: number, impactEnd: number): number {
    const distance = t < impactStart ? impactStart - t : t > impactEnd ? t - impactEnd : 0;
    return SLOW_RATE + (1 - SLOW_RATE) * smooth(distance / EASE);
}

/**
 * The play time after `wall` seconds of wall-clock from `t`, at `speed`, slowed around the impact where `slow` is set;
 * held at `end`.
 */
export function advance(
    t: number,
    wall: number,
    speed: number,
    slow: boolean,
    impact: { readonly start: number; readonly end: number },
    end: number,
): number {
    const rate = slow ? playbackRate(t, impact.start, impact.end) : 1;
    return Math.min(end, t + wall * speed * rate);
}
