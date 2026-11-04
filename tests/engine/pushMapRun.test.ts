import { describe, expect, it, vi } from "vitest";
import { findFirmness } from "../../scripts/firmness";
import { openWorld, opened } from "../../scripts/openLawn";
import { MAP_LAWNS } from "../../scripts/pushMap";
import { bodyBackswing, mapSetup, maxPower, playSample, runClass, textBook } from "../../scripts/pushMapRun";
import { ratioOf } from "../../scripts/ratioFit";
import type { FaultReport } from "../../src/engine/faults";
import type { OnPoint } from "../../src/engine/impact/band";
import { faceKey } from "../../src/engine/impact/contacts";
import type { FollowFlag, FollowThrough } from "../../src/engine/impact/integrate";
import { PRACTICE_PASSES } from "../../src/engine/impact/practice";
import { faceHalfHeight } from "../../src/engine/impact/shape";
import type { ImpactEvent, ImpactResult } from "../../src/engine/impact/types";
import type { BallId } from "../../src/engine/types";
import { simulateShot } from "../../src/engine/shot";
import { simulateFreeMotion } from "../../src/engine/simulate";
import { headShapeOf, plannedSpeed, stanceLean } from "../../src/engine/swing/buildContact";
import { defaultProfile } from "../../src/engine/swing/profile";
import { swingReference } from "../../src/reference/index";
import { PASS_SPLIT, canonicalSetup } from "./support/shot";

// A spy that plays through, so the free motion's runs can be counted (Task B2).
vi.mock("../../src/engine/simulate", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../src/engine/simulate")>();
    return { ...actual, simulateFreeMotion: vi.fn(actual.simulateFreeMotion) };
});

const DEG = Math.PI / 180;
const WORLD = openWorld();

/** The power p at which the text book's backswing is the type's defaultBackswing (decision 1: p ≤ 1 is p·h_body). */
function canonicalPower(): number {
    const setup = mapSetup("half-roll", textBook("half-roll"), 1);
    return swingReference["half-roll"].defaultBackswing.value / bodyBackswing(setup, WORLD);
}

describe("one plan's run (P2b.2b.2c.3b plan Task 3)", () => {
    it("reads the half roll's text book from the preset, and the pass roll's split as canonicalSetup's", () => {
        const plan = textBook("half-roll");
        const stance = defaultProfile.stance["half-roll"];
        const { mallet } = defaultProfile;
        const lean = stanceLean(stance.handsAhead, stance.top, 0, {
            ballRadius: WORLD.ball.radius,
            headLength: mallet.headLength,
            faceHalfHeight: faceHalfHeight(headShapeOf(mallet.head)),
        });
        expect(Math.abs(plan.lean - lean)).toBeLessThanOrEqual(1e-12);
        expect([plan.drive, plan.handReach, plan.window, plan.onset, plan.split]).toEqual([1, 0.025, 0.02, 0, 0]);
        expect(textBook("pass-roll").split).toBe((PASS_SPLIT * Math.PI) / 180);
    });

    it("ties the power to today's canonical: the default backswing plans 3 m/s", () => {
        // The feet are given explicitly and read back through the arc, and the lean through the hands, so the plan
        // agrees with the canonical to round-off, not to the bit.
        for (const type of ["half-roll", "full-roll", "pass-roll"] as const) {
            const base = mapSetup(type, textBook(type), 1);
            const p = swingReference[type].defaultBackswing.value / bodyBackswing(base, WORLD);
            expect(p).toBeGreaterThan(0);
            expect(p).toBeLessThan(1);
            const speed = plannedSpeed(mapSetup(type, textBook(type), p), WORLD);
            expect(Math.abs(speed - 3) / 3).toBeLessThanOrEqual(1e-6);
        }
    });

    it("holds h_body to the head's rise limit, the rolls at it (firmness design §3)", () => {
        const limit = defaultProfile.body.headRiseLimit;
        for (const type of ["half-roll", "full-roll", "pass-roll"] as const) {
            const h = bodyBackswing(mapSetup(type, textBook(type), 1), WORLD);
            expect(h).toBeLessThan(limit);
            expect(Math.abs(h - limit) / limit).toBeLessThanOrEqual(1e-8);
        }
    });

    it("plays the text book at the canonical power as the canonical half roll plays", () => {
        const p = canonicalPower();
        const sample = playSample("half-roll", textBook("half-roll"), p, [10], "preset");
        const canonical = opened(canonicalSetup("half-roll"));
        const ratio = ratioOf(canonical, simulateShot(canonical, WORLD).motion);
        expect(sample.klass).toBeNull();
        expect(sample.reason).toBeNull();
        const read = sample.byLawn[10];
        expect(read).toBeDefined();
        expect(Math.abs((read?.ratio ?? NaN) - ratio) / ratio).toBeLessThanOrEqual(1e-6);
        expect(read?.range).toBeGreaterThan(0);
        expect(sample.strokeEffort).toBeGreaterThan(0);
        expect(sample.strokeEffort).toBeLessThan(100);
        expect(sample.pushEffort).toBeGreaterThan(0);
        expect(sample.pushEffort).toBeLessThanOrEqual(100);
        expect(sample.pushImpulse).toBeGreaterThan(0);
        // The rolls hold the slope (λ 1), so the hands supply a couple, within C at the canonical.
        expect(sample.coupleShare).toBeGreaterThan(0);
        expect(sample.coupleShare).toBeLessThanOrEqual(1);
        // In the band on its first pass (P2b.2b.2c.3b.1 design §4).
        expect(sample.passes).toBe(1);
    });

    it("records a plan the engine rejects as unreachable, keeping the engine's message (Review Focus 1)", () => {
        const sample = playSample("half-roll", { ...textBook("half-roll"), feet: 2 }, canonicalPower(), [10]);
        expect(sample.klass).toBe("unreachable");
        expect(sample.reason).toContain("stroke.feet");
        expect(Number.isNaN(sample.byLawn[10]?.range ?? NaN)).toBe(true);
    });

    it("bisects the most power a weak bottom grip holds (Review Focus 2)", () => {
        // A bottom grip of 0.1 shrinks C = min(γ_T, g_B)·F_max·(r − b) tenfold, from 167.5 to 16.7 N·m. The text
        // book's held slope needs a peak couple of about 12.2 N·m at p = 1 and 29.4 N·m at p = 2 (measured while
        // building this test), so p = 1 plans and p = 2 throws the downswing's RangeError. The plan's g_B 0.01 makes
        // C 1.67 N·m, past which p = 1 also fails (the next test). Those couples were measured on h_body's 1.02 m;
        // under the head's 0.48 m rise limit (firmness design §3) the bisection still lands in (1, 2).
        const over = { stance: { bottomGrip: 0.1 } };
        const plan = textBook("half-roll");
        const most = maxPower("half-roll", plan, WORLD, over);
        expect(most).toBeGreaterThan(1);
        expect(most).toBeLessThan(2);
        expect(Number.isFinite(plannedSpeed(mapSetup("half-roll", plan, most, over), WORLD))).toBe(true);
        // The bisection stops at the couple's edge: a hair above it the grip no longer holds.
        expect(() => plannedSpeed(mapSetup("half-roll", plan, most + 1e-6, over), WORLD)).toThrow(
            /the grip cannot hold/,
        );
        expect(() => plannedSpeed(mapSetup("half-roll", plan, most + 1e-6, over), WORLD)).toThrow(RangeError);
    });

    it("bisects below p = 1 when p = 1 fails, returning a power that plans or NaN (Review Focus 2)", () => {
        // A bottom grip of 0.01 makes C 1.67 N·m, below the couple at p = 1 (12.2 N·m). Below 1 the couple is not
        // monotone in p (about 2.36 N·m at p = 0.2, 2.03 at 0.4, 5.40 at 0.6: the reviewer's figures), so the
        // bisection may find no power; whatever it returns plans.
        const over = { stance: { bottomGrip: 0.01 } };
        const plan = textBook("half-roll");
        const most = maxPower("half-roll", plan, WORLD, over);
        if (!Number.isNaN(most)) {
            expect(most).toBeGreaterThan(0);
            expect(most).toBeLessThan(1);
            expect(Number.isFinite(plannedSpeed(mapSetup("half-roll", plan, most, over), WORLD))).toBe(true);
        }
    });

    it("rejects an `over` that gives a world or a stroke", () => {
        expect(() => mapSetup("half-roll", textBook("half-roll"), 0.5, { world: WORLD })).toThrow(/mapSetup/);
        expect(() => mapSetup("half-roll", textBook("half-roll"), 0.5, { stroke: { drive: 0 } })).toThrow(/mapSetup/);
    });

    it("grades a lean past the on-point limit as a mishit", () => {
        const sample = playSample(
            "half-roll",
            { ...textBook("half-roll"), lean: 50 * DEG },
            canonicalPower(),
            [10],
            "preset",
        );
        expect(sample.klass).toBe("mishit");
        expect(sample.reason).toContain("on-point limit");
    });

    it("grades the full roll's text book at its canonical power as played: practice lands it in three passes", () => {
        // Measured while building Task 3: the canonical full roll's follow-through raised follow-turf-yield, which
        // decision 5 lists under turf, and nothing earlier in the order applied. P2b.2b.2c.3b.1 design §2, §5 (was
        // turf, follow-turf-yield): the arms' full hold and the bottom hand kept on change the contact, and the head
        // then met the ball off its face (impact-off-face, a mishit; ratio 2.07 on the 10 s lawn). P2b.2b.2c.3b.1
        // plan Task 7: played through practice, its three passes end off point (the lean about 49°, past the 45°
        // limit; ratio 3.70 on the 10 s lawn), so it reads unpractised. A known gap, for the plan's Task 8 and the
        // user; this pins what the engine does, not what the spec's acceptance asks.
        // Shapes plan Task 5: the push's pitch hold (was unpractised, off point). Held at its planned pitch through the
        // push, the lean no longer runs away: practice lands it in two passes, unflagged, at ratio 1.11 on the 10 s lawn.
        // Shapes design §8, ruling 12: the hands guide the mallet to their apex (was ratio 1.112). Carried at its held
        // pitch, the face stays on the striker's ball to 192 ms rather than 102 ms, and the ratio rises to 1.211.
        // Ruling 13: let go from the push's end over the hands' rise, the ratio is 1.215. Ruling 14: the top hand
        // stops, and with the full roll's muted follow-through (0 s) the bottom hand brakes the head's turn to rest
        // over HAND_EASE and holds it. Practice lands it in three passes (was two), unflagged, and the ratio rises to
        // 1.567, the striker's ball carried less far. Ruling 16: the push's acceleration fitted, its default drive 0.25
        // over 80 ms pulses (DEFAULT_WINDOW), the ratio falls to 1.161, inside the band 1.0–1.2.
        const base = mapSetup("full-roll", textBook("full-roll"), 1);
        const p = swingReference["full-roll"].defaultBackswing.value / bodyBackswing(base, WORLD);
        const sample = playSample("full-roll", textBook("full-roll"), p, [10], "preset");
        expect(sample.klass).toBeNull();
        expect(sample.reason).toBeNull();
        expect(sample.passes).toBe(3);
        expect(sample.byLawn[10]?.ratio).toBeCloseTo(1.161, 3);
    });

    it("plays the half roll's text book at its canonical power at its fitted ratio, 2.0", () => {
        // Shapes design §8, ruling 15: the half roll's hold firmness, 0.1, is bisected to ratio 2.0 (was 1.041 at the
        // grip's whole couple, the striker's ball driven on too far).
        const base = mapSetup("half-roll", textBook("half-roll"), 1);
        const p = swingReference["half-roll"].defaultBackswing.value / bodyBackswing(base, WORLD);
        const sample = playSample("half-roll", textBook("half-roll"), p, [10], "preset");
        expect(sample.klass).toBeNull();
        expect(sample.byLawn[10]?.ratio).toBeCloseTo(2.0, 2);
    });

    it("plays the pass roll's text book at its canonical power lawfully, at its fitted ratio, 0.859", () => {
        // Shapes design §8, ruling 17: a full roll with a 4° split, its 32° lean and a subtly punchier push (drive 0.5
        // over 60 ms pulses); was its own 15 ms punch at a 20° split, unlawful (29.1.6.1) at ratio 0.418. Ruling 18:
        // its follow-through 0.1 s keeps the head off the turf (was 0.3 s: ratio 0.814 in two passes).
        const base = mapSetup("pass-roll", textBook("pass-roll"), 1);
        const p = swingReference["pass-roll"].defaultBackswing.value / bodyBackswing(base, WORLD);
        const sample = playSample("pass-roll", textBook("pass-roll"), p, [10], "preset");
        expect(sample.klass).toBeNull();
        expect(sample.passes).toBe(3);
        expect(sample.byLawn[10]?.ratio).toBeCloseTo(0.859, 3);
    });

    it("grades the full roll's text book at p = 2 as superhuman: a hand reaches its grip's limit", () => {
        // Shapes design §8, ruling 14 (was unreachable, §2's hands' finish swinging past the quarter turn of their
        // 1.5 m arc): the top hand now stops within V·HAND_EASE/2 of the push's end, well short of it, so the impact
        // is played. Firmness design §3: h_body is now the head's 0.48 m rise (was 2.77 m), so at p = 1.5 (intensity 0.5)
        // the head slides off the face (unpractised) and at p = 2 (intensity 1) a hand reaches its grip's limit.
        const sample = playSample("full-roll", textBook("full-roll"), 2, [10], "preset");
        expect(sample.klass).toBe("superhuman");
        expect(sample.firmness).toBe(defaultProfile.shape["full-roll"].holdFirmness);
        expect(sample.sigma).toBeGreaterThan(0);
    });
});

describe("the map's found firmness (firmness design §5, A7 item 4)", () => {
    it("plays the full roll's text book at a tap at the hold it finds, admissibly without one", () => {
        // Gate 1's plan, p = 2, is no longer admissible at firmness 0: its head rides over the ball (plan B-d8).
        const sample = playSample("full-roll", textBook("full-roll"), 0.1, [10]);
        expect(sample.klass).toBeNull();
        expect(sample.firmness).toBe(0);
        expect(sample.sigma).toBe(0);
        expect(sample.byLawn[10]?.range).toBeGreaterThan(0);
    });

    it(
        "plays a plan no hold admits at σ_max, its class findFirmness's, its firmness null",
        { timeout: 120_000 },
        () => {
            // Gate 1: the half roll's text book at p = 1.5 trips the grip limit at every firmness.
            const plan = textBook("half-roll");
            const sample = playSample("half-roll", plan, 1.5, [10]);
            expect(findFirmness(mapSetup("half-roll", plan, 1.5), WORLD)).toMatchObject({
                klass: sample.klass,
                reason: sample.reason,
            });
            expect(sample.klass).toBe("superhuman");
            expect(sample.firmness).toBeNull();
            expect(sample.sigma).toBeNull();
            expect(sample.passes).toBeGreaterThan(0);
        },
    );

    it("records no hold for an unplayed sample", () => {
        const sample = playSample("half-roll", { ...textBook("half-roll"), feet: 2 }, 0.5, [10]);
        expect(sample.firmness).toBeNull();
        expect(sample.sigma).toBeNull();
    });
});

describe("the free motion once per sample (plan Amendment B, Task B2; B-d6)", () => {
    it(
        "plays the full roll's found-hold sample at p = 1 as before, rolling the balls once per lawn",
        { timeout: 120_000 },
        () => {
            // Pinned before B2 from the search that rolled the balls on every lawn at each of its nine plays.
            vi.mocked(simulateFreeMotion).mockClear();
            const sample = playSample("full-roll", textBook("full-roll"), 1, MAP_LAWNS);
            expect(vi.mocked(simulateFreeMotion).mock.calls.length).toBe(MAP_LAWNS.length);
            expect(sample).toEqual({
                power: 1,
                klass: null,
                reason: null,
                byLawn: {
                    6: { range: 4.000547519754512, ratio: 1.2175649233545072, splitAtRest: 2.4865592150875944e-14 },
                    10: { range: 8.559654548923966, ratio: 1.3305209305408505, splitAtRest: 2.988384442521598e-14 },
                    14: { range: 15.39831509267816, ratio: 1.3745406046094966, splitAtRest: 3.070663486314841e-14 },
                },
                strokeEffort: 37.67372104345212,
                pushEffort: 42.35021223503435,
                coupleShare: 0.027972110053537814,
                pushImpulse: 2.1380725870668282,
                effectVerdicts: { shipped: false, contactOnly: false },
                followCap: false,
                passes: 3,
                firmness: 0.29861664015148576,
                sigma: 0.3375,
            });
        },
    );
});

/** A stub practised run reading only `events`, `flags` and the striker's first face contact at 10 ms. */
function stubRun(
    striker: BallId,
    events: readonly ImpactEvent[],
    flags: readonly FollowFlag[] = [],
): { readonly result: ImpactResult; readonly follow: FollowThrough } {
    const face = { start: 0.01, end: 0.011, peakForce: 1 };
    const result = { events, timeline: { [faceKey(striker)]: [face] } } as unknown as ImpactResult;
    return { result, follow: { flags } as unknown as FollowThrough };
}

describe("the push map practises (P2b.2b.2c.3b.1 plan Task 7)", () => {
    const setup = mapSetup("half-roll", textBook("half-roll"), 0.5);
    const ON: OnPoint = { behind: 0.01, height: 0, lean: 0, holds: true };
    const OFF: OnPoint = { behind: -0.01, height: 0, lean: 0, holds: false };
    const NONE: FaultReport = { findings: [] };

    it("classes a practised stroke with a miss and a turf read as unpractised, the miss its reason", () => {
        const turf = stubRun(setup.striker, [{ kind: "turf-yield", t: 0 }]);
        expect(runClass(setup, turf, NONE, ON, "turf-yield")).toEqual({ klass: "unpractised", reason: "turf-yield" });
        // In the band, or without a push (no miss), the turf read stands.
        expect(runClass(setup, turf, NONE, ON, null)).toEqual({ klass: "turf", reason: "turf-yield" });
    });

    it("classes a practised stroke with a miss and a mishit read as unpractised", () => {
        const miss = "off point: lean";
        expect(runClass(setup, stubRun(setup.striker, []), NONE, OFF, miss)).toEqual({
            klass: "unpractised",
            reason: miss,
        });
    });

    it("keeps a class practice cannot fix: superhuman and unlawful are not unpractised", () => {
        const grip = stubRun(setup.striker, [{ kind: "grip-limit", t: 0, hand: "top" }]);
        expect(runClass(setup, grip, NONE, ON, "turf-yield").klass).toBe("superhuman");
        const unlawful = { findings: [{ law: "29.1.6.1" }] } as unknown as FaultReport;
        expect(runClass(setup, stubRun(setup.striker, []), unlawful, ON, "turf-yield").klass).toBe("unlawful");
    });

    it("records the passes of a played sample, and none of an unplayed one", () => {
        const played = playSample("half-roll", textBook("half-roll"), 0.5, [10]);
        expect(played.passes).toBeGreaterThanOrEqual(1);
        expect(played.passes).toBeLessThanOrEqual(PRACTICE_PASSES);
        expect(playSample("half-roll", { ...textBook("half-roll"), feet: 2 }, 0.5, [10]).passes).toBe(0);
    });
});
