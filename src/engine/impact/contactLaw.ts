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
 *
 * The face–ball law (P2b.2b.2b.2a design §3) is Hertzian, F = √δ·(k·δ + c·δ′), clamped at zero (Kuwabara and Kono
 * 1987; Brilliantov et al. 1996). Scaled by the reduced mass m, k and the closing speed U (length L = (m·U²/k)^{2/5},
 * time L/U), it has one parameter, the dimensionless damping ĉ = c·L^{3/2}/(m·U). Its central collision's e(ĉ) and
 * duration τ(ĉ) follow by integration (hertzBounce). A closure at U takes ĉ and τ from a table over U, built once from
 * Gugan's wood fits, and sets L = U·T(U)/τ, k = m·U²/L^{5/2} and c = ĉ·m·U/L^{3/2}, so that the fits hold.
 */
import { contactReference } from "../../reference/index";
import { atan2, ln, pow } from "../math/elementary";
import { dot, length, scale, sub, type Vec3 } from "../math/vec3";
import type { FaceLaw } from "./types";

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

/**
 * A tangential spring ξ carried into a step (P2b.2b.2b.2a design §3.5, §4.3; plan decision 2): projected onto the
 * tangent plane of unit normal `normal`, then, if its stiffness has grown from `before` to `now`, scaled by
 * before/now. The force it carries then does not grow, and its stored energy ½·k_t·ξ² never rises without slip. A
 * stiffness that shrinks keeps ξ, so the force and the energy fall with it. A spring loaded from rest (`before` 0) is
 * kept. A linear law's stiffness never changes, so its pairs are as before.
 */
export function carrySpring(spring: Vec3, normal: Vec3, before: number, now: number): Vec3 {
    const carried = sub(spring, scale(normal, dot(spring, normal)));
    return now > before && before > 0 ? scale(carried, before / now) : carried;
}

const RESTITUTION_FIT = contactReference.faceRestitutionFit.coefficients as {
    readonly a: number;
    readonly b: number;
    readonly p: number;
};
const TIME_FIT = contactReference.faceContactTimeFit.coefficients as {
    readonly t0: number;
    readonly u0: number;
    readonly q: number;
};

/** The face fits' speed range (m/s): a closure's speed is clamped to it (design §3.3). */
export const FACE_SPEED_MIN = contactReference.faceRestitutionFit.range[0];
export const FACE_SPEED_MAX = contactReference.faceRestitutionFit.range[1];

/** Gugan's restitution of a wooden face at closing speed U (m/s): √(1 − (a + b·U^p)). */
export function faceRestitutionAt(speed: number): number {
    return Math.sqrt(1 - (RESTITUTION_FIT.a + RESTITUTION_FIT.b * pow(speed, RESTITUTION_FIT.p)));
}

/** Gugan's contact time (s) of a wooden face at closing speed U (m/s): t0·(U/u0)^q. */
export function faceContactTimeAt(speed: number): number {
    return TIME_FIT.t0 * pow(speed / TIME_FIT.u0, TIME_FIT.q);
}

/** A dimensionless central collision: its restitution, and its duration in units of L/U. */
export interface HertzBounce {
    readonly restitution: number;
    readonly duration: number;
}

/**
 * Step of the dimensionless integration, in units of L/U. Numerical, not physical: RK4 at this step agrees with one at
 * 1e-5 to 1e-6 in e and 6e-7 relative in τ over ĉ ∈ [0, 1] (pre-flight). The force's √x is not smooth at the touch,
 * which costs RK4 its order in the first steps, but at ĉ ≈ 0.2 that error is below 1e-5.
 */
const HERTZ_STEP = 2e-3;

/**
 * The clamped law's central collision at damping ĉ (design §3.4): x'' = −√x·(x + ĉ·x′) from x = 0, x′ = 1, by RK4,
 * until the force √x·(x + ĉ·x′) falls to zero. The release is interpolated linearly within its step, both its time
 * and the velocity at it, whose negative is e.
 */
export function hertzBounce(damping: number, step = HERTZ_STEP): HertzBounce {
    const accel = (x: number, v: number): number => (x > 0 ? 0 - Math.sqrt(x) * (x + damping * v) : 0);
    const h = step;
    let x = 0;
    let v = 1;
    let s = 0;
    let force = damping;
    for (;;) {
        const k1x = v;
        const k1v = accel(x, v);
        const k2x = v + (h / 2) * k1v;
        const k2v = accel(x + (h / 2) * k1x, v + (h / 2) * k1v);
        const k3x = v + (h / 2) * k2v;
        const k3v = accel(x + (h / 2) * k2x, v + (h / 2) * k2v);
        const k4x = v + h * k3v;
        const k4v = accel(x + h * k3x, v + h * k3v);
        const nx = x + (h / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
        const nv = v + (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
        // x + ĉ·x′ carries the force's sign while x > 0, and falls through zero at the release (at x = 0 if ĉ = 0).
        const next = nx + damping * nv;
        if (s > 0 && next <= 0) {
            const theta = force / (force - next);
            return { restitution: 0 - (v + theta * (nv - v)), duration: s + theta * h };
        }
        x = nx;
        v = nv;
        s += h;
        force = next;
    }
}

/**
 * Spacing (m/s) of the closure table's speed grid. Numerical, not physical: linear interpolation between its points
 * misses the fit's e by at most 3.3e-5 at mid-grid (pre-flight), within §5.1's 1e-4.
 */
const TABLE_SPACING = 0.1;

/** Bisection steps on ĉ: from a bracket of width 1, 2^-30 ≈ 1e-9, far below the table's interpolation error. */
const DAMPING_STEPS = 30;

interface TableRow {
    readonly damping: number;
    readonly duration: number;
}

/** The ĉ whose bounce has restitution `target`, by bisection on [0, hi], hi doubled from 1 until e(hi) ≤ target. */
function dampingFor(target: number): number {
    let lo = 0;
    let hi = 1;
    while (hertzBounce(hi).restitution > target) {
        hi *= 2;
    }
    for (let n = 0; n < DAMPING_STEPS; n++) {
        const mid = lo + (hi - lo) / 2;
        if (hertzBounce(mid).restitution > target) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    return lo + (hi - lo) / 2;
}

let table: readonly TableRow[] | null = null;

/**
 * The closure table (design §3.4; plan decision 5): ĉ(U) and τ(U) at U = FACE_SPEED_MIN + i·TABLE_SPACING, the last
 * point FACE_SPEED_MAX. Built once, on the first closure, from constants only, so every run reads the same table.
 */
function closureTable(): readonly TableRow[] {
    if (table !== null) {
        return table;
    }
    const count = Math.round((FACE_SPEED_MAX - FACE_SPEED_MIN) / TABLE_SPACING);
    const rows: TableRow[] = [];
    for (let i = 0; i <= count; i++) {
        const speed = i === count ? FACE_SPEED_MAX : FACE_SPEED_MIN + i * TABLE_SPACING;
        const damping = dampingFor(faceRestitutionAt(speed));
        rows.push({ damping, duration: hertzBounce(damping).duration });
    }
    table = rows;
    return rows;
}

/**
 * A face–ball contact's law from its closure until it opens (design §3.3): the closing speed U as met (m/s), the
 * Hertzian stiffness k (N/m^{3/2}) and damping c (N·s/m^{3/2}) set from U clamped to [FACE_SPEED_MIN,
 * FACE_SPEED_MAX], and the face's friction.
 */
export interface HertzClosure {
    readonly speed: number;
    readonly stiffness: number;
    readonly damping: number;
    readonly friction: number;
}

/**
 * Closes a face–ball pair of law `law` at closing speed `speed` (design §3.3): ĉ and τ interpolated linearly in the
 * clamped speed u, then L = u·T(u)/τ, k = m·u²/L^{5/2} and c = ĉ·m·u/L^{3/2}. A speed of zero or less, or NaN, takes
 * the slowest law.
 */
export function closeFace(law: FaceLaw, speed: number): HertzClosure {
    const u = speed > FACE_SPEED_MIN ? Math.min(speed, FACE_SPEED_MAX) : FACE_SPEED_MIN;
    const rows = closureTable();
    const at = (u - FACE_SPEED_MIN) / TABLE_SPACING;
    const i = Math.min(rows.length - 2, Math.floor(at));
    const f = at - i;
    const a = rows[i] as TableRow;
    const b = rows[i + 1] as TableRow;
    const damping = a.damping + (b.damping - a.damping) * f;
    const duration = a.duration + (b.duration - a.duration) * f;
    const L = (u * faceContactTimeAt(u)) / duration;
    const root = Math.sqrt(L);
    return {
        speed,
        stiffness: (law.mass * u * u) / (L * L * root),
        damping: (damping * law.mass * u) / (L * root),
        friction: law.friction,
    };
}

/** The face's normal force (N) at penetration `depth` > 0 closing at `rate` (m/s): √δ·(k·δ + c·δ′), clamped at 0. */
export function hertzForce(closure: HertzClosure, depth: number, rate: number): number {
    return Math.max(0, Math.sqrt(depth) * (closure.stiffness * depth + closure.damping * rate));
}

/**
 * The closed face's current linearised law at `depth` (design §3.5): the normal's tangent stiffness (3/2)·k·√δ and
 * damping c·√δ, k_t = TANGENTIAL_STIFFNESS_RATIO of that stiffness, c_t = c_n·√(k_t/k_n), and the friction.
 */
export function hertzTangent(closure: HertzClosure, depth: number): PairLaw {
    const root = Math.sqrt(depth);
    const stiffness = 1.5 * closure.stiffness * root;
    const damping = closure.damping * root;
    return {
        stiffness,
        damping,
        tangentialStiffness: TANGENTIAL_STIFFNESS_RATIO * stiffness,
        tangentialDamping: damping * Math.sqrt(TANGENTIAL_STIFFNESS_RATIO),
        friction: closure.friction,
    };
}

/** The face's stored elastic energy (J) at `depth`: (2/5)·k·δ^{5/2}. */
export function hertzEnergy(closure: HertzClosure, depth: number): number {
    return 0.4 * closure.stiffness * depth * depth * Math.sqrt(depth);
}
