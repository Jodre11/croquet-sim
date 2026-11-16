import { describe, expect, it } from "vitest";
import { faceKey, headBallContact, headLowestPoint } from "../../../src/engine/impact/contacts";
import { departing } from "../../../src/engine/impact/integrate";
import { practiseStroke } from "../../../src/engine/impact/practice";
import { simulateImpact, simulateStroke } from "../../../src/engine/impact/simulateImpact";
import {
    guideExcess,
    handsAt,
    headDepth,
    headDepthTerms,
    headOnPath,
    pathAt,
    pendulumOf,
    prepareTrack,
    reanchor,
    swingOrientation,
    type PreparedTrack,
    type Push,
} from "../../../src/engine/impact/track";
import type { MalletHead, TrackDrive } from "../../../src/engine/impact/types";
import { add, scale, vec3 } from "../../../src/engine/math/vec3";
import { planStroke } from "../../../src/engine/swing/buildContact";
import type { BallState } from "../../../src/engine/types";
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
            expect(follow.impactEnd).toBeLessThan(type === "full-roll" ? 0.22 : 0.11);
            expect(result.events.map((e) => e.kind)).not.toContain("impact-off-face");
            const R = lawn.ball.radius;
            const balls = Object.values(result.balls).filter((b) => b !== undefined);
            for (const s of follow.samples.filter((x) => x.t > follow.impactEnd)) {
                for (const b of balls) {
                    const centre = add(b.position, scale(b.velocity, s.t - follow.impactEnd));
                    expect(headBallContact(s.head, contact.head, centre, R)).toBeNull();
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

    it("re-anchors at the departure, not the parting", { timeout: 60_000 }, () => {
        const { contact } = planStroke(c10h, gugan);
        const { result } = practiseStroke(contact, c10h.balls, gugan, c10h.striker);
        expect(result.departure).toBeDefined();
        expect(result.anchor?.at).toBe(result.departure);
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

    it("ends the push intent at the departure (amendment 1)", { timeout: 60_000 }, () => {
        const { contact } = planStroke(c10h, gugan);
        const intents: { t: number; intent: boolean }[] = [];
        const result = simulateImpact(contact, c10h.balls, gugan, {
            probe: { step: (s) => intents.push({ t: s.t, intent: s.hand?.intent !== undefined }) },
        });
        const at = result.departure as number;
        expect(intents.some((s) => s.t <= at && s.intent)).toBe(true);
        // The latch falls in the pair loop of the step that begins at `at`, after that step's hands: the next step on.
        expect(intents.filter((s) => s.t > at + 1e-5 && s.intent)).toEqual([]);
    });

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

describe("the held slope braked within the grip (flat push design, amendment 7)", () => {
    function halfRoll(power: number): { track: PreparedTrack; drive: TrackDrive; head: MalletHead } {
        const setup = mapSetup("half-roll", textBook("half-roll"), power);
        const { contact } = planStroke(setup, lawn);
        const drive = contact.drive as TrackDrive;
        return { track: prepareTrack(drive, contact.head, lawn.gravity), drive, head: contact.head };
    }

    it("keeps the planned fall where the bottom hand can brake it within F_max", () => {
        const { track, drive } = halfRoll(1);
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
