/**
 * Data types of the impact phase (P2b.1 design §3). The impact takes a ContactState (the mallet head and its face,
 * its state at t = 0, and the drive the hands apply) and the balls at rest, and returns each ball's state for phase 2.
 */
import type { Vec3 } from "../math/vec3";
import type { BallId, BallStates } from "../types";
import type { Quaternion } from "./rigidBody";
import type { HeadShape } from "./shape";

/**
 * The shaft (P2b.2b.2b.2c design §4.2): a thin uniform rod of `mass` (kg, ≥ 0) and `length` (m) from the socket up
 * body z, rigid on the head. Its moment about its own axis is taken as 0.
 */
export interface Shaft {
    readonly mass: number;
    readonly length: number;
}

/**
 * The mallet head: a solid of section `shape` along the body x axis, `length` long; its two ends are its faces
 * (P2b.2b.2b.2c design §3.1).
 */
export interface MalletHead {
    readonly mass: number;
    /** Principal moments about the centre of mass, body frame (axis, and the two transverse axes). */
    readonly inertia: Vec3;
    readonly length: number;
    readonly shape: HeadShape;
    /** Where the shaft meets the head, body frame: (0, 0, faceHalfHeight). The drive force acts here. */
    readonly socket: Vec3;
    readonly shaft: Shaft;
}

/**
 * A face's Coulomb friction against a ball. Its restitution and contact duration are the wood fits (contact.json;
 * P2b.2b.2b.2a design §3.6), the only face with measured data: other faces are P3's.
 */
export interface FaceMaterial {
    readonly friction: number;
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

/**
 * The head–turf law (P2b.2b.2b.3 design §4): the turf bed's modulus k_w (N/m³) and recovery τ_r (s) under the head,
 * the turf's bearing yield p_y (Pa), the root mat's strength c (Pa), Reece's cohesion factor N_c, the sole's friction
 * µ, and the column's side h (m), the bed's own lattice.
 */
export interface HeadTurfLaw {
    readonly modulus: number;
    readonly recovery: number;
    readonly yieldPressure: number;
    readonly matStrength: number;
    readonly ploughFactor: number;
    readonly friction: number;
    readonly cell: number;
}

/** Applied force at time t (s from the start of the impact), world frame. Linear between samples. */
export interface DriveSample {
    readonly t: number;
    readonly force: Vec3;
}

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
 * Δ_z·(3σ² − 2σ³) + T·(σ³ − σ²), σ from 0 at the top to 1 at contact. The planned slope (P2b.2b.2c.3a design §4.1)
 * takes one of two representations:
 * - a table of θ, ω and α every FREE_STEP from the release, its last sample at contact (`tempo` null). The free
 *   swing's (λ = 0) leads the hands by the slope, σ = (θ − θ_top)/span; a blend's (0 < λ < 1) carries the hands'
 *   own progress in `handsProgress`;
 * - the closed form of the held slope (λ = 1, `tempo` given): σ = (t − t_r)/tempo and θ = θ_top + span·σ².
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
    /**
     * The Hermite end term T (m, vertical; P2b.2b.2b.2b design §4.1): the hands' path gains T·(σ³ − σ²), so its slope
     * at contact is 2·Δ_h + T and it arrives on the hands' arc. Zero where the hands arrive level; a table adds the
     * term only where it is non-zero.
     */
    readonly tangent: Vec3;
    /** The held slope's hands' tempo T_h (s), with release = −tempo; null for a table. */
    readonly tempo: number | null;
    /** The table (rad, rad/s, rad/s²); empty for the closed form. */
    readonly theta: readonly number[];
    readonly omega: readonly number[];
    readonly alpha: readonly number[];
    /**
     * A blended plan's hands (P2b.2b.2c.3a design §4.1, refined at Task 3): their progress σ_h = (1 − λ)·σ_f + λ·u at
     * each of the table's samples, with its rate (1/s) and acceleration (1/s²), so that the hands, like the slope,
     * run continuously between the free swing's lead and the held slope's tempo. Absent on the free swing's table.
     */
    readonly handsProgress?: {
        readonly sigma: readonly number[];
        readonly rate: readonly number[];
        readonly accel: readonly number[];
    };
}

/**
 * The path the hands drive the mallet along (design §3.1), as two arcs: the pendulum, the mallet swinging about the
 * top hand (the pivot) in a vertical plane; and the hands' path through space, the pivot moving in that plane (leaning,
 * pushing forward, the body's weight) and dipping. Each runs at its initial rate until its window and changes rate
 * through it by its mean rate times the window, as a minimum-jerk pulse, 6·mean·s(1 − s) at s of the window
 * (P2b.2b.2c.2d design §3.1); what follows is the same for every stroke (design §3.2). The dip lowers the pivot on top.
 */
export interface SwingArc {
    /** The top hand at t = 0, world frame. */
    readonly pivot: Vec3;
    /** Until the hands' window, in the swing plane (no component along the pitch axis aim × ẑ). */
    readonly pivotVelocity: Vec3;
    /**
     * The hands' pulse's mean acceleration over their window, Δv/T, in the swing plane: delivered as a minimum-jerk
     * profile, zero at the window's ends and 1.5 times this at its middle.
     */
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
    /**
     * The pendulum's rate until its window (rad/s), and its pulse's mean acceleration over the window, Δω/T (rad/s²):
     * delivered as a minimum-jerk profile, zero at the window's ends and 1.5 times this at its middle.
     */
    readonly omega0: number;
    readonly alpha: number;
    /** When the pendulum's window begins (s from t = 0), and its length (s). */
    readonly arcStart: number;
    readonly window: number;
    /** The hold after the pulse (s); absent: `window`. Set when a shot's window differs from the preset's. */
    readonly holdWindow?: number;
    readonly dip: Dip;
    /** The planned contact (s from t = 0), from which the cap and the reach count. */
    readonly contactAt: number;
    /**
     * λ in [0, 1] (P2b.2b.2c.3a design §4.1): how far the hands hold the slope in the pendulum's pulse and after it.
     * The pendulum is the free one at 0, the kinematic pulse and hold at 1, and θ, ω and α blend linearly between.
     */
    readonly slopeHold: number;
    /** How far the hands' path travels along aim after contactAt (m). */
    readonly handReach: number;
    /**
     * With a push, a handReach above 0 (P2b.2b.2b.2b design §4.2; P2b.2b.2c.3a A2 item 8): the pendulum phase starts
     * once the intended path has travelled `pendulumAt` (in [0, 1]) of the push length `handReach`; the bottom hand
     * then pushes with `pendulumEffort` (in [0, 1]) of the hands' pendulumForce until the shaft passes vertical.
     */
    readonly pendulumAt: number;
    readonly pendulumEffort: number;
    /**
     * With a push (design §4.1): the hands' arc, a circle of radius `handArcRadius` (m, above the push length) in the
     * swing plane, lowest `handArcLow` (in [0, 1]) of the push length ahead of the hands at contact.
     */
    readonly handArcRadius: number;
    readonly handArcLow: number;
    /**
     * Where the hands' arc is lowest, s_low (m along aim from the hands at contact; P2b.2b.2c.3a design §3), set from a
     * shot's feet. Within (handReach − handArcRadius, handArcRadius), so the arc is defined over the whole push.
     * Absent: handArcLow·handReach.
     */
    readonly lowPoint?: number;
    /**
     * The downswing before contactAt (P2b.2b.2a design §3.5): before each window begins, and before contactAt, the
     * pendulum and the hands follow it. Absent, the path coasts at ω₀ and V₀ (P2b.2b.1). The table's end state must
     * equal the arc's contact state: θ at t = 0 equals theta0 + omega0·contactAt and ω equals omega0, and the hands
     * at contact equal pivot + pivotVelocity·contactAt with velocity pivotVelocity (`planStroke` builds it so); a
     * hand-built arc that breaks this has a velocity jump at contact.
     */
    readonly downswing?: Downswing;
    /**
     * The hands' advance (P2b.2b.2c.1 design §6), its travel along aim added to the push's over `handReach`
     * (P2b.2b.2c.3a A2 item 8) from `start` (s from t = 0), ramping up to `speed` (m/s), the head's planned speed along
     * aim at contact, at the body's peak acceleration `accel` (m/s², a body property), so over speed/accel. Absent: no
     * advance.
     * `planStroke` validates it (checkAdvance); a hand-built arc's advance is not checked.
     */
    readonly advance?: { readonly start: number; readonly speed: number; readonly accel: number };
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
 * The arm's flex under a hand (P2b.2b.2b.2b design §3.1): its stiffness k = k₀ + κ·|F_ff| rises linearly with the force
 * the hand applies voluntarily, its feed-forward, and its damping holds the damping ratio ζ_arm on the arm's endpoint
 * mass: c = 2·ζ_arm·√(k·m_arm). k₀ (N/m), κ (1/m), ζ_arm and m_arm (kg) are reference/contact.json's arm values; they
 * are the arm's rhythmic impedance. Through the push the arm holds its posture instead, unless `hold` is null (gate
 * round 11 ruling, "Posture holding in the push", 2026-10-12): k = k_hold + κ·|F_ff| and c = c_hold.
 */
export interface FlexLaw {
    readonly stiffness: number;
    readonly stiffnessPerForce: number;
    readonly dampingRatio: number;
    readonly endpointMass: number;
    readonly hold: FlexHold | null;
}

/** The arm's posture-holding impedance through the push: k_hold (N/m) and c_hold (N·s/m), both positive. */
export interface FlexHold {
    readonly stiffness: number;
    readonly damping: number;
}

/** A hand on the shaft (P2b.2b.2b.3 design §5). */
export type HandName = "top" | "bottom";

/**
 * Two hands on the rigid, massless shaft, which is the head's up axis through the socket (design §3.1): the top hand at
 * the arc radius, the bottom hand `bottom` from the socket (m, in (0, radius)). From `relaxAt` on the top hand grips
 * with γ_T = `gripTension` and the bottom hand with g_B = `bottomGrip`, both in (0, 1]. The player's arm mass
 * `armMass` (kg) rides rigidly at the top grip in the downswing's plan; after contact each hand's and arm's own chain
 * of masses (`chain`; gate round 3 ruling) holds the mallet. The bottom hand opens at the earlier of the shaft turned
 * forward through `reachSlack` (m of hand travel) and a push's pendulum phase (P2b.2b.2c.3a A2 item 6). From contact
 * each hand flexes by `flex`, its feed and flex scaled by its grip; `guideEffort` (in [0, 1]) scales the bottom
 * hand's flex outside a check: 1 holds the planned arc, 0 leaves that hand its feed alone; a check brakes in full
 * (design §3.3; the player's choice, user's account, 2026-10-06; A2 item 5). The hands' push intent through a push
 * follows the balls' resistance with time constant `pushResponseTime` up to `pushForce`, and the bottom hand's push
 * once open is at most `pendulumForce` (P2b.2b.2b.2b design §3, §4.2; gate ruling 2026-10-11).
 */
export interface Hands {
    readonly bottom: number;
    readonly gripTension: number;
    readonly bottomGrip: number;
    readonly armMass: number;
    readonly reachSlack: number;
    readonly guideEffort: number;
    /** From contact (P2b.2b.2b.2b design §3.1): each hand's flex. */
    readonly flex: FlexLaw;
    /**
     * F_pendulum (N, design §4.2): the largest forward push the bottom hand gives perpendicular to the shaft in the
     * pendulum phase, by wrist and forearm.
     */
    readonly pendulumForce: number;
    /**
     * F_push (N): the push intent's cap (gate ruling 2026-10-11). Through the push the hands push along aim
     * with the balls' resistance as they sense it, up to this.
     */
    readonly pushForce: number;
    /**
     * τ_push (s): the time constant at which the hands' sensed resistance follows the balls' (gate ruling amendment,
     * 2026-10-11): the muscles' voluntary force rise.
     */
    readonly pushResponseTime: number;
    /** From contact (gate round 3 ruling, 2026-10-11): each hand and arm, the hand–arm impedance model's chain. */
    readonly chain: HandChain;
    /**
     * F_max (N, P2b.2b.2b.3 design §5): each hand's force on the mallet is clipped to this magnitude. Where the hand
     * holds a position spring its anchor slides at the limit; the slid offset persists through the flex and relaxes
     * on the firm grip under the limit (GripState).
     */
    readonly gripLimit: number;
}

/**
 * One hand and arm as Dong et al. 2013's x_h 5-DOF driving-point model (gate round 3 ruling, 2026-10-11). Masses (kg):
 * the wrist and forearm M0 (`forearmMass`), the palm–hand dorsum M1 (`handMass`), the fingers M2 (`fingerMass`), and
 * the palm and finger skin on the handle M3 and M4 (`palmSkinMass`, `fingerSkinMass`), which move with the grip. Each
 * spring (N/m) and damper (N·s/m) joins two of them: K1, C1 (`wrist`) M0 to M1; K2, C2 (`knuckle`) M1 to M2; K3, C3
 * (`palm`) M1 to the grip; K4, C4 (`finger`) M2 to the grip. The model's K0, C0 from M0 to the body are the arm's own
 * flex here, which drives M0.
 */
export interface HandChain {
    readonly forearmMass: number;
    readonly handMass: number;
    readonly fingerMass: number;
    readonly palmSkinMass: number;
    readonly fingerSkinMass: number;
    readonly wristStiffness: number;
    readonly wristDamping: number;
    readonly knuckleStiffness: number;
    readonly knuckleDamping: number;
    readonly palmStiffness: number;
    readonly palmDamping: number;
    readonly fingerStiffness: number;
    readonly fingerDamping: number;
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
 * Something that happened during the impact; t is seconds from its start. `turf-lift`: a ball that held cells of the
 * bed first held none while rising. The others mark a result outside the validated model, as phase 2's jump flag does:
 * - `impact-cap`: the impact reached its cap (IMPACT_CAP, or TRACK_IMPACT_CAP for a tracked drive);
 * - `impact-head-approaching`: when it ended the head was still closing on a ball within reach (a force table's
 *   second strike, a double tap, is a fault and is not modelled; a tracked drive integrates it and so raises this only
 *   at the cap);
 * - `impact-mallet-grounded`: part of the head went below the turf plane with no head–turf pair (a force table:
 *   mallet–turf contact is not modelled);
 * - `impact-head-deep`: the head's lowest point went more than HEAD_DEEP_LIMIT below the turf plane: a stroke gone
 *   beyond a graze that has probably damaged the lawn (P2b.2b.2b.3 design §4.4), not a limit of the model;
 * - `impact-off-face`: a ball touched the head off its face: a force table's face rim (edge strokes are not
 *   modelled), or any region but the face for a tracked drive (P2b.2b.1 design §4.5; no Law judgement is made of it
 *   in this phase);
 * - `impact-turf-pit`: when the impact ended, a ball's surface lay more than TURF_PIT_DEPTH below the turf over a
 *   cell it held (P2b.2b.2b.2a design §4.6); the handover places it on the flat lawn, and the pit is discarded;
 * - `grip-limit`: a hand's force first reached its grip's limit (P2b.2b.2b.3 design §5), with the hand; recorded, not
 *   judged;
 * - `turf-yield`: a column of the head's turf first yielded (P2b.2b.2b.3 design §4.2); recorded, not judged;
 * - `impact-head-stopped`: the head came to rest in the turf before any face contact (P2b.2b.2b.3 design §4.6): the
 *   impact ends there and hands the balls over as they lie;
 * - `impact-no-strike`: a tracked drive's impact reached its cap with no face–ball contact on any ball, as when a brake
 *   begun well before contact stops the head short of the ball (P2b.2b.2c.2d design §4.1); it follows `impact-cap`,
 *   and the balls are handed over as they lie.
 */
export type ImpactEvent =
    | { readonly kind: "turf-lift"; readonly t: number; readonly ball: BallId }
    | { readonly kind: "impact-cap"; readonly t: number }
    | { readonly kind: "impact-head-approaching"; readonly t: number; readonly ball: BallId }
    | { readonly kind: "impact-mallet-grounded"; readonly t: number }
    | { readonly kind: "impact-head-deep"; readonly t: number }
    | { readonly kind: "impact-off-face"; readonly t: number; readonly ball: BallId }
    | { readonly kind: "impact-turf-pit"; readonly t: number; readonly ball: BallId }
    | { readonly kind: "grip-limit"; readonly t: number; readonly hand: HandName }
    | { readonly kind: "turf-yield"; readonly t: number }
    | { readonly kind: "impact-head-stopped"; readonly t: number }
    | { readonly kind: "impact-no-strike"; readonly t: number };

/**
 * One contact interval of a pair (P2b.2a design §5): [start, end) in s from the impact's start, whole steps, and the
 * largest normal force (N) in it (0 at a force table's face rim, or for a pair overlapping but released). For a
 * face–ball pair, `clearanceAfter` (m) is the largest separation from the face in the gap before the next interval;
 * `impulse` (N·s, world) is the face's impulse on the ball over the interval, a rim step adding none; and `velocities`
 * (m/s, world) are the ball's velocity at the interval's first step and at its end, or at the impact's end for one
 * still open then (P2b.2b.2c.2d design §7). Other pairs' intervals carry neither.
 */
export interface ContactInterval {
    readonly start: number;
    readonly end: number;
    readonly peakForce: number;
    readonly clearanceAfter?: number;
    readonly impulse?: Vec3;
    readonly velocities?: { readonly before: Vec3; readonly after: Vec3 };
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
     * A tracked drive's bottom hand opening (P2b.2b.1 design §3.3): at the earlier of the forward reach and a push's
     * pendulum phase (P2b.2b.2b.2b design §4.2; P2b.2b.2c.3a A2 item 6): when (s), and the shaft's turn since relaxAt
     * (contact) then (rad). Absent if it never opened, and for a force table.
     */
    readonly release?: { readonly t: number; readonly deltaTheta: number };
    /**
     * A push's first departure of a ball from the face (s; gate round 13 ruling, "Relax from first departure",
     * 2026-10-12), from which the arms' hold relaxes. The impact does not know which ball is the striker's, so it is
     * any ball's; in a roll the face meets only the striker's. Absent if no ball left the face, and with no push.
     */
    readonly departure?: number;
    /**
     * Slip distance (m) of the head's material at the head–turf resistance's centre (P2b.2b.2b.3 design §4.3): its
     * horizontal speed there·dt, summed per step while a column bears; absent when the pair never closed.
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
