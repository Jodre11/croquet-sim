import { describe, expect, it } from "vitest";
import { approachSpeed } from "../../src/engine/detect";
import { ZERO, add, normalize, scale, sub, vec3, type Vec3 } from "../../src/engine/math/vec3";
import { contactSlip, onTurf } from "../../src/engine/motion";
import { SETTLE_SPEED, resolveBallBall, resolveBallCylinder, resolveLanding } from "../../src/engine/resolve";
import type { BallState, ContactMaterial } from "../../src/engine/types";
import { kineticEnergy } from "./support/energy";
import { rng } from "./support/rng";

const BALL = { radius: 0.046, mass: 0.454 };
const R = BALL.radius;
const M = BALL.mass;
const I = 0.4 * M * R * R;
const TURF_MATERIAL: ContactMaterial = { restitution: 0.5, friction: 0.3 };
const TURF = (): ContactMaterial => TURF_MATERIAL;
const SLICK = (): ContactMaterial => ({ restitution: 0.5, friction: 0 });

function at(x: number, y: number, velocity = ZERO, angularVelocity = ZERO): BallState {
    return { position: vec3(x, y, R), velocity, angularVelocity };
}

function flying(position: Vec3, velocity = ZERO, angularVelocity = ZERO): BallState {
    return { position, velocity, angularVelocity };
}

/**
 * A random pair touching along a random direction up to 37° from horizontal. The lower ball is on the turf unless
 * both are lifted; balls in flight get a random vertical velocity.
 */
function randomPair(random: () => number): readonly [BallState, BallState] {
    const n = normalize(vec3(random() * 2 - 1, random() * 2 - 1, (random() * 2 - 1) * 0.75));
    const lift = random() < 0.3 ? random() * 0.02 : 0;
    const base = n.z >= 0 ? vec3(0, 0, R + lift) : vec3(0, 0, R + lift - 2 * R * n.z);
    const pa = base;
    const pb = n.z >= 0 ? add(base, scale(n, 2 * R)) : vec3(2 * R * n.x, 2 * R * n.y, R + lift);
    const spin = (): Vec3 => vec3(random() * 60 - 30, random() * 60 - 30, random() * 20 - 10);
    const velocity = (p: Vec3): Vec3 => vec3(random() * 3 - 1, random() * 2 - 1, p.z === R ? 0 : random() * 2 - 1);
    return [flying(pa, velocity(pa), spin()), flying(pb, velocity(pb), spin())];
}

describe("resolveBallBall", () => {
    it("exchanges velocities in a head-on perfectly elastic frictionless impact", () => {
        const [a, b] = resolveBallBall(
            at(0, 0, vec3(1, 0, 0)),
            at(2 * R, 0),
            BALL,
            { restitution: 1, friction: 0 },
            TURF,
        );
        expect(a.velocity.x).toBeCloseTo(0, 15);
        expect(b.velocity.x).toBeCloseTo(1, 15);
    });

    it("applies restitution along the line of centres", () => {
        const [a, b] = resolveBallBall(
            at(0, 0, vec3(1, 0, 0)),
            at(2 * R, 0),
            BALL,
            { restitution: 0.8, friction: 0 },
            TURF,
        );
        expect(a.velocity.x).toBeCloseTo(0.1, 14);
        expect(b.velocity.x).toBeCloseTo(0.9, 14);
    });

    it("returns the same objects when the balls are separating", () => {
        const sa = at(0, 0, vec3(-1, 0, 0));
        const sb = at(2 * R, 0);
        const [a, b] = resolveBallBall(sa, sb, BALL, { restitution: 0.8, friction: 0.1 }, TURF);
        expect(a).toBe(sa);
        expect(b).toBe(sb);
    });

    it("never gains energy and never drives a ball on the turf into it (random 3D impacts)", () => {
        const random = rng(7);
        for (let n = 0; n < 1000; n++) {
            const [sa, sb] = randomPair(random);
            const material = { restitution: random(), friction: random() * 0.5 };
            const [a, b] = resolveBallBall(sa, sb, BALL, material, TURF);
            const before = kineticEnergy(sa, BALL) + kineticEnergy(sb, BALL);
            expect(kineticEnergy(a, BALL) + kineticEnergy(b, BALL)).toBeLessThanOrEqual(before + 1e-12);
            for (const [s0, s1] of [
                [sa, a],
                [sb, b],
            ] as const) {
                expect(s1.position).toBe(s0.position);
                if (onTurf(s0, R)) {
                    expect(s1.velocity.z === 0 || s1.velocity.z >= SETTLE_SPEED).toBe(true);
                }
            }
        }
    });

    it("conserves horizontal momentum apart from turf friction, and the turf only ever pushes up", () => {
        const random = rng(17);
        for (let n = 0; n < 1000; n++) {
            const [sa, sb] = randomPair(random);
            const [a, b] = resolveBallBall(sa, sb, BALL, { restitution: random(), friction: random() * 0.5 }, SLICK);
            const before = add(sa.velocity, sb.velocity);
            const after = add(a.velocity, b.velocity);
            expect(after.x).toBeCloseTo(before.x, 12);
            expect(after.y).toBeCloseTo(before.y, 12);
            // The settle rule can only remove an upward speed below SETTLE_SPEED from each ball.
            expect(after.z).toBeGreaterThanOrEqual(before.z - 2 * SETTLE_SPEED);
        }
    });

    it("never leaves the pair approaching (random 3D impacts, inclined normals with turf support)", () => {
        const random = rng(23);
        for (let n = 0; n < 2000; n++) {
            const [sa, sb] = randomPair(random);
            const material = { restitution: random(), friction: random() * 0.5 };
            // Without turf friction the contact impulse is all that acts on the pair's normal speed.
            const [a, b] = resolveBallBall(sa, sb, BALL, material, SLICK);
            expect(approachSpeed(sub(a.position, b.position), sub(a.velocity, b.velocity))).toBeLessThanOrEqual(1e-12);
        }
    });

    it("lifts a rolling striker: its topspin rubs down on the object ball, which the turf holds (closed form)", () => {
        const v = 2;
        const material = { restitution: 0.8, friction: 0.05 };
        const [a, b] = resolveBallBall(at(0, 0, vec3(v, 0, 0), vec3(0, v / R, 0)), at(2 * R, 0), BALL, material, TURF);
        // The contact point of a rolling ball moves down at v. Normal impulse (both horizontal): Pn = (1 + e)·m·v/2.
        // Friction pushes the striker up, so it is free; the object ball is pressed down and stays supported. The
        // vertical slip compliance is then (1 + 5)/m, so λ = min(μ·Pn, m·v/6).
        const pn = ((1 + material.restitution) * M * v) / 2;
        const lambda = Math.min(material.friction * pn, (M * v) / 6);
        expect(a.velocity.x).toBeCloseTo(v - pn / M, 12);
        expect(a.velocity.z).toBeCloseTo(lambda / M, 12);
        expect(a.angularVelocity.y).toBeCloseTo(v / R - (R * lambda) / I, 9);
        // The turf takes λ under the object ball, with impulsive friction against its slip Pn/m + R²·λ/I.
        const slip = pn / M + (R * R * lambda) / I;
        const f = Math.min(TURF_MATERIAL.friction * lambda, (2 * M * slip) / 7);
        expect(b.velocity.x).toBeCloseTo((pn - f) / M, 12);
        expect(b.velocity.z).toBe(0);
        expect(b.angularVelocity.y).toBeCloseTo((-R * lambda + R * f) / I, 9);
        expect(b.position.z).toBe(R);
    });

    it("drives a ball struck above its equator into the turf, which spins it up (closed form)", () => {
        // Blue, in flight, meets red along n = (cos α, 0, −sin α); no ball–ball friction.
        const sin = 0.2;
        const cos = Math.sqrt(1 - sin * sin);
        const v = 3;
        const e = 0.8;
        const sb = at(2 * R * cos, 0);
        const sa = flying(vec3(0, 0, R + 2 * R * sin), vec3(v, 0, 0));
        const [a, b] = resolveBallBall(sa, sb, BALL, { restitution: e, friction: 0 }, TURF);
        // Red is supported (it does not move vertically), so nᵀKn = (1 + cos²α)/m.
        const pn = ((1 + e) * v * cos * M) / (1 + cos * cos);
        expect(a.velocity.x).toBeCloseTo(v - (pn * cos) / M, 12);
        expect(a.velocity.z).toBeCloseTo((pn * sin) / M, 12);
        // The turf takes Λ = Pn·sin α and its friction acts against red's slip Pn·cos α/m.
        const load = pn * sin;
        const f = Math.min(TURF_MATERIAL.friction * load, (2 * M * ((pn * cos) / M)) / 7);
        expect(b.velocity.x).toBeCloseTo((pn * cos - f) / M, 12);
        expect(b.velocity.z).toBe(0);
        expect(b.angularVelocity.y).toBeCloseTo((R * f) / I, 9);
        expect(b.angularVelocity.y).toBeGreaterThan(0);
    });

    it("bounds the tangential impulse by friction × normal impulse (balls in flight)", () => {
        const random = rng(5);
        for (let n = 0; n < 200; n++) {
            const dir = normalize(vec3(1, random() - 0.5, random() - 0.5));
            const sa = flying(vec3(0, 0, 1), vec3(2, 0, 0), vec3(random() * 80 - 40, random() * 80 - 40, 30));
            const sb = flying(add(vec3(0, 0, 1), scale(dir, 2 * R)));
            const material = { restitution: 0.8, friction: 0.05 };
            const [, b] = resolveBallBall(sa, sb, BALL, material, TURF);
            const impulse = scale(b.velocity, M);
            const normal = impulse.x * dir.x + impulse.y * dir.y + impulse.z * dir.z;
            const tangential = sub(impulse, scale(dir, normal));
            expect(Math.hypot(tangential.x, tangential.y, tangential.z)).toBeLessThanOrEqual(
                material.friction * normal + 1e-12,
            );
        }
    });

    it("applies an impulse exactly when approachSpeed says the pair is approaching (I2)", () => {
        const random = rng(3);
        for (let n = 0; n < 500; n++) {
            const angle = random() * 2 * Math.PI;
            const sa = at(0, 0, vec3(random() * 2e-9 - 1e-9, random() * 2e-9 - 1e-9, 0), vec3(0, 0, random()));
            const sb = at(2 * R * Math.cos(angle), 2 * R * Math.sin(angle));
            const approaching = approachSpeed(sub(sa.position, sb.position), sub(sa.velocity, sb.velocity)) > 0;
            const [a] = resolveBallBall(sa, sb, BALL, { restitution: 0.8, friction: 0.05 }, TURF);
            expect(a !== sa).toBe(approaching);
        }
    });

    it("leaves spin untouched without friction", () => {
        const w = vec3(3, -4, 5);
        const [a] = resolveBallBall(
            at(0, 0, vec3(1, 0.2, 0), w),
            at(2 * R, 0),
            BALL,
            { restitution: 0.8, friction: 0 },
            TURF,
        );
        expect(a.angularVelocity).toEqual(w);
    });
});

describe("resolveBallCylinder", () => {
    const axis = vec3(R + 0.008, 0, 0);

    it("reverses the normal velocity scaled by restitution", () => {
        const s = resolveBallCylinder(at(0, 0, vec3(1, 0, 0)), axis, BALL, { restitution: 0.5, friction: 0 }, TURF);
        expect(s.velocity.x).toBeCloseTo(-0.5, 14);
        expect(s.velocity.y).toBeCloseTo(0, 14);
        expect(s.velocity.z).toBe(0);
    });

    it("ignores a ball moving away", () => {
        const s0 = at(0, 0, vec3(-1, 0, 0));
        expect(resolveBallCylinder(s0, axis, BALL, { restitution: 0.5, friction: 0.2 }, TURF)).toBe(s0);
    });

    it("lifts a rolling ball: its topspin rubs down on the upright (closed form)", () => {
        const v = 2;
        const material = { restitution: 0.5, friction: 0.1 };
        const s = resolveBallCylinder(at(0, 0, vec3(v, 0, 0), vec3(0, v / R, 0)), axis, BALL, material, TURF);
        // Normal impulse (1 + e)·m·v; friction pushes the ball up, so it is free: slip compliance 7/(2m).
        const lambda = Math.min(material.friction * (1 + material.restitution) * M * v, (2 * M * v) / 7);
        expect(s.velocity.x).toBeCloseTo(-material.restitution * v, 12);
        expect(s.velocity.z).toBeCloseTo(lambda / M, 12);
        expect(s.angularVelocity.y).toBeCloseTo(v / R - (R * lambda) / I, 9);
    });

    it("measures the contact horizontally at any height", () => {
        const s = resolveBallCylinder(
            flying(vec3(0, 0, 0.2), vec3(1, 0, -0.5)),
            axis,
            BALL,
            { restitution: 0.5, friction: 0 },
            TURF,
        );
        expect(s.velocity.x).toBeCloseTo(-0.5, 14);
        expect(s.velocity.z).toBe(-0.5);
    });

    it("never gains energy and never drives a ball on the turf into it (random glancing impacts)", () => {
        const random = rng(11);
        for (let n = 0; n < 1000; n++) {
            const angle = Math.PI + (random() * 2 - 1);
            const c = sub(vec3(0, 0, 0), scale(vec3(Math.cos(angle), Math.sin(angle), 0), R + 0.008));
            const lifted = random() < 0.3;
            const s0 = flying(
                vec3(0, 0, lifted ? R + random() * 0.05 : R),
                vec3(random() * 2 - 1, random() * 2 - 1, lifted ? random() * 2 - 1 : 0),
                vec3(random() * 60 - 30, random() * 60 - 30, random() * 20 - 10),
            );
            const material = { restitution: random(), friction: random() * 0.5 };
            const s = resolveBallCylinder(s0, c, BALL, material, TURF);
            expect(kineticEnergy(s, BALL)).toBeLessThanOrEqual(kineticEnergy(s0, BALL) + 1e-12);
            if (!lifted) {
                expect(s.velocity.z === 0 || s.velocity.z >= SETTLE_SPEED).toBe(true);
            }
        }
    });
});

describe("resolveLanding", () => {
    it("rebounds with the turf's restitution and leaves a rolling ball's horizontal motion alone", () => {
        const s = resolveLanding(flying(vec3(1, 2, R), vec3(1, 0, -2), vec3(0, 1 / R, 0)), BALL, TURF_MATERIAL);
        expect(s.velocity).toEqual(vec3(1, 0, 1));
        expect(s.angularVelocity).toEqual(vec3(0, 1 / R, 0));
        expect(s.position).toEqual(vec3(1, 2, R));
    });

    it("applies Coulomb turf friction from the landing impulse (closed form)", () => {
        const s0 = flying(vec3(0, 0, R), vec3(1, 0, -0.5), vec3(0, -30, 0));
        const s = resolveLanding(s0, BALL, TURF_MATERIAL);
        const load = (1 + TURF_MATERIAL.restitution) * M * 0.5;
        const f = TURF_MATERIAL.friction * load;
        // Coulomb-limited: the stick cap 2m/7 × slip is larger.
        expect(f).toBeLessThan((2 * M * contactSlip(s0, R).x) / 7);
        expect(s.velocity.x).toBeCloseTo(1 - f / M, 12);
        expect(s.angularVelocity.y).toBeCloseTo(-30 + (R * f) / I, 9);
    });

    it("stops the turf slip when friction is strong enough", () => {
        const s = resolveLanding(flying(vec3(0, 0, R), vec3(1, 0, -2), vec3(0, -30, 0)), BALL, TURF_MATERIAL);
        expect(contactSlip(s, R).x).toBeCloseTo(0, 12);
    });

    it("keeps a ball on the turf when the rebound would be slower than the settle speed", () => {
        const down = 1.5 * SETTLE_SPEED;
        const s = resolveLanding(flying(vec3(0, 0, R), vec3(0.3, 0, -down)), BALL, TURF_MATERIAL);
        expect(onTurf(s, R)).toBe(true);
        // The turf then takes only m·|vz| (no rebound), and its friction is μs times that.
        expect(s.velocity.x).toBeCloseTo(0.3 - TURF_MATERIAL.friction * down, 15);
    });

    it("never gains energy (random landings)", () => {
        const random = rng(13);
        for (let n = 0; n < 500; n++) {
            const s0 = flying(
                vec3(0, 0, R),
                vec3(random() * 4 - 2, random() * 4 - 2, -random() * 5),
                vec3(random() * 80 - 40, random() * 80 - 40, random() * 20 - 10),
            );
            const material = { restitution: random(), friction: random() };
            expect(kineticEnergy(resolveLanding(s0, BALL, material), BALL)).toBeLessThanOrEqual(
                kineticEnergy(s0, BALL) + 1e-12,
            );
        }
    });
});
