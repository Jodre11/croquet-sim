import { describe, expect, it } from "vitest";
import { pendulumOf, swungBody } from "../../../src/engine/impact/track";
import { vec3 } from "../../../src/engine/math/vec3";
import { planStroke } from "../../../src/engine/swing/buildContact";
import {
    MAX_BACK_ANGLE,
    effortTorque,
    planDownswing,
    type DownswingInput,
    type PlannedDownswing,
} from "../../../src/engine/swing/downswing";
import { ON_TIME, defaultProfile } from "../../../src/engine/swing/profile";
import type { ShotSetup, SwingEffort, SwingProfile } from "../../../src/engine/swing/types";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import { swingBodyReference, swingReference } from "../../../src/reference/index";
import { CEILING, SWING_PRESETS, bodyTop, checkCurve, contactRate, speedAt } from "../../../scripts/effortFit";
import { ballAt, testWorld } from "../support/fixtures";
import { TEST_HANDS, TEST_HEAD } from "../support/impact";
import { testProfile } from "../support/shot";

const SLOW = Boolean(import.meta.env.SLOW_TESTS);
const WORLD = testWorld();
const RADIUS = 0.8;
/** The test head on a 0.8 m arc with no arm mass: the swung body is the head. */
const PENDULUM = pendulumOf(TEST_HEAD, swungBody(TEST_HEAD, TEST_HANDS, RADIUS), RADIUS, STANDARD_GRAVITY);

/** A free swing (λ = 0) of the test head from a 0.3 m backswing to a level contact (θ_c = 0), hands still. */
function input(intensity: number, effort: SwingEffort): DownswingInput {
    return {
        slopeHold: 0,
        // A free swing asks nothing of the grip's couple (P2b.2b.2c.3a design §4.1).
        couple: 0,
        grip: { top: 1, bottom: 1, limit: TEST_HANDS.gripLimit, spread: 0 },
        aim: vec3(1, 0, 0),
        thetaContact: 0,
        pivot: vec3(0, 0, 0.9),
        lever: TEST_HEAD.socket.z + RADIUS,
        pendulum: PENDULUM,
        shape: { pendulumShare: 1, handAngle: 0.5, handTempo: null, slopeHold: 0 },
        backswing: 0.3,
        backswingLimit: MAX_BACK_ANGLE,
        effort,
        intensity,
        arrival: 0,
    };
}

const planned = (intensity: number, effort: SwingEffort): PlannedDownswing => planDownswing(input(intensity, effort));

/**
 * The downswing's work–energy residual (P2b.2b.2a's balance): ½·I_P·ω_c² against the fall W·(1 − cos θ_top) plus the
 * player's work ∫τ_p·dθ, the torque i·τ_0·max(0, 1 − ω/ω_max) integrated by the trapezoid rule over the table's θ.
 */
function workEnergyResidual(intensity: number, effort: SwingEffort): number {
    const { downswing, omega } = planned(intensity, effort);
    const torque = (w: number): number => intensity * effort.torque * Math.max(0, 1 - w / effort.speed);
    let work = 0;
    for (let k = 0; k + 1 < downswing.theta.length; k++) {
        const mean = 0.5 * (torque(downswing.omega[k] as number) + torque(downswing.omega[k + 1] as number));
        work += mean * ((downswing.theta[k + 1] as number) - (downswing.theta[k] as number));
    }
    const fall = PENDULUM.weight * (1 - Math.cos(downswing.thetaTop));
    return (0.5 * PENDULUM.inertia * omega * omega) / (fall + work) - 1;
}

const withEffort = (effort: SwingEffort): SwingProfile => testProfile({ body: { effort } });

function shot(stroke: Partial<ShotSetup["stroke"]>, profile: SwingProfile): ShotSetup {
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
            ...stroke,
        },
        live: [],
        continuation: false,
        hampered: false,
        jumpAttempt: false,
        lawnSpeed: 10,
        profile,
    };
}

describe("the effort law (design §4, §8.1.2)", () => {
    const E = { torque: 40, speed: 20 };
    it("gives i·τ_0·(1 − ω/ω_max) at fixed ω", () => {
        expect(effortTorque(E, 0.5, 5)).toBeCloseTo(0.5 * 40 * (1 - 5 / 20), 12);
    });
    it("gives +0 at intensity 0 and at or beyond ω_max", () => {
        // Review focus 4.
        for (const [i, w] of [
            [0, 3],
            [1, 20],
            [1, 25],
            [0, 25],
        ] as const) {
            expect(Object.is(effortTorque(E, i, w), 0), `${i} ${w}`).toBe(true);
        }
    });
    it("keeps the gravity-only swing at intensity 0 whatever the effort", () => {
        expect(planned(0, E)).toEqual(planned(0, { torque: 0, speed: 1 }));
    });
    it("balances the downswing's work and energy within 0.1 % at every intensity", () => {
        for (const i of [0, 0.25, 0.5, 0.75, 1]) {
            expect(Math.abs(workEnergyResidual(i, E)), `${i}`).toBeLessThan(1e-3);
        }
    });
    it("applies the torque until contact: the planned speed rises with ω_max", () => {
        expect(planned(1, { torque: 40, speed: 40 }).omega).toBeGreaterThan(planned(1, E).omega);
    });
    it("rejects a negative torque or a non-positive speed", () => {
        // Review focus 5.
        expect(() => planStroke(shot({}, withEffort({ torque: -1, speed: 20 })), WORLD)).toThrow(
            /profile\.body\.effort\.torque must be non-negative/,
        );
        expect(() => planStroke(shot({}, withEffort({ torque: 1, speed: 0 })), WORLD)).toThrow(
            /profile\.body\.effort\.speed must be positive/,
        );
    });
});

describe("the default player's effort (design §4.2, §4.3, §8.1.3)", () => {
    it("reaches the ceiling on every swing preset from its body-limited top, the weakest exactly", () => {
        const tops = SWING_PRESETS.map((t) => speedAt(t, bodyTop(t), 1, defaultProfile.body.effort));
        for (const u of tops) {
            expect(u).toBeGreaterThanOrEqual(CEILING * (1 - 1e-9));
        }
        expect(Math.min(...tops)).toBeCloseTo(CEILING, 6);
    });
    it("uses κ of ω_max at contact on the drive at full effort", () => {
        const { effort } = defaultProfile.body;
        const rate = contactRate("drive", bodyTop("drive"), 1, effort);
        expect(rate / effort.speed).toBeCloseTo(swingBodyReference.effortShare.value, 6);
    });
    it("is increasing and concave with no flat top on each swing preset's default and top", () => {
        // The fast subset: two backswings, intensity in steps of 0.1. The full grid is the slow test below.
        const { effort } = defaultProfile.body;
        for (const t of SWING_PRESETS) {
            for (const h of [swingReference[t].defaultBackswing.value, bodyTop(t)]) {
                const u = Array.from({ length: 11 }, (_, k) => speedAt(t, h, k / 10, effort));
                for (let k = 1; k < 11; k++) {
                    expect(u[k] as number, `${t} ${h} ${k}`).toBeGreaterThan(u[k - 1] as number);
                }
                for (let k = 1; k < 10; k++) {
                    const second = (u[k + 1] as number) - 2 * (u[k] as number) + (u[k - 1] as number);
                    expect(second, `${t} ${h} ${k}`).toBeLessThan(0);
                }
                const end = ((u[10] as number) - (u[9] as number)) / 0.1;
                expect(end, `${t} ${h}`).toBeGreaterThanOrEqual(0.25 * ((u[10] as number) - (u[0] as number)));
            }
        }
    });
    it.runIf(SLOW)(
        "is increasing and concave with no flat top over the whole backswing range",
        () => {
            for (const t of SWING_PRESETS) {
                const c = checkCurve(t, defaultProfile.body.effort);
                expect(c.increasing, t).toBe(true);
                expect(c.concave, t).toBe(true);
                expect(c.endSlope, t).toBeGreaterThanOrEqual(0.25 * c.meanSlope);
            }
        },
        240_000,
    );
});
