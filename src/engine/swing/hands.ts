/**
 * Where the hands hold the shaft, by the mallet's lean (hands-from-lean design §2). Its own module, with FIST, so
 * that buildContact can read the law without importing the profile, which itself imports buildContact.
 */

import type { StrokeType } from "./types";

const DEG = Math.PI / 180;

/**
 * Each type's default fist (design §2): the pass roll's bottom hand "fisted, lower, touching the brass ring" (the
 * user's account, 2026-11-12); every other type open. A shot's `stroke.fist` replaces it.
 */
export const FIST: Readonly<Record<StrokeType, boolean>> = {
    "single-ball": false,
    drive: false,
    "stop-ac": false,
    "stop-gc": false,
    "half-roll": false,
    "full-roll": false,
    "pass-roll": true,
};

/**
 * A hand's breadth (m): the men's 50th percentile, 3.46 in, of the 2012 US Army anthropometric survey (ANSUR II,
 * Gordon et al. 2014) as the NCSU Ergonomics Center tabulates it (reference/sources/README.md, P2b.2b.2c.3a; user
 * ruling 2026-10-28). It is the breadth across the palm, read here as the span one hand takes on the shaft: an
 * assumption.
 */
export const HAND_BREADTH = 3.46 * 0.0254;

/** The brass ring's height above the socket (m): a placeholder (user ruling 2026-11-12, "Use estimates"). */
export const RING_HEIGHT = 0.025;

/** A finger's reach (m), the full roll's bottom hand above the ring: a placeholder (user ruling 2026-11-12). */
export const FINGER_REACH = 0.075;

/**
 * The shaft above the top of the handle (m): the sourced 36 in shaft less the handle's top, 0.805 m from the socket
 * (profile.ts's header), so every shaft keeps the reference mallet's cap.
 */
export const HANDLE_CAP = 0.9144 - 0.805;

/** The drive's lean, at and behind which the drive's hands hold (Gugan 4 Table 6's presets). */
const DRIVE_LEAN = 0;
/** The half roll's lean (Gugan 4 Table 6). */
const HALF_ROLL_LEAN = 24 * DEG;
/** The full roll's lean, at and beyond which the full roll's hands hold (Gugan 4 Table 6). */
const FULL_ROLL_LEAN = 31 * DEG;

/** The hands' positions along the shaft (m from the socket). */
export interface HandsOnShaft {
    readonly top: number;
    readonly bottom: number;
}

/**
 * The path between two anchors, u on [0, 1] to [0, 1]: linear, a placeholder (design §2 assumption 3). The only
 * place that path is shaped, so a measured or ruled curve replaces it without touching the anchors.
 */
export function blend(u: number): number {
    return u;
}

/** u's fraction of the way from `from` to `to`, clamped to [0, 1], blended. */
function along(lean: number, from: number, to: number): number {
    return blend(Math.min(1, Math.max(0, (lean - from) / (to - from))));
}

/**
 * The hands' law (design §2): piecewise between the drive (≤ 0°), the half roll (24°) and the full roll (≥ 31°),
 * held flat outside them. Only the bottom hand moves up to 24°; from there the hands move in lock-step, `GAP` apart.
 * `fist` lowers both hands by `FINGER_REACH`, at any lean.
 */
export function handsForLean(lean: number, mallet: { readonly shaftLength: number }, fist: boolean): HandsOnShaft {
    const handle = mallet.shaftLength - HANDLE_CAP;
    const half = mallet.shaftLength / 2;
    const gap = handle - half;
    const finger = RING_HEIGHT + FINGER_REACH + HAND_BREADTH / 2;
    const drop = fist ? FINGER_REACH : 0;
    if (lean <= HALF_ROLL_LEAN) {
        const driveBottom = handle - HAND_BREADTH;
        const bottom = driveBottom + along(lean, DRIVE_LEAN, HALF_ROLL_LEAN) * (half - driveBottom);
        return { top: handle - drop, bottom: bottom - drop };
    }
    const bottom = half + along(lean, HALF_ROLL_LEAN, FULL_ROLL_LEAN) * (finger - half);
    return { top: bottom + gap - drop, bottom: bottom - drop };
}
