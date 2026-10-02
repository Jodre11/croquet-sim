/**
 * Core engine data types. Later tasks append World and ShotResult types to this file.
 */
import type { Vec3 } from "./math/vec3";

/** The four balls, identified by colour. */
export type BallId = "blue" | "red" | "black" | "yellow";

/** Canonical ball order. The engine always iterates balls in this order, which keeps results deterministic. */
export const BALL_IDS: readonly BallId[] = ["blue", "red", "black", "yellow"];

/** Motion phase of a ball: on the turf (sliding, rolling, stationary) or in flight (airborne). */
export type MotionPhase = "sliding" | "rolling" | "stationary" | "airborne";

/**
 * Full kinematic state of a ball. Position is the centre. A ball on the turf has position.z = radius and velocity.z = 0
 * exactly; any other state is airborne.
 */
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
    /** Acceleration of gravity (m/s²), which governs flight. */
    readonly gravity: number;
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
    /** Height (m) of the underside of the crown above the lawn. */
    readonly crownClearance: number;
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
    /** Restitution (0–1) of a ball landing on the turf. Turf friction is the surface's sliding coefficient. */
    readonly ballTurfRestitution: number;
    readonly outOfCourt: OffsetRule;
    readonly hoopRunStart: OffsetRule;
    readonly hoopRunComplete: OffsetRule;
    /** Distance (m) beyond the boundary at which a ball is halted; the surround is not modelled. */
    readonly haltMargin: number;
}

/** Initial states of the balls in play; absent balls are omitted. */
export type BallStates = Partial<Record<BallId, BallState>>;

/**
 * One closed-form piece of a ball's motion, valid for t ∈ [t0, t1]. Without `push` the ball moves freely in
 * `phase` (motion.ts); with `push` it moves with the constant accelerations given there.
 */
export interface Segment {
    readonly t0: number;
    readonly t1: number;
    readonly phase: MotionPhase;
    readonly start: BallState;
    readonly params: MotionParams;
    readonly push?: PushMotion;
}

/** Something that happened during a shot. Times are seconds from the start of free motion. */
export type ShotEvent =
    | { readonly kind: "phase"; readonly t: number; readonly ball: BallId; readonly phase: MotionPhase }
    | {
          readonly kind: "ball-ball";
          readonly t: number;
          readonly balls: readonly [BallId, BallId];
          /** True when the contact was slower than RESTING_SPEED and was resolved as resting contact. */
          readonly resting: boolean;
      }
    | {
          readonly kind: "ball-obstacle";
          readonly t: number;
          readonly ball: BallId;
          readonly obstacleId: string;
          readonly resting: boolean;
      }
    | { readonly kind: "halted"; readonly t: number; readonly ball: BallId }
    | { readonly kind: "landing"; readonly t: number; readonly ball: BallId }
    | {
          /**
           * The shot left the validated model: `ball` passed over the ball `over` (its centre came within one radius of
           * the other's, horizontally), or its top reached a hoop crown's underside (`over` is "crown").
           */
          readonly kind: "jump";
          readonly t: number;
          readonly ball: BallId;
          readonly over: BallId | "crown";
      }
    | {
          /**
           * A resting-contact solve fell back to the nearest hold: the group's resting balls were kept at rest
           * although no exact solution was found. `excess` bounds from above how far a held ball's load exceeded its
           * static resistance (weight × m/s²).
           */
          readonly kind: "approximate-hold";
          readonly t: number;
          readonly balls: readonly BallId[];
          readonly excess: number;
      }
    | {
          /** A coupled ball–ball contact stuck (its slip reached zero and static friction now holds it). */
          readonly kind: "stick-ball";
          readonly t: number;
          readonly balls: readonly [BallId, BallId];
      }
    | { readonly kind: "stick-obstacle"; readonly t: number; readonly ball: BallId; readonly obstacleId: string }
    | {
          /**
           * A coupled ball–ball contact started to slip. `direction` is the unit slip of the first ball's contact point
           * relative to the second's, in world coordinates (balls in BALL_IDS order).
           */
          readonly kind: "slip-ball";
          readonly t: number;
          readonly balls: readonly [BallId, BallId];
          readonly direction: Vec3;
      }
    | {
          /** As slip-ball, against an obstacle: the ball's contact point relative to the obstacle. */
          readonly kind: "slip-obstacle";
          readonly t: number;
          readonly ball: BallId;
          readonly obstacleId: string;
          readonly direction: Vec3;
      }
    | {
          /**
           * The slip direction of a contact or turf slip that starts could not be solved; it slips against the static
           * force it carried instead (spec §5 limitations). `excess` is the residual (m/s²) of the failed solve.
           */
          readonly kind: "approximate-slip";
          readonly t: number;
          readonly balls: readonly BallId[];
          readonly excess: number;
      }
    | {
          /**
           * The shot's resting-contact work budget was spent, so the group was held as by approximate-hold (its resting
           * balls kept at rest) without being solved. `balls` are the group's resting balls.
           */
          readonly kind: "budget-hold";
          readonly t: number;
          readonly balls: readonly BallId[];
      }
    | { readonly kind: "out-of-court"; readonly t: number; readonly ball: BallId; readonly position: Vec3 }
    | {
          readonly kind: "hoop-passage";
          readonly t: number;
          readonly ball: BallId;
          readonly hoopId: string;
          readonly direction: 1 | -1;
      };

/** Full outcome of a shot: exact piecewise trajectories, events in time order and rest positions. */
export interface ShotResult {
    readonly engineVersion: string;
    readonly duration: number;
    readonly segments: Partial<Record<BallId, readonly Segment[]>>;
    readonly events: readonly ShotEvent[];
    /** Final positions. When `aborted` is true these are positions where the budget ran out, not rest positions. */
    readonly rest: Partial<Record<BallId, Vec3>>;
    /** True if the event limit was reached before every ball stopped. */
    readonly aborted: boolean;
}
