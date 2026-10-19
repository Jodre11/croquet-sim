import { describe, expect, it } from "vitest";
import { assertFinite } from "../../../src/engine/impact/integrate";
import { simulateImpact, simulateStroke } from "../../../src/engine/impact/simulateImpact";
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
 * grip's blow-up: the head's position and orientation go NaN at about t = 0.00025 s in the integrator, while the
 * returned result stays finite.
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
    it("throws a RangeError naming the step on the stiff-grip fat stroke", () => {
        const fat = stiffFat();
        expect(() => simulateImpact(fat, { blue: BLUE }, WORLD)).toThrow(RangeError);
        expect(() => simulateImpact(fat, { blue: BLUE }, WORLD)).toThrow(
            /went non-finite .* s from contact, at step \d+ \(impact\)/,
        );
    });
    it("names a NaN velocity's step and phase, and passes a finite state", () => {
        expect(() => assertFinite(nanHead, [], [], 0.001, 3, "impact")).toThrow(/head state .* at step 3 \(impact\)/);
        expect(() => assertFinite(nanHead, [], [], 0.2, 40000, "follow-through")).toThrow(/\(follow-through\)/);
        expect(() => assertFinite(finiteHead, [finiteBall], ["blue"], 0.001, 3, "impact")).not.toThrow();
    });
    it("catches a head gone non-finite in the follow-through at the next step", () => {
        // A hand-built arc bypasses planStroke's check of the advance. The hands' 1e300 m/s² from 0.05 s after contact,
        // after the impact's end, overflows the free pendulum's table there, so the head goes non-finite in the
        // follow-through. (A NaN speed would not: it leaves the hands' velocity and acceleration finite, and after
        // contact swing mode's hands read only those.)
        const world = defaultWorld();
        const setup = canonicalSetup("single-ball", { world, stroke: { handReach: 0.3 } });
        const contact = buildContact(setup, world);
        const drive = contact.drive as TrackDrive;
        const advance = { start: drive.arc.contactAt + 0.05, speed: 1e300, accel: 1e300 };
        const broken = { ...contact, drive: { ...drive, arc: { ...drive.arc, advance } } };
        expect(() => simulateStroke(broken, setup.balls, world)).toThrow(RangeError);
        expect(() => simulateStroke(broken, setup.balls, world)).toThrow(/at step \d+ \(follow-through\)/);
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
