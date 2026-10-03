/**
 * Second-order-cone feasibility and minimum norm by a logarithmic barrier (P2a.2 design §3; §4 steps 2 and 5).
 *
 * The unknowns are x = xp + B·z: a particular solution of a candidate's linear system plus any combination of a basis
 * B of its null space, so every x considered solves the system. Each condition is a cone ‖u(x)‖ ≤ v(x) + slack (with
 * no u: v(x) + slack ≥ 0), u and v affine. Phase 1 finds a z strictly inside every relaxed cone, or proves there is
 * none; phase 2 then minimises ‖x‖² from it. Both run Newton's method on a barrier with fixed iteration schedules, so
 * the result is deterministic. The line searches need values only, which is most of the evaluations.
 *
 * Work units (d variables, C cones): each Newton iteration costs 2·d³ + (C + 1)·d², its evaluation d³ + C·d² and its
 * linear solve d³ + d², plus d³ + d² for the damped retry when the Hessian is singular to the solver; each value-only
 * evaluation costs C·d, and the initial check of xp C·(m + 1) over the m null-space coordinates.
 */
import { ln } from "./math/elementary";
import { linearValue, solveLinear, valueOf, type Affine, type Work } from "./linalg";

/**
 * Relaxation (m/s²) of the contact and load conditions, so that the feasible set keeps an interior at a limit where
 * it would shrink to a point. A numerical tolerance, below FORCE_EPSILON, the acceptance tolerance.
 */
export const CONVEX_SLACK = 1e-10;

/** The condition ‖u(x)‖ ≤ v(x) + slack; with no u, v(x) + slack ≥ 0. */
export interface Cone {
    readonly u: readonly Affine[];
    readonly v: Affine;
    readonly slack: number;
}

/** Outcome of solveConvex. */
export interface ConvexResult {
    readonly x: number[];
    /**
     * Worst ‖u(x)‖ − v(x) − slack over the cones: at most 0 when x satisfies every relaxed cone. When the cones have
     * no common point it is the worst violation at phase 1's final point: an upper bound on the smallest worst
     * violation, of which only the sign is decided.
     */
    readonly excess: number;
}

/** The worst ‖u(x)‖ − v(x) − slack over the cones; −Infinity when there are none. */
export function excessAt(cones: readonly Cone[], x: readonly number[]): number {
    let worst = -Infinity;
    for (const c of cones) {
        let squares = 0;
        for (const f of c.u) {
            const value = valueOf(f, x);
            squares += value * value;
        }
        worst = Math.max(worst, Math.sqrt(squares) - valueOf(c.v, x) - c.slack);
    }
    return worst;
}

/** An affine form over the null-space coordinates z: a + g·z. */
interface ZForm {
    readonly a: number;
    readonly g: readonly number[];
}

interface ZCone {
    readonly u: readonly ZForm[];
    /** v + slack. */
    readonly v: ZForm;
}

function toZ(f: Affine, xp: readonly number[], basis: readonly (readonly number[])[], shift: number): ZForm {
    return { a: valueOf(f, xp) + shift, g: basis.map((b) => linearValue(f, b)) };
}

function zValue(f: ZForm, z: readonly number[]): number {
    let r = f.a;
    for (let j = 0; j < f.g.length; j++) {
        r += (f.g[j] as number) * (z[j] as number);
    }
    return r;
}

/**
 * Returns the minimum-norm x = xp + B·z subject to the cones (B's rows are `basis`), or, when the relaxed cones have no
 * common point, phase 1's final point (excess > 0), whose worst violation bounds the smallest from above.
 */
export function solveConvex(
    cones: readonly Cone[],
    xp: readonly number[],
    basis: readonly (readonly number[])[],
    work: Work,
): ConvexResult {
    const m = basis.length;
    const nx = xp.length;
    const count = cones.length;
    const zc: ZCone[] = cones.map((c) => ({
        u: c.u.map((f) => toZ(f, xp, basis, 0)),
        v: toZ(c.v, xp, basis, c.slack),
    }));
    const xOf = (z: readonly number[]): number[] =>
        xp.map((xi, i) => {
            let s = xi;
            for (let j = 0; j < m; j++) {
                s += ((basis[j] as readonly number[])[i] as number) * (z[j] as number);
            }
            return s;
        });
    const excess = (z: readonly number[]): number => {
        let worst = -Infinity;
        for (const c of zc) {
            let squares = 0;
            for (const f of c.u) {
                const value = zValue(f, z);
                squares += value * value;
            }
            worst = Math.max(worst, Math.sqrt(squares) - zValue(c.v, z));
        }
        return worst;
    };
    let z = new Array<number>(m).fill(0);
    work.units += count * (m + 1);
    let worst = excess(z);
    // Exact shortcut: xp is the unconstrained minimum-norm solution, so when it is feasible it is the answer.
    if (worst <= 0 || m === 0) {
        return { x: xOf(z), excess: worst };
    }
    // Per-cone gradients padded for phase 1, whose extra variable s enters every v with gradient 1.
    const gv1 = zc.map((c) => [...c.v.g, 1]);
    const gu1 = zc.map((c) => c.u.map((f) => [...f.g, 0]));
    const gram = basis.map((bj) => basis.map((bl) => bj.reduce((acc, b, i) => acc + b * (bl[i] as number), 0)));
    const scratch = new Array<number>(8).fill(0);
    const dphi = new Array<number>(m + 1).fill(0);
    const xBuffer = new Array<number>(nx).fill(0);
    // Phase 2's further relaxation of every cone (see there); phase 1's s enters every v in its place.
    let relax = 0;
    // The value at y = (z, s) (phase 1) or y = z (phase 2) of t·objective − Σ log(barrier); null outside the domain.
    // Identical arithmetic to evaluate()'s value.
    const value = (y: readonly number[], t: number, phase1: boolean): number | null => {
        work.units += count * y.length;
        const s = phase1 ? (y[m] as number) : relax;
        let f = 0;
        if (phase1) {
            f += t * s;
            for (let j = 0; j < m; j++) {
                f += t * 1e-12 * (y[j] as number) * (y[j] as number);
            }
        } else {
            for (let i = 0; i < nx; i++) {
                let v = xp[i] as number;
                for (let j = 0; j < m; j++) {
                    v += ((basis[j] as readonly number[])[i] as number) * (y[j] as number);
                }
                xBuffer[i] = v;
            }
            let squares = 0;
            for (let i = 0; i < nx; i++) {
                squares = squares + (xBuffer[i] as number) * (xBuffer[i] as number);
            }
            f += t * squares;
        }
        for (const c of zc) {
            const w = zValue(c.v, y) + s;
            if (w <= 0) {
                return null;
            }
            if (c.u.length === 0) {
                f -= ln(w);
                continue;
            }
            let squares = 0;
            for (const fu of c.u) {
                const uq = zValue(fu, y);
                squares = squares + uq * uq;
            }
            const phi = w * w - squares;
            if (phi <= 0) {
                return null;
            }
            f -= ln(phi);
        }
        return f;
    };
    // Value, gradient and Hessian of the same function.
    const evaluate = (
        y: readonly number[],
        t: number,
        phase1: boolean,
    ): { readonly f: number; readonly grad: number[]; readonly hess: number[][] } | null => {
        const dim = y.length;
        work.units += dim * dim * dim + count * dim * dim;
        const s = phase1 ? (y[m] as number) : relax;
        const grad = new Array<number>(dim).fill(0);
        const hess = Array.from({ length: dim }, () => new Array<number>(dim).fill(0));
        let f = 0;
        if (phase1) {
            f += t * s;
            grad[m] = (grad[m] as number) + t;
            for (let j = 0; j < m; j++) {
                const yj = y[j] as number;
                f += t * 1e-12 * yj * yj;
                grad[j] = (grad[j] as number) + 2 * t * 1e-12 * yj;
                (hess[j] as number[])[j] = ((hess[j] as number[])[j] as number) + 2 * t * 1e-12;
            }
        } else {
            const x = xOf(y);
            f += t * x.reduce((acc, v) => acc + v * v, 0);
            for (let j = 0; j < m; j++) {
                const bj = basis[j] as readonly number[];
                grad[j] = (grad[j] as number) + 2 * t * bj.reduce((acc, b, i) => acc + b * (x[i] as number), 0);
                const hj = hess[j] as number[];
                const gj = gram[j] as number[];
                for (let l = 0; l < m; l++) {
                    hj[l] = (hj[l] as number) + 2 * t * (gj[l] as number);
                }
            }
        }
        for (let ci = 0; ci < count; ci++) {
            const c = zc[ci] as ZCone;
            const w = zValue(c.v, y) + s;
            const gw = phase1 ? (gv1[ci] as number[]) : c.v.g;
            if (w <= 0) {
                return null;
            }
            if (c.u.length === 0) {
                f -= ln(w);
                const w2 = w * w;
                for (let a = 0; a < dim; a++) {
                    const ga = gw[a] as number;
                    grad[a] = (grad[a] as number) - ga / w;
                    const ha = hess[a] as number[];
                    for (let b = 0; b < dim; b++) {
                        ha[b] = (ha[b] as number) + (ga * (gw[b] as number)) / w2;
                    }
                }
                continue;
            }
            const nu = c.u.length;
            let squares = 0;
            for (let q = 0; q < nu; q++) {
                const uq = zValue(c.u[q] as ZForm, y);
                scratch[q] = uq;
                squares = squares + uq * uq;
            }
            const gu = phase1 ? (gu1[ci] as number[][]) : c.u.map((fu) => fu.g);
            const phi = w * w - squares;
            if (phi <= 0) {
                return null;
            }
            f -= ln(phi);
            for (let a = 0; a < dim; a++) {
                let d = 2 * w * (gw[a] as number);
                for (let q = 0; q < nu; q++) {
                    d = d - 2 * (scratch[q] as number) * ((gu[q] as readonly number[])[a] as number);
                }
                dphi[a] = d;
            }
            const phi2 = phi * phi;
            for (let a = 0; a < dim; a++) {
                grad[a] = (grad[a] as number) - (dphi[a] as number) / phi;
                const ha = hess[a] as number[];
                const ga = gw[a] as number;
                const da = dphi[a] as number;
                for (let b = 0; b < dim; b++) {
                    let d2 = 2 * ga * (gw[b] as number);
                    for (let q = 0; q < nu; q++) {
                        d2 -=
                            2 *
                            ((gu[q] as readonly number[])[a] as number) *
                            ((gu[q] as readonly number[])[b] as number);
                    }
                    ha[b] = (ha[b] as number) - d2 / phi + (da * (dphi[b] as number)) / phi2;
                }
            }
        }
        return { f, grad, hess };
    };
    // Damped Newton on the barrier function for parameter t: at most 100 steps, each halved up to 60 times until the
    // value falls by a quarter of the Newton decrement, stopping once half the decrement is at most 1e-12. `centred`
    // says y is on the central path as closely as the arithmetic allows: the decrement test stopped it, or the Newton
    // step can no longer lower the value beyond its rounding (the line search failed, or its last step passed only
    // because the value came out unchanged; on a large value this persists to the iteration cap). Never after a failed
    // evaluation or linear solve, after which y may be anywhere.
    const centre = (
        start: number[],
        t: number,
        phase1: boolean,
        stop?: (y: readonly number[]) => boolean,
    ): { readonly y: number[]; readonly centred: boolean } => {
        let y = start;
        let centred = false;
        for (let iteration = 0; iteration < 100; iteration++) {
            const e = evaluate(y, t, phase1);
            if (!e) {
                return { y, centred: false };
            }
            const minusGrad = e.grad.map((g) => 0 - g);
            let step = solveLinear(e.hess, minusGrad, work);
            if (!step) {
                // The Hessian is positive semidefinite, so it is singular to the solver only along directions whose
                // curvature is below the pivot tolerance times its largest entry (its largest diagonal entry): a
                // direction no cone depends on has only phase 1's 2t·1e-12 (phase 2's 2t·BᵀB), while the barrier's
                // curvature grows without bound as z nears the cones. Adding 1e-10 times that entry to the diagonal, a
                // thousand times the tolerance, makes every pivot clear it; the step is still a descent direction,
                // shortened only along directions of comparably negligible curvature.
                let top = 0;
                e.hess.forEach((row, a) => {
                    top = Math.max(top, row[a] as number);
                });
                const damped = e.hess.map((row, a) => row.map((h, b) => (a === b ? h + 1e-10 * top : h)));
                step = solveLinear(damped, minusGrad, work);
            }
            if (!step) {
                return { y, centred: false };
            }
            const direction = step;
            const decrement = 0 - e.grad.reduce((acc, g, i) => acc + g * (direction[i] as number), 0);
            if (decrement / 2 <= 1e-12) {
                return { y, centred: true };
            }
            let tau = 1;
            let moved = false;
            for (let halving = 0; halving < 60; halving++, tau /= 2) {
                const trial = y.map((v, i) => v + tau * (direction[i] as number));
                const ft = value(trial, t, phase1);
                if (ft !== null && ft <= e.f - 0.25 * tau * decrement) {
                    y = trial;
                    moved = true;
                    centred = ft === e.f;
                    break;
                }
            }
            if (!moved) {
                return { y, centred: true };
            }
            if (stop?.(y)) {
                return { y, centred };
            }
        }
        return { y, centred };
    };
    // Phase 1: minimise s subject to ‖u‖ ≤ v + slack + s, from a start strictly inside, until s < −CONVEX_SLACK/2 (a
    // strictly feasible z) or the central-path bound s − 2C/t > 0 proves there is none. The bound holds only at a
    // centred point, so it is not tested after any other exit from centre.
    let y = [...z, Math.max(0, worst) + 1];
    let t = 1;
    for (let outer = 0; outer < 40; outer++) {
        const centred = centre(y, t, true, (yy) => (yy[m] as number) < (0 - CONVEX_SLACK) / 2);
        y = centred.y;
        if ((y[m] as number) < (0 - CONVEX_SLACK) / 2) {
            break;
        }
        if (centred.centred && (y[m] as number) - (2 * count) / t > 0) {
            break;
        }
        t *= 10;
    }
    z = y.slice(0, m);
    worst = excess(z);
    if (worst > CONVEX_SLACK) {
        return { x: xOf(z), excess: worst };
    }
    // Phase 2: minimum norm, from z, whenever phase 1 found it feasible to within CONVEX_SLACK, thin feasible sets
    // included. The barrier needs a start strictly inside, so when z is not (the relaxed cones only nearly meet) every
    // cone is relaxed further, until z has a margin of CONVEX_SLACK/2; x may then miss its cones by up to that further
    // relaxation, at most 1.5·CONVEX_SLACK.
    relax = worst < 0 ? 0 : worst + CONVEX_SLACK / 2;
    t = 1;
    for (let outer = 0; outer < 8; outer++) {
        z = centre(z, t, false).y;
        t *= 100;
    }
    return { x: xOf(z), excess: excess(z) };
}
