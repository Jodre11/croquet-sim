/**
 * The follow-through's harness (P2b.2b.2c.2d design §3.4, §3.5): what the probe (scripts/followThroughProbe.ts) and the
 * tests read from a stroke, so that both agree by construction. A follow-through can reach the balls by three routes,
 * each recorded apart:
 * - before contact: the head's speed along aim, its contact point and the shaft's lean at the first touch (firstTouch);
 * - within the strike: each tap before the balls part, with the face's impulse on the striker's ball along aim and its
 *   share of the striker's momentum as Gugan read it (routesOf);
 * - after the parting: each re-contact as the fault judge groups it, with its effect (routesOf).
 * It also solves the backswing for a contact speed rather than a planned one (backswingForContact), for strokes whose
 * pulse acts before contact, and reads how far the head's lowest point at contact lies above the turf (turfLimited).
 * Every stroke is judged as simulateShot judges it: planStroke, simulateImpact, strokeContext and judgeFaults, then
 * the free motion from the handover. Not part of the engine.
 */
import { judgeFaults, type FaultReport, type ReContact } from "../src/engine/faults";
import { ballPairKey, faceKey, headLowestPoint } from "../src/engine/impact/contacts";
import type { ImpactProbe, ImpactSnapshot } from "../src/engine/impact/integrate";
import { rotate } from "../src/engine/impact/rigidBody";
import { faceHalfHeight } from "../src/engine/impact/shape";
import { simulateImpact } from "../src/engine/impact/simulateImpact";
import type { ContactInterval, HeadState, ImpactResult } from "../src/engine/impact/types";
import { add, dot, horizontal, length, scale, sub, vec3, type Vec3 } from "../src/engine/math/vec3";
import { strokeContext } from "../src/engine/shot";
import { simulateFreeMotion } from "../src/engine/simulate";
import {
    contactPose,
    headShapeOf,
    planStroke,
    plannedSpeed,
    stanceLean,
    type StrokePlan,
} from "../src/engine/swing/buildContact";
import { MAX_BACK_ANGLE } from "../src/engine/swing/downswing";
import type { ShotSetup } from "../src/engine/swing/types";
import { BALL_IDS, type BallState, type ShotResult, type World } from "../src/engine/types";
import { swingReference } from "../src/reference/index";
import { ratioOf, readSamples, readTimeOf } from "./ratioFit";

/**
 * The stroke as the head first meets the striker's ball (design §3.4, route 1), at the state that opens the first
 * face–ball interval on the striker (the step before its first step in contact): `contactSpeed` the head's velocity
 * along the arc's aim (m/s); `up` the ball's centre from the face's centre along the face's upward axis (m); `lean`
 * the shaft's lean (rad, forward positive, the face pitched down); `t` the interval's start (s from the impact's
 * start); and `plannedSpeed` the planner's contact speed (plannedSpeed, m/s).
 */
export interface FirstTouch {
    readonly contactSpeed: number;
    readonly up: number;
    readonly lean: number;
    readonly t: number;
    readonly plannedSpeed: number;
}

/**
 * One tap before the balls part (design §3.4, route 2): its start (s), the face's impulse on the striker's ball along
 * aim over it (N·s) and that impulse's share of the striker's ball's momentum along aim as Gugan read it, m_ball·w₁.
 */
export interface RouteTap {
    readonly start: number;
    readonly impulse: number;
    readonly share: number;
}

/**
 * A stroke's three routes (design §3.4): its first touch (null with no face contact on the striker), its taps before
 * the parting, its re-contacts from the parting on as the judge groups them (FaultReport.strike), and its croquet
 * ratio (NaN with no first touch).
 */
export interface Routes {
    readonly touch: FirstTouch | null;
    readonly taps: readonly RouteTap[];
    readonly recontacts: readonly ReContact[];
    readonly ratio: number;
}

/**
 * One impact step as the harness records it, at its end t (s): the head centre's speed along aim (m/s), the head's
 * lowest point above the turf (m, negative in it), the striker's and the second ball's horizontal speeds w₁ and v₂
 * (m/s), the striker's ball's speed along aim (m/s), the bottom hand's force on the head along aim (N; NaN where
 * the step carries no hand record), and the push intent's magnitude (N; 0 where it is nil, NaN where the step
 * carries no hand record).
 */
export interface RouteSample {
    readonly t: number;
    readonly head: number;
    readonly lowest: number;
    readonly w1: number;
    readonly v2: number;
    readonly ball: number;
    readonly bottom: number;
    readonly intent: number;
}

/**
 * A stroke played for its routes: the setup played, the routes, the plan, the impact, the judge's report, every step's
 * sample, the arc's aim, and the strike read as Gugan read it (readTimeOf, readSamples; null with no face contact on
 * the striker).
 */
export interface RouteRun {
    readonly setup: ShotSetup;
    readonly routes: Routes;
    readonly plan: StrokePlan;
    readonly impact: ImpactResult;
    readonly faults: FaultReport;
    readonly samples: readonly RouteSample[];
    readonly aim: Vec3;
    readonly read: { readonly w1: number; readonly v2: number; readonly time: number; readonly open: boolean } | null;
}

/** A step's push intent's magnitude (N): 0 where it is nil, NaN where the step carries no hand record. */
function intentOf(s: ImpactSnapshot): number {
    if (s.hand === undefined) {
        return NaN;
    }
    return s.hand.intent === undefined ? 0 : length(s.hand.intent);
}

/** Thrown by firstTouch's probe to end an impact once the first touch is read; never escapes this file. */
class Touched extends Error {}

/** The head and the striker's ball at the state that opens a step, with the step's start (s). */
interface OpeningState {
    readonly t: number;
    readonly head: HeadState;
    readonly ball: BallState;
}

/**
 * A probe that keeps the state opening each step and records the first one whose step closes the face on the
 * striker, calling `found` with it. The state opening the impact's first step is the contact state's.
 */
function touchProbe(
    setup: ShotSetup,
    plan: StrokePlan,
    found: (opening: OpeningState) => void,
): (s: ImpactSnapshot) => void {
    const key = faceKey(setup.striker);
    const striker = BALL_IDS.filter((id) => setup.balls[id] !== undefined).indexOf(setup.striker);
    const { contact } = plan;
    let opening: OpeningState = { t: 0, head: contact, ball: setup.balls[setup.striker] as BallState };
    let seen = false;
    return (s) => {
        if (!seen && s.contacts.some((c) => c.key === key)) {
            seen = true;
            found(opening);
        }
        opening = { t: s.t, head: s.head, ball: s.balls[striker] as BallState };
    };
}

/** The first touch read from its opening state, on the head `plan` carries, along `aim`. */
function touchOf(opening: OpeningState, plan: StrokePlan, aim: Vec3, planned: number): FirstTouch {
    const { head, ball, t } = opening;
    const face = rotate(head.orientation, vec3(1, 0, 0));
    const upward = rotate(head.orientation, vec3(0, 0, 1));
    const faceCentre = add(head.position, scale(face, plan.contact.head.length / 2));
    return {
        contactSpeed: dot(head.velocity, aim),
        up: dot(sub(ball.position, faceCentre), upward),
        lean: Math.atan2(0 - face.z, length(horizontal(face))),
        t,
        plannedSpeed: planned,
    };
}

/** `plan`'s arc's aim; throws a RangeError naming the stroke when its contact has no tracked drive. */
function aimOf(setup: ShotSetup, plan: StrokePlan): Vec3 {
    const { drive } = plan.contact;
    if (drive.kind !== "track") {
        throw new RangeError(`followThrough: the ${setup.stroke.type} stroke's planned contact has no tracked drive`);
    }
    return drive.arc.aim;
}

/**
 * `setup`'s first touch on `world` (FirstTouch), or null when the head never meets the striker's ball. The impact is
 * ended at the first touch, so a stroke that strikes costs only its approach; one that does not runs to the impact's
 * end. Throws planStroke's checks.
 */
export function firstTouch(setup: ShotSetup, world: World): FirstTouch | null {
    const plan = planStroke(setup, world);
    const aim = aimOf(setup, plan);
    let touch: FirstTouch | null = null;
    const step = touchProbe(setup, plan, (opening) => {
        touch = touchOf(opening, plan, aim, plannedSpeed(setup, world));
        throw new Touched();
    });
    try {
        simulateImpact(plan.contact, setup.balls, world, { probe: { step } });
    } catch (error) {
        if (!(error instanceof Touched)) {
            throw error;
        }
    }
    return touch;
}

/**
 * backswingFor's bracket on `setup`'s backswing (m) on `world`, to the bit, so that both solve over the same
 * backswings: `top` the MAX_BACK_ANGLE bound, and `reach` the most the body reaches, the bound at its θ_max on a
 * slope not fully held and `top` otherwise.
 */
export function backswingBracket(setup: ShotSetup, world: World): { readonly top: number; readonly reach: number } {
    const { stroke, profile } = setup;
    const { type } = stroke;
    const stance = profile.stance[type];
    const shape = profile.shape[type];
    const rho = faceHalfHeight(headShapeOf(profile.mallet.head));
    const lever = rho + stance.top;
    const lean = stanceLean(stance.handsAhead, stance.top, stroke.contact.up, {
        ballRadius: world.ball.radius,
        headLength: profile.mallet.headLength,
        faceHalfHeight: rho,
    });
    const reachOf = (angle: number): number =>
        shape.pendulumShare > 0 ? ((lever * (Math.cos(lean) - Math.cos(angle))) / shape.pendulumShare) * (1 - 1e-9) : 2;
    const top = reachOf(MAX_BACK_ANGLE);
    const reach = shape.slopeHold < 1 ? Math.min(top, reachOf(profile.body.backswingLimit)) : top;
    return { top, reach };
}

/** Numerical, not physical: backswingForContact's halvings of its bracket, to a double's resolution on about 1 m. */
const CONTACT_BISECTIONS = 50;

/**
 * The backswing (m) at which `setup`'s contact speed (firstTouch) is `speed` (m/s) on `world`: bisection over the
 * bracket backswingFor (tests/engine/support/shot.ts) uses, (0, the MAX_BACK_ANGLE bound], at the setup's intensity,
 * CONTACT_BISECTIONS halvings, the least found that reaches the speed. A backswing whose head never meets the ball
 * reaches 0 m/s, as the head at rest does at backswing 0; on a slope not fully held a midpoint beyond the body's θ_max
 * counts as reaching the speed, and the bracket's top is the speed at θ_max. Throws a RangeError naming both ends'
 * contact speeds when `speed` lies outside them, never returning an end, and planStroke's other checks.
 */
export function backswingForContact(setup: ShotSetup, speed: number, world: World): number {
    const { stroke } = setup;
    const { type } = stroke;
    const { top, reach } = backswingBracket(setup, world);
    const at = (backswing: number): number => {
        try {
            return firstTouch({ ...setup, stroke: { ...stroke, backswing } }, world)?.contactSpeed ?? 0;
        } catch (error) {
            if (error instanceof RangeError && error.message.includes("θ_max")) {
                return Infinity;
            }
            throw error;
        }
    };
    const most = at(reach);
    if (!(speed > 0 && speed <= most)) {
        throw new RangeError(
            `backswingForContact: ${speed} m/s lies outside the ${type} stroke's contact speeds, 0 m/s at ` +
                `backswing 0 (the head at rest) to ${most} m/s at ${reach} m`,
        );
    }
    let lo = 0;
    let hi = top;
    for (let i = 0; i < CONTACT_BISECTIONS; i++) {
        const mid = (lo + hi) / 2;
        if (at(mid) < speed) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    if (hi === top) {
        throw new RangeError(`backswingForContact: no backswing below ${top} m reached ${speed} m/s`);
    }
    return hi;
}

/** Numerical, not physical: strokeForContact's halvings of the intensity over [0, 1], to a double's resolution. */
const INTENSITY_BISECTIONS = 60;

/**
 * The stroke inputs whose contact speed (firstTouch) is `speed` (m/s) on `world`: strokeFor's regimes
 * (tests/engine/support/shot.ts) with the contact speed in place of the planned one, so that a player who plans a
 * brake before contact swings for the speed they want at the ball (P2b.2b.2c.2d design §6). A setup that gives an
 * intensity, or a held-slope one, takes backswingForContact's backswing at it. Otherwise, on a slope not fully held,
 * from the
 * preset's defaultBackswing h_0: the backswing at intensity 0 when `speed` is within h_0's reach there; h_0 and the
 * intensity solved by bisection over [0, 1] (INTENSITY_BISECTIONS halvings, the least found that reaches the speed)
 * when it is within h_0's reach at intensity 1; else intensity 1 and the backswing solved at it. Throws
 * backswingForContact's RangeError beyond the last.
 */
export function strokeForContact(
    setup: ShotSetup,
    speed: number,
    world: World,
): { readonly backswing: number; readonly intensity?: number } {
    const { stroke, profile } = setup;
    const { type } = stroke;
    if (stroke.intensity !== undefined || profile.shape[type].slopeHold === 1) {
        return { backswing: backswingForContact(setup, speed, world) };
    }
    const backswing = swingReference[type].defaultBackswing.value;
    const at = (intensity: number): number =>
        firstTouch({ ...setup, stroke: { ...stroke, backswing, intensity } }, world)?.contactSpeed ?? 0;
    if (speed <= at(0)) {
        return { backswing: backswingForContact(setup, speed, world) };
    }
    if (speed > at(1)) {
        const full = { ...setup, stroke: { ...stroke, intensity: 1 } };
        return { backswing: backswingForContact(full, speed, world), intensity: 1 };
    }
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < INTENSITY_BISECTIONS; i++) {
        const mid = (lo + hi) / 2;
        if (at(mid) < speed) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    return { backswing, intensity: hi };
}

/**
 * The head's lowest point above the turf (m, negative in it) at `setup`'s contact pose on `world` (contactPose,
 * headLowestPoint), the static pose planStroke rejects when it is negative (design §3.5, the turf's limit).
 */
export function turfLimited(setup: ShotSetup, world: World): number {
    const pose = contactPose(setup, world);
    const still = vec3(0, 0, 0);
    return headLowestPoint(
        { position: pose.headCentre, orientation: pose.orientation, velocity: still, angularVelocity: still },
        pose.head,
    );
}

/**
 * `setup` played on `world` for its routes (RouteRun): planStroke, simulateImpact with a probe recording every step,
 * strokeContext and judgeFaults as simulateShot runs them, then simulateFreeMotion from the handover for the ratio.
 * The second ball is the croqueted one, else the first live one, else none (v₂ 0). Each tap's share is its impulse
 * along aim over m_ball·w₁, w₁ read as Gugan read it (readTimeOf, readSamples). Throws planStroke's checks, and
 * ratioOf's for a struck stroke whose striker's ball does not move.
 */
export function playRoutes(setup: ShotSetup, world: World): RouteRun {
    const plan = planStroke(setup, world);
    const aim = aimOf(setup, plan);
    const ids = BALL_IDS.filter((id) => setup.balls[id] !== undefined);
    const striker = ids.indexOf(setup.striker);
    const otherId = setup.croqueted ?? setup.live[0];
    const other = otherId === undefined ? -1 : ids.indexOf(otherId);
    const speedOf = (ball: BallState | undefined): number =>
        ball === undefined ? 0 : length(horizontal(ball.velocity));
    let opening: OpeningState | null = null;
    const touchStep = touchProbe(setup, plan, (o) => {
        opening = o;
    });
    const samples: RouteSample[] = [];
    const head = plan.contact.head;
    const probe: ImpactProbe = {
        step(s) {
            touchStep(s);
            const ball = s.balls[striker] as BallState;
            samples.push({
                t: s.t,
                head: dot(s.head.velocity, aim),
                lowest: headLowestPoint(s.head, head),
                w1: speedOf(ball),
                v2: other < 0 ? 0 : speedOf(s.balls[other]),
                ball: dot(ball.velocity, aim),
                bottom: s.hand === undefined ? NaN : dot(s.hand.bottom, aim),
                intent: intentOf(s),
            });
        },
    };
    const impact = simulateImpact(plan.contact, setup.balls, world, { probe });
    const faults = judgeFaults(strokeContext(setup, impact), impact);
    const opened = opening as OpeningState | null;
    const touch = opened === null ? null : touchOf(opened, plan, aim, plannedSpeed(setup, world));
    const face = impact.timeline[faceKey(setup.striker)] ?? [];
    const pair = otherId === undefined ? [] : (impact.timeline[ballPairKey(setup.striker, otherId)] ?? []);
    const first = face[0];
    let read: RouteRun["read"] = null;
    if (first !== undefined) {
        const timed = readTimeOf(face, pair);
        const speeds = readSamples(samples, first.start, timed.time);
        read = { w1: speeds.w1, v2: speeds.v2, time: speeds.time, open: timed.open };
    }
    const momentum = world.ball.mass * (read?.w1 ?? NaN);
    const taps = (faults.strike?.taps ?? []).map((tap: ContactInterval) => {
        const impulse = tap.impulse === undefined ? NaN : dot(tap.impulse, aim);
        return { start: tap.start, impulse, share: impulse / momentum };
    });
    let ratio = NaN;
    if (touch !== null && setup.croqueted !== undefined) {
        const motion: ShotResult = simulateFreeMotion(impact.handover, world);
        ratio = ratioOf(setup, motion);
    }
    return {
        setup,
        routes: { touch, taps, recontacts: faults.strike?.recontacts ?? [], ratio },
        plan,
        impact,
        faults,
        samples,
        aim,
        read,
    };
}

/** `setup`'s routes on `world` (playRoutes' Routes). */
export function routesOf(setup: ShotSetup, world: World): Routes {
    return playRoutes(setup, world).routes;
}
