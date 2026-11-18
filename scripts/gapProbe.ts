/**
 * The gap register's discriminating probes (reality scorecard design §6), one mode per probe, each a single run on one
 * core. Not part of the engine. Run with `npx --no-install tsx scripts/gapProbe.ts <mode>`:
 * - `read-delay`: every Table 6 roll played once and its croqueted ball read 1–5 ms after its first contact with the
 *   striker's ball ends. Candidate (b) of the slow-spin gap moves Ω₂ in the slow rolls only.
 * `--set name=value` overrides a free parameter (scripts/scorecard/params.ts) before the engine is imported.
 */
import { applyOverrides } from "./scorecard/params";

declare const process: { readonly argv: readonly string[] };

const args = process.argv.slice(2);
const overrides: Record<string, number> = {};
args.forEach((a, i) => {
    if (a !== "--set") return;
    const [name, value] = (args[i + 1] ?? "").split("=");
    overrides[name as string] = Number(value);
});
applyOverrides(overrides);
const { openWorld } = await import("./openLawn");
const { readOut } = await import("./ratioFit");
const { LAWN, ROLLS, croquetedRead, playRoll, powerFor } = await import("./table6");
const { simulateImpact } = await import("../src/engine/impact/simulateImpact");
const { ballPairKey, faceKey } = await import("../src/engine/impact/contacts");
type ReadSample = import("./ratioFit").ReadSample;
const { BALL_IDS } = await import("../src/engine/types");
const { land } = await import("../src/engine/impact/landing");
const { BED_CELL } = await import("../src/engine/impact/turfBed");
const { vec3 } = await import("../src/engine/math/vec3");
const { contactReference, frictionReference } = await import("../src/reference/index");
type ImpactProbe = import("../src/engine/impact/integrate").ImpactProbe;

const DELAYS_MS = [1, 2, 3, 4, 5];

function readDelay(): void {
    const world = openWorld(LAWN);
    console.log(`roll   U     Gugan v2/U  Ω2 | ${DELAYS_MS.map((d) => `${d} ms v2/U  Ω2`).join(" | ")} | last t`);
    for (const roll of ROLLS) {
        const power = powerFor(roll.type, roll.U, world);
        if (power === null) {
            console.log(`${roll.name} beyond the type's top`);
            continue;
        }
        const { setup, contact } = playRoll(roll, power);
        if (setup === null) {
            console.log(`${roll.name} not played`);
            continue;
        }
        const r = readOut(setup, world, {}, contact ?? undefined);
        const cells = DELAYS_MS.map((d) => {
            const { at } = croquetedRead(r, setup, d * 1e-3);
            return `${(at.v2 / roll.U).toFixed(3)} ${(100 * at.roll2).toFixed(1).padStart(6)}`;
        });
        const last = r.samples[r.samples.length - 1]?.t ?? NaN;
        console.log(
            `${roll.name.padEnd(5)} ${roll.U.toFixed(2)} ${(roll.v2 / roll.U).toFixed(3)} ${String(roll.o2).padStart(4)} | ` +
                `${cells.join(" | ")} | ${(1e3 * last).toFixed(2)} ms`,
        );
    }
}

const DISTANCES_MM = [5, 10, 15, 20, 30];

/**
 * Every Table 6 roll's croqueted ball read once it has travelled 5–30 mm past the end of its first contact with the
 * striker's ball, its travel the integral of its sampled horizontal speed: Gugan's speeds and spins are averages over
 * a few ms and mm of a video strip (Gugan 4 §3), so a slow ball's read spans more time than a fast one's.
 */
function readDistance(): void {
    const world = openWorld(LAWN);
    console.log(`roll   U     Gugan v2/U  Ω2 | ${DISTANCES_MM.map((d) => `${d} mm v2/U  Ω2   t`).join(" | ")}`);
    for (const roll of ROLLS) {
        const power = powerFor(roll.type, roll.U, world);
        if (power === null) {
            console.log(`${roll.name} beyond the type's top`);
            continue;
        }
        const { setup, contact } = playRoll(roll, power);
        if (setup === null) {
            console.log(`${roll.name} not played`);
            continue;
        }
        const r = readOut(setup, world, {}, contact ?? undefined);
        const start = croquetedRead(r, setup, 0).t;
        const after = r.samples.filter((s) => s.t >= start);
        const cells = DISTANCES_MM.map((d) => {
            let travelled = 0;
            for (let i = 1; i < after.length; i++) {
                const a = after[i - 1];
                const b = after[i];
                if (a === undefined || b === undefined) break;
                travelled += 0.5 * (a.v2 + b.v2) * (b.t - a.t);
                if (travelled >= d * 1e-3) {
                    return (
                        `${(b.v2 / roll.U).toFixed(3)} ${(100 * b.roll2).toFixed(1).padStart(6)} ` +
                        `${(1e3 * (b.t - start)).toFixed(1).padStart(4)}`
                    );
                }
            }
            return "   (run ends)   ";
        });
        console.log(
            `${roll.name.padEnd(5)} ${roll.U.toFixed(2)} ${(roll.v2 / roll.U).toFixed(3)} ${String(roll.o2).padStart(4)} | ` +
                cells.join(" | "),
        );
    }
}

/**
 * Every Table 6 roll's croqueted ball's height above rest (mm) through the impact simulation: its peak, when it first
 * leaves the ground after the strike, and the share of its first 30 ms it spends above 0.1 mm (airborne, so free of
 * the ground's friction).
 */
function hop(): void {
    const world = openWorld(LAWN);
    const R = world.ball.radius;
    console.log("roll   peak mm  at ms | off ground from ms | airborne share of first 30 ms after contact");
    for (const roll of ROLLS) {
        const power = powerFor(roll.type, roll.U, world);
        if (power === null) continue;
        const { setup, contact } = playRoll(roll, power);
        if (setup === null || contact === null) continue;
        const ids = BALL_IDS.filter((id) => setup.balls[id] !== undefined);
        const croqueted = setup.croqueted as NonNullable<typeof setup.croqueted>;
        const second = ids.indexOf(croqueted);
        const striker = ids.indexOf(setup.striker);
        const trace: { t: number; z: number; vz: number; z1: number }[] = [];
        const probe: ImpactProbe = {
            step: (s) => {
                const b = s.balls[second];
                const a = s.balls[striker];
                if (b !== undefined && a !== undefined) {
                    trace.push({ t: s.t, z: b.position.z - R, vz: b.velocity.z, z1: a.position.z - R });
                }
            },
        };
        const impact = simulateImpact(contact, setup.balls, world, { probe });
        const pair = impact.timeline[ballPairKey(setup.striker, croqueted)] ?? [];
        const start = pair[0]?.end ?? 0;
        const begin = pair[0]?.start ?? 0;
        const during = trace.filter((p) => p.t >= begin && p.t <= start);
        const at = trace.find((p) => p.t >= start);
        // The ball–ball normal's elevation from the balls' height difference over their 2R separation.
        const tilts = during.map((p) => (Math.asin(Math.max(-1, Math.min(1, (p.z - p.z1) / (2 * R)))) * 180) / Math.PI);
        const tilt = tilts.length === 0 ? NaN : tilts.reduce((s, x) => s + x, 0) / tilts.length;
        const z1 = during.length === 0 ? NaN : Math.min(...during.map((p) => p.z1));
        const after = trace.filter((p) => p.t >= start && p.t <= start + 0.03);
        const peak = after.reduce((m, p) => (p.z > m.z ? p : m), { t: start, z: -Infinity });
        const strikerPeak = trace
            .filter((p) => p.t <= start + 0.05)
            .reduce((m, p) => (p.z1 > m.z1 ? p : m), { t: start, z: 0, vz: 0, z1: -Infinity });
        const off = after.find((p) => p.z > 1e-4);
        const airborne = after.filter((p) => p.z > 1e-4).length / Math.max(1, after.length);
        console.log(
            `${roll.name.padEnd(5)} ${(1e3 * peak.z).toFixed(2).padStart(7)} ${(1e3 * (peak.t - start)).toFixed(1).padStart(6)} | ` +
                `${off === undefined ? "never" : (1e3 * (off.t - start)).toFixed(1).padStart(6)} | ` +
                `${(100 * airborne).toFixed(0).padStart(3)}% | striker depth ${(1e3 * z1).toFixed(2)} mm, ` +
                `normal tilt ${tilt.toFixed(2)}°, ball 2 vz at contact end ${(at?.vz ?? NaN).toFixed(3)} m/s, ` +
                `striker peak ${(1e3 * strikerPeak.z1).toFixed(2)} mm at ${(1e3 * strikerPeak.t).toFixed(1)} ms`,
        );
    }
}

/**
 * The bed's rebound e and peak depth for free vertical drops at 0.2–4 m/s on a fresh bed, against Penner's golf fit
 * e = 0.510 − 0.0375|v| + 0.000903v² (Can. J. Phys. 80, 931 (2002); strike–turf laws design §4), a golf analogue.
 */
function bed(): void {
    const world = openWorld(LAWN);
    const ball = { radius: world.ball.radius, mass: world.ball.mass };
    const law = {
        modulus: contactReference.bedModulus.value,
        recovery: contactReference.bedRecovery.value,
        friction: frictionReference.ballTurfSliding.value,
        cell: BED_CELL,
    };
    console.log("v m/s   e model  e Penner  depth mm");
    for (const v of [0.2, 0.5, 1, 1.5, 2, 3, 4]) {
        const l = land(
            { position: vec3(0.0007, 0.0011, ball.radius), velocity: vec3(0, 0, -v), angularVelocity: vec3(0, 0, 0) },
            ball,
            world.gravity,
            law,
        );
        const e = l.outcome === "left" ? l.state.velocity.z / v : 0;
        const penner = 0.51 - 0.0375 * v + 0.000903 * v * v;
        console.log(
            `${v.toFixed(1).padStart(5)} ${e.toFixed(3).padStart(8)} ${penner.toFixed(3).padStart(9)} ` +
                `${(1e3 * l.peakDepth).toFixed(2).padStart(9)}`,
        );
    }
}

/**
 * G4's lift check decomposed: for each canonical roll, each ball's highest centre above R (mm) in the impact and its
 * flights' apex, the croqueted ball's speed after the impact and the mallet's contact speed, so the check's figure
 * is tied to a ball and a strength.
 */
async function lifts(): Promise<void> {
    const { defaultWorld } = await import("../src/engine/world");
    const { canonicalSetup } = await import("../src/lab/canonical");
    const { simulateShot } = await import("../src/engine/shot");
    const world = defaultWorld();
    const R = world.ball.radius;
    for (const type of ["half-roll", "full-roll", "pass-roll"] as const) {
        const setup = canonicalSetup(type, { world });
        const outcome = simulateShot(setup, world);
        const ids = BALL_IDS.filter((id) => setup.balls[id] !== undefined);
        const high = new Map<string, number>();
        const probe: ImpactProbe = {
            step: (s) => {
                s.balls.forEach((b, i) => {
                    const id = ids[i] as string;
                    high.set(id, Math.max(high.get(id) ?? 0, b.position.z - R));
                });
            },
        };
        simulateImpact(outcome.contact, setup.balls, world, { probe });
        const croqueted = setup.croqueted as string;
        const flight = new Map<string, number>();
        let v2 = NaN;
        for (const [id, segments] of Object.entries(outcome.motion.segments)) {
            const first = segments?.[0]?.start;
            if (id === croqueted && first !== undefined) v2 = Math.hypot(first.velocity.x, first.velocity.y);
            for (const { start } of segments ?? []) {
                const vz = start.velocity.z;
                const apex = start.position.z - R + (vz > 0 ? (vz * vz) / (2 * world.gravity) : 0);
                flight.set(id, Math.max(flight.get(id) ?? 0, apex));
            }
        }
        const parts = ids.map(
            (id) =>
                `${id === croqueted ? "croqueted" : "striker"} impact ${(1e3 * (high.get(id) ?? 0)).toFixed(1)} ` +
                `flight ${(1e3 * (flight.get(id) ?? 0)).toFixed(1)} mm`,
        );
        console.log(`${type.padEnd(9)} v2 ${v2.toFixed(2)} | ${parts.join(" | ")}`);
    }
}

/**
 * G4's discriminating probe: an oblique landing on a fresh bed, horizontal v₂ 1–8 m/s with vz = −0.15·v₂ (the
 * croqueted ball's state at the ball–ball contact's end), against a vertical drop at the same vz. Candidate (a),
 * ploughing, predicts a lower vertical e for the oblique landing. Spin Ω₂ 0 and −0.36 (G1's start), as Rω/v₂.
 */
function oblique(): void {
    const world = openWorld(LAWN);
    const ball = { radius: world.ball.radius, mass: world.ball.mass };
    const R = ball.radius;
    const law = {
        modulus: contactReference.bedModulus.value,
        recovery: contactReference.bedRecovery.value,
        friction: frictionReference.ballTurfSliding.value,
        cell: BED_CELL,
    };
    const drop = (vx: number, vz: number, spin: number) =>
        land(
            {
                position: vec3(0.0007, 0.0011, R),
                velocity: vec3(vx, 0, vz),
                angularVelocity: vec3(0, (spin * vx) / R, 0),
            },
            ball,
            world.gravity,
            law,
        );
    console.log("v2 m/s  vz m/s  Ω2in | e vertical | e oblique  vx out/in  Ω2 out  hop mm  depth mm  outcome");
    for (const v2 of [1, 2, 4, 6, 8]) {
        const vz = -0.15 * v2;
        const vertical = drop(0, vz, 0);
        const eV = vertical.outcome === "left" ? vertical.state.velocity.z / -vz : 0;
        for (const spin of [0, -0.36]) {
            const l = drop(v2, vz, spin);
            const out = l.state.velocity;
            const e = l.outcome === "left" ? out.z / -vz : 0;
            const omega = (R * l.state.angularVelocity.y) / Math.max(1e-9, out.x);
            const hop = (1e3 * out.z * out.z) / (2 * world.gravity);
            console.log(
                `${v2.toFixed(1).padStart(6)} ${vz.toFixed(2).padStart(7)} ${spin.toFixed(2).padStart(5)} | ` +
                    `${eV.toFixed(3).padStart(10)} | ${e.toFixed(3).padStart(9)} ${(out.x / v2).toFixed(3).padStart(10)} ` +
                    `${omega.toFixed(2).padStart(7)} ${hop.toFixed(2).padStart(7)} ${(1e3 * l.peakDepth).toFixed(2).padStart(9)}  ` +
                    l.outcome,
            );
        }
    }
}

/**
 * The full and pass rolls' strike, C10 against C25: the face's contact intervals with the striker's ball, the head
 * speed U, w₁/U and Ω₁ at each face contact's end and at the read, and the hands' impulse along the aim during the
 * face contacts. Candidate (a) of the fast-striker gap keeps the face on, driving ball 1, longer at C25.
 */
function strike(): void {
    const world = openWorld(LAWN);
    for (const roll of ROLLS.filter((r) => ["C10F", "C25F", "C10P", "C25P"].includes(r.name))) {
        const power = powerFor(roll.type, roll.U, world);
        if (power === null) continue;
        const { setup, contact } = playRoll(roll, power);
        if (setup === null) continue;
        const r = readOut(setup, world, {}, contact ?? undefined);
        const face = r.impact.timeline[faceKey(setup.striker)] ?? [];
        const sampleAt = (t: number): ReadSample =>
            r.samples.find((s) => s.t >= t) ?? (r.samples[r.samples.length - 1] as ReadSample);
        const t0 = face[0]?.start ?? 0;
        let impulse = 0;
        // The hands' force along the aim through face contact after the restart: impulse, time on, peak.
        const restartAt = r.impact.anchor?.at ?? Infinity;
        let late = { impulse: 0, on: 0, peak: 0, above: 0 };
        const pushForce = contactReference.pushForce.value;
        for (let i = 1; i < r.samples.length; i++) {
            const a = r.samples[i - 1] as ReadSample;
            const b = r.samples[i] as ReadSample;
            if (!face.some((c) => b.t > c.start && b.t <= c.end)) continue;
            impulse += a.hands * (b.t - a.t);
            if (a.t >= restartAt) {
                late = {
                    impulse: late.impulse + a.hands * (b.t - a.t),
                    on: late.on + (b.t - a.t),
                    peak: Math.max(late.peak, a.hands),
                    above: late.above + (a.hands > pushForce ? b.t - a.t : 0),
                };
            }
        }
        const faceTime = face.reduce((s, c) => s + (c.end - c.start), 0);
        console.log(
            `${roll.name}: U ${r.U.toFixed(2)} (Gugan ${roll.U}), w1/U ${(r.w1 / roll.U).toFixed(3)} ` +
                `(Gugan ${(roll.w1 / roll.U).toFixed(3)}), read at ${(1e3 * (r.time - t0)).toFixed(2)} ms; ` +
                `${face.length} face contacts, ${(1e3 * faceTime).toFixed(2)} ms on; hands' impulse ${impulse.toFixed(3)} N·s`,
        );
        const ms = (t: number | undefined): string => (t === undefined ? "none" : `${(1e3 * (t - t0)).toFixed(2)} ms`);
        const anchor = r.impact.anchor;
        console.log(
            `  departure ${ms(r.impact.departure)}; restart ${ms(anchor?.at)}` +
                (anchor === undefined ? "" : ` (rate ${anchor.rate.toFixed(2)})`) +
                `; hands after it on the face: peak ${late.peak.toFixed(1)} N, mean ` +
                `${late.on > 0 ? (late.impulse / late.on).toFixed(1) : "-"} N over ${(1e3 * late.on).toFixed(2)} ms, ` +
                `${(1e3 * late.above).toFixed(2)} ms above pushForce ${pushForce} N`,
        );
        for (const c of face) {
            const s = sampleAt(c.end);
            console.log(
                `  face ${(1e3 * (c.start - t0)).toFixed(2)}–${(1e3 * (c.end - t0)).toFixed(2)} ms: at its end ` +
                    `head ${(s.head / roll.U).toFixed(3)} U, w1 ${(s.w1 / roll.U).toFixed(3)} U, Ω1 ${(100 * s.roll1).toFixed(0)}%`,
            );
        }
    }
}

const RESTART_ROLLS = ["C10H", "C3H", "C10F", "C10P", "C25F", "C25P"];

/**
 * The restart confirmation design's discriminating run (§3.2): for each roll, the departure, the restart, the open
 * gaps between them, the face contacts after the restart, w₁/U against Gugan, and the head's speed at the departure
 * and at the restart; then the canonical rolls' ratios.
 */
async function restart(): Promise<void> {
    const { RESTART_HOLD } = await import("../src/engine/impact/integrate");
    const { playJudged, textBook, canonicalPower } = await import("../src/lab/play");
    console.log(`hold ${(1e3 * RESTART_HOLD).toFixed(2)} ms`);
    const world = openWorld(LAWN);
    for (const roll of ROLLS.filter((r) => RESTART_ROLLS.includes(r.name))) {
        const power = powerFor(roll.type, roll.U, world);
        if (power === null) continue;
        const { setup, contact } = playRoll(roll, power);
        if (setup === null) continue;
        const r = readOut(setup, world, {}, contact ?? undefined);
        const face = r.impact.timeline[faceKey(setup.striker)] ?? [];
        const t0 = face[0]?.start ?? 0;
        const ms = (t: number): string => (1e3 * (t - t0)).toFixed(2);
        const at = r.impact.anchor?.at;
        const headAt = (t: number): number => (r.samples.find((s) => s.t >= t) ?? { head: NaN }).head;
        const gaps: string[] = [];
        for (let i = 1; i < face.length; i++) {
            const a = face[i - 1];
            const b = face[i];
            if (a === undefined || b === undefined || (at !== undefined && a.end > at)) break;
            gaps.push((1e3 * (b.start - a.end)).toFixed(2));
        }
        const after = at === undefined ? [] : face.filter((c) => c.start > at);
        const departure = r.impact.departure;
        console.log(
            `${roll.name}: departure ${departure === undefined ? "none" : ms(departure)} ms, restart ` +
                `${at === undefined ? "none" : ms(at)} ms; gaps before it ${gaps.join(", ")} ms; ` +
                `w1/U ${(r.w1 / roll.U).toFixed(3)} (Gugan ${(roll.w1 / roll.U).toFixed(3)}); head ` +
                `${departure === undefined ? "?" : headAt(departure).toFixed(3)} m/s at departure, ` +
                `${at === undefined ? "?" : headAt(at).toFixed(3)} at restart`,
        );
        console.log(
            `  face after restart: ${after.map((c) => `${ms(c.start)}–${ms(c.end)}`).join(", ") || "none"}; ` +
                `last face end ${ms(face[face.length - 1]?.end ?? t0)} ms`,
        );
    }
    const ten = openWorld(10);
    for (const type of ["half-roll", "full-roll", "pass-roll"] as const) {
        const { sample } = playJudged(type, textBook(type), canonicalPower(type, ten), [10], "preset");
        console.log(`canonical ${type}: ratio ${sample.byLawn?.[10]?.ratio?.toFixed(3)}, class ${sample.klass}`);
    }
}

/**
 * Gugan 5's drive and stop played on the card's balls and on Gugan 5's (the Dawson Internationals, ball–ball e 0.772
 * by the maker's bounce test, README lines 676-690): the card's Table 1 balls are not the balls Gugan 5 filmed.
 */
async function gugan5Balls(): Promise<void> {
    const { gugan5 } = await import("./scorecard/jobs");
    const { defaultWorld } = await import("../src/engine/world");
    const { GUGAN5 } = await import("./filmedStrokes");
    const card = defaultWorld();
    const dawson = { ...card, ballBall: { ...card.ballBall, restitution: GUGAN5.ballRestitution } };
    console.log(`ball–ball e: card ${card.ballBall.restitution}, Gugan 5's ${GUGAN5.ballRestitution}`);
    for (const type of ["drive", "stop-ac"] as const) {
        const target = type === "drive" ? GUGAN5.drive : GUGAN5.stop;
        console.log(
            `${type}: card balls ${gugan5(type, card).toFixed(2)}, Gugan 5's balls ${gugan5(type, dawson).toFixed(2)} ` +
                `(Gugan 5 ${target.ratio} ± ${target.tolerance})`,
        );
    }
}

/**
 * Table 5's three stop shots as the card plays them (scorecard jobs' table5): the read's U, W, w₁ and v₂ against
 * Gugan's, Ω₁ at the read, every contact interval in the impact's timeline, and at each face contact's end the head's
 * speed, w₁ and the striker's ball's Ω₁; then Ω₁ through the first 10 ms.
 */
async function stops(): Promise<void> {
    const { FILMED_STROKES } = await import("./filmedStrokes");
    const { guganSetup } = await import("./ratioFit");
    const { opened } = await import("./openLawn");
    const world = openWorld(LAWN);
    for (const stroke of FILMED_STROKES.filter((s) => s.preset === "stop-ac")) {
        const setup = opened(guganSetup(stroke.preset, stroke.malletSpeed, stroke.gap, { world }));
        const r = readOut(setup, world);
        const face = r.impact.timeline[faceKey(setup.striker)] ?? [];
        const t0 = face[0]?.start ?? 0;
        const ms = (t: number): string => `${(1e3 * (t - t0)).toFixed(2)}`;
        const at = (t: number): ReadSample =>
            r.samples.find((s) => s.t >= t) ?? (r.samples[r.samples.length - 1] as ReadSample);
        const read = at(r.time);
        const g = stroke.malletSpeed;
        console.log(
            `${stroke.name}: U ${r.U.toFixed(2)} (Gugan ${g}); W/U ${(r.W / r.U).toFixed(3)} ` +
                `(${(stroke.malletAfter / g).toFixed(3)}), w1/U ${(r.w1 / r.U).toFixed(3)} ` +
                `(${(stroke.striker / g).toFixed(3)}), v2/U ${(r.v2 / r.U).toFixed(3)} ` +
                `(${(stroke.croqueted / g).toFixed(3)}); read at ${ms(r.time)} ms, Ω1 ${(100 * read.roll1).toFixed(0)}%` +
                (r.open ? " (open)" : ""),
        );
        for (const [key, intervals] of Object.entries(r.impact.timeline)) {
            const list = intervals.map((c) => `${ms(c.start)}–${ms(c.end)}`).join(", ");
            console.log(`  ${key}: ${list}`);
        }
        for (const c of face) {
            const s = at(c.end);
            console.log(
                `  face ends ${ms(c.end)} ms: head ${(s.head / g).toFixed(3)} U, w1 ${(s.w1 / g).toFixed(3)} U, ` +
                    `Ω1 ${(100 * s.roll1).toFixed(0)}%, hands ${s.hands.toFixed(1)} N`,
            );
        }
        const trace = [0.5, 1, 2, 3, 5, 7, 10].map((d) => {
            const s = at(t0 + d * 1e-3);
            return `${d} ms ${(100 * s.roll1).toFixed(0)}% w1 ${(s.w1 / g).toFixed(3)} head ${(s.head / g).toFixed(3)}`;
        });
        console.log(`  Ω1 through: ${trace.join(" | ")}`);
        for (const gap of [0, 1e-4, 2.5e-4, 5e-4, 1e-3]) {
            const s2 = opened(guganSetup(stroke.preset, stroke.malletSpeed, gap, { world }));
            const r2 = readOut(s2, world);
            const read2 = r2.samples.find((s) => s.t >= r2.time) ?? r2.samples[r2.samples.length - 1];
            console.log(
                `  gap ${(1e3 * gap).toFixed(2)} mm: W/U ${(r2.W / r2.U).toFixed(3)}, w1/U ${(r2.w1 / r2.U).toFixed(3)}, ` +
                    `v2/U ${(r2.v2 / r2.U).toFixed(3)}, w1/W ${(r2.w1 / r2.W).toFixed(3)} ` +
                    `(${(stroke.striker / stroke.malletAfter).toFixed(3)}), Ω1 ${(100 * (read2?.roll1 ?? NaN)).toFixed(0)}%`,
            );
        }
    }
}

/**
 * C25P's grip limit (and C25F and C10P beside it): the impact's grip-limit event, and through the impact each hand's
 * force, its magnitude against the grip's limit and its parts along the aim and up, with the face's contact and the
 * restart: where the hand reaches its limit and which way it pulls.
 */
async function grip(): Promise<void> {
    const { GRIP_LIMIT } = await import("../src/engine/impact/track");
    const { dot, length } = await import("../src/engine/math/vec3");
    const world = openWorld(LAWN);
    for (const roll of ROLLS.filter((r) => ["C10P", "C25F", "C25P"].includes(r.name))) {
        const power = powerFor(roll.type, roll.U, world);
        if (power === null) continue;
        const { setup, contact } = playRoll(roll, power);
        if (setup === null || contact === null) continue;
        const drive = contact.drive;
        if (drive.kind !== "track") continue;
        const aim = drive.arc.aim;
        const up = vec3(0, 0, 1);
        type Parts = readonly [number, number, number];
        const rows: { t: number; top: Parts; bottom: Parts }[] = [];
        const parts = (f: import("../src/engine/math/vec3").Vec3): Parts => [length(f), dot(f, aim), dot(f, up)];
        const probe: ImpactProbe = {
            step(s) {
                if (s.hand !== undefined) rows.push({ t: s.t, top: parts(s.hand.top), bottom: parts(s.hand.bottom) });
            },
        };
        const impact = simulateImpact(contact, setup.balls, world, { probe });
        const face = impact.timeline[faceKey(setup.striker)] ?? [];
        const t0 = face[0]?.start ?? 0;
        const ms = (t: number): string => (1e3 * (t - t0)).toFixed(2);
        const limits = impact.events.filter((e) => e.kind === "grip-limit");
        console.log(
            `${roll.name}: restart ${impact.anchor === undefined ? "none" : ms(impact.anchor.at)} ms; grip-limit ` +
                `${limits.map((e) => `${e.kind === "grip-limit" ? e.hand : ""} at ${ms(e.t)} ms`).join(", ") || "none"}` +
                `; face ${face.map((c) => `${ms(c.start)}–${ms(c.end)}`).join(", ")}`,
        );
        const first = rows[0];
        if (first === undefined) continue;
        for (const k of ["top", "bottom"] as const) {
            const p = rows.reduce((m, r) => (r[k][0] > m[k][0] ? r : m), first);
            console.log(
                `  ${k} peak |F| ${p[k][0].toFixed(0)} N (limit ${GRIP_LIMIT}) at ${ms(p.t)} ms: along aim ` +
                    `${p[k][1].toFixed(0)}, up ${p[k][2].toFixed(0)}`,
            );
        }
        for (const d of [0.5, 1, 2, 2.5, 3, 4, 5, 7, 10, 15]) {
            const r = rows.find((x) => x.t >= t0 + d * 1e-3);
            if (r === undefined) break;
            const f = (v: Parts): string => `${v[0].toFixed(0)} (aim ${v[1].toFixed(0)}, up ${v[2].toFixed(0)})`;
            console.log(`  ${d} ms: top ${f(r.top)}, bottom ${f(r.bottom)}`);
        }
    }
}

const mode = args[0];
if (mode === "read-delay") readDelay();
else if (mode === "read-distance") readDistance();
else if (mode === "hop") hop();
else if (mode === "bed") bed();
else if (mode === "oblique") oblique();
else if (mode === "lifts") await lifts();
else if (mode === "strike") strike();
else if (mode === "gugan5-balls") await gugan5Balls();
else if (mode === "restart") await restart();
else if (mode === "stops") await stops();
else if (mode === "grip") await grip();
else throw new Error("usage: gapProbe.ts read-delay | read-distance | hop | bed | strike | gugan5-balls [--set …]");
