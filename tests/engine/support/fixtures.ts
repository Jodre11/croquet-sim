/**
 * Test-only world and balls. The numbers are plausible but deliberately NOT sourced, so test expectations do not
 * change when the reference data does. (Importing world.ts still loads and validates reference/*.json, so invalid
 * reference data fails every engine test at import.) src/ must never import this file.
 */
import { ZERO, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import { rollingSpin } from "../../../src/engine/motion";
import type { BallState, Hoop, World } from "../../../src/engine/types";
import { STANDARD_GRAVITY, uniformLawn } from "../../../src/engine/world";

export const TEST_BALL = { radius: 0.046, mass: 0.454 } as const;

/** A 30 × 40 m lawn, peg at (15, 20), no hoops unless overridden. Symmetric about x = 15. */
export function testWorld(overrides: Partial<World> = {}): World {
    return {
        gravity: STANDARD_GRAVITY,
        ball: TEST_BALL,
        lawn: uniformLawn(30, 40, { slidingFriction: 0.3, rollingResistance: 0.05 }),
        hoops: [],
        peg: { id: "peg", centre: vec3(15, 20, 0), radius: 0.02, material: { restitution: 0.6, friction: 0.1 } },
        ballBall: { restitution: 0.8, friction: 0.05 },
        ballUpright: { restitution: 0.6, friction: 0.1 },
        outOfCourt: { ballRadii: 0, uprightRadii: 0 },
        hoopRunStart: { ballRadii: -1, uprightRadii: -1 },
        hoopRunComplete: { ballRadii: 1, uprightRadii: 1 },
        haltMargin: 1,
        ...overrides,
    };
}

/** A ball resting on the lawn at (x, y), optionally moving. */
export function ballAt(x: number, y: number, velocity: Vec3 = ZERO, angularVelocity: Vec3 = ZERO): BallState {
    return { position: vec3(x, y, TEST_BALL.radius), velocity, angularVelocity };
}

/** A ball rolling without slip at (x, y) with velocity (vx, vy). */
export function rollingBallAt(x: number, y: number, vx: number, vy: number): BallState {
    const velocity = vec3(vx, vy, 0);
    return ballAt(x, y, velocity, rollingSpin(velocity, 0, TEST_BALL.radius));
}

/** A hoop at (x, y) with its plane east–west, run northwards for direction +1. */
export function testHoop(id: string, x: number, y: number): Hoop {
    return { id, centre: vec3(x, y, 0), normal: vec3(0, 1, 0), innerWidth: 0.0953, uprightRadius: 0.008 };
}
