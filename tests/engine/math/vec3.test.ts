import { describe, expect, it } from "vitest";
import { ZERO, add, cross, dot, horizontal, length, normalize, scale, sub, vec3 } from "../../../src/engine/math/vec3";

describe("vec3", () => {
    it("adds, subtracts and scales component-wise", () => {
        expect(add(vec3(1, 2, 3), vec3(4, 5, 6))).toEqual(vec3(5, 7, 9));
        expect(sub(vec3(4, 5, 6), vec3(1, 2, 3))).toEqual(vec3(3, 3, 3));
        expect(scale(vec3(1, -2, 3), 2)).toEqual(vec3(2, -4, 6));
    });

    it("computes dot and right-handed cross products", () => {
        expect(dot(vec3(1, 2, 3), vec3(4, 5, 6))).toBe(32);
        expect(cross(vec3(1, 0, 0), vec3(0, 1, 0))).toEqual(vec3(0, 0, 1));
        expect(cross(vec3(0, 1, 0), vec3(0, 0, 1))).toEqual(vec3(1, 0, 0));
    });

    it("normalises, returning ZERO for the zero vector", () => {
        expect(normalize(vec3(3, 4, 0))).toEqual(vec3(0.6, 0.8, 0));
        expect(normalize(ZERO)).toEqual(ZERO);
        expect(length(vec3(3, 4, 12))).toBe(13);
    });

    it("projects onto the lawn plane", () => {
        expect(horizontal(vec3(1, 2, 3))).toEqual(vec3(1, 2, 0));
    });
});
