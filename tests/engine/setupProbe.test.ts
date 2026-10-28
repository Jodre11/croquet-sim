import { describe, expect, it } from "vitest";
import { CROSS_MODE_CASES, feetReading } from "../../scripts/setupProbe";
import { simulateShot, type ShotOutcome } from "../../src/engine/shot";
import { defaultWorld } from "../../src/engine/world";
import { canonicalSetup } from "./support/shot";

describe("the feet's reading (P2b.2b.2c.3a design §3)", () => {
    const world = defaultWorld();

    it("puts the half roll's lowest point half its push ahead of its hands", () => {
        const r = feetReading(canonicalSetup("half-roll"), world);
        // The arc's low point is handArcLow × handReach from the hands at contact, whatever the ball.
        expect(r.lowPoint - r.handsAt).toBeCloseTo(0.5 * 0.15, 12);
        // A different preset and a shot's own reach: the formula, not one preset's constants.
        const full = feetReading(canonicalSetup("full-roll", { drive: { handArcLow: 0.25 } }), world);
        expect(full.lowPoint - full.handsAt).toBeCloseTo(0.25 * 0.3, 12);
        const short = feetReading(canonicalSetup("full-roll", { stroke: { handReach: 0.2 } }), world);
        expect(short.lowPoint - short.handsAt).toBeCloseTo(0.5 * 0.2, 12);
    });

    it("gives the single-ball stroke no arrival and a level attack: its hands are still", () => {
        const r = feetReading(canonicalSetup("single-ball"), world);
        expect(r.arrival).toBe(0);
        // Hands still and θ_c = 0: the head swings through horizontally.
        expect(Math.abs(r.attack)).toBeLessThan(1e-12);
    });

    it("separates the feet from the lean once the hands move", () => {
        const read = (low: number) => feetReading(canonicalSetup("half-roll", { drive: { handArcLow: low } }), world);
        const [a, b, c] = [read(0), read(0.5), read(1)];
        // The lean is the stance's alone: the arc's low point leaves it unchanged.
        expect(b.lean).toBe(a.lean);
        expect(c.lean).toBe(a.lean);
        expect(Math.abs(a.attack - b.attack)).toBeGreaterThan(1e-6);
        expect(Math.abs(b.attack - c.attack)).toBeGreaterThan(1e-6);
        expect(Math.abs(a.attack - c.attack)).toBeGreaterThan(1e-6);
    });
});

describe("the cross-mode cases (P2b.2b.2c.3a criterion 5)", () => {
    const world = defaultWorld();

    it("plays the cross-mode cases with no guard hit", { timeout: 120_000 }, () => {
        expect(CROSS_MODE_CASES).toHaveLength(4);
        for (const { label, setup } of CROSS_MODE_CASES) {
            let outcome: ShotOutcome | undefined;
            expect(() => {
                outcome = simulateShot(setup(world), world, { trajectory: true });
            }, label).not.toThrow();
            const { impact, trajectory } = outcome as ShotOutcome;
            expect(
                impact.events.map((e) => e.kind),
                label,
            ).not.toContain("impact-cap");
            expect(trajectory?.flags, label).toBeDefined();
            expect(trajectory?.flags, label).not.toContain("follow-cap");
        }
    });
});
