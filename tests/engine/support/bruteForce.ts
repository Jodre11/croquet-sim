/**
 * Reference integrator for cross-checking the event-driven solver. Integrates the turf forces and flight with
 * semi-implicit Euler at a fixed step and detects contacts and landings by overlap. Test-only and deliberately slow.
 *
 * It shares `resolveBallBall`/`resolveBallCylinder` and the landing on the turf bed (`impact/landing.ts`) with the
 * engine, so it independently checks event timing, flight and pushing but not the impulse or landing model, which
 * resolve.test.ts and landing.test.ts cover directly. Pushing is integrated
 * as many small impulses; each one's downward part is taken by the turf with its impulsive turf friction, so the turf's
 * friction tracks the load a push puts on a ball step by step. The next step's turf forces then scale with the load
 * L = g − (upward push impulse in this step)/dt (spec §5): rolling resistance by max(L, 0)/g, sliding friction by
 * min(max(L, 0), g)/g, since a downward impulse already carried its own impulsive turf friction.
 *
 * Only pushes load the turf this way, not collisions: a collision's impulse is not a force sustained over the step,
 * and the engine resolves it whole in resolve.ts (an impulse cannot reduce the turf's load). A contact is a push
 * when it persists — the pair overlapped, or was within RESTING_SPEED·dt of touching, at the previous step's contact
 * check — and closes slower than RESTING_SPEED before this step's impulse.
 *
 * Twist lock (spin about the vertical axis): while a ball's turf contact patch does not slip, at rest or rolling, the
 * grass holds its spin about the vertical (unlimited torque); only a sliding or airborne ball's is free. The patch is
 * classified by the engine's `classify` on the state the impulses meet (after step()), and a push's impulse then
 * leaves a locked ball's spin about the vertical unchanged. Collisions change it as resolve.ts says: no finite patch
 * torque resists an impulsive twist, and the engine shares that impulse model.
 */
import { approachSpeed } from "../../../src/engine/detect";
import {
    ZERO,
    add,
    cross,
    dot,
    horizontal,
    length,
    normalize,
    scale,
    sub,
    vec3,
    type Vec3,
} from "../../../src/engine/math/vec3";
import { classify, contactSlip, onTurf, rollingSpin } from "../../../src/engine/motion";
import { RESTING_SPEED } from "../../../src/engine/push";
import { land } from "../../../src/engine/impact/landing";
import { bedLawOf } from "../../../src/engine/impact/turfBed";
import { resolveBallBall, resolveBallCylinder } from "../../../src/engine/resolve";
import {
    BALL_IDS,
    type BallId,
    type BallState,
    type BallStates,
    type ContactMaterial,
    type World,
} from "../../../src/engine/types";
import { motionParamsAt, obstaclesOf, turfAt } from "../../../src/engine/world";

const STOP_SPEED = 1e-9;

function fly(s: BallState, world: World, dt: number): BallState {
    const R = world.ball.radius;
    const velocity = add(s.velocity, vec3(0, 0, 0 - world.gravity * dt));
    const position = add(s.position, scale(velocity, dt));
    if (position.z > R) {
        return { position, velocity, angularVelocity: s.angularVelocity };
    }
    // Landed within the step: back on the turf, with the engine's landing on the turf bed.
    const touchdown = { position: vec3(position.x, position.y, R), velocity, angularVelocity: s.angularVelocity };
    return land(touchdown, world.ball, world.gravity, bedLawOf(world.lawn.surfaceAt(touchdown.position))).state;
}

/**
 * One step of turf motion. `load` is the ball's turf load ratio L/g, clamped: rolling resistance scales with
 * max(load, 0); sliding friction and the slip-end threshold only with min(max(load, 0), 1), since a downward contact
 * impulse already carried its own impulsive turf friction (`turfFriction` in resolve.ts). A negative load would
 * reverse both forces.
 */
function step(s: BallState, world: World, dt: number, load: number): BallState {
    const R = world.ball.radius;
    if (!onTurf(s, R)) {
        return fly(s, world, dt);
    }
    const base = motionParamsAt(world, s.position);
    const p = {
        slidingDecel: base.slidingDecel * Math.min(Math.max(load, 0), 1),
        rollingDecel: base.rollingDecel * Math.max(load, 0),
    };
    const slip = contactSlip(s, R);
    let velocity: Vec3;
    let angularVelocity: Vec3;
    if (length(slip) > STOP_SPEED && length(slip) <= 3.5 * p.slidingDecel * dt) {
        // Friction removes slip at 7/2·a, so this slip ends within the step: the ball loses exactly 2/7 of it and
        // rolls. (Applying a full step of friction here would reverse the slip; contact pushes create such small
        // slips every step.) Rolling resistance acts for the step as well, stopping rather than reversing.
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

/** Turf without friction: resolving against it leaves only the contact impulse's own changes. */
const BARE_TURF = (): number => 0;

/**
 * The part of a contact impulse j (per unit mass) across the unit normal n, read off the spin change dw it caused at
 * the contact point R·n from the centre: R·n × j = (2/5)·R²·dw, so n × j = 0.4·R·dw and the part is (n × j) × n.
 */
function across(n: Vec3, dw: Vec3, R: number): Vec3 {
    return cross(scale(dw, 0.4 * R), n);
}

/**
 * The upward contact impulse per unit mass on b (−that on a) in resolveBallBall, resolved on bare turf so that the
 * changes are the contact impulse's alone. A ball in flight shows it whole in its velocity; between two balls on the
 * turf the normal is horizontal, so the upward part lies across it.
 */
function ballBallImpulseZ(a: BallState, b: BallState, world: World): number {
    const R = world.ball.radius;
    const [na, nb] = resolveBallBall(a, b, world.ball, world.ballBall, BARE_TURF);
    if (!onTurf(b, R)) {
        return nb.velocity.z - b.velocity.z;
    }
    if (!onTurf(a, R)) {
        return a.velocity.z - na.velocity.z;
    }
    // Both get angular impulse R·n × (−j) with n from a to b, i.e. j at −R·n on b.
    const n = normalize(sub(b.position, a.position));
    return across(scale(n, -1), sub(nb.angularVelocity, b.angularVelocity), R).z;
}

/** The upward impulse per unit mass on a ball in resolveBallCylinder (contact at −R·n, normal horizontal). */
function cylinderImpulseZ(s: BallState, axis: Vec3, material: ContactMaterial, world: World): number {
    const R = world.ball.radius;
    const next = resolveBallCylinder(s, axis, world.ball, material, BARE_TURF);
    if (!onTurf(s, R)) {
        return next.velocity.z - s.velocity.z;
    }
    const n = normalize(horizontal(sub(s.position, axis)));
    return across(scale(n, -1), sub(next.angularVelocity, s.angularVelocity), R).z;
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
    const turf = (position: Vec3): ReturnType<typeof turfAt> => turfAt(world, position);
    const ids = BALL_IDS.filter((id) => initial[id]);
    const states = new Map<BallId, BallState>(ids.map((id) => [id, initial[id] as BallState]));
    // Upward push impulse per unit mass on each ball in the previous step (step() runs before this step's impulses):
    // its turf load is L = g − up/dt.
    let up = new Map<BallId, number>();
    // Contacts (ball pairs, ball–obstacle pairs) that overlapped, or had a gap under RESTING_SPEED·dt, at the previous
    // step's contact check. A push's impulses chatter: each bounces the pair apart slower than RESTING_SPEED, so a gap
    // of up to RESTING_SPEED·dt can open for a step before the drive closes it again.
    let touching = new Set<string>();
    const near = RESTING_SPEED * dt;
    for (let t = 0; t < maxTime; t += dt) {
        let moving = false;
        for (const id of ids) {
            const s = states.get(id) as BallState;
            const next = step(s, world, dt, 1 - (up.get(id) ?? 0) / (world.gravity * dt));
            if (length(next.velocity) > 0 || !onTurf(next, R)) {
                moving = true;
            }
            states.set(id, next);
        }
        // Balls whose patch does not slip as this step's impulses meet them: a push leaves their spin about z alone.
        const locked = new Set<BallId>(
            ids.filter((id) => {
                const phase = classify(states.get(id) as BallState, R);
                return phase === "rolling" || phase === "stationary";
            }),
        );
        const keepTwist = (id: BallId, before: BallState, after: BallState, push: boolean): BallState => {
            if (!push || !locked.has(id)) {
                return after;
            }
            const w = after.angularVelocity;
            return { ...after, angularVelocity: vec3(w.x, w.y, before.angularVelocity.z) };
        };
        const wasTouching = touching;
        touching = new Set<string>();
        up = new Map<BallId, number>();
        const lift = (id: BallId, dz: number): void => {
            up.set(id, (up.get(id) ?? 0) + dz);
        };
        for (let i = 0; i < ids.length; i++) {
            const a = ids[i] as BallId;
            for (let j = i + 1; j < ids.length; j++) {
                const b = ids[j] as BallId;
                const sa = states.get(a) as BallState;
                const sb = states.get(b) as BallState;
                const key = `${a}-${b}`;
                const gap = length(sub(sa.position, sb.position)) - 2 * R;
                if (gap < near) {
                    touching.add(key);
                }
                if (gap < 0) {
                    const push =
                        wasTouching.has(key) &&
                        approachSpeed(sub(sa.position, sb.position), sub(sa.velocity, sb.velocity)) < RESTING_SPEED;
                    const [na, nb] = resolveBallBall(sa, sb, world.ball, world.ballBall, turf);
                    if (push) {
                        const jz = ballBallImpulseZ(sa, sb, world);
                        lift(a, 0 - jz);
                        lift(b, jz);
                    }
                    states.set(a, keepTwist(a, sa, na, push));
                    states.set(b, keepTwist(b, sb, nb, push));
                }
            }
            obstacles.forEach((o, k) => {
                const s = states.get(a) as BallState;
                const offset = horizontal(sub(s.position, o.centre));
                const key = `${a}@${k}`;
                const gap = length(offset) - (R + o.radius);
                if (gap < near) {
                    touching.add(key);
                }
                if (gap < 0) {
                    const push = wasTouching.has(key) && approachSpeed(offset, s.velocity) < RESTING_SPEED;
                    if (push) {
                        lift(a, cylinderImpulseZ(s, o.centre, o.material, world));
                    }
                    const next = resolveBallCylinder(s, o.centre, world.ball, o.material, turf);
                    states.set(a, keepTwist(a, s, next, push));
                }
            });
        }
        if (!moving) {
            break;
        }
    }
    return Object.fromEntries(ids.map((id) => [id, (states.get(id) as BallState).position]));
}
