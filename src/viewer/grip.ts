/** The grip sweep's step (side-on viewer spec §2, decision 8): the grip record's 0.0625. */
export const GRIP_STEP = 0.0625;

/**
 * The grip one step looser (`dir` −1) or firmer (+1) than `current`, kept within the nearest grip plan's least and
 * firmest grips (spec §2, decision 8).
 */
export function stepGrip(
    current: number,
    bounds: { readonly least: number; readonly firmest: number },
    dir: -1 | 1,
): number {
    return Math.min(bounds.firmest, Math.max(bounds.least, current + dir * GRIP_STEP));
}
