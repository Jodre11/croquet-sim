import { describe, expect, it } from "vitest";
import { openWorld } from "../../../scripts/openLawn";
import { bodyBackswing, mapSetup, textBook } from "../../../scripts/pushMapRun";
import { liftAt } from "../../../src/engine/impact/lift";
import { nextLift, PRACTICE_PASSES, practiseStroke } from "../../../src/engine/impact/practice";
import { simulateStroke } from "../../../src/engine/impact/simulateImpact";
import type { Lift, TrackDrive } from "../../../src/engine/impact/types";
import { planStroke } from "../../../src/engine/swing/buildContact";
import type { BallState, BallStates } from "../../../src/engine/types";
import type { ShotSetup } from "../../../src/engine/swing/types";
import { swingReference } from "../../../src/reference/index";

const WORLD = openWorld(10);

/** The half roll's text book at the power whose backswing is its default, as the push map plays it (band.test). */
function halfRoll(): ShotSetup {
    const base = mapSetup("half-roll", textBook("half-roll"), 1);
    const power = swingReference["half-roll"].defaultBackswing.value / bodyBackswing(base, WORLD);
    return mapSetup("half-roll", textBook("half-roll"), power);
}

/** The minimum-jerk ramp, written out independently of practice.ts. */
function ramp(s: number): number {
    return 10 * s ** 3 - 15 * s ** 4 + 6 * s ** 5;
}

/** Each value of `lift` against `expected` (m) to 1e-15. */
function expectValues(lift: Lift, expected: readonly number[]): void {
    expect(lift.values).toHaveLength(expected.length);
    expected.forEach((value, i) => {
        expect(Math.abs((lift.values[i] as number) - value), `sample ${i}`).toBeLessThan(1e-15);
    });
}

describe("practice strokes (P2b.2b.2c.3b.1 design §4)", () => {
    it("a stroke in the band plays once", () => {
        const setup = halfRoll();
        const { contact } = planStroke(setup, WORLD);
        const passes: number[] = [];
        const practised = practiseStroke(contact, setup.balls, WORLD, setup.striker, (pass) => {
            passes.push(pass);
            return undefined;
        });
        expect(practised.passes).toBe(1);
        expect(practised.lift).toBeNull();
        expect(practised.miss).toBeNull();
        expect(passes).toEqual([1]);
        const plain = simulateStroke(contact, setup.balls, WORLD);
        expect(practised.result).toEqual(plain.result);
        expect(practised.follow).toEqual(plain.follow);
        expect(practised.point.holds).toBe(true);
    });

    it("the lift follows the update rule", () => {
        const from = 0.2;
        const step = 0.001;
        const end = from + 0.0015;
        const mm = 0.001;
        // The plan's case: e ≤ 0 throughout, so −w·e and −w·min(e, 0) agree; w = 0, ½, 1, 1 over a 2 ms window.
        const plain = nextLift(null, [0, -1 * mm, -2 * mm, -3 * mm], from, step, 0.002, end);
        expect(plain.from).toBe(from);
        expect(plain.step).toBe(step);
        expectValues(plain, [0, 0.5 * mm, 2 * mm, 3 * mm]);
        // Over the finish (from the push's end on) the push's correction is carried and only a further drop is
        // corrected: e(T) = 0.5 mm halfway between the second and third samples, so e becomes 0.5 mm + min(e, 0).
        const mixed = [0, -1 * mm, 2 * mm, -3 * mm, 1 * mm];
        expectValues(nextLift(null, mixed, from, step, 0.002, end), [0, 0.5 * mm, -0.5 * mm, 2.5 * mm, -0.5 * mm]);
        // A push whose finish never starts (end null) corrects the whole error.
        expectValues(nextLift(null, mixed, from, step, 0.002, null), [0, 0.5 * mm, -2 * mm, 3 * mm, -1 * mm]);
        // The ramp is the minimum-jerk one: at a quarter of a 4 ms window w = 10s³ − 15s⁴ + 6s⁵ at s = ¼.
        const quarter = nextLift(null, [0, -1 * mm], from, step, 0.004, null);
        expectValues(quarter, [0, ramp(0.25) * mm]);
        // δz accumulates on the previous pass's lift, which holds its last value past its own last sample.
        const previous: Lift = { from, step, values: [0, 1 * mm] };
        const next = nextLift(previous, [0, -1 * mm, -2 * mm, -3 * mm], from, step, 0.002, end);
        expectValues(next, [0, 1.5 * mm, 3 * mm, 4 * mm]);
        // A shorter error drops the previous lift's later samples: the new lift holds its own last value past them.
        const shorter = nextLift(
            { from, step, values: [0, 1, 2, 3, 4].map((v) => v * mm) },
            [0, 0],
            from,
            step,
            0.002,
            end,
        );
        expectValues(shorter, [0, 1 * mm]);
        // liftAt reads a sample's time to within rounding, so the values carry the last bits of that read.
        expect(liftAt(shorter, from + 0.003)).toEqual({ z: shorter.values[1], v: 0, a: 0 });
        expect(liftAt(next, from + 0.01)).toEqual({ z: next.values[3], v: 0, a: 0 });
    });

    it("the lift is continuous across the push's end", () => {
        // e > 0 at T (design §4 item 2, amended 2026-10-31): a sample just before T takes −w·e, one just after it
        // −w·(max(e(T), 0) + min(e, 0)); with e(T) → e there both agree, where min(e, 0) alone would step to 0.
        const from = 0.2;
        const step = 0.001;
        const mm = 0.001;
        const error = [0, 1 * mm, 3 * mm, 2 * mm];
        const at = from + 2 * step;
        const before = nextLift(null, error, from, step, 0.002, at + 1e-12);
        const after = nextLift(null, error, from, step, 0.002, at - 1e-12);
        const z = (lift: Lift): number => lift.values[2] as number;
        expect(z(before)).toBeLessThan(-2.9 * mm);
        expect(Math.abs(z(before) - z(after))).toBeLessThan(1e-11);
        // A later sample of the finish with e ≥ 0 keeps the carried correction alone.
        expect(Math.abs((after.values[3] as number) - z(after))).toBeLessThan(1e-11);
    });

    it("an unconverged stroke reports its miss", () => {
        // The half roll in the band, its striker's ball moved 40 mm across the line, beyond the head's half-width
        // (28.6 mm): the head's side meets the ball (impact-off-face). The lift is vertical, so no pass can bring the
        // face onto the ball, and practice plays every pass.
        const setup = halfRoll();
        const { contact } = planStroke(setup, WORLD);
        const aim = (contact.drive as TrackDrive).arc.aim;
        const ball = setup.balls[setup.striker] as BallState;
        const { x, y, z } = ball.position;
        const balls: BallStates = {
            ...setup.balls,
            [setup.striker]: { ...ball, position: { x: x - aim.y * 0.04, y: y + aim.x * 0.04, z } },
        };
        const passes: number[] = [];
        const practised = practiseStroke(contact, balls, WORLD, setup.striker, (pass) => {
            passes.push(pass);
            return undefined;
        });
        expect(practised.passes).toBe(PRACTICE_PASSES);
        expect(practised.miss).toBe("impact-off-face");
        expect(passes).toEqual([1, 2, 3]);
        expect(practised.lift).not.toBeNull();
        expect(practised.lift?.from).toBe((contact.drive as TrackDrive).arc.contactAt);
        expect(practised.result.events.some((e) => e.kind === "impact-off-face")).toBe(true);
    });
});
