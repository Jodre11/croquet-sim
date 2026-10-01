/**
 * Instantaneous collision impulses for free motion, with restitution along the contact normal and Coulomb
 * friction in the lawn plane. Linear velocity stays horizontal (the turf prevents lift in free motion). Whether a
 * pair is approaching is decided by `approachSpeed`, the predicate detection also uses.
 */
import { approachSpeed } from "./detect";
import { ZERO, add, cross, dot, horizontal, length, normalize, scale, sub, vec3, type Vec3 } from "./math/vec3";
import { contactSlip } from "./motion";
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

/**
 * Resolves a collision between two identical balls. Returns the inputs unchanged (the same objects) if
 * `approachSpeed` says they are not approaching.
 */
export function resolveBallBall(
    a: BallState,
    b: BallState,
    ball: BallParams,
    material: ContactMaterial,
): readonly [BallState, BallState] {
    const approach = approachSpeed(sub(a.position, b.position), sub(a.velocity, b.velocity));
    if (approach <= 0) {
        return [a, b];
    }
    const { radius: r, mass: m } = ball;
    const n = normalize(horizontal(sub(b.position, a.position)));
    // Contact-point velocities: a touches at +r·n from its centre, b at −r·n.
    const ua = add(a.velocity, cross(a.angularVelocity, scale(n, r)));
    const ub = add(b.velocity, cross(b.angularVelocity, scale(n, -r)));
    const relative = sub(ua, ub);

    // Normal impulse on b: relative normal speed changes by 2·Jn/m and must end at −e × approach.
    const jn = ((1 + material.restitution) * m * approach) / 2;
    // Tangential impulse changes relative slip by 7·Jt/m; stop the slip or slide at the Coulomb limit.
    const slip = horizontal(sub(relative, scale(n, dot(relative, n))));
    const slipSpeed = length(slip);
    const jt = Math.min((m * slipSpeed) / 7, material.friction * jn);
    const impulse = add(scale(n, jn), slipSpeed > 0 ? scale(slip, jt / slipSpeed) : ZERO);

    // a receives −J at +r·n and b receives +J at −r·n: both get angular impulse r·n × (−J).
    const dw = scale(cross(scale(n, r), scale(impulse, -1)), 1 / inertia(ball));
    return [
        {
            position: a.position,
            velocity: horizontal(sub(a.velocity, scale(impulse, 1 / m))),
            angularVelocity: add(a.angularVelocity, dw),
        },
        {
            position: b.position,
            velocity: horizontal(add(b.velocity, scale(impulse, 1 / m))),
            angularVelocity: add(b.angularVelocity, dw),
        },
    ];
}

/**
 * Resolves a collision between a ball and a fixed vertical cylinder (hoop upright or peg) whose axis passes
 * through `axis`. Returns the input unchanged if `approachSpeed` says the ball is not approaching the cylinder.
 */
export function resolveBallCylinder(s: BallState, axis: Vec3, ball: BallParams, material: ContactMaterial): BallState {
    const approach = approachSpeed(horizontal(sub(s.position, axis)), s.velocity);
    if (approach <= 0) {
        return s;
    }
    const { radius: r, mass: m } = ball;
    const n = normalize(horizontal(sub(s.position, axis)));
    // The ball touches the cylinder at −r·n from its centre.
    const contact = scale(n, -r);
    const relative = add(s.velocity, cross(s.angularVelocity, contact));

    const pn = (1 + material.restitution) * m * approach;
    // Tangential impulse changes contact slip by 7·Pt/(2m).
    const slip = horizontal(sub(relative, scale(n, dot(relative, n))));
    const slipSpeed = length(slip);
    const pt = Math.min((2 * m * slipSpeed) / 7, material.friction * pn);
    const impulse = sub(scale(n, pn), slipSpeed > 0 ? scale(slip, pt / slipSpeed) : ZERO);

    return {
        position: s.position,
        velocity: horizontal(add(s.velocity, scale(impulse, 1 / m))),
        angularVelocity: add(s.angularVelocity, scale(cross(contact, impulse), 1 / inertia(ball))),
    };
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
