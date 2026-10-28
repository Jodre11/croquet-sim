import { describe, expect, it } from "vitest";
import {
    FINISH_SPEED,
    FOLLOW_CAP,
    FOLLOW_SAMPLE,
    HEAD_DEEP_LIMIT,
    IMPACT_DT,
    finishKind,
    type FollowThrough,
    type ImpactProbe,
    type StrokeState,
} from "../../../src/engine/impact/integrate";
import { faceKey, headLowestPoint } from "../../../src/engine/impact/contacts";
import { simulateShot } from "../../../src/engine/shot";
import { simulateImpact, simulateStroke } from "../../../src/engine/impact/simulateImpact";
import { HAND_COUPLING, handsAt, pitchAxis, prepareTrack, type Push } from "../../../src/engine/impact/track";
import type { ContactState, TrackDrive } from "../../../src/engine/impact/types";
import { dot, length, sub } from "../../../src/engine/math/vec3";
import { buildContact } from "../../../src/engine/swing/buildContact";
import { ON_TIME } from "../../../src/engine/swing/profile";
import type { ShotSetup, StrokeType, SwingProfile } from "../../../src/engine/swing/types";
import type { World } from "../../../src/engine/types";
import { defaultWorld } from "../../../src/engine/world";
import { ballAt, testWorld } from "../support/fixtures";
import { TEST_GRIP_LIMIT } from "../support/impact";
import { backswingFor, canonicalSetup, testProfile } from "../support/shot";

const WORLD = testWorld();

/** A test-profile stroke at blue (5, 3), aim 0.4, 0.5 m back (about 3.1 m/s), on time. */
function shot(stroke: Partial<ShotSetup["stroke"]> = {}, profile: SwingProfile = testProfile()): ShotSetup {
    return {
        balls: { blue: ballAt(5, 3) },
        striker: "blue",
        stroke: {
            type: "single-ball",
            aim: 0.4,
            backswing: 0.5,
            drive: 0,
            contact: { up: 0, side: 0 },
            timing: ON_TIME,
            ...stroke,
        },
        live: [],
        continuation: false,
        hampered: false,
        jumpAttempt: false,
        lawnSpeed: 10,
        profile,
    };
}

/**
 * A carry with moving hands: half the backswing from the hands, a 0.15 m reach; 0.25 m back, about 3.45 m/s
 * (plannedSpeed): the pendulum's about 2.31 m/s plus the hands' about 1.14 m/s.
 */
const CARRY = testProfile({ drive: { handReach: 0.15 }, shape: { pendulumShare: 0.5, slopeHold: 1 } });

function stroke(setup: ShotSetup, world: World = WORLD, dt?: number) {
    const contact = buildContact(setup, world);
    return { contact, ...simulateStroke(contact, setup.balls, world, dt === undefined ? {} : { dt }) };
}

const rateOf = (contact: ContactState, s: StrokeState): number =>
    dot(s.head.angularVelocity, pitchAxis((contact.drive as TrackDrive).arc.aim));

const last = (follow: FollowThrough): StrokeState => follow.samples[follow.samples.length - 1] as StrokeState;

/** `setup` with its hands' grip limit at TEST_GRIP_LIMIT, far above any hand's force (P2b.2b.2b.3 plan decision 12). */
const unlimited = (setup: ShotSetup): ShotSetup => ({
    ...setup,
    profile: { ...setup.profile, body: { ...setup.profile.body, gripLimit: TEST_GRIP_LIMIT } },
});

describe("the follow-through (design §4)", () => {
    it("leaves the impact exactly as simulateImpact returns it", () => {
        for (const setup of [shot(), shot({ drive: -1 }), shot({ backswing: 0.25 }, CARRY)]) {
            const { contact, result } = stroke(setup);
            expect(result).toEqual(simulateImpact(contact, setup.balls, WORLD));
        }
    });

    it("samples the head every FOLLOW_SAMPLE from the impact's start, at the impact's end and at the finish", () => {
        const { contact, result, follow } = stroke(shot());
        expect(follow.impactEnd).toBe(result.duration);
        const first = follow.samples[0] as StrokeState;
        expect(first.t).toBe(0);
        expect(first.head.position).toEqual(contact.position);
        expect(follow.samples.some((s) => s.t === follow.impactEnd)).toBe(true);
        expect(last(follow).t).toBe(follow.finish);
        for (let i = 1; i < follow.samples.length; i++) {
            const gap = (follow.samples[i] as StrokeState).t - (follow.samples[i - 1] as StrokeState).t;
            expect(gap).toBeGreaterThan(0);
            expect(gap).toBeLessThanOrEqual(FOLLOW_SAMPLE + 1e-12);
        }
    });

    it("finishes a swing at the pendulum's apex: the first pitch rate at or below zero after the impact", () => {
        const { contact, follow } = stroke(shot());
        expect(follow.flags).toEqual([]);
        expect(follow.finish).toBeGreaterThan(follow.impactEnd);
        expect(rateOf(contact, last(follow))).toBeLessThanOrEqual(0);
        for (const s of follow.samples.filter((x) => x.t >= follow.impactEnd && x.t < follow.finish)) {
            expect(rateOf(contact, s), `t ${s.t}`).toBeGreaterThan(0);
        }
    });

    it("finishes at the impact's end, one sample there and no step after, when the finish is already reached", () => {
        // Review focus 5. A 2 kg ball and no guide effort: the 1 kg head rebounds off the ball and the hands do not
        // push it on, so its pitch rate is already below zero (about −0.55 rad/s) when the impact ends.
        const world = testWorld({ ball: { ...WORLD.ball, mass: 2 } });
        const { contact, follow } = stroke(
            shot({ backswing: 0.25 }, testProfile({ drive: { guideEffort: 0 } })),
            world,
        );
        expect(follow.flags).toEqual([]);
        expect(follow.finish).toBe(follow.impactEnd);
        expect(follow.samples.filter((s) => s.t >= follow.impactEnd)).toHaveLength(1);
        expect(rateOf(contact, last(follow))).toBeLessThanOrEqual(0);
    });

    it.fails("holds a stop's mallet still after the check, so it settles on the firm grip", () => {
        // User decision 2026-10-07 (Riches: the stop has "NO FOLLOW-THROUGH"): from the check's window's end, or the
        // impact's end if later, the pendulum is held and the hands grip firmly. The canonical GC stop's head still
        // sinks at 7.2e-3 m/s at the impact's end; the AC stop's impact ends 10.2 ms after the window. Each settles
        // below FINISH_SPEED relative to the hands within the firm grip's period: 88 ms and 21.9 ms after the hold.
        // P2b.2b.2c.2d: the AC stop's figures at its 5° lean and 22.5 mm contact, the head resting on the turf from
        // 16.5 ms (was 11.6 ms and 32 ms at 4° and 20 mm, where the head stayed clear).
        // The hands at TEST_GRIP_LIMIT, so that the hold alone is pinned; the default limit's case follows.
        // P2b.2b.2c.3a: one law after contact (was no flag on either stop, the GC stop finishing 84 ms after its
        // impact's end and the AC stop 21.9 ms). The GC stop now meets the hold with its head moving on at 0.742 m/s
        // along aim (the check reaches it late through the chains) and finishes 43.3 ms after its impact's end. The
        // AC stop's loose hands (γ_T = g_B = 0.1) now feed a tenth of the head's weight and flex at a tenth of the
        // gain, so its head sinks into the turf, 0.514 m/s down at the impact's end (turf-yield at 19.41 ms,
        // impact-head-deep at 19.95 ms), and on into the follow-through (follow-turf-yield and follow-head-deep),
        // which finishes 68.0 ms after the impact's end. For the gate (stage 2).
        // P2b.2b.2c.3a gate stage 2: the hold's pitch impedance (was 43.3 ms and 68.0 ms): the GC stop finishes 16.3
        // ms after its impact's end and the AC stop 94.0 ms.
        // P2b.2b.2c.3a gate stage 2: the AC stop's grip retune (was follow-turf-yield and follow-head-deep, 94.0 ms):
        // with the hands together (γ_T 1, g_B 0.1) the AC stop's head neither yields the turf nor passes the depth
        // limit, its impact ending at 20.00 ms, and it finishes 136.6 ms after the impact's end, with no flag.
        // Marked until a P2b.2b.2c.3b item, softening the hold's onset (gate stage 2 ruling 2026-10-28, keeping the
        // 1.5·T bound): the AC stop's head enters the hold pitching at −1.449 rad/s with one hand's breadth (88 mm)
        // of lever between the hands, and settles in 136.6 ms against 120 ms.
        const world = defaultWorld();
        const flags = { "stop-gc": [], "stop-ac": [] } as const;
        for (const type of ["stop-gc", "stop-ac"] as const) {
            const { contact, follow } = stroke(unlimited(canonicalSetup(type, { world })), world);
            expect(follow.flags, type).toEqual(flags[type]);
            expect(follow.finish, type).toBeGreaterThan(follow.impactEnd);
            expect(follow.finish - follow.impactEnd, type).toBeLessThan(1.5 * HAND_COUPLING.period);
            const plan = prepareTrack(contact.drive as TrackDrive, contact.head, world.gravity);
            const end = last(follow);
            expect(length(sub(end.head.velocity, handsAt(plan, end.t).velocity)), type).toBeLessThan(FINISH_SPEED);
        }
    });

    it("holds the GC stop's mallet within the default grip limit (P2b.2b.2b.3 design §5)", () => {
        // P2b.2b.2c.2d: the minimum-jerk pulse (was ["follow-grip-limit"], hold peak |top| 434.3 N → 30.3 N; |bottom|
        // 435 N → 17.3 N, against F_max = 435 N, Young et al. 2009). The pulse ends at α = 0, so the head reaches the
        // hold at rest with the hands, where the box's α stepped from −360 rad/s² to 0 and the grip had to stop it.
        const world = defaultWorld();
        const { follow } = stroke(canonicalSetup("stop-gc", { world }), world);
        expect(follow.flags).toEqual([]);
    });

    it("flags a grip limit reached in the GC stop's follow-through (P2b.2b.2b.3 design §5)", () => {
        // The default limit is no longer reached (above), so the flag's path is pinned with the profile's limit
        // lowered to 20 N, below the follow-through's peak hand force of 30.3 N.
        // P2b.2b.2c.3a gate stage 2: the hold's pitch impedance (was a finish at 368 ms on a swing's apex, the head
        // still swinging at up to 0.51 m/s). The hold's pitch couple, bounded by the 20 N grip's couple (7.1 N·m),
        // settles the head: it finishes at 420 ms, flags unchanged.
        const world = defaultWorld();
        const setup = canonicalSetup("stop-gc", { world });
        const limited = { ...setup, profile: { ...setup.profile, body: { ...setup.profile.body, gripLimit: 20 } } };
        const { follow } = stroke(limited, world);
        expect(follow.flags).toEqual(["follow-grip-limit"]);
    });

    it("finishes a carry at its first apex after the pendulum phase starts", () => {
        const { contact, follow } = stroke(shot({ backswing: 0.25 }, CARRY));
        const push = prepareTrack(contact.drive as TrackDrive, contact.head, WORLD.gravity).push as Push;
        expect(push.pendulum).not.toBeNull();
        expect(follow.finish).toBeGreaterThan(push.pendulum as number);
        expect(follow.flags).not.toContain("follow-cap");
    });

    it("caps a carry whose hands never stop", () => {
        // Review focus 5: a 10 m push reaches its pendulum point (8 m) only after REACH_SEARCH (0.5 s), so the
        // pendulum phase never starts and the carry never finishes. The hands' arc must exceed the push
        // (P2b.2b.2b.2b), so its radius is 11 m, as levelArc's.
        const endless = testProfile({
            drive: { handReach: 10, handArcRadius: 11 },
            shape: { pendulumShare: 0.5, slopeHold: 1 },
        });
        // P2b.2b.2b.3: the turf strike (was ["follow-cap"]): the endless carry's head drags on the turf for the
        // follow-through's second, its columns yield and it sinks past HEAD_DEEP_LIMIT, so follow-turf-yield and
        // follow-head-deep are flagged before the cap. Unpredicted, for the gate.
        const { contact, follow } = stroke(shot({ backswing: 0.25 }, endless));
        expect(follow.flags).toEqual(["follow-turf-yield", "follow-head-deep", "follow-cap"]);
        const contactAt = (contact.drive as TrackDrive).arc.contactAt;
        expect(follow.finish).toBeGreaterThanOrEqual(contactAt + FOLLOW_CAP);
        expect(follow.finish).toBeLessThan(contactAt + FOLLOW_CAP + 1e-5);
        // P2b.2b.2b.3: the head–turf law over a second of dragging costs about 30 s (was 1 s).
    }, 240_000);

    // P2b.2b.2b.2b: gate-ruled skip (round 14, 2026-10-12). A dip is part of trackEnd; a late dip lengthens the impact
    // and drives the head deep inside it (this setup: impact-head-deep, 5.4 mm, and the follow-through finishes at the
    // impact's end), never in the follow-through. On the flex no test-profile carry drives the follow-through past
    // 2 × HEAD_DEEP_LIMIT: the pendulum phase at any pendulumAt or effort tried reaches at most 0.31 mm into the turf.
    // On this file's world the canonical full roll's pendulum phase swings its head into the turf 1.95 mm deep, short
    // of HEAD_DEEP_LIMIT (it was 2.04 mm, follow-head-deep, before the push intent). With the push intent this
    // setup still digs inside the impact: impact-head-deep, 5.84 mm at 126 ms (was 5.4 mm). With the hands' mass and
    // grip tissue (gate round 2) it still does: impact-head-deep from 108.7 ms, 5.48 mm deep, and the full roll's
    // follow-through on this world reaches 1.79 mm into the turf. With each hand–arm chain (gate round 3) the setup
    // digs inside the impact (impact-head-deep from 111.8 ms, 4.15 mm) and its follow-through is flagged too; the full
    // roll's follow-through on this world reaches 1.71 mm. P2b.2b.2b.2b: posture-holding push (was 1.71 mm): the setup
    // is unchanged (its test profile has no posture hold), and the full roll's follow-through reaches 1.56 mm.
    // P2b.2b.2b.2b: hold relaxes from the first departure (was 1.56 mm): the full roll's follow-through reaches
    // 1.08 mm. P2b.2b.2b.2b: flex, gate ruling 2026-10-12 (the gate accepted at 7843e2b): the setup still digs inside
    // the impact (impact-head-deep from 111.8 ms, 4.15 mm). Kept skipped. A planned dip is part of trackEnd, so the
    // impact lasts through it and the dip always lands inside the impact; no setup on this file's world, at
    // 2 × HEAD_DEEP_LIMIT, digs in the follow-through alone, which is the case this test needs.
    it.skip("flags a follow-through that drives the head deep, not the impact", () => {
        // A deep, late dip: the hands lower 0.2 m over 50 ms from 100 ms, long after the ball has gone. The turf and
        // the compliant hands hold the head well above that path, but a planned dig far outside play presses it past
        // 2 × HEAD_DEEP_LIMIT (P2b.2b.2b.2b: the carry's descent, which this test drove, is gone with groundDepth).
        const deep = testProfile({
            drive: { handReach: 0.15, handDrop: 0.2, dropTime: 0.05 },
            shape: { pendulumShare: 0.5, slopeHold: 1 },
        });
        const late = { arc: 0, hands: 0, dip: 0.1 };
        const { contact, result, follow } = stroke(shot({ backswing: 0.25, timing: late }, deep));
        expect(follow.flags).toContain("follow-head-deep");
        expect(result.events.map((e) => e.kind)).not.toContain("impact-head-deep");
        const deepest = Math.min(...follow.samples.map((s) => headLowestPoint(s.head, contact.head)));
        expect(deepest).toBeLessThan(0 - 2 * HEAD_DEEP_LIMIT);
    });

    it("converges in dt: the swing's finish time and pose", () => {
        const at = (dt: number) => {
            const { follow } = stroke(shot(), WORLD, dt);
            return { finish: follow.finish, position: last(follow).head.position };
        };
        const [a, b, c] = [at(1e-5), at(5e-6), at(2.5e-6)];
        const coarse = Math.abs(a.finish - b.finish);
        const fine = Math.abs(b.finish - c.finish);
        // First order: halving dt about halves the change; the finish is also quantised to a step.
        expect(fine).toBeLessThanOrEqual(Math.max(0.75 * coarse, 2e-5));
        expect(length(sub(b.position, c.position))).toBeLessThan(1e-3);
    });

    it("refuses a force table", () => {
        const { contact } = stroke(shot());
        const samples = [{ t: 0, force: contact.velocity }];
        const forced: ContactState = { ...contact, drive: { kind: "force", samples } };
        expect(() => simulateStroke(forced, { blue: ballAt(5, 3) }, WORLD)).toThrow(/tracked drive/);
    });
});

describe("the finish from the inputs (P2b.2b.2c.3a A2 item 7)", () => {
    const DEFAULT = defaultWorld();
    /** The prepared plan of `setup` on the default world, its table through the pulse only: no read goes past it. */
    const planOf = (setup: ShotSetup) => {
        const contact = buildContact(setup, DEFAULT);
        return prepareTrack(contact.drive as TrackDrive, contact.head, DEFAULT.gravity, false);
    };

    it("names each preset's finish by its inputs, not its type", () => {
        // A brake (α < 0) takes the check's hold; else a push the carried finish; else the free swing. The stops brake
        // at their canonical drive, the rolls push, and single-ball and the drive do neither.
        const expected: Readonly<Record<StrokeType, string>> = {
            "single-ball": "swing",
            drive: "swing",
            "stop-ac": "check",
            "stop-gc": "check",
            "half-roll": "carry",
            "full-roll": "carry",
            "pass-roll": "carry",
        };
        for (const [type, kind] of Object.entries(expected) as [StrokeType, string][]) {
            expect(finishKind(planOf(canonicalSetup(type))), type).toBe(kind);
        }
        expect(finishKind(planOf(canonicalSetup("half-roll", { stroke: { drive: -1 } })))).toBe("check");
    });

    it("finishes a braked held stroke with the check's hold", () => {
        // The half roll at drive −1 brakes on a held slope (λ = 1) with a push: the check's hold waits for the push's
        // end, and holds the held path, which has no free table.
        const setup = canonicalSetup("half-roll", { stroke: { drive: -1 } });
        const push = planOf(setup).push as Push;
        expect(push.end).not.toBeNull();
        const { follow } = stroke(setup, DEFAULT);
        expect(follow.flags).not.toContain("follow-cap");
        expect(follow.finish).toBeGreaterThanOrEqual(push.end as number);
    });

    it("settles a braked drive on the hold, its hands one hand breadth apart, well before the cap", () => {
        // P2b.2b.2c.3a gate stage 2: the hold's pitch impedance. The drive's hands, 88 mm apart, gave the hold's two
        // grip springs so short a lever that the head swung in pitch about them, ±7 cm with a 0.9 s period and a
        // damping ratio near 0.08, and this off-centre run met the cap mid-swing at 0.42 m/s. The hold's own pitch
        // spring and damper, bounded by the grip's couple (0.25 × 435 N × 0.0879 m = 9.56 N·m), settle it: it finishes
        // at 658 ms, below FINISH_SPEED, and with no swing just before it. Accepted for the gate: 8 of the drive's 27
        // runs at drive −0.5 still cap on a slow sideways sway about the aim (a roll damper is recorded for 3b).
        const setup = canonicalSetup("drive", { world: DEFAULT, stroke: { drive: -1 } });
        const offCentre = { ...setup.stroke, contact: { up: setup.stroke.contact.up, side: 0.01 } };
        const aimed = { ...setup, stroke: offCentre };
        const braked = { ...aimed, stroke: { ...offCentre, backswing: backswingFor(aimed, 2, DEFAULT) } };
        const { contact, follow } = stroke(braked, DEFAULT);
        expect(follow.flags).not.toContain("follow-cap");
        expect(follow.finish).toBeLessThan((contact.drive as TrackDrive).arc.contactAt + FOLLOW_CAP);
        const plan = prepareTrack(contact.drive as TrackDrive, contact.head, DEFAULT.gravity);
        const relative = (s: StrokeState): number => length(sub(s.head.velocity, handsAt(plan, s.t).velocity));
        expect(relative(last(follow))).toBeLessThan(FINISH_SPEED);
        // A swing's apex passes FINISH_SPEED for an instant; a settled head stays near it for the samples before.
        for (const s of follow.samples.filter((x) => x.t >= follow.finish - 0.02)) {
            expect(relative(s), `t ${s.t}`).toBeLessThan(10 * FINISH_SPEED);
        }
    });
});

describe("the planned brake (P2b.2b.2c.2d design §4.1)", () => {
    const DEFAULT = defaultWorld();
    /** The AC stop at drive −1 with its brake begun `early` s before the planned contact. */
    const braked = (early: number): ShotSetup =>
        canonicalSetup("stop-ac", { stroke: { timing: { arc: 0 - early, hands: 0, dip: 0 } } });
    const leadOf = (s: ShotSetup): number => (buildContact(s, DEFAULT).drive as TrackDrive).arc.contactAt;

    /** The striker's first face–ball interval's start (s) and the head's speed along aim there (m/s). */
    function firstFace(setup: ShotSetup): { readonly t: number; readonly speed: number } {
        const contact = buildContact(setup, DEFAULT);
        const { aim } = (contact.drive as TrackDrive).arc;
        const speeds: number[] = [dot(contact.velocity, aim)];
        const probe: ImpactProbe = {
            step: (s) => {
                speeds.push(dot(s.head.velocity, aim));
            },
        };
        const impact = simulateImpact(contact, setup.balls, DEFAULT, { probe });
        const first = (impact.timeline[faceKey(setup.striker)] ?? [])[0];
        expect(first).toBeDefined();
        const start = (first as { readonly start: number }).start;
        return { t: start, speed: speeds[Math.round(start / IMPACT_DT)] as number };
    }

    it("plays a brake begun before contact end to end, meeting the ball slower and later", () => {
        // The AC stop at drive −1, its brake 10 ms early: the head arrives below its planned speed (the under-hit
        // emerges; it is not modelled).
        const setup = braked(0.01);
        const on = canonicalSetup("stop-ac");
        expect(firstFace(setup).speed).toBeLessThan(firstFace(on).speed);
        expect(firstFace(setup).t - leadOf(setup)).toBeGreaterThan(firstFace(on).t - leadOf(on));
    });

    it("relaxes the grips at the planned contact, not the meeting", () => {
        const c = buildContact(braked(0.01), DEFAULT);
        expect((c.drive as TrackDrive).coupling.relaxAt).toBe((c.drive as TrackDrive).arc.contactAt);
    });

    it("a brake that leaves no face contact ends, reported", { timeout: 30_000 }, () => {
        // Drive −1 begun 60 ms early stops the head short of the ball (traced: no face interval). The fault judge reads
        // a stroke with no face contact as an empty strike, and the state stays finite. P2b.2b.2c.3a: one law after
        // contact (was the cap at 0.51 s reporting it as `impact-no-strike`, the swing law's hands keeping the head
        // moving): the hands' flex lets the stopped head come to rest in the turf, 30.06 mm up, so the impact ends at
        // 321.6 ms reported as `impact-head-stopped` (P2b.2b.2b.3 design §4.6), before the cap.
        // P2b.2b.2c.3a gate stage 2: the AC stop's grip retune (was the default grip): the stroke takes the jab
        // variant's grip (bottom hand 0.45 m, both grips 0.1), which gives the figures above unchanged. At the hands
        // together and the firm top hand the brake never stops the head short: begun 60, 80, 100, 120 or 150 ms
        // (MAX_LEAD) early, the head meets the ball at 2.54–2.67 m/s.
        const setup = braked(0.06);
        const jab = {
            ...setup,
            stroke: { ...setup.stroke, grip: { bottom: 0.45, gripTension: 0.1, bottomGrip: 0.1 } },
        };
        const out = simulateShot(jab, DEFAULT);
        expect(out.impact.events.map((e) => e.kind)).toContain("impact-head-stopped");
        expect(out.impact.timeline[faceKey("blue")] ?? []).toEqual([]);
        expect(out.faults.strike).toEqual({ parted: null, taps: [], breaks: [], recontacts: [] });
        expect(out.faults.findings.map((f) => f.law)).not.toContain("29.1.6.1");
        expect(Number.isFinite(out.impact.head.position.z)).toBe(true);
    });
});
