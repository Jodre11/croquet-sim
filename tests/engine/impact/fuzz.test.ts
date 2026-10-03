import { describe, expect, it } from "vitest";
import { simulateFreeMotion } from "../../../src/engine/simulate";
import type { BallState } from "../../../src/engine/types";
import { simulateImpact } from "../../../src/engine/impact/simulateImpact";
import { TEST_BALL, testWorld } from "../support/fixtures";
import { FUZZ_SEED, randomStroke } from "../support/impact";
import { rng } from "../support/rng";

const R = TEST_BALL.radius;
/**
 * Deepest penetration any pair may reach inside the fuzz ranges: 1.5× the worst of 2000 strokes (pre-flight: turf
 * 6.0 mm, ball–ball 1.8 mm, face 1.4 mm).
 */
const PENETRATION_BOUND = 0.2 * R;
const WORLD = testWorld();

describe("impact fuzz", () => {
    const count = import.meta.env.SLOW_TESTS ? 2000 : 200;

    it(`ends, never hits the cap and keeps penetrations bounded over ${count} strokes`, { timeout: 600_000 }, () => {
        const random = rng(FUZZ_SEED);
        for (let n = 0; n < count; n++) {
            const { contact, balls } = randomStroke(random, WORLD);
            const result = simulateImpact(contact, balls, WORLD);
            expect(
                result.events.some((e) => e.kind === "impact-cap"),
                `stroke ${n}`,
            ).toBe(false);
            for (const [key, depth] of Object.entries(result.peakPenetration)) {
                expect(depth, `stroke ${n} ${key}`).toBeLessThan(PENETRATION_BOUND);
            }
            for (const s of Object.values(result.handover) as BallState[]) {
                const values = [s.position, s.velocity, s.angularVelocity].flatMap((v) => [v.x, v.y, v.z]);
                expect(values.every(Number.isFinite), `stroke ${n}`).toBe(true);
            }
            expect(() => simulateFreeMotion(result.handover, WORLD), `stroke ${n}`).not.toThrow();
        }
    });
});
