import { describe, expect, it } from "vitest";
import { length, sub, vec3, type Vec3 } from "../../src/engine/math/vec3";
import { simulateFreeMotion } from "../../src/engine/simulate";
import type { BallId, BallState, BallStates, Cylinder, World } from "../../src/engine/types";
import { STANDARD_GRAVITY, uniformLawn } from "../../src/engine/world";
import { bruteForce } from "./support/bruteForce";
import { TEST_BALL, TEST_TURF, airborneAt, ballAt, rollingBallAt, testWorld } from "./support/fixtures";

const R = TEST_BALL.radius;
const DT = 2e-6;
const TOLERANCE = 1e-3;
const C30 = Math.sqrt(3) / 2;

/** The peg replaced by an upright (radius 8 mm, μ 0.1) standing `degrees` round red (at (5 + 2R, 5)) from +x. */
function upright(degrees: number): Cylinder {
    const angle = (degrees * Math.PI) / 180;
    const d = R + 0.008;
    return {
        id: "peg",
        centre: vec3(5 + 2 * R + d * Math.cos(angle), 5 + d * Math.sin(angle), 0),
        radius: 0.008,
        material: { restitution: 0.6, friction: 0.1 },
        contactTime: 7e-4,
    };
}

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
    },
    "push against an upright, rolling round it": {
        // Red pushed into an upright 35° round it: well past the holding band (20.29°–20.45°), red rolls round it,
        // rubbing.
        initial: { blue: ballAt(5, 5, vec3(0, 0, 0), vec3(0, 60, 0)), red: ballAt(5 + 2 * R, 5) },
        world: { peg: upright(35) },
    },
    "push into a line bent by 60° (a contact starts to slip)": {
        initial: {
            blue: ballAt(5, 5, vec3(0, 0, 0), vec3(0, 60, 0)),
            red: ballAt(5 + 2 * R, 5),
            black: ballAt(5 + 2 * R + 2 * R * 0.5, 5 + 2 * R * C30),
        },
    },
    "topspin rebound off the peg, checking, then rolling back into it": {
        // Real play: a ball with four times rolling topspin hits the peg, rebounds, slides in place while its spin
        // turns it round, then rolls forward into the peg again.
        initial: { blue: ballAt(15, 19.9, vec3(0, 1, 0), vec3(-4 / R, 0, 0)) },
    },
    "topspin into backspin: the contact sticks, then slips": {
        // As lift.test's stick case: the contact sticks at 0.0893 s and slips again at 0.3778 s.
        initial: {
            blue: ballAt(5, 5, vec3(0, 0, 0), vec3(0, 60, 0)),
            red: ballAt(5 + 2 * R, 5, vec3(0, 0, 0), vec3(0, -61, 0)),
        },
    },
    "dropped with backspin": {
        initial: { blue: airborneAt(5, 5, 0.5, vec3(1, 0, 0), vec3(0, -60, 0)) },
    },
    "cut rush with topspin: the striker hops": {
        initial: { blue: rollingBallAt(5, 5, 3, 0), red: ballAt(6, 5 + R) },
    },
    "ball in flight strikes a ball above its equator": {
        initial: { blue: airborneAt(5, 5, R + 0.02, vec3(3, 0, 0), vec3(0, 20, 0)), red: ballAt(5.5, 5.01) },
    },
    "hop off the peg": {
        initial: { blue: rollingBallAt(14, 20.01, 2.5, 0) },
    },
    "lob over a ball": {
        initial: { blue: airborneAt(5, 5, R, vec3(2, 0, 2.2), vec3(0, 40, 0)), red: ballAt(5.4, 5) },
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
        for (const fallback of ["approximate-hold", "approximate-slip", "budget-hold"]) {
            expect(wedge).not.toContain(fallback);
        }
        const rub = kinds("push against an upright, rolling round it");
        expect(rub).toContain("blue-red resting");
        expect(rub).toContain("ball-obstacle");
        expect(kinds("push into a line bent by 60° (a contact starts to slip)")).toContain("blue-red resting");
        // The rebound's sequence: hit, check (slide), roll forward, hit again, and finally rest.
        const rebound = simulateFreeMotion(
            SCENARIOS["topspin rebound off the peg, checking, then rolling back into it"]?.initial as BallStates,
            testWorld(),
        ).events;
        const hits = rebound.filter((e) => e.kind === "ball-obstacle").map((e) => e.t);
        expect(hits.length).toBeGreaterThanOrEqual(2);
        const between = rebound
            .filter((e) => e.kind === "phase" && e.t > (hits[0] as number) && e.t < (hits[1] as number))
            .map((e) => (e as { phase: string }).phase);
        expect(between).toContain("sliding");
        expect(between.lastIndexOf("rolling")).toBeGreaterThan(between.indexOf("sliding"));
        const phases = rebound.filter((e) => e.kind === "phase").map((e) => (e as { phase: string }).phase);
        expect(phases[phases.length - 1]).toBe("stationary");
        const stick = kinds("topspin into backspin: the contact sticks, then slips");
        expect(stick).toContain("stick-ball");
        expect(stick).toContain("slip-ball");
        expect(kinds("dropped with backspin")).toContain("landing");
        const hop = kinds("cut rush with topspin: the striker hops");
        expect(hop).toContain("blue-red");
        expect(hop).toContain("landing");
        const above = kinds("ball in flight strikes a ball above its equator");
        expect(above).toContain("blue-red");
        expect(above).toContain("landing");
        const peg = kinds("hop off the peg");
        expect(peg).toContain("ball-obstacle");
        expect(peg).toContain("landing");
        expect(kinds("lob over a ball")).toContain("jump");
    });
});

/**
 * Brute force confirms the release onsets of design §6 (it cannot confirm hold limits: its friction follows the
 * momentary slip, so it never realises the static-optimal direction and lands at the bottom of the static/kinetic
 * band). "Held" is a_eff = 4·(d(H) − 2·d(H/2))/H² < 1e-5 m/s² for red's displacement d: a displacement threshold would
 * misread the steady creep that restitution chatter causes (first order in dt). The onset is the zero of a line
 * fitted to a_eff past it, extrapolated to dt = 0 over dt 4e-6, 2e-6 and 1e-6.
 */
describe.skipIf(!import.meta.env.SLOW_TESTS)("brute-force release onsets (slow)", () => {
    const H = 0.25;
    function aEff(
        setup: (angle: number) => { initial: BallStates; world: World },
        degrees: number,
        dt: number,
    ): number {
        const { initial, world } = setup((degrees * Math.PI) / 180);
        const start = (initial.red as BallState).position;
        const moved = (h: number): number => length(sub(bruteForce(initial, world, dt, h).red as Vec3, start));
        return (4 * (moved(H) - 2 * moved(H / 2))) / (H * H);
    }
    /** The angle (degrees) at which a_eff, fitted linearly over `angles`, reaches zero. */
    function zeroOf(values: readonly number[], angles: readonly number[]): number {
        const n = angles.length;
        const mx = angles.reduce((s, x) => s + x, 0) / n;
        const my = values.reduce((s, y) => s + y, 0) / n;
        let sxy = 0;
        let sxx = 0;
        angles.forEach((x, i) => {
            sxy += (x - mx) * ((values[i] as number) - my);
            sxx += (x - mx) * (x - mx);
        });
        const slope = sxy / sxx;
        return mx - my / slope;
    }
    function onset(setup: (angle: number) => { initial: BallStates; world: World }, expected: number): number {
        const steps = [4e-6, 2e-6, 1e-6];
        const angles = [0.05, 0.1, 0.15, 0.2, 0.25].map((d) => expected + d);
        // Held below, at the finest step: below the onset brute force creeps at a rate of order dt² (about 5e-5 m/s²
        // 0.05° below at dt 4e-6, falling fourfold per halving), which smears the onset but not its fitted zero.
        expect(aEff(setup, expected - 0.1, 1e-6), "held below").toBeLessThan(1e-5);
        const zeros = steps.map((dt) => {
            return zeroOf(
                angles.map((a) => aEff(setup, a, dt)),
                angles,
            );
        });
        // To dt = 0 by Aitken's Δ²: the zeros converge geometrically as dt halves, but more slowly than linearly in dt
        // (each step closes about 1/1.6–1/1.75 of the gap, not 1/2), so a linear fit stops about 0.003° short.
        const [z1, z2, z3] = zeros as [number, number, number];
        return z3 - ((z3 - z2) * (z3 - z2)) / (z3 - z2 - (z2 - z1));
    }

    it("releases the bent line at θ_slip = 52.1888955°", { timeout: 3_600_000 }, () => {
        const line = (theta: number): { initial: BallStates; world: World } => ({
            world: testWorld({
                lawn: uniformLawn(30, 40, {
                    slidingFriction: 3 / STANDARD_GRAVITY,
                    rollingResistance: 1.5 / STANDARD_GRAVITY,
                    ...TEST_TURF,
                }),
            }),
            initial: {
                blue: ballAt(5, 5, vec3(0, 0, 0), vec3(0, 60, 0)),
                red: ballAt(5 + 2 * R, 5),
                black: ballAt(5 + 2 * R + 2 * R * Math.cos(theta), 5 + 2 * R * Math.sin(theta)),
            },
        });
        const found = onset(line, 52.1888955);
        expect(Math.abs(found - 52.1888955), `onset ${found}°`).toBeLessThan(0.002);
    });

    it("releases red from the upright at β_slip = 20.290321024°", { timeout: 3_600_000 }, () => {
        const pushed = (beta: number): { initial: BallStates; world: World } => ({
            world: testWorld({ peg: upright((beta * 180) / Math.PI) }),
            initial: { blue: ballAt(5, 5, vec3(0, 0, 0), vec3(0, 60, 0)), red: ballAt(5 + 2 * R, 5) },
        });
        const found = onset(pushed, 20.290321024);
        expect(Math.abs(found - 20.290321024), `onset ${found}°`).toBeLessThan(0.002);
    });
});
