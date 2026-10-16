/**
 * The head–turf law (P2b.2b.2b.3 design §4). The turf is the plane z = 0 and its soil is fixed in the world, so the
 * law's state lives on the turf bed's world lattice (BED_CELL; cell (i, j) centred at ((i + ½)·h, (j + ½)·h)): a
 * column the head has yielded keeps its new floor as the head moves on, and a furrow stays behind it.
 *
 * Each step, while the head's lowest point is below the plane, the law visits every column under the head's
 * horizontal extent, padded one cell, in mirror pairs across y = 0 as the balls' bed does (turfBed.ts
 * mirrorPairsOver). A column is submerged while the head's underside over its centre (headUnderside) lies below
 * z = 0, δ deep:
 * - bearing (§4.2): each column is elastic–plastic, with a set s ≥ 0, its surface at −s and its elastic deflection
 *   e = δ − s. While k_w·e > p_y the set moves to δ − p_y/k_w; it never falls. A column with e > 0 bears
 *   h²·max(0, k_w·(e + τ_r·e′)) upward at its point on the underside, e′ = −u_z of the head's material there;
 * - ploughing (§4.3; plan decision 1, user ruling 2026-10-15): the bearing columns are binned into strips h wide
 *   across the horizontal spring's trial. A strip's ploughing depth is its deepest column's depth below the floor that
 *   column had when the head arrived over it (0 in fresh turf, −s in a furrow the head left), and it resists with up
 *   to h·d_s·c·N_c;
 * - the sole's friction: up to µ·N_b, N_b the bearing's total;
 * - one horizontal Cundall–Strack spring carries both (plan decision 2, user ruling 2026-10-15), with the turf bed's
 *   tangential law over the n bearing columns, k_t = (2/7)·k_w·h²·n and c_t = √(2/7)·k_w·τ_r·h²·n, as bedLoad's,
 *   capped at F_cap = µ·N_b + Σ h·d_s·c·N_c. It acts at the resistance's centre, the strips' points and the bearing's
 *   centre of pressure weighted by their shares of F_cap, and slips on the head's material's horizontal velocity
 *   there. It sticks within the cap, so a head can come to rest in the turf.
 *
 * Determinism. A column's update depends only on the column and the head. The bearing's sums run over each mirror pair
 * first, then over the pairs in ascending (i, p) order; the strips' over each mirror pair of strips (k, −k − 1), then
 * ascending p = max(k, −k − 1) (plan decision 5). A set-up mirrored across y = 0 therefore gives the mirrored load
 * bit for bit.
 */
import { contactReference } from "../../reference/index";
import { ZERO, add, cross, horizontal, length, scale, sub, vec3, type Vec3 } from "../math/vec3";
import type { SurfaceProps } from "../types";
import { TANGENTIAL_STIFFNESS_RATIO, carrySpring, tangentialForce, type PairLaw } from "./contactLaw";
import { headExtent, headLowestPoint, headUnderside, pointVelocity } from "./contacts";
import { BED_CELL, cellKey, columnSpan, mirrorPairsOver } from "./turfBed";
import type { HeadState, HeadTurfLaw, MalletHead } from "./types";

/**
 * Friction of the head's sole on the turf (P2b.2b.1 design §4.1; reference/contact.json): the analogue of a ball
 * sliding on the turf.
 */
export const HEAD_TURF_FRICTION = contactReference.headTurfFriction.value;

/** N_c (design §4.3, §6.2; reference/contact.json): Reece's cohesion factor, Mak & Chen's shallowest table. */
export const PLOUGH_FACTOR = contactReference.turfPloughFactor.value;

/**
 * Horizontal speed (m/s) below which a head whose spring sticks is at rest in the turf (design §4.3). Numerical, not
 * physical: FINISH_SPEED's millimetre a second.
 */
export const HEAD_REST_SPEED = 1e-3;

const UP = vec3(0, 0, 1);
const ROOT_RATIO = Math.sqrt(TANGENTIAL_STIFFNESS_RATIO);

/**
 * A column the head has borne on (design §4.2; plan decision 1): its set s (m), the floor it had when the head last
 * arrived over it (m), and the load that last found it bearing.
 */
interface Column {
    set: number;
    entry: number;
    seen: number;
}

/**
 * The head's turf in one run (design §4): its law, the columns it has borne on, keyed as the bed's cells (cellKey),
 * its horizontal spring ξ and the tangential stiffness that spring last carried (0 while no column bears), and the
 * loads so far.
 */
export interface HeadTurfBed {
    readonly law: HeadTurfLaw;
    readonly columns: Map<number, Column>;
    spring: Vec3;
    tangent: number;
    step: number;
}

/** A head's turf with no column met yet. */
export function newHeadTurfBed(law: HeadTurfLaw): HeadTurfBed {
    return { law, columns: new Map(), spring: ZERO, tangent: 0, step: 0 };
}

/**
 * The head–turf law at a lawn surface (design §2, §6.2): the bed's modulus and recovery, the turf's yield and root
 * mat, N_c, the sole's friction and BED_CELL.
 */
export function headTurfLawOf(surface: SurfaceProps): HeadTurfLaw {
    return {
        modulus: surface.bedModulus,
        recovery: surface.bedRecovery,
        yieldPressure: surface.turfYield,
        matStrength: surface.turfMatStrength,
        ploughFactor: PLOUGH_FACTOR,
        friction: HEAD_TURF_FRICTION,
        cell: BED_CELL,
    };
}

/** The turf's load on the head in one step (design §4), world frame. */
export interface HeadTurfLoad {
    /** The bearing and the horizontal resistance (N), and their moment about the head's centre (N·m). */
    readonly force: Vec3;
    readonly torque: Vec3;
    /** N_b, the bearing's total (N), upward. */
    readonly bearing: number;
    /** The horizontal resistance (N) and its cap F_cap (N). */
    readonly resistance: Vec3;
    readonly cap: number;
    /** The deepest bearing column's δ (m) and its e′ (m/s), how fast the head closes on it (plan decision 6). */
    readonly depth: number;
    readonly closing: number;
    /** The horizontal slip (m/s) of the head's material at the resistance's centre. */
    readonly slip: Vec3;
    /** True when the spring slid at its cap. */
    readonly sliding: boolean;
    /** True when a column yielded. */
    readonly yielded: boolean;
    /** n, the bearing columns. */
    readonly columns: number;
}

/** One bearing column in one load: its force (N, upward), point, ploughing depth (m), δ (m) and e′ (m/s). */
interface Bearing {
    readonly force: number;
    readonly point: Vec3;
    readonly plough: number;
    readonly depth: number;
    readonly rate: number;
}

/**
 * Column (i, j) under the head (design §4.2; plan decision 1), counting the visit: null unless the head's underside
 * over its centre, `under(x, y)`, lies below the column's floor −s. A column the head arrives over takes its floor as
 * its entry floor; its set moves to δ − p_y/k_w while k_w·e > p_y (calling `onYield`); it bears
 * h²·max(0, k_w·(e + τ_r·e′)).
 */
function bear(
    bed: HeadTurfBed,
    s: HeadState,
    under: (x: number, y: number) => number,
    i: number,
    j: number,
    onYield: () => void,
): Bearing | null {
    const { law } = bed;
    const h = law.cell;
    const x = (i + 0.5) * h;
    const y = (j + 0.5) * h;
    const z = under(x, y);
    if (!(z < 0)) {
        return null;
    }
    const depth = 0 - z;
    const key = cellKey(i, j);
    let column = bed.columns.get(key);
    if (column === undefined) {
        column = { set: 0, entry: 0, seen: -1 };
        bed.columns.set(key, column);
    }
    if (!(depth - column.set > 0)) {
        return null;
    }
    if (column.seen !== bed.step - 1) {
        column.entry = column.set;
    }
    column.seen = bed.step;
    if (law.modulus * (depth - column.set) > law.yieldPressure) {
        column.set = depth - law.yieldPressure / law.modulus;
        onYield();
    }
    const point = vec3(x, y, z);
    const rate = 0 - pointVelocity(s.position, s.velocity, s.angularVelocity, point).z;
    const pressure = law.modulus * (depth - column.set + law.recovery * rate);
    return { force: pressure > 0 ? h * h * pressure : 0, point, plough: depth - column.entry, depth, rate };
}

/** A bearing column's moment of its force about `centre` (N·m). */
function turnOf(c: Bearing, centre: Vec3): Vec3 {
    return cross(sub(c.point, centre), vec3(0, 0, c.force));
}

/**
 * Updates `bed` under head state `s` and returns the turf's load on `head` for a step of `dt` (design §4), or null
 * while no column bears (the spring then reset). `aim` (unit, horizontal) orients the strips while the spring's trial
 * is zero (plan decision 3).
 */
export function headTurfLoad(
    bed: HeadTurfBed,
    s: HeadState,
    head: MalletHead,
    dt: number,
    aim: Vec3,
): HeadTurfLoad | null {
    bed.step += 1;
    const { law } = bed;
    const h = law.cell;
    const bearings: Bearing[] = [];
    let bearing = 0;
    let torque = ZERO;
    let moment = ZERO;
    let yields = 0;
    const onYield = (): void => {
        yields += 1;
    };
    if (headLowestPoint(s, head) < 0) {
        const under = headUnderside(s, head);
        const extent = headExtent(s, head);
        const [i0, i1] = columnSpan(s.position.x, extent.x, h);
        const [j0, j1] = columnSpan(s.position.y, extent.y, h);
        mirrorPairsOver(i0, i1, j0, j1, (i, ja, jb) => {
            const a = ja === null ? null : bear(bed, s, under, i, ja, onYield);
            const b = jb === null ? null : bear(bed, s, under, i, jb, onYield);
            if (a === null && b === null) {
                return;
            }
            if (a !== null) {
                bearings.push(a);
            }
            if (b !== null) {
                bearings.push(b);
            }
            if (a !== null && b !== null) {
                bearing += a.force + b.force;
                torque = add(torque, add(turnOf(a, s.position), turnOf(b, s.position)));
                moment = add(moment, add(scale(a.point, a.force), scale(b.point, b.force)));
                return;
            }
            const one = (a ?? b) as Bearing;
            bearing += one.force;
            torque = add(torque, turnOf(one, s.position));
            moment = add(moment, scale(one.point, one.force));
        });
    }
    const n = bearings.length;
    if (n === 0) {
        bed.spring = ZERO;
        bed.tangent = 0;
        return null;
    }
    let deepest = bearings[0] as Bearing;
    for (const c of bearings) {
        if (c.depth > deepest.depth) {
            deepest = c;
        }
    }
    // The bearing's centre of pressure, or the deepest column's point where no column presses (plan decision 7).
    const pressure = bearing > 0 ? scale(moment, 1 / bearing) : deepest.point;
    const stiffness = law.modulus * h * h * n;
    const damping = stiffness * law.recovery;
    const spring: PairLaw = {
        stiffness,
        damping,
        tangentialStiffness: TANGENTIAL_STIFFNESS_RATIO * stiffness,
        tangentialDamping: damping * ROOT_RATIO,
        friction: 1,
    };
    const carried = carrySpring(bed.spring, UP, bed.tangent, spring.tangentialStiffness);
    // The strips lie across the trial at the centre of pressure, along aim while it is zero (plan decision 3).
    const lead = add(
        carried,
        scale(horizontal(pointVelocity(s.position, s.velocity, s.angularVelocity, pressure)), dt),
    );
    const reach = length(lead);
    const along = reach > 0 ? scale(lead, 1 / reach) : aim;
    const across = vec3(0 - along.y, along.x, 0);
    const strips = new Map<number, Bearing>();
    for (const c of bearings) {
        const k = Math.floor((c.point.x * across.x + c.point.y * across.y) / h);
        const best = strips.get(k);
        if (best === undefined || c.plough > best.plough) {
            strips.set(k, c);
        }
    }
    // Each strip's ploughing, summed over mirror pairs of strips in ascending p (plan decisions 4, 5).
    const perDepth = h * law.matStrength * law.ploughFactor;
    const order = [...new Set([...strips.keys()].map((k) => Math.max(k, 0 - k - 1)))].sort((a, b) => a - b);
    let ploughing = 0;
    let ploughMoment = ZERO;
    for (const p of order) {
        const a = strips.get(p);
        const b = strips.get(0 - p - 1);
        if (a !== undefined && b !== undefined) {
            const ra = perDepth * a.plough;
            const rb = perDepth * b.plough;
            ploughing += ra + rb;
            ploughMoment = add(ploughMoment, add(scale(a.point, ra), scale(b.point, rb)));
        } else {
            const one = (a ?? b) as Bearing;
            const r = perDepth * one.plough;
            ploughing += r;
            ploughMoment = add(ploughMoment, scale(one.point, r));
        }
    }
    const friction = law.friction * bearing;
    const cap = friction + ploughing;
    const centre = cap > 0 ? scale(add(scale(pressure, friction), ploughMoment), 1 / cap) : pressure;
    const slip = horizontal(pointVelocity(s.position, s.velocity, s.angularVelocity, centre));
    const tangential = tangentialForce(spring, add(carried, scale(slip, dt)), slip, cap);
    bed.spring = tangential.spring;
    bed.tangent = spring.tangentialStiffness;
    const resistance = tangential.force;
    return {
        force: add(vec3(0, 0, bearing), resistance),
        torque: add(torque, cross(sub(centre, s.position), resistance)),
        bearing,
        resistance,
        cap,
        depth: deepest.depth,
        closing: deepest.rate,
        slip,
        sliding: tangential.sliding,
        yielded: yields > 0,
        columns: n,
    };
}
