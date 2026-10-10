import { describe, expect, it } from "vitest";
import { ZERO, add, length, scale, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import type { BallState } from "../../../src/engine/types";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import {
    BED_CELL,
    bedLoad,
    bedRelax,
    freshBed,
    freshForce,
    freshPotential,
    isBouncing,
    newBallBed,
    staticSink,
    type BallBed,
} from "../../../src/engine/impact/turfBed";
import type { BedLaw } from "../../../src/engine/impact/types";
import { land } from "../../../src/engine/impact/landing";
import { ballReference, contactReference } from "../../../src/reference/index";
import { TEST_BALL } from "../support/fixtures";

const R = TEST_BALL.radius;
const M = TEST_BALL.mass;
const G = STANDARD_GRAVITY;
const W = M * G;
const DT = 5e-6;
/** A plausible bed, not the fitted one (fixtures' policy): k_w 3e8 N/m³, τ_r 2 ms, µ 0.48. */
const LAW: BedLaw = { modulus: 3e8, recovery: 2e-3, friction: 0.48, cell: BED_CELL };

const at = (x: number, y: number, z: number, v: Vec3 = ZERO, w: Vec3 = ZERO): BallState => ({
    position: vec3(x, y, z),
    velocity: v,
    angularVelocity: w,
});

/** One ball on `bed` under gravity, by the impact's semi-implicit Euler, for `steps` steps; returns every state. */
function run(bed: BallBed, start: BallState, steps: number, gravity = G): BallState[] {
    const inertia = 0.4 * M * R * R;
    const states = [start];
    let s = start;
    for (let n = 0; n < steps; n++) {
        const load = bedLoad(bed, s, R, DT);
        const force = add(vec3(0, 0, -M * gravity), load === null ? ZERO : load.force);
        const v = add(s.velocity, scale(force, DT / M));
        const w = load === null ? s.angularVelocity : add(s.angularVelocity, scale(load.torque, DT / inertia));
        s = { position: add(s.position, scale(v, DT)), velocity: v, angularVelocity: w };
        bedRelax(bed);
        states.push(s);
    }
    return states;
}

describe("a fresh bed under a slowly pressed ball", () => {
    it("matches the Winkler closed form F = π·k_w·(R·δ² − δ³/3) within 1 % at δ ≤ 2 mm", () => {
        // A sphere on a Winkler bed: F = k_w·∫ w dA over the cap, w = δ − r²/(2R) to first order; exactly
        // F = π·k_w·(R·δ² − δ³/3). A 0.5 mm lattice reaches the continuum within 1 % at δ ≥ 0.5 mm.
        const fine: BedLaw = { ...LAW, cell: 5e-4 };
        for (const depth of [5e-4, 1e-3, 2e-3]) {
            const exact = Math.PI * LAW.modulus * (R * depth * depth - (depth * depth * depth) / 3);
            expect(Math.abs(freshForce(0.01, 0.02, R, depth, fine) / exact - 1), `δ = ${depth}`).toBeLessThan(1e-2);
        }
    });

    it("sinks to where its weight is carried, about 0.32 mm on this bed", () => {
        const sink = staticSink(0, 0, R, W, LAW);
        expect(freshForce(0, 0, R, sink, LAW)).toBeGreaterThanOrEqual(W);
        expect(freshForce(0, 0, R, sink - 1e-12, LAW)).toBeLessThan(W);
        // Pre-flight: 0.3217 mm at a cell centre, 0.3213–0.3229 mm across offsets.
        expect(sink).toBeGreaterThan(3.1e-4);
        expect(sink).toBeLessThan(3.3e-4);
    });

    it.each([
        ["a cell centre", 0.5 * BED_CELL, 0.5 * BED_CELL],
        [
            "an offset of h/3 from a cell centre in x and y",
            0.5 * BED_CELL + BED_CELL / 3,
            0.5 * BED_CELL + BED_CELL / 3,
        ],
    ])("keeps a ball placed at its static sink at %s within 1 µm for 10 ms", (_, x, y) => {
        // The offsets are from a cell centre. The 2 mm lattice pushes a resting ball sideways with up to about 1.4e-3
        // of its weight (zero at a cell centre or corner), so off-centre it rolls as a = F/(1.4·m): about 0.35 µm in
        // 10 ms, the impact's realistic window, and 6.4 µm per axis in 50 ms (measured, P2b.2b.2b.2a Task 4;
        // accepted by the user, 2026-10-09).
        const sink = staticSink(x, y, R, W, LAW);
        const start = at(x, y, R - sink);
        const states = run(newBallBed(LAW, DT), start, 2000);
        for (const s of states) {
            expect(length(add(s.position, scale(start.position, -1)))).toBeLessThan(1e-6);
        }
    });

    it("pushes a resting ball sideways by at most 1.5e-3 of its weight, none at a cell centre or corner", () => {
        // Pins the measured push (P2b.2b.2b.2a Task 4: 1.2e-3 at h/6, 1.3e-3 at h/4, 1.0e-3 at h/3, 1.4e-3 at h/3
        // along x) so that it cannot grow unnoticed.
        const centre = 0.5 * BED_CELL;
        const horizontal = (dx: number, dy: number): number => {
            const sink = staticSink(centre + dx, centre + dy, R, W, LAW);
            const load = bedLoad(newBallBed(LAW, DT), at(centre + dx, centre + dy, R - sink), R, DT);
            const f = (load as NonNullable<typeof load>).force;
            return Math.hypot(f.x, f.y) / W;
        };
        for (const d of [BED_CELL / 6, BED_CELL / 4, BED_CELL / 3]) {
            expect(horizontal(d, d), `diagonal ${d}`).toBeLessThan(1.5e-3);
        }
        expect(horizontal(BED_CELL / 3, 0)).toBeLessThan(1.5e-3);
        expect(horizontal(0, 0)).toBeLessThan(1e-12);
        expect(horizontal(BED_CELL / 2, BED_CELL / 2)).toBeLessThan(1e-12);
    });
});

describe("the bouncing rule", () => {
    it("puts the threshold at (2/3)·m·g·δ₀ on a Winkler bed in the continuum limit", () => {
        // U_f(δ) = π·k_w·R·δ³/3 at small δ, and F(δ₀) = m·g, so m·g·δ₀ − U_f(δ₀) = (2/3)·m·g·δ₀.
        const fine: BedLaw = { ...LAW, cell: 5e-5 };
        const sink = staticSink(0, 0, R, W, fine);
        const fresh = freshBed(0, 0, R, fine);
        const threshold = W * sink - freshPotential(fresh, sink);
        expect(Math.abs(threshold / ((2 / 3) * W * sink) - 1)).toBeLessThan(1e-2);
    });

    it("keeps a ball released from rest just below the threshold depth in the turf, and lifts one just above", () => {
        // From rest at depth δ, the ball reaches the surface exactly when U_f(δ) − m·g·δ = 0: isBouncing's own sign.
        const sink = staticSink(0, 0, R, W, LAW);
        const fresh = freshBed(0, 0, R, LAW);
        let lo = sink;
        let hi = 4 * sink;
        for (let n = 0; n < 60; n++) {
            const mid = (lo + hi) / 2;
            if (isBouncing(fresh, M, G, 0, mid)) {
                hi = mid;
            } else {
                lo = mid;
            }
        }
        // The undamped bed's ball returns its stored energy, so it reaches the threshold's depth from below.
        const elastic: BedLaw = { ...LAW, recovery: 0 };
        const below = run(newBallBed(elastic, DT), at(0, 0, R - 0.97 * hi), 4000);
        const above = run(newBallBed(elastic, DT), at(0, 0, R - 1.03 * hi), 4000);
        expect(Math.max(...below.map((s) => s.position.z))).toBeLessThan(R);
        expect(Math.max(...above.map((s) => s.position.z))).toBeGreaterThan(R);
    });

    it.each([1, 3, 5])("classifies a ball rolling at %s m/s across a fresh bed not bouncing within 20 ms", (speed) => {
        const sink = staticSink(0, 0, R, W, LAW);
        const start = at(0, 0, R - sink, vec3(speed, 0, 0), vec3(0, speed / R, 0));
        const bed = newBallBed(LAW, DT);
        const states = run(bed, start, 4000);
        const fresh = freshBed(0, 0, R, LAW);
        const last = states[states.length - 1] as BallState;
        expect(bed.held).toBeGreaterThan(0);
        // §4.6: should this fail, the plan stops and raises it with the user (spec §4.6, "Still bouncing").
        expect(isBouncing(fresh, M, G, last.velocity.z, R - last.position.z)).toBe(false);
    });
});

describe("a cell's recovery", () => {
    it("recovers as w₀·exp(−t/τ_r) within 1e-12 relative once released", () => {
        const bed = newBallBed(LAW, DT);
        bedLoad(bed, at(0.0011, 0.0013, R - 1e-3), R, DT);
        // The ball rises fast at the same place: every held cell's force τ_r·w′ ≈ −0.02 m ≫ w goes negative, so it
        // releases at its current depth and then only recovers.
        bedLoad(bed, at(0.0011, 0.0013, R - 1e-3, vec3(0, 0, 10)), R, DT);
        const depths = new Map([...bed.cells].map(([key, cell]) => [key, cell.w]));
        expect(depths.size).toBeGreaterThan(0);
        for (let n = 0; n < 200; n++) {
            bedRelax(bed);
        }
        expect(bed.cells.size).toBeGreaterThan(0);
        for (const [key, cell] of bed.cells) {
            const expected = (depths.get(key) as number) * Math.exp((-200 * DT) / LAW.recovery);
            expect(Math.abs(cell.w / expected - 1)).toBeLessThan(1e-12);
        }
    });
});

describe("the ramp and friction", () => {
    it("pushes back against a ball rolling across a fresh bed: the ramp", () => {
        const sink = staticSink(0, 0, R, W, LAW);
        const bed = newBallBed(LAW, DT);
        const states = run(bed, at(0, 0, R - sink, vec3(2, 0, 0), vec3(0, 2 / R, 0)), 2000);
        const s = states[states.length - 1] as BallState;
        const load = bedLoad(bed, s, R, DT);
        // Rolling without slip, friction carries little; the leading cells' normals lean back against the motion.
        expect((load?.normal.x as number) < 0).toBe(true);
    });

    it("slides a ball at µ against the resultant normal", () => {
        const sink = staticSink(0, 0, R, W, LAW);
        const bed = newBallBed(LAW, DT);
        // Sliding at 2 m/s with no spin: the contact point slips forward, so friction is at the cone.
        const states = run(bed, at(0, 0, R - sink, vec3(2, 0, 0)), 400);
        const load = bedLoad(bed, states[states.length - 1] as BallState, R, DT);
        expect(load).not.toBeNull();
        const l = load as NonNullable<typeof load>;
        expect(length(l.tangentialForce) / l.normalForce).toBeCloseTo(LAW.friction, 9);
        expect(l.tangentialForce.x).toBeLessThan(0);
    });
});

describe("determinism", () => {
    it.each([0, 10])("gives the exactly mirrored load for a ball mirrored across y = 0 at |y| = %s m", (y) => {
        const sink = staticSink(0.3, y + 0.0007, R, W, LAW);
        const a = newBallBed(LAW, DT);
        const b = newBallBed(LAW, DT);
        const sa = at(0.3, y + 0.0007, R - sink, vec3(1.5, 0.4, -0.2), vec3(3, -7, 1));
        const sb = at(0.3, 0 - (y + 0.0007), R - sink, vec3(1.5, -0.4, -0.2), vec3(-3, -7, -1));
        const ra = run(a, sa, 300);
        const rb = run(b, sb, 300);
        const last = ra.length - 1;
        const pa = (ra[last] as BallState).position;
        const pb = (rb[last] as BallState).position;
        expect([pa.x, -pa.y, pa.z]).toEqual([pb.x, pb.y, pb.z]);
        const la = bedLoad(a, ra[last] as BallState, R, DT);
        const lb = bedLoad(b, rb[last] as BallState, R, DT);
        expect(la?.force.y).toBe(-(lb?.force.y as number));
        expect(la?.force.z).toBe(lb?.force.z);
    });

    it("loads a ball far from the origin as one near it, offset by whole cells (review focus 3)", () => {
        // Whole cells apart, the columns' offsets from the centre agree to rounding, so the forces agree to 1e-9;
        // the loop visits the same number of columns, wherever the ball lies.
        const near = newBallBed(LAW, DT);
        const far = newBallBed(LAW, DT);
        const dx = 12_500 * BED_CELL;
        const dy = 17_500 * BED_CELL;
        const ln = bedLoad(near, at(0.0003, 0.0007, R - 4e-4), R, DT);
        const lf = bedLoad(far, at(dx + 0.0003, dy + 0.0007, R - 4e-4), R, DT);
        expect(Math.abs((lf?.normalForce as number) / (ln?.normalForce as number) - 1)).toBeLessThan(1e-9);
        expect(far.visits).toBe(near.visits);
        expect(lf?.held).toBe(ln?.held);
    });
});

describe("the fitted bed (scripts/turfFit.ts)", () => {
    const FITTED: BedLaw = {
        modulus: contactReference.bedModulus.value,
        recovery: contactReference.bedRecovery.value,
        friction: 0.48,
        cell: BED_CELL,
    };
    // The reference ball, which the fit used (scripts/turfFit.ts).
    const BALL = { radius: ballReference.diameter.value / 2, mass: ballReference.mass.value };
    const vertical = (law: BedLaw, speed: number): { e: number; depth: number } => {
        const l = land(
            { position: vec3(0.0007, 0.0011, BALL.radius), velocity: vec3(0, 0, -speed), angularVelocity: ZERO },
            BALL,
            G,
            law,
        );
        return { e: l.state.velocity.z / speed, depth: l.peakDepth };
    };

    it("gives A4R's e 0.5 and 7.2 mm at 5 m/s within the fit's tolerance", () => {
        const r = vertical(FITTED, 5);
        expect(Math.abs(r.e / 0.5 - 1)).toBeLessThan(1e-4);
        expect(Math.abs(r.depth / 7.2e-3 - 1)).toBeLessThan(1e-4);
    });

    it("loses more the faster the ball strikes: e falls monotonically over 1–6 m/s", () => {
        let last = 1;
        for (const v of [1, 2, 3, 4, 5, 6]) {
            const e = vertical(FITTED, v).e;
            expect(e, `${v} m/s`).toBeLessThan(last);
            last = e;
        }
    });

    it.each([2, 5, 6])("agrees between h = 1 mm and h = 2 mm within 1 %% at %s m/s", (v) => {
        const a = vertical(FITTED, v);
        const b = vertical({ ...FITTED, cell: 1e-3 }, v);
        expect(Math.abs(b.e / a.e - 1)).toBeLessThan(1e-2);
        expect(Math.abs(b.depth / a.depth - 1)).toBeLessThan(1e-2);
    });
});
