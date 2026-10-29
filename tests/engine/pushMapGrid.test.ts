import { describe, expect, it } from "vitest";
import {
    BEYOND_P_MAX,
    bands,
    cellCorners,
    cellReads,
    classCounts,
    doneIndices,
    envelopeRows,
    excludedSetUps,
    grade,
    gridFor,
    lawnSpreads,
    mergeLines,
    nonMonotoneCount,
    offGridBand,
    parseReads,
    pickDefault,
    planKey,
    plansOf,
    quantile,
    readAt,
    readsJson,
    readsOf,
    regionCounts,
    shardLine,
    spreadSummary,
    type Axis,
    type Band,
    type MapGrid,
    type SweepRead,
} from "../../scripts/pushMapGrid";
import type { MapClass, MapPlan, MapSample } from "../../scripts/pushMapRun";

const DEG = Math.PI / 180;
const LAWN = 10;

/** A synthetic sample at `power` reaching `range` (m) on the 10 s lawn, with `ratio` and both efforts `effort` %. */
function sample(power: number, range: number, klass: MapClass | null = null, ratio = 2, effort = 50): MapSample {
    return {
        power,
        klass,
        reason: klass,
        byLawn: { [LAWN]: { range, ratio, splitAtRest: 0 } },
        strokeEffort: effort,
        pushEffort: effort,
        coupleShare: 0.5,
        pushImpulse: power,
        effectVerdicts: { shipped: false, contactOnly: false },
        followCap: false,
    };
}

/** A read with class `klass`, ratio `ratio` and both efforts `effort` %. */
function read(klass: MapClass | null, ratio = 2, effort = 50, reason: string | null = klass): SweepRead {
    return {
        klass,
        reason,
        ratio,
        splitAtRest: 0,
        strokeEffort: effort,
        pushEffort: effort,
        coupleShare: 0,
        pushImpulse: 0,
        power: 1,
        monotone: true,
    };
}

const ONE = (v: number): Axis => ({ graded: [v], beyond: [] });

/** A 3×3 lean × drive grid at one range and lawn; every other dimension a single value. */
function smallGrid(leanBeyond: readonly number[] = []): MapGrid {
    return {
        lean: { graded: [20 * DEG, 26 * DEG, 32 * DEG], beyond: leanBeyond },
        feet: ONE(0.1),
        drive: { graded: [0, 0.5, 1], beyond: [] },
        handReach: ONE(0.15),
        window: ONE(0.02),
        split: ONE(0),
        ranges: [10],
        lawns: [LAWN],
        powers: [0.5, 1],
    };
}

function plan(lean: number, drive: number, over: Partial<MapPlan> = {}): MapPlan {
    return { lean, feet: 0.1, drive, handReach: 0.15, window: 0.02, onset: 0, split: 0, ...over };
}

describe("the push map's grid, sweep, bands and record (P2b.2b.2c.3b plan Task 4)", () => {
    it("reads a range linearly in p between the samples that bracket it", () => {
        const sweep = [sample(0.5, 4, null, 2, 20), sample(1, 8, null, 1.6, 60)];
        const got = readAt(sweep, 6, LAWN);
        expect(got?.klass).toBeNull();
        expect(got?.reason).toBeNull();
        expect(got?.power).toBeCloseTo(0.75, 12);
        expect(got?.ratio).toBeCloseTo(1.8, 12);
        expect(got?.strokeEffort).toBeCloseTo(40, 12);
        expect(got?.pushImpulse).toBeCloseTo(0.75, 12);
        expect(got?.monotone).toBe(true);
    });

    it("gives a bracket the class and reason of an excluded sample, at an end or unplayed between", () => {
        const sweep = [sample(0.5, 4), sample(1, 8, "turf"), sample(1.5, 12)];
        expect(readAt(sweep, 6, LAWN)?.klass).toBe("turf");
        expect(readAt(sweep, 10, LAWN)?.reason).toBe("turf");
        const gap = [sample(0.5, 4), sample(0.75, NaN, "superhuman"), sample(1, 8)];
        expect(readAt(gap, 6, LAWN)?.klass).toBe("superhuman");
    });

    it("reads a range below every sample's as unreachable, and a dip's first bracket (Review Focus 3)", () => {
        const sweep = [sample(0.5, 10), sample(1, 20), sample(2, 30)];
        const near = readAt(sweep, 5, LAWN);
        expect(near?.klass).toBe("unreachable");
        expect(Number.isNaN(near?.ratio)).toBe(true);
        // The range rises to 20 m, dips to 15 m, then rises to 30 m: 18 m lies in the first bracket (p 0.5–1) and in
        // the dip's two; the first is read.
        const dip = [sample(0.5, 10), sample(1, 20), sample(1.5, 15), sample(2, 30)];
        const got = readAt(dip, 18, LAWN);
        expect(got?.monotone).toBe(false);
        expect(got?.power).toBeCloseTo(0.9, 12);
    });

    it("reads a range beyond every sample's by the first classed one above, else superhuman (ruling A3)", () => {
        // (a) The couple passes C above p 1.5: 20 m needs a power the grip cannot hold.
        const held = [sample(1, 10), sample(1.5, 15), sample(2, NaN, "superhuman")];
        expect(readAt(held, 20, LAWN)?.klass).toBe("superhuman");
        // (b) Every sample plays, the last at p = 2 (the body's limit at full intensity) reaching 8.4 m.
        const short = [sample(0.5, 2), sample(1, 5), sample(2, 8.4)];
        const got = readAt(short, 9.75, LAWN);
        expect(got?.klass).toBe("superhuman");
        expect(got?.reason).toBe(BEYOND_P_MAX);
    });

    it("leaves a read out where an engine error decides it", () => {
        const error = { power: 0.75, engineError: "impact: MAX_FALL" };
        const sweep = [sample(0.5, 4), error, sample(1, 8), sample(2, 12)];
        expect(readAt(sweep, 6, LAWN)).toBeNull();
        expect(readAt(sweep, 10, LAWN)?.klass).toBeNull();
        expect(readAt([sample(1, 8), { power: 2, engineError: "x" }], 10, LAWN)).toBeNull();
    });

    it("bands an unplayable corner's two neighbours edgy and the rest viable; drive 1 is not penalised", () => {
        const grid = smallGrid();
        const reads = new Map<string, SweepRead>();
        for (const p of plansOf("half-roll", grid)) {
            const corner = p.lean === 20 * DEG && p.drive === 0;
            reads.set(planKey(p, 10, LAWN), read(corner ? "turf" : null));
        }
        const banded = bands("half-roll", grid, reads);
        const band = (lean: number, drive: number): Band | undefined =>
            banded.get(planKey(plan(lean, drive), 10, LAWN));
        expect(band(20 * DEG, 0)).toBe("unplayable");
        expect(band(26 * DEG, 0)).toBe("edgy");
        expect(band(20 * DEG, 0.5)).toBe("edgy");
        const viable = [
            [20 * DEG, 1],
            [26 * DEG, 0.5],
            [26 * DEG, 1],
            [32 * DEG, 0],
            [32 * DEG, 0.5],
            [32 * DEG, 1],
        ] as const;
        for (const [lean, drive] of viable) {
            expect(band(lean, drive)).toBe("viable");
        }
        expect(banded.size).toBe(9);
    });

    it("leaves unbanded, and counts, a plan whose neighbour has no read", () => {
        const grid = smallGrid();
        const reads = new Map<string, SweepRead>();
        for (const p of plansOf("half-roll", grid)) {
            if (!(p.lean === 32 * DEG && p.drive === 1)) {
                reads.set(planKey(p, 10, LAWN), read(null));
            }
        }
        const { banded, unbanded } = grade("half-roll", grid, reads);
        expect(banded.has(planKey(plan(26 * DEG, 1), 10, LAWN))).toBe(false);
        expect(banded.has(planKey(plan(32 * DEG, 0.5), 10, LAWN))).toBe(false);
        expect(unbanded).toBe(2);
        expect(banded.size).toBe(6);
    });

    it("counts a beyond lean's read, and a beyond lean past 45° as unplayable unread (Review Focus 4)", () => {
        const grid = smallGrid([14 * DEG, 50 * DEG]);
        const plans = plansOf("half-roll", grid);
        // Three graded leans and two beyond, each at three drives.
        expect(plans).toHaveLength(15);
        const reads = new Map<string, SweepRead>();
        for (const p of plans) {
            if (p.lean === 50 * DEG) {
                continue;
            }
            reads.set(planKey(p, 10, LAWN), read(p.lean === 14 * DEG && p.drive === 1 ? "mishit" : null));
        }
        const banded = bands("half-roll", grid, reads);
        const band = (lean: number, drive: number): Band | undefined =>
            banded.get(planKey(plan(lean, drive), 10, LAWN));
        expect(band(20 * DEG, 1)).toBe("edgy");
        expect(band(20 * DEG, 0)).toBe("viable");
        expect(band(32 * DEG, 0)).toBe("edgy");
        expect(band(26 * DEG, 0)).toBe("viable");
        // The beyond plans are run as neighbours only, never graded.
        expect(band(14 * DEG, 0)).toBeUndefined();
    });

    it("leaves a plan viable whose neighbour is admissible but outside the region", () => {
        const grid = smallGrid();
        const reads = new Map<string, SweepRead>();
        for (const p of plansOf("half-roll", grid)) {
            // The half roll's region is 1.4–2.5; the corner's 0.8 is a pass roll's ratio, admissible all the same.
            reads.set(planKey(p, 10, LAWN), read(null, p.lean === 20 * DEG && p.drive === 0 ? 0.8 : 2));
        }
        const banded = bands("half-roll", grid, reads);
        expect(banded.get(planKey(plan(26 * DEG, 0), 10, LAWN))).toBe("viable");
        expect(banded.get(planKey(plan(20 * DEG, 0.5), 10, LAWN))).toBe("viable");
    });

    it("steps the pass roll's split as a neighbour, mirrored at 0°", () => {
        const splits = [0, 10, 20, 30, 40].map((s) => s * DEG);
        const grid: MapGrid = {
            ...smallGrid(),
            lean: ONE(26 * DEG),
            drive: ONE(1),
            split: { graded: splits.slice(0, 4), beyond: [40 * DEG] },
        };
        const at = (split: number): MapPlan => plan(26 * DEG, 1, { split });
        const reads = new Map<string, SweepRead>();
        const fill = (failing: number): void => {
            for (const s of splits) {
                reads.set(planKey(at(s), 10, LAWN), read(s === failing ? "mishit" : null));
            }
        };
        fill(20 * DEG);
        let banded = bands("pass-roll", grid, reads);
        const band = (split: number): Band | undefined => banded.get(planKey(at(split), 10, LAWN));
        // 0°'s −10° neighbour is the mirror of +10°, read and admissible; no −10° plan is run.
        expect(band(0)).toBe("viable");
        expect(band(10 * DEG)).toBe("edgy");
        expect(band(30 * DEG)).toBe("edgy");
        expect(band(20 * DEG)).toBe("unplayable");
        fill(10 * DEG);
        banded = bands("pass-roll", grid, reads);
        expect(band(0)).toBe("edgy");
        // The half and full rolls do not step the split: 0° stays viable beside the failing 10°.
        banded = bands("half-roll", grid, reads);
        expect(band(0)).toBe("viable");
    });

    it("flags a plan's grid edges, not its inputs' bounds", () => {
        const grid: MapGrid = {
            ...smallGrid(),
            lean: ONE(26 * DEG),
            drive: { graded: [0.5, 1], beyond: [] },
            handReach: { graded: [0, 0.3], beyond: [] },
        };
        const reads = new Map<string, SweepRead>();
        for (const p of plansOf("half-roll", grid)) {
            reads.set(planKey(p, 10, LAWN), read(null));
        }
        const { edges } = grade("half-roll", grid, reads);
        // drive 1 and handReach 0 are the inputs' bounds; the single lean, feet and window values are grid edges.
        const low = plan(26 * DEG, 1, { handReach: 0 });
        expect(edges.get(planKey(low, 10, LAWN))).toEqual(["lean", "feet", "window"]);
        const high = plan(26 * DEG, 0.5, { handReach: 0.3 });
        expect(edges.get(planKey(high, 10, LAWN))).toEqual(["lean", "feet", "drive", "handReach", "window"]);
    });

    it("picks the least mean effort in the region, and beside an edgy least its viable runner-up", () => {
        const at = { range: 10, lawn: LAWN, split: 0 };
        const reads = new Map<string, SweepRead>();
        const banded = new Map<string, Band>();
        const put = (p: MapPlan, r: SweepRead, b: Band): void => {
            reads.set(planKey(p, 10, LAWN), r);
            banded.set(planKey(p, 10, LAWN), b);
        };
        put(plan(20 * DEG, 0), read(null, 2, 30), "edgy");
        put(plan(26 * DEG, 0), read(null, 2, 40), "viable");
        put(plan(32 * DEG, 0), read(null, 2, 45), "viable");
        // Least effort but outside the half roll's region, or unplayable, or with no effort: never picked.
        put(plan(20 * DEG, 0.5), read(null, 1.1, 10), "viable");
        put(plan(26 * DEG, 0.5), read("turf", 2, 5), "unplayable");
        put(plan(32 * DEG, 0.5), read(null, 2, NaN), "viable");
        const got = pickDefault("half-roll", reads, banded, at);
        expect(got.plan).toEqual(plan(20 * DEG, 0));
        expect(got.viable).toEqual(plan(26 * DEG, 0));
        const none = pickDefault("half-roll", reads, banded, { ...at, range: 20 });
        expect(none).toEqual({ plan: null, viable: null });
    });

    it("breaks an effort tie to the plan nearer the half roll's anchor in follow-through", () => {
        // The anchor is drive 1, handReach 0.15 m, window 0.02 s (design §3.3); the far plan, entered first, differs
        // in drive and window alone.
        const reads = new Map<string, SweepRead>();
        const banded = new Map<string, Band>();
        const far = plan(26 * DEG, 0, { window: 0.08 });
        const near = plan(26 * DEG, 1);
        for (const p of [far, near]) {
            reads.set(planKey(p, 10, LAWN), read(null, 2, 40));
            banded.set(planKey(p, 10, LAWN), "viable");
        }
        expect(pickDefault("half-roll", reads, banded, { range: 10, lawn: LAWN, split: 0 }).plan).toEqual(near);
    });

    it("writes the record's header, one row per read, and quotes a reason per RFC 4180", () => {
        const grid = smallGrid();
        const one = plan(26 * DEG, 0.5);
        const reason = 'off point: the lean 0.9 rad, "high"';
        const reads = new Map([[planKey(one, 10, LAWN), read("mishit", NaN, NaN, reason)]]);
        const rows = envelopeRows("half-roll", grid, reads, bands("half-roll", grid, reads));
        expect(rows).toHaveLength(2);
        expect(rows[0]).toBe(
            "type,lean,feet,drive,handReach,window,onset,split,range,lawn,band,edge,class,reason,ratio,strokeEffort," +
                "pushEffort,coupleShare,pushImpulse,splitAtRest,power,monotone",
        );
        expect(rows[1]).toBe(
            `half-roll,${26 * DEG},0.1,0.5,0.15,0.02,0,0,10,10,unplayable,feet;handReach;window,mishit,` +
                `"off point: the lean 0.9 rad, ""high""",,,,0,0,0,1,1`,
        );
    });

    it("counts each type's plans, none with two beyond values", () => {
        // Task 5's thinned grid: 3 leans × 3 feet × 5 drives × 4 hand reaches × 3 windows = 540 graded, plus 360
        // with a beyond lean and 360 with beyond feet; the pass roll's 4 splits give 2160 + 1440 + 1440, plus 540 at
        // the beyond split.
        const counts = { "half-roll": 1260, "full-roll": 1260, "pass-roll": 5580 } as const;
        for (const type of ["half-roll", "full-roll", "pass-roll"] as const) {
            const grid = gridFor(type);
            const plans = plansOf(type, grid);
            expect(plans).toHaveLength(counts[type]);
            const dims = ["split", "lean", "feet", "drive", "handReach", "window"] as const;
            const outside = (p: MapPlan): number => dims.filter((d) => grid[d].beyond.includes(p[d])).length;
            expect(plans.every((p) => outside(p) <= 1)).toBe(true);
        }
    });

    it("resumes a shard from its whole lines only: a torn line's plan is played again", () => {
        const p = plan(26 * DEG, 1);
        const whole = shardLine(9, p, { samples: [sample(1, 8)] });
        const torn5 = shardLine(5, p, { samples: [sample(1, 8)] }).slice(0, 30);
        const torn9 = whole.slice(0, 40);
        expect([...doneIndices(`${torn5}\n${whole}\n`)]).toEqual([9]);
        expect([...doneIndices(`${torn5}\n${torn9}`)]).toEqual([]);
        // Glued on one line (no newline after the torn fragment), neither is whole.
        expect([...doneIndices(`${torn5}${whole}\n`)]).toEqual([]);
    });

    it("merges shards, reporting a missing plan by index and an engine error apart (Review Focus 5)", () => {
        const grid = smallGrid();
        const plans = plansOf("half-roll", grid);
        const sweep = [sample(0.5, 4), sample(1, 12)];
        const lines = [
            shardLine(0, plans[0] as MapPlan, { samples: sweep }),
            shardLine(2, plans[2] as MapPlan, { samples: [sample(0.5, NaN, "unreachable"), sample(1, 12)] }),
            shardLine(3, plans[3] as MapPlan, { engineError: "impact: MAX_FALL" }),
            shardLine(0, plans[0] as MapPlan, { samples: sweep }),
            '{"index": 4, "pla',
            shardLine(5, plans[5] as MapPlan, {
                samples: [sample(0.5, 4), { power: 0.75, engineError: "impact: MAX_FALL" }, sample(1, 12)],
            }),
        ];
        for (let i = 6; i < plans.length; i++) {
            lines.push(shardLine(i, plans[i] as MapPlan, { samples: sweep }));
        }
        const merged = mergeLines(plans, lines);
        expect(merged.missing).toEqual([1, 4]);
        expect([...merged.engineErrors]).toEqual([[3, "impact: MAX_FALL"]]);
        expect(merged.duplicates).toBe(1);
        expect(merged.torn).toBe(1);
        // NaN survives the JSON line.
        const first = merged.samples.get(2)?.[0];
        expect(first !== undefined && "byLawn" in first && Number.isNaN(first.byLawn[LAWN]?.range)).toBe(true);
        const { reads, noRead } = readsOf(grid, plans, merged.samples);
        expect(reads.get(planKey(plans[0] as MapPlan, 10, LAWN))?.power).toBeCloseTo(0.875, 12);
        expect(reads.has(planKey(plans[3] as MapPlan, 10, LAWN))).toBe(false);
        expect(reads.has(planKey(plans[5] as MapPlan, 10, LAWN))).toBe(false);
        expect(noRead).toBe(1);
        expect(() => mergeLines(plans.slice(1), lines)).toThrow(/not this grid's plan/);
    });
});

describe("the half roll's stage-1 tallies (P2b.2b.2c.3b plan Task 6)", () => {
    /** smallGrid on three lawns, each lawn's read built by `at`. */
    function threeLawns(at: (p: MapPlan, lawn: number) => SweepRead): { grid: MapGrid; reads: Map<string, SweepRead> } {
        const grid: MapGrid = { ...smallGrid(), lawns: [6, 10, 14] };
        const reads = new Map<string, SweepRead>();
        for (const p of plansOf("half-roll", grid)) {
            for (const lawn of grid.lawns) {
                reads.set(planKey(p, 10, lawn), at(p, lawn));
            }
        }
        return { grid, reads };
    }

    it("reads the reads file back as merge wrote it, NaN kept", () => {
        const one = planKey(plan(26 * DEG, 1), 10, LAWN);
        const reads = new Map([[one, read("mishit", NaN, NaN, "impact-off-face")]]);
        const back = parseReads(readsJson(reads));
        expect([...back.keys()]).toEqual([one]);
        expect(back.get(one)?.klass).toBe("mishit");
        expect(Number.isNaN(back.get(one)?.ratio)).toBe(true);
    });

    it("measures the lawn's effect as the ratio's spread across the lawns, (max − min) / mean", () => {
        // Ratios 1.9, 2.0, 2.1 on the 6, 10 and 14 s lawns: (2.1 − 1.9) / 2 = 10 %. The drive-0 plans read 2 on every
        // lawn (no spread); the 20° drive-0 plan is turf on the 14 s lawn, so it drops out when admissible alone count.
        const { grid, reads } = threeLawns((p, lawn) => {
            const turf = p.lean === 20 * DEG && p.drive === 0 && lawn === 14;
            return read(turf ? "turf" : null, p.drive === 1 ? 1.9 + (lawn - 6) * 0.025 : 2);
        });
        const plans = plansOf("half-roll", grid);
        const all = lawnSpreads(grid, plans, reads, false);
        expect(all).toHaveLength(9);
        const admissible = lawnSpreads(grid, plans, reads, true);
        expect(admissible).toHaveLength(8);
        const spreads = all.map((s) => s.spread);
        expect(Math.max(...spreads)).toBeCloseTo(0.1, 12);
        const summary = spreadSummary(spreads, 0.02);
        expect(summary.count).toBe(9);
        expect(summary.median).toBe(0);
        expect(summary.max).toBeCloseTo(0.1, 12);
        expect(summary.above).toBe(3);
        // A ratio missing on one lawn leaves that plan and range out.
        reads.set(planKey(plan(26 * DEG, 0.5), 10, 6), read("unreachable", NaN));
        expect(lawnSpreads(grid, plans, reads, false)).toHaveLength(8);
    });

    it("takes the nearest-rank quantile", () => {
        expect(quantile([5, 1, 4, 2, 3], 0.5)).toBe(3);
        expect(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10);
        expect(Number.isNaN(quantile([], 0.5))).toBe(true);
    });

    it("counts the region's admissible graded plans by band, and every read by class", () => {
        const grid = smallGrid();
        const reads = new Map<string, SweepRead>();
        for (const p of plansOf("half-roll", grid)) {
            // The 20° drive-0 corner is turf; the 32° drive-1 plan is admissible at a pass roll's 0.8, out of region.
            const corner = p.lean === 20 * DEG && p.drive === 0;
            reads.set(
                planKey(p, 10, LAWN),
                read(corner ? "turf" : null, p.lean === 32 * DEG && p.drive === 1 ? 0.8 : 2),
            );
        }
        reads.delete(planKey(plan(32 * DEG, 0), 10, LAWN));
        const banded = bands("half-roll", grid, reads);
        // In the region: 20°/0.5 edgy beside the corner; 20°/1, 26°/0.5, 26°/1 viable; 26°/0 and 32°/0.5 unbanded
        // (their neighbour 32°/0 unread). 32°/1 is viable but out of the region.
        expect(regionCounts("half-roll", grid, reads, banded)).toEqual([
            { range: 10, lawn: LAWN, viable: 3, edgy: 1, unbanded: 2 },
        ]);
        const [classes] = classCounts(grid, plansOf("half-roll", grid), reads);
        expect(classes?.counts).toEqual({
            unreachable: 0,
            superhuman: 0,
            mishit: 0,
            turf: 1,
            unlawful: 0,
            admissible: 7,
            unread: 1,
        });
    });

    it("counts the plans whose sweep is not monotone on some lawn", () => {
        const { grid, reads } = threeLawns((p, lawn) => ({
            ...read(null),
            monotone: !(p.drive === 0.5 && lawn === 14),
        }));
        expect(nonMonotoneCount(grid, plansOf("half-roll", grid), reads)).toBe(3);
    });

    it("finds the set-ups with no admissible read, outright where every read shares its class", () => {
        const grid: MapGrid = { ...smallGrid(), feet: { graded: [0.05, 0.1], beyond: [] } };
        const reads = new Map<string, SweepRead>();
        for (const p of plansOf("half-roll", grid)) {
            let klass: MapClass | null = null;
            if (p.lean === 20 * DEG) {
                klass = "turf";
            } else if (p.lean === 32 * DEG && p.feet === 0.05) {
                klass = p.drive === 1 ? "superhuman" : "mishit";
            }
            reads.set(planKey(p, 10, LAWN), read(klass));
        }
        const plans = plansOf("half-roll", grid);
        expect(excludedSetUps(grid, plans, reads)).toEqual([
            { setUp: { lean: 20 * DEG, feet: 0.05, split: 0 }, klass: "turf", reads: 3, unread: 0 },
            { setUp: { lean: 20 * DEG, feet: 0.1, split: 0 }, klass: "turf", reads: 3, unread: 0 },
            { setUp: { lean: 32 * DEG, feet: 0.05, split: 0 }, klass: "mixed", reads: 3, unread: 0 },
        ]);
        // One turf read unread: the rest are turf, but the missing one might be admissible, so not outright.
        reads.delete(planKey(plan(20 * DEG, 0.5, { feet: 0.05 }), 10, LAWN));
        // Every read of the 32°, 0.1 m set-up unread (admissible ones before): no admissible read is known.
        for (const drive of [0, 0.5, 1]) {
            reads.delete(planKey(plan(32 * DEG, drive), 10, LAWN));
        }
        expect(excludedSetUps(grid, plans, reads)).toEqual([
            { setUp: { lean: 20 * DEG, feet: 0.05, split: 0 }, klass: "incomplete", reads: 2, unread: 1 },
            { setUp: { lean: 20 * DEG, feet: 0.1, split: 0 }, klass: "turf", reads: 3, unread: 0 },
            { setUp: { lean: 32 * DEG, feet: 0.05, split: 0 }, klass: "mixed", reads: 3, unread: 0 },
            { setUp: { lean: 32 * DEG, feet: 0.1, split: 0 }, klass: "incomplete", reads: 0, unread: 3 },
        ]);
    });

    it("summarises an empty spread list as none, its figures NaN", () => {
        const summary = spreadSummary([], 0.02);
        expect(summary.count).toBe(0);
        expect(summary.above).toBe(0);
        expect([summary.median, summary.p95, summary.max].every(Number.isNaN)).toBe(true);
    });

    it("finds an off-grid plan's coarse cell, and none outside the axes", () => {
        const grid: MapGrid = { ...smallGrid(), handReach: { graded: [0.1, 0.2], beyond: [] } };
        const corners = cellCorners(plan(26 * DEG, 0.75, { handReach: 0.15 }), grid);
        expect(corners).toEqual([
            plan(26 * DEG, 0.5, { handReach: 0.1 }),
            plan(26 * DEG, 0.5, { handReach: 0.2 }),
            plan(26 * DEG, 1, { handReach: 0.1 }),
            plan(26 * DEG, 1, { handReach: 0.2 }),
        ]);
        expect(cellCorners(plan(26 * DEG, 1, { handReach: 0.1 }), grid)).toEqual([
            plan(26 * DEG, 1, { handReach: 0.1 }),
        ]);
        expect(cellCorners(plan(26 * DEG, 1, { handReach: 0.25 }), grid)).toBeNull();
        // The grid's hands are on time: a late onset has no cell.
        expect(cellCorners(plan(26 * DEG, 1, { handReach: 0.1, onset: 0.01 }), grid)).toBeNull();
    });

    /**
     * A 3 × 2 lean × handReach grid (handReach 0.1 and 0.2 m) at drive 1, whose every sweep reaches 1 m at p 0.5 and
     * 3 m at p 1, the p-1 sample of `turf` (lean, handReach) pairs turf; and the anchor-like plan at handReach 0.15 m,
     * between the 26° plans.
     */
    function cellCase(turf: readonly (readonly [number, number])[]): {
        grid: MapGrid;
        plans: readonly MapPlan[];
        samples: Map<number, readonly MapSample[]>;
        anchor: MapPlan;
    } {
        const grid: MapGrid = { ...smallGrid(), drive: ONE(1), handReach: { graded: [0.1, 0.2], beyond: [] } };
        const plans = plansOf("half-roll", grid);
        const samples = new Map<number, readonly MapSample[]>();
        plans.forEach((p, i) => {
            const failing = turf.some(([lean, reach]) => p.lean === lean && p.handReach === reach);
            samples.set(i, [sample(0.5, 1), sample(1, 3, failing ? "turf" : null)]);
        });
        return { grid, plans, samples, anchor: plan(26 * DEG, 1, { handReach: 0.15 }) };
    }

    it("bands an off-grid plan at an off-grid range by its cell's worst corner, read from the sweeps", () => {
        // Read at 1.5 m, below the grid's range 10 m, every plan is admissible but 32°/0.2, turf at p 1: so 26°/0.2,
        // its neighbour, is edgy, and so is the anchor's cell.
        const { grid, plans, samples, anchor } = cellCase([[32 * DEG, 0.2]]);
        const corners = cellReads("half-roll", grid, samples, anchor, { range: 1.5, lawn: LAWN });
        expect(corners?.map((c) => [c.plan.handReach, c.band])).toEqual([
            [0.1, "viable"],
            [0.2, "edgy"],
        ]);
        expect(corners?.[0]?.read?.power).toBeCloseTo(0.625, 12);
        expect(offGridBand(false, corners)).toBe("edgy");
        // A corner left without a read leaves the anchor unbanded; a cell off the axes too.
        const lost = new Map(samples);
        lost.delete(plans.findIndex((p) => p.lean === 26 * DEG && p.handReach === 0.1));
        expect(offGridBand(false, cellReads("half-roll", grid, lost, anchor, { range: 1.5, lawn: LAWN }))).toBeNull();
        const outside = { ...anchor, handReach: 0.25 };
        expect(cellReads("half-roll", grid, samples, outside, { range: 1.5, lawn: LAWN })).toBeNull();
        expect(offGridBand(false, null)).toBeNull();
    });

    it("bands an admissible anchor beside an unplayable corner edgy, and a classed anchor unplayable", () => {
        // The 26°/0.2 corner is itself turf: to the admissible anchor it is a failing neighbour, so edgy, not
        // unplayable.
        const { grid, samples, anchor } = cellCase([[26 * DEG, 0.2]]);
        const corners = cellReads("half-roll", grid, samples, anchor, { range: 1.5, lawn: LAWN });
        expect(corners?.map((c) => c.band)).toEqual(["edgy", "unplayable"]);
        expect(offGridBand(false, corners)).toBe("edgy");
        // The anchor's own play or read classed: unplayable, whatever its cell, even with none.
        expect(offGridBand(true, corners)).toBe("unplayable");
        expect(offGridBand(true, null)).toBe("unplayable");
    });
});
