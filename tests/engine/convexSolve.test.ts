import { describe, expect, it } from "vitest";
import { CONVEX_SLACK, excessAt, solveConvex, type Cone } from "../../src/engine/convexSolve";
import { accumulate, affine, variable, type Affine, type Work } from "../../src/engine/linalg";

/** The form c + Σ terms[i]·x[i]. */
function form(c: number, terms: readonly number[]): Affine {
    const f = affine(c);
    terms.forEach((t, i) => accumulate(f, variable(i), t));
    return f;
}

const at = (v: number): Cone => ({ u: [], v: form(-v, [0, 1]), slack: CONVEX_SLACK });

describe("solveConvex", () => {
    it("returns the particular solution itself when it already satisfies every cone", () => {
        const w: Work = { units: 0 };
        const r = solveConvex([at(-1)], [2, 0], [[0, 1]], w);
        expect(r.x).toEqual([2, 0]);
        expect(r.excess).toBeLessThanOrEqual(0);
    });

    it("finds the minimum-norm point of a half-plane", () => {
        // x = (2, z); x₂ ≥ 1: the smallest x is (2, 1).
        const r = solveConvex([at(1)], [2, 0], [[0, 1]], { units: 0 });
        expect(r.x[0]).toBe(2);
        expect(r.x[1]).toBeCloseTo(1, 6);
        expect(r.excess).toBeLessThanOrEqual(0);
    });

    it("finds the minimum-norm point of a disc (a second-order cone)", () => {
        // x = (z₁, z₂, 1); ‖(x₁ − 2, x₂)‖ ≤ 1·x₃: the smallest x is (1, 0, 1).
        const disc: Cone = { u: [form(-2, [1, 0, 0]), form(0, [0, 1, 0])], v: form(0, [0, 0, 1]), slack: 0 };
        const r = solveConvex(
            [disc],
            [0, 0, 1],
            [
                [1, 0, 0],
                [0, 1, 0],
            ],
            { units: 0 },
        );
        expect(r.x[0]).toBeCloseTo(1, 6);
        expect(r.x[1]).toBeCloseTo(0, 6);
        expect(r.x[2]).toBe(1);
        expect(excessAt([disc], r.x)).toBeLessThanOrEqual(1e-9);
    });

    it("reports a positive worst violation when the cones do not meet", () => {
        // x₂ ≥ 1 and x₂ ≤ −1: the best is x₂ = 0, violating both by 1. Phase 1's final point is an upper bound in
        // general; by symmetry it is the best here.
        const below: Cone = { u: [], v: form(-1, [0, -1]), slack: CONVEX_SLACK };
        const r = solveConvex([at(1), below], [2, 0], [[0, 1]], { units: 0 });
        expect(r.excess).toBeGreaterThan(0);
        expect(r.excess).toBeCloseTo(1, 6);
        expect(r.x[1]).toBeCloseTo(0, 6);
    });

    it("finds the minimum-norm point of a feasible set as thin as the slack", () => {
        // x = (5, 0) + z; x₂ ≥ 1 and x₂ ≤ 1 leave x₂ free only within the slack: the smallest x is (0, 1).
        const above: Cone = { u: [], v: form(-1, [0, 1]), slack: CONVEX_SLACK };
        const below: Cone = { u: [], v: form(1, [0, -1]), slack: CONVEX_SLACK };
        const r = solveConvex(
            [above, below],
            [5, 0],
            [
                [1, 0],
                [0, 1],
            ],
            { units: 0 },
        );
        expect(r.x[0]).toBeCloseTo(0, 6);
        expect(r.x[1]).toBeCloseTo(1, 6);
        expect(excessAt([above, below], r.x)).toBeLessThanOrEqual(0);
    });

    it("finds the minimum-norm point when zero normal load collapses a friction disc", () => {
        // x = (N, T₁, T₂, F, G) with N = 0 and T₁ + F + 2G = 2; N ≥ 0 and ‖(T₁, T₂)‖ ≤ 0.5·N force T = 0, leaving
        // F + 2G = 2, whose smallest point is (F, G) = (0.4, 0.8). xp is the unconstrained minimum-norm solution; the
        // basis (T₁ against F, T₂, G against 2F) is not orthonormal.
        const load: Cone = { u: [], v: form(0, [1]), slack: CONVEX_SLACK };
        const disc: Cone = { u: [form(0, [0, 1]), form(0, [0, 0, 1])], v: form(0, [0.5]), slack: CONVEX_SLACK };
        const r = solveConvex(
            [load, disc],
            [0, 1 / 3, 0, 1 / 3, 2 / 3],
            [
                [0, 1, 0, -1, 0],
                [0, 0, 1, 0, 0],
                [0, 0, 0, -2, 1],
            ],
            { units: 0 },
        );
        const expected = [0, 0, 0, 0.4, 0.8];
        expected.forEach((e, i) => expect(r.x[i]).toBeCloseTo(e, 6));
        expect(excessAt([load, disc], r.x)).toBeLessThanOrEqual(0);
    });

    it("finds a feasible set whose cones differ in scale when a null-space direction is free of every cone", () => {
        // x = (5, 0) + z; x₂ ≥ 1 and 1000·(1 + d − x₂) ≥ 0, and no cone depends on x₁. Phase 1 once stalled on its
        // singular Hessian and reported these feasible sets infeasible. The smallest x is (0, 1).
        for (const d of [0, 1e-3]) {
            const above: Cone = { u: [], v: form(-1, [0, 1]), slack: CONVEX_SLACK };
            const below: Cone = { u: [], v: form(1000 * (1 + d), [0, -1000]), slack: CONVEX_SLACK };
            const r = solveConvex(
                [above, below],
                [5, 0],
                [
                    [1, 0],
                    [0, 1],
                ],
                { units: 0 },
            );
            expect(r.excess).toBeLessThanOrEqual(0);
            expect(r.x[0]).toBeCloseTo(0, 6);
            expect(r.x[1]).toBeCloseTo(1, 6);
        }
    });

    it("is deterministic and counts its work", () => {
        const a: Work = { units: 0 };
        const b: Work = { units: 0 };
        const first = solveConvex([at(1)], [2, 0], [[0, 1]], a);
        const second = solveConvex([at(1)], [2, 0], [[0, 1]], b);
        expect(first).toStrictEqual(second);
        expect(a.units).toBe(b.units);
        expect(a.units).toBeGreaterThan(0);
    });
});
