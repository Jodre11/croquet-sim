import { describe, expect, it } from "vitest";
import { CONTACT_TOLERANCE } from "../../../src/engine/detect";
import { add, length, sub, vec3 } from "../../../src/engine/math/vec3";
import { stateAtTime } from "../../../src/engine/sample";
import { ENGINE_VERSION, simulateFreeMotion } from "../../../src/engine/simulate";
import type { BallStates, World } from "../../../src/engine/types";
import { obstaclesOf, uniformLawn } from "../../../src/engine/world";
import { obstacleContact } from "../../../src/engine/impact/contacts";
import type { ImpactBall } from "../../../src/engine/impact/integrate";
import { prepareImpact, simulateImpact, validateImpact } from "../../../src/engine/impact/simulateImpact";
import type { ContactState, Coupling, Hands, StrokeMode, SwingArc } from "../../../src/engine/impact/types";
import { TEST_BALL, TEST_TURF, ballAt, hoopWithUprightAt, testWorld } from "../support/fixtures";
import { TEST_HEAD, drive, levelArc, onArc, strike, trackDrive } from "../support/impact";

const R = TEST_BALL.radius;
const WORLD = testWorld();
const BLUE = ballAt(5, 0);
/** Blue's centre where the impact starts it: lowered by its static turf sink m·g/k_turf. */
const SUNK = vec3(5, 0, R - (TEST_BALL.mass * WORLD.gravity) / WORLD.lawn.surfaceAt(BLUE.position).turfStiffness);

describe("simulateImpact", () => {
    it("is version 0.8.0", () => {
        expect(ENGINE_VERSION).toBe("0.8.0");
    });

    it("starts a centre-struck ball rolling at 5/7 of its launch speed in phase 2", () => {
        const result = simulateImpact(strike(BLUE.position), { blue: BLUE }, WORLD);
        const h = result.handover.blue;
        expect(h?.position.z).toBe(R);
        expect(h?.velocity.z).toBe(0);
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
        expect(result.handover.yellow?.velocity).toEqual(vec3(0, 0, 0));
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
            { ...ok, head: { ...ok.head, radius: 0 } },
            { blue: BLUE },
            WORLD,
            /head\.radius/,
        ],
        [
            "a non-positive contact time",
            { ...ok, face: { ...ok.face, contactTime: 0 } },
            { blue: BLUE },
            WORLD,
            /face\.contactTime/,
        ],
        [
            "zero face restitution",
            { ...ok, face: { ...ok.face, restitution: 0 } },
            { blue: BLUE },
            WORLD,
            /face\.restitution/,
        ],
        [
            "face restitution above 1",
            { ...ok, face: { ...ok.face, restitution: 1.1 } },
            { blue: BLUE },
            WORLD,
            /face\.restitution/,
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
        [
            "zero turf restitution",
            ok,
            { blue: BLUE },
            testWorld({
                lawn: uniformLawn(30, 40, {
                    slidingFriction: 0.3,
                    rollingResistance: 0.05,
                    ...TEST_TURF,
                    turfRestitution: 0,
                }),
            }),
            /turfRestitution/,
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

    it("accepts touching balls", () => {
        expect(() => simulateImpact(ok, { blue: BLUE, red: ballAt(5 + 2 * R, 0) }, WORLD)).not.toThrow();
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
        ["a negative ground depth", withArc({ groundDepth: -0.001 }), /arc\.groundDepth must be non-negative/],
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
