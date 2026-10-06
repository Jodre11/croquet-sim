import { describe, expect, it } from "vitest";
import { lawFromStiffness } from "../../../src/engine/impact/contactLaw";
import { HEAD_TURF_KEY, type HeadRegion } from "../../../src/engine/impact/contacts";
import { ENTRY_SLACK, integrate, type ImpactBall, type ImpactSetup } from "../../../src/engine/impact/integrate";
import { IDENTITY } from "../../../src/engine/impact/rigidBody";
import { headOnPath, prepareTrack } from "../../../src/engine/impact/track";
import type { Hands, SwingArc } from "../../../src/engine/impact/types";
import { ZERO, add, dot, scale, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import type { BallState } from "../../../src/engine/types";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import { TEST_BALL, TEST_TURF } from "../support/fixtures";
import { TEST_COUPLING, TEST_HANDS, TEST_HEAD, freeBall, isolated, levelArc, trackDrive } from "../support/impact";

const R = TEST_BALL.radius;
const L = TEST_HEAD.length;
const RHO = TEST_HEAD.radius;
/** The head's centre on the paths here, level, body frame along the world's; gravity is off unless a case sets it. */
const C = vec3(0, 0, 1);
/** A levelArc's pivot from the head's centre: its radius plus the socket's height. */
const ARM = levelArc(C).radius + TEST_HEAD.socket.z;
const NO_JUMPS = { count: 0, worst: 0, keys: [] };
const TURF = lawFromStiffness(TEST_HEAD.mass, TEST_TURF.turfRestitution, TEST_TURF.turfStiffness, 0.5);

/** An isolated set-up whose head is held on `arc`'s path, by TEST_COUPLING and `hands`, with `balls`. */
function held(
    arc: SwingArc,
    balls: readonly ImpactBall[],
    over: Partial<ImpactSetup> = {},
    hands: Hands = TEST_HANDS,
): ImpactSetup {
    const track = prepareTrack(trackDrive(arc, TEST_COUPLING, hands), TEST_HEAD, over.gravity ?? 0);
    return isolated({ start: headOnPath(track, TEST_HEAD, 0), drive: track, balls, ...over });
}

describe("the whole head against a ball (a tracked drive)", () => {
    const s = Math.SQRT1_2;
    // Each region's surface point, from the head's centre, and its outward normal.
    const REGIONS: readonly [HeadRegion, Vec3, Vec3][] = [
        ["face", vec3(L / 2, 0, 0), vec3(1, 0, 0)],
        ["rim", vec3(L / 2, 0.6 * RHO, 0.8 * RHO), vec3(s, 0.6 * s, 0.8 * s)],
        ["barrel", vec3(0, RHO, 0), vec3(0, 1, 0)],
        ["back-rim", vec3(-L / 2, 0, -RHO), vec3(-s, 0, -s)],
        ["back", vec3(-L / 2, 0, 0), vec3(-1, 0, 0)],
    ];

    it.each(REGIONS)("meets a ball on the %s, records it by region and flags it once off the face", (region, at, n) => {
        // The ball starts 0.1 mm clear and moves in along the normal at 1 m/s; the head is held on a still path.
        // Prototype (aeadd4c): one interval, the ball leaving outward, no entry jump, on every region.
        const ball = freeBall("blue", add(add(C, at), scale(n, R + 1e-4)), scale(n, -1));
        const run = integrate(held(levelArc(C), [ball]), { cap: 5e-3 });
        const key = `face/blue#${region}`;
        expect(Object.keys(run.headRegions ?? {})).toEqual([key]);
        expect(run.timeline["face/blue"]).toHaveLength(1);
        expect(run.headRegions?.[key]).toEqual(run.timeline["face/blue"]);
        expect(dot((run.balls.blue as BallState).velocity, n)).toBeGreaterThan(0);
        const flagged = run.events.filter((e) => e.kind === "impact-off-face").map((e) => ("ball" in e ? e.ball : ""));
        expect(flagged).toEqual(region === "face" ? [] : ["blue"]);
        expect(run.entryJumps).toEqual(NO_JUMPS);
    });

    it("leaves a force table's face pair as it was: a ball passes through the barrel untouched", () => {
        // Passes before this task and after it: the force table keeps faceContact, which has no barrel.
        const ball = freeBall("blue", add(C, vec3(0, RHO + R + 1e-4, 0)), vec3(0, -1, 0));
        const start = { position: C, orientation: IDENTITY, velocity: ZERO, angularVelocity: ZERO };
        const run = integrate(isolated({ start, balls: [ball] }), { cap: 2e-3 });
        expect(run.timeline["face/blue"]).toBeUndefined();
        expect((run.balls.blue as BallState).velocity).toEqual(vec3(0, -1, 0));
        expect(run).not.toHaveProperty("headRegions");
        expect(run).not.toHaveProperty("entryJumps");
    });
});

describe("the re-entry guard", () => {
    it("counts a ball placed inside the head before a step as one entry jump, with its key and region", () => {
        // 2 mm into the barrel at rest: the interval's first step is 2 mm deep with no closing speed. Prototype: one
        // jump, worst 2e-3 − 1e-6 m.
        const ball = freeBall("blue", add(C, vec3(0, RHO + R - 2e-3, 0)));
        const run = integrate(held(levelArc(C), [ball]), { cap: 1e-3 });
        expect(run.entryJumps?.count).toBe(1);
        expect(run.entryJumps?.keys).toEqual(["face/blue#barrel@0"]);
        expect(run.entryJumps?.worst).toBeCloseTo(2e-3 - ENTRY_SLACK, 12);
        expect(Object.keys(run.headRegions ?? {})).toEqual(["face/blue#barrel"]);
    });

    it("counts a head started in the turf as one entry jump on head/turf, and reports none for a force table", () => {
        const low = vec3(0, 0, RHO - 3e-3);
        const over = { gravity: STANDARD_GRAVITY, headTurf: TURF };
        const run = integrate(held(levelArc(low), [], over), { cap: 1e-3 });
        expect(run.entryJumps?.count).toBe(1);
        expect(run.entryJumps?.keys).toEqual([`${HEAD_TURF_KEY}@0`]);
        expect(run.entryJumps?.worst).toBeCloseTo(3e-3 - ENTRY_SLACK, 12);
        const start = { position: low, orientation: IDENTITY, velocity: ZERO, angularVelocity: ZERO };
        expect(integrate(isolated({ start, ...over }), { cap: 1e-3 })).not.toHaveProperty("entryJumps");
    });

    it("counts none for a ball the head closes on at speed, on the face or on the rim", () => {
        // A contact closing at v_n opens at most v_n·dt deep in its first step. Prototype: no jump in any case.
        const cases: readonly [number, number, HeadRegion][] = [
            [3, 0, "face"],
            [10, 0, "face"],
            [3, RHO + 0.02, "rim"],
        ];
        for (const [speed, side, region] of cases) {
            // 1 µm ahead of the face; or, centre 20 mm out from the barrel's line, 0.1 mm off the rim.
            const ahead = side === 0 ? R + 1e-6 : Math.sqrt(R * R - 0.02 * 0.02) + 1e-4;
            const ball = freeBall("blue", add(C, vec3(L / 2 + ahead, side, 0)));
            const run = integrate(held(levelArc(C, { omega0: speed / ARM }), [ball]), { cap: 0.02 });
            expect(Object.keys(run.headRegions ?? {}), `${speed} m/s`).toEqual([`face/blue#${region}`]);
            expect(run.entryJumps, `${speed} m/s on the ${region}`).toEqual(NO_JUMPS);
        }
    });

    it("counts none for a relaxed head settling onto the turf", () => {
        // Task 6's relaxed head, γ_T = 0.1, 1 mm above the turf: it arrives at under 0.13 m/s. Prototype: no jump.
        const hands = { ...TEST_HANDS, gripTension: 0.1 };
        const over = { gravity: STANDARD_GRAVITY, headTurf: TURF };
        const run = integrate(held(levelArc(vec3(0, 0, RHO + 1e-3)), [], over, hands));
        expect(run.timeline[HEAD_TURF_KEY]).toHaveLength(1);
        expect(run.entryJumps).toEqual(NO_JUMPS);
        expect(run.headRegions).toEqual({});
    });
});
