/**
 * Single-ball probe (P2b.2b.2c.1 design §8.4, §8.5, §10): the pre-flight gate's figures, on the default world and
 * profile as reference/swing.json holds them; its section headings cite the design's section and the gate's date, and
 * the design's Amendments list the gate's rulings. Every stroke planning a speed takes the default stroke's inputs
 * (strokeFor: the preset's defaultBackswing fixed, the intensity solved). Every figure to 4 decimals. Reports:
 * - A. U(i): every swing preset's planned contact speed at intensity 0, 0.1, …, 1 from its default backswing and from
 *   its body-limited top at κ = ⅔, and from its top at κ = ½ and ¾, each κ's τ_0 and ω_max fitted (fitEffort);
 * - B. the default stroke: each swing preset's defaultBackswing h_0, U(0) and U(1) from it, and strokeFor's
 *   backswing, intensity and regime at 1, 2, …, 9 m/s, its rejections printed;
 * - C. θ_max: the body's θ_max and its derivation at knee height (the default mallet's head rising 0.48 m,
 *   kneeLimit), the head's rise at it on the default mallet and on the user's, and the knee check;
 * - D. the styles: the single-ball stroke at 3 and 5 m/s, rising (no advance) and level (the advance on time, handReach
 *   0.3 m): the striker's launch and spin at the face's release and at handover (the impact can hold the ball on the
 *   turf long after the face lets it go), its skid and travel, the face's contact time, the head's highest point over
 *   the advance, the follow-through's finish and flags, the level stroke's hands' advance (the body's peak
 *   acceleration a, V, W = V/a, the ramp's, cruise's and rest's distances) and the planned hands' travel along aim
 *   from contact to rest (at most handReach, the advance's travel and the plan's sharing one push);
 * - E. the mistimed advance: the single-ball stroke at 3 m/s with handReach 0.3 m, the advance from 0.02 s early to
 *   0.32 s late and none, then `drive` from 0 to 1 with no advance: the face's contact time, the head's highest point
 *   after contact, whether the advance started before the finish, and the fault judge's findings;
 * - F. the flick: the single-ball stroke at 3 and 5 m/s, the stance's lean from −20° to
 *   +10° in 2° steps, the stroke re-solved at each lean for the speed: the head's rise angle at the first face contact,
 *   the striker's launch angle at the face's release (the measure) and at handover, airborne or not in phase 2
 *   (recorded, not the measure); per speed, the leans launching upward and the launch angle's trend over the lean;
 * - G. head ahead: over D–F and the single-ball and GC stop presets' swingProbe grid
 *   (speed × drive × contact height × side), every state with the head's centre ahead of the striker's ball's centre
 *   along aim within L/2 + 2R, across within faceWidth/2 + R, and its lowest point below the ball's top: at every
 *   impact step, and at every follow-through sample against the striker's phase-2 state; each such run with its times,
 *   labelled as the known double-tap gap (roadmap);
 * - H. the guard: every RangeError naming "non-finite" over the runs above, I's and J's, and the other rejections;
 * - I. θ_max's rejections: the count from the rejected-runs list given as the first argument, and how many of its runs
 *   the committed engine now plays through strokeFor (simulateShot) and how many it still rejects;
 * - J. the user's checks (design §8.5), through simulateShot on an open world: defaultWorld(10)'s gravity,
 *   ball, materials and surface on a uniform OPEN_LAWN-square lawn with no hoops (its peg far off the line), the
 *   striker started at OPEN_START: the single ball from a 0.45 m backswing over intensity 0–1 against the user's 5, 15
 *   and 30 yd, and the drive from its top at intensity 1, both balls against the full 35 yd; each a distance to rest,
 *   a ball phase 2 halts marked "halted";
 * - K. the cost: each swing preset's downswing table's length at its default and at its top at intensity 1.
 * Times are s from the planned contact unless marked. Run with
 * `npx --yes tsx scripts/singleBallProbe.ts <rejected runs file>`; environment: SECTION (one of A–K; default all; G
 * tallies only the sections that ran). Not part of the test suite; its output is the gate's.
 */
import { headLowestPoint } from "../src/engine/impact/contacts";
import type { FollowThrough } from "../src/engine/impact/integrate";
import { faceHalfHeight } from "../src/engine/impact/shape";
import { simulateStroke } from "../src/engine/impact/simulateImpact";
import { advanceTravel, handsAt, prepareTrack } from "../src/engine/impact/track";
import type { HeadState, ImpactResult, MalletHead, SwingArc, TrackDrive } from "../src/engine/impact/types";
import { dot, horizontal, length, scale, sub, vec3, type Vec3 } from "../src/engine/math/vec3";
import { judgeFaults } from "../src/engine/faults";
import { stateAtTime } from "../src/engine/sample";
import { simulateShot, strokeContext } from "../src/engine/shot";
import { simulateFreeMotion } from "../src/engine/simulate";
import {
    contactPose,
    handsAheadFor,
    headShapeOf,
    planStroke,
    plannedSpeed,
    stanceLean,
    type StanceGeometry,
    type StrokePlan,
} from "../src/engine/swing/buildContact";
import { ON_TIME, defaultProfile } from "../src/engine/swing/profile";
import type { ShotSetup, StrokeType, SwingEffort, SwingProfile, SwingStance } from "../src/engine/swing/types";
import { BALL_IDS, type BallState, type ShotResult } from "../src/engine/types";
import { defaultWorld } from "../src/engine/world";
import { swingBodyReference, swingReference } from "../src/reference/index";
import { canonicalSetup, regimeOf, strokeFor, type CanonicalOptions } from "../tests/engine/support/shot";
import { SWING_PRESETS, bodyTop, contactArm, fitEffort, kneeLimit, speedAt } from "./effortFit";
import { OPEN_LAWN, OPEN_START, haltedText, openWorld, opened } from "./openLawn";

// The project has no Node types; this script runs under tsx and reads its environment, its argument and one file.
declare const process: {
    readonly env: Readonly<Record<string, string | undefined>>;
    readonly argv: readonly string[];
};

const SECTION = process.env.SECTION ?? "all";
const WORLD = defaultWorld();
const R = WORLD.ball.radius;
const fmt = (x: number): string => x.toFixed(4);
const deg = (rad: number): string => fmt((rad * 180) / Math.PI);
const ms = (t: number): string => fmt(t * 1e3);
const runs = (section: string): boolean => SECTION === "all" || SECTION === section;

/** A yard (m). */
const YARD = 0.9144;

/** The intensities of U(i): 0, 0.1, …, 1. */
const INTENSITIES = Array.from({ length: 11 }, (_, k) => k / 10);

/** The body's κ, swing.json's effortShare (⅔), and the gate's two others. */
const KAPPA = swingBodyReference.effortShare.value;
const KAPPAS: readonly (readonly [string, number])[] = [
    ["½", 1 / 2],
    ["⅔", KAPPA],
    ["¾", 3 / 4],
];

/** The level stroke's travel (m): the hands' advance over 0.3 m (design §8.4). */
const LEVEL_REACH = 0.3;

/** The user's knee-height top (m), the head's rise on the default mallet (design §5.2). */
const KNEE = 0.48;

/** The user's mallet: a 42 in shaft and a 13.5 in head, the top hand 0.1094 m below the handle, else the default. */
const USER_SHAFT = 1.0668;
const USER_HEAD = 0.3429;
const USER_TOP = 0.9574;

/** B's speeds (m/s): strokeFor's three regimes across them. */
const B_SPEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const EFFORTS = new Map<number, SwingEffort>();

/** fitEffort at `kappa`, fitted once. */
function effortAt(kappa: number): SwingEffort {
    const known = EFFORTS.get(kappa);
    if (known !== undefined) {
        return known;
    }
    const fitted = fitEffort(kappa);
    EFFORTS.set(kappa, fitted);
    return fitted;
}

/** A RangeError a run threw: the section and run, and its message. */
interface Thrown {
    readonly section: string;
    readonly label: string;
    readonly message: string;
}

/** The guard's catches (a message naming "non-finite"), and every other RangeError. */
const GUARD: Thrown[] = [];
const REJECTED: Thrown[] = [];

/** `f()`, or null if it throws a RangeError, which is kept: in GUARD if it names "non-finite", else in REJECTED. */
function attempt<T>(section: string, label: string, f: () => T): T | null {
    try {
        return f();
    } catch (error) {
        if (error instanceof RangeError) {
            const thrown = { section, label, message: error.message };
            (error.message.includes("non-finite") ? GUARD : REJECTED).push(thrown);
            return null;
        }
        throw error;
    }
}

/** One run's head-ahead tally: the states checked and the failing ones, times from contact. */
interface Ahead {
    readonly states: number;
    readonly failures: number;
    readonly first: number;
    readonly last: number;
    /** The most the head's lowest point lay below the ball's top in a failing state (m). */
    readonly deepest: number;
}

/**
 * The head-ahead check for `head` on `aim`, a head low enough to block the ball's path: with d = aim·(c_head − c_ball)
 * and e the across distance, horizontally, a failure is d > 0, d < L/2 + 2R, e < faceWidth/2 + R and the head's lowest
 * point below the ball's top.
 */
function aheadCheck(head: MalletHead, aim: Vec3, contactAt: number) {
    const along = head.length / 2 + 2 * R;
    const across = (head.shape.kind === "box" ? head.shape.halfWidth : head.shape.radius) + R;
    let states = 0;
    let failures = 0;
    let first = NaN;
    let last = NaN;
    let deepest = 0;
    return {
        check(t: number, state: HeadState, ball: Vec3): void {
            states++;
            const offset = sub(state.position, ball);
            const d = dot(offset, aim);
            const e = length(horizontal(sub(offset, scale(aim, d))));
            const below = ball.z + R - headLowestPoint(state, head);
            if (d > 0 && d < along && e < across && below > 0) {
                failures++;
                if (Number.isNaN(first)) {
                    first = t - contactAt;
                }
                last = t - contactAt;
                deepest = Math.max(deepest, below);
            }
        },
        result(): Ahead {
            return { states, failures, first, last, deepest };
        },
    };
}

/** One stroke with its follow-through and phase 2. */
interface Run {
    readonly setup: ShotSetup;
    readonly plan: StrokePlan;
    readonly arc: SwingArc;
    readonly impact: ImpactResult;
    readonly follow: FollowThrough;
    readonly motion: ShotResult;
    /** The head centre's height at every impact step, and its times (s from t = 0). */
    readonly steps: { readonly t: readonly number[]; readonly z: readonly number[] };
    /** The head's rise angle (rad) just before its first face contact with the striker; NaN if never struck. */
    readonly riseAngle: number;
    /**
     * The striker's ball at the first impact step after its first face contact ends, and when (s from t = 0); null if
     * that contact lasts to the impact's end. The handover can come much later, the ball on the turf meanwhile.
     */
    readonly release: { readonly t: number; readonly ball: BallState } | null;
    readonly ahead: Ahead;
}

/** Every head-ahead tally, by section and run. */
const AHEAD: { readonly section: string; readonly label: string; readonly ahead: Ahead }[] = [];

/** `make()`'s stroke run with its follow-through and phase 2, checked for the head ahead; null if it threw. */
function stroke(section: string, label: string, make: () => ShotSetup): Run | null {
    const run = attempt(section, label, (): Run => {
        const setup = make();
        const plan = planStroke(setup, WORLD);
        const arc = (plan.contact.drive as TrackDrive).arc;
        const head = plan.contact.head;
        const striker = BALL_IDS.filter((id) => setup.balls[id] !== undefined).indexOf(setup.striker);
        const key = `face/${setup.striker}`;
        const ahead = aheadCheck(head, arc.aim, arc.contactAt);
        const t: number[] = [];
        const z: number[] = [];
        let previous: HeadState = plan.contact;
        let riseAngle = NaN;
        let release: Run["release"] = null;
        const { result, follow } = simulateStroke(plan.contact, setup.balls, WORLD, {
            probe: {
                step(s) {
                    const ball = s.balls[striker] as BallState;
                    ahead.check(s.t, s.head, ball.position);
                    t.push(s.t);
                    z.push(s.head.position.z);
                    const touching = s.contacts.some((c) => c.key === key);
                    if (Number.isNaN(riseAngle) && touching) {
                        riseAngle = Math.atan2(previous.velocity.z, dot(previous.velocity, arc.aim));
                    }
                    if (!Number.isNaN(riseAngle) && !touching && release === null) {
                        release = { t: s.t, ball };
                    }
                    previous = s.head;
                },
            },
        });
        const motion = simulateFreeMotion(result.handover, WORLD);
        for (const sample of follow.samples) {
            if (sample.t >= result.duration) {
                const ball = stateAtTime(motion, setup.striker, sample.t - result.duration).position;
                ahead.check(sample.t, sample.head, ball);
            }
        }
        return {
            setup,
            plan,
            arc,
            impact: result,
            follow,
            motion,
            steps: { t, z },
            riseAngle,
            release,
            ahead: ahead.result(),
        };
    });
    if (run !== null) {
        AHEAD.push({ section, label, ahead: run.ahead });
    }
    return run;
}

/** `type`'s canonical setup with `over`, its default stroke's inputs planning `speed` (m/s) on WORLD (strokeFor). */
function atSpeed(type: StrokeType, speed: number, over: CanonicalOptions = {}): ShotSetup {
    const setup = canonicalSetup(type, over);
    return { ...setup, stroke: { ...setup.stroke, ...strokeFor(setup, speed, WORLD) } };
}

/** `setup`'s stroke inputs: its backswing, its intensity (or none) and strokeFor's regime. */
function strokeText(setup: ShotSetup): string {
    const { backswing, intensity } = setup.stroke;
    const effort = intensity === undefined ? "no intensity" : `intensity ${fmt(intensity)}`;
    return `backswing ${fmt(backswing)} m, ${effort} (regime ${regimeOf(setup)})`;
}

/** The head centre's height at the first impact step at or after contact (m). */
function contactHeight(r: Run): number {
    const index = r.steps.t.findIndex((t) => t >= r.arc.contactAt);
    return r.steps.z[index] as number;
}

/**
 * The head centre's highest point (m) above its height at contact, from `from` to `to` (s from t = 0): over the
 * impact's steps and the follow-through's samples.
 */
function highest(r: Run, from: number, to: number): number {
    let top = -Infinity;
    r.steps.t.forEach((t, i) => {
        if (t >= from && t <= to) {
            top = Math.max(top, r.steps.z[i] as number);
        }
    });
    for (const s of r.follow.samples) {
        if (s.t > r.impact.duration && s.t >= from && s.t <= to) {
            top = Math.max(top, s.head.position.z);
        }
    }
    return top - contactHeight(r);
}

/** The striker's ball's state at handover. */
const launched = (r: Run): BallState => r.impact.handover[r.setup.striker] as BallState;

/** The striker's ball at the face's release, else at handover. */
const released = (r: Run): BallState => r.release?.ball ?? launched(r);

/** The launch angle (rad above horizontal) of a ball in `state`. */
function launchAngle(state: BallState): number {
    const v = state.velocity;
    return Math.atan2(v.z, length(horizontal(v)));
}

/** A ball's launch in `state` on `aim`: its speed, along and up, its topspin ω·(ẑ × aim) and ωR over v along. */
function launchText(state: BallState, aim: Vec3): string {
    const v = state.velocity;
    const flat = length(horizontal(v));
    const topspin = dot(state.angularVelocity, vec3(0 - aim.y, aim.x, 0));
    return (
        `${fmt(length(v))} m/s (along ${fmt(flat)}, up ${fmt(v.z)}), topspin ${fmt(topspin)} rad/s ` +
        `(ωR/v ${fmt((topspin * R) / flat)}, |ω| ${fmt(length(state.angularVelocity))})`
    );
}

/** Whether the striker's ball leaves the turf in phase 2 (a `landing` event). */
const airborne = (r: Run): boolean => r.motion.events.some((e) => e.kind === "landing" && e.ball === r.setup.striker);

/** The face–striker contact: its first interval's length (ms) and the number of intervals. */
function faceText(r: Run): string {
    const intervals = r.impact.timeline[`face/${r.setup.striker}`] ?? [];
    const first = intervals[0];
    return first === undefined ? "face never met" : `face ${ms(first.end - first.start)} ms, ${intervals.length} hits`;
}

/** The follow-through's finish (s from contact), its flags and its advance's start and end (s from contact). */
function finishText(r: Run): string {
    const c = r.arc.contactAt;
    const flags = r.follow.flags.length > 0 ? r.follow.flags.join(" ") : "no flags";
    const advanced = r.follow.advanced;
    const advance =
        advanced === undefined
            ? "no advance recorded"
            : `advanced ${fmt(advanced.start - c)} to ${fmt(advanced.end - c)} s`;
    return `finish ${fmt(r.follow.finish - c)} s, ${flags}, ${advance}`;
}

/**
 * The striker's ball: its launch (launchText) at the face's release and at handover, each with its time from contact;
 * its skid from the face's release (the distance to its first phase-2 `phase` event into rolling, and when, s from
 * contact); and its travel from the start to rest.
 */
function ballLines(r: Run): string[] {
    const { striker } = r.setup;
    const c = r.arc.contactAt;
    const aim = r.arc.aim;
    const from = released(r).position;
    const rolling = r.motion.events.find((e) => e.kind === "phase" && e.ball === striker && e.phase === "rolling");
    const skidded = (t: number): number => length(horizontal(sub(stateAtTime(r.motion, striker, t).position, from)));
    const skid =
        rolling === undefined
            ? "never rolls"
            : `skid from the release ${fmt(skidded(rolling.t))} m, rolling from ` +
              `${fmt(r.impact.duration + rolling.t - c)} s`;
    const start = (r.setup.balls[striker] as BallState).position;
    const travel = length(horizontal(sub(r.motion.rest[striker] as Vec3, start)));
    const release =
        r.release === null
            ? "the face holds it to the impact's end"
            : `released at ${fmt(r.release.t - c)} s: ${launchText(r.release.ball, aim)}`;
    return [
        `ball ${release}; handover at ${fmt(r.impact.duration - c)} s: ${launchText(launched(r), aim)}`,
        `${skid}; travel ${fmt(travel)} m`,
    ];
}

function sectionA(): void {
    console.log(
        "== A. U(i) (design §4.2, §10): planned contact speed (m/s) at i = 0, 0.1, …, 1, from each swing preset's " +
            "default backswing and body-limited top ==",
    );
    const body = defaultProfile.body.effort;
    console.log(`the profile's effort: τ_0 ${fmt(body.torque)} N·m, ω_max ${fmt(body.speed)} rad/s (κ ${fmt(KAPPA)})`);
    for (const [name, kappa] of KAPPAS) {
        const effort = effortAt(kappa);
        console.log(`κ = ${name} (${fmt(kappa)}): τ_0 ${fmt(effort.torque)} N·m, ω_max ${fmt(effort.speed)} rad/s`);
        for (const type of SWING_PRESETS) {
            const rows: (readonly [string, number])[] = [["top", bodyTop(type)]];
            if (kappa === KAPPA) {
                rows.unshift(["default", swingReference[type].defaultBackswing.value]);
            }
            for (const [from, backswing] of rows) {
                const u = INTENSITIES.map((i) => fmt(speedAt(type, backswing, i, effort)));
                console.log(`  ${type.padEnd(11)} ${from.padEnd(7)} ${fmt(backswing)} m: ${u.join(" ")}`);
            }
        }
    }
}

function sectionB(): void {
    console.log(
        "== B. The default stroke (design §4.5, the pre-flight gate, 2026-10-18): each swing preset's " +
            "defaultBackswing h_0, U(0) and U(1) " +
            `from it, and strokeFor's inputs on its canonical setup at ${B_SPEEDS.join(", ")} m/s, each with its ` +
            "planned contact speed ==",
    );
    const effort = defaultProfile.body.effort;
    for (const type of SWING_PRESETS) {
        const h0 = swingReference[type].defaultBackswing.value;
        console.log(
            `${type.padEnd(11)} h_0 ${fmt(h0)} m: U(0) ${fmt(speedAt(type, h0, 0, effort))} m/s, U(1) ` +
                `${fmt(speedAt(type, h0, 1, effort))} m/s; top ${fmt(bodyTop(type))} m`,
        );
        for (const speed of B_SPEEDS) {
            const setup = canonicalSetup(type);
            const chosen = attempt("B", `${type} ${speed} m/s`, () => ({
                ...setup,
                stroke: { ...setup.stroke, ...strokeFor(setup, speed, WORLD) },
            }));
            const text =
                chosen === null
                    ? `rejected: ${(REJECTED[REJECTED.length - 1] as Thrown).message}`
                    : `${strokeText(chosen)}, planned ${fmt(plannedSpeed(chosen, WORLD))} m/s`;
            console.log(`  ${speed} m/s: ${text}`);
        }
    }
}

/** The stance geometry of mallet `m` on the world's ball. */
const geometryOf = (m: SwingProfile["mallet"]): StanceGeometry => ({
    ballRadius: R,
    headLength: m.headLength,
    faceHalfHeight: faceHalfHeight(headShapeOf(m.head)),
});

/** The user's mallet on the default profile, each swing preset's top hand moved, its lean kept. */
function userProfile(): SwingProfile {
    const mallet = { ...defaultProfile.mallet, shaftLength: USER_SHAFT, headLength: USER_HEAD };
    const stance: Record<StrokeType, SwingStance> = { ...defaultProfile.stance };
    for (const type of SWING_PRESETS) {
        const s = defaultProfile.stance[type];
        const up = canonicalSetup(type).stroke.contact.up;
        const lean = stanceLean(s.handsAhead, s.top, up, geometryOf(defaultProfile.mallet));
        stance[type] = { ...s, top: USER_TOP, handsAhead: handsAheadFor(lean, USER_TOP, up, geometryOf(mallet)) };
    }
    return { ...defaultProfile, mallet, stance };
}

function sectionC(): void {
    const limit = defaultProfile.body.backswingLimit;
    console.log(
        "== C. θ_max (design §5.2, the pre-flight gate, 2026-10-18): " +
            `the head's rise (m) at θ_max ${deg(limit)}° on the ` +
            `default mallet and the user's (${fmt(USER_SHAFT)} m shaft, ${fmt(USER_HEAD)} m head, top hand ` +
            `${fmt(USER_TOP)} m); knee height ${fmt(KNEE)} m on the default ==`,
    );
    const arm = contactArm("single-ball");
    const share = defaultProfile.shape["single-ball"].pendulumShare;
    console.log(
        `θ_max ${deg(limit)}° (${limit} rad, the profile's); derived at knee height (kneeLimit): the single-ball ` +
            `preset's head rising ${fmt(KNEE)} m on the default mallet, acos(cos θ_c − ${fmt(KNEE)}·s/ℓ) with θ_c ` +
            `${deg(arm.thetaContact)}°, s ${fmt(share)}, ℓ ${fmt(arm.lever)} m = ${deg(kneeLimit())}°`,
    );
    const user = userProfile();
    for (const type of SWING_PRESETS) {
        const pose = contactPose(canonicalSetup(type), WORLD);
        const lever = pose.head.socket.z + pose.radius;
        const share = defaultProfile.shape[type].pendulumShare;
        const userPose = contactPose({ ...canonicalSetup(type), profile: user }, WORLD);
        const userLever = userPose.head.socket.z + userPose.radius;
        const knee = Math.acos(Math.cos(pose.thetaContact) - (KNEE * share) / lever);
        const rise = bodyTop(type);
        console.log(
            `${type.padEnd(11)} default: θ_c ${deg(pose.thetaContact)}°, ℓ ${fmt(lever)} m, rise ${fmt(rise)} m ` +
                `(knee ${fmt(KNEE)} m: ${fmt(rise - KNEE)} m over it; knee height at ${deg(knee)}°; shaft ` +
                `horizontal ${fmt((lever * Math.cos(pose.thetaContact)) / share)} m); user's: θ_c ` +
                `${deg(userPose.thetaContact)}°, ℓ ${fmt(userLever)} m, rise ${fmt(bodyTop(type, user))} m`,
        );
    }
}

/** D's level stroke at `speed`: the advance on time over LEVEL_REACH. */
const level = (speed: number): ShotSetup =>
    atSpeed("single-ball", speed, { stroke: { handReach: LEVEL_REACH, timing: { ...ON_TIME, advance: 0 } } });

function sectionD(): void {
    console.log(
        `== D. The styles (design §8.4.1): single-ball at 3 and 5 m/s, rising (no advance) and level (advance 0, ` +
            `handReach ${fmt(LEVEL_REACH)} m) ==`,
    );
    for (const speed of [3, 5]) {
        const flat = stroke("D", `level ${speed} m/s`, () => level(speed));
        const rising = stroke("D", `rising ${speed} m/s`, () => atSpeed("single-ball", speed));
        const span = flat?.follow.advanced;
        for (const [name, r] of [
            ["rising", rising],
            ["level", flat],
        ] as const) {
            if (r === null) {
                console.log(`${speed} m/s ${name}: rejected`);
                continue;
            }
            const c = r.arc.contactAt;
            const over =
                span === undefined
                    ? "no advance recorded"
                    : `highest over the level advance ${fmt(highest(r, span.start, span.end))} m`;
            const [launch, travel] = ballLines(r);
            console.log(`${speed} m/s ${name.padEnd(6)} ${strokeText(r.setup)}; ${faceText(r)}`);
            console.log(`${"".padEnd(12)} ${launch}`);
            console.log(`${"".padEnd(12)} ${travel}`);
            const after = highest(r, c, r.follow.finish);
            console.log(`${"".padEnd(12)} head ${over}, after contact to the finish ${fmt(after)} m; ${finishText(r)}`);
            for (const line of advanceLines(r)) {
                console.log(`${"".padEnd(12)} ${line}`);
            }
        }
    }
}

/**
 * The level stroke's hands' advance on its prepared track: the body's peak acceleration a, V, W = V/a, and the
 * advance's travel along aim at the ramp's end, over the cruise to 0.8·D and at rest; then the planned hands' travel
 * along aim from contact (handsAt, 1 ms steps): at the advance's rest, the most to the finish and at the finish,
 * against handReach, at which the push stops them. None without an advance.
 */
function advanceLines(r: Run): string[] {
    const track = prepareTrack(r.plan.contact.drive as TrackDrive, r.plan.contact.head, WORLD.gravity);
    const a = track.push === null ? null : track.push.advance;
    if (a === null) {
        return [];
    }
    const c = r.arc.contactAt;
    const reach = r.setup.stroke.handReach ?? NaN;
    const ramped = advanceTravel(a, a.ramp).a;
    const cruised = advanceTravel(a, a.cruise).a;
    const from = handsAt(track, c).position;
    const along = (t: number): number => dot(sub(handsAt(track, t).position, from), r.arc.aim);
    let most = 0;
    for (let k = 0; c + k * 1e-3 <= r.follow.finish; k++) {
        most = Math.max(most, along(c + k * 1e-3));
    }
    return [
        "hands' advance (the pre-flight gate, 2026-10-18): " +
            `a ${fmt(a.accel)} m/s², V ${fmt(a.speed)} m/s, W = V/a ${fmt(a.speed / a.accel)} ` +
            `s; from ${fmt(a.start - c)} s, ramp's travel V²/(2a) ${fmt(ramped)} m to ${fmt(a.ramp - c)} s, cruise ` +
            `${fmt(cruised - ramped)} m to 0.8·D ${fmt(cruised)} m at ${fmt(a.cruise - c)} s, rest at ` +
            `${fmt(advanceTravel(a, a.end).a)} m at ${fmt(a.end - c)} s`,
        "hands' travel along aim from contact (the pre-flight gate, 2026-10-18): " +
            `${fmt(along(a.end))} m at the advance's rest, at most ` +
            `${fmt(most)} m to the finish, ${fmt(along(r.follow.finish))} m at it; handReach ${fmt(reach)} m`,
    ];
}

/** E's line for one run: the face, the head's highest point after contact, the advance and the fault judge. */
function mistimedText(r: Run): string {
    const c = r.arc.contactAt;
    const findings = judgeFaults(strokeContext(r.setup, r.impact), r.impact).findings;
    const faults = findings.length > 0 ? findings.map((f) => `${f.law} ${f.tier}`).join(", ") : "none";
    const started = r.follow.advanced === undefined ? "no" : "yes";
    return (
        `${faceText(r)}; head's highest after contact ${fmt(highest(r, c, r.follow.finish))} m; advance started ` +
        `before the finish: ${started}; ${finishText(r)}; faults: ${faults}`
    );
}

function sectionE(): void {
    console.log(
        `== E. The mistimed advance (design §8.4.2): single-ball 3 m/s, handReach ${fmt(LEVEL_REACH)} m, the ` +
            "advance (s from contact) swept; then drive 0–1 with no advance at the preset's reach ==",
    );
    const timings: (number | undefined)[] = [-0.02, -0.01, -0.005, 0, 0.005, 0.01, 0.02, 0.04, 0.08, 0.16, 0.32];
    timings.push(undefined);
    for (const advance of timings) {
        const name = advance === undefined ? "none" : fmt(advance);
        const timing = advance === undefined ? ON_TIME : { ...ON_TIME, advance };
        const r = stroke("E", `advance ${name}`, () =>
            atSpeed("single-ball", 3, { stroke: { handReach: LEVEL_REACH, timing } }),
        );
        console.log(`advance ${name.padStart(7)}: ${r === null ? "rejected" : mistimedText(r)}`);
    }
    for (const drive of [0, 0.25, 0.5, 0.75, 1]) {
        const r = stroke("E", `drive ${fmt(drive)}`, () => atSpeed("single-ball", 3, { stroke: { drive } }));
        console.log(`drive ${fmt(drive)}: ${r === null ? "rejected" : mistimedText(r)}`);
    }
}

function sectionF(): void {
    console.log(
        "== F. The flick (design §8.4.3, the pre-flight gate, 2026-10-18): single-ball, " +
            "the stance's lean −20° to +10° " +
            "(negative: the hands behind), the stroke re-solved for the speed at each lean (strokeFor); the measure " +
            "is the ball's launch angle at the face's release, phase 2's airborne recorded alongside ==",
    );
    const stance = defaultProfile.stance["single-ball"];
    const geometry = geometryOf(defaultProfile.mallet);
    for (const speed of [3, 5]) {
        const angles: { lean: number; launch: number }[] = [];
        for (let lean = -20; lean <= 10; lean += 2) {
            const handsAhead = handsAheadFor((lean * Math.PI) / 180, stance.top, 0, geometry);
            const r = stroke("F", `${speed} m/s lean ${lean}°`, () =>
                atSpeed("single-ball", speed, { stance: { handsAhead } }),
            );
            if (r === null) {
                console.log(`${speed} m/s lean ${String(lean).padStart(3)}°: rejected`);
                continue;
            }
            const launch = launchAngle(released(r));
            angles.push({ lean, launch });
            console.log(
                `${speed} m/s lean ${String(lean).padStart(3)}° (hands ahead ${fmt(handsAhead)} m, ` +
                    `${strokeText(r.setup)}): head rising ${deg(r.riseAngle)}° at the first face contact; launch ` +
                    `angle at the face's release ${deg(launch)}° (${fmt(length(released(r).velocity))} m/s), at ` +
                    `handover ${deg(launchAngle(launched(r)))}° (${fmt(length(launched(r).velocity))} m/s); ` +
                    `${airborne(r) ? "airborne" : "on the turf"} in phase 2 (recorded)`,
            );
        }
        console.log(`${speed} m/s: ${flickSummary(angles)}`);
    }
}

/**
 * F's summary over the played leans (recorded, no threshold): the leans whose launch angle at the face's release is
 * above 0 (the ball leaving upward), and the angle's trend over the lean: the direction of every step, and its first
 * and last values with the mean change per degree of lean.
 */
function flickSummary(angles: readonly { lean: number; launch: number }[]): string {
    const first = angles[0];
    const last = angles[angles.length - 1];
    if (first === undefined || last === undefined) {
        return "no lean played";
    }
    const upward = angles.filter((a) => a.launch > 0).map((a) => `${a.lean}°`);
    const steps = angles.slice(1).map((a, k) => a.launch - (angles[k] as { launch: number }).launch);
    const direction = steps.every((d) => d < 0)
        ? "falls at every step as the lean grows"
        : steps.every((d) => d > 0)
          ? "rises at every step as the lean grows"
          : "not monotone in the lean";
    const slope = last.lean === first.lean ? NaN : (last.launch - first.launch) / (last.lean - first.lean);
    return (
        `launching upward at ${upward.length > 0 ? upward.join(", ") : "no lean"}; the launch angle ${direction}: ` +
        `${deg(first.launch)}° at ${first.lean}° to ${deg(last.launch)}° at ${last.lean}°, ${deg(slope)}° per degree ` +
        "of lean"
    );
}

/** The label for a head-ahead run: a known gap, not a failure. */
const DOUBLE_TAP =
    "double tap (GC 11.2.4, AC 29.1.6.2): the head reaches the stopped striker's ball after the face has released " +
    "it; the follow-through does not yet detect head–ball contact (roadmap)";

/** swingProbe's preset grid for `type`, each run's follow-through checked for the head ahead. */
function grid(type: StrokeType): void {
    const up0 = canonicalSetup(type).stroke.contact.up;
    for (const speed of [1, 2, 3, 4, 6]) {
        for (const drive of [-1, -0.5, 0, 0.5, 1]) {
            for (const up of [up0 - 0.003, up0, up0 + 0.003]) {
                for (const side of [-0.01, 0, 0.01]) {
                    const label = `${type} ${speed} m/s drive ${drive} up ${fmt(up)} side ${fmt(side)}`;
                    stroke(`G ${type}`, label, () =>
                        atSpeed(type, speed, { stroke: { drive, contact: { up, side } } }),
                    );
                }
            }
        }
    }
}

function sectionG(): void {
    console.log(
        "== G. Head ahead (design §8.4.4, the pre-flight gate, 2026-10-18): " +
            "d > 0, d < L/2 + 2R, e < faceWidth/2 + R and " +
            "the head's lowest point below the ball's top; impact steps and follow-through samples. Each such run is " +
            "labelled as the known gap, not a failure ==",
    );
    grid("single-ball");
    grid("stop-gc");
    const sections = [...new Set(AHEAD.map((a) => a.section))];
    for (const section of sections) {
        const mine = AHEAD.filter((a) => a.section === section);
        const ahead = mine.filter((a) => a.ahead.failures > 0);
        const states = mine.reduce((sum, a) => sum + a.ahead.states, 0);
        const rejected = REJECTED.filter((x) => x.section === section).length;
        console.log(
            `${section.padEnd(15)} ${mine.length} runs (${rejected} rejected), ${states} states: ${ahead.length} ` +
                "runs with the head ahead",
        );
        for (const a of ahead) {
            const { failures, first, last, deepest } = a.ahead;
            console.log(
                `${"".padEnd(15)} ${a.label}: ${DOUBLE_TAP}; ${failures} states from ${fmt(first)} to ` +
                    `${fmt(last)} s, the head ${ms(deepest)} mm below the ball's top at most`,
            );
        }
    }
    const total = AHEAD.filter((a) => a.ahead.failures > 0).length;
    console.log(`head-ahead runs: ${total} of ${AHEAD.length} (double tap, the known gap; roadmap)`);
}

function sectionH(): void {
    console.log('== H. The guard (design §3): RangeErrors naming "non-finite" over every run (expected none) ==');
    console.log(`guard catches: ${GUARD.length}`);
    for (const g of GUARD) {
        console.log(`CATCH ${g.section} ${g.label}: ${g.message}`);
    }
    const counts = new Map<string, number>();
    for (const x of REJECTED) {
        const key = `${x.section}: ${x.message}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    console.log(`other rejections: ${REJECTED.length}`);
    for (const [key, count] of counts) {
        console.log(`  ${count}× ${key}`);
    }
}

/** Reads the text file at `path` (tsx runs under Node; the project has no Node types). */
async function readText(path: string): Promise<string> {
    const specifier = "node:fs";
    const fs = (await import(/* @vite-ignore */ specifier)) as {
        readFileSync(path: string, encoding: "utf8"): string;
    };
    return fs.readFileSync(path, "utf8");
}

/** A rejected run's line: "<type> <speed> m/s drive <drive> up <up> side <side>: rejected (…)". */
const REJECTED_RUN = /^(\S+) (\S+) m\/s drive (\S+) up (\S+) side (\S+): rejected/;

/**
 * I's lines: the rejected-runs list (the runs θ_max rejected when it landed) counted by preset, and each run replayed
 * on the committed engine, its stroke from strokeFor and run through simulateShot (computed before G and H, so that the
 * guard's tally covers them).
 */
async function rejectionChecks(): Promise<string[]> {
    const path = process.argv[2];
    const out = [
        "== I. θ_max's rejections (design §8.2.2): the runs θ_max rejected when it landed. Its lines read " +
            "\"backswingFor: N m/s is beyond the <type> stroke's reach\", not θ_max: backswingFor's reach check " +
            "reads the speed at θ_max and fires first (design Amendments, backswingFor's bracket, 2026-10-18). " +
            "Each run replayed " +
            "through strokeFor and simulateShot on the committed engine ==",
    ];
    if (path === undefined) {
        out.push("no list given");
        return out;
    }
    const lines = (await readText(path)).split("\n").filter((line) => line.trim().length > 0);
    const byType = new Map<string, number>();
    let reach = 0;
    const plays = new Map<string, number>();
    const still = new Map<string, number>();
    for (const line of lines) {
        const type = line.split(" ")[0] as string;
        byType.set(type, (byType.get(type) ?? 0) + 1);
        reach += line.includes("beyond the") && line.includes("reach") ? 1 : 0;
        const m = REJECTED_RUN.exec(line);
        if (m === null) {
            throw new Error(`section I: an unreadable line: ${line}`);
        }
        const [, kind, speed, drive, up, side] = m as unknown as readonly string[];
        const label = line.slice(0, line.indexOf(":"));
        const shot = attempt("I", label, () => {
            const setup = atSpeed(kind as StrokeType, Number(speed), {
                stroke: { drive: Number(drive), contact: { up: Number(up), side: Number(side) } },
            });
            simulateShot(setup, WORLD);
            return `${kind} regime ${regimeOf(setup)}`;
        });
        if (shot === null) {
            const key = `${kind}: ${(REJECTED[REJECTED.length - 1] as Thrown).message}`;
            still.set(key, (still.get(key) ?? 0) + 1);
        } else {
            plays.set(shot, (plays.get(shot) ?? 0) + 1);
        }
    }
    const total = (counts: Map<string, number>): number => [...counts.values()].reduce((sum, n) => sum + n, 0);
    out.push(
        `the list: ${lines.length} rejected runs (${reach} beyond the stroke's reach): ` +
            `${[...byType].map(([type, count]) => `${type} ${count}`).join(", ")}`,
        `now played through strokeFor: ${total(plays)}; still rejected: ${total(still)}`,
    );
    for (const [key, count] of plays) {
        out.push(`  plays ${count}× ${key}`);
    }
    for (const [key, count] of still) {
        out.push(`  rejects ${count}× ${key}`);
    }
    return out;
}

let rejections: string[] | null = null;

async function sectionI(): Promise<void> {
    for (const line of rejections ?? (await rejectionChecks())) {
        console.log(line);
    }
}

/** J's lines: its shots run before G and H, so that the guard's tally covers them, and print in J's place. */
function userChecks(): string[] {
    const world = openWorld();
    const lines = [
        "== J. The user's checks (design §8.5, the pre-flight gate, 2026-10-18; recorded, not gated): " +
            "simulateShot on an open world " +
            `(defaultWorld(10)'s gravity, ball, materials and surface, no hoops, a ${OPEN_LAWN} m square lawn, the ` +
            `striker from (${fmt(OPEN_START.x)}, ${fmt(OPEN_START.y)}) m aiming +y); distances to rest; the user's ` +
            "single-ball strokes 5, 15 and 30 yd, the full lawn 35 yd ==",
    ];
    for (const intensity of INTENSITIES) {
        const setup = opened(canonicalSetup("single-ball", { world, stroke: { backswing: 0.45, intensity } }));
        const shot = attempt("J", `single-ball 0.45 m i ${fmt(intensity)}`, () => simulateShot(setup, world));
        if (shot === null) {
            lines.push(`single-ball 0.45 m, i ${fmt(intensity)}: rejected`);
            continue;
        }
        const start = (setup.balls.blue as BallState).position;
        const travel = length(horizontal(sub(shot.motion.rest.blue as Vec3, start)));
        lines.push(
            `single-ball 0.45 m, i ${fmt(intensity)}: ${fmt(shot.contactSpeed)} m/s, ${fmt(travel)} m = ` +
                `${fmt(travel / YARD)} yd${haltedText(shot.motion, "blue")}`,
        );
    }
    const top = bodyTop("drive");
    const setup = opened(canonicalSetup("drive", { world, stroke: { backswing: top, intensity: 1 } }));
    const shot = attempt("J", "drive top i 1", () => simulateShot(setup, world));
    if (shot === null) {
        lines.push("drive from its top at i 1: rejected");
        return lines;
    }
    const travel = (id: "blue" | "red"): number =>
        length(horizontal(sub(shot.motion.rest[id] as Vec3, (setup.balls[id] as BallState).position)));
    lines.push(
        `drive from its top ${fmt(top)} m at i 1: ${fmt(shot.contactSpeed)} m/s; croqueted ${fmt(travel("red"))} m = ` +
            `${fmt(travel("red") / YARD)} yd${haltedText(shot.motion, "red")}, striker ${fmt(travel("blue"))} m = ` +
            `${fmt(travel("blue") / YARD)} yd${haltedText(shot.motion, "blue")}; the user's full lawn 35 yd`,
    );
    return lines;
}

let checked: string[] | null = null;

function sectionJ(): void {
    for (const line of checked ?? userChecks()) {
        console.log(line);
    }
}

function sectionK(): void {
    console.log("== K. The cost (design §11): the downswing table's length (samples) and its release (s) ==");
    for (const type of SWING_PRESETS) {
        const cells = (
            [
                ["default", canonicalSetup(type)],
                ["top i 1", canonicalSetup(type, { stroke: { backswing: bodyTop(type), intensity: 1 } })],
            ] as const
        ).map(([name, setup]) => {
            const plan = attempt("K", `${type} ${name}`, () => planStroke(setup, WORLD));
            const down = plan === null ? undefined : (plan.contact.drive as TrackDrive).arc.downswing;
            return down === undefined
                ? `${name} rejected`
                : `${name} ${down.theta.length} samples, release ${fmt(down.release)} s`;
        });
        console.log(`${type.padEnd(11)} ${cells.join("; ")}`);
    }
}

const SECTIONS: Readonly<Record<string, () => void | Promise<void>>> = {
    A: sectionA,
    B: sectionB,
    C: sectionC,
    D: sectionD,
    E: sectionE,
    F: sectionF,
    G: sectionG,
    H: sectionH,
    I: sectionI,
    J: sectionJ,
    K: sectionK,
};
if (SECTION !== "all" && SECTIONS[SECTION] === undefined) {
    throw new Error(`SECTION must be "all" or one of ${Object.keys(SECTIONS).join(", ")}`);
}
for (const [name, section] of Object.entries(SECTIONS)) {
    if (name === "G" && runs("I")) {
        rejections = await rejectionChecks();
    }
    if (name === "G" && runs("J")) {
        checked = userChecks();
    }
    if (runs(name)) {
        await section();
    }
}
