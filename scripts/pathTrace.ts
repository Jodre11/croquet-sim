/**
 * Path trace (P2b.2b.2c.3b gate stage 2, the user's question 2026-10-31: "the path of the mallet head must be wrong"):
 * three roll runs replayed side on, the planned path (the track's pathAt and handsAt) against the integrated head, from
 * the downswing's last 100 ms to the follow-through's finish. Per run: an SVG of the side view at true scale (the top
 * hand's planned path dotted and its actual path solid, the leading face's planned path dashed and its actual path
 * solid, ticks every 10 ms along the shaft and along the face) and of the head's lowest point (mm) against time, and a
 * table every 5 ms. A first slice of the side-on viewer; diagnostic, not part of the engine or the test suite.
 * Run with `npx --yes tsx scripts/pathTrace.ts`; environment: OUT (a directory, default docs/superpowers/probes).
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { headLowestPoint } from "../src/engine/impact/contacts";
import type { FollowSnapshot, ImpactProbe, ImpactSnapshot } from "../src/engine/impact/integrate";
import { rotate } from "../src/engine/impact/rigidBody";
import { simulateStroke } from "../src/engine/impact/simulateImpact";
import { handsAt, headOnPath, prepareTrack } from "../src/engine/impact/track";
import type { HeadState, MalletHead } from "../src/engine/impact/types";
import { add, dot, scale, sub, vec3, type Vec3 } from "../src/engine/math/vec3";
import { planStroke } from "../src/engine/swing/buildContact";
import { type BallState } from "../src/engine/types";
import { openWorld } from "./openLawn";
import { mapSetup, textBook, type MapPlan, type RollType } from "./pushMapRun";

const WORLD = openWorld(10);
const OUT = process.env.OUT ?? "docs/superpowers/probes";
const DEG = 180 / Math.PI;
/** How often the trace keeps a step (s): the integrator's steps are far finer than a plot needs. */
const KEEP = 0.00025;

/** One run to trace: its name, type, plan and power. */
interface TraceCase {
    readonly name: string;
    readonly file: string;
    readonly type: RollType;
    readonly plan: MapPlan;
    readonly power: number;
}

const CASES: readonly TraceCase[] = [
    {
        name: "today's full roll at its canonical power (played: turf, ratio 1.843)",
        file: "full-roll-textbook",
        type: "full-roll",
        plan: textBook("full-roll"),
        power: 0.1535,
    },
    {
        name: "an in-band full roll at speedGain 0.5, 4.42 m on the 10 s lawn (read: turf, ratio 1.195)",
        file: "full-roll-speedgain-0.5",
        type: "full-roll",
        plan: {
            lean: 0.3316125578789226,
            feet: 0.2696814700042282,
            drive: 1,
            handReach: 0.2,
            window: 0.04,
            onset: 0,
            split: 0,
            speedGain: 0.5,
        },
        power: 0.13729876976198027,
    },
    {
        name: "today's pass roll at its canonical power (played: turf, ratio 0.874)",
        file: "pass-roll-textbook",
        type: "pass-roll",
        plan: textBook("pass-roll"),
        power: 0.3362,
    },
];

/** A traced instant: the planned and the actual top hand, leading face centre and normal, shaft and lowest point. */
interface Instant {
    readonly t: number;
    readonly hand: Vec3;
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
    readonly contactAt: number;
    readonly impactEnd: number;
    readonly finish: number;
    readonly firstFace: number;
    readonly origin: Vec3;
    readonly aim: Vec3;
    readonly flags: readonly string[];
    readonly yields: readonly number[];
}

/** The head's instant: the top hand `radius` up the shaft from the socket, and the face on the aim's side. */
function instantOf(t: number, state: HeadState, head: MalletHead, radius: number, side: number): Instant {
    const q = state.orientation;
    const shaft = rotate(q, vec3(0, 0, 1));
    const socket = add(state.position, rotate(q, head.socket));
    const normal = scale(rotate(q, vec3(1, 0, 0)), side);
    return {
        t,
        hand: add(socket, scale(shaft, radius)),
        face: add(state.position, scale(normal, head.length / 2)),
        normal,
        shaft,
        low: headLowestPoint(state, head),
    };
}

/** Plays `c` once on the 10 s open lawn and traces it. */
function trace(c: TraceCase): Trace {
    const setup = mapSetup(c.type, c.plan, c.power);
    const stroke = planStroke(setup, WORLD);
    const { drive, head } = stroke.contact;
    if (drive.kind !== "track") {
        throw new Error(`${c.file}: no tracked drive`);
    }
    const track = prepareTrack(drive, head, WORLD.gravity);
    const { arc } = drive;
    const radius = arc.radius;
    const side = Math.sign(dot(rotate(stroke.contact.orientation, vec3(1, 0, 0)), arc.aim)) || 1;
    const actual: Instant[] = [];
    const balls: Vec3[][] = [];
    let kept = 0 - Infinity;
    const keep = (t: number, state: HeadState): void => {
        if (t - kept >= KEEP) {
            kept = t;
            actual.push(instantOf(t, state, head, radius, side));
        }
    };
    const probe: ImpactProbe = {
        step(s: ImpactSnapshot) {
            const before = kept;
            keep(s.t, s.head);
            if (kept !== before) {
                s.balls.forEach((b: BallState, i: number) => {
                    (balls[i] ??= []).push(b.position);
                });
            }
        },
        follow(s: FollowSnapshot) {
            keep(s.t, s.head);
        },
    };
    const run = simulateStroke(stroke.contact, setup.balls, WORLD, { probe });
    const finish = run.follow.finish;
    const planned: Instant[] = [];
    const start = arc.contactAt - 0.1;
    for (let t = start; t <= finish + 1e-12; t += KEEP) {
        try {
            planned.push(instantOf(t, headOnPath(track, head, t), head, radius, side));
        } catch {
            // The prepared path is not defined before the downswing's release or the impact's start on every plan.
        }
    }
    const handsPlanned = planned.map((p) => ({ ...p, hand: handsAt(track, p.t).position }));
    const striker = (setup.balls[setup.striker] as BallState).position;
    const faces = run.result.timeline[`face/${setup.striker}`] ?? [];
    return {
        planned: handsPlanned,
        actual,
        balls,
        contactAt: arc.contactAt,
        impactEnd: run.follow.impactEnd,
        finish,
        firstFace: faces[0]?.start ?? arc.contactAt,
        origin: striker,
        aim: arc.aim,
        flags: run.follow.flags,
        yields: run.result.events.filter((e) => e.kind === "turf-yield").map((e) => e.t),
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

/** The run's SVG: the side view at true scale, then the lowest point (mm) against time from first contact (ms). */
function svgOf(c: TraceCase, tr: Trace, R: number): string {
    const W = 1000;
    const pad = 50;
    const x0 = -0.6;
    const x1 = 0.8;
    const z0 = -0.03;
    const z1 = 0.95;
    const k = (W - 2 * pad) / (x1 - x0);
    const sideH = (z1 - z0) * k;
    const sx = (x: number): number => pad + (x - x0) * k;
    const sz = (z: number): number => pad + (z1 - z) * k;
    const pts = (list: readonly Instant[], pick: (i: Instant) => Vec3): string =>
        list
            .map((i) => side2d(pick(i), tr))
            .filter(([x]) => x >= x0 && x <= x1)
            .map(([x, z]) => `${f(sx(x))},${f(sz(z))}`)
            .join(" ");
    const parts: string[] = [];
    const top = pad + sideH + 70;
    const plotH = 300;
    const tFrom = -40;
    const tTo = (tr.finish - tr.firstFace) * 1000;
    const lowValues = [...tr.planned, ...tr.actual].map((i) => i.low * 1000);
    const lMin = Math.min(-5, ...lowValues);
    const lMax = Math.ceil(Math.min(200, Math.max(10, ...lowValues)) / 10) * 10;
    const tx = (ms: number): number => pad + ((ms - tFrom) / (tTo - tFrom)) * (W - 2 * pad);
    const ly = (mm: number): number => top + ((lMax - Math.min(lMax, mm)) / (lMax - lMin)) * plotH;
    const H = top + plotH + 60;
    parts.push(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${f(H, 0)}" font-family="sans-serif" font-size="13">`,
        `<rect width="100%" height="100%" fill="#fff"/>`,
        `<text x="${pad}" y="24" font-size="15" font-weight="bold">${c.name}</text>`,
        `<text x="${pad}" y="42" fill="#555">side on, true scale; x along aim from the striker's ball, ` +
            `flags: ${tr.flags.join(", ") || "none"}</text>`,
        `<line x1="${sx(x0)}" y1="${f(sz(0))}" x2="${sx(x1)}" y2="${f(sz(0))}" stroke="#2a7d2a" stroke-width="2"/>`,
    );
    for (const track of tr.balls) {
        const p = track[0];
        if (p !== undefined) {
            const [x, z] = side2d(p, tr);
            parts.push(`<circle cx="${f(sx(x))}" cy="${f(sz(z))}" r="${f(R * k)}" fill="none" stroke="#999"/>`);
        }
    }
    const window = tr.planned.filter((i) => i.t >= tr.contactAt - 0.1);
    parts.push(
        `<polyline points="${pts(window, (i) => i.hand)}" fill="none" stroke="#1f5fbf" stroke-width="2" ` +
            `stroke-dasharray="2 4"/>`,
        `<polyline points="${pts(tr.actual, (i) => i.hand)}" fill="none" stroke="#1f5fbf" stroke-width="1"/>`,
        `<polyline points="${pts(window, (i) => i.face)}" fill="none" stroke="#c0392b" stroke-width="2" ` +
            `stroke-dasharray="6 4"/>`,
        `<polyline points="${pts(tr.actual, (i) => i.face)}" fill="none" stroke="#c0392b" stroke-width="1.2"/>`,
    );
    for (let ms = -100; ms <= tTo; ms += 10) {
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
        `<text x="${W - pad - 330}" y="${pad + 20}" fill="#1f5fbf">top hand: planned dotted, actual solid; ` +
            `ticks = shaft</text>`,
        `<text x="${W - pad - 330}" y="${pad + 38}" fill="#c0392b">leading face: planned dashed, actual solid; ` +
            `ticks = face</text>`,
        `<text x="${pad}" y="${f(top - 20)}" font-weight="bold">the head's lowest point (mm above the turf) against ` +
            `time from first contact (ms)</text>`,
        `<rect x="${pad}" y="${f(ly(0))}" width="${W - 2 * pad}" height="${f(ly(lMin) - ly(0))}" fill="#e8f3e8"/>`,
        `<line x1="${pad}" y1="${f(ly(0))}" x2="${W - pad}" y2="${f(ly(0))}" stroke="#2a7d2a" stroke-width="1.5"/>`,
    );
    for (let mm = Math.ceil(lMin / 20) * 20; mm <= lMax; mm += 20) {
        parts.push(`<text x="${pad - 8}" y="${f(ly(mm) + 4)}" text-anchor="end" fill="#555">${mm}</text>`);
    }
    for (let ms = Math.ceil(tFrom / 20) * 20; ms <= tTo; ms += 20) {
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

/** The run's table every 5 ms from 20 ms before first contact. */
function tableOf(c: TraceCase, tr: Trace): string {
    const lines = [
        `== ${c.name} ==`,
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

const tables: string[] = [];
for (const c of CASES) {
    const tr = trace(c);
    writeFileSync(join(OUT, `2026-10-31-path-trace-${c.file}.svg`), svgOf(c, tr, WORLD.ball.radius));
    tables.push(tableOf(c, tr));
}
const text = tables.join("\n\n");
writeFileSync(join(OUT, "2026-10-31-path-trace.txt"), `${text}\n`);
console.log(text);
