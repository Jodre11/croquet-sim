/**
 * Realistic shot mix through the engine with friction on (P2a.2 design §6, performance measurement). Generates
 * croquet-like shots (croquet strokes, rushes, cannons, hoop approaches, jammed balls, peg play, pushes, single
 * balls), runs each twice (the first warms the JIT and is discarded) and reports per shot the resting-contact solves,
 * their work units and time, the engine's time, the landings per shot, and each landing's figures on the default
 * lawn's turf bed (its duration, travel, spin before and after, and cost; P2b.2b.2b.2a design §6). Run with
 * `npx --yes tsx scripts/shotMix.ts`; environment: COUNT (shots, default 3000), SEED (default 7). Not part of the test
 * suite.
 */
import { ZERO, add, length, scale, vec3, type Vec3 } from "../src/engine/math/vec3";
import { rollingSpin } from "../src/engine/motion";
import { SOLVE_BUDGET, simulateFreeMotion, type LandingRecord } from "../src/engine/simulate";
import type { BallId, BallState, BallStates, World } from "../src/engine/types";
import { obstaclesOf, uniformLawn, uprightsOf } from "../src/engine/world";
import { contactReference } from "../src/reference/index";
import { testHoop, testWorld } from "../tests/engine/support/fixtures";
import { rng } from "../tests/engine/support/rng";

// The project has no Node types; this script runs under tsx and reads only its environment.
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

const COUNT = Number(process.env.COUNT ?? "3000");
const SEED = Number(process.env.SEED ?? "7");
const R = 0.046;
const random = rng(SEED);
const uni = (a: number, b: number): number => a + (b - a) * random();
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(random() * xs.length)] as T;

// Six hoops in the standard pattern around the peg (15, 20), 6.4 m (7 yd) apart.
const HOOPS = [
    testHoop("1", 8.6, 13.6),
    testHoop("2", 21.4, 13.6),
    testHoop("3", 21.4, 26.4),
    testHoop("4", 8.6, 26.4),
    testHoop("5", 15, 13.6),
    testHoop("6", 15, 26.4),
];
// The default lawn's turf bed (P2b.2b.2b.2a decision 12), so that the landings meet the fitted bed.
const SURFACE = testWorld().lawn.surfaceAt(vec3(0, 0, 0));
const WORLD: World = testWorld({
    hoops: HOOPS,
    lawn: uniformLawn(30, 40, {
        ...SURFACE,
        bedModulus: contactReference.bedModulus.value,
        bedRecovery: contactReference.bedRecovery.value,
    }),
});
const OBSTACLES = obstaclesOf(WORLD);
const IDS: readonly BallId[] = ["blue", "red", "black", "yellow"];

const unit = (a: number): Vec3 => vec3(Math.cos(a), Math.sin(a), 0);
const at = (p: Vec3, a: number, d: number): Vec3 => vec3(p.x + d * Math.cos(a), p.y + d * Math.sin(a), R);
const rest = (p: Vec3): BallState => ({ position: p, velocity: ZERO, angularVelocity: ZERO });

/** A struck ball: speed v along angle a; spin s × rolling spin (1 rolls, 0 stun, < 0 backspin, > 1 topspin), side. */
function struck(p: Vec3, a: number, v: number, s: number, side = 0): BallState {
    const velocity = scale(unit(a), v);
    return { position: p, velocity, angularVelocity: add(scale(rollingSpin(velocity, 0, R), s), vec3(0, 0, side)) };
}

/** Random spin for a mallet stroke: mostly near stun–roll, occasionally heavy top or back. */
function strokeSpin(): number {
    const u = random();
    return u < 0.5 ? uni(0.2, 0.8) : u < 0.8 ? uni(0.8, 1.6) : u < 0.95 ? uni(-0.4, 0.2) : uni(1.6, 2.5);
}

function sideSpin(): number {
    return random() < 0.7 ? 0 : uni(-15, 15);
}

/** Somewhere on court, away from the boundary. */
function anywhere(): Vec3 {
    return vec3(uni(1, 29), uni(1, 39), R);
}

function overlaps(states: readonly BallState[]): boolean {
    for (let i = 0; i < states.length; i++) {
        const p = (states[i] as BallState).position;
        if (p.x < 0.2 || p.x > 29.8 || p.y < 0.2 || p.y > 39.8) {
            return true;
        }
        for (let j = i + 1; j < states.length; j++) {
            const q = (states[j] as BallState).position;
            if (Math.hypot(p.x - q.x, p.y - q.y) < 2 * R - 1e-12) {
                return true;
            }
        }
        for (const o of OBSTACLES) {
            if (Math.hypot(p.x - o.centre.x, p.y - o.centre.y) < R + o.radius - 1e-12) {
                return true;
            }
        }
    }
    return false;
}

/** Fills the remaining balls with random court positions. */
function withOthers(placed: BallState[]): BallState[] {
    const out = [...placed];
    while (out.length < 4) {
        out.push(rest(anywhere()));
    }
    return out;
}

function nearHoop(): { readonly hoop: (typeof HOOPS)[number]; readonly up: readonly [Vec3, Vec3] } {
    const hoop = pick(HOOPS);
    const ups = uprightsOf(hoop, WORLD.ballUpright);
    return { hoop, up: [ups[0].centre, ups[1].centre] };
}

const generators: { readonly name: string; readonly weight: number; readonly make: () => BallState[] }[] = [
    {
        // Striker touching the croqueted ball; split angle up to ±50° off the line of centres.
        name: "croquet",
        weight: 0.3,
        make: () => {
            const s = anywhere();
            const a = uni(0, 2 * Math.PI);
            const c = at(s, a, 2 * R);
            const split = random() < 0.4 ? 0 : uni(-50, 50) * (Math.PI / 180);
            return withOthers([struck(s, a + split, uni(0.4, 5), strokeSpin(), sideSpin()), rest(c)]);
        },
    },
    {
        // Rush or cut rush from 0.1–4 m, offset up to almost a full ball width.
        name: "rush",
        weight: 0.15,
        make: () => {
            const t = anywhere();
            const a = uni(0, 2 * Math.PI);
            const d = random() < 0.5 ? uni(0.1, 0.5) : uni(0.5, 4);
            const off = random() < 0.4 ? uni(-0.3, 0.3) * R : uni(-1.9, 1.9) * R;
            const back = vec3(t.x - d * Math.cos(a) - off * Math.sin(a), t.y - d * Math.sin(a) + off * Math.cos(a), R);
            return withOthers([struck(back, a, uni(0.3, 4), random() < 0.7 ? 1 : strokeSpin()), rest(t)]);
        },
    },
    {
        // Cannon: three balls touching, the striker hit into them.
        name: "cannon",
        weight: 0.1,
        make: () => {
            const s = anywhere();
            const a = uni(0, 2 * Math.PI);
            const c = at(s, a, 2 * R);
            const third = at(random() < 0.4 ? s : c, uni(0, 2 * Math.PI), 2 * R);
            const split = uni(-45, 45) * (Math.PI / 180);
            return withOthers([struck(s, a + split, uni(0.3, 4), strokeSpin(), sideSpin()), rest(c), rest(third)]);
        },
    },
    {
        // Hoop approach or run from 0.05–3 m in front; sometimes another ball beyond it or jammed in it.
        name: "hoop",
        weight: 0.15,
        make: () => {
            const { hoop, up } = nearHoop();
            const n = scale(hoop.normal, random() < 0.5 ? 1 : -1);
            const d = random() < 0.5 ? uni(0.05, 0.6) : uni(0.6, 3);
            const lat = uni(-0.07, 0.07);
            const l = vec3(-hoop.normal.y, hoop.normal.x, 0);
            const start = vec3(hoop.centre.x - d * n.x + lat * l.x, hoop.centre.y - d * n.y + lat * l.y, R);
            const heading = Math.atan2(n.y, n.x);
            const balls = [
                struck(start, heading + uni(-25, 25) * (Math.PI / 180), uni(0.15, 2.5), strokeSpin(), sideSpin()),
            ];
            if (random() < 0.35) {
                const u = random() < 0.5 ? up[0] : up[1];
                const toward = Math.atan2(hoop.centre.y - u.y, hoop.centre.x - u.x) + uni(-0.6, 0.6);
                balls.push(
                    rest(
                        random() < 0.5
                            ? at(u, toward, R + 0.008)
                            : at(hoop.centre, heading + uni(-0.5, 0.5), uni(0.1, 0.5)),
                    ),
                );
            }
            return withOthers(balls);
        },
    },
    {
        // A ball touching an upright, struck itself or struck by another ball.
        name: "jammed",
        weight: 0.08,
        make: () => {
            const { up } = nearHoop();
            const u = random() < 0.5 ? up[0] : up[1];
            const a = uni(0, 2 * Math.PI);
            const p = at(u, a, R + 0.008);
            if (random() < 0.5) {
                return withOthers([struck(p, a + Math.PI + uni(-1.4, 1.4), uni(0.1, 2), strokeSpin(), sideSpin())]);
            }
            const from = a + uni(-1, 1);
            const s = at(p, from, uni(2 * R + 0.01, 1));
            return withOthers([struck(s, from + Math.PI + uni(-0.1, 0.1), uni(0.1, 2), 1), rest(p)]);
        },
    },
    {
        // A ball rolled at the peg, or a ball touching the peg struck or hit.
        name: "peg",
        weight: 0.07,
        make: () => {
            const peg = WORLD.peg.centre;
            const a = uni(0, 2 * Math.PI);
            if (random() < 0.5) {
                const p = at(peg, a, uni(0.1, 3));
                return withOthers([
                    struck(p, a + Math.PI + uni(-0.03, 0.03), uni(0.1, 2), random() < 0.7 ? 1 : strokeSpin()),
                ]);
            }
            const p = at(peg, a, R + 0.02);
            const s = at(p, a + uni(-1, 1), 2 * R + uni(0, 0.8));
            return withOthers([struck(s, Math.atan2(p.y - s.y, p.x - s.x) + uni(-0.1, 0.1), uni(0.1, 2), 1), rest(p)]);
        },
    },
    {
        // Pushes: a slow striker touching a ball (or a touching pair), or rolled gently into a touching pair.
        name: "push",
        weight: 0.1,
        make: () => {
            const s = anywhere();
            const a = uni(0, 2 * Math.PI);
            const c = at(s, a, 2 * R);
            const pair = at(c, a + uni(-1, 1), 2 * R);
            if (random() < 0.5) {
                const extra = random() < 0.5 ? [rest(pair)] : [];
                return withOthers([struck(s, a + uni(-0.5, 0.5), uni(0.005, 0.3), strokeSpin()), rest(c), ...extra]);
            }
            const back = at(s, a + Math.PI + uni(-0.2, 0.2), uni(0.05, 1));
            return withOthers([struck(back, a + uni(-0.05, 0.05), uni(0.05, 1), 1), rest(s), rest(c)]);
        },
    },
    {
        // Ordinary single-ball shots with the other balls scattered.
        name: "single",
        weight: 0.05,
        make: () => withOthers([struck(anywhere(), uni(0, 2 * Math.PI), uni(0.2, 5), strokeSpin(), sideSpin())]),
    },
];

function makeShot(): { readonly name: string; readonly states: BallStates } {
    const total = generators.reduce((s, g) => s + g.weight, 0);
    for (;;) {
        let u = random() * total;
        let chosen = generators[0] as (typeof generators)[number];
        for (const g of generators) {
            u -= g.weight;
            if (u < 0) {
                chosen = g;
                break;
            }
        }
        const balls = chosen.make();
        if (overlaps(balls)) {
            continue;
        }
        const states: BallStates = {};
        balls.forEach((b, i) => {
            states[IDS[i] as BallId] = b;
        });
        return { name: chosen.name, states };
    }
}

interface Shot {
    readonly name: string;
    readonly solves: number;
    readonly largest: number;
    readonly work: number;
    readonly solverMs: number;
    readonly engineMs: number;
    readonly fallbacks: number;
    /** Landing events in the shot: each bounce on the turf counts one. */
    readonly landings: number;
    /** Steps and bed column visits over the shot's landings: their cost. */
    readonly landingSteps: number;
    readonly landingVisits: number;
}

/** One landing's figures, from the timed run's probe (P2b.2b.2b.2a design §6). */
interface LandingFigures {
    readonly duration: number;
    readonly travel: number;
    readonly spinBefore: number;
    readonly spinAfter: number;
}

const shots: Shot[] = [];
const landingFigures: LandingFigures[] = [];
let landingCaps = 0;
for (let i = 0; i < COUNT; i++) {
    const { name, states } = makeShot();
    simulateFreeMotion(states, WORLD);
    let solves = 0;
    let largest = 0;
    let work = 0;
    let solverMs = 0;
    let started = 0;
    const probe = {
        before: (): void => {
            started = performance.now();
        },
        after: (units: number, bodies: number): void => {
            solverMs += performance.now() - started;
            solves++;
            work += units;
            largest = Math.max(largest, bodies);
        },
    };
    let landingSteps = 0;
    let landingVisits = 0;
    const onLanding = (r: LandingRecord): void => {
        landingSteps += r.landing.steps;
        landingVisits += r.landing.visits;
        landingFigures.push({
            duration: r.landing.duration,
            travel: r.landing.travel,
            spinBefore: length(r.before.angularVelocity),
            spinAfter: length(r.landing.state.angularVelocity),
        });
    };
    const t0 = performance.now();
    const result = simulateFreeMotion(states, WORLD, undefined, { probe, landings: onLanding });
    const engineMs = performance.now() - t0;
    const fallbacks = result.events.filter(
        (e) => e.kind === "approximate-hold" || e.kind === "approximate-slip" || e.kind === "budget-hold",
    ).length;
    const landings = result.events.filter((e) => e.kind === "landing").length;
    landingCaps += result.events.filter((e) => e.kind === "landing-cap").length;
    shots.push({ name, solves, largest, work, solverMs, engineMs, fallbacks, landings, landingSteps, landingVisits });
}

const quantile = (xs: readonly number[], q: number): number => {
    const sorted = [...xs].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] as number;
};
/** Percentiles of a list of figures. */
const percentiles = (label: string, xs: readonly number[]): string =>
    xs.length === 0
        ? `${label}: none`
        : `${label}: p50 ${quantile(xs, 0.5).toFixed(3)}, p99 ${quantile(xs, 0.99).toFixed(3)}, ` +
          `p99.9 ${quantile(xs, 0.999).toFixed(3)}, max ${Math.max(...xs).toFixed(3)}`;
type Measure = "solves" | "work" | "solverMs" | "engineMs" | "landings" | "landingSteps" | "landingVisits";
const perShot = (key: Measure): number[] => shots.map((s) => s[key]);
/** Percentiles over the shots of one per-shot measure. */
const row = (label: string, key: Measure): string => percentiles(label, perShot(key));
const worst = shots.reduce((a, b) => (b.engineMs > a.engineMs ? b : a));
console.log(`${shots.length} shots, seed ${SEED}, budget ${SOLVE_BUDGET} units`);
console.log(`shots with no solve: ${((100 * shots.filter((s) => s.solves === 0).length) / shots.length).toFixed(1)}%`);
console.log(`largest group: ${Math.max(...shots.map((s) => s.largest))} balls`);
console.log(row("solves per shot", "solves"));
console.log(row("work units per shot", "work"));
console.log(row("solver ms per shot", "solverMs"));
console.log(row("engine ms per shot", "engineMs"));
console.log(`fallback events: ${shots.reduce((s, x) => s + x.fallbacks, 0)}`);
console.log(row("landings per shot", "landings"));
console.log(`landings in all: ${shots.reduce((s, x) => s + x.landings, 0)}`);
const durations = landingFigures.map((f) => f.duration * 1e3);
const travels = landingFigures.map((f) => f.travel * 1e3);
console.log(percentiles("landing duration (ms)", durations));
console.log(percentiles("landing travel (mm)", travels));
const fell = landingFigures.filter((f) => f.spinAfter < f.spinBefore).length;
const fellShare = landingFigures.length === 0 ? "none" : `${((100 * fell) / landingFigures.length).toFixed(1)}%`;
console.log(`landings whose |ω| fell: ${fellShare}`);
const ratios = landingFigures.filter((f) => f.spinBefore > 0).map((f) => f.spinAfter / f.spinBefore);
console.log(`median |ω| after / before: ${ratios.length === 0 ? "none" : quantile(ratios, 0.5).toFixed(4)}`);
console.log(row("landing steps per shot", "landingSteps"));
console.log(row("landing column visits per shot", "landingVisits"));
console.log(`landing-cap events: ${landingCaps}`);
console.log(
    `worst shot: ${worst.name}, ${worst.solves} solves, ${worst.work} units, ` +
        `solver ${worst.solverMs.toFixed(1)} ms, engine ${worst.engineMs.toFixed(1)} ms`,
);
