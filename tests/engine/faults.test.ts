import { describe, expect, it } from "vitest";
import {
    groupReContacts,
    JUDGED_LAWS,
    judgeFaults,
    MERGE_SEPARATION,
    PARTING_BREAK,
    type FaultReport,
    type StrokeContext,
} from "../../src/engine/faults";
import { obstacleKey } from "../../src/engine/impact/contacts";
import { IMPACT_DT } from "../../src/engine/impact/integrate";
import { vec3, ZERO, type Vec3 } from "../../src/engine/math/vec3";
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

/** A face interval with the face's record: its impulse (N·s) and the ball's velocities (m/s) at its ends. */
function ivr(
    start: number,
    end: number,
    impulse: Vec3,
    before: Vec3,
    after: Vec3,
    clearanceAfter?: number,
): ContactInterval {
    return { ...iv(start, end, 100, clearanceAfter), impulse, velocities: { before, after } };
}

/** A hand-built impact: the given timeline, touching pairs, events and penetrations; all four balls present. */
function impact(over: {
    timeline?: Record<string, readonly ContactInterval[]>;
    touchingAtStart?: readonly string[];
    events?: readonly ImpactEvent[];
    peakPenetration?: Record<string, number>;
    balls?: BallStates;
    headTurfSlide?: number;
    duration?: number;
    /** Shorthand for a blue striker: its mallet contacts, and its pair with red (touching at the start). */
    face?: readonly ContactInterval[];
    pair?: readonly ContactInterval[];
}): ImpactResult {
    const balls = over.balls ?? ALL;
    const shorthand: Record<string, readonly ContactInterval[]> = {
        ...(over.face === undefined ? {} : { "face/blue": over.face }),
        ...(over.pair === undefined ? {} : { "blue/red": over.pair }),
    };
    return {
        balls,
        head: { position: ZERO, orientation: IDENTITY, velocity: ZERO, angularVelocity: ZERO },
        duration: over.duration ?? 100 * T,
        events: over.events ?? [],
        peakPenetration: over.peakPenetration ?? {},
        steps: 2000,
        timeline: { ...(over.timeline ?? {}), ...shorthand },
        touchingAtStart: over.touchingAtStart ?? (over.pair === undefined ? [] : ["blue/red"]),
        handover: balls,
        overlapCorrection: 0,
        ...(over.headTurfSlide === undefined ? {} : { headTurfSlide: over.headTurfSlide }),
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
        // P2b.2b.2c.2c: the balls part at 4T, before the re-contact at 5T (was 6T: that re-contact is now a tap within
        // the strike, reported, not flagged).
        const twice = impact({
            touchingAtStart: ["blue/red"],
            timeline: { "face/blue": [iv(0, 2 * T, 100, 1e-4), iv(5 * T, 7 * T)], "blue/red": [iv(0, 4 * T)] },
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

    it("is not exempt when the dead ball is hit after the roquet, though the contact opened with it", () => {
        const hit = impact({
            timeline: {
                "face/blue": [iv(2 * T, 6 * T)],
                "blue/red": [iv(2 * T, 3 * T)],
                "blue/black": [iv(4 * T, 5 * T)],
            },
        });
        expect(laws(judgeFaults(context, hit))).toEqual(["29.1.7 possible-fault"]);
    });

    it("is not exempt when a second live ball is hit after the roquet, though the contact opened with it", () => {
        const hit = impact({
            timeline: {
                "face/blue": [iv(2 * T, 6 * T)],
                "blue/red": [iv(2 * T, 3 * T)],
                "blue/black": [iv(4 * T, 5 * T)],
            },
        });
        expect(laws(judgeFaults({ ...context, live: ["red", "black"] }, hit))).toEqual(["29.1.7 possible-fault"]);
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

const CONTINUATION: StrokeContext = { ...DEAD, kind: "continuation-touching" };

/** Blue touching red, and black unless `blackTouching` is false; `hoop` is touched at the start. */
function threeBalls(over: {
    red: readonly ContactInterval[];
    black: readonly ContactInterval[];
    face: readonly ContactInterval[];
    hoop?: readonly ContactInterval[];
    blackTouching?: boolean;
}): ImpactResult {
    const hoopKey = obstacleKey("blue", "1/a");
    return impact({
        timeline: {
            "face/blue": over.face,
            "blue/red": over.red,
            "blue/black": over.black,
            ...(over.hoop === undefined ? {} : { [hoopKey]: over.hoop }),
        },
        touchingAtStart: [
            "blue/red",
            ...(over.blackTouching === false ? [] : ["blue/black"]),
            ...(over.hoop === undefined ? [] : [hoopKey]),
        ],
    });
}

describe("judgeFaults: the double tap within the strike (P2b.2b.2c.2c design §6)", () => {
    const croquet = CROQUET;
    const singleBall = SINGLE;
    const continuation = CONTINUATION;

    it("reports a re-contact before the balls part, and does not flag it", () => {
        const report = judgeFaults(
            croquet,
            impact({ face: [iv(0, 6e-4, 100, 3e-5), iv(9e-4, 1.6e-3)], pair: [iv(1e-4, 1.4e-3)] }),
        );
        expect(laws(report)).not.toContain("29.1.6.1 possible-fault");
        expect(report.strike?.parted).toBe(1.4e-3);
        expect(report.strike?.taps.map((t) => [t.start, t.clearanceAfter])).toEqual([
            [0, 3e-5],
            [9e-4, undefined],
        ]);
    });
    it("flags a re-contact after the balls part, as today, at its start", () => {
        const report = judgeFaults(
            croquet,
            impact({ face: [iv(0, 6e-4), iv(2e-3, 2.5e-3)], pair: [iv(1e-4, 1.4e-3)] }),
        );
        const f = report.findings.find((x) => x.law === "29.1.6.1");
        expect(f?.t).toBe(2e-3);
        expect(f?.evidence.afterParting).toBe(1);
        expect(f?.evidence.contacts).toBe(2);
    });
    it("flags a re-contact beginning at the parting", () => {
        // The design's boundary is "at or after" the parting.
        const report = judgeFaults(
            croquet,
            impact({ face: [iv(0, 6e-4), iv(1.4e-3, 2e-3)], pair: [iv(1e-4, 1.4e-3)] }),
        );
        expect(laws(report)).toContain("29.1.6.1 possible-fault");
    });
    it("places the parting at a break of one frame, not just under", () => {
        // A break shorter than PARTING_BREAK is no parting; the intervals either side are one. The
        // first interval ends at 2^-14 s, a dyadic time small enough that adding a break to it and subtracting it
        // again returns the break exactly, so the boundary is asserted without loosening a comparison.
        const end = 2 ** -14;
        const brk = PARTING_BREAK - 1e-9;
        const under = [iv(1e-5, end), iv(end + brk, 1.4e-3)];
        const at = [iv(1e-5, end), iv(end + PARTING_BREAK, 1.4e-3)];
        expect((under[1] as ContactInterval).start - end).toBe(brk);
        expect((at[1] as ContactInterval).start - end).toBe(PARTING_BREAK);
        const face = [iv(0, 4e-4), iv(8e-4, 1.2e-3)];
        const merged = judgeFaults(croquet, impact({ face, pair: under }));
        expect(merged.strike?.parted).toBe(1.4e-3);
        expect(merged.strike?.breaks).toEqual([brk]);
        expect(laws(merged)).not.toContain("29.1.6.1 possible-fault");
        expect(laws(judgeFaults(croquet, impact({ face, pair: at })))).toContain("29.1.6.1 possible-fault");
    });
    it.each([33, 37, 74, 172, 189, 1000])("parts at a break of one frame in step times, from step %i", (n) => {
        // The integrator's times are steps × IMPACT_DT, and 25 steps (one frame) after step n come out short of
        // PARTING_BREAK by rounding for each step listed but 1000; a break of one frame is still a parting.
        const frame = 25;
        expect(frame * IMPACT_DT).toBe(PARTING_BREAK);
        const pair = [iv(IMPACT_DT, n * IMPACT_DT), iv((n + frame) * IMPACT_DT, (n + frame + 100) * IMPACT_DT)];
        const face = [iv(0, 2e-5), iv((n + frame + 1) * IMPACT_DT, (n + frame + 20) * IMPACT_DT)];
        const report = judgeFaults(croquet, impact({ face, pair }));
        expect(report.strike?.parted).toBe(n * IMPACT_DT);
        expect(report.strike?.breaks).toEqual([]);
        expect(laws(report)).toContain("29.1.6.1 possible-fault");
    });
    it("judges as today when the balls never meet", () => {
        // With no interval there is no parting, so the rule falls back to flagging every second contact.
        const report = judgeFaults(croquet, impact({ face: [iv(0, 6e-4), iv(9e-4, 1.6e-3)], pair: [] }));
        expect(report.strike).toEqual({ parted: null, taps: [], breaks: [], recontacts: [] });
        expect(laws(report)).toContain("29.1.6.1 possible-fault");
    });
    it("parts at the impact's end when the balls never separate", () => {
        // closeTimeline ends the open interval at the duration.
        const report = judgeFaults(
            croquet,
            impact({ face: [iv(0, 6e-4), iv(9e-4, 1.6e-3)], pair: [iv(1e-4, 3e-3)], duration: 3e-3 }),
        );
        expect(report.strike?.parted).toBe(3e-3);
        expect(laws(report)).not.toContain("29.1.6.1 possible-fault");
    });
    it("parts a continuation stroke at the later first interval of the balls it touched", () => {
        // Blue touches red and black at the start; red parts at 1.0 ms, black at 1.5 ms.
        const report = judgeFaults(
            continuation,
            threeBalls({ red: [iv(0, 1e-3)], black: [iv(0, 1.5e-3)], face: [iv(0, 4e-4), iv(1.2e-3, 1.4e-3)] }),
        );
        expect(report.strike?.parted).toBe(1.5e-3);
        expect(laws(report)).not.toContain("29.1.6.1 possible-fault");
    });
    it("ignores a touching obstacle when placing the parting", () => {
        // Only ball pairs part (design §6): an upright touching at the start, its interval to 5 ms, does not delay the
        // parting.
        const report = judgeFaults(
            continuation,
            threeBalls({
                red: [iv(0, 1e-3)],
                black: [iv(0, 1.5e-3)],
                hoop: [iv(0, 5e-3)],
                face: [iv(0, 4e-4), iv(2e-3, 2.4e-3)],
            }),
        );
        expect(report.strike?.parted).toBe(1.5e-3);
        expect(laws(report)).toContain("29.1.6.1 possible-fault");
    });
    it("does not flag an exempt contact that begins after the parting", () => {
        // Blue, touching red, parts from it at 0.4 ms, then roquets live black at 0.6 ms with a face contact starting
        // with the roquet. That contact is exempt (29.2.4.1); only the exemption filter keeps it from being flagged.
        const report = judgeFaults(
            { ...continuation, live: ["black"] },
            threeBalls({
                red: [iv(0, 4e-4)],
                black: [iv(6e-4, 9e-4)],
                blackTouching: false,
                face: [iv(0, 2e-4), iv(6e-4, 8e-4)],
            }),
        );
        expect(report.strike?.parted).toBe(4e-4);
        expect(report.strike?.taps.map((t) => t.start)).toEqual([0]);
        expect(laws(report)).not.toContain("29.1.6.1 possible-fault");
    });
    it("filters an exempt contact before the rule applies, and leaves a single-ball report as it was", () => {
        // Blue, touching red, roquets live black at 0.3 ms; its face contact at 0.5 ms is then exempt (29.2.4.1) and is
        // neither a tap nor flagged, though red parts at 1.0 ms.
        const roquet = judgeFaults(
            { ...continuation, live: ["black"] },
            threeBalls({
                red: [iv(0, 1e-3)],
                black: [iv(3e-4, 9e-4)],
                blackTouching: false,
                face: [iv(0, 2e-4), iv(5e-4, 7e-4)],
            }),
        );
        expect(roquet.strike?.taps.map((t) => t.start)).toEqual([0]);
        expect(laws(roquet)).not.toContain("29.1.6.1 possible-fault");
        const single = judgeFaults(singleBall, impact({ face: [iv(0, 6e-4), iv(9e-4, 1.6e-3)], pair: [] }));
        expect(single.strike).toBeUndefined();
        expect("strike" in single).toBe(false);
        expect(laws(single)).toContain("29.1.6.2 fault");
    });
});

describe("judgeFaults: re-contacts after the parting (P2b.2b.2c.2d design §7)", () => {
    const croquet = CROQUET;
    const continuation = CONTINUATION;
    /** One degree (rad): the second re-contact turns the ball 1° from +y towards +x. */
    const deg = Math.PI / 180;
    const faces3 = [
        ivr(0, 6e-4, vec3(0, 0.4, 0), vec3(0, 0, 0), vec3(0, 2, 0), 1e-3),
        ivr(2e-3, 2.1e-3, vec3(0, 0.0128, 0), vec3(0, 2, 0), vec3(0, 2.03, 0), 5e-5),
        ivr(2.2e-3, 2.3e-3, vec3(0.0144, 0, 0), vec3(0, 2.03, 0), vec3(2.06 * Math.sin(deg), 2.06 * Math.cos(deg), 0)),
    ];

    it("reports each re-contact after the parting with its effect", () => {
        const report = judgeFaults(
            croquet,
            impact({
                pair: [iv(1e-4, 1.4e-3)],
                face: [
                    ivr(0, 6e-4, vec3(0, 0.4, 0), vec3(0, 0, 0), vec3(0, 2.5, 0)),
                    ivr(2e-3, 2.4e-3, vec3(0, 0.02, 0), vec3(0, 2.5, 0), vec3(0, 2.6, 0.0)),
                ],
            }),
        );
        const [r] = report.strike?.recontacts ?? [];
        expect(r?.afterParting).toBeCloseTo(6e-4, 15);
        expect(r?.speedChange).toBeCloseTo(0.04, 12);
        expect(r?.angleChange).toBe(0);
        expect(r?.fault).toBe(true);
    });
    it("flags exactly as before under the placeholders", () => {
        // Plan decision 11: every re-contact a fault, none merged; the finding is today's.
        const before = { face: [iv(0, 6e-4), iv(2e-3, 2.5e-3)], pair: [iv(1e-4, 1.4e-3)] };
        const f = judgeFaults(croquet, impact(before)).findings.find((x) => x.law === "29.1.6.1");
        expect(f).toEqual({
            law: "29.1.6.1",
            tier: "possible-fault",
            ball: "blue",
            t: 2e-3,
            evidence: { contacts: 2, gap1: 2e-3 - 6e-4, afterParting: 1 },
        });
    });
    it("treats a gap with no clearance as separation 0", () => {
        const report = judgeFaults(
            croquet,
            impact({ face: [iv(0, 6e-4), iv(2e-3, 2.5e-3)], pair: [iv(1e-4, 1.4e-3)] }),
        );
        expect(report.strike?.recontacts[0]?.separation).toBe(0);
    });
    it("flags a re-contact that sets a still ball moving", () => {
        const report = judgeFaults(
            croquet,
            impact({
                pair: [iv(1e-4, 1.4e-3)],
                face: [iv(0, 6e-4), ivr(2e-3, 2.4e-3, vec3(0, 0.01, 0), vec3(0, 0, 0), vec3(0, 0.2, 0))],
            }),
        );
        expect(report.strike?.recontacts[0]?.speedChange).toBe(Infinity);
        expect(report.strike?.recontacts[0]?.fault).toBe(true);
    });
    it("keeps the no-parting rule", () => {
        const report = judgeFaults(croquet, impact({ face: [iv(0, 6e-4), iv(9e-4, 1.6e-3)], pair: [] }));
        expect(report.strike?.recontacts).toEqual([]);
        expect(laws(report)).toContain("29.1.6.1 possible-fault");
    });
    it("judges a continuation stroke's re-contacts after its parting", () => {
        const report = judgeFaults(
            continuation,
            threeBalls({ red: [iv(0, 1e-3)], black: [iv(0, 1.5e-3)], face: [iv(0, 4e-4), iv(2e-3, 2.4e-3)] }),
        );
        expect(report.strike?.recontacts.map((r) => r.start)).toEqual([2e-3]);
    });
    it("drops an exempt contact before grouping", () => {
        // As the double tap's exempt case: blue roquets live black at 0.3 ms, so its 0.5 ms contact is exempt. The
        // hoop hit at 1.5 ms, an object hit after the roquet, ends the exemption (Law 29.2.4), so the 2.0 ms contact is
        // not exempt; the hoop's interval overlaps no face interval, so it raises no 29.1.8 or 29.1.9.
        const report = judgeFaults(
            { ...continuation, live: ["black"] },
            threeBalls({
                red: [iv(0, 1e-3)],
                black: [iv(3e-4, 9e-4)],
                hoop: [iv(1.5e-3, 1.6e-3)],
                blackTouching: false,
                face: [iv(0, 2e-4), iv(5e-4, 7e-4), iv(2e-3, 2.2e-3)],
            }),
        );
        expect(report.strike?.recontacts.map((r) => r.start)).toEqual([2e-3]);
        // Measured from the 0.2 ms contact's end: the exempt 0.5 ms one, dropped, would give 2e-3 − 7e-4.
        expect(report.strike?.recontacts[0]?.gap).toBe(2e-3 - 2e-4);
    });
    it("merges no contact across a gap whose clearance is below 0, at the placeholder", () => {
        // A plane clearance below 0 is the ball beside the face, past its edge: separation 0, not a closer ball, so at
        // MERGE_SEPARATION 0 the two contacts after the parting stay two re-contacts.
        const report = judgeFaults(
            croquet,
            impact({
                pair: [iv(1e-4, 1.4e-3)],
                face: [iv(0, 6e-4), iv(2e-3, 2.1e-3, 100, -1e-4), iv(2.3e-3, 2.4e-3)],
            }),
        );
        expect(MERGE_SEPARATION).toBe(0);
        expect(report.strike?.recontacts.map((r) => [r.start, r.intervals, r.separation])).toEqual([
            [2e-3, 1, 0],
            [2.3e-3, 1, 0],
        ]);
    });
    it("absorbs no contact after the parting into one before it", () => {
        // The 1.5 ms contact follows the 1.2 ms one, before the parting at 1.4 ms, across 0.05 mm, under the merge
        // separation; it is still reported as a re-contact of its own, with that separation.
        const faces = [iv(0, 6e-4), iv(1.2e-3, 1.3e-3, 100, 5e-5), iv(1.5e-3, 1.6e-3)];
        const groups = groupReContacts(faces, 1.4e-3, { mergeSeparation: 1e-4, effectSpeed: 0.05, effectAngle: 5 });
        expect(groups.map((r) => [r.start, r.intervals, r.separation])).toEqual([[1.5e-3, 1, 5e-5]]);
    });
    it("never counts the first contact as a re-contact, even after the parting", () => {
        // As today's rule, which judges only the contacts after the first: a lone contact beginning after the balls
        // part is the stroke's strike, not a second hit.
        const report = judgeFaults(croquet, impact({ face: [iv(2e-3, 2.5e-3)], pair: [iv(1e-4, 1.4e-3)] }));
        expect(report.strike?.recontacts).toEqual([]);
        expect(laws(report)).not.toContain("29.1.6.1 possible-fault");
    });
    it("groups micro-hits under the merge separation and judges the group's summed effect", () => {
        // The grouping with a nonzero threshold, through the seam the judge passes the laws' thresholds to. The two
        // contacts after the parting, 0.05 mm apart, are one re-contact; together they add 3 % to the ball's speed and
        // turn it 1°, inside 5 % and 5°.
        const groups = groupReContacts(faces3, 1.4e-3, { mergeSeparation: 1e-4, effectSpeed: 0.05, effectAngle: 5 });
        expect(groups).toHaveLength(1);
        expect(groups[0]?.intervals).toBe(2);
        expect(groups[0]?.separation).toBe(1e-3);
        expect(groups[0]?.speedChange).toBeCloseTo(0.03, 12);
        expect(groups[0]?.angleChange).toBeCloseTo(1, 9);
        expect(groups[0]?.impulse).toEqual(vec3(0.0144, 0.0128, 0));
        expect(groups[0]?.fault).toBe(false);
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

describe("judgeFaults: 29.1.13 'plays away from' and 29.1.14 (P2b.2b.1)", () => {
    const LINE = vec3(1, 0, 0);
    /** A swing direction `degrees` from the line of centres, built directly rather than through the engine's sinCos. */
    const towards = (degrees: number) =>
        vec3(Math.cos((degrees * Math.PI) / 180), Math.sin((degrees * Math.PI) / 180), 0);
    const pressed = impact({ peakPenetration: { "blue/red": 1e-4 } });

    it("finds a croquet stroke played at more than 90° to the line of centres, and not at less", () => {
        expect(laws(judgeFaults({ ...CROQUET, aim: towards(89.9), lineOfCentres: LINE }, pressed))).toEqual([]);
        const away = judgeFaults({ ...CROQUET, aim: towards(90.1), lineOfCentres: LINE }, pressed);
        expect(laws(away)).toEqual(["29.1.13 fault"]);
        expect(away.findings[0]).toMatchObject({ ball: "red", t: pressed.duration });
        expect(away.findings[0]?.evidence.angle).toBeCloseTo((90.1 * Math.PI) / 180, 12);
    });

    it("reports both 29.1.13 clauses, 'fails to move or shake' first", () => {
        const both = judgeFaults({ ...CROQUET, aim: towards(150), lineOfCentres: LINE }, impact({}));
        expect(both.findings.map((f) => [f.law, Object.keys(f.evidence)])).toEqual([
            ["29.1.13", ["peakPenetration"]],
            ["29.1.13", ["angle"]],
        ]);
    });

    it("leaves 'plays away from' unjudged without a swing", () => {
        expect(laws(judgeFaults(CROQUET, pressed))).toEqual([]);
    });

    it("ignores aim outside a croquet stroke", () => {
        expect(laws(judgeFaults({ ...SINGLE, aim: towards(120) }, impact({})))).toEqual([]);
    });

    it("29.1.14: the head in the turf in a stroke of Law 29.2.3 is a possible fault, with its evidence", () => {
        const dug = impact({
            timeline: { "face/blue": [iv(0, 2 * T)], "head/turf": [iv(3 * T, 9 * T, 40), iv(12 * T, 13 * T, 55)] },
            peakPenetration: { "head/turf": 4e-4 },
            headTurfSlide: 0.012,
        });
        for (const context of [
            { ...SINGLE, hampered: true },
            { ...SINGLE, jumpAttempt: true },
            { ...SINGLE, group: true },
        ]) {
            const report = judgeFaults(context, dug);
            expect(laws(report)).toEqual(["29.1.14 possible-fault"]);
            expect(report.findings[0]).toMatchObject({
                ball: "blue",
                t: 3 * T,
                evidence: { penetration: 4e-4, peakForce: 55, slide: 0.012 },
            });
        }
        expect(laws(judgeFaults(SINGLE, dug))).toEqual([]);
    });

    it("reports 29.1.14 after 29.1.13", () => {
        const dug = impact({ timeline: { "head/turf": [iv(0, T)] } });
        expect(laws(judgeFaults({ ...CROQUET, group: true }, dug))).toEqual([
            "29.1.13 fault",
            "29.1.14 possible-fault",
        ]);
    });

    it("rejects an aim or a line of centres that is not a horizontal unit vector, and an aim without its line", () => {
        expect(() => judgeFaults({ ...CROQUET, aim: vec3(1, 0, 0.1), lineOfCentres: LINE }, pressed)).toThrow(
            /aim must be a horizontal unit vector/,
        );
        expect(() => judgeFaults({ ...CROQUET, aim: LINE, lineOfCentres: vec3(2, 0, 0) }, pressed)).toThrow(
            /lineOfCentres must be a horizontal unit vector/,
        );
        expect(() => judgeFaults({ ...CROQUET, aim: LINE }, pressed)).toThrow(/needs its lineOfCentres/);
    });
});
