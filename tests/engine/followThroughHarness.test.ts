import { describe, expect, it } from "vitest";
import { IMPACT_DT } from "../../src/engine/impact/integrate";
import { length } from "../../src/engine/math/vec3";
import { buildContact } from "../../src/engine/swing/buildContact";
import type { StrokeTiming } from "../../src/engine/swing/types";
import { defaultWorld } from "../../src/engine/world";
import {
    backswingForContact,
    firstTouch,
    playRoutes,
    routesOf,
    strokeForContact,
    turfLimited,
} from "../../scripts/followThrough";
import { guganSetup, leanOf } from "../../scripts/ratioFit";
import { canonicalSetup } from "./support/shot";

const WORLD = defaultWorld();

/** A brake begun 60 ms early on the AC stop: the head stops short of the ball, so no face contact (traced). */
const NO_STRIKE: StrokeTiming = { arc: -0.06, hands: 0, dip: 0 };

/** A brake begun 10 ms before contact, the dip coupled: an early pulse of stage 2's AC stop sweep. */
const EARLY_BRAKE: StrokeTiming = { arc: -0.01, hands: 0, dip: 0 };

describe("the follow-through harness (P2b.2b.2c.2d design §3.4)", () => {
    it("reads the first touch at the planned speed when nothing acts early", () => {
        // The drive at drive 0, on time: no pulse before contact, so the head meets the ball within a step's travel
        // of its planned speed.
        const setup = canonicalSetup("drive");
        const touch = firstTouch(setup, WORLD);
        expect(touch?.contactSpeed).toBeCloseTo(touch?.plannedSpeed ?? NaN, 2);
        expect(touch?.up).toBeCloseTo(setup.stroke.contact.up, 4);
        // The impact starts at the pose (START_GAP short), and the touch is read one step later, at the state
        // opening the first step in contact: the shaft has turned by about |ω|·dt since the stance's lean (traced:
        // 1.7995e-5 rad, that to 1e-15). 1 % covers ω's change over the step and round-off.
        const turn = length(buildContact(setup, WORLD).angularVelocity) * IMPACT_DT;
        expect(Math.abs((touch?.lean ?? NaN) - leanOf(setup, WORLD))).toBeLessThanOrEqual(1.01 * turn);
    });
    it("returns null for a stroke with no face contact", { timeout: 30_000 }, () => {
        // The impact runs to its cap (about 6 s locally) with the head short of the ball.
        const setup = canonicalSetup("stop-ac", { stroke: { timing: NO_STRIKE } });
        expect(firstTouch(setup, WORLD)).toBeNull();
    });
    it("solves the stroke for a contact speed under an early brake", { timeout: 40_000 }, () => {
        // Drive −1 begun 10 ms early takes about half the head's speed before contact (traced: 1.53 m/s at the
        // body's θ_max with no intensity), so 3 m/s at the ball needs effort: strokeForContact's second regime.
        // About 8 s locally.
        const setup = canonicalSetup("stop-ac", { stroke: { timing: { arc: -0.01, hands: 0, dip: 0 } } });
        const touch = firstTouch(
            { ...setup, stroke: { ...setup.stroke, ...strokeForContact(setup, 3, WORLD) } },
            WORLD,
        );
        expect(touch?.contactSpeed).toBeCloseTo(3, 6);
        expect(touch?.plannedSpeed).toBeGreaterThan(3);
    });
    it("solves the backswing for a contact speed at the stroke's own intensity", { timeout: 20_000 }, () => {
        // About 4.5 s locally.
        const timing = { arc: -0.01, hands: 0, dip: 0 };
        const setup = canonicalSetup("stop-ac", { stroke: { timing, intensity: 1 } });
        const backswing = backswingForContact(setup, 3, WORLD);
        const touch = firstTouch({ ...setup, stroke: { ...setup.stroke, backswing } }, WORLD);
        expect(touch?.contactSpeed).toBeCloseTo(3, 6);
        expect(touch?.plannedSpeed).toBeGreaterThan(3);
    });
    it("throws for a contact speed beyond the bracket, naming both ends", () => {
        expect(() => backswingForContact(canonicalSetup("stop-ac"), 40, WORLD)).toThrow(/m\/s.*m\/s/);
    });
    it("sets the stance's lean, contact and grips on Gugan's stroke", () => {
        const lean = (-6 * Math.PI) / 180;
        const setup = guganSetup("stop-ac", 3, 0.75e-3, { world: WORLD, lean, up: -0.025, grips: "drive" });
        expect(Math.abs(leanOf(setup, WORLD) - lean)).toBeLessThanOrEqual(1e-12);
        expect(setup.stroke.contact.up).toBe(-0.025);
        const drive = setup.profile.stance.drive;
        expect(setup.profile.stance["stop-ac"]).toMatchObject({
            bottom: drive.bottom,
            gripTension: drive.gripTension,
            bottomGrip: drive.bottomGrip,
        });
    });
    it("reads the turf's limit on the lean as the static pose gives it", () => {
        // The default mallet's AC stop at up −0.02 m (2026-10-24 pose check): 3.35 mm clear at −6°, 7.79 mm in the
        // turf at −8°.
        const at = (deg: number) =>
            turfLimited(guganSetup("stop-ac", 3, 0.75e-3, { world: WORLD, lean: (deg * Math.PI) / 180 }), WORLD);
        expect(at(-6)).toBeCloseTo(3.35e-3, 4);
        expect(at(-8)).toBeCloseTo(-7.79e-3, 4);
    });
    it("solves Gugan's stroke for its contact speed on time", { timeout: 40_000 }, () => {
        // On time no pulse acts before contact, so the solved stroke meets the ball at the asked speed to the
        // bisection's resolution; the default backswing's head arrives at 2.9927 m/s (traced), so it is solved in
        // strokeForContact's second regime, the intensity. About 8 s locally.
        const setup = guganSetup("stop-ac", 3, 0.75e-3, { world: WORLD, contactSpeed: true });
        expect(Math.abs((firstTouch(setup, WORLD)?.contactSpeed ?? NaN) - 3)).toBeLessThanOrEqual(1e-6);
    });
    it("solves Gugan's stroke for its contact speed under an early brake", { timeout: 120_000 }, () => {
        // The AC stop's stage 2 setup (Gugan's mallet, the stance at −6° on its own grips) under a brake begun
        // before contact: the pulse takes speed before the ball, so the stroke is solved for the speed at the ball,
        // not the planned one, and the planned speed lies above it. About 18 s locally, Gugan's mallet's solve
        // included.
        const lean = (-6 * Math.PI) / 180;
        const setup = guganSetup("stop-ac", 3, 0.75e-3, {
            world: WORLD,
            gugan: true,
            jab: 0,
            lean,
            grips: "stop-ac",
            timing: EARLY_BRAKE,
            drive: -1,
            contactSpeed: true,
        });
        expect(setup.stroke.timing).toEqual(EARLY_BRAKE);
        expect(setup.stroke.drive).toBe(-1);
        const touch = firstTouch(setup, WORLD);
        expect(Math.abs((touch?.contactSpeed ?? NaN) - 3)).toBeLessThanOrEqual(1e-6);
        expect(touch?.plannedSpeed).toBeGreaterThan(3);
    });
    it("shares the canonical drive's strike among its taps", () => {
        // Every tap's impulse along aim over m_ball·w₁. The face's impulse on the striker's ball also carries the
        // croqueted ball's momentum through the balls' contact, so over the taps it is m_ball·(w₁ + v₂): the shares
        // sum to 1 + v₂/w₁ within 1 % (traced: 2.991 against 2.978).
        const setup = canonicalSetup("drive");
        const { routes, read } = playRoutes(setup, WORLD);
        expect(routesOf(setup, WORLD)).toEqual(routes);
        expect(routes.taps.length).toBeGreaterThan(0);
        const sum = routes.taps.reduce((total, tap) => total + tap.share, 0);
        expect(Math.abs(sum / (1 + (read?.v2 ?? NaN) / (read?.w1 ?? NaN)) - 1)).toBeLessThanOrEqual(0.01);
    });
});
