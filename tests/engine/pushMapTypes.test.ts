import { describe, expect, it } from "vitest";
import { openWorld, opened } from "../../scripts/openLawn";
import { gridFor, labelOf } from "../../scripts/pushMapGrid";
import { MAP_TYPES, canonicalPower, mapSetup, playSample, textBook } from "../../scripts/pushMapRun";
import { plannedSpeed } from "../../src/engine/swing/buildContact";
import { canonicalSetup } from "./support/shot";

const WORLD = openWorld();

describe("every shot type in the push map (plan Amendment B, Task B1; design A7 items 1–2)", () => {
    it("maps the six types of A7 item 1, the GC stop left out", () => {
        expect([...MAP_TYPES]).toEqual(["drive", "stop-ac", "half-roll", "full-roll", "pass-roll", "single-ball"]);
    });

    it("plays each text book at its canonical power at its canonical setup's planned speed", () => {
        // The feet are given explicitly and read back through the arc, and the lean through the hands, so the plan
        // agrees with the canonical to round-off, not to the bit (as the rolls' test of Task 3).
        for (const type of MAP_TYPES) {
            const p = canonicalPower(type, WORLD);
            expect(p, type).toBeGreaterThan(0);
            const speed = plannedSpeed(mapSetup(type, textBook(type), p), WORLD);
            const canonical = plannedSpeed(opened(canonicalSetup(type)), WORLD);
            expect(Math.abs(speed - canonical) / canonical, type).toBeLessThanOrEqual(1e-6);
        }
    });

    it("reads the single-ball stroke's range with no ratio: it has no croqueted ball (B-d2)", () => {
        const sample = playSample("single-ball", textBook("single-ball"), canonicalPower("single-ball", WORLD), [10]);
        expect(sample.klass).toBeNull();
        const read = sample.byLawn[10];
        expect(read?.range).toBeGreaterThan(0);
        expect(Number.isNaN(read?.ratio ?? 0)).toBe(true);
    });

    it("plays the drive's and the AC stop's text books at their canonical power, their ratios in their bands", () => {
        for (const [type, label] of [
            ["drive", "drive"],
            ["stop-ac", "AC stop"],
        ] as const) {
            const sample = playSample(type, textBook(type), canonicalPower(type, WORLD), [10], "preset");
            expect(sample.passes, type).toBeGreaterThan(0);
            expect(labelOf(sample.byLawn[10]?.ratio ?? NaN), type).toBe(label);
        }
    });

    it("sweeps the split on the pass roll alone and the speedGain on the full roll alone", () => {
        for (const type of MAP_TYPES) {
            const grid = gridFor(type);
            expect(grid.split.graded.length > 1, type).toBe(type === "pass-roll");
            expect(grid.speedGain.graded.length > 1, type).toBe(type === "full-roll");
        }
    });
});

describe("the bands as labels on one continuum (B-d3; design A7 item 2)", () => {
    it.each([
        [0.83, "pass roll"],
        [1, "full roll"],
        [1.1, "full roll"],
        [1.2, "full roll"],
        [1.3, "between full roll and half roll"],
        [1.4, "half roll"],
        [2, "half roll"],
        [2.5, "half roll"],
        [2.7, "between half roll and drive"],
        [3, "drive"],
        [3.5, "drive"],
        [4, "drive"],
        [4.05, "between drive and AC stop"],
        [4.1, "AC stop"],
        [5.9, "AC stop"],
        [6.2, "AC stop"],
        [7.15, "beyond AC stop"],
    ])("labels a ratio of %s as %s", (ratio, label) => {
        expect(labelOf(ratio)).toBe(label);
    });

    it("gives no label where there is no ratio", () => {
        expect(labelOf(NaN)).toBe("");
    });
});
