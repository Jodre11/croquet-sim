/**
 * Test-only swing profiles and the canonical setups (P2b.2b.1 design §5.5). `testProfile` is plausible but NOT
 * sourced, as fixtures.ts. src/ must never import this file.
 */
import { vec3 } from "../../../src/engine/math/vec3";
import { DEFAULT_DRIVE, ON_TIME, defaultProfile } from "../../../src/engine/swing/profile";
import {
    CROQUET_STROKES,
    STROKE_TYPES,
    type ShotSetup,
    type StrokeType,
    type SwingDrive,
    type SwingProfile,
    type SwingStance,
} from "../../../src/engine/swing/types";
import type { BallId, BallStates, World } from "../../../src/engine/types";
import { defaultWorld } from "../../../src/engine/world";
import { lawnReference } from "../../../src/reference/index";

/** What `testProfile` changes: the mallet, the body, and one stance and one drive entry for every stroke type. */
export interface TestProfileOptions {
    readonly mallet?: Partial<SwingProfile["mallet"]>;
    readonly body?: Partial<SwingProfile["body"]>;
    readonly stance?: Partial<SwingStance>;
    readonly drive?: Partial<SwingDrive>;
}

/**
 * A profile with the test head (1 kg, 0.23 m long, 0.064 m across, on a 0.9 m shaft), no arm mass (so the swung body
 * is the head, as TEST_HANDS has it) and the same stance and drive for every stroke type: level, the hands 0.8 m and
 * 0.4 m from the socket with firm grips, a swing-mode coast with no hand share, dip or reach, and a full guide.
 */
export function testProfile(o: TestProfileOptions = {}): SwingProfile {
    const stance: SwingStance = { lean: 0, top: 0.8, bottom: 0.4, gripTension: 1, bottomGrip: 1, ...o.stance };
    const drive: SwingDrive = {
        mode: "swing",
        speedGain: 0.2,
        window: 0.01,
        handShare: 0,
        handGain: 0,
        handWindow: 0.01,
        handDrop: 0,
        dropTime: 0.01,
        handReach: 0,
        groundDepth: 0,
        guideEffort: 1,
        ...o.drive,
    };
    const every = <T>(entry: T): Record<StrokeType, T> =>
        Object.fromEntries(STROKE_TYPES.map((type) => [type, entry])) as Record<StrokeType, T>;
    return {
        mallet: { headMass: 1, headLength: 0.23, headDiameter: 0.064, shaftLength: 0.9, ...o.mallet },
        body: { armMass: 0, reachSlack: 0.03, ...o.body },
        stance: every(stance),
        drive: every(drive),
    };
}

/**
 * Where the canonical setups put the striker: a lane of the default court midway between the hoop columns at
 * x = 6.4008 and 12.8016, clear of every hoop and the peg for 28 m along +y. The design's court centre holds the peg.
 */
export const CANONICAL_STRIKER = { x: 9.6012, y: 4 } as const;

/** The GC stop's gap to its target, surface to surface (m): the user's optimum (design §5.5, 2026-10-06). */
export const GC_STOP_GAP = 0.3;

/**
 * What `canonicalSetup` changes: the world (default `defaultWorld()`), fields of the stroke, fields of the preset's
 * own stance and drive entries in `defaultProfile`, and, for a single-ball stroke, the gap (m, surface to surface) to
 * a target ball on the aim line ahead (default GC_STOP_GAP for the GC stop, no target otherwise). The balls do not
 * follow a changed aim.
 */
export interface CanonicalOptions {
    readonly world?: World;
    readonly stroke?: Partial<ShotSetup["stroke"]>;
    readonly stance?: Partial<SwingStance>;
    readonly drive?: Partial<SwingDrive>;
    readonly targetGap?: number;
}

/**
 * A preset's canonical setup (design §5.5): the striker at CANONICAL_STRIKER, aim +y, 3 m/s, the preset's default
 * drive, every action on time, the preset's reach, `side` 0, `up` 0 except the AC stop's −0.020 m. A croquet stroke's
 * croqueted ball touches the striker ahead along aim, 20° to the left of it for the pass roll, and `live` is empty. A
 * single-ball stroke's target, red, sits on the aim line `targetGap` ahead (the GC stop's GC_STOP_GAP by default),
 * and `live` holds every other ball: the target, if any. No other balls. Throws for a croquet stroke given a gap.
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
            throw new Error(`canonicalSetup: a ${type} stroke's croqueted ball touches the striker; no targetGap`);
        }
        const line = aim + (type === "pass-roll" ? (20 * Math.PI) / 180 : 0);
        balls.red = at(x + 2 * R * Math.cos(line), y + 2 * R * Math.sin(line));
    } else if (gap !== undefined) {
        balls.red = at(x + (2 * R + gap) * Math.cos(aim), y + (2 * R + gap) * Math.sin(aim));
    }
    const live: BallId[] = !croquet && balls.red !== undefined ? ["red"] : [];
    const profile: SwingProfile = {
        ...defaultProfile,
        stance: { ...defaultProfile.stance, [type]: { ...defaultProfile.stance[type], ...over.stance } },
        drive: { ...defaultProfile.drive, [type]: { ...defaultProfile.drive[type], ...over.drive } },
    };
    return {
        balls,
        striker: "blue",
        ...(croquet ? { croqueted: "red" as const } : {}),
        stroke: {
            type,
            aim,
            speed: 3,
            drive: DEFAULT_DRIVE[type],
            contact: { up: type === "stop-ac" ? -0.02 : 0, side: 0 },
            timing: ON_TIME,
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

/**
 * The head's lowest point above the turf (m) at contact in each canonical setup on the default world, with the
 * default profile (measured while planning, on prototype aeadd4c's geometry: h₀ = R − sink = 45.997 mm,
 * ρ = 38.1 mm, L = 228.6 mm; the head pitched by −lean, so independent of the arc radius).
 */
export const CANONICAL_CLEARANCE: Readonly<Record<StrokeType, number>> = {
    "single-ball": 7.8971e-3,
    drive: 7.8971e-3,
    "stop-ac": 8.7833e-3,
    "stop-gc": 7.8971e-3,
    "half-roll": 21.1109e-3,
    "full-roll": 51.6104e-3,
    "pass-roll": 54.7165e-3,
};
