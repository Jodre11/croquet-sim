/**
 * Closed-form motion of a single ball within one motion phase: on flat turf, or in flight.
 *
 * Contact with the turf is at −R·ẑ from the centre, so the contact point's slip velocity is
 * u = v + ω × (−R·ẑ) = (vx − R·ωy, vy + R·ωx). While sliding, friction −μs·m·g·û acts with û constant; the torque
 * it applies changes ω by (−5a·ûy/2R, 5a·ûx/2R, 0) per second (a = μs·g), which makes the slip decay at (7/2)·a.
 * While rolling, the ball decelerates uniformly along its direction of travel with spin locked to velocity.
 * Spin about the vertical axis (ωz) has no effect on the path and is carried unchanged until the ball stops.
 * While airborne, the ball falls freely under gravity with its spin unchanged (air drag is neglected) until its
 * centre comes back down to z = R, where it lands.
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

/** True when the ball is on the turf: its centre exactly one radius up and not moving vertically. */
export function onTurf(s: BallState, radius: number): boolean {
    return s.position.z === radius && s.velocity.z === 0;
}

/** Determines the motion phase of a ball from its state. */
export function classify(s: BallState, radius: number): MotionPhase {
    if (!onTurf(s, radius)) {
        return "airborne";
    }
    if (length(contactSlip(s, radius)) > SPEED_EPSILON) {
        return "sliding";
    }
    if (length(horizontal(s.velocity)) > SPEED_EPSILON) {
        return "rolling";
    }
    return "stationary";
}

/**
 * Returns the earliest t ≥ 0 at which height + rise·t + ½·fall·t² comes down to zero, or Infinity if it never does.
 * A height rounded below zero counts as zero. Each root is computed in the form that does not cancel.
 */
export function landingTime(height: number, rise: number, fall: number): number {
    // advance() can round a centre a hair below z = R; a negative height would make the discriminant negative.
    const h = Math.max(height, 0);
    // A ball on the plane comes down at once unless it rises, or is at rest with an upward acceleration (a turf ball a
    // push lifts off, spec §5), which never comes down within the segment.
    if (h === 0 && (rise < 0 || (rise === 0 && fall <= 0))) {
        return 0;
    }
    if (fall === 0) {
        return rise < 0 ? h / (0 - rise) : Infinity;
    }
    const discriminant = rise * rise - 2 * fall * h;
    if (fall > 0) {
        // Decelerating descent: it reaches the turf only if it is falling fast enough.
        return rise < 0 && discriminant >= 0 ? (2 * h) / (Math.sqrt(discriminant) - rise) : Infinity;
    }
    const d = Math.sqrt(discriminant);
    return rise >= 0 ? (rise + d) / (0 - fall) : (2 * h) / (d - rise);
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
        case "airborne":
            return landingTime(s.position.z - p.radius, s.velocity.z, 0 - p.gravity);
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
        case "airborne":
            return { c0: s.position, c1: s.velocity, c2: vec3(0, 0, -0.5 * p.gravity) };
    }
}

/** Returns the state after time t (0 ≤ t ≤ phaseDuration) in the given phase. */
export function advance(s: BallState, phase: MotionPhase, p: MotionParams, t: number): BallState {
    if (phase === "stationary" || t === 0) {
        return s;
    }
    if (phase === "airborne") {
        return {
            position: add(add(s.position, scale(s.velocity, t)), vec3(0, 0, -0.5 * p.gravity * t * t)),
            velocity: add(s.velocity, vec3(0, 0, 0 - p.gravity * t)),
            angularVelocity: s.angularVelocity,
        };
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
 * locked to velocity (removing rounding residue in the slip); at the end of rolling, the ball is at rest; at the end of
 * flight, the centre is placed exactly one radius up, still moving down (the landing impulse is applied by the caller).
 */
export function endOfPhase(s: BallState, phase: MotionPhase, p: MotionParams): BallState {
    if (phase === "stationary") {
        return s;
    }
    const end = advance(s, phase, p, phaseDuration(s, phase, p));
    if (phase === "rolling") {
        return atRest(end.position);
    }
    if (phase === "airborne") {
        return { ...end, position: vec3(end.position.x, end.position.y, p.radius) };
    }
    return { ...end, angularVelocity: rollingSpin(end.velocity, end.angularVelocity.z, p.radius) };
}
