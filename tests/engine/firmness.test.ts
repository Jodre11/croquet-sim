import { describe, expect, it } from "vitest";
import {
    SIGMA_HALVINGS,
    SIGMA_STEP,
    findFirmness,
    searchFirmness,
    searchSigma,
    type Played,
} from "../../scripts/firmness";
import { openWorld, opened } from "../../scripts/openLawn";
import { HEAD_OVER_BALL, canonicalPower, mapSetup, playSample, playedClass, textBook } from "../../scripts/pushMapRun";
import { HOLD_SPEED, plannedSpeed } from "../../src/engine/swing/buildContact";
import type { ShotSetup } from "../../src/engine/swing/types";
import { OLD_ROLL_HANDS, canonicalSetup } from "./support/shot";

const WORLD = openWorld(10);
const ADMISSIBLE: Played = { klass: null, reason: null };
const SLIPS: Played = { klass: "mishit", reason: "impact-off-face" };

/** A synthetic play admissible from `threshold` up, recording each σ it is given. */
function above(threshold: number, played: number[]): (sigma: number) => Played {
    return (sigma) => {
        played.push(sigma);
        return sigma >= threshold ? ADMISSIBLE : SLIPS;
    };
}

describe("the σ search (firmness design §5)", () => {
    it("searches no σ above σ_max for a plan below HOLD_SPEED (Review Focus 4)", () => {
        // v = 1.5 m/s: σ_max = v/HOLD_SPEED = 0.5, whose firmness is 1.
        const played: number[] = [];
        const found = searchSigma(1.5 / HOLD_SPEED, above(Infinity, played));
        expect(found).toEqual({ sigma: null, last: SLIPS });
        expect(played.map((s) => Number(s.toFixed(12)))).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5]);
    });

    it("halves the grid step below the least admissible point, keeping the admissible end", () => {
        const played: number[] = [];
        const found = searchSigma(1, above(0.237, played));
        expect(found.last).toBeNull();
        const sigma = found.sigma as number;
        expect(sigma).toBeGreaterThanOrEqual(0.237);
        expect(sigma - 0.237).toBeLessThanOrEqual(SIGMA_STEP / 2 ** SIGMA_HALVINGS);
        // The grid 0 to 0.3, then the halvings.
        expect(played).toHaveLength(4 + SIGMA_HALVINGS);
    });

    it("halves [0, σ*] when the first grid step is admissible, and plays σ = 0 alone when it is", () => {
        const first: number[] = [];
        const found = searchSigma(1, above(0.05, first));
        expect(found.sigma as number).toBeGreaterThanOrEqual(0.05);
        expect(found.sigma as number).toBeLessThanOrEqual(0.05 + SIGMA_STEP / 2 ** SIGMA_HALVINGS);
        const zero: number[] = [];
        expect(searchSigma(1, above(0, zero))).toEqual({ sigma: 0, last: null });
        expect(zero).toEqual([0]);
    });
});

describe("the search's preference for a hold that doesn't slip (design A8 item 5)", () => {
    const setup = mapSetup("full-roll", textBook("full-roll"), 0.8839);

    /** A play that is admissible from firmness `plays` up and slips below firmness `holds`, counting its plays. */
    const stub = (plays: number, holds: number, count: { n: number }) => (held: ShotSetup) => {
        count.n++;
        const firmness = held.stroke.holdFirmness as number;
        return {
            klass: firmness >= plays ? null : ("mishit" as const),
            reason: firmness >= plays ? null : "impact-off-face",
            followSlip: firmness < holds,
            firmness,
        };
    };

    it("goes past an admissible hold that slips to the least that doesn't", () => {
        const { found, played } = searchFirmness(setup, WORLD, stub(0, 0.3, { n: 0 }));
        expect(found.klass).toBeNull();
        expect(played.followSlip).toBe(false);
        expect(played.firmness).toBeGreaterThanOrEqual(0.3);
        expect(played.firmness).toBeLessThan(0.31);
    });

    it("takes the least admissible hold where every hold slips, playing no σ twice", () => {
        const count = { n: 0 };
        const { found, played } = searchFirmness(setup, WORLD, stub(0.3, Infinity, count));
        expect(found.klass).toBeNull();
        expect(played.followSlip).toBe(true);
        expect(played.firmness).toBeGreaterThanOrEqual(0.3);
        expect(played.firmness).toBeLessThan(0.31);
        expect(count.n).toBeLessThanOrEqual(16);
    });

    it("ends at σ_max with its class where no hold is admissible", () => {
        const { found, played } = searchFirmness(setup, WORLD, stub(Infinity, 0, { n: 0 }));
        expect(found).toMatchObject({ sigma: null, firmness: null, klass: "mishit" });
        expect(played.firmness).toBe(1);
    });

    it("plays the full roll at the least hold that doesn't slip", () => {
        const plan = { ...textBook("full-roll"), drive: -1, handReach: 0.1, window: 0.02 };
        const sample = playSample("full-roll", plan, canonicalPower("full-roll", WORLD), [10]);
        expect(sample.klass).toBeNull();
        expect(sample.followSlip).toBe(false);
        // Hands-from-lean design §3: the law's hands (was σ 0.1, ratio 1.277). Speed-dependent lawn design: 1.230
        // (was 1.263). Roll launch design §3.1 (was σ 0.7125, ratio 1.23): the hands re-anchor at the departure, so
        // the slack holds no longer slip and the search stops at its first step. Roll launch design §3.1f, amendment 8
        // (was σ 0.1, ratio 1.13): the faces' and balls' friction fitted; σ 0.0625, ratio 1.000. Primed push design,
        // amendment 1 (was σ 0.0625): the hands' press loads the grips, so the least hold that doesn't slip is
        // σ 0.16875; the ratio stays 1.00. Soft follow-through design §2.3 (was σ 0.16875): the shorter finish no
        // longer drives the head on into the slack grips, and no hold slips: σ 0, the ratio 1.047. Gap register, the
        // third refit (engine 0.42.0; was 1.047): σ 0, the ratio 1.083.
        expect(sample.sigma).toBe(0);
        expect(sample.byLawn[10]?.ratio).toBeCloseTo(1.083, 3);
    }, 120_000);
});

describe("the found firmness (firmness design §5)", () => {
    const at = (setup: ShotSetup, holdFirmness: number): ShotSetup => ({
        ...setup,
        stroke: { ...setup.stroke, holdFirmness },
    });

    it("finds no hold for a plan admissible without one", { timeout: 120_000 }, () => {
        // The half roll's text book at a tap, power 0.1, is admissible at firmness 0. The full roll's was until plan
        // C-d1: at firmness 0 it pins the ball, a contact that never ends.
        const setup = mapSetup("half-roll", textBook("half-roll"), 0.1);
        expect(findFirmness(setup, WORLD)).toEqual({ sigma: 0, firmness: 0, klass: null });
    });

    // Roll launch design §3.1c–e: with the path restarted from the head and the pitch hold ended at the restart,
    // no full roll in a scan of drive 0.25–1, reach 0.3–0.6, power 1–2, old and law hands, rides over the ball or
    // slips at firmness 0, and the text book at powers 0.8–1.5 stays on the face at every hold to 0.5. No case is
    // known; the detector keeps its negative tests. Restore with amendment 8 (the rolls' topspin), or a new case.
    it.fails("goes past a hold where the play's head rode over the ball (plan B-d8)", { timeout: 120_000 }, () => {
        // Hands-from-lean design §3: on the law's hands this plan trips the grip limit at firmness 0 (superhuman), so
        // the full roll's hands before the law (top 0.61 m, bottom 0.3 m) keep the head riding over the ball; the
        // search then ends off the face (was superhuman). Roll launch design §3.1: the hands re-anchor at the
        // departure and the text book no longer rides over the ball; a slacker push with a longer reach does at
        // firmness 0, and the search goes on to a firmer hold (was the text book, no hold found, off the face).
        const plan = { ...textBook("full-roll"), drive: 0.5, handReach: 0.6, window: 0.02 };
        const setup = mapSetup("full-roll", plan, 2, { stance: OLD_ROLL_HANDS });
        expect(playedClass(at(setup, 0), WORLD)).toEqual({ klass: "mishit", reason: HEAD_OVER_BALL });
        expect(findFirmness(setup, WORLD)).toMatchObject({ sigma: 0.025, klass: null });
    });

    // Roll launch design §3.1c–e: with the path restarted from the head and the pitch hold ended at the restart,
    // no full roll in a scan of drive 0.25–1, reach 0.3–0.6, power 1–2, old and law hands, rides over the ball or
    // slips at firmness 0, and the text book at powers 0.8–1.5 stays on the face at every hold to 0.5. No case is
    // known; the detector keeps its negative tests. Restore with amendment 8 (the rolls' topspin), or a new case.
    it.fails(
        "finds the least hold of a plan that slips without one, within the halved step",
        { timeout: 600_000 },
        () => {
            // Gate 1: the full roll's text book at power 1 is off its point at firmness 0 and holds at 0.5. Roll launch
            // design §3.1: the hands re-anchor at the departure and the text book at power 1 holds at firmness 0; a firmer
            // push on the law's hands at power 1.5 rides over the ball at 0 and holds at σ 0.7125.
            const plan = { ...textBook("full-roll"), drive: 1, handReach: 0.3, window: 0.02 };
            const setup = mapSetup("full-roll", plan, 1.5);
            const found = findFirmness(setup, WORLD);
            expect(found.klass).toBeNull();
            const sigma = found.sigma as number;
            expect(sigma).toBeGreaterThan(0);
            const v = plannedSpeed(setup, WORLD);
            expect(found.firmness).toBeCloseTo((sigma * HOLD_SPEED) / v, 14);
            expect(playedClass(at(setup, found.firmness as number), WORLD).klass).toBeNull();
            const lower = ((sigma - SIGMA_STEP / 2 ** SIGMA_HALVINGS) * HOLD_SPEED) / v;
            expect(playedClass(at(setup, lower), WORLD).klass).not.toBeNull();
        },
    );

    // Gap register G2 (the user's ruling, 2026-11-17): a grip limit reached inside the strike is the strike's shock,
    // not superhuman, and the pass roll's text book at 1.6 now plays at firmness 0 (ratio 1.53). No plan no hold
    // admits is known; restore with a new case.
    it.fails("gives the class and reason at σ_max of a plan no hold admits", { timeout: 600_000 }, () => {
        // Gate 1: the pass roll's text book at power 1.6 trips the grip limit at every firmness. Flat push design,
        // amendment 7: the half roll at 1.5, the example until then, now brakes within the grip.
        const setup = mapSetup("pass-roll", textBook("pass-roll"), 1.6);
        expect(findFirmness(setup, WORLD)).toEqual({
            sigma: null,
            firmness: null,
            klass: "superhuman",
            reason: "grip-limit",
        });
    });

    // Roll launch design §3.1c–e: with the path restarted from the head and the pitch hold ended at the restart,
    // no full roll in a scan of drive 0.25–1, reach 0.3–0.6, power 1–2, old and law hands, rides over the ball or
    // slips at firmness 0, and the text book at powers 0.8–1.5 stays on the face at every hold to 0.5. No case is
    // known; the detector keeps its negative tests. Restore with amendment 8 (the rolls' topspin), or a new case.
    // Soft follow-through design §2.1 (was it.fails): restored. With the follow-through's catch seen, the head's edge
    // rides onto the striker's ball at power 1, hold 0.2, after the strike. Soft follow-through design §2.4 (was
    // restored, latterly as 29.1.6.1): with the finish re-timed so the head never outpaces the striker's ball, power 1,
    // hold 0.2 plays clean, and no case is known again. Restore with a new case.
    it.fails("classes a full roll held firm, its head riding onto the ball, as off the face", () => {
        // Gate 1: at power 0.8 a hold between the soft holds that slip and the firm that hold rides the head off the
        // face onto the striker's ball, pressing it 2.4 mm into the turf to the 450 ms cap. The handover threw there.
        // Hands-from-lean design §3: on the law's hands the hold between them is 0.1875 (was 0.2375). Flat push design,
        // amendments 3 and 4: the gentler finish and practice's withdrawn push correction hold the head on the face
        // from 0.175, so the hold off it is 0.1625. Roll launch design §3.1: the hands re-anchor at the departure,
        // and at power 0.8 every hold to 0.3 stays on the face; at power 1 the holds from 0.2 ride off it (was power
        // 0.8 at 0.1625). Soft follow-through design §2.3 (was unpractised, impact-off-face): the shorter finish
        // brings the head back onto the ball on its face, not its edge: a second hit (29.1.6.1).
        const setup = mapSetup("full-roll", textBook("full-roll"), 1);
        expect(playedClass(at(setup, 0.2), WORLD)).toEqual({ klass: "unpractised", reason: "impact-off-face" });
    });

    it("lets a planning rejection propagate (Review Focus 5)", () => {
        const setup = opened(canonicalSetup("full-roll", { stroke: { backswing: 0.6 } }));
        expect(() => findFirmness(setup, WORLD)).toThrow(RangeError);
        expect(() => findFirmness(setup, WORLD)).toThrow(/beyond the body's/);
    });
});
