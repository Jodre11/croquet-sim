import { describe, expect, it } from "vitest";
import { ZERO, add, cross, dot, length, scale, sub, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import {
    IMPACT_DT,
    LOOK_AHEAD,
    RELEASE_STEPS,
    TRACK_IMPACT_CAP,
    integrate,
    type ImpactBall,
    type ImpactProbe,
    type ImpactSnapshot,
} from "../../../src/engine/impact/integrate";
import { multiply, rotate, rotateInverse, type Quaternion } from "../../../src/engine/impact/rigidBody";
import {
    HAND_COUPLING,
    handLoad,
    headOnPath,
    newGripState,
    pathAt,
    prepareTrack,
    swingOrientation,
    type GripState,
    type HandLoad,
    type PreparedTrack,
    type Reach,
} from "../../../src/engine/impact/track";
import type { Coupling, Hands, HeadState, SwingArc } from "../../../src/engine/impact/types";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import { contactReference } from "../../../src/reference/index";
import { TEST_BALL } from "../support/fixtures";
import {
    NO_DIP,
    TEST_COUPLING,
    TEST_HANDS,
    TEST_HEAD,
    freeBall,
    isolated,
    levelArc,
    recorder,
    socketAt,
    trackDrive,
} from "../support/impact";

const R = TEST_BALL.radius;
const AIM = vec3(0.6, 0.8, 0);
const UP = vec3(0, 0, 1);

/** The test hands with an arm mass, so the integrator steps a swung body that is not the head. */
const ARMED: Hands = { ...TEST_HANDS, armMass: 0.8 };

/** The test coupling relaxing only after every run here: the whole run is before contact, the grips firm. */
const BEFORE: Coupling = { ...TEST_COUPLING, relaxAt: 1 };

const conj = (q: Quaternion): Quaternion => ({ w: q.w, x: -q.x, y: -q.y, z: -q.z });
const dist = (a: Vec3, b: Vec3): number => length(sub(a, b));

/** Rotation angle (rad) taking orientation b to a: twice the size of the vector part of a ⊗ conj(b). */
function angleBetween(a: Quaternion, b: Quaternion): number {
    const e = multiply(a, conj(b));
    return 2 * length(vec3(e.x, e.y, e.z));
}

/** A coasting swing, the face pitched 0.3 rad down at t = 0, the pivot still. */
const COAST: SwingArc = {
    pivot: vec3(2, 3, 1.5),
    pivotVelocity: ZERO,
    pivotAcceleration: ZERO,
    handStart: 0,
    handWindow: 0.01,
    aim: AIM,
    radius: 0.8,
    theta0: -0.3,
    omega0: 3.75,
    alpha: 0,
    arcStart: 0,
    window: 0.01,
    dip: NO_DIP,
    contactAt: 0,
    mode: "swing",
    handReach: 10,
    groundDepth: 0,
};

/** A power roll in carry mode, each action timed: the pendulum's window from 10 ms, the hands' from 20 ms, a dip. */
const TIMED: SwingArc = {
    ...COAST,
    pivotVelocity: scale(AIM, 2.5),
    pivotAcceleration: scale(AIM, 20),
    handStart: 0.02,
    handWindow: 0.03,
    theta0: -0.6,
    omega0: 0.5,
    alpha: 4,
    arcStart: 0.01,
    window: 0.03,
    dip: { start: 0.005, duration: 0.02, depth: 0.01 },
    mode: "carry",
};

/** A carry from contact: the pendulum's window short, no dip, a reach that binds and a descent to 2 mm deep. */
const CARRY: SwingArc = {
    ...TIMED,
    pivot: vec3(2, 3, 0.8),
    window: 0.01,
    dip: NO_DIP,
    handReach: 0.15,
    groundDepth: 0.002,
};

const prepare = (arc: SwingArc, coupling: Coupling = TEST_COUPLING, hands: Hands = TEST_HANDS): PreparedTrack =>
    prepareTrack(trackDrive(arc, coupling, hands), TEST_HEAD, STANDARD_GRAVITY);

/** A still, level swing for the test head centred at (0, 0, 1); `o` overrides. */
const still = (o: Partial<SwingArc> = {}): SwingArc => levelArc(vec3(0, 0, 1), o);

interface TrackingOptions {
    readonly coupling?: Coupling;
    readonly hands?: Hands;
    readonly dt?: number;
    /** Absent: the integrator's own cap, contactAt + TRACK_IMPACT_CAP (pre-flight D4.1). */
    readonly cap?: number;
}

/** The largest socket (m) and orientation (rad) errors from the path over an isolated run with no ball. */
function tracking(arc: SwingArc, o: TrackingOptions = {}) {
    const track = prepare(arc, o.coupling ?? BEFORE, o.hands ?? ARMED);
    let socket = 0;
    let angle = 0;
    const probe: ImpactProbe = {
        step(s) {
            const p = pathAt(track, s.t);
            socket = Math.max(socket, dist(socketAt(s.head, TEST_HEAD), p.socket));
            angle = Math.max(angle, angleBetween(p.orientation, s.head.orientation));
        },
    };
    const start = headOnPath(track, TEST_HEAD, 0);
    const run = integrate(isolated({ start, drive: track, gravity: STANDARD_GRAVITY }), {
        probe,
        ...(o.dt === undefined ? {} : { dt: o.dt }),
        ...(o.cap === undefined ? {} : { cap: o.cap }),
    });
    return { socket, angle, run };
}

describe("a tracked head with no ball", () => {
    it("reads its provisional coupling from the reference data", () => {
        expect(HAND_COUPLING).toEqual({
            period: contactReference.handCouplingPeriod.value,
            dampingRatio: contactReference.handCouplingDampingRatio.value,
        });
    });

    it("follows a coasting swing before contact, to the integrator's own error", () => {
        const { socket, angle } = tracking(COAST);
        // Drafting measured 1.71e-7 m and 1.15e-7 rad (pre-flight re-measures them).
        expect(socket).toBeLessThan(4e-7);
        expect(angle).toBeLessThan(3e-7);
    });

    it("follows a power roll's arcs and a timed dip before contact", () => {
        const { socket, angle } = tracking(TIMED);
        // Drafting measured 2.53e-6 m and 2.33e-6 rad, halving exactly at dt/2: the integrator's O(dt) error on the
        // dip's steps in acceleration (pre-flight D4.2; re-measured in pre-flight).
        expect(socket).toBeLessThan(5e-6);
        expect(angle).toBeLessThan(5e-6);
    });

    it("converges on a full check as the step shrinks: the residual is the integrator's", () => {
        const check: SwingArc = { ...COAST, alpha: -COAST.omega0 / COAST.window };
        // Before contact over 60 ms, and from contact in swing mode through the check's window. Drafting measured
        // ratios of 0.504 and 0.500: semi-implicit Euler's O(dt·a) lag.
        for (const o of [
            { coupling: BEFORE, cap: 0.06 },
            { coupling: TEST_COUPLING, cap: COAST.window },
        ]) {
            const coarse = tracking(check, { ...o, dt: 1e-5 });
            const fine = tracking(check, { ...o, dt: 5e-6 });
            expect(fine.socket).toBeLessThan(0.6 * coarse.socket);
            expect(fine.angle).toBeLessThan(0.6 * coarse.angle);
        }
    });

    it("checks a head the strike has slowed to rest with the path, at the window's end and never past it", () => {
        // User decision (2026-10-06): a check brakes the head to rest, not past it. A head pitching at half the path's
        // rate from contact gets half the planned deceleration, so it keeps half the path's rate and rests with it.
        const check: SwingArc = { ...COAST, alpha: -COAST.omega0 / COAST.window };
        const track = prepare(check, TEST_COUPLING, ARMED);
        const slowed = prepare({ ...check, omega0: check.omega0 / 2, alpha: 0 }, TEST_COUPLING, ARMED);
        let drift = 0;
        let lowest = Infinity;
        let last = Infinity;
        const probe: ImpactProbe = {
            step(s) {
                const rate = dot(s.head.angularVelocity, track.axis);
                const planned = dot(pathAt(track, s.t).angularVelocity, track.axis);
                if (planned > 0.1 * check.omega0) {
                    drift = Math.max(drift, Math.abs(rate / planned - 0.5));
                }
                lowest = Math.min(lowest, rate);
                last = rate;
            },
        };
        const start = headOnPath(slowed, TEST_HEAD, 0);
        integrate(isolated({ start, drive: track, gravity: STANDARD_GRAVITY }), { probe, cap: check.window });
        // Pre-flight measured a drift of 2.5e-4 in the share and a last (and lowest) rate of 1.13e-8 rad/s, from
        // 1.875 rad/s; the planned deceleration alone left it at −0.832 rad/s, past rest.
        expect(drift).toBeLessThan(5e-4);
        expect(lowest).toBeGreaterThanOrEqual(0);
        expect(Math.abs(last)).toBeLessThan(3e-8);
    });

    it("runs a whiff to TRACK_IMPACT_CAP after the planned contact", () => {
        for (const contactAt of [0, 0.02]) {
            const { run } = tracking({ ...COAST, contactAt }, { coupling: TEST_COUPLING });
            expect(run.events.map((e) => e.kind)).toEqual(["impact-cap"]);
            expect(run.duration).toBeGreaterThanOrEqual(contactAt + TRACK_IMPACT_CAP);
            expect(run.duration).toBeLessThan(contactAt + TRACK_IMPACT_CAP + 2 * IMPACT_DT);
        }
    });

    it("reports both hands' forces and their feed-forward, equal for a head on the path", () => {
        const track = prepare(COAST, BEFORE, ARMED);
        const probe = recorder();
        const start = headOnPath(track, TEST_HEAD, 0);
        integrate(isolated({ start, drive: track, gravity: STANDARD_GRAVITY }), { probe, cap: 1e-4 });
        const first = probe.snapshots[0] as ImpactSnapshot;
        const hand = first.hand as NonNullable<ImpactSnapshot["hand"]>;
        expect(dist(hand.force, hand.feedForward)).toBeLessThan(1e-9);
        expect(add(hand.top, hand.bottom)).toEqual(hand.force);
        expect(first.drive).toEqual(hand.force);
        const forced = recorder();
        integrate(isolated(), { probe: forced, cap: 1e-4 });
        expect(forced.snapshots[0]).not.toHaveProperty("hand");
    });
});

describe("a carry with firm grips", () => {
    const track = prepare(CARRY, TEST_COUPLING, ARMED);
    const reach = track.reach as Reach;

    it("follows the path from contact to the reach's end, the descent included", () => {
        expect(reach.descent).toBeGreaterThan(0.01);
        const { socket, angle } = tracking(CARRY, { coupling: TEST_COUPLING, cap: reach.tStop });
        // Drafting measured 2.76e-6 m and 5.58e-6 rad (pre-flight re-measures them).
        expect(socket).toBeLessThan(6e-6);
        expect(angle).toBeLessThan(1.2e-5);
    });

    it("holds the slope: the head's pitch stays on the path's held θ to the reach's end", () => {
        const pitchOf = (q: Quaternion): number => {
            const s = rotate(q, UP);
            return Math.atan2(-dot(s, AIM), s.z);
        };
        let worst = 0;
        const probe: ImpactProbe = {
            step(s) {
                if (s.t >= CARRY.arcStart + 2 * CARRY.window) {
                    const lag = pitchOf(s.head.orientation) - pitchOf(pathAt(track, s.t).orientation);
                    worst = Math.max(worst, Math.abs(lag));
                }
            },
        };
        const start = headOnPath(track, TEST_HEAD, 0);
        integrate(isolated({ start, drive: track, gravity: STANDARD_GRAVITY }), { probe, cap: reach.tStop });
        // Within the tracking bound above; drafting measured 5.58e-6 rad.
        expect(worst).toBeLessThan(1.2e-5);
    });
});

/** A damped oscillator from x(0) = x0 at rest, settling to 0. */
function oscillator(x0: number, omega: number, zeta: number, t: number): number {
    const root = Math.sqrt(1 - zeta * zeta);
    const wd = omega * root;
    return x0 * Math.exp(-zeta * omega * t) * (Math.cos(wd * t) + (zeta / root) * Math.sin(wd * t));
}

describe("the hands along the shaft", () => {
    it("return a head lifted 1 mm along the shaft before contact as the damped oscillator of period T", () => {
        // Along the vertical shaft only the top hand's spring and damper act, on the swung body's mass M.
        const track = prepare(still(), BEFORE, ARMED);
        const start = headOnPath(track, TEST_HEAD, 0);
        const lifted = { ...start, position: add(start.position, vec3(0, 0, 1e-3)) };
        const omega = (2 * Math.PI) / BEFORE.period;
        let worst = 0;
        let sideways = 0;
        const probe: ImpactProbe = {
            step(s) {
                const d = sub(socketAt(s.head, TEST_HEAD), pathAt(track, s.t).socket);
                worst = Math.max(worst, Math.abs(d.z - oscillator(1e-3, omega, BEFORE.dampingRatio, s.t)));
                sideways = Math.max(sideways, Math.hypot(d.x, d.y));
            },
        };
        integrate(isolated({ start: lifted, drive: track, gravity: STANDARD_GRAVITY }), { probe, cap: 0.06 });
        // Design §8.1: within 1 % of the amplitude. Drafting measured 2.9e-4 of it.
        expect(worst).toBeLessThan(0.01 * 1e-3);
        expect(sideways).toBeLessThan(1e-12);
    });

    it("let a relaxed top hand sink the head at (1 − γ_T)·m·g/c(γ_T), with no turf", () => {
        // Swing mode from contact, a still level path: the top hand carries γ_T of the weight and damps the rest.
        const track = prepare(still(), TEST_COUPLING, { ...ARMED, gripTension: 0.1 });
        const c = track.top.damping;
        const terminal = ((1 - 0.1) * TEST_HEAD.mass * STANDARD_GRAVITY) / c;
        let worst = 0;
        let spin = 0;
        const probe: ImpactProbe = {
            step(s) {
                const expected = -terminal * (1 - Math.exp((-c * s.t) / track.body.mass));
                worst = Math.max(worst, Math.abs(s.head.velocity.z - expected));
                spin = Math.max(spin, length(s.head.angularVelocity));
            },
        };
        const start = headOnPath(track, TEST_HEAD, 0);
        const run = integrate(isolated({ start, drive: track, gravity: STANDARD_GRAVITY }), { probe });
        // Semi-implicit Euler's error on v' = −(c/M)·v − (1 − γ_T)·m·g/M peaks near (c·dt/M)/2·e⁻¹ of the terminal
        // rate, 6.4e-5 here; drafting measured 6.4e-5. The bound is about 3× that analytic estimate.
        expect(worst).toBeLessThan(2e-4 * terminal);
        expect(run.head.velocity.z).toBeCloseTo(-terminal, 5);
        expect(spin).toBe(0);
    });
});

/** The rigid-path wrench of design §3.3 at t: F_ff, and τ_ff about the swung body's centre. */
function rigidWrench(track: PreparedTrack, t: number): { readonly force: Vec3; readonly torque: Vec3 } {
    const p = pathAt(track, t);
    const { body } = track;
    const w = p.angularVelocity;
    const d = rotate(p.orientation, sub(vec3(0, 0, body.offset), TEST_HEAD.socket));
    const centre = add(add(p.socketAcceleration, cross(p.angularAcceleration, d)), cross(w, cross(w, d)));
    const weight = vec3(0, 0, TEST_HEAD.mass * STANDARD_GRAVITY);
    const I = body.inertia;
    const wb = rotateInverse(p.orientation, w);
    const ab = rotateInverse(p.orientation, p.angularAcceleration);
    const spin = add(vec3(I.x * ab.x, I.y * ab.y, I.z * ab.z), cross(wb, vec3(I.x * wb.x, I.y * wb.y, I.z * wb.z)));
    const head = scale(rotate(p.orientation, UP), -body.offset);
    return {
        force: add(scale(centre, body.mass), weight),
        torque: add(rotate(p.orientation, spin), cross(head, weight)),
    };
}

/** The hand load on a head on the path at t, with a fresh grip state unless one is given. */
function loadOnPath(track: PreparedTrack, t: number, grip: GripState = newGripState()): HandLoad {
    return handLoad(track, headOnPath(track, TEST_HEAD, t), TEST_HEAD, t, grip);
}

/** The dip's force M·a_d at t. */
const dipForce = (track: PreparedTrack, t: number): Vec3 => scale(pathAt(track, t).dipAcceleration, track.body.mass);

describe("the feed-forward split", () => {
    it("sums both hands' shares and the couple to F_ff and τ_ff before contact", () => {
        const track = prepare(TIMED, BEFORE, ARMED);
        for (const t of [0.003, 0.012, 0.03]) {
            const load = loadOnPath(track, t);
            const { force, torque } = rigidWrench(track, t);
            // The torque about the swung body's centre, δ·s above the head's.
            const lever = scale(rotate(headOnPath(track, TEST_HEAD, t).orientation, UP), track.body.offset);
            expect(dist(load.force, force), `force at ${t}`).toBeLessThan(1e-9);
            expect(dist(load.feedForward, force), `feed-forward at ${t}`).toBeLessThan(1e-9);
            expect(dist(sub(load.torque, cross(lever, load.force)), torque), `torque at ${t}`).toBeLessThan(1e-9);
        }
    });

    it("from contact feeds the top hand γ_T of its share plus the dip in full, in carry mode", () => {
        const t = 0.009;
        const track = prepare(TIMED, TEST_COUPLING, ARMED);
        const firm = loadOnPath(track, t);
        const soft = loadOnPath(prepare(TIMED, TEST_COUPLING, { ...ARMED, gripTension: 0.1 }), t);
        const dip = dipForce(track, t);
        expect(length(dip)).toBeGreaterThan(100);
        expect(dist(add(firm.top, firm.bottom), rigidWrench(track, t).force)).toBeLessThan(1e-9);
        expect(dist(sub(soft.top, dip), scale(sub(firm.top, dip), 0.1))).toBeLessThan(1e-9);
        expect(length(firm.bottom)).toBeGreaterThan(1);
    });

    it("feeds the top hand the whole F_s in swing mode outside a check", () => {
        const arc: SwingArc = { ...TIMED, mode: "swing" };
        const t = 0.009;
        const track = prepare(arc, TEST_COUPLING, ARMED);
        const { force } = rigidWrench(track, t);
        const dip = dipForce(track, t);
        for (const gripTension of [0.1, 1]) {
            const load = loadOnPath(prepare(arc, TEST_COUPLING, { ...ARMED, gripTension }), t);
            const expected = add(scale(sub(force, dip), gripTension), dip);
            expect(dist(load.top, expected), `γ_T ${gripTension}`).toBeLessThan(1e-9);
            expect(length(load.bottom), `γ_T ${gripTension}`).toBeLessThan(1e-9);
        }
    });

    it("splits F_s over both hands inside a check, the top hand's share scaled by γ_T", () => {
        const arc: SwingArc = { ...TIMED, mode: "swing", alpha: -4 };
        const t = 0.012;
        const track = prepare(arc, TEST_COUPLING, ARMED);
        const firm = loadOnPath(track, t);
        const soft = loadOnPath(prepare(arc, TEST_COUPLING, { ...ARMED, gripTension: 0.1 }), t);
        const dip = dipForce(track, t);
        expect(dist(add(firm.top, firm.bottom), rigidWrench(track, t).force)).toBeLessThan(1e-9);
        expect(dist(sub(soft.top, dip), scale(sub(firm.top, dip), 0.1))).toBeLessThan(1e-9);
        expect(length(firm.bottom)).toBeGreaterThan(1);
    });

    it("keeps the top hand's share after the bottom hand's release, and drops the bottom hand's", () => {
        const track = prepare(TIMED, TEST_COUPLING, ARMED);
        const t = 0.009;
        const held = loadOnPath(track, t);
        const open: GripState = { contactPitch: TIMED.theta0, releasedAt: 0, releaseDelta: 0.1 };
        const released = loadOnPath(track, t, open);
        expect(dist(released.top, held.top)).toBeLessThan(1e-9);
        expect(length(released.bottom)).toBeLessThan(1e-9);
        expect(dist(released.feedForward, released.top)).toBeLessThan(1e-9);
    });
});

/** The unit vector e: perpendicular to the head's shaft in the swing plane, forward. */
function forwardOf(head: HeadState, aim: Vec3): Vec3 {
    const s = rotate(head.orientation, UP);
    const raw = sub(aim, scale(s, dot(aim, s)));
    return scale(raw, 1 / length(raw));
}

describe("the bottom hand's rate guide", () => {
    const lever = 0.8 - TEST_HANDS.bottom;

    /** A head on the path at t, its pitch rate `extra` faster than the path's. */
    function spun(track: PreparedTrack, t: number, extra: number): HeadState {
        const head = headOnPath(track, TEST_HEAD, t);
        return { ...head, angularVelocity: add(head.angularVelocity, scale(track.axis, extra)) };
    }

    it("never pulls outside a check, and is zero while the shaft turns at least as fast as the path", () => {
        const track = prepare(still(), TEST_COUPLING, TEST_HANDS);
        const t = 0.02;
        for (const extra of [0, 0.5]) {
            const load = handLoad(track, spun(track, t, extra), TEST_HEAD, t, newGripState());
            expect(length(load.bottom), `extra ${extra}`).toBe(0);
        }
        const lagging = spun(track, t, -0.5);
        const load = handLoad(track, lagging, TEST_HEAD, t, newGripState());
        const e = forwardOf(lagging, track.arc.aim);
        expect(dot(load.bottom, e)).toBeCloseTo(track.bottom.damping * 0.5 * lever, 9);
        expect(length(sub(load.bottom, scale(e, dot(load.bottom, e))))).toBeLessThan(1e-12);
    });

    it("acts both ways inside a check and carries g_B·F_B", () => {
        const arc = still({ omega0: 3, alpha: -300 });
        const t = 0.005;
        const track = prepare(arc, TEST_COUPLING, TEST_HANDS);
        const light = prepare(arc, TEST_COUPLING, { ...TEST_HANDS, bottomGrip: 0.25 });
        const on = loadOnPath(track, t);
        expect(length(on.bottom)).toBeGreaterThan(1);
        expect(dist(loadOnPath(light, t).bottom, scale(on.bottom, 0.25))).toBeLessThan(1e-9);
        const leading = spun(track, t, 0.5);
        const fast = handLoad(track, leading, TEST_HEAD, t, newGripState());
        const e = forwardOf(leading, arc.aim);
        expect(dot(sub(fast.bottom, on.bottom), e)).toBeCloseTo(-track.bottom.damping * 0.5 * lever, 6);
    });

    it("inside a check gives a slowed head its share of the planned deceleration, and returns one past rest", () => {
        // User decision (2026-10-06): a check brakes the head to rest, not past it (design §3.3).
        const arc = still({ omega0: 3, alpha: -300 });
        const t = 0.005;
        const track = prepare(arc, TEST_COUPLING, TEST_HANDS);
        const planned = dot(pathAt(track, t).angularVelocity, track.axis);
        const at = (share: number): HandLoad =>
            handLoad(track, spun(track, t, (share - 1) * planned), TEST_HEAD, t, newGripState());
        const [rest, half, full] = [at(0), at(0.5), at(1)];
        // Between rest and the path's rate the deceleration is in proportion and the guide neither pushes nor pulls.
        expect(length(sub(full.feedForward, rest.feedForward))).toBeGreaterThan(1);
        expect(dist(half.feedForward, scale(add(rest.feedForward, full.feedForward), 0.5))).toBeLessThan(1e-9);
        expect(dist(half.bottom, scale(add(rest.bottom, full.bottom), 0.5))).toBeLessThan(1e-9);
        // Past rest none of it, and the guide returns the head towards rest.
        const behind = spun(track, t, -1.2 * planned);
        const back = handLoad(track, behind, TEST_HEAD, t, newGripState());
        expect(dist(back.feedForward, rest.feedForward)).toBeLessThan(1e-9);
        const push = dot(sub(back.bottom, rest.bottom), forwardOf(behind, arc.aim));
        expect(push).toBeCloseTo(track.bottom.damping * 0.2 * planned * lever, 6);
    });

    it("scales the push by guideEffort outside a check and after the release, and leaves a check in full", () => {
        const withEffort = (guideEffort: number): Hands => ({ ...TEST_HANDS, guideEffort });
        const t = 0.02;
        const guided = (guideEffort: number): Vec3 => {
            const track = prepare(still(), TEST_COUPLING, withEffort(guideEffort));
            return handLoad(track, spun(track, t, -0.5), TEST_HEAD, t, newGripState()).bottom;
        };
        expect(length(guided(1))).toBeGreaterThan(0);
        expect(length(guided(0))).toBe(0);
        expect(dist(guided(0.5), scale(guided(1), 0.5))).toBeLessThan(1e-12);
        const released = (guideEffort: number): Vec3 => {
            const track = prepare(still(), TEST_COUPLING, withEffort(guideEffort));
            const head = headOnPath(track, TEST_HEAD, t);
            const slow = { ...head, velocity: sub(head.velocity, vec3(0.5, 0, 0)) };
            const open: GripState = { contactPitch: 0, releasedAt: 1e-3, releaseDelta: 0.08 };
            return handLoad(track, slow, TEST_HEAD, t, open).bottom;
        };
        expect(length(released(1))).toBeGreaterThan(0);
        expect(length(released(0))).toBe(0);
        expect(dist(released(0.5), scale(released(1), 0.5))).toBeLessThan(1e-12);
        const check = still({ omega0: 3, alpha: -300 });
        const checked = (guideEffort: number): Vec3 => {
            const track = prepare(check, TEST_COUPLING, withEffort(guideEffort));
            return handLoad(track, spun(track, 0.005, 0.5), TEST_HEAD, 0.005, newGripState()).bottom;
        };
        expect(length(checked(1))).toBeGreaterThan(1);
        expect(checked(0)).toEqual(checked(1));
    });
});

describe("a shaft along the aim", () => {
    it("has no defined forward, so the bottom hand's load stays finite", () => {
        const path = prepare(still(), TEST_COUPLING, TEST_HANDS);
        const t = 0.02;
        // An upright head under a vertical aim: the shaft is exactly along it, so the swing plane's forward is 0 / 0.
        const track: PreparedTrack = { ...path, arc: { ...path.arc, aim: UP } };
        const head: HeadState = { ...headOnPath(path, TEST_HEAD, t), orientation: { w: 1, x: 0, y: 0, z: 0 } };
        const load = handLoad(track, head, TEST_HEAD, t, newGripState());
        for (const v of [load.force, load.torque, load.top, load.bottom]) {
            expect(Number.isFinite(v.x + v.y + v.z)).toBe(true);
        }
    });
});

describe("release by reach", () => {
    const track = prepare(still(), TEST_COUPLING, TEST_HANDS);
    const lever = 0.8 - TEST_HANDS.bottom;

    /** The test head turned rigidly about the still pivot through `turn`, moving at `velocity`. */
    function turned(turn: number, velocity: Vec3 = ZERO): HeadState {
        const orientation = swingOrientation(track.arc.aim, turn);
        const s = rotate(orientation, UP);
        const position = sub(track.arc.pivot, scale(s, track.arc.radius + TEST_HEAD.socket.z));
        return { position, orientation, velocity, angularVelocity: ZERO };
    }

    it("opens the bottom hand once the shaft has turned through the slack, recording when and how far", () => {
        const grip = newGripState();
        handLoad(track, turned(0), TEST_HEAD, 0, grip);
        handLoad(track, turned((TEST_HANDS.reachSlack - 1e-3) / lever), TEST_HEAD, 1e-3, grip);
        expect(grip.releasedAt).toBeNull();
        const turn = (TEST_HANDS.reachSlack + 1e-3) / lever;
        handLoad(track, turned(turn), TEST_HEAD, 2e-3, grip);
        expect(grip.releasedAt).toBe(2e-3);
        expect(grip.releaseDelta).toBeCloseTo(turn, 12);
    });

    it("then pushes only forward along e on its velocity lag, with no feed-forward and no couple", () => {
        const grip: GripState = { contactPitch: 0, releasedAt: 1e-3, releaseDelta: 0.08 };
        const turn = 0.08;
        const e = forwardOf(turned(turn), track.arc.aim);
        const resting = handLoad(track, turned(turn), TEST_HEAD, 2e-3, grip);
        expect(length(resting.bottom)).toBe(0);
        expect(dot(resting.torque, rotate(turned(turn).orientation, UP))).toBeCloseTo(0, 12);
        const pushing = handLoad(track, turned(turn, scale(e, -0.5)), TEST_HEAD, 2e-3, grip);
        expect(dot(pushing.bottom, e)).toBeCloseTo(track.bottom.damping * 0.5, 9);
        expect(length(sub(pushing.bottom, scale(e, dot(pushing.bottom, e))))).toBeLessThan(1e-12);
        const ahead = handLoad(track, turned(turn, scale(e, 0.5)), TEST_HEAD, 2e-3, grip);
        expect(length(ahead.bottom)).toBe(0);
    });

    it("records the release in the run, and none for a force table or a shaft that never turns", () => {
        const omega0 = 3 / 0.832;
        const swing = prepare(still({ omega0 }), TEST_COUPLING, TEST_HANDS);
        const start = headOnPath(swing, TEST_HEAD, 0);
        const run = integrate(isolated({ start, drive: swing, gravity: STANDARD_GRAVITY }));
        const release = run.release as { t: number; deltaTheta: number };
        // It opens within one step's turn of the slack; drafting measured it 3.3e-6 m over at t = 20.82 ms.
        const over = lever * release.deltaTheta - TEST_HANDS.reachSlack;
        expect(over).toBeGreaterThan(0);
        expect(over).toBeLessThan(omega0 * IMPACT_DT * lever);
        const rest = headOnPath(track, TEST_HEAD, 0);
        const resting = integrate(isolated({ start: rest, drive: track, gravity: STANDARD_GRAVITY }));
        expect(resting).not.toHaveProperty("release");
        expect(integrate(isolated(), { cap: 1e-4 })).not.toHaveProperty("release");
    });
});

describe("the tracked end rule", () => {
    const BALL = vec3(0, 0, 1);
    const START = vec3(BALL.x - R - 1e-6 - TEST_HEAD.length / 2, 0, BALL.z);
    const RED = vec3(BALL.x + 2 * R, 0, BALL.z);

    /** A level 3 m/s swing (gravity off) into the balls, its face 1 µm short of the ball at BALL. */
    function strikeRun(balls: ImpactBall[], cap?: number) {
        const arc = levelArc(START, { omega0: 3 / (0.8 + TEST_HEAD.socket.z) });
        const track = prepareTrack(trackDrive(arc), TEST_HEAD, 0);
        const probe = recorder();
        const setup = isolated({ start: headOnPath(track, TEST_HEAD, 0), drive: track, balls });
        const run = integrate(setup, { probe, ...(cap === undefined ? {} : { cap }) });
        return { arc, track, run, probe };
    }

    /** True while the front face would reach the ball within LOOK_AHEAD (design §3.5), as the snapshot stands. */
    function reaching(track: PreparedTrack, s: ImpactSnapshot): boolean {
        const p = pathAt(track, s.t);
        const onPath = add(
            p.socketVelocity,
            cross(p.angularVelocity, rotate(p.orientation, scale(TEST_HEAD.socket, -1))),
        );
        const f = rotate(s.head.orientation, vec3(1, 0, 0));
        const ball = s.balls[0] as (typeof s.balls)[number];
        const offset = sub(ball.position, add(s.head.position, scale(f, TEST_HEAD.length / 2)));
        const d = dot(offset, f);
        const ahead = d > 0 && length(sub(offset, scale(f, d))) < TEST_HEAD.radius + R;
        const closing = Math.max(dot(s.head.velocity, f), dot(onPath, f)) - dot(ball.velocity, f);
        return ahead && closing > 0 && d - R < closing * LOOK_AHEAD;
    }

    it("ends a clean single-ball strike within RELEASE_STEPS of the window's end or the look-ahead clearing", () => {
        const { arc, track, run, probe } = strikeRun([freeBall("blue", BALL)]);
        expect(run.timeline["face/blue"] ?? []).toHaveLength(1);
        const clear = Math.max(0, ...probe.snapshots.filter((s) => reaching(track, s)).map((s) => s.t));
        // Drafting: the look-ahead clears at 0.41 ms and the impact ends at the window's end, 10 ms.
        const settled = Math.max(arc.arcStart + arc.window, clear);
        expect(run.duration).toBeGreaterThanOrEqual(settled);
        expect(run.duration).toBeLessThanOrEqual(settled + (RELEASE_STEPS + 1) * IMPACT_DT);
        expect(run.events).toEqual([]);
    });

    it("integrates a straight croquet drive's re-contact rather than flagging it", () => {
        const { run } = strikeRun([freeBall("blue", BALL), freeBall("red", RED)]);
        // Drafting: five face–blue intervals, the second from 1.1 ms, the last a maintained push until the face,
        // pitching up with the gravity-free swing, leaves blue (impact-off-face at 74 ms); the impact ends at 120.5 ms.
        expect((run.timeline["face/blue"] ?? []).length).toBeGreaterThanOrEqual(2);
        const kinds = run.events.map((e) => e.kind);
        expect(kinds).not.toContain("impact-head-approaching");
        expect(kinds).not.toContain("impact-cap");
    });

    it("keeps running while the head closes on a ball, and flags it if the cap comes first", () => {
        // At 2.5 ms the head, slowed below blue by the strike, is closing on it again (drafting: 2.34–3.17 ms).
        const { run } = strikeRun([freeBall("blue", BALL), freeBall("red", RED)], 2.5e-3);
        expect(run.events.map((e) => e.kind)).toEqual(["impact-cap", "impact-head-approaching"]);
    });
});
