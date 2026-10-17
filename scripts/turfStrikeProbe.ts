/**
 * Turf strike probe (P2b.2b.2b.3 design §7.3, §7.4, §8, §9: recorded; the regimes and the jab check are gated by
 * tests/engine/turfStrike.test.ts). On the default world and profile, reports:
 * - regimes: plan decision 19's candidate grids, with the strike height added (user ruling 2026-10-16), for a light
 *   graze, a weak stroke stopped dead (not gated, user ruling 2026-10-16) and a head biting in, then the rolls for a
 *   follow-through yielding the turf (follow-turf-yield's test; not a regime); each candidate's figures, and the
 *   first that qualifies (FOUND), or NONE;
 * - series: each regime's found run over time, every 1 ms of the impact: the head's speed along aim, its lowest
 *   point, the turf's bearing and resistance along aim, and each hand's force (design §8);
 * - jab: the AC stop at 3 m/s over jab 0–8 mm in 0.5 mm steps (Gugan 5, design §7.3; plan decision 20): U, the second
 *   tap and its ratio, whether the depth qualifies and is a graze, when the head first grounds, its lowest point, and
 *   the events and flags; the check's verdict; then the jab against the hands' check at 3 and 4 m/s: the second tap
 *   with no jab and at the shallowest graze, the hands' peak checking force and the turf's braking impulse;
 * - bounds: the regimes' found setups and the jab sweep's verdict at each end of turfYield's and turfMatStrength's
 *   bounds (design §6.2, §8), the other figures at their defaults;
 * - cost: per canonical setup at 3 m/s (the no-turf baseline), then the found graze and biting, the AC stop's deepest
 *   graze and the roll whose follow-through yields the turf: the impact's and the follow-through's steps, the
 *   head–turf columns visited per grounded step (mean, worst, total) and the run's wall time, split at the
 *   follow-through's first step (design §9; plan decision 21);
 * - power: the found graze's speed at the ball against the same stroke clear of the turf (up 0) and against its own
 *   on entering the turf, and its planned path's speeds, which separate the turf's loss from the earlier start on the
 *   arc (user, 2026-10-16: a graze's cost is the power it loses).
 * Run with `npx --yes tsx scripts/turfStrikeProbe.ts`; environment: SECTION (one of the names above; default all). Not
 * part of the test suite; its output goes into the gate and the roadmap's outcomes.
 */
import { headExtent, headLowestPoint } from "../src/engine/impact/contacts";
import { BED_CELL, columnSpan } from "../src/engine/impact/turfBed";
import {
    IMPACT_DT,
    type FollowSnapshot,
    type FollowThrough,
    type ImpactProbe,
    type ImpactSnapshot,
} from "../src/engine/impact/integrate";
import { simulateStroke } from "../src/engine/impact/simulateImpact";
import { GRIP_LIMIT, headOnPath, prepareTrack } from "../src/engine/impact/track";
import type { ContactState, HeadState, ImpactResult, MalletHead } from "../src/engine/impact/types";
import { ZERO, dot, length, vec3, type Vec3 } from "../src/engine/math/vec3";
import { planStroke } from "../src/engine/swing/buildContact";
import { STROKE_TYPES, type ShotSetup, type StrokeType } from "../src/engine/swing/types";
import type { SurfaceProps, World } from "../src/engine/types";
import { defaultWorld, uniformLawn } from "../src/engine/world";
import { contactReference } from "../src/reference/index";
import { backswingFor, canonicalSetup } from "../tests/engine/support/shot";

// The project has no Node types; this script runs under tsx and reads only its environment.
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

const SECTION = process.env.SECTION ?? "all";
const WORLD = defaultWorld();
const mm = (x: number): string => (x * 1e3).toFixed(3);
const ms = (x: number): string => (x * 1e3).toFixed(2);

/** The default world with its lawn's surface changed by `over` (design §6.3: the seam P3's lawns will vary). */
function lawnWith(over: Partial<SurfaceProps>): World {
    const surface = WORLD.lawn.surfaceAt(vec3(0, 0, 0));
    return { ...WORLD, lawn: uniformLawn(WORLD.lawn.width, WORLD.lawn.length, { ...surface, ...over }) };
}

/**
 * One impact step as the probe keeps it: the head after it, the hands' forces (both, and each) and the turf's during
 * it, and the head's turf columns over the head after it (plan decision 21: the law's own count, within a cell's
 * row of the head before the step).
 */
interface Step {
    readonly t: number;
    readonly head: HeadState;
    readonly hand: Vec3;
    readonly top: Vec3;
    readonly bottom: Vec3;
    readonly turf: Vec3;
    readonly columns: number;
}

/** The columns the head–turf law visits with the head at `s` (plan decision 21): none while it is above the plane. */
function columnsUnder(s: HeadState, head: MalletHead): number {
    if (!(headLowestPoint(s, head) < 0)) {
        return 0;
    }
    const extent = headExtent(s, head);
    const [i0, i1] = columnSpan(s.position.x, extent.x, BED_CELL);
    const [j0, j1] = columnSpan(s.position.y, extent.y, BED_CELL);
    return (i1 - i0 + 1) * (j1 - j0 + 1);
}

/**
 * One stroke: its setup, impact, follow-through and steps, the head at t = 0, the mallet head and the aim; the
 * contact state; the columns under the head after each follow-through step; and the wall time (ms) of the impact and
 * of the follow-through, split at the follow-through's first step (the probe's own work included).
 */
interface Run {
    readonly label: string;
    readonly impact: ImpactResult;
    readonly follow: FollowThrough;
    readonly steps: readonly Step[];
    readonly start: HeadState;
    readonly head: MalletHead;
    readonly aim: Vec3;
    readonly contact: ContactState;
    readonly follows: readonly number[];
    readonly wall: { readonly impact: number; readonly follow: number };
}

function run(label: string, setup: ShotSetup, world: World = WORLD): Run {
    const plan = planStroke(setup, world);
    const steps: Step[] = [];
    const follows: number[] = [];
    let handover: number | undefined;
    const probe: ImpactProbe = {
        follow(s: FollowSnapshot): void {
            handover = handover ?? performance.now();
            follows.push(columnsUnder(s.head, plan.contact.head));
        },
        step(s: ImpactSnapshot): void {
            steps.push({
                t: s.t,
                head: s.head,
                hand: s.hand?.force ?? ZERO,
                top: s.hand?.top ?? ZERO,
                bottom: s.hand?.bottom ?? ZERO,
                turf: s.headTurf ?? ZERO,
                columns: s.headTurf === undefined ? 0 : columnsUnder(s.head, plan.contact.head),
            });
        },
    };
    const begin = performance.now();
    const { result, follow } = simulateStroke(plan.contact, setup.balls, world, { probe });
    const end = performance.now();
    const split = handover ?? end;
    const drive = plan.contact.drive;
    const aim = drive.kind === "track" ? drive.arc.aim : vec3(1, 0, 0);
    return {
        label,
        impact: result,
        follow,
        steps,
        start: plan.contact,
        head: plan.contact.head,
        aim,
        contact: plan.contact,
        follows,
        wall: { impact: split - begin, follow: end - split },
    };
}

/** A preset's canonical setup at `speed` (m/s), its stroke changed by `stroke`. */
function shot(type: StrokeType, speed: number, stroke: Partial<ShotSetup["stroke"]> = {}): ShotSetup {
    const base = canonicalSetup(type, { world: WORLD, stroke });
    return { ...base, stroke: { ...base.stroke, backswing: backswingFor(base, speed, WORLD) } };
}

/** The head at time t (an interval's start): after the step that ends there, or at t = 0. */
function headAt(r: Run, t: number): HeadState {
    return t === 0 ? r.start : (r.steps.find((s) => s.t === t)?.head ?? r.start);
}

const along = (r: Run, t: number): number => dot(headAt(r, t).velocity, r.aim);
const kinds = (r: Run): readonly string[] => [...r.impact.events.map((e) => e.kind), ...r.follow.flags];
const faceStart = (r: Run): number | undefined => r.impact.timeline["face/blue"]?.[0]?.start;
const turfStart = (r: Run): number | undefined => r.impact.timeline["head/turf"]?.[0]?.start;

function lowest(r: Run): number {
    let low = Infinity;
    for (const s of r.steps) {
        low = Math.min(low, headLowestPoint(s.head, r.head));
    }
    return low;
}

/** A run's figures on one line. */
function figures(r: Run): string {
    const spans = (key: string): string =>
        (r.impact.timeline[key] ?? []).map((i) => `${ms(i.start)}–${ms(i.end)}`).join(", ") || "none";
    const turf = turfStart(r);
    const face = faceStart(r);
    return (
        `head/turf ${spans("head/turf")} ms, peak ${mm(r.impact.peakPenetration["head/turf"] ?? 0)} mm, lowest ` +
        `${mm(lowest(r))} mm; face ${spans("face/blue")} ms; speed along aim at the turf ` +
        `${turf === undefined ? "-" : along(r, turf).toFixed(4)}, at the ball ` +
        `${face === undefined ? "-" : along(r, face).toFixed(4)} m/s; impact ${ms(r.impact.duration)} ms; finish ` +
        `${ms(r.follow.finish)} ms; ${kinds(r).join(",") || "no events"}`
    );
}

/** One candidate of a regime's grid; a grid's also at any other strike height `up` (m). */
interface Candidate {
    readonly label: string;
    readonly setup: () => ShotSetup;
    readonly at?: (up: number) => ShotSetup;
}

/** Runs `candidates` in order on `world`, printing each, and returns the first that `qualifies`, or null. */
function search(
    name: string,
    candidates: readonly Candidate[],
    qualifies: (r: Run) => boolean,
    world: World,
    quiet = false,
): Run | null {
    if (!quiet) {
        console.log(`-- ${name} --`);
    }
    for (const c of candidates) {
        try {
            const r = run(c.label, c.setup(), world);
            if (!quiet) {
                console.log(`${c.label}: ${figures(r)}`);
            }
            if (qualifies(r)) {
                if (!quiet) {
                    console.log(`FOUND ${name}: ${c.label}`);
                }
                return r;
            }
        } catch (error) {
            if (!quiet) {
                console.log(`${c.label}: threw ${(error as Error).message}`);
            }
        }
    }
    if (!quiet) {
        console.log(`NONE ${name}`);
    }
    return null;
}

/**
 * The strike heights the regimes search (m): the ball's centre from the face's centre. Strike lower: up ≥ 0, the ball
 * above the face's centre and so the head lower, from the canonical 0 up to 0.020 (user ruling 2026-10-16, amending
 * plan decision 19: with the dip and jab alone no regime grounds the head).
 */
const UPS: readonly number[] = [0, 0.005, 0.01, 0.015, 0.02];

/**
 * The small jabs (m) every regime searches, so that the hands' own grip limit does not confound them (user ruling
 * 2026-10-16, amending plan decision 19).
 */
const SMALL_JABS: readonly number[] = [0.001, 0.002, 0.003, 0.004, 0.005, 0.006];

/**
 * A grid of `type` at `speed` (m/s) over jabs (m), strike heights `up` (m) and dip timings (s), with `extra` stroke
 * fields. Mildest first, so that the first to qualify is the mildest: the shallowest jab, then the smallest up, then
 * the dips in the order given (user ruling 2026-10-16).
 */
function grid(
    type: StrokeType,
    speed: number,
    dips: readonly number[],
    jabs: readonly number[],
    extra: Partial<ShotSetup["stroke"]> = {},
): Candidate[] {
    return jabs.flatMap((jab) =>
        UPS.flatMap((up) =>
            dips.map((dip) => {
                const at = (u: number): ShotSetup =>
                    shot(type, speed, {
                        ...extra,
                        jab,
                        contact: { up: u, side: 0 },
                        timing: { arc: 0, hands: 0, dip },
                    });
                return {
                    label: `${type} ${speed} m/s up ${up} m dip ${dip} s jab ${mm(jab)} mm`,
                    setup: () => at(up),
                    at,
                };
            }),
        ),
    );
}

/** A grid's name, candidates and test. */
interface Search {
    readonly name: string;
    readonly candidates: Candidate[];
    readonly qualifies: (r: Run) => boolean;
}

/**
 * The first step's time at which the top hand is held at its grip limit, to 1 ppm (the slid hold carries exactly the
 * limit, to rounding), with the head in the turf, or undefined.
 */
function heldInTurf(r: Run): number | undefined {
    const turf = r.impact.timeline["head/turf"] ?? [];
    return r.steps.find(
        (s) => length(s.top) >= GRIP_LIMIT * (1 - 1e-6) && turf.some((i) => i.start <= s.t && s.t <= i.end),
    )?.t;
}

/** Plan decision 19's regimes, in spec §7.4's order. */
const REGIMES: readonly Search[] = [
    {
        // A light graze: the dip grounds the head before the ball, never past HEAD_DEEP_LIMIT, and the ball is struck
        // with the head keeping most of its speed, over half its speed at the turf (plan decision 25). Its cost is the
        // power it loses, so the shot falls short of the one attempted; the lawn's damage is secondary (user ruling
        // 2026-10-16).
        name: "graze",
        candidates: grid("single-ball", 3, [-0.005, -0.01, -0.02, -0.03], SMALL_JABS),
        qualifies: (r) => {
            const face = faceStart(r);
            const turf = turfStart(r);
            const marks = kinds(r);
            return (
                face !== undefined &&
                turf !== undefined &&
                turf < face &&
                !marks.includes("impact-head-deep") &&
                !marks.includes("grip-limit") &&
                along(r, face) > 0.5 * along(r, turf)
            );
        },
    },
    {
        // A weak stroke stopped dead: at about 1 m/s, the dip early, the head rests in the turf before the ball.
        // Searched and printed, not gated (user ruling 2026-10-16): a dig-in is an unintentional gross mis-hit, which
        // the planner rejects by design; the closest on record is up 0.005 m dip −0.12 s jab 5 mm, 0.91 → 0.56 m/s,
        // the face at 262 ms.
        name: "stopped",
        candidates: grid("single-ball", 1, [-0.03, -0.05, -0.08, -0.12], SMALL_JABS, { intensity: 0 }),
        qualifies: (r) => faceStart(r) === undefined && r.impact.events.some((e) => e.kind === "impact-head-stopped"),
    },
    {
        // A head biting in: a hard stroke struck low, the dip early, saturates a hand. The head must meet the turf in
        // the impact, not saturate a hand on the drive alone (user ruling 2026-10-16, amending plan decision 19): the
        // top hand is held at its grip limit at a step within a head/turf interval (user ruling 2026-10-17, "Hand held
        // at limit in turf"). The grip-limit event marks only a hand's first saturation, often before the head
        // grounds, so the hand's force is read instead.
        name: "biting",
        candidates: grid("single-ball", 4, [-0.005, -0.01, -0.02], SMALL_JABS),
        qualifies: (r) => heldInTurf(r) !== undefined,
    },
];

/** A roll whose follow-through yields the turf (follow-turf-yield's test, design §4.6): recorded, not a regime. */
const FOLLOW: Search = {
    name: "follow (not a regime)",
    candidates: (["half-roll", "full-roll", "pass-roll"] as const).flatMap((type) =>
        [2, 3, 4].map((speed) => ({ label: `${type} ${speed} m/s`, setup: () => shot(type, speed) })),
    ),
    qualifies: (r) => r.follow.flags.includes("follow-turf-yield"),
};

/** The three regimes' found runs on `world`, in REGIMES' order (null where none is found). */
function regimes(world: World, quiet: boolean): (Run | null)[] {
    if (!quiet) {
        console.log("== regimes (design §7.4; plan decision 19) ==");
    }
    return REGIMES.map((g) => search(g.name, g.candidates, g.qualifies, world, quiet));
}

/** Each found regime's run over time, every 1 ms of the impact (design §8). */
function series(found: readonly (Run | null)[]): void {
    console.log("== series (design §8): t ms, speed m/s, lowest mm, bearing N, resistance N, top N, bottom N ==");
    REGIMES.forEach((g, k) => {
        const r = found[k];
        if (r === undefined || r === null) {
            console.log(`-- ${g.name}: none found --`);
            return;
        }
        console.log(`-- ${g.name} (${r.label}) --`);
        for (const s of r.steps) {
            if (Math.round(s.t * 1e6) % 1000 !== 0) {
                continue;
            }
            console.log(
                [
                    ms(s.t),
                    dot(s.head.velocity, r.aim).toFixed(4),
                    mm(headLowestPoint(s.head, r.head)),
                    s.turf.z.toFixed(1),
                    dot(s.turf, r.aim).toFixed(1),
                    length(s.top).toFixed(1),
                    length(s.bottom).toFixed(1),
                ].join(" "),
            );
        }
        console.log(`events ${r.impact.events.map((e) => `${e.kind}@${ms(e.t)}`).join(", ")}`);
        const held = heldInTurf(r);
        console.log(
            `top hand held at the grip limit in the turf: ${held === undefined ? "never" : `from ${ms(held)} ms`}`,
        );
    });
}

/** Gugan's figures of one AC stop (design §7.3; plan decision 20), or null with no face interval. */
function gugan(r: Run) {
    const face = r.impact.headRegions?.["face/blue#face"] ?? [];
    const first = face[0];
    if (first === undefined) {
        return null;
    }
    const second = face[1];
    const U = along(r, first.start);
    const tap = second === undefined ? 0 : along(r, second.start);
    const grounds = turfStart(r);
    const qualifies =
        grounds !== undefined && grounds >= first.start && (second === undefined || grounds < second.start);
    const graze = qualifies && !r.impact.events.some((e) => e.kind === "impact-head-deep");
    return { U, tap, ratio: tap / U, qualifies, graze, grounds, first, second };
}

/**
 * The hands' peak checking force and impulse and the turf's braking impulse along aim after the first face interval.
 */
function braking(r: Run) {
    const end = r.impact.timeline["face/blue"]?.[0]?.end ?? 0;
    let peak = 0;
    let hands = 0;
    let turf = 0;
    for (const s of r.steps) {
        if (s.t <= end) {
            continue;
        }
        const check = 0 - dot(s.hand, r.aim);
        peak = Math.max(peak, check);
        hands += check * IMPACT_DT;
        turf -= dot(s.turf, r.aim) * IMPACT_DT;
    }
    return { peak, hands, turf };
}

/** The AC stop's jab sweep at 3 m/s on `world` (design §7.3), its verdict, and the shallowest graze (m), if any. */
function sweep(world: World, quiet: boolean): number | null {
    let shallowest: number | null = null;
    const grazes: number[] = [];
    for (let k = 0; k <= 16; k++) {
        const jab = k * 0.0005;
        const r = run(`jab ${mm(jab)} mm`, shot("stop-ac", 3, { jab }), world);
        const g = gugan(r);
        if (g !== null && g.graze) {
            grazes.push(g.ratio);
            shallowest = shallowest ?? jab;
        }
        if (!quiet) {
            console.log(
                `jab ${mm(jab)} mm: ` +
                    (g === null
                        ? "no face interval"
                        : `U ${g.U.toFixed(4)} m/s, second tap ${g.tap.toFixed(4)} m/s, ratio ${g.ratio.toFixed(4)}, ` +
                          `grounds ${g.grounds === undefined ? "never" : `${ms(g.grounds)} ms`}, ` +
                          `${g.qualifies ? (g.graze ? "graze" : "qualifies, deep") : "does not qualify"}`) +
                    `; lowest ${mm(lowest(r))} mm; ${kinds(r).join(",") || "no events"}`,
            );
        }
    }
    const passes = grazes.length > 0 && grazes.every((x) => x >= 0.295 && x <= 0.463);
    console.log(
        `verdict: ${passes ? "PASS" : "FAIL"}; ${grazes.length} grazes, ratios ` +
            `${grazes.map((x) => x.toFixed(4)).join(", ") || "none"}; Gugan's 0.400 (0.295–0.463)`,
    );
    return shallowest;
}

function jab(): void {
    console.log("== jab: the AC stop at 3 m/s (design §7.3) ==");
    const shallowest = sweep(WORLD, false);
    console.log("== jab against the hands' check (design §7.3, §8) ==");
    for (const speed of [3, 4]) {
        for (const j of shallowest === null ? [0] : [0, shallowest]) {
            try {
                const r = run(`stop-ac ${speed} m/s jab ${mm(j)} mm`, shot("stop-ac", speed, { jab: j }));
                const g = gugan(r);
                const b = braking(r);
                console.log(
                    `${r.label}: second tap ` +
                        `${g === null ? "-" : `${g.tap.toFixed(4)} m/s (${g.ratio.toFixed(4)}U)`}; ` +
                        `hands' peak check ${b.peak.toFixed(1)} N, impulse ${b.hands.toFixed(4)} N·s; turf braking ` +
                        `${b.turf.toFixed(4)} N·s; ${kinds(r).join(",") || "no events"}`,
                );
            } catch (error) {
                console.log(`stop-ac ${speed} m/s jab ${mm(j)} mm: threw ${(error as Error).message}`);
            }
        }
    }
}

function bounds(found: readonly (Run | null)[]): void {
    console.log("== bounds (design §6.2, §8) ==");
    const yieldBounds = contactReference.turfYield.bounds as readonly [number, number];
    const matBounds = contactReference.turfMatStrength.bounds as readonly [number, number];
    const ends: readonly [string, Partial<SurfaceProps>][] = [
        [`turfYield ${yieldBounds[0]} Pa`, { turfYield: yieldBounds[0] }],
        [`turfYield ${yieldBounds[1]} Pa`, { turfYield: yieldBounds[1] }],
        [`turfMatStrength ${matBounds[0]} Pa`, { turfMatStrength: matBounds[0] }],
        [`turfMatStrength ${matBounds[1]} Pa`, { turfMatStrength: matBounds[1] }],
    ];
    for (const [name, over] of ends) {
        const world = lawnWith(over);
        console.log(`-- ${name} --`);
        REGIMES.forEach((g, k) => {
            const at = found[k];
            const c = g.candidates.find((x) => x.label === at?.label);
            if (c === undefined) {
                console.log(`${g.name}: none found on the default lawn`);
                return;
            }
            const r = run(c.label, c.setup(), world);
            console.log(`${g.name} (${c.label}): ${g.qualifies(r) ? "occurs" : "DOES NOT OCCUR"}; ${figures(r)}`);
        });
        sweep(world, true);
    }
}

/** The regime `name`'s found run on the default lawn, searched quietly, or null. */
function foundRun(name: string): Run | null {
    const g = REGIMES.find((x) => x.name === name);
    return g === undefined ? null : search(g.name, g.candidates, g.qualifies, WORLD, true);
}

/** A run's cost on one line (design §9; plan decision 21): steps, grounded steps' columns, wall time. */
function costLine(r: Run): string {
    const stats = (columns: readonly number[], steps: number): string => {
        const grounded = columns.filter((c) => c > 0);
        const total = grounded.reduce((sum, c) => sum + c, 0);
        const worst = grounded.reduce((most, c) => Math.max(most, c), 0);
        const mean = total / Math.max(1, grounded.length);
        return (
            `${steps} steps, ${grounded.length} grounded, columns per grounded step mean ${mean.toFixed(1)} ` +
            `worst ${worst}, total ${total}`
        );
    };
    return (
        `${r.label}: impact ${stats(
            r.steps.map((s) => s.columns),
            r.impact.steps,
        )}; follow-through ${stats(r.follows, r.follows.length)}; wall ${r.wall.impact.toFixed(0)} ms impact, ` +
        `${r.wall.follow.toFixed(0)} ms follow-through; ${kinds(r).join(",") || "no events"}`
    );
}

function cost(): void {
    console.log("== cost (design §9; plan decision 21) ==");
    console.log("-- canonical setups at 3 m/s (the no-turf baseline) --");
    for (const type of STROKE_TYPES) {
        console.log(costLine(run(`${type} 3 m/s`, shot(type, 3))));
    }
    console.log("-- with the head in the turf --");
    for (const name of ["graze", "biting"]) {
        const r = foundRun(name);
        console.log(r === null ? `${name}: none found` : costLine({ ...r, label: `${name} (${r.label})` }));
    }
    console.log(costLine(run("stop-ac 3 m/s jab 4.500 mm (the deepest graze)", shot("stop-ac", 3, { jab: 0.0045 }))));
    console.log(costLine(run("half-roll 4 m/s (follow-turf-yield)", shot("half-roll", 4))));
}

/**
 * The found graze's power loss (user, 2026-10-16): its speed along aim at the ball against the same stroke clear of
 * the turf (up 0), and against its own on entering the turf; then the planned path's speed (the arc undisturbed by
 * the turf) at the impact's first step, at the turf, and at contact, and the clear stroke's path at the same time
 * before contact, which separate the turf's loss from the graze's earlier start on the arc.
 */
function power(): void {
    console.log("== power: the graze's loss (user, 2026-10-16) ==");
    const g = REGIMES.find((x) => x.name === "graze");
    const r = foundRun("graze");
    const c = g?.candidates.find((x) => x.label === r?.label);
    const turf = r === null ? undefined : turfStart(r);
    const face = r === null ? undefined : faceStart(r);
    if (r === null || c?.at === undefined || turf === undefined || face === undefined) {
        console.log("graze: none found");
        return;
    }
    const clear = run(`${c.label} at up 0`, c.at(0));
    const clearFace = faceStart(clear);
    if (clearFace === undefined) {
        console.log(`${clear.label}: no face contact`);
        return;
    }
    const ball = along(r, face);
    const clearBall = along(clear, clearFace);
    const entry = along(r, turf);
    console.log(
        `${r.label}: at the ball ${ball.toFixed(4)} m/s (face ${ms(face)} ms); ${clear.label}: at the ball ` +
            `${clearBall.toFixed(4)} m/s (face ${ms(clearFace)} ms); ratio ${(ball / clearBall).toFixed(4)}; ` +
            `on entering the turf ${entry.toFixed(4)} m/s (${ms(turf)} ms), at the ball ` +
            `${(ball / entry).toFixed(4)} of it`,
    );
    const path = (x: Run) => {
        const drive = x.contact.drive;
        if (drive.kind !== "track") {
            return null;
        }
        const track = prepareTrack(drive, x.head, WORLD.gravity);
        return {
            contactAt: drive.arc.contactAt,
            speed: (t: number): number => dot(headOnPath(track, x.head, t).velocity, x.aim),
        };
    };
    const p = path(r);
    const q = path(clear);
    if (p === null || q === null) {
        console.log("no tracked drive");
        return;
    }
    const first = IMPACT_DT;
    const before = p.contactAt - first;
    console.log(
        `planned path, ${r.label}: contact at ${ms(p.contactAt)} ms; ${p.speed(first).toFixed(4)} m/s at ` +
            `${ms(first)} ms (measured ${along(r, r.steps[0]?.t ?? first).toFixed(4)}), ` +
            `${p.speed(turf).toFixed(4)} at the turf (${ms(turf)} ms), ${p.speed(p.contactAt).toFixed(4)} at ` +
            `contact; the clear stroke's path ${ms(before)} ms before its contact: ` +
            `${q.speed(q.contactAt - before).toFixed(4)} m/s, at its contact (${ms(q.contactAt)} ms) ` +
            `${q.speed(q.contactAt).toFixed(4)} m/s`,
    );
}

if (SECTION === "all" || SECTION === "regimes" || SECTION === "series" || SECTION === "bounds") {
    const found = regimes(WORLD, SECTION === "bounds" || SECTION === "series");
    if (SECTION === "all" || SECTION === "regimes") {
        search(FOLLOW.name, FOLLOW.candidates, FOLLOW.qualifies, WORLD);
    }
    if (SECTION === "all" || SECTION === "series") {
        series(found);
    }
    if (SECTION === "all" || SECTION === "bounds") {
        bounds(found);
    }
}
if (SECTION === "all" || SECTION === "jab") {
    jab();
}
if (SECTION === "all" || SECTION === "cost") {
    cost();
}
if (SECTION === "all" || SECTION === "power") {
    power();
}
