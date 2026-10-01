/**
 * Reference integrator for cross-checking the event-driven solver. Integrates the turf forces and flight with
 * semi-implicit Euler at a fixed step and detects contacts and landings by overlap. Test-only and deliberately slow.
 *
 * It shares `resolveBallBall`/`resolveBallCylinder`/`resolveLanding` with the engine, so it independently checks event
 * timing, flight and pushing but not the impulse model, which resolve.test.ts covers directly.
 */
import {
    ZERO,
    add,
    dot,
    horizontal,
    length,
    normalize,
    scale,
    sub,
    vec3,
    type Vec3,
} from "../../../src/engine/math/vec3";
import { contactSlip, onTurf, rollingSpin } from "../../../src/engine/motion";
import { resolveBallBall, resolveBallCylinder, resolveLanding } from "../../../src/engine/resolve";
import { BALL_IDS, type BallId, type BallState, type BallStates, type World } from "../../../src/engine/types";
import { motionParamsAt, obstaclesOf, turfAt } from "../../../src/engine/world";

const STOP_SPEED = 1e-9;

function fly(s: BallState, world: World, dt: number): BallState {
    const R = world.ball.radius;
    const velocity = add(s.velocity, vec3(0, 0, 0 - world.gravity * dt));
    const position = add(s.position, scale(velocity, dt));
    if (position.z > R) {
        return { position, velocity, angularVelocity: s.angularVelocity };
    }
    // Landed within the step: back on the turf, with the engine's landing impulse.
    const touchdown = { position: vec3(position.x, position.y, R), velocity, angularVelocity: s.angularVelocity };
    return resolveLanding(touchdown, world.ball, turfAt(world, touchdown.position));
}

function step(s: BallState, world: World, dt: number): BallState {
    const R = world.ball.radius;
    if (!onTurf(s, R)) {
        return fly(s, world, dt);
    }
    const p = motionParamsAt(world, s.position);
    const slip = contactSlip(s, R);
    let velocity: Vec3;
    let angularVelocity: Vec3;
    if (length(slip) > STOP_SPEED && length(slip) <= 3.5 * p.slidingDecel * dt) {
        // Friction removes slip at 7/2·a, so this slip ends within the step: the ball loses exactly 2/7 of it and
        // rolls. (Applying a full step of friction here would reverse the slip; contact pushes create such small
        // slips every step.)
        // Rolling resistance acts for the step as well, stopping rather than reversing.
        const rolled = sub(s.velocity, scale(slip, 2 / 7));
        const d = normalize(rolled);
        velocity = length(rolled) > p.rollingDecel * dt ? sub(rolled, scale(d, p.rollingDecel * dt)) : ZERO;
        angularVelocity = rollingSpin(velocity, s.angularVelocity.z, R);
    } else if (length(slip) > STOP_SPEED) {
        // Sliding: friction opposes slip; its torque spins the ball up towards rolling.
        const u = normalize(slip);
        const a = p.slidingDecel;
        velocity = sub(s.velocity, scale(u, a * dt));
        const k = (5 * a * dt) / (2 * R);
        angularVelocity = vec3(s.angularVelocity.x - k * u.y, s.angularVelocity.y + k * u.x, s.angularVelocity.z);
    } else if (length(s.velocity) > STOP_SPEED) {
        // Rolling: uniform deceleration along the direction of travel, stopping rather than reversing.
        const d = normalize(s.velocity);
        velocity = sub(s.velocity, scale(d, p.rollingDecel * dt));
        if (dot(velocity, d) <= 0) {
            return { position: s.position, velocity: ZERO, angularVelocity: ZERO };
        }
        angularVelocity = rollingSpin(velocity, s.angularVelocity.z, R);
    } else {
        return { position: s.position, velocity: ZERO, angularVelocity: ZERO };
    }
    return { position: add(s.position, scale(velocity, dt)), velocity, angularVelocity };
}

/** Integrates the shot at fixed step `dt` for at most `maxTime` seconds and returns rest positions. */
export function bruteForce(
    initial: BallStates,
    world: World,
    dt: number,
    maxTime: number,
): Partial<Record<BallId, Vec3>> {
    const R = world.ball.radius;
    const obstacles = obstaclesOf(world);
    const ids = BALL_IDS.filter((id) => initial[id]);
    const states = new Map<BallId, BallState>(ids.map((id) => [id, initial[id] as BallState]));
    for (let t = 0; t < maxTime; t += dt) {
        let moving = false;
        for (const id of ids) {
            const s = states.get(id) as BallState;
            const next = step(s, world, dt);
            if (length(next.velocity) > 0 || !onTurf(next, R)) {
                moving = true;
            }
            states.set(id, next);
        }
        for (let i = 0; i < ids.length; i++) {
            const a = ids[i] as BallId;
            for (let j = i + 1; j < ids.length; j++) {
                const b = ids[j] as BallId;
                const sa = states.get(a) as BallState;
                const sb = states.get(b) as BallState;
                if (length(sub(sa.position, sb.position)) < 2 * R) {
                    const [na, nb] = resolveBallBall(sa, sb, world.ball, world.ballBall);
                    states.set(a, na);
                    states.set(b, nb);
                }
            }
            for (const o of obstacles) {
                const s = states.get(a) as BallState;
                if (length(horizontal(sub(s.position, o.centre))) < R + o.radius) {
                    states.set(a, resolveBallCylinder(s, o.centre, world.ball, o.material));
                }
            }
        }
        if (!moving) {
            break;
        }
    }
    return Object.fromEntries(ids.map((id) => [id, (states.get(id) as BallState).position]));
}
