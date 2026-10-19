/**
 * The swing model (P2b.2b.1 design §5.2; P2b.2b.2a design §3). From a ShotSetup and the world it derives the mallet
 * head, its wooden face, its state where the impact starts and the tracked drive:
 * 1. the contact pose (contactPose): the arc radius r = top, θ_c = −lean, the lean from the top hand's position
 *    (stanceLean, P2b.2b.2b.1 design §3.2), the head pitched rigidly with the shaft, its face START_GAP short of the
 *    sunk striker at (up, side), the pivot r up the shaft;
 * 2. the downswing (downswing.ts) from the backswing's top, in swing mode under the body's effort law (P2b.2b.2c.1
 *    design §4.4): ω₀ and the hands' V_c at contact, and from them the planned contact speed;
 * 3. the arcs' changes, against the planned speed: α = drive·speedGain·(speed/ℓ)/window, ℓ the pivot's distance from
 *    the head's centre, and A = drive·handGain·speed·aim/handWindow; the dip, handDrop deepened by the shot's jab,
 *    over dropTime; the mode, the ground depth and the reach (the shot's, else the preset's); the coupling
 *    HAND_COUPLING; the hands the stance's, with the profile's body;
 * 4. the lead L, the earliest action's, or TURF_MARGIN before the downswing first meets the turf if that is earlier
 *    (P2b.2b.2a design §3.5): the impact starts L before contact, on the downswing, so a fat stroke's turf strike is
 *    integrated; the grips relax at contact;
 * 5. the approach: the downswing's lowest clearance over the turf, from one scan (planStroke, swingApproach).
 * The head starts on its own path (headOnPath at t = 0), so the hands start with no error to take up.
 */
import { malletReference } from "../../reference/index";
import { headLowestPoint } from "../impact/contacts";
import { boxInertia, rotate, solidCylinderInertia, type Quaternion } from "../impact/rigidBody";
import { faceHalfHeight, type HeadShape } from "../impact/shape";
import {
    HAND_COUPLING,
    headOnPath,
    pendulumOf,
    pitchAxis,
    prepareTrack,
    swingOrientation,
    swungBody,
} from "../impact/track";
import { bedLawOf, staticSink } from "../impact/turfBed";
import type { ContactState, FaceMaterial, Hands, MalletHead, StrokeMode, SwingArc, TrackDrive } from "../impact/types";
import { atan2, sinCos } from "../math/elementary";
import { add, cross, dot, length, scale, sub, vec3, type Vec3 } from "../math/vec3";
import type { BallState, World } from "../types";
import { planDownswing, scanDownswing, type DownswingInput, type PlannedDownswing } from "./downswing";
import type {
    MalletHeadProfile,
    ShotSetup,
    SwingDrive,
    SwingEffort,
    SwingProfile,
    SwingShape,
    SwingStance,
} from "./types";

/**
 * Gap (m) between the face and the striker's sunk surface at contact (design §5.2 step 4). Numerical, not physical:
 * it keeps rounding from starting the face inside the ball, and at 1 m/s the head closes it within a step.
 */
export const START_GAP = 1e-6;

/**
 * The longest lead-in (s): how early the impact may start, for an early action or a downswing meeting the turf
 * (P2b.2b.2a design §3.5). A modelling bound, not physical: a head on the lawn that long before the ball is a gross
 * mis-hit the impact cannot afford. Provisional, to be confirmed against the sourced downswing times.
 */
export const MAX_LEAD = 0.15;

/**
 * How long (s) before the downswing first meets the turf the impact starts (P2b.2b.2a design §3.5). Numerical, not
 * physical: 5 ms of open steps before the head–turf pair closes.
 */
export const TURF_MARGIN = 0.005;

/** The engine's face: wood (reference/mallet.json); its restitution and contact time are contact.json's fits. */
const WOOD: FaceMaterial = { friction: malletReference.faceFriction.value };

/** A stance's numbers, each checked finite by name (a missing one included). */
const STANCE_NUMBERS: readonly (keyof SwingStance)[] = ["handsAhead", "top", "bottom", "gripTension", "bottomGrip"];

/** A drive entry's numbers (all but its mode), each checked finite by name. */
const DRIVE_NUMBERS: readonly Exclude<keyof SwingDrive, "mode">[] = [
    "speedGain",
    "window",
    "handGain",
    "handWindow",
    "handDrop",
    "dropTime",
    "handReach",
    "guideEffort",
    "pendulumAt",
    "pendulumEffort",
    "handArcRadius",
    "handArcLow",
];

/** A shape's scalar numbers always read, each checked finite by name (handAngle only when read: design §3.2). */
const SHAPE_NUMBERS: readonly "pendulumShare"[] = ["pendulumShare"];

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

function unit(value: number, name: string): void {
    if (!(value >= 0 && value <= 1)) {
        fail(`${name} must lie in [0, 1] (got ${value})`);
    }
}

/** A tempo pair: both positive, the fast no slower than the slow. */
function tempos(slow: number, fast: number, slowName: string, fastName: string): void {
    positive(slow, slowName);
    positive(fast, fastName);
    if (fast > slow) {
        fail(`${fastName} must not exceed ${slowName} (got ${fast} > ${slow})`);
    }
}

/**
 * The rigid geometry between a stance's top hand and its lean (P2b.2b.2b.1 design §3.2): R, L and ρ (m), ρ the
 * socket's height above the head's centre (faceHalfHeight).
 */
export interface StanceGeometry {
    readonly ballRadius: number;
    readonly headLength: number;
    readonly faceHalfHeight: number;
}

/**
 * [A, B] (P2b.2b.2b.1 design §3.2): A = ρ + top − up, B = R + START_GAP + L/2. One operation order serves both
 * directions, so a lean derived by handsAheadFor reads back through stanceLean with the same bits of A and B.
 */
function stanceArms(top: number, up: number, geometry: StanceGeometry): readonly [number, number] {
    const { ballRadius, headLength, faceHalfHeight } = geometry;
    return [faceHalfHeight + top - up, ballRadius + START_GAP + headLength / 2];
}

/**
 * The top hand's horizontal distance (m) ahead of the striker's ball's centre along aim at contact (P2b.2b.2b.1
 * design §3.2): X = A·sin α − B·cos α. The shaft leans `lean` (α, rad, positive pitching the face down), the top
 * hand is `top` (m) up the shaft from the socket, and the ball is met `up` (m) above the face's centre.
 */
export function handsAheadFor(lean: number, top: number, up: number, geometry: StanceGeometry): number {
    const [a, b] = stanceArms(top, up, geometry);
    const [s, c] = sinCos(lean);
    return a * s - b * c;
}

/**
 * The shaft's lean (rad) at contact that puts the top hand `handsAhead` (m) ahead of the ball's centre: handsAheadFor
 * inverted on the branch where the hands rise with the lean (P2b.2b.2b.1 design §3.2). With
 * S = √(A² + (B − X)·(B + X)), α = atan2(A·X + B·S, A·S − B·X). At X = −B the product vanishes, so an upright shaft
 * reads back as exactly 0. `handsAhead` must lie in (−D, A), with D² = A² + B²; planStroke checks it.
 */
export function stanceLean(handsAhead: number, top: number, up: number, geometry: StanceGeometry): number {
    const [a, b] = stanceArms(top, up, geometry);
    const s = Math.sqrt(a * a + (b - handsAhead) * (b + handsAhead));
    return atan2(a * handsAhead + b * s, a * s - b * handsAhead);
}

/**
 * The head shape of a profile's head (P2b.2b.2b.2c design §5.1): a round head's radius is half its diameter, and a box
 * head's half-extents half its face's width and height.
 */
export function headShapeOf(head: MalletHeadProfile): HeadShape {
    if (head.kind === "round") {
        return { kind: "cylinder", radius: head.diameter / 2 };
    }
    return { kind: "box", halfWidth: head.faceWidth / 2, halfHeight: head.faceHeight / 2, edgeRadius: head.edgeRadius };
}

/**
 * The principal moments of a profile's mallet head (P2b.2b.2b.2c design §4.1): a round head a uniform solid cylinder,
 * a box head from its measured moment about the shaft (boxInertia, which throws a RangeError outside the realisable).
 */
function headInertia(mallet: SwingProfile["mallet"]): Vec3 {
    const { head } = mallet;
    if (head.kind === "round") {
        return solidCylinderInertia(mallet.headMass, mallet.headLength, head.diameter / 2);
    }
    return boxInertia(
        mallet.headMass,
        mallet.headLength,
        head.faceWidth / 2,
        head.faceHeight / 2,
        head.inertiaAboutShaft,
    );
}

/** Checks `setup` on a world whose ball has radius `ballRadius` (see planStroke). */
function validate(setup: ShotSetup, ballRadius: number): void {
    const { stroke, profile } = setup;
    if (!setup.balls[setup.striker]) {
        fail(`striker ${setup.striker} is not in the setup`);
    }
    const { type, timing } = stroke;
    const stance = profile.stance[type];
    const push = profile.drive[type];
    const shape = profile.shape[type];
    if (!stance) {
        fail(`profile.stance has no entry for ${type}`);
    }
    if (!push) {
        fail(`profile.drive has no entry for ${type}`);
    }
    if (!shape) {
        fail(`profile.shape has no entry for ${type}`);
    }
    if (push.mode !== "swing" && push.mode !== "carry") {
        fail(`profile.drive.${type}.mode must be "swing" or "carry" (got ${String(push.mode)})`);
    }
    finiteNumber(stroke.aim, "stroke.aim");
    finiteNumber(stroke.backswing, "stroke.backswing");
    finiteNumber(stroke.drive, "stroke.drive");
    finiteNumber(stroke.contact.up, "stroke.contact.up");
    finiteNumber(stroke.contact.side, "stroke.contact.side");
    finiteNumber(timing.arc, "stroke.timing.arc");
    finiteNumber(timing.hands, "stroke.timing.hands");
    finiteNumber(timing.dip, "stroke.timing.dip");
    if (timing.advance !== undefined) {
        finiteNumber(timing.advance, "stroke.timing.advance");
    }
    for (const [name, value] of [
        ["stroke.intensity", stroke.intensity],
        ["stroke.handReach", stroke.handReach],
        ["stroke.guideEffort", stroke.guideEffort],
        ["stroke.pendulumAt", stroke.pendulumAt],
        ["stroke.pendulumEffort", stroke.pendulumEffort],
        ["stroke.jab", stroke.jab],
    ] as const) {
        if (value !== undefined) {
            finiteNumber(value, name);
        }
    }
    for (const key of STANCE_NUMBERS) {
        finiteNumber(stance[key], `profile.stance.${type}.${key}`);
    }
    for (const key of DRIVE_NUMBERS) {
        finiteNumber(push[key], `profile.drive.${type}.${key}`);
    }
    const where = `profile.shape.${type}`;
    for (const key of SHAPE_NUMBERS) {
        finiteNumber(shape[key], `${where}.${key}`);
    }
    if (shape.pendulumShare < 1) {
        finiteNumber(shape.handAngle, `${where}.handAngle`);
    }
    if (shape.handTempo !== null) {
        finiteNumber(shape.handTempo.slow, `${where}.handTempo.slow`);
        finiteNumber(shape.handTempo.fast, `${where}.handTempo.fast`);
    }
    const { mallet, body } = profile;
    for (const key of ["headMass", "headLength", "shaftLength"] as const) {
        finiteNumber(mallet[key], `profile.mallet.${key}`);
        positive(mallet[key], `profile.mallet.${key}`);
    }
    finiteNumber(mallet.shaftMass, "profile.mallet.shaftMass");
    nonNegative(mallet.shaftMass, "profile.mallet.shaftMass");
    const { head } = mallet;
    if (head.kind === "round") {
        finiteNumber(head.diameter, "profile.mallet.head.diameter");
        positive(head.diameter, "profile.mallet.head.diameter");
    } else if (head.kind === "box") {
        for (const key of ["faceWidth", "faceHeight", "edgeRadius", "inertiaAboutShaft"] as const) {
            finiteNumber(head[key], `profile.mallet.head.${key}`);
        }
        positive(head.faceWidth, "profile.mallet.head.faceWidth");
        positive(head.faceHeight, "profile.mallet.head.faceHeight");
        positive(head.inertiaAboutShaft, "profile.mallet.head.inertiaAboutShaft");
        nonNegative(head.edgeRadius, "profile.mallet.head.edgeRadius");
        const limit = Math.min(head.faceWidth / 2, head.faceHeight / 2, mallet.headLength / 2);
        if (!(head.edgeRadius < limit)) {
            fail(`profile.mallet.head.edgeRadius must lie in [0, ${limit}) m (got ${head.edgeRadius})`);
        }
        headInertia(mallet);
    } else {
        fail(`profile.mallet.head.kind must be "round" or "box" (got ${String((head as { kind: unknown }).kind)})`);
    }
    finiteNumber(body.armMass, "profile.body.armMass");
    finiteNumber(body.reachSlack, "profile.body.reachSlack");

    const { handsAhead, top, bottom, gripTension, bottomGrip } = stance;
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
    positive(stroke.backswing, "stroke.backswing");
    if (stroke.intensity !== undefined) {
        unit(stroke.intensity, "stroke.intensity");
    }
    if (!(Math.abs(stroke.drive) <= 1)) {
        fail(`stroke.drive must lie in [-1, 1] (got ${stroke.drive})`);
    }
    const headShape = headShapeOf(head);
    const rho = faceHalfHeight(headShape);
    const { up, side } = stroke.contact;
    if (headShape.kind === "cylinder") {
        if (!(Math.sqrt(up * up + side * side) < rho)) {
            fail(`the contact lies off the face: (${up}, ${side}) m from its centre, whose radius is ${rho} m`);
        }
    } else {
        // A box's face is its flat part (design §3.3): within h_y − e across and h_z − e up of its centre.
        const across = headShape.halfWidth - headShape.edgeRadius;
        const height = headShape.halfHeight - headShape.edgeRadius;
        if (!(Math.abs(side) <= across && Math.abs(up) <= height)) {
            fail(
                `the contact lies off the face: (${up}, ${side}) m from its centre, beyond its flat ±${height} m up ` +
                    `and ±${across} m across`,
            );
        }
    }
    // A > 0 rests on the contact lying on the face, checked just above (P2b.2b.2b.1 design §3.4).
    const [a, b] = stanceArms(top, up, { ballRadius, headLength: mallet.headLength, faceHalfHeight: rho });
    const d = Math.sqrt(a * a + b * b);
    if (!(handsAhead > 0 - d && handsAhead < a)) {
        fail(
            `profile.stance.${type}.handsAhead must lie in (−D, A) = (${0 - d}, ${a}) m for its top hand and the ` +
                `contact's up (got ${handsAhead}): at A the shaft lies flat, at −D the hands leave the stance's branch`,
        );
    }
    positive(push.window, `profile.drive.${type}.window`);
    positive(push.handWindow, `profile.drive.${type}.handWindow`);
    positive(push.dropTime, `profile.drive.${type}.dropTime`);
    nonNegative(push.speedGain, `profile.drive.${type}.speedGain`);
    grip(gripTension, `profile.stance.${type}.gripTension`);
    grip(bottomGrip, `profile.stance.${type}.bottomGrip`);
    nonNegative(push.handDrop, `profile.drive.${type}.handDrop`);
    nonNegative(push.handReach, `profile.drive.${type}.handReach`);
    if (stroke.handReach !== undefined) {
        nonNegative(stroke.handReach, "stroke.handReach");
    }
    unit(push.guideEffort, `profile.drive.${type}.guideEffort`);
    if (stroke.guideEffort !== undefined) {
        unit(stroke.guideEffort, "stroke.guideEffort");
    }
    unit(push.pendulumAt, `profile.drive.${type}.pendulumAt`);
    unit(push.pendulumEffort, `profile.drive.${type}.pendulumEffort`);
    unit(push.handArcLow, `profile.drive.${type}.handArcLow`);
    if (stroke.pendulumAt !== undefined) {
        unit(stroke.pendulumAt, "stroke.pendulumAt");
    }
    if (stroke.pendulumEffort !== undefined) {
        unit(stroke.pendulumEffort, "stroke.pendulumEffort");
    }
    if (stroke.jab !== undefined) {
        nonNegative(stroke.jab, "stroke.jab");
        if (push.mode === "carry" && stroke.jab !== 0) {
            fail(`stroke.jab must be 0 in carry mode, where the hands lead on their own arc (got ${stroke.jab})`);
        }
    }
    const pushLength = stroke.handReach ?? push.handReach;
    // Checked in swing mode too, where the arc is never read: a profile that fails it fails either way. Changing that
    // would be a behaviour change and needs its own ruling.
    if (!(push.handArcRadius > pushLength)) {
        fail(
            `profile.drive.${type}.handArcRadius must exceed the push length ${pushLength} m, so that the hands' arc ` +
                `is defined over the whole push (got ${push.handArcRadius})`,
        );
    }
    const { flex } = body;
    const { hold, ...flexValues } = flex;
    const held = hold === null ? [] : Object.entries(hold).map(([key, value]) => [`hold.${key}`, value] as const);
    for (const [key, value] of [...Object.entries(flexValues), ...held]) {
        finiteNumber(value, `profile.body.flex.${key}`);
        positive(value, `profile.body.flex.${key}`);
    }
    if (!(flex.dampingRatio <= 1)) {
        fail(`profile.body.flex.dampingRatio must lie in (0, 1] (got ${flex.dampingRatio})`);
    }
    finiteNumber(body.pendulumForce, "profile.body.pendulumForce");
    positive(body.pendulumForce, "profile.body.pendulumForce");
    finiteNumber(body.pushForce, "profile.body.pushForce");
    positive(body.pushForce, "profile.body.pushForce");
    finiteNumber(body.pushResponseTime, "profile.body.pushResponseTime");
    positive(body.pushResponseTime, "profile.body.pushResponseTime");
    finiteNumber(body.gripLimit, "profile.body.gripLimit");
    positive(body.gripLimit, "profile.body.gripLimit");
    for (const [key, value] of Object.entries(body.chain)) {
        finiteNumber(value, `profile.body.chain.${key}`);
        positive(value, `profile.body.chain.${key}`);
    }
    nonNegative(body.armMass, "profile.body.armMass");
    nonNegative(body.reachSlack, "profile.body.reachSlack");
    finiteNumber(body.backswingLimit, "profile.body.backswingLimit");
    if (!(body.backswingLimit > 0 && body.backswingLimit <= Math.PI / 2)) {
        fail(`profile.body.backswingLimit must lie in (0, π/2] (got ${body.backswingLimit})`);
    }
    finiteNumber(body.effort.torque, "profile.body.effort.torque");
    nonNegative(body.effort.torque, "profile.body.effort.torque");
    finiteNumber(body.effort.speed, "profile.body.effort.speed");
    positive(body.effort.speed, "profile.body.effort.speed");
    finiteNumber(body.handAcceleration, "profile.body.handAcceleration");
    positive(body.handAcceleration, "profile.body.handAcceleration");
    unit(shape.pendulumShare, `${where}.pendulumShare`);
    if (shape.pendulumShare < 1 && !(shape.handAngle > 0 && shape.handAngle < Math.PI / 2)) {
        fail(`${where}.handAngle must lie in (0, 90°) when pendulumShare < 1 (got ${shape.handAngle} rad)`);
    }
    if (push.mode === "swing") {
        if (!(shape.pendulumShare > 0)) {
            fail(`${where}.pendulumShare must be positive in swing mode, where the pendulum leads (got 0)`);
        }
    } else {
        if (shape.handTempo === null) {
            fail(`${where}.handTempo is required in carry mode`);
        }
        tempos(shape.handTempo.slow, shape.handTempo.fast, `${where}.handTempo.slow`, `${where}.handTempo.fast`);
    }
}

/** The hands of `setup`'s stance with its profile's body, and the shot's guide effort, else the preset's. */
function handsOf(setup: ShotSetup): Hands {
    const { stroke, profile } = setup;
    const stance = profile.stance[stroke.type];
    return {
        bottom: stance.bottom,
        gripTension: stance.gripTension,
        bottomGrip: stance.bottomGrip,
        armMass: profile.body.armMass,
        reachSlack: profile.body.reachSlack,
        guideEffort: stroke.guideEffort ?? profile.drive[stroke.type].guideEffort,
        flex: profile.body.flex,
        pendulumForce: profile.body.pendulumForce,
        pushForce: profile.body.pushForce,
        pushResponseTime: profile.body.pushResponseTime,
        chain: profile.body.chain,
        gripLimit: profile.body.gripLimit,
    };
}

/** The downswing of a checked `setup` posed at `pose`, at the shot's intensity, else 0 (the gate's ruling 2). */
function downswingOf(setup: ShotSetup, pose: ContactPose, hands: Hands, gravity: number): PlannedDownswing {
    const { stroke, profile } = setup;
    const shape = profile.shape[stroke.type];
    const push = profile.drive[stroke.type];
    const choice: StrokeChoice = {
        mode: push.mode,
        shape,
        backswing: stroke.backswing,
        backswingLimit: profile.body.backswingLimit,
        effort: profile.body.effort,
        intensity: stroke.intensity ?? 0,
        arrival:
            push.mode === "carry"
                ? arcArrival(push.handArcRadius, push.handArcLow, stroke.handReach ?? push.handReach)
                : 0,
    };
    return planDownswing(downswingInput(pose, hands, choice, gravity));
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
 * The contact pose of `setup` on `world` (design §5.2): the arc radius r = top (step 1), θ_c = −lean, the lean from
 * the top hand's position (step 2; P2b.2b.2b.1 design §3.2), the head pitched rigidly with the shaft (step 3), its
 * face START_GAP short of the sunk striker at (up, side) (step 4), the pivot r up the shaft from the socket (step 5),
 * and the head a solid of the profile's mallet (step 10). Takes the setup as checked (planStroke).
 */
export function contactPose(setup: ShotSetup, world: World): ContactPose {
    const { stroke, profile } = setup;
    const striker = setup.balls[setup.striker] as BallState;
    const { handsAhead, top } = profile.stance[stroke.type];
    const { mallet } = profile;
    const shape = headShapeOf(mallet.head);
    const rho = faceHalfHeight(shape);
    const { up, side } = stroke.contact;
    const R = world.ball.radius;
    const lean = stanceLean(handsAhead, top, up, { ballRadius: R, headLength: mallet.headLength, faceHalfHeight: rho });
    const surface = world.lawn.surfaceAt(striker.position);
    const sunk =
        R - staticSink(striker.position.x, striker.position.y, R, world.ball.mass * world.gravity, bedLawOf(surface));
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
        inertia: headInertia(mallet),
        length: mallet.headLength,
        shape,
        socket: vec3(0, 0, rho),
        shaft: { mass: mallet.shaftMass, length: mallet.shaftLength },
    };
    return { head, aim, thetaContact: thetaC, orientation, headCentre, pivot, radius };
}

/**
 * The stroke's choices the downswing needs (design §3): its mode and shape, the backswing (m), the body's limit and
 * effort, the intensity and, in carry mode, the hands' arc's slope at contact (arcArrival).
 */
export interface StrokeChoice {
    readonly mode: StrokeMode;
    readonly shape: SwingShape;
    readonly backswing: number;
    /** θ_max (rad from vertical), the body's limit on a swing-mode backswing. */
    readonly backswingLimit: number;
    /** The player's effort in swing mode (P2b.2b.2c.1 design §4.4). */
    readonly effort: SwingEffort;
    readonly intensity: number;
    readonly arrival: number;
}

/**
 * The hands' arc's slope dz/ds at contact (P2b.2b.2b.2b design §4.1): the arc of radius `radius` (m) is lowest
 * `low`·`push` ahead of the hands, so at contact it descends at −s_low/√(ρ_h² − s_low²). 0 (level) for no push.
 */
export function arcArrival(radius: number, low: number, push: number): number {
    const s = low * push;
    return (0 - s) / Math.sqrt(radius * radius - s * s);
}

/**
 * The downswing's input for `pose` and `choice` (design §3.1): the pendulum of the swung body (the mallet, malletBody,
 * and `hands`' arm mass at the top grip) under `gravity`, ℓ_h = ρ + r.
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
        backswingLimit: choice.backswingLimit,
        effort: choice.effort,
        intensity: choice.intensity,
        arrival: choice.arrival,
    };
}

/** The head's planned speed at contact (design §3.4): |V_c + ω₀·n × (c − P_c)|. */
export function poseSpeed(pose: ContactPose, planned: PlannedDownswing): number {
    const lever = cross(pitchAxis(pose.aim), sub(pose.headCentre, pose.pivot));
    return length(add(planned.handsVelocity, scale(lever, planned.omega)));
}

/** The head's planned velocity at contact along aim (m/s): aim·(V_c + ω₀·n × (c − P_c)) (plan decision 3). */
function alongAim(pose: ContactPose, planned: PlannedDownswing): number {
    const lever = cross(pitchAxis(pose.aim), sub(pose.headCentre, pose.pivot));
    return dot(add(planned.handsVelocity, scale(lever, planned.omega)), pose.aim);
}

/**
 * Checks `arc`'s `advance` (plan decision 5), at the head's planned speed V along aim and the body's peak acceleration
 * a: swing mode only, no check (α < 0), a positive handReach, a positive V (at 0 the cruise would never end; below
 * it the hands would ramp backwards), and a ramp's travel V·W/2 = V²/(2a) (W = V/a, the pre-flight gate's ruling 9)
 * under 0.8·handReach, so that the hands cruise before they ease to rest. planStroke calls it; a hand-built arc is not
 * checked.
 */
export function checkAdvance(arc: SwingArc, advance: NonNullable<SwingArc["advance"]>): void {
    const { speed, accel } = advance;
    if (arc.mode !== "swing") {
        fail("stroke.timing.advance needs swing mode: carry mode's hands push on their own arc");
    }
    if (arc.alpha < 0) {
        fail("the advance cannot follow a check: the check holds the pendulum to rest relative to the hands");
    }
    if (!(arc.handReach > 0)) {
        fail(`the advance travels the stroke's handReach, which must be positive (got ${arc.handReach})`);
    }
    if (!(speed > 0)) {
        fail(`the advance cruises at the head's planned speed along aim, which must be positive (got ${speed} m/s)`);
    }
    const ramp = (speed * speed) / (2 * accel);
    if (!(ramp / 0.8 < arc.handReach)) {
        fail(
            `the advance is too short for its ramp: the hands travel V²/(2a) = ${ramp} m reaching ${speed} m/s at ` +
                `${accel} m/s², which must be under 0.8·handReach = ${0.8 * arc.handReach} m`,
        );
    }
}

/** The downswing's closest approach to the turf before contact (P2b.2b.2a design §3.5). */
export interface SwingApproach {
    /** The head's lowest clearance above the turf (m); negative where it is in it. */
    readonly clearance: number;
    /** When, in s before the planned contact. */
    readonly before: number;
}

/** A stroke planned (design §3, §5.2): its contact state, its approach and its planned contact speed (m/s). */
export interface StrokePlan {
    readonly contact: ContactState;
    readonly approach: SwingApproach;
    readonly contactSpeed: number;
}

/**
 * Plans `setup` on `world` (P2b.2b.1 design §5.2; P2b.2b.2a design §3): the contact state, from one scan of the
 * downswing the approach, and the planned contact speed. Throws a RangeError naming the check for:
 * - a striker absent from the setup, or a stroke type missing from the profile's stance, drive or shape;
 * - a mode other than "swing" or "carry";
 * - a non-finite number, or a non-positive mallet dimension or mass, or a negative shaft mass; a box head's edge
 *   radius outside [0, min(h_y, h_z, L/2)) or its moment about the shaft outside the realisable (P2b.2b.2b.2c design
 *   §5.1);
 * - top ≤ 0, or top > shaftLength; bottom outside (0, top);
 * - backswing ≤ 0; an intensity outside [0, 1]; |drive| > 1; the contact off the face (a box's: off its flat part);
 *   handsAhead outside (−D, A) for the stroke's top hand and contact (P2b.2b.2b.1 design §3.4: at A the shaft lies
 *   flat, at −D the hands leave the stance's branch);
 * - window, handWindow or dropTime ≤ 0; speedGain < 0; gripTension or bottomGrip outside (0, 1]; handDrop < 0; the
 *   preset's or the shot's handReach < 0; the preset's or the shot's guideEffort outside [0, 1];
 *   armMass < 0; reachSlack < 0; a backswingLimit non-finite or outside (0, π/2]; the body's effort torque τ_0 < 0
 *   or its speed ω_max ≤ 0 (P2b.2b.2c.1 design §4.4); the body's hands' peak acceleration not positive (the
 *   P2b.2b.2c.1 pre-flight gate's ruling 9); the preset's or the shot's
 *   pendulumAt or pendulumEffort outside [0, 1]; handArcLow outside [0, 1]; a jab negative or non-finite, or non-zero
 *   in carry mode (P2b.2b.2b.3 design §6.1); handArcRadius not above the push length; a flex value not positive, or a
 *   flex damping ratio above 1; pendulumForce not positive (P2b.2b.2b.2b design §6); pushForce, pushResponseTime,
 *   gripLimit or a hand–arm chain value not positive (its gate rulings, 2026-10-11; P2b.2b.2b.3 design §5);
 * - pendulumShare outside [0, 1]; handAngle outside (0, 90°) when pendulumShare < 1 (neither read
 *   nor checked otherwise); in swing mode a pendulumShare of 0; in carry mode a null hands' tempo, or one ≤ 0 or
 *   with fast > slow;
 * - the downswing's (downswing.ts): a backswing beyond the body's limit θ_max (swing mode) or MAX_BACK_ANGLE (carry
 *   mode), a non-positive effective inertia, a stall or a fall beyond MAX_FALL;
 * - an action timed more than MAX_LEAD early (the advance's among them), or a downswing meeting the turf more than
 *   MAX_LEAD − TURF_MARGIN before contact;
 * - an advance (P2b.2b.2c.1 plan decision 5) in carry mode, on a check (α < 0), with a handReach ≤ 0, with V ≤ 0, or
 *   with its ramp's travel V·W/2 at or above 0.8·handReach (V the head's planned speed along aim at contact, W = V/a
 *   the ramp's duration at the body's hands' peak acceleration a);
 * - the head's lowest point below the turf at contact, or where the impact starts.
 * A downswing that meets the turf before the ball is not rejected: the impact starts before it and simulates it
 * (design §3.5).
 */
export function planStroke(setup: ShotSetup, world: World): StrokePlan {
    validate(setup, world.ball.radius);
    const { stroke, profile } = setup;
    const { type, timing } = stroke;
    const push = profile.drive[type];
    // Step 4's lead: the earliest action's, none on time.
    const given = Math.max(0, 0 - timing.arc, 0 - timing.hands, 0 - timing.dip);
    const actions = timing.advance === undefined ? given : Math.max(given, 0 - timing.advance);
    if (actions > MAX_LEAD) {
        fail(`an action is timed more than ${MAX_LEAD} s early (${actions} s before contact)`);
    }
    const pose = contactPose(setup, world);
    const { head, aim, radius, pivot, orientation, headCentre } = pose;
    const still = vec3(0, 0, 0);
    const atContact = headLowestPoint(
        { position: headCentre, orientation, velocity: still, angularVelocity: still },
        head,
    );
    if (atContact < 0) {
        fail(`the head is in the turf at contact: its lowest point is ${0 - atContact} m below it`);
    }
    const hands = handsOf(setup);
    const planned = downswingOf(setup, pose, hands, world.gravity);
    const contactSpeed = poseSpeed(pose, planned);
    const scan = scanDownswing(planned.downswing, head, aim, radius);
    // Step 4's lead: the earliest action's, or TURF_MARGIN before the downswing first meets the turf if earlier.
    const turf = scan.grounded === null ? 0 : TURF_MARGIN - scan.grounded;
    if (turf > MAX_LEAD) {
        fail(
            `the downswing meets the turf ${0 - (scan.grounded as number)} s before contact, so the impact would ` +
                `start more than ${MAX_LEAD} s early: a gross mis-hit`,
        );
    }
    const lead = Math.max(actions, turf);
    const { omega: omega0, handsVelocity } = planned;
    const lever = length(cross(pitchAxis(aim), sub(headCentre, pivot)));
    // Steps 3 and 4, the arc expressed from the start, L before contact.
    const arc: SwingArc = {
        pivot: sub(pivot, scale(handsVelocity, lead)),
        pivotVelocity: handsVelocity,
        pivotAcceleration: scale(aim, (stroke.drive * push.handGain * contactSpeed) / push.handWindow),
        handStart: lead + timing.hands,
        handWindow: push.handWindow,
        aim,
        radius,
        theta0: pose.thetaContact - omega0 * lead,
        omega0,
        alpha: (stroke.drive * push.speedGain * contactSpeed) / (lever * push.window),
        arcStart: lead + timing.arc,
        window: push.window,
        dip: { start: lead + timing.dip, duration: push.dropTime, depth: push.handDrop + (stroke.jab ?? 0) },
        contactAt: lead,
        mode: push.mode,
        handReach: stroke.handReach ?? push.handReach,
        pendulumAt: stroke.pendulumAt ?? push.pendulumAt,
        pendulumEffort: stroke.pendulumEffort ?? push.pendulumEffort,
        handArcRadius: push.handArcRadius,
        handArcLow: push.handArcLow,
        downswing: planned.downswing,
        ...(timing.advance === undefined
            ? {}
            : {
                  advance: {
                      start: lead + timing.advance,
                      speed: alongAim(pose, planned),
                      accel: profile.body.handAcceleration,
                  },
              }),
    };
    if (arc.advance !== undefined) {
        checkAdvance(arc, arc.advance);
    }
    const drive: TrackDrive = {
        kind: "track",
        arc,
        coupling: { period: HAND_COUPLING.period, dampingRatio: HAND_COUPLING.dampingRatio, relaxAt: lead },
        hands,
    };
    // t = 0 is at or before the pendulum's window (arcStart = L + the arc's timing ≥ 0), so no free table is read.
    const start = headOnPath(prepareTrack(drive, head, world.gravity, false), head, 0);
    // The lead starts the impact before the downswing's first sample in the turf, but a start before the release holds
    // the head at the top: a short downswing whose top lies in the turf starts there.
    const clearance = headLowestPoint(start, head);
    if (clearance < 0) {
        fail(
            `the head is in the turf ${lead} s before contact, where the impact starts: its lowest point is ` +
                `${0 - clearance} m below it (the stance is too low for that timing)`,
        );
    }
    return {
        contact: { head, face: WOOD, ...start, drive },
        approach: { clearance: scan.clearance, before: scan.before },
        contactSpeed,
    };
}

/** The contact state of `setup` on `world` (planStroke, whose checks it throws). */
export function buildContact(setup: ShotSetup, world: World): ContactState {
    return planStroke(setup, world).contact;
}

/**
 * The planned contact speed (m/s) of `setup` on `world` (design §3.4): the pose and the downswing only, no contact
 * state built. Throws planStroke's checks of the setup and the downswing's.
 */
export function plannedSpeed(setup: ShotSetup, world: World): number {
    validate(setup, world.ball.radius);
    const pose = contactPose(setup, world);
    return poseSpeed(pose, downswingOf(setup, pose, handsOf(setup), world.gravity));
}

/**
 * How close a tracked contact state's downswing comes to the turf before the planned contact (design §3.5): the
 * scan planStroke makes. Throws for a contact state with no downswing.
 */
export function swingApproach(contact: ContactState): SwingApproach {
    const arc = contact.drive.kind === "track" ? contact.drive.arc : undefined;
    if (arc?.downswing === undefined) {
        fail("swingApproach needs a tracked contact state with a downswing");
    }
    const { clearance, before } = scanDownswing(arc.downswing, contact.head, arc.aim, arc.radius);
    return { clearance, before };
}
