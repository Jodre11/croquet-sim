/**
 * The swing model's inputs (P2b.2b.1 design §5.1): the stroke types, the physical swing profile and a shot's setup.
 * They follow how a player plays a stroke (user's account, 2026-10-05):
 * - the shot type, then the balls;
 * - a stance for that type, and where the two hands sit on the mallet, which sets the head's angle;
 * - where and how to hit the striker's ball;
 * - the rehearsed shape of the swing: the pendulum, the hands' path through space, the dip and the reach;
 * - and, per shot, how the player times each.
 * The product spec's grip style, weighting and face material have no engine reader yet.
 */
import type { HoopTarget } from "../hoopRun";
import type { StrokeMode } from "../impact/types";
import type { BallId, BallStates } from "../types";

/** The strokes the swing model plays. */
export type StrokeType = "single-ball" | "drive" | "stop-ac" | "stop-gc" | "half-roll" | "full-roll" | "pass-roll";

/**
 * The croquet strokes; the rest, the GC stop among them, are single-ball. The GC stop's striker's ball crosses a gap
 * to the target ball (user decision, 2026-10-06; design §5.4).
 */
export const CROQUET_STROKES: readonly StrokeType[] = ["drive", "stop-ac", "half-roll", "full-roll", "pass-roll"];

/** Every stroke type, in the presets' order. */
export const STROKE_TYPES: readonly StrokeType[] = [
    "single-ball",
    "drive",
    "stop-ac",
    "stop-gc",
    "half-roll",
    "full-roll",
    "pass-roll",
];

/**
 * How the player stands to a stroke type and holds the mallet: the shaft's lean at contact (rad, positive pitches the
 * face down; the contact angle is −lean), the top and bottom hands' distances from the socket along the shaft (m,
 * 0 < bottom < top), the top hand's grip tension γ_T and the bottom hand's grip g_B from contact on (in (0, 1]).
 */
export interface SwingStance {
    readonly lean: number;
    readonly top: number;
    readonly bottom: number;
    readonly gripTension: number;
    readonly bottomGrip: number;
}

/**
 * The swing's shape (design §5.2 step 7), its changes measured against the head's speed at contact. The mode (§3.3).
 * The pendulum: over `window` (s) at full `drive` its contribution changes by `speedGain` times that speed. The hands:
 * `handShare` of that speed (in [0, 1]; the pendulum supplies the rest), changing by `handGain` times it over
 * `handWindow` (s) at full `drive`. The dip: whatever `drive`, the hands lower by `handDrop` (m) over `dropTime` (s),
 * rest to rest. The reach: the hands' path travels `handReach` (m) along aim after contact, the default for the shot's
 * own. In carry mode the head's lowest point ends `groundDepth` (m) below the turf. In swing mode the bottom hand's
 * push after contact is `guideEffort` (in [0, 1]) of a full restoration of the arc's speed, the default for the shot's
 * own.
 */
export interface SwingDrive {
    readonly mode: StrokeMode;
    readonly speedGain: number;
    readonly window: number;
    readonly handShare: number;
    readonly handGain: number;
    readonly handWindow: number;
    readonly handDrop: number;
    readonly dropTime: number;
    readonly handReach: number;
    readonly groundDepth: number;
    readonly guideEffort: number;
}

/** The physical part of a player's profile (design §5.1); P3 wraps it into the stored profile. */
export interface SwingProfile {
    readonly mallet: {
        readonly headMass: number;
        readonly headLength: number;
        readonly headDiameter: number;
        readonly shaftLength: number;
    };
    /** The player's body: the arm mass at the top grip (kg) and the reach slack (m). */
    readonly body: { readonly armMass: number; readonly reachSlack: number };
    readonly stance: Readonly<Record<StrokeType, SwingStance>>;
    readonly drive: Readonly<Record<StrokeType, SwingDrive>>;
}

/** When each action begins, s from contact: negative early, positive late, 0 on time (design §5.2 step 8). */
export interface StrokeTiming {
    readonly arc: number;
    readonly hands: number;
    readonly dip: number;
}

/** A shot to simulate (design §5.1, product spec §3). */
export interface ShotSetup {
    readonly balls: BallStates;
    readonly striker: BallId;
    readonly croqueted?: BallId;
    readonly stroke: {
        readonly type: StrokeType;
        /** Swing direction, rad from +x, horizontal. */
        readonly aim: number;
        /** The head's centre-of-mass speed at contact, m/s. */
        readonly speed: number;
        /** −1 check … 0 coast … +1 push. */
        readonly drive: number;
        /** The ball's centre from the face's centre (m): `up` along its upward axis, `side` to the left of aim. */
        readonly contact: { readonly up: number; readonly side: number };
        readonly timing: StrokeTiming;
        /** The hands' travel along aim after contact, m; absent: the preset's `handReach`. */
        readonly handReach?: number;
        /** The bottom hand's push after contact, in [0, 1]; absent: the preset's `guideEffort`. */
        readonly guideEffort?: number;
    };
    readonly live: readonly BallId[];
    readonly continuation: boolean;
    readonly hampered: boolean;
    readonly jumpAttempt: boolean;
    readonly targetHoop?: HoopTarget;
    readonly lawnSpeed: number;
    readonly profile: SwingProfile;
}
