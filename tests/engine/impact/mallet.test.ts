import { describe, expect, it } from "vitest";
import { IMPACT_DT, integrate, type ImpactSnapshot } from "../../../src/engine/impact/integrate";
import { rotate } from "../../../src/engine/impact/rigidBody";
import {
    carryBody,
    handLoad,
    headOnPath,
    holdTwist,
    malletBody,
    newGripState,
    prepareTrack,
    swungBody,
    type FreePendulum,
} from "../../../src/engine/impact/track";
import type { MalletHead } from "../../../src/engine/impact/types";
import { ZERO, cross, length, scale, sub, vec3 } from "../../../src/engine/math/vec3";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import { TEST_BALL } from "../support/fixtures";
import {
    TEST_BOX,
    TEST_CHAIN,
    TEST_HANDS,
    TEST_HEAD,
    TEST_RHO,
    freeTracked,
    impactEnergy,
    isolated,
    levelArc,
    recorder,
    trackDrive,
} from "../support/impact";

const g = STANDARD_GRAVITY;
/** TEST_BOX on a 0.9 m, 0.3 kg shaft. */
const SHAFTED: MalletHead = { ...TEST_BOX, shaft: { mass: 0.3, length: 0.9 } };
/** Where the shaft's centre lies above the head's centre (m): h_z + ℓ/2. */
const RISE = TEST_RHO + 0.45;
const CENTRE = vec3(0, 0, 1);

describe("the mallet's body (P2b.2b.2b.2c design §4.2)", () => {
    it("is the head itself with no shaft mass, the same object fields", () => {
        const body = malletBody(TEST_HEAD);
        expect(body).toEqual({ mass: TEST_HEAD.mass, inertia: TEST_HEAD.inertia, offset: 0 });
        expect(body.inertia).toBe(TEST_HEAD.inertia);
    });

    it("adds a thin uniform rod from the socket: M, δ and I' in closed form", () => {
        const M = 1.3;
        const delta = (0.3 * RISE) / M;
        const extra = 1 * delta * delta + 0.3 * ((RISE - delta) ** 2 + 0.81 / 12);
        const body = malletBody(SHAFTED);
        expect(body.mass).toBeCloseTo(M, 15);
        expect(body.offset).toBeCloseTo(delta, 15);
        expect(body.inertia.x).toBeCloseTo(TEST_BOX.inertia.x + extra, 14);
        expect(body.inertia.y).toBeCloseTo(TEST_BOX.inertia.y + extra, 14);
        expect(body.inertia.z).toBe(TEST_BOX.inertia.z);
    });

    it("builds the swung body and the carry's body on the mallet, by the parallel-axis rule", () => {
        const arm = 0.5;
        const grip = TEST_RHO + 0.8;
        const M = 1.3 + arm;
        const delta = (0.3 * RISE + arm * grip) / M;
        const mallet = malletBody(SHAFTED);
        const extra = 1.3 * (mallet.offset - delta) ** 2 + arm * (grip - delta) ** 2;
        const body = swungBody(SHAFTED, { ...TEST_HANDS, armMass: arm }, 0.8);
        expect(body.mass).toBeCloseTo(M, 15);
        expect(body.offset).toBeCloseTo(delta, 15);
        expect(body.inertia.y).toBeCloseTo(mallet.inertia.y + extra, 14);
        const skin = TEST_CHAIN.palmSkinMass + TEST_CHAIN.fingerSkinMass;
        const carried = carryBody(SHAFTED, TEST_CHAIN, 0.8, null);
        expect(carried.mass).toBeCloseTo(1.3 + skin, 15);
        expect(carried.offset).toBeCloseTo((0.3 * RISE + skin * grip) / (1.3 + skin), 15);
    });

    it("swings freely about the top hand at 2π·√(I_P/W), within 0.1 %", () => {
        // A still top hand: the free pendulum from 0.02 rad at rest. I_P and W come from the parts by the
        // parallel-axis rule, apart from malletBody: the head at ℓ_h below the hand, the rod's centre at
        // ℓ_h − h_z − ℓ/2. The table spans 1.2 s, so the first zero crossing gives a quarter period. At r = 0.3 m the
        // top hand lies below the shaft's mid-point, and the shaft's weight term opposes the head's (review focus 5).
        // P2b.2b.2c.3a: the swung body on every stroke, each hand's skin s at its grip (was the mallet alone): the top
        // hand's skin sits on the pivot and adds nothing to I_P, the bottom's adds s·(r − b)², and neither adds weight.
        const skin = TEST_CHAIN.palmSkinMass + TEST_CHAIN.fingerSkinMass;
        for (const r of [0.8, 0.3]) {
            const arc = levelArc(CENTRE, { radius: r, theta0: 0.02, window: 1e-4, handWindow: 1e-4 });
            const free = prepareTrack(trackDrive(arc), SHAFTED, g).free as FreePendulum;
            const lh = TEST_RHO + r;
            const below = lh - RISE;
            const lever = r - TEST_HANDS.bottom;
            const inertia = TEST_BOX.inertia.y + lh * lh + 0.3 * (0.81 / 12 + below * below) + skin * lever * lever;
            const weight = g * lh + 0.3 * g * below;
            expect(free.inertia).toBeCloseTo(inertia, 12);
            expect(free.weight).toBeCloseTo(weight, 12);
            const i = free.theta.findIndex((theta) => theta <= 0);
            const t0 = (i - 1) * 5e-6;
            const a = free.theta[i - 1] as number;
            const b = free.theta[i] as number;
            const quarter = t0 + (5e-6 * a) / (a - b);
            const expected = 2 * Math.PI * Math.sqrt(inertia / weight);
            expect(Math.abs((4 * quarter) / expected - 1), `r ${r}`).toBeLessThanOrEqual(1e-3);
        }
    });
});

describe("the shaft's weight (P2b.2b.2b.2c design §4.3)", () => {
    it("is held by the hands' feed-forward at the shaft's centre", () => {
        // A still path, the shaft leaning 0.3 rad, firm grips before relaxAt with the head on the path: the springs and
        // dampers see no error, so the hands give the feed-forward alone. Its force holds the whole mallet's weight,
        // and its moment about the head's centre balances the shaft's weight at RISE along the shaft.
        const arc = levelArc(CENTRE, { theta0: 0.3 });
        const track = prepareTrack(trackDrive(arc, { period: 0.04, dampingRatio: 0.7, relaxAt: 1 }), SHAFTED, g);
        const state = headOnPath(track, SHAFTED, 0);
        // Before relaxAt the firm grips' springs act on a gap of about 1 ulp between headOnPath and handLoad (k ≈ 3.2e4
        // N/m, so about 7e-12 N, and the same with no shaft): the total force and torque carry a rounding floor
        // of order 1e-11, the feed-forward itself none.
        const load = handLoad(track, state, SHAFTED, 0, newGripState(), IMPACT_DT);
        expect(length(sub(load.feedForward, vec3(0, 0, 1.3 * g)))).toBeLessThan(1e-12);
        expect(length(sub(load.force, vec3(0, 0, 1.3 * g)))).toBeLessThan(1e-10);
        const s = rotate(state.orientation, vec3(0, 0, 1));
        expect(length(sub(load.torque, cross(scale(s, RISE), vec3(0, 0, 0.3 * g))))).toBeLessThan(1e-10);
    });

    it("leaves a held mallet still under gravity: the integrator puts the shaft's weight at its centre", () => {
        // As above, through the integrator: the feed-forward's torque cancels the shaft's weight's only if the loads
        // put it at the shaft's centre. P2b.2b.2c.2d: gravity through the pulse (was the window from t = 0, which held
        // θ then): gravity now swings the pendulum through its window, so the window starts after the run, where the
        // path before it holds θ₀ still.
        const arc = levelArc(CENTRE, { theta0: 0.3, arcStart: 1 });
        const track = prepareTrack(trackDrive(arc, { period: 0.04, dampingRatio: 0.7, relaxAt: 1 }), SHAFTED, g);
        const start = headOnPath(track, SHAFTED, 0);
        const run = integrate(isolated({ head: SHAFTED, start, drive: track, gravity: g }), { cap: 0.01 });
        expect(length(sub(run.head.position, start.position))).toBeLessThan(1e-12);
        expect(length(run.head.angularVelocity)).toBeLessThan(1e-9);
    });

    it("counts the shaft's kinetic and potential energy in the tests' helpers", () => {
        // A free mallet (no hands, no gravity) spinning about its pitch axis, its centre of mass at rest: the head's
        // centre circles it, and the whole mallet's kinetic energy holds.
        const omega = vec3(0, 5, 0);
        const offset = vec3(0, 0, malletBody(SHAFTED).offset);
        const base = freeTracked(SHAFTED, CENTRE, scale(cross(omega, offset), -1), []);
        const setup = { ...base, start: { ...base.start, angularVelocity: omega } };
        const probe = recorder();
        integrate(setup, { cap: 0.01, probe });
        const snapshots = probe.snapshots;
        const first = impactEnergy(snapshots[0] as ImpactSnapshot, SHAFTED, TEST_BALL, 0);
        const last = impactEnergy(snapshots[snapshots.length - 1] as ImpactSnapshot, SHAFTED, TEST_BALL, 0);
        expect(first).toBeCloseTo(0.5 * malletBody(SHAFTED).inertia.y * 25, 9);
        expect(Math.abs(last / first - 1)).toBeLessThan(1e-9);
        // At rest, level, at height z = 1 m: m·g·z plus m_s·g·(z + RISE).
        const still: ImpactSnapshot = {
            ...(snapshots[0] as ImpactSnapshot),
            head: { ...setup.start, velocity: ZERO, angularVelocity: ZERO },
        };
        expect(impactEnergy(still, SHAFTED, TEST_BALL, g)).toBeCloseTo(g * 1 + 0.3 * g * (1 + RISE), 12);
    });
});

describe("the twist hold (P2b.2b.2b.2c design §9, plan decision 7)", () => {
    it("holds the grips' twist gains at a given I_z and leaves every other gain", () => {
        const track = prepareTrack(trackDrive(levelArc(CENTRE)), TEST_BOX, g);
        expect(holdTwist(track, track.body.inertia.z)).toEqual(track);
        const held = holdTwist(track, track.body.inertia.z / 4);
        expect(held.body).toBe(track.body);
        for (const key of ["firm", "top", "bottom"] as const) {
            expect(held[key].stiffness).toBe(track[key].stiffness);
            expect(held[key].damping).toBe(track[key].damping);
            expect(held[key].twistStiffness).toBeCloseTo(track[key].twistStiffness / 4, 15);
            expect(held[key].twistDamping).toBeCloseTo(track[key].twistDamping / 4, 15);
        }
    });
});
