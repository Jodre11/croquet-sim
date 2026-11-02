import { describe, expect, it } from "vitest";
import { liftAt } from "../../../src/engine/impact/lift";
import { handsAt, prepareTrack } from "../../../src/engine/impact/track";
import { validateImpact } from "../../../src/engine/impact/simulateImpact";
import type { ContactState, Lift, SwingArc, TrackDrive } from "../../../src/engine/impact/types";
import type { World } from "../../../src/engine/types";
import { planStroke } from "../../../src/engine/swing/buildContact";
import { openWorld } from "../../../scripts/openLawn";
import { mapSetup, textBook } from "../../../scripts/pushMapRun";

/** Today's full roll (the push map's text book at power 0.1535, as scripts/pathTrace.ts builds it). */
function fullRoll(): { readonly contact: ContactState; readonly lawn: World } {
    const lawn = openWorld(10);
    return { contact: planStroke(mapSetup("full-roll", textBook("full-roll"), 0.1535), lawn).contact, lawn };
}

/** The full roll's contact with its arc replaced. */
function withArc(contact: ContactState, arc: SwingArc): ContactState {
    const drive = contact.drive as TrackDrive;
    return { ...contact, drive: { ...drive, arc } };
}

describe("the lift (P2b.2b.2c.3b.1 design §4)", () => {
    it("liftAt interpolates, holds and starts at rest", () => {
        const lift: Lift = { from: 0.1, step: 0.001, values: [0, 0.001, 0.003, 0.002] };
        lift.values.forEach((value, i) => {
            expect(Math.abs(liftAt(lift, 0.1 + i * 0.001).z - value), `sample ${i}`).toBeLessThan(1e-12);
        });
        const left = liftAt(lift, 0.1015 - 1e-14);
        const right = liftAt(lift, 0.1015 + 1e-14);
        expect(Math.abs(left.z - right.z)).toBeLessThan(1e-9);
        expect(Math.abs(left.v - right.v)).toBeLessThan(1e-9);
        // Continuous across a sample too, where the cubic pieces meet.
        const below = liftAt(lift, 0.102 - 1e-14);
        const above = liftAt(lift, 0.102 + 1e-14);
        expect(Math.abs(below.z - above.z)).toBeLessThan(1e-9);
        expect(Math.abs(below.v - above.v)).toBeLessThan(1e-9);
        for (const t of [0, 0.05, 0.1 - 1e-9]) {
            expect(liftAt(lift, t), `at ${t}`).toEqual({ z: 0, v: 0, a: 0 });
        }
        // Review focus 4: past the last sample it holds its last value, V and A zero.
        for (const t of [0.103 + 1e-12, 0.1031, 0.2, 5]) {
            expect(liftAt(lift, t), `at ${t}`).toEqual({ z: 0.002, v: 0, a: 0 });
        }
        // The end slopes are 0: the pace at the first and last samples is 0.
        expect(liftAt(lift, 0.1).v).toBe(0);
        expect(Math.abs(liftAt(lift, 0.103 - 1e-12).v)).toBeLessThan(1e-6);
    });

    it("pivotAt carries the lift", () => {
        const { contact, lawn } = fullRoll();
        const drive = contact.drive as TrackDrive;
        const t = drive.arc.contactAt + 0.05;
        const plain = prepareTrack(drive, contact.head, lawn.gravity);
        const lift: Lift = { from: 0, step: 0.01, values: Array<number>(100).fill(0.01) };
        const lifted = prepareTrack({ ...drive, arc: { ...drive.arc, lift } }, contact.head, lawn.gravity);
        const before = handsAt(plain, t);
        const after = handsAt(lifted, t);
        expect(Math.abs(after.position.z - before.position.z - 0.01)).toBeLessThan(1e-12);
        expect(after.position.x).toBe(before.position.x);
        expect(after.position.y).toBe(before.position.y);
        expect(after.velocity).toEqual(before.velocity);
    });

    it("validation rejects a lift that cannot be read", () => {
        const { contact, lawn } = fullRoll();
        const { arc } = contact.drive as TrackDrive;
        for (const [lift, pattern] of [
            [{ from: 0.1, step: 0.001, values: [0, Number.NaN] }, /arc\.lift\.values\[1\] must be finite/],
            [
                { from: 0.1, step: 0.001, values: [0, Number.POSITIVE_INFINITY] },
                /arc\.lift\.values\[1\] must be finite/,
            ],
            [{ from: Number.NaN, step: 0.001, values: [0] }, /arc\.lift\.from must be finite/],
            [{ from: 0.1, step: 0, values: [0] }, /arc\.lift\.step must be a positive finite number/],
            [{ from: 0.1, step: -0.001, values: [0] }, /arc\.lift\.step must be a positive finite number/],
            [{ from: 0.1, step: 0.001, values: [] }, /arc\.lift\.values must not be empty/],
        ] as const) {
            expect(() => validateImpact(withArc(contact, { ...arc, lift }), {}, lawn)).toThrow(pattern);
        }
    });
});
