import { describe, expect, it } from "vitest";
import { openWorld, opened } from "../../scripts/openLawn";
import { impactLawnShift } from "../../scripts/pushMap";
import { vec3 } from "../../src/engine/math/vec3";
import { defaultWorld } from "../../src/engine/world";
import { canonicalSetup } from "./support/shot";

describe("the open lawn by speed (P2b.2b.2c.3b plan Task 2)", () => {
    it("takes its rolling resistance from the court of the same speed", () => {
        const centre = (w: ReturnType<typeof defaultWorld>) =>
            w.lawn.surfaceAt(vec3(w.lawn.width / 2, w.lawn.length / 2, 0)).rollingResistance;
        expect(centre(openWorld(6))).toBe(centre(defaultWorld(6)));
        expect(centre(openWorld(14))).toBe(centre(defaultWorld(14)));
    });

    it("defaults to the 10 s lawn, so that today's callers are unchanged", () => {
        // The lawn holds a closure, so compare what it returns rather than the worlds themselves.
        const [a, b] = [openWorld(), openWorld(10)];
        const at = vec3(a.lawn.width / 2, a.lawn.length / 2, 0);
        expect(a.lawn.surfaceAt(at)).toEqual(b.lawn.surfaceAt(at));
        expect([a.lawn.width, a.lawn.length, a.hoops.length]).toEqual([b.lawn.width, b.lawn.length, b.hoops.length]);
    });

    it("measures the impact's shift across the lawns as a finite, non-negative speed", () => {
        const shift = impactLawnShift(opened(canonicalSetup("half-roll")));
        expect(Number.isFinite(shift)).toBe(true);
        expect(shift).toBeGreaterThanOrEqual(0);
    });
});
