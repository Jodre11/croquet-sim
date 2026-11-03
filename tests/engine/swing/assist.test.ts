import { describe, expect, it } from "vitest";
import { planStroke } from "../../../src/engine/swing/buildContact";
import { assistTempo } from "../../../src/engine/swing/downswing";
import { defaultProfile } from "../../../src/engine/swing/profile";
import type { StrokeType, SwingAssist } from "../../../src/engine/swing/types";
import { defaultWorld } from "../../../src/engine/world";
import { canonicalSetup } from "../support/shot";

const WORLD = defaultWorld();
const ASSIST: SwingAssist = { force: 120, speed: 6 };
const SLOW = 0.5;
const TRAVEL = 0.4;
const MASS = 1.4;

/** The arms' surplus at tempo T: the force they supply less the force the faster swing needs (firmness design §4). */
function residual(T: number, intensity: number): number {
    const need = MASS * 2 * TRAVEL * (1 / (T * T) - 1 / (SLOW * SLOW));
    const supply = intensity * ASSIST.force * Math.max(0, 1 - (2 * TRAVEL) / (T * ASSIST.speed));
    return supply - need;
}

describe("the arms' assist (firmness design §4)", () => {
    it("keeps the slow tempo exactly with no intensity, no force, no hands' travel or the hands already at v_max", () => {
        expect(assistTempo(ASSIST, 0, SLOW, TRAVEL, MASS)).toBe(SLOW);
        expect(assistTempo({ ...ASSIST, force: 0 }, 1, SLOW, TRAVEL, MASS)).toBe(SLOW);
        // Review Focus 2: a pendulum's whole share moves no hands, so the arms add nothing (and T never runs to 0).
        expect(assistTempo(ASSIST, 1, SLOW, 0, MASS)).toBe(SLOW);
        // Review Focus 1: 2·d/T_s = 1.6 m/s, so a v_max of 1.6 m/s or less leaves the arms nothing to add.
        expect(assistTempo({ ...ASSIST, speed: 1.6 }, 1, SLOW, TRAVEL, MASS)).toBe(SLOW);
        expect(assistTempo({ ...ASSIST, speed: 1 }, 1, SLOW, TRAVEL, MASS)).toBe(SLOW);
    });

    it("shortens the tempo with intensity, at the arms' force, the hands below v_max", () => {
        let last = SLOW;
        for (const intensity of [0.25, 0.5, 0.75, 1]) {
            const T = assistTempo(ASSIST, intensity, SLOW, TRAVEL, MASS);
            expect(T, `${intensity}`).toBeLessThan(last);
            // The bisection keeps the upper end: the arms supply at least what the swing needs, to a double's
            // resolution.
            expect(residual(T, intensity), `${intensity}`).toBeGreaterThanOrEqual(0);
            expect(Math.abs(residual(T, intensity)) / (intensity * ASSIST.force), `${intensity}`).toBeLessThan(1e-9);
            expect((2 * TRAVEL) / T, `${intensity}`).toBeLessThan(ASSIST.speed);
            last = T;
        }
    });

    const planned = (type: StrokeType, intensity: number, force = defaultProfile.body.assist.force) =>
        planStroke(
            canonicalSetup(type, {
                stroke: { intensity },
                body: { assist: { ...defaultProfile.body.assist, force } },
            }),
            WORLD,
        );

    it("leaves a held roll at intensity 0 bit for bit, whatever the arms' force", () => {
        const force = defaultProfile.body.assist.force;
        for (const type of ["half-roll", "full-roll", "pass-roll"] as const) {
            expect(planned(type, 0, 2 * force), type).toEqual(planned(type, 0));
        }
    });

    it("speeds a held roll's contact with intensity", () => {
        for (const type of ["half-roll", "full-roll", "pass-roll"] as const) {
            const speeds = [0, 0.5, 1].map((intensity) => planned(type, intensity).contactSpeed);
            expect(speeds[1] as number, type).toBeGreaterThan(speeds[0] as number);
            expect(speeds[2] as number, type).toBeGreaterThan(speeds[1] as number);
        }
    });

    it("leaves a stroke the pendulum leads unchanged by the arms' force (Review Focus 2)", () => {
        const force = defaultProfile.body.assist.force;
        for (const type of ["drive", "single-ball", "stop-ac", "stop-gc"] as const) {
            expect(planned(type, 1, 2 * force), type).toEqual(planned(type, 1));
        }
    });
});
