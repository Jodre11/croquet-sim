/**
 * Impact probe (P2b.1 design §1: recorded, not gated). On the default world, with the sourced head and face
 * (reference/mallet.json, contact.json), reports:
 * - stiffness sensitivity: each stiffness swept across its reference bounds, and the handover;
 * - the stop-shot probe: whether the striker's ball clears the turf while it transfers its momentum, and where it
 *   meets the croqueted ball;
 * - impact engine time per stroke.
 * Run with `npx --yes tsx scripts/impactProbe.ts`; environment: REPEAT (timed runs per stroke, default 200). Not
 * part of the test suite; its output goes into the roadmap's "P2b.1 outcomes carried forward".
 */
import { vec3, type Vec3 } from "../src/engine/math/vec3";
import { simulateImpact } from "../src/engine/impact/simulateImpact";
import { solidCylinderInertia } from "../src/engine/impact/rigidBody";
import type { ContactState, FaceMaterial, MalletHead } from "../src/engine/impact/types";
import type { BallState, BallStates, World } from "../src/engine/types";
import { defaultWorld, uniformLawn } from "../src/engine/world";
import { contactReference, malletReference } from "../src/reference/index";
import { drive, recorder, strike } from "../tests/engine/support/impact";

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
            `${stroke.name.padEnd(16)} ${steps} steps: median ${fmt(q(0.5), 3)} ms, ` +
                `p99 ${fmt(q(0.99), 3)} ms, max ${fmt(q(1), 3)} ms`,
        );
    }
}

sweep();
stopShot();
timing();
