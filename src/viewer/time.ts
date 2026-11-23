/**
 * The time bar's clock (side-on viewer spec §2, decision 4): the automatic slow-down around contact, the builder's form
 * (spec §7's assumption): the playback rate eases from 1 down to SLOW_RATE over EASE either side of the impact, a long
 * impact (a roll's push) slowed only so far that it plays in IMPACT_WALL; and the balls' roll-out plays in real time.
 */

/** The playback rate inside the impact. */
export const SLOW_RATE = 1 / 50;

/**
 * The wall-clock (s) at ×1 an impact longer than IMPACT_WALL·SLOW_RATE takes: a roll's 90 ms push at SLOW_RATE would
 * hold the picture still for 4.5 s at ×1, 18 s at ×0.25.
 */
export const IMPACT_WALL = 0.5;

/** The easing's span (s) either side of the impact. */
export const EASE = 0.02;

/** Smoothstep: 0 at 0, 1 at 1, flat at both ends. */
function smooth(u: number): number {
    const x = Math.min(1, Math.max(0, u));
    return x * x * (3 - 2 * x);
}

/**
 * The playback rate at play time `t` (s) for an impact from `impactStart` to `impactEnd` (s): inside it SLOW_RATE, or
 * for a long impact the rate that plays it in IMPACT_WALL; 1 further than EASE outside it, eased continuously between.
 */
export function playbackRate(t: number, impactStart: number, impactEnd: number): number {
    // No impact (a planned swing before its Run has none): full rate, never ∞ − ∞.
    if (!Number.isFinite(impactStart) || !Number.isFinite(impactEnd)) {
        return 1;
    }
    const inside = Math.min(1, Math.max(SLOW_RATE, (impactEnd - impactStart) / IMPACT_WALL));
    const distance = t < impactStart ? impactStart - t : t > impactEnd ? t - impactEnd : 0;
    return inside + (1 - inside) * smooth(distance / EASE);
}

/**
 * The play time after `wall` seconds of wall-clock from `t`, at `speed`, slowed around the impact where `slow` is set;
 * from `rollFrom` (the mallet's finish) on, in real time whatever the speed, the balls rolling for seconds; held at `end`.
 */
export function advance(
    t: number,
    wall: number,
    speed: number,
    slow: boolean,
    impact: { readonly start: number; readonly end: number },
    end: number,
    rollFrom = Infinity,
): number {
    if (t >= rollFrom) {
        return Math.min(end, t + wall);
    }
    const rate = slow ? playbackRate(t, impact.start, impact.end) : 1;
    return Math.min(end, t + wall * speed * rate);
}
