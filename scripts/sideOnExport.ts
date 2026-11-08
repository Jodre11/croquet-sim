/**
 * Prototype for the side-on viewer (plan docs/superpowers/plans/2026-10-29-p2b2b2c3b-push-map.md, Task 10 Step 2's
 * frames, animated): plays chosen plans as the map plays them, at the hold the map finds, and writes each stroke's
 * side-on frames into scripts/sideOnPage.html as a standalone page. Run with
 * `env OUT=<file.html> npx --no-install tsx scripts/sideOnExport.ts`. Not part of the engine.
 */
import { faceKey, headLowestPoint } from "../src/engine/impact/contacts";
import type { ImpactProbe } from "../src/engine/impact/integrate";
import { practiseStroke } from "../src/engine/impact/practice";
import { rotate } from "../src/engine/impact/rigidBody";
import { faceHalfHeight } from "../src/engine/impact/shape";
import type { HeadState, TrackDrive } from "../src/engine/impact/types";
import { add, dot, scale, sub, vec3, type Vec3 } from "../src/engine/math/vec3";
import { planStroke } from "../src/engine/swing/buildContact";
import { strokeTrajectory } from "../src/engine/swing/trajectory";
import { BALL_IDS, type BallState } from "../src/engine/types";
import { openWorld } from "./openLawn";
import { mapSetup, playSample, textBook, type MapHold, type MapPlan, type MapType } from "./pushMapRun";

const DEG = Math.PI / 180;
const UP = vec3(0, 0, 1);
const WORLD = openWorld(10);

/** Numerical, not physical: the frames' spacing (s) before, through and after the impact. */
const SWING_STEP = 4e-3;
const IMPACT_STEP = 1e-4;
const FOLLOW_STEP = 2e-3;

/** How long (s) the balls are carried on from the handover, for the departure the page shows. */
const DEPARTURE = 0.25;

interface Play {
    readonly group: string;
    readonly label: string;
    readonly type: MapType;
    readonly over: Partial<MapPlan>;
    readonly power: number;
    /** The hold the map plays it at: the least that plays (found, the default) or the type's own (preset). */
    readonly hold?: MapHold;
}

/** The pass roll's plan the map found reaching a stop's ratio at a loose hold (10 s lawn, 0.25 m, ratio 8.97). */
const LOOSE_ROLL: Partial<MapPlan> = {
    lean: 32 * DEG,
    feet: 0.38087801284977446,
    drive: 0.5,
    handReach: 0.1,
    window: 0.02,
    split: 0,
};

const PLAYS: readonly Play[] = [
    {
        group: "Pass roll: loose grip",
        label: "Loosest grip that plays",
        type: "pass-roll",
        over: LOOSE_ROLL,
        power: 0.651,
    },
    {
        group: "Pass roll: loose grip",
        label: "Its usual grip",
        type: "pass-roll",
        over: LOOSE_ROLL,
        power: 0.651,
        hold: "preset",
    },
    {
        group: "Pass roll: loose grip",
        label: "Text book, usual grip",
        type: "pass-roll",
        over: {},
        power: 0.651,
        hold: "preset",
    },
    ...[0, -3, -6, -7.5, -12].map((lean): Play => ({
        group: "AC stop: back lean",
        label: `Lean ${lean === 0 ? "0" : `−${-lean}`}°`,
        type: "stop-ac",
        over: { lean: lean * DEG, drive: 0 },
        power: 1.25,
    })),
    {
        group: "AC stop: follow-through",
        label: "Natural",
        type: "stop-ac",
        over: { lean: -6 * DEG, drive: 0 },
        power: 1.25,
    },
    {
        group: "AC stop: follow-through",
        label: "Braked",
        type: "stop-ac",
        over: { lean: -6 * DEG, drive: -1 },
        power: 1.25,
    },
    {
        group: "AC stop: follow-through",
        label: "Half push",
        type: "stop-ac",
        over: { lean: -6 * DEG, drive: 0.5 },
        power: 1.25,
    },
    { group: "Half roll: more power", label: "p 1.0", type: "half-roll", over: {}, power: 1 },
    { group: "Half roll: more power", label: "p 1.05", type: "half-roll", over: {}, power: 1.05 },
    { group: "Half roll: more power", label: "p 1.1", type: "half-roll", over: {}, power: 1.1 },
    { group: "Half roll: more power", label: "p 1.25", type: "half-roll", over: {}, power: 1.25 },
    ...[1, 1.05, 1.25].flatMap((power) =>
        [
            { finish: "natural", drive: 0 },
            { finish: "braked", drive: -1 },
        ].map(({ finish, drive }): Play => ({
            group: "Half roll: less follow-through",
            label: `p ${power}, ${finish}`,
            type: "half-roll",
            over: { drive },
            power,
        })),
    ),
    { group: "Drive: soft and firm", label: "p 0.2", type: "drive", over: {}, power: 0.2 },
    { group: "Drive: soft and firm", label: "p 0.5", type: "drive", over: {}, power: 0.5 },
    { group: "Drive: soft and firm", label: "p 1.25", type: "drive", over: {}, power: 1.25 },
];

/** Rounds to 0.1 mm or 0.1 ms: the frames need no more for a drawing. */
function fine(x: number): number {
    return Math.round(x * 1e4) / 1e4;
}

function exportPlay(play: Play): unknown {
    const plan: MapPlan = { ...textBook(play.type), ...play.over };
    const sample = playSample(play.type, plan, play.power, [6, 10, 14], play.hold ?? "found");
    const read = sample.byLawn[10];
    const meta = {
        group: play.group,
        label: play.label,
        type: play.type,
        lean: plan.lean / DEG,
        feet: plan.feet,
        drive: plan.drive,
        handReach: plan.handReach,
        windowMs: plan.window * 1000,
        power: play.power,
        klass: sample.klass,
        reason: sample.reason,
        followSlip: sample.followSlip,
        firmness: sample.firmness,
        sigma: sample.sigma,
        passes: sample.passes,
        strokeEffort: sample.strokeEffort,
        range: read?.range ?? null,
        ratio: read?.ratio ?? null,
    };
    const base = mapSetup(play.type, plan, play.power);
    const setup = { ...base, stroke: { ...base.stroke, holdFirmness: sample.firmness ?? 1 } };
    let stroke;
    try {
        stroke = planStroke(setup, WORLD);
    } catch (error) {
        if (error instanceof RangeError) {
            return { meta, rejected: error.message, frames: [], events: [] };
        }
        throw error;
    }
    const contact = stroke.contact;
    const drive = contact.drive as TrackDrive;
    const { aim } = drive.arc;
    const start = (setup.balls[setup.striker] as BallState).position;
    const along = (p: Vec3): number => fine(dot(sub(p, start), aim));
    const ids = BALL_IDS.filter((id) => setup.balls[id] !== undefined);
    const striker = ids.indexOf(setup.striker);
    const other = setup.croqueted === undefined ? -1 : ids.indexOf(setup.croqueted);
    const { head } = contact;
    const halfHeight = faceHalfHeight(head.shape);

    const pose = (state: HeadState): readonly number[] => {
        const axis = rotate(state.orientation, vec3(1, 0, 0));
        const shaft = rotate(state.orientation, UP);
        const socket = add(state.position, rotate(state.orientation, head.socket));
        const top = add(socket, scale(shaft, drive.arc.radius));
        const bottom = add(socket, scale(shaft, drive.hands.bottom));
        return [
            along(state.position),
            fine(state.position.z),
            fine(Math.atan2(axis.z, dot(axis, aim))),
            along(top),
            fine(top.z),
            along(bottom),
            fine(bottom.z),
            fine(headLowestPoint(state, head)),
        ];
    };

    interface Step {
        readonly t: number;
        readonly head: HeadState;
        readonly balls: readonly BallState[];
        readonly turf: number;
        readonly face: number;
    }
    let steps: Step[] = [];
    let slipAt: number | null = null;
    const probeFor = (): ImpactProbe => {
        steps = [];
        slipAt = null;
        let next = 0;
        return {
            step(s) {
                if (s.t >= next) {
                    next = s.t + IMPACT_STEP;
                    const face = s.contacts.find((c) => c.key === faceKey(setup.striker) && c.normalForce > 0);
                    const turf = s.headTurf === undefined ? 0 : Math.hypot(s.headTurf.x, s.headTurf.y, s.headTurf.z);
                    steps.push({ t: s.t, head: s.head, balls: s.balls, turf, face: face?.normalForce ?? 0 });
                }
            },
            follow(s) {
                if (slipAt === null && (s.offsets.top !== null || s.offsets.bottom !== null)) {
                    slipAt = s.t;
                }
            },
        };
    };
    const run = practiseStroke(contact, setup.balls, WORLD, setup.striker, probeFor);
    const practised =
        run.lift === null ? contact : { ...contact, drive: { ...drive, arc: { ...drive.arc, lift: run.lift } } };
    const whole = strokeTrajectory(practised, run.follow, WORLD.gravity);
    const at = drive.arc.contactAt;

    const ballAt = (b: BallState | undefined): readonly number[] =>
        b === undefined ? [] : [along(b.position), fine(b.position.z)];
    const startBalls = ids.map((id) => setup.balls[id] as BallState);
    const frames: (readonly number[])[] = [];
    let last = -Infinity;
    for (const s of whole.samples) {
        if (s.t < whole.impactStart && s.t - last >= SWING_STEP) {
            last = s.t;
            const state: HeadState = {
                position: s.head,
                orientation: s.orientation,
                velocity: s.velocity,
            } as HeadState;
            frames.push([
                fine(s.t),
                ...pose(state),
                ...ballAt(startBalls[striker]),
                ...ballAt(startBalls[other]),
                0,
                0,
            ]);
        }
    }
    for (const s of steps) {
        frames.push([
            Math.round((s.t - at) * 1e6) / 1e6,
            ...pose(s.head),
            ...ballAt(s.balls[striker]),
            ...ballAt(s.balls[other]),
            Math.round(s.turf),
            Math.round(s.face),
        ]);
    }
    const handover = run.result.handover;
    const fly = (b: BallState | undefined, dt: number): readonly number[] => {
        if (b === undefined) {
            return [];
        }
        const radius = WORLD.ball.radius;
        const z = Math.max(radius, b.position.z + b.velocity.z * dt - (WORLD.gravity * dt * dt) / 2);
        return [along(add(b.position, scale(b.velocity, dt))), fine(z)];
    };
    const end = whole.impactEnd;
    const after = whole.samples.filter((s) => s.t > end);
    last = end;
    const finish = Math.max(whole.finish, end + DEPARTURE);
    const hStriker = handover[setup.striker] as BallState;
    const hOther = setup.croqueted === undefined ? undefined : (handover[setup.croqueted] as BallState);
    for (const s of after) {
        if (s.t - last >= FOLLOW_STEP) {
            last = s.t;
            const state: HeadState = {
                position: s.head,
                orientation: s.orientation,
                velocity: s.velocity,
            } as HeadState;
            frames.push([fine(s.t), ...pose(state), ...fly(hStriker, s.t - end), ...fly(hOther, s.t - end), 0, 0]);
        }
    }
    const final = after[after.length - 1];
    if (final !== undefined) {
        const state: HeadState = {
            position: final.head,
            orientation: final.orientation,
            velocity: final.velocity,
        } as HeadState;
        for (let t = last + FOLLOW_STEP; t < finish; t += FOLLOW_STEP) {
            frames.push([fine(t), ...pose(state), ...fly(hStriker, t - end), ...fly(hOther, t - end), 0, 0]);
        }
    }
    return {
        meta,
        head: { length: head.length, halfHeight, shaft: head.shaft.length },
        radius: WORLD.ball.radius,
        flags: whole.flags,
        slipAt: slipAt === null ? null : fine((slipAt as number) - at),
        impactEnd: fine(end),
        release: fine(whole.release),
        finish: fine(whole.finish),
        events: run.result.events.map((e) => ({ kind: e.kind, t: fine(e.t - at) })),
        croquetedStart: other < 0 ? null : ballAt(startBalls[other]),
        frames,
    };
}

declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

async function main(): Promise<void> {
    const out = process.env.OUT;
    if (out === undefined) {
        throw new Error("OUT names the HTML file to write");
    }
    // By a variable, as scripts/pushMap.ts does: the project's types have no node modules.
    const specifier = "node:fs";
    const fs = (await import(specifier)) as {
        readFileSync(path: string, encoding: "utf8"): string;
        writeFileSync(path: string, data: string): void;
    };
    const plays = PLAYS.map((play) => {
        const data = exportPlay(play) as { meta: Record<string, unknown>; frames: unknown[]; rejected?: string };
        console.log(
            `${play.group} / ${play.label}: ${JSON.stringify(data.meta)}; frames ${data.frames.length}` +
                (data.rejected === undefined ? "" : `; rejected: ${data.rejected}`),
        );
        return data;
    });
    const page = fs.readFileSync("scripts/sideOnPage.html", "utf8");
    fs.writeFileSync(
        out,
        page.replace("/*PLAYS*/ []", () => JSON.stringify(plays)),
    );
}

await main();
