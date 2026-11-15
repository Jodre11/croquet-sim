import { describe, expect, it } from "vitest";
import { headLowestPoint } from "../../../src/engine/impact/contacts";
import {
    handsAt,
    headDepth,
    headDepthTerms,
    headOnPath,
    pathAt,
    prepareTrack,
    swingOrientation,
    type PreparedTrack,
    type Push,
} from "../../../src/engine/impact/track";
import type { MalletHead, TrackDrive } from "../../../src/engine/impact/types";
import { vec3 } from "../../../src/engine/math/vec3";
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
