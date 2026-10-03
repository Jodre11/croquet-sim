import { describe, expect, it } from "vitest";
import { vec3, ZERO } from "../../src/engine/math/vec3";
import {
    advance,
    classify,
    contactSlip,
    endOfPhase,
    landingTime,
    phaseDuration,
    rollingSpin,
    trajectory,
} from "../../src/engine/motion";
import type { BallState, MotionParams } from "../../src/engine/types";
import { kineticEnergy } from "./support/energy";
import { rng } from "./support/rng";

const R = 0.046;
const P: MotionParams = { radius: R, slidingDecel: 3, rollingDecel: 0.5, gravity: 9.80665 };
const BALL = { radius: R, mass: 0.454 };

function ball(velocity = ZERO, angularVelocity = ZERO): BallState {
    return { position: vec3(0, 0, R), velocity, angularVelocity };
}

describe("classify", () => {
    it("distinguishes sliding, rolling and stationary", () => {
        expect(classify(ball(vec3(1, 0, 0)), R)).toBe("sliding");
        expect(classify(ball(vec3(1, 0, 0), rollingSpin(vec3(1, 0, 0), 0, R)), R)).toBe("rolling");
        expect(classify(ball(), R)).toBe("stationary");
        expect(classify(ball(vec3(1e-12, 0, 0)), R)).toBe("stationary");
    });

    it("treats a ball with backspin and no velocity as sliding", () => {
        expect(classify(ball(ZERO, vec3(0, -10, 0)), R)).toBe("sliding");
    });

    it("treats a ball above the lawn plane, or moving vertically, as airborne", () => {
        expect(classify({ ...ball(), position: vec3(0, 0, R + 1e-12) }, R)).toBe("airborne");
        expect(classify(ball(vec3(0, 0, 1e-12)), R)).toBe("airborne");
        expect(classify(ball(vec3(1, 0, -0.5)), R)).toBe("airborne");
    });
});

describe("landingTime", () => {
    const g = 9.80665;

    it("solves a fall from rest, a rise and fall, and a ball already coming down", () => {
        expect(landingTime(0.2, 0, -g)).toBeCloseTo(Math.sqrt(0.4 / g), 15);
        expect(landingTime(0, 1, -g)).toBeCloseTo(2 / g, 15);
        expect(landingTime(0.1, -2, -g)).toBeCloseTo((-2 + Math.sqrt(4 + 2 * g * 0.1)) / g, 15);
    });

    it("is zero for a ball on the plane moving down, and Infinity for one held up", () => {
        expect(landingTime(0, -1, -g)).toBe(0);
        expect(landingTime(0.1, 0, 0)).toBe(Infinity);
        expect(landingTime(0.1, 1, 2)).toBe(Infinity);
    });

    it("treats a height rounded just below zero as zero (no NaN)", () => {
        expect(landingTime(-1e-12, 1e-7, -g)).toBeCloseTo(2e-7 / g, 20);
        expect(landingTime(-1e-17, 1e-9, -g)).toBeCloseTo(2e-9 / g, 22);
    });

    it("finds the first touchdown of a ball decelerating as it descends", () => {
        // 0.1 − 2t + t²: the first root is 1 − √0.9.
        expect(landingTime(0.1, -2, 2)).toBeCloseTo(1 - Math.sqrt(0.9), 15);
    });

    it("lets a ball on the plane at rest rise when its acceleration is upward (lift-off), and land otherwise", () => {
        expect(landingTime(0, 0, 4.9)).toBe(Infinity);
        expect(landingTime(0, 0, -g)).toBe(0);
        expect(landingTime(0, 0, 0)).toBe(0);
    });
});

describe("airborne", () => {
    const s: BallState = { position: vec3(1, 2, R + 0.1), velocity: vec3(1, 0.5, 0.8), angularVelocity: vec3(3, 4, 5) };

    it("follows the ballistic parabola with its spin unchanged", () => {
        const t = 0.1;
        const next = advance(s, "airborne", P, t);
        expect(next.position.x).toBeCloseTo(1 + 0.1, 15);
        expect(next.position.z).toBeCloseTo(R + 0.1 + 0.08 - 0.5 * P.gravity * t * t, 15);
        expect(next.velocity.z).toBeCloseTo(0.8 - P.gravity * t, 15);
        expect(next.angularVelocity).toEqual(s.angularVelocity);
        expect(trajectory(s, "airborne", P).c2).toEqual(vec3(0, 0, -0.5 * P.gravity));
    });

    it("ends exactly on the lawn plane, still moving down", () => {
        const end = endOfPhase(s, "airborne", P);
        expect(end.position.z).toBe(R);
        expect(end.velocity.z).toBeLessThan(0);
        expect(end.position.x).toBeCloseTo(1 + phaseDuration(s, "airborne", P), 12);
    });
});

describe("sliding", () => {
    it("begins rolling at 5/7 of launch speed for a centre-struck spinless ball", () => {
        const s = ball(vec3(2, 0, 0));
        const end = endOfPhase(s, "sliding", P);
        expect(end.velocity.x).toBeCloseTo((5 / 7) * 2, 12);
        expect(end.velocity.y).toBe(0);
        expect(classify(end, R)).toBe("rolling");
        expect(Math.hypot(contactSlip(end, R).x, contactSlip(end, R).y)).toBeLessThanOrEqual(1e-12);
    });

    it("covers the analytic sliding distance", () => {
        const v0 = 2;
        const tau = (2 * v0) / (7 * P.slidingDecel);
        expect(phaseDuration(ball(vec3(v0, 0, 0)), "sliding", P)).toBeCloseTo(tau, 14);
        const end = endOfPhase(ball(vec3(v0, 0, 0)), "sliding", P);
        expect(end.position.x).toBeCloseTo(v0 * tau - 0.5 * P.slidingDecel * tau * tau, 12);
    });

    it("stops shorter with backspin (stop shot) and further with topspin", () => {
        const plain = endOfPhase(ball(vec3(2, 0, 0)), "sliding", P).velocity.x;
        const back = endOfPhase(ball(vec3(2, 0, 0), vec3(0, -20, 0)), "sliding", P).velocity.x;
        const top = endOfPhase(ball(vec3(2, 0, 0), vec3(0, 60, 0)), "sliding", P).velocity.x;
        expect(back).toBeLessThan(plain);
        expect(top).toBeGreaterThan(plain);
    });

    it("curves the path when the slip is not along the velocity", () => {
        // Spin about +x gives the contact point slip toward +y, so friction pulls the ball toward −y.
        const s = ball(vec3(2, 0, 0), vec3(20, 0, 0));
        const end = endOfPhase(s, "sliding", P);
        expect(end.position.y).toBeLessThan(0);
        expect(end.velocity.y).toBeLessThan(0);
    });

    it("keeps the ball on the lawn plane", () => {
        const end = endOfPhase(ball(vec3(2, 1, 0), vec3(3, -7, 4)), "sliding", P);
        expect(end.position.z).toBe(R);
        expect(end.velocity.z).toBe(0);
    });
});

describe("rolling", () => {
    it("stops after v²/(2a)", () => {
        const v = vec3(1.5, 0, 0);
        const end = endOfPhase(ball(v, rollingSpin(v, 0, R)), "rolling", P);
        expect(end.position.x).toBeCloseTo((1.5 * 1.5) / (2 * P.rollingDecel), 12);
        expect(end.velocity).toEqual(ZERO);
        expect(end.angularVelocity).toEqual(ZERO);
    });

    it("keeps spin locked to velocity while rolling", () => {
        const v = vec3(0.6, 0.8, 0);
        const mid = advance(ball(v, rollingSpin(v, 0, R)), "rolling", P, 0.5);
        expect(Math.hypot(contactSlip(mid, R).x, contactSlip(mid, R).y)).toBeLessThan(1e-12);
    });
});

describe("advance", () => {
    it("is the identity at t = 0 and for a stationary ball", () => {
        const s = ball(vec3(1, 0, 0));
        expect(advance(s, "sliding", P, 0)).toEqual(s);
        expect(advance(ball(), "stationary", P, 5)).toEqual(ball());
    });

    it("never increases kinetic energy within a phase", () => {
        const random = rng(1);
        for (let n = 0; n < 200; n++) {
            const s = ball(
                vec3(random() * 4 - 2, random() * 4 - 2, 0),
                vec3(random() * 80 - 40, random() * 80 - 40, random() * 10 - 5),
            );
            const phase = classify(s, R);
            const duration = phaseDuration(s, phase, P);
            let previous = kineticEnergy(s, BALL);
            for (let i = 1; i <= 20; i++) {
                const e = kineticEnergy(advance(s, phase, P, (duration * i) / 20), BALL);
                expect(e).toBeLessThanOrEqual(previous + 1e-12);
                previous = e;
            }
        }
    });
});
