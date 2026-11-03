import { describe, expect, it } from "vitest";
import { SIGMA_HALVINGS, SIGMA_STEP, findFirmness, searchSigma, type Played } from "../../scripts/firmness";
import { openWorld, opened } from "../../scripts/openLawn";
import { mapSetup, playedClass, textBook } from "../../scripts/pushMapRun";
import { HOLD_SPEED, plannedSpeed } from "../../src/engine/swing/buildContact";
import type { ShotSetup } from "../../src/engine/swing/types";
import { canonicalSetup } from "./support/shot";

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

describe("the found firmness (firmness design §5)", () => {
    const at = (setup: ShotSetup, holdFirmness: number): ShotSetup => ({
        ...setup,
        stroke: { ...setup.stroke, holdFirmness },
    });

    it("finds no hold for a plan admissible without one", () => {
        // Gate 1: the full roll's text book at power 2 is admissible at firmness 0.
        const setup = mapSetup("full-roll", textBook("full-roll"), 2);
        expect(findFirmness(setup, WORLD)).toEqual({ sigma: 0, firmness: 0, klass: null });
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
        const setup = mapSetup("full-roll", textBook("full-roll"), 0.8);
        expect(playedClass(at(setup, 0.2375), WORLD)).toEqual({ klass: "unpractised", reason: "impact-off-face" });
    });

    it("lets a planning rejection propagate (Review Focus 5)", () => {
        const setup = opened(canonicalSetup("full-roll", { stroke: { backswing: 0.6 } }));
        expect(() => findFirmness(setup, WORLD)).toThrow(RangeError);
        expect(() => findFirmness(setup, WORLD)).toThrow(/beyond the body's/);
    });
});
