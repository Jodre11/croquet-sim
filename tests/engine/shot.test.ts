import { describe, expect, it } from "vitest";
import { judgeFaults } from "../../src/engine/faults";
import { IMPACT_DT, TRACK_IMPACT_CAP, type ImpactProbe, type ImpactSnapshot } from "../../src/engine/impact/integrate";
import { IDENTITY, rotate } from "../../src/engine/impact/rigidBody";
import { simulateImpact } from "../../src/engine/impact/simulateImpact";
import { effectiveMass, swungBody } from "../../src/engine/impact/track";
import type { ContactInterval, HeadState, ImpactResult, TrackDrive } from "../../src/engine/impact/types";
import { ZERO, add, cross, dot, horizontal, length, scale, sub, vec3, type Vec3 } from "../../src/engine/math/vec3";
import { simulateShot, strokeContext, type ShotOutcome } from "../../src/engine/shot";
import { simulateFreeMotion } from "../../src/engine/simulate";
import { MAX_LEAD, buildContact, planStroke, swingApproach } from "../../src/engine/swing/buildContact";
import type { SwingTrajectory } from "../../src/engine/swing/trajectory";
import { STROKE_TYPES, type ShotSetup } from "../../src/engine/swing/types";
import type { BallId, BallState, Hoop, World } from "../../src/engine/types";
import { defaultWorld, hoopHalfSpan, hoopLateral } from "../../src/engine/world";
import { recorder } from "./support/impact";
import { CANONICAL_STRIKER, GC_STOP_GAP, backswingFor, canonicalSetup } from "./support/shot";
import { POSITION_SLACK, boundaryJumps } from "./support/trajectory";

const WORLD = defaultWorld();
const R = WORLD.ball.radius;
const { x: X, y: Y } = CANONICAL_STRIKER;
const at = (x: number, y: number): BallState => ({ position: vec3(x, y, R), velocity: ZERO, angularVelocity: ZERO });

/** A hand-built impact for strokeContext: only the pairs touching at the start matter. */
function started(touchingAtStart: readonly string[]): ImpactResult {
    return {
        balls: {},
        head: { position: ZERO, orientation: IDENTITY, velocity: ZERO, angularVelocity: ZERO },
        duration: 0,
        events: [],
        peakPenetration: {},
        steps: 0,
        timeline: {},
        touchingAtStart,
        handover: {},
        overlapCorrection: 0,
    };
}

/** A canonical single-ball setup with red, black and yellow in a row beside blue, along +x. */
function withOthers(over: Partial<ShotSetup> = {}): ShotSetup {
    return {
        ...canonicalSetup("single-ball"),
        balls: { blue: at(X, Y), red: at(X + 2 * R, Y), black: at(X + 4 * R, Y), yellow: at(X + 6 * R, Y) },
        ...over,
    };
}

/** The canonical drive with the croqueted ball touching the striker, its line of centres `degrees` left of aim. */
function croquetAt(degrees: number): ShotSetup {
    const base = canonicalSetup("drive");
    const line = Math.PI / 2 + (degrees * Math.PI) / 180;
    return { ...base, balls: { ...base.balls, red: at(X + 2 * R * Math.cos(line), Y + 2 * R * Math.sin(line)) } };
}

/** The face–ball intervals of the striker's ball: its hits, over every region of the head (design §4.5). */
const hits = (impact: ImpactResult): readonly ContactInterval[] => impact.timeline["face/blue"] ?? [];

/** The striker's ball's speed at the end of the impact (m/s). */
const strikerSpeed = (impact: ImpactResult): number => length((impact.handover.blue as BallState).velocity);

/** The head's velocity along aim (+y) at the end of the impact (m/s). */
const headSpeed = (impact: ImpactResult): number => dot(impact.head.velocity, vec3(0, 1, 0));

/** The croqueted ball's distance to rest over the striker's (the coaching ratio, design §9). */
function ratio(setup: ShotSetup, outcome: ShotOutcome): number {
    const travelled = (id: BallId): number =>
        length(horizontal(sub(outcome.motion.rest[id] as Vec3, (setup.balls[id] as BallState).position)));
    return travelled("red") / travelled("blue");
}

/**
 * One stroke probed: the hands' and the turf's braking impulses along aim (design §3.7), from the end of the first
 * face–ball interval to the end of the impact, positive when they slow the head.
 */
function braking(setup: ShotSetup) {
    const probe = recorder();
    const impact = simulateImpact(buildContact(setup, WORLD), setup.balls, WORLD, { probe });
    const aim = vec3(0, 1, 0);
    const faceEnd = (hits(impact)[0] as ContactInterval).end;
    let hands = 0;
    let turf = 0;
    for (const s of probe.snapshots) {
        // A snapshot's t is its step's end; the step starting at faceEnd is the first after the interval.
        if (s.t <= faceEnd) {
            continue;
        }
        hands -= dot((s.hand as { force: Vec3 }).force, aim) * IMPACT_DT;
        turf -= dot(s.headTurf ?? ZERO, aim) * IMPACT_DT;
    }
    return { impact, hands, turf };
}

describe("strokeContext", () => {
    it("builds a croquet stroke's context: the croqueted ball, the swing and the line of centres", () => {
        const context = strokeContext(canonicalSetup("drive"), started(["blue/red"]));
        expect(context).toMatchObject({
            striker: "blue",
            kind: "croquet",
            croqueted: "red",
            live: [],
            hampered: false,
            jumpAttempt: false,
            group: false,
        });
        expect(length(sub(context.aim as Vec3, vec3(0, 1, 0)))).toBeLessThan(1e-12);
        expect(length(sub(context.lineOfCentres as Vec3, vec3(0, 1, 0)))).toBeLessThan(1e-12);
    });

    it("judges the GC stop as a single-ball stroke, its target live and GC_STOP_GAP ahead", () => {
        // User decision (2026-10-06): the GC stop is never a croquet stroke.
        const setup = canonicalSetup("stop-gc");
        const red = (setup.balls.red as BallState).position;
        expect(length(sub(red, vec3(X, Y + 2 * R + GC_STOP_GAP, R)))).toBeLessThan(1e-12);
        expect(setup.croqueted).toBeUndefined();
        const context = strokeContext(setup, started([]));
        expect(context).toMatchObject({ striker: "blue", kind: "single-ball", live: ["red"], group: false });
        expect(context.croqueted).toBeUndefined();
        expect(context.lineOfCentres).toBeUndefined();
    });

    it("tells a continuation while touching from a single-ball stroke", () => {
        expect(strokeContext(withOthers({ continuation: true }), started(["blue/red"])).kind).toBe(
            "continuation-touching",
        );
        expect(strokeContext(withOthers({ continuation: true }), started([])).kind).toBe("single-ball");
        expect(strokeContext(withOthers(), started(["blue/red"])).kind).toBe("single-ball");
    });

    it("finds the striker's ball in a 3-ball or 4-ball group, and not in a pair alone", () => {
        const s = withOthers();
        expect(strokeContext(s, started(["blue/red"])).group).toBe(false);
        expect(strokeContext(s, started(["blue/red", "red/black"])).group).toBe(true);
        expect(strokeContext(s, started(["blue/red", "blue/black"])).group).toBe(true);
        expect(strokeContext(s, started(["blue/red", "red/black", "black/yellow"])).group).toBe(true);
        expect(strokeContext(s, started(["red/black", "black/yellow"])).group).toBe(false);
        expect(strokeContext(s, started(["blue@1/a", "blue/red"])).group).toBe(false);
        expect(strokeContext(canonicalSetup("drive"), started(["blue/red"])).group).toBe(false);
    });

    it("copies live, hampered and jumpAttempt", () => {
        const setup = withOthers({ live: ["red", "yellow"], hampered: true, jumpAttempt: true });
        expect(strokeContext(setup, started([]))).toMatchObject({
            live: ["red", "yellow"],
            hampered: true,
            jumpAttempt: true,
        });
    });
});

describe("simulateShot", () => {
    it.each(STROKE_TYPES)("runs the %s canonical setup with no entry jump and no ball above R + 5 mm", (type) => {
        // Exit criterion 4. Prototype (pass 4, design §5.4 values), highest centre above R over the impact and the
        // flights: 0.85 mm single-ball, 0.93 drive, 4.17 stop-ac (the rising strike), 0.72 half roll, 0.82 full roll,
        // 2.92 pass roll; no entry jump anywhere (P2b.2b.1; Task 10 re-measures them). Pre-flight re-measures them,
        // and measures stop-gc on its target setup (its 0.81 mm was on the retired touching setup).
        const setup = canonicalSetup(type);
        const outcome = simulateShot(setup);
        expect(outcome.impact.entryJumps?.count).toBe(0);
        expect(hits(outcome.impact).length).toBeGreaterThan(0);
        expect(outcome.motion.aborted).toBe(false);
        let highest = 0;
        const probe: ImpactProbe = {
            step: (s) => {
                for (const ball of s.balls) {
                    highest = Math.max(highest, ball.position.z);
                }
            },
        };
        simulateImpact(outcome.contact, setup.balls, WORLD, { probe });
        for (const segments of Object.values(outcome.motion.segments)) {
            for (const { start } of segments ?? []) {
                const vz = start.velocity.z;
                highest = Math.max(highest, start.position.z + (vz > 0 ? (vz * vz) / (2 * WORLD.gravity) : 0));
            }
        }
        expect(highest).toBeLessThanOrEqual(R + 0.005);
    });

    it("runs each stage in turn, and hands phase 2 exactly the impact's handover", () => {
        const setup = canonicalSetup("half-roll");
        const outcome = simulateShot(setup);
        expect(outcome.contact).toEqual(buildContact(setup, WORLD));
        expect(outcome.approach).toEqual(swingApproach(outcome.contact));
        expect(outcome.impact).toEqual(simulateImpact(outcome.contact, setup.balls, WORLD));
        expect(outcome.context).toEqual(strokeContext(setup, outcome.impact));
        expect(outcome.faults).toEqual(judgeFaults(outcome.context, outcome.impact));
        expect(outcome.motion).toEqual(simulateFreeMotion(outcome.impact.handover, WORLD));
    });

    it("returns the plan's contact speed and approach", () => {
        const setup = canonicalSetup("half-roll");
        const outcome = simulateShot(setup);
        const plan = planStroke(setup, WORLD);
        expect(outcome.contactSpeed).toBe(plan.contactSpeed);
        expect(outcome.approach).toEqual(plan.approach);
    });

    it("returns the same impact with or without the trajectory (exit criterion 4)", () => {
        const setup = canonicalSetup("half-roll");
        const plain = simulateShot(setup);
        const traced = simulateShot(setup, undefined, { trajectory: true });
        expect(plain).not.toHaveProperty("trajectory");
        expect(traced.impact).toEqual(plain.impact);
        expect(traced.motion).toEqual(plain.motion);
        expect(traced.trajectory).toBeDefined();
    });

    it("lets a passed world win: lawnSpeed is then neither read nor checked", () => {
        // Spec §9 (user decision, 2026-10-06).
        const setup = { ...canonicalSetup("single-ball"), lawnSpeed: 0 };
        expect(() => simulateShot(setup)).toThrow(/lawnSpeed/);
        expect(simulateShot(setup, WORLD).motion.aborted).toBe(false);
    });

    it.each(STROKE_TYPES)("runs the %s canonical setup from the top to its finish (exit criterion 3)", (type) => {
        const outcome = simulateShot(canonicalSetup(type), WORLD, { trajectory: true });
        const trajectory = outcome.trajectory as SwingTrajectory;
        // Exit criterion 4's identity, on every canonical setup.
        const plain = simulateShot(canonicalSetup(type), WORLD);
        expect(outcome.impact).toEqual(plain.impact);
        expect(outcome.motion).toEqual(plain.motion);
        expect(trajectory.flags).not.toContain("follow-cap");
        expect(outcome.impact.entryJumps?.count).toBe(0);
        expect(trajectory.finish).toBeGreaterThanOrEqual(trajectory.impactEnd);
        const jumps = boundaryJumps(trajectory, outcome.contact.drive as TrackDrive);
        // The release, the impact's start (every canonical downswing outlasts its lead) and end, and a stop's hold.
        // The hold is never a seam of its own: the impact cannot end before the drive's windows have (integrate's
        // `driveEnd`), so holdFrom = max(window end, impactEnd) is the impact's end unless the impact caps.
        expect(jumps).toHaveLength(type === "stop-ac" || type === "stop-gc" ? 4 : 3);
        for (const jump of jumps) {
            expect(jump.position, jump.name).toBeLessThanOrEqual(POSITION_SLACK);
            expect(jump.velocity, jump.name).toBeLessThanOrEqual(jump.bound);
        }
    });

    it("judges 'plays away from' on a whole croquet stroke at 90.1° from the line of centres, not at 89.9°", () => {
        // Prototype: at 89.9° no finding (the striker's ball grazes the croqueted ball 0.11 µm deep, past
        // CONTACT_TOLERANCE); at 90.1° both clauses, the croqueted ball behind the striker's never pressed, the angle
        // 1.5725 rad.
        const clauses = (degrees: number) =>
            simulateShot(croquetAt(degrees))
                .faults.findings.filter((f) => f.law === "29.1.13")
                .map((f) => Object.keys(f.evidence));
        expect(clauses(89.9)).toEqual([]);
        expect(clauses(90.1)).toEqual([["peakPenetration"], ["angle"]]);
    });

    it("finds 29.1.14 only in a stroke of Law 29.2.3: the canonical AC stop's head meets the turf", () => {
        // Prototype: the head on the turf from 12.70 ms, 1.73 mm deep, 1.71 mm of slide (pre-flight, with the check to
        // rest: 12.52 ms, 1.80 mm, 1.83 mm).
        const setup = canonicalSetup("stop-ac");
        const dug = simulateShot({ ...setup, hampered: true }).faults.findings.filter((f) => f.law === "29.1.14");
        expect(dug).toHaveLength(1);
        expect(dug[0]).toMatchObject({ tier: "possible-fault", ball: "blue" });
        expect(simulateShot(setup).faults.findings.map((f) => f.law)).not.toContain("29.1.14");
    });

    it("ends a gentle tap before the cap", () => {
        // Review focus 1. Prototype: a 0.1 m/s tap ends at 10 ms, the pendulum's window.
        const kinds = simulateShot(
            canonicalSetup("single-ball", { stroke: { backswing: backswingFor(canonicalSetup("single-ball"), 0.1) } }),
        ).impact.events.map((e) => e.kind);
        expect(kinds).not.toContain("impact-cap");
        expect(kinds).not.toContain("impact-head-approaching");
    });

    it("finds a crush when the tracked head drives the ball into an upright", () => {
        // Review focus 5. Prototype: 29.1.8 and 29.1.9 (the ball touches the upright at the start); 57.8 ms.
        const hoop = WORLD.hoops[0] as Hoop;
        const upright = vec3(X, Y + R + hoop.uprightRadius, 0);
        const centre = add(upright, scale(hoopLateral(hoop), -hoopHalfSpan(hoop)));
        const world: World = { ...WORLD, hoops: [{ ...hoop, centre }] };
        const outcome = simulateShot(canonicalSetup("single-ball", { world }), world);
        expect(outcome.faults.findings.map((f) => f.law)).toContain("29.1.8");
        expect(outcome.motion.aborted).toBe(false);
    });

    const croquet = canonicalSetup("drive");
    const rejections: readonly [string, ShotSetup, RegExp][] = [
        ["an absent striker", { ...withOthers(), striker: "red", balls: { blue: at(X, Y) } }, /striker red is not in/],
        ["a live ball not in the setup", { ...canonicalSetup("single-ball"), live: ["black"] }, /live ball black/],
        ["the striker live", { ...withOthers(), live: ["blue"] }, /cannot be live/],
        ["a live ball listed twice", { ...withOthers(), live: ["red", "red"] }, /listed twice/],
        ["a croquet stroke without a croqueted ball", { ...withOthers(), stroke: croquet.stroke }, /needs a croqueted/],
        ["the striker croqueted", { ...croquet, croqueted: "blue" }, /cannot be the striker/],
        ["a croqueted ball not in the setup", { ...croquet, croqueted: "yellow" }, /croqueted ball yellow is not in/],
        [
            "a croqueted ball not touching",
            { ...croquet, balls: { ...croquet.balls, red: at(X, Y + 2 * R + 0.01) } },
            /must touch the striker/,
        ],
        [
            "a croqueted ball in a single-ball stroke",
            { ...withOthers(), croqueted: "red" },
            /only for a croquet stroke/,
        ],
        ["a non-positive lawn speed", { ...canonicalSetup("single-ball"), lawnSpeed: 0 }, /lawnSpeed/],
        [
            "a lawn speed the default world cannot use",
            { ...canonicalSetup("single-ball"), lawnSpeed: 1 },
            /rollingResist/,
        ],
    ];

    it.each(rejections)("rejects %s", (_name, setup, pattern) => {
        expect(() => simulateShot(setup)).toThrow(RangeError);
        expect(() => simulateShot(setup)).toThrow(pattern);
    });
});

describe("the effective mass (exit criterion 3)", () => {
    it("presents about the head's mass at the face on the canonical drive, and the strike measures it", () => {
        const setup = canonicalSetup("drive");
        const contact = buildContact(setup, WORLD);
        const { arc, hands } = contact.drive as TrackDrive;
        const { head } = contact;
        // Prototype: 1.0066 kg against the head's 1.0 kg.
        const closed = effectiveMass(swungBody(head, hands, arc.radius), head, contact.orientation, arc.aim);
        expect(Math.abs(closed - head.mass)).toBeLessThanOrEqual(0.1 * head.mass);

        // The strike's own measure: the balls' momentum along aim gained over the first face–ball interval, over the
        // face centre's loss of speed along aim. Both balls count: in a croquet stroke the croqueted ball takes its
        // share through the striker's during the interval. Prototype: 1.00655 kg, within 3.3e-5 of the closed form.
        const probe = recorder();
        const impact = simulateImpact(contact, setup.balls, WORLD, { probe });
        const strike = hits(impact)[0] as ContactInterval;
        expect(strike.start).toBeGreaterThan(0);
        // Snapshot i holds the state at the end of step i, t = (i + 1)·IMPACT_DT.
        const state = (t: number) => probe.snapshots[Math.round(t / IMPACT_DT) - 1] as ImpactSnapshot;
        const before = state(strike.start);
        const after = state(strike.end);
        expect(before.t).toBeCloseTo(strike.start, 12);
        expect(after.t).toBeCloseTo(strike.end, 12);
        const faceCentre = vec3(head.length / 2, 0, 0);
        const faceSpeed = (s: HeadState): number =>
            dot(add(s.velocity, cross(s.angularVelocity, rotate(s.orientation, faceCentre))), arc.aim);
        const momentum = (s: ImpactSnapshot): number =>
            s.balls.reduce((p, ball) => p + WORLD.ball.mass * dot(ball.velocity, arc.aim), 0);
        const measured = (momentum(after) - momentum(before)) / (faceSpeed(before.head) - faceSpeed(after.head));
        // 1 %: the hands draw 0.40 % of the single-ball strike's transfer (design §3.4) and the turf's friction on the
        // balls over the 1.2 ms interval less; the prototype's agreement is 300 times closer.
        expect(Math.abs(measured / closed - 1)).toBeLessThanOrEqual(0.01);
    });
});

describe("the mechanisms (design §8.1), on the canonical setups", () => {
    // Every figure below is the prototype's (pass 4 at aeadd4c, with design §5.4's values); pre-flight re-measures.
    it("the drive's follow-through strikes the striker's ball again, and the impact then ends by itself", () => {
        // Prototype: hits at 0.01–1.20 ms and 91.76–92.61 ms. Planning, at the 0.45 s cap: the impact ends by itself
        // 181.4 ms after contactAt, with no impact-cap and no impact-head-approaching.
        const { contact, impact } = simulateShot(canonicalSetup("drive"));
        const [first, second] = hits(impact);
        expect(hits(impact).length).toBeGreaterThanOrEqual(2);
        expect((second as ContactInterval).start).toBeGreaterThan((first as ContactInterval).end);
        expect((second as ContactInterval).end).toBeLessThanOrEqual(impact.duration);
        const kinds = impact.events.map((e) => e.kind);
        expect(kinds).not.toContain("impact-cap");
        expect(kinds).not.toContain("impact-head-approaching");
        expect(impact.duration).toBeLessThan((contact.drive as TrackDrive).arc.contactAt + TRACK_IMPACT_CAP);
    });

    it("no extra push: at guideEffort 0 the 2 m/s drive strikes once and ends by itself; at 1, more than once", () => {
        // Planning: at 0 one hit (0.01–1.20 ms), the impact ending by itself 110.6 ms after contactAt with no
        // impact-cap and no impact-head-approaching; at 1 four hits (from 0.01, 81.94, 126.77 and 159.11 ms), 268.9 ms.
        const at = (guideEffort: number) =>
            simulateShot(
                canonicalSetup("drive", {
                    stroke: { backswing: backswingFor(canonicalSetup("drive"), 2), guideEffort },
                }),
            );
        const none = at(0);
        expect(hits(none.impact)).toHaveLength(1);
        const kinds = none.impact.events.map((e) => e.kind);
        expect(kinds).not.toContain("impact-cap");
        expect(kinds).not.toContain("impact-head-approaching");
        expect(none.impact.duration).toBeLessThan((none.contact.drive as TrackDrive).arc.contactAt + TRACK_IMPACT_CAP);
        expect(hits(at(1).impact).length).toBeGreaterThan(1);
    });

    it("an accelerating bottom hand turns the drive's double hit into a triple and lowers its ratio", () => {
        // Prototype: bottom hand at 0.30 m, grip 1: five hits and ratio 1.24, against two hits and 3.32.
        const canonical = canonicalSetup("drive");
        const strong = canonicalSetup("drive", { stance: { bottom: 0.3, bottomGrip: 1 } });
        const guided = simulateShot(canonical);
        const pushed = simulateShot(strong);
        expect(hits(pushed.impact).length).toBeGreaterThanOrEqual(3);
        expect(ratio(strong, pushed)).toBeLessThan(ratio(canonical, guided));
    });

    it("the stops strike once, and the AC stop's coaching ratio exceeds the drive's", () => {
        // User decision (2026-10-06): the AC stop is told from the drive by its ratio, not by the striker's ball's
        // speed at the impact's end (1.3800 against 1.3919 m/s, taken 21.6 and 181 ms after contact). Pre-flight: one
        // hit each; ratios 6.464 (AC stop) and 3.316 (drive).
        const drive = canonicalSetup("drive");
        const acStop = canonicalSetup("stop-ac");
        for (const type of ["stop-ac", "stop-gc"] as const) {
            expect(hits(simulateShot(canonicalSetup(type)).impact), type).toHaveLength(1);
        }
        expect(ratio(acStop, simulateShot(acStop))).toBeGreaterThan(ratio(drive, simulateShot(drive)));
    });

    it("the GC stop's check brings its head to rest, never back, where a single-ball stroke's follows through", () => {
        // User decision (2026-10-06): a check brakes the head to rest, not past it. The GC stop is a single-ball
        // stroke, its ball leaving at much the same speed as the single-ball stroke's, so the check shows in the head.
        // Pre-flight: the GC stop's head ends the impact at −3.2e-4 m/s along aim, its lowest after the strike (its
        // pitch rate −5.5e-7 rad/s); the single-ball stroke's at 1.3151 m/s. The planned deceleration alone, sized for
        // the unstruck head, left it at −1.0928 m/s, moving back.
        const probe = recorder();
        const setup = canonicalSetup("stop-gc");
        const gcStop = simulateImpact(buildContact(setup, WORLD), setup.balls, WORLD, { probe });
        const strikeEnd = (hits(gcStop)[0] as ContactInterval).end;
        const lowest = Math.min(
            ...probe.snapshots.filter((s) => s.t > strikeEnd).map((s) => dot(s.head.velocity, vec3(0, 1, 0))),
        );
        const plain = simulateShot(canonicalSetup("single-ball", { targetGap: GC_STOP_GAP })).impact;
        expect(Math.abs(headSpeed(gcStop))).toBeLessThan(0.01);
        expect(lowest).toBeGreaterThan(-0.01);
        expect(headSpeed(plain)).toBeGreaterThan(1);
    });

    it("the GC stop's check brakes the head through the hands: positive at drive −1, negative at 0", () => {
        // D9.2, restated as the design's total hand impulse. On the touching setup the prototype gave +1.697 N·s
        // checked and −2.465 N·s coasting; pre-flight, on the target setup with the check to rest, +1.187 N·s and
        // −0.789 N·s.
        expect(braking(canonicalSetup("stop-gc")).hands).toBeGreaterThan(0);
        expect(braking(canonicalSetup("stop-gc", { stroke: { drive: 0 } })).hands).toBeLessThan(0);
    });

    it("the AC stop's relaxed head meets the turf after the ball and the turf brakes it, not too deep", () => {
        // D9.1, on the canonical stop. Prototype (11 mm dip): the first face interval ends at 1.17 ms, the head on
        // the turf 12.70–21.48 ms, 1.73 mm deep (10 mm: 1.32; 12 mm: 2.11 and impact-head-deep), turf +0.376 N·s.
        // Pre-flight, with the check to rest: 12.52–21.38 ms, 1.80 mm (10 mm: 1.40; 12 mm: 2.19 and deep), +0.401 N·s.
        const { impact, turf } = braking(canonicalSetup("stop-ac"));
        const dug = impact.timeline["head/turf"]?.[0] as ContactInterval;
        expect(dug).toBeDefined();
        expect(dug.start).toBeGreaterThanOrEqual((hits(impact)[0] as ContactInterval).end);
        expect(turf).toBeGreaterThan(0);
        expect(impact.events.map((e) => e.kind)).not.toContain("impact-head-deep");
    });

    // Expected to fail (user decision, 2026-10-09). On the bed (P2b.2b.2b.2a) the canonical pass roll's follow-through
    // keeps the 34°-leaning face on the striker's ball: the ball rebounds only about 1.8 mm and is back in its pit by
    // 46 ms, the face catches it at about 2.7 m/s and pins it 2–4 mm deep until the head stops. So the punched ball
    // leaves at 0.038 m/s and the coasted one at 0.088 m/s. A model finding, recorded in the roadmap; P2b.2b.2b.2b (the
    // roll's stroke: descent, follow-through, hands) owns it. This test flips, and alerts, when that phase fixes it;
    // it then goes back to `it`.
    it.fails("the pass roll's punch leaves the striker's ball faster than a coasting pass roll", () => {
        // Prototype: 1.226 m/s at drive +1, 1.099 m/s at drive 0. P2b.2b.2b.2a: Hertzian face (was 1.099 at drive 0):
        // 1.894 m/s at drive +1, 0.29 m/s at drive 0, the coasted ball already pinned under the face. P2b.2b.2b.2a:
        // turf bed (was 1.894 and 0.29): 0.038 m/s at drive +1, 0.088 m/s at drive 0, both pinned.
        const punched = simulateShot(canonicalSetup("pass-roll")).impact;
        const coasted = simulateShot(canonicalSetup("pass-roll", { stroke: { drive: 0 } })).impact;
        expect(strikerSpeed(punched)).toBeGreaterThan(strikerSpeed(coasted));
    });

    it("a dip 30 ms early meets the lawn before the ball and sends the striker's ball off slower", () => {
        // Prototype: the impact starts 30 ms before contact; the head on the turf from 20.72 ms, the ball struck from
        // 31.05 ms; the striker's ball at 1.214 m/s against 1.380 on time.
        const onTime = simulateShot(canonicalSetup("stop-ac")).impact;
        const timing = { arc: 0, hands: 0, dip: -0.03 };
        const early = simulateShot(canonicalSetup("stop-ac", { stroke: { timing } })).impact;
        const dug = early.timeline["head/turf"]?.[0] as ContactInterval;
        expect(dug).toBeDefined();
        expect(dug.start).toBeLessThan((hits(early)[0] as ContactInterval).start);
        expect(strikerSpeed(early)).toBeLessThan(strikerSpeed(onTime));
    });

    it.each(["single-ball", "half-roll"] as const)(
        "a depthless dip MAX_LEAD early on the %s leaves the head on its planned path at contact",
        (type) => {
            // Without the position spring on a downswing the impact starts MAX_LEAD early (the dip, handDrop 0, leaves
            // the path unchanged) and the head must still arrive at the contact pose at the planned speed. The
            // reviewer measured 2.0-3.24 µm of path error and 3.00000-3.00001 m/s, hence the bounds below.
            const setup = canonicalSetup(type, { stroke: { timing: { arc: 0, hands: 0, dip: -MAX_LEAD } } });
            const planned = simulateShot(canonicalSetup(type), WORLD);
            const contact = simulateShot(setup, WORLD).contact;
            let atContact: HeadState | undefined;
            const probe: ImpactProbe = {
                step: (s) => {
                    if (atContact === undefined && s.t >= MAX_LEAD - IMPACT_DT / 2) {
                        atContact = s.head;
                    }
                },
            };
            simulateImpact(contact, setup.balls, WORLD, { probe });
            const head = atContact as HeadState;
            expect(head).toBeDefined();
            expect(length(sub(head.position, planned.contact.position))).toBeLessThan(5e-6);
            expect(Math.abs(length(head.velocity) - planned.contactSpeed)).toBeLessThan(1e-4);
        },
    );
});
