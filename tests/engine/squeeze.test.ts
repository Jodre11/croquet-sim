import { describe, expect, it } from "vitest";
import { lawFromContactTime } from "../../src/engine/impact/contactLaw";
import { defaultWorld } from "../../src/engine/world";
import { VIDEO_FRAME } from "../../scripts/filmedStrokes";
import { freeCollision } from "../../scripts/squeeze";

const WORLD = defaultWorld();

describe("the free-collision harness (P2b.2b.2c.2b design §4.1 test 4)", () => {
    const today = lawFromContactTime(WORLD.ball.mass / 2, WORLD.ballBall.restitution, WORLD.ballBallContactTime, 0);

    it("plays today's ball–ball law to Gugan's Table 1's e 0.72 ± 0.02", () => {
        for (const speed of [1.9, 7.64]) {
            expect(Math.abs(freeCollision(speed, today, { dt: 1e-7 }).restitution - 0.72)).toBeLessThanOrEqual(0.02);
        }
    });
    // A finding for the gate, kept failing until the law changes: today's law, whose own contact lasts 0.75 ms, is
    // timed by the video at 0.53 ms at 1.90 m/s and 0.61 ms at 7.64 m/s (dt 1e-7 s), more than a frame short of
    // Table 1's 0.75 ms. The struck ball has moved VISIBLE_SHIFT only about 0.4 ms in at 1.90 m/s, and the pair's gap
    // reaches it about 0.2 ms after the release; the faster stroke crosses both sooner. VISIBLE_SHIFT stays Gugan's.
    it.fails("plays today's ball–ball law to Gugan's Table 1's 0.75 ms within a frame, as the video times it", () => {
        for (const speed of [1.9, 7.64]) {
            expect(Math.abs(freeCollision(speed, today, { dt: 1e-7 }).videoTime - 7.5e-4)).toBeLessThanOrEqual(
                VIDEO_FRAME,
            );
        }
    });
    it("reports the law's own contact time beside the video's", () => {
        // The pair's closed interval, as analytic.test.ts counts it, within one step of 1e-7 s.
        const law = lawFromContactTime(WORLD.ball.mass / 2, 0.72, 7.5e-4, 0);
        expect(Math.abs(freeCollision(1.9, law, { dt: 1e-7 }).contactTime - 7.5e-4)).toBeLessThanOrEqual(1e-7);
    });
});
