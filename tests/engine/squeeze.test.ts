import { describe, expect, it } from "vitest";
import {
    closeFace,
    faceContactTimeAt,
    faceRestitutionAt,
    lawFromContactTime,
} from "../../src/engine/impact/contactLaw";
import { defaultWorld } from "../../src/engine/world";
import { VIDEO_FRAME } from "../../scripts/filmedStrokes";
import { ballBallTimeFor, cameraIntervals, faceScaleFor, freeCollision, freeFace } from "../../scripts/squeeze";

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
        expect(Math.abs(freeCollision(1.9, law, { dt: 1e-7 }).forceTime - 7.5e-4)).toBeLessThanOrEqual(1e-7);
    });
});

describe("the conversion harnesses (P2b.2b.2c.2c design §2, §5.3)", () => {
    const today = lawFromContactTime(WORLD.ball.mass / 2, 0.72, WORLD.ballBallContactTime, 0);
    it("times today's law's force for its contact time, the penetration a little longer", () => {
        // The law's parameter T (lawFromContactTime) is the force-on duration: the clamp releases the force while the
        // penetration is still positive, and δ then closes at the separating speed, so the law time exceeds T.
        const r = freeCollision(1.9, today, { dt: 1e-7 });
        expect(Math.abs(r.forceTime - WORLD.ballBallContactTime)).toBeLessThanOrEqual(2e-7);
        expect(r.forceTime).toBeLessThan(r.lawTime);
    });
    it("is today's to the bit with no shift given, and shorter on video with a larger one", () => {
        expect(freeCollision(1.9, today, { dt: 1e-7 })).toEqual(freeCollision(1.9, today, { dt: 1e-7, shift: 2e-4 }));
        expect(freeCollision(1.9, today, { dt: 1e-7, shift: 4e-4 }).videoTime).toBeLessThan(
            freeCollision(1.9, today, { dt: 1e-7 }).videoTime,
        );
    });
    it("plays the face law alone to its own T(U) and e(U)", () => {
        // A free head on a free ball is the law's central collision, whose force-on time and restitution are T(U) and
        // e(U) (contactLaw.test.ts's free case), to the step and the clamp's restitution check. The clamp releases the
        // force with δ = c·e·v/k still positive, which then closes c/k later, so the law time is T(U) + c/k
        // (timeline.test.ts's identity); c/k is the same at any reduced mass, as k and c both scale with it.
        const r = freeFace(3.26, { dt: 1e-8 });
        const closure = closeFace({ mass: WORLD.ball.mass, friction: 0 }, 3.26);
        expect(Math.abs(r.forceTime - faceContactTimeAt(3.26)) / faceContactTimeAt(3.26)).toBeLessThan(1e-3);
        expect(
            Math.abs(r.lawTime - (faceContactTimeAt(3.26) + closure.damping / closure.stiffness)),
        ).toBeLessThanOrEqual(2e-8);
        expect(Math.abs(r.restitution - faceRestitutionAt(3.26))).toBeLessThan(1e-4);
        expect(r.clamped).toBe(false);
    });
    it("reports the clamp", () => {
        // Review focus 4.
        expect(freeFace(0.76, { dt: 1e-8 }).clamped).toBe(false);
        expect(freeFace(8.54, { dt: 1e-8 }).clamped).toBe(true);
    });
    it("finds the face's scale by Hertz similarity: scale 1 reproduces today's video time", () => {
        const today = freeFace(3.26, { dt: 1e-8 }).videoTime;
        expect(Math.abs(faceScaleFor(today, 3.26, { dt: 1e-8 }) - 1)).toBeLessThan(1e-3);
    });
    it("throws when the target lies outside the bracket", () => {
        // Review focus 4.
        expect(() => faceScaleFor(1e-6, 3.26)).toThrow(/outside/);
    });
    // The search plays 360 free collisions at 1e-7 s, about 19 s alone and up to 45 s in the full suite: the timeout
    // is 4× the latter.
    it("finds a ball–ball time whose video time is within a frame of 0.75 ms at all three speeds", () => {
        const { time, misses } = ballBallTimeFor(7.5e-4);
        expect(misses.every((m) => Math.abs(m) <= VIDEO_FRAME)).toBe(true);
        // Gate A's trace put it near 0.93 ms; the bracket is wide, so this only guards a gross error.
        expect(time).toBeGreaterThan(7.5e-4);
        expect(time).toBeLessThan(1.2e-3);
    }, 180_000);
    it("throws when the ball–ball search runs into an end of its bracket", () => {
        // At a 2 mm threshold the video cannot time a contact as short as 0.1 ms: the separating gap alone takes about
        // 0.24 ms longer than the struck ball's move to reach it at 1.90 m/s, so the search runs to its lower end. A
        // coarse step (1e-6 s) keeps the test fast; its plateaus stall the search 0.4 % of the bracket short of the
        // end.
        expect(() => ballBallTimeFor(1e-4, { dt: 1e-6, shift: 2e-3 })).toThrow(/outside the bracket/);
    });
    it("samples the camera at 16 phases, a release unseen when the gap never shows on a frame", () => {
        // The gap shows for 1 µs, from just after t = 0 to 1 µs, and the phases' frame times fall at 0 and then every
        // VIDEO_FRAME / 16 (7.8 µs): no frame's first sample at or after it is the separated one, so every phase sees
        // one unbroken contact.
        const blink = [0, 1e-6, 2e-6, 2e-4].map((t, i) => ({ t, separation: i === 1 ? 3e-4 : 0 }));
        expect(cameraIntervals(blink).length).toBe(16);
        expect(cameraIntervals(blink).every((p) => p.length === 1)).toBe(true);
    });
    // Samples every 1 µs to 0.6 ms, touching except over [first, last] µs, where the gap shows. The gap opens after
    // every phase's first two frames, so each phase has seen the contact before it.
    const parting = (first: number, last: number) =>
        Array.from({ length: 601 }, (_, i) => ({ t: i * 1e-6, separation: i >= first && i <= last ? 3e-4 : 0 }));
    it("sees a release of half a frame on some phases and not others", () => {
        // The gap shows over [300, 362] µs, half a frame. A phase sees it when one of its frames, 250 + k·7.8125 µs on
        // the third, falls in (299, 362]: k 7 to 14, 8 phases of 16. The others see one unbroken contact.
        const phases = cameraIntervals(parting(300, 362));
        expect(phases.filter((p) => p.length === 2).length).toBe(8);
        expect(phases.filter((p) => p.length === 1).length).toBe(8);
    });
    it("sees a release longer than a frame on every phase", () => {
        // The gap shows over [300, 450] µs, longer than VIDEO_FRAME: every phase has a frame within it.
        expect(cameraIntervals(parting(300, 450)).every((p) => p.length === 2)).toBe(true);
    });
});
