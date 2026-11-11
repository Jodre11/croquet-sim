import { describe, expect, it } from "vitest";
import {
    TABLE_DIMENSIONS,
    encodePoint,
    judge,
    nearestGrip,
    pointCount,
    pointIndex,
    readBandTable,
    writeBandTable,
    type BandTable,
    type GripPlan,
    type TableBand,
    type TableHeader,
} from "../../src/lab/judge";
import type { MapClass, MapPlan } from "../../src/lab/play";

const DEG = Math.PI / 180;

/** A small pass-roll table: split 0°, 2°, 4° and lean 0, 1 graded, lean 2 beyond; one range and lawn. */
const HEADER: TableHeader = {
    type: "pass-roll",
    axes: {
        ...(Object.fromEntries(
            TABLE_DIMENSIONS.map((d) => [d, { values: [0], graded: [true] }]),
        ) as unknown as TableHeader["axes"]),
        split: { values: [0, 2 * DEG, 4 * DEG], graded: [true, true, true] },
        lean: { values: [0, 1, 2], graded: [true, true, false] },
    },
    ranges: [1],
    lawns: [10],
};

const PLAN: MapPlan = { lean: 0, feet: 0, drive: 0, handReach: 0, window: 0, onset: 0, split: 0, speedGain: 0 };

interface Cell {
    readonly split: number;
    readonly lean: number;
    readonly band: TableBand;
    readonly klass?: MapClass;
    readonly power?: number;
}

/** A table holding `cells` alone, written and read back as the viewer reads it. */
function tableOf(cells: readonly Cell[]): BandTable {
    const n = pointCount(HEADER);
    const codes = new Uint8Array(n);
    const powers = new Float32Array(n).fill(NaN);
    for (const c of cells) {
        const index = pointIndex(HEADER, { ...PLAN, split: c.split, lean: c.lean }, 1, 10) as number;
        codes[index] = encodePoint(c.band, c.klass ?? null);
        powers[index] = c.power ?? NaN;
    }
    const bytes = writeBandTable(HEADER, codes, powers);
    return readBandTable(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}

const at = (split: number, lean: number) => ({ ...PLAN, split, lean });

describe("judge (spec §3.3)", () => {
    it("takes the record's band on a grid point", () => {
        const table = tableOf([
            { split: 0, lean: 0, band: "viable", power: 1 },
            { split: 0, lean: 1, band: "unplayable", klass: "mishit" },
            { split: 2 * DEG, lean: 0, band: "", klass: "off-court" },
            { split: 2 * DEG, lean: 1, band: "" },
        ]);
        expect(judge(table, at(0, 0), 1, 10)).toEqual({ band: "viable", klass: null, power: 1 });
        expect(judge(table, at(0, 1), 1, 10)).toEqual({ band: "non-viable", klass: "mishit", power: null });
        expect(judge(table, at(2 * DEG, 0), 1, 10)).toEqual({ band: "non-viable", klass: "off-court", power: null });
        expect(judge(table, at(2 * DEG, 1), 1, 10).band).toBe("unknown");
    });

    it("is edgy mid-cell with one unplayable corner, its power the corners' linear mix", () => {
        const table = tableOf([
            { split: 0, lean: 0, band: "viable", power: 1 },
            { split: 0, lean: 1, band: "unplayable", klass: "turf", power: 3 },
        ]);
        expect(judge(table, at(0, 0.25), 1, 10)).toEqual({ band: "edgy", klass: null, power: 1.5 });
    });

    it("is non-viable mid-cell with all four corners unplayable", () => {
        const table = tableOf([
            { split: 0, lean: 0, band: "unplayable", klass: "turf" },
            { split: 0, lean: 1, band: "unplayable", klass: "mishit" },
            { split: 2 * DEG, lean: 0, band: "unplayable", klass: "turf" },
            { split: 2 * DEG, lean: 1, band: "", klass: "superhuman" },
        ]);
        const judged = judge(table, at(1.5 * DEG, 0.75), 1, 10);
        expect(judged).toEqual({ band: "non-viable", klass: "superhuman", power: null });
    });

    it("is unknown mid-cell with an unread corner, and null-powered with no corner power", () => {
        const table = tableOf([
            { split: 0, lean: 0, band: "viable" },
            { split: 0, lean: 1, band: "viable" },
            { split: 2 * DEG, lean: 0, band: "viable" },
        ]);
        expect(judge(table, at(1 * DEG, 0.5), 1, 10)).toEqual({ band: "unknown", klass: null, power: null });
        expect(judge(table, at(0, 0.5), 1, 10)).toEqual({ band: "viable", klass: null, power: null });
    });

    it("judges the pass roll's split at 3° from 2° and 4°", () => {
        const table = tableOf([
            { split: 0, lean: 0, band: "unplayable", klass: "mishit", power: 9 },
            { split: 2 * DEG, lean: 0, band: "viable", power: 2 },
            { split: 4 * DEG, lean: 0, band: "viable", power: 4 },
        ]);
        const judged = judge(table, at(3 * DEG, 0), 1, 10);
        expect(judged.band).toBe("viable");
        expect(judged.power).toBeCloseTo(3, 12);
    });

    it("is unknown beyond the graded span or off the range and lawn axes", () => {
        const table = tableOf([
            { split: 0, lean: 1, band: "viable", power: 1 },
            { split: 0, lean: 2, band: "viable", power: 1 },
        ]);
        expect(judge(table, at(0, 1.5), 1, 10).band).toBe("unknown");
        expect(judge(table, at(0, 2), 1, 10).band).toBe("unknown");
        expect(judge(table, at(0, 1), 2, 10).band).toBe("unknown");
        expect(judge(table, at(0, 1), 1, 6).band).toBe("unknown");
    });
});

describe("nearestGrip (spec §3.3, decision 8)", () => {
    const grip = (over: Partial<GripPlan> & { readonly lean: number }): GripPlan => ({
        type: "drive",
        plan: { ...PLAN, lean: over.lean },
        power: 0,
        set: "start",
        least: 0,
        firmest: 1,
        reliable: 0.5,
        range: 1,
        ratio: 3,
        timing: [],
        ...over,
    });

    it("picks by standardised distance among same-type plans with a reliable grip, held-out plans included", () => {
        const a = grip({ lean: 0, power: 0 });
        const b = grip({ lean: 0.02, power: 2, set: "held" });
        const c = grip({ lean: 0.01, power: 10 });
        const unreliable = grip({ lean: 0.02, power: 0, reliable: null });
        const other = grip({ lean: 0.02, power: 0, type: "stop-ac" });
        // Raw distance favours a (0.0004 against 4); standardised, b is nearer.
        expect(nearestGrip([a, b, c, unreliable, other], "drive", { ...PLAN, lean: 0.02 }, 0)).toBe(b);
    });

    it("is null where no plan of the type has a reliable grip", () => {
        expect(nearestGrip([grip({ lean: 0, reliable: null })], "drive", PLAN, 0)).toBeNull();
    });
});
