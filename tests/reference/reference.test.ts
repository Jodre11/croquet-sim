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
    ratioTargetsReference,
    readRatioTargets,
    readShape,
    SWING_REFERENCE_TYPES,
    swingBodyReference,
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
        for (const key of ["ballBallRestitution", "ballUprightRestitution", "ballPegRestitution"] as const) {
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
        expect(contactReference.bedModulus.value).toBeGreaterThan(0);
        expect(contactReference.bedRecovery.value).toBeGreaterThan(0);
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

    it("loads the default box mallet's figures, each within its bounds (P2b.2b.2b.2c design §5.2)", () => {
        const units = {
            faceWidth: "m",
            faceHeight: "m",
            edgeRadius: "m",
            inertiaAboutShaft: "kg·m²",
            shaftMass: "kg",
        } as const;
        for (const [key, unit] of Object.entries(units)) {
            const value = malletReference[key as keyof typeof units];
            expect(value.unit, key).toBe(unit);
            expect(value.value, key).toBeGreaterThan(0);
        }
        // The edge radius is unsourced: a flagged placeholder with no bounds (design §6).
        expect(malletReference.edgeRadius.provisional).toBe("placeholder");
        expect(malletReference.edgeRadius.bounds).toBeUndefined();
        expect(malletReference.inertiaAboutShaft.bounds).toEqual([0.00334, 0.0172]);
        expect(malletReference.headLength.bounds).toEqual([0.2286, 0.3302]);
        expect(malletReference.shaftLength.bounds).toEqual([0.762, 1.0668]);
    });

    it("gives a realisable box: the default's moment within m·h_y²/3 and m·(L²/4 + h_y²/3) (design §5.3)", () => {
        // With m 1.0 kg, L 0.2794 m and h_y 0.028575 m: [2.72, 197.9] kg·cm², 146 at 73.8 % of the maximum.
        const m = malletReference.headMass.value;
        const L = malletReference.headLength.value;
        const h = malletReference.faceWidth.value / 2;
        const I = malletReference.inertiaAboutShaft.value;
        expect(L).toBe(0.2794);
        expect(I).toBeGreaterThanOrEqual((m * h * h) / 3);
        expect(I).toBeLessThanOrEqual(m * ((L * L) / 4 + (h * h) / 3));
        expect(I / (m * ((L * L) / 4 + (h * h) / 3))).toBeCloseTo(0.738, 3);
    });

    it("gives every impact value bounds, so the probe can sweep them, and every fit a range", () => {
        // The bed's fitted pair has no bounds: one court only, and lawn presets are P3's (P2b.2b.2b.2a design §4.4).
        // The edge radius is an unsourced placeholder (P2b.2b.2b.2c design §6).
        // N_c is a labelled analogue: no open table against rake was found (P2b.2b.2b.3 design §6.2).
        const unbounded = [
            contactReference.bedModulus,
            contactReference.bedRecovery,
            contactReference.turfPloughFactor,
            malletReference.edgeRadius,
        ];
        for (const v of [...Object.values(contactReference), ...Object.values(malletReference)]) {
            if ("range" in v) {
                expect(v.range[0], v.source).toBeLessThan(v.range[1]);
            } else if (!unbounded.includes(v)) {
                expect(v.bounds, v.source).toBeDefined();
            }
        }
    });

    it("loads Gugan's face fits, which reproduce his tabulated restitutions and contact times", () => {
        const e = contactReference.faceRestitutionFit;
        const { a, b, p } = e.coefficients as { a: number; b: number; p: number };
        expect(e.range).toEqual([0.5, 6]);
        expect(e.rangeUnit).toBe("m/s");
        const restitution = (u: number): number => Math.sqrt(1 - (a + b * Math.pow(u, p)));
        // Spec §3.1: e from 0.854 at 0.5 m/s to 0.793 at 6 m/s.
        expect(restitution(0.5)).toBeCloseTo(0.854, 3);
        expect(restitution(6)).toBeCloseTo(0.793, 3);
        const t = contactReference.faceContactTimeFit;
        const { t0, u0, q } = t.coefficients as { t0: number; u0: number; q: number };
        const duration = (u: number): number => t0 * Math.pow(u / u0, q);
        // P2b.2b.2c.2c: T(U) re-anchored on Gugan 4's Table 2 A2D, its video time from first touch converted by the
        // free face, q kept (was 0.97 ms at 2.19 m/s, u0 2.19 m/s).
        expect(t.coefficients).toEqual({ t0: 0.0005790224714766786, u0: 3.26, q: -0.23 });
        // T at A2D's U is the harness's scale factor for A2D, 0.654126 (six figures, as the note gives it), times the
        // old law's T(3.26) (Gugan 2000: 0.97 ms at 2.19 m/s, q −0.23), to 1e-6 relative. The law played alone is held
        // to this T to 1e-3 relative, at dt 10 ns, in tests/engine/squeeze.test.ts.
        const oldLaw = 0.97e-3 * Math.pow(3.26 / 2.19, -0.23);
        expect(Math.abs((0.654126 * oldLaw) / duration(3.26) - 1)).toBeLessThan(1e-6);
        // The fit's ends over the clamp's range, as its note states (was 1.36 ms at 0.5 m/s and 0.77 ms at 6 m/s).
        expect(duration(0.5) * 1e3).toBeCloseTo(0.891, 3);
        expect(duration(6) * 1e3).toBeCloseTo(0.503, 3);
    });
});

describe("ball–ball reference data", () => {
    it("sets the ball–ball contact time and its bounds from Table 1, converted to the law's parameter", () => {
        // P2b.2b.2c.2c: Table 1's video times 0.75 ms and [0.50, 0.87] ms converted by ballBallTimeFor, the video's
        // clock from first touch (was 0.75 ms in [0.5, 0.87] ms, the video times taken as the law's).
        const T = contactReference.ballBallContactTime;
        expect(T.value).toBe(0.000550952396967293);
        expect(T.bounds).toEqual([0.000318661108380713, 0.0006624524619049279]);
        expect(T.provenance).toBe("derived");
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

    it("loads 29.2.5's re-contact thresholds, each a placeholder at 0", () => {
        const { mergeSeparation, effectSpeed, effectAngle } = lawsReference.reContactThresholds;
        expect([mergeSeparation.unit, effectSpeed.unit, effectAngle.unit]).toEqual(["m", "1", "°"]);
        for (const threshold of [mergeSeparation, effectSpeed, effectAngle]) {
            expect(threshold.value).toBe(0);
            expect(threshold.note).toContain("Placeholder");
            expect(threshold.provisional).toBe("placeholder");
            expect(threshold.provenance).toBe("derived");
        }
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

    it("loads the arm's flex, push and the hand–arm chain, each positive within its bounds (P2b.2b.2b.2b §3.2)", () => {
        const arm = {
            armStiffness: "N/m",
            armStiffnessPerForce: "1/m",
            armDampingRatio: "1",
            armEndpointMass: "kg",
            armHoldStiffness: "N/m",
            armHoldDamping: "N·s/m",
            pendulumForce: "N",
            pushForce: "N",
            pushResponseTime: "s",
            forearmMass: "kg",
            handMass: "kg",
            fingerMass: "kg",
            palmSkinMass: "kg",
            fingerSkinMass: "kg",
            shoulderStiffness: "N/m",
            shoulderDamping: "N·s/m",
            wristStiffness: "N/m",
            wristDamping: "N·s/m",
            knuckleStiffness: "N/m",
            knuckleDamping: "N·s/m",
            palmStiffness: "N/m",
            palmDamping: "N·s/m",
            fingerStiffness: "N/m",
            fingerDamping: "N·s/m",
        } as const;
        for (const [key, unit] of Object.entries(arm)) {
            const value = contactReference[key as keyof typeof arm];
            expect(value.unit, key).toBe(unit);
            expect(value.value, key).toBeGreaterThan(0);
            const [low, high] = value.bounds as readonly [number, number];
            expect(value.value, key).toBeGreaterThanOrEqual(low);
            expect(value.value, key).toBeLessThanOrEqual(high);
        }
        // A damping ratio above 1 is overdamped; the flex law takes ζ_arm in (0, 1] (design §6).
        expect(contactReference.armDampingRatio.value).toBeLessThanOrEqual(1);
    });

    it("loads the head–turf friction and the deep-head limit", () => {
        expect(contactReference.headTurfFriction.value).toBe(0.5);
        expect(contactReference.headTurfFriction.bounds).toEqual([0.3, 0.7]);
        expect(contactReference.gripLimit.value).toBe(435);
        expect(contactReference.gripLimit.bounds).toEqual([408, 462]);
        expect(contactReference.headDeepLimit.value).toBe(0.002);
        expect(contactReference.turfYield.value).toBe(240000);
        expect(contactReference.turfYield.bounds).toEqual([172000, 310000]);
        expect(contactReference.turfMatStrength.value).toBe(105000);
        expect(contactReference.turfMatStrength.bounds).toEqual([73000, 138000]);
        expect(contactReference.turfPloughFactor.value).toBe(1.71);
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
    it("loads the body's backswing limit, a placeholder within its bounds in (0, π/2]", () => {
        const limit = swingBodyReference.backswingLimit;
        expect(limit.unit).toBe("rad");
        expect(limit.provisional).toBe("placeholder");
        const [low, high] = limit.bounds as readonly [number, number];
        expect(limit.value).toBeGreaterThanOrEqual(low);
        expect(limit.value).toBeLessThanOrEqual(high);
        expect(low).toBeGreaterThan(0);
        expect(high).toBeLessThanOrEqual(Math.PI / 2);
    });

    it("loads the body's effort: the fit's τ_0 ≥ 0 and ω_max > 0, and κ in (0, 1), all placeholders", () => {
        // P2b.2b.2c.1 design §4.4: τ_0 and ω_max are derived by scripts/fitStrokeShape.ts from κ and the ceiling.
        const { effortTorque, effortSpeed, effortShare } = swingBodyReference;
        expect([effortTorque.unit, effortSpeed.unit, effortShare.unit]).toEqual(["N·m", "rad/s", "1"]);
        for (const entry of [effortTorque, effortSpeed, effortShare]) {
            expect(entry.provisional).toBe("placeholder");
            expect(entry.provenance).toBe("derived");
        }
        expect(effortTorque.value).toBeGreaterThanOrEqual(0);
        expect(effortSpeed.value).toBeGreaterThan(0);
        expect(effortShare.value).toBeGreaterThan(0);
        expect(effortShare.value).toBeLessThan(1);
    });

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

    it("holds the fit's defaults: a backswing and its planned speed at intensity 0", () => {
        for (const type of SWING_REFERENCE_TYPES) {
            const shape = swingReference[type];
            expect(shape.defaultBackswing.value, type).toBeGreaterThan(0);
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

    it("gives the rolls a hands' tempo, fast no slower than slow, and the swing presets none", () => {
        // The swing presets swing under the body's effort, shared by every swing preset.
        for (const type of SWING_REFERENCE_TYPES) {
            const { handTempo } = swingReference[type];
            const swing = ["single-ball", "drive", "stop-ac", "stop-gc"].includes(type);
            expect(handTempo === null, type).toBe(swing);
            if (handTempo !== null) {
                expect(handTempo.fast.value, type).toBeLessThanOrEqual(handTempo.slow.value);
                expect(handTempo.fast.value, type).toBeGreaterThan(0);
            }
        }
    });

    it("halves the placeholder tempos (design §6.2)", () => {
        for (const type of SWING_REFERENCE_TYPES) {
            const { handTempo } = swingReference[type];
            if (handTempo?.slow.provisional === "placeholder") {
                expect(handTempo.fast.value, type).toBeCloseTo(handTempo.slow.value / 2, 12);
            }
        }
    });

    it("rejects a hands' tempo given only in part and a retired effort key, naming the key", () => {
        const entryOf = (type: SwingReferenceType): Record<string, unknown> =>
            (swingJson as unknown as Record<string, Record<string, unknown>>)[type] ?? {};
        const without = (type: SwingReferenceType, key: string): unknown => ({
            ...swingJson,
            [type]: Object.fromEntries(Object.entries(entryOf(type)).filter(([k]) => k !== key)),
        });
        expect(() => readShape(without("full-roll", "handTempoSlow"), "full-roll")).toThrow(ReferenceDataError);
        expect(() => readShape(without("full-roll", "handTempoSlow"), "full-roll")).toThrow(
            /swing\.full-roll\.handTempoSlow/,
        );
        // P2b.2b.2c.1 design §4.4: the swing presets' effort pulse is retired.
        for (const key of ["torqueMax", "tempoSlow", "tempoFast"]) {
            const retired = { ...swingJson, drive: { ...entryOf("drive"), [key]: swingJson.body.effortTorque } };
            expect(() => readShape(retired, "drive"), key).toThrow(ReferenceDataError);
            expect(() => readShape(retired, "drive"), key).toThrow(new RegExp(`swing\\.drive\\.${key}.*retired`));
        }
        expect(readShape(swingJson, "drive")).toEqual(swingReference.drive);
    });

    it("rejects a default intensity as retired in every preset, naming the key", () => {
        // The default stroke fixes the backswing, and an absent intensity is 0 in both modes, so a default intensity
        // would be a dead knob.
        const entryOf = (type: SwingReferenceType): Record<string, unknown> =>
            (swingJson as unknown as Record<string, Record<string, unknown>>)[type] ?? {};
        for (const type of SWING_REFERENCE_TYPES) {
            expect(entryOf(type), type).not.toHaveProperty("defaultIntensity");
            const given = { value: 0, unit: "1", source: "test", provenance: "derived" };
            const retired = { ...swingJson, [type]: { ...entryOf(type), defaultIntensity: given } };
            expect(() => readShape(retired, type), type).toThrow(ReferenceDataError);
            expect(() => readShape(retired, type), type).toThrow(
                new RegExp(`swing\\.${type}\\.defaultIntensity.*retired`),
            );
        }
    });
});

describe("the ratio targets (P2b.2b.2c.2 design §5.1)", () => {
    type Target = { ratio: Record<string, unknown>; speed?: Record<string, unknown> };
    // A deep copy of swing.json with one target's fields replaced; an undefined field is removed.
    const withTarget = (key: "drive" | "stop-ac", change: Partial<Target>): unknown => {
        const copy = JSON.parse(JSON.stringify(swingJson)) as { ratioTargets: Record<string, Target> };
        const target = copy.ratioTargets[key] as Target;
        copy.ratioTargets[key] = {
            ratio: { ...target.ratio, ...change.ratio },
            ...("speed" in change
                ? change.speed === undefined
                    ? {}
                    : { speed: { ...target.speed, ...change.speed } }
                : { speed: target.speed }),
        };
        return copy;
    };

    it("gives Gugan 5's drive and stop ratios with his tolerances as bounds", () => {
        expect(ratioTargetsReference.drive.ratio.value).toBe(4.23);
        expect(ratioTargetsReference.drive.ratio.bounds).toEqual([4.03, 4.43]);
        expect(ratioTargetsReference["stop-ac"].ratio.value).toBe(7.15);
        expect(ratioTargetsReference["stop-ac"].ratio.bounds).toEqual([6.55, 7.75]);
        expect(ratioTargetsReference.drive.speed.value).toBe(3);
        expect(ratioTargetsReference["stop-ac"].speed.value).toBe(3);
    });

    it("rejects a target outside its tolerance band, a missing or non-positive speed", () => {
        expect(() => readRatioTargets(withTarget("drive", { ratio: { value: 5 } }))).toThrow(ReferenceDataError);
        expect(() => readRatioTargets(withTarget("drive", { ratio: { value: 5 } }))).toThrow(
            /ratioTargets\.drive\.ratio.*outside bounds/,
        );
        expect(() => readRatioTargets(withTarget("stop-ac", { speed: undefined }))).toThrow(ReferenceDataError);
        expect(() => readRatioTargets(withTarget("stop-ac", { speed: undefined }))).toThrow(
            /ratioTargets\.stop-ac\.speed.*missing/,
        );
        expect(() => readRatioTargets(withTarget("stop-ac", { speed: { value: 0 } }))).toThrow(
            /ratioTargets\.stop-ac\.speed.*positive/,
        );
        expect(readRatioTargets(swingJson)).toEqual(ratioTargetsReference);
    });

    it("rejects a ratio that gives no tolerance bounds", () => {
        const unbounded = withTarget("drive", {}) as { ratioTargets: { drive: { ratio: Record<string, unknown> } } };
        delete unbounded.ratioTargets.drive.ratio["bounds"];
        expect(() => readRatioTargets(unbounded)).toThrow(ReferenceDataError);
        expect(() => readRatioTargets(unbounded)).toThrow(/must give its tolerance as bounds/);
    });
});
