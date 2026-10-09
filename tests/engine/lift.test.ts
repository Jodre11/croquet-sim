import { describe, expect, it } from "vitest";
import { CONTACT_TOLERANCE } from "../../src/engine/detect";
import { land } from "../../src/engine/impact/landing";
import { bedLawOf } from "../../src/engine/impact/turfBed";
import { ZERO, vec3 } from "../../src/engine/math/vec3";
import { SETTLE_SPEED } from "../../src/engine/resolve";
import { stateAtTime } from "../../src/engine/sample";
import { simulateFreeMotion, type LandingRecord } from "../../src/engine/simulate";
import {
    BALL_IDS,
    type BallId,
    type BallState,
    type BallStates,
    type ShotEvent,
    type ShotResult,
} from "../../src/engine/types";
import { STANDARD_GRAVITY, uniformLawn } from "../../src/engine/world";
import { mechanicalEnergy } from "./support/energy";
import { TEST_BALL, TEST_TURF, airborneAt, ballAt, rollingBallAt, testHoop, testWorld } from "./support/fixtures";
import { worstPenetration } from "./support/penetration";

const R = TEST_BALL.radius;
const G = STANDARD_GRAVITY;
/** The half-metre drop's landing count on testWorld's bed, recorded from the run. */
const LANDINGS_HALF_METRE = 4;

function landings(result: ShotResult, ball: BallId): number[] {
    return result.events.filter((e) => e.kind === "landing" && e.ball === ball).map((e) => e.t);
}

function highest(result: ShotResult, ball: BallId): number {
    let top = 0;
    for (let i = 0; i <= 4000; i++) {
        top = Math.max(top, stateAtTime(result, ball, (result.duration * i) / 4000).position.z - R);
    }
    return top;
}

describe("flight and landing", () => {
    it("lands where and when the ballistic closed form says, and rebounds with the turf's restitution", () => {
        const h = 0.1;
        const v = vec3(1, 0.5, 0.8);
        const world = testWorld();
        const records: LandingRecord[] = [];
        const result = simulateFreeMotion(
            { blue: airborneAt(5, 5, R + h, v, vec3(-0.5 / R, 1 / R, 0)) },
            world,
            undefined,
            { landings: (r) => records.push(r) },
        );
        const t = (v.z + Math.sqrt(v.z * v.z + 2 * G * h)) / G;
        expect(landings(result, "blue")[0]).toBeCloseTo(t, 12);
        // The touchdown is the closed form's: the ballistic point and velocity at t, on the turf.
        const touchdown = records[0]?.before as BallState;
        expect(touchdown.position.x).toBeCloseTo(5 + v.x * t, 12);
        expect(touchdown.position.y).toBeCloseTo(5 + v.y * t, 12);
        expect(touchdown.position.z).toBe(R);
        expect(touchdown.velocity.x).toBeCloseTo(v.x, 12);
        expect(touchdown.velocity.z).toBeCloseTo(v.z - G * t, 12);
        // P2b.2b.2b.2a: turf bed. The rebound is the bed's landing (impact/landing.ts), applied at touchdown.
        const second = result.segments.blue?.[1];
        expect(second?.t0).toBeCloseTo(t, 12);
        const surface = world.lawn.surfaceAt(touchdown.position);
        expect(second?.start).toEqual(land(touchdown, world.ball, world.gravity, bedLawOf(surface)).state);
        // The bed takes energy and returns some: 0 < e < 1.
        const e = (second?.start.velocity.z as number) / (0 - touchdown.velocity.z);
        expect(e).toBeGreaterThan(0);
        expect(e).toBeLessThan(1);
    });

    it("bounces with shrinking hops and settles on the turf (drop test)", () => {
        const h = 0.5;
        const result = simulateFreeMotion({ blue: airborneAt(5, 5, R + h) }, testWorld());
        const times = landings(result, "blue");
        expect(times[0]).toBeCloseTo(Math.sqrt((2 * h) / G), 12);
        // P2b.2b.2b.2a: turf bed. Each landing's e < 1, so each hop's flight (and so its rise) is shorter than the
        // one before; the bed's e rises at low speed, so the hops no longer shrink geometrically (design §4.7).
        for (let k = 2; k < times.length; k++) {
            const flight = (times[k] as number) - (times[k - 1] as number);
            expect(flight).toBeLessThan((times[k - 1] as number) - (times[k - 2] as number));
        }
        // P2b.2b.2b.2a: turf bed (was 12 at the constant e = 0.5): recorded from the run. The bed's e rises at low
        // speed, but once a landing is too slow to bounce out, §4.6's settle rule ends it in the turf.
        expect(times.length).toBe(LANDINGS_HALF_METRE);
        expect(result.rest.blue).toEqual(vec3(5, 5, R));
        expect(result.aborted).toBe(false);
    });

    it("settles a 1 mm drop in a few landings, with no landing-cap (review focus 5)", () => {
        const world = testWorld();
        const result = simulateFreeMotion(
            { blue: { position: vec3(5, 5, R + 1e-3), velocity: ZERO, angularVelocity: ZERO } },
            world,
        );
        const landings = result.events.filter((e) => e.kind === "landing").length;
        expect(landings).toBeGreaterThan(0);
        // Recorded from the run (1: the 0.14 m/s touchdown settles in the bed at once); each landing's e < 1 bounds
        // it, and the settle rule ends it.
        expect(landings).toBeLessThan(20);
        expect(result.events.some((e) => e.kind === "landing-cap")).toBe(false);
        expect(result.aborted).toBe(false);
    });

    it("raises landing-cap when a landing is forced past its cap", () => {
        // A bed so soft (k_w 1e5 N/m³, 3000 times below testWorld's) and so lightly damped (τ_r 2 ms) that a 3.7 m/s
        // landing sinks about 150 mm and rings on it, neither leaving nor settling, past 50 ms. A slowly recovering bed
        // (τ_r 10 s, as first tried) does not cap: τ_r is also each cell's damping time (k_w·τ_r), so that bed stops
        // the ball within 2 ms. Found by running the landing alone with land() over k_w and τ_r.
        const soft = uniformLawn(30, 40, {
            slidingFriction: 0.3,
            rollingResistance: 0.05,
            ...TEST_TURF,
            bedModulus: 1e5,
            bedRecovery: 2e-3,
        });
        const result = simulateFreeMotion(
            { blue: { position: vec3(5, 5, R + 0.5), velocity: vec3(0, 0, -2), angularVelocity: ZERO } },
            testWorld({ lawn: soft }),
        );
        expect(result.events.some((e) => e.kind === "landing-cap")).toBe(true);
    });

    it("reports every landing to the probe, with the ball before it and the landing's figures", () => {
        const records: LandingRecord[] = [];
        const result = simulateFreeMotion(
            { blue: { position: vec3(5, 5, R + 0.05), velocity: vec3(1, 0, 0), angularVelocity: ZERO } },
            testWorld(),
            undefined,
            { landings: (r) => records.push(r) },
        );
        expect(records).toHaveLength(result.events.filter((e) => e.kind === "landing").length);
        expect(records[0]?.before.velocity.z as number).toBeLessThan(0);
        expect(records[0]?.landing.duration as number).toBeGreaterThan(0);
    });

    it("starts a ball on the lawn plane airborne only if it rises at least at the settle speed", () => {
        const slow = simulateFreeMotion({ blue: ballAt(5, 5, vec3(1, 0, 0.5 * SETTLE_SPEED)) }, testWorld());
        expect(slow.segments.blue?.[0]?.phase).toBe("sliding");
        expect(landings(slow, "blue")).toEqual([]);
        const fast = simulateFreeMotion({ blue: ballAt(5, 5, vec3(1, 0, 0.1)) }, testWorld());
        expect(fast.segments.blue?.[0]?.phase).toBe("airborne");
        expect(landings(fast, "blue")[0]).toBeCloseTo(0.2 / G, 12);
    });
});

describe("the boundary in flight", () => {
    it("judges out of court on the horizontal projection and halts a ball in flight on the turf", () => {
        const world = testWorld({ haltMargin: 0.1 });
        const result = simulateFreeMotion({ blue: airborneAt(0.3, 5, R, vec3(-2, 0, 3)) }, world);
        const out = result.events.find((e) => e.kind === "out-of-court");
        expect(out?.t).toBeCloseTo(0.15, 12);
        expect(result.events.some((e) => e.kind === "halted")).toBe(true);
        expect(landings(result, "blue")).toEqual([]);
        expect(result.rest.blue?.x).toBeCloseTo(-0.1, 9);
        expect(result.rest.blue?.z).toBe(R);
    });
});

/** Floating-point slack (J) for the energy checks: rounding in the closed forms, far below any physical gain. */
const ENERGY_TOLERANCE = 1e-9;

/** Asserts that total mechanical energy never rises, sampled at every event and midway between events. */
function expectNoEnergyGain(result: ShotResult): void {
    const times = [...new Set([0, ...result.events.map((e) => e.t)])].sort((a, b) => a - b);
    const sampled = times.flatMap((t, k) => (k === 0 ? [t] : [((times[k - 1] as number) + t) / 2, t]));
    let previous = Infinity;
    for (const t of sampled) {
        const energy = BALL_IDS.reduce(
            (sum, id) => (result.segments[id] ? sum + mechanicalEnergy(stateAtTime(result, id, t), TEST_BALL, G) : sum),
            0,
        );
        expect(energy).toBeLessThanOrEqual(previous + ENERGY_TOLERANCE);
        previous = energy;
    }
}

describe("resting contact in flight", () => {
    // Blue, at rest in the air, leans on red at 30° from the vertical: it slides off red, pushing it, and lands.
    const lean: BallStates = {
        blue: airborneAt(5 + R, 5, R + Math.sqrt(3) * R),
        red: ballAt(5, 5),
    };

    it("pushes along the inclined normal without bouncing, then lands", () => {
        const world = testWorld();
        const result = simulateFreeMotion(lean, world);
        expect(result.aborted).toBe(false);
        expect(result.events.some((e) => e.kind === "ball-ball" && e.resting)).toBe(true);
        expect(result.segments.blue?.some((s) => s.push && s.phase === "airborne")).toBe(true);
        expect(result.events.some((e) => e.kind === "approximate-hold")).toBe(false);
        expect(worstPenetration(result, world)).toBeLessThan(CONTACT_TOLERANCE);
        expect(result.rest.blue?.z).toBe(R);
        expect((result.rest.blue?.x ?? 0) - (result.rest.red?.x ?? 0)).toBeGreaterThan(2 * R - 1e-9);
        // The frozen normal makes a ball sliding round another regroup often, but finitely (see push.ts).
        expect(result.events.length).toBeLessThan(1000);
        expectNoEnergyGain(result);
    });

    it(
        "slides a ball off the exact top of another when it has sideways speed, and lands it",
        { timeout: 40_000 },
        () => {
            // The contact normal is vertical, so the push acceleration is exactly zero while the ball moves: its
            // segment has no landing time of its own and is bounded by the pair separating (see boundedGroupEnd in
            // simulate.ts). The sweep includes 0.003 m/s along x, where the separation root is not an exact zero of
            // the gap polynomial.
            const speeds = [0.0005, 0.001, 0.002, 0.003, 0.004, 0.005, 0.007, 0.01, 0.015, 0.02, 0.03, 0.05];
            const directions = [vec3(1, 0, 0), vec3(0, 1, 0), vec3(-1, 0, 0), vec3(0.6, 0.8, 0)];
            const places = [vec3(5, 5, 0), vec3(12.3, 7.1, 0)];
            for (const place of places) {
                for (const direction of directions) {
                    for (const speed of speeds) {
                        const velocity = vec3(direction.x * speed, direction.y * speed, 0);
                        const world = testWorld();
                        const result = simulateFreeMotion(
                            {
                                blue: ballAt(place.x, place.y),
                                red: airborneAt(place.x, place.y, 3 * R, velocity),
                            },
                            world,
                        );
                        expect(result.aborted).toBe(false);
                        expect(worstPenetration(result, world)).toBeLessThan(CONTACT_TOLERANCE);
                        expect(result.rest.red?.z).toBe(R);
                        // Finite but long. The contact normal is frozen per push segment, so the pair regroups as its
                        // gap drifts (at third order, the closing rate including the normal's curvature) out of its
                        // band, rather than bouncing freely: frictionless, 135–193 events over the sweep. Friction
                        // adds, per regroup cycle, a stick/slip pair of the contact (the lower ball rolls for a few
                        // microseconds as it slips), and a slip of a few nanoseconds that sticks again at once: at
                        // 0.003 m/s 336 events, 260–336 over the sweep. Damping that chatter is deferred to P5.
                        expect(result.events.length).toBeLessThan(500);
                        // The ball falls back on the other at about 1.4 mm/s; the 3D impulse keeps the approach normal.
                        expectNoEnergyGain(result);
                    }
                }
            }
        },
    );

    it("lets a ball perched on top of another rest there", () => {
        const result = simulateFreeMotion({ blue: ballAt(5, 5), red: airborneAt(5, 5, 3 * R) }, testWorld());
        expect(result.aborted).toBe(false);
        expect(result.rest.red).toEqual(vec3(5, 5, 3 * R));
        expect(result.rest.blue).toEqual(vec3(5, 5, R));
    });

    it("drops a ball perched on another onto the turf when a third ball strikes its support", () => {
        const world = testWorld();
        const result = simulateFreeMotion(
            {
                red: airborneAt(5, 5, 3 * R),
                blue: ballAt(5, 5),
                black: rollingBallAt(5 - 4 * R, 5, 2, 0),
            },
            world,
        );
        expect(result.aborted).toBe(false);
        const strikes = (e: ShotEvent): boolean =>
            e.kind === "ball-ball" && e.balls.includes("black") && e.balls.includes("blue");
        expect(result.events.some(strikes)).toBe(true);
        expect(result.events.some((e) => e.kind === "landing" && e.ball === "red")).toBe(true);
        expect(worstPenetration(result, world)).toBeLessThan(CONTACT_TOLERANCE);
        expect(result.rest.red?.z).toBe(R);
        expectNoEnergyGain(result);
    });

    it("holds a ball leaning on the peg while it rests on a ball the turf holds", () => {
        // Red sits almost on top of blue (offset sin 0.03), touching the peg: blue's horizontal load, 0.03·g, is within
        // its static resistance (7/5)·0.05·g, so nothing moves.
        const s = 0.03;
        const xa = 15 - (R + 0.02);
        const za = R + 2 * R * Math.sqrt(1 - s * s);
        const result = simulateFreeMotion(
            { blue: ballAt(xa - 2 * R * s, 20), red: airborneAt(xa, 20, za) },
            testWorld(),
        );
        expect(result.aborted).toBe(false);
        expect(result.rest.red?.z).toBeCloseTo(za, 12);
        expect(result.events.length).toBeLessThan(20);
    });
});

describe("lift-off and stick in pushes", () => {
    it("lifts a ball off the turf when push friction takes its load, and lands it later (Review Focus 3)", () => {
        // μ = 4 between the balls (μ·μs > 1): red, backspun into blue's topspin, cannot stay on the turf and is solved
        // airborne at z = R with upward acceleration. It must rise, not land at the instant it lifts.
        const world = testWorld({ ballBall: { restitution: 0.8, friction: 4 } });
        const result = simulateFreeMotion(
            {
                blue: ballAt(5, 5, vec3(0, 0, 0), vec3(0, 60, 0)),
                red: ballAt(5 + 2 * R, 5, vec3(0, 0, 0), vec3(0, -80, 0)),
            },
            world,
        );
        expect(result.aborted).toBe(false);
        const lifted = result.segments.red?.[0];
        expect(lifted?.phase).toBe("airborne");
        expect(lifted?.push?.acceleration.z).toBeCloseTo(4.903325, 9);
        expect(highest(result, "red")).toBeGreaterThan(1e-6);
        const landed = landings(result, "red");
        expect(landed.length).toBeGreaterThan(0);
        expect(landed[0]).toBeGreaterThan(0);
        expect(result.rest.red?.z).toBe(R);
    });

    it("sticks a contact whose slip reaches zero, slips it again once, and comes to rest (Review Focus 5)", () => {
        // Blue's topspin and red's slightly stronger backspin drive the pair into each other (N = μs·g); the vertical
        // contact slip R·ΔΩ decays at 5μN(1 − μs), so the contact sticks at R·ΔΩ/(5μ·μs·g(1 − μs)) = 0.0893466 s, and
        // slips again when blue starts to roll (0.3778 s). They come to rest touching, at 5.001323 and 5.093323.
        const result = simulateFreeMotion(
            {
                blue: ballAt(5, 5, vec3(0, 0, 0), vec3(0, 60, 0)),
                red: ballAt(5 + 2 * R, 5, vec3(0, 0, 0), vec3(0, -61, 0)),
            },
            testWorld(),
        );
        expect(result.aborted).toBe(false);
        const changes = result.events.filter((e) => e.kind.startsWith("stick") || e.kind.startsWith("slip"));
        expect(changes.map((e) => e.kind)).toEqual(["stick-ball", "slip-ball"]);
        expect(changes[0]?.t).toBeCloseTo(0.089346563423, 9);
        expect(changes[1]?.t).toBeCloseTo(0.377846616715, 9);
        expect(result.rest.blue?.x).toBeCloseTo(5.001323, 6);
        expect(result.rest.red?.x).toBeCloseTo(5.093323, 6);
    });
});

describe("lift in collisions", () => {
    const hop: BallStates = { blue: rollingBallAt(5, 5, 3, 0), red: ballAt(6, 5 + R) };

    it("lifts a rolling striker off the turf, which then lands and rolls on", () => {
        const result = simulateFreeMotion(hop, testWorld());
        expect(result.events.some((e) => e.kind === "ball-ball")).toBe(true);
        expect(landings(result, "blue").length).toBeGreaterThan(0);
        const lift = highest(result, "blue");
        expect(lift).toBeGreaterThan(1e-5);
        expect(lift).toBeLessThan(2e-3);
        expect(result.rest.blue?.z).toBe(R);
        expect(result.events.some((e) => e.kind === "jump")).toBe(false);
        expect(result.aborted).toBe(false);
    });

    it("lifts a rolling ball off the peg", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(14, 20.01, 2.5, 0) }, testWorld());
        expect(result.events.some((e) => e.kind === "ball-obstacle" && e.obstacleId === "peg")).toBe(true);
        expect(highest(result, "blue")).toBeGreaterThan(1e-4);
        expect(result.rest.blue?.z).toBe(R);
    });

    it("is bit-identical across repeated runs and mirrors a mirrored set-up", () => {
        const world = testWorld();
        expect(simulateFreeMotion(hop, world)).toStrictEqual(simulateFreeMotion(hop, world));
        const mirror = (s: BallState): BallState => ({
            position: vec3(30 - s.position.x, s.position.y, s.position.z),
            velocity: vec3(-s.velocity.x, s.velocity.y, s.velocity.z),
            angularVelocity: vec3(s.angularVelocity.x, -s.angularVelocity.y, -s.angularVelocity.z),
        });
        const mirrored = Object.fromEntries(
            Object.entries(hop).map(([id, s]) => [id, mirror(s as BallState)]),
        ) as BallStates;
        const a = simulateFreeMotion(hop, world);
        const b = simulateFreeMotion(mirrored, world);
        for (const id of Object.keys(hop) as BallId[]) {
            expect(b.rest[id]?.x).toBeCloseTo(30 - (a.rest[id]?.x ?? 0), 9);
            expect(b.rest[id]?.y).toBeCloseTo(a.rest[id]?.y ?? 0, 9);
        }
    });

    it("never gains mechanical energy over a shot with hops", () => {
        const result = simulateFreeMotion(hop, testWorld());
        const total = (t: number): number =>
            BALL_IDS.filter((id) => result.segments[id]).reduce(
                (sum, id) => sum + mechanicalEnergy(stateAtTime(result, id, t), TEST_BALL, G),
                0,
            );
        let previous = total(0);
        for (let i = 1; i <= 1000; i++) {
            const e = total((result.duration * i) / 1000);
            expect(e).toBeLessThanOrEqual(previous + 1e-9);
            previous = e;
        }
    });
});

describe("jump flag", () => {
    it("flags a ball passing over another", () => {
        const lob = simulateFreeMotion(
            { blue: airborneAt(5, 5, R, vec3(2, 0, 2.2), vec3(0, 40, 0)), red: ballAt(5.4, 5) },
            testWorld(),
        );
        expect(lob.events.filter((e) => e.kind === "jump")).toEqual([
            expect.objectContaining({ kind: "jump", ball: "blue", over: "red" }),
        ]);
        expect(lob.aborted).toBe(false);
    });

    it("flags a ball whose top reaches a crown's underside, when it does", () => {
        const world = testWorld({ hoops: [testHoop("1", 10, 10)] });
        const vz = 2.5;
        const result = simulateFreeMotion({ blue: airborneAt(5, 5, R, vec3(1, 0, vz)) }, world);
        const jump = result.events.find((e) => e.kind === "jump");
        // z(t) + R = crown: R + vz·t − g·t²/2 + R = 0.29.
        const rise = 0.29 - 2 * R;
        const t = (vz - Math.sqrt(vz * vz - 2 * G * rise)) / G;
        expect(jump).toEqual({ kind: "jump", t: expect.closeTo(t, 9), ball: "blue", over: "crown" });
    });
});

describe("hoops in flight", () => {
    const hoopWorld = testWorld({ hoops: [testHoop("1", 10, 20)] });

    it("records a passage made in a low hop, but not one over the crown", () => {
        const low = simulateFreeMotion({ blue: airborneAt(10, 19.9, R + 0.02, vec3(0, 2, 0)) }, hoopWorld);
        const passage = low.events.find((e) => e.kind === "hoop-passage" && e.hoopId === "1");
        expect(passage).toBeDefined();
        // The hop is still in flight when it crosses the plane: before its first landing, and above the turf.
        expect(passage?.t).toBeLessThan(landings(low, "blue")[0] as number);
        expect(stateAtTime(low, "blue", passage?.t as number).position.z).toBeGreaterThan(R);
        // Crossing the plane 0.3 s later, its centre is 0.459 m above its resting height: far above the crown.
        const over = simulateFreeMotion({ blue: airborneAt(10, 19.4, R + 0.3, vec3(0, 2, 2)) }, hoopWorld);
        expect(over.events.some((e) => e.kind === "hoop-passage")).toBe(false);
        expect(over.events.some((e) => e.kind === "ball-obstacle")).toBe(false);
    });
});
