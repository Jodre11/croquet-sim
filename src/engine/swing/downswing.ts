/**
 * The downswing (P2b.2b.2a design §3): from the backswing's top, where the pendulum and the hands are at rest, to the
 * planned contact, with no contact on the way.
 * - The top (§3.2): `pendulumShare` s of the backswing's height h raises the head about the hands, θ_top =
 *   −arccos(cos θ_c − s·h/ℓ_h); the hands start back and up along handAngle φ, d_h·sin φ = (1 − s)·h.
 * - The hands (§3.3) follow P(σ) = P_b + Δ_h·σ² + Δ_z·(3σ² − 2σ³), starting from rest; in swing mode they arrive
 *   level, in carry mode on the hands' arc, through the Hermite term T·(σ³ − σ²) (P2b.2b.2b.2b design §4.1).
 * - Swing mode (§3.1, §3.4): the pendulum leads and σ = (θ − θ_top)/(θ_c − θ_top). I_P·θ̈ = −W·sin θ (W of
 *   pendulumOf) − M·d·(A·t̂) + τ_p(ω) is solved for θ̈ with A = P″·σ̇² + P′·σ̈, and integrated by semi-implicit Euler
 *   every FREE_STEP until θ first reaches θ_c, the crossing step cut by linear interpolation in θ. The effort τ_p is
 *   the player's, a torque–velocity law linear in ω, a simplification of Hill's hyperbolic force–velocity relation
 *   (Hill 1938; P2b.2b.2c.1 design §4.4): τ_p = i·τ_0·max(0, 1 − ω/ω_max) with the body's τ_0 and ω_max
 *   (effortTorque). It steps on at the top and acts until contact, falling as the swing speeds up, so effort gives
 *   diminishing returns and the tempo follows from it; at intensity 0 it is +0 and the swing is gravity's alone.
 * - Carry mode (§3.3): the hands lead on their own tempo T_h(i), σ = (t − t_r)/T_h, and the slope follows them, θ =
 *   θ_top + (θ_c − θ_top)·σ²; closed-form, so not tabulated (plan, "Decisions made while planning").
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
import type { Downswing, MalletHead, StrokeMode } from "../impact/types";
import { atan2, sinCos } from "../math/elementary";
import { ZERO, add, dot, scale, sub, vec3, type Vec3 } from "../math/vec3";
import type { SwingEffort, SwingShape } from "./types";

/**
 * The furthest the shaft may be taken back (rad from vertical): horizontal. A modelling bound (design §3.2). Carry
 * mode's limit and the ceiling of the body's θ_max (swing mode's, `DownswingInput.backswingLimit`).
 */
export const MAX_BACK_ANGLE = Math.PI / 2;

/** The longest downswing (s) before it is rejected (design §3.4). A modelling bound: no stroke falls for 2 s. */
export const MAX_FALL = 2;

const UP = vec3(0, 0, 1);

/** What planDownswing needs: the stroke's contact pose and pendulum, its shape and the player's choice. */
export interface DownswingInput {
    readonly mode: StrokeMode;
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
    /**
     * θ_max (rad from vertical, in (0, π/2]): the body's limit on a swing-mode backswing. Carry mode keeps
     * MAX_BACK_ANGLE.
     */
    readonly backswingLimit: number;
    /** The player's effort in swing mode (the body's τ_0 and ω_max). Carry mode never reads it. */
    readonly effort: SwingEffort;
    readonly intensity: number;
    /** The hands' arc's slope dz/ds at contact (≤ 0; P2b.2b.2b.2b design §4.1). Carry mode only; 0 arrives level. */
    readonly arrival: number;
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
 * Plans the downswing of `input` (design §3.2–§3.4). Throws a RangeError for a backswing beyond the body's limit θ_max
 * (swing mode) or MAX_BACK_ANGLE (carry mode), a carry-mode downswing with no hands' tempo, a swing-mode downswing
 * whose pendulum does not swing (pendulumShare 0), a non-positive effective inertia, a stall (ω falling to zero or
 * below before θ_c), or a fall beyond MAX_FALL. Every other input is taken as checked (buildContact).
 */
export function planDownswing(input: DownswingInput): PlannedDownswing {
    const { mode, aim, thetaContact, pivot, lever, shape, backswing, intensity } = input;
    const share = shape.pendulumShare;
    const [, cosContact] = sinCos(thetaContact);
    const c = cosContact - (share * backswing) / lever;
    const limit = mode === "swing" ? input.backswingLimit : MAX_BACK_ANGLE;
    const [, cosMax] = sinCos(limit);
    if (c < cosMax) {
        const detail = `a ${backswing} m backswing with pendulumShare ${share} on a ${lever} m pendulum`;
        fail(
            mode === "swing"
                ? `the backswing takes the shaft beyond the body's backswing limit θ_max = ${limit} rad (where the ` +
                      `shaft meets the groin): ${detail}`
                : `the backswing takes the shaft beyond ${limit} rad from vertical: ${detail}`,
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
    if (mode === "carry") {
        if (shape.handTempo === null) {
            fail("a carry-mode downswing needs the hands' tempo: handTempo is null");
        }
        const { slow, fast } = shape.handTempo;
        const tempo = slow + intensity * (fast - slow);
        // P2b.2b.2b.2b design §4.1: the vertical Hermite's end slope dP_z/dσ = 2·|Δ_h|·arrival, so that the hands'
        // velocity at contact, (2·Δ_h + T)/tempo, runs along the arc's tangent.
        const tangent = vec3(0, 0, 2 * Math.sqrt(dot(across, across)) * input.arrival);
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
        return {
            downswing,
            omega: (2 * span) / tempo,
            handsVelocity: scale(add(scale(across, 2), tangent), 1 / tempo),
        };
    }
    if (!(span > 0)) {
        fail("a swing-mode downswing needs its pendulum to swing: pendulumShare must be positive");
    }
    const { weight, inertial, inertia } = input.pendulum;
    const { effort } = input;
    // §3.3: (I_P + M·d·(P′·t̂)/span)·θ̈ = −W·sin θ − M·d·(P″·t̂)·σ̇² + τ_p, σ̇ = ω/span. Fails where the
    // effective inertia (the bracket) is not positive, at every step and at contact. τ_p is +0 at intensity 0, as the
    // pulse it replaces was, so the sum keeps today's bits there.
    const accelOrFail = (theta: number, omega: number): number => {
        const [s, co] = sinCos(theta);
        const sigma = (theta - thetaTop) / span;
        const slope = add(scale(across, 2 * sigma), scale(drop, 6 * sigma - 6 * sigma * sigma));
        const bend = add(scale(across, 2), scale(drop, 6 - 12 * sigma));
        const tangent = add(scale(aim, co), scale(UP, s));
        const coefficient = inertia + (inertial * dot(slope, tangent)) / span;
        if (!(coefficient > 0)) {
            fail(
                `the downswing's effective inertia is not positive (${coefficient} kg·m² at θ = ${theta} rad): the ` +
                    "hands' backswing moves too steeply for the pendulum",
            );
        }
        const rate = omega / span;
        const torque = effortTorque(effort, intensity, omega);
        return (0 - weight * s - inertial * dot(bend, tangent) * rate * rate + torque) / coefficient;
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
                tangent: ZERO,
                tempo: null,
                theta,
                omega,
                alpha,
            };
            return { downswing, omega: omegaContact, handsVelocity: scale(across, (2 * omegaContact) / span) };
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
 * turf plane.
 */
export function scanDownswing(down: Downswing, head: MalletHead, aim: Vec3, radius: number): DownswingScan {
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
        const z = headLowestPoint({ position, orientation, velocity: ZERO, angularVelocity: ZERO }, head);
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
