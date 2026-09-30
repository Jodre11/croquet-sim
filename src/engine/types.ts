/**
 * Core engine data types. Later tasks append World and ShotResult types to this file.
 */
import type { Vec3 } from "./math/vec3";

/** The four balls, identified by colour. */
export type BallId = "blue" | "red" | "black" | "yellow";

/** Canonical ball order. The engine always iterates balls in this order, which keeps results deterministic. */
export const BALL_IDS: readonly BallId[] = ["blue", "red", "black", "yellow"];

/** Motion phase of a ball on the lawn. */
export type MotionPhase = "sliding" | "rolling" | "stationary";

/** Full kinematic state of a ball. Position is the centre; a resting ball has position.z = radius. */
export interface BallState {
    readonly position: Vec3;
    readonly velocity: Vec3;
    readonly angularVelocity: Vec3;
}

/** Mass properties of a ball (uniform solid sphere, I = 2/5·m·r²). */
export interface BallParams {
    readonly radius: number;
    readonly mass: number;
}

/** Parameters governing free motion over one segment. Decelerations are coefficient × g, in m/s². */
export interface MotionParams {
    readonly radius: number;
    readonly slidingDecel: number;
    readonly rollingDecel: number;
}

/** Restitution (0–1) and Coulomb friction coefficient for a pair of contacting materials. */
export interface ContactMaterial {
    readonly restitution: number;
    readonly friction: number;
}

/**
 * Motion of a ball while it pushes, or is pushed by, a body it rests against. Within one segment the centre
 * accelerates uniformly and the spin changes uniformly. `direction` is the unit vector along which the ball's turf
 * force is frozen for the segment: the slip direction when sliding, the direction of travel when rolling, and ZERO
 * when the ball is held at rest.
 */
export interface PushMotion {
    readonly acceleration: Vec3;
    readonly angularAcceleration: Vec3;
    readonly direction: Vec3;
}
