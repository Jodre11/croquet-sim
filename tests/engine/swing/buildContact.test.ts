import { describe, expect, it } from "vitest";
import { headLowestPoint } from "../../../src/engine/impact/contacts";
import { rotate, solidCylinderInertia } from "../../../src/engine/impact/rigidBody";
import { simulateImpact } from "../../../src/engine/impact/simulateImpact";
import {
    HAND_COUPLING,
    downswingAt,
    headOnPath,
    pendulumOf,
    pitchAxis,
    prepareTrack,
    swungBody,
} from "../../../src/engine/impact/track";
import type { ContactState, Downswing, StrokeMode, TrackDrive } from "../../../src/engine/impact/types";
import { add, cross, dot, horizontal, length, scale, sub, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import {
    MAX_LEAD,
    START_GAP,
    TURF_MARGIN,
    buildContact,
    contactPose,
    downswingInput,
    planStroke,
    plannedSpeed,
    poseSpeed,
    swingApproach,
} from "../../../src/engine/swing/buildContact";
import { planDownswing, scanDownswing } from "../../../src/engine/swing/downswing";
import { ON_TIME, defaultProfile } from "../../../src/engine/swing/profile";
import {
    STROKE_TYPES,
    type ShotSetup,
    type StrokeType,
    type SwingProfile,
    type SwingShape,
} from "../../../src/engine/swing/types";
import type { BallState } from "../../../src/engine/types";
import { defaultWorld } from "../../../src/engine/world";
import { contactReference, malletReference, swingReference } from "../../../src/reference/index";
import { TEST_BALL, TEST_TURF, ballAt, testWorld } from "../support/fixtures";
import { TEST_HANDS, mirrorBall, mirrorContact, mirrorQuat, mirrorSpin, mirrorVec, recorder } from "../support/impact";
import { CANONICAL_CLEARANCE, GC_STOP_GAP, backswingFor, canonicalSetup, testProfile } from "../support/shot";

const WORLD = testWorld();
const R = TEST_BALL.radius;
/** The striker's sunk centre height, where the face is placed against it. */
const SUNK_Z = R - (TEST_BALL.mass * WORLD.gravity) / TEST_TURF.turfStiffness;
const BLUE = ballAt(5, 3);
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

    it("turns the lean into the contact angle, a negative lean rising into the ball", () => {
        expect(arcOf(buildContact(shot({}, testProfile({ stance: { lean: 0.2 } })), WORLD)).theta0).toBe(-0.2);
        const profile = testProfile({ stance: { lean: -0.05 } });
        const rising = buildContact(shot({ contact: { up: -0.01, side: 0 } }, profile), WORLD);
        expect(arcOf(rising).theta0).toBe(0.05);
        expect(rising.velocity.z).toBeGreaterThan(0);
    });

    it("pitches the face down by the lean, the head rigid on the shaft", () => {
        // A short head met low on its face: on the 0.23 m head no point of the face keeps a 10° rise clear of the turf.
        for (const degrees of [-10, 0, 10]) {
            const profile = testProfile({ stance: { lean: degrees * DEG }, mallet: { headLength: 0.1 } });
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

    // Each bisection plans dozens of downswings: past vitest's 5 s default on CI's runners.
    it("plans the speed the test support's solver asks for", { timeout: 30_000 }, () => {
        for (const pendulumShare of [1, 0.6]) {
            const setup = shot({}, testProfile({ shape: { pendulumShare } }));
            const backswing = backswingFor(setup, 2.5, WORLD);
            expect(plannedSpeed(shot({ backswing }, setup.profile), WORLD), `share ${pendulumShare}`).toBeCloseTo(
                2.5,
                9,
            );
        }
    });

    it("copies the mode, the reach and the ground depth, the hands and the body, and grips with HAND_COUPLING", () => {
        const profile = testProfile({
            stance: { top: 0.7, bottom: 0.3, gripTension: 0.6, bottomGrip: 0.25 },
            drive: { mode: "carry", handReach: 0.2, groundDepth: 0.004, guideEffort: 0.4 },
            body: { armMass: 0.8, reachSlack: 0.02 },
        });
        const drive = buildContact(shot({}, profile), WORLD).drive as TrackDrive;
        expect([drive.arc.mode, drive.arc.handReach, drive.arc.groundDepth]).toEqual(["carry", 0.2, 0.004]);
        expect(drive.hands).toEqual({
            bottom: 0.3,
            gripTension: 0.6,
            bottomGrip: 0.25,
            armMass: 0.8,
            reachSlack: 0.02,
            guideEffort: 0.4,
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

    it("dips the hands as the profile says, whatever the drive, still meeting the ball on the up", () => {
        for (const drive of [-1, 0, 1]) {
            const profile = testProfile({ stance: { lean: -0.05 }, drive: { handDrop: 0.014, dropTime: 0.02 } });
            const c = buildContact(shot({ drive, contact: { up: -0.01, side: 0 } }, profile), WORLD);
            expect(arcOf(c).dip, `drive ${drive}`).toEqual({ start: 0, duration: 0.02, depth: 0.014 });
            expect(c.velocity.z).toBeGreaterThan(0);
        }
    });

    it("starts the impact at the earliest early action, the head on its downswing, and at contact on time", () => {
        const profile = testProfile({ shape: { pendulumShare: 0.7 } });
        const onTime = buildContact(shot({}, profile), WORLD);
        const early = buildContact(shot({ timing: { arc: -0.01, hands: 0.004, dip: -0.02 } }, profile), WORLD);
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
        const late = buildContact(shot({ timing: { arc: 0.01, hands: 0.01, dip: 0.01 } }, profile), WORLD);
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
            radius: 0.032,
            socket: vec3(0, 0, 0.032),
        });
        expect(c.face).toEqual({
            restitution: malletReference.faceRestitution.value,
            friction: malletReference.faceFriction.value,
            contactTime: contactReference.faceBallContactTime.value,
        });
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
        // least at tan φ* = (L/2)/(r + 2ρ): about 3.64 mm in the turf (P2b.2b.1's coasting figure: the same circle).
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
        const timing = { arc: -0.03, hands: -0.02, dip: -0.04 };
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
});

/**
 * The downswing's least clearance on each canonical setup. The swing presets swing about a still top hand, so theirs
 * is the circle's: P2b.2b.1's coasting approach on prototype aeadd4c's geometry (the level presets' minimum lies
 * 36.25 ms before contact at 3 m/s, the AC stop's 56 ms). The rolls' hands rise behind contact and their pendulum
 * swings the head up, already past the rim's lowest angle, so theirs is at contact: CANONICAL_CLEARANCE.
 */
const CANONICAL_APPROACH: Readonly<Record<StrokeType, number>> = {
    "single-ball": 0.51544e-3,
    drive: 0.51544e-3,
    "stop-ac": 7.2281e-3,
    "stop-gc": 0.51544e-3,
    "half-roll": 21.1109e-3,
    "full-roll": 51.6104e-3,
    "pass-roll": 54.7165e-3,
};

describe("the default profile's canonical setups", () => {
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

    it("rises 4° into the AC stop, the face tilted up as much", () => {
        const world = defaultWorld();
        const c = buildContact(canonicalSetup("stop-ac", { world }), world);
        expect(arcOf(c).theta0).toBeCloseTo(4 * DEG, 15);
        expect(rotate(c.orientation, vec3(1, 0, 0)).z).toBeCloseTo(Math.sin(4 * DEG), 12);
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
});

describe("defaultProfile", () => {
    it("takes the mallet from mallet.json and the body from contact.json", () => {
        expect(defaultProfile.mallet).toEqual({
            headMass: malletReference.headMass.value,
            headLength: malletReference.headLength.value,
            headDiameter: malletReference.headDiameter.value,
            shaftLength: malletReference.shaftLength.value,
        });
        expect(defaultProfile.body).toEqual({
            armMass: contactReference.armMass.value,
            reachSlack: contactReference.reachSlack.value,
        });
    });

    it("swings the single-ball stroke, the drive and the stops, and carries the rolls to their reach", () => {
        const modes = STROKE_TYPES.map((type) => defaultProfile.drive[type].mode);
        expect(modes).toEqual(["swing", "swing", "swing", "swing", "carry", "carry", "carry"]);
        const reaches = STROKE_TYPES.map((type) => defaultProfile.drive[type].handReach);
        expect(reaches).toEqual([0, 0, 0, 0, 0.15, 0.3, 0.3]);
        expect(defaultProfile.drive["stop-ac"].handDrop).toBe(0.011);
        expect(STROKE_TYPES.map((type) => defaultProfile.drive[type].guideEffort)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    });

    it("takes each stroke type's shape from swing.json, the swing presets' pendulum alone", () => {
        for (const type of STROKE_TYPES) {
            const shape = defaultProfile.shape[type];
            const ref = swingReference[type];
            expect(shape.pendulumShare, type).toBe(ref.pendulumShare.value);
            expect(shape.handAngle, type).toBe(ref.handAngle.value);
            expect(shape.defaultIntensity, type).toBe(ref.defaultIntensity.value);
            if (ref.effort !== null) {
                expect(shape.effort, type).toEqual({
                    torqueMax: ref.effort.torqueMax.value,
                    tempoSlow: ref.effort.tempoSlow.value,
                    tempoFast: ref.effort.tempoFast.value,
                });
            }
            const tempo = ref.handTempo;
            if (tempo !== null) {
                expect(shape.handTempo, type).toEqual({ slow: tempo.slow.value, fast: tempo.fast.value });
            }
        }
        expect(STROKE_TYPES.slice(0, 4).map((type) => defaultProfile.shape[type].pendulumShare)).toEqual([1, 1, 1, 1]);
    });
});

describe("buildContact rejections", () => {
    const missing = (record: "stance" | "drive" | "shape"): SwingProfile => {
        const p = testProfile();
        const kept = Object.fromEntries(Object.entries(p[record]).filter(([type]) => type !== "drive"));
        return { ...p, [record]: kept } as unknown as SwingProfile;
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
        ["a lean of 90°", shot({}, testProfile({ stance: { lean: Math.PI / 2 } })), /\.lean must lie within/],
        ["a drive beyond ±1", shot({ drive: 1.5 }), /stroke\.drive must lie in/],
        ["a contact off the face", shot({ contact: { up: 0.03, side: 0.02 } }), /off the face/],
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
        [
            "a negative ground depth",
            shot({}, testProfile({ drive: { groundDepth: -0.001 } })),
            /groundDepth must be non-negative/,
        ],
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
            "a share of 0 in swing mode",
            shot({}, testProfile({ shape: { pendulumShare: 0 } })),
            /pendulumShare must be positive in swing mode/,
        ],
        [
            "a non-positive slow tempo",
            shot({}, testProfile({ shape: { effort: { torqueMax: 0, tempoSlow: 0, tempoFast: 0 } } })),
            /effort\.tempoSlow must be positive/,
        ],
        [
            "a fast tempo slower than the slow",
            shot({}, testProfile({ shape: { effort: { torqueMax: 0, tempoSlow: 0.2, tempoFast: 0.3 } } })),
            /effort\.tempoFast must not exceed .*effort\.tempoSlow/,
        ],
        [
            "a negative peak torque",
            shot({}, testProfile({ shape: { effort: { torqueMax: -1, tempoSlow: 0.4, tempoFast: 0.2 } } })),
            /torqueMax must be non-negative/,
        ],
        [
            "a carry's fast hands' tempo slower than the slow",
            shot({}, testProfile({ drive: { mode: "carry" }, shape: { handTempo: { slow: 0.2, fast: 0.3 } } })),
            /handTempo\.fast must not exceed .*handTempo\.slow/,
        ],
        [
            "a default intensity above 1",
            shot({}, testProfile({ shape: { defaultIntensity: 1.5 } })),
            /defaultIntensity must lie in \[0, 1\]/,
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
});

describe("contactPose (design §5.2 steps 1–5, 10)", () => {
    it("is the on-time contact's pose: the head, its centre and orientation, the aim and the top hand", () => {
        // Met on the up, low on the face: clear of the turf on the way in (the dip test's stance).
        const setup = shot({ contact: { up: -0.01, side: 0.002 } }, testProfile({ stance: { lean: -0.05 } }));
        const pose = contactPose(setup, WORLD);
        const c = buildContact(setup, WORLD);
        expect(pose.head).toEqual(c.head);
        // headOnPath rebuilds the centre from the path, which differs from the placed one by rounding (~6e-17 m).
        expect(dist(pose.headCentre, c.position)).toBeLessThan(1e-12);
        expect(pose.orientation).toEqual(c.orientation);
        expect(pose.thetaContact).toBe(0.05);
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
            effort: { torqueMax: 0, tempoSlow: 0.4, tempoFast: 0.2 },
            handTempo: { slow: 0.4, fast: 0.2 },
            defaultIntensity: 0,
        };
        const input = downswingInput(pose, hands, { mode: "swing", shape, backswing: 0.3, intensity: 0 }, 9.8);
        expect(input.lever).toBe(RHO + TOP);
        expect(input.pendulum).toEqual(pendulumOf(pose.head, swungBody(pose.head, hands, TOP), TOP, 9.8));
        const planned = planDownswing(input);
        // The hands still: the head swings at ω₀·ℓ_h.
        expect(poseSpeed(pose, planned)).toBeCloseTo(planned.omega * (RHO + TOP), 12);
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
        // 3.03 against 3.12 m/s.
        expect(fat.speed).toBeGreaterThan(0.9 * clean.speed);
        // The firm grip has no position spring on a downswing, so the head stays where the turf put it: about 0.48 mm
        // in, under the 2 mm limit.
        expect(fat.impact.events.map((e) => e.kind)).not.toContain("impact-head-deep");
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
