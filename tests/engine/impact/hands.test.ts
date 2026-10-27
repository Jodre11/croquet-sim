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
} from "../../../src/engine/impact/track";
import { exp } from "../../../src/engine/math/elementary";
import { flexGains } from "../../../src/engine/impact/flex";
import type { Coupling, HandChain, Hands, HeadState, SwingArc } from "../../../src/engine/impact/types";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import { contactReference } from "../../../src/reference/index";
import { TEST_BALL } from "../support/fixtures";
import {
    NO_DIP,
    TEST_CHAIN,
    TEST_COUPLING,
    TEST_FLEX,
    TEST_HANDS,
    TEST_HEAD,
    TEST_RHO,
    TEST_PENDULUM_FORCE,
    TEST_PUSH_FORCE,
    TEST_PUSH_RESPONSE_TIME,
    freeBall,
    integratePulse,
    isolated,
    levelArc,
    recorder,
    socketAt,
    testHeadTurf,
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
    slopeHold: 0,
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
    slopeHold: 1,
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
        // Before contact over 60 ms. Drafting measured a ratio of 0.504: semi-implicit Euler's O(dt·a) lag.
        const o = { coupling: BEFORE, cap: 0.06 };
        const coarse = tracking(check, { ...o, dt: 1e-5 });
        const fine = tracking(check, { ...o, dt: 5e-6 });
        expect(fine.socket).toBeLessThan(0.6 * coarse.socket);
        expect(fine.angle).toBeLessThan(0.6 * coarse.angle);
        // P2b.2b.2c.3a: one law after contact (was the same path errors from contact through the check's window, ratio
        // 0.500, the swing law's damper holding the head to the path): from contact the hands flex through their
        // chains, which hold the head off the path by the flex's own compliance, not the integrator's error. So the
        // run itself converges instead: its head at the window's end moves by half as much again at each halving
        // (4.31e-7 m, then 2.14e-7 m: a ratio of 0.497).
        const after = (dt: number) => tracking(check, { coupling: TEST_COUPLING, cap: COAST.window, dt }).run.head;
        const [a, b, c] = [after(1e-5), after(5e-6), after(2.5e-6)];
        expect(dist(b.position, c.position)).toBeLessThan(0.6 * dist(a.position, b.position));
    });

    it("checks a head the strike has slowed through the window's end, never past rest", () => {
        // User decision (2026-10-06): a check brakes the head to rest, not past it. A head pitching at half the path's
        // rate from contact gets half the planned deceleration.
        const check: SwingArc = { ...COAST, alpha: -COAST.omega0 / COAST.window };
        const track = prepare(check, TEST_COUPLING, ARMED);
        const slowed = prepare({ ...check, omega0: check.omega0 / 2, alpha: 0 }, TEST_COUPLING, ARMED);
        let lowest = Infinity;
        let last = Infinity;
        let rose = false;
        const probe: ImpactProbe = {
            step(s) {
                const rate = dot(s.head.angularVelocity, track.axis);
                rose = rose || rate > last;
                lowest = Math.min(lowest, rate);
                last = rate;
            },
        };
        const start = headOnPath(slowed, TEST_HEAD, 0);
        integrate(isolated({ start, drive: track, gravity: STANDARD_GRAVITY }), { probe, cap: check.window });
        // From 1.875 rad/s; the planned deceleration alone left it at −0.832 rad/s, past rest. P2b.2b.2c.2d: the
        // minimum-jerk pulse and gravity through it (was a drift of 2.5e-4 in the share and a last rate of +1.13e-8
        // rad/s, the lag leaving it short of rest): a drift of 1.37e-5, and the head never nearer rest than 0.016555
        // rad/s, its lowest rate, just before the window's end.
        // Numerical, not physical: an allowance below rest for the integrator's residual, from when the head ended at
        // rest; eight orders of magnitude below the start's 1.875 rad/s, so a braking past rest still fails.
        const RESIDUAL = 1e-8;
        expect(lowest).toBeGreaterThanOrEqual(0 - RESIDUAL);
        // P2b.2b.2c.2d: gravity through the pulse (was |last| < 3e-8, at rest with a path the check had brought to
        // rest). Gravity acts through the check, θ₀ = −0.3 rad, so the path ends the window at gravity's share,
        // 0.0331 rad/s, the hand integration's.
        const plannedEnd = dot(pathAt(track, check.window).angularVelocity, track.axis);
        expect(plannedEnd).toBeCloseTo(integratePulse(track, 1e-7).omega, 4);
        // P2b.2b.2c.3a: one law after contact (was a drift of 1.37e-5 from half the path's rate, under 5e-4, and a last
        // rate within 3e-6 of half the path's, 0.016562 rad/s). The hands now feed the check's share through their
        // hand–arm chains, whose masses ride on the wrist's and palm's springs (periods of about 30 ms and 10 ms): the
        // brake reaches the head late in a 10 ms pulse, so the head keeps 1.72 rad/s at mid-window (half the path's
        // would be 0.95) and ends at 0.3710 rad/s, slowing all the way and never past rest. The share itself is pinned
        // on the feed-forward ("the check's share", below).
        expect(rose).toBe(false);
        expect(last).toBeCloseTo(0.371, 3);
        expect(last).toBeLessThan(0.25 * check.omega0);
    });

    it("runs a whiff to TRACK_IMPACT_CAP after the planned contact", () => {
        for (const contactAt of [0, 0.02]) {
            const { run } = tracking({ ...COAST, contactAt }, { coupling: TEST_COUPLING });
            // P2b.2b.2c.2d: a stroke that reaches the cap with no face contact is reported (was ["impact-cap"]).
            expect(run.events.map((e) => e.kind)).toEqual(["impact-cap", "impact-no-strike"]);
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

    it("let a loose top hand feed γ_T of the head's weight, and the head sink on the flex, with no turf", () => {
        // A still level path from contact, the shaft vertical: F_ff is the head's weight along the shaft, all of it the
        // top hand's share. P2b.2b.2c.3a: one law after contact (was the swing law's sink at (1 − γ_T)·m·g/c(γ_T), the
        // top hand carrying γ_T of the weight and its damper c(γ_T) the rest at a terminal rate). The top hand's chain
        // is now fed γ_T × its share and takes hold in equilibrium, so at the first step the loose hand holds up a
        // tenth of the weight and the firm hand all of it; the rest of the loose head's weight sinks it onto both
        // hands' flex, which holds it 17.5 mm down after 0.5 s, while the firm head stays on the path exactly.
        const weight = vec3(0, 0, TEST_HEAD.mass * STANDARD_GRAVITY);
        const loose = prepare(still(), TEST_COUPLING, { ...ARMED, gripTension: 0.1 });
        const firm = prepare(still(), TEST_COUPLING, ARMED);
        expect(dist(loadOnPath(loose, 0).top, scale(weight, 0.1))).toBeLessThan(1e-9);
        expect(dist(loadOnPath(firm, 0).top, weight)).toBeLessThan(1e-9);
        const sink = (track: PreparedTrack): number => {
            const start = headOnPath(track, TEST_HEAD, 0);
            const run = integrate(isolated({ start, drive: track, gravity: STANDARD_GRAVITY }), { cap: 0.5 });
            return start.position.z - run.head.position.z;
        };
        expect(sink(loose)).toBeCloseTo(0.0175, 4);
        expect(sink(firm)).toBe(0);
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
    return handLoad(track, headOnPath(track, TEST_HEAD, t), TEST_HEAD, t, grip, IMPACT_DT);
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

    it("splits F_s over both hands inside a check, the top hand's share scaled by γ_T", () => {
        const arc: SwingArc = { ...TIMED, mode: "swing", slopeHold: 0, alpha: -4 };
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

// P2b.2b.2c.3a: one law after contact (was "the bottom hand's rate guide"). The swing law's rate guide is gone: its
// tests "never pulls outside a check" and the guide's parts of "acts both ways inside a check" and "returns one past
// rest" went with it, and "scales the push by guideEffort" is "scales the bottom hand's flex by guideEffort" below.
// The check's share, which now acts on every stroke, keeps its tests here.
describe("the check's share (design §3.3)", () => {
    /** A head on the path at t, its pitch rate `extra` faster than the path's. */
    function spun(track: PreparedTrack, t: number, extra: number): HeadState {
        const head = headOnPath(track, TEST_HEAD, t);
        return { ...head, angularVelocity: add(head.angularVelocity, scale(track.axis, extra)) };
    }

    it("carries g_B·F_B inside a check", () => {
        // The bottom hand's chain takes hold in equilibrium under g_B × its share, so the first step's force is it.
        const arc = still({ omega0: 3, alpha: -300 });
        const t = 0.005;
        const track = prepare(arc, TEST_COUPLING, TEST_HANDS);
        const light = prepare(arc, TEST_COUPLING, { ...TEST_HANDS, bottomGrip: 0.25 });
        const on = loadOnPath(track, t);
        expect(length(on.bottom)).toBeGreaterThan(1);
        expect(dist(loadOnPath(light, t).bottom, scale(on.bottom, 0.25))).toBeLessThan(1e-9);
    });

    it("inside a check gives a slowed head its share of the planned deceleration, and one past rest none", () => {
        // User decision (2026-10-06): a check brakes the head to rest, not past it (design §3.3).
        const arc = still({ omega0: 3, alpha: -300 });
        const t = 0.005;
        const track = prepare(arc, TEST_COUPLING, TEST_HANDS);
        const planned = dot(pathAt(track, t).angularVelocity, track.axis);
        const at = (share: number): HandLoad =>
            handLoad(track, spun(track, t, (share - 1) * planned), TEST_HEAD, t, newGripState(), IMPACT_DT);
        const [rest, half, full] = [at(0), at(0.5), at(1)];
        // Between rest and the path's rate the deceleration is in proportion, and with it each hand's feed.
        expect(length(sub(full.feedForward, rest.feedForward))).toBeGreaterThan(1);
        expect(dist(half.feedForward, scale(add(rest.feedForward, full.feedForward), 0.5))).toBeLessThan(1e-9);
        expect(dist(half.bottom, scale(add(rest.bottom, full.bottom), 0.5))).toBeLessThan(1e-9);
        // Past rest none of it.
        const behind = spun(track, t, -1.2 * planned);
        const back = handLoad(track, behind, TEST_HEAD, t, newGripState(), IMPACT_DT);
        expect(dist(back.feedForward, rest.feedForward)).toBeLessThan(1e-9);
    });

    it("inside a check past the path's rest, gives a forward-moving head share 1 and a stopped one 0", () => {
        // An early brake's window can outlast the path's rest (design §4.1): the planned rate is then negative. A head
        // still pitching forward gets the whole of the planned deceleration, however fast; a head at rest or pitching
        // back gets none, so the hands never drive it past rest.
        // The path rests at 5 ms (3 rad/s at −600 rad/s²) and runs on to 10 ms; 7.5 ms is −1.5 rad/s.
        const arc = still({ omega0: 3, alpha: -600 });
        const t = 0.0075;
        const track = prepare(arc, TEST_COUPLING, TEST_HANDS);
        expect(dot(pathAt(track, t).angularVelocity, track.axis)).toBeLessThan(0);
        const at = (rate: number): HandLoad =>
            handLoad(
                track,
                spun(track, t, rate - dot(pathAt(track, t).angularVelocity, track.axis)),
                TEST_HEAD,
                t,
                newGripState(),
                IMPACT_DT,
            );
        const [forward, faster, rest, back] = [at(0.5), at(2), at(0), at(-0.5)];
        expect(dist(forward.feedForward, faster.feedForward)).toBeLessThan(1e-9);
        expect(dist(rest.feedForward, back.feedForward)).toBeLessThan(1e-9);
        expect(dist(forward.feedForward, rest.feedForward)).toBeGreaterThan(1);
    });
});

describe("a shaft along the aim", () => {
    it("has no defined forward, so the bottom hand's load stays finite", () => {
        const path = prepare(still(), TEST_COUPLING, TEST_HANDS);
        const t = 0.02;
        // An upright head under a vertical aim: the shaft is exactly along it, so the swing plane's forward is 0 / 0.
        const track: PreparedTrack = { ...path, arc: { ...path.arc, aim: UP } };
        const head: HeadState = { ...headOnPath(path, TEST_HEAD, t), orientation: { w: 1, x: 0, y: 0, z: 0 } };
        const load = handLoad(track, head, TEST_HEAD, t, newGripState(), IMPACT_DT);
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
        handLoad(track, turned(0), TEST_HEAD, 0, grip, 1e-3);
        handLoad(track, turned((TEST_HANDS.reachSlack - 1e-3) / lever), TEST_HEAD, 1e-3, grip, 1e-3);
        expect(grip.releasedAt).toBeNull();
        const turn = (TEST_HANDS.reachSlack + 1e-3) / lever;
        handLoad(track, turned(turn), TEST_HEAD, 2e-3, grip, 1e-3);
        expect(grip.releasedAt).toBe(2e-3);
        expect(grip.releaseDelta).toBeCloseTo(turn, 12);
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

    /**
     * A level 3 m/s swing (gravity off) into the balls, its face 1 µm short of the ball at BALL. P2b.2b.2c.3a: a push
     * wherever handReach > 0 (A2 item 8), so the swing has a handReach of 0 (was the fixture's 10 m reach, which never
     * bound in swing mode); its hands are still, so the path is the same.
     */
    function strikeRun(balls: ImpactBall[], cap?: number) {
        const arc = levelArc(START, { omega0: 3 / (0.8 + TEST_HEAD.socket.z), handReach: 0 });
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
        const ahead = d > 0 && length(sub(offset, scale(f, d))) < TEST_RHO + R;
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
        // ends at 115.66 ms. P2b.2b.2c.2c: the face's T(U) re-set (was three intervals and no event): seventeen
        // face–blue intervals, from 0.005, 5.51 and 10.13 ms on, every 4–6 ms, until the face, pitching up, leaves blue
        // (impact-off-face at 74.56 ms); the impact ends at 121.11 ms.
        expect((run.timeline["face/blue"] ?? []).length).toBeGreaterThanOrEqual(2);
        const kinds = run.events.map((e) => e.kind);
        expect(kinds).not.toContain("impact-head-approaching");
        expect(kinds).not.toContain("impact-cap");
    });

    it("keeps running while the head closes on a ball, and flags it if the cap comes first", () => {
        // At the cap the head, slowed below blue by a tap, is closing on it again. P2b.2b.2b.2a: Hertzian face (was
        // 2.5 ms, closing 2.34–3.17 ms): the face's longer contact holds blue through its transfer to red, so the old
        // re-catch at 1.1 ms is now part of the first interval, and the head next closes 9.27–19.31 ms. P2b.2b.2c.2c:
        // the face's T(U) re-set (was a cap at 12 ms, inside 9.27–19.31 ms): the shorter face contact brings back a
        // series of short taps, face–blue [0.005, 1.880), [5.510, 6.695) and [10.125, 11.395) ms, the head closing
        // (headClosing) over 3.66–6.08, 8.38–10.73 and 12.99–15.28 ms. At 12 ms blue is pulling away after the third
        // tap; at 9 ms the head, slowed below blue by the second, is closing on it again. The cap moves to 9 ms, an
        // input change that keeps the test's cover of the cap and the head closing; the expectation is unchanged.
        // P2b.2b.2c.3a: one law after contact (was a cap at 9 ms, inside the third of a series of taps): the swing
        // law's damper no longer holds the head to the path; the hands' flex lets it slow below blue after the first
        // tap, face–blue [0.005, 1.875) ms, and it closes on blue again from 33.5 ms, within LOOK_AHEAD of it, until a
        // second tap at [55.315, 56.510) ms. The cap moves to 40 ms, an input change; the expectation is unchanged.
        const { run } = strikeRun([freeBall("blue", BALL), freeBall("red", RED)], 40e-3);
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
        handLoad(track, headOnPath(track, TEST_HEAD, 0), TEST_HEAD, 0, grip, IMPACT_DT);
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
        handLoad(track, on, TEST_HEAD, 0, grip, IMPACT_DT);
        const turn = 1e-5;
        const turned = { ...on, orientation: multiply(axisAngle(track.axis, turn), on.orientation) };
        const load = handLoad(track, turned, TEST_HEAD, 0, grip, IMPACT_DT);
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
        const fed = handLoad(track, on, TEST_HEAD, 0, grip, IMPACT_DT).force;
        const shifted = (d: number): Vec3 =>
            sub(
                handLoad(track, { ...on, position: add(on.position, vec3(d, 0, 0)) }, TEST_HEAD, 0, grip, IMPACT_DT)
                    .force,
                fed,
            );
        expect(shifted(1e-2).x).toBeCloseTo(10 * shifted(1e-3).x, 9);
    });

    describe("held at the arm's posture-holding impedance through the push (gate round 11, 'Posture holding')", () => {
        /** A plausible, unsourced posture-holding impedance, well apart from TEST_FLEX's rhythmic values. */
        const HELD: Hands = { ...TEST_HANDS, flex: { ...TEST_FLEX, hold: { stiffness: 900, damping: 25 } } };
        const force = 40;

        it("blends the gains from the rhythmic flex to the held ones by the hold's weight", () => {
            // Held (weight 1): k = k_hold + κ·|F_ff|, c = c_hold, the grasp's measured viscosity. Weight 0 is the
            // rhythmic flex, k₀ + κ·|F_ff| with c = 2ζ√(k·m_arm); between them each gain is the weighted mean.
            const law = HELD.flex;
            const hold = law.hold as NonNullable<typeof law.hold>;
            const rhythmic = flexGains(law, force);
            expect(flexGains(law, force, 0)).toEqual(rhythmic);
            const held = flexGains(law, force, 1);
            expect(held.stiffness).toBeCloseTo(hold.stiffness + TEST_FLEX.stiffnessPerForce * force, 9);
            expect(held.damping).toBeCloseTo(hold.damping, 12);
            const half = flexGains(law, force, 0.25);
            expect(half.stiffness).toBeCloseTo(0.75 * rhythmic.stiffness + 0.25 * held.stiffness, 9);
            expect(half.damping).toBeCloseTo(0.75 * rhythmic.damping + 0.25 * held.damping, 9);
            // With no hold the weight changes nothing.
            expect(flexGains(TEST_FLEX, force, 1)).toEqual(flexGains(TEST_FLEX, force));
        });

        it("holds until the ball's first departure, then relaxes to the rhythmic flex at the muscles' pace", () => {
            // Gate round 13 ruling, "Relax from first departure" (2026-10-12): from t_d, the first step the face–ball
            // pair is open with the ball separating, the hold's weight is exp(−(t − t_d)/τ_push), so k is continuous at
            // t_d and returns to the rhythmic value. Until a departure the arms hold, the pendulum phase included.
            // Hands travelling along aim reach the pendulum phase partway through a 5 cm push.
            const arc = STILL({
                theta0: -0.3,
                pivotVelocity: vec3(1, 0, 0),
                handReach: 0.05,
                pendulumAt: 0.5,
                pendulumEffort: 1,
                window: 0.005,
                handWindow: 0.005,
            });
            // The same hands without the hold give the rhythmic k₀ + κ·|F_ff| at the same state; the hold adds
            // (k_hold − k₀)·w on top, the κ·|F_ff| term common to both.
            const held = prepareAt(arc, STANDARD_GRAVITY, HELD);
            const plain = prepareAt(arc, STANDARD_GRAVITY);
            const pendulum = (held.push as Push).pendulum as number;
            const tau = HELD.pushResponseTime;
            const departed = pendulum / 2;
            const topStiffness = (track: PreparedTrack, t: number, departedAt: number | null): number => {
                const grip = { ...newGripState(), departedAt };
                handLoad(track, headOnPath(track, TEST_HEAD, t), TEST_HEAD, t, grip, IMPACT_DT);
                return grip.topStiffness;
            };
            const excess = (t: number, departedAt: number | null = departed): number =>
                topStiffness(held, t, departedAt) - topStiffness(plain, t, departedAt);
            const full = (HELD.flex.hold as NonNullable<typeof HELD.flex.hold>).stiffness - TEST_FLEX.stiffness;
            // The flex's force on the forearm is continuous across t_d. The flex takes hold at 1 ms; from then the
            // forearm stays where it was while its intended point moves on, so the spring carries an offset, and a step
            // in k at t_d would step the force by Δk times that offset.
            const hold0 = { ...newGripState(), departedAt: departed };
            handLoad(held, headOnPath(held, TEST_HEAD, 0.001), TEST_HEAD, 0.001, hold0, IMPACT_DT);
            const forearmForce = (t: number): Vec3 => {
                const grip = structuredClone(hold0);
                handLoad(held, headOnPath(held, TEST_HEAD, t), TEST_HEAD, t, grip, IMPACT_DT);
                return (grip.topChain as ArmChain).forearm.force;
            };
            const before = forearmForce(departed - 1e-9);
            expect(dist(forearmForce(departed + 1e-9), before)).toBeLessThan(1e-6 * (1 + length(before)));
            for (const t of [0.001, departed / 2, departed - 1e-9]) {
                expect(excess(t), `held at ${t}`).toBeCloseTo(full, 9);
            }
            expect(Math.abs(excess(departed + 1e-9) - full)).toBeLessThan(1e-4 * full);
            for (const n of [1, 2, 10]) {
                const t = departed + n * tau;
                expect(excess(t), `${n} τ`).toBeCloseTo(full * Math.exp(-n), 6);
            }
            // With no departure the arms still hold, through the pendulum phase too.
            for (const t of [pendulum + tau, pendulum + 10 * tau]) {
                expect(excess(t, null), `no departure, ${t}`).toBeCloseTo(full, 9);
            }
        });

        it("latches the first departure: the first step the face–ball pair opens with the ball separating", () => {
            // A held 3 m/s carry into a free ball (gravity off): the run's departure is the end of the face's first
            // interval on the ball, to within a step, and it stays there through any later taps. A run that strikes no
            // ball never departs; swing mode never records one.
            const ball = vec3(0, 0, 1);
            const begin = vec3(ball.x - R - 1e-6 - TEST_HEAD.length / 2, 0, ball.z);
            const omega0 = 3 / (0.8 + TEST_HEAD.socket.z);
            const arc = levelArc(begin, { mode: "carry", handReach: 0.1, pendulumAt: 1, omega0 });
            const track = prepareAt(arc, 0, HELD);
            const head = headOnPath(track, TEST_HEAD, 0);
            const run = integrate(isolated({ start: head, drive: track, balls: [freeBall("blue", ball)] }), {
                cap: 0.03,
            });
            const first = (run.timeline["face/blue"] ?? [])[0] as { start: number; end: number };
            expect(first).toBeDefined();
            expect(run.departure).toBeDefined();
            expect(Math.abs((run.departure as number) - first.end)).toBeLessThanOrEqual(IMPACT_DT * 1.000001);
            const missed = integrate(isolated({ start: headOnPath(track, TEST_HEAD, 0), drive: track }), { cap: 0.03 });
            expect(missed.departure).toBeUndefined();
            // P2b.2b.2c.3a: a push wherever handReach > 0 (A2 item 8), so the arc without one has a handReach of 0 (was
            // the fixture's 10 m reach, which never bound in swing mode).
            const swing = prepareAt(levelArc(begin, { omega0, handReach: 0 }), 0, HELD);
            const swung = integrate(
                isolated({ start: headOnPath(swing, TEST_HEAD, 0), drive: swing, balls: [freeBall("blue", ball)] }),
                { cap: 0.03 },
            );
            expect(swung.departure).toBeUndefined();
        });
    });

    it("pushes no harder along aim than its springs and dampers once the push has stopped: no brake", () => {
        // Design §7.1: the intended path stops at once, so past the push's end and the pendulum's held slope the
        // planned acceleration is zero and the feed-forward has no deceleration term along aim.
        const arc = STILL({ pivotVelocity: vec3(1, 0, 0), handReach: 0.05, window: 0.005, handWindow: 0.005 });
        const track = prepareAt(arc, 0);
        const end = (track.push as Push).end as number;
        const grip = newGripState();
        for (const t of [end + 0.02, end + 0.05]) {
            const load = handLoad(track, headOnPath(track, TEST_HEAD, t), TEST_HEAD, t, grip, IMPACT_DT);
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
        const plain = handLoad(track, on, TEST_HEAD, t, grip0, IMPACT_DT);
        const a = TEST_HEAD.socket.z + track.arc.radius - track.body.offset;
        const b = TEST_HEAD.socket.z + TEST_HANDS.bottom - track.body.offset;
        for (const [R, P] of [
            [30, 30],
            [TEST_PUSH_FORCE, TEST_PUSH_FORCE],
            [250, TEST_PUSH_FORCE],
        ] as const) {
            const grip = resisted(R);
            const load = handLoad(track, on, TEST_HEAD, t, grip, IMPACT_DT);
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
            expect(handLoad(track, on, TEST_HEAD, t, resisted(R), IMPACT_DT), `R ${R}`).toEqual(plain);
        }
    });

    it("ends with the push: no intent in the pendulum phase", () => {
        const track = prepareAt(PUSHING({ pendulumAt: 0 }), STANDARD_GRAVITY);
        expect((track.push as Push).pendulum).toBe(0);
        const t = 0.002;
        const on = headOnPath(track, TEST_HEAD, t);
        expect(handLoad(track, on, TEST_HEAD, t, resisted(50), IMPACT_DT)).toEqual(
            handLoad(track, on, TEST_HEAD, t, resisted(0), IMPACT_DT),
        );
    });

    it("is never read without a push", () => {
        // P2b.2b.2c.3a A2 item 5: keyed on the push, not the mode (was "is never read in swing mode").
        // P2b.2b.2c.3a: a push wherever handReach > 0 (A2 item 8), so the arc without one has a handReach of 0 (was
        // the fixture's 10 m reach, which never bound in swing mode).
        const track = prepareAt(still({ omega0: 3, handReach: 0 }), STANDARD_GRAVITY);
        expect(track.push).toBeNull();
        const t = 0.002;
        const on = headOnPath(track, TEST_HEAD, t);
        expect(handLoad(track, on, TEST_HEAD, t, resisted(500), IMPACT_DT)).toEqual(
            handLoad(track, on, TEST_HEAD, t, resisted(0), IMPACT_DT),
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
            const load = handLoad(track, state, TEST_HEAD, t, grip, IMPACT_DT);
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

    it("relaxes in the follow-through, where the push never reaches the pendulum phase", () => {
        // With the balls removed, each follow-through step relaxes R̃ towards 0 at the muscles' pace (round-1 review,
        // 894aa76). On a still carry, whose push never reaches its pendulum phase, the intent stays on, so it falls by
        // (1 − response) per step from the impact's last R̃: P_k = R̃₀·(1 − response)^k, R̃₀ the impact's last step's
        // update, R̃ + (R − R̃)·response, of the R̃ that step's intent read. Each step's P is its feed-forward less
        // that of a grip state sensing nothing, at the step's start.
        const ball = vec3(0, 0, 1);
        const begin = vec3(ball.x - R - 1e-6 - TEST_HEAD.length / 2, 0, ball.z);
        const omega0 = 3 / (0.8 + TEST_HEAD.socket.z);
        const track = prepareAt(levelArc(begin, { mode: "carry", handReach: 0.1, pendulumAt: 1, omega0 }), 0);
        expect((track.push as Push).pendulum).toBeNull();
        const response = pushResponse(TEST_HANDS, IMPACT_DT);
        const aim = track.arc.aim;
        const intent = (before: HeadState, t: number, feedForward: Vec3): number =>
            dot(sub(feedForward, handLoad(track, before, TEST_HEAD, t, newGripState(), IMPACT_DT).feedForward), aim);
        const impact: ImpactSnapshot[] = [];
        const follow: number[] = [];
        let before: HeadState | null = null;
        const probe: ImpactProbe = {
            step(s) {
                impact.push(s);
            },
            follow(s) {
                if (follow.length < 400) {
                    follow.push(
                        intent(
                            before ?? (impact[impact.length - 1] as ImpactSnapshot).head,
                            s.t - IMPACT_DT,
                            s.feedForward,
                        ),
                    );
                }
                before = s.head;
            },
        };
        const head = headOnPath(track, TEST_HEAD, 0);
        const setup = isolated({ start: head, drive: track, balls: [freeBall("blue", ball)] });
        integrateStroke(setup, { probe, cap: 3e-3 }, true);
        const last = impact[impact.length - 1] as ImpactSnapshot;
        const lastHand = last.hand as NonNullable<ImpactSnapshot["hand"]>;
        const read = intent(
            (impact[impact.length - 2] as ImpactSnapshot).head,
            last.t - IMPACT_DT,
            lastHand.feedForward,
        );
        let onHead = ZERO;
        for (const c of last.contacts) {
            if (c.key.startsWith("face/")) {
                onHead = sub(onHead, add(scale(c.normal, c.normalForce), c.tangentialForce));
            }
        }
        const sensed = senseResistance(read, Math.max(0, 0 - dot(aim, onHead)), response);
        // R̃ stays under the arm's push, so P is R̃ itself.
        expect(sensed).toBeGreaterThan(1);
        expect(sensed).toBeLessThan(TEST_PUSH_FORCE);
        expect(follow.length).toBe(400);
        follow.forEach((P, k) => {
            expect(Math.abs(P - sensed * (1 - response) ** k), `step ${k}`).toBeLessThan(1e-9 * sensed);
        });
    });

    it("takes no resistance from the turf", () => {
        // A carry head pressed 1 mm into the turf and sliding forward: the turf's friction pushes it back along aim,
        // yet the hands match a replay whose R stays 0.
        const arc = levelArc(vec3(0, 0, TEST_RHO - 1e-3), { mode: "carry", handReach: 0.1, pendulumAt: 1 });
        const track = prepareAt(arc, STANDARD_GRAVITY);
        const turf = testHeadTurf();
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
        // Every mass starts at the head's velocity with every spring unstretched, so the start's energy is `initial`.
        // Semi-implicit Euler holds it to O(ω·dt), ω the chain's fastest mode.
        expect(Math.max(highest - initial, initial - lowest)).toBeLessThan(1e-2 * initial);
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
        handLoad(track, headOnPath(track, TEST_HEAD, 0), TEST_HEAD, 0, grip, IMPACT_DT);
        expect(grip.topChain).not.toBeNull();
        expect(grip.bottomChain).not.toBeNull();
        expect(swungOf(track, grip)).toBe(track.body);
        const t = pendulum + 1e-3;
        const on = headOnPath(track, TEST_HEAD, t);
        const load = handLoad(track, on, TEST_HEAD, t, grip, IMPACT_DT);
        expect(grip.bottomChain).toBeNull();
        expect(grip.topChain).not.toBeNull();
        expect(swungOf(track, grip)).toBe(track.released);
        const skin = TEST_CHAIN.palmSkinMass + TEST_CHAIN.fingerSkinMass;
        expect(track.released.mass).toBeCloseTo(TEST_HEAD.mass + skin, 12);
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

    it("holds a swing arc through the chains too", () => {
        // P2b.2b.2c.3a A2 item 4: the chains on every stroke (was "is never read in swing mode": a swing arc had no
        // released body, and a grip holding chains gave the same load as one without, the chains untouched). A swing
        // arc's contact step takes hold of both chains, and its released body is the top hand's skin alone.
        const track = prepareAt(still({ omega0: 3 }), STANDARD_GRAVITY);
        const skin = TEST_CHAIN.palmSkinMass + TEST_CHAIN.fingerSkinMass;
        expect(track.released.mass).toBeCloseTo(TEST_HEAD.mass + skin, 12);
        const grip = newGripState();
        const t = 0.002;
        handLoad(track, headOnPath(track, TEST_HEAD, t), TEST_HEAD, t, grip, IMPACT_DT);
        expect(grip.topChain).not.toBeNull();
        expect(grip.bottomChain).not.toBeNull();
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
        const body = track.released;
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

describe("one law after contact (P2b.2b.2c.3a A2 item 5)", () => {
    /** A plausible, unsourced posture-holding impedance, well apart from TEST_FLEX's rhythmic values. */
    const HELD: Hands = { ...TEST_HANDS, flex: { ...TEST_FLEX, hold: { stiffness: 900, damping: 25 } } };

    /** One handLoad step on `arc` at t, the head on the path, with `grip` (a fresh one by default). */
    function stepOn(arc: SwingArc, hands: Hands, t: number, grip: GripState = newGripState()): HandLoad {
        const track = prepare(arc, TEST_COUPLING, hands);
        return handLoad(track, headOnPath(track, TEST_HEAD, t), TEST_HEAD, t, grip, IMPACT_DT);
    }

    it("feeds each hand its grip times its moment share, the dip in full", () => {
        // A2 item 4: the top hand's chain is fed γ_T × its share plus F_d, the bottom's g_B × its share. The chains
        // take hold in equilibrium under their feeds (holdChain), so the first step's grip forces are the feeds.
        const arc: SwingArc = { ...TIMED, mode: "swing", slopeHold: 0 };
        const t = 0.009;
        const dip = dipForce(prepare(arc), t);
        const firm = stepOn(arc, TEST_HANDS, t);
        // The swing law fed the bottom hand nothing outside a check; its share here is 11.4 N.
        expect(length(firm.bottom)).toBeGreaterThan(1);
        for (const gripTension of [0.1, 1]) {
            const load = stepOn(arc, { ...TEST_HANDS, gripTension }, t);
            const expected = scale(sub(firm.top, dip), gripTension);
            expect(dist(sub(load.top, dip), expected), `γ_T ${gripTension}`).toBeLessThan(1e-9);
        }
        for (const bottomGrip of [0.25, 1]) {
            const load = stepOn(arc, { ...TEST_HANDS, bottomGrip }, t);
            expect(dist(load.bottom, scale(firm.bottom, bottomGrip)), `g_B ${bottomGrip}`).toBeLessThan(1e-9);
        }
    });

    it("scales the bottom hand's flex by guideEffort outside a check, and leaves a check in full", () => {
        // A2 item 5: the bottom hand flexes at gripGains(·, g_B·e), e = guideEffort outside a check and 1 inside one.
        const bottomStiffness = (arc: SwingArc, guideEffort: number, t: number): number => {
            const grip = newGripState();
            stepOn(arc, { ...TEST_HANDS, guideEffort }, t, grip);
            return grip.bottomStiffness;
        };
        const full = bottomStiffness(still(), 1, 0.02);
        expect(full).toBeGreaterThan(0);
        expect(Math.abs(bottomStiffness(still(), 0.5, 0.02) / full - 0.5)).toBeLessThan(1e-12);
        expect(bottomStiffness(still(), 0, 0.02)).toBe(0);
        const check = still({ omega0: 3, alpha: -300 });
        expect(bottomStiffness(check, 0, 0.005)).toBe(bottomStiffness(check, 1, 0.005));
    });

    it("holds the posture only with a push", () => {
        // A2 item 5: the posture hold, from the first departure, acts only through a push. With none the weight is 0,
        // so the departure changes nothing; with one, held (no departure) and relaxed (long departed) differ.
        const topStiffness = (arc: SwingArc, departedAt: number | null): number => {
            const grip = { ...newGripState(), departedAt };
            stepOn(arc, HELD, 0.002, grip);
            return grip.topStiffness;
        };
        // P2b.2b.2c.3a: a push wherever handReach > 0 (A2 item 8), so the arc without one has a handReach of 0 (was
        // the fixture's 10 m reach, which never bound in swing mode).
        const swing = still({ omega0: 3, handReach: 0 });
        expect(prepare(swing).push).toBeNull();
        expect(topStiffness(swing, null)).toBe(topStiffness(swing, -1e9));
        const carry = still({ mode: "carry", handReach: 0.1, pendulumAt: 1 });
        expect(prepare(carry).push).not.toBeNull();
        expect(topStiffness(carry, null)).not.toBe(topStiffness(carry, -1e9));
    });

    it("lets go of the chains at a stop's hold", () => {
        // A2 item 7: a stop's hold is the firm grip, not the chains, so the gripped step drops both.
        const track = prepare(still({ omega0: 3, alpha: -300 }));
        const t = 0.02;
        const mass = (x: number): ChainMass => ({ position: vec3(x, 2, 3), velocity: vec3(4, x, 6), force: ZERO });
        const arm = (): ArmChain => ({ forearm: mass(1), hand: mass(2), fingers: mass(3), preload: ZERO });
        const grip: GripState = { ...newGripState(), topChain: arm(), bottomChain: arm() };
        handLoad(track, headOnPath(track, TEST_HEAD, t), TEST_HEAD, t, grip, IMPACT_DT, true);
        expect(grip.topChain).toBeNull();
        expect(grip.bottomChain).toBeNull();
    });

    it("records a ball's first departure only with a push", () => {
        // A2 item 5: the first-departure latch feeds the posture hold, which acts only with a push, so a swing arc
        // striking a free ball (gravity off) records none. The carry's case is the latch's own test above.
        // P2b.2b.2c.3a: a push wherever handReach > 0 (A2 item 8), so the arc without one has a handReach of 0 (was
        // the fixture's 10 m reach, which never bound in swing mode).
        const ball = vec3(0, 0, 1);
        const begin = vec3(ball.x - R - 1e-6 - TEST_HEAD.length / 2, 0, ball.z);
        const swing = prepareTrack(
            trackDrive(levelArc(begin, { omega0: 3 / (0.8 + TEST_HEAD.socket.z), handReach: 0 }), TEST_COUPLING, HELD),
            TEST_HEAD,
            0,
        );
        const run = integrate(
            isolated({ start: headOnPath(swing, TEST_HEAD, 0), drive: swing, balls: [freeBall("blue", ball)] }),
            { cap: 0.03 },
        );
        expect(run.timeline["face/blue"] ?? []).not.toHaveLength(0);
        expect(run.departure).toBeUndefined();
    });
});

describe("the bottom hand's opening (P2b.2b.2c.3a A2 item 6)", () => {
    const lever = 0.8 - TEST_HANDS.bottom;

    /** The test head on `track` turned rigidly about its still pivot through `turn`, at rest. */
    function turned(track: PreparedTrack, turn: number): HeadState {
        const orientation = swingOrientation(track.arc.aim, turn);
        const s = rotate(orientation, UP);
        const position = sub(track.arc.pivot, scale(s, track.arc.radius + TEST_HEAD.socket.z));
        return { position, orientation, velocity: ZERO, angularVelocity: ZERO };
    }

    it("never opens on a shaft turning back through the slack", () => {
        // A2 item 6: the reach is signed: a shaft turning back drives into the bottom hand's palm, which stays shut.
        const track = prepare(still(), TEST_COUPLING, TEST_HANDS);
        const grip = newGripState();
        handLoad(track, turned(track, 0), TEST_HEAD, 0, grip, 1e-3);
        handLoad(track, turned(track, (0 - (TEST_HANDS.reachSlack + 1e-3)) / lever), TEST_HEAD, 1e-3, grip, 1e-3);
        expect(grip.releasedAt).toBeNull();
    });

    it("then pushes forward along e with pendulumEffort·F_pendulum until vertical", () => {
        // A2 item 6: once open, on every stroke, the bottom hand pushes along e with pendulumEffort × F_pendulum until
        // the shaft passes vertical. The head leans 0.08 rad back, short of vertical.
        const opened = (pendulumEffort: number, vertical = false): Vec3 => {
            const track = prepare(still({ pendulumEffort }), TEST_COUPLING, TEST_HANDS);
            const grip: GripState = { ...newGripState(), contactPitch: 0, releasedAt: 1e-3, vertical };
            return handLoad(track, turned(track, -0.08), TEST_HEAD, 2e-3, grip, IMPACT_DT).bottom;
        };
        const e = forwardOf(turned(prepare(still()), -0.08), vec3(1, 0, 0));
        expect(dist(opened(0.5), scale(e, 0.5 * TEST_PENDULUM_FORCE))).toBeLessThan(1e-9);
        expect(length(opened(0))).toBe(0);
        expect(length(opened(0.5, true))).toBe(0);
    });
});
