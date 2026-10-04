/**
 * Data types of the impact phase (P2b.1 design §3). The impact takes a ContactState (the mallet head and its face,
 * its state at t = 0, and the drive the hands apply) and the balls at rest, and returns each ball's state for phase 2.
 */
import type { Vec3 } from "../math/vec3";
import type { BallId, BallStates } from "../types";
import type { Quaternion } from "./rigidBody";

/** The mallet head: a solid cylinder whose axis is the body x axis; the two end discs are its faces. */
export interface MalletHead {
    readonly mass: number;
    /** Principal moments about the centre of mass, body frame (axis, and the two transverse axes). */
    readonly inertia: Vec3;
    readonly length: number;
    readonly radius: number;
    /** Where the shaft meets the head, body frame. The drive force acts here. */
    readonly socket: Vec3;
}

/** A face's restitution and Coulomb friction against a ball, and the duration (s) of a central strike. */
export interface FaceMaterial {
    readonly restitution: number;
    readonly friction: number;
    readonly contactTime: number;
}

/** Applied force at time t (s from the start of the impact), world frame. Linear between samples. */
export interface DriveSample {
    readonly t: number;
    readonly force: Vec3;
}

/** The head's centre of mass, orientation (unit quaternion body → world) and velocities, all world frame. */
export interface HeadState {
    readonly position: Vec3;
    readonly orientation: Quaternion;
    readonly velocity: Vec3;
    readonly angularVelocity: Vec3;
}

/**
 * What the swing delivers to the impact: the head and its face, its state at t = 0, and the drive. The drive is the
 * total force the hands apply to the head, excluding gravity, so it carries the head's weight. Samples are in strictly
 * increasing t, the first at t = 0, the last ending the drive window; the force is zero after it.
 */
export interface ContactState extends HeadState {
    readonly head: MalletHead;
    readonly face: FaceMaterial;
    readonly drive: readonly DriveSample[];
}

/**
 * Something that happened during the impact; t is seconds from its start. `turf-lift`: a ball's centre first rose to
 * z = R from below. The others mark a result outside the validated model, as phase 2's jump flag does:
 * - `impact-cap`: the impact reached IMPACT_CAP;
 * - `impact-head-approaching`: when it ended the head was still closing on a ball within reach (a second strike, a
 *   double tap, is a fault and is not modelled);
 * - `impact-mallet-grounded`: part of the head went below the turf plane (mallet–turf contact is not modelled);
 * - `impact-off-face`: a ball reached the rim of a face rather than the face (edge strokes are not modelled).
 */
export type ImpactEvent =
    | { readonly kind: "turf-lift"; readonly t: number; readonly ball: BallId }
    | { readonly kind: "impact-cap"; readonly t: number }
    | { readonly kind: "impact-head-approaching"; readonly t: number; readonly ball: BallId }
    | { readonly kind: "impact-mallet-grounded"; readonly t: number }
    | { readonly kind: "impact-off-face"; readonly t: number; readonly ball: BallId };

/**
 * One contact interval of a pair (P2b.2a design §5): [start, end) in s from the impact's start, whole steps, and the
 * largest normal force (N) in it (0 at a face's rim, or for a pair overlapping but released). For a face–ball pair,
 * `clearanceAfter` (m) is the largest separation from the face in the gap before the next interval.
 */
export interface ContactInterval {
    readonly start: number;
    readonly end: number;
    readonly peakForce: number;
    readonly clearanceAfter?: number;
}

/** What the integrator returns: the bodies at the end of the impact and what happened on the way. */
export interface ImpactRun {
    readonly balls: BallStates;
    readonly head: HeadState;
    readonly duration: number;
    readonly events: readonly ImpactEvent[];
    /**
     * Deepest penetration (m) of every pair that closed, keyed "face/<ball>", "<ball>/<ball>", "turf/<ball>" or
     * "<ball>@<obstacle id>".
     */
    readonly peakPenetration: Readonly<Record<string, number>>;
    readonly steps: number;
    /**
     * Contact intervals of every pair that was in contact, keyed as `peakPenetration` is, plus "<ball>@<obstacle id>".
     * In contact means closed, or a face–ball pair at the rim (the Laws count any part of the mallet).
     */
    readonly timeline: Readonly<Record<string, readonly ContactInterval[]>>;
    /** Keys of the ball–ball and ball–obstacle pairs touching (within CONTACT_TOLERANCE) at t = 0, in pair order. */
    readonly touchingAtStart: readonly string[];
}

/** The impact's outcome, with the balls as handed over to phase 2 (design §6). */
export interface ImpactResult extends ImpactRun {
    readonly handover: BallStates;
    /** Largest overlap (m) the handover removed from a pair of balls. */
    readonly overlapCorrection: number;
}
