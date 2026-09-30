/**
 * Resting contact and pushing (spec §5 phase 2).
 *
 * A contact slower than RESTING_SPEED is not bounced: with a ball driven into another by its own spin, bouncing
 * starts a Zeno sequence of ever-smaller rebounds that no event budget can finish. Instead the touching bodies' speeds
 * along each line of centres are made equal (a perfectly inelastic normal impulse) and, where their accelerations
 * would drive them together, the contacts are coupled: a compressive contact force N ≥ 0 keeps each coupled pair's
 * relative acceleration along its normal at zero. Coupled contacts are frictionless, so the bodies stay free to move
 * along the contact plane. This is a P1 limitation: balls that slide past each other while pushing (sidespin, pushes
 * at an angle) are not rubbed, which can move rest positions by centimetres. Straight pushes have no sideways slip at
 * the contact and are unaffected. The fix, kinetic Coulomb friction on coupled contacts with slip and stick events,
 * is deferred to P2 or later.
 *
 * Within one segment everything is constant, so every trajectory stays quadratic:
 * - Each contact normal is fixed for the segment. Relative motion is then always perpendicular to the normal, which
 *   can only open the gap (to second order), never close it; the segment ends when the gap opens past
 *   SEPARATION_TOLERANCE.
 * - Each ball's turf force is frozen at the segment start: sliding friction of magnitude slidingDecel against the slip
 *   (effective inertia m), or rolling resistance of magnitude rollingDecel against the direction of travel (effective
 *   inertia 7m/5, because static friction keeps a pushed rolling ball rolling: m + I/r² = 7m/5). A ball at rest stays
 *   put until the push on it exceeds (7m/5)·rollingDecel, like rolling resistance acting statically.
 * - The accelerations minimise Σ ½·wᵢ·|xᵢ − fᵢ|² over the one-sided contact constraints (Gauss's principle of least
 *   constraint; w is the effective inertia, f the free acceleration). The minimiser is found exactly by trying active
 *   sets of contacts in a fixed order and accepting the first whose contact forces are compressive and which leaves
 *   no other contact converging.
 *
 * A segment also ends when a frozen turf force stops being valid: the slip (sliding) or velocity (rolling) reaches
 * zero along the frozen direction, or turns more than DIRECTION_TOLERANCE away from it. The simulator then solves the
 * group again from the balls' new states.
 *
 * If no exact candidate is found (only ever within a hair of the limit of holding, where released accelerations are
 * vanishingly small), the group falls back to the nearest hold: its resting balls stay at rest and the moving balls
 * are solved against them as fixed obstacles. That problem always has a solution (see solveGroup), does no work
 * through the held balls, and differs from the exact one only by the tiny accelerations the held balls would have had.
 * No ball's motion is discarded.
 */
import { approachSpeed } from "./detect";
import { ZERO, add, dot, horizontal, length, normalize, scale, sub, vec3, type Vec3 } from "./math/vec3";
import { SPEED_EPSILON, classify, contactSlip, rollingSpin, type Trajectory } from "./motion";
import type { BallState, MotionParams, MotionPhase, PushMotion } from "./types";

/**
 * Contacts closing slower than this (m/s) are resting contacts, resolved without restitution. A numerical tolerance,
 * not a physical constant: a rebound this slow lifts the gap by at most RESTING_SPEED²/(2a), well under a micrometre
 * for any turf deceleration a, so treating it as inelastic changes no observable outcome.
 */
export const RESTING_SPEED = 1e-3;

/** Largest sine of the angle a pushed ball's slip or velocity may turn from its frozen direction within a segment. */
export const DIRECTION_TOLERANCE = 1e-2;

/** Gap (m) beyond which a coupled contact is considered to have separated. */
export const SEPARATION_TOLERANCE = 1e-7;

/** Relative accelerations (m/s²) at or below this are treated as zero when deciding whether bodies converge. */
export const ACCELERATION_EPSILON = 1e-9;

/** Pivots at or below this make a contact system singular: its contacts are not independent. */
const PIVOT_TOLERANCE = 1e-12;

/**
 * Iteration cap of the Newton solve for the rolling directions of balls pushed off from rest, and of each of its
 * backtracking searches; see releaseDirections.
 */
const RELEASE_ITERATIONS = 60;

/**
 * The release solve has converged once no released ball's Newton step is more than this fraction of its acceleration.
 * Convergence is quadratic by then, so after that step the directions are far more accurate than DIRECTION_TOLERANCE.
 * A ball whose acceleration is heading for zero takes steps comparable to its size, so it never passes.
 */
const RELEASE_TOLERANCE = 1e-4;

/**
 * Smallest fraction of its length that a released ball's acceleration keeps along its current direction in one step
 * of the release solve; see releaseDirections.
 */
const RELEASE_SHRINK = 0.25;

/**
 * Decreases of the release solve's objective (weight × (m/s²)²) at or below this are rounding: the residual of the
 * constraint rows in each Newton solve, times contact forces of order 1, is about this size.
 */
const RELEASE_FLOOR = 1e-13;

/** Effective inertia of a rolling solid sphere relative to its mass: (m + I/r²)/m with I = 2/5·m·r². */
const ROLLING_WEIGHT = 7 / 5;

/** A ball taking part in a resting-contact solve. */
export interface ContactBody {
    readonly state: BallState;
    readonly params: MotionParams;
}

/** A touching contact: ball `a` against ball `b`, or against the fixed cylinder whose axis is `axes[b]`. */
export interface RestingContact {
    readonly a: number;
    readonly b: number;
    readonly fixed: boolean;
}

/** A ball's state and motion as decided by the solver. `push` is null when the ball moves freely. */
export interface RestingMember {
    readonly state: BallState;
    readonly phase: MotionPhase;
    readonly push: PushMotion | null;
}

/** Outcome of a resting-contact solve. */
export interface RestingSolution {
    /** Per body: its new state and motion, or null when the solve leaves it untouched. */
    readonly members: readonly (RestingMember | null)[];
    /** Per contact: true when the contact is coupled (pushing, or holding a ball against an obstacle). */
    readonly coupled: readonly boolean[];
    /**
     * Per body: true when the body's motion was discarded because its group has no solution. The nearest-hold fallback
     * always has one, so this is always false; it is kept so that the simulator's "arrested" event keeps its meaning.
     */
    readonly arrested: readonly boolean[];
    /**
     * Per body: true when its group was solved by the nearest-hold fallback rather than exactly. Diagnostic only: the
     * motion is still valid, and tests use it to bound how often the fallback is needed.
     */
    readonly approximate: readonly boolean[];
}

interface Response {
    readonly phase: MotionPhase;
    /** Free acceleration from the turf (m/s²). */
    readonly force: Vec3;
    /** Effective inertia relative to the ball's mass. */
    readonly weight: number;
    /** Largest push, in the same units as weight × acceleration, that a ball at rest resists without moving. */
    readonly threshold: number;
}

function response(s: BallState, p: MotionParams): Response {
    const phase = classify(s, p.radius);
    switch (phase) {
        case "sliding":
            return {
                phase,
                force: scale(normalize(contactSlip(s, p.radius)), -p.slidingDecel),
                weight: 1,
                threshold: 0,
            };
        case "rolling":
            return {
                phase,
                force: scale(normalize(horizontal(s.velocity)), -p.rollingDecel),
                weight: ROLLING_WEIGHT,
                threshold: 0,
            };
        case "stationary":
            return { phase, force: ZERO, weight: ROLLING_WEIGHT, threshold: ROLLING_WEIGHT * p.rollingDecel };
    }
}

/**
 * Returns the acceleration (m/s²) the turf gives a ball moving freely from state `s`, as the resting-contact solver
 * sees it. The simulator uses the same function to decide whether touching balls are driven together, so detection
 * and resolution agree.
 */
export function freeAcceleration(s: BallState, p: MotionParams): Vec3 {
    return response(s, p).force;
}

/** Solves m·x = b by Gaussian elimination with partial pivoting; null when m is singular. */
function solveLinear(m: readonly (readonly number[])[], b: readonly number[]): number[] | null {
    const n = b.length;
    const a = m.map((row, i) => [...row, b[i] as number]);
    const at = (r: number, c: number): number => (a[r] as number[])[c] as number;
    for (let col = 0; col < n; col++) {
        let pivot = col;
        for (let r = col + 1; r < n; r++) {
            if (Math.abs(at(r, col)) > Math.abs(at(pivot, col))) {
                pivot = r;
            }
        }
        if (Math.abs(at(pivot, col)) <= PIVOT_TOLERANCE) {
            return null;
        }
        [a[col], a[pivot]] = [a[pivot] as number[], a[col] as number[]];
        for (let r = col + 1; r < n; r++) {
            const factor = at(r, col) / at(col, col);
            for (let c = col; c <= n; c++) {
                (a[r] as number[])[c] = at(r, c) - factor * at(col, c);
            }
        }
    }
    const x = new Array<number>(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
        let sum = at(r, n);
        for (let c = r + 1; c < n; c++) {
            sum -= at(r, c) * (x[c] as number);
        }
        x[r] = sum / at(r, r);
    }
    return x;
}

/**
 * The contact constraints of one group, in the form J·x = 0 (touching and not converging) for body accelerations or
 * velocities x. Row k of J maps body i to +n on the body that n points to, −n on the other, and ZERO otherwise.
 */
interface ContactSystem {
    readonly bodies: readonly number[];
    readonly contacts: readonly number[];
    /** J entry for contact index k (into `contacts` of the solve) and body i; ZERO for held bodies. */
    readonly jacobian: (k: number, i: number) => Vec3;
    /** Inverse effective inertia of body i (0 when held at rest). */
    readonly inverseWeight: (i: number) => number;
}

/**
 * Applies the contact impulses (or forces) that make J·x = 0 for the contacts in `active`, starting from `base`
 * (per body): returns the resulting x per body and the multiplier per active contact, or null when the active
 * contacts are not independent.
 */
function project(
    system: ContactSystem,
    active: readonly number[],
    base: ReadonlyMap<number, Vec3>,
): { readonly result: Map<number, Vec3>; readonly multipliers: number[] } | null {
    const rowDot = (k: number, l: number): number =>
        system.bodies.reduce(
            (sum, i) => sum + system.inverseWeight(i) * dot(system.jacobian(k, i), system.jacobian(l, i)),
            0,
        );
    const matrix = active.map((k) => active.map((l) => rowDot(k, l)));
    const rhs = active.map((k) =>
        system.bodies.reduce((sum, i) => sum - dot(system.jacobian(k, i), base.get(i) as Vec3), 0),
    );
    const multipliers = active.length === 0 ? [] : solveLinear(matrix, rhs);
    if (multipliers === null) {
        return null;
    }
    const result = new Map<number, Vec3>();
    for (const i of system.bodies) {
        let x = base.get(i) as Vec3;
        active.forEach((k, j) => {
            x = add(x, scale(system.jacobian(k, i), system.inverseWeight(i) * (multipliers[j] as number)));
        });
        result.set(i, x);
    }
    return { result, multipliers };
}

/** All subsets of `items`, smallest first, each in the items' order. Deterministic. */
function subsets(items: readonly number[]): number[][] {
    const all: number[][] = [];
    for (let mask = 0; mask < 1 << items.length; mask++) {
        all.push(items.filter((_, j) => (mask & (1 << j)) !== 0));
    }
    return all.sort((x, y) => x.length - y.length);
}

/** Connected groups of bodies joined by the kept contacts, in order of their lowest body index. */
function groupsOf(bodyCount: number, contacts: readonly RestingContact[], kept: readonly boolean[]): number[][] {
    const root = Array.from({ length: bodyCount }, (_, i) => i);
    const find = (i: number): number => {
        let r = i;
        while (root[r] !== r) {
            r = root[r] as number;
        }
        return r;
    };
    contacts.forEach((c, k) => {
        if (kept[k] && !c.fixed) {
            const ra = find(c.a);
            const rb = find(c.b);
            root[Math.max(ra, rb)] = Math.min(ra, rb);
        }
    });
    const byRoot = new Map<number, number[]>();
    contacts.forEach((c, k) => {
        if (kept[k]) {
            for (const body of c.fixed ? [c.a] : [c.a, c.b]) {
                const group = byRoot.get(find(body)) ?? [];
                byRoot.set(find(body), group);
                if (!group.includes(body)) {
                    group.push(body);
                }
            }
        }
    });
    return [...byRoot.values()].map((g) => g.sort((x, y) => x - y)).sort((x, y) => (x[0] as number) - (y[0] as number));
}

/** One active set of the nearest-hold fallback: its accelerations and how far it is from consistent (see violation). */
interface HoldTrial {
    readonly active: readonly number[];
    readonly x: Map<number, Vec3>;
    readonly worst: number;
}

/** Accelerations and contact forces for one choice of held and released resting balls. */
interface Candidate {
    readonly acceleration: Map<number, Vec3>;
    readonly active: readonly number[];
    readonly released: ReadonlyMap<number, Vec3>;
    /** True when found by the nearest-hold fallback rather than exactly. */
    readonly approximate: boolean;
}

/**
 * Decides which touching contacts push and how every ball involved moves until the next event. `contacts` must all
 * be touching and closing slower than RESTING_SPEED. A contact is kept when it is approaching or when the balls'
 * accelerations drive it together; contacts the solution leaves converging are added until none remain.
 */
export function solveRestingContacts(
    bodies: readonly ContactBody[],
    axes: readonly Vec3[],
    contacts: readonly RestingContact[],
): RestingSolution {
    return solveContacts(bodies, axes, contacts, false);
}

/**
 * Solves as solveRestingContacts does, but with every group taken straight to the nearest-hold fallback (see
 * solveGroup): balls at rest stay at rest and the moving balls are solved against them. Exported so that the fallback,
 * which the exact search leaves almost unused, can be tested on its own.
 */
export function solveNearestHold(
    bodies: readonly ContactBody[],
    axes: readonly Vec3[],
    contacts: readonly RestingContact[],
): RestingSolution {
    return solveContacts(bodies, axes, contacts, true);
}

function solveContacts(
    bodies: readonly ContactBody[],
    axes: readonly Vec3[],
    contacts: readonly RestingContact[],
    nearestHold: boolean,
): RestingSolution {
    const centreOf = (c: RestingContact): Vec3 =>
        c.fixed ? (axes[c.b] as Vec3) : (bodies[c.b] as ContactBody).state.position;
    const normals = contacts.map((c) =>
        normalize(horizontal(sub(centreOf(c), (bodies[c.a] as ContactBody).state.position))),
    );
    // Row k of J for body i: +n on the body n points to, −n on the other.
    const jacobian = (k: number, i: number): Vec3 => {
        const c = contacts[k] as RestingContact;
        if (!c.fixed && c.b === i) {
            return normals[k] as Vec3;
        }
        return c.a === i ? scale(normals[k] as Vec3, -1) : ZERO;
    };
    const closingRate = (x: ReadonlyMap<number, Vec3>, k: number): number => {
        const c = contacts[k] as RestingContact;
        const other = c.fixed ? ZERO : (x.get(c.b) ?? ZERO);
        return dot(sub(x.get(c.a) ?? ZERO, other), normals[k] as Vec3);
    };
    const converging = (states: readonly BallState[], acceleration: ReadonlyMap<number, Vec3>, k: number): boolean => {
        const c = contacts[k] as RestingContact;
        const a = states[c.a] as BallState;
        const velocity = c.fixed ? ZERO : (states[c.b] as BallState).velocity;
        const closing = approachSpeed(sub(a.position, centreOf(c)), sub(a.velocity, velocity));
        return closing > SPEED_EPSILON || closingRate(acceleration, k) > ACCELERATION_EPSILON;
    };

    const initial = bodies.map((b) => b.state);
    const freeAcceleration = new Map(bodies.map((b, i) => [i, response(b.state, b.params).force]));
    const kept = contacts.map((_, k) => converging(initial, freeAcceleration, k));

    for (;;) {
        const states = [...initial];
        const members: (RestingMember | null)[] = bodies.map(() => null);
        const arrested = bodies.map(() => false);
        const approximate = bodies.map(() => false);
        const coupled = contacts.map(() => false);
        const acceleration = new Map(freeAcceleration);

        for (const group of groupsOf(bodies.length, contacts, kept)) {
            const groupContacts = contacts
                .map((_, k) => k)
                .filter((k) => kept[k] && group.includes(contacts[k]?.a ?? -1));
            const params = (i: number): MotionParams => (bodies[i] as ContactBody).params;

            // Perfectly inelastic along every kept normal: the smallest change of velocity, weighted by effective
            // inertia, that stops each kept contact closing or opening. Dependent contacts are implied by the rest.
            // Static friction keeps a rolling or resting ball rolling through these small impulses, so its spin
            // follows its new velocity; a sliding ball keeps its spin.
            const before = new Map(group.map((i) => [i, response(initial[i] as BallState, params(i))]));
            const glueSystem: ContactSystem = {
                bodies: group,
                contacts: groupContacts,
                jacobian,
                inverseWeight: (i) => 1 / (before.get(i) as Response).weight,
            };
            const independent: number[] = [];
            for (const k of groupContacts) {
                if (project(glueSystem, [...independent, k], new Map(group.map((i) => [i, ZERO])))) {
                    independent.push(k);
                }
            }
            const glued = project(
                glueSystem,
                independent,
                new Map(group.map((i) => [i, horizontal((initial[i] as BallState).velocity)])),
            );
            for (const i of group) {
                const s = initial[i] as BallState;
                const velocity = glued?.result.get(i) ?? horizontal(s.velocity);
                const angularVelocity =
                    (before.get(i) as Response).phase === "sliding"
                        ? s.angularVelocity
                        : rollingSpin(velocity, s.angularVelocity.z, params(i).radius);
                states[i] = { position: s.position, velocity, angularVelocity };
            }

            const responses = new Map(group.map((i) => [i, response(states[i] as BallState, params(i))]));
            const solution = solveGroup(
                group,
                groupContacts,
                contacts,
                responses,
                jacobian,
                closingRate,
                params,
                nearestHold,
            );
            for (const k of solution.active) {
                coupled[k] = true;
            }
            for (const i of group) {
                const s = states[i] as BallState;
                const r = responses.get(i) as Response;
                const x = solution.acceleration.get(i) as Vec3;
                acceleration.set(i, x);
                approximate[i] = solution.approximate;
                const touched = solution.active.some(
                    (k) => contacts[k]?.a === i || (!contacts[k]?.fixed && contacts[k]?.b === i),
                );
                members[i] = touched
                    ? pushedMember(s, r, x, solution.released.get(i) ?? null, params(i).radius)
                    : { state: s, phase: r.phase, push: null };
            }
        }

        const added = contacts.map((_, k) => !kept[k] && converging(states, acceleration, k));
        if (!added.includes(true)) {
            return { members, coupled, arrested, approximate };
        }
        added.forEach((a, k) => {
            kept[k] = kept[k] === true || a;
        });
    }
}

/**
 * Finds the accelerations of one group. A candidate is a choice of which resting balls are held and which are
 * released, and of which contacts are active; it is solved exactly (tryActiveSet) and accepted only if it is
 * consistent and every held ball can stay at rest (holds).
 *
 * The candidate is normally read off an approximate solution of the whole problem (guide), which settles the held
 * and released balls and the active contacts at once. When that candidate is not consistent (for example exactly at
 * the limit of holding), every combination is tried: resting balls held or released (held first), and for each every
 * active set (smallest first).
 *
 * If still nothing is consistent, the group falls back to the nearest hold: every resting ball stays at rest and the
 * moving balls are solved against them as fixed, compression-only obstacles. That is the strictly convex quadratic
 * programme min Σ ½·wᵢ·|xᵢ − fᵢ|² over the moving balls subject to no contact converging, which x = 0 satisfies, so
 * it has a unique minimiser. Its constraints are linear, so KKT multipliers exist, and they can be chosen with
 * linearly independent support (a basic solution): the enumeration of active sets reaches that support and it is
 * consistent. So the fallback cannot fail. Should rounding spoil every set, the least inconsistent one is kept. The
 * held balls do no work, and the error against the exact solution is bounded by the accelerations the held balls
 * should have had, which are the vanishingly small ones that made the exact search fail. With `nearestHold` set the
 * group goes straight to the fallback.
 *
 * The search is small and bounded. Four equal balls touch in at most 5 pairs, and a ball fits between hoop uprights,
 * so it touches at most one obstacle: a group has at most 9 contacts (512 active sets) and 4 resting balls (16
 * masks). Groups in play are pairs and short chains, where it is a handful of 1–3 × 1–3 linear solves.
 */
function solveGroup(
    group: readonly number[],
    groupContacts: readonly number[],
    contacts: readonly RestingContact[],
    responses: ReadonlyMap<number, Response>,
    jacobian: (k: number, i: number) => Vec3,
    closingRate: (x: ReadonlyMap<number, Vec3>, k: number) => number,
    params: (i: number) => MotionParams,
    nearestHold: boolean,
): Candidate {
    const resting = group.filter((i) => (responses.get(i) as Response).phase === "stationary");
    // Held balls do not move, so a contact between two of them carries no constraint (its row is zero and it is never
    // active). The forces held balls pass to one another are settled afterwards by holds().
    const holding = (held: ReadonlySet<number>): ContactSystem => ({
        bodies: group,
        contacts: groupContacts,
        jacobian: (k, i) => (held.has(i) ? ZERO : jacobian(k, i)),
        inverseWeight: (i) => (held.has(i) ? 0 : 1 / (responses.get(i) as Response).weight),
    });
    const attempt = (released: ReadonlySet<number>, active: readonly number[]): Candidate | null => {
        const held = new Set(resting.filter((i) => !released.has(i)));
        const candidate = tryActiveSet(holding(held), active, responses, released, closingRate, params);
        const multipliers = candidate?.multipliers ?? [];
        if (candidate && holds(held, groupContacts, contacts, active, multipliers, responses, jacobian)) {
            return { acceleration: candidate.acceleration, active, released: candidate.released, approximate: false };
        }
        return null;
    };

    if (!nearestHold) {
        const guided = guide(group, groupContacts, contacts, resting, responses, jacobian);
        const first = attempt(guided.released, guided.active);
        if (first) {
            return first;
        }
        for (let mask = 0; mask < 1 << resting.length; mask++) {
            const released = new Set(resting.filter((_, j) => (mask & (1 << j)) !== 0));
            for (const active of subsets(groupContacts)) {
                const candidate = attempt(released, active);
                if (candidate) {
                    return candidate;
                }
            }
        }
    }

    // Nearest hold: every resting ball held, no hold check, first consistent active set (else least inconsistent).
    const system = holding(new Set(resting));
    const base = new Map(group.map((i) => [i, (responses.get(i) as Response).force]));
    const trial = (active: readonly number[]): HoldTrial | null => {
        const solved = project(system, active, base);
        return solved ? { active, x: solved.result, worst: violation(system, active, solved, closingRate) } : null;
    };
    // The empty set has no multipliers to solve for, so it always projects.
    let best = trial([]) as HoldTrial;
    for (const active of subsets(groupContacts).slice(1)) {
        if (best.worst <= ACCELERATION_EPSILON) {
            break;
        }
        const next = trial(active);
        if (next && next.worst < best.worst) {
            best = next;
        }
    }
    return { acceleration: best.x, active: best.active, released: new Map(), approximate: true };
}

/** Iteration cap of the approximate solve that guides the exact one; see guide. */
const GUIDE_ITERATIONS = 5_000;

/** The guiding solve stops once no contact force changes by more than this in a step. */
const GUIDE_TOLERANCE = 1e-12;

/**
 * Approximately solves the group's whole problem, including balls at rest, to read off a candidate for the exact
 * solve: the balls it releases and the contacts that carry force.
 *
 * With a resting ball's static resistance included, the accelerations minimise
 * Σᵢ ½·wᵢ·|xᵢ − fᵢ|² + Σᵢ cᵢ·|xᵢ| subject to no contact converging. Its dual, over contact forces N ≥ 0, is smooth:
 * for given N each ball's acceleration is the soft threshold xᵢ = shrink(fᵢ + gᵢ/wᵢ, cᵢ/wᵢ) of its free
 * acceleration plus the contact push gᵢ = Σₖ Nₖ·Jₖᵢ, and the dual gradient is −J·x. Projected gradient ascent with
 * step 1/L (L ≥ largest row sum of J·W⁻¹·Jᵀ, at most 2·contacts) converges. A ball whose soft threshold is zero is
 * held; any other resting ball is released along its acceleration. Contacts between held balls carry force here,
 * which is how held balls lean on one another.
 */
function guide(
    group: readonly number[],
    groupContacts: readonly number[],
    contacts: readonly RestingContact[],
    resting: readonly number[],
    responses: ReadonlyMap<number, Response>,
    jacobian: (k: number, i: number) => Vec3,
): { readonly released: Set<number>; readonly active: number[] } {
    const forces = groupContacts.map(() => 0);
    const step = 1 / Math.max(1, 2 * groupContacts.length);
    const accelerations = (): Map<number, Vec3> =>
        new Map(
            group.map((i) => {
                const r = responses.get(i) as Response;
                let push = ZERO;
                groupContacts.forEach((k, j) => {
                    push = add(push, scale(jacobian(k, i), forces[j] as number));
                });
                const v = add(r.force, scale(push, 1 / r.weight));
                const size = length(v);
                const limit = r.threshold / r.weight;
                return [i, size > limit ? scale(v, (size - limit) / size) : ZERO];
            }),
        );
    for (let iteration = 0; iteration < GUIDE_ITERATIONS; iteration++) {
        const x = accelerations();
        let change = 0;
        groupContacts.forEach((k, j) => {
            const c = contacts[k] as RestingContact;
            // J·x for this contact: the rate at which it opens (negative while converging).
            let opening = dot(jacobian(k, c.a), x.get(c.a) as Vec3);
            if (!c.fixed) {
                opening += dot(jacobian(k, c.b), x.get(c.b) as Vec3);
            }
            const next = Math.max(0, (forces[j] as number) - step * opening);
            change = Math.max(change, Math.abs(next - (forces[j] as number)));
            forces[j] = next;
        });
        if (change <= GUIDE_TOLERANCE) {
            break;
        }
    }
    const x = accelerations();
    // Dual ascent approaches a ball held exactly at its limit from the moving side, so tiny accelerations count as held.
    const released = new Set(resting.filter((i) => length(x.get(i) as Vec3) > ACCELERATION_EPSILON));
    // A contact carries force in the exact solve only if at least one of its balls moves.
    const active = groupContacts.filter((k, j) => {
        const c = contacts[k] as RestingContact;
        const moving = (i: number): boolean => !resting.includes(i) || released.has(i);
        return (forces[j] as number) > 0 && (moving(c.a) || (!c.fixed && moving(c.b)));
    });
    return { released, active };
}

/**
 * Can every held ball stay at rest? Touching held balls lean on one another, but a ball–ball or ball–obstacle contact
 * carries only compression, and only along its own normal. So the question is whether some internal compressions
 * λ ≥ 0 leave each held ball's net load within its own static resistance (see holdCertificate).
 */
function holds(
    held: ReadonlySet<number>,
    groupContacts: readonly number[],
    contacts: readonly RestingContact[],
    active: readonly number[],
    multipliers: readonly number[],
    responses: ReadonlyMap<number, Response>,
    jacobian: (k: number, i: number) => Vec3,
): boolean {
    if (held.size === 0) {
        return true;
    }
    const balls = [...held];
    // External load on each held ball: the forces of the active contacts it takes part in.
    const loads = balls.map((i) => {
        let load = ZERO;
        active.forEach((k, j) => {
            load = add(load, scale(jacobian(k, i), multipliers[j] as number));
        });
        return load;
    });
    const links: HoldLink[] = [];
    const rays: HoldRay[] = [];
    for (const k of groupContacts) {
        const c = contacts[k] as RestingContact;
        if (!held.has(c.a)) {
            continue;
        }
        if (c.fixed) {
            // The ball's row is −n with n pointing into the obstacle; the obstacle pushes back along −n.
            rays.push({ ball: balls.indexOf(c.a), into: scale(jacobian(k, c.a), -1) });
        } else if (held.has(c.b)) {
            links.push({ a: balls.indexOf(c.a), b: balls.indexOf(c.b), normal: jacobian(k, c.b) });
        }
    }
    const capacities = balls.map((i) => (responses.get(i) as Response).threshold);
    return holdCertificate(loads, capacities, links, rays) !== null;
}

/**
 * Held balls are certified against their static resistances plus this slack (weight × m/s²; resistances are of order
 * 1). A numerical tolerance, not a physical one: it only decides which way a configuration within 1e-6 of the limit of
 * holding goes (see holdCertificate).
 */
export const HOLD_SLACK = 1e-6;

/** Iteration cap of the held-ball feasibility search; see holdCertificate. */
const HOLD_ITERATIONS = 20_000;

/** A contact between two held balls: compression pushes ball `b` along `normal` and ball `a` against it. */
export interface HoldLink {
    readonly a: number;
    readonly b: number;
    readonly normal: Vec3;
}

/** A held ball resting against an obstacle: the obstacle pushes it back against `into`, the unit normal into it. */
export interface HoldRay {
    readonly ball: number;
    readonly into: Vec3;
}

/**
 * Decides whether held balls can stay at rest. Ball i carries external load `loads[i]` and resists up to
 * `capacities[i]` in any direction. Returns compressions (one per link, then one per ray, all ≥ 0) under which every
 * ball's net load exceeds its capacity by at most HOLD_SLACK, or null if there are none.
 *
 * Exactly feasible compressions are the zeros of the convex function F(λ) = Σᵢ ½·max(0, |netᵢ(λ)| − capacityᵢ)² over
 * λ ≥ 0, whose gradient is Lipschitz with constant at most the largest row sum of JᵀJ (at most 2·(links + rays)).
 * Accelerated projected gradient (FISTA) with that step drives F towards its minimum from outside the feasible set;
 * it stops as soon as every excess is within HOLD_SLACK (usually after a few steps).
 *
 * It also stops, with null, as soon as the current excesses prove that no compressions will do (a Farkas
 * certificate). Let uᵢ be ball i's excess along its net load (the gradient of F with respect to that load). Every
 * compression changes Σᵢ uᵢ·netᵢ at the rate of its component of ∇F = Jᵀu, so if no component is negative then
 * Σᵢ uᵢ·netᵢ ≥ Σᵢ uᵢ·loadsᵢ for every λ ≥ 0; and a ball within its capacity plus slack has
 * uᵢ·netᵢ ≤ (capacityᵢ + HOLD_SLACK)·|uᵢ|. So Σᵢ uᵢ·loadsᵢ > Σᵢ (capacityᵢ + HOLD_SLACK)·|uᵢ| rules out any λ that
 * the search would accept. At the minimiser of an infeasible problem ∇F ≥ 0 and the margin is 2·min F, so the
 * certificate appears once the iterates settle; it cannot appear for a problem that has an acceptable λ.
 *
 * Near the limit of holding, where the feasible set shrinks to a point, convergence is slow, which is why the slack is
 * needed; the search gives up after HOLD_ITERATIONS. A problem feasible with room to spare certifies, and one
 * infeasible by more than HOLD_SLACK does not; within the slack either answer can come back. The release solve (see
 * releaseDirections) is exact down to accelerations of ACCELERATION_EPSILON, and whatever neither side settles is
 * covered by the nearest-hold fallback (see solveGroup).
 */
export function holdCertificate(
    loads: readonly Vec3[],
    capacities: readonly number[],
    links: readonly HoldLink[],
    rays: readonly HoldRay[],
): number[] | null {
    const count = links.length + rays.length;
    const lambda = new Array<number>(count).fill(0);
    // Net load on every ball for the current compressions.
    const net = (): Vec3[] => {
        const result = [...loads];
        links.forEach((link, k) => {
            const f = scale(link.normal, lambda[k] as number);
            result[link.b] = add(result[link.b] as Vec3, f);
            result[link.a] = sub(result[link.a] as Vec3, f);
        });
        rays.forEach((ray, j) => {
            result[ray.ball] = sub(result[ray.ball] as Vec3, scale(ray.into, lambda[links.length + j] as number));
        });
        return result;
    };
    const step = 1 / Math.max(1, 2 * count);
    // Excess of each ball beyond its capacity, and the gradient of F with respect to its net load (the excess, along
    // the load), at compressions `at`.
    const evaluate = (at: readonly number[]): { readonly excess: number; readonly pull: Vec3[] } => {
        const saved = [...lambda];
        at.forEach((v, k) => (lambda[k] = v));
        const loadsNow = net();
        saved.forEach((v, k) => (lambda[k] = v));
        let excess = 0;
        const pull = loadsNow.map((load, i) => {
            const size = length(load);
            const over = size - (capacities[i] as number);
            excess = Math.max(excess, over);
            return over > 0 ? scale(load, over / size) : ZERO;
        });
        return { excess, pull };
    };
    // ∇F = Jᵀu for per-ball gradients u.
    const gradient = (pull: readonly Vec3[]): number[] =>
        lambda.map((_, k) =>
            k < links.length
                ? dot(
                      sub(pull[(links[k] as HoldLink).b] as Vec3, pull[(links[k] as HoldLink).a] as Vec3),
                      (links[k] as HoldLink).normal,
                  )
                : 0 -
                  dot(pull[(rays[k - links.length] as HoldRay).ball] as Vec3, (rays[k - links.length] as HoldRay).into),
        );
    // The Farkas certificate above.
    const impossible = (pull: readonly Vec3[]): boolean => {
        if (gradient(pull).some((g) => g < 0)) {
            return false;
        }
        let margin = 0;
        pull.forEach((u, i) => {
            margin += dot(u, loads[i] as Vec3) - ((capacities[i] as number) + HOLD_SLACK) * length(u);
        });
        return margin > 0;
    };
    // Accelerated projected gradient (FISTA) on λ ≥ 0, from λ = 0. `probe` is the extrapolated point.
    let probe = [...lambda];
    let momentum = 1;
    for (let iteration = 0; iteration <= HOLD_ITERATIONS; iteration++) {
        const here = evaluate(lambda);
        if (here.excess <= HOLD_SLACK) {
            return lambda;
        }
        if (count === 0 || iteration === HOLD_ITERATIONS || impossible(here.pull)) {
            return null;
        }
        const slope = gradient(evaluate(probe).pull);
        const next = probe.map((v, k) => Math.max(0, v - step * (slope[k] as number)));
        const nextMomentum = (1 + Math.sqrt(1 + 4 * momentum * momentum)) / 2;
        probe = next.map((v, k) => v + ((momentum - 1) / nextMomentum) * (v - (lambda[k] as number)));
        next.forEach((v, k) => (lambda[k] = v));
        momentum = nextMomentum;
    }
    return null;
}

/** One solve of an active set: accelerations, contact multipliers and the directions of balls pushed off from rest. */
interface Trial {
    readonly acceleration: Map<number, Vec3>;
    readonly multipliers: readonly number[];
    readonly released: ReadonlyMap<number, Vec3>;
}

/**
 * Solves one active set for one choice of released balls, or returns null if it is inconsistent: a force pulls, an
 * inactive contact converges, or a released ball does not move along the direction its resistance was built on.
 */
function tryActiveSet(
    system: ContactSystem,
    active: readonly number[],
    responses: ReadonlyMap<number, Response>,
    released: ReadonlySet<number>,
    closingRate: (x: ReadonlyMap<number, Vec3>, k: number) => number,
    params: (i: number) => MotionParams,
): Trial | null {
    // A ball pushed off from rest rolls against rolling resistance along its direction of motion, which is not known
    // until the accelerations are. releaseDirections solves for it; the trial is then accepted only if the result
    // agrees with the direction the resistance was built on. Resistance along an agreeing direction opposes the
    // motion, so it never does positive work.
    const directions = releaseDirections(system, active, responses, released);
    if (!directions) {
        return null;
    }
    const base = new Map(
        system.bodies.map((i) => {
            const d = directions.get(i);
            return [i, d ? scale(d, -params(i).rollingDecel) : (responses.get(i) as Response).force];
        }),
    );
    const solved = project(system, active, base);
    if (!solved || ![...released].every((i) => agrees(solved.result.get(i) as Vec3, directions.get(i) as Vec3))) {
        return null;
    }
    if (violation(system, active, solved, closingRate) > ACCELERATION_EPSILON) {
        return null;
    }
    return { acceleration: solved.result, multipliers: solved.multipliers, released: directions };
}

/**
 * Solves for the rolling directions of the balls in `released`, pushed off from rest, under the contacts in `active`;
 * null when there is no solution to try.
 *
 * With the active contacts held closed (J·x = 0) and the held balls fixed, the accelerations minimise
 * Φ(x) = Σᵢ ½·wᵢ·|xᵢ − bᵢ|² + Σⱼ cⱼ·|xⱼ|, where b is each moving ball's free acceleration (zero for a released ball)
 * and cⱼ the static resistance of released ball j: its rolling resistance, of that size, opposes its motion. Φ is
 * strictly convex, so the minimiser is unique, and wherever no released ball is at rest it is smooth, with Hessian
 * W + Σⱼ cⱼ·(I − x̂ⱼx̂ⱼᵀ)/|xⱼ|. It is found by damped Newton from the no-resistance solution: each step is solved
 * together with the contact constraints, then halved until Φ falls by at least a quarter of what the step promises and
 * no released acceleration flips or shrinks below RELEASE_SHRINK of its length (Φ has a kink at zero, and a full step
 * across it can overshoot a tiny minimiser by far more than its size). Near the minimiser the steps are full and
 * convergence is quadratic. Along each ball's motion Φ is quadratic, so the size of a small acceleration is found as
 * reliably as that of a large one; across it the curvature cⱼ/|xⱼ| is large, which is what pins the direction. Unlike
 * iterating on the direction, this is exact however small the accelerations are and whether or not the contacts pin
 * their direction. Only a converged solve counts: every released ball's Newton step must be within RELEASE_TOLERANCE
 * of its acceleration, which rounding cannot fake. When the minimiser has a released ball at rest (it is held, not
 * released), that ball's acceleration only shrinks, by steps comparable to its size, so the solve never converges
 * within RELEASE_ITERATIONS and returns null. A step whose promised decrease of Φ is below RELEASE_FLOOR is taken
 * without checking that Φ falls, which rounding would hide; this happens only in the last steps before convergence,
 * and for a ball heading for rest, whose steps still cannot settle.
 */
function releaseDirections(
    system: ContactSystem,
    active: readonly number[],
    responses: ReadonlyMap<number, Response>,
    released: ReadonlySet<number>,
): Map<number, Vec3> | null {
    if (released.size === 0) {
        return new Map();
    }
    const moving = system.bodies.filter((i) => system.inverseWeight(i) > 0);
    const size = 2 * moving.length;
    const target = moving.map((i) => (released.has(i) ? ZERO : (responses.get(i) as Response).force));
    const weight = moving.map((i) => 1 / system.inverseWeight(i));
    const resistance = moving.map((i) => (released.has(i) ? (responses.get(i) as Response).threshold : 0));
    const start = project(
        system,
        active,
        new Map(system.bodies.map((i) => [i, released.has(i) ? ZERO : (responses.get(i) as Response).force])),
    );
    if (!start) {
        return null;
    }
    // Accelerations of the moving balls as one vector (x, y per ball).
    let x = moving.flatMap((i) => [(start.result.get(i) as Vec3).x, (start.result.get(i) as Vec3).y]);
    const at = (v: readonly number[], a: number): Vec3 => vec3(v[2 * a] as number, v[2 * a + 1] as number, 0);
    // Φ(x + t·step) − Φ(x), written so that nothing cancels: the accelerations can be far smaller than Φ itself.
    const change = (step: readonly number[], t: number): number =>
        moving.reduce((sum, _, a) => {
            const xa = at(x, a);
            const move = scale(at(step, a), t);
            const quadratic = (weight[a] as number) * (dot(move, sub(xa, target[a] as Vec3)) + 0.5 * dot(move, move));
            const c = resistance[a] as number;
            // |x + m| − |x| = (2·x·m + |m|²) / (|x + m| + |x|).
            const stretch = c > 0 ? (2 * dot(xa, move) + dot(move, move)) / (length(add(xa, move)) + length(xa)) : 0;
            return sum + quadratic + c * stretch;
        }, 0);
    for (let iteration = 0; iteration < RELEASE_ITERATIONS; iteration++) {
        if (moving.some((_, a) => (resistance[a] as number) > 0 && length(at(x, a)) === 0)) {
            return null;
        }
        // Newton step: [Hessian Jᵀ; J 0]·[step; multipliers] = [−gradient; 0].
        const kkt = Array.from({ length: size + active.length }, () => new Array<number>(size + active.length).fill(0));
        const rhs = new Array<number>(size + active.length).fill(0);
        moving.forEach((i, a) => {
            const xa = at(x, a);
            const w = weight[a] as number;
            const c = resistance[a] as number;
            const gradient = add(scale(sub(xa, target[a] as Vec3), w), c > 0 ? scale(normalize(xa), c) : ZERO);
            rhs[2 * a] = 0 - gradient.x;
            rhs[2 * a + 1] = 0 - gradient.y;
            // c·(I − x̂x̂ᵀ)/|x|: curvature of the resistance across the motion.
            const u = c > 0 ? normalize(xa) : ZERO;
            const bend = c > 0 ? c / length(xa) : 0;
            const block = [
                [w + bend * (1 - u.x * u.x), 0 - bend * u.x * u.y],
                [0 - bend * u.x * u.y, w + bend * (1 - u.y * u.y)],
            ];
            for (let r = 0; r < 2; r++) {
                for (let col = 0; col < 2; col++) {
                    (kkt[2 * a + r] as number[])[2 * a + col] = (block[r] as number[])[col] as number;
                }
            }
            active.forEach((k, j) => {
                const row = system.jacobian(k, i);
                (kkt[size + j] as number[])[2 * a] = row.x;
                (kkt[size + j] as number[])[2 * a + 1] = row.y;
                (kkt[2 * a] as number[])[size + j] = row.x;
                (kkt[2 * a + 1] as number[])[size + j] = row.y;
            });
        });
        const solved = solveLinear(kkt, rhs);
        if (!solved) {
            return null;
        }
        const step = solved.slice(0, size);
        // Converged: every released acceleration is known to RELEASE_TOLERANCE of its own size, so it is genuine.
        const settled = moving.every(
            (_, a) => (resistance[a] as number) === 0 || length(at(step, a)) <= RELEASE_TOLERANCE * length(at(x, a)),
        );
        if (settled) {
            const directions = new Map<number, Vec3>();
            moving.forEach((i, a) => {
                if (released.has(i)) {
                    directions.set(i, normalize(add(at(x, a), at(step, a))));
                }
            });
            return directions;
        }
        // The decrease the full step promises: −gradient·step.
        const promise = step.reduce((sum, v, r) => sum + v * (rhs[r] as number), 0);
        // Each released acceleration keeps at least RELEASE_SHRINK of its length along its current direction.
        const kept = (t: number): boolean =>
            moving.every((_, a) => {
                const xa = at(x, a);
                return (
                    (resistance[a] as number) === 0 ||
                    dot(xa, xa) + t * dot(at(step, a), xa) >= RELEASE_SHRINK * dot(xa, xa)
                );
            });
        // A promise within RELEASE_FLOOR is rounding: Φ cannot be seen to fall, and the step is taken on trust.
        const enough = (t: number): boolean => promise <= RELEASE_FLOOR || change(step, t) <= -0.25 * t * promise;
        let accepted = 0;
        for (let halving = 0, t = 1; halving < RELEASE_ITERATIONS && accepted === 0; halving++, t /= 2) {
            if (kept(t) && enough(t)) {
                accepted = t;
            }
        }
        if (accepted === 0) {
            return null;
        }
        x = x.map((v, r) => v + accepted * (step[r] as number));
    }
    return null;
}

/**
 * True when `x` points along the unit vector `d` (to within DIRECTION_TOLERANCE) and forwards: a ball released from
 * rest must actually move along its resistance.
 */
function agrees(x: Vec3, d: Vec3): boolean {
    const along = dot(x, d);
    return along > 0 && Math.abs(x.x * d.y - x.y * d.x) <= DIRECTION_TOLERANCE * along;
}

/**
 * How far a solved active set is from consistent: the largest pull (negative contact force) or the fastest convergence
 * of an inactive contact, whichever is worse. At most ACCELERATION_EPSILON means consistent.
 */
function violation(
    system: ContactSystem,
    active: readonly number[],
    solved: { readonly result: Map<number, Vec3>; readonly multipliers: number[] },
    closingRate: (x: ReadonlyMap<number, Vec3>, k: number) => number,
): number {
    let worst = 0;
    for (const n of solved.multipliers) {
        worst = Math.max(worst, 0 - n);
    }
    for (const k of system.contacts) {
        if (!active.includes(k)) {
            worst = Math.max(worst, closingRate(solved.result, k));
        }
    }
    return worst;
}

/** Builds the constant-acceleration motion of a coupled ball with acceleration `x`. */
function pushedMember(
    s: BallState,
    r: Response,
    x: Vec3,
    releasedDirection: Vec3 | null,
    radius: number,
): RestingMember {
    const rollingSpinRate = vec3(-x.y / radius, x.x / radius, 0);
    if (r.phase === "stationary") {
        if (!releasedDirection) {
            return {
                state: s,
                phase: "stationary",
                push: { acceleration: ZERO, angularAcceleration: ZERO, direction: ZERO },
            };
        }
        // Pushed off from rest: it starts rolling, resisted along its direction of motion.
        return {
            state: s,
            phase: "rolling",
            push: { acceleration: x, angularAcceleration: rollingSpinRate, direction: releasedDirection },
        };
    }
    if (r.phase === "rolling") {
        return {
            state: s,
            phase: "rolling",
            push: {
                acceleration: x,
                angularAcceleration: rollingSpinRate,
                direction: normalize(horizontal(s.velocity)),
            },
        };
    }
    // Sliding friction acts at the contact point, so it also spins the ball: dω/dt = (5/2r)·(fy, −fx, 0).
    const k = 5 / (2 * radius);
    return {
        state: s,
        phase: "sliding",
        push: {
            acceleration: x,
            angularAcceleration: vec3(k * r.force.y, -k * r.force.x, 0),
            direction: normalize(contactSlip(s, radius)),
        },
    };
}

/** Returns the state of a coupled ball a time t after `start`. */
export function pushedState(start: BallState, push: PushMotion, t: number): BallState {
    if (t === 0) {
        return start;
    }
    const v = horizontal(start.velocity);
    return {
        position: add(add(start.position, scale(v, t)), scale(push.acceleration, 0.5 * t * t)),
        velocity: add(v, scale(push.acceleration, t)),
        angularVelocity: add(start.angularVelocity, scale(push.angularAcceleration, t)),
    };
}

/** Returns the centre trajectory of a coupled ball from `start`. */
export function pushedTrajectory(start: BallState, push: PushMotion): Trajectory {
    return { c0: start.position, c1: horizontal(start.velocity), c2: scale(push.acceleration, 0.5) };
}

/** Earliest t > 0 at which g0 + g1·t rises through zero from below, or Infinity. */
function risesAt(g0: number, g1: number): number {
    return g0 < 0 && g1 > 0 ? (0 - g0) / g1 : Infinity;
}

/**
 * Returns how long the frozen turf force of a coupled ball stays valid: until its slip (sliding) or velocity
 * (rolling) reaches zero along the frozen direction, or turns more than DIRECTION_TOLERANCE away from it. Both are
 * linear in time within the segment. Infinity for a ball held at rest or one that is only speeding up.
 */
export function pushDuration(start: BallState, phase: MotionPhase, push: PushMotion, radius: number): number {
    if (phase === "stationary") {
        return Infinity;
    }
    const a = push.acceleration;
    const w = push.angularAcceleration;
    // The tracked quantity x(t) = x0 + x1·t: contact slip while sliding, velocity while rolling.
    const x0 = phase === "sliding" ? contactSlip(start, radius) : horizontal(start.velocity);
    const x1 = phase === "sliding" ? vec3(a.x - radius * w.y, a.y + radius * w.x, 0) : horizontal(a);
    const d = push.direction;
    const along0 = dot(x0, d);
    const along1 = dot(x1, d);
    const across0 = x0.x * d.y - x0.y * d.x;
    const across1 = x1.x * d.y - x1.y * d.x;
    return Math.min(
        risesAt(0 - along0, 0 - along1),
        risesAt(across0 - DIRECTION_TOLERANCE * along0, across1 - DIRECTION_TOLERANCE * along1),
        risesAt(0 - across0 - DIRECTION_TOLERANCE * along0, 0 - across1 - DIRECTION_TOLERANCE * along1),
    );
}
