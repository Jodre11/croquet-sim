/**
 * Phase 1 of a shot (P2b.1 design §3). Checks the ContactState and the balls. Solves every contact law once: face–ball
 * and ball–ball once, ball–turf once per ball from the surface where it lies. Starts each ball at its static turf sink
 * m·g/k_turf, so that the impact does not open with a spurious bounce. Integrates the impact and hands the balls over
 * to phase 2.
 */
import { CONTACT_TOLERANCE } from "../detect";
import { horizontal, length, sub, vec3, type Vec3 } from "../math/vec3";
import { BALL_IDS, type BallState, type BallStates, type World } from "../types";
import { obstaclesOf, validateWorld } from "../world";
import { lawFromContactTime, lawFromStiffness } from "./contactLaw";
import { OFF_FACE, faceContact, headLowestPoint } from "./contacts";
import { handover } from "./handover";
import { rotateInverse } from "./rigidBody";
import { integrate, type ImpactBall, type ImpactOptions, type ImpactSetup } from "./integrate";
import type { ContactState, DriveSample, ImpactResult } from "./types";

/** Tolerance on |q|² − 1 for a ContactState's orientation. Numerical, not physical: a few ulps of a normalised q. */
const UNIT_TOLERANCE = 1e-12;

function fail(message: string): never {
    throw new RangeError(message);
}

function positive(value: number, name: string): void {
    if (!(value > 0) || !Number.isFinite(value)) {
        fail(`${name} must be a positive finite number (got ${value})`);
    }
}

function restitution(value: number, name: string): void {
    if (!(value > 0 && value <= 1)) {
        fail(`${name} must lie in (0, 1] (got ${value})`);
    }
}

function friction(value: number, name: string): void {
    if (!(value >= 0) || !Number.isFinite(value)) {
        fail(`${name} must be non-negative (got ${value})`);
    }
}

function finite(v: Vec3, name: string): void {
    if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) {
        fail(`${name} must be finite`);
    }
}

/**
 * Distance (m) from `centre` to the solid head cylinder (axis = body x, half-length L/2, radius r), or 0 inside it.
 * Covers the faces, the rims and the barrel, which `faceContact` alone does not (it misses the barrel and accepts a
 * rim overlap as OFF_FACE).
 */
function cylinderDistance(contact: ContactState, centre: Vec3): number {
    const p = rotateInverse(contact.orientation, sub(centre, contact.position));
    const axial = Math.max(Math.abs(p.x) - contact.head.length / 2, 0);
    const radial = Math.max(Math.sqrt(p.y * p.y + p.z * p.z) - contact.head.radius, 0);
    return Math.sqrt(axial * axial + radial * radial);
}

/**
 * Throws a RangeError if the impact's input is invalid (design §3):
 * - a ball not at rest on the turf;
 * - two balls overlapping, or a ball touching an obstacle within CONTACT_TOLERANCE (ball–obstacle contact is not
 *   modelled in the impact);
 * - the head (faces, rims or barrel) in a ball, or in the turf, at t = 0;
 * - a drive that is empty, does not start at 0 or does not increase strictly;
 * - a non-positive mass, inertia, length, radius or contact time;
 * - a restitution outside (0, 1] or a negative friction;
 * - a non-unit orientation.
 */
export function validateImpact(contact: ContactState, balls: BallStates, world: World): void {
    const { head, face } = contact;
    const R = world.ball.radius;
    positive(head.mass, "head.mass");
    positive(head.inertia.x, "head.inertia.x");
    positive(head.inertia.y, "head.inertia.y");
    positive(head.inertia.z, "head.inertia.z");
    positive(head.length, "head.length");
    positive(head.radius, "head.radius");
    finite(head.socket, "head.socket");
    positive(face.contactTime, "face.contactTime");
    restitution(face.restitution, "face.restitution");
    friction(face.friction, "face.friction");
    positive(world.ballBallContactTime, "ballBallContactTime");
    restitution(world.ballBall.restitution, "ballBall.restitution");
    finite(contact.position, "position");
    finite(contact.velocity, "velocity");
    finite(contact.angularVelocity, "angularVelocity");
    const q = contact.orientation;
    if (!(Math.abs(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z - 1) <= UNIT_TOLERANCE)) {
        fail("orientation must be a unit quaternion");
    }
    if (contact.drive.length === 0 || (contact.drive[0] as DriveSample).t !== 0) {
        fail("drive must start at t = 0");
    }
    contact.drive.forEach((s, i) => {
        finite(s.force, `drive[${i}].force`);
        if (!Number.isFinite(s.t) || (i > 0 && !(s.t > (contact.drive[i - 1] as DriveSample).t))) {
            fail("drive times must increase strictly");
        }
    });
    if (headLowestPoint(contact, head) < 0) {
        fail("head penetrates the turf");
    }
    const present = BALL_IDS.filter((id) => balls[id]);
    const obstacles = obstaclesOf(world);
    present.forEach((id, i) => {
        const { position: p, velocity: v, angularVelocity: w } = balls[id] as BallState;
        const still = v.x === 0 && v.y === 0 && v.z === 0 && w.x === 0 && w.y === 0 && w.z === 0;
        if (!still || p.z !== R || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
            fail(`ball ${id} is not at rest on the turf`);
        }
        const surface = world.lawn.surfaceAt(p);
        positive(surface.turfStiffness, `turfStiffness at ball ${id}`);
        restitution(surface.turfRestitution, `turfRestitution at ball ${id}`);
        friction(surface.slidingFriction, `slidingFriction at ball ${id}`);
        for (const o of obstacles) {
            if (length(horizontal(sub(p, o.centre))) - R - o.radius <= CONTACT_TOLERANCE) {
                fail(`ball ${id} touches ${o.id}`);
            }
        }
        for (const other of present.slice(i + 1)) {
            if (length(sub(p, (balls[other] as BallState).position)) - 2 * R < 0 - CONTACT_TOLERANCE) {
                fail(`balls ${id} and ${other} overlap`);
            }
        }
        const touch = faceContact(contact, head, p, R);
        if ((touch !== null && touch !== OFF_FACE) || cylinderDistance(contact, p) < R - CONTACT_TOLERANCE) {
            fail(`head penetrates ball ${id}`);
        }
    });
}

/**
 * Solves every law and places each ball at its static turf sink: z = R − m·g/k_turf, where its turf spring carries
 * exactly its weight. Touching balls stay touching, as equal balls on equal turf sink equally. Input must have passed
 * validateImpact.
 */
export function prepareImpact(contact: ContactState, balls: BallStates, world: World): ImpactSetup {
    const { ball, gravity } = world;
    const entries: ImpactBall[] = [];
    for (const id of BALL_IDS) {
        const s = balls[id];
        if (!s) {
            continue;
        }
        const surface = world.lawn.surfaceAt(s.position);
        const sink = (ball.mass * gravity) / surface.turfStiffness;
        entries.push({
            id,
            state: { ...s, position: vec3(s.position.x, s.position.y, s.position.z - sink) },
            turf: lawFromStiffness(ball.mass, surface.turfRestitution, surface.turfStiffness, surface.slidingFriction),
        });
    }
    const faceMass = (contact.head.mass * ball.mass) / (contact.head.mass + ball.mass);
    return {
        head: contact.head,
        start: {
            position: contact.position,
            orientation: contact.orientation,
            velocity: contact.velocity,
            angularVelocity: contact.angularVelocity,
        },
        drive: contact.drive,
        face: lawFromContactTime(faceMass, contact.face.restitution, contact.face.contactTime, contact.face.friction),
        ballBall: lawFromContactTime(
            ball.mass / 2,
            world.ballBall.restitution,
            world.ballBallContactTime,
            world.ballBall.friction,
        ),
        ball,
        gravity,
        balls: entries,
    };
}

/**
 * Simulates the impact of `contact` on the balls at rest (design §3): validates, prepares, integrates and hands over.
 * Throws a RangeError on invalid input (validateImpact). Wiring into a whole shot is P2b.2's `simulateShot`.
 */
export function simulateImpact(
    contact: ContactState,
    balls: BallStates,
    world: World,
    options: ImpactOptions = {},
): ImpactResult {
    validateWorld(world);
    validateImpact(contact, balls, world);
    const run = integrate(prepareImpact(contact, balls, world), options);
    const handed = handover(run.balls, world.ball.radius);
    return { ...run, handover: handed.balls, overlapCorrection: handed.overlapCorrection };
}
