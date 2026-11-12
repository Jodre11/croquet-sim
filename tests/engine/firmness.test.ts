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

    it("plays the full roll at the firmer hold that holds, not the slack one that slips", () => {
        const plan = { ...textBook("full-roll"), drive: -1, handReach: 0.1, window: 0.02 };
        const sample = playSample("full-roll", plan, canonicalPower("full-roll", WORLD), [10]);
        expect(sample.klass).toBeNull();
        expect(sample.followSlip).toBe(false);
        // Hands-from-lean design §3: the law's hands (was σ 0.1, ratio 1.277).
        expect(sample.sigma).toBeCloseTo(0.7125, 6);
        expect(sample.byLawn[10]?.ratio).toBeCloseTo(1.263, 2);
    }, 120_000);
});

describe("the found firmness (firmness design §5)", () => {
    const at = (setup: ShotSetup, holdFirmness: number): ShotSetup => ({
        ...setup,
        stroke: { ...setup.stroke, holdFirmness },
    });

    it("finds no hold for a plan admissible without one", () => {
        // The half roll's text book at a tap, power 0.1, is admissible at firmness 0. The full roll's was until plan
        // C-d1: at firmness 0 it pins the ball, a contact that never ends.
        const setup = mapSetup("half-roll", textBook("half-roll"), 0.1);
        expect(findFirmness(setup, WORLD)).toEqual({ sigma: 0, firmness: 0, klass: null });
    });

    it("finds no hold where the only admissible play's head rode over the ball (plan B-d8)", () => {
        // Hands-from-lean design §3: on the law's hands this plan trips the grip limit at firmness 0 (superhuman), so
        // the full roll's hands before the law (top 0.61 m, bottom 0.3 m) keep the head riding over the ball; the
        // search then ends off the face (was superhuman).
        const setup = mapSetup("full-roll", textBook("full-roll"), 2, { stance: OLD_ROLL_HANDS });
        expect(playedClass(at(setup, 0), WORLD)).toEqual({ klass: "mishit", reason: HEAD_OVER_BALL });
        expect(findFirmness(setup, WORLD)).toMatchObject({ sigma: null, klass: "unpractised" });
    });

    it("finds the least hold of a plan that slips without one, within the halved step", { timeout: 120_000 }, () => {
        // Gate 1: the full roll's text book at power 1 is off its point at firmness 0 and holds at 0.5.
        const setup = mapSetup("full-roll", textBook("full-roll"), 1);
        const found = findFirmness(setup, WORLD);
        expect(found.klass).toBeNull();
        const sigma = found.sigma as number;
        expect(sigma).toBeGreaterThan(0);
        const v = plannedSpeed(setup, WORLD);
        expect(found.firmness).toBeCloseTo((sigma * HOLD_SPEED) / v, 14);
        expect(playedClass(at(setup, found.firmness as number), WORLD).klass).toBeNull();
        const lower = ((sigma - SIGMA_STEP / 2 ** SIGMA_HALVINGS) * HOLD_SPEED) / v;
        expect(playedClass(at(setup, lower), WORLD).klass).not.toBeNull();
    });

    it("gives the class and reason at σ_max of a plan no hold admits", { timeout: 120_000 }, () => {
        // Gate 1: the half roll's text book at power 1.5 trips the grip limit at every firmness.
        const setup = mapSetup("half-roll", textBook("half-roll"), 1.5);
        expect(findFirmness(setup, WORLD)).toEqual({
            sigma: null,
            firmness: null,
            klass: "superhuman",
            reason: "grip-limit",
        });
    });

    it("classes a slow full roll held firm, its head riding onto the ball to the cap, as off the face", () => {
        // Gate 1: at power 0.8 a hold between the soft holds that slip and the firm that hold rides the head off the
        // face onto the striker's ball, pressing it 2.4 mm into the turf to the 450 ms cap. The handover threw there.
        // Hands-from-lean design §3: on the law's hands the hold between them is 0.1875 (was 0.2375).
        const setup = mapSetup("full-roll", textBook("full-roll"), 0.8);
        expect(playedClass(at(setup, 0.1875), WORLD)).toEqual({ klass: "unpractised", reason: "impact-off-face" });
    });

    it("lets a planning rejection propagate (Review Focus 5)", () => {
        const setup = opened(canonicalSetup("full-roll", { stroke: { backswing: 0.6 } }));
        expect(() => findFirmness(setup, WORLD)).toThrow(RangeError);
        expect(() => findFirmness(setup, WORLD)).toThrow(/beyond the body's/);
    });
});
