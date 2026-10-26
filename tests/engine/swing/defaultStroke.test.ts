import { describe, expect, it } from "vitest";
import { plannedSpeed } from "../../../src/engine/swing/buildContact";
import { DEFAULT_TIMING, ON_TIME } from "../../../src/engine/swing/profile";
import { STROKE_TYPES, type ShotSetup } from "../../../src/engine/swing/types";
import { defaultWorld } from "../../../src/engine/world";
import { swingReference } from "../../../src/reference/index";
import { bodyTop } from "../../../scripts/effortFit";
import { backswingFor, canonicalSetup, strokeFor } from "../support/shot";

const WORLD = defaultWorld();
const BASE = canonicalSetup("single-ball", { world: WORLD });
/** The preset's default backswing h_0 (m), main's value to the bit. */
const H0 = swingReference["single-ball"].defaultBackswing.value;

const speedOf = (stroke: Partial<ShotSetup["stroke"]>): number =>
    plannedSpeed({ ...BASE, stroke: { ...BASE.stroke, ...stroke } }, WORLD);

/** U(0) and U(1) at h_0: the bounds of regime 2, the default backswing with the intensity solved. */
const U0 = speedOf({ backswing: H0, intensity: 0 });
const U1 = speedOf({ backswing: H0, intensity: 1 });
/** U(1) from the body-limited top: the most the stroke reaches. */
const TOP = speedOf({ backswing: bodyTop("single-ball"), intensity: 1 });

describe(
    "the default stroke for a speed " +
        "(the default backswing fixed, speeds above it by effort: the pre-flight gate, 2026-10-18)",
    () => {
        it("solves the backswing at intensity 0 at or below U(0) from the default backswing, as before", () => {
            // Regime 1: the gravity-only path, no intensity given, so the run is today's to the bit.
            for (const speed of [1, 2]) {
                expect(strokeFor(BASE, speed, WORLD), `${speed}`).toEqual({
                    backswing: backswingFor(BASE, speed, WORLD),
                });
            }
        });

        it("takes regime 1 at exactly U(0) from the default backswing", () => {
            const stroke = strokeFor(BASE, U0, WORLD);
            expect(stroke).toEqual({ backswing: backswingFor(BASE, U0, WORLD) });
            expect(stroke.backswing).toBeCloseTo(H0, 9);
        });

        it("keeps the default backswing and solves the intensity between U(0) and U(1)", () => {
            // Regime 2: U rises with i at a fixed backswing (design §4.2), so the bisection's intensity plans the
            // speed.
            const speed = (U0 + U1) / 2;
            const stroke = strokeFor(BASE, speed, WORLD);
            expect(stroke.backswing).toBe(H0);
            expect(stroke.intensity).toBeGreaterThan(0);
            expect(stroke.intensity).toBeLessThan(1);
            expect(speedOf(stroke) / speed - 1).toBeLessThan(1e-12);
            expect(speedOf(stroke)).toBeGreaterThanOrEqual(speed);
            // At U(1) itself regime 2 still holds; the planned speed is flat to a few ulps of i there, so the least
            // intensity found may sit a hair below 1.
            const atU1 = strokeFor(BASE, U1, WORLD);
            expect(atU1.backswing).toBe(H0);
            expect(atU1.intensity).toBeCloseTo(1, 12);
        });

        it("swings at full effort from a longer backswing beyond U(1), up to θ_max", () => {
            // Regime 3: intensity 1 and the backswing solved at it, which lies above h_0 and inside the body's top.
            const speed = (U1 + TOP) / 2;
            const stroke = strokeFor(BASE, speed, WORLD);
            expect(stroke.intensity).toBe(1);
            expect(stroke.backswing).toBeGreaterThan(H0);
            expect(stroke.backswing).toBeLessThan(bodyTop("single-ball"));
            expect(speedOf(stroke)).toBeCloseTo(speed, 9);
            expect(() => strokeFor(BASE, TOP * 1.01, WORLD)).toThrow(/beyond the single-ball stroke's reach/);
        });

        it("keeps today's path for a stroke that gives an intensity", () => {
            const given = { ...BASE, stroke: { ...BASE.stroke, intensity: 0.5 } };
            for (const speed of [2, (U0 + U1) / 2]) {
                expect(strokeFor(given, speed, WORLD), `${speed}`).toEqual({
                    backswing: backswingFor(given, speed, WORLD),
                });
            }
        });

        it("solves a carry stroke's backswing as before", () => {
            const roll = canonicalSetup("half-roll", { world: WORLD });
            expect(strokeFor(roll, 2.5, WORLD)).toEqual({ backswing: backswingFor(roll, 2.5, WORLD) });
        });
    },
);

describe("the default follow-through timing", () => {
    it("gives every stroke type a valid timing, on time", () => {
        expect(Object.keys(DEFAULT_TIMING).sort()).toEqual([...STROKE_TYPES].sort());
        for (const type of STROKE_TYPES) {
            const timing = DEFAULT_TIMING[type];
            for (const part of [timing.arc, timing.hands, timing.dip, timing.advance ?? 0]) {
                expect(Number.isFinite(part), type).toBe(true);
            }
            expect(timing, type).toEqual(ON_TIME);
        }
    });
});
