/**
 * Seeded random clusters of two to four touching balls with court-realistic obstacles: none, the peg, or one hoop
 * (whose uprights no single ball can touch both of). Velocities are glued as the engine glues them, so no coupled
 * contact approaches. Ported from the P2a.2 prototype's measurement of the mode-search cap.
 */
import { ZERO, add, cross, normalize, scale, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import { rollingSpin } from "../../../src/engine/motion";
import type { ContactBody, RestingContact } from "../../../src/engine/push";
import type { MotionParams } from "../../../src/engine/types";

/** One random cluster, ready for solveRestingContacts. */
export interface Cluster {
    readonly bodies: ContactBody[];
    readonly axes: Vec3[];
    readonly contacts: RestingContact[];
    readonly label: string;
}

const R = 0.046;
const G = 9.80665;
const UPRIGHT = 0.008;
const PEG = 0.02;
const UP = vec3(0, 0, 1);

function distance(p: Vec3, q: Vec3): number {
    return Math.hypot(p.x - q.x, p.y - q.y);
}

/** Points at distance r1 from p and r2 from q in the plane, or none. */
function meet(p: Vec3, q: Vec3, r1: number, r2: number): Vec3[] {
    const d = distance(p, q);
    if (d > r1 + r2 || d < Math.abs(r1 - r2) || d === 0) {
        return [];
    }
    const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
    const ex = (q.x - p.x) / d;
    const ey = (q.y - p.y) / d;
    const mx = p.x + a * ex;
    const my = p.y + a * ey;
    return [vec3(mx - h * ey, my + h * ex, R), vec3(mx + h * ey, my - h * ex, R)];
}

/** Removes the approaching part of v against each unit normal (Gauss–Seidel), as the engine's glue does. */
function glue(v: Vec3, normals: readonly Vec3[]): Vec3 {
    let g = v;
    for (let iteration = 0; iteration < 50; iteration++) {
        for (const n of normals) {
            const s = g.x * n.x + g.y * n.y;
            if (s > 0) {
                g = vec3(g.x - s * n.x, g.y - s * n.y, 0);
            }
        }
    }
    return g;
}

/** A random cluster, or null when the draw overlaps (draw again). */
export function randomCluster(random: () => number): Cluster | null {
    const uni = (a: number, b: number): number => a + (b - a) * random();
    const n = random() < 0.15 ? 2 : random() < 0.4 ? 3 : 4;
    const pos: Vec3[] = [vec3(0, 0, R)];
    for (let i = 1; i < n; i++) {
        let q: Vec3 | null = null;
        if (i >= 2 && random() < 0.3) {
            // Touch two existing balls (a closed loop: a triangle or a rhombus).
            const a = Math.floor(random() * i);
            const b = Math.floor(random() * i);
            const points = a === b ? [] : meet(pos[a] as Vec3, pos[b] as Vec3, 2 * R, 2 * R);
            q = points.length > 0 ? (points[Math.floor(random() * points.length)] as Vec3) : null;
        }
        if (!q) {
            const parent = pos[Math.floor(random() * i)] as Vec3;
            const angle = uni(0, 2 * Math.PI);
            q = vec3(parent.x + 2 * R * Math.cos(angle), parent.y + 2 * R * Math.sin(angle), R);
        }
        const placed = q;
        if (pos.some((o) => distance(o, placed) < 2 * R - 1e-12)) {
            return null;
        }
        pos.push(placed);
    }
    const axes: Vec3[] = [];
    const radii: number[] = [];
    // None, the peg, or one hoop (its uprights 0.0953 m apart inside). The obstacle touches one ball, or two at once.
    const obstacle = random();
    if (obstacle >= 0.4) {
        const r = obstacle < 0.6 ? PEG : UPRIGHT;
        let c: Vec3 | null = null;
        if (n >= 2 && random() < 0.35) {
            const a = Math.floor(random() * n);
            const b = Math.floor(random() * n);
            const points = a === b ? [] : meet(pos[a] as Vec3, pos[b] as Vec3, R + r, R + r);
            c = points.length > 0 ? (points[Math.floor(random() * points.length)] as Vec3) : null;
        }
        if (!c) {
            const owner = pos[Math.floor(random() * n)] as Vec3;
            const angle = uni(0, 2 * Math.PI);
            c = vec3(owner.x + (R + r) * Math.cos(angle), owner.y + (R + r) * Math.sin(angle), 0);
        }
        const centres = [vec3(c.x, c.y, 0)];
        if (r === UPRIGHT) {
            const psi = uni(0, 2 * Math.PI);
            const span = 0.0953 + 2 * UPRIGHT;
            centres.push(vec3(c.x + span * Math.cos(psi), c.y + span * Math.sin(psi), 0));
        }
        for (const centre of centres) {
            if (pos.some((o) => distance(o, centre) < R + r - 1e-12)) {
                return null;
            }
            axes.push(centre);
            radii.push(r);
        }
    }
    const p: MotionParams = { radius: R, slidingDecel: 0.3 * G, rollingDecel: uni(0.03, 0.15) * G, gravity: G };
    const bodies: ContactBody[] = pos.map((position) => ({
        state: { position, velocity: ZERO, angularVelocity: ZERO },
        params: p,
        turfNormal: UP,
        pivotCapacity: Infinity,
    }));
    const towards = (from: Vec3, to: Vec3): Vec3 => normalize(vec3(to.x - from.x, to.y - from.y, 0));
    const set = (i: number, velocity: Vec3, angularVelocity: Vec3): void => {
        const b = bodies[i] as ContactBody;
        bodies[i] = { ...b, state: { ...b.state, velocity, angularVelocity } };
    };
    const kind = random();
    let label: string;
    if (kind < 0.6) {
        // A driver at rest with spin (sliding in place), sometimes a second one.
        const drivers = random() < 0.25 && n >= 2 ? [0, 1 + Math.floor(random() * (n - 1))] : [0];
        for (const d of drivers) {
            const angle = uni(0, 2 * Math.PI);
            let w = scale(vec3(Math.cos(angle), Math.sin(angle), 0), uni(20, 80));
            if (random() < 0.5) {
                w = add(w, vec3(0, 0, uni(-10, 10)));
            }
            set(d, ZERO, w);
        }
        label = `rest-spin x${drivers.length}`;
    } else if (kind < 0.85) {
        // The whole cluster rolling together; the driver carries extra topspin (sliding).
        const angle = uni(0, 2 * Math.PI);
        const normals: Vec3[] = [];
        pos.forEach((q) =>
            axes.forEach((c, k) => {
                if (distance(q, c) < R + (radii[k] as number) + 1e-9) {
                    normals.push(towards(q, c));
                }
            }),
        );
        const v = glue(vec3(uni(0.05, 1) * Math.cos(angle), uni(0.05, 1) * Math.sin(angle), 0), normals);
        bodies.forEach((_, i) => {
            let w = rollingSpin(v, 0, R);
            if (i === 0) {
                const axis =
                    Math.hypot(v.x, v.y) > 1e-6 ? cross(vec3(0, 0, 1), v) : vec3(-Math.sin(angle), Math.cos(angle), 0);
                w = add(w, scale(normalize(axis), uni(10, 60)));
            }
            set(i, v, w);
        });
        label = "rolling cluster";
    } else {
        // A driver rolling with a sideways component (rubbing) plus topspin into the cluster.
        const angle = uni(0, 2 * Math.PI);
        const normals: Vec3[] = [];
        pos.forEach((q, j) => {
            if (j > 0 && distance(pos[0] as Vec3, q) < 2 * R + 1e-9) {
                normals.push(towards(pos[0] as Vec3, q));
            }
        });
        axes.forEach((c, k) => {
            if (distance(pos[0] as Vec3, c) < R + (radii[k] as number) + 1e-9) {
                normals.push(towards(pos[0] as Vec3, c));
            }
        });
        const v = glue(vec3(0.3 * Math.cos(angle), 0.3 * Math.sin(angle), 0), normals);
        const spin = scale(vec3(Math.cos(angle + 1), Math.sin(angle + 1), 0), uni(20, 60));
        set(0, v, add(rollingSpin(v, 0, R), spin));
        label = "moving driver";
    }
    const contacts: RestingContact[] = [];
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            if (distance(pos[i] as Vec3, pos[j] as Vec3) < 2 * R + 1e-9) {
                contacts.push({ a: i, b: j, fixed: false, friction: 0.05 });
            }
        }
        axes.forEach((c, k) => {
            if (distance(pos[i] as Vec3, c) < R + (radii[k] as number) + 1e-9) {
                contacts.push({ a: i, b: k, fixed: true, friction: 0.1 });
            }
        });
    }
    return { bodies, axes, contacts, label: `${n} balls, ${contacts.length} contacts, ${label}` };
}
