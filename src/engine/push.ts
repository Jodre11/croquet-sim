/**
 * Resting contact and pushing (spec §5 phase 2; P2a.2 design).
 *
 * A contact slower than RESTING_SPEED is not bounced: with a ball driven into another by its own spin, bouncing starts
 * a Zeno sequence of ever-smaller rebounds that no event budget can finish. Instead the touching bodies' speeds along
 * each line of centres are made equal (a perfectly inelastic, frictionless normal impulse: the speeds it removes are
 * below RESTING_SPEED, so the friction it omits is negligible), and each group of touching bodies is solved with 3D,
 * load-coupled Coulomb friction (contactModel.ts, modeSolve.ts): every ball's mode (held, released from rest, rolling,
 * sliding, in flight) and every contact's (open, stuck, slipping) are decided together, every resting ball tried held
 * first, and the first consistent candidate wins.
 *
 * Within one segment everything is constant, so every trajectory stays quadratic:
 * - Each contact normal is fixed for the segment. The pair closes along it at |v_t|²/d (detect.ts `normalCurvature`),
 *   the rate that keeps it touching as the line of centres turns, so the contact force carries that share with its
 *   friction and load. The gap then drifts only at third order, either way; the segment ends when it opens past
 *   SEPARATION_TOLERANCE or closes past CONTACT_TOLERANCE, and the simulator projects every resting contact back to
 *   zero gap before it solves again (simulate.ts projectContacts). (Closing at zero instead opens the gap at second
 *   order, and the regroup that follows passes the turning share as a frictionless inelastic impulse: pushes that rub
 *   round each other then drift by millimetres.)
 * - Each ball's turf force is frozen at the segment start (sliding friction against its slip, rolling resistance
 *   against its travel), and so is each slipping contact's slip direction. The segment ends when one stops being valid:
 *   the slip or velocity reaches zero along its frozen direction or turns more than DIRECTION_TOLERANCE away from it
 *   (pushDuration, contactSlipDuration). The simulator then solves the group again.
 * - Because each normal is frozen, a ball sliding round another in flight regroups as the gap's cubic drift leaves its
 *   band: about 135–195 events for a ball rolling off another's top without friction, but finitely many.
 *
 * If no exact candidate is found, or the shot's work budget is spent, the group falls back to the nearest hold: its
 * resting balls stay at rest and the moving balls are solved against them as fixed, frictionless, compression-only
 * obstacles. That problem always has a solution (see nearestHold) and does no work through the held balls. It differs
 * from the exact solution by the motion and friction it omits; nothing bounds that in principle, so the solution
 * reports how far holding misses (holdExcess) and flags the balls concerned. Its contacts close at zero, without the
 * curvature share: the fallback is already approximate and frictionless (the share carries no friction to lose), its
 * contacts then open at second order (v_t²), so they end the segment on the separation side and are solved again
 * (with no tangential speed the drift is cubic and both bounds apply, as for exact solutions); and keeping its target
 * zero keeps nearestHold the projection its existence argument is about.
 */
import { approachSpeed, normalCurvature } from "./detect";
import {
    ACCELERATION_EPSILON,
    ROLLING_WEIGHT,
    buildModel,
    type ContactBody,
    type ContactGeometry,
    type ContactMode,
    type Evaluated,
    type Model,
    type RestingContact,
} from "./contactModel";
import { ZERO, add, cross, dot, horizontal, length, normalize, scale, sub, vec3, type Vec3 } from "./math/vec3";
import { holdExcess, solveGroup, type CandidateOutcome, type SolveHooks } from "./modeSolve";
import { SPEED_EPSILON, classify, contactSlip, landingTime, rollingSpin, type Trajectory } from "./motion";
import type { BallState, MotionParams, MotionPhase, PushMotion } from "./types";

export { ACCELERATION_EPSILON, FOLLOW_EPSILON, HOLD_SLACK } from "./contactModel";
export type { ContactBody, ContactMode, RestingContact } from "./contactModel";

/**
 * Contacts closing slower than this (m/s) are resting contacts, resolved without restitution. A numerical tolerance,
 * not a physical constant: a rebound this slow lifts the gap by at most RESTING_SPEED²/(2a), well under a micrometre
 * for any turf deceleration a, so treating it as inelastic changes no observable outcome.
 */
export const RESTING_SPEED = 1e-3;

/** Largest sine of the angle a pushed ball's slip or velocity, or a contact's slip, may turn within a segment. */
export const DIRECTION_TOLERANCE = 1e-2;

/** Gap (m) beyond which a coupled contact is considered to have separated. */
export const SEPARATION_TOLERANCE = 1e-7;

/** Pivots at or below this make the glue's and the nearest hold's systems singular: their contacts are dependent. */
const PIVOT_TOLERANCE = 1e-12;

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
    /** Per contact: its mode; a coupled contact (pushing, or holding a ball) is "stick" or "slip". */
    readonly modes: readonly ContactMode[];
    /**
     * Per contact: while it slips with friction, the frozen unit slip of a's contact point relative to b's (world
     * coordinates); otherwise null.
     */
    readonly slips: readonly (Vec3 | null)[];
    /**
     * Per body: true when its group fell back to the nearest hold because no exact solution was found. The motion is
     * still sound (no contact converges, no force pulls, the held balls do no work), but not the exact solution.
     */
    readonly approximate: readonly boolean[];
    /**
     * Over the groups that fell back: how far holding every resting ball misses its limits (m/s²; see
     * modeSolve.GroupSolution.excess); 0 when no group fell back.
     */
    readonly holdExcess: number;
    /** Per body: true when a contact or turf slip of the body fell back to approximate-slip directions. */
    readonly approximateSlip: readonly boolean[];
    /** The worst residual (m/s²) of the failed direction solves behind approximateSlip; 0 when none. */
    readonly slipExcess: number;
    /** Per body: true when its group was held because the shot's work budget was spent. */
    readonly budgetHold: readonly boolean[];
    /** Work units the solve spent (see linalg.ts). */
    readonly work: number;
    /** The most candidates any group of the solve tried (diagnostic for MODE_SEARCH_LIMIT). */
    readonly searched: number;
}

/** Options of a resting-contact solve. */
export interface RestingOptions {
    /** Gravity vector (m/s²); −g·ẑ, with g from the first body's params, when omitted. */
    readonly gravity?: Vec3;
    /** Work units the solve may still spend: the shot's remaining budget. Infinity when omitted. */
    readonly budget?: number;
    /** Test seam: see modeSolve.SolveHooks. */
    readonly hooks?: SolveHooks;
}

interface Response {
    readonly phase: MotionPhase;
    /** Free acceleration from the turf (m/s²). */
    readonly force: Vec3;
    /** Effective inertia relative to the ball's mass. */
    readonly weight: number;
}

/** A ball's frictionless view (P2a.1): its free acceleration and effective inertia, used by the glue and the hold. */
function response(s: BallState, p: MotionParams): Response {
    const phase = classify(s, p.radius);
    switch (phase) {
        case "sliding":
            return { phase, force: scale(normalize(contactSlip(s, p.radius)), -p.slidingDecel), weight: 1 };
        case "rolling":
            return { phase, force: scale(normalize(horizontal(s.velocity)), -p.rollingDecel), weight: ROLLING_WEIGHT };
        case "stationary":
            return { phase, force: ZERO, weight: ROLLING_WEIGHT };
        case "airborne":
            return { phase, force: vec3(0, 0, 0 - p.gravity), weight: 1 };
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
 * The frictionless contact constraints of one group, in the form J·x = 0 (touching and not converging) for body
 * accelerations or velocities x. Row k of J maps body i to +n on the body that n points to, −n on the other, and ZERO
 * otherwise.
 */
interface ContactSystem {
    readonly bodies: readonly number[];
    readonly contacts: readonly number[];
    readonly jacobian: (k: number, i: number) => Vec3;
    /** Inverse effective inertia of body i (0 when held at rest). */
    readonly inverseWeight: (i: number) => number;
}

/**
 * Applies the contact impulses (or forces) that make J·x = 0 for the contacts in `active`, starting from `base` (per
 * body): returns the resulting x per body and the multiplier per active contact, or null when the active contacts are
 * not independent.
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
            for (const b of c.fixed ? [c.a] : [c.a, c.b]) {
                const group = byRoot.get(find(b)) ?? [];
                byRoot.set(find(b), group);
                if (!group.includes(b)) {
                    group.push(b);
                }
            }
        }
    });
    return [...byRoot.values()].map((g) => g.sort((x, y) => x - y)).sort((x, y) => (x[0] as number) - (y[0] as number));
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

/**
 * The nearest hold (P2a.1): every resting ball of the group stays at rest and the moving balls are solved against them
 * as fixed, frictionless, compression-only obstacles. That is the strictly convex quadratic programme
 * min Σ ½·wᵢ·|xᵢ − fᵢ|² over the moving balls subject to no contact converging, which x = 0 satisfies, so it has a
 * unique minimiser; its constraints are linear, so KKT multipliers with linearly independent support exist, and the
 * enumeration of active sets reaches that support. So it cannot fail; should rounding spoil every set, the least
 * inconsistent one is kept. The held balls do no work.
 */
function nearestHold(
    group: readonly number[],
    groupContacts: readonly number[],
    responses: ReadonlyMap<number, Response>,
    jacobian: (k: number, i: number) => Vec3,
    closingRate: (x: ReadonlyMap<number, Vec3>, k: number) => number,
): { readonly acceleration: Map<number, Vec3>; readonly active: readonly number[] } {
    const resting = new Set(group.filter((i) => (responses.get(i) as Response).phase === "stationary"));
    const system: ContactSystem = {
        bodies: group,
        contacts: groupContacts,
        jacobian: (k, i) => (resting.has(i) ? ZERO : jacobian(k, i)),
        inverseWeight: (i) => (resting.has(i) ? 0 : 1 / (responses.get(i) as Response).weight),
    };
    const base = new Map(group.map((i) => [i, (responses.get(i) as Response).force]));
    const trial = (
        active: readonly number[],
    ): { readonly active: readonly number[]; readonly x: Map<number, Vec3>; readonly worst: number } | null => {
        const solved = project(system, active, base);
        return solved ? { active, x: solved.result, worst: violation(system, active, solved, closingRate) } : null;
    };
    // The empty set has no multipliers to solve for, so it always projects.
    let best = trial([]) as NonNullable<ReturnType<typeof trial>>;
    for (const active of subsets(groupContacts).slice(1)) {
        if (best.worst <= ACCELERATION_EPSILON) {
            break;
        }
        const next = trial(active);
        if (next && next.worst < best.worst) {
            best = next;
        }
    }
    return { acceleration: best.x, active: best.active };
}

/** The member of a ball moved by the frictionless nearest hold (P2a.1's pushed motion). */
function frictionlessMember(s: BallState, r: Response, x: Vec3, radius: number): RestingMember {
    const still: PushMotion = { acceleration: ZERO, angularAcceleration: ZERO, direction: ZERO };
    if (r.phase === "airborne") {
        // A ball held still in the air by its contacts (perched on others) is snapped to rest: its rounding-level
        // acceleration would otherwise give it a segment that never ends, which the simulator could not schedule.
        if (length(s.velocity) <= SPEED_EPSILON && length(x) <= ACCELERATION_EPSILON) {
            return { state: { ...s, velocity: ZERO }, phase: "airborne", push: still };
        }
        return { state: s, phase: "airborne", push: { acceleration: x, angularAcceleration: ZERO, direction: ZERO } };
    }
    if (r.phase === "stationary") {
        return { state: s, phase: "stationary", push: still };
    }
    if (r.phase === "rolling") {
        return {
            state: s,
            phase: "rolling",
            push: {
                acceleration: x,
                angularAcceleration: vec3(-x.y / radius, x.x / radius, 0),
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

/** The member of ball j of a group solved with friction: its phase and push (the state is the glued one). */
function frictionMember(model: Model, out: CandidateOutcome, j: number): RestingMember {
    const s = (model.bodies[j] as ContactBody).state;
    const ev = out.ev as Evaluated;
    const acceleration = ev.accel[j] as Vec3;
    const angularAcceleration = ev.spin[j] as Vec3;
    const itemDirection = (kind: "release" | "turf-onset"): Vec3 => {
        const q = out.items.findIndex((it) => it.kind === kind && it.index === j);
        return q >= 0 ? (out.directions[q] as Vec3) : ZERO;
    };
    const still: PushMotion = { acceleration: ZERO, angularAcceleration: ZERO, direction: ZERO };
    switch (out.cand.balls[j]) {
        case "held":
            return { state: s, phase: "stationary", push: still };
        case "released":
            return {
                state: s,
                phase: "rolling",
                push: { acceleration, angularAcceleration, direction: itemDirection("release") },
            };
        case "turf-rolling":
            return {
                state: s,
                phase: "rolling",
                push: { acceleration, angularAcceleration, direction: model.frozen[j] as Vec3 },
            };
        case "turf-sliding": {
            const direction = model.classes[j] === "sliding" ? (model.frozen[j] as Vec3) : itemDirection("turf-onset");
            return { state: s, phase: "sliding", push: { acceleration, angularAcceleration, direction } };
        }
        default:
            // In flight. A ball held still in the air by its contacts (perched on others) is snapped to rest, as above.
            if (
                model.classes[j] === "airborne" &&
                length(s.velocity) <= SPEED_EPSILON &&
                length(acceleration) <= ACCELERATION_EPSILON
            ) {
                return { state: { ...s, velocity: ZERO }, phase: "airborne", push: still };
            }
            return { state: s, phase: "airborne", push: { acceleration, angularAcceleration, direction: ZERO } };
    }
}

/** Contact j's frozen unit slip in a solved group, or null when it does not slip with friction. */
function slipOf(model: Model, out: CandidateOutcome, j: number): Vec3 | null {
    if (out.cand.contacts[j] !== "slip" || (model.contacts[j] as RestingContact).friction === 0) {
        return null;
    }
    const g = model.geometry[j] as ContactGeometry;
    if (g.slipping) {
        return g.sHat;
    }
    const q = out.items.findIndex((it) => it.kind === "contact-onset" && it.index === j);
    return q >= 0 ? (out.directions[q] as Vec3) : null;
}

/**
 * Decides which touching contacts push and how every ball involved moves until the next event. `contacts` must all be
 * touching and closing slower than RESTING_SPEED. A contact is kept when it is approaching or when the balls'
 * accelerations drive it together; contacts the solution leaves converging are added until none remain.
 */
export function solveRestingContacts(
    bodies: readonly ContactBody[],
    axes: readonly Vec3[],
    contacts: readonly RestingContact[],
    options: RestingOptions = {},
): RestingSolution {
    return solveContacts(bodies, axes, contacts, false, options);
}

/**
 * Solves as solveRestingContacts does, but with every group taken straight to the nearest hold: balls at rest stay at
 * rest and the moving balls are solved against them. Exported so that the fallback, which the exact search leaves
 * almost unused, can be tested on its own.
 */
export function solveNearestHold(
    bodies: readonly ContactBody[],
    axes: readonly Vec3[],
    contacts: readonly RestingContact[],
    options: RestingOptions = {},
): RestingSolution {
    return solveContacts(bodies, axes, contacts, true, options);
}

function solveContacts(
    bodies: readonly ContactBody[],
    axes: readonly Vec3[],
    contacts: readonly RestingContact[],
    toNearestHold: boolean,
    options: RestingOptions,
): RestingSolution {
    const gravity = options.gravity ?? vec3(0, 0, 0 - ((bodies[0] as ContactBody | undefined)?.params.gravity ?? 0));
    const budget = options.budget ?? Infinity;
    const work = { units: 0 };
    // Offset from ball a's centre to the body it touches: 3D for a ball, horizontal for an obstacle's axis.
    const towards = (c: RestingContact): Vec3 => {
        const a = (bodies[c.a] as ContactBody).state.position;
        return c.fixed ? horizontal(sub(axes[c.b] as Vec3, a)) : sub((bodies[c.b] as ContactBody).state.position, a);
    };
    const normals = contacts.map((c) => normalize(towards(c)));
    const airborne = bodies.map((b) => classify(b.state, b.params.radius) === "airborne");
    // Row k of J for body i: +n on the body n points to, −n on the other; only its horizontal part for a ball on the
    // turf, which cannot move vertically.
    const jacobian = (k: number, i: number): Vec3 => {
        const c = contacts[k] as RestingContact;
        const row = !c.fixed && c.b === i ? (normals[k] as Vec3) : c.a === i ? scale(normals[k] as Vec3, -1) : ZERO;
        return airborne[i] ? row : horizontal(row);
    };
    const closingRate = (x: ReadonlyMap<number, Vec3>, k: number): number => {
        const c = contacts[k] as RestingContact;
        const other = c.fixed ? ZERO : (x.get(c.b) ?? ZERO);
        return dot(sub(x.get(c.a) ?? ZERO, other), normals[k] as Vec3);
    };
    // Converging: approaching, or driven together faster than the turning line of centres needs (normalCurvature).
    const converging = (states: readonly BallState[], acceleration: ReadonlyMap<number, Vec3>, k: number): boolean => {
        const c = contacts[k] as RestingContact;
        const a = states[c.a] as BallState;
        const velocity = c.fixed ? ZERO : (states[c.b] as BallState).velocity;
        const relative = c.fixed ? horizontal(a.velocity) : sub(a.velocity, velocity);
        const closing = approachSpeed(scale(towards(c), -1), relative);
        const curvature = normalCurvature(towards(c), relative);
        return closing > SPEED_EPSILON || closingRate(acceleration, k) - curvature > ACCELERATION_EPSILON;
    };
    const touches = (i: number, k: number): boolean => {
        const c = contacts[k] as RestingContact;
        return c.a === i || (!c.fixed && c.b === i);
    };

    const initial = bodies.map((b) => b.state);
    const freeAccelerations = new Map(bodies.map((b, i) => [i, response(b.state, b.params).force]));
    const kept = contacts.map((_, k) => converging(initial, freeAccelerations, k));

    for (;;) {
        const states = [...initial];
        const members: (RestingMember | null)[] = bodies.map(() => null);
        const modes: ContactMode[] = contacts.map(() => "open");
        const slips: (Vec3 | null)[] = contacts.map(() => null);
        const approximate = bodies.map(() => false);
        const approximateSlip = bodies.map(() => false);
        const budgetHold = bodies.map(() => false);
        let worstHold = 0;
        let slipExcess = 0;
        let searched = 0;
        const acceleration = new Map(freeAccelerations);

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
                new Map(group.map((i) => [i, (initial[i] as BallState).velocity])),
            );
            for (const i of group) {
                const s = initial[i] as BallState;
                const velocity = glued?.result.get(i) ?? s.velocity;
                const phase = (before.get(i) as Response).phase;
                const angularVelocity =
                    phase === "sliding" || phase === "airborne"
                        ? s.angularVelocity
                        : rollingSpin(velocity, s.angularVelocity.z, params(i).radius);
                states[i] = { position: s.position, velocity, angularVelocity };
            }

            // The group's model, its contacts renumbered to the group's balls.
            const local = new Map(group.map((i, j) => [i, j]));
            const model = buildModel(
                group.map((i) => ({ ...(bodies[i] as ContactBody), state: states[i] as BallState })),
                axes,
                groupContacts.map((k) => {
                    const c = contacts[k] as RestingContact;
                    return { ...c, a: local.get(c.a) as number, b: c.fixed ? c.b : (local.get(c.b) as number) };
                }),
                gravity,
            );
            const decision = toNearestHold ? null : solveGroup(model, work, budget, options.hooks);
            searched = Math.max(searched, decision?.tried ?? 0);
            const outcome = decision?.outcome ?? null;
            if (decision && outcome) {
                const ev = outcome.ev as Evaluated;
                groupContacts.forEach((k, j) => {
                    modes[k] = outcome.cand.contacts[j] as ContactMode;
                    slips[k] = slipOf(model, outcome, j);
                });
                if (decision.kind === "approximate-slip") {
                    slipExcess = Math.max(slipExcess, decision.excess);
                    for (const j of decision.slipBalls) {
                        approximateSlip[group[j] as number] = true;
                    }
                }
                group.forEach((i, j) => {
                    const s = states[i] as BallState;
                    acceleration.set(i, ev.accel[j] as Vec3);
                    const touched = groupContacts.some((k) => modes[k] !== "open" && touches(i, k));
                    members[i] = touched
                        ? frictionMember(model, outcome, j)
                        : { state: s, phase: classify(s, params(i).radius), push: null };
                });
                continue;
            }
            // The nearest hold: no exact solution was found, the budget is spent, or the caller asked for it.
            const responses = new Map(group.map((i) => [i, response(states[i] as BallState, params(i))]));
            const held = nearestHold(group, groupContacts, responses, jacobian, closingRate);
            for (const k of held.active) {
                // Coupled, without friction: no slip direction.
                modes[k] = "slip";
            }
            if (decision?.kind === "budget-hold") {
                for (const i of group) {
                    budgetHold[i] = true;
                }
            } else {
                worstHold = Math.max(worstHold, decision ? decision.excess : holdExcess(model, work));
                for (const i of group) {
                    approximate[i] = true;
                }
            }
            for (const i of group) {
                const s = states[i] as BallState;
                const r = responses.get(i) as Response;
                const x = held.acceleration.get(i) as Vec3;
                acceleration.set(i, x);
                members[i] = held.active.some((k) => touches(i, k))
                    ? frictionlessMember(s, r, x, params(i).radius)
                    : { state: s, phase: r.phase, push: null };
            }
        }

        // A group with no exact solution may need a contact its held balls only touch (an upright behind a ball that
        // cannot hold alone), which never converges while the fallback holds them: it takes every such contact before
        // its fallback stands.
        const heldBack = (i: number): boolean => approximate[i] === true && members[i]?.phase === "stationary";
        const widened = (k: number): boolean => {
            const c = contacts[k] as RestingContact;
            return !toNearestHold && (heldBack(c.a) || (!c.fixed && heldBack(c.b)));
        };
        const added = contacts.map((_, k) => !kept[k] && (converging(states, acceleration, k) || widened(k)));
        if (!added.includes(true)) {
            return {
                members,
                modes,
                slips,
                approximate,
                holdExcess: worstHold,
                approximateSlip,
                slipExcess,
                budgetHold,
                work: work.units,
                searched,
            };
        }
        added.forEach((a, k) => {
            kept[k] = kept[k] === true || a;
        });
    }
}

/** Returns the state of a coupled ball a time t after `start`. */
export function pushedState(start: BallState, push: PushMotion, t: number): BallState {
    if (t === 0) {
        return start;
    }
    const v = start.velocity;
    return {
        position: add(add(start.position, scale(v, t)), scale(push.acceleration, 0.5 * t * t)),
        velocity: add(v, scale(push.acceleration, t)),
        angularVelocity: add(start.angularVelocity, scale(push.angularAcceleration, t)),
    };
}

/** Returns the centre trajectory of a coupled ball from `start`. */
export function pushedTrajectory(start: BallState, push: PushMotion): Trajectory {
    return { c0: start.position, c1: start.velocity, c2: scale(push.acceleration, 0.5) };
}

/** Earliest t > 0 at which g0 + g1·t rises through zero from below, or Infinity. */
function risesAt(g0: number, g1: number): number {
    return g0 < 0 && g1 > 0 ? (0 - g0) / g1 : Infinity;
}

/**
 * How long a frozen direction d stays valid for a quantity x(t) = x0 + x1·t: until x reaches zero along d, or turns
 * more than DIRECTION_TOLERANCE away from it, measured along the unit `across` perpendicular to d.
 */
function frozenFor(x0: Vec3, x1: Vec3, d: Vec3, across: Vec3): number {
    const along0 = dot(x0, d);
    const along1 = dot(x1, d);
    const across0 = dot(x0, across);
    const across1 = dot(x1, across);
    return Math.min(
        risesAt(0 - along0, 0 - along1),
        risesAt(across0 - DIRECTION_TOLERANCE * along0, across1 - DIRECTION_TOLERANCE * along1),
        risesAt(0 - across0 - DIRECTION_TOLERANCE * along0, 0 - across1 - DIRECTION_TOLERANCE * along1),
    );
}

/**
 * Returns how long the frozen turf force of a coupled ball stays valid: until its slip (sliding) or velocity
 * (rolling) reaches zero along the frozen direction, or turns more than DIRECTION_TOLERANCE away from it. Both are
 * linear in time within the segment. Infinity for a ball held at rest or one that is only speeding up. A ball in
 * flight has no turf force; its push lasts until it lands.
 */
export function pushDuration(start: BallState, phase: MotionPhase, push: PushMotion, radius: number): number {
    if (phase === "stationary") {
        return Infinity;
    }
    if (phase === "airborne") {
        return landingTime(start.position.z - radius, start.velocity.z, push.acceleration.z);
    }
    const a = push.acceleration;
    const w = push.angularAcceleration;
    const x0 = phase === "sliding" ? contactSlip(start, radius) : horizontal(start.velocity);
    const x1 = phase === "sliding" ? vec3(a.x - radius * w.y, a.y + radius * w.x, 0) : horizontal(a);
    const d = push.direction;
    // In the plane, perpendicular to d: (d.y, −d.x, 0), so that x·across is P2a.1's x.x·d.y − x.y·d.x.
    return frozenFor(x0, x1, d, vec3(d.y, 0 - d.x, 0));
}

/**
 * Returns how long a slipping contact's frozen slip direction stays valid (design §5): until the slip of a's contact
 * point relative to b's, Pₜ[(v_a − v_b) + R·(ω_a + ω_b) × n] (linear in time within the segment), reaches zero along
 * the frozen unit `slip`, or turns more than DIRECTION_TOLERANCE away from it. Infinity when it only grows along it.
 * `b` and `pushB` are null against an obstacle.
 */
export function contactSlipDuration(
    a: BallState,
    pushA: PushMotion,
    b: BallState | null,
    pushB: PushMotion | null,
    normal: Vec3,
    slip: Vec3,
    radius: number,
): number {
    const tangential = (v: Vec3): Vec3 => sub(v, scale(normal, dot(v, normal)));
    const relative = (va: Vec3, wa: Vec3, vb: Vec3, wb: Vec3): Vec3 =>
        tangential(add(sub(va, vb), scale(cross(add(wa, wb), normal), radius)));
    const s0 = relative(a.velocity, a.angularVelocity, b?.velocity ?? ZERO, b?.angularVelocity ?? ZERO);
    const s1 = relative(
        pushA.acceleration,
        pushA.angularAcceleration,
        pushB?.acceleration ?? ZERO,
        pushB?.angularAcceleration ?? ZERO,
    );
    return frozenFor(s0, s1, slip, cross(normal, slip));
}
