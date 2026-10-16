import { describe, expect, it } from "vitest";
import { TANGENTIAL_STIFFNESS_RATIO } from "../../../src/engine/impact/contactLaw";
import { HEAD_REST_SPEED, headTurfLoad, newHeadTurfBed, type HeadTurfLoad } from "../../../src/engine/impact/headTurf";
import { IDENTITY, axisAngle, multiply, type Quaternion } from "../../../src/engine/impact/rigidBody";
import type { BoxShape } from "../../../src/engine/impact/shape";
import type { HeadState } from "../../../src/engine/impact/types";
import { ZERO, add, length, scale, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import { TEST_BOX, TEST_RHO, TEST_SHARP, mirrorQuat, mirrorSpin, mirrorVec, testHeadTurf } from "../support/impact";

const DT = 1e-5;
const AIM = vec3(1, 0, 0);
const LAW = testHeadTurf();
const H = LAW.cell;
/** p_y/k_w: the depth (m) at which a fresh column yields, 0.67 mm on the test law. */
const YIELD = LAW.yieldPressure / LAW.modulus;
/** The sharp box's rows of columns across aim when centred over y = 0 (TEST_SHARP's comment). */
const ROWS = 32;

const rel = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);
const same = (a: Vec3, b: Vec3): boolean => a.x === b.x && a.y === b.y && a.z === b.z;

function state(
    position: Vec3,
    velocity: Vec3 = ZERO,
    orientation: Quaternion = IDENTITY,
    spin: Vec3 = ZERO,
): HeadState {
    return { position, orientation, velocity, angularVelocity: spin };
}

/** The level sharp box, its sole `depth` below the turf, centred over (x, 0), moving at `velocity`. */
const sunk = (depth: number, x = 0, velocity: Vec3 = ZERO): HeadState => state(vec3(x, 0, TEST_RHO - depth), velocity);

/** The lattice columns whose centres lie under the level sharp box centred over (x, 0), its edges included. */
function under(x = 0): number {
    const { halfWidth } = TEST_SHARP.shape as BoxShape;
    let n = 0;
    for (let i = -300; i < 300; i++) {
        for (let j = -40; j < 40; j++) {
            if (Math.abs((i + 0.5) * H - x) <= TEST_SHARP.length / 2 && Math.abs((j + 0.5) * H) <= halfWidth) {
                n++;
            }
        }
    }
    return n;
}

describe("bearing (P2b.2b.2b.3 design §4.2; §7.1 case 1)", () => {
    it("bears k_w·δ·A for a level box pressed statically below yield, and p_y·A past it", () => {
        const A = under() * H * H;
        const below = headTurfLoad(newHeadTurfBed(LAW), sunk(0.5 * YIELD), TEST_SHARP, DT, AIM) as HeadTurfLoad;
        expect(rel(below.bearing, LAW.modulus * 0.5 * YIELD * A)).toBeLessThan(1e-12);
        expect(below.yielded).toBe(false);
        expect(below.columns).toBe(under());
        expect(length(below.resistance)).toBe(0);
        const past = headTurfLoad(newHeadTurfBed(LAW), sunk(3 * YIELD), TEST_SHARP, DT, AIM) as HeadTurfLoad;
        expect(rel(past.bearing, LAW.yieldPressure * A)).toBeLessThan(1e-12);
        expect(past.yielded).toBe(true);
    });

    it("unloads a yielded column only by its elastic part: a press-and-release cycle loses the plastic work", () => {
        // A law whose yield depth is a binary fraction, y = 2^-11 m, so that every press depth k·2^-17 m is exact and
        // the force's kinks, at the yield and at the set, are nodes of the trapezoid rule, exact on the piecewise
        // linear law. Pressed to 3y and released: in A·p_y·(y/2 + 2y), out A·p_y·y/2, lost A·p_y·s with s = 2y.
        const modulus = 3e8;
        const y = 2 ** -11;
        const law = testHeadTurf({ modulus, yieldPressure: modulus * y });
        const bed = newHeadTurfBed(law);
        const step = 2 ** -17;
        const top = 192;
        const force = (k: number): number => headTurfLoad(bed, sunk(k * step), TEST_SHARP, DT, AIM)?.bearing ?? 0;
        let previous = 0;
        let input = 0;
        for (let k = 1; k <= top; k++) {
            const f = force(k);
            input += 0.5 * (previous + f) * step;
            previous = f;
        }
        let output = 0;
        for (let k = top - 1; k >= 0; k--) {
            const f = force(k);
            output += 0.5 * (previous + f) * step;
            previous = f;
        }
        const plastic = under() * H * H * law.yieldPressure * (top * step - y);
        expect(rel(input - output, plastic)).toBeLessThan(1e-9);
    });
});

describe("ploughing and the sole's friction (design §4.3; §7.1 case 2)", () => {
    it("resists a box translated at constant depth, its spring sliding, with w·d·c·N_c + µ·N_b", () => {
        // Along aim the strips are the lattice's rows, 32 under the sharp box, each ploughing fresh turf at the box's
        // depth d (plan decision 1), so the ploughing is w·d·c·N_c with w = 32·h. Past yield every column bears p_y,
        // so N_b = p_y·h²·n; the spring slides once its stretch passes F_cap/k_t, within a few steps at 1 m/s.
        const d = 3 * YIELD;
        const bed = newHeadTurfBed(LAW);
        let load: HeadTurfLoad | null = null;
        for (let k = 0; k < 400; k++) {
            load = headTurfLoad(bed, sunk(d, k * DT, vec3(1, 0, 0)), TEST_SHARP, DT, AIM);
        }
        const last = load as HeadTurfLoad;
        const ploughing = ROWS * H * d * LAW.matStrength * LAW.ploughFactor;
        const expected = ploughing + LAW.friction * LAW.yieldPressure * H * H * last.columns;
        expect(last.sliding).toBe(true);
        expect(rel(last.cap, expected)).toBeLessThan(1e-12);
        expect(rel(length(last.resistance), last.cap)).toBeLessThan(1e-12);
        expect(last.resistance.x).toBeLessThan(0);
    });

    it("gives nothing for a head exactly on the turf plane, or above it", () => {
        // Review focus 1: the sole exactly at z = 0 touches the turf without entering it.
        const bed = newHeadTurfBed(LAW);
        bed.spring = vec3(1e-6, 0, 0);
        expect(headTurfLoad(bed, sunk(0), TEST_SHARP, DT, AIM)).toBeNull();
        expect(same(bed.spring, ZERO)).toBe(true);
        expect(headTurfLoad(bed, sunk(-1e-3), TEST_SHARP, DT, AIM)).toBeNull();
    });

    it("orients the strips along aim while the trial is zero", () => {
        // Review focus 3. A box pressed straight down has no horizontal slip and no spring: the strips lie along aim.
        // Along +x they are the 32 rows, along +y the 116 columns along the box; there is no resistance and no NaN.
        const d = 0.5 * YIELD;
        const down = sunk(d, 0, vec3(0, 0, -0.5));
        for (const [aim, strips] of [
            [vec3(1, 0, 0), ROWS],
            [vec3(0, 1, 0), 116],
        ] as const) {
            const load = headTurfLoad(newHeadTurfBed(LAW), down, TEST_SHARP, DT, aim) as HeadTurfLoad;
            const ploughing = strips * H * d * LAW.matStrength * LAW.ploughFactor;
            expect(rel(load.cap, ploughing + LAW.friction * load.bearing)).toBeLessThan(1e-12);
            expect(length(load.resistance)).toBe(0);
        }
    });

    it("sticks below the cap with k_t = (2/7)·k_w·h²·n and c_t = √(2/7)·k_w·τ_r·h²·n, and carries its spring", () => {
        // Plan decision 2. A fresh bed under the level box, 0.5·y deep and still but for a slip v along x: the spring
        // starts at rest, so the first step's trial is −(k_t·v·dt + c_t·v), far below the cap. Its n unchanged, the
        // second step carries ξ = v·dt unscaled and adds v·dt more.
        const v = 1e-3;
        const bed = newHeadTurfBed(LAW);
        const at = sunk(0.5 * YIELD, 0, vec3(v, 0, 0));
        const first = headTurfLoad(bed, at, TEST_SHARP, DT, AIM) as HeadTurfLoad;
        const kt = TANGENTIAL_STIFFNESS_RATIO * LAW.modulus * H * H * first.columns;
        const ct = Math.sqrt(TANGENTIAL_STIFFNESS_RATIO) * LAW.modulus * LAW.recovery * H * H * first.columns;
        expect(first.sliding).toBe(false);
        expect(rel(first.resistance.x, 0 - (kt * v * DT + ct * v))).toBeLessThan(1e-12);
        expect(Math.abs(first.resistance.y)).toBe(0);
        const second = headTurfLoad(bed, at, TEST_SHARP, DT, AIM) as HeadTurfLoad;
        expect(second.columns).toBe(first.columns);
        expect(rel(second.resistance.x, 0 - (kt * 2 * v * DT + ct * v))).toBeLessThan(1e-12);
    });

    it("ploughs only below the floor it left when it moves back along its furrow", () => {
        // Plan decision 1. Forward 0.1 m at depth d past yield, every column the box leaves keeps the set s = d − y.
        // Lifted out and lowered into its furrow, the box arrives over columns whose floor is −s, so each strip
        // ploughs d − s = y: the furrow is not ploughed again.
        const d = 3 * YIELD;
        const bed = newHeadTurfBed(LAW);
        for (let k = 0; k <= 1000; k++) {
            headTurfLoad(bed, sunk(d, k * 1e-4, vec3(1, 0, 0)), TEST_SHARP, 1e-4, AIM);
        }
        expect(headTurfLoad(bed, sunk(-0.01, 0.05), TEST_SHARP, 1e-4, AIM)).toBeNull();
        const back = headTurfLoad(bed, sunk(d, 0.05, vec3(-1, 0, 0)), TEST_SHARP, 1e-4, AIM) as HeadTurfLoad;
        const ploughing = back.cap - LAW.friction * back.bearing;
        expect(rel(ploughing, ROWS * H * YIELD * LAW.matStrength * LAW.ploughFactor)).toBeLessThan(1e-9);
    });
});

describe("the dead stop (design §4.3; §7.1 case 3)", () => {
    it("stops a free head at fixed depth within m·v₀²/(2·F_cap) and its spring's travel, then holds it", () => {
        // The box slides at 2 m/s, 0.5·y deep (below yield, so its columns stay elastic), its depth held. While the
        // spring slides the cap decelerates it, so it slides at most m·v₀²/(2·F_cap); the spring then sticks, holding
        // it within its elastic travel F_cap/k_t, and its dashpot (plan decision 2, overdamped on the test law) brings
        // it to rest. The cap varies by a column as the sole crosses the lattice, so the bound takes its least.
        const depth = 0.5 * YIELD;
        const m = TEST_SHARP.mass;
        const v0 = 2;
        const bed = newHeadTurfBed(LAW);
        let x = 0;
        let v = v0;
        let low = Infinity;
        let high = 0;
        let softest = Infinity;
        let restAt = -1;
        for (let k = 0; k < 200000 && (restAt < 0 || k < restAt + 2000); k++) {
            const load = headTurfLoad(bed, sunk(depth, x, vec3(v, 0, 0)), TEST_SHARP, DT, AIM) as HeadTurfLoad;
            low = Math.min(low, load.cap);
            high = Math.max(high, load.cap);
            softest = Math.min(softest, TANGENTIAL_STIFFNESS_RATIO * LAW.modulus * H * H * load.columns);
            v += (load.resistance.x / m) * DT;
            x += v * DT;
            if (restAt < 0 && !load.sliding && Math.abs(v) < HEAD_REST_SPEED) {
                restAt = k;
            }
            if (restAt >= 0) {
                expect(Math.abs(v), `step ${k}`).toBeLessThan(HEAD_REST_SPEED);
                expect(load.sliding, `step ${k}`).toBe(false);
            }
        }
        expect(restAt).toBeGreaterThan(0);
        expect(x).toBeLessThanOrEqual((m * v0 * v0) / (2 * low) + high / softest);
    });
});

describe("the angle of attack (design §4.3; §7.1 case 4)", () => {
    it("gives a steeper path a greater peak resistance, entering at the same speed and depth", () => {
        // A level sharp box driven at 2 m/s along a straight path φ below horizontal, from its sole on the turf until
        // its sole is exactly D = 3·y deep (the last step clamped to D). At that depth the geometry is the same
        // whatever φ: every column under the sole ploughs fresh turf at depth D (plan decision 1), so the ploughing
        // part of the cap, cap − µ·N_b, is the same within one row of columns' share, 2h/L (the box's travel shifts
        // the lattice under it). The steeper path presses down faster, e′ = v·sin φ, so its columns bear more through
        // the bed's recovery, and the peak cap is greater (plan decision 26).
        const D = 3 * YIELD;
        const runs = [5, 10, 20, 40, 80].map((degrees) => {
            const phi = (degrees * Math.PI) / 180;
            const velocity = vec3(2 * Math.cos(phi), 0, -2 * Math.sin(phi));
            const bed = newHeadTurfBed(LAW);
            let peak = 0;
            for (let k = 1; ; k++) {
                const t = k * DT;
                const depth = Math.min(2 * Math.sin(phi) * t, D);
                const at = state(vec3(velocity.x * t, 0, TEST_RHO - depth), velocity);
                const load = headTurfLoad(bed, at, TEST_SHARP, DT, AIM);
                peak = Math.max(peak, load?.cap ?? 0);
                if (depth === D) {
                    const last = load as HeadTurfLoad;
                    return { peak, ploughing: last.cap - LAW.friction * last.bearing };
                }
            }
        });
        for (let k = 1; k < runs.length; k++) {
            const [before, after] = [runs[k - 1], runs[k]] as [(typeof runs)[0], (typeof runs)[0]];
            expect(after.peak).toBeGreaterThan(before.peak);
            expect(rel(after.ploughing, (runs[0] as (typeof runs)[0]).ploughing)).toBeLessThan(
                (2 * LAW.cell) / TEST_SHARP.length,
            );
        }
    });
});

describe("symmetry and convergence (design §7.1 case 6)", () => {
    it("gives a box mirrored across y = 0 the mirrored load, to the bit", () => {
        const q = multiply(axisAngle(vec3(0, 0, 1), 0.2), axisAngle(vec3(0, 1, 0), -0.08));
        const start = state(vec3(0.0137, 0.0071, 0.02), vec3(1.5, 0.4, -0.3), q, vec3(0.5, -2, 1));
        const mirrored = state(
            mirrorVec(start.position),
            mirrorVec(start.velocity),
            mirrorQuat(q),
            mirrorSpin(start.angularVelocity),
        );
        const moved = (h: HeadState, k: number): HeadState => ({
            ...h,
            position: add(h.position, scale(h.velocity, k * DT)),
        });
        const a = newHeadTurfBed(LAW);
        const b = newHeadTurfBed(LAW);
        let loaded = 0;
        for (let k = 0; k < 60; k++) {
            const la = headTurfLoad(a, moved(start, k), TEST_BOX, DT, AIM);
            const lb = headTurfLoad(b, moved(mirrored, k), TEST_BOX, DT, AIM);
            if (la === null) {
                expect(lb).toBeNull();
                continue;
            }
            loaded++;
            const l = lb as HeadTurfLoad;
            expect(same(l.force, mirrorVec(la.force)), `step ${k}`).toBe(true);
            expect(same(l.torque, mirrorSpin(la.torque)), `step ${k}`).toBe(true);
            expect(l.cap).toBe(la.cap);
            expect(l.sliding).toBe(la.sliding);
        }
        expect(loaded).toBeGreaterThan(10);
    });

    it("gives a level box ploughing obliquely and its mirror the mirrored load, to the bit", () => {
        // Moving obliquely, a strip across the trial holds columns of equal ploughing depth; the column it keeps must
        // be chosen alike in the mirrored run, or the resistance's centre, and so the yaw torque, differ.
        const d = 3 * YIELD;
        const dt = 1e-4;
        const a = newHeadTurfBed(LAW);
        const b = newHeadTurfBed(LAW);
        for (let k = 0; k < 300; k++) {
            const sa = state(vec3(k * dt, 0.3 * k * dt, TEST_RHO - d), vec3(1, 0.3, 0));
            const sb = state(mirrorVec(sa.position), mirrorVec(sa.velocity));
            const la = headTurfLoad(a, sa, TEST_SHARP, dt, AIM) as HeadTurfLoad;
            const lb = headTurfLoad(b, sb, TEST_SHARP, dt, AIM) as HeadTurfLoad;
            expect(same(lb.force, mirrorVec(la.force)), `step ${k}`).toBe(true);
            expect(same(lb.torque, mirrorSpin(la.torque)), `step ${k}`).toBe(true);
            expect(lb.cap, `step ${k}`).toBe(la.cap);
        }
    });

    it("converges with the lattice: a tilted box's bearing within a boundary column's share of the exact", () => {
        // The sharp box pitched by 0.1 rad, its heel 3 mm deep, still: the sole's waterline runs across it, and every
        // column a distance x_h behind the waterline is pressed δ = x_h·tan φ. Statically each bears min(k_w·δ, p_y),
        // so N_b = 2·h_y·p_y·(X − x_y/2), X = δ_heel/tan φ and x_y = y/tan φ. A lattice of side h misses at most a
        // boundary column's share, about h/X, which falls with h.
        const phi = 0.1;
        const q = axisAngle(vec3(0, 1, 0), phi);
        const { halfWidth, halfHeight } = TEST_SHARP.shape as BoxShape;
        const half = TEST_SHARP.length / 2;
        // A positive pitch about +y turns the body's x axis to (cos φ, 0, −sin φ), so the sole's +x end is the lowest;
        // put that end 3 mm deep (the lowest corner lies half·sin φ + h_z·cos φ below the centre).
        const heel = 0.003;
        const z = 0 - heel + half * Math.sin(phi) + halfHeight * Math.cos(phi);
        const tilted = state(vec3(0.0003, 0.0001, z), ZERO, q);
        const X = heel / Math.tan(phi);
        const exact = 2 * halfWidth * LAW.yieldPressure * (X - YIELD / Math.tan(phi) / 2);
        for (const cell of [0.002, 0.001, 0.0005]) {
            const load = headTurfLoad(
                newHeadTurfBed(testHeadTurf({ cell })),
                tilted,
                TEST_SHARP,
                DT,
                AIM,
            ) as HeadTurfLoad;
            expect(rel(load.bearing, exact), `cell ${cell}`).toBeLessThan((2 * cell) / X);
        }
    });
});
