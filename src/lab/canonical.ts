/**
 * The canonical setups (P2b.2b.1 design §5.5), moved from tests/engine/support/shot.ts so the browser can build
 * them (side-on viewer spec §3.1): the striker's place, the croquet gap, the pass roll's split and canonicalSetup.
 * Not part of the engine.
 */
import { faceHalfHeight } from "../engine/impact/shape";
import { vec3 } from "../engine/math/vec3";
import { CROQUET_GAP_LIMIT } from "../engine/shot";
import { handsAheadFor, headShapeOf, stanceLean } from "../engine/swing/buildContact";
import { FIST, handsForLean } from "../engine/swing/hands";
import { DEFAULT_DRIVE, DEFAULT_TIMING, DEFAULT_WINDOW, defaultProfile } from "../engine/swing/profile";
import {
    CROQUET_STROKES,
    STROKE_TYPES,
    type ShotSetup,
    type StrokeType,
    type SwingDrive,
    type SwingProfile,
    type SwingShape,
    type SwingStance,
} from "../engine/swing/types";
import type { BallId, BallStates, World } from "../engine/types";
import { defaultWorld } from "../engine/world";
import { lawnReference, swingReference } from "../reference/index";

/**
 * Where the canonical setups put the striker: a lane of the default court midway between the hoop columns at
 * x = 6.4008 and 12.8016, clear of every hoop and the peg for 28 m along +y. The design's court centre holds the peg.
 */
export const CANONICAL_STRIKER = { x: 9.6012, y: 4 } as const;

/** The GC stop's gap to its target, surface to surface (m): the user's optimum (design §5.5, 2026-10-06). */
export const GC_STOP_GAP = 0.3;

/**
 * A croquet stroke's gap from the striker to the croqueted ball by default (m, surface to surface): 0.75 mm, as
 * P2b.2b.2c.2c's gate D ruled (design Amendments, 2026-10-23, gate stage 2). It is a deliberate fit to the touching
 * stops' figures, not a measurement: its lead over the 1 mm that Gugan 4 measured for its filmed drives C1D, C3D and
 * C10D (Table 5 row 2, note (i)) is within the model's step noise, and it stands in for the face's and the ball–ball
 * contact's matched time scales, the touching stops' carried cause.
 */
export const DEFAULT_CROQUET_GAP = 0.00075;

/**
 * What `canonicalSetup` changes: the world (default `defaultWorld()`), fields of the stroke, fields of the preset's
 * own stance, drive and shape entries in `defaultProfile`, the mallet, the body, and, for a single-ball stroke, the
 * gap (m, surface to surface) to a target ball on the aim line ahead (default GC_STOP_GAP for the GC stop, no target
 * otherwise), and, for a croquet stroke, the gap to the croqueted ball. The balls do not follow a changed aim.
 */
export interface CanonicalOptions {
    readonly world?: World;
    readonly stroke?: Partial<ShotSetup["stroke"]>;
    readonly stance?: Partial<SwingStance>;
    readonly drive?: Partial<SwingDrive>;
    /** Fields of the preset's own shape. */
    readonly shape?: Partial<SwingShape>;
    readonly targetGap?: number;
    /**
     * A croquet stroke's gap (m, surface to surface) from the striker to the croqueted ball, 0 ≤ gap <
     * CROQUET_GAP_LIMIT (default DEFAULT_CROQUET_GAP).
     */
    readonly croquetGap?: number;
    /**
     * The mallet in place of the default's, every preset's top hand moved to keep its default lean at its canonical
     * contact with that mallet.
     */
    readonly mallet?: SwingProfile["mallet"];
    /** Fields of the default body. */
    readonly body?: Partial<SwingProfile["body"]>;
}

/** A preset's canonical contact height `up` (m): the AC stop's −0.0225 m, 0 otherwise. */
export function canonicalUp(type: StrokeType): number {
    return type === "stop-ac" ? -0.0225 : 0;
}

/**
 * The canonical pass roll's croqueted ball off aim, to the left (°): a full roll's slight split (shapes design §8,
 * ruling 17; was 20°).
 */
export const PASS_SPLIT = 4;

/**
 * A preset's canonical setup (design §5.5): the striker at CANONICAL_STRIKER, aim +y, the default backswing
 * (reference/swing.json: 3 m/s planned at intensity 0, exit criterion 5), no intensity, the preset's default
 * drive, every action on time, the preset's reach, `side` 0, `up` 0 except the AC stop's −0.0225 m. A croquet stroke's
 * croqueted ball lies `croquetGap` (default DEFAULT_CROQUET_GAP, 0 ≤ gap < CROQUET_GAP_LIMIT) from the striker ahead
 * along aim, PASS_SPLIT to the left of it for the pass roll, and `live` is empty. A single-ball stroke's target, red, sits on
 * the aim line `targetGap` ahead (the GC stop's GC_STOP_GAP by default), and `live` holds every other ball: the
 * target, if any. No other balls. Throws an `Error` prefixed `canonicalSetup:` for `croquetGap` outside its range, for
 * `croquetGap` on a single-ball stroke, and for `targetGap` on a croquet stroke.
 */
export function canonicalSetup(type: StrokeType, over: CanonicalOptions = {}): ShotSetup {
    const world = over.world ?? defaultWorld();
    const R = world.ball.radius;
    const aim = Math.PI / 2;
    const at = (x: number, y: number) => ({
        position: vec3(x, y, R),
        velocity: vec3(0, 0, 0),
        angularVelocity: vec3(0, 0, 0),
    });
    const { x, y } = CANONICAL_STRIKER;
    const balls: BallStates = { blue: at(x, y) };
    const croquet = CROQUET_STROKES.includes(type);
    const gap = over.targetGap ?? (type === "stop-gc" ? GC_STOP_GAP : undefined);
    if (croquet) {
        if (over.targetGap !== undefined) {
            throw new Error(`canonicalSetup: a ${type} stroke's croqueted ball lies croquetGap away; no targetGap`);
        }
        const croquetGap = over.croquetGap ?? DEFAULT_CROQUET_GAP;
        // Checked on the input, so round-off in 2R + gap never decides the range.
        if (!(croquetGap >= 0 && croquetGap < CROQUET_GAP_LIMIT)) {
            throw new Error(`canonicalSetup: croquetGap ${croquetGap} m is outside [0, ${CROQUET_GAP_LIMIT})`);
        }
        const line = aim + (type === "pass-roll" ? (PASS_SPLIT * Math.PI) / 180 : 0);
        const reach = 2 * R + croquetGap;
        balls.red = at(x + reach * Math.cos(line), y + reach * Math.sin(line));
    } else if (over.croquetGap !== undefined) {
        throw new Error(`canonicalSetup: croquetGap is for a croquet stroke, not ${type}`);
    } else if (gap !== undefined) {
        balls.red = at(x + (2 * R + gap) * Math.cos(aim), y + (2 * R + gap) * Math.sin(aim));
    }
    const live: BallId[] = !croquet && balls.red !== undefined ? ["red"] : [];
    const mallet = over.mallet ?? defaultProfile.mallet;
    const geometryOf = (m: SwingProfile["mallet"]) => ({
        ballRadius: R,
        headLength: m.headLength,
        faceHalfHeight: faceHalfHeight(headShapeOf(m.head)),
    });
    const relean = (t: StrokeType, s: SwingStance): SwingStance => {
        const up = canonicalUp(t);
        const lean = stanceLean(s.handsAhead, s.top, up, geometryOf(defaultProfile.mallet));
        // A stance that follows the lean takes the law's hands on this mallet (hands-from-lean design §3).
        const hands = s.followsLean === true ? handsForLean(lean, mallet, FIST[t]) : { top: s.top, bottom: s.bottom };
        return { ...s, ...hands, handsAhead: handsAheadFor(lean, hands.top, up, geometryOf(mallet)) };
    };
    const stances =
        over.mallet === undefined
            ? defaultProfile.stance
            : (Object.fromEntries(STROKE_TYPES.map((t) => [t, relean(t, defaultProfile.stance[t])])) as Record<
                  StrokeType,
                  SwingStance
              >);
    const profile: SwingProfile = {
        ...defaultProfile,
        mallet,
        body: { ...defaultProfile.body, ...over.body },
        stance: { ...stances, [type]: { ...stances[type], ...over.stance } },
        drive: { ...defaultProfile.drive, [type]: { ...defaultProfile.drive[type], ...over.drive } },
        shape: { ...defaultProfile.shape, [type]: { ...defaultProfile.shape[type], ...over.shape } },
    };
    return {
        balls,
        striker: "blue",
        ...(croquet ? { croqueted: "red" as const } : {}),
        stroke: {
            type,
            aim,
            backswing: swingReference[type].defaultBackswing.value,
            drive: DEFAULT_DRIVE[type],
            ...(DEFAULT_WINDOW[type] === undefined ? {} : { window: DEFAULT_WINDOW[type] }),
            contact: { up: canonicalUp(type), side: 0 },
            timing: DEFAULT_TIMING[type],
            ...over.stroke,
        },
        live,
        continuation: false,
        hampered: false,
        jumpAttempt: false,
        lawnSpeed: lawnReference.defaultSpeed.value,
        profile,
    };
}
