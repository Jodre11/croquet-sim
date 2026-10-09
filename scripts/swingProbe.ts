/**
 * Swing probe (P2b.2b.1 design §9: pre-flight measurements, recorded in the roadmap, not gated). On the default world
 * with the default profile's canonical setups (design §5.5, tests/engine/support/shot.ts), reports:
 * - ratios: the croqueted ÷ striker distance on each croquet stroke's canonical setup against its coaching range, and
 *   over 2–4 m/s; and the drive at guideEffort 0 and 1 over 2–4 m/s: its ratio, hits and length;
 * - gc: the GC stop, a single-ball stroke (design §5.4): after the striker's first touch on the target, how far the
 *   striker's ball and the target travel and their ratio, on its canonical setup over 2–4 m/s; then the gap from 0.05
 *   to 1 m for the stop-gc and single-ball presets alike, with the late re-hit's crossing at each;
 * - canonical: per canonical setup, the entry jumps, the highest ball centre above R, the head regions touched, the
 *   bottom hand's release, the hands' and the turf's braking impulses (design §3.7), the impact's length after
 *   contactAt and how often each impact flag fired; then the stance in the player's terms (P2b.2b.2b.1);
 * - presets: each preset over speed × drive × contact: how often impact-head-deep, impact-cap,
 *   impact-head-approaching and impact-off-face fire, the longest impact after contactAt that ended before the cap,
 *   and the rejected runs tallied by speed, contact height and message;
 * - dip: the AC stop's dip depth from 8 to 14 mm: the head–turf penetration against HEAD_DEEP_LIMIT, and whether the
 *   first head–turf interval starts after the first face–striker interval ends;
 * - coupling: the canonical set at T = 0.04 s against HAND_COUPLING's period (0.08 s), both at its ζ, with the hands'
 *   impulse in the strike against every ball's momentum change and the path lag at the hands' window's end;
 * - mass: the swung body's effective mass at the face centre along aim (design §3.4) against the strike's measure;
 * - tracking: the head's largest distance from the path with no ball and no turf, per phase: firm before contact,
 *   carry up to the reach's end, inside a check, and swing mode after contact outside a check (the residual);
 * - cost: the tracked canonical impacts against P2b.2a's force-table strokes: simulateImpact's whole time, its fixed
 *   preparation (prepareTrack) and its integration's µs/step (the rest over its steps); and the WAKE_MARGIN reach
 *   filter's headroom over the longest impact (MAX_LEAD plus TRACK_IMPACT_CAP);
 * - timings: for the AC stop and the full roll, each action from 50 ms early to 20 ms late, and the AC stop's dip from
 *   none to twice its depth: lawn or ball first, the dig, the slide, the striker's ball's launch, and after phase 2
 *   both balls' distances and the coaching ratio;
 * - rehit: the late re-hit (design §3.5, §9), a measurement only: the real head at the impact's end, moved on by the
 *   planned path's displacement and rotation out to FREE_SPAN, against every ball's phase-2 trajectory and, head and
 *   shaft, against the hoops' uprights and crowns and the peg; per preset, the canonical setup's first crossings, how
 *   many runs of the preset sweep cross a ball or an obstacle and how many overlap one at the impact's end, and each
 *   such run; then a single-ball stroke through a hoop, centred and with the face 10 mm off the ball's centre.
 * Run with `npx --yes tsx scripts/swingProbe.ts`; environment: SECTION (one of the names above; default all), REPEAT
 * (timed runs per stroke, default 50). Not part of the test suite; its output goes into the roadmap's outcomes.
 */
import {
    HEAD_DEEP_LIMIT,
    IMPACT_DT,
    TRACK_IMPACT_CAP,
    integrate,
    type ImpactSnapshot,
} from "../src/engine/impact/integrate";
import { ballPairKey, headBallContact } from "../src/engine/impact/contacts";
import { multiply, rotate, solidCylinderInertia, type Quaternion } from "../src/engine/impact/rigidBody";
import { prepareImpact, simulateImpact } from "../src/engine/impact/simulateImpact";
import {
    FREE_SPAN,
    HAND_COUPLING,
    effectiveMass,
    headOnPath,
    inCheck,
    pathAt,
    prepareTrack,
    swungBody,
    type PreparedTrack,
} from "../src/engine/impact/track";
import type {
    ContactState,
    Coupling,
    FaceMaterial,
    HeadState,
    ImpactResult,
    MalletHead,
    TrackDrive,
} from "../src/engine/impact/types";
import { ZERO, add, cross, dot, horizontal, length, scale, sub, vec3, type Vec3 } from "../src/engine/math/vec3";
import { stateAtTime } from "../src/engine/sample";
import { simulateFreeMotion } from "../src/engine/simulate";
import { MAX_LEAD, buildContact, contactPose, swingApproach } from "../src/engine/swing/buildContact";
import { ON_TIME, defaultProfile } from "../src/engine/swing/profile";
import { CROQUET_STROKES, STROKE_TYPES, type ShotSetup, type StrokeType } from "../src/engine/swing/types";
import { BALL_IDS, type BallId, type BallState, type BallStates, type ShotResult } from "../src/engine/types";
import { defaultWorld, uprightsOf } from "../src/engine/world";
import { malletReference } from "../src/reference/index";
import { drive, recorder, socketAt, strike } from "../tests/engine/support/impact";
import { GC_STOP_GAP, backswingFor, canonicalSetup } from "../tests/engine/support/shot";

// The project has no Node types; this script runs under tsx and reads only its environment.
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

const SECTION = process.env.SECTION ?? "all";
const REPEAT = Number(process.env.REPEAT ?? "50");
const WORLD = defaultWorld();
const R = WORLD.ball.radius;
const fmt = (x: number, digits = 4): string => x.toFixed(digits);
const ms = (t: number): string => fmt(t * 1e3, 1);
const mm = (x: number): string => fmt(x * 1e3, 2);

/** integrate.ts's WAKE_MARGIN (not exported): the slack (m) the reach filter takes off a ball–obstacle gap. */
const WAKE_MARGIN = 1e-9;

/** The coaching ranges of design §9 (croqueted ÷ striker distance); none for the single-ball strokes. */
const COACHING: Readonly<Record<StrokeType, string>> = {
    "single-ball": "none",
    drive: "3–4",
    "stop-ac": "6–10",
    "stop-gc": "none",
    "half-roll": "about 2",
    "full-roll": "about 1",
    "pass-roll": "below 1",
};

/** The impact flags design §9 counts, and the turf bed's pit flag (P2b.2b.2b.2a design §4.6, §6). */
const FLAGS = [
    "impact-head-deep",
    "impact-cap",
    "impact-head-approaching",
    "impact-off-face",
    "impact-turf-pit",
] as const;

/** One shot: its contact state, its impact with every snapshot, and phase 2. */
interface Run {
    readonly setup: ShotSetup;
    readonly contact: ContactState;
    readonly impact: ImpactResult;
    readonly steps: readonly ImpactSnapshot[];
    readonly motion: ShotResult;
}

/** The tracked drive of a contact state built by `buildContact`. */
const trackOf = (contact: ContactState): TrackDrive => contact.drive as TrackDrive;

/** `setup` simulated, with its coupling's fields replaced by `coupling` where given. */
function run(setup: ShotSetup, coupling: Partial<Coupling> = {}): Run {
    const built = buildContact(setup, WORLD);
    const track = trackOf(built);
    const contact = { ...built, drive: { ...track, coupling: { ...track.coupling, ...coupling } } };
    const probe = recorder();
    const impact = simulateImpact(contact, setup.balls, WORLD, { probe });
    return { setup, contact, impact, steps: probe.snapshots, motion: simulateFreeMotion(impact.handover, WORLD) };
}

/** `setup` simulated without recording the impact's snapshots (`steps` empty), for the sweeps. */
function quick(setup: ShotSetup): Run {
    const contact = buildContact(setup, WORLD);
    const impact = simulateImpact(contact, setup.balls, WORLD);
    return { setup, contact, impact, steps: [], motion: simulateFreeMotion(impact.handover, WORLD) };
}

/** `type`'s canonical setup with `stroke` fields replaced; a `speed` (m/s) sets the backswing that plans it. */
function canonical(
    type: StrokeType,
    stroke: Partial<ShotSetup["stroke"]> & { readonly speed?: number } = {},
): ShotSetup {
    const { speed, ...rest } = stroke;
    const base = canonicalSetup(type);
    const setup = { ...base, stroke: { ...base.stroke, ...rest } };
    if (speed === undefined) {
        return setup;
    }
    return { ...setup, stroke: { ...setup.stroke, backswing: backswingFor(setup, speed, WORLD) } };
}

/** `f()`, or the RangeError it throws (a speed beyond the preset's reach), so that a sweep records it and goes on. */
function attempt<T>(f: () => T): T | RangeError {
    try {
        return f();
    } catch (error) {
        if (error instanceof RangeError) {
            return error;
        }
        throw error;
    }
}

/** The ids of `balls` in BALL_IDS order: the order of the impact's snapshots. */
const idsOf = (balls: BallStates): BallId[] => BALL_IDS.filter((id) => balls[id] !== undefined);

/** How far ball `id` travels from its start to rest after phase 2 (m). */
const travelled = (r: Run, id: BallId): number =>
    length(sub(r.motion.rest[id] as Vec3, (r.setup.balls[id] as BallState).position));

/** Croqueted ÷ striker distance from the start to rest after phase 2; NaN for a single-ball stroke. */
function ratio(r: Run): number {
    const croqueted = r.setup.croqueted;
    if (croqueted === undefined) {
        return NaN;
    }
    return travelled(r, croqueted) / travelled(r, r.setup.striker);
}

/** A preset's stance in the player's terms (P2b.2b.2b.1 design §6): the top hand, the lean, the point of impact. */
function stanceText(setup: ShotSetup): string {
    const lean = 0 - contactPose(setup, WORLD).thetaContact;
    const hands = setup.profile.stance[setup.stroke.type].handsAhead;
    return (
        `stance: the top hand ${fmt(hands)} m ahead of the ball's centre, lean ${fmt((lean * 180) / Math.PI, 2)}°, ` +
        `impact ${mm(R * Math.sin(lean))} mm above the centre`
    );
}

/**
 * A single-ball stroke's outcome against its target (design §5.4, §9): from the striker's first touch on `target` to
 * rest, how far the striker's ball travels, how far the target travels from its start, and their ratio (target over
 * striker). The touch is the first striker–target interval of the impact (the state at its start, from the recorded
 * steps), else phase 2's first ball–ball event between them. Null if the striker never touches the target.
 */
function afterTouch(
    r: Run,
    target: BallId = "red",
): { readonly inImpact: boolean; readonly t: number; readonly striker: number; readonly target: number } | null {
    const { striker } = r.setup;
    if (r.setup.balls[target] === undefined) {
        return null;
    }
    const rest = (id: BallId): Vec3 => r.motion.rest[id] as Vec3;
    const start = (id: BallId): Vec3 => (r.setup.balls[id] as BallState).position;
    const along = (from: Vec3, to: Vec3): number => length(horizontal(sub(to, from)));
    const interval = r.impact.timeline[ballPairKey(striker, target)]?.[0];
    let at: Vec3;
    let t: number;
    if (interval !== undefined) {
        // Snapshot i holds the state at the end of step i, t = (i + 1)·IMPACT_DT; a touch from t = 0 is the start's.
        const index = Math.round(interval.start / IMPACT_DT) - 1;
        const s = r.steps[index];
        at = s === undefined ? start(striker) : (s.balls[idsOf(r.setup.balls).indexOf(striker)] as BallState).position;
        t = interval.start;
    } else {
        const touch = r.motion.events.find(
            (e) => e.kind === "ball-ball" && e.balls.includes(striker) && e.balls.includes(target),
        );
        if (touch === undefined) {
            return null;
        }
        at = stateAtTime(r.motion, striker, touch.t).position;
        t = r.impact.duration + touch.t;
    }
    return {
        inImpact: interval !== undefined,
        t: t - trackOf(r.contact).arc.contactAt,
        striker: along(at, rest(striker)),
        target: along(start(target), rest(target)),
    };
}

/** `afterTouch` on red as text: where and when the touch came, both distances and their ratio. */
function touchText(r: Run): string {
    if (r.setup.balls.red === undefined) {
        return "no target";
    }
    const a = afterTouch(r);
    if (a === null) {
        return "no touch";
    }
    return (
        `touch ${a.inImpact ? "in the impact" : "in phase 2"} ${ms(a.t)} ms after contactAt; after it the striker ` +
        `${fmt(a.striker, 3)} m, the target ${fmt(a.target, 3)} m, ratio ${fmt(a.target / a.striker, 2)}`
    );
}

/** The follow-through sweep's sample interval (s): a ball at 4 m/s moves 0.4 mm between samples. */
const SWEEP_STEP = 1e-4;

/** The conjugate of unit quaternion `q`: its inverse rotation. */
const conjugate = (q: Quaternion): Quaternion => ({ w: q.w, x: -q.x, y: -q.y, z: -q.z });

/** How deep the head at `state` overlaps a sphere of `radius` centred at `centre` (m); 0 if apart. */
function overlap(state: HeadState, head: MalletHead, centre: Vec3, radius = R): number {
    try {
        return headBallContact(state, head, centre, radius)?.depth ?? 0;
    } catch (error) {
        // A centre on the head's axis, inside the barrel: deep in the head.
        if (!(error instanceof RangeError)) {
            throw error;
        }
        return radius;
    }
}

/** A fixed obstacle the mallet can meet: a rod of `radius` along its axis from `a` to `b`. */
interface Rod {
    readonly id: string;
    readonly a: Vec3;
    readonly b: Vec3;
    readonly radius: number;
}

/**
 * The height (m) up to which the peg is swept: the world's peg is a vertical cylinder with no top, and the mallet's
 * swing stays well below 1 m.
 */
const PEG_TOP = 1;

/**
 * The world's hoops and peg as rods: each upright from the lawn to the crown's axis, the crown (taken to have the
 * uprights' diameter, as reference/court.json does) between the uprights' axes at crownClearance plus its radius, and
 * the peg up to PEG_TOP.
 */
const RODS: readonly Rod[] = [
    ...WORLD.hoops.flatMap((hoop) => {
        const top = hoop.crownClearance + hoop.uprightRadius;
        const [a, b] = uprightsOf(hoop, WORLD.ballUpright).map((u) => vec3(u.centre.x, u.centre.y, 0)) as [Vec3, Vec3];
        const up = vec3(0, 0, top);
        return [
            { id: `${hoop.id}/a`, a, b: add(a, up), radius: hoop.uprightRadius },
            { id: `${hoop.id}/b`, a: b, b: add(b, up), radius: hoop.uprightRadius },
            { id: `${hoop.id}/crown`, a: add(a, up), b: add(b, up), radius: hoop.uprightRadius },
        ];
    }),
    {
        id: "peg",
        a: vec3(WORLD.peg.centre.x, WORLD.peg.centre.y, 0),
        b: vec3(WORLD.peg.centre.x, WORLD.peg.centre.y, PEG_TOP),
        radius: WORLD.peg.radius,
    },
];

/** The spacing (m) of the spheres that stand in for a rod against the head's cylinder. */
const ROD_STEP = 0.002;

/** The closest point to `p` on the segment from `a` to `b`. */
function closestOnSegment(p: Vec3, a: Vec3, b: Vec3): Vec3 {
    const ab = sub(b, a);
    const s = Math.min(1, Math.max(0, dot(sub(p, a), ab) / dot(ab, ab)));
    return add(a, scale(ab, s));
}

/** The closest distance between the segments p1–q1 and p2–q2 (Ericson, Real-Time Collision Detection, §5.1.9). */
function segmentDistance(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): number {
    const d1 = sub(q1, p1);
    const d2 = sub(q2, p2);
    const r = sub(p1, p2);
    const a = dot(d1, d1);
    const e = dot(d2, d2);
    const f = dot(d2, r);
    const c = dot(d1, r);
    const b = dot(d1, d2);
    const denom = a * e - b * b;
    let s = denom > 0 ? Math.min(1, Math.max(0, (b * f - c * e) / denom)) : 0;
    let t = (b * s + f) / e;
    if (t < 0) {
        t = 0;
        s = Math.min(1, Math.max(0, -c / a));
    } else if (t > 1) {
        t = 1;
        s = Math.min(1, Math.max(0, (b - c) / a));
    }
    return length(sub(add(p1, scale(d1, s)), add(p2, scale(d2, t))));
}

/**
 * How deep the head at `state` overlaps `rod` (m); 0 if apart: the deepest of spheres of the rod's radius every
 * ROD_STEP along its axis, each against the head's cylinder (`headBallContact`).
 */
function rodOverlap(state: HeadState, head: MalletHead, rod: Rod): number {
    const reach = Math.hypot(head.length / 2, head.radius) + rod.radius;
    if (length(sub(closestOnSegment(state.position, rod.a, rod.b), state.position)) >= reach) {
        return 0;
    }
    const n = Math.ceil(length(sub(rod.b, rod.a)) / ROD_STEP);
    let deepest = 0;
    for (let k = 0; k <= n; k++) {
        const centre = add(rod.a, scale(sub(rod.b, rod.a), k / n));
        deepest = Math.max(deepest, overlap(state, head, centre, rod.radius));
    }
    return deepest;
}

/**
 * How far the shaft's axis, from the socket to the top hand (`radius` along the head's up axis), lies inside `rod`
 * (m); 0 if apart. The reference data gives the shaft no diameter, so its axis is taken against the rod's radius.
 */
function shaftOverlap(state: HeadState, head: MalletHead, radius: number, rod: Rod): number {
    const socket = add(state.position, rotate(state.orientation, head.socket));
    const top = add(socket, scale(rotate(state.orientation, vec3(0, 0, 1)), radius));
    return Math.max(0, rod.radius - segmentDistance(socket, top, rod.a, rod.b));
}

/** One crossing: when (after contactAt), what met what, and how deep at the first overlapping sample. */
interface Meeting {
    readonly t: number;
    readonly what: string;
    readonly depth: number;
}

/**
 * The late re-hit's measure of one run: the balls and obstacles the mallet overlaps at the impact's end; the first
 * ball crossing, with the head's and the ball's speeds; and the first obstacle crossing.
 */
interface Crossing {
    readonly atEnd: readonly string[];
    readonly first: (Meeting & { readonly headSpeed: number; readonly ballSpeed: number }) | null;
    readonly obstacle: Meeting | null;
}

/**
 * The late re-hit (design §3.5, §9), a measurement only: the real head at the impact's end, moved from there by the
 * planned path's displacement and rotation since then (the rigid motion taking `headOnPath` at the end to
 * `headOnPath` at t), swept out to FREE_SPAN against every ball's phase-2 trajectory and, with the shaft rigid on it,
 * against the hoops' uprights and crowns and the peg (RODS). The planned path is the unstruck one, whose velocity the
 * end rule's look-ahead gives the real head. Reports what the head or the shaft already overlaps at the impact's end,
 * the first ball crossing (the first sample at which the head overlaps a ball it did not overlap at the sample
 * before: its time after contactAt, the ball, the depth, and the head's and the ball's speeds) and the first obstacle
 * crossing likewise (the head or the shaft entering a rod).
 */
function crossing(r: Run): Crossing {
    const tracked = trackOf(r.contact);
    const track = prepareTrack(tracked, r.contact.head, WORLD.gravity);
    const mallet = r.contact.head;
    const ids = idsOf(r.setup.balls);
    const end = r.impact.duration;
    const real = r.impact.head;
    const planned = headOnPath(track, mallet, end);
    const offset = sub(real.position, planned.position);
    const unplanned = conjugate(planned.orientation);
    // Each sample's overlaps, keyed "ball", "head rod" or "shaft rod", and their depths.
    const touching = (head: HeadState, t: number): Map<string, number> => {
        const found = new Map<string, number>();
        for (const id of ids) {
            const depth = overlap(head, mallet, stateAtTime(r.motion, id, t - end).position);
            if (depth > 0) {
                found.set(id, depth);
            }
        }
        for (const rod of RODS) {
            const inHead = rodOverlap(head, mallet, rod);
            if (inHead > 0) {
                found.set(`head ${rod.id}`, inHead);
            }
            const inShaft = shaftOverlap(head, mallet, tracked.arc.radius, rod);
            if (inShaft > 0) {
                found.set(`shaft ${rod.id}`, inShaft);
            }
        }
        return found;
    };
    let inside = touching(real, end);
    const atEnd = [...inside.keys()];
    let first: Crossing["first"] = null;
    let obstacle: Meeting | null = null;
    const samples = Math.floor((FREE_SPAN - end) / SWEEP_STEP);
    for (let i = 1; i <= samples && (first === null || obstacle === null); i++) {
        const t = end + i * SWEEP_STEP;
        const path = headOnPath(track, mallet, t);
        const turn = multiply(path.orientation, unplanned);
        const arm = rotate(turn, offset);
        const head: HeadState = {
            position: add(path.position, arm),
            orientation: multiply(turn, real.orientation),
            velocity: add(path.velocity, cross(path.angularVelocity, arm)),
            angularVelocity: path.angularVelocity,
        };
        const now = touching(head, t);
        for (const [what, depth] of now) {
            if (inside.has(what)) {
                continue;
            }
            const after = t - tracked.arc.contactAt;
            if (what.includes(" ")) {
                obstacle ??= { t: after, what, depth };
            } else if (first === null) {
                const ball = stateAtTime(r.motion, what as BallId, t - end);
                first = {
                    t: after,
                    what,
                    depth,
                    headSpeed: length(head.velocity),
                    ballSpeed: length(ball.velocity),
                };
            }
        }
        inside = now;
    }
    return { atEnd, first, obstacle };
}

/** `crossing` as text. */
function crossingText(r: Run, c: Crossing = crossing(r)): string {
    const { atEnd, first, obstacle } = c;
    const end = atEnd.length > 0 ? `overlaps ${atEnd.join(", ")} at the impact's end; ` : "";
    const balls =
        first === null
            ? "no crossing"
            : `crosses ${first.what} ${ms(first.t)} ms after contactAt, ${fmt(first.depth * 1e3, 3)} mm deep, ` +
              `head ${fmt(first.headSpeed, 3)} m/s, ball ${fmt(first.ballSpeed, 3)} m/s`;
    const rods =
        obstacle === null
            ? "no obstacle"
            : `${obstacle.what} ${ms(obstacle.t)} ms after contactAt, ${fmt(obstacle.depth * 1e3, 3)} mm deep`;
    return `${end}${balls}; ${rods}`;
}

/** The impact's events of each kind in FLAGS, counted. */
function flagCounts(impact: ImpactResult): string {
    return FLAGS.map((kind) => `${kind} ${impact.events.filter((e) => e.kind === kind).length}`).join(", ");
}

/** The first face–striker interval's steps: the index of its first and last snapshot, or null if never struck. */
function firstStrike(r: Run): { readonly first: number; readonly last: number } | null {
    const key = `face/${r.setup.striker}`;
    const inFace = (s: ImpactSnapshot): boolean => s.contacts.some((c) => c.key === key);
    const first = r.steps.findIndex(inFace);
    if (first < 0) {
        return null;
    }
    let last = first;
    while (last + 1 < r.steps.length && inFace(r.steps[last + 1] as ImpactSnapshot)) {
        last++;
    }
    return { first, last };
}

/** The head and ball velocities just before snapshot `index`: the previous snapshot's, or the start's. */
function before(r: Run, index: number): { readonly head: HeadState; readonly balls: readonly Vec3[] } {
    if (index > 0) {
        const s = r.steps[index - 1] as ImpactSnapshot;
        return { head: s.head, balls: s.balls.map((b) => b.velocity) };
    }
    return { head: r.contact, balls: idsOf(r.setup.balls).map((id) => (r.setup.balls[id] as BallState).velocity) };
}

/** The highest ball centre above R (m): over the impact's steps and each phase-2 segment's analytic apex. */
function highest(r: Run): number {
    let top = -Infinity;
    for (const s of r.steps) {
        for (const b of s.balls) {
            top = Math.max(top, b.position.z);
        }
    }
    for (const segments of Object.values(r.motion.segments)) {
        for (const segment of segments ?? []) {
            const { position, velocity } = segment.start;
            const rise = velocity.z > 0 ? (velocity.z * velocity.z) / (2 * WORLD.gravity) : 0;
            top = Math.max(top, position.z + rise);
        }
    }
    return top - R;
}

/**
 * The hands' and the turf's braking impulses (design §3.7, N·s): from the end of the first face–striker interval to
 * the end of the impact, along aim, positive when they slow the head. NaN when the striker was never struck.
 */
function braking(r: Run): { readonly hands: number; readonly turf: number } {
    const interval = r.impact.timeline[`face/${r.setup.striker}`]?.[0];
    if (interval === undefined) {
        return { hands: NaN, turf: NaN };
    }
    const aim = trackOf(r.contact).arc.aim;
    let hands = 0;
    let turf = 0;
    for (const s of r.steps) {
        if (s.t > interval.end) {
            hands -= dot(s.hand?.force ?? ZERO, aim) * IMPACT_DT;
            turf -= dot(s.headTurf ?? ZERO, aim) * IMPACT_DT;
        }
    }
    return { hands, turf };
}

function ratios(): void {
    console.log(
        "== Coaching ratios (design §9): croqueted ÷ striker distance, the croquet strokes' canonical setups and " +
            "2–4 m/s ==",
    );
    for (const type of CROQUET_STROKES) {
        const speeds = [2, 2.5, 3, 3.5, 4].map((speed) => {
            const r = attempt(() => run(canonical(type, { speed })));
            return r instanceof RangeError ? "unreachable" : fmt(ratio(r), 2);
        });
        console.log(
            `${type.padEnd(11)} 3 m/s ${speeds[2]} (coaching ${COACHING[type]}); ` +
                `2, 2.5, 3, 3.5, 4 m/s: ${speeds.join(", ")}`,
        );
    }
    // The player's push after contact (design §3.3): none against a full restoration of the arc's speed.
    for (const guideEffort of [0, 1]) {
        const cells = [2, 3, 4].map((speed) => {
            const r = attempt(() => run(canonical("drive", { speed, guideEffort })));
            if (r instanceof RangeError) {
                return `${speed} m/s unreachable`;
            }
            const hits = r.impact.timeline[`face/${r.setup.striker}`]?.length ?? 0;
            const after = r.impact.duration - trackOf(r.contact).arc.contactAt;
            return `${speed} m/s ${fmt(ratio(r), 2)}, ${hits} hits, ${ms(after)} ms after contactAt`;
        });
        console.log(`drive, guideEffort ${guideEffort}: ${cells.join("; ")}`);
    }
}

function canonicalRuns(): void {
    console.log("== Canonical setups (design §5.5, §9; exit criterion 4) ==");
    for (const type of STROKE_TYPES) {
        const r = run(canonicalSetup(type));
        const { impact } = r;
        const arc = trackOf(r.contact).arc;
        const jumps = impact.entryJumps ?? { count: NaN, worst: 0, keys: [] };
        const regions = Object.keys(impact.headRegions ?? {}).map((key) => key.split("#")[1]);
        const release = impact.release;
        const { hands, turf } = braking(r);
        console.log(
            `${type.padEnd(11)} entry jumps ${jumps.count} (worst ${mm(jumps.worst)} mm` +
                `${jumps.keys.length > 0 ? `: ${jumps.keys.slice(0, 3).join(" ")}` : ""}); ` +
                `highest ball centre ${mm(highest(r))} mm above R; regions ${regions.join(", ")}`,
        );
        console.log(
            `${"".padEnd(11)} release ${release ? `${ms(release.t - arc.contactAt)} ms after contactAt, ` : "none"}` +
                `${release ? `Δθ ${fmt((release.deltaTheta * 180) / Math.PI, 2)}°` : ""}; ` +
                `braking hands ${fmt(hands, 3)} N·s, turf ${fmt(turf, 3)} N·s; ` +
                `${ms(impact.duration - arc.contactAt)} ms after contactAt; ${flagCounts(impact)}`,
        );
        console.log(`${"".padEnd(11)} ${stanceText(r.setup)}`);
    }
}

function presets(): void {
    console.log("== Preset sweep: speed × drive × contact for each preset ==");
    for (const type of STROKE_TYPES) {
        const base = canonicalSetup(type);
        const up0 = base.stroke.contact.up;
        let runs = 0;
        let rejected = 0;
        let longest = 0;
        const counts = new Map<string, number>(FLAGS.map((kind) => [kind, 0]));
        // The rejections by speed, contact height (from the canonical) and message.
        const reasons = new Map<string, number>();
        for (const speed of [1, 2, 3, 4, 6]) {
            for (const strokeDrive of [-1, -0.5, 0, 0.5, 1]) {
                for (const up of [up0 - 0.003, up0, up0 + 0.003]) {
                    for (const side of [-0.01, 0, 0.01]) {
                        let setup: ShotSetup;
                        let contact: ContactState;
                        try {
                            // A speed beyond the preset's reach throws a RangeError, as an unreachable shot.
                            setup = canonical(type, { speed, drive: strokeDrive, contact: { up, side } });
                            contact = buildContact(setup, WORLD);
                        } catch (error) {
                            if (error instanceof RangeError) {
                                rejected++;
                                const reason = `${speed} m/s, up ${mm(up - up0)} mm: ${error.message}`;
                                reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
                                continue;
                            }
                            throw error;
                        }
                        const impact = simulateImpact(contact, setup.balls, WORLD);
                        runs++;
                        const kinds = impact.events.map((e) => e.kind);
                        for (const kind of FLAGS) {
                            counts.set(kind, (counts.get(kind) as number) + (kinds.includes(kind) ? 1 : 0));
                        }
                        if (!kinds.includes("impact-cap")) {
                            longest = Math.max(longest, impact.duration - trackOf(contact).arc.contactAt);
                        }
                    }
                }
            }
        }
        const approach = swingApproach(buildContact(base, WORLD));
        console.log(
            `${type.padEnd(11)} ${runs} runs (${rejected} rejected); runs raising ` +
                `${FLAGS.map((kind) => `${kind} ${counts.get(kind) as number}`).join(", ")}`,
        );
        console.log(
            `${"".padEnd(11)} longest before the cap ${ms(longest)} ms after contactAt ` +
                `(TRACK_IMPACT_CAP ${ms(TRACK_IMPACT_CAP)} ms); canonical approach ${mm(approach.clearance)} mm, ` +
                `${ms(approach.before)} ms before contact`,
        );
        for (const [reason, count] of reasons) {
            console.log(`${"".padEnd(11)} rejected ${count}× at ${reason}`);
        }
    }
}

function dip(): void {
    console.log(
        `== The AC stop's dip (design §9): penetration under HEAD_DEEP_LIMIT ${mm(HEAD_DEEP_LIMIT)} mm, ` +
            "the turf met after the ball ==",
    );
    const entry = defaultProfile.drive["stop-ac"];
    const meets: number[] = [];
    for (let tenths = 80; tenths <= 140; tenths += 5) {
        const depth = tenths / 1e4;
        const profile = {
            ...defaultProfile,
            drive: { ...defaultProfile.drive, "stop-ac": { ...entry, handDrop: depth } },
        };
        const r = run({ ...canonicalSetup("stop-ac"), profile });
        const face = r.impact.timeline["face/blue"]?.[0];
        const turf = r.impact.timeline["head/turf"]?.[0];
        const penetration = r.impact.peakPenetration["head/turf"] ?? 0;
        const after = face !== undefined && turf !== undefined && turf.start > face.end;
        if (after && penetration < HEAD_DEEP_LIMIT) {
            meets.push(depth);
        }
        console.log(
            `dip ${fmt(depth * 1e3, 1)} mm: face ends ${face ? `${ms(face.end)} ms` : "never"}, ` +
                `turf starts ${turf ? `${ms(turf.start)} ms` : "never"}; penetration ${mm(penetration)} mm; ` +
                `turf braking ${fmt(braking(r).turf, 3)} N·s; ratio ${fmt(ratio(r), 2)}; ${flagCounts(r.impact)}`,
        );
    }
    const range = meets.length > 0 ? `${mm(meets[0] as number)}–${mm(meets[meets.length - 1] as number)} mm` : "none";
    console.log(`depths meeting both: ${range}; the profile's handDrop is ${mm(entry.handDrop)} mm`);
}

/**
 * Over the first face–striker interval: the hands' impulse beyond the feed-forward, and the balls' total momentum
 * change, its denominator (every ball, so a croquet stroke's transfer to the croqueted ball counts).
 */
function handShare(r: Run): { readonly hands: number; readonly transfer: number } {
    const hit = firstStrike(r);
    if (hit === null) {
        return { hands: NaN, transfer: NaN };
    }
    let hands = 0;
    for (let i = hit.first; i <= hit.last; i++) {
        const hand = (r.steps[i] as ImpactSnapshot).hand;
        hands += (hand ? length(sub(hand.force, hand.feedForward)) : 0) * IMPACT_DT;
    }
    const start = before(r, hit.first).balls;
    const end = (r.steps[hit.last] as ImpactSnapshot).balls;
    let change = ZERO;
    end.forEach((b, i) => {
        change = add(change, sub(b.velocity, start[i] as Vec3));
    });
    return { hands, transfer: WORLD.ball.mass * length(change) };
}

function coupling(): void {
    console.log(
        `== Coupling (design §9): the canonical set at T = 0.04 s against HAND_COUPLING's ${HAND_COUPLING.period} s, ` +
            `ζ ${HAND_COUPLING.dampingRatio} ==`,
    );
    for (const type of STROKE_TYPES) {
        for (const period of [0.04, HAND_COUPLING.period]) {
            const r = run(canonicalSetup(type), { period, dampingRatio: HAND_COUPLING.dampingRatio });
            const { hands, transfer } = handShare(r);
            const tracked = trackOf(r.contact);
            const track = prepareTrack(tracked, r.contact.head, WORLD.gravity);
            const end = r.steps.find((s) => s.t >= tracked.arc.handStart + tracked.arc.handWindow);
            const lag = end ? length(sub(socketAt(end.head, r.contact.head), pathAt(track, end.t).socket)) : NaN;
            const hits = r.impact.timeline[`face/${r.setup.striker}`]?.length ?? 0;
            // A croquet stroke's ratio; a single-ball stroke's distances after the touch on its target (the GC stop).
            const outcome = r.setup.croqueted !== undefined ? `ratio ${fmt(ratio(r), 2)}` : touchText(r);
            console.log(
                `${type.padEnd(11)} T ${fmt(period, 2)} s: ${outcome}, ${hits} hits; ` +
                    `hands beyond feed-forward ${fmt(hands * 1e3, 2)} mN·s of the balls' ${fmt(transfer, 4)} N·s ` +
                    `(${fmt((100 * hands) / transfer, 2)} %); lag at the hands' window's end ${fmt(lag * 1e3, 3)} mm`,
            );
        }
    }
}

/** The face centre's velocity along `aim`. */
function faceSpeed(state: HeadState, head: MalletHead, aim: Vec3): number {
    const arm = rotate(state.orientation, vec3(head.length / 2, 0, 0));
    return dot(add(state.velocity, cross(state.angularVelocity, arm)), aim);
}

function mass(): void {
    console.log("== Effective mass at the face centre along aim (design §3.4; exit criterion 3: within 10 % of m) ==");
    for (const type of STROKE_TYPES) {
        const r = run(canonicalSetup(type));
        const tracked = trackOf(r.contact);
        const head = r.contact.head;
        const closed = effectiveMass(
            swungBody(head, tracked.hands, tracked.arc.radius),
            head,
            r.contact.orientation,
            tracked.arc.aim,
        );
        const hit = firstStrike(r);
        let measured = "never struck";
        if (hit !== null) {
            const start = before(r, hit.first);
            const end = r.steps[hit.last] as ImpactSnapshot;
            const loss = faceSpeed(start.head, head, tracked.arc.aim) - faceSpeed(end.head, head, tracked.arc.aim);
            const momentum = (i: number): number =>
                WORLD.ball.mass *
                dot(sub((end.balls[i] as BallState).velocity, start.balls[i] as Vec3), tracked.arc.aim);
            const all = end.balls.reduce((sum, _, i) => sum + momentum(i), 0);
            const striker = idsOf(r.setup.balls).indexOf(r.setup.striker);
            measured =
                `every ball ${fmt(all / loss)} kg (${fmt((100 * all) / (loss * closed) - 100, 2)} % from the ` +
                `closed form), the striker's ball alone ${fmt(momentum(striker) / loss)} kg`;
        }
        console.log(
            `${type.padEnd(11)} closed form ${fmt(closed)} kg ` +
                `(${fmt((100 * closed) / head.mass - 100, 2)} % from m); strike: ${measured}`,
        );
    }
}

/** Rotation angle (rad) from orientation b to a. */
function angleBetween(a: Quaternion, b: Quaternion): number {
    const e = multiply(a, { w: b.w, x: -b.x, y: -b.y, z: -b.z });
    return 2 * length(vec3(e.x, e.y, e.z));
}

function tracking(): void {
    console.log(
        `== Tracking at HAND_COUPLING (T ${HAND_COUPLING.period} s, ζ ${HAND_COUPLING.dampingRatio}), no ball, ` +
            "no turf: socket (m) and angle (rad) from the path ==",
    );
    for (const type of STROKE_TYPES) {
        // The hands timed MAX_LEAD early give MAX_LEAD of firm grip before contact; the rolls' hand window runs then.
        const contact = buildContact(canonical(type, { timing: { ...ON_TIME, hands: -MAX_LEAD } }), WORLD);
        const setup = { ...prepareImpact(contact, {}, WORLD), headTurf: null };
        const track = setup.drive as PreparedTrack;
        const arc = track.arc;
        const phaseAt = (t: number): string => {
            if (t < arc.contactAt) {
                return "firm";
            }
            if (inCheck(track, t)) {
                return "check";
            }
            if (arc.mode === "swing") {
                return "swing";
            }
            return t <= (track.reach?.tStop ?? Infinity) ? "carry" : "after the reach";
        };
        const worst = new Map<string, { socket: number; angle: number }>();
        integrate(setup, {
            probe: {
                step(s) {
                    const p = pathAt(track, s.t);
                    const phase = phaseAt(s.t);
                    const w = worst.get(phase) ?? { socket: 0, angle: 0 };
                    w.socket = Math.max(w.socket, length(sub(socketAt(s.head, contact.head), p.socket)));
                    w.angle = Math.max(w.angle, angleBetween(p.orientation, s.head.orientation));
                    worst.set(phase, w);
                },
            },
        });
        const phases = [...worst].map(
            ([phase, w]) => `${phase} ${w.socket.toExponential(2)}, ${w.angle.toExponential(2)}`,
        );
        console.log(`${type.padEnd(11)} (γ_T ${track.hands.gripTension}) ${phases.join("; ")}`);
    }
}

const radius = malletReference.headDiameter.value / 2;
const HEAD: MalletHead = {
    mass: malletReference.headMass.value,
    inertia: solidCylinderInertia(malletReference.headMass.value, malletReference.headLength.value, radius),
    length: malletReference.headLength.value,
    radius,
    socket: vec3(0, 0, radius),
};
const FACE: FaceMaterial = { friction: malletReference.faceFriction.value };
const at = (x: number, y: number): BallState => ({
    position: vec3(x, y, R),
    velocity: vec3(0, 0, 0),
    angularVelocity: vec3(0, 0, 0),
});
const BLUE = at(10, 10);
const RED = at(10 + 2 * R, 10);
/** A checked stroke: the hands pull back with 100 N along the travel for 3 ms, plus the head's weight. */
const checked = (t: Vec3): ReturnType<typeof drive> => drive(vec3(-100 * t.x, -100 * t.y, -100 * t.z), 3e-3, HEAD);

/** A force-table stroke of scripts/impactProbe.ts. */
interface ForceStroke {
    readonly name: string;
    readonly balls: BallStates;
    readonly contact: ContactState;
}

/** scripts/impactProbe.ts's force-table strokes, as P2b.2a timed them. */
const FORCE_STROKES: readonly ForceStroke[] = [
    {
        name: "centre 3 m/s",
        balls: { blue: BLUE },
        contact: strike(BLUE.position, { head: HEAD, face: FACE, speed: 3 }),
    },
    {
        name: "croquet 3 m/s",
        balls: { blue: BLUE, red: RED },
        contact: strike(BLUE.position, { head: HEAD, face: FACE, speed: 3 }),
    },
    {
        name: "descending 10°",
        balls: { blue: BLUE },
        contact: strike(BLUE.position, { head: HEAD, face: FACE, speed: 3, descent: 0.1745, pitch: 0.1745 }),
    },
    {
        name: "stop shot",
        balls: { blue: BLUE, red: RED },
        contact: strike(BLUE.position, { head: HEAD, face: FACE, speed: 3, descent: 0.0524, drive: checked }),
    },
];

function cost(): void {
    console.log(
        `== Impact time: in all, its fixed preparation (prepareTrack) and its integration per step ` +
            `(medians of ${REPEAT} runs after 5 warm-up; for P5) ==`,
    );
    const medianOf = (run: () => void): number => {
        for (let i = 0; i < 5; i++) {
            run();
        }
        const times: number[] = [];
        for (let i = 0; i < REPEAT; i++) {
            const start = performance.now();
            run();
            times.push(performance.now() - start);
        }
        times.sort((a, b) => a - b);
        return times[Math.floor(times.length / 2)] as number;
    };
    const time = (name: string, contact: ContactState, balls: BallStates): void => {
        const { drive } = contact;
        const steps = simulateImpact(contact, balls, WORLD).steps;
        const all = medianOf(() => simulateImpact(contact, balls, WORLD));
        // simulateImpact prepares a tracked drive once, then integrates: the preparation is not a per-step cost.
        const prepare = drive.kind === "track" ? medianOf(() => prepareTrack(drive, contact.head, WORLD.gravity)) : 0;
        console.log(
            `${name.padEnd(20)} ${fmt(all, 3)} ms in all: preparation ${fmt(prepare, 3)} ms, then ${steps} steps ` +
                `at ${fmt(((all - prepare) * 1e3) / steps, 3)} µs/step`,
        );
    };
    for (const type of STROKE_TYPES) {
        const setup = canonicalSetup(type);
        time(`tracked ${type}`, buildContact(setup, WORLD), setup.balls);
    }
    for (const stroke of FORCE_STROKES) {
        time(`force ${stroke.name}`, stroke.contact, stroke.balls);
    }
    // The longest lead-in (MAX_LEAD) plus the cap: a gentle AC stop (1 m/s, drive 0.5) whose head comes to rest on
    // the turf, a closed contact that holds the impact to the cap, its hands (which carry no share) timed MAX_LEAD
    // early.
    const r = run(canonical("stop-ac", { speed: 1, drive: 0.5, timing: { ...ON_TIME, hands: -MAX_LEAD } }));
    const ids = idsOf(r.setup.balls);
    const travel = ids.map(() => 0);
    let excess = -Infinity;
    for (const s of r.steps) {
        s.balls.forEach((b, i) => {
            // As integrate.ts sums it: each step's horizontal speed after the step times the step.
            travel[i] = (travel[i] as number) + length(horizontal(b.velocity)) * IMPACT_DT;
            const from = (r.setup.balls[ids[i] as BallId] as BallState).position;
            excess = Math.max(excess, length(horizontal(sub(b.position, from))) - (travel[i] as number));
        });
    }
    console.log(
        `reach filter over ${r.impact.steps} steps (${ms(r.impact.duration)} ms): displacement beyond the summed ` +
            `path at most ${excess.toExponential(2)} m against WAKE_MARGIN ${WAKE_MARGIN} m` +
            `${excess > 0 ? ` (${fmt(WAKE_MARGIN / excess, 0)}× headroom)` : ""}`,
    );
}

/** Where the lawn came in a timed stroke: before the ball, after it, or with the ball never struck. */
function order(impact: ImpactResult, striker: BallId): string {
    const struck = impact.timeline[`face/${striker}`]?.[0];
    const dug = impact.timeline["head/turf"]?.[0];
    if (struck === undefined) {
        return "missed";
    }
    return dug !== undefined && dug.start < struck.start ? "lawn first" : "ball first";
}

/**
 * One timed stroke's outcome (design §9): lawn or ball first, the dig and slide, the striker's ball's launch, and after
 * phase 2 both balls' distances and the coaching ratio, so the timings show what makes a better stroke in play.
 */
function timedLine(label: string, setup: ShotSetup): string {
    let r: Run;
    try {
        r = quick(setup);
    } catch (error) {
        if (error instanceof RangeError) {
            return `${label}: rejected (${error.message})`;
        }
        throw error;
    }
    const { impact } = r;
    const v = (impact.handover[setup.striker] as BallState).velocity;
    const flat = Math.hypot(v.x, v.y);
    const croqueted = setup.croqueted as BallId;
    return (
        `${label}: ${order(impact, setup.striker)}, dig ${mm(impact.peakPenetration["head/turf"] ?? 0)} mm, ` +
        `slide ${fmt((impact.headTurfSlide ?? 0) * 1e3, 1)} mm; ball ${fmt(Math.hypot(flat, v.z), 3)} m/s at ` +
        `${fmt((Math.atan2(v.z, flat) * 180) / Math.PI, 2)}°; striker ${fmt(travelled(r, setup.striker), 3)} m, ` +
        `croqueted ${fmt(travelled(r, croqueted), 3)} m, ratio ${fmt(ratio(r), 2)}; ${flagCounts(impact)}`
    );
}

function timings(): void {
    console.log("== Timing (design §9): each action early or late, and the dip's depth ==");
    for (const type of ["stop-ac", "full-roll"] as const) {
        for (const action of ["arc", "hands", "dip"] as const) {
            for (const offset of [-50, -40, -30, -20, -10, -5, 0, 5, 10, 20]) {
                const timing = { ...ON_TIME, [action]: offset / 1000 };
                console.log(timedLine(`${type} ${action} ${offset} ms`, canonical(type, { timing })));
            }
        }
        const entry = defaultProfile.drive[type];
        for (const times of entry.handDrop > 0 ? [0, 0.5, 1, 1.5, 2] : []) {
            const profile = {
                ...defaultProfile,
                drive: { ...defaultProfile.drive, [type]: { ...entry, handDrop: entry.handDrop * times } },
            };
            console.log(timedLine(`${type} dip ×${times}`, { ...canonicalSetup(type), profile }));
        }
    }
}

/** The GC sweep's gaps (m, surface to surface), from 0.05 to 1 m. */
const GAPS = [0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1];

function gc(): void {
    console.log(
        "== The GC stop (design §5.4, §9): after the striker's first touch on the target, both distances and " +
            "their ratio (target over striker); then stop-gc against single-ball over the gap ==",
    );
    for (const speed of [2, 2.5, 3, 3.5, 4]) {
        const r = attempt(() => run(canonical("stop-gc", { speed })));
        if (r instanceof RangeError) {
            console.log(`stop-gc ${fmt(speed, 1)} m/s, gap ${GC_STOP_GAP} m: rejected (${r.message})`);
            continue;
        }
        console.log(`stop-gc ${fmt(speed, 1)} m/s, gap ${GC_STOP_GAP} m: ${touchText(r)}; ${crossingText(r)}`);
    }
    for (const gap of GAPS) {
        for (const type of ["stop-gc", "single-ball"] as const) {
            const r = run(canonicalSetup(type, { targetGap: gap }));
            const hits = r.impact.timeline[`face/${r.setup.striker}`]?.length ?? 0;
            console.log(
                `gap ${fmt(gap, 2)} m ${type.padEnd(11)} ${hits} hits, ${ms(r.impact.duration)} ms; ` +
                    `${touchText(r)}; ${crossingText(r)}`,
            );
        }
    }
}

/**
 * A single-ball stroke through the world's first hoop, its plane crossing the aim: the canonical single-ball stroke
 * with the striker's ball 0.15 m short of the hoop's centre, on its centre line, and the face `side` off the ball's
 * centre. At side 0 the head passes through the jaws with about 9.5 mm to spare each side (the shaft meets the crown);
 * at 10 mm the head, 10 mm off the ball's line, has 0.5 mm too little and its rim meets an upright.
 */
function throughHoop(side: number): ShotSetup {
    const hoop = WORLD.hoops[0] as (typeof WORLD.hoops)[number];
    const base = canonical("single-ball", { contact: { up: 0, side } });
    const blue: BallState = {
        position: vec3(hoop.centre.x, hoop.centre.y - 0.15, R),
        velocity: vec3(0, 0, 0),
        angularVelocity: vec3(0, 0, 0),
    };
    return { ...base, balls: { blue } };
}

function rehit(): void {
    console.log(
        "== The late re-hit (design §3.5, §9): the real head at the impact's end, moved on by the planned " +
            "follow-through out to FREE_SPAN, against every ball's phase-2 trajectory and, with the shaft, the hoops " +
            "and the peg; measured, not integrated ==",
    );
    for (const type of STROKE_TYPES) {
        const base = canonicalSetup(type);
        const up0 = base.stroke.contact.up;
        let runs = 0;
        let overlapped = 0;
        let balls = 0;
        let obstacles = 0;
        const crossed: string[] = [];
        for (const speed of [1, 2, 3, 4, 6]) {
            for (const strokeDrive of [-1, -0.5, 0, 0.5, 1]) {
                for (const up of [up0 - 0.003, up0, up0 + 0.003]) {
                    for (const side of [-0.01, 0, 0.01]) {
                        let r: Run;
                        try {
                            r = quick(canonical(type, { speed, drive: strokeDrive, contact: { up, side } }));
                        } catch (error) {
                            if (error instanceof RangeError) {
                                continue;
                            }
                            throw error;
                        }
                        runs++;
                        const c = crossing(r);
                        overlapped += c.atEnd.length > 0 ? 1 : 0;
                        balls += c.first === null ? 0 : 1;
                        obstacles += c.obstacle === null ? 0 : 1;
                        if (c.first !== null || c.obstacle !== null || c.atEnd.length > 0) {
                            crossed.push(
                                `speed ${speed}, drive ${strokeDrive}, up ${mm(up)} mm, side ${mm(side)} mm: ` +
                                    crossingText(r, c),
                            );
                        }
                    }
                }
            }
        }
        console.log(
            `${type.padEnd(11)} canonical: ${crossingText(quick(base))}; preset sweep: ${balls} of ${runs} runs ` +
                `cross a ball, ${obstacles} an obstacle, ${overlapped} overlap one at the impact's end`,
        );
        for (const line of crossed) {
            console.log(`${"".padEnd(11)} ${line}`);
        }
    }
    for (const side of [0, 0.01]) {
        console.log(`through hoop 1, side ${mm(side)} mm: ${crossingText(quick(throughHoop(side)))}`);
    }
}

const SECTIONS: Readonly<Record<string, () => void>> = {
    ratios,
    gc,
    canonical: canonicalRuns,
    presets,
    dip,
    coupling,
    mass,
    tracking,
    cost,
    timings,
    rehit,
};
if (SECTION !== "all" && SECTIONS[SECTION] === undefined) {
    throw new Error(`SECTION must be "all" or one of ${Object.keys(SECTIONS).join(", ")}`);
}
for (const [name, section] of Object.entries(SECTIONS)) {
    if (SECTION === "all" || SECTION === name) {
        section();
    }
}
