import { describe, expect, it } from "vitest";
import { flexForce, flexGains } from "../../../src/engine/impact/flex";
import type { FlexLaw } from "../../../src/engine/impact/types";
import { vec3 } from "../../../src/engine/math/vec3";

/** A plausible, unsourced law (as the test support's): k₀ 200 N/m, κ 20 /m, ζ 0.3 on 0.5 kg, no posture hold. */
const LAW: FlexLaw = { stiffness: 200, stiffnessPerForce: 20, dampingRatio: 0.3, endpointMass: 0.5, hold: null };

describe("the flex law (P2b.2b.2b.2b design §3.1)", () => {
    it("stiffens linearly with the hand's voluntary force: k = k₀ + κ·|F_ff|", () => {
        expect(flexGains(LAW, 0).stiffness).toBe(200);
        expect(flexGains(LAW, 10).stiffness).toBe(400);
        expect(flexGains(LAW, 100).stiffness).toBe(2200);
    });

    it("holds the damping ratio on the endpoint mass: c = 2·ζ·√(k·m)", () => {
        for (const force of [0, 10, 100]) {
            const { stiffness, damping } = flexGains(LAW, force);
            expect(damping).toBeCloseTo(2 * 0.3 * Math.sqrt(stiffness * 0.5), 12);
        }
    });

    it("gives F_ff less the spring and the damper", () => {
        const gains = flexGains(LAW, 10);
        const force = flexForce(vec3(1, 2, 30), gains, vec3(0.01, 0, -0.02), vec3(0, 0.5, 0));
        expect(force.x).toBeCloseTo(1 - 400 * 0.01, 12);
        expect(force.y).toBeCloseTo(2 - gains.damping * 0.5, 12);
        expect(force.z).toBeCloseTo(30 + 400 * 0.02, 12);
    });

    it("clamps a hold weight above 1 to the held gains, never past them", () => {
        // A weight past 1 would extrapolate beyond the held gains, and could drive the damping negative.
        const held: FlexLaw = { ...LAW, hold: { stiffness: 700, damping: 5 } };
        expect(flexGains(held, 10, 2)).toEqual(flexGains(held, 10, 1));
        expect(flexGains(held, 10, 1).stiffness).toBeCloseTo(900, 9);
        expect(flexGains(held, 10, 1).damping).toBeCloseTo(5, 9);
    });

    it("has no runaway: the spring's force is linear in its offset, its stiffness set by F_ff alone", () => {
        // Design §3.1: a law on the total force, k = k₀ + κ·|F|, would run away at x = 1/κ. Here k reads only the
        // feed-forward, so ten times the offset gives exactly ten times the spring's force.
        const gains = flexGains(LAW, 10);
        const fed = vec3(0, 0, 10);
        const small = flexForce(fed, gains, vec3(0.001, 0, 0), vec3(0, 0, 0));
        const large = flexForce(fed, gains, vec3(0.01, 0, 0), vec3(0, 0, 0));
        expect(large.x).toBeCloseTo(10 * small.x, 12);
        expect(large.z).toBe(small.z);
    });
});
