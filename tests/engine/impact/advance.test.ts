import { describe, expect, it } from "vitest";
import type { FollowSnapshot, ImpactSnapshot } from "../../../src/engine/impact/integrate";
import { simulateStroke } from "../../../src/engine/impact/simulateImpact";
import {
    advanceTravel,
    handsAt,
    pathAt,
    pitchAxis,
    prepareTrack,
    type Advance,
} from "../../../src/engine/impact/track";
import type { SwingArc, TrackDrive } from "../../../src/engine/impact/types";
import { dot, sub } from "../../../src/engine/math/vec3";
import { MAX_LEAD, checkAdvance, planStroke, type StrokePlan } from "../../../src/engine/swing/buildContact";
import { ON_TIME, defaultProfile } from "../../../src/engine/swing/profile";
import type { ShotSetup, StrokeTiming, StrokeType, SwingProfile } from "../../../src/engine/swing/types";
import { defaultWorld } from "../../../src/engine/world";
import { swingBodyReference } from "../../../src/reference/index";
import { backswingFor, canonicalSetup } from "../support/shot";

const WORLD = defaultWorld();

/**
 * A canonical stroke of `type` with `over` in its stroke, `timing` over ON_TIME and `body` over the default body, its
 * backswing planning 3 m/s.
 */
function stroke(
    over: Partial<ShotSetup["stroke"]>,
    timing: Partial<StrokeTiming> = {},
    type: StrokeType = "single-ball",
    body: Partial<SwingProfile["body"]> = {},
): ShotSetup {
    const setup = canonicalSetup(type, { stroke: { ...over, timing: { ...ON_TIME, ...timing } }, body });
    return { ...setup, stroke: { ...setup.stroke, backswing: backswingFor(setup, 3, WORLD) } };
}

/** The default body's hands' peak acceleration along aim (m/s², a body property, never the player's). */
const HAND_ACCEL = defaultProfile.body.handAcceleration;

const plan = (setup: ShotSetup): StrokePlan => planStroke(setup, WORLD);
const arcOf = (planned: StrokePlan): SwingArc => (planned.contact.drive as TrackDrive).arc;

/** The run of `setup` with the head at every impact step and every follow-through step (memoised per stroke). */
interface Probed {
    readonly result: ReturnType<typeof simulateStroke>["result"];
    readonly follow: ReturnType<typeof simulateStroke>["follow"];
    readonly heads: readonly { readonly t: number; readonly head: ImpactSnapshot["head"] }[];
    readonly arc: SwingArc;
}
const RUNS = new Map<string, Probed>();

function probed(setup: ShotSetup): Probed {
    const key = JSON.stringify([setup.stroke.type, setup.stroke]);
    const known = RUNS.get(key);
    if (known !== undefined) {
        return known;
    }
    const planned = plan(setup);
    const heads: { t: number; head: ImpactSnapshot["head"] }[] = [];
    const { result, follow } = simulateStroke(planned.contact, setup.balls, WORLD, {
        probe: {
            step: (s: ImpactSnapshot) => heads.push({ t: s.t, head: s.head }),
            follow: (s: FollowSnapshot) => heads.push({ t: s.t, head: s.head }),
        },
    });
    const done = { result, follow, heads, arc: arcOf(planned) };
    RUNS.set(key, done);
    return done;
}

const run = (setup: ShotSetup) => {
    const { result, follow } = probed(setup);
    return { result, follow };
};

/** The prepared track's advance (null without one). */
function advanceOf(setup: ShotSetup): Advance {
    const { contact } = plan(setup);
    return prepareTrack(contact.drive as TrackDrive, contact.head, WORLD.gravity).advance as Advance;
}

/** The planned ω (rad/s) at time t, about the pitch axis. */
function plannedOmega(setup: ShotSetup, t: number): number {
    const { contact } = plan(setup);
    const track = prepareTrack(contact.drive as TrackDrive, contact.head, WORLD.gravity);
    return dot(pathAt(track, t).angularVelocity, track.axis);
}

/** The head centre's highest point (m) above its height at contact, from contact to `end`. */
function rise(setup: ShotSetup, end: number): number {
    const { heads, arc } = probed(setup);
    const from = heads.find((s) => s.t >= arc.contactAt) as (typeof heads)[number];
    const over = heads.filter((s) => s.t >= from.t && s.t <= end).map((s) => s.head.position.z);
    return Math.max(...over) - from.head.position.z;
}

/** The head's pitch rate (rad/s) about n at every probed step. */
function pitchRates(setup: ShotSetup): { readonly t: number; readonly rate: number }[] {
    const { heads, arc } = probed(setup);
    const n = pitchAxis(arc.aim);
    return heads.map((s) => ({ t: s.t, rate: dot(s.head.angularVelocity, n) }));
}

describe("the hands' advance (design §6, §8.1.5)", () => {
    // The canonical single-ball stroke at 3 m/s, the hands pushing 0.3 m from contact, on time.
    const level = (moment = 0) => stroke({ handReach: 0.3 }, { advance: moment });
    const rising = () => stroke({ handReach: 0.3 });
    // V, the head's planned speed along aim at contact; the ramp ends V/a after the start, a the body's figure.
    const arc = () => arcOf(plan(level()));
    const speedOf = () => (arc().advance as { speed: number }).speed;

    it("gives the default body a peak hand acceleration of 300 m/s², a 10 ms ramp at 3 m/s", () => {
        expect(HAND_ACCEL).toBe(swingBodyReference.handAcceleration.value);
        expect(HAND_ACCEL).toBe(300);
        const a = advanceOf(level());
        expect(a.ramp - a.start).toBeCloseTo(0.01, 6);
    });

    it("ramps the hands at the body's peak acceleration a, over W = V/a", () => {
        // The ramp is a body property, so a gentler body's lasts longer at the same V (P2b.2b.2c.1 design, Amendments).
        const a = advanceOf(level());
        expect(a.accel).toBe(HAND_ACCEL);
        expect(a.ramp - a.start).toBeCloseTo(a.speed / HAND_ACCEL, 15);
        const gentle = advanceOf(stroke({ handReach: 0.3 }, { advance: 0 }, "single-ball", { handAcceleration: 150 }));
        expect(gentle.accel).toBe(150);
        expect(gentle.ramp - gentle.start).toBeCloseTo(gentle.speed / 150, 15);
        expect(gentle.speed).toBe(a.speed);
    });

    it("rejects a non-finite or non-positive peak hand acceleration", () => {
        for (const bad of [0, -300, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(() => plan(stroke({}, {}, "single-ball", { handAcceleration: bad })), `${bad}`).toThrow(
                /profile\.body\.handAcceleration/,
            );
        }
    });

    it("travels the hands exactly handReach, from rest to rest, continuously", () => {
        const a = advanceOf(level());
        expect(advanceTravel(a, a.start)).toEqual({ a: 0, v: 0, acc: HAND_ACCEL });
        expect(advanceTravel(a, a.end).a).toBeCloseTo(0.3, 12);
        expect(advanceTravel(a, a.end).v).toBeCloseTo(0, 12);
        for (const seam of [a.ramp, a.cruise]) {
            expect(advanceTravel(a, seam - 1e-12).v).toBeCloseTo(advanceTravel(a, seam + 1e-12).v, 9);
        }
    });
    it("slows the head's turn while the hands speed up: its pitch rate at the ramp's end is lower", () => {
        // On time the ramp runs from contact for V/a, at 3 m/s and a = 300 m/s² the 10 ms of the pendulum's window,
        // whose α law prescribes θ, so the plan cannot show it: the planned ω there is bit-equal with and without the
        // advance (only because the two coincide: a gentler body's ramp outlasts the window). The slowing reaches the
        // head through swing mode's hand load, which pushes the top of the shaft forward along aim.
        const RAMP_END = advanceOf(level()).ramp;
        const at = (setup: ShotSetup): number =>
            (pitchRates(setup).find(({ t }) => t >= RAMP_END) as { rate: number }).rate;
        expect(plannedOmega(level(), RAMP_END)).toBe(plannedOmega(rising(), RAMP_END));
        expect(at(level())).toBeLessThan(at(rising()));
    });
    it("slows the planned turn while late hands speed up: the planned ω at their ramp's end is lower", () => {
        // The plan's own ω, for a late advance. On time the ramp coincides with the pendulum's window, whose α law
        // prescribes θ, so the plan cannot see it (the test above). A late advance's ramp lies wholly in the free
        // table, which integrates the hands' acceleration through freeAlpha. 0.05 s after contact is after the window's
        // end (W = 0.01 s) and well before the no-advance finish (about 0.498 s); its ramp lasts V/a, 0.01 s at 3 m/s.
        const late = level(0.05);
        const RAMP_END = advanceOf(late).ramp;
        expect(RAMP_END).toBeGreaterThan(arc().contactAt + 2 * arc().window);
        expect(plannedOmega(late, RAMP_END)).toBeLessThan(plannedOmega(rising(), RAMP_END));
    });
    it("flattens the head's rise over the advance", () => {
        // The head centre's highest point above its height at contact, contact to t_e: the advance flattens the path
        // while the hands accelerate, the arc never stopped.
        const { follow } = run(level());
        const end = (follow.advanced as { end: number }).end;
        expect(rise(level(), end)).toBeLessThan(rise(rising(), end));
    });
    it("resumes the arc once the hands come to rest, and finishes after them", () => {
        const { follow } = run(level());
        const end = (follow.advanced as { end: number }).end;
        expect(pitchRates(level()).some(({ t, rate }) => t > end && rate > 0)).toBe(true);
        expect(follow.finish).toBeGreaterThan(end);
    });
    it("carries the hands handReach in all from contact, the advance replacing the pivot's own reach", () => {
        // One budget: the advance replaces the planned pivot's own reach. A pushed single-ball stroke whose planned
        // pivot travels on along aim after contact (handGain 1 at drive +1), so that the plan's own reach binds:
        // without an advance the reach carries the hands handReach; with one, the advance alone does, never the reach's
        // distance on top.
        const pushed = (timing: Partial<StrokeTiming>): ShotSetup => {
            const setup = canonicalSetup("single-ball", {
                stroke: { drive: 1, handReach: 0.3, timing: { ...ON_TIME, ...timing } },
                drive: { handGain: 1 },
            });
            return { ...setup, stroke: { ...setup.stroke, backswing: backswingFor(setup, 3, WORLD) } };
        };
        const travel = (setup: ShotSetup): { most: number; last: number } => {
            const { contact } = plan(setup);
            const track = prepareTrack(contact.drive as TrackDrive, contact.head, WORLD.gravity);
            const { aim, contactAt } = track.arc;
            const from = handsAt(track, contactAt).position;
            const along = (t: number): number => dot(sub(handsAt(track, t).position, from), aim);
            let most = 0;
            for (let k = 0; k <= 2000; k++) {
                most = Math.max(most, along(contactAt + k * 1e-3));
            }
            return { most, last: along(contactAt + 2) };
        };
        // Numerical, not physical: the advance's closed form reaches handReach to rounding.
        const TOLERANCE = 1e-12;
        const without = travel(pushed({}));
        expect(without.last).toBeCloseTo(0.3, 9);
        const withAdvance = travel(pushed({ advance: 0 }));
        expect(withAdvance.most).toBeLessThanOrEqual(0.3 + TOLERANCE);
        expect(withAdvance.last).toBeCloseTo(0.3, 9);
    });

    it("rejects carry mode, a check, no travel and a non-finite timing", () => {
        expect(() => plan(stroke({ handReach: 0.3 }, { advance: 0 }, "half-roll"))).toThrow(/advance .* swing mode/);
        expect(() => plan(stroke({ handReach: 0.3 }, { advance: 0 }, "stop-gc"))).toThrow(/advance .* check/);
        expect(() => plan(stroke({ handReach: 0 }, { advance: 0 }))).toThrow(/advance .* handReach/);
        expect(() => plan(stroke({ handReach: 0.3 }, { advance: Number.NaN }))).toThrow(/advance must be finite/);
    });
    it("rejects a head not moving forward along aim at contact", () => {
        // planStroke's own strokes all move forward, so the check is called on the canonical arc directly: a speed of 0
        // would never end the cruise, a negative one ramp the hands backwards.
        for (const bad of [0, -3, Number.NaN]) {
            expect(() => checkAdvance(arc(), { start: 0, speed: bad, accel: HAND_ACCEL }), `${bad}`).toThrow(
                /advance .* speed along aim, which must be positive/,
            );
        }
    });
    it("rejects a travel too short for the hands' ramp", () => {
        // Review focus 2. The ramp's travel V·W/2 = V²/(2a) ≥ 0.8·handReach throws; just above the bound plans.
        const V = speedOf();
        const bound = (V * V) / (2 * HAND_ACCEL) / 0.8;
        expect(() => plan(stroke({ handReach: bound }, { advance: 0 }))).toThrow(/advance .* ramp/);
        expect(() => plan(stroke({ handReach: bound * (1 + 1e-9) }, { advance: 0 }))).not.toThrow();
    });
    it("takes an early advance into the lead and ignores one the finish beats", () => {
        // Review focus 1. The arcs differ in the advance, so the runs are compared, not the contact states.
        expect(arcOf(plan(level(-0.02))).contactAt).toBeCloseTo(0.02, 15);
        expect(() => plan(level(-(MAX_LEAD + 0.001)))).toThrow(/more than .* early/);
        const late = run(stroke({ handReach: 0.3 }, { advance: 0.9 }));
        const none = run(rising());
        // The late moment must lie after the no-advance run's finish (about 0.498 s after contact, at t = 0.4982 s,
        // the lead being 0): +0.9 s does.
        const start = (arcOf(plan(stroke({ handReach: 0.3 }, { advance: 0.9 }))).advance as { start: number }).start;
        expect(start).toBeGreaterThan(none.follow.finish);
        expect(late.follow.advanced).toBeUndefined();
        expect(late.result).toEqual(none.result);
        expect(late.follow).toEqual(none.follow);
    });
});
