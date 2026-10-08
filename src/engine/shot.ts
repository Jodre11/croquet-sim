/**
 * A whole shot (P2b.2b.1 design §6). The swing model builds the contact, the impact integrates it, the fault judge
 * rules on it, and phase 2 rolls the balls out. Phase 2 always runs: impact flags and findings are information, as
 * phase 2's jump flag is. `judgeHoopRun` stays a separate call on the phase 2 result.
 */
import { CONTACT_TOLERANCE } from "./detect";
import { judgeFaults, type FaultReport, type StrokeContext } from "./faults";
import { ballPairKey } from "./impact/contacts";
import { simulateImpact, simulateStroke } from "./impact/simulateImpact";
import type { ContactState, ImpactResult } from "./impact/types";
import { sinCos } from "./math/elementary";
import { horizontal, length, normalize, sub, vec3 } from "./math/vec3";
import { simulateFreeMotion } from "./simulate";
import { planStroke, type SwingApproach } from "./swing/buildContact";
import { strokeTrajectory, type SwingTrajectory } from "./swing/trajectory";
import { CROQUET_STROKES, type ShotSetup } from "./swing/types";
import { BALL_IDS, type BallId, type BallState, type ShotResult, type World } from "./types";
import { defaultWorld, validateWorld } from "./world";

/** simulateShot's options (P2b.2b.2a design §5.1). */
export interface ShotOptions {
    /**
     * Integrate the follow-through and return the whole stroke's trajectory (default false). It costs up to a second
     * of tracked steps, which the P5 budget does not afford on every shot.
     */
    readonly trajectory?: boolean;
}

/** Everything a shot produced, stage by stage (design §6.1). */
export interface ShotOutcome {
    readonly contact: ContactState;
    /** The downswing's lowest clearance over the turf before contact, and when (P2b.2b.2a design §3.5). */
    readonly approach: SwingApproach;
    /**
     * The head's planned speed at contact (m/s; P2b.2b.2a design §3.4), from the contact-free downswing.
     * `contact.velocity` is the head's where the impact starts, a lead before contact.
     */
    readonly contactSpeed: number;
    readonly context: StrokeContext;
    readonly impact: ImpactResult;
    readonly faults: FaultReport;
    readonly motion: ShotResult;
    /** The whole stroke from the backswing's top to the finish, with `trajectory: true` (P2b.2b.2a design §4.3). */
    readonly trajectory?: SwingTrajectory;
}

function fail(message: string): never {
    throw new RangeError(message);
}

/**
 * Checks a setup before the swing model sees it (design §6.2): the striker present; `live` holding only present balls,
 * never the striker, no duplicates; a croquet stroke's croqueted ball present, not the striker, touching the striker
 * (within CONTACT_TOLERANCE); no croqueted ball in a single-ball stroke.
 */
function validateSetup(setup: ShotSetup, world: World): void {
    const { balls, striker, croqueted } = setup;
    const strikerBall = balls[striker];
    if (!strikerBall) {
        fail(`striker ${striker} is not in the setup`);
    }
    const seen: BallId[] = [];
    for (const id of setup.live) {
        if (!balls[id]) {
            fail(`live ball ${id} is not in the setup`);
        }
        if (id === striker) {
            fail(`the striker ${striker} cannot be live`);
        }
        if (seen.includes(id)) {
            fail(`live ball ${id} is listed twice`);
        }
        seen.push(id);
    }
    const { type } = setup.stroke;
    if (!CROQUET_STROKES.includes(type)) {
        if (croqueted !== undefined) {
            fail(`croqueted is given only for a croquet stroke (got ${type})`);
        }
        return;
    }
    if (croqueted === undefined) {
        fail(`a ${type} stroke needs a croqueted ball`);
    }
    if (croqueted === striker) {
        fail(`the croqueted ball cannot be the striker ${striker}`);
    }
    const other = balls[croqueted];
    if (!other) {
        fail(`croqueted ball ${croqueted} is not in the setup`);
    }
    const gap = length(sub(other.position, strikerBall.position)) - 2 * world.ball.radius;
    if (!(gap <= CONTACT_TOLERANCE)) {
        fail(`croqueted ball ${croqueted} must touch the striker (gap ${gap} m)`);
    }
}

/**
 * The fault judge's context for `setup`, given its impact (design §6.3): the kind of stroke; whether the striker's
 * ball is in a group (Glossary, "Group of balls", over the ball–ball pairs touching at the start); the swing direction;
 * and, for a croquet stroke, the line of centres from the setup's starting positions.
 */
export function strokeContext(setup: ShotSetup, impact: ImpactResult): StrokeContext {
    const { striker, balls } = setup;
    const present = BALL_IDS.filter((id) => balls[id] !== undefined);
    const touching = (a: BallId, b: BallId): boolean => a !== b && impact.touchingAtStart.includes(ballPairKey(a, b));
    const croquet = CROQUET_STROKES.includes(setup.stroke.type);
    // A 3-ball group is one ball touching two others, a 4-ball group a fourth touching a 3-ball group: the striker's
    // ball is in one exactly when the balls it is connected to by touching pairs number three or more.
    const connected: BallId[] = [striker];
    for (let i = 0; i < connected.length; i++) {
        for (const id of present) {
            if (!connected.includes(id) && touching(connected[i] as BallId, id)) {
                connected.push(id);
            }
        }
    }
    const touchingAny = present.some((id) => touching(striker, id));
    const kind = croquet ? "croquet" : setup.continuation && touchingAny ? "continuation-touching" : "single-ball";
    const [s, c] = sinCos(setup.stroke.aim);
    const context: StrokeContext = {
        striker,
        kind,
        live: setup.live,
        hampered: setup.hampered,
        jumpAttempt: setup.jumpAttempt,
        group: connected.length >= 3,
        aim: vec3(c, s, 0),
    };
    if (!croquet) {
        return context;
    }
    const croqueted = setup.croqueted as BallId;
    const from = (balls[striker] as BallState).position;
    const to = (balls[croqueted] as BallState).position;
    return { ...context, croqueted, lineOfCentres: normalize(horizontal(sub(to, from))) };
}

/**
 * Simulates a whole shot (design §6.1; P2b.2b.2a design §5.1): checks the setup, then runs planStroke, simulateImpact
 * (simulateStroke with `trajectory`), strokeContext, judgeFaults and simulateFreeMotion(impact.handover) in that
 * order, and with `trajectory` stitches the whole stroke. A passed `world` wins: `setup.lawnSpeed` is then neither
 * read nor checked; without one it must suit defaultWorld (P2b.2b.2a design §9). Throws the named RangeError of
 * whichever stage rejects the input: a lawn speed that is not positive or that the default world cannot use, a setup
 * check (design §6.2), the swing model's checks, or the impact's.
 */
export function simulateShot(setup: ShotSetup, world?: World, options: ShotOptions = {}): ShotOutcome {
    if (world === undefined && (!(setup.lawnSpeed > 0) || !Number.isFinite(setup.lawnSpeed))) {
        fail(`lawnSpeed must be a positive finite number (got ${setup.lawnSpeed})`);
    }
    const w = world ?? defaultWorld(setup.lawnSpeed);
    validateWorld(w);
    validateSetup(setup, w);
    const { contact, approach, contactSpeed } = planStroke(setup, w);
    let impact: ImpactResult;
    let trajectory: SwingTrajectory | undefined;
    if (options.trajectory === true) {
        const stroke = simulateStroke(contact, setup.balls, w);
        impact = stroke.result;
        trajectory = strokeTrajectory(contact, stroke.follow, w.gravity);
    } else {
        impact = simulateImpact(contact, setup.balls, w);
    }
    const context = strokeContext(setup, impact);
    const faults = judgeFaults(context, impact);
    const motion = simulateFreeMotion(impact.handover, w);
    return {
        contact,
        approach,
        contactSpeed,
        context,
        impact,
        faults,
        motion,
        ...(trajectory === undefined ? {} : { trajectory }),
    };
}
