/**
 * Event-driven free-motion simulation (spec §5, phase 2).
 *
 * Each ball carries an open segment: a start state, a start time and either a free-motion phase (motion.ts) or a
 * push (push.ts), from which its state at any later time within the segment is exact. The loop finds the earliest
 * event across all balls, resolves it, and reopens the segments of the balls it affected. Candidates are gathered in
 * a fixed order and ties go to the first found, so results are deterministic.
 *
 * Contacts closing faster than RESTING_SPEED are impulses with restitution (resolve.ts). Slower ones, and touching
 * bodies driven together by their own accelerations, are resting contacts: the resting-contact solver (push.ts)
 * decides which of them push, and those are coupled until one of the pushed balls changes phase, the contact opens,
 * or another contact intervenes. For touching bodies, the decision at t = 0 uses `approachSpeed` and the same solver
 * that resolution uses, so detection and resolution always agree.
 *
 * A ball in flight follows its ballistic path until it lands (an impulse with the turf, resolve.ts) or strikes
 * something. Ball–ball contact is between spheres, measured in 3D; contact with an upright or the peg, the boundary and
 * the halt margin are measured on the horizontal projection of the centre.
 */
import {
    CONTACT_TOLERANCE,
    approachSpeed,
    approachTime,
    boundaryCrossingTime,
    firstNonNegative,
    isTouching,
} from "./detect";
import { ZERO, dot, horizontal, length, normalize, scale, sub, vec3, type Vec3 } from "./math/vec3";
import {
    SPEED_EPSILON,
    advance,
    atRest,
    classify,
    endOfPhase,
    phaseDuration,
    trajectory,
    type Trajectory,
} from "./motion";
import { observe } from "./observe";
import {
    ACCELERATION_EPSILON,
    RESTING_SPEED,
    SEPARATION_TOLERANCE,
    freeAcceleration,
    pushDuration,
    pushedState,
    pushedTrajectory,
    solveRestingContacts,
    type RestingContact,
    type RestingSolution,
} from "./push";
import { SETTLE_SPEED, resolveBallBall, resolveBallCylinder, resolveLanding, type TurfAt } from "./resolve";
import {
    BALL_IDS,
    type BallId,
    type BallState,
    type BallStates,
    type Cylinder,
    type MotionParams,
    type MotionPhase,
    type PushMotion,
    type Segment,
    type ShotEvent,
    type ShotResult,
    type World,
} from "./types";
import { motionParamsAt, obstaclesOf, turfAt, validateWorld } from "./world";

/** Version of the physics; recorded in every result and share link. */
export const ENGINE_VERSION = "0.1.0";

/** Event budget per shot. Reaching it marks the result aborted rather than looping forever. */
export const DEFAULT_MAX_EVENTS = 10_000;

/** Tolerance (m) for accepting an initial centre height as on the lawn plane. */
const PLANE_TOLERANCE = 1e-9;

interface Track {
    readonly id: BallId;
    start: BallState;
    phase: MotionPhase;
    t0: number;
    /** Time the segment stays valid: to the end of its phase, or of its push. */
    duration: number;
    params: MotionParams;
    push: PushMotion | null;
    /** A halted ball is out of play: it no longer moves or touches anything. */
    inert: boolean;
    readonly segments: Segment[];
}

/** A coupled contact: ball `a` resting against ball `b` or against `obstacle`. */
interface Coupling {
    readonly a: Track;
    readonly b: Track | null;
    readonly obstacle: Cylinder | null;
}

/** Mutable simulation state shared by the helpers below. */
interface Simulation {
    readonly world: World;
    readonly obstacles: readonly Cylinder[];
    readonly tracks: Track[];
    couplings: Coupling[];
    readonly events: ShotEvent[];
    readonly turf: TurfAt;
}

type Candidate =
    | { readonly time: number; readonly kind: "transition"; readonly track: Track }
    | { readonly time: number; readonly kind: "regroup"; readonly track: Track }
    | { readonly time: number; readonly kind: "ball-ball"; readonly a: Track; readonly b: Track }
    | { readonly time: number; readonly kind: "obstacle"; readonly track: Track; readonly obstacle: Cylinder }
    | { readonly time: number; readonly kind: "halt"; readonly track: Track }
    | { readonly time: number; readonly kind: "landing"; readonly track: Track };

function stateAt(track: Track, t: number): BallState {
    const local = Math.min(t - track.t0, track.duration);
    return track.push
        ? pushedState(track.start, track.push, local)
        : advance(track.start, track.phase, track.params, local);
}

function pathAt(track: Track, t: number): Trajectory {
    const s = stateAt(track, t);
    return track.push ? pushedTrajectory(s, track.push) : trajectory(s, track.phase, track.params);
}

/** True when the ball is perched: held still in the air by its contacts (push.ts snaps such a ball to rest). */
function perched(track: Track): boolean {
    return (
        track.phase === "airborne" &&
        track.push !== null &&
        length(track.start.velocity) === 0 &&
        length(track.push.acceleration) === 0
    );
}

function moving(track: Track): boolean {
    return !track.inert && track.phase !== "stationary" && !perched(track);
}

/**
 * Checks an initial state and places it exactly: a ball within PLANE_TOLERANCE of the lawn plane is put on it, and
 * keeps an upward vertical velocity of at least SETTLE_SPEED (it starts airborne) or otherwise loses its vertical
 * velocity; a ball higher up starts airborne as it is. A ball below the plane is rejected.
 */
function initialState(id: BallId, s: BallState, radius: number): BallState {
    if (s.position.z < radius - PLANE_TOLERANCE) {
        throw new RangeError(`ball ${id} is below the lawn plane`);
    }
    if (s.position.z > radius + PLANE_TOLERANCE) {
        return s;
    }
    return {
        position: vec3(s.position.x, s.position.y, radius),
        velocity: s.velocity.z >= SETTLE_SPEED ? s.velocity : horizontal(s.velocity),
        angularVelocity: s.angularVelocity,
    };
}

function assertNoOverlap(tracks: readonly Track[], obstacles: readonly Cylinder[], radius: number): void {
    for (let i = 0; i < tracks.length; i++) {
        const a = tracks[i] as Track;
        for (let j = i + 1; j < tracks.length; j++) {
            const b = tracks[j] as Track;
            const gap = length(sub(a.start.position, b.start.position)) - 2 * radius;
            if (gap < -CONTACT_TOLERANCE) {
                throw new RangeError(`balls ${a.id} and ${b.id} overlap`);
            }
        }
        for (const o of obstacles) {
            const gap = length(horizontal(sub(a.start.position, o.centre))) - radius - o.radius;
            if (gap < -CONTACT_TOLERANCE) {
                throw new RangeError(`ball ${a.id} overlaps ${o.id}`);
            }
        }
    }
}

/**
 * Closes the track's current segment at `now` and opens a new one from `state`, moving freely or, when `motion` is
 * given, with that push. Records a phase event when the phase changes (or on the first segment).
 */
function reopen(
    sim: Simulation,
    track: Track | null,
    id: BallId,
    state: BallState,
    now: number,
    motion: { readonly phase: MotionPhase; readonly push: PushMotion | null } | null = null,
): Track {
    const radius = sim.world.ball.radius;
    const phase = motion ? motion.phase : classify(state, radius);
    const push = motion ? motion.push : null;
    const start = phase === "stationary" ? atRest(state.position) : state;
    const params = motionParamsAt(sim.world, start.position);
    if (track && now > track.t0) {
        const closed = { t0: track.t0, t1: now, phase: track.phase, start: track.start, params: track.params };
        track.segments.push(track.push ? { ...closed, push: track.push } : closed);
    }
    if (!track || track.phase !== phase) {
        sim.events.push({ kind: "phase", t: now, ball: id, phase });
    }
    const next: Track = track ?? { id, start, phase, t0: now, duration: 0, params, push, inert: false, segments: [] };
    next.start = start;
    next.phase = phase;
    next.t0 = now;
    next.params = params;
    next.push = push;
    next.duration = push ? pushDuration(start, phase, push, radius) : phaseDuration(start, phase, params);
    return next;
}

function coupledPair(sim: Simulation, a: Track, b: Track): boolean {
    return sim.couplings.some((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a));
}

function coupledObstacle(sim: Simulation, track: Track, obstacle: Cylinder): boolean {
    return sim.couplings.some((c) => c.a === track && c.obstacle === obstacle);
}

/** Returns the tracks joined to `seeds` by couplings, in canonical ball order. */
function groupOf(sim: Simulation, seeds: readonly Track[]): Track[] {
    const found = new Set<Track>(seeds);
    let grew = true;
    while (grew) {
        grew = false;
        for (const c of sim.couplings) {
            if (c.b && found.has(c.a) !== found.has(c.b)) {
                found.add(c.a);
                found.add(c.b);
                grew = true;
            }
        }
    }
    return sim.tracks.filter((t) => found.has(t));
}

/** Returns when the earliest segment of the track's coupled group ends (its own end when uncoupled). */
function groupEnd(sim: Simulation, track: Track): number {
    return Math.min(...groupOf(sim, [track]).map((t) => t.t0 + t.duration));
}

/** Uncouples every group containing one of `tracks`: its balls continue from their current states, moving freely. */
function release(sim: Simulation, tracks: readonly Track[], now: number): void {
    const group = groupOf(sim, tracks);
    sim.couplings = sim.couplings.filter((c) => !group.includes(c.a));
    for (const track of group) {
        if (track.push) {
            reopen(sim, track, track.id, stateAt(track, now), now);
        }
    }
}

/** The resting contacts around `seeds`: touching bodies (coupled ones within SEPARATION_TOLERANCE) closing slowly. */
interface Component {
    readonly tracks: Track[];
    readonly obstacles: Cylinder[];
    readonly contacts: RestingContact[];
}

function restingComponent(sim: Simulation, seeds: readonly Track[], now: number): Component {
    const R = sim.world.ball.radius;
    const tracks: Track[] = seeds.filter((t) => !t.inert);
    const obstacles: Cylinder[] = [];
    const contacts: RestingContact[] = [];
    const resting = (offset: Vec3, velocity: Vec3, distance: number, coupled: boolean): boolean => {
        const touching = coupled ? separationGap(offset, distance) < 0 : isTouching(offset, distance);
        return touching && Math.abs(approachSpeed(offset, velocity)) <= RESTING_SPEED;
    };
    for (let i = 0; i < tracks.length; i++) {
        const a = tracks[i] as Track;
        const sa = stateAt(a, now);
        for (const b of sim.tracks) {
            if (b === a || b.inert || contacts.some((c) => !c.fixed && tracks[c.b] === a && tracks[c.a] === b)) {
                continue;
            }
            const sb = stateAt(b, now);
            const offset = sub(sa.position, sb.position);
            if (resting(offset, sub(sa.velocity, sb.velocity), 2 * R, coupledPair(sim, a, b))) {
                if (!tracks.includes(b)) {
                    tracks.push(b);
                }
                contacts.push({ a: i, b: tracks.indexOf(b), fixed: false });
            }
        }
        for (const o of sim.obstacles) {
            const offset = horizontal(sub(sa.position, o.centre));
            if (resting(offset, sa.velocity, R + o.radius, coupledObstacle(sim, a, o))) {
                obstacles.push(o);
                contacts.push({ a: i, b: obstacles.length - 1, fixed: true });
            }
        }
    }
    return { tracks, obstacles, contacts };
}

function solveComponent(component: Component, now: number): RestingSolution {
    return solveRestingContacts(
        component.tracks.map((t) => ({ state: stateAt(t, now), params: t.params })),
        component.obstacles.map((o) => o.centre),
        component.contacts,
    );
}

/**
 * Resolves the resting contacts around `seeds`: uncouples every group involved, solves the component again and
 * couples the contacts the solution keeps.
 */
function settle(sim: Simulation, seeds: readonly Track[], now: number): void {
    const component = restingComponent(sim, seeds, now);
    release(sim, component.tracks, now);
    const solution = solveComponent(component, now);
    component.tracks.forEach((track, i) => {
        const member = solution.members[i];
        if (member) {
            reopen(sim, track, track.id, member.state, now, { phase: member.phase, push: member.push });
        }
    });
    component.contacts.forEach((c, k) => {
        if (solution.coupled[k]) {
            const a = component.tracks[c.a] as Track;
            sim.couplings.push(
                c.fixed
                    ? { a, b: null, obstacle: component.obstacles[c.b] as Cylinder }
                    : { a, b: component.tracks[c.b] as Track, obstacle: null },
            );
        }
    });
    // Reported here rather than on a contact event: regroups re-solve too, and they have no contact event.
    const held = sim.tracks.filter((t) => solution.approximate[component.tracks.indexOf(t)] === true);
    if (held.length > 0) {
        sim.events.push({
            kind: "approximate-hold",
            t: now,
            balls: held.map((t) => t.id),
            excess: solution.holdExcess,
        });
    }
}

/** Returns the earlier candidate; on a tie the one found first wins, which keeps the order deterministic. */
function earlier(best: Candidate | null, candidate: Candidate): Candidate {
    return best === null || candidate.time < best.time ? candidate : best;
}

/**
 * |offset|² − (distance + SEPARATION_TOLERANCE)², which is negative while a coupled contact is still closed. The
 * separation monitor and the resting-contact component both use this one expression, so they cannot disagree. Like
 * detect.ts, it measures `offset` as given: 3D between balls, horizontal to an obstacle's axis.
 */
function separationGap(offset: Vec3, distance: number): number {
    const band = 2 * distance * SEPARATION_TOLERANCE + SEPARATION_TOLERANCE * SEPARATION_TOLERANCE;
    return dot(offset, offset) - distance * distance - band;
}

/** Earliest time a coupled contact opens beyond SEPARATION_TOLERANCE, for relative trajectory a + b·t + c·t². */
function separationTime(a: Vec3, b: Vec3, c: Vec3, distance: number, horizon: number): number | null {
    const f = [separationGap(a, distance), 2 * dot(a, b), dot(b, b) + 2 * dot(a, c), 2 * dot(b, c), dot(c, c)];
    if (Number.isFinite(horizon)) {
        return firstNonNegative(f, horizon);
    }
    // No horizon: every real root of f lies within Cauchy's bound 1 + max|fᵢ/fₙ|, with fₙ the highest non-zero
    // coefficient, so searching up to it finds the first one.
    let n = f.length - 1;
    while (n > 0 && f[n] === 0) {
        n--;
    }
    if (n === 0) {
        return firstNonNegative(f, 0);
    }
    let bound = 0;
    for (let i = 0; i < n; i++) {
        bound = Math.max(bound, Math.abs((f[i] as number) / (f[n] as number)));
    }
    return firstNonNegative(f, 1 + bound);
}

/**
 * Returns when the earliest segment of the track's coupled group ends, or, if none ends by itself, when the first of
 * its couplings opens. A moving ball in flight whose push has no vertical acceleration (a ball sliding off the exact
 * top of another has a vertical normal, so exactly zero acceleration) never lands, so its segment has no end of its
 * own; but the coupled pair separates in finite time, which is where its group regroups anyway. Every search for
 * the group's next event needs a finite horizon, so this is the one it is given.
 */
function boundedGroupEnd(sim: Simulation, track: Track, now: number): number {
    const own = groupEnd(sim, track);
    if (Number.isFinite(own)) {
        return own;
    }
    const group = groupOf(sim, [track]);
    let end = own;
    for (const c of sim.couplings) {
        if (!group.includes(c.a)) {
            continue;
        }
        const pa = pathAt(c.a, now);
        let dt: number | null;
        if (c.b) {
            const pb = pathAt(c.b, now);
            dt = separationTime(
                sub(pa.c0, pb.c0),
                sub(pa.c1, pb.c1),
                sub(pa.c2, pb.c2),
                2 * sim.world.ball.radius,
                Infinity,
            );
        } else {
            const o = c.obstacle as Cylinder;
            dt = separationTime(
                horizontal(sub(pa.c0, o.centre)),
                horizontal(pa.c1),
                horizontal(pa.c2),
                sim.world.ball.radius + o.radius,
                Infinity,
            );
        }
        if (dt !== null) {
            end = Math.min(end, now + dt);
        }
    }
    return end;
}

/**
 * The acceleration of a ball as the resting-contact solver sees it: its push, or its free turf acceleration. Using
 * the solver's own view (rather than the trajectory's) keeps detection consistent with resolution, including at the
 * very end of a phase, where the trajectory still says "rolling" but the state is already at rest.
 */
function accelerationOf(track: Track, state: BallState): Vec3 {
    return track.push ? track.push.acceleration : freeAcceleration(state, track.params);
}

/**
 * Decides whether touching bodies must be resolved now: they are approaching, or they rest against each other and
 * their accelerations drive them together. `towards` is the offset from the first body's centre to the second's (3D
 * for a ball, horizontal for an obstacle's axis) and `otherAcceleration` the second body's (an obstacle's is ZERO).
 * Resolution applies the resting-contact solver, whose outcome never leaves an uncoupled resting contact driven
 * together, so a contact resolved at t = 0 does not trigger again.
 */
function contactNow(towards: Vec3, acceleration: Vec3, otherAcceleration: Vec3, closing: number): boolean {
    if (closing > SPEED_EPSILON) {
        return true;
    }
    const normal = normalize(towards);
    return closing >= -RESTING_SPEED && dot(sub(acceleration, otherAcceleration), normal) > ACCELERATION_EPSILON;
}

function findNextEvent(sim: Simulation, now: number): Candidate | null {
    const { world, obstacles } = sim;
    const R = world.ball.radius;
    const live = sim.tracks.filter((t) => !t.inert);
    const states = new Map(live.map((t) => [t, stateAt(t, now)]));
    const paths = new Map(live.map((t) => [t, pathAt(t, now)]));
    const ends = new Map(live.map((t) => [t, boundedGroupEnd(sim, t, now)]));
    let best: Candidate | null = null;

    for (const track of live) {
        const end = track.t0 + track.duration;
        // Landings are gathered last (below): simultaneous impulses go ball–ball, then obstacles, then landings.
        if (moving(track) && Number.isFinite(end) && track.phase !== "airborne") {
            best = earlier(best, { time: end, kind: track.push ? "regroup" : "transition", track });
        }
    }
    for (let i = 0; i < live.length; i++) {
        const a = live[i] as Track;
        for (let j = i + 1; j < live.length; j++) {
            const b = live[j] as Track;
            if (!moving(a) && !moving(b)) {
                continue;
            }
            const horizon = Math.min(ends.get(a) as number, ends.get(b) as number) - now;
            const pa = paths.get(a) as Trajectory;
            const pb = paths.get(b) as Trajectory;
            const rel = [sub(pa.c0, pb.c0), sub(pa.c1, pb.c1), sub(pa.c2, pb.c2)] as const;
            if (coupledPair(sim, a, b)) {
                const dt = separationTime(rel[0], rel[1], rel[2], 2 * R, horizon);
                if (dt !== null) {
                    best = earlier(best, { time: now + dt, kind: "regroup", track: a });
                }
                continue;
            }
            const sa = states.get(a) as BallState;
            const sb = states.get(b) as BallState;
            const offset = sub(sa.position, sb.position);
            const closing = approachSpeed(offset, sub(sa.velocity, sb.velocity));
            const driven = contactNow(scale(offset, -1), accelerationOf(a, sa), accelerationOf(b, sb), closing);
            if (isTouching(offset, 2 * R) && driven) {
                best = earlier(best, { time: now, kind: "ball-ball", a, b });
                continue;
            }
            const dt = approachTime(rel[0], rel[1], rel[2], 2 * R, horizon);
            if (dt !== null) {
                best = earlier(best, { time: now + dt, kind: "ball-ball", a, b });
            }
        }
    }
    for (const track of live.filter(moving)) {
        const p = paths.get(track) as Trajectory;
        const s = states.get(track) as BallState;
        const horizon = (ends.get(track) as number) - now;
        for (const obstacle of obstacles) {
            const distance = R + obstacle.radius;
            // A vertical cylinder: measured on the horizontal projection, at any height.
            const offset = horizontal(sub(p.c0, obstacle.centre));
            const c1 = horizontal(p.c1);
            const c2 = horizontal(p.c2);
            if (coupledObstacle(sim, track, obstacle)) {
                const dt = separationTime(offset, c1, c2, distance, horizon);
                if (dt !== null) {
                    best = earlier(best, { time: now + dt, kind: "regroup", track });
                }
                continue;
            }
            const closing = approachSpeed(offset, s.velocity);
            const driven = contactNow(scale(offset, -1), accelerationOf(track, s), ZERO, closing);
            if (isTouching(offset, distance) && driven) {
                best = earlier(best, { time: now, kind: "obstacle", track, obstacle });
                continue;
            }
            const dt = approachTime(offset, c1, c2, distance, horizon);
            if (dt !== null) {
                best = earlier(best, { time: now + dt, kind: "obstacle", track, obstacle });
            }
        }
        const dt = boundaryCrossingTime(p, world.lawn, world.haltMargin, horizon);
        if (dt !== null) {
            best = earlier(best, { time: now + dt, kind: "halt", track });
        }
    }
    for (const track of live) {
        const end = track.t0 + track.duration;
        if (track.phase === "airborne" && Number.isFinite(end)) {
            best = earlier(best, { time: end, kind: "landing", track });
        }
    }
    return best;
}

/**
 * Simulates free motion from the given initial states until every ball is at rest (or the event budget runs
 * out). Balls must not be below the lawn plane or overlap one another or any obstacle.
 */
export function simulateFreeMotion(
    initial: BallStates,
    world: World,
    maxEvents: number = DEFAULT_MAX_EVENTS,
): ShotResult {
    validateWorld(world);
    const sim: Simulation = {
        world,
        obstacles: obstaclesOf(world),
        tracks: [],
        couplings: [],
        events: [],
        turf: (position) => turfAt(world, position),
    };
    for (const id of BALL_IDS) {
        const s = initial[id];
        if (s) {
            sim.tracks.push(reopen(sim, null, id, initialState(id, s, world.ball.radius), 0));
        }
    }
    assertNoOverlap(sim.tracks, sim.obstacles, world.ball.radius);

    let now = 0;
    let count = 0;
    let aborted = false;
    while (sim.tracks.some(moving)) {
        if (count >= maxEvents) {
            aborted = true;
            break;
        }
        count++;
        const next = findNextEvent(sim, now);
        if (next === null) {
            throw new Error("no next event although a ball is moving");
        }
        now = next.time;
        switch (next.kind) {
            case "transition": {
                const { track } = next;
                reopen(sim, track, track.id, endOfPhase(track.start, track.phase, track.params), now);
                break;
            }
            case "regroup": {
                settle(sim, groupOf(sim, [next.track]), now);
                break;
            }
            case "ball-ball": {
                const { a, b } = next;
                const sa = stateAt(a, now);
                const sb = stateAt(b, now);
                const resting =
                    approachSpeed(sub(sa.position, sb.position), sub(sa.velocity, sb.velocity)) <= RESTING_SPEED;
                sim.events.push({ kind: "ball-ball", t: now, balls: [a.id, b.id], resting });
                if (resting) {
                    settle(sim, [a, b], now);
                } else {
                    release(sim, [a, b], now);
                    const [na, nb] = resolveBallBall(sa, sb, world.ball, world.ballBall);
                    reopen(sim, a, a.id, na, now);
                    reopen(sim, b, b.id, nb, now);
                }
                break;
            }
            case "obstacle": {
                const { track, obstacle } = next;
                const s = stateAt(track, now);
                const offset = horizontal(sub(s.position, obstacle.centre));
                const resting = approachSpeed(offset, s.velocity) <= RESTING_SPEED;
                sim.events.push({ kind: "ball-obstacle", t: now, ball: track.id, obstacleId: obstacle.id, resting });
                if (resting) {
                    settle(sim, [track], now);
                } else {
                    release(sim, [track], now);
                    reopen(
                        sim,
                        track,
                        track.id,
                        resolveBallCylinder(s, obstacle.centre, world.ball, obstacle.material),
                        now,
                    );
                }
                break;
            }
            case "halt": {
                const { track } = next;
                release(sim, [track], now);
                // A ball halted in flight is placed on the turf beneath that point.
                const p = stateAt(track, now).position;
                reopen(sim, track, track.id, atRest(vec3(p.x, p.y, world.ball.radius)), now);
                track.inert = true;
                sim.events.push({ kind: "halted", t: now, ball: track.id });
                break;
            }
            case "landing": {
                const { track } = next;
                const group = groupOf(sim, [track]);
                const coupled = sim.couplings.some((c) => group.includes(c.a));
                const s = stateAt(track, now);
                release(sim, group, now);
                const R = world.ball.radius;
                const touchdown = { ...s, position: vec3(s.position.x, s.position.y, R) };
                reopen(sim, track, track.id, resolveLanding(touchdown, world.ball, sim.turf(touchdown.position)), now);
                sim.events.push({ kind: "landing", t: now, ball: track.id });
                if (coupled) {
                    settle(sim, group, now);
                }
                break;
            }
        }
    }

    const segments: Partial<Record<BallId, readonly Segment[]>> = {};
    const rest: Partial<Record<BallId, Vec3>> = {};
    for (const track of sim.tracks) {
        const closed = { t0: track.t0, t1: now, phase: track.phase, start: track.start, params: track.params };
        track.segments.push(track.push ? { ...closed, push: track.push } : closed);
        segments[track.id] = track.segments;
        rest[track.id] = stateAt(track, now).position;
    }
    const allEvents = [...sim.events, ...observe(segments, world)].sort((a, b) => a.t - b.t);
    return { engineVersion: ENGINE_VERSION, duration: now, segments, events: allEvents, rest, aborted };
}
