/**
 * Test-only swing profiles and the canonical setups (P2b.2b.1 design §5.5). `testProfile` is plausible but NOT
 * sourced, as fixtures.ts. src/ must never import this file.
 */
import { faceHalfHeight } from "../../../src/engine/impact/shape";
import { vec3 } from "../../../src/engine/math/vec3";
import { CROQUET_GAP_LIMIT } from "../../../src/engine/shot";
import { handsAheadFor, headShapeOf, plannedSpeed, stanceLean } from "../../../src/engine/swing/buildContact";
import { MAX_BACK_ANGLE } from "../../../src/engine/swing/downswing";
import { DEFAULT_DRIVE, ON_TIME, defaultProfile } from "../../../src/engine/swing/profile";
import {
    CROQUET_STROKES,
    STROKE_TYPES,
    type MalletHeadProfile,
    type ShotSetup,
    type StrokeType,
    type SwingDrive,
    type SwingProfile,
    type SwingShape,
    type SwingStance,
} from "../../../src/engine/swing/types";
import type { BallId, BallStates, World } from "../../../src/engine/types";
import { defaultWorld } from "../../../src/engine/world";
import { lawnReference, malletReference, swingReference } from "../../../src/reference/index";
import { TEST_BALL } from "./fixtures";
import {
    TEST_CHAIN,
    TEST_FLEX,
    TEST_GRIP_LIMIT,
    TEST_HEAD,
    TEST_PENDULUM_FORCE,
    TEST_PUSH_FORCE,
    TEST_PUSH_RESPONSE_TIME,
} from "./impact";

/**
 * A rounded box head for testProfile's mallet (P2b.2b.2b.2c design §5.1): TEST_BOX's 64 mm square face with 3 mm edges,
 * its moment about the shaft TEST_HEAD's I_z. Unsourced.
 */
export const TEST_BOX_HEAD: Extract<MalletHeadProfile, { kind: "box" }> = {
    kind: "box",
    faceWidth: 0.064,
    faceHeight: 0.064,
    edgeRadius: 0.003,
    inertiaAboutShaft: TEST_HEAD.inertia.z,
};

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
 * swing-mode coast with no dip or reach, a full guide, a pendulum phase at 0.8 of the push with no effort and a 1.5 m
 * hands' arc lowest halfway; the body has TEST_FLEX, TEST_PENDULUM_FORCE, TEST_PUSH_FORCE, TEST_PUSH_RESPONSE_TIME,
 * TEST_CHAIN, TEST_GRIP_LIMIT, no backswing limit short of MAX_BACK_ANGLE, no effort (τ_0 = 0, ω_max = 1 rad/s), so
 * a swing-mode stroke falls by gravity alone, and the default's 300 m/s² hands' peak acceleration. Every type has the
 * same shape: the pendulum alone (share 1) and a 0.4 s hands' tempo halving at intensity 1. Throws if the stance gives
 * both a `lean` and `handsAhead`.
 */
export function testProfile(o: TestProfileOptions = {}): SwingProfile {
    const mallet: SwingProfile["mallet"] = {
        headMass: 1,
        headLength: 0.23,
        head: { kind: "round", diameter: 0.064 },
        shaftLength: 0.9,
        shaftMass: 0,
        ...o.mallet,
    };
    const { lean, ...given }: Partial<SwingStance> & { readonly lean?: number } = o.stance ?? {};
    if (lean !== undefined && given.handsAhead !== undefined) {
        throw new Error("testProfile: give the stance a lean or handsAhead, not both");
    }
    const top = given.top ?? 0.8;
    const geometry = {
        ballRadius: o.ballRadius ?? TEST_BALL.radius,
        headLength: mallet.headLength,
        faceHalfHeight: faceHalfHeight(headShapeOf(mallet.head)),
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
        guideEffort: 1,
        pendulumAt: 0.8,
        pendulumEffort: 0,
        handArcRadius: 1.5,
        handArcLow: 0.5,
        ...o.drive,
    };
    const shape: SwingShape = {
        pendulumShare: 1,
        handAngle: 0.5,
        handTempo: { slow: 0.4, fast: 0.2 },
        ...o.shape,
    };
    const every = <T>(entry: T): Record<StrokeType, T> =>
        Object.fromEntries(STROKE_TYPES.map((type) => [type, entry])) as Record<StrokeType, T>;
    return {
        mallet,
        body: {
            armMass: 0,
            reachSlack: 0.03,
            flex: TEST_FLEX,
            pendulumForce: TEST_PENDULUM_FORCE,
            pushForce: TEST_PUSH_FORCE,
            pushResponseTime: TEST_PUSH_RESPONSE_TIME,
            chain: TEST_CHAIN,
            gripLimit: TEST_GRIP_LIMIT,
            backswingLimit: MAX_BACK_ANGLE,
            effort: { torque: 0, speed: 1 },
            handAcceleration: 300,
            ...o.body,
        },
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

/** A preset's canonical contact height `up` (m): the AC stop's −0.020 m, 0 otherwise. */
function canonicalUp(type: StrokeType): number {
    return type === "stop-ac" ? -0.02 : 0;
}

/**
 * The P2b.2b.2b.2b default mallet: the Jaques 9" round head, 1.0 kg, on a massless 36 in shaft. It keeps the round
 * head's turf and sunk-ball mechanisms under test after the default switched to the box (P2b.2b.2b.2c plan Task 7
 * ruling): the box clears the turf where the barrel's rim met it. Its runs use the re-fitted swing.json and a stance
 * re-leaned by canonicalSetup, so it is not the P2b.2b.2b.2b engine exactly.
 */
export const LEGACY_MALLET: SwingProfile["mallet"] = {
    headMass: malletReference.headMass.value,
    headLength: 0.2286,
    head: { kind: "round", diameter: malletReference.headDiameter.value },
    shaftLength: malletReference.shaftLength.value,
    shaftMass: 0,
};

/**
 * A preset's canonical setup (design §5.5): the striker at CANONICAL_STRIKER, aim +y, the default backswing
 * (reference/swing.json: 3 m/s planned at intensity 0, exit criterion 5), no intensity, the preset's default
 * drive, every action on time, the preset's reach, `side` 0, `up` 0 except the AC stop's −0.020 m. A croquet stroke's
 * croqueted ball lies `croquetGap` (default DEFAULT_CROQUET_GAP, 0 ≤ gap < CROQUET_GAP_LIMIT) from the striker ahead
 * along aim, 20° to the left of it for the pass roll, and `live` is empty. A single-ball stroke's target, red, sits on
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
        const line = aim + (type === "pass-roll" ? (20 * Math.PI) / 180 : 0);
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
        return { ...s, handsAhead: handsAheadFor(lean, s.top, up, geometryOf(mallet)) };
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
            contact: { up: canonicalUp(type), side: 0 },
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
 * face's lower rim, at h₀ + (R + START_GAP)·sin α − ρ·cos α; level, it is h₀ − ρ. P2b.2b.2b.2c: the mallet, a box
 * with h_z = 28.575 mm, L = 279.4 mm and e = 3 mm in place of the barrel; each figure's formula is at its entry.
 */
export const CANONICAL_CLEARANCE: Readonly<Record<StrokeType, number>> = {
    // P2b.2b.2b.2c: the mallet (was 7.5009e-3): the box's flat underside, h₀ − h_z, 9.525 mm above the barrel's rim.
    "single-ball": 17.0259e-3,
    drive: 17.0259e-3,
    // P2b.2b.2b.2c: the mallet (was 8.3872e-3): the head's back corner, lowest under the backward lean, rises by
    // (ρ − h_z)·cos α − (L − e − L₀)·|sin α| − e·(1 − cos α), L₀ the old 228.6 mm head.
    // P2b.2b.2c.2d: the stance's lean, 6° back (was 4°, 14.5473e-3): the back corner, pitched further, lies lower.
    "stop-ac": 3.35242e-3,
    // P2b.2b.2b.2c: the mallet (was 7.5009e-3).
    "stop-gc": 17.0259e-3,
    // P2b.2b.2b.2c: the mallet (was 29.5203e-3, 36.6544e-3 and 39.7589e-3): the face's rounded lower edge,
    // h₀ + (R + START_GAP)·sin α + e·sin α − (h_z − e)·cos α − e.
    "half-roll": 39.1827e-3,
    "full-roll": 45.9355e-3,
    "pass-roll": 48.8202e-3,
};

const SOLVED = new Map<string, number>();

/**
 * The backswing (m) at which `setup`'s planned contact speed is `speed` (P2b.2b.2a design §5.3): bisection over (0,
 * the MAX_BACK_ANGLE bound] at the setup's intensity, or 0 where it gives none, 60 halvings; in swing mode a midpoint
 * beyond the body's θ_max counts as reaching the speed, and the reach is the speed at θ_max. Memoised on what the
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
    const rho = faceHalfHeight(headShapeOf(profile.mallet.head));
    const lever = rho + stance.top;
    const lean = stanceLean(stance.handsAhead, stance.top, stroke.contact.up, {
        ballRadius: world.ball.radius,
        headLength: profile.mallet.headLength,
        faceHalfHeight: rho,
    });
    const reachOf = (angle: number): number =>
        shape.pendulumShare > 0 ? ((lever * (Math.cos(lean) - Math.cos(angle))) / shape.pendulumShare) * (1 - 1e-9) : 2;
    let hi = reachOf(MAX_BACK_ANGLE);
    // The bracket stays at MAX_BACK_ANGLE, so a bisection that converges inside the body's limit takes the steps it
    // always did, to the bit. A midpoint beyond the limit (the planner's RangeError naming θ_max) counts as reaching
    // the speed.
    const at = (backswing: number): number => {
        try {
            return plannedSpeed({ ...setup, stroke: { ...stroke, backswing } }, world);
        } catch (error) {
            if (error instanceof RangeError && error.message.includes("θ_max")) {
                return Infinity;
            }
            throw error;
        }
    };
    const reach = profile.drive[type].mode === "swing" ? Math.min(hi, reachOf(profile.body.backswingLimit)) : hi;
    if (at(reach) < speed) {
        throw new RangeError(
            `backswingFor: ${speed} m/s is beyond the ${type} stroke's reach (${at(reach)} m/s at ${reach} m)`,
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

/** strokeFor's halvings of the intensity over [0, 1], to a double's resolution: numerical, not physical. */
const INTENSITY_BISECTIONS = 60;

/**
 * The stroke inputs that plan `setup`'s contact speed `speed`, the default stroke fixing the backswing (P2b.2b.2c.1
 * design, Amendments). A setup that gives an intensity, or a carry-mode one, takes backswingFor's backswing at
 * it. Otherwise, in swing mode, from the preset's defaultBackswing h_0 (reference/swing.json):
 * 1. speed ≤ U(0) at h_0: the backswing solved at intensity 0 (backswingFor), no intensity given;
 * 2. U(0) < speed ≤ U(1) at h_0: h_0 and the intensity solved by bisection over [0, 1] (U rises with i, design §4.2),
 *    the least found that reaches the speed;
 * 3. speed > U(1) at h_0: intensity 1 and the backswing solved at it, up to θ_max; beyond, backswingFor's RangeError.
 * h_0 is read from `swingReference` because `SwingProfile` carries no default backswing, so a setup with another
 * mallet or body still starts from the default player's h_0. Test support only.
 */
export function strokeFor(
    setup: ShotSetup,
    speed: number,
    world: World = defaultWorld(),
): { backswing: number; intensity?: number } {
    const { stroke, profile } = setup;
    const { type } = stroke;
    if (stroke.intensity !== undefined || profile.drive[type].mode !== "swing") {
        return { backswing: backswingFor(setup, speed, world) };
    }
    const backswing = swingReference[type].defaultBackswing.value;
    const at = (intensity: number): number =>
        plannedSpeed({ ...setup, stroke: { ...stroke, backswing, intensity } }, world);
    if (speed <= at(0)) {
        return { backswing: backswingFor(setup, speed, world) };
    }
    if (speed > at(1)) {
        const full = { ...setup, stroke: { ...stroke, intensity: 1 } };
        return { backswing: backswingFor(full, speed, world), intensity: 1 };
    }
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < INTENSITY_BISECTIONS; i++) {
        const mid = (lo + hi) / 2;
        if (at(mid) < speed) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    return { backswing, intensity: hi };
}

/**
 * strokeFor's regime for `setup`'s stroke: 1 with no intensity (gravity only), 2 at the preset's defaultBackswing h_0
 * with an intensity, 3 at intensity 1 with the backswing solved beyond h_0. Test support only.
 */
export function regimeOf(setup: ShotSetup): 1 | 2 | 3 {
    const { type, backswing, intensity } = setup.stroke;
    if (intensity === undefined) {
        return 1;
    }
    return backswing === swingReference[type].defaultBackswing.value ? 2 : 3;
}
