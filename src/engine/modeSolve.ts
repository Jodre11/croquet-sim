/**
 * Mode selection for one group of touching bodies (P2a.2 design §4 steps 2–7).
 *
 * A candidate (contactModel.ts) whose directions are all known is one linear solve. Unknown directions — a ball
 * released from rest, a turf slip or a contact slip that starts — are closed by residual-merit Newton on one angle per
 * direction: minimise ½‖r‖² with Armijo backtracking and accept only a converged root that every followed quantity
 * agrees with (FOLLOW_EPSILON). The starts, in order: four cheap starts (the seed and its quarter turns); for at most
 * two directions a forward scan, whose best four points start Newton again; then continuation in the contact friction
 * (μ scaled to 1e-3 of its value, then 0.1, 0.25, 0.5, 0.75 and 1, each seeded from the previous root). The scan must
 * stay behind the cheap starts, or it rejects genuine releases just past a limit of holding.
 *
 * Undetermined forces (a singular but consistent system) are the minimum-norm forces satisfying every convex
 * condition of the candidate (convexSolve.ts); every acceptance check is run again after that choice.
 */
import { solveConvex } from "./convexSolve";
import {
    FOLLOW_EPSILON,
    assemble,
    buildModel,
    cones,
    directionItems,
    evaluate,
    inconsistency,
    settled,
    vectorLinear,
    vectorValue,
    type BallMode,
    type Candidate,
    type ContactGeometry,
    type ContactMode,
    type DirectionItem,
    type Evaluated,
    type Model,
    type System,
    type VectorForm,
} from "./contactModel";
import { solveFactored, solveLinear, solveSystem, type Factored, type Work } from "./linalg";
import { atan2, sinCos } from "./math/elementary";
import { ZERO, dot, length, normalize, scale, sub, vec3, type Vec3 } from "./math/vec3";

/** Iteration cap of one Newton run. */
export const NEWTON_ITERATIONS = 60;

/** Halvings of a Newton step before its line search gives up. */
export const ARMIJO_HALVINGS = 30;

/** Sufficient decrease of the merit function in the line search (Armijo's constant). */
const ARMIJO_C = 1e-4;

/** Newton has converged once its step (rad) is at most this. A numerical tolerance. */
export const NEWTON_STEP_TOLERANCE = 1e-11;

/** Friction scales of the continuation (design §4 step 4). */
const CONTINUATION = [1e-3, 0.1, 0.25, 0.5, 0.75, 1] as const;

/** Points of the forward scan: 24 directions for one unknown, 12 × 12 for two. */
const SCAN_ONE = 24;
const SCAN_TWO = 12;

/** Step (rad) of the forward-difference Jacobian used where the null space moves a followed rate. */
const SENSITIVITY_STEP = 1e-7;

/**
 * A null-space vector couples to a followed rate when it changes the rate by more than this times its own size (at
 * least 1). A numerical tolerance.
 */
const COUPLING_TOLERANCE = 1e-9;

/** Test seam: with failDirections set, every direction root is rejected, to reach the approximate-slip fallback. */
export interface SolveHooks {
    readonly failDirections?: boolean;
}

export type Failure = "none" | "singular" | "direction" | "inconsistent";

/** The outcome of solving one candidate. */
export interface CandidateOutcome {
    readonly ok: boolean;
    /** "direction": no accepted direction root (the approximate-slip fallback's input). */
    readonly failure: Failure;
    readonly reason: string;
    /** The candidate, settled. */
    readonly cand: Candidate;
    readonly items: readonly DirectionItem[];
    /** One unit direction per item (empty when the direction solve failed). */
    readonly directions: readonly Vec3[];
    readonly sys: System | null;
    readonly x: readonly number[] | null;
    readonly ev: Evaluated | null;
    /** The smallest largest |r_j| (m/s²) any Newton run at full friction reached; 0 with no direction items. */
    readonly residual: number;
}

interface Solved {
    readonly x: number[];
    readonly nullDim: number;
    readonly lu: Factored | null;
}

function norm(v: readonly number[]): number {
    let squares = 0;
    for (const e of v) {
        squares += e * e;
    }
    return Math.sqrt(squares);
}

/**
 * Solves a candidate's system. A singular but consistent system leaves forces undetermined; they are taken as the
 * minimum-norm forces satisfying every convex condition (design §4 step 5). While Newton searches (final false), a
 * null space that leaves every followed rate unchanged cannot move the root, so the unconstrained minimum-norm
 * solution stands in and the forces are settled once, at the accepted root; one that couples to a followed rate (a
 * sliding ball jammed against three or more bodies) is settled at every evaluation.
 */
function solveX(model: Model, cand: Candidate, sys: System, final: boolean, work: Work): Solved | null {
    const solution = solveSystem(sys.A, sys.b, work);
    if (!solution) {
        return null;
    }
    if (solution.basis.length === 0) {
        return { x: solution.x, nullDim: 0, lu: solution.lu };
    }
    const coupled = solution.basis.some((v) =>
        sys.follow.some((f) => length(vectorLinear(f, v)) > COUPLING_TOLERANCE * Math.max(1, norm(v))),
    );
    if (!final && !coupled) {
        return { x: solution.x, nullDim: solution.basis.length, lu: null };
    }
    const r = solveConvex(cones(model, cand, sys), solution.x, solution.basis, work);
    return { x: r.x, nullDim: solution.basis.length, lu: null };
}

function direction(phi: number, it: DirectionItem): Vec3 {
    const [s, c] = sinCos(phi);
    return vec3(c * it.e1.x + s * it.e2.x, c * it.e1.y + s * it.e2.y, c * it.e1.z + s * it.e2.z);
}

function angle(d: Vec3, it: DirectionItem): number {
    return atan2(dot(d, it.e2), dot(d, it.e1));
}

/** The candidate solved for given angles: its system, solution, residuals, followed rates and directions. */
interface Point {
    readonly sys: System;
    readonly x: number[];
    readonly r: number[];
    readonly w: Vec3[];
    readonly d: Vec3[];
    readonly nullDim: number;
    /** The factorisation of a regular system, reused for the Jacobian's right-hand sides. */
    readonly lu: Factored | null;
}

function pointAt(
    model: Model,
    cand: Candidate,
    items: readonly DirectionItem[],
    phi: readonly number[],
    work: Work,
): Point | null {
    const d = items.map((it, j) => direction(phi[j] as number, it));
    const sys = assemble(model, cand, items, d);
    const solved = solveX(model, cand, sys, false, work);
    if (!solved) {
        return null;
    }
    const w = sys.follow.map((f) => vectorValue(f, solved.x));
    const r = items.map((it, j) => dot(direction((phi[j] as number) + Math.PI / 2, it), w[j] as Vec3));
    return { sys, x: solved.x, r, w, d, nullDim: solved.nullDim, lu: solved.lu };
}

function merit(r: readonly number[]): number {
    return 0.5 * r.reduce((s, v) => s + v * v, 0);
}

interface Run {
    readonly converged: boolean;
    readonly phi: number[];
    readonly point: Point | null;
    /** Largest |r_j| at the run's last point; Infinity when it never solved. */
    readonly residual: number;
}

/** One residual-merit Newton run from the given angles. */
function newton(
    model: Model,
    cand: Candidate,
    items: readonly DirectionItem[],
    start: readonly number[],
    work: Work,
): Run {
    let phi = [...start];
    let point = pointAt(model, cand, items, phi, work);
    const done = (converged: boolean): Run => ({
        converged,
        phi,
        point,
        residual: point ? Math.max(0, ...point.r.map(Math.abs)) : Infinity,
    });
    if (!point) {
        return done(false);
    }
    const zeros = items.map(() => ZERO);
    // The system with every direction zero; the system is linear in each direction, so ∂/∂φ_k of A and b is the system
    // for the turned direction less this one. Assembled lazily: only the exact Jacobian needs it.
    let base: System | null = null;
    for (let iteration = 0; iteration < NEWTON_ITERATIONS; iteration++) {
        const p: Point = point;
        if (p.w.some((w) => length(w) <= FOLLOW_EPSILON)) {
            // forward() rejects a point whose followed rate is this small (d·w ≤ |w| ≤ FOLLOW_EPSILON). The residual
            // r_j = p_j·w_j vanishes with w_j, so the run has fallen into the merit's spurious root at w_j = 0, not one
            // forward() can accept: stop it here and leave the root to the remaining starts.
            return done(false);
        }
        const J = items.map(() => new Array<number>(items.length).fill(0));
        if (p.nullDim > 0) {
            // x(φ) is the minimum-norm choice here, so differentiate numerically.
            for (let k = 0; k < items.length; k++) {
                const q = pointAt(
                    model,
                    cand,
                    items,
                    phi.map((v, j) => (j === k ? v + SENSITIVITY_STEP : v)),
                    work,
                );
                if (!q) {
                    return done(false);
                }
                for (let j = 0; j < items.length; j++) {
                    (J[j] as number[])[k] = ((q.r[j] as number) - (p.r[j] as number)) / SENSITIVITY_STEP;
                }
            }
        } else {
            base ??= assemble(model, cand, items, zeros);
            const z: System = base;
            for (let k = 0; k < items.length; k++) {
                const turned = zeros.map((zero, j) =>
                    j === k ? direction((phi[k] as number) + Math.PI / 2, items[k] as DirectionItem) : zero,
                );
                const sk = assemble(model, cand, items, turned);
                const rhs = sk.b.map((bv, row) => {
                    let s = bv - (z.b[row] as number);
                    const skRow = sk.A[row] as number[];
                    const zRow = z.A[row] as number[];
                    for (let col = 0; col < p.x.length; col++) {
                        s -= ((skRow[col] as number) - (zRow[col] as number)) * (p.x[col] as number);
                    }
                    return s;
                });
                const dx = p.lu ? solveFactored(p.lu, rhs, work) : (solveSystem(p.sys.A, rhs, work)?.x ?? null);
                if (!dx) {
                    return done(false);
                }
                for (let j = 0; j < items.length; j++) {
                    const pj = direction((phi[j] as number) + Math.PI / 2, items[j] as DirectionItem);
                    const dw = vectorLinear(p.sys.follow[j] as VectorForm, dx);
                    (J[j] as number[])[k] = dot(pj, dw) - (j === k ? dot(p.d[j] as Vec3, p.w[j] as Vec3) : 0);
                }
            }
        }
        const step = solveLinear(
            J,
            p.r.map((v) => 0 - v),
            work,
        );
        if (!step) {
            return done(false);
        }
        const size = Math.max(...step.map(Math.abs));
        const m0 = merit(p.r);
        let t = 1;
        let next: Point | null = null;
        let nextPhi = phi;
        for (let halving = 0; halving < ARMIJO_HALVINGS; halving++, t /= 2) {
            const trial = phi.map((v, j) => v + t * (step[j] as number));
            const q = pointAt(model, cand, items, trial, work);
            if (q && merit(q.r) <= (1 - 2 * ARMIJO_C * t) * m0) {
                next = q;
                nextPhi = trial;
                break;
            }
        }
        if (size <= NEWTON_STEP_TOLERANCE) {
            // Converged: take the step if it helps, else keep the point.
            if (next) {
                point = next;
                phi = nextPhi;
            }
            return done(true);
        }
        if (!next) {
            return done(m0 === 0);
        }
        point = next;
        phi = nextPhi;
    }
    return done(false);
}

/** The model with every contact's friction scaled by s (the continuation). */
function scaledModel(model: Model, s: number): Model {
    return buildModel(
        model.bodies,
        model.axes,
        model.contacts.map((c) => ({ ...c, friction: c.friction * s })),
        model.gravity,
    );
}

/** The direction search of design §4 step 4: an accepted point, or none with the best residual reached. */
function findDirections(
    model: Model,
    cand: Candidate,
    items: readonly DirectionItem[],
    seed: (it: DirectionItem) => Vec3,
    work: Work,
    hooks: SolveHooks,
): { readonly point: Point | null; readonly residual: number; readonly reason: string } {
    const forward = (pt: Point): boolean =>
        !hooks.failDirections &&
        items.every(
            (_, j) =>
                dot(pt.d[j] as Vec3, pt.w[j] as Vec3) > FOLLOW_EPSILON &&
                Math.abs(pt.r[j] as number) <= FOLLOW_EPSILON * length(pt.w[j] as Vec3),
        );
    let residual = Infinity;
    const tryStarts = (starts: readonly (readonly number[])[]): Point | null => {
        for (const start of starts) {
            const run = newton(model, cand, items, start, work);
            residual = Math.min(residual, run.residual);
            if (run.converged && run.point && forward(run.point)) {
                return run.point;
            }
        }
        return null;
    };
    // 1. Cheap starts: the seed and its quarter turns.
    const phi0 = items.map((it) => angle(seed(it), it));
    const quarters = [0, Math.PI / 2, -Math.PI / 2, Math.PI].map((off) => phi0.map((p) => p + off));
    const cheap = tryStarts(quarters);
    if (cheap) {
        return { point: cheap, residual, reason: "" };
    }
    // 2. Forward scan (at most two directions): with no point where every direction is followed forwards there is no
    // root to find; otherwise Newton starts again from the best four points.
    if (items.length <= 2) {
        const per = items.length === 1 ? SCAN_ONE : SCAN_TWO;
        const total = items.length === 1 ? per : per * per;
        const scored: { readonly phi: number[]; readonly m: number }[] = [];
        for (let code = 0; code < total; code++) {
            const phi = items.map((_, j) => {
                const k = (j === 0 ? code : Math.floor(code / per)) % per;
                return (2 * Math.PI * (k + 0.5)) / per;
            });
            const pt = pointAt(model, cand, items, phi, work);
            if (pt && items.every((_, j) => dot(pt.d[j] as Vec3, pt.w[j] as Vec3) > 0)) {
                scored.push({
                    phi,
                    m: merit(pt.r.map((r, j) => r / Math.max(1e-300, length(pt.w[j] as Vec3)))),
                });
            }
        }
        if (scored.length === 0) {
            return { point: null, residual, reason: "scan: no forward direction" };
        }
        scored.sort((p, q) => p.m - q.m);
        const scanned = tryStarts(scored.slice(0, 4).map((s) => s.phi));
        if (scanned) {
            return { point: scanned, residual, reason: "" };
        }
    }
    // 3. Continuation in the contact friction, from each cheap start.
    for (const start of quarters) {
        let current: readonly number[] = start;
        let last: Point | null = null;
        for (const s of CONTINUATION) {
            const run = newton(s === 1 ? model : scaledModel(model, s), cand, items, current, work);
            if (s === 1) {
                residual = Math.min(residual, run.residual);
            }
            if (!run.converged || !run.point || !forward(run.point)) {
                last = null;
                break;
            }
            current = run.phi;
            last = run.point;
        }
        if (last) {
            return { point: last, residual, reason: "" };
        }
    }
    return { point: null, residual, reason: "no converged forward root" };
}

/**
 * Solves one settled candidate exactly and checks it (design §4 steps 4–5). Unknown directions are seeded from `seed`.
 */
export function solveCandidate(
    model: Model,
    cand: Candidate,
    seed: (it: DirectionItem) => Vec3,
    work: Work,
    hooks: SolveHooks = {},
): CandidateOutcome {
    const items = directionItems(model, cand);
    const failed = (failure: Failure, reason: string, residual: number): CandidateOutcome => ({
        ok: false,
        failure,
        reason,
        cand,
        items,
        directions: [],
        sys: null,
        x: null,
        ev: null,
        residual,
    });
    let sys: System;
    let directions: readonly Vec3[] = [];
    let residual = 0;
    if (items.length === 0) {
        sys = assemble(model, cand, [], []);
    } else {
        const found = findDirections(model, cand, items, seed, work, hooks);
        residual = found.residual;
        if (!found.point) {
            return failed("direction", found.reason, residual);
        }
        sys = found.point.sys;
        directions = found.point.d;
    }
    const solved = solveX(model, cand, sys, true, work);
    if (!solved) {
        return failed("singular", "inconsistent system", residual);
    }
    const ev = evaluate(sys, solved.x);
    const back = items.findIndex(
        (_, j) => dot(directions[j] as Vec3, vectorValue(sys.follow[j] as VectorForm, solved.x)) <= FOLLOW_EPSILON,
    );
    const bad =
        back >= 0 ? `direction ${back} not followed after the forces were settled` : inconsistency(model, cand, ev);
    return {
        ok: bad === null,
        failure: bad === null ? "none" : "inconsistent",
        reason: bad ?? "ok",
        cand,
        items,
        directions,
        sys,
        x: solved.x,
        ev,
        residual,
    };
}

/**
 * The approximate-slip last resort (design §4 step 7) for a settled candidate whose direction solve failed: each
 * contact that starts to slip slips along the tangential force it carries when it sticks, and each ball whose turf
 * slip starts slips against the static turf friction it needs when it rolls (or, at rest, is held). Null when the
 * candidate also releases a ball from rest (not covered) or either solve fails.
 */
export function fallbackSlip(model: Model, cand: Candidate, work: Work): CandidateOutcome | null {
    const items = directionItems(model, cand);
    if (items.some((it) => it.kind === "release")) {
        return null;
    }
    const onset = (kind: DirectionItem["kind"], index: number): boolean =>
        items.some((it) => it.kind === kind && it.index === index);
    const stuck = settled(model, {
        balls: cand.balls.map((m, i): BallMode =>
            onset("turf-onset", i) ? (model.classes[i] === "rolling" ? "turf-rolling" : "held") : m,
        ),
        contacts: cand.contacts.map((m, k): ContactMode => (onset("contact-onset", k) ? "stick" : m)),
    });
    const stuckSys = assemble(model, stuck, [], []);
    const stuckX = solveX(model, stuck, stuckSys, true, work);
    if (!stuckX) {
        return null;
    }
    const stuckEv = evaluate(stuckSys, stuckX.x);
    const dirs = items.map((it) => {
        if (it.kind === "contact-onset") {
            const n = (model.geometry[it.index] as ContactGeometry).n;
            const P = stuckEv.force[it.index] as Vec3;
            return normalize(sub(P, scale(n, dot(P, n))));
        }
        return scale(normalize(stuckEv.turf[it.index] as Vec3), -1);
    });
    if (dirs.some((d) => length(d) === 0)) {
        return null;
    }
    const sys = assemble(model, cand, items, dirs);
    const solved = solveX(model, cand, sys, true, work);
    if (!solved) {
        return null;
    }
    const ev = evaluate(sys, solved.x);
    const bad = inconsistency(model, cand, ev);
    return {
        ok: bad === null,
        failure: bad === null ? "none" : "inconsistent",
        reason: bad ?? "ok",
        cand,
        items,
        directions: dirs,
        sys,
        x: solved.x,
        ev,
        residual: 0,
    };
}
