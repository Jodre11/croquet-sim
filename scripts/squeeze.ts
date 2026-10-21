/**
 * The search's tools (P2b.2b.2c.2b design §4): the free-collision harness and a candidate's verdict. freeCollision
 * plays a ball–ball law alone through `integrate(isolated(…))`, as tests/engine/impact/analytic.test.ts does: two balls
 * of the default world's, one moving, no head contact, no turf and no gravity. It reports the law's own contact time
 * and the contact as Gugan 4's video would time it, from the struck ball's displacement first exceeding VISIBLE_SHIFT
 * to the pair's gap first exceeding it (plan decision 6). scripts/croquetFitProbe.ts's section I judges each candidate
 * with them.
 */
import type { PairLaw } from "../src/engine/impact/contactLaw";
import { IMPACT_DT, integrate, type ImpactProbe } from "../src/engine/impact/integrate";
import { ballPairKey } from "../src/engine/impact/contacts";
import { length, sub, vec3 } from "../src/engine/math/vec3";
import type { BallState } from "../src/engine/types";
import { defaultWorld } from "../src/engine/world";
import { freeBall, isolated } from "../tests/engine/support/impact";
import { VISIBLE_SHIFT } from "./filmedStrokes";

/** Numerical, not physical: the free collision's start gap (m), so that the pair opens at t = 0 (analytic.test.ts). */
const START_GAP = 1e-5;

/**
 * Numerical, not physical: the free collision's end (s). The integrator runs an isolated set-up to its cap (no face
 * ever closes); 4 ms covers a 0.75 ms contact and the separating balls' gap reaching VISIBLE_SHIFT at any Table 1
 * speed.
 */
const FREE_CAP = 4e-3;

/**
 * A free collision of the default world's balls under `law` at `speed` (m/s), at `o.dt`'s step (default the engine's
 * IMPACT_DT): the restitution (the balls' separating speed over `speed` at the end), the law's contact time (s; the
 * steps with a positive normal force, times the step) and the video's (s; from the struck ball's displacement first
 * exceeding VISIBLE_SHIFT to the pair's gap first exceeding it). Throws a RangeError when the video never sees the
 * contact end within FREE_CAP.
 */
export function freeCollision(
    speed: number,
    law: PairLaw,
    o: { readonly dt?: number } = {},
): { readonly restitution: number; readonly contactTime: number; readonly videoTime: number } {
    const world = defaultWorld();
    const R = world.ball.radius;
    const dt = o.dt ?? IMPACT_DT;
    const home = vec3(2 * R + START_GAP, 0, 1);
    const key = ballPairKey("blue", "red");
    const seen: { closed: number; moved: number | null; parted: number | null } = {
        closed: 0,
        moved: null,
        parted: null,
    };
    const probe: ImpactProbe = {
        step(s) {
            if (s.contacts.some((c) => c.key === key && c.normalForce > 0)) {
                seen.closed++;
            }
            const [striker, struck] = s.balls as readonly [BallState, BallState];
            if (seen.moved === null && length(sub(struck.position, home)) > VISIBLE_SHIFT) {
                seen.moved = s.t;
            }
            const gap = length(sub(struck.position, striker.position)) - 2 * R;
            if (seen.moved !== null && seen.parted === null && gap > VISIBLE_SHIFT) {
                seen.parted = s.t;
            }
        },
    };
    const run = integrate(
        isolated({
            ballBall: law,
            ball: world.ball,
            balls: [freeBall("blue", vec3(0, 0, 1), vec3(speed, 0, 0)), freeBall("red", home)],
        }),
        { dt, cap: FREE_CAP, probe },
    );
    if (seen.moved === null || seen.parted === null) {
        throw new RangeError(`freeCollision: at ${speed} m/s the video never saw the contact end within ${FREE_CAP} s`);
    }
    const separating = (run.balls.red?.velocity.x as number) - (run.balls.blue?.velocity.x as number);
    return { restitution: separating / speed, contactTime: seen.closed * dt, videoTime: seen.parted - seen.moved };
}

/** A candidate's verdict (design §4.1): each test it was judged on, in order, with its figures and pass or miss. */
export interface CandidateResult {
    readonly name: string;
    readonly tests: readonly { readonly test: number; readonly pass: boolean; readonly text: string }[];
}

/** True when the candidate passes every test it was judged on; false for one judged on none. */
export function passes(r: CandidateResult): boolean {
    return r.tests.length > 0 && r.tests.every((t) => t.pass);
}
