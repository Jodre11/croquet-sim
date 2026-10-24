/**
 * Test-only mallet, face and impact helpers. Plausible but deliberately NOT sourced (as fixtures.ts), so expectations
 * do not move when reference data does. src/ must never import this file.
 */
import { ZERO, add, cross, dot, length, lengthSq, scale, sub, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import { lawFromContactTime } from "../../../src/engine/impact/contactLaw";
import type { ImpactBall, ImpactProbe, ImpactSetup, ImpactSnapshot } from "../../../src/engine/impact/integrate";
import {
    IDENTITY,
    axisAngle,
    multiply,
    rotate,
    rotateInverse,
    solidCylinderInertia,
    type Quaternion,
} from "../../../src/engine/impact/rigidBody";
import { validateImpact } from "../../../src/engine/impact/simulateImpact";
import {
    headOnPath,
    malletBody,
    pathAt,
    prepareTrack,
    swingOrientation,
    type FreePendulum,
    type PreparedTrack,
} from "../../../src/engine/impact/track";
import { BED_CELL } from "../../../src/engine/impact/turfBed";
import type {
    BedLaw,
    ContactState,
    Coupling,
    Dip,
    Drive,
    DriveSample,
    FaceLaw,
    FaceMaterial,
    FlexLaw,
    HandChain,
    Hands,
    HeadState,
    HeadTurfLaw,
    MalletHead,
    SwingArc,
    TrackDrive,
} from "../../../src/engine/impact/types";
import { sinCos } from "../../../src/engine/math/elementary";
import type { BallParams, BallState, BallStates, World } from "../../../src/engine/types";
import { STANDARD_GRAVITY, uprightsOf } from "../../../src/engine/world";
import { TEST_BALL, TEST_TURF, ballAt, hoopWithUprightAt, testHoop } from "./fixtures";

const R = TEST_BALL.radius;

/** The test head's radius (m): its face's half-height and the socket's height. */
export const TEST_RHO = 0.032;

/** A 1.0 kg solid round head, 0.23 m long and 0.064 m across, shaft socket on top at the middle. */
export const TEST_HEAD: MalletHead = {
    mass: 1,
    inertia: solidCylinderInertia(1, 0.23, TEST_RHO),
    length: 0.23,
    shape: { kind: "cylinder", radius: TEST_RHO },
    socket: vec3(0, 0, TEST_RHO),
    shaft: { mass: 0, length: 0.9 },
};

/**
 * A 1.0 kg rounded box head as long as TEST_HEAD, its face 64 mm square with 3 mm edges, its socket at TEST_HEAD's
 * height so that levelArc places it (P2b.2b.2b.2c design §3.2). Its inertia is a square section's, I_y = I_z and
 * I_x = m·(h_y² + h_z²)/3, its moment about the shaft TEST_HEAD's I_z. Unsourced, as TEST_HEAD.
 */
export const TEST_BOX: MalletHead = {
    mass: 1,
    inertia: vec3((2 * TEST_RHO * TEST_RHO) / 3, TEST_HEAD.inertia.z, TEST_HEAD.inertia.z),
    length: 0.23,
    shape: { kind: "box", halfWidth: TEST_RHO, halfHeight: TEST_RHO, edgeRadius: 0.003 },
    socket: vec3(0, 0, TEST_RHO),
    shaft: { mass: 0, length: 0.9 },
};

/**
 * A sharp 1.0 kg box (edge radius 0; P2b.2b.2b.3 design §7.1), 0.231 m long and 0.065 m wide, as tall as TEST_HEAD:
 * centred over the origin, no column centre of the 2 mm lattice falls on its sole's edges (116 columns along, 32
 * across), so the columns under it are counted exactly. Its inertia is TEST_BOX's; unsourced, as TEST_HEAD.
 */
export const TEST_SHARP: MalletHead = {
    ...TEST_BOX,
    length: 0.231,
    shape: { kind: "box", halfWidth: 0.0325, halfHeight: TEST_RHO, edgeRadius: 0 },
};

export const TEST_FACE: FaceMaterial = { friction: 0.4 };

/** A coupling for tracked test heads: plausible, not sourced (design §3.4 sets the engine's); contact at t = 0. */
export const TEST_COUPLING: Coupling = { period: 0.04, dampingRatio: 0.7, relaxAt: 0 };

/**
 * A plausible, unsourced arm (P2b.2b.2b.2b design §3.1): k₀ 200 N/m, κ 20 /m, ζ 0.3 on 0.5 kg, with no posture hold
 * through the push, so its gains are the rhythmic law's throughout.
 */
export const TEST_FLEX: FlexLaw = {
    stiffness: 200,
    stiffnessPerForce: 20,
    dampingRatio: 0.3,
    endpointMass: 0.5,
    hold: null,
};

/** A plausible, unsourced pendulum push (N). */
export const TEST_PENDULUM_FORCE = 20;

/** A plausible, unsourced cap (N) on the hands' push intent (P2b.2b.2b.2b gate ruling 2026-10-11). */
export const TEST_PUSH_FORCE = 100;

/** A plausible, unsourced time constant (s) of the push intent's response (gate ruling amendment, 2026-10-11). */
export const TEST_PUSH_RESPONSE_TIME = 0.03;

/**
 * A grip limit (N) far above any test hand's force (P2b.2b.2b.3 plan decision 12), so that tests written before the
 * limit keep their figures; the limit's own tests set theirs.
 */
export const TEST_GRIP_LIMIT = 1e5;

/**
 * A plausible, unsourced hand–arm chain (P2b.2b.2b.2b gate round 3 ruling, 2026-10-11), in kg, N/m and N·s/m: forearm
 * 0.3, hand 0.2, fingers 0.08, each skin 0.015; wrist 10⁴ and 40, knuckle 4000 and 60, palm 4·10⁴ and 60, fingers 10⁵
 * and 70.
 */
export const TEST_CHAIN: HandChain = {
    forearmMass: 0.3,
    handMass: 0.2,
    fingerMass: 0.08,
    palmSkinMass: 0.015,
    fingerSkinMass: 0.015,
    wristStiffness: 1e4,
    wristDamping: 40,
    knuckleStiffness: 4000,
    knuckleDamping: 60,
    palmStiffness: 4e4,
    palmDamping: 60,
    fingerStiffness: 1e5,
    fingerDamping: 70,
};

/**
 * Two firm hands with no arm mass, so a swing-mode swung body is the head and head-only closed forms hold (a carry's
 * also carries the chains' skin); a full guide.
 */
export const TEST_HANDS: Hands = {
    bottom: 0.4,
    gripTension: 1,
    bottomGrip: 1,
    armMass: 0,
    reachSlack: 0.03,
    guideEffort: 1,
    flex: TEST_FLEX,
    pendulumForce: TEST_PENDULUM_FORCE,
    pushForce: TEST_PUSH_FORCE,
    pushResponseTime: TEST_PUSH_RESPONSE_TIME,
    chain: TEST_CHAIN,
    gripLimit: TEST_GRIP_LIMIT,
};

/** A dip of no depth. */
export const NO_DIP: Dip = { start: 0, duration: 0.01, depth: 0 };

/** A tracked drive along `arc`, by default with TEST_COUPLING and TEST_HANDS. */
export function trackDrive(arc: SwingArc, coupling: Coupling = TEST_COUPLING, hands: Hands = TEST_HANDS): TrackDrive {
    return { kind: "track", arc, coupling, hands };
}

/**
 * A still, level swing-mode arc whose test head on the path at t = 0 has its centre at `centre`: aim +x, radius 0.8,
 * θ₀, ω₀ and α 0, both windows 0.01 s from t = 0, no dip, contact at t = 0, a reach of 10 m (it never binds), a hands'
 * arc of radius 11 m (above the reach), lowest halfway, a pendulum phase at 0.8 of the push with no effort, and no
 * ground depth. `o` overrides any field; the pivot follows an overridden aim, radius or θ₀ unless `o` sets it.
 */
export function levelArc(centre: Vec3, o: Partial<SwingArc> = {}): SwingArc {
    const aim = o.aim ?? vec3(1, 0, 0);
    const radius = o.radius ?? 0.8;
    const theta0 = o.theta0 ?? 0;
    const socket = add(centre, rotate(swingOrientation(aim, theta0), TEST_HEAD.socket));
    const [s, c] = sinCos(theta0);
    return {
        pivot: sub(socket, scale(sub(scale(aim, s), vec3(0, 0, c)), radius)),
        pivotVelocity: ZERO,
        pivotAcceleration: ZERO,
        handStart: 0,
        handWindow: 0.01,
        aim,
        radius,
        theta0,
        omega0: 0,
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
        ...o,
    };
}

/**
 * A swing-mode track's θ and ω at its pendulum's window's end by RK4 at step `h` (s) of
 * θ̈ = (−W·sin θ − M·d·(A·t̂))/I_P + 6·ᾱ·s(1 − s) from thetaArc and omegaArc (P2b.2b.2c.2d design §3.1): the hand
 * integration of gravity through the pulse. A, the pivot's acceleration with the dip, is pathAt's socket acceleration
 * less the pendulum's own terms, r·α·t̂ − r·ω²·r̂, at the path's θ, ω and α; t̂ in θ̈ is then the integrated θ's.
 */
export function integratePulse(track: PreparedTrack, h: number): { readonly theta: number; readonly omega: number } {
    const free = track.free as FreePendulum;
    const { aim, radius, arcStart, window, alpha } = track.arc;
    const up = vec3(0, 0, 1);
    const tangent = (th: number) => add(scale(aim, Math.cos(th)), scale(up, Math.sin(th)));
    const radial = (th: number) => sub(scale(aim, Math.sin(th)), scale(up, Math.cos(th)));
    const pivotAcceleration = (t: number): Vec3 => {
        const p = pathAt(track, t);
        const w = dot(p.angularVelocity, track.axis);
        return add(
            sub(p.socketAcceleration, scale(tangent(p.theta), radius * p.pendulumAcceleration)),
            scale(radial(p.theta), radius * w * w),
        );
    };
    const accel = (th: number, t: number): number => {
        const s = (t - arcStart) / window;
        const along = dot(pivotAcceleration(t), tangent(th));
        return (-free.weight * Math.sin(th) - free.inertial * along) / free.inertia + 6 * alpha * s * (1 - s);
    };
    let theta = track.thetaArc;
    let omega = track.omegaArc;
    const n = Math.round(window / h);
    for (let i = 0; i < n; i++) {
        const t = arcStart + i * h;
        const k1 = [omega, accel(theta, t)] as const;
        const k2 = [omega + (h / 2) * k1[1], accel(theta + (h / 2) * k1[0], t + h / 2)] as const;
        const k3 = [omega + (h / 2) * k2[1], accel(theta + (h / 2) * k2[0], t + h / 2)] as const;
        const k4 = [omega + h * k3[1], accel(theta + h * k3[0], t + h)] as const;
        theta += (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
        omega += (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    }
    return { theta, omega };
}

/** A tracked contact state: `head` on `drive`'s path at time `t` (s), with the test face. */
export function onArc(drive: TrackDrive, head: MalletHead = TEST_HEAD, t = 0): ContactState {
    return { head, face: TEST_FACE, ...headOnPath(prepareTrack(drive, head, STANDARD_GRAVITY), head, t), drive };
}

/** A drive that carries the head's weight plus `force` (world frame) for `window` seconds. */
export function drive(force: Vec3, window: number, head: MalletHead = TEST_HEAD): DriveSample[] {
    const total = add(force, vec3(0, 0, head.mass * STANDARD_GRAVITY));
    return [
        { t: 0, force: total },
        { t: window, force: total },
    ];
}

/** A drive that only carries the head's weight for `window` seconds: the head coasts. */
export function coast(window = 3e-3, head: MalletHead = TEST_HEAD): DriveSample[] {
    return drive(ZERO, window, head);
}

/** How a test head meets a ball. Angles in rad; offsets in m, in the face's own frame. */
export interface StrikeOptions {
    readonly speed?: number;
    /** Head axis and travel turned about z from +x. */
    readonly yaw?: number;
    /** Head axis pitched nose-down (positive: the front face points below horizontal). */
    readonly pitch?: number;
    /** Travel below horizontal. */
    readonly descent?: number;
    /** Ball centre offset from the face axis along the head's body y and body z. */
    readonly lateral?: number;
    readonly vertical?: number;
    /** Gap (m) between the front face and the ball at t = 0. */
    readonly gap?: number;
    /** Drive, as a function of the unit direction of travel; default `coast()`. */
    readonly drive?: (travel: Vec3) => readonly DriveSample[];
    readonly head?: MalletHead;
    readonly face?: FaceMaterial;
}

/** A contact state whose front (+x) face, `gap` short of the ball centred at `centre`, travels towards it. */
export function strike(centre: Vec3, o: StrikeOptions = {}): ContactState {
    const head = o.head ?? TEST_HEAD;
    const yaw = axisAngle(vec3(0, 0, 1), o.yaw ?? 0);
    const orientation = multiply(yaw, axisAngle(vec3(0, 1, 0), o.pitch ?? 0));
    const axis = rotate(orientation, vec3(1, 0, 0));
    const across = add(
        scale(rotate(orientation, vec3(0, 1, 0)), o.lateral ?? 0),
        scale(rotate(orientation, vec3(0, 0, 1)), o.vertical ?? 0),
    );
    const faceCentre = sub(sub(centre, scale(axis, R + (o.gap ?? 1e-3))), across);
    const descent = o.descent ?? 0;
    const travel = rotate(yaw, vec3(Math.cos(descent), 0, -Math.sin(descent)));
    return {
        head,
        face: o.face ?? TEST_FACE,
        position: sub(faceCentre, scale(axis, head.length / 2)),
        orientation,
        velocity: scale(travel, o.speed ?? 2),
        angularVelocity: ZERO,
        drive: { kind: "force", samples: o.drive ? o.drive(travel) : coast(3e-3, head) },
    };
}

/** The face law of a test head of mass `headMass` against a test ball, with TEST_FACE's friction (or `face`'s). */
export function faceLaw(face: FaceMaterial = TEST_FACE, headMass = TEST_HEAD.mass): FaceLaw {
    return { mass: (headMass * TEST_BALL.mass) / (headMass + TEST_BALL.mass), friction: face.friction };
}

/** A ball free in space at `position`, by default without turf under it; `turf` gives it a bed. */
export function freeBall(
    id: ImpactBall["id"],
    position: Vec3,
    velocity: Vec3 = ZERO,
    turf: BedLaw | null = null,
): ImpactBall {
    return { id, state: { position, velocity, angularVelocity: ZERO }, turf };
}

/** A plausible test bed (fixtures' TEST_TURF): k_w 3e8 N/m³, τ_r 2 ms, µ `friction`, 2 mm cells. */
export function testBed(friction = 0.3): BedLaw {
    return { modulus: TEST_TURF.bedModulus, recovery: TEST_TURF.bedRecovery, friction, cell: BED_CELL };
}

/**
 * A plausible test head–turf law (P2b.2b.2b.3 design §4) on the test bed: k_w 3e8 N/m³, τ_r 2 ms, p_y 200 kPa (so a
 * fresh column yields at 0.67 mm), c 100 kPa, N_c 1.7, µ 0.5, 2 mm columns. Unsourced, as fixtures.ts. `o` overrides.
 */
export function testHeadTurf(o: Partial<HeadTurfLaw> = {}): HeadTurfLaw {
    return {
        modulus: TEST_TURF.bedModulus,
        recovery: TEST_TURF.bedRecovery,
        yieldPressure: TEST_TURF.turfYield,
        matStrength: TEST_TURF.turfMatStrength,
        ploughFactor: 1.7,
        friction: 0.5,
        cell: BED_CELL,
        ...o,
    };
}

/**
 * An isolated set-up for `integrate`: by default the head parked far away (it never touches anything) and undriven,
 * gravity off, the test face and test ball–ball laws, no balls, no obstacles and no head–turf pair. Override what a
 * case needs.
 */
export function isolated(overrides: Partial<ImpactSetup> = {}): ImpactSetup {
    const start: HeadState = {
        position: vec3(-100, 0, 10),
        orientation: IDENTITY,
        velocity: ZERO,
        angularVelocity: ZERO,
    };
    return {
        head: TEST_HEAD,
        start,
        drive: { kind: "force", samples: [{ t: 0, force: ZERO }] },
        face: faceLaw(),
        ballBall: lawFromContactTime(TEST_BALL.mass / 2, 0.8, 7e-4, 0.05),
        ball: TEST_BALL,
        gravity: 0,
        balls: [],
        obstacles: [],
        headTurf: null,
        ...overrides,
    };
}

/**
 * An isolated, tracked set-up whose hands apply nothing (P2b.2b.2b.2c design §7.1), so that `head` moves freely from
 * `centre`, level, at `velocity`: gravity off, a still level arc, a coupling of damping ratio 0 relaxed at t = 0 and
 * no arm mass. After relaxAt every hand force, feed-forward and twist is then exactly zero. Its face–ball pairs meet
 * the whole head (headBallContact), as a tracked drive's do.
 */
export function freeTracked(head: MalletHead, centre: Vec3, velocity: Vec3, balls: readonly ImpactBall[]): ImpactSetup {
    const drive = trackDrive(levelArc(centre), { period: 0.04, dampingRatio: 0, relaxAt: 0 });
    return isolated({
        head,
        start: { position: centre, orientation: IDENTITY, velocity, angularVelocity: ZERO },
        drive: prepareTrack(drive, head, 0),
        balls,
    });
}

/** A probe that counts the steps in which pair `key` carried a positive normal force, and keeps the last snapshot. */
export function counter(key: string): ImpactProbe & { closed: number; last: ImpactSnapshot | null } {
    const probe = {
        closed: 0,
        last: null as ImpactSnapshot | null,
        step(s: ImpactSnapshot): void {
            if (s.contacts.some((c) => c.key === key && c.normalForce > 0)) {
                probe.closed++;
            }
            probe.last = s;
        },
    };
    return probe;
}

/** A probe that keeps every snapshot (use with short impacts only). */
export function recorder(): ImpactProbe & { readonly snapshots: ImpactSnapshot[] } {
    const snapshots: ImpactSnapshot[] = [];
    return {
        snapshots,
        step: (s) => {
            snapshots.push(s);
        },
    };
}

function headKinetic(state: HeadState, head: MalletHead): number {
    const w = rotateInverse(state.orientation, state.angularVelocity);
    if (head.shaft.mass === 0) {
        const rot = head.inertia.x * w.x * w.x + head.inertia.y * w.y * w.y + head.inertia.z * w.z * w.z;
        return 0.5 * head.mass * lengthSq(state.velocity) + 0.5 * rot;
    }
    // The whole mallet (P2b.2b.2b.2c design §4.3): its centre δ up the shaft from the head's, moving at v + ω × δ·s.
    const body = malletBody(head);
    const centre = add(
        state.velocity,
        cross(state.angularVelocity, rotate(state.orientation, vec3(0, 0, body.offset))),
    );
    const I = body.inertia;
    return 0.5 * body.mass * lengthSq(centre) + 0.5 * (I.x * w.x * w.x + I.y * w.y * w.y + I.z * w.z * w.z);
}

/**
 * Kinetic and gravitational energy (J) of a snapshot, and the stored energy of each contact, as the integrator reports
 * it (`storedEnergy`), with its tangential spring's. The contact depth is the pre-step value, against post-step
 * states: a time-level mix, biased by about 0.6% of an undamped contact's energy (see invariants.test.ts). With a
 * shaft, the whole mallet's kinetic energy and the shaft's weight at its centre (P2b.2b.2b.2c design §4.3).
 */
export function impactEnergy(s: ImpactSnapshot, head: MalletHead, ball: BallParams, gravity: number): number {
    const inertia = 0.4 * ball.mass * ball.radius * ball.radius;
    let e = headKinetic(s.head, head) + head.mass * gravity * s.head.position.z;
    if (head.shaft.mass !== 0) {
        const rise = rotate(s.head.orientation, vec3(0, 0, head.socket.z + head.shaft.length / 2));
        e += head.shaft.mass * gravity * (s.head.position.z + rise.z);
    }
    for (const b of s.balls) {
        e += 0.5 * ball.mass * lengthSq(b.velocity) + 0.5 * inertia * lengthSq(b.angularVelocity);
        e += ball.mass * gravity * b.position.z;
    }
    for (const c of s.contacts) {
        e += c.storedEnergy + 0.5 * c.law.tangentialStiffness * lengthSq(c.spring);
    }
    return e;
}

/** World position of the head's socket. */
export function socketAt(state: HeadState, head: MalletHead): Vec3 {
    return add(state.position, rotate(state.orientation, head.socket));
}

/** Kinetic energy of the initial state of a ContactState (head only; the balls start at rest). */
export function initialHeadEnergy(c: ContactState): number {
    return headKinetic(c, c.head);
}

/** A named public-path scenario on the test world: a contact state and balls at rest on the line y = 0. */
export interface Scenario {
    readonly name: string;
    readonly contact: ContactState;
    readonly balls: BallStates;
}

const BLUE = ballAt(5, 0);

/**
 * The scenarios the invariants, convergence and mirror tests share: a centre strike, a straight croquet stroke, a cut
 * (yawed, off-centre), a steep descending strike above the equator that drives the ball into the turf, a checked
 * stroke and a pushed stroke.
 */
export const SCENARIOS: readonly Scenario[] = [
    { name: "centre", contact: strike(BLUE.position), balls: { blue: BLUE } },
    {
        name: "croquet",
        contact: strike(BLUE.position, { speed: 3 }),
        balls: { blue: BLUE, red: ballAt(5 + 2 * R, 0) },
    },
    {
        name: "cut",
        contact: strike(BLUE.position, { speed: 2.5, yaw: 0.3, lateral: 0.01 }),
        balls: { blue: BLUE },
    },
    {
        name: "descending",
        contact: strike(BLUE.position, { speed: 3, descent: 0.5, pitch: 0.5 }),
        balls: { blue: BLUE },
    },
    {
        name: "check",
        contact: strike(BLUE.position, { speed: 3, drive: (t) => drive(scale(t, -150), 2e-3) }),
        balls: { blue: BLUE },
    },
    {
        name: "push",
        contact: strike(BLUE.position, { speed: 2, drive: (t) => drive(scale(t, 150), 3e-3) }),
        balls: { blue: BLUE },
    },
];

/** Seed of the impact fuzz's stroke sequence (fuzz.test.ts, scripts/impactDigest.ts). */
export const FUZZ_SEED = 23;

/**
 * One random stroke inside the fuzz ranges, the widest that raise no impact-cap (pre-flight). A draw that
 * validateImpact rejects (the head below the turf at a steep pitch) is drawn again; the sequence stays deterministic.
 */
export function randomStroke(random: () => number, world: World): { contact: ContactState; balls: BallStates } {
    const uni = (a: number, b: number): number => a + (b - a) * random();
    const blue = ballAt(10, 10);
    for (;;) {
        const force = random() < 1 / 3 ? 0 : uni(-300, 300);
        const window = uni(0.5e-3, 5e-3);
        const speed = uni(0.5, 8);
        // A checking drive whose impulse takes half the head's momentum may stop it short of the ball: a whiff, which
        // only the cap ends (design §5). Draw again.
        if (force < 0 && -force * window >= 0.5 * TEST_HEAD.mass * speed) {
            continue;
        }
        const contact = strike(blue.position, {
            speed,
            yaw: uni(-0.3, 0.3),
            descent: uni(0, 0.5),
            pitch: uni(-0.2, 0.6),
            lateral: uni(-0.8, 0.8) * TEST_RHO,
            vertical: uni(-0.6, 0.6) * TEST_RHO,
            drive: (t) => drive(scale(t, force), window),
        });
        const balls: BallStates = { blue };
        if (random() < 0.5) {
            const a = uni(-1, 1);
            balls.red = ballAt(10 + 2 * R * Math.cos(a), 10 + 2 * R * Math.sin(a));
        }
        try {
            validateImpact(contact, balls, world);
        } catch {
            continue;
        }
        return { contact, balls };
    }
}

/** Reflection across the plane y = 0: positions, velocities and forces flip y. */
export function mirrorVec(v: Vec3): Vec3 {
    return vec3(v.x, 0 - v.y, v.z);
}

/** Angular velocity is a pseudovector: under the reflection it flips x and z. */
export function mirrorSpin(w: Vec3): Vec3 {
    return vec3(0 - w.x, w.y, 0 - w.z);
}

/** The reflected rotation M·R·M as a quaternion: (w, −x, y, −z). */
export function mirrorQuat(q: Quaternion): Quaternion {
    return { w: q.w, x: 0 - q.x, y: q.y, z: 0 - q.z };
}

export function mirrorBall(s: BallState): BallState {
    return {
        position: mirrorVec(s.position),
        velocity: mirrorVec(s.velocity),
        angularVelocity: mirrorSpin(s.angularVelocity),
    };
}

/**
 * A drive reflected across y = 0. A tracked drive reflects its arc's vectors and its downswing's; its angles, tables,
 * coupling and hands are unchanged: the pitch axis aim × ẑ is a pseudovector and reflects as a spin does, so a turn θ
 * about it reflects to the same θ about the reflected axis, and the path's orientation rot(n, θ) ⊗ q_aim reflects
 * factor by factor.
 */
function mirrorDrive(d: Drive): Drive {
    if (d.kind === "force") {
        return { kind: "force", samples: d.samples.map((s) => ({ t: s.t, force: mirrorVec(s.force) })) };
    }
    const { arc } = d;
    const down = arc.downswing;
    return {
        ...d,
        arc: {
            ...arc,
            pivot: mirrorVec(arc.pivot),
            pivotVelocity: mirrorVec(arc.pivotVelocity),
            pivotAcceleration: mirrorVec(arc.pivotAcceleration),
            aim: mirrorVec(arc.aim),
            ...(down === undefined
                ? {}
                : {
                      downswing: {
                          ...down,
                          handsTop: mirrorVec(down.handsTop),
                          across: mirrorVec(down.across),
                          drop: mirrorVec(down.drop),
                          tangent: mirrorVec(down.tangent),
                      },
                  }),
        },
    };
}

export function mirrorContact(c: ContactState): ContactState {
    return {
        ...c,
        position: mirrorVec(c.position),
        orientation: mirrorQuat(c.orientation),
        velocity: mirrorVec(c.velocity),
        angularVelocity: mirrorSpin(c.angularVelocity),
        drive: mirrorDrive(c.drive),
    };
}

/** Seed of the obstacle fuzz's stroke sequence (fuzz.test.ts). */
export const OBSTACLE_FUZZ_SEED = 29;

/**
 * Largest surface gap (m) from blue to upright 1/a. Pre-flight: no reach tried, up to 0.2 m (peg 0.3 m), raises an
 * impact-cap; wider reaches only dilute the share of strokes meeting an obstacle (17.45 % here, 6.35 % at 0.2 m).
 */
const UPRIGHT_REACH = 0.06;
/** Largest surface gap (m) from blue to the peg (with UPRIGHT_REACH, pre-flight). */
const PEG_REACH = 0.1;
/** Draws allowed before randomObstacleStroke gives up: a bound against a livelock, not a physical value. */
const OBSTACLE_DRAW_CAP = 1000;

/**
 * One random stroke of the impact fuzz (randomStroke) with hoop "1" and the peg moved within reach of blue: upright
 * "1/a" up to UPRIGHT_REACH from blue's surface and the peg up to PEG_REACH, each at a random bearing. A draw that
 * puts two obstacles within a ball's width of each other, or that validateImpact rejects, is drawn again.
 */
export function randomObstacleStroke(
    random: () => number,
    base: World,
): { contact: ContactState; balls: BallStates; world: World } {
    const uni = (a: number, b: number): number => a + (b - a) * random();
    const r = testHoop("1", 0, 0).uprightRadius;
    for (let attempt = 0; attempt < OBSTACLE_DRAW_CAP; attempt++) {
        const { contact, balls } = randomStroke(random, base);
        const ua = uni(-Math.PI, Math.PI);
        const ud = R + r + uni(0, UPRIGHT_REACH);
        const hoop = hoopWithUprightAt("1", 10 + ud * Math.cos(ua), 10 + ud * Math.sin(ua));
        const pa = uni(-Math.PI, Math.PI);
        const pd = R + base.peg.radius + uni(0, PEG_REACH);
        const peg = { ...base.peg, centre: vec3(10 + pd * Math.cos(pa), 10 + pd * Math.sin(pa), 0) };
        const world: World = { ...base, hoops: [hoop], peg };
        const [a, b] = uprightsOf(hoop, base.ballUpright);
        const crowded = [a, b].some((u) => length(sub(u.centre, peg.centre)) < u.radius + peg.radius + 2 * R + 1e-3);
        if (crowded) {
            continue;
        }
        try {
            validateImpact(contact, balls, world);
        } catch (error) {
            if (error instanceof RangeError) {
                continue;
            }
            throw error;
        }
        return { contact, balls, world };
    }
    throw new Error(`randomObstacleStroke: no valid stroke in ${OBSTACLE_DRAW_CAP} draws`);
}
