import { describe, expect, it } from "vitest";
import {
    assemble,
    ballOptions,
    buildModel,
    candidateKey,
    cones,
    contactOptions,
    directionItems,
    evaluate,
    inconsistency,
    lowLoad,
    settled,
    turfPlane,
    type Candidate,
    type ContactBody,
    type Evaluated,
    type Model,
    type RestingContact,
} from "../../src/engine/contactModel";
import { excessAt, solveConvex } from "../../src/engine/convexSolve";
import { solveSystem } from "../../src/engine/linalg";
import { ZERO, vec3, type Vec3 } from "../../src/engine/math/vec3";
import type { MotionParams } from "../../src/engine/types";

const R = 0.046;
const G = 9.80665;
const SLIDE = 3;
const ROLL = 0.5;
const P: MotionParams = { radius: R, slidingDecel: SLIDE, rollingDecel: ROLL, gravity: G };
const UP = vec3(0, 0, 1);
const GRAVITY = vec3(0, 0, -G);

function ball(x: number, y: number, angularVelocity: Vec3 = ZERO, params: MotionParams = P): ContactBody {
    return {
        state: { position: vec3(x, y, R), velocity: ZERO, angularVelocity },
        params,
        turfNormal: UP,
        pivotCapacity: Infinity,
    };
}

/** Solves one candidate with the given directions and evaluates it. */
function solve(model: Model, cand: Candidate, dirs: readonly Vec3[]): Evaluated {
    const items = directionItems(model, cand);
    const sys = assemble(model, cand, items, dirs);
    const solution = solveSystem(sys.A, sys.b, { units: 0 });
    expect(solution?.basis.length).toBe(0);
    return evaluate(sys, solution?.x as number[]);
}

const PAIR: RestingContact[] = [{ a: 0, b: 1, fixed: false, friction: 0.05 }];

describe("the turf frame", () => {
    it("is exactly (x̂, ŷ) on a level turf", () => {
        expect(turfPlane(UP)).toEqual([vec3(1, 0, 0), vec3(0, 1, 0)]);
    });

    it("refuses a finite pivot capacity, which v1 does not model", () => {
        expect(() => buildModel([{ ...ball(0, 0), pivotCapacity: 1 }], [], [], GRAVITY)).toThrow(RangeError);
    });
});

describe("modes and items", () => {
    it("offers each class its modes in the design's order", () => {
        expect(ballOptions("stationary")).toEqual(["held", "released", "turf-sliding"]);
        expect(ballOptions("rolling")).toEqual(["turf-rolling", "turf-sliding"]);
        expect(ballOptions("sliding")).toEqual(["turf-sliding"]);
        expect(ballOptions("airborne")).toEqual(["airborne"]);
    });

    it("lets a contact stick only when it has friction and is not slipping", () => {
        const still = buildModel([ball(0, 0), ball(2 * R, 0)], [], PAIR, GRAVITY);
        expect(contactOptions(still, 0)).toEqual(["stick", "slip", "open"]);
        const spinning = buildModel([ball(0, 0, vec3(0, 60, 0)), ball(2 * R, 0)], [], PAIR, GRAVITY);
        expect(spinning.geometry[0]?.slipping).toBe(true);
        expect(contactOptions(spinning, 0)).toEqual(["slip", "open"]);
        const frictionless = buildModel(
            [ball(0, 0), ball(2 * R, 0)],
            [],
            [{ a: 0, b: 1, fixed: false, friction: 0 }],
            GRAVITY,
        );
        expect(contactOptions(frictionless, 0)).toEqual(["slip", "open"]);
    });

    it("settles a contact between held bodies as stuck", () => {
        const model = buildModel([ball(0, 0), ball(2 * R, 0)], [], PAIR, GRAVITY);
        const cand = settled(model, { balls: ["held", "held"], contacts: ["open"] });
        expect(cand.contacts).toEqual(["stick"]);
        expect(candidateKey(cand)).toBe("held,held|stick");
    });

    it("lists the unknown directions of a candidate", () => {
        const model = buildModel([ball(0, 0), ball(2 * R, 0)], [], PAIR, GRAVITY);
        const items = directionItems(model, { balls: ["released", "turf-sliding"], contacts: ["slip"] });
        expect(items.map((it) => `${it.kind}#${it.index}`)).toEqual(["release#0", "turf-onset#1", "contact-onset#0"]);
        expect(items[2]?.e1).toEqual(model.geometry[0]?.t1);
    });
});

describe("one candidate", () => {
    it("pushes a resting ball with a ball driven by topspin: the generalised closed form", () => {
        // Blue's contact point slips down (−R(ω_a + ω_b)ẑ), so kinetic friction μN lifts blue and loads red,
        // L = g ∓ μN. Blue: A = μs(g − μN) − N; red rolls from rest: 7/5·A = N(1 − μ) − k(g + μN), k = 7/5·μr.
        // Hence A = (c·μs − k)·g/(7/5 + c) with c = (1 − μ − kμ)/(1 + μ·μs).
        const model = buildModel([ball(0, 0, vec3(0, 60, 0)), ball(2 * R, 0)], [], PAIR, GRAVITY);
        expect(model.geometry[0]?.sHat).toEqual(vec3(0, 0, -1));
        const cand: Candidate = { balls: ["turf-sliding", "released"], contacts: ["slip"] };
        const ev = solve(model, cand, [vec3(1, 0, 0)]);
        expect(inconsistency(model, cand, ev)).toBeNull();
        expect(ev.accel[0]?.x).toBeCloseTo(0.89895492703632, 12);
        expect(ev.accel[1]?.x).toBeCloseTo(0.89895492703632, 12);
        expect(ev.normal[0]).toBeCloseTo(2.0693921815851, 12);
        expect(ev.load[0]).toBeCloseTo(9.7031803909207, 12);
        expect(ev.load[1]).toBeCloseTo(9.9101196090793, 12);
        expect(ev.spin[0]?.y).toBeCloseTo(-166.9465607446, 9);
        expect(ev.spin[1]?.y).toBeCloseTo(19.542498413833, 10);
        // Red rolls: its spin about the vertical is locked.
        expect(ev.spin[1]?.z).toBe(0);
    });

    it("holds a ball driven against an upright, which friction lifts", () => {
        // Upright friction μu·N lifts the ball (L = g − μu·N), so N = SLIDE/(1 + μu·μs); the spin decays at
        // (5/2R)·N·(1 + μu).
        const model = buildModel(
            [ball(0, 0, vec3(0, 60, 0))],
            [vec3(R + 0.008, 0, 0)],
            [{ a: 0, b: 0, fixed: true, friction: 0.1 }],
            GRAVITY,
        );
        const cand: Candidate = { balls: ["turf-sliding"], contacts: ["slip"] };
        const ev = solve(model, cand, []);
        expect(inconsistency(model, cand, ev)).toBeNull();
        expect(ev.accel[0]?.x).toBeCloseTo(0, 14);
        expect(ev.normal[0]).toBeCloseTo(2.9109497212232, 12);
        expect(ev.load[0]).toBeCloseTo(9.5155550278777, 12);
        expect(ev.spin[0]?.y).toBeCloseTo(-174.0241681166, 9);
    });

    it("holds a resting ball that the push cannot move, within its resistance", () => {
        // N = SLIDE/(1 + μ·μs); red needs N(1 − μ) = 0.4738 of resistance, within k·(g + μN) = 0.6877.
        const weak: MotionParams = { radius: R, slidingDecel: 0.5, rollingDecel: 0.49, gravity: G };
        const model = buildModel([ball(0, 0, vec3(0, 60, 0), weak), ball(2 * R, 0, ZERO, weak)], [], PAIR, GRAVITY);
        const cand: Candidate = { balls: ["turf-sliding", "held"], contacts: ["slip"] };
        const ev = solve(model, cand, []);
        expect(inconsistency(model, cand, ev)).toBeNull();
        expect(ev.accel[0]?.x).toBeCloseTo(0, 15);
        expect(ev.normal[0]).toBeCloseTo(0.49872859591218, 12);
        expect(ev.accel[1]).toEqual(ZERO);
    });

    it("lifts a ball whose load friction takes away, and rejects it on the turf", () => {
        // Blue (topspin) and red (stronger backspin) drive into each other: the contact slips up on red, and with
        // μ = 4 friction takes more than red's weight. On the turf red's load would be g(1 − μ·μs) < 0; in flight
        // N = μs·g/(2 − μ·μs) and red rises at 2g(μ·μs − 1)/(2 − μ·μs).
        const contacts: RestingContact[] = [{ a: 0, b: 1, fixed: false, friction: 4 }];
        const model = buildModel([ball(0, 0, vec3(0, 60, 0)), ball(2 * R, 0, vec3(0, -80, 0))], [], contacts, GRAVITY);
        const turf: Candidate = { balls: ["turf-sliding", "turf-sliding"], contacts: ["slip"] };
        const onTurf = solve(model, turf, []);
        expect(onTurf.load[1]).toBeCloseTo(G * (1 - (4 * SLIDE) / G), 12);
        expect(inconsistency(model, turf, onTurf)).toMatch(/load/);
        expect(lowLoad(model, turf, onTurf)).toEqual([1]);
        const lifted: Candidate = { balls: ["turf-sliding", "airborne"], contacts: ["slip"] };
        const ev = solve(model, lifted, []);
        expect(inconsistency(model, lifted, ev)).toBeNull();
        expect(ev.normal[0]).toBeCloseTo(3.8642835564079, 12);
        expect(ev.accel[1]?.x).toBeCloseTo(3.8642835564079, 12);
        expect(ev.accel[1]?.z).toBeCloseTo(5.6504842256315, 12);
    });

    it("measures how far a candidate is from its convex conditions", () => {
        // Holding red against the topspin push of push.test needs more resistance than red has.
        const model = buildModel([ball(0, 0, vec3(0, 60, 0)), ball(2 * R, 0)], [], PAIR, GRAVITY);
        const cand: Candidate = { balls: ["turf-sliding", "held"], contacts: ["slip"] };
        const items = directionItems(model, cand);
        const sys = assemble(model, cand, items, []);
        const x = solveSystem(sys.A, sys.b, { units: 0 })?.x as number[];
        expect(inconsistency(model, cand, evaluate(sys, x))).toMatch(/held/);
        expect(excessAt(cones(model, cand, sys), x)).toBeGreaterThan(0);
    });

    it("accepts the forces the convex solve settles on a held ball's limit", () => {
        // Blue pushes red, which leans on yellow; both are held at the edge of their resistance, so the static forces
        // are not unique and the minimum-norm forces lie on a held ball's cone to rounding. Its cone must aim inside
        // HOLD_SLACK, or inconsistency() rejects some of these holds by an ulp.
        const contacts: RestingContact[] = [...PAIR, { a: 1, b: 2, fixed: false, friction: 0.05 }];
        for (let k = 0; k <= 60; k++) {
            const edge: MotionParams = { ...P, rollingDecel: 1.189268112012 + k * 1e-12 };
            const bodies = [
                ball(0, 0, vec3(0, 60, 0)),
                ball(2 * R, 0, ZERO, edge),
                ball(2 * R + 2 * R * 0.8, 2 * R * 0.6, ZERO, edge),
            ];
            const model = buildModel(bodies, [], contacts, GRAVITY);
            const cand = settled(model, { balls: ["turf-sliding", "held", "held"], contacts: ["slip", "open"] });
            const sys = assemble(model, cand, directionItems(model, cand), []);
            const solution = solveSystem(sys.A, sys.b, { units: 0 });
            expect(solution?.basis.length).toBeGreaterThan(0);
            const r = solveConvex(cones(model, cand, sys), solution?.x as number[], solution?.basis ?? [], {
                units: 0,
            });
            expect(r.excess, `step ${k}`).toBeLessThanOrEqual(0);
            expect(inconsistency(model, cand, evaluate(sys, r.x)), `step ${k}`).toBeNull();
        }
    });
});
