/**
 * Phase 1 of a shot (P2b.1 design §3). Checks the ContactState and the balls. Solves every contact law once: face–ball
 * and ball–ball once, ball–turf once per ball from the surface where it lies, and the head–turf law once for a tracked
 * drive, from the surface under the head's lowest point. Prepares a tracked drive once (track.ts). Starts each ball at
 * its static turf sink m·g/k_turf, so that the impact does not open with a spurious bounce. Each obstacle's law is
 * solved once: the ball's mass (the obstacle is immovable), the obstacle's material and its own contact time.
 * Integrates the impact and hands the balls over to phase 2.
 */
import { CONTACT_TOLERANCE } from "../detect";
import { contactReference } from "../../reference/index";
import { dot, horizontal, length, sub, vec3, type Vec3 } from "../math/vec3";
import { BALL_IDS, type BallParams, type BallState, type BallStates, type SurfaceProps, type World } from "../types";
import { obstaclesOf, validateWorld } from "../world";
import { lawFromContactTime, lawFromStiffness, type PairLaw } from "./contactLaw";
import { headBottom, headLowestPoint, outsideObstacle } from "./contacts";
import { handover } from "./handover";
import { rotateInverse } from "./rigidBody";
import { integrate, type ImpactBall, type ImpactOptions, type ImpactSetup } from "./integrate";
import { FREE_STEP, pitchAxis, prepareTrack } from "./track";
import type { ContactState, DriveSample, Downswing, ForceDrive, ImpactResult, StrokeMode, TrackDrive } from "./types";

/**
 * Tolerance on |q|² − 1 for a ContactState's orientation, and on a tracked drive's aim and swing plane (P2b.2b.1
 * design §3.6). Numerical, not physical: a few ulps of a normalised vector.
 */
const UNIT_TOLERANCE = 1e-12;

/**
 * Fraction of FREE_STEP by which a downswing table's last full-step sample may miss its bounds. Numerical, not
 * physical: it absorbs rounding in the cut fraction (release + (count − 2)·FREE_STEP lands a few 1e-18 s off).
 */
const END_TOLERANCE = 1e-9;

/**
 * Bound on prepareImpact's placement passes over the obstacles. Numerical, not physical: the overlaps left are within
 * CONTACT_TOLERANCE, so the passes settle in a few; it matches the handover's HANDOVER_PASSES.
 */
const PLACEMENT_PASSES = 64;

/**
 * Friction of the mallet head on the turf (P2b.2b.1 design §4.1; reference/contact.json): the analogue of a ball
 * sliding on the turf. Provisional; P2b.2b.2 sources it.
 */
export const HEAD_TURF_FRICTION = contactReference.headTurfFriction.value;

/**
 * The head–turf law of a tracked drive, or null for a force table (design §4.1): the turf's stiffness, and damping
 * solved from its restitution with the head's mass, sampled once at the head's lowest point at t = 0.
 */
function headTurfLaw(contact: ContactState, world: World): PairLaw | null {
    if (contact.drive.kind === "force") {
        return null;
    }
    const surface = world.lawn.surfaceAt(headBottom(contact, contact.head));
    return lawFromStiffness(contact.head.mass, surface.turfRestitution, surface.turfStiffness, HEAD_TURF_FRICTION);
}

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

function finiteNumber(value: number, name: string): void {
    if (!Number.isFinite(value)) {
        fail(`${name} must be finite (got ${value})`);
    }
}

/** A time (s from t = 0) that must be finite and not negative. */
function notBefore(value: number, name: string): void {
    if (!(value >= 0) || !Number.isFinite(value)) {
        fail(`${name} must be a non-negative finite time (got ${value})`);
    }
}

/** Checks a force table: not empty, starting at t = 0, times increasing strictly, every force finite. */
function validateForce(drive: ForceDrive): void {
    const { samples } = drive;
    if (samples.length === 0 || (samples[0] as DriveSample).t !== 0) {
        fail("drive must start at t = 0");
    }
    samples.forEach((s, i) => {
        finite(s.force, `drive[${i}].force`);
        if (!Number.isFinite(s.t) || (i > 0 && !(s.t > (samples[i - 1] as DriveSample).t))) {
            fail("drive times must increase strictly");
        }
    });
}

/**
 * Checks a tracked drive's downswing (P2b.2b.2a design §3): a negative release; a finite top, a non-negative span;
 * finite hands, Δ_h in the swing plane and Δ_z vertical; in carry mode a positive tempo with release = −tempo and no
 * table; in swing mode no tempo, a positive span and a finite table of θ, ω and α of one length, at least 2, whose
 * samples every FREE_STEP from the release end at contact.
 */
function validateDownswing(down: Downswing, mode: StrokeMode, n: Vec3): void {
    finiteNumber(down.release, "arc.downswing.release");
    if (!(down.release < 0)) {
        fail(`arc.downswing.release must be negative (got ${down.release})`);
    }
    finiteNumber(down.thetaTop, "arc.downswing.thetaTop");
    finiteNumber(down.span, "arc.downswing.span");
    friction(down.span, "arc.downswing.span");
    finite(down.handsTop, "arc.downswing.handsTop");
    finite(down.across, "arc.downswing.across");
    finite(down.drop, "arc.downswing.drop");
    if (!(Math.abs(dot(down.across, n)) <= UNIT_TOLERANCE * length(down.across))) {
        fail("arc.downswing.across must lie in the swing plane");
    }
    if (!(down.drop.x === 0 && down.drop.y === 0)) {
        fail("arc.downswing.drop must be vertical");
    }
    if (mode === "carry") {
        const { tempo } = down;
        if (tempo === null || !(tempo > 0) || down.release !== 0 - tempo || down.theta.length > 0) {
            fail("arc.downswing must be closed-form in carry mode: a positive tempo, release = −tempo, no table");
        }
        return;
    }
    const count = down.theta.length;
    if (
        down.tempo !== null ||
        !(down.span > 0) ||
        count < 2 ||
        down.omega.length !== count ||
        down.alpha.length !== count
    ) {
        fail("arc.downswing must be tabulated in swing mode: no tempo, a positive span, θ, ω and α of one length ≥ 2");
    }
    for (let i = 0; i < count; i++) {
        finiteNumber(down.theta[i] as number, `arc.downswing.theta[${i}]`);
        finiteNumber(down.omega[i] as number, `arc.downswing.omega[${i}]`);
        finiteNumber(down.alpha[i] as number, `arc.downswing.alpha[${i}]`);
    }
    // The last full step lies within one FREE_STEP before contact, give or take END_TOLERANCE of a step.
    const last = down.release + (count - 2) * FREE_STEP;
    if (!(last <= FREE_STEP * END_TOLERANCE && last + FREE_STEP * (1 + END_TOLERANCE) >= 0)) {
        fail("arc.downswing's table must end at contact: its samples every FREE_STEP from the release");
    }
}

/**
 * Checks a tracked drive (P2b.2b.1 design §3.6), in this order: every vector and angle finite; a positive radius,
 * windows and dip duration; non-negative start times, contact time and dip start; a non-negative dip depth; a mode of
 * "swing" or "carry"; a non-negative reach and ground depth; aim a horizontal unit vector within UNIT_TOLERANCE; a
 * positive period, a non-negative damping ratio and relaxation time; the bottom hand between the socket and the top
 * hand, both grips in (0, 1], a non-negative arm mass and reach slack, a guide effort in [0, 1]; the pivot's velocity
 * and acceleration in the swing plane, their component along the pitch axis within UNIT_TOLERANCE of their size; and a
 * downswing, if given, well formed (validateDownswing). The head need not start on the path.
 */
function validateTrack(drive: TrackDrive): void {
    const { arc, coupling, hands } = drive;
    finite(arc.pivot, "arc.pivot");
    finite(arc.pivotVelocity, "arc.pivotVelocity");
    finite(arc.pivotAcceleration, "arc.pivotAcceleration");
    finite(arc.aim, "arc.aim");
    finiteNumber(arc.theta0, "arc.theta0");
    finiteNumber(arc.omega0, "arc.omega0");
    finiteNumber(arc.alpha, "arc.alpha");
    positive(arc.radius, "arc.radius");
    positive(arc.window, "arc.window");
    positive(arc.handWindow, "arc.handWindow");
    positive(arc.dip.duration, "arc.dip.duration");
    notBefore(arc.arcStart, "arc.arcStart");
    notBefore(arc.handStart, "arc.handStart");
    notBefore(arc.contactAt, "arc.contactAt");
    notBefore(arc.dip.start, "arc.dip.start");
    friction(arc.dip.depth, "arc.dip.depth");
    if (arc.mode !== "swing" && arc.mode !== "carry") {
        fail(`arc.mode must be "swing" or "carry" (got ${arc.mode})`);
    }
    friction(arc.handReach, "arc.handReach");
    friction(arc.groundDepth, "arc.groundDepth");
    const { aim } = arc;
    if (!(Math.abs(aim.z) <= UNIT_TOLERANCE && Math.abs(dot(aim, aim) - 1) <= UNIT_TOLERANCE)) {
        fail("arc.aim must be a horizontal unit vector");
    }
    positive(coupling.period, "coupling.period");
    friction(coupling.dampingRatio, "coupling.dampingRatio");
    notBefore(coupling.relaxAt, "coupling.relaxAt");
    if (!(hands.bottom > 0 && hands.bottom < arc.radius)) {
        fail(`hands.bottom must lie in (0, arc.radius) (got ${hands.bottom})`);
    }
    restitution(hands.gripTension, "hands.gripTension");
    restitution(hands.bottomGrip, "hands.bottomGrip");
    friction(hands.armMass, "hands.armMass");
    friction(hands.reachSlack, "hands.reachSlack");
    if (!(hands.guideEffort >= 0 && hands.guideEffort <= 1)) {
        fail(`hands.guideEffort must lie in [0, 1] (got ${hands.guideEffort})`);
    }
    const n = pitchAxis(aim);
    if (!(Math.abs(dot(arc.pivotVelocity, n)) <= UNIT_TOLERANCE * length(arc.pivotVelocity))) {
        fail("arc.pivotVelocity must lie in the swing plane");
    }
    if (!(Math.abs(dot(arc.pivotAcceleration, n)) <= UNIT_TOLERANCE * length(arc.pivotAcceleration))) {
        fail("arc.pivotAcceleration must lie in the swing plane");
    }
    if (arc.downswing !== undefined) {
        validateDownswing(arc.downswing, arc.mode, n);
    }
}

/**
 * Depth (m) at which a ball at rest sinks into the turf, m·g/k_turf: where its turf spring carries its weight. The one
 * definition both validateImpact and prepareImpact use, so the validated position is where the impact starts the ball.
 */
function staticSink(ball: BallParams, gravity: number, surface: SurfaceProps): number {
    return (ball.mass * gravity) / surface.turfStiffness;
}

/**
 * Distance (m) from `centre` to the solid head cylinder (axis = body x, half-length L/2, radius r), or 0 inside it.
 * Covers the faces, the rims and the barrel, which `faceContact` does not (it misses the barrel and accepts a rim
 * overlap as OFF_FACE).
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
 * - two balls overlapping, or a ball overlapping an obstacle, by more than CONTACT_TOLERANCE (a ball touching one is
 *   accepted, and prepareImpact starts it at zero gap);
 * - the head (faces, rims or barrel) in a ball at its static sink, or in the turf, at t = 0;
 * - a force table that is empty, does not start at 0 or does not increase strictly;
 * - a tracked drive whose arc, coupling or hands are out of range (P2b.2b.1 design §3.6; the head need not start on
 *   its path);
 * - for a tracked drive, turf under the head's lowest point with a non-positive stiffness or a restitution outside
 *   (0, 1] (the head–turf law, P2b.2b.1 design §4.1);
 * - a non-positive mass, inertia, length, radius or contact time;
 * - a restitution outside (0, 1] (face, ball–ball, ball–upright, peg) or a negative friction;
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
    restitution(world.ballUpright.restitution, "ballUpright.restitution");
    restitution(world.peg.material.restitution, "peg.material.restitution");
    finite(contact.position, "position");
    finite(contact.velocity, "velocity");
    finite(contact.angularVelocity, "angularVelocity");
    const q = contact.orientation;
    if (!(Math.abs(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z - 1) <= UNIT_TOLERANCE)) {
        fail("orientation must be a unit quaternion");
    }
    if (contact.drive.kind === "force") {
        validateForce(contact.drive);
    } else {
        validateTrack(contact.drive);
        const surface = world.lawn.surfaceAt(headBottom(contact, head));
        positive(surface.turfStiffness, "turfStiffness under the head");
        restitution(surface.turfRestitution, "turfRestitution under the head");
    }
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
            if (length(horizontal(sub(p, o.centre))) - R - o.radius < 0 - CONTACT_TOLERANCE) {
                fail(`ball ${id} overlaps ${o.id}`);
            }
        }
        for (const other of present.slice(i + 1)) {
            if (length(sub(p, (balls[other] as BallState).position)) - 2 * R < 0 - CONTACT_TOLERANCE) {
                fail(`balls ${id} and ${other} overlap`);
            }
        }
        // The whole cylinder, with CONTACT_TOLERANCE: a face exactly touching the ball is valid at any orientation.
        // Checked where the impact starts the ball, at its static sink (prepareImpact): a face tilted upwards that
        // touches the ball at z = R would otherwise start pressed sink·n_z into it.
        const sunk = vec3(p.x, p.y, R - staticSink(world.ball, world.gravity, surface));
        if (cylinderDistance(contact, sunk) < R - CONTACT_TOLERANCE) {
            fail(`head penetrates ball ${id}`);
        }
    });
}

/**
 * Solves every law and places each ball at its static turf sink: z = R − m·g/k_turf, where its turf spring carries
 * exactly its weight. A tracked drive is prepared once (prepareTrack): its windows' end states, its reach, its swung
 * body and, in swing mode, its free pendulum's table. Touching balls stay touching, as equal balls on equal turf sink
 * equally. Input must have passed validateImpact. A ball touching an obstacle, which validateImpact accepts within
 * CONTACT_TOLERANCE, is moved horizontally outward until its penetration is at most zero (at most CONTACT_TOLERANCE): a
 * closed pair from t = 0 would hold the impact open against turf friction and fake a crush on a legal stroke (P2b.2a
 * design §4). Correcting for one obstacle can push the ball back into another, so the ordered pass over the obstacles
 * repeats until a pass moves nothing, at most PLACEMENT_PASSES times; a ball clear after the first pass is not moved
 * again. Throws an Error if the last pass still moved a ball, i.e. the placement did not settle.
 */
export function prepareImpact(contact: ContactState, balls: BallStates, world: World): ImpactSetup {
    const { ball, gravity } = world;
    const obstacles = obstaclesOf(world);
    const entries: ImpactBall[] = [];
    for (const id of BALL_IDS) {
        const s = balls[id];
        if (!s) {
            continue;
        }
        const surface = world.lawn.surfaceAt(s.position);
        const sink = staticSink(ball, gravity, surface);
        let position = vec3(s.position.x, s.position.y, s.position.z - sink);
        let settled = false;
        for (let pass = 0; pass < PLACEMENT_PASSES && !settled; pass++) {
            settled = true;
            for (const o of obstacles) {
                const next = outsideObstacle(position, ball.radius, o);
                if (next !== position) {
                    position = next;
                    settled = false;
                }
            }
        }
        if (!settled) {
            throw new Error(`placing ball ${id} clear of the obstacles did not settle in ${PLACEMENT_PASSES} passes`);
        }
        entries.push({
            id,
            state: { ...s, position },
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
        drive: contact.drive.kind === "force" ? contact.drive : prepareTrack(contact.drive, contact.head, gravity),
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
        obstacles: obstacles.map((o) => ({
            id: o.id,
            centre: o.centre,
            radius: o.radius,
            law: lawFromContactTime(ball.mass, o.material.restitution, o.contactTime, o.material.friction),
        })),
        headTurf: headTurfLaw(contact, world),
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
    const handed = handover(run.balls, world.ball.radius, obstaclesOf(world));
    return { ...run, handover: handed.balls, overlapCorrection: handed.overlapCorrection };
}
