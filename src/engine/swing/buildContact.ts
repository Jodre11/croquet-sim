/**
 * The swing model (P2b.2b.1 design §5.2). From a ShotSetup and the world it derives the mallet head, its wooden face,
 * its state at t = 0 and the tracked drive:
 * 1. the arc radius r = top: the shaft is rigid, so the pivot is the top hand, `top` from the socket along it;
 * 2. the contact angle θ_c = −lean, positive for a rising strike;
 * 3. the head's pitch about n at contact, θ_c: the head is rigid on the shaft, rot(n, θ_c) ⊗ q_aim, so a positive lean
 *    pitches the face down;
 * 4. the face's point at (up, side) from its centre on the line through the sunk centre along −f, R + START_GAP from
 *    it; the head's centre L/2 behind the face's, the socket on top of the head;
 * 5. the pivot, r from the socket up the shaft;
 * 6. the hands' speed V₀ = handShare·speed·aim, and ω₀, the larger root of |V₀ + ω₀·n × (c − pivot)| = speed;
 * 7. the arcs' changes, against the head's speed: α = drive·speedGain·(speed/ℓ)/window, ℓ the pivot's distance from
 *    the head's centre, and A = drive·handGain·speed·aim/handWindow; the dip, handDrop over dropTime; the mode, the
 *    ground depth and the reach (the shot's, else the preset's); the coupling HAND_COUPLING; the hands the stance's,
 *    with the profile's body;
 * 8. the lead L, the earliest action's: the impact starts L before contact, everything coasting until its action, and
 *    the grips relax at contact;
 * 9. (swingApproach) the coasting path's lowest clearance over the turf in the MAX_LEAD before contact;
 * 10. the head a solid cylinder of the profile's mallet.
 * The head starts on its own path (headOnPath at t = 0), so the hands start with no error to take up.
 */
import { contactReference, malletReference } from "../../reference/index";
import { headLowestPoint } from "../impact/contacts";
import { rotate, solidCylinderInertia, type Quaternion } from "../impact/rigidBody";
import {
    HAND_COUPLING,
    headOnPath,
    pendulumOf,
    pitchAxis,
    prepareTrack,
    swingOrientation,
    swungBody,
} from "../impact/track";
import type { ContactState, FaceMaterial, Hands, MalletHead, StrokeMode, SwingArc, TrackDrive } from "../impact/types";
import { sinCos } from "../math/elementary";
import { add, cross, dot, length, scale, sub, vec3, type Vec3 } from "../math/vec3";
import type { BallState, World } from "../types";
import type { DownswingInput, PlannedDownswing } from "./downswing";
import type { ShotSetup, SwingDrive, SwingShape, SwingStance } from "./types";

/**
 * Gap (m) between the face and the striker's sunk surface at contact (design §5.2 step 4). Numerical, not physical:
 * it keeps rounding from starting the face inside the ball, and at 1 m/s the head closes it within a step.
 */
export const START_GAP = 1e-6;

/**
 * The longest lead-in (s): how early an action may be timed (design §5.2 step 8), and how far back swingApproach
 * looks. A modelling bound, not physical: the rigid pendulum's backswing is not credible much further back.
 */
export const MAX_LEAD = 0.06;

/** Spacing (s) of swingApproach's samples. Numerical: 0.5 ms moves a 3 m/s head 1.5 mm. */
const APPROACH_STEP = 5e-4;

/** The engine's face: wood (reference/mallet.json), with the sourced face–ball contact time. */
const WOOD: FaceMaterial = {
    restitution: malletReference.faceRestitution.value,
    friction: malletReference.faceFriction.value,
    contactTime: contactReference.faceBallContactTime.value,
};

/** A stance's numbers, each checked finite by name (a missing one included). */
const STANCE_NUMBERS: readonly (keyof SwingStance)[] = ["lean", "top", "bottom", "gripTension", "bottomGrip"];

/** A drive entry's numbers (all but its mode), each checked finite by name. */
const DRIVE_NUMBERS: readonly Exclude<keyof SwingDrive, "mode">[] = [
    "speedGain",
    "window",
    "handShare",
    "handGain",
    "handWindow",
    "handDrop",
    "dropTime",
    "handReach",
    "groundDepth",
    "guideEffort",
];

function fail(message: string): never {
    throw new RangeError(message);
}

function finiteNumber(value: number, name: string): void {
    if (!Number.isFinite(value)) {
        fail(`${name} must be finite (got ${value})`);
    }
}

function positive(value: number, name: string): void {
    if (!(value > 0)) {
        fail(`${name} must be positive (got ${value})`);
    }
}

function nonNegative(value: number, name: string): void {
    if (!(value >= 0)) {
        fail(`${name} must be non-negative (got ${value})`);
    }
}

function grip(value: number, name: string): void {
    if (!(value > 0 && value <= 1)) {
        fail(`${name} must lie in (0, 1] (got ${value})`);
    }
}

function effort(value: number, name: string): void {
    if (!(value >= 0 && value <= 1)) {
        fail(`${name} must lie in [0, 1] (got ${value})`);
    }
}

/**
 * The contact state of `setup` on `world` (design §5.2). Throws a RangeError naming the check (design §5.3) for:
 * - a striker absent from the setup, or a stroke type missing from the profile's stance or drive;
 * - a mode other than "swing" or "carry";
 * - a non-finite number, or a non-positive mallet dimension or mass;
 * - top ≤ 0, or top > shaftLength (the top hand off the shaft); bottom outside (0, top); |lean| ≥ 90°;
 * - speed ≤ 0; |drive| > 1; the contact off the face (√(up² + side²) ≥ the head's radius);
 * - window, handWindow or dropTime ≤ 0; speedGain < 0; gripTension or bottomGrip outside (0, 1]; handShare outside
 *   [0, 1]; handDrop < 0; the preset's or the shot's handReach < 0; groundDepth < 0; the preset's or the shot's
 *   guideEffort outside [0, 1]; armMass < 0; reachSlack < 0;
 * - an action timed more than MAX_LEAD early;
 * - the head's lowest point below the turf at contact, or where an early action begins.
 * A swing that meets the turf between its start and the ball is not rejected: the impact simulates it.
 */
export function buildContact(setup: ShotSetup, world: World): ContactState {
    const { stroke, profile } = setup;
    const striker = setup.balls[setup.striker];
    if (!striker) {
        fail(`striker ${setup.striker} is not in the setup`);
    }
    const { type, timing } = stroke;
    const stance = profile.stance[type];
    const push = profile.drive[type];
    if (!stance) {
        fail(`profile.stance has no entry for ${type}`);
    }
    if (!push) {
        fail(`profile.drive has no entry for ${type}`);
    }
    if (push.mode !== "swing" && push.mode !== "carry") {
        fail(`profile.drive.${type}.mode must be "swing" or "carry" (got ${String(push.mode)})`);
    }
    finiteNumber(stroke.aim, "stroke.aim");
    finiteNumber(stroke.speed, "stroke.speed");
    finiteNumber(stroke.drive, "stroke.drive");
    finiteNumber(stroke.contact.up, "stroke.contact.up");
    finiteNumber(stroke.contact.side, "stroke.contact.side");
    finiteNumber(timing.arc, "stroke.timing.arc");
    finiteNumber(timing.hands, "stroke.timing.hands");
    finiteNumber(timing.dip, "stroke.timing.dip");
    if (stroke.handReach !== undefined) {
        finiteNumber(stroke.handReach, "stroke.handReach");
    }
    if (stroke.guideEffort !== undefined) {
        finiteNumber(stroke.guideEffort, "stroke.guideEffort");
    }
    for (const key of STANCE_NUMBERS) {
        finiteNumber(stance[key], `profile.stance.${type}.${key}`);
    }
    for (const key of DRIVE_NUMBERS) {
        finiteNumber(push[key], `profile.drive.${type}.${key}`);
    }
    const { mallet, body } = profile;
    for (const [key, value] of Object.entries(mallet)) {
        finiteNumber(value, `profile.mallet.${key}`);
        positive(value, `profile.mallet.${key}`);
    }
    finiteNumber(body.armMass, "profile.body.armMass");
    finiteNumber(body.reachSlack, "profile.body.reachSlack");

    const { lean, top, bottom, gripTension, bottomGrip } = stance;
    positive(top, `profile.stance.${type}.top`);
    if (top > mallet.shaftLength) {
        fail(
            `the top hand is off the shaft: profile.stance.${type}.top is ${top} m, beyond shaftLength ` +
                `${mallet.shaftLength} m`,
        );
    }
    if (!(bottom > 0 && bottom < top)) {
        fail(`profile.stance.${type}.bottom must lie in (0, top) = (0, ${top}) m (got ${bottom})`);
    }
    if (!(Math.abs(lean) < Math.PI / 2)) {
        fail(`profile.stance.${type}.lean must lie within ±90° (got ${lean} rad)`);
    }
    if (!(stroke.speed > 0)) {
        fail(`stroke.speed must be positive (got ${stroke.speed})`);
    }
    if (!(Math.abs(stroke.drive) <= 1)) {
        fail(`stroke.drive must lie in [-1, 1] (got ${stroke.drive})`);
    }
    const rho = mallet.headDiameter / 2;
    const { up, side } = stroke.contact;
    if (!(Math.sqrt(up * up + side * side) < rho)) {
        fail(`the contact lies off the face: (${up}, ${side}) m from its centre, whose radius is ${rho} m`);
    }
    positive(push.window, `profile.drive.${type}.window`);
    positive(push.handWindow, `profile.drive.${type}.handWindow`);
    positive(push.dropTime, `profile.drive.${type}.dropTime`);
    nonNegative(push.speedGain, `profile.drive.${type}.speedGain`);
    grip(gripTension, `profile.stance.${type}.gripTension`);
    grip(bottomGrip, `profile.stance.${type}.bottomGrip`);
    if (!(push.handShare >= 0 && push.handShare <= 1)) {
        fail(`profile.drive.${type}.handShare must lie in [0, 1] (got ${push.handShare})`);
    }
    nonNegative(push.handDrop, `profile.drive.${type}.handDrop`);
    nonNegative(push.handReach, `profile.drive.${type}.handReach`);
    if (stroke.handReach !== undefined) {
        nonNegative(stroke.handReach, "stroke.handReach");
    }
    nonNegative(push.groundDepth, `profile.drive.${type}.groundDepth`);
    effort(push.guideEffort, `profile.drive.${type}.guideEffort`);
    if (stroke.guideEffort !== undefined) {
        effort(stroke.guideEffort, "stroke.guideEffort");
    }
    nonNegative(body.armMass, "profile.body.armMass");
    nonNegative(body.reachSlack, "profile.body.reachSlack");
    // Step 8's lead: the earliest action's, none on time.
    const lead = Math.max(0, 0 - timing.arc, 0 - timing.hands, 0 - timing.dip);
    if (lead > MAX_LEAD) {
        fail(`an action is timed more than ${MAX_LEAD} s early (${lead} s before contact)`);
    }

    // Steps 1 to 5 and 10.
    const pose = contactPose(setup, world);
    const { aim, orientation, radius, pivot, head } = pose;
    const thetaC = pose.thetaContact;
    const headCentre = pose.headCentre;
    // Step 6: |w|²·ω² + 2·(V₀·w)·ω + |V₀|² − speed² = 0 with w = n × (c − pivot); |V₀| ≤ speed, so the larger root is
    // never negative.
    const pivotVelocity = scale(aim, push.handShare * stroke.speed);
    const lever = cross(pitchAxis(aim), sub(headCentre, pivot));
    const a = dot(lever, lever);
    const b = dot(pivotVelocity, lever);
    const c = dot(pivotVelocity, pivotVelocity) - stroke.speed * stroke.speed;
    const omega0 = (Math.sqrt(b * b - a * c) - b) / a;
    // Steps 7 and 8, the arc expressed from the start, L before contact.
    const arc: SwingArc = {
        pivot: sub(pivot, scale(pivotVelocity, lead)),
        pivotVelocity,
        pivotAcceleration: scale(aim, (stroke.drive * push.handGain * stroke.speed) / push.handWindow),
        handStart: lead + timing.hands,
        handWindow: push.handWindow,
        aim,
        radius,
        theta0: thetaC - omega0 * lead,
        omega0,
        alpha: (stroke.drive * push.speedGain * stroke.speed) / (length(lever) * push.window),
        arcStart: lead + timing.arc,
        window: push.window,
        dip: { start: lead + timing.dip, duration: push.dropTime, depth: push.handDrop },
        contactAt: lead,
        mode: push.mode,
        handReach: stroke.handReach ?? push.handReach,
        groundDepth: push.groundDepth,
    };
    const hands: Hands = {
        bottom,
        gripTension,
        bottomGrip,
        armMass: body.armMass,
        reachSlack: body.reachSlack,
        guideEffort: stroke.guideEffort ?? push.guideEffort,
    };
    const drive: TrackDrive = {
        kind: "track",
        arc,
        coupling: { period: HAND_COUPLING.period, dampingRatio: HAND_COUPLING.dampingRatio, relaxAt: lead },
        hands,
    };
    const still = vec3(0, 0, 0);
    const atContact = headLowestPoint(
        { position: headCentre, orientation, velocity: still, angularVelocity: still },
        head,
    );
    if (atContact < 0) {
        fail(`the head is in the turf at contact: its lowest point is ${0 - atContact} m below it`);
    }
    const start = headOnPath(prepareTrack(drive, head, world.gravity), head, 0);
    const clearance = headLowestPoint(start, head);
    if (clearance < 0) {
        fail(
            `the head is in the turf ${lead} s before contact, where the earliest action begins: its lowest point is ` +
                `${0 - clearance} m below it (the stance is too low for that timing)`,
        );
    }
    return { head, face: WOOD, ...start, drive };
}

/** A stroke's pose at contact (design §5.2 steps 1–5, 10). */
export interface ContactPose {
    readonly head: MalletHead;
    /** Unit, horizontal. */
    readonly aim: Vec3;
    /** θ_c = −lean (rad). */
    readonly thetaContact: number;
    readonly orientation: Quaternion;
    readonly headCentre: Vec3;
    /** The top hand at contact, P_c, and its distance from the socket along the shaft, r (m). */
    readonly pivot: Vec3;
    readonly radius: number;
}

/**
 * The contact pose of `setup` on `world` (design §5.2): the arc radius r = top (step 1), θ_c = −lean (step 2), the
 * head pitched rigidly with the shaft (step 3), its face START_GAP short of the sunk striker at (up, side) (step 4),
 * the pivot r up the shaft from the socket (step 5), and the head a solid cylinder of the profile's mallet (step 10).
 * Takes the setup as checked (buildContact).
 */
export function contactPose(setup: ShotSetup, world: World): ContactPose {
    const { stroke, profile } = setup;
    const striker = setup.balls[setup.striker] as BallState;
    const { lean, top } = profile.stance[stroke.type];
    const { mallet } = profile;
    const rho = mallet.headDiameter / 2;
    const { up, side } = stroke.contact;
    const R = world.ball.radius;
    const surface = world.lawn.surfaceAt(striker.position);
    const sunk = R - (world.ball.mass * world.gravity) / surface.turfStiffness;
    const centre = vec3(striker.position.x, striker.position.y, sunk);
    const radius = top;
    const thetaC = 0 - lean;
    const [sa, ca] = sinCos(stroke.aim);
    const aim = vec3(ca, sa, 0);
    const orientation = swingOrientation(aim, thetaC);
    // f the face's outward normal (body x), its upward axis body z, `side` along body y (left of aim).
    const face = rotate(orientation, vec3(1, 0, 0));
    const upward = rotate(orientation, vec3(0, 0, 1));
    const left = rotate(orientation, vec3(0, 1, 0));
    const faceCentre = sub(sub(sub(centre, scale(face, R + START_GAP)), scale(upward, up)), scale(left, side));
    const headCentre = sub(faceCentre, scale(face, mallet.headLength / 2));
    const socket = add(headCentre, scale(upward, rho));
    const [st, ct] = sinCos(thetaC);
    const pivot = sub(socket, scale(sub(scale(aim, st), vec3(0, 0, ct)), radius));
    const head: MalletHead = {
        mass: mallet.headMass,
        inertia: solidCylinderInertia(mallet.headMass, mallet.headLength, rho),
        length: mallet.headLength,
        radius: rho,
        socket: vec3(0, 0, rho),
    };
    return { head, aim, thetaContact: thetaC, orientation, headCentre, pivot, radius };
}

/** The stroke's choices the downswing needs (design §3): its mode and shape, the backswing (m) and the intensity. */
export interface StrokeChoice {
    readonly mode: StrokeMode;
    readonly shape: SwingShape;
    readonly backswing: number;
    readonly intensity: number;
}

/**
 * The downswing's input for `pose` and `choice` (design §3.1): the pendulum of the swung body (the head and `hands`'
 * arm mass at the top grip) under `gravity`, ℓ_h = ρ + r.
 */
export function downswingInput(pose: ContactPose, hands: Hands, choice: StrokeChoice, gravity: number): DownswingInput {
    const body = swungBody(pose.head, hands, pose.radius);
    return {
        mode: choice.mode,
        aim: pose.aim,
        thetaContact: pose.thetaContact,
        pivot: pose.pivot,
        lever: pose.head.socket.z + pose.radius,
        pendulum: pendulumOf(pose.head, body, pose.radius, gravity),
        shape: choice.shape,
        backswing: choice.backswing,
        intensity: choice.intensity,
    };
}

/** The head's planned speed at contact (design §3.4): |V_c + ω₀·n × (c − P_c)|. */
export function poseSpeed(pose: ContactPose, planned: PlannedDownswing): number {
    const lever = cross(pitchAxis(pose.aim), sub(pose.headCentre, pose.pivot));
    return length(add(planned.handsVelocity, scale(lever, planned.omega)));
}

/** The coasting path's closest approach to the turf before contact (design §5.2 step 9). */
export interface SwingApproach {
    /** The head's lowest clearance above the turf (m); negative where it would have dug in. */
    readonly clearance: number;
    /** When, in s before the planned contact. */
    readonly before: number;
}

/**
 * How close the head's coasting path comes to the turf in the MAX_LEAD before the planned contact of a tracked contact
 * state, sampled every APPROACH_STEP. Every action is removed: no window's change and no dip, and each window and the
 * dip begin at the planned contact, so every sample (all at or before it) lies on the path's coasting branch whatever
 * the mode (a carry's slowing pendulum, a swing's free one and the reach all begin after it). A swing is simulated only
 * from its earliest action (design §5.2 step 8), so this reports the dig an on-time low swing would have made.
 */
export function swingApproach(contact: ContactState): SwingApproach {
    if (contact.drive.kind !== "track") {
        fail("swingApproach needs a tracked contact state");
    }
    const { arc } = contact.drive;
    const still = vec3(0, 0, 0);
    const coasting: TrackDrive = {
        ...contact.drive,
        arc: {
            ...arc,
            alpha: 0,
            pivotAcceleration: still,
            arcStart: arc.contactAt,
            handStart: arc.contactAt,
            dip: { ...arc.dip, start: arc.contactAt, depth: 0 },
        },
    };
    const track = prepareTrack(coasting, contact.head, 0);
    let clearance = Infinity;
    let before = 0;
    const samples = Math.round(MAX_LEAD / APPROACH_STEP);
    for (let k = 0; k <= samples; k++) {
        const back = k * APPROACH_STEP;
        const z = headLowestPoint(headOnPath(track, contact.head, arc.contactAt - back), contact.head);
        if (z < clearance) {
            clearance = z;
            before = back;
        }
    }
    return { clearance, before };
}
