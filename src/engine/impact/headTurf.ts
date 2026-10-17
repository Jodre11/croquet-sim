/**
 * The head–turf law (P2b.2b.2b.3 design §4). The turf is the plane z = 0 and its soil is fixed in the world, so the
 * law's state lives on the turf bed's world lattice (BED_CELL; cell (i, j) centred at ((i + ½)·h, (j + ½)·h)): a
 * column the head has yielded keeps its new floor as the head moves on, and a furrow stays behind it.
 *
 * Each step, while the head's lowest point is below the plane, the law visits every column under the head's part
 * below the plane (contacts.ts headReach), padded one cell, in mirror pairs across y = 0 as the balls' bed does
 * (turfBed.ts mirrorPairsOver). A column is submerged while the head's underside over its centre (headUnderside) lies
 * below z = 0, δ deep:
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
import { headExtent, headLowestPoint, headReach, headUnderside, pointVelocity } from "./contacts";
import { BED_CELL, cellKey, mirrorPairsOver } from "./turfBed";
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

/**
 * One bearing column in one load: its force (N, upward), its point (x, y, z) on the underside, its ploughing depth
 * (m), δ (m) and e′ (m/s).
 */
interface Bearing {
    readonly force: number;
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly plough: number;
    readonly depth: number;
    readonly rate: number;
}

/**
 * Column (i, j) under the head (design §4.2; plan decision 1), counting the visit: null unless the head's underside
 * over its centre, `under(x, y)`, lies below the column's floor −s. A column the head arrives over takes its floor as
 * its entry floor; its set moves to δ − p_y/k_w while k_w·e > p_y (calling `onYield`); it bears
 * h²·max(0, k_w·(e + τ_r·e′)). A column with e > 0 whose force is 0 (the head lifting off it faster than it
 * recovers) is still returned: it counts in n, so in the spring's stiffness, and in the strips.
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
    // e′ = −u_z, u = v + ω × r with r the point less the head's centre: u_z = v_z + ω_x·r_y − ω_y·r_x.
    const w = s.angularVelocity;
    const rate = 0 - (s.velocity.z + w.x * (y - s.position.y) - w.y * (x - s.position.x));
    const pressure = law.modulus * (depth - column.set + law.recovery * rate);
    return { force: pressure > 0 ? h * h * pressure : 0, x, y, z, plough: depth - column.entry, depth, rate };
}

/**
 * Whether bearing column `c` takes strip's place as its ploughing column: the deeper ploughing, then on a tie the
 * leading column, the greater projection on `along` (ax, ay), then the greater x. All three keys are unchanged by a
 * mirror across y = 0, which also mirrors `along`, so a mirrored run keeps the mirrored column (plan decision 5). Two
 * columns of one strip cannot tie on all three: equal x and equal projection put them at equal y unless ay is 0, and
 * then the strips are the lattice's rows, each column of a row at its own x.
 */
function leads(c: Bearing, best: Bearing, ax: number, ay: number): boolean {
    if (c.plough !== best.plough) {
        return c.plough > best.plough;
    }
    const pc = c.x * ax + c.y * ay;
    const pb = best.x * ax + best.y * ay;
    if (pc !== pb) {
        return pc > pb;
    }
    return c.x > best.x;
}

/**
 * The column range [i0, i1, j0, j1] headTurfLoad visits for head state `s` on a lattice of cell `h` (design §4.1), or
 * null while the head's lowest point is above the plane: headReach's bound padded one cell, or, where rounding leaves
 * it empty at a ulp's depth, the head's whole horizontal extent (headExtent). A column outside has its underside above
 * the plane, so bear would pass it over, and skipping it changes nothing; the pad is against rounding.
 */
export function headColumns(
    s: HeadState,
    head: MalletHead,
    h: number,
): readonly [number, number, number, number] | null {
    if (!(headLowestPoint(s, head) < 0)) {
        return null;
    }
    const e = headExtent(s, head);
    const { x, y } = s.position;
    const [x0, x1, y0, y1] = headReach(s, head) ?? [x - e.x, x + e.x, y - e.y, y + e.y];
    return [Math.floor(x0 / h) - 1, Math.floor(x1 / h) + 1, Math.floor(y0 / h) - 1, Math.floor(y1 / h) + 1];
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
    // N_b and M = Σ p·f, the bearing's moment about the origin, summed per mirror pair (see the file header).
    let bearing = 0;
    let mx = 0;
    let my = 0;
    let mz = 0;
    let yields = 0;
    const onYield = (): void => {
        yields += 1;
    };
    const range = headColumns(s, head, h);
    if (range !== null) {
        const under = headUnderside(s, head);
        const [i0, i1, j0, j1] = range;
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
                mx += a.x * a.force + b.x * b.force;
                my += a.y * a.force + b.y * b.force;
                mz += a.z * a.force + b.z * b.force;
                return;
            }
            const one = (a ?? b) as Bearing;
            bearing += one.force;
            mx += one.x * one.force;
            my += one.y * one.force;
            mz += one.z * one.force;
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
    const inverse = bearing > 0 ? 1 / bearing : 0;
    const pressure =
        bearing > 0 ? vec3(mx * inverse, my * inverse, mz * inverse) : vec3(deepest.x, deepest.y, deepest.z);
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
    // The strip across the trial: a mirror across y = 0 negates the projection, so strip k becomes −k − 1.
    const crossX = 0 - along.y;
    const crossY = along.x;
    let kMin = Infinity;
    let kMax = 0 - Infinity;
    const stripOf: number[] = [];
    for (const c of bearings) {
        const k = Math.floor((c.x * crossX + c.y * crossY) / h);
        stripOf.push(k);
        kMin = Math.min(kMin, k);
        kMax = Math.max(kMax, k);
    }
    const strips: (Bearing | undefined)[] = new Array<Bearing | undefined>(kMax - kMin + 1);
    for (let m = 0; m < n; m++) {
        const c = bearings[m] as Bearing;
        const slot = (stripOf[m] as number) - kMin;
        const best = strips[slot];
        if (best === undefined || leads(c, best, along.x, along.y)) {
            strips[slot] = c;
        }
    }
    const stripAt = (k: number): Bearing | undefined => (k < kMin || k > kMax ? undefined : strips[k - kMin]);
    // Each strip's ploughing, summed over mirror pairs of strips (p, −p − 1) in ascending p (plan decisions 4, 5).
    const perDepth = h * law.matStrength * law.ploughFactor;
    const pLo = kMin >= 0 ? kMin : kMax < 0 ? 0 - kMax - 1 : 0;
    const pHi = Math.max(kMax, 0 - kMin - 1);
    let ploughing = 0;
    let px = 0;
    let py = 0;
    let pz = 0;
    for (let p = pLo; p <= pHi; p++) {
        const a = stripAt(p);
        const b = stripAt(0 - p - 1);
        if (a !== undefined && b !== undefined) {
            const ra = perDepth * a.plough;
            const rb = perDepth * b.plough;
            ploughing += ra + rb;
            px += a.x * ra + b.x * rb;
            py += a.y * ra + b.y * rb;
            pz += a.z * ra + b.z * rb;
        } else if (a !== undefined || b !== undefined) {
            const one = (a ?? b) as Bearing;
            const r = perDepth * one.plough;
            ploughing += r;
            px += one.x * r;
            py += one.y * r;
            pz += one.z * r;
        }
    }
    const friction = law.friction * bearing;
    const cap = friction + ploughing;
    const share = cap > 0 ? 1 / cap : 0;
    const centre =
        cap > 0
            ? vec3(
                  (pressure.x * friction + px) * share,
                  (pressure.y * friction + py) * share,
                  (pressure.z * friction + pz) * share,
              )
            : pressure;
    const slip = horizontal(pointVelocity(s.position, s.velocity, s.angularVelocity, centre));
    const tangential = tangentialForce(spring, add(carried, scale(slip, dt)), slip, cap);
    bed.spring = tangential.spring;
    bed.tangent = spring.tangentialStiffness;
    const resistance = tangential.force;
    // The bearing's moment about the centre c: Σ (pᵢ − c) × (0, 0, fᵢ) = (M − c·N_b) × ẑ.
    const c = s.position;
    const bearingTurn = vec3(my - c.y * bearing, 0 - (mx - c.x * bearing), 0);
    return {
        force: add(vec3(0, 0, bearing), resistance),
        torque: add(bearingTurn, cross(sub(centre, c), resistance)),
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
