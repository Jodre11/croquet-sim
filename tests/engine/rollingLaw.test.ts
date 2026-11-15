import { describe, expect, it } from "vitest";
import { length, sub, vec3 } from "../../src/engine/math/vec3";
import { rollingSpin } from "../../src/engine/motion";
import {
    bandFloor,
    rollingBand,
    rollingBaseForLawnSpeed,
    rollingDecelAt,
    rollingDistance,
    type RollingLaw,
} from "../../src/engine/rollingLaw";
import { simulateFreeMotion } from "../../src/engine/simulate";
import { STANDARD_GRAVITY, rollingLawOf } from "../../src/engine/world";
import { lawnReference } from "../../src/reference/index";
import { OPEN_START, openWorld } from "../../src/lab/lawn";

// The speed-dependent lawn (speed-dependent lawn design §3, §4).

const D = lawnReference.speedDistance.value;

/** ∫ v/a(v) dv over [lo, hi] by composite Simpson with n panels: the reference the bands are checked against. */
function simpson(law: RollingLaw, lo: number, hi: number, n = 20000): number {
    const h = (hi - lo) / n;
    let sum = 0;
    for (let i = 0; i <= n; i++) {
        const v = lo + i * h;
        const f = v / rollingDecelAt(law, v);
        sum += i === 0 || i === n ? f : i % 2 === 1 ? 4 * f : 2 * f;
    }
    return (sum * h) / 3;
}

function lawOf(seconds: number): RollingLaw {
    const world = openWorld(seconds);
    return rollingLawOf(world, world.lawn.surfaceAt(OPEN_START));
}

/** The speed (m/s) whose roll under `law` covers `distance`. */
function speedFor(law: RollingLaw, distance: number): number {
    let lo = 0;
    let hi = 40;
    for (let i = 0; i < 200; i++) {
        const mid = (lo + hi) / 2;
        if (rollingDistance(law, 0, mid) < distance) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    return (lo + hi) / 2;
}

describe("the rolling law's bands (design §3.2)", () => {
    it("puts a speed on an edge, or a hair above it, in the band below", () => {
        expect(bandFloor(0.5)).toBe(0.25);
        expect(bandFloor(0.5 + 1e-12)).toBe(0.25);
        expect(bandFloor(0.6)).toBe(0.5);
        expect(bandFloor(0.1)).toBe(0);
        expect(bandFloor(0)).toBe(0);
    });

    it("gives each band the law's own distance, down to 2e-9 m/s", () => {
        const law = lawOf(10);
        for (const u of [7.3, 2.6, 0.6, 0.25 + 1e-6, 1e-3, 2e-9]) {
            const band = rollingBand(law, u);
            const banded = (u * u - band.floor * band.floor) / (2 * band.decel);
            expect(Math.abs(banded / simpson(law, band.floor, u) - 1)).toBeLessThan(1e-12);
        }
    });

    it("gives a ball at rest the law at u = 0, and a uniform lawn one band to rest", () => {
        const law = lawOf(10);
        expect(rollingBand(law, 0)).toEqual({ decel: law.base, floor: 0 });
        expect(rollingBand({ ...law, slope: 0, drag: 0 }, 5)).toEqual({ decel: law.base, floor: 0 });
    });
});

describe("the lawn speed under the law (design §3.1)", () => {
    it("keeps the closed form 2D/(g·T²) on a uniform lawn", () => {
        expect(rollingBaseForLawnSpeed(10, D, STANDARD_GRAVITY, 0, 0, 5)).toBe((2 * D) / (STANDARD_GRAVITY * 100));
    });

    it.each([6, 10, 14])("rolls a ball %d s over the lawn-speed distance through the simulator", (seconds) => {
        const world = openWorld(seconds);
        const law = rollingLawOf(world, world.lawn.surfaceAt(OPEN_START));
        const u0 = speedFor(law, D);
        const velocity = vec3(0, u0, 0);
        const start = vec3(OPEN_START.x, OPEN_START.y, world.ball.radius);
        const result = simulateFreeMotion(
            { blue: { position: start, velocity, angularVelocity: rollingSpin(velocity, 0, world.ball.radius) } },
            world,
        );
        expect(result.aborted).toBe(false);
        expect(Math.abs(length(sub(result.rest.blue as never, start)) - D)).toBeLessThan(1e-6);
        expect(Math.abs(result.duration / seconds - 1)).toBeLessThan(0.005);
        // The speed at which the law's ceiling binds (design §3.2), reported: on a slow lawn it can be below u0.
        const binds = ceilingSpeed(law);
        console.log(
            `${seconds} s lawn: μ0 ${(law.base / STANDARD_GRAVITY).toFixed(4)}, u0 ${u0.toFixed(2)} m/s, ` +
                `ceiling binds at ${binds.toFixed(1)} m/s`,
        );
    });
});

/** The speed (m/s) where the law's deceleration reaches its ceiling. */
function ceilingSpeed(law: RollingLaw): number {
    let lo = 0;
    let hi = 1000;
    for (let i = 0; i < 200; i++) {
        const mid = (lo + hi) / 2;
        if (law.base * (1 + law.slope * mid) + law.drag * mid * mid < law.ceiling) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    return (lo + hi) / 2;
}
