import { describe, expect, it } from "vitest";
import { ZERO, add, cross, dot, length, scale, sub, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import {
    FOLLOW_CAP,
    IMPACT_DT,
    LOOK_AHEAD,
    RELEASE_STEPS,
    TRACK_IMPACT_CAP,
    integrate,
    integrateStroke,
    type ImpactBall,
    type ImpactProbe,
    type ImpactSnapshot,
    type StrokeState,
} from "../../../src/engine/impact/integrate";
import { axisAngle, multiply, rotate, rotateInverse, type Quaternion } from "../../../src/engine/impact/rigidBody";
import {
    HAND_CHAIN,
    HAND_COUPLING,
    advanceChains,
    chainForces,
    handLoad,
    headOnPath,
    newGripState,
    pathAt,
    prepareTrack,
    pushResponse,
    senseResistance,
    swingOrientation,
    swungOf,
    type ArmChain,
    type ArmChainState,
    type ChainMass,
    type GripState,
    type HandLoad,
    type PreparedTrack,
    type Push,
    type SwungBody,
} from "../../../src/engine/impact/track";
import { exp } from "../../../src/engine/math/elementary";
import type { Coupling, HandChain, Hands, HeadState, SwingArc } from "../../../src/engine/impact/types";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import { contactReference } from "../../../src/reference/index";
import { lawFromStiffness } from "../../../src/engine/impact/contactLaw";
import { TEST_BALL, TEST_TURF } from "../support/fixtures";
import {
    NO_DIP,
    TEST_CHAIN,
    TEST_COUPLING,
    TEST_FLEX,
    TEST_HANDS,
    TEST_HEAD,
    TEST_PENDULUM_FORCE,
    TEST_PUSH_FORCE,
    TEST_PUSH_RESPONSE_TIME,
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

/** The shaft's lean about the pitch axis (rad, forward positive), −θ for a head on a +x aim. */
const leanOf = (head: HeadState): number => {
    const s = rotate(head.orientation, UP);
    return Math.atan2(s.x, s.z);
};

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
    pendulumAt: 0.8,
    pendulumEffort: 0,
    handArcRadius: 11,
    handArcLow: 0.5,
};

/**
 * A power roll in carry mode, each action timed: the pendulum's window from 10 ms, the hands' from 20 ms, a dip. Its
 * hands arrive on their 11 m arc, lowest 5 m on, descending at its slope −5/√(11² − 5²) (P2b.2b.2b.2b design §4.1).
 */
const TIMED: SwingArc = {
    ...COAST,
    pivotVelocity: add(scale(AIM, 2.5), vec3(0, 0, (-2.5 * 5) / Math.sqrt(11 * 11 - 5 * 5))),
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
        // dip's steps in acceleration (pre-flight D4.2; re-measured in pre-flight). P2b.2b.2b.2b: fast impedance (was
        // 5e-6 rad): a carry's swung body is now the head alone, ARMED's arm mass replaced by the hand masses from the
        // flex's start, and the lighter body tracks to 3.71e-6 m and 5.18e-6 rad, still halving exactly at dt/2.
        // P2b.2b.2b.2b: arm chain (was 3.71e-6 m and 5.18e-6 rad): the carry's body is the head and both hands' skin,
        // 3.63e-6 m and 4.97e-6 rad, halving exactly at dt/2.
        expect(socket).toBeLessThan(5e-6);
        expect(angle).toBeLessThan(6e-6);
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
            const open: GripState = {
                contactPitch: 0,
                releasedAt: 1e-3,
                releaseDelta: 0.08,
                flex: null,
                topStiffness: 0,
                bottomStiffness: 0,
                vertical: false,
                rising: false,
                resistance: 0,
                topChain: null,
                bottomChain: null,
            };
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
        const grip: GripState = {
            contactPitch: 0,
            releasedAt: 1e-3,
            releaseDelta: 0.08,
            flex: null,
            topStiffness: 0,
            bottomStiffness: 0,
            vertical: false,
            rising: false,
            resistance: 0,
            topChain: null,
            bottomChain: null,
        };
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
        // P2b.2b.2b.2a: Hertzian face (was five face–blue intervals, the second from 1.1 ms, the last a maintained push
        // until the face, pitching up with the gravity-free swing, left blue: impact-off-face at 74 ms; the impact
        // ended at 120.5 ms): three face–blue intervals, from 0.005, 18.65 and 44.29 ms, no event, and the impact
        // ends at 115.66 ms.
        expect((run.timeline["face/blue"] ?? []).length).toBeGreaterThanOrEqual(2);
        const kinds = run.events.map((e) => e.kind);
        expect(kinds).not.toContain("impact-head-approaching");
        expect(kinds).not.toContain("impact-cap");
    });

    it("keeps running while the head closes on a ball, and flags it if the cap comes first", () => {
        // At 12 ms the head, slowed below blue by the strike, is closing on it again. P2b.2b.2b.2a: Hertzian face (was
        // 2.5 ms, closing 2.34–3.17 ms): the face's longer contact holds blue through its transfer to red, so the old
        // re-catch at 1.1 ms is now part of the first interval, and the head next closes 9.27–19.31 ms.
        const { run } = strikeRun([freeBall("blue", BALL), freeBall("red", RED)], 12e-3);
        expect(run.events.map((e) => e.kind)).toEqual(["impact-cap", "impact-head-approaching"]);
    });
});

describe("the flex (P2b.2b.2b.2b design §3.1, §7.1)", () => {
    /** A still carry in a vertical swing plane: the hands never travel, so no pendulum phase. */
    const STILL = (o: Partial<SwingArc> = {}): SwingArc =>
        still({ mode: "carry", handReach: 0.1, pendulumAt: 1, ...o });
    const prepareAt = (arc: SwingArc, gravity: number, hands: Hands = TEST_HANDS): PreparedTrack =>
        prepareTrack(trackDrive(arc, TEST_COUPLING, hands), TEST_HEAD, gravity);

    it("stiffens each hand by κ times its feed-forward: the top hand holds the weight, the bottom none", () => {
        // A vertical shaft at rest: F_ff is the weight, all along the shaft, so the top hand carries it and the bottom
        // hand's share is zero. Each arm also holds up its whole hand–arm chain's weight (gate round 3: the chain).
        const track = prepareAt(STILL(), STANDARD_GRAVITY);
        const grip = newGripState();
        handLoad(track, headOnPath(track, TEST_HEAD, 0), TEST_HEAD, 0, grip);
        const c = TEST_CHAIN;
        const chain =
            (c.forearmMass + c.handMass + c.fingerMass + c.palmSkinMass + c.fingerSkinMass) * STANDARD_GRAVITY;
        expect(grip.topStiffness).toBeCloseTo(
            TEST_FLEX.stiffness + TEST_FLEX.stiffnessPerForce * (STANDARD_GRAVITY + chain),
            9,
        );
        expect(grip.bottomStiffness).toBeCloseTo(TEST_FLEX.stiffness + TEST_FLEX.stiffnessPerForce * chain, 9);
    });

    it("rings a head moving along the shaft as the damped oscillator of both grips' springs", () => {
        // Along a vertical shaft both grips' springs (2·k₀, no gravity, no feed-forward) act on the swung body M (the
        // head and both hands' skin) and both chains' moving masses, which the chains' elements hold to it, with both
        // dampers: ω = √(2k₀/M'), ζ = c/√(2k₀·M') = ζ_arm·√(2·m_arm/M'), M' = M + 2·(m₀ + m₁ + m₂). Chains 100 times
        // stiffer keep their own modes out of the slow one.
        const c = TEST_CHAIN;
        const chain: HandChain = {
            ...c,
            wristStiffness: 100 * c.wristStiffness,
            knuckleStiffness: 100 * c.knuckleStiffness,
            palmStiffness: 100 * c.palmStiffness,
            fingerStiffness: 100 * c.fingerStiffness,
        };
        const stiff: Hands = { ...TEST_HANDS, chain };
        const track = prepareAt(STILL(), 0, stiff);
        const start = headOnPath(track, TEST_HEAD, 0);
        const v0 = 0.01;
        const moving = { ...start, velocity: vec3(0, 0, v0) };
        const carried = track.body.mass + 2 * (c.forearmMass + c.handMass + c.fingerMass);
        const omega = Math.sqrt((2 * TEST_FLEX.stiffness) / carried);
        const zeta = TEST_FLEX.dampingRatio * Math.sqrt((2 * TEST_FLEX.endpointMass) / carried);
        const wd = omega * Math.sqrt(1 - zeta * zeta);
        let worst = 0;
        const probe: ImpactProbe = {
            step(s) {
                const x = s.head.position.z - start.position.z;
                const expected = (v0 / wd) * Math.exp(-zeta * omega * s.t) * Math.sin(wd * s.t);
                worst = Math.max(worst, Math.abs(x - expected));
            },
        };
        integrate(isolated({ start: moving, drive: track, gravity: 0 }), { probe, cap: 0.6 });
        expect(worst).toBeLessThan(0.01 * (v0 / omega));
    });

    it("resists a sudden small pitch with (K3 + K4)·(r_top² + r_bot²): the angle hold from the two grips", () => {
        // No gravity and a still path: F_ff is zero. A turn δθ about the head's centre, too sudden for the chains to
        // follow, moves each grip r·δθ against its palm's and fingers' springs and costs a moment (K3 + K4)·r² δθ
        // about the pitch axis (gate round 3: the hand–arm chain; was the flex's k₀·r² before the hand masses).
        const track = prepareAt(STILL({ theta0: -0.5 }), 0);
        const grip = newGripState();
        const on = headOnPath(track, TEST_HEAD, 0);
        handLoad(track, on, TEST_HEAD, 0, grip);
        const turn = 1e-5;
        const turned = { ...on, orientation: multiply(axisAngle(track.axis, turn), on.orientation) };
        const load = handLoad(track, turned, TEST_HEAD, 0, grip);
        const rTop = TEST_HEAD.socket.z + track.arc.radius;
        const rBottom = TEST_HEAD.socket.z + TEST_HANDS.bottom;
        const grips = TEST_CHAIN.palmStiffness + TEST_CHAIN.fingerStiffness;
        const expected = 0 - grips * (rTop * rTop + rBottom * rBottom) * turn;
        expect(Math.abs(dot(load.torque, track.axis) / expected - 1)).toBeLessThan(0.01);
    });

    it("has no runaway: a head held off its intended point by d or 10·d feels exactly ten times the spring", () => {
        const track = prepareAt(STILL(), STANDARD_GRAVITY);
        const grip = newGripState();
        const on = headOnPath(track, TEST_HEAD, 0);
        const fed = handLoad(track, on, TEST_HEAD, 0, grip).force;
        const shifted = (d: number): Vec3 =>
            sub(handLoad(track, { ...on, position: add(on.position, vec3(d, 0, 0)) }, TEST_HEAD, 0, grip).force, fed);
        expect(shifted(1e-2).x).toBeCloseTo(10 * shifted(1e-3).x, 9);
    });

    it("pushes no harder along aim than its springs and dampers once the push has stopped: no brake", () => {
        // Design §7.1: the intended path stops at once, so past the push's end and the pendulum's held slope the
        // planned acceleration is zero and the feed-forward has no deceleration term along aim.
        const arc = STILL({ pivotVelocity: vec3(1, 0, 0), handReach: 0.05, window: 0.005, handWindow: 0.005 });
        const track = prepareAt(arc, 0);
        const end = (track.push as Push).end as number;
        const grip = newGripState();
        for (const t of [end + 0.02, end + 0.05]) {
            const load = handLoad(track, headOnPath(track, TEST_HEAD, t), TEST_HEAD, t, grip);
            expect(Math.abs(dot(load.feedForward, arc.aim))).toBeLessThan(1e-9);
        }
    });
});

describe("the push intent (P2b.2b.2b.2b gate ruling 2026-10-11)", () => {
    /** A still carry in a vertical swing plane: the hands never travel, so the push never ends. */
    const PUSHING = (o: Partial<SwingArc> = {}): SwingArc =>
        still({ mode: "carry", handReach: 0.1, pendulumAt: 1, ...o });
    const prepareAt = (arc: SwingArc, gravity: number): PreparedTrack =>
        prepareTrack(trackDrive(arc, TEST_COUPLING, TEST_HANDS), TEST_HEAD, gravity);
    /** A fresh grip state holding the balls' resistance `R` (N) from the last step. */
    const resisted = (R: number): GripState => ({ ...newGripState(), resistance: R });

    it("adds min(R, F_push) along aim to the feed-forward, shared over both hands, during the push", () => {
        // A vertical shaft at rest on the path: the grips sit on their intended points and move with them, so each
        // hand's force is its feed-forward share. P along aim is perpendicular to the shaft and carries no moment
        // about the swung body's centre, so the sharing rule puts −P·b/(a − b) on the top hand and P·a/(a − b) on the
        // bottom, a and b the grips' distances from that centre (δ above the head's, the hands' skin in a carry's
        // body).
        const track = prepareAt(PUSHING(), STANDARD_GRAVITY);
        const t = 0.002;
        const on = headOnPath(track, TEST_HEAD, t);
        const grip0 = resisted(0);
        const plain = handLoad(track, on, TEST_HEAD, t, grip0);
        const a = TEST_HEAD.socket.z + track.arc.radius - track.body.offset;
        const b = TEST_HEAD.socket.z + TEST_HANDS.bottom - track.body.offset;
        for (const [R, P] of [
            [30, 30],
            [TEST_PUSH_FORCE, TEST_PUSH_FORCE],
            [250, TEST_PUSH_FORCE],
        ] as const) {
            const grip = resisted(R);
            const load = handLoad(track, on, TEST_HEAD, t, grip);
            expect(dist(sub(load.feedForward, plain.feedForward), scale(track.arc.aim, P)), `R ${R}`).toBeLessThan(
                1e-9,
            );
            expect(dist(sub(load.force, plain.force), scale(track.arc.aim, P)), `R ${R}`).toBeLessThan(1e-9);
            const topShare = scale(track.arc.aim, (0 - P * b) / (a - b));
            const bottomShare = scale(track.arc.aim, (P * a) / (a - b));
            expect(dist(sub(load.top, plain.top), topShare), `R ${R}`).toBeLessThan(1e-9);
            expect(dist(sub(load.bottom, plain.bottom), bottomShare), `R ${R}`).toBeLessThan(1e-9);
            // Each hand's stiffness follows its larger share: k = k₀ + κ·|F_ff,h|, F_ff,h with its chain's weight.
            const c = TEST_CHAIN;
            const all = c.forearmMass + c.handMass + c.fingerMass + c.palmSkinMass + c.fingerSkinMass;
            const chainWeight = vec3(0, 0, all * STANDARD_GRAVITY);
            const k = (share: Vec3): number =>
                TEST_FLEX.stiffness + TEST_FLEX.stiffnessPerForce * length(add(share, chainWeight));
            expect(grip.topStiffness, `R ${R}`).toBeCloseTo(k(load.top), 9);
            expect(grip.bottomStiffness, `R ${R}`).toBeCloseTo(k(load.bottom), 9);
            expect(grip.topStiffness, `R ${R}`).toBeGreaterThan(grip0.topStiffness);
            expect(grip.bottomStiffness, `R ${R}`).toBeGreaterThan(grip0.bottomStiffness);
        }
        for (const R of [0, -5]) {
            expect(handLoad(track, on, TEST_HEAD, t, resisted(R)), `R ${R}`).toEqual(plain);
        }
    });

    it("ends with the push: no intent in the pendulum phase", () => {
        const track = prepareAt(PUSHING({ pendulumAt: 0 }), STANDARD_GRAVITY);
        expect((track.push as Push).pendulum).toBe(0);
        const t = 0.002;
        const on = headOnPath(track, TEST_HEAD, t);
        expect(handLoad(track, on, TEST_HEAD, t, resisted(50))).toEqual(handLoad(track, on, TEST_HEAD, t, resisted(0)));
    });

    it("is never read in swing mode", () => {
        const track = prepareAt(still({ omega0: 3 }), STANDARD_GRAVITY);
        const t = 0.002;
        const on = headOnPath(track, TEST_HEAD, t);
        expect(handLoad(track, on, TEST_HEAD, t, resisted(500))).toEqual(
            handLoad(track, on, TEST_HEAD, t, resisted(0)),
        );
    });

    it("answers a held resistance at the muscles' pace: 1 − 1/e of it after τ_push", () => {
        // Amendment (user, 2026-10-11): R̃ ← R̃ + (R − R̃)·(1 − exp(−dt/τ_push)). After n = τ/dt steps from 0 under a
        // held R, R̃ = R·(1 − (exp(−dt/τ))ⁿ), 1 − 1/e of R up to the steps' rounding.
        const response = pushResponse(TEST_HANDS, IMPACT_DT);
        expect(response).toBeCloseTo(1 - Math.exp(-IMPACT_DT / TEST_PUSH_RESPONSE_TIME), 15);
        const held = 1000;
        const answered = (steps: number): number => {
            let sensed = 0;
            for (let i = 0; i < steps; i++) {
                sensed = senseResistance(sensed, held, response);
            }
            return sensed;
        };
        const tau = Math.round(TEST_PUSH_RESPONSE_TIME / IMPACT_DT);
        expect(answered(tau) / held).toBeCloseTo(1 - Math.exp(-1), 9);
        // The first blow, about 1.25 ms of a held resistance, is answered with only 1 − exp(−1.25 ms/τ) of it.
        const blow = Math.round(1.25e-3 / IMPACT_DT);
        expect(answered(blow) / held).toBeCloseTo(1 - Math.exp(-1.25e-3 / TEST_PUSH_RESPONSE_TIME), 9);
        // And relaxes at the same pace once the resistance has gone.
        expect(senseResistance(held, 0, response)).toBeCloseTo(held * (1 - response), 9);
    });

    /**
     * Replays `snapshots`' hands from `start` with a grip state whose sensed resistance R̃ follows, after each step,
     * that step's head–ball contacts alone through the lag (or stays 0 without `fromBalls`), its chains advanced
     * after each step as the integrator advances them. Returns the steps whose
     * hands' force differs from the integrator's, the largest R and the largest R̃.
     */
    function replay(track: PreparedTrack, start: HeadState, snapshots: readonly ImpactSnapshot[], fromBalls = true) {
        const grip = newGripState();
        const response = 1 - exp(0 - IMPACT_DT / track.hands.pushResponseTime);
        let state = start;
        let t = 0;
        let differ = 0;
        let largest = 0;
        let sensed = 0;
        for (const s of snapshots) {
            const load = handLoad(track, state, TEST_HEAD, t, grip);
            const hand = s.hand as NonNullable<ImpactSnapshot["hand"]>;
            if (!same(load.force, hand.force) || !same(load.feedForward, hand.feedForward)) {
                differ++;
            }
            let onHead = ZERO;
            for (const c of s.contacts) {
                if (c.key.startsWith("face/")) {
                    onHead = sub(onHead, add(scale(c.normal, c.normalForce), c.tangentialForce));
                }
            }
            const resistance = fromBalls ? Math.max(0, 0 - dot(track.arc.aim, onHead)) : 0;
            grip.resistance = grip.resistance + (resistance - grip.resistance) * response;
            advanceChains(grip, track.hands.chain, IMPACT_DT);
            largest = Math.max(largest, resistance);
            sensed = Math.max(sensed, grip.resistance);
            state = s.head;
            t = s.t;
        }
        return { differ, largest, sensed };
    }
    const same = (a: Vec3, b: Vec3): boolean => Object.is(a.x, b.x) && Object.is(a.y, b.y) && Object.is(a.z, b.z);

    it("follows the balls' push on the head through the lag", () => {
        // A 3 m/s carry, gravity off, into a free ball: every step's hands match a replay whose R̃ follows the steps'
        // head–ball contacts through the lag; the ball resists past the cap, R̃ far less (the blow is over in about
        // 1.3 ms against τ 30 ms); with R̃ held at 0 the hands would differ.
        const ball = vec3(0, 0, 1);
        const start = vec3(ball.x - R - 1e-6 - TEST_HEAD.length / 2, 0, ball.z);
        const omega0 = 3 / (0.8 + TEST_HEAD.socket.z);
        const arc = levelArc(start, { mode: "carry", handReach: 0.1, pendulumAt: 1, omega0 });
        const track = prepareAt(arc, 0);
        const probe = recorder();
        const head = headOnPath(track, TEST_HEAD, 0);
        integrate(isolated({ start: head, drive: track, balls: [freeBall("blue", ball)] }), { probe, cap: 3e-3 });
        const { differ, largest, sensed } = replay(track, head, probe.snapshots);
        expect(differ).toBe(0);
        expect(largest).toBeGreaterThan(TEST_PUSH_FORCE);
        expect(sensed).toBeGreaterThan(0);
        expect(sensed).toBeLessThan(0.1 * largest);
        expect(replay(track, head, probe.snapshots, false).differ).toBeGreaterThan(0);
    });

    it("takes no resistance from the turf", () => {
        // A carry head pressed 1 mm into the turf and sliding forward: the turf's friction pushes it back along aim,
        // yet the hands match a replay whose R stays 0.
        const arc = levelArc(vec3(0, 0, TEST_HEAD.radius - 1e-3), { mode: "carry", handReach: 0.1, pendulumAt: 1 });
        const track = prepareAt(arc, STANDARD_GRAVITY);
        const turf = lawFromStiffness(TEST_HEAD.mass, TEST_TURF.turfRestitution, TEST_TURF.turfStiffness, 0.5);
        const on = headOnPath(track, TEST_HEAD, 0);
        const start = { ...on, velocity: add(on.velocity, scale(track.arc.aim, 0.5)) };
        const probe = recorder();
        integrate(isolated({ start, drive: track, gravity: STANDARD_GRAVITY, headTurf: turf }), { probe, cap: 5e-3 });
        const back = Math.min(...probe.snapshots.map((s) => dot(s.headTurf ?? ZERO, track.arc.aim)));
        expect(back).toBeLessThan(-1);
        const { differ, largest, sensed } = replay(track, start, probe.snapshots);
        expect(differ).toBe(0);
        expect(largest).toBe(0);
        expect(sensed).toBe(0);
    });
});

describe("the hand–arm chain (P2b.2b.2b.2b gate round 3 ruling, 2026-10-11)", () => {
    /** A still carry in a vertical swing plane: the hands never travel, so no pendulum phase. */
    const HOLDING = (o: Partial<SwingArc> = {}): SwingArc =>
        still({ mode: "carry", handReach: 0.1, pendulumAt: 1, ...o });
    const prepareAt = (arc: SwingArc, gravity: number, hands: Hands = TEST_HANDS): PreparedTrack =>
        prepareTrack(trackDrive(arc, TEST_COUPLING, hands), TEST_HEAD, gravity);
    const shaftOf = (head: HeadState): Vec3 => rotate(head.orientation, UP);
    const gripOf = (head: HeadState, along: number): Vec3 => add(head.position, scale(shaftOf(head), along));
    const gripVelocityOf = (head: HeadState, along: number): Vec3 =>
        add(head.velocity, cross(head.angularVelocity, scale(shaftOf(head), along)));
    const chainsOf = (s: ImpactSnapshot): { top: ArmChainState | null; bottom: ArmChainState | null } =>
        (s.hand as NonNullable<ImpactSnapshot["hand"]>).chains as { top: ArmChainState; bottom: ArmChainState | null };
    const half = (v: Vec3): number => 0.5 * dot(v, v);

    /** The eigenvalues of a symmetric 3×3 matrix, ascending (Jacobi rotations). */
    function eigenvalues(matrix: readonly (readonly number[])[]): number[] {
        const a = matrix.map((row) => [...row]);
        for (let sweep = 0; sweep < 50; sweep++) {
            for (let p = 0; p < 3; p++) {
                for (let q = p + 1; q < 3; q++) {
                    const apq = (a[p] as number[])[q] as number;
                    if (Math.abs(apq) < 1e-14) {
                        continue;
                    }
                    const app = (a[p] as number[])[p] as number;
                    const aqq = (a[q] as number[])[q] as number;
                    const theta = (aqq - app) / (2 * apq);
                    const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
                    const c = 1 / Math.sqrt(t * t + 1);
                    const s = t * c;
                    for (const row of a) {
                        const kp = row[p] as number;
                        const kq = row[q] as number;
                        row[p] = c * kp - s * kq;
                        row[q] = s * kp + c * kq;
                    }
                    const rp = [...(a[p] as number[])];
                    const rq = [...(a[q] as number[])];
                    for (let k = 0; k < 3; k++) {
                        (a[p] as number[])[k] = c * (rp[k] as number) - s * (rq[k] as number);
                        (a[q] as number[])[k] = s * (rp[k] as number) + c * (rq[k] as number);
                    }
                }
            }
        }
        return a.map((row, i) => row[i] as number).sort((x, y) => x - y);
    }

    it("transcribes Dong et al.'s x_h model: with the handle held, its natural frequencies are the paper's", () => {
        // Table 2, the mean property-based 5-DOF model in x_h: f0 26.7, f1 90.9, f2 188.5 Hz. With the grip held
        // still, the model's boundary K0 to the body standing in for the arm's flex at M0, chainForces' stiffness on
        // M0–M2 (unit nudges of each mass, gravity 0) over their masses must give those undamped frequencies.
        const chain = HAND_CHAIN;
        const k0 = contactReference.shoulderStiffness.value;
        const masses = [chain.forearmMass, chain.handMass, chain.fingerMass];
        const at = ZERO;
        const nudge = 1e-6;
        const column = (j: number): number[] => {
            const place = (i: number): Vec3 => vec3(i === j ? nudge : 0, 0, 0);
            const body = (i: number) => ({ position: place(i), velocity: ZERO, force: ZERO });
            const arm: ArmChain = { forearm: body(0), hand: body(1), fingers: body(2), preload: ZERO };
            chainForces(chain, arm, at, ZERO, scale(arm.forearm.position, 0 - k0), 0);
            return [arm.forearm, arm.hand, arm.fingers].map((m) => (0 - m.force.x) / nudge);
        };
        const K = [column(0), column(1), column(2)];
        const scaled = K.map((row, i) =>
            row.map((k, j) => k / Math.sqrt((masses[i] as number) * (masses[j] as number))),
        );
        const frequencies = eigenvalues(scaled).map((w2) => Math.sqrt(w2) / (2 * Math.PI));
        [26.7, 90.9, 188.5].forEach((f, i) => {
            expect(Math.abs((frequencies[i] as number) / f - 1), `f${i}`).toBeLessThan(5e-3);
        });
        // The grip carries the palm's and the fingers' springs: nudging the grip pulls M1 by K3 and M2 by K4.
        const still0 = (): ChainMass => ({ position: ZERO, velocity: ZERO, force: ZERO });
        const arm: ArmChain = { forearm: still0(), hand: still0(), fingers: still0(), preload: ZERO };
        const onMallet = chainForces(chain, arm, vec3(nudge, 0, 0), ZERO, ZERO, 0);
        expect(arm.hand.force.x / nudge).toBeCloseTo(chain.palmStiffness, 3);
        expect(arm.fingers.force.x / nudge).toBeCloseTo(chain.fingerStiffness, 3);
        expect(arm.forearm.force.x).toBe(0);
        expect((0 - onMallet.x) / nudge).toBeCloseTo(chain.palmStiffness + chain.fingerStiffness, 3);
    });

    it("hangs a still head on the flex with every chain in equilibrium: the grips carry their shares", () => {
        // A vertical shaft at rest under gravity: the top hand's share is the head's weight, the bottom hand's none.
        // Each chain starts in its static balance, its arm feeding it its share and the chain's weight, so nothing
        // moves.
        const track = prepareAt(HOLDING(), STANDARD_GRAVITY);
        const start = headOnPath(track, TEST_HEAD, 0);
        const weight = vec3(0, 0, TEST_HEAD.mass * STANDARD_GRAVITY);
        let force = 0;
        let drift = 0;
        let moved = 0;
        let first: readonly ArmChainState[] | null = null;
        const probe: ImpactProbe = {
            step(s) {
                const hand = s.hand as NonNullable<ImpactSnapshot["hand"]>;
                force = Math.max(force, dist(hand.top, weight), length(hand.bottom));
                drift = Math.max(drift, dist(s.head.position, start.position));
                const { top, bottom } = chainsOf(s) as { top: ArmChainState; bottom: ArmChainState };
                first ??= [top, bottom];
                [top, bottom].forEach((arm, i) => {
                    const then = (first as readonly ArmChainState[])[i] as ArmChainState;
                    for (const key of ["forearm", "hand", "fingers"] as const) {
                        moved = Math.max(moved, dist(arm[key].position, then[key].position));
                    }
                });
            },
        };
        integrate(isolated({ start, drive: track, gravity: STANDARD_GRAVITY }), { probe, cap: 0.2 });
        expect(force).toBeLessThan(1e-9);
        expect(drift).toBeLessThan(1e-12);
        expect(moved).toBeLessThan(1e-12);
    });

    it("conserves the energy of the head, the chains and every spring with no damper and no feed-forward", () => {
        // No gravity on a still path: F_ff is zero, so k = k₀ and nothing feeds the arms. The head is pushed along aim
        // and swings in the plane, on the flex and both chains, every damper 0. The energy is the swung body's (the
        // head and both skins) and the chains' kinetic energy, each flex's ½k₀|y₀ − x̂₀|² and each chain element's
        // ½k|Δ|².
        const chain: HandChain = {
            ...TEST_CHAIN,
            wristDamping: 0,
            knuckleDamping: 0,
            palmDamping: 0,
            fingerDamping: 0,
        };
        const undamped: Hands = { ...TEST_HANDS, flex: { ...TEST_FLEX, dampingRatio: 0 }, chain };
        const track = prepareAt(HOLDING(), 0, undamped);
        const on = headOnPath(track, TEST_HEAD, 0);
        const start = { ...on, velocity: scale(track.arc.aim, 0.05) };
        const a = TEST_HEAD.socket.z + track.arc.radius;
        const b = TEST_HEAD.socket.z + undamped.bottom;
        const homes = [gripOf(on, a), gripOf(on, b)];
        const k = undamped.flex.stiffness;
        const body = track.body;
        const energy = (s: ImpactSnapshot): number => {
            const { head } = s;
            const centre = add(head.velocity, cross(head.angularVelocity, scale(shaftOf(head), body.offset)));
            const w = rotateInverse(head.orientation, head.angularVelocity);
            const I = body.inertia;
            const { top, bottom } = chainsOf(s) as { top: ArmChainState; bottom: ArmChainState };
            let total = body.mass * half(centre) + 0.5 * (I.x * w.x * w.x + I.y * w.y * w.y + I.z * w.z * w.z);
            [top, bottom].forEach((arm, i) => {
                const grip = gripOf(head, i === 0 ? a : b);
                total +=
                    chain.forearmMass * half(arm.forearm.velocity) +
                    chain.handMass * half(arm.hand.velocity) +
                    chain.fingerMass * half(arm.fingers.velocity) +
                    k * half(sub(arm.forearm.position, homes[i] as Vec3)) +
                    chain.wristStiffness * half(sub(arm.forearm.position, arm.hand.position)) +
                    chain.knuckleStiffness * half(sub(arm.hand.position, arm.fingers.position)) +
                    chain.palmStiffness * half(sub(arm.hand.position, grip)) +
                    chain.fingerStiffness * half(sub(arm.fingers.position, grip));
            });
            return total;
        };
        let lowest = Infinity;
        let highest = 0 - Infinity;
        const probe: ImpactProbe = {
            step(s) {
                const e = energy(s);
                lowest = Math.min(lowest, e);
                highest = Math.max(highest, e);
            },
        };
        integrate(isolated({ start, drive: track, gravity: 0 }), { probe, cap: 0.3 });
        const moving = chain.forearmMass + chain.handMass + chain.fingerMass;
        const initial = (body.mass + 2 * moving) * half(start.velocity);
        // Semi-implicit Euler holds the energy to O(ω·dt) of it, ω the chain's fastest mode.
        expect(highest - lowest).toBeLessThan(1e-2 * initial);
        expect(lowest).toBeGreaterThan(0.5 * initial);
    });

    it("drops the bottom hand's chain and skin in the pendulum phase: its push acts at the grip", () => {
        // Hands travelling along aim reach half the 5 cm push at 25 ms, the shaft leaning back 0.3 rad (short of
        // vertical, so the bottom hand pushes). Before it both chains hold the mallet; from it the bottom hand's chain
        // leaves the model, the swung body keeps only the top hand's skin, and the bottom push along e is applied
        // directly.
        const arc = HOLDING({
            theta0: -0.3,
            pivotVelocity: vec3(1, 0, 0),
            handReach: 0.05,
            pendulumAt: 0.5,
            pendulumEffort: 1,
            window: 0.005,
            handWindow: 0.005,
        });
        const track = prepareAt(arc, STANDARD_GRAVITY);
        const pendulum = (track.push as Push).pendulum as number;
        const grip = newGripState();
        handLoad(track, headOnPath(track, TEST_HEAD, 0), TEST_HEAD, 0, grip);
        expect(grip.topChain).not.toBeNull();
        expect(grip.bottomChain).not.toBeNull();
        expect(swungOf(track, grip)).toBe(track.body);
        const t = pendulum + 1e-3;
        const on = headOnPath(track, TEST_HEAD, t);
        const load = handLoad(track, on, TEST_HEAD, t, grip);
        expect(grip.bottomChain).toBeNull();
        expect(grip.topChain).not.toBeNull();
        expect(swungOf(track, grip)).toBe(track.released);
        const skin = TEST_CHAIN.palmSkinMass + TEST_CHAIN.fingerSkinMass;
        expect((track.released as SwungBody).mass).toBeCloseTo(TEST_HEAD.mass + skin, 12);
        expect(track.body.mass).toBeCloseTo(TEST_HEAD.mass + 2 * skin, 12);
        const s = shaftOf(on);
        const e = sub(arc.aim, scale(s, dot(arc.aim, s)));
        expect(dist(load.bottom, scale(e, TEST_PENDULUM_FORCE / length(e)))).toBeLessThan(1e-9);
        // Integrated: once released, no step carries a bottom chain.
        let after = 0;
        let carried = 0;
        const probe: ImpactProbe = {
            step(snap) {
                if (snap.t > pendulum + 1e-4) {
                    after++;
                    if (chainsOf(snap).bottom !== null) {
                        carried++;
                    }
                }
            },
        };
        const start = headOnPath(track, TEST_HEAD, 0);
        integrate(isolated({ start, drive: track, gravity: STANDARD_GRAVITY }), { probe, cap: pendulum + 0.01 });
        expect(after).toBeGreaterThan(0);
        expect(carried).toBe(0);
    });

    it("is never read in swing mode", () => {
        const track = prepareAt(still({ omega0: 3 }), STANDARD_GRAVITY);
        expect(track.released).toBeNull();
        const t = 0.002;
        const on = headOnPath(track, TEST_HEAD, t);
        const mass = (x: number): ChainMass => ({
            position: vec3(x, 2, 3),
            velocity: vec3(4, x, 6),
            force: vec3(7, 8, x),
        });
        const arm = (): ArmChain => ({ forearm: mass(1), hand: mass(2), fingers: mass(3), preload: vec3(0.1, 0, 0) });
        const held: GripState = { ...newGripState(), topChain: arm(), bottomChain: arm() };
        expect(handLoad(track, on, TEST_HEAD, t, held)).toEqual(handLoad(track, on, TEST_HEAD, t, newGripState()));
        expect(held.topChain).toEqual(arm());
        expect(held.bottomChain).toEqual(arm());
    });

    it("holds the mallet through the palm and the fingers in a carry run: the chain law at every step", () => {
        // The hands' force on the mallet is the chain's, K3·(y₁ − x) + C3·(u₁ − v) + K4·(y₂ − x) + C4·(u₂ − v) at each
        // grip, at every step of a 3 m/s carry into a free ball (gravity off, so no skin weight).
        const ball = vec3(0, 0, 1);
        const begin = vec3(ball.x - R - 1e-6 - TEST_HEAD.length / 2, 0, ball.z);
        const omega0 = 3 / (0.8 + TEST_HEAD.socket.z);
        const track = prepareAt(levelArc(begin, { mode: "carry", handReach: 0.1, pendulumAt: 1, omega0 }), 0);
        const a = TEST_HEAD.socket.z + track.arc.radius;
        const probe = recorder();
        const head = headOnPath(track, TEST_HEAD, 0);
        integrate(isolated({ start: head, drive: track, balls: [freeBall("blue", ball)] }), { probe, cap: 3e-3 });
        const c = TEST_CHAIN;
        let previous = head;
        let worst = 0;
        let largest = 0;
        let prior: ArmChainState | null = null;
        for (const s of probe.snapshots) {
            const top = chainsOf(s).top as ArmChainState;
            if (prior !== null) {
                const x = gripOf(previous, a);
                const v = gripVelocityOf(previous, a);
                const expected = add(
                    add(
                        scale(sub(prior.hand.position, x), c.palmStiffness),
                        scale(sub(prior.hand.velocity, v), c.palmDamping),
                    ),
                    add(
                        scale(sub(prior.fingers.position, x), c.fingerStiffness),
                        scale(sub(prior.fingers.velocity, v), c.fingerDamping),
                    ),
                );
                const hand = s.hand as NonNullable<ImpactSnapshot["hand"]>;
                worst = Math.max(worst, dist(hand.top, expected));
                largest = Math.max(largest, length(hand.top));
            }
            prior = top;
            previous = s.head;
        }
        expect(largest).toBeGreaterThan(1);
        expect(worst).toBeLessThan(1e-9 * largest);
    });
});

describe("the pendulum phase (P2b.2b.2b.2b design §4.2, §4.3, §7.1)", () => {
    /**
     * Hands with an undamped flex and chain, a short pendulum: a 0.5 m top grip, the bottom grip 0.25 m from the
     * socket.
     */
    const FREE: Hands = {
        ...TEST_HANDS,
        bottom: 0.25,
        flex: { ...TEST_FLEX, dampingRatio: 0 },
        chain: { ...TEST_CHAIN, wristDamping: 0, knuckleDamping: 0, palmDamping: 0, fingerDamping: 0 },
    };
    /** Leaning 0.5 rad, still, the pendulum phase from contact (pendulumAt 0 on still hands). */
    const SWUNG = (effort: number): SwingArc =>
        still({ mode: "carry", radius: 0.5, theta0: -0.5, handReach: 0.1, pendulumAt: 0, pendulumEffort: effort });
    const prepared = (effort: number, gravity = STANDARD_GRAVITY): PreparedTrack =>
        prepareTrack(trackDrive(SWUNG(effort), TEST_COUPLING, FREE), TEST_HEAD, gravity);
    const UP_AXIS = vec3(0, 0, 1);

    /**
     * The energy of the swung body (the head and the top hand's skin, the bottom hand gone) and the top hand–arm
     * chain (gate round 3: the chain): their kinetic energy and weight (the skin's at the top grip), the top arm's
     * feed-forward potential −F_ff·y₀ (the head's and the whole chain's weight, on the forearm at y₀), its flex's
     * energy from the forearm's start and each chain element's.
     */
    function energy(track: PreparedTrack, s: ImpactSnapshot, topStart: Vec3): number {
        const { head } = s;
        const c = FREE.chain;
        const body = track.released as SwungBody;
        const shaft = rotate(head.orientation, UP_AXIS);
        const top = add(head.position, scale(shaft, TEST_HEAD.socket.z + track.arc.radius));
        const arm = (s.hand as NonNullable<ImpactSnapshot["hand"]>).chains?.top as ArmChainState;
        const w = rotateInverse(head.orientation, head.angularVelocity);
        const I = body.inertia;
        const centre = add(head.velocity, cross(head.angularVelocity, scale(shaft, body.offset)));
        const half = (v: Vec3): number => 0.5 * dot(v, v);
        const kinetic =
            body.mass * half(centre) +
            0.5 * (I.x * w.x * w.x + I.y * w.y * w.y + I.z * w.z * w.z) +
            c.forearmMass * half(arm.forearm.velocity) +
            c.handMass * half(arm.hand.velocity) +
            c.fingerMass * half(arm.fingers.velocity);
        const g = STANDARD_GRAVITY;
        const skin = c.palmSkinMass + c.fingerSkinMass;
        const fed = (TEST_HEAD.mass + c.forearmMass + c.handMass + c.fingerMass + skin) * g;
        const k = FREE.flex.stiffness + FREE.flex.stiffnessPerForce * fed;
        const potential =
            TEST_HEAD.mass * g * head.position.z +
            skin * g * top.z +
            g * (c.forearmMass * arm.forearm.position.z + c.handMass * arm.hand.position.z) +
            c.fingerMass * g * arm.fingers.position.z -
            fed * arm.forearm.position.z;
        const springs =
            k * half(sub(arm.forearm.position, add(topStart, arm.preload))) +
            c.wristStiffness * half(sub(arm.forearm.position, arm.hand.position)) +
            c.knuckleStiffness * half(sub(arm.hand.position, arm.fingers.position)) +
            c.palmStiffness * half(sub(arm.hand.position, top)) +
            c.fingerStiffness * half(sub(arm.fingers.position, top));
        return kinetic + potential + springs;
    }

    /** The top grip of the head on `track`'s path at t = 0, where the flex takes hold. */
    const topAtStart = (track: PreparedTrack): Vec3 => {
        const start = headOnPath(track, TEST_HEAD, 0);
        return add(start.position, scale(rotate(start.orientation, UP_AXIS), TEST_HEAD.socket.z + track.arc.radius));
    };

    it("at effort 0 is a free pendulum about the top hand: an undamped flex conserves the energy", () => {
        // The run is 140,000 steps, so the probe keeps running extremes rather than every snapshot.
        const track = prepared(0);
        const topStart = topAtStart(track);
        let lowest = Infinity;
        let highest = 0 - Infinity;
        let pitch = 0 - Infinity;
        const probe: ImpactProbe = {
            step(s) {
                const e = energy(track, s, topStart);
                lowest = Math.min(lowest, e);
                highest = Math.max(highest, e);
                pitch = Math.max(pitch, 0 - leanOf(s.head));
            },
        };
        const start = headOnPath(track, TEST_HEAD, 0);
        integrate(isolated({ start, drive: track, gravity: STANDARD_GRAVITY }), { probe, cap: 0.7 });
        // The swing's potential range, m·g·ℓ_h·(1 − cos 0.5) with ℓ_h = ρ + r = 0.532 m, sets the scale;
        // semi-implicit Euler's error is O(dt) of it.
        const range = TEST_HEAD.mass * STANDARD_GRAVITY * 0.532 * (1 - Math.cos(0.5));
        expect(highest - lowest).toBeLessThan(1e-3 * range);
        expect(pitch).toBeGreaterThan(0.4);
    });

    it("pushes the bottom grip up to vertical and not after, adding F_pendulum's work within 1 %", () => {
        // Review focus 3 at full effort. The work is F_pendulum·(e·v_B)·dt summed from the kinematics, not from the
        // reported force, up to the first step past vertical.
        const track = prepared(1);
        const topStart = topAtStart(track);
        const aim = track.arc.aim;
        let work = 0;
        let previous = 0;
        let before = NaN;
        let atVertical = NaN;
        let past = false;
        let pushedAfter = 0;
        const probe: ImpactProbe = {
            step(s) {
                if (Number.isNaN(before)) {
                    before = energy(track, s, topStart);
                }
                if (past) {
                    pushedAfter = Math.max(pushedAfter, length((s.hand as NonNullable<ImpactSnapshot["hand"]>).bottom));
                    return;
                }
                if (0 - leanOf(s.head) >= 0) {
                    past = true;
                    return;
                }
                const shaft = rotate(s.head.orientation, UP_AXIS);
                const arm = scale(shaft, TEST_HEAD.socket.z + FREE.bottom);
                const v = add(s.head.velocity, cross(s.head.angularVelocity, arm));
                const forward = sub(aim, scale(shaft, dot(aim, shaft)));
                work += TEST_PENDULUM_FORCE * dot(scale(forward, 1 / length(forward)), v) * (s.t - previous);
                previous = s.t;
                atVertical = energy(track, s, topStart);
            },
        };
        const start = headOnPath(track, TEST_HEAD, 0);
        integrate(isolated({ start, drive: track, gravity: STANDARD_GRAVITY }), { probe, cap: 0.7 });
        expect(past).toBe(true);
        expect(Math.abs((atVertical - before) / work - 1)).toBeLessThan(0.01);
        // One step past vertical the latch is set; every later step's bottom hand is off the mallet.
        expect(pushedAfter).toBe(0);
    });

    it("finishes at the swing's first apex after it starts, past vertical, never at the cap", () => {
        // With TEST_FLEX's damping (ζ 0.3), not FREE's: the undamped flex is far from leaving the pivot be. It rings
        // the head's fast pitch mode (the head turning about its own centre against the soft top spring), which
        // reverses the pitch rate about 20 ms in, at θ −0.457, and would fire the finish there. Damped, the rate stays
        // positive to the swing's top.
        const damped: Hands = { ...TEST_HANDS, bottom: 0.25 };
        const track = prepareTrack(trackDrive(SWUNG(0), TEST_COUPLING, damped), TEST_HEAD, STANDARD_GRAVITY);
        const start = headOnPath(track, TEST_HEAD, 0);
        const { follow } = integrateStroke(
            isolated({ start, drive: track, gravity: STANDARD_GRAVITY }),
            { cap: 0.01 },
            true,
        );
        const done = follow as NonNullable<typeof follow>;
        expect(done.flags).not.toContain("follow-cap");
        expect(done.finish).toBeLessThan(FOLLOW_CAP);
        const last = done.samples[done.samples.length - 1] as StrokeState;
        // Released at rest 0.5 rad back, it tops out near 0.5 rad forward (the flex barely moves the pivot).
        expect(-leanOf(last.head)).toBeGreaterThan(0.4);
    });

    it("caps a head that never swings forward", () => {
        // No gravity and still hands: the pendulum phase starts with the head turning back about the top grip at
        // 1 rad/s, and nothing turns it forward. (A head at rest is no test: its pitch rate is rounding, ±1e-14 rad/s.)
        const track = prepared(0, 0);
        const on = headOnPath(track, TEST_HEAD, 0);
        const top = add(on.position, scale(rotate(on.orientation, UP_AXIS), TEST_HEAD.socket.z + track.arc.radius));
        const spin = scale(track.axis, -1);
        const start = { ...on, velocity: cross(spin, sub(on.position, top)), angularVelocity: spin };
        const { follow } = integrateStroke(isolated({ start, drive: track, gravity: 0 }), { cap: 0.01 }, true);
        expect((follow as NonNullable<typeof follow>).flags).toContain("follow-cap");
    });

    it("caps a carry whose hands never reach the pendulum point", () => {
        // Review focus 2: still hands and pendulumAt 1 never start the pendulum phase, so the follow-through runs on.
        const arc = still({ mode: "carry", radius: 0.5, theta0: -0.5, handReach: 0.1, pendulumAt: 1 });
        const track = prepareTrack(trackDrive(arc, TEST_COUPLING, FREE), TEST_HEAD, STANDARD_GRAVITY);
        expect((track.push as Push).pendulum).toBeNull();
        const start = headOnPath(track, TEST_HEAD, 0);
        const { follow } = integrateStroke(
            isolated({ start, drive: track, gravity: STANDARD_GRAVITY }),
            { cap: 0.01 },
            true,
        );
        expect((follow as NonNullable<typeof follow>).flags).toContain("follow-cap");
    });
});
