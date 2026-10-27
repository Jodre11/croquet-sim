/**
 * The tracked drive's path (P2b.2b.1 design §3.1, §3.2), as two arcs. The pendulum: the mallet swings about the top
 * hand (the pivot) in a vertical plane, the shaft at arc angle θ. The hands' path through space: the pivot moves in
 * that plane, without a push rests along aim from contact, and dips. Before contact the path follows the downswing
 * when the arc has one (P2b.2b.2a design §3.5); otherwise each arc runs at its initial rate until its window. Through
 * its window each changes rate by its mean rate times the window, delivered as a minimum-jerk pulse that starts and
 * ends at zero acceleration (Flash and Hogan 1985; P2b.2b.2c.2d design §3.1). After its window the pendulum swings
 * freely, slows to a held slope, or blends the two by λ (P2b.2b.2c.3a design §4.1). The dip lowers the pivot from rest
 * to rest. With a push, after contact the pivot travels the hands' arc at the plan's pace plus any advance's and stops
 * at the push length (P2b.2b.2b.2b design §4.1; P2b.2b.2c.3a A2 item 8). On every stroke after contact the hands
 * flex to an intended path that starts from the actual grips (carryLoad; P2b.2b.2b.2b design §3, §4; P2b.2b.2c.3a A2
 * item 5), and with a push swing the mallet through the pendulum phase.
 * Through the push they also push along aim against the balls' resistance, at the muscles' pace and capped
 * (pushIntent; gate ruling 2026-10-11). From the flex's start each hand and arm is Dong et al. 2013's x_h 5-DOF
 * hand–arm chain, its flex driving the chain's forearm (gate round 3 ruling, 2026-10-11). The
 * model's elements map to the engine's as: M0 the forearm, M1 the hand (palm–hand dorsum), M2 the fingers, each a
 * point mass (ArmChain); M3 and M4, the skin on the handle, rigid at the grip in the swung body (carryBody); K1, C1
 * `wrist` (M0–M1), K2, C2 `knuckle` (M1–M2), K3, C3 `palm` (M1–grip), K4, C4 `finger` (M2–grip); K0, C0 (M0 to the
 * body) the arm's flex.
 * Everything is continuous in position and velocity.
 *
 * Frames. n = aim × ẑ is the pitch axis: a positive rotation about it tilts aim upward. The head is rigid on the shaft,
 * its up axis s: at arc angle θ its orientation is rot(n, θ) ⊗ q_aim, q_aim turning body x to aim, and the socket's
 * target is P + r·(sin θ·aim − cos θ·ẑ). The head and the hands' skin on the handle move as one swung body (design
 * §3.3; carryBody); the downswing's plan keeps the arm mass at the top grip (swungBody). Exact operations only (sinCos
 * and atan2 from elementary.ts), like the rest of the engine.
 */
import { contactReference } from "../../reference/index";
import { atan2, exp, sinCos } from "../math/elementary";
import { ZERO, add, cross, dot, length, scale, sub, vec3, type Vec3 } from "../math/vec3";
import { flexForce, flexGains, gripGains } from "./flex";
import { multiply, rotate, rotateInverse, type Quaternion } from "./rigidBody";
import type {
    Coupling,
    Downswing,
    FlexLaw,
    HandChain,
    HandName,
    Hands,
    HeadState,
    MalletHead,
    SwingArc,
    TrackDrive,
} from "./types";

const UP = vec3(0, 0, 1);
const FORWARD = vec3(1, 0, 0);

/**
 * The hands' coupling, period (s) and damping ratio of a firm grip (design §3.4). Provisional, a user decision
 * (reference/contact.json); P2b.2b.2 fits it.
 */
export const HAND_COUPLING = {
    period: contactReference.handCouplingPeriod.value,
    dampingRatio: contactReference.handCouplingDampingRatio.value,
} as const;

/** The arm's flex (P2b.2b.2b.2b design §3.1, §3.2), reference/contact.json's measured arm values. */
export const ARM_FLEX: FlexLaw = {
    stiffness: contactReference.armStiffness.value,
    stiffnessPerForce: contactReference.armStiffnessPerForce.value,
    dampingRatio: contactReference.armDampingRatio.value,
    endpointMass: contactReference.armEndpointMass.value,
    hold: { stiffness: contactReference.armHoldStiffness.value, damping: contactReference.armHoldDamping.value },
};

/** F_pendulum (N, design §4.2): the bottom hand's largest push in the pendulum phase (reference/contact.json). */
export const PENDULUM_FORCE = contactReference.pendulumForce.value;

/** F_push (N, gate ruling 2026-10-11): the cap on the hands' push intent through a push (reference/contact.json). */
export const PUSH_FORCE = contactReference.pushForce.value;

/** τ_push (s, gate ruling amendment 2026-10-11): the push intent's response time constant (reference/contact.json). */
export const PUSH_RESPONSE_TIME = contactReference.pushResponseTime.value;

/** F_max (N, P2b.2b.2b.3 design §5): the hands' grip limit (reference/contact.json, Young et al. 2009). */
export const GRIP_LIMIT = contactReference.gripLimit.value;

/**
 * Each hand and arm on every stroke (gate round 3 ruling, 2026-10-11): Dong et al. 2013's x_h 5-DOF hand–arm model
 * (reference/contact.json), less its boundary to the body (K0, C0), whose place the arm's flex takes.
 */
export const HAND_CHAIN: HandChain = {
    forearmMass: contactReference.forearmMass.value,
    handMass: contactReference.handMass.value,
    fingerMass: contactReference.fingerMass.value,
    palmSkinMass: contactReference.palmSkinMass.value,
    fingerSkinMass: contactReference.fingerSkinMass.value,
    wristStiffness: contactReference.wristStiffness.value,
    wristDamping: contactReference.wristDamping.value,
    knuckleStiffness: contactReference.knuckleStiffness.value,
    knuckleDamping: contactReference.knuckleDamping.value,
    palmStiffness: contactReference.palmStiffness.value,
    palmDamping: contactReference.palmDamping.value,
    fingerStiffness: contactReference.fingerStiffness.value,
    fingerDamping: contactReference.fingerDamping.value,
};

/**
 * Step (s) of the free pendulum's table (design §3.2): the impact's own step, so the table resolves the swing as
 * finely as the integrator does. Numerical, not physical.
 */
export const FREE_STEP = 5e-6;

/**
 * Span (s) of the free pendulum's table past the pendulum's window (design §3.2). Numerical: a tracked stroke runs at
 * most MAX_LEAD (0.15 s, the longest lead-in) plus FOLLOW_CAP (1 s, the follow-through's cap after contact) from
 * t = 0, and the table runs through the window first, so 1.2 s past it covers every stroke with a 50 ms guard
 * (P2b.2b.2a design §4.4). simulateImpact is public and accepts any contactAt or cap: beyond the table θ and ω hold.
 */
export const FREE_SPAN = 1.2;

/**
 * How long after contactAt (s) the push may take to travel its length or reach its pendulum phase before it is taken
 * never to (design §3.2). A modelling bound, not physical: past it the impact has long ended.
 */
const REACH_SEARCH = 0.5;

/** Bisections of REACH_SEARCH for the reach's start: numerical, enough to reach a double's resolution. */
const REACH_BISECTIONS = 80;

/**
 * The squared size of aim − (aim·s)s (that is sin² of the angle between aim and the shaft axis s) at or below which the
 * bottom hand's forward e has no defined direction. Not physical: a shaft within ~1e-9 rad of the aim, numerical.
 */
const FORWARD_UNDEFINED = 1e-18;

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
 * The swung body (design §3.3): the mallet (malletBody) and the arm mass at the top grip, one rigid
 * body. Its centre lies `offset` (δ, m) along the head's up axis (body z) from the head's centre; `inertia` is its
 * principal inertia about that centre, body frame.
 */
export interface SwungBody {
    readonly mass: number;
    readonly inertia: Vec3;
    readonly offset: number;
}

/**
 * The mallet as one rigid body (P2b.2b.2b.2c design §4.2): `head` and its shaft, a thin uniform rod of mass m_s and
 * length ℓ from the socket (0, 0, h_z) up body z. M = m + m_s, δ = m_s·(h_z + ℓ/2)/M along body z, and
 * I' = (I_x + e, I_y + e, I_z), e = m·δ² + m_s·((h_z + ℓ/2 − δ)² + ℓ²/12). With no shaft mass it is the head itself:
 * its mass, its inertia and offset 0, with no added zero terms.
 */
export function malletBody(head: MalletHead): SwungBody {
    const { mass: rod, length } = head.shaft;
    if (rod === 0) {
        return { mass: head.mass, inertia: head.inertia, offset: 0 };
    }
    const mass = head.mass + rod;
    const rise = head.socket.z + length / 2;
    const offset = (rod * rise) / mass;
    const extra = head.mass * offset * offset + rod * ((rise - offset) * (rise - offset) + (length * length) / 12);
    const I = head.inertia;
    return { mass, inertia: vec3(I.x + extra, I.y + extra, I.z), offset };
}

/**
 * `base` with point masses rigid on its up axis, each `mass` (kg) at `height` (m) above the head's centre: the
 * combined mass, centre and principal inertia by the parallel-axis rule.
 */
function withPoints(base: SwungBody, points: readonly { readonly mass: number; readonly height: number }[]): SwungBody {
    let mass = base.mass;
    let moment = base.mass * base.offset;
    for (const p of points) {
        mass += p.mass;
        moment += p.mass * p.height;
    }
    const offset = moment / mass;
    let extra = base.mass * (base.offset - offset) * (base.offset - offset);
    for (const p of points) {
        extra += p.mass * (p.height - offset) * (p.height - offset);
    }
    const I = base.inertia;
    return { mass, inertia: vec3(I.x + extra, I.y + extra, I.z), offset };
}

/**
 * The swung body of `head` with `hands`' arm mass m_a at the top grip, `radius` from the socket (design §3.3):
 * M = m + m_a, δ = m_a·(ρ + r)/M, and I' = (I_x + e, I_y + e, I_z) with e = m·δ² + m_a·(ρ + r − δ)², ρ the socket's
 * height above the head's centre. With no arm mass it is the head. Built on the mallet (malletBody) when the shaft has
 * mass (P2b.2b.2b.2c design §4.2); with none, on the head alone, with no added zero terms.
 */
export function swungBody(head: MalletHead, hands: Hands, radius: number): SwungBody {
    if (head.shaft.mass !== 0) {
        return withPoints(malletBody(head), [{ mass: hands.armMass, height: head.socket.z + radius }]);
    }
    const arm = hands.armMass;
    const mass = head.mass + arm;
    const grip = head.socket.z + radius;
    const offset = (arm * grip) / mass;
    const extra = head.mass * offset * offset + arm * (grip - offset) * (grip - offset);
    const I = head.inertia;
    return { mass, inertia: vec3(I.x + extra, I.y + extra, I.z), offset };
}

/**
 * The swung body (gate round 3 ruling, 2026-10-11; P2b.2b.2c.3a A2 item 4): `head` with each holding hand's skin on
 * the handle, M3 + M4 of `chain`, rigid at its grip: the top grip `radius` from the socket and, unless `bottom` is
 * null, the bottom grip `bottom` from it. M = m + Σ s, δ = Σ s·z/M and I' = (I_x + e, I_y + e, I_z),
 * e = m·δ² + Σ s·(z − δ)², z each grip's height above the head's centre. The skin's weight is the hand's to carry
 * (carryLoad), so the body has inertia from it and no weight. Built on the mallet (malletBody) when the shaft has mass
 * (P2b.2b.2b.2c design §4.2); with none, on the head alone, with no added zero terms.
 */
export function carryBody(head: MalletHead, chain: HandChain, radius: number, bottom: number | null): SwungBody {
    const skin = chain.palmSkinMass + chain.fingerSkinMass;
    const top = head.socket.z + radius;
    const low = bottom === null ? 0 : head.socket.z + bottom;
    const bottomSkin = bottom === null ? 0 : skin;
    if (head.shaft.mass !== 0) {
        const grips = [{ mass: skin, height: top }];
        return withPoints(malletBody(head), bottom === null ? grips : [...grips, { mass: skin, height: low }]);
    }
    const mass = head.mass + skin + bottomSkin;
    const offset = (skin * top + bottomSkin * low) / mass;
    const extra =
        head.mass * offset * offset +
        skin * (top - offset) * (top - offset) +
        bottomSkin * (low - offset) * (low - offset);
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
 * The hands' reach (design §3.2): the planned pivot until t1 (where it is at p1, with speed v1 along aim); then its
 * along-aim component decelerates at `decel` to rest at tStop and stays there. Without a push the reach rests from
 * contactAt (restingReach); a reach forward is the push's (P2b.2b.2c.3a A2 item 8).
 */
export interface Reach {
    readonly t1: number;
    readonly p1: Vec3;
    readonly v1: number;
    readonly decel: number;
    readonly tStop: number;
}

/**
 * The hands' advance along aim (P2b.2b.2c.1 design §6): a ramp from rest to V, a cruise at V, then an ease to rest at
 * handReach, on a level path. Times are in s from t = 0.
 */
export interface Advance {
    /** When the hands start from rest (s). */
    readonly start: number;
    /** V, the cruise speed: the head's planned speed along aim at contact (m/s). */
    readonly speed: number;
    /** a, the body's peak hand acceleration over the ramp (m/s²). */
    readonly accel: number;
    /** When the ramp reaches V, start + V/a (s). */
    readonly ramp: number;
    /** When the hands have travelled 0.8·handReach and start to ease (s). */
    readonly cruise: number;
    /** The ease's deceleration, V²/(0.4·handReach) (m/s²). */
    readonly decel: number;
    /** When the hands come to rest, handReach (m) along aim from where they started (s). */
    readonly end: number;
}

/**
 * The hands' push through (P2b.2b.2b.2b design §4.1, §4.2; P2b.2b.2c.3a A2 item 8), on every stroke with a handReach
 * above 0: from `start` (contactAt), the planned pivot at `origin`, the intended path travels along aim at the plan's
 * pace plus any `advance`'s on the hands' arc. It reaches pendulumAt·handReach at `pendulum` and the push length
 * handReach at `end`, where it stops at once (s from t = 0; null where the hands do not travel that far within
 * REACH_SEARCH). `low` is s_low (m), the arc's lowPoint else handArcLow·handReach, and `level` √(ρ_h² − s_low²) (m),
 * the arc's centre's height above the hands at contact.
 */
export interface Push {
    readonly start: number;
    readonly origin: Vec3;
    readonly end: number | null;
    readonly pendulum: number | null;
    readonly low: number;
    readonly level: number;
    /** The hands' advance (P2b.2b.2c.1 design §6), its travel added to the plan's; null without one. */
    readonly advance: Advance | null;
}

/**
 * The free pendulum from the pendulum's window's start (design §3.2; P2b.2b.2c.2d design §3.1): θ and ω
 * tabulated every FREE_STEP from `tw`, arcStart, of I_P·θ̈ = −W·sin θ − M·d·(A·t̂), plus the pulse's I_P·6·ᾱ·s(1 − s)
 * within the window, so that gravity acts through it. `weight` is W, m·g·ℓ_h with the shaft's term (pendulumOf; N·m),
 * `inertial` M·d (kg·m) and `inertia` I_P (kg·m²). `pulseOnly` marks a table that runs through the window only.
 */
export interface FreePendulum {
    readonly tw: number;
    readonly theta: readonly number[];
    readonly omega: readonly number[];
    readonly weight: number;
    readonly inertial: number;
    readonly inertia: number;
    readonly pulseOnly: boolean;
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
    /** θ and ω where the pendulum's window begins; θ and ω where it ends. */
    readonly thetaArc: number;
    readonly omegaArc: number;
    readonly thetaEnd: number;
    readonly omegaEnd: number;
    /** The planned pivot and its velocity where the hands' window begins; the pivot and its velocity where it ends. */
    readonly pivotHand: Vec3;
    readonly pivotVelocityHand: Vec3;
    readonly pivotEnd: Vec3;
    readonly pivotVelocityEnd: Vec3;
    /** The dip's acceleration, 4·depth/duration² (m/s²). */
    readonly dipAccel: number;
    /** The resting reach where there is no push (restingReach, a handReach of 0); null with a push. */
    readonly reach: Reach | null;
    /** The push (P2b.2b.2c.3a A2 item 8): non-null exactly where handReach > 0. */
    readonly push: Push | null;
    /** The free pendulum; null on a fully held slope (λ = 1), or where prepareTrack skipped it. */
    readonly free: FreePendulum | null;
    /**
     * A stop's hold (holdPendulum): the pendulum held at θ (rad) from `from` (s) on; null otherwise. It lives on the
     * track, not the free table, so a check on a fully held slope, which has no table, holds too (P2b.2b.2c.3a A2
     * item 7).
     */
    readonly held: { readonly from: number; readonly theta: number } | null;
    /** The swung body: the mallet with both hands' skin at their grips (carryBody; P2b.2b.2c.3a A2 item 4). */
    readonly body: SwungBody;
    /** The swung body once the bottom hand has let go, with the top hand's skin alone. */
    readonly released: SwungBody;
    /** The head's weight m·g (N). */
    readonly headWeight: number;
    /**
     * The shaft's weight m_s·g (N), 0 with no shaft mass, and its centre's height h_z + ℓ/2 above the head's centre
     * along the shaft (m), where it acts (P2b.2b.2b.2c design §4.3).
     */
    readonly shaftWeight: number;
    readonly shaftRise: number;
    /** g (m/s²), for the weights of the hand–arm chains (gate round 3 ruling, 2026-10-11). */
    readonly gravity: number;
    /** Gains of a firm grip (g = 1, both hands before relaxAt), the top hand's (γ_T) and the bottom hand's (g_B). */
    readonly firm: HandGains;
    readonly top: HandGains;
    readonly bottom: HandGains;
}

/** A point's position, velocity and acceleration (world frame). */
export interface Motion {
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

/** The pendulum's θ (rad), ω (rad/s) and α (rad/s²). */
export interface Swing {
    readonly theta: number;
    readonly omega: number;
    readonly alpha: number;
}

/**
 * The pendulum about the top hand (design §3.2): I_P·θ̈ = −weight·sin θ − inertial·(A·t̂) + τ, with weight W = m·g·ℓ_h
 * plus the shaft's m_s·g·(ℓ_h − h_z − ℓ/2) (pendulumOf; N·m), inertial = M·d (kg·m) and inertia = I_P (kg·m²).
 */
export interface Pendulum {
    readonly weight: number;
    readonly inertial: number;
    readonly inertia: number;
}

/**
 * The pendulum of `body` swinging `head` about a top hand `radius` from the socket under `gravity`: ℓ_h = ρ + r,
 * d = ℓ_h − δ, I_P = I'_y + M·d² (design §3.2). Its weight term is m·g·ℓ_h, plus the shaft's m_s·g·(ℓ_h − h_z − ℓ/2) at
 * its own centre (P2b.2b.2b.2c design §4.3); the arm mass in the body has inertia but no weight.
 */
export function pendulumOf(head: MalletHead, body: SwungBody, radius: number, gravity: number): Pendulum {
    const lh = head.socket.z + radius;
    const d = lh - body.offset;
    const inertial = body.mass * d;
    const inertia = body.inertia.y + body.mass * d * d;
    const { mass: rod, length } = head.shaft;
    if (rod === 0) {
        return { weight: head.mass * gravity * lh, inertial, inertia };
    }
    const below = lh - head.socket.z - length / 2;
    return { weight: head.mass * gravity * lh + rod * gravity * below, inertial, inertia };
}

/** How many samples the downswing's scan visits (P2b.2b.2a design §3.4): its table's, or the closed form's like it. */
export function downswingSamples(down: Downswing): number {
    if (down.tempo === null) {
        return down.theta.length;
    }
    return Math.ceil((0 - down.release) / FREE_STEP) + 1;
}

/** The time (s from contact) of sample k: the release plus k·FREE_STEP, the last sample at contact. */
export function downswingTime(down: Downswing, k: number): number {
    return k === downswingSamples(down) - 1 ? 0 : down.release + k * FREE_STEP;
}

/**
 * The downswing's pendulum at time t (s from contact, at most 0; P2b.2b.2a design §3.3, §3.4): held at the top before
 * the release; for the closed form θ = θ_top + span·σ²; otherwise its table, interpolated linearly.
 */
export function downswingAt(down: Downswing, t: number): Swing {
    if (t < down.release) {
        return { theta: down.thetaTop, omega: 0, alpha: 0 };
    }
    if (down.tempo !== null) {
        const T = down.tempo;
        const sigma = Math.min(t - down.release, T) / T;
        return {
            theta: down.thetaTop + down.span * sigma * sigma,
            omega: (2 * down.span * sigma) / T,
            alpha: (2 * down.span) / (T * T),
        };
    }
    const lerp = tableLerp(down, t);
    return { theta: lerp(down.theta), omega: lerp(down.omega), alpha: lerp(down.alpha) };
}

/**
 * A reader of a column of `down`'s table at time t (s from contact, at or after the release), interpolated linearly
 * between its samples; at contact and after, the last sample.
 */
function tableLerp(down: Downswing, t: number): (values: readonly number[]) => number {
    const n = down.theta.length;
    if (t >= 0) {
        // Contact exactly: σ is then exactly 1 and the hands arrive on their path's end.
        const last = n - 1;
        return (values) => values[last] as number;
    }
    const i = Math.max(0, Math.min(Math.floor((t - down.release) / FREE_STEP), n - 2));
    const t0 = down.release + i * FREE_STEP;
    const t1 = i + 1 === n - 1 ? 0 : down.release + (i + 1) * FREE_STEP;
    const f = Math.min(Math.max((t - t0) / (t1 - t0), 0), 1);
    return (values) => {
        const a = values[i] as number;
        return a + f * ((values[i + 1] as number) - a);
    };
}

/**
 * The downswing's hands at time t (s from contact; P2b.2b.2a design §3.3), the pendulum at `swing`: P(σ) and its
 * derivatives. σ is led by time on the closed form, by the table's own hands' progress on a blend
 * (P2b.2b.2c.3a design §4.1), and otherwise by the pendulum, σ = (θ − θ_top)/span. At rest at the top before the
 * release.
 */
export function downswingHands(down: Downswing, t: number, swing: Swing): Motion {
    if (t < down.release) {
        return { P: down.handsTop, V: vec3(0, 0, 0), A: vec3(0, 0, 0) };
    }
    let sigma: number;
    let rate: number;
    let accel: number;
    const progress = down.handsProgress;
    if (down.tempo !== null) {
        sigma = Math.min(t - down.release, down.tempo) / down.tempo;
        rate = 1 / down.tempo;
        accel = 0;
    } else if (progress !== undefined) {
        const lerp = tableLerp(down, t);
        sigma = lerp(progress.sigma);
        rate = lerp(progress.rate);
        accel = lerp(progress.accel);
    } else {
        sigma = (swing.theta - down.thetaTop) / down.span;
        rate = swing.omega / down.span;
        accel = swing.alpha / down.span;
    }
    const slope = add(scale(down.across, 2 * sigma), scale(down.drop, 6 * sigma - 6 * sigma * sigma));
    const bend = add(scale(down.across, 2), scale(down.drop, 6 - 12 * sigma));
    const rise = (3 - 2 * sigma) * sigma * sigma;
    const P = add(add(down.handsTop, scale(down.across, sigma * sigma)), scale(down.drop, rise));
    // A table adds the Hermite term only where it is non-zero, so that a level arrival keeps today's bits.
    if (down.tempo === null && down.tangent.z === 0) {
        return { P, V: scale(slope, rate), A: add(scale(bend, rate * rate), scale(slope, accel)) };
    }
    // The Hermite term T·(σ³ − σ²) brings the hands onto the arc (P2b.2b.2b.2b design §4.1).
    const T = down.tangent;
    const arcSlope = add(slope, scale(T, 3 * sigma * sigma - 2 * sigma));
    const arcBend = add(bend, scale(T, 6 * sigma - 2));
    return {
        P: add(P, scale(T, sigma * sigma * sigma - sigma * sigma)),
        V: scale(arcSlope, rate),
        A: add(scale(arcBend, rate * rate), scale(arcSlope, accel)),
    };
}

/** The pendulum before its window: on the downswing before contactAt, if there is one, else coasting at ω₀. */
function beforeWindow(arc: SwingArc, t: number): Swing {
    if (arc.downswing !== undefined && t < arc.contactAt) {
        return downswingAt(arc.downswing, t - arc.contactAt);
    }
    return { theta: arc.theta0 + arc.omega0 * t, omega: arc.omega0, alpha: 0 };
}

/** The planned pivot before the hands' window: on the downswing before contactAt, if there is one, else P₀ + V₀·t. */
function beforeHands(arc: SwingArc, t: number): Motion {
    if (arc.downswing !== undefined && t < arc.contactAt) {
        const u = t - arc.contactAt;
        return downswingHands(arc.downswing, u, downswingAt(arc.downswing, u));
    }
    return { P: add(arc.pivot, scale(arc.pivotVelocity, t)), V: arc.pivotVelocity, A: vec3(0, 0, 0) };
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

/**
 * The dip's travel (m, downward) at time `e` (s) from its start: the rest-to-rest lowering by `depth` over `duration`,
 * its acceleration 4·depth/duration² as prepareTrack's (P2b.2b.2c.2d design §4.2).
 */
export function dipTravel(depth: number, duration: number, e: number): number {
    return lowering(depth, duration, (4 * depth) / (duration * duration), e).z;
}

/**
 * The planned pivot at time t: before the hands' window (the downswing, or P₀ + V₀·t), then the minimum-jerk pulse of
 * mean A over the window T, s = τ/T: P_h + V_h·τ + A·T²·(s³ − s⁴/2), V_h + A·T·(3s² − 2s³), 6·A·s(1 − s); then
 * P_e + V_e·u (no reach, no dip).
 */
function planPivot(track: PreparedTrack, t: number): Motion {
    const { arc } = track;
    if (t <= arc.handStart) {
        return beforeHands(arc, t);
    }
    if (t <= arc.handStart + arc.handWindow) {
        // As the pendulum's pulse: s clamped to 1 keeps every factor of A non-negative, so A = 0 gives the box's bits.
        const T = arc.handWindow;
        const tau = t - arc.handStart;
        const s = Math.min(tau / T, 1);
        return {
            P: add(
                add(track.pivotHand, scale(track.pivotVelocityHand, tau)),
                scale(arc.pivotAcceleration, T * T * (s * s * s * (1 - 0.5 * s))),
            ),
            V: add(track.pivotVelocityHand, scale(arc.pivotAcceleration, T * (s * s * (3 - 2 * s)))),
            A: scale(arc.pivotAcceleration, 6 * (s * (1 - s))),
        };
    }
    const u = t - (arc.handStart + arc.handWindow);
    return { P: add(track.pivotEnd, scale(track.pivotVelocityEnd, u)), V: track.pivotVelocityEnd, A: vec3(0, 0, 0) };
}

/**
 * The advance's travel along aim at time t, on a level path: `a` (m), `v` (m/s) and `acc` (m/s²); 0, 0, 0 before its
 * start, and handReach at rest from its end.
 */
export function advanceTravel(
    advance: Advance,
    t: number,
): { readonly a: number; readonly v: number; readonly acc: number } {
    const { start, speed, accel, ramp, cruise, decel, end } = advance;
    if (t < start) {
        return { a: 0, v: 0, acc: 0 };
    }
    if (t < ramp) {
        const tau = t - start;
        return { a: 0.5 * accel * tau * tau, v: accel * tau, acc: accel };
    }
    const ramped = 0.5 * accel * (ramp - start) * (ramp - start);
    if (t < cruise) {
        return { a: ramped + speed * (t - ramp), v: speed, acc: 0 };
    }
    const cruised = ramped + speed * (cruise - ramp);
    if (t < end) {
        const u = t - cruise;
        return { a: cruised + speed * u - 0.5 * decel * u * u, v: speed - decel * u, acc: 0 - decel };
    }
    const u = end - cruise;
    return { a: cruised + speed * u - 0.5 * decel * u * u, v: 0, acc: 0 };
}

/**
 * The pivot at time t, without the dip, planned so that the free table includes it: with a push after contactAt on
 * the hands' arc (carryPivot), and before it from an earlier advance's start the plan with the advance's travel on
 * that arc (earlyAdvance); without one, with the resting reach: after t1 the along-aim component eases to rest, and
 * any other component in the swing plane runs on as planned, so V stays continuous.
 */
function pivotAt(track: PreparedTrack, t: number): Motion {
    const { push } = track;
    if (push !== null && t > push.start) {
        return carryPivot(track, push, t);
    }
    const plan = planPivot(track, t);
    if (push !== null) {
        const { advance } = push;
        return advance !== null && t > advance.start ? earlyAdvance(track, push, advance, plan, t) : plan;
    }
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
    return {
        P: add(plan.P, scale(aim, along - dot(plan.P, aim))),
        V: add(plan.V, scale(aim, speed - dot(plan.V, aim))),
        A: add(plan.A, scale(aim, accel - dot(plan.A, aim))),
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

/** A reach that rests the planned pivot's along-aim motion from contactAt: it travels no further along aim. */
function restingReach(track: PreparedTrack): Reach {
    const { contactAt } = track.arc;
    return { t1: contactAt, p1: planPivot(track, contactAt).P, v1: 0, decel: 0, tStop: contactAt };
}

/**
 * When the push has travelled `distance` (m) along aim from the planned pivot at contactAt (P2b.2b.2b.2b design §4.1,
 * §4.2): the plan's travel plus any `advance`'s (P2b.2b.2c.3a A2 item 8), by bisection (the plans and the advance
 * travel monotonically); contactAt for a distance of 0 or less; null if the hands do not travel that far within
 * REACH_SEARCH.
 */
function travelTime(track: PreparedTrack, distance: number, advance: Advance | null): number | null {
    const { aim, contactAt } = track.arc;
    if (!(distance > 0)) {
        return contactAt;
    }
    const p0 = planPivot(track, contactAt).P;
    // Without an advance the plan's travel alone, so a roll keeps its bits: no zero term added.
    const along =
        advance === null
            ? (t: number): number => dot(sub(planPivot(track, t).P, p0), aim)
            : (t: number): number => dot(sub(planPivot(track, t).P, p0), aim) + advanceTravel(advance, t).a;
    let lo = contactAt;
    let hi = contactAt + REACH_SEARCH;
    if (along(hi) < distance) {
        return null;
    }
    for (let i = 0; i < REACH_BISECTIONS; i++) {
        const mid = (lo + hi) / 2;
        if (along(mid) < distance) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    return hi;
}

/** The push for `track` (design §4.1, §4.2; P2b.2b.2c.3a A2 item 8), its advance from the arc's. */
function computePush(track: PreparedTrack): Push {
    const { arc } = track;
    // A shot's feet place the low point directly; without them, today's fraction of the push.
    const low = arc.lowPoint ?? arc.handArcLow * arc.handReach;
    const advance = arc.advance === undefined ? null : advanceOf(arc, arc.advance);
    return {
        start: arc.contactAt,
        origin: planPivot(track, arc.contactAt).P,
        end: travelTime(track, arc.handReach, advance),
        pendulum: travelTime(track, arc.pendulumAt * arc.handReach, advance),
        low,
        level: Math.sqrt(arc.handArcRadius * arc.handArcRadius - low * low),
        advance,
    };
}

/**
 * The height on the push's arc of hands `s` (m) along aim from its origin, moving at ṡ = `ds` and s̈ = `dds`:
 * z(s) = level − √(ρ_h² − (s − s_low)²) above the origin, with ż = z′·ṡ and z̈ = z″·ṡ² + z′·s̈, z′ = u/√(ρ_h² − u²) and
 * z″ = ρ_h²/(ρ_h² − u²)^{3/2}, u = s − s_low.
 */
function arcHeight(
    track: PreparedTrack,
    push: Push,
    s: number,
    ds: number,
    dds: number,
): { readonly z: number; readonly v: number; readonly a: number } {
    const { handArcRadius } = track.arc;
    const u = s - push.low;
    const root = Math.sqrt(handArcRadius * handArcRadius - u * u);
    const slope = u / root;
    const curve = (handArcRadius * handArcRadius) / (root * root * root);
    return { z: push.level - root, v: slope * ds, a: curve * ds * ds + slope * dds };
}

/**
 * The push's planned pivot after contactAt (design §4.1; P2b.2b.2c.3a A2 item 8): s(t), the plan's travel along aim
 * from the push's origin plus any advance's, until the push's end, then the push length at rest; its height on the
 * hands' arc (arcHeight). Hands that run past the push length without a found end (beyond REACH_SEARCH) also rest
 * there.
 */
function carryPivot(track: PreparedTrack, push: Push, t: number): Motion {
    const { aim, handReach } = track.arc;
    const plan = planPivot(track, t);
    let raw = dot(sub(plan.P, push.origin), aim);
    let pace = dot(plan.V, aim);
    let surge = dot(plan.A, aim);
    // Without an advance the plan's pace alone, so a roll keeps its bits: no zero term added.
    if (push.advance !== null) {
        const { a, v, acc } = advanceTravel(push.advance, t);
        raw += a;
        pace += v;
        surge += acc;
    }
    const stopped = (push.end !== null && t >= push.end) || raw >= handReach;
    const s = stopped ? handReach : raw;
    const ds = stopped ? 0 : pace;
    const dds = stopped ? 0 : surge;
    const height = arcHeight(track, push, s, ds, dds);
    return {
        P: add(add(push.origin, scale(aim, s)), vec3(0, 0, height.z)),
        V: add(scale(aim, ds), vec3(0, 0, height.v)),
        A: add(scale(aim, dds), vec3(0, 0, height.a)),
    };
}

/**
 * The planned pivot `plan` at time t before contactAt, from the start of an advance timed earlier: the advance's travel
 * a along aim on the push's arc, so that the hands reach contact a along it, where the push's own path (carryPivot)
 * takes them on from: their place does not step there.
 */
function earlyAdvance(track: PreparedTrack, push: Push, advance: Advance, plan: Motion, t: number): Motion {
    const { aim } = track.arc;
    const { a, v, acc } = advanceTravel(advance, t);
    const height = arcHeight(track, push, a, v, acc);
    return {
        P: add(add(plan.P, scale(aim, a)), vec3(0, 0, height.z)),
        V: add(add(plan.V, scale(aim, v)), vec3(0, 0, height.v)),
        A: add(add(plan.A, scale(aim, acc)), vec3(0, 0, height.a)),
    };
}

/**
 * The advance of `arc` from `given`, its shape the reach's ease: with a the body's peak acceleration, V the speed and D
 * the handReach, the ramp ends W = V/a after the start, the ramp a body property, the cruise once the hands have
 * travelled 0.8·D, and the deceleration V²/(0.4·D) brings them to rest at D. planStroke has checked that the ramp's
 * travel V·W/2 is under 0.8·D.
 */
function advanceOf(arc: SwingArc, given: NonNullable<SwingArc["advance"]>): Advance {
    const { start, speed, accel } = given;
    const W = speed / accel;
    const D = arc.handReach;
    const ramp = start + W;
    const cruise = ramp + (0.8 * D - (speed * W) / 2) / speed;
    const ease = 0.4 * D;
    return { start, speed, accel, ramp, cruise, decel: (speed * speed) / ease, end: cruise + ease / speed };
}

/** The pendulum's minimum-jerk pulse at time t within its window, 6·ᾱ·s(1 − s), s = τ/T (P2b.2b.2c.2d design §3.1). */
function pulseAlpha(arc: SwingArc, t: number): number {
    const s = (t - arc.arcStart) / arc.window;
    return 6 * arc.alpha * (s * (1 - s));
}

/**
 * Tabulates the free pendulum by semi-implicit Euler every FREE_STEP from the window's start, at θ and ω
 * there (design §3.2; P2b.2b.2c.2d design §3.1): through the window with the pulse added to gravity's term (only for a
 * pulse, so that at drive 0 it is the bare free pendulum's), then FREE_SPAN on, unless `pulseOnly`. The player's effort
 * ends where the pulse starts.
 */
function computeFree(track: PreparedTrack, head: MalletHead, gravity: number, pulseOnly: boolean): FreePendulum {
    const { arc, body } = track;
    const theta: number[] = [];
    const omega: number[] = [];
    const free: FreePendulum = {
        tw: arc.arcStart,
        theta,
        omega,
        ...pendulumOf(head, body, arc.radius, gravity),
        pulseOnly,
    };
    const end = arc.arcStart + arc.window;
    const pulsed = arc.alpha !== 0;
    let th = track.thetaArc;
    let om = track.omegaArc;
    // One sample past the window's end, so that a read up to it interpolates inside the table, never at its clamp: a
    // table through the pulse alone then reads there as the full table does, to the bit.
    const through = Math.ceil(arc.window / FREE_STEP) + 1;
    const n = pulseOnly ? through : through + Math.round(FREE_SPAN / FREE_STEP);
    for (let i = 0; i <= n; i++) {
        theta.push(th);
        omega.push(om);
        const t = free.tw + i * FREE_STEP;
        const a = freeAlpha(track, free, th, t);
        om += (pulsed && t < end ? a + pulseAlpha(arc, t) : a) * FREE_STEP;
        th += om * FREE_STEP;
    }
    return free;
}

/** θ and ω interpolated in `free`'s table at t (s, from its start on), clamped to its last sample beyond it. */
function tableAt(free: FreePendulum, t: number): { readonly theta: number; readonly omega: number } {
    const x = (t - free.tw) / FREE_STEP;
    const last = free.theta.length - 1;
    const i = Math.min(Math.floor(x), last - 1);
    const f = Math.min(x - i, 1);
    const th0 = free.theta[i] as number;
    const om0 = free.omega[i] as number;
    return {
        theta: th0 + f * ((free.theta[i + 1] as number) - th0),
        omega: om0 + f * ((free.omega[i + 1] as number) - om0),
    };
}

/**
 * Prepares `drive` for `head` under `gravity` (design §3.2, §3.3): the windows' end states; with a handReach above 0
 * the push (P2b.2b.2b.2b design §4.1; P2b.2b.2c.3a A2 item 8), else the resting reach; wherever the slope is not
 * fully held (λ < 1, P2b.2b.2c.3a design §4.1) the free pendulum's table from the window's start, its θ and ω at the
 * window's end being the table's (P2b.2b.2c.2d design §3.1); the swung body and the gains. Without `withFree` the
 * table runs through the pulse only: a caller that reads the path only up to the pendulum's window's
 * end saves its cost, and a read past it throws.
 */
export function prepareTrack(drive: TrackDrive, head: MalletHead, gravity: number, withFree = true): PreparedTrack {
    const { arc, coupling, hands } = drive;
    const w = arc.window;
    const wh = arc.handWindow;
    const atArc = beforeWindow(arc, arc.arcStart);
    const atHands = beforeHands(arc, arc.handStart);
    // Every stroke's hands hold the mallet through their hand–arm chains (gate round 3 ruling, 2026-10-11; P2b.2b.2c.3a
    // A2 item 4), which replace the arm mass riding rigidly at the top grip: the swung body is the head with the hands'
    // skin at the grips. The downswing still plans on the arm mass (swungBody, downswingInput).
    const body = carryBody(head, hands.chain, arc.radius, hands.bottom);
    const plain: PreparedTrack = {
        kind: "track",
        arc,
        coupling,
        hands,
        axis: pitchAxis(arc.aim),
        base: aimRotation(arc.aim),
        thetaArc: atArc.theta,
        omegaArc: atArc.omega,
        thetaEnd: atArc.theta + atArc.omega * w + 0.5 * arc.alpha * w * w,
        omegaEnd: atArc.omega + arc.alpha * w,
        pivotHand: atHands.P,
        pivotVelocityHand: atHands.V,
        pivotEnd: add(add(atHands.P, scale(atHands.V, wh)), scale(arc.pivotAcceleration, 0.5 * wh * wh)),
        pivotVelocityEnd: add(atHands.V, scale(arc.pivotAcceleration, wh)),
        dipAccel: (4 * arc.dip.depth) / (arc.dip.duration * arc.dip.duration),
        reach: null,
        push: null,
        free: null,
        held: null,
        body,
        released: carryBody(head, hands.chain, arc.radius, null),
        headWeight: head.mass * gravity,
        shaftWeight: head.shaft.mass * gravity,
        shaftRise: head.socket.z + head.shaft.length / 2,
        gravity,
        firm: handGains(coupling, 1, body),
        top: handGains(coupling, hands.gripTension, body),
        bottom: handGains(coupling, hands.bottomGrip, body),
    };
    // Hands that reach forward push through, at the plan's pace plus any advance's (P2b.2b.2c.3a A2 item 8); a push of
    // length 0 is none, and the planned pivot rests along aim from contact.
    const reached: PreparedTrack =
        arc.handReach > 0 ? { ...plain, push: computePush(plain) } : { ...plain, reach: restingReach(plain) };
    // A fully held slope (λ = 1) has no free pendulum to tabulate (P2b.2b.2c.3a design §4.1).
    if (!(arc.slopeHold < 1)) {
        return reached;
    }
    // Gravity acts through the pulse (P2b.2b.2c.2d design §3.1), so the window's end is the table's, not the box's.
    const free = computeFree(reached, head, gravity, !withFree);
    const end = tableAt(free, arc.arcStart + w);
    return { ...reached, free, thetaEnd: end.theta, omegaEnd: end.omega };
}

/**
 * A test-only seam (P2b.2b.2b.2c design §9; plan decision 7): `track` with its grips' twist gains as for a swung body
 * of twist inertia `inertiaZ` (kg·m²) about the shaft, every other gain and the body unchanged, so that the head's
 * inertia and the hands' stiffer twist are read apart. The engine never calls it.
 */
export function holdTwist(track: PreparedTrack, inertiaZ: number): PreparedTrack {
    const I = track.body.inertia;
    const body = { ...track.body, inertia: vec3(I.x, I.y, inertiaZ) };
    const { coupling, hands } = track;
    return {
        ...track,
        firm: handGains(coupling, 1, body),
        top: handGains(coupling, hands.gripTension, body),
        bottom: handGains(coupling, hands.bottomGrip, body),
    };
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
    /** The pendulum's θ (rad) at this instant. */
    readonly theta: number;
}

/**
 * The free pendulum's table, tabulated wherever λ < 1; past the window (`past`), throws if prepareTrack tabulated it
 * through the pulse only, rather than read a table that is not there.
 */
function freeOf(track: PreparedTrack, past: boolean): FreePendulum {
    const { free } = track;
    if (free === null || (past && free.pulseOnly)) {
        throw new Error(
            "the free pendulum's table was read past the window's end, but prepareTrack tabulated it through the " +
                "pulse only (withFree false) or not at all (a fully held slope)",
        );
    }
    return free;
}

/**
 * The pendulum's θ, ω and α at time t (design §3.2; P2b.2b.2c.3a design §4.1): from the window's start the free
 * pendulum at λ = 0, the kinematic pulse and hold at λ = 1, and between them θ = (1 − λ)·θ_free + λ·θ_held, ω and α
 * likewise. A stop's hold (holdPendulum) holds the whole pendulum at any λ, past the window and from its start on.
 */
function pendulumAt(track: PreparedTrack, t: number): Swing {
    const { arc, held } = track;
    if (t <= arc.arcStart) {
        return beforeWindow(arc, t);
    }
    const tw = arc.arcStart + arc.window;
    if (held !== null && t > tw && t >= held.from) {
        return { theta: held.theta, omega: 0, alpha: 0 };
    }
    const lambda = arc.slopeHold;
    if (lambda === 0) {
        return freePath(track, t, tw);
    }
    if (lambda === 1) {
        return heldPath(track, t, tw, track.thetaEnd, track.omegaEnd);
    }
    const free = freePath(track, t, tw);
    // The held part runs from the box's end state, as it does alone, not from the free table's.
    const w = arc.window;
    const thetaEnd = track.thetaArc + track.omegaArc * w + 0.5 * arc.alpha * w * w;
    const kinematic = heldPath(track, t, tw, thetaEnd, track.omegaArc + arc.alpha * w);
    const keep = 1 - lambda;
    return {
        theta: keep * free.theta + lambda * kinematic.theta,
        omega: keep * free.omega + lambda * kinematic.omega,
        alpha: keep * free.alpha + lambda * kinematic.alpha,
    };
}

/** The free pendulum at time t, after the window's start; `tw` is the window's end. */
function freePath(track: PreparedTrack, t: number, tw: number): Swing {
    const { arc } = track;
    // Gravity acts through the pulse (P2b.2b.2c.2d design §3.1): the table, from the window's start, its α the free
    // pendulum's plus the pulse's within the window.
    const free = freeOf(track, t > tw);
    const { theta, omega } = tableAt(free, t);
    const a = freeAlpha(track, free, theta, t);
    return { theta, omega, alpha: arc.alpha !== 0 && t < tw ? a + pulseAlpha(arc, t) : a };
}

/**
 * The held slope's kinematic pendulum at time t, after the window's start: its pulse, then the hold from θ and ω at
 * the window's end, `thetaEnd` and `omegaEnd`; `tw` is the window's end.
 */
function heldPath(track: PreparedTrack, t: number, tw: number, thetaEnd: number, omegaEnd: number): Swing {
    const { arc } = track;
    if (t <= tw) {
        // The held arc is kinematic, gravity never in its plan: the minimum-jerk pulse alone (P2b.2b.2c.2d design
        // §3.1), α = 6·ᾱ·s(1 − s), s = τ/T, so ω and θ end where the box's constant ᾱ would put them. s is clamped to 1
        // so that every factor of ᾱ stays non-negative: at ᾱ = ±0 each term is then the box's signed zero, and the path
        // is the box's to the bit.
        const T = arc.window;
        const tau = t - arc.arcStart;
        const s = Math.min(tau / T, 1);
        return {
            theta: track.thetaArc + track.omegaArc * tau + arc.alpha * T * T * (s * s * s * (1 - 0.5 * s)),
            omega: track.omegaArc + arc.alpha * T * (s * s * (3 - 2 * s)),
            alpha: 6 * arc.alpha * (s * (1 - s)),
        };
    }
    // The slope is held: over one more window W the rate falls from ω_e to rest, then θ holds. Its α runs on from the
    // pulse's end, α = 0, with no step (gate round 5 ruling, 2026-10-12; P2b.2b.2c.2d design §3.1): with x = u/W, ω is
    // the cubic with ω(0) = ω_e, ω′(0) = 0, ω(W) = ω′(W) = 0, whose travel ∫ω = ω_e·W/2 is the linear fall's, so the
    // seams' times, θ and ω there are the linear fall's:
    // ω = ω_e·(1 − 3x² + 2x³), α = 6·ω_e/W·(x² − x), θ = θ_e + W·ω_e·(x − x³ + x⁴/2).
    const W = arc.holdWindow ?? arc.window;
    const u = Math.min(t - tw, W);
    const x = u / W;
    const we = omegaEnd;
    const fall = x * (1 + x * x * (x * 0.5 - 1));
    return {
        theta: thetaEnd + W * (we * fall),
        omega: we * (1 + x * x * (2 * x - 3)),
        alpha: u < W ? ((6 * we) / W) * x * (x - 1) : 0,
    };
}

/**
 * `track` with its pendulum held from time `from` (s, at or after the pendulum's window) on, at any λ: θ fixed at its
 * value there, ω = α = 0. A stop's follow-through (P2b.2b.2a design §4.2), a user decision (2026-10-07): after the
 * check the mallet stays still relative to the hands, as Riches has the stop, "NO FOLLOW-THROUGH at all, or as little
 * as possible", rather than the free pendulum swinging back. Before `from` it reads as `track`. On a fully held slope
 * (λ = 1) θ is the held path's (P2b.2b.2c.3a A2 item 7).
 */
export function holdPendulum(track: PreparedTrack, from: number): PreparedTrack {
    const { theta } = pendulumAt(track, from);
    return { ...track, held: { from, theta } };
}

/**
 * The path at time t (design §3.2): the pendulum's θ, ω and α, and the pivot with the reach and the dip, carried to
 * the socket and the head's orientation. Evaluates sinCos(θ) and sinCos(θ/2) (on a free table from the window's start,
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
        theta,
    };
}

/** The top hand's planned place and velocity at time t (design §3.2): the pivot with the reach and the dip. */
export function handsAt(track: PreparedTrack, t: number): { readonly position: Vec3; readonly velocity: Vec3 } {
    const pivot = pivotAt(track, t);
    const dip = dipAt(track, t);
    return { position: sub(pivot.P, vec3(0, 0, dip.z)), velocity: sub(pivot.V, vec3(0, 0, dip.v)) };
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

/**
 * The share of a check's planned deceleration the hands apply to a head pitching at `rate` (rad/s) about n, the path
 * at `planned` (design §3.3): all of it at or above the path's rate, none at or below rest, and rate/planned between
 * them. A head the strike has slowed then keeps its fraction of the path's rate, so it comes to rest when the path
 * does (a full check's window's end) and never passes rest. The same holds for a brake begun before contact, whose
 * window can outlast the path's rest: once the path's rate is negative (past rest) a head still moving forward gets
 * share 1, and a head at rest or moving back gets 0, so the hands never drive it past rest. Before the grips relax
 * at the planned contact they are firm and follow the path, as the player's planned brake does.
 */
function checkShare(rate: number, planned: number): number {
    if (rate <= 0) {
        return 0;
    }
    if (rate >= planned) {
        return 1;
    }
    return rate / planned;
}

/**
 * Where the flex took hold (P2b.2b.2b.2b design §4.1): the top and bottom grips there, the planned pivot and
 * the planned pitch θ there, and the shaft's actual pitch. The intended path runs from the actual grips.
 */
export interface FlexStart {
    readonly top: Vec3;
    readonly bottom: Vec3;
    readonly pivot: Vec3;
    readonly theta: number;
    readonly pitch: number;
}

/**
 * One integrate run's grip state (design §3.3): the shaft's arc angle at relaxAt, and when the bottom hand opened (at
 * the earlier of the forward reach and the pendulum phase's start; P2b.2b.2c.3a A2 item 6) and the shaft's turn since
 * relaxAt then. Also where the flex took hold, each hand's last stiffness (N/m; the bottom hand's 0 once it has let
 * go), whether the shaft has passed vertical once the bottom hand has opened (it is then off the mallet) and whether
 * the head has pitched forward since (the next apex is a carry's finish; P2b.2b.2b.2b design §4.2, §4.3), and the
 * hands' sensed resistance R̃ (N): the balls' resistance R = max(0, −aim·F_balls), F_balls their total force on the
 * head, followed through a first-order lag (senseResistance), which the integrator updates with a push after each
 * step's contacts and the push intent reads (gate ruling 2026-10-11 and its amendment). From where the flex takes
 * hold, each hand's hand–arm chain (gate round 3 ruling, 2026-10-11): null before then, the bottom hand's null once it
 * has let go, and both null from a stop's hold. With a push also when a ball first departed from the face (s; gate
 * round 13 ruling, "Relax from first departure", 2026-10-12), which the integrator latches once, null until then; the
 * arms' hold relaxes from it (holdWeight). Each hand's slid offset (m, in the head's frame; P2b.2b.2b.3 design §5):
 * null until the hand first saturates, then how far its anchor on the shaft has slid; it persists through the flex
 * and, under the limit, relaxes on the firm grip at the arm's rate (P2b.2b.2c.2 design §4.1).
 * Mutable; handLoad updates it, and the integrator moves the chains' masses each step (advanceChains).
 */
export interface GripState {
    contactPitch: number | null;
    releasedAt: number | null;
    releaseDelta: number;
    flex: FlexStart | null;
    topStiffness: number;
    bottomStiffness: number;
    vertical: boolean;
    rising: boolean;
    resistance: number;
    topChain: ArmChain | null;
    bottomChain: ArmChain | null;
    departedAt: number | null;
    topOffset: Vec3 | null;
    bottomOffset: Vec3 | null;
}

/**
 * A grip state for a new run: no contact yet, the bottom hand closed, no flex, no resistance, no chains, no departure.
 */
export function newGripState(): GripState {
    return {
        contactPitch: null,
        releasedAt: null,
        releaseDelta: 0,
        flex: null,
        topStiffness: 0,
        bottomStiffness: 0,
        vertical: false,
        rising: false,
        resistance: 0,
        topChain: null,
        bottomChain: null,
        departedAt: null,
        topOffset: null,
        bottomOffset: null,
    };
}

/**
 * The swung body `track` steps with `grip`: the released body once the bottom hand has let go. handLoad sets
 * releasedAt before it chooses its own body by this, in the step the hand opens, so the integrator's advance and
 * handLoad agree at every step, whichever cause opened it (P2b.2b.2c.3a A2 item 6).
 */
export function swungOf(track: PreparedTrack, grip: GripState): SwungBody {
    return grip.releasedAt !== null ? track.released : track.body;
}

/** A chain mass's position and velocity (world frame). */
export interface ChainMassState {
    readonly position: Vec3;
    readonly velocity: Vec3;
}

/** One point mass of a hand–arm chain: its position, its velocity and the net force (N) on it from handLoad. */
export interface ChainMass {
    position: Vec3;
    velocity: Vec3;
    force: Vec3;
}

/**
 * One hand's hand–arm chain (gate round 3 ruling, 2026-10-11), Dong et al. 2013's x_h 5-DOF model:
 * - `forearm` is the model's M0, the wrist and forearm, which the arm's flex drives in the model's K0, C0's place;
 * - `hand` is M1, the palm–hand dorsum, joined to M0 by K1, C1 and to the grip by the palm's K3, C3;
 * - `fingers` is M2, joined to M1 by K2, C2 and to the grip by the fingers' K4, C4;
 * - the skin on the handle, M3 and M4, rides rigidly at the grip in the swung body (carryBody).
 * `preload` is where M0 started less the grip there (m): the flex's intended point for M0 sits off the grip's by it.
 * Mutable.
 */
export interface ArmChain {
    readonly forearm: ChainMass;
    readonly hand: ChainMass;
    readonly fingers: ChainMass;
    readonly preload: Vec3;
}

/** A hand–arm chain's masses and preload as the probe records them. */
export interface ArmChainState {
    readonly forearm: ChainMassState;
    readonly hand: ChainMassState;
    readonly fingers: ChainMassState;
    readonly preload: Vec3;
}

/** The force (N) on a body at `a` moving at `u` from a spring k and damper c to one at `b` moving at `v`. */
function element(k: number, c: number, a: Vec3, u: Vec3, b: Vec3, v: Vec3): Vec3 {
    return add(scale(sub(b, a), k), scale(sub(v, u), c));
}

/**
 * One chain's forces in a step (gate round 3 ruling, 2026-10-11), `drive` (N) the arm's flex on the forearm M0 and
 * `gravity` g: sets each mass's net force, its elements', the drive's and its weight, for advanceChains, and returns
 * the chain's force on the mallet at the grip `at`, moving at `velocity`: the palm's (K3, C3) and the fingers'
 * (K4, C4), less the weight of the skin on the handle (M3 + M4), which the hand carries.
 */
export function chainForces(
    chain: HandChain,
    arm: ArmChain,
    at: Vec3,
    velocity: Vec3,
    drive: Vec3,
    gravity: number,
): Vec3 {
    const { forearm, hand, fingers } = arm;
    const wrist = element(
        chain.wristStiffness,
        chain.wristDamping,
        forearm.position,
        forearm.velocity,
        hand.position,
        hand.velocity,
    );
    const knuckle = element(
        chain.knuckleStiffness,
        chain.knuckleDamping,
        hand.position,
        hand.velocity,
        fingers.position,
        fingers.velocity,
    );
    const palm = element(chain.palmStiffness, chain.palmDamping, hand.position, hand.velocity, at, velocity);
    const finger = element(
        chain.fingerStiffness,
        chain.fingerDamping,
        fingers.position,
        fingers.velocity,
        at,
        velocity,
    );
    forearm.force = sub(add(drive, wrist), vec3(0, 0, chain.forearmMass * gravity));
    hand.force = sub(sub(add(palm, knuckle), wrist), vec3(0, 0, chain.handMass * gravity));
    fingers.force = sub(sub(finger, knuckle), vec3(0, 0, chain.fingerMass * gravity));
    const skin = (chain.palmSkinMass + chain.fingerSkinMass) * gravity;
    return sub(sub(vec3(0, 0, 0 - skin), palm), finger);
}

/**
 * Moves each chain of `grip` by one semi-implicit Euler step of `dt` (s) under its forces from the last handLoad:
 * every mass's velocity u ← u + F/m·dt, then its position y ← y + u·dt, as the integrator moves the head.
 */
export function advanceChains(grip: GripState, chain: HandChain, dt: number): void {
    for (const arm of [grip.topChain, grip.bottomChain]) {
        if (arm === null) {
            continue;
        }
        for (const [body, mass] of [
            [arm.forearm, chain.forearmMass],
            [arm.hand, chain.handMass],
            [arm.fingers, chain.fingerMass],
        ] as const) {
            body.velocity = add(body.velocity, scale(body.force, dt / mass));
            body.position = add(body.position, scale(body.velocity, dt));
        }
    }
}

/** The arm's feed-forward on a chain (N): `share` of F_ff plus the chain's own m·a (M0–M2) and weight (M0–M4). */
function chainFed(chain: HandChain, share: Vec3, acceleration: Vec3, gravity: number): Vec3 {
    const moving = chain.forearmMass + chain.handMass + chain.fingerMass;
    const all = moving + chain.palmSkinMass + chain.fingerSkinMass;
    return add(add(share, scale(acceleration, moving)), vec3(0, 0, all * gravity));
}

/**
 * A chain taking hold of a grip at `at` moving at `velocity`, which accelerates at `acceleration` on the path: every
 * mass moves with the grip, each placed where the chain is in equilibrium as its arm feeds it (chainFed) with `share`
 * (N), so that the mallet feels exactly `share` from the first step. With u_i = y_i − x_g the static balance is
 * K·u = b, K = [[k₁, −k₁, 0], [−k₁, k₁ + k₂ + k₃, −k₂], [0, −k₂, k₂ + k₄]], b = (F_arm − m₀A, −m₁A, −m₂A), A = a + g·ẑ,
 * solved by elimination.
 */
function holdChain(
    chain: HandChain,
    at: Vec3,
    velocity: Vec3,
    share: Vec3,
    acceleration: Vec3,
    gravity: number,
): ArmChain {
    const k1 = chain.wristStiffness;
    const k2 = chain.knuckleStiffness;
    const k3 = chain.palmStiffness;
    const k4 = chain.fingerStiffness;
    const A = add(acceleration, vec3(0, 0, gravity));
    const b0 = sub(chainFed(chain, share, acceleration, gravity), scale(A, chain.forearmMass));
    const b1 = scale(A, 0 - chain.handMass);
    const b2 = scale(A, 0 - chain.fingerMass);
    const d2 = k2 + k4;
    const u1 = scale(add(add(b0, b1), scale(b2, k2 / d2)), 1 / (k2 + k3 - (k2 * k2) / d2));
    const u2 = scale(add(b2, scale(u1, k2)), 1 / d2);
    const u0 = add(u1, scale(b0, 1 / k1));
    const mass = (u: Vec3): ChainMass => ({ position: add(at, u), velocity, force: ZERO });
    // The preload is frozen here, in the world frame: it does not turn with the shaft or follow later shares. That is
    // acceptable because the feed-forward carries each step's share itself; a share changed by ΔF moves the chain's
    // static offset by about ΔF/k₁, so the stale preload costs the flex k·ΔF/k₁, at most about 4 % of ΔF (k ≤ 400 N/m
    // against the wrist's 9988 N/m), and the shaft's turn over the push moves its millimetres by less still.
    return { forearm: mass(u0), hand: mass(u1), fingers: mass(u2), preload: u0 };
}

/**
 * The share of the gap between the balls' resistance and the hands' sensed resistance that one step of `dt` (s)
 * closes (gate ruling amendment, 2026-10-11): 1 − exp(−dt/τ_push), the muscles' first-order force rise.
 */
export function pushResponse(hands: Hands, dt: number): number {
    return 1 - exp(0 - dt / hands.pushResponseTime);
}

/** The hands' sensed resistance R̃ (N) after one step: `sensed` moved towards the balls' `resistance` by `response`. */
export function senseResistance(sensed: number, resistance: number, response: number): number {
    return sensed + (resistance - sensed) * response;
}

/** True from the push's pendulum phase's start at time t (P2b.2b.2b.2b design §4.2); never without a push. */
function releasing(track: PreparedTrack, t: number): boolean {
    const { push } = track;
    return push !== null && push.pendulum !== null && t >= push.pendulum;
}

/**
 * The weight in [0, 1] with which a push's arms hold their posture at time t (gate round 11 ruling, "Posture
 * holding in the push", 2026-10-12): 1 until a ball first departs from the face at t_d (grip.departedAt; gate round 13
 * ruling, "Relax from first departure"), then exp(−(t − t_d)/τ_push), the arms relaxing to their rhythmic flex at the
 * muscles' pace (the same first-order force rise as the push intent's). The flex takes hold at contact with no offset
 * and no lag, so its force does not depend on k there, and the weight is continuous at t_d, so the hands' flex force
 * never steps. With no departure, a stroke that strikes no ball, the arms hold at k_hold to the end, the pendulum
 * phase and the follow-through included.
 */
function holdWeight(track: PreparedTrack, t: number, grip: GripState): number {
    const departed = grip.departedAt;
    if (departed === null || t < departed) {
        return 1;
    }
    return exp(0 - (t - departed) / track.hands.pushResponseTime);
}

/**
 * The push intent at time t (gate ruling 2026-10-11 and its amendment): through the push, until the pendulum
 * phase starts, the hands push along aim with the balls' resistance as they sense it (R̃, lagged at the muscles'
 * pace), up to the arm's push: P = min(R̃, F_push)·aim. Null where it is nil: no resistance, or in the pendulum phase.
 */
function pushIntent(track: PreparedTrack, t: number, grip: GripState): Vec3 | null {
    const push = track.push as Push;
    if (!(grip.resistance > 0) || (push.pendulum !== null && t >= push.pendulum)) {
        return null;
    }
    return scale(track.arc.aim, Math.min(grip.resistance, track.hands.pushForce));
}

/** The hands' load in one step (design §3.3, §3.7), world frame. */
export interface HandLoad {
    /** F: both hands' forces. */
    readonly force: Vec3;
    /** F's feed-forward parts. */
    readonly feedForward: Vec3;
    /** About the head's centre: each hand's force's moment at its grip, and the bottom hand's couple. */
    readonly torque: Vec3;
    /** Each hand's force. */
    readonly top: Vec3;
    readonly bottom: Vec3;
    /** The first hand whose force reached the grip's limit in this step, the top if both did; null if neither. */
    readonly saturated: HandName | null;
    /**
     * The push intent P in this step (pushIntent), already within `feedForward`; absent where it is nil. For
     * the impact's probe only: nothing in the engine reads it.
     */
    readonly intent?: Vec3;
}

/** θ_err = 2·sign(w)·vec(target ⊗ q̄), w the product's scalar part: the rotation taking q to `target` (world frame). */
function rotationError(target: Quaternion, q: Quaternion): Vec3 {
    const e = multiply(target, { w: q.w, x: 0 - q.x, y: 0 - q.y, z: 0 - q.z });
    const k = e.w < 0 ? -2 : 2;
    return vec3(k * e.x, k * e.y, k * e.z);
}

/** π(s) = atan2(−s·aim, s·ẑ): the arc angle of a shaft along `s`. */
function shaftPitch(s: Vec3, aim: Vec3): number {
    return atan2(0 - dot(s, aim), s.z);
}

/** The part of `v` perpendicular to the unit `s`. */
function across(v: Vec3, s: Vec3): Vec3 {
    return sub(v, scale(s, dot(v, s)));
}

/** e: perpendicular to the shaft `s` in the swing plane, forward; 0 where the shaft lies along the aim. */
function forwardOf(aim: Vec3, s: Vec3): Vec3 {
    const raw = across(aim, s);
    const rawSquared = dot(raw, raw);
    return rawSquared > FORWARD_UNDEFINED ? scale(raw, 1 / Math.sqrt(rawSquared)) : ZERO;
}

/**
 * `trial` held to the grip's limit F_max (P2b.2b.2b.3 design §5): null while |trial| ≤ F_max, so that a hand below
 * the limit keeps its arithmetic; otherwise `trial` scaled onto F_max.
 */
function heldTo(trial: Vec3, limit: number): Vec3 | null {
    const squared = dot(trial, trial);
    if (!(squared > limit * limit)) {
        return null;
    }
    return scale(trial, limit / Math.sqrt(squared));
}

/**
 * A hand's offset (m, in the head's frame; plan decision 10) after its anchor slides by `slide` (m, world frame) with
 * the head at orientation `q` (design §5): the first slide, or the sum.
 */
function slid(offset: Vec3 | null, slide: Vec3, q: Quaternion): Vec3 {
    const body = rotateInverse(q, slide);
    return offset === null ? body : add(offset, body);
}

/** What carryLoad needs from handLoad's step: the feed-forward's shares, the shaft and the grips' arms. */
interface CarryStep {
    /** The top hand's share without the dip, the dip's F_d, the bottom hand's share, and the whole F_ff (N). */
    readonly top: Vec3;
    readonly dip: Vec3;
    readonly bottom: Vec3;
    readonly whole: Vec3;
    /** True inside a check (inCheck), where the bottom hand flexes in full whatever its guideEffort. */
    readonly checking: boolean;
    /** The feed-forward's twist about the shaft (N·m). */
    readonly twist: number;
    /** The shaft's pitch (rad) and its pitch rate about n (rad/s). */
    readonly pitch: number;
    readonly rate: number;
    readonly topArm: Vec3;
    readonly bottomArm: Vec3;
    readonly spinLag: Vec3;
    /** The shaft's axis. */
    readonly s: Vec3;
    /** The top and bottom grips' accelerations on the path (m/s²), which the chains' feed-forward carries. */
    readonly topAcceleration: Vec3;
    readonly bottomAcceleration: Vec3;
}

/**
 * Every stroke's hands from contact (P2b.2b.2b.2b design §3.1, §4; P2b.2b.2c.3a A2 item 5): each hand's feed-forward
 * plus its flex to its point on the intended path. The path runs from the actual grips where the flex took hold
 * (`grip.flex`), moved by the planned pivot since then; the bottom grip also turns with the planned pitch. Each grip
 * scales its hand: the top hand feeds γ_T times its share plus the dip's F_d, the bottom hand g_B times its share, and
 * each hand's flex gains are k·γ and c·√γ (gripGains), the bottom hand's at g_B·guideEffort outside a check and g_B
 * inside one. Once the bottom hand has opened (handLoad) the top hand alone feeds γ_T times the whole F_ff and flexes,
 * and the bottom hand pushes forward along e with pendulumEffort·pendulumForce until the shaft passes vertical, then
 * is off the mallet; no twist acts. Each holding hand's flex drives its hand–arm chain's forearm, not the grip, and the
 * chain holds the grip through the palm and the fingers (chainForces; gate round 3 ruling, 2026-10-11); the bottom
 * hand's chain leaves with it. Through a push each arm holds its posture: its flex takes the arm's posture-holding
 * impedance, relaxing to the rhythmic flex from a ball's first departure from the face (holdWeight; gate rounds 11
 * and 13, "Posture holding in the push" and "Relax from first departure", 2026-10-12); with no push the flex is the
 * rhythmic one throughout. Updates `grip`: where the flex took hold, the chains, the hands' stiffnesses, and the
 * vertical and rising latches.
 */
function carryLoad(
    track: PreparedTrack,
    state: HeadState,
    t: number,
    grip: GripState,
    path: PathPoint,
    step: CarryStep,
): HandLoad {
    const { arc, hands } = track;
    const planned = handsAt(track, t);
    const topAt = add(state.position, step.topArm);
    const bottomAt = add(state.position, step.bottomArm);
    if (grip.flex === null) {
        grip.flex = { top: topAt, bottom: bottomAt, pivot: planned.position, theta: path.theta, pitch: step.pitch };
    }
    const from = grip.flex;
    const moved = sub(planned.position, from.pivot);
    const topVelocity = add(state.velocity, cross(state.angularVelocity, step.topArm));
    const load = (top: Vec3, bottom: Vec3, twist: number, fed: Vec3, saturated: HandName | null): HandLoad => ({
        force: add(top, bottom),
        feedForward: fed,
        torque: add(add(cross(step.topArm, top), cross(step.bottomArm, bottom)), scale(step.s, twist)),
        top,
        bottom,
        saturated,
    });
    const opened = grip.releasedAt !== null;
    // Each hand's grip scales its feed (A2 item 4): a multiplier, so the rolls' grips of 1 keep their bits.
    const topGrip = hands.gripTension;
    const topFed = opened ? scale(step.whole, topGrip) : add(scale(step.top, topGrip), step.dip);
    const bottomFed = scale(step.bottom, hands.bottomGrip);
    const { chain, flex } = hands;
    const g = track.gravity;
    const bottomVelocity = add(state.velocity, cross(state.angularVelocity, step.bottomArm));
    // Each hand's anchor on the shaft, slid by its offset once it has saturated (design §5), the offset held in the
    // head's frame (plan decision 10).
    const q = state.orientation;
    const topAnchor = grip.topOffset === null ? topAt : add(topAt, rotate(q, grip.topOffset));
    const bottomAnchor = grip.bottomOffset === null ? bottomAt : add(bottomAt, rotate(q, grip.bottomOffset));
    if (grip.topChain === null) {
        grip.topChain = holdChain(chain, topAnchor, topVelocity, topFed, step.topAcceleration, g);
        if (!opened) {
            grip.bottomChain = holdChain(chain, bottomAnchor, bottomVelocity, bottomFed, step.bottomAcceleration, g);
        }
    }
    // Each arm's flex drives its chain's forearm, feeding it its share and the chain's own m·a and weight in full, so
    // a loose hand does not hang on the mallet; its stiffness follows that whole feed-forward, scaled by its grip.
    // Through a push the arms hold their posture (holdWeight); with none the weight is 0, the rhythmic flex.
    const hold = track.push === null ? 0 : holdWeight(track, t, grip);
    const topArm = grip.topChain;
    const topArmFed = chainFed(chain, topFed, step.topAcceleration, g);
    const topGains = gripGains(flexGains(flex, length(topArmFed), hold), topGrip);
    grip.topStiffness = topGains.stiffness;
    const topDrive = flexForce(
        topArmFed,
        topGains,
        sub(topArm.forearm.position, add(add(from.top, moved), topArm.preload)),
        sub(topArm.forearm.velocity, planned.velocity),
    );
    const limit = hands.gripLimit;
    const spring = chain.palmStiffness + chain.fingerStiffness;
    let saturated: HandName | null = null;
    let top = chainForces(chain, topArm, topAnchor, topVelocity, topDrive, g);
    const topHeld = heldTo(top, limit);
    if (topHeld !== null) {
        // The hand transmits only F_max: its hold slides until the palm and fingers carry exactly that, and the
        // chain feels what the hand transmits (design §5). The force falls by the palm's and fingers' stiffness times
        // the slide (plan decision 24: the slip lies at the skin, in series with the palm's and fingers' elements).
        grip.topOffset = slid(grip.topOffset, scale(sub(top, topHeld), 1 / spring), q);
        // chainForces is linear in the anchor, so this lands on F_max to rounding (gripLimit.test bounds it at 1e-9);
        // it is not re-clipped.
        top = chainForces(chain, topArm, add(topAt, rotate(q, grip.topOffset)), topVelocity, topDrive, g);
        saturated = "top";
    }
    if (!opened) {
        // The bottom grip's intended point turns with the planned pitch about the intended top grip:
        // x̂_B = x_B(0) + ΔP + (r − b)·(radial(θ̂) − radial(θ̂₀)), θ̂ = pitch₀ + θ − θ₀.
        const lever = arc.radius - hands.bottom;
        const [si, ci] = sinCos(from.pitch + (path.theta - from.theta));
        const [s0, c0] = sinCos(from.pitch);
        const radial = sub(scale(arc.aim, si), scale(UP, ci));
        const radialFrom = sub(scale(arc.aim, s0), scale(UP, c0));
        const tangent = add(scale(arc.aim, ci), scale(UP, si));
        const bottomTarget = add(add(from.bottom, moved), scale(sub(radial, radialFrom), lever));
        const turning = lever * dot(path.angularVelocity, track.axis);
        const bottomTargetVelocity = add(planned.velocity, scale(tangent, turning));
        const bottomArm = grip.bottomChain as ArmChain;
        const bottomArmFed = chainFed(chain, bottomFed, step.bottomAcceleration, g);
        // The player's effort on the bottom hand's guide (design §3.3) scales its flex outside a check; a check
        // brakes in full (A2 item 5).
        const effort = step.checking ? 1 : hands.guideEffort;
        const bottomGains = gripGains(flexGains(flex, length(bottomArmFed), hold), hands.bottomGrip * effort);
        grip.bottomStiffness = bottomGains.stiffness;
        const bottomDrive = flexForce(
            bottomArmFed,
            bottomGains,
            sub(bottomArm.forearm.position, add(bottomTarget, bottomArm.preload)),
            sub(bottomArm.forearm.velocity, bottomTargetVelocity),
        );
        let bottom = chainForces(chain, bottomArm, bottomAnchor, bottomVelocity, bottomDrive, g);
        const bottomHeld = heldTo(bottom, limit);
        if (bottomHeld !== null) {
            grip.bottomOffset = slid(grip.bottomOffset, scale(sub(bottom, bottomHeld), 1 / spring), q);
            const anchor = add(bottomAt, rotate(q, grip.bottomOffset));
            // On F_max to rounding, as the top hand's; not re-clipped.
            bottom = chainForces(chain, bottomArm, anchor, bottomVelocity, bottomDrive, g);
            saturated = saturated ?? "bottom";
        }
        const twist = hands.bottomGrip * step.twist + track.bottom.twistDamping * dot(step.spinLag, step.s);
        return load(top, bottom, twist, add(topFed, bottomFed), saturated);
    }
    grip.bottomStiffness = 0;
    grip.bottomChain = null;
    if (step.rate > 0) {
        grip.rising = true;
    }
    if (step.pitch >= 0) {
        grip.vertical = true;
    }
    const pushed = grip.vertical ? ZERO : scale(forwardOf(arc.aim, step.s), arc.pendulumEffort * hands.pendulumForce);
    const pushedHeld = heldTo(pushed, limit);
    return load(top, pushedHeld ?? pushed, 0, topFed, pushedHeld === null ? saturated : (saturated ?? "bottom"));
}

/**
 * Opens `grip`'s bottom hand for good at time t, once, at the earlier of the forward reach and a push's pendulum phase
 * (P2b.2b.2c.3a A2 item 6), recording when and the shaft's turn since relaxAt; returns the shaft's pitch π(s) for the
 * shaft `s`. The reach is signed, the shaft turned forward through the slack, (r − b)·(π − π_c) > reachSlack: a shaft
 * turning back drives into the bottom hand's palm and never opens it.
 */
function openBottom(track: PreparedTrack, grip: GripState, s: Vec3, t: number): number {
    const { arc, hands } = track;
    const pitch = shaftPitch(s, arc.aim);
    const contactPitch = grip.contactPitch ?? pitch;
    grip.contactPitch = contactPitch;
    if (grip.releasedAt === null) {
        const reached = (arc.radius - hands.bottom) * (pitch - contactPitch) > hands.reachSlack;
        if (reached || releasing(track, t)) {
            grip.releasedAt = t;
            grip.releaseDelta = pitch - contactPitch;
        }
    }
    return pitch;
}

/**
 * The hands' load on the head in `state` at time t (design §3.3), updating `grip`. The feed-forward is the wrench
 * that makes the path's rigid motion exact for the swung body: F_ff = M·a_c + m·g·ẑ + m_s·g·ẑ and, about its centre,
 * τ_ff = I'·α_path + ω_path × (I'·ω_path) + r_h × m·g·ẑ + r_s × m_s·g·ẑ, r_s the shaft's centre from the swung body's
 * (P2b.2b.2b.2c design §4.3). From relaxAt the dip's part F_d = M·a_d is set aside and
 * the rest, F_s, split over the hands so that their moments give τ_ff: the top hand F_∥ + F_T⊥, the bottom hand F_B
 * and the couple τ_ff·s. Before relaxAt both hands grip firmly with springs and dampers; on a downswing, dampers and
 * feed-forward only, with no position spring (P2b.2b.2a user decision 2026-10-07). From it, on every stroke, both
 * hands flex through their hand–arm chains, each scaled by its grip (carryLoad; P2b.2b.2b.2b design §3, §4; gate
 * round 3 ruling; P2b.2b.2c.3a A2 item 5). The bottom hand opens at the earlier of the forward reach, the shaft turned
 * forward through the reach slack since relaxAt, and a push's pendulum phase (A2 item 6); the swung body then loses its
 * skin (swungOf). Through a push F_ff gains the push intent before it is shared (pushIntent; gate ruling 2026-10-11).
 * A check brakes the head to rest, not past it: the hands apply the head's share of the planned deceleration
 * (checkShare). With `gripped`, the hands grip firmly with springs and dampers at any t, as before relaxAt but with no
 * downswing gate, and the chains let go: a stop's follow-through (P2b.2b.2a design §4.2; A2 item 7). Each hand's force
 * is held to the grip's limit F_max (P2b.2b.2b.3 design §5): a position spring's anchor slides at it, by an offset
 * kept in `grip` in the head's frame; a damper alone is capped. Under its limit on the firm grip a slid anchor returns
 * towards the hands' planned path at the arm's rate τ_arm = c_hold/k_hold, over the step `dt` (P2b.2b.2c.2 design
 * §4.1), the force reaching the head only through the grip.
 */
export function handLoad(
    track: PreparedTrack,
    state: HeadState,
    head: MalletHead,
    t: number,
    grip: GripState,
    dt: number,
    gripped = false,
): HandLoad {
    const { arc, hands } = track;
    const path = pathAt(track, t);
    const w = path.angularVelocity;
    const q = state.orientation;
    const s = rotate(q, UP);
    const rho = head.socket.z;
    const contact = !gripped && t >= track.coupling.relaxAt;
    // The bottom hand opens before the body is chosen, so this step and the integrator's advance agree (swungOf). The
    // shaft's pitch is read only after contact.
    const pitchNow = contact ? openBottom(track, grip, s, t) : 0;
    const body = swungOf(track, grip);
    // A check after contact brakes the head to rest, not past it: the pitch rates about n.
    const checking = contact && inCheck(track, t);
    const rate = dot(state.angularVelocity, track.axis);
    const planned = dot(w, track.axis);
    const share = checking ? checkShare(rate, planned) : 1;
    let socketAcceleration = path.socketAcceleration;
    let angularAcceleration = path.angularAcceleration;
    if (share < 1) {
        // The planned deceleration's parts, r·α along the path's tangent at the socket and α_path, scaled.
        const shed = (1 - share) * arc.radius * path.pendulumAcceleration;
        socketAcceleration = sub(socketAcceleration, scale(rotate(path.orientation, FORWARD), shed));
        angularAcceleration = scale(angularAcceleration, share);
    }
    // The swung body's centre on the path, from the socket: body point δ·ẑ − socket.
    const d = rotate(path.orientation, sub(vec3(0, 0, body.offset), head.socket));
    const centre = add(add(socketAcceleration, cross(angularAcceleration, d)), cross(w, cross(w, d)));
    const weight = vec3(0, 0, track.headWeight);
    let feedForward = add(scale(centre, body.mass), weight);
    const I = body.inertia;
    const wb = rotateInverse(q, w);
    const ab = rotateInverse(q, angularAcceleration);
    const spin = add(vec3(I.x * ab.x, I.y * ab.y, I.z * ab.z), cross(wb, vec3(I.x * wb.x, I.y * wb.y, I.z * wb.z)));
    // The hands hold the head's weight, which acts at the head's centre, r_h = −δ·s from the swung body's.
    let tau = add(rotate(q, spin), cross(scale(s, 0 - body.offset), weight));
    if (track.shaftWeight !== 0) {
        // And the shaft's, at its own centre, shaftRise up the shaft from the head's (P2b.2b.2b.2c design §4.3).
        const shaftWeight = vec3(0, 0, track.shaftWeight);
        feedForward = add(feedForward, shaftWeight);
        tau = add(tau, cross(scale(s, track.shaftRise - body.offset), shaftWeight));
    }
    const dip = contact ? scale(path.dipAcceleration, body.mass) : ZERO;
    // The push intent joins F_ff before the sharing, so both hands' shares and stiffnesses carry it. A stroke with no
    // push never reads it (A2 item 5).
    const intent = contact && track.push !== null ? pushIntent(track, t, grip) : null;
    const fed = intent === null ? feedForward : add(feedForward, intent);
    const shared = sub(fed, dip);
    const along = scale(s, dot(shared, s));
    const perpendicular = sub(shared, along);
    const G = cross(tau, s);
    const a = rho + arc.radius - body.offset;
    const b = rho + hands.bottom - body.offset;
    const topShare = add(along, scale(sub(G, scale(perpendicular, b)), 1 / (a - b)));
    const bottomShare = scale(sub(scale(perpendicular, a), G), 1 / (a - b));
    const twistShare = dot(tau, s);
    // The grips and their targets on the path.
    const topArm = scale(s, rho + arc.radius);
    const bottomArm = scale(s, rho + hands.bottom);
    const shaft = rotate(path.orientation, UP);
    const topLever = scale(shaft, arc.radius);
    const bottomLever = scale(shaft, hands.bottom);
    const topLag = sub(
        add(path.socketVelocity, cross(w, topLever)),
        add(state.velocity, cross(state.angularVelocity, topArm)),
    );
    const bottomLag = sub(
        add(path.socketVelocity, cross(w, bottomLever)),
        add(state.velocity, cross(state.angularVelocity, bottomArm)),
    );
    const spinLag = sub(w, state.angularVelocity);
    const load = (top: Vec3, bottom: Vec3, twist: number, fed: Vec3, saturated: HandName | null): HandLoad => ({
        force: add(top, bottom),
        feedForward: fed,
        torque: add(add(cross(topArm, top), cross(bottomArm, bottom)), scale(s, twist)),
        top,
        bottom,
        saturated,
    });

    if (!contact) {
        if (gripped) {
            // A stop's hold is the firm grip, not the chains: they let go at it (A2 item 7).
            grip.topChain = null;
            grip.bottomChain = null;
        }
        const g = track.firm;
        const limit = hands.gripLimit;
        // The gaps to the path, less each hand's slid offset once it has saturated (design §5), the offset held in
        // the head's frame (plan decision 10).
        const topReach = sub(add(path.socket, topLever), add(state.position, topArm));
        const bottomReach = sub(add(path.socket, bottomLever), add(state.position, bottomArm));
        const topGap = grip.topOffset === null ? topReach : sub(topReach, rotate(q, grip.topOffset));
        const bottomGap = grip.bottomOffset === null ? bottomReach : sub(bottomReach, rotate(q, grip.bottomOffset));
        // On a downswing the firm grip keeps the hands' planned pace (feed-forward and damper) but has no position
        // spring (P2b.2b.2a user decision 2026-10-07): a head the turf holds back stays where it is put, so a graze
        // costs the head speed instead of the grip refunding it. A gripped stop keeps the spring: it holds the mallet
        // still.
        const spring = gripped || arc.downswing === undefined;
        let top = spring
            ? add(add(topShare, scale(topGap, g.stiffness)), scale(topLag, g.damping))
            : add(topShare, scale(topLag, g.damping));
        const pull = spring
            ? add(scale(bottomGap, g.stiffness), scale(bottomLag, g.damping))
            : scale(bottomLag, g.damping);
        let bottom = add(bottomShare, across(pull, s));
        const twist =
            twistShare +
            g.twistStiffness * dot(rotationError(path.orientation, q), s) +
            g.twistDamping * dot(spinLag, s);
        // At the limit the hand transmits F_max, and a spring's anchor slides as tangentialForce resets its spring
        // (plan decision 24): the spring alone then carries F_max less the hand's share, and never a stretch that
        // only cancels the damper. A damper alone is capped (design §5).
        let saturated: HandName | null = null;
        const topHeld = heldTo(top, limit);
        if (topHeld !== null) {
            if (spring) {
                const slide = sub(topGap, scale(sub(topHeld, topShare), 1 / g.stiffness));
                grip.topOffset = slid(grip.topOffset, slide, q);
            }
            top = topHeld;
            saturated = "top";
        }
        const bottomHeld = heldTo(bottom, limit);
        if (bottomHeld !== null) {
            if (spring) {
                const slide = sub(across(bottomGap, s), scale(sub(bottomHeld, bottomShare), 1 / g.stiffness));
                grip.bottomOffset = slid(grip.bottomOffset, slide, q);
            }
            bottom = bottomHeld;
            saturated = saturated ?? "bottom";
        }
        // The arm returns a slid anchor under its limit (P2b.2b.2c.2 design §4.1): after this step's force, so a decay
        // never tips a hand over F_max within its own step, and exact for any dt. A hand at its limit slides instead.
        // A held stroke's anchor returns too, as a swung one's does; with no hold every offset is kept as it was.
        const arm = hands.flex.hold;
        if (spring && arm !== null) {
            const decay = exp(0 - dt / (arm.damping / arm.stiffness));
            if (topHeld === null && grip.topOffset !== null) {
                grip.topOffset = scale(grip.topOffset, decay);
            }
            if (bottomHeld === null && grip.bottomOffset !== null) {
                grip.bottomOffset = scale(grip.bottomOffset, decay);
            }
        }
        return load(top, bottom, twist, add(topShare, bottomShare), saturated);
    }

    const carried = carryLoad(track, state, t, grip, path, {
        top: topShare,
        dip,
        bottom: bottomShare,
        whole: fed,
        checking,
        twist: twistShare,
        pitch: pitchNow,
        rate,
        topArm,
        bottomArm,
        spinLag,
        s,
        topAcceleration: add(
            add(socketAcceleration, cross(angularAcceleration, topLever)),
            cross(w, cross(w, topLever)),
        ),
        bottomAcceleration: add(
            add(socketAcceleration, cross(angularAcceleration, bottomLever)),
            cross(w, cross(w, bottomLever)),
        ),
    });
    return intent === null ? carried : { ...carried, intent };
}
