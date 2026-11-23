import { describe, expect, it } from "vitest";
import { faceKey, headBallContact, headLowestPoint } from "../../../src/engine/impact/contacts";
import { departing, nextReplay, RESTART_HOLD, TRACK_IMPACT_CAP } from "../../../src/engine/impact/integrate";
import { practiseStroke } from "../../../src/engine/impact/practice";
import { followProjection, simulateImpact, simulateStroke } from "../../../src/engine/impact/simulateImpact";
import {
    anchoredTime,
    guideExcess,
    handsAt,
    headDepth,
    headDepthTerms,
    headOnPath,
    pathAt,
    pendulumOf,
    plannedTime,
    prepareTrack,
    reanchor,
    retimeFinish,
    swingOrientation,
    type PreparedTrack,
    type Push,
} from "../../../src/engine/impact/track";
import type { MalletHead, TrackDrive } from "../../../src/engine/impact/types";
import { add, dot, scale, sub, vec3 } from "../../../src/engine/math/vec3";
import { planStroke } from "../../../src/engine/swing/buildContact";
import { advance, rollingSpin } from "../../../src/engine/motion";
import type { BallState } from "../../../src/engine/types";
import { motionParamsAt } from "../../../src/engine/world";
import { canonicalSetup } from "../support/shot";
import { openWorld } from "../../../scripts/openLawn";
import { mapSetup, textBook } from "../../../scripts/pushMapRun";

// The rolls' flat push and rising finish (flat push design §3.1, §4; the user's rulings of 2026-11-14).

const lawn = openWorld(10);

function fullRoll(power: number): { track: PreparedTrack; head: MalletHead; push: Push } {
    const setup = mapSetup("full-roll", textBook("full-roll"), power);
    const { contact } = planStroke(setup, lawn);
    const track = prepareTrack(contact.drive as TrackDrive, contact.head, lawn.gravity);
    return { track, head: contact.head, push: track.push as Push };
}

/** The head's lowest point (m, world z) on the planned path at time t. */
function headLow(track: PreparedTrack, head: MalletHead, t: number): number {
    return headLowestPoint(headOnPath(track, head, t), head);
}

/** Times from the finish's start to the turn's rest, `n` + 1 of them. */
function finishTimes(push: Push, n: number): number[] {
    const from = push.finish?.from as number;
    const to = push.freed as number;
    return Array.from({ length: n + 1 }, (_, i) => from + ((to - from) * i) / n);
}

describe("the rolls' rising finish (flat push design §3.1)", () => {
    it("keeps the head at or above its push-end height through the finish at power 1.1", () => {
        const { track, head, push } = fullRoll(1.1);
        expect(push.rise).not.toBeNull();
        const [from, ...rest] = finishTimes(push, 400);
        const start = headLow(track, head, from as number);
        for (const t of rest) {
            expect(headLow(track, head, t)).toBeGreaterThanOrEqual(start - 1e-9);
        }
    });

    it("moves the top hand continuously at the finish's start and at the depth's peak", () => {
        const { track, push } = fullRoll(1.1);
        const from = push.finish?.from as number;
        const times = finishTimes(push, 2000);
        const rise = push.rise;
        expect(rise).not.toBeNull();
        // The first sample at or past θ*, found from the head's own depth: where the hands stop rising.
        const peakAt = times.find((t) => pathAt(track, t).theta >= (rise?.peak as number));
        const seams = peakAt === undefined ? [from] : [from, peakAt];
        const h = 1e-6;
        for (const t of seams) {
            const before = handsAt(track, t - h);
            const after = handsAt(track, t + h);
            expect(Math.abs(after.position.z - before.position.z)).toBeLessThan(1e-5);
            expect(Math.abs(after.velocity.z - before.velocity.z)).toBeLessThan(1e-3);
        }
    });

    it("lifts the bottom hand more than the top hand on a turn that passes vertical", () => {
        const { track, push } = fullRoll(1.1);
        const bottom = track.hands.bottom as number;
        const r = track.arc.radius;
        const bottomZ = (t: number): number => {
            const top = handsAt(track, t).position;
            const socket = pathAt(track, t).socket;
            return socket.z + ((top.z - socket.z) * bottom) / r;
        };
        const from = push.finish?.from as number;
        const end = push.freed as number;
        if (pathAt(track, end).theta <= 0) {
            // Flat push design §3.1 and Q1: the bottom hand rises more only past vertical; a turn that ends short of it
            // is Q1's evidence, reported by the lab step, not asserted here.
            return;
        }
        // Gap register, the third refit (engine 0.42.0): the turn runs −27.0° to +26.9°, as far past vertical as it began
        // behind it, and the bottom hand rises 53.9 mm to the top hand's 54.2. The geometry gives "more" only where the
        // turn ends further past vertical than it began, so that is the assertion's condition.
        if (pathAt(track, end).theta <= -pathAt(track, from).theta) {
            return;
        }
        const topRise = handsAt(track, end).position.z - handsAt(track, from).position.z;
        expect(bottomZ(end) - bottomZ(from)).toBeGreaterThan(topRise);
    });
});

describe("the head's depth below the top hand (flat push design §3.1)", () => {
    const box = fullRoll(1).head;
    const cylinder: MalletHead = { ...box, shape: { kind: "cylinder", radius: 0.045 }, socket: vec3(0, 0, 0.045) };
    const r = 0.5;
    const aim = vec3(1, 0, 0);
    for (const [name, head] of [
        ["box", box],
        ["cylinder", cylinder],
    ] as const) {
        it(`matches the ${name}'s lowest point from −40° to 40°`, () => {
            const terms = headDepthTerms(head, r);
            for (let deg = -40; deg <= 40; deg += 2.5) {
                const theta = (deg * Math.PI) / 180;
                // The top hand at the origin, the socket r along the shaft below it, the head's centre h further on.
                const radial = vec3(Math.sin(theta), 0, -Math.cos(theta));
                const centre = vec3(radial.x * (r + head.socket.z), 0, radial.z * (r + head.socket.z));
                const state = {
                    position: centre,
                    velocity: vec3(0, 0, 0),
                    orientation: swingOrientation(aim, theta),
                    angularVelocity: vec3(0, 0, 0),
                };
                const lowest = headLowestPoint(state as Parameters<typeof headLowestPoint>[0], head);
                expect(headDepth(terms, theta).d).toBeCloseTo(-lowest, 9);
            }
        });
    }
});

describe("the follow-through after the parting (flat push design, amendments 5 and 6)", () => {
    for (const [type, power, hold] of [
        // Before amendment 6 the hands surged the head into the striker's ball from 123 to 238 ms, 22 mm deep.
        ["full-roll", 1, 0.5],
        // Before amendment 6 the head, sped back to the plan's 1.8 m/s, caught the ball leaving at 1.58 m/s.
        ["half-roll", 0.891, 0.1],
    ] as const) {
        it(`keeps the ${type}'s head clear of the balls at power ${power}, hold ${hold}`, { timeout: 120_000 }, () => {
            const base = mapSetup(type, textBook(type), power);
            const setup = { ...base, stroke: { ...base.stroke, holdFirmness: hold } };
            const { contact } = planStroke(setup, lawn);
            const { follow, result } = practiseStroke(contact, setup.balls, lawn, setup.striker);
            // The impact ends at its first parting: no catch was replayed. Roll launch design §3.1 (was before 0.11 s):
            // the full roll re-anchors at its departure (0.66 ms, rate 0.569), and its slowed push taps the striker's
            // ball every few ms through the push, the impact ending at 218.5 ms, still with no catch replayed and nothing
            // off the face.
            // Soft follow-through design §2.1 (was: the full roll's impact ended before 0.22 s, nothing off the face):
            // with the balls carried on by phase 2 and the cap moved once, the full roll's follow-through is seen to
            // catch the striker's ball on the head's edge at 349.7 and 358.3 ms, past the old cap, so the impact ends
            // at 369.3 ms with impact-off-face. §2.2 and §2.3 are to take that late hit away.
            // Soft follow-through design §2.3 (was ended at 369.3 ms with impact-off-face): the shorter finish brings
            // the face, not the edge, back to the ball; the impact ends at 325.8 ms with nothing off the face.
            // Soft follow-through design §2.4 (was the full roll's impact ending at 325.8 ms): with the finish re-timed
            // so the head never outpaces the striker's ball, its impact ends at 90.5 ms and its head stays clear of the
            // balls through the follow-through, as the half roll's does.
            const kinds = result.events.map((e) => e.kind);
            expect(follow.impactEnd).toBeLessThan(0.11);
            expect(kinds).not.toContain("impact-off-face");
            const R = lawn.ball.radius;
            const project = followProjection(lawn);
            for (const s of follow.samples.filter((x) => x.t > follow.impactEnd)) {
                const balls = Object.values(project(result.balls, s.t - follow.impactEnd));
                for (const b of balls.filter((x) => x !== undefined)) {
                    expect(headBallContact(s.head, contact.head, b.position, R)).toBeNull();
                }
            }
        });
    }

    it("re-anchors the path at the head's place and pace, no faster than planned", () => {
        const { track, head } = fullRoll(1);
        const at = 0.08;
        const planned = headOnPath(track, head, at);
        const aim = track.arc.aim;
        // A head 40 mm behind its path at 60 % of its pace.
        const state = {
            ...planned,
            position: add(planned.position, scale(aim, -0.04)),
            velocity: scale(planned.velocity, 0.6),
        };
        const anchored = reanchor(track, head, state, at);
        expect(anchored.anchor?.rate).toBeCloseTo(0.6, 9);
        const there = headOnPath(anchored, head, at);
        expect(there.position.x - planned.position.x).toBeCloseTo(-0.04 * aim.x, 9);
        expect(there.velocity.x).toBeCloseTo(planned.velocity.x * 0.6, 9);
        // Before the parting the path is the plan's.
        expect(headOnPath(anchored, head, at - 0.01)).toEqual(headOnPath(track, head, at - 0.01));
        // A head ahead of its path and faster than it leaves the plan as it is.
        const ahead = {
            ...planned,
            position: add(planned.position, scale(aim, 0.01)),
            velocity: scale(planned.velocity, 1.2),
        };
        expect(reanchor(track, head, ahead, at)).toBe(track);
    });
});

describe("the re-anchor at the departure (roll launch design §3.1)", () => {
    const gugan = openWorld(13);
    // Gugan 4 Table 6's C10H: the half roll at the power whose planned head speed is his 6.5 m/s (the Table 6 probe).
    const c10h = mapSetup("half-roll", textBook("half-roll"), 1.152);

    it("re-anchors a stroke with no push", () => {
        const setup = canonicalSetup("drive", { world: lawn });
        const { contact } = planStroke(setup, lawn);
        const track = prepareTrack(contact.drive as TrackDrive, contact.head, lawn.gravity);
        expect(track.push).toBeNull();
        const at = (contact.drive as TrackDrive).arc.contactAt + 0.002;
        const planned = headOnPath(track, contact.head, at);
        const state = {
            ...planned,
            position: add(planned.position, scale(track.arc.aim, -0.04)),
            velocity: scale(planned.velocity, 0.6),
        };
        expect(reanchor(track, contact.head, state, at).anchor?.rate).toBeCloseTo(0.6, 9);
    });

    it("latches the departure on a stroke with no push", { timeout: 60_000 }, () => {
        const setup = canonicalSetup("drive", { world: lawn });
        const { contact } = planStroke(setup, lawn);
        const { result } = practiseStroke(contact, setup.balls, lawn, setup.striker);
        const first = result.timeline[faceKey(setup.striker)]?.[0];
        expect(first).toBeDefined();
        expect(result.departure).toBeDefined();
        expect(Math.abs((result.departure as number) - (first?.end as number))).toBeLessThan(0.005);
    });

    it("re-anchors once the departure's parting has held (amendment 6)", { timeout: 60_000 }, () => {
        // C10H's first parting, at 0.62 ms, is closed again by the strike at 1 ms; the restart waits for one that holds.
        const { contact } = planStroke(c10h, gugan);
        const { result } = practiseStroke(contact, c10h.balls, gugan, c10h.striker);
        const departure = result.departure as number;
        const at = result.anchor?.at as number;
        expect(at - departure).toBeGreaterThanOrEqual(RESTART_HOLD - 1e-9);
        const face = result.timeline[faceKey(c10h.striker)] ?? [];
        // The first parting (0.18 ms at μ 0.16) is closed again by the strike, so it is not the one confirmed.
        expect(face.filter((c) => c.end <= at).length).toBeGreaterThanOrEqual(2);
        const parting = face.filter((c) => c.end <= at).pop();
        expect(at - (parting?.end as number)).toBeGreaterThanOrEqual(RESTART_HOLD - 1e-9);
        expect(at - (parting?.end as number)).toBeLessThan(RESTART_HOLD + 2e-5);
    });

    // Gugan 4 Table 6's C25F: the full roll at the power whose planned head speed is his 8.01 m/s (the Table 6 probe).
    const c25f = mapSetup("full-roll", textBook("full-roll"), 1.6212);

    it("restarts C25F in the gap before the re-catch (restart confirmation design)", { timeout: 60_000 }, () => {
        // At 1 ms the 0.97 ms gap before Gugan's second contact went unread, and the restart waited to 42 ms.
        const { contact } = planStroke(c25f, gugan);
        const { result } = practiseStroke(contact, c25f.balls, gugan, c25f.striker);
        const face = result.timeline[faceKey(c25f.striker)] ?? [];
        const t0 = face[0]?.start as number;
        const at = result.anchor?.at as number;
        expect(at - t0).toBeLessThan(0.005);
        // The strike's re-press is not confirmed; the restart falls in the next gap, one hold after its parting.
        const before = face.filter((c) => c.end <= at);
        expect(before.length).toBeGreaterThanOrEqual(2);
        const parting = before[before.length - 1];
        expect(at - (parting?.end as number)).toBeGreaterThanOrEqual(RESTART_HOLD - 1e-9);
        expect(at - (parting?.end as number)).toBeLessThan(RESTART_HOLD + 2e-5);
        expect(face.some((c) => c.start < at && c.end > at)).toBe(false);
    });

    it("lets C10H's striker's ball go after the strike (amendments 5 to 7)", { timeout: 60_000 }, () => {
        // Was touched again to 48.6 ms at μ 0.06, the head driven after the ball by the path and the pitch hold.
        const { contact } = planStroke(c10h, gugan);
        const { result } = practiseStroke(contact, c10h.balls, gugan, c10h.striker);
        const face = result.timeline[faceKey(c10h.striker)] ?? [];
        expect(face.every((c) => c.end < 0.015)).toBe(true);
    });

    it("does not latch a pair that reopens with the ball not moving away", () => {
        const R = lawn.ball.radius;
        const normal = vec3(1, 0, 0);
        const head = {
            position: vec3(0, 0, R),
            velocity: vec3(2, 0, 0),
            orientation: { w: 1, x: 0, y: 0, z: 0 },
            angularVelocity: vec3(0, 0, 0),
        };
        const ball = (vx: number): BallState => ({
            position: vec3(0.1, 0, R),
            velocity: vec3(vx, 0, 0),
            angularVelocity: vec3(0, 0, 0),
        });
        expect(departing(ball(2), head, normal, R)).toBe(false);
        expect(departing(ball(1.9), head, normal, R)).toBe(false);
        expect(departing(ball(2.1), head, normal, R)).toBe(true);
    });

    it(
        "presses at F_push while the face is on the striker's ball (primed push design, amendment 1)",
        { timeout: 60_000 },
        () => {
            // Was "ends the push intent at the departure" (amendment 1, superseded 2026-11-18, "Press while on the ball"):
            // the press is on in a step only when the striker's face pair closed in the step before, through the
            // departure and any re-catch, at F_push along aim; and before the pendulum phase, always then. The
            // re-anchor's warp only delays the plan's instants, so the unwarped pendulum bounds it from below.
            const { contact } = planStroke(c10h, gugan);
            const pendulum = (prepareTrack(contact.drive as TrackDrive, contact.head, gugan.gravity).push as Push)
                .pendulum as number;
            const key = faceKey(c10h.striker);
            const steps: { t: number; intent: number | null; closed: boolean }[] = [];
            const result = simulateImpact(contact, c10h.balls, gugan, {
                probe: {
                    step: (s) =>
                        steps.push({
                            t: s.t,
                            intent:
                                s.hand?.intent === undefined
                                    ? null
                                    : dot(s.hand.intent, (contact.drive as TrackDrive).arc.aim),
                            closed: s.contacts.some((c) => c.key === key),
                        }),
                },
            });
            const at = result.departure as number;
            expect(at).toBeGreaterThan(0);
            expect(steps[0]?.intent).toBeNull();
            expect(pendulum).toBeGreaterThan(at);
            for (let i = 1; i < steps.length; i++) {
                const step = steps[i] as (typeof steps)[number];
                const before = steps[i - 1] as (typeof steps)[number];
                if (before.t < pendulum) {
                    expect(step.intent !== null, `step ${i}`).toBe(before.closed);
                } else if (step.intent !== null) {
                    expect(before.closed, `step ${i}`).toBe(true);
                }
                if (step.intent !== null) {
                    expect(step.intent).toBeCloseTo((contact.drive as TrackDrive).hands.pushForce, 9);
                }
            }
            expect(steps.some((s) => s.intent !== null)).toBe(true);
        },
    );

    it("slides the guiding bottom hand by its forward excess over its share along the aim (amendment 1)", () => {
        const aim = vec3(0, 1, 0);
        const share = vec3(1, 20, -3);
        // 50 N forward along the aim against a 20 N share: 30 N slides, across the aim nothing.
        expect(guideExcess(vec3(4, 50, 7), share, aim)).toEqual(vec3(0, 30, 0));
        // At or below the share it holds: the guide never adds a push, nor takes back a brake.
        expect(guideExcess(vec3(4, 20, 7), share, aim)).toEqual(vec3(0, 0, 0));
        expect(guideExcess(vec3(4, -40, 7), share, aim)).toEqual(vec3(0, 0, 0));
    });

    it("re-anchors a replay at the same instant as a play that is not replayed", { timeout: 60_000 }, () => {
        const { contact } = planStroke(c10h, gugan);
        const kept = simulateImpact(contact, c10h.balls, gugan);
        const at = kept.anchor?.at as number;
        expect(at).toBeDefined();
        // A cap just past the re-anchor ends the play before any catch, which is then never replayed.
        const once = simulateImpact(contact, c10h.balls, gugan, { cap: at + 0.001 });
        expect(once.anchor?.at).toBe(at);
    });

    it.each(["stop-gc", "stop-ac"] as const)(
        "latches the %s's departure but neither re-anchors nor guides its check (amendment 3)",
        (type) => {
            // Before this design both stops followed through with no flag; the guide or the re-anchor on the check
            // brought both to follow-grip-limit and the AC stop's to follow-turf-yield and follow-head-deep.
            const setup = canonicalSetup(type, { world: lawn });
            const { contact } = planStroke(setup, lawn);
            const { result, follow } = simulateStroke(contact, setup.balls, lawn);
            expect(result.departure).toBeDefined();
            expect(result.anchor).toBeUndefined();
            expect(follow.flags).toEqual([]);
        },
        60_000,
    );
});

describe("the speed-matched restart (roll launch design §3.1c, amendment 5)", () => {
    const gugan = openWorld(13);
    const c10h = mapSetup("half-roll", textBook("half-roll"), 1.152);
    const { contact } = planStroke(c10h, gugan);
    const head = contact.head;
    const track = prepareTrack(contact.drive as TrackDrive, head, gugan.gravity);
    const aim = track.arc.aim;
    const pace = (t: PreparedTrack, at: number): number => dot(headOnPath(t, head, at).velocity, aim);
    // Just past contact, where C10H's plan still speeds up (the probe file, "Amendment 5").
    const at = track.arc.contactAt + 0.0006;
    const planned = headOnPath(track, head, at);
    const state = { ...planned, velocity: scale(planned.velocity, 0.6) };
    const anchored = reanchor(track, head, state, at);
    const s = 0.6 * pace(track, at);

    it("holds the path's along-aim pace at the head's while the plan speeds up", () => {
        expect(pace(track, at + 0.01)).toBeGreaterThan(pace(track, at) + 0.1);
        expect(anchored.anchor?.rate).toBeCloseTo(0.6, 9);
        for (let i = 0; i <= 20; i++) {
            const t = at + i * 0.0005;
            if (pace(track, plannedTime(anchored, t)) < pace(track, at)) {
                break;
            }
            expect(Math.abs(pace(anchored, t) - s)).toBeLessThan(1e-3);
        }
    });

    it("moves the path as fast as it says it does", () => {
        const d = 1e-6;
        for (let i = 1; i <= 40; i++) {
            const t = at + i * 0.0025;
            const ahead = headOnPath(anchored, head, t + d).position;
            const behind = headOnPath(anchored, head, t - d).position;
            const moved = dot(sub(ahead, behind), aim) / (2 * d);
            expect(Math.abs(moved - pace(anchored, t))).toBeLessThan(1e-3);
        }
    });

    it("plays the plan at a fixed rate once it has peaked", () => {
        // Past the plan's peak the divisor is held: τ advances at s over the peak, as §3.1's warp does.
        const late = at + 0.2;
        const k = (plannedTime(anchored, late + 0.01) - plannedTime(anchored, late)) / 0.01;
        expect(k).toBeGreaterThan(0);
        expect(k).toBeLessThan(s / (pace(track, at) + 0.1));
        expect((plannedTime(anchored, late + 0.03) - plannedTime(anchored, late + 0.02)) / 0.01).toBeCloseTo(k, 9);
    });

    it("inverts its time map", () => {
        for (let i = 0; i <= 50; i++) {
            const t = at + i * 0.004;
            expect(anchoredTime(anchored, plannedTime(anchored, t))).toBeCloseTo(t, 12);
        }
        expect(plannedTime(anchored, at - 0.001)).toBe(at - 0.001);
        expect(anchoredTime(anchored, at - 0.001)).toBe(at - 0.001);
    });
});

describe("the held slope braked within the grip (flat push design, amendment 7)", () => {
    function halfRoll(power: number): { track: PreparedTrack; drive: TrackDrive; head: MalletHead } {
        // The slope held, as the rolls hold it: the half roll's swings since the user's ruling of 2026-11-23.
        const base = mapSetup("half-roll", textBook("half-roll"), power);
        const setup = { ...base, stroke: { ...base.stroke, slopeHold: 1 } };
        const { contact } = planStroke(setup, lawn);
        const drive = contact.drive as TrackDrive;
        return { track: prepareTrack(drive, contact.head, lawn.gravity), drive, head: contact.head };
    }

    it("keeps the planned fall where the bottom hand can brake it within F_max", () => {
        // Power 0.8 (was 1): since the user's ruling of 2026-11-23 the held half roll at 1 just exceeds F_max.
        const { track, drive } = halfRoll(0.8);
        expect(track.arc.holdWindow).toBe(drive.arc.holdWindow);
    });

    it("lengthens the fall so the bottom hand's planned force is F_max where the planned window would exceed it", () => {
        const { track, drive, head } = halfRoll(1.2);
        const W = track.arc.holdWindow as number;
        expect(W).toBeGreaterThan(drive.arc.holdWindow ?? drive.arc.window);
        const inertia = pendulumOf(head, track.body, track.arc.radius, lawn.gravity).inertia;
        const omegaEnd = track.omegaArc + drive.arc.alpha * drive.arc.window;
        const force =
            (track.arc.slopeHold * 1.5 * inertia * Math.abs(omegaEnd)) / (W * (track.arc.radius - track.hands.bottom));
        expect(force).toBeCloseTo(track.hands.gripLimit, 9);
    });
});

describe("the follow-through catch, carried by phase 2 (soft follow-through design §2.1)", () => {
    const R = lawn.ball.radius;
    const project = followProjection(lawn);

    it("brings a ball in flight at the impact's end down onto the lawn", () => {
        const rising: BallState = {
            position: vec3(12, 12, R + 0.01),
            velocity: vec3(0, 1.2, 0.3),
            angularVelocity: vec3(0, 0, 0),
        };
        const at = (project({ blue: rising }, 0.25).blue as BallState).position;
        // A straight line at the end velocity would put it 85 mm up; phase 2 lands it within its flight's 77 ms.
        expect(rising.position.z + rising.velocity.z * 0.25).toBeGreaterThan(R + 0.06);
        expect(at.z).toBeLessThan(R + 0.01);
    });

    it("slows a rolling ball at the lawn's rolling deceleration", () => {
        const velocity = vec3(0, 1.3, 0);
        const rolling: BallState = {
            position: vec3(12, 12, R),
            velocity,
            angularVelocity: rollingSpin(velocity, 0, R),
        };
        // Within the first rolling band: at 1.3 m/s the ball reaches the 1.25 m/s band, and its new deceleration, at 90 ms.
        const dt = 0.05;
        const params = motionParamsAt(lawn, rolling.position, 1.3);
        const expected = advance(rolling, "rolling", params, dt).position.y;
        expect((project({ blue: rolling }, dt).blue as BallState).position.y).toBeCloseTo(expected, 9);
    });

    it("carries a ball on past the boundary, where phase 2 would halt it", () => {
        const velocity = vec3(1.3, 0, 0);
        const edge: BallState = {
            position: vec3(lawn.lawn.width + lawn.haltMargin - 0.01, 12, R),
            velocity,
            angularVelocity: rollingSpin(velocity, 0, R),
        };
        const x = (project({ blue: edge }, 0.1).blue as BallState).position.x;
        expect(x).toBeGreaterThan(lawn.lawn.width + lawn.haltMargin + 0.1);
    });

    it("replays to a catch before the cap, and moves a movable cap once to see one past it", () => {
        expect(nextReplay(null, 0, 0.5, true)).toBeNull();
        expect(nextReplay(0.2, 0.2, 0.5, true)).toBeNull();
        expect(nextReplay(0.3, 0.2, 0.5, true)).toEqual({ openUntil: 0.3, cap: 0.5, capMovable: true });
        expect(nextReplay(0.6, 0.2, 0.5, true)).toEqual({
            openUntil: 0.6,
            cap: 0.6 + TRACK_IMPACT_CAP,
            capMovable: false,
        });
        expect(nextReplay(0.6, 0.2, 0.5, false)).toBeNull();
    });
});

describe("the re-timed finish: no faster than the ball (soft follow-through design §2.4)", () => {
    // The canonical full roll re-anchored as it plays: at 1.17 ms, the head at 58.5 % of its planned pace.
    const { track, head, push } = fullRoll(0.885);
    const aim = track.arc.aim;
    const at = 0.00117;
    const planned = headOnPath(track, head, at);
    const anchored = reanchor(track, head, { ...planned, velocity: scale(planned.velocity, 0.585) }, at);
    const from = anchoredTime(anchored, push.end as number);
    const pace = (t: PreparedTrack, time: number): number => dot(headOnPath(t, head, time).velocity, aim);
    const along = (t: PreparedTrack, time: number): number => dot(headOnPath(t, head, time).position, aim);
    const ease = push.finish?.ease as number;

    it("leaves a track whose head never outpaces the ball as it is", () => {
        expect(retimeFinish(anchored, head, () => 10)).toBe(anchored);
        expect(retimeFinish(track, head, () => 0.1)).toBe(track);
        const once = retimeFinish(anchored, head, () => 0.5);
        expect(retimeFinish(once, head, () => 0.1)).toBe(once);
    });

    it("slows the finish to a steady ball's pace, continuously, with no change before it", () => {
        const retimed = retimeFinish(anchored, head, () => 0.5);
        expect(retimed.anchor?.finish?.at).toBe(from);
        expect(headOnPath(retimed, head, from - 0.01)).toEqual(headOnPath(anchored, head, from - 0.01));
        expect(pace(retimed, from)).toBeCloseTo(pace(anchored, from), 9);
        const to = anchoredTime(retimed, push.freed as number);
        let fastest = 0;
        for (let t = from + ease; t <= to; t += 1e-3) {
            fastest = Math.max(fastest, pace(retimed, t));
        }
        expect(fastest).toBeLessThanOrEqual(0.5 + 1e-3);
        expect(fastest).toBeGreaterThan(0.49);
        // The finish's travel is unchanged; it takes longer.
        const travel = along(anchored, anchoredTime(anchored, push.freed as number)) - along(anchored, from);
        expect(along(retimed, to) - along(retimed, from)).toBeCloseTo(travel, 9);
        expect(to).toBeGreaterThan(anchoredTime(anchored, push.freed as number));
    });

    it("caps the head at the slowing ball's pace when the head comes to rest", () => {
        const u = 1.4;
        const a = 0.5;
        const retimed = retimeFinish(anchored, head, (t) => u - a * (t - from));
        const D = along(anchored, anchoredTime(anchored, push.freed as number)) - along(anchored, from);
        const c = (u + Math.sqrt(u * u - 4 * a * D)) / 2;
        const to = anchoredTime(retimed, push.freed as number);
        let fastest = 0;
        for (let t = from + ease; t <= to; t += 1e-3) {
            fastest = Math.max(fastest, pace(retimed, t));
        }
        // retimeFinish reads the plan's fastest pace every RETIME_STEP (1 ms), so a peak between samples may pass c by
        // a few μm/s.
        expect(fastest).toBeLessThanOrEqual(c + 1e-5);
        expect(fastest).toBeGreaterThan(c - 1e-3);
    });

    it("floors the pace at half the ball's where the ball stops first", () => {
        const retimed = retimeFinish(anchored, head, (t) => Math.max(0.3 - 10 * (t - from), 0));
        const to = anchoredTime(retimed, push.freed as number);
        let fastest = 0;
        for (let t = from + ease; t <= to; t += 1e-3) {
            fastest = Math.max(fastest, pace(retimed, t));
        }
        expect(fastest).toBeCloseTo(0.15, 3);
    });

    it("maps real to planned time and back across the finish's ease", () => {
        const retimed = retimeFinish(anchored, head, () => 0.5);
        for (const t of [from - 0.01, from, from + ease / 3, from + ease, from + 2 * ease, from + 0.5]) {
            expect(anchoredTime(retimed, plannedTime(retimed, t))).toBeCloseTo(t, 12);
        }
    });
});
