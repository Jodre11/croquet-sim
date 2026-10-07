/**
 * The downswing (P2b.2b.2a design §3): from the backswing's top, where the pendulum and the hands are at rest, to the
 * planned contact, with no contact on the way.
 * - The top (§3.2): `pendulumShare` s of the backswing's height h raises the head about the hands, θ_top =
 *   −arccos(cos θ_c − s·h/ℓ_h); the hands start back and up along handAngle φ, d_h·sin φ = (1 − s)·h.
 * - The hands (§3.3) follow P(σ) = P_b + Δ_h·σ² + Δ_z·(3σ² − 2σ³), starting from rest and arriving level.
 * - Swing mode (§3.1, §3.4): the pendulum leads and σ = (θ − θ_top)/(θ_c − θ_top). I_P·θ̈ = −m·g·ℓ_h·sin θ − M·d·(A·t̂)
 *   + τ_p(t) is solved for θ̈ with A = P″·σ̇² + P′·σ̈, and integrated by semi-implicit Euler every FREE_STEP until θ
 *   first reaches θ_c, the crossing step cut by linear interpolation in θ. The effort τ_p is a bell-shaped pulse,
 *   i·τ_max·½·(1 − cos 2πu) over T(i) = T_slow + i·(T_fast − T_slow) from the release, clipped at contact.
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
import type { SwingShape } from "./types";

/** The furthest the shaft may be taken back (rad from vertical): horizontal. A modelling bound (design §3.2). */
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
    readonly intensity: number;
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
 * Plans the downswing of `input` (design §3.2–§3.4). Throws a RangeError for a backswing beyond MAX_BACK_ANGLE, a
 * swing-mode downswing whose pendulum does not swing (pendulumShare 0), a non-positive effective inertia, a stall
 * (ω falling to zero or below before θ_c), or a fall beyond MAX_FALL. Every other input is taken as checked
 * (buildContact).
 */
export function planDownswing(input: DownswingInput): PlannedDownswing {
    const { mode, aim, thetaContact, pivot, lever, shape, backswing, intensity } = input;
    const share = shape.pendulumShare;
    const [, cosContact] = sinCos(thetaContact);
    const c = cosContact - (share * backswing) / lever;
    const [, cosMax] = sinCos(MAX_BACK_ANGLE);
    if (c < cosMax) {
        fail(
            `the backswing takes the shaft beyond ${MAX_BACK_ANGLE} rad from vertical: a ${backswing} m backswing ` +
                `with pendulumShare ${share} on a ${lever} m pendulum`,
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
        const { slow, fast } = shape.handTempo;
        const tempo = slow + intensity * (fast - slow);
        const downswing: Downswing = {
            release: 0 - tempo,
            thetaTop,
            span,
            handsTop,
            across,
            drop,
            tempo,
            theta: [],
            omega: [],
            alpha: [],
        };
        return { downswing, omega: (2 * span) / tempo, handsVelocity: scale(across, 2 / tempo) };
    }
    if (!(span > 0)) {
        fail("a swing-mode downswing needs its pendulum to swing: pendulumShare must be positive");
    }
    const { weight, inertial, inertia } = input.pendulum;
    const { torqueMax, tempoSlow, tempoFast } = shape.effort;
    const pulse = tempoSlow + intensity * (tempoFast - tempoSlow);
    const peak = intensity * torqueMax;
    const effort = (tau: number): number => {
        const u = tau / pulse;
        if (!(peak > 0 && u >= 0 && u <= 1)) {
            return 0;
        }
        const [, cu] = sinCos(2 * Math.PI * u);
        return 0.5 * peak * (1 - cu);
    };
    // §3.3: (I_P + M·d·(P′·t̂)/span)·θ̈ = −m·g·ℓ_h·sin θ − M·d·(P″·t̂)·σ̇² + τ_p, σ̇ = ω/span.
    const accel = (theta: number, omega: number, tau: number): number => {
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
        return (0 - weight * s - inertial * dot(bend, tangent) * rate * rate + effort(tau)) / coefficient;
    };
    const theta: number[] = [thetaTop];
    const omega: number[] = [0];
    const alpha: number[] = [];
    let th = thetaTop;
    let om = 0;
    for (let k = 0; ; k++) {
        const tau = k * FREE_STEP;
        const a = accel(th, om, tau);
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
            alpha.push(accel(thetaContact, omegaContact, fall));
            const downswing: Downswing = {
                release: 0 - fall,
                thetaTop,
                span,
                handsTop,
                across,
                drop,
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
