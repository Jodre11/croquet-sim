import { describe, expect, it } from "vitest";
import { FILMED_STROKES, GUGAN_MEANS, type FilmedStroke } from "../../scripts/filmedStrokes";

describe("the filmed strokes as held (P2b.2b.2c.2b design §5.1)", () => {
    it("reproduces Gugan's three means from the ten strokes, within his stated uncertainty", () => {
        // A transcription check: Table 5's own figures must give §9.3's summary.
        const mean = (f: (s: FilmedStroke) => number) => FILMED_STROKES.reduce((a, s) => a + f(s), 0) / 10;
        expect(Math.abs(mean((s) => s.croqueted / s.malletSpeed) - GUGAN_MEANS.v2U.value)).toBeLessThanOrEqual(0.02);
        expect(Math.abs(mean((s) => s.striker / s.malletAfter) - GUGAN_MEANS.w1W.value)).toBeLessThanOrEqual(0.05);
        expect(Math.abs(mean((s) => s.croqueted / s.striker) - GUGAN_MEANS.v2w1.value)).toBeLessThanOrEqual(0.06);
    });
    it("holds C3S and C20S touching and C1D, C3D, C10D at 1 mm, C10S at 0.5 mm, nominally in contact", () => {
        const by = (n: string) => FILMED_STROKES.find((s) => s.name === n) as FilmedStroke;
        expect([by("C3S").gap, by("C20S").gap]).toEqual([0, 0]);
        expect([by("C1D"), by("C3D"), by("C10D")].map((s) => [s.gap, s.nominal])).toEqual([
            [0.001, true],
            [0.001, true],
            [0.001, true],
        ]);
        expect([by("C10S").gap, by("C10S").nominal]).toEqual([0.0005, true]);
    });
    it("gives C3S's and C20S's ratios as the design quotes them", () => {
        // Design §4: C3S 1.15, 1.73, 2.27; C20S 1.09, 1.61, 2.17, to Table 5's printed precision.
        const c3s = FILMED_STROKES.find((s) => s.name === "C3S") as FilmedStroke;
        const c20s = FILMED_STROKES.find((s) => s.name === "C20S") as FilmedStroke;
        expect(c3s.croqueted / c3s.malletSpeed).toBeCloseTo(1.15, 2);
        expect(c3s.striker / c3s.malletAfter).toBeCloseTo(1.73, 2);
        expect(c3s.croqueted / c3s.striker).toBeCloseTo(2.27, 2);
        expect(c20s.croqueted / c20s.malletSpeed).toBeCloseTo(1.09, 2);
        expect(c20s.striker / c20s.malletAfter).toBeCloseTo(1.61, 2);
        expect(c20s.croqueted / c20s.striker).toBeCloseTo(2.17, 2);
    });
});
