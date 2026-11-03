/**
 * The arms' assist's fit (P2b.2b.2c.3b.2 design §4; docs/superpowers/plans/2026-11-03-p2b2b2c3b2-firmness.md Task 2),
 * as the shaft's effort was fitted (P2b.2b.2c.1 design §4.4): each held roll from its body-limited top, the head's
 * rise a hair inside headRiseLimit, at intensity 1 meets the ball at CEILING, its hands at contact moving at κ·v_max
 * (κ the body's effortShare). For a tempo T₁ at intensity 1 that gives v_max = 2·d/(κ·T₁) and F_0 = M·2·d·(1/T₁² −
 * 1/T_s²)/(1 − κ), d = (1 − s)·h·cot φ the hands' travel along aim, T_s the slow tempo and M the swung mass (head,
 * shaft and arm mass); T₁ is bisected until the planned contact speed is CEILING. The pair kept is the roll's whose F_0
 * is largest, the weakest, as single-ball set τ_0. Writes body.assistForce and body.assistSpeed into
 * reference/swing.json with their derivation, and prints every roll's contact speed at intensity 0 and 1 with the pair.
 * Run with `nice -n 20 npx --yes tsx scripts/assistFit.ts`.
 */
import { planStroke } from "../src/engine/swing/buildContact";
import { defaultProfile } from "../src/engine/swing/profile";
import type { ShotSetup, SwingAssist } from "../src/engine/swing/types";
import { defaultWorld } from "../src/engine/world";
import { swingBodyReference } from "../src/reference/index";
import { canonicalSetup } from "../tests/engine/support/shot";
import { CEILING } from "./effortFit";

/** The file system calls the fit uses (tsx runs under Node; the project has no Node types), as pathTrace.ts's. */
interface Files {
    readFileSync(path: string, encoding: "utf8"): string;
    writeFileSync(path: string, data: string): void;
}

async function files(): Promise<Files> {
    const specifier = "node:fs";
    return (await import(/* @vite-ignore */ specifier)) as Files;
}

const ROLLS = ["half-roll", "full-roll", "pass-roll"] as const;
type Roll = (typeof ROLLS)[number];

/** Numerical, not physical: the relative margin the top keeps inside headRiseLimit, as h_body's does. */
const TOP_MARGIN = 1e-9;

/** Numerical, not physical: the halvings of T₁'s bracket, to a double's resolution on a tempo of about 0.5 s. */
const BISECTIONS = 60;

const WORLD = defaultWorld();
const KAPPA = swingBodyReference.effortShare.value;
const TOP = defaultProfile.body.headRiseLimit * (1 - TOP_MARGIN);
const MASS = defaultProfile.mallet.headMass + defaultProfile.mallet.shaftMass + defaultProfile.body.armMass;

/** `roll`'s canonical setup from its body-limited top at `intensity`, with the arms' assist `assist`. */
function setupOf(roll: Roll, intensity: number, assist: SwingAssist): ShotSetup {
    return canonicalSetup(roll, { stroke: { backswing: TOP, intensity }, body: { assist } });
}

/** The assist that makes `roll`'s tempo at intensity 1 `t1` (s), its hands then at κ·v_max. */
function assistAt(roll: Roll, t1: number): SwingAssist {
    const shape = defaultProfile.shape[roll];
    const slow = (shape.handTempo as { readonly slow: number }).slow;
    const travel = ((1 - shape.pendulumShare) * TOP) / Math.tan(shape.handAngle);
    return {
        force: (MASS * 2 * travel * (1 / (t1 * t1) - 1 / (slow * slow))) / (1 - KAPPA),
        speed: (2 * travel) / (KAPPA * t1),
    };
}

/** `roll`'s pair: T₁ bisected on (0, T_s) until its planned contact speed at intensity 1 is CEILING. */
function fitRoll(roll: Roll): SwingAssist {
    const slow = (defaultProfile.shape[roll].handTempo as { readonly slow: number }).slow;
    let lo = slow * 1e-3;
    let hi = slow;
    for (let k = 0; k < BISECTIONS; k++) {
        const mid = 0.5 * (lo + hi);
        if (planStroke(setupOf(roll, 1, assistAt(roll, mid)), WORLD).contactSpeed > CEILING) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    return assistAt(roll, lo);
}

const pairs = ROLLS.map((roll) => ({ roll, assist: fitRoll(roll) }));
for (const { roll, assist } of pairs) {
    console.error(`${roll}: F_0 ${assist.force} N, v_max ${assist.speed} m/s`);
}
const weakest = pairs.reduce((a, b) => (b.assist.force > a.assist.force ? b : a));
const { force, speed } = weakest.assist;
for (const roll of ROLLS) {
    const at = (intensity: number): number =>
        planStroke(setupOf(roll, intensity, { force, speed }), WORLD).contactSpeed;
    console.error(`${roll} at its top (${TOP} m): ${at(0)} m/s at intensity 0, ${at(1)} m/s at 1`);
}

const derivation =
    `The weakest held roll, the ${weakest.roll}, from its body-limited top (headRiseLimit, ` +
    `${defaultProfile.body.headRiseLimit} m) at intensity 1 meets the ball at the ceiling ${CEILING} m/s (effortFit's, ` +
    `P2b.2b.2c.1 design §4.3) with its hands at κ·v_max at contact, κ = ${KAPPA} (effortShare), as τ_0 and ω_max were ` +
    "fitted on single-ball. No published figure fits a two-handed croquet swing; a labelled placeholder.";
const path = "reference/swing.json";
const fs = await files();
const json = JSON.parse(fs.readFileSync(path, "utf8")) as { body: Record<string, Record<string, unknown>> };
json.body.assistForce = {
    ...json.body.assistForce,
    value: force,
    note: `The arms' isometric swing force F_0 along the hands' path (firmness design §4). ${derivation}`,
};
json.body.assistSpeed = {
    ...json.body.assistSpeed,
    value: speed,
    note: `The hands' speed v_max at which the arms add no more (firmness design §4). ${derivation}`,
};
fs.writeFileSync(path, `${JSON.stringify(json, null, 4)}\n`);
console.error(`wrote ${path}: assistForce ${force} N, assistSpeed ${speed} m/s`);
