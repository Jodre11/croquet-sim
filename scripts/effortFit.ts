/**
 * The swing effort law's fit and checks (P2b.2b.2c.1 design §4.3, §4.4, §8.1.3 and its Amendments), shared by
 * scripts/fitStrokeShape.ts and the effort tests, so the fit's solver and the tests agree by construction. Every
 * figure is the engine's own planned contact speed: each swing preset's canonical contact pose (canonicalSetup) and
 * hands, its downswing planned under the effort law and the speed read off the pose (poseSpeed), as
 * fitStrokeShape.ts's cases have always been built. `profile` defaults to `defaultProfile`; the presets are its own
 * strokes whose slope is not fully held.
 */
import type { Hands } from "../src/engine/impact/types";
import { contactPose, downswingInput, poseSpeed, type ContactPose } from "../src/engine/swing/buildContact";
import { planDownswing, type PlannedDownswing } from "../src/engine/swing/downswing";
import { defaultProfile } from "../src/engine/swing/profile";
import { STROKE_TYPES, type StrokeType, type SwingEffort, type SwingProfile } from "../src/engine/swing/types";
import { defaultWorld } from "../src/engine/world";
import { canonicalSetup } from "../tests/engine/support/shot";

/**
 * The ceiling (m/s, design §4.3): every swing preset at intensity 1 from its body-limited top reaches at least
 * 1.1 × the CA's A4D 8.18 m/s = 8.998, rounded to 9.0 so that both forms hold.
 */
export const CEILING = 9.0;

/** The default profile's swing stroke types (the slope not fully held), in the presets' order. */
export const SWING_PRESETS: readonly StrokeType[] = STROKE_TYPES.filter(
    (type) => defaultProfile.shape[type].slopeHold < 1,
);

/** Numerical, not physical: the effort's bisections stop when the bracket is this close to its upper end, relative. */
const TOLERANCE = 1e-9;

/** The body-limited top's margin inside θ_max, relative, as maxBackswing's was, so that the top plans, not throws. */
const TOP_MARGIN = 1e-9;

/** Design §8.1.3's grid: the lowest backswing (m), the backswings' steps to the top, and the intensities' step. */
const GRID_LOW = 0.05;
const GRID_BACKSWINGS = 10;
const GRID_INTENSITIES = 20;

/** No flat top: dU/di at i = 1 at least this fraction of its mean over [0, 1], design §4.2's least fraction. */
export const END_SLOPE_SHARE = 0.25;

const WORLD = defaultWorld();

/** One swing preset's fixed inputs: its contact pose and its hands. */
interface Case {
    readonly pose: ContactPose;
    readonly hands: Hands;
}

const CASES = new WeakMap<SwingProfile, Map<StrokeType, Case>>();

function caseOf(type: StrokeType, profile: SwingProfile): Case {
    if (profile.shape[type].slopeHold === 1) {
        throw new Error(`effortFit: ${type} holds its slope, so the effort does not act`);
    }
    let cases = CASES.get(profile);
    if (cases === undefined) {
        cases = new Map();
        CASES.set(profile, cases);
    }
    const known = cases.get(type);
    if (known !== undefined) {
        return known;
    }
    const stance = profile.stance[type];
    const setup = { ...canonicalSetup(type, { world: WORLD }), profile };
    const made: Case = {
        pose: contactPose(setup, WORLD),
        hands: {
            bottom: stance.bottom,
            gripTension: stance.gripTension,
            bottomGrip: stance.bottomGrip,
            armMass: profile.body.armMass,
            reachSlack: profile.body.reachSlack,
            guideEffort: 1,
            flex: profile.body.flex,
            pendulumForce: profile.body.pendulumForce,
            pushForce: profile.body.pushForce,
            pushResponseTime: profile.body.pushResponseTime,
            chain: profile.body.chain,
            gripLimit: profile.body.gripLimit,
        },
    };
    cases.set(type, made);
    return made;
}

function plan(
    type: StrokeType,
    backswing: number,
    intensity: number,
    effort: SwingEffort,
    profile: SwingProfile,
): PlannedDownswing {
    const c = caseOf(type, profile);
    const choice = {
        shape: profile.shape[type],
        slopeHold: profile.shape[type].slopeHold,
        backswing,
        backswingLimit: profile.body.backswingLimit,
        effort,
        intensity,
        arrival: 0,
    };
    return planDownswing(downswingInput(c.pose, c.hands, choice, WORLD.gravity));
}

/** The head's rise (m) at a knee-height top on the default mallet: the user's "about knee height" (design §5.2). */
export const KNEE_RISE = 0.48;

/**
 * θ_max (rad from vertical) at knee height, where the user's head tops out: the shaft's angle at which the single-ball
 * preset's head rises KNEE_RISE above its contact height, solved from `profile`'s mallet and stance,
 * acos(cos θ_c − KNEE_RISE·s/ℓ), the inverse of bodyTop's rise without its margin.
 */
export function kneeLimit(profile: SwingProfile = defaultProfile): number {
    const { lever, thetaContact } = contactArm("single-ball", profile);
    return Math.acos(Math.cos(thetaContact) - (KNEE_RISE * profile.shape["single-ball"].pendulumShare) / lever);
}

/** Swing preset `type`'s canonical pendulum lever ℓ = ρ + r (m) and its shaft's angle at contact θ_c (rad). */
export function contactArm(
    type: StrokeType,
    profile: SwingProfile = defaultProfile,
): { lever: number; thetaContact: number } {
    const { pose } = caseOf(type, profile);
    return { lever: pose.head.socket.z + pose.radius, thetaContact: pose.thetaContact };
}

/**
 * The body-limited top (m): h_top = ℓ·(cos θ_c − cos θ_max)/s·(1 − 1e-9), the backswing that takes the shaft a hair
 * inside the body's θ_max, so that the top plans rather than throws.
 */
export function bodyTop(type: StrokeType, profile: SwingProfile = defaultProfile): number {
    const { pose } = caseOf(type, profile);
    const lever = pose.head.socket.z + pose.radius;
    const room = lever * (Math.cos(pose.thetaContact) - Math.cos(profile.body.backswingLimit));
    return (room / profile.shape[type].pendulumShare) * (1 - TOP_MARGIN);
}

/** The planned contact speed (m/s) of swing preset `type` from `backswing` (m) at `intensity` under `effort`. */
export function speedAt(
    type: StrokeType,
    backswing: number,
    intensity: number,
    effort: SwingEffort,
    profile: SwingProfile = defaultProfile,
): number {
    return poseSpeed(caseOf(type, profile).pose, plan(type, backswing, intensity, effort, profile));
}

/** The shaft's angular speed ω (rad/s) at contact of swing preset `type`, as speedAt plans it. */
export function contactRate(
    type: StrokeType,
    backswing: number,
    intensity: number,
    effort: SwingEffort,
    profile: SwingProfile = defaultProfile,
): number {
    return plan(type, backswing, intensity, effort, profile).omega;
}

/** The lowest U(1) over the swing presets, each from its body-limited top, and the preset that gives it. */
export function weakestTop(
    effort: SwingEffort,
    profile: SwingProfile = defaultProfile,
): { type: StrokeType; speed: number } {
    let weakest: { type: StrokeType; speed: number } | null = null;
    for (const type of SWING_PRESETS) {
        const speed = speedAt(type, bodyTop(type, profile), 1, effort, profile);
        if (weakest === null || speed < weakest.speed) {
            weakest = { type, speed };
        }
    }
    if (weakest === null) {
        throw new Error("effortFit: no swing presets");
    }
    return weakest;
}

/**
 * The body's effort for share `kappa` (design §4.4), solved jointly. The outer bisection is on τ_0 over [0, hi], hi
 * doubled from 1 N·m until the weakest preset's U(1) from its top reaches CEILING. For each τ_0 the inner bisection is
 * on ω_max over [lo, hi]: lo the gravity-only drive's ω at contact from its top over κ (where the drive's ω_c(ω_max) ≥
 * κ·ω_max, the torque being non-negative), hi doubled until ω_c(ω_max) − κ·ω_max < 0. Each stops when its bracket is
 * within TOLERANCE of its upper end, relative, and gives that end: the τ_0 whose weakest U(1) reaches CEILING and the
 * ω_max at which the drive just falls short of κ·ω_max.
 */
export function fitEffort(kappa: number, profile: SwingProfile = defaultProfile): SwingEffort {
    const driveTop = bodyTop("drive", profile);
    const gravityRate = contactRate("drive", driveTop, 0, { torque: 0, speed: 1 }, profile);
    const speedFor = (torque: number): number => {
        const gap = (speed: number): number =>
            contactRate("drive", driveTop, 1, { torque, speed }, profile) - kappa * speed;
        let lo = gravityRate / kappa;
        let hi = 2 * lo;
        while (!(gap(hi) < 0)) {
            lo = hi;
            hi *= 2;
        }
        while (hi - lo > TOLERANCE * hi) {
            const mid = (lo + hi) / 2;
            if (gap(mid) < 0) {
                hi = mid;
            } else {
                lo = mid;
            }
        }
        return hi;
    };
    const effortFor = (torque: number): SwingEffort => ({ torque, speed: speedFor(torque) });
    let hi = 1;
    let best = effortFor(hi);
    while (weakestTop(best, profile).speed < CEILING) {
        hi *= 2;
        best = effortFor(hi);
    }
    let lo = 0;
    while (hi - lo > TOLERANCE * hi) {
        const mid = (lo + hi) / 2;
        const effort = effortFor(mid);
        if (weakestTop(effort, profile).speed < CEILING) {
            lo = mid;
        } else {
            hi = mid;
            best = effort;
        }
    }
    return best;
}

/**
 * Design §4.2's constraints on swing preset `type` over §8.1.3's grid (backswings from GRID_LOW to the body-limited
 * top in GRID_BACKSWINGS equal steps, intensity in steps of 1/GRID_INTENSITIES): whether U strictly increases with i
 * and its second differences in i are all negative at every backswing, and the no-flat-top end slope
 * (U(1) − U(0.95))/0.05 with the mean slope U(1) − U(0), at the backswing where their ratio is least.
 */
export function checkCurve(
    type: StrokeType,
    effort: SwingEffort,
    profile: SwingProfile = defaultProfile,
): { increasing: boolean; concave: boolean; endSlope: number; meanSlope: number } {
    const top = bodyTop(type, profile);
    let increasing = true;
    let concave = true;
    let worst = { endSlope: Infinity, meanSlope: 1 };
    for (let k = 0; k <= GRID_BACKSWINGS; k++) {
        const h = k === GRID_BACKSWINGS ? top : GRID_LOW + (k * (top - GRID_LOW)) / GRID_BACKSWINGS;
        const u = Array.from({ length: GRID_INTENSITIES + 1 }, (_, j) =>
            speedAt(type, h, j / GRID_INTENSITIES, effort, profile),
        );
        for (let j = 1; j <= GRID_INTENSITIES; j++) {
            if (!((u[j] as number) > (u[j - 1] as number))) {
                increasing = false;
            }
        }
        for (let j = 1; j < GRID_INTENSITIES; j++) {
            if (!((u[j + 1] as number) - 2 * (u[j] as number) + (u[j - 1] as number) < 0)) {
                concave = false;
            }
        }
        const last = u[GRID_INTENSITIES] as number;
        const endSlope = (last - (u[GRID_INTENSITIES - 1] as number)) * GRID_INTENSITIES;
        const meanSlope = last - (u[0] as number);
        if (endSlope / meanSlope < worst.endSlope / worst.meanSlope) {
            worst = { endSlope, meanSlope };
        }
    }
    return { increasing, concave, ...worst };
}
