import { describe, expect, it } from "vitest";
import { simulateShot } from "../../src/engine/shot";
import type { ShotSetup } from "../../src/engine/swing/types";
import { BALL_IDS, type ShotResult } from "../../src/engine/types";
import { defaultWorld } from "../../src/engine/world";
import { BOUNDS, TODAY, fitSetup, fitWorld, ratioOf, ratiosAt, runFit, solvePair } from "../../scripts/ratioFit";
import { canonicalSetup, strokeFor } from "./support/shot";

/** A phase 2 in which no ball moves: every rest position is the setup's. */
function stillMotion(setup: ShotSetup): ShotResult {
    const rest: ShotResult["rest"] = {};
    for (const id of BALL_IDS) {
        const ball = setup.balls[id];
        if (ball !== undefined) {
            rest[id] = ball.position;
        }
    }
    return { engineVersion: "", duration: 0, segments: {}, events: [], rest, aborted: false };
}

/** The unit square, both coordinates' bounds. */
const UNIT = [
    [0, 1],
    [0, 1],
] as const;

/** A = [[2, 1], [1, 3]]: well conditioned, each coordinate moving both ratios. */
const apply = (x: readonly [number, number]): readonly [number, number] => [2 * x[0] + x[1], x[0] + 3 * x[1]];

/** A·x + b with its root at (0.3, 0.6) for the targets (4.23, 7.15). */
function linear(x: readonly [number, number]): readonly [number, number] {
    const [a, b] = apply(x);
    return [a + 3.03, b + 5.05];
}

/** A·x + b with its root at (1.4, 0.6), outside the unit square. */
function farLinear(x: readonly [number, number]): readonly [number, number] {
    const [a, b] = apply(x);
    return [a + 0.83, b + 3.95];
}

/** The larger of each ratio's error over its tolerance, against the targets (4.23, 7.15) and tolerances (0.2, 0.6). */
const worst = (v: readonly [number, number]): number =>
    Math.max(Math.abs(v[0] - 4.23) / 0.2, Math.abs(v[1] - 7.15) / 0.6);

describe("the fit's evaluator (P2b.2b.2c.2 design §5)", () => {
    it("reproduces simulateShot's ratio to the bit at today's values", () => {
        // An evaluator drifting from the engine would fit a model the engine does not run. The coupling, the world's
        // contact times and the body are replaced by today's own values, and fitSetup's setup is checked against the
        // canonical one with strokeFor's stroke, so that a drift in fitSetup cannot hide in both paths.
        for (const type of ["drive", "stop-ac"] as const) {
            const setup = fitSetup(type, TODAY, 3);
            const canonical = canonicalSetup(type);
            expect(setup).toEqual({ ...canonical, stroke: { ...canonical.stroke, ...strokeFor(canonical, 3) } });
            const { motion } = runFit(setup, TODAY, fitWorld(TODAY));
            const outcome = simulateShot(setup, defaultWorld());
            expect(ratioOf(setup, motion)).toBe(ratioOf(setup, outcome.motion));
        }
    });
    it("moves the ratio when only the coupling's period moves", () => {
        // The override reaches the impact: a period at its lower bound changes the drive's ratio.
        const p = { ...TODAY, handCouplingPeriod: BOUNDS.handCouplingPeriod[0] };
        const setup = fitSetup("drive", p, 3);
        expect(ratioOf(setup, runFit(setup, p, fitWorld(p)).motion)).not.toBe(ratiosAt(TODAY).drive);
    });
    it("throws when the striker's ball does not move", () => {
        // A still striker would hand the solver Infinity or NaN as a ratio.
        const setup = fitSetup("drive", TODAY, 3);
        expect(() => ratioOf(setup, stillMotion(setup))).toThrow(/striker's ball .* did not move/);
    });
});

describe("the pair's solver (design §5.3)", () => {
    // A synthetic linear map: ratios = A·x + b, its root at (0.3, 0.6) in the unit square.
    it("finds the root of a linear map to 0.01 on each ratio", () => {
        const r = solvePair(linear, [0.5, 0.5], UNIT, [4.23, 7.15], [0.2, 0.6]);
        expect(r.converged).toBe(true);
        expect(Math.abs(r.values[0] - 4.23)).toBeLessThanOrEqual(0.01);
        expect(Math.abs(r.values[1] - 7.15)).toBeLessThanOrEqual(0.01);
    });
    it("stays within its bounds and returns the closest point when the targets are out of reach", () => {
        // A candidate outside its sourced bounds is no fit, and an extrapolated point is no evaluation. The root lies
        // at x = 1.4, outside [0, 1]: every evaluation is checked inside the bounds, and the point returned is one
        // evaluated, with its own values.
        const seen: (readonly [number, number])[] = [];
        const r = solvePair((x) => (seen.push(x), farLinear(x)), [0.5, 0.5], UNIT, [4.23, 7.15], [0.2, 0.6]);
        expect(r.converged).toBe(false);
        expect(seen.every(([a, b]) => a >= 0 && a <= 1 && b >= 0 && b <= 1)).toBe(true);
        expect(r.point.every((a) => a >= 0 && a <= 1)).toBe(true);
        expect(r.values).toEqual(farLinear(r.point));
        expect(worst(r.values)).toBe(Math.min(...seen.map((x) => worst(farLinear(x)))));
    });
    it("finds the closest point along a bound once Newton stalls there", () => {
        // Newton clamps x onto 1 and stalls. Along x = 1 the score max(|y − 1.4|/0.2, |3y − 2.2|/0.6) falls to its
        // least in [0, 1] at y = 1: e = (−0.4, 0.8), score max(2.0, 1.33) = 2.0, against the stalled (1, 0.6)'s 4.0.
        const r = solvePair(farLinear, [0.5, 0.5], UNIT, [4.23, 7.15], [0.2, 0.6]);
        expect(r.converged).toBe(false);
        expect(Math.abs(worst(r.values) - 2)).toBeLessThanOrEqual(0.01);
        expect(Math.abs(r.point[0] - 1)).toBeLessThanOrEqual(0.01);
        expect(Math.abs(r.point[1] - 1)).toBeLessThanOrEqual(0.01);
    });
    it("reports convergence at any evaluated point inside 0.01 of both targets", () => {
        // A map on the targets only past x = 0.505: Newton's first difference probe, (0.51, 0.5), lands there, and
        // that point is a root to 0.01 whether or not an iterate reaches it.
        const step = (x: readonly [number, number]): readonly [number, number] =>
            x[0] > 0.505 ? [4.23, 7.15] : [5, 8];
        const r = solvePair(step, [0.5, 0.5], UNIT, [4.23, 7.15], [0.2, 0.6]);
        expect(r.converged).toBe(true);
        expect(r.values).toEqual([4.23, 7.15]);
        expect(r.point[0]).toBeGreaterThan(0.505);
    });
});
