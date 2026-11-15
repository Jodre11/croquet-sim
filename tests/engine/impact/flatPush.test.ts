import { describe, expect, it } from "vitest";
import { headBallContact, headLowestPoint } from "../../../src/engine/impact/contacts";
import { practiseStroke } from "../../../src/engine/impact/practice";
import {
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
            // The impact ends at its first parting: no catch was replayed.
            expect(follow.impactEnd).toBeLessThan(0.11);
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
        const ahead = { ...planned, position: add(planned.position, scale(aim, 0.01)), velocity: scale(planned.velocity, 1.2) };
        expect(reanchor(track, head, ahead, at)).toBe(track);
    });
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
