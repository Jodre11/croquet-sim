import { describe, expect, it } from "vitest";
import { lengthSq, vec3 } from "../../../src/engine/math/vec3";
import { lawFromContactTime, lawFromStiffness, type PairLaw } from "../../../src/engine/impact/contactLaw";
import { integrate, type ImpactSetup } from "../../../src/engine/impact/integrate";
import { BED_CELL, freshBed } from "../../../src/engine/impact/turfBed";
import type { BedLaw, HeadState } from "../../../src/engine/impact/types";
import type { BallState } from "../../../src/engine/types";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import { TEST_BALL } from "../support/fixtures";
import { freeBall, isolated, recorder } from "../support/impact";

/**
 * The integrator's shadow energy (P2b.1 outcomes, "Energy invariant"). Semi-implicit Euler, v' = v + F(x)·dt/m then
 * x' = x + v'·dt, conserves exactly
 *   Qₙ = Σ ½·m·vₙ² + Σ ½·k·δₙ·δₙ₋₁ + Σ m·g·(zₙ + zₙ₋₁)/2
 * for linear springs and constant forces, because each step's kinetic change F(xₙ)·(xₙ₊₁ − xₙ₋₁)/2 is exactly minus
 * the change of the other two terms. The clamped spring pushes with k·δ⁺ (δ⁺ = max(δ, 0)), so Q is built from δ⁺ and
 * the identity breaks only on a step next to the contact's onset or release, by exactly
 *   Jₙ = ½·k·δ⁺ₙ·((δ⁺ₙ₊₁ − δₙ₊₁) − (δ⁺ₙ₋₁ − δₙ₋₁)),
 * computed here from the signed depths. Q less the accumulated J is then constant to rounding, which the time-level
 * mix of invariants.test.ts cannot be. The cases are undamped (e = 1), frictionless and central, so that each depth is
 * linear in the positions and the head does not turn; rotation, damping and friction have no exact shadow energy here.
 *
 * The face is Hertzian since P2b.2b.2b.2a: a nonlinear spring has no exact shadow energy under this scheme, so the
 * face's energy is checked by invariants.test.ts through `storedEnergy`.
 */

const R = TEST_BALL.radius;
const M = TEST_BALL.mass;
/**
 * Drift allowed in Q − ΣJ, relative to the initial kinetic energy: rounding over a few thousand steps. Measured: at
 * most 6.6e-13 (the undamped bed, 4000 steps; P2b.2b.2b.2a: turf bed, was 2.5e-13 on the plane turf), against onset
 * and release jumps of 5.1e-6 (the bed's 1664 cells; was 7e-7 on the plane) and 1.1e-4 (ball–ball).
 */
const SHADOW_TOLERANCE = 1e-11;
/** The jumps must matter: without them the drift would exceed the tolerance by at least this factor. */
const JUMP_MARGIN = 1e4;

/** A pair's signed depth (m) from two consecutive states of the run; positive while it overlaps. */
interface Spring {
    readonly law: PairLaw;
    depth(state: RunState): number;
}

interface RunState {
    readonly head: HeadState;
    readonly balls: readonly BallState[];
}

/**
 * Runs `setup` and returns the largest drift of Q − ΣJ from its first value, and the total |J|, both relative to the
 * bodies' initial kinetic energy.
 */
function shadowDrift(setup: ImpactSetup, springs: readonly Spring[], cap?: number): { drift: number; jumps: number } {
    const probe = recorder();
    integrate(setup, { probe, ...(cap === undefined ? {} : { cap }) });
    const states: RunState[] = [
        { head: setup.start, balls: setup.balls.map((b) => b.state) },
        ...probe.snapshots.map((s) => ({ head: s.head, balls: s.balls })),
    ];
    const g = setup.gravity;
    const plus = (d: number): number => Math.max(d, 0);
    const q = (n: number): number => {
        const now = states[n] as RunState;
        const before = states[n - 1] as RunState;
        let e = 0.5 * setup.head.mass * lengthSq(now.head.velocity);
        e += setup.head.mass * g * 0.5 * (now.head.position.z + before.head.position.z);
        now.balls.forEach((b, i) => {
            e +=
                0.5 * M * lengthSq(b.velocity) +
                M * g * 0.5 * (b.position.z + (before.balls[i] as BallState).position.z);
        });
        for (const s of springs) {
            e += 0.5 * s.law.stiffness * plus(s.depth(now)) * plus(s.depth(before));
        }
        return e;
    };
    const jump = (n: number): number => {
        let j = 0;
        for (const s of springs) {
            const before = s.depth(states[n - 1] as RunState);
            const now = s.depth(states[n] as RunState);
            const next = s.depth(states[n + 1] as RunState);
            j += 0.5 * s.law.stiffness * plus(now) * (plus(next) - next - (plus(before) - before));
        }
        return j;
    };
    const initial = states[0] as RunState;
    const scale =
        0.5 * setup.head.mass * lengthSq(initial.head.velocity) +
        initial.balls.reduce((e, b) => e + 0.5 * M * lengthSq(b.velocity), 0);
    const first = q(1);
    let accumulated = 0;
    let jumps = 0;
    let drift = 0;
    for (let n = 1; n + 1 < states.length; n++) {
        const j = jump(n);
        accumulated += j;
        jumps += Math.abs(j);
        drift = Math.max(drift, Math.abs(q(n + 1) - accumulated - first) / scale);
    }
    return { drift, jumps: jumps / scale };
}

describe("shadow energy", () => {
    it("is conserved to rounding through an undamped head-on ball–ball collision", () => {
        const law = lawFromContactTime(M / 2, 1, 7e-4, 0);
        const setup = isolated({
            ballBall: law,
            balls: [freeBall("blue", vec3(0, 0, 0), vec3(3, 0, 0)), freeBall("red", vec3(2 * R + 1e-3, 0, 0))],
        });
        const gap = (s: RunState): number =>
            2 * R - ((s.balls[1] as BallState).position.x - (s.balls[0] as BallState).position.x);
        const { drift, jumps } = shadowDrift(setup, [{ law, depth: gap }], 5e-3);
        expect(drift).toBeLessThan(SHADOW_TOLERANCE);
        expect(jumps).toBeGreaterThan(JUMP_MARGIN * SHADOW_TOLERANCE);
    });

    it("is conserved to rounding through a bounce on an undamped bed, with gravity", () => {
        // τ_r = 0 makes every cell an undamped linear spring in z for vertical motion, w = δ − d_c, engaging at its
        // own depth d_c and pushing straight up on a ball that moves only vertically over a cell centre's symmetric
        // point; the shadow energy sums the cells as the linear springs above, each with its own onset and release.
        const law: BedLaw = { modulus: 3e8, recovery: 0, friction: 0, cell: BED_CELL };
        const setup = isolated({
            gravity: STANDARD_GRAVITY,
            balls: [freeBall("blue", vec3(0, 0, R + 1e-3), vec3(0, 0, -2), law)],
        });
        const engage = freshBed(0, 0, R, law).engage;
        const k = law.cell * law.cell * law.modulus;
        const springs: Spring[] = engage.map((d) => ({
            law: { ...lawFromStiffness(M, 1, k, 0), stiffness: k },
            depth: (s: RunState): number => R - (s.balls[0] as BallState).position.z - d,
        }));
        const { drift, jumps } = shadowDrift(setup, springs, 20e-3);
        expect(drift).toBeLessThan(SHADOW_TOLERANCE);
        expect(jumps).toBeGreaterThan(JUMP_MARGIN * SHADOW_TOLERANCE);
    });
});
