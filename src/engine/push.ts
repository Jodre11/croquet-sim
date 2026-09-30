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
 * group again from the balls' new states. If no active set is consistent (degenerate geometry), the group is brought
 * to rest and the simulator records an "arrested" event.
 */
import { approachSpeed } from "./detect";
import { ZERO, add, dot, horizontal, length, normalize, scale, sub, vec3, type Vec3 } from "./math/vec3";
import { SPEED_EPSILON, atRest, classify, contactSlip, rollingSpin, type Trajectory } from "./motion";
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
 * Most passes spent finding the rolling direction of balls pushed off from rest. A candidate is accepted only when
 * each such ball's computed acceleration agrees with the direction its resistance was built on (to within
 * DIRECTION_TOLERANCE); a candidate that has not settled after this many passes is rejected. For straight lines of
 * contacts the second pass already agrees.
 */
const RELEASE_PASSES = 8;

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
    /** Per body: true when the body was brought to rest because no consistent solution exists for its group. */
    readonly arrested: readonly boolean[];
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

/** Accelerations and contact forces for one choice of held and released resting balls, or null if inconsistent. */
interface Candidate {
    readonly acceleration: Map<number, Vec3>;
    readonly active: readonly number[];
    readonly released: ReadonlyMap<number, Vec3>;
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
            const solution = solveGroup(group, groupContacts, contacts, responses, jacobian, closingRate, params);
            if (!solution) {
                for (const i of group) {
                    arrested[i] = true;
                    states[i] = atRest((initial[i] as BallState).position);
                    members[i] = { state: states[i] as BallState, phase: "stationary", push: null };
                    acceleration.set(i, ZERO);
                }
                continue;
            }
            for (const k of solution.active) {
                coupled[k] = true;
            }
            for (const i of group) {
                const s = states[i] as BallState;
                const r = responses.get(i) as Response;
                const x = solution.acceleration.get(i) as Vec3;
                acceleration.set(i, x);
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
            return { members, coupled, arrested };
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
 * and released balls, the active contacts and the released balls' directions at once. When that candidate is not
 * consistent (for example exactly at the limit of holding), every combination is tried: resting balls held or
 * released (held first), and for each every active set (smallest first). Returns null if nothing is consistent.
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
): Candidate | null {
    const resting = group.filter((i) => (responses.get(i) as Response).phase === "stationary");
    const attempt = (
        released: ReadonlySet<number>,
        active: readonly number[],
        seed: ReadonlyMap<number, Vec3>,
    ): Candidate | null => {
        const held = new Set(resting.filter((i) => !released.has(i)));
        // Held balls do not move, so a contact between two of them carries no constraint (its row is zero and it is
        // never active). The forces held balls pass to one another are settled afterwards by holds().
        const system: ContactSystem = {
            bodies: group,
            contacts: groupContacts,
            jacobian: (k, i) => (held.has(i) ? ZERO : jacobian(k, i)),
            inverseWeight: (i) => (held.has(i) ? 0 : 1 / (responses.get(i) as Response).weight),
        };
        const candidate = tryActiveSet(system, active, responses, released, closingRate, params, seed);
        const multipliers = candidate?.multipliers ?? [];
        if (candidate && holds(held, groupContacts, contacts, active, multipliers, responses, jacobian)) {
            return { acceleration: candidate.acceleration, active, released: candidate.released };
        }
        return null;
    };

    const guided = guide(group, groupContacts, contacts, resting, responses, jacobian);
    const first = attempt(guided.released, guided.active, guided.directions);
    if (first) {
        return first;
    }
    for (let mask = 0; mask < 1 << resting.length; mask++) {
        const released = new Set(resting.filter((_, j) => (mask & (1 << j)) !== 0));
        for (const active of subsets(groupContacts)) {
            const candidate = attempt(released, active, new Map());
            if (candidate) {
                return candidate;
            }
        }
    }
    return null;
}

/** Iteration cap of the approximate solve that guides the exact one; see guide. */
const GUIDE_ITERATIONS = 5_000;

/** The guiding solve stops once no contact force changes by more than this in a step. */
const GUIDE_TOLERANCE = 1e-12;

/**
 * Approximately solves the group's whole problem, including balls at rest, to read off a candidate for the exact
 * solve: the balls it releases (and their directions) and the contacts that carry force.
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
): { readonly released: Set<number>; readonly active: number[]; readonly directions: Map<number, Vec3> } {
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
    const directions = new Map([...released].map((i) => [i, normalize(x.get(i) as Vec3)]));
    // A contact carries force in the exact solve only if at least one of its balls moves.
    const active = groupContacts.filter((k, j) => {
        const c = contacts[k] as RestingContact;
        const moving = (i: number): boolean => !resting.includes(i) || released.has(i);
        return (forces[j] as number) > 0 && (moving(c.a) || (!c.fixed && moving(c.b)));
    });
    return { released, active, directions };
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
 * Loads (weight × acceleration units) within this of a held ball's static resistance still hold. It only settles
 * which way a contact exactly at the limit of holding goes.
 */
export const HOLD_TOLERANCE = 1e-9;

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
 * ball's net load lies within its capacity (to HOLD_TOLERANCE), or null when none exist.
 *
 * The feasible compressions are the minimisers, with value zero, of F(λ) = Σᵢ ½·max(0, |netᵢ(λ)| − capacityᵢ)² over
 * λ ≥ 0. F is convex with a gradient that is Lipschitz with constant at most the largest row sum of JᵀJ (at most
 * 2·(links + rays)), so projected gradient descent with that step decreases F monotonically and converges; F reaches
 * zero exactly when a feasible λ exists. The search stops as soon as every ball is within capacity (usually a few
 * steps) and otherwise gives up after HOLD_ITERATIONS, deciding by the remaining excess.
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
    for (let iteration = 0; iteration <= HOLD_ITERATIONS; iteration++) {
        const loadsNow = net();
        // Gradient of F with respect to each ball's net load: the excess beyond the capacity disc, along the load.
        let excess = 0;
        const pull = loadsNow.map((load, i) => {
            const size = length(load);
            const over = size - (capacities[i] as number);
            excess = Math.max(excess, over);
            return over > 0 ? scale(load, over / size) : ZERO;
        });
        if (excess <= HOLD_TOLERANCE) {
            return lambda;
        }
        if (count === 0 || iteration === HOLD_ITERATIONS) {
            return null;
        }
        links.forEach((link, k) => {
            const gradient = dot(sub(pull[link.b] as Vec3, pull[link.a] as Vec3), link.normal);
            lambda[k] = Math.max(0, (lambda[k] as number) - step * gradient);
        });
        rays.forEach((ray, j) => {
            const gradient = -dot(pull[ray.ball] as Vec3, ray.into);
            lambda[links.length + j] = Math.max(0, (lambda[links.length + j] as number) - step * gradient);
        });
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
    seed: ReadonlyMap<number, Vec3>,
): Trial | null {
    // A ball pushed off from rest rolls against rolling resistance along its direction of motion, which is not known
    // until the accelerations are. The first pass builds that resistance on the `seed` direction (or omits it when
    // there is none); each later pass builds it on the direction the previous pass produced, and the trial is accepted
    // only once the result agrees with the direction it was built on. Resistance along an agreeing direction opposes
    // the motion, so it never does positive work.
    const directions = new Map([...seed].filter(([i]) => released.has(i)));
    for (let pass = 0; pass < RELEASE_PASSES; pass++) {
        const base = new Map(
            system.bodies.map((i) => {
                const d = directions.get(i);
                const f = d ? scale(d, -params(i).rollingDecel) : (responses.get(i) as Response).force;
                return [i, f];
            }),
        );
        const solved = project(system, active, base);
        if (!solved) {
            return null;
        }
        const settled = [...released].every((i) => {
            const d = directions.get(i);
            return d !== undefined && agrees(solved.result.get(i) as Vec3, d);
        });
        if (settled) {
            return accept(system, active, solved, closingRate, directions);
        }
        for (const i of released) {
            const x = solved.result.get(i) as Vec3;
            if (length(x) === 0) {
                return null;
            }
            directions.set(i, normalize(x));
        }
    }
    return null;
}

/**
 * True when `x` points along the unit vector `d`, to within DIRECTION_TOLERANCE, and is more than rounding: a ball
 * released from rest must actually move (otherwise it is held).
 */
function agrees(x: Vec3, d: Vec3): boolean {
    const along = dot(x, d);
    return along > ACCELERATION_EPSILON && Math.abs(x.x * d.y - x.y * d.x) <= DIRECTION_TOLERANCE * along;
}

function accept(
    system: ContactSystem,
    active: readonly number[],
    solved: { readonly result: Map<number, Vec3>; readonly multipliers: number[] },
    closingRate: (x: ReadonlyMap<number, Vec3>, k: number) => number,
    directions: ReadonlyMap<number, Vec3>,
): Trial | null {
    const { result, multipliers } = solved;
    if (multipliers.some((n) => n < -ACCELERATION_EPSILON)) {
        return null;
    }
    if (system.contacts.some((k) => !active.includes(k) && closingRate(result, k) > ACCELERATION_EPSILON)) {
        return null;
    }
    return { acceleration: result, multipliers, released: directions };
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
