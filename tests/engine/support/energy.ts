import { lengthSq } from "../../../src/engine/math/vec3";
import type { BallParams, BallState } from "../../../src/engine/types";

/** Translational plus rotational kinetic energy of a solid sphere (J). */
export function kineticEnergy(s: BallState, ball: BallParams): number {
    const inertia = 0.4 * ball.mass * ball.radius * ball.radius;
    return 0.5 * ball.mass * lengthSq(s.velocity) + 0.5 * inertia * lengthSq(s.angularVelocity);
}
