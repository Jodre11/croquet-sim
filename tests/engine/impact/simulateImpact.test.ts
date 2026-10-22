import { describe, expect, it } from "vitest";
import { CONTACT_TOLERANCE } from "../../../src/engine/detect";
import { add, length, sub, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import { stateAtTime } from "../../../src/engine/sample";
import { simulateShot } from "../../../src/engine/shot";
import { ENGINE_VERSION, simulateFreeMotion } from "../../../src/engine/simulate";
import { buildContact } from "../../../src/engine/swing/buildContact";
import type { BallState, BallStates, SurfaceProps, World } from "../../../src/engine/types";
import { obstaclesOf } from "../../../src/engine/world";
import { obstacleContact } from "../../../src/engine/impact/contacts";
import { IMPACT_DT, type ImpactBall } from "../../../src/engine/impact/integrate";
import {
    prepareImpact,
    simulateImpact,
    sinkSolver,
    validateImpact,
    type SinkSolver,
} from "../../../src/engine/impact/simulateImpact";
import { prepareTrack, type Push } from "../../../src/engine/impact/track";
import { bedLawOf, staticSink } from "../../../src/engine/impact/turfBed";
import type { BoxShape } from "../../../src/engine/impact/shape";
import type { ContactState, Coupling, Hands, StrokeMode, SwingArc, TrackDrive } from "../../../src/engine/impact/types";
import { TEST_BALL, ballAt, hoopWithUprightAt, testWorld } from "../support/fixtures";
import {
    TEST_BOX,
    TEST_CHAIN,
    TEST_FLEX,
    TEST_HEAD,
    TEST_RHO,
    drive,
    levelArc,
    mirrorBall,
    mirrorContact,
    mirrorVec,
    onArc,
    strike,
    trackDrive,
} from "../support/impact";
import { canonicalSetup } from "../support/shot";

const R = TEST_BALL.radius;
const WORLD = testWorld();
const BLUE = ballAt(5, 0);
/**
 * Blue's centre where the impact starts it: lowered by its static sink on the bed (P2b.2b.2b.2a: turf bed; was
 * m·g/k_turf).
 */
const SUNK = vec3(
    5,
    0,
    R - staticSink(5, 0, R, TEST_BALL.mass * WORLD.gravity, bedLawOf(WORLD.lawn.surfaceAt(BLUE.position))),
);

describe("simulateImpact", () => {
    it("is version 0.15.0", () => {
        expect(ENGINE_VERSION).toBe("0.15.0");
    });

    it("starts a centre-struck ball rolling at 5/7 of its launch speed in phase 2", () => {
        const result = simulateImpact(strike(BLUE.position), { blue: BLUE }, WORLD);
        const h = result.handover.blue;
        expect(h?.position.z).toBe(R);
        // P2b.2b.2b.2a: turf bed (was 0: the ball sat still in its plane sink). Sliding over fresh cells, the ball
        // rides about 0.32 mm deep in a slow vertical oscillation of a few µm, which the strike starts (traced); the
        // impact ends at the drive window's close, 3 ms, with it rising at 4.7 mm/s, above SETTLE_SPEED, so the
        // handover keeps it: a hop of about a millisecond that phase 2 lands.
        expect(h?.velocity.z as number).toBeGreaterThan(0);
        expect(h?.velocity.z as number).toBeLessThan(0.01);
        const launch = length(h?.velocity ?? vec3(0, 0, 0));
        const free = simulateFreeMotion(result.handover, WORLD);
        const rolling = free.events.find((e) => e.kind === "phase" && e.ball === "blue" && e.phase === "rolling");
        expect(rolling).toBeDefined();
        const v = length(stateAtTime(free, "blue", (rolling as { t: number }).t).velocity);
        // Turf friction during the ~1 ms impact moves a few mm/s between speed and spin; it shifts this by < 1 %.
        expect(Math.abs(v / launch - 5 / 7) / (5 / 7)).toBeLessThan(0.01);
    });

    it("hands a ball driven into the turf over airborne, and phase 2 lands it", () => {
        const result = simulateImpact(
            strike(BLUE.position, { speed: 3, descent: 0.5, pitch: 0.5 }),
            { blue: BLUE },
            WORLD,
        );
        expect(result.events.some((e) => e.kind === "turf-lift")).toBe(true);
        expect(result.handover.blue?.velocity.z).toBeGreaterThan(0);
        const free = simulateFreeMotion(result.handover, WORLD);
        expect(free.events.some((e) => e.kind === "landing" && e.ball === "blue")).toBe(true);
    });

    it("leaves a ball nobody strikes at rest", () => {
        const balls: BallStates = { blue: BLUE, yellow: ballAt(8, 3) };
        const result = simulateImpact(strike(BLUE.position), balls, WORLD);
        expect(length(result.balls.yellow?.velocity ?? vec3(1, 0, 0))).toBeLessThan(1e-9);
        expect(result.handover.yellow?.position).toEqual(vec3(8, 3, R));
        // P2b.2b.2b.2a: turf bed (was exactly zero). Yellow sits over a lattice corner, so its cells balance, but to
        // rounding only (the bed's summation order is symmetric about y = 0, not about the ball): about 1e-16 m/s.
        expect(length(result.handover.yellow?.velocity ?? vec3(1, 0, 0))).toBeLessThan(1e-12);
        expect(result.handover.yellow?.velocity.z).toBe(0);
    });

    it("sends both balls of a croquet stroke forward, the croqueted one faster", () => {
        const result = simulateImpact(
            strike(BLUE.position, { speed: 3 }),
            { blue: BLUE, red: ballAt(5 + 2 * R, 0) },
            WORLD,
        );
        const blue = result.handover.blue?.velocity.x as number;
        const red = result.handover.red?.velocity.x as number;
        expect(red).toBeGreaterThan(blue);
        expect(blue).toBeGreaterThan(0);
        expect(() => simulateFreeMotion(result.handover, WORLD)).not.toThrow();
    });

    it("flags a ball within reach that the head is still closing on", () => {
        // Blue is struck 30 mm off the face axis. Red sits on the axis's other side, 65 mm from it (within the reach
        // r + R = 78 mm), its centre 1.5·R in front of the face plane (within 2R), and 95 mm from blue's line, so blue
        // passes it. The head, slower than blue after the strike, is still coming on to red when the impact ends.
        const contact = strike(BLUE.position, { speed: 2, lateral: -0.03 });
        const red = ballAt(5 + 0.5 * R - 1e-3, 0.095);
        const result = simulateImpact(contact, { blue: BLUE, red }, WORLD);
        expect(result.events.filter((e) => e.kind === "impact-head-approaching")).toEqual([
            { kind: "impact-head-approaching", t: result.duration, ball: "red" },
        ]);
    });

    it("accepts a face touching the ball where it starts, at its static sink", () => {
        const contact = strike(SUNK, { speed: 0, gap: 0, pitch: -0.02, yaw: 0.1, vertical: -0.025 });
        expect(() => simulateImpact(contact, { blue: BLUE }, WORLD)).not.toThrow();
    });

    it("rejects a face touching the ball at z = R that its sink would press into the face", () => {
        // The face tilts up (pitch −0.05), so lowering the ball by its sink moves it sink·n_z into the face.
        const contact = strike(BLUE.position, { speed: 0, gap: 0, pitch: -0.05 });
        expect(() => simulateImpact(contact, { blue: BLUE }, WORLD)).toThrow(/head penetrates ball blue/);
    });
});

describe("validation", () => {
    const ok = strike(BLUE.position);
    const good = WORLD.lawn.surfaceAt(vec3(15, 20, 0));
    const badAtBall = (bad: Partial<SurfaceProps>): World =>
        testWorld({ lawn: { width: 30, length: 40, surfaceAt: (p) => (p.x < 10 ? { ...good, ...bad } : good) } });
    // Each case names the check that must fire, so a case cannot pass on another check's error.
    const cases: [string, ContactState, BallStates, World, RegExp][] = [
        ["a moving ball", ok, { blue: { ...BLUE, velocity: vec3(0.1, 0, 0) } }, WORLD, /ball blue is not at rest/],
        [
            "a spinning ball",
            ok,
            { blue: { ...BLUE, angularVelocity: vec3(0, 1, 0) } },
            WORLD,
            /ball blue is not at rest/,
        ],
        [
            "a ball off the lawn plane",
            ok,
            { blue: { ...BLUE, position: vec3(5, 0, R + 1e-3) } },
            WORLD,
            /ball blue is not at rest/,
        ],
        [
            "overlapping balls",
            ok,
            { blue: BLUE, red: ballAt(5 + 2 * R - 1e-6, 0) },
            WORLD,
            /balls blue and red overlap/,
        ],
        [
            "a ball overlapping the peg",
            strike(vec3(15 - 0.02 - R + 1e-6, 20, R)),
            { blue: ballAt(15 - 0.02 - R + 1e-6, 20) },
            WORLD,
            /ball blue overlaps peg/,
        ],
        [
            "a ball overlapping the peg just past the contact tolerance",
            strike(vec3(15 - 0.02 - R + 1.5e-9, 20, R)),
            { blue: ballAt(15 - 0.02 - R + 1.5e-9, 20) },
            WORLD,
            /ball blue overlaps peg/,
        ],
        [
            "zero ball–upright restitution",
            ok,
            { blue: BLUE },
            testWorld({ ballUpright: { restitution: 0, friction: 0.1 } }),
            /ballUpright\.restitution/,
        ],
        [
            "zero peg restitution",
            ok,
            { blue: BLUE },
            testWorld({ peg: { ...WORLD.peg, material: { restitution: 0, friction: 0.1 } } }),
            /peg\.material\.restitution/,
        ],
        [
            "a non-positive peg contact time",
            ok,
            { blue: BLUE },
            testWorld({ peg: { ...WORLD.peg, contactTime: 0 } }),
            /peg\.contactTime/,
        ],
        [
            "the head in a ball",
            strike(BLUE.position, { gap: -1e-4 }),
            { blue: BLUE },
            WORLD,
            /head penetrates ball blue/,
        ],
        // The head's barrel is 0.032 m from its axis (y = 0, z = R); the ball's surface reaches 1 cm into it.
        [
            "the head's barrel in a ball",
            ok,
            { blue: BLUE, red: ballAt(5 - R - 1e-3 - 0.115, 0.032 + R - 0.01) },
            WORLD,
            /head penetrates ball red/,
        ],
        // 0.5·R beyond the rear face plane and 1 cm outside its rim, so the face check sees only the rim (OFF_FACE).
        [
            "the head's rim in a ball",
            ok,
            { blue: BLUE, red: ballAt(5 - 1.5 * R - 1e-3 - 0.23, 0.042) },
            WORLD,
            /head penetrates ball red/,
        ],
        [
            "the head in the turf",
            { ...ok, position: vec3(ok.position.x, ok.position.y, 0.01) },
            { blue: BLUE },
            WORLD,
            /head penetrates the turf/,
        ],
        [
            "an empty drive",
            { ...ok, drive: { kind: "force", samples: [] } },
            { blue: BLUE },
            WORLD,
            /drive must start at t = 0/,
        ],
        [
            "a drive not starting at 0",
            { ...ok, drive: { kind: "force", samples: [{ t: 1e-4, force: vec3(0, 0, 0) }] } },
            { blue: BLUE },
            WORLD,
            /drive must start at t = 0/,
        ],
        [
            "a drive not increasing",
            {
                ...ok,
                drive: { kind: "force", samples: [...drive(vec3(0, 0, 0), 1e-3), { t: 1e-3, force: vec3(0, 0, 0) }] },
            },
            { blue: BLUE },
            WORLD,
            /drive times must increase strictly/,
        ],
        ["a non-positive head mass", { ...ok, head: { ...ok.head, mass: 0 } }, { blue: BLUE }, WORLD, /head\.mass/],
        [
            "a non-positive inertia",
            { ...ok, head: { ...ok.head, inertia: vec3(1, 0, 1) } },
            { blue: BLUE },
            WORLD,
            /head\.inertia\.y/,
        ],
        [
            "a non-positive head length",
            { ...ok, head: { ...ok.head, length: -1 } },
            { blue: BLUE },
            WORLD,
            /head\.length/,
        ],
        [
            "a non-positive head radius",
            { ...ok, head: { ...ok.head, shape: { kind: "cylinder", radius: 0 } } },
            { blue: BLUE },
            WORLD,
            /head\.shape\.radius/,
        ],
        [
            "a box head with a non-positive half-width",
            { ...ok, head: { ...TEST_BOX, shape: { ...(TEST_BOX.shape as BoxShape), halfWidth: 0 } } },
            { blue: BLUE },
            WORLD,
            /head\.shape\.halfWidth/,
        ],
        [
            "a box head with a negative edge radius",
            { ...ok, head: { ...TEST_BOX, shape: { ...(TEST_BOX.shape as BoxShape), edgeRadius: -1e-3 } } },
            { blue: BLUE },
            WORLD,
            /head\.shape\.edgeRadius/,
        ],
        [
            "a box head whose edge radius reaches its half-width (review focus 2)",
            { ...ok, head: { ...TEST_BOX, shape: { ...(TEST_BOX.shape as BoxShape), edgeRadius: TEST_RHO } } },
            { blue: BLUE },
            WORLD,
            /head\.shape\.edgeRadius must lie in \[0, 0\.032\)/,
        ],
        ["a force table with a box head", { ...ok, head: TEST_BOX }, { blue: BLUE }, WORLD, /force table's head/],
        [
            "a non-positive shaft length",
            { ...ok, head: { ...ok.head, shaft: { mass: 0, length: 0 } } },
            { blue: BLUE },
            WORLD,
            /head\.shaft\.length/,
        ],
        [
            "a negative shaft mass",
            { ...ok, head: { ...ok.head, shaft: { mass: -0.1, length: 0.9 } } },
            { blue: BLUE },
            WORLD,
            /head\.shaft\.mass/,
        ],
        [
            "a force table with a shaft of mass",
            { ...ok, head: { ...ok.head, shaft: { mass: 0.3, length: 0.9 } } },
            { blue: BLUE },
            WORLD,
            /force table's shaft must have no mass/,
        ],
        [
            "negative face friction",
            { ...ok, face: { ...ok.face, friction: -0.1 } },
            { blue: BLUE },
            WORLD,
            /face\.friction/,
        ],
        [
            "zero ball–ball restitution",
            ok,
            { blue: BLUE },
            testWorld({ ballBall: { restitution: 0, friction: 0.05 } }),
            /ballBall\.restitution/,
        ],
        // P2b.2b.2b.2a: turf bed (was zero turf restitution, which no ball law reads now). The lawn is good at the
        // court's centre, where validateWorld samples it, and bad at the ball.
        ["a zero bed modulus at a ball", ok, { blue: BLUE }, badAtBall({ bedModulus: 0 }), /bedModulus at ball blue/],
        [
            "a zero bed recovery at a ball",
            ok,
            { blue: BLUE },
            badAtBall({ bedRecovery: 0 }),
            /bedRecovery at ball blue/,
        ],
        [
            "a non-unit orientation",
            { ...ok, orientation: { w: 2, x: 0, y: 0, z: 0 } },
            { blue: BLUE },
            WORLD,
            /orientation must be a unit quaternion/,
        ],
    ];

    it.each(cases)("rejects %s", (_label, contact, balls, world, message) => {
        expect(() => simulateImpact(contact, balls, world)).toThrow(RangeError);
        expect(() => simulateImpact(contact, balls, world)).toThrow(message);
    });

    it("accepts a tracked box head whose edge radius is just under its half-width (review focus 2)", () => {
        const head = { ...TEST_BOX, shape: { ...(TEST_BOX.shape as BoxShape), edgeRadius: TEST_RHO - 1e-6 } };
        const contact = onArc(trackDrive(levelArc(vec3(3, 0, 0.1))), head);
        expect(() => simulateImpact(contact, { blue: BLUE }, WORLD, { cap: 1e-3 })).not.toThrow();
    });

    it("accepts touching balls", () => {
        expect(() => simulateImpact(ok, { blue: BLUE, red: ballAt(5 + 2 * R, 0) }, WORLD)).not.toThrow();
    });
});

describe("the balls' static sinks", () => {
    it("are solved by sinkSolver as staticSink solves them, the same at every call", () => {
        const sink = sinkSolver(WORLD);
        const first = sink(BLUE.position);
        const weight = TEST_BALL.mass * WORLD.gravity;
        const red = ballAt(5, 0.5);
        expect(sink(red.position)).toBe(staticSink(5, 0.5, R, weight, bedLawOf(WORLD.lawn.surfaceAt(red.position))));
        expect(first).toBe(staticSink(5, 0, R, weight, bedLawOf(WORLD.lawn.surfaceAt(BLUE.position))));
        expect(sink(BLUE.position)).toBe(first);
    });

    it("are asked of the one solver by validateImpact and prepareImpact, once per ball each", () => {
        const red = ballAt(5, 0.5);
        const balls = { blue: BLUE, red };
        const contact = strike(BLUE.position);
        const real = sinkSolver(WORLD);
        const asked: number[] = [];
        const counted: SinkSolver = (p) => {
            asked.push(p.y);
            return real(p);
        };
        validateImpact(contact, balls, WORLD, counted);
        const setup = prepareImpact(contact, balls, WORLD, counted);
        expect(asked).toEqual([0, 0.5, 0, 0.5]);
        expect((setup.balls[0] as ImpactBall).state.position).toEqual(SUNK);
        // prepareImpact places a ball at the sink its solver gives.
        const given = prepareImpact(contact, { blue: BLUE }, WORLD, () => 1e-3);
        expect((given.balls[0] as ImpactBall).state.position.z).toBe(R - 1e-3);
    });
});

describe("a ball touching an obstacle", () => {
    const PEG = WORLD.peg;
    const reach = R + PEG.radius;

    it.each([
        ["exactly", 0],
        ["overlapping by rounding", 5e-10],
    ])("is accepted when touching %s, and starts at zero gap", (_label, overlap) => {
        const blue = ballAt(15 - reach + overlap, 20);
        // Struck away from the peg (yaw π: the head on the peg's side, travelling −x).
        const contact = strike(blue.position, { yaw: Math.PI });
        const p = (prepareImpact(contact, { blue }, WORLD).balls[0] as ImpactBall).state.position;
        expect(obstacleContact(p, R, PEG)).toBeNull();
        expect(R + PEG.radius - length(sub(vec3(p.x, p.y, 0), PEG.centre))).toBeLessThanOrEqual(0);
        expect(Math.abs(p.x - blue.position.x)).toBeLessThanOrEqual(CONTACT_TOLERANCE);
        expect(p.y).toBe(blue.position.y);
        expect(() => simulateImpact(contact, { blue }, WORLD)).not.toThrow();
    });

    it("ends clear of every obstacle when it touches the peg and an upright at once", () => {
        const overlap = 5e-10;
        const bx = 15 - reach + overlap;
        // The upright stands 120° round from the peg's direction and overlaps the ball by `overlap` too: the normals
        // are not parallel, so correcting for one can push the ball back into the other.
        const gap = R + 0.008 - overlap;
        const angle = (Math.PI * 2) / 3;
        const hoop = hoopWithUprightAt("h", bx + gap * Math.cos(angle), 20 + gap * Math.sin(angle));
        const blue = ballAt(bx, 20);
        const world = { ...WORLD, hoops: [hoop] };
        const contact = strike(blue.position, { yaw: Math.PI });
        const prepared = prepareImpact(contact, { blue }, world);
        const p = (prepared.balls[0] as ImpactBall).state.position;
        for (const o of obstaclesOf(world)) {
            expect(obstacleContact(p, R, o)).toBeNull();
        }
        const result = simulateImpact(contact, { blue }, world);
        expect(() => simulateFreeMotion(result.handover, world)).not.toThrow();
    });

    it("accepts a ball touching the peg and another ball", () => {
        const blue = ballAt(15 - reach, 20);
        const red = ballAt(15 - reach - 2 * R, 20);
        const result = simulateImpact(strike(red.position, { yaw: 1.2 }), { blue, red }, WORLD);
        expect(result.touchingAtStart).toEqual(["blue/red", "blue@peg"]);
        expect(result.events.some((e) => e.kind === "impact-cap")).toBe(false);
        expect(() => simulateFreeMotion(result.handover, WORLD)).not.toThrow();
    });
});

describe("simulateImpact with a tracked drive", () => {
    // A still, level arc with the head's face 1 µm short of blue's sunk centre, swinging through it at 3 m/s: the
    // head's centre is the arc radius plus the socket's height above it from the pivot.
    const STILL = levelArc(sub(SUNK, vec3(R + 1e-6 + TEST_HEAD.length / 2, 0, 0)));
    const ARC: SwingArc = { ...STILL, omega0: 3 / (STILL.radius + TEST_HEAD.socket.z) };
    const DRIVE = trackDrive(ARC);
    const tracked = onArc(DRIVE);
    const withArc = (over: Partial<SwingArc>): ContactState => ({
        ...tracked,
        drive: { ...DRIVE, arc: { ...ARC, ...over } },
    });
    const withCoupling = (over: Partial<Coupling>): ContactState => ({
        ...tracked,
        drive: { ...DRIVE, coupling: { ...DRIVE.coupling, ...over } },
    });
    const withHands = (over: Partial<Hands>): ContactState => ({
        ...tracked,
        drive: { ...DRIVE, hands: { ...DRIVE.hands, ...over } },
    });

    it("runs a tracked strike and hands the ball over moving", () => {
        const result = simulateImpact(tracked, { blue: BLUE }, WORLD);
        // Prototype (aeadd4c, two hands, no arm mass): ends at the window's end, 10 ms, blue at 3.73 m/s, with no event
        // but turf-lift. Pre-flight re-measures.
        expect(result.handover.blue?.velocity.x).toBeGreaterThan(0);
        expect(result.events.some((e) => e.kind === "impact-cap")).toBe(false);
        expect(result.duration).toBeGreaterThanOrEqual(ARC.window);
    });

    it("accepts a head that does not start on its path", () => {
        const off = { ...tracked, position: add(tracked.position, vec3(-1e-3, 0, 1e-3)) };
        expect(() => simulateImpact(off, { blue: BLUE }, WORLD)).not.toThrow();
    });

    it("prepares the path once, and passes a force table through unchanged", () => {
        const setup = prepareImpact(tracked, { blue: BLUE }, WORLD);
        expect(setup.drive.kind).toBe("track");
        // θ_a + ω₀·w + ½·α·w² with θ_a = 0 and α = 0 is exactly ω₀·w (prototype: equal to the last bit).
        expect(setup.drive.kind === "track" && setup.drive.thetaEnd).toBe(ARC.omega0 * ARC.window);
        const forced = strike(BLUE.position);
        expect(prepareImpact(forced, { blue: BLUE }, WORLD).drive).toBe(forced.drive);
    });

    it("accepts pivot motion out of the swing plane by rounding only (1e-12 of its size)", () => {
        const rounded = withArc({ pivotVelocity: vec3(1, 1e-13, 0) });
        expect(() => validateImpact(rounded, { blue: BLUE }, WORLD)).not.toThrow();
        const beyond = withArc({ pivotVelocity: vec3(1, 1e-11, 0) });
        expect(() => validateImpact(beyond, { blue: BLUE }, WORLD)).toThrow(/arc\.pivotVelocity must lie in/);
    });

    const rejections: readonly [string, ContactState, RegExp][] = [
        ["a non-finite pivot", withArc({ pivot: vec3(NaN, 0, 1) }), /arc\.pivot must be finite/],
        [
            "a non-finite pivot velocity",
            withArc({ pivotVelocity: vec3(0, 0, Infinity) }),
            /arc\.pivotVelocity must be finite/,
        ],
        [
            "a non-finite pivot acceleration",
            withArc({ pivotAcceleration: vec3(NaN, 0, 0) }),
            /arc\.pivotAcceleration must be finite/,
        ],
        ["a non-finite aim", withArc({ aim: vec3(NaN, 0, 0) }), /arc\.aim must be finite/],
        ["a non-finite start angle", withArc({ theta0: Infinity }), /arc\.theta0 must be finite/],
        ["a non-finite arc rate", withArc({ omega0: NaN }), /arc\.omega0 must be finite/],
        ["a non-finite arc acceleration", withArc({ alpha: NaN }), /arc\.alpha must be finite/],
        ["a non-positive radius", withArc({ radius: 0 }), /arc\.radius must be a positive finite number/],
        ["a non-positive window", withArc({ window: 0 }), /arc\.window must be a positive finite number/],
        ["a non-positive hands' window", withArc({ handWindow: 0 }), /arc\.handWindow must be a positive/],
        ["a negative arc start", withArc({ arcStart: -0.01 }), /arc\.arcStart must be a non-negative finite time/],
        ["a negative hands' start", withArc({ handStart: -0.01 }), /arc\.handStart must be a non-negative/],
        ["a negative contact time", withArc({ contactAt: -0.01 }), /arc\.contactAt must be a non-negative/],
        ["a dip starting before t = 0", withArc({ dip: { ...ARC.dip, start: -0.01 } }), /arc\.dip\.start must be/],
        ["a dip of no duration", withArc({ dip: { ...ARC.dip, duration: 0 } }), /arc\.dip\.duration must be/],
        ["a negative dip depth", withArc({ dip: { ...ARC.dip, depth: -0.001 } }), /arc\.dip\.depth must be/],
        [
            "an unknown mode",
            withArc({ mode: "glide" as unknown as StrokeMode }),
            /arc\.mode must be "swing" or "carry"/,
        ],
        ["a negative reach", withArc({ handReach: -0.01 }), /arc\.handReach must be non-negative/],
        ["an aim that is not unit", withArc({ aim: vec3(1.1, 0, 0) }), /arc\.aim must be a horizontal unit vector/],
        ["an aim that is not horizontal", withArc({ aim: vec3(0.8, 0, 0.6) }), /arc\.aim must be a horizontal/],
        ["a non-positive period", withCoupling({ period: 0 }), /coupling\.period must be a positive/],
        ["a negative damping ratio", withCoupling({ dampingRatio: -0.1 }), /coupling\.dampingRatio must be/],
        ["a negative relaxation time", withCoupling({ relaxAt: -0.01 }), /coupling\.relaxAt must be a non-negative/],
        ["a bottom hand at the socket", withHands({ bottom: 0 }), /hands\.bottom must lie in \(0, arc\.radius\)/],
        [
            "a bottom hand at the top hand",
            withHands({ bottom: ARC.radius }),
            /hands\.bottom must lie in \(0, arc\.radius\)/,
        ],
        ["a zero grip tension", withHands({ gripTension: 0 }), /hands\.gripTension must lie in \(0, 1\]/],
        ["a grip tension above 1", withHands({ gripTension: 1.5 }), /hands\.gripTension must lie in \(0, 1\]/],
        ["a zero bottom grip", withHands({ bottomGrip: 0 }), /hands\.bottomGrip must lie in \(0, 1\]/],
        ["a bottom grip above 1", withHands({ bottomGrip: 1.5 }), /hands\.bottomGrip must lie in \(0, 1\]/],
        ["a negative arm mass", withHands({ armMass: -0.1 }), /hands\.armMass must be non-negative/],
        ["a negative reach slack", withHands({ reachSlack: -0.01 }), /hands\.reachSlack must be non-negative/],
        ["a negative guide effort", withHands({ guideEffort: -0.1 }), /hands\.guideEffort must lie in \[0, 1\]/],
        ["a guide effort above 1", withHands({ guideEffort: 1.5 }), /hands\.guideEffort must lie in \[0, 1\]/],
        ["a pendulumAt above 1", withArc({ pendulumAt: 1.5 }), /arc\.pendulumAt must lie in \[0, 1\]/],
        ["a negative pendulumEffort", withArc({ pendulumEffort: -1 }), /arc\.pendulumEffort must lie in \[0, 1\]/],
        ["a handArcLow above 1", withArc({ handArcLow: 1.5 }), /arc\.handArcLow must lie in \[0, 1\]/],
        [
            "an arc no longer than the push",
            withArc({ mode: "carry", handReach: 2, handArcRadius: 2 }),
            /arc\.handArcRadius must exceed arc\.handReach/,
        ],
        [
            "a flex with no stiffness",
            withHands({ flex: { ...TEST_FLEX, stiffness: 0 } }),
            /hands\.flex\.stiffness must be a positive/,
        ],
        [
            "a flex hold with no damping",
            withHands({ flex: { ...TEST_FLEX, hold: { stiffness: 900, damping: 0 } } }),
            /hands\.flex\.hold\.damping must be a positive/,
        ],
        [
            "a flex damping ratio above 1",
            withHands({ flex: { ...TEST_FLEX, dampingRatio: 1.5 } }),
            /hands\.flex\.dampingRatio must lie in \(0, 1\]/,
        ],
        ["no pendulum force", withHands({ pendulumForce: 0 }), /hands\.pendulumForce must be a positive/],
        ["no push force", withHands({ pushForce: 0 }), /hands\.pushForce must be a positive/],
        ["an infinite push force", withHands({ pushForce: Infinity }), /hands\.pushForce must be finite/],
        ["no push response time", withHands({ pushResponseTime: 0 }), /hands\.pushResponseTime must be a positive/],
        [
            "an infinite push response time",
            withHands({ pushResponseTime: Infinity }),
            /hands\.pushResponseTime must be finite/,
        ],
        ["no grip limit", withHands({ gripLimit: 0 }), /hands\.gripLimit must be a positive finite number/],
        ["a negative grip limit", withHands({ gripLimit: -1 }), /hands\.gripLimit must be a positive finite number/],
        ["a NaN grip limit", withHands({ gripLimit: NaN }), /hands\.gripLimit must be finite/],
        ["an infinite grip limit", withHands({ gripLimit: Infinity }), /hands\.gripLimit must be finite/],
        [
            "a chain with no hand mass",
            withHands({ chain: { ...TEST_CHAIN, handMass: 0 } }),
            /hands\.chain\.handMass must be a positive/,
        ],
        [
            "a chain with an infinite wrist stiffness",
            withHands({ chain: { ...TEST_CHAIN, wristStiffness: Infinity } }),
            /hands\.chain\.wristStiffness must be finite/,
        ],
        [
            "a chain with no knuckle damping",
            withHands({ chain: { ...TEST_CHAIN, knuckleDamping: 0 } }),
            /hands\.chain\.knuckleDamping must be a positive/,
        ],
        [
            "a pivot velocity out of the swing plane",
            withArc({ pivotVelocity: vec3(0, 0.1, 0) }),
            /arc\.pivotVelocity must lie in the swing plane/,
        ],
        [
            "a pivot acceleration out of the swing plane",
            withArc({ pivotAcceleration: vec3(0, 1, 0) }),
            /arc\.pivotAcceleration must lie in the swing plane/,
        ],
    ];

    it.each(rejections)("rejects %s", (_name, contact, pattern) => {
        expect(() => simulateImpact(contact, { blue: BLUE }, WORLD)).toThrow(RangeError);
        expect(() => simulateImpact(contact, { blue: BLUE }, WORLD)).toThrow(pattern);
    });
});

describe("the roll's impact (P2b.2b.2b.2b design §4.2)", () => {
    it("never ends before the pendulum phase starts, and records its start as the release", () => {
        for (const pendulumAt of [0.5, 1]) {
            const setup = canonicalSetup("full-roll", { world: WORLD, stroke: { pendulumAt } });
            const contact = buildContact(setup, WORLD);
            const track = prepareTrack(contact.drive as TrackDrive, contact.head, WORLD.gravity);
            const pendulum = (track.push as Push).pendulum as number;
            const result = simulateImpact(contact, setup.balls, WORLD);
            expect(result.duration, `pendulumAt ${pendulumAt}`).toBeGreaterThanOrEqual(pendulum);
            expect(result.release?.t, `pendulumAt ${pendulumAt}`).toBeCloseTo(pendulum, 4);
        }
    });

    it("latches the striker's ball's first departure, not a later one, as the hold's relaxation start", () => {
        // Gate ruling round 13, "Relax from first departure": the canonical pass roll meets the striker's ball five
        // times, and its departure is the end of the first face interval, to within a step; a latch that moved with
        // each opening would end at the last.
        const setup = canonicalSetup("pass-roll", { world: WORLD });
        const result = simulateImpact(buildContact(setup, WORLD), setup.balls, WORLD);
        const intervals = result.timeline[`face/${setup.striker}`] ?? [];
        expect(intervals.length).toBeGreaterThan(1);
        const first = intervals[0] as { start: number; end: number };
        expect(result.departure).toBeDefined();
        expect(Math.abs((result.departure as number) - first.end)).toBeLessThanOrEqual(IMPACT_DT * 1.000001);
        expect(result.departure as number).toBeLessThan((intervals[1] as { start: number }).start);
    });

    it("runs a roll with no push to a normal finish", () => {
        // Review focus 1: a push of 0 puts the arc's low point at contact and starts the pendulum phase there.
        const setup = canonicalSetup("half-roll", { world: WORLD, stroke: { handReach: 0 } });
        const outcome = simulateShot(setup, WORLD, { trajectory: true });
        expect(outcome.impact.events.map((e) => e.kind)).not.toContain("impact-cap");
        expect(Number.isFinite(outcome.impact.duration)).toBe(true);
    });

    it("mirrors a canonical roll exactly", () => {
        // Review focus 5: the arc, the flex and the pendulum phase reflect across y = 0 as every tracked drive does
        // (invariants.test.ts's mirror case). On the test world, whose lawn is uniform, the full roll is aimed along
        // +x with the striker on y = 0, so its mirror is the same court.
        const world = testWorld();
        const R = world.ball.radius;
        const base = canonicalSetup("full-roll", { world, stroke: { aim: 0 } });
        const setup = { ...base, balls: { blue: ballAt(5, 0), red: ballAt(5 + 2 * R, 0) } };
        const contact = buildContact(setup, world);
        const run = simulateImpact(contact, setup.balls, world);
        const reflected: BallStates = { blue: mirrorBall(ballAt(5, 0)), red: mirrorBall(ballAt(5 + 2 * R, 0)) };
        const mirrored = simulateImpact(mirrorContact(contact), reflected, world);
        const same = (a: Vec3, b: Vec3): boolean => a.x === b.x && a.y === b.y && a.z === b.z;
        expect(mirrored.steps).toBe(run.steps);
        for (const id of ["blue", "red"] as const) {
            const a = run.handover[id] as BallState;
            const b = mirrored.handover[id] as BallState;
            expect(same(mirrorVec(a.position), b.position), id).toBe(true);
            expect(same(mirrorVec(a.velocity), b.velocity), id).toBe(true);
        }
    });
});
