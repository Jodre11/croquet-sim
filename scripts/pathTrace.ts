/**
 * Path trace (P2b.2b.2c.3b gate stage 2, the user's question 2026-10-31: "the path of the mallet head must be wrong"):
 * runs replayed side on (shapes plan Task 6: the drive and the three rolls' text books at canonical power), the planned path (the track's pathAt and handsAt) against the integrated head, from
 * the downswing's last 100 ms to the follow-through's finish. Per run: an SVG of the side view at true scale (the top
 * hand's planned path dotted and its actual path solid, the leading face's planned path dashed and its actual path
 * solid, ticks every 10 ms along the shaft and along the face) and of the head's lowest point (mm) against time, and a
 * table every 5 ms. A first slice of the side-on viewer; diagnostic, not part of the engine or the test suite.
 * Each roll is played as a practised stroke (P2b.2b.2c.3b.1 design §4, §6): the trace is its last pass, the planned
 * path that pass's (its lift included), and the table's header gives the passes and practice's miss; the drive, with
 * no push, plays once. Each legend gives readsOf's reads, and the views reach the finish.
 * Run with `npx --yes tsx scripts/pathTrace.ts`; environment: OUT (a directory, default docs/superpowers/probes).
 * Shapes plan Task 4: `--diagnose` traces the full and pass roll text books alone, every millisecond through the push,
 * with each step's bottom hand off its path, the feed-forward and the rest of the hands' force (flex and chain), each
 * hand's force, the bottom hand's moment about the top grip and the balls' resistance on the face, and writes the table
 * alone (no SVG). `--unpractised` plays the first pass only, the plan as given.
 */
import { faceKey, headLowestPoint } from "../src/engine/impact/contacts";
import type { FollowSnapshot, ImpactProbe, ImpactSnapshot } from "../src/engine/impact/integrate";
import { PRACTICE_PASSES, practiseStroke } from "../src/engine/impact/practice";
import { rotate } from "../src/engine/impact/rigidBody";
import { simulateStroke } from "../src/engine/impact/simulateImpact";
import { handsAt, headOnPath, pitchAxis, prepareTrack, releaseOf } from "../src/engine/impact/track";
import type { HeadState, MalletHead } from "../src/engine/impact/types";
import { add, cross, dot, scale, sub, vec3, type Vec3 } from "../src/engine/math/vec3";
import { planStroke } from "../src/engine/swing/buildContact";
import { BALL_IDS, type BallId, type BallState } from "../src/engine/types";
import type { ShotSetup } from "../src/engine/swing/types";
import { simulateShot } from "../src/engine/shot";
import { swingReference } from "../src/reference/index";
import { canonicalSetup } from "../tests/engine/support/shot";
import { openWorld } from "./openLawn";
import { bodyBackswing, mapSetup, playSample, textBook, type MapPlan, type RollType } from "./pushMapRun";
import { travelOf } from "./ratioFit";

declare const process: {
    readonly env: Readonly<Record<string, string | undefined>>;
    readonly argv: readonly string[];
    exit(code: number): never;
};

/** The file system call the trace uses (tsx runs under Node; the project has no Node types). */
interface Files {
    writeFileSync(path: string, data: string): void;
}

async function files(): Promise<Files> {
    const specifier = "node:fs";
    return (await import(/* @vite-ignore */ specifier)) as Files;
}

const WORLD = openWorld(10);
const OUT = process.env.OUT ?? "docs/superpowers/probes";
const DEG = 180 / Math.PI;
/** How often the trace keeps a step (s): the integrator's steps are far finer than a plot needs. */
const KEEP = 0.00025;
const DIAGNOSE = process.argv.includes("--diagnose");
const UNPRACTISED = process.argv.includes("--unpractised");
/**
 * `--instant-push`, a diagnostic only (gate 1's check): the push intent with no rise and no cap, τ_push 1 ns and
 * F_push 1 MN, so the hands meet the balls' resistance along aim one step after it acts.
 */
const INSTANT_PUSH = process.argv.includes("--instant-push");
/**
 * `--no-balls`, a diagnostic only, with `--unpractised`: the stroke planned at the balls, then played with every ball
 * 3 m on along aim, so the head swings the same plan through empty air above the turf.
 */
const NO_BALLS = process.argv.includes("--no-balls");

/** `setup`'s balls, each moved 3 m along `aim`. */
function outOfReach(setup: ShotSetup, aim: Vec3): ShotSetup["balls"] {
    const moved: Partial<Record<BallId, BallState>> = {};
    for (const id of BALL_IDS) {
        const ball = setup.balls[id];
        if (ball !== undefined) {
            moved[id] = { ...ball, position: add(ball.position, scale(aim, 3)) };
        }
    }
    return moved as ShotSetup["balls"];
}
/** The cases `--diagnose` traces: the full and pass rolls' text books. */
const DIAGNOSED = new Set(["full-roll", "pass-roll"]);

/**
 * One run to trace (shapes plan Task 6): its name and file, its setup, whether it is practised (a roll, which pushes)
 * and, for a roll, its type, text book and canonical power, from which its ratio is read as the push map plays it.
 */
interface TraceCase {
    readonly name: string;
    readonly file: string;
    readonly setup: ShotSetup;
    readonly roll: { readonly type: RollType; readonly plan: MapPlan; readonly power: number } | null;
}

/** `type`'s text book at its canonical power: the power at which its backswing is the type's defaultBackswing. */
function rollCase(type: RollType): TraceCase {
    const plan = textBook(type);
    const power = swingReference[type].defaultBackswing.value / bodyBackswing(mapSetup(type, plan, 1), WORLD);
    const over = INSTANT_PUSH ? { body: { pushForce: 1e6, pushResponseTime: 1e-9 } } : {};
    return {
        name: `the ${type.replace("-", " ")}'s text book at its canonical power (${power.toFixed(4)})`,
        file: type,
        setup: mapSetup(type, plan, power, over),
        roll: { type, plan, power },
    };
}

const CASES: readonly TraceCase[] = [
    { name: "the drive at its canonical backswing", file: "drive", setup: canonicalSetup("drive"), roll: null },
    rollCase("half-roll"),
    rollCase("full-roll"),
    rollCase("pass-roll"),
];

/**
 * One step's hands and balls (`--diagnose`; N, and N·m for `lever`): the feed-forward, the rest of the hands' force
 * (the flex's and the chains'), each hand's force, the bottom hand's moment about the top grip (positive turning the
 * shaft forward) and the balls' resistance, the face–ball pairs' normal force.
 */
interface Diagnosis {
    readonly feedForward: Vec3;
    readonly rest: Vec3;
    readonly top: Vec3;
    readonly bottom: Vec3;
    readonly lever: number;
    readonly balls: number;
}

/** What a step reports of its hands' forces. */
interface HandForces {
    readonly feedForward: Vec3;
    readonly top: Vec3;
    readonly bottom: Vec3;
}

/** A traced instant: the planned and the actual top hand, leading face centre and normal, shaft and lowest point. */
interface Instant {
    readonly t: number;
    readonly hand: Vec3;
    /** The bottom hand's grip. */
    readonly grip: Vec3;
    readonly diagnosis?: Diagnosis;
    readonly face: Vec3;
    readonly normal: Vec3;
    readonly shaft: Vec3;
    readonly low: number;
}

/** A run's trace: planned and actual instants, the balls' tracks in the impact, and its markers (s). */
interface Trace {
    readonly planned: readonly Instant[];
    readonly actual: readonly Instant[];
    readonly balls: readonly (readonly Vec3[])[];
    /** The times (s) of the balls' samples. */
    readonly ballTimes: readonly number[];
    /** The striker's ball's index. */
    readonly striker: number;
    readonly contactAt: number;
    readonly impactEnd: number;
    readonly finish: number;
    readonly firstFace: number;
    readonly origin: Vec3;
    readonly aim: Vec3;
    readonly flags: readonly string[];
    readonly yields: readonly number[];
    /** The practice passes played and the last pass's miss (null in the band). */
    readonly passes: number;
    readonly miss: string | null;
    /** The push's end (s), null where it has none. */
    readonly pushEnd: number | null;
    /** The slope's release into the finish's free swing (s; releaseOf), null where there is none. */
    readonly release: number | null;
    /** The end of the striker's ball's last face interval (s): its last departure from the mallet. */
    readonly lastDeparture: number;
    /** The hands' planned travel from the release to the finish (m), along aim and up; null without a release. */
    readonly handsAfterRelease: readonly [number, number] | null;
}

/**
 * The head's instant: the top hand `radius` and the bottom hand `bottom` up the shaft from the socket, and the face on
 * the aim's side.
 */
function instantOf(
    t: number,
    state: HeadState,
    head: MalletHead,
    radius: number,
    bottom: number,
    side: number,
): Instant {
    const q = state.orientation;
    const shaft = rotate(q, vec3(0, 0, 1));
    const socket = add(state.position, rotate(q, head.socket));
    const normal = scale(rotate(q, vec3(1, 0, 0)), side);
    return {
        t,
        hand: add(socket, scale(shaft, radius)),
        grip: add(socket, scale(shaft, bottom)),
        face: add(state.position, scale(normal, head.length / 2)),
        normal,
        shaft,
        low: headLowestPoint(state, head),
    };
}

/** The step's Diagnosis from its hands' forces and the balls' resistance; `instant` gives the grips. */
function diagnosisOf(instant: Instant, hands: HandForces, axis: Vec3, balls: number): Diagnosis {
    return {
        feedForward: hands.feedForward,
        rest: sub(add(hands.top, hands.bottom), hands.feedForward),
        top: hands.top,
        bottom: hands.bottom,
        lever: dot(cross(sub(instant.grip, instant.hand), hands.bottom), axis),
        balls,
    };
}

/**
 * Plays `c` on the 10 s open lawn and traces it: as a practised stroke, its last pass, or with `--unpractised` its
 * first pass alone.
 */
function trace(c: TraceCase): Trace {
    const { setup } = c;
    const stroke = planStroke(setup, WORLD);
    const { drive, head } = stroke.contact;
    if (drive.kind !== "track") {
        throw new Error(`${c.file}: no tracked drive`);
    }
    const { arc } = drive;
    const radius = arc.radius;
    const bottom = drive.hands.bottom;
    const axis = pitchAxis(arc.aim);
    const faceKeys = new Set(BALL_IDS.map(faceKey));
    const side = Math.sign(dot(rotate(stroke.contact.orientation, vec3(1, 0, 0)), arc.aim)) || 1;
    let actual: Instant[] = [];
    let balls: Vec3[][] = [];
    let ballTimes: number[] = [];
    let kept = 0 - Infinity;
    const keep = (t: number, state: HeadState, hands?: HandForces, balls = 0): void => {
        if (t - kept >= KEEP) {
            kept = t;
            const instant = instantOf(t, state, head, radius, bottom, side);
            actual.push(
                DIAGNOSE && hands !== undefined
                    ? { ...instant, diagnosis: diagnosisOf(instant, hands, axis, balls) }
                    : instant,
            );
        }
    };
    const probeFor = (): ImpactProbe => {
        // A new pass: the trace keeps the last pass alone.
        actual = [];
        balls = [];
        ballTimes = [];
        kept = 0 - Infinity;
        return {
            step(s: ImpactSnapshot) {
                const before = kept;
                const resistance = s.contacts
                    .filter((k) => faceKeys.has(k.key))
                    .reduce((sum, k) => sum + k.normalForce, 0);
                keep(s.t, s.head, s.hand, resistance);
                if (kept !== before) {
                    ballTimes.push(s.t);
                    s.balls.forEach((b: BallState, i: number) => {
                        (balls[i] ??= []).push(b.position);
                    });
                }
            },
            follow(s: FollowSnapshot) {
                keep(s.t, s.head, s);
            },
        };
    };
    const run =
        UNPRACTISED || c.roll === null
            ? {
                  ...simulateStroke(stroke.contact, NO_BALLS ? outOfReach(setup, arc.aim) : setup.balls, WORLD, {
                      probe: probeFor(),
                  }),
                  passes: 1,
                  miss: c.roll === null ? "unpractised: no push to practise" : "unpractised: the first pass alone",
                  lift: null,
              }
            : practiseStroke(stroke.contact, setup.balls, WORLD, setup.striker, probeFor);
    // The planned path is the last pass's: the arc with the lift it played.
    const played = run.lift === null ? drive : { ...drive, arc: { ...arc, lift: run.lift } };
    const track = prepareTrack(played, head, WORLD.gravity);
    const finish = run.follow.finish;
    const planned: Instant[] = [];
    const start = arc.contactAt - 0.1;
    for (let t = start; t <= finish + 1e-12; t += KEEP) {
        try {
            planned.push(instantOf(t, headOnPath(track, head, t), head, radius, bottom, side));
        } catch {
            // The prepared path is not defined before the downswing's release or the impact's start on every plan.
        }
    }
    const handsPlanned = planned.map((p) => ({ ...p, hand: handsAt(track, p.t).position }));
    const striker = (setup.balls[setup.striker] as BallState).position;
    const faces = run.result.timeline[`face/${setup.striker}`] ?? [];
    const release = releaseOf(track);
    const handsAfterRelease =
        release === null
            ? null
            : ([
                  dot(sub(handsAt(track, finish).position, handsAt(track, release).position), arc.aim),
                  handsAt(track, finish).position.z - handsAt(track, release).position.z,
              ] as const);
    return {
        planned: handsPlanned,
        actual,
        balls,
        ballTimes,
        striker: BALL_IDS.filter((id) => setup.balls[id] !== undefined).indexOf(setup.striker),
        contactAt: arc.contactAt,
        impactEnd: run.follow.impactEnd,
        finish,
        firstFace: faces[0]?.start ?? arc.contactAt,
        origin: striker,
        aim: arc.aim,
        flags: run.follow.flags,
        yields: run.result.events.filter((e) => e.kind === "turf-yield").map((e) => e.t),
        passes: run.passes,
        miss: run.miss,
        pushEnd: track.push?.end ?? null,
        release,
        lastDeparture: faces[faces.length - 1]?.end ?? arc.contactAt,
        handsAfterRelease,
    };
}

/** A point's side-on coordinates (m): along aim from the striker's ball's start, and its height. */
function side2d(p: Vec3, tr: Trace): readonly [number, number] {
    return [dot(sub(p, tr.origin), tr.aim), p.z];
}

/** Degrees above horizontal of a direction in the swing plane. */
function pitchDeg(v: Vec3, aim: Vec3): number {
    return Math.atan2(v.z, dot(v, aim)) * DEG;
}

/** The instant nearest `t` in `list`. */
function at(list: readonly Instant[], t: number): Instant | undefined {
    let best: Instant | undefined;
    for (const i of list) {
        if (best === undefined || Math.abs(i.t - t) < Math.abs(best.t - t)) {
            best = i;
        }
    }
    return best;
}

const f = (x: number, d = 1): string => x.toFixed(d);

/** The shaft's lean (° from vertical, forward along aim positive). */
const leanOf = (i: Instant, aim: Vec3): number => Math.atan2(dot(i.shaft, aim), i.shaft.z) * DEG;

/**
 * The legend's reads (shapes plan Task 6): the balls' distances to rest on the 10 s lawn and the ratio (a roll's as
 * the push map plays it, practised; the drive's unpractised), the played lean's range, the top hand's largest offset
 * from its plan, the hands' travel after the release, the shaft's lean at the mallet's apex (the finish) and the
 * release against the striker's ball's last departure (design §8, ruling 10).
 */
function readsOf(c: TraceCase, tr: Trace): readonly string[] {
    let distances: string;
    if (c.roll === null) {
        const striker = travelOf(c.setup, simulateShot(c.setup, WORLD).motion, c.setup.striker);
        distances = `striker's ball ${f(striker, 2)} m to rest on the 10 s lawn`;
    } else {
        const sample = playSample(c.roll.type, c.roll.plan, c.roll.power, [10]);
        const read = sample.byLawn[10];
        const range = read?.range ?? NaN;
        const ratio = read?.ratio ?? NaN;
        distances =
            `to rest on the 10 s lawn: croqueted ${f(range * ratio, 2)} m, striker's ${f(range, 2)} m, ` +
            `ratio ${f(ratio, 3)}; push map: ${sample.klass === null ? "valid" : `${sample.klass} (${sample.reason})`}`;
    }
    const after = tr.actual.filter((i) => i.t >= tr.firstFace);
    const leans = after.map((i) => leanOf(i, tr.aim));
    let worst = { off: 0, along: 0, up: 0, t: tr.firstFace };
    for (const a of after) {
        const p = at(tr.planned, a.t);
        if (p !== undefined && Math.abs(p.t - a.t) <= 0.001) {
            const off = sub(a.hand, p.hand);
            const size = Math.hypot(dot(off, tr.aim), off.z);
            if (size > worst.off) {
                worst = { off: size, along: dot(off, tr.aim), up: off.z, t: a.t };
            }
        }
    }
    const ms = (t: number): string => f((t - tr.firstFace) * 1000, 1);
    const end = after[after.length - 1];
    return [
        distances,
        `played lean ${f(Math.min(...leans))}° to ${f(Math.max(...leans))}° from first contact to the finish`,
        `top hand's largest offset ${f(worst.off * 1000, 0)} mm (${f(worst.along * 1000, 0)} along, ` +
            `${f(worst.up * 1000, 0)} up) at ${ms(worst.t)} ms`,
        tr.release === null || tr.handsAfterRelease === null
            ? "no release: the hands' travel after it is nil"
            : `hands after the release: ${f(tr.handsAfterRelease[0] * 1000, 0)} mm along, ` +
              `${f(tr.handsAfterRelease[1] * 1000, 0)} mm up`,
        `shaft lean at the mallet's apex (finish, ${ms(tr.finish)} ms) ${end === undefined ? "n/a" : f(leanOf(end, tr.aim))}°`,
        tr.release === null
            ? `no release; the striker's ball last leaves the face at ${ms(tr.lastDeparture)} ms`
            : `release ${ms(tr.release)} ms, the striker's ball last leaves the face at ${ms(tr.lastDeparture)} ms ` +
              `(release ${f((tr.release - tr.lastDeparture) * 1000, 1)} ms after it)` +
              (tr.pushEnd === null ? "" : `; push ends ${ms(tr.pushEnd)} ms`),
    ];
}

/** The run's SVG: the side view at true scale, then the lowest point (mm) against time from first contact (ms). */
function svgOf(c: TraceCase, tr: Trace, R: number, reads: readonly string[]): string {
    const W = 1000;
    const pad = 50;
    // The view reaches every traced point to the finish (the user, 2026-11-01: the plots cropped it).
    const traced = [...tr.planned, ...tr.actual].flatMap((i) => [side2d(i.hand, tr), side2d(i.face, tr)]);
    const ballReach = tr.balls.flatMap((track) => track.map((p) => side2d(p, tr)[0]));
    const x0 = Math.min(-0.6, Math.floor((Math.min(...traced.map(([x]) => x)) - 0.05) * 10) / 10);
    const x1 = Math.max(
        0.8,
        Math.ceil((Math.max(...ballReach) + 2 * R) * 10) / 10,
        Math.ceil((Math.max(...traced.map(([x]) => x)) + 0.05) * 10) / 10,
    );
    const z0 = -0.03;
    const z1 = Math.max(0.95, Math.ceil((Math.max(...traced.map(([, z]) => z)) + 0.05) * 10) / 10);
    const k = (W - 2 * pad) / (x1 - x0);
    const sideH = (z1 - z0) * k;
    // The reads, then the key (two inks and a line per ball), sit above the side view.
    const key = 60 + 18 * reads.length;
    const head = key + 18 * (2 + tr.balls.length);
    const sx = (x: number): number => pad + (x - x0) * k;
    const sz = (z: number): number => head + (z1 - z) * k;
    const pts = (list: readonly Instant[], pick: (i: Instant) => Vec3): string =>
        list
            .map((i) => side2d(pick(i), tr))
            .filter(([x]) => x >= x0 && x <= x1)
            .map(([x, z]) => `${f(sx(x))},${f(sz(z))}`)
            .join(" ");
    const parts: string[] = [];
    const top = head + sideH + 70;
    const plotH = 300;
    const tFrom = -40;
    const tTo = (tr.finish - tr.firstFace) * 1000;
    // Ticks along the paths and the time axis's labels thin out on a long finish.
    const tick = tTo > 400 ? 50 : 10;
    const label = tTo > 400 ? 100 : 20;
    const lowValues = [...tr.planned, ...tr.actual].map((i) => i.low * 1000);
    const lMin = Math.min(-5, ...lowValues);
    const lMax = Math.ceil(Math.max(10, ...lowValues) / 20) * 20;
    const tx = (ms: number): number => pad + ((ms - tFrom) / (tTo - tFrom)) * (W - 2 * pad);
    const ly = (mm: number): number => top + ((lMax - Math.min(lMax, mm)) / (lMax - lMin)) * plotH;
    const H = top + plotH + 60;
    parts.push(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${f(H, 0)}" font-family="sans-serif" font-size="13">`,
        `<rect width="100%" height="100%" fill="#fff"/>`,
        `<text x="${pad}" y="24" font-size="15" font-weight="bold">${c.name}</text>`,
        `<text x="${pad}" y="42" fill="#555">side on, true scale; x along aim from the striker's ball, ` +
            `flags: ${tr.flags.join(", ") || "none"}</text>`,
        ...reads.map((r, i) => `<text x="${pad}" y="${60 + 18 * i}" fill="#333">${r}</text>`),
        `<line x1="${sx(x0)}" y1="${f(sz(0))}" x2="${sx(x1)}" y2="${f(sz(0))}" stroke="#2a7d2a" stroke-width="2"/>`,
    );
    // Each ball: its start, a ghost every 20 ms of the impact, its centre's path, and where it is as the impact ends.
    const BALL_INKS = ["#6b3fa0", "#d07a00"];
    tr.balls.forEach((track, b) => {
        const ink = BALL_INKS[b % BALL_INKS.length] as string;
        const circle = (p: Vec3, style: string): string => {
            const [x, z] = side2d(p, tr);
            return `<circle cx="${f(sx(x))}" cy="${f(sz(z))}" r="${f(R * k)}" ${style}/>`;
        };
        let ghost = tr.ballTimes[0] ?? 0;
        track.forEach((p, i) => {
            const t = tr.ballTimes[i] ?? 0;
            if (i === 0) {
                parts.push(circle(p, `fill="none" stroke="#999"`));
            } else if (t - ghost >= 0.02 - 1e-9) {
                ghost = t;
                parts.push(circle(p, `fill="none" stroke="${ink}" stroke-opacity="0.35"`));
            }
        });
        const centre = track
            .map((p) => side2d(p, tr))
            .map(([x, z]) => `${f(sx(x))},${f(sz(z))}`)
            .join(" ");
        parts.push(`<polyline points="${centre}" fill="none" stroke="${ink}" stroke-width="1"/>`);
        const last = track[track.length - 1];
        if (last !== undefined && track.length > 1) {
            parts.push(circle(last, `fill="none" stroke="${ink}" stroke-width="1.5"`));
        }
        // The striker's ball where it last leaves the face (the user, 2026-11-01), at the sample nearest that time.
        if (b === tr.striker) {
            let near = 0;
            tr.ballTimes.forEach((t, i) => {
                if (Math.abs(t - tr.lastDeparture) < Math.abs((tr.ballTimes[near] ?? 0) - tr.lastDeparture)) {
                    near = i;
                }
            });
            const leaving = track[Math.min(near, track.length - 1)];
            if (leaving !== undefined) {
                parts.push(circle(leaving, `fill="none" stroke="#000" stroke-width="1.5" stroke-dasharray="4 3"`));
            }
        }
    });
    const window = tr.planned.filter((i) => i.t >= tr.contactAt - 0.1);
    parts.push(
        `<polyline points="${pts(window, (i) => i.hand)}" fill="none" stroke="#1f5fbf" stroke-width="2" ` +
            `stroke-dasharray="2 4"/>`,
        `<polyline points="${pts(tr.actual, (i) => i.hand)}" fill="none" stroke="#1f5fbf" stroke-width="1"/>`,
        `<polyline points="${pts(window, (i) => i.face)}" fill="none" stroke="#c0392b" stroke-width="2" ` +
            `stroke-dasharray="6 4"/>`,
        `<polyline points="${pts(tr.actual, (i) => i.face)}" fill="none" stroke="#c0392b" stroke-width="1.2"/>`,
    );
    for (let ms = -100; ms <= tTo; ms += tick) {
        const i = at(tr.actual, tr.firstFace + ms / 1000) ?? at(window, tr.firstFace + ms / 1000);
        if (i === undefined || Math.abs(i.t - (tr.firstFace + ms / 1000)) > 0.002) {
            continue;
        }
        const [hx, hz] = side2d(i.hand, tr);
        const s = 0.06;
        const along = dot(i.shaft, tr.aim);
        parts.push(
            `<line x1="${f(sx(hx - along * s))}" y1="${f(sz(hz - i.shaft.z * s))}" x2="${f(sx(hx + along * s))}" ` +
                `y2="${f(sz(hz + i.shaft.z * s))}" stroke="#1f5fbf" stroke-width="1.5"/>`,
        );
        const [fx, fz] = side2d(i.face, tr);
        const n = dot(i.normal, tr.aim);
        parts.push(
            `<line x1="${f(sx(fx + i.normal.z * s * 0.5))}" y1="${f(sz(fz - n * s * 0.5))}" ` +
                `x2="${f(sx(fx - i.normal.z * s * 0.5))}" y2="${f(sz(fz + n * s * 0.5))}" stroke="#c0392b" ` +
                `stroke-width="1.5"/>`,
        );
    }
    parts.push(
        `<text x="${pad}" y="${key}" fill="#1f5fbf">top hand: planned dotted, actual solid; ` + `ticks = shaft</text>`,
        `<text x="${pad}" y="${key + 18}" fill="#c0392b">leading face: planned dashed, actual solid; ` +
            `ticks = face</text>`,
        ...tr.balls.map((track, b) => {
            const name = b === tr.striker ? "striker's ball" : "croqueted ball";
            const a = track[track.length - 2];
            const z = track[track.length - 1];
            const dt = (tr.ballTimes[track.length - 1] ?? 0) - (tr.ballTimes[track.length - 2] ?? 0);
            if (a === undefined || z === undefined || dt <= 0) {
                return "";
            }
            const [ax, az] = side2d(a, tr);
            const [zx, zz] = side2d(z, tr);
            const [sx0] = side2d(track[0] as Vec3, tr);
            const leaving =
                b === tr.striker
                    ? `; dashed black where it last leaves the face, ` +
                      `${f((tr.lastDeparture - tr.firstFace) * 1000, 1)} ms`
                    : "";
            return (
                `<text x="${pad}" y="${key + 36 + 18 * b}" fill="${BALL_INKS[b % BALL_INKS.length]}">` +
                `${name}: ghosts every 20 ms; at impact end ${f((zx - sx0) * 1000, 0)} mm on, ` +
                `${f((zx - ax) / dt, 2)} m/s along, ${f((zz - az) / dt, 2)} m/s up${leaving}</text>`
            );
        }),
        `<text x="${pad}" y="${f(top - 20)}" font-weight="bold">the head's lowest point (mm above the turf) against ` +
            `time from first contact (ms)</text>`,
        `<rect x="${pad}" y="${f(ly(0))}" width="${W - 2 * pad}" height="${f(ly(lMin) - ly(0))}" fill="#e8f3e8"/>`,
        `<line x1="${pad}" y1="${f(ly(0))}" x2="${W - pad}" y2="${f(ly(0))}" stroke="#2a7d2a" stroke-width="1.5"/>`,
    );
    const rung = lMax > 200 ? 100 : 20;
    for (let mm = Math.ceil(lMin / rung) * rung; mm <= lMax; mm += rung) {
        parts.push(`<text x="${pad - 8}" y="${f(ly(mm) + 4)}" text-anchor="end" fill="#555">${mm}</text>`);
    }
    for (let ms = Math.ceil(tFrom / label) * label; ms <= tTo; ms += label) {
        parts.push(
            `<line x1="${f(tx(ms))}" y1="${f(top)}" x2="${f(tx(ms))}" y2="${f(top + plotH)}" stroke="#eee"/>`,
            `<text x="${f(tx(ms))}" y="${f(top + plotH + 18)}" text-anchor="middle" fill="#555">${ms}</text>`,
        );
    }
    const series = (list: readonly Instant[], style: string): string =>
        `<polyline points="${list
            .map((i) => [(i.t - tr.firstFace) * 1000, i.low * 1000] as const)
            .filter(([ms]) => ms >= tFrom && ms <= tTo)
            .map(([ms, mm]) => `${f(tx(ms))},${f(ly(mm))}`)
            .join(" ")}" fill="none" ${style}/>`;
    parts.push(
        series(window, `stroke="#555" stroke-width="2" stroke-dasharray="6 4"`),
        series(tr.actual, `stroke="#000" stroke-width="1.5"`),
        `<line x1="${f(tx(0))}" y1="${f(top)}" x2="${f(tx(0))}" y2="${f(top + plotH)}" stroke="#c0392b"/>`,
        `<line x1="${f(tx((tr.impactEnd - tr.firstFace) * 1000))}" y1="${f(top)}" ` +
            `x2="${f(tx((tr.impactEnd - tr.firstFace) * 1000))}" y2="${f(top + plotH)}" stroke="#999" ` +
            `stroke-dasharray="3 3"/>`,
        `<text x="${f(tx(0) + 4)}" y="${f(top + 14)}" fill="#c0392b">first contact</text>`,
        `<text x="${f(tx((tr.impactEnd - tr.firstFace) * 1000) + 4)}" y="${f(top + 30)}" fill="#777">balls gone ` +
            `(impact ends)</text>`,
        `<text x="${W - pad - 300}" y="${f(top + 14)}">planned dashed, actual solid; green band = in the turf</text>`,
        `</svg>`,
    );
    return parts.join("\n");
}

/** The run's legend's reads, then its table every 5 ms from 20 ms before first contact. */
function tableOf(c: TraceCase, tr: Trace, reads: readonly string[]): string {
    const lines = [
        `== ${c.name} ==`,
        ...reads,
        `practised: ${tr.passes} pass${tr.passes === 1 ? "" : "es"} of ${PRACTICE_PASSES}; ` +
            `${tr.miss === null ? "in the band" : `out of the band: ${tr.miss}`}`,
        `first contact ${f(tr.firstFace * 1000, 2)} ms (planned ${f(tr.contactAt * 1000, 2)} ms), impact ends ` +
            `${f((tr.impactEnd - tr.firstFace) * 1000, 1)} ms after it, finish ${f((tr.finish - tr.firstFace) * 1000, 1)}` +
            ` ms; flags: ${tr.flags.join(", ") || "none"}; impact turf-yield at ` +
            `${tr.yields.map((t) => f((t - tr.firstFace) * 1000, 2)).join(", ") || "never"} ms`,
        "ms from contact | lowest point mm planned / actual | face pitch ° planned / actual | shaft lean ° " +
            "planned / actual | top hand off plan mm (along, up)",
    ];
    const lowest = tr.actual.reduce((a, b) => (b.low < a.low ? b : a));
    for (let ms = -20; ms <= (tr.finish - tr.firstFace) * 1000; ms += 5) {
        const t = tr.firstFace + ms / 1000;
        const a = at(tr.actual, t);
        const p = at(tr.planned, t);
        if (a === undefined || p === undefined || Math.abs(a.t - t) > 0.001) {
            continue;
        }
        const lean = (i: Instant): number => Math.atan2(dot(i.shaft, tr.aim), i.shaft.z) * DEG;
        const off = sub(a.hand, p.hand);
        lines.push(
            `${f(ms, 0).padStart(5)} | ${f(p.low * 1000).padStart(6)} / ${f(a.low * 1000).padStart(6)} | ` +
                `${f(pitchDeg(p.normal, tr.aim)).padStart(6)} / ${f(pitchDeg(a.normal, tr.aim)).padStart(6)} | ` +
                `${f(lean(p)).padStart(6)} / ${f(lean(a)).padStart(6)} | ` +
                `${f(dot(off, tr.aim) * 1000).padStart(6)}, ${f(off.z * 1000).padStart(6)}`,
        );
    }
    lines.push(
        `lowest actual point ${f(lowest.low * 1000, 2)} mm at ${f((lowest.t - tr.firstFace) * 1000, 1)} ms; lowest ` +
            `planned ${f(Math.min(...tr.planned.filter((i) => i.t >= tr.firstFace).map((i) => i.low)) * 1000, 2)} mm`,
    );
    return lines.join("\n");
}

/** A vector's parts along aim and up, as `along, up`. */
function parts(v: Vec3, aim: Vec3): string {
    return `${f(dot(v, aim)).padStart(6)}, ${f(v.z).padStart(6)}`;
}

/**
 * The `--diagnose` table: every millisecond from 5 ms before first contact to 10 ms past the push's end (or 150 ms
 * after first contact without one), then every 10 ms to the finish.
 */
function diagnosisTable(c: TraceCase, tr: Trace): string {
    const lines = [
        `== ${c.name} ==`,
        `${tr.passes} pass${tr.passes === 1 ? "" : "es"}; ${tr.miss ?? "in the band"}; first contact ` +
            `${f(tr.firstFace * 1000, 2)} ms, push ends ` +
            `${tr.pushEnd === null ? "never" : `${f((tr.pushEnd - tr.firstFace) * 1000, 1)} ms after it`}, impact ` +
            `ends ${f((tr.impactEnd - tr.firstFace) * 1000, 1)} ms, finish ${f((tr.finish - tr.firstFace) * 1000, 1)} ms`,
        "ms | lean ° plan / played | top off mm (along, up) | bottom off mm (along, up) | feed-forward N | " +
            "rest N | top N | bottom N | lever N·m | balls N",
    ];
    const dense = (tr.pushEnd ?? tr.firstFace + 0.14) + 0.01;
    const lean = (i: Instant): number => Math.atan2(dot(i.shaft, tr.aim), i.shaft.z) * DEG;
    for (let ms = -5; ms <= (tr.finish - tr.firstFace) * 1000;) {
        const t = tr.firstFace + ms / 1000;
        const a = at(tr.actual, t);
        const p = at(tr.planned, t);
        if (a?.diagnosis !== undefined && p !== undefined && Math.abs(a.t - t) <= 0.0005) {
            const d = a.diagnosis;
            const top = sub(a.hand, p.hand);
            const grip = sub(a.grip, p.grip);
            lines.push(
                [
                    f(ms, 0).padStart(4),
                    `${f(lean(p)).padStart(5)} / ${f(lean(a)).padStart(5)}`,
                    `${f(dot(top, tr.aim) * 1000).padStart(6)}, ${f(top.z * 1000).padStart(6)}`,
                    `${f(dot(grip, tr.aim) * 1000).padStart(6)}, ${f(grip.z * 1000).padStart(6)}`,
                    parts(d.feedForward, tr.aim),
                    parts(d.rest, tr.aim),
                    parts(d.top, tr.aim),
                    parts(d.bottom, tr.aim),
                    f(d.lever, 2).padStart(6),
                    f(d.balls).padStart(7),
                ].join(" | "),
            );
        }
        ms += t < dense ? 1 : 10;
    }
    return lines.join("\n");
}

const fs = await files();
const tables: string[] = [];
if (DIAGNOSE) {
    for (const c of CASES.filter((k) => DIAGNOSED.has(k.file))) {
        tables.push(diagnosisTable(c, trace(c)));
    }
    const text = tables.join("\n\n");
    fs.writeFileSync(
        `${OUT}/path-trace-diagnosis-${UNPRACTISED ? "unpractised" : "practised"}${INSTANT_PUSH ? "-instant-push" : ""}${NO_BALLS ? "-no-balls" : ""}.txt`,
        `${text}\n`,
    );
    console.log(text);
    process.exit(0);
}
for (const c of CASES) {
    const tr = trace(c);
    const reads = readsOf(c, tr);
    fs.writeFileSync(`${OUT}/2026-11-01-path-trace-${c.file}.svg`, svgOf(c, tr, WORLD.ball.radius, reads));
    tables.push(tableOf(c, tr, reads));
}
const text = tables.join("\n\n");
fs.writeFileSync(`${OUT}/2026-11-01-path-trace-shapes.txt`, `${text}\n`);
console.log(text);
