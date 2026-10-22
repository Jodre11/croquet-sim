/**
 * The croquet strokes' fit's evaluator and solver (P2b.2b.2c.2 design §3, §5): the drive's and the AC stop's croquet
 * ratios for any value of the five shared candidates, shared by scripts/croquetFitProbe.ts and the fit's tests so that
 * the probe, the fit and the tests agree by construction. It never edits reference/contact.json; each candidate enters
 * the engine's own inputs instead:
 * - `ballBallContactTime` through the world (fitWorld): its ball–ball contact time, and every hoop's and the peg's
 *   contact time set equal to it, as contact.json's `ballObstacleContactTime` derives it (design §5.2);
 * - `armMass` and `reachSlack` through the canonical setup's body (fitSetup), so that the arm mass enters the planned
 *   downswing, and the stroke is planned at its target's speed exactly on the candidate's body and world;
 * - `handCouplingPeriod` T and `handCouplingDampingRatio` ζ by replacing the planned contact's `TrackDrive.coupling`
 *   period and damping ratio before the impact (runFit), its `relaxAt` kept: HAND_COUPLING enters the engine only
 *   there (`planStroke`).
 * At today's values (TODAY, read from contact.json) the evaluator is the engine: runFit's ratio equals simulateShot's
 * on the same setup to the bit (tests/engine/ratioFit.test.ts).
 *
 * It also reads a strike as Gugan 4 read his filmed strokes, "a few milliseconds after impact" (P2b.2b.2c.2b design
 * §5.2, "My calls"): readOut takes the mallet's speed along aim U at the face's first contact, and its speed W and
 * the balls' speeds w₁ and v₂ READ_DELAY after the later of the mallet's last contact with the striker's ball and the
 * balls' last contact with each other, counting only contacts that begin within STRIKE_WINDOW of the first, so that a
 * double tap counts and a late catch never moves the reading. And it plays a stroke with Gugan's mallet
 * (gugansMallet): the default mallet with its head's mass solved so that the swung body's effective mass at the face
 * centre is Gugan's 2.30 ball masses, which he found "by taking moments about its point of balance", on the preset's
 * own canonical setup at the stroke's speed. The default profile is never changed.
 */
import { ballPairKey, faceKey } from "../src/engine/impact/contacts";
import type { ImpactOptions, ImpactProbe } from "../src/engine/impact/integrate";
import { faceHalfHeight } from "../src/engine/impact/shape";
import { simulateImpact } from "../src/engine/impact/simulateImpact";
import { effectiveMass, swungBody } from "../src/engine/impact/track";
import type { ContactInterval, ContactState, ImpactResult } from "../src/engine/impact/types";
import { dot, horizontal, length, sub, type Vec3 } from "../src/engine/math/vec3";
import { simulateFreeMotion } from "../src/engine/simulate";
import { headShapeOf, planStroke, stanceLean } from "../src/engine/swing/buildContact";
import { defaultProfile } from "../src/engine/swing/profile";
import { CROQUET_STROKES, type ShotSetup, type StrokeType, type SwingProfile } from "../src/engine/swing/types";
import { BALL_IDS, type BallState, type ShotResult, type World } from "../src/engine/types";
import { defaultWorld } from "../src/engine/world";
import { contactReference, ratioTargetsReference, type RatioTargetKey } from "../src/reference/index";
import { canonicalSetup, strokeFor } from "../tests/engine/support/shot";
import { CEILING } from "./effortFit";
import { FILMED_STROKES, GUGAN5, type FilmedStroke } from "./filmedStrokes";
import { openWorld, opened } from "./openLawn";

/** The five shared candidates (design §5.2): one value each. */
export interface FitParams {
    readonly ballBallContactTime: number;
    readonly handCouplingPeriod: number;
    readonly handCouplingDampingRatio: number;
    readonly armMass: number;
    readonly reachSlack: number;
}

/** A candidate's name. */
export type Candidate = keyof FitParams;

const CANDIDATES: readonly Candidate[] = [
    "ballBallContactTime",
    "handCouplingPeriod",
    "handCouplingDampingRatio",
    "armMass",
    "reachSlack",
];

/** Today's value of every candidate, as reference/contact.json holds it. */
export const TODAY: FitParams = {
    ballBallContactTime: contactReference.ballBallContactTime.value,
    handCouplingPeriod: contactReference.handCouplingPeriod.value,
    handCouplingDampingRatio: contactReference.handCouplingDampingRatio.value,
    armMass: contactReference.armMass.value,
    reachSlack: contactReference.reachSlack.value,
};

/** Each candidate's bounds as reference/contact.json records them; throws for a candidate recorded without any. */
function boundsOf(key: Candidate): readonly [number, number] {
    const bounds = contactReference[key].bounds;
    if (bounds === undefined) {
        throw new Error(`ratioFit: contact.json's ${key} has no bounds`);
    }
    return bounds;
}

/** Every candidate's bounds (contact.json), which the fit keeps to. */
export const BOUNDS: Readonly<Record<Candidate, readonly [number, number]>> = Object.fromEntries(
    CANDIDATES.map((key) => [key, boundsOf(key)]),
) as Record<Candidate, readonly [number, number]>;

/**
 * `base` (default `defaultWorld()`) with `p`'s ball–ball contact time, every hoop's and the peg's contact time equal to
 * it (design §5.2).
 */
export function fitWorld(p: FitParams, base: World = defaultWorld()): World {
    const contactTime = p.ballBallContactTime;
    return {
        ...base,
        ballBallContactTime: contactTime,
        hoops: base.hoops.map((hoop) => ({ ...hoop, contactTime })),
        peg: { ...base.peg, contactTime },
    };
}

/**
 * `type`'s canonical setup on `world` (default fitWorld(p)) with `p`'s arm mass and reach slack, its stroke the
 * default stroke's inputs planning `speed` (m/s) exactly on that body and world (strokeFor).
 */
export function fitSetup(type: StrokeType, p: FitParams, speed: number, world: World = fitWorld(p)): ShotSetup {
    const setup = canonicalSetup(type, { world, body: { armMass: p.armMass, reachSlack: p.reachSlack } });
    return { ...setup, stroke: { ...setup.stroke, ...strokeFor(setup, speed, world) } };
}

/**
 * `setup`'s impact on `world` with `p`'s hands' coupling, and the striker's ball at the face's release: at the first
 * impact step after its first face contact ends, else at handover (the impact can hold the ball on the turf long after
 * the face lets it go), as scripts/singleBallProbe.ts's `release` reads it.
 */
function strike(
    setup: ShotSetup,
    p: FitParams,
    world: World,
    options: StepOption = {},
): { readonly impact: ImpactResult; readonly release: BallState } {
    const plan = planStroke(setup, world);
    const drive = plan.contact.drive;
    if (drive.kind !== "track") {
        throw new RangeError(`ratioFit: the ${setup.stroke.type} stroke's planned contact has no tracked drive`);
    }
    const coupling = { ...drive.coupling, period: p.handCouplingPeriod, dampingRatio: p.handCouplingDampingRatio };
    const contact: ContactState = { ...plan.contact, drive: { ...drive, coupling } };
    const striker = BALL_IDS.filter((id) => setup.balls[id] !== undefined).indexOf(setup.striker);
    const key = `face/${setup.striker}`;
    const seen: { struck: boolean; release: BallState | null } = { struck: false, release: null };
    const probe: ImpactProbe = {
        step(s) {
            const touching = s.contacts.some((c) => c.key === key);
            if (touching) {
                seen.struck = true;
            } else if (seen.struck && seen.release === null) {
                seen.release = s.balls[striker] as BallState;
            }
        },
    };
    const impact = simulateImpact(contact, setup.balls, world, withStep({ probe }, options));
    return { impact, release: seen.release ?? (impact.handover[setup.striker] as BallState) };
}

/** The impact step (s) in place of the engine's IMPACT_DT; absent, the engine's own. */
export interface StepOption {
    readonly dt?: number;
}

/** `options` with `step`'s dt where it gives one, so that an absent step leaves the impact's options as they were. */
function withStep(options: ImpactOptions, step: StepOption): ImpactOptions {
    return step.dt === undefined ? options : { ...options, dt: step.dt };
}

/**
 * `setup` played on `world` with `p`'s hands' coupling: planStroke, the planned coupling's period and damping ratio
 * replaced, simulateImpact at `options`' step (default the engine's), and simulateFreeMotion from its handover; with
 * the striker's ball at the face's release. The setup and world carry the other candidates (fitSetup, fitWorld).
 */
export function runFit(
    setup: ShotSetup,
    p: FitParams,
    world: World,
    options: StepOption = {},
): { readonly impact: ImpactResult; readonly motion: ShotResult; readonly release: BallState } {
    const { impact, release } = strike(setup, p, world, options);
    return { impact, motion: simulateFreeMotion(impact.handover, world), release };
}

/** A ball's travel (m) on the turf from `setup`'s start to its rest in `motion`. */
export function travelOf(setup: ShotSetup, motion: ShotResult, id: keyof ShotResult["rest"]): number {
    const start = (setup.balls[id] as BallState).position;
    return length(horizontal(sub(motion.rest[id] as Vec3, start)));
}

/**
 * The croquet ratio of `setup`'s stroke in `motion`: the croqueted ball's travel to rest over the striker's ball's.
 * Throws a RangeError naming the stroke when the setup has no croqueted ball or the striker's ball did not move, so
 * that the solver is never handed Infinity or NaN.
 */
export function ratioOf(setup: ShotSetup, motion: ShotResult): number {
    const { type } = setup.stroke;
    if (setup.croqueted === undefined) {
        throw new RangeError(`ratioOf: the ${type} stroke has no croqueted ball`);
    }
    const striker = travelOf(setup, motion, setup.striker);
    if (!(striker > 0)) {
        throw new RangeError(
            `ratioOf: the ${type} stroke's striker's ball (${setup.striker}) did not move (travel ${striker} m)`,
        );
    }
    return travelOf(setup, motion, setup.croqueted) / striker;
}

/** The ratio of the target `key`'s stroke at its target's speed under `p`, on `world`. */
function ratioAt(key: RatioTargetKey, p: FitParams, world: World): number {
    const setup = fitSetup(key, p, ratioTargetsReference[key].speed.value, world);
    return ratioOf(setup, runFit(setup, p, world).motion);
}

/** The drive's and the AC stop's ratios under `p`, each at its target's speed (design §5.1) on fitWorld(p). */
export function ratiosAt(p: FitParams): { readonly drive: number; readonly stop: number } {
    const world = fitWorld(p);
    return { drive: ratioAt("drive", p, world), stop: ratioAt("stop-ac", p, world) };
}

/** The solver's convergence: both ratios within 0.01 of their targets (design §5.3, "to 0.01 on each ratio"). */
const SOLVE_TOLERANCE = 0.01;

/** Numerical, not physical: the solver's most Newton steps before it returns the closest point. */
const MAX_ITERATIONS = 20;

/** Numerical, not physical: the forward difference's step, a share of the bound's width. */
const DIFFERENCE_SHARE = 0.01;

type Pair = readonly [number, number];

/** Numerical, not physical: the line search's evaluations along the free coordinate, its bracket shrunk to ~1e-8. */
const LINE_EVALUATIONS = 40;

/**
 * Numerical, not physical: a Newton step moving no coordinate by more than this share of its bound's width has
 * stalled. A step clamped onto a bound still moves the free coordinate by rounding, so an exact repeat is not awaited.
 */
const STALL_SHARE = 1e-9;

/** The golden section's ratio, (√5 − 1)/2. */
const GOLDEN = (Math.sqrt(5) - 1) / 2;

/** One evaluated point: its values, and its score max(|e₀|/tol₀, |e₁|/tol₁). */
interface Evaluated {
    readonly point: Pair;
    readonly values: Pair;
    readonly score: number;
    readonly done: boolean;
}

/**
 * A root of `evaluate` − `targets` within `bounds` (design §5.3): Newton from `start` (clamped into the bounds), the
 * Jacobian by forward differences of DIFFERENCE_SHARE of each bound's width (backward where forward would leave the
 * upper bound), each iterate clamped into the bounds, at most MAX_ITERATIONS steps. Converged as soon as any evaluated
 * point has both errors at most SOLVE_TOLERANCE; that point is returned. Otherwise the closest point is the evaluated
 * one with the least max(|e₀|/tol₀, |e₁|/tol₁), returned with `converged: false`. The two measures differ by design
 * (§5.3): `tolerances` (tol₀, tol₁) are the targets' own, which only rank points; SOLVE_TOLERANCE is the convergence. When Newton ends unconverged with
 * one coordinate pinned at a bound (a step moving neither coordinate by STALL_SHARE of its width, the Jacobian
 * singular, or the steps spent), the closest point lies along that bound, where a clamped Newton step cannot reach it:
 * a golden-section search over the free coordinate's bounds (its two ends included, LINE_EVALUATIONS in all), the
 * pinned one held, minimises that score first. The search assumes the score is unimodal along the line, which the
 * drive is known not to be, so a line minimum may be local. With both coordinates pinned, or neither, it does not
 * search. No point outside the bounds is ever evaluated, and the point returned is the best one evaluated, with its
 * evaluated values. `evaluations` counts the calls of `evaluate`.
 */
export function solvePair(
    evaluate: (x: Pair) => Pair,
    start: Pair,
    bounds: readonly [Pair, Pair],
    targets: Pair,
    tolerances: Pair,
): { readonly point: Pair; readonly values: Pair; readonly converged: boolean; readonly evaluations: number } {
    const clamp = (x: number, j: 0 | 1): number => Math.min(Math.max(x, bounds[j][0]), bounds[j][1]);
    let evaluations = 0;
    // Written only by `at`: `best` is the least-score point evaluated; `found` the least-score one with `done`, and
    // once set every search stops. A point with `done` always sets `found`, so `best.done` is false while it is null.
    const seen: { best: Evaluated | null; found: Evaluated | null } = { best: null, found: null };
    const at = (point: Pair): { readonly values: Pair; readonly errors: Pair; readonly score: number } => {
        const values = evaluate(point);
        evaluations++;
        const errors: Pair = [values[0] - targets[0], values[1] - targets[1]];
        const score = Math.max(Math.abs(errors[0]) / tolerances[0], Math.abs(errors[1]) / tolerances[1]);
        const done = Math.abs(errors[0]) <= SOLVE_TOLERANCE && Math.abs(errors[1]) <= SOLVE_TOLERANCE;
        const evaluated = { point, values, score, done };
        if (seen.best === null || score < seen.best.score) {
            seen.best = evaluated;
        }
        if (done && (seen.found === null || score < seen.found.score)) {
            seen.found = evaluated;
        }
        return { values, errors, score };
    };
    const pinned = (x: Pair, j: 0 | 1): boolean => x[j] === bounds[j][0] || x[j] === bounds[j][1];
    // The free coordinate's golden-section search, the other held at its bound.
    const along = (x: Pair, free: 0 | 1): void => {
        const held = x[free === 0 ? 1 : 0];
        const line = (t: number): Pair => (free === 0 ? [t, held] : [held, t]);
        let [lo, hi] = bounds[free];
        at(line(lo));
        at(line(hi));
        let p = hi - GOLDEN * (hi - lo);
        let q = lo + GOLDEN * (hi - lo);
        let fp = at(line(p)).score;
        let fq = at(line(q)).score;
        for (let i = 4; i < LINE_EVALUATIONS && seen.found === null; i++) {
            if (fp <= fq) {
                hi = q;
                q = p;
                fq = fp;
                p = hi - GOLDEN * (hi - lo);
                fp = at(line(p)).score;
            } else {
                lo = p;
                p = q;
                fp = fq;
                q = lo + GOLDEN * (hi - lo);
                fq = at(line(q)).score;
            }
        }
    };
    const stalled = (x: Pair): void => {
        const first = pinned(x, 0);
        const second = pinned(x, 1);
        if (first !== second) {
            along(x, first ? 1 : 0);
        }
    };
    let x: Pair = [clamp(start[0], 0), clamp(start[1], 1)];
    let here = at(x);
    for (let k = 0; k < MAX_ITERATIONS && seen.found === null; k++) {
        const column = (j: 0 | 1): Pair => {
            const width = bounds[j][1] - bounds[j][0];
            const h =
                x[j] + DIFFERENCE_SHARE * width <= bounds[j][1]
                    ? DIFFERENCE_SHARE * width
                    : 0 - DIFFERENCE_SHARE * width;
            const v = at(j === 0 ? [x[0] + h, x[1]] : [x[0], x[1] + h]).values;
            return [(v[0] - here.values[0]) / h, (v[1] - here.values[1]) / h];
        };
        const [a, c] = column(0);
        const [b, d] = column(1);
        if (seen.found !== null) {
            break;
        }
        const det = a * d - b * c;
        if (!(Math.abs(det) > 0) || !Number.isFinite(det)) {
            break;
        }
        const [e0, e1] = here.errors;
        const next: Pair = [clamp(x[0] + (b * e1 - d * e0) / det, 0), clamp(x[1] + (c * e0 - a * e1) / det, 1)];
        const still = (j: 0 | 1): boolean => Math.abs(next[j] - x[j]) <= STALL_SHARE * (bounds[j][1] - bounds[j][0]);
        if (still(0) && still(1)) {
            break;
        }
        x = next;
        here = at(x);
    }
    if (seen.found === null) {
        stalled(x);
    }
    const closest = (seen.found ?? seen.best) as Evaluated;
    return { point: closest.point, values: closest.values, converged: closest.done, evaluations };
}

/** A CA single-ball drive (Gugan 4, Table 2; the CA's Single Ball Shots): mallet and ball speed (m/s), travel (m). */
export interface CaStroke {
    readonly name: string;
    readonly malletSpeed: number;
    readonly ballSpeed: number;
    readonly travel: number;
}

/**
 * The CA's single-ball drives A1D–A4D (reference/sources/README.md, Gugan 4's Table 2 and the CA's Single Ball Shots:
 * "A1D 0.93 0.78 1.04", "A2D 9.74 3.20 4.31", "A3D 24.73 5.23 6.86", "A4D 45.85 8.18 8.62", ball travel, mallet speed,
 * ball speed); the travel in metres (the README's P2b.2b.2c.2 Check 1).
 */
export const CA_STROKES: readonly CaStroke[] = [
    { name: "A1D", malletSpeed: 0.78, ballSpeed: 1.04, travel: 0.93 },
    { name: "A2D", malletSpeed: 3.2, ballSpeed: 4.31, travel: 9.74 },
    { name: "A3D", malletSpeed: 5.23, ballSpeed: 6.86, travel: 24.73 },
    { name: "A4D", malletSpeed: 8.18, ballSpeed: 8.62, travel: 45.85 },
];

/** Numerical, not physical: releaseSpeedFor's lowest planned speed (m/s), below every CA stroke's. */
const RELEASE_FLOOR = 0.1;

/** Numerical, not physical: releaseSpeedFor's halvings of its bracket, to a double's resolution. */
const RELEASE_BISECTIONS = 60;

/**
 * The single-ball stroke's planned speed (m/s) whose ball speed at the face's release (strike's) is `ballSpeed`, under
 * `p` (default TODAY), on the open lawn (openWorld, opened): bisection over [RELEASE_FLOOR, CEILING] (effortFit's
 * ceiling), RELEASE_BISECTIONS halvings, the release speed taken to rise with the planned speed; the least found that
 * reaches it. Throws a RangeError when the bracket's ends do not contain `ballSpeed`, never returning an end.
 */
export function releaseSpeedFor(ballSpeed: number, p: FitParams = TODAY): number {
    const world = fitWorld(p, openWorld());
    const at = (planned: number): number => {
        const setup = opened(fitSetup("single-ball", p, planned, world));
        return length(strike(setup, p, world).release.velocity);
    };
    const low = at(RELEASE_FLOOR);
    const high = at(CEILING);
    if (!(low <= ballSpeed && ballSpeed <= high)) {
        throw new RangeError(
            `releaseSpeedFor: a release speed of ${ballSpeed} m/s lies outside the single-ball stroke's ` +
                `[${low}, ${high}] m/s, planned at ${RELEASE_FLOOR} and ${CEILING} m/s`,
        );
    }
    let lo = RELEASE_FLOOR;
    let hi = CEILING;
    for (let i = 0; i < RELEASE_BISECTIONS; i++) {
        const mid = (lo + hi) / 2;
        if (at(mid) < ballSpeed) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    return hi;
}

/**
 * A read-out definition, not physical: the strike's window (s) from the face's first contact, the contacts Gugan's
 * reading counts. Gugan 4 reads W "after the double tap", so a face re-contact soon after the strike counts: B2GS's,
 * whose striker's ball is caught again 10.8 ms in after crossing its 6 mm gap. A contact beginning after it is not part
 * of the strike Gugan read (design "My calls"): the earliest such is the follow-through's approach at about 87 ms (C1D,
 * the canonical drive), then the drive's late catch at about 109 ms. 15 ms is the smallest multiple of 5 ms past
 * B2GS's tap.
 */
export const STRIKE_WINDOW = 15e-3;

/** Numerical, not physical: the reading's delay (s) after the strike's last contact, Gugan's "a few milliseconds". */
export const READ_DELAY = 1e-3;

/**
 * The read time (s): READ_DELAY after the latest end among the `face` and `ballBall` intervals that begin within
 * STRIKE_WINDOW of the first face interval's start; `open` when such a face interval has not ended by the window's
 * end. Throws a RangeError when the face never touched the ball.
 */
export function readTimeOf(
    face: readonly Pick<ContactInterval, "start" | "end">[],
    ballBall: readonly Pick<ContactInterval, "start" | "end">[],
): { readonly time: number; readonly open: boolean } {
    const first = face[0];
    if (first === undefined) {
        throw new RangeError("readTimeOf: the face never touched the striker's ball");
    }
    const closes = first.start + STRIKE_WINDOW;
    const within = (i: Pick<ContactInterval, "start" | "end">): boolean => i.start <= closes;
    const counted = [...face.filter(within), ...ballBall.filter(within)];
    const last = Math.max(...counted.map((i) => i.end));
    return { time: last + READ_DELAY, open: face.filter(within).some((i) => i.end > closes) };
}

/**
 * A strike's speeds (m/s) as Gugan read his (design §5.2): the mallet's U and W along aim, the striker's ball's w₁ and
 * the second ball's v₂ horizontally, read at `time` (s); `open` as readTimeOf's; the impact, and every step's sample.
 */
export interface ReadOut {
    readonly U: number;
    readonly W: number;
    readonly w1: number;
    readonly v2: number;
    readonly time: number;
    readonly open: boolean;
    readonly impact: ImpactResult;
    readonly samples: readonly ReadSample[];
}

/** One impact step as readOut records it: its end (s), the head centre's speed along aim and both balls' speeds. */
export interface ReadSample {
    readonly t: number;
    readonly head: number;
    readonly w1: number;
    readonly v2: number;
}

/**
 * The speeds read from `samples` (in time order): U the head's at the first sample at or after `start` (s), and W, w₁
 * and v₂ at the first at or after `time` (s), the time reported that sample's. A run ending before either time is
 * read at its last sample, and that sample's time reported. Throws a RangeError for no samples.
 */
export function readSamples(
    samples: readonly ReadSample[],
    start: number,
    time: number,
): { readonly U: number; readonly W: number; readonly w1: number; readonly v2: number; readonly time: number } {
    const last = samples[samples.length - 1];
    if (last === undefined) {
        throw new RangeError("readSamples: no samples");
    }
    const at = (t: number): ReadSample => samples.find((s) => s.t >= t) ?? last;
    const struck = at(start);
    const after = at(time);
    return { U: struck.head, W: after.head, w1: after.w1, v2: after.v2, time: after.t };
}

/**
 * `setup`'s impact on `world` (planStroke, simulateImpact at `options`' step), read as Gugan read his strokes
 * (readSamples): U the head centre's velocity along the arc's aim at the face's first contact, and W, w₁ and v₂ at
 * readTimeOf's time. The second ball is the croqueted ball, else the single live one. Throws a RangeError for a setup
 * with neither, or whose planned contact has no tracked drive.
 */
export function readOut(setup: ShotSetup, world: World, options: StepOption = {}): ReadOut {
    const { type } = setup.stroke;
    const contact = planStroke(setup, world).contact;
    const drive = contact.drive;
    if (drive.kind !== "track") {
        throw new RangeError(`readOut: the ${type} stroke's planned contact has no tracked drive`);
    }
    const other = setup.croqueted ?? setup.live[0];
    if (other === undefined) {
        throw new RangeError(`readOut: the ${type} stroke has no second ball`);
    }
    const ids = BALL_IDS.filter((id) => setup.balls[id] !== undefined);
    const striker = ids.indexOf(setup.striker);
    const second = ids.indexOf(other);
    const { aim } = drive.arc;
    const speedOf = (ball: BallState | undefined): number => length(horizontal((ball as BallState).velocity));
    const samples: ReadSample[] = [];
    const probe: ImpactProbe = {
        step(s) {
            samples.push({
                t: s.t,
                head: dot(s.head.velocity, aim),
                w1: speedOf(s.balls[striker]),
                v2: speedOf(s.balls[second]),
            });
        },
    };
    const impact = simulateImpact(contact, setup.balls, world, withStep({ probe }, options));
    const face = impact.timeline[faceKey(setup.striker)] ?? [];
    const read = readTimeOf(face, impact.timeline[ballPairKey(setup.striker, other)] ?? []);
    const speeds = readSamples(samples, (face[0] as ContactInterval).start, read.time);
    return { ...speeds, open: read.open, impact, samples };
}

/**
 * The read-out's figures (design §5.2): v₂/U, w₁/W, v₂/w₁, W/U and the energy kept, (k·W² + w₁² + v₂²)/(k·U²), `k`
 * the mallet's effective mass over the ball's.
 */
export function figuresOf(
    r: ReadOut,
    k: number,
): {
    readonly v2U: number;
    readonly w1W: number;
    readonly v2w1: number;
    readonly WU: number;
    readonly energy: number;
} {
    const { U, W, w1, v2 } = r;
    return {
        v2U: v2 / U,
        w1W: w1 / W,
        v2w1: v2 / w1,
        WU: W / U,
        energy: (k * W * W + w1 * w1 + v2 * v2) / (k * U * U),
    };
}

/**
 * Gugan's mallet's effective mass in ball masses (Gugan 5): 2.30 lb, found "by taking moments about its point of
 * balance", "the relevant mass for the analysis" (design "My calls").
 */
export const GUGAN_EFFECTIVE_MASS = 2.3;

/**
 * The swung body's effective mass (kg) at the face centre along the arc's aim on `setup`'s planned contact on `world`
 * (swungBody, effectiveMass). Throws a RangeError when the planned contact has no tracked drive.
 */
export function effectiveMassOf(setup: ShotSetup, world: World): number {
    const contact = planStroke(setup, world).contact;
    const drive = contact.drive;
    if (drive.kind !== "track") {
        throw new RangeError(`the ${setup.stroke.type} stroke's planned contact has no tracked drive`);
    }
    const { head, orientation } = contact;
    return effectiveMass(swungBody(head, drive.hands, drive.arc.radius), head, orientation, drive.arc.aim);
}

/**
 * Numerical, not physical: gugansMallet's bracket on the head's mass, as shares of the default head's. Below about
 * 0.74 × the box head's measured inertiaAboutShaft exceeds boxInertia's ceiling for its mass, and the planner rejects
 * it.
 */
const HEAD_BRACKET: readonly [number, number] = [0.75, 2];

/** Numerical, not physical: gugansMallet's halvings of its bracket, to a double's resolution. */
const HEAD_BISECTIONS = 60;

/** Numerical, not physical: the most the solved mallet's stance lean (rad) may differ from the default's, round-off. */
const LEAN_TOLERANCE = 1e-12;

/** The stance's shaft lean (rad) at `setup`'s contact with its own mallet, on a ball of `world`'s radius. */
function leanOf(setup: ShotSetup, world: World): number {
    const { stroke, profile } = setup;
    const stance = profile.stance[stroke.type];
    return stanceLean(stance.handsAhead, stance.top, stroke.contact.up, {
        ballRadius: world.ball.radius,
        headLength: profile.mallet.headLength,
        faceHalfHeight: faceHalfHeight(headShapeOf(profile.mallet.head)),
    });
}

/** `setup` with strokeFor's stroke for `speed` (m/s) on `world`. */
function atSpeed(setup: ShotSetup, speed: number, world: World): ShotSetup {
    return { ...setup, stroke: { ...setup.stroke, ...strokeFor(setup, speed, world) } };
}

/** Numerical, not physical: gugansMallet's most re-plans of the stroke at the solved head's mass. */
const HEAD_PASSES = 4;

/**
 * Gugan's mallet for `type` at `speed` (m/s) on `world` (default `defaultWorld()`): the default mallet with the head's
 * mass solved so that effectiveMassOf on the preset's canonical setup with it, its stroke strokeFor's at `speed`, is
 * GUGAN_EFFECTIVE_MASS ball masses. The stroke enters the effective mass only through the planned contact's start (its
 * lead before contact at the planned swing), so each pass holds a stroke: bisection over HEAD_BRACKET × the default's,
 * HEAD_BISECTIONS halvings, the effective mass taken to rise with the head's, the least found that reaches it; then
 * the stroke is re-planned at the solved mass, until the solved mass repeats, at most HEAD_PASSES passes. Re-planning
 * the stroke inside every halving would cost about 50 s a preset. canonicalSetup re-leans the stance for the mallet;
 * this checks that the lean is the default's, and does not undo it. Throws a RangeError naming the preset and both
 * ends' effective masses when the target lies outside them (the first pass's, on the default mallet's stroke), never
 * returning an end; one when the passes end without a repeat; and one when the lean moved.
 */
export function gugansMallet(type: StrokeType, speed: number, world: World = defaultWorld()): SwingProfile["mallet"] {
    const base = defaultProfile.mallet;
    const setupWith = (headMass: number): ShotSetup => canonicalSetup(type, { world, mallet: { ...base, headMass } });
    const target = GUGAN_EFFECTIVE_MASS * world.ball.mass;
    const solve = (stroke: ShotSetup["stroke"]): number => {
        const massAt = (headMass: number): number => effectiveMassOf({ ...setupWith(headMass), stroke }, world);
        let lo = HEAD_BRACKET[0] * base.headMass;
        let hi = HEAD_BRACKET[1] * base.headMass;
        const low = massAt(lo);
        const high = massAt(hi);
        if (!(low <= target && target <= high)) {
            throw new RangeError(
                `gugansMallet: the ${type} stroke's effective mass of ${target} kg lies outside [${low}, ${high}] ` +
                    `kg, the head's mass at ${lo} and ${hi} kg`,
            );
        }
        for (let i = 0; i < HEAD_BISECTIONS; i++) {
            const mid = (lo + hi) / 2;
            if (massAt(mid) < target) {
                lo = mid;
            } else {
                hi = mid;
            }
        }
        return hi;
    };
    let headMass = solve(atSpeed(setupWith(base.headMass), speed, world).stroke);
    let repeated = false;
    for (let pass = 1; pass < HEAD_PASSES && !repeated; pass++) {
        const next = solve(atSpeed(setupWith(headMass), speed, world).stroke);
        repeated = next === headMass;
        headMass = next;
    }
    if (!repeated) {
        throw new RangeError(`gugansMallet: the ${type} stroke's head mass did not settle in ${HEAD_PASSES} passes`);
    }
    const lean = leanOf(setupWith(headMass), world);
    const lean0 = leanOf(canonicalSetup(type, { world }), world);
    if (!(Math.abs(lean - lean0) <= LEAN_TOLERANCE)) {
        throw new RangeError(`gugansMallet: the ${type} stroke's stance lean moved from ${lean0} to ${lean} rad`);
    }
    return { ...base, headMass };
}

/**
 * `type`'s canonical setup on `world` (default `defaultWorld()`) at `gap` (m): the croqueted ball's gap for a croquet
 * stroke, else the target's (`targetGap`, default `gap`), with Gugan's mallet (gugansMallet) when `gugan` is true, the
 * stroke's `guideEffort` and `jab` where given, and strokeFor's stroke for `speed` (m/s).
 */
export function guganSetup(
    type: StrokeType,
    speed: number,
    gap: number,
    o: {
        readonly world?: World;
        readonly gugan?: boolean;
        readonly guideEffort?: number;
        readonly jab?: number;
        readonly targetGap?: number;
    } = {},
): ShotSetup {
    const world = o.world ?? defaultWorld();
    const croquet = CROQUET_STROKES.includes(type);
    const gaps = croquet
        ? { croquetGap: gap, ...(o.targetGap === undefined ? {} : { targetGap: o.targetGap }) }
        : { targetGap: o.targetGap ?? gap };
    const setup = canonicalSetup(type, {
        world,
        ...gaps,
        ...(o.gugan === true ? { mallet: gugansMallet(type, speed, world) } : {}),
        stroke: {
            ...(o.guideEffort === undefined ? {} : { guideEffort: o.guideEffort }),
            ...(o.jab === undefined ? {} : { jab: o.jab }),
        },
    });
    return atSpeed(setup, speed, world);
}

/**
 * Every filmed stroke (FILMED_STROKES) played on its preset at its U and at `gapOf`'s gap (default the recorded one),
 * with the preset's own push, no jab and the default mallet (design §5.2), on `o.world` (default `defaultWorld()`) at
 * `o.dt`'s step: its read-out, and its figures with k effectiveMassOf's over the ball's mass.
 */
export function filmedStrokeRuns(
    gapOf: (s: FilmedStroke) => number = (s) => s.gap,
    o: { readonly dt?: number; readonly world?: World } = {},
): readonly {
    readonly stroke: FilmedStroke;
    readonly gap: number;
    readonly read: ReadOut;
    readonly figures: ReturnType<typeof figuresOf>;
}[] {
    const world = o.world ?? defaultWorld();
    const step: StepOption = o.dt === undefined ? {} : { dt: o.dt };
    return FILMED_STROKES.map((stroke) => {
        const gap = gapOf(stroke);
        const setup = guganSetup(stroke.preset, stroke.malletSpeed, gap, { world });
        const read = readOut(setup, world, step);
        return { stroke, gap, read, figures: figuresOf(read, effectiveMassOf(setup, world) / world.ball.mass) };
    });
}

/** The steps (shares of the engine's IMPACT_DT) each judged figure is evaluated at for step convergence (design §6). */
export const STEP_SHARES = [0.5, 1, 2] as const;

/** The largest less the smallest of `xs`. */
export function spreadOf(xs: readonly number[]): number {
    return Math.max(...xs) - Math.min(...xs);
}

/**
 * The mean of v₂/U, w₁/W and v₂/w₁ over `runs`' counted strokes, those whose strike closed within its window. Throws a
 * RangeError when none did.
 */
export function meansOf(runs: ReturnType<typeof filmedStrokeRuns>): { v2U: number; w1W: number; v2w1: number } {
    const counted = runs.filter((r) => !r.read.open);
    if (counted.length === 0) {
        throw new RangeError("meansOf: no filmed stroke closed within the strike's window");
    }
    const mean = (f: (r: (typeof counted)[number]) => number): number =>
        counted.reduce((sum, r) => sum + f(r), 0) / counted.length;
    return {
        v2U: mean((r) => r.figures.v2U),
        w1W: mean((r) => r.figures.w1W),
        v2w1: mean((r) => r.figures.v2w1),
    };
}

// Gugan's mallet is solved per setup (about 11 s each); the setup does not depend on the step, so each is built once.
const guganStrokes = new WeakMap<World, Map<string, ShotSetup>>();

/** Design §7.2's stroke at `gap` (m): 3 m/s with Gugan's mallet, the drive with no push, the stop with no jab. */
export function guganStroke(type: "drive" | "stop-ac", gap: number, world: World): ShotSetup {
    const cache = guganStrokes.get(world) ?? new Map<string, ShotSetup>();
    guganStrokes.set(world, cache);
    const key = `${type}/${gap}`;
    const cached = cache.get(key);
    if (cached !== undefined) {
        return cached;
    }
    const options = type === "drive" ? { guideEffort: 0 } : { jab: 0 };
    const setup = guganSetup(type, GUGAN5.speed, gap, { world, gugan: true, ...options });
    cache.set(key, setup);
    return setup;
}

/** The croquet ratio of design §7.2's `type` stroke at `gap` (m), played to rest at impact step `dt` (s). */
export function guganRatio(type: "drive" | "stop-ac", gap: number, dt: number, world: World): number {
    const setup = guganStroke(type, gap, world);
    return ratioOf(setup, runFit(setup, TODAY, world, { dt }).motion);
}
