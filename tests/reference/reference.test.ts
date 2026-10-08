import { describe, expect, it } from "vitest";
import {
    ballReference,
    contactReference,
    courtReference,
    FAULT_LAW_KEYS,
    frictionReference,
    lawnReference,
    lawsReference,
    malletReference,
    readShape,
    SWING_REFERENCE_TYPES,
    swingReference,
    type SwingReferenceType,
} from "../../src/reference/index";
import { ReferenceDataError } from "../../src/reference/schema";
import swingJson from "../../reference/swing.json";
import { STROKE_TYPES } from "../../src/engine/swing/types";

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
        expect(courtReference.crownClearance.value).toBeGreaterThan(ballReference.diameter.value);
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
        for (const key of [
            "ballBallRestitution",
            "ballUprightRestitution",
            "ballPegRestitution",
            "ballTurfRestitution",
        ] as const) {
            expect(frictionReference[key].value).toBeGreaterThanOrEqual(0);
            expect(frictionReference[key].value).toBeLessThanOrEqual(1);
        }
        for (const key of ["ballTurfSliding", "ballBallFriction", "ballUprightFriction", "ballPegFriction"] as const) {
            expect(frictionReference[key].value).toBeGreaterThanOrEqual(0);
        }
    });
});

describe("impact reference data", () => {
    it("loads contact durations, turf stiffness and the tangential ratio", () => {
        expect(contactReference.ballTurfStiffness.value).toBeGreaterThan(0);
        expect(contactReference.ballBallContactTime.value).toBeGreaterThan(0);
        expect(contactReference.faceBallContactTime.value).toBeGreaterThan(0);
        expect(contactReference.tangentialStiffnessRatio.value).toBeCloseTo(2 / 7, 15);
    });

    it("loads one face and one typical head", () => {
        expect(malletReference.faceRestitution.value).toBeGreaterThan(0);
        expect(malletReference.faceRestitution.value).toBeLessThanOrEqual(1);
        expect(malletReference.faceFriction.value).toBeGreaterThanOrEqual(0);
        expect(malletReference.headMass.value).toBeGreaterThan(0);
        expect(malletReference.headLength.value).toBeGreaterThan(malletReference.headDiameter.value);
    });

    it("gives every impact value bounds, so the probe can sweep them", () => {
        for (const v of [...Object.values(contactReference), ...Object.values(malletReference)]) {
            expect(v.bounds, v.source).toBeDefined();
        }
    });
});

describe("obstacle and fault reference data", () => {
    it("derives the obstacle contact time from the ball–ball one, within the Hertzian lower bound", () => {
        const T = contactReference.ballObstacleContactTime;
        expect(T.value).toBe(contactReference.ballBallContactTime.value);
        const [lo] = T.bounds as [number, number];
        expect(lo).toBeCloseTo((contactReference.ballBallContactTime.bounds as [number, number])[0] * 0.87, 12);
    });

    it("quotes every Law the fault judge relies on", () => {
        for (const key of FAULT_LAW_KEYS) {
            expect(lawsReference.faults[key].quote.length, key).toBeGreaterThan(0);
        }
        expect(Object.keys(lawsReference.faults)).toEqual([...FAULT_LAW_KEYS]);
    });
});

describe("swing, coupling and head–turf reference data", () => {
    it("loads the provisional hand coupling", () => {
        expect(contactReference.handCouplingPeriod.value).toBe(0.08);
        expect(contactReference.handCouplingDampingRatio.value).toBe(0.7);
    });

    it("loads the default body's arm mass and reach slack", () => {
        expect(contactReference.armMass.value).toBe(0.8);
        expect(contactReference.armMass.unit).toBe("kg");
        expect(contactReference.reachSlack.value).toBe(0.03);
        expect(contactReference.reachSlack.unit).toBe("m");
    });

    it("loads the head–turf friction and the deep-head limit", () => {
        expect(contactReference.headTurfFriction.value).toBe(0.5);
        expect(contactReference.headTurfFriction.bounds).toEqual([0.3, 0.7]);
        expect(contactReference.headDeepLimit.value).toBe(0.002);
    });

    it("loads the default shaft, 36 in", () => {
        expect(malletReference.shaftLength.value).toBeCloseTo(36 * 0.0254, 12);
    });

    it("quotes 29.1.14 after 29.1.13", () => {
        const keys: readonly string[] = FAULT_LAW_KEYS;
        expect(keys.indexOf("29.1.14")).toBe(keys.indexOf("29.1.13") + 1);
        expect(lawsReference.faults["29.1.14"].quote).toContain("damages the court with the mallet");
    });
});

describe("swing reference (P2b.2b.2a design §6.1)", () => {
    it("has an entry for every stroke type, in the presets' order", () => {
        expect(SWING_REFERENCE_TYPES).toEqual(STROKE_TYPES);
        expect(Object.keys(swingReference)).toEqual([...STROKE_TYPES]);
    });

    it("keeps the top hand still in every swing preset", () => {
        for (const type of ["single-ball", "drive", "stop-ac", "stop-gc"] as const) {
            expect(swingReference[type].pendulumShare.value, type).toBe(1);
        }
    });

    it("gives every stroke type a share in [0, 1], a hands' angle in (0, 90°) and a finish", () => {
        for (const type of SWING_REFERENCE_TYPES) {
            const shape = swingReference[type];
            expect(shape.pendulumShare.value, type).toBeGreaterThanOrEqual(0);
            expect(shape.pendulumShare.value, type).toBeLessThanOrEqual(1);
            expect(shape.handAngle.value, type).toBeGreaterThan(0);
            expect(shape.handAngle.value, type).toBeLessThan(Math.PI / 2);
            expect(shape.finish.quote.length, type).toBeGreaterThan(0);
        }
    });

    it("gives every sourced range low ≤ high, and every kinematic pair one measure", () => {
        for (const type of SWING_REFERENCE_TYPES) {
            const { backswingRange, kinematics } = swingReference[type];
            if (backswingRange !== null) {
                expect(backswingRange.low.value, type).toBeLessThanOrEqual(backswingRange.high.value);
                expect(backswingRange.low.value, type).toBeGreaterThan(0);
            }
            for (const pair of kinematics) {
                expect(pair.backswing, type).toBeGreaterThan(0);
                expect((pair.contactSpeed === null) !== (pair.downswingTime === null), type).toBe(true);
            }
        }
    });

    it("marks every placeholder as derived", () => {
        for (const type of SWING_REFERENCE_TYPES) {
            for (const entry of [swingReference[type].pendulumShare, swingReference[type].handAngle]) {
                if (entry.provisional === "placeholder") {
                    expect(entry.provenance, type).toBe("derived");
                }
            }
        }
    });

    it("holds the fit's defaults: a backswing, an intensity in [0, 1] and its planned speed", () => {
        for (const type of SWING_REFERENCE_TYPES) {
            const shape = swingReference[type];
            expect(shape.defaultBackswing.value, type).toBeGreaterThan(0);
            expect(shape.defaultIntensity.value, type).toBeGreaterThanOrEqual(0);
            expect(shape.defaultIntensity.value, type).toBeLessThanOrEqual(1);
            // Exit criterion 5: 3 m/s within 2 %, or a default at a sourced bound.
            const range = shape.backswingRange;
            const atBound =
                range !== null &&
                (shape.defaultBackswing.value === range.low.value || shape.defaultBackswing.value === range.high.value);
            if (!atBound) {
                expect(Math.abs(shape.defaultSpeed.value / 3 - 1), type).toBeLessThanOrEqual(0.02);
            }
        }
    });

    it("gives the swing presets an effort and the rolls a hands' tempo, fast no slower than slow", () => {
        for (const type of SWING_REFERENCE_TYPES) {
            const { effort, handTempo } = swingReference[type];
            const swing = ["single-ball", "drive", "stop-ac", "stop-gc"].includes(type);
            expect(effort === null, type).toBe(!swing);
            expect(handTempo === null, type).toBe(swing);
            if (effort !== null) {
                expect(effort.torqueMax.value, type).toBeGreaterThanOrEqual(0);
                expect(effort.tempoFast.value, type).toBeLessThanOrEqual(effort.tempoSlow.value);
                expect(effort.tempoFast.value, type).toBeGreaterThan(0);
            }
            if (handTempo !== null) {
                expect(handTempo.fast.value, type).toBeLessThanOrEqual(handTempo.slow.value);
                expect(handTempo.fast.value, type).toBeGreaterThan(0);
            }
        }
    });

    it("halves the placeholder tempos (design §6.2)", () => {
        for (const type of SWING_REFERENCE_TYPES) {
            const { effort, handTempo } = swingReference[type];
            if (effort?.tempoSlow.provisional === "placeholder") {
                expect(effort.tempoFast.value, type).toBeCloseTo(effort.tempoSlow.value / 2, 12);
            }
            if (handTempo?.slow.provisional === "placeholder") {
                expect(handTempo.fast.value, type).toBeCloseTo(handTempo.slow.value / 2, 12);
            }
        }
    });

    it("rejects an effort or a hands' tempo given only in part, naming the missing key", () => {
        const without = (type: SwingReferenceType, key: string): unknown => {
            const entry = (swingJson as Record<string, Record<string, unknown>>)[type] ?? {};
            return { ...swingJson, [type]: Object.fromEntries(Object.entries(entry).filter(([k]) => k !== key)) };
        };
        expect(() => readShape(without("drive", "tempoSlow"), "drive")).toThrow(ReferenceDataError);
        expect(() => readShape(without("drive", "tempoSlow"), "drive")).toThrow(/swing\.drive\.tempoSlow/);
        expect(() => readShape(without("full-roll", "handTempoSlow"), "full-roll")).toThrow(
            /swing\.full-roll\.handTempoSlow/,
        );
        expect(readShape(swingJson, "drive")).toEqual(swingReference.drive);
    });
});
