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
import { excessAt, solveConvex } from "./convexSolve";
import {
    ACCELERATION_EPSILON,
    FOLLOW_EPSILON,
    ROLLING_WEIGHT,
    assemble,
    ballOptions,
    buildModel,
    candidateKey,
    cones,
    contactOptions,
    directionItems,
    evaluate,
    inconsistency,
    isStatic,
    lowLoad,
    settled,
    vectorLinear,
    vectorValue,
    type BallMode,
    type Candidate,
    type ContactBody,
    type ContactGeometry,
    type ContactMode,
    type DirectionItem,
    type Evaluated,
    type Model,
    type RestingContact,
    type System,
    type VectorForm,
} from "./contactModel";
import { solveFactored, solveLinear, solveSystem, type Factored, type Work } from "./linalg";
import { atan2, sinCos } from "./math/elementary";
import { ZERO, add, cross, dot, length, normalize, scale, sub, vec3, type Vec3 } from "./math/vec3";
import type { MotionPhase } from "./types";

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

/**
 * Candidates the group search may solve before giving up (design §4 step 6). The worst measured over 20,000 random
 * four-ball clusters with obstacles was 209; the cap leaves room above that and bounds the search where it has none.
 */
export const MODE_SEARCH_LIMIT = 1024;

/** Iteration cap of the frictionless guide that proposes the first candidate. */
const GUIDE_ITERATIONS = 5_000;

/** The guide stops once no contact force changes by more than this (m/s²) in a step. */
const GUIDE_TOLERANCE = 1e-12;

/** The proposal: a candidate and seed directions for its unknown directions. */
export interface Proposal {
    readonly candidate: Candidate;
    readonly seed: (it: DirectionItem) => Vec3;
}

/**
 * P2a.1's frictionless solve of the whole group, as the proposal (design §4 step 3, the μ = 0 limit). With each resting
 * ball's static resistance included, the accelerations minimise Σᵢ ½·wᵢ·|xᵢ − fᵢ|² + Σᵢ cᵢ·|xᵢ| subject to no contact
 * converging; its dual over contact forces N ≥ 0 is smooth: for given N each ball's acceleration is the soft threshold
 * xᵢ = shrink(fᵢ + gᵢ/wᵢ, cᵢ/wᵢ) of its free acceleration plus the contact push gᵢ = Σₖ Nₖ·Jₖᵢ, and the dual gradient
 * is −J·x. Projected gradient ascent with step 1/L (L ≥ largest row sum of J·W⁻¹·Jᵀ, at most 2·contacts) converges. A
 * resting ball whose soft threshold is not zero is released; a contact with force touching a moving ball is coupled.
 */
export function propose(model: Model): Proposal {
    const { bodies, contacts, geometry, classes, frozen } = model;
    const responses = bodies.map((b, i) => {
        const p = b.params;
        switch (classes[i] as MotionPhase) {
            case "sliding":
                return { force: scale(frozen[i] as Vec3, 0 - p.slidingDecel), weight: 1, threshold: 0 };
            case "rolling":
                return { force: scale(frozen[i] as Vec3, 0 - p.rollingDecel), weight: ROLLING_WEIGHT, threshold: 0 };
            case "stationary":
                return { force: ZERO, weight: ROLLING_WEIGHT, threshold: ROLLING_WEIGHT * p.rollingDecel };
            case "airborne":
                return { force: model.gravity, weight: 1, threshold: 0 };
        }
    });
    // Contact k's row for ball i: +n on b, −n on a; on the turf only its in-plane part (the turf takes the rest).
    const row = (k: number, i: number): Vec3 => {
        const c = contacts[k] as RestingContact;
        const n = (geometry[k] as ContactGeometry).n;
        const r = !c.fixed && c.b === i ? n : c.a === i ? scale(n, -1) : ZERO;
        if (classes[i] === "airborne") {
            return r;
        }
        const up = (bodies[i] as ContactBody).turfNormal;
        return sub(r, scale(up, dot(r, up)));
    };
    const forces = contacts.map(() => 0);
    const step = 1 / Math.max(1, 2 * contacts.length);
    const accelerations = (): Vec3[] =>
        bodies.map((_, i) => {
            const r = responses[i] as NonNullable<(typeof responses)[number]>;
            let push = ZERO;
            contacts.forEach((_c, k) => {
                push = add(push, scale(row(k, i), forces[k] as number));
            });
            const v = add(r.force, scale(push, 1 / r.weight));
            const size = length(v);
            const limit = r.threshold / r.weight;
            return size > limit ? scale(v, (size - limit) / size) : ZERO;
        });
    for (let iteration = 0; iteration < GUIDE_ITERATIONS; iteration++) {
        const x = accelerations();
        let change = 0;
        contacts.forEach((c, k) => {
            let opening = dot(row(k, c.a), x[c.a] as Vec3);
            if (!c.fixed) {
                opening += dot(row(k, c.b), x[c.b] as Vec3);
            }
            const next = Math.max(0, (forces[k] as number) - step * opening);
            change = Math.max(change, Math.abs(next - (forces[k] as number)));
            forces[k] = next;
        });
        if (change <= GUIDE_TOLERANCE) {
            break;
        }
    }
    const x = accelerations();
    // Dual ascent approaches a ball held exactly at its limit from the moving side, so tiny ones count as held.
    const released = classes.map((c, i) => c === "stationary" && length(x[i] as Vec3) > ACCELERATION_EPSILON);
    const moving = (i: number): boolean => classes[i] !== "stationary" || released[i] === true;
    const balls = classes.map((c, i): BallMode => {
        switch (c) {
            case "stationary":
                return released[i] ? "released" : "held";
            case "rolling":
                return "turf-rolling";
            case "sliding":
                return "turf-sliding";
            case "airborne":
                return "airborne";
        }
    });
    const modes = contacts.map((c, k): ContactMode => {
        if (!((forces[k] as number) > 0 && (moving(c.a) || (!c.fixed && moving(c.b))))) {
            return "open";
        }
        return c.friction === 0 || (geometry[k] as ContactGeometry).slipping ? "slip" : "stick";
    });
    const candidate = settled(model, { balls, contacts: modes });
    const seed = (it: DirectionItem): Vec3 => {
        let guess: Vec3;
        if (it.kind === "contact-onset") {
            // The contact points' relative acceleration (x_a − x_b) + R·(α_a + α_b) × n, with a rolling ball's spin
            // following its acceleration (R·α = normal × x). Without the spin a line pushed straight has no tangential
            // guess, though its contacts slip vertically.
            const c = contacts[it.index] as RestingContact;
            const n = (geometry[it.index] as ContactGeometry).n;
            const spin = (i: number): Vec3 =>
                balls[i] === "released" || balls[i] === "turf-rolling"
                    ? cross((bodies[i] as ContactBody).turfNormal, x[i] as Vec3)
                    : ZERO;
            const g = add(
                sub(x[c.a] as Vec3, c.fixed ? ZERO : (x[c.b] as Vec3)),
                cross(add(spin(c.a), c.fixed ? ZERO : spin(c.b)), n),
            );
            guess = sub(g, scale(n, dot(g, n)));
        } else {
            guess = x[it.index] as Vec3;
        }
        return length(guess) > 0 ? guess : it.e1;
    };
    return { candidate, seed };
}

export type GroupKind = "exact" | "approximate-slip" | "approximate-hold" | "budget-hold";

/** The decision for one group. */
export interface GroupSolution {
    readonly kind: GroupKind;
    /** The accepted candidate's solve (exact, approximate-slip); null when the group is to be held. */
    readonly outcome: CandidateOutcome | null;
    /** Candidates solved. */
    readonly tried: number;
    /**
     * approximate-slip: the failed direction solve's residual (m/s²); approximate-hold: how far holding every resting
     * ball misses its limits (the worst relaxed-cone excess at the best forces the hold-first solve found, m/s²;
     * Infinity when that configuration could not be solved at all); otherwise 0.
     */
    readonly excess: number;
    /** approximate-slip: the balls whose slip fell back (both balls of a contact, the ball of a turf slip). */
    readonly slipBalls: readonly number[];
}

interface SearchItem {
    readonly kind: "ball" | "contact";
    readonly index: number;
}

/**
 * Every candidate that departs from `proposal` in exactly `departures` items, in lexicographic order of the items'
 * mode ranks. Items are balls with more than one mode (in index order), then every contact. A contact between bodies
 * held in the candidate keeps the proposal's rank: settled() fixes its mode, so any other rank would only repeat a
 * candidate with fewer departures. With `holdResting`, every ball at rest keeps the proposal's mode (the hold-first
 * phase, whose proposal holds them all).
 */
function* departing(model: Model, proposal: Candidate, departures: number, holdResting: boolean): Generator<Candidate> {
    const items: SearchItem[] = [
        ...model.classes.flatMap((c, i) => (ballOptions(c).length > 1 ? [{ kind: "ball" as const, index: i }] : [])),
        ...model.contacts.map((_, k) => ({ kind: "contact" as const, index: k })),
    ];
    const options = items.map((it): readonly string[] =>
        it.kind === "ball" ? ballOptions(model.classes[it.index] as MotionPhase) : contactOptions(model, it.index),
    );
    const proposed = items.map((it, j) =>
        (options[j] as readonly string[]).indexOf(
            it.kind === "ball" ? (proposal.balls[it.index] as string) : (proposal.contacts[it.index] as string),
        ),
    );
    const ranks: number[] = [];
    const modeAt = (j: number): string => (options[j] as readonly string[])[ranks[j] as number] as string;
    // The ball modes chosen so far (ball items come first, so all of them are chosen once a contact is reached).
    const ballsNow = (): BallMode[] => {
        const balls = [...proposal.balls];
        items.forEach((it, j) => {
            if (it.kind === "ball" && j < ranks.length) {
                balls[it.index] = modeAt(j) as BallMode;
            }
        });
        return balls;
    };
    const build = (): Candidate => {
        const contacts = [...proposal.contacts];
        items.forEach((it, j) => {
            if (it.kind === "contact") {
                contacts[it.index] = modeAt(j) as ContactMode;
            }
        });
        return { balls: ballsNow(), contacts };
    };
    function* walk(j: number, left: number): Generator<Candidate> {
        if (j === items.length) {
            if (left === 0) {
                yield build();
            }
            return;
        }
        if (items.length - j < left) {
            return;
        }
        const item = items[j] as SearchItem;
        const fixed =
            (item.kind === "contact" && isStatic(model, ballsNow(), item.index)) ||
            (holdResting && item.kind === "ball" && model.classes[item.index] === "stationary");
        const count = (options[j] as readonly string[]).length;
        for (let r = 0; r < count; r++) {
            const departs = r === proposed[j] ? 0 : 1;
            if (departs > left || (fixed && departs === 1)) {
                continue;
            }
            ranks.push(r);
            yield* walk(j + 1, left - departs);
            ranks.pop();
        }
    }
    yield* walk(0, departures);
}

/**
 * Solves one group (design §4 steps 2–7): every candidate with every resting ball held first, then the proposal, then
 * every other candidate fewest departures from the proposal first; the first consistent candidate wins. A solved
 * candidate whose turf balls' loads drop to zero or below is followed at once by the same candidate with those balls
 * lifted (airborne). The budget is checked before each candidate: once work.units reaches it the group is to be held
 * (budget-hold). With nothing consistent, or the
 * search capped at MODE_SEARCH_LIMIT, the first candidate whose only failure was its direction solve is tried with
 * approximate-slip directions; failing that, the group is to be held (approximate-hold). The nearest hold itself is
 * the caller's (push.ts).
 */
export function solveGroup(model: Model, work: Work, budget: number, hooks: SolveHooks = {}): GroupSolution {
    const proposal = propose(model);
    const held = settled(model, heldCandidate(model, proposal.candidate));
    const heldKey = candidateKey(held);
    const seen = new Set<string>();
    const state: { tried: number; firstFailure: CandidateOutcome | null; held: CandidateOutcome | null } = {
        tried: 0,
        firstFailure: null,
        held: null,
    };
    const hold = (kind: GroupKind, excess: number): GroupSolution => ({
        kind,
        outcome: null,
        tried: state.tried,
        excess,
        slipBalls: [],
    });
    /**
     * Solves a candidate unless it was solved already; "cap" once MODE_SEARCH_LIMIT candidates have been solved,
     * "budget" once the budget is spent.
     */
    const attempt = (raw: Candidate): CandidateOutcome | "cap" | "budget" | null => {
        const cand = settled(model, raw);
        const key = candidateKey(cand);
        if (seen.has(key)) {
            return null;
        }
        if (state.tried >= MODE_SEARCH_LIMIT) {
            return "cap";
        }
        if (work.units >= budget) {
            return "budget";
        }
        seen.add(key);
        state.tried++;
        const out = solveCandidate(model, cand, proposal.seed, work, hooks);
        if (key === heldKey) {
            state.held = out;
        }
        if (!out.ok && out.failure === "direction" && state.firstFailure === null) {
            state.firstFailure = out;
        }
        // Lift-off (spec §5): balls whose load would be zero or below leave the turf, so the same candidate is solved
        // again with them airborne.
        const low = !out.ok && out.ev ? lowLoad(model, out.cand, out.ev) : [];
        if (low.length > 0) {
            const lifted = attempt({
                balls: out.cand.balls.map((m, i) => (low.includes(i) ? "airborne" : m)),
                contacts: out.cand.contacts,
            });
            if (lifted !== null) {
                return lifted;
            }
        }
        return out;
    };
    const exact = (out: CandidateOutcome): GroupSolution => ({
        kind: "exact",
        outcome: out,
        tried: state.tried,
        excess: 0,
        slipBalls: [],
    });
    const itemCount = model.classes.filter((c) => ballOptions(c).length > 1).length + model.contacts.length;
    /** Tries `base`, then every candidate departing from it, in order; a decision, or null when none is consistent. */
    const phase = (base: Candidate, holdResting: boolean): GroupSolution | null => {
        const first = attempt(base);
        if (first === "cap") {
            return null;
        }
        if (first === "budget") {
            return hold("budget-hold", 0);
        }
        if (first?.ok) {
            return exact(first);
        }
        for (let departures = 1; departures <= itemCount; departures++) {
            for (const cand of departing(model, base, departures, holdResting)) {
                const out = attempt(cand);
                if (out === "cap") {
                    return null;
                }
                if (out === "budget") {
                    return hold("budget-hold", 0);
                }
                if (out?.ok) {
                    return exact(out);
                }
            }
        }
        return null;
    };

    // Hold first: every candidate with every resting ball held, before any that releases one. Its first candidate,
    // the proposal with its resting balls held, is what the approximate-hold excess is measured on (attempt() keeps
    // its outcome in state.held).
    const holding = phase(held, true);
    if (holding) {
        return holding;
    }
    const searched = phase(proposal.candidate, false);
    if (searched) {
        return searched;
    }

    const failure = state.firstFailure;
    if (failure) {
        const fallback = fallbackSlip(model, failure.cand, work);
        if (fallback?.ok) {
            const slipBalls = new Set<number>();
            for (const it of fallback.items) {
                if (it.kind === "contact-onset") {
                    const c = model.contacts[it.index] as RestingContact;
                    slipBalls.add(c.a);
                    if (!c.fixed) {
                        slipBalls.add(c.b);
                    }
                } else {
                    slipBalls.add(it.index);
                }
            }
            return {
                kind: "approximate-slip",
                outcome: fallback,
                tried: state.tried,
                excess: failure.residual,
                slipBalls: [...slipBalls].sort((a, b) => a - b),
            };
        }
    }
    return hold("approximate-hold", state.held ? excessOf(model, state.held) : Infinity);
}

/** The proposal with every resting ball held: the hold-first candidate (design §4 step 2). */
function heldCandidate(model: Model, proposal: Candidate): Candidate {
    return {
        balls: proposal.balls.map((m, i) => (model.classes[i] === "stationary" ? "held" : m)),
        contacts: proposal.contacts,
    };
}

/** How far a solved candidate misses its convex conditions; Infinity when it could not be solved at all. */
function excessOf(model: Model, out: CandidateOutcome): number {
    return out.sys && out.x ? Math.max(0, excessAt(cones(model, out.cand, out.sys), out.x)) : Infinity;
}

/**
 * How far holding every resting ball of the group misses its limits (see GroupSolution.excess): 0 when the hold-first
 * candidate is consistent. The nearest-hold fallback reports it.
 */
export function holdExcess(model: Model, work: Work): number {
    const proposal = propose(model);
    const out = solveCandidate(model, settled(model, heldCandidate(model, proposal.candidate)), proposal.seed, work);
    return out.ok ? 0 : excessOf(model, out);
}
