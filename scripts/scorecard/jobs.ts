/**
 * The scorecard's jobs (reality scorecard design §3.4): each measures a set of targets (scripts/scorecard/targets.ts)
 * in one play, reusing the probes' measuring code. A worker imports this only after its parameter override, so every
 * engine constant reads the overridden reference.
 */
import { lawFromContactTime } from "../../src/engine/impact/contactLaw";
import type { ImpactProbe } from "../../src/engine/impact/integrate";
import { simulateImpact } from "../../src/engine/impact/simulateImpact";
import { land } from "../../src/engine/impact/landing";
import { BED_CELL } from "../../src/engine/impact/turfBed";
import { horizontal, length, sub, vec3, type Vec3 } from "../../src/engine/math/vec3";
import { simulateFreeMotion } from "../../src/engine/simulate";
import { simulateShot } from "../../src/engine/shot";
import { DEFAULT_DRIVE, DEFAULT_TIMING } from "../../src/engine/swing/profile";
import type { BallState, World } from "../../src/engine/types";
import { defaultWorld, STANDARD_GRAVITY } from "../../src/engine/world";
import { canonicalSetup, DEFAULT_CROQUET_GAP } from "../../src/lab/canonical";
import {
    canonicalPower,
    HEAD_OVER_BALL,
    MAP_TYPES,
    playJudged,
    textBook,
    travelOf,
    type MapType,
} from "../../src/lab/play";
import { contactReference, frictionReference } from "../../src/reference/index";
import { bodyTop } from "../effortFit";
import { FILMED_STROKES, FREE_COLLISIONS, TABLE2_FACE } from "../filmedStrokes";
import { playRoutes } from "../followThrough";
import { openWorld, opened } from "../openLawn";
import {
    CA_STROKES,
    effectiveMassOf,
    figuresOf,
    fitSetup,
    fitWorld,
    guganSetup,
    leanOf,
    readOut,
    releaseSpeedFor,
    runFit,
    TODAY,
} from "../ratioFit";
import { freeCollision, freeFace } from "../squeeze";
import { LAWN, ROLLS, rollFigures } from "../table6";
import type { Measured } from "./score";
import { USER_CHECKS } from "./targets";

type Job = () => Record<string, Measured>;

const YARD = 0.9144;
const finite = (x: number | null | undefined): number | null =>
    x === null || x === undefined || !Number.isFinite(x) ? null : x;

/** A Table 5 stroke on its preset at its U and recorded gap, default mallet, on Gugan's 13 s open lawn (design §3.1). */
function table5(name: string): Record<string, Measured> {
    const stroke = FILMED_STROKES.find((s) => s.name === name) as (typeof FILMED_STROKES)[number];
    const world = openWorld(LAWN);
    const setup = opened(guganSetup(stroke.preset, stroke.malletSpeed, stroke.gap, { world }));
    const read = readOut(setup, world);
    const figures = figuresOf(read, effectiveMassOf(setup, world) / world.ball.mass);
    const at = read.samples.find((s) => s.t >= read.time) ?? read.samples[read.samples.length - 1];
    const motion = simulateFreeMotion(read.impact.handover, world);
    const other = setup.croqueted ?? setup.live[0];
    const l1 = travelOf(setup, motion, setup.striker);
    const l2 = other === undefined ? NaN : travelOf(setup, motion, other);
    const out: Record<string, Measured> = {
        [`t5.${name}.v2U`]: read.open ? null : finite(figures.v2U),
        [`t5.${name}.w1W`]: read.open ? null : finite(figures.w1W),
        [`t5.${name}.o1`]: read.open ? null : finite(100 * (at?.roll1 ?? NaN)),
        [`t5.${name}.L2L1`]: l1 > 0 ? finite(l2 / l1) : null,
        [`lawn.t5.${name}.L1`]: finite(l1),
        [`lawn.t5.${name}.L2`]: finite(l2),
        // Carried for the derived mean of v₂/w₁ (targets.ts deriveMeans), not a target itself.
        [`_t5.${name}.v2w1`]: read.open ? null : finite(figures.v2w1),
    };
    return out;
}

/**
 * Gugan 5's ratio for `type` at 3 m/s on his mallet, as the slow suite plays the stop (followThroughHarness), on
 * `world` (the standard court by default).
 */
export function gugan5(type: "drive" | "stop-ac", world: World = defaultWorld()): number {
    const canonical = canonicalSetup(type, { world });
    const setup = guganSetup(type, 3, DEFAULT_CROQUET_GAP, {
        world,
        gugan: true,
        ...(type === "drive" ? { guideEffort: 0 } : { jab: 0 }),
        lean: leanOf(canonical, world),
        up: canonical.stroke.contact.up,
        grips: type,
        timing: DEFAULT_TIMING[type],
        drive: DEFAULT_DRIVE[type],
        contactSpeed: true,
    });
    return playRoutes(setup, world).routes.ratio;
}

/** The canonical stroke at canonical power on the 10 s open lawn at the preset hold (design §3.1's playability). */
function canonical(type: MapType): Record<string, Measured> {
    const world = openWorld(10);
    const { sample } = playJudged(type, textBook(type), canonicalPower(type, world), [10], "preset");
    const ratio = sample.byLawn?.[10]?.ratio;
    return {
        [`play.canon.${type}`]: sample.klass === null,
        [`look.ride.${type}`]: sample.reason !== HEAD_OVER_BALL,
        [`coach.${type}`]: finite(ratio),
    };
}

/** The highest ball centre above R (mm) over the canonical roll's impact and flights (shot.test.ts's lowFlight). */
function lift(type: "half-roll" | "full-roll" | "pass-roll"): Record<string, Measured> {
    const world = defaultWorld();
    const setup = canonicalSetup(type, { world });
    const outcome = simulateShot(setup, world);
    let highest = 0;
    const probe: ImpactProbe = {
        step: (s) => {
            for (const ball of s.balls) highest = Math.max(highest, ball.position.z);
        },
    };
    simulateImpact(outcome.contact, setup.balls, world, { probe });
    for (const segments of Object.values(outcome.motion.segments)) {
        for (const { start } of segments ?? []) {
            const vz = start.velocity.z;
            highest = Math.max(highest, start.position.z + (vz > 0 ? (vz * vz) / (2 * world.gravity) : 0));
        }
    }
    return { [`look.lift.${type}`]: (highest - world.ball.radius) * 1e3 };
}

/** Table 4(b)'s free vertical impacts on a fresh bed (turfFit.ts): e and peak depth (mm). */
function turfBed(): Record<string, Measured> {
    const ball = { radius: defaultWorld().ball.radius, mass: defaultWorld().ball.mass };
    const law = {
        modulus: contactReference.bedModulus.value,
        recovery: contactReference.bedRecovery.value,
        friction: frictionReference.ballTurfSliding.value,
        cell: BED_CELL,
    };
    const drop = (speed: number): { e: number; depth: number } => {
        const l = land(
            {
                position: vec3(0.0007, 0.0011, ball.radius),
                velocity: vec3(0, 0, 0 - speed),
                angularVelocity: vec3(0, 0, 0),
            },
            ball,
            STANDARD_GRAVITY,
            law,
        );
        return { e: l.outcome === "left" ? l.state.velocity.z / speed : 0, depth: l.peakDepth * 1e3 };
    };
    const a4 = drop(5);
    return {
        "turf.A4R.e": a4.e,
        "turf.A4R.depth": a4.depth,
        "turf.A2R.depth": drop(1.52 / 0.5).depth,
        "turf.A3R.depth": drop(1.76 / 0.5).depth,
    };
}

/** Table 1's free collisions under today's ball–ball law (squeeze.test.ts). */
function strikeBallBall(): Record<string, Measured> {
    const world = defaultWorld();
    const law = lawFromContactTime(world.ball.mass / 2, world.ballBall.restitution, world.ballBallContactTime, 0);
    const out: Record<string, Measured> = {};
    for (const c of FREE_COLLISIONS) {
        const r = freeCollision(c.speed, law, { dt: 1e-7, start: "arrival" });
        out[`strike.t1.e@${c.speed.toFixed(2)}`] = r.restitution;
        out[`strike.t1.video@${c.speed.toFixed(2)}`] = r.videoTime * 1e3;
    }
    return out;
}

/** Table 2's face contact as the video times it, at each column's U (squeeze.test.ts). */
function strikeFace(): Record<string, Measured> {
    const out: Record<string, Measured> = {};
    for (const c of TABLE2_FACE) {
        out[`strike.t2.${c.name}.video`] = freeFace(c.speed, { dt: 1e-8, start: "arrival" }).videoTime * 1e3;
    }
    return out;
}

/** A CA single-ball drive (croquetFitProbe's singleBallOf): the strike's share and the lawn's share. */
function ca(name: string): Record<string, Measured> {
    const c = CA_STROKES.find((s) => s.name === name) as (typeof CA_STROKES)[number];
    const world = fitWorld(TODAY, openWorld());
    const single = (speed: number) => opened(fitSetup("single-ball", TODAY, speed, world));
    const release = length(runFit(single(c.malletSpeed), TODAY, world).release.velocity);
    const rolled = single(releaseSpeedFor(c.ballSpeed));
    const travel = travelOf(rolled, runFit(rolled, TODAY, world).motion, rolled.striker);
    return { [`ca.${name}.strike`]: release / c.ballSpeed, [`ca.${name}.lawn`]: travel / c.travel };
}

/** The user's yardages like for like (singleBallProbe's userChecks), on the 10 s open lawn. */
function user(): Record<string, Measured> {
    const world = openWorld();
    const out: Record<string, Measured> = {};
    const intensities: Readonly<Record<string, number>> = {
        "user.single.0.45m.i0.4": 0.4,
        "user.single.0.45m.i0.3": 0.3,
    };
    for (const u of USER_CHECKS) {
        const intensity = intensities[u.id] as number;
        const setup = opened(canonicalSetup("single-ball", { world, stroke: { backswing: 0.45, intensity } }));
        try {
            const shot = simulateShot(setup, world);
            const start = (setup.balls.blue as BallState).position;
            out[u.id] = length(horizontal(sub(shot.motion.rest.blue as Vec3, start))) / YARD;
        } catch {
            out[u.id] = null;
        }
    }
    const setup = opened(canonicalSetup("drive", { world, stroke: { backswing: bodyTop("drive"), intensity: 1 } }));
    try {
        const shot = simulateShot(setup, world);
        const red = setup.balls.red as BallState;
        out["user.drive.top.croqueted"] = length(horizontal(sub(shot.motion.rest.red as Vec3, red.position))) / YARD;
    } catch {
        out["user.drive.top.croqueted"] = null;
    }
    return out;
}

/** Every job by name. */
export const JOBS: Readonly<Record<string, Job>> = {
    "strike-ballball": strikeBallBall,
    "strike-face": strikeFace,
    "gugan5-drive": () => ({ "gugan5.drive": finite(gugan5("drive")) }),
    "gugan5-stop": () => ({ "gugan5.stop": finite(gugan5("stop-ac")) }),
    "turf-bed": turfBed,
    user: user,
    ...Object.fromEntries(FILMED_STROKES.map((s) => [`t5-${s.name}`, () => table5(s.name)])),
    ...Object.fromEntries(
        ROLLS.map((r) => [
            `t6-${r.name}`,
            () => {
                const f = rollFigures(r, openWorld(LAWN));
                return {
                    [`t6.${r.name}.w1U`]: f.w1U,
                    [`t6.${r.name}.v2U`]: f.v2U,
                    [`t6.${r.name}.o1`]: finite(f.o1),
                    [`t6.${r.name}.o2`]: finite(f.o2),
                    [`t6.${r.name}.L2L1`]: f.l1 === null || f.l2 === null ? null : f.l2 / f.l1,
                    [`lawn.t6.${r.name}.L1`]: f.l1,
                    [`lawn.t6.${r.name}.L2`]: f.l2,
                    [`play.t6.${r.name}`]: f.clean,
                };
            },
        ]),
    ),
    ...Object.fromEntries(CA_STROKES.map((c) => [`ca-${c.name}`, () => ca(c.name)])),
    ...Object.fromEntries(MAP_TYPES.map((t) => [`canon-${t}`, () => canonical(t)])),
    ...Object.fromEntries((["half-roll", "full-roll", "pass-roll"] as const).map((t) => [`lift-${t}`, () => lift(t)])),
};
