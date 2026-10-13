import { describe, expect, it } from "vitest";
import { faceHalfHeight } from "../../../src/engine/impact/shape";
import { headShapeOf } from "../../../src/engine/swing/buildContact";

describe("the head's shape (P2b.2b.2b.2c design §3.1)", () => {
    it("gives a cylinder's face half-height as its radius", () => {
        expect(faceHalfHeight({ kind: "cylinder", radius: 0.0381 })).toBe(0.0381);
    });

    it("maps a round profile head to a cylinder of half its diameter, bit for bit", () => {
        expect(headShapeOf({ kind: "round", diameter: 0.0762 })).toEqual({ kind: "cylinder", radius: 0.0762 / 2 });
    });
});
