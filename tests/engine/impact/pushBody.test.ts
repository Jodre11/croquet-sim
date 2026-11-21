import { describe, expect, it } from "vitest";
import {
    anchoredTime,
    bodyEnds,
    bodyStroke,
    closeBody,
    pathAt,
    plannedTime,
    prepareTrack,
    stepBody,
    withBody,
    type BodyClock,
    type BodyLoad,
    type PreparedTrack,
} from "../../../src/engine/impact/track";
import type { TrackDrive } from "../../../src/engine/impact/types";
import { dot, length, sub, ZERO } from "../../../src/engine/math/vec3";
import { planStroke } from "../../../src/engine/swing/buildContact";
import { openWorld } from "../../../scripts/openLawn";
import { canonicalPower, mapSetup, textBook } from "../../../scripts/pushMapRun";
import { simulateStroke } from "../../../src/engine/impact/simulateImpact";
import { VISIBLE_DEPARTURE, type ImpactProbe } from "../../../src/engine/impact/integrate";
import { faceClearance } from "../../../src/engine/impact/contacts";
import { BALL_IDS } from "../../../src/engine/types";
import { ON_TIME } from "../../../src/engine/swing/profile";
import { defaultWorld } from "../../../src/engine/world";
import { backswingFor, canonicalSetup } from "../support/shot";

const lawn = openWorld(10);
const DT = 1e-5;

/** The canonical full roll's prepared track, with `pushBodyMass` set to `mass` (kg). */
function fullRoll(mass = 2.9): PreparedTrack {
    const setup = mapSetup("full-roll", textBook("full-roll"), 1);
    const { contact } = planStroke(setup, lawn);
    const track = prepareTrack(contact.drive as TrackDrive, contact.head, lawn.gravity);
    return { ...track, hands: { ...track.hands, pushBodyMass: mass } };
}

function load(coupling: number, press: number): BodyLoad {
    return { coupling, press };
}

function clockOf(track: PreparedTrack): BodyClock {
    return track.anchor?.body as BodyClock;
}

/** The canonical `type`'s stroke on the 10 s lawn, its hands' body mass set to `mass` (kg). */
function played(type: "full-roll" | "pass-roll", mass = 2.9) {
    const setup = mapSetup(type, textBook(type), canonicalPower(type, lawn));
    const { contact } = planStroke(setup, lawn);
    const drive = contact.drive as TrackDrive;
    const held = { ...contact, drive: { ...drive, hands: { ...drive.hands, pushBodyMass: mass } } };
    return simulateStroke(held, setup.balls, lawn);
}

describe("the body behind the push in the impact (push body design §2.2–§2.4)", () => {
    it("hands over after the departure, moving, with a finite finish", () => {
        for (const type of ["full-roll", "pass-roll"] as const) {
            const { result, follow } = played(type);
            const anchor = result.anchor as { at: number; rate: number };
            expect(anchor.at).toBeGreaterThan(result.departure as number);
            expect(anchor.rate).toBeGreaterThan(0);
            expect(Number.isFinite(anchor.rate)).toBe(true);
            expect(Number.isFinite(follow.finish)).toBe(true);
            expect(follow.samples.every((s) => Number.isFinite(s.head.position.x))).toBe(true);
        }
    });

    it("presses from the strike until the striker's ball is 10 mm clear of the face, and never again", () => {
        for (const type of ["full-roll", "pass-roll"] as const) {
            const setup = mapSetup(type, textBook(type), canonicalPower(type, lawn));
            const { contact } = planStroke(setup, lawn);
            const drive = contact.drive as TrackDrive;
            const one = BALL_IDS.filter((id) => setup.balls[id] !== undefined).indexOf(setup.striker);
            const steps: { t: number; on: boolean; clearance: number }[] = [];
            const probe: ImpactProbe = {
                step(st) {
                    const ball = st.balls[one];
                    if (ball === undefined) return;
                    const on = st.hand?.intent !== undefined && length(st.hand.intent) > 0;
                    steps.push({
                        t: st.t,
                        on,
                        clearance: faceClearance(st.head, contact.head, ball.position, lawn.ball.radius),
                    });
                },
            };
            const { result } = simulateStroke(contact, setup.balls, lawn, { probe });
            const first = steps.findIndex((s) => s.on);
            const last = steps.length - 1 - [...steps].reverse().findIndex((s) => s.on);
            expect(first).toBeGreaterThanOrEqual(0);
            expect(steps.slice(first, last + 1).every((s) => s.on)).toBe(true);
            expect((steps[last] as { t: number }).t).toBeGreaterThan(result.departure as number);
            expect((steps[last] as { clearance: number }).clearance).toBeLessThan(VISIBLE_DEPARTURE + 1e-4);
            const after = steps[last + 1];
            const pendulum = prepareTrack(drive, contact.head, lawn.gravity).push?.pendulum ?? null;
            if (after !== undefined && (pendulum === null || after.t < pendulum)) {
                expect(after.clearance).toBeGreaterThan(VISIBLE_DEPARTURE - 1e-4);
            }
        }
    });

    it("keeps the plan's pace with an infinite mass", () => {
        const { result } = played("full-roll", Infinity);
        expect((result.anchor as { rate: number }).rate).toBe(1);
    });

    it("plays a run twice to the bit: the clock is the run's own", () => {
        const a = played("full-roll");
        const b = played("full-roll");
        expect(JSON.stringify(b.follow.samples)).toBe(JSON.stringify(a.follow.samples));
        expect(b.result.anchor).toEqual(a.result.anchor);
    });

    it("keeps a firm-grip stroke's body bounded: the step is implicit in the grips' damping", () => {
        // The single-ball stroke with a push struck on the firm grip ran its clock away (rate 7428 within 0.1 ms) and
        // hung the impact when δ stepped explicitly.
        const world = defaultWorld();
        const base = canonicalSetup("single-ball", { stroke: { handReach: 0.3, timing: { ...ON_TIME, advance: 0 } } });
        const setup = { ...base, stroke: { ...base.stroke, backswing: backswingFor(base, 3, world) } };
        const { contact } = planStroke(setup, world);
        const { result } = simulateStroke(contact, setup.balls, world);
        const rate = (result.anchor as { rate: number }).rate;
        expect(rate).toBeGreaterThan(0);
        expect(rate).toBeLessThan(2);
        expect(Number.isFinite(result.head.position.x)).toBe(true);
    });
});

describe("the body behind the push's clock (push body design §2.1, §2.2)", () => {
    it("gates the full roll in and a check out", () => {
        const roll = fullRoll();
        expect(bodyStroke(roll)).toBe(true);
        expect(bodyStroke({ ...roll, arc: { ...roll.arc, alpha: -1 } })).toBe(false);
        expect(bodyStroke({ ...roll, push: null })).toBe(false);
    });

    it("reads a clock of constant rate 0.6 as the fixed-rate anchor at 0.6", () => {
        const roll = fullRoll();
        const at = roll.arc.contactAt;
        const body = withBody(roll, at, DT);
        const clock = clockOf(body);
        for (let i = 1; i <= 200; i++) {
            clock.tau.push(at + 0.6 * i * DT);
            clock.rate.push(0.6);
            clock.slope.push(0);
        }
        clock.rate[0] = 0.6;
        const fixed: PreparedTrack = { ...roll, anchor: { at, rate: 0.6, by: ZERO, warp: null } };
        for (const t of [at, at + 37.5 * DT, at + 100 * DT, at + 199.25 * DT]) {
            expect(plannedTime(body, t)).toBeCloseTo(plannedTime(fixed, t), 12);
            const a = pathAt(body, t);
            const b = pathAt(fixed, t);
            expect(length(sub(a.socket, b.socket))).toBeLessThan(1e-12);
            expect(length(sub(a.socketVelocity, b.socketVelocity))).toBeLessThan(1e-12);
        }
        for (const planned of [at + 0.6 * 50.5 * DT, at + 0.6 * 150 * DT]) {
            expect(anchoredTime(body, planned)).toBeCloseTo(anchoredTime(fixed, planned), 12);
        }
    });

    it("keeps the plan's path with no load: δ stays 0 and the path is the plan's", () => {
        const roll = fullRoll();
        const at = roll.arc.contactAt;
        const body = withBody(roll, at, DT);
        for (let i = 0; i < 300; i++) {
            stepBody(body, load(0, 0), DT);
        }
        expect(clockOf(body).deficit).toBe(0);
        for (const t of [at + 10 * DT, at + 250 * DT]) {
            expect(length(sub(pathAt(body, t).socket, pathAt(roll, t).socket))).toBeLessThan(1e-12);
        }
    });

    it("grows δ at (F_g − F_press)/M_b, and below the press falls through 0 to a lead", () => {
        const roll = fullRoll(2.9);
        const body = withBody(roll, roll.arc.contactAt, DT);
        for (let i = 0; i < 100; i++) {
            stepBody(body, load(150, 92.2), DT);
        }
        const slowed = (100 * DT * (150 - 92.2)) / 2.9;
        expect(clockOf(body).deficit).toBeCloseTo(slowed, 9);
        for (let i = 0; i < 200; i++) {
            stepBody(body, load(50, 92.2), DT);
        }
        expect(clockOf(body).deficit).toBeCloseTo(slowed - (200 * DT * (92.2 - 50)) / 2.9, 9);
        expect(clockOf(body).deficit).toBeLessThan(0);
        expect(clockOf(body).rate.at(-1) as number).toBeGreaterThan(1);
    });

    it("decays a lead at F_g/M_b once the press has ended", () => {
        const roll = fullRoll(2.9);
        const led = withBody(roll, roll.arc.contactAt, DT);
        for (let i = 0; i < 100; i++) {
            stepBody(led, load(0, 92.2), DT);
        }
        const lead = clockOf(led).deficit;
        expect(lead).toBeCloseTo((-100 * DT * 92.2) / 2.9, 9);
        for (let i = 0; i < 10; i++) {
            stepBody(led, load(29, 0), DT);
        }
        expect(clockOf(led).deficit).toBeCloseTo(lead + (10 * DT * 29) / 2.9, 9);
    });

    it("regains the plan's pace under the press once the load falls below it", () => {
        const roll = fullRoll(2.9);
        const body = withBody(roll, roll.arc.contactAt, DT);
        for (let i = 0; i < 100; i++) {
            stepBody(body, load(300, 92.2), DT);
        }
        const slowed = clockOf(body).deficit;
        for (let i = 0; i < 10; i++) {
            stepBody(body, load(0, 92.2), DT);
        }
        expect(clockOf(body).deficit).toBeLessThan(slowed);
        expect(clockOf(body).deficit).toBeGreaterThanOrEqual(0);
    });

    it("leaves δ at 0 with an infinite mass", () => {
        const roll = fullRoll(Infinity);
        const body = withBody(roll, roll.arc.contactAt, DT);
        for (let i = 0; i < 100; i++) {
            stepBody(body, load(1e4, 0), DT);
        }
        expect(clockOf(body).deficit).toBe(0);
        expect(clockOf(body).rate.every((r) => r === 1)).toBe(true);
    });

    it("hands over continuously in place and pace, and holds its last rate after", () => {
        const roll = fullRoll(2.9);
        const at = roll.arc.contactAt;
        const body = withBody(roll, at, DT);
        for (let i = 0; i < 200; i++) {
            stepBody(body, load(400, 92.2), DT);
        }
        const end = at + 200 * DT;
        const before = pathAt(body, end);
        closeBody(body, end);
        const after = pathAt(body, end);
        expect(length(sub(before.socket, after.socket))).toBeLessThan(1e-12);
        expect(length(sub(before.socketVelocity, after.socketVelocity))).toBeLessThan(1e-12);
        const rate = clockOf(body).rate[200] as number;
        expect(plannedTime(body, end + 1e-3) - plannedTime(body, end)).toBeCloseTo(rate * 1e-3, 12);
        expect(bodyEnds(body, end + 1e-3)).toBe(false);
    });

    it("never reaches a later plan instant once the closed clock's rate is 0", () => {
        const roll = fullRoll(0.9);
        const at = roll.arc.contactAt;
        const body = withBody(roll, at, DT);
        const aim = roll.arc.aim;
        for (let i = 0; i < 20000 && (clockOf(body).rate.at(-1) as number) > 0; i++) {
            stepBody(body, load(1e5, 0), DT);
        }
        const last = clockOf(body).tau.length - 1;
        expect(clockOf(body).rate[last]).toBe(0);
        const end = at + last * DT;
        expect(bodyEnds(body, end)).toBe(true);
        closeBody(body, end);
        expect(anchoredTime(body, (clockOf(body).tau[last] as number) + 1e-3)).toBe(Infinity);
        expect(Number.isFinite(dot(pathAt(body, end + 0.1).socketVelocity, aim))).toBe(true);
    });
});
