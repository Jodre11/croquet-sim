/**
 * The impact integrator (P2b.1 design §5): semi-implicit (symplectic) Euler at a fixed step over the mallet head, the
 * balls and the turf. Each step:
 * 1. computes every force from the current state: the hands' load (a force table at the socket, or a tracked drive's
 *    two hands, track.ts) and gravity, then each closed pair in pair-list order, then the head–turf pair if the set-up
 *    has it (P2b.2b.1 design §4);
 * 2. updates every velocity from those forces, the head's spin through Euler's equations in its body frame (for a
 *    tracked drive, the swung body's: the head and the arm mass, P2b.2b.1 design §3.3);
 * 3. updates every position, and the head's orientation, from the new velocities.
 *
 * Bodies and pairs are visited in a fixed order and forces summed in it, so repeated runs are bit-identical, and
 * set-ups mirrored across a vertical plane give exactly mirrored results. Obstacles (hoop uprights and the peg) are
 * immovable: a ball–obstacle pair's force acts on the ball alone.
 *
 * The impact ends once a face–ball contact has closed, the drive window has closed, no face–ball, ball–ball,
 * ball–obstacle or head–turf contact has been closed for RELEASE_STEPS steps, and no ball in turf contact is still
 * bouncing in it; or at the cap. A ball bounces while its vertical oscillation energy about the static sink δ₀ = m·g/k,
 * ½·m·v_z² + ½·k·(δ − δ₀)², exceeds the static spring's ½·k·δ₀²: it will reach δ = 0 and leave the turf, so the
 * turf's rebound, which dominates lift, is integrated rather than discarded at handover. Below that the ball only
 * settles in its hollow, and the handover discards at most m·g·δ₀/2 (design §6). Isolated set-ups (tests) may give
 * balls any state and leave the turf out; simulateImpact.ts prepares and validates real ones.
 *
 * A tracked drive (P2b.2b.1 design §3.5) ends on the same conditions, both arcs' windows and the dip standing for the
 * drive window, and only once the head is neither closing on any ball within reach (headClosing) nor would reach one
 * ahead of its face within LOOK_AHEAD: a re-contact is integrated, not flagged. Its cap is TRACK_IMPACT_CAP after the
 * planned contact.
 *
 * A tracked drive's face–ball pairs meet the whole head, a solid cylinder (contacts.ts headBallContact; P2b.2b.1
 * design §4.5): each also records its intervals per region of the head, and a contact off the face raises
 * `impact-off-face` once per ball. A face–ball or head–turf interval that opens deeper than one step's closing could
 * make counts an entry jump (ImpactRun.entryJumps). A force table keeps the face-only contact and neither record.
 *
 * Every step also records whether each pair is in contact (closed, or a face at the rim), building the contact
 * timeline (timeline.ts; P2b.2a design §5); the pairs touching at t = 0 are listed in `touchingAtStart`. Recording
 * only reads the state.
 *
 * A ball–obstacle pair is skipped while the ball cannot yet have reached the obstacle: each ball's horizontal path
 * length is summed, and a pair found open is not evaluated again until the ball has travelled its gap (less
 * WAKE_MARGIN). The filter is exact: a skipped pair is open, so evaluating it would add no force and change no state,
 * and the pairs evaluated are visited, and their forces summed, in the same order.
 *
 * With a follow-through (integrateStroke, P2b.2b.2a design §4.1) a tracked drive's loop continues once the impact has
 * ended, the balls removed: the hands and the head–turf pair act on the head until the stroke type's finish, or
 * FOLLOW_CAP after contact. The impact's result is fixed before it starts.
 */
import { contactReference } from "../../reference/index";
import { ZERO, add, cross, dot, horizontal, length, scale, sub, vec3, type Vec3 } from "../math/vec3";
import type { BallId, BallParams, BallState, BallStates } from "../types";
import { normalForce, tangentialForce, type PairLaw } from "./contactLaw";
import {
    HEAD_REGIONS,
    HEAD_TURF_KEY,
    OFF_FACE,
    faceClearance,
    headBallContact,
    headClosing,
    headLowestPoint,
    headTurfContact,
    obstacleGap,
    pairContact,
    pairList,
    pairTouching,
    pointVelocity,
    type HeadRegion,
    type ObstacleGeometry,
    type Pair,
    type Penetration,
} from "./contacts";
import { angularAcceleration, integrateOrientation, rotate, rotateInverse } from "./rigidBody";
import { closeTimeline, emptyTimeline, inGap, noteClearance, recordStep, type PairTimeline } from "./timeline";
import {
    handLoad,
    handsAt,
    holdPendulum,
    newGripState,
    pathAt,
    type GripState,
    type HandLoad,
    type PreparedTrack,
    type SwungBody,
} from "./track";
import type { ContactInterval, DriveSample, ForceDrive, HeadState, ImpactEvent, ImpactRun, MalletHead } from "./types";

/**
 * Integration step (s): about 1/100 of the shortest sourced contact duration, 0.5 ms (the lower bound of the ball–ball
 * contact time, contact.json), confirmed by the convergence test. A constant of the engine version, never adapted to
 * the input, so the step count and results are identical across runs. Pre-flight: halving it moves the scenarios'
 * handovers by at most 1.5e-3 of the head speed (3.1e-3 at 1e-5 s); errors fall first-order with dt.
 */
export const IMPACT_DT = 5e-6;

/**
 * Consecutive steps without a closed face–ball, ball–ball, ball–obstacle or head–turf contact after which the impact
 * may end. A numerical allowance for a contact to re-close (a croquet stroke's balls part and meet again), not
 * physical. Pre-flight: ×4 moves no ball's state 50 ms after the strike by more than 2.8e-4 of the head speed.
 */
export const RELEASE_STEPS = 50;

/**
 * Longest impact (s); reaching it ends the impact with an `impact-cap` event rather than hanging. Pre-flight: 5× the
 * longest fuzz impact (11.6 ms); a head that never reaches the ball (a whiff) runs to it.
 */
export const IMPACT_CAP = 0.06;

/**
 * Longest impact (s) of a tracked drive after its planned contact (P2b.2b.1 design §3.5), a user decision
 * (2026-10-05). After the strike the bottom hand's rate guide steers the head back towards the planned arc, so a
 * drive's follow-through catches the striker's ball again (four hits in all at 2 m/s); the cap lets every re-hit be
 * integrated. In the preset sweep the longest impact that ends by itself is a drive's, 314.6 ms after contact
 * (pre-flight; 324.8 ms before the check to rest); 0.45 s is about 43 % over it. A force table keeps IMPACT_CAP.
 */
export const TRACK_IMPACT_CAP = 0.45;

/**
 * Depth (m) below the turf plane past which a head with the head–turf pair raises `impact-head-deep` (P2b.2b.1 design
 * §4.2; reference/contact.json): a model limit, past which a plane turf with a linear spring is not credible for it.
 */
export const HEAD_DEEP_LIMIT = contactReference.headDeepLimit.value;

/**
 * Slack (m) of the re-entry guard (P2b.2b.1 design §4.5): a contact may open up to one step's closing |v_n|·dt deep,
 * plus this. Numerical, not physical: it covers the first step's second-order closing (a curved surface's or the
 * head's turn, about (v·dt)²/R, under 1e-7 m at 10 m/s) and rounding, and is 1/15,000 of the 15 mm at which the
 * catapult's contact opened.
 */
export const ENTRY_SLACK = 1e-6;

/**
 * Horizon (s) of the tracked end rule's look-ahead (design §3.5): the impact runs on while the front face would reach
 * a ball ahead of it within this time. A modelling bound, not physical: a head slowed below the striker's ball by the
 * strike, catching it again, is integrated.
 */
export const LOOK_AHEAD = 0.03;

/**
 * How long after the planned contact (s) the follow-through may run before it ends with `follow-cap` (P2b.2b.2a
 * design §4.2). A modelling bound, not physical: a stroke's finish comes well within a second.
 */
export const FOLLOW_CAP = 1;

/** Spacing (s) of the stroke's samples (P2b.2b.2a design §4.3). Numerical: 1 ms moves a 3 m/s head 3 mm. */
export const FOLLOW_SAMPLE = 1e-3;

/** Speed (m/s) below which a check's or a carry's head is at rest (P2b.2b.2a design §4.2). Numerical, not physical. */
export const FINISH_SPEED = 1e-3;

/**
 * Slack (m) subtracted from a ball–obstacle pair's gap before it is skipped (see the file header). Numerical, not
 * physical: it covers the drift between a ball's summed path length (the travel sum's own rounding included) and its
 * rounded position updates. A step rounds each horizontal coordinate by at most half an ulp (about 2e-15 m on a
 * full-size lawn), so the ball's distance from an obstacle by at most √2 times that per step. The drift accumulates
 * over the run's steps: at the default IMPACT_DT and IMPACT_CAP (12,000 steps) it stays near 1e-11 m, so the margin
 * keeps about 100× headroom. A tracked drive's longest run, a 60 ms lead-in and TRACK_IMPACT_CAP (102,000 steps),
 * would reach about 8.5e-11 m at the same rate, about 12× headroom; planning measured at most 2.3e-11 m over the
 * preset sweep's capped runs, 1.5e-11 m over a 102,000-step one (pre-flight confirms it, P2b.2b.1 design §3.5). A
 * test's finer step, on coordinates under 1 m, drifts less.
 */
const WAKE_MARGIN = 1e-9;

const UP = vec3(0, 0, 1);

/** A ball entering the integrator: its state and its turf law (null: no turf under it, for isolated test cases). */
export interface ImpactBall {
    readonly id: BallId;
    readonly state: BallState;
    readonly turf: PairLaw | null;
}

/** A fixed obstacle in the impact: its geometry and its ball–obstacle law (P2b.2a design §4). */
export interface ImpactObstacle extends ObstacleGeometry {
    readonly law: PairLaw;
}

/** Everything the integrator needs, every law already solved. */
export interface ImpactSetup {
    readonly head: MalletHead;
    readonly start: HeadState;
    /** The hands: a force table, or a tracked drive prepared once (track.ts). */
    readonly drive: ForceDrive | PreparedTrack;
    readonly face: PairLaw;
    readonly ballBall: PairLaw;
    readonly ball: BallParams;
    readonly gravity: number;
    /** In BALL_IDS order. */
    readonly balls: readonly ImpactBall[];
    /**
     * Hoop uprights, then the peg (obstaclesOf order); every ball is paired with each; pairs a ball cannot yet reach
     * are skipped.
     */
    readonly obstacles: readonly ImpactObstacle[];
    /**
     * The head–turf pair's law (P2b.2b.1 design §4.1), or null to leave the pair out: prepareImpact solves it for a
     * tracked drive and gives a force table none. Isolated set-ups (tests) may give any head the pair.
     */
    readonly headTurf: PairLaw | null;
}

/** One closed pair in one step, as the probe sees it: forces applied during the step, on body B. */
export interface ContactSample {
    readonly key: string;
    readonly normal: Vec3;
    readonly depth: number;
    readonly normalForce: number;
    readonly tangentialForce: Vec3;
    readonly spring: Vec3;
    readonly law: PairLaw;
}

/** The state after one step (t is its end), with the drive and contact forces applied during it. */
export interface ImpactSnapshot {
    readonly t: number;
    /** The hands' force: the force table's value, or a tracked drive's F. */
    readonly drive: Vec3;
    readonly head: HeadState;
    /** In setup order. */
    readonly balls: readonly BallState[];
    readonly contacts: readonly ContactSample[];
    /** A tracked drive's F, its feed-forward parts and each hand's force (P2b.2b.1 design §3.7); absent otherwise. */
    readonly hand?: { readonly force: Vec3; readonly feedForward: Vec3; readonly top: Vec3; readonly bottom: Vec3 };
    /** The turf's total force on the head (zero while the pair is open); absent without the head–turf pair. */
    readonly headTurf?: Vec3;
}

/** Measurement seam: called after every step (tests and scripts/impactProbe.ts). */
export interface ImpactProbe {
    step(snapshot: ImpactSnapshot): void;
}

/** Options of an impact. `dt` and `cap` exist for tests (convergence, isolated cases). */
export interface ImpactOptions {
    readonly dt?: number;
    /** An absolute time (s) that overrides IMPACT_CAP or a tracked drive's contactAt + TRACK_IMPACT_CAP. */
    readonly cap?: number;
    readonly probe?: ImpactProbe;
}

/** A follow-through's flags (P2b.2b.2a design §4.1): the cap reached, or the head driven past HEAD_DEEP_LIMIT. */
export type FollowFlag = "follow-cap" | "follow-head-deep";

/** The head at time t (s from t = 0). */
export interface StrokeState {
    readonly t: number;
    readonly head: HeadState;
}

/** A tracked stroke's impact and follow-through (P2b.2b.2a design §4.1); times in s from t = 0. */
export interface FollowThrough {
    /** The head every FOLLOW_SAMPLE from t = 0, and at the impact's end and at the finish. */
    readonly samples: readonly StrokeState[];
    readonly impactEnd: number;
    readonly finish: number;
    readonly flags: readonly FollowFlag[];
}

/** integrateStroke's result: the impact as integrate returns it, and its follow-through if asked for. */
export interface StrokeRun {
    readonly run: ImpactRun;
    readonly follow: FollowThrough | null;
}

/** A stroke type's finish (P2b.2b.2a design §4.2). */
type FinishKind = "swing" | "check" | "carry";

/** The finish of `plan`: carry mode's, a check's (α < 0 in swing mode), else a swing's. */
function finishKind(plan: PreparedTrack): FinishKind {
    if (plan.arc.mode === "carry") {
        return "carry";
    }
    return plan.arc.alpha < 0 ? "check" : "swing";
}

/**
 * True once the head in `state` at time t has reached its finish (P2b.2b.2a design §4.2): a swing at the pendulum's
 * apex, its pitch rate about n at or below zero; a check at rest relative to the hands; a carry at rest once the
 * hands' reach has ended (never, where the reach does not bind).
 */
function finished(kind: FinishKind, plan: PreparedTrack, state: HeadState, t: number): boolean {
    switch (kind) {
        case "swing":
            return dot(state.angularVelocity, plan.axis) <= 0;
        case "check":
            return length(sub(state.velocity, handsAt(plan, t).velocity)) < FINISH_SPEED;
        case "carry":
            return plan.reach !== null && t >= plan.reach.tStop && length(state.velocity) < FINISH_SPEED;
    }
}

/** The drive at time t: linear between samples, the last sample's force at its own time, and zero after it. */
export function driveAt(drive: readonly DriveSample[], t: number): Vec3 {
    const last = drive[drive.length - 1] as DriveSample;
    if (t > last.t) {
        return ZERO;
    }
    let i = 0;
    while (i + 1 < drive.length && (drive[i + 1] as DriveSample).t <= t) {
        i++;
    }
    const s = drive[i] as DriveSample;
    if (i + 1 === drive.length) {
        return s.force;
    }
    const next = drive[i + 1] as DriveSample;
    return add(s.force, scale(sub(next.force, s.force), (t - s.t) / (next.t - s.t)));
}

interface PairState {
    readonly pair: Pair;
    readonly law: PairLaw;
    /** Elastic tangential displacement ξ; cleared whenever the pair is open. */
    spring: Vec3;
    peak: number;
    /** The pair's contact timeline. */
    readonly line: PairTimeline;
    /** A ball–obstacle pair is skipped while ball B's path length is below this (m); 0 for every other pair. */
    wakeAt: number;
    /**
     * A tracked drive's face–ball pair: its timeline per head region, in HEAD_REGIONS order (design §4.5); null for
     * every other pair and for a force table.
     */
    readonly regions: readonly PairTimeline[] | null;
}

function lawOf(setup: ImpactSetup, pair: Pair): PairLaw {
    switch (pair.kind) {
        case "face-ball":
            return setup.face;
        case "ball-ball":
            return setup.ballBall;
        case "ball-turf":
            return (setup.balls[pair.b] as ImpactBall).turf as PairLaw;
        case "ball-obstacle":
            return (setup.obstacles[pair.a] as ImpactObstacle).law;
    }
}

/**
 * True while a ball at turf penetration δ (`depth`) still bounces (see the file header): its vertical oscillation
 * energy about the static sink δ₀ = m·g/k, ½·m·v_z² + ½·k·(δ − δ₀)², exceeds the static spring's ½·k·δ₀².
 */
function isBouncing(mass: number, vz: number, stiffness: number, depth: number, gravity: number): boolean {
    const sink = (mass * gravity) / stiffness;
    const offset = depth - sink;
    return 0.5 * mass * vz * vz + 0.5 * stiffness * offset * offset > 0.5 * stiffness * sink * sink;
}

/** One step's forces and torques, summed in pair-list order: on the head (world frame) and on each ball. */
interface StepLoads {
    headForce: Vec3;
    headTorque: Vec3;
    readonly forces: Vec3[];
    readonly torques: Vec3[];
}

/**
 * The normal and tangential force of one closed pair, from the current state; returns the normal force (N). Advances
 * the pair's tangential spring, adds the force to body B and its reaction to body A (the head, the other ball, or the
 * immovable turf), and appends the pair as the probe sees it to `samples` (null without a probe).
 */
function applyPair(
    p: PairState,
    contact: Penetration,
    head: HeadState,
    balls: readonly BallState[],
    dt: number,
    loads: StepLoads,
    samples: ContactSample[] | null,
): number {
    const { pair } = p;
    const sb = balls[pair.b] as BallState;
    const sa = pair.kind === "ball-ball" ? (balls[pair.a] as BallState) : null;
    // u: velocity of B's material point at the contact relative to A's (the turf's and an obstacle's are zero).
    const va =
        pair.kind === "face-ball"
            ? pointVelocity(head.position, head.velocity, head.angularVelocity, contact.point)
            : sa
              ? pointVelocity(sa.position, sa.velocity, sa.angularVelocity, contact.point)
              : ZERO;
    const u = sub(pointVelocity(sb.position, sb.velocity, sb.angularVelocity, contact.point), va);
    const along = dot(u, contact.normal);
    const normal = normalForce(p.law, contact.depth, 0 - along);
    const slip = sub(u, scale(contact.normal, along));
    // ξ carried over, projected onto the current tangent plane, then advanced by this step's slip.
    const carried = sub(p.spring, scale(contact.normal, dot(p.spring, contact.normal)));
    const tangential = tangentialForce(p.law, add(carried, scale(slip, dt)), slip, normal);
    p.spring = tangential.spring;
    const force = add(scale(contact.normal, normal), tangential.force);
    loads.forces[pair.b] = add(loads.forces[pair.b] as Vec3, force);
    loads.torques[pair.b] = add(loads.torques[pair.b] as Vec3, cross(sub(contact.point, sb.position), force));
    if (pair.kind === "face-ball") {
        loads.headForce = sub(loads.headForce, force);
        loads.headTorque = sub(loads.headTorque, cross(sub(contact.point, head.position), force));
    } else if (sa) {
        loads.forces[pair.a] = sub(loads.forces[pair.a] as Vec3, force);
        loads.torques[pair.a] = sub(loads.torques[pair.a] as Vec3, cross(sub(contact.point, sa.position), force));
    }
    samples?.push({
        key: pair.key,
        normal: contact.normal,
        depth: contact.depth,
        normalForce: normal,
        tangentialForce: tangential.force,
        spring: tangential.spring,
        law: p.law,
    });
    return normal;
}

/** The head–turf pair while the impact runs (design §4). */
interface HeadTurfState {
    readonly law: PairLaw;
    /** Elastic tangential displacement ξ; cleared whenever the pair is open. */
    spring: Vec3;
    peak: number;
    readonly line: PairTimeline;
    /** Slip distance (m) at the contact point: |horizontal velocity of the head's material|·dt, summed while closed. */
    slide: number;
}

/** A tracked impact's entry jumps (design §4.5), as ImpactRun.entryJumps reports them. */
interface EntryJumps {
    count: number;
    worst: number;
    readonly keys: string[];
}

/**
 * Counts an entry jump (design §4.5) when a contact opens `depth` deep, deeper than one step's closing at normal speed
 * `closing` could make, plus ENTRY_SLACK; `key` names the pair (and region), t is the step's start.
 */
function noteEntry(jumps: EntryJumps, depth: number, closing: number, dt: number, key: string, t: number): void {
    const excess = depth - (Math.abs(closing) * dt + ENTRY_SLACK);
    if (excess > 0) {
        jumps.count += 1;
        jumps.worst = Math.max(jumps.worst, excess);
        jumps.keys.push(`${key}@${t}`);
    }
}

/**
 * Records one step of a face–ball pair per head region (design §4.5): in contact on `region` with normal force
 * `force`, and out of contact on every other; nothing for a pair without regions.
 */
function recordRegions(
    lines: readonly PairTimeline[] | null,
    region: HeadRegion | null,
    force: number,
    t: number,
): void {
    if (lines === null) {
        return;
    }
    for (let i = 0; i < HEAD_REGIONS.length; i++) {
        const on = HEAD_REGIONS[i] === region;
        recordStep(lines[i] as PairTimeline, on, on ? force : 0, t);
    }
}

/**
 * The head–turf pair in one step (design §4.1), from the current state: the turf's clamped spring–dashpot and
 * Cundall–Strack friction act on the head at its lowest point. Adds the force and its moment about the head's centre
 * to the head's loads, records the step and the slide, counts an entry jump if the pair opens too deep (`jumps`, a
 * tracked drive's), and returns the force on the head, or null while the pair is open.
 */
function applyHeadTurf(
    p: HeadTurfState,
    state: HeadState,
    head: MalletHead,
    dt: number,
    loads: StepLoads,
    t: number,
    jumps: EntryJumps | null,
): Vec3 | null {
    const contact = headTurfContact(state, head);
    if (contact === null) {
        p.spring = ZERO;
        recordStep(p.line, false, 0, t);
        return null;
    }
    p.peak = Math.max(p.peak, contact.depth);
    const u = pointVelocity(state.position, state.velocity, state.angularVelocity, contact.point);
    if (jumps !== null && p.line.start === null) {
        noteEntry(jumps, contact.depth, u.z, dt, HEAD_TURF_KEY, t);
    }
    const normal = normalForce(p.law, contact.depth, 0 - u.z);
    const slip = horizontal(u);
    const tangential = tangentialForce(p.law, add(horizontal(p.spring), scale(slip, dt)), slip, normal);
    p.spring = tangential.spring;
    const force = add(vec3(0, 0, normal), tangential.force);
    loads.headForce = add(loads.headForce, force);
    loads.headTorque = add(loads.headTorque, cross(sub(contact.point, state.position), force));
    p.slide += length(slip) * dt;
    recordStep(p.line, true, normal, t);
    return force;
}

/** One semi-implicit Euler step of the head alone (a force table) under `loads`. */
function stepHead(state: HeadState, loads: StepLoads, head: MalletHead, dt: number): HeadState {
    const velocity = add(state.velocity, scale(loads.headForce, dt / head.mass));
    const bodyOmega = rotateInverse(state.orientation, state.angularVelocity);
    const bodyTorque = rotateInverse(state.orientation, loads.headTorque);
    const spun = add(bodyOmega, scale(angularAcceleration(head.inertia, bodyOmega, bodyTorque), dt));
    const angularVelocity = rotate(state.orientation, spun);
    return {
        position: add(state.position, scale(velocity, dt)),
        orientation: integrateOrientation(state.orientation, angularVelocity, dt),
        velocity,
        angularVelocity,
    };
}

/**
 * One semi-implicit Euler step of a tracked drive's swung body (P2b.2b.1 design §3.3) under `loads`, which act on the
 * head (forces, and torques about the head's centre c_h): its centre c_s = c_h + δ·s and its spin, the torque about
 * c_s being the torque about c_h plus (c_h − c_s) × F. Returns the head's state, which follows from the body's.
 */
function stepSwung(state: HeadState, loads: StepLoads, body: SwungBody, dt: number): HeadState {
    const offset = scale(rotate(state.orientation, UP), body.offset);
    const centreVelocity = add(state.velocity, cross(state.angularVelocity, offset));
    const torque = sub(loads.headTorque, cross(offset, loads.headForce));
    const velocity = add(centreVelocity, scale(loads.headForce, dt / body.mass));
    const bodyOmega = rotateInverse(state.orientation, state.angularVelocity);
    const bodyTorque = rotateInverse(state.orientation, torque);
    const spun = add(bodyOmega, scale(angularAcceleration(body.inertia, bodyOmega, bodyTorque), dt));
    const angularVelocity = rotate(state.orientation, spun);
    const centre = add(add(state.position, offset), scale(velocity, dt));
    const orientation = integrateOrientation(state.orientation, angularVelocity, dt);
    const next = scale(rotate(orientation, UP), body.offset);
    return {
        position: sub(centre, next),
        orientation,
        velocity: sub(velocity, cross(angularVelocity, next)),
        angularVelocity,
    };
}

/**
 * One semi-implicit Euler step of every body under `loads`: velocities from the forces, then positions (and the head's
 * orientation) from the new velocities. Returns the head's new state, replaces each ball's in `balls` and adds each
 * ball's horizontal path length this step to `travel`.
 */
function advance(
    state: HeadState,
    balls: BallState[],
    travel: number[],
    loads: StepLoads,
    setup: ImpactSetup,
    ballInertia: number,
    dt: number,
): HeadState {
    const { head, ball, drive } = setup;
    const next = drive.kind === "force" ? stepHead(state, loads, head, dt) : stepSwung(state, loads, drive.body, dt);
    for (let i = 0; i < balls.length; i++) {
        const s = balls[i] as BallState;
        const v = add(s.velocity, scale(loads.forces[i] as Vec3, dt / ball.mass));
        const w = add(s.angularVelocity, scale(loads.torques[i] as Vec3, dt / ballInertia));
        balls[i] = { position: add(s.position, scale(v, dt)), velocity: v, angularVelocity: w };
        // Horizontal speed suffices, and wakes no pair early for a ball bouncing in the turf: an obstacle is a vertical
        // cylinder, its gap horizontal.
        travel[i] = (travel[i] as number) + length(horizontal(v)) * dt;
    }
    return next;
}

/** Which balls are in turf contact, and which have left it once; the latter raise `turf-lift` (design §4). */
interface TurfTrack {
    readonly inTurf: boolean[];
    readonly lifted: boolean[];
}

/**
 * Updates `track` after a step at time `now`, raising `turf-lift` for a ball that first leaves the turf, and returns
 * whether any ball in turf contact is still bouncing in it (see the file header).
 */
function trackTurf(
    balls: readonly BallState[],
    setup: ImpactSetup,
    track: TurfTrack,
    now: number,
    events: ImpactEvent[],
): boolean {
    const R = setup.ball.radius;
    let turfMoving = false;
    for (let i = 0; i < balls.length; i++) {
        const entry = setup.balls[i] as ImpactBall;
        if (entry.turf === null) {
            continue;
        }
        const s = balls[i] as BallState;
        const below = s.position.z < R;
        if (track.inTurf[i] && !below && !track.lifted[i]) {
            track.lifted[i] = true;
            events.push({ kind: "turf-lift", t: now, ball: entry.id });
        }
        track.inTurf[i] = below;
        if (below && isBouncing(setup.ball.mass, s.velocity.z, entry.turf.stiffness, R - s.position.z, setup.gravity)) {
            turfMoving = true;
        }
    }
    return turfMoving;
}

/**
 * The run's result once the loop has ended at `duration`: each ball's final state, an `impact-head-approaching` event
 * for every ball the head is still closing on, every pair's peak penetration, the contact timeline, the pairs touching
 * at the start and, if the head–turf pair closed, its peak penetration, intervals and slide, and for a tracked drive
 * the head–ball intervals per region and the entry jumps.
 */
function finish(
    setup: ImpactSetup,
    state: HeadState,
    balls: readonly BallState[],
    pairs: readonly PairState[],
    turf: HeadTurfState | null,
    jumps: EntryJumps | null,
    events: ImpactEvent[],
    steps: number,
    duration: number,
    touchingAtStart: readonly string[],
): ImpactRun {
    const final: BallStates = {};
    for (let i = 0; i < balls.length; i++) {
        const s = balls[i] as BallState;
        const id = (setup.balls[i] as ImpactBall).id;
        final[id] = s;
        if (headClosing(state, setup.head, s, setup.ball.radius)) {
            events.push({ kind: "impact-head-approaching", t: duration, ball: id });
        }
    }
    const peakPenetration: Record<string, number> = {};
    for (const p of pairs) {
        if (p.peak > 0) {
            peakPenetration[p.pair.key] = p.peak;
        }
    }
    const timeline: Record<string, readonly ContactInterval[]> = {};
    for (const p of pairs) {
        const intervals = closeTimeline(p.line, duration);
        if (intervals.length > 0) {
            timeline[p.pair.key] = intervals;
        }
    }
    const turfIntervals = turf === null ? [] : closeTimeline(turf.line, duration);
    const turfClosed = turf !== null && turfIntervals.length > 0;
    if (turfClosed) {
        peakPenetration[HEAD_TURF_KEY] = turf.peak;
        timeline[HEAD_TURF_KEY] = turfIntervals;
    }
    const run: ImpactRun = {
        balls: final,
        head: state,
        duration,
        events,
        peakPenetration,
        steps,
        timeline,
        touchingAtStart,
        ...(turfClosed ? { headTurfSlide: turf.slide } : {}),
    };
    if (jumps === null) {
        return run;
    }
    const headRegions: Record<string, readonly ContactInterval[]> = {};
    for (const p of pairs) {
        const lines = p.regions;
        if (lines === null) {
            continue;
        }
        for (let i = 0; i < HEAD_REGIONS.length; i++) {
            const intervals = closeTimeline(lines[i] as PairTimeline, duration);
            if (intervals.length > 0) {
                headRegions[`${p.pair.key}#${HEAD_REGIONS[i] as HeadRegion}`] = intervals;
            }
        }
    }
    return { ...run, headRegions, entryJumps: { count: jumps.count, worst: jumps.worst, keys: [...jumps.keys] } };
}

/** When a tracked drive's actions are over: both arcs' windows and, if it has depth, the dip (design §3.5). */
function trackEnd(plan: PreparedTrack): number {
    const { arc } = plan;
    const dip = arc.dip.depth > 0 ? arc.dip.start + arc.dip.duration : 0;
    return Math.max(arc.arcStart + arc.window, arc.handStart + arc.handWindow, dip);
}

/**
 * True while a tracked head still reaches for a ball at time t (design §3.5): it is closing on one within reach
 * (headClosing), or its front face would reach one ahead of it within LOOK_AHEAD. A ball is ahead when its centre lies
 * a distance d > 0 in front of the face plane along the face normal f and within ρ + R of the head's axis; the face
 * closes at max(v_head·f, v_path·f) − v_ball·f, v_path the head's velocity on the path, which the hands still drive
 * towards, and would reach it if that is positive and d − R < closing·LOOK_AHEAD.
 */
function stillReaching(
    state: HeadState,
    head: MalletHead,
    balls: readonly BallState[],
    radius: number,
    plan: PreparedTrack,
    t: number,
): boolean {
    if (balls.some((s) => headClosing(state, head, s, radius))) {
        return true;
    }
    const path = pathAt(plan, t);
    const onPath = add(
        path.socketVelocity,
        cross(path.angularVelocity, rotate(path.orientation, scale(head.socket, -1))),
    );
    const f = rotate(state.orientation, vec3(1, 0, 0));
    const face = add(state.position, scale(f, head.length / 2));
    const speed = Math.max(dot(state.velocity, f), dot(onPath, f));
    for (const s of balls) {
        const offset = sub(s.position, face);
        const d = dot(offset, f);
        if (!(d > 0) || length(sub(offset, scale(f, d))) >= head.radius + radius) {
            continue;
        }
        const closing = speed - dot(s.velocity, f);
        if (closing > 0 && d - radius < closing * LOOK_AHEAD) {
            return true;
        }
    }
    return false;
}

/**
 * Integrates the impact from `setup` until it ends (see the file header) and, with `follow` and a tracked drive, the
 * follow-through (P2b.2b.2a design §4.1). The impact is the same either way: recording the samples only reads the
 * state, and the run is fixed before the follow-through starts.
 */
export function integrateStroke(setup: ImpactSetup, options: ImpactOptions = {}, follow = false): StrokeRun {
    const dt = options.dt ?? IMPACT_DT;
    const { head, ball, drive: plan } = setup;
    const cap = options.cap ?? (plan.kind === "force" ? IMPACT_CAP : plan.arc.contactAt + TRACK_IMPACT_CAP);
    const R = ball.radius;
    const ballInertia = 0.4 * ball.mass * R * R;
    const driveEnd = plan.kind === "force" ? (plan.samples[plan.samples.length - 1] as DriveSample).t : trackEnd(plan);
    const grip = newGripState();
    const headWeight = vec3(0, 0, 0 - head.mass * setup.gravity);
    const ballWeight = vec3(0, 0, 0 - ball.mass * setup.gravity);
    const ids = setup.balls.map((b) => b.id);
    const hasTurf = setup.balls.map((b) => b.turf !== null);
    const tracked = plan.kind === "track";
    const pairs: PairState[] = pairList(
        ids,
        hasTurf,
        setup.obstacles.map((o) => o.id),
    ).map((pair) => ({
        pair,
        law: lawOf(setup, pair),
        spring: ZERO,
        peak: 0,
        line: emptyTimeline(),
        wakeAt: 0,
        regions: tracked && pair.kind === "face-ball" ? HEAD_REGIONS.map(() => emptyTimeline()) : null,
    }));
    const balls: BallState[] = setup.balls.map((b) => b.state);
    const travel = balls.map(() => 0);
    const touchingAtStart = pairs.filter((p) => pairTouching(p.pair, balls, R, setup.obstacles)).map((p) => p.pair.key);
    const events: ImpactEvent[] = [];
    const track: TurfTrack = {
        inTurf: balls.map((s, i) => hasTurf[i] === true && s.position.z < R),
        lifted: balls.map(() => false),
    };
    const offFace = balls.map(() => false);
    const turf: HeadTurfState | null =
        setup.headTurf === null
            ? null
            : { law: setup.headTurf, spring: ZERO, peak: 0, line: emptyTimeline(), slide: 0 };
    let deep = false;
    const jumps: EntryJumps | null = tracked ? { count: 0, worst: 0, keys: [] } : null;
    let state: HeadState = setup.start;
    let grounded = false;
    let struck = false;
    let quiet = 0;
    let steps = 0;
    const trace: StrokeState[] | null = follow && tracked ? [{ t: 0, head: setup.start }] : null;
    const every = Math.max(1, Math.round(FOLLOW_SAMPLE / dt));

    for (;;) {
        const t = steps * dt;
        let drive: Vec3;
        let headTorque: Vec3;
        let hand: HandLoad | null = null;
        if (plan.kind === "force") {
            drive = driveAt(plan.samples, t);
            headTorque = cross(rotate(state.orientation, head.socket), drive);
        } else {
            hand = handLoad(plan, state, head, t, grip);
            drive = hand.force;
            headTorque = hand.torque;
        }
        const loads: StepLoads = {
            headForce: add(drive, headWeight),
            headTorque,
            forces: balls.map(() => ballWeight),
            torques: balls.map(() => ZERO),
        };
        const samples: ContactSample[] = [];
        let hardClosed = false;

        for (const p of pairs) {
            const { pair } = p;
            // A skipped pair was open when last evaluated: its spring is already ZERO and it has no open interval, so
            // evaluating it would change nothing.
            if (pair.kind === "ball-obstacle" && (travel[pair.b] as number) < p.wakeAt) {
                continue;
            }
            // A tracked drive's face–ball pair meets the whole head (design §4.5); a force table keeps the face alone.
            const hit =
                p.regions === null ? null : headBallContact(state, head, (balls[pair.b] as BallState).position, R);
            const contact = p.regions === null ? pairContact(pair, state, head, balls, R, setup.obstacles) : hit;
            if (contact === OFF_FACE || contact === null) {
                p.spring = ZERO;
                if (pair.kind === "ball-obstacle") {
                    const gap = obstacleGap(
                        (balls[pair.b] as BallState).position,
                        R,
                        setup.obstacles[pair.a] as ImpactObstacle,
                    );
                    p.wakeAt = (travel[pair.b] as number) + gap - WAKE_MARGIN;
                }
                if (contact === OFF_FACE && !offFace[pair.b]) {
                    offFace[pair.b] = true;
                    events.push({ kind: "impact-off-face", t, ball: ids[pair.b] as BallId });
                }
                recordStep(p.line, contact === OFF_FACE, 0, t);
                recordRegions(p.regions, null, 0, t);
                if (pair.kind === "face-ball" && contact === null && inGap(p.line)) {
                    noteClearance(p.line, faceClearance(state, head, (balls[pair.b] as BallState).position, R));
                }
                continue;
            }
            if (pair.kind !== "ball-turf") {
                hardClosed = true;
            }
            if (pair.kind === "face-ball") {
                struck = true;
            }
            // The re-entry guard reads the interval's first step, before the step is recorded.
            if (hit !== null && jumps !== null && p.line.start === null) {
                const sb = balls[pair.b] as BallState;
                const u = sub(
                    pointVelocity(sb.position, sb.velocity, sb.angularVelocity, hit.point),
                    pointVelocity(state.position, state.velocity, state.angularVelocity, hit.point),
                );
                noteEntry(jumps, hit.depth, dot(u, hit.normal), dt, `${pair.key}#${hit.region}`, t);
            }
            if (hit !== null && hit.region !== "face" && !offFace[pair.b]) {
                offFace[pair.b] = true;
                events.push({ kind: "impact-off-face", t, ball: ids[pair.b] as BallId });
            }
            p.peak = Math.max(p.peak, contact.depth);
            const force = applyPair(p, contact, state, balls, dt, loads, options.probe ? samples : null);
            recordStep(p.line, true, force, t);
            recordRegions(p.regions, hit === null ? null : hit.region, force, t);
        }

        // The head–turf pair comes after every other pair (design §4.1).
        const turfForce = turf === null ? null : applyHeadTurf(turf, state, head, dt, loads, t, jumps);
        if (turfForce !== null) {
            hardClosed = true;
        }

        state = advance(state, balls, travel, loads, setup, ballInertia, dt);
        steps++;
        const now = steps * dt;
        if (trace !== null && steps % every === 0) {
            trace.push({ t: now, head: state });
        }
        const turfMoving = trackTurf(balls, setup, track, now, events);
        if (turf === null) {
            if (!grounded && headLowestPoint(state, head) < 0) {
                grounded = true;
                events.push({ kind: "impact-mallet-grounded", t: now });
            }
        } else if (!deep && headLowestPoint(state, head) < 0 - HEAD_DEEP_LIMIT) {
            deep = true;
            events.push({ kind: "impact-head-deep", t: now });
        }
        if (options.probe) {
            const snapshot: ImpactSnapshot = { t: now, drive, head: state, balls: [...balls], contacts: samples };
            options.probe.step(
                hand === null && turf === null
                    ? snapshot
                    : {
                          ...snapshot,
                          ...(hand === null
                              ? {}
                              : {
                                    hand: {
                                        force: hand.force,
                                        feedForward: hand.feedForward,
                                        top: hand.top,
                                        bottom: hand.bottom,
                                    },
                                }),
                          ...(turf === null ? {} : { headTurf: turfForce ?? ZERO }),
                      },
            );
        }

        quiet = hardClosed ? 0 : quiet + 1;
        const settled = struck && now >= driveEnd && quiet >= RELEASE_STEPS && !turfMoving;
        if (settled && (plan.kind === "force" || !stillReaching(state, head, balls, R, plan, now))) {
            break;
        }
        if (now >= cap) {
            events.push({ kind: "impact-cap", t: now });
            break;
        }
    }

    const run = finish(setup, state, balls, pairs, turf, jumps, events, steps, steps * dt, touchingAtStart);
    const done =
        grip.releasedAt === null ? run : { ...run, release: { t: grip.releasedAt, deltaTheta: grip.releaseDelta } };
    if (trace === null || plan.kind !== "track") {
        return { run: done, follow: null };
    }
    return { run: done, follow: continueStroke(setup, plan, state, grip, turf, steps, dt, trace) };
}

/** Integrates the impact from `setup` until it ends (see the file header). */
export function integrate(setup: ImpactSetup, options: ImpactOptions = {}): ImpactRun {
    return integrateStroke(setup, options).run;
}

/**
 * The follow-through (P2b.2b.2a design §4.1): the impact's loop continued from `start` at step `first`, with the balls
 * removed. The hands keep `grip`; the head–turf pair keeps its spring on a fresh timeline, so the run's timeline is
 * never touched. A stop holds its pendulum from the check's window's end (or the impact's end, if later), and the
 * hands grip the head firmly from then on (holdPendulum, handLoad's `gripped`). Appends to `trace` the head at the
 * impact's end, every FOLLOW_SAMPLE, and at the finish: the stroke type's, or FOLLOW_CAP after contact with
 * `follow-cap`. Flags `follow-head-deep` once, as the impact flags `impact-head-deep`.
 */
function continueStroke(
    setup: ImpactSetup,
    plan: PreparedTrack,
    start: HeadState,
    grip: GripState,
    turf: HeadTurfState | null,
    first: number,
    dt: number,
    trace: StrokeState[],
): FollowThrough {
    const { head } = setup;
    const every = Math.max(1, Math.round(FOLLOW_SAMPLE / dt));
    const kind = finishKind(plan);
    // A stop holds its mallet still after the check (user decision 2026-10-07; Riches: "NO FOLLOW-THROUGH"): from the
    // check's window's end, or the impact's end if later, the pendulum is held and the hands grip the head firmly.
    const holdFrom = kind === "check" ? Math.max(plan.arc.arcStart + plan.arc.window, first * dt) : Infinity;
    const path = kind === "check" ? holdPendulum(plan, holdFrom) : plan;
    const cap = plan.arc.contactAt + FOLLOW_CAP;
    const headWeight = vec3(0, 0, 0 - head.mass * setup.gravity);
    const ground: HeadTurfState | null =
        turf === null ? null : { law: turf.law, spring: turf.spring, peak: 0, line: emptyTimeline(), slide: 0 };
    const flags: FollowFlag[] = [];
    const none: BallState[] = [];
    if ((trace[trace.length - 1] as StrokeState).t !== first * dt) {
        trace.push({ t: first * dt, head: start });
    }
    let state = start;
    let steps = first;
    let deep = false;
    for (;;) {
        const t = steps * dt;
        if (finished(kind, plan, state, t)) {
            break;
        }
        if (t >= cap) {
            flags.push("follow-cap");
            break;
        }
        // The impact loop's hands, head–turf and advance, kept apart: sharing them would reorder the impact's sums.
        const hand = handLoad(path, state, head, t, grip, t >= holdFrom);
        const loads: StepLoads = {
            headForce: add(hand.force, headWeight),
            headTorque: hand.torque,
            forces: [],
            torques: [],
        };
        if (ground !== null) {
            applyHeadTurf(ground, state, head, dt, loads, t, null);
        }
        state = advance(state, none, [], loads, setup, 0, dt);
        steps++;
        if (ground !== null && !deep && headLowestPoint(state, head) < 0 - HEAD_DEEP_LIMIT) {
            deep = true;
            flags.push("follow-head-deep");
        }
        if (steps % every === 0) {
            trace.push({ t: steps * dt, head: state });
        }
    }
    const end = steps * dt;
    if ((trace[trace.length - 1] as StrokeState).t !== end) {
        trace.push({ t: end, head: state });
    }
    return { samples: trace, impactEnd: first * dt, finish: end, flags };
}
