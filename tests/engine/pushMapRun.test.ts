import { describe, expect, it } from "vitest";
import { openWorld, opened } from "../../scripts/openLawn";
import { bodyBackswing, mapSetup, maxPower, playSample, textBook } from "../../scripts/pushMapRun";
import { ratioOf } from "../../scripts/ratioFit";
import { faceHalfHeight } from "../../src/engine/impact/shape";
import { simulateShot } from "../../src/engine/shot";
import { headShapeOf, plannedSpeed, stanceLean } from "../../src/engine/swing/buildContact";
import { defaultProfile } from "../../src/engine/swing/profile";
import { swingReference } from "../../src/reference/index";
import { canonicalSetup } from "./support/shot";

const DEG = Math.PI / 180;
const WORLD = openWorld();

/** The power p at which the text book's backswing is the type's defaultBackswing (decision 1: p ≤ 1 is p·h_body). */
function canonicalPower(): number {
    const setup = mapSetup("half-roll", textBook("half-roll"), 1);
    return swingReference["half-roll"].defaultBackswing.value / bodyBackswing(setup, WORLD);
}

describe("one plan's run (P2b.2b.2c.3b plan Task 3)", () => {
    it("reads the half roll's text book from the preset, and the pass roll's split as canonicalSetup's", () => {
        const plan = textBook("half-roll");
        const stance = defaultProfile.stance["half-roll"];
        const { mallet } = defaultProfile;
        const lean = stanceLean(stance.handsAhead, stance.top, 0, {
            ballRadius: WORLD.ball.radius,
            headLength: mallet.headLength,
            faceHalfHeight: faceHalfHeight(headShapeOf(mallet.head)),
        });
        expect(Math.abs(plan.lean - lean)).toBeLessThanOrEqual(1e-12);
        expect([plan.drive, plan.handReach, plan.window, plan.onset, plan.split]).toEqual([1, 0.15, 0.02, 0, 0]);
        expect(textBook("pass-roll").split).toBe((20 * Math.PI) / 180);
    });

    it("ties the power to today's canonical: the default backswing plans 3 m/s", () => {
        // The feet are given explicitly and read back through the arc, and the lean through the hands, so the plan
        // agrees with the canonical to round-off, not to the bit.
        for (const type of ["half-roll", "full-roll", "pass-roll"] as const) {
            const base = mapSetup(type, textBook(type), 1);
            const p = swingReference[type].defaultBackswing.value / bodyBackswing(base, WORLD);
            expect(p).toBeGreaterThan(0);
            expect(p).toBeLessThan(1);
            const speed = plannedSpeed(mapSetup(type, textBook(type), p), WORLD);
            expect(Math.abs(speed - 3) / 3).toBeLessThanOrEqual(1e-6);
        }
    });

    it("plays the text book at the canonical power as the canonical half roll plays", () => {
        const p = canonicalPower();
        const sample = playSample("half-roll", textBook("half-roll"), p, [10]);
        const canonical = opened(canonicalSetup("half-roll"));
        const ratio = ratioOf(canonical, simulateShot(canonical, WORLD).motion);
        expect(sample.klass).toBeNull();
        expect(sample.reason).toBeNull();
        const read = sample.byLawn[10];
        expect(read).toBeDefined();
        expect(Math.abs((read?.ratio ?? NaN) - ratio) / ratio).toBeLessThanOrEqual(1e-6);
        expect(read?.range).toBeGreaterThan(0);
        expect(sample.strokeEffort).toBeGreaterThan(0);
        expect(sample.strokeEffort).toBeLessThan(100);
        expect(sample.pushEffort).toBeGreaterThan(0);
        expect(sample.pushEffort).toBeLessThanOrEqual(100);
        expect(sample.pushImpulse).toBeGreaterThan(0);
        // The rolls hold the slope (λ 1), so the hands supply a couple, within C at the canonical.
        expect(sample.coupleShare).toBeGreaterThan(0);
        expect(sample.coupleShare).toBeLessThanOrEqual(1);
    });

    it("records a plan the engine rejects as unreachable, keeping the engine's message (Review Focus 1)", () => {
        const sample = playSample("half-roll", { ...textBook("half-roll"), feet: 2 }, canonicalPower(), [10]);
        expect(sample.klass).toBe("unreachable");
        expect(sample.reason).toContain("stroke.feet");
        expect(Number.isNaN(sample.byLawn[10]?.range ?? NaN)).toBe(true);
    });

    it("bisects the most power a weak bottom grip holds (Review Focus 2)", () => {
        // A bottom grip of 0.1 shrinks C = min(γ_T, g_B)·F_max·(r − b) tenfold, from 167.5 to 16.7 N·m. The text
        // book's held slope needs a peak couple of about 12.2 N·m at p = 1 and 29.4 N·m at p = 2 (measured while
        // building this test), so p = 1 plans and p = 2 throws the downswing's RangeError. The plan's g_B 0.01 makes
        // C 1.67 N·m, past which p = 1 also fails (the next test).
        const over = { stance: { bottomGrip: 0.1 } };
        const plan = textBook("half-roll");
        const most = maxPower("half-roll", plan, WORLD, over);
        expect(most).toBeGreaterThan(1);
        expect(most).toBeLessThan(2);
        expect(Number.isFinite(plannedSpeed(mapSetup("half-roll", plan, most, over), WORLD))).toBe(true);
        // The bisection stops at the couple's edge: a hair above it the grip no longer holds.
        expect(() => plannedSpeed(mapSetup("half-roll", plan, most + 1e-6, over), WORLD)).toThrow(
            /the grip cannot hold/,
        );
        expect(() => plannedSpeed(mapSetup("half-roll", plan, most + 1e-6, over), WORLD)).toThrow(RangeError);
    });

    it("bisects below p = 1 when p = 1 fails, returning a power that plans or NaN (Review Focus 2)", () => {
        // A bottom grip of 0.01 makes C 1.67 N·m, below the couple at p = 1 (12.2 N·m). Below 1 the couple is not
        // monotone in p (about 2.36 N·m at p = 0.2, 2.03 at 0.4, 5.40 at 0.6: the reviewer's figures), so the
        // bisection may find no power; whatever it returns plans.
        const over = { stance: { bottomGrip: 0.01 } };
        const plan = textBook("half-roll");
        const most = maxPower("half-roll", plan, WORLD, over);
        if (!Number.isNaN(most)) {
            expect(most).toBeGreaterThan(0);
            expect(most).toBeLessThan(1);
            expect(Number.isFinite(plannedSpeed(mapSetup("half-roll", plan, most, over), WORLD))).toBe(true);
        }
    });

    it("rejects an `over` that gives a world or a stroke", () => {
        expect(() => mapSetup("half-roll", textBook("half-roll"), 0.5, { world: WORLD })).toThrow(/mapSetup/);
        expect(() => mapSetup("half-roll", textBook("half-roll"), 0.5, { stroke: { drive: 0 } })).toThrow(/mapSetup/);
    });

    it("grades a lean past the on-point limit as a mishit", () => {
        const sample = playSample("half-roll", { ...textBook("half-roll"), lean: 50 * DEG }, canonicalPower(), [10]);
        expect(sample.klass).toBe("mishit");
        expect(sample.reason).toContain("on-point limit");
    });

    it("grades the full roll's text book at its canonical power as a mishit: it meets the ball off the face", () => {
        // Measured while building Task 3: the canonical full roll's follow-through raised follow-turf-yield, which
        // decision 5 lists under turf, and nothing earlier in the order applied. P2b.2b.2c.3b.1 design §2, §5 (was
        // turf, follow-turf-yield): the arms' full hold and the bottom hand kept on change the contact, and the head
        // now meets the ball off its face (impact-off-face, a mishit; ratio 2.07 on the 10 s lawn). Expected before
        // practice exists: the practice strokes (P2b.2b.2c.3b.1 plan Task 6) are what bring strokes into the band.
        const base = mapSetup("full-roll", textBook("full-roll"), 1);
        const p = swingReference["full-roll"].defaultBackswing.value / bodyBackswing(base, WORLD);
        const sample = playSample("full-roll", textBook("full-roll"), p, [10]);
        expect(sample.klass).toBe("mishit");
        expect(sample.reason).toBe("impact-off-face");
    });

    it("grades the full roll's text book at p = 1.5 as superhuman: a hand reaches its grip's limit", () => {
        // At p = 1.5 (h_body and intensity 0.5) the impact raises grip-limit, first in decision 5's order.
        const sample = playSample("full-roll", textBook("full-roll"), 1.5, [10]);
        expect(sample.klass).toBe("superhuman");
        expect(sample.reason).toBe("grip-limit");
    });
});
