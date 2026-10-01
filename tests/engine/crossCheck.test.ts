import { describe, expect, it } from "vitest";
import { length, sub, vec3 } from "../../src/engine/math/vec3";
import { simulateFreeMotion } from "../../src/engine/simulate";
import type { BallId, BallStates, World } from "../../src/engine/types";
import { bruteForce } from "./support/bruteForce";
import { TEST_BALL, airborneAt, ballAt, rollingBallAt, testWorld } from "./support/fixtures";

const R = TEST_BALL.radius;
const DT = 2e-6;
const TOLERANCE = 1e-3;
const C30 = Math.sqrt(3) / 2;

/**
 * The engine treats a pushing contact as frictionless (see push.ts), while the integrator applies ball–ball friction
 * on every one of its many small impulses. Scenarios whose balls slide against each other while pushing therefore
 * run with ball–ball friction switched off, so that they check the pushing mechanics rather than that
 * simplification.
 */
const FRICTIONLESS: Partial<World> = { ballBall: { restitution: 0.8, friction: 0 } };

const SCENARIOS: Record<string, { readonly initial: BallStates; readonly world?: Partial<World> }> = {
    "single ball with sidespin (curving slide)": { initial: { blue: ballAt(5, 5, vec3(2.5, 0.4, 0), vec3(25, 0, 3)) } },
    "cut rush with spin": { initial: { blue: ballAt(5, 5, vec3(2.5, 0, 0), vec3(0, 10, 5)), red: ballAt(6, 5.06) } },
    "peg glance then cannon": {
        initial: { blue: rollingBallAt(13, 19.94, 2.2, 0), red: ballAt(15.45, 19.69), black: ballAt(16.25, 19.59) },
    },
    "topspin push (resting contact)": {
        initial: { blue: ballAt(5, 5, vec3(0, 0, 0), vec3(0, 60, 0)), red: ballAt(5 + 2 * R, 5) },
    },
    "rush into a chain of touching balls, then a push": {
        initial: {
            blue: rollingBallAt(5, 5, 2, 0),
            red: ballAt(6, 5),
            black: ballAt(6 + 2 * R, 5),
            yellow: ballAt(6 + 4 * R, 5),
        },
    },
    "push into two touching balls at an angle (wedge)": {
        initial: {
            blue: ballAt(5, 5, vec3(0, 0, 0), vec3(0, 80, 0)),
            red: ballAt(5 + 2 * R * C30, 5 - R),
            black: ballAt(5 + 2 * R * C30, 5 + R),
        },
        world: FRICTIONLESS,
    },
    "dropped with backspin": {
        initial: { blue: airborneAt(5, 5, 0.5, vec3(1, 0, 0), vec3(0, -60, 0)) },
    },
};

describe("event solver versus brute-force integration", () => {
    for (const [name, { initial, world: overrides }] of Object.entries(SCENARIOS)) {
        it(`agrees within 1 mm: ${name}`, { timeout: 120_000 }, () => {
            const world = testWorld(overrides);
            const exact = simulateFreeMotion(initial, world);
            const reference = bruteForce(initial, world, DT, exact.duration + 1);
            for (const id of Object.keys(initial) as BallId[]) {
                const a = exact.rest[id];
                const b = reference[id];
                expect(a && b ? length(sub(a, b)) : Infinity, `ball ${id}`).toBeLessThan(TOLERANCE);
            }
        });
    }

    it("exercises the contacts each scenario is named after", () => {
        const kinds = (name: string): readonly string[] => {
            const { initial, world } = SCENARIOS[name] as { initial: BallStates; world?: Partial<World> };
            return simulateFreeMotion(initial, testWorld(world)).events.map((e) =>
                e.kind === "ball-ball" ? `${e.balls.join("-")}${e.resting ? " resting" : ""}` : e.kind,
            );
        };
        const glance = kinds("peg glance then cannon");
        expect(glance).toContain("ball-obstacle");
        expect(glance).toContain("blue-red");
        expect(glance).toContain("red-black");
        expect(kinds("topspin push (resting contact)")).toContain("blue-red resting");
        expect(kinds("rush into a chain of touching balls, then a push")).toContain("blue-red resting");
        const wedge = kinds("push into two touching balls at an angle (wedge)");
        expect(wedge).toContain("blue-red resting");
        expect(wedge).not.toContain("approximate-hold");
        expect(kinds("dropped with backspin")).toContain("landing");
    });
});
