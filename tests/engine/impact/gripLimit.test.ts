import { describe, expect, it } from "vitest";
import { IMPACT_DT } from "../../../src/engine/impact/integrate";
import {
    handLoad,
    headOnPath,
    newGripState,
    prepareTrack,
    type GripState,
    type HandLoad,
    type PreparedTrack,
} from "../../../src/engine/impact/track";
import { rotate } from "../../../src/engine/impact/rigidBody";
import type { Coupling, FlexHold, HandName, HeadState } from "../../../src/engine/impact/types";
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
            const load = handLoad(track, head, TEST_HEAD, t, grip, 1e-3);
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
            const load = handLoad(track, head, TEST_HEAD, t, grip, 1e-3);
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
            handLoad(track, held, TEST_HEAD, n * 1e-3, grip, 1e-3);
        }
        const offset = grip.topOffset as Vec3;
        // Move the head on to halve the spring's stretch: the force falls to F_max/2 and the anchor stays put.
        const stretch = sub(topGap(track, held, 0.02), topOffset(grip, held));
        const moved: HeadState = { ...held, position: add(held.position, scale(stretch, 0.5)) };
        const load = handLoad(track, moved, TEST_HEAD, 0.02, grip, 1e-3);
        expect(load.saturated).toBeNull();
        expect(Math.abs(length(load.top) - limit / 2) / limit).toBeLessThan(1e-9);
        expect(grip.topOffset).toEqual(offset);
    });

    it("names the top hand when both saturate in one step", () => {
        const track = running(5);
        const head = headOnPath(track, TEST_HEAD, 0);
        const grip = newGripState();
        const load = handLoad(track, head, TEST_HEAD, 0.01, grip, IMPACT_DT);
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
            expect(handLoad(low, head, TEST_HEAD, t, a, 1e-3)).toEqual(handLoad(high, head, TEST_HEAD, t, b, 1e-3));
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
        const first = handLoad(track, head, TEST_HEAD, 0, grip, IMPACT_DT);
        expect(first.saturated).not.toBeNull();
        expect(Math.abs(length(first.top) - 2) / 2).toBeLessThan(1e-9);
        expect(grip.topOffset).not.toBeNull();
        const again = handLoad(track, head, TEST_HEAD, 0, grip, IMPACT_DT);
        expect(Math.abs(length(again.top) - 2) / 2).toBeLessThan(1e-6);
    });
});

describe("the arms' checking force (P2b.2b.2c.2 design §4, §8.1)", () => {
    /** The default body's posture-holding impedance (reference/contact.json): τ_arm = c_hold/k_hold, 27.8 ms. */
    const HOLD: FlexHold = { stiffness: 744, damping: 20.7 };
    const TAU = 20.7 / 744;
    const LIMIT = 50;

    /** `running(LIMIT)` with the arms' hold set to `hold`, in `mode`. */
    function withHold(hold: FlexHold | null, mode: "swing" | "carry" = "swing"): PreparedTrack {
        const carry = mode === "carry" ? { mode, handReach: 0.1, pendulumAt: 1 } : {};
        const arc = levelArc(vec3(0, 0, 1), { pivotVelocity: vec3(1, 0, 0), ...carry });
        const hands = { ...TEST_HANDS, gripLimit: LIMIT, flex: { ...TEST_HANDS.flex, hold } };
        return prepareTrack(trackDrive(arc, FIRM, hands), TEST_HEAD, 0);
    }

    const K = withHold(null).firm.stiffness;

    /** A saturating step's top hand: its offset after the step and its force. */
    interface SlidStep {
        readonly offset: Vec3 | null;
        readonly top: Vec3;
    }

    const offsetOf = (grip: GripState, hand: HandName): Vec3 | null =>
        hand === "top" ? grip.topOffset : grip.bottomOffset;

    /** The head held still at the path's start for 21 steps of 1 ms while the path runs away: both hands slide. */
    function slide(track: PreparedTrack): { grip: GripState; held: HeadState } {
        const held = headOnPath(track, TEST_HEAD, 0);
        const grip = newGripState();
        for (let n = 0; n <= 20; n++) {
            handLoad(track, held, TEST_HEAD, n * 1e-3, grip, 1e-3);
        }
        expect(grip.topOffset).not.toBeNull();
        expect(grip.bottomOffset).not.toBeNull();
        return { grip, held };
    }

    /** The top spring's stretch (world frame) with the head at `head` at time t. */
    const stretchOf = (track: PreparedTrack, grip: GripState, head: HeadState, t: number): Vec3 =>
        sub(topGap(track, head, t), topOffset(grip, head));

    /** The held head moved on to halve the top spring's stretch at 20 ms: the force falls to F_max/2. */
    function halved(track: PreparedTrack, grip: GripState, held: HeadState): HeadState {
        return { ...held, position: add(held.position, scale(stretchOf(track, grip, held, 0.02), 0.5)) };
    }

    /** Each step's load, the head held still while the path runs away, up to and including the first saturation. */
    function loadsUntilSaturation(track: PreparedTrack): HandLoad[] {
        const head = headOnPath(track, TEST_HEAD, 0);
        const grip = newGripState();
        const loads: HandLoad[] = [];
        for (let n = 0; n <= 50; n++) {
            const load = handLoad(track, head, TEST_HEAD, n * 1e-3, grip, 1e-3);
            loads.push(load);
            if (load.saturated !== null) {
                return loads;
            }
        }
        throw new Error("no hand saturated");
    }

    /** Both tracks' top hand at the second saturating step, its offset already set: the offset after it, and F. */
    function saturatingStep(a: PreparedTrack, b: PreparedTrack): [SlidStep, SlidStep] {
        return [secondSaturation(a), secondSaturation(b)];
    }

    /** One track's top hand at its second saturating step, as saturatingStep reads it. */
    function secondSaturation(track: PreparedTrack): SlidStep {
        const head = headOnPath(track, TEST_HEAD, 0);
        const grip = newGripState();
        let count = 0;
        for (let n = 0; n <= 50; n++) {
            const load = handLoad(track, head, TEST_HEAD, n * 1e-3, grip, 1e-3);
            if (load.saturated !== null) {
                count++;
                if (count === 2) {
                    return { offset: grip.topOffset, top: load.top };
                }
            }
        }
        throw new Error("no hand saturated twice");
    }

    /**
     * One step of `dt` under the limit after both hands have slid: `hand`'s offset before and after it, the step's
     * load, and the load the same step gives with no hold (the offset as it stood).
     */
    function underLimitStep(track: PreparedTrack, dt: number, hand: HandName = "top") {
        const { grip, held } = slide(track);
        const moved = halved(track, grip, held);
        const before = offsetOf(grip, hand) as Vec3;
        const plain = structuredClone(grip);
        const load = handLoad(track, moved, TEST_HEAD, 0.02, grip, dt);
        expect(load.saturated).toBeNull();
        const loadWithoutDecay = handLoad(withHold(null), moved, TEST_HEAD, 0.02, plain, dt);
        return { before, after: offsetOf(grip, hand) as Vec3, load, loadWithoutDecay };
    }

    /**
     * Carry mode before relaxAt, its hands `track`'s, run as `slide`: the top hand's offset once it has slid. It is the
     * branch the swing-mode decay acts in, so it is where carry mode must keep its offset.
     */
    function carryOffsetBeforeEasing(track: PreparedTrack): Vec3 | null {
        return slide(withHold(track.hands.flex.hold, "carry")).grip.topOffset;
    }

    /** The same carry, then a step of 1 ms under the limit: the top hand's offset after it. */
    function carryOffsetAfterEasing(track: PreparedTrack): Vec3 | null {
        const carry = withHold(track.hands.flex.hold, "carry");
        const { grip, held } = slide(carry);
        expect(handLoad(carry, halved(carry, grip, held), TEST_HEAD, 0.02, grip, 1e-3).saturated).toBeNull();
        return grip.topOffset;
    }

    /**
     * Slide for 21 ms, relax for 20 steps of 1 ms with the head kept at half the stretch from the recovering anchor,
     * then hold the head still while the path runs on: each step at which the top hand saturates again, its force and
     * its spring's stored energy.
     */
    function resaturation(track: PreparedTrack): { top: Vec3; energy: number }[] {
        const { grip, held } = slide(track);
        const half = scale(stretchOf(track, grip, held, 0.02), 0.5);
        const slid = length(grip.topOffset as Vec3);
        let head = held;
        for (let n = 21; n <= 40; n++) {
            const t = n * 1e-3;
            const target = headOnPath(track, TEST_HEAD, t).position;
            head = { ...held, position: sub(target, add(topOffset(grip, held), half)) };
            expect(handLoad(track, head, TEST_HEAD, t, grip, 1e-3).saturated, `t ${t}`).toBeNull();
        }
        // The anchor has recovered part of its slide before the load returns.
        expect(length(grip.topOffset as Vec3)).toBeLessThan(slid);
        const steps: { top: Vec3; energy: number }[] = [];
        for (let n = 41; n <= 70; n++) {
            const t = n * 1e-3;
            const load = handLoad(track, head, TEST_HEAD, t, grip, 1e-3);
            if (load.saturated !== null) {
                const stretch = stretchOf(track, grip, head, t);
                steps.push({ top: load.top, energy: 0.5 * K * dot(stretch, stretch) });
            }
        }
        expect(steps.length).toBeGreaterThan(0);
        return steps;
    }

    it("leaves a hand's forces as they were until its offset is first set", () => {
        // §8.1.1: with and without a hold, every step's load is equal until the first saturation.
        expect(loadsUntilSaturation(withHold(HOLD))).toEqual(loadsUntilSaturation(withHold(null)));
    });
    it("slides at the limit exactly as before, transmitting F_max", () => {
        // §8.1.2: at a saturating step the offset and force equal the hold-less run's.
        const [a, b] = saturatingStep(withHold(HOLD), withHold(null));
        expect(a.offset).toEqual(b.offset);
        expect(Math.abs(length(a.top) - LIMIT) / LIMIT).toBeLessThan(1e-9);
    });
    it("relaxes the offset by exp(−dt/τ_arm) under the limit, after the step's force", () => {
        // §8.1.3 and constraint 3: test first, decay after.
        for (const dt of [1e-5, 1e-3, 5e-3]) {
            const { before, after, load, loadWithoutDecay } = underLimitStep(withHold(HOLD), dt);
            expect(load).toEqual(loadWithoutDecay);
            for (const k of ["x", "y", "z"] as const) {
                expect(after[k]).toBeCloseTo(before[k] * Math.exp(-dt / TAU), 12);
            }
        }
    });
    it("relaxes a sliding bottom hand's offset too", () => {
        // §8.1.5.
        const { before, after } = underLimitStep(withHold(HOLD), 1e-3, "bottom");
        expect(length(after)).toBeCloseTo(length(before) * Math.exp(-1e-3 / TAU), 12);
    });
    it("keeps a carry hand's slid offset: carry mode's chain already holds the arm", () => {
        // §8.1.5, constraint 4: the existing carry case, then an under-limit step, its offset unchanged.
        expect(carryOffsetAfterEasing(withHold(HOLD))).toEqual(carryOffsetBeforeEasing(withHold(HOLD)));
    });
    it("keeps the offset finite at a long step, and as it was without a hold", () => {
        // A step far longer than τ_arm must shrink the offset by exp(−dt/τ), never overshoot to null or NaN.
        const long = underLimitStep(withHold(HOLD), 10 * TAU);
        expect(length(long.after)).toBeCloseTo(length(long.before) * Math.exp(-10), 12);
        expect(Number.isFinite(long.after.x)).toBe(true);
        const none = underLimitStep(withHold(null), 1e-3);
        expect(none.after).toEqual(none.before);
    });
    it("slides on from the recovered offset when the load returns past F_max", () => {
        // A recovered anchor slides on from where it stands, transmitting no more than F_max: saturate, relax 20
        // steps, saturate again; F_max to 1e-9, stretch energy ≤ F_max²/(2k).
        for (const step of resaturation(withHold(HOLD))) {
            expect(Math.abs(length(step.top) - LIMIT) / LIMIT).toBeLessThan(1e-9);
            expect(step.energy).toBeLessThanOrEqual(((LIMIT * LIMIT) / (2 * K)) * (1 + 1e-9));
        }
    });
});
