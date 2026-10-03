/**
 * The impact integrator (P2b.1 design §5): semi-implicit (symplectic) Euler at a fixed step over the mallet head, the
 * balls and the turf. Each step:
 * 1. computes every force from the current state: the drive (at the socket) and gravity, then each closed pair in
 *    pair-list order;
 * 2. updates every velocity from those forces, the head's spin through Euler's equations in its body frame;
 * 3. updates every position, and the head's orientation, from the new velocities.
 *
 * Bodies and pairs are visited in a fixed order and forces summed in it, so repeated runs are bit-identical, and
 * set-ups mirrored across a vertical plane give exactly mirrored results.
 *
 * The impact ends once a face–ball contact has closed, the drive window has closed, no face–ball or ball–ball contact
 * has been closed for RELEASE_STEPS steps, and no ball in turf contact is still bouncing in it; or at the cap. A ball
 * bounces while its vertical oscillation energy about the static sink δ₀ = m·g/k, ½·m·v_z² + ½·k·(δ − δ₀)², exceeds
 * the static spring's ½·k·δ₀²: it will reach δ = 0 and leave the turf, so the turf's rebound, which dominates lift, is
 * integrated rather than discarded at handover. Below that the ball only settles in its hollow, and the handover
 * discards at most m·g·δ₀/2 (design §6). Isolated set-ups (tests) may give balls any state and leave the turf out;
 * simulateImpact.ts prepares and validates real ones.
 */
import { ZERO, add, cross, dot, scale, sub, vec3, type Vec3 } from "../math/vec3";
import type { BallId, BallParams, BallState, BallStates } from "../types";
import { normalForce, tangentialForce, type PairLaw } from "./contactLaw";
import {
    OFF_FACE,
    headClosing,
    headLowestPoint,
    pairContact,
    pairList,
    pointVelocity,
    type Pair,
    type Penetration,
} from "./contacts";
import { angularAcceleration, integrateOrientation, rotate, rotateInverse } from "./rigidBody";
import type { DriveSample, HeadState, ImpactEvent, ImpactRun, MalletHead } from "./types";

/**
 * Integration step (s): about 1/100 of the shortest sourced contact duration, 0.5 ms (the lower bound of the ball–ball
 * contact time, contact.json), confirmed by the convergence test. A constant of the engine version, never adapted to
 * the input, so the step count and results are identical across runs. Pre-flight: halving it moves the scenarios'
 * handovers by at most 1.5e-3 of the head speed (3.1e-3 at 1e-5 s); errors fall first-order with dt.
 */
export const IMPACT_DT = 5e-6;

/**
 * Consecutive steps without a closed face–ball or ball–ball contact after which the impact may end. A numerical
 * allowance for a contact to re-close (a croquet stroke's balls part and meet again), not physical. Pre-flight: ×4
 * moves no ball's state 50 ms after the strike by more than 2.8e-4 of the head speed.
 */
export const RELEASE_STEPS = 50;

/**
 * Longest impact (s); reaching it ends the impact with an `impact-cap` event rather than hanging. Pre-flight: 5× the
 * longest fuzz impact (11.6 ms); a head that never reaches the ball (a whiff) runs to it.
 */
export const IMPACT_CAP = 0.06;

/** A ball entering the integrator: its state and its turf law (null: no turf under it, for isolated test cases). */
export interface ImpactBall {
    readonly id: BallId;
    readonly state: BallState;
    readonly turf: PairLaw | null;
}

/** Everything the integrator needs, every law already solved. */
export interface ImpactSetup {
    readonly head: MalletHead;
    readonly start: HeadState;
    readonly drive: readonly DriveSample[];
    readonly face: PairLaw;
    readonly ballBall: PairLaw;
    readonly ball: BallParams;
    readonly gravity: number;
    /** In BALL_IDS order. */
    readonly balls: readonly ImpactBall[];
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
    readonly drive: Vec3;
    readonly head: HeadState;
    /** In setup order. */
    readonly balls: readonly BallState[];
    readonly contacts: readonly ContactSample[];
}

/** Measurement seam: called after every step (tests and scripts/impactProbe.ts). */
export interface ImpactProbe {
    step(snapshot: ImpactSnapshot): void;
}

/** Options of an impact. `dt` and `cap` exist for tests (convergence, isolated cases). */
export interface ImpactOptions {
    readonly dt?: number;
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
}

function lawOf(setup: ImpactSetup, pair: Pair): PairLaw {
    switch (pair.kind) {
        case "face-ball":
            return setup.face;
        case "ball-ball":
            return setup.ballBall;
        case "ball-turf":
            return (setup.balls[pair.b] as ImpactBall).turf as PairLaw;
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
 * The normal and tangential force of one closed pair, from the current state: advances the pair's tangential spring,
 * adds the force to body B and its reaction to body A (the head, the other ball, or the immovable turf), and appends
 * the pair as the probe sees it to `samples` (null without a probe).
 */
function applyPair(
    p: PairState,
    contact: Penetration,
    head: HeadState,
    balls: readonly BallState[],
    dt: number,
    loads: StepLoads,
    samples: ContactSample[] | null,
): void {
    const { pair } = p;
    const sb = balls[pair.b] as BallState;
    const sa = pair.kind === "ball-ball" ? (balls[pair.a] as BallState) : null;
    // u: velocity of B's material point at the contact relative to A's (the turf's is zero).
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
}

/**
 * One semi-implicit Euler step of every body under `loads`: velocities from the forces, then positions (and the head's
 * orientation) from the new velocities. Returns the head's new state and replaces each ball's in `balls`.
 */
function advance(
    state: HeadState,
    balls: BallState[],
    loads: StepLoads,
    setup: ImpactSetup,
    ballInertia: number,
    dt: number,
): HeadState {
    const { head, ball } = setup;
    const velocity = add(state.velocity, scale(loads.headForce, dt / head.mass));
    const bodyOmega = rotateInverse(state.orientation, state.angularVelocity);
    const bodyTorque = rotateInverse(state.orientation, loads.headTorque);
    const spun = add(bodyOmega, scale(angularAcceleration(head.inertia, bodyOmega, bodyTorque), dt));
    const angularVelocity = rotate(state.orientation, spun);
    for (let i = 0; i < balls.length; i++) {
        const s = balls[i] as BallState;
        const v = add(s.velocity, scale(loads.forces[i] as Vec3, dt / ball.mass));
        const w = add(s.angularVelocity, scale(loads.torques[i] as Vec3, dt / ballInertia));
        balls[i] = { position: add(s.position, scale(v, dt)), velocity: v, angularVelocity: w };
    }
    return {
        position: add(state.position, scale(velocity, dt)),
        orientation: integrateOrientation(state.orientation, angularVelocity, dt),
        velocity,
        angularVelocity,
    };
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
 * for every ball the head is still closing on, and every pair's peak penetration.
 */
function finish(
    setup: ImpactSetup,
    state: HeadState,
    balls: readonly BallState[],
    pairs: readonly PairState[],
    events: ImpactEvent[],
    steps: number,
    duration: number,
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
    return { balls: final, head: state, duration, events, peakPenetration, steps };
}

/** Integrates the impact from `setup` until it ends (see the file header). */
export function integrate(setup: ImpactSetup, options: ImpactOptions = {}): ImpactRun {
    const dt = options.dt ?? IMPACT_DT;
    const cap = options.cap ?? IMPACT_CAP;
    const { head, ball } = setup;
    const R = ball.radius;
    const ballInertia = 0.4 * ball.mass * R * R;
    const driveEnd = (setup.drive[setup.drive.length - 1] as DriveSample).t;
    const headWeight = vec3(0, 0, 0 - head.mass * setup.gravity);
    const ballWeight = vec3(0, 0, 0 - ball.mass * setup.gravity);
    const ids = setup.balls.map((b) => b.id);
    const hasTurf = setup.balls.map((b) => b.turf !== null);
    const pairs: PairState[] = pairList(ids, hasTurf).map((pair) => ({
        pair,
        law: lawOf(setup, pair),
        spring: ZERO,
        peak: 0,
    }));
    const balls: BallState[] = setup.balls.map((b) => b.state);
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
        const drive = driveAt(setup.drive, t);
        const loads: StepLoads = {
            headForce: add(drive, headWeight),
            headTorque: cross(rotate(state.orientation, head.socket), drive),
            forces: balls.map(() => ballWeight),
            torques: balls.map(() => ZERO),
        };
        const samples: ContactSample[] = [];
        let hardClosed = false;

        for (const p of pairs) {
            const { pair } = p;
            const contact = pairContact(pair, state, head, balls, R);
            if (contact === OFF_FACE || contact === null) {
                p.spring = ZERO;
                if (contact === OFF_FACE && !offFace[pair.b]) {
                    offFace[pair.b] = true;
                    events.push({ kind: "impact-off-face", t, ball: ids[pair.b] as BallId });
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
            applyPair(p, contact, state, balls, dt, loads, options.probe ? samples : null);
        }

        state = advance(state, balls, loads, setup, ballInertia, dt);
        steps++;
        const now = steps * dt;
        const turfMoving = trackTurf(balls, setup, track, now, events);
        if (!grounded && headLowestPoint(state, head) < 0) {
            grounded = true;
            events.push({ kind: "impact-mallet-grounded", t: now });
        }
        options.probe?.step({ t: now, drive, head: state, balls: [...balls], contacts: samples });

        quiet = hardClosed ? 0 : quiet + 1;
        if (struck && now >= driveEnd && quiet >= RELEASE_STEPS && !turfMoving) {
            break;
        }
        if (now >= cap) {
            events.push({ kind: "impact-cap", t: now });
            break;
        }
    }

    return finish(setup, state, balls, pairs, events, steps, steps * dt);
}
