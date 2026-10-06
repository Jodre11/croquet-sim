/**
 * The tracked drive's path (P2b.2b.1 design §3.1, §3.2), as two arcs. The pendulum: the mallet swings about the top
 * hand (the pivot) in a vertical plane, the shaft at arc angle θ. The hands' path through space: the pivot moves in
 * that plane, ends after its reach, and dips. Each arc runs at its initial rate until its window and changes rate
 * constantly through it. After its window the pendulum swings freely (swing mode) or slows to a held slope (carry
 * mode). The dip, and in carry mode the descent at the reach's end, lower the pivot from rest to rest. Everything is
 * continuous in position and velocity.
 *
 * Frames. n = aim × ẑ is the pitch axis: a positive rotation about it tilts aim upward. The head is rigid on the shaft,
 * its up axis s: at arc angle θ its orientation is rot(n, θ) ⊗ q_aim, q_aim turning body x to aim, and the socket's
 * target is P + r·(sin θ·aim − cos θ·ẑ). The head and the arm mass at the top grip move as one swung body (design
 * §3.3). Exact operations only (sinCos and atan2 from elementary.ts), like the rest of the engine.
 */
import { atan2, sinCos } from "../math/elementary";
import { add, cross, dot, scale, sub, vec3, type Vec3 } from "../math/vec3";
import { headLowestPoint } from "./contacts";
import { multiply, rotate, rotateInverse, type Quaternion } from "./rigidBody";
import type { Coupling, Hands, HeadState, MalletHead, SwingArc, TrackDrive } from "./types";

const UP = vec3(0, 0, 1);

/**
 * Step (s) of the free pendulum's table (design §3.2): the impact's own step, so the table resolves the swing as
 * finely as the integrator does. Numerical, not physical.
 */
export const FREE_STEP = 5e-6;

/**
 * Span (s) of the free pendulum's table from the pendulum's window's end (design §3.2). Numerical: a tracked impact
 * runs at most MAX_LEAD (0.06 s, the longest lead-in) plus TRACK_IMPACT_CAP (0.45 s) from t = 0, and the table starts
 * at the window's end, so 0.55 s covers every impact with room to spare.
 */
export const FREE_SPAN = 0.55;

/**
 * How long after contactAt (s) the hands' path may take to travel 0.8·handReach before the reach is taken not to bind
 * (design §3.2). A modelling bound, not physical: past it the impact has long ended.
 */
const REACH_SEARCH = 0.5;

/** Bisections of REACH_SEARCH for the reach's start: numerical, enough to reach a double's resolution. */
const REACH_BISECTIONS = 80;

/** The pitch axis n = aim × ẑ of a horizontal unit `aim`: a positive rotation about it tilts aim upward. */
export function pitchAxis(aim: Vec3): Vec3 {
    return vec3(aim.y, 0 - aim.x, 0);
}

/** The rotation about ẑ that turns body x to the horizontal unit vector `aim`. */
export function aimRotation(aim: Vec3): Quaternion {
    const [s, c] = sinCos(atan2(aim.y, aim.x) / 2);
    return { w: c, x: 0, y: 0, z: s };
}

/** The rotation by `theta` about the horizontal unit `axis`. */
function pitch(axis: Vec3, theta: number): Quaternion {
    const [s, c] = sinCos(theta / 2);
    return { w: c, x: axis.x * s, y: axis.y * s, z: 0 };
}

/**
 * The head's orientation on the path at arc angle `theta`: rot(n, θ) ⊗ q_aim. pathAt computes it the same way, so a
 * head the swing model places with it starts exactly on the path.
 */
export function swingOrientation(aim: Vec3, theta: number): Quaternion {
    return multiply(pitch(pitchAxis(aim), theta), aimRotation(aim));
}

/**
 * The swung body (design §3.3): the head and the arm mass at the top grip, one rigid body. Its centre lies `offset`
 * (δ, m) along the head's up axis (body z) from the head's centre; `inertia` is its principal inertia about that
 * centre, body frame.
 */
export interface SwungBody {
    readonly mass: number;
    readonly inertia: Vec3;
    readonly offset: number;
}

/**
 * The swung body of `head` with `hands`' arm mass m_a at the top grip, `radius` from the socket (design §3.3):
 * M = m + m_a, δ = m_a·(ρ + r)/M, and I' = (I_x + e, I_y + e, I_z) with e = m·δ² + m_a·(ρ + r − δ)², ρ the socket's
 * height above the head's centre. With no arm mass it is the head.
 */
export function swungBody(head: MalletHead, hands: Hands, radius: number): SwungBody {
    const arm = hands.armMass;
    const mass = head.mass + arm;
    const grip = head.socket.z + radius;
    const offset = (arm * grip) / mass;
    const extra = head.mass * offset * offset + arm * (grip - offset) * (grip - offset);
    const I = head.inertia;
    return { mass, inertia: vec3(I.x + extra, I.y + extra, I.z), offset };
}

/**
 * The swung body's effective mass (kg) at the face centre along the world unit `direction`, the head at `orientation`
 * (design §3.4): 1/(1/M + (r_f × u)·I'⁻¹·(r_f × u)), r_f = (L/2, 0, −δ) the face centre from the swung body's centre
 * and u the direction, both in the body frame.
 */
export function effectiveMass(body: SwungBody, head: MalletHead, orientation: Quaternion, direction: Vec3): number {
    const u = rotateInverse(orientation, direction);
    const k = cross(vec3(head.length / 2, 0, 0 - body.offset), u);
    const I = body.inertia;
    return 1 / (1 / body.mass + (k.x * k.x) / I.x + (k.y * k.y) / I.y + (k.z * k.z) / I.z);
}

/** One grip's gains (design §3.3), for a grip g. */
export interface HandGains {
    /** k(g) = g·M·(2π/T)² and c(g) = 2ζ·√(k(g)·M) (N/m, N·s/m). */
    readonly stiffness: number;
    readonly damping: number;
    /** About the shaft: K_s(g) = g·I_z·(2π/T)² and C_s(g) = 2ζ·√(K_s(g)·I_z) (N·m/rad, N·m·s/rad). */
    readonly twistStiffness: number;
    readonly twistDamping: number;
}

function handGains(coupling: Coupling, grip: number, body: SwungBody): HandGains {
    const rate = (2 * Math.PI) / coupling.period;
    const gain = grip * rate * rate;
    const stiffness = gain * body.mass;
    const Iz = body.inertia.z;
    const twistStiffness = gain * Iz;
    const twice = 2 * coupling.dampingRatio;
    return {
        stiffness,
        damping: twice * Math.sqrt(stiffness * body.mass),
        twistStiffness,
        twistDamping: twice * Math.sqrt(twistStiffness * Iz),
    };
}

/**
 * The hands' reach (design §3.2): the planned pivot until it has travelled 0.8·handReach along aim from contactAt, at
 * t1 (where it is at p1, with speed v1 along aim); then its along-aim component decelerates at `decel` to rest at
 * tStop and stays there. In carry mode the pivot also descends by `descent` (m) over [t1, tStop], rest to rest.
 */
export interface Reach {
    readonly t1: number;
    readonly p1: Vec3;
    readonly v1: number;
    readonly decel: number;
    readonly tStop: number;
    readonly descent: number;
}

/**
 * The free pendulum after the pendulum's window (swing mode, design §3.2): θ and ω tabulated every FREE_STEP from
 * `tw`, of I_P·θ̈ = −m·g·ℓ_h·sin θ − M·d·(A·t̂). `weight` is m·g·ℓ_h (N·m), `inertial` M·d (kg·m) and `inertia` I_P
 * (kg·m²).
 */
export interface FreePendulum {
    readonly tw: number;
    readonly theta: readonly number[];
    readonly omega: readonly number[];
    readonly weight: number;
    readonly inertial: number;
    readonly inertia: number;
}

/**
 * A tracked drive prepared once (design §3.2, §3.3): each arc's state where its window begins and ends, the dip's
 * acceleration, the reach, the free pendulum, the swung body and the grips' gains. Immutable: a run's grip state lives
 * in the integrator.
 */
export interface PreparedTrack {
    readonly kind: "track";
    readonly arc: SwingArc;
    readonly coupling: Coupling;
    readonly hands: Hands;
    /** The pitch axis n. */
    readonly axis: Vec3;
    /** q_aim. */
    readonly base: Quaternion;
    /** θ where the pendulum's window begins; θ and ω where it ends. */
    readonly thetaArc: number;
    readonly thetaEnd: number;
    readonly omegaEnd: number;
    /** The planned pivot where the hands' window begins; the pivot and its velocity where it ends. */
    readonly pivotHand: Vec3;
    readonly pivotEnd: Vec3;
    readonly pivotVelocityEnd: Vec3;
    /** The dip's acceleration, 4·depth/duration² (m/s²). */
    readonly dipAccel: number;
    /** Null where the reach does not bind. */
    readonly reach: Reach | null;
    /** Swing mode's free pendulum; null in carry mode. */
    readonly free: FreePendulum | null;
    readonly body: SwungBody;
    /** The head's weight m·g (N). */
    readonly headWeight: number;
    /** Gains of a firm grip (g = 1, both hands before relaxAt), the top hand's (γ_T) and the bottom hand's (g_B). */
    readonly firm: HandGains;
    readonly top: HandGains;
    readonly bottom: HandGains;
}

/** A point's position, velocity and acceleration (world frame). */
interface Motion {
    readonly P: Vec3;
    readonly V: Vec3;
    readonly A: Vec3;
}

/** A rest-to-rest lowering (m, m/s, m/s², all downward). */
interface Lowering {
    readonly z: number;
    readonly v: number;
    readonly a: number;
}

const LEVEL: Lowering = { z: 0, v: 0, a: 0 };

/**
 * A lowering by `depth` over `duration` at time `e` from its start, rest to rest: constant acceleration `a`
 * (4·depth/duration²) for the first half, −a for the second.
 */
function lowering(depth: number, duration: number, a: number, e: number): Lowering {
    if (!(depth > 0 && duration > 0 && e > 0)) {
        return LEVEL;
    }
    if (e <= duration / 2) {
        return { z: 0.5 * a * e * e, v: a * e, a };
    }
    if (e < duration) {
        const left = duration - e;
        return { z: depth - 0.5 * a * left * left, v: a * left, a: 0 - a };
    }
    return { z: depth, v: 0, a: 0 };
}

/** The planned pivot at time t: P₀ + V₀·t, then P_h + V₀·τ + ½·A·τ², then P_e + V_e·u (no reach, no dip). */
function planPivot(track: PreparedTrack, t: number): Motion {
    const { arc } = track;
    if (t <= arc.handStart) {
        return { P: add(arc.pivot, scale(arc.pivotVelocity, t)), V: arc.pivotVelocity, A: vec3(0, 0, 0) };
    }
    if (t <= arc.handStart + arc.handWindow) {
        const tau = t - arc.handStart;
        return {
            P: add(add(track.pivotHand, scale(arc.pivotVelocity, tau)), scale(arc.pivotAcceleration, 0.5 * tau * tau)),
            V: add(arc.pivotVelocity, scale(arc.pivotAcceleration, tau)),
            A: arc.pivotAcceleration,
        };
    }
    const u = t - (arc.handStart + arc.handWindow);
    return { P: add(track.pivotEnd, scale(track.pivotVelocityEnd, u)), V: track.pivotVelocityEnd, A: vec3(0, 0, 0) };
}

/**
 * The pivot at time t with the reach (and in carry mode its descent), without the dip. After t1 the along-aim
 * component eases to rest; any other component in the swing plane runs on as planned, so V stays continuous.
 */
function pivotAt(track: PreparedTrack, t: number): Motion {
    const plan = planPivot(track, t);
    const { reach } = track;
    if (reach === null || t <= reach.t1) {
        return plan;
    }
    const { aim } = track.arc;
    const tau = Math.min(t, reach.tStop) - reach.t1;
    const moving = t < reach.tStop;
    const along = dot(reach.p1, aim) + reach.v1 * tau - 0.5 * reach.decel * tau * tau;
    const speed = moving ? reach.v1 - reach.decel * tau : 0;
    const accel = moving ? 0 - reach.decel : 0;
    const span = reach.tStop - reach.t1;
    const down = lowering(reach.descent, span, (4 * reach.descent) / (span * span), tau);
    return {
        P: sub(add(plan.P, scale(aim, along - dot(plan.P, aim))), vec3(0, 0, down.z)),
        V: sub(add(plan.V, scale(aim, speed - dot(plan.V, aim))), vec3(0, 0, down.v)),
        A: sub(add(plan.A, scale(aim, accel - dot(plan.A, aim))), vec3(0, 0, down.a)),
    };
}

/** The dip at time t (design §3.2). */
function dipAt(track: PreparedTrack, t: number): Lowering {
    const { dip } = track.arc;
    return lowering(dip.depth, dip.duration, track.dipAccel, t - dip.start);
}

/** The free pendulum's θ̈ at θ and t (design §3.2), the pivot's acceleration A including the reach and the dip. */
function freeAlpha(track: PreparedTrack, free: FreePendulum, theta: number, t: number): number {
    const [s, c] = sinCos(theta);
    const A = sub(pivotAt(track, t).A, vec3(0, 0, dipAt(track, t).a));
    const along = dot(A, add(scale(track.arc.aim, c), scale(UP, s)));
    return (0 - free.weight * s - free.inertial * along) / free.inertia;
}

/**
 * The reach (design §3.2): where the planned pivot has travelled 0.8·handReach along aim from contactAt (by bisection;
 * the swing model's paths travel monotonically), and the ease to rest over the last 0.2·handReach. A handReach of 0
 * rests the along-aim motion from contactAt. Null if the plan does not travel that far within REACH_SEARCH.
 */
function computeReach(track: PreparedTrack): Reach | null {
    const { aim, contactAt, handReach } = track.arc;
    const p0 = planPivot(track, contactAt).P;
    if (!(handReach > 0)) {
        return { t1: contactAt, p1: p0, v1: 0, decel: 0, tStop: contactAt, descent: 0 };
    }
    const start = 0.8 * handReach;
    const along = (t: number): number => dot(sub(planPivot(track, t).P, p0), aim);
    let lo = contactAt;
    let hi = contactAt + REACH_SEARCH;
    if (along(hi) < start) {
        return null;
    }
    for (let i = 0; i < REACH_BISECTIONS; i++) {
        const mid = (lo + hi) / 2;
        if (along(mid) < start) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    const at = planPivot(track, hi);
    const v1 = Math.max(0, dot(at.V, aim));
    if (!(v1 > 0)) {
        return { t1: hi, p1: at.P, v1: 0, decel: 0, tStop: hi, descent: 0 };
    }
    const ease = 0.4 * handReach;
    return { t1: hi, p1: at.P, v1, decel: (v1 * v1) / ease, tStop: hi + ease / v1, descent: 0 };
}

/** Tabulates swing mode's free pendulum from the window's end by semi-implicit Euler every FREE_STEP (design §3.2). */
function computeFree(track: PreparedTrack, head: MalletHead, gravity: number): FreePendulum {
    const { arc, body } = track;
    const lh = head.socket.z + arc.radius;
    const d = lh - body.offset;
    const theta: number[] = [];
    const omega: number[] = [];
    const free: FreePendulum = {
        tw: arc.arcStart + arc.window,
        theta,
        omega,
        weight: head.mass * gravity * lh,
        inertial: body.mass * d,
        inertia: body.inertia.y + body.mass * d * d,
    };
    let th = track.thetaEnd;
    let om = track.omegaEnd;
    const n = Math.round(FREE_SPAN / FREE_STEP);
    for (let i = 0; i <= n; i++) {
        theta.push(th);
        omega.push(om);
        om += freeAlpha(track, free, th, free.tw + i * FREE_STEP) * FREE_STEP;
        th += om * FREE_STEP;
    }
    return free;
}

/**
 * Prepares `drive` for `head` under `gravity` (design §3.2, §3.3): the windows' end states, the reach, in carry mode
 * the descent D = max(0, z_s + groundDepth) (z_s the head's lowest point on the path at the reach's end without it),
 * in swing mode the free pendulum's table, the swung body and the gains.
 */
export function prepareTrack(drive: TrackDrive, head: MalletHead, gravity: number): PreparedTrack {
    const { arc, coupling, hands } = drive;
    const w = arc.window;
    const wh = arc.handWindow;
    const thetaArc = arc.theta0 + arc.omega0 * arc.arcStart;
    const pivotHand = add(arc.pivot, scale(arc.pivotVelocity, arc.handStart));
    const body = swungBody(head, hands, arc.radius);
    const plain: PreparedTrack = {
        kind: "track",
        arc,
        coupling,
        hands,
        axis: pitchAxis(arc.aim),
        base: aimRotation(arc.aim),
        thetaArc,
        thetaEnd: thetaArc + arc.omega0 * w + 0.5 * arc.alpha * w * w,
        omegaEnd: arc.omega0 + arc.alpha * w,
        pivotHand,
        pivotEnd: add(add(pivotHand, scale(arc.pivotVelocity, wh)), scale(arc.pivotAcceleration, 0.5 * wh * wh)),
        pivotVelocityEnd: add(arc.pivotVelocity, scale(arc.pivotAcceleration, wh)),
        dipAccel: (4 * arc.dip.depth) / (arc.dip.duration * arc.dip.duration),
        reach: null,
        free: null,
        body,
        headWeight: head.mass * gravity,
        firm: handGains(coupling, 1, body),
        top: handGains(coupling, hands.gripTension, body),
        bottom: handGains(coupling, hands.bottomGrip, body),
    };
    const reach = computeReach(plain);
    const reached: PreparedTrack = { ...plain, reach };
    if (arc.mode === "swing") {
        return { ...reached, free: computeFree(reached, head, gravity) };
    }
    if (reach === null || !(reach.tStop > reach.t1)) {
        return reached;
    }
    // The follow-through ends low (Riches): the head's lowest point reaches groundDepth below the turf.
    const end = headLowestPoint(headOnPath(reached, head, reach.tStop), head);
    return { ...reached, reach: { ...reach, descent: Math.max(0, end + arc.groundDepth) } };
}

/** The path at one instant: the socket's target and its derivatives, and the head's target orientation and spin. */
export interface PathPoint {
    readonly socket: Vec3;
    readonly socketVelocity: Vec3;
    readonly socketAcceleration: Vec3;
    readonly orientation: Quaternion;
    readonly angularVelocity: Vec3;
    readonly angularAcceleration: Vec3;
    /** The dip's part of the pivot's acceleration, world frame. */
    readonly dipAcceleration: Vec3;
    /** The pendulum's current angular acceleration α (rad/s²). */
    readonly pendulumAcceleration: number;
}

/** The pendulum's θ, ω and α at time t (design §3.2). */
function pendulumAt(track: PreparedTrack, t: number): { theta: number; omega: number; alpha: number } {
    const { arc } = track;
    if (t <= arc.arcStart) {
        return { theta: arc.theta0 + arc.omega0 * t, omega: arc.omega0, alpha: 0 };
    }
    const tw = arc.arcStart + arc.window;
    if (t <= tw) {
        const tau = t - arc.arcStart;
        return {
            theta: track.thetaArc + arc.omega0 * tau + 0.5 * arc.alpha * tau * tau,
            omega: arc.omega0 + arc.alpha * tau,
            alpha: arc.alpha,
        };
    }
    if (arc.mode === "carry") {
        // The slope is held: the rate falls linearly to zero over one more window, then θ holds.
        const u = Math.min(t - tw, arc.window);
        const rate = track.omegaEnd / arc.window;
        return {
            theta: track.thetaEnd + track.omegaEnd * u - 0.5 * rate * u * u,
            omega: track.omegaEnd - rate * u,
            alpha: u < arc.window ? 0 - rate : 0,
        };
    }
    // Swing mode: the free pendulum, interpolated in its table and clamped to its last sample beyond it.
    const free = track.free as FreePendulum;
    const x = (t - free.tw) / FREE_STEP;
    const last = free.theta.length - 1;
    const i = Math.min(Math.floor(x), last - 1);
    const f = Math.min(x - i, 1);
    const th0 = free.theta[i] as number;
    const om0 = free.omega[i] as number;
    const theta = th0 + f * ((free.theta[i + 1] as number) - th0);
    return {
        theta,
        omega: om0 + f * ((free.omega[i + 1] as number) - om0),
        alpha: freeAlpha(track, free, theta, t),
    };
}

/**
 * The path at time t (design §3.2): the pendulum's θ, ω and α, and the pivot with the reach and the dip, carried to
 * the socket and the head's orientation. Evaluates sinCos(θ) and sinCos(θ/2) (in swing mode after the window,
 * freeAlpha evaluates sinCos(θ) and the pivot once more).
 */
export function pathAt(track: PreparedTrack, t: number): PathPoint {
    const { arc } = track;
    const { theta, omega, alpha } = pendulumAt(track, t);
    const pivot = pivotAt(track, t);
    const dip = dipAt(track, t);
    const P = sub(pivot.P, vec3(0, 0, dip.z));
    const V = sub(pivot.V, vec3(0, 0, dip.v));
    const A = sub(pivot.A, vec3(0, 0, dip.a));
    const [s, c] = sinCos(theta);
    const radial = sub(scale(arc.aim, s), scale(UP, c));
    const tangent = add(scale(arc.aim, c), scale(UP, s));
    const r = arc.radius;
    return {
        socket: add(P, scale(radial, r)),
        socketVelocity: add(V, scale(tangent, r * omega)),
        socketAcceleration: sub(add(A, scale(tangent, r * alpha)), scale(radial, r * omega * omega)),
        orientation: multiply(pitch(track.axis, theta), track.base),
        angularVelocity: scale(track.axis, omega),
        angularAcceleration: scale(track.axis, alpha),
        dipAcceleration: vec3(0, 0, 0 - dip.a),
        pendulumAcceleration: alpha,
    };
}

/**
 * The head with its socket on the path at time t, moving with the path's rigid motion: its centre at p + d,
 * d = q_path(−socket), with velocity v_p + ω × d and the path's spin.
 */
export function headOnPath(track: PreparedTrack, head: MalletHead, t: number): HeadState {
    const p = pathAt(track, t);
    const d = rotate(p.orientation, sub(vec3(0, 0, 0), head.socket));
    return {
        position: add(p.socket, d),
        orientation: p.orientation,
        velocity: add(p.socketVelocity, cross(p.angularVelocity, d)),
        angularVelocity: p.angularVelocity,
    };
}

/** True inside a check: the pendulum's window with α < 0 (design §3.3). */
export function inCheck(track: PreparedTrack, t: number): boolean {
    const { arc } = track;
    return arc.alpha < 0 && t >= arc.arcStart && t <= arc.arcStart + arc.window;
}
