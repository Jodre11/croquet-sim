/**
 * A set-up's departures from the plain stroke (side-on viewer spec §2's badges; push-map design A9 items 7–10), as
 * `scripts/pushMapGrid.ts`'s complexityOf counts them against the drive's text book.
 */
import { textBook, type MapPlan, type MapType } from "../lab/index";

/** The tolerance within which an input equals the drive's text book's (complexityOf's SAME). */
const SAME = 1e-9;

/** The stroke effort above which the stroke is a departure (%; design A9 item 8). */
const EFFORT_LIMIT = 90;

let plainPlan: MapPlan | null = null;

/**
 * `plan`'s departures as `type` at `strokeEffort` (%): timed changes (a brake or a push, drive ≠ 0) and set-up changes
 * (the feet and the lean off the drive's, and stroke effort above 90 %). The hands follow the lean
 * (hands-from-lean design §6), so they are no departure of their own.
 */
export function departuresOf(
    type: MapType,
    plan: MapPlan,
    strokeEffort: number,
): { readonly timed: number; readonly setUp: number } {
    plainPlan ??= textBook("drive");
    const base = plainPlan;
    const differs = (a: number, b: number): boolean => Math.abs(a - b) > SAME;
    const setUp = [differs(plan.feet, base.feet), differs(plan.lean, base.lean), strokeEffort > EFFORT_LIMIT].filter(
        Boolean,
    ).length;
    return { timed: differs(plan.drive, 0) ? 1 : 0, setUp };
}
