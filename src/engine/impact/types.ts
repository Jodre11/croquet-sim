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

/**
 * A face's law against a ball (P2b.2b.2b.2a design §3.6): the pair's reduced mass (kg) and the face's friction. Each
 * closure sets the Hertzian k and c from it with the wood fits (contactLaw.ts closeFace).
 */
export interface FaceLaw {
    readonly mass: number;
    readonly friction: number;
}

/**
 * The turf bed's law under a ball (P2b.2b.2b.2a design §4): the bed modulus k_w (N/m³), its recovery time τ_r (s;
 * 0, in isolated tests only, makes every cell an undamped spring), the sliding friction µ and the cell's side h (m).
 */
export interface BedLaw {
    readonly modulus: number;
    readonly recovery: number;
    readonly friction: number;
    readonly cell: number;
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
 * The contact-free downswing (P2b.2b.2a design §3), in s from the planned contact: from the release t_r < 0, the
 * pendulum and the hands at rest at the backswing's top, to contact. The hands' path is P(σ) = P_b + Δ_h·σ² +
 * Δ_z·(3σ² − 2σ³), σ from 0 at the top to 1 at contact. Swing mode tabulates θ, ω and α every FREE_STEP from the
 * release, its last sample at contact, with σ = (θ − θ_top)/span; carry mode is closed-form, σ = (t − t_r)/tempo and
 * θ = θ_top + span·σ².
 */
export interface Downswing {
    /** t_r (s from contact, negative). */
    readonly release: number;
    /** θ at the top, and θ_c − θ_top (rad, ≥ 0). */
    readonly thetaTop: number;
    readonly span: number;
    /** The hands at the top P_b, and Δ = P_c − P_b split into its horizontal part Δ_h and vertical part Δ_z (m). */
    readonly handsTop: Vec3;
    readonly across: Vec3;
    readonly drop: Vec3;
    /** Carry mode's hands' tempo T_h (s), with release = −tempo; null in swing mode. */
    readonly tempo: number | null;
    /** Swing mode's table (rad, rad/s, rad/s²); empty in carry mode. */
    readonly theta: readonly number[];
    readonly omega: readonly number[];
    readonly alpha: readonly number[];
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
    /**
     * The downswing before contactAt (P2b.2b.2a design §3.5): before each window begins, and before contactAt, the
     * pendulum and the hands follow it. Absent, the path coasts at ω₀ and V₀ (P2b.2b.1). The table's end state must
     * equal the arc's contact state: θ at t = 0 equals theta0 + omega0·contactAt and ω equals omega0, and the hands
     * at contact equal pivot + pivotVelocity·contactAt with velocity pivotVelocity (`planStroke` builds it so); a
     * hand-built arc that breaks this has a velocity jump at contact.
     */
    readonly downswing?: Downswing;
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
 * - `impact-cap`: the impact reached its cap (IMPACT_CAP, or TRACK_IMPACT_CAP for a tracked drive);
 * - `impact-head-approaching`: when it ended the head was still closing on a ball within reach (a force table's
 *   second strike, a double tap, is a fault and is not modelled; a tracked drive integrates it and so raises this only
 *   at the cap);
 * - `impact-mallet-grounded`: part of the head went below the turf plane with no head–turf pair (a force table:
 *   mallet–turf contact is not modelled);
 * - `impact-head-deep`: the head went more than HEAD_DEEP_LIMIT below the turf plane, where the head–turf pair is not
 *   credible (P2b.2b.1 design §4.2);
 * - `impact-off-face`: a ball touched the head off its face: a force table's face rim (edge strokes are not
 *   modelled), or any region but the face for a tracked drive (P2b.2b.1 design §4.5; no Law judgement is made of it
 *   in this phase).
 */
export type ImpactEvent =
    | { readonly kind: "turf-lift"; readonly t: number; readonly ball: BallId }
    | { readonly kind: "impact-cap"; readonly t: number }
    | { readonly kind: "impact-head-approaching"; readonly t: number; readonly ball: BallId }
    | { readonly kind: "impact-mallet-grounded"; readonly t: number }
    | { readonly kind: "impact-head-deep"; readonly t: number }
    | { readonly kind: "impact-off-face"; readonly t: number; readonly ball: BallId };

/**
 * One contact interval of a pair (P2b.2a design §5): [start, end) in s from the impact's start, whole steps, and the
 * largest normal force (N) in it (0 at a force table's face rim, or for a pair overlapping but released). For a
 * face–ball pair, `clearanceAfter` (m) is the largest separation from the face in the gap before the next interval.
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
     * Deepest penetration (m) of every pair that closed, keyed "face/<ball>", "<ball>/<ball>", "turf/<ball>",
     * "<ball>@<obstacle id>" or "head/turf".
     */
    readonly peakPenetration: Readonly<Record<string, number>>;
    readonly steps: number;
    /**
     * Contact intervals of every pair that was in contact, keyed as `peakPenetration` is, plus "<ball>@<obstacle id>".
     * In contact means closed, or a force table's face–ball pair at the rim (the Laws count any part of the mallet); a
     * tracked drive's face–ball pair covers the whole head (P2b.2b.1 design §4.5).
     */
    readonly timeline: Readonly<Record<string, readonly ContactInterval[]>>;
    /** Keys of the ball–ball and ball–obstacle pairs touching (within CONTACT_TOLERANCE) at t = 0, in pair order. */
    readonly touchingAtStart: readonly string[];
    /**
     * A tracked drive's bottom hand opening by reach (P2b.2b.1 design §3.3): when (s), and the shaft's turn since
     * relaxAt (contact) then (rad). Absent if it never opened, and for a force table.
     */
    readonly release?: { readonly t: number; readonly deltaTheta: number };
    /**
     * Slip distance (m) at the head's contact point with the turf (P2b.2b.1 design §4.3): |horizontal velocity of the
     * head's material at its lowest point|·dt, summed per step while δ > 0; absent when the pair never closed.
     */
    readonly headTurfSlide?: number;
    /**
     * A tracked drive's head–ball intervals per region of the head (P2b.2b.1 design §4.5), keyed
     * "face/<ball>#<region>", each with the pair's normal force; empty when no ball was touched. Absent for a force
     * table.
     */
    readonly headRegions?: Readonly<Record<string, readonly ContactInterval[]>>;
    /**
     * A tracked drive's re-entry guard (P2b.2b.1 design §4.5): how many face–ball and head–turf intervals began deeper
     * than one step's closing could make (|v_n|·dt + ENTRY_SLACK), the worst excess (m) and their keys,
     * "face/<ball>#<region>@<t>" or "head/turf@<t>" (t the step's start, s); count 0 when none did. Absent for a force
     * table.
     */
    readonly entryJumps?: { readonly count: number; readonly worst: number; readonly keys: readonly string[] };
}

/** The impact's outcome, with the balls as handed over to phase 2 (design §6). */
export interface ImpactResult extends ImpactRun {
    readonly handover: BallStates;
    /** Largest overlap (m) the handover removed from a pair of balls or a ball and an obstacle. */
    readonly overlapCorrection: number;
}
