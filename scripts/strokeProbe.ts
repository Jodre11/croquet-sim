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
 * - asPlayed: the full roll at 2 m/s against the roll as played (design §6): the lean through the contact, the face
 *   behind the striker's ball, the hands' force at the end of their reach and the striker's ball's loss after it.
 * Run with `npx --yes tsx scripts/strokeProbe.ts`; environment: SECTION (one of the names above; default all), REPEAT
 * (timed runs per stroke, default 20). Not part of the test suite; its output goes into the roadmap's outcomes.
 */
import { faceContactTimeAt, faceRestitutionAt } from "../src/engine/impact/contactLaw";
import { IMPACT_DT, integrate, type ContactSample, type ImpactSnapshot } from "../src/engine/impact/integrate";
import { IDENTITY, rotate } from "../src/engine/impact/rigidBody";
import { simulateImpact, simulateStroke } from "../src/engine/impact/simulateImpact";
import { prepareTrack } from "../src/engine/impact/track";
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

/** `setup`'s stroke with every impact snapshot, and the striker's index among the snapshots' balls. */
function recorded(setup: ShotSetup): {
    readonly plan: ReturnType<typeof planStroke>;
    readonly impact: ImpactResult;
    readonly steps: readonly ImpactSnapshot[];
    readonly striker: number;
} {
    const plan = planStroke(setup, WORLD);
    const probe = recorder();
    const { result } = simulateStroke(plan.contact, setup.balls, WORLD, { probe });
    const striker = BALL_IDS.filter((id) => setup.balls[id] !== undefined).indexOf(setup.striker);
    return { plan, impact: result, steps: probe.snapshots, striker };
}

/** The turf's whole force on the ball in a bed sample: the resultant along its normal and the friction spring's. */
const turfForce = (c: ContactSample): Vec3 => add(scale(c.normal, c.normalForce), c.tangentialForce);

/** A head's lean about the pitch axis (rad, positive with the shaft leaning forward along `aim`), as the stance's. */
function leanOf(head: HeadState, aim: Vec3): number {
    const shaft = rotate(head.orientation, vec3(0, 0, 1));
    return Math.atan2(dot(shaft, aim), shaft.z);
}

/** The centre of the face of `head` in state `state`: the head's axis is its local x, the face at +length/2. */
const faceCentre = (state: HeadState, head: MalletHead): Vec3 =>
    add(state.position, scale(rotate(state.orientation, vec3(1, 0, 0)), head.length / 2));

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
 * The full roll at 2 m/s against the roll as played (roadmap, "The model's roll against the roll as played"), a
 * baseline for P2b.2b.2b.2b: the lean through the contact (the first face–striker interval's start to the last's end),
 * the face behind the striker's ball, and the hands' force at the end of their reach and what the striker's ball loses
 * while the face is on it after that.
 */
function asPlayed(): void {
    console.log("== The full roll at 2 m/s against the roll as played (P2b.2b.2b.2b's baseline) ==");
    const setup = atSpeed("full-roll", 2);
    const { plan, impact, steps, striker } = recorded(setup);
    const drive = plan.contact.drive as TrackDrive;
    const { aim } = drive.arc;
    const head = plan.contact.head;
    const intervals = impact.timeline[`face/${setup.striker}`] ?? [];
    const from = intervals[0]?.start ?? 0;
    const to = intervals[intervals.length - 1]?.end ?? impact.duration;
    const window = steps.filter((s) => s.t >= from && s.t <= to);
    const leans = window.map((s) => leanOf(s.head, aim));
    const lowest = leans.reduce((a, b) => Math.min(a, b));
    const highest = leans.reduce((a, b) => Math.max(a, b));
    console.log(
        `full-roll   ${intervals.length} face intervals over ${ms(from)}–${ms(to)} ms; lean at contact ` +
            `${deg(leans[0] ?? NaN)}°, ${deg(lowest)}° to ${deg(highest)}° through the contact, ` +
            `${deg(leans[leans.length - 1] ?? NaN)}° at its end`,
    );
    const ball = (s: ImpactSnapshot): BallState => s.balls[striker] as BallState;
    const gaps = window.map((s) => ({
        face: dot(sub(ball(s).position, faceCentre(s.head, head)), rotate(s.head.orientation, vec3(1, 0, 0))),
        centre: dot(sub(ball(s).position, s.head.position), aim),
    }));
    const range = (xs: readonly number[]): string =>
        `${mm(xs.reduce((a, b) => Math.min(a, b)))} to ${mm(xs.reduce((a, b) => Math.max(a, b)))} mm`;
    console.log(
        `${"".padEnd(11)} through the contact, the face's plane behind the striker's ball's surface ` +
            `${range(gaps.map((g) => g.face - WORLD.ball.radius))}; the head's centre behind the ball's centre ` +
            `along aim ${range(gaps.map((g) => g.centre))}`,
    );
    const reach = prepareTrack(drive, head, WORLD.gravity).reach;
    if (reach === null) {
        console.log(`${"".padEnd(11)} the hands' reach does not bind`);
        return;
    }
    const pushOf = (s: ImpactSnapshot): number => (s.hand === undefined ? NaN : dot(s.hand.force, aim));
    const atReach = steps.find((s) => s.t >= reach.t1);
    const easing = steps.filter((s) => s.t >= reach.t1 && s.t <= reach.tStop);
    let lost = 0;
    let previous = atReach === undefined ? NaN : length(ball(atReach).velocity);
    for (const s of steps.filter((x) => x.t > reach.t1)) {
        const speed = length(ball(s).velocity);
        if (s.contacts.some((c) => c.key === `face/${setup.striker}` && c.normalForce > 0)) {
            lost += previous - speed;
        }
        previous = speed;
    }
    if (atReach === undefined) {
        console.log(`${"".padEnd(11)} the hands reach 0.8·handReach at ${ms(reach.t1)} ms, after the impact`);
        return;
    }
    const hardest = easing.reduce((a, s) => (pushOf(s) < pushOf(a) ? s : a), atReach);
    console.log(
        `${"".padEnd(11)} the hands reach 0.8·handReach at ${ms(reach.t1)} ms and rest at ${ms(reach.tStop)} ms; ` +
            `their force along aim there ${fmt(pushOf(atReach), 1)} N, its lowest until they rest ` +
            `${fmt(pushOf(hardest), 1)} N at ${ms(hardest.t)} ms; the striker's ball at ` +
            `${fmt(length(ball(atReach).velocity))} m/s there loses ${fmt(lost)} m/s while the face is on it after ` +
            `that; the impact ends at ${ms(impact.duration)} ms`,
    );
}

const SECTIONS: Readonly<Record<string, () => void>> = { speeds, canonical, fat, cost, faults, pit, face, asPlayed };
for (const [name, section] of Object.entries(SECTIONS)) {
    if (SECTION === "all" || SECTION === name) {
        section();
    }
}
