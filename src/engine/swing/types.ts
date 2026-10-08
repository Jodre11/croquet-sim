/**
 * The swing model's inputs (P2b.2b.1 design §5.1): the stroke types, the physical swing profile and a shot's setup.
 * They follow how a player plays a stroke (user's account, 2026-10-05):
 * - the shot type, then the balls;
 * - a stance for that type, and where the two hands sit on the mallet, which sets the head's angle;
 * - where and how to hit the striker's ball;
 * - the rehearsed shape of the swing: the pendulum, the hands' path through space, the dip and the reach;
 * - and, per shot, how far back the player takes the mallet, how hard and quickly they swing it, and how they time each
 *   action (P2b.2b.2a).
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
 * The swing's shape (design §5.2 step 7), its changes measured against the planned contact speed (P2b.2b.2a design
 * §3.4). The mode (§3.3). The pendulum: over `window` (s) at full `drive` its contribution changes by `speedGain`
 * times that speed. The hands: from their speed at contact (P2b.2b.2a design §3.3), changing by `handGain` times the
 * head's speed over `handWindow` (s) at full `drive`. The dip: whatever `drive`, the hands lower by `handDrop` (m)
 * over `dropTime` (s), rest to rest. The reach: the hands' path travels `handReach` (m) along aim after contact, the
 * default for the shot's own. In carry mode the head's lowest point ends `groundDepth` (m) below the turf. In swing
 * mode the bottom hand's push after contact is `guideEffort` (in [0, 1]) of a full restoration of the arc's speed, the
 * default for the shot's own.
 */
export interface SwingDrive {
    readonly mode: StrokeMode;
    readonly speedGain: number;
    readonly window: number;
    readonly handGain: number;
    readonly handWindow: number;
    readonly handDrop: number;
    readonly dropTime: number;
    readonly handReach: number;
    readonly groundDepth: number;
    readonly guideEffort: number;
}

/**
 * How a stroke type's whole stroke is shaped (P2b.2b.2a design §3, §5.1). `pendulumShare` (in [0, 1]) of the
 * backswing's height comes from the pendulum and the rest from the hands, which start back and up along `handAngle`
 * (rad above horizontal; read only when the share is below 1). Swing mode reads `effort`: the player's torque pulse
 * peaks at intensity·torqueMax (N·m) over a duration from `tempoSlow` (s, intensity 0) to `tempoFast` (s, intensity
 * 1). Carry mode reads `handTempo`: the hands' downswing lasts from `slow` (s, intensity 0) to `fast` (s, intensity 1).
 * `defaultIntensity` (in [0, 1]) stands for a shot that gives none.
 */
export interface SwingShape {
    readonly pendulumShare: number;
    readonly handAngle: number;
    readonly effort: { readonly torqueMax: number; readonly tempoSlow: number; readonly tempoFast: number };
    readonly handTempo: { readonly slow: number; readonly fast: number };
    readonly defaultIntensity: number;
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
    readonly shape: Readonly<Record<StrokeType, SwingShape>>;
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
        /** The head centre's height at the backswing's top above its height at contact, m (P2b.2b.2a design §3.2). */
        readonly backswing: number;
        /** Effort and tempo, one control in [0, 1]; absent: the preset's defaultIntensity (P2b.2b.2a design §3.1). */
        readonly intensity?: number;
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
