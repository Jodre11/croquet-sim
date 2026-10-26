import { describe, expect, it } from "vitest";
import { add, cross, dot, length, scale, sub, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import { IDENTITY, multiply, rotate, type Quaternion } from "../../../src/engine/impact/rigidBody";
import {
    FREE_SPAN,
    FREE_STEP,
    aimRotation,
    carryBody,
    downswingAt,
    downswingHands,
    downswingSamples,
    downswingTime,
    effectiveMass,
    handsAt,
    headOnPath,
    holdPendulum,
    inCheck,
    pathAt,
    pendulumOf,
    pitchAxis,
    prepareTrack,
    swingOrientation,
    swungBody,
    type FreePendulum,
    type PathPoint,
    type PreparedTrack,
    type Push,
    type Reach,
} from "../../../src/engine/impact/track";
import { validateImpact } from "../../../src/engine/impact/simulateImpact";
import type { Downswing, Hands, SwingArc, TrackDrive } from "../../../src/engine/impact/types";
import { buildContact } from "../../../src/engine/swing/buildContact";
import { STANDARD_GRAVITY, defaultWorld } from "../../../src/engine/world";
import { testWorld } from "../support/fixtures";
import { canonicalSetup } from "../support/shot";
import {
    NO_DIP,
    TEST_COUPLING,
    TEST_HANDS,
    TEST_HEAD,
    integratePulse,
    levelArc,
    onArc,
    socketAt,
    trackDrive,
} from "../support/impact";

const AIM = vec3(0.6, 0.8, 0);
const N = pitchAxis(AIM);
const UP = vec3(0, 0, 1);

/** The test hands with an arm mass, so the swung body is not the head. */
const ARMED: Hands = { ...TEST_HANDS, armMass: 0.8 };

const conj = (q: Quaternion): Quaternion => ({ w: q.w, x: -q.x, y: -q.y, z: -q.z });
const dist = (a: Vec3, b: Vec3): number => length(sub(a, b));

/**
 * A power roll's path in carry mode: both arcs speeding up from t = 0, the face pitched 0.6 rad down. Its contact is
 * at 1 s, after every time read here, so the hands' arc after contact (P2b.2b.2b.2b design §4.1; its own describe)
 * leaves the windows and the dip on their closed forms.
 */
const ROLL: SwingArc = {
    pivot: vec3(2, 3, 1.5),
    pivotVelocity: scale(AIM, 2.5),
    pivotAcceleration: scale(AIM, 20),
    handStart: 0,
    handWindow: 0.03,
    aim: AIM,
    radius: 0.8,
    theta0: -0.6,
    omega0: 0.5,
    alpha: 4,
    arcStart: 0,
    window: 0.03,
    dip: NO_DIP,
    contactAt: 1,
    mode: "carry",
    handReach: 10,
    pendulumAt: 0.8,
    pendulumEffort: 0,
    handArcRadius: 11,
    handArcLow: 0.5,
};

/** The same, each action timed: the pendulum's window from 10 ms, the hands' from 20 ms, a 10 mm dip from 5 ms. */
const TIMED: SwingArc = {
    ...ROLL,
    arcStart: 0.01,
    handStart: 0.02,
    dip: { start: 0.005, duration: 0.02, depth: 0.01 },
};

const prepare = (arc: SwingArc, hands: Hands = TEST_HANDS): PreparedTrack =>
    prepareTrack(trackDrive(arc, TEST_COUPLING, hands), TEST_HEAD, STANDARD_GRAVITY);

/** Time before, into and after a window starting at `start` lasting `window`. */
function phases(t: number, start: number, window: number) {
    return {
        before: Math.min(t, start),
        into: Math.min(Math.max(t - start, 0), window),
        after: Math.max(t - start - window, 0),
    };
}

/** The dip's downward displacement and speed (design §3.2). */
function dipAt(arc: SwingArc, t: number): { readonly z: number; readonly v: number } {
    const { start, duration: d, depth: D } = arc.dip;
    const e = t - start;
    const a = (4 * D) / (d * d);
    if (e <= 0) {
        return { z: 0, v: 0 };
    }
    if (e <= d / 2) {
        return { z: 0.5 * a * e * e, v: a * e };
    }
    if (e < d) {
        return { z: D - 0.5 * a * (d - e) * (d - e), v: a * (d - e) };
    }
    return { z: D, v: 0 };
}

/** The closed forms of design §3.2 for a carry-mode arc before its contact, with Math.* (the engine: sinCos). */
function closedForm(arc: SwingArc, t: number) {
    const p = phases(t, arc.arcStart, arc.window);
    // P2b.2b.2c.2d: each window is the minimum-jerk pulse of the box's mean rate, s = τ/W: ω = ω₀ + α·W·(3s² − 2s³),
    // θ gains α·W²·(s³ − s⁴/2) (was the box, ω₀ + α·τ and ½·α·τ²). The held slope (gate round 5 ruling) starts from
    // the pulse's α = 0: x = u/W, ω = ω_e·(1 − 3x² + 2x³) (was plus α₀·W·(x − 9x²/2 + 6x³ − 5x⁴/2)).
    const W = arc.window;
    const s = p.into / W;
    const omegaEnd = arc.omega0 + arc.alpha * W;
    const u = Math.min(p.after, W);
    const x = u / W;
    const omega =
        p.after > 0 ? omegaEnd * (1 - 3 * x ** 2 + 2 * x ** 3) : arc.omega0 + arc.alpha * W * (3 * s ** 2 - 2 * s ** 3);
    const held = W * omegaEnd * (x - x ** 3 + 0.5 * x ** 4);
    const theta = arc.theta0 + arc.omega0 * (p.before + p.into) + arc.alpha * W * W * (s ** 3 - 0.5 * s ** 4) + held;
    const h = phases(t, arc.handStart, arc.handWindow);
    const Wh = arc.handWindow;
    const sh = h.into / Wh;
    const A = arc.pivotAcceleration;
    // P2b.2b.2c.2d: the hands' pulse likewise (was V₀ + A·τ and ½·A·τ²).
    const V = add(arc.pivotVelocity, scale(A, Wh * (3 * sh ** 2 - 2 * sh ** 3)));
    const dip = dipAt(arc, t);
    const P = add(
        add(add(arc.pivot, scale(arc.pivotVelocity, h.before + h.into)), scale(A, Wh * Wh * (sh ** 3 - 0.5 * sh ** 4))),
        add(scale(add(arc.pivotVelocity, scale(A, Wh)), h.after), vec3(0, 0, -dip.z)),
    );
    const radial = sub(scale(arc.aim, Math.sin(theta)), vec3(0, 0, Math.cos(theta)));
    const tangent = add(scale(arc.aim, Math.cos(theta)), vec3(0, 0, Math.sin(theta)));
    return {
        theta,
        omega,
        socket: add(P, scale(radial, arc.radius)),
        socketVelocity: add(add(V, vec3(0, 0, -dip.v)), scale(tangent, arc.radius * omega)),
    };
}

/** The top hand's place on the path, P = socket + r·s, and its velocity: the pivot with the reach and the dip. */
function pivotOf(p: PathPoint, radius: number): { readonly P: Vec3; readonly V: Vec3 } {
    const top = scale(rotate(p.orientation, UP), radius);
    return { P: add(p.socket, top), V: add(p.socketVelocity, cross(p.angularVelocity, top)) };
}

describe("the swing path", () => {
    const track = prepare(TIMED);

    it("follows the closed forms before, during and after each window, the dip included", () => {
        for (const t of [0, 0.004, 0.009, 0.012, 0.018, 0.024, 0.045, 0.06, 0.08, 0.12]) {
            const p = pathAt(track, t);
            const c = closedForm(TIMED, t);
            expect(dist(p.socket, c.socket), `socket at ${t}`).toBeLessThan(1e-12);
            expect(dist(p.socketVelocity, c.socketVelocity), `velocity at ${t}`).toBeLessThan(1e-12);
            expect(dot(p.angularVelocity, N), `ω at ${t}`).toBeCloseTo(c.omega, 12);
        }
    });

    it("is continuous at every window's and the dip's boundaries", () => {
        const { arcStart, window, handStart, handWindow, dip } = TIMED;
        const edges = [
            arcStart,
            arcStart + window,
            arcStart + 2 * window,
            handStart,
            handStart + handWindow,
            dip.start,
            dip.start + dip.duration / 2,
            dip.start + dip.duration,
        ];
        for (const t of edges) {
            const before = pathAt(track, t);
            const after = pathAt(track, t + 1e-12);
            expect(dist(before.socket, after.socket), `socket at ${t}`).toBeLessThan(1e-11);
            expect(dist(before.socketVelocity, after.socketVelocity), `velocity at ${t}`).toBeLessThan(1e-9);
            expect(dist(before.angularVelocity, after.angularVelocity), `ω at ${t}`).toBeLessThan(1e-9);
        }
    });

    it("differentiates consistently away from the edges: velocity, acceleration and spin", () => {
        // Central differences straddling a window's or the dip's edge see the step in acceleration (pre-flight D3.1).
        const h = 1e-6;
        for (const t of [0.003, 0.013, 0.022, 0.045, 0.06, 0.08]) {
            const lo = pathAt(track, t - h);
            const mid = pathAt(track, t);
            const hi = pathAt(track, t + h);
            expect(dist(scale(sub(hi.socket, lo.socket), 1 / (2 * h)), mid.socketVelocity)).toBeLessThan(1e-6);
            expect(
                dist(scale(sub(hi.socketVelocity, lo.socketVelocity), 1 / (2 * h)), mid.socketAcceleration),
            ).toBeLessThan(1e-4);
            // hi ⊗ conj(lo) turns by 2h·|ω| about ω: its vector part is sin(h·|ω|)·ω̂ ≈ h·ω.
            const turn = multiply(hi.orientation, conj(lo.orientation));
            const spin = scale(vec3(turn.x, turn.y, turn.z), Math.sign(turn.w) / h);
            expect(dist(spin, mid.angularVelocity)).toBeLessThan(1e-6);
            const rate = (dot(hi.angularVelocity, N) - dot(lo.angularVelocity, N)) / (2 * h);
            expect(mid.pendulumAcceleration).toBeCloseTo(rate, 6);
        }
    });

    it("reports the dip's part of the pivot's acceleration and the pendulum's α", () => {
        const a = (4 * TIMED.dip.depth) / (TIMED.dip.duration * TIMED.dip.duration);
        expect(pathAt(track, 0.004).dipAcceleration.z).toBe(0);
        expect(pathAt(track, 0.009).dipAcceleration.z).toBeCloseTo(-a, 9);
        expect(pathAt(track, 0.018).dipAcceleration.z).toBeCloseTo(a, 9);
        expect(pathAt(track, 0.009).pendulumAcceleration).toBe(0);
        // P2b.2b.2c.2d: the minimum-jerk pulse's α = 6·α·s(1 − s) at s = 2 ms/30 ms = 1/15 (was the box's α, 4).
        const s = 1 / 15;
        expect(pathAt(track, 0.012).pendulumAcceleration).toBeCloseTo(6 * TIMED.alpha * s * (1 - s), 12);
        // The held slope's α at x = u/W = 0.5: −6ω_e/W·x(1 − x) = −1.5·ω_e/W. P2b.2b.2c.2d: the hold starts from the
        // pulse's α = 0 (was −1.5·ω_e/W − α₀/4).
        const omegaEnd = TIMED.omega0 + TIMED.alpha * 0.03;
        expect(pathAt(track, 0.055).pendulumAcceleration).toBeCloseTo((-1.5 * omegaEnd) / 0.03, 9);
    });

    it("holds the head's tilt while the hands alone move: a straight line at a constant orientation", () => {
        const push = prepare({ ...ROLL, omega0: 0, alpha: 0 });
        const start = pathAt(push, 0);
        for (const t of [0.01, 0.03, 0.08]) {
            const p = pathAt(push, t);
            expect(p.orientation).toEqual(start.orientation);
            const moved = sub(p.socket, start.socket);
            expect(length(cross(moved, AIM))).toBeLessThan(1e-12);
            expect(dot(moved, AIM)).toBeGreaterThan(0);
        }
    });

    it("dips the hands by its depth from rest to rest, then holds them there", () => {
        const flat = prepare({ ...TIMED, dip: NO_DIP });
        const { start, duration, depth } = TIMED.dip;
        const below = (t: number): number => pathAt(flat, t).socket.z - pathAt(track, t).socket.z;
        const sinking = (t: number): number => pathAt(flat, t).socketVelocity.z - pathAt(track, t).socketVelocity.z;
        expect(below(start)).toBe(0);
        expect(sinking(start)).toBe(0);
        for (const t of [start + duration, 0.05, 0.12]) {
            expect(below(t), `at ${t}`).toBeCloseTo(depth, 12);
            expect(sinking(t), `at ${t}`).toBeCloseTo(0, 12);
        }
    });

    it("brings a full check to rest at its window's end; carry mode holds it there", () => {
        const still = vec3(0, 0, 0);
        const checked = { ...ROLL, omega0: 3.5, pivotVelocity: still, pivotAcceleration: still, alpha: -3.5 / 0.03 };
        const carried = dot(pathAt(prepare(checked), ROLL.window).angularVelocity, N);
        expect(Math.abs(carried)).toBeLessThan(1e-12);
        // P2b.2b.2c.2d: gravity through the pulse (was swing mode at rest too, |ω| < 1e-12). Swing mode's pendulum, at
        // θ₀ = −0.6 rad, gains gravity's share over the window, about W·sin 0.6/I_P·0.03 ≈ 0.19 rad/s (the hand
        // integration's); without gravity, the pivot still, the table's check brings it to rest to O(FREE_STEP).
        const swing = { ...checked, mode: "swing" as const };
        const track = prepare(swing);
        const w = dot(pathAt(track, ROLL.window).angularVelocity, N);
        expect(w).toBeCloseTo(integratePulse(track, 1e-7).omega, 4);
        expect(w).toBeGreaterThan(0.18);
        const weightless = prepareTrack(trackDrive(swing), TEST_HEAD, 0);
        expect(Math.abs(dot(pathAt(weightless, ROLL.window).angularVelocity, N))).toBeLessThan(1e-6);
        // Carry mode's held slope starts from the pulse's α = 0 (P2b.2b.2c.2d design §3.1) and, ω_e being 0, stays at
        // rest; from its end, 0.06 s, the head is held where the check left it, the slope's net travel ω_e·W/2 being 0.
        const carry = prepare(checked);
        for (const t of [0.065, 0.12]) {
            expect(Math.abs(dot(pathAt(carry, t).angularVelocity, N)), `at ${t}`).toBeLessThan(1e-12);
        }
        expect(dist(pathAt(carry, ROLL.window).socket, pathAt(carry, 0.12).socket)).toBeLessThan(1e-12);
        expect(dist(pathAt(carry, 0.065).socket, pathAt(carry, 0.12).socket)).toBeLessThan(1e-12);
    });

    it("holds θ in carry mode after the second window", () => {
        const held = pathAt(track, TIMED.arcStart + 2 * TIMED.window).orientation;
        for (const t of [0.075, 0.1, 0.2]) {
            expect(pathAt(track, t).orientation, `at ${t}`).toEqual(held);
        }
    });

    it("plans the held slope with a continuous α and a finite jerk (gate round 5 ruling, 2026-10-12)", () => {
        // The held slope runs from the window's end, α the pulse's 0 (P2b.2b.2c.2d design §3.1), to rest one window W
        // later, α 0. At both seams α must not step, and across the pulse's end and the slope its rate of change stays
        // within |j| ≤ 6·|ω_e|/W² + 9·|α₀|/W (ω_e the rate at the window's end), which bounds both the slope's own jerk
        // and the pulse's, 6·|α₀|/W at its end. Both rolls: α₀ > 0 and a check, α₀ < 0.
        for (const arc of [TIMED, { ...TIMED, alpha: -(TIMED.omega0 / TIMED.window) }]) {
            const path = prepare(arc);
            const w = arc.window;
            const alpha = (t: number): number => pathAt(path, t).pendulumAcceleration;
            const omegaEnd = arc.omega0 + arc.alpha * w;
            const tw = arc.arcStart + w;
            for (const seam of [tw, tw + w]) {
                expect(Math.abs(alpha(seam + 1e-9) - alpha(seam - 1e-9)), `α at ${seam}, α₀ ${arc.alpha}`).toBeLessThan(
                    1e-4,
                );
            }
            // The slope keeps the old linear fall's travel: θ at its end is θ_e + ω_e·W/2, and the rate is rest there.
            const thetaEnd = pathAt(path, tw).theta;
            expect(pathAt(path, tw + w).theta, `θ at the slope's end, α₀ ${arc.alpha}`).toBeCloseTo(
                thetaEnd + (omegaEnd * w) / 2,
                12,
            );
            expect(Math.abs(dot(pathAt(path, tw + w).angularVelocity, N))).toBeLessThan(1e-12);
            const bound = (6 * Math.abs(omegaEnd)) / (w * w) + (9 * Math.abs(arc.alpha)) / w;
            const h = w / 1000;
            for (let t = tw - 10 * h; t < tw + w + 10 * h; t += h) {
                expect(Math.abs(alpha(t + h) - alpha(t)) / h, `jerk at ${t}, α₀ ${arc.alpha}`).toBeLessThan(
                    1.01 * bound,
                );
            }
        }
    });

    it("turns the face with the arc: the head's forward axis is the tangent to the socket's circle", () => {
        for (const t of [0, 0.02, 0.06]) {
            const forward = rotate(pathAt(track, t).orientation, vec3(1, 0, 0));
            const theta = closedForm(TIMED, t).theta;
            expect(dist(forward, add(scale(AIM, Math.cos(theta)), vec3(0, 0, Math.sin(theta))))).toBeLessThan(1e-12);
        }
    });

    it("orients the path by swingOrientation, so the swing model can place a head on it", () => {
        expect(pathAt(track, 0).orientation).toEqual(swingOrientation(AIM, TIMED.theta0));
    });

    it("turns body x to any aim", () => {
        for (const angle of [0, 2, Math.PI, -Math.PI / 2, 7]) {
            const aim = vec3(Math.cos(angle), Math.sin(angle), 0);
            expect(dist(rotate(aimRotation(aim), vec3(1, 0, 0)), aim), `aim ${angle}`).toBeLessThan(1e-15);
        }
    });

    it("tabulates a free pendulum in swing mode only", () => {
        expect(track.free).toBeNull();
        const free = prepare({ ...TIMED, mode: "swing" }).free;
        // P2b.2b.2c.2d: gravity through the pulse (was from the window's end, FREE_SPAN / FREE_STEP + 1 samples). From
        // the window's start: through the window with one sample to spare, then FREE_SPAN.
        expect(free?.tw).toBe(TIMED.arcStart);
        expect(free?.theta).toHaveLength(Math.ceil(TIMED.window / FREE_STEP) + Math.round(FREE_SPAN / FREE_STEP) + 2);
    });

    it("tabulates through the pulse only on request: the same path to the window's end, a throw past it", () => {
        const arc: SwingArc = { ...TIMED, mode: "swing" };
        const drive = trackDrive(arc, TEST_COUPLING, TEST_HANDS);
        const full = prepareTrack(drive, TEST_HEAD, STANDARD_GRAVITY);
        const bare = prepareTrack(drive, TEST_HEAD, STANDARD_GRAVITY, false);
        const [bareFree, fullFree] = [bare.free as FreePendulum, full.free as FreePendulum];
        expect(bareFree.theta).toHaveLength(Math.ceil(arc.window / FREE_STEP) + 2);
        expect(bareFree.theta).toEqual(fullFree.theta.slice(0, bareFree.theta.length));
        expect(bareFree.omega).toEqual(fullFree.omega.slice(0, bareFree.omega.length));
        expect({ ...bare, free: full.free }).toEqual(full);
        const tw = arc.arcStart + arc.window;
        for (const t of [-0.01, 0, arc.arcStart, 0.02, tw]) {
            expect(pathAt(bare, t), `t ${t}`).toEqual(pathAt(full, t));
        }
        expect(() => pathAt(bare, tw + 1e-6)).toThrow(
            /past the window's end, but prepareTrack tabulated it through the pulse/,
        );
        expect(() => holdPendulum(bare, tw)).toThrow(
            /past the window's end, but prepareTrack tabulated it through the pulse/,
        );
    });

    it("gives each grip its gains: firm, the top hand's γ_T and the bottom hand's g_B", () => {
        // Swing mode, whose swung body carries the arm mass; a carry's is the head with the hands' skin at the grips,
        // its hand–arm chains replacing the arm mass (P2b.2b.2b.2b gate round 3 ruling, 2026-10-11).
        const hands: Hands = { ...ARMED, gripTension: 0.1, bottomGrip: 0.25 };
        const t = prepare({ ...TIMED, mode: "swing" }, hands);
        const carried = prepare(TIMED, hands);
        expect(carried.body).toEqual(carryBody(TEST_HEAD, hands.chain, TIMED.radius, hands.bottom));
        expect(carried.released).toEqual(carryBody(TEST_HEAD, hands.chain, TIMED.radius, null));
        const rate = (2 * Math.PI) / TEST_COUPLING.period;
        const zeta = TEST_COUPLING.dampingRatio;
        const M = 1.8;
        const Iz = TEST_HEAD.inertia.z;
        for (const [gains, g] of [
            [t.firm, 1],
            [t.top, 0.1],
            [t.bottom, 0.25],
        ] as const) {
            const k = g * M * rate * rate;
            const K = g * Iz * rate * rate;
            expect(gains.stiffness).toBeCloseTo(k, 9);
            expect(gains.damping).toBeCloseTo(2 * zeta * Math.sqrt(k * M), 9);
            expect(gains.twistStiffness).toBeCloseTo(K, 12);
            expect(gains.twistDamping).toBeCloseTo(2 * zeta * Math.sqrt(K * Iz), 12);
        }
    });
});

describe("the free pendulum", () => {
    const CENTRE = vec3(0, 0, 1);

    it("stays at the lowest point from rest under a still pivot", () => {
        const track = prepare(levelArc(CENTRE), ARMED);
        const start = pathAt(track, 0);
        for (const t of [0.02, 0.1, 0.24]) {
            const p = pathAt(track, t);
            expect(p.orientation).toEqual(start.orientation);
            expect(p.socket).toEqual(start.socket);
            expect(dot(p.angularVelocity, track.axis)).toBe(0);
        }
    });

    it("swings released from a small angle at √(m·g·ℓ_h/I_P) over 0.25 s", () => {
        const theta0 = 0.01;
        const arc = levelArc(CENTRE, { theta0 });
        const track = prepare(arc, ARMED);
        const body = swungBody(TEST_HEAD, ARMED, arc.radius);
        const lh = TEST_HEAD.socket.z + arc.radius;
        const d = lh - body.offset;
        const rate = Math.sqrt((TEST_HEAD.mass * STANDARD_GRAVITY * lh) / (body.inertia.y + body.mass * d * d));
        const tw = arc.arcStart + arc.window;
        let worst = 0;
        for (let k = 0; k <= 250; k++) {
            const t = tw + k * 1e-3;
            const p = pathAt(track, t);
            const forward = rotate(p.orientation, vec3(1, 0, 0));
            const theta = Math.atan2(forward.z, forward.x);
            // P2b.2b.2c.2d: gravity through the pulse (was released at the window's end, cos(Ω·(t − tw))): gravity
            // acts through the window, so the release is its start.
            worst = Math.max(worst, Math.abs(theta - theta0 * Math.cos(rate * (t - arc.arcStart))));
        }
        // Two known errors bound it: semi-implicit Euler's half-step phase lead, Ω·FREE_STEP/2 ≈ 8.6e-6 of θ₀, and the
        // small-angle solution's frequency shift, θ₀²/16 of Ω, ≈ 5.3e-6 of θ₀ over the 0.25 s sampled. They partly
        // cancel: drafting measured 2.2e-6 of θ₀ (6.4e-6 at θ₀ = 0.001, 1.3e-5 at 0.02).
        expect(worst).toBeLessThan(1.5e-5 * theta0);
    });

    it("holds θ and ω at the table's last sample beyond it", () => {
        const track = prepare(levelArc(CENTRE, { theta0: 0.3 }), ARMED);
        const free = track.free as FreePendulum;
        const end = free.tw + (free.theta.length - 1) * FREE_STEP;
        const late = pathAt(track, end + 0.01);
        const later = pathAt(track, end + 0.1);
        expect(later.orientation).toEqual(late.orientation);
        expect(later.angularVelocity).toEqual(late.angularVelocity);
        expect(dot(late.angularVelocity, track.axis)).toBeCloseTo(free.omega[free.omega.length - 1] as number, 15);
    });
});

describe("the hands' reach", () => {
    const CENTRE = vec3(0, 0, 1);
    const pivotAt = (track: PreparedTrack, t: number) => pivotOf(pathAt(track, t), track.arc.radius);

    it("stops the pivot's along-aim motion handReach from contactAt, at rest from t_s, the rest running on", () => {
        // Swing mode, so no descent; the vertical part of the pivot's velocity is off aim and runs on.
        const arc = levelArc(CENTRE, { pivotVelocity: vec3(2, 0, 0.3), handReach: 0.1, contactAt: 0.01 });
        const track = prepare(arc);
        const reach = track.reach as Reach;
        const from = pivotAt(track, arc.contactAt).P;
        expect(reach.t1).toBeCloseTo(arc.contactAt + 0.04, 12);
        expect(reach.tStop).toBeCloseTo(reach.t1 + (0.4 * 0.1) / 2, 12);
        for (const t of [reach.tStop, reach.tStop + 0.02, 0.2]) {
            const p = pivotAt(track, t);
            expect(p.P.x - from.x, `travel at ${t}`).toBeCloseTo(0.1, 12);
            expect(p.V.x, `along-aim speed at ${t}`).toBeCloseTo(0, 12);
            expect(p.V.z, `vertical speed at ${t}`).toBeCloseTo(0.3, 12);
        }
        for (const t of [reach.t1, reach.tStop]) {
            const before = pivotAt(track, t);
            const after = pivotAt(track, t + 1e-12);
            expect(dist(before.P, after.P), `position at ${t}`).toBeLessThan(1e-11);
            expect(dist(before.V, after.V), `velocity at ${t}`).toBeLessThan(1e-9);
        }
    });

    it("rests the along-aim motion from contactAt with a reach of 0", () => {
        const arc = levelArc(CENTRE, { pivotVelocity: vec3(2, 0, 0), handReach: 0, contactAt: 0.02 });
        const track = prepare(arc);
        const at = pivotAt(track, arc.contactAt).P;
        for (const t of [0.03, 0.1]) {
            expect(dist(pivotAt(track, t).P, at), `at ${t}`).toBeLessThan(1e-12);
        }
        expect(pivotAt(track, 0.01).V.x).toBe(2);
    });

    it("does not bind if the plan does not travel 0.8·handReach within 0.5 s of contactAt", () => {
        const slow = prepare(levelArc(CENTRE, { pivotVelocity: vec3(0.15, 0, 0), handReach: 0.1 }));
        expect(slow.reach).toBeNull();
        expect(pivotAt(slow, 0.2).V.x).toBe(0.15);
        const brisk = prepare(levelArc(CENTRE, { pivotVelocity: vec3(0.17, 0, 0), handReach: 0.1 }));
        expect(brisk.reach?.t1).toBeCloseTo(0.08 / 0.17, 12);
    });
});

describe("the hands' arc after contact (P2b.2b.2b.2b design §4.1)", () => {
    const AIM = vec3(1, 0, 0);
    /** A carry from contact at 2 m/s along aim, the hands arriving on a 1.5 m arc lowest halfway along a 0.3 m push. */
    const arrival = -0.15 / Math.sqrt(1.5 * 1.5 - 0.15 * 0.15);
    const ARC = levelArc(vec3(0, 0, 0.5), {
        mode: "carry",
        pivotVelocity: vec3(2, 0, 2 * arrival),
        handReach: 0.3,
        handArcRadius: 1.5,
        handArcLow: 0.5,
        pendulumAt: 0.8,
    });
    const track = prepareTrack(trackDrive(ARC), TEST_HEAD, STANDARD_GRAVITY);
    const push = track.push as Push;
    const start = handsAt(track, 0).position;

    it("has no reach in carry mode, and times the push and the pendulum phase along aim", () => {
        expect(track.reach).toBeNull();
        expect(push.end as number).toBeCloseTo(0.3 / 2, 12);
        expect(push.pendulum as number).toBeCloseTo(0.24 / 2, 12);
        expect(dot(sub(handsAt(track, push.end as number).position, start), AIM)).toBeCloseTo(0.3, 12);
    });

    it("descends at contact at asin(s_low/ρ_h), is lowest at s_low and back at contact height at its end", () => {
        // 1 ns after contact the hands are 2 nm along the arc, which has turned by 2e-9/(ρ_h·cos) ≈ 1.3e-9 rad.
        const v = handsAt(track, 1e-9).velocity;
        expect(Math.atan2(-v.z, v.x)).toBeCloseTo(Math.asin(0.15 / 1.5), 8);
        const low = handsAt(track, 0.15 / 2).position;
        expect(low.z - start.z).toBeCloseTo(-(1.5 - Math.sqrt(1.5 * 1.5 - 0.15 * 0.15)), 12);
        for (const t of [0.02, 0.05, 0.1, 0.13]) {
            expect(handsAt(track, t).position.z).toBeGreaterThanOrEqual(low.z);
        }
        expect(handsAt(track, push.end as number).position.z).toBeCloseTo(start.z, 12);
    });

    it("stops the intended path at once at the push length: no brake, no descent", () => {
        for (const t of [push.end as number, 0.2, 0.5]) {
            const hands = handsAt(track, t);
            expect(hands.velocity).toEqual(vec3(0, 0, 0));
            expect(dot(sub(hands.position, start), AIM)).toBeCloseTo(0.3, 12);
        }
    });

    it("is continuous in position at contact, and in velocity for an arc that arrives on it", () => {
        const before = handsAt(track, -1e-9);
        const after = handsAt(track, 1e-9);
        expect(length(sub(before.position, after.position))).toBeLessThan(1e-8);
        expect(length(sub(before.velocity, after.velocity))).toBeLessThan(1e-6);
    });

    it("starts the pendulum phase at contact for a push of length 0", () => {
        // Review focus 1: the arc's low point is at contact, so the hands arrive level and rest there.
        const none = prepareTrack(trackDrive({ ...ARC, handReach: 0 }), TEST_HEAD, STANDARD_GRAVITY);
        const nonePush = none.push as Push;
        expect([nonePush.end, nonePush.pendulum]).toEqual([0, 0]);
        expect(handsAt(none, 0.1).velocity).toEqual(vec3(0, 0, 0));
        expect(Number.isFinite(handsAt(none, 0.1).position.z)).toBe(true);
    });

    it("never starts the push's end or the pendulum phase for hands that never travel", () => {
        const idle = { ...ARC, pivotVelocity: vec3(0, 0, 0) };
        const never = prepareTrack(trackDrive(idle), TEST_HEAD, STANDARD_GRAVITY).push as Push;
        expect([never.end, never.pendulum]).toEqual([null, null]);
    });

    it("leaves swing mode's path as it was: a reach and no push", () => {
        const swing = prepareTrack(trackDrive({ ...ARC, mode: "swing" }), TEST_HEAD, STANDARD_GRAVITY);
        expect(swing.push).toBeNull();
        expect(swing.reach).not.toBeNull();
    });

    // Contact moved to 0.03 s so that the hands' window [0.01, 0.02] lies wholly before it, where the planned pivot is
    // read directly (carry mode's push starts at contact); the pendulum's window is [0, 0.01].
    const carryArc: SwingArc = {
        ...ARC,
        alpha: 40,
        pivotAcceleration: vec3(0, 3, 0),
        contactAt: 0.03,
        handStart: 0.03 - 2 * ARC.window,
    };

    describe("the smooth pulse (P2b.2b.2c.2d design §3.1)", () => {
        const T = carryArc.window;
        const at = (track: PreparedTrack, s: number) => pathAt(track, carryArc.arcStart + s * T);
        it("keeps the box's change over the window, the pulse's mean rate", () => {
            const track = prepareTrack(trackDrive(carryArc), TEST_HEAD, 0);
            const w = (s: number) => dot(at(track, s).angularVelocity, track.axis);
            expect(w(1) - w(0)).toBeCloseTo(carryArc.alpha * T, 12);
            expect(track.thetaEnd).toBe(track.thetaArc + track.omegaArc * T + 0.5 * carryArc.alpha * T * T);
        });
        it("starts and ends at zero acceleration, peaking at 1.5 times the mean", () => {
            const track = prepareTrack(trackDrive(carryArc), TEST_HEAD, 0);
            expect(at(track, 1e-9).pendulumAcceleration).toBeCloseTo(0, 6);
            expect(at(track, 1).pendulumAcceleration).toBeCloseTo(0, 9);
            expect(at(track, 0.5).pendulumAcceleration).toBeCloseTo(1.5 * carryArc.alpha, 9);
        });
        it("has the jerk ±6·Δω/T² at the window's ends", () => {
            // dα/dτ = 6·mean/T·(1 − 2s): a finite difference over 1e-7 s at each end.
            const track = prepareTrack(trackDrive(carryArc), TEST_HEAD, 0);
            const h = 1e-7 / T;
            const jerk = (s: number) =>
                (at(track, s + h).pendulumAcceleration - at(track, s).pendulumAcceleration) / 1e-7;
            expect(jerk(0)).toBeCloseTo((6 * carryArc.alpha) / T, 0);
            expect(jerk(1 - h)).toBeCloseTo((-6 * carryArc.alpha) / T, 0);
        });
        it("shapes the hands' push the same way", () => {
            // A quarter into the window the box has given A·T/4; the minimum-jerk profile A·T·(3/16 − 2/64) =
            // 0.15625·A·T.
            const track = prepareTrack(trackDrive(carryArc), TEST_HEAD, 0);
            const v = (t: number) => handsAt(track, t).velocity;
            const gained = sub(v(carryArc.handStart + T / 4), v(carryArc.handStart));
            expect(length(gained)).toBeCloseTo(0.15625 * length(carryArc.pivotAcceleration) * T, 12);
        });
        it("starts carry mode's hold from rest acceleration, continuous at the window's end", () => {
            // 1 ps on: the hold's own jerk, −6·ω_e/W² ≈ −2.4e4 rad/s³ here, moves α by only ~2.4e-8 rad/s², where a
            // hold begun at the box's α₀ would step by the full 40 rad/s². 1 ns cannot work: that jerk alone moves α
            // by 2.4e-5 there, past toBeCloseTo(…, 6)'s 5e-7.
            const track = prepareTrack(trackDrive(carryArc), TEST_HEAD, 0);
            const end = carryArc.arcStart + T;
            expect(pathAt(track, end + 1e-12).pendulumAcceleration).toBeCloseTo(
                pathAt(track, end).pendulumAcceleration,
                6,
            );
        });
        it("runs carry mode's hold over holdWindow when given, the window otherwise", () => {
            // The hold's ω = ω_e·(1 − 3x² + 2x³), x = u/W: at u = T, rest for W = T, half of ω_e for W = 2T, and at
            // u = 2T rest for W = 2T.
            const end = carryArc.arcStart + T;
            const rate = (arc: SwingArc, t: number) => {
                const track = prepareTrack(trackDrive(arc), TEST_HEAD, 0);
                return [dot(pathAt(track, t).angularVelocity, track.axis), track.omegaEnd] as const;
            };
            const [plain] = rate(carryArc, end + T);
            expect(Math.abs(plain)).toBeLessThan(1e-12);
            const long: SwingArc = { ...carryArc, holdWindow: 2 * T };
            const [half, omegaEnd] = rate(long, end + T);
            expect(half).toBeCloseTo(0.5 * omegaEnd, 12);
            const [rest] = rate(long, end + 2 * T);
            expect(Math.abs(rest)).toBeLessThan(1e-12);
        });
    });

    describe("gravity through the pulse (P2b.2b.2c.2d design §3.1)", () => {
        // The carry's arc in swing mode with no reach, released at θ₀ = −0.6 rad so that gravity's share over the
        // window (about 6 rad/s², 0.06 rad/s of ω) is far past the tolerances below, and with the hands' pulse along
        // aim over the pendulum's window, so that the pivot's inertial term acts within it too.
        const swingArc: SwingArc = {
            ...carryArc,
            mode: "swing",
            handReach: 0,
            theta0: -0.6,
            handStart: 0,
            pivotAcceleration: vec3(3, 0, 0),
        };
        const WORLD = defaultWorld();

        it("adds gravity's share to the pulse in swing mode, against a hand integration", () => {
            // RK4 at 1e-7 s of θ̈ = (−W·sin θ − M·d·(A·t̂))/I_P + 6·alpha·s(1 − s) over the window, from thetaArc and
            // omegaArc; the table's semi-implicit Euler at FREE_STEP agrees to O(FREE_STEP).
            const track = prepareTrack(trackDrive(swingArc), TEST_HEAD, STANDARD_GRAVITY);
            const hand = integratePulse(track, 1e-7);
            expect(track.omegaEnd).toBeCloseTo(hand.omega, 4);
            expect(track.thetaEnd).toBeCloseTo(hand.theta, 6);
        });
        it("drops the player's effort from an early pulse's start, never gravity", () => {
            // A brake begun 10 ms before contact at intensity 0 on the GC stop (no dip, so the dip's coupling leaves
            // the case alone): before the pulse the downswing table, from it the free pendulum plus the pulse; θ is
            // continuous at arcStart.
            const early = { arc: -0.01, hands: 0, dip: 0 };
            const c = buildContact(canonicalSetup("stop-gc", { stroke: { timing: early } }), WORLD);
            const track = prepareTrack(c.drive as TrackDrive, c.head, WORLD.gravity);
            const { arcStart } = track.arc;
            // θ moves by ω·1 ns ≈ 3.6e-9 rad there, so a bare equality at precision 9 cannot hold; against the
            // first-order prediction a seam's jump past 5e-10 rad still shows.
            const p = pathAt(track, arcStart);
            const w = dot(p.angularVelocity, track.axis);
            expect(pathAt(track, arcStart + 1e-9).theta).toBeCloseTo(p.theta + 1e-9 * w, 9);
            expect(track.free?.tw).toBe(arcStart);
        });
        it("is continuous in θ, ω and the socket at the window's end", () => {
            const track = prepareTrack(trackDrive(swingArc), TEST_HEAD, STANDARD_GRAVITY);
            const end = swingArc.arcStart + swingArc.window;
            const [a, b] = [pathAt(track, end - 1e-9), pathAt(track, end + 1e-9)];
            expect(b.theta).toBeCloseTo(a.theta, 8);
            expect(dot(b.angularVelocity, track.axis)).toBeCloseTo(dot(a.angularVelocity, track.axis), 6);
            expect(length(sub(b.socket, a.socket))).toBeLessThan(1e-8);
        });
        it("leaves carry mode's window as the pulse alone", () => {
            const g = prepareTrack(trackDrive({ ...ARC, alpha: 5 }), TEST_HEAD, STANDARD_GRAVITY);
            const z = prepareTrack(trackDrive({ ...ARC, alpha: 5 }), TEST_HEAD, 0);
            expect(g.thetaEnd).toBe(z.thetaEnd);
        });
    });
});

describe("a head on the path", () => {
    const track = prepare(TIMED);

    it("has its socket on the path", () => {
        for (const t of [0, 0.02, 0.06]) {
            const head = headOnPath(track, TEST_HEAD, t);
            expect(dist(socketAt(head, TEST_HEAD), pathAt(track, t).socket)).toBeLessThan(1e-14);
        }
    });

    it("moves with the path's rigid motion: its velocity is its position's derivative", () => {
        const h = 1e-6;
        for (const t of [0.013, 0.06]) {
            const lo = headOnPath(track, TEST_HEAD, t - h);
            const hi = headOnPath(track, TEST_HEAD, t + h);
            const mid = headOnPath(track, TEST_HEAD, t);
            expect(dist(scale(sub(hi.position, lo.position), 1 / (2 * h)), mid.velocity)).toBeLessThan(1e-6);
            expect(mid.angularVelocity).toEqual(pathAt(track, t).angularVelocity);
        }
    });

    it("is inside a check only through a window with α < 0", () => {
        const check = prepare({ ...TIMED, alpha: -4 });
        expect([0.005, 0.01, 0.025, 0.04, 0.045].map((t) => inCheck(check, t))).toEqual([
            false,
            true,
            true,
            true,
            false,
        ]);
        expect(inCheck(track, 0.025)).toBe(false);
    });
});

describe("the swung body", () => {
    it("is the head with no arm mass", () => {
        expect(swungBody(TEST_HEAD, TEST_HANDS, 0.8)).toEqual({ mass: 1, inertia: TEST_HEAD.inertia, offset: 0 });
    });

    it("puts the arm mass at the top grip: δ and I' by the parallel-axis theorem", () => {
        const body = swungBody(TEST_HEAD, ARMED, 0.8);
        // The top grip is ρ + r = 0.832 m above the head's centre.
        const delta = (0.8 * 0.832) / 1.8;
        const extra = 1 * delta * delta + 0.8 * (0.832 - delta) * (0.832 - delta);
        expect(body.mass).toBe(1.8);
        expect(body.offset).toBeCloseTo(delta, 15);
        expect(body.inertia.x).toBeCloseTo(TEST_HEAD.inertia.x + extra, 15);
        expect(body.inertia.y).toBeCloseTo(TEST_HEAD.inertia.y + extra, 15);
        expect(body.inertia.z).toBe(TEST_HEAD.inertia.z);
    });
});

describe("the effective mass at the face centre", () => {
    it("is the head's mass with no arm mass, along the head's axis", () => {
        const body = swungBody(TEST_HEAD, TEST_HANDS, 0.8);
        expect(effectiveMass(body, TEST_HEAD, IDENTITY, vec3(1, 0, 0))).toBe(1);
        const q = swingOrientation(AIM, 0.3);
        expect(effectiveMass(body, TEST_HEAD, q, rotate(q, vec3(1, 0, 0)))).toBeCloseTo(1, 12);
    });

    it("matches a hand computation with the arm mass: 1/(1/M + δ²/I'_y) along aim, level", () => {
        // ρ + r = 0.832 m; I_y = m·(3ρ² + L²)/12 = 0.055972/12 kg·m².
        const delta = (0.8 * 0.832) / 1.8;
        const Iy = 0.055972 / 12 + delta * delta + 0.8 * (0.832 - delta) * (0.832 - delta);
        const expected = 1 / (1 / 1.8 + (delta * delta) / Iy);
        const body = swungBody(TEST_HEAD, ARMED, 0.8);
        expect(effectiveMass(body, TEST_HEAD, IDENTITY, vec3(1, 0, 0))).toBeCloseTo(expected, 12);
        expect(expected).toBeCloseTo(1.00668, 5);
    });
});

/**
 * A swing-mode downswing of constant α from rest at θ_top to θ_c over T (s): θ = θ_top + ½·α·τ², τ from the release
 * −T, tabulated every FREE_STEP with its last sample at contact. The hands end at `pivot`, from `pivot` − across −
 * drop.
 */
function uniformDownswing(
    thetaTop: number,
    thetaC: number,
    T: number,
    pivot: Vec3,
    across: Vec3 = vec3(0, 0, 0),
    drop: Vec3 = vec3(0, 0, 0),
): Downswing {
    const alpha = (2 * (thetaC - thetaTop)) / (T * T);
    const theta: number[] = [];
    const omega: number[] = [];
    const accel: number[] = [];
    for (let k = 0; k * FREE_STEP < T; k++) {
        const tau = k * FREE_STEP;
        theta.push(thetaTop + 0.5 * alpha * tau * tau);
        omega.push(alpha * tau);
        accel.push(alpha);
    }
    theta.push(thetaC);
    omega.push(alpha * T);
    accel.push(alpha);
    return {
        release: -T,
        thetaTop,
        span: thetaC - thetaTop,
        handsTop: sub(sub(pivot, across), drop),
        across,
        drop,
        tangent: vec3(0, 0, 0),
        tempo: null,
        theta,
        omega,
        alpha: accel,
    };
}

/** Lead (s), the downswing's length T (s) and its angles: the head swung through 0.6 rad onto a level contact. */
const LEAD = 0.02;
const FALL = 0.05;
const TOP = -0.6;
const CONTACT = 0;
const OMEGA_C = (2 * (CONTACT - TOP)) / FALL;

/**
 * A level swing arc whose head reaches contact at LEAD on a uniform downswing, coasting on at ω₀ until windows at
 * LEAD, its hands moved by `across` and `drop` along it (and on at V_c = 2·across·ω₀/span after it).
 */
function downswingArc(o: Partial<SwingArc> = {}, across = vec3(0, 0, 0), drop = vec3(0, 0, 0)): SwingArc {
    const handsVelocity = scale(across, (2 * OMEGA_C) / (CONTACT - TOP));
    // levelArc's still pivot is where the hands arrive at contact.
    const base = levelArc(vec3(1, 2, 0.05), {
        theta0: CONTACT - OMEGA_C * LEAD,
        omega0: OMEGA_C,
        contactAt: LEAD,
        arcStart: LEAD,
        handStart: LEAD,
        ...o,
    });
    return {
        ...base,
        pivot: sub(base.pivot, scale(handsVelocity, LEAD)),
        pivotVelocity: handsVelocity,
        downswing: uniformDownswing(TOP, CONTACT, FALL, base.pivot, across, drop),
    };
}

describe("the downswing (P2b.2b.2a design §3.5)", () => {
    const radial = (theta: number) => sub(scale(vec3(1, 0, 0), Math.sin(theta)), scale(UP, Math.cos(theta)));
    const alpha = (2 * (CONTACT - TOP)) / (FALL * FALL);

    it("samples every FREE_STEP from the release, the last sample at contact", () => {
        const down = uniformDownswing(TOP, CONTACT, FALL, vec3(0, 0, 1));
        const n = downswingSamples(down);
        expect(n).toBe(down.theta.length);
        expect(downswingTime(down, 0)).toBe(-FALL);
        expect(downswingTime(down, 3)).toBeCloseTo(-FALL + 3 * FREE_STEP, 15);
        expect(downswingTime(down, n - 1)).toBe(0);
        expect(downswingTime(down, n - 2)).toBeLessThan(0);
    });

    it("drives the path before contact: θ, ω and α from the table, the socket on its circle", () => {
        const arc = downswingArc();
        const track = prepare(arc);
        for (const t of [0, 0.005, 0.0123, 0.019, 0.0199999]) {
            const tau = t - LEAD + FALL;
            const p = pathAt(track, t);
            const theta = TOP + 0.5 * alpha * tau * tau;
            expect(dot(p.angularVelocity, vec3(0, -1, 0)), `ω at ${t}`).toBeCloseTo(alpha * tau, 9);
            expect(p.pendulumAcceleration, `α at ${t}`).toBeCloseTo(alpha, 9);
            const pivot = (arc.downswing as Downswing).handsTop;
            expect(dist(p.socket, add(pivot, scale(radial(theta), arc.radius))), `socket at ${t}`).toBeLessThan(1e-8);
        }
    });

    it("holds the top at rest before the release", () => {
        const late = { contactAt: 0.08, theta0: CONTACT - OMEGA_C * 0.08, arcStart: 0.08, handStart: 0.08 };
        const arc = downswingArc(late);
        const p = pathAt(prepare(arc), 0);
        expect(length(p.angularVelocity)).toBe(0);
        expect(length(p.socketVelocity)).toBe(0);
        expect(p.pendulumAcceleration).toBe(0);
        expect(dist(p.socket, add((arc.downswing as Downswing).handsTop, scale(radial(TOP), arc.radius)))).toBeLessThan(
            1e-12,
        );
    });

    it("coasts on from contact exactly as an arc with no downswing", () => {
        const arc = downswingArc();
        const a = prepare(arc);
        const b = prepare({ ...arc, downswing: undefined });
        for (const t of [LEAD, LEAD + 0.005, LEAD + 0.04, LEAD + 0.3]) {
            expect(pathAt(a, t), `t ${t}`).toEqual(pathAt(b, t));
        }
    });

    it("is continuous at contact and where an early window starts", () => {
        const onTime = prepare(downswingArc());
        const early = prepare(downswingArc({ arcStart: 0.01, alpha: -50 }));
        for (const [track, t] of [
            [onTime, LEAD],
            [early, 0.01],
            [early, LEAD],
        ] as const) {
            const before = pathAt(track, t - 1e-12);
            const after = pathAt(track, t + 1e-12);
            expect(dist(before.socket, after.socket), `socket at ${t}`).toBeLessThan(1e-9);
            expect(dist(before.socketVelocity, after.socketVelocity), `velocity at ${t}`).toBeLessThan(1e-6);
        }
    });

    it("starts an early window from the downswing's state there", () => {
        const track = prepare(downswingArc({ arcStart: 0.01, alpha: -50 }));
        const tau = 0.01 - LEAD + FALL;
        expect(track.thetaArc).toBeCloseTo(TOP + 0.5 * alpha * tau * tau, 9);
        expect(track.omegaArc).toBeCloseTo(alpha * tau, 9);
        // P2b.2b.2c.2d: gravity through the pulse (was alpha·tau − 50·0.01, the pulse alone): the window's end adds
        // the free pendulum's share over it, as the hand integration has it.
        expect(track.omegaEnd).toBeCloseTo(integratePulse(track, 1e-7).omega, 4);
        expect(track.omegaEnd - (alpha * tau - 50 * 0.01)).toBeGreaterThan(0.01);
    });

    it("moves the hands with the pendulum in swing mode, arriving level at V_c = 2·across·ω₀/span", () => {
        const across = vec3(0.05, 0, 0);
        const drop = vec3(0, 0, -0.02);
        const arc = downswingArc({}, across, drop);
        const track = prepare(arc);
        const down = arc.downswing as Downswing;
        expect(dist(handsAt(track, LEAD - FALL).position, down.handsTop)).toBeLessThan(1e-12);
        const atContact = handsAt(track, LEAD - 1e-9);
        expect(dist(atContact.position, add(add(down.handsTop, across), drop))).toBeLessThan(1e-8);
        expect(Math.abs(atContact.velocity.z)).toBeLessThan(1e-6);
        expect(atContact.velocity.x).toBeCloseTo((2 * 0.05 * OMEGA_C) / (CONTACT - TOP), 6);
        // Halfway in σ the vertical part has fallen half its drop, at its fastest. The table's linear interpolation of
        // the quadratic θ errs by up to α·FREE_STEP²/8, 1.5e-9 rad.
        const swing = downswingAt(down, -FALL + FALL / Math.SQRT2);
        expect((swing.theta - TOP) / (CONTACT - TOP)).toBeCloseTo(0.5, 7);
        const half = downswingHands(down, -FALL + FALL / Math.SQRT2, swing);
        expect(half.P.z - down.handsTop.z).toBeCloseTo(-0.01, 9);
    });

    it("evaluates carry mode in closed form: σ = (t − t_r)/T_h, θ = θ_top + span·σ²", () => {
        const across = vec3(0.1, 0, 0);
        const drop = vec3(0, 0, -0.03);
        const down: Downswing = {
            release: -0.4,
            thetaTop: -0.5,
            span: 0.3,
            handsTop: vec3(1, 2, 1),
            across,
            drop,
            tangent: vec3(0, 0, 0),
            tempo: 0.4,
            theta: [],
            omega: [],
            alpha: [],
        };
        expect(downswingSamples(down)).toBe(Math.ceil(0.4 / FREE_STEP) + 1);
        for (const t of [-0.4, -0.3, -0.1, 0]) {
            const sigma = (t + 0.4) / 0.4;
            const swing = downswingAt(down, t);
            expect(swing.theta, `θ at ${t}`).toBeCloseTo(-0.5 + 0.3 * sigma * sigma, 14);
            expect(swing.omega, `ω at ${t}`).toBeCloseTo((2 * 0.3 * sigma) / 0.4, 14);
            const hands = downswingHands(down, t, swing);
            const rise = 3 * sigma ** 2 - 2 * sigma ** 3;
            const P = add(add(vec3(1, 2, 1), scale(across, sigma * sigma)), scale(drop, rise));
            expect(dist(hands.P, P), `P at ${t}`).toBeLessThan(1e-14);
        }
        expect(dist(downswingHands(down, 0, downswingAt(down, 0)).V, scale(across, 2 / 0.4))).toBeLessThan(1e-14);
    });

    it("gives the pendulum's constants as the free pendulum uses them", () => {
        const body = swungBody(TEST_HEAD, ARMED, 0.8);
        const p = pendulumOf(TEST_HEAD, body, 0.8, STANDARD_GRAVITY);
        const lh = TEST_HEAD.socket.z + 0.8;
        const d = lh - body.offset;
        expect(p).toEqual({
            weight: TEST_HEAD.mass * STANDARD_GRAVITY * lh,
            inertial: body.mass * d,
            inertia: body.inertia.y + body.mass * d * d,
        });
    });

    it("tabulates the free pendulum for the longest stroke: past contact at 0.15 s by 0.6 s, and to 1.15 s", () => {
        // The longest lead-in puts contact 0.15 s after t = 0. The table, which starts where the pendulum's window
        // does, must then reach at least 0.6 s past contact (t = 0.75 s) and, as FREE_SPAN's design bound has it, the
        // longest lead plus the 1 s follow-through cap from t = 0 (1.15 s).
        const lead = 0.15;
        const track = prepare(levelArc(vec3(1, 2, 0.05), { contactAt: lead }));
        const free = track.free as FreePendulum;
        const reaches = free.tw + (free.theta.length - 1) * FREE_STEP;
        expect(reaches).toBeGreaterThanOrEqual(lead + 0.6);
        expect(reaches).toBeGreaterThanOrEqual(lead + 1);
    });

    it.each(["swing", "carry"] as const)("starts an early hands window from the downswing's hands, %s mode", (mode) => {
        // An early window replaces the hands' path from where the downswing has them, as an early pendulum window
        // replaces the pendulum's dynamics: pivotHand and pivotVelocityHand are the downswing's there, not P₀ + V₀·t
        // and V₀, and the window's end carries on from them.
        const across = vec3(0.05, 0, 0);
        const drop = vec3(0, 0, -0.02);
        const early = 0.01;
        const base = downswingArc({ mode, handStart: early, pivotAcceleration: vec3(5, 0, 0) }, across, drop);
        const swingDown = base.downswing as Downswing;
        const downswing: Downswing =
            mode === "swing"
                ? swingDown
                : { ...swingDown, release: -FALL, span: CONTACT - TOP, tempo: FALL, theta: [], omega: [], alpha: [] };
        const arc: SwingArc = { ...base, downswing };
        const track = prepare(arc);
        const u = early - LEAD;
        const expected = downswingHands(downswing, u, downswingAt(downswing, u));
        expect(dist(track.pivotHand, expected.P)).toBeLessThan(1e-12);
        expect(dist(track.pivotVelocityHand, expected.V)).toBeLessThan(1e-12);
        // The test discriminates: the downswing's hand velocity there is not the contact velocity V₀.
        expect(dist(track.pivotVelocityHand, arc.pivotVelocity)).toBeGreaterThan(1e-3);
        const wh = arc.handWindow;
        const accel = arc.pivotAcceleration;
        expect(dist(track.pivotVelocityEnd, add(expected.V, scale(accel, wh)))).toBeLessThan(1e-12);
        const travelled = add(add(expected.P, scale(expected.V, wh)), scale(accel, 0.5 * wh * wh));
        expect(dist(track.pivotEnd, travelled)).toBeLessThan(1e-12);
        const before = handsAt(track, early - 1e-12);
        const after = handsAt(track, early + 1e-12);
        expect(dist(before.position, after.position), "position").toBeLessThan(1e-9);
        expect(dist(before.velocity, after.velocity), "velocity").toBeLessThan(1e-6);
    });

    it("rejects a malformed downswing", () => {
        const good = downswingArc();
        const down = good.downswing as Downswing;
        const bad: readonly [string, Downswing, RegExp][] = [
            ["a release at or after contact", { ...down, release: 0 }, /release must be negative/],
            ["a table of one sample", { ...down, theta: [0], omega: [0], alpha: [0] }, /tabulated in swing mode/],
            ["a table that stops short of contact", { ...down, release: -1 }, /must end at contact/],
            ["a tempo in swing mode", { ...down, tempo: 0.05 }, /tabulated in swing mode/],
        ];
        // The head is placed on the good arc: a malformed table must fail validation, not the placement.
        const placed = onArc(trackDrive(good));
        for (const [name, downswing, pattern] of bad) {
            const contact = { ...placed, drive: trackDrive({ ...good, downswing }) };
            expect(() => validateImpact(contact, {}, testWorld()), name).toThrow(pattern);
        }
        const carry: SwingArc = { ...good, mode: "carry", downswing: { ...down, tempo: 0.3, release: -0.2 } };
        const carried = { ...placed, drive: trackDrive(carry) };
        expect(() => validateImpact(carried, {}, testWorld())).toThrow(/closed-form in carry mode/);
    });

    it("bounds the table's last full step to within FREE_STEP before contact, with a rounding margin", () => {
        // Three samples, so last = release + FREE_STEP is controlled to ~1e-21 s. The turf error means validation
        // passed.
        const good = downswingArc();
        const down = good.downswing as Downswing;
        const placed = onArc(trackDrive(good));
        const flat = (v: number): number[] => [v, v, v];
        const cases: readonly [string, number, RegExp][] = [
            ["1e-18 s past contact", 1e-18 - FREE_STEP, /head penetrates the turf/],
            ["1e-18 s past a full step before it", 0 - 2 * FREE_STEP - 1e-18, /head penetrates the turf/],
            ["half a step past contact", 0 - FREE_STEP / 2, /must end at contact/],
            ["half a step past a full step before it", 0 - 2.5 * FREE_STEP, /must end at contact/],
        ];
        for (const [name, release, pattern] of cases) {
            const edge: Downswing = { ...down, release, theta: flat(TOP), omega: flat(0), alpha: flat(0) };
            const contact = { ...placed, drive: trackDrive({ ...good, downswing: edge }) };
            expect(() => validateImpact(contact, {}, testWorld()), name).toThrow(pattern);
        }
    });

    it("accepts a table whose last sample time rounds a hair past contact", () => {
        // release + (count − 2)·FREE_STEP is mathematically 0 but rounds to +3.5e-18 s for T = 0.03 s and 6002
        // samples. A plain `last < 0` test would reject a table that does end at contact, so the check allows a
        // relative margin.
        const good = downswingArc();
        const down = good.downswing as Downswing;
        const count = 6002;
        const fill = (v: number): number[] => Array.from({ length: count }, () => v);
        const hair: Downswing = { ...down, release: -0.03, theta: fill(TOP), omega: fill(0), alpha: fill(0) };
        const last = hair.release + (count - 2) * FREE_STEP;
        expect(last).toBeGreaterThan(0);
        expect(last).toBeLessThan(1e-15);
        const placed = onArc(trackDrive(good));
        const contact = { ...placed, drive: trackDrive({ ...good, downswing: hair }) };
        // These contacts are not placed to start a real impact, so validateImpact ends on its later turf check:
        // reaching it, as the good arc does, means the downswing passed.
        expect(() => validateImpact(contact, {}, testWorld())).toThrow(/head penetrates the turf/);
    });
});
