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
import { OFF_FACE, headClosing, headLowestPoint, pairContact, pairList, pointVelocity, type Pair } from "./contacts";
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
    const inTurf = balls.map((s, i) => hasTurf[i] === true && s.position.z < R);
    const lifted = balls.map(() => false);
    const offFace = balls.map(() => false);
    let state: HeadState = setup.start;
    let grounded = false;
    let struck = false;
    let quiet = 0;
    let steps = 0;

    for (;;) {
        const t = steps * dt;
        const drive = driveAt(setup.drive, t);
        let headForce = add(drive, headWeight);
        let headTorque = cross(rotate(state.orientation, head.socket), drive);
        const forces: Vec3[] = balls.map(() => ballWeight);
        const torques: Vec3[] = balls.map(() => ZERO);
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
            const sb = balls[pair.b] as BallState;
            const sa = pair.kind === "ball-ball" ? (balls[pair.a] as BallState) : null;
            // u: velocity of B's material point at the contact relative to A's (the turf's is zero).
            const va =
                pair.kind === "face-ball"
                    ? pointVelocity(state.position, state.velocity, state.angularVelocity, contact.point)
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
            forces[pair.b] = add(forces[pair.b] as Vec3, force);
            torques[pair.b] = add(torques[pair.b] as Vec3, cross(sub(contact.point, sb.position), force));
            if (pair.kind === "face-ball") {
                headForce = sub(headForce, force);
                headTorque = sub(headTorque, cross(sub(contact.point, state.position), force));
            } else if (sa) {
                forces[pair.a] = sub(forces[pair.a] as Vec3, force);
                torques[pair.a] = sub(torques[pair.a] as Vec3, cross(sub(contact.point, sa.position), force));
            }
            if (options.probe) {
                samples.push({
                    key: pair.key,
                    normal: contact.normal,
                    depth: contact.depth,
                    normalForce: normal,
                    tangentialForce: tangential.force,
                    spring: tangential.spring,
                    law: p.law,
                });
            }
        }

        // Velocities from the forces, then positions from the new velocities.
        const velocity = add(state.velocity, scale(headForce, dt / head.mass));
        const bodyOmega = rotateInverse(state.orientation, state.angularVelocity);
        const bodyTorque = rotateInverse(state.orientation, headTorque);
        const spun = add(bodyOmega, scale(angularAcceleration(head.inertia, bodyOmega, bodyTorque), dt));
        const angularVelocity = rotate(state.orientation, spun);
        state = {
            position: add(state.position, scale(velocity, dt)),
            orientation: integrateOrientation(state.orientation, angularVelocity, dt),
            velocity,
            angularVelocity,
        };
        for (let i = 0; i < balls.length; i++) {
            const s = balls[i] as BallState;
            const v = add(s.velocity, scale(forces[i] as Vec3, dt / ball.mass));
            const w = add(s.angularVelocity, scale(torques[i] as Vec3, dt / ballInertia));
            balls[i] = { position: add(s.position, scale(v, dt)), velocity: v, angularVelocity: w };
        }
        steps++;
        const now = steps * dt;

        let turfMoving = false;
        for (let i = 0; i < balls.length; i++) {
            if (!hasTurf[i]) {
                continue;
            }
            const s = balls[i] as BallState;
            const below = s.position.z < R;
            if (inTurf[i] && !below && !lifted[i]) {
                lifted[i] = true;
                events.push({ kind: "turf-lift", t: now, ball: ids[i] as BallId });
            }
            inTurf[i] = below;
            // Vertical oscillation energy about the static sink δ₀ = m·g/k, against the static spring's ½·k·δ₀²: at or
            // above it the ball will still reach δ = 0 and bounce; below it, it only settles in its hollow.
            const k = ((setup.balls[i] as ImpactBall).turf as PairLaw).stiffness;
            const offset = R - s.position.z - (ball.mass * setup.gravity) / k;
            if (
                below &&
                ball.mass * s.velocity.z * s.velocity.z + k * offset * offset >
                    (ball.mass * ball.mass * setup.gravity * setup.gravity) / k
            ) {
                turfMoving = true;
            }
        }
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

    const duration = steps * dt;
    const final: BallStates = {};
    for (let i = 0; i < balls.length; i++) {
        const s = balls[i] as BallState;
        const id = ids[i] as BallId;
        final[id] = s;
        if (headClosing(state, head, s, R)) {
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
