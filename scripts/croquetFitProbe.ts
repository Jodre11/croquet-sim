/**
 * Croquet-fit probe (P2b.2b.2c.2 design §3, §5; recorded, not gated): the croquet strokes' fit's figures, every run
 * through the fit's evaluator (scripts/ratioFit.ts) at today's values unless marked, its stroke planned at its speed
 * by strokeFor (each run's backswing, intensity and regime printed). Every figure to 4 decimals. Reports:
 * - A. the distance check (design §3): the CA's travel unit and where its ball speed was measured (CA_MEASURE); per CA
 *   single-ball drive A1D–A4D on the open lawn (scripts/openLawn.ts), the strike's share (planned at the CA's mallet
 *   speed: the model's ball speed at the face's release against the CA's, and their ratio) and the lawn's share
 *   (planned at releaseSpeedFor(the CA's ball speed): the travel to rest in metres against the CA's, and their ratio),
 *   A1D marked a very short stroke; then Gugan 5's drive on the drive preset at its target's speed on the open lawn:
 *   the croqueted ball's travel in yards against about seven.
 * - B. the drift (design §4.3): the single-ball, drive, AC stop and GC stop presets' canonical setups and the preset
 *   digest's grid on the default world (the swing-mode presets: a check's hold follows any run planned with α < 0),
 *   each played by planStroke and simulateStroke with a follow probe: each hand's peak and final slid |offset|,
 *   the peak's time, each hand's peak |force| over the follow-through and the follow-grip-limit flag; then, per
 *   preset, the run with the largest peak and the count of runs with an offset set.
 * - C. the sensitivity probe (design §5.2): today's drive and AC stop ratios at their targets' speeds and their errors
 *   over each tolerance; per candidate, seven points evenly across its bounds (and today's value): both ratios, every
 *   impact event, re-entry guard hit, follow-through flag (integrated apart, at the swept points only) and error, and
 *   the drive's effective mass m_eff at the face centre along aim beside the head's mass m and the swung body's M,
 *   marked outside [0.9·m, M] (ruling D, P2b.2b.2b.2c); each candidate's slopes at today's value (±1 % of its
 *   bound's width, one-sided at a bound) times that width; per pair, the angle between their slope vectors and the
 *   linear estimate's solution against today's errors, reachable within both bounds, with the effective mass there;
 *   the pairs ranked and the first reachable one with an unmarked mass recommended; and, only if no pair is
 *   reachable, the drive's and the AC stop's own grips swept the same way on their own presets.
 *   The solver behind this section is dormant since P2b.2b.2c.2b, whose impact work found the drive's excess in the
 *   strike's squeeze, not in the fit's parameters; it is kept for a possible later fit of the hands' parameters.
 *   Three review items are open before it runs again: parseCandidate's leniency (scripts/fitRatios.ts), the exit code
 *   on "closest", and this section's "reachable" verdict across a jump; the roadmap carries them.
 * - H. the ball makes (design §6): the makes behind the face law and Gugan 5's drives, whether they differ, and le
 *   Maitre's spread by make (his stop shot's ratios, and his drive or roll's printed ratios against his own
 *   distances), each quoted from reference/sources/README.md with its line.
 * - D. gap 0 re-measured and the sweep (P2b.2b.2c.2b design §9): the canonical drive at 3 m/s with no push, on the
 *   default mallet and Gugan's: the read-out's speeds, every face and ball–ball interval (ms), the squared speed ratio
 *   and the distance ratio; then v₂/U, w₁/W, v₂/w₁ and the ratio across the gap from 0 to 1.9 mm, for the drive at 3
 *   m/s and the AC stop at C3S's and C20S's U.
 * - E. the filmed strokes (design §5.2, §5.3): each of Gugan 4's ten strokes on its preset at its U and recorded gap,
 *   its figures against its Table 5 row, the nominal strokes at ±0.5 mm, and the three means against Gugan's.
 * - F. the timing (design §7.1): the model's four times for six strokes, from the contact law's intervals and as the
 *   video would time them (VISIBLE_SHIFT), beside both Fig. 4 readings.
 * - G. the convergence (design §6): the judged figures at dt/2, dt and 2·dt, each spread over its tolerance.
 * - I. the search (design §4): what keeps truly touching balls apart. Today's ball–ball law through the free-collision
 *   harness (scripts/squeeze.ts); then each candidate's tests of §4.1 with their figures and its verdict, a, c and d on
 *   this engine: a, a gap hidden below Table 5's 0.5 mm resolution (section D's sweep); c, the bed's and the balls'
 *   impulses on the croqueted ball over the strike's first 0.5 and 1.5 ms; d, the balls' normal and the striker's
 *   ball's rise and spin at the ball–ball interval's start and peak. Candidates b and e change a law, so they run from
 *   a throwaway copy of the worktree carrying it, with CANDIDATE (b or e) and TODAY_ROOT (the worktree, whose engine
 *   is loaded beside the copy's for tests 1 and 5); they add tests 4–6.
 * - J. Gugan 5's drive and stop across the gap (design §7.2): 3 m/s with Gugan's mallet at gaps 0 to 1.9 mm; the drive
 *   (no push) against 4.23 ± 0.2, the AC stop at jabs 0-8 mm in 0.5 mm steps against 7.15 ± 0.6, on the world's
 *   ball-ball restitution and on Gugan's 0.772 (a world variant, never adopted); where each target is reachable.
 * - K. the scatter (design §7.3): the drive's standard deviation and the stop's range over J's gaps against Gugan 5's
 *   0.6 and about ± 2.0, beside Table 5's spread of v2/U and v2/w1 and the model's across the same strokes; the
 *   hypothesis judged only if the two sensitivities agree, else "unable to test".
 * - L. the share (design §7.8): the squared speed ratio as the balls leave beside the distance ratio, for each filmed
 *   stroke and for J's drive and stop at 1 mm, against Table 5's rows 16 and 17.
 * - M. the jab, the re-contacts and the effective mass (design §7.5-§7.7): the jab test's sweep at the default croquet
 *   gap, depth by depth; every face-ball interval with its region on the AC stop's canonical run and its preset
 *   digest's grid; the drive's effective mass on its canonical setup and with Gugan's mallet.
 * `all` runs A, D-G, I and J-M; B, C and H by name only.
 * Run with `npx --yes tsx scripts/croquetFitProbe.ts`; environment: SECTION (a letter; default all), CANDIDATE and
 * TODAY_ROOT (section I in a copy). Not part of the test suite.
 */
import type { PairLaw } from "../src/engine/impact/contactLaw";
import { ballPairKey, faceClearance, faceKey } from "../src/engine/impact/contacts";
import { IMPACT_DT, type ContactSample, type FollowSnapshot, type ImpactProbe } from "../src/engine/impact/integrate";
import { prepareImpact, simulateImpact, simulateStroke } from "../src/engine/impact/simulateImpact";
import { swungBody } from "../src/engine/impact/track";
import type { ContactState, ImpactResult } from "../src/engine/impact/types";
import { add, cross, dot, horizontal, length, scale, sub, vec3, type Vec3 } from "../src/engine/math/vec3";
import { CROQUET_GAP_LIMIT } from "../src/engine/shot";
import { simulateFreeMotion } from "../src/engine/simulate";
import { buildContact, planStroke } from "../src/engine/swing/buildContact";
import { defaultProfile } from "../src/engine/swing/profile";
import type { ShotSetup } from "../src/engine/swing/types";
import { BALL_IDS, type BallId, type BallState, type World } from "../src/engine/types";
import { defaultWorld } from "../src/engine/world";
import { ratioTargetsReference, type RatioTargetKey } from "../src/reference/index";
import { DEFAULT_CROQUET_GAP, backswingFor, canonicalSetup, regimeOf, strokeFor } from "../tests/engine/support/shot";
import {
    FIG4_TIMING,
    FILMED_STROKES,
    FREE_COLLISIONS,
    GUGAN5,
    GUGAN_MEANS,
    SINGLE_BALL_FACE,
    VIDEO_FRAME,
    VISIBLE_SHIFT,
    type FilmedStroke,
} from "./filmedStrokes";
import * as OpenLawn from "./openLawn";
import { OPEN_LAWN, OPEN_START, haltedText, openWorld, opened } from "./openLawn";
import * as RatioFit from "./ratioFit";
import {
    ALL_STROKES,
    BOUNDS,
    CA_STROKES,
    GAPPED_STROKES,
    GUGAN_EFFECTIVE_MASS,
    STEP_SHARES,
    STRIKE_WINDOW,
    TODAY,
    effectiveMassOf,
    figuresOf,
    filmedStrokeRuns,
    fitSetup,
    fitWorld,
    guganRatio,
    guganSetup,
    gugansMallet,
    meansOf,
    ratioOf,
    readOut,
    releaseSpeedFor,
    runFit,
    spreadOf,
    travelOf,
    type Candidate,
    type FitParams,
    type ReadOut,
} from "./ratioFit";
import { freeCollision, passes, videoIntervals, visible, type CandidateResult, type VideoInterval } from "./squeeze";

// The project has no Node types; this script runs under tsx and reads its environment.
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

const SECTION = process.env.SECTION ?? "all";
const fmt = (x: number): string => x.toFixed(4);

/** A yard (m). */
const YARD = 0.9144;

/** Gugan 5's drive: "about 3 m/s sending the croqueted ball about seven yards" (reference/sources/README.md:83-84). */
const GUGAN_DRIVE_YARDS = 7;

/**
 * The CA's travel unit and where its ball speed was measured, as reference/sources/README.md (P2b.2b.2c.2, Check 1)
 * records them.
 */
const CA_MEASURE = {
    unit: "m",
    unitLine:
        'README.md:491: "Unit: metres. Gugan 4, Table 2, row 1: \\"Total ball travel, L, m (from TEXT file)\\", ' +
        'values 0.93, 9.74 (A1D, A2D)"',
    pointLine:
        'README.md:494-495: "Measuring point: just after the impact ... \\"The values of speed in the tables are ' +
        'thus averages taken a few milliseconds *after* impact\\""',
};

/** `setup`'s stroke inputs: its backswing, its intensity (or none) and strokeFor's regime. */
function strokeText(setup: ShotSetup): string {
    const { backswing, intensity } = setup.stroke;
    const effort = intensity === undefined ? "no intensity" : `intensity ${fmt(intensity)}`;
    return `backswing ${fmt(backswing)} m, ${effort} (regime ${regimeOf(setup)})`;
}

function sectionA(): void {
    console.log(
        "== A. The distance check (design §3; recorded, not tuned): the CA's single-ball drives and Gugan 5's drive " +
            `on the open lawn (defaultWorld(10)'s surface, no hoops, a ${OPEN_LAWN} m square, the striker from ` +
            `(${fmt(OPEN_START.x)}, ${fmt(OPEN_START.y)}) m aiming +y), today's values; distances to rest ==`,
    );
    console.log(`the CA's travel unit: ${CA_MEASURE.unit} (${CA_MEASURE.unitLine})`);
    console.log(
        "the CA's ball speed: a few milliseconds after impact; the model's read at the face's release " +
            `(${CA_MEASURE.pointLine})`,
    );
    const world = fitWorld(TODAY, openWorld());
    const single = (speed: number): ShotSetup => opened(fitSetup("single-ball", TODAY, speed, world));
    for (const ca of CA_STROKES) {
        const short =
            ca.name === "A1D"
                ? " (a very short stroke: Hall's longer contacts apply, contact.json's faceBallContactTime note)"
                : "";
        console.log(
            `${ca.name}${short}: the CA's mallet ${fmt(ca.malletSpeed)} m/s, ball ${fmt(ca.ballSpeed)} m/s, travel ` +
                `${fmt(ca.travel)} ${CA_MEASURE.unit}`,
        );
        const struck = single(ca.malletSpeed);
        const strike = runFit(struck, TODAY, world);
        const released = length(strike.release.velocity);
        console.log(
            `  the strike's share: planned ${fmt(ca.malletSpeed)} m/s (${strokeText(struck)}): ball at the face's ` +
                `release ${fmt(released)} m/s against the CA's ${fmt(ca.ballSpeed)} m/s, ` +
                `×${fmt(released / ca.ballSpeed)}`,
        );
        const planned = releaseSpeedFor(ca.ballSpeed);
        const rolled = single(planned);
        const lawn = runFit(rolled, TODAY, world);
        const distance = travelOf(rolled, lawn.motion, rolled.striker);
        console.log(
            `  the lawn's share: planned ${fmt(planned)} m/s (${strokeText(rolled)}), ball at the face's release ` +
                `${fmt(length(lawn.release.velocity))} m/s: travel ${fmt(distance)} m` +
                `${haltedText(lawn.motion, rolled.striker)} against the CA's ${fmt(ca.travel)} ${CA_MEASURE.unit}, ` +
                `×${fmt(distance / ca.travel)}`,
        );
    }
    const speed = ratioTargetsReference.drive.speed.value;
    const drive = opened(fitSetup("drive", TODAY, speed, world));
    const motion = runFit(drive, TODAY, world).motion;
    const croqueted = drive.croqueted as BallId;
    const yards = travelOf(drive, motion, croqueted) / YARD;
    console.log(
        `Gugan 5's drive: planned ${fmt(speed)} m/s (${strokeText(drive)}): the croqueted ball ${fmt(yards)} yd` +
            `${haltedText(motion, croqueted)} against about ${GUGAN_DRIVE_YARDS} yd, ` +
            `×${fmt(yards / GUGAN_DRIVE_YARDS)}`,
    );
}

/** The default world, on which the preset digest plays its runs. */
const DRIFT_WORLD = defaultWorld();

/** One hand's grip over a follow-through: its peak and final |offset| (m), the peak's time (s) and its peak |force|. */
interface HandDrift {
    peak: number;
    peakAt: number;
    final: number;
    force: number;
    set: boolean;
}

/** One run's drift: each hand's, and whether a hand reached its limit in the follow-through. */
interface Drift {
    readonly top: HandDrift;
    readonly bottom: HandDrift;
    readonly limited: boolean;
}

/** The hands' grip through `setup`'s follow-through, read from the follow probe after every step. */
function driftOf(setup: ShotSetup): Drift {
    const plan = planStroke(setup, DRIFT_WORLD);
    const hand = (): HandDrift => ({ peak: 0, peakAt: 0, final: 0, force: 0, set: false });
    const top = hand();
    const bottom = hand();
    const read = (h: HandDrift, force: Vec3, offset: Vec3 | null, t: number): void => {
        h.force = Math.max(h.force, length(force));
        const slid = offset === null ? 0 : length(offset);
        h.set = h.set || offset !== null;
        if (slid > h.peak) {
            h.peak = slid;
            h.peakAt = t;
        }
        h.final = slid;
    };
    const probe: ImpactProbe = {
        step(): void {},
        follow(s: FollowSnapshot): void {
            read(top, s.top, s.offsets.top, s.t);
            read(bottom, s.bottom, s.offsets.bottom, s.t);
        },
    };
    const { follow } = simulateStroke(plan.contact, setup.balls, DRIFT_WORLD, { probe });
    return { top, bottom, limited: follow.flags.includes("follow-grip-limit") };
}

const mm = (x: number): string => fmt(x * 1e3);

/** One hand's drift as a line's part: peak and final |offset| (mm), the peak's time (ms) and peak |force| (N). */
function handText(name: string, h: HandDrift): string {
    return (
        `${name} peak ${mm(h.peak)} mm at ${mm(h.peakAt)} ms, final ${mm(h.final)} mm, ` +
        `peak force ${fmt(h.force)} N${h.set ? "" : " (no offset)"}`
    );
}

function sectionB(): void {
    console.log(
        "== B. The drift (design §4.3): the single-ball, drive, AC stop and GC stop presets' canonical setups " +
            "(3 m/s planned) and the preset digest's grid (5 speeds × 5 drives × 3 heights × 3 sides) on the " +
            "default world, each through " +
            "simulateStroke with a follow probe: each hand's peak and final |offset| (mm) over the follow-through, " +
            "the peak's time (ms from t = 0), each hand's peak |force| (N) over it, and the follow-grip-limit flag ==",
    );
    // A check's hold, where an anchor slides, follows any run planned with α < 0, not the stops alone: a single-ball
    // stroke at drive −1 is planned as a check and holds. The rolls are carry mode, which keeps its offset.
    for (const type of ["single-ball", "drive", "stop-ac", "stop-gc"] as const) {
        const base = canonicalSetup(type, { world: DRIFT_WORLD });
        let largest: { label: string; peak: number } | null = null;
        let set = 0;
        let total = 0;
        const report = (label: string, setup: () => ShotSetup): void => {
            total++;
            let drift: Drift;
            try {
                drift = driftOf(setup());
            } catch (error) {
                console.log(`${label}: rejected (${(error as Error).message})`);
                return;
            }
            const peak = Math.max(drift.top.peak, drift.bottom.peak);
            if (drift.top.set || drift.bottom.set) {
                set++;
            }
            if (largest === null || peak > largest.peak) {
                largest = { label, peak };
            }
            console.log(
                `${label}: ${handText("top", drift.top)}; ${handText("bottom", drift.bottom)}; ` +
                    `follow-grip-limit ${drift.limited ? "yes" : "no"}`,
            );
        };
        report(`${type} canonical`, () => base);
        const up0 = base.stroke.contact.up;
        for (const speed of [1, 2, 3, 4, 6]) {
            for (const drive of [-1, -0.5, 0, 0.5, 1]) {
                for (const up of [up0 - 0.003, up0, up0 + 0.003]) {
                    for (const side of [-0.01, 0, 0.01]) {
                        report(`${type} ${speed} m/s drive ${drive} up ${up} side ${side}`, () => {
                            const stroke = { ...base.stroke, drive, contact: { up, side } };
                            const setup = { ...base, stroke };
                            const backswing = backswingFor(setup, speed, DRIFT_WORLD);
                            return { ...setup, stroke: { ...stroke, backswing } };
                        });
                    }
                }
            }
        }
        // Assigned only inside report, so the compiler would narrow it to its initial null here.
        const best = largest as { label: string; peak: number } | null;
        console.log(
            `${type}: the largest peak ${best === null ? "none" : `${mm(best.peak)} mm, ${best.label}`}; ` +
                `${set} of ${total} runs with an offset set`,
        );
    }
}

/** The two targets as the sensitivity probe reads them: the ratio, its tolerance (half its band) and its speed. */
interface Target {
    readonly label: string;
    readonly type: RatioTargetKey;
    readonly ratio: number;
    readonly tolerance: number;
    readonly speed: number;
}

function targetOf(label: string, type: RatioTargetKey): Target {
    const { ratio, speed } = ratioTargetsReference[type];
    const [lo, hi] = ratio.bounds as readonly [number, number];
    return { label, type, ratio: ratio.value, tolerance: (hi - lo) / 2, speed: speed.value };
}

const TARGETS: readonly [Target, Target] = [targetOf("drive", "drive"), targetOf("stop", "stop-ac")];

/**
 * The effective-mass check's lower limit, a share of the head's mass m: the drive's effective mass at the face centre
 * along aim lies in [0.9·m, M], M the swung body's mass (ruling D, P2b.2b.2b.2c; tests/engine/shot.test.ts).
 */
const MASS_FLOOR = 0.9;

/** Numerical, not physical: the slope's difference step, a share of the bound's width. */
const SLOPE_SHARE = 0.01;

/** A scaled slope below this (ratio per bound width) on both ratios is "no effect". */
const NO_EFFECT = 0.01;

/** Numerical, not physical: a pair whose slope vectors lie within this angle (°) of parallel is degenerate. */
const DEGENERATE_ANGLE = 1;

/** Numerical, not physical: a scaled determinant below this share of its vectors' lengths' product is round-off. */
const DEGENERATE_DET = 1e-12;

/** The points swept across each bound, both ends included. */
const SWEEP_POINTS = 7;

/**
 * The drive's effective mass (kg) at the face centre along aim, the head's mass m and the swung body's mass M, on
 * `setup`'s planned contact; marked outside [MASS_FLOOR·m, M].
 */
interface MassCheck {
    readonly effective: number;
    readonly head: number;
    readonly body: number;
    readonly marked: boolean;
}

function massOf(setup: ShotSetup, world: World): MassCheck {
    const contact = planStroke(setup, world).contact;
    const drive = contact.drive;
    if (drive.kind !== "track") {
        throw new RangeError(`the ${setup.stroke.type} stroke's planned contact has no tracked drive`);
    }
    const { head } = contact;
    const body = swungBody(head, drive.hands, drive.arc.radius);
    const effective = effectiveMassOf(setup, world);
    const marked = !(MASS_FLOOR * head.mass <= effective && effective <= body.mass);
    return { effective, head: head.mass, body: body.mass, marked };
}

function massText(m: MassCheck): string {
    const share = (m.effective - m.head) / m.head;
    return (
        `m_eff ${fmt(m.effective)} kg, ${share >= 0 ? "+" : ""}${fmt(share * 100)} % from the head's m ` +
        `${fmt(m.head)} kg, the swung body's M ${fmt(m.body)} kg` +
        `${m.marked ? ` MARKED: outside [${fmt(MASS_FLOOR)}·m, M] (ruling D, P2b.2b.2b.2c)` : ""}`
    );
}

/** An error's text, whatever was thrown. */
function errorText(error: unknown): string {
    return error instanceof Error ? `${error.name}: ${error.message}` : `thrown: ${String(error)}`;
}

/**
 * `setup`'s follow-through flags with `p`'s hands' coupling. The evaluator plays only the impact, which is all a ratio
 * needs, so the follow-through is integrated apart, on the same coupling-replaced contact, for its flags alone.
 */
function followFlags(setup: ShotSetup, p: FitParams, world: World): readonly string[] {
    const plan = planStroke(setup, world);
    const drive = plan.contact.drive;
    if (drive.kind !== "track") {
        throw new RangeError(`the ${setup.stroke.type} stroke's planned contact has no tracked drive`);
    }
    const coupling = { ...drive.coupling, period: p.handCouplingPeriod, dampingRatio: p.handCouplingDampingRatio };
    const contact: ContactState = { ...plan.contact, drive: { ...drive, coupling } };
    return simulateStroke(contact, setup.balls, world).follow.flags;
}

/** One stroke's evaluation: its ratio (null when it threw) and every flag, cap, guard hit or error on the way. */
interface StrokeEval {
    readonly ratio: number | null;
    readonly notes: readonly string[];
    readonly mass: MassCheck | null;
}

/** The impact's events by kind, with their counts, and the re-entry guard's hits. */
function impactNotes(impact: ImpactResult): string[] {
    const counts = new Map<string, number>();
    for (const e of impact.events) {
        counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
    }
    const notes = [...counts].map(([kind, n]) => `${kind}×${n}`);
    const jumps = impact.entryJumps;
    if (jumps !== undefined && jumps.count > 0) {
        notes.push(`re-entry guard ×${jumps.count} (worst ${mm(jumps.worst)} mm: ${jumps.keys.join(", ")})`);
    }
    return notes;
}

/**
 * `setup`'s stroke under `p` on `world` through the evaluator: its ratio, its impact's flags and guard hits, its
 * follow-through's flags when `follow` asks (a second integration, so only at a swept point), and, when `withMass`
 * asks, the drive's effective-mass check. Every throw is caught and noted.
 */
function evaluateStroke(
    make: () => ShotSetup,
    p: FitParams,
    world: World,
    { withMass, follow }: { readonly withMass: boolean; readonly follow: boolean },
): StrokeEval {
    const notes: string[] = [];
    let setup: ShotSetup;
    try {
        setup = make();
    } catch (error) {
        return { ratio: null, notes: [`setup ${errorText(error)}`], mass: null };
    }
    let mass: MassCheck | null = null;
    if (withMass) {
        try {
            mass = massOf(setup, world);
        } catch (error) {
            notes.push(`effective mass ${errorText(error)}`);
        }
    }
    let ratio: number | null = null;
    try {
        const { impact, motion } = runFit(setup, p, world);
        notes.push(...impactNotes(impact));
        ratio = ratioOf(setup, motion);
    } catch (error) {
        notes.push(errorText(error));
    }
    if (follow) {
        try {
            notes.push(...followFlags(setup, p, world));
        } catch (error) {
            notes.push(`follow-through ${errorText(error)}`);
        }
    }
    return { ratio, notes, mass };
}

/** Both targets' strokes at one point of the five candidates. */
interface PointEval {
    readonly drive: StrokeEval;
    readonly stop: StrokeEval;
    readonly follow: boolean;
}

const EVALUATED = new Map<string, PointEval>();

/**
 * Both targets' strokes under `p`, each at its target's speed on fitWorld(p), with their follow-through flags when
 * `follow` asks; memoised on `p`, a point evaluated with its flags serving a request without them.
 */
function evaluatePoint(p: FitParams, follow: boolean): PointEval {
    const key = JSON.stringify(p);
    const known = EVALUATED.get(key);
    if (known !== undefined && (known.follow || !follow)) {
        return known;
    }
    const world = fitWorld(p);
    const [drive, stop] = TARGETS.map((target) =>
        evaluateStroke(() => fitSetup(target.type, p, target.speed, world), p, world, {
            withMass: target.type === "drive",
            follow,
        }),
    ) as [StrokeEval, StrokeEval];
    const point = { drive, stop, follow };
    EVALUATED.set(key, point);
    return point;
}

const ratioText = (r: number | null): string => (r === null ? "none" : fmt(r));

function strokeEvalText(label: string, s: StrokeEval): string {
    return `${label} ${ratioText(s.ratio)}${s.notes.length > 0 ? ` [${s.notes.join("; ")}]` : ""}`;
}

/** `count` points evenly across `[lo, hi]`, both ends exact, and `today` added (sorted) if not among them. */
function sweepOf(lo: number, hi: number, today: number, count: number): number[] {
    const points = Array.from({ length: count }, (_, i) => (i === count - 1 ? hi : lo + (i * (hi - lo)) / (count - 1)));
    if (!points.includes(today)) {
        points.push(today);
        points.sort((a, b) => a - b);
    }
    return points;
}

/**
 * The slope (ratio per unit) at `today` of each value `f` gives, by a central difference of SLOPE_SHARE of the bound's
 * width, one-sided where a side would leave the bounds; NaN where an evaluation gave no ratio. Its kind is named.
 */
function slopeOf(
    lo: number,
    hi: number,
    today: number,
    f: (x: number) => readonly (number | null)[],
): { readonly slopes: readonly number[]; readonly kind: string } {
    const h = SLOPE_SHARE * (hi - lo);
    const up = today + h <= hi;
    const down = today - h >= lo;
    const plus = up ? today + h : today;
    const minus = down ? today - h : today;
    const kind = up && down ? "central" : up ? "forward (at its lower bound)" : "backward (at its upper bound)";
    const fp = f(plus);
    const fm = f(minus);
    const slopes = fp.map((v, i) => {
        const w = fm[i] ?? null;
        return v === null || w === null ? NaN : (v - w) / (plus - minus);
    });
    return { slopes, kind };
}

/** A candidate's sensitivity: its bound's width, and each ratio's slope at today's value (ratio per unit). */
interface Sensitivity {
    readonly key: Candidate;
    readonly width: number;
    readonly drive: number;
    readonly stop: number;
}

/** A pair's linear reach and distinctness. */
interface PairReach {
    readonly a: Candidate;
    readonly b: Candidate;
    readonly angle: number;
    readonly degenerate: string | null;
    readonly values: readonly [number, number] | null;
    readonly reachable: boolean;
    readonly mass: MassCheck | null;
    readonly massError: string | null;
}

const withValue = (p: FitParams, key: Candidate, value: number): FitParams => ({ ...p, [key]: value });

/**
 * A pair's reach: the angle (°, in [0, 180]) between the two slope vectors in the (drive, stop) plane, each slope times
 * its bound's width; and, unless near parallel, today's errors solved against those columns, reachable when both
 * values lie inside their bounds, with the drive's effective mass at the solution.
 */
function reachOf(sa: Sensitivity, sb: Sensitivity, errors: readonly [number, number]): PairReach {
    const ua = [sa.drive * sa.width, sa.stop * sa.width] as const;
    const ub = [sb.drive * sb.width, sb.stop * sb.width] as const;
    const det = ua[0] * ub[1] - ub[0] * ua[1];
    const dot = ua[0] * ub[0] + ua[1] * ub[1];
    const lengths = Math.hypot(ua[0], ua[1]) * Math.hypot(ub[0], ub[1]);
    const angle = (Math.atan2(Math.abs(det), dot) * 180) / Math.PI;
    const base = { a: sa.key, b: sb.key, angle, mass: null, massError: null };
    let degenerate: string | null = null;
    if (![det, dot, lengths].every(Number.isFinite)) {
        degenerate = "a slope is missing";
    } else if (!(lengths > 0)) {
        degenerate = "a slope vector is zero";
    } else if (angle < DEGENERATE_ANGLE || angle > 180 - DEGENERATE_ANGLE) {
        degenerate = `near parallel (${fmt(angle)}°)`;
    } else if (Math.abs(det) <= DEGENERATE_DET * lengths) {
        degenerate = "determinant at round-off";
    }
    if (degenerate !== null) {
        return { ...base, degenerate, values: null, reachable: false };
    }
    const [e0, e1] = errors;
    const za = (ub[0] * e1 - ub[1] * e0) / det;
    const zb = (ua[1] * e0 - ua[0] * e1) / det;
    const values = [TODAY[sa.key] + za * sa.width, TODAY[sb.key] + zb * sb.width] as const;
    const inside = (key: Candidate, v: number): boolean => BOUNDS[key][0] <= v && v <= BOUNDS[key][1];
    const reachable = inside(sa.key, values[0]) && inside(sb.key, values[1]);
    if (!reachable) {
        return { ...base, degenerate, values, reachable };
    }
    const p = withValue(withValue(TODAY, sa.key, values[0]), sb.key, values[1]);
    const world = fitWorld(p);
    try {
        const mass = massOf(fitSetup("drive", p, TARGETS[0].speed, world), world);
        return { ...base, degenerate, values, reachable, mass };
    } catch (error) {
        return { ...base, degenerate, values, reachable, massError: errorText(error) };
    }
}

/**
 * How each candidate's values print: in a unit, to a precision, that tells its swept points apart (four decimals of a
 * second would show 0.75 ms and 0.81 ms alike); `si` names the unit its per-unit slopes are in.
 */
const DISPLAY: Readonly<
    Record<Candidate, { readonly scale: number; readonly digits: number; readonly unit: string; readonly si: string }>
> = {
    ballBallContactTime: { scale: 1e3, digits: 3, unit: " ms", si: "s" },
    handCouplingPeriod: { scale: 1e3, digits: 1, unit: " ms", si: "s" },
    handCouplingDampingRatio: { scale: 1, digits: 4, unit: "", si: "unit" },
    armMass: { scale: 1, digits: 4, unit: " kg", si: "kg" },
    reachSlack: { scale: 1e3, digits: 2, unit: " mm", si: "m" },
};

/** Candidate `key`'s value `v` in its display unit, without the unit. */
const bare = (key: Candidate, v: number): string => (v * DISPLAY[key].scale).toFixed(DISPLAY[key].digits);

/** Candidate `key`'s value `v` in its display unit. */
const valueText = (key: Candidate, v: number): string => `${bare(key, v)}${DISPLAY[key].unit}`;

/** Candidate `key`'s bounds in its display unit. */
function boundsText(key: Candidate): string {
    const [lo, hi] = BOUNDS[key];
    return `[${bare(key, lo)}, ${bare(key, hi)}]${DISPLAY[key].unit}`;
}

/** A solved value beside its bounds, noted when it lies within SLOPE_SHARE of the width of a bound. */
function solvedText(key: Candidate, v: number): string {
    const [lo, hi] = BOUNDS[key];
    const inside = lo <= v && v <= hi;
    const near = Math.min(Math.abs(v - lo), Math.abs(v - hi)) <= SLOPE_SHARE * (hi - lo);
    const where = inside ? (near ? "inside, near its bound" : "inside") : "OUTSIDE";
    return `${key} ${valueText(key, v)} in ${boundsText(key)} (${where}; today ${valueText(key, TODAY[key])})`;
}

/** Both ratios' errors (ratio − target) and their shares of each tolerance. */
function errorsText(drive: number | null, stop: number | null): string {
    return [drive, stop]
        .map((r, i) => {
            const t = TARGETS[i] as Target;
            if (r === null) {
                return `${t.label} none`;
            }
            const e = r - t.ratio;
            return (
                `${t.label} ${fmt(r)} against ${fmt(t.ratio)} ± ${fmt(t.tolerance)} at ${fmt(t.speed)} m/s: ` +
                `error ${fmt(e)}, ${fmt(e / t.tolerance)} tolerances`
            );
        })
        .join("; ");
}

/** A preset's own grip, swept only when no shared pair can reach both targets. */
interface GripCandidate {
    readonly target: Target;
    readonly field: "gripTension" | "bottomGrip";
}

/** The grips' sweep range: the presets' own values span 0.1 (the AC stop's) to 1, and a grip lies in (0, 1]. */
const GRIP_BOUNDS = [0.1, 1] as const;

/** The setup fitSetup builds for `type` under TODAY, with its own stance's `field` set to `value`. */
function gripSetup(type: RatioTargetKey, field: GripCandidate["field"], value: number, world: World): ShotSetup {
    const body = { armMass: TODAY.armMass, reachSlack: TODAY.reachSlack };
    const stance = field === "gripTension" ? { gripTension: value } : { bottomGrip: value };
    const setup = canonicalSetup(type, { world, body, stance });
    const speed = ratioTargetsReference[type].speed.value;
    return { ...setup, stroke: { ...setup.stroke, ...strokeFor(setup, speed, world) } };
}

function sweepGrips(): void {
    console.log(
        "-- C.6 The presets' own grips (no shared pair reaches both targets): the drive's and the AC stop's " +
            `gripTension and bottomGrip, each on its own preset only, across [${fmt(GRIP_BOUNDS[0])}, ` +
            `${fmt(GRIP_BOUNDS[1])}] (the presets' own range), the shared candidates at today's values; ` +
            "follow-through flags at the swept points only --",
    );
    const world = STRIKE_WORLD;
    const grips: readonly GripCandidate[] = TARGETS.flatMap((target) =>
        (["gripTension", "bottomGrip"] as const).map((field) => ({ target, field })),
    );
    for (const { target, field } of grips) {
        const today = defaultProfile.stance[target.type][field];
        const [lo, hi] = GRIP_BOUNDS;
        const seen = new Map<number, { readonly s: StrokeEval; readonly follow: boolean }>();
        const at = (v: number, follow = false): StrokeEval => {
            const known = seen.get(v);
            if (known !== undefined && (known.follow || !follow)) {
                return known.s;
            }
            const make = (): ShotSetup => gripSetup(target.type, field, v, world);
            const s = evaluateStroke(make, TODAY, world, { withMass: target.type === "drive", follow });
            seen.set(v, { s, follow });
            return s;
        };
        console.log(`${target.type} ${field} (today ${fmt(today)}):`);
        for (const v of sweepOf(lo, hi, today, SWEEP_POINTS)) {
            const s = at(v, true);
            const mass = s.mass === null ? "" : `; ${massText(s.mass)}`;
            console.log(`  ${fmt(v)}${v === today ? " (today)" : ""}: ${strokeEvalText(target.label, s)}${mass}`);
        }
        const { slopes, kind } = slopeOf(lo, hi, today, (v) => [at(v).ratio]);
        const slope = slopes[0] as number;
        const width = hi - lo;
        const now = at(today).ratio;
        const solved = now === null || !(Math.abs(slope) > 0) ? null : today - (now - target.ratio) / slope;
        const reach =
            solved === null
                ? "no linear estimate"
                : `linear estimate ${fmt(solved)} (${lo <= solved && solved <= hi ? "inside" : "OUTSIDE"} its range)`;
        console.log(`  slope (${kind}): ${fmt(slope * width)} per range width; ${reach}`);
    }
}

function sectionC(): void {
    console.log(
        "== C. The sensitivity probe (design §5.2): the drive's and the AC stop's canonical setups at their " +
            "targets' speeds through the fit's evaluator, each candidate swept across its bounds with the rest at " +
            "today's values, the obstacles' contact times moved with the ball–ball contact time; the ratios from the " +
            "evaluator's impact, the follow-through integrated apart (simulateStroke, the same coupling) for its " +
            "flags only, at today's value and the swept points alone, not at the slopes' points ==",
    );
    const today = evaluatePoint(TODAY, true);
    const ratios = [today.drive.ratio, today.stop.ratio] as const;
    console.log(`-- C.1 Today's ratios: ${errorsText(ratios[0], ratios[1])} --`);
    console.log(`today: ${strokeEvalText("drive", today.drive)}; ${strokeEvalText("stop", today.stop)}`);
    if (today.drive.mass !== null) {
        console.log(`today: ${massText(today.drive.mass)}`);
    }
    const keys = Object.keys(TODAY) as Candidate[];
    console.log(
        `-- C.2 Per candidate, ${SWEEP_POINTS} points evenly across its bounds (today's value added if not among ` +
            "them): both ratios with any flag, cap, error or guard hit in brackets, and the drive's effective " +
            "mass m_eff at the face centre along aim, its deviation from the head's mass m in %, and the swung " +
            "body's mass M, MARKED outside [0.9·m, M] (ruling D, P2b.2b.2b.2c) --",
    );
    for (const key of keys) {
        const [lo, hi] = BOUNDS[key];
        console.log(`${key} (today ${valueText(key, TODAY[key])}, bounds ${boundsText(key)}):`);
        for (const v of sweepOf(lo, hi, TODAY[key], SWEEP_POINTS)) {
            const point = evaluatePoint(withValue(TODAY, key, v), true);
            const mass = point.drive.mass === null ? "effective mass none" : massText(point.drive.mass);
            console.log(
                `  ${valueText(key, v)}${v === TODAY[key] ? " (today)" : ""}: ` +
                    `${strokeEvalText("drive", point.drive)}; ` +
                    `${strokeEvalText("stop", point.stop)}; ${mass}`,
            );
        }
    }
    console.log(
        `-- C.3 Slopes at today's value (a difference of ±${fmt(SLOPE_SHARE * 100)} % of the bound's width, ` +
            "one-sided at a bound), each times its bound's width (ratio per bound width); no effect where both are " +
            `under ${fmt(NO_EFFECT)} --`,
    );
    const sensitivities: Sensitivity[] = keys.map((key) => {
        const [lo, hi] = BOUNDS[key];
        const f = (v: number): readonly (number | null)[] => {
            const point = evaluatePoint(withValue(TODAY, key, v), false);
            return [point.drive.ratio, point.stop.ratio];
        };
        const { slopes, kind } = slopeOf(lo, hi, TODAY[key], f);
        const [drive, stop] = slopes as [number, number];
        const width = hi - lo;
        const none = Math.abs(drive * width) < NO_EFFECT && Math.abs(stop * width) < NO_EFFECT;
        console.log(
            `${key} at ${valueText(key, TODAY[key])} in ${boundsText(key)} (${kind}): drive ` +
                `${fmt(drive * width)}, stop ${fmt(stop * width)} per bound width (${fmt(drive)}, ${fmt(stop)} ` +
                `per ${DISPLAY[key].si})${none ? "; no effect" : ""}`,
        );
        return { key, width, drive, stop };
    });
    console.log(
        "-- C.4 Per pair: the angle between the two slope vectors (each slope times its bound's width), and today's " +
            "errors solved against those slopes (linear), reachable when both values lie within their bounds, with " +
            "the drive's effective mass at a reachable solution --",
    );
    const errors =
        ratios[0] === null || ratios[1] === null
            ? ([NaN, NaN] as const)
            : ([ratios[0] - TARGETS[0].ratio, ratios[1] - TARGETS[1].ratio] as const);
    const pairs: PairReach[] = [];
    for (let i = 0; i < sensitivities.length; i++) {
        for (let j = i + 1; j < sensitivities.length; j++) {
            pairs.push(reachOf(sensitivities[i] as Sensitivity, sensitivities[j] as Sensitivity, errors));
        }
    }
    const pairText = (r: PairReach): string => {
        const head = `${r.a} + ${r.b}: angle ${fmt(r.angle)}°`;
        if (r.degenerate !== null) {
            return `${head}; degenerate (${r.degenerate}), not solved`;
        }
        const values = r.values as readonly [number, number];
        const mass =
            r.mass !== null ? `; ${massText(r.mass)}` : r.massError !== null ? `; effective mass ${r.massError}` : "";
        return (
            `${head}; ${solvedText(r.a, values[0])}, ${solvedText(r.b, values[1])}: ` +
            `${r.reachable ? "reachable" : "not reachable"}${mass}`
        );
    };
    for (const r of pairs) {
        console.log(pairText(r));
    }
    console.log(
        "-- C.5 Ranked: reachable pairs first, then the rest, then the degenerate; each by angle nearest 90° --",
    );
    const rank = (r: PairReach): number => (r.reachable ? 0 : r.degenerate === null ? 1 : 2);
    const ranked = [...pairs].sort((x, y) => rank(x) - rank(y) || Math.abs(x.angle - 90) - Math.abs(y.angle - 90));
    ranked.forEach((r, i) => console.log(`${i + 1}. ${pairText(r)}`));
    const recommended = ranked.find((r) => r.reachable && r.mass !== null && !r.mass.marked);
    console.log(
        recommended === undefined
            ? "recommendation: none (no reachable pair with an unmarked effective mass)"
            : `recommendation: ${recommended.a} + ${recommended.b}`,
    );
    if (!pairs.some((r) => r.reachable)) {
        sweepGrips();
    }
}

/** One of le Maitre's makes: his stop shot ratio, and his drive or roll's printed ratio and distances (m). */
interface MaitreMake {
    readonly ball: string;
    readonly stop: number;
    readonly printed: number;
    readonly forward: number;
    readonly backward: number;
}

/** le Maitre's table, as reference/sources/README.md:528-533 copies it. */
const MAITRE: readonly MaitreMake[] = [
    { ball: "Walker", stop: 4.2, printed: 2.8, forward: 8.26, backward: 3.3 },
    { ball: "Barlow", stop: 3.7, printed: 2.0, forward: 7.0, backward: 3.46 },
    { ball: "Old Jaques", stop: 3.2, printed: 2.1, forward: 7.29, backward: 3.44 },
    { ball: "New Jaques", stop: 2.7, printed: 1.8, forward: 6.34, backward: 3.18 },
];

function sectionH(): void {
    console.log(
        "== H. The ball makes (design §6; recorded, not judged): the sources' findings as " +
            'reference/sources/README.md records them, section "P2b.2b.2c.2: the croquet strokes\' fit" ==',
    );
    console.log(
        "the make behind the face law (README.md:512-514): Gugan 2000: " +
            '"The ball used was a Jaques "Eclipse" ball (commonly used in the game of croquet), ' +
            'which fell on a wooden mallet"',
    );
    console.log(
        "the make in Gugan 5's drives (README.md:510-511): \"The balls were Dawson 'Internationals', all in " +
            'excellent condition: independent measurements of their CoR were not made"',
    );
    console.log(
        "whether the makes differ (README.md:516-518): " +
            '"So the makes differ: the face fits come from a Jaques Eclipse and the targets from Dawson ' +
            'Internationals." Recorded, not corrected; the fit takes the face fits as ' +
            "sourced and moves only its listed candidates.",
    );
    console.log(
        "le Maitre's spread (README.md:522-526): the stop shot's, forward ball over backward ball, not his drive's: " +
            '"Calculation of the ratio of distance travelled by the forward ball to the backward ball gives a value ' +
            'of 4.2 for Walker, 3.7 for Barlow, 3.2 for old Jaques and 2.7 for new Jaques balls."',
    );
    console.log(
        "  his drive or roll (README.md:528-533) is a weighted-head follow-through stroke, not Gugan 5's pendulum " +
            "drive; the README copies his printed ratios. Neither set is a target.",
    );
    for (const m of MAITRE) {
        const own = m.forward / m.backward;
        console.log(
            `  ${m.ball}: stop ratio ${m.stop.toFixed(1)}; drive or roll ${m.forward.toFixed(3)} m forward, ` +
                `${m.backward.toFixed(3)} m backward, printed ratio ${m.printed.toFixed(1)}, his own distances give ` +
                `${own.toFixed(1)}`,
        );
    }
}

/** A time in ms to four decimals. */
const ms = (t: number): string => fmt(t * 1e3);

/** `ok` as the words the tables use. */
const verdict = (ok: boolean): string => (ok ? "pass" : "miss");

/** The world the filmed strokes and the gap sweep are played on. */
const STRIKE_WORLD = fitWorld(TODAY);

/** The face–ball and ball–ball intervals of `impact` as text, each key's in ms; the turf's and obstacles' left out. */
function intervalTexts(impact: ImpactResult): string[] {
    const isBall = (part: string | undefined): boolean => (BALL_IDS as readonly (string | undefined)[]).includes(part);
    return Object.entries(impact.timeline)
        .filter(([key]) => {
            const parts = key.split("/");
            return parts.length === 2 && (parts[0] === "face" ? isBall(parts[1]) : parts.every(isBall));
        })
        .map(([key, intervals]) => `${key} ${intervals.map((i) => `[${ms(i.start)}, ${ms(i.end)}]`).join(" ")} ms`);
}

/** `setup`'s read-out, its figures with k the mallet's effective mass over the ball's, and its distance ratio. */
function strikeOf(
    setup: ShotSetup,
    world: World,
): { readonly read: ReadOut; readonly figures: ReturnType<typeof figuresOf>; readonly distance: number } {
    const read = readOut(setup, world);
    const figures = figuresOf(read, effectiveMassOf(setup, world) / world.ball.mass);
    const distance = ratioOf(setup, simulateFreeMotion(read.impact.handover, world));
    return { read, figures, distance };
}

/** The read-out's speeds (m/s) and read time (ms), flagged when the strike did not close within its window. */
function speedsText(r: ReadOut): string {
    return (
        `U ${fmt(r.U)}, W ${fmt(r.W)}, w1 ${fmt(r.w1)}, v2 ${fmt(r.v2)} m/s read at ${ms(r.time)} ms` +
        `${r.open ? " (OPEN: a face interval not ended within the strike window)" : ""}`
    );
}

/** The gaps (m) the sweep covers, finely below 0.5 mm (design §9). */
const SWEEP_GAPS = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 1.9].map((g) => g * 1e-3);

/** Table 5's stroke `name`. */
function filmed(name: string): FilmedStroke {
    const found = FILMED_STROKES.find((s) => s.name === name);
    if (found === undefined) {
        throw new RangeError(`no filmed stroke ${name}`);
    }
    return found;
}

function sectionD(): void {
    console.log(
        "== D. Gap 0 re-measured, and the sweep (design §9): speeds in m/s, intervals in ms from the impact's start, " +
            "the squared speed ratio (v2/w1)² and the distance ratio L2/L1 (the croqueted ball's travel to rest over " +
            "the striker's) ==",
    );
    const drive = (gugan: boolean): ShotSetup =>
        guganSetup("drive", GUGAN5.speed, 0, { world: STRIKE_WORLD, gugan, guideEffort: 0 });
    for (const [label, gugan] of [
        ["default mallet", false],
        ["Gugan's mallet", true],
    ] as const) {
        const setup = drive(gugan);
        const { read, figures, distance } = strikeOf(setup, STRIKE_WORLD);
        console.log(
            `-- D.1 the canonical drive, ${fmt(GUGAN5.speed)} m/s, gap 0, guideEffort 0, ${label} (effective mass ` +
                `${fmt(effectiveMassOf(setup, STRIKE_WORLD) / STRIKE_WORLD.ball.mass)} ball masses) --`,
        );
        console.log(`  ${speedsText(read)}`);
        for (const text of intervalTexts(read.impact)) {
            console.log(`  interval ${text}`);
        }
        console.log(
            `  (v2/w1)² ${fmt(figures.v2w1 ** 2)}, distance ratio ${fmt(distance)}; v2/U ${fmt(figures.v2U)}, ` +
                `w1/W ${fmt(figures.w1W)}, v2/w1 ${fmt(figures.v2w1)}`,
        );
    }
    console.log(
        "-- D.2 the gap sweep, candidate a (the default mallet, no push, no jab): v2/U, w1/W, v2/w1 and the " +
            "stroke's ratio L2/L1 at each gap (mm) --",
    );
    const series = [
        { label: "drive at 3 m/s", type: "drive", speed: GUGAN5.speed },
        { label: "AC stop at C3S's U", type: "stop-ac", speed: filmed("C3S").malletSpeed },
        { label: "AC stop at C20S's U", type: "stop-ac", speed: filmed("C20S").malletSpeed },
    ] as const;
    for (const { label, type, speed } of series) {
        console.log(`${label} (${fmt(speed)} m/s):`);
        for (const gap of SWEEP_GAPS) {
            const push = type === "drive" ? { guideEffort: 0 } : { jab: 0 };
            try {
                const setup = guganSetup(type, speed, gap, { world: STRIKE_WORLD, ...push });
                const { read, figures, distance } = strikeOf(setup, STRIKE_WORLD);
                console.log(
                    `  gap ${mm(gap)} mm: v2/U ${fmt(figures.v2U)}, w1/W ${fmt(figures.w1W)}, v2/w1 ` +
                        `${fmt(figures.v2w1)}, ratio ${fmt(distance)}${read.open ? " (OPEN)" : ""}`,
                );
            } catch (error) {
                console.log(`  gap ${mm(gap)} mm: ${errorText(error)}`);
            }
        }
    }
}

/** A filmed stroke's gap shifted by `delta` (m): never below 0, never within 0.1 mm of a croquet stroke's limit. */
function shiftedGap(s: FilmedStroke, delta: number): number {
    return Math.max(0, Math.min(s.gap + delta, CROQUET_GAP_LIMIT - 1e-4));
}

/** The filmed strokes' three figures as Table 5 gives them, and the energy kept with Gugan's effective mass. */
function rowOf(s: FilmedStroke): ReturnType<typeof figuresOf> {
    const k = GUGAN_EFFECTIVE_MASS;
    const [U, W, w1, v2] = [s.malletSpeed, s.malletAfter, s.striker, s.croqueted];
    return {
        v2U: v2 / U,
        w1W: w1 / W,
        v2w1: v2 / w1,
        WU: W / U,
        energy: (k * W * W + w1 * w1 + v2 * v2) / (k * U * U),
    };
}

/** The figures' keys and Gugan's means of the three the pass rests on. */
const MEAN_KEYS = ["v2U", "w1W", "v2w1"] as const;

function sectionE(): void {
    console.log(
        "== E. The filmed strokes (design §5.2, §5.3): each on its preset at its U and recorded gap, the preset's " +
            "push, no jab, the default mallet; the model's figures against Table 5's row (the row's energy with " +
            `k = ${fmt(GUGAN_EFFECTIVE_MASS)}, the model's with its own effective mass); OPEN marks a strike not ` +
            "closed within the strike window, which no mean counts ==",
    );
    const world = STRIKE_WORLD;
    const runs = filmedStrokeRuns(undefined, { world });
    console.log("-- E.1 each stroke at its recorded gap --");
    for (const { stroke, gap, read, figures } of runs) {
        const row = rowOf(stroke);
        const against = (m: number, r: number): string => `${fmt(m)} (row ${fmt(r)})`;
        console.log(
            `${stroke.name} (${stroke.preset}, U ${fmt(stroke.malletSpeed)} m/s, gap ${mm(gap)} mm` +
                `${stroke.nominal ? ", nominal" : ""})${read.open ? " OPEN" : ""}: ` +
                `v2/U ${against(figures.v2U, row.v2U)}, ` +
                `w1/W ${against(figures.w1W, row.w1W)}, v2/w1 ${against(figures.v2w1, row.v2w1)}, ` +
                `W/U ${against(figures.WU, row.WU)}, energy ${against(figures.energy, row.energy)}; (v2/w1)² ` +
                `${fmt(figures.v2w1 ** 2)} ` +
                `(row 16 ${stroke.squaredRatio === null ? "none" : fmt(stroke.squaredRatio)})`,
        );
    }
    console.log(
        "-- E.2 sensitivity: the nominal strokes repeated at ±0.5 mm (never below 0, never within 0.1 mm of 2 mm) --",
    );
    for (const delta of [-0.5e-3, 0.5e-3]) {
        const shifted = filmedStrokeRuns((s) => (s.nominal ? shiftedGap(s, delta) : s.gap), { world });
        for (const { stroke, gap, read, figures } of shifted.filter((r) => r.stroke.nominal)) {
            const base = (runs.find((r) => r.stroke.name === stroke.name) as (typeof runs)[number]).figures;
            console.log(
                `${stroke.name} at ${mm(gap)} mm${read.open ? " OPEN" : ""}: v2/U ${fmt(figures.v2U)} ` +
                    `(${fmt(figures.v2U - base.v2U)} from the recorded gap), w1/W ${fmt(figures.w1W)} ` +
                    `(${fmt(figures.w1W - base.w1W)}), v2/w1 ${fmt(figures.v2w1)} (${fmt(figures.v2w1 - base.v2w1)})`,
            );
        }
    }
    console.log(
        "-- E.3 the three means over the counted strokes (those closed within the window) against Gugan 4's, each " +
            "pass when within his sem --",
    );
    const kinds = [
        ["C3S and C20S counted", runs],
        ["C3S and C20S left out", runs.filter((r) => r.stroke.name !== "C3S" && r.stroke.name !== "C20S")],
    ] as const;
    for (const [label, set] of kinds) {
        const counted = set.filter((r) => !r.read.open);
        const named = counted.map((r) => r.stroke.name);
        const names = named.join(", ");
        const means = meansOf(set, named);
        const parts = MEAN_KEYS.map((key) => {
            const { value, sem } = GUGAN_MEANS[key];
            const diff = means[key] - value;
            return (
                `${key} ${fmt(means[key])} against ${fmt(value)} ± ${fmt(sem)} (${fmt(diff)}, ${fmt(diff / sem)} ` +
                `sem): ${verdict(Math.abs(diff) <= sem)}`
            );
        });
        console.log(`${label} (${counted.length} counted: ${names}): ${parts.join("; ")}`);
    }
}

/** A Fig. 4 reading as the research agent made it (reference/sources/README.md:609-616), frames from first contact. */
const RESEARCH_FRAMES: Readonly<Record<string, readonly [number, number, number, number, number]>> = {
    C3S: [4.8, 5.2, 11.3, 11.0, 19.1],
    C20S: [4.0, 5.2, 10.0, 9.8, 16.2],
    C1D: [6.0, 6.5, 13.2, 12.8, 21.1],
    C10S: [4.8, 6.1, 11.1, 10.9, 19.0],
    C3D: [4.8, 7.9, 11.3, 10.8, 16.2],
    C10D: [3.8, 6.0, 9.3, 6.3, 13.3],
};

/**
 * The model's four times (s from the face's first contact) and whether its three bodies stay loaded together. An end
 * is Infinity while the video still sees its contact at the impact's end.
 */
interface ModelTiming {
    readonly firstMoves: number | null;
    readonly firstContactEnds: number;
    readonly leaves: number | null;
    readonly secondTap: readonly [number, number] | null;
    readonly together: boolean;
}

/**
 * The four times from the `face` and `pair` intervals and the second ball's first visible move at `moved` (s): the
 * move, the first face interval's end, the pair interval's end (the latest beginning within STRIKE_WINDOW) and any
 * second face interval beginning within STRIKE_WINDOW (a later one is the follow-through's approach, not a tap).
 * `together` when the first face interval begins no later than the pair's and ends no earlier, so that the mallet never
 * lets go before the ball leaves. Throws a RangeError when the face has no interval.
 */
function timesOf(face: readonly VideoInterval[], pair: readonly VideoInterval[], moved: number | null): ModelTiming {
    const endOf = (i: VideoInterval): number => i.end ?? Infinity;
    const first = face[0];
    if (first === undefined) {
        throw new RangeError("timesOf: the face never touched the striker's ball");
    }
    const inStrike = (i: VideoInterval): boolean => i.start <= first.start + STRIKE_WINDOW;
    const within = pair.filter(inStrike);
    const start = within[0];
    const leaves = within.length === 0 ? null : Math.max(...within.map(endOf));
    const tap = face.slice(1).find(inStrike);
    return {
        firstMoves: moved === null ? null : moved - first.start,
        firstContactEnds: endOf(first) - first.start,
        leaves: leaves === null ? null : leaves - first.start,
        secondTap: tap === undefined ? null : [tap.start - first.start, endOf(tap) - first.start],
        together: start !== undefined && leaves !== null && first.start <= start.start && endOf(first) >= leaves,
    };
}

/**
 * `setup`'s timing as Fig. 4 shows it (timesOf), twice: from the contact law's intervals, and as the video would time
 * it, from videoIntervals over the face's separation from the striker's ball (faceClearance) and the balls' gap. Both
 * take the second ball's first move as its horizontal displacement first visible, each from its own first face contact.
 */
function timingOf(setup: ShotSetup, world: World): { readonly law: ModelTiming; readonly video: ModelTiming } {
    const contact = planStroke(setup, world).contact;
    const other = setup.croqueted ?? setup.live[0];
    if (other === undefined) {
        throw new RangeError(`timingOf: the ${setup.stroke.type} stroke has no second ball`);
    }
    const R = world.ball.radius;
    const ids = BALL_IDS.filter((id) => setup.balls[id] !== undefined);
    const striker = ids.indexOf(setup.striker);
    const second = ids.indexOf(other);
    const home = (setup.balls[other] as BallState).position;
    let moved: number | null = null;
    const faceSeen: { t: number; separation: number }[] = [];
    const pairSeen: { t: number; separation: number }[] = [];
    const probe: ImpactProbe = {
        step(s) {
            const a = (s.balls[striker] as BallState).position;
            const b = (s.balls[second] as BallState).position;
            if (moved === null && visible(length(horizontal(sub(b, home))))) {
                moved = s.t;
            }
            faceSeen.push({ t: s.t, separation: faceClearance(s.head, contact.head, a, R) });
            pairSeen.push({ t: s.t, separation: length(sub(b, a)) - 2 * R });
        },
    };
    const impact = simulateImpact(contact, setup.balls, world, { probe });
    const law = timesOf(
        impact.timeline[faceKey(setup.striker)] ?? [],
        impact.timeline[ballPairKey(setup.striker, other)] ?? [],
        moved,
    );
    return { law, video: timesOf(videoIntervals(faceSeen), videoIntervals(pairSeen), moved) };
}

function sectionF(): void {
    console.log(
        "== F. The timing (design §7.1): ms from the mallet's first contact; the croqueted ball first moving " +
            `(shifted by ${mm(VISIBLE_SHIFT)} mm), the mallet's first contact ending, ` +
            "the ball–ball interval's end (the ball leaving), any second face interval; " +
            "the model beside Fig. 4's research reading and re-reading " +
            '(reference/sources/README.md:594-619), each ±0.5 frame on Gugan\'s own "a frame or two" ' +
            `(one frame ${ms(VIDEO_FRAME)} ms). The model twice: "law" from the contact law's intervals, "video" as ` +
            `Gugan 4's video would time it, a contact on while the two bodies' surfaces are within ` +
            `${mm(VISIBLE_SHIFT)} mm of touching (the face's separation from the striker's ball, the balls' gap) and ` +
            `the times from the face's first such contact, as scripts/squeeze.ts's freeCollision times a free ` +
            "collision. The impact begins with the face touching, so the video's own first contact, up to " +
            `${mm(VISIBLE_SHIFT)} mm earlier, is not seen: each video time is short by up to ` +
            `${mm(VISIBLE_SHIFT)} mm/U (${ms(VISIBLE_SHIFT / filmed("C3S").malletSpeed)} ms at C3S's U, under one ` +
            "frame). A second face interval counts only if it begins within the strike's window; 'on' marks a " +
            "contact the video still sees at the " +
            "impact's end ==",
    );
    const world = STRIKE_WORLD;
    const frames = (f: number): string => ms(f * VIDEO_FRAME);
    const at = (t: number): string => (t === Infinity ? "on" : ms(t));
    const opt = (t: number | null): string => (t === null ? "none" : at(t));
    const tap = (t: readonly [number, number] | null): string => (t === null ? "none" : `[${at(t[0])}, ${at(t[1])}]`);
    const held = ` (video-timed: face still within ${mm(VISIBLE_SHIFT)} mm as the ball leaves)`;
    for (const name of ["C3S", "C20S", "C1D", "C10S", "C3D", "C10D"]) {
        const stroke = filmed(name);
        const reread = FIG4_TIMING.find((t) => t.name === name);
        const research = RESEARCH_FRAMES[name];
        if (reread === undefined || research === undefined) {
            throw new RangeError(`no Fig. 4 reading of ${name}`);
        }
        const setup = guganSetup(stroke.preset, stroke.malletSpeed, stroke.gap, { world });
        const { law, video } = timingOf(setup, world);
        console.log(
            `${name} (${stroke.preset}, U ${fmt(stroke.malletSpeed)} m/s, gap ${mm(stroke.gap)} mm)` +
                `${law.together ? " FAILS THE CHECK: all three bodies loaded together throughout" : ""}` +
                `${video.together ? held : ""}:`,
        );
        console.log(
            `  first moves: model law ${opt(law.firstMoves)}, video ${opt(video.firstMoves)}, research ` +
                `${frames(research[0])}, re-read ${ms(reread.firstMoves)}`,
        );
        console.log(
            `  first contact ends: model law ${at(law.firstContactEnds)}, video ${at(video.firstContactEnds)}, ` +
                `research ${frames(research[1])}, re-read ${ms(reread.firstContactEnds)}`,
        );
        console.log(
            `  leaves: model law ${opt(law.leaves)}, video ${opt(video.leaves)}, research ${frames(research[2])}, ` +
                `re-read ${ms(reread.leaves)}`,
        );
        console.log(
            `  second face interval: model law ${tap(law.secondTap)}, video ${tap(video.secondTap)}, research ` +
                `[${frames(research[3])}, ` +
                `${frames(research[4])}], re-read ${tap(reread.secondTap)}`,
        );
    }
}

function sectionG(): void {
    console.log(
        "== G. The convergence (design §6): each judged figure at dt/2, dt and 2·dt (dt = " +
            `${fmt(IMPACT_DT * 1e6)} µs), its spread over its tolerance (the means' Gugan sem, the ratios' ` +
            "Gugan 5 tolerance), pass when under a tenth ==",
    );
    const dts = STEP_SHARES.map((k) => k * IMPACT_DT);
    const line = (label: string, values: readonly number[], tolerance: number): void => {
        const spread = spreadOf(values);
        console.log(
            `${label}: ${values.map((v, i) => `${fmt(v)} at ${fmt((dts[i] as number) * 1e6)} µs`).join(", ")}; ` +
                `spread ${fmt(spread)} over tolerance ${fmt(tolerance)} = ${fmt(spread / tolerance)}: ` +
                verdict(spread < tolerance / 10),
        );
    };
    console.log("-- G.1 the filmed strokes' three means, each stroke at its recorded gap --");
    const means = dts.map((dt) => meansOf(filmedStrokeRuns(undefined, { dt }), ALL_STROKES));
    for (const key of MEAN_KEYS) {
        line(
            `mean ${key}`,
            means.map((m) => m[key]),
            GUGAN_MEANS[key].sem,
        );
    }
    console.log("-- G.2 Gugan 5's drive (no push) and stop (jab 0), 3 m/s, Gugan's mallet --");
    for (const gap of [0, 0.001]) {
        for (const [type, tolerance] of [
            ["drive", GUGAN5.drive.tolerance],
            ["stop-ac", GUGAN5.stop.tolerance],
        ] as const) {
            line(
                `${type} ratio at gap ${mm(gap)} mm`,
                dts.map((dt) => guganRatio(type, gap, dt, STRIKE_WORLD)),
                tolerance,
            );
        }
    }
}

/**
 * The candidate section I judges, from a throwaway copy of the worktree whose `src` carries its law (design §4.3):
 * "b" or "e"; absent, the worktree's own engine and candidates a, c and d.
 */
const CANDIDATE = candidateOf(process.env.CANDIDATE);

/** The CANDIDATE environment variable as a candidate's name; throws for anything but b, e or nothing. */
function candidateOf(value: string | undefined): "b" | "e" | undefined {
    if (value !== undefined && value !== "b" && value !== "e") {
        throw new Error(`CANDIDATE must be "b" or "e", or absent for a, c and d (got "${value}")`);
    }
    return value;
}

/** Today's engine beside a candidate's: the worktree's own ratioFit and openLawn, loaded from TODAY_ROOT. */
interface TodayEngine {
    readonly fit: typeof RatioFit;
    readonly lawn: typeof OpenLawn;
}

/**
 * A copy's candidate is judged against today's engine in the same run (tests 1 and 5): with CANDIDATE set, TODAY_ROOT
 * names the worktree, whose scripts (and through them its unchanged src) are loaded beside the copy's own.
 */
async function loadToday(): Promise<TodayEngine | null> {
    if (CANDIDATE === undefined) {
        return null;
    }
    const root = process.env.TODAY_ROOT;
    if (root === undefined) {
        throw new Error("CANDIDATE needs TODAY_ROOT, the worktree's path, for today's engine beside the candidate's");
    }
    const fit = (await import(`${root}/scripts/ratioFit.ts`)) as typeof RatioFit;
    const lawn = (await import(`${root}/scripts/openLawn.ts`)) as typeof OpenLawn;
    return { fit, lawn };
}

const TODAY_ENGINE = await loadToday();

/** The search's tests' step for the free collisions (s), as the harness's own test plays them. */
const FREE_DT = 1e-7;

/** Gugan's ± on Table 1's e (§4: "e = 0.72 ± 0.02"). */
const FREE_RESTITUTION_TOLERANCE = 0.02;

/** The speeds (m/s) at which test 4 judges the video's contact time (design §4.1); 5.54 m/s is printed beside them. */
const JUDGED_FREE_SPEEDS: readonly number[] = [1.9, 7.64];

/**
 * Test 2's gaps (m), design §4.1's 0, 0.25, 0.5, 1 and 2 mm: 2 mm lies outside a croquet stroke's range (gap < 2 mm),
 * so its point is 0.1 mm inside the limit, as section E's shifted gaps keep.
 */
const INSENSITIVE_GAPS: readonly number[] = [0, 0.25e-3, 0.5e-3, 1e-3, CROQUET_GAP_LIMIT - 1e-4];

/** Candidate a's gaps (m): section D's sweep from 0 to 0.5 mm, Table 5's resolution of a separation. */
const HIDDEN_GAPS: readonly number[] = SWEEP_GAPS.filter((g) => g <= 0.5e-3 + 1e-12);

/**
 * Test 5's precisions: the speeds' "precision of measurement of about 3%" (Gugan 4, §9.3); Table 2's face contact
 * "± 0.1 ms" (row 4); and the travel's, twice the speed's, a ball's travel to rest going with its speed squared.
 */
const SPEED_PRECISION = 0.03;
const FACE_PRECISION = 1e-4;
const TRAVEL_PRECISION = 2 * SPEED_PRECISION;

/** The windows (s from the face's first contact) over which candidate c sums the impulses (design §4.2, c). */
const TURF_WINDOWS: readonly number[] = [0.5e-3, 1.5e-3];

/** Each law-changing candidate's constants and their written arguments (design §4.1, test 6). */
const CONSTANTS: Readonly<Record<"b" | "e", string>> = {
    b:
        "faceContactTimeAt scaled by one factor, so that it gives Gugan 4's Table 2 (A2D) face contact of " +
        `${ms(SINGLE_BALL_FACE.contactTime)} ms at ${fmt(SINGLE_BALL_FACE.speed)} m/s: the video's own measurement ` +
        "of the face on the CA's single-ball strokes, the film the filmed strokes come from, where Gugan 2000's drop " +
        "tests used a Jaques ball on unrecorded wood; its speed dependence (q) and the restitution fit are kept. Not " +
        "matched to C3S, C20S or any two-ball stroke",
    e:
        "a Maxwell element for the ball–ball normal force (Maxwell 1867, Phil. Trans. R. Soc. 157, 49-88; Tschoegl, " +
        "The Phenomenological Theory of Linear Viscoelastic Behavior, 1989): a spring k in series with a dashpot of " +
        "relaxation time τ, F' = k·δ' − F/τ, clamped at zero, so that the damping force grows with the closing rate " +
        "and the loss depends on the loading's rate, while every free collision keeps one e whatever its speed. Its " +
        "two constants, k and τ, are fixed against Gugan 4's Table 1 alone: e = 0.72, and the video's contact time " +
        "0.75 ms on the mean of 1.90 and 7.64 m/s. Not matched to C3S, C20S or any two-ball stroke",
};

type SearchTest = CandidateResult["tests"][number];

/** A test's line: its number, verdict and figures. */
function testLine(t: SearchTest): string {
    return `  test ${t.test}: ${verdict(t.pass)}: ${t.text}`;
}

/** `r`'s verdict: pass, or the miss and its first failed test. */
function verdictLine(r: CandidateResult): string {
    const first = r.tests.find((t) => !t.pass);
    return passes(r)
        ? `  ${r.name}: PASSES EVERY TEST (${r.tests.map((t) => t.test).join(", ")}): the plan stops for the user`
        : `  ${r.name}: miss; first failed test ${first === undefined ? "none" : first.test}`;
}

/** `figures`' three judged figures against `stroke`'s row, each within Gugan's sem: their text and whether all pass. */
function againstRow(
    stroke: FilmedStroke,
    figures: ReturnType<typeof figuresOf>,
): { readonly pass: boolean; readonly text: string } {
    const row = rowOf(stroke);
    const parts = MEAN_KEYS.map((key) => {
        const diff = figures[key] - row[key];
        return {
            pass: Math.abs(diff) <= GUGAN_MEANS[key].sem,
            text: `${key} ${fmt(figures[key])} (row ${fmt(row[key])})`,
        };
    });
    return {
        pass: parts.every((p) => p.pass),
        text: parts.map((p) => `${p.text} ${verdict(p.pass)}`).join(", "),
    };
}

/** The search's battery on one engine's filmed strokes (design §4.1, tests 1 and 3) and its test 2 sweep. */
interface Battery {
    readonly runs: ReturnType<typeof filmedStrokeRuns>;
    readonly test1: SearchTest;
    readonly test2: SearchTest;
    readonly test3: SearchTest;
}

/**
 * Tests 1–3 on the engine in hand (design §4.1): 1, C3S and C20S at gap 0 at their own U against their rows within
 * §5.3's uncertainties; 2, v₂/U at C1D's U on the drive preset across INSENSITIVE_GAPS within Table 5's own spread of
 * v₂/U; 3, the gapped strokes' means within Gugan's sem. Each stroke is played as section E plays it.
 */
function batteryOf(world: World): Battery {
    const runs = filmedStrokeRuns(undefined, { world });
    const touching = runs.filter((r) => r.stroke.name === "C3S" || r.stroke.name === "C20S");
    const rows = touching.map((r) => ({ name: r.stroke.name, ...againstRow(r.stroke, r.figures) }));
    const test1: SearchTest = {
        test: 1,
        pass: rows.every((r) => r.pass) && touching.every((r) => !r.read.open),
        text: rows.map((r) => `${r.name} at gap 0: ${r.text}`).join("; "),
    };
    const spread = FILMED_STROKES.map((s) => rowOf(s).v2U);
    const [lo, hi] = [Math.min(...spread), Math.max(...spread)];
    const c1d = filmed("C1D");
    const swept = INSENSITIVE_GAPS.map((gap) => {
        const setup = guganSetup(c1d.preset, c1d.malletSpeed, gap, { world });
        const read = readOut(setup, world);
        return { gap, v2U: read.v2 / read.U, open: read.open };
    });
    const test2: SearchTest = {
        test: 2,
        pass: swept.every((s) => s.v2U >= lo && s.v2U <= hi && !s.open),
        text:
            `v2/U at C1D's U ${fmt(c1d.malletSpeed)} m/s against Table 5's ${fmt(lo)}-${fmt(hi)}: ` +
            swept.map((s) => `${mm(s.gap)} mm ${fmt(s.v2U)}${s.open ? " OPEN" : ""}`).join(", "),
    };
    const gapped = runs.filter((r) => r.stroke.gap > 0);
    const means = meansOf(runs, GAPPED_STROKES);
    const parts = MEAN_KEYS.map((key) => {
        const { value, sem } = GUGAN_MEANS[key];
        return {
            pass: Math.abs(means[key] - value) <= sem,
            text: `${key} ${fmt(means[key])} (${fmt(value)} ± ${fmt(sem)})`,
        };
    });
    const test3: SearchTest = {
        test: 3,
        pass: parts.every((p) => p.pass),
        text:
            `the gapped strokes' means (${gapped.filter((r) => !r.read.open).length} counted): ` +
            parts.map((p) => `${p.text} ${verdict(p.pass)}`).join(", "),
    };
    return { runs, test1, test2, test3 };
}

/**
 * Candidate a's test 1 (design §4.2, a): section D's sweep below 0.5 mm, the AC stop at C3S's and C20S's U with no jab,
 * each gap's figures against the stroke's row; a stroke passes at any gap, the test when both do.
 */
function hiddenGapTest(): SearchTest {
    const strokes = ["C3S", "C20S"].map((name) => {
        const stroke = filmed(name);
        const gaps = HIDDEN_GAPS.map((gap) => {
            const setup = guganSetup("stop-ac", stroke.malletSpeed, gap, { world: STRIKE_WORLD, jab: 0 });
            const { read, figures } = strikeOf(setup, STRIKE_WORLD);
            const judged = againstRow(stroke, figures);
            return { gap, pass: judged.pass && !read.open, text: `${mm(gap)} mm: ${judged.text}` };
        });
        return { name, pass: gaps.some((g) => g.pass), gaps };
    });
    return {
        test: 1,
        pass: strokes.every((s) => s.pass),
        text: strokes
            .map((s) => {
                const hits = s.gaps.filter((g) => g.pass).map((g) => g.text.split(":")[0]);
                const found = hits.length === 0 ? "no gap passes" : `passes at ${hits.join(", ")}`;
                return `${s.name}, ${found}:\n      ${s.gaps.map((g) => g.text).join("\n      ")}`;
            })
            .join("\n    "),
    };
}

/** One impact step as candidates c and d read it: the bed's and the balls' loads, and the striker's ball's state. */
interface TraceStep {
    readonly t: number;
    readonly bed: { readonly normal: number; readonly force: Vec3 } | null;
    readonly pair: ContactSample | null;
    readonly striker: BallState;
}

/** `setup`'s impact on `world`, every step traced (TraceStep), with the face's first contact's start and the aim. */
function traceOf(
    setup: ShotSetup,
    world: World,
): { readonly steps: readonly TraceStep[]; readonly start: number; readonly aim: Vec3 } {
    const contact = planStroke(setup, world).contact;
    const drive = contact.drive;
    const croqueted = setup.croqueted;
    if (drive.kind !== "track" || croqueted === undefined) {
        throw new RangeError(`traceOf: the ${setup.stroke.type} stroke needs a tracked drive and a croqueted ball`);
    }
    const ids = BALL_IDS.filter((id) => setup.balls[id] !== undefined);
    const striker = ids.indexOf(setup.striker);
    const bedKey = `turf/${croqueted}`;
    const pairKey = ballPairKey(setup.striker, croqueted);
    const steps: TraceStep[] = [];
    const probe: ImpactProbe = {
        step(s) {
            const bed = s.contacts.find((c) => c.key === bedKey);
            steps.push({
                t: s.t,
                bed:
                    bed === undefined
                        ? null
                        : {
                              normal: bed.normalForce,
                              force: add(scale(bed.normal, bed.normalForce), bed.tangentialForce),
                          },
                pair: s.contacts.find((c) => c.key === pairKey) ?? null,
                striker: s.balls[striker] as BallState,
            });
        },
    };
    const impact = simulateImpact(contact, setup.balls, world, { probe });
    const first = (impact.timeline[faceKey(setup.striker)] ?? [])[0];
    if (first === undefined) {
        throw new RangeError(`traceOf: the face never touched the ${setup.striker} ball`);
    }
    return { steps, start: first.start, aim: drive.arc.aim };
}

/** The strokes candidates c and d read (design §4.2): C3S, C20S and the canonical drive, each at gap 0. */
function touchingStrokes(): readonly { readonly label: string; readonly setup: ShotSetup }[] {
    const c3s = filmed("C3S");
    const c20s = filmed("C20S");
    return [
        { label: `C3S (stop-ac, U ${fmt(c3s.malletSpeed)} m/s)`, setup: guganSetup("stop-ac", c3s.malletSpeed, 0) },
        { label: `C20S (stop-ac, U ${fmt(c20s.malletSpeed)} m/s)`, setup: guganSetup("stop-ac", c20s.malletSpeed, 0) },
        {
            label: `the canonical drive (${fmt(GUGAN5.speed)} m/s, guideEffort 0)`,
            setup: guganSetup("drive", GUGAN5.speed, 0, { guideEffort: 0 }),
        },
    ];
}

/**
 * Candidate c's figures (design §4.2, c): over each TURF_WINDOWS window from the face's first contact, the bed's normal
 * impulse on the croqueted ball beside its weight's, the bed's whole impulse along aim, and the ball–ball pair's normal
 * impulse and its impulse along aim on the croqueted ball, in mN·s.
 */
function turfText(trace: ReturnType<typeof traceOf>, world: World): string[] {
    const dt = IMPACT_DT;
    const milli = (x: number): string => fmt(x * 1e3);
    return TURF_WINDOWS.map((w) => {
        const within = trace.steps.filter((s) => s.t > trace.start && s.t <= trace.start + w);
        const bedNormal = within.reduce((sum, s) => sum + (s.bed === null ? 0 : s.bed.normal * dt), 0);
        const bedAim = within.reduce((sum, s) => sum + (s.bed === null ? 0 : dot(s.bed.force, trace.aim) * dt), 0);
        const pairNormal = within.reduce((sum, s) => sum + (s.pair === null ? 0 : s.pair.normalForce * dt), 0);
        const pairAim = within.reduce((sum, s) => {
            if (s.pair === null) {
                return sum;
            }
            const force = add(scale(s.pair.normal, s.pair.normalForce), s.pair.tangentialForce);
            return sum + Math.abs(dot(force, trace.aim)) * dt;
        }, 0);
        const weight = world.ball.mass * world.gravity * w;
        return (
            `0-${ms(w)} ms: bed normal ${milli(bedNormal)} mN·s (the weight's ${milli(weight)}), bed along aim ` +
            `${milli(bedAim)} mN·s; ball–ball normal ${milli(pairNormal)} mN·s, along aim ${milli(pairAim)} mN·s; ` +
            `|bed along aim| over ball–ball along aim ${fmt(Math.abs(bedAim) / pairAim)}`
        );
    });
}

/**
 * Candidate d's figures (design §4.2, d): at the ball–ball interval's first step and at its peak normal force within
 * the strike window, the pair's normal's angle to aim and its components along aim, side and up, the striker's ball's
 * rise from the face's first contact (mm) and its spin along aim, side and up (rad/s).
 */
function offLineText(trace: ReturnType<typeof traceOf>): string[] {
    const aim = trace.aim;
    const up = vec3(0, 0, 1);
    const side = cross(up, aim);
    const before = trace.steps.filter((s) => s.t <= trace.start);
    const base = (before[before.length - 1] ?? trace.steps[0]) as TraceStep;
    const loaded = trace.steps.flatMap((s) =>
        s.pair !== null && s.pair.normalForce > 0 && s.t <= trace.start + STRIKE_WINDOW
            ? [{ step: s, pair: s.pair }]
            : [],
    );
    const first = loaded[0];
    if (first === undefined) {
        return ["the balls' pair never carried a force within the strike window"];
    }
    const peak = loaded.reduce((a, b) => (b.pair.normalForce > a.pair.normalForce ? b : a));
    const parts = (v: Vec3): string => `(${fmt(dot(v, aim))}, ${fmt(dot(v, side))}, ${fmt(dot(v, up))})`;
    return [
        { label: "the interval's start", at: first },
        { label: "the peak force", at: peak },
    ].map(({ label, at: { step, pair } }) => {
        const angle = (Math.acos(Math.min(1, Math.abs(dot(pair.normal, aim)))) * 180) / Math.PI;
        return (
            `${label} (${ms(step.t - trace.start)} ms, ${fmt(pair.normalForce)} N): normal ${fmt(angle)}° off aim, ` +
            `(aim, side, up) ${parts(pair.normal)}; the striker's ball risen ` +
            `${mm(step.striker.position.z - base.striker.position.z)} mm, spin (aim, side, up) ` +
            `${parts(step.striker.angularVelocity)} rad/s`
        );
    });
}

/**
 * Test 4 (design §4.1) on `law`: Table 1's free collisions (freeCollision at FREE_DT), e within ± 0.02 of Gugan's and
 * the video's contact time within a frame of 0.75 ms at JUDGED_FREE_SPEEDS; the other speeds printed beside them.
 */
function freeTest(law: PairLaw): SearchTest {
    const rows = FREE_COLLISIONS.map((c) => {
        const r = freeCollision(c.speed, law, { dt: FREE_DT });
        const judged = JUDGED_FREE_SPEEDS.includes(c.speed);
        const eOk = Math.abs(r.restitution - c.restitution) <= FREE_RESTITUTION_TOLERANCE;
        const tOk = Math.abs(r.videoTime - c.contactTime) <= VIDEO_FRAME;
        return {
            pass: !judged || (eOk && tOk),
            text:
                `${fmt(c.speed)} m/s${judged ? "" : " (beside)"}: e ${fmt(r.restitution)} (${fmt(c.restitution)}) ` +
                `${verdict(eOk)}, video ${ms(r.videoTime)} ms (${ms(c.contactTime)}) ${verdict(tOk)}, the law's own ` +
                `${ms(r.contactTime)} ms`,
        };
    });
    return { test: 4, pass: rows.every((r) => r.pass), text: rows.map((r) => r.text).join("; ") };
}

/** The ball–ball law the engine itself builds on `world` (prepareImpact), as a croquet stroke meets it. */
function engineBallBall(world: World): PairLaw {
    const setup = canonicalSetup("drive", { world });
    return prepareImpact(planStroke(setup, world).contact, setup.balls, world).ballBall;
}

/** The single-ball figures test 5 judges (design §4.1): section A's two shares, and Table 2's face contact. */
interface SingleBallFigures {
    readonly strokes: readonly { readonly name: string; readonly release: number; readonly travel: number }[];
    readonly face: number;
}

/**
 * `engine`'s single-ball figures on the open lawn, as section A plays them: per CA drive, the ball's speed at the
 * face's release planned at the CA's mallet speed (the strike's share) and its travel to rest planned at
 * releaseSpeedFor(the CA's ball speed) (the lawn's share); and the face's first contact's length planned at Table 2's
 * A2D U.
 */
function singleBallOf(engine: TodayEngine): SingleBallFigures {
    const { fit, lawn } = engine;
    const world = fit.fitWorld(fit.TODAY, lawn.openWorld());
    const single = (speed: number): ShotSetup => lawn.opened(fit.fitSetup("single-ball", fit.TODAY, speed, world));
    const strokes = fit.CA_STROKES.map((ca) => {
        const release = length(fit.runFit(single(ca.malletSpeed), fit.TODAY, world).release.velocity);
        const rolled = single(fit.releaseSpeedFor(ca.ballSpeed));
        const travel = fit.travelOf(rolled, fit.runFit(rolled, fit.TODAY, world).motion, rolled.striker);
        return { name: ca.name, release, travel };
    });
    const struck = single(SINGLE_BALL_FACE.speed);
    const first = (fit.runFit(struck, fit.TODAY, world).impact.timeline[faceKey(struck.striker)] ?? [])[0];
    if (first === undefined) {
        throw new RangeError("singleBallOf: the face never touched the single-ball stroke's ball");
    }
    return { strokes, face: first.end - first.start };
}

/**
 * Test 5 (design §4.1): each single-ball figure unchanged from today's within its measurement's precision, or moved
 * closer to the measurement than today's: the CA's ball speeds (SPEED_PRECISION), travels (TRAVEL_PRECISION) and
 * Table 2's face contact (FACE_PRECISION).
 */
function singleBallTest(candidate: SingleBallFigures, today: SingleBallFigures): SearchTest {
    const judge = (c: number, t: number, measured: number, precision: number): boolean =>
        Math.abs(c - t) <= precision || Math.abs(c - measured) < Math.abs(t - measured);
    const rows = CA_STROKES.map((ca, i) => {
        const c = candidate.strokes[i] as SingleBallFigures["strokes"][number];
        const t = today.strokes[i] as SingleBallFigures["strokes"][number];
        const speedOk = judge(c.release, t.release, ca.ballSpeed, SPEED_PRECISION * ca.ballSpeed);
        const travelOk = judge(c.travel, t.travel, ca.travel, TRAVEL_PRECISION * ca.travel);
        return {
            pass: speedOk && travelOk,
            text:
                `${ca.name} release ${fmt(c.release)} m/s (today ${fmt(t.release)}, the CA's ${fmt(ca.ballSpeed)}) ` +
                `${verdict(speedOk)}, travel ${fmt(c.travel)} m (today ${fmt(t.travel)}, the CA's ${fmt(ca.travel)}) ` +
                verdict(travelOk),
        };
    });
    const faceOk = judge(candidate.face, today.face, SINGLE_BALL_FACE.contactTime, FACE_PRECISION);
    rows.push({
        pass: faceOk,
        text:
            `Table 2's face contact at ${fmt(SINGLE_BALL_FACE.speed)} m/s ${ms(candidate.face)} ms (today ` +
            `${ms(today.face)}, the video's ${ms(SINGLE_BALL_FACE.contactTime)} ± ${ms(FACE_PRECISION)}) ` +
            verdict(faceOk),
    });
    return { test: 5, pass: rows.every((r) => r.pass), text: rows.map((r) => r.text).join("; ") };
}

/** C3S's and C20S's figures at gap 0 on `fit`'s engine, as section E plays them, for the squeeze's direction. */
function touchingFigures(fit: typeof RatioFit): readonly ReturnType<typeof figuresOf>[] {
    const world = defaultWorld();
    return ["C3S", "C20S"].map((name) => {
        const stroke = filmed(name);
        const setup = fit.guganSetup(stroke.preset, stroke.malletSpeed, 0, { world });
        return fit.figuresOf(fit.readOut(setup, world), fit.effectiveMassOf(setup, world) / world.ball.mass);
    });
}

/** The verdicts and lines of a candidate's block. */
function report(r: CandidateResult): void {
    for (const t of r.tests) {
        console.log(testLine(t));
    }
    console.log(verdictLine(r));
}

/** Candidates a, c and d on the worktree's engine (design §4.3): tests 1–3, with c's and d's figures. */
function searchToday(): readonly CandidateResult[] {
    const world = defaultWorld();
    console.log(
        `-- I.0 the harness on today's ball–ball law (prepareImpact's; dt ${fmt(FREE_DT * 1e6)} µs, the video's ` +
            `threshold ${mm(VISIBLE_SHIFT)} mm, a frame ${ms(VIDEO_FRAME)} ms) --`,
    );
    console.log(testLine(freeTest(engineBallBall(world))));
    const battery = batteryOf(world);
    console.log("-- I.a resolution of \"touching\": a gap hidden in Table 5's 0 (0-0.5 mm, section D's sweep) --");
    const a: CandidateResult = { name: "a", tests: [hiddenGapTest(), battery.test2, battery.test3] };
    report(a);
    const traces = touchingStrokes().map(({ label, setup }) => ({ label, trace: traceOf(setup, world) }));
    console.log("-- I.c the turf under the balls: impulses on the croqueted ball from the face's first contact --");
    for (const { label, trace } of traces) {
        console.log(`  ${label}:`);
        for (const text of turfText(trace, world)) {
            console.log(`    ${text}`);
        }
    }
    const c: CandidateResult = { name: "c", tests: [battery.test1, battery.test2, battery.test3] };
    report(c);
    console.log(
        "-- I.d off-line contact: the balls' normal and the striker's ball (ms from the face's first contact) --",
    );
    for (const { label, trace } of traces) {
        console.log(`  ${label}:`);
        for (const text of offLineText(trace)) {
            console.log(`    ${text}`);
        }
    }
    const d: CandidateResult = { name: "d", tests: [battery.test1, battery.test2, battery.test3] };
    report(d);
    return [a, c, d];
}

/**
 * A law-changing candidate (b or e) on this copy's engine (design §4.3): tests 1–6, test 5 and the squeeze's direction
 * against today's engine (TODAY_ENGINE) in the same run.
 */
function searchCandidate(name: "b" | "e", today: TodayEngine): CandidateResult {
    const world = defaultWorld();
    const battery = batteryOf(world);
    const own: TodayEngine = { fit: RatioFit, lawn: OpenLawn };
    const result: CandidateResult = {
        name,
        tests: [
            battery.test1,
            battery.test2,
            battery.test3,
            freeTest(engineBallBall(world)),
            singleBallTest(singleBallOf(own), singleBallOf(today)),
            { test: 6, pass: true, text: CONSTANTS[name] },
        ],
    };
    report(result);
    const before = touchingFigures(today.fit);
    const after = touchingFigures(RatioFit);
    console.log("  the squeeze's direction, C3S and C20S at gap 0 (candidate, then the change from today's):");
    ["C3S", "C20S"].forEach((label, i) => {
        const [c, t] = [after[i], before[i]] as [ReturnType<typeof figuresOf>, ReturnType<typeof figuresOf>];
        console.log(
            `    ${label}: ${MEAN_KEYS.map((key) => `${key} ${fmt(c[key])} (${fmt(c[key] - t[key])})`).join(", ")}`,
        );
    });
    return result;
}

function sectionI(): void {
    console.log(
        "== I. The search (design §4): what keeps truly touching balls apart. Each candidate's tests of §4.1 with " +
            "their figures: 1, C3S and C20S at gap 0 within §5.3's uncertainties of their rows; 2, v2/U across " +
            "the gap within Table 5's spread; 3, the gapped strokes' means within Gugan's sem; for a law change " +
            "also 4, Table 1's free collisions as the video times them; 5, the single-ball strokes unchanged " +
            "within their measurement; 6, every constant sourced or argued" +
            (CANDIDATE === undefined
                ? "; candidates a, c and d on the worktree's engine =="
                : `; candidate ${CANDIDATE} on this copy's engine ==`),
    );
    const results =
        CANDIDATE === undefined || TODAY_ENGINE === null ? searchToday() : [searchCandidate(CANDIDATE, TODAY_ENGINE)];
    const passing = results.filter(passes);
    console.log(
        passing.length === 0
            ? `-- I summary: no candidate passes (${results.map((r) => r.name).join(", ")}) --`
            : `-- I summary: ${passing.map((r) => r.name).join(", ")} PASSES EVERY TEST: stop for the user --`,
    );
}

/** The gaps (m) of design §7.2: 0, 0.25, 0.5, 1.0, 1.5 and 1.9 mm. */
const GUGAN_GAPS = [0, 0.25, 0.5, 1, 1.5, 1.9].map((g) => g * 1e-3);

/** The AC stop's jab depths (m) of design §7.2, as the jab test sweeps them: 0 to 8 mm in 0.5 mm steps. */
const JAB_DEPTHS = Array.from({ length: 17 }, (_, k) => k * 0.0005);

/**
 * The world as played (the ball–ball restitution from the CA's video) and a variant with Gugan 5's Dawson
 * Internationals' restitution, for the checks to repeat on. The variant is never adopted.
 */
const BALL_WORLDS: readonly { readonly label: string; readonly world: World }[] = [
    {
        label: `ball–ball restitution ${fmt(STRIKE_WORLD.ballBall.restitution)} (the model's, from the CA's video)`,
        world: STRIKE_WORLD,
    },
    {
        label: `ball–ball restitution ${fmt(GUGAN5.ballRestitution)} (Gugan 5's, the maker's bounce test; a variant)`,
        world: { ...STRIKE_WORLD, ballBall: { ...STRIKE_WORLD.ballBall, restitution: GUGAN5.ballRestitution } },
    },
];

/** Design §7.2's stroke at `gap` (m) and `jab` (m, the stop's): guganSetup's, with the mallet solved once per world. */
function guganPlayed(type: "drive" | "stop-ac", gap: number, jab: number, world: World): ShotSetup {
    const setup = canonicalSetup(type, {
        world,
        croquetGap: gap,
        mallet: gugansMallet(type, GUGAN5.speed, world),
        stroke: type === "drive" ? { guideEffort: 0 } : { jab },
    });
    return { ...setup, stroke: { ...setup.stroke, ...strokeFor(setup, GUGAN5.speed, world) } };
}

/** One of design §7.2's runs: its distance ratio and squared speed ratio, or the error it threw. */
interface GuganRun {
    readonly ratio: number | null;
    readonly squared: number | null;
    readonly open: boolean;
    readonly error: string | null;
}

const GUGAN_RUNS = new WeakMap<World, Map<string, GuganRun>>();

/** Design §7.2's run of `type` at `gap` and `jab`, played on `world` and kept. */
function guganRun(type: "drive" | "stop-ac", gap: number, jab: number, world: World): GuganRun {
    const cache = GUGAN_RUNS.get(world) ?? new Map<string, GuganRun>();
    GUGAN_RUNS.set(world, cache);
    const key = `${type}/${gap}/${jab}`;
    const cached = cache.get(key);
    if (cached !== undefined) {
        return cached;
    }
    let run: GuganRun;
    try {
        const { read, figures, distance } = strikeOf(guganPlayed(type, gap, jab, world), world);
        run = { ratio: distance, squared: figures.v2w1 ** 2, open: read.open, error: null };
    } catch (error) {
        run = { ratio: null, squared: null, open: false, error: errorText(error) };
    }
    cache.set(key, run);
    return run;
}

/** A run's ratio, starred when within `tolerance` of `target`; the error or OPEN where there is one. */
function ratioCell(run: GuganRun, target: number, tolerance: number): string {
    if (run.ratio === null) {
        return `${run.error}`;
    }
    const within = Math.abs(run.ratio - target) <= tolerance;
    return `${fmt(run.ratio)}${within ? "*" : ""}${run.open ? " OPEN" : ""}`;
}

/**
 * Whether `target` ± `tolerance` is reached by `ratios` at `gaps` (m): the tabulated gaps within it, the gaps between
 * tabulated ones where the line through two neighbours crosses `target` (interpolated, not run), else the closest.
 */
function reachText(
    gaps: readonly number[],
    ratios: readonly (number | null)[],
    target: number,
    tolerance: number,
): string {
    const hits = gaps.filter((_, i) => {
        const r = ratios[i];
        return r !== null && r !== undefined && Math.abs(r - target) <= tolerance;
    });
    const crossings: string[] = [];
    for (let i = 0; i + 1 < gaps.length; i++) {
        const a = ratios[i];
        const b = ratios[i + 1];
        if (a !== null && a !== undefined && b !== null && b !== undefined && (a - target) * (b - target) < 0) {
            const g = (gaps[i] as number) + ((target - a) / (b - a)) * ((gaps[i + 1] as number) - (gaps[i] as number));
            crossings.push(`${mm(g)}`);
        }
    }
    if (hits.length > 0) {
        return `reachable: within ±${fmt(tolerance)} at gap ${hits.map(mm).join(", ")} mm`;
    }
    const errors = ratios.map((r, i) => ({
        gap: gaps[i] as number,
        error: r === null ? Infinity : Math.abs(r - target),
    }));
    const closest = errors.reduce((best, e) => (e.error < best.error ? e : best));
    return (
        `not reached at a tabulated gap (closest ${mm(closest.gap)} mm, off by ${fmt(closest.error)})` +
        (crossings.length > 0
            ? `; crosses ${fmt(target)} between tabulated gaps, interpolated near ${crossings.join(", ")} mm`
            : "")
    );
}

function sectionJ(): void {
    console.log(
        "== J. Gugan 5's drive and stop across the gap (design §7.2): 3 m/s, Gugan's mallet (effective mass " +
            `${fmt(GUGAN_EFFECTIVE_MASS)} ball masses), croquet gaps ${GUGAN_GAPS.map(mm).join(", ")} mm; the drive ` +
            `with no push (guideEffort 0) against ${fmt(GUGAN5.drive.ratio)} ± ${fmt(GUGAN5.drive.tolerance)}, the ` +
            `AC stop at each jab depth against ${fmt(GUGAN5.stop.ratio)} ± ${fmt(GUGAN5.stop.tolerance)}; * marks a ` +
            "ratio within its tolerance; each twice, on two ball–ball restitutions (the second a world variant, " +
            "never adopted) ==",
    );
    for (const { label, world } of BALL_WORLDS) {
        console.log(`-- J. ${label} --`);
        const drive = GUGAN_GAPS.map((gap) => guganRun("drive", gap, 0, world));
        console.log("drive, ratio L2/L1 at each gap:");
        GUGAN_GAPS.forEach((gap, i) => {
            console.log(
                `  gap ${mm(gap)} mm: ${ratioCell(drive[i] as GuganRun, GUGAN5.drive.ratio, GUGAN5.drive.tolerance)}`,
            );
        });
        console.log(
            `  drive ${reachText(
                GUGAN_GAPS,
                drive.map((r) => r.ratio),
                GUGAN5.drive.ratio,
                GUGAN5.drive.tolerance,
            )}`,
        );
        console.log("AC stop, ratio L2/L1 at each gap, per jab depth:");
        const reached: string[] = [];
        for (const jab of JAB_DEPTHS) {
            const runs = GUGAN_GAPS.map((gap) => guganRun("stop-ac", gap, jab, world));
            const cells = runs.map(
                (r, i) =>
                    `gap ${mm(GUGAN_GAPS[i] as number)}: ${ratioCell(r, GUGAN5.stop.ratio, GUGAN5.stop.tolerance)}`,
            );
            console.log(`  jab ${mm(jab)} mm: ${cells.join(", ")}`);
            const text = reachText(
                GUGAN_GAPS,
                runs.map((r) => r.ratio),
                GUGAN5.stop.ratio,
                GUGAN5.stop.tolerance,
            );
            if (!text.startsWith("not reached") || text.includes("crosses")) {
                reached.push(`jab ${mm(jab)} mm ${text}`);
            }
        }
        console.log(
            reached.length === 0
                ? "  stop: not reachable at any jab depth within 0 to 2 mm, nor crossed between tabulated gaps"
                : `  stop reach, by jab depth:\n    ${reached.join("\n    ")}`,
        );
    }
}

/** The sample standard deviation of `xs` (n − 1). */
function sdOf(xs: readonly number[]): number {
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    return Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length - 1));
}

/** The least-squares slope of `ys` on `xs`. */
function slopeOfFit(xs: readonly number[], ys: readonly number[]): number {
    const mx = xs.reduce((s, x) => s + x, 0) / xs.length;
    const my = ys.reduce((s, y) => s + y, 0) / ys.length;
    const sxy = xs.reduce((s, x, i) => s + (x - mx) * ((ys[i] as number) - my), 0);
    return sxy / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
}

/** How a model scatter compares with Gugan 5's, as a share of it. */
function scatterVerdict(share: number): string {
    if (share < 0.5) {
        return "accounts for under half of it";
    }
    return share <= 2 ? "reproduces it (within a factor of two)" : "exceeds it by over a factor of two";
}

function sectionK(): void {
    console.log(
        "== K. The scatter (design §7.3): the gap's range (J's gaps) against Gugan 5's scatter, and the film's " +
            "spread across its gaps beside the model's ==",
    );
    const verdicts: string[] = [];
    for (const { label, world } of BALL_WORLDS) {
        console.log(`-- K.1 ${label} --`);
        const drive = GUGAN_GAPS.map((gap) => guganRun("drive", gap, 0, world).ratio);
        const kept = drive.filter((r): r is number => r !== null);
        const sd = sdOf(kept);
        console.log(
            `drive over ${kept.length} gaps: ratios ${kept.map(fmt).join(", ")}; sample standard deviation ` +
                `${fmt(sd)} against Gugan 5's single strokes' ${fmt(GUGAN5.drive.sd)} ` +
                `(${fmt(sd / GUGAN5.drive.sd)} of it: ` +
                `${scatterVerdict(sd / GUGAN5.drive.sd)})`,
        );
        const halves: number[] = [];
        for (const jab of JAB_DEPTHS) {
            const ratios = GUGAN_GAPS.map((gap) => guganRun("stop-ac", gap, jab, world).ratio).filter(
                (r): r is number => r !== null,
            );
            if (ratios.length < 2) {
                console.log(`stop at jab ${mm(jab)} mm: fewer than two ratios`);
                continue;
            }
            const range = spreadOf(ratios);
            halves.push(range / 2);
            console.log(
                `stop at jab ${mm(jab)} mm: range ${fmt(range)}, half-range ${fmt(range / 2)} against Gugan 5's ` +
                    `about ± ${fmt(GUGAN5.stop.spread)} (${fmt(range / 2 / GUGAN5.stop.spread)} of it)`,
            );
        }
        const stopHalf = halves.length === 0 ? null : Math.max(...halves);
        verdicts.push(
            `${label}: drive's standard deviation ${fmt(sd / GUGAN5.drive.sd)} of Gugan 5's ` +
                `(${scatterVerdict(sd / GUGAN5.drive.sd)}); ` +
                (stopHalf === null
                    ? "no stop range"
                    : `stop's largest half-range over the jab depths ${fmt(stopHalf / GUGAN5.stop.spread)} of ` +
                      `Gugan 5's (${scatterVerdict(stopHalf / GUGAN5.stop.spread)})`),
        );
    }
    console.log(
        "-- K.2 the film's spread across its gaps (Table 5, the ten strokes) beside the model's (section E's runs, " +
            "the default mallet, the recorded gaps; strokes whose strike did not close in its window left out) --",
    );
    const counted = filmedStrokeRuns(undefined, { world: STRIKE_WORLD }).filter((r) => !r.read.open);
    const gaps = counted.map((r) => r.gap * 1e3);
    let agree = true;
    for (const key of ["v2U", "v2w1"] as const) {
        const film = counted.map((r) => rowOf(r.stroke)[key]);
        const model = counted.map((r) => r.figures[key]);
        const [filmSpread, modelSpread] = [spreadOf(film), spreadOf(model)];
        const [filmSlope, modelSlope] = [slopeOfFit(gaps, film), slopeOfFit(gaps, model)];
        const share = modelSpread / filmSpread;
        const ok = share >= 0.5 && share <= 2 && filmSlope * modelSlope > 0;
        agree = agree && ok;
        console.log(
            `${key} over ${counted.length} strokes: film spread ${fmt(filmSpread)}, standard deviation ` +
                `${fmt(sdOf(film))}, slope on the gap ${fmt(filmSlope)} per mm; model spread ${fmt(modelSpread)}, ` +
                `standard deviation ${fmt(sdOf(model))}, slope ${fmt(modelSlope)} per mm; model/film spread ` +
                `${fmt(share)}: ${ok ? "agree" : "disagree"}`,
        );
    }
    console.log(
        "-- K.2b transparency only, not the verdict: the same without B2GS, whose model (v2/w1)² of about 37 " +
            "dominates the model's v2/w1 spread (the verdict below stays on all ten strokes) --",
    );
    const rest = counted.filter((r) => r.stroke.name !== "B2GS");
    const restGaps = rest.map((r) => r.gap * 1e3);
    for (const key of ["v2U", "v2w1"] as const) {
        const film = rest.map((r) => rowOf(r.stroke)[key]);
        const model = rest.map((r) => r.figures[key]);
        console.log(
            `${key} over ${rest.length} strokes without B2GS: film spread ${fmt(spreadOf(film))}, standard ` +
                `deviation ${fmt(sdOf(film))}, slope on the gap ${fmt(slopeOfFit(restGaps, film))} per mm; model ` +
                `spread ${fmt(spreadOf(model))}, standard deviation ${fmt(sdOf(model))}, slope ` +
                `${fmt(slopeOfFit(restGaps, model))} per mm`,
        );
    }
    console.log(
        "-- K.3 the criterion and the verdict: the sensitivities agree when, for both v2/U and v2/w1, the model's " +
            "spread across the strokes is within a factor of two of the film's (0.5 to 2 times) and the slopes of " +
            "the figure on the gap share a sign; the hypothesis (the gap's range reproduces Gugan 5's scatter) is " +
            "judged only then, the model's scatter within a factor of two of Gugan 5's counting as reproducing it --",
    );
    if (agree) {
        console.log("sensitivities agree; the hypothesis judged:");
        for (const text of verdicts) {
            console.log(`  ${text}`);
        }
    } else {
        console.log(
            "sensitivities disagree: unable to test the user's hypothesis (the figures above are recorded, not judged)",
        );
    }
}

/** `setup`'s distance ratio: the second (croqueted, else live) ball's travel to rest over the striker's. */
function distanceOf(setup: ShotSetup, motion: ReturnType<typeof simulateFreeMotion>): number | null {
    const other = setup.croqueted ?? setup.live[0];
    if (other === undefined) {
        return null;
    }
    const striker = RatioFit.travelOf(setup, motion, setup.striker);
    return striker > 0 ? RatioFit.travelOf(setup, motion, other) / striker : null;
}

/** The distance ratio's excess over the squared speed ratio, as a percentage; `none` where either is absent. */
function shareText(squared: number | null, distance: number | null): string {
    return squared === null || distance === null ? "none" : `${fmt((distance / squared - 1) * 100)} %`;
}

function sectionL(): void {
    console.log(
        "== L. The landing and slide-to-roll share (design §7.8): the squared speed ratio (v2/w1)² as the balls " +
            "leave beside the distance ratio L2/L1 (the second ball's travel to rest over the striker's), and the " +
            "distance ratio's excess over the squared ratio as the share (distance/squared − 1, in %) ==",
    );
    console.log(
        "-- L.1 each filmed stroke at its recorded gap (the default mallet), against Table 5's rows 16 and 17 --",
    );
    const world = STRIKE_WORLD;
    for (const { stroke, gap, read, figures } of filmedStrokeRuns(undefined, { world })) {
        const setup = guganSetup(stroke.preset, stroke.malletSpeed, gap, { world });
        const distance = distanceOf(setup, simulateFreeMotion(read.impact.handover, world));
        const squared = figures.v2w1 ** 2;
        console.log(
            `${stroke.name}${read.open ? " OPEN" : ""}: model (v2/w1)² ${fmt(squared)}, L2/L1 ` +
                `${distance === null ? "none" : fmt(distance)}, share ${shareText(squared, distance)}; film row 16 ` +
                `${stroke.squaredRatio === null ? "none" : fmt(stroke.squaredRatio)}, row 17 ` +
                `${stroke.distanceRatio === null ? "none" : fmt(stroke.distanceRatio)}, share ` +
                shareText(stroke.squaredRatio, stroke.distanceRatio),
        );
    }
    console.log("-- L.2 design §7.2's drive and stop at 1 mm (Gugan's mallet), beside Gugan 5's distance ratios --");
    for (const { label, world: played } of BALL_WORLDS) {
        console.log(`${label}:`);
        const gap = 1e-3;
        const lines: [string, GuganRun, number][] = [
            ["drive", guganRun("drive", gap, 0, played), GUGAN5.drive.ratio],
            ...JAB_DEPTHS.map((jab): [string, GuganRun, number] => [
                `stop at jab ${mm(jab)} mm`,
                guganRun("stop-ac", gap, jab, played),
                GUGAN5.stop.ratio,
            ]),
        ];
        for (const [name, run, target] of lines) {
            console.log(
                `  ${name}: ` +
                    (run.ratio === null
                        ? `${run.error}`
                        : `(v2/w1)² ${fmt(run.squared as number)}, L2/L1 ${fmt(run.ratio)} ` +
                          `(Gugan 5: ${fmt(target)}), share ${shareText(run.squared, run.ratio)}` +
                          `${run.open ? " OPEN" : ""}`),
            );
        }
    }
}

/** The jab test's band for the second tap's mallet speed over U (tests/engine/turfStrike.test.ts). */
const JAB_BAND = [0.295, 0.463] as const;

/** One face–ball contact of a run: its interval (s) and the head regions that touched during it. */
interface FaceContact {
    readonly start: number;
    readonly end: number;
    readonly regions: readonly string[];
}

/** Every face–ball interval of `impact` for `striker` with the regions overlapping it; if `impact-off-face` rose. */
function facesOf(
    impact: ImpactResult,
    striker: BallId,
): { readonly contacts: readonly FaceContact[]; readonly offFace: boolean } {
    const key = faceKey(striker);
    const regions = Object.entries(impact.headRegions ?? {}).filter(([k]) => k.startsWith(`${key}#`));
    const contacts = (impact.timeline[key] ?? []).map((i) => ({
        start: i.start,
        end: i.end,
        regions: regions
            .filter(([, intervals]) => intervals.some((r) => r.start <= i.end && r.end >= i.start))
            .map(([k]) => k.slice(key.length + 1)),
    }));
    const offFace = impact.events.some((e) => e.kind === "impact-off-face" && e.ball === striker);
    return { contacts, offFace };
}

/** The contacts as text: each interval in ms with its regions. */
function contactsText(contacts: readonly FaceContact[]): string {
    return contacts.length === 0
        ? "no face–ball interval"
        : contacts.map((c) => `[${ms(c.start)}, ${ms(c.end)}] ms ${c.regions.join("+") || "no region"}`).join("; ");
}

/**
 * The preset digest's grid for a preset (scripts of the ratchet, swingProbe's grid): 5 speeds × 5 drives × 3 heights ×
 * 3 sides, each stroke planned at its speed on the preset's canonical setup. A run's setup is built on demand: a speed
 * beyond the stroke's reach throws, which the digest records as a rejected run.
 */
function digestGrid(
    type: "stop-ac",
    world: World,
): readonly { readonly label: string; readonly build: () => ShotSetup }[] {
    const base = canonicalSetup(type, { world });
    const up0 = base.stroke.contact.up;
    const grid: { label: string; build: () => ShotSetup }[] = [];
    for (const speed of [1, 2, 3, 4, 6]) {
        for (const drive of [-1, -0.5, 0, 0.5, 1]) {
            for (const up of [up0 - 0.003, up0, up0 + 0.003]) {
                for (const side of [-0.01, 0, 0.01]) {
                    const stroke = { ...base.stroke, drive, contact: { up, side } };
                    const setup = { ...base, stroke };
                    grid.push({
                        label: `${type} ${speed} m/s drive ${drive} up ${up} side ${side}`,
                        build: () => ({
                            ...setup,
                            stroke: { ...stroke, backswing: backswingFor(setup, speed, world) },
                        }),
                    });
                }
            }
        }
    }
    return grid;
}

function sectionM(): void {
    console.log(
        "== M. The jab, the re-contacts and the effective mass (design §7.5-§7.7): the jab test's sweep at " +
            `DEFAULT_CROQUET_GAP (${mm(DEFAULT_CROQUET_GAP)} mm), the AC stop's face–ball intervals, the drive's ` +
            "effective mass ==",
    );
    const world = STRIKE_WORLD;
    console.log(
        "-- M.1Gugan's jab (tests/engine/turfStrike.test.ts, the AC stop, the default mallet, " +
            `${fmt(GUGAN5.speed)} m/s, the default world): each depth judged as the test judges it; the band is ` +
            `[${fmt(JAB_BAND[0])}, ${fmt(JAB_BAND[1])}]·U, U and the second tap the head's speed along aim at the ` +
            "face region's first " +
            "and second intervals' starts --",
    );
    const fractions: number[] = [];
    for (const jab of JAB_DEPTHS) {
        const base = canonicalSetup("stop-ac", { world, croquetGap: DEFAULT_CROQUET_GAP, stroke: { jab } });
        const setup = { ...base, stroke: { ...base.stroke, backswing: backswingFor(base, GUGAN5.speed, world) } };
        const contact = buildContact(setup, world);
        if (contact.drive.kind !== "track") {
            throw new RangeError("the AC stop's contact has no tracked drive");
        }
        const { aim } = contact.drive.arc;
        const speeds: number[] = [dot(contact.velocity, aim)];
        const probe: ImpactProbe = {
            step: (s) => {
                speeds.push(dot(s.head.velocity, aim));
            },
        };
        const impact = simulateImpact(contact, setup.balls, world, { probe });
        const speed = (t: number): number => speeds[Math.round(t / IMPACT_DT)] as number;
        const face = impact.headRegions?.[`${faceKey(setup.striker)}#face`] ?? [];
        const first = face[0];
        if (first === undefined) {
            console.log(`jab ${mm(jab)} mm: no face-region interval (skipped by the test)`);
            continue;
        }
        const second = face[1];
        const grounds = impact.timeline["head/turf"]?.[0]?.start;
        const qualifies =
            grounds !== undefined && grounds >= first.start && (second === undefined || grounds < second.start);
        const deep = impact.events.some((e) => e.kind === "impact-head-deep");
        const fraction = (second === undefined ? 0 : speed(second.start)) / speed(first.start);
        const counted = qualifies && !deep;
        if (counted) {
            fractions.push(fraction);
        }
        const tap =
            second === undefined ? "none (counts 0)" : `${fmt(speed(second.start))} m/s at ${ms(second.start)} ms`;
        const ground = grounds === undefined ? "never" : `${ms(grounds)} ms`;
        const inBand = fraction >= JAB_BAND[0] && fraction <= JAB_BAND[1];
        console.log(
            `jab ${mm(jab)} mm: ${face.length} face-region interval(s), U ${fmt(speed(first.start))} m/s at ` +
                `${ms(first.start)} ms, second tap ${tap}, head/turf grounds ${ground}, fraction ${fmt(fraction)}; ` +
                `${qualifies ? "qualifies" : "does not qualify"}${deep ? ", impact-head-deep" : ""}: ` +
                `${counted ? `counted, ${verdict(inBand)}` : "not counted"}`,
        );
    }
    const allInBand = fractions.every((f) => f >= JAB_BAND[0] && f <= JAB_BAND[1]);
    const testPasses = fractions.length > 0 && allInBand;
    console.log(
        `jab test: ${fractions.length} counted depth(s)` +
            (fractions.length === 0
                ? ""
                : `, fractions ${fmt(Math.min(...fractions))} to ${fmt(Math.max(...fractions))}`) +
            `; the assertions ${testPasses ? "now PASS (.fails would turn red)" : "still fail (as .fails expects)"}`,
    );
    console.log(
        "-- M.2 the grip-limit control run (the test at :90-109, a single-ball stroke the gap cannot touch): not " +
            "re-run, since no candidate that changes the face law was admitted --",
    );
    console.log(
        "-- M.3 the AC stop's face–ball intervals with their head region: the canonical run, then the preset " +
            "digest's grid (5 speeds × 5 drives × 3 heights × 3 sides, each planned at its speed), the impact alone; " +
            "RE-CONTACT marks a later interval touching only the face region while impact-off-face was never raised, " +
            "which it would not flag --",
    );
    const faceRun = (setup: ShotSetup): ReturnType<typeof facesOf> => {
        const contact = planStroke(setup, world).contact;
        return facesOf(simulateImpact(contact, setup.balls, world), setup.striker);
    };
    const canonical = canonicalSetup("stop-ac", { world });
    const canon = faceRun(canonical);
    console.log(
        `canonical: ${contactsText(canon.contacts)}; impact-off-face ${canon.offFace ? "raised" : "not raised"}`,
    );
    let unflagged = 0;
    let reContacts = 0;
    let rejected = 0;
    const grid = digestGrid("stop-ac", world);
    for (const { label, build } of grid) {
        try {
            const { contacts, offFace } = faceRun(build());
            const later = contacts.slice(1);
            const faceOnly = later.some((c) => c.regions.length > 0 && c.regions.every((r) => r === "face"));
            reContacts += later.length > 0 ? 1 : 0;
            unflagged += faceOnly && !offFace ? 1 : 0;
            console.log(
                `${label}: ${contactsText(contacts)}; impact-off-face ${offFace ? "raised" : "not raised"}` +
                    `${faceOnly && !offFace ? " RE-CONTACT" : ""}`,
            );
        } catch (error) {
            rejected += 1;
            console.log(`${label}: rejected (${errorText(error)})`);
        }
    }
    console.log(
        `grid: ${grid.length} runs, ${rejected} rejected, ${reContacts} with a second face–ball interval, ` +
            `${unflagged} with a face-region re-contact that impact-off-face does not flag`,
    );
    console.log(
        "-- M.4 the drive's effective mass at the face centre along aim (ruling D: 0.9·m ≤ m_eff ≤ M; m the head's " +
            "mass, M the swung body's) against the filmed strokes' 2.30 to 2.41 ball masses (design §5.2) --",
    );
    for (const [label, setup] of [
        [
            "canonical drive, default mallet",
            guganSetup("drive", GUGAN5.speed, DEFAULT_CROQUET_GAP, { world: STRIKE_WORLD }),
        ],
        ["drive with Gugan's mallet", guganPlayed("drive", DEFAULT_CROQUET_GAP, 0, STRIKE_WORLD)],
    ] as const) {
        const m = massOf(setup, STRIKE_WORLD);
        const k = m.effective / STRIKE_WORLD.ball.mass;
        console.log(
            `${label}: ${massText(m)}; ${fmt(k)} ball masses against ${FILMED_MASS_RANGE.map(fmt).join(" to ")}: ` +
                verdict(k >= FILMED_MASS_RANGE[0] && k <= FILMED_MASS_RANGE[1]),
        );
    }
}

/** The filmed strokes' effective mass in ball masses by momentum (design §5.2): 2.30 to 2.41. */
const FILMED_MASS_RANGE = [2.3, 2.41] as const;

const SECTIONS: Readonly<Record<string, () => void>> = {
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
    L: sectionL,
    M: sectionM,
};

/** The sections `all` runs, in order: B, C and H only by name. */
const ALL_SECTIONS: readonly string[] = ["A", "D", "E", "F", "G", "I", "J", "K", "L", "M"];

if (SECTION !== "all" && SECTIONS[SECTION] === undefined) {
    throw new Error(`SECTION must be "all" or one of ${Object.keys(SECTIONS).join(", ")}`);
}
if (SECTION === "all") {
    console.log(`== all: sections ${ALL_SECTIONS.join(", ")}; B, C and H only by name ==`);
}
for (const name of SECTION === "all" ? ALL_SECTIONS : [SECTION]) {
    (SECTIONS[name] as () => void)();
}
