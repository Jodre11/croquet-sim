import { describe, expect, it } from "vitest";
import {
    buildModel,
    settled,
    type Candidate,
    type ContactBody,
    type Model,
    type RestingContact,
} from "../../src/engine/contactModel";
import type { Work } from "../../src/engine/linalg";
import { ZERO, vec3, type Vec3 } from "../../src/engine/math/vec3";
import { fallbackSlip, solveCandidate } from "../../src/engine/modeSolve";
import type { MotionParams } from "../../src/engine/types";

const R = 0.046;
const G = 9.80665;
const SLIDE = 3;
const UP = vec3(0, 0, 1);
const GRAVITY = vec3(0, 0, -G);
const C30 = Math.sqrt(3) / 2;
const work = (): Work => ({ units: 0 });

function params(rollingDecel: number): MotionParams {
    return { radius: R, slidingDecel: SLIDE, rollingDecel, gravity: G };
}

function body(position: Vec3, angularVelocity: Vec3 = ZERO, p: MotionParams = params(0.5)): ContactBody {
    return { state: { position, velocity: ZERO, angularVelocity }, params: p, turfNormal: UP, pivotCapacity: Infinity };
}

const PAIR: RestingContact[] = [{ a: 0, b: 1, fixed: false, friction: 0.05 }];
const LINE: RestingContact[] = [
    { a: 0, b: 1, fixed: false, friction: 0.05 },
    { a: 1, b: 2, fixed: false, friction: 0.05 },
];

/** push.test's topspin push: blue (topspin 60 rad/s) touches red, both at rest. */
function topspin(): Model {
    return buildModel([body(vec3(0, 0, R), vec3(0, 60, 0)), body(vec3(2 * R, 0, R))], [], PAIR, GRAVITY);
}

/** push.test's chain: a topspin driver, ball 1, and ball 2 bent by `bend` from the line. */
function chain(rollingDecel: number, bend: number): Model {
    const p = params(rollingDecel);
    return buildModel(
        [
            body(vec3(0, 0, R), vec3(0, 60, 0), p),
            body(vec3(2 * R, 0, R), ZERO, p),
            body(vec3(2 * R + 2 * R * Math.cos(bend), 2 * R * Math.sin(bend), R), ZERO, p),
        ],
        [],
        LINE,
        GRAVITY,
    );
}

/** push.test's lean: blue, in flight and at rest, leans on red (on the turf, at rest) at 30° from the vertical. */
function lean(rollingDecel: number): Model {
    const p = params(rollingDecel);
    return buildModel([body(vec3(R, 0, R + 2 * R * C30), ZERO, p), body(vec3(0, 0, R), ZERO, p)], [], PAIR, GRAVITY);
}

describe("solveCandidate", () => {
    it("finds a ball's release direction from rest by Newton (topspin push)", () => {
        const model = topspin();
        const cand: Candidate = { balls: ["turf-sliding", "released"], contacts: ["slip"] };
        const out = solveCandidate(model, cand, () => vec3(0, 1, 0), work());
        expect(out.reason).toBe("ok");
        expect(out.directions[0]?.x).toBeCloseTo(1, 12);
        expect(out.ev?.accel[1]?.x).toBeCloseTo(0.89895492703632, 12);
        expect(out.residual).toBeLessThanOrEqual(1e-9);
    });

    it("slips a ball in flight down another the turf holds (contact slip onset)", () => {
        // Rolling down red would need friction (2/7)·tan 30°·N > μN, so the contact slips down-slope along
        // ŝ = (cos 30°, 0, −sin 30°): N = g·cos 30°, x_blue = g(sin 30° − μ·cos 30°)·ŝ, α_blue = (5μ·g·cos 30°/2R)·ŷ.
        const model = lean(5);
        const cand: Candidate = { balls: ["airborne", "held"], contacts: ["slip"] };
        const out = solveCandidate(model, cand, (it) => it.e1, work());
        expect(out.reason).toBe("ok");
        expect(out.directions[0]?.x).toBeCloseTo(C30, 9);
        expect(out.directions[0]?.z).toBeCloseTo(-0.5, 9);
        expect(out.ev?.normal[0]).toBeCloseTo(8.4928080260227, 12);
        expect(out.ev?.accel[0]?.x).toBeCloseTo(3.8786546380113, 12);
        expect(out.ev?.accel[0]?.z).toBeCloseTo(-2.2393422993494, 12);
        expect(out.ev?.spin[0]?.y).toBeCloseTo(23.078282679409, 9);
    });

    it("releases the middle ball of a line bent by 60° and slips its contact with the held end (2 directions)", () => {
        // Ball 1 rolls along (cos 30°, −sin 30°); its contact with ball 2 starts to slip the same way. With
        // B = [(1 − μ)(cos 30° − μ/2) − kμ]/(1 + μ·μs): a = (B·SLIDE − k·g)/(7/(5·cos 30°) + B), x₁ = (a, −a·tan 30°).
        const model = chain(1.5, Math.PI / 3);
        const cand: Candidate = { balls: ["turf-sliding", "released", "held"], contacts: ["slip", "slip"] };
        const out = solveCandidate(model, cand, (it) => it.e1, work());
        expect(out.reason).toBe("ok");
        expect(out.ev?.accel[1]?.x).toBeCloseTo(0.095769964237268, 12);
        expect(out.ev?.accel[1]?.y).toBeCloseTo(-0.055292814632668, 12);
        expect(out.directions[0]?.x).toBeCloseTo(C30, 9);
        expect(out.directions[0]?.y).toBeCloseTo(-0.5, 9);
        expect(out.directions[1]?.x).toBeCloseTo(C30, 9);
        expect(out.directions[1]?.y).toBeCloseTo(-0.5, 9);
    });

    it("settles the static forces of held balls by the minimum-norm rule (a straight line held)", () => {
        // The 1–2 contact joins two held balls, so its rows vanish and the system is singular; the convex solve picks
        // its forces. The driver's contact is determined: N₀₁ = SLIDE/(1 + μ·μs).
        const model = chain(1.5, 0);
        const cand = settled(model, { balls: ["turf-sliding", "held", "held"], contacts: ["slip", "open"] });
        expect(cand.contacts).toEqual(["slip", "stick"]);
        const out = solveCandidate(model, cand, (it) => it.e1, work());
        expect(out.reason).toBe("ok");
        expect(out.ev?.normal[0]).toBeCloseTo(2.954804075668, 12);
    });

    it("reports a failed direction solve, then slips against the stuck force (approximate-slip)", () => {
        const model = lean(5);
        const cand: Candidate = { balls: ["airborne", "held"], contacts: ["slip"] };
        const failed = solveCandidate(model, cand, (it) => it.e1, work(), { failDirections: true });
        expect(failed.ok).toBe(false);
        expect(failed.failure).toBe("direction");
        // Stuck, the contact pushes red down-slope, so the fallback slips it the way the exact solve does.
        const fallback = fallbackSlip(model, cand, work());
        expect(fallback?.ok).toBe(true);
        expect(fallback?.directions[0]?.x).toBeCloseTo(C30, 9);
        expect(fallback?.directions[0]?.z).toBeCloseTo(-0.5, 9);
        expect(fallback?.ev?.accel[0]?.x).toBeCloseTo(3.8786546380113, 12);
    });

    it("has no approximate-slip fallback for a ball released from rest", () => {
        const cand: Candidate = { balls: ["turf-sliding", "released"], contacts: ["slip"] };
        expect(fallbackSlip(topspin(), cand, work())).toBeNull();
    });
});
