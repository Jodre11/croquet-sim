/**
 * Set-up probe (P2b.2b.2c.3a design §3, §7; recorded, not gated): stage 1's evidence for the unified set-up, every
 * figure read from the engine's planner on the default world. Figures in mm and degrees say so. Reports:
 * - F. the feet's reading (§3): for every preset's canonical setup, where the hands are at contact along aim from the
 *   striker's ball, where the hands' arc bottoms out, the arc's slope at contact, the head's attack angle and the
 *   shaft's lean; then the same at handArcLow 0, 0.25, 0.5, 0.75 and 1 with the lean held.
 * - P. the planned slope (§4.1): for every preset's canonical setup its λ, the free swing's fall D_f (where it has
 *   one), the hands' tempo T, the couple's peak and its time against the grip's C; for the half roll and the drive
 *   the planned speed at λ = 0, 0.25, 0.5, 0.75 and 1; and the drive held at λ = 1 with its hands together (bottom
 *   at 0.715 m), Review Focus 3's figure. Plans past C are read with the bound lifted, and flagged.
 * - R. the bottom hand's reach slack (decision 6's opening rule): for every roll run in the preset digest's grid (the
 *   canonical setup, then 5 speeds x 5 drives x 3 heights x 3 sides), the shaft's pitch turn since contact times
 *   (r − b) at the pendulum phase's start (impact.release) against reachSlack, and the first time before it that the
 *   turn, read from the trajectory's head orientations, exceeded the slack.
 * - X. criterion 5's cross-mode cases (CROSS_MODE_CASES) end to end through simulateShot: the AC stop and the drive
 *   each with a push through, the half roll braked at drive −1 and the full roll at λ = 0.5; each one's impact events,
 *   follow-through flags, fault findings, finish and ratio.
 * Every section ends with a line "<letter> tally: ...". `all` runs every section.
 * Run with `env SECTION=F npx --yes tsx scripts/setupProbe.ts`; environment: SECTION (a letter, a comma-separated
 * list of letters, run in that order, or `all`; default all); for R, R_TYPES (a comma-separated subset of the rolls)
 * and R_SPEEDS (a comma-separated subset of the grid's speeds, m/s) shorten the grid.
 * Not part of the test suite.
 */
import { finishKind } from "../src/engine/impact/integrate";
import { rotate, type Quaternion } from "../src/engine/impact/rigidBody";
import { pitchAxis, prepareTrack } from "../src/engine/impact/track";
import type { TrackDrive } from "../src/engine/impact/types";
import { atan2 } from "../src/engine/math/elementary";
import { add, cross, dot, scale, sub, vec3, type Vec3 } from "../src/engine/math/vec3";
import { simulateShot } from "../src/engine/shot";
import { arcArrival, contactPose, downswingInputOf, planStroke, poseSpeed } from "../src/engine/swing/buildContact";
import {
    planDownswing,
    requiredCouple,
    type DownswingInput,
    type PlannedDownswing,
} from "../src/engine/swing/downswing";
import { ON_TIME } from "../src/engine/swing/profile";
import { STROKE_TYPES, type ShotSetup, type StrokeType } from "../src/engine/swing/types";
import type { BallState, World } from "../src/engine/types";
import { defaultWorld } from "../src/engine/world";
import { backswingFor, canonicalSetup } from "../tests/engine/support/shot";
import { ratioOf } from "./ratioFit";

/** The feet's reading of one set-up (design §3). */
export interface FeetReading {
    /** x_c (m): the top hand at contact, along aim from the striker's ball's centre. */
    readonly handsAt: number;
    /** The hands' arc's lowest point (m) along aim from the ball's centre, x_c + handArcLow·handReach. */
    readonly lowPoint: number;
    /** The arc's slope dz/ds at contact (arcArrival at the preset's values). */
    readonly arrival: number;
    /** The head's planned velocity's angle above horizontal at contact (rad): V_c + ω₀·n × (c − P_c). */
    readonly attack: number;
    /** The shaft's lean at contact (rad), −θ_c. */
    readonly lean: number;
}

/**
 * Reads where `setup`'s hands and the arc they follow sit relative to the striker's ball at contact (design §3): the
 * hands' position and the arc's lowest point along aim from the ball's centre, the arc's slope, the planned head's
 * attack angle and the lean. Throws planStroke's checks.
 */
export function feetReading(setup: ShotSetup, world: World): FeetReading {
    const { stroke, profile } = setup;
    const push = profile.drive[stroke.type];
    const reach = stroke.handReach ?? push.handReach;
    const pose = contactPose(setup, world);
    const striker = setup.balls[setup.striker] as BallState;
    const handsAt = dot(sub(pose.pivot, striker.position), pose.aim);
    const { drive } = planStroke(setup, world).contact;
    if (drive.kind !== "track") {
        throw new Error("feetReading needs a tracked stroke");
    }
    const { arc } = drive;
    const lever = cross(pitchAxis(pose.aim), sub(pose.headCentre, pose.pivot));
    const velocity: Vec3 = add(arc.pivotVelocity, scale(lever, arc.omega0));
    return {
        handsAt,
        lowPoint: handsAt + push.handArcLow * reach,
        arrival: arcArrival(push.handArcRadius, push.handArcLow * reach),
        attack: atan2(velocity.z, dot(velocity, pose.aim)),
        lean: 0 - pose.thetaContact,
    };
}

declare const process: {
    readonly env: Readonly<Record<string, string | undefined>>;
    readonly argv: readonly string[];
};

const SECTION = process.env.SECTION ?? "all";

const fmt = (x: number): string => x.toFixed(4);
const mm = (x: number): string => fmt(x * 1e3);
const deg = (rad: number): string => fmt((rad * 180) / Math.PI);

const ARC_LOWS: readonly number[] = [0, 0.25, 0.5, 0.75, 1];

function readingLine(label: string, r: FeetReading): string {
    return (
        `${label}: hands at ${mm(r.handsAt)} mm, low point ${mm(r.lowPoint)} mm, arrival ${fmt(r.arrival)}, ` +
        `attack ${deg(r.attack)}°, lean ${deg(r.lean)}°`
    );
}

/** The builder's verdict on each claim of design §3, read from section F's figures and the code (stage 1). */
const FEET_NOTE = [
    "Stage 1 note: design §3's reading of the feet, claim by claim.",
    "1. CONFIRMED: on a still top hand the feet and the lean are inseparable. The four still-hand presets",
    "   (single-ball, drive, stop-ac, stop-gc: handGain 0, handReach 0) have attack = -lean to the printed precision",
    "   (stop-ac: lean -5 deg, attack +5.0000 deg; the other three 0 and 0), and handArcLow moves nothing in the",
    "   printed rows: the shaft's angle at contact is both.",
    "2. CONFIRMED: they separate once the hands move. On the rolls, with the lean held, the attack moves by about",
    "   0.85 deg per 0.25 of handArcLow on the half roll, 2.6 deg on the full roll and 2.5 deg on the pass roll; the",
    "   attack is also not -lean (the half roll: lean 24 deg, attack -9.7 to -13.1 deg), the hands' own velocity",
    "   carrying it. Mechanism, read from the code: the arc's slope at contact (arrival) sets the downswing's vertical",
    "   Hermite end slope, 2*|horizontal travel|*arrival (downswing.ts), which is zero for a still top hand.",
    "3. CONFIRMED: the low point is measured from the hands, not the ball. The rows show lowPoint - handsAt =",
    "   handArcLow*handReach for each roll (track.ts computePush: low = handArcLow*handReach from the push's origin,",
    "   the hands at contact). The hands lie ahead of the ball by 169.4 mm (half roll), 169.7 mm (full roll) and",
    "   113.6 mm (pass roll), so the half roll's own low point is 244.4 mm from the ball, not 75 mm. That the",
    "   hands' distance moves with the lean is read from the code, not these rows (none varies the lean):",
    "   contactPose takes the lean from the stance's handsAhead through stanceLean, and handsAheadFor inverts it",
    "   (buildContact.ts). So a stroke.feet given from the ball converts to handArcLow = (feet - handsAt)/handReach,",
    "   and holding the feet fixed under a lean change means recomputing handArcLow; with handReach 0 it is moot.",
    "4. CONFIRMED: the still-hand presets' feet change nothing, on the printed rows. Their handReach is 0 and",
    "   handGain 0, so the arc's low point lies at the hands (lowPoint = handsAt), the arrival is 0 for every",
    "   handArcLow, and the arrival is passed to the downswing for every stroke (arcArrival, 0 with no push;",
    "   buildContact.ts downswingOf). Nothing changes until the push moves the hands.",
    "",
].join("\n");

/** F. The feet's reading, per preset and across handArcLow with the lean held. */
function sectionF(): void {
    const world = defaultWorld();
    console.log(FEET_NOTE);
    console.log("== F. the feet's reading (design §3): mm from the striker's ball along aim; degrees ==");
    let rejected = 0;
    let moved = 0;
    for (const type of STROKE_TYPES) {
        const read = (low: number | undefined): FeetReading | null => {
            try {
                return feetReading(
                    canonicalSetup(type, low === undefined ? {} : { drive: { handArcLow: low } }),
                    world,
                );
            } catch (error) {
                console.log(`${type}: rejected (${(error as Error).message})`);
                rejected++;
                return null;
            }
        };
        const own = read(undefined);
        if (own !== null) {
            console.log(readingLine(`${type} (own handArcLow)`, own));
        }
        const rows = ARC_LOWS.map((low) => [low, read(low)] as const);
        for (const [low, r] of rows) {
            if (r !== null) {
                console.log(readingLine(`  ${type} handArcLow ${low}`, r));
            }
        }
        const attacks = rows.map(([, r]) => r?.attack);
        if (new Set(attacks).size > 1) {
            moved++;
        }
    }
    console.log(
        `F tally: ${STROKE_TYPES.length} presets, ${rejected} runs rejected; the attack moves with handArcLow on ` +
            `${moved} of ${STROKE_TYPES.length}`,
    );
}

/** The planned slopes section P reads the half roll and the drive at. */
const SLOPE_HOLDS: readonly number[] = [0, 0.25, 0.5, 0.75, 1];

/** `input` planned at λ = `slopeHold` with the couple's bound lifted, so that a plan past C still reads. */
function unbounded(input: DownswingInput, slopeHold: number): PlannedDownswing {
    return planDownswing({ ...input, slopeHold, couple: Infinity });
}

function coupleLine(input: DownswingInput, planned: PlannedDownswing): string {
    const { peak, at } = requiredCouple(input, planned.downswing);
    const verdict = peak <= input.couple ? "within" : "EXCEEDS";
    // The free swing's couple is a residual of its table, so its peak is printed to its own scale.
    return `couple peak ${peak.toExponential(4)} N·m at ${fmt(at * 1e3)} ms, ${verdict} C ${fmt(input.couple)} N·m`;
}

/** P. The planned slope (design §4.1): each preset's plan, its couple against C, and the speed across λ. */
function sectionP(): void {
    const world = defaultWorld();
    console.log("== P. the planned slope (design §4.1): s, N·m, ms from contact, m/s ==");
    let exceeded = 0;
    for (const type of STROKE_TYPES) {
        const setup = canonicalSetup(type);
        const input = downswingInputOf(setup, world);
        const { slopeHold } = input;
        const { handTempo, pendulumShare } = input.shape;
        const fall = pendulumShare > 0 ? 0 - unbounded(input, 0).downswing.release : null;
        const tempo = handTempo === null ? fall : handTempo.slow + input.intensity * (handTempo.fast - handTempo.slow);
        const planned = unbounded(input, slopeHold);
        if (requiredCouple(input, planned.downswing).peak > input.couple) {
            exceeded++;
        }
        const { top, bottom, limit, spread } = input.grip;
        const falls = fall === null ? "none" : `${fmt(fall)} s`;
        const tempos = tempo === null ? "none" : `${fmt(tempo)} s${handTempo === null ? " (derived)" : ""}`;
        const speed = fmt(poseSpeed(contactPose(setup, world), planned));
        console.log(
            `${type}: λ ${slopeHold}, D_f ${falls}, T ${tempos}, ${coupleLine(input, planned)} (γ_T ${top}, ` +
                `g_B ${bottom}, F_max ${limit} N, r − b ${fmt(spread)} m), planned speed ${speed}`,
        );
    }
    for (const type of ["half-roll", "drive"] as const) {
        const setup = canonicalSetup(type);
        const input = downswingInputOf(setup, world);
        const pose = contactPose(setup, world);
        for (const slopeHold of SLOPE_HOLDS) {
            const planned = unbounded(input, slopeHold);
            console.log(
                `  ${type} λ ${slopeHold}: planned speed ${fmt(poseSpeed(pose, planned))}, fall ` +
                    `${fmt(0 - planned.downswing.release)} s, ${coupleLine(input, planned)}`,
            );
        }
    }
    // Review Focus 3: the drive's hands together, the bottom hand at 0.715 m (before Task 12 moves it), held.
    const together = canonicalSetup("drive", { stance: { bottom: 0.715 } });
    const held = downswingInputOf(together, world);
    const drive = unbounded(held, 1);
    const { peak, at } = requiredCouple(held, drive.downswing);
    console.log(`drive λ 1, bottom 0.715 m: ${coupleLine(held, drive)}`);
    console.log(
        `P tally: ${STROKE_TYPES.length} presets, ${exceeded} past C at their own λ; the drive at λ 1 with its hands ` +
            `together needs ${fmt(peak)} N·m at ${fmt(at * 1e3)} ms against C ${fmt(held.couple)} N·m`,
    );
}

/** The rolls section R reads: the strokes whose hands carry the head and open at the pendulum phase. */
const ROLLS: readonly StrokeType[] = ["half-roll", "full-roll", "pass-roll"];

/** The preset digest's grid: the backswing speeds (m/s), the drives and the sides (m); the heights are up0 ± 3 mm. */
const GRID_SPEEDS: readonly number[] = [1, 2, 3, 4, 6];
const GRID_DRIVES: readonly number[] = [-1, -0.5, 0, 0.5, 1];
const GRID_SIDES: readonly number[] = [-0.01, 0, 0.01];

/** One sample of a trajectory as section R reads it: its time (s from contact) and the head's orientation. */
export interface TurnSample {
    readonly t: number;
    readonly orientation: Quaternion;
}

/**
 * The first sample before `before` (s from contact) at which the hands' travel (r − b)·(pitch − the first sample's
 * pitch, the pitch since contact (relaxAt): pass samples from contact on), the quantity track.ts tests against reachSlack, exceeds `slack` (m); null if none does. With `absolute`
 * the travel's size is tested, either way round. The pitch is the shaft's arc angle atan2(−s·aim, s_z), s the head's
 * up axis.
 */
export function firstSlackCrossing(
    samples: readonly TurnSample[],
    aim: Vec3,
    spread: number,
    slack: number,
    before: number,
    absolute: boolean,
): number | null {
    const pitchOf = (q: Quaternion): number => {
        const shaft = rotate(q, vec3(0, 0, 1));
        return atan2(0 - dot(shaft, aim), shaft.z);
    };
    const first = samples[0];
    if (first === undefined) {
        return null;
    }
    const contactPitch = pitchOf(first.orientation);
    for (const sample of samples) {
        if (sample.t >= before) {
            return null;
        }
        const travel = spread * (pitchOf(sample.orientation) - contactPitch);
        if ((absolute ? Math.abs(travel) : travel) > slack) {
            return sample.t;
        }
    }
    return null;
}

/** R. The bottom hand's reach slack against the pendulum phase's start, on every roll run of the digest's grid. */
function sectionR(): void {
    const world = defaultWorld();
    const types = (process.env.R_TYPES?.split(",") ?? ROLLS) as readonly StrokeType[];
    const unknownRolls = types.filter((type) => !ROLLS.includes(type));
    if (unknownRolls.length > 0) {
        throw new Error(
            `R_TYPES must be a comma-separated list of ${ROLLS.join(", ")}; got ${unknownRolls.join(", ")}`,
        );
    }
    const speeds = process.env.R_SPEEDS?.split(",").map(Number) ?? GRID_SPEEDS;
    if (speeds.some((speed) => !(Number.isFinite(speed) && speed > 0))) {
        throw new Error("R_SPEEDS must be a comma-separated list of finite positive speeds (m/s)");
    }
    console.log("== R. reach slack against the pendulum phase's start (decision 6): mm of hand travel, ms ==");
    const tallies: string[] = [];
    for (const type of types) {
        const base = canonicalSetup(type, { world });
        const slack = base.profile.body.reachSlack;
        const spread = downswingInputOf(base, world).grip.spread;
        const { aim } = contactPose(base, world);
        console.log(`${type}: reachSlack ${mm(slack)} mm, r − b ${mm(spread)} mm`);
        let runs = 0;
        let rejected = 0;
        let unreleased = 0;
        let crossing = 0;
        let crossingAbs = 0;
        let led = 0;
        let largest = 0;
        const play = (label: string, setup: ShotSetup): void => {
            runs++;
            try {
                const outcome = simulateShot(setup, world, { trajectory: true });
                const { release } = outcome.impact;
                const { trajectory } = outcome;
                if (release === undefined || trajectory === undefined) {
                    unreleased++;
                    console.log(`  ${label}: no release`);
                    return;
                }
                // The trajectory runs in s from contact, the impact's release in s from the impact's start.
                const at = release.t + trajectory.impactStart;
                const travel = spread * release.deltaTheta;
                largest = Math.max(largest, Math.abs(travel) / slack);
                if (trajectory.impactStart < 0) {
                    led++;
                }
                // The engine takes its reference pitch at the first step at or after contact (relaxAt, t >= 0).
                const fromContact = trajectory.samples.filter((sample) => sample.t >= 0);
                const early = firstSlackCrossing(fromContact, aim, spread, slack, at, false);
                const earlyAbs = firstSlackCrossing(fromContact, aim, spread, slack, at, true);
                if (early !== null) {
                    crossing++;
                }
                if (earlyAbs !== null) {
                    crossingAbs++;
                }
                console.log(
                    `  ${label}: release at ${fmt(at * 1e3)} ms, travel ${mm(travel)} mm against ${mm(slack)} mm` +
                        (early === null ? ", no early crossing" : `, CROSSES the slack at ${fmt(early * 1e3)} ms`) +
                        (earlyAbs === null ? "" : `; |travel| exceeds it from ${fmt(earlyAbs * 1e3)} ms`),
                );
            } catch (error) {
                rejected++;
                console.log(`  ${label}: rejected (${(error as Error).message})`);
            }
        };
        play("canonical", base);
        const up0 = base.stroke.contact.up;
        for (const speed of speeds) {
            for (const drive of GRID_DRIVES) {
                for (const up of [up0 - 0.003, up0, up0 + 0.003]) {
                    for (const side of GRID_SIDES) {
                        const stroke = { ...base.stroke, drive, contact: { up, side } };
                        const setup = { ...base, stroke };
                        const backswing = backswingFor(setup, speed, world);
                        play(`${speed} m/s drive ${drive} up ${up} side ${side}`, {
                            ...setup,
                            stroke: { ...stroke, backswing },
                        });
                    }
                }
            }
        }
        tallies.push(
            `${type} ${crossing} of ${runs} signed, ${crossingAbs} by size (${rejected} rejected, ${unreleased} ` +
                `unreleased, ${led} with the impact starting before contact; largest |travel| at release ${fmt(largest)} of the slack)`,
        );
    }
    console.log(
        `R tally: roll runs crossing the slack before their pendulum phase, as track.ts signs the travel and by its ` +
            `size: ${tallies.join("; ")}`,
    );
}

/** One of criterion 5's cross-mode cases (design §1): its label and its setup on `world`. */
export interface CrossModeCase {
    readonly label: string;
    readonly setup: (world: World) => ShotSetup;
}

/** `type`'s canonical setup with `stroke` over its stroke, its backswing planning 3 m/s on `world`. */
function atThree(type: StrokeType, stroke: Partial<ShotSetup["stroke"]>, world: World): ShotSetup {
    const setup = canonicalSetup(type, { world, stroke });
    return { ...setup, stroke: { ...setup.stroke, backswing: backswingFor(setup, 3, world) } };
}

/**
 * Criterion 5's cross-mode cases (design §1): the AC stop and the drive each with a push through (Task 8's form:
 * handReach 0.15, the advance at contact), the half roll braked at drive −1 and the full roll at λ = 0.5, each planning
 * 3 m/s.
 */
export const CROSS_MODE_CASES: readonly CrossModeCase[] = [
    {
        label: "stop-ac drive -1, handReach 0.15, advance 0",
        setup: (world) => atThree("stop-ac", { drive: -1, handReach: 0.15, timing: { ...ON_TIME, advance: 0 } }, world),
    },
    {
        label: "drive drive 0, handReach 0.15, advance 0",
        setup: (world) => atThree("drive", { drive: 0, handReach: 0.15, timing: { ...ON_TIME, advance: 0 } }, world),
    },
    { label: "half-roll drive -1", setup: (world) => atThree("half-roll", { drive: -1 }, world) },
    { label: "full-roll λ 0.5", setup: (world) => atThree("full-roll", { slopeHold: 0.5 }, world) },
];

/** X. Criterion 5's cross-mode cases end to end through simulateShot: events, flags, finish and ratio. */
function sectionX(): void {
    const world = defaultWorld();
    console.log(
        "== X. the cross-mode cases (criterion 5): simulateShot with the trajectory on the default world, each " +
            "planning 3 m/s; ms from the impact's start for events, from contact for the finish ==",
    );
    let rejected = 0;
    let impactCaps = 0;
    let followCaps = 0;
    for (const { label, setup: setupOf } of CROSS_MODE_CASES) {
        try {
            const setup = setupOf(world);
            const outcome = simulateShot(setup, world, { trajectory: true });
            const { impact, trajectory } = outcome;
            if (trajectory === undefined) {
                throw new Error("simulateShot returned no trajectory");
            }
            impactCaps += impact.events.some((e) => e.kind === "impact-cap") ? 1 : 0;
            followCaps += trajectory.flags.includes("follow-cap") ? 1 : 0;
            const events = impact.events.map((e) => `${e.kind} at ${fmt(e.t * 1e3)} ms`).join(", ") || "none";
            const follow = trajectory.flags.join(", ") || "none";
            const findings = outcome.faults.findings.map((f) => `${f.law} (${f.tier})`).join(", ") || "none";
            const kind = finishKind(
                prepareTrack(outcome.contact.drive as TrackDrive, outcome.contact.head, world.gravity),
            );
            const ratio = setup.croqueted === undefined ? "none" : fmt(ratioOf(setup, outcome.motion));
            console.log(
                `${label}: planned speed ${fmt(outcome.contactSpeed)} m/s; impact events ${events}; follow-through ` +
                    `flags ${follow}; findings ${findings}; finish ${kind} at ${fmt(trajectory.finish * 1e3)} ms; ` +
                    `ratio ${ratio}`,
            );
        } catch (error) {
            rejected++;
            console.log(`${label}: rejected (${(error as Error).message})`);
        }
    }
    console.log(
        `X tally: ${CROSS_MODE_CASES.length} cases, ${rejected} rejected, ${impactCaps} with impact-cap, ` +
            `${followCaps} with follow-cap`,
    );
}

const SECTIONS: Readonly<Record<string, () => void>> = {
    F: sectionF,
    P: sectionP,
    R: sectionR,
    X: sectionX,
};

const ALL_SECTIONS: readonly string[] = ["F", "P", "R", "X"];

if (process.argv[1]?.endsWith("setupProbe.ts")) {
    const chosen = SECTION === "all" ? ALL_SECTIONS : SECTION.split(",");
    const unknown = chosen.filter((name) => SECTIONS[name] === undefined);
    if (unknown.length > 0) {
        throw new Error(`SECTION must be "all" or a comma-separated list of ${Object.keys(SECTIONS).join(", ")}`);
    }
    if (chosen.length > 1) {
        console.log(`== ${SECTION === "all" ? "all: " : ""}sections ${chosen.join(", ")} ==`);
    }
    for (const name of chosen) {
        (SECTIONS[name] as () => void)();
    }
}
