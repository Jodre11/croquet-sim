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
        const off = after.find((p) => p.z > 1e-4);
        const airborne = after.filter((p) => p.z > 1e-4).length / Math.max(1, after.length);
        console.log(
            `${roll.name.padEnd(5)} ${(1e3 * peak.z).toFixed(2).padStart(7)} ${(1e3 * (peak.t - start)).toFixed(1).padStart(6)} | ` +
                `${off === undefined ? "never" : (1e3 * (off.t - start)).toFixed(1).padStart(6)} | ` +
                `${(100 * airborne).toFixed(0).padStart(3)}% | striker depth ${(1e3 * z1).toFixed(2)} mm, ` +
                `normal tilt ${tilt.toFixed(2)}°, ball 2 vz at contact end ${(at?.vz ?? NaN).toFixed(3)} m/s`,
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
        for (let i = 1; i < r.samples.length; i++) {
            const a = r.samples[i - 1] as ReadSample;
            const b = r.samples[i] as ReadSample;
            if (face.some((c) => b.t > c.start && b.t <= c.end)) impulse += a.hands * (b.t - a.t);
        }
        const faceTime = face.reduce((s, c) => s + (c.end - c.start), 0);
        console.log(
            `${roll.name}: U ${r.U.toFixed(2)} (Gugan ${roll.U}), w1/U ${(r.w1 / roll.U).toFixed(3)} ` +
                `(Gugan ${(roll.w1 / roll.U).toFixed(3)}), read at ${(1e3 * (r.time - t0)).toFixed(2)} ms; ` +
                `${face.length} face contacts, ${(1e3 * faceTime).toFixed(2)} ms on; hands' impulse ${impulse.toFixed(3)} N·s`,
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

const mode = args[0];
if (mode === "read-delay") readDelay();
else if (mode === "read-distance") readDistance();
else if (mode === "hop") hop();
else if (mode === "bed") bed();
else if (mode === "strike") strike();
else throw new Error("usage: gapProbe.ts read-delay | read-distance | hop | bed | strike [--set name=value …]");
