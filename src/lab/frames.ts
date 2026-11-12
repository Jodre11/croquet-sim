/**
 * A play's frames for the side-on viewer (side-on viewer spec §3.1, §3.4; plan Task 4): the map's play at a given hold
 * with a watch recording, as the retired prototype (`scripts/sideOnExport.ts`) did, the head's pose, both hands, the
 * balls, the turf's and the face's force per frame, and the trajectory around them. Not part of the engine.
 */
import { faceKey, headLowestPoint } from "../engine/impact/contacts";
import type { ImpactProbe } from "../engine/impact/integrate";
import { rotate } from "../engine/impact/rigidBody";
import { faceHalfHeight } from "../engine/impact/shape";
import type { HeadState, TrackDrive } from "../engine/impact/types";
import { add, dot, scale, sub, vec3, type Vec3 } from "../engine/math/vec3";
import { strokeTrajectory } from "../engine/swing/trajectory";
import { BALL_IDS, type BallState } from "../engine/types";
import { openWorld } from "./lawn";
import { playJudged, type MapPlan, type MapSample, type MapType, type PlayWatch, type StrokeExtras } from "./play";

const UP = vec3(0, 0, 1);

/** The world the play's impact is on (the map's: the 10 s open lawn). */
const WORLD = openWorld(10);

/** Numerical, not physical: the frames' spacing (s) before, through and after the impact (the prototype's). */
export const SWING_STEP = 4e-3;
export const IMPACT_STEP = 1e-4;
export const FOLLOW_STEP = 2e-3;

/** How long (s) the balls are carried on from the handover: the departure drawn (spec §3.4). */
export const DEPARTURE = 0.25;

/** A point in the aim's vertical plane (m): along aim from the striker's start, and up. */
export interface SidePoint {
    readonly x: number;
    readonly z: number;
}

/** One frame (spec §3.4): times in s from the planned contact, positions in the aim's vertical plane. */
export interface Frame {
    readonly t: number;
    /** The head's centre and its pitch (rad, the head's axis above horizontal). */
    readonly head: SidePoint & { readonly pitch: number };
    /** The top and bottom hands on the shaft. */
    readonly top: SidePoint;
    readonly bottom: SidePoint;
    /** The head's lowest point's height (m), below 0 in the turf. */
    readonly low: number;
    /** The striker's ball, then the croqueted ball where there is one. */
    readonly balls: readonly SidePoint[];
    /** The turf's force on the head and the face's normal force on the striker's ball (N); 0 outside the impact. */
    readonly turf: number;
    readonly face: number;
}

/** A ball's departure from the handover (m/s), along aim, across it (left positive) and up. */
export interface Departure {
    readonly along: number;
    readonly across: number;
    readonly up: number;
}

/** playFrames's result. */
export interface FramedPlay {
    readonly sample: MapSample;
    /** Where planning rejected the set-up: the planner's message, with no frames. */
    readonly rejected: string | null;
    readonly frames: readonly Frame[];
    readonly head: { readonly length: number; readonly halfHeight: number; readonly shaft: number };
    readonly radius: number;
    readonly flags: readonly string[];
    readonly events: readonly { readonly kind: string; readonly t: number }[];
    /** The judge's re-contacts after the parting (s from the planned contact), for the flags (decision 6). */
    readonly recontacts: readonly { readonly start: number; readonly end: number; readonly fault: boolean }[];
    /** When a hand first slipped in the follow-through (s), null where none did. */
    readonly slipAt: number | null;
    readonly release: number;
    readonly impactStart: number;
    readonly impactEnd: number;
    readonly finish: number;
    /** The balls' departures, striker's first. */
    readonly departures: readonly Departure[];
}

/** One recorded impact step. */
interface Step {
    readonly t: number;
    readonly head: HeadState;
    readonly balls: readonly BallState[];
    readonly turf: number;
    readonly face: number;
}

/** What the watch keeps of the run. */
interface Watched {
    readonly steps: readonly Step[];
    readonly slipAt: number | null;
    readonly run: Parameters<PlayWatch["played"]>[0];
    readonly stroke: Parameters<PlayWatch["played"]>[1];
    readonly setup: Parameters<PlayWatch["played"]>[2];
}

/** A watch recording each pass's impact steps every IMPACT_STEP, and the first slip; the last pass's are kept. */
function frameWatch(): { readonly watch: PlayWatch; readonly watched: () => Watched | null } {
    // The face's key is the striker's: every map set-up's striker is blue (canonicalSetup).
    const key = faceKey("blue");
    let steps: Step[] = [];
    let slipAt: number | null = null;
    let kept: Watched | null = null;
    const watch: PlayWatch = {
        probeFor(): ImpactProbe {
            steps = [];
            slipAt = null;
            let next = 0;
            return {
                step(s) {
                    if (s.t >= next) {
                        next = s.t + IMPACT_STEP;
                        const face = s.contacts.find((c) => c.key === key && c.normalForce > 0);
                        const turf =
                            s.headTurf === undefined ? 0 : Math.hypot(s.headTurf.x, s.headTurf.y, s.headTurf.z);
                        steps.push({ t: s.t, head: s.head, balls: s.balls, turf, face: face?.normalForce ?? 0 });
                    }
                },
                follow(s) {
                    if (slipAt === null && (s.offsets.top !== null || s.offsets.bottom !== null)) {
                        slipAt = s.t;
                    }
                },
            };
        },
        played(run, stroke, setup) {
            kept = { steps, slipAt, run, stroke, setup };
        },
    };
    return { watch, watched: () => kept };
}

/**
 * `plan` of `type` at power `power` played once at hold `firmness` as the map plays it (playJudged), with its frames
 * (spec §3.1): the swing every SWING_STEP up to the impact, the impact every IMPACT_STEP, the follow-through every
 * FOLLOW_STEP with the balls carried on ballistically from the handover for DEPARTURE. The sample is
 * playSample(type, plan, power, [lawn], firmness)'s: the impact on the 10 s lawn, the roll read on `lawn` (s).
 * `extras` are mapSetup's (the viewer's inputs beyond the plan).
 */
export function playFrames(
    type: MapType,
    plan: MapPlan,
    power: number,
    firmness: number,
    lawn = 10,
    extras: StrokeExtras = {},
): FramedPlay {
    const { watch, watched } = frameWatch();
    const { sample, strike } = playJudged(type, plan, power, [lawn], firmness, 0, watch, extras);
    const kept = watched();
    const empty = {
        sample,
        frames: [],
        head: { length: 0, halfHeight: 0, shaft: 0 },
        radius: WORLD.ball.radius,
        flags: [],
        events: [],
        recontacts: [],
        slipAt: null,
        release: 0,
        impactStart: 0,
        impactEnd: 0,
        finish: 0,
        departures: [],
    };
    if (kept === null) {
        return { ...empty, rejected: sample.reason ?? "not played" };
    }
    const { run, stroke, setup, steps, slipAt } = kept;
    const contact = stroke.contact;
    const drive = contact.drive as TrackDrive;
    const { aim } = drive.arc;
    const left = vec3(-aim.y, aim.x, 0);
    const start = (setup.balls[setup.striker] as BallState).position;
    const fine = (x: number): number => Math.round(x * 1e4) / 1e4;
    const along = (p: Vec3): number => fine(dot(sub(p, start), aim));
    const ids = BALL_IDS.filter((id) => setup.balls[id] !== undefined);
    const striker = ids.indexOf(setup.striker);
    const other = setup.croqueted === undefined ? -1 : ids.indexOf(setup.croqueted);
    const { head } = contact;

    const pose = (state: HeadState): Omit<Frame, "t" | "balls" | "turf" | "face"> => {
        const axis = rotate(state.orientation, vec3(1, 0, 0));
        const shaft = rotate(state.orientation, UP);
        const socket = add(state.position, rotate(state.orientation, head.socket));
        const top = add(socket, scale(shaft, drive.arc.radius));
        const bottom = add(socket, scale(shaft, drive.hands.bottom));
        return {
            head: { x: along(state.position), z: fine(state.position.z), pitch: Math.atan2(axis.z, dot(axis, aim)) },
            top: { x: along(top), z: fine(top.z) },
            bottom: { x: along(bottom), z: fine(bottom.z) },
            low: headLowestPoint(state, head),
        };
    };
    const ballAt = (b: BallState | undefined): SidePoint[] =>
        b === undefined ? [] : [{ x: along(b.position), z: fine(b.position.z) }];
    const both = (balls: readonly (BallState | undefined)[]): SidePoint[] => [
        ...ballAt(balls[striker]),
        ...(other < 0 ? [] : ballAt(balls[other])),
    ];

    const practised =
        run.lift === null ? contact : { ...contact, drive: { ...drive, arc: { ...drive.arc, lift: run.lift } } };
    const whole = strokeTrajectory(practised, run.follow, WORLD.gravity);
    const at = drive.arc.contactAt;
    const headState = (s: (typeof whole.samples)[number]): HeadState =>
        ({ position: s.head, orientation: s.orientation, velocity: s.velocity }) as HeadState;

    const startBalls = ids.map((id) => setup.balls[id] as BallState);
    const frames: Frame[] = [];
    let last = -Infinity;
    for (const s of whole.samples) {
        if (s.t < whole.impactStart && s.t - last >= SWING_STEP) {
            last = s.t;
            frames.push({ t: s.t, ...pose(headState(s)), balls: both(startBalls), turf: 0, face: 0 });
        }
    }
    for (const s of steps) {
        frames.push({ t: s.t - at, ...pose(s.head), balls: both(s.balls), turf: s.turf, face: s.face });
    }
    const handover = run.result.handover;
    const fly = (b: BallState | undefined, dt: number): SidePoint[] => {
        if (b === undefined) {
            return [];
        }
        const z = Math.max(WORLD.ball.radius, b.position.z + b.velocity.z * dt - (WORLD.gravity * dt * dt) / 2);
        return [{ x: along(add(b.position, scale(b.velocity, dt))), z: fine(z) }];
    };
    const end = whole.impactEnd;
    const hStriker = handover[setup.striker] as BallState;
    const hOther = setup.croqueted === undefined ? undefined : (handover[setup.croqueted] as BallState);
    const flown = (dt: number): SidePoint[] => [...fly(hStriker, dt), ...fly(hOther, dt)];
    const after = whole.samples.filter((s) => s.t > end);
    last = end;
    for (const s of after) {
        if (s.t - last >= FOLLOW_STEP) {
            last = s.t;
            frames.push({ t: s.t, ...pose(headState(s)), balls: flown(s.t - end), turf: 0, face: 0 });
        }
    }
    const final = after[after.length - 1];
    const finish = Math.max(whole.finish, end + DEPARTURE);
    if (final !== undefined) {
        const still = pose(headState(final));
        for (let t = last + FOLLOW_STEP; t < finish; t += FOLLOW_STEP) {
            frames.push({ t, ...still, balls: flown(t - end), turf: 0, face: 0 });
        }
    }
    const departure = (b: BallState): Departure => ({
        along: dot(b.velocity, aim),
        across: dot(b.velocity, left),
        up: b.velocity.z,
    });
    return {
        sample,
        rejected: null,
        frames,
        head: { length: head.length, halfHeight: faceHalfHeight(head.shape), shaft: head.shaft.length },
        radius: WORLD.ball.radius,
        flags: whole.flags,
        events: run.result.events.map((e) => ({ kind: e.kind, t: e.t - at })),
        recontacts: (strike?.recontacts ?? []).map((r) => ({ start: r.start - at, end: r.end - at, fault: r.fault })),
        slipAt: slipAt === null ? null : slipAt - at,
        release: whole.release,
        impactStart: whole.impactStart,
        impactEnd: end,
        finish,
        departures: hOther === undefined ? [departure(hStriker)] : [departure(hStriker), departure(hOther)],
    };
}
