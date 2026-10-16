import { describe, expect, it } from "vitest";
import {
    FINISH_SPEED,
    FOLLOW_CAP,
    FOLLOW_SAMPLE,
    HEAD_DEEP_LIMIT,
    type FollowThrough,
    type StrokeState,
} from "../../../src/engine/impact/integrate";
import { headLowestPoint } from "../../../src/engine/impact/contacts";
import { simulateImpact, simulateStroke } from "../../../src/engine/impact/simulateImpact";
import { HAND_COUPLING, handsAt, pitchAxis, prepareTrack, type Push } from "../../../src/engine/impact/track";
import type { ContactState, TrackDrive } from "../../../src/engine/impact/types";
import { dot, length, sub } from "../../../src/engine/math/vec3";
import { buildContact } from "../../../src/engine/swing/buildContact";
import { ON_TIME } from "../../../src/engine/swing/profile";
import type { ShotSetup, SwingProfile } from "../../../src/engine/swing/types";
import type { World } from "../../../src/engine/types";
import { defaultWorld } from "../../../src/engine/world";
import { ballAt, testWorld } from "../support/fixtures";
import { TEST_GRIP_LIMIT } from "../support/impact";
import { canonicalSetup, testProfile } from "../support/shot";

const WORLD = testWorld();

/** A test-profile stroke at blue (5, 3), aim 0.4, 0.5 m back (about 3.1 m/s), on time. */
function shot(stroke: Partial<ShotSetup["stroke"]> = {}, profile: SwingProfile = testProfile()): ShotSetup {
    return {
        balls: { blue: ballAt(5, 3) },
        striker: "blue",
        stroke: {
            type: "single-ball",
            aim: 0.4,
            backswing: 0.5,
            drive: 0,
            contact: { up: 0, side: 0 },
            timing: ON_TIME,
            ...stroke,
        },
        live: [],
        continuation: false,
        hampered: false,
        jumpAttempt: false,
        lawnSpeed: 10,
        profile,
    };
}

/**
 * A carry with moving hands: half the backswing from the hands, a 0.15 m reach; 0.25 m back, about 3.45 m/s
 * (plannedSpeed): the pendulum's about 2.31 m/s plus the hands' about 1.14 m/s.
 */
const CARRY = testProfile({ drive: { mode: "carry", handReach: 0.15 }, shape: { pendulumShare: 0.5 } });

function stroke(setup: ShotSetup, world: World = WORLD, dt?: number) {
    const contact = buildContact(setup, world);
    return { contact, ...simulateStroke(contact, setup.balls, world, dt === undefined ? {} : { dt }) };
}

const rateOf = (contact: ContactState, s: StrokeState): number =>
    dot(s.head.angularVelocity, pitchAxis((contact.drive as TrackDrive).arc.aim));

const last = (follow: FollowThrough): StrokeState => follow.samples[follow.samples.length - 1] as StrokeState;

/** `setup` with its hands' grip limit at TEST_GRIP_LIMIT, far above any hand's force (P2b.2b.2b.3 plan decision 12). */
const unlimited = (setup: ShotSetup): ShotSetup => ({
    ...setup,
    profile: { ...setup.profile, body: { ...setup.profile.body, gripLimit: TEST_GRIP_LIMIT } },
});

describe("the follow-through (design §4)", () => {
    it("leaves the impact exactly as simulateImpact returns it", () => {
        for (const setup of [shot(), shot({ drive: -1 }), shot({ backswing: 0.25 }, CARRY)]) {
            const { contact, result } = stroke(setup);
            expect(result).toEqual(simulateImpact(contact, setup.balls, WORLD));
        }
    });

    it("samples the head every FOLLOW_SAMPLE from the impact's start, at the impact's end and at the finish", () => {
        const { contact, result, follow } = stroke(shot());
        expect(follow.impactEnd).toBe(result.duration);
        const first = follow.samples[0] as StrokeState;
        expect(first.t).toBe(0);
        expect(first.head.position).toEqual(contact.position);
        expect(follow.samples.some((s) => s.t === follow.impactEnd)).toBe(true);
        expect(last(follow).t).toBe(follow.finish);
        for (let i = 1; i < follow.samples.length; i++) {
            const gap = (follow.samples[i] as StrokeState).t - (follow.samples[i - 1] as StrokeState).t;
            expect(gap).toBeGreaterThan(0);
            expect(gap).toBeLessThanOrEqual(FOLLOW_SAMPLE + 1e-12);
        }
    });

    it("finishes a swing at the pendulum's apex: the first pitch rate at or below zero after the impact", () => {
        const { contact, follow } = stroke(shot());
        expect(follow.flags).toEqual([]);
        expect(follow.finish).toBeGreaterThan(follow.impactEnd);
        expect(rateOf(contact, last(follow))).toBeLessThanOrEqual(0);
        for (const s of follow.samples.filter((x) => x.t >= follow.impactEnd && x.t < follow.finish)) {
            expect(rateOf(contact, s), `t ${s.t}`).toBeGreaterThan(0);
        }
    });

    it("finishes at the impact's end, one sample there and no step after, when the finish is already reached", () => {
        // Review focus 5. A 2 kg ball and no guide effort: the 1 kg head rebounds off the ball and the hands do not
        // push it on, so its pitch rate is already below zero (about −0.55 rad/s) when the impact ends.
        const world = testWorld({ ball: { ...WORLD.ball, mass: 2 } });
        const { contact, follow } = stroke(
            shot({ backswing: 0.25 }, testProfile({ drive: { guideEffort: 0 } })),
            world,
        );
        expect(follow.flags).toEqual([]);
        expect(follow.finish).toBe(follow.impactEnd);
        expect(follow.samples.filter((s) => s.t >= follow.impactEnd)).toHaveLength(1);
        expect(rateOf(contact, last(follow))).toBeLessThanOrEqual(0);
    });

    it("holds a stop's mallet still after the check, so it settles on the firm grip", () => {
        // User decision 2026-10-07 (Riches: the stop has "NO FOLLOW-THROUGH"): from the check's window's end, or the
        // impact's end if later, the pendulum is held and the hands grip firmly. The canonical GC stop's head still
        // sinks at 7.2e-3 m/s at the impact's end; the AC stop's impact ends 11.6 ms after the window. Each settles
        // below FINISH_SPEED relative to the hands within the firm grip's period: 88 ms and 32 ms after the hold.
        // The hands at TEST_GRIP_LIMIT, so that the hold alone is pinned; the default limit's case follows.
        const world = defaultWorld();
        for (const type of ["stop-gc", "stop-ac"] as const) {
            const { contact, follow } = stroke(unlimited(canonicalSetup(type, { world })), world);
            expect(follow.flags, type).toEqual([]);
            expect(follow.finish, type).toBeGreaterThan(follow.impactEnd);
            expect(follow.finish - follow.impactEnd, type).toBeLessThan(1.5 * HAND_COUPLING.period);
            const plan = prepareTrack(contact.drive as TrackDrive, contact.head, world.gravity);
            const end = last(follow);
            expect(length(sub(end.head.velocity, handsAt(plan, end.t).velocity)), type).toBeLessThan(FINISH_SPEED);
        }
    });

    it("flags the default grip limit reached in the GC stop's hold (P2b.2b.2b.3 design §5)", () => {
        // At F_max = 435 N (Young et al. 2009) a hand saturates while the firm grip holds the GC stop's mallet.
        const world = defaultWorld();
        const { follow } = stroke(canonicalSetup("stop-gc", { world }), world);
        expect(follow.flags).toEqual(["follow-grip-limit"]);
    });

    it("finishes a carry at its first apex after the pendulum phase starts", () => {
        const { contact, follow } = stroke(shot({ backswing: 0.25 }, CARRY));
        const push = prepareTrack(contact.drive as TrackDrive, contact.head, WORLD.gravity).push as Push;
        expect(push.pendulum).not.toBeNull();
        expect(follow.finish).toBeGreaterThan(push.pendulum as number);
        expect(follow.flags).not.toContain("follow-cap");
    });

    it("caps a carry whose hands never stop", () => {
        // Review focus 5: a 10 m push reaches its pendulum point (8 m) only after REACH_SEARCH (0.5 s), so the
        // pendulum phase never starts and the carry never finishes. The hands' arc must exceed the push
        // (P2b.2b.2b.2b), so its radius is 11 m, as levelArc's.
        const endless = testProfile({
            drive: { mode: "carry", handReach: 10, handArcRadius: 11 },
            shape: { pendulumShare: 0.5 },
        });
        const { contact, follow } = stroke(shot({ backswing: 0.25 }, endless));
        expect(follow.flags).toEqual(["follow-cap"]);
        const contactAt = (contact.drive as TrackDrive).arc.contactAt;
        expect(follow.finish).toBeGreaterThanOrEqual(contactAt + FOLLOW_CAP);
        expect(follow.finish).toBeLessThan(contactAt + FOLLOW_CAP + 1e-5);
    });

    // P2b.2b.2b.2b: gate-ruled skip (round 14, 2026-10-12). A dip is part of trackEnd; a late dip lengthens the impact
    // and drives the head deep inside it (this setup: impact-head-deep, 5.4 mm, and the follow-through finishes at the
    // impact's end), never in the follow-through. On the flex no test-profile carry drives the follow-through past
    // 2 × HEAD_DEEP_LIMIT: the pendulum phase at any pendulumAt or effort tried reaches at most 0.31 mm into the turf.
    // On this file's world the canonical full roll's pendulum phase swings its head into the turf 1.95 mm deep, short
    // of HEAD_DEEP_LIMIT (it was 2.04 mm, follow-head-deep, before the push intent). With the push intent this
    // setup still digs inside the impact: impact-head-deep, 5.84 mm at 126 ms (was 5.4 mm). With the hands' mass and
    // grip tissue (gate round 2) it still does: impact-head-deep from 108.7 ms, 5.48 mm deep, and the full roll's
    // follow-through on this world reaches 1.79 mm into the turf. With each hand–arm chain (gate round 3) the setup
    // digs inside the impact (impact-head-deep from 111.8 ms, 4.15 mm) and its follow-through is flagged too; the full
    // roll's follow-through on this world reaches 1.71 mm. P2b.2b.2b.2b: posture-holding push (was 1.71 mm): the setup
    // is unchanged (its test profile has no posture hold), and the full roll's follow-through reaches 1.56 mm.
    // P2b.2b.2b.2b: hold relaxes from the first departure (was 1.56 mm): the full roll's follow-through reaches
    // 1.08 mm. P2b.2b.2b.2b: flex, gate ruling 2026-10-12 (the gate accepted at 7843e2b): the setup still digs inside
    // the impact (impact-head-deep from 111.8 ms, 4.15 mm). Kept skipped. A planned dip is part of trackEnd, so the
    // impact lasts through it and the dip always lands inside the impact; no setup on this file's world, at
    // 2 × HEAD_DEEP_LIMIT, digs in the follow-through alone, which is the case this test needs.
    it.skip("flags a follow-through that drives the head deep, not the impact", () => {
        // A deep, late dip: the hands lower 0.2 m over 50 ms from 100 ms, long after the ball has gone. The turf and
        // the compliant hands hold the head well above that path, but a planned dig far outside play presses it past
        // 2 × HEAD_DEEP_LIMIT (P2b.2b.2b.2b: the carry's descent, which this test drove, is gone with groundDepth).
        const deep = testProfile({
            drive: { mode: "carry", handReach: 0.15, handDrop: 0.2, dropTime: 0.05 },
            shape: { pendulumShare: 0.5 },
        });
        const late = { arc: 0, hands: 0, dip: 0.1 };
        const { contact, result, follow } = stroke(shot({ backswing: 0.25, timing: late }, deep));
        expect(follow.flags).toContain("follow-head-deep");
        expect(result.events.map((e) => e.kind)).not.toContain("impact-head-deep");
        const deepest = Math.min(...follow.samples.map((s) => headLowestPoint(s.head, contact.head)));
        expect(deepest).toBeLessThan(0 - 2 * HEAD_DEEP_LIMIT);
    });

    it("converges in dt: the swing's finish time and pose", () => {
        const at = (dt: number) => {
            const { follow } = stroke(shot(), WORLD, dt);
            return { finish: follow.finish, position: last(follow).head.position };
        };
        const [a, b, c] = [at(1e-5), at(5e-6), at(2.5e-6)];
        const coarse = Math.abs(a.finish - b.finish);
        const fine = Math.abs(b.finish - c.finish);
        // First order: halving dt about halves the change; the finish is also quantised to a step.
        expect(fine).toBeLessThanOrEqual(Math.max(0.75 * coarse, 2e-5));
        expect(length(sub(b.position, c.position))).toBeLessThan(1e-3);
    });

    it("refuses a force table", () => {
        const { contact } = stroke(shot());
        const samples = [{ t: 0, force: contact.velocity }];
        const forced: ContactState = { ...contact, drive: { kind: "force", samples } };
        expect(() => simulateStroke(forced, { blue: ballAt(5, 3) }, WORLD)).toThrow(/tracked drive/);
    });
});
