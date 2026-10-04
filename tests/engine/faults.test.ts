import { describe, expect, it } from "vitest";
import { JUDGED_LAWS, judgeFaults, type FaultReport, type StrokeContext } from "../../src/engine/faults";
import { ZERO } from "../../src/engine/math/vec3";
import { IDENTITY } from "../../src/engine/impact/rigidBody";
import type { ContactInterval, ImpactEvent, ImpactResult } from "../../src/engine/impact/types";
import type { BallStates } from "../../src/engine/types";
import { lawsReference, type FaultLawKey } from "../../src/reference/index";
import { ballAt } from "./support/fixtures";

/** A time unit for hand-built timelines (s). */
const T = 1e-4;
const ALL: BallStates = { blue: ballAt(5, 5), red: ballAt(6, 5), black: ballAt(7, 5), yellow: ballAt(8, 5) };

function iv(start: number, end: number, peakForce = 100, clearanceAfter?: number): ContactInterval {
    return clearanceAfter === undefined ? { start, end, peakForce } : { start, end, peakForce, clearanceAfter };
}

/** A hand-built impact: the given timeline, touching pairs, events and penetrations; all four balls present. */
function impact(over: {
    timeline?: Record<string, readonly ContactInterval[]>;
    touchingAtStart?: readonly string[];
    events?: readonly ImpactEvent[];
    peakPenetration?: Record<string, number>;
    balls?: BallStates;
}): ImpactResult {
    const balls = over.balls ?? ALL;
    return {
        balls,
        head: { position: ZERO, orientation: IDENTITY, velocity: ZERO, angularVelocity: ZERO },
        duration: 100 * T,
        events: over.events ?? [],
        peakPenetration: over.peakPenetration ?? {},
        steps: 2000,
        timeline: over.timeline ?? {},
        touchingAtStart: over.touchingAtStart ?? [],
        handover: balls,
        overlapCorrection: 0,
    };
}

const SINGLE: StrokeContext = {
    striker: "blue",
    kind: "single-ball",
    live: ["red", "black", "yellow"],
    hampered: false,
    jumpAttempt: false,
    group: false,
};
const DEAD: StrokeContext = { ...SINGLE, live: [] };
const CROQUET: StrokeContext = { ...SINGLE, kind: "croquet", croqueted: "red", live: [] };

const laws = (report: FaultReport): string[] => report.findings.map((f) => `${f.law} ${f.tier}`);

describe("judgeFaults: one positive and one negative case per row", () => {
    it("29.1.8: the striker's ball touches an upright while the mallet is in contact", () => {
        const hit = impact({ timeline: { "face/blue": [iv(0, 6 * T)], "blue@1/a": [iv(5 * T, 8 * T, 40)] } });
        expect(laws(judgeFaults(SINGLE, hit))).toEqual(["29.1.8 fault"]);
        expect(judgeFaults(SINGLE, hit).findings[0]).toMatchObject({ ball: "blue", t: 5 * T });
        const after = impact({ timeline: { "face/blue": [iv(0, 6 * T)], "blue@1/a": [iv(6 * T, 8 * T)] } });
        expect(laws(judgeFaults(SINGLE, after))).toEqual([]);
    });

    it("29.1.9: struck while touching an upright that then carries force during the contact (with 29.1.8)", () => {
        const into = impact({
            touchingAtStart: ["blue@1/a"],
            timeline: { "face/blue": [iv(0, 6 * T)], "blue@1/a": [iv(T, 3 * T, 50)] },
        });
        expect(laws(judgeFaults(SINGLE, into))).toEqual(["29.1.8 fault", "29.1.9 fault"]);
        const away = impact({ touchingAtStart: ["blue@1/a"], timeline: { "face/blue": [iv(0, 6 * T)] } });
        expect(laws(judgeFaults(SINGLE, away))).toEqual([]);
        const unloaded = impact({
            touchingAtStart: ["blue@1/a"],
            timeline: { "face/blue": [iv(0, 6 * T)], "blue@1/a": [iv(T, 2 * T, 0)] },
        });
        expect(laws(judgeFaults(SINGLE, unloaded))).toEqual(["29.1.8 fault"]);
    });

    it("29.1.11: the mallet touches a ball other than the striker's", () => {
        const touched = impact({ timeline: { "face/blue": [iv(0, 2 * T)], "face/red": [iv(T, 3 * T, 30)] } });
        expect(laws(judgeFaults(SINGLE, touched))).toEqual(["29.1.11 fault"]);
        expect(judgeFaults(SINGLE, touched).findings[0]).toMatchObject({
            ball: "red",
            t: T,
            evidence: { peakForce: 30 },
        });
        expect(laws(judgeFaults(SINGLE, impact({ timeline: { "face/blue": [iv(0, 2 * T)] } })))).toEqual([]);
    });

    it("29.1.13: a croquet stroke that fails to move the croqueted ball", () => {
        const base = { touchingAtStart: ["blue/red"], timeline: { "face/blue": [iv(0, 2 * T)] } };
        const still = impact({ ...base, peakPenetration: { "blue/red": 5e-10 } });
        expect(laws(judgeFaults(CROQUET, still))).toEqual(["29.1.13 fault"]);
        expect(judgeFaults(CROQUET, still).findings[0]).toMatchObject({ ball: "red", t: 100 * T });
        expect(laws(judgeFaults(CROQUET, impact(base)))).toEqual(["29.1.13 fault"]);
        const moved = impact({
            touchingAtStart: ["blue/red"],
            timeline: { "face/blue": [iv(0, 2 * T)], "blue/red": [iv(0, 3 * T)] },
            peakPenetration: { "blue/red": 2e-3 },
        });
        expect(laws(judgeFaults(CROQUET, moved))).toEqual([]);
    });

    it("29.1.6.2 fault: a single-ball stroke with two mallet contacts", () => {
        const twice = impact({ timeline: { "face/blue": [iv(0, 2 * T, 100, 1e-4), iv(5 * T, 7 * T)] } });
        const report = judgeFaults(SINGLE, twice);
        expect(laws(report)).toEqual(["29.1.6.2 fault"]);
        expect(report.findings[0]).toMatchObject({ t: 5 * T, evidence: { contacts: 2, clearance1: 1e-4 } });
        expect(report.findings[0]?.evidence.gap1).toBeCloseTo(3 * T, 15);
        expect(laws(judgeFaults(SINGLE, impact({ timeline: { "face/blue": [iv(0, 2 * T)] } })))).toEqual([]);
    });

    it("29.1.6.2 possible fault: the head still closing on the striker's ball when the impact ends", () => {
        const approaching: ImpactEvent = { kind: "impact-head-approaching", t: 100 * T, ball: "blue" };
        const closing = impact({ timeline: { "face/blue": [iv(0, 2 * T)] }, events: [approaching] });
        expect(laws(judgeFaults(SINGLE, closing))).toEqual(["29.1.6.2 possible-fault"]);
        const other = impact({
            timeline: { "face/blue": [iv(0, 2 * T)] },
            events: [{ ...approaching, ball: "red" }],
        });
        expect(laws(judgeFaults(SINGLE, other))).toEqual([]);
        const afterRoquet = impact({
            timeline: { "face/blue": [iv(0, 2 * T)], "blue/red": [iv(3 * T, 4 * T)] },
            events: [approaching],
        });
        expect(laws(judgeFaults(SINGLE, afterRoquet))).toEqual([]);
    });

    it("29.1.7 possible fault: the mallet still in contact when the striker's ball hits a dead ball", () => {
        const hit = impact({ timeline: { "face/blue": [iv(0, 6 * T)], "blue/red": [iv(4 * T, 7 * T)] } });
        const report = judgeFaults(DEAD, hit);
        expect(laws(report)).toEqual(["29.1.7 possible-fault"]);
        expect(report.findings[0]?.t).toBe(4 * T);
        expect(report.findings[0]?.evidence.contactBefore).toBeCloseTo(4 * T, 15);
        expect(report.findings[0]?.evidence.contactAfter).toBeCloseTo(2 * T, 15);
        expect(laws(judgeFaults(SINGLE, hit))).toEqual([]);
        const touching = impact({
            touchingAtStart: ["blue/red"],
            timeline: { "face/blue": [iv(0, 6 * T)], "blue/red": [iv(0, 7 * T)] },
        });
        expect(laws(judgeFaults({ ...DEAD, kind: "continuation-touching" }, touching))).toEqual([]);
        const croquet = impact({
            touchingAtStart: ["blue/red"],
            timeline: { "face/blue": [iv(0, 6 * T)], "blue/red": [iv(0, 7 * T)] },
            peakPenetration: { "blue/red": 2e-3 },
        });
        expect(laws(judgeFaults(CROQUET, croquet))).toEqual([]);
    });

    it("29.1.6.1 possible fault: two mallet contacts in a croquet stroke or a continuation while touching", () => {
        const twice = impact({
            touchingAtStart: ["blue/red"],
            timeline: { "face/blue": [iv(0, 2 * T, 100, 1e-4), iv(5 * T, 7 * T)], "blue/red": [iv(0, 6 * T)] },
            peakPenetration: { "blue/red": 2e-3 },
        });
        const report = judgeFaults(CROQUET, twice);
        expect(laws(report)).toEqual(["29.1.6.1 possible-fault"]);
        expect(report.findings[0]?.evidence).toMatchObject({ contacts: 2, clearance1: 1e-4 });
        expect(laws(judgeFaults({ ...DEAD, kind: "continuation-touching" }, twice))).toEqual([
            "29.1.6.1 possible-fault",
        ]);
        const once = impact({
            touchingAtStart: ["blue/red"],
            timeline: { "face/blue": [iv(0, 2 * T)], "blue/red": [iv(0, 6 * T)] },
            peakPenetration: { "blue/red": 2e-3 },
        });
        expect(laws(judgeFaults(CROQUET, once))).toEqual([]);
    });

    it("29.1.5: a first contact at the rim in a stroke of Law 29.2.3", () => {
        const rim: ImpactEvent = { kind: "impact-off-face", t: 0, ball: "blue" };
        const atRim = impact({ timeline: { "face/blue": [iv(0, 3 * T)] }, events: [rim] });
        for (const flag of ["hampered", "jumpAttempt", "group"] as const) {
            expect(laws(judgeFaults({ ...SINGLE, [flag]: true }, atRim)), flag).toEqual(["29.1.5 fault"]);
        }
        expect(laws(judgeFaults(SINGLE, atRim))).toEqual([]);
        const laterRim = impact({ timeline: { "face/blue": [iv(0, 3 * T)] }, events: [{ ...rim, t: 2 * T }] });
        expect(laws(judgeFaults({ ...SINGLE, hampered: true }, laterRim))).toEqual([]);
    });
});

describe("judgeFaults: the commentary's roquet sequences (C29.20.4), R = blue, K = red (live), object = 1/a", () => {
    const cases: [
        string,
        Record<string, readonly ContactInterval[]>,
        string[],
        { live?: StrokeContext["live"]; touchingAtStart?: readonly string[] }?,
    ][] = [
        [
            "C29.20.4.1: mallet, mallet, roquet — fault",
            { "face/blue": [iv(0, T), iv(2 * T, 3 * T)], "blue/red": [iv(4 * T, 5 * T)] },
            ["29.1.6.2 fault"],
        ],
        [
            "C29.20.4.2: mallet, roquet, mallet — no fault",
            { "face/blue": [iv(0, T), iv(4 * T, 5 * T)], "blue/red": [iv(2 * T, 3 * T)] },
            [],
        ],
        [
            "C29.20.4.3: mallet, roquet, object, mallet — fault",
            {
                "face/blue": [iv(0, T), iv(6 * T, 7 * T)],
                "blue/red": [iv(2 * T, 3 * T)],
                "blue@1/a": [iv(4 * T, 5 * T)],
            },
            ["29.1.6.2 fault"],
        ],
        [
            "C29.20.4.4: mallet, roquet, mallet, object — no fault",
            {
                "face/blue": [iv(0, T), iv(4 * T, 5 * T)],
                "blue/red": [iv(2 * T, 3 * T)],
                "blue@1/a": [iv(6 * T, 7 * T)],
            },
            [],
        ],
        [
            "C29.20.4.5: mallet, object, roquet, mallet — no fault",
            {
                "face/blue": [iv(0, T), iv(6 * T, 7 * T)],
                "blue@1/a": [iv(2 * T, 3 * T)],
                "blue/red": [iv(4 * T, 5 * T)],
            },
            [],
        ],
        [
            "a mallet contact starting with the roquet is after it — no fault",
            { "face/blue": [iv(0, T), iv(2 * T, 3 * T)], "blue/red": [iv(2 * T, 3 * T)] },
            [],
        ],
        [
            "a mallet contact open when the roquet starts is one contact, before it; a later one is exempt — no fault",
            { "face/blue": [iv(0, 3 * T), iv(5 * T, 6 * T)], "blue/red": [iv(2 * T, 4 * T)] },
            [],
        ],
        [
            "an object starting with the roquet does not intervene — no fault",
            {
                "face/blue": [iv(0, T), iv(6 * T, 7 * T)],
                "blue/red": [iv(2 * T, 3 * T)],
                "blue@1/a": [iv(2 * T, 3 * T)],
            },
            [],
        ],
        [
            "an object starting with the second mallet contact does not intervene — 29.1.8 only, no 29.1.6.2",
            {
                "face/blue": [iv(0, T), iv(6 * T, 7 * T)],
                "blue/red": [iv(2 * T, 3 * T)],
                "blue@1/a": [iv(6 * T, 7 * T)],
            },
            ["29.1.8 fault"],
        ],
        [
            "the roquet is the earliest live ball; the other live ball is then an object — fault",
            {
                "face/blue": [iv(0, T), iv(6 * T, 7 * T)],
                "blue/black": [iv(2 * T, 3 * T)],
                "blue/red": [iv(4 * T, 5 * T)],
            },
            ["29.1.6.2 fault"],
            { live: ["red", "black"] },
        ],
        [
            "a live ball touching at t = 0 is not a roquet — fault",
            { "face/blue": [iv(0, T), iv(5 * T, 6 * T)], "blue/red": [iv(0, 3 * T)] },
            ["29.1.6.2 fault"],
            { touchingAtStart: ["blue/red"] },
        ],
        [
            "a second hit on the roqueted ball is not another object — no fault",
            { "face/blue": [iv(0, T), iv(6 * T, 7 * T)], "blue/red": [iv(2 * T, 3 * T), iv(4 * T, 5 * T)] },
            [],
        ],
        [
            "a hit on a dead ball after the roquet is another object — fault",
            {
                "face/blue": [iv(0, T), iv(6 * T, 7 * T)],
                "blue/red": [iv(2 * T, 3 * T)],
                "blue/black": [iv(4 * T, 5 * T)],
            },
            ["29.1.6.2 fault"],
        ],
    ];

    it.each(cases)("%s", (_label, timeline, expected, extra) => {
        const context: StrokeContext = { ...SINGLE, live: extra?.live ?? ["red"] };
        const hit = impact({ timeline, touchingAtStart: extra?.touchingAtStart });
        expect(laws(judgeFaults(context, hit))).toEqual(expected);
    });
});

describe("judgeFaults: 29.1.7 and the roquet exemption", () => {
    const context: StrokeContext = { ...SINGLE, live: ["red"] };

    it("is not exempt when the mallet contact was already open before the roquet", () => {
        const hit = impact({
            timeline: { "face/blue": [iv(0, 6 * T)], "blue/red": [iv(2 * T, 3 * T)], "blue/black": [iv(4 * T, 5 * T)] },
        });
        expect(laws(judgeFaults(context, hit))).toEqual(["29.1.7 possible-fault"]);
    });

    it("is not exempt when the dead ball is hit with the roquet but the contact opened before it", () => {
        const hit = impact({
            timeline: { "face/blue": [iv(0, 6 * T)], "blue/red": [iv(2 * T, 3 * T)], "blue/black": [iv(2 * T, 3 * T)] },
        });
        expect(laws(judgeFaults(context, hit))).toEqual(["29.1.7 possible-fault"]);
    });

    it("is exempt when the mallet contact, the roquet and the dead-ball hit all start together", () => {
        const hit = impact({
            timeline: {
                "face/blue": [iv(2 * T, 6 * T)],
                "blue/red": [iv(2 * T, 3 * T)],
                "blue/black": [iv(2 * T, 3 * T)],
            },
        });
        expect(laws(judgeFaults(context, hit))).toEqual([]);
    });

    it("judges a dead-ball hit when the striker is not the first ball", () => {
        const hit = impact({
            timeline: { "face/red": [iv(0, 6 * T)], "blue/red": [iv(2 * T, 3 * T)], "red/black": [iv(4 * T, 5 * T)] },
        });
        expect(laws(judgeFaults({ ...context, striker: "red", live: ["blue"] }, hit))).toEqual([
            "29.1.7 possible-fault",
        ]);
    });

    it("finds the roquet by the canonical pair key when the striker is not the first ball", () => {
        // A missed roquet would leave the second mallet contact unexempt: 29.1.6.2.
        const hit = impact({ timeline: { "face/red": [iv(0, T), iv(4 * T, 5 * T)], "blue/red": [iv(2 * T, 3 * T)] } });
        expect(laws(judgeFaults({ ...context, striker: "red", live: ["blue"] }, hit))).toEqual([]);
    });
});

describe("judgeFaults: other cases", () => {
    it("never makes a croquet-stroke re-contact a fault", () => {
        const twice = impact({
            touchingAtStart: ["blue/red"],
            timeline: { "face/blue": [iv(0, 2 * T), iv(3 * T, 4 * T), iv(6 * T, 7 * T)], "blue/red": [iv(0, 5 * T)] },
            peakPenetration: { "blue/red": 2e-3 },
            events: [{ kind: "impact-head-approaching", t: 100 * T, ball: "blue" }],
        });
        const report = judgeFaults(CROQUET, twice);
        expect(report.findings.filter((f) => f.tier === "fault")).toEqual([]);
        expect(laws(report)).toEqual(["29.1.6.1 possible-fault"]);
    });

    it("does not charge the striker with another ball's crush", () => {
        const other = impact({ timeline: { "face/blue": [iv(0, 6 * T)], "red@1/a": [iv(T, 5 * T)] } });
        expect(laws(judgeFaults(SINGLE, other))).toEqual([]);
    });

    it("judges a whiff: nothing in a single-ball stroke, 29.1.13 alone in a croquet stroke", () => {
        expect(laws(judgeFaults(SINGLE, impact({})))).toEqual([]);
        expect(laws(judgeFaults(CROQUET, impact({ touchingAtStart: ["blue/red"] })))).toEqual(["29.1.13 fault"]);
    });

    it("ignores a live ball that is not in the impact", () => {
        const two = impact({ balls: { blue: ALL.blue, red: ALL.red }, timeline: { "face/blue": [iv(0, 2 * T)] } });
        expect(laws(judgeFaults({ ...SINGLE, live: ["yellow"] }, two))).toEqual([]);
    });

    it("reports one 29.1.8 finding per obstacle", () => {
        const both = impact({
            timeline: { "face/blue": [iv(0, 6 * T)], "blue@1/a": [iv(T, 2 * T)], "blue@peg": [iv(3 * T, 4 * T)] },
        });
        expect(judgeFaults(SINGLE, both).findings.map((f) => [f.law, f.t])).toEqual([
            ["29.1.8", T],
            ["29.1.8", 3 * T],
        ]);
    });

    it("judges only Laws quoted in reference/laws.json", () => {
        for (const law of JUDGED_LAWS) {
            expect(lawsReference.faults[law as FaultLawKey].quote.length, law).toBeGreaterThan(0);
        }
    });
});

describe("judgeFaults: a context that does not fit the impact", () => {
    const two = impact({ balls: { blue: ALL.blue, red: ALL.red } });
    const cases: [string, StrokeContext, ImpactResult, RegExp][] = [
        ["a striker absent from it", { ...SINGLE, striker: "yellow", live: [] }, two, /striker yellow is not in/],
        [
            "a croquet stroke without a croqueted ball",
            { ...SINGLE, kind: "croquet", live: [] },
            two,
            /needs a croqueted/,
        ],
        ["the striker as the croqueted ball", { ...CROQUET, croqueted: "blue" }, two, /cannot be the striker blue/],
        ["a croqueted ball absent from it", { ...CROQUET, croqueted: "yellow" }, two, /croqueted ball yellow is not/],
        ["a croqueted ball in another kind", { ...SINGLE, croqueted: "red" }, two, /only for a croquet stroke/],
        ["the striker listed as live", { ...SINGLE, live: ["blue", "red"] }, two, /striker blue cannot be live/],
    ];

    it.each(cases)("throws for %s", (_label, context, result, message) => {
        expect(() => judgeFaults(context, result)).toThrow(RangeError);
        expect(() => judgeFaults(context, result)).toThrow(message);
    });
});
