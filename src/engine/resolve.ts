/**
 * Instantaneous impulses in free motion (spec §5 phase 2): ball–ball and ball–cylinder collisions, with restitution
 * along the 3D contact normal and Coulomb friction in the full tangent plane, and a ball landing on the turf. Whether
 * a pair is approaching is decided by `approachSpeed`, the predicate detection also uses.
 *
 * Turf support. A ball on the turf cannot be driven into it: while it is supported its vertical velocity stays zero,
 * and the turf takes the downward part of the impulse on it, perfectly inelastically. A ball on the turf is tried as
 * supported first and kept so if the vertical impulse on it comes out downward (or zero); otherwise it is solved free,
 * and the upward impulse lifts it.
 *
 * Compliance. An impulse P on ball b (and −P on ball a) changes the relative velocity u = u_a − u_b of the contact
 * points by −K·P, with K = (M_a + M_b)/m + (5/m)·(I − n·nᵀ). M is the identity for a free ball and diag(1, 1, 0) for a
 * supported one (the turf takes its vertical motion); the second term is the spin of the two balls (R²/I = 5/(2m)
 * each). For a ball against a fixed cylinder, the impulse P on the ball changes its contact velocity by +K·P with
 * K = M/m + (5/(2m))·(I − n·nᵀ).
 *
 * A collision is applied as a sequence of impulses, none of which adds energy:
 * 1. the normal impulse P_n·n that gives restitution e along n: P_n = (1 + e)·approach / (nᵀ·K·n);
 * 2. the friction impulse λ·ŝ against the contact slip ŝ that remains, λ = min(μ·P_n, |slip| / (ŝᵀ·K·ŝ)): Coulomb, but
 *    never more than brings the slip along ŝ to zero;
 * 3. if the pair is still approaching (with a supported ball and an inclined normal, K couples n and ŝ, so friction
 *    changes the normal speed), a perfectly inelastic normal impulse that stops the approach;
 * 4. for each supported ball, the impulsive turf friction that the turf's impulse Λ carries: against the ball's turf
 *    slip, at most μs·Λ and at most what stops that slip (2m/7 per unit of slip).
 * An impulse P changes kinetic energy by −P·(u_before + u_after)/2, which the caps keep ≤ 0 for any symmetric
 * positive-definite K; the turf's own impulses do no work, because the turf contact point does not move vertically.
 * Restitution along n of the contact impulse, before turf friction, is therefore exactly e for a frictionless contact
 * or a horizontal normal (two balls on the turf, any ball against an upright), and otherwise e plus what friction adds,
 * never letting the pair still approach.
 * Finally, a ball on the turf left rising slower than SETTLE_SPEED stays on the turf; the small upward impulse that
 * freed it carries no turf friction, since the turf took none of it.
 */
import { approachSpeed } from "./detect";
import { add, cross, dot, horizontal, length, normalize, scale, sub, vec3, type Vec3 } from "./math/vec3";
import { contactSlip, onTurf } from "./motion";
import { RESTING_SPEED } from "./push";
import type { BallParams, BallState, ContactMaterial } from "./types";

/**
 * Upward speed (m/s) below which a ball on the turf stays on it. A numerical tolerance equal to RESTING_SPEED: such a
 * hop would rise at most SETTLE_SPEED²/(2g), about 0.05 µm, and would otherwise start an endless run of ever-smaller
 * bounces.
 */
export const SETTLE_SPEED = RESTING_SPEED;

/** The turf's restitution and sliding friction at a position. */
export type TurfAt = (position: Vec3) => ContactMaterial;

function inertia(ball: BallParams): number {
    return 0.4 * ball.mass * ball.radius * ball.radius;
}

/** M·v: a supported ball does not respond vertically. */
function mobility(v: Vec3, supported: boolean): Vec3 {
    return supported ? horizontal(v) : v;
}

/**
 * The normal impulse and then the friction impulse for compliance `k` (a function returning K·v), closing speed
 * `approach` along n and relative contact velocity `u`. Returns the total impulse in the direction that reduces u.
 */
function contactImpulse(k: (v: Vec3) => Vec3, n: Vec3, u: Vec3, approach: number, material: ContactMaterial): Vec3 {
    const normal = ((1 + material.restitution) * approach) / dot(n, k(n));
    const after = sub(u, scale(k(n), normal));
    const slip = sub(after, scale(n, dot(after, n)));
    const size = length(slip);
    if (size === 0 || material.friction === 0) {
        return scale(n, normal);
    }
    const s = scale(slip, 1 / size);
    const friction = Math.min(material.friction * normal, size / dot(s, k(s)));
    const impulse = add(scale(n, normal), scale(s, friction));
    // With a supported ball and an inclined normal, K couples n and ŝ, so friction can leave the pair approaching.
    // A perfectly inelastic normal impulse then stops the approach; it only removes energy.
    const closing = dot(sub(u, k(impulse)), n);
    return closing > 0 ? add(impulse, scale(n, closing / dot(n, k(n)))) : impulse;
}

/**
 * Applies the impulsive turf friction carried by a turf impulse `load` (N·s, upward) to a ball on the turf: against its
 * turf slip, at most μs·load and at most what stops the slip.
 */
function turfFriction(s: BallState, load: number, ball: BallParams, turf: ContactMaterial): BallState {
    const slip = contactSlip(s, ball.radius);
    const size = length(slip);
    if (load <= 0 || size === 0) {
        return s;
    }
    const f = Math.min(turf.friction * load, (2 * ball.mass * size) / 7);
    const force = scale(slip, (0 - f) / size);
    // Applied at −R·ẑ: torque (−R·ẑ) × F = (R·Fy, −R·Fx, 0).
    const torque = vec3(ball.radius * force.y, 0 - ball.radius * force.x, 0);
    return {
        position: s.position,
        velocity: add(s.velocity, scale(force, 1 / ball.mass)),
        angularVelocity: add(s.angularVelocity, scale(torque, 1 / inertia(ball))),
    };
}

/** A ball that started on the turf and is left rising slower than SETTLE_SPEED stays on it. */
function settle(s: BallState, wasOnTurf: boolean): BallState {
    if (!wasOnTurf || s.velocity.z <= 0 || s.velocity.z >= SETTLE_SPEED) {
        return s;
    }
    return { ...s, velocity: horizontal(s.velocity) };
}

/**
 * Resolves a collision between two identical balls (spec §5): restitution along the 3D line of centres, friction in
 * the full tangent plane, turf support and impulsive turf friction. Returns the inputs unchanged (the same objects) if
 * `approachSpeed` says they are not approaching.
 */
export function resolveBallBall(
    a: BallState,
    b: BallState,
    ball: BallParams,
    material: ContactMaterial,
    turfAt: TurfAt,
): readonly [BallState, BallState] {
    const approach = approachSpeed(sub(a.position, b.position), sub(a.velocity, b.velocity));
    if (approach <= 0) {
        return [a, b];
    }
    const { radius: r, mass: m } = ball;
    const n = normalize(sub(b.position, a.position));
    // Contact-point velocities: a touches at +r·n from its centre, b at −r·n.
    const ua = add(a.velocity, cross(a.angularVelocity, scale(n, r)));
    const ub = add(b.velocity, cross(b.angularVelocity, scale(n, -r)));
    const u = sub(ua, ub);

    const aOnTurf = onTurf(a, r);
    const bOnTurf = onTurf(b, r);
    let supportA = aOnTurf;
    let supportB = bOnTurf;
    let impulse: Vec3;
    // Try the turf balls as supported first. Each pass either breaks or clears one support flag, and flags are never
    // set again, so this runs at most three times.
    for (;;) {
        const sa = supportA;
        const sb = supportB;
        const k = (v: Vec3): Vec3 =>
            scale(add(add(mobility(v, sa), mobility(v, sb)), scale(sub(v, scale(n, dot(v, n))), 5)), 1 / m);
        impulse = contactImpulse(k, n, u, approach, material);
        // a receives −impulse and b +impulse: an upward share on a supported ball lifts it instead.
        if (supportA && impulse.z < 0) {
            supportA = false;
        } else if (supportB && impulse.z > 0) {
            supportB = false;
        } else {
            break;
        }
    }

    // a receives −J at +r·n and b receives +J at −r·n: both get angular impulse r·n × (−J).
    const dw = scale(cross(scale(n, r), scale(impulse, -1)), 1 / inertia(ball));
    const na: BallState = {
        position: a.position,
        velocity: sub(a.velocity, scale(mobility(impulse, supportA), 1 / m)),
        angularVelocity: add(a.angularVelocity, dw),
    };
    const nb: BallState = {
        position: b.position,
        velocity: add(b.velocity, scale(mobility(impulse, supportB), 1 / m)),
        angularVelocity: add(b.angularVelocity, dw),
    };
    return [
        settle(supportA ? turfFriction(na, impulse.z, ball, turfAt(a.position)) : na, aOnTurf),
        settle(supportB ? turfFriction(nb, 0 - impulse.z, ball, turfAt(b.position)) : nb, bOnTurf),
    ];
}

/**
 * Resolves a collision between a ball and a fixed vertical cylinder (hoop upright or peg) whose axis passes through
 * `axis`. The normal is horizontal at any height. Returns the input unchanged if `approachSpeed` says the ball is not
 * approaching the cylinder.
 */
export function resolveBallCylinder(
    s: BallState,
    axis: Vec3,
    ball: BallParams,
    material: ContactMaterial,
    turfAt: TurfAt,
): BallState {
    const offset = horizontal(sub(s.position, axis));
    const approach = approachSpeed(offset, s.velocity);
    if (approach <= 0) {
        return s;
    }
    const { radius: r, mass: m } = ball;
    const n = normalize(offset);
    // The ball touches the cylinder at −r·n from its centre; its contact velocity is u, and −n is into the cylinder.
    const contact = scale(n, -r);
    const u = add(s.velocity, cross(s.angularVelocity, contact));
    const wasOnTurf = onTurf(s, r);
    let supported = wasOnTurf;
    let impulse: Vec3;
    // Try the ball as supported first. Each pass either breaks or clears the support flag, and it is never set again,
    // so this runs at most twice.
    for (;;) {
        const held = supported;
        const k = (v: Vec3): Vec3 => scale(add(mobility(v, held), scale(sub(v, scale(n, dot(v, n))), 2.5)), 1 / m);
        // contactImpulse returns the impulse that reduces u, along −n here (the ball closes along −n); the ball
        // receives the opposite.
        impulse = scale(contactImpulse(k, scale(n, -1), u, approach, material), -1);
        if (supported && impulse.z > 0) {
            supported = false;
        } else {
            break;
        }
    }
    const next: BallState = {
        position: s.position,
        velocity: add(s.velocity, scale(mobility(impulse, supported), 1 / m)),
        angularVelocity: add(s.angularVelocity, scale(cross(contact, impulse), 1 / inertia(ball))),
    };
    return settle(supported ? turfFriction(next, 0 - impulse.z, ball, turfAt(s.position)) : next, wasOnTurf);
}

/**
 * Resolves a ball landing on the turf: its centre is one radius up and it is moving down. The turf's impulse
 * Λ = (1 + e)·m·|vz| reverses the vertical velocity with restitution e and carries impulsive turf friction (at most
 * μs·Λ against the turf slip, at most what stops it). A rebound slower than SETTLE_SPEED leaves the ball on the turf,
 * and the turf's impulse is then only m·|vz|.
 */
export function resolveLanding(s: BallState, ball: BallParams, turf: ContactMaterial): BallState {
    const down = Math.max(0 - s.velocity.z, 0);
    const rebound = turf.restitution * down;
    const up = rebound >= SETTLE_SPEED ? rebound : 0;
    const bounced: BallState = {
        position: vec3(s.position.x, s.position.y, ball.radius),
        velocity: vec3(s.velocity.x, s.velocity.y, up),
        angularVelocity: s.angularVelocity,
    };
    return turfFriction(bounced, ball.mass * (down + up), ball, turf);
}
