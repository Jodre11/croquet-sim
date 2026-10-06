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

/**
 * How the hands carry the mallet after contact (P2b.2b.1 design §3.3): a swing (single-ball, drive, stops) or a carry
 * (rolls).
 */
export type StrokeMode = "swing" | "carry";

/** The hands' dip (design §3.2): the pivot lowers by `depth` (m) over `duration` (s) from `start`, rest to rest. */
export interface Dip {
    /** When it begins, s from t = 0. */
    readonly start: number;
    readonly duration: number;
    readonly depth: number;
}

/**
 * The path the hands drive the mallet along (design §3.1), as two arcs: the pendulum, the mallet swinging about the
 * top hand (the pivot) in a vertical plane; and the hands' path through space, the pivot moving in that plane (leaning,
 * pushing forward, the body's weight) and dipping. Each runs at its initial rate until its window and changes rate
 * constantly through it; what follows depends on the mode (design §3.2). The dip lowers the pivot on top.
 */
export interface SwingArc {
    /** The top hand at t = 0, world frame. */
    readonly pivot: Vec3;
    /** Until the hands' window, in the swing plane (no component along the pitch axis aim × ẑ). */
    readonly pivotVelocity: Vec3;
    /** During the hands' window, in the swing plane. */
    readonly pivotAcceleration: Vec3;
    /** When the hands' window begins (s from t = 0), and its length (s). */
    readonly handStart: number;
    readonly handWindow: number;
    /** Unit, horizontal: the swing plane's forward direction. */
    readonly aim: Vec3;
    /** The top grip from the socket along the shaft (m): the stance's `top`. */
    readonly radius: number;
    /** Arc angle at t = 0 (rad), from the lowest point, positive forward. */
    readonly theta0: number;
    /** The pendulum's rate until its window (rad/s), and its acceleration during it (rad/s²). */
    readonly omega0: number;
    readonly alpha: number;
    /** When the pendulum's window begins (s from t = 0), and its length (s). */
    readonly arcStart: number;
    readonly window: number;
    readonly dip: Dip;
    /** The planned contact (s from t = 0), from which the cap and the reach count. */
    readonly contactAt: number;
    readonly mode: StrokeMode;
    /** How far the hands' path travels along aim after contactAt (m). */
    readonly handReach: number;
    /** Carry only: the head's lowest point ends this far below the turf (m). */
    readonly groundDepth: number;
}

/**
 * The hands' coupling (design §3.3): the natural period (s) and damping ratio of a firm grip; the grips relax at
 * `relaxAt` (s from t = 0) and are firm before it.
 */
export interface Coupling {
    readonly period: number;
    readonly dampingRatio: number;
    readonly relaxAt: number;
}

/**
 * Two hands on the rigid, massless shaft, which is the head's up axis through the socket (design §3.1): the top hand at
 * the arc radius, the bottom hand `bottom` from the socket (m, in (0, radius)). From `relaxAt` on the top hand grips
 * with γ_T = `gripTension` and the bottom hand with g_B = `bottomGrip`, both in (0, 1]. The player's arm mass
 * `armMass` (kg) rides rigidly at the top grip. The bottom hand opens once the shaft has turned through `reachSlack`
 * (m of hand travel). `guideEffort` (in [0, 1]) scales the bottom hand's push after contact in swing mode (the rate
 * guide outside a check, and the push after the release): 1 restores the planned arc's speed, 0 is no extra push; a
 * check's guide acts in full (design §3.3; the player's choice, user's account, 2026-10-06).
 */
export interface Hands {
    readonly bottom: number;
    readonly gripTension: number;
    readonly bottomGrip: number;
    readonly armMass: number;
    readonly reachSlack: number;
    readonly guideEffort: number;
}

/** A tracked drive (design §3): two hands drive the mallet along `arc`, holding it through `coupling`. */
export interface TrackDrive {
    readonly kind: "track";
    readonly arc: SwingArc;
    readonly coupling: Coupling;
    readonly hands: Hands;
}

/** The head's centre of mass, orientation (unit quaternion body → world) and velocities, all world frame. */
export interface HeadState {
    readonly position: Vec3;
    readonly orientation: Quaternion;
    readonly velocity: Vec3;
    readonly angularVelocity: Vec3;
}

/**
 * A force-table drive: the total force the hands apply to the head at the socket, excluding gravity, so it carries the
 * head's weight. Samples are in strictly increasing t, the first at t = 0, the last ending the drive window; the force
 * is zero after it.
 */
export interface ForceDrive {
    readonly kind: "force";
    readonly samples: readonly DriveSample[];
}

/** What the hands do to the head during the impact (P2b.2b.1 design §3.1): a force table, or a tracked drive. */
export type Drive = ForceDrive | TrackDrive;

/** What the swing delivers to the impact: the head and its face, its state at t = 0, and the drive. */
export interface ContactState extends HeadState {
    readonly head: MalletHead;
    readonly face: FaceMaterial;
    readonly drive: Drive;
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
    /**
     * A tracked drive's bottom hand opening by reach (P2b.2b.1 design §3.3): when (s), and the shaft's turn since
     * relaxAt (contact) then (rad). Absent if it never opened, and for a force table.
     */
    readonly release?: { readonly t: number; readonly deltaTheta: number };
}

/** The impact's outcome, with the balls as handed over to phase 2 (design §6). */
export interface ImpactResult extends ImpactRun {
    readonly handover: BallStates;
    /** Largest overlap (m) the handover removed from a pair of balls or a ball and an obstacle. */
    readonly overlapCorrection: number;
}
