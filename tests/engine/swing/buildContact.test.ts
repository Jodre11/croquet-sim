import { describe, expect, it } from "vitest";
import { headLowestPoint } from "../../../src/engine/impact/contacts";
import { boxInertia, rotate, solidCylinderInertia } from "../../../src/engine/impact/rigidBody";
import { simulateImpact } from "../../../src/engine/impact/simulateImpact";
import {
    GRIP_LIMIT,
    HAND_COUPLING,
    downswingAt,
    handsAt,
    headOnPath,
    pathAt,
    pendulumOf,
    pitchAxis,
    prepareTrack,
    swungBody,
} from "../../../src/engine/impact/track";
import { bedLawOf, staticSink } from "../../../src/engine/impact/turfBed";
import type { ContactState, Downswing, StrokeMode, TrackDrive } from "../../../src/engine/impact/types";
import { add, cross, dot, horizontal, length, scale, sub, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import {
    MAX_LEAD,
    MAX_WINDOW,
    MIN_WINDOW,
    START_GAP,
    TURF_MARGIN,
    arcArrival,
    buildContact,
    contactPose,
    downswingInput,
    handsAheadFor,
    planStroke,
    plannedSpeed,
    poseSpeed,
    stanceLean,
    swingApproach,
} from "../../../src/engine/swing/buildContact";
import { simulateShot } from "../../../src/engine/shot";
import { MAX_BACK_ANGLE, planDownswing, scanDownswing } from "../../../src/engine/swing/downswing";
import { ON_TIME, SLOPE_HOLD, defaultProfile, shapeOf } from "../../../src/engine/swing/profile";
import {
    CROQUET_STROKES,
    STROKE_TYPES,
    type MalletHeadProfile,
    type ShotSetup,
    type StrokeTiming,
    type StrokeType,
    type SwingProfile,
    type SwingShape,
    type SwingStance,
} from "../../../src/engine/swing/types";
import type { BallState } from "../../../src/engine/types";
import { defaultWorld } from "../../../src/engine/world";
import { contactReference, malletReference, swingBodyReference, swingReference } from "../../../src/reference/index";
import { TEST_BALL, ballAt, testWorld } from "../support/fixtures";
import {
    TEST_CHAIN,
    TEST_FLEX,
    TEST_GRIP_LIMIT,
    TEST_HANDS,
    TEST_PENDULUM_FORCE,
    TEST_PUSH_FORCE,
    TEST_PUSH_RESPONSE_TIME,
    mirrorBall,
    mirrorContact,
    mirrorQuat,
    mirrorSpin,
    mirrorVec,
    recorder,
} from "../support/impact";
import {
    CANONICAL_CLEARANCE,
    DEFAULT_CROQUET_GAP,
    GC_STOP_GAP,
    TEST_BOX_HEAD,
    backswingFor,
    canonicalSetup,
    testProfile,
} from "../support/shot";

const WORLD = testWorld();
const R = TEST_BALL.radius;
const BLUE = ballAt(5, 3);
/**
 * The striker's sunk centre height, where the face is placed against it: R less its static sink on the bed at its
 * position (P2b.2b.2b.2a: turf bed; was R − m·g/k_turf).
 */
const SUNK_Z = R - staticSink(5, 3, R, TEST_BALL.mass * WORLD.gravity, bedLawOf(WORLD.lawn.surfaceAt(BLUE.position)));
/** The test profile's top hand (the arc radius), and the test head's radius and length. */
const TOP = 0.8;
const RHO = 0.032;
const LENGTH = 0.23;
const DEG = Math.PI / 180;
/**
 * The default test backswing (m): about 3.1 m/s by gravity alone on the test profile's pendulum (r = 0.8 m, the test
 * head, no arm mass).
 */
const BACKSWING = 0.5;

type Stroke = ShotSetup["stroke"];

function shot(stroke: Partial<Stroke> = {}, profile: SwingProfile = testProfile(), blue: BallState = BLUE): ShotSetup {
    return {
        balls: { blue },
        striker: "blue",
        stroke: {
            type: "single-ball",
            aim: 0.4,
            backswing: BACKSWING,
            drive: 0,
            contact: { up: 0, side: 0 },
            timing: ON_TIME,
            ...stroke,
        },
        live: [],
        continuation: false,
        hampered: false,
        jumpAttempt: false,
        lawnSpeed: 10,
        profile,
    };
}

const arcOf = (c: ContactState) => (c.drive as TrackDrive).arc;
const dist = (a: Vec3, b: Vec3): number => length(sub(a, b));
const same = (a: Vec3, b: Vec3): boolean => a.x === b.x && a.y === b.y && a.z === b.z;
/** ℓ, the pivot's distance from the head's centre across the swing plane's pitch axis (on-time contacts). */
const pivotToCentre = (c: ContactState): number =>
    length(cross(pitchAxis(arcOf(c).aim), sub(c.position, arcOf(c).pivot)));

describe("buildContact, step by step", () => {
    it("takes the arc radius from the top hand", () => {
        expect(arcOf(buildContact(shot(), WORLD)).radius).toBe(TOP);
        expect(arcOf(buildContact(shot({}, testProfile({ stance: { top: 0.6 } })), WORLD)).radius).toBe(0.6);
    });

    it("turns the hands' position into the contact angle, a negative lean rising into the ball", () => {
        // testProfile turns a lean into the hands that give it at the shot's `up`; the lean reads back to rounding.
        const leaning = buildContact(shot({}, testProfile({ stance: { lean: 0.2 } })), WORLD);
        expect(arcOf(leaning).theta0).toBeCloseTo(-0.2, 12);
        const profile = testProfile({ stance: { lean: -0.05 }, up: -0.01 });
        const rising = buildContact(shot({ contact: { up: -0.01, side: 0 } }, profile), WORLD);
        expect(arcOf(rising).theta0).toBeCloseTo(0.05, 12);
        expect(rising.velocity.z).toBeGreaterThan(0);
    });

    it("pitches the face down by the lean, the head rigid on the shaft", () => {
        // A short head met low on its face: on the 0.23 m head no point of the face keeps a 10° rise clear of the turf.
        for (const degrees of [-10, 0, 10]) {
            const profile = testProfile({ stance: { lean: degrees * DEG }, mallet: { headLength: 0.1 }, up: -0.02 });
            const c = buildContact(shot({ contact: { up: -0.02, side: 0 } }, profile), WORLD);
            const face = rotate(c.orientation, vec3(1, 0, 0));
            expect(Math.asin(face.z), `lean ${degrees}°`).toBeCloseTo(-degrees * DEG, 12);
            const aim = vec3(Math.cos(0.4), Math.sin(0.4), 0);
            expect(length(cross(horizontal(face), aim))).toBeLessThan(1e-12);
            expect(dot(face, aim)).toBeGreaterThan(0);
        }
    });

    it("puts the face 1 µm short of the sunk ball, meeting it at the requested point", () => {
        // The pose at contact: this met-high contact is a fat stroke, whose impact now starts earlier on the downswing.
        const c = contactPose(shot({ contact: { up: 0.01, side: -0.005 } }), WORLD);
        const face = rotate(c.orientation, vec3(1, 0, 0));
        const upward = rotate(c.orientation, vec3(0, 0, 1));
        const left = rotate(c.orientation, vec3(0, 1, 0));
        const offset = sub(vec3(5, 3, SUNK_Z), add(c.headCentre, scale(face, c.head.length / 2)));
        expect(dot(offset, face)).toBeCloseTo(R + START_GAP, 12);
        expect(dot(offset, upward)).toBeCloseTo(0.01, 12);
        expect(dot(offset, left)).toBeCloseTo(-0.005, 12);
        expect(dist(left, vec3(-Math.sin(0.4), Math.cos(0.4), 0))).toBeLessThan(1e-12);
    });

    it("starts an on-time head at its planned speed: the hands' V_c and the pendulum's ω₀ at contact", () => {
        for (const pendulumShare of [1, 0.6]) {
            const setup = shot({}, testProfile({ shape: { pendulumShare } }));
            const { contact: c, contactSpeed } = planStroke(setup, WORLD);
            const arc = arcOf(c);
            const down = arc.downswing as Downswing;
            expect(length(c.velocity), `share ${pendulumShare}`).toBeCloseTo(contactSpeed, 12);
            expect(dist(arc.pivotVelocity, scale(down.across, (2 * arc.omega0) / down.span))).toBeLessThan(1e-12);
            const swing = scale(cross(pitchAxis(arc.aim), sub(c.position, arc.pivot)), arc.omega0);
            expect(dist(c.velocity, add(arc.pivotVelocity, swing))).toBeLessThan(1e-12);
            expect(plannedSpeed(setup, WORLD)).toBe(contactSpeed);
        }
    });

    it("drives both arcs over their windows against the planned speed", () => {
        const profile = testProfile({
            drive: { speedGain: 0.4, window: 0.02, handGain: 0.3, handWindow: 0.03 },
            shape: { pendulumShare: 0.5 },
        });
        const { contact: c, contactSpeed } = planStroke(shot({ drive: -0.5 }, profile), WORLD);
        const arc = arcOf(c);
        // The pendulum's contribution changes by drive·speedGain·speed over its window.
        expect(arc.alpha * pivotToCentre(c) * 0.02).toBeCloseTo(-0.5 * 0.4 * contactSpeed, 10);
        expect(dist(arc.pivotAcceleration, scale(arc.aim, (-0.5 * 0.3 * contactSpeed) / 0.03))).toBeLessThan(1e-12);
        expect([arc.window, arc.handWindow, arc.arcStart, arc.handStart, arc.contactAt]).toEqual([0.02, 0.03, 0, 0, 0]);
    });

    it("plans the speed the test support's solver asks for", () => {
        for (const pendulumShare of [1, 0.6]) {
            const setup = shot({}, testProfile({ shape: { pendulumShare } }));
            const backswing = backswingFor(setup, 2.5, WORLD);
            expect(plannedSpeed(shot({ backswing }, setup.profile), WORLD), `share ${pendulumShare}`).toBeCloseTo(
                2.5,
                9,
            );
        }
    });

    it("solves a leaning stance's backswing per contact height", () => {
        // Review focus 2. Under fixed hands the lean follows `up` (P2b.2b.2b.1 design §3.3), and with an effort the
        // planned speed follows the lean, so a memo keyed without `up` would hand one height another's backswing.
        // P2b.2b.2c.1: the single-ball stroke (was a 3 N·m pulse over 0.4–0.2 s): the body's Hill law, τ_0 = 3 N·m.
        const profile = testProfile({ stance: { lean: 0.4 }, body: { effort: { torque: 3, speed: 20 } } });
        for (const up of [-0.01, 0.01]) {
            const setup = shot({ intensity: 1, contact: { up, side: 0 } }, profile);
            const backswing = backswingFor(setup, 2.5, WORLD);
            const planned = plannedSpeed({ ...setup, stroke: { ...setup.stroke, backswing } }, WORLD);
            expect(planned, `up ${up} m`).toBeCloseTo(2.5, 9);
        }
    });

    it("copies the mode and the reach, the hands and the body, and grips with HAND_COUPLING", () => {
        const profile = testProfile({
            stance: { top: 0.7, bottom: 0.3, gripTension: 0.6, bottomGrip: 0.25 },
            drive: { mode: "carry", handReach: 0.2, guideEffort: 0.4 },
            body: { armMass: 0.8, reachSlack: 0.02 },
        });
        const drive = buildContact(shot({}, profile), WORLD).drive as TrackDrive;
        expect([drive.arc.mode, drive.arc.handReach]).toEqual(["carry", 0.2]);
        expect(drive.hands).toEqual({
            bottom: 0.3,
            gripTension: 0.6,
            bottomGrip: 0.25,
            armMass: 0.8,
            reachSlack: 0.02,
            guideEffort: 0.4,
            flex: TEST_FLEX,
            pendulumForce: TEST_PENDULUM_FORCE,
            pushForce: TEST_PUSH_FORCE,
            pushResponseTime: TEST_PUSH_RESPONSE_TIME,
            chain: TEST_CHAIN,
            gripLimit: TEST_GRIP_LIMIT,
        });
        expect(drive.coupling).toEqual({
            period: HAND_COUPLING.period,
            dampingRatio: HAND_COUPLING.dampingRatio,
            relaxAt: 0,
        });
        // The shot's reach, when it gives one, over the preset's: 0 included.
        const reaching = testProfile({ drive: { handReach: 0.2 } });
        expect(arcOf(buildContact(shot({ handReach: 0.05 }, reaching), WORLD)).handReach).toBe(0.05);
        expect(arcOf(buildContact(shot({ handReach: 0 }, reaching), WORLD)).handReach).toBe(0);
        // The shot's guide effort, when it gives one, over the preset's: 0 included.
        const effortOf = (s: ShotSetup): number => (buildContact(s, WORLD).drive as TrackDrive).hands.guideEffort;
        const guided = testProfile({ drive: { guideEffort: 0.4 } });
        expect(effortOf(shot({}, guided))).toBe(0.4);
        expect(effortOf(shot({ guideEffort: 0 }, guided))).toBe(0);
    });

    it("carries the pendulum phase's inputs, the hands' arc and the arm's law into the drive (P2b.2b.2b.2b §6)", () => {
        const flex = {
            stiffness: 300,
            stiffnessPerForce: 5,
            dampingRatio: 0.4,
            endpointMass: 0.6,
            hold: { stiffness: 900, damping: 20 },
        };
        const chain = { ...TEST_CHAIN, forearmMass: 0.4, palmStiffness: 5e4, fingerDamping: 80 };
        const profile = testProfile({
            drive: { mode: "carry", handReach: 0.2, pendulumAt: 0.7, pendulumEffort: 0.2, handArcRadius: 1.2 },
            body: { flex, pendulumForce: 25, pushForce: 120, pushResponseTime: 0.05, chain },
        });
        const preset = (buildContact(shot({}, profile), WORLD).drive as TrackDrive).arc;
        expect([preset.pendulumAt, preset.pendulumEffort, preset.handArcRadius, preset.handArcLow]).toEqual([
            0.7, 0.2, 1.2, 0.5,
        ]);
        const own = (buildContact(shot({ pendulumAt: 0.4, pendulumEffort: 1 }, profile), WORLD).drive as TrackDrive)
            .arc;
        expect([own.pendulumAt, own.pendulumEffort]).toEqual([0.4, 1]);
        const { hands } = buildContact(shot({}, profile), WORLD).drive as TrackDrive;
        expect([hands.flex, hands.pendulumForce, hands.pushForce, hands.pushResponseTime]).toEqual([
            flex,
            25,
            120,
            0.05,
        ]);
        expect(hands.chain).toEqual(chain);
    });

    it.each([
        ["no push force", { pushForce: 0 }, /profile\.body\.pushForce must be positive/],
        ["an infinite push force", { pushForce: Infinity }, /profile\.body\.pushForce must be finite/],
        ["no push response time", { pushResponseTime: 0 }, /profile\.body\.pushResponseTime must be positive/],
        [
            "an infinite push response time",
            { pushResponseTime: Infinity },
            /profile\.body\.pushResponseTime must be finite/,
        ],
        ["no grip limit", { gripLimit: 0 }, /profile\.body\.gripLimit must be/],
        ["a negative grip limit", { gripLimit: -1 }, /profile\.body\.gripLimit must be/],
        ["a NaN grip limit", { gripLimit: NaN }, /profile\.body\.gripLimit must be/],
        ["an infinite grip limit", { gripLimit: Infinity }, /profile\.body\.gripLimit must be/],
        [
            "no forearm mass",
            { chain: { ...TEST_CHAIN, forearmMass: 0 } },
            /profile\.body\.chain\.forearmMass must be positive/,
        ],
        [
            "an infinite palm stiffness",
            { chain: { ...TEST_CHAIN, palmStiffness: Infinity } },
            /profile\.body\.chain\.palmStiffness must be finite/,
        ],
        [
            "no finger damping",
            { chain: { ...TEST_CHAIN, fingerDamping: 0 } },
            /profile\.body\.chain\.fingerDamping must be positive/,
        ],
    ] as const)("rejects %s (P2b.2b.2b.2b gate ruling 2026-10-11)", (_name, body, message) => {
        expect(() => buildContact(shot({}, testProfile({ body })), WORLD)).toThrow(message);
    });

    it.each([
        ["stroke.pendulumAt", { pendulumAt: 1.1 }, {}, /stroke\.pendulumAt must lie in \[0, 1\]/],
        ["stroke.pendulumEffort", { pendulumEffort: -0.1 }, {}, /stroke\.pendulumEffort must lie in \[0, 1\]/],
        ["the preset's pendulumAt", {}, { pendulumAt: Number.NaN }, /pendulumAt must be finite/],
        ["the preset's handArcLow", {}, { handArcLow: 2 }, /handArcLow must lie in \[0, 1\]/],
        [
            "an arc no longer than the push",
            { handReach: 0.5 },
            { handArcRadius: 0.5 },
            /handArcRadius must exceed the push length/,
        ],
    ] as const)("rejects %s", (_name, stroke, drive, message) => {
        expect(() => buildContact(shot(stroke, testProfile({ drive })), WORLD)).toThrow(message);
    });

    it("dips the hands as the profile says, whatever the drive, still meeting the ball on the up", () => {
        for (const drive of [-1, 0, 1]) {
            const profile = testProfile({
                stance: { lean: -0.05 },
                up: -0.01,
                drive: { handDrop: 0.014, dropTime: 0.02 },
            });
            const c = buildContact(shot({ drive, contact: { up: -0.01, side: 0 } }, profile), WORLD);
            expect(arcOf(c).dip, `drive ${drive}`).toEqual({ start: 0, duration: 0.02, depth: 0.014 });
            expect(c.velocity.z).toBeGreaterThan(0);
        }
    });

    it("starts the impact at the earliest early action, the head on its downswing, and at contact on time", () => {
        const profile = testProfile({ shape: { pendulumShare: 0.7 } });
        const onTime = buildContact(shot({}, profile), WORLD);
        // The dip is timed from the pulse: 10 ms before a pulse 10 ms early, so 20 ms before contact.
        const early = buildContact(shot({ timing: { arc: -0.01, hands: 0.004, dip: -0.01 } }, profile), WORLD);
        const arc = arcOf(early);
        expect(arc.contactAt).toBe(0.02);
        expect(arc.arcStart).toBeCloseTo(0.01, 15);
        expect(arc.handStart).toBeCloseTo(0.024, 15);
        expect(arc.dip.start).toBe(0);
        expect((early.drive as TrackDrive).coupling.relaxAt).toBe(0.02);
        expect(arc.theta0).toBeCloseTo(arcOf(onTime).theta0 - arcOf(onTime).omega0 * 0.02, 12);
        // With depthless actions, the head follows its downswing from its start to the contact pose by the lead's end.
        const depthless = buildContact(shot({ timing: { arc: 0, hands: 0, dip: -0.02 } }, profile), WORLD);
        const track = prepareTrack(depthless.drive as TrackDrive, depthless.head, WORLD.gravity);
        expect(dist(headOnPath(track, depthless.head, 0.02).position, onTime.position)).toBeLessThan(1e-12);
        const late = buildContact(shot({ timing: { arc: 0.01, hands: 0.01, dip: 0 } }, profile), WORLD);
        expect(arcOf(late).contactAt).toBe(0);
        // The longest lead is allowed.
        const longest = buildContact(shot({ timing: { arc: -MAX_LEAD, hands: 0, dip: 0 } }, profile), WORLD);
        expect(arcOf(longest).contactAt).toBe(MAX_LEAD);
    });

    it("builds the profile's mallet with a wooden face", () => {
        const c = buildContact(shot(), WORLD);
        expect(c.head).toEqual({
            mass: 1,
            inertia: solidCylinderInertia(1, 0.23, 0.032),
            length: 0.23,
            shape: { kind: "cylinder", radius: 0.032 },
            socket: vec3(0, 0, 0.032),
            shaft: { mass: 0, length: 0.9 },
        });
        // P2b.2b.2b.2a design §3.6: the face's restitution and contact time are contact.json's wood fits.
        expect(c.face).toEqual({ friction: malletReference.faceFriction.value });
    });

    it("builds a box head from the profile's measured moment, its socket at half the face's height", () => {
        // Review focus 3: a rectangular face, 60 mm wide and 50 mm high; the socket, ρ and the flat face come from the
        // height.
        const head = { ...TEST_BOX_HEAD, faceWidth: 0.06, faceHeight: 0.05 };
        const c = buildContact(shot({}, testProfile({ mallet: { head } })), WORLD);
        expect(c.head).toEqual({
            mass: 1,
            inertia: boxInertia(1, 0.23, 0.03, 0.025, TEST_BOX_HEAD.inertiaAboutShaft),
            length: 0.23,
            shape: { kind: "box", halfWidth: 0.03, halfHeight: 0.025, edgeRadius: 0.003 },
            socket: vec3(0, 0, 0.025),
            shaft: { mass: 0, length: 0.9 },
        });
    });

    it("puts the socket at half the face's height on a rectangular face", () => {
        // Review focus 3: the pivot lies r + h_z above the head's centre along the shaft, never r + h_y.
        const head = { ...TEST_BOX_HEAD, faceWidth: 0.06, faceHeight: 0.05 };
        const pose = contactPose(shot({}, testProfile({ mallet: { head } })), WORLD);
        expect(length(sub(pose.pivot, pose.headCentre))).toBeCloseTo(0.8 + 0.025, 12);
    });

    it("plans and strikes with a sharp box, e = 0", () => {
        // Review focus 2.
        const setup = shot({}, testProfile({ mallet: { head: { ...TEST_BOX_HEAD, edgeRadius: 0 } } }));
        const c = buildContact(setup, WORLD);
        expect(() => simulateImpact(c, setup.balls, WORLD)).not.toThrow();
    });

    it("starts the head exactly on its own path", () => {
        const profile = testProfile({ stance: { lean: 0.4 }, shape: { pendulumShare: 0.4 } });
        const c = buildContact(shot({ drive: 0.7, timing: { arc: -0.005, hands: 0, dip: 0 } }, profile), WORLD);
        const start = headOnPath(prepareTrack(c.drive as TrackDrive, c.head, WORLD.gravity), c.head, 0);
        expect({
            position: c.position,
            orientation: c.orientation,
            velocity: c.velocity,
            angularVelocity: c.angularVelocity,
        }).toEqual(start);
    });

    it("points the face along any aim", () => {
        for (const aim of [Math.PI, -Math.PI / 2, 7]) {
            const c = buildContact(shot({ aim }), WORLD);
            const face = rotate(c.orientation, vec3(1, 0, 0));
            expect(dist(face, vec3(Math.cos(aim), Math.sin(aim), 0)), `aim ${aim}`).toBeLessThan(1e-12);
            const start = headOnPath(prepareTrack(c.drive as TrackDrive, c.head, WORLD.gravity), c.head, 0);
            expect(c.position).toEqual(start.position);
        }
    });
});

describe("swingApproach", () => {
    it("finds a low swing's downswing in the turf before contact, at its least clearance", () => {
        // Level, the ball met 10 mm above the face centre: the head's lowest point is h₀ − 0.01 − ρ clear at contact.
        // The top hand is still, so swung back by φ the head's front rim dips to P_z − (r + 2ρ)·cos φ − (L/2)·sin φ,
        // least at tan φ* = (L/2)/(r + 2ρ): about 3.94 mm in the turf (P2b.2b.2b.2a: turf bed, h₀ on the test bed's
        // sink; was 3.64 mm, P2b.2b.1's coasting figure: the same circle).
        const c = buildContact(shot({ contact: { up: 0.01, side: 0 } }), WORLD);
        const pose = contactPose(shot({ contact: { up: 0.01, side: 0 } }), WORLD);
        const still = vec3(0, 0, 0);
        const atContact = { position: pose.headCentre, orientation: pose.orientation };
        const lowest = headLowestPoint({ ...atContact, velocity: still, angularVelocity: still }, pose.head);
        expect(lowest).toBeCloseTo(SUNK_Z - 0.01 - RHO, 12);
        const pivotZ = SUNK_Z - 0.01 + RHO + TOP;
        const approach = swingApproach(c);
        expect(approach.clearance).toBeCloseTo(pivotZ - Math.hypot(TOP + 2 * RHO, LENGTH / 2), 9);
        const down = arcOf(c).downswing as Downswing;
        expect(downswingAt(down, -approach.before).theta).toBeCloseTo(-Math.atan2(LENGTH / 2, TOP + 2 * RHO), 4);
    });

    it("measures back from the planned contact, whatever the lead", () => {
        const profile = testProfile({ shape: { pendulumShare: 0.7 } });
        const onTime = swingApproach(buildContact(shot({}, profile), WORLD));
        const early = swingApproach(buildContact(shot({ timing: { arc: -0.02, hands: 0, dip: 0 } }, profile), WORLD));
        expect(early).toEqual(onTime);
    });

    it("ignores every action: the downswing is planned without them", () => {
        const shape = { pendulumShare: 0.7 };
        const acting = testProfile({ drive: { speedGain: 0.4, handGain: 0.2, handDrop: 0.004 }, shape });
        const plain = testProfile({ drive: { speedGain: 0.4, handGain: 0.2 }, shape });
        // The dip is timed from the pulse: 10 ms before a pulse 30 ms early, so 40 ms before contact.
        const timing = { arc: -0.03, hands: -0.02, dip: -0.01 };
        const a = swingApproach(buildContact(shot({ drive: -1, timing }, acting), WORLD));
        const b = swingApproach(buildContact(shot({}, plain), WORLD));
        expect(a).toEqual(b);
    });

    it("is the plan's approach, from the same scan", () => {
        const plan = planStroke(shot({}, testProfile({ shape: { pendulumShare: 0.7 } })), WORLD);
        expect(swingApproach(plan.contact)).toEqual(plan.approach);
    });
});

describe("buildContact, mirrored", () => {
    it("gives a setup mirrored across a vertical plane an exactly mirrored contact and impact", () => {
        const profile = testProfile({
            stance: { lean: 0.1, gripTension: 0.8, bottomGrip: 0.5 },
            up: -0.003,
            drive: { handGain: 0.2, handDrop: 0.004 },
            shape: { pendulumShare: 0.7 },
        });
        const stroke = { aim: 0.4, drive: 0.5, contact: { up: -0.003, side: 0.004 } };
        const a = buildContact(shot(stroke, profile, ballAt(5, 3)), WORLD);
        const b = buildContact(
            shot({ ...stroke, aim: -0.4, contact: { up: -0.003, side: -0.004 } }, profile, ballAt(5, -3)),
            WORLD,
        );
        const m = mirrorContact(a);
        expect(same(m.position, b.position) && same(m.velocity, b.velocity)).toBe(true);
        expect(same(m.angularVelocity, b.angularVelocity)).toBe(true);
        const [q, p] = [m.orientation, b.orientation];
        expect(q.w === p.w && q.x === p.x && q.y === p.y && q.z === p.z).toBe(true);
        const [ma, mb] = [arcOf(m), arcOf(b)];
        expect(same(ma.pivot, mb.pivot) && same(ma.pivotAcceleration, mb.pivotAcceleration)).toBe(true);
        expect(ma.omega0 === mb.omega0 && ma.alpha === mb.alpha && ma.theta0 === mb.theta0).toBe(true);
        const [da, db] = [ma.downswing as Downswing, mb.downswing as Downswing];
        expect(same(da.handsTop, db.handsTop) && same(da.across, db.across) && same(da.drop, db.drop)).toBe(true);
        const ra = simulateImpact(a, { blue: ballAt(5, 3) }, WORLD);
        const rb = simulateImpact(b, { blue: ballAt(5, -3) }, WORLD);
        const ha = ra.handover.blue as BallState;
        const hb = rb.handover.blue as BallState;
        expect(same(mirrorBall(ha).position, hb.position) && same(mirrorVec(ha.velocity), hb.velocity)).toBe(true);
        expect(same(mirrorSpin(ha.angularVelocity), hb.angularVelocity)).toBe(true);
        expect(rb.steps).toBe(ra.steps);
        const [qa, qb] = [mirrorQuat(ra.head.orientation), rb.head.orientation];
        expect(qa.w === qb.w && qa.x === qb.x && qa.y === qb.y && qa.z === qb.z).toBe(true);
    });

    it("gives a box-head setup mirrored across a vertical plane an exactly mirrored impact", () => {
        // Review focus 4: the box's sign convention (p_i ≥ 0 counts as positive) must not break the mirror.
        const profile = testProfile({ mallet: { head: TEST_BOX_HEAD }, stance: { lean: 0.1 }, up: -0.003 });
        const stroke = { aim: 0.4, drive: 0.5, contact: { up: -0.003, side: 0.004 } };
        const a = buildContact(shot(stroke, profile, ballAt(5, 3)), WORLD);
        const b = buildContact(
            shot({ ...stroke, aim: -0.4, contact: { up: -0.003, side: -0.004 } }, profile, ballAt(5, -3)),
            WORLD,
        );
        const ra = simulateImpact(a, { blue: ballAt(5, 3) }, WORLD);
        const rb = simulateImpact(b, { blue: ballAt(5, -3) }, WORLD);
        const ha = ra.handover.blue as BallState;
        const hb = rb.handover.blue as BallState;
        expect(same(mirrorBall(ha).position, hb.position) && same(mirrorVec(ha.velocity), hb.velocity)).toBe(true);
        expect(same(mirrorSpin(ha.angularVelocity), hb.angularVelocity)).toBe(true);
        expect(rb.steps).toBe(ra.steps);
        expect(Object.keys(rb.headRegions ?? {})).toEqual(Object.keys(ra.headRegions ?? {}));
    });
});

/**
 * The downswing's least clearance on each canonical setup. The swing presets swing about a still top hand, so theirs
 * is the circle's: P2b.2b.1's coasting approach on prototype aeadd4c's geometry (the level presets' minimum lies
 * 36.25 ms before contact at 3 m/s, the AC stop's 56 ms; the timings and the rim's lowest angle below are the
 * P2b.2b.1 round head's figures). The rolls' hands rise behind contact and their pendulum
 * swings the head up, already past the rim's lowest angle, so theirs is at contact: CANONICAL_CLEARANCE. Every figure
 * moves with the sink h₀ = R − δ₀ (CANONICAL_CLEARANCE's δ₀, the bed's static sink at the striker's position).
 */
const CANONICAL_APPROACH: Readonly<Record<StrokeType, number>> = {
    // P2b.2b.2b.2c: the mallet (was 0.1189e-3): 6.10 mm higher, less than the 9.525 mm the flat underside gains at
    // contact, the minimum lying before contact on the arc, where the longer box is pitched.
    "single-ball": 6.2186e-3,
    drive: 6.2186e-3,
    // P2b.2b.2b.2c: the mallet (was 6.8318e-3).
    // P2b.2b.2c.2d: the stance, 5° back at 22.5 mm below the face's centre (was 11.1829e-3 at 4° and 20 mm).
    "stop-ac": 9.27283e-3,
    // P2b.2b.2b.2c: the mallet (was 0.1189e-3).
    "stop-gc": 6.2186e-3,
    // P2b.2b.2b.2c: the mallet: CANONICAL_CLEARANCE's (was 29.5203e-3, 36.6544e-3 and 39.7589e-3).
    "half-roll": 39.1827e-3,
    "full-roll": 45.9355e-3,
    "pass-roll": 48.8202e-3,
};

/** Each preset's default lean in degrees (P2b.2b.2b.1 design §4): the swing presets' unchanged, the rolls' Gugan's. */
const DEFAULT_LEAN: Readonly<Record<StrokeType, number>> = {
    "single-ball": 0,
    drive: 0,
    // P2b.2b.2c.2d: the stance's lean (was -4).
    "stop-ac": -5,
    "stop-gc": 0,
    "half-roll": 24,
    "full-roll": 31,
    "pass-roll": 34,
};

describe("the default profile's canonical setups", () => {
    it.each(STROKE_TYPES)("%s's canonical pose has its default lean (exit criterion 2)", (type) => {
        const world = defaultWorld();
        const pose = contactPose(canonicalSetup(type, { world }), world);
        const lean = DEFAULT_LEAN[type] * DEG;
        if (lean === 0) {
            expect(pose.thetaContact).toBe(0);
        } else {
            expect(Math.abs(pose.thetaContact + lean)).toBeLessThan(1e-12);
        }
    });

    it.each(STROKE_TYPES)("%s starts at contact, by its planned clearance, its approach as planned", (type) => {
        const world = defaultWorld();
        const c = buildContact(canonicalSetup(type, { world }), world);
        expect(arcOf(c).contactAt).toBe(0);
        expect(headLowestPoint(c, c.head)).toBeCloseTo(CANONICAL_CLEARANCE[type], 6);
        expect(swingApproach(c).clearance).toBeCloseTo(CANONICAL_APPROACH[type], 6);
    });

    it.each(STROKE_TYPES)("%s plans its default speed (exit criterion 5)", (type) => {
        const world = defaultWorld();
        const speed = plannedSpeed(canonicalSetup(type, { world }), world);
        expect(speed).toBeCloseTo(swingReference[type].defaultSpeed.value, 9);
    });

    it("keeps the upright presets exactly upright at any contact height", () => {
        // Exit criterion 3: their hands lie B behind the ball's centre, which reads back as exactly 0 at any `up`.
        const world = defaultWorld();
        for (const type of ["single-ball", "drive", "stop-gc"] as const) {
            for (const up of [-0.03, -0.01, 0, 0.01, 0.03]) {
                const pose = contactPose(canonicalSetup(type, { world, stroke: { contact: { up, side: 0 } } }), world);
                expect(pose.thetaContact, `${type} at up ${up} m`).toBe(0);
            }
        }
    });

    it("rises 5° into the AC stop, the face tilted up as much", () => {
        // P2b.2b.2c.2d: the stance's lean (was 4°).
        const world = defaultWorld();
        const c = buildContact(canonicalSetup("stop-ac", { world }), world);
        expect(arcOf(c).theta0).toBeCloseTo(5 * DEG, 15);
        expect(rotate(c.orientation, vec3(1, 0, 0)).z).toBeCloseTo(Math.sin(5 * DEG), 12);
        expect(c.velocity.z).toBeGreaterThan(0);
    });

    it("places the GC stop's target GC_STOP_GAP ahead and live, and refuses a gap on a croquet stroke", () => {
        const world = defaultWorld();
        const setup = canonicalSetup("stop-gc", { world });
        const blue = setup.balls.blue as BallState;
        const red = setup.balls.red as BallState;
        expect(length(sub(red.position, blue.position))).toBeCloseTo(2 * world.ball.radius + GC_STOP_GAP, 12);
        expect(red.position.x).toBeCloseTo(blue.position.x, 12);
        expect(red.position.y).toBeGreaterThan(blue.position.y);
        expect(setup.live).toEqual(["red"]);
        expect(setup).not.toHaveProperty("croqueted");
        expect(() => canonicalSetup("stop-ac", { world, targetGap: 0.1 })).toThrow(/no targetGap/);
    });

    it("places the croqueted ball 2R + croquetGap along the stroke's line, the pass roll's 20° kept", () => {
        const radius = defaultWorld().ball.radius;
        for (const type of CROQUET_STROKES) {
            const s = canonicalSetup(type, { croquetGap: 0.0015 });
            const d = sub((s.balls.red as BallState).position, (s.balls.blue as BallState).position);
            expect(length(d)).toBeCloseTo(2 * radius + 0.0015, 12);
            const line = Math.PI / 2 + (type === "pass-roll" ? (20 * Math.PI) / 180 : 0);
            expect(Math.atan2(d.y, d.x)).toBeCloseTo(line, 12);
        }
    });
    it("defaults the croquet gap to DEFAULT_CROQUET_GAP", () => {
        const { balls } = canonicalSetup("drive");
        const d = sub((balls.red as BallState).position, (balls.blue as BallState).position);
        expect(length(d) - 2 * defaultWorld().ball.radius).toBeCloseTo(DEFAULT_CROQUET_GAP, 12);
    });
    it("decides the limit on the input, not the rounded positions", () => {
        // Review focus 1.
        expect(() => canonicalSetup("drive", { croquetGap: 0.002 })).toThrow(/canonicalSetup: .*croquetGap/);
        expect(() => canonicalSetup("drive", { croquetGap: -1e-6 })).toThrow(/canonicalSetup: .*croquetGap/);
        expect(() => canonicalSetup("drive", { croquetGap: 0.002 - 1e-9 })).not.toThrow();
    });
    it("rejects a gap option on the wrong kind of stroke", () => {
        // Review focus 3.
        expect(() => canonicalSetup("single-ball", { croquetGap: 0.001 })).toThrow(/canonicalSetup: .*croquetGap/);
        expect(() => canonicalSetup("drive", { targetGap: 0.001 })).toThrow(/canonicalSetup: .*targetGap/);
    });

    it("plans a roll's hands arriving on their arc: the path continuous through contact (P2b.2b.2b.2b §4.1)", () => {
        for (const type of ["half-roll", "full-roll", "pass-roll"] as const) {
            const setup = canonicalSetup(type, { world: WORLD });
            const drive = buildContact(setup, WORLD).drive as TrackDrive;
            const track = prepareTrack(drive, buildContact(setup, WORLD).head, WORLD.gravity);
            const { arc } = drive;
            const before = handsAt(track, arc.contactAt - 1e-9);
            const after = handsAt(track, arc.contactAt + 1e-9);
            expect(length(sub(before.velocity, after.velocity)), type).toBeLessThan(1e-6);
            // 1 ns after contact the slope has turned with the arc, by about ṡ·1e-9/ρ_h ≈ 1.2e-9.
            const v = after.velocity;
            const slope = v.z / Math.hypot(v.x, v.y);
            expect(slope, type).toBeCloseTo(arcArrival(arc.handArcRadius, arc.handArcLow * arc.handReach), 8);
        }
    });

    it("gives the arc's slope at contact: level for no push, −s_low/√(ρ² − s_low²) otherwise", () => {
        // P2b.2b.2c.3a: the low point s_low = handArcLow·push is the caller's (was arcArrival(ρ, handArcLow, push)).
        expect(arcArrival(1.5, 0.5 * 0)).toBe(0);
        expect(arcArrival(1.5, 0.5 * 0.3)).toBeCloseTo(-0.15 / Math.sqrt(1.5 * 1.5 - 0.15 * 0.15), 15);
    });
});

describe("defaultProfile", () => {
    it("takes the mallet from mallet.json and the body from contact.json", () => {
        expect(defaultProfile.mallet).toEqual({
            headMass: malletReference.headMass.value,
            headLength: malletReference.headLength.value,
            head: {
                kind: "box",
                faceWidth: malletReference.faceWidth.value,
                faceHeight: malletReference.faceHeight.value,
                edgeRadius: malletReference.edgeRadius.value,
                inertiaAboutShaft: malletReference.inertiaAboutShaft.value,
            },
            shaftLength: malletReference.shaftLength.value,
            shaftMass: malletReference.shaftMass.value,
        });
        expect(defaultProfile.body).toEqual({
            armMass: contactReference.armMass.value,
            reachSlack: contactReference.reachSlack.value,
            flex: {
                stiffness: contactReference.armStiffness.value,
                stiffnessPerForce: contactReference.armStiffnessPerForce.value,
                dampingRatio: contactReference.armDampingRatio.value,
                endpointMass: contactReference.armEndpointMass.value,
                hold: {
                    stiffness: contactReference.armHoldStiffness.value,
                    damping: contactReference.armHoldDamping.value,
                },
            },
            pendulumForce: contactReference.pendulumForce.value,
            pushForce: contactReference.pushForce.value,
            pushResponseTime: contactReference.pushResponseTime.value,
            chain: {
                forearmMass: contactReference.forearmMass.value,
                handMass: contactReference.handMass.value,
                fingerMass: contactReference.fingerMass.value,
                palmSkinMass: contactReference.palmSkinMass.value,
                fingerSkinMass: contactReference.fingerSkinMass.value,
                wristStiffness: contactReference.wristStiffness.value,
                wristDamping: contactReference.wristDamping.value,
                knuckleStiffness: contactReference.knuckleStiffness.value,
                knuckleDamping: contactReference.knuckleDamping.value,
                palmStiffness: contactReference.palmStiffness.value,
                palmDamping: contactReference.palmDamping.value,
                fingerStiffness: contactReference.fingerStiffness.value,
                fingerDamping: contactReference.fingerDamping.value,
            },
            gripLimit: GRIP_LIMIT,
            backswingLimit: swingBodyReference.backswingLimit.value,
            effort: { torque: swingBodyReference.effortTorque.value, speed: swingBodyReference.effortSpeed.value },
            handAcceleration: swingBodyReference.handAcceleration.value,
        });
    });

    it("swings the single-ball stroke, the drive and the stops, and carries the rolls to their reach", () => {
        const modes = STROKE_TYPES.map((type) => defaultProfile.drive[type].mode);
        expect(modes).toEqual(["swing", "swing", "swing", "swing", "carry", "carry", "carry"]);
        const reaches = STROKE_TYPES.map((type) => defaultProfile.drive[type].handReach);
        expect(reaches).toEqual([0, 0, 0, 0, 0.15, 0.3, 0.3]);
        expect(defaultProfile.drive["stop-ac"].handDrop).toBe(0.011);
        // P2b.2b.2c.2d: the drive's guide effort 0.75, the largest that leaves no re-contact after the parting (was 1).
        expect(STROKE_TYPES.map((type) => defaultProfile.drive[type].guideEffort)).toEqual([1, 0.75, 1, 1, 1, 1, 1]);
    });

    it("takes each stroke type's shape from swing.json, the swing presets' pendulum alone", () => {
        for (const type of STROKE_TYPES) {
            const shape = defaultProfile.shape[type];
            const ref = swingReference[type];
            expect(shape.pendulumShare, type).toBe(ref.pendulumShare.value);
            expect(shape.handAngle, type).toBe(ref.handAngle.value);
            const tempo = ref.handTempo;
            expect(shape.handTempo, type).toEqual(
                tempo === null ? null : { slow: tempo.slow.value, fast: tempo.fast.value },
            );
        }
        expect(STROKE_TYPES.slice(0, 4).map((type) => defaultProfile.shape[type].pendulumShare)).toEqual([1, 1, 1, 1]);
    });

    it("takes any preset's hands' tempo or none, a missing one the free swing's own fall", () => {
        // P2b.2b.2c.3a design §4.1: handTempo is optional on every stroke (was: a carry preset without one threw a
        // ReferenceDataError naming handTempoSlow); planStroke rejects only a plan that cannot derive it.
        const drive = swingReference.drive;
        const roll = swingReference["full-roll"];
        expect(shapeOf("full-roll", { ...roll, handTempo: null }).handTempo).toBeNull();
        expect(shapeOf("drive", { ...drive, handTempo: null }).handTempo).toBeNull();
        const tempo = roll.handTempo as NonNullable<typeof roll.handTempo>;
        expect(shapeOf("drive", { ...drive, handTempo: tempo }).handTempo).toEqual({
            slow: tempo.slow.value,
            fast: tempo.fast.value,
        });
    });

    it("lets the swing presets' slope swing and holds the rolls' (P2b.2b.2c.3a design §4.1)", () => {
        expect(STROKE_TYPES.map((type) => defaultProfile.shape[type].slopeHold)).toEqual([0, 0, 0, 0, 1, 1, 1]);
        expect(STROKE_TYPES.map((type) => SLOPE_HOLD[type])).toEqual([0, 0, 0, 0, 1, 1, 1]);
    });
});

describe("buildContact rejections", () => {
    const missing = (record: "stance" | "drive" | "shape"): SwingProfile => {
        const p = testProfile();
        const kept = Object.fromEntries(Object.entries(p[record]).filter(([type]) => type !== "drive"));
        return { ...p, [record]: kept } as unknown as SwingProfile;
    };
    /** The test stance's A and D at `up` 0 (P2b.2b.2b.1 design §3.2, §3.4), in validate's operation order. */
    const A = RHO + TOP;
    const B = R + START_GAP + LENGTH / 2;
    const D = Math.sqrt(A * A + B * B);
    /** A stance from before P2b.2b.2b.1: a lean and no handsAhead (review focus 5). */
    const legacy = (): SwingProfile => {
        const p = testProfile();
        const old = { lean: 0, top: 0.8, bottom: 0.4, gripTension: 1, bottomGrip: 1 } as unknown as SwingStance;
        return { ...p, stance: { ...p.stance, "single-ball": old } };
    };
    const cases: readonly [string, ShotSetup, RegExp][] = [
        ["the striker absent", { ...shot(), striker: "red" }, /striker red is not in the setup/],
        ["a stroke type missing from the stance", shot({ type: "drive" }, missing("stance")), /stance has no entry/],
        ["a stroke type missing from the drive", shot({ type: "drive" }, missing("drive")), /drive has no entry/],
        ["a stroke type missing from the shape", shot({ type: "drive" }, missing("shape")), /shape has no entry/],
        [
            "a mode other than swing or carry",
            shot({}, testProfile({ drive: { mode: "chip" as StrokeMode } })),
            /mode must be "swing" or "carry"/,
        ],
        ["a non-finite number", shot({ aim: NaN }), /stroke\.aim must be finite/],
        ["a non-finite timing", shot({ timing: { arc: NaN, hands: 0, dip: 0 } }), /stroke\.timing\.arc must be finite/],
        ["a non-finite shot's reach", shot({ handReach: NaN }), /stroke\.handReach must be finite/],
        ["a non-finite shot's guide effort", shot({ guideEffort: NaN }), /stroke\.guideEffort must be finite/],
        [
            "a non-finite arm mass",
            shot({}, testProfile({ body: { armMass: Infinity } })),
            /profile\.body\.armMass must be finite/,
        ],
        ["the top hand at the socket", shot({}, testProfile({ stance: { top: 0 } })), /\.top must be positive/],
        ["the top hand off the shaft", shot({}, testProfile({ stance: { top: 0.95 } })), /off the shaft/],
        ["the bottom hand at the top hand", shot({}, testProfile({ stance: { bottom: 0.8 } })), /\.bottom must lie in/],
        ["the bottom hand at the socket", shot({}, testProfile({ stance: { bottom: 0 } })), /\.bottom must lie in/],
        [
            "the top hand at A, the shaft flat",
            shot({}, testProfile({ stance: { handsAhead: A } })),
            /handsAhead must lie in/,
        ],
        ["the top hand beyond A", shot({}, testProfile({ stance: { handsAhead: 0.9 } })), /handsAhead must lie in/],
        [
            "the top hand at −D, off the stance's branch",
            shot({}, testProfile({ stance: { handsAhead: 0 - D } })),
            /handsAhead must lie in/,
        ],
        ["the top hand below −D", shot({}, testProfile({ stance: { handsAhead: -1 } })), /handsAhead must lie in/],
        [
            "a non-finite hands' position",
            shot({}, testProfile({ stance: { handsAhead: NaN } })),
            /profile\.stance\.single-ball\.handsAhead must be finite/,
        ],
        [
            "a stance with a lean but no handsAhead",
            shot({}, legacy()),
            /profile\.stance\.single-ball\.handsAhead must be finite \(got undefined\)/,
        ],
        [
            "a contact off the face, before the hands' range",
            shot({ contact: { up: 0.03, side: 0.02 } }, testProfile({ stance: { handsAhead: 2 } })),
            /off the face/,
        ],
        ["a drive beyond ±1", shot({ drive: 1.5 }), /stroke\.drive must lie in/],
        ["a contact off the face", shot({ contact: { up: 0.03, side: 0.02 } }), /off the face/],
        [
            "a box head's contact off its flat face",
            shot({ contact: { up: 0, side: 0.0295 } }, testProfile({ mallet: { head: TEST_BOX_HEAD } })),
            /off the face/,
        ],
        [
            "a box head whose edge radius reaches half its height",
            shot({}, testProfile({ mallet: { head: { ...TEST_BOX_HEAD, edgeRadius: 0.032 } } })),
            /profile\.mallet\.head\.edgeRadius must lie in \[0, 0\.032\)/,
        ],
        [
            "a box head with a negative edge radius",
            shot({}, testProfile({ mallet: { head: { ...TEST_BOX_HEAD, edgeRadius: -0.001 } } })),
            /profile\.mallet\.head\.edgeRadius must be non-negative/,
        ],
        [
            "a box head's moment past the realisable",
            shot({}, testProfile({ mallet: { head: { ...TEST_BOX_HEAD, inertiaAboutShaft: 0.05 } } })),
            /moment about the shaft must lie in/,
        ],
        [
            "a negative shaft mass",
            shot({}, testProfile({ mallet: { shaftMass: -0.1 } })),
            /profile\.mallet\.shaftMass must be non-negative/,
        ],
        [
            "an unknown head kind",
            shot(
                {},
                testProfile({
                    mallet: { head: { kind: "oval" } as unknown as MalletHeadProfile },
                    stance: { handsAhead: -0.1 },
                }),
            ),
            /profile\.mallet\.head\.kind must be "round" or "box"/,
        ],
        ["a non-positive window", shot({}, testProfile({ drive: { window: 0 } })), /\.window must be positive/],
        ["a non-positive hands' window", shot({}, testProfile({ drive: { handWindow: 0 } })), /handWindow/],
        ["a non-positive dip time", shot({}, testProfile({ drive: { dropTime: 0 } })), /dropTime must be positive/],
        ["a negative speedGain", shot({}, testProfile({ drive: { speedGain: -0.1 } })), /speedGain must be non-neg/],
        [
            "a grip tension of 0",
            shot({}, testProfile({ stance: { gripTension: 0 } })),
            /gripTension must lie in \(0, 1\]/,
        ],
        [
            "a bottom grip above 1",
            shot({}, testProfile({ stance: { bottomGrip: 1.5 } })),
            /bottomGrip must lie in \(0, 1\]/,
        ],
        ["a negative dip", shot({}, testProfile({ drive: { handDrop: -0.001 } })), /handDrop must be non-negative/],
        [
            "a negative preset reach",
            shot({}, testProfile({ drive: { handReach: -0.1 } })),
            /drive\.single-ball\.handReach must be non-negative/,
        ],
        ["a negative shot's reach", shot({ handReach: -0.1 }), /stroke\.handReach must be non-negative/],
        [
            "a negative preset guide effort",
            shot({}, testProfile({ drive: { guideEffort: -0.1 } })),
            /drive\.single-ball\.guideEffort must lie in \[0, 1\]/,
        ],
        ["a shot's guide effort above 1", shot({ guideEffort: 1.5 }), /stroke\.guideEffort must lie in \[0, 1\]/],
        ["a negative arm mass", shot({}, testProfile({ body: { armMass: -0.1 } })), /armMass must be non-negative/],
        [
            "a negative reach slack",
            shot({}, testProfile({ body: { reachSlack: -0.01 } })),
            /reachSlack must be non-negative/,
        ],
        ["an action over 150 ms early", shot({ timing: { arc: -0.16, hands: 0, dip: 0 } }), /more than 0\.15 s early/],
        ["a head in the turf at contact", shot({}, testProfile({ stance: { lean: -0.3 } })), /in the turf at contact/],
        ["a non-finite backswing", shot({ backswing: NaN }), /stroke\.backswing must be finite/],
        ["a backswing of 0", shot({ backswing: 0 }), /stroke\.backswing must be positive/],
        ["an intensity above 1", shot({ intensity: 1.2 }), /stroke\.intensity must lie in \[0, 1\]/],
        [
            "a pendulum share above 1",
            shot({}, testProfile({ shape: { pendulumShare: 1.1 } })),
            /pendulumShare must lie in \[0, 1\]/,
        ],
        [
            "a hands' angle of 90° with a hands' share",
            shot({}, testProfile({ shape: { pendulumShare: 0.5, handAngle: Math.PI / 2 } })),
            /handAngle must lie in \(0, 90°\)/,
        ],
        [
            "a share of 0 on a free swing",
            shot({}, testProfile({ shape: { pendulumShare: 0 } })),
            /pendulumShare must be positive where the downswing needs its free swing/,
        ],
        [
            "a share of 0 on a held slope with no hands' tempo to hold it on",
            shot({}, testProfile({ shape: { pendulumShare: 0, slopeHold: 1, handTempo: null } })),
            /pendulumShare must be positive where the downswing needs its free swing/,
        ],
        [
            "a planned slope above 1",
            shot({}, testProfile({ shape: { slopeHold: 1 + 1e-9 } })),
            /profile\.shape\.single-ball\.slopeHold must lie in \[0, 1\]/,
        ],
        [
            "a non-finite planned slope",
            shot({}, testProfile({ shape: { slopeHold: NaN } })),
            /profile\.shape\.single-ball\.slopeHold must be finite/,
        ],
        [
            "a negative effort torque",
            shot({}, testProfile({ body: { effort: { torque: -1, speed: 20 } } })),
            /profile\.body\.effort\.torque must be non-negative/,
        ],
        [
            "a non-finite effort speed",
            shot({}, testProfile({ body: { effort: { torque: 1, speed: NaN } } })),
            /profile\.body\.effort\.speed must be finite/,
        ],
        [
            // P2b.2b.2c.3a: a given tempo is checked on every stroke (was: only on a carry, which also required one).
            "a fast hands' tempo slower than the slow",
            shot({}, testProfile({ shape: { handTempo: { slow: 0.2, fast: 0.3 } } })),
            /handTempo\.fast must not exceed .*handTempo\.slow/,
        ],
        ["a backswing beyond the shaft horizontal", shot({ backswing: 2 }), /beyond/],
    ];

    it.each(cases)("rejects %s", (_name, setup, pattern) => {
        expect(() => buildContact(setup, WORLD)).toThrow(pattern);
    });

    it("neither reads nor checks the hands' angle of a pendulum alone (P2b.2b.2a design §3.2)", () => {
        const setup = shot({}, testProfile({ shape: { pendulumShare: 1, handAngle: NaN } }));
        expect(planStroke(setup, WORLD).contactSpeed).toBe(plannedSpeed(shot(), WORLD));
    });

    it(
        "plans a stroke that gives no intensity at intensity 0 " +
            "(the default backswing fixed, speeds above it by effort: the pre-flight gate, 2026-10-18)",
        () => {
            const profile = testProfile({ body: { effort: { torque: 40, speed: 20 } } });
            expect(plannedSpeed(shot({}, profile), WORLD)).toBe(plannedSpeed(shot({ intensity: 0 }, profile), WORLD));
            expect(plannedSpeed(shot({ intensity: 0.5 }, profile), WORLD)).toBeGreaterThan(
                plannedSpeed(shot({}, profile), WORLD),
            );
        },
    );
});

describe("contactPose (design §5.2 steps 1–5, 10)", () => {
    it("is the on-time contact's pose: the head, its centre and orientation, the aim and the top hand", () => {
        // Met on the up, low on the face: clear of the turf on the way in (the dip test's stance).
        const setup = shot(
            { contact: { up: -0.01, side: 0.002 } },
            testProfile({ stance: { lean: -0.05 }, up: -0.01 }),
        );
        const pose = contactPose(setup, WORLD);
        const c = buildContact(setup, WORLD);
        expect(pose.head).toEqual(c.head);
        // headOnPath rebuilds the centre from the path, which differs from the placed one by rounding (~6e-17 m).
        expect(dist(pose.headCentre, c.position)).toBeLessThan(1e-12);
        expect(pose.orientation).toEqual(c.orientation);
        expect(pose.thetaContact).toBeCloseTo(0.05, 12);
        expect(pose.radius).toBe(TOP);
        expect(pose.aim).toEqual(arcOf(c).aim);
        expect(pose.pivot).toEqual(arcOf(c).pivot);
    });

    it("gives the downswing the swung body's pendulum, and the planned speed |V_c + ω₀·n × (c − P_c)|", () => {
        const pose = contactPose(shot(), WORLD);
        const hands = { ...TEST_HANDS, armMass: 0.8 };
        const shape: SwingShape = {
            pendulumShare: 1,
            handAngle: 0.5,
            handTempo: { slow: 0.4, fast: 0.2 },
            slopeHold: 0,
        };
        const choice = {
            shape,
            slopeHold: 0,
            backswing: 0.3,
            backswingLimit: MAX_BACK_ANGLE,
            effort: { torque: 0, speed: 1 },
            intensity: 0,
            arrival: 0,
        };
        const input = downswingInput(pose, hands, choice, 9.8);
        expect(input.lever).toBe(RHO + TOP);
        expect(input.pendulum).toEqual(pendulumOf(pose.head, swungBody(pose.head, hands, TOP), TOP, 9.8));
        // P2b.2b.2c.3a design §4.1: C = min(γ_T, g_B)·F_max·(r − b), the grip's couple from the hands and the pose.
        const spread = TOP - hands.bottom;
        expect(input.grip).toEqual({ top: 1, bottom: 1, limit: hands.gripLimit, spread });
        expect(input.couple).toBe(hands.gripLimit * spread);
        const planned = planDownswing(input);
        // The hands still: the head swings at ω₀·ℓ_h.
        expect(poseSpeed(pose, planned)).toBeCloseTo(planned.omega * (RHO + TOP), 12);
    });

    it("puts the top hand handsAhead ahead of the ball along aim, the face pitched by stanceLean's lean", () => {
        // P2b.2b.2b.1 design §5.1. `side` moves nothing along aim.
        const aim = vec3(Math.cos(0.4), Math.sin(0.4), 0);
        const geometry = { ballRadius: R, headLength: LENGTH, faceHalfHeight: RHO };
        for (const handsAhead of [-0.25, -0.1, 0.12]) {
            for (const up of [-0.01, 0, 0.01]) {
                const setup = shot({ contact: { up, side: 0.004 } }, testProfile({ stance: { handsAhead } }));
                const pose = contactPose(setup, WORLD);
                const ahead = dot(sub(pose.pivot, vec3(5, 3, 0)), aim);
                expect(Math.abs(ahead - handsAhead), `${handsAhead} m at up ${up} m`).toBeLessThan(1e-12);
                const lean = stanceLean(handsAhead, TOP, up, geometry);
                expect(pose.thetaContact).toBe(0 - lean);
                expect(Math.abs(rotate(pose.orientation, vec3(1, 0, 0)).z + Math.sin(lean))).toBeLessThan(1e-12);
            }
        }
    });

    it("keeps a stance's hands, its lean following, when the mallet or the ball changes", () => {
        // Review focus 1 (P2b.2b.2b.1 design §4): a stance entered as hands keeps them, and the rigid geometry moves
        // its lean.
        const aim = vec3(Math.cos(0.4), Math.sin(0.4), 0);
        const base = testProfile({ stance: { lean: 0.5 } });
        const hands = base.stance["single-ball"].handsAhead;
        const cases = [
            {
                profile: { ...base, mallet: { ...base.mallet, headLength: 0.3 } },
                world: WORLD,
                geometry: { ballRadius: R, headLength: 0.3, faceHalfHeight: RHO },
            },
            {
                profile: base,
                world: testWorld({ ball: { ...WORLD.ball, radius: 0.05 } }),
                geometry: { ballRadius: 0.05, headLength: LENGTH, faceHalfHeight: RHO },
            },
        ];
        for (const { profile, world, geometry } of cases) {
            const pose = contactPose(shot({}, profile), world);
            expect(Math.abs(dot(sub(pose.pivot, vec3(5, 3, 0)), aim) - hands)).toBeLessThan(1e-12);
            const lean = stanceLean(hands, TOP, 0, geometry);
            expect(pose.thetaContact).toBe(0 - lean);
            expect(Math.abs(lean - 0.5)).toBeGreaterThan(1e-3);
        }
    });
});

describe("the lead (design §3.5)", () => {
    /** The low swing of the swingApproach test: its downswing dips 3.6 mm into the turf. */
    const low = (stroke: Partial<Stroke> = {}) => shot({ contact: { up: 0.01, side: 0 }, ...stroke });
    const grounded = (c: ContactState): number => {
        const arc = arcOf(c);
        return scanDownswing(arc.downswing as Downswing, c.head, arc.aim, arc.radius).grounded as number;
    };

    it("starts a fat stroke TURF_MARGIN before its downswing first meets the turf", () => {
        const c = buildContact(low(), WORLD);
        const g = grounded(c);
        expect(g).toBeLessThan(0);
        expect(arcOf(c).contactAt).toBeCloseTo(TURF_MARGIN - g, 15);
        expect(headLowestPoint(c, c.head)).toBeGreaterThan(0);
        // A clean swing's lead stays the actions'.
        expect(arcOf(buildContact(shot(), WORLD)).contactAt).toBe(0);
    });

    it("takes the larger of the action's lead and the turf's", () => {
        // Review focus 4.
        const turf = TURF_MARGIN - grounded(buildContact(low(), WORLD));
        const earlier = buildContact(low({ timing: { arc: 0, hands: 0, dip: -(turf + 0.01) } }), WORLD);
        expect(arcOf(earlier).contactAt).toBeCloseTo(turf + 0.01, 15);
        const later = buildContact(low({ timing: { arc: -(turf - 0.002), hands: 0, dip: 0 } }), WORLD);
        expect(arcOf(later).contactAt).toBeCloseTo(turf, 15);
        expect(arcOf(later).arcStart).toBeCloseTo(0.002, 12);
    });

    it("rejects a downswing that meets the turf more than MAX_LEAD early, naming the turf", () => {
        // Review focus 4. A slow low swing: 5 cm back, the ball met 12 mm above the face centre. Its head enters the
        // turf about 0.245 rad back, where the gravity swing from 0.35 rad has barely begun: about 0.2 s before
        // contact.
        const slow = shot({ backswing: 0.05, contact: { up: 0.012, side: 0 } });
        expect(() => buildContact(slow, WORLD)).toThrow(/meets the turf .* before contact/);
    });

    it("rejects a short downswing whose top lies in the turf: the impact would start there", () => {
        // A 5 mm backswing pitches the head's rear rim down more than it raises the head: met 10 mm above the face
        // centre, the top is about 3.4 mm in the turf. Carried in 50 ms, the lead is TURF_MARGIN before the release,
        // where the head is held at the top.
        const quick = testProfile({ drive: { mode: "carry" }, shape: { handTempo: { slow: 0.1, fast: 0.05 } } });
        const setup = shot({ backswing: 0.005, intensity: 1, contact: { up: 0.01, side: 0 } }, quick);
        expect(() => buildContact(setup, WORLD)).toThrow(/the head is in the turf 0\.055 s before contact/);
        // Met at the face centre, the same downswing stays clear and starts on time.
        const clear = buildContact({ ...setup, stroke: { ...setup.stroke, contact: { up: 0, side: 0 } } }, WORLD);
        expect(arcOf(clear).contactAt).toBe(0);
        expect(headLowestPoint(clear, clear.head)).toBeGreaterThan(0);
    });

    it("simulates a fat stroke: the turf slows the head before the ball, against the same swing raised clear", () => {
        // Spec §7.1. Raised clear: the ball met at the face centre, the head 10 mm higher on the same pendulum, so both
        // plan the same speed.
        const fatPlan = planStroke(low(), WORLD);
        const cleanPlan = planStroke(shot(), WORLD);
        expect(fatPlan.contactSpeed).toBeCloseTo(cleanPlan.contactSpeed, 12);
        const firstStrike = (plan: typeof fatPlan) => {
            const probe = recorder();
            const impact = simulateImpact(plan.contact, { blue: BLUE }, WORLD, { probe });
            const strike = (impact.timeline["face/blue"] ?? [])[0];
            expect(strike).toBeDefined();
            const start = (strike as { start: number }).start;
            const at = probe.snapshots.find((s) => s.t >= start - 1e-12);
            return { impact, start, speed: length((at as { head: { velocity: Vec3 } }).head.velocity) };
        };
        const fat = firstStrike(fatPlan);
        const clean = firstStrike(cleanPlan);
        const dug = fat.impact.timeline["head/turf"]?.[0];
        expect(dug).toBeDefined();
        expect((dug as { start: number }).start).toBeLessThan(fat.start);
        expect(fat.speed).toBeLessThan(clean.speed);
        // The loss is fractional (user decision 2026-10-07: a light graze costs "only fractionally"): measured about
        // 3.03 against 3.12 m/s. P2b.2b.2b.3: the turf strike (was 3.03): 2.98 against 3.12 m/s, the head ploughing.
        expect(fat.speed).toBeGreaterThan(0.9 * clean.speed);
        // The firm grip has no position spring on a downswing, so the head stays where the turf put it.
        // P2b.2b.2b.3: the turf strike (was about 0.50 mm in, under the 2 mm limit, the turf 5.00–14.55 ms, 3.030 m/s
        // at the strike): the grazing head yields the turf's columns (turf-yield at 7.42 ms) and ploughs a furrow
        // 5.43–47.67 ms long, 129.6 mm of slide, sinking to 2.54 mm and raising impact-head-deep at 13.94 ms; 2.983
        // m/s at the strike. Unpredicted, for the gate: the spec's light graze (§7.4) stays within 2 mm.
        expect(fat.impact.events.map((e) => e.kind)).toEqual(["turf-yield", "impact-head-deep", "turf-lift"]);
    });

    it("plays a 2 mm backswing as a gentle tap", () => {
        // Review focus 1: about 0.19 m/s by gravity alone on the test pendulum.
        const setup = shot({ backswing: 0.002 });
        const { contact, contactSpeed } = planStroke(setup, WORLD);
        expect(contactSpeed).toBeGreaterThan(0.1);
        expect(contactSpeed).toBeLessThan(0.3);
        const kinds = simulateImpact(contact, setup.balls, WORLD).events.map((e) => e.kind);
        expect(kinds).not.toContain("impact-cap");
    });

    it("starts the downswing behind the ball along any aim", () => {
        // Review focus 3.
        for (const aim of [Math.PI, -Math.PI / 2, 7]) {
            const c = buildContact(shot({ aim }), WORLD);
            const arc = arcOf(c);
            const track = prepareTrack(c.drive as TrackDrive, c.head, WORLD.gravity);
            const top = headOnPath(track, c.head, arc.contactAt + (arc.downswing as Downswing).release);
            const back = horizontal(sub(top.position, c.position));
            const along = vec3(Math.cos(aim), Math.sin(aim), 0);
            expect(dot(back, along), `aim ${aim}`).toBeLessThan(-0.1);
            expect(length(cross(back, along)), `aim ${aim}`).toBeLessThan(1e-9);
        }
    });
});

describe("the jab (P2b.2b.2b.3 design §6.1)", () => {
    const world = defaultWorld();

    it("deepens the planned dip by the jab, on the dip's own timing", () => {
        const setup = canonicalSetup("stop-ac");
        const plain = planStroke(setup, world).contact.drive as TrackDrive;
        const jabbed = planStroke({ ...setup, stroke: { ...setup.stroke, jab: 0.003 } }, world).contact
            .drive as TrackDrive;
        expect(jabbed.arc.dip.depth).toBe(setup.profile.drive["stop-ac"].handDrop + 0.003);
        expect(jabbed.arc.dip.start).toBe(plain.arc.dip.start);
        expect(jabbed.arc.dip.duration).toBe(plain.arc.dip.duration);
    });

    it.each(STROKE_TYPES)("leaves the %s stroke unchanged to the bit at a jab of 0", (type) => {
        const setup = canonicalSetup(type);
        expect(planStroke({ ...setup, stroke: { ...setup.stroke, jab: 0 } }, world)).toEqual(planStroke(setup, world));
    });

    it("rejects a negative or non-finite jab, and accepts a carry stroke's jab of 0", () => {
        const ac = canonicalSetup("stop-ac");
        for (const jab of [-0.001, Number.NaN, Infinity]) {
            expect(() => planStroke({ ...ac, stroke: { ...ac.stroke, jab } }, world), `${jab}`).toThrow(
                /stroke\.jab must be/,
            );
        }
        const roll = canonicalSetup("full-roll");
        expect(planStroke({ ...roll, stroke: { ...roll.stroke, jab: 0 } }, world)).toEqual(planStroke(roll, world));
    });

    it("accepts a jab on a held slope", () => {
        const roll = canonicalSetup("half-roll");
        const plain = planStroke(roll, world).contact.drive as TrackDrive;
        const jabbed = planStroke({ ...roll, stroke: { ...roll.stroke, jab: 0.002 } }, world).contact
            .drive as TrackDrive;
        expect(plain.arc.slopeHold).toBe(1);
        // The jab's 0.002 m is what the dip gains over the same shot without one.
        expect(Math.abs(jabbed.arc.dip.depth - (plain.arc.dip.depth + 0.002))).toBeLessThan(1e-15);
    });
});

describe("the dip's raise follows the croqueted ball (P2b.2b.2c.3a Review Focus 5)", () => {
    const world = defaultWorld();

    it("raises the dip by whether a croqueted ball is given", () => {
        const given = canonicalSetup("stop-ac");
        const bare: ShotSetup = { ...given };
        delete (bare as { croqueted?: unknown }).croqueted;
        expect(given.croqueted).toBeDefined();
        const withDip = (setup: ShotSetup, dip: number): ShotSetup => ({
            ...setup,
            stroke: { ...setup.stroke, timing: { ...setup.stroke.timing, dip } },
        });
        const downswingOf = (setup: ShotSetup) => (planStroke(setup, world).contact.drive as TrackDrive).arc.downswing;
        // No croqueted ball: no raise, so the dip's timing leaves the downswing alone.
        expect(downswingOf(withDip(bare, -0.01))).toEqual(downswingOf(withDip(bare, 0)));
        // A croqueted ball: today's raise, which a dip timed early changes.
        expect(downswingOf(withDip(given, -0.01))).not.toEqual(downswingOf(withDip(given, 0)));
        expect(() => simulateShot(bare, world)).toThrow(/needs a croqueted ball/);
    });
});

describe("the stance's geometry (P2b.2b.2b.1 design §3.2, §3.3)", () => {
    /** The test ball and head: R, L and ρ. */
    const GEOMETRY = { ballRadius: R, headLength: LENGTH, faceHalfHeight: RHO };
    /** B = R + START_GAP + L/2, in the engine's operation order. */
    const B = R + START_GAP + LENGTH / 2;

    it("reads every lean back from the top hand's position, within 1e-12 rad", () => {
        for (let degrees = -30; degrees <= 80; degrees += 5) {
            for (const top of [0.3, 0.45, 0.6, 0.75, 0.9]) {
                for (const up of [-0.03, -0.015, 0, 0.015, 0.03]) {
                    const lean = degrees * DEG;
                    const back = stanceLean(handsAheadFor(lean, top, up, GEOMETRY), top, up, GEOMETRY);
                    expect(Math.abs(back - lean), `${degrees}° at top ${top} m, up ${up} m`).toBeLessThan(1e-12);
                }
            }
        }
    });

    it("puts an upright shaft's top hand B behind the ball's centre and reads it back as exactly 0", () => {
        // Design §3.2: S² is formed as A² + (B − X)(B + X), so at X = −B it is fl(A²), S is A, and the lean's sine is
        // exactly 0. This keeps the upright presets bit-identical (exit criterion 3).
        for (const top of [0.3, 0.6, 0.9]) {
            for (const up of [-0.03, 0, 0.03]) {
                const hands = handsAheadFor(0, top, up, GEOMETRY);
                expect(hands, `top ${top} m, up ${up} m`).toBe(0 - B);
                expect(stanceLean(hands, top, up, GEOMETRY), `top ${top} m, up ${up} m`).toBe(0);
            }
        }
    });

    it("places the top hand at X = A·sin α − B·cos α, A = ρ + top − up", () => {
        const [top, up, lean] = [0.6, 0.01, 0.5];
        const A = RHO + top - up;
        expect(handsAheadFor(lean, top, up, GEOMETRY)).toBeCloseTo(A * Math.sin(lean) - B * Math.cos(lean), 14);
    });

    it("leans further under the same hands as the contact rises, by sin α/(A·cos α + B·sin α) per metre", () => {
        // Review focus 4 (design §3.3): at fixed X, dα = −sin α·dA/(A·cos α + B·sin α), and dA = −d(up). A higher
        // contact steepens a forward lean and leans a backward one further back; an upright shaft stays upright.
        const top = 0.6;
        const h = 1e-5;
        for (const lean of [-0.1, 0.5]) {
            const hands = handsAheadFor(lean, top, 0, GEOMETRY);
            const slope = (stanceLean(hands, top, h, GEOMETRY) - stanceLean(hands, top, 0 - h, GEOMETRY)) / (2 * h);
            const A = RHO + top;
            const expected = Math.sin(lean) / (A * Math.cos(lean) + B * Math.sin(lean));
            expect(slope / expected, `lean ${lean} rad`).toBeCloseTo(1, 6);
        }
        expect(stanceLean(handsAheadFor(0, top, 0, GEOMETRY), top, 0.01, GEOMETRY)).toBe(0);
    });

    it("keeps the lean inside ±90° for every top-hand position the stance accepts", () => {
        // Pins the bound the old |lean| < 90° check enforced (P2b.2b.2b.1 design §3.4).
        const samples = 50;
        for (const top of [0.3, 0.6, 0.9]) {
            for (const up of [-0.03, 0, 0.03]) {
                const A = RHO + top - up;
                const D = Math.sqrt(A * A + B * B);
                for (let k = 0; k < samples; k++) {
                    const handsAhead = 0 - D + ((k + 0.5) * (A + D)) / samples;
                    const lean = stanceLean(handsAhead, top, up, GEOMETRY);
                    expect(Math.abs(lean), `top ${top} m, up ${up} m, handsAhead ${handsAhead} m`).toBeLessThan(
                        Math.PI / 2,
                    );
                }
            }
        }
    });
});

describe("sharpness: stroke.window (P2b.2b.2c.2d design §3.2)", () => {
    const prep = (c: ContactState) => prepareTrack(c.drive as TrackDrive, c.head, WORLD.gravity);
    it("sets both pulses' duration, keeping their change", () => {
        const c = buildContact(shot({ drive: 0.5, window: 0.004 }), WORLD);
        const arc = (c.drive as TrackDrive).arc;
        const base = (buildContact(shot({ drive: 0.5 }), WORLD).drive as TrackDrive).arc;
        expect(arc.window).toBe(0.004);
        expect(arc.handWindow).toBe(0.004);
        expect(arc.alpha * arc.window).toBeCloseTo(base.alpha * base.window, 12);
    });
    it("keeps the hands' change too", () => {
        const c = buildContact(shot({ drive: 0.5, window: 0.004 }), WORLD);
        const arc = (c.drive as TrackDrive).arc;
        const base = (buildContact(shot({ drive: 0.5 }), WORLD).drive as TrackDrive).arc;
        const change = length(scale(arc.pivotAcceleration, arc.handWindow));
        expect(change).toBeCloseTo(length(scale(base.pivotAcceleration, base.handWindow)), 12);
    });
    it("keeps carry mode's hold at the preset's window", () => {
        const c = buildContact(canonicalSetup("full-roll", { stroke: { window: 0.01 } }), WORLD);
        expect((c.drive as TrackDrive).arc.holdWindow).toBe(defaultProfile.drive["full-roll"].window);
    });
    it("checks stroke.window's bounds", () => {
        for (const ok of [MIN_WINDOW, MAX_WINDOW]) {
            expect(() => buildContact(shot({ window: ok }), WORLD)).not.toThrow();
        }
        for (const bad of [MIN_WINDOW * (1 - 1e-9), MAX_WINDOW * (1 + 1e-9), 0, -0.01, NaN]) {
            expect(() => buildContact(shot({ window: bad }), WORLD)).toThrow(/stroke\.window/);
        }
    });
    it("shapes nothing at drive 0", () => {
        // No change to deliver, so the window cannot matter. Not to the bit: the hands' window's end re-bases
        // P_e + V_e·u at a different time, which rounds differently.
        const a = buildContact(shot({ drive: 0 }), WORLD);
        const b = buildContact(shot({ drive: 0, window: 0.02 }), WORLD);
        const d = sub(pathAt(prep(b), 0.03).socket, pathAt(prep(a), 0.03).socket);
        expect(length(d)).toBeLessThan(1e-12);
    });
    it("leaves a shot without a window as it was", () => {
        const c = buildContact(shot({ drive: 0.5 }), WORLD);
        expect("holdWindow" in (c.drive as TrackDrive).arc).toBe(false);
    });
});

/** The head at rest in `setup`'s contact pose on WORLD. */
function poseAt(setup: ShotSetup) {
    const pose = contactPose(setup, WORLD);
    const still = vec3(0, 0, 0);
    return { position: pose.headCentre, orientation: pose.orientation, velocity: still, angularVelocity: still };
}

/** The single-ball graze's approach, printed on the commit before the dip was coupled to the pulse. */
const GRAZE_APPROACH = { clearance: -0.003712074755199358, before: 0.04402490881455079 };

describe("the dip coupled to the pulse (P2b.2b.2c.2d design §4.2)", () => {
    const stop = (timing: StrokeTiming) => canonicalSetup("stop-ac", { stroke: { timing } });
    it("starts the dip with the pulse, offset by timing.dip", () => {
        const c = buildContact(stop({ arc: -0.01, hands: 0, dip: 0 }), WORLD);
        const arc = (c.drive as TrackDrive).arc;
        expect(arc.dip.start).toBe(arc.arcStart);
        const late = (buildContact(stop({ arc: -0.01, hands: 0, dip: 0.004 }), WORLD).drive as TrackDrive).arc;
        expect(late.dip.start).toBeCloseTo(late.arcStart + 0.004, 15);
    });
    it("leads by the coupled dip", () => {
        // Review focus 3: arc −10 ms, dip −20 ms from it, so the dip starts 30 ms early, at t = 0.
        const arc = (buildContact(stop({ arc: -0.01, hands: 0, dip: -0.02 }), WORLD).drive as TrackDrive).arc;
        expect(arc.contactAt).toBeCloseTo(0.03, 15);
        expect(arc.dip.start).toBe(0);
    });
    it("rejects a coupled dip past MAX_LEAD", () => {
        expect(() => buildContact(stop({ arc: -0.1, hands: 0, dip: -0.06 }), WORLD)).toThrow(/dip.*0\.16/);
    });
    it("meets the ball at the shot's contact with the dip under way on a croquet stroke", () => {
        // The AC stop's 11 mm dip begun 10 ms before contact, the brake on time: the planner raises the downswing by
        // the dip's travel, so the head's lowest point at contact is the pose's, CANONICAL_CLEARANCE["stop-ac"].
        const setup = stop({ arc: 0, hands: 0, dip: -0.01 });
        const c = buildContact(setup, WORLD);
        const track = prepareTrack(c.drive as TrackDrive, c.head, WORLD.gravity);
        const atContact = headOnPath(track, c.head, (c.drive as TrackDrive).arc.contactAt);
        expect(headLowestPoint(atContact, c.head)).toBeCloseTo(headLowestPoint(poseAt(setup), c.head), 9);
    });
    it("lowers the raised hands onto the pose's at contact when the brake is early too", () => {
        // The brake 10 ms early turns the head before contact, and the head's pitch there is left to it: the contact
        // point moves only by the brake's effect on the head's speed and pitch (design §4.2). The hands land on the
        // pose: the dip, begun with the brake, lowers the raised pivot by its travel by contact.
        const setup = stop({ arc: -0.01, hands: 0, dip: 0 });
        const c = buildContact(setup, WORLD);
        const track = prepareTrack(c.drive as TrackDrive, c.head, WORLD.gravity);
        const hands = handsAt(track, (c.drive as TrackDrive).arc.contactAt).position;
        expect(dist(hands, contactPose(setup, WORLD).pivot)).toBeLessThan(1e-12);
    });
    it("leaves the single-ball graze unplanned, as before", () => {
        // turfStrike.test.ts's GRAZE: a dip 5 ms before contact on a single-ball stroke, which the planner ignores.
        const graze = canonicalSetup("single-ball", {
            stroke: { contact: { up: 0.01, side: 0 }, jab: 0.001, timing: { arc: 0, hands: 0, dip: -0.005 } },
        });
        expect(swingApproach(buildContact(graze, WORLD))).toEqual(GRAZE_APPROACH);
    });
});
