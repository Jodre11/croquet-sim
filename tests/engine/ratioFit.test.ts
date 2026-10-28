import { describe, expect, it } from "vitest";
import { simulateShot } from "../../src/engine/shot";
import { defaultProfile } from "../../src/engine/swing/profile";
import type { ShotSetup } from "../../src/engine/swing/types";
import { BALL_IDS, type BallState, type ShotResult, type World } from "../../src/engine/types";
import { defaultWorld } from "../../src/engine/world";
import { length, sub } from "../../src/engine/math/vec3";
import { FILMED_STROKES } from "../../scripts/filmedStrokes";
import { OPEN_LAWN, OPEN_START, haltedText, openWorld, opened } from "../../scripts/openLawn";
import {
    ALL_STROKES,
    BOUNDS,
    GAPPED_STROKES,
    READ_DELAY,
    STRIKE_WINDOW,
    TODAY,
    effectiveMassOf,
    filmedStrokeRuns,
    fitSetup,
    fitWorld,
    guganSetup,
    gugansMallet,
    leanOf,
    meansOf,
    ratioOf,
    ratiosAt,
    readOut,
    readSamples,
    readTimeOf,
    releaseSpeedFor,
    runFit,
    solvePair,
} from "../../scripts/ratioFit";
import { canonicalSetup, strokeFor } from "./support/shot";

const SLOW = Boolean(import.meta.env.SLOW_TESTS);

const WORLD = defaultWorld();

/** The default world with a ball ten times as heavy. */
function heavyBallWorld(): World {
    const world = defaultWorld();
    return { ...world, ball: { ...world.ball, mass: world.ball.mass * 10 } };
}

/** A phase 2 in which no ball moves: every rest position is the setup's. */
function stillMotion(setup: ShotSetup): ShotResult {
    const rest: ShotResult["rest"] = {};
    for (const id of BALL_IDS) {
        const ball = setup.balls[id];
        if (ball !== undefined) {
            rest[id] = ball.position;
        }
    }
    return { engineVersion: "", duration: 0, segments: {}, events: [], rest, aborted: false };
}

/** The unit square, both coordinates' bounds. */
const UNIT = [
    [0, 1],
    [0, 1],
] as const;

/** A = [[2, 1], [1, 3]]: well conditioned, each coordinate moving both ratios. */
const apply = (x: readonly [number, number]): readonly [number, number] => [2 * x[0] + x[1], x[0] + 3 * x[1]];

/** A·x + b with its root at (0.3, 0.6) for the targets (4.23, 7.15). */
function linear(x: readonly [number, number]): readonly [number, number] {
    const [a, b] = apply(x);
    return [a + 3.03, b + 5.05];
}

/** A·x + b with its root at (1.4, 0.6), outside the unit square. */
function farLinear(x: readonly [number, number]): readonly [number, number] {
    const [a, b] = apply(x);
    return [a + 0.83, b + 3.95];
}

/** The larger of each ratio's error over its tolerance, against the targets (4.23, 7.15) and tolerances (0.2, 0.6). */
const worst = (v: readonly [number, number]): number =>
    Math.max(Math.abs(v[0] - 4.23) / 0.2, Math.abs(v[1] - 7.15) / 0.6);

describe("the fit's evaluator (P2b.2b.2c.2 design §5)", () => {
    it("reproduces simulateShot's ratio to the bit at today's values", () => {
        // An evaluator drifting from the engine would fit a model the engine does not run. The coupling, the world's
        // contact times and the body are replaced by today's own values, and fitSetup's setup is checked against the
        // canonical one with strokeFor's stroke, so that a drift in fitSetup cannot hide in both paths.
        for (const type of ["drive", "stop-ac"] as const) {
            const setup = fitSetup(type, TODAY, 3);
            const canonical = canonicalSetup(type);
            expect(setup).toEqual({ ...canonical, stroke: { ...canonical.stroke, ...strokeFor(canonical, 3) } });
            const { motion } = runFit(setup, TODAY, fitWorld(TODAY));
            const outcome = simulateShot(setup, defaultWorld());
            expect(ratioOf(setup, motion)).toBe(ratioOf(setup, outcome.motion));
        }
    });
    it("moves the ratio when only the coupling's period moves", () => {
        // The override reaches the impact: a period at its lower bound changes the drive's ratio.
        const p = { ...TODAY, handCouplingPeriod: BOUNDS.handCouplingPeriod[0] };
        const setup = fitSetup("drive", p, 3);
        expect(ratioOf(setup, runFit(setup, p, fitWorld(p)).motion)).not.toBe(ratiosAt(TODAY).drive);
    });
    it("throws when the striker's ball does not move", () => {
        // A still striker would hand the solver Infinity or NaN as a ratio.
        const setup = fitSetup("drive", TODAY, 3);
        expect(() => ratioOf(setup, stillMotion(setup))).toThrow(/striker's ball .* did not move/);
    });
});

describe("the open lawn and the release speed (design §3)", () => {
    it("moves every ball by one offset that puts the striker at OPEN_START, on a lawn with no hoops", () => {
        // A setup moved unevenly would change the croquet stroke it plays, and a lawn edge or hoop within reach would
        // stop a distance short of rest.
        const setup = canonicalSetup("drive");
        const moved = opened(setup);
        const striker = moved.balls[moved.striker]?.position;
        expect(striker?.x).toBe(OPEN_START.x);
        expect(striker?.y).toBe(OPEN_START.y);
        const gap = (s: ShotSetup): number =>
            length(sub((s.balls[s.striker] as BallState).position, (s.balls.red as BallState).position));
        expect(gap(moved)).toBeCloseTo(gap(setup), 12);
        const world = openWorld();
        expect(world.hoops).toEqual([]);
        expect([world.lawn.width, world.lawn.length]).toEqual([OPEN_LAWN, OPEN_LAWN]);
    });
    // Slow: the bisection's 62 strikes take about 50 s.
    it.runIf(SLOW)(
        "plans the single-ball stroke whose ball leaves the face at the asked speed, rolling to rest",
        () => {
            // A bisection returning a bracket's end, or a stroke halted at the lawn's edge, would mis-measure the
            // CA's lawn share. A2D's ball speed, 4.31 m/s, lies well inside the bracket.
            const world = fitWorld(TODAY, openWorld());
            const setup = opened(fitSetup("single-ball", TODAY, releaseSpeedFor(4.31), world));
            const { motion, release } = runFit(setup, TODAY, world);
            expect(length(release.velocity)).toBeCloseTo(4.31, 6);
            expect(haltedText(motion, setup.striker)).toBe("");
        },
        240_000,
    );
    it("throws for a release speed outside the planned speeds' bracket", () => {
        expect(() => releaseSpeedFor(100)).toThrow(RangeError);
    });
});

describe("the pair's solver (design §5.3)", () => {
    // A synthetic linear map: ratios = A·x + b, its root at (0.3, 0.6) in the unit square.
    it("finds the root of a linear map to 0.01 on each ratio", () => {
        const r = solvePair(linear, [0.5, 0.5], UNIT, [4.23, 7.15], [0.2, 0.6]);
        expect(r.converged).toBe(true);
        expect(Math.abs(r.values[0] - 4.23)).toBeLessThanOrEqual(0.01);
        expect(Math.abs(r.values[1] - 7.15)).toBeLessThanOrEqual(0.01);
    });
    it("stays within its bounds and returns the closest point when the targets are out of reach", () => {
        // A candidate outside its sourced bounds is no fit, and an extrapolated point is no evaluation. The root lies
        // at x = 1.4, outside [0, 1]: every evaluation is checked inside the bounds, and the point returned is one
        // evaluated, with its own values.
        const seen: (readonly [number, number])[] = [];
        const r = solvePair((x) => (seen.push(x), farLinear(x)), [0.5, 0.5], UNIT, [4.23, 7.15], [0.2, 0.6]);
        expect(r.converged).toBe(false);
        expect(seen.every(([a, b]) => a >= 0 && a <= 1 && b >= 0 && b <= 1)).toBe(true);
        expect(r.point.every((a) => a >= 0 && a <= 1)).toBe(true);
        expect(r.values).toEqual(farLinear(r.point));
        expect(worst(r.values)).toBe(Math.min(...seen.map((x) => worst(farLinear(x)))));
    });
    it("finds the closest point along a bound once Newton stalls there", () => {
        // Newton clamps x onto 1 and stalls. Along x = 1 the score max(|y − 1.4|/0.2, |3y − 2.2|/0.6) falls to its
        // least in [0, 1] at y = 1: e = (−0.4, 0.8), score max(2.0, 1.33) = 2.0, against the stalled (1, 0.6)'s 4.0.
        const r = solvePair(farLinear, [0.5, 0.5], UNIT, [4.23, 7.15], [0.2, 0.6]);
        expect(r.converged).toBe(false);
        expect(Math.abs(worst(r.values) - 2)).toBeLessThanOrEqual(0.01);
        expect(Math.abs(r.point[0] - 1)).toBeLessThanOrEqual(0.01);
        expect(Math.abs(r.point[1] - 1)).toBeLessThanOrEqual(0.01);
    });
    it("reports convergence at any evaluated point inside 0.01 of both targets", () => {
        // A map on the targets only past x = 0.505: Newton's first difference probe, (0.51, 0.5), lands there, and
        // that point is a root to 0.01 whether or not an iterate reaches it.
        const step = (x: readonly [number, number]): readonly [number, number] =>
            x[0] > 0.505 ? [4.23, 7.15] : [5, 8];
        const r = solvePair(step, [0.5, 0.5], UNIT, [4.23, 7.15], [0.2, 0.6]);
        expect(r.converged).toBe(true);
        expect(r.values).toEqual([4.23, 7.15]);
        expect(r.point[0]).toBeGreaterThan(0.505);
    });
});

describe("the read-out (P2b.2b.2c.2b design §5.2, §8.1)", () => {
    const I = (start: number, end: number) => ({ start, end });
    it("reads 1 ms after the later of the last face and the last ball–ball contact", () => {
        const twoTaps = readTimeOf([I(0, 8e-4), I(1.2e-3, 2.1e-3)], [I(5e-4, 1.3e-3)]);
        expect(twoTaps.time).toBeCloseTo(3.1e-3, 15);
        expect(twoTaps.open).toBe(false);
        expect(readTimeOf([I(0, 8e-4)], [I(5e-4, 1.4e-3)]).time).toBeCloseTo(2.4e-3, 15);
        expect(readTimeOf([I(0, 8e-4)], [I(5e-4, 1.4e-3)]).open).toBe(false);
    });
    it("ignores a contact beginning after the strike's window, such as the drive's late catch", () => {
        expect(readTimeOf([I(0, 1.5e-3), I(0.109, 0.1092)], [I(1e-5, 1.4e-3)]).time).toBeCloseTo(2.5e-3, 15);
    });
    it("counts a face re-contact soon after the strike, such as B2GS's double tap", () => {
        // Gugan 4 reads W "after the double tap": B2GS's face intervals and its balls' interval (ms), read 1 ms after
        // the second face interval's end.
        expect(readTimeOf([I(0, 1.1e-3), I(10.79e-3, 12.24e-3)], [I(3.26e-3, 4.07e-3)]).time).toBeCloseTo(13.24e-3, 15);
    });
    it("flags a strike still open at the window's end", () => {
        // Review focus 4. P2b.2b.2c.2b: the strike window widened to 15 ms at the gate (was 5 ms); the face interval
        // ends 1 ms after the window, as 6 ms did against 5 ms.
        expect(readTimeOf([I(0, 16e-3)], [I(1e-4, 1e-3)]).open).toBe(true);
    });
    it("reads an impact's last step when it ends before the read time", () => {
        // Review focus 4: every figure finite, the time the last step's. A tracked impact runs on until the hands
        // settle, long after any read time, so the branch is pinned on samples ending at 2 ms against a 3.1 ms read.
        const samples = [0, 5e-4, 1e-3, 1.5e-3, 2e-3].map((t, i) => ({ t, head: 3 - i, w1: i, v2: 2 * i }));
        const r = readSamples(samples, 0, 3.1e-3);
        expect([r.U, r.W, r.w1, r.v2].every(Number.isFinite)).toBe(true);
        expect(r.time).toBe(2e-3);
        expect([r.U, r.W, r.w1, r.v2]).toEqual([3, -1, 4, 8]);
    });
    it("gives the canonical drive's speeds on the Table 1 and 2 laws, at gap 0 and no push", () => {
        // History: the squeeze design's "Why this step" measured, at 3 m/s and guideEffort 0, striker 1.618, croqueted
        // 3.763, mallet 0.80 m/s, read as the ball leaves the face (≈1.5 ms): the first step after the last face
        // interval ends. P2b.2b.2c.2c: the face's
        // T(U) re-set on Gugan 4's Table 2 (was 1.618, 3.763 and 0.8 m/s, one face interval): the quicker face lets go
        // of the striker's ball at 0.86 ms, before the balls part at 1.135 ms, and taps it again 0.985–2.075 ms, as the
        // film's double tap; read as the ball leaves at 2.08 ms, striker 1.2333, croqueted 3.6396, mallet 1.0011 m/s.
        // P2b.2b.2c.2c: the ball–ball contact time set from Table 1 (was two face intervals; 1.2333, 3.6396 and 1.0011
        // m/s): the quicker ball–ball contact parts the balls at 0.950 ms, before the face lets go at 1.045 ms, so the
        // face meets the striker's ball once; read as the ball leaves at 1.05 ms, striker 1.3919, croqueted 3.7663,
        // mallet 0.8827 m/s.
        // P2b.2b.2c.3a: the swung body and one law after contact (was the face letting go at 1.045 ms; striker 1.3919,
        // croqueted 3.7663, mallet 0.8827 m/s): the head carries the hands' skin, not the arm mass, and from contact
        // the hands flex through their chains where the swing law's damper dragged the top grip. The face lets go at
        // 1.050 ms; read as the ball leaves at 1.055 ms, striker 1.3928, croqueted 3.7644, mallet 0.8876 m/s.
        // P2b.2b.2c.3a: the drive's hands together (was 0.6; the face letting go at 1.050 ms, striker 1.3928, croqueted
        // 3.7644, mallet 0.8876 m/s): the bottom hand a hand's breadth below the top. The face lets go at 1.045 ms;
        // read as the ball leaves at 1.05 ms, striker 1.3904, croqueted 3.7630, mallet 0.8831 m/s.
        const r = readOut(guganSetup("drive", 3, 0, { guideEffort: 0 }), WORLD);
        const face = r.impact.timeline["face/blue"] ?? [];
        const end = face[face.length - 1]?.end ?? Infinity;
        const leaving = r.samples.find((s) => s.t > end);
        expect(face).toHaveLength(1);
        expect(leaving?.w1).toBeCloseTo(1.3904, 4);
        expect(leaving?.v2).toBeCloseTo(3.763, 4);
        expect(leaving?.head).toBeCloseTo(0.8831, 4);
        // The read-out's own, 1 ms after the last contact (2.5 ms): the croqueted ball skids on the turf with no
        // forward roll yet, and the turf's sliding friction on it (about 3.5–3.9 N against aim, under a normal force
        // of about 7.2–8.1 N) slows it by about 0.008 m/s; the striker's ball and the mallet barely change. The
        // ball–ball pair now slides on to its slip's reversal (frictionStep): its tangential impulse presses the
        // croqueted ball into the turf about 2 % harder (−0.01803 against −0.01764 N·s). It leaves 6e-5 m/s slower
        // and the turf's larger friction takes 9e-5 m/s more by the read (v₂ 3.75479 before). The mallet leaves 5e-5
        // m/s slower (W 0.79048 before), through the face's friction on the striker's ball, whose motion the ball–ball
        // pair's changed. P2b.2b.2c.2c: the face's T(U) re-set (was 2.5 ms; w₁ 1.6175, v₂ 3.7546, W 0.7904): the second
        // tap ends at 2.075 ms, so the read is at 3.075 ms; the croqueted ball, skidding, loses 0.0104 m/s to the turf
        // by then, and the striker's ball and the mallet barely change. P2b.2b.2c.2c: the ball–ball contact time set
        // (was 3.075 ms; w₁ 1.233, v₂ 3.6292, W 1.0012): the one face interval ends at 1.045 ms, so the read is at
        // 2.045 ms; the croqueted ball loses 0.0082 m/s to the turf by then. P2b.2b.2c.3a: the swung body and one law
        // after contact (was 2.045 ms; w₁ 1.3913, v₂ 3.7581, W 0.8829): the face lets go at 1.050 ms, so the read is at
        // 2.050 ms; w₁ 1.3917, v₂ 3.7565, and the mallet, no longer dragged by the swing law's damper, 0.8978 m/s.
        // P2b.2b.2c.3a: the drive's hands together (was 2.050 ms; w₁ 1.3917, v₂ 3.7565, W 0.8978): the face lets go at
        // 1.045 ms, so the read is at 2.045 ms; w₁ 1.3895, v₂ 3.7550, W 0.8853 m/s.
        expect(r.time).toBeCloseTo(2.045e-3, 12);
        expect(r.w1).toBeCloseTo(1.3895, 4);
        expect(r.v2).toBeCloseTo(3.755, 4);
        expect(r.W).toBeCloseTo(0.8853, 4);
    });
});

describe("Gugan's mallet (design 'My calls', §8.1)", () => {
    // About 33 s locally: each pass of each preset's solve plans the contact 62 times and the stroke's speed once.
    it("gives an effective mass of 2.30 ball masses on each preset, the lean kept, the default untouched", () => {
        for (const type of ["drive", "stop-ac", "single-ball"] as const) {
            const before = structuredClone(defaultProfile.mallet);
            const setup = guganSetup(type, 3, 0, { gugan: true });
            expect(Math.abs(effectiveMassOf(setup, WORLD) - 2.3 * WORLD.ball.mass)).toBeLessThanOrEqual(1e-6);
            expect(leanOf(setup, WORLD)).toBeCloseTo(leanOf(canonicalSetup(type), WORLD), 12);
            expect(defaultProfile.mallet).toEqual(before);
        }
    }, 150_000);
    it("throws when the target mass lies outside the bracket", () => {
        // Review focus 5: a world whose ball is so heavy that 2.30 m_b exceeds the heaviest head's effective mass.
        expect(() => gugansMallet("drive", 3, heavyBallWorld())).toThrow(/drive.*outside/);
    });
});

describe("the impact step as an option", () => {
    it("is today's run to the bit when absent, and moves the run when given", () => {
        const setup = fitSetup("drive", TODAY, 3);
        const world = fitWorld(TODAY);
        expect(ratioOf(setup, runFit(setup, TODAY, world, {}).motion)).toBe(ratiosAt(TODAY).drive);
        expect(ratioOf(setup, runFit(setup, TODAY, world, { dt: 2.5e-6 }).motion)).not.toBe(ratiosAt(TODAY).drive);
    });
});

describe("the fit's entry points (P2b.2b.2c.2's final review)", () => {
    it("moves the drive's ratio when only the ball–ball contact time moves", () => {
        const p = { ...TODAY, ballBallContactTime: BOUNDS.ballBallContactTime[0] };
        const setup = fitSetup("drive", p, 3);
        expect(ratioOf(setup, runFit(setup, p, fitWorld(p)).motion)).not.toBe(ratiosAt(TODAY).drive);
    });
    it("leaves the drive's ratio unchanged when only the arm mass moves", () => {
        // P2b.2b.2c.3a A2 item 4: the swung body on every stroke (was "moves the drive's ratio when only the arm mass
        // moves"). The arm mass rode rigidly at the top grip in the swing law's body; every stroke's body is now the
        // head with the hands' skin, and the downswing's plan, the arm mass's only reader, is unchanged by a point mass
        // at its pivot. The drive's ratio at armMass 0 is 3.924316421868235 to the bit, as at 0.8 kg: the fit's arm
        // mass no longer reaches the run.
        const p = { ...TODAY, armMass: BOUNDS.armMass[0] };
        const setup = fitSetup("drive", p, 3);
        expect(ratioOf(setup, runFit(setup, p, fitWorld(p)).motion)).toBe(ratiosAt(TODAY).drive);
    });
});

describe("the read-out's tidy (P2b.2b.2c.2c design §10)", () => {
    const I = (start: number, end: number) => ({ start, end });
    /** A `filmedStrokeRuns` element with only the fields `meansOf` reads. */
    const run = (name: string, v2U: number, open: boolean) =>
        ({ stroke: { name }, read: { open }, figures: { v2U, w1W: v2U, v2w1: v2U } }) as unknown as ReturnType<
            typeof filmedStrokeRuns
        >[number];
    it("flags a strike whose ball–ball contact is still open at the window's end", () => {
        expect(readTimeOf([I(0, 8e-4)], [I(5e-4, 16e-3)]).open).toBe(true);
    });
    it("averages over exactly the named strokes, and throws for one not counted", () => {
        const runs = [run("C1D", 1.1, false), run("C3D", 1.2, false), run("C3S", 9, true)];
        expect(meansOf(runs, ["C1D", "C3D"]).v2U).toBeCloseTo(1.15, 12);
        expect(() => meansOf(runs, ["C1D", "C3S"])).toThrow(/C3S/);
        expect(() => meansOf(runs, ["C1D", "B4GS"])).toThrow(/B4GS/);
    });
    it("holds the eight gapped strokes and all ten by name", () => {
        expect(GAPPED_STROKES).toEqual(FILMED_STROKES.filter((s) => s.gap > 0).map((s) => s.name));
        expect(ALL_STROKES).toEqual(FILMED_STROKES.map((s) => s.name));
    });
});

describe("the strike's window (P2b.2b.2c.2c design §7.7)", () => {
    const I = (start: number, end: number) => ({ start, end });
    it("counts a contact beginning at the window's end, and not one beginning after it", () => {
        const atEnd = readTimeOf([I(0, 8e-4), I(STRIKE_WINDOW, STRIKE_WINDOW + 1e-4)], []);
        expect(atEnd.time).toBeCloseTo(STRIKE_WINDOW + 1e-4 + READ_DELAY, 15);
        // The counted contact begins at the window's end and ends after it, so the strike is still open.
        expect(atEnd.open).toBe(true);
        const after = readTimeOf([I(0, 8e-4), I(STRIKE_WINDOW + 1e-9, 0.02)], []);
        expect(after.time).toBeCloseTo(8e-4 + READ_DELAY, 15);
        expect(after.open).toBe(false);
    });
});
