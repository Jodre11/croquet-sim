import { describe, expect, it } from "vitest";
import { derivative, evaluate, realRootsInInterval } from "../../../src/engine/math/poly";

function expectRoots(actual: number[], expected: number[]): void {
    expect(actual).toHaveLength(expected.length);
    expected.forEach((root, i) => expect(actual[i]).toBeCloseTo(root, 12));
}

describe("evaluate and derivative", () => {
    it("evaluates ascending coefficients", () => {
        expect(evaluate([1, 2, 3], 2)).toBe(17);
        expect(derivative([1, 2, 3])).toEqual([2, 6]);
    });
});

describe("realRootsInInterval", () => {
    it("finds a simple quadratic root", () => {
        expectRoots(realRootsInInterval([-2, 0, 1], 0, 2), [Math.SQRT2]);
    });

    it("finds all cubic roots in order", () => {
        expectRoots(realRootsInInterval([-6, 11, -6, 1], 0, 4), [1, 2, 3]);
    });

    it("finds all quartic roots in order", () => {
        expectRoots(realRootsInInterval([4, 0, -5, 0, 1], -3, 3), [-2, -1, 1, 2]);
    });

    it("reports a double root hit exactly at a turning point once", () => {
        expect(realRootsInInterval([1, -2, 1], 0, 2)).toEqual([1]);
    });

    it("returns nothing when there is no real root or the polynomial is identically zero", () => {
        expect(realRootsInInterval([1, 0, 1], -5, 5)).toEqual([]);
        expect(realRootsInInterval([0, 0, 0], 0, 1)).toEqual([]);
        expect(realRootsInInterval([3], 0, 1)).toEqual([]);
    });

    it("excludes roots outside the interval and includes roots on its ends", () => {
        expect(realRootsInInterval([-3, 1], 0, 2)).toEqual([]);
        expect(realRootsInInterval([0, 1], 0, 1)).toEqual([0]);
        expect(realRootsInInterval([-1, 1], 0, 1)).toEqual([1]);
    });

    it("ignores trailing zero coefficients", () => {
        expect(realRootsInInterval([-1, 1, 0, 0], 0, 2)).toEqual([1]);
    });

    it("returns the lower bracket end so the sign at lo is preserved", () => {
        const [root] = realRootsInInterval([2, 0, -1], 0, 2);
        expect(root).toBeDefined();
        expect(evaluate([2, 0, -1], root as number)).toBeGreaterThanOrEqual(0);
    });

    it("returns nothing for an empty interval", () => {
        expect(realRootsInInterval([-1, 1], 2, 1)).toEqual([]);
    });
});
