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
 * The fit's sections D-G are not here: the fit moved to a later step (the design's Amendments, 2026-10-20).
 * Run with `npx --yes tsx scripts/croquetFitProbe.ts`; environment: SECTION (A, B, C or H; default all). Not part of
 * the test suite.
 */
import type { FollowSnapshot, ImpactProbe } from "../src/engine/impact/integrate";
import { simulateStroke } from "../src/engine/impact/simulateImpact";
import { effectiveMass, swungBody } from "../src/engine/impact/track";
import type { ContactState, ImpactResult } from "../src/engine/impact/types";
import { length, type Vec3 } from "../src/engine/math/vec3";
import { planStroke } from "../src/engine/swing/buildContact";
import { defaultProfile } from "../src/engine/swing/profile";
import type { ShotSetup } from "../src/engine/swing/types";
import type { BallId, World } from "../src/engine/types";
import { defaultWorld } from "../src/engine/world";
import { ratioTargetsReference, type RatioTargetKey } from "../src/reference/index";
import { backswingFor, canonicalSetup, regimeOf, strokeFor } from "../tests/engine/support/shot";
import { OPEN_LAWN, OPEN_START, haltedText, openWorld, opened } from "./openLawn";
import {
    BOUNDS,
    CA_STROKES,
    TODAY,
    fitSetup,
    fitWorld,
    ratioOf,
    releaseSpeedFor,
    runFit,
    travelOf,
    type Candidate,
    type FitParams,
} from "./ratioFit";

// The project has no Node types; this script runs under tsx and reads its environment.
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

const SECTION = process.env.SECTION ?? "all";
const fmt = (x: number): string => x.toFixed(4);
const runs = (section: string): boolean => SECTION === "all" || SECTION === section;

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
    const { head, orientation } = contact;
    const body = swungBody(head, drive.hands, drive.arc.radius);
    const effective = effectiveMass(body, head, orientation, drive.arc.aim);
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
    const world = fitWorld(TODAY);
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

const SECTIONS: Readonly<Record<string, () => void>> = { A: sectionA, B: sectionB, C: sectionC, H: sectionH };
if (SECTION !== "all" && SECTIONS[SECTION] === undefined) {
    throw new Error(`SECTION must be "all" or one of ${Object.keys(SECTIONS).join(", ")}`);
}
if (SECTION === "all") {
    console.log(
        "== all: sections A, B, C and H; D-G are not run, because the fit moved to a new step (the design's " +
            "Amendments, 2026-10-20) ==",
    );
}
for (const [name, section] of Object.entries(SECTIONS)) {
    if (runs(name)) {
        section();
    }
}
