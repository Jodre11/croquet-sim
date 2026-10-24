/**
 * Follow-through probe (P2b.2b.2c.2d design §3.4, §3.5, §4.3, §6, §7; recorded, not gated): stage 1's evidence for the
 * gate, every stroke played through the harness (scripts/followThrough.ts) as simulateShot plays it, on the default
 * world, at ON_TIME unless marked. Every figure to 4 decimals; speeds in m/s, impulses in N·s, forces in N, and
 * figures in mm, ms and degrees say so. Reports:
 * - A. the follow-through grid (§3.4): every croquet preset at 3 m/s planned (backswingFor), magnitude −1, −0.5, 0,
 *   +0.5 and +1 by window ×0.5, ×1 and ×2 of the preset's (×1 the preset's own pulses; otherwise the shot's window
 *   sets both pulses), each run's routes; per preset and window, whether the ratio is monotonic in the magnitude and
 *   its rate per unit magnitude; per preset, the canonical run's taps' shares' sum.
 * - B. the brake sweep (§4.3): the AC stop at 3 m/s contact speed (strokeForContact), the default gap, jab 0 and
 *   2.5 mm, onset −20 to +5 ms in 2.5 ms steps, magnitude −0.25 to −1, window ×0.5, ×1 and ×2; then the same sweep at
 *   a fixed backswing (the on-time stroke's for 3 m/s planned), its contact speed judged non-increasing as the onset
 *   moves earlier and as the magnitude strengthens (exit criterion 5).
 * - C. the drive's late catch, diagnosed (§6): the canonical drive's bottom hand's force along aim, the head's speed
 *   along aim and the striker's ball's speed every 1 ms from first contact to 120 ms, at its own guideEffort and at 0.
 * - D. the re-contacts' spread (§7): every face gap after the first contact over the 950-run grid and section A's grid,
 *   its separation, duration and side of the parting, each after-parting interval's effect alone; quantiles; and the
 *   count flagged per preset for each set of thresholds (groupReContacts).
 * - S. the stance sweep (§3.5): the AC stop and the drive as Gugan 5's strokes across leans −8° to +4°, at their own
 *   grips and at the other's, each turf-limited lean printed and not played; then the canonical drive across the leans.
 * Every section ends with a line "<letter> tally: ...". `all` runs A, B, C, D and S.
 * Run with `npx --yes tsx scripts/followThroughProbe.ts`; environment: SECTION (a letter or `all`; default all) and
 * B_SMOKE (any value: section B on jab 0, window ×1, magnitude −1 and onsets −20, −10, 0 and +5 ms only, a smoke run).
 * Not part of the test suite.
 */
import { faceKey, HEAD_TURF_KEY } from "../src/engine/impact/contacts";
import { simulateImpact } from "../src/engine/impact/simulateImpact";
import type { ContactInterval, ImpactResult } from "../src/engine/impact/types";
import {
    groupReContacts,
    judgeFaults,
    type FaultReport,
    type ReContact,
    type ReContactThresholds,
} from "../src/engine/faults";
import { strokeContext } from "../src/engine/shot";
import { planStroke, plannedSpeed } from "../src/engine/swing/buildContact";
import { defaultProfile } from "../src/engine/swing/profile";
import { CROQUET_STROKES, type ShotSetup, type StrokeType } from "../src/engine/swing/types";
import { defaultWorld } from "../src/engine/world";
import { ratioTargetsReference } from "../src/reference/index";
import { DEFAULT_CROQUET_GAP, backswingFor, canonicalSetup, regimeOf } from "../tests/engine/support/shot";
import {
    backswingBracket,
    playRoutes,
    strokeForContact,
    turfLimited,
    type RouteRun,
    type RouteSample,
} from "./followThrough";
import { STRIKE_WINDOW, digestGrid, guganSetup } from "./ratioFit";

// The project has no Node types; this script runs under tsx and reads its environment.
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

const SECTION = process.env.SECTION ?? "all";
const WORLD = defaultWorld();

const fmt = (x: number): string => x.toFixed(4);
const ms = (t: number): string => fmt(t * 1e3);
const mm = (x: number): string => fmt(x * 1e3);
const deg = (rad: number): string => fmt((rad * 180) / Math.PI);
const pct = (x: number): string => fmt(x * 100);

/** An error's text, whatever was thrown. */
function errorText(error: unknown): string {
    return error instanceof Error ? `${error.name}: ${error.message}` : `thrown: ${String(error)}`;
}

/** The planned speed (m/s) section A plays every preset at, and section B and S's contact speed. */
const SPEED = 3;

/** Section A's and B's shares of the preset's window. */
const WINDOW_SHARES = [0.5, 1, 2] as const;

/** Section A's magnitudes. */
const MAGNITUDES = [-1, -0.5, 0, 0.5, 1] as const;

/**
 * `setup` with its pulses' window at `share` of the preset's: at 1 the preset's own (no shot window, so carry mode's
 * handWindow stays its own), else the shot's window, which sets both pulses.
 */
function windowed(setup: ShotSetup, share: number): ShotSetup {
    if (share === 1) {
        return setup;
    }
    const window = defaultProfile.drive[setup.stroke.type].window * share;
    return { ...setup, stroke: { ...setup.stroke, window } };
}

/** strokeFor's regimes (regimeOf), which strokeForContact mirrors, by name. */
const REGIMES = { 1: "backswing only", 2: "h₀ with intensity", 3: "intensity 1 with backswing" } as const;

/** `setup`'s stroke inputs: its backswing (m), its intensity (or none) and the regime it landed in. */
function strokeText(setup: ShotSetup): string {
    const { backswing, intensity } = setup.stroke;
    const effort = intensity === undefined ? "no intensity" : `intensity ${fmt(intensity)}`;
    const regime = regimeOf(setup);
    return `backswing ${fmt(backswing)} m, ${effort} (regime ${regime}, ${REGIMES[regime]})`;
}

/** A re-contact as text: its start (ms), after the parting (ms), separation (mm), effect (%, °) and class. */
function reContactText(r: ReContact): string {
    return (
        `[${ms(r.start)}, ${ms(r.end)}] ms (${r.intervals} interval(s), ${ms(r.afterParting)} ms after the parting, ` +
        `separation ${mm(r.separation)} mm, speed ${pct(r.speedChange)} %, direction ${fmt(r.angleChange)}°, ` +
        `${r.fault ? "possible 29.1.6.1 at the placeholders" : "below the thresholds"})`
    );
}

/** A run's three routes as text (design §3.4). */
function routesText(run: RouteRun): string {
    const { touch, taps, recontacts, ratio } = run.routes;
    if (touch === null) {
        return "no strike";
    }
    const tapText = taps.map((t) => `${ms(t.start)} ms ${fmt(t.impulse)} N·s share ${fmt(t.share)}`).join("; ");
    const after = recontacts.length === 0 ? "none" : recontacts.map(reContactText).join("; ");
    return (
        `contact ${fmt(touch.contactSpeed)} m/s (planned ${fmt(touch.plannedSpeed)}), up ${mm(touch.up)} mm, ` +
        `lean ${deg(touch.lean)}° at ${ms(touch.t)} ms; taps ${tapText || "none"}; re-contacts after the parting ` +
        `${after}; ratio ${fmt(ratio)}`
    );
}

/** The least-squares slope of `ys` on `xs`. */
function slopeOf(xs: readonly number[], ys: readonly number[]): number {
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
        num += ((xs[i] as number) - mx) * ((ys[i] as number) - my);
        den += ((xs[i] as number) - mx) ** 2;
    }
    return num / den;
}

/** Whether `ys` never falls, or never rises, along their order. */
function monotonic(ys: readonly number[]): boolean {
    const steps = ys.slice(1).map((y, i) => y - (ys[i] as number));
    return steps.every((d) => d >= 0) || steps.every((d) => d <= 0);
}

/** One played or rejected run of a grid. */
type Played = { readonly label: string; readonly run: RouteRun } | { readonly label: string; readonly error: string };

/** `build`'s setup played for its routes, or the error that rejected it. */
function play(label: string, build: () => ShotSetup): Played {
    try {
        return { label, run: playRoutes(build(), WORLD) };
    } catch (error) {
        return { label, error: errorText(error) };
    }
}

/** Section A's runs, kept for section D: per preset, its window share and magnitude with the run. */
interface GridRun {
    readonly type: StrokeType;
    readonly share: number;
    readonly magnitude: number;
    readonly played: Played;
}

let gridRuns: readonly GridRun[] | null = null;

/** Section A's grid, played once per invocation. */
function followGrid(): readonly GridRun[] {
    if (gridRuns !== null) {
        return gridRuns;
    }
    const runs: GridRun[] = [];
    for (const type of CROQUET_STROKES) {
        for (const share of WINDOW_SHARES) {
            for (const magnitude of MAGNITUDES) {
                const label = `${type} magnitude ${magnitude} window ×${share}`;
                const played = play(label, () => {
                    const base = windowed(canonicalSetup(type, { world: WORLD, stroke: { drive: magnitude } }), share);
                    return { ...base, stroke: { ...base.stroke, backswing: backswingFor(base, SPEED, WORLD) } };
                });
                runs.push({ type, share, magnitude, played });
            }
        }
    }
    gridRuns = runs;
    return runs;
}

function sectionA(): void {
    console.log(
        "== A. The follow-through grid (P2b.2b.2c.2d design §3.4): every croquet preset's canonical setup on the " +
            `default world at ${fmt(SPEED)} m/s planned (backswingFor), ON_TIME, the default gap, magnitude ` +
            `(stroke.drive) ${MAGNITUDES.join(", ")} by window ×${WINDOW_SHARES.join(", ×")} of the preset's ` +
            "(×1 the preset's own pulses, otherwise the shot's window for both); per run its routes: the contact " +
            "and planned speeds (m/s), up (mm) and lean (°) at first touch, each tap's start (ms), impulse along aim " +
            "(N·s) and share of m_ball·w₁ (w₁ as Gugan read it), each re-contact after the parting with its class " +
            "and effect, and the ratio ==",
    );
    const runs = followGrid();
    let rejected = 0;
    let unstruck = 0;
    let rows = 0;
    let monotonicRows = 0;
    for (const { played } of runs) {
        if ("error" in played) {
            rejected += 1;
            console.log(`${played.label}: rejected (${played.error})`);
        } else {
            unstruck += played.run.routes.touch === null ? 1 : 0;
            console.log(`${played.label}: ${routesText(played.run)}`);
        }
    }
    console.log("-- the ratio against the magnitude, per preset and window (rate: least-squares, per unit) --");
    for (const type of CROQUET_STROKES) {
        for (const share of WINDOW_SHARES) {
            const row = runs.filter((r) => r.type === type && r.share === share);
            const ratios = row.map((r) => ("run" in r.played ? r.played.run.routes.ratio : NaN));
            rows += 1;
            if (!ratios.every(Number.isFinite)) {
                console.log(`${type} window ×${share}: not judged (a run rejected or unstruck)`);
                continue;
            }
            const ok = monotonic(ratios);
            monotonicRows += ok ? 1 : 0;
            console.log(
                `${type} window ×${share}: ratios ${ratios.map(fmt).join(", ")}; ` +
                    `${ok ? "monotonic" : "NOT monotonic"}, rate ${fmt(slopeOf([...MAGNITUDES], ratios))} per unit`,
            );
        }
    }
    console.log(
        "-- sanity: each preset's canonical run, the taps' shares' sum beside 1 + v₂/w₁ (the face's impulse on the " +
            "striker's ball also carries the croqueted ball's momentum), within 1 % --",
    );
    // A share is a tap's impulse along aim over m_ball·w₁. The croqueted ball gains its momentum through the
    // striker's ball, so the face's impulse over the taps is about m_ball·(w₁ + v₂), w₁ and v₂ read as the share's
    // own read-out reads them: the shares sum to 1 + v₂/w₁.
    for (const type of CROQUET_STROKES) {
        const played = play(`${type} canonical`, () => canonicalSetup(type, { world: WORLD }));
        if ("error" in played) {
            console.log(`${played.label}: rejected (${played.error})`);
            continue;
        }
        const { run } = played;
        const sum = run.routes.taps.reduce((total, t) => total + t.share, 0);
        const expected = run.read === null ? NaN : 1 + run.read.v2 / run.read.w1;
        const within = Math.abs(sum / expected - 1) <= 0.01;
        console.log(
            `${played.label}: Σ share ${fmt(sum)} over ${run.routes.taps.length} tap(s), 1 + v₂/w₁ ${fmt(expected)}: ` +
                `${within ? "within 1 %" : "NOT within 1 %"}`,
        );
    }
    console.log(
        `A tally: ${runs.length} runs, ${rejected} rejected, ${unstruck} with no strike; ${monotonicRows} of ${rows} ` +
            "preset-window rows monotonic in the magnitude",
    );
}

/** Section B's onsets (s): −20 to +5 ms in 2.5 ms steps, built from whole steps so none drifts by round-off. */
const ONSETS: readonly number[] = Array.from({ length: 11 }, (_, i) => ((i - 8) * 2.5) / 1e3);

/** Section B's magnitudes, each a brake. */
const BRAKES = [-0.25, -0.5, -0.75, -1] as const;

/** Section B's jabs (m). */
const JABS = [0, 0.0025] as const;

/** Section B's smoke run (B_SMOKE): jab 0, window ×1, magnitude −1, four onsets. */
const B_SMOKE = process.env.B_SMOKE !== undefined;

/** One cell of section B's sweep. */
interface BrakeCell {
    readonly jab: number;
    readonly onset: number;
    readonly magnitude: number;
    readonly share: number;
}

/** Section B's onsets (s), B_SMOKE's four or the full sweep's. */
function brakeOnsets(): readonly number[] {
    return B_SMOKE ? [-0.02, -0.01, 0, 0.005] : ONSETS;
}

/** Section B's cells, in jab, window, magnitude and onset order. */
function brakeCells(): readonly BrakeCell[] {
    const jabs = B_SMOKE ? [0] : JABS;
    const shares = B_SMOKE ? [1] : WINDOW_SHARES;
    const magnitudes = B_SMOKE ? [-1] : BRAKES;
    const onsets = brakeOnsets();
    const cells: BrakeCell[] = [];
    for (const jab of jabs) {
        for (const share of shares) {
            for (const magnitude of magnitudes) {
                for (const onset of onsets) {
                    cells.push({ jab, onset, magnitude, share });
                }
            }
        }
    }
    return cells;
}

/** A cell's label. */
function cellLabel(c: BrakeCell): string {
    return `jab ${mm(c.jab)} mm window ×${c.share} magnitude ${c.magnitude} onset ${ms(c.onset)} ms`;
}

/** The AC stop's canonical setup at the cell's jab, brake, onset (the dip coupled) and window. */
function brakeSetup(c: BrakeCell): ShotSetup {
    const timing = { arc: c.onset, hands: 0, dip: 0 };
    return windowed(
        canonicalSetup("stop-ac", { world: WORLD, stroke: { jab: c.jab, drive: c.magnitude, timing } }),
        c.share,
    );
}

/** The sample of `samples` at or after `t` (s), else the last. */
function sampleAt(samples: readonly RouteSample[], t: number): RouteSample | undefined {
    return samples.find((s) => s.t >= t) ?? samples[samples.length - 1];
}

/** A braked run as text: section B's record beyond the routes (the parting's head speed, the grounding). */
function brakeText(run: RouteRun): string {
    if (run.routes.touch === null) {
        return "no strike";
    }
    const parted = run.faults.strike?.parted ?? null;
    const head = parted === null ? "never parted" : `${fmt(sampleAt(run.samples, parted)?.head ?? NaN)} m/s`;
    const grounds = run.impact.timeline[HEAD_TURF_KEY]?.[0]?.start;
    const second = run.routes.taps[1]?.start;
    let ground = "never";
    if (grounds !== undefined) {
        const side =
            second === undefined ? "with no second tap" : grounds < second ? "before the second tap" : "after it";
        ground = `${ms(grounds)} ms, ${side}`;
    }
    return `${routesText(run)}; head at the parting ${head}; head grounds ${ground}`;
}

/** The AC stop's canonical planned speed (m/s) at its body's θ_max: the most it plans with no intensity. */
function stopReach(): number {
    const setup = canonicalSetup("stop-ac", { world: WORLD });
    const { reach } = backswingBracket(setup, WORLD);
    return plannedSpeed({ ...setup, stroke: { ...setup.stroke, backswing: reach } }, WORLD);
}

function sectionB(): void {
    console.log(
        "== B. The brake sweep (P2b.2b.2c.2d design §4.3): the AC stop's canonical setup on the default world at the " +
            `default gap (${mm(DEFAULT_CROQUET_GAP)} mm), jab ${JABS.map(mm).join(" and ")} mm, onset timing.arc ` +
            "−20 to +5 ms in 2.5 ms steps (the dip coupled, the hands on time), magnitude " +
            `${BRAKES.join(", ")}, window ×${WINDOW_SHARES.join(", ×")} of the preset's; ` +
            `${B_SMOKE ? "B_SMOKE: jab 0, window ×1, magnitude −1, four onsets only; " : ""}` +
            `B.1 at ${fmt(SPEED)} m/s contact speed (strokeForContact: the body's θ_max caps the stop with no ` +
            `intensity at ${fmt(stopReach())} m/s planned, so a brake begun early is met by the intensity), B.2 at ` +
            "a fixed backswing. Per run: the stroke and its regime, the routes (section A's), the head's speed " +
            "along aim at the parting (m/s), when the head grounds (ms) " +
            'against the second tap, and "no strike" where the head never meets the ball ==',
    );
    const cells = brakeCells();
    console.log(`-- B.1 at ${fmt(SPEED)} m/s contact speed --`);
    let unreachable = 0;
    let unstruck1 = 0;
    for (const cell of cells) {
        const label = cellLabel(cell);
        let setup: ShotSetup;
        try {
            const base = brakeSetup(cell);
            setup = { ...base, stroke: { ...base.stroke, ...strokeForContact(base, SPEED, WORLD) } };
        } catch (error) {
            unreachable += 1;
            console.log(`${label}: unreachable (${errorText(error)})`);
            continue;
        }
        const played = play(label, () => setup);
        if ("error" in played) {
            unreachable += 1;
            console.log(`${label}: rejected (${played.error})`);
            continue;
        }
        unstruck1 += played.run.routes.touch === null ? 1 : 0;
        console.log(`${label}: ${strokeText(setup)}; ${brakeText(played.run)}`);
    }
    console.log(
        `-- B.2 at a fixed backswing, the on-time stroke's for ${fmt(SPEED)} m/s planned (backswingFor at jab 0 and ` +
            "2.5 mm); exit criterion 5: the contact speed (0 with no strike) non-increasing as the onset moves " +
            "earlier and as the magnitude strengthens --",
    );
    const speeds = new Map<string, number>();
    let unstruck2 = 0;
    let rejected2 = 0;
    for (const cell of cells) {
        const label = cellLabel(cell);
        const played = play(label, () => {
            const base = brakeSetup(cell);
            const onTime = canonicalSetup("stop-ac", { world: WORLD, stroke: { jab: cell.jab } });
            return { ...base, stroke: { ...base.stroke, backswing: backswingFor(onTime, SPEED, WORLD) } };
        });
        if ("error" in played) {
            rejected2 += 1;
            console.log(`${label}: rejected (${played.error})`);
            continue;
        }
        const touch = played.run.routes.touch;
        unstruck2 += touch === null ? 1 : 0;
        speeds.set(label, touch?.contactSpeed ?? 0);
        console.log(`${label}: ${strokeText(played.run.setup)}; ${brakeText(played.run)}`);
    }
    const violations: string[] = [];
    let large = 0;
    const judge = (earlier: BrakeCell, later: BrakeCell, axis: string): void => {
        const a = speeds.get(cellLabel(earlier));
        const b = speeds.get(cellLabel(later));
        if (a !== undefined && b !== undefined && a > b) {
            large += a - b > REPORT_MARGIN ? 1 : 0;
            violations.push(
                `${axis}: ${cellLabel(earlier)} ${fmt(a)} m/s above ${cellLabel(later)} ${fmt(b)} m/s ` +
                    `(by ${(a - b).toExponential(3)} m/s)`,
            );
        }
    };
    for (const cell of cells) {
        // The next onset later, and the next magnitude weaker, of the same cell.
        const onsets = brakeOnsets();
        const i = onsets.indexOf(cell.onset);
        const later = onsets[i + 1];
        if (later !== undefined) {
            judge(cell, { ...cell, onset: later }, "earlier onset");
        }
        const j = BRAKES.indexOf(cell.magnitude as (typeof BRAKES)[number]);
        const weaker = j > 0 ? BRAKES[j - 1] : undefined;
        if (weaker !== undefined && !B_SMOKE) {
            judge(cell, { ...cell, magnitude: weaker }, "stronger magnitude");
        }
    }
    console.log(`-- B.2's violations of exit criterion 5 (${violations.length}) --`);
    for (const line of violations) {
        console.log(line);
    }
    console.log(
        `B tally: B.1 ${cells.length} runs, ${unreachable} unreachable or rejected, ${unstruck1} with no strike; ` +
            `B.2 ${cells.length} runs, ${rejected2} rejected, ${unstruck2} with no strike, ${violations.length} ` +
            `violation(s) of exit criterion 5, ${large} above ${REPORT_MARGIN} m/s`,
    );
}

/**
 * A reporting aid, not a pass bar: section B.2's tally also counts the violations above this margin (m/s), so the
 * reader can tell round-off-sized ones from the rest. Every violation still counts and is listed.
 */
const REPORT_MARGIN = 1e-9;

/** The double-hit probe's §3a figure: the canonical drive's late catch's start (ms), for the reader. */
const DOUBLE_HIT_CATCH = 96.4;

/** Section C's span after first contact (s) and its sampling interval (s). */
const C_SPAN = 0.12;
const C_STEP = 1e-3;

function sectionC(): void {
    console.log(
        "== C. The drive's late catch, diagnosed (P2b.2b.2c.2d design §6): the canonical drive on the default world " +
            `at its own guideEffort (${fmt(defaultProfile.drive.drive.guideEffort)}) and at 0, sampled every 1 ms ` +
            "from first contact to 120 ms: the bottom hand's force on the head along aim (N), the head's speed " +
            "along aim (m/s) and the striker's ball's speed along aim (m/s); each face contact after the first, " +
            `with its start (ms from first contact); the double-hit probe's §3a catch at ${fmt(DOUBLE_HIT_CATCH)} ms ` +
            "is printed beside it for the reader ==",
    );
    const runs = [
        { label: "own guideEffort", setup: canonicalSetup("drive", { world: WORLD }) },
        { label: "guideEffort 0", setup: canonicalSetup("drive", { world: WORLD, stroke: { guideEffort: 0 } }) },
    ].map(({ label, setup }) => ({ label, run: playRoutes(setup, WORLD), striker: setup.striker }));
    const notes: string[] = [];
    for (const { label, run, striker } of runs) {
        const face = run.impact.timeline[faceKey(striker)] ?? [];
        const first = face[0];
        if (first === undefined) {
            console.log(`${label}: no strike`);
            notes.push(`${label} no strike`);
            continue;
        }
        const later = face.slice(1).map((f) => `${ms(f.start - first.start)} ms`);
        const recontacts = run.routes.recontacts.map((r) => `${ms(r.start - first.start)} ms`);
        console.log(
            `${label}: first contact at ${ms(first.start)} ms; face contacts after it at ` +
                `${later.join(", ") || "none"} (from first contact); re-contacts after the parting ` +
                `${recontacts.join(", ") || "none"}; ` +
                `impact ends at ${ms(run.impact.duration - first.start)} ms from first contact`,
        );
        notes.push(`${label} ${run.routes.recontacts.length} re-contact(s) after the parting`);
    }
    console.log(
        `-- t (ms from first contact): [own] F_bottom (N), head (m/s), ball (m/s) | [guideEffort 0] the same; ` +
            `double-hit probe §3a: the catch at ${fmt(DOUBLE_HIT_CATCH)} ms --`,
    );
    const firsts = runs.map(({ run, striker }) => run.impact.timeline[faceKey(striker)]?.[0]?.start);
    for (let k = 0; k * C_STEP <= C_SPAN + 1e-12; k++) {
        const cells = runs.map(({ run }, i) => {
            const start = firsts[i];
            if (start === undefined) {
                return "no strike";
            }
            const t = start + k * C_STEP;
            const last = run.samples[run.samples.length - 1];
            if (last === undefined || last.t < t) {
                return "impact ended";
            }
            const s = sampleAt(run.samples, t) as RouteSample;
            return `${fmt(s.bottom)}, ${fmt(s.head)}, ${fmt(s.ball)}`;
        });
        console.log(`${fmt(k * C_STEP * 1e3)}: ${cells.join(" | ")}`);
    }
    console.log(`C tally: ${runs.length} runs; ${notes.join("; ")}`);
}

/** The thresholds with every one 0: each after-parting interval judged alone. */
const ALONE: ReContactThresholds = { mergeSeparation: 0, effectSpeed: 0, effectAngle: 0 };

/** Section D's what-if thresholds: separations (m), speed effects (fractions) and angle effects (°). */
const MERGES = [0, 0.1e-3, 0.25e-3, 0.5e-3, 1e-3, 2e-3] as const;
const SPEEDS = [0, 0.01, 0.02, 0.05, 0.1] as const;
const ANGLES = [0, 1, 2, 5] as const;

/** One judged run of section D: its preset, its face contacts on the striker and its parting. */
interface Judged {
    readonly type: StrokeType;
    readonly faces: readonly ContactInterval[];
    readonly parted: number | null;
}

/** `setup`'s impact judged as simulateShot judges it, the free motion after left out (no fault reads it). */
function judgedImpact(setup: ShotSetup): { readonly impact: ImpactResult; readonly faults: FaultReport } {
    const contact = planStroke(setup, WORLD).contact;
    const impact = simulateImpact(contact, setup.balls, WORLD);
    return { impact, faults: judgeFaults(strokeContext(setup, impact), impact) };
}

/** A judged run's record for section D. */
function judgedOf(type: StrokeType, setup: ShotSetup, impact: ImpactResult, faults: FaultReport): Judged {
    return { type, faces: impact.timeline[faceKey(setup.striker)] ?? [], parted: faults.strike?.parted ?? null };
}

/** The values at min, 10 %, 25 %, 50 %, 75 %, 90 % and max of `xs` (nearest rank), as text; "none" when empty. */
function quantilesText(xs: readonly number[], f: (x: number) => string): string {
    if (xs.length === 0) {
        return "none";
    }
    const sorted = [...xs].sort((a, b) => a - b);
    const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] as number;
    const points: readonly [string, number][] = [
        ["min", sorted[0] as number],
        ["10 %", at(0.1)],
        ["25 %", at(0.25)],
        ["50 %", at(0.5)],
        ["75 %", at(0.75)],
        ["90 %", at(0.9)],
        ["max", sorted[sorted.length - 1] as number],
    ];
    return `${xs.length} values: ${points.map(([name, x]) => `${name} ${f(x)}`).join(", ")}`;
}

/**
 * Whether a judged run raises 29.1.6.1 under `thresholds`, as judgeFaults decides it. It groups every face interval,
 * where judgeFaults groups only the non-exempt ones; on these grids the two agree, since no croquet stroke has a roquet
 * and so no 29.2.4.1 exemption arises (the all-zero cell's 922 matches the judge's count at Task 1).
 */
function flagged(run: Judged, thresholds: ReContactThresholds): boolean {
    if (run.parted === null) {
        return run.faces.length >= 2;
    }
    return groupReContacts(run.faces, run.parted, thresholds).some((r) => r.fault);
}

/**
 * A grid's spread and what-if table (design §7); the count flagged at every threshold 0. Like flagged, it reads every
 * face interval rather than the non-exempt ones judgeFaults groups, which agree on these grids (see flagged).
 */
function spreadOf(name: string, runs: readonly Judged[]): number {
    const separations: number[] = [];
    const afterSeparations: number[] = [];
    const durations: number[] = [];
    const speedEffects: number[] = [];
    const angleEffects: number[] = [];
    let negative = 0;
    let fromRest = 0;
    let gaps = 0;
    let after = 0;
    for (const run of runs) {
        for (let i = 1; i < run.faces.length; i++) {
            const before = run.faces[i - 1] as ContactInterval;
            const face = run.faces[i] as ContactInterval;
            const raw = before.clearanceAfter ?? 0;
            negative += raw < 0 ? 1 : 0;
            const separation = Math.max(0, raw);
            gaps += 1;
            separations.push(separation);
            durations.push(face.start - before.end);
            if (run.parted !== null && face.start >= run.parted) {
                after += 1;
                afterSeparations.push(separation);
            }
        }
        if (run.parted !== null) {
            for (const r of groupReContacts(run.faces, run.parted, ALONE)) {
                if (Number.isFinite(r.speedChange)) {
                    speedEffects.push(Math.abs(r.speedChange));
                } else {
                    fromRest += 1;
                }
                angleEffects.push(r.angleChange);
            }
        }
    }
    console.log(
        `-- ${name}: ${runs.length} judged runs, ${gaps} face gaps after the first contact, ${after} beginning at or ` +
            `after the parting; ${negative} with a negative clearanceAfter, counted as separation 0 --`,
    );
    console.log(`separation (mm), every gap: ${quantilesText(separations, mm)}`);
    console.log(`separation (mm), after the parting: ${quantilesText(afterSeparations, mm)}`);
    console.log(`gap duration (ms), every gap: ${quantilesText(durations, ms)}`);
    console.log(
        `speed effect alone (|%|), after the parting: ${quantilesText(speedEffects, pct)}; ${fromRest} from rest`,
    );
    console.log(`angle effect alone (°), after the parting: ${quantilesText(angleEffects, fmt)}`);
    console.log(
        `-- ${name}: the count flagged under 29.1.6.1 per preset (${CROQUET_STROKES.join("/")}), by ` +
            "MERGE_SEPARATION (rows, mm) and EFFECT_SPEED (columns, %), one table per EFFECT_ANGLE (°) --",
    );
    let placeholders = 0;
    for (const angle of ANGLES) {
        console.log(`EFFECT_ANGLE ${fmt(angle)}°: columns EFFECT_SPEED ${SPEEDS.map(pct).join(", ")} %`);
        for (const merge of MERGES) {
            const cells = SPEEDS.map((speed) => {
                const thresholds = { mergeSeparation: merge, effectSpeed: speed, effectAngle: angle };
                const counts = CROQUET_STROKES.map(
                    (type) => runs.filter((r) => r.type === type && flagged(r, thresholds)).length,
                );
                if (merge === 0 && speed === 0 && angle === 0) {
                    placeholders = counts.reduce((a, b) => a + b, 0);
                }
                return counts.join("/");
            });
            console.log(`  MERGE_SEPARATION ${mm(merge)} mm: ${cells.join(" | ")}`);
        }
    }
    return placeholders;
}

function sectionD(): void {
    console.log(
        "== D. The re-contacts' spread (P2b.2b.2c.2d design §7): the 950-run grid (every croquet preset's canonical " +
            "run and its preset digest grid, digestGrid: 5 speeds × 5 drives × 3 heights × 3 sides, each planned " +
            "at its speed; the runs a speed beyond reach rejects left out) on the default world, each judged as " +
            "simulateShot judges it, and section A's grid: every face gap after the first contact, its separation " +
            "(the earlier contact's clearanceAfter, mm, a negative one counted as 0), its duration (ms) and whether " +
            "it begins at or after the parting; each after-parting interval's effect alone (groupReContacts, every " +
            "threshold 0: the striker's ball's speed change, |%|, and direction change, °); quantiles; then the " +
            "what-if table (groupReContacts at each threshold set) ==",
    );
    const grid: Judged[] = [];
    let total = 0;
    let rejected = 0;
    for (const type of CROQUET_STROKES) {
        const runs = [
            { label: `${type} canonical`, build: () => canonicalSetup(type, { world: WORLD }) },
            ...digestGrid(type, WORLD),
        ];
        for (const { label, build } of runs) {
            total += 1;
            try {
                const setup = build();
                const { impact, faults } = judgedImpact(setup);
                grid.push(judgedOf(type, setup, impact, faults));
            } catch (error) {
                rejected += 1;
                console.log(`${label}: rejected (${errorText(error)})`);
            }
        }
    }
    console.log(`the grid: ${total} runs, ${rejected} rejected, ${grid.length} judged (the 950-run grid)`);
    const followed: Judged[] = [];
    for (const { type, played } of followGrid()) {
        if ("run" in played) {
            const { run } = played;
            followed.push(judgedOf(type, run.setup, run.impact, run.faults));
        }
    }
    const atPlaceholders = spreadOf(`the ${grid.length}-run grid`, grid);
    const followedPlaceholders = spreadOf(`section A's grid (${followed.length} played)`, followed);
    console.log(
        `D tally: the grid ${grid.length} judged of ${total} (${rejected} rejected), ${atPlaceholders} flagged at ` +
            `every threshold 0 (922 at Task 1); section A's grid ${followed.length} played, ` +
            `${followedPlaceholders} flagged at every threshold 0`,
    );
}

/** Section S's leans (rad): −8° to +4° in 1° steps. */
const LEANS: readonly number[] = Array.from({ length: 13 }, (_, i) => ((i - 8) * Math.PI) / 180);

/** The AC stop's held-high contact (m) for the leans past −6° (design §3.5). */
const HIGH_UP = -0.025;

/** The leans (rad) the AC stop is also played at HIGH_UP. */
const HIGH_LEANS: readonly number[] = [(-7 * Math.PI) / 180, (-8 * Math.PI) / 180];

/** A Gugan 5 stroke of section S: its type, its push or jab option, and the other stroke, whose grips it also plays. */
const S_STROKES = [
    { type: "stop-ac", option: { jab: 0 }, other: "drive" },
    { type: "drive", option: { guideEffort: 0 }, other: "stop-ac" },
] as const;

/** One played lean of section S. */
interface StanceRun {
    readonly lean: number;
    readonly ratio: number;
}

/** A Gugan 5 run as text: section S's record. */
function stanceText(run: RouteRun, type: "drive" | "stop-ac"): string {
    const target = ratioTargetsReference[type].ratio;
    const [lo, hi] = target.bounds as readonly [number, number];
    const { ratio, touch } = run.routes;
    if (touch === null) {
        return "no strike";
    }
    const within = ratio >= lo && ratio <= hi ? "*" : " ";
    const squared = run.read === null ? NaN : (run.read.v2 / run.read.w1) ** 2;
    const start = touch.t;
    const window = run.samples.filter((s) => s.t >= start && s.t <= start + STRIKE_WINDOW);
    const least = Math.min(...window.map((s) => s.lowest));
    const turf = run.impact.timeline[HEAD_TURF_KEY]?.[0]?.start;
    return (
        `ratio ${fmt(ratio)}${within} (band ${fmt(lo)} to ${fmt(hi)}), (v₂/w₁)² ${fmt(squared)}; ` +
        `${routesText(run)}; least clearance over the strike window ${mm(least)} mm; head touched the turf ` +
        `${turf === undefined ? "never" : `at ${ms(turf)} ms`}`
    );
}

function sectionS(): void {
    console.log(
        "== S. The stance sweep (P2b.2b.2c.2d design §3.5): the AC stop and the drive as Gugan 5's strokes on the " +
            `default world (guganSetup: Gugan's mallet, the default gap ${mm(DEFAULT_CROQUET_GAP)} mm, ` +
            `${fmt(SPEED)} m/s contact speed by strokeForContact, the drive at guideEffort 0, the stop at jab 0, ` +
            "ON_TIME, each preset's own drive), leans −8° to +4° in 1° steps set through handsAhead at the preset's " +
            `top hand and up, the AC stop also at up ${mm(HIGH_UP)} mm for −7° and −8°; each at the stroke's own ` +
            "grips and at the other's (bottom, gripTension, bottomGrip). A lean whose head's lowest point at contact " +
            "lies in the turf (turfLimited, mm) is printed turf-limited and not played. Per run: the ratio against " +
            "its band (* within), (v₂/w₁)², the routes, the head's least clearance from the turf over the strike " +
            `window (${ms(STRIKE_WINDOW)} ms from first touch, mm) and any turf contact; per stroke and grip set, ` +
            "the lean nearest the target and the ratio's rate per degree; then the canonical drive across the leans ==",
    );
    let played = 0;
    let limited = 0;
    let rejected = 0;
    const best: string[] = [];
    for (const { type, option, other } of S_STROKES) {
        const target = ratioTargetsReference[type].ratio.value;
        for (const grips of [type, other] as const) {
            const series: StanceRun[] = [];
            const cases = [
                ...LEANS.map((lean) => ({ lean, up: undefined as number | undefined })),
                ...(type === "stop-ac" ? HIGH_LEANS.map((lean) => ({ lean, up: HIGH_UP as number | undefined })) : []),
            ];
            console.log(`-- ${type} at ${grips}'s grips --`);
            for (const { lean, up } of cases) {
                const label = `${type} grips ${grips} lean ${deg(lean)}°${up === undefined ? "" : ` up ${mm(up)} mm`}`;
                const options = {
                    world: WORLD,
                    gugan: true,
                    ...option,
                    lean,
                    grips,
                    ...(up === undefined ? {} : { up }),
                };
                try {
                    const clear = turfLimited(guganSetup(type, SPEED, DEFAULT_CROQUET_GAP, options), WORLD);
                    if (clear < 0) {
                        limited += 1;
                        console.log(`${label}: turf-limited (${mm(0 - clear)} mm in the turf)`);
                        continue;
                    }
                    const setup = guganSetup(type, SPEED, DEFAULT_CROQUET_GAP, { ...options, contactSpeed: true });
                    const run = playRoutes(setup, WORLD);
                    played += 1;
                    console.log(
                        `${label}: clear ${mm(clear)} mm at contact; ${strokeText(setup)}; ${stanceText(run, type)}`,
                    );
                    if (up === undefined && run.routes.touch !== null && Number.isFinite(run.routes.ratio)) {
                        series.push({ lean, ratio: run.routes.ratio });
                    }
                } catch (error) {
                    rejected += 1;
                    console.log(`${label}: rejected (${errorText(error)})`);
                }
            }
            if (series.length === 0) {
                best.push(`${type}/${grips} none played`);
                continue;
            }
            const nearest = series.reduce((a, b) => (Math.abs(b.ratio - target) < Math.abs(a.ratio - target) ? b : a));
            const rate =
                series.length > 1
                    ? slopeOf(
                          series.map((s) => (s.lean * 180) / Math.PI),
                          series.map((s) => s.ratio),
                      )
                    : NaN;
            console.log(
                `${type} at ${grips}'s grips: nearest the target ${fmt(target)} at lean ${deg(nearest.lean)}° ` +
                    `(ratio ${fmt(nearest.ratio)}); rate ${fmt(rate)} per degree over ${series.length} playable leans`,
            );
            best.push(`${type}/${grips} ${deg(nearest.lean)}° ratio ${fmt(nearest.ratio)}`);
        }
    }
    console.log(
        "-- S.2 the canonical drive (its own guideEffort, the default mallet, 3 m/s planned) across the leans: each " +
            "re-contact after the parting, its start and effect (the late catch) --",
    );
    let caught = 0;
    let played2 = 0;
    let limited2 = 0;
    let rejected2 = 0;
    for (const lean of LEANS) {
        const label = `drive lean ${deg(lean)}°`;
        try {
            const setup = guganSetup("drive", SPEED, DEFAULT_CROQUET_GAP, { world: WORLD, lean });
            const clear = turfLimited(setup, WORLD);
            if (clear < 0) {
                limited2 += 1;
                console.log(`${label}: turf-limited (${mm(0 - clear)} mm in the turf)`);
                continue;
            }
            const run = playRoutes(setup, WORLD);
            played2 += 1;
            caught += run.routes.recontacts.length > 0 ? 1 : 0;
            console.log(`${label}: ${strokeText(setup)}; ${routesText(run)}`);
        } catch (error) {
            rejected2 += 1;
            console.log(`${label}: rejected (${errorText(error)})`);
        }
    }
    console.log(
        `S tally: ${played} Gugan 5 runs played, ${limited} turf-limited, ${rejected} rejected; nearest ` +
            `${best.join("; ")}; S.2 ${LEANS.length} leans, ${limited2} turf-limited, ${rejected2} rejected, ` +
            `${caught} of ${played2} played leans with a re-contact after the parting`,
    );
}

const SECTIONS: Readonly<Record<string, () => void>> = {
    A: sectionA,
    B: sectionB,
    C: sectionC,
    D: sectionD,
    S: sectionS,
};

const ALL_SECTIONS: readonly string[] = ["A", "B", "C", "D", "S"];

if (SECTION !== "all" && SECTIONS[SECTION] === undefined) {
    throw new Error(`SECTION must be "all" or one of ${Object.keys(SECTIONS).join(", ")}`);
}
if (SECTION === "all") {
    console.log(`== all: sections ${ALL_SECTIONS.join(", ")} ==`);
}
for (const name of SECTION === "all" ? ALL_SECTIONS : [SECTION]) {
    (SECTIONS[name] as () => void)();
}
