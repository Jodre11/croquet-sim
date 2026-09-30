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

/** Turf properties at a point. Both are dimensionless coefficients (multiply by g for deceleration). */
export interface SurfaceProps {
    readonly slidingFriction: number;
    readonly rollingResistance: number;
}

/** The court surface. Extent x ∈ [0, width], y ∈ [0, length] (m). */
export interface Lawn {
    readonly width: number;
    readonly length: number;
    /** Surface properties at a position. v1 lawns are uniform; the engine samples this at each segment start. */
    surfaceAt(position: Vec3): SurfaceProps;
}

/** A fixed vertical cylinder: a hoop upright or the peg. */
export interface Cylinder {
    readonly id: string;
    readonly centre: Vec3;
    readonly radius: number;
    readonly material: ContactMaterial;
}

/** A hoop: two uprights either side of `centre` along the hoop plane; `normal` is perpendicular to that plane. */
export interface Hoop {
    readonly id: string;
    readonly centre: Vec3;
    readonly normal: Vec3;
    readonly innerWidth: number;
    readonly uprightRadius: number;
}

/** A signed-offset threshold ballRadii × R + uprightRadii × r (see reference/README.md). */
export interface OffsetRule {
    readonly ballRadii: number;
    readonly uprightRadii: number;
}

/** Everything the free-motion engine needs to know about the environment. */
export interface World {
    readonly gravity: number;
    readonly ball: BallParams;
    readonly lawn: Lawn;
    readonly hoops: readonly Hoop[];
    readonly peg: Cylinder;
    readonly ballBall: ContactMaterial;
    readonly ballUpright: ContactMaterial;
    readonly outOfCourt: OffsetRule;
    readonly hoopRunStart: OffsetRule;
    readonly hoopRunComplete: OffsetRule;
    /** Distance (m) beyond the boundary at which a ball is halted; the surround is not modelled. */
    readonly haltMargin: number;
}
