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
 */
import { simulateImpact } from "../src/engine/impact/simulateImpact";
import type { ContactState, ImpactResult } from "../src/engine/impact/types";
import { horizontal, length, sub, type Vec3 } from "../src/engine/math/vec3";
import { simulateFreeMotion } from "../src/engine/simulate";
import { planStroke } from "../src/engine/swing/buildContact";
import type { ShotSetup, StrokeType } from "../src/engine/swing/types";
import { BALL_IDS, type BallState, type ShotResult, type World } from "../src/engine/types";
import { defaultWorld } from "../src/engine/world";
import { contactReference, ratioTargetsReference, type RatioTargetKey } from "../src/reference/index";
import { canonicalSetup, strokeFor } from "../tests/engine/support/shot";
import { CEILING } from "./effortFit";
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
    const impact = simulateImpact(contact, setup.balls, world, {
        probe: {
            step(s) {
                const touching = s.contacts.some((c) => c.key === key);
                if (touching) {
                    seen.struck = true;
                } else if (seen.struck && seen.release === null) {
                    seen.release = s.balls[striker] as BallState;
                }
            },
        },
    });
    return { impact, release: seen.release ?? (impact.handover[setup.striker] as BallState) };
}

/**
 * `setup` played on `world` with `p`'s hands' coupling: planStroke, the planned coupling's period and damping ratio
 * replaced, simulateImpact, and simulateFreeMotion from its handover; with the striker's ball at the face's release.
 * The setup and world carry the other candidates (fitSetup, fitWorld).
 */
export function runFit(
    setup: ShotSetup,
    p: FitParams,
    world: World,
): { readonly impact: ImpactResult; readonly motion: ShotResult; readonly release: BallState } {
    const { impact, release } = strike(setup, p, world);
    return { impact, motion: simulateFreeMotion(impact.handover, world), release };
}

/** A ball's travel (m) on the turf from `setup`'s start to its rest in `motion`. */
function travelOf(setup: ShotSetup, motion: ShotResult, id: keyof ShotResult["rest"]): number {
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
 * one with the least max(|e₀|/tol₀, |e₁|/tol₁), returned with `converged: false`. When Newton ends unconverged with
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
