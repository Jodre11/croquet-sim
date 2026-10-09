/**
 * The turf bed (P2b.2b.2b.2a design §4): a Winkler bed of square Kelvin–Voigt cells that a ball presses down and that
 * recovers at a finite rate. Each ball has its own sparse set of cells on one world lattice, cell (i, j) centred at
 * ((i + ½)·h, (j + ½)·h), so the lattice is symmetric about x = 0 and y = 0.
 *
 * A cell is created, held, when the ball's lowest surface over its centre first goes below z = 0. A held cell's
 * surface follows the ball's, w = −z_b, with w′ = −dz_b/dt the total derivative at the cell's fixed centre (the
 * ball's horizontal motion over its own curved surface included). It pushes A·k_w·(w + τ_r·w′) along the sphere's
 * inward normal over its centre, through the ball's centre, its vertical component that force. So the cells on a
 * moving ball's leading wall push back as well as up: the ramp. A held cell whose force would pull lets go. Released,
 * it recovers freely, w′ = −w/τ_r, exactly over each step (bedRelax). It is held again when the ball's surface
 * reaches it, and dropped once released below BED_DROP. The pair's friction is one Cundall–Strack spring at µ, on the
 * bed's current tangent stiffness k_w·A·N over its N held cells (design §4.3).
 *
 * Determinism (design §4.1). Every cell's update depends only on the cell and the ball, so the order of updates does
 * not matter. The resultant is summed over each mirror pair (j, −j − 1) first, then over the pairs in ascending
 * (i, p) order, p = max(j, −j − 1). A set-up mirrored across y = 0 therefore gives the mirrored resultant bit for bit,
 * wherever the ball lies.
 */
import { exp } from "../math/elementary";
import { ZERO, add, cross, dot, length, scale, sub, vec3, type Vec3 } from "../math/vec3";
import type { BallState, SurfaceProps } from "../types";
import { TANGENTIAL_STIFFNESS_RATIO, carrySpring, tangentialForce, type PairLaw } from "./contactLaw";
import type { BedLaw } from "./types";

/**
 * Side (m) of the bed's cells (design §4.1). Numerical, not physical: §5.1's grid convergence (1 mm against 2 mm)
 * bounds its effect, and about 20 cells carry a ball at rest.
 */
export const BED_CELL = 0.002;

/** Depth (m) below which a released cell is dropped (design §4.2). Numerical, not physical: 1 µm against pits in mm. */
export const BED_DROP = 1e-6;

/**
 * A cell's key, (i + KEY_OFFSET)·KEY_STRIDE + (j + KEY_OFFSET): exact for |i|, |j| < 2^20, about 2 km of lawn at
 * 2 mm, far beyond any court.
 */
const KEY_OFFSET = 1048576;
const KEY_STRIDE = 2097152;

const ROOT_RATIO = Math.sqrt(TANGENTIAL_STIFFNESS_RATIO);

interface Cell {
    /** Surface depth (m), never negative: the cell's surface lies at z = −w. */
    w: number;
    held: boolean;
    /** The load (BallBed.step) that last updated it. */
    seen: number;
}

/**
 * One ball's cells on the bed (design §4.1), its friction spring ξ and the tangential stiffness that spring last
 * carried (0 while no cell is held), the cells it held at the last load, the loads so far, and the columns visited
 * (a cost count for the probes).
 */
export interface BallBed {
    readonly law: BedLaw;
    /** exp(−dt/τ_r): a released cell's recovery over one step. */
    readonly decay: number;
    readonly cells: Map<number, Cell>;
    spring: Vec3;
    tangent: number;
    held: number;
    step: number;
    visits: number;
}

/** A ball's bed with no cell yet, stepping at `dt` (s). */
export function newBallBed(law: BedLaw, dt: number): BallBed {
    return {
        law,
        decay: exp(0 - dt / law.recovery),
        cells: new Map(),
        spring: ZERO,
        tangent: 0,
        held: 0,
        step: 0,
        visits: 0,
    };
}

/** The bed's load on a ball in one step (design §4.3), all on the ball, world frame. */
export interface BedLoad {
    /** The held cells' resultant plus friction (N), and friction's moment about the ball's centre (N·m). */
    readonly force: Vec3;
    readonly torque: Vec3;
    /** The resultant's unit direction and size (N): the pair's normal and normal force, as the probe sees them. */
    readonly normal: Vec3;
    readonly normalForce: number;
    /** Friction's force, the spring after the step, and the linearised law it used. */
    readonly tangentialForce: Vec3;
    readonly spring: Vec3;
    readonly law: PairLaw;
    readonly held: number;
}

/**
 * The cells' index range [lo, hi] along one axis for a footprint of radius ρ about `centre`, padded by one cell each
 * side: every column whose centre lies within ρ is inside, and a column outside is more than ρ + h/2 away.
 */
function span(centre: number, rho: number, h: number): readonly [number, number] {
    return [Math.floor((centre - rho) / h) - 1, Math.floor((centre + rho) / h) + 1];
}

/**
 * Updates the cell of column (i, j) under ball state `s` (design §4.2), creating it, held, where the ball's lowest
 * surface over its centre lies below z = 0. Returns its push on the ball (N), or null unless it is held.
 */
function column(bed: BallBed, i: number, j: number, s: BallState, radius: number): Vec3 | null {
    bed.visits += 1;
    const { law } = bed;
    const h = law.cell;
    const key = (i + KEY_OFFSET) * KEY_STRIDE + (j + KEY_OFFSET);
    const dx = (i + 0.5) * h - s.position.x;
    const dy = (j + 0.5) * h - s.position.y;
    const r2 = dx * dx + dy * dy;
    const R2 = radius * radius;
    const reaches = r2 < R2;
    const root = reaches ? Math.sqrt(R2 - r2) : 0;
    const zb = reaches ? s.position.z - root : Infinity;
    let cell = bed.cells.get(key);
    if (cell === undefined) {
        if (!(zb < 0)) {
            return null;
        }
        cell = { w: 0, held: true, seen: bed.step };
        bed.cells.set(key, cell);
    }
    cell.seen = bed.step;
    if (!(zb < 0)) {
        // The ball's surface has risen above the undeformed turf here: a held cell followed it to w = 0.
        if (cell.held) {
            cell.held = false;
            cell.w = 0;
        }
        return null;
    }
    if (!cell.held && zb > 0 - cell.w) {
        return null;
    }
    const w = 0 - zb;
    // w′ = −dz_b/dt at the cell's fixed centre, with z_b = c_z − √(R² − dx² − dy²) and dx, dy falling as c moves.
    const rate = (dx * s.velocity.x + dy * s.velocity.y) / root - s.velocity.z;
    const force = h * h * law.modulus * (w + law.recovery * rate);
    cell.w = w;
    if (force < 0) {
        cell.held = false;
        return null;
    }
    cell.held = true;
    // Along the inward normal (−dx, −dy, root)/R, scaled so that its vertical component is the cell's force.
    return vec3((force * (0 - dx)) / root, (force * (0 - dy)) / root, force);
}

/**
 * Updates `bed` under ball state `s` and returns its load for a step of `dt` (design §4.2, §4.3), or null while it
 * holds no cell (its friction spring then reset). Visits every column under the ball's footprint ρ = √(R² − z²), and
 * releases every held cell outside it, so a cell's state depends only on itself and the ball (see the file header).
 * Friction acts where the resultant's line meets the ball's surface, below the centre, at µ times the resultant's
 * size; its spring follows §3.5's rule on the bed's tangent stiffness k_w·A·N, carried by carrySpring.
 */
export function bedLoad(bed: BallBed, s: BallState, radius: number, dt: number): BedLoad | null {
    bed.step += 1;
    const h = bed.law.cell;
    const { x, y, z } = s.position;
    let resultant = ZERO;
    let held = 0;
    if (z < radius) {
        const rho = Math.sqrt(radius * radius - z * z);
        const [i0, i1] = span(x, rho, h);
        const [j0, j1] = span(y, rho, h);
        // p = max(j, −j − 1) over [j0, j1]: each p sums its mirror pair (p, −p − 1), whichever of them lie in range.
        const pLo = j0 >= 0 ? j0 : j1 < 0 ? 0 - j1 - 1 : 0;
        const pHi = Math.max(j1, 0 - j0 - 1);
        for (let i = i0; i <= i1; i++) {
            for (let p = pLo; p <= pHi; p++) {
                const q = 0 - p - 1;
                const a = p >= j0 && p <= j1 ? column(bed, i, p, s, radius) : null;
                const b = q >= j0 && q <= j1 ? column(bed, i, q, s, radius) : null;
                const pair = a === null ? b : b === null ? a : add(a, b);
                if (pair !== null) {
                    held += (a === null ? 0 : 1) + (b === null ? 0 : 1);
                    resultant = add(resultant, pair);
                }
            }
        }
    }
    for (const cell of bed.cells.values()) {
        if (cell.held && cell.seen !== bed.step) {
            cell.held = false;
            cell.w = 0;
        }
    }
    bed.held = held;
    if (held === 0) {
        bed.spring = ZERO;
        bed.tangent = 0;
        return null;
    }
    const size = length(resultant);
    const normal = size > 0 ? scale(resultant, 1 / size) : vec3(0, 0, 1);
    const arm = scale(normal, 0 - radius);
    const u = add(s.velocity, cross(s.angularVelocity, arm));
    const slip = sub(u, scale(normal, dot(u, normal)));
    const stiffness = bed.law.modulus * h * h * held;
    const damping = stiffness * bed.law.recovery;
    const law: PairLaw = {
        stiffness,
        damping,
        tangentialStiffness: TANGENTIAL_STIFFNESS_RATIO * stiffness,
        tangentialDamping: damping * ROOT_RATIO,
        friction: bed.law.friction,
    };
    const carried = carrySpring(bed.spring, normal, bed.tangent, law.tangentialStiffness);
    const tangential = tangentialForce(law, add(carried, scale(slip, dt)), slip, size);
    bed.spring = tangential.spring;
    bed.tangent = law.tangentialStiffness;
    return {
        force: add(resultant, tangential.force),
        torque: cross(arm, tangential.force),
        normal,
        normalForce: size,
        tangentialForce: tangential.force,
        spring: tangential.spring,
        law,
        held,
    };
}

/**
 * Advances the bed's released cells over one step (design §4.2): each recovers by `decay`, exactly, and is dropped
 * once below BED_DROP. Called after the step's bodies have moved.
 */
export function bedRelax(bed: BallBed): void {
    for (const [key, cell] of bed.cells) {
        if (cell.held) {
            continue;
        }
        cell.w *= bed.decay;
        if (cell.w < BED_DROP) {
            bed.cells.delete(key);
        }
    }
}

/** The bed's stored energy (J): Σ ½·A·k_w·w² over its cells, held and released (design §5.2). */
export function bedEnergy(bed: BallBed): number {
    let sum = 0;
    for (const cell of bed.cells.values()) {
        sum += cell.w * cell.w;
    }
    return 0.5 * bed.law.cell * bed.law.cell * bed.law.modulus * sum;
}

/** The deepest held cell's depth (m): how far the ball's surface lies below z = 0 over its held cells; 0 if none. */
export function heldDepth(bed: BallBed): number {
    let deepest = 0;
    for (const cell of bed.cells.values()) {
        if (cell.held) {
            deepest = Math.max(deepest, cell.w);
        }
    }
    return deepest;
}

/**
 * The cells' summed force (N) on a ball centred over (x, y) at depth δ = R − z, pressed slowly into a fresh bed:
 * Σ A·k_w·w over the columns it reaches below z = 0, in bedLoad's order and arithmetic, so that a ball placed at
 * staticSink's depth starts with the cells carrying exactly this.
 */
export function freshForce(x: number, y: number, radius: number, depth: number, law: BedLaw): number {
    const z = radius - depth;
    if (!(z < radius)) {
        return 0;
    }
    const h = law.cell;
    const R2 = radius * radius;
    const rho = Math.sqrt(R2 - z * z);
    const [i0, i1] = span(x, rho, h);
    const [j0, j1] = span(y, rho, h);
    const pLo = j0 >= 0 ? j0 : j1 < 0 ? 0 - j1 - 1 : 0;
    const pHi = Math.max(j1, 0 - j0 - 1);
    const one = (i: number, j: number): number => {
        const dx = (i + 0.5) * h - x;
        const dy = (j + 0.5) * h - y;
        const r2 = dx * dx + dy * dy;
        if (!(r2 < R2)) {
            return 0;
        }
        const zb = z - Math.sqrt(R2 - r2);
        return zb < 0 ? h * h * law.modulus * (0 - zb) : 0;
    };
    let total = 0;
    for (let i = i0; i <= i1; i++) {
        for (let p = pLo; p <= pHi; p++) {
            const q = 0 - p - 1;
            const a = p >= j0 && p <= j1 ? one(i, p) : 0;
            const b = q >= j0 && q <= j1 ? one(i, q) : 0;
            total += a + b;
        }
    }
    return total;
}

/**
 * The depth δ₀ (m) at which a ball of weight `weight` (N) centred over (x, y) rests on a fresh bed (design §4.6): the
 * smallest double at which freshForce carries it, by doubling from 0.1 mm and then bisection to adjacent doubles, so
 * the result is deterministic. Throws a RangeError if the bed cannot carry it within the ball's radius.
 */
export function staticSink(x: number, y: number, radius: number, weight: number, law: BedLaw): number {
    let hi = 1e-4;
    while (freshForce(x, y, radius, hi, law) < weight) {
        hi *= 2;
        if (hi > radius) {
            throw new RangeError("the bed cannot carry the ball's weight within its radius");
        }
    }
    let lo = 0;
    for (;;) {
        const mid = lo + (hi - lo) / 2;
        if (mid <= lo || mid >= hi) {
            return hi;
        }
        if (freshForce(x, y, radius, mid, law) < weight) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
}

/** A fresh bed under a ball's position (design §4.6): every column's engagement depth R − √(R² − r²), ascending. */
export interface FreshBed {
    readonly law: BedLaw;
    readonly engage: readonly number[];
}

/** The fresh bed under a ball centred over (x, y): the engagement depth of every column whose centre it reaches. */
export function freshBed(x: number, y: number, radius: number, law: BedLaw): FreshBed {
    const h = law.cell;
    const R2 = radius * radius;
    const [i0, i1] = span(x, radius, h);
    const [j0, j1] = span(y, radius, h);
    const engage: number[] = [];
    for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
            const dx = (i + 0.5) * h - x;
            const dy = (j + 0.5) * h - y;
            const r2 = dx * dx + dy * dy;
            if (r2 < R2) {
                engage.push(radius - Math.sqrt(R2 - r2));
            }
        }
    }
    engage.sort((a, b) => a - b);
    return { law, engage };
}

/** U_f(δ): the work (J) to press the ball slowly to depth δ into the fresh bed, Σ ½·A·k_w·(δ − d)² over d < δ. */
export function freshPotential(fresh: FreshBed, depth: number): number {
    let sum = 0;
    for (const d of fresh.engage) {
        if (!(d < depth)) {
            break;
        }
        const w = depth - d;
        sum += w * w;
    }
    return 0.5 * fresh.law.cell * fresh.law.cell * fresh.law.modulus * sum;
}

/**
 * True while a ball in the turf at depth δ = R − z, moving vertically at v_z, still bounces (design §4.6; plan
 * decision 6). Its vertical oscillation energy E = ½·m·v_z² + U_f(δ) − U_f(δ₀) − m·g·(δ − δ₀) exceeds what it needs to
 * reach the surface from rest at δ₀, E(0) = m·g·δ₀ − U_f(δ₀). Expanded, E − E(0) = ½·m·v_z² + U_f(δ) − m·g·δ, which
 * no longer depends on δ₀.
 */
export function isBouncing(fresh: FreshBed, mass: number, gravity: number, vz: number, depth: number): boolean {
    return 0.5 * mass * vz * vz + freshPotential(fresh, depth) - mass * gravity * depth > 0;
}

/** The bed's law at a lawn surface (design §4.4): its modulus and recovery, its sliding friction, and BED_CELL. */
export function bedLawOf(surface: SurfaceProps): BedLaw {
    return {
        modulus: surface.bedModulus,
        recovery: surface.bedRecovery,
        friction: surface.slidingFriction,
        cell: BED_CELL,
    };
}
