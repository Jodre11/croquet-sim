import { describe, expect, it } from "vitest";
import { readBandTable } from "../../src/lab/judge";
import { MAP_TYPES, mapSetup, openWorld, textBook } from "../../src/lab/index";
import { feetReading } from "../../src/lab/play";
import { complexityOf } from "../../scripts/pushMapGrid";
import type { SweepRead } from "../../scripts/pushMapGrid";
import { departuresOf } from "../../src/viewer/departures";
import { followFlags, plumbOf } from "../../src/viewer/draw";
import type { FramedPlay } from "../../src/lab/frames";
import { labelsOf, lookupDefault, snapRange, splitsOf, type DefaultEntry } from "../../src/viewer/defaults";
import {
    INPUTS,
    clampPlan,
    extraDefaults,
    inputSpans,
    offGrid,
    playableSpans,
    sameExtras,
} from "../../src/viewer/spans";
import { EASE, SLOW_RATE, advance, playbackRate } from "../../src/viewer/time";

/** The Node file calls the test uses (the project has no Node types). */
async function readFile(path: string): Promise<Uint8Array> {
    const name = "node:fs";
    const fs = (await import(/* @vite-ignore */ name)) as { readFileSync(path: string): Uint8Array };
    return fs.readFileSync(path);
}

async function table(type: string) {
    const bytes = await readFile(`public/viewer/bands-${type}.bin`);
    return readBandTable(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}

describe("playbackRate (spec §2's slow-down)", () => {
    const [start, end] = [0, 0.004];

    it("is 1 far from the impact and 1/50 inside it", () => {
        expect(playbackRate(-1, start, end)).toBe(1);
        expect(playbackRate(end + EASE, start, end)).toBe(1);
        expect(playbackRate(start, start, end)).toBe(SLOW_RATE);
        expect(playbackRate(0.002, start, end)).toBe(SLOW_RATE);
        expect(playbackRate(end, start, end)).toBe(SLOW_RATE);
    });

    it("is continuous at the edges and monotone across the easing", () => {
        for (const edge of [start - EASE, start, end, end + EASE]) {
            expect(
                Math.abs(playbackRate(edge - 1e-9, start, end) - playbackRate(edge + 1e-9, start, end)),
            ).toBeLessThan(1e-6);
        }
        let previous = playbackRate(start - EASE, start, end);
        for (let t = start - EASE; t <= start; t += EASE / 50) {
            const rate = playbackRate(t, start, end);
            expect(rate).toBeLessThanOrEqual(previous + 1e-12);
            previous = rate;
        }
    });

    it("advances at the speed, slowed only where asked, held at the end", () => {
        const impact = { start, end };
        expect(advance(-1, 0.1, 2, true, impact, 1)).toBeCloseTo(-0.8, 12);
        expect(advance(0.001, 0.1, 1, true, impact, 1)).toBeCloseTo(0.001 + 0.1 * SLOW_RATE, 12);
        expect(advance(0.001, 0.1, 1, false, impact, 1)).toBeCloseTo(0.101, 12);
        expect(advance(0.95, 0.1, 1, false, impact, 1)).toBe(1);
    });
});

describe("inputSpans (spec §2)", () => {
    it.each(MAP_TYPES)("%s: each input's span and ticks are the band table's graded axis", async (type) => {
        const t = await table(type);
        const spans = inputSpans(t);
        for (const input of INPUTS) {
            const graded = t.axes[input].values.filter((_, i) => t.axes[input].graded[i]);
            expect(spans[input].ticks).toEqual(graded);
            expect(spans[input].least).toBe(graded[0]);
            expect(spans[input].most).toBe(graded[graded.length - 1]);
        }
    });
});

describe("playableSpans (hands-from-lean design §5.1)", () => {
    it("spans every type's values, the picked type's graded values as ticks", async () => {
        const tables = await Promise.all(MAP_TYPES.map(table));
        const half = tables[MAP_TYPES.indexOf("half-roll")] as Awaited<ReturnType<typeof table>>;
        const spans = playableSpans(tables, half);
        const every = (input: "lean" | "feet" | "handReach") => tables.flatMap((t) => t.axes[input].values);
        expect(spans.lean.least).toBe(Math.min(...every("lean")));
        expect(spans.lean.most).toBe(Math.PI / 4);
        for (const input of ["feet", "handReach"] as const) {
            expect(spans[input].least).toBe(Math.min(...every(input)));
            expect(spans[input].most).toBe(Math.max(...every(input)));
        }
        expect([spans.drive.least, spans.drive.most]).toEqual([-1, 1]);
        expect([spans.window.least, spans.window.most]).toEqual([0.001, 0.1]);
        expect(spans.lean.ticks).toEqual(inputSpans(half).lean.ticks);
    });

    it("judges a set-up off the grid where an input leaves the type's span or an extra moves", async () => {
        const half = await table("half-roll");
        const book = textBook("half-roll");
        const defaults = extraDefaults("half-roll");
        expect(offGrid(half, book, {}, defaults)).toBe(false);
        expect(offGrid(half, book, { bottomGrip: defaults.bottomGrip }, defaults)).toBe(false);
        expect(offGrid(half, book, { bottomGrip: 0.5 }, defaults)).toBe(true);
        expect(offGrid(half, { ...book, lean: inputSpans(half).lean.most + 0.01 }, {}, defaults)).toBe(true);
        expect(clampPlan(inputSpans(half), { ...book, lean: 1 }).lean).toBe(inputSpans(half).lean.most);
    });

    it("compares extras by value, an absent one as its default, whatever the keys' order", () => {
        const defaults = extraDefaults("drive");
        expect(sameExtras({}, { bottomGrip: defaults.bottomGrip }, defaults)).toBe(true);
        expect(
            sameExtras({ bottomGrip: 0.5, followThrough: 0.1 }, { followThrough: 0.1, bottomGrip: 0.5 }, defaults),
        ).toBe(true);
        expect(sameExtras({}, { bottomGrip: 0.5 }, defaults)).toBe(false);
    });
});

describe("the shot picker's lookup (spec §2, §7)", () => {
    it("has no default for the AC stop at 6.35 m on the 6 s lawn, and one at 0.25 m", async () => {
        const entries = JSON.parse(
            new TextDecoder().decode(await readFile("public/viewer/defaults.json")),
        ) as DefaultEntry[];
        const ranges = (await table("stop-ac")).ranges;
        const range = snapRange(ranges, 6.35);
        expect(range).toBe(ranges[10]);
        expect(lookupDefault(entries, { label: "AC stop", split: 0, range, lawn: 6 })).toBeNull();
        const near = lookupDefault(entries, { label: "AC stop", split: 0, range: ranges[0] as number, lawn: 6 });
        expect(near?.from).toBe("viable");
        expect(near?.pick.type).toBe("stop-ac");
        expect(labelsOf(entries)).toHaveLength(10);
        expect(splitsOf(entries, "drive").length).toBeGreaterThan(1);
        expect(splitsOf(entries, "AC stop")).toEqual([0]);
    });
});

describe("departuresOf (spec §2's badges)", () => {
    it.each(MAP_TYPES)("%s: counts as complexityOf does", (type) => {
        const book = textBook(type);
        for (const plan of [
            book,
            { ...book, drive: 0.5, lean: book.lean + 0.1 },
            { ...book, feet: book.feet + 0.05 },
        ]) {
            for (const strokeEffort of [50, 95]) {
                const want = complexityOf(type, plan, { strokeEffort } as SweepRead);
                expect(departuresOf(type, plan, strokeEffort)).toEqual({ timed: want.timed, setUp: want.setUp });
            }
        }
    });
});

describe("the plumb line and foot marker (hands-from-lean design §5.5)", () => {
    it("places the plumb at the top hand, its distance ahead of the striker's ball's centre", () => {
        const plumb = plumbOf({ x: 0.12, z: 0.8 }, { x: 0.02, z: 0.0475 });
        expect(plumb.x).toBe(0.12);
        expect(plumb.ahead).toBeCloseTo(0.1, 12);
        expect(plumbOf({ x: -0.05, z: 0.8 }, { x: 0, z: 0.0475 }).ahead).toBe(-0.05);
    });

    it.each(MAP_TYPES)("%s: the feet input is the planned arc's lowest point, where the marker stands", (type) => {
        const plan = textBook(type);
        const setup = mapSetup(type, plan, 1);
        expect(feetReading(setup, openWorld(10)).lowPoint).toBeCloseTo(plan.feet, 6);
    });
});

describe("followFlags (spec decision 6)", () => {
    it("places the follow-through's turf flags where the head first goes below the turf, the grip's at the slip", () => {
        const frame = (t: number, low: number) => ({ t, low }) as unknown as FramedPlay["frames"][number];
        const framed = {
            impactEnd: 0.002,
            slipAt: 0.05,
            frames: [frame(-0.01, -0.001), frame(0.001, -0.001), frame(0.01, 0.002), frame(0.03, -0.0005)],
            flags: ["follow-cap", "follow-turf-yield", "follow-grip-limit"],
        } as unknown as FramedPlay;
        expect(followFlags(framed)).toEqual([
            { t: 0.03, text: "turf yield (follow-through)" },
            { t: 0.05, text: "grip slipped (follow-through)" },
        ]);
    });
});
