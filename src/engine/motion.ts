/**
 * Closed-form motion of a single ball on flat turf within one motion phase.
 *
 * Contact with the turf is at −R·ẑ from the centre, so the contact point's slip velocity is
 * u = v + ω × (−R·ẑ) = (vx − R·ωy, vy + R·ωx). While sliding, friction −μs·m·g·û acts with û constant; the torque
 * it applies changes ω by (−5a·ûy/2R, 5a·ûx/2R, 0) per second (a = μs·g), which makes the slip decay at (7/2)·a.
 * While rolling, the ball decelerates uniformly along its direction of travel with spin locked to velocity.
 * Spin about the vertical axis (ωz) has no effect on the path and is carried unchanged until the ball stops.
 */
import { ZERO, add, horizontal, length, normalize, scale, sub, vec3, type Vec3 } from "./math/vec3";
import type { BallState, MotionParams, MotionPhase } from "./types";

/** Speeds (m/s) at or below this are treated as zero. */
export const SPEED_EPSILON = 1e-9;

/** Returns the horizontal slip velocity of the ball's contact point with the turf. */
export function contactSlip(s: BallState, radius: number): Vec3 {
    const v = s.velocity;
    const w = s.angularVelocity;
    return vec3(v.x - radius * w.y, v.y + radius * w.x, 0);
}

/** Returns the angular velocity of a ball rolling without slip at the given velocity, keeping spin about z. */
export function rollingSpin(velocity: Vec3, spinZ: number, radius: number): Vec3 {
    return vec3(-velocity.y / radius, velocity.x / radius, spinZ);
}

/** Returns a ball at rest at the given centre position. */
export function atRest(position: Vec3): BallState {
    return { position, velocity: ZERO, angularVelocity: ZERO };
}

/** Determines the motion phase of a ball from its state. */
export function classify(s: BallState, radius: number): MotionPhase {
    if (length(contactSlip(s, radius)) > SPEED_EPSILON) {
        return "sliding";
    }
    if (length(horizontal(s.velocity)) > SPEED_EPSILON) {
        return "rolling";
    }
    return "stationary";
}

/** Returns how long the ball stays in the given phase (Infinity when stationary). */
export function phaseDuration(s: BallState, phase: MotionPhase, p: MotionParams): number {
    switch (phase) {
        case "sliding":
            return (2 * length(contactSlip(s, p.radius))) / (7 * p.slidingDecel);
        case "rolling":
            return length(horizontal(s.velocity)) / p.rollingDecel;
        case "stationary":
            return Infinity;
    }
}

/** Centre trajectory within a phase: position(t) = c0 + c1·t + c2·t². */
export interface Trajectory {
    readonly c0: Vec3;
    readonly c1: Vec3;
    readonly c2: Vec3;
}

/** Returns the polynomial centre trajectory of the ball for the rest of the given phase. */
export function trajectory(s: BallState, phase: MotionPhase, p: MotionParams): Trajectory {
    const v = horizontal(s.velocity);
    switch (phase) {
        case "sliding":
            return { c0: s.position, c1: v, c2: scale(normalize(contactSlip(s, p.radius)), -0.5 * p.slidingDecel) };
        case "rolling":
            return { c0: s.position, c1: v, c2: scale(normalize(v), -0.5 * p.rollingDecel) };
        case "stationary":
            return { c0: s.position, c1: ZERO, c2: ZERO };
    }
}

/** Returns the state after time t (0 ≤ t ≤ phaseDuration) in the given phase. */
export function advance(s: BallState, phase: MotionPhase, p: MotionParams, t: number): BallState {
    if (phase === "stationary" || t === 0) {
        return s;
    }
    const v = horizontal(s.velocity);
    if (phase === "sliding") {
        const u = normalize(contactSlip(s, p.radius));
        const a = p.slidingDecel;
        const k = (5 * a * t) / (2 * p.radius);
        return {
            position: add(add(s.position, scale(v, t)), scale(u, -0.5 * a * t * t)),
            velocity: sub(v, scale(u, a * t)),
            angularVelocity: vec3(s.angularVelocity.x - k * u.y, s.angularVelocity.y + k * u.x, s.angularVelocity.z),
        };
    }
    const d = normalize(v);
    const a = p.rollingDecel;
    const velocity = sub(v, scale(d, a * t));
    return {
        position: add(add(s.position, scale(v, t)), scale(d, -0.5 * a * t * t)),
        velocity,
        angularVelocity: rollingSpin(velocity, s.angularVelocity.z, p.radius),
    };
}

/**
 * Returns the state at the exact end of the phase, snapped onto the next phase: at the end of sliding, spin is
 * locked to velocity (removing rounding residue in the slip); at the end of rolling, the ball is at rest.
 */
export function endOfPhase(s: BallState, phase: MotionPhase, p: MotionParams): BallState {
    if (phase === "stationary") {
        return s;
    }
    const end = advance(s, phase, p, phaseDuration(s, phase, p));
    if (phase === "rolling") {
        return atRest(end.position);
    }
    return { ...end, angularVelocity: rollingSpin(end.velocity, end.angularVelocity.z, p.radius) };
}
