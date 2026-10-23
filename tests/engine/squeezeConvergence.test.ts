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
import { DEFAULT_CROQUET_GAP } from "./support/shot";

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
    // Gap 0, the croquet gap's default (0.75 mm since P2b.2b.2c.2c) and 1 mm, the gap the convergence was first
    // measured at on the re-set laws, are covered. The stop is checked at jab 0 only: the jab sweep is ungated (design
    // §6, "§7's other figures"). Each stroke's case: one mallet solve and three strokes played to rest.
    const keepsGugan5 = (type: "drive" | "stop-ac", gap: number): void => {
        const ratios = STEP_SHARES.map((k) => guganRatio(type, gap, k * IMPACT_DT, WORLD));
        const tolerance = type === "drive" ? GUGAN5.drive.tolerance : GUGAN5.stop.tolerance;
        expect(spreadOf(ratios)).toBeLessThan(tolerance / 10);
    };
    it("keeps Gugan 5's drive and stop ratios at gap 0 m", () => {
        keepsGugan5("drive", 0);
        keepsGugan5("stop-ac", 0);
    }, 320_000);
    // At 0.75 mm the drive's spread is 0.0057 (4.2930, 4.2946, 4.2988) and the stop's 0.0183 (6.5046, 6.5007,
    // 6.4862), each well inside a tenth of its tolerance (2026-10-23).
    it("keeps Gugan 5's drive and stop ratios at the default gap", () => {
        keepsGugan5("drive", DEFAULT_CROQUET_GAP);
        keepsGugan5("stop-ac", DEFAULT_CROQUET_GAP);
    }, 320_000);
    it("keeps Gugan 5's stop ratio at gap 0.001 m", () => keepsGugan5("stop-ac", 0.001), 320_000);
    // P2b.2b.2c.2c: on the re-set laws the drive ratio's spread over dt/2, dt and 2·dt at 1 mm is 0.0204 (4.198, 4.191,
    // 4.177), just over a tenth of its 0.2 tolerance; gate stage 2 ruled it recorded and carried (2026-10-23).
    it.fails("keeps Gugan 5's drive ratio at gap 0.001 m", () => keepsGugan5("drive", 0.001), 320_000);
});
