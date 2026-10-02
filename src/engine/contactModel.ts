/**
 * The contact model of one group of touching bodies (P2a.2 design §4; spec §5, "Pushing contacts carry Coulomb
 * friction" and the paragraphs after it).
 *
 * A candidate assigns a mode to every ball and every contact. For one candidate, with every unknown direction given,
 * the motion is one square, sparse, non-symmetric linear system in:
 * - per held ball: its static turf friction F and rolling resistance Q (in the turf plane); centre and spin locked;
 * - per rolling or released ball: its acceleration a and static turf friction F (in the turf plane); the spin follows
 *   a (rolling without slip) and the spin about the turf normal is locked;
 * - per sliding ball: a (in the turf plane) and the angular acceleration α (3D); turf friction μs·L against its slip;
 * - per ball in flight: a and α (3D) under gravity, with no turf;
 * - per coupled contact: its normal force N and, while it sticks, its two tangential force components.
 * Forces are mass-normalised (m/s²). A contact force P on body b (−P on a) acts at R·ê from each centre (ê = n on a,
 * −n on b), so it torques both balls: (2/5)·R·α = Σ ê × P, plus (−normal) × F for the turf force at the patch. The
 * turf's load on a ball is L = −g⃗·normal − Σ P·normal, and turf friction and rolling resistance scale with it. Rolling
 * resistance acts through the centre with no moment, so a rolling ball obeys 7/5·a = Σ[P_h(1 + ê_z) − ê_h·P_z] + Q and
 * a held ball needs F = Σ(ê_z·P_h − ê_h·P_z) of static turf friction. Every equation is written with each ball's turf
 * normal and the gravity vector, never z components, so a sloping surface changes inputs, not equations.
 *
 * A direction that is not known in advance (a ball released from rest, a turf slip or contact slip that starts) enters
 * linearly through a given unit vector; modeSolve.ts closes it with Newton's method.
 */
import { CONVEX_SLACK, type Cone } from "./convexSolve";
import { normalCurvature } from "./detect";
import { accumulate, affine, denseRow, linearValue, scaled, valueOf, variable, type Affine } from "./linalg";
import { ZERO, add, cross, dot, horizontal, length, normalize, scale, sub, vec3, type Vec3 } from "./math/vec3";
import { SPEED_EPSILON, classify } from "./motion";
import type { BallState, MotionParams, MotionPhase } from "./types";

/** Effective inertia of a rolling solid sphere relative to its mass: (m + I/r²)/m with I = 2/5·m·r². */
export const ROLLING_WEIGHT = 7 / 5;

/** Contact and turf forces (m/s²) within this of a limit count as within it. A numerical tolerance. */
export const FORCE_EPSILON = 1e-9;

/** Relative accelerations (m/s²) at or below this are treated as zero when deciding whether bodies converge. */
export const ACCELERATION_EPSILON = 1e-9;

/**
 * A direction solve's root is accepted only if the quantity the direction must follow has more than this (m/s²) along
 * it (and is aligned with it: modeSolve.ts). Without it, spurious roots with |w| ≈ 1e-15 release balls that hold. It is
 * far below HOLD_SLACK because a ball released together with another just past their common limit of holding moves at
 * a rate of order the other's squared (about 1e-10 m/s² on P2a.1's bent chain), while holding it alone misses by far
 * more than HOLD_SLACK. A numerical tolerance.
 */
export const FOLLOW_EPSILON = 1e-12;

/**
 * Held balls' limits are relaxed by this (m/s²). It is at least 7/5·FOLLOW_EPSILON, so no single ball near a limit
 * of holding is rejected both as held and as released (two releasing together can be: modeSolve.ts NEAR_HOLD_SLACK).
 * Its effect on a limit is HOLD_SLACK divided by the margin's slope: 5.6e-9 rad on the bent line of design §6. A
 * numerical tolerance.
 */
export const HOLD_SLACK = 1e-8;

/**
 * The relaxation of held balls' cones: 2·CONVEX_SLACK inside HOLD_SLACK, so that forces the convex solve returns (which
 * may miss their cones by up to 1.5·CONVEX_SLACK, or sit on them to rounding) pass inconsistency()'s HOLD_SLACK test.
 */
const HELD_CONE_SLACK = HOLD_SLACK - 2 * CONVEX_SLACK;

/** Below this length the cross product of the turf normal and a contact normal has no direction. */
const DIRECTION_GUARD = 1e-12;

/** A ball taking part in a resting-contact solve. */
export interface ContactBody {
    readonly state: BallState;
    readonly params: MotionParams;
    /** Unit normal of the turf under the ball (ẑ in v1). */
    readonly turfNormal: Vec3;
    /**
     * The turf's grip against spin about its normal while the patch does not slip (spec §5 limitations). v1 models no
     * finite grip: it must be Infinity (buildModel refuses anything else).
     */
    readonly pivotCapacity: number;
}

/** A touching contact: ball `a` against ball `b`, or against the fixed cylinder whose axis is `axes[b]`. */
export interface RestingContact {
    readonly a: number;
    readonly b: number;
    readonly fixed: boolean;
    /** Coulomb coefficient of the contact's materials. */
    readonly friction: number;
}

export type BallMode = "held" | "released" | "turf-rolling" | "turf-sliding" | "airborne";
export type ContactMode = "open" | "stick" | "slip";

/** A mode for every ball and every contact of a group. */
export interface Candidate {
    readonly balls: readonly BallMode[];
    readonly contacts: readonly ContactMode[];
}

export type DirectionKind = "release" | "turf-onset" | "contact-onset";

/** A direction the candidate leaves unknown, in the plane spanned by e1 and e2. */
export interface DirectionItem {
    readonly kind: DirectionKind;
    /** Ball index (release, turf-onset) or contact index (contact-onset). */
    readonly index: number;
    readonly e1: Vec3;
    readonly e2: Vec3;
}

/** A contact's frozen geometry at the segment start. */
export interface ContactGeometry {
    /** Unit normal from a towards b (horizontal towards an obstacle's vertical axis). */
    readonly n: Vec3;
    /** Unit tangents: t1 = normal × n (turf normal of ball a), t2 = n × t1. */
    readonly t1: Vec3;
    readonly t2: Vec3;
    /** Tangential slip of a's contact point relative to b's: Pₜ[(v_a − v_b) + R·(ω_a + ω_b) × n]. */
    readonly slip: Vec3;
    readonly slipping: boolean;
    /** Unit slip while slipping, else ZERO. */
    readonly sHat: Vec3;
    /**
     * The relative acceleration (m/s²) towards each other that keeps the pair touching as the line of centres turns
     * (detect.ts `normalCurvature`): a closed contact's closing rate equals it, and an open one must close more slowly
     * than it.
     */
    readonly curvature: number;
}

/** One group, ready for candidates. */
export interface Model {
    readonly bodies: readonly ContactBody[];
    readonly axes: readonly Vec3[];
    readonly contacts: readonly RestingContact[];
    /** Gravity vector (m/s²): −g·ẑ in v1. */
    readonly gravity: Vec3;
    readonly classes: readonly MotionPhase[];
    /** Per ball: an orthonormal basis of its turf plane. */
    readonly planes: readonly (readonly [Vec3, Vec3])[];
    readonly geometry: readonly ContactGeometry[];
    /** Per ball: unit direction of travel (rolling), unit turf slip (sliding), else ZERO. */
    readonly frozen: readonly Vec3[];
}

/** Sliding coefficient μs of a ball's turf. */
export function muS(p: MotionParams): number {
    return p.slidingDecel / p.gravity;
}

/** Rolling resistance as a fraction of the load: 7/5·μr. */
export function rollCap(p: MotionParams): number {
    return (ROLLING_WEIGHT * p.rollingDecel) / p.gravity;
}

/** An orthonormal basis (e1, e2) of the plane normal to `up`; exactly (x̂, ŷ) for ẑ. */
export function turfPlane(up: Vec3): readonly [Vec3, Vec3] {
    const seed = Math.abs(up.x) < 0.9 ? vec3(1, 0, 0) : vec3(0, 1, 0);
    const e1 = normalize(sub(seed, scale(up, dot(seed, up))));
    return [e1, cross(up, e1)];
}

function inPlane(v: Vec3, up: Vec3): Vec3 {
    return sub(v, scale(up, dot(v, up)));
}

/** The velocity of a ball's turf contact point, v + ω × (−R·normal). */
function turfSlip(s: BallState, up: Vec3, radius: number): Vec3 {
    return add(s.velocity, cross(s.angularVelocity, scale(up, 0 - radius)));
}

function contactGeometry(
    bodies: readonly ContactBody[],
    axes: readonly Vec3[],
    planes: readonly (readonly [Vec3, Vec3])[],
    c: RestingContact,
): ContactGeometry {
    const a = bodies[c.a] as ContactBody;
    const radius = a.params.radius;
    // Obstacles are vertical cylinders: the normal towards one is horizontal whatever the turf.
    const n = c.fixed
        ? normalize(horizontal(sub(axes[c.b] as Vec3, a.state.position)))
        : normalize(sub((bodies[c.b] as ContactBody).state.position, a.state.position));
    const across = cross(a.turfNormal, n);
    const t1 = length(across) > DIRECTION_GUARD ? normalize(across) : (planes[c.a] as readonly [Vec3, Vec3])[0];
    const t2 = cross(n, t1);
    const other = c.fixed ? null : (bodies[c.b] as ContactBody).state;
    const spin = other ? add(a.state.angularVelocity, other.angularVelocity) : a.state.angularVelocity;
    const relative = add(sub(a.state.velocity, other ? other.velocity : ZERO), scale(cross(spin, n), radius));
    const slip = sub(relative, scale(n, dot(relative, n)));
    const slipping = c.friction > 0 && length(slip) > SPEED_EPSILON;
    const curvature = other
        ? normalCurvature(sub(other.position, a.state.position), sub(a.state.velocity, other.velocity))
        : normalCurvature(horizontal(sub(axes[c.b] as Vec3, a.state.position)), horizontal(a.state.velocity));
    return { n, t1, t2, slip, slipping, sHat: slipping ? normalize(slip) : ZERO, curvature };
}

/**
 * Builds the model of one group with the given gravity vector. Throws RangeError for a finite pivot capacity, which
 * v1 does not model (spec §5 limitations).
 */
export function buildModel(
    bodies: readonly ContactBody[],
    axes: readonly Vec3[],
    contacts: readonly RestingContact[],
    gravity: Vec3,
): Model {
    for (const b of bodies) {
        if (b.pivotCapacity !== Infinity) {
            throw new RangeError("a finite pivot capacity is not modelled in v1");
        }
    }
    const classes = bodies.map((b) => classify(b.state, b.params.radius));
    const planes = bodies.map((b) => turfPlane(b.turfNormal));
    const frozen = bodies.map((b, i) => {
        const up = b.turfNormal;
        if (classes[i] === "rolling") {
            return normalize(inPlane(b.state.velocity, up));
        }
        if (classes[i] === "sliding") {
            return normalize(inPlane(turfSlip(b.state, up, b.params.radius), up));
        }
        return ZERO;
    });
    const geometry = contacts.map((c) => contactGeometry(bodies, axes, planes, c));
    return { bodies, axes, contacts, gravity, classes, planes, geometry, frozen };
}

/**
 * The modes the search enumerates for a ball of each class, in the design's order (§4 step 6). Lift-off (a turf ball
 * in the airborne mode) is not enumerated: the search derives it from a candidate's low loads (see lowLoad).
 */
export function ballOptions(c: MotionPhase): readonly BallMode[] {
    switch (c) {
        case "stationary":
            return ["held", "released", "turf-sliding"];
        case "rolling":
            return ["turf-rolling", "turf-sliding"];
        case "sliding":
            return ["turf-sliding"];
        case "airborne":
            return ["airborne"];
    }
}

/** The modes contact k may take, in order. A slipping contact cannot stick at the segment start. */
export function contactOptions(model: Model, k: number): readonly ContactMode[] {
    const c = model.contacts[k] as RestingContact;
    if (c.friction === 0 || (model.geometry[k] as ContactGeometry).slipping) {
        return ["slip", "open"];
    }
    return ["stick", "slip", "open"];
}

/** True when contact k joins two held balls, or a held ball and an obstacle: its forces are static. */
export function isStatic(model: Model, balls: readonly BallMode[], k: number): boolean {
    const c = model.contacts[k] as RestingContact;
    return balls[c.a] === "held" && (c.fixed || balls[c.b] === "held");
}

/**
 * The candidate as it is solved: a contact between held bodies is coupled and stuck (slipping at μ = 0, which is the
 * same), whatever the candidate said, because the held balls' static forces settle it (design §4 step 6). Below a
 * limit of holding such forces are not unique; the minimum-norm rule picks them (modeSolve.ts).
 */
export function settled(model: Model, cand: Candidate): Candidate {
    return {
        balls: cand.balls,
        contacts: cand.contacts.map((m, k) =>
            isStatic(model, cand.balls, k)
                ? (model.contacts[k] as RestingContact).friction > 0
                    ? "stick"
                    : "slip"
                : m,
        ),
    };
}

/** A key that identifies a settled candidate. */
export function candidateKey(cand: Candidate): string {
    return `${cand.balls.join(",")}|${cand.contacts.join(",")}`;
}

/** The directions a candidate leaves unknown, balls first, then contacts, each in index order. */
export function directionItems(model: Model, cand: Candidate): DirectionItem[] {
    const items: DirectionItem[] = [];
    cand.balls.forEach((mode, i) => {
        const cls = model.classes[i];
        const [e1, e2] = model.planes[i] as readonly [Vec3, Vec3];
        if (cls === "stationary" && mode === "released") {
            items.push({ kind: "release", index: i, e1, e2 });
        } else if ((cls === "stationary" || cls === "rolling") && mode === "turf-sliding") {
            items.push({ kind: "turf-onset", index: i, e1, e2 });
        }
    });
    cand.contacts.forEach((mode, k) => {
        const g = model.geometry[k] as ContactGeometry;
        if (mode === "slip" && (model.contacts[k] as RestingContact).friction > 0 && !g.slipping) {
            items.push({ kind: "contact-onset", index: k, e1: g.t1, e2: g.t2 });
        }
    });
    return items;
}

/** A vector of affine forms: its x, y and z components. */
export type VectorForm = readonly [Affine, Affine, Affine];

function vzero(): [Affine, Affine, Affine] {
    return [affine(), affine(), affine()];
}

/** The vector form f·v (zero components stay empty). */
function along(f: Affine, v: Vec3): [Affine, Affine, Affine] {
    return [
        v.x === 0 ? affine() : scaled(f, v.x),
        v.y === 0 ? affine() : scaled(f, v.y),
        v.z === 0 ? affine() : scaled(f, v.z),
    ];
}

function vaccumulate(acc: [Affine, Affine, Affine], a: VectorForm, s: number): void {
    accumulate(acc[0], a[0], s);
    accumulate(acc[1], a[1], s);
    accumulate(acc[2], a[2], s);
}

/** v × A for a constant vector v. */
function vcross(v: Vec3, a: VectorForm): [Affine, Affine, Affine] {
    const r = vzero();
    accumulate(r[0], a[2], v.y);
    accumulate(r[0], a[1], 0 - v.z);
    accumulate(r[1], a[0], v.z);
    accumulate(r[1], a[2], 0 - v.x);
    accumulate(r[2], a[1], v.x);
    accumulate(r[2], a[0], 0 - v.y);
    return r;
}

function vdot(a: VectorForm, v: Vec3): Affine {
    const r = affine();
    accumulate(r, a[0], v.x);
    accumulate(r, a[1], v.y);
    accumulate(r, a[2], v.z);
    return r;
}

/** The vector form e1·x[base] + e2·x[base + 1]. */
function inPlaneForm(base: number, [e1, e2]: readonly [Vec3, Vec3]): [Affine, Affine, Affine] {
    const r = along(variable(base), e1);
    vaccumulate(r, along(variable(base + 1), e2), 1);
    return r;
}

function components(base: number): [Affine, Affine, Affine] {
    return [variable(base), variable(base + 1), variable(base + 2)];
}

/** The value of a vector form at x. */
export function vectorValue(f: VectorForm, x: readonly number[]): Vec3 {
    return vec3(valueOf(f[0], x), valueOf(f[1], x), valueOf(f[2], x));
}

/** The change of a vector form when x changes by dx. */
export function vectorLinear(f: VectorForm, dx: readonly number[]): Vec3 {
    return vec3(linearValue(f[0], dx), linearValue(f[1], dx), linearValue(f[2], dx));
}

/** One candidate's linear system A·x = b and the quantities it determines, as forms over x. */
export interface System {
    readonly size: number;
    readonly A: number[][];
    readonly b: number[];
    /** Per ball: acceleration, angular acceleration, turf friction F, rolling resistance Q, load L. */
    readonly accel: readonly VectorForm[];
    readonly spin: readonly VectorForm[];
    readonly turf: readonly VectorForm[];
    readonly resist: readonly VectorForm[];
    readonly load: readonly Affine[];
    /** Per contact: the force on b (zero when open) and its normal component N. */
    readonly force: readonly VectorForm[];
    readonly normal: readonly Affine[];
    /** Per contact: acceleration of a's contact point relative to b's, with the geometry frozen. */
    readonly relative: readonly VectorForm[];
    /** Per direction item: the quantity its direction must follow (acceleration, turf slip rate, contact slip rate). */
    readonly follow: readonly VectorForm[];
}

/** Unknowns per ball mode: see the module comment. */
const UNKNOWNS: Readonly<Record<BallMode, number>> = {
    held: 4,
    released: 4,
    "turf-rolling": 4,
    "turf-sliding": 5,
    airborne: 6,
};

const AXES: readonly Vec3[] = [vec3(1, 0, 0), vec3(0, 1, 0), vec3(0, 0, 1)];

/**
 * Assembles one candidate's system for the given unit directions (one per direction item; the system is linear in
 * each). The candidate must be settled (see settled). Rows, in order: per ball its linear rows (in-plane on the turf,
 * 3D in flight) and its angular rows (in-plane while the spin about the turf normal is locked, else 3D); per coupled
 * contact its closing row and, while it sticks, its two tangential rows. Unknowns, in order: per ball by mode
 * (held: F, Q; rolling or released: a, F; sliding: a, α; in flight: a, α), then per coupled contact N (and T₁, T₂).
 */
export function assemble(
    model: Model,
    cand: Candidate,
    items: readonly DirectionItem[],
    dirs: readonly Vec3[],
): System {
    const { bodies, contacts, geometry, gravity } = model;
    const ballDirection = new Map<number, Vec3>();
    const contactDirection = new Map<number, Vec3>();
    items.forEach((it, j) => {
        (it.kind === "contact-onset" ? contactDirection : ballDirection).set(it.index, dirs[j] as Vec3);
    });

    let size = 0;
    const ballBase = cand.balls.map((mode) => {
        const base = size;
        size += UNKNOWNS[mode];
        return base;
    });
    const contactBase = contacts.map((c, k) => {
        if (cand.contacts[k] === "open") {
            return -1;
        }
        const base = size;
        size += cand.contacts[k] === "stick" && c.friction > 0 ? 3 : 1;
        return base;
    });
    const n = size;

    // Contact forces on b: N·n, plus the stuck tangential force or μN along the (frozen or unknown) slip.
    const normal: Affine[] = [];
    const force: VectorForm[] = [];
    contacts.forEach((c, k) => {
        const g = geometry[k] as ContactGeometry;
        const base = contactBase[k] as number;
        if (base < 0) {
            normal.push(affine());
            force.push(vzero());
            return;
        }
        const N = variable(base);
        const P = along(N, g.n);
        if (c.friction > 0) {
            if (cand.contacts[k] === "stick") {
                vaccumulate(P, along(variable(base + 1), g.t1), 1);
                vaccumulate(P, along(variable(base + 2), g.t2), 1);
            } else {
                vaccumulate(P, along(N, g.slipping ? g.sHat : (contactDirection.get(k) ?? ZERO)), c.friction);
            }
        }
        normal.push(N);
        force.push(P);
    });

    const accel: VectorForm[] = [];
    const spin: VectorForm[] = [];
    const turf: VectorForm[] = [];
    const resist: VectorForm[] = [];
    const load: Affine[] = [];
    const rows: Affine[] = [];
    bodies.forEach((body, i) => {
        const radius = body.params.radius;
        const up = body.turfNormal;
        const plane = model.planes[i] as readonly [Vec3, Vec3];
        // Σ P on the ball and Σ ê × P.
        const sum = vzero();
        const moment = vzero();
        contacts.forEach((c, k) => {
            if (cand.contacts[k] === "open") {
                return;
            }
            const g = geometry[k] as ContactGeometry;
            if (c.a === i) {
                vaccumulate(sum, force[k] as VectorForm, -1);
                vaccumulate(moment, vcross(g.n, force[k] as VectorForm), -1);
            }
            if (!c.fixed && c.b === i) {
                vaccumulate(sum, force[k] as VectorForm, 1);
                vaccumulate(moment, vcross(scale(g.n, -1), force[k] as VectorForm), 1);
            }
        });
        // L = −g⃗·normal − Σ P·normal.
        const L = affine(0 - dot(gravity, up));
        accumulate(L, vdot(sum, up), -1);
        load.push(L);
        const base = ballBase[i] as number;
        const mode = cand.balls[i] as BallMode;
        let a: [Affine, Affine, Affine];
        let w: [Affine, Affine, Affine];
        let F: [Affine, Affine, Affine] = vzero();
        let Q: [Affine, Affine, Affine] = vzero();
        switch (mode) {
            case "held":
                a = vzero();
                w = vzero();
                F = inPlaneForm(base, plane);
                Q = inPlaneForm(base + 2, plane);
                break;
            case "released":
            case "turf-rolling": {
                a = inPlaneForm(base, plane);
                // Rolling without slip: α = (normal × a)/R, with no spin about the normal.
                w = vzero();
                vaccumulate(w, vcross(up, a), 1 / radius);
                F = inPlaneForm(base + 2, plane);
                const d = mode === "released" ? (ballDirection.get(i) ?? ZERO) : (model.frozen[i] as Vec3);
                Q = along(scaled(L, 0 - rollCap(body.params)), d);
                break;
            }
            case "turf-sliding": {
                a = inPlaneForm(base, plane);
                w = components(base + 2);
                const d = model.classes[i] === "sliding" ? (model.frozen[i] as Vec3) : (ballDirection.get(i) ?? ZERO);
                F = along(scaled(L, 0 - muS(body.params)), d);
                break;
            }
            case "airborne":
                a = components(base);
                w = components(base + 3);
                break;
        }
        accel.push(a);
        spin.push(w);
        turf.push(F);
        resist.push(Q);
        // Linear: a − ΣP − F − Q − g⃗ = 0, in-plane on the turf (the turf takes the normal part), 3D in flight.
        const linear = vzero();
        vaccumulate(linear, a, 1);
        vaccumulate(linear, sum, -1);
        vaccumulate(linear, F, -1);
        vaccumulate(linear, Q, -1);
        linear[0].c -= gravity.x;
        linear[1].c -= gravity.y;
        linear[2].c -= gravity.z;
        // Angular, divided by R: (2/5)·R·α − (−normal × F) − Σ ê × P = 0. While the spin about the normal is locked
        // the turf takes any torque about it, so only the in-plane components are equations.
        const angular = vzero();
        vaccumulate(angular, w, 0.4 * radius);
        vaccumulate(angular, vcross(scale(up, -1), F), -1);
        vaccumulate(angular, moment, -1);
        const free = mode === "airborne" || mode === "turf-sliding";
        for (const e of mode === "airborne" ? AXES : plane) {
            rows.push(vdot(linear, e));
        }
        for (const e of free ? AXES : plane) {
            rows.push(vdot(angular, e));
        }
    });

    const relative: VectorForm[] = contacts.map((c, k) => {
        const g = geometry[k] as ContactGeometry;
        const radius = (bodies[c.a] as ContactBody).params.radius;
        const q = vzero();
        vaccumulate(q, accel[c.a] as VectorForm, 1);
        // R·α × n = (−R·n) × α, for both balls (b's contact point is at −R·n from its centre).
        vaccumulate(q, vcross(scale(g.n, 0 - radius), spin[c.a] as VectorForm), 1);
        if (!c.fixed) {
            vaccumulate(q, accel[c.b] as VectorForm, -1);
            vaccumulate(q, vcross(scale(g.n, 0 - radius), spin[c.b] as VectorForm), 1);
        }
        return q;
    });
    contacts.forEach((c, k) => {
        if (cand.contacts[k] === "open") {
            return;
        }
        const g = geometry[k] as ContactGeometry;
        // Closing rate (a_a − a_b)·n = |v_t|²/d (the centres', which equals the contact points' normal rate): the pair
        // stays touching as the line of centres turns, so the contact force includes the share that turns it.
        const closing = vdot(accel[c.a] as VectorForm, g.n);
        if (!c.fixed) {
            accumulate(closing, vdot(accel[c.b] as VectorForm, g.n), -1);
        }
        closing.c -= g.curvature;
        rows.push(closing);
        if (cand.contacts[k] === "stick" && c.friction > 0) {
            rows.push(vdot(relative[k] as VectorForm, g.t1));
            rows.push(vdot(relative[k] as VectorForm, g.t2));
        }
    });

    if (rows.length !== n) {
        throw new Error(`contact system not square: ${rows.length} rows, ${n} unknowns`);
    }
    const follow = items.map((it): VectorForm => {
        if (it.kind === "release") {
            return accel[it.index] as VectorForm;
        }
        if (it.kind === "turf-onset") {
            // Turf slip rate a − R·α × normal = a + R·normal × α.
            const body = bodies[it.index] as ContactBody;
            const u = vzero();
            vaccumulate(u, accel[it.index] as VectorForm, 1);
            vaccumulate(u, vcross(body.turfNormal, spin[it.index] as VectorForm), body.params.radius);
            return u;
        }
        return relative[it.index] as VectorForm;
    });
    return {
        size: n,
        A: rows.map((r) => denseRow(r, n)),
        b: rows.map((r) => 0 - r.c),
        accel,
        spin,
        turf,
        resist,
        load,
        force,
        normal,
        relative,
        follow,
    };
}

/** A solved candidate's quantities. */
export interface Evaluated {
    readonly accel: readonly Vec3[];
    readonly spin: readonly Vec3[];
    readonly turf: readonly Vec3[];
    readonly resist: readonly Vec3[];
    readonly load: readonly number[];
    readonly force: readonly Vec3[];
    readonly normal: readonly number[];
    readonly relative: readonly Vec3[];
}

/** Evaluates a system's quantities at the solution x. */
export function evaluate(sys: System, x: readonly number[]): Evaluated {
    return {
        accel: sys.accel.map((v) => vectorValue(v, x)),
        spin: sys.spin.map((v) => vectorValue(v, x)),
        turf: sys.turf.map((v) => vectorValue(v, x)),
        resist: sys.resist.map((v) => vectorValue(v, x)),
        load: sys.load.map((l) => valueOf(l, x)),
        force: sys.force.map((v) => vectorValue(v, x)),
        normal: sys.normal.map((l) => valueOf(l, x)),
        relative: sys.relative.map((v) => vectorValue(v, x)),
    };
}

function tangentialLength(P: Vec3, n: Vec3): number {
    return length(sub(P, scale(n, dot(P, n))));
}

/**
 * Why a solved candidate is not consistent, or null when it is (design §4, "Consistency of a candidate"; the
 * direction criteria are modeSolve.ts's). Every coupled N ≥ 0 and no open contact converges; a stuck contact's
 * tangential force is within μN; a turf ball's load is positive; a held ball is within its resistance and static turf
 * friction (each relaxed by `holdSlack`, HOLD_SLACK unless given); a rolling ball's static turf friction is within
 * μs·L; a turf ball that left the turf does not accelerate into it.
 */
export function inconsistency(model: Model, cand: Candidate, ev: Evaluated, holdSlack = HOLD_SLACK): string | null {
    const { contacts, geometry, bodies } = model;
    for (let k = 0; k < contacts.length; k++) {
        const c = contacts[k] as RestingContact;
        const g = geometry[k] as ContactGeometry;
        if (cand.contacts[k] === "open") {
            const closing = dot(sub(ev.accel[c.a] as Vec3, c.fixed ? ZERO : (ev.accel[c.b] as Vec3)), g.n);
            if (closing - g.curvature > ACCELERATION_EPSILON) {
                return `open contact ${k} converges (${closing})`;
            }
            continue;
        }
        const N = ev.normal[k] as number;
        if (N < 0 - FORCE_EPSILON) {
            return `contact ${k} pulls (N = ${N})`;
        }
        if (cand.contacts[k] === "stick" && c.friction > 0) {
            const T = tangentialLength(ev.force[k] as Vec3, g.n);
            if (T > c.friction * N + FORCE_EPSILON) {
                return `contact ${k} outside its cone (|T| = ${T}, μN = ${c.friction * N})`;
            }
        }
    }
    for (let i = 0; i < bodies.length; i++) {
        const mode = cand.balls[i] as BallMode;
        const p = (bodies[i] as ContactBody).params;
        if (mode === "airborne") {
            const up = (bodies[i] as ContactBody).turfNormal;
            const rise = dot(ev.accel[i] as Vec3, up);
            if (model.classes[i] !== "airborne" && rise < 0 - ACCELERATION_EPSILON) {
                return `ball ${i} lifted but accelerates into the turf (${rise})`;
            }
            continue;
        }
        const L = ev.load[i] as number;
        if (L <= 0) {
            return `ball ${i} load ${L} ≤ 0 (it leaves the turf)`;
        }
        const F = length(ev.turf[i] as Vec3);
        if (mode === "held") {
            const Q = length(ev.resist[i] as Vec3);
            if (Q > rollCap(p) * L + holdSlack) {
                return `held ball ${i} beyond its resistance (${Q} > ${rollCap(p) * L})`;
            }
            if (F > muS(p) * L + holdSlack) {
                return `held ball ${i} beyond its static turf friction (${F} > ${muS(p) * L})`;
            }
        }
        if ((mode === "turf-rolling" || mode === "released") && F > muS(p) * L + FORCE_EPSILON) {
            return `rolling ball ${i} needs turf friction ${F} > μs·L = ${muS(p) * L}`;
        }
    }
    return null;
}

/** The balls on the turf whose load a solved candidate makes zero or negative: they leave the turf (spec §5). */
export function lowLoad(model: Model, cand: Candidate, ev: Evaluated): number[] {
    return cand.balls.flatMap((mode, i) => (mode !== "airborne" && (ev.load[i] as number) <= 0 ? [i] : []));
}

/** The tangential part of a force form, P − n·(n·P), as three component forms. */
function tangential(P: VectorForm, n: Vec3): Affine[] {
    const normalPart = vdot(P, n);
    const comps = [n.x, n.y, n.z] as const;
    return ([0, 1, 2] as const).map((axis) => {
        const r = affine();
        accumulate(r, P[axis], 1);
        accumulate(r, normalPart, 0 - comps[axis]);
        return r;
    });
}

/**
 * The candidate's convex conditions as cones over the unknowns (the same conditions inconsistency() checks, apart
 * from open contacts, which do not depend on the free forces): N ≥ 0, stuck forces within μN, turf loads ≥ 0, rolling
 * balls' static turf friction within μs·L, held balls' resistance and static turf friction within their limits
 * (relaxed by HELD_CONE_SLACK, inside inconsistency()'s HOLD_SLACK), and a lifted ball not accelerating into the
 * turf. Used by the minimum-norm choice of free forces (modeSolve.ts).
 */
export function cones(model: Model, cand: Candidate, sys: System): Cone[] {
    const out: Cone[] = [];
    model.contacts.forEach((c, k) => {
        if (cand.contacts[k] === "open") {
            return;
        }
        const N = sys.normal[k] as Affine;
        out.push({ u: [], v: N, slack: CONVEX_SLACK });
        if (cand.contacts[k] === "stick" && c.friction > 0) {
            const g = model.geometry[k] as ContactGeometry;
            out.push({ u: tangential(sys.force[k] as VectorForm, g.n), v: scaled(N, c.friction), slack: CONVEX_SLACK });
        }
    });
    cand.balls.forEach((mode, i) => {
        const body = model.bodies[i] as ContactBody;
        const [e1, e2] = model.planes[i] as readonly [Vec3, Vec3];
        if (mode === "airborne") {
            if (model.classes[i] !== "airborne") {
                out.push({ u: [], v: vdot(sys.accel[i] as VectorForm, body.turfNormal), slack: CONVEX_SLACK });
            }
            return;
        }
        const L = sys.load[i] as Affine;
        const planar = (f: VectorForm): Affine[] => [vdot(f, e1), vdot(f, e2)];
        out.push({ u: [], v: L, slack: CONVEX_SLACK });
        if (mode === "held") {
            out.push({ u: planar(sys.turf[i] as VectorForm), v: scaled(L, muS(body.params)), slack: HELD_CONE_SLACK });
            out.push({
                u: planar(sys.resist[i] as VectorForm),
                v: scaled(L, rollCap(body.params)),
                slack: HELD_CONE_SLACK,
            });
        } else if (mode === "turf-rolling" || mode === "released") {
            out.push({ u: planar(sys.turf[i] as VectorForm), v: scaled(L, muS(body.params)), slack: CONVEX_SLACK });
        }
    });
    return out;
}
