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
    requiredCouple,
    scanDownswing,
    type DownswingInput,
    type GripCouple,
    type PlannedDownswing,
} from "../../../src/engine/swing/downswing";
import { contactPose, downswingInputOf, poseSpeed } from "../../../src/engine/swing/buildContact";
import type { SwingEffort, SwingShape } from "../../../src/engine/swing/types";
import { STANDARD_GRAVITY, defaultWorld } from "../../../src/engine/world";
import { TEST_BOX, TEST_HANDS, TEST_HEAD, levelArc, trackDrive } from "../support/impact";
import { canonicalSetup, type CanonicalOptions } from "../support/shot";

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
const dist = (a: Vec3, b: Vec3): number => length(sub(a, b));

function shape(o: Partial<SwingShape> = {}): SwingShape {
    return {
        pendulumShare: 1,
        handAngle: 0.5,
        handTempo: { slow: 0.4, fast: 0.2 },
        slopeHold: 0,
        ...o,
    };
}

/** TEST_HANDS' grip on the 0.8 m arc: both grips firm, the hands 0.4 m apart. */
const GRIP: GripCouple = {
    top: TEST_HANDS.gripTension,
    bottom: TEST_HANDS.bottomGrip,
    limit: TEST_HANDS.gripLimit,
    spread: RADIUS - TEST_HANDS.bottom,
};

/** A free swing (λ = 0) of the test head; `o` overrides, its couple C following an overridden grip. */
function input(o: Partial<DownswingInput> = {}): DownswingInput {
    const grip = o.grip ?? GRIP;
    return {
        slopeHold: 0,
        couple: Math.min(grip.top, grip.bottom) * grip.limit * grip.spread,
        grip,
        aim: AIM,
        thetaContact: 0,
        pivot: PIVOT,
        lever: LEVER,
        pendulum: PENDULUM,
        shape: shape(),
        backswing: 0.3,
        backswingLimit: MAX_BACK_ANGLE,
        effort: { torque: 0, speed: 1 },
        intensity: 0,
        arrival: 0,
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

/** The player's torque (N·m) at ω and intensity i: the Hill law i·τ_0·max(0, 1 − ω/ω_max) (P2b.2b.2c.1 design §4.4). */
function hill(omega: number, intensity: number, effort: SwingEffort): number {
    return intensity * effort.torque * Math.max(0, 1 - omega / effort.speed);
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

describe("the free swing, λ = 0 (design §3.1, §3.4)", () => {
    it("matches the energy integral with gravity alone and the hands still, within 0.1 %", () => {
        // P2b.2b.2b.2c: also on TEST_BOX with a 0.3 kg shaft, its weight term the head's and the rod's.
        const shafted = { ...TEST_BOX, shaft: { mass: 0.3, length: 0.9 } };
        const heavy = pendulumOf(shafted, swungBody(shafted, TEST_HANDS, RADIUS), RADIUS, STANDARD_GRAVITY);
        for (const pendulum of [PENDULUM, heavy]) {
            for (const thetaContact of [0, 0.1, -0.2]) {
                const { downswing, omega } = planDownswing(input({ thetaContact, pendulum }));
                const fall = pendulum.weight * (Math.cos(thetaContact) - Math.cos(downswing.thetaTop));
                const kinetic = 0.5 * pendulum.inertia * omega * omega;
                expect(Math.abs(kinetic / fall - 1), `θ_c ${thetaContact}`).toBeLessThanOrEqual(1e-3);
            }
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
        // P2b.2b.2c.1: the single-ball stroke (was a 2 N·m pulse over 0.2 s): the Hill law's torque at the table's ω.
        const effort = { torque: 2, speed: 20 };
        const { downswing, omega } = planDownswing(input({ intensity: 1, effort }));
        let work = 0;
        for (let k = 0; k + 1 < downswing.theta.length; k++) {
            const w0 = downswing.omega[k] as number;
            const w1 = downswing.omega[k + 1] as number;
            const torque = 0.5 * (hill(w0, 1, effort) + hill(w1, 1, effort));
            work += torque * ((downswing.theta[k + 1] as number) - (downswing.theta[k] as number));
        }
        const fall = PENDULUM.weight * (1 - Math.cos(downswing.thetaTop));
        expect(work).toBeGreaterThan(0);
        expect(Math.abs((0.5 * PENDULUM.inertia * omega * omega) / (fall + work) - 1)).toBeLessThanOrEqual(1e-3);
    });

    it("swings faster and sooner with more intensity", () => {
        // P2b.2b.2c.1: the single-ball stroke (was a 20 N·m pulse over 0.4–0.2 s). The Hill law's torque at any ω
        // rises with i and acts until contact, so the head is quicker at every θ: ω at contact rises and the fall
        // shortens (the release comes later).
        const effort = { torque: 20, speed: 20 };
        const at = (intensity: number) => planDownswing(input({ intensity, effort }));
        expect(at(0.5).omega).toBeGreaterThan(at(0).omega);
        expect(at(1).omega).toBeGreaterThan(at(0.5).omega);
        expect(at(1).downswing.release).toBeGreaterThan(at(0).downswing.release);
    });

    it("integrates a near-horizontal backswing at full intensity", () => {
        // Review focus 2: the shaft taken back to 85°. P2b.2b.2c.1: the single-ball stroke (was a 3 N·m pulse over
        // 0.3 s, clipped at contact): the Hill law's torque acts from the top until contact.
        const backswing = LEVER * (1 - Math.cos(85 * DEG));
        const effort = { torque: 3, speed: 20 };
        const still = planDownswing(input({ backswing, effort }));
        const full = planDownswing(input({ backswing, intensity: 1, effort }));
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

describe("the held slope, λ = 1 (design §3.3)", () => {
    const carry = (o: Partial<DownswingInput> = {}) =>
        planDownswing(
            input({
                slopeHold: 1,
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

    it("ends the held slope's hands' path tangent to the hands' arc, descending at the arrival slope", () => {
        // P2b.2b.2b.2b design §4.1: the vertical term is the cubic Hermite with the same ends and the arc's slope at
        // contact, so the hands arrive moving down along the arc.
        const arrival = -Math.tan(Math.asin(0.1));
        const { downswing, handsVelocity } = carry({ arrival });
        const at = downswingHands(downswing, 0, downswingAt(downswing, 0));
        const along = Math.hypot(at.V.x, at.V.y);
        expect(at.V.z / along).toBeCloseTo(arrival, 12);
        expect(handsVelocity.z).toBeCloseTo(at.V.z, 12);
        expect(dist(at.P, PIVOT)).toBeLessThan(1e-12);
        const top = downswingHands(downswing, downswing.release, downswingAt(downswing, downswing.release));
        expect(length(top.V)).toBe(0);
    });

    it("leaves a free swing's still hands as they were: no tangent", () => {
        const { downswing } = planDownswing(input({ arrival: -0.5 }));
        expect(downswing.tangent).toEqual(vec3(0, 0, 0));
    });
});

describe("the planned slope (P2b.2b.2c.3a design §4.1)", () => {
    const WORLD = defaultWorld();
    /** The default half roll's canonical downswing input, `over` changing its setup. */
    const halfRoll = (over: CanonicalOptions = {}): DownswingInput =>
        downswingInputOf(canonicalSetup("half-roll", over), WORLD);
    const at = (base: DownswingInput, slopeHold: number): PlannedDownswing => planDownswing({ ...base, slopeHold });
    /** The held slope of the test head, its hands moving: the held-slope describe's roll. */
    const held = {
        slopeHold: 1,
        thetaContact: -0.3,
        shape: shape({ pendulumShare: 0.5, handAngle: 0.6, handTempo: { slow: 0.5, fast: 0.25 } }),
    };

    it("derives a null tempo from the free swing's own fall", () => {
        const base = halfRoll({ shape: { handTempo: null } });
        const derived = at(base, 1).downswing;
        expect(derived.tempo).not.toBeNull();
        expect(Math.abs(derived.release - at(base, 0).downswing.release)).toBeLessThanOrEqual(1e-15);
    });

    it("blends continuously between them", () => {
        // Review Focus 3, refined at Task 3 (the hands' progress blends as well as the slope's). The blend table is
        // read by linear interpolation between FREE_STEP samples, whose error is at most h²/8 times the second
        // derivative: for θ, h²/8·2·span/D² is under 1e-10 rad (h = 5 µs, span under 1 rad, D over 0.3 s), as is
        // the O(ε) = 1e-9 the blend itself moves. So θ within 1e-6 rad (the brief's bound); the hands' P within
        // 1e-8 m (|Δ_h| ≈ 0.2 m times a progress off by about 1e-10); the hands' V and the head's planned speed at
        // contact within 1e-7 m/s (an O(1e-9) rate at contact times the hands' and the head's lever, each under
        // 10 m/s per unit rate). Observed: θ 6.7e-11 rad, P 5.2e-11 m, V 5.6e-10 m/s, speed 1.0e-10 m/s.
        const setup = canonicalSetup("half-roll");
        const base = downswingInputOf(setup, WORLD);
        const pose = contactPose(setup, WORLD);
        for (const [near, end] of [
            [1e-9, 0],
            [1 - 1e-9, 1],
        ] as const) {
            const a = at(base, near);
            const b = at(base, end);
            const release = b.downswing.release;
            for (let j = 0; j < 20; j++) {
                const t = release * (1 - j / 19);
                const sa = downswingAt(a.downswing, t);
                const sb = downswingAt(b.downswing, t);
                expect(Math.abs(sa.theta - sb.theta), `λ ${near}, t ${t}`).toBeLessThanOrEqual(1e-6);
                const pa = downswingHands(a.downswing, t, sa).P;
                const pb = downswingHands(b.downswing, t, sb).P;
                expect(dist(pa, pb), `λ ${near}, t ${t}`).toBeLessThanOrEqual(1e-8);
            }
            expect(dist(a.handsVelocity, b.handsVelocity), `λ ${near}`).toBeLessThanOrEqual(1e-7);
            expect(Math.abs(poseSpeed(pose, a) - poseSpeed(pose, b)), `λ ${near}`).toBeLessThanOrEqual(1e-7);
        }
    });

    it("plans a blend that starts at rest at the top and ends at θ_c at contact", () => {
        const base = halfRoll();
        const tempo = (base.shape.handTempo as { readonly slow: number }).slow;
        const fall = 0 - at(base, 0).downswing.release;
        const { downswing } = at(base, 0.5);
        const n = downswing.theta.length;
        expect(downswing.theta[0]).toBe(downswing.thetaTop);
        expect(downswing.omega[0]).toBe(0);
        expect(Math.abs((downswing.theta[n - 1] as number) - base.thetaContact)).toBeLessThanOrEqual(1e-12);
        expect(Math.abs(downswing.release + (0.5 * fall + 0.5 * tempo))).toBeLessThanOrEqual(1e-12);
    });

    it("rejects a plan the grip cannot hold", () => {
        // Review Focus 3: at 1e-3 N a hand holds about 4e-4 N·m across the half roll's 0.385 m spread, far below the
        // couple the held slope needs against gravity alone.
        expect(() => at(halfRoll({ body: { gripLimit: 1e-3 } }), 1)).toThrow(/the grip cannot hold the planned slope/);
    });

    it("asks nothing of the couple on a free swing", () => {
        const base = halfRoll({ body: { gripLimit: 1e-9 } });
        expect(base.couple).toBeLessThan(1e-9);
        expect(() => at(base, 0)).not.toThrow();
        // No couple at all, not even C = 0: a check at λ = 0 would fire on the free table's ~1e-15 N·m residual.
        expect(() => planDownswing({ ...halfRoll(), slopeHold: 0, couple: -1 })).not.toThrow();
    });

    it("needs a free swing to derive a missing tempo", () => {
        // Review Focus 3: a held slope with no tempo takes the free swing's fall, which a share of 0 does not have.
        const share0 = shape({ pendulumShare: 0, handAngle: 0.6, handTempo: null });
        expect(() => planDownswing(input({ ...held, shape: share0 }))).toThrow(/needs its pendulum to swing/);
    });

    it("holds every backswing to the body's limit", () => {
        // Replaces backswingLimit.test.ts's carry case (which kept MAX_BACK_ANGLE): on a 0.832 m pendulum from θ_c =
        // −0.3 rad a share of 0.5 of a 0.3 m backswing takes the shaft to about 0.68 rad, of 0.1 m to about 0.46 rad.
        const limited = { ...held, backswingLimit: 0.5 };
        expect(() => planDownswing(input({ ...limited, backswing: 0.3 }))).toThrow(/body's backswing limit θ_max/);
        expect(() => planDownswing(input({ ...limited, backswing: 0.1 }))).not.toThrow();
    });

    it("holds the drive's slope with its hands together within the grip's couple", () => {
        // Review Focus 3, before Task 12 moves the drive's bottom hand: at 0.715 m, 0.09 m below the top hand, with
        // g_B 0.25, C = 0.25·435·0.09 = 9.7875 N·m. Held (λ = 1) on its own free fall, the still hands ask the couple
        // for I_P·α + W·sin θ, the held slope's α constant and gravity's sin θ < 0 opposing it until contact, so the
        // peak falls at contact: 7.0384 N·m (setupProbe section P), within C.
        const base = downswingInputOf(canonicalSetup("drive", { stance: { bottom: 0.715 } }), WORLD);
        expect(base.couple).toBeCloseTo(9.7875, 10);
        const { peak, at: when } = requiredCouple(base, at(base, 1).downswing);
        expect(peak).toBeCloseTo(7.0384, 4);
        expect(when).toBe(0);
        expect(peak).toBeLessThan(base.couple);
    });

    it("checks the couple at every sample against C, through requiredCouple", () => {
        // The held half roll's couple is its own peak: a C just below it rejects the plan, one at it does not.
        const base = halfRoll();
        const { peak } = requiredCouple(base, at(base, 1).downswing);
        expect(peak).toBeGreaterThan(0);
        expect(() => planDownswing({ ...base, slopeHold: 1, couple: peak * (1 - 1e-9) })).toThrow(/cannot hold/);
        expect(() => planDownswing({ ...base, slopeHold: 1, couple: peak })).not.toThrow();
    });
});

describe("the path's continuity at contact", () => {
    // The path is continuous at contact only if the arc's contact state is the downswing's own end: θ_c, ω and the
    // hands' position and velocity. planDownswing returns ω and V_c for the arc to adopt, so they must be the table's.
    const cases: readonly [string, DownswingInput][] = [
        ["free", input({ thetaContact: 0.1, shape: shape({ pendulumShare: 0.6 }) })],
        [
            "held",
            input({
                slopeHold: 1,
                thetaContact: -0.3,
                shape: shape({ pendulumShare: 0.5, handAngle: 0.6, handTempo: { slow: 0.5, fast: 0.25 } }),
                backswing: 0.2,
            }),
        ],
    ];

    it.each(cases)("returns the plan's own end state, the %s slope", (_slope, o) => {
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

    it("lowers each sample by the dip's travel (P2b.2b.2c.2d design §4.2)", () => {
        // A constant 1 mm lowering moves every sample down alike, so the least clearance falls by it, at the same time.
        const { downswing } = planDownswing(input({ pivot }));
        const plain = scanDownswing(downswing, TEST_HEAD, AIM, RADIUS);
        const lowered = scanDownswing(downswing, TEST_HEAD, AIM, RADIUS, () => 0.001);
        expect(lowered.clearance).toBe(plain.clearance - 0.001);
        expect(lowered.before).toBe(plain.before);
    });
});
