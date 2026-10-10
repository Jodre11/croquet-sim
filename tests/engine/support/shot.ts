/**
 * Test-only swing profiles and the canonical setups (P2b.2b.1 design §5.5). `testProfile` is plausible but NOT
 * sourced, as fixtures.ts. src/ must never import this file.
 */
import { vec3 } from "../../../src/engine/math/vec3";
import { handsAheadFor, plannedSpeed, stanceLean } from "../../../src/engine/swing/buildContact";
import { MAX_BACK_ANGLE } from "../../../src/engine/swing/downswing";
import { DEFAULT_DRIVE, ON_TIME, defaultProfile } from "../../../src/engine/swing/profile";
import {
    CROQUET_STROKES,
    STROKE_TYPES,
    type ShotSetup,
    type StrokeType,
    type SwingDrive,
    type SwingProfile,
    type SwingShape,
    type SwingStance,
} from "../../../src/engine/swing/types";
import type { BallId, BallStates, World } from "../../../src/engine/types";
import { defaultWorld } from "../../../src/engine/world";
import { lawnReference, swingReference } from "../../../src/reference/index";
import { TEST_BALL } from "./fixtures";

/**
 * What `testProfile` changes: the mallet, the body, and one stance, one drive and one shape entry for every stroke
 * type. A stance may give a `lean` (rad) instead of `handsAhead`. It stands for the hands that give that lean with the
 * profile's own mallet (after `mallet`), at the contact height `up` (m, default 0) on a ball of radius `ballRadius` (m,
 * default TEST_BALL.radius). Give the shot's own `up` where it is not 0.
 */
export interface TestProfileOptions {
    readonly mallet?: Partial<SwingProfile["mallet"]>;
    readonly body?: Partial<SwingProfile["body"]>;
    readonly stance?: Partial<SwingStance> & { readonly lean?: number };
    readonly up?: number;
    readonly ballRadius?: number;
    readonly drive?: Partial<SwingDrive>;
    readonly shape?: Partial<SwingShape>;
}

/**
 * A profile with the test head (1 kg, 0.23 m long, 0.064 m across, on a 0.9 m shaft) and no arm mass, so that the
 * swung body is the head, as TEST_HANDS has it. Every stroke type has the same stance: level (lean 0, the top hand over
 * the socket at contact), the hands 0.8 m and 0.4 m from the socket, firm grips. Every type has the same drive: a
 * swing-mode coast with no dip or reach, and a full guide. Every type has the same shape: the pendulum alone (share 1),
 * by gravity alone (no effort), a 0.4 s pulse or hands' tempo halving at intensity 1, and intensity 0 by default.
 * Throws if the stance gives both a `lean` and `handsAhead`.
 */
export function testProfile(o: TestProfileOptions = {}): SwingProfile {
    const mallet = { headMass: 1, headLength: 0.23, headDiameter: 0.064, shaftLength: 0.9, ...o.mallet };
    const { lean, ...given }: Partial<SwingStance> & { readonly lean?: number } = o.stance ?? {};
    if (lean !== undefined && given.handsAhead !== undefined) {
        throw new Error("testProfile: give the stance a lean or handsAhead, not both");
    }
    const top = given.top ?? 0.8;
    const geometry = {
        ballRadius: o.ballRadius ?? TEST_BALL.radius,
        headLength: mallet.headLength,
        headRadius: mallet.headDiameter / 2,
    };
    const stance: SwingStance = {
        handsAhead: handsAheadFor(lean ?? 0, top, o.up ?? 0, geometry),
        top,
        bottom: 0.4,
        gripTension: 1,
        bottomGrip: 1,
        ...given,
    };
    const drive: SwingDrive = {
        mode: "swing",
        speedGain: 0.2,
        window: 0.01,
        handGain: 0,
        handWindow: 0.01,
        handDrop: 0,
        dropTime: 0.01,
        handReach: 0,
        groundDepth: 0,
        guideEffort: 1,
        ...o.drive,
    };
    const shape: SwingShape = {
        pendulumShare: 1,
        handAngle: 0.5,
        effort: { torqueMax: 0, tempoSlow: 0.4, tempoFast: 0.2 },
        handTempo: { slow: 0.4, fast: 0.2 },
        defaultIntensity: 0,
        ...o.shape,
    };
    const every = <T>(entry: T): Record<StrokeType, T> =>
        Object.fromEntries(STROKE_TYPES.map((type) => [type, entry])) as Record<StrokeType, T>;
    return {
        mallet,
        body: { armMass: 0, reachSlack: 0.03, ...o.body },
        stance: every(stance),
        drive: every(drive),
        shape: every(shape),
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
 * own stance, drive and shape entries in `defaultProfile`, and, for a single-ball stroke, the gap (m, surface to
 * surface) to a target ball on the aim line ahead (default GC_STOP_GAP for the GC stop, no target otherwise). The balls
 * do not follow a changed aim.
 */
export interface CanonicalOptions {
    readonly world?: World;
    readonly stroke?: Partial<ShotSetup["stroke"]>;
    readonly stance?: Partial<SwingStance>;
    readonly drive?: Partial<SwingDrive>;
    /** Fields of the preset's own shape. */
    readonly shape?: Partial<SwingShape>;
    readonly targetGap?: number;
}

/**
 * A preset's canonical setup (design §5.5): the striker at CANONICAL_STRIKER, aim +y, the default backswing
 * (reference/swing.json: 3 m/s planned at the default intensity, exit criterion 5), the preset's default
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
 * The head's lowest point above the turf (m) at contact in each canonical setup on the default world, with the default
 * profile. It is measured on prototype aeadd4c's geometry: h₀ = R − δ₀, ρ = 38.1 mm, L = 228.6 mm, with δ₀ the
 * striker's static sink on the default bed at its position (9.6012, 4), turfBed.ts staticSink: 0.4366 mm, so
 * h₀ = 45.6009 mm. P2b.2b.2b.2a: turf bed (was δ₀ = m·g/k_turf = 0.0404 mm, h₀ = 45.997 mm; every figure falls by the
 * sink's change, 0.3962 mm). The head is pitched by −lean, so the figure is independent of the arc radius. The rolls'
 * figures were re-measured at Gugan's leans (P2b.2b.2b.1). For a forward lean α at `up` 0 the lowest point is the
 * face's lower rim, at h₀ + (R + START_GAP)·sin α − ρ·cos α; level, it is h₀ − ρ.
 */
export const CANONICAL_CLEARANCE: Readonly<Record<StrokeType, number>> = {
    // P2b.2b.2b.2a: turf bed (was 7.8971e-3): h₀ − ρ.
    "single-ball": 7.5009e-3,
    drive: 7.5009e-3,
    // P2b.2b.2b.2a: turf bed (was 8.7833e-3).
    "stop-ac": 8.3872e-3,
    "stop-gc": 7.5009e-3,
    // P2b.2b.2b.2a: turf bed (was 29.9165e-3, 37.0506e-3 and 40.1551e-3): h₀ + (R + START_GAP)·sin α − ρ·cos α.
    "half-roll": 29.5203e-3,
    "full-roll": 36.6544e-3,
    "pass-roll": 39.7589e-3,
};

const SOLVED = new Map<string, number>();

/**
 * The backswing (m) at which `setup`'s planned contact speed is `speed` (P2b.2b.2a design §5.3): bisection over (0,
 * the MAX_BACK_ANGLE bound] at the setup's intensity, or its preset's default, 60 halvings. Memoised on what the
 * planned speed depends on: the type, the intensity, the contact's height (under fixed hands the lean follows it,
 * P2b.2b.2b.1 design §3.3), the profile's entries for the type, the speed, gravity and the ball's radius. It is not
 * memoised on the drive, the contact's side, the timing or the balls. Throws a RangeError for a speed beyond the
 * bound's reach. Test support only.
 */
export function backswingFor(setup: ShotSetup, speed: number, world: World = defaultWorld()): number {
    const { stroke, profile } = setup;
    const { type } = stroke;
    const stance = profile.stance[type];
    const shape = profile.shape[type];
    const key = JSON.stringify([
        type,
        stroke.intensity ?? null,
        stroke.contact.up,
        profile.mallet,
        profile.body,
        stance,
        profile.drive[type].mode,
        shape,
        speed,
        world.gravity,
        world.ball.radius,
    ]);
    const known = SOLVED.get(key);
    if (known !== undefined) {
        return known;
    }
    const lever = profile.mallet.headDiameter / 2 + stance.top;
    const lean = stanceLean(stance.handsAhead, stance.top, stroke.contact.up, {
        ballRadius: world.ball.radius,
        headLength: profile.mallet.headLength,
        headRadius: profile.mallet.headDiameter / 2,
    });
    const room = lever * (Math.cos(lean) - Math.cos(MAX_BACK_ANGLE));
    let hi = shape.pendulumShare > 0 ? (room / shape.pendulumShare) * (1 - 1e-9) : 2;
    const at = (backswing: number): number => plannedSpeed({ ...setup, stroke: { ...stroke, backswing } }, world);
    if (at(hi) < speed) {
        throw new RangeError(
            `backswingFor: ${speed} m/s is beyond the ${type} stroke's reach (${at(hi)} m/s at ${hi} m)`,
        );
    }
    let lo = 0;
    for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (at(mid) < speed) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    SOLVED.set(key, hi);
    return hi;
}
