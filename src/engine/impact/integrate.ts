/**
 * The impact integrator (P2b.1 design §5): semi-implicit (symplectic) Euler at a fixed step over the mallet head, the
 * balls and the turf. Each step:
 * 1. computes every force from the current state: the hands' load (a force table at the socket, or a tracked drive's
 *    two hands, track.ts) and gravity, then each closed pair in pair-list order;
 * 2. updates every velocity from those forces, the head's spin through Euler's equations in its body frame (for a
 *    tracked drive, the swung body's: the head and the arm mass, P2b.2b.1 design §3.3);
 * 3. updates every position, and the head's orientation, from the new velocities.
 *
 * Bodies and pairs are visited in a fixed order and forces summed in it, so repeated runs are bit-identical, and
 * set-ups mirrored across a vertical plane give exactly mirrored results. Obstacles (hoop uprights and the peg) are
 * immovable: a ball–obstacle pair's force acts on the ball alone.
 *
 * The impact ends once a face–ball contact has closed, the drive window has closed, no face–ball, ball–ball or
 * ball–obstacle contact has been closed for RELEASE_STEPS steps, and no ball in turf contact is still bouncing in it;
 * or at the cap. A ball bounces while its vertical oscillation energy about the static sink δ₀ = m·g/k,
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
 * Every step also records whether each pair is in contact (closed, or a face at the rim), building the contact
 * timeline (timeline.ts; P2b.2a design §5); the pairs touching at t = 0 are listed in `touchingAtStart`. Recording
 * only reads the state.
 *
 * A ball–obstacle pair is skipped while the ball cannot yet have reached the obstacle: each ball's horizontal path
 * length is summed, and a pair found open is not evaluated again until the ball has travelled its gap (less
 * WAKE_MARGIN). The filter is exact: a skipped pair is open, so evaluating it would add no force and change no state,
 * and the pairs evaluated are visited, and their forces summed, in the same order.
 */
import { ZERO, add, cross, dot, horizontal, length, scale, sub, vec3, type Vec3 } from "../math/vec3";
import type { BallId, BallParams, BallState, BallStates } from "../types";
import { normalForce, tangentialForce, type PairLaw } from "./contactLaw";
import {
    OFF_FACE,
    faceClearance,
    headClosing,
    headLowestPoint,
    obstacleGap,
    pairContact,
    pairList,
    pairTouching,
    pointVelocity,
    type ObstacleGeometry,
    type Pair,
    type Penetration,
} from "./contacts";
import { angularAcceleration, integrateOrientation, rotate, rotateInverse } from "./rigidBody";
import { closeTimeline, emptyTimeline, inGap, noteClearance, recordStep, type PairTimeline } from "./timeline";
import { handLoad, newGripState, pathAt, type HandLoad, type PreparedTrack, type SwungBody } from "./track";
import type { ContactInterval, DriveSample, ForceDrive, HeadState, ImpactEvent, ImpactRun, MalletHead } from "./types";

/**
 * Integration step (s): about 1/100 of the shortest sourced contact duration, 0.5 ms (the lower bound of the ball–ball
 * contact time, contact.json), confirmed by the convergence test. A constant of the engine version, never adapted to
 * the input, so the step count and results are identical across runs. Pre-flight: halving it moves the scenarios'
 * handovers by at most 1.5e-3 of the head speed (3.1e-3 at 1e-5 s); errors fall first-order with dt.
 */
export const IMPACT_DT = 5e-6;

/**
 * Consecutive steps without a closed face–ball, ball–ball or ball–obstacle contact after which the impact may
 * end. A numerical allowance for a contact to re-close (a croquet stroke's balls part and meet again), not physical.
 * Pre-flight: ×4 moves no ball's state 50 ms after the strike by more than 2.8e-4 of the head speed.
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
 * Horizon (s) of the tracked end rule's look-ahead (design §3.5): the impact runs on while the front face would reach
 * a ball ahead of it within this time. A modelling bound, not physical: a head slowed below the striker's ball by the
 * strike, catching it again, is integrated.
 */
export const LOOK_AHEAD = 0.03;

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
 * for every ball the head is still closing on, every pair's peak penetration, the contact timeline and the pairs
 * touching at the start.
 */
function finish(
    setup: ImpactSetup,
    state: HeadState,
    balls: readonly BallState[],
    pairs: readonly PairState[],
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
    return { balls: final, head: state, duration, events, peakPenetration, steps, timeline, touchingAtStart };
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

/** Integrates the impact from `setup` until it ends (see the file header). */
export function integrate(setup: ImpactSetup, options: ImpactOptions = {}): ImpactRun {
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
    let state: HeadState = setup.start;
    let grounded = false;
    let struck = false;
    let quiet = 0;
    let steps = 0;

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
            const contact = pairContact(pair, state, head, balls, R, setup.obstacles);
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
            p.peak = Math.max(p.peak, contact.depth);
            const force = applyPair(p, contact, state, balls, dt, loads, options.probe ? samples : null);
            recordStep(p.line, true, force, t);
        }

        state = advance(state, balls, travel, loads, setup, ballInertia, dt);
        steps++;
        const now = steps * dt;
        const turfMoving = trackTurf(balls, setup, track, now, events);
        if (!grounded && headLowestPoint(state, head) < 0) {
            grounded = true;
            events.push({ kind: "impact-mallet-grounded", t: now });
        }
        if (options.probe) {
            const snapshot: ImpactSnapshot = { t: now, drive, head: state, balls: [...balls], contacts: samples };
            options.probe.step(
                hand === null
                    ? snapshot
                    : {
                          ...snapshot,
                          hand: {
                              force: hand.force,
                              feedForward: hand.feedForward,
                              top: hand.top,
                              bottom: hand.bottom,
                          },
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

    const run = finish(setup, state, balls, pairs, events, steps, steps * dt, touchingAtStart);
    if (grip.releasedAt === null) {
        return run;
    }
    return { ...run, release: { t: grip.releasedAt, deltaTheta: grip.releaseDelta } };
}
