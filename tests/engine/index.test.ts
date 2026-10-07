import { describe, expect, it } from "vitest";
import * as engine from "../../src/engine/index";

/**
 * Every type spec §6.5 adds to the public API (P2b.2b.1). Naming them here makes `npm run check` fail if one is not
 * exported; Vitest does not type-check.
 */
type Exported = [
    engine.ShotSetup,
    engine.StrokeTiming,
    engine.SwingProfile,
    engine.SwingStance,
    engine.SwingDrive,
    engine.StrokeType,
    engine.StrokeMode,
    engine.ShotOutcome,
    engine.SwingApproach,
    engine.ContactState,
    engine.Drive,
    engine.SwingArc,
    engine.Coupling,
    engine.Hands,
    engine.ImpactResult,
    engine.ImpactEvent,
    engine.StrokeContext,
    engine.FaultReport,
    engine.Finding,
];

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

    it("exposes the whole shot, the impact and the fault judge (P2b.2b.1)", () => {
        expect(typeof engine.simulateShot).toBe("function");
        expect(typeof engine.simulateImpact).toBe("function");
        expect(typeof engine.judgeFaults).toBe("function");
        expect(engine.CROQUET_STROKES).toEqual(["drive", "stop-ac", "half-roll", "full-roll", "pass-roll"]);
        expect(engine.ON_TIME).toEqual({ arc: 0, hands: 0, dip: 0 });
        expect(engine.defaultProfile.mallet.headMass).toBeGreaterThan(0);
        expect(engine.ENGINE_VERSION).toBe("0.6.0");
        const types: Exported | null = null;
        expect(types).toBeNull();
    });

    it("simulates a whole single-ball shot on the default world", () => {
        const world = engine.defaultWorld();
        const still = engine.vec3(0, 0, 0);
        const blue = { position: engine.vec3(9.6012, 4, world.ball.radius), velocity: still, angularVelocity: still };
        const setup: engine.ShotSetup = {
            balls: { blue },
            striker: "blue",
            stroke: {
                type: "single-ball",
                aim: Math.PI / 2,
                backswing: 0.3,
                drive: 0,
                contact: { up: 0, side: 0 },
                timing: engine.ON_TIME,
            },
            live: [],
            continuation: false,
            hampered: false,
            jumpAttempt: false,
            lawnSpeed: 12,
            profile: engine.defaultProfile,
        };
        const outcome = engine.simulateShot(setup);
        expect(outcome.motion.aborted).toBe(false);
        expect(outcome.motion.rest.blue?.y).toBeGreaterThan(4);
    });
});
