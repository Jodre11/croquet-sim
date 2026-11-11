import { describe, expect, it } from "vitest";
import {
    csvFields,
    driveRises,
    drops,
    effectTally,
    holesOf,
    leanSpans,
    parseRecord,
    splitAtRestByLean,
    type RecordRow,
} from "../../scripts/pushMapChecks";
import { prettyJson } from "../../scripts/pushMap";
import type { SweepSample } from "../../scripts/pushMapGrid";
import type { MapSample } from "../../scripts/pushMapRun";

/** A record row: an admissible drive read unless the overrides say otherwise. */
function row(over: Partial<RecordRow>): RecordRow {
    return {
        type: "drive",
        lean: 0,
        feet: 0.1,
        drive: 0,
        handReach: 0,
        window: 0.01,
        onset: 0,
        split: 0,
        speedGain: 0.2,
        range: 1,
        lawn: 10,
        band: "viable",
        klass: "",
        ratio: 3,
        strokeEffort: 10,
        pushEffort: 5,
        pushImpulse: 0.1,
        splitAtRest: 0,
        power: 0.5,
        ...over,
    };
}

describe("parseRecord", () => {
    it("reads the record's columns, skipping the # lines and keeping a quoted comma", () => {
        const text = [
            "# command: x",
            "type,lean,feet,drive,handReach,window,onset,split,speedGain,range,lawn,band,edge,class,reason,ratio," +
                "strokeEffort,pushEffort,coupleShare,pushImpulse,firmness,followSlip,splitAtRest,power,monotone," +
                "timed,setUp,size",
            'pass-roll,0.5,0.2,1,0.1,0.02,0,0.1,0.1,2,6,edgy,lean,turf,"dug, deep",,12,8,0,0.2,0,0,0.05,0.7,1,1,2,3',
        ].join("\n");
        const [r] = parseRecord(text);
        expect(r?.type).toBe("pass-roll");
        expect(r?.band).toBe("edgy");
        expect(r?.klass).toBe("turf");
        expect(r?.ratio).toBeNaN();
        expect(r?.split).toBe(0.1);
        expect(r?.power).toBe(0.7);
    });

    it("splits a CSV line per RFC 4180", () => {
        expect(csvFields('a,"b,c","d""e",')).toEqual(["a", "b,c", 'd"e', ""]);
    });
});

describe("driveRises", () => {
    it("counts the slices whose ratio rises with drive and the largest rise", () => {
        const rows = [
            row({ drive: -1, ratio: 3 }),
            row({ drive: 0, ratio: 3.4 }),
            row({ drive: 1, ratio: 3.1 }),
            row({ lean: 0.1, drive: -1, ratio: 3 }),
            row({ lean: 0.1, drive: 1, ratio: 2 }),
            row({ lean: 0.2, drive: 0, ratio: 9 }),
            row({ lean: 0.2, drive: 1, ratio: 9.9, band: "" }),
        ];
        expect(driveRises(rows)).toEqual({ slices: 2, rising: 1, largest: expect.closeTo(0.4, 9) as number });
    });
});

describe("holesOf", () => {
    it("finds runs of empty bins between reached ones, the boundary kept apart, single ball ignored", () => {
        const rows = [
            row({ range: 2, ratio: 3.1 }),
            row({ range: 2, ratio: 4.3 }),
            row({ range: 2, ratio: 3.7, band: "" }),
            row({ range: 2, ratio: 3.7, type: "single-ball" }),
            row({ range: 30, ratio: 1 }),
            row({ range: 30, ratio: 2.5 }),
            row({ range: 1, ratio: 3, lawn: 6 }),
            row({ range: 1, ratio: 5, lawn: 6 }),
        ];
        const holes = holesOf(rows, 10);
        expect(holes).toHaveLength(2);
        expect(holes[0]).toMatchObject({ range: 2, pastBoundary: false });
        expect(holes[0]?.least).toBeCloseTo(3.6, 9);
        expect(holes[0]?.most).toBeCloseTo(4.2, 9);
        expect(holes[1]).toMatchObject({ range: 30, pastBoundary: true });
    });

    it("explains a hole by the leans either side of it", () => {
        const rows = [row({ range: 2, ratio: 3.5, lean: 0.1 }), row({ range: 2, ratio: 4.3, lean: 0 })];
        const [hole] = holesOf(rows, 10);
        const spans = leanSpans(rows, hole as NonNullable<typeof hole>, 10, 0.6);
        expect(spans.map((s) => [s.lean, s.least])).toEqual([
            [0, 4.3],
            [0.1, 3.5],
        ]);
    });
});

describe("splitAtRestByLean", () => {
    it("takes the median split at rest per lean of the pass roll's admissible reads at one split", () => {
        const pass = { type: "pass-roll" as const, split: 0.1 };
        const rows = [
            row({ ...pass, lean: 0.5, splitAtRest: 0.1 }),
            row({ ...pass, lean: 0.5, splitAtRest: 0.3 }),
            row({ ...pass, lean: 0.5, splitAtRest: 0.2 }),
            row({ ...pass, lean: 0.6, splitAtRest: 0.05 }),
            row({ ...pass, lean: 0.6, splitAtRest: 0.9, band: "" }),
            row({ ...pass, split: 0, lean: 0.6, splitAtRest: 0 }),
        ];
        expect(splitAtRestByLean(rows, 10, 0.1)).toEqual([
            { lean: 0.5, n: 3, median: 0.2 },
            { lean: 0.6, n: 1, median: 0.05 },
        ]);
    });
});

describe("effectTally", () => {
    it("counts the samples where the shipped and contact-only verdicts differ, at either hold", () => {
        const sample = (shipped: boolean, contactOnly: boolean): MapSample =>
            ({ power: 1, effectVerdicts: { shipped, contactOnly } }) as unknown as MapSample;
        const sweeps: SweepSample[][] = [
            [
                { ...sample(true, false), fitted: sample(false, false) },
                { ...sample(false, true), fitted: { power: 1, engineError: "x" } },
                { power: 1, engineError: "y" },
            ],
            [sample(true, true)],
        ];
        expect(effectTally(sweeps, false)).toEqual({ samples: 3, shippedOnly: 1, contactOnly: 1 });
        expect(effectTally(sweeps, true)).toEqual({ samples: 1, shippedOnly: 0, contactOnly: 0 });
    });
});

describe("drops", () => {
    it("counts the falls along a path", () => {
        expect(drops([1, 2, 1, 3, 2, 2])).toBe(2);
    });
});

describe("prettyJson", () => {
    it("writes the committed defaults exactly as the format check wants them", async () => {
        const specifier = "node:fs";
        const fs = (await import(/* @vite-ignore */ specifier)) as {
            readFileSync(path: string, encoding: "utf8"): string;
        };
        const path = "reference/derived/envelope-defaults.json";
        const committed = fs.readFileSync(path, "utf8");
        const compact = JSON.stringify(JSON.parse(committed));
        expect(await prettyJson(compact)).toBe(committed);
    });
});
