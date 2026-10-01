import { describe, expect, it } from "vitest";
import { horizontal, length, sub, vec3 } from "../../src/engine/math/vec3";
import { stateAtTime } from "../../src/engine/sample";
import { CONTACT_TOLERANCE } from "../../src/engine/detect";
import { simulateFreeMotion } from "../../src/engine/simulate";
import { BALL_IDS, type BallId, type BallState, type BallStates, type ShotResult } from "../../src/engine/types";
import { STANDARD_GRAVITY } from "../../src/engine/world";
import { kineticEnergy } from "./support/energy";
import { worstPenetration } from "./support/penetration";
import { TEST_BALL, airborneAt, ballAt, rollingBallAt, testHoop, testWorld } from "./support/fixtures";

const R = TEST_BALL.radius;
const SLIDE = 0.3 * STANDARD_GRAVITY;
const ROLL = 0.05 * STANDARD_GRAVITY;

function totalEnergy(result: ShotResult, t: number): number {
    return BALL_IDS.filter((id) => result.segments[id]).reduce(
        (sum, id) => sum + kineticEnergy(stateAtTime(result, id, t), TEST_BALL),
        0,
    );
}

describe("single ball", () => {
    it("matches the analytic slide-then-roll distance", () => {
        const v0 = 2;
        const result = simulateFreeMotion({ blue: ballAt(5, 5, vec3(v0, 0, 0)) }, testWorld());
        const tau = (2 * v0) / (7 * SLIDE);
        const slide = v0 * tau - 0.5 * SLIDE * tau * tau;
        const v1 = (5 / 7) * v0;
        expect(result.rest.blue?.x).toBeCloseTo(5 + slide + (v1 * v1) / (2 * ROLL), 9);
        expect(result.rest.blue?.y).toBe(5);
        expect(result.events.filter((e) => e.kind === "phase").map((e) => (e as { phase: string }).phase)).toEqual([
            "sliding",
            "rolling",
            "stationary",
        ]);
        expect(result.aborted).toBe(false);
    });

    it("returns immediately when nothing moves", () => {
        const result = simulateFreeMotion({ red: ballAt(3, 3), blue: ballAt(3 + 2 * R, 3) }, testWorld());
        expect(result.duration).toBe(0);
        expect(result.rest.red).toEqual(vec3(3, 3, R));
        expect(result.rest.blue).toEqual(vec3(3 + 2 * R, 3, R));
    });

    it("treats a ball moving slower than the tolerance as stationary", () => {
        const result = simulateFreeMotion({ blue: ballAt(3, 3, vec3(1e-12, 0, 0)) }, testWorld());
        expect(result.duration).toBe(0);
    });

    it("settles a ball with residual slip just above tolerance in a handful of events", () => {
        const result = simulateFreeMotion({ blue: ballAt(3, 3, vec3(2e-9, 0, 0)) }, testWorld());
        expect(result.aborted).toBe(false);
        expect(result.events.length).toBeLessThanOrEqual(4);
    });
});

describe("collisions", () => {
    it("transfers (1 + e)/2 of the striker's contact speed in a head-on rush", () => {
        const world = testWorld();
        const result = simulateFreeMotion({ blue: rollingBallAt(5, 5, 2, 0), red: ballAt(6, 5) }, world);
        const hit = result.events.find((e) => e.kind === "ball-ball");
        expect(hit).toBeDefined();
        const t = (hit as { t: number }).t;
        const vBefore = 2 - ROLL * t;
        const redSegments = result.segments.red ?? [];
        const firstMoving = redSegments.find((s) => s.phase !== "stationary");
        expect(firstMoving?.start.velocity.x).toBeCloseTo(((1 + 0.8) / 2) * vBefore, 9);
        expect((result.rest.red?.x ?? 0) > (result.rest.blue?.x ?? 0)).toBe(true);
    });

    it("rebounds off the peg", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(14, 20, 1, 0) }, testWorld());
        expect(result.events.some((e) => e.kind === "ball-obstacle" && e.obstacleId === "peg")).toBe(true);
        expect(result.rest.blue?.x).toBeLessThan(15);
    });

    it("pushes through a chain of touching balls without tunnelling (Review Focus 1)", () => {
        const world = testWorld();
        const result = simulateFreeMotion(
            {
                blue: rollingBallAt(5, 5, 2, 0),
                red: ballAt(6, 5),
                black: ballAt(6 + 2 * R, 5),
                yellow: ballAt(6 + 4 * R, 5),
            },
            world,
        );
        expect(result.aborted).toBe(false);
        expect(worstPenetration(result, world)).toBeLessThan(CONTACT_TOLERANCE);
        expect((result.rest.yellow?.x ?? 0) > 6 + 4 * R).toBe(true);
        // Blue's topspin drives it back into red: that ends in resting contact and a push, not a Zeno storm (B3).
        expect(result.events.some((e) => e.kind === "ball-ball" && e.resting)).toBe(true);
        expect(result.segments.blue?.some((s) => s.push)).toBe(true);
        expect(result.events.length).toBeLessThan(200);
    });

    it("handles a ball struck while already touching another (croquet-stroke start)", () => {
        const world = testWorld();
        const result = simulateFreeMotion({ blue: ballAt(5, 5, vec3(3, 0, 0)), red: ballAt(5 + 2 * R, 5) }, world);
        expect(result.events.some((e) => e.kind === "ball-ball" && e.t === 0)).toBe(true);
        expect(worstPenetration(result, world)).toBeLessThan(CONTACT_TOLERANCE);
    });

    it("does not collide balls that graze exactly tangentially (Review Focus 2)", () => {
        const world = testWorld();
        const result = simulateFreeMotion({ blue: rollingBallAt(5, 5, 2, 0), red: ballAt(6, 5 + 2 * R) }, world);
        expect(result.events.some((e) => e.kind === "ball-ball")).toBe(false);
        expect(worstPenetration(result, world)).toBeLessThan(CONTACT_TOLERANCE);
    });

    it("resolves two balls striking a third at the same instant (Review Focus 4)", () => {
        const world = testWorld();
        const result = simulateFreeMotion(
            { blue: rollingBallAt(9, 5, 1, 0), red: ballAt(10, 5), black: rollingBallAt(11, 5, -1, 0) },
            world,
        );
        expect(result.aborted).toBe(false);
        expect(worstPenetration(result, world)).toBeLessThan(CONTACT_TOLERANCE);
    });
});

describe("resting contact and pushing", () => {
    it("pushes a resting ball with a ball driven by topspin (analytic case)", () => {
        // Blue has topspin Ω and no velocity. The pair accelerates at A = (5·SLIDE − 7·ROLL)/12 until blue's slip
        // RΩ is gone, after t = RΩ/(A + 5·SLIDE/2); both then roll at V = A·t and stop together after V²/(2·ROLL).
        const omega = 60;
        const world = testWorld();
        const result = simulateFreeMotion(
            { blue: ballAt(5, 5, vec3(0, 0, 0), vec3(0, omega, 0)), red: ballAt(5 + 2 * R, 5) },
            world,
        );
        const A = (5 * SLIDE - 7 * ROLL) / 12;
        const t = (R * omega) / (A + 2.5 * SLIDE);
        const V = A * t;
        const travel = 0.5 * A * t * t + (V * V) / (2 * ROLL);
        expect(result.rest.red?.x).toBeCloseTo(5 + 2 * R + travel, 9);
        expect(result.rest.blue?.x).toBeCloseTo(5 + travel, 9);
        expect(result.rest.red?.y).toBe(5);
        expect(result.events.filter((e) => e.kind === "ball-ball")).toEqual([
            { kind: "ball-ball", t: 0, balls: ["blue", "red"], resting: true },
        ]);
        expect(result.segments.red?.[0]?.push?.acceleration.x).toBeCloseTo(A, 12);
        expect(result.aborted).toBe(false);
    });

    it("keeps the pushed pair touching and never gains energy while pushing", () => {
        const world = testWorld();
        const result = simulateFreeMotion(
            { blue: ballAt(5, 5, vec3(0, 0, 0), vec3(0, 60, 0)), red: ballAt(5 + 2 * R, 5) },
            world,
        );
        let previous = totalEnergy(result, 0);
        for (let i = 1; i <= 400; i++) {
            const time = (result.duration * i) / 400;
            const gap =
                length(
                    horizontal(
                        sub(stateAtTime(result, "red", time).position, stateAtTime(result, "blue", time).position),
                    ),
                ) -
                2 * R;
            expect(Math.abs(gap)).toBeLessThan(1e-9);
            const e = totalEnergy(result, time);
            expect(e).toBeLessThanOrEqual(previous + 1e-12);
            previous = e;
        }
    });

    it("pushes a ball driven into two touching balls at an angle (three-body wedge)", () => {
        const world = testWorld();
        const c = Math.sqrt(3) / 2;
        const result = simulateFreeMotion(
            {
                blue: ballAt(5, 5, vec3(0, 0, 0), vec3(0, 80, 0)),
                red: ballAt(5 + 2 * R * c, 5 - R),
                black: ballAt(5 + 2 * R * c, 5 + R),
            },
            world,
        );
        expect(result.aborted).toBe(false);
        // Every resting-contact solve was exact: the nearest-hold fallback was never needed.
        expect(result.events.some((e) => e.kind === "approximate-hold")).toBe(false);
        expect(result.segments.blue?.some((s) => s.push)).toBe(true);
        expect(worstPenetration(result, world)).toBeLessThan(CONTACT_TOLERANCE);
        // Symmetric set-up, symmetric outcome.
        expect(result.rest.red?.x).toBeCloseTo(result.rest.black?.x ?? NaN, 9);
        expect((result.rest.red?.y ?? 0) - 5).toBeCloseTo(5 - (result.rest.black?.y ?? 0), 9);
        expect(result.rest.blue?.y).toBeCloseTo(5, 9);
    });

    it("holds a ball spinning against the peg until its slip is gone", () => {
        const world = testWorld();
        // Blue touches the peg from the west with topspin driving it east, into the peg.
        const result = simulateFreeMotion({ blue: ballAt(15 - R - 0.02, 20, vec3(0, 0, 0), vec3(0, 60, 0)) }, world);
        expect(result.events).toContainEqual({
            kind: "ball-obstacle",
            t: 0,
            ball: "blue",
            obstacleId: "peg",
            resting: true,
        });
        expect(result.aborted).toBe(false);
        expect(worstPenetration(result, world)).toBeLessThan(CONTACT_TOLERANCE);
        expect(result.rest.blue?.x).toBeCloseTo(15 - R - 0.02, 9);
    });

    it("lets touching balls rolling together stop together without contact events", () => {
        const result = simulateFreeMotion(
            { blue: rollingBallAt(5, 5, 1, 0), red: rollingBallAt(5 + 2 * R, 5, 1, 0) },
            testWorld(),
        );
        expect(result.events.some((e) => e.kind === "ball-ball")).toBe(false);
        expect((result.rest.red?.x ?? 0) - (result.rest.blue?.x ?? 0)).toBeCloseTo(2 * R, 12);
    });
});

describe("halt margin", () => {
    it("stops a ball one halt margin beyond the boundary", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(1, 5, -4, 0) }, testWorld());
        expect(result.events.some((e) => e.kind === "halted" && e.ball === "blue")).toBe(true);
        expect(result.rest.blue?.x).toBeCloseTo(-1, 6);
    });

    it("takes a halted ball out of play, so a ball pushing it cannot drive it on", () => {
        // Blue, driven by topspin, pushes red west over the boundary; red is halted and blue carries on alone.
        const world = testWorld({ haltMargin: 0.1 });
        const result = simulateFreeMotion(
            { blue: ballAt(0.3, 5, vec3(-0.5, 0, 0), vec3(0, -150, 0)), red: ballAt(0.3 - 2 * R, 5) },
            world,
        );
        expect(result.aborted).toBe(false);
        expect(result.events.some((e) => e.kind === "halted" && e.ball === "red")).toBe(true);
        expect(result.rest.red?.x).toBeCloseTo(-0.1, 6);
    });
});

describe("invariants", () => {
    // Blue, at rest with heavy topspin 0.5 mm behind red, drives red into hoop 6's east upright: impacts, a push,
    // red caught between blue and the upright, and rebounds. Separately, black rolls into yellow.
    const complex: BallStates = {
        blue: ballAt(15.1713, 14.6246, vec3(0, 0, 0), vec3(-114.6, -35.5, 0)),
        red: ballAt(15.144, 14.713),
        black: rollingBallAt(12, 17, 1.5, 0.5),
        yellow: ballAt(13.5, 17.5),
    };
    const hoopWorld = testWorld({ hoops: [testHoop("5", 15, 25), testHoop("6", 15, 15)] });

    it("is bit-identical across repeated runs", () => {
        expect(simulateFreeMotion(complex, hoopWorld)).toStrictEqual(simulateFreeMotion(complex, hoopWorld));
    });

    it("exercises ball-ball and obstacle contacts", () => {
        // Guards the scenario itself: if this fails, move the balls until both kinds of contact occur.
        const result = simulateFreeMotion(complex, hoopWorld);
        const pairs = new Set(result.events.flatMap((e) => (e.kind === "ball-ball" ? [e.balls.join("-")] : [])));
        expect(pairs).toEqual(new Set(["blue-red", "black-yellow"]));
        expect(result.events.some((e) => e.kind === "ball-ball" && e.resting)).toBe(true);
        expect(result.events.some((e) => e.kind === "ball-obstacle" && e.obstacleId === "6/b")).toBe(true);
        expect(result.segments.red?.some((s) => s.push)).toBe(true);
        expect(result.aborted).toBe(false);
    });

    it("never gains energy over the shot", () => {
        const result = simulateFreeMotion(complex, hoopWorld);
        let previous = totalEnergy(result, 0);
        for (let i = 1; i <= 400; i++) {
            const e = totalEnergy(result, (result.duration * i) / 400);
            expect(e).toBeLessThanOrEqual(previous + 1e-9);
            previous = e;
        }
    });

    it("mirrors a mirrored setup", () => {
        const mirror = (s: BallState): BallState => ({
            position: vec3(30 - s.position.x, s.position.y, s.position.z),
            velocity: vec3(-s.velocity.x, s.velocity.y, s.velocity.z),
            // Angular velocity is a pseudovector: reflecting x flips its y and z components.
            angularVelocity: vec3(s.angularVelocity.x, -s.angularVelocity.y, -s.angularVelocity.z),
        });
        const mirrored = Object.fromEntries(
            Object.entries(complex).map(([id, s]) => [id, mirror(s as BallState)]),
        ) as BallStates;
        const a = simulateFreeMotion(complex, hoopWorld);
        const b = simulateFreeMotion(mirrored, hoopWorld);
        for (const id of Object.keys(complex) as BallId[]) {
            expect(b.rest[id]?.x).toBeCloseTo(30 - (a.rest[id]?.x ?? 0), 9);
            expect(b.rest[id]?.y).toBeCloseTo(a.rest[id]?.y ?? 0, 9);
        }
    });

    it("never lets balls interpenetrate each other or obstacles", () => {
        expect(worstPenetration(simulateFreeMotion(complex, hoopWorld), hoopWorld)).toBeLessThan(CONTACT_TOLERANCE);
    });
});

describe("limits and validation", () => {
    it("flags an aborted run when the event limit is reached", () => {
        const result = simulateFreeMotion({ blue: ballAt(5, 5, vec3(2, 0, 0)) }, testWorld(), 1);
        expect(result.aborted).toBe(true);
    });

    it("rejects overlapping balls", () => {
        expect(() => simulateFreeMotion({ blue: ballAt(5, 5), red: ballAt(5 + R, 5) }, testWorld())).toThrow(
            RangeError,
        );
    });

    it("rejects a ball overlapping the peg", () => {
        expect(() => simulateFreeMotion({ blue: ballAt(15.03, 20) }, testWorld())).toThrow(RangeError);
    });

    it("rejects a ball below the lawn plane", () => {
        const sunk = { ...ballAt(5, 5), position: vec3(5, 5, R - 0.01) };
        expect(() => simulateFreeMotion({ blue: sunk }, testWorld())).toThrow(/below the lawn plane/);
    });

    it("measures overlap in 3D: a ball in flight may start above another, but not inside it", () => {
        const over = airborneAt(5, 5, 5 * R, vec3(3, 0, 0));
        expect(() => simulateFreeMotion({ blue: ballAt(5, 5), red: over }, testWorld())).not.toThrow();
        const inside = airborneAt(5 + R, 5, 2 * R);
        expect(() => simulateFreeMotion({ blue: ballAt(5, 5), red: inside }, testWorld())).toThrow(/overlap/);
    });
});
