import { describe, expect, it } from "vitest";
import {
    ballReference,
    courtReference,
    frictionReference,
    lawnReference,
    lawsReference,
} from "../../src/reference/index";

describe("reference data", () => {
    it("loads every topic", () => {
        expect(ballReference.diameter.value).toBeGreaterThan(0);
        expect(courtReference.hoops).toHaveLength(6);
        expect(lawsReference.hoopRunComplete.quote.length).toBeGreaterThan(0);
        expect(lawnReference.speedDistance.value).toBeGreaterThan(0);
        expect(frictionReference.ballTurfSliding.value).toBeGreaterThan(0);
    });

    it("lets a ball pass through a hoop", () => {
        expect(courtReference.hoopInnerWidth.value).toBeGreaterThan(ballReference.diameter.value);
    });

    it("places every hoop and the peg inside the court with unique ids and unit normals", () => {
        const ids = new Set(courtReference.hoops.map((h) => h.id));
        expect(ids.size).toBe(6);
        for (const h of [...courtReference.hoops, { ...courtReference.peg, normalX: 1, normalY: 0 }]) {
            expect(h.x).toBeGreaterThan(0);
            expect(h.x).toBeLessThan(courtReference.width.value);
            expect(h.y).toBeGreaterThan(0);
            expect(h.y).toBeLessThan(courtReference.length.value);
            expect(Math.hypot(h.normalX, h.normalY)).toBeCloseTo(1, 12);
        }
    });

    it("lays the hoops out symmetrically about the north–south centre line", () => {
        const w = courtReference.width.value;
        for (const h of courtReference.hoops) {
            const mirrored = courtReference.hoops.some(
                (o) => Math.abs(o.x - (w - h.x)) < 1e-3 && Math.abs(o.y - h.y) < 1e-3,
            );
            expect(mirrored, `hoop ${h.id} has no mirror image`).toBe(true);
        }
        expect(courtReference.peg.x).toBeCloseTo(w / 2, 3);
    });

    it("keeps restitution within [0, 1] and friction non-negative", () => {
        for (const key of ["ballBallRestitution", "ballUprightRestitution", "ballPegRestitution"] as const) {
            expect(frictionReference[key].value).toBeGreaterThanOrEqual(0);
            expect(frictionReference[key].value).toBeLessThanOrEqual(1);
        }
        for (const key of ["ballTurfSliding", "ballBallFriction", "ballUprightFriction", "ballPegFriction"] as const) {
            expect(frictionReference[key].value).toBeGreaterThanOrEqual(0);
        }
    });
});
