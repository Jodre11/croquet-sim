/**
 * Stroke probe (P2b.2b.2a design §8: measurements recorded in the roadmap, not gated). On the default world with the
 * default profile's canonical setups (tests/engine/support/shot.ts), reports:
 * - speeds: per preset, the planned contact speed against the backswing at intensity 0, 0.5 and 1, with the
 *   downswing's time;
 * - canonical: per preset at its default backswing, with the trajectory: the planned speed, the downswing's time and
 *   lowest clearance (and when), the lead, the impact's length, the finish's time and flags, the head's rise and
 *   travel along aim from contact to the finish (the apex, or the roll's reach), and the coaching ratio against
 *   P2b.2b.1's; then the stance in the player's terms (the top hand ahead of the ball's centre, the lean and the
 *   point of impact, P2b.2b.2b.1);
 * - fat: the canonical single-ball stroke met higher on the face (the head lower), 2 to 7 mm: the lead, the dig, and
 *   the planned against the real speed at the first face–ball contact;
 * - cost: per preset, planStroke (in swing mode the downswing's table and scan; it skips the free table),
 *   prepareTrack alone (with the free table in swing mode only), simulateImpact's whole time and its integration's
 *   µs/step (its time less prepareTrack's, over its steps), and the follow-through's steps and µs/step;
 * - faults: per canonical setup, the striker's face intervals and the fault judge's findings (law, tier, ball and the
 *   contacts count);
 * - pit: per roll's canonical setup at 2 and 3 m/s, the striker's ball in its pit against Gugan's held-out figures
 *   (P2b.2b.2b.2a design §4.5): the apparent friction, the travel to the deepest point and the deepest δ; then a ball
 *   rolling at 2 m/s across a fresh bed, its speed after 50 mm;
 * - face: the face's e and T at the impact's 5 µs step against Gugan's fits, a free head on a free ball (design §5.1);
 * - asPlayed: all three rolls at 2 and 3 m/s against the roll as played (P2b.2b.2b.2b design §8): the head on point,
 *   the lean through the contact and the pitch through vertical, the hands' dip, the head's descent, the face
 *   intervals, the hands' force at the pendulum phase's start and after the push, the striker's ball's loss while the
 *   face is on it, the flex's step at contact and the ratio;
 * - onPoint: exit criterion 4 (the head on point behind the striker's ball) over the preset grid for each roll.
 * Run with `npx --yes tsx scripts/strokeProbe.ts`; environment: SECTION (one of the names above; default all), REPEAT
 * (timed runs per stroke, default 20). Not part of the test suite; its output goes into the roadmap's outcomes.
 */
import { faceContactTimeAt, faceRestitutionAt } from "../src/engine/impact/contactLaw";
import { headBallContact } from "../src/engine/impact/contacts";
import {
    IMPACT_DT,
    integrate,
    type ContactSample,
    type FollowThrough,
    type ImpactSnapshot,
} from "../src/engine/impact/integrate";
import { IDENTITY, rotate } from "../src/engine/impact/rigidBody";
import { simulateImpact, simulateStroke } from "../src/engine/impact/simulateImpact";
import { prepareTrack, type Push } from "../src/engine/impact/track";
import { bedLawOf, bedLoad, bedRelax, newBallBed, staticSink } from "../src/engine/impact/turfBed";
import type { Downswing, HeadState, ImpactResult, MalletHead, TrackDrive } from "../src/engine/impact/types";
import { ZERO, add, dot, horizontal, length, scale, sub, vec3, type Vec3 } from "../src/engine/math/vec3";
import { simulateShot, type ShotOutcome } from "../src/engine/shot";
import { contactPose, planStroke } from "../src/engine/swing/buildContact";
import type { StrokeSample, SwingTrajectory } from "../src/engine/swing/trajectory";
import { STROKE_TYPES, type ShotSetup, type StrokeType } from "../src/engine/swing/types";
import { BALL_IDS, type BallId, type BallState } from "../src/engine/types";
import { defaultWorld } from "../src/engine/world";
import { TEST_BALL } from "../tests/engine/support/fixtures";
import { TEST_HEAD, counter, faceLaw, freeBall, isolated, recorder } from "../tests/engine/support/impact";
import { backswingFor, canonicalSetup } from "../tests/engine/support/shot";

// The project has no Node types; this script runs under tsx and reads only its environment.
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

const SECTION = process.env.SECTION ?? "all";
const REPEAT = Number(process.env.REPEAT ?? "20");
const WORLD = defaultWorld();
const fmt = (x: number, digits = 4): string => x.toFixed(digits);
const ms = (t: number): string => fmt(t * 1e3, 1);
const mm = (x: number): string => fmt(x * 1e3, 2);

/** P2b.2b.1's canonical ratios at 3 m/s (roadmap, "P2b.2b.1 outcomes carried forward"). */
const P2B2B1_RATIO: Partial<Record<StrokeType, number>> = {
    drive: 3.32,
    "stop-ac": 6.46,
    "half-roll": 2.83,
    "full-roll": 2.14,
    "pass-roll": 1.59,
};

const withStroke = (setup: ShotSetup, stroke: Partial<ShotSetup["stroke"]>): ShotSetup => ({
    ...setup,
    stroke: { ...setup.stroke, ...stroke },
});

const downOf = (outcome: { contact: ShotOutcome["contact"] }): Downswing =>
    (outcome.contact.drive as TrackDrive).arc.downswing as Downswing;

/** Croqueted ÷ striker distance from the start to rest; NaN for a single-ball stroke. */
function ratio(setup: ShotSetup, outcome: ShotOutcome): number {
    const croqueted = setup.croqueted;
    if (croqueted === undefined) {
        return NaN;
    }
    const travelled = (id: BallId): number =>
        length(sub(outcome.motion.rest[id] as Vec3, (setup.balls[id] as BallState).position));
    return travelled(croqueted) / travelled(setup.striker);
}

/** A preset's stance in the player's terms (P2b.2b.2b.1 design §6): the top hand, the lean, the point of impact. */
function stanceText(setup: ShotSetup): string {
    const lean = 0 - contactPose(setup, WORLD).thetaContact;
    const hands = setup.profile.stance[setup.stroke.type].handsAhead;
    return (
        `stance: the top hand ${fmt(hands)} m ahead of the ball's centre, lean ${fmt((lean * 180) / Math.PI, 2)}°, ` +
        `impact ${mm(WORLD.ball.radius * Math.sin(lean))} mm above the centre`
    );
}

function speeds(): void {
    console.log("== Planned contact speed (m/s) and downswing time (ms) against backswing, intensity 0 / 0.5 / 1 ==");
    for (const type of STROKE_TYPES) {
        const base = canonicalSetup(type, { world: WORLD });
        const cells = [0.02, 0.05, 0.1, 0.2, 0.3, 0.5, 0.7].map((backswing) => {
            const row = [0, 0.5, 1].map((intensity) => {
                try {
                    const plan = planStroke(withStroke(base, { backswing, intensity }), WORLD);
                    return `${fmt(plan.contactSpeed, 3)} (${ms(0 - downOf(plan).release)})`;
                } catch (e) {
                    return `rejected (${(e as Error).message.slice(0, 48)})`;
                }
            });
            return `${fmt(backswing, 2)} m: ${row.join(" / ")}`;
        });
        console.log(`${type.padEnd(11)} ${cells.join("; ")}`);
    }
}

function canonical(): void {
    console.log("== Canonical setups at the default backswing, with the trajectory ==");
    for (const type of STROKE_TYPES) {
        const setup = canonicalSetup(type, { world: WORLD });
        const outcome = simulateShot(setup, WORLD, { trajectory: true });
        const { arc } = outcome.contact.drive as TrackDrive;
        const trajectory = outcome.trajectory as SwingTrajectory;
        const nearest = trajectory.samples.reduce((a, s) => (Math.abs(s.t) < Math.abs(a.t) ? s : a));
        const end = trajectory.samples[trajectory.samples.length - 1] as StrokeSample;
        const r = ratio(setup, outcome);
        const before = P2B2B1_RATIO[type];
        console.log(
            `${type.padEnd(11)} backswing ${mm(setup.stroke.backswing)} mm, intensity ` +
                `${fmt(setup.stroke.intensity ?? setup.profile.shape[type].defaultIntensity, 3)}, planned ` +
                `${fmt(outcome.contactSpeed)} m/s; downswing ${ms(0 - downOf(outcome).release)} ms, lowest ` +
                `${mm(outcome.approach.clearance)} mm ${ms(outcome.approach.before)} ms before contact; lead ` +
                `${ms(arc.contactAt)} ms; impact to ${ms(trajectory.impactEnd)} ms after contact; finish ` +
                `${ms(trajectory.finish)} ms [${trajectory.flags.join(", ")}]; head at the finish ` +
                `${mm(end.head.z - nearest.head.z)} mm up and ${mm(dot(sub(end.head, nearest.head), arc.aim))} mm ` +
                `along aim from contact; ratio ${Number.isNaN(r) ? "none" : fmt(r, 2)}` +
                `${before === undefined ? "" : ` (P2b.2b.1 ${fmt(before, 2)})`}`,
        );
        console.log(`${"".padEnd(11)} ${stanceText(setup)}`);
    }
}

function fat(): void {
    console.log("== Fat strokes: the canonical single-ball stroke met higher on the face, the head lower ==");
    const base = canonicalSetup("single-ball", { world: WORLD });
    for (const up of [0.002, 0.004, 0.006, 0.007]) {
        const setup = withStroke(base, { contact: { up, side: 0 } });
        try {
            const plan = planStroke(setup, WORLD);
            const { arc } = plan.contact.drive as TrackDrive;
            const probe = recorder();
            const impact = simulateImpact(plan.contact, setup.balls, WORLD, { probe });
            const strike = (impact.timeline["face/blue"] ?? [])[0];
            const at = strike === undefined ? undefined : probe.snapshots.find((s) => s.t >= strike.start - 1e-12);
            const turf = impact.timeline["head/turf"]?.[0];
            const real = at === undefined ? "none" : fmt(length(at.head.velocity));
            const dug = turf === undefined ? "never" : `from ${ms(turf.start - arc.contactAt)} ms`;
            console.log(
                `up ${mm(up)} mm: lead ${ms(arc.contactAt)} ms, lowest ${mm(plan.approach.clearance)} mm; planned ` +
                    `${fmt(plan.contactSpeed)} m/s, real ${real} m/s at the first strike; turf ${dug}` +
                    `, ${mm(impact.peakPenetration["head/turf"] ?? 0)} mm deep; flags ` +
                    `[${impact.events.map((e) => e.kind).join(", ")}]`,
            );
        } catch (e) {
            console.log(`up ${mm(up)} mm: rejected (${(e as Error).message})`);
        }
    }
}

function cost(): void {
    console.log("== Cost (machine-dependent) ==");
    for (const type of STROKE_TYPES) {
        const setup = canonicalSetup(type, { world: WORLD });
        let start = performance.now();
        for (let i = 0; i < REPEAT; i++) {
            planStroke(setup, WORLD);
        }
        const planMs = (performance.now() - start) / REPEAT;
        const plan = planStroke(setup, WORLD);
        const down = downOf(plan);
        const downSteps = down.tempo === null ? down.theta.length - 1 : 0;
        start = performance.now();
        for (let i = 0; i < REPEAT; i++) {
            prepareTrack(plan.contact.drive as TrackDrive, plan.contact.head, WORLD.gravity);
        }
        const prepareMs = (performance.now() - start) / REPEAT;
        start = performance.now();
        let impactSteps = 0;
        for (let i = 0; i < REPEAT; i++) {
            impactSteps = simulateImpact(plan.contact, setup.balls, WORLD).steps;
        }
        const impactUs = ((performance.now() - start) * 1e3) / REPEAT;
        start = performance.now();
        let followSteps = 0;
        for (let i = 0; i < REPEAT; i++) {
            const { follow } = simulateStroke(plan.contact, setup.balls, WORLD);
            followSteps = Math.round((follow.finish - follow.impactEnd) / IMPACT_DT);
        }
        const strokeUs = ((performance.now() - start) * 1e3) / REPEAT;
        const swing = down.tempo === null;
        // simulateImpact prepares the track once, then integrates: its fixed preparation is not a per-step cost.
        const integrateUs = impactUs - prepareMs * 1e3;
        console.log(
            `${type.padEnd(11)} planStroke ${fmt(planMs, 2)} ms (` +
                `${swing ? `downswing ${downSteps} steps` : "closed-form downswing"}, no free table); ` +
                `prepareTrack alone ${fmt(prepareMs, 2)} ms (${swing ? "with" : "without"} the free table); ` +
                `simulateImpact ${fmt(impactUs / 1e3, 2)} ms in all: preparation ${fmt(prepareMs, 2)} ms, then ` +
                `${impactSteps} steps at ${fmt(integrateUs / impactSteps, 3)} µs/step; follow-through ` +
                `${followSteps} steps at ${fmt((strokeUs - impactUs) / Math.max(followSteps, 1), 3)} µs/step`,
        );
    }
}

function faults(): void {
    console.log("== Fault judge on the canonical setups: face intervals on the striker's ball, and each finding ==");
    for (const type of STROKE_TYPES) {
        const setup = canonicalSetup(type, { world: WORLD });
        const outcome = simulateShot(setup, WORLD);
        const intervals = outcome.impact.timeline[`face/${setup.striker}`]?.length ?? 0;
        const findings = outcome.faults.findings.map(
            (f) => `${f.law} ${f.tier} on ${f.ball}, contacts ${f.evidence.contacts ?? "n/a"}`,
        );
        console.log(
            `${type.padEnd(11)} ${intervals} face intervals; ` +
                `${findings.length === 0 ? "no finding" : findings.join("; ")}`,
        );
    }
}

const ROLLS: readonly StrokeType[] = ["half-roll", "full-roll", "pass-roll"];

/** `type`'s canonical setup with the backswing that plans `speed` (m/s). */
function atSpeed(type: StrokeType, speed: number): ShotSetup {
    const base = canonicalSetup(type, { world: WORLD });
    return withStroke(base, { backswing: backswingFor(base, speed, WORLD) });
}

/**
 * `setup`'s stroke with every impact snapshot, the striker's index among the snapshots' balls, and the
 * follow-through.
 */
function recorded(setup: ShotSetup): {
    readonly plan: ReturnType<typeof planStroke>;
    readonly impact: ImpactResult;
    readonly steps: readonly ImpactSnapshot[];
    readonly striker: number;
    readonly follow: FollowThrough;
} {
    const plan = planStroke(setup, WORLD);
    const probe = recorder();
    const { result, follow } = simulateStroke(plan.contact, setup.balls, WORLD, { probe });
    const striker = BALL_IDS.filter((id) => setup.balls[id] !== undefined).indexOf(setup.striker);
    return { plan, impact: result, steps: probe.snapshots, striker, follow };
}

/** The least and the greatest of `xs` (Infinity and −Infinity when empty), with no argument spread. */
const least = (xs: readonly number[]): number => xs.reduce((a, b) => Math.min(a, b), Infinity);
const most = (xs: readonly number[]): number => xs.reduce((a, b) => Math.max(a, b), 0 - Infinity);

/** The turf's whole force on the ball in a bed sample: the resultant along its normal and the friction spring's. */
const turfForce = (c: ContactSample): Vec3 => add(scale(c.normal, c.normalForce), c.tangentialForce);

/** A head's lean about the pitch axis (rad, positive with the shaft leaning forward along `aim`), as the stance's. */
function leanOf(head: HeadState, aim: Vec3): number {
    const shaft = rotate(head.orientation, vec3(0, 0, 1));
    return Math.atan2(dot(shaft, aim), shaft.z);
}

/** Exit criterion 4 (P2b.2b.2b.2b design §1): the head on point behind the striker's ball through the contact. */
interface OnPoint {
    /** The least distance (m) of the head's centre behind the ball's centre along aim. */
    readonly behind: number;
    /** The highest face contact point (m) above the ball's centre. */
    readonly height: number;
    /** The largest lean (rad). */
    readonly lean: number;
    readonly holds: boolean;
}

/** R·sin 45°: the face meeting the ball no higher than a 45° lean puts it. */
const ON_POINT_HEIGHT = WORLD.ball.radius * Math.SQRT1_2;

/**
 * The head on point (exit criterion 4) over `steps`, from the first step with the face–striker pair closed to the
 * last: the head's centre behind the ball's centre along aim, every face contact point at most R·sin 45° above the
 * ball's centre, and the lean at most 45°. `striker` is the striker's index among the snapshots' balls, `id` its id.
 */
function onPoint(steps: readonly ImpactSnapshot[], striker: number, id: BallId, head: MalletHead, aim: Vec3): OnPoint {
    const key = `face/${id}`;
    const touching = steps.map((s) => s.contacts.some((c) => c.key === key && c.normalForce > 0));
    const first = touching.indexOf(true);
    const last = touching.lastIndexOf(true);
    let behind = Infinity;
    let height = 0 - Infinity;
    let lean = 0 - Infinity;
    for (let i = Math.max(first, 0); first >= 0 && i <= last; i++) {
        const s = steps[i] as ImpactSnapshot;
        const ball = s.balls[striker] as BallState;
        behind = Math.min(behind, dot(sub(ball.position, s.head.position), aim));
        lean = Math.max(lean, leanOf(s.head, aim));
        const hit = headBallContact(s.head, head, ball.position, WORLD.ball.radius);
        if (hit !== null) {
            height = Math.max(height, hit.point.z - ball.position.z);
        }
    }
    const holds = behind > 0 && height <= ON_POINT_HEIGHT && lean <= Math.PI / 4;
    return { behind, height, lean, holds };
}

const deg = (a: number): string => fmt((a * 180) / Math.PI, 2);

/** Σ|horizontal turf force|·dt over Σ vertical turf force·dt over `samples`; the steps are all IMPACT_DT long. */
function apparentFriction(samples: readonly ContactSample[]): number {
    let along = 0;
    let up = 0;
    for (const c of samples) {
        const f = turfForce(c);
        along += Math.hypot(f.x, f.y) * IMPACT_DT;
        up += f.z * IMPACT_DT;
    }
    return along / up;
}

/** A ball rolling at `speed` from its static sink over a fresh bed of the default lawn, as turfBed.test.ts runs one. */
function rollingLoss(speed: number, distance: number): { readonly speed: number; readonly time: number } {
    const { mass, radius } = WORLD.ball;
    const law = bedLawOf(WORLD.lawn.surfaceAt(vec3(0, 0, 0)));
    const sink = staticSink(0, 0, radius, mass * WORLD.gravity, law);
    const bed = newBallBed(law, IMPACT_DT);
    const inertia = 0.4 * mass * radius * radius;
    let s: BallState = {
        position: vec3(0, 0, radius - sink),
        velocity: vec3(speed, 0, 0),
        angularVelocity: vec3(0, speed / radius, 0),
    };
    let t = 0;
    while (s.position.x < distance) {
        const load = bedLoad(bed, s, radius, IMPACT_DT);
        const force = add(vec3(0, 0, 0 - mass * WORLD.gravity), load === null ? ZERO : load.force);
        const v = add(s.velocity, scale(force, IMPACT_DT / mass));
        const w = load === null ? s.angularVelocity : add(s.angularVelocity, scale(load.torque, IMPACT_DT / inertia));
        s = { position: add(s.position, scale(v, IMPACT_DT)), velocity: v, angularVelocity: w };
        bedRelax(bed);
        t += IMPACT_DT;
    }
    return { speed: Math.hypot(s.velocity.x, s.velocity.y), time: t };
}

function pit(): void {
    console.log(
        "== The striker's ball in its pit (§4.5, held out): the apparent friction Σ|F_h|·dt / ΣF_z·dt of its turf " +
            "samples against Gugan's µ ≈ 1.0, from the impact's start until it first holds no cell after the strike " +
            "(the pit) and over every sample; the travel from the first held sample to the deepest point against " +
            "Gugan's 3.5–18 mm; the deepest δ ==",
    );
    for (const type of ROLLS) {
        for (const speed of [2, 3]) {
            const setup = atSpeed(type, speed);
            const { impact, steps, striker } = recorded(setup);
            const key = `turf/${setup.striker}`;
            const strikeAt = (impact.timeline[`face/${setup.striker}`] ?? [])[0]?.start ?? 0;
            const held = steps.filter((s) => s.contacts.some((c) => c.key === key));
            const sampleOf = (s: ImpactSnapshot): ContactSample =>
                s.contacts.find((c) => c.key === key) as ContactSample;
            const lift = steps.find((s) => s.t > strikeAt && !s.contacts.some((c) => c.key === key));
            const inPit = held.filter((s) => lift === undefined || s.t < lift.t);
            const first = inPit[0];
            if (first === undefined) {
                console.log(`${type.padEnd(11)} ${fmt(speed, 1)} m/s: the striker's ball never holds a cell`);
                continue;
            }
            const deepest = inPit.reduce((a, s) => (sampleOf(s).depth > sampleOf(a).depth ? s : a));
            const travel = horizontal(
                sub(deepest.balls[striker]?.position as Vec3, first.balls[striker]?.position as Vec3),
            );
            console.log(
                `${type.padEnd(11)} ${fmt(speed, 1)} m/s: pit ${ms(first.t)}–${ms(lift?.t ?? impact.duration)} ms, ` +
                    `apparent friction ${fmt(apparentFriction(inPit.map(sampleOf)), 3)} (every sample, ` +
                    `${held.length} steps: ${fmt(apparentFriction(held.map(sampleOf)), 3)}); deepest ` +
                    `${mm(sampleOf(deepest).depth)} mm at ${ms(deepest.t)} ms, ${mm(length(travel))} mm from the ` +
                    `first held sample`,
            );
        }
    }
    const rolled = rollingLoss(2, 0.05);
    console.log(
        `rolling     2.0 m/s from the static sink across a fresh bed: ${fmt(rolled.speed)} m/s after 50 mm ` +
            `(${ms(rolled.time)} ms), against 2 m/s`,
    );
}

/**
 * The face's e and T at the impact's 5 µs step (spec §5.1, recorded, not gated): the free, undriven test head strikes a
 * free ball with no friction, as analytic.test.ts does at 1e-7 s.
 */
function face(): void {
    console.log("== The face at the impact's 5 µs step: e and T against Gugan's fits (recorded, not gated) ==");
    const R = TEST_BALL.radius;
    for (const U of [0.5, 2.19, 2.83, 4.0, 5.5, 6.0]) {
        const start = {
            position: vec3(-R - 1e-5 - TEST_HEAD.length / 2, 0, 1),
            orientation: IDENTITY,
            velocity: vec3(U, 0, 0),
            angularVelocity: ZERO,
        };
        const probe = counter("face/blue");
        const run = integrate(
            isolated({ start, face: faceLaw({ friction: 0 }), balls: [freeBall("blue", vec3(0, 0, 1))] }),
            { cap: 4e-3, probe },
        );
        const T = probe.closed * IMPACT_DT;
        const fitT = faceContactTimeAt(U);
        const e = ((run.balls.blue?.velocity.x as number) - run.head.velocity.x) / U;
        console.log(
            `${fmt(U, 2)} m/s: e ${fmt(e, 5)} (fit ${fmt(faceRestitutionAt(U), 5)}, ` +
                `${(e - faceRestitutionAt(U)).toExponential(2)}); T ${fmt(T * 1e3, 4)} ms (fit ` +
                `${fmt(fitT * 1e3, 4)} ms, ${fmt((100 * (T - fitT)) / fitT, 2)} %)`,
        );
    }
}

/**
 * The rolls against the roll as played (P2b.2b.2b.2b design §8, §9), each at 2 and 3 m/s: first the head on point
 * (exit criterion 4), then the lean through the contact and the pitch through vertical, the hands' dip, the head's
 * descent at contact and through the push against Gugan's 6–16°, the face intervals, the ratio, the hands' force along
 * aim at the pendulum phase's start and its minimum after the push, and the striker's speed lost while the face is on
 * it.
 */
function asPlayed(): void {
    console.log("== The rolls against the roll as played (P2b.2b.2b.2b design §8) ==");
    for (const type of ROLLS) {
        for (const speed of [2, 3]) {
            const setup = atSpeed(type, speed);
            const { plan, impact, steps, striker, follow } = recorded(setup);
            const drive = plan.contact.drive as TrackDrive;
            const { aim, contactAt } = drive.arc;
            const head = plan.contact.head;
            const track = prepareTrack(drive, head, WORLD.gravity);
            const push = track.push as Push;
            const label = `${type.padEnd(11)} ${fmt(speed, 1)} m/s`;
            const point = onPoint(steps, striker, setup.striker, head, aim);
            console.log(
                `${label} ON POINT ${point.holds ? "holds" : "FAILS"}: the head's centre ${mm(point.behind)} mm ` +
                    `behind the ball's centre at least; the face's contacts ${mm(point.height)} mm above it at ` +
                    `most (R·sin 45° ${mm(ON_POINT_HEIGHT)} mm); the lean ${deg(point.lean)}° at most (45°)`,
            );
            const intervals = impact.timeline[`face/${setup.striker}`] ?? [];
            const from = intervals[0]?.start ?? contactAt;
            const to = intervals[intervals.length - 1]?.end ?? impact.duration;
            const window = steps.filter((s) => s.t >= from && s.t <= to);
            const leans = window.map((s) => leanOf(s.head, aim));
            const after = follow.samples.filter((s) => s.t >= impact.duration);
            const pitchPeak = most(after.map((s) => 0 - leanOf(s.head, aim)));
            console.log(
                `${"".padEnd(11)} ${intervals.length} face intervals over ${ms(from)}–${ms(to)} ms; lean at ` +
                    `contact ${deg(leans[0] ?? NaN)}°, ${deg(least(leans))}° to ${deg(most(leans))}° ` +
                    `through the contact; the follow-through's highest pitch ${deg(pitchPeak)}° ` +
                    `(${pitchPeak >= 0 ? "past" : "short of"} vertical), finish at ${ms(follow.finish)} ms ` +
                    `${follow.flags.length > 0 ? follow.flags.join(", ") : "unflagged"}`,
            );
            const topOf = (state: HeadState): Vec3 =>
                add(state.position, scale(rotate(state.orientation, vec3(0, 0, 1)), head.socket.z + drive.arc.radius));
            const z0 = topOf(plan.contact).z;
            const heights = follow.samples.map((s) => ({ t: s.t, dz: topOf(s.head).z - z0 }));
            const lowest = heights.reduce((a, b) => (b.dz < a.dz ? b : a));
            const atPendulum = heights.find((h) => h.t >= (push.pendulum ?? Infinity));
            const atFinish = heights[heights.length - 1] as { t: number; dz: number };
            console.log(
                `${"".padEnd(11)} the hands' dip: lowest ${mm(lowest.dz)} mm at ${ms(lowest.t - contactAt)} ms ` +
                    `after contact; ${
                        atPendulum === undefined
                            ? "no pendulum phase"
                            : `${mm(atPendulum.dz)} mm at the pendulum phase's start`
                    }; ${mm(atFinish.dz)} mm at the finish`,
            );
            const descentOf = (s: ImpactSnapshot): number =>
                Math.atan2(0 - s.head.velocity.z, dot(s.head.velocity, aim));
            const onBall = steps.filter((s) =>
                s.contacts.some((c) => c.key === `face/${setup.striker}` && c.normalForce > 0),
            );
            const descents = onBall.map(descentOf);
            console.log(
                `${"".padEnd(11)} the head's descent at contact ${deg(descents[0] ?? NaN)}°, ` +
                    `${deg(least(descents))}° to ${deg(most(descents))}° while the face is on the ` +
                    "ball (Gugan's β 6–16°, held out; 2a at 3 m/s: half 9.70°, full 3.05°, pass 4.48°)",
            );
            const pushOf = (s: ImpactSnapshot): number => (s.hand === undefined ? NaN : dot(s.hand.force, aim));
            const atStart = steps.find((s) => s.t >= (push.pendulum ?? Infinity));
            // The impact may end before the push does (it ends at the pendulum phase's start once the ball has gone),
            // leaving no step after the push's end to read; say so rather than print NaN.
            const afterPush = steps.filter((s) => s.t >= (push.end ?? Infinity)).map(pushOf);
            const pushes = afterPush.filter((f) => Number.isFinite(f));
            const weakest =
                pushes.length > 0
                    ? `${fmt(least(pushes), 1)} N`
                    : `— (the impact ends at ${ms(impact.duration)} ms, before the push's end` +
                      `${push.end === null ? ", which never comes" : ` at ${ms(push.end)} ms`})`;
            const ball = (s: ImpactSnapshot): BallState => s.balls[striker] as BallState;
            let lost = 0;
            for (let i = 1; i < steps.length; i++) {
                const s = steps[i] as ImpactSnapshot;
                if (s.contacts.some((c) => c.key === `face/${setup.striker}` && c.normalForce > 0)) {
                    lost += Math.max(
                        0,
                        length(ball(steps[i - 1] as ImpactSnapshot).velocity) - length(ball(s).velocity),
                    );
                }
            }
            const contactStep = steps.find((s) => s.t >= contactAt);
            const hand = contactStep?.hand;
            const damperStep = hand === undefined ? NaN : length(sub(hand.force, hand.feedForward));
            console.log(
                `${"".padEnd(11)} the hands' force along aim at the pendulum phase's start ` +
                    `${atStart === undefined ? "—" : fmt(pushOf(atStart), 1)} N, its least after the push ` +
                    `${weakest} (no brake); the striker's ball loses ${fmt(lost)} m/s while the face is ` +
                    `on it; the flex's step at contact ${fmt(damperStep, 2)} N (decision 2); ratio ` +
                    `${fmt(ratio(setup, simulateShot(setup, WORLD)), 2)}`,
            );
        }
    }
}

/**
 * Exit criterion 4 over swingProbe's preset grid for each roll (speed × drive × contact, 225 runs a roll): the runs
 * whose head leaves its point, each listed.
 */
function onPointSweep(): void {
    console.log("== The head on point (exit criterion 4) over the preset grid ==");
    for (const type of ROLLS) {
        const base = canonicalSetup(type, { world: WORLD });
        const up0 = base.stroke.contact.up;
        let runs = 0;
        const failed: string[] = [];
        for (const speed of [1, 2, 3, 4, 6]) {
            for (const strokeDrive of [-1, -0.5, 0, 0.5, 1]) {
                for (const up of [up0 - 0.003, up0, up0 + 0.003]) {
                    for (const side of [-0.01, 0, 0.01]) {
                        let setup: ShotSetup;
                        try {
                            const stroke = { ...base.stroke, drive: strokeDrive, contact: { up, side } };
                            const backswing = backswingFor({ ...base, stroke }, speed, WORLD);
                            setup = { ...base, stroke: { ...stroke, backswing } };
                            planStroke(setup, WORLD);
                        } catch (error) {
                            if (error instanceof RangeError) {
                                continue;
                            }
                            throw error;
                        }
                        const { plan, steps, striker } = recorded(setup);
                        const drive = plan.contact.drive as TrackDrive;
                        const point = onPoint(steps, striker, setup.striker, plan.contact.head, drive.arc.aim);
                        runs++;
                        if (!point.holds) {
                            failed.push(
                                `${speed} m/s drive ${strokeDrive} up ${mm(up - up0)} mm side ${mm(side)} mm: ` +
                                    `behind ${mm(point.behind)} mm, height ${mm(point.height)} mm, ` +
                                    `lean ${deg(point.lean)}°`,
                            );
                        }
                    }
                }
            }
        }
        console.log(`${type.padEnd(11)} ${runs} runs, ${failed.length} off point`);
        for (const line of failed) {
            console.log(`${"".padEnd(11)} ${line}`);
        }
    }
}

const SECTIONS: Readonly<Record<string, () => void>> = {
    speeds,
    canonical,
    fat,
    cost,
    faults,
    pit,
    face,
    asPlayed,
    onPoint: onPointSweep,
};
for (const [name, section] of Object.entries(SECTIONS)) {
    if (SECTION === "all" || SECTION === name) {
        section();
    }
}
