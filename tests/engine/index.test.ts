import { describe, expect, it } from "vitest";
import * as engine from "../../src/engine/index";

describe("engine public API", () => {
    it("exposes the simulation entry points", () => {
        expect(typeof engine.simulateFreeMotion).toBe("function");
        expect(typeof engine.stateAtTime).toBe("function");
        expect(typeof engine.judgeHoopRun).toBe("function");
        expect(typeof engine.defaultWorld).toBe("function");
        expect(engine.ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
        expect(engine.BALL_IDS).toEqual(["blue", "red", "black", "yellow"]);
    });

    it("simulates a shot on the default world", () => {
        const world = engine.defaultWorld();
        const r = world.ball.radius;
        const result = engine.simulateFreeMotion(
            {
                blue: {
                    position: engine.vec3(5, 5, r),
                    velocity: engine.vec3(2, 0, 0),
                    angularVelocity: engine.vec3(0, 0, 0),
                },
            },
            world,
        );
        expect(result.aborted).toBe(false);
        expect(result.rest.blue?.x).toBeGreaterThan(5);
    });
});
