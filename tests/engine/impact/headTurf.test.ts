import { describe, expect, it } from "vitest";
import { HEAD_TURF_KEY, headLowestPoint } from "../../../src/engine/impact/contacts";
import { HEAD_REST_SPEED, headTurfLawOf } from "../../../src/engine/impact/headTurf";
import {
    HEAD_DEEP_LIMIT,
    IMPACT_CAP,
    IMPACT_DT,
    RELEASE_STEPS,
    integrate,
    type ImpactBall,
    type ImpactSnapshot,
} from "../../../src/engine/impact/integrate";
import { IDENTITY, axisAngle, multiply, type Quaternion } from "../../../src/engine/impact/rigidBody";
import { prepareImpact, simulateImpact } from "../../../src/engine/impact/simulateImpact";
import { staticSink } from "../../../src/engine/impact/turfBed";
import type { HeadTurfLaw, MalletHead } from "../../../src/engine/impact/types";
import { ZERO, horizontal, length, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import type { SurfaceProps } from "../../../src/engine/types";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import { TEST_BALL, ballAt, testWorld } from "../support/fixtures";
import {
    TEST_BOX,
    TEST_HEAD,
    TEST_RHO,
    freeBall,
    isolated,
    levelArc,
    mirrorQuat,
    mirrorSpin,
    mirrorVec,
    onArc,
    recorder,
    strike,
    testBed,
    testHeadTurf,
    trackDrive,
} from "../support/impact";

const g = STANDARD_GRAVITY;
const R = TEST_BALL.radius;
const LAW = testHeadTurf();
const rel = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);
const same = (a: Vec3, b: Vec3): boolean => a.x === b.x && a.y === b.y && a.z === b.z;

/** An undriven `head` at `position`, under gravity, on the test head–turf law (or `law`); `balls` if any. */
function onTurf(
    head: MalletHead,
    position: Vec3,
    velocity: Vec3 = ZERO,
    orientation: Quaternion = IDENTITY,
    law: HeadTurfLaw = LAW,
    balls: readonly ImpactBall[] = [],
) {
    return isolated({
        head,
        start: { position, orientation, velocity, angularVelocity: ZERO },
        gravity: g,
        headTurf: law,
        balls,
    });
}

describe("the head–turf pair in the impact (P2b.2b.2b.3 design §4)", () => {
    it("ends a dropped box's impact with impact-head-stopped, RELEASE_STEPS after it first rests in the turf", () => {
        // §4.6. A level box set down with no horizontal speed never loads its spring, so it is at rest in the turf
        // once its centre's speed, vertical included (user ruling 2026-10-16), stays under HEAD_REST_SPEED: from the
        // first step whose starting state is that slow and every later one is too, traced through the probe (the
        // snapshot at t is the state the step starting at t reads; the last is read by no step). With no face contact
        // the impact ends RELEASE_STEPS after that step's start.
        const probe = recorder();
        const run = integrate(onTurf(TEST_BOX, vec3(0, 0, TEST_RHO + 1e-4)), { cap: 0.05, probe });
        const line = run.timeline[HEAD_TURF_KEY] ?? [];
        expect(line.length).toBeGreaterThan(0);
        expect(run.events.map((e) => e.kind)).toEqual(["impact-head-stopped"]);
        const read = probe.snapshots.slice(0, -1);
        const moving = read.map((s) => length(s.head.velocity) >= HEAD_REST_SPEED).lastIndexOf(true);
        const rest = (read[moving + 1] as ImpactSnapshot).t;
        expect(rest).toBeGreaterThan(line[0]?.start as number);
        expect(run.duration).toBeCloseTo(rest + RELEASE_STEPS * IMPACT_DT, 12);
    });

    it("stops a box sliding on the turf dead: impact-head-stopped, not impact-cap", () => {
        // §4.6, §7.4 regime 2 in small. TEST_BOX set down moving 0.1 m/s along aim: at its micrometre sink the sole's
        // friction, about µ·m·g, does nearly all the braking (the ploughing is a few hundredths of a newton), so it
        // stops within about v²/(2·µ·g), 1.0 mm, and comes to rest well inside the cap.
        const v = 0.1;
        const run = integrate(onTurf(TEST_BOX, vec3(0, 0, TEST_RHO), vec3(v, 0, 0)), { cap: 0.1 });
        expect(run.events.map((e) => e.kind)).toEqual(["impact-head-stopped"]);
        expect(length(horizontal(run.head.velocity))).toBeLessThan(HEAD_REST_SPEED);
        expect(run.head.position.x).toBeGreaterThan(0);
        expect(run.head.position.x).toBeLessThan((1.5 * v * v) / (2 * LAW.friction * g));
    });

    it("ends a struck impact RELEASE_STEPS after the ball leaves the face, the head still sliding on the turf", () => {
        // §4.6. A head sliding on the turf at 0.15 m/s strikes a ball resting on its bed 2 mm ahead. Once the ball has
        // been struck and the drive is done, the head's turf contact is the follow-through's (user ruling
        // 2026-10-16) and no longer holds the impact open, so the impact ends RELEASE_STEPS after the face interval,
        // well within IMPACT_CAP, the head still sliding. P2b.2b.2b.3: the turf strike (was: ends at 24.42 ms, the
        // head at rest, 0.61 mm/s; now 21.64 ms, sliding at 13.1 mm/s). TEST_HEAD, as a force table's face–ball pair
        // is the cylinder's alone (faceContact).
        const sink = staticSink(0.117 + R, 0, R, TEST_BALL.mass * g, testBed());
        const blue = freeBall("blue", vec3(TEST_HEAD.length / 2 + 0.002 + R, 0, R - sink), ZERO, testBed());
        const run = integrate(onTurf(TEST_HEAD, vec3(0, 0, TEST_RHO), vec3(0.15, 0, 0), IDENTITY, LAW, [blue]));
        const kinds = run.events.map((e) => e.kind);
        const face = run.timeline["face/blue"] ?? [];
        const turf = run.timeline[HEAD_TURF_KEY] ?? [];
        expect(face).toHaveLength(1);
        expect(kinds).not.toContain("impact-cap");
        expect(kinds).not.toContain("impact-head-stopped");
        expect(run.duration).toBeCloseTo((face[0]?.end as number) + RELEASE_STEPS * IMPACT_DT, 12);
        expect(run.duration).toBeLessThan(IMPACT_CAP);
        expect(turf[turf.length - 1]?.end).toBe(run.duration);
        expect(length(horizontal(run.head.velocity))).toBeGreaterThan(HEAD_REST_SPEED);
    });

    it("raises turf-yield once, when a column first yields", () => {
        // A box pitched 0.3 rad meets the turf on its edge at 1 m/s, its lowest point starting 1 mm above the plane:
        // the few columns under the edge pass the yield depth (0.67 mm on the test law) within a millisecond, and
        // more yield after; the event is raised once.
        const q = axisAngle(vec3(0, 1, 0), 0.3);
        const placed = { position: vec3(0, 0, 0.1), orientation: q, velocity: ZERO, angularVelocity: ZERO };
        const z = 0.1 - headLowestPoint(placed, TEST_BOX) + 0.001;
        const run = integrate(onTurf(TEST_BOX, vec3(0, 0, z), vec3(0, 0, -1), q), { cap: 0.02 });
        expect(run.events.filter((e) => e.kind === "turf-yield")).toHaveLength(1);
    });

    it("raises impact-head-deep just over HEAD_DEEP_LIMIT, and not just under", () => {
        // Its measure is the head's lowest point, as before (design §4.4): a stroke gone beyond a graze.
        const over = integrate(onTurf(TEST_HEAD, vec3(0, 0, TEST_RHO - HEAD_DEEP_LIMIT - 1e-6)), { cap: 1e-3 });
        expect(over.events.filter((e) => e.kind === "impact-head-deep").map((e) => e.t)).toEqual([IMPACT_DT]);
        expect(over.events.some((e) => e.kind === "impact-mallet-grounded")).toBe(false);
        const under = integrate(onTurf(TEST_HEAD, vec3(0, 0, TEST_RHO - HEAD_DEEP_LIMIT + 1e-6)), { cap: 1e-3 });
        expect(under.events.some((e) => e.kind === "impact-head-deep")).toBe(false);
    });

    it("mirrors a box sliding into the turf across y = 0, to the bit", () => {
        const q = multiply(axisAngle(vec3(0, 0, 1), 0.3), axisAngle(vec3(0, 1, 0), 0.05));
        const start = { position: vec3(0.01, 0.003, TEST_RHO + 0.002), velocity: vec3(0.4, 0.1, -0.2) };
        const a = integrate(onTurf(TEST_BOX, start.position, start.velocity, q), { cap: 5e-3 });
        const b = integrate(onTurf(TEST_BOX, mirrorVec(start.position), mirrorVec(start.velocity), mirrorQuat(q)), {
            cap: 5e-3,
        });
        expect(a.timeline[HEAD_TURF_KEY]?.length).toBeGreaterThan(0);
        expect(same(mirrorVec(a.head.position), b.head.position)).toBe(true);
        expect(same(mirrorVec(a.head.velocity), b.head.velocity)).toBe(true);
        expect(same(mirrorSpin(a.head.angularVelocity), b.head.angularVelocity)).toBe(true);
        const qa = mirrorQuat(a.head.orientation);
        const qb = b.head.orientation;
        expect(qa.w === qb.w && qa.x === qb.x && qa.y === qb.y && qa.z === qb.z).toBe(true);
    });

    it("converges in dt and in the lattice: where a sliding box comes to rest", () => {
        // The box of "stops a box sliding on the turf dead", at IMPACT_DT and at half of it, and on 2 mm and 1 mm
        // columns: its rest position agrees within 1 % (dt) and 2 % (the lattice, whose sole's area and edges move by
        // a column's share).
        const rest = (dt: number, law: HeadTurfLaw): number =>
            integrate(onTurf(TEST_BOX, vec3(0, 0, TEST_RHO), vec3(0.1, 0, 0), IDENTITY, law), { dt, cap: 0.1 }).head
                .position.x;
        const base = rest(IMPACT_DT, LAW);
        expect(rel(rest(IMPACT_DT / 2, LAW), base)).toBeLessThan(0.01);
        expect(rel(rest(IMPACT_DT, testHeadTurf({ cell: 0.001 })), base)).toBeLessThan(0.02);
        // About 41 s in the local suite, 54 s on the CI runner.
    }, 180_000);

    it("is given to a tracked drive and not to a force table", () => {
        const world = testWorld();
        const blue = ballAt(5, 0);
        const turf = world.lawn.surfaceAt(blue.position);
        const tracked = onArc(trackDrive(levelArc(vec3(4, 0, 0.1))));
        expect(prepareImpact(tracked, { blue }, world).headTurf).toEqual(headTurfLawOf(turf));
        expect(prepareImpact(strike(blue.position), { blue }, world).headTurf).toBeNull();
    });

    it("rejects a tracked drive over turf the head–turf law cannot use", () => {
        // Decision 17. The lawn is good at the ball and the court's centre (validateWorld samples there), bad under the
        // head.
        const good = testWorld().lawn.surfaceAt(vec3(15, 20, 0));
        const under = (bad: Partial<SurfaceProps>) =>
            testWorld({
                lawn: { width: 30, length: 40, surfaceAt: (p) => (p.x < 4.5 ? { ...good, ...bad } : good) },
            });
        const blue = ballAt(5, 0);
        const tracked = onArc(trackDrive(levelArc(vec3(4.2, 0, TEST_RHO + 0.01))));
        for (const [bad, message] of [
            [{ turfYield: 0 }, /turfYield under the head must be a positive finite number/],
            [{ turfMatStrength: -1 }, /turfMatStrength under the head must be a positive finite number/],
            [{ bedModulus: 0 }, /bedModulus under the head must be a positive finite number/],
            [{ bedRecovery: Number.NaN }, /bedRecovery under the head must be a positive finite number/],
        ] as const) {
            expect(() => simulateImpact(tracked, { blue }, under(bad))).toThrow(message);
        }
    });
});
