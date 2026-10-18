import { describe, expect, it } from "vitest";
import { pendulumOf, swungBody } from "../../../src/engine/impact/track";
import { planStroke } from "../../../src/engine/swing/buildContact";
import { MAX_BACK_ANGLE, planDownswing, type DownswingInput } from "../../../src/engine/swing/downswing";
import { ON_TIME, defaultProfile } from "../../../src/engine/swing/profile";
import type { ShotSetup, SwingProfile } from "../../../src/engine/swing/types";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import { swingBodyReference } from "../../../src/reference/index";
import { ballAt, testWorld } from "../support/fixtures";
import { TEST_HANDS, TEST_HEAD } from "../support/impact";
import { testProfile } from "../support/shot";

const WORLD = testWorld();
const RHO = TEST_HEAD.socket.z;
/** The test profile's top hand (the arc radius), and a longer shaft's. */
const TOP = 0.8;
const LONG_TOP = 1.0;
/** A constructed θ_max of 60°, the contact slope θ_c, and the swing preset's pendulumShare s. */
const LIMIT = Math.PI / 3;
const THETA_C = 0.1;
const SHARE = 0.8;
const LEVER = RHO + TOP;

function input(top: number, o: Partial<DownswingInput>): DownswingInput {
    const pendulum = pendulumOf(TEST_HEAD, swungBody(TEST_HEAD, TEST_HANDS, top), top, STANDARD_GRAVITY);
    return {
        mode: "swing",
        aim: { x: 1, y: 0, z: 0 },
        thetaContact: THETA_C,
        pivot: { x: 0, y: 0, z: 0.9 },
        lever: RHO + top,
        pendulum,
        shape: {
            pendulumShare: SHARE,
            handAngle: 0.5,
            handTempo: { slow: 0.4, fast: 0.2 },
            defaultIntensity: 0,
        },
        backswing: 0.3,
        backswingLimit: LIMIT,
        effort: { torque: 0, speed: 1 },
        intensity: 0,
        arrival: 0,
        ...o,
    };
}

/** The backswing (m) that takes the shaft of lever `lever` to `angle` from vertical. */
const heightAt = (lever: number, angle: number): number => (lever * (Math.cos(THETA_C) - Math.cos(angle))) / SHARE;
const plan = (h: number) => planDownswing(input(TOP, { backswing: h }));
const planCarry = (h: number) => planDownswing(input(TOP, { backswing: h, mode: "carry" }));
const hAt = (angle: number): number => heightAt(LEVER, angle);

/** The head centre's height at the planned top above its height at contact, for the backswing at the limit. */
function riseAtLimit(top: number): number {
    const lever = RHO + top;
    const { downswing } = planDownswing(input(top, { backswing: heightAt(lever, LIMIT) * (1 - 1e-9) }));
    return (lever * (Math.cos(THETA_C) - Math.cos(downswing.thetaTop))) / SHARE;
}

function shot(profile: SwingProfile): ShotSetup {
    return {
        balls: { blue: ballAt(5, 3) },
        striker: "blue",
        stroke: {
            type: "single-ball",
            aim: 0.4,
            backswing: 0.5,
            drive: 0,
            contact: { up: 0, side: 0 },
            timing: ON_TIME,
        },
        live: [],
        continuation: false,
        hampered: false,
        jumpAttempt: false,
        lawnSpeed: 10,
        profile,
    };
}

const withLimit = (backswingLimit: number): SwingProfile => testProfile({ body: { backswingLimit } });

describe("the backswing's limit (design §5, §8.1.4)", () => {
    it("plans a backswing just inside θ_max and rejects one just beyond, naming the body's limit", () => {
        const h = hAt(LIMIT);
        expect(() => plan(h * (1 - 1e-9))).not.toThrow();
        expect(() => plan(h * (1 + 1e-9))).toThrow(/the body's backswing limit θ_max/);
    });

    it("raises the head by ℓ(cos θ_c − cos θ_max)/s at θ_max, higher on a longer shaft", () => {
        expect(riseAtLimit(LONG_TOP)).toBeGreaterThan(riseAtLimit(TOP));
        // The plan sits 1e-9 (relative) inside the limit, so the figure agrees to 8 places, not 12.
        expect(riseAtLimit(TOP)).toBeCloseTo((LEVER * (Math.cos(THETA_C) - Math.cos(LIMIT))) / SHARE, 8);
    });

    it("keeps carry mode's limit at MAX_BACK_ANGLE", () => {
        // Beyond the body's 60° but inside horizontal: carry mode plans it.
        expect(() => planCarry(hAt(MAX_BACK_ANGLE) * (1 - 1e-9))).not.toThrow();
        expect(() => planCarry(hAt(MAX_BACK_ANGLE) * (1 + 1e-9))).toThrow(/beyond/);
    });

    it("rejects a backswing limit outside (0, π/2]", () => {
        for (const bad of [0, -0.1, Math.PI / 2 + 1e-9, Number.NaN]) {
            expect(() => planStroke(shot(withLimit(bad)), WORLD)).toThrow(/profile\.body\.backswingLimit/);
        }
        expect(() => planStroke(shot(withLimit(Math.PI / 2)), WORLD)).not.toThrow();
    });

    it("gives the default player's θ_max as 75°", () => {
        expect(defaultProfile.body.backswingLimit).toBe(swingBodyReference.backswingLimit.value);
        expect(defaultProfile.body.backswingLimit).toBeCloseTo((75 * Math.PI) / 180, 15);
    });
});
