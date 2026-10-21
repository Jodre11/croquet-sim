import { describe, expect, it } from "vitest";
import { IMPACT_DT } from "../../src/engine/impact/integrate";
import type { ShotSetup } from "../../src/engine/swing/types";
import { GUGAN5, GUGAN_MEANS } from "../../scripts/filmedStrokes";
import { TODAY, filmedStrokeRuns, fitWorld, guganSetup, ratioOf, runFit } from "../../scripts/ratioFit";

const SLOW = Boolean(import.meta.env.SLOW_TESTS);

const WORLD = fitWorld(TODAY);

/** The steps (shares of IMPACT_DT) each judged figure is evaluated at: dt/2, dt and 2·dt. */
const STEPS = [0.5, 1, 2] as const;

/** The largest less the smallest of `xs`. */
function spread(xs: readonly number[]): number {
    return Math.max(...xs) - Math.min(...xs);
}

/** The mean of v₂/U, w₁/W and v₂/w₁ over `runs`' counted strokes, those whose strike closed within its window. */
function meansOf(runs: ReturnType<typeof filmedStrokeRuns>): { v2U: number; w1W: number; v2w1: number } {
    const counted = runs.filter((r) => !r.read.open);
    if (counted.length === 0) {
        throw new RangeError("meansOf: no filmed stroke closed within the strike's window");
    }
    const mean = (f: (r: (typeof counted)[number]) => number): number =>
        counted.reduce((sum, r) => sum + f(r), 0) / counted.length;
    return {
        v2U: mean((r) => r.figures.v2U),
        w1W: mean((r) => r.figures.w1W),
        v2w1: mean((r) => r.figures.v2w1),
    };
}

// Gugan's mallet is solved per setup (about 11 s each); the setup does not depend on the step, so each is built once.
const setups = new Map<string, ShotSetup>();

/** Design §7.2's stroke at `gap` (m): 3 m/s with Gugan's mallet, the drive with no push, the stop with no jab. */
function guganStroke(type: "drive" | "stop-ac", gap: number): ShotSetup {
    const key = `${type}/${gap}`;
    const cached = setups.get(key);
    if (cached !== undefined) {
        return cached;
    }
    const options = type === "drive" ? { guideEffort: 0 } : { jab: 0 };
    const setup = guganSetup(type, GUGAN5.speed, gap, { world: WORLD, gugan: true, ...options });
    setups.set(key, setup);
    return setup;
}

/** The croquet ratio of design §7.2's `type` stroke at `gap` (m), played to rest at impact step `dt` (s). */
function guganRatio(type: "drive" | "stop-ac", gap: number, dt: number): number {
    const setup = guganStroke(type, gap);
    return ratioOf(setup, runFit(setup, TODAY, WORLD, { dt }).motion);
}

describe.runIf(SLOW)("the strike's step convergence (P2b.2b.2c.2b design §6)", () => {
    // Each judged figure moves across dt/2, dt and 2·dt by less than a tenth of its own tolerance: a figure that
    // depends on the step by more than that is the integrator's, not the model's. The gap-0 drive's ratio was 5.170,
    // 5.182 and 5.201 at 2.5, 5 and 10 µs: its ball–ball pair re-stuck after its entry's slide at a slip proportional
    // to the step (contactLaw.ts frictionStep).
    // Ten strokes' impacts at each of three steps. Each case's timeout is 4× the whole file's local time (76.4 s), as
    // its cases' own times are not printed.
    it("keeps the filmed strokes' three means, each stroke at its recorded gap", () => {
        const runs = STEPS.map((k) => meansOf(filmedStrokeRuns(undefined, { dt: k * IMPACT_DT })));
        expect(spread(runs.map((r) => r.v2U))).toBeLessThan(GUGAN_MEANS.v2U.sem / 10);
        expect(spread(runs.map((r) => r.w1W))).toBeLessThan(GUGAN_MEANS.w1W.sem / 10);
        expect(spread(runs.map((r) => r.v2w1))).toBeLessThan(GUGAN_MEANS.v2w1.sem / 10);
    }, 320_000);
    // Gap 0 is today's default and 1 mm the default this step moves to, so both are covered. The stop is checked at
    // jab 0 only: the jab sweep is ungated (design §6, "§7's other figures"). Each case: two mallet solves and six
    // strokes played to rest.
    it.each([0, 0.001])(
        "keeps Gugan 5's drive and stop ratios at gap %s m",
        (gap) => {
            const drive = STEPS.map((k) => guganRatio("drive", gap, k * IMPACT_DT));
            const stop = STEPS.map((k) => guganRatio("stop-ac", gap, k * IMPACT_DT));
            expect(spread(drive)).toBeLessThan(GUGAN5.drive.tolerance / 10);
            expect(spread(stop)).toBeLessThan(GUGAN5.stop.tolerance / 10);
        },
        320_000,
    );
});
