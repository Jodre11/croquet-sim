import { describe, expect, it } from "vitest";
import { READ_WINDOW, windowRead } from "../../scripts/table6";

/** Samples every `dt` (s) from 0 to `end`, speed `v(t)` (m/s) and spin surface speed `spin(t)` (m/s). */
function run(end: number, dt: number, v: (t: number) => number, spin: (t: number) => number) {
    const out = [];
    for (let i = 0; i * dt <= end + 1e-12; i++) {
        const t = i * dt;
        out.push({ t, v2: v(t), spin2: spin(t) });
    }
    return out;
}

describe("windowRead", () => {
    it("reads a steady ball's speed and rolling fraction", () => {
        const r = windowRead(
            run(
                0.02,
                1e-5,
                () => 3,
                () => -0.9,
            ),
            0,
        );
        expect(r.travelled).toBeGreaterThanOrEqual(READ_WINDOW);
        expect(r.travelled).toBeLessThan(READ_WINDOW + 1e-4);
        expect(r.v2).toBeCloseTo(3, 9);
        expect(r.roll2).toBeCloseTo(-0.3, 9);
        expect(r.t).toBeCloseTo(0.005, 4);
    });

    it("weights a changing spin by travel, from the start given", () => {
        // From 1 ms, spin rises linearly at 100 m/s² while the ball runs at 1 m/s: 15 mm takes 15 ms, so the mean
        // surface speed over the window is 100 · 0.0075 = 0.75 m/s.
        const r = windowRead(
            run(
                0.03,
                1e-5,
                () => 1,
                (t) => (t < 1e-3 ? 9 : 100 * (t - 1e-3)),
            ),
            1e-3,
        );
        expect(r.v2).toBeCloseTo(1, 9);
        expect(r.roll2).toBeCloseTo(0.75, 3);
        expect(r.t).toBeCloseTo(0.016, 4);
    });

    it("reads a run that ends short over what it travelled", () => {
        const r = windowRead(
            run(
                0.002,
                1e-5,
                () => 2,
                () => 2,
            ),
            0,
        );
        expect(r.travelled).toBeCloseTo(0.004, 9);
        expect(r.roll2).toBeCloseTo(1, 9);
    });

    it("gives NaN figures for no samples after the start", () => {
        const r = windowRead(
            run(
                0.002,
                1e-5,
                () => 2,
                () => 2,
            ),
            1,
        );
        expect(r.travelled).toBe(0);
        expect(r.v2).toBeNaN();
        expect(r.roll2).toBeNaN();
    });
});
