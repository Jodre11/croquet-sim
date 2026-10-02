import { describe, expect, it } from "vitest";
import {
    accumulate,
    affine,
    denseRow,
    factor,
    linearValue,
    scaled,
    solveFactored,
    solveLinear,
    solveSystem,
    valueOf,
    variable,
    type Work,
} from "../../src/engine/linalg";
import { rng } from "./support/rng";

const work = (): Work => ({ units: 0 });

function multiply(m: readonly (readonly number[])[], x: readonly number[]): number[] {
    return m.map((row) => row.reduce((sum, v, c) => sum + v * (x[c] as number), 0));
}

describe("solveLinear", () => {
    it("solves a regular system", () => {
        const m = [
            [2, 1, 0],
            [1, 3, 1],
            [0, 1, 4],
        ];
        const x = solveLinear(m, [3, 5, 5], work()) as number[];
        expect(x[0]).toBeCloseTo(1, 14);
        expect(x[1]).toBeCloseTo(1, 14);
        expect(x[2]).toBeCloseTo(1, 14);
    });

    it("returns null for a singular system", () => {
        expect(
            solveLinear(
                [
                    [1, 2],
                    [2, 4],
                ],
                [1, 2],
                work(),
            ),
        ).toBeNull();
    });

    it("reuses a factorisation bit for bit", () => {
        const random = rng(13);
        for (let n = 0; n < 50; n++) {
            const size = 1 + Math.floor(random() * 8);
            const m = Array.from({ length: size }, () =>
                Array.from({ length: size }, () => (random() < 0.4 ? 0 : random() - 0.5)),
            );
            const b = Array.from({ length: size }, () => random() - 0.5);
            const lu = factor(m, work());
            if (!lu) {
                continue;
            }
            expect(solveFactored(lu, b, work())).toEqual(solveLinear(m, b, work()));
        }
    });

    it("counts n³ work units per factorisation and n² per kept-factor solve", () => {
        const w = work();
        const lu = factor(
            [
                [1, 0, 0],
                [0, 2, 0],
                [0, 0, 3],
            ],
            w,
        );
        expect(w.units).toBe(27);
        solveFactored(lu as NonNullable<typeof lu>, [1, 1, 1], w);
        expect(w.units).toBe(36);
    });
});

describe("solveSystem", () => {
    it("solves a regular system and keeps its factorisation", () => {
        const s = solveSystem(
            [
                [4, 1],
                [1, 3],
            ],
            [1, 2],
            work(),
        );
        expect(s?.basis).toEqual([]);
        expect(s?.lu).not.toBeNull();
        expect(
            multiply(
                [
                    [4, 1],
                    [1, 3],
                ],
                s?.x as number[],
            )[1],
        ).toBeCloseTo(2, 14);
    });

    it("returns the minimum-norm solution and a null-space basis of a consistent singular system", () => {
        const m = [
            [1, 1],
            [2, 2],
        ];
        const s = solveSystem(m, [2, 4], work());
        expect(s?.lu).toBeNull();
        expect(s?.basis.length).toBe(1);
        const v = s?.basis[0] as readonly number[];
        expect(multiply(m, v).every((r) => Math.abs(r) < 1e-15)).toBe(true);
        expect(s?.x[0]).toBeCloseTo(1, 14);
        expect(s?.x[1]).toBeCloseTo(1, 14);
        // Minimum norm: orthogonal to the null space.
        expect((s?.x[0] as number) * (v[0] as number) + (s?.x[1] as number) * (v[1] as number)).toBeCloseTo(0, 14);
    });

    it("returns null for an inconsistent singular system", () => {
        expect(
            solveSystem(
                [
                    [1, 1],
                    [2, 2],
                ],
                [2, 5],
                work(),
            ),
        ).toBeNull();
    });
});

describe("affine forms", () => {
    it("accumulates, scales and evaluates sparse forms", () => {
        const f = affine(1);
        accumulate(f, variable(2), 3);
        accumulate(f, variable(0), -1);
        accumulate(f, variable(2), 0.5);
        expect(f.idx).toEqual([2, 0]);
        expect(f.val).toEqual([3.5, -1]);
        expect(valueOf(f, [2, 9, 4])).toBe(1 + 3.5 * 4 - 2);
        expect(linearValue(f, [2, 9, 4])).toBe(3.5 * 4 - 2);
        expect(denseRow(f, 4)).toEqual([-1, 0, 3.5, 0]);
        const g = scaled(f, 2);
        expect(valueOf(g, [2, 9, 4])).toBe(2 * (1 + 3.5 * 4 - 2));
        accumulate(f, g, 0);
        expect(f.idx).toEqual([2, 0]);
    });
});
