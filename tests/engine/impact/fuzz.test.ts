import { describe, expect, it } from "vitest";
import { scale } from "../../../src/engine/math/vec3";
import { simulateFreeMotion } from "../../../src/engine/simulate";
import type { BallState, BallStates } from "../../../src/engine/types";
import { simulateImpact, validateImpact } from "../../../src/engine/impact/simulateImpact";
import type { ContactState } from "../../../src/engine/impact/types";
import { TEST_BALL, ballAt, testWorld } from "../support/fixtures";
import { TEST_HEAD, drive, strike } from "../support/impact";
import { rng } from "../support/rng";

const R = TEST_BALL.radius;
/**
 * Deepest penetration any pair may reach inside the fuzz ranges: 1.5× the worst of 2000 strokes (pre-flight: turf
 * 6.0 mm, ball–ball 1.8 mm, face 1.4 mm).
 */
const PENETRATION_BOUND = 0.2 * R;
const WORLD = testWorld();

/**
 * One random stroke inside the ranges, the widest that raise no impact-cap (pre-flight). A draw that validateImpact
 * rejects (the head below the turf at a steep pitch) is drawn again; the sequence stays deterministic.
 */
function randomStroke(random: () => number): { contact: ContactState; balls: BallStates } {
    const uni = (a: number, b: number): number => a + (b - a) * random();
    const blue = ballAt(10, 10);
    for (;;) {
        const force = random() < 1 / 3 ? 0 : uni(-300, 300);
        const window = uni(0.5e-3, 5e-3);
        const speed = uni(0.5, 8);
        // A checking drive whose impulse takes half the head's momentum may stop it short of the ball: a whiff, which
        // only the cap ends (design §5). Draw again.
        if (force < 0 && -force * window >= 0.5 * TEST_HEAD.mass * speed) {
            continue;
        }
        const contact = strike(blue.position, {
            speed,
            yaw: uni(-0.3, 0.3),
            descent: uni(0, 0.5),
            pitch: uni(-0.2, 0.6),
            lateral: uni(-0.8, 0.8) * TEST_HEAD.radius,
            vertical: uni(-0.6, 0.6) * TEST_HEAD.radius,
            drive: (t) => drive(scale(t, force), window),
        });
        const balls: BallStates = { blue };
        if (random() < 0.5) {
            const a = uni(-1, 1);
            balls.red = ballAt(10 + 2 * R * Math.cos(a), 10 + 2 * R * Math.sin(a));
        }
        try {
            validateImpact(contact, balls, WORLD);
        } catch {
            continue;
        }
        return { contact, balls };
    }
}

describe("impact fuzz", () => {
    const count = import.meta.env.SLOW_TESTS ? 2000 : 200;

    it(`ends, never hits the cap and keeps penetrations bounded over ${count} strokes`, { timeout: 600_000 }, () => {
        const random = rng(23);
        for (let n = 0; n < count; n++) {
            const { contact, balls } = randomStroke(random);
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
