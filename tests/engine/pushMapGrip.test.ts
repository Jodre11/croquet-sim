import { describe, expect, it } from "vitest";
import {
    GRIPS,
    GRIP_STEP,
    HELD_OUT,
    drawHeldOut,
    fitGrip,
    gripBounds,
    gripFits,
    gripLine,
    gripPlans,
    heldOutError,
    parseGripLines,
    predictGrip,
    timingPlays,
    type GripEntry,
    type GripPlan,
    type GripPlay,
} from "../../scripts/pushMapGrip";
import type { BandPick } from "../../scripts/pushMapGrid";
import { mapSetup, playSample, textBook, type MapClass, type MapPlan } from "../../scripts/pushMapRun";
import { defaultProfile } from "../../src/engine/swing/profile";

/** A play at `grip` with `range` (m) and `ratio`, of class `klass`. */
function play(grip: number, range: number, ratio: number, klass: MapClass | null = null, followSlip = false): GripPlay {
    return { grip, sigma: grip, klass, reason: klass, followSlip, range, ratio };
}

describe("the grip sweep (plan Amendment C, Task C2; C-d4, C-d5)", () => {
    it("plays 17 grips from 0 to 1", () => {
        expect(GRIPS).toHaveLength(17);
        expect(GRIPS[0]).toBe(0);
        expect(GRIPS[16]).toBe(1);
        expect(GRIPS[1]).toBe(GRIP_STEP);
    });

    it("finds the reliable grip where the ratio is flat, in σ 0.25–0.5, the middle of a tie", () => {
        // Steep below 0.25 and above 0.5, flat between: the flat grips' neighbours change it least.
        const plays = GRIPS.map((g) => play(g, 5, g < 0.25 ? 1 + 4 * g : g > 0.5 ? 2 + 4 * (g - 0.5) : 2));
        const { reliable } = gripBounds(plays);
        expect(reliable).toBeGreaterThanOrEqual(0.25);
        expect(reliable).toBeLessThanOrEqual(0.5);
        // 0.3125, 0.375 and 0.4375 tie at no change: the middle one.
        expect(reliable).toBe(0.375);
    });

    it("skips grips that do not play for the least and firmest, and prefers a grip without a slip", () => {
        const plays = GRIPS.map((g) =>
            g < 0.2 ? play(g, 5, 2, "unlawful") : g > 0.8 ? play(g, 5, 2, "superhuman") : play(g, 5, 2, null, g < 0.3),
        );
        expect(gripBounds(plays)).toMatchObject({ least: 0.3125, firmest: 0.75 });
        const slipping = GRIPS.map((g) => play(g, 5, 2, g === 0.5 ? null : "turf", true));
        expect(gripBounds(slipping)).toEqual({ least: 0.5, firmest: 0.5, reliable: 0.5 });
        expect(gripBounds(GRIPS.map((g) => play(g, 5, 2, "mishit")))).toEqual({
            least: null,
            firmest: null,
            reliable: null,
        });
    });

    it("never takes an isolated grip as reliable beside a run that plays", () => {
        const plays = GRIPS.map((g) => play(g, 5, 2 + g, g === 0 || g >= 0.5 ? null : "turf"));
        expect(gripBounds(plays).reliable).toBeGreaterThanOrEqual(0.5);
    });

    it("recovers a known quadratic within 1e-9, dropping a constant input and a two-valued input's square", () => {
        const truth = (x: readonly number[]): number =>
            0.3 + 0.2 * (x[0] as number) - 0.05 * (x[1] as number) ** 2 + 0.1 * (x[3] as number);
        const xs: number[][] = [];
        for (let i = 0; i < 60; i++) {
            // Input 2 is constant; input 3 takes two values.
            xs.push([Math.sin(i), Math.cos(1.7 * i) * 2, 0.4, i % 2]);
        }
        const fit = fitGrip(
            xs,
            xs.map((x) => truth(x)),
        );
        for (const x of [
            [0.3, -1.2, 0.4, 1],
            [-0.8, 0.5, 0.4, 0],
        ]) {
            expect(Math.abs(predictGrip(fit, x) - truth(x))).toBeLessThan(1e-9);
        }
        expect(heldOutError(fit, xs, xs.map(truth))).toBeLessThan(1e-9);
        expect(heldOutError(fit, [], [])).toBeNaN();
    });

    it("draws the same held-out plans for the same seed, without replacement", () => {
        const items = Array.from({ length: 50 }, (_, i) => i);
        const a = drawHeldOut(items, 20, 7);
        expect(drawHeldOut(items, 20, 7)).toEqual(a);
        expect(drawHeldOut(items, 20, 8)).not.toEqual(a);
        expect(new Set(a).size).toBe(20);
        expect(drawHeldOut(items, 80, 7)).toHaveLength(50);
    });

    it("lists the starting plans once each, the text books at each power, then held-out plans not among them", () => {
        const drive = textBook("drive");
        const picked = { type: "drive" as const, plan: drive, band: "viable" as const, read: { power: 1 } };
        const pick = { label: "drive", range: 10, lawn: 10, least: picked, viable: picked } as unknown as BandPick;
        const other: MapPlan = { ...drive, feet: drive.feet + 0.05 };
        const plans = gripPlans(
            { found: [pick], fitted: [pick] },
            ["drive"],
            [0.5, 1],
            [
                { type: "drive", plan: drive, power: 1 },
                { type: "drive", plan: other, power: 1 },
                { type: "drive", plan: other, power: 1 },
            ],
        );
        expect(plans.map((p) => [p.set, p.power, p.plan === other])).toEqual([
            ["start", 1, false],
            ["start", 0.5, false],
            ["held", 1, true],
        ]);
        expect(HELD_OUT).toBe(2000);
    });

    it("times only a starting plan with a timed change", () => {
        const book = textBook("drive");
        expect(timingPlays({ type: "drive", plan: book, power: 1, set: "start" }, 0.5)).toEqual([]);
        const braked = { ...book, drive: -1 };
        expect(timingPlays({ type: "drive", plan: braked, power: 1, set: "held" }, 0.5)).toEqual([]);
        expect(timingPlays({ type: "drive", plan: braked, power: 1, set: "start" }, null)).toEqual([]);
    });

    it("writes a shard line that reads back, NaN kept, a repeat and a torn line counted", () => {
        const plays = GRIPS.map((g) => play(g, 5, NaN));
        const entry = { index: 3, plays, bounds: gripBounds(plays), timing: [] };
        const { entries, torn, duplicates } = parseGripLines([gripLine(entry), gripLine(entry), '{"index":4,', ""]);
        expect(entries.get(3)).toEqual(entry);
        expect({ torn, duplicates }).toEqual({ torn: 1, duplicates: 1 });
    });

    it("fits each type's grips on the starting plans and checks them on the held-out ones", () => {
        const book = textBook("drive");
        const jobs: GripPlan[] = [];
        const entries = new Map<number, GripEntry>();
        for (let i = 0; i < 40; i++) {
            const power = 0.2 + 0.02 * i;
            jobs.push({
                type: "drive",
                plan: { ...book, feet: book.feet + 0.001 * (i % 7) },
                power,
                set: i % 4 === 0 ? "held" : "start",
            });
            // The grip rises with power alone, on the grid: the fit is within half a step of it.
            const grip = Math.round(power / GRIP_STEP) * GRIP_STEP;
            const plays = GRIPS.map((g) => play(g, 5, 2, g < grip ? "unlawful" : null));
            entries.set(i, { index: i, plays, bounds: gripBounds(plays), timing: [] });
        }
        entries.set(40, { index: 40, engineError: "boom" });
        jobs.push({ type: "drive", plan: book, power: 1, set: "start" });
        const fits = gripFits(jobs, entries);
        expect(fits.map((f) => f.grip)).toEqual(["least", "firmest", "reliable"]);
        const least = fits[0];
        expect(least?.fit?.rows).toBe(30);
        expect(least?.heldOut).toBe(10);
        expect(least?.error).toBeLessThanOrEqual(GRIP_STEP / 2);
        expect(least?.accepted).toBe(true);
    });

    it("times the follow-through early by moving the hands' and the pendulum's pulses together", () => {
        const book = textBook("stop-ac");
        const on = mapSetup("stop-ac", book, 1).stroke.timing;
        const early = mapSetup("stop-ac", book, 1, {}, -0.005).stroke.timing;
        expect(early.hands).toBeCloseTo(on.hands - 0.005, 12);
        expect(early.arc).toBeCloseTo(on.arc - 0.005, 12);
        expect(early.dip).toBe(on.dip);
    });

    it("plays a given firmness as the preset hold plays its own", () => {
        const book = textBook("drive");
        const firmness = defaultProfile.shape.drive.holdFirmness;
        expect(playSample("drive", book, 0.5, [10], firmness)).toEqual(playSample("drive", book, 0.5, [10], "preset"));
    }, 120_000);
});
