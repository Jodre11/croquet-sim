/**
 * Impact probe (P2b.1 design §1: recorded, not gated). On the default world, with the sourced head and face
 * (reference/mallet.json, contact.json), reports:
 * - stiffness sensitivity: each stiffness swept across its reference bounds, and the handover;
 * - the stop-shot probe: whether the striker's ball clears the turf while it transfers its momentum, and where it
 *   meets the croqueted ball;
 * - the crush distance: the largest gap to an upright straight ahead that still raises 29.1.8, per head speed
 *   (C29.13.1 says 1–2 mm);
 * - face–ball gaps in single clean strikes (the P2b.1 fuzz strokes with blue alone);
 * - impact engine time per stroke and per step.
 * Run with `npx --yes tsx scripts/impactProbe.ts`; environment: REPEAT (timed runs per stroke, default 200). Not
 * part of the test suite; its output goes into the roadmap's outcomes sections.
 */
import { judgeFaults, type StrokeContext } from "../src/engine/faults";
import { IMPACT_DT } from "../src/engine/impact/integrate";
import { add, scale, vec3, type Vec3 } from "../src/engine/math/vec3";
import { simulateImpact } from "../src/engine/impact/simulateImpact";
import { solidCylinderInertia } from "../src/engine/impact/rigidBody";
import type { ContactState, FaceMaterial, MalletHead } from "../src/engine/impact/types";
import type { BallState, BallStates, Hoop, World } from "../src/engine/types";
import { defaultWorld, hoopHalfSpan, hoopLateral, uniformLawn } from "../src/engine/world";
import { contactReference, malletReference } from "../src/reference/index";
import { testWorld } from "../tests/engine/support/fixtures";
import { drive, FUZZ_SEED, randomStroke, recorder, strike } from "../tests/engine/support/impact";
import { rng } from "../tests/engine/support/rng";

// The project has no Node types; this script runs under tsx and reads only its environment.
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

const REPEAT = Number(process.env.REPEAT ?? "200");
const BASE = defaultWorld();
const R = BASE.ball.radius;
const radius = malletReference.headDiameter.value / 2;
const HEAD: MalletHead = {
    mass: malletReference.headMass.value,
    inertia: solidCylinderInertia(malletReference.headMass.value, malletReference.headLength.value, radius),
    length: malletReference.headLength.value,
    radius,
    socket: vec3(0, 0, radius),
};
const FACE: FaceMaterial = {
    restitution: malletReference.faceRestitution.value,
    friction: malletReference.faceFriction.value,
    contactTime: contactReference.faceBallContactTime.value,
};
const at = (x: number, y: number): BallState => ({
    position: vec3(x, y, R),
    velocity: vec3(0, 0, 0),
    angularVelocity: vec3(0, 0, 0),
});
const BLUE = at(10, 10);
const RED = at(10 + 2 * R, 10);

interface Stroke {
    readonly name: string;
    readonly balls: BallStates;
    contact(face: FaceMaterial): ContactState;
}

/** A checked stroke: the hands pull back with 100 N along the travel for 3 ms, plus the head's weight. */
const checked = (t: Vec3): ReturnType<typeof drive> => drive(vec3(-100 * t.x, -100 * t.y, -100 * t.z), 3e-3, HEAD);

const STROKES: readonly Stroke[] = [
    {
        name: "centre 3 m/s",
        balls: { blue: BLUE },
        contact: (face) => strike(BLUE.position, { head: HEAD, face, speed: 3 }),
    },
    {
        name: "croquet 3 m/s",
        balls: { blue: BLUE, red: RED },
        contact: (face) => strike(BLUE.position, { head: HEAD, face, speed: 3 }),
    },
    {
        name: "descending 10°",
        balls: { blue: BLUE },
        contact: (face) => strike(BLUE.position, { head: HEAD, face, speed: 3, descent: 0.1745, pitch: 0.1745 }),
    },
    {
        name: "stop shot",
        balls: { blue: BLUE, red: RED },
        contact: (face) => strike(BLUE.position, { head: HEAD, face, speed: 3, descent: 0.0524, drive: checked }),
    },
];

function withTurf(stiffness: number): World {
    const surface = BASE.lawn.surfaceAt(vec3(0, 0, 0));
    return { ...BASE, lawn: uniformLawn(BASE.lawn.width, BASE.lawn.length, { ...surface, turfStiffness: stiffness }) };
}

const fmt = (x: number, digits = 4): string => x.toFixed(digits);

function report(label: string, stroke: Stroke, face: FaceMaterial, world: World): void {
    const r = simulateImpact(stroke.contact(face), stroke.balls, world);
    const b = r.handover.blue as BallState;
    const red = r.handover.red;
    const flags = r.events.filter((e) => e.kind !== "turf-lift").map((e) => e.kind);
    console.log(
        `${label.padEnd(28)} ${stroke.name.padEnd(16)} blue v=(${fmt(b.velocity.x)}, ${fmt(b.velocity.z)}) ` +
            `ωy=${fmt(b.angularVelocity.y, 2)} ${red ? `red vx=${fmt(red.velocity.x)} ` : ""}` +
            `lift=${r.events.some((e) => e.kind === "turf-lift")} ${fmt(r.duration * 1e3, 3)} ms ${r.steps} steps` +
            `${flags.length > 0 ? ` flags=${flags.join(",")}` : ""}`,
    );
}

function sweep(): void {
    console.log("== Stiffness sensitivity (each swept across its reference bounds) ==");
    const [flo, fhi] = contactReference.faceBallContactTime.bounds as [number, number];
    const [blo, bhi] = contactReference.ballBallContactTime.bounds as [number, number];
    const [tlo, thi] = contactReference.ballTurfStiffness.bounds as [number, number];
    for (const stroke of STROKES) {
        report("reference", stroke, FACE, BASE);
        for (const T of [flo, fhi]) {
            report(`face contact ${fmt(T * 1e3, 2)} ms`, stroke, { ...FACE, contactTime: T }, BASE);
        }
        for (const T of [blo, bhi]) {
            report(`ball–ball contact ${fmt(T * 1e3, 2)} ms`, stroke, FACE, { ...BASE, ballBallContactTime: T });
        }
        for (const k of [tlo, thi]) {
            report(`turf ${k.toExponential(2)} N/m`, stroke, FACE, withTurf(k));
        }
    }
}

function stopShot(): void {
    console.log("== Stop-shot probe ==");
    const stroke = STROKES[3] as Stroke;
    const probe = recorder();
    const r = simulateImpact(stroke.contact(FACE), stroke.balls, BASE, { probe });
    let impulse = 0;
    let clear = 0;
    let height = 0;
    let minLift = Infinity;
    let maxLift = -Infinity;
    for (const [i, s] of probe.snapshots.entries()) {
        const c = s.contacts.find((x) => x.key === "blue/red" && x.normalForce > 0);
        if (!c) {
            continue;
        }
        const dt = s.t - (i > 0 ? (probe.snapshots[i - 1]?.t as number) : 0);
        const blue = s.balls[0] as BallState;
        const lift = blue.position.z - R;
        minLift = Math.min(minLift, lift);
        maxLift = Math.max(maxLift, lift);
        impulse += c.normalForce * dt;
        if (lift >= 0) {
            clear += c.normalForce * dt;
        }
        // The contact point on red is c_red − R·n, so it lies −R·n_z above red's equator.
        height += -R * c.normal.z * c.normalForce * dt;
    }
    console.log(
        `blue z − R during transfer: ${fmt(minLift * 1e3, 3)} … ${fmt(maxLift * 1e3, 3)} mm; ` +
            `impulse share with blue clear of the turf ${fmt((100 * clear) / impulse, 1)} %; ` +
            `mean contact height above red's equator ${fmt((height / impulse) * 1e3, 3)} mm`,
    );
    console.log(`events: ${r.events.map((e) => `${e.kind}@${fmt(e.t * 1e3, 3)}ms`).join(", ")}`);
}

function timing(): void {
    console.log(`== Impact engine time per stroke (${REPEAT} runs after 20 warm-up) ==`);
    for (const stroke of STROKES) {
        const contact = stroke.contact(FACE);
        for (let i = 0; i < 20; i++) {
            simulateImpact(contact, stroke.balls, BASE);
        }
        const times: number[] = [];
        let steps = 0;
        for (let i = 0; i < REPEAT; i++) {
            const start = performance.now();
            steps = simulateImpact(contact, stroke.balls, BASE).steps;
            times.push(performance.now() - start);
        }
        times.sort((a, b) => a - b);
        const q = (p: number): number => times[Math.min(times.length - 1, Math.floor(p * times.length))] as number;
        console.log(
            `${stroke.name.padEnd(16)} ${steps} steps: median ${fmt(q(0.5), 3)} ms ` +
                `(${fmt((q(0.5) * 1e3) / steps, 3)} µs/step), p99 ${fmt(q(0.99), 3)} ms, max ${fmt(q(1), 3)} ms`,
        );
    }
}

const HAMPERED: StrokeContext = {
    striker: "blue",
    kind: "single-ball",
    live: [],
    hampered: true,
    jumpAttempt: false,
    group: false,
};

/** The default world with hoop 1 moved so that its upright "1/a" stands at (x, y). */
function withUprightAt(x: number, y: number): World {
    const hoop = BASE.hoops[0] as Hoop;
    const centre = add(vec3(x, y, 0), scale(hoopLateral(hoop), -hoopHalfSpan(hoop)));
    return { ...BASE, hoops: [{ ...hoop, centre }] };
}

function crushes(gap: number, speed: number): boolean {
    const upright = (BASE.hoops[0] as Hoop).uprightRadius;
    const world = withUprightAt(BLUE.position.x + R + upright + gap, BLUE.position.y);
    const r = simulateImpact(strike(BLUE.position, { head: HEAD, face: FACE, speed }), { blue: BLUE }, world);
    return judgeFaults(HAMPERED, r).findings.some((f) => f.law === "29.1.8");
}

function crushDistance(): void {
    console.log("== Crush distance (largest gap to an upright straight ahead raising 29.1.8; C29.13.1: 1–2 mm) ==");
    for (const speed of [1, 2, 3, 4, 6]) {
        if (!crushes(0, speed)) {
            console.log(`${speed} m/s: no crush even touching`);
            continue;
        }
        if (crushes(0.02, speed)) {
            console.log(`${speed} m/s: a crush at 20 mm`);
            continue;
        }
        let lo = 0;
        let hi = 0.02;
        for (let i = 0; i < 30; i++) {
            const mid = (lo + hi) / 2;
            if (crushes(mid, speed)) {
                lo = mid;
            } else {
                hi = mid;
            }
        }
        console.log(`${speed} m/s: ${fmt(lo * 1e3, 3)} mm`);
    }
}

function faceGaps(): void {
    console.log("== Face–ball gaps in single clean strikes (2000 P2b.1 fuzz strokes, blue alone) ==");
    const world = testWorld();
    const random = rng(FUZZ_SEED);
    let strokes = 0;
    let doubles = 0;
    let oneStep = 0;
    let shortest = Infinity;
    for (let n = 0; n < 2000; n++) {
        const { contact, balls } = randomStroke(random, world);
        if (balls.red) {
            continue;
        }
        strokes++;
        const faces = simulateImpact(contact, balls, world).timeline["face/blue"] ?? [];
        if (faces.length > 1) {
            doubles++;
        }
        for (let i = 1; i < faces.length; i++) {
            const gap = (faces[i]?.start as number) - (faces[i - 1]?.end as number);
            shortest = Math.min(shortest, gap);
            if (gap < 1.5 * IMPACT_DT) {
                oneStep++;
            }
        }
    }
    console.log(
        `${strokes} strokes, ${doubles} with more than one face interval; shortest gap ` +
            `${Number.isFinite(shortest) ? `${fmt(shortest * 1e6, 1)} µs` : "none"}; one-step gaps: ${oneStep}`,
    );
}

sweep();
stopShot();
crushDistance();
faceGaps();
timing();
