import { describe, expect, it } from "vitest";
import { IMPACT_DT } from "../../src/engine/impact/integrate";
import { GUGAN5, GUGAN_MEANS } from "../../scripts/filmedStrokes";
import {
    ALL_STROKES,
    STEP_SHARES,
    TODAY,
    filmedStrokeRuns,
    fitWorld,
    guganRatio,
    meansOf,
    spreadOf,
} from "../../scripts/ratioFit";

const SLOW = Boolean(import.meta.env.SLOW_TESTS);

const WORLD = fitWorld(TODAY);

describe.runIf(SLOW)("the strike's step convergence (P2b.2b.2c.2b design §6)", () => {
    // Each judged figure moves across dt/2, dt and 2·dt by less than a tenth of its own tolerance: a figure that
    // depends on the step by more than that is the integrator's, not the model's. The gap-0 drive's ratio was 5.170,
    // 5.182 and 5.201 at 2.5, 5 and 10 µs: its ball–ball pair re-stuck after its entry's slide at a slip proportional
    // to the step (contactLaw.ts frictionStep).
    // Ten strokes' impacts at each of three steps. Each case's timeout is 4× the whole file's local time (76.4 s), as
    // its cases' own times are not printed.
    it("keeps the filmed strokes' three means, each stroke at its recorded gap", () => {
        const runs = STEP_SHARES.map((k) => meansOf(filmedStrokeRuns(undefined, { dt: k * IMPACT_DT }), ALL_STROKES));
        expect(spreadOf(runs.map((r) => r.v2U))).toBeLessThan(GUGAN_MEANS.v2U.sem / 10);
        expect(spreadOf(runs.map((r) => r.w1W))).toBeLessThan(GUGAN_MEANS.w1W.sem / 10);
        expect(spreadOf(runs.map((r) => r.v2w1))).toBeLessThan(GUGAN_MEANS.v2w1.sem / 10);
    }, 320_000);
    // Gap 0 is today's default and 1 mm the default this step moves to, so both are covered. The stop is checked at
    // jab 0 only: the jab sweep is ungated (design §6, "§7's other figures"). Each case: two mallet solves and six
    // strokes played to rest.
    it.each([0, 0.001])(
        "keeps Gugan 5's drive and stop ratios at gap %s m",
        (gap) => {
            const drive = STEP_SHARES.map((k) => guganRatio("drive", gap, k * IMPACT_DT, WORLD));
            const stop = STEP_SHARES.map((k) => guganRatio("stop-ac", gap, k * IMPACT_DT, WORLD));
            expect(spreadOf(drive)).toBeLessThan(GUGAN5.drive.tolerance / 10);
            expect(spreadOf(stop)).toBeLessThan(GUGAN5.stop.tolerance / 10);
        },
        320_000,
    );
});
