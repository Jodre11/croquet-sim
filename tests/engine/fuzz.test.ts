import { describe, expect, it } from "vitest";
import { CONTACT_TOLERANCE } from "../../src/engine/detect";
import { add, horizontal, length, scale, sub, vec3 } from "../../src/engine/math/vec3";
import { stateAtTime } from "../../src/engine/sample";
import { simulateFreeMotion } from "../../src/engine/simulate";
import { BALL_IDS, type BallId, type BallState, type BallStates } from "../../src/engine/types";
import { defaultWorld, obstaclesOf } from "../../src/engine/world";
import { mechanicalEnergy } from "./support/energy";
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

/**
 * Turns a shot into one that pushes, without drawing from the generator (so the other shots stay as they were): the
 * first spinning ball loses its velocity, keeping its spin, and the ball nearest it is moved to touch it, so the spin
 * may drive the pair together. Returns the shot unchanged when the moved ball would overlap anything.
 */
function pressed(setup: BallStates): BallStates {
    const ids = BALL_IDS.filter((id) => setup[id]);
    const mover = ids.find((id) => length(setup[id]?.angularVelocity ?? vec3(0, 0, 0)) > 0);
    if (!mover) {
        return setup;
    }
    const m = (setup[mover] as BallState).position;
    const others = ids.filter((id) => id !== mover);
    const distance = (id: BallId): number => length(sub((setup[id] as BallState).position, m));
    const nearest = others.reduce((a, b) => (distance(b) < distance(a) ? b : a));
    const towards = sub((setup[nearest] as BallState).position, m);
    const p = add(m, scale(towards, (2 * R) / length(towards)));
    const separated = others.every((id) => id === nearest || length(sub((setup[id] as BallState).position, p)) > 2 * R);
    const clear = obstacles.every((o) => length(horizontal(sub(p, o.centre))) > R + o.radius + 1e-3);
    if (!separated || !clear) {
        return setup;
    }
    return {
        ...setup,
        [mover]: { ...(setup[mover] as BallState), velocity: vec3(0, 0, 0) },
        [nearest]: { ...(setup[nearest] as BallState), position: p },
    };
}

describe("seeded fuzz on the default world", () => {
    it(
        `survives ${SHOTS} random shots without throwing, aborting, falling back, penetrating or gaining energy`,
        { timeout: 30_000 },
        () => {
            const random = rng(SEED);
            let contactShots = 0;
            let restingShots = 0;
            let obstacleShots = 0;
            let hopShots = 0;
            let solves = 0;
            const probe = { before: (): void => undefined, after: (): void => void solves++ };
            for (let index = 0; index < SHOTS; index++) {
                const drawn = randomShot(random);
                // Every fourth shot is pressed into a push: random shots alone almost never come to rest in contact.
                const setup = index % 4 === 0 ? pressed(drawn) : drawn;
                const label = `seed ${SEED}, shot ${index}`;
                const result = simulateFreeMotion(setup, world, undefined, { probe });
                contactShots += result.events.some((e) => e.kind === "ball-ball") ? 1 : 0;
                restingShots += result.events.some((e) => e.kind === "ball-ball" && e.resting) ? 1 : 0;
                obstacleShots += result.events.some((e) => e.kind === "ball-obstacle") ? 1 : 0;
                hopShots += result.events.some((e) => e.kind === "landing") ? 1 : 0;
                expect(result.aborted, label).toBe(false);
                expect(
                    result.events.filter(
                        (e) =>
                            e.kind === "approximate-hold" || e.kind === "approximate-slip" || e.kind === "budget-hold",
                    ),
                    label,
                ).toEqual([]);
                expect(worstPenetration(result, world), label).toBeLessThanOrEqual(CONTACT_TOLERANCE);
                let previous = Infinity;
                for (let i = 0; i <= ENERGY_SAMPLES; i++) {
                    const t = (result.duration * i) / ENERGY_SAMPLES;
                    const energy = BALL_IDS.filter((id) => result.segments[id]).reduce(
                        (sum, id) => sum + mechanicalEnergy(stateAtTime(result, id, t), world.ball, world.gravity),
                        0,
                    );
                    expect(energy, `${label}, t ${t}`).toBeLessThanOrEqual(previous + 1e-9);
                    previous = energy;
                }
            }
            // Guards the generator: the fuzz must actually exercise collisions, pushes, obstacle contacts and hops.
            expect(contactShots).toBeGreaterThan(10);
            expect(restingShots + obstacleShots).toBeGreaterThan(0);
            expect(hopShots).toBeGreaterThan(0);
            // The fall-back assertion above checks nothing unless the resting-contact solver actually runs.
            expect(solves).toBeGreaterThan(0);
        },
    );
});
