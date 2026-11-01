import { describe, expect, it } from "vitest";
import { assertFinite } from "../../../src/engine/impact/integrate";
import { simulateImpact, simulateStroke, validateImpact } from "../../../src/engine/impact/simulateImpact";
import type { HeadState, TrackDrive } from "../../../src/engine/impact/types";
import { vec3 } from "../../../src/engine/math/vec3";
import { simulateShot } from "../../../src/engine/shot";
import { buildContact } from "../../../src/engine/swing/buildContact";
import { ON_TIME } from "../../../src/engine/swing/profile";
import type { BallState } from "../../../src/engine/types";
import { defaultWorld } from "../../../src/engine/world";
import { ballAt, testWorld } from "../support/fixtures";
import { canonicalSetup, testProfile } from "../support/shot";

const WORLD = testWorld();
const BLUE = ballAt(5, 3);

const finiteHead: HeadState = {
    position: vec3(0, 0, 0.1),
    orientation: { w: 1, x: 0, y: 0, z: 0 },
    velocity: vec3(1, 0, 0),
    angularVelocity: vec3(0, 0, 0),
};
const nanHead: HeadState = { ...finiteHead, velocity: vec3(Number.NaN, 0, 0) };
const finiteBall: BallState = { position: vec3(1, 1, 0.0635), velocity: vec3(0, 0, 0), angularVelocity: vec3(0, 0, 0) };

/**
 * The roadmap's carried defect: buildContact.test.ts's fat stroke with the drive's coupling period at 0.01 s.
 * P2b.2b.2b.3's grip limit (testProfile's 100000 N) bounds it, so the setup lifts the limit to 1e9 to expose the stiff
 * grip's blow-up: the head's position and orientation went NaN at about t = 0.00025 s in the integrator, while the
 * returned result stayed finite.
 */
function stiffFat() {
    const contact = buildContact(
        {
            balls: { blue: BLUE },
            striker: "blue",
            stroke: {
                type: "single-ball",
                aim: 0.4,
                backswing: 0.5,
                drive: 0,
                contact: { up: 0.01, side: 0 },
                timing: ON_TIME,
            },
            live: [],
            continuation: false,
            hampered: false,
            jumpAttempt: false,
            lawnSpeed: 10,
            profile: testProfile(),
        },
        WORLD,
    );
    const drive = contact.drive as TrackDrive;
    return {
        ...contact,
        drive: {
            ...drive,
            coupling: { ...drive.coupling, period: 0.01 },
            hands: { ...drive.hands, gripLimit: 1e9 },
        },
    };
}

describe("the finite-state guard (design §3)", () => {
    it("plays the stiff-grip fat stroke finite", () => {
        // P2b.2b.2c.3a: the swung body on every stroke (was a RangeError, the head non-finite at step 50, 65.8 ms
        // before contact). The blow-up was the firm grip's, before contact, on the swing law's swung body with the arm
        // mass rigid at the top grip; the law before contact is unchanged, and on the hands' skin (carryBody) the same
        // 0.01 s coupling stays finite through the impact (turf-yield, impact-head-deep, turf-lift).
        expect(() => simulateImpact(stiffFat(), { blue: BLUE }, WORLD)).not.toThrow();
    });
    it("throws a RangeError naming the step on a head gone non-finite in the impact", () => {
        // In place of the fat stroke above: a broken advance overflows the hands' path inside the impact. P2b.2b.2c.3a:
        // the advance on the push (was from the planned contact, which the push's cap at handReach now tames: traced,
        // its travel passes 0.3 m 4.1e-25 s after its start, before the first step, so the path stops there before
        // its 1e300 m/s² is read). From 0.05 s after contact its start falls on a step (traced: the push ends one float
        // later), where the path reads that acceleration; the push's pendulum phase starts there too, and the impact
        // waits for the pendulum phase, so the overflow falls inside it.
        const world = defaultWorld();
        const setup = canonicalSetup("single-ball", { world, stroke: { handReach: 0.3 } });
        const contact = buildContact(setup, world);
        const drive = contact.drive as TrackDrive;
        const advance = { start: drive.arc.contactAt + 0.05, speed: 1e300, accel: 1e300 };
        const broken = { ...contact, drive: { ...drive, arc: { ...drive.arc, advance } } };
        // Shapes design §2: the broken advance ends the push at 1e300 m/s, and the hands' finish now refuses that pace
        // when the track is prepared, before any step; the guard's own naming is pinned on assertFinite below.
        expect(() => simulateImpact(broken, setup.balls, world)).toThrow(RangeError);
        expect(() => simulateImpact(broken, setup.balls, world)).toThrow(/past the top of the hands' arc/);
    });
    it("names a NaN velocity's step and phase, and passes a finite state", () => {
        expect(() => assertFinite(nanHead, [], [], 0.001, 3, "impact")).toThrow(/head state .* at step 3 \(impact\)/);
        expect(() => assertFinite(nanHead, [], [], 0.2, 40000, "follow-through")).toThrow(/\(follow-through\)/);
        expect(() => assertFinite(finiteHead, [finiteBall], ["blue"], 0.001, 3, "impact")).not.toThrow();
    });
    it("catches a head gone non-finite in the follow-through at the next step", () => {
        // A hand-built advance bypasses planStroke's check of it: the canonical half roll's arc, valid (its low point
        // within 2·handReach − ρ_h of the arc, P2b.2b.2c.3b.1 design §5), with a backward advance of −1e300 m/s from
        // 0.2 s after contact. Its travel keeps the hands short of the push length within REACH_SEARCH, so the push
        // finds no end and no pendulum phase: the impact ends on its own and the follow-through runs on, reading the
        // advance's travel unclamped, until the overflow puts the hands off the arc and the head goes non-finite.
        // (Was the arc narrowed to 0.2 m with its low point 0.06 m ahead, the finish carrying the hands past the
        // circle's reach; the validator now rejects that arc. Before that, an advance of 1e300 m/s² from a pendulum
        // phase at contact, which a carry ending at its hands' rest outran.)
        const world = defaultWorld();
        const setup = canonicalSetup("half-roll", { world });
        const contact = buildContact(setup, world);
        const drive = contact.drive as TrackDrive;
        const advance = { start: drive.arc.contactAt + 0.2, speed: -1e300, accel: -1e300 };
        const broken = { ...contact, drive: { ...drive, arc: { ...drive.arc, advance } } };
        expect(() => validateImpact(broken, setup.balls, world)).not.toThrow();
        expect(() => simulateStroke(broken, setup.balls, world)).toThrow(RangeError);
        expect(() => simulateStroke(broken, setup.balls, world)).toThrow(/at step \d+ \(follow-through\)/);
    });
    it("rejects the narrowed arc whose finish would leave it (P2b.2b.2c.3b.1 design §5)", () => {
        // The arc this file's follow-through case was once built on: the canonical half roll's (handReach 0.15 m)
        // narrowed to 0.2 m with its low point 0.06 m ahead. Its push's end lies on the arc (0.15 − 0.06 < 0.2), but
        // its finish's rest does not (0.3 − 0.06 > 0.2), so the validator refuses it before any step. Shapes design §8:
        // the shot's own reach keeps 0.15 m, now the half roll's preset pushes only 0.05 m.
        const world = defaultWorld();
        const setup = canonicalSetup("half-roll", { world, stroke: { handReach: 0.15 } });
        const contact = buildContact(setup, world);
        const drive = contact.drive as TrackDrive;
        const arc = { ...drive.arc, handArcRadius: 0.2, lowPoint: 0.06 };
        expect(arc.handReach).toBe(0.15);
        const narrowed = { ...contact, drive: { ...drive, arc } };
        expect(() => validateImpact(narrowed, setup.balls, world)).toThrow(RangeError);
        expect(() => validateImpact(narrowed, setup.balls, world)).toThrow(
            /arc\.lowPoint must lie in \(2·handReach − handArcRadius, handArcRadius\)/,
        );
    });
    it("names the ball whose state went non-finite", () => {
        const spun = { ...finiteBall, angularVelocity: vec3(0, Number.NaN, 0) };
        expect(() => assertFinite(finiteHead, [finiteBall, spun], ["blue", "red"], 0, 1, "impact")).toThrow(
            /ball red state/,
        );
    });
    it("does not throw on a finite stroke", () => {
        // The canonical single-ball stroke at 3 m/s; that its run is unchanged is the ratchet's to prove.
        const world = defaultWorld();
        expect(() => simulateShot(canonicalSetup("single-ball", { world }), world, { trajectory: true })).not.toThrow();
    });
});
