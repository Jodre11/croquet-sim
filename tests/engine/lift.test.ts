import { describe, expect, it } from "vitest";
import { CONTACT_TOLERANCE } from "../../src/engine/detect";
import { vec3 } from "../../src/engine/math/vec3";
import { SETTLE_SPEED } from "../../src/engine/resolve";
import { stateAtTime } from "../../src/engine/sample";
import { simulateFreeMotion } from "../../src/engine/simulate";
import { BALL_IDS, type BallId, type BallStates, type ShotResult } from "../../src/engine/types";
import { STANDARD_GRAVITY } from "../../src/engine/world";
import { mechanicalEnergy } from "./support/energy";
import { TEST_BALL, airborneAt, ballAt, testWorld } from "./support/fixtures";
import { worstPenetration } from "./support/penetration";

const R = TEST_BALL.radius;
const G = STANDARD_GRAVITY;
const E_TURF = 0.5;

function landings(result: ShotResult, ball: BallId): number[] {
    return result.events.filter((e) => e.kind === "landing" && e.ball === ball).map((e) => e.t);
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

    it("slides a ball off the exact top of another when it has sideways speed, and lands it", () => {
        // The contact normal is vertical, so the push acceleration is exactly zero while the ball moves: its segment
        // has no landing time of its own and is bounded by the pair separating (see boundedGroupEnd in simulate.ts).
        for (const velocity of [vec3(0.01, 0, 0), vec3(0, 0.002, 0)]) {
            const world = testWorld();
            const result = simulateFreeMotion({ blue: ballAt(5, 5), red: airborneAt(5, 5, 3 * R, velocity) }, world);
            expect(result.aborted).toBe(false);
            expect(worstPenetration(result, world)).toBeLessThan(CONTACT_TOLERANCE);
            expect(result.rest.red?.z).toBe(R);
            expect(result.events.length).toBeLessThan(1000);
            // Energy is not checked here: the ball falls back on the other at about 1.4 mm/s, and until Task 6 the
            // collision impulse is the planar one, which turns that approach into sideways speed (a gain of ~6 µJ per
            // hit). Task 6 adds the no-gain check for this scenario.
        }
    });

    it("lets a ball perched on top of another rest there", () => {
        const result = simulateFreeMotion({ blue: ballAt(5, 5), red: airborneAt(5, 5, 3 * R) }, testWorld());
        expect(result.aborted).toBe(false);
        expect(result.rest.red).toEqual(vec3(5, 5, 3 * R));
        expect(result.rest.blue).toEqual(vec3(5, 5, R));
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
