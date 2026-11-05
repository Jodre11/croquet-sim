/**
 * The found firmness (P2b.2b.2c.3b.2 design §5, A7 item 4; plan `docs/superpowers/plans/2026-11-03-p2b2b2c3b2-firmness.md`,
 * Task 3): the least hold at which a plan plays admissibly, the firmness the player would anticipate. The search runs
 * in the hold's share σ = min(1, holdFirmness·v/HOLD_SPEED) of the grip's couple, v the planned contact speed, over
 * [0, σ_max], σ_max = min(1, v/HOLD_SPEED). Not part of the engine.
 */
import { HOLD_SPEED, plannedSpeed } from "../src/engine/swing/buildContact";
import type { ShotSetup } from "../src/engine/swing/types";
import type { World } from "../src/engine/types";
import { playedClass, type MapClass } from "./pushMapRun";

/** findFirmness's result: the least admissible σ and its firmness, else the class and reason of the play at σ_max. */
export type FoundFirmness =
    | { readonly sigma: number; readonly firmness: number; readonly klass: null }
    | { readonly sigma: null; readonly firmness: null; readonly klass: MapClass; readonly reason: string };

/** The grid's step in σ (design §5). */
export const SIGMA_STEP = 0.1;

/** The halvings of [σ* − SIGMA_STEP, σ*] once the grid finds σ* > 0 (design §5): at most 16 plays in all. */
export const SIGMA_HALVINGS = 4;

/** One play's class and reason, as playedClass gives them, and whether a hand slipped after the balls have gone. */
export type Played = {
    readonly klass: MapClass | null;
    readonly reason: string | null;
    readonly followSlip?: boolean;
};

/**
 * The search of design §5 in σ over [0, `sigmaMax`], each σ classed by `play`: the grid of SIGMA_STEP from 0, σ_max
 * the last point; at the least admissible point σ* > 0, SIGMA_HALVINGS halvings of [σ* − SIGMA_STEP, σ*] (of [0, σ*]
 * at the first step), keeping the admissible end. The least admissible σ found, else null with the play at σ_max.
 */
export function searchSigma(
    sigmaMax: number,
    play: (sigma: number) => Played,
): { readonly sigma: number; readonly last: null } | { readonly sigma: null; readonly last: Played } {
    let below = 0;
    for (let k = 0; ; k++) {
        const sigma = Math.min(k * SIGMA_STEP, sigmaMax);
        const played = play(sigma);
        if (played.klass === null) {
            let lo = below;
            let hi = sigma;
            for (let h = 0; sigma > 0 && h < SIGMA_HALVINGS; h++) {
                const mid = 0.5 * (lo + hi);
                if (play(mid).klass === null) {
                    hi = mid;
                } else {
                    lo = mid;
                }
            }
            return { sigma: hi, last: null };
        }
        if (sigma >= sigmaMax) {
            return { sigma: null, last: played };
        }
        below = sigma;
    }
}

/**
 * The least admissible hold for `setup` on `world`, as the map plays it (firmness design §5, searchFirmness's preference
 * for a hold that doesn't slip): searchSigma over
 * [0, min(1, v/HOLD_SPEED)], v the planned contact speed, each σ played by playedClass with `stroke.holdFirmness` =
 * σ·HOLD_SPEED/v. A planning RangeError does not depend on σ and propagates, as does an engine error of the play.
 */
export function findFirmness(setup: ShotSetup, world: World): FoundFirmness {
    return searchFirmness(setup, world, (held) => playedClass(held, world)).found;
}

/**
 * findFirmness with each σ played by `play`, which is given `setup` with `stroke.holdFirmness` set, and the play at the
 * σ it returns beside it: the push map plays its whole sample in the search, so the sample costs no play beyond the
 * search's. That σ is the least at which the play is admissible and no hand slips; where every σ is out of that, the
 * least admissible, slipping (design A8 item 5: a player grips firmly enough not to lose the mallet if they can); else
 * σ_max. No σ is played twice, so the bound of 16 plays stands: the second search's grid is the first's.
 */
export function searchFirmness<T extends Played>(
    setup: ShotSetup,
    world: World,
    play: (held: ShotSetup) => T,
): { readonly found: FoundFirmness; readonly played: T } {
    const v = plannedSpeed(setup, world);
    const firmnessOf = (sigma: number): number => Math.min(1, (sigma * HOLD_SPEED) / v);
    const plays = new Map<number, T>();
    const playAt = (sigma: number): T => {
        const known = plays.get(sigma);
        if (known !== undefined) {
            return known;
        }
        const played = play({ ...setup, stroke: { ...setup.stroke, holdFirmness: firmnessOf(sigma) } });
        plays.set(sigma, played);
        return played;
    };
    const sigmaMax = Math.min(1, v / HOLD_SPEED);
    const holding = searchSigma(sigmaMax, (sigma) => {
        const played = playAt(sigma);
        return played.klass === null && played.followSlip === true
            ? { klass: "superhuman", reason: "follow-grip-limit" }
            : played;
    });
    const found = holding.last === null ? holding : searchSigma(sigmaMax, playAt);
    if (found.last === null) {
        return {
            found: { sigma: found.sigma, firmness: firmnessOf(found.sigma), klass: null },
            played: plays.get(found.sigma) as T,
        };
    }
    const { klass, reason } = found.last as { readonly klass: MapClass; readonly reason: string | null };
    return { found: { sigma: null, firmness: null, klass, reason: reason ?? klass }, played: found.last as T };
}
