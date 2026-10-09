import { describe, expect, it } from "vitest";
import { simulateFreeMotion } from "../../../src/engine/simulate";
import type { BallState } from "../../../src/engine/types";
import { simulateImpact } from "../../../src/engine/impact/simulateImpact";
import { TEST_BALL, testWorld } from "../support/fixtures";
import { FUZZ_SEED, OBSTACLE_FUZZ_SEED, randomObstacleStroke, randomStroke } from "../support/impact";
import { rng } from "../support/rng";

const R = TEST_BALL.radius;
/**
 * Deepest penetration any pair may reach inside the fuzz ranges: 1.5× the worst of 2000 strokes (pre-flight: turf
 * 6.0 mm, ball–ball 1.8 mm, face 1.4 mm). P2b.2b.2b.2a: Hertzian face, re-measured over 2000 strokes: turf 6.07 mm,
 * ball–ball 1.77 mm, face 1.89 mm; the obstacle fuzz's turf 6.19 mm and face 2.09 mm. The bound is kept.
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

/**
 * 1.5× the worst obstacle-pair penetration over 2000 obstacle-fuzz strokes (pre-flight: 1.745 mm = 0.038 R). The
 * contact-time upper bound, 1.0e-3 s, keeps it at 0.055 R. P2b.2b.2b.2a: Hertzian face, re-measured: 1.730 mm.
 */
const OBSTACLE_PENETRATION_BOUND = 0.06 * R;
/**
 * Half the share of strokes in which an obstacle pair closes (pre-flight: 17.45 % of 2000; P2b.2b.2b.2a: Hertzian
 * face, 17.50 %).
 */
const OBSTACLE_SHARE = 0.087;

describe("obstacle fuzz", () => {
    const count = import.meta.env.SLOW_TESTS ? 2000 : 200;

    it(
        `ends, never hits the cap, keeps penetrations bounded and hands over cleanly over ${count} strokes`,
        {
            timeout: 600_000,
        },
        () => {
            const random = rng(OBSTACLE_FUZZ_SEED);
            let touched = 0;
            for (let n = 0; n < count; n++) {
                const { contact, balls, world } = randomObstacleStroke(random, WORLD);
                const result = simulateImpact(contact, balls, world);
                expect(
                    result.events.some((e) => e.kind === "impact-cap"),
                    `stroke ${n}`,
                ).toBe(false);
                for (const [key, depth] of Object.entries(result.peakPenetration)) {
                    const bound = key.includes("@") ? OBSTACLE_PENETRATION_BOUND : PENETRATION_BOUND;
                    expect(depth, `stroke ${n} ${key}`).toBeLessThan(bound);
                }
                if (Object.keys(result.timeline).some((key) => key.includes("@"))) {
                    touched++;
                }
                for (const s of Object.values(result.handover) as BallState[]) {
                    const values = [s.position, s.velocity, s.angularVelocity].flatMap((v) => [v.x, v.y, v.z]);
                    expect(values.every(Number.isFinite), `stroke ${n}`).toBe(true);
                }
                expect(() => simulateFreeMotion(result.handover, world), `stroke ${n}`).not.toThrow();
            }
            expect(touched).toBeGreaterThan(OBSTACLE_SHARE * count);
        },
    );
});
