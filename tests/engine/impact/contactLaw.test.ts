import { describe, expect, it } from "vitest";
import { contactReference } from "../../../src/reference/index";
import { length, scale, sub, vec3 } from "../../../src/engine/math/vec3";
import {
    FACE_SPEED_MAX,
    FACE_SPEED_MIN,
    TANGENTIAL_STIFFNESS_RATIO,
    ZETA_MAX,
    carrySpring,
    closeFace,
    contactTimeFactor,
    dampingRatio,
    faceContactTimeAt,
    faceRestitutionAt,
    hertzBounce,
    hertzEnergy,
    hertzForce,
    hertzTangent,
    lawFromContactTime,
    lawFromStiffness,
    lnRestitution,
    normalForce,
    tangentialForce,
} from "../../../src/engine/impact/contactLaw";
import type { FaceLaw } from "../../../src/engine/impact/types";

/**
 * Independent check of the clamped law: integrates δ'' = −2ζ·δ' − δ (m = k = 1) from δ = 0, δ' = 1 by RK4 until the
 * force δ + 2ζ·δ' first falls to zero, and returns the release time and the rebound speed −δ' there (linear
 * interpolation inside the last step).
 */
function clampedByOde(zeta: number): { time: number; restitution: number } {
    const h = 1e-4;
    const f = (d: number, v: number): [number, number] => [v, -2 * zeta * v - d];
    let d = 0;
    let v = 1;
    let t = 0;
    for (;;) {
        const [k1d, k1v] = f(d, v);
        const [k2d, k2v] = f(d + (h / 2) * k1d, v + (h / 2) * k1v);
        const [k3d, k3v] = f(d + (h / 2) * k2d, v + (h / 2) * k2v);
        const [k4d, k4v] = f(d + h * k3d, v + h * k3v);
        const nd = d + (h / 6) * (k1d + 2 * k2d + 2 * k3d + k4d);
        const nv = v + (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
        const before = d + 2 * zeta * v;
        const after = nd + 2 * zeta * nv;
        if (t > 0 && after <= 0) {
            const s = before / (before - after);
            return { time: t + s * h, restitution: -(v + s * (nv - v)) };
        }
        d = nd;
        v = nv;
        t += h;
    }
}

describe("clamped restitution and contact time", () => {
    it("is undamped at ζ = 0: half a period, e = 1", () => {
        expect(contactTimeFactor(0)).toBe(Math.PI);
        expect(lnRestitution(0)).toBe(0);
    });

    it("gives e = exp(−π/2) at ζ = 1/√2 and exp(−2) at ζ = 1", () => {
        expect(lnRestitution(Math.SQRT1_2)).toBeCloseTo(-Math.PI / 2, 13);
        expect(contactTimeFactor(1)).toBe(2);
        expect(lnRestitution(1)).toBe(-2);
    });

    it("is continuous across ζ = 1/√2 and ζ = 1", () => {
        for (const z of [Math.SQRT1_2, 1]) {
            expect(Math.abs(contactTimeFactor(z - 1e-9) - contactTimeFactor(z + 1e-9))).toBeLessThan(1e-6);
            expect(Math.abs(lnRestitution(z - 1e-9) - lnRestitution(z + 1e-9))).toBeLessThan(1e-6);
        }
    });

    it("matches the overdamped closed form at ζ = 2", () => {
        const tau = (2 * Math.log(2 + Math.sqrt(3))) / Math.sqrt(3);
        expect(contactTimeFactor(2)).toBeCloseTo(tau, 13);
        expect(lnRestitution(2)).toBeCloseTo(-2 * tau, 13);
    });

    it("agrees with direct integration of the clamped law on every branch", () => {
        for (const zeta of [0, 0.3, 0.7, 0.75, 0.9, 1, 1.2, 2.5]) {
            const ode = clampedByOde(zeta);
            expect(Math.abs(contactTimeFactor(zeta) - ode.time), `ζ = ${zeta}`).toBeLessThan(1e-6);
            expect(Math.abs(Math.exp(lnRestitution(zeta)) - ode.restitution), `ζ = ${zeta}`).toBeLessThan(1e-6);
        }
    });

    it("falls monotonically to below 1e-12 at ZETA_MAX", () => {
        let previous = 1;
        for (let z = 0.01; z < 50; z *= 1.1) {
            const ln = lnRestitution(z);
            expect(ln).toBeLessThan(previous);
            previous = ln;
        }
        expect(lnRestitution(ZETA_MAX)).toBeLessThan(Math.log(1e-12));
    });
});

describe("dampingRatio", () => {
    it("round-trips every restitution in (0, 1]", () => {
        for (const e of [1, 0.999999, 0.9, 0.817, 0.72, 0.5, 0.2079, 0.15, Math.exp(-2), 0.1, 1e-3, 1e-9]) {
            const z = dampingRatio(e);
            expect(Math.abs(lnRestitution(z) - Math.log(e)), `e = ${e}`).toBeLessThanOrEqual(
                1e-12 * Math.max(1, Math.abs(Math.log(e))),
            );
        }
        expect(dampingRatio(1)).toBe(0);
    });

    it("lands on the right branch around the critical band", () => {
        expect(dampingRatio(0.25)).toBeLessThan(Math.SQRT1_2);
        expect(dampingRatio(0.15)).toBeGreaterThan(Math.SQRT1_2);
        expect(dampingRatio(0.15)).toBeLessThan(1);
        expect(dampingRatio(0.1)).toBeGreaterThan(1);
        expect(dampingRatio(Math.exp(-2))).toBeCloseTo(1, 6);
    });

    it("returns ZETA_MAX below the smallest restitution it represents", () => {
        expect(dampingRatio(1e-300)).toBe(ZETA_MAX);
    });
});

describe("pair laws", () => {
    it("reproduces the contact time and sets k_t = 2/7·k", () => {
        const law = lawFromContactTime(0.3, 0.8, 8e-4, 0.4);
        const zeta = dampingRatio(0.8);
        const omega = Math.sqrt(law.stiffness / 0.3);
        expect(contactTimeFactor(zeta) / omega).toBeCloseTo(8e-4, 15);
        expect(law.damping).toBeCloseTo(2 * zeta * Math.sqrt(law.stiffness * 0.3), 9);
        expect(law.tangentialStiffness).toBe(TANGENTIAL_STIFFNESS_RATIO * law.stiffness);
        expect(law.tangentialDamping).toBeCloseTo(2 * zeta * Math.sqrt(law.tangentialStiffness * 0.3), 9);
        expect(law.friction).toBe(0.4);
    });

    it("takes a stiffness as given", () => {
        const law = lawFromStiffness(0.45, 0.5, 2e5, 0.3);
        expect(law.stiffness).toBe(2e5);
        expect(law.damping).toBeCloseTo(2 * dampingRatio(0.5) * Math.sqrt(2e5 * 0.45), 9);
    });

    it("matches the sourced tangential ratio", () => {
        expect(TANGENTIAL_STIFFNESS_RATIO).toBe(contactReference.tangentialStiffnessRatio.value);
    });
});

describe("forces", () => {
    const law = lawFromStiffness(0.45, 0.5, 2e5, 0.3);

    it("never pulls", () => {
        expect(normalForce(law, 1e-4, -100)).toBe(0);
        expect(normalForce(law, 1e-4, 0)).toBe(20);
    });

    it("keeps a stuck contact's trial force and spring", () => {
        const spring = vec3(1e-6, 0, 0);
        const t = tangentialForce(law, spring, vec3(0, 0, 0), 100);
        expect(t.sliding).toBe(false);
        expect(t.spring).toBe(spring);
        expect(t.force).toEqual(scale(spring, -law.tangentialStiffness));
    });

    it("scales a sliding contact's force onto the cone and resets its spring to carry it alone", () => {
        const slip = vec3(0.3, -0.1, 0);
        const t = tangentialForce(law, vec3(1e-3, 2e-4, 0), slip, 2);
        expect(t.sliding).toBe(true);
        expect(length(t.force)).toBeCloseTo(0.3 * 2, 12);
        // −k_t·ξ = force, so the stored energy is (μ·N)²/(2·k_t): no displacement held against the dashpot.
        expect(length(sub(scale(t.spring, -law.tangentialStiffness), t.force))).toBeLessThan(1e-12);
    });

    it("holds its force, without a jump, when a sliding contact stops slipping", () => {
        // The spring alone sits on the cone, so the next trial force lies on it too (to an ulp either side).
        const slid = tangentialForce(law, vec3(1e-3, 2e-4, 0), vec3(0.3, -0.1, 0), 2);
        const next = tangentialForce(law, slid.spring, vec3(0, 0, 0), 2);
        expect(length(sub(next.force, slid.force))).toBeLessThan(1e-12);
    });

    it("carries no friction without load", () => {
        const t = tangentialForce(law, vec3(1e-3, 0, 0), vec3(0.1, 0, 0), 0);
        expect(length(t.force)).toBe(0);
        expect(t.sliding).toBe(true);
    });
});

/**
 * A clamped Hertz–Kuwabara–Kono contact integrated directly (RK4, step h over the contact): reduced mass m meeting at
 * U, m·δ'' = −√δ·(k·δ + c·δ′). Returns e (the velocity at release over U) and T (when the force falls to zero), with
 * the release interpolated within its step.
 */
function directBounce(m: number, k: number, c: number, U: number, h = 1e-8): { e: number; T: number } {
    const accel = (x: number, v: number): number => (x > 0 ? -(Math.sqrt(x) * (k * x + c * v)) / m : 0);
    let x = 0;
    let v = U;
    let t = 0;
    let phi = c * v;
    for (;;) {
        const k1x = v;
        const k1v = accel(x, v);
        const k2x = v + (h / 2) * k1v;
        const k2v = accel(x + (h / 2) * k1x, v + (h / 2) * k1v);
        const k3x = v + (h / 2) * k2v;
        const k3v = accel(x + (h / 2) * k2x, v + (h / 2) * k2v);
        const k4x = v + h * k3v;
        const k4v = accel(x + h * k3x, v + h * k3v);
        const nx = x + (h / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
        const nv = v + (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
        const nphi = k * nx + c * nv;
        if (t > 0 && nphi <= 0) {
            const theta = phi / (phi - nphi);
            return { e: -(v + theta * (nv - v)) / U, T: t + theta * h };
        }
        x = nx;
        v = nv;
        t += h;
        phi = nphi;
    }
}

const FACE: FaceLaw = { mass: 0.3, friction: 0.5 };

describe("the face fits", () => {
    it("give Gugan's e and T at the ends of the range", () => {
        expect(faceRestitutionAt(0.5)).toBeCloseTo(0.854, 3);
        expect(faceRestitutionAt(6)).toBeCloseTo(0.793, 3);
        expect(faceContactTimeAt(2.19)).toBeCloseTo(0.97e-3, 9);
        expect(FACE_SPEED_MIN).toBe(0.5);
        expect(FACE_SPEED_MAX).toBe(6);
    });
});

describe("hertzBounce", () => {
    it("is elastic and lasts Hertz's τ = 3.2181 undamped (the dimensionless law)", () => {
        // Undamped Hertz: τ = 2·∫₀¹ dx/√(1 − x^{5/2}) in these units, 3.21806… (pre-flight, RK4 at 1e-5).
        const b = hertzBounce(0);
        expect(b.restitution).toBeCloseTo(1, 8);
        expect(b.duration).toBeCloseTo(3.218065, 5);
    });

    it("falls monotonically in e as the damping grows", () => {
        let last = 1;
        for (const c of [0.05, 0.1, 0.2, 0.5, 1]) {
            const e = hertzBounce(c).restitution;
            expect(e).toBeLessThan(last);
            last = e;
        }
    });
});

describe("closeFace", () => {
    it.each([0.5, 2.19, 2.83, 4.0, 5.5, 6.0])(
        "sets k and c so that a direct integration at %s m/s gives the fit's e within 1e-4 and T within 0.1 %",
        (U) => {
            const closure = closeFace(FACE, U);
            const { e, T } = directBounce(FACE.mass, closure.stiffness, closure.damping, U);
            expect(Math.abs(e - faceRestitutionAt(U))).toBeLessThan(1e-4);
            expect(Math.abs(T - faceContactTimeAt(U)) / faceContactTimeAt(U)).toBeLessThan(1e-3);
        },
    );

    it("takes the clamped speed's law outside [0.5, 6] m/s", () => {
        expect(closeFace(FACE, 0.2)).toEqual({ ...closeFace(FACE, 0.5), speed: 0.2 });
        expect(closeFace(FACE, 9)).toEqual({ ...closeFace(FACE, 6), speed: 9 });
    });

    it("takes the 0.5 m/s law at a closing speed of zero or less (review focus 1)", () => {
        for (const U of [0, -0.3, -0]) {
            const closure = closeFace(FACE, U);
            expect(closure.stiffness).toBe(closeFace(FACE, 0.5).stiffness);
            expect(closure.damping).toBe(closeFace(FACE, 0.5).damping);
            expect(Number.isFinite(closure.stiffness) && closure.stiffness > 0).toBe(true);
        }
    });

    it("scales k and c with the reduced mass, as a law in m, k and U must", () => {
        const light = closeFace({ mass: 0.2, friction: 0.5 }, 3);
        const heavy = closeFace({ mass: 0.4, friction: 0.5 }, 3);
        expect(heavy.stiffness / light.stiffness).toBeCloseTo(2, 12);
        expect(heavy.damping / light.damping).toBeCloseTo(2, 12);
    });
});

describe("the Hertzian force", () => {
    const closure = closeFace(FACE, 3);

    it("rises from zero at touch with no step, and never pulls", () => {
        expect(hertzForce(closure, 0, 3)).toBe(0);
        // At δ = 1e-12 the force is c·√δ·U ≈ 0.02 N (c ≈ 6.4e3): no step, but not below 1e-3 N in absolute terms. It is
        // under a thousandth of the force at δ = 1e-5.
        expect(hertzForce(closure, 1e-12, 3)).toBeLessThan(1e-3 * hertzForce(closure, 1e-5, 3));
        for (const rate of [-10, -1, 0, 1, 10]) {
            expect(hertzForce(closure, 1e-5, rate)).toBeGreaterThanOrEqual(0);
        }
    });

    it("has k_t = (2/7)·(3/2)·k·√δ and c_t = c·√δ·√(2/7) at a closed contact", () => {
        const depth = 2e-5;
        const law = hertzTangent(closure, depth);
        expect(law.tangentialStiffness).toBeCloseTo(
            TANGENTIAL_STIFFNESS_RATIO * 1.5 * closure.stiffness * Math.sqrt(depth),
            6,
        );
        expect(law.tangentialDamping).toBeCloseTo(
            closure.damping * Math.sqrt(depth) * Math.sqrt(TANGENTIAL_STIFFNESS_RATIO),
            9,
        );
        expect(law.friction).toBe(FACE.friction);
    });

    it("stores (2/5)·k·δ^{5/2}, the work of the elastic part", () => {
        const depth = 3e-5;
        expect(hertzEnergy(closure, depth)).toBeCloseTo(0.4 * closure.stiffness * Math.pow(depth, 2.5), 12);
    });
});

describe("carrySpring", () => {
    const n = vec3(0, 0, 1);

    it("projects the spring onto the tangent plane", () => {
        expect(carrySpring(vec3(1e-6, 2e-6, 3e-6), n, 5, 5)).toEqual(vec3(1e-6, 2e-6, 0));
    });

    it("keeps the force when the stiffness grows, and the displacement when it shrinks", () => {
        const grown = carrySpring(vec3(1e-6, 0, 0), n, 100, 400);
        expect(grown.x * 400).toBeCloseTo(1e-6 * 100, 18);
        expect(carrySpring(vec3(1e-6, 0, 0), n, 400, 100)).toEqual(vec3(1e-6, 0, 0));
    });

    it("leaves a spring loaded from rest as it is", () => {
        expect(carrySpring(vec3(1e-6, 0, 0), n, 0, 400)).toEqual(vec3(1e-6, 0, 0));
    });
});
