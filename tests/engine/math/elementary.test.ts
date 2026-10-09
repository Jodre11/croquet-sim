import { describe, expect, it } from "vitest";
import { atan2, exp, ln, pow, sinCos } from "../../../src/engine/math/elementary";
import { rng } from "../support/rng";

const EPS = Number.EPSILON;

/** |a − reference| within `ulps` units of the reference's magnitude (at least 1). */
function close(a: number, reference: number, ulps: number): boolean {
    return Math.abs(a - reference) <= ulps * EPS * Math.max(1, Math.abs(reference));
}

describe("ln", () => {
    it("agrees with Math.log to a few ulps over the whole range", () => {
        const random = rng(3);
        for (let n = 0; n < 5000; n++) {
            const x = (0.5 + random()) * Math.pow(2, Math.floor(random() * 2000) - 1000);
            expect(close(ln(x), Math.log(x), 4), `x = ${x}`).toBe(true);
        }
    });

    it("keeps its relative accuracy near 1, where the result is small", () => {
        for (const x of [1 + 1e-12, 1 - 1e-12, 1.0001, 0.9999, 1.4, 0.71]) {
            const reference = Math.log(x);
            expect(Math.abs(ln(x) - reference), `x = ${x}`).toBeLessThanOrEqual(4 * EPS * Math.abs(reference));
        }
        expect(ln(1)).toBe(0);
    });

    it("handles the edges", () => {
        expect(ln(0)).toBe(-Infinity);
        expect(ln(Infinity)).toBe(Infinity);
        expect(ln(-1)).toBeNaN();
        expect(close(ln(Number.MIN_VALUE), Math.log(Number.MIN_VALUE), 4)).toBe(true);
    });
});

describe("sinCos", () => {
    it("agrees with Math.sin and Math.cos to a few ulps", () => {
        const random = rng(5);
        for (let n = 0; n < 5000; n++) {
            const phi = (random() - 0.5) * 40;
            const [s, c] = sinCos(phi);
            expect(Math.abs(s - Math.sin(phi)), `phi = ${phi}`).toBeLessThanOrEqual(4 * EPS);
            expect(Math.abs(c - Math.cos(phi)), `phi = ${phi}`).toBeLessThanOrEqual(4 * EPS);
        }
    });

    it("is exact at zero and turns by quarter turns", () => {
        expect(sinCos(0)).toEqual([0, 1]);
        const [s, c] = sinCos(Math.PI / 2);
        expect(Math.abs(s - 1)).toBeLessThanOrEqual(EPS);
        expect(Math.abs(c)).toBeLessThanOrEqual(1e-16);
    });
});

describe("atan2", () => {
    it("agrees with Math.atan2 in every quadrant and at every scale", () => {
        const random = rng(7);
        for (let n = 0; n < 5000; n++) {
            const y = (random() - 0.5) * Math.pow(10, Math.floor(random() * 6) - 3);
            const x = (random() - 0.5) * Math.pow(10, Math.floor(random() * 6) - 3);
            expect(Math.abs(atan2(y, x) - Math.atan2(y, x)), `(${y}, ${x})`).toBeLessThanOrEqual(8 * EPS);
        }
    });

    it("handles the axes", () => {
        expect(atan2(0, 1)).toBe(0);
        expect(Math.abs(atan2(1, 0) - Math.PI / 2)).toBeLessThanOrEqual(EPS);
        expect(Math.abs(atan2(0, -1) - Math.PI)).toBeLessThanOrEqual(2 * EPS);
        expect(Math.abs(atan2(-1, 0) + Math.PI / 2)).toBeLessThanOrEqual(EPS);
        expect(atan2(0, 0)).toBe(0);
    });
});

describe("exp", () => {
    it("agrees with Math.exp to a few ulps over [−700, 700]", () => {
        const random = rng(5);
        for (let n = 0; n < 5000; n++) {
            const x = (random() - 0.5) * 1400;
            expect(close(exp(x), Math.exp(x), 4), `x = ${x}`).toBe(true);
        }
    });

    it("is accurate near 0, where the bed's decay and the fits' powers read it", () => {
        const random = rng(6);
        for (let n = 0; n < 2000; n++) {
            const x = (random() - 0.5) * 2 * Math.pow(10, -Math.floor(random() * 12));
            expect(close(exp(x), Math.exp(x), 2), `x = ${x}`).toBe(true);
        }
        expect(exp(0)).toBe(1);
    });

    it("handles the edges", () => {
        expect(exp(Number.NaN)).toBeNaN();
        expect(exp(Infinity)).toBe(Infinity);
        expect(exp(-Infinity)).toBe(0);
        expect(exp(800)).toBe(Infinity);
        expect(exp(-800)).toBe(0);
    });
});

describe("pow", () => {
    it("agrees with Math.pow for the bases and exponents the engine uses", () => {
        const random = rng(7);
        for (const y of [0.4, -0.23, 0.2, 2.5, -1.5]) {
            for (let n = 0; n < 1000; n++) {
                const x = 0.05 + 20 * random();
                // exp(y·ln x) amplifies ln's few ulps by |y·ln x| ≤ 7.5 here.
                expect(close(pow(x, y), Math.pow(x, y), 16), `x = ${x}, y = ${y}`).toBe(true);
            }
        }
    });

    it("is 0 for a zero base and a positive exponent, and NaN for any other non-positive base", () => {
        expect(pow(0, 0.4)).toBe(0);
        expect(pow(0, -1)).toBeNaN();
        expect(pow(-2, 0.4)).toBeNaN();
        expect(pow(1, 0.4)).toBe(1);
    });
});
