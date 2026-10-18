import { describe, expect, it } from "vitest";
import type { FollowSnapshot, ImpactSnapshot } from "../../../src/engine/impact/integrate";
import { simulateStroke } from "../../../src/engine/impact/simulateImpact";
import { advanceTravel, pathAt, pitchAxis, prepareTrack, type Advance } from "../../../src/engine/impact/track";
import type { SwingArc, TrackDrive } from "../../../src/engine/impact/types";
import { dot } from "../../../src/engine/math/vec3";
import { MAX_LEAD, planStroke, type StrokePlan } from "../../../src/engine/swing/buildContact";
import { ON_TIME } from "../../../src/engine/swing/profile";
import type { ShotSetup, StrokeTiming, StrokeType } from "../../../src/engine/swing/types";
import { defaultWorld } from "../../../src/engine/world";
import { backswingFor, canonicalSetup } from "../support/shot";

const WORLD = defaultWorld();

/** A canonical stroke of `type` with `over` in its stroke and `timing` over ON_TIME, its backswing planning 3 m/s. */
function stroke(
    over: Partial<ShotSetup["stroke"]>,
    timing: Partial<StrokeTiming> = {},
    type: StrokeType = "single-ball",
): ShotSetup {
    const setup = canonicalSetup(type, { stroke: { ...over, timing: { ...ON_TIME, ...timing } } });
    return { ...setup, stroke: { ...setup.stroke, backswing: backswingFor(setup, 3, WORLD) } };
}

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
    // V, the head's planned speed along aim at contact, and the stroke's window W; the ramp ends W after contact.
    const arc = () => arcOf(plan(level()));
    const speedOf = () => (arc().advance as { speed: number }).speed;

    it("travels the hands exactly handReach, from rest to rest, continuously", () => {
        const WINDOW = arc().window;
        const a = advanceOf(level());
        expect(advanceTravel(a, a.start)).toEqual({ a: 0, v: 0, acc: a.speed / WINDOW });
        expect(advanceTravel(a, a.end).a).toBeCloseTo(0.3, 12);
        expect(advanceTravel(a, a.end).v).toBeCloseTo(0, 12);
        for (const seam of [a.ramp, a.cruise]) {
            expect(advanceTravel(a, seam - 1e-12).v).toBeCloseTo(advanceTravel(a, seam + 1e-12).v, 9);
        }
    });
    it("slows the head's turn while the hands speed up: its pitch rate at the ramp's end is lower", () => {
        // On time the ramp [contact, contact + W] coincides with the pendulum's window, whose α law prescribes θ, so
        // the plan cannot show it: the planned ω there is bit-equal with and without the advance. The slowing reaches
        // the head through swing mode's hand load, which pushes the top of the shaft forward along aim.
        const RAMP_END = arc().contactAt + arc().window;
        const at = (setup: ShotSetup): number =>
            (pitchRates(setup).find(({ t }) => t >= RAMP_END) as { rate: number }).rate;
        expect(plannedOmega(level(), RAMP_END)).toBe(plannedOmega(rising(), RAMP_END));
        expect(at(level())).toBeLessThan(at(rising()));
    });
    it("flattens the head's rise over the advance", () => {
        // Plan decision 15: the head centre's highest point above its height at contact, contact to t_e.
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
    it("rejects carry mode, a check, no travel and a non-finite timing", () => {
        expect(() => plan(stroke({ handReach: 0.3 }, { advance: 0 }, "half-roll"))).toThrow(/advance .* swing mode/);
        expect(() => plan(stroke({ handReach: 0.3 }, { advance: 0 }, "stop-gc"))).toThrow(/advance .* check/);
        expect(() => plan(stroke({ handReach: 0 }, { advance: 0 }))).toThrow(/advance .* handReach/);
        expect(() => plan(stroke({ handReach: 0.3 }, { advance: Number.NaN }))).toThrow(/advance must be finite/);
    });
    it("rejects a travel too short for the hands' ramp", () => {
        // Review focus 2. V·W/2 ≥ 0.8·handReach throws; just above the bound plans.
        const V = speedOf();
        const WINDOW = arc().window;
        const bound = (V * WINDOW) / 2 / 0.8;
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
