/**
 * One plan of the rolls' push map, played once (P2b.2b.2c.3b design §3.1, §3.5, §4, A2 items 1–2; plan
 * `docs/superpowers/plans/2026-10-29-p2b2b2c3b-push-map.md`, Task 3 and decisions 1, 4, 5, 6 and 11). A plan is the
 * set-up (lean, feet), the follow-through (drive, handReach, window), the hands' onset and, on the pass roll, the
 * split; how hard is one number, the power p in [0, 2]: the backswing p·h_body up to the body's limit, then the
 * intensity p − 1 at it. Each sample is classified by the first of §3.5's classes that applies, in decision 5's order,
 * and read on every lawn from one impact on the 10 s open lawn (decision 3, settled by Task 2 as a shared impact).
 * Not part of the engine.
 */
import { EFFECT_ANGLE, EFFECT_SPEED, judgeFaults, type FaultReport, type StrikeTaps } from "../src/engine/faults";
import { offPointReason, onPoint, type OnPoint, type OnPointStep } from "../src/engine/impact/band";
import { faceKey } from "../src/engine/impact/contacts";
import type { ImpactProbe } from "../src/engine/impact/integrate";
import { faceHalfHeight } from "../src/engine/impact/shape";
import { simulateStroke } from "../src/engine/impact/simulateImpact";
import type { ContactInterval } from "../src/engine/impact/types";
import { atan2 } from "../src/engine/math/elementary";
import { ZERO, add, cross, dot, horizontal, length, sub, vec3, type Vec3 } from "../src/engine/math/vec3";
import { strokeContext } from "../src/engine/shot";
import { simulateFreeMotion } from "../src/engine/simulate";
import {
    downswingInputOf,
    headShapeOf,
    planStroke,
    plannedSpeed,
    stanceLean,
    type StrokePlan,
} from "../src/engine/swing/buildContact";
import { requiredCouple } from "../src/engine/swing/downswing";
import { DEFAULT_DRIVE, DEFAULT_TIMING, defaultProfile } from "../src/engine/swing/profile";
import type { ShotSetup } from "../src/engine/swing/types";
import { BALL_IDS, type BallId, type BallState, type World } from "../src/engine/types";
import {
    CANONICAL_STRIKER,
    DEFAULT_CROQUET_GAP,
    canonicalSetup,
    type CanonicalOptions,
} from "../tests/engine/support/shot";
import { openWorld, opened } from "./openLawn";
import { travelOf } from "./ratioFit";
import { feetReading } from "./setupProbe";

/** The map's three types (design §1). */
export const ROLL_TYPES = ["half-roll", "full-roll", "pass-roll"] as const;
export type RollType = (typeof ROLL_TYPES)[number];

/** One plan (spec §3.1, A4): rad, m, 1, m, s, s, rad, 1. */
export interface MapPlan {
    readonly lean: number;
    readonly feet: number;
    readonly drive: number;
    readonly handReach: number;
    readonly window: number;
    readonly onset: number;
    readonly split: number;
    /** The pendulum's push gain, profile.drive[type].speedGain (A4): swept on the full roll, else the preset's. */
    readonly speedGain: number;
}

/** §3.5's classes (A2 item 2 adds unreachable), in decision 5's order. */
export type MapClass = "unreachable" | "superhuman" | "mishit" | "turf" | "unlawful";

/** One lawn's reading of a sample. */
export interface LawnRead {
    readonly range: number;
    readonly ratio: number;
    readonly splitAtRest: number;
}

/** One plan played at one power (decision 4). */
export interface MapSample {
    readonly power: number;
    readonly klass: MapClass | null;
    /** The first failing check's text (the event, flag, finding or message). */
    readonly reason: string | null;
    /** Per lawn speed (s): the range (m), the ratio and the split at rest (rad); NaN where unplayed. */
    readonly byLawn: Readonly<Record<number, LawnRead>>;
    /** %: plannedSpeed over its value at maxPower (decision 1). */
    readonly strokeEffort: number;
    /** %: the push intent's peak over pushForce. */
    readonly pushEffort: number;
    /** requiredCouple's peak over C; 0 at λ 0. */
    readonly coupleShare: number;
    /** N·s: the push intent's time integral. */
    readonly pushImpulse: number;
    readonly effectVerdicts: { readonly shipped: boolean; readonly contactOnly: boolean };
    readonly followCap: boolean;
}

/** The lawn the impact is played on (s): decision 3's shared impact, the normal lawn. */
const IMPACT_LAWN = 10;

/** The open world of the impact, and of the setup's geometry (the ball is the same on every lawn). */
const IMPACT_WORLD = openWorld(IMPACT_LAWN);

/** The most power (decision 1): the backswing at the body's limit and intensity 1. */
const POWER_LIMIT = 2;

/**
 * Numerical, not physical: the relative margin h_body keeps inside θ_max, as backswingBracket's reachOf keeps it, so
 * that round-off in the planner's cos θ_c − s·h/ℓ_h never takes the backswing at h_body past the body's limit.
 */
const BODY_MARGIN = 1e-9;

/** Numerical, not physical: maxPower's halvings of [1, 2] (decision 1), to about 1e-9 of the power. */
const POWER_BISECTIONS = 30;

/**
 * Numerical, not physical: the relative slack within which a probe step's end counts as at or before an interval's
 * time, for steps that are whole multiples of dt computed by a different product.
 */
const STEP_SLACK = 1e-9;

/**
 * The text book's plan of `type` (decision 8; spec §3.1): the preset's lean at its canonical contact (stanceLean), its
 * feet as feetReading reads the canonical setup on the open lawn, its default drive, handReach and window, the hands
 * on time and, on the pass roll, canonicalSetup's 20° split.
 */
export function textBook(type: RollType): MapPlan {
    const setup = opened(canonicalSetup(type));
    const stance = defaultProfile.stance[type];
    const { mallet } = defaultProfile;
    const lean = stanceLean(stance.handsAhead, stance.top, setup.stroke.contact.up, {
        ballRadius: IMPACT_WORLD.ball.radius,
        headLength: mallet.headLength,
        faceHalfHeight: faceHalfHeight(headShapeOf(mallet.head)),
    });
    const push = defaultProfile.drive[type];
    return {
        lean,
        feet: feetReading(setup, IMPACT_WORLD).lowPoint,
        drive: DEFAULT_DRIVE[type],
        handReach: push.handReach,
        window: push.window,
        onset: DEFAULT_TIMING[type].hands,
        split: type === "pass-roll" ? (20 * Math.PI) / 180 : 0,
        speedGain: push.speedGain,
    };
}

/**
 * `type`'s canonical setup with `over` (canonicalSetup), playing `plan` at power `power`, on the open lawn (decisions 1
 * and 6): the croqueted ball `split` to the left of aim at 2R + the croquet gap from the striker, as canonicalSetup
 * places the pass roll's at 20°; the plan's lean, feet, drive, handReach, window, the hands' onset and the profile's
 * speedGain for `type` (A4); the backswing
 * p·h_body for p ≤ 1, else h_body and the intensity p − 1 (bodyBackswing). `over` is for tests of another profile:
 * its profile and stance fields only (stance, drive, shape, mallet, body, croquetGap). The map's world is the open
 * lawn and its stroke the plan's, so an `over` giving `world` or `stroke` throws an Error.
 */
export function mapSetup(type: RollType, plan: MapPlan, power: number, over: CanonicalOptions = {}): ShotSetup {
    if (over.world !== undefined || over.stroke !== undefined) {
        throw new Error("mapSetup: `over` gives the profile and stance only, not a world or a stroke");
    }
    const base = canonicalSetup(type, over);
    const R = IMPACT_WORLD.ball.radius;
    const line = base.stroke.aim + plan.split;
    const reach = 2 * R + (over.croquetGap ?? DEFAULT_CROQUET_GAP);
    const croqueted = base.croqueted as BallId;
    const { x, y } = CANONICAL_STRIKER;
    const placed: ShotSetup = {
        ...base,
        profile: {
            ...base.profile,
            drive: { ...base.profile.drive, [type]: { ...base.profile.drive[type], speedGain: plan.speedGain } },
        },
        balls: {
            ...base.balls,
            [croqueted]: {
                ...(base.balls[croqueted] as BallState),
                position: vec3(x + reach * Math.cos(line), y + reach * Math.sin(line), R),
            },
        },
        stroke: {
            ...base.stroke,
            lean: plan.lean,
            feet: plan.feet,
            drive: plan.drive,
            handReach: plan.handReach,
            window: plan.window,
            timing: { ...base.stroke.timing, hands: plan.onset },
        },
    };
    const body = bodyBackswing(placed, IMPACT_WORLD);
    const stroke =
        power <= 1
            ? { ...placed.stroke, backswing: power * body }
            : { ...placed.stroke, backswing: body, intensity: power - 1 };
    return opened({ ...placed, stroke });
}

/**
 * h_body (m; decision 1): the backswing whose shaft reaches the body's limit θ_max, ℓ_h·(cos lean − cos θ_max) /
 * pendulumShare·(1 − BODY_MARGIN), as followThrough.ts's backswingBracket reaches it, here for every λ. ℓ_h = ρ +
 * the shot's top hand; the lean is the shot's, else the preset's at its stance. 2 m with no pendulum share, as the
 * bracket.
 */
export function bodyBackswing(setup: ShotSetup, world: World): number {
    const { stroke, profile } = setup;
    const { type } = stroke;
    const stance = profile.stance[type];
    const shape = profile.shape[type];
    const rho = faceHalfHeight(headShapeOf(profile.mallet.head));
    const top = stroke.grip?.top ?? stance.top;
    const lever = rho + top;
    const lean =
        stroke.lean ??
        stanceLean(stance.handsAhead, top, stroke.contact.up, {
            ballRadius: world.ball.radius,
            headLength: profile.mallet.headLength,
            faceHalfHeight: rho,
        });
    if (!(shape.pendulumShare > 0)) {
        return 2;
    }
    return (
        ((lever * (Math.cos(lean) - Math.cos(profile.body.backswingLimit))) / shape.pendulumShare) * (1 - BODY_MARGIN)
    );
}

/** Whether `setup` plans on `world`: plannedSpeed returns a finite speed rather than a RangeError. */
function plans(setup: ShotSetup, world: World): boolean {
    try {
        return Number.isFinite(plannedSpeed(setup, world));
    } catch (error) {
        if (error instanceof RangeError) {
            return false;
        }
        throw error;
    }
}

/**
 * p_max of `plan` on `world` (decision 1): 2 where it plans; else, where p = 1 plans, the largest p in [1, 2] that
 * plans, by POWER_BISECTIONS halvings, as where the couple at p = 2 passes C; else the same bisection over [0, 1].
 * Below 1 the couple need not rise with p (a weak grip's peak couple dips before it climbs), so there the bisection
 * finds a power that plans with a failing one just above it, not necessarily the largest. NaN when no halving plans:
 * the plan has no power at all. Every power returned plans. `over` is mapSetup's: the profile and stance only, its
 * world and stroke rejected.
 */
export function maxPower(type: RollType, plan: MapPlan, world: World, over: CanonicalOptions = {}): number {
    const at = (p: number): boolean => plans(mapSetup(type, plan, p, over), world);
    if (at(POWER_LIMIT)) {
        return POWER_LIMIT;
    }
    const above = at(1);
    let lo = above ? 1 : 0;
    let hi = above ? POWER_LIMIT : 1;
    for (let i = 0; i < POWER_BISECTIONS; i++) {
        const mid = (lo + hi) / 2;
        if (at(mid)) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    return lo > 0 ? lo : NaN;
}

/**
 * The effect from velocity `before` to `after` (m/s), as faults.ts's effectOf measures it (restated, as
 * followThroughProbe.ts restates it): the speed's change as a fraction (+Infinity from rest) and the unsigned change in
 * horizontal direction (degrees; 0 when either horizontal speed is 0).
 */
function effectBetween(before: Vec3, after: Vec3): { readonly speedChange: number; readonly angleChange: number } {
    const from = length(before);
    const speedChange = from === 0 ? Infinity : (length(after) - from) / from;
    const a = horizontal(before);
    const b = horizontal(after);
    if (length(a) === 0 || length(b) === 0) {
        return { speedChange, angleChange: 0 };
    }
    return { speedChange, angleChange: (atan2(Math.abs(cross(a, b).z), dot(a, b)) * 180) / Math.PI };
}

/** The striker's ball's velocity per impact step's end, and before the first step. */
interface VelocityTrace {
    readonly initial: Vec3;
    readonly times: readonly number[];
    readonly velocities: readonly Vec3[];
}

/** The striker's ball's velocity at `t` (s): after the last step ending at or before it, else before the first. */
function velocityAt(trace: VelocityTrace, t: number): Vec3 {
    const { times, velocities } = trace;
    const limit = t + Math.abs(t) * STEP_SLACK;
    let lo = 0;
    let hi = times.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if ((times[mid] as number) <= limit) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    return lo === 0 ? trace.initial : (velocities[lo - 1] as Vec3);
}

/**
 * The contact-only verdict (decision 11): for each re-contact the judge groups (its groupReContacts' groups, on its
 * non-exempt contacts), the striker's ball's velocity change summed over the face–striker intervals inside the group
 * alone, read from the probe's per-step velocities at each interval's start and end, judged against EFFECT_SPEED and
 * EFFECT_ANGLE from the velocity at the group's start. Unparted, it is the shipped verdict, as the judge reads no
 * effect there; with no strike, false.
 */
function contactOnlyFault(
    faults: FaultReport,
    faces: readonly ContactInterval[],
    trace: VelocityTrace,
    shipped: boolean,
): boolean {
    const { strike } = faults;
    if (strike === undefined) {
        return false;
    }
    if (strike.parted === null) {
        return shipped;
    }
    return strike.recontacts.some((r) => {
        let change = ZERO;
        for (const f of faces) {
            if (f.start >= r.start && f.end <= r.end) {
                change = add(change, sub(velocityAt(trace, f.end), velocityAt(trace, f.start)));
            }
        }
        const before = velocityAt(trace, r.start);
        const effect = effectBetween(before, add(before, change));
        return Math.abs(effect.speedChange) >= EFFECT_SPEED || effect.angleChange >= EFFECT_ANGLE;
    });
}

/**
 * The class of a plan planStroke rejects with `message` (decision 5, read with spec §3.5 and A2 item 2): a lean past
 * the on-point limit is a mishit (A2 item 2: "past the lean's 45° it is unplayable (mishit)"); a backswing past θ_max
 * or a couple past C is superhuman; the head in the turf at contact, or where the impact starts, damages the turf
 * (§3.5); any other rejection is unreachable.
 */
function rejectedClass(message: string): MapClass {
    if (message.includes("on-point limit")) {
        return "mishit";
    }
    if (message.includes("θ_max") || message.includes("the grip cannot hold")) {
        return "superhuman";
    }
    if (message.includes("the head is in the turf")) {
        return "turf";
    }
    return "unreachable";
}

/** A sample with no run: `klass` for `reason`, every reading NaN on every lawn. */
function unplayed(power: number, lawns: readonly number[], klass: MapClass, reason: string): MapSample {
    const byLawn: Record<number, LawnRead> = {};
    for (const lawn of lawns) {
        byLawn[lawn] = { range: NaN, ratio: NaN, splitAtRest: NaN };
    }
    return {
        power,
        klass,
        reason,
        byLawn,
        strokeEffort: NaN,
        pushEffort: NaN,
        coupleShare: NaN,
        pushImpulse: NaN,
        effectVerdicts: { shipped: false, contactOnly: false },
        followCap: false,
    };
}

/** The first of decision 5's classes after the run that applies, with its reason, or none. */
function runClass(
    setup: ShotSetup,
    run: ReturnType<typeof simulateStroke>,
    faults: FaultReport,
    point: OnPoint,
): { readonly klass: MapClass | null; readonly reason: string | null } {
    const { events } = run.result;
    const flags = run.follow.flags;
    const event = (kind: string): boolean => events.some((e) => e.kind === kind);
    if (event("grip-limit")) {
        return { klass: "superhuman", reason: "grip-limit" };
    }
    if (flags.includes("follow-grip-limit")) {
        return { klass: "superhuman", reason: "follow-grip-limit" };
    }
    for (const kind of ["impact-off-face", "impact-no-strike"]) {
        if (event(kind)) {
            return { klass: "mishit", reason: kind };
        }
    }
    if (!point.holds) {
        return { klass: "mishit", reason: offPointReason(point) };
    }
    for (const kind of ["impact-head-deep", "turf-yield"]) {
        if (event(kind)) {
            return { klass: "turf", reason: kind };
        }
    }
    for (const flag of ["follow-turf-yield", "follow-head-deep"] as const) {
        if (flags.includes(flag)) {
            return { klass: "turf", reason: flag };
        }
    }
    const firstFace = run.result.timeline[faceKey(setup.striker)]?.[0]?.start ?? Infinity;
    if (events.some((e) => e.kind === "impact-mallet-grounded" && e.t <= firstFace)) {
        return { klass: "turf", reason: "impact-mallet-grounded" };
    }
    if (faults.findings.some((f) => f.law === "29.1.6.1")) {
        return { klass: "unlawful", reason: "29.1.6.1" };
    }
    return { klass: null, reason: null };
}

/** maxPower per plan on the impact's world, memoised: a sweep plays one plan at many powers. */
const MAX_POWERS = new Map<string, number>();

function maxPowerOf(type: RollType, plan: MapPlan): number {
    const key = JSON.stringify([type, plan]);
    const known = MAX_POWERS.get(key);
    if (known !== undefined) {
        return known;
    }
    const most = maxPower(type, plan, IMPACT_WORLD);
    MAX_POWERS.set(key, most);
    return most;
}

/**
 * The stroke's effort (%; decision 1): plannedSpeed at `setup` over plannedSpeed at the plan's p_max; NaN where the
 * plan has no p_max.
 */
function strokeEffortOf(type: RollType, plan: MapPlan, setup: ShotSetup): number {
    const pMax = maxPowerOf(type, plan);
    if (Number.isNaN(pMax)) {
        return NaN;
    }
    try {
        const most = plannedSpeed(mapSetup(type, plan, pMax), IMPACT_WORLD);
        return (100 * plannedSpeed(setup, IMPACT_WORLD)) / most;
    } catch (error) {
        if (error instanceof RangeError) {
            return NaN;
        }
        throw error;
    }
}

/** requiredCouple's peak over C for `setup`'s planned downswing (A2 item 1); 0 where λ is 0. */
function coupleShareOf(setup: ShotSetup, plan: StrokePlan): number {
    const { stroke, profile } = setup;
    const lambda = stroke.slopeHold ?? profile.shape[stroke.type].slopeHold;
    const { drive } = plan.contact;
    if (lambda === 0 || drive.kind !== "track" || drive.arc.downswing === undefined) {
        return 0;
    }
    const input = downswingInputOf(setup, IMPACT_WORLD);
    return requiredCouple(input, drive.arc.downswing).peak / input.couple;
}

/** The angle (rad, unsigned) between two balls' horizontal start-to-rest displacements (decision 6). */
function splitAtRestOf(a: Vec3, b: Vec3): number {
    return atan2(Math.abs(cross(horizontal(a), horizontal(b)).z), dot(horizontal(a), horizontal(b)));
}

/**
 * `plan` of `type` played once at power `power` (decision 4): mapSetup, planStroke, simulateStroke with a probe (the
 * push intent's peak and impulse, onPoint's inputs and the striker's ball's velocity per step) on the 10 s open lawn,
 * strokeContext and judgeFaults as simulateShot runs them, then simulateFreeMotion from the one handover on each of
 * `lawns` (s). Classified by decision 5. Never throws for the plan's own failure: a power above 2 is superhuman
 * (intensity above 1); a planStroke rejection is classed by rejectedClass with the engine's message. An error of the
 * impact or the free motion is the engine's, not the plan's, and propagates (the shard runner reports it).
 */
export function playSample(type: RollType, plan: MapPlan, power: number, lawns: readonly number[]): MapSample {
    return playJudged(type, plan, power, lawns).sample;
}

/**
 * playSample's sample with the judge's strike beside it (plan Task 8's super pass roll reads 29.2.5 from it): the
 * parting, the taps and the re-contacts (judgeFaults's `strike`), null where the sample was not played (a power above
 * 2, a planStroke rejection) or the judge gives none. The sample is playSample's exactly.
 */
export function playJudged(
    type: RollType,
    plan: MapPlan,
    power: number,
    lawns: readonly number[],
): { readonly sample: MapSample; readonly strike: StrikeTaps | null } {
    if (power > POWER_LIMIT) {
        return { sample: unplayed(power, lawns, "superhuman", `intensity ${power - 1} above 1`), strike: null };
    }
    const setup = mapSetup(type, plan, power);
    let stroke: StrokePlan;
    try {
        stroke = planStroke(setup, IMPACT_WORLD);
    } catch (error) {
        if (error instanceof RangeError) {
            return { sample: unplayed(power, lawns, rejectedClass(error.message), error.message), strike: null };
        }
        throw error;
    }
    const { drive } = stroke.contact;
    if (drive.kind !== "track") {
        return {
            sample: unplayed(power, lawns, "unreachable", "the planned contact has no tracked drive"),
            strike: null,
        };
    }
    const ids = BALL_IDS.filter((id) => setup.balls[id] !== undefined);
    const striker = ids.indexOf(setup.striker);
    const steps: OnPointStep[] = [];
    const times: number[] = [];
    const velocities: Vec3[] = [];
    let peak = 0;
    let impulse = 0;
    // Each step closes at s.t, having begun at the previous step's end (the first at the impact's start, 0).
    let previous = 0;
    const probe: ImpactProbe = {
        step(s) {
            const intent = s.hand?.intent === undefined ? 0 : length(s.hand.intent);
            peak = Math.max(peak, intent);
            impulse += intent * (s.t - previous);
            previous = s.t;
            times.push(s.t);
            velocities.push((s.balls[striker] as BallState).velocity);
            steps.push({ head: s.head, balls: s.balls, contacts: s.contacts });
        },
    };
    const run = simulateStroke(stroke.contact, setup.balls, IMPACT_WORLD, { probe });
    const impact = run.result;
    const faults = judgeFaults(strokeContext(setup, impact), impact);
    const radius = IMPACT_WORLD.ball.radius;
    const point = onPoint(steps, striker, setup.striker, stroke.contact.head, drive.arc.aim, radius);
    const { klass, reason } = runClass(setup, run, faults, point);
    const croqueted = setup.croqueted as BallId;
    const byLawn: Record<number, LawnRead> = {};
    for (const lawn of lawns) {
        const motion = simulateFreeMotion(impact.handover, lawn === IMPACT_LAWN ? IMPACT_WORLD : openWorld(lawn));
        const range = travelOf(setup, motion, setup.striker);
        const other = travelOf(setup, motion, croqueted);
        const from = (id: BallId): Vec3 => sub(motion.rest[id] as Vec3, (setup.balls[id] as BallState).position);
        byLawn[lawn] = {
            range,
            ratio: range > 0 ? other / range : NaN,
            splitAtRest: splitAtRestOf(from(setup.striker), from(croqueted)),
        };
    }
    const shipped = faults.findings.some((f) => f.law === "29.1.6.1");
    const trace: VelocityTrace = {
        initial: (setup.balls[setup.striker] as BallState).velocity,
        times,
        velocities,
    };
    const faces = impact.timeline[faceKey(setup.striker)] ?? [];
    const sample: MapSample = {
        power,
        klass,
        reason,
        byLawn,
        strokeEffort: strokeEffortOf(type, plan, setup),
        pushEffort: (100 * peak) / setup.profile.body.pushForce,
        coupleShare: coupleShareOf(setup, stroke),
        pushImpulse: impulse,
        effectVerdicts: { shipped, contactOnly: contactOnlyFault(faults, faces, trace, shipped) },
        followCap: run.follow.flags.includes("follow-cap"),
    };
    return { sample, strike: faults.strike ?? null };
}
