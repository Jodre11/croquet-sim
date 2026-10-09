/**
 * The turf bed's fit (P2b.2b.2b.2a design §4.4) and its records. Fits the bed modulus k_w and recovery time τ_r to
 * Gugan 4 §7.1 and Table 4(b), roll A4R: a free ball meeting a fresh bed vertically at 5 m/s leaves at 2.5 m/s (e 0.5)
 * after a maximum penetration of 7.2 mm. Then it prints:
 * - the held-out penetrations of A2R and A3R (§4.5);
 * - e from 0.1 to 6 m/s against Penner's golf fit;
 * - the bounce counts of drops from 0.05, 0.1 and 0.3 m (the low-speed gate);
 * - the explicit step's margin against the fitted bed's damping (§4.6);
 * - the grid check at 1 mm.
 * Run with `npx --yes tsx scripts/turfFit.ts`. Not part of the test suite.
 */
import { land } from "../src/engine/impact/landing";
import { BED_CELL } from "../src/engine/impact/turfBed";
import type { BedLaw } from "../src/engine/impact/types";
import { vec3 } from "../src/engine/math/vec3";
import { ballReference, frictionReference } from "../src/reference/index";
import { STANDARD_GRAVITY } from "../src/engine/world";

const BALL = { radius: ballReference.diameter.value / 2, mass: ballReference.mass.value };
const G = STANDARD_GRAVITY;
const MU = frictionReference.ballTurfSliding.value;
const TARGET_E = 0.5;
const TARGET_DEPTH = 7.2e-3;
const SPEED = 5;
const TOLERANCE = 1e-4;

const lawOf = (modulus: number, recovery: number, cell = BED_CELL): BedLaw => ({
    modulus,
    recovery,
    friction: MU,
    cell,
});

/** A free vertical impact at `speed` on a fresh bed: its e (rebound over impact speed) and its peak depth. */
function impact(law: BedLaw, speed: number): { e: number; depth: number; duration: number } {
    const l = land(
        {
            position: vec3(0.0007, 0.0011, BALL.radius),
            velocity: vec3(0, 0, 0 - speed),
            angularVelocity: vec3(0, 0, 0),
        },
        BALL,
        G,
        law,
    );
    return { e: l.outcome === "left" ? l.state.velocity.z / speed : 0, depth: l.peakDepth, duration: l.duration };
}

/** The modulus whose peak depth at SPEED is TARGET_DEPTH for recovery τ: bisection in ln k_w (depth falls with k_w). */
function modulusFor(recovery: number): number {
    let lo = 1e7;
    let hi = 1e10;
    for (let n = 0; n < 60; n++) {
        const mid = Math.sqrt(lo * hi);
        if (impact(lawOf(mid, recovery), SPEED).depth > TARGET_DEPTH) {
            lo = mid;
        } else {
            hi = mid;
        }
        if (hi / lo - 1 < 1e-7) {
            break;
        }
    }
    return Math.sqrt(lo * hi);
}

/** τ_r at which e at SPEED is TARGET_E, k_w re-solved at each trial: bisection in ln τ (e falls as τ grows). */
function fit(): { modulus: number; recovery: number } {
    let lo = 1e-5;
    let hi = 1e-1;
    for (let n = 0; n < 60; n++) {
        const mid = Math.sqrt(lo * hi);
        const e = impact(lawOf(modulusFor(mid), mid), SPEED).e;
        if (e > TARGET_E) {
            lo = mid;
        } else {
            hi = mid;
        }
        if (hi / lo - 1 < 1e-7) {
            break;
        }
    }
    const recovery = Math.sqrt(lo * hi);
    return { modulus: modulusFor(recovery), recovery };
}

/** Landings of a ball dropped from `height` until it stays on the turf (no air, no horizontal motion). */
function bounces(law: BedLaw, height: number): number {
    let speed = Math.sqrt(2 * G * height);
    let count = 0;
    for (;;) {
        count++;
        const l = land(
            {
                position: vec3(0.0007, 0.0011, BALL.radius),
                velocity: vec3(0, 0, 0 - speed),
                angularVelocity: vec3(0, 0, 0),
            },
            BALL,
            G,
            law,
        );
        if (l.outcome !== "left") {
            return count;
        }
        speed = l.state.velocity.z;
    }
}

const fitted = fit();
const law = lawOf(fitted.modulus, fitted.recovery);
const check = impact(law, SPEED);
console.log(`== Fit (A4R: e ${TARGET_E} and ${TARGET_DEPTH * 1e3} mm at ${SPEED} m/s) ==`);
console.log(`bedModulus ${fitted.modulus.toPrecision(6)} N/m³, bedRecovery ${fitted.recovery.toPrecision(6)} s`);
console.log(
    `check: e ${check.e.toFixed(6)} (rel ${Math.abs(check.e / TARGET_E - 1).toExponential(2)}), ` +
        `depth ${(check.depth * 1e3).toFixed(4)} mm ` +
        `(rel ${Math.abs(check.depth / TARGET_DEPTH - 1).toExponential(2)}), ` +
        `contact ${(check.duration * 1e3).toFixed(3)} ms`,
);
const ok = Math.abs(check.e / TARGET_E - 1) <= TOLERANCE && Math.abs(check.depth / TARGET_DEPTH - 1) <= TOLERANCE;
console.log(`within ${TOLERANCE} relative on both: ${ok}`);

console.log("== Held out: A2R and A3R (Gugan 4 Table 4(b): 4.0 and 5.0 mm) ==");
for (const [name, up] of [
    ["A2R", 1.52],
    ["A3R", 1.76],
] as const) {
    const r = impact(law, up / TARGET_E);
    console.log(
        `${name} at ${(up / TARGET_E).toFixed(2)} m/s: depth ${(r.depth * 1e3).toFixed(2)} mm, e ${r.e.toFixed(3)}`,
    );
}

console.log("== e against impact speed (Penner's golf fit e = 0.510 − 0.0375v + 0.000903v², an analogue) ==");
for (const v of [0.1, 0.2, 0.3, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6]) {
    const r = impact(law, v);
    const penner = 0.51 - 0.0375 * v + 0.000903 * v * v;
    console.log(
        `${v.toFixed(2)} m/s: e ${r.e.toFixed(4)}, depth ${(r.depth * 1e3).toFixed(3)} mm, ` +
            `contact ${(r.duration * 1e3).toFixed(3)} ms; Penner ${penner.toFixed(3)}`,
    );
}

console.log("== Low-speed gate: landings until the ball stays on the turf ==");
for (const h of [0.05, 0.1, 0.3]) {
    console.log(`drop ${h} m (${Math.sqrt(2 * G * h).toFixed(3)} m/s): ${bounces(law, h)} landings`);
}

console.log("== Stability (§4.6): the bed's damping at A4R's footprint against the 5 µs step ==");
const footprint = Math.PI * 2 * BALL.radius * TARGET_DEPTH;
const damping = fitted.modulus * fitted.recovery * footprint;
console.log(
    `c ≈ ${damping.toPrecision(4)} N·s/m, 2m/c ${(((2 * BALL.mass) / damping) * 1e3).toFixed(3)} ms, ` +
        `c·dt/m ${((damping * 5e-6) / BALL.mass).toExponential(3)}`,
);

console.log("== Grid convergence (§5.1): h = 1 mm against 2 mm ==");
for (const v of [2, 5, 6]) {
    const a = impact(law, v);
    const b = impact(lawOf(fitted.modulus, fitted.recovery, 1e-3), v);
    console.log(
        `${v} m/s: e ${a.e.toFixed(4)} / ${b.e.toFixed(4)} (rel ${Math.abs(b.e / a.e - 1).toExponential(2)}), ` +
            `depth ${(a.depth * 1e3).toFixed(3)} / ${(b.depth * 1e3).toFixed(3)} mm`,
    );
}
