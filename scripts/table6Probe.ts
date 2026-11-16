/**
 * Gugan 4 Table 6's nine filmed rolls against the model (roll launch design §3.3): each roll's text book played at the
 * power whose planned head speed is Gugan's U, on the 13 s lawn (his court, speed-dependent lawn design §5.1), at the
 * preset hold. The striker's ball is read at readTimeOf's instant (readOut), the croqueted ball READ_DELAY after the
 * balls part (amendment 4), beside Gugan's row; the probe prints the face's
 * and the balls' contacts, the hands' peak force along aim after the strike, and the balls' travels from the play.
 * `--ball-friction μ` replaces the world's ball–ball friction in the read (the travels keep the reference's). `--fit`
 * instead bisects the ball–ball friction at which C10H's croqueted ball reads Gugan's Ω₂ (roll launch design §3.2).
 * `--face-fit` bisects the face's friction at which C3F's striker's ball reads Gugan's Ω₁ (amendment 8, §3.1f). Not
 * part of the engine. Run with
 * `nice -n 10 npx --no-install tsx scripts/table6Probe.ts [--ball-friction μ | --fit | --face-fit]`.
 */
import { ballPairKey, faceKey } from "../src/engine/impact/contacts";
import type { ContactInterval, ContactState } from "../src/engine/impact/types";
import { length, sub } from "../src/engine/math/vec3";
import type { ShotSetup } from "../src/engine/swing/types";
import type { World } from "../src/engine/types";
import { malletReference } from "../src/reference/index";
import { openWorld } from "./openLawn";
import { READ_DELAY, readOut, type ReadSample } from "./ratioFit";
import { croquetedRead, LAWN, playRoll, powerFor, ROLLS, type GuganRoll } from "./table6";

declare const process: { readonly argv: readonly string[] };

const PEAK_UNTIL = 25e-3;

const f = (x: number, d = 2): string => (Number.isFinite(x) ? x.toFixed(d) : "-");
const ms = (intervals: readonly ContactInterval[]): string =>
    intervals.length === 0 ? "none" : intervals.map((c) => `${f(c.start * 1e3)}–${f(c.end * 1e3)}`).join(", ");

/** The fit's tolerance on μ (roll launch plan Task 3). */
const FIT_STEP = 0.005;

/**
 * Bisects the ball–ball friction at which C10H's croqueted ball reads Gugan's Ω₂ at readTimeOf's instant, between the
 * reference's bounds; prints both ends and stops if his Ω₂ is not between them (roll launch design §3.2).
 */
function fit(base: World): void {
    const roll = ROLLS.find((r) => r.name === "C10H") as GuganRoll;
    const power = powerFor(roll.type, roll.U, base) as number;
    const { setup, contact } = playRoll(roll, power);
    if (setup === null) throw new Error("C10H is not played");
    const target = roll.o2 / 100;
    const read = (mu: number): { readonly o2: number; readonly v2: number } => {
        const world = { ...base, ballBall: { ...base.ballBall, friction: mu } };
        const r = readOut(setup, world, {}, contact ?? undefined);
        const { at } = croquetedRead(r, setup);
        return { o2: at.roll2, v2: at.v2 / roll.U };
    };
    const line = (mu: number, x: { readonly o2: number; readonly v2: number }): string =>
        `μ ${f(mu, 3)} Ω2 ${f(100 * x.o2, 1)}/${roll.o2} v2/U ${f(x.v2)}/${f(roll.v2 / roll.U)}`;
    let lo = 0.06;
    let hi = 0.5;
    const atLo = read(lo);
    const atHi = read(hi);
    console.log(`C10H U ${roll.U} p ${f(power, 3)}; fit ball–ball friction to Ω2 ${roll.o2}`);
    console.log(`    ${line(lo, atLo)}
    ${line(hi, atHi)}`);
    if ((atLo.o2 - target) * (atHi.o2 - target) > 0) {
        console.log("    Gugan's Ω2 is not between the bounds' reads: no fit");
        return;
    }
    const below = atLo.o2 < target;
    while (hi - lo > FIT_STEP) {
        const m = (lo + hi) / 2;
        if (read(m).o2 < target === below) lo = m;
        else hi = m;
    }
    const mu = Math.round((lo + hi) / 2 / FIT_STEP) * FIT_STEP;
    console.log(`    fit ${line(mu, read(mu))}`);
}

/** The face-friction fit's tolerance (roll launch design §3.1f, amendment 8). */
const FACE_FIT_STEP = 0.01;

/**
 * Bisects the face's friction at which C3F's striker's ball reads Gugan's Ω₁ at readTimeOf's instant, between the
 * reference's bounds, after a scan of them; prints both ends and stops if his Ω₁ is not between them (amendment 8).
 */
function fitFace(base: World): void {
    const roll = ROLLS.find((r) => r.name === "C3F") as GuganRoll;
    const power = powerFor(roll.type, roll.U, base) as number;
    const { setup, contact } = playRoll(roll, power);
    if (setup === null || contact === null) throw new Error("C3F is not played");
    const played: ContactState = contact;
    const target = roll.o1 / 100;
    const read = (mu: number): { readonly o1: number; readonly w1: number } => {
        const r = readOut(setup, base, {}, { ...played, face: { ...played.face, friction: mu } });
        const at = r.samples.find((s) => s.t >= r.time) ?? (r.samples[r.samples.length - 1] as ReadSample);
        return { o1: at.roll1, w1: r.w1 / roll.U };
    };
    const line = (mu: number, x: { readonly o1: number; readonly w1: number }): string =>
        `μ ${f(mu, 3)} Ω1 ${f(100 * x.o1, 1)}/${roll.o1} w1/U ${f(x.w1)}/${f(roll.w1 / roll.U)}`;
    const [lo0, hi0] = malletReference.faceFriction.bounds as readonly [number, number];
    console.log(`C3F U ${roll.U} p ${f(power, 3)}; fit the face's friction to Ω1 ${roll.o1}`);
    for (let mu = lo0; mu <= hi0 + 1e-9; mu += 0.05) console.log(`    scan ${line(mu, read(mu))}`);
    let lo = lo0;
    let hi = hi0;
    const atLo = read(lo);
    const atHi = read(hi);
    if ((atLo.o1 - target) * (atHi.o1 - target) > 0) {
        console.log("    Gugan's Ω1 is not between the bounds' reads: no fit");
        return;
    }
    const below = atLo.o1 < target;
    while (hi - lo > FACE_FIT_STEP) {
        const m = (lo + hi) / 2;
        if (read(m).o1 < target === below) lo = m;
        else hi = m;
    }
    const mu = Math.round((lo + hi) / 2 / FACE_FIT_STEP) * FACE_FIT_STEP;
    console.log(`    fit ${line(mu, read(mu))}`);
}

const at = process.argv.indexOf("--ball-friction");
const friction = at < 0 ? null : Number(process.argv[at + 1]);
const base = openWorld(LAWN);
const world: World = friction === null ? base : { ...base, ballBall: { ...base.ballBall, friction } };
const faceFitting = process.argv.includes("--face-fit");
const fitting = process.argv.includes("--fit") || faceFitting;
if (faceFitting) fitFace(base);
else if (fitting) fit(base);
else
    console.log(
        `Table 6 on the ${LAWN} s lawn, preset hold; ball–ball friction ${world.ballBall.friction}` +
            `${friction === null ? "" : " (overridden in the read; travels at the reference's)"}. Model / Gugan.`,
    );
for (const roll of fitting ? [] : ROLLS) {
    const power = powerFor(roll.type, roll.U, world);
    if (power === null) {
        console.log(`${roll.name} U ${roll.U}: beyond the model's top power`);
        continue;
    }
    const { sample, setup: played, hand, contact } = playRoll(roll, power);
    const klass = `${sample.klass ?? "clean"}${sample.reason == null ? "" : ` (${sample.reason})`}`;
    if (played === null) {
        console.log(`${roll.name} U ${roll.U} p ${f(power, 3)}: ${klass}, not played`);
        continue;
    }
    const setup: ShotSetup = played;
    const r = readOut(setup, world, {}, contact ?? undefined);
    const croqueted = setup.croqueted as NonNullable<ShotSetup["croqueted"]>;
    const read = r.samples.find((s) => s.t >= r.time) ?? r.samples[r.samples.length - 1];
    const face = r.impact.timeline[faceKey(setup.striker)] ?? [];
    const faceOther = r.impact.timeline[faceKey(croqueted)] ?? [];
    const balls = r.impact.timeline[ballPairKey(setup.striker, croqueted)] ?? [];
    const from = (face[0]?.end ?? 0) + READ_DELAY;
    const after = r.samples.filter((s) => s.t >= from && s.t <= PEAK_UNTIL);
    const peak = after.reduce((m, s) => Math.max(m, s.hands), -Infinity);
    const lawn = sample.byLawn?.[LAWN];
    const l1 = lawn?.range ?? NaN;
    const ratio = lawn?.ratio ?? NaN;
    // The read re-plays the played setup; on the reference world it must be the play's own impact.
    const ball = (h: typeof r.impact.handover) => h[setup.striker]?.velocity;
    const playedBall = hand === null ? undefined : ball(hand);
    const readBall = ball(r.impact.handover);
    const drift = playedBall === undefined || readBall === undefined ? NaN : length(sub(readBall, playedBall));
    const two = croquetedRead(r, setup);
    console.log(
        `${roll.name} U ${roll.U} p ${f(power, 3)} ${klass}; read at ${f(r.time * 1e3)} ms` +
            `${r.open ? " (open)" : ""}; read vs play ${f(drift * 1e3, 3)} mm/s\n` +
            `    w1/U ${f(r.w1 / roll.U)}/${f(roll.w1 / roll.U)} Ω1 ${f(100 * (read?.roll1 ?? NaN), 0)}/${roll.o1}` +
            ` v2/U ${f(two.at.v2 / roll.U)}/${f(roll.v2 / roll.U)} Ω2 ${f(100 * two.at.roll2, 0)}/${roll.o2}` +
            ` (ball 2 at ${f(two.t * 1e3)} ms)\n` +
            `    face–striker ${ms(face)} ms; face–croqueted ${ms(faceOther)} ms; ball–ball ${ms(balls)} ms\n` +
            `    hands' peak along aim ${f(from * 1e3)}–${f(PEAK_UNTIL * 1e3, 0)} ms ${f(peak, 1)} N\n` +
            `    L1 ${f(l1)}/${roll.l1} L2 ${f(l1 * ratio)}/${roll.l2} L2/L1 ${f(ratio)}/${f(roll.l2 / roll.l1)}`,
    );
}
