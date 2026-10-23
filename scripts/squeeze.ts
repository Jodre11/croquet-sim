/**
 * The search's tools (P2b.2b.2c.2b design §4): the free-collision harness and a candidate's verdict. freeCollision
 * plays a ball–ball law alone through `integrate(isolated(…))`, as tests/engine/impact/analytic.test.ts does: two balls
 * of the default world's, one moving, no head contact, no turf and no gravity. It reports the law's own contact time
 * and the contact as Gugan 4's video would time it, from the struck ball's displacement first exceeding VISIBLE_SHIFT
 * to the pair's gap first exceeding it. scripts/croquetFitProbe.ts's section I judges each candidate
 * with them, and its section F times the strike as the video would with `visible` and `videoIntervals`.
 *
 * The conversions (P2b.2b.2c.2c design §2, §5.3). Each harness times a contact two ways besides the video's: the law
 * time, the steps in which the pair is listed among the step's contacts with a positive penetration δ (the timeline's
 * interval), and the force-on time, the steps with a positive normal force; under the force clamp the force can reach
 * zero a little before δ does. A law's parameter T (lawFromContactTime's contact time, closeFace's T(U)) is its
 * force-on time; the law time exceeds it. Every video time takes an optional threshold `shift` (m), VISIBLE_SHIFT
 * when absent, so that design §7.9's 0.4 and 0.6 mm and the camera's thresholds can be passed; without it every call
 * is as before. Likewise an optional `start` (VideoStart) starts the video at first touch, the start the laws'
 * conversions adopt, instead of the struck ball's first visible move.
 * freeFace plays the default mallet's head free onto a free default ball, the face's law alone. The face's law reads
 * T(U) from reference/contact.json at load, so its conversion cannot re-run the face at another t0; it need not.
 * Under the face's Hertz law, F = k·δ^{3/2} + c·δ^{1/2}·δ′ with k and c set at the closing speed U from T(U) and e(U),
 * a free head on a free ball has one time scale T and one length scale L ∝ U·T. Stretching T by s at a fixed U leaves
 * e and the dimensionless motion unchanged and gives δ_s(t) = s·δ(t/s), and likewise every displacement and clearance:
 * the same motion with every length and every time × s. A threshold `shift` on the stretched run is crossed when the
 * original crosses shift/s, so
 *
 *     videoTime(s·T; shift) = s · videoTime(T; shift/s).
 *
 * The approach before the contact, over the start gap, only offsets both video events alike. faceScaleFor solves this
 * for the s whose video time is a target; the new law's t0 is s times today's. The ball–ball law, linear and built
 * from its contact time, is re-run directly (ballBallTimeFor). cameraIntervals samples a contact as the 8,000 fps
 * camera would, at frame phases evenly spread over one frame.
 */
import { FACE_SPEED_MAX, FACE_SPEED_MIN, lawFromContactTime, type PairLaw } from "../src/engine/impact/contactLaw";
import { IMPACT_DT, integrate, type ImpactProbe } from "../src/engine/impact/integrate";
import { ballPairKey, faceClearance, faceKey } from "../src/engine/impact/contacts";
import { length, sub, vec3 } from "../src/engine/math/vec3";
import { planStroke } from "../src/engine/swing/buildContact";
import type { BallState } from "../src/engine/types";
import { defaultWorld } from "../src/engine/world";
import { freeBall, freeTracked, isolated } from "../tests/engine/support/impact";
import { canonicalSetup } from "../tests/engine/support/shot";
import { FREE_COLLISIONS, VIDEO_FRAME, VISIBLE_SHIFT } from "./filmedStrokes";

/** Numerical, not physical: the free collision's start gap (m), so that the pair opens at t = 0 (analytic.test.ts). */
const START_GAP = 1e-5;

/**
 * Numerical, not physical: the free collision's end (s). The integrator runs an isolated set-up to its cap (no face
 * ever closes); 4 ms covers a 0.75 ms contact and the separating balls' gap reaching VISIBLE_SHIFT at any Table 1
 * speed.
 */
const FREE_CAP = 4e-3;

/** True when `distance` (m), a body's displacement or two surfaces' separation, exceeds what the video resolves. */
export function visible(distance: number, shift = VISIBLE_SHIFT): boolean {
    return distance > shift;
}

/** A contact as the video sees it: its start and end (s), the end null while it is still on at the last sample. */
export interface VideoInterval {
    readonly start: number;
    readonly end: number | null;
}

/**
 * The intervals over which `samples` (in time order: each step's end t (s) and the two bodies' surface separation (m),
 * negative while they overlap) show a contact to the video: on from the first sample whose separation is not visible
 * at `shift`, off at the next that is. A release is seen only after a contact: `samples` must open in contact, or begin
 * before it, with the bodies' approach. A list that begins after its contact, the bodies already apart, shows no release
 * (and a later contact as the first).
 */
export function videoIntervals(
    samples: readonly { readonly t: number; readonly separation: number }[],
    shift = VISIBLE_SHIFT,
): readonly VideoInterval[] {
    const intervals: VideoInterval[] = [];
    let start: number | null = null;
    for (const { t, separation } of samples) {
        if (start === null && !visible(separation, shift)) {
            start = t;
        } else if (start !== null && visible(separation, shift)) {
            intervals.push({ start, end: t });
            start = null;
        }
    }
    if (start !== null) {
        intervals.push({ start, end: null });
    }
    return intervals;
}

/**
 * A contact as a harness times it (P2b.2b.2c.2c design "Vocabulary"): the restitution, the law time (s; the steps with
 * the pair's penetration positive), the force-on time (s; the steps with its normal force positive) and the video time
 * (s).
 */
export interface Timed {
    readonly restitution: number;
    readonly lawTime: number;
    readonly forceTime: number;
    readonly videoTime: number;
}

/**
 * Where a harness's video time starts. "arrival": the striking surface (the face, or the striker's ball) first within
 * the threshold of the struck ball, extrapolated back at the closing speed to t = (START_GAP − shift)/speed, before
 * the run's start; the clock starts at first touch, as Gugan 4's Fig. 4 times every event from the mallet's first
 * contact, and this is the adopted start for the laws' conversions (gate stage 1's ruling). "moved": the struck ball's
 * displacement first exceeding the threshold, the default, kept so that every existing call reads as before. Hertz
 * similarity (the header) holds for both, since the approach before the contact only offsets the start.
 */
export type VideoStart = "moved" | "arrival";

/**
 * A free collision of the default world's balls under `law` at `speed` (m/s), at `o.dt`'s step (default the engine's
 * IMPACT_DT): the restitution (the balls' separating speed over `speed` at the end), the law and force-on times, and
 * the video's (from the struck ball's displacement first exceeding `o.shift`, default VISIBLE_SHIFT, to the pair's gap
 * first exceeding it). `o.start` "arrival" starts the video instead when the striker's surface comes within the
 * threshold of the struck ball's, extrapolated back at `speed` to t = (START_GAP − shift)/speed (VideoStart; default
 * "moved"). Throws a RangeError when the video never sees the contact end within FREE_CAP.
 */
export function freeCollision(
    speed: number,
    law: PairLaw,
    o: { readonly dt?: number; readonly shift?: number; readonly start?: VideoStart } = {},
): Timed {
    const world = defaultWorld();
    const R = world.ball.radius;
    const dt = o.dt ?? IMPACT_DT;
    const shift = o.shift ?? VISIBLE_SHIFT;
    const home = vec3(2 * R + START_GAP, 0, 1);
    const key = ballPairKey("blue", "red");
    const seen: { touching: number; closed: number; moved: number | null; parted: number | null } = {
        touching: 0,
        closed: 0,
        moved: null,
        parted: null,
    };
    const probe: ImpactProbe = {
        step(s) {
            if (s.contacts.some((c) => c.key === key && c.depth > 0)) {
                seen.touching++;
            }
            if (s.contacts.some((c) => c.key === key && c.normalForce > 0)) {
                seen.closed++;
            }
            const [striker, struck] = s.balls as readonly [BallState, BallState];
            if (seen.moved === null && visible(length(sub(struck.position, home)), shift)) {
                seen.moved = s.t;
            }
            const gap = length(sub(struck.position, striker.position)) - 2 * R;
            if (seen.moved !== null && seen.parted === null && visible(gap, shift)) {
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
    const from = o.start === "arrival" ? (START_GAP - shift) / speed : seen.moved;
    return {
        restitution: separating / speed,
        lawTime: seen.touching * dt,
        forceTime: seen.closed * dt,
        videoTime: seen.parted - from,
    };
}

/** Numerical, not physical: the free face's first end (s), enough for a contact and its release at 0.2 mm. */
const FACE_CAP = 2e-3;

/**
 * Numerical, not physical: the longest free face run (s), FACE_CAP's third doubling, a guard against a run that never
 * releases rather than a fit. The largest need in this step is 2.3 ms (a contact of 1.3 ms at FACE_SPEED_MIN, then the
 * clearance reaching faceScaleFor's largest threshold, 0.6 mm / 0.3 = 2 mm, at the 0.4 m/s separation of 0.5 m/s),
 * which the second doubling, 4 ms, already covers. 16 ms leaves room for a speed below FACE_SPEED_MIN: the clearance
 * opens at about 0.85 U, so the 2 mm threshold is reached within it down to about 0.15 m/s.
 */
const FACE_CAP_LIMIT = 16e-3;

/** A free face run (freeFace) with its trace: the ball's displacement and the face's clearance (m) at each step. */
interface FaceRun {
    readonly restitution: number;
    readonly lawTime: number;
    readonly forceTime: number;
    /** The video time (s) at threshold `shift` (m) from `start`, or null if the trace never shows the contact end. */
    readonly videoAt: (shift: number, start?: VideoStart) => number | null;
}

/**
 * Plays the free face (freeFace) at `speed` and `dt` to FACE_CAP, doubling the cap, which only extends the same run,
 * until the video sees the contact end at threshold `reach`. Throws a RangeError past FACE_CAP_LIMIT.
 */
function playFace(speed: number, dt: number, reach: number): FaceRun {
    const world = defaultWorld();
    const R = world.ball.radius;
    const contact = planStroke(canonicalSetup("single-ball"), world).contact;
    // The head alone: a shaft with mass would lift the body's centre off the face's axis and turn it.
    const head = { ...contact.head, shaft: { ...contact.head.shaft, mass: 0 } };
    const home = vec3(head.length / 2 + R + START_GAP, 0, 1);
    const key = faceKey("blue");
    const setup = {
        ...freeTracked(head, vec3(0, 0, 1), vec3(speed, 0, 0), [freeBall("blue", home)]),
        face: { mass: (head.mass * world.ball.mass) / (head.mass + world.ball.mass), friction: contact.face.friction },
        ball: world.ball,
    };
    for (let cap = FACE_CAP; cap <= FACE_CAP_LIMIT; cap *= 2) {
        const trace: { t: number; moved: number; clearance: number }[] = [];
        let touching = 0;
        let closed = 0;
        const probe: ImpactProbe = {
            step(s) {
                if (s.contacts.some((c) => c.key === key && c.depth > 0)) {
                    touching++;
                }
                if (s.contacts.some((c) => c.key === key && c.normalForce > 0)) {
                    closed++;
                }
                const ball = (s.balls[0] as BallState).position;
                trace.push({ t: s.t, moved: length(sub(ball, home)), clearance: faceClearance(s.head, head, ball, R) });
            },
        };
        const run = integrate(setup, { dt, cap, probe });
        const videoAt = (shift: number, start: VideoStart = "moved"): number | null => {
            const moved = trace.findIndex((p) => visible(p.moved, shift));
            if (moved < 0) {
                return null;
            }
            const parted = trace.findIndex((p, i) => i >= moved && visible(p.clearance, shift));
            if (parted < 0) {
                return null;
            }
            const from = start === "moved" ? (trace[moved] as (typeof trace)[number]).t : (START_GAP - shift) / speed;
            return (trace[parted] as (typeof trace)[number]).t - from;
        };
        if (videoAt(reach) !== null) {
            return {
                restitution: ((run.balls.blue?.velocity.x as number) - run.head.velocity.x) / speed,
                lawTime: touching * dt,
                forceTime: closed * dt,
                videoAt,
            };
        }
    }
    throw new RangeError(`freeFace: at ${speed} m/s the video never saw the contact end within ${FACE_CAP_LIMIT} s`);
}

/**
 * The face's law alone (P2b.2b.2c.2c design §2.1): the default mallet's head (the single-ball preset's planned head,
 * its shaft massless) moving free (freeTracked: no hands, no gravity, no turf) at `speed` (m/s) onto a free default
 * ball touching its face, at `o.dt`'s step (default IMPACT_DT). The restitution is the ball's speed less the head's
 * after, over `speed`; the video time runs from the ball's displacement first exceeding `o.shift` (default
 * VISIBLE_SHIFT) to the face's clearance from the ball (faceClearance) first exceeding it. `clamped` is set when
 * `speed` lies outside the face law's [FACE_SPEED_MIN, FACE_SPEED_MAX], where its k and c are the nearer end's. Throws
 * a RangeError when the video never sees the contact end within FACE_CAP_LIMIT. The shaft's mass is left out because
 * the design's free head carries the head's mass alone: with it the body's centre lies above the face's axis and the
 * head turns, and at 3.26 m/s the force-on time reads 0.8969 ms against T(U)'s 0.8852 and e 0.8155 against 0.8145.
 * `o.start` moves the video's start (VideoStart; default "moved").
 */
export function freeFace(
    speed: number,
    o: { readonly dt?: number; readonly shift?: number; readonly start?: VideoStart } = {},
): Timed & { readonly clamped: boolean } {
    const shift = o.shift ?? VISIBLE_SHIFT;
    const { restitution, lawTime, forceTime, videoAt } = playFace(speed, o.dt ?? IMPACT_DT, shift);
    return {
        restitution,
        lawTime,
        forceTime,
        videoTime: videoAt(shift, o.start) as number,
        clamped: speed < FACE_SPEED_MIN || speed > FACE_SPEED_MAX,
    };
}

/** The bracket of scales faceScaleFor searches: wide enough for any plausible re-set of the face's t0. */
const SCALE_BRACKET = [0.3, 3] as const;

/** Numerical, not physical: the bisection's end, the bracket's width in s (1e-5, 0.001 % of a unit scale). */
const SCALE_TOLERANCE = 1e-5;

/**
 * The scale s on the face's T(U) whose video time at `speed` (m/s) is `target` (s), by Hertz similarity (the header):
 * s · freeFace(speed, { shift: shift/s }).videoTime = target, solved by bisection on s ∈ [0.3, 3] to SCALE_TOLERANCE.
 * Every s reads the same run at its own threshold, so the face is played once; its step is not scaled with s, a
 * difference of under a step in the video time. The new law's t0 is s times today's, a parameter in T(U)'s sense: the
 * force-on time, as reference/contact.json holds it.
 * `o.shift` is the threshold (default VISIBLE_SHIFT), `o.dt` freeFace's step, `o.start` the video's start (VideoStart;
 * default "moved"). Throws a RangeError naming the target and the bracket's two video times when the bracket does not
 * straddle it.
 */
export function faceScaleFor(
    target: number,
    speed: number,
    o: { readonly dt?: number; readonly shift?: number; readonly start?: VideoStart } = {},
): number {
    const shift = o.shift ?? VISIBLE_SHIFT;
    let [lo, hi] = SCALE_BRACKET as readonly [number, number];
    const run = playFace(speed, o.dt ?? IMPACT_DT, shift / lo);
    const video = (s: number): number => s * (run.videoAt(shift / s, o.start) as number);
    const low = video(lo);
    const high = video(hi);
    if (!(low <= target && target <= high)) {
        throw new RangeError(
            `faceScaleFor: the target ${target} s at ${speed} m/s lies outside the bracket's video times, ` +
                `${low} s at scale ${lo} and ${high} s at scale ${hi}`,
        );
    }
    while (hi - lo > SCALE_TOLERANCE) {
        const mid = (lo + hi) / 2;
        if (video(mid) < target) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    return (lo + hi) / 2;
}

/** The ball–ball conversion's step (s): design §2.2's 1e-7 s, as section I's free collisions. */
const BALL_BALL_DT = 1e-7;

/** Numerical, not physical: the ternary search's iterations, which shrink its bracket by (2/3)^60, about 3e-11. */
const TERNARY_ITERATIONS = 60;

/** The ball–ball search's bracket, as fractions of the target: design §2.2's [0.5, 1.5]. */
const BALL_BALL_BRACKET = [0.5, 1.5] as const;

/**
 * Numerical, not physical: how near either end of its bracket, as a fraction of the bracket's width, the ball–ball
 * search may end before it is taken to have run into that end: about the bracket left after 11 iterations. The video
 * times are whole steps, and their plateaus can stall a search bound for an end a little short of it (0.4 % of the
 * width for a 0.1 ms target at a 2 mm threshold and dt 1e-6 s); a best T within 1 % of an end is suspect anyway.
 */
const BRACKET_EDGE = 0.01;

/**
 * The ball–ball law's parameter T (s; lawFromContactTime's contact time, the force-on time, as reference/contact.json
 * holds it) whose video time best matches `target` (s) on Table 1's three clean strokes
 * (FREE_COLLISIONS), P2b.2b.2c.2c design §2.2: the law lawFromContactTime(m/2, e, T, 0) at Table 1's e, the T in
 * [0.5, 1.5] × target that minimises the largest |video − target| over the three speeds, by ternary search at `o.dt`
 * (default 1e-7 s), threshold `o.shift` (default VISIBLE_SHIFT) and video start `o.start` (VideoStart; default
 * "moved"). `misses` are the signed video − target (s) at that T, in FREE_COLLISIONS' order. Throws a RangeError naming
 * the target and the bracket when the search ends at either end of the bracket (within BRACKET_EDGE of its width): the
 * best T then lies outside it.
 */
export function ballBallTimeFor(
    target: number,
    o: { readonly dt?: number; readonly shift?: number; readonly start?: VideoStart } = {},
): { readonly time: number; readonly misses: readonly number[] } {
    const mass = defaultWorld().ball.mass;
    const options = { ...o, dt: o.dt ?? BALL_BALL_DT };
    const missesAt = (T: number): number[] =>
        FREE_COLLISIONS.map(
            (c) =>
                freeCollision(c.speed, lawFromContactTime(mass / 2, c.restitution, T, 0), options).videoTime - target,
        );
    const worst = (T: number): number => Math.max(...missesAt(T).map((m) => Math.abs(m)));
    const [first, last] = BALL_BALL_BRACKET.map((f) => f * target) as [number, number];
    let lo = first;
    let hi = last;
    for (let i = 0; i < TERNARY_ITERATIONS; i++) {
        const a = lo + (hi - lo) / 3;
        const b = hi - (hi - lo) / 3;
        if (worst(a) <= worst(b)) {
            hi = b;
        } else {
            lo = a;
        }
    }
    const time = (lo + hi) / 2;
    const margin = BRACKET_EDGE * (last - first);
    if (time - first < margin || last - time < margin) {
        throw new RangeError(
            `ballBallTimeFor: the best time for the target ${target} s lies outside the bracket ` +
                `[${first}, ${last}] s: the search ended at ${time} s, at its edge`,
        );
    }
    return { time, misses: missesAt(time) };
}

/**
 * `samples` (as videoIntervals takes them, s and m) as the 8,000 fps camera sees them (P2b.2b.2c.2c design §5.3): for
 * each phase k of `o.phases` (default 16), frames at the times (n + k/phases) · VIDEO_FRAME up to the last sample's,
 * each showing the first sample at or after it, run through videoIntervals at `o.shift` (default VISIBLE_SHIFT). The
 * intervals are in s, at the frames' times, one list per phase in phase order. Frames begin at t = 0, so `samples` must
 * open at t = 0 in contact, or before it with the approach (videoIntervals' precondition, for every phase): a phase
 * whose first frame already shows the gap after the contact reports no release. scripts/croquetFitProbe.ts's section F
 * starts its samples at first touch, the approach prepended, so that every phase's first frame shows the face's contact.
 */
export function cameraIntervals(
    samples: readonly { readonly t: number; readonly separation: number }[],
    o: { readonly shift?: number; readonly phases?: number } = {},
): readonly (readonly VideoInterval[])[] {
    const phases = o.phases ?? 16;
    const last = samples[samples.length - 1];
    const result: (readonly VideoInterval[])[] = [];
    for (let k = 0; k < phases; k++) {
        const frames: { t: number; separation: number }[] = [];
        let j = 0;
        for (let n = 0; last !== undefined; n++) {
            const t = (n + k / phases) * VIDEO_FRAME;
            if (t > last.t) {
                break;
            }
            while ((samples[j] as (typeof samples)[number]).t < t) {
                j++;
            }
            frames.push({ t, separation: (samples[j] as (typeof samples)[number]).separation });
        }
        result.push(videoIntervals(frames, o.shift));
    }
    return result;
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
