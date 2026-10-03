import { describe, expect, it } from "vitest";
import { ZERO, add, dot, length, scale, sub, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import { BALL_IDS, type BallState, type BallStates } from "../../../src/engine/types";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import type { ImpactSnapshot } from "../../../src/engine/impact/integrate";
import { simulateImpact } from "../../../src/engine/impact/simulateImpact";
import { TEST_BALL, testWorld } from "../support/fixtures";
import {
    SCENARIOS,
    impactEnergy,
    initialHeadEnergy,
    mirrorBall,
    mirrorContact,
    mirrorQuat,
    mirrorSpin,
    mirrorVec,
    recorder,
    socketAt,
} from "../support/impact";

/**
 * Largest rise of energy, net of the drive's work, relative to the energy put in. Pre-flight measured none (0), but
 * against an account that mixes time levels (pre-step contact depth, post-step states). That account is biased by
 * O(ω·dt/2) of the contact energy, about 0.6% for an undamped contact, and the dissipation of every sourced law masks
 * the bias. So this catches gains larger than the dissipation margin (it caught the 6-9% sliding-spring gain in
 * pre-flight); it is not a rounding-level bound. shadowEnergy.test.ts checks the integrator's shadow energy to rounding
 * on undamped, frictionless, central cases.
 */
const ENERGY_TOLERANCE = 1e-9;
const WORLD = testWorld();

describe.each(SCENARIOS)("$name", ({ contact, balls }) => {
    const probe = recorder();
    const result = simulateImpact(contact, balls, WORLD, { probe });
    const g = STANDARD_GRAVITY;

    // Both checks start from the first snapshot rather than t = 0, so that the balls' sink and their turf springs are
    // counted the same way at both ends.
    const [first, ...rest] = probe.snapshots as [ImpactSnapshot, ...ImpactSnapshot[]];

    it("never gains energy beyond the drive's work", () => {
        const base = impactEnergy(first, contact.head, TEST_BALL, g);
        let previous = first;
        let work = 0;
        // Energy put in: the head's initial kinetic energy plus every increment of drive work, whatever its sign.
        let budget = initialHeadEnergy(contact);
        for (const s of rest) {
            const dw = dot(s.drive, sub(socketAt(s.head, contact.head), socketAt(previous.head, contact.head)));
            work += dw;
            budget += Math.abs(dw);
            previous = s;
            const rise = impactEnergy(s, contact.head, TEST_BALL, g) - base - work;
            expect(rise, `t = ${s.t}`).toBeLessThanOrEqual(ENERGY_TOLERANCE * budget);
        }
    });

    it("conserves momentum apart from the turf's, the drive's and gravity's impulses", () => {
        const m = TEST_BALL.mass;
        const momentum = (s: ImpactSnapshot): Vec3 =>
            s.balls.reduce((p, b) => add(p, scale(b.velocity, m)), scale(s.head.velocity, contact.head.mass));
        const weight = vec3(0, 0, -(contact.head.mass + m * first.balls.length) * g);
        let impulse = ZERO;
        let previous = first;
        // A snapshot carries the forces applied during the step that ends at it.
        for (const s of rest) {
            let external = add(s.drive, weight);
            for (const c of s.contacts.filter((x) => x.key.startsWith("turf/"))) {
                external = add(external, add(scale(c.normal, c.normalForce), c.tangentialForce));
            }
            impulse = add(impulse, scale(external, s.t - previous.t));
            previous = s;
        }
        const change = sub(momentum(previous), momentum(first));
        expect(length(sub(change, impulse))).toBeLessThan(1e-9 * contact.head.mass * length(contact.velocity));
    });

    it("never pulls, and keeps friction inside its cone", () => {
        for (const s of probe.snapshots) {
            for (const c of s.contacts) {
                expect(c.normalForce).toBeGreaterThanOrEqual(0);
                expect(length(c.tangentialForce)).toBeLessThanOrEqual(
                    c.law.friction * c.normalForce * (1 + 1e-12) + 1e-15,
                );
            }
        }
    });

    it("is bit-identical when repeated", () => {
        expect(simulateImpact(contact, balls, WORLD)).toStrictEqual(result);
    });

    it("is exactly mirrored by a set-up mirrored across the strike line", () => {
        const reflected: BallStates = {};
        for (const id of BALL_IDS.filter((x) => balls[x])) {
            reflected[id] = mirrorBall(balls[id] as BallState);
        }
        const mirrored = simulateImpact(mirrorContact(contact), reflected, WORLD);
        const same = (a: Vec3, b: Vec3): boolean => a.x === b.x && a.y === b.y && a.z === b.z;
        for (const id of BALL_IDS.filter((x) => balls[x])) {
            const a = result.handover[id] as BallState;
            const b = mirrored.handover[id] as BallState;
            expect(same(mirrorVec(a.position), b.position), `${id} position`).toBe(true);
            expect(same(mirrorVec(a.velocity), b.velocity), `${id} velocity`).toBe(true);
            expect(same(mirrorSpin(a.angularVelocity), b.angularVelocity), `${id} spin`).toBe(true);
        }
        const q = mirrorQuat(result.head.orientation);
        const p = mirrored.head.orientation;
        expect(q.w === p.w && q.x === p.x && q.y === p.y && q.z === p.z).toBe(true);
        expect(mirrored.steps).toBe(result.steps);
        expect(mirrored.events.map((e) => [e.kind, e.t])).toEqual(result.events.map((e) => [e.kind, e.t]));
    });
});
