import { describe, expect, it } from "vitest";
import { openWorld } from "../../scripts/openLawn";
import { followThroughPlans, gridFor, neighbourGaps } from "../../scripts/pushMapGrid";
import {
    HEAD_OVER_BALL,
    MAP_TYPES,
    canonicalPower,
    firstPassRead,
    mapSetup,
    playSample,
    playedClass,
    textBook,
    type MapPlan,
    type MapType,
} from "../../scripts/pushMapRun";
import type { ShotSetup } from "../../src/engine/swing/types";
import { OLD_ROLL_HANDS } from "./support/shot";

describe("the jumpiness bound's neighbours (plan B-d7)", () => {
    const grid = gridFor("full-roll");
    const book = textBook("full-roll");
    const plans = followThroughPlans(book, grid);

    /** The plan at these follow-through values. */
    const at = (drive: number, handReach: number, window: number): MapPlan => ({ ...book, drive, handReach, window });

    it("takes every drive, handReach and window, the text book's other inputs held", () => {
        expect(plans).toHaveLength(5 * 4 * 3);
        expect(new Set(plans.map((p) => p.drive))).toEqual(new Set(grid.drive.graded));
        expect(new Set(plans.map((p) => p.handReach))).toEqual(new Set(grid.handReach.graded));
        expect(new Set(plans.map((p) => p.window))).toEqual(new Set(grid.window.graded));
        for (const plan of plans) {
            expect({ ...plan, drive: book.drive, handReach: book.handReach, window: book.window }).toEqual(book);
        }
    });

    it("counts each pair one step apart once, along each of the three axes", () => {
        const gaps = neighbourGaps(
            grid,
            plans.map((plan) => ({ plan, ratio: 1 })),
        );
        expect(gaps).toHaveLength(4 * 4 * 3 + 5 * 3 * 3 + 5 * 4 * 2);
        expect(gaps.every((g) => g.gap === 0)).toBe(true);
    });

    it("sorts the largest difference first and names its step", () => {
        const points = [
            { plan: at(0, 0.1, 0.02), ratio: 1 },
            { plan: at(0, 0.2, 0.02), ratio: 1.3 },
            { plan: at(0.5, 0.1, 0.02), ratio: 1.1 },
        ];
        const gaps = neighbourGaps(grid, points);
        expect(gaps).toHaveLength(2);
        expect(gaps[0]?.dimension).toBe("handReach");
        expect(gaps[0]?.gap).toBeCloseTo(0.3, 12);
        expect(gaps[1]?.dimension).toBe("drive");
        expect(gaps[1]?.gap).toBeCloseTo(0.1, 12);
    });

    it("leaves out a pair two steps apart, and one with a ratio not finite", () => {
        const twoApart = [
            { plan: at(-1, 0.1, 0.02), ratio: 1 },
            { plan: at(0, 0.1, 0.02), ratio: 2 },
        ];
        expect(neighbourGaps(grid, twoApart)).toHaveLength(0);
        const unread = [
            { plan: at(0, 0.1, 0.02), ratio: NaN },
            { plan: at(0, 0.2, 0.02), ratio: 1 },
        ];
        expect(neighbourGaps(grid, unread)).toHaveLength(0);
    });
});

describe("a head that rides over the ball (plan B-d8)", () => {
    const world = openWorld(10);
    // Hands-from-lean design §3: on the law's fisted hands the slack pass roll ends off the face (unpractised), so
    // these plays keep the hands before the law, where the head rides over the ball.
    const held = (type: MapType, plan: MapPlan, firmness: number): ShotSetup => {
        const setup = mapSetup(type, plan, canonicalPower(type, world), { stance: OLD_ROLL_HANDS });
        return { ...setup, stroke: { ...setup.stroke, holdFirmness: firmness } };
    };

    it("is a mishit on the slack pass roll whose push never lands", () => {
        const plan = { ...textBook("pass-roll"), drive: 0.5, handReach: 0.3, window: 0.02 };
        expect(playedClass(held("pass-roll", plan, 0), world)).toEqual({ klass: "mishit", reason: HEAD_OVER_BALL });
    }, 120_000);

    it("leaves a stroke with no push alone, however slack", () => {
        const plan = { ...textBook("pass-roll"), drive: 0.5, handReach: 0, window: 0.02 };
        expect(playedClass(held("pass-roll", plan, 0), world).reason).not.toBe(HEAD_OVER_BALL);
    }, 120_000);

    it.each(MAP_TYPES)(
        "does not touch the %s's text book at its canonical power",
        (type) => {
            const sample = playSample(type, textBook(type), canonicalPower(type, world), [10]);
            expect(sample.reason).not.toBe(HEAD_OVER_BALL);
        },
        // The rolls' firmness search takes 35 s alone and passed 120 s beside the whole suite (was 120 s).
        300_000,
    );
});

describe("a play without practice (plan B-d7)", () => {
    it("reads as the practised sample where the stroke plays once, a stroke with no push", () => {
        const plan = { ...textBook("full-roll"), handReach: 0 };
        const sample = playSample("full-roll", plan, 0.5, [10]);
        expect(sample.passes).toBe(1);
        expect(firstPassRead("full-roll", plan, 0.5, sample.firmness, 10)).toEqual(sample.byLawn[10]);
    }, 120_000);
});
