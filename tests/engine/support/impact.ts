/**
 * Test-only mallet, face and impact helpers. Plausible but deliberately NOT sourced (as fixtures.ts), so expectations
 * do not move when reference data does. src/ must never import this file.
 */
import { ZERO, add, length, lengthSq, scale, sub, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import { lawFromContactTime, type PairLaw } from "../../../src/engine/impact/contactLaw";
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
import type { ContactState, DriveSample, FaceMaterial, HeadState, MalletHead } from "../../../src/engine/impact/types";
import type { BallParams, BallState, BallStates, World } from "../../../src/engine/types";
import { STANDARD_GRAVITY, uprightsOf } from "../../../src/engine/world";
import { TEST_BALL, ballAt, hoopWithUprightAt, testHoop } from "./fixtures";

const R = TEST_BALL.radius;

/** A 1.0 kg solid round head, 0.23 m long and 0.064 m across, shaft socket on top at the middle. */
export const TEST_HEAD: MalletHead = {
    mass: 1,
    inertia: solidCylinderInertia(1, 0.23, 0.032),
    length: 0.23,
    radius: 0.032,
    socket: vec3(0, 0, 0.032),
};

export const TEST_FACE: FaceMaterial = { restitution: 0.8, friction: 0.4, contactTime: 6e-4 };

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
        drive: o.drive ? o.drive(travel) : coast(3e-3, head),
    };
}

/** The face law of TEST_FACE (or `face`) against a test ball, for a head of mass `headMass`. */
export function faceLaw(face: FaceMaterial = TEST_FACE, headMass = TEST_HEAD.mass): PairLaw {
    const massEff = (headMass * TEST_BALL.mass) / (headMass + TEST_BALL.mass);
    return lawFromContactTime(massEff, face.restitution, face.contactTime, face.friction);
}

/** A ball free in space at `position`, without turf under it. */
export function freeBall(
    id: ImpactBall["id"],
    position: Vec3,
    velocity: Vec3 = ZERO,
    turf: PairLaw | null = null,
): ImpactBall {
    return { id, state: { position, velocity, angularVelocity: ZERO }, turf };
}

/**
 * An isolated set-up for `integrate`: by default the head parked far away (it never touches anything) and undriven,
 * gravity off, the test face and test ball–ball laws, no balls and no obstacles. Override what a case needs.
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
        drive: [{ t: 0, force: ZERO }],
        face: faceLaw(),
        ballBall: lawFromContactTime(TEST_BALL.mass / 2, 0.8, 7e-4, 0.05),
        ball: TEST_BALL,
        gravity: 0,
        balls: [],
        obstacles: [],
        ...overrides,
    };
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
    const rot = head.inertia.x * w.x * w.x + head.inertia.y * w.y * w.y + head.inertia.z * w.z * w.z;
    return 0.5 * head.mass * lengthSq(state.velocity) + 0.5 * rot;
}

/**
 * Kinetic, gravitational and stored spring energy (J) of a snapshot. The contact depth is the pre-step value, against
 * post-step states: a time-level mix, biased by about 0.6% of an undamped contact's energy (see invariants.test.ts).
 */
export function impactEnergy(s: ImpactSnapshot, head: MalletHead, ball: BallParams, gravity: number): number {
    const inertia = 0.4 * ball.mass * ball.radius * ball.radius;
    let e = headKinetic(s.head, head) + head.mass * gravity * s.head.position.z;
    for (const b of s.balls) {
        e += 0.5 * ball.mass * lengthSq(b.velocity) + 0.5 * inertia * lengthSq(b.angularVelocity);
        e += ball.mass * gravity * b.position.z;
    }
    for (const c of s.contacts) {
        e += 0.5 * c.law.stiffness * c.depth * c.depth + 0.5 * c.law.tangentialStiffness * lengthSq(c.spring);
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
            lateral: uni(-0.8, 0.8) * TEST_HEAD.radius,
            vertical: uni(-0.6, 0.6) * TEST_HEAD.radius,
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

export function mirrorContact(c: ContactState): ContactState {
    return {
        ...c,
        position: mirrorVec(c.position),
        orientation: mirrorQuat(c.orientation),
        velocity: mirrorVec(c.velocity),
        angularVelocity: mirrorSpin(c.angularVelocity),
        drive: c.drive.map((s) => ({ t: s.t, force: mirrorVec(s.force) })),
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
