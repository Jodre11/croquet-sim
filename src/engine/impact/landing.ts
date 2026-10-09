/**
 * A ball's landing in phase 2 (P2b.2b.2b.2a design §4.7): the ball alone, under gravity, on a fresh bed (turfBed.ts),
 * by the impact's semi-implicit Euler at IMPACT_DT, from touchdown (z = R) with its velocity and spin. The landing
 * ends:
 * - when the ball holds no cell and rises: it leaves;
 * - when, holding cells, it no longer bounces (§4.6's rule): it settles, its vertical velocity and depth set to rest
 *   on the flat turf, its horizontal velocity and spin kept;
 * - at LANDING_CAP: it is settled as above, and capped.
 * The outcome applies at the touchdown point: phase 2's clock and position do not carry the contact's few
 * milliseconds and millimetres (a recorded simplification). As before, a ball leaving slower than SETTLE_SPEED stays
 * on the turf.
 */
import { add, horizontal, length, scale, sub, vec3 } from "../math/vec3";
import { SETTLE_SPEED } from "../resolve";
import type { BallParams, BallState } from "../types";
import { IMPACT_DT } from "./integrate";
import { bedLoad, bedRelax, freshBed, isBouncing, newBallBed } from "./turfBed";
import type { BedLaw } from "./types";

/**
 * Longest landing (s) before it is settled with `landing-cap` (design §4.7): ten times the longest bed contact the
 * fit implies. A modelling bound, not physical.
 */
export const LANDING_CAP = 0.05;

/** How a landing ended: left the turf, settled on it, or settled at the cap. */
export type LandingOutcome = "left" | "settled" | "capped";

/** A landing's result: the ball as phase 2 takes it, and the contact's figures for the probes (design §6). */
export interface Landing {
    readonly state: BallState;
    readonly outcome: LandingOutcome;
    /** The contact's duration (s), the centre's horizontal travel in it (m) and its deepest δ = R − z (m). */
    readonly duration: number;
    readonly travel: number;
    readonly peakDepth: number;
    /** Steps integrated, and bed columns visited: the landing's cost. */
    readonly steps: number;
    readonly visits: number;
}

/**
 * Lands ball state `s` (its centre over the touchdown point, moving down) on a fresh bed of law `law` (see the file
 * header). `cap` (s) exists for tests.
 */
export function land(s: BallState, ball: BallParams, gravity: number, law: BedLaw, cap = LANDING_CAP): Landing {
    const R = ball.radius;
    const dt = IMPACT_DT;
    const inertia = 0.4 * ball.mass * R * R;
    const weight = vec3(0, 0, 0 - ball.mass * gravity);
    const touchdown = vec3(s.position.x, s.position.y, R);
    const bed = newBallBed(law, dt);
    const fresh = freshBed(touchdown.x, touchdown.y, R, law);
    let state: BallState = { ...s, position: touchdown };
    let steps = 0;
    let peak = 0;
    let outcome: LandingOutcome;
    for (;;) {
        const load = bedLoad(bed, state, R, dt);
        const force = load === null ? weight : add(weight, load.force);
        const velocity = add(state.velocity, scale(force, dt / ball.mass));
        const spin =
            load === null ? state.angularVelocity : add(state.angularVelocity, scale(load.torque, dt / inertia));
        state = { position: add(state.position, scale(velocity, dt)), velocity, angularVelocity: spin };
        bedRelax(bed);
        steps++;
        peak = Math.max(peak, R - state.position.z);
        if (load === null && velocity.z > 0) {
            outcome = "left";
            break;
        }
        if (load !== null && !isBouncing(fresh, ball.mass, gravity, velocity.z, R - state.position.z)) {
            outcome = "settled";
            break;
        }
        if (steps * dt >= cap) {
            outcome = "capped";
            break;
        }
    }
    const leaves = outcome === "left" && state.velocity.z >= SETTLE_SPEED;
    return {
        state: {
            position: touchdown,
            velocity: leaves ? state.velocity : horizontal(state.velocity),
            angularVelocity: state.angularVelocity,
        },
        outcome: outcome === "left" && !leaves ? "settled" : outcome,
        duration: steps * dt,
        travel: length(horizontal(sub(state.position, touchdown))),
        peakDepth: peak,
        steps,
        visits: bed.visits,
    };
}
