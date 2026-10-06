import { describe, expect, it } from "vitest";
import { lawFromStiffness } from "../../../src/engine/impact/contactLaw";
import { HEAD_TURF_KEY, headLowestPoint } from "../../../src/engine/impact/contacts";
import {
    HEAD_DEEP_LIMIT,
    IMPACT_DT,
    TRACK_IMPACT_CAP,
    integrate,
    type ImpactProbe,
    type ImpactSnapshot,
} from "../../../src/engine/impact/integrate";
import { IDENTITY, axisAngle, type Quaternion } from "../../../src/engine/impact/rigidBody";
import { HEAD_TURF_FRICTION, prepareImpact, simulateImpact } from "../../../src/engine/impact/simulateImpact";
import { headOnPath, prepareTrack } from "../../../src/engine/impact/track";
import { ZERO, length, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import type { SurfaceProps } from "../../../src/engine/types";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import { TEST_TURF, ballAt, testWorld } from "../support/fixtures";
import {
    TEST_COUPLING,
    TEST_HANDS,
    TEST_HEAD,
    isolated,
    levelArc,
    onArc,
    recorder,
    strike,
    trackDrive,
} from "../support/impact";

const g = STANDARD_GRAVITY;
const MU = 0.5;
const LAW = lawFromStiffness(TEST_HEAD.mass, TEST_TURF.turfRestitution, TEST_TURF.turfStiffness, MU);
/** Where the turf carries the head's whole weight: m·g/k. */
const SINK = (TEST_HEAD.mass * g) / TEST_TURF.turfStiffness;

/** An undriven head with its centre at height z, falling under gravity onto the test turf. */
function onTurf(z: number, velocity: Vec3 = ZERO, orientation: Quaternion = IDENTITY) {
    return isolated({
        start: { position: vec3(0, 0, z), orientation, velocity, angularVelocity: ZERO },
        gravity: g,
        headTurf: LAW,
    });
}

/** A probe that keeps only the last snapshot. */
function lastStep(): ImpactProbe & { last: ImpactSnapshot | null } {
    const probe = {
        last: null as ImpactSnapshot | null,
        step(s: ImpactSnapshot): void {
            probe.last = s;
        },
    };
    return probe;
}

describe("the head–turf pair", () => {
    it("settles a level head lowered onto the turf at m·g/k, without turning it", () => {
        const probe = recorder();
        const run = integrate(onTurf(TEST_HEAD.radius), { cap: 0.05, probe });
        // Pre-flight: 0.28 % off m·g/k; the turf force 0.34 % off m·g, both at the cap.
        expect(Math.abs(0 - headLowestPoint(run.head, TEST_HEAD) - SINK) / SINK).toBeLessThan(0.01);
        expect(length(run.head.angularVelocity)).toBe(0);
        expect(run.timeline[HEAD_TURF_KEY]).toHaveLength(1);
        expect(run.peakPenetration[HEAD_TURF_KEY]).toBeGreaterThan(SINK);
        expect(run.events.map((e) => e.kind)).toEqual(["impact-cap"]);
        expect(probe.snapshots[0]?.headTurf).toEqual(ZERO);
        const last = probe.snapshots[probe.snapshots.length - 1] as ImpactSnapshot;
        expect(Math.abs((last.headTurf as Vec3).z - TEST_HEAD.mass * g) / (TEST_HEAD.mass * g)).toBeLessThan(0.01);
    });

    it("slows a head sliding sideways at μ·g while it slides, and records the slide's closed form", () => {
        // Sliding along body y at the static sink: friction at the barrel's bottom line also spins the head about its
        // axis, so its bottom slips at v₀ − 3·μ·g·t (I = m·r²/2) and stops slipping at t = v₀/(3·μ·g), having slid
        // v₀²/(6·μ·g). Pre-flight: the deceleration within 1e-12 of μ·g, the slide 0.39 % long (the bottom first
        // bounces into its sink).
        const v0 = 1;
        const probe = recorder();
        const run = integrate(onTurf(TEST_HEAD.radius - SINK, vec3(0, v0, 0)), { cap: 0.1, probe });
        const stops = v0 / (3 * MU * g);
        const mid = probe.snapshots.find((s) => s.t >= stops / 2) as ImpactSnapshot;
        const expected = v0 - MU * g * mid.t;
        expect(Math.abs(mid.head.velocity.y - expected) / (MU * g * mid.t)).toBeLessThan(0.01);
        const slide = (v0 * v0) / (6 * MU * g);
        expect(Math.abs((run.headTurfSlide as number) - slide) / slide).toBeLessThan(0.01);
    });

    it("raises impact-head-deep just over HEAD_DEEP_LIMIT, and not just under", () => {
        const over = integrate(onTurf(TEST_HEAD.radius - HEAD_DEEP_LIMIT - 1e-6), { cap: 1e-3 });
        expect(over.events.filter((e) => e.kind === "impact-head-deep").map((e) => e.t)).toEqual([IMPACT_DT]);
        expect(over.events.some((e) => e.kind === "impact-mallet-grounded")).toBe(false);
        const under = integrate(onTurf(TEST_HEAD.radius - HEAD_DEEP_LIMIT + 1e-6), { cap: 1e-3 });
        expect(under.events.some((e) => e.kind === "impact-head-deep")).toBe(false);
    });

    it("rests a nearly level head without spinning it up, though its lowest point jumps between the end rims", () => {
        // As the lowest point jumps from one end rim to the other the turf's moment about the centre switches sign, so
        // the spin chatters. One step's moment impulse at the settling's peak load (1.5·m·g, pre-flight) is
        // 1.5·m·g·(L/2)/I_y·dt ≈ 1.8e-3 rad/s; pre-flight measured the spin at 7.66e-3 rad/s at its largest (about four
        // such impulses) and 5.20e-3 over the run's second half. The bound allows eleven impulses, and the second half
        // must not exceed the first: a spin that grew would pass both within tens of steps.
        for (const tilt of [1e-9, -1e-9]) {
            let early = 0;
            let late = 0;
            const probe: ImpactProbe = {
                step(s) {
                    const spin = length(s.head.angularVelocity);
                    if (s.t <= 0.025) {
                        early = Math.max(early, spin);
                    } else {
                        late = Math.max(late, spin);
                    }
                },
            };
            const run = integrate(onTurf(TEST_HEAD.radius, ZERO, axisAngle(vec3(0, 1, 0), tilt)), { cap: 0.05, probe });
            expect(early, `tilt ${tilt}`).toBeLessThan(0.02);
            expect(late, `tilt ${tilt}`).toBeLessThanOrEqual(early);
            // Pre-flight: 0.12 % off m·g/k, as for the level head.
            expect(Math.abs(0 - headLowestPoint(run.head, TEST_HEAD) - SINK) / SINK).toBeLessThan(0.01);
        }
    });

    it("brings a relaxed head, held 1 mm above the turf, down onto it to rest, whatever the arm mass", () => {
        // γ_T = 0.1 on a still, level path: the top hand carries γ_T·m·g and damps the fall, so the head sinks at under
        // the terminal rate (1 − γ_T)·m·g/c(γ_T), c(γ) = 2ζ·M·(2π/T)·√γ, and cannot reach the turf before
        // 1 mm/terminal. At rest the damper is idle and the turf carries (1 − γ_T)·m·g: the arm's weight is the
        // player's. Pre-flight, at TRACK_IMPACT_CAP: armMass 0, the turf from 18.2 ms (bound 7.9 ms), |v| 2.2e-13 m/s
        // and the load 1.7e-12 off; armMass 0.8 kg, from 26.2 ms (bound 14.2 ms), |v| 6.4e-14 m/s and 9.1e-13 off
        // (the prototype's figures, aeadd4c, were at the 0.15 s cap). The load bounds sit far above those figures, and
        // far below the 89 % more the turf would carry were the 0.8 kg arm's weight applied.
        const gamma = 0.1;
        for (const [armMass, loadTolerance] of [
            [0, 1e-6],
            [0.8, 1e-3],
        ] as const) {
            const hands = { ...TEST_HANDS, gripTension: gamma, armMass };
            const arc = levelArc(vec3(0, 0, TEST_HEAD.radius + 1e-3));
            const track = prepareTrack(trackDrive(arc, TEST_COUPLING, hands), TEST_HEAD, g);
            const probe = lastStep();
            const start = headOnPath(track, TEST_HEAD, 0);
            const run = integrate(isolated({ start, drive: track, gravity: g, headTurf: LAW }), { probe });
            const M = TEST_HEAD.mass + armMass;
            const damping = 2 * TEST_COUPLING.dampingRatio * M * ((2 * Math.PI) / TEST_COUPLING.period);
            const terminal = ((1 - gamma) * TEST_HEAD.mass * g) / (damping * Math.sqrt(gamma));
            const line = run.timeline[HEAD_TURF_KEY] ?? [];
            expect(line, `armMass ${armMass}`).toHaveLength(1);
            expect(line[0]?.start).toBeGreaterThanOrEqual(1e-3 / terminal);
            expect(line[0]?.end).toBe(run.duration);
            expect(run.events.map((e) => e.kind)).toEqual(["impact-cap"]);
            expect(run.duration).toBeGreaterThanOrEqual(TRACK_IMPACT_CAP);
            expect(length(run.head.velocity)).toBeLessThan(1e-6);
            const rest = (1 - gamma) * TEST_HEAD.mass * g;
            const load = ((probe.last as ImpactSnapshot).headTurf as Vec3).z;
            expect(Math.abs(load - rest) / rest, `armMass ${armMass}`).toBeLessThan(loadTolerance);
        }
    });

    it("is given to a tracked drive and not to a force table", () => {
        const world = testWorld();
        const blue = ballAt(5, 0);
        const turf = world.lawn.surfaceAt(blue.position);
        const tracked = onArc(trackDrive(levelArc(vec3(4, 0, 0.1))));
        expect(prepareImpact(tracked, { blue }, world).headTurf).toEqual(
            lawFromStiffness(TEST_HEAD.mass, turf.turfRestitution, turf.turfStiffness, HEAD_TURF_FRICTION),
        );
        expect(prepareImpact(strike(blue.position), { blue }, world).headTurf).toBeNull();
    });

    it("rejects a tracked drive over turf the head–turf law cannot use", () => {
        // The lawn is good at the ball and the court's centre (validateWorld samples there), bad under the head.
        const good = testWorld().lawn.surfaceAt(vec3(15, 20, 0));
        const under = (bad: Partial<SurfaceProps>) =>
            testWorld({
                lawn: { width: 30, length: 40, surfaceAt: (p) => (p.x < 4.5 ? { ...good, ...bad } : good) },
            });
        const blue = ballAt(5, 0);
        const tracked = onArc(trackDrive(levelArc(vec3(4.2, 0, TEST_HEAD.radius + 0.01))));
        expect(() => simulateImpact(tracked, { blue }, under({ turfStiffness: 0 }))).toThrow(
            /turfStiffness under the head must be a positive finite number/,
        );
        expect(() => simulateImpact(tracked, { blue }, under({ turfRestitution: 0 }))).toThrow(
            /turfRestitution under the head must lie in \(0, 1\]/,
        );
    });
});
