import { describe, expect, it } from "vitest";
import { length, sub, vec3 } from "../../src/engine/math/vec3";
import { endOfPhase, rollingSpin } from "../../src/engine/motion";
import {
    STANDARD_GRAVITY,
    defaultWorld,
    motionParamsAt,
    obstaclesOf,
    rollingResistanceForLawnSpeed,
    turfAt,
    uniformLawn,
    uprightsOf,
    validateWorld,
} from "../../src/engine/world";
import { contactReference } from "../../src/reference/index";
import { TEST_TURF, hoopWithUprightAt, testHoop, testWorld } from "./support/fixtures";

describe("rollingResistanceForLawnSpeed", () => {
    it("makes a ball launched at 2D/T roll exactly D in T seconds", () => {
        const T = 12;
        const D = 30;
        const mu = rollingResistanceForLawnSpeed(T, D, STANDARD_GRAVITY);
        const params = {
            radius: 0.046,
            slidingDecel: 1,
            rollingDecel: mu * STANDARD_GRAVITY,
            gravity: STANDARD_GRAVITY,
        };
        const v = vec3((2 * D) / T, 0, 0);
        const end = endOfPhase(
            { position: vec3(0, 0, 0.046), velocity: v, angularVelocity: rollingSpin(v, 0, 0.046) },
            "rolling",
            params,
        );
        expect(end.position.x).toBeCloseTo(D, 9);
    });
});

describe("hoops and obstacles", () => {
    it("separates the uprights' inner surfaces by the hoop's inner width", () => {
        const hoop = testHoop("1", 10, 10);
        const [a, b] = uprightsOf(hoop, { restitution: 0.5, friction: 0.1 });
        expect(length(sub(a.centre, b.centre)) - 2 * hoop.uprightRadius).toBeCloseTo(hoop.innerWidth, 12);
        expect(a.id).toBe("1/a");
        expect(b.id).toBe("1/b");
    });

    it("gives both uprights their hoop's impact contact time", () => {
        const hoop = { ...testHoop("1", 10, 10), contactTime: 1.2e-3 };
        const [a, b] = uprightsOf(hoop, { restitution: 0.5, friction: 0.1 });
        expect(a.contactTime).toBe(1.2e-3);
        expect(b.contactTime).toBe(1.2e-3);
    });

    it("places a hoop by its first upright", () => {
        const [a] = uprightsOf(hoopWithUprightAt("1", 7, 8), { restitution: 0.5, friction: 0.1 });
        expect(length(sub(a.centre, vec3(7, 8, 0)))).toBeLessThan(1e-14);
    });

    it("lists uprights in hoop order, then the peg", () => {
        const world = testWorld({ hoops: [testHoop("1", 5, 5), testHoop("2", 5, 35)] });
        expect(obstaclesOf(world).map((o) => o.id)).toEqual(["1/a", "1/b", "2/a", "2/b", "peg"]);
    });
});

describe("motionParamsAt", () => {
    it("scales surface coefficients by gravity", () => {
        const p = motionParamsAt(testWorld(), vec3(1, 1, 0));
        expect(p.slidingDecel).toBeCloseTo(0.3 * STANDARD_GRAVITY, 12);
        expect(p.rollingDecel).toBeCloseTo(0.05 * STANDARD_GRAVITY, 12);
        expect(p.gravity).toBe(STANDARD_GRAVITY);
    });
});

describe("turfAt", () => {
    it("pairs the surface's turf restitution with its sliding friction", () => {
        expect(turfAt(testWorld(), vec3(1, 1, 0))).toEqual({ restitution: 0.5, friction: 0.3 });
    });
});

describe("validateWorld", () => {
    it("accepts the test world", () => {
        expect(() => validateWorld(testWorld())).not.toThrow();
    });

    it.each([
        ["non-positive gravity", { gravity: 0 }],
        ["restitution above 1", { ballBall: { restitution: 1.2, friction: 0 } }],
        ["negative friction", { ballUpright: { restitution: 0.5, friction: -0.1 } }],
        ["negative halt margin", { haltMargin: -1 }],
        [
            "rolling resistance above sliding friction",
            { lawn: uniformLawn(30, 40, { slidingFriction: 0.1, rollingResistance: 0.2, ...TEST_TURF }) },
        ],
        ["non-unit hoop normal", { hoops: [{ ...testHoop("1", 5, 5), normal: vec3(0, 2, 0) }] }],
        [
            "turf restitution above 1",
            {
                lawn: uniformLawn(30, 40, {
                    slidingFriction: 0.3,
                    rollingResistance: 0.05,
                    ...TEST_TURF,
                    turfRestitution: 1.5,
                }),
            },
        ],
        [
            "non-positive turf stiffness",
            {
                lawn: uniformLawn(30, 40, {
                    slidingFriction: 0.3,
                    rollingResistance: 0.05,
                    ...TEST_TURF,
                    turfStiffness: 0,
                }),
            },
        ],
        [
            "non-positive bed modulus",
            {
                lawn: uniformLawn(30, 40, {
                    slidingFriction: 0.3,
                    rollingResistance: 0.05,
                    ...TEST_TURF,
                    bedModulus: 0,
                }),
            },
        ],
        [
            "non-positive bed recovery",
            {
                lawn: uniformLawn(30, 40, {
                    slidingFriction: 0.3,
                    rollingResistance: 0.05,
                    ...TEST_TURF,
                    bedRecovery: -1,
                }),
            },
        ],
        ["non-positive ball–ball contact time", { ballBallContactTime: 0 }],
        ["non-positive crown clearance", { hoops: [{ ...testHoop("1", 5, 5), crownClearance: 0 }] }],
        ["non-positive hoop contact time", { hoops: [{ ...testHoop("1", 5, 5), contactTime: 0 }] }],
        ["non-positive peg contact time", { peg: { ...testWorld().peg, contactTime: -1 } }],
    ])("rejects %s", (_label, overrides) => {
        expect(() => validateWorld(testWorld(overrides))).toThrow(RangeError);
    });
});

describe("defaultWorld", () => {
    it("builds a valid world from the reference data", () => {
        const world = defaultWorld();
        expect(() => validateWorld(world)).not.toThrow();
        expect(world.hoops).toHaveLength(6);
        for (const hoop of world.hoops) {
            expect(hoop.innerWidth).toBeGreaterThan(2 * world.ball.radius);
            expect(hoop.crownClearance).toBeGreaterThan(2 * world.ball.radius);
        }
        const surface = world.lawn.surfaceAt(vec3(1, 1, 0));
        expect(surface.turfRestitution).toBeGreaterThan(0);
        expect(surface.turfStiffness).toBeGreaterThan(0);
        expect(world.ballBallContactTime).toBeGreaterThan(0);
        const T = contactReference.ballObstacleContactTime.value;
        expect(world.hoops.every((h) => h.contactTime === T)).toBe(true);
        expect(world.peg.contactTime).toBe(T);
    });

    it("gets slower lawns (fewer seconds) to decelerate balls harder", () => {
        const slow = motionParamsAt(defaultWorld(8), vec3(1, 1, 0)).rollingDecel;
        const fast = motionParamsAt(defaultWorld(14), vec3(1, 1, 0)).rollingDecel;
        expect(slow).toBeGreaterThan(fast);
    });
});
