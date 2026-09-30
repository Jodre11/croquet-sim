import { describe, expect, it } from "vitest";
import { approachSpeed } from "../../src/engine/detect";
import { ZERO, add, scale, sub, vec3 } from "../../src/engine/math/vec3";
import { resolveBallBall, resolveBallCylinder } from "../../src/engine/resolve";
import type { BallState } from "../../src/engine/types";
import { kineticEnergy } from "./support/energy";
import { rng } from "./support/rng";

const BALL = { radius: 0.046, mass: 0.454 };
const R = BALL.radius;

function at(x: number, y: number, velocity = ZERO, angularVelocity = ZERO): BallState {
    return { position: vec3(x, y, R), velocity, angularVelocity };
}

describe("resolveBallBall", () => {
    it("exchanges velocities in a head-on perfectly elastic frictionless impact", () => {
        const [a, b] = resolveBallBall(at(0, 0, vec3(1, 0, 0)), at(2 * R, 0), BALL, { restitution: 1, friction: 0 });
        expect(a.velocity.x).toBeCloseTo(0, 15);
        expect(b.velocity.x).toBeCloseTo(1, 15);
    });

    it("applies restitution along the line of centres", () => {
        const [a, b] = resolveBallBall(at(0, 0, vec3(1, 0, 0)), at(2 * R, 0), BALL, { restitution: 0.8, friction: 0 });
        expect(a.velocity.x).toBeCloseTo(0.1, 14);
        expect(b.velocity.x).toBeCloseTo(0.9, 14);
    });

    it("returns the same objects when the balls are separating", () => {
        const sa = at(0, 0, vec3(-1, 0, 0));
        const sb = at(2 * R, 0);
        const [a, b] = resolveBallBall(sa, sb, BALL, { restitution: 0.8, friction: 0.1 });
        expect(a).toBe(sa);
        expect(b).toBe(sb);
    });

    it("conserves linear momentum and never gains energy (random oblique impacts with spin)", () => {
        const random = rng(7);
        for (let n = 0; n < 500; n++) {
            const angle = random() * 2 - 1;
            const sa = at(
                0,
                0,
                vec3(random() * 3, random() * 2 - 1, 0),
                vec3(random() * 60 - 30, random() * 60 - 30, random() * 20 - 10),
            );
            const sb = at(
                2 * R * Math.cos(angle),
                2 * R * Math.sin(angle),
                vec3(random() - 0.5, random() - 0.5, 0),
                vec3(random() * 20 - 10, random() * 20 - 10, 0),
            );
            const material = { restitution: random(), friction: random() * 0.5 };
            const [a, b] = resolveBallBall(sa, sb, BALL, material);
            const before = add(sa.velocity, sb.velocity);
            const after = add(a.velocity, b.velocity);
            expect(after.x).toBeCloseTo(before.x, 12);
            expect(after.y).toBeCloseTo(before.y, 12);
            const energyBefore = kineticEnergy(sa, BALL) + kineticEnergy(sb, BALL);
            const energyAfter = kineticEnergy(a, BALL) + kineticEnergy(b, BALL);
            expect(energyAfter).toBeLessThanOrEqual(energyBefore + 1e-12);
            expect(a.velocity.z).toBe(0);
            expect(b.velocity.z).toBe(0);
        }
    });

    it("bounds the tangential impulse by friction × normal impulse", () => {
        // Rolling ball strikes a stationary ball at a cut; spin about z creates tangential slip.
        const sa = at(0, 0, vec3(1, 0, 0), vec3(0, 1 / R, 40));
        const sb = at(2 * R * Math.cos(0.5), 2 * R * Math.sin(0.5));
        const material = { restitution: 0.8, friction: 0.05 };
        const [, b] = resolveBallBall(sa, sb, BALL, material);
        const n = vec3(Math.cos(0.5), Math.sin(0.5), 0);
        const normal = b.velocity.x * n.x + b.velocity.y * n.y;
        const tangential = Math.abs(-b.velocity.x * n.y + b.velocity.y * n.x);
        expect(tangential).toBeLessThanOrEqual(material.friction * normal + 1e-12);
        expect(tangential).toBeGreaterThan(0);
    });

    it("applies an impulse exactly when approachSpeed says the pair is approaching (I2)", () => {
        const random = rng(3);
        for (let n = 0; n < 500; n++) {
            const angle = random() * 2 * Math.PI;
            const sa = at(0, 0, vec3(random() * 2e-9 - 1e-9, random() * 2e-9 - 1e-9, 0), vec3(0, 0, random()));
            const sb = at(2 * R * Math.cos(angle), 2 * R * Math.sin(angle));
            const approaching = approachSpeed(sub(sa.position, sb.position), sub(sa.velocity, sb.velocity)) > 0;
            const [a] = resolveBallBall(sa, sb, BALL, { restitution: 0.8, friction: 0.05 });
            expect(a !== sa).toBe(approaching);
        }
    });

    it("leaves spin untouched without friction", () => {
        const w = vec3(3, -4, 5);
        const [a] = resolveBallBall(at(0, 0, vec3(1, 0.2, 0), w), at(2 * R, 0), BALL, {
            restitution: 0.8,
            friction: 0,
        });
        expect(a.angularVelocity).toEqual(w);
    });
});

describe("resolveBallCylinder", () => {
    const axis = vec3(R + 0.008, 0, 0);

    it("reverses the normal velocity scaled by restitution", () => {
        const s = resolveBallCylinder(at(0, 0, vec3(1, 0, 0)), axis, BALL, { restitution: 0.5, friction: 0 });
        expect(s.velocity.x).toBeCloseTo(-0.5, 14);
        expect(s.velocity.y).toBeCloseTo(0, 14);
    });

    it("ignores a ball moving away", () => {
        const s0 = at(0, 0, vec3(-1, 0, 0));
        expect(resolveBallCylinder(s0, axis, BALL, { restitution: 0.5, friction: 0.2 })).toBe(s0);
    });

    it("never gains energy (random glancing impacts with spin)", () => {
        const random = rng(11);
        for (let n = 0; n < 500; n++) {
            const angle = Math.PI + (random() * 2 - 1);
            const c = sub(vec3(0, 0, 0), scale(vec3(Math.cos(angle), Math.sin(angle), 0), R + 0.008));
            const s0 = at(
                0,
                0,
                vec3(random() * 2 - 1, random() * 2 - 1, 0),
                vec3(random() * 60 - 30, random() * 60 - 30, random() * 20 - 10),
            );
            const s = resolveBallCylinder(s0, c, BALL, { restitution: random(), friction: random() * 0.5 });
            expect(kineticEnergy(s, BALL)).toBeLessThanOrEqual(kineticEnergy(s0, BALL) + 1e-12);
            expect(s.velocity.z).toBe(0);
        }
    });
});
