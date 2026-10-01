import { describe, expect, it } from "vitest";
import { CONTACT_TOLERANCE } from "../../src/engine/detect";
import { vec3 } from "../../src/engine/math/vec3";
import { SETTLE_SPEED } from "../../src/engine/resolve";
import { stateAtTime } from "../../src/engine/sample";
import { simulateFreeMotion } from "../../src/engine/simulate";
import { BALL_IDS, type BallId, type BallState, type BallStates, type ShotResult } from "../../src/engine/types";
import { STANDARD_GRAVITY } from "../../src/engine/world";
import { mechanicalEnergy } from "./support/energy";
import { TEST_BALL, airborneAt, ballAt, rollingBallAt, testHoop, testWorld } from "./support/fixtures";
import { worstPenetration } from "./support/penetration";

const R = TEST_BALL.radius;
const G = STANDARD_GRAVITY;
const E_TURF = 0.5;

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
        const result = simulateFreeMotion({ blue: airborneAt(5, 5, R + h, v, vec3(-0.5 / R, 1 / R, 0)) }, testWorld());
        const t = (v.z + Math.sqrt(v.z * v.z + 2 * G * h)) / G;
        expect(landings(result, "blue")[0]).toBeCloseTo(t, 12);
        const second = result.segments.blue?.[1];
        expect(second?.t0).toBeCloseTo(t, 12);
        expect(second?.start.position.x).toBeCloseTo(5 + v.x * t, 12);
        expect(second?.start.position.y).toBeCloseTo(5 + v.y * t, 12);
        expect(second?.start.position.z).toBe(R);
        // The spin matches the horizontal velocity (no turf slip), so the landing leaves it unchanged.
        expect(second?.start.velocity.x).toBeCloseTo(v.x, 12);
        expect(second?.start.velocity.z).toBeCloseTo(E_TURF * (G * t - v.z), 12);
    });

    it("bounces with geometrically shrinking hops and settles on the turf (drop test)", () => {
        const h = 0.5;
        const result = simulateFreeMotion({ blue: airborneAt(5, 5, R + h) }, testWorld());
        const v1 = Math.sqrt(2 * G * h);
        const times = landings(result, "blue");
        let expected = 0;
        while (v1 * E_TURF ** expected >= SETTLE_SPEED) {
            expected++;
        }
        expect(times.length).toBe(expected);
        expect(times[0]).toBeCloseTo(Math.sqrt((2 * h) / G), 12);
        for (let k = 1; k < times.length; k++) {
            const flight = (2 * v1 * E_TURF ** k) / G;
            expect((times[k] as number) - (times[k - 1] as number)).toBeCloseTo(flight, 10);
        }
        expect(result.rest.blue).toEqual(vec3(5, 5, R));
        expect(result.aborted).toBe(false);
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
        { timeout: 30_000 },
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
                        // Finite but long: at 0.003 m/s, about 703 ball–ball and 324 phase events (about 1039 in all).
                        // The contact normal is frozen per push segment, so the pair regroups every ~1.5 mrad of the
                        // normal's turn, each regroup followed by re-contacts, rather than bouncing freely.
                        expect(result.events.length).toBeLessThan(2000);
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

    it("keeps a ball perched on another at rest when a third ball strikes its support", () => {
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
