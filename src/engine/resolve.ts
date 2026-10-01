/**
 * Instantaneous collision impulses for free motion, with restitution along the contact normal and Coulomb
 * friction in the lawn plane. Linear velocity stays horizontal (the turf prevents lift in free motion). Whether a
 * pair is approaching is decided by `approachSpeed`, the predicate detection also uses.
 */
import { approachSpeed } from "./detect";
import { ZERO, add, cross, dot, horizontal, length, normalize, scale, sub, type Vec3 } from "./math/vec3";
import type { BallParams, BallState, ContactMaterial } from "./types";

function inertia(ball: BallParams): number {
    return 0.4 * ball.mass * ball.radius * ball.radius;
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
