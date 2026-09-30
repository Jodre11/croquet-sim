import { describe, expect, it } from "vitest";
import { CONTACT_TOLERANCE } from "../../src/engine/detect";
import { horizontal, length, sub, vec3 } from "../../src/engine/math/vec3";
import { stateAtTime } from "../../src/engine/sample";
import { simulateFreeMotion } from "../../src/engine/simulate";
import { BALL_IDS, type BallStates } from "../../src/engine/types";
import { defaultWorld, obstaclesOf } from "../../src/engine/world";
import { kineticEnergy } from "./support/energy";
import { worstPenetration } from "./support/penetration";
import { rng } from "./support/rng";

const SEED = 20260930;
const SHOTS = 200;
const ENERGY_SAMPLES = 200;
const world = defaultWorld();
const R = world.ball.radius;
const obstacles = obstaclesOf(world);

/** Builds a random legal setup: four separated balls clear of the obstacles, one or two of them moving. */
function randomShot(random: () => number): BallStates {
    const between = (lo: number, hi: number): number => lo + (hi - lo) * random();
    // Half the shots are clustered so that collisions, pushes and obstacle contacts are common.
    const clustered = random() < 0.8;
    const spread = clustered ? 0.5 : 10;
    const cx = between(1 + spread, world.lawn.width - 1 - spread);
    const cy = between(1 + spread, world.lawn.length - 1 - spread);
    const positions: { x: number; y: number }[] = [];
    while (positions.length < BALL_IDS.length) {
        const p = { x: cx + between(-spread, spread), y: cy + between(-spread, spread) };
        const separated = positions.every((q) => Math.hypot(p.x - q.x, p.y - q.y) > 2 * R + 1e-3);
        const clear = obstacles.every(
            (o) => length(horizontal(sub(vec3(p.x, p.y, 0), o.centre))) > R + o.radius + 1e-3,
        );
        if (separated && clear) {
            positions.push(p);
        }
    }
    const pick = (i: number): { x: number; y: number } => {
        const p = positions[i % positions.length];
        if (!p) {
            throw new Error("no positions");
        }
        return p;
    };
    const movers = new Set<number>([Math.floor(random() * 4)]);
    if (random() < 0.5) {
        movers.add(Math.floor(random() * 4));
    }
    const states: Partial<Record<(typeof BALL_IDS)[number], BallStates[keyof BallStates]>> = {};
    BALL_IDS.forEach((id, i) => {
        const p = pick(i);
        const moving = movers.has(i);
        const speed = between(0, 4);
        const other = pick(i + 1 + Math.floor(random() * 3));
        const aimed = Math.atan2(other.y - p.y, other.x - p.x) + between(-0.4, 0.4);
        const heading = clustered ? aimed : between(0, 2 * Math.PI);
        states[id] = {
            position: vec3(p.x, p.y, R),
            velocity: moving ? vec3(speed * Math.cos(heading), speed * Math.sin(heading), 0) : vec3(0, 0, 0),
            angularVelocity: moving ? vec3(between(-80, 80), between(-80, 80), between(-20, 20)) : vec3(0, 0, 0),
        };
    });
    return states as BallStates;
}

describe("seeded fuzz on the default world", () => {
    it(
        `survives ${SHOTS} random shots without throwing, aborting, holding approximately, penetrating or gaining energy`,
        { timeout: 30_000 },
        () => {
            const random = rng(SEED);
            let contactShots = 0;
            let restingShots = 0;
            let obstacleShots = 0;
            for (let index = 0; index < SHOTS; index++) {
                const setup = randomShot(random);
                const label = `seed ${SEED}, shot ${index}`;
                const result = simulateFreeMotion(setup, world);
                contactShots += result.events.some((e) => e.kind === "ball-ball") ? 1 : 0;
                restingShots += result.events.some((e) => e.kind === "ball-ball" && e.resting) ? 1 : 0;
                obstacleShots += result.events.some((e) => e.kind === "ball-obstacle") ? 1 : 0;
                expect(result.aborted, label).toBe(false);
                expect(
                    result.events.some((e) => e.kind === "approximate-hold"),
                    label,
                ).toBe(false);
                expect(worstPenetration(result, world), label).toBeLessThanOrEqual(CONTACT_TOLERANCE);
                let previous = Infinity;
                for (let i = 0; i <= ENERGY_SAMPLES; i++) {
                    const t = (result.duration * i) / ENERGY_SAMPLES;
                    const energy = BALL_IDS.filter((id) => result.segments[id]).reduce(
                        (sum, id) => sum + kineticEnergy(stateAtTime(result, id, t), world.ball),
                        0,
                    );
                    expect(energy, `${label}, t ${t}`).toBeLessThanOrEqual(previous + 1e-9);
                    previous = energy;
                }
            }
            // Guards the generator: the fuzz must actually exercise collisions, pushes and obstacle contacts.
            expect(contactShots).toBeGreaterThan(10);
            expect(restingShots + obstacleShots).toBeGreaterThan(0);
        },
    );
});
