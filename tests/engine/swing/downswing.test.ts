import { describe, expect, it } from "vitest";
import { headLowestPoint } from "../../../src/engine/impact/contacts";
import {
    downswingAt,
    downswingHands,
    downswingSamples,
    downswingTime,
    headOnPath,
    pendulumOf,
    prepareTrack,
    swungBody,
} from "../../../src/engine/impact/track";
import type { SwingArc } from "../../../src/engine/impact/types";
import { add, length, scale, sub, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import {
    MAX_BACK_ANGLE,
    MAX_FALL,
    planDownswing,
    scanDownswing,
    type DownswingInput,
    type PlannedDownswing,
} from "../../../src/engine/swing/downswing";
import type { SwingShape } from "../../../src/engine/swing/types";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import { TEST_HANDS, TEST_HEAD, levelArc, trackDrive } from "../support/impact";

const AIM = vec3(1, 0, 0);
const UP = vec3(0, 0, 1);
const RADIUS = 0.8;
const RHO = TEST_HEAD.socket.z;
/** ℓ_h, the head centre's distance from the top hand. */
const LEVER = RHO + RADIUS;
const PIVOT = vec3(0, 0, 0.9);
/** The test head on a 0.8 m arc with no arm mass: the swung body is the head. */
const PENDULUM = pendulumOf(TEST_HEAD, swungBody(TEST_HEAD, TEST_HANDS, RADIUS), RADIUS, STANDARD_GRAVITY);
const DEG = Math.PI / 180;

function shape(o: Partial<SwingShape> = {}): SwingShape {
    return {
        pendulumShare: 1,
        handAngle: 0.5,
        effort: { torqueMax: 0, tempoSlow: 0.4, tempoFast: 0.2 },
        handTempo: { slow: 0.4, fast: 0.2 },
        defaultIntensity: 0,
        ...o,
    };
}

function input(o: Partial<DownswingInput> = {}): DownswingInput {
    return {
        mode: "swing",
        aim: AIM,
        thetaContact: 0,
        pivot: PIVOT,
        lever: LEVER,
        pendulum: PENDULUM,
        shape: shape(),
        backswing: 0.3,
        intensity: 0,
        ...o,
    };
}

/** F(φ, k) = ∫₀^φ dψ/√(1 − k²·sin²ψ) by Simpson's rule over 4000 intervals (the integrand is smooth). */
function ellipticF(phi: number, k: number): number {
    const n = 4000;
    const h = phi / n;
    const f = (psi: number): number => 1 / Math.sqrt(1 - k * k * Math.sin(psi) ** 2);
    let sum = f(0) + f(phi);
    for (let i = 1; i < n; i++) {
        sum += (i % 2 === 1 ? 4 : 2) * f(i * h);
    }
    return (sum * h) / 3;
}

/** The head's speed at contact on a still pivot, or with the hands at `handsVelocity`. */
function contactSpeed(thetaContact: number, omega: number, handsVelocity: Vec3 = vec3(0, 0, 0)): number {
    const tangent = add(scale(AIM, Math.cos(thetaContact)), scale(UP, Math.sin(thetaContact)));
    return length(add(handsVelocity, scale(tangent, omega * LEVER)));
}

/** The pulse's torque (N·m) τ after the release. */
function pulse(tau: number, peak: number, duration: number): number {
    const u = tau / duration;
    return u >= 0 && u <= 1 ? 0.5 * peak * (1 - Math.cos(2 * Math.PI * u)) : 0;
}

/** How long before the arc's t = 0 the planned contact falls, so that every downswing sample is at a time ≥ 0. */
const LEAD = 3;

/**
 * A swing arc that carries `planned`: contact at LEAD, the arc's contact state the downswing's end (θ_c, ω, and the
 * hands at PIVOT moving at V_c), coasting on from there. The arc's earlier state is extrapolated from the contact one,
 * which the downswing replaces before contact, so only the contact state matters.
 */
function arcOf(planned: PlannedDownswing, contactHands: Vec3): SwingArc {
    const { downswing, omega, handsVelocity } = planned;
    const thetaContact = downswing.thetaTop + downswing.span;
    const base = levelArc(vec3(0, 0, 0), {
        theta0: thetaContact - omega * LEAD,
        omega0: omega,
        contactAt: LEAD,
        arcStart: LEAD,
        handStart: LEAD,
    });
    return {
        ...base,
        pivot: sub(contactHands, scale(handsVelocity, LEAD)),
        pivotVelocity: handsVelocity,
        downswing,
    };
}

describe("the backswing's top (design §3.2)", () => {
    it("raises the head by the backswing: the pendulum's share about the hands, the rest with the hands", () => {
        for (const pendulumShare of [1, 0.6]) {
            const { downswing } = planDownswing(input({ thetaContact: 0.1, shape: shape({ pendulumShare }) }));
            const pendulumRise = LEVER * (Math.cos(0.1) - Math.cos(downswing.thetaTop));
            const handsRise = downswing.handsTop.z - PIVOT.z;
            expect(pendulumRise, `share ${pendulumShare}`).toBeCloseTo(pendulumShare * 0.3, 12);
            expect(handsRise, `share ${pendulumShare}`).toBeCloseTo((1 - pendulumShare) * 0.3, 12);
            expect(downswing.thetaTop).toBeLessThan(0);
        }
    });

    it("takes the hands back along handAngle", () => {
        const { downswing } = planDownswing(input({ shape: shape({ pendulumShare: 0.6 }) }));
        const back = sub(PIVOT, downswing.handsTop);
        expect(back.x).toBeCloseTo(0.12 / Math.tan(0.5), 12);
        expect(back.y).toBe(0);
        expect(-back.z).toBeCloseTo(0.12, 12);
    });

    it("rejects a backswing that takes the shaft beyond MAX_BACK_ANGLE", () => {
        const level = LEVER * (1 - Math.cos(MAX_BACK_ANGLE));
        expect(() => planDownswing(input({ backswing: level + 0.01 }))).toThrow(/beyond/);
    });
});

describe("the swing-mode downswing (design §3.1, §3.4)", () => {
    it("matches the energy integral with gravity alone and the hands still, within 0.1 %", () => {
        for (const thetaContact of [0, 0.1, -0.2]) {
            const { downswing, omega } = planDownswing(input({ thetaContact }));
            const fall = PENDULUM.weight * (Math.cos(thetaContact) - Math.cos(downswing.thetaTop));
            const kinetic = 0.5 * PENDULUM.inertia * omega * omega;
            expect(Math.abs(kinetic / fall - 1), `θ_c ${thetaContact}`).toBeLessThanOrEqual(1e-3);
        }
    });

    it("falls in the pendulum's elliptic-integral time, within 0.1 %", () => {
        for (const thetaContact of [0, 0.1]) {
            const { downswing } = planDownswing(input({ thetaContact }));
            const k = Math.sin(-downswing.thetaTop / 2);
            const omegaN = Math.sqrt(PENDULUM.weight / PENDULUM.inertia);
            const phiC = Math.asin(Math.sin(thetaContact / 2) / k);
            const expected = (ellipticF(Math.PI / 2, k) + ellipticF(phiC, k)) / omegaN;
            expect(Math.abs(-downswing.release / expected - 1), `θ_c ${thetaContact}`).toBeLessThanOrEqual(1e-3);
        }
    });

    it("balances work and energy with the player's effort, within 0.1 %", () => {
        const effort = { torqueMax: 2, tempoSlow: 0.4, tempoFast: 0.2 };
        const { downswing, omega } = planDownswing(input({ intensity: 1, shape: shape({ effort }) }));
        let work = 0;
        for (let k = 0; k + 1 < downswingSamples(downswing); k++) {
            const t0 = downswingTime(downswing, k);
            const t1 = downswingTime(downswing, k + 1);
            const torque = 0.5 * (pulse(t0 - downswing.release, 2, 0.2) + pulse(t1 - downswing.release, 2, 0.2));
            work += torque * ((downswing.theta[k + 1] as number) - (downswing.theta[k] as number));
        }
        const fall = PENDULUM.weight * (1 - Math.cos(downswing.thetaTop));
        expect(work).toBeGreaterThan(0);
        expect(Math.abs((0.5 * PENDULUM.inertia * omega * omega) / (fall + work) - 1)).toBeLessThanOrEqual(1e-3);
    });

    it("swings faster and sooner with more intensity", () => {
        // The pulse starts at the release, where the pendulum has barely moved, so its work ∫τ·dθ comes mostly from
        // its later part. A torque small beside the weight's 8.2 N·m (2 N·m) leaves the quicker, shorter pulse of
        // intensity 1 with slightly less work than the half-peak, longer one of 0.5; 20 N·m dominates, and the
        // ordering is monotone.
        const effort = { torqueMax: 20, tempoSlow: 0.4, tempoFast: 0.2 };
        const at = (intensity: number) => planDownswing(input({ intensity, shape: shape({ effort }) }));
        expect(at(0.5).omega).toBeGreaterThan(at(0).omega);
        expect(at(1).omega).toBeGreaterThan(at(0.5).omega);
        expect(at(1).downswing.release).toBeGreaterThan(at(0).downswing.release);
    });

    it("integrates a near-horizontal backswing at full intensity", () => {
        // Review focus 2: the shaft taken back to 85°, the pulse clipped at contact if it outlasts the fall.
        const backswing = LEVER * (1 - Math.cos(85 * DEG));
        const effort = { torqueMax: 3, tempoSlow: 0.6, tempoFast: 0.3 };
        const still = planDownswing(input({ backswing, shape: shape({ effort }) }));
        const full = planDownswing(input({ backswing, intensity: 1, shape: shape({ effort }) }));
        expect(Number.isFinite(full.omega)).toBe(true);
        expect(full.omega).toBeGreaterThan(still.omega);
    });

    it("slaves the hands to the pendulum: P_b at the top, P_c at contact, level there, at V_c = 2·Δ_h·ω₀/span", () => {
        const planned = planDownswing(input({ shape: shape({ pendulumShare: 0.6 }) }));
        const { downswing, omega, handsVelocity } = planned;
        const top = downswingHands(downswing, downswing.release, downswingAt(downswing, downswing.release));
        expect(length(sub(top.P, downswing.handsTop))).toBe(0);
        expect(length(top.V)).toBe(0);
        const end = downswingHands(downswing, 0, downswingAt(downswing, 0));
        expect(length(sub(end.P, PIVOT))).toBeLessThan(1e-12);
        expect(Math.abs(end.V.z)).toBe(0);
        expect(length(sub(handsVelocity, scale(downswing.across, (2 * omega) / downswing.span)))).toBeLessThan(1e-12);
        expect(length(sub(end.V, handsVelocity))).toBeLessThan(1e-12);
    });

    it("tabulates θ, ω and α every FREE_STEP from the release, θ_c last", () => {
        const { downswing, omega } = planDownswing(input({ thetaContact: 0.1 }));
        const n = downswing.theta.length;
        expect(downswing.omega).toHaveLength(n);
        expect(downswing.alpha).toHaveLength(n);
        expect(downswing.theta[0]).toBe(downswing.thetaTop);
        expect(downswing.omega[0]).toBe(0);
        expect(downswing.theta[n - 1]).toBe(0.1);
        expect(downswing.omega[n - 1]).toBe(omega);
        expect(downswing.tempo).toBeNull();
        expect(downswingTime(downswing, n - 2)).toBeLessThan(0);
    });

    it("rejects a pendulum with no inertia, a stall and a fall beyond MAX_FALL", () => {
        // With no inertia the left-hand coefficient is 0 at the top (P′(0) = 0); with no weight and no effort the
        // pendulum never starts; with 1e-4 of the weight it falls in about 100 times the 0.47 s.
        expect(() => planDownswing(input({ pendulum: { ...PENDULUM, inertia: 0 } }))).toThrow(/effective inertia/);
        expect(() => planDownswing(input({ pendulum: { ...PENDULUM, weight: 0 } }))).toThrow(/stalls/);
        const slow = { ...PENDULUM, weight: PENDULUM.weight * 1e-4 };
        expect(() => planDownswing(input({ pendulum: slow }))).toThrow(new RegExp(`more than ${MAX_FALL} s`));
    });
});

describe("the carry-mode downswing (design §3.3)", () => {
    const carry = (o: Partial<DownswingInput> = {}) =>
        planDownswing(
            input({
                mode: "carry",
                thetaContact: -0.3,
                shape: shape({ pendulumShare: 0.5, handAngle: 0.6, handTempo: { slow: 0.5, fast: 0.25 } }),
                backswing: 0.2,
                ...o,
            }),
        );

    it("starts the hands' tempo before contact and reaches V_c = 2·Δ_h/T_h and ω₀ = 2·span/T_h", () => {
        const { downswing, omega, handsVelocity } = carry();
        expect(downswing.release).toBe(-0.5);
        expect(downswing.tempo).toBe(0.5);
        expect(downswing.theta).toHaveLength(0);
        expect(omega).toBeCloseTo((2 * downswing.span) / 0.5, 14);
        expect(length(sub(handsVelocity, scale(downswing.across, 2 / 0.5)))).toBeLessThan(1e-15);
    });

    it("halves the tempo and doubles the speed at intensity 1", () => {
        const slow = carry();
        const fast = carry({ intensity: 1 });
        expect(fast.downswing.release).toBe(-0.25);
        expect(contactSpeed(-0.3, fast.omega, fast.handsVelocity)).toBeCloseTo(
            2 * contactSpeed(-0.3, slow.omega, slow.handsVelocity),
            12,
        );
    });

    it("holds θ at θ_c with a share of 0, all hands", () => {
        const { downswing, omega } = carry({ shape: shape({ pendulumShare: 0, handAngle: 0.6 }) });
        expect(downswing.thetaTop).toBe(-0.3);
        expect(downswing.span).toBe(0);
        expect(omega).toBe(0);
        expect(downswingAt(downswing, -0.2).theta).toBe(-0.3);
    });
});

describe("the path's continuity at contact", () => {
    // The path is continuous at contact only if the arc's contact state is the downswing's own end: θ_c, ω and the
    // hands' position and velocity. planDownswing returns ω and V_c for the arc to adopt, so they must be the table's.
    const cases: readonly [string, DownswingInput][] = [
        ["swing", input({ thetaContact: 0.1, shape: shape({ pendulumShare: 0.6 }) })],
        [
            "carry",
            input({
                mode: "carry",
                thetaContact: -0.3,
                shape: shape({ pendulumShare: 0.5, handAngle: 0.6, handTempo: { slow: 0.5, fast: 0.25 } }),
                backswing: 0.2,
            }),
        ],
    ];

    it.each(cases)("returns the table's own end state, %s mode", (_mode, o) => {
        const { downswing, omega, handsVelocity } = planDownswing(o);
        const end = downswingAt(downswing, 0);
        const hands = downswingHands(downswing, 0, end);
        expect(end.theta).toBeCloseTo(o.thetaContact, 12);
        expect(Math.abs(end.omega - omega)).toBeLessThan(1e-12);
        expect(length(sub(hands.V, handsVelocity))).toBeLessThan(1e-12);
        expect(length(sub(hands.P, o.pivot))).toBeLessThan(1e-12);
    });
});

describe("scanDownswing (design §3.5)", () => {
    // The hands still and the contact level: swung back by φ the head's front rim is lowest, at P_z − (r + 2ρ)·cos φ −
    // (L/2)·sin φ, least at tan φ* = (L/2)/(r + 2ρ), where it is P_z − √((r + 2ρ)² + (L/2)²). The pivot is set so
    // that this least clearance is −3 mm, leaving 4.6 mm at contact.
    const arm = RADIUS + 2 * RHO;
    const half = TEST_HEAD.length / 2;
    const pivot = vec3(0, 0, Math.hypot(arm, half) - 0.003);
    const clearanceAt = (theta: number): number => pivot.z - arm * Math.cos(theta) - half * Math.abs(Math.sin(theta));

    it("finds the least clearance and when, and the first time the head is below the turf", () => {
        const { downswing } = planDownswing(input({ pivot }));
        const scan = scanDownswing(downswing, TEST_HEAD, AIM, RADIUS);
        expect(scan.clearance).toBeCloseTo(-0.003, 9);
        expect(downswingAt(downswing, -scan.before).theta).toBeCloseTo(-Math.atan2(half, arm), 4);
        const grounded = scan.grounded as number;
        expect(grounded).toBeLessThan(-scan.before + 1e-12);
        expect(clearanceAt(downswingAt(downswing, grounded).theta)).toBeLessThan(0);
        expect(clearanceAt(downswingAt(downswing, grounded - 5e-6).theta)).toBeGreaterThanOrEqual(-1e-12);
    });

    it("places the head as the path does, hands moving as well as the pendulum", () => {
        // An independent route: the arc that carries this downswing goes through prepareTrack and headOnPath, which
        // place the head from the path's own formulas, not scanDownswing's. A share of 0.7 moves the hands, so a
        // placement that ignored them would differ.
        const planned = planDownswing(input({ pivot, shape: shape({ pendulumShare: 0.7 }) }));
        const down = planned.downswing;
        const scan = scanDownswing(down, TEST_HEAD, AIM, RADIUS);
        const track = prepareTrack(trackDrive(arcOf(planned, pivot)), TEST_HEAD, STANDARD_GRAVITY);
        let least = Infinity;
        for (let k = 0; k < downswingSamples(down); k++) {
            const state = headOnPath(track, TEST_HEAD, LEAD + downswingTime(down, k));
            least = Math.min(least, headLowestPoint(state, TEST_HEAD));
        }
        expect(scan.clearance).toBeCloseTo(least, 9);
    });

    it("reports no grounding for a swing that stays clear", () => {
        const { downswing } = planDownswing(input());
        expect(scanDownswing(downswing, TEST_HEAD, AIM, RADIUS).grounded).toBeNull();
    });
});
