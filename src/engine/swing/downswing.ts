/**
 * The downswing (P2b.2b.2a design §3; P2b.2b.2c.3a design §4.1): from the backswing's top, where the pendulum and the
 * hands are at rest, to the planned contact, with no contact on the way. One law plans every stroke's slope, set by
 * λ = `slopeHold` in [0, 1], how far the hands hold the shaft's slope against its free swing.
 * - The top (§3.2): `pendulumShare` s of the backswing's height h raises the head about the hands, θ_top =
 *   −arccos(cos θ_c − s·h/ℓ_h), within the body's limit θ_max; the hands start back and up along handAngle φ,
 *   d_h·sin φ = (1 − s)·h.
 * - The hands (§3.3) follow P(σ) = P_b + Δ_h·σ² + Δ_z·(3σ² − 2σ³), starting from rest, plus the Hermite term
 *   T·(σ³ − σ²) where the hands' arc descends at contact, so that they arrive along it (P2b.2b.2b.2b design §4.1).
 * - The free swing (λ = 0; §3.1, §3.4): the pendulum leads and σ = (θ − θ_top)/(θ_c − θ_top). I_P·θ̈ = −W·sin θ (W of
 *   pendulumOf) − M·d·(A·t̂) + τ_p(ω) is solved for θ̈ with A = P″·σ̇² + P′·σ̈, and integrated by semi-implicit Euler
 *   every FREE_STEP until θ first reaches θ_c, the crossing step cut by linear interpolation in θ. The effort τ_p is
 *   the player's, a torque–velocity law linear in ω, a simplification of Hill's hyperbolic force–velocity relation
 *   (Hill 1938; P2b.2b.2c.1 design §4.4): τ_p = i·τ_0·max(0, 1 − ω/ω_max) with the body's τ_0 and ω_max
 *   (effortTorque). It steps on at the top and acts until contact, falling as the swing speeds up, so effort gives
 *   diminishing returns and the tempo follows from it; at intensity 0 it is +0 and the swing is gravity's alone. Its
 *   fall D_f is the free swing's own tempo.
 * - The held slope (λ = 1; §3.3): the hands lead on their tempo T, the shape's `handTempo` at the intensity or, when
 *   that is null, D_f; σ = (t − t_r)/T and the slope follows them, θ = θ_top + (θ_c − θ_top)·σ². Closed-form, so not
 *   tabulated where the tempo is given.
 * - Between them the plan lasts D = (1 − λ)·D_f + λ·T. At u = τ/D (τ from the release) the slope's progress is
 *   (1 − λ)·σ_f(u·D_f) + λ·u² and the hands' (1 − λ)·σ_f(u·D_f) + λ·u, with their rates and accelerations by the
 *   chain rule, tabulated every FREE_STEP over D, the last sample at contact. Both ends are computed directly, so that
 *   the free swing and the held slope keep their bits; the blend converges to each.
 * - Wherever the hands hold the slope (λ > 0) the couple they must supply, τ_c = I_P·α + W·sin θ + M·d·(A·t̂) − τ_p(ω),
 *   is bounded at every sample by the grip's couple C (requiredCouple). The free swing needs none by construction.
 */
import { headLowestPoint } from "../impact/contacts";
import { rotate } from "../impact/rigidBody";
import {
    FREE_STEP,
    downswingAt,
    downswingHands,
    downswingSamples,
    downswingTime,
    swingOrientation,
    type Pendulum,
} from "../impact/track";
import type { Downswing, MalletHead } from "../impact/types";
import { atan2, sinCos } from "../math/elementary";
import { ZERO, add, dot, scale, sub, vec3, type Vec3 } from "../math/vec3";
import type { SwingEffort, SwingShape } from "./types";

/**
 * The furthest the shaft may be taken back (rad from vertical): horizontal. A modelling bound (design §3.2), the
 * ceiling of the body's θ_max (`DownswingInput.backswingLimit`).
 */
export const MAX_BACK_ANGLE = Math.PI / 2;

/** The longest downswing (s) before it is rejected (design §3.4). A modelling bound: no stroke falls for 2 s. */
export const MAX_FALL = 2;

const UP = vec3(0, 0, 1);

/**
 * The grip's couple's parts (P2b.2b.2c.3a design §4.1): the top and bottom hands' grips γ_T and g_B, in (0, 1], each
 * hand's force limit F_max (N) and the hands' spread r − b (m) along the shaft.
 */
export interface GripCouple {
    readonly top: number;
    readonly bottom: number;
    readonly limit: number;
    readonly spread: number;
}

/** What planDownswing needs: the stroke's contact pose and pendulum, its shape and the player's choice. */
export interface DownswingInput {
    /** Unit, horizontal. */
    readonly aim: Vec3;
    /** θ_c (rad, −lean) and the top hand at contact, P_c. */
    readonly thetaContact: number;
    readonly pivot: Vec3;
    /** ℓ_h = ρ + r (m): the head centre's distance from the top hand. */
    readonly lever: number;
    readonly pendulum: Pendulum;
    readonly shape: SwingShape;
    /** h (m), the head centre's height at the top above its height at contact, and the intensity in [0, 1]. */
    readonly backswing: number;
    /** θ_max (rad from vertical, in (0, MAX_BACK_ANGLE]): the body's limit on every backswing. */
    readonly backswingLimit: number;
    /** The player's effort (the body's τ_0 and ω_max), on every stroke. */
    readonly effort: SwingEffort;
    readonly intensity: number;
    /** The hands' arc's slope dz/ds at contact (≤ 0; P2b.2b.2b.2b design §4.1); 0 arrives level. */
    readonly arrival: number;
    /** λ in [0, 1], the planned slope (P2b.2b.2c.3a design §4.1). */
    readonly slopeHold: number;
    /**
     * C (N·m): the largest couple the grip holds the slope with, min(γ_T, g_B)·F_max·(r − b) of `grip`. The value
     * planDownswing checks requiredCouple against, wherever λ > 0.
     */
    readonly couple: number;
    /** C's parts, read only to name them in the message when a plan exceeds `couple`. */
    readonly grip: GripCouple;
}

/** A planned downswing and the path's state at contact. */
export interface PlannedDownswing {
    readonly downswing: Downswing;
    /** ω₀ (rad/s), the pendulum's rate at contact. */
    readonly omega: number;
    /** V_c (m/s), the hands' velocity at contact. */
    readonly handsVelocity: Vec3;
}

function fail(message: string): never {
    throw new RangeError(message);
}

/**
 * The player's torque (N·m) on the shaft at intensity `intensity` and angular speed `omega` (rad/s): the linear law
 * i·τ_0·max(0, 1 − ω/ω_max) (P2b.2b.2c.1 design §4.4). Exactly +0 at intensity 0 and at or beyond ω_max, never
 * negative: more effort never slows the swing. Never −0 either, because the integrator's sums keep the sign of zero
 * and the gravity-only swing must stay bit-identical.
 */
export function effortTorque(effort: SwingEffort, intensity: number, omega: number): number {
    if (!(intensity > 0) || !(omega < effort.speed)) {
        return 0;
    }
    return intensity * effort.torque * (1 - omega / effort.speed);
}

/**
 * The couple τ_c = I_P·α + W·sin θ + M·d·(A·t̂) − τ_p(ω) (N·m) the hands must supply along `down`, planned for `input`
 * (P2b.2b.2c.3a design §4.1): its largest magnitude over the downswing's samples (downswingSamples) and its time (s
 * from contact). A the hands' acceleration (downswingHands), t̂ = aim·cos θ + ẑ·sin θ.
 */
export function requiredCouple(input: DownswingInput, down: Downswing): { readonly peak: number; readonly at: number } {
    const { weight, inertial, inertia } = input.pendulum;
    let peak = 0;
    let at = 0;
    const n = downswingSamples(down);
    for (let k = 0; k < n; k++) {
        const t = downswingTime(down, k);
        const swing = downswingAt(down, t);
        const hands = downswingHands(down, t, swing);
        const [s, c] = sinCos(swing.theta);
        const along = add(scale(input.aim, c), scale(UP, s));
        const torque = effortTorque(input.effort, input.intensity, swing.omega);
        const couple = inertia * swing.alpha + weight * s + inertial * dot(hands.A, along) - torque;
        if (Math.abs(couple) > peak) {
            peak = Math.abs(couple);
            at = t;
        }
    }
    return { peak, at };
}

/**
 * Plans the downswing of `input` (design §3.2–§3.4; P2b.2b.2c.3a design §4.1). Throws a RangeError for a backswing
 * beyond the body's limit θ_max; a plan that needs the free swing (λ < 1, or a null tempo) whose pendulum does not
 * swing (pendulumShare 0); a non-positive effective inertia, a stall (ω falling to zero or below before θ_c), or a fall
 * beyond MAX_FALL; and, for λ > 0, a couple the grip cannot hold. Every other input is taken as checked (buildContact).
 */
export function planDownswing(input: DownswingInput): PlannedDownswing {
    const { aim, thetaContact, pivot, lever, shape, backswing, intensity, slopeHold: lambda } = input;
    const share = shape.pendulumShare;
    const [, cosContact] = sinCos(thetaContact);
    const c = cosContact - (share * backswing) / lever;
    const limit = input.backswingLimit;
    const [, cosMax] = sinCos(limit);
    if (c < cosMax) {
        fail(
            `the backswing takes the shaft beyond the body's backswing limit θ_max = ${limit} rad (where the shaft ` +
                `meets the groin): a ${backswing} m backswing with pendulumShare ${share} on a ${lever} m pendulum`,
        );
    }
    // A share of 0 holds the slope: the pendulum stays at θ_c.
    const thetaTop = share > 0 ? 0 - atan2(Math.sqrt(1 - c * c), c) : thetaContact;
    const span = thetaContact - thetaTop;
    let across = ZERO;
    let drop = ZERO;
    if (share < 1) {
        const [sp, cp] = sinCos(shape.handAngle);
        const reach = ((1 - share) * backswing) / sp;
        across = scale(aim, reach * cp);
        drop = vec3(0, 0, 0 - reach * sp);
    }
    const handsTop = sub(sub(pivot, across), drop);
    // P2b.2b.2b.2b design §4.1: the vertical Hermite's end slope dP_z/dσ = 2·|Δ_h|·arrival, so that the hands'
    // velocity at contact runs along the arc's tangent.
    const rise = 2 * Math.sqrt(dot(across, across)) * input.arrival;
    const top: Top = { thetaTop, span, handsTop, across, drop };
    const { handTempo } = shape;
    if (lambda === 1 && handTempo !== null) {
        const { slow, fast } = handTempo;
        return held(input, top, vec3(0, 0, rise), slow + intensity * (fast - slow));
    }
    if (!(span > 0)) {
        fail(
            `a downswing that lets the shaft swing (slopeHold ${lambda}), or that has no hands' tempo to hold it on, ` +
                "needs its pendulum to swing: pendulumShare must be positive",
        );
    }
    // A level arrival keeps the free swing's table as it was, its tangent ZERO.
    const free = freeSwing(input, top, rise === 0 ? ZERO : vec3(0, 0, rise));
    if (lambda === 0) {
        return free;
    }
    const fall = 0 - free.downswing.release;
    const tempo = handTempo === null ? fall : handTempo.slow + intensity * (handTempo.fast - handTempo.slow);
    if (lambda === 1) {
        return held(input, top, vec3(0, 0, rise), tempo);
    }
    return holdable(input, blend(free, lambda, tempo));
}

/** The backswing's top: θ_top, the span θ_c − θ_top (rad), the hands there and their travel Δ_h, Δ_z (m). */
interface Top {
    readonly thetaTop: number;
    readonly span: number;
    readonly handsTop: Vec3;
    readonly across: Vec3;
    readonly drop: Vec3;
}

/** `planned` if the grip holds its couple (requiredCouple against C), else a RangeError naming the couple's parts. */
function holdable(input: DownswingInput, planned: PlannedDownswing): PlannedDownswing {
    const { peak, at } = requiredCouple(input, planned.downswing);
    if (!(peak <= input.couple)) {
        const { top, bottom, limit, spread } = input.grip;
        fail(
            `the grip cannot hold the planned slope (slopeHold ${input.slopeHold}): it needs a couple of ${peak} N·m ` +
                `${0 - at} s before contact, beyond C = min(γ_T, g_B)·F_max·(r − b) = ${input.couple} N·m with ` +
                `γ_T = ${top}, g_B = ${bottom}, F_max = ${limit} N and the hands' spread r − b = ${spread} m`,
        );
    }
    return planned;
}

/** The held slope (λ = 1) on the hands' tempo `tempo` (s), closed-form, with the Hermite term `tangent`. */
function held(input: DownswingInput, top: Top, tangent: Vec3, tempo: number): PlannedDownswing {
    const { thetaTop, span, handsTop, across, drop } = top;
    const downswing: Downswing = {
        release: 0 - tempo,
        thetaTop,
        span,
        handsTop,
        across,
        drop,
        tangent,
        tempo,
        theta: [],
        omega: [],
        alpha: [],
    };
    return holdable(input, {
        downswing,
        omega: (2 * span) / tempo,
        handsVelocity: scale(add(scale(across, 2), tangent), 1 / tempo),
    });
}

/** The free swing (λ = 0), tabulated, its hands carrying the Hermite term `tangent` where it is non-zero. */
function freeSwing(input: DownswingInput, top: Top, tangent: Vec3): PlannedDownswing {
    const { aim, thetaContact, intensity } = input;
    const { thetaTop, span, handsTop, across, drop } = top;
    const { weight, inertial, inertia } = input.pendulum;
    const { effort } = input;
    const hermite = tangent.z !== 0;
    // §3.3: (I_P + M·d·(P′·t̂)/span)·θ̈ = −W·sin θ − M·d·(P″·t̂)·σ̇² + τ_p, σ̇ = ω/span. Fails where the
    // effective inertia (the bracket) is not positive, at every step and at contact. τ_p is +0 at intensity 0, as the
    // pulse it replaces was, so the sum keeps today's bits there.
    const accelOrFail = (theta: number, omega: number): number => {
        const [s, co] = sinCos(theta);
        const sigma = (theta - thetaTop) / span;
        let slope = add(scale(across, 2 * sigma), scale(drop, 6 * sigma - 6 * sigma * sigma));
        let bend = add(scale(across, 2), scale(drop, 6 - 12 * sigma));
        if (hermite) {
            slope = add(slope, scale(tangent, 3 * sigma * sigma - 2 * sigma));
            bend = add(bend, scale(tangent, 6 * sigma - 2));
        }
        const along = add(scale(aim, co), scale(UP, s));
        const coefficient = inertia + (inertial * dot(slope, along)) / span;
        if (!(coefficient > 0)) {
            fail(
                `the downswing's effective inertia is not positive (${coefficient} kg·m² at θ = ${theta} rad): the ` +
                    "hands' backswing moves too steeply for the pendulum",
            );
        }
        const rate = omega / span;
        const torque = effortTorque(effort, intensity, omega);
        return (0 - weight * s - inertial * dot(bend, along) * rate * rate + torque) / coefficient;
    };
    const theta: number[] = [thetaTop];
    const omega: number[] = [0];
    const alpha: number[] = [];
    let th = thetaTop;
    let om = 0;
    for (let k = 0; ; k++) {
        const tau = k * FREE_STEP;
        const a = accelOrFail(th, om);
        alpha.push(a);
        const omNext = om + a * FREE_STEP;
        const thNext = th + omNext * FREE_STEP;
        if (!(omNext > 0)) {
            fail(
                `the downswing stalls ${tau} s after the release, at θ = ${th} rad, short of θ_c = ` +
                    `${thetaContact} rad`,
            );
        }
        if (thNext >= thetaContact) {
            const f = (thetaContact - th) / (thNext - th);
            const fall = (k + f) * FREE_STEP;
            const omegaContact = om + f * (omNext - om);
            theta.push(thetaContact);
            omega.push(omegaContact);
            alpha.push(accelOrFail(thetaContact, omegaContact));
            const downswing: Downswing = {
                release: 0 - fall,
                thetaTop,
                span,
                handsTop,
                across,
                drop,
                tangent,
                tempo: null,
                theta,
                omega,
                alpha,
            };
            const handsVelocity = hermite
                ? scale(add(scale(across, 2), tangent), omegaContact / span)
                : scale(across, (2 * omegaContact) / span);
            return { downswing, omega: omegaContact, handsVelocity };
        }
        if ((k + 1) * FREE_STEP > MAX_FALL) {
            fail(`the downswing takes more than ${MAX_FALL} s to reach contact`);
        }
        th = thNext;
        om = omNext;
        theta.push(th);
        omega.push(om);
    }
}

/**
 * The plan between the free swing `free` and the held slope on `tempo` (s) at 0 < λ < 1 (P2b.2b.2c.3a design §4.1):
 * over D = (1 − λ)·D_f + λ·T, at u = τ/D, the slope's progress (1 − λ)·σ_f(u·D_f) + λ·u² and the hands' (1 − λ)·σ_f +
 * λ·u, σ_f read from the free table at u·D_f; their rates by the chain rule, σ̇_f = ω_f/span and σ̈_f = α_f/span.
 */
function blend(free: PlannedDownswing, lambda: number, tempo: number): PlannedDownswing {
    const fd = free.downswing;
    const { thetaTop, span, tangent, across } = fd;
    const fall = 0 - fd.release;
    const keep = 1 - lambda;
    const duration = keep * fall + lambda * tempo;
    const r = fall / duration;
    const n = Math.ceil(duration / FREE_STEP) + 1;
    const theta: number[] = [];
    const omega: number[] = [];
    const alpha: number[] = [];
    const sigma: number[] = [];
    const rate: number[] = [];
    const accel: number[] = [];
    for (let k = 0; k < n; k++) {
        const last = k === n - 1;
        const u = last ? 1 : (k * FREE_STEP) / duration;
        const f = downswingAt(fd, last ? 0 : fd.release + u * fall);
        const progress = (f.theta - thetaTop) / span;
        // The last sample is contact exactly, as the free table's is.
        theta.push(
            last ? (fd.theta[fd.theta.length - 1] as number) : thetaTop + span * (keep * progress + lambda * u * u),
        );
        omega.push(keep * f.omega * r + (lambda * 2 * span * u) / duration);
        alpha.push(keep * f.alpha * r * r + (lambda * 2 * span) / (duration * duration));
        sigma.push(last ? 1 : keep * progress + lambda * u);
        rate.push(keep * (f.omega / span) * r + lambda / duration);
        accel.push(keep * (f.alpha / span) * r * r);
    }
    const downswing: Downswing = {
        ...fd,
        release: 0 - duration,
        theta,
        omega,
        alpha,
        handsProgress: { sigma, rate, accel },
    };
    const arrive = rate[n - 1] as number;
    const handsVelocity = tangent.z === 0 ? scale(across, 2 * arrive) : scale(add(scale(across, 2), tangent), arrive);
    return { downswing, omega: omega[n - 1] as number, handsVelocity };
}

/** The downswing's closest approach to the turf (design §3.5). */
export interface DownswingScan {
    /** The head's lowest clearance above the turf (m), negative where it is below it, and when (s before contact). */
    readonly clearance: number;
    readonly before: number;
    /** The first time (s from contact) the head is below the turf, or null if it never is. */
    readonly grounded: number | null;
}

/**
 * Scans the downswing `down` of `head` swung on `aim` about a top hand `radius` from its socket (design §3.5): the
 * head at every sample (downswingSamples), placed on the path as headOnPath places it, its lowest point against the
 * turf plane, less `lowering`'s z (m) at the sample, u s from contact (u ≤ 0), if given: a dip under way before
 * contact (P2b.2b.2c.2d design §4.2).
 */
export function scanDownswing(
    down: Downswing,
    head: MalletHead,
    aim: Vec3,
    radius: number,
    lowering?: (u: number) => number,
): DownswingScan {
    let clearance = Infinity;
    let before = 0;
    let grounded: number | null = null;
    const n = downswingSamples(down);
    for (let k = 0; k < n; k++) {
        const t = downswingTime(down, k);
        const swing = downswingAt(down, t);
        const hands = downswingHands(down, t, swing);
        const [s, c] = sinCos(swing.theta);
        const socket = add(hands.P, scale(sub(scale(aim, s), scale(UP, c)), radius));
        const orientation = swingOrientation(aim, swing.theta);
        const position = sub(socket, rotate(orientation, head.socket));
        const lowest = headLowestPoint({ position, orientation, velocity: ZERO, angularVelocity: ZERO }, head);
        const z = lowering === undefined ? lowest : lowest - lowering(t);
        if (z < clearance) {
            clearance = z;
            before = 0 - t;
        }
        if (grounded === null && z < 0) {
            grounded = t;
        }
    }
    return { clearance, before, grounded };
}
