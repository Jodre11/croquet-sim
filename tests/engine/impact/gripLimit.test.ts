import { describe, expect, it } from "vitest";
import {
    handLoad,
    headOnPath,
    newGripState,
    prepareTrack,
    type GripState,
    type PreparedTrack,
} from "../../../src/engine/impact/track";
import { rotate } from "../../../src/engine/impact/rigidBody";
import type { Coupling, HeadState } from "../../../src/engine/impact/types";
import { add, dot, length, scale, sub, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import { TEST_HANDS, TEST_HEAD, levelArc, trackDrive } from "../support/impact";

/** A firm grip held to its path before relaxAt, with no damping, so that each hand's force is its spring's alone. */
const FIRM: Coupling = { period: 0.04, dampingRatio: 0, relaxAt: 10 };

/** A level path whose pivot runs along aim at 1 m/s, gravity off: the hands' feed-forward is then zero. */
function running(limit: number, coupling: Coupling = FIRM): PreparedTrack {
    const arc = levelArc(vec3(0, 0, 1), { pivotVelocity: vec3(1, 0, 0) });
    return prepareTrack(trackDrive(arc, coupling, { ...TEST_HANDS, gripLimit: limit }), TEST_HEAD, 0);
}

/** The top grip's gap to its target on the path at time t, the head held at `head`. */
function topGap(track: PreparedTrack, head: HeadState, t: number): Vec3 {
    const target = headOnPath(track, TEST_HEAD, t);
    return sub(target.position, head.position);
}

/** The top hand's slid offset in the world frame, the head at `head` (it is held in the head's frame). */
function topOffset(grip: GripState, head: HeadState): Vec3 {
    return rotate(head.orientation, grip.topOffset as Vec3);
}

describe("the hands' limit (P2b.2b.2b.3 design §5)", () => {
    it("holds a firm hand to F_max against a fixed head, its anchor sliding so that no spring energy builds", () => {
        // Case 5. The path runs away from a head held still: the top hand's spring would stretch by 1 mm a
        // millisecond. Past F_max = 50 N the hand transmits 50 N and its anchor slides, so its spring's extension
        // |gap − offset| stays at F_max/k and stores F_max²/(2k), however far the path runs.
        const limit = 50;
        const track = running(limit);
        const head = headOnPath(track, TEST_HEAD, 0);
        const grip = newGripState();
        const k = track.firm.stiffness;
        let saturatedAt = -1;
        for (let n = 0; n <= 50; n++) {
            const t = n * 1e-3;
            const load = handLoad(track, head, TEST_HEAD, t, grip);
            if (load.saturated !== null && saturatedAt < 0) {
                saturatedAt = t;
            }
            if (saturatedAt >= 0) {
                expect(Math.abs(length(load.top) - limit) / limit, `t ${t}`).toBeLessThan(1e-12);
                const stretch = sub(topGap(track, head, t), topOffset(grip, head));
                expect(0.5 * k * dot(stretch, stretch), `t ${t}`).toBeLessThanOrEqual(
                    ((limit * limit) / (2 * k)) * (1 + 1e-9),
                );
            }
        }
        expect(saturatedAt).toBeGreaterThan(0);
        expect(length(topGap(track, head, 0.05))).toBeGreaterThan(0.04);
    });

    it("stores no stretch that only cancels the damper while a damped hand slides (plan decision 24)", () => {
        // Case 5 with the grip's damping on: the path runs away at 1 m/s, so the damper alone pulls c·1 m/s, far past
        // F_max = 50 N. The hand transmits 50 N; its spring is reset as tangentialForce resets its own, to carry F_max
        // less the share (zero here), so k·|gap − offset| stays at F_max. Resetting it against the total instead
        // would leave a stretch of (F_max − c·1 m/s)/k, over 100 N's worth pointing back against the path.
        const limit = 50;
        const track = running(limit, { period: 0.04, dampingRatio: 0.7, relaxAt: 10 });
        expect(track.firm.damping).toBeGreaterThan(2 * limit);
        const head = headOnPath(track, TEST_HEAD, 0);
        const grip = newGripState();
        const k = track.firm.stiffness;
        let slid = 0;
        for (let n = 0; n <= 50; n++) {
            const t = n * 1e-3;
            const load = handLoad(track, head, TEST_HEAD, t, grip);
            if (load.saturated === null) {
                continue;
            }
            slid++;
            expect(Math.abs(length(load.top) - limit) / limit, `t ${t}`).toBeLessThan(1e-12);
            const spring = scale(sub(topGap(track, head, t), topOffset(grip, head)), k);
            expect(length(spring), `t ${t}`).toBeLessThanOrEqual(limit * (1 + 1e-9));
        }
        expect(slid).toBeGreaterThan(40);
    });

    it("returns under the limit with its offset kept once the load falls", () => {
        const limit = 50;
        const track = running(limit);
        const held = headOnPath(track, TEST_HEAD, 0);
        const grip = newGripState();
        for (let n = 0; n <= 20; n++) {
            handLoad(track, held, TEST_HEAD, n * 1e-3, grip);
        }
        const offset = grip.topOffset as Vec3;
        // Move the head on to halve the spring's stretch: the force falls to F_max/2 and the anchor stays put.
        const stretch = sub(topGap(track, held, 0.02), topOffset(grip, held));
        const moved: HeadState = { ...held, position: add(held.position, scale(stretch, 0.5)) };
        const load = handLoad(track, moved, TEST_HEAD, 0.02, grip);
        expect(load.saturated).toBeNull();
        expect(Math.abs(length(load.top) - limit / 2) / limit).toBeLessThan(1e-9);
        expect(grip.topOffset).toEqual(offset);
    });

    it("names the top hand when both saturate in one step", () => {
        const track = running(5);
        const head = headOnPath(track, TEST_HEAD, 0);
        const grip = newGripState();
        const load = handLoad(track, head, TEST_HEAD, 0.01, grip);
        expect(length(load.top)).toBeCloseTo(5, 9);
        expect(length(load.bottom)).toBeCloseTo(5, 9);
        expect(load.saturated).toBe("top");
    });

    it("leaves a hand below the limit exactly as it was, with no offset", () => {
        const low = running(1e5);
        const high = running(1e9);
        const head = headOnPath(low, TEST_HEAD, 0);
        const a = newGripState();
        const b = newGripState();
        for (let n = 0; n <= 10; n++) {
            const t = n * 1e-3;
            expect(handLoad(low, head, TEST_HEAD, t, a)).toEqual(handLoad(high, head, TEST_HEAD, t, b));
        }
        expect(a.topOffset).toBeNull();
        expect(a.bottomOffset).toBeNull();
    });

    it("transmits only F_max through a carry hand's chain, and the chain feels it", () => {
        // A still carry under gravity: each hand's chain carries its share of the head's weight and its own skin,
        // about 5 N for the top hand, against a 2 N limit. The hand transmits 2 N; its hold slides until the palm
        // and fingers carry exactly that, so recomputing the chain at the slid anchor gives the same force.
        const arc = levelArc(vec3(0, 0, 1), { mode: "carry", handReach: 0.1, pendulumAt: 1 });
        const hands = { ...TEST_HANDS, gripLimit: 2 };
        const coupling: Coupling = { period: 0.04, dampingRatio: 0.7, relaxAt: 0 };
        const track = prepareTrack(trackDrive(arc, coupling, hands), TEST_HEAD, STANDARD_GRAVITY);
        const head = headOnPath(track, TEST_HEAD, 0);
        const grip = newGripState();
        const first = handLoad(track, head, TEST_HEAD, 0, grip);
        expect(first.saturated).not.toBeNull();
        expect(Math.abs(length(first.top) - 2) / 2).toBeLessThan(1e-9);
        expect(grip.topOffset).not.toBeNull();
        const again = handLoad(track, head, TEST_HEAD, 0, grip);
        expect(Math.abs(length(again.top) - 2) / 2).toBeLessThan(1e-6);
    });
});
