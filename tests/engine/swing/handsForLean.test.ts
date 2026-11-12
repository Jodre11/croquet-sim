import { describe, expect, it } from "vitest";
import {
    FINGER_REACH,
    HANDLE_CAP,
    HAND_BREADTH,
    RING_HEIGHT,
    blend,
    handsForLean,
} from "../../../src/engine/swing/hands";
import { defaultProfile } from "../../../src/engine/swing/profile";

const DEG = Math.PI / 180;
const MALLET = defaultProfile.mallet;
const HANDLE = 0.805;
const HALF = 0.4572;
const GAP = HANDLE - HALF;
const FINGER = RING_HEIGHT + FINGER_REACH + HAND_BREADTH / 2;

describe("handsForLean (hands-from-lean design §2)", () => {
    it("sizes the reference mallet's handle and the full roll's bottom hand", () => {
        expect(MALLET.shaftLength).toBeCloseTo(0.9144, 12);
        expect(MALLET.shaftLength - HANDLE_CAP).toBeCloseTo(HANDLE, 12);
        expect(FINGER).toBeCloseTo(0.144, 3);
    });

    it.each([-0.1, 0])("holds the drive's hands at lean %s", (lean) => {
        const hands = handsForLean(lean, MALLET, false);
        expect(hands.top).toBeCloseTo(HANDLE, 12);
        expect(hands.bottom).toBeCloseTo(HANDLE - HAND_BREADTH, 12);
    });

    it("places the half roll's bottom hand half way down the shaft at 24°", () => {
        const hands = handsForLean(24 * DEG, MALLET, false);
        expect(hands.top).toBeCloseTo(HANDLE, 12);
        expect(hands.bottom).toBeCloseTo(HALF, 12);
    });

    it.each([31, 40])("holds the full roll's hands at %s°", (degrees) => {
        const hands = handsForLean(degrees * DEG, MALLET, false);
        expect(hands.bottom).toBeCloseTo(FINGER, 12);
        expect(hands.top).toBeCloseTo(FINGER + GAP, 12);
    });

    it("moves only the bottom hand between the drive and the half roll", () => {
        const hands = handsForLean(12 * DEG, MALLET, false);
        const drive = HANDLE - HAND_BREADTH;
        expect(hands.top).toBeCloseTo(HANDLE, 12);
        expect(hands.bottom).toBeCloseTo(drive + blend(0.5) * (HALF - drive), 12);
    });

    it("moves the hands in lock-step between the half roll and the full roll", () => {
        const hands = handsForLean(27.5 * DEG, MALLET, false);
        expect(hands.bottom).toBeCloseTo(HALF + blend(0.5) * (FINGER - HALF), 12);
        expect(hands.top - hands.bottom).toBeCloseTo(GAP, 12);
    });

    it("lowers both hands by a finger's reach with the fist", () => {
        const hands = handsForLean(31 * DEG, MALLET, true);
        expect(hands.bottom).toBeCloseTo(0.069, 3);
        expect(hands.bottom).toBeCloseTo(FINGER - FINGER_REACH, 12);
        expect(hands.top).toBeCloseTo(FINGER - FINGER_REACH + GAP, 12);
    });

    it("measures the handle from a shorter shaft's top", () => {
        const hands = handsForLean(0, { shaftLength: 0.762 }, false);
        expect(hands.top).toBeCloseTo(0.762 - HANDLE_CAP, 12);
    });

    it.each([0, 24, 31])("is continuous at %s°", (degrees) => {
        const at = (lean: number) => handsForLean(lean, MALLET, false);
        const [below, above] = [at(degrees * DEG - 1e-12), at(degrees * DEG + 1e-12)];
        expect(Math.abs(below.top - above.top)).toBeLessThan(1e-9);
        expect(Math.abs(below.bottom - above.bottom)).toBeLessThan(1e-9);
    });

    it("blends linearly from 0 to 1", () => {
        expect([blend(0), blend(0.5), blend(1)]).toEqual([0, 0.5, 1]);
    });
});
