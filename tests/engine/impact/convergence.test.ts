import { describe, expect, it } from "vitest";
import { length, sub } from "../../../src/engine/math/vec3";
import { BALL_IDS, type BallState } from "../../../src/engine/types";
import { IMPACT_DT } from "../../../src/engine/impact/integrate";
import { simulateImpact } from "../../../src/engine/impact/simulateImpact";
import { TEST_BALL, testWorld } from "../support/fixtures";
import { SCENARIOS } from "../support/impact";

/**
 * Largest change of a handover velocity or spin (×R) when dt halves, relative to the head's speed: twice the worst
 * scenario (pre-flight: 1.51e-3, the cut).
 */
const CONVERGENCE_TOLERANCE = 3e-3;
const WORLD = testWorld();

describe.each(SCENARIOS)("$name", ({ contact, balls }) => {
    it("moves no handover velocity by more than CONVERGENCE_TOLERANCE when dt halves", () => {
        const coarse = simulateImpact(contact, balls, WORLD);
        const fine = simulateImpact(contact, balls, WORLD, { dt: IMPACT_DT / 2 });
        const speed = length(contact.velocity);
        for (const id of BALL_IDS.filter((x) => balls[x])) {
            const a = coarse.handover[id] as BallState;
            const b = fine.handover[id] as BallState;
            const dv = length(sub(a.velocity, b.velocity)) / speed;
            const dw = (TEST_BALL.radius * length(sub(a.angularVelocity, b.angularVelocity))) / speed;
            expect(dv, `${id} velocity`).toBeLessThan(CONVERGENCE_TOLERANCE);
            expect(dw, `${id} spin`).toBeLessThan(CONVERGENCE_TOLERANCE);
        }
    });
});
