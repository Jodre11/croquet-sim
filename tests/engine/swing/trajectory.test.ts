import { describe, expect, it } from "vitest";
import { FOLLOW_SAMPLE, IMPACT_DT } from "../../../src/engine/impact/integrate";
import { rotate } from "../../../src/engine/impact/rigidBody";
import {
    downswingAt,
    downswingHands,
    handsAt,
    pitchAxis,
    prepareTrack,
    swingOrientation,
} from "../../../src/engine/impact/track";
import type { Downswing, TrackDrive } from "../../../src/engine/impact/types";
import { sinCos } from "../../../src/engine/math/elementary";
import { add, cross, dot, length, scale, sub, vec3 } from "../../../src/engine/math/vec3";
import { simulateShot } from "../../../src/engine/shot";
import { strokeTrajectory, type StrokeSample, type SwingTrajectory } from "../../../src/engine/swing/trajectory";
import type { BallState } from "../../../src/engine/types";
import { defaultWorld } from "../../../src/engine/world";
import { canonicalSetup } from "../support/shot";
import { POSITION_SLACK, boundaryJumps } from "../support/trajectory";

const WORLD = defaultWorld();
const setup = canonicalSetup("drive", { world: WORLD });
const outcome = simulateShot(setup, WORLD, { trajectory: true });
const trajectory = outcome.trajectory as SwingTrajectory;
const drive = outcome.contact.drive as TrackDrive;
const down = drive.arc.downswing as Downswing;
const head = outcome.contact.head;
const UP = vec3(0, 0, 1);

describe("strokeTrajectory (design §4.3)", () => {
    it("runs from the release through the impact to the finish, in time order", () => {
        expect(trajectory.release).toBe(down.release);
        expect(trajectory.impactStart).toBe(0 - drive.arc.contactAt);
        expect(trajectory.impactEnd).toBeCloseTo(outcome.impact.duration - drive.arc.contactAt, 12);
        expect(trajectory.finish).toBeGreaterThanOrEqual(trajectory.impactEnd);
        const { samples } = trajectory;
        expect((samples[0] as StrokeSample).t).toBeCloseTo(trajectory.release, 12);
        expect((samples[samples.length - 1] as StrokeSample).t).toBeCloseTo(trajectory.finish, 12);
        for (let i = 1; i < samples.length; i++) {
            const gap = (samples[i] as StrokeSample).t - (samples[i - 1] as StrokeSample).t;
            expect(gap).toBeGreaterThanOrEqual(1e-9);
            expect(gap).toBeLessThanOrEqual(FOLLOW_SAMPLE + 1e-12);
        }
    });

    it.each([Math.PI / 2, Math.PI, 0 - Math.PI / 2, 7])(
        "starts at the backswing's top, aim %f rad: the head at rest behind the ball, the top hand at P_b",
        (aim) => {
            // The backswing lifts the head back along −aim, in the vertical plane through the ball (side 0).
            const shot = canonicalSetup("single-ball", { world: WORLD, stroke: { aim } });
            const traced = simulateShot(shot, WORLD, { trajectory: true });
            const swing = (traced.contact.drive as TrackDrive).arc;
            const first = (traced.trajectory as SwingTrajectory).samples[0] as StrokeSample;
            const [s, c] = sinCos(aim);
            const forward = vec3(c, s, 0);
            const ball = (shot.balls.blue as BallState).position;
            expect(first.t).toBe(swing.downswing?.release);
            expect(length(first.velocity)).toBeLessThan(1e-12);
            expect(length(sub(first.top, (swing.downswing as Downswing).handsTop))).toBeLessThan(1e-9);
            expect(dot(sub(first.head, ball), forward)).toBeLessThan(0 - head.length);
            expect(Math.abs(dot(sub(first.head, ball), vec3(0 - s, c, 0)))).toBeLessThan(1e-9);
        },
    );

    it("puts the top hand on the planned pivot before the impact", () => {
        // handsAt is the pivot the path is built from; the samples' `top` comes back along the shaft from the head.
        const track = prepareTrack(drive, head, WORLD.gravity);
        const before = trajectory.samples.filter((s) => s.t < trajectory.impactStart);
        expect(before.length).toBeGreaterThan(100);
        for (const s of before) {
            expect(length(sub(s.top, handsAt(track, s.t + drive.arc.contactAt).position))).toBeLessThan(1e-9);
        }
    });

    it("starts the impact where the downswing has the head, as scanDownswing places it", () => {
        // The downswing's own pendulum and hands at the impact's start (s from contact), carried to the head.
        const t = trajectory.impactStart;
        const start = trajectory.samples.find((s) => s.t === t) as StrokeSample;
        const { aim, radius } = drive.arc;
        const swing = downswingAt(down, t);
        const hands = downswingHands(down, t, swing);
        const [s, c] = sinCos(swing.theta);
        const radial = sub(scale(aim, s), scale(UP, c));
        const tangent = add(scale(aim, c), scale(UP, s));
        const orientation = swingOrientation(aim, swing.theta);
        const d = rotate(orientation, sub(vec3(0, 0, 0), head.socket));
        const position = add(add(hands.P, scale(radial, radius)), d);
        const velocity = add(
            add(hands.V, scale(tangent, radius * swing.omega)),
            cross(scale(pitchAxis(aim), swing.omega), d),
        );
        expect(length(sub(start.head, position))).toBeLessThan(1e-9);
        expect(length(sub(start.velocity, velocity))).toBeLessThan(1e-9);
    });

    it("is continuous at every segment boundary (exit criterion 3)", () => {
        const jumps = boundaryJumps(trajectory, drive);
        expect(jumps.map((j) => j.name)).toEqual(["release", "impact start", "impact end"]);
        for (const jump of jumps) {
            expect(jump.position, jump.name).toBeLessThanOrEqual(POSITION_SLACK);
            expect(jump.velocity, jump.name).toBeLessThanOrEqual(jump.bound);
        }
    });

    it("starts at the impact's start, the head at rest at the top, when the lead outlasts the downswing", () => {
        // A full roll with a 0.13 s hands' tempo (release 0.13 s before contact) and its arc 0.1455 s early: the
        // impact starts 15.5 ms before the release, the hands still at the top, so no downswing samples come first.
        // The release falls midway between two 1 ms samples, and carry mode's hands start accelerating there (the
        // head's acceleration steps from ~38 to ~205 m/s²): without a sample at it the trapezoid rule across it
        // misses by ~Δa·Δt²/8, about 20 µm. The integrator samples its first step at or after the release instead.
        const shot = canonicalSetup("full-roll", {
            world: WORLD,
            shape: { handTempo: { slow: 0.13, fast: 0.065 } },
            stroke: { timing: { arc: -0.1455, hands: 0, dip: 0 } },
        });
        const traced = simulateShot(shot, WORLD, { trajectory: true });
        const late = traced.trajectory as SwingTrajectory;
        const roll = traced.contact.drive as TrackDrive;
        const first = late.samples[0] as StrokeSample;
        expect(late.release).toBeGreaterThan(late.impactStart);
        expect(late.flags).not.toContain("follow-cap");
        expect(first.t).toBe(late.impactStart);
        expect(length(first.velocity)).toBe(0);
        expect(length(sub(first.top, (roll.arc.downswing as Downswing).handsTop))).toBeLessThan(1e-9);
        const release = late.samples.find((s) => s.t >= late.release) as StrokeSample;
        expect(release.t - late.release).toBeLessThanOrEqual(IMPACT_DT + 1e-12);
        const jumps = boundaryJumps(late, roll);
        expect(jumps.map((j) => j.name)).toEqual(["release", "impact end"]);
        for (const jump of jumps) {
            expect(jump.position, jump.name).toBeLessThanOrEqual(POSITION_SLACK);
            expect(jump.velocity, jump.name).toBeLessThanOrEqual(jump.bound);
        }
    });

    it("throws a RangeError for a contact state with no downswing", () => {
        const { downswing, ...coast } = drive.arc;
        expect(downswing).toBeDefined();
        const bare = { ...outcome.contact, drive: { ...drive, arc: coast } };
        const none = { samples: [], impactEnd: 0, finish: 0, flags: [] };
        expect(() => strokeTrajectory(bare, none, WORLD.gravity)).toThrow(/needs a tracked contact state/);
    });

    it("keeps both hands on the shaft, the head's up axis, the grips the stance's distances from the head", () => {
        // From the profile, not the drive: the socket ρ = d/2 above the head's centre, the hands `top` and `bottom`
        // from it, all on a line square to the head's length (body x).
        const stance = setup.profile.stance.drive;
        const rho = setup.profile.mallet.headDiameter / 2;
        for (const s of trajectory.samples) {
            const toTop = sub(s.top, s.head);
            const toBottom = sub(s.bottom, s.head);
            expect(Math.abs(length(toTop) - (rho + stance.top))).toBeLessThan(1e-12);
            expect(Math.abs(length(toBottom) - (rho + stance.bottom))).toBeLessThan(1e-12);
            expect(length(cross(toTop, toBottom))).toBeLessThan(1e-12);
            expect(dot(toTop, toBottom)).toBeGreaterThan(0);
            expect(Math.abs(dot(toTop, rotate(s.orientation, vec3(1, 0, 0))))).toBeLessThan(1e-12);
        }
    });
});
