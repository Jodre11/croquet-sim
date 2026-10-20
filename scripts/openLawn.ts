/**
 * The open lawn (P2b.2b.2c.1 design §8.5; P2b.2b.2c.2 design §3): a court's turf with no hoops, so wide that every
 * stroke comes to rest on it, and the striker's start on it. Shared by scripts/singleBallProbe.ts's user's checks and
 * scripts/croquetFitProbe.ts's distance check, so that both measure distances to rest on the same lawn.
 */
import { add, vec3 } from "../src/engine/math/vec3";
import type { ShotSetup } from "../src/engine/swing/types";
import {
    BALL_IDS,
    type BallId,
    type BallState,
    type BallStates,
    type ShotResult,
    type World,
} from "../src/engine/types";
import { defaultWorld, uniformLawn } from "../src/engine/world";

/** J's open lawn's side (m): far beyond any stroke's reach, so that every run comes to rest on it. */
export const OPEN_LAWN = 200;

/** J's striker's start on the open lawn (m): mid-width, 150 m of lawn ahead along aim (+y). */
export const OPEN_START = vec3(OPEN_LAWN / 2, 50, 0);

/**
 * J's open world: defaultWorld(10)'s gravity, ball, materials and surface, no hoops, on a uniform lawn
 * OPEN_LAWN square. Its peg stays at the court's centre, far off J's lines.
 */
export function openWorld(): World {
    const court = defaultWorld(10);
    const surface = court.lawn.surfaceAt(vec3(court.lawn.width / 2, court.lawn.length / 2, 0));
    return { ...court, hoops: [], lawn: uniformLawn(OPEN_LAWN, OPEN_LAWN, surface) };
}

/** `setup` with every ball moved by the one offset that puts the striker at OPEN_START. */
export function opened(setup: ShotSetup): ShotSetup {
    const striker = (setup.balls[setup.striker] as BallState).position;
    const offset = vec3(OPEN_START.x - striker.x, OPEN_START.y - striker.y, 0);
    const balls: BallStates = {};
    for (const id of BALL_IDS) {
        const ball = setup.balls[id];
        if (ball !== undefined) {
            balls[id] = { ...ball, position: add(ball.position, offset) };
        }
    }
    return { ...setup, balls };
}

/** " (halted)" when phase 2 halted ball `id` past the open lawn's boundary: its distance is then not to rest. */
export function haltedText(motion: ShotResult, id: BallId): string {
    return motion.events.some((e) => e.kind === "halted" && e.ball === id) ? " (halted)" : "";
}
