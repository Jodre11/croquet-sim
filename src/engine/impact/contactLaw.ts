/**
 * The contact law of the impact phase (P2b.1 design §4): a linear spring–dashpot (Kelvin–Voigt) normal force, clamped
 * so that it never pulls, whose damping is solved from the sourced restitution; and Cundall–Strack tangential
 * friction, a spring–slider with true sticking.
 *
 * Clamped linear dashpot (Schwager and Pöschel, "Coefficient of restitution and linear–dashpot model revisited",
 * Granular Matter 9, 2007). For m·δ'' + c·δ' + k·δ = 0 from δ = 0, δ' = v, with ω₀ = √(k/m) and ζ = c/(2·√(k·m)), the
 * contact releases when its force k·δ + c·δ' falls to zero, at ω₀·T = τ(ζ):
 *   ζ < 1:  τ = atan2(2ζ·w, 2ζ² − 1) / w,   w = √(1 − ζ²)
 *   ζ = 1:  τ = 2
 *   ζ > 1:  τ = 2·ln(ζ + s) / s,            s = √(ζ² − 1)
 * and in every branch the velocity at release is −v·exp(−ζ·τ), so ln e = −ζ·τ(ζ). The underdamped form is the paper's
 * π − arctan(2ζw / (1 − 2ζ²)), written with atan2 so that one expression covers both sides of ζ = 1/√2; the overdamped
 * form is its ln((ζ + s)/(ζ − s))/s, using (ζ − s) = 1/(ζ + s) to avoid cancellation at large ζ. The release condition
 * is linear in v, so e does not depend on the impact speed. ζ·τ(ζ) increases strictly from 0 towards infinity, so the
 * ζ giving a restitution is found by bisection on ln e, which needs no exp.
 */
import { atan2, ln } from "../math/elementary";
import { length, scale, sub, type Vec3 } from "../math/vec3";

/** k_t/k, a contact's tangential stiffness relative to its normal stiffness (Silbert et al. 2001; contact.json). */
export const TANGENTIAL_STIFFNESS_RATIO = 2 / 7;

/**
 * Upper end of the damping-ratio bisection. A numerical bound, not physical: e(ζ) ≈ 1/(4ζ²) for large ζ, so
 * e(ZETA_MAX) ≈ 2.5e-13, below any restitution a contact is given (pre-flight: 2.50e-13).
 */
export const ZETA_MAX = 1e6;

/** ω₀·T: the clamped law's contact duration in units of 1/ω₀, for damping ratio ζ ≥ 0. */
export function contactTimeFactor(zeta: number): number {
    if (zeta < 1) {
        const w = Math.sqrt(1 - zeta * zeta);
        return atan2(2 * zeta * w, 2 * zeta * zeta - 1) / w;
    }
    if (zeta === 1) {
        return 2;
    }
    // ζ² − 1 as (ζ − 1)(ζ + 1), and ln(ζ + s) as ln(1 + x) with x = (ζ − 1) + s: just above ζ = 1, ζ + s rounds
    // away most of s and ln(ζ + s)/s loses up to half its digits, which breaks dampingRatio's round trip at ζ ≈ 1.
    const s = Math.sqrt((zeta - 1) * (zeta + 1));
    return (2 * log1p(zeta - 1 + s)) / s;
}

/**
 * ln(1 + x) to a few ulps for small x ≥ 0 (Goldberg, "What every computer scientist should know about floating-point
 * arithmetic", 1991, Theorem 4): with u = 1 ⊕ x, ln(u)·x/(u − 1) cancels the rounding of u.
 */
function log1p(x: number): number {
    const u = 1 + x;
    if (u === 1) {
        return x;
    }
    return (ln(u) * x) / (u - 1);
}

/** ln e of the clamped law at damping ratio ζ: −ζ·τ(ζ). */
export function lnRestitution(zeta: number): number {
    return 0 - zeta * contactTimeFactor(zeta);
}

/**
 * The damping ratio whose clamped law has restitution `restitution` ∈ (0, 1]: 0 for 1, ZETA_MAX for anything at or
 * below e(ZETA_MAX). Bisects on ln e until the bracket's ends are adjacent doubles, so the result is deterministic.
 */
export function dampingRatio(restitution: number): number {
    if (restitution >= 1) {
        return 0;
    }
    const target = ln(restitution);
    if (lnRestitution(ZETA_MAX) >= target) {
        return ZETA_MAX;
    }
    let lo = 0;
    let hi = ZETA_MAX;
    for (;;) {
        const mid = lo + (hi - lo) / 2;
        if (mid <= lo || mid >= hi) {
            return lo;
        }
        if (lnRestitution(mid) > target) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
}

/** The coefficients of one contact: normal stiffness and damping, tangential stiffness and damping, and friction. */
export interface PairLaw {
    readonly stiffness: number;
    readonly damping: number;
    readonly tangentialStiffness: number;
    readonly tangentialDamping: number;
    readonly friction: number;
}

function pairLaw(massEff: number, zeta: number, stiffness: number, friction: number): PairLaw {
    const tangentialStiffness = TANGENTIAL_STIFFNESS_RATIO * stiffness;
    return {
        stiffness,
        damping: 2 * zeta * Math.sqrt(stiffness * massEff),
        tangentialStiffness,
        tangentialDamping: 2 * zeta * Math.sqrt(tangentialStiffness * massEff),
        friction,
    };
}

/**
 * The law of a pair with reduced mass `massEff` whose central collision lasts `contactTime` (s) with `restitution`:
 * ω₀ = τ(ζ)/T, k = m·ω₀², c = 2ζ·m·ω₀ (design §4). Restitution is exact for central collisions.
 */
export function lawFromContactTime(
    massEff: number,
    restitution: number,
    contactTime: number,
    friction: number,
): PairLaw {
    const zeta = dampingRatio(restitution);
    const omega = contactTimeFactor(zeta) / contactTime;
    return pairLaw(massEff, zeta, massEff * omega * omega, friction);
}

/** The law of a pair with reduced mass `massEff`, normal stiffness `stiffness` (N/m) and `restitution`. */
export function lawFromStiffness(massEff: number, restitution: number, stiffness: number, friction: number): PairLaw {
    return pairLaw(massEff, dampingRatio(restitution), stiffness, friction);
}

/** Normal force (N) of a closed contact with penetration `depth` > 0, closing at `rate` (m/s; negative opening). */
export function normalForce(law: PairLaw, depth: number, rate: number): number {
    return Math.max(0, law.stiffness * depth + law.damping * rate);
}

/** A contact's tangential force on body B, its elastic displacement after the step, and whether it slid. */
export interface Tangential {
    readonly force: Vec3;
    readonly spring: Vec3;
    readonly sliding: boolean;
}

/**
 * Cundall–Strack friction. `spring` is the elastic tangential displacement ξ carried into this step, already projected
 * onto the current tangent plane and advanced by slip·dt; `slip` is the tangential velocity of B's contact point
 * relative to A's. The trial force −k_t·ξ − c_t·slip is kept while it lies within the Coulomb cone μ·N: the contact
 * sticks, truly, with no creep. Otherwise it slides: the force is scaled onto the cone and ξ is reset so that the
 * spring alone carries it, −k_t·ξ = force (Cundall and Strack 1979). A sliding contact then stores at most
 * (μ·N)²/(2·k_t). Resetting to −(force + c_t·slip)/k_t instead would leave the spring holding a displacement that only
 * cancels the dashpot (millimetres for a ball sliding on the turf), energy no motion could ever return.
 */
export function tangentialForce(law: PairLaw, spring: Vec3, slip: Vec3, normal: number): Tangential {
    const trial = sub(scale(spring, 0 - law.tangentialStiffness), scale(slip, law.tangentialDamping));
    const size = length(trial);
    const limit = law.friction * normal;
    if (size <= limit) {
        return { force: trial, spring, sliding: false };
    }
    const force = scale(trial, limit / size);
    return { force, spring: scale(force, -1 / law.tangentialStiffness), sliding: true };
}
