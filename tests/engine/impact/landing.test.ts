import { describe, expect, it } from "vitest";
import { ZERO, horizontal, length, vec3 } from "../../../src/engine/math/vec3";
import { LANDING_CAP, land } from "../../../src/engine/impact/landing";
import { BED_CELL } from "../../../src/engine/impact/turfBed";
import type { BedLaw } from "../../../src/engine/impact/types";
import { SETTLE_SPEED } from "../../../src/engine/resolve";
import type { BallState } from "../../../src/engine/types";
import { STANDARD_GRAVITY } from "../../../src/engine/world";
import { ballReference, contactReference } from "../../../src/reference/index";
import { TEST_BALL } from "../support/fixtures";
import { rng } from "../support/rng";

const R = TEST_BALL.radius;
const M = TEST_BALL.mass;
const G = STANDARD_GRAVITY;
/** A plausible bed, not the fitted one (fixtures' policy). */
const LAW: BedLaw = { modulus: 3e8, recovery: 2e-3, friction: 0.48, cell: BED_CELL };

const falling = (v: ReturnType<typeof vec3>, w = ZERO): BallState => ({
    position: vec3(3.0007, 4.0011, R),
    velocity: v,
    angularVelocity: w,
});

const energy = (s: BallState): number =>
    0.5 * M * (s.velocity.x ** 2 + s.velocity.y ** 2 + s.velocity.z ** 2) +
    0.2 * M * R * R * (s.angularVelocity.x ** 2 + s.angularVelocity.y ** 2 + s.angularVelocity.z ** 2);

describe("a landing on a fresh bed", () => {
    it("leaves a vertical landing with no spin rising, at the touchdown point, with no sideways motion or spin", () => {
        const l = land(falling(vec3(0, 0, -3)), TEST_BALL, G, LAW);
        expect(l.outcome).toBe("left");
        expect(l.state.position).toEqual(vec3(3.0007, 4.0011, R));
        expect(l.state.velocity.z).toBeGreaterThan(SETTLE_SPEED);
        expect(l.state.velocity.z).toBeLessThan(3);
        // The lattice's sideways push is up to about 1.4e-3 of the weight; over a few ms it moves nothing measurable.
        expect(length(horizontal(l.state.velocity))).toBeLessThan(1e-4);
        expect(length(l.state.angularVelocity)).toBeLessThan(1e-2);
        expect(l.peakDepth).toBeGreaterThan(0);
        expect(l.duration).toBeGreaterThan(0);
    });

    it("leaves a vertical 5 m/s landing with no spin at e = 0.5 on the fitted bed", () => {
        const fitted: BedLaw = {
            modulus: contactReference.bedModulus.value,
            recovery: contactReference.bedRecovery.value,
            friction: 0.48,
            cell: BED_CELL,
        };
        const ball = { radius: ballReference.diameter.value / 2, mass: ballReference.mass.value };
        const l = land({ ...falling(vec3(0, 0, -5)), position: vec3(0.0007, 0.0011, ball.radius) }, ball, G, fitted);
        expect(Math.abs(l.state.velocity.z / 5 - 0.5)).toBeLessThan(5e-5);
    });

    it("leaves the ball on the turf, with its horizontal velocity and spin, when it lands slower than settling", () => {
        const l = land(falling(vec3(0.3, 0, -0.02), vec3(0, 0.3 / R, 0)), TEST_BALL, G, LAW);
        expect(l.outcome).toBe("settled");
        expect(l.state.velocity.z).toBe(0);
        expect(l.state.position.z).toBe(R);
        expect(l.state.velocity.x).toBeGreaterThan(0);
    });

    it("settles a grazing touchdown at once (review focus 4)", () => {
        const l = land(falling(vec3(0.5, 0, -1e-6), vec3(0, 0.5 / R, 0)), TEST_BALL, G, LAW);
        expect(l.outcome).toBe("settled");
        // A few ms of settling into the sink, not the cap.
        expect(l.duration).toBeLessThan(0.2 * LANDING_CAP);
    });

    it("slows a slanted landing's horizontal speed and moves its spin towards rolling at the new speed", () => {
        // No spin at 3 m/s forward: the contact point slips forward, so the ramp and friction slow the ball and
        // friction spins it forward. Direction asserted; the sizes are recorded by the probe (spec §6).
        const before = falling(vec3(3, 0, -2));
        const l = land(before, TEST_BALL, G, LAW);
        expect(l.state.velocity.x).toBeLessThan(3);
        expect(l.state.angularVelocity.y).toBeGreaterThan(0);
        const slipBefore = Math.abs(before.velocity.x - R * before.angularVelocity.y);
        const slipAfter = Math.abs(l.state.velocity.x - R * l.state.angularVelocity.y);
        expect(slipAfter).toBeLessThan(slipBefore);
        expect(l.travel).toBeGreaterThan(0);
    });

    it("settles a landing forced past its cap, and says so", () => {
        const l = land(falling(vec3(0, 0, -3)), TEST_BALL, G, LAW, 10 * 5e-6);
        expect(l.outcome).toBe("capped");
        expect(l.steps).toBe(10);
        expect(l.state.velocity.z).toBe(0);
        expect(l.state.position.z).toBe(R);
    });

    it("never gains energy (random landings)", () => {
        const random = rng(17);
        for (let n = 0; n < 40; n++) {
            const before = falling(
                vec3((random() - 0.5) * 6, (random() - 0.5) * 6, -0.05 - 4 * random()),
                vec3((random() - 0.5) * 100, (random() - 0.5) * 100, (random() - 0.5) * 20),
            );
            const l = land(before, TEST_BALL, G, LAW);
            // Kinetic energy at the touchdown point: the landing's gravity work over its depth is returned on leaving,
            // less what the bed keeps, so the ball never leaves with more.
            expect(energy(l.state), `landing ${n}`).toBeLessThanOrEqual(energy(before) * (1 + 1e-9));
        }
    });
});
