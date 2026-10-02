# P2a.2 — Push Friction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the frictionless resting-contact solver with one that applies 3D, load-coupled Coulomb friction on
every coupled contact (ball–ball and ball–obstacle, on the turf or in flight), with stick and slip events, static
friction in held clusters, lift-off when friction takes a ball's load, and a deterministic per-shot work budget.

**Architecture:** A candidate assigns a mode to every ball (held, released, turf-rolling, turf-sliding, airborne) and
every contact (open, stick, slip) of a group. One candidate is one sparse, non-symmetric linear system in the ball
accelerations, held balls' static turf forces and contact forces (`contactModel.ts`); unknown slip and release
directions are closed by residual-merit Newton on one angle per direction; undetermined forces are the minimum-norm
forces satisfying every convex condition, found by a log-barrier second-order-cone solve (`convexSolve.ts`). The group
search (`modeSolve.ts`) tries every resting ball held first, then P2a.1's frictionless proposal, then every other
candidate, fewest departures from the proposal first; the first consistent candidate wins. `push.ts` stays the
façade (glue, groups, nearest-hold fallback, push durations), and `simulate.ts` gains slip ends, stick/slip events,
the budget and the new fallback events.

**Tech Stack:** TypeScript (strict), Vitest, ESLint, Prettier. No new dependencies (`npx --yes tsx` runs the one
script).

**Spec:** `docs/superpowers/specs/2026-10-01-p2a2-push-friction-design.md` (the solver design; read all of it) and
`docs/superpowers/specs/2026-09-30-croquet-shot-lab-design.md` §5 ("Phase 2", the pushing paragraphs, the free-motion
limitations, Determinism) and §9. **Roadmap:** `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`, P2
row, P2a.2.

**Prototype provenance.** Every algorithm below was prototyped in an unmerged scratch worktree (local branch
`p2a2-prototype`, files `prototype/speed/fast/*.ts`, `prototype/review/*.ts`) and is reproduced here in full; the
plan does not depend on the worktree. Three things were not prototyped and are specified here from the design:
balls in flight inside the friction model (and lift-off), the hold-first check and proposal built from P2a.1's
frictionless guide (decided 2026-10-02), and elementary functions from exact operations (decided 2026-10-02).

## Global Constraints

- Formatting: 4-space indentation, 120-column limit (check with `grep -nE '^.{121,}$' <file>`; existing markdown
  table rows exceed it, leave them), LF line endings, UTF-8. Run `npx prettier --write` on every file you touch;
  `npm run format:check` must pass.
- Engine code (`src/engine/**`) is pure and deterministic: no DOM, no time-of-day, no randomness, no reliance on
  unspecified iteration order. Iterate balls in `BALL_IDS` order and contacts in their given order.
- Engine code uses only IEEE-exact operations: `+ − * /`, comparisons, `Math.sqrt`, `Math.abs`, `Math.min`,
  `Math.max`, `Math.round`, `Math.floor`. No `Math.sin/cos/atan2/hypot/log/exp/pow/…`, no `**`; use
  `src/engine/math/elementary.ts` (Task 1). Enforced by `npm run lint`.
- No non-null assertions (`!`); the repo style is `x as number` / `x as Vec3` after indexing.
- Units are SI and forces are mass-normalised (m/s²). A ball on the turf has `z = R` and `vz = 0` exactly; any other
  state is airborne (`classify`).
- Tolerances, exactly: `FOLLOW_EPSILON = 1e-9` (m/s²), `HOLD_SLACK = 1e-8` (m/s²), `FORCE_EPSILON = 1e-9`,
  `ACCELERATION_EPSILON = 1e-9`, `CONVEX_SLACK = 1e-10`, `MODE_SEARCH_LIMIT = 1024`, Armijo halvings 30,
  `NEWTON_ITERATIONS = 60`, `NEWTON_STEP_TOLERANCE = 1e-11` (rad), continuation scales `[1e-3, 0.1, 0.25, 0.5, 0.75,
  1]`, forward scan 24 points (one direction) or 12 × 12 (two). Each named constant's comment says why it is not
  physical.
- `ENGINE_VERSION` becomes `"0.3.0"` (Task 8). `SOLVE_BUDGET = 22_000_000` work units per shot (Task 8; work units
  as defined in Task 2 and Task 3).
- Croquet has exactly four balls: never test or reason about five-ball clusters.
- Tests assert decisions and feasibility, never certificate forces of a held configuration (they are not unique).
- Slow tests (brute-force limit checks, the 20,000-cluster cap measurement) run only when the environment variable
  `SLOW_TESTS` is set, via `it.skipIf(!process.env.SLOW_TESTS)`.
- Public/exported functions carry a header comment; cognitively complex code carries explanatory comments.
- Commit messages: short imperative sentence (repo style). Commits are signed; if signing refuses, leave the change
  staged and report it instead of committing unsigned.
- After every task: `npm test`, `npm run lint`, `npm run check` and `npm run format:check` all pass.

## Review Focus

1. **Every straight push rubs vertically.** A rolling pair's contact points slip vertically at twice their speed, so
   every push now has a slipping contact with a frozen direction and a slip end. A push to rest must take a handful of
   segments, not a storm of regroups. Pinned in Task 8 (straight topspin push: at most 12 resting-contact solves).
2. **Spin about the vertical axis.** It is locked while a ball's patch does not slip (held, rolling, released) and
   free while it slides or flies; a rolling ball keeps the spin it carries and drops it when it stops. Pinned in
   Task 7 (a rolling ball with sidespin pushed: angular acceleration about z exactly 0; a sliding one: not 0) and
   Task 8 (the ball comes to rest with zero spin).
3. **Lift-off from the turf.** A turf ball solved as airborne starts at `z = R`, `vz = 0` with upward acceleration;
   `landingTime` returned 0 for that state, which would land it at once, forever. Pinned in Task 8 (a lifted ball
   rises and is not landed at the instant it lifts).
4. **The work budget runs out mid-shot.** Every later group of the shot must go straight to the nearest hold with a
   `budget-hold` event, and the shot must still finish without aborting. Pinned in Task 8 (a shot with a tiny
   budget).
5. **Stick/slip at the stick boundary.** A contact whose slip reaches zero sticks; it must not alternate stick and
   slip every segment. Pinned in Task 8 (topspin into backspin: exactly one stick and one slip event, then rest).

---

## File Structure

| Path | Change |
|---|---|
| `src/engine/math/elementary.ts` | New: `ln`, `sinCos`, `atan2` from exact operations |
| `src/engine/linalg.ts` | New: sparse affine forms, elimination with factor reuse, rank-revealing min-norm solve, work units |
| `src/engine/convexSolve.ts` | New: log-barrier second-order-cone feasibility and minimum norm |
| `src/engine/contactModel.ts` | New: bodies, contacts, modes, candidate assembly, evaluation, consistency, cones, tolerances |
| `src/engine/modeSolve.ts` | New: candidate solve (Newton, scan, continuation), proposal (P2a.1 guide), group search, last resorts |
| `src/engine/push.ts` | Façade rewritten around the new solver; keeps glue, groups, nearest hold, push durations |
| `src/engine/motion.ts` | `landingTime` lets a ball at rest on the plane with upward acceleration rise |
| `src/engine/simulate.ts` | Friction and turf inputs, coupling modes, stick/slip events, slip ends, work budget, new events |
| `src/engine/types.ts` | `ShotEvent`: stick/slip, `approximate-slip`, `budget-hold` |
| `tests/engine/math/elementary.test.ts`, `tests/engine/linalg.test.ts`, `tests/engine/convexSolve.test.ts`, `tests/engine/contactModel.test.ts`, `tests/engine/modeSolve.test.ts` | New unit tests |
| `tests/engine/support/clusters.ts` | New: seeded four-ball cluster generator with court-realistic obstacles |
| `tests/engine/support/bruteForce.ts` | Load-scaled turf forces from push impulses, twist lock |
| `tests/engine/{push,simulate,lift,crossCheck,fuzz,motion}.test.ts` | Re-derived with friction on; new scenarios |
| `scripts/shotMix.ts` | New: realistic shot-mix measurement |
| `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md` | P2a.2 met; outcomes carried forward |

Task order keeps every commit green. Tasks 1–6 add new modules beside the P2a.1 solver; Task 7 switches the façade
with contact friction still 0 in the simulator (so every simulation test must pass unchanged: the new solver at
μ = 0 must reproduce P2a.1); Task 8 switches friction on in the simulator; Task 9 brings brute force up to the same
physics and removes the cross-check's frictionless overrides.

---

### Task 1: Elementary functions from exact operations

The solver parameterises an unknown slip or release direction by an angle (Task 5) and uses a logarithmic barrier
(Task 3). `Math.sin`, `Math.cos`, `Math.atan2` and `Math.log` are not guaranteed bit-identical across JavaScript
engines and are banned in `src/engine/**`. These replacements use only `+ − * /` and `Math.sqrt`, so every engine
computes the same bits; they are accurate to a few ulps.

**Files:**
- Create: `src/engine/math/elementary.ts`
- Test: `tests/engine/math/elementary.test.ts`

**Interfaces:**
- Produces: `ln(x: number): number`, `sinCos(phi: number): readonly [number, number]` (sine, cosine),
  `atan2(y: number, x: number): number` (finite inputs; `atan2(0, 0) = 0`).

- [ ] **Step 1: Write the failing tests**

Create `tests/engine/math/elementary.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { atan2, ln, sinCos } from "../../../src/engine/math/elementary";
import { rng } from "../support/rng";

const EPS = Number.EPSILON;

/** |a − reference| within `ulps` units of the reference's magnitude (at least 1). */
function close(a: number, reference: number, ulps: number): boolean {
    return Math.abs(a - reference) <= ulps * EPS * Math.max(1, Math.abs(reference));
}

describe("ln", () => {
    it("agrees with Math.log to a few ulps over the whole range", () => {
        const random = rng(3);
        for (let n = 0; n < 5000; n++) {
            const x = (0.5 + random()) * Math.pow(2, Math.floor(random() * 2000) - 1000);
            expect(close(ln(x), Math.log(x), 4), `x = ${x}`).toBe(true);
        }
    });

    it("keeps its relative accuracy near 1, where the result is small", () => {
        for (const x of [1 + 1e-12, 1 - 1e-12, 1.0001, 0.9999, 1.4, 0.71]) {
            const reference = Math.log(x);
            expect(Math.abs(ln(x) - reference), `x = ${x}`).toBeLessThanOrEqual(4 * EPS * Math.abs(reference));
        }
        expect(ln(1)).toBe(0);
    });

    it("handles the edges", () => {
        expect(ln(0)).toBe(-Infinity);
        expect(ln(Infinity)).toBe(Infinity);
        expect(ln(-1)).toBeNaN();
        expect(close(ln(Number.MIN_VALUE), Math.log(Number.MIN_VALUE), 4)).toBe(true);
    });
});

describe("sinCos", () => {
    it("agrees with Math.sin and Math.cos to a few ulps", () => {
        const random = rng(5);
        for (let n = 0; n < 5000; n++) {
            const phi = (random() - 0.5) * 40;
            const [s, c] = sinCos(phi);
            expect(Math.abs(s - Math.sin(phi)), `phi = ${phi}`).toBeLessThanOrEqual(4 * EPS);
            expect(Math.abs(c - Math.cos(phi)), `phi = ${phi}`).toBeLessThanOrEqual(4 * EPS);
        }
    });

    it("is exact at zero and turns by quarter turns", () => {
        expect(sinCos(0)).toEqual([0, 1]);
        const [s, c] = sinCos(Math.PI / 2);
        expect(Math.abs(s - 1)).toBeLessThanOrEqual(EPS);
        expect(Math.abs(c)).toBeLessThanOrEqual(1e-16);
    });
});

describe("atan2", () => {
    it("agrees with Math.atan2 in every quadrant and at every scale", () => {
        const random = rng(7);
        for (let n = 0; n < 5000; n++) {
            const y = (random() - 0.5) * Math.pow(10, Math.floor(random() * 6) - 3);
            const x = (random() - 0.5) * Math.pow(10, Math.floor(random() * 6) - 3);
            expect(Math.abs(atan2(y, x) - Math.atan2(y, x)), `(${y}, ${x})`).toBeLessThanOrEqual(8 * EPS);
        }
    });

    it("handles the axes", () => {
        expect(atan2(0, 1)).toBe(0);
        expect(Math.abs(atan2(1, 0) - Math.PI / 2)).toBeLessThanOrEqual(EPS);
        expect(Math.abs(atan2(0, -1) - Math.PI)).toBeLessThanOrEqual(2 * EPS);
        expect(Math.abs(atan2(-1, 0) + Math.PI / 2)).toBeLessThanOrEqual(EPS);
        expect(atan2(0, 0)).toBe(0);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/math/elementary.test.ts`
Expected: FAIL (cannot resolve `../../../src/engine/math/elementary`).

- [ ] **Step 3: Implement**

Create `src/engine/math/elementary.ts`:

```ts
/**
 * Elementary functions from IEEE-exact operations only (+ − × ÷ and Math.sqrt), so that every JavaScript engine
 * computes the same bits. Math.sin, Math.log and the like are not guaranteed bit-identical across engines, which
 * would make results engine-dependent (spec §5, Determinism). Accurate to a few ulps (tests compare with Math.*).
 */

/** ln 2 split so that k·LN2_HI is exact for |k| < 2^11 (Cody and Waite); LN2_LO is the remainder. */
const LN2_HI = 6.9314718036912381649e-1;
const LN2_LO = 1.9082149292705877e-10;

/** 2^64 and 2^-64: scaling by them is exact, which brings any positive double near 1 in a few steps. */
const TWO_64 = 18446744073709551616;
const TWO_MINUS_64 = 1 / TWO_64;

/** π/2 split so that k·PIO2_HI is exact for |k| < 2^20 (its 33 leading bits); PIO2_LO is the remainder. */
const PIO2_HI = 1.5707963267341256142e0;
const PIO2_LO = 6.0771005065061922493e-11;
const TWO_OVER_PI = 0.6366197723675814;

/**
 * Natural logarithm. x = m·2^k with m in [√½, √2), then ln m = 2·atanh(s) with s = (m − 1)/(m + 1), |s| ≤ 0.1716,
 * summed to s²¹ (the next term is below 1e-17 of the sum). NaN for x < 0 or NaN, −Infinity for 0.
 */
export function ln(x: number): number {
    if (Number.isNaN(x) || x < 0) {
        return NaN;
    }
    if (x === 0) {
        return -Infinity;
    }
    if (x === Infinity) {
        return Infinity;
    }
    let m = x;
    let k = 0;
    while (m >= TWO_64) {
        m *= TWO_MINUS_64;
        k += 64;
    }
    while (m < TWO_MINUS_64) {
        m *= TWO_64;
        k -= 64;
    }
    while (m >= Math.SQRT2) {
        m *= 0.5;
        k += 1;
    }
    while (m < Math.SQRT1_2) {
        m *= 2;
        k -= 1;
    }
    const s = (m - 1) / (m + 1);
    const s2 = s * s;
    // 1 + s²/3 + s⁴/5 + … + s²⁰/21, by Horner from the innermost term.
    let p = 1 / 21;
    for (let j = 19; j >= 1; j -= 2) {
        p = 1 / j + s2 * p;
    }
    return k * LN2_HI + (k * LN2_LO + 2 * s * p);
}

/**
 * Sine and cosine of `phi`, for |phi| up to about 1e5. phi = k·π/2 + r with |r| ≤ π/4 (Cody–Waite reduction), then
 * the Taylor series of sin r to r¹⁷ and cos r to r¹⁸ (the next terms are below 1e-19), rotated by k quarter turns.
 */
export function sinCos(phi: number): readonly [number, number] {
    const k = Math.round(phi * TWO_OVER_PI);
    const r = phi - k * PIO2_HI - k * PIO2_LO;
    const r2 = r * r;
    // sin r = r·(1 − r²/(2·3)·(1 − r²/(4·5)·(…))) and cos r = 1 − r²/(1·2)·(1 − r²/(3·4)·(…)).
    let s = 1;
    for (let j = 8; j >= 1; j--) {
        s = 1 - (r2 / (2 * j * (2 * j + 1))) * s;
    }
    s *= r;
    let c = 1;
    for (let j = 9; j >= 1; j--) {
        c = 1 - (r2 / ((2 * j - 1) * (2 * j))) * c;
    }
    const quarter = ((k % 4) + 4) % 4;
    switch (quarter) {
        case 0:
            return [s, c];
        case 1:
            return [c, 0 - s];
        case 2:
            return [0 - s, 0 - c];
        default:
            return [0 - c, s];
    }
}

/** Arctangent of t in [0, 1]: two half-angle reductions leave |u| ≤ tan(π/16), then the series to u²⁵. */
function atanUnit(t: number): number {
    const u1 = t / (1 + Math.sqrt(1 + t * t));
    const u = u1 / (1 + Math.sqrt(1 + u1 * u1));
    const u2 = u * u;
    // 1 − u²/3 + u⁴/5 − … + u²⁴/25, by Horner from the innermost term.
    let p = 1 / 25;
    for (let j = 23; j >= 1; j -= 2) {
        p = 1 / j - u2 * p;
    }
    return 4 * u * p;
}

/**
 * The angle of (x, y) in (−π, π], as Math.atan2, for finite inputs. atan2(0, 0) is 0 (the solver's convention for a
 * direction it has no information about).
 */
export function atan2(y: number, x: number): number {
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    if (ax === 0 && ay === 0) {
        return 0;
    }
    let a = ay > ax ? Math.PI / 2 - atanUnit(ax / ay) : atanUnit(ay / ax);
    if (x < 0) {
        a = Math.PI - a;
    }
    return y < 0 ? 0 - a : a;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/math/elementary.test.ts` then `npm run lint` and `npm run check`
Expected: all pass. If an accuracy assertion fails by a small margin, report the worst case rather than loosening the
test.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/engine/math/elementary.ts tests/engine/math/elementary.test.ts
git add src/engine/math/elementary.ts tests/engine/math/elementary.test.ts
git commit -m "Add deterministic ln, sinCos and atan2 for the engine"
```

---

### Task 2: Linear algebra and sparse affine forms

The candidate systems are small (at most about 50 unknowns) and mostly zero, often singular (a ball stuck to a held
ball, a ball jammed between three bodies). This module is the prototype's `linalg.ts` with its speed changes (zero
entries of the pivot row skipped, factor reuse), the sparse affine forms its assembly uses, and work counting for the
per-shot budget instead of global diagnostic state.

**Files:**
- Create: `src/engine/linalg.ts`
- Test: `tests/engine/linalg.test.ts`

**Interfaces:**
- Produces:
  - `interface Work { units: number }`; `type Matrix = readonly (readonly number[])[]`.
  - `interface Factored { n; u; pivots; factors }`; `factor(m: Matrix, work: Work): Factored | null`;
    `solveFactored(lu: Factored, b: readonly number[], work: Work): number[]`;
    `solveLinear(m: Matrix, b: readonly number[], work: Work): number[] | null`.
  - `interface SystemSolution { x: number[]; basis: readonly (readonly number[])[]; lu: Factored | null }`;
    `solveSystem(m: Matrix, b: readonly number[], work: Work): SystemSolution | null`.
  - `interface Affine { idx: number[]; val: number[]; c: number }`; `affine(c?: number): Affine`;
    `variable(i: number): Affine`; `accumulate(acc: Affine, a: Affine, s: number): void`;
    `scaled(a: Affine, s: number): Affine`; `valueOf(a: Affine, x: readonly number[]): number`;
    `linearValue(a: Affine, dx: readonly number[]): number`; `denseRow(a: Affine, n: number): number[]`.

- [ ] **Step 1: Write the failing tests**

Create `tests/engine/linalg.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
    accumulate,
    affine,
    denseRow,
    factor,
    linearValue,
    scaled,
    solveFactored,
    solveLinear,
    solveSystem,
    valueOf,
    variable,
    type Work,
} from "../../src/engine/linalg";
import { rng } from "./support/rng";

const work = (): Work => ({ units: 0 });

function multiply(m: readonly (readonly number[])[], x: readonly number[]): number[] {
    return m.map((row) => row.reduce((sum, v, c) => sum + v * (x[c] as number), 0));
}

describe("solveLinear", () => {
    it("solves a regular system", () => {
        const m = [
            [2, 1, 0],
            [1, 3, 1],
            [0, 1, 4],
        ];
        const x = solveLinear(m, [3, 5, 5], work()) as number[];
        expect(x[0]).toBeCloseTo(1, 14);
        expect(x[1]).toBeCloseTo(1, 14);
        expect(x[2]).toBeCloseTo(1, 14);
    });

    it("returns null for a singular system", () => {
        expect(
            solveLinear(
                [
                    [1, 2],
                    [2, 4],
                ],
                [1, 2],
                work(),
            ),
        ).toBeNull();
    });

    it("reuses a factorisation bit for bit", () => {
        const random = rng(13);
        for (let n = 0; n < 50; n++) {
            const size = 1 + Math.floor(random() * 8);
            const m = Array.from({ length: size }, () =>
                Array.from({ length: size }, () => (random() < 0.4 ? 0 : random() - 0.5)),
            );
            const b = Array.from({ length: size }, () => random() - 0.5);
            const lu = factor(m, work());
            if (!lu) {
                continue;
            }
            expect(solveFactored(lu, b, work())).toEqual(solveLinear(m, b, work()));
        }
    });

    it("counts n³ work units per factorisation and n² per kept-factor solve", () => {
        const w = work();
        const lu = factor(
            [
                [1, 0, 0],
                [0, 2, 0],
                [0, 0, 3],
            ],
            w,
        );
        expect(w.units).toBe(27);
        solveFactored(lu as NonNullable<typeof lu>, [1, 1, 1], w);
        expect(w.units).toBe(36);
    });
});

describe("solveSystem", () => {
    it("solves a regular system and keeps its factorisation", () => {
        const s = solveSystem(
            [
                [4, 1],
                [1, 3],
            ],
            [1, 2],
            work(),
        );
        expect(s?.basis).toEqual([]);
        expect(s?.lu).not.toBeNull();
        expect(multiply([[4, 1], [1, 3]], s?.x as number[])[1]).toBeCloseTo(2, 14);
    });

    it("returns the minimum-norm solution and a null-space basis of a consistent singular system", () => {
        const m = [
            [1, 1],
            [2, 2],
        ];
        const s = solveSystem(m, [2, 4], work());
        expect(s?.lu).toBeNull();
        expect(s?.basis.length).toBe(1);
        const v = s?.basis[0] as readonly number[];
        expect(multiply(m, v).every((r) => Math.abs(r) < 1e-15)).toBe(true);
        expect(s?.x[0]).toBeCloseTo(1, 14);
        expect(s?.x[1]).toBeCloseTo(1, 14);
        // Minimum norm: orthogonal to the null space.
        expect((s?.x[0] as number) * (v[0] as number) + (s?.x[1] as number) * (v[1] as number)).toBeCloseTo(0, 14);
    });

    it("returns null for an inconsistent singular system", () => {
        expect(
            solveSystem(
                [
                    [1, 1],
                    [2, 2],
                ],
                [2, 5],
                work(),
            ),
        ).toBeNull();
    });
});

describe("affine forms", () => {
    it("accumulates, scales and evaluates sparse forms", () => {
        const f = affine(1);
        accumulate(f, variable(2), 3);
        accumulate(f, variable(0), -1);
        accumulate(f, variable(2), 0.5);
        expect(f.idx).toEqual([2, 0]);
        expect(f.val).toEqual([3.5, -1]);
        expect(valueOf(f, [2, 9, 4])).toBe(1 + 3.5 * 4 - 2);
        expect(linearValue(f, [2, 9, 4])).toBe(3.5 * 4 - 2);
        expect(denseRow(f, 4)).toEqual([-1, 0, 3.5, 0]);
        const g = scaled(f, 2);
        expect(valueOf(g, [2, 9, 4])).toBe(2 * (1 + 3.5 * 4 - 2));
        accumulate(f, g, 0);
        expect(f.idx).toEqual([2, 0]);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/linalg.test.ts`
Expected: FAIL (cannot resolve `../../src/engine/linalg`).

- [ ] **Step 3: Implement**

Create `src/engine/linalg.ts`:

```ts
/**
 * Linear algebra and sparse affine forms for the resting-contact solver (P2a.2 design §3).
 *
 * A candidate's system has at most about 50 unknowns (four balls, nine contacts) and is mostly zero, and it is often
 * singular but consistent (a ball stuck to a held ball; a ball jammed between three or more bodies). Elimination skips
 * the zero entries of each pivot row, a factorisation is kept for further right-hand sides, and the rank-revealing
 * solve returns the minimum-norm solution together with a basis of the null space.
 *
 * Every routine adds its cost to a Work counter, in work units: n³ for a factorisation (a dense solve is one), n² for
 * a solve with a kept factorisation, and 2·n³ more for the rank-revealing path. The solver's budget per shot is counted
 * in these units rather than in time, so that its results are identical on every device.
 */

/** Running count of solver work units (see the module comment). */
export interface Work {
    units: number;
}

/** A dense matrix as rows. */
export type Matrix = readonly (readonly number[])[];

/** Pivots at or below this fraction of the matrix's largest entry make a system singular. A numerical tolerance. */
const PIVOT_TOLERANCE = 1e-13;

/**
 * The rank-revealing elimination stops at pivots at or below this fraction of the largest entry; the remaining columns
 * span the null space. A numerical tolerance: the systems' entries are of order 1, so true pivots are far larger.
 */
const RANK_TOLERANCE = 1e-10;

/**
 * A singular system is consistent when every row left over by the rank-revealing elimination has a right-hand side of
 * at most this times max(1, largest right-hand side). A numerical tolerance (m/s² for force rows).
 */
const CONSISTENCY_TOLERANCE = 1e-9;

function entry(m: Matrix, r: number, c: number): number {
    return (m[r] as readonly number[])[c] as number;
}

function largest(m: Matrix): number {
    let scale = 0;
    for (const row of m) {
        for (const v of row) {
            scale = Math.max(scale, Math.abs(v));
        }
    }
    return scale;
}

function dotArrays(u: readonly number[], v: readonly number[]): number {
    let sum = 0;
    for (let i = 0; i < u.length; i++) {
        sum += (u[i] as number) * (v[i] as number);
    }
    return sum;
}

/**
 * An elimination with partial pivoting, kept to solve further right-hand sides: `pivots[col]` is the row swapped into
 * place at step col, `factors[r][col]` the multiple of the pivot row subtracted from row r at that step (rows of
 * `factors` were swapped with their rows), and `u` the upper triangle.
 */
export interface Factored {
    readonly n: number;
    readonly u: readonly (readonly number[])[];
    readonly pivots: readonly number[];
    readonly factors: readonly (readonly number[])[];
}

/** Factorises the square matrix m by elimination with partial pivoting; null when it is singular. */
export function factor(m: Matrix, work: Work): Factored | null {
    const n = m.length;
    work.units += n * n * n;
    if (n === 0) {
        return { n, u: [], pivots: [], factors: [] };
    }
    const scale = largest(m);
    if (scale === 0) {
        return null;
    }
    const a = m.map((row) => [...row]);
    const pivots = new Array<number>(n).fill(0);
    const factors = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    for (let col = 0; col < n; col++) {
        let pivot = col;
        for (let r = col + 1; r < n; r++) {
            if (Math.abs(entry(a, r, col)) > Math.abs(entry(a, pivot, col))) {
                pivot = r;
            }
        }
        if (Math.abs(entry(a, pivot, col)) <= PIVOT_TOLERANCE * scale) {
            return null;
        }
        pivots[col] = pivot;
        [a[col], a[pivot]] = [a[pivot] as number[], a[col] as number[]];
        [factors[col], factors[pivot]] = [factors[pivot] as number[], factors[col] as number[]];
        const top = a[col] as number[];
        // Only the pivot row's non-zero columns change the rows below it (x − f·0 = x).
        const nonzero: number[] = [];
        for (let c = col; c < n; c++) {
            if (top[c] !== 0) {
                nonzero.push(c);
            }
        }
        for (let r = col + 1; r < n; r++) {
            const row = a[r] as number[];
            const f = (row[col] as number) / (top[col] as number);
            (factors[r] as number[])[col] = f;
            if (f === 0) {
                continue;
            }
            for (const c of nonzero) {
                row[c] = (row[c] as number) - f * (top[c] as number);
            }
        }
    }
    return { n, u: a, pivots, factors };
}

/**
 * Solves with a kept factorisation. Every swap is applied first, then the eliminations in step order; since the
 * factors were swapped with their rows, each entry of b sees the same operations as in an interleaved elimination.
 */
export function solveFactored(lu: Factored, b: readonly number[], work: Work): number[] {
    const { n, u, pivots, factors } = lu;
    work.units += n * n;
    const y = [...b];
    for (let col = 0; col < n; col++) {
        const p = pivots[col] as number;
        [y[col], y[p]] = [y[p] as number, y[col] as number];
    }
    for (let col = 0; col < n; col++) {
        const yc = y[col] as number;
        for (let r = col + 1; r < n; r++) {
            const f = entry(factors, r, col);
            if (f !== 0) {
                y[r] = (y[r] as number) - f * yc;
            }
        }
    }
    const x = new Array<number>(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
        let sum = y[r] as number;
        const row = u[r] as readonly number[];
        for (let c = r + 1; c < n; c++) {
            sum -= (row[c] as number) * (x[c] as number);
        }
        x[r] = sum / (row[r] as number);
    }
    return x;
}

/** Solves m·x = b; null when m is singular. */
export function solveLinear(m: Matrix, b: readonly number[], work: Work): number[] | null {
    const lu = factor(m, work);
    return lu ? solveFactored(lu, b, work) : null;
}

/** A solution of m·x = b. */
export interface SystemSolution {
    /** The solution; the minimum-norm one when m is singular. */
    readonly x: number[];
    /** A basis of m's null space (empty when m is regular). Not orthonormal. */
    readonly basis: readonly (readonly number[])[];
    /** The factorisation of a regular m, for further right-hand sides; null when m is singular. */
    readonly lu: Factored | null;
}

/**
 * Solves m·x = b. When m is singular but the system is consistent, returns the minimum-norm solution and a basis of
 * the null space: Gauss–Jordan elimination with full pivoting gives a particular solution and the basis (each free
 * column set to 1), and the particular solution is projected off the null space, x = p − B·(BᵀB)⁻¹·Bᵀp. Null when the
 * system is inconsistent.
 */
export function solveSystem(m: Matrix, b: readonly number[], work: Work): SystemSolution | null {
    const lu = factor(m, work);
    if (lu) {
        return { x: solveFactored(lu, b, work), basis: [], lu };
    }
    const n = b.length;
    work.units += 2 * n * n * n;
    const scale = largest(m);
    if (scale === 0) {
        return null;
    }
    const rows = m.map((row, i) => [...row, b[i] as number]);
    const pivotColumns: number[] = [];
    const used = new Array<boolean>(n).fill(false);
    let rank = 0;
    for (; rank < n; rank++) {
        let best = 0;
        let bestRow = -1;
        let bestColumn = -1;
        for (let i = rank; i < n; i++) {
            for (let c = 0; c < n; c++) {
                if (!used[c] && Math.abs(entry(rows, i, c)) > best) {
                    best = Math.abs(entry(rows, i, c));
                    bestRow = i;
                    bestColumn = c;
                }
            }
        }
        if (best <= RANK_TOLERANCE * scale) {
            break;
        }
        [rows[rank], rows[bestRow]] = [rows[bestRow] as number[], rows[rank] as number[]];
        used[bestColumn] = true;
        pivotColumns.push(bestColumn);
        const pivotRow = rows[rank] as number[];
        const p = pivotRow[bestColumn] as number;
        for (let c = 0; c <= n; c++) {
            pivotRow[c] = (pivotRow[c] as number) / p;
        }
        const nonzero: number[] = [];
        for (let c = 0; c <= n; c++) {
            if (pivotRow[c] !== 0) {
                nonzero.push(c);
            }
        }
        for (let i = 0; i < n; i++) {
            if (i === rank) {
                continue;
            }
            const row = rows[i] as number[];
            const f = row[bestColumn] as number;
            if (f !== 0) {
                for (const c of nonzero) {
                    row[c] = (row[c] as number) - f * (pivotRow[c] as number);
                }
            }
        }
    }
    let bScale = 0;
    for (const v of b) {
        bScale = Math.max(bScale, Math.abs(v));
    }
    for (let i = rank; i < n; i++) {
        if (Math.abs(entry(rows, i, n)) > CONSISTENCY_TOLERANCE * Math.max(1, bScale)) {
            return null;
        }
    }
    const particular = new Array<number>(n).fill(0);
    pivotColumns.forEach((c, i) => {
        particular[c] = entry(rows, i, n);
    });
    const basis: number[][] = [];
    for (let f = 0; f < n; f++) {
        if (used[f]) {
            continue;
        }
        const v = new Array<number>(n).fill(0);
        v[f] = 1;
        pivotColumns.forEach((c, i) => {
            v[c] = 0 - entry(rows, i, f);
        });
        basis.push(v);
    }
    const gram = basis.map((u) => basis.map((v) => dotArrays(u, v)));
    const projection = basis.map((u) => dotArrays(u, particular));
    const coefficients = solveLinear(gram, projection, work);
    if (!coefficients) {
        return { x: particular, basis, lu: null };
    }
    const x = [...particular];
    basis.forEach((v, j) => {
        for (let i = 0; i < n; i++) {
            x[i] = (x[i] as number) - (coefficients[j] as number) * (v[i] as number);
        }
    });
    return { x, basis, lu: null };
}

/**
 * A sparse affine form over the unknowns x of a system: c + Σ val[q]·x[idx[q]]. Entries keep the order in which
 * assembly first touched them, which the assembly fixes, so evaluation is deterministic.
 */
export interface Affine {
    readonly idx: number[];
    readonly val: number[];
    c: number;
}

/** The constant form c. */
export function affine(c = 0): Affine {
    return { idx: [], val: [], c };
}

/** The form x[i]. */
export function variable(i: number): Affine {
    return { idx: [i], val: [1], c: 0 };
}

/** acc += s·a. Adding s·0 changes no value, so s = 0 is skipped. */
export function accumulate(acc: Affine, a: Affine, s: number): void {
    if (s === 0) {
        return;
    }
    acc.c += s * a.c;
    for (let q = 0; q < a.idx.length; q++) {
        const j = a.idx[q] as number;
        const p = acc.idx.indexOf(j);
        if (p < 0) {
            acc.idx.push(j);
            acc.val.push(s * (a.val[q] as number));
        } else {
            acc.val[p] = (acc.val[p] as number) + s * (a.val[q] as number);
        }
    }
}

/** s·a, as a new form. */
export function scaled(a: Affine, s: number): Affine {
    return { idx: [...a.idx], val: a.val.map((v) => v * s), c: a.c * s };
}

/** The form's value at x. */
export function valueOf(a: Affine, x: readonly number[]): number {
    let sum = a.c;
    for (let q = 0; q < a.idx.length; q++) {
        sum += (a.val[q] as number) * (x[a.idx[q] as number] as number);
    }
    return sum;
}

/** The form's linear part applied to dx (its change when x changes by dx). */
export function linearValue(a: Affine, dx: readonly number[]): number {
    let sum = 0;
    for (let q = 0; q < a.idx.length; q++) {
        sum += (a.val[q] as number) * (dx[a.idx[q] as number] as number);
    }
    return sum;
}

/** The form's linear part as a dense row of n entries. */
export function denseRow(a: Affine, n: number): number[] {
    const row = new Array<number>(n).fill(0);
    a.idx.forEach((j, q) => {
        row[j] = a.val[q] as number;
    });
    return row;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/linalg.test.ts` then `npm run lint` and `npm run check`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/engine/linalg.ts tests/engine/linalg.test.ts
git add src/engine/linalg.ts tests/engine/linalg.test.ts
git commit -m "Add sparse affine forms and rank-revealing linear solves"
```

---

### Task 3: Second-order-cone solve by log barrier

One convex primitive serves the hold-first check and the choice of undetermined forces (design §3, §4 steps 2 and 5).
It is the prototype's `convexSub.ts` made generic over cones: the caller passes affine cone forms, a particular
solution and a null-space basis. Each cone carries its own relaxation: `CONVEX_SLACK` for contact and load conditions,
`HOLD_SLACK` for held balls' limits (Task 4), so that the solver's hold decisions are those of design §4.

**Files:**
- Create: `src/engine/convexSolve.ts`
- Test: `tests/engine/convexSolve.test.ts`

**Interfaces:**
- Consumes: Task 1 `ln`; Task 2 `Affine`, `valueOf`, `linearValue`, `solveLinear`, `Work`.
- Produces: `CONVEX_SLACK = 1e-10`; `interface Cone { u: readonly Affine[]; v: Affine; slack: number }` (meaning
  ‖u(x)‖ ≤ v(x) + slack; with no u, v(x) + slack ≥ 0); `interface ConvexResult { x: number[]; excess: number }`;
  `excessAt(cones, x): number` (worst ‖u‖ − v − slack; ≤ 0 means every relaxed cone holds);
  `solveConvex(cones, xp, basis, work): ConvexResult`.

- [ ] **Step 1: Write the failing tests**

Create `tests/engine/convexSolve.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CONVEX_SLACK, excessAt, solveConvex, type Cone } from "../../src/engine/convexSolve";
import { accumulate, affine, variable, type Affine, type Work } from "../../src/engine/linalg";

/** The form c + Σ terms[i]·x[i]. */
function form(c: number, terms: readonly number[]): Affine {
    const f = affine(c);
    terms.forEach((t, i) => accumulate(f, variable(i), t));
    return f;
}

const at = (v: number): Cone => ({ u: [], v: form(-v, [0, 1]), slack: CONVEX_SLACK });

describe("solveConvex", () => {
    it("returns the particular solution itself when it already satisfies every cone", () => {
        const w: Work = { units: 0 };
        const r = solveConvex([at(-1)], [2, 0], [[0, 1]], w);
        expect(r.x).toEqual([2, 0]);
        expect(r.excess).toBeLessThanOrEqual(0);
    });

    it("finds the minimum-norm point of a half-plane", () => {
        // x = (2, z); x₂ ≥ 1: the smallest x is (2, 1).
        const r = solveConvex([at(1)], [2, 0], [[0, 1]], { units: 0 });
        expect(r.x[0]).toBe(2);
        expect(r.x[1]).toBeCloseTo(1, 6);
        expect(r.excess).toBeLessThanOrEqual(0);
    });

    it("finds the minimum-norm point of a disc (a second-order cone)", () => {
        // x = (z₁, z₂, 1); ‖(x₁ − 2, x₂)‖ ≤ 1·x₃: the smallest x is (1, 0, 1).
        const disc: Cone = { u: [form(-2, [1, 0, 0]), form(0, [0, 1, 0])], v: form(0, [0, 0, 1]), slack: 0 };
        const r = solveConvex(
            [disc],
            [0, 0, 1],
            [
                [1, 0, 0],
                [0, 1, 0],
            ],
            { units: 0 },
        );
        expect(r.x[0]).toBeCloseTo(1, 6);
        expect(r.x[1]).toBeCloseTo(0, 6);
        expect(r.x[2]).toBe(1);
        expect(excessAt([disc], r.x)).toBeLessThanOrEqual(1e-9);
    });

    it("reports the smallest worst violation when the cones do not meet", () => {
        // x₂ ≥ 1 and x₂ ≤ −1: the best is x₂ = 0, violating both by 1.
        const below: Cone = { u: [], v: form(-1, [0, -1]), slack: CONVEX_SLACK };
        const r = solveConvex([at(1), below], [2, 0], [[0, 1]], { units: 0 });
        expect(r.excess).toBeGreaterThan(0);
        expect(r.excess).toBeCloseTo(1, 6);
        expect(r.x[1]).toBeCloseTo(0, 6);
    });

    it("is deterministic and counts its work", () => {
        const a: Work = { units: 0 };
        const b: Work = { units: 0 };
        const first = solveConvex([at(1)], [2, 0], [[0, 1]], a);
        const second = solveConvex([at(1)], [2, 0], [[0, 1]], b);
        expect(first).toStrictEqual(second);
        expect(a.units).toBe(b.units);
        expect(a.units).toBeGreaterThan(0);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/convexSolve.test.ts`
Expected: FAIL (cannot resolve `../../src/engine/convexSolve`).

- [ ] **Step 3: Implement**

Create `src/engine/convexSolve.ts`:

```ts
/**
 * Second-order-cone feasibility and minimum norm by a logarithmic barrier (P2a.2 design §3; §4 steps 2 and 5).
 *
 * The unknowns are x = xp + B·z: a particular solution of a candidate's linear system plus any combination of a basis
 * B of its null space, so every x considered solves the system. Each condition is a cone ‖u(x)‖ ≤ v(x) + slack (with
 * no u: v(x) + slack ≥ 0), u and v affine. Phase 1 finds a z strictly inside every relaxed cone, or the z that
 * minimises the worst violation when there is none; phase 2 then minimises ‖x‖² from it. Both run Newton's method on
 * a barrier with fixed iteration schedules, so the result is deterministic. The line searches need values only,
 * which is most of the evaluations.
 *
 * Work units: each Newton iteration costs d³ + C·d² (d variables, C cones), each value-only evaluation C·d.
 */
import { ln } from "./math/elementary";
import { linearValue, solveLinear, valueOf, type Affine, type Work } from "./linalg";

/**
 * Relaxation (m/s²) of the contact and load conditions, so that the feasible set keeps an interior at a limit where
 * it would shrink to a point. A numerical tolerance, below FORCE_EPSILON, the acceptance tolerance.
 */
export const CONVEX_SLACK = 1e-10;

/** The condition ‖u(x)‖ ≤ v(x) + slack; with no u, v(x) + slack ≥ 0. */
export interface Cone {
    readonly u: readonly Affine[];
    readonly v: Affine;
    readonly slack: number;
}

/** Outcome of solveConvex. */
export interface ConvexResult {
    readonly x: number[];
    /** Worst ‖u(x)‖ − v(x) − slack over the cones: at most 0 when x satisfies every relaxed cone. */
    readonly excess: number;
}

/** The worst ‖u(x)‖ − v(x) − slack over the cones; −Infinity when there are none. */
export function excessAt(cones: readonly Cone[], x: readonly number[]): number {
    let worst = -Infinity;
    for (const c of cones) {
        let squares = 0;
        for (const f of c.u) {
            const value = valueOf(f, x);
            squares += value * value;
        }
        worst = Math.max(worst, Math.sqrt(squares) - valueOf(c.v, x) - c.slack);
    }
    return worst;
}

/** An affine form over the null-space coordinates z: a + g·z. */
interface ZForm {
    readonly a: number;
    readonly g: readonly number[];
}

interface ZCone {
    readonly u: readonly ZForm[];
    /** v + slack. */
    readonly v: ZForm;
}

function toZ(f: Affine, xp: readonly number[], basis: readonly (readonly number[])[], shift: number): ZForm {
    return { a: valueOf(f, xp) + shift, g: basis.map((b) => linearValue(f, b)) };
}

function zValue(f: ZForm, z: readonly number[]): number {
    let r = f.a;
    for (let j = 0; j < f.g.length; j++) {
        r += (f.g[j] as number) * (z[j] as number);
    }
    return r;
}

/**
 * Returns the minimum-norm x = xp + B·z subject to the cones (B's rows are `basis`), or, when the relaxed cones have no
 * common point, the z that minimises the worst violation found by phase 1 (excess > 0).
 */
export function solveConvex(
    cones: readonly Cone[],
    xp: readonly number[],
    basis: readonly (readonly number[])[],
    work: Work,
): ConvexResult {
    const m = basis.length;
    const nx = xp.length;
    const count = cones.length;
    const zc: ZCone[] = cones.map((c) => ({
        u: c.u.map((f) => toZ(f, xp, basis, 0)),
        v: toZ(c.v, xp, basis, c.slack),
    }));
    const xOf = (z: readonly number[]): number[] =>
        xp.map((xi, i) => {
            let s = xi;
            for (let j = 0; j < m; j++) {
                s += ((basis[j] as readonly number[])[i] as number) * (z[j] as number);
            }
            return s;
        });
    const excess = (z: readonly number[]): number => {
        let worst = -Infinity;
        for (const c of zc) {
            let squares = 0;
            for (const f of c.u) {
                const value = zValue(f, z);
                squares += value * value;
            }
            worst = Math.max(worst, Math.sqrt(squares) - zValue(c.v, z));
        }
        return worst;
    };
    let z = new Array<number>(m).fill(0);
    work.units += count * (m + 1);
    let worst = excess(z);
    // Exact shortcut: xp is the unconstrained minimum-norm solution, so when it is feasible it is the answer.
    if (worst <= 0 || m === 0) {
        return { x: xOf(z), excess: worst };
    }
    // Per-cone gradients padded for phase 1, whose extra variable s enters every v with gradient 1.
    const gv1 = zc.map((c) => [...c.v.g, 1]);
    const gu1 = zc.map((c) => c.u.map((f) => [...f.g, 0]));
    const gram = basis.map((bj) => basis.map((bl) => bj.reduce((acc, b, i) => acc + b * (bl[i] as number), 0)));
    const scratch = new Array<number>(8).fill(0);
    const dphi = new Array<number>(m + 1).fill(0);
    const xBuffer = new Array<number>(nx).fill(0);
    // The value at y = (z, s) (phase 1) or y = z (phase 2) of t·objective − Σ log(barrier); null outside the domain.
    // Identical arithmetic to evaluate()'s value.
    const value = (y: readonly number[], t: number, phase1: boolean): number | null => {
        work.units += count * y.length;
        const s = phase1 ? (y[m] as number) : 0;
        let f = 0;
        if (phase1) {
            f += t * s;
            for (let j = 0; j < m; j++) {
                f += t * 1e-12 * (y[j] as number) * (y[j] as number);
            }
        } else {
            for (let i = 0; i < nx; i++) {
                let v = xp[i] as number;
                for (let j = 0; j < m; j++) {
                    v += ((basis[j] as readonly number[])[i] as number) * (y[j] as number);
                }
                xBuffer[i] = v;
            }
            let squares = 0;
            for (let i = 0; i < nx; i++) {
                squares = squares + (xBuffer[i] as number) * (xBuffer[i] as number);
            }
            f += t * squares;
        }
        for (const c of zc) {
            const w = zValue(c.v, y) + s;
            if (w <= 0) {
                return null;
            }
            if (c.u.length === 0) {
                f -= ln(w);
                continue;
            }
            let squares = 0;
            for (const fu of c.u) {
                const uq = zValue(fu, y);
                squares = squares + uq * uq;
            }
            const phi = w * w - squares;
            if (phi <= 0) {
                return null;
            }
            f -= ln(phi);
        }
        return f;
    };
    // Value, gradient and Hessian of the same function.
    const evaluate = (
        y: readonly number[],
        t: number,
        phase1: boolean,
    ): { readonly f: number; readonly grad: number[]; readonly hess: number[][] } | null => {
        const dim = y.length;
        work.units += dim * dim * dim + count * dim * dim;
        const s = phase1 ? (y[m] as number) : 0;
        const grad = new Array<number>(dim).fill(0);
        const hess = Array.from({ length: dim }, () => new Array<number>(dim).fill(0));
        let f = 0;
        if (phase1) {
            f += t * s;
            grad[m] = (grad[m] as number) + t;
            for (let j = 0; j < m; j++) {
                const yj = y[j] as number;
                f += t * 1e-12 * yj * yj;
                grad[j] = (grad[j] as number) + 2 * t * 1e-12 * yj;
                (hess[j] as number[])[j] = ((hess[j] as number[])[j] as number) + 2 * t * 1e-12;
            }
        } else {
            const x = xOf(y);
            f += t * x.reduce((acc, v) => acc + v * v, 0);
            for (let j = 0; j < m; j++) {
                const bj = basis[j] as readonly number[];
                grad[j] = (grad[j] as number) + 2 * t * bj.reduce((acc, b, i) => acc + b * (x[i] as number), 0);
                const hj = hess[j] as number[];
                const gj = gram[j] as number[];
                for (let l = 0; l < m; l++) {
                    hj[l] = (hj[l] as number) + 2 * t * (gj[l] as number);
                }
            }
        }
        for (let ci = 0; ci < count; ci++) {
            const c = zc[ci] as ZCone;
            const w = zValue(c.v, y) + s;
            const gw = phase1 ? (gv1[ci] as number[]) : c.v.g;
            if (w <= 0) {
                return null;
            }
            if (c.u.length === 0) {
                f -= ln(w);
                const w2 = w * w;
                for (let a = 0; a < dim; a++) {
                    const ga = gw[a] as number;
                    grad[a] = (grad[a] as number) - ga / w;
                    const ha = hess[a] as number[];
                    for (let b = 0; b < dim; b++) {
                        ha[b] = (ha[b] as number) + (ga * (gw[b] as number)) / w2;
                    }
                }
                continue;
            }
            const nu = c.u.length;
            let squares = 0;
            for (let q = 0; q < nu; q++) {
                const uq = zValue(c.u[q] as ZForm, y);
                scratch[q] = uq;
                squares = squares + uq * uq;
            }
            const gu = phase1 ? (gu1[ci] as number[][]) : c.u.map((fu) => fu.g);
            const phi = w * w - squares;
            if (phi <= 0) {
                return null;
            }
            f -= ln(phi);
            for (let a = 0; a < dim; a++) {
                let d = 2 * w * (gw[a] as number);
                for (let q = 0; q < nu; q++) {
                    d = d - 2 * (scratch[q] as number) * ((gu[q] as readonly number[])[a] as number);
                }
                dphi[a] = d;
            }
            const phi2 = phi * phi;
            for (let a = 0; a < dim; a++) {
                grad[a] = (grad[a] as number) - (dphi[a] as number) / phi;
                const ha = hess[a] as number[];
                const ga = gw[a] as number;
                const da = dphi[a] as number;
                for (let b = 0; b < dim; b++) {
                    let d2 = 2 * ga * (gw[b] as number);
                    for (let q = 0; q < nu; q++) {
                        d2 -= 2 * ((gu[q] as readonly number[])[a] as number) * ((gu[q] as readonly number[])[b] as number);
                    }
                    ha[b] = (ha[b] as number) - d2 / phi + (da * (dphi[b] as number)) / phi2;
                }
            }
        }
        return { f, grad, hess };
    };
    // Damped Newton on the barrier function for parameter t: at most 100 steps, each halved up to 60 times until the
    // value falls by a quarter of the Newton decrement, stopping once half the decrement is at most 1e-12.
    const centre = (start: number[], t: number, phase1: boolean, stop?: (y: readonly number[]) => boolean): number[] => {
        let y = start;
        for (let iteration = 0; iteration < 100; iteration++) {
            const e = evaluate(y, t, phase1);
            if (!e) {
                return y;
            }
            const step = solveLinear(
                e.hess,
                e.grad.map((g) => 0 - g),
                work,
            );
            if (!step) {
                return y;
            }
            const decrement = 0 - e.grad.reduce((acc, g, i) => acc + g * (step[i] as number), 0);
            if (decrement / 2 <= 1e-12) {
                return y;
            }
            let tau = 1;
            let moved = false;
            for (let halving = 0; halving < 60; halving++, tau /= 2) {
                const trial = y.map((v, i) => v + tau * (step[i] as number));
                const ft = value(trial, t, phase1);
                if (ft !== null && ft <= e.f - 0.25 * tau * decrement) {
                    y = trial;
                    moved = true;
                    break;
                }
            }
            if (!moved) {
                return y;
            }
            if (stop?.(y)) {
                return y;
            }
        }
        return y;
    };
    // Phase 1: minimise s subject to ‖u‖ ≤ v + slack + s, from a start strictly inside, until s < −CONVEX_SLACK/2 (a
    // strictly feasible z) or the central-path bound s − 2C/t > 0 proves there is none.
    let y = [...z, Math.max(0, worst) + 1];
    let t = 1;
    for (let outer = 0; outer < 40; outer++) {
        y = centre(y, t, true, (yy) => (yy[m] as number) < (0 - CONVEX_SLACK) / 2);
        if ((y[m] as number) < (0 - CONVEX_SLACK) / 2) {
            break;
        }
        if ((y[m] as number) - (2 * count) / t > 0) {
            break;
        }
        t *= 10;
    }
    z = y.slice(0, m);
    worst = excess(z);
    if (worst > -1.5 * CONVEX_SLACK) {
        return { x: xOf(z), excess: worst };
    }
    // Phase 2: minimum norm, from the strictly feasible z.
    t = 1;
    for (let outer = 0; outer < 8; outer++) {
        z = centre(z, t, false);
        t *= 100;
    }
    return { x: xOf(z), excess: excess(z) };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/convexSolve.test.ts` then `npm run lint` and `npm run check`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/engine/convexSolve.ts tests/engine/convexSolve.test.ts
git add src/engine/convexSolve.ts tests/engine/convexSolve.test.ts
git commit -m "Add the log-barrier second-order-cone solve"
```

---

### Task 4: The contact model

One candidate of one group as a linear system (design §4 "Unknowns per candidate", "Consistency of a candidate"). This
is the prototype's `contactModelLock.ts` and `assembleSparse.ts` with the decided variants built in (spin about the
turf normal locked unless the patch slips; held balls inside the system with their static turf forces as unknowns),
written in each ball's turf frame, and extended to balls in flight and to lift-off, which the prototype rejected.

Ball modes by class (`classify`), in the design's order: stationary — held, released, turf-sliding; rolling —
turf-rolling, turf-sliding; sliding — turf-sliding; airborne — airborne. A turf ball can also be put in the airborne
mode, but only by the search's lift-off rule (Task 6, `lowLoad`): it has left the turf because its load would be zero
or negative (spec §5), and it is consistent only if its acceleration does not drive it into the turf. Contact modes: stick, slip, open; a contact that is already
slipping, or has no friction, has only slip and open (at μ = 0 stick and slip are the same).

**Files:**
- Create: `src/engine/contactModel.ts`
- Test: `tests/engine/contactModel.test.ts`

**Interfaces:**
- Consumes: Task 2 `Affine` helpers; Task 3 `Cone`, `CONVEX_SLACK`.
- Produces (all exported from `contactModel.ts`):
  - Tolerances `FORCE_EPSILON`, `ACCELERATION_EPSILON`, `FOLLOW_EPSILON` (all `1e-9`), `HOLD_SLACK = 1e-8`;
    `ROLLING_WEIGHT = 7 / 5`.
  - `interface ContactBody { state: BallState; params: MotionParams; turfNormal: Vec3; pivotCapacity: number }`.
  - `interface RestingContact { a: number; b: number; fixed: boolean; friction: number }`.
  - `type BallMode = "held" | "released" | "turf-rolling" | "turf-sliding" | "airborne"`;
    `type ContactMode = "open" | "stick" | "slip"`; `interface Candidate { balls; contacts }`.
  - `type DirectionKind = "release" | "turf-onset" | "contact-onset"`;
    `interface DirectionItem { kind; index: number; e1: Vec3; e2: Vec3 }`.
  - `interface ContactGeometry { n; t1; t2; slip; slipping: boolean; sHat }`;
    `interface Model { bodies; axes; contacts; gravity: Vec3; classes: MotionPhase[]; planes; geometry; frozen }`.
  - `muS(p)`, `rollCap(p)`, `turfPlane(up)`, `buildModel(bodies, axes, contacts, gravity): Model`,
    `ballOptions(c: MotionPhase)`, `contactOptions(model, k)`, `isStatic(model, balls, k)`,
    `settled(model, cand): Candidate`, `candidateKey(cand): string`, `directionItems(model, cand)`.
  - `type VectorForm = readonly [Affine, Affine, Affine]`; `vectorValue(f, x): Vec3`; `vectorLinear(f, dx): Vec3`.
  - `interface System { size; A; b; accel; spin; turf; resist; load; force; normal; relative; follow }`;
    `assemble(model, cand, items, dirs: readonly Vec3[]): System`.
  - `interface Evaluated { accel; spin; turf; resist; load; force; normal; relative }`; `evaluate(sys, x)`.
  - `inconsistency(model, cand, ev): string | null`; `cones(model, cand, sys): Cone[]`;
    `lowLoad(model, cand, ev): number[]` (balls on the turf whose load is zero or below).

- [ ] **Step 1: Write the failing tests**

Create `tests/engine/contactModel.test.ts`. The numbers are the design §6 closed forms, derived and checked against
the prototype (push.test parameters: R 0.046, SLIDE 3, ROLL 0.5, ball–ball μ 0.05, upright μ 0.1).

```ts
import { describe, expect, it } from "vitest";
import {
    assemble,
    ballOptions,
    buildModel,
    candidateKey,
    cones,
    contactOptions,
    directionItems,
    evaluate,
    inconsistency,
    lowLoad,
    settled,
    turfPlane,
    type Candidate,
    type ContactBody,
    type Evaluated,
    type Model,
    type RestingContact,
} from "../../src/engine/contactModel";
import { excessAt } from "../../src/engine/convexSolve";
import { solveSystem } from "../../src/engine/linalg";
import { ZERO, vec3, type Vec3 } from "../../src/engine/math/vec3";
import type { MotionParams } from "../../src/engine/types";

const R = 0.046;
const G = 9.80665;
const SLIDE = 3;
const ROLL = 0.5;
const P: MotionParams = { radius: R, slidingDecel: SLIDE, rollingDecel: ROLL, gravity: G };
const UP = vec3(0, 0, 1);
const GRAVITY = vec3(0, 0, -G);

function ball(x: number, y: number, angularVelocity: Vec3 = ZERO, params: MotionParams = P): ContactBody {
    return {
        state: { position: vec3(x, y, R), velocity: ZERO, angularVelocity },
        params,
        turfNormal: UP,
        pivotCapacity: Infinity,
    };
}

/** Solves one candidate with the given directions and evaluates it. */
function solve(model: Model, cand: Candidate, dirs: readonly Vec3[]): Evaluated {
    const items = directionItems(model, cand);
    const sys = assemble(model, cand, items, dirs);
    const solution = solveSystem(sys.A, sys.b, { units: 0 });
    expect(solution?.basis.length).toBe(0);
    return evaluate(sys, solution?.x as number[]);
}

const PAIR: RestingContact[] = [{ a: 0, b: 1, fixed: false, friction: 0.05 }];

describe("the turf frame", () => {
    it("is exactly (x̂, ŷ) on a level turf", () => {
        expect(turfPlane(UP)).toEqual([vec3(1, 0, 0), vec3(0, 1, 0)]);
    });

    it("refuses a finite pivot capacity, which v1 does not model", () => {
        expect(() => buildModel([{ ...ball(0, 0), pivotCapacity: 1 }], [], [], GRAVITY)).toThrow(RangeError);
    });
});

describe("modes and items", () => {
    it("offers each class its modes in the design's order", () => {
        expect(ballOptions("stationary")).toEqual(["held", "released", "turf-sliding"]);
        expect(ballOptions("rolling")).toEqual(["turf-rolling", "turf-sliding"]);
        expect(ballOptions("sliding")).toEqual(["turf-sliding"]);
        expect(ballOptions("airborne")).toEqual(["airborne"]);
    });

    it("lets a contact stick only when it has friction and is not slipping", () => {
        const still = buildModel([ball(0, 0), ball(2 * R, 0)], [], PAIR, GRAVITY);
        expect(contactOptions(still, 0)).toEqual(["stick", "slip", "open"]);
        const spinning = buildModel([ball(0, 0, vec3(0, 60, 0)), ball(2 * R, 0)], [], PAIR, GRAVITY);
        expect(spinning.geometry[0]?.slipping).toBe(true);
        expect(contactOptions(spinning, 0)).toEqual(["slip", "open"]);
        const frictionless = buildModel(
            [ball(0, 0), ball(2 * R, 0)],
            [],
            [{ a: 0, b: 1, fixed: false, friction: 0 }],
            GRAVITY,
        );
        expect(contactOptions(frictionless, 0)).toEqual(["slip", "open"]);
    });

    it("settles a contact between held bodies as stuck", () => {
        const model = buildModel([ball(0, 0), ball(2 * R, 0)], [], PAIR, GRAVITY);
        const cand = settled(model, { balls: ["held", "held"], contacts: ["open"] });
        expect(cand.contacts).toEqual(["stick"]);
        expect(candidateKey(cand)).toBe("held,held|stick");
    });

    it("lists the unknown directions of a candidate", () => {
        const model = buildModel([ball(0, 0), ball(2 * R, 0)], [], PAIR, GRAVITY);
        const items = directionItems(model, { balls: ["released", "turf-sliding"], contacts: ["slip"] });
        expect(items.map((it) => `${it.kind}#${it.index}`)).toEqual(["release#0", "turf-onset#1", "contact-onset#0"]);
        expect(items[2]?.e1).toEqual(model.geometry[0]?.t1);
    });
});

describe("one candidate", () => {
    it("pushes a resting ball with a ball driven by topspin: the generalised closed form", () => {
        // Blue's contact point slips down (−R(ω_a + ω_b)ẑ), so kinetic friction μN lifts blue and loads red,
        // L = g ∓ μN. Blue: A = μs(g − μN) − N; red rolls from rest: 7/5·A = N(1 − μ) − k(g + μN), k = 7/5·μr.
        // Hence A = (c·μs − k)·g/(7/5 + c) with c = (1 − μ − kμ)/(1 + μ·μs).
        const model = buildModel([ball(0, 0, vec3(0, 60, 0)), ball(2 * R, 0)], [], PAIR, GRAVITY);
        expect(model.geometry[0]?.sHat).toEqual(vec3(0, 0, -1));
        const cand: Candidate = { balls: ["turf-sliding", "released"], contacts: ["slip"] };
        const ev = solve(model, cand, [vec3(1, 0, 0)]);
        expect(inconsistency(model, cand, ev)).toBeNull();
        expect(ev.accel[0]?.x).toBeCloseTo(0.89895492703632, 12);
        expect(ev.accel[1]?.x).toBeCloseTo(0.89895492703632, 12);
        expect(ev.normal[0]).toBeCloseTo(2.0693921815851, 12);
        expect(ev.load[0]).toBeCloseTo(9.7031803909207, 12);
        expect(ev.load[1]).toBeCloseTo(9.9101196090793, 12);
        expect(ev.spin[0]?.y).toBeCloseTo(-166.9465607446, 9);
        expect(ev.spin[1]?.y).toBeCloseTo(19.542498413833, 10);
        // Red rolls: its spin about the vertical is locked.
        expect(ev.spin[1]?.z).toBe(0);
    });

    it("holds a ball driven against an upright, which friction lifts", () => {
        // Upright friction μu·N lifts the ball (L = g − μu·N), so N = SLIDE/(1 + μu·μs); the spin decays at
        // (5/2R)·N·(1 + μu).
        const model = buildModel([ball(0, 0, vec3(0, 60, 0))], [vec3(R + 0.008, 0, 0)], [
            { a: 0, b: 0, fixed: true, friction: 0.1 },
        ], GRAVITY);
        const cand: Candidate = { balls: ["turf-sliding"], contacts: ["slip"] };
        const ev = solve(model, cand, []);
        expect(inconsistency(model, cand, ev)).toBeNull();
        expect(ev.accel[0]?.x).toBeCloseTo(0, 14);
        expect(ev.normal[0]).toBeCloseTo(2.9109497212232, 12);
        expect(ev.load[0]).toBeCloseTo(9.5155550278777, 12);
        expect(ev.spin[0]?.y).toBeCloseTo(-174.0241681166, 9);
    });

    it("holds a resting ball that the push cannot move, within its resistance", () => {
        // N = SLIDE/(1 + μ·μs); red needs N(1 − μ) = 0.4738 of resistance, within k·(g + μN) = 0.6877.
        const weak: MotionParams = { radius: R, slidingDecel: 0.5, rollingDecel: 0.49, gravity: G };
        const model = buildModel([ball(0, 0, vec3(0, 60, 0), weak), ball(2 * R, 0, ZERO, weak)], [], PAIR, GRAVITY);
        const cand: Candidate = { balls: ["turf-sliding", "held"], contacts: ["slip"] };
        const ev = solve(model, cand, []);
        expect(inconsistency(model, cand, ev)).toBeNull();
        expect(ev.accel[0]?.x).toBeCloseTo(0, 15);
        expect(ev.normal[0]).toBeCloseTo(0.49872859591218, 12);
        expect(ev.accel[1]).toEqual(ZERO);
    });

    it("lifts a ball whose load friction takes away, and rejects it on the turf", () => {
        // Blue (topspin) and red (stronger backspin) drive into each other: the contact slips up on red, and with
        // μ = 4 friction takes more than red's weight. On the turf red's load would be g(1 − μ·μs) < 0; in flight
        // N = μs·g/(2 − μ·μs) and red rises at 2g(μ·μs − 1)/(2 − μ·μs).
        const contacts: RestingContact[] = [{ a: 0, b: 1, fixed: false, friction: 4 }];
        const model = buildModel([ball(0, 0, vec3(0, 60, 0)), ball(2 * R, 0, vec3(0, -80, 0))], [], contacts, GRAVITY);
        const turf: Candidate = { balls: ["turf-sliding", "turf-sliding"], contacts: ["slip"] };
        const onTurf = solve(model, turf, []);
        expect(onTurf.load[1]).toBeCloseTo(G * (1 - (4 * SLIDE) / G), 12);
        expect(inconsistency(model, turf, onTurf)).toMatch(/load/);
        expect(lowLoad(model, turf, onTurf)).toEqual([1]);
        const lifted: Candidate = { balls: ["turf-sliding", "airborne"], contacts: ["slip"] };
        const ev = solve(model, lifted, []);
        expect(inconsistency(model, lifted, ev)).toBeNull();
        expect(ev.normal[0]).toBeCloseTo(3.8642835564079, 12);
        expect(ev.accel[1]?.x).toBeCloseTo(3.8642835564079, 12);
        expect(ev.accel[1]?.z).toBeCloseTo(5.6504842256315, 12);
    });

    it("measures how far a candidate is from its convex conditions", () => {
        // Holding red against the topspin push of push.test needs more resistance than red has.
        const model = buildModel([ball(0, 0, vec3(0, 60, 0)), ball(2 * R, 0)], [], PAIR, GRAVITY);
        const cand: Candidate = { balls: ["turf-sliding", "held"], contacts: ["slip"] };
        const items = directionItems(model, cand);
        const sys = assemble(model, cand, items, []);
        const x = solveSystem(sys.A, sys.b, { units: 0 })?.x as number[];
        expect(inconsistency(model, cand, evaluate(sys, x))).toMatch(/held/);
        expect(excessAt(cones(model, cand, sys), x)).toBeGreaterThan(0);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/contactModel.test.ts`
Expected: FAIL (cannot resolve `../../src/engine/contactModel`).

- [ ] **Step 3: Implement**

Create `src/engine/contactModel.ts`:

```ts
/**
 * The contact model of one group of touching bodies (P2a.2 design §4; spec §5, "Pushing contacts carry Coulomb
 * friction" and the paragraphs after it).
 *
 * A candidate assigns a mode to every ball and every contact. For one candidate, with every unknown direction given,
 * the motion is one square, sparse, non-symmetric linear system in:
 * - per held ball: its static turf friction F and rolling resistance Q (in the turf plane); centre and spin locked;
 * - per rolling or released ball: its acceleration a and static turf friction F (in the turf plane); the spin follows
 *   a (rolling without slip) and the spin about the turf normal is locked;
 * - per sliding ball: a (in the turf plane) and the angular acceleration α (3D); turf friction μs·L against its slip;
 * - per ball in flight: a and α (3D) under gravity, with no turf;
 * - per coupled contact: its normal force N and, while it sticks, its two tangential force components.
 * Forces are mass-normalised (m/s²). A contact force P on body b (−P on a) acts at R·ê from each centre (ê = n on a,
 * −n on b), so it torques both balls: (2/5)·R·α = Σ ê × P, plus (−normal) × F for the turf force at the patch. The
 * turf's load on a ball is L = −g⃗·normal − Σ P·normal, and turf friction and rolling resistance scale with it. Rolling
 * resistance acts through the centre with no moment, so a rolling ball obeys 7/5·a = Σ[P_h(1 + ê_z) − ê_h·P_z] + Q and
 * a held ball needs F = Σ(ê_z·P_h − ê_h·P_z) of static turf friction. Every equation is written with each ball's turf
 * normal and the gravity vector, never z components, so a sloping surface changes inputs, not equations.
 *
 * A direction that is not known in advance (a ball released from rest, a turf slip or contact slip that starts) enters
 * linearly through a given unit vector; modeSolve.ts closes it with Newton's method.
 */
import { CONVEX_SLACK, type Cone } from "./convexSolve";
import { accumulate, affine, denseRow, linearValue, scaled, valueOf, variable, type Affine } from "./linalg";
import { ZERO, add, cross, dot, horizontal, length, normalize, scale, sub, vec3, type Vec3 } from "./math/vec3";
import { SPEED_EPSILON, classify } from "./motion";
import type { BallState, MotionParams, MotionPhase } from "./types";

/** Effective inertia of a rolling solid sphere relative to its mass: (m + I/r²)/m with I = 2/5·m·r². */
export const ROLLING_WEIGHT = 7 / 5;

/** Contact and turf forces (m/s²) within this of a limit count as within it. A numerical tolerance. */
export const FORCE_EPSILON = 1e-9;

/** Relative accelerations (m/s²) at or below this are treated as zero when deciding whether bodies converge. */
export const ACCELERATION_EPSILON = 1e-9;

/**
 * A direction solve's root is accepted only if the quantity the direction must follow has more than this (m/s²) along
 * it and is aligned with it to this sine. Without it, spurious roots with |w| ≈ 1e-15 release balls that hold. A
 * numerical tolerance.
 */
export const FOLLOW_EPSILON = 1e-9;

/**
 * Held balls' limits are relaxed by this (m/s²). It is at least 7/5·FOLLOW_EPSILON, so no configuration near a limit
 * of holding is rejected both as held and as released. Its effect on a limit is HOLD_SLACK divided by the margin's
 * slope: 3.8e-9 rad on the bent line of design §6. A numerical tolerance.
 */
export const HOLD_SLACK = 1e-8;

/** Below this length the cross product of the turf normal and a contact normal has no direction. */
const DIRECTION_GUARD = 1e-12;

/** A ball taking part in a resting-contact solve. */
export interface ContactBody {
    readonly state: BallState;
    readonly params: MotionParams;
    /** Unit normal of the turf under the ball (ẑ in v1). */
    readonly turfNormal: Vec3;
    /**
     * The turf's grip against spin about its normal while the patch does not slip (spec §5 limitations). v1 models no
     * finite grip: it must be Infinity (buildModel refuses anything else).
     */
    readonly pivotCapacity: number;
}

/** A touching contact: ball `a` against ball `b`, or against the fixed cylinder whose axis is `axes[b]`. */
export interface RestingContact {
    readonly a: number;
    readonly b: number;
    readonly fixed: boolean;
    /** Coulomb coefficient of the contact's materials. */
    readonly friction: number;
}

export type BallMode = "held" | "released" | "turf-rolling" | "turf-sliding" | "airborne";
export type ContactMode = "open" | "stick" | "slip";

/** A mode for every ball and every contact of a group. */
export interface Candidate {
    readonly balls: readonly BallMode[];
    readonly contacts: readonly ContactMode[];
}

export type DirectionKind = "release" | "turf-onset" | "contact-onset";

/** A direction the candidate leaves unknown, in the plane spanned by e1 and e2. */
export interface DirectionItem {
    readonly kind: DirectionKind;
    /** Ball index (release, turf-onset) or contact index (contact-onset). */
    readonly index: number;
    readonly e1: Vec3;
    readonly e2: Vec3;
}

/** A contact's frozen geometry at the segment start. */
export interface ContactGeometry {
    /** Unit normal from a towards b (horizontal towards an obstacle's vertical axis). */
    readonly n: Vec3;
    /** Unit tangents: t1 = normal × n (turf normal of ball a), t2 = n × t1. */
    readonly t1: Vec3;
    readonly t2: Vec3;
    /** Tangential slip of a's contact point relative to b's: Pₜ[(v_a − v_b) + R·(ω_a + ω_b) × n]. */
    readonly slip: Vec3;
    readonly slipping: boolean;
    /** Unit slip while slipping, else ZERO. */
    readonly sHat: Vec3;
}

/** One group, ready for candidates. */
export interface Model {
    readonly bodies: readonly ContactBody[];
    readonly axes: readonly Vec3[];
    readonly contacts: readonly RestingContact[];
    /** Gravity vector (m/s²): −g·ẑ in v1. */
    readonly gravity: Vec3;
    readonly classes: readonly MotionPhase[];
    /** Per ball: an orthonormal basis of its turf plane. */
    readonly planes: readonly (readonly [Vec3, Vec3])[];
    readonly geometry: readonly ContactGeometry[];
    /** Per ball: unit direction of travel (rolling), unit turf slip (sliding), else ZERO. */
    readonly frozen: readonly Vec3[];
}

/** Sliding coefficient μs of a ball's turf. */
export function muS(p: MotionParams): number {
    return p.slidingDecel / p.gravity;
}

/** Rolling resistance as a fraction of the load: 7/5·μr. */
export function rollCap(p: MotionParams): number {
    return (ROLLING_WEIGHT * p.rollingDecel) / p.gravity;
}

/** An orthonormal basis (e1, e2) of the plane normal to `up`; exactly (x̂, ŷ) for ẑ. */
export function turfPlane(up: Vec3): readonly [Vec3, Vec3] {
    const seed = Math.abs(up.x) < 0.9 ? vec3(1, 0, 0) : vec3(0, 1, 0);
    const e1 = normalize(sub(seed, scale(up, dot(seed, up))));
    return [e1, cross(up, e1)];
}

function inPlane(v: Vec3, up: Vec3): Vec3 {
    return sub(v, scale(up, dot(v, up)));
}

/** The velocity of a ball's turf contact point, v + ω × (−R·normal). */
function turfSlip(s: BallState, up: Vec3, radius: number): Vec3 {
    return add(s.velocity, cross(s.angularVelocity, scale(up, 0 - radius)));
}

function contactGeometry(
    bodies: readonly ContactBody[],
    axes: readonly Vec3[],
    planes: readonly (readonly [Vec3, Vec3])[],
    c: RestingContact,
): ContactGeometry {
    const a = bodies[c.a] as ContactBody;
    const radius = a.params.radius;
    // Obstacles are vertical cylinders: the normal towards one is horizontal whatever the turf.
    const n = c.fixed
        ? normalize(horizontal(sub(axes[c.b] as Vec3, a.state.position)))
        : normalize(sub((bodies[c.b] as ContactBody).state.position, a.state.position));
    const across = cross(a.turfNormal, n);
    const t1 = length(across) > DIRECTION_GUARD ? normalize(across) : (planes[c.a] as readonly [Vec3, Vec3])[0];
    const t2 = cross(n, t1);
    const other = c.fixed ? null : (bodies[c.b] as ContactBody).state;
    const spin = other ? add(a.state.angularVelocity, other.angularVelocity) : a.state.angularVelocity;
    const relative = add(sub(a.state.velocity, other ? other.velocity : ZERO), scale(cross(spin, n), radius));
    const slip = sub(relative, scale(n, dot(relative, n)));
    const slipping = c.friction > 0 && length(slip) > SPEED_EPSILON;
    return { n, t1, t2, slip, slipping, sHat: slipping ? normalize(slip) : ZERO };
}

/**
 * Builds the model of one group with the given gravity vector. Throws RangeError for a finite pivot capacity, which
 * v1 does not model (spec §5 limitations).
 */
export function buildModel(
    bodies: readonly ContactBody[],
    axes: readonly Vec3[],
    contacts: readonly RestingContact[],
    gravity: Vec3,
): Model {
    for (const b of bodies) {
        if (b.pivotCapacity !== Infinity) {
            throw new RangeError("a finite pivot capacity is not modelled in v1");
        }
    }
    const classes = bodies.map((b) => classify(b.state, b.params.radius));
    const planes = bodies.map((b) => turfPlane(b.turfNormal));
    const frozen = bodies.map((b, i) => {
        const up = b.turfNormal;
        if (classes[i] === "rolling") {
            return normalize(inPlane(b.state.velocity, up));
        }
        if (classes[i] === "sliding") {
            return normalize(inPlane(turfSlip(b.state, up, b.params.radius), up));
        }
        return ZERO;
    });
    const geometry = contacts.map((c) => contactGeometry(bodies, axes, planes, c));
    return { bodies, axes, contacts, gravity, classes, planes, geometry, frozen };
}

/**
 * The modes the search enumerates for a ball of each class, in the design's order (§4 step 6). Lift-off (a turf ball
 * in the airborne mode) is not enumerated: the search derives it from a candidate's low loads (see lowLoad).
 */
export function ballOptions(c: MotionPhase): readonly BallMode[] {
    switch (c) {
        case "stationary":
            return ["held", "released", "turf-sliding"];
        case "rolling":
            return ["turf-rolling", "turf-sliding"];
        case "sliding":
            return ["turf-sliding"];
        case "airborne":
            return ["airborne"];
    }
}

/** The modes contact k may take, in order. A slipping contact cannot stick at the segment start. */
export function contactOptions(model: Model, k: number): readonly ContactMode[] {
    const c = model.contacts[k] as RestingContact;
    if (c.friction === 0 || (model.geometry[k] as ContactGeometry).slipping) {
        return ["slip", "open"];
    }
    return ["stick", "slip", "open"];
}

/** True when contact k joins two held balls, or a held ball and an obstacle: its forces are static. */
export function isStatic(model: Model, balls: readonly BallMode[], k: number): boolean {
    const c = model.contacts[k] as RestingContact;
    return balls[c.a] === "held" && (c.fixed || balls[c.b] === "held");
}

/**
 * The candidate as it is solved: a contact between held bodies is coupled and stuck (slipping at μ = 0, which is the
 * same), whatever the candidate said, because the held balls' static forces settle it (design §4 step 6). Below a
 * limit of holding such forces are not unique; the minimum-norm rule picks them (modeSolve.ts).
 */
export function settled(model: Model, cand: Candidate): Candidate {
    return {
        balls: cand.balls,
        contacts: cand.contacts.map((m, k) =>
            isStatic(model, cand.balls, k) ? ((model.contacts[k] as RestingContact).friction > 0 ? "stick" : "slip") : m,
        ),
    };
}

/** A key that identifies a settled candidate. */
export function candidateKey(cand: Candidate): string {
    return `${cand.balls.join(",")}|${cand.contacts.join(",")}`;
}

/** The directions a candidate leaves unknown, balls first, then contacts, each in index order. */
export function directionItems(model: Model, cand: Candidate): DirectionItem[] {
    const items: DirectionItem[] = [];
    cand.balls.forEach((mode, i) => {
        const cls = model.classes[i];
        const [e1, e2] = model.planes[i] as readonly [Vec3, Vec3];
        if (cls === "stationary" && mode === "released") {
            items.push({ kind: "release", index: i, e1, e2 });
        } else if ((cls === "stationary" || cls === "rolling") && mode === "turf-sliding") {
            items.push({ kind: "turf-onset", index: i, e1, e2 });
        }
    });
    cand.contacts.forEach((mode, k) => {
        const g = model.geometry[k] as ContactGeometry;
        if (mode === "slip" && (model.contacts[k] as RestingContact).friction > 0 && !g.slipping) {
            items.push({ kind: "contact-onset", index: k, e1: g.t1, e2: g.t2 });
        }
    });
    return items;
}

/** A vector of affine forms: its x, y and z components. */
export type VectorForm = readonly [Affine, Affine, Affine];

function vzero(): [Affine, Affine, Affine] {
    return [affine(), affine(), affine()];
}

/** The vector form f·v (zero components stay empty). */
function along(f: Affine, v: Vec3): [Affine, Affine, Affine] {
    return [
        v.x === 0 ? affine() : scaled(f, v.x),
        v.y === 0 ? affine() : scaled(f, v.y),
        v.z === 0 ? affine() : scaled(f, v.z),
    ];
}

function vaccumulate(acc: [Affine, Affine, Affine], a: VectorForm, s: number): void {
    accumulate(acc[0], a[0], s);
    accumulate(acc[1], a[1], s);
    accumulate(acc[2], a[2], s);
}

/** v × A for a constant vector v. */
function vcross(v: Vec3, a: VectorForm): [Affine, Affine, Affine] {
    const r = vzero();
    accumulate(r[0], a[2], v.y);
    accumulate(r[0], a[1], 0 - v.z);
    accumulate(r[1], a[0], v.z);
    accumulate(r[1], a[2], 0 - v.x);
    accumulate(r[2], a[1], v.x);
    accumulate(r[2], a[0], 0 - v.y);
    return r;
}

function vdot(a: VectorForm, v: Vec3): Affine {
    const r = affine();
    accumulate(r, a[0], v.x);
    accumulate(r, a[1], v.y);
    accumulate(r, a[2], v.z);
    return r;
}

/** The vector form e1·x[base] + e2·x[base + 1]. */
function inPlaneForm(base: number, [e1, e2]: readonly [Vec3, Vec3]): [Affine, Affine, Affine] {
    const r = along(variable(base), e1);
    vaccumulate(r, along(variable(base + 1), e2), 1);
    return r;
}

function components(base: number): [Affine, Affine, Affine] {
    return [variable(base), variable(base + 1), variable(base + 2)];
}

/** The value of a vector form at x. */
export function vectorValue(f: VectorForm, x: readonly number[]): Vec3 {
    return vec3(valueOf(f[0], x), valueOf(f[1], x), valueOf(f[2], x));
}

/** The change of a vector form when x changes by dx. */
export function vectorLinear(f: VectorForm, dx: readonly number[]): Vec3 {
    return vec3(linearValue(f[0], dx), linearValue(f[1], dx), linearValue(f[2], dx));
}

/** One candidate's linear system A·x = b and the quantities it determines, as forms over x. */
export interface System {
    readonly size: number;
    readonly A: number[][];
    readonly b: number[];
    /** Per ball: acceleration, angular acceleration, turf friction F, rolling resistance Q, load L. */
    readonly accel: readonly VectorForm[];
    readonly spin: readonly VectorForm[];
    readonly turf: readonly VectorForm[];
    readonly resist: readonly VectorForm[];
    readonly load: readonly Affine[];
    /** Per contact: the force on b (zero when open) and its normal component N. */
    readonly force: readonly VectorForm[];
    readonly normal: readonly Affine[];
    /** Per contact: acceleration of a's contact point relative to b's, with the geometry frozen. */
    readonly relative: readonly VectorForm[];
    /** Per direction item: the quantity its direction must follow (acceleration, turf slip rate, contact slip rate). */
    readonly follow: readonly VectorForm[];
}

/** Unknowns per ball mode: see the module comment. */
const UNKNOWNS: Readonly<Record<BallMode, number>> = {
    held: 4,
    released: 4,
    "turf-rolling": 4,
    "turf-sliding": 5,
    airborne: 6,
};

const AXES: readonly Vec3[] = [vec3(1, 0, 0), vec3(0, 1, 0), vec3(0, 0, 1)];

/**
 * Assembles one candidate's system for the given unit directions (one per direction item; the system is linear in
 * each). The candidate must be settled (see settled). Rows, in order: per ball its linear rows (in-plane on the turf,
 * 3D in flight) and its angular rows (in-plane while the spin about the turf normal is locked, else 3D); per coupled
 * contact its closing row and, while it sticks, its two tangential rows. Unknowns, in order: per ball by mode
 * (held: F, Q; rolling or released: a, F; sliding: a, α; in flight: a, α), then per coupled contact N (and T₁, T₂).
 */
export function assemble(
    model: Model,
    cand: Candidate,
    items: readonly DirectionItem[],
    dirs: readonly Vec3[],
): System {
    const { bodies, contacts, geometry, gravity } = model;
    const ballDirection = new Map<number, Vec3>();
    const contactDirection = new Map<number, Vec3>();
    items.forEach((it, j) => {
        (it.kind === "contact-onset" ? contactDirection : ballDirection).set(it.index, dirs[j] as Vec3);
    });

    let size = 0;
    const ballBase = cand.balls.map((mode) => {
        const base = size;
        size += UNKNOWNS[mode];
        return base;
    });
    const contactBase = contacts.map((c, k) => {
        if (cand.contacts[k] === "open") {
            return -1;
        }
        const base = size;
        size += cand.contacts[k] === "stick" && c.friction > 0 ? 3 : 1;
        return base;
    });
    const n = size;

    // Contact forces on b: N·n, plus the stuck tangential force or μN along the (frozen or unknown) slip.
    const normal: Affine[] = [];
    const force: VectorForm[] = [];
    contacts.forEach((c, k) => {
        const g = geometry[k] as ContactGeometry;
        const base = contactBase[k] as number;
        if (base < 0) {
            normal.push(affine());
            force.push(vzero());
            return;
        }
        const N = variable(base);
        const P = along(N, g.n);
        if (c.friction > 0) {
            if (cand.contacts[k] === "stick") {
                vaccumulate(P, along(variable(base + 1), g.t1), 1);
                vaccumulate(P, along(variable(base + 2), g.t2), 1);
            } else {
                vaccumulate(P, along(N, g.slipping ? g.sHat : (contactDirection.get(k) ?? ZERO)), c.friction);
            }
        }
        normal.push(N);
        force.push(P);
    });

    const accel: VectorForm[] = [];
    const spin: VectorForm[] = [];
    const turf: VectorForm[] = [];
    const resist: VectorForm[] = [];
    const load: Affine[] = [];
    const rows: Affine[] = [];
    bodies.forEach((body, i) => {
        const radius = body.params.radius;
        const up = body.turfNormal;
        const plane = model.planes[i] as readonly [Vec3, Vec3];
        // Σ P on the ball and Σ ê × P.
        const sum = vzero();
        const moment = vzero();
        contacts.forEach((c, k) => {
            if (cand.contacts[k] === "open") {
                return;
            }
            const g = geometry[k] as ContactGeometry;
            if (c.a === i) {
                vaccumulate(sum, force[k] as VectorForm, -1);
                vaccumulate(moment, vcross(g.n, force[k] as VectorForm), -1);
            }
            if (!c.fixed && c.b === i) {
                vaccumulate(sum, force[k] as VectorForm, 1);
                vaccumulate(moment, vcross(scale(g.n, -1), force[k] as VectorForm), 1);
            }
        });
        // L = −g⃗·normal − Σ P·normal.
        const L = affine(0 - dot(gravity, up));
        accumulate(L, vdot(sum, up), -1);
        load.push(L);
        const base = ballBase[i] as number;
        const mode = cand.balls[i] as BallMode;
        let a: [Affine, Affine, Affine];
        let w: [Affine, Affine, Affine];
        let F: [Affine, Affine, Affine] = vzero();
        let Q: [Affine, Affine, Affine] = vzero();
        switch (mode) {
            case "held":
                a = vzero();
                w = vzero();
                F = inPlaneForm(base, plane);
                Q = inPlaneForm(base + 2, plane);
                break;
            case "released":
            case "turf-rolling": {
                a = inPlaneForm(base, plane);
                // Rolling without slip: α = (normal × a)/R, with no spin about the normal.
                w = vzero();
                vaccumulate(w, vcross(up, a), 1 / radius);
                F = inPlaneForm(base + 2, plane);
                const d = mode === "released" ? (ballDirection.get(i) ?? ZERO) : (model.frozen[i] as Vec3);
                Q = along(scaled(L, 0 - rollCap(body.params)), d);
                break;
            }
            case "turf-sliding": {
                a = inPlaneForm(base, plane);
                w = components(base + 2);
                const d = model.classes[i] === "sliding" ? (model.frozen[i] as Vec3) : (ballDirection.get(i) ?? ZERO);
                F = along(scaled(L, 0 - muS(body.params)), d);
                break;
            }
            case "airborne":
                a = components(base);
                w = components(base + 3);
                break;
        }
        accel.push(a);
        spin.push(w);
        turf.push(F);
        resist.push(Q);
        // Linear: a − ΣP − F − Q − g⃗ = 0, in-plane on the turf (the turf takes the normal part), 3D in flight.
        const linear = vzero();
        vaccumulate(linear, a, 1);
        vaccumulate(linear, sum, -1);
        vaccumulate(linear, F, -1);
        vaccumulate(linear, Q, -1);
        linear[0].c -= gravity.x;
        linear[1].c -= gravity.y;
        linear[2].c -= gravity.z;
        // Angular, divided by R: (2/5)·R·α − (−normal × F) − Σ ê × P = 0. While the spin about the normal is locked
        // the turf takes any torque about it, so only the in-plane components are equations.
        const angular = vzero();
        vaccumulate(angular, w, 0.4 * radius);
        vaccumulate(angular, vcross(scale(up, -1), F), -1);
        vaccumulate(angular, moment, -1);
        const free = mode === "airborne" || mode === "turf-sliding";
        for (const e of mode === "airborne" ? AXES : plane) {
            rows.push(vdot(linear, e));
        }
        for (const e of free ? AXES : plane) {
            rows.push(vdot(angular, e));
        }
    });

    const relative: VectorForm[] = contacts.map((c, k) => {
        const g = geometry[k] as ContactGeometry;
        const radius = (bodies[c.a] as ContactBody).params.radius;
        const q = vzero();
        vaccumulate(q, accel[c.a] as VectorForm, 1);
        // R·α × n = (−R·n) × α, for both balls (b's contact point is at −R·n from its centre).
        vaccumulate(q, vcross(scale(g.n, 0 - radius), spin[c.a] as VectorForm), 1);
        if (!c.fixed) {
            vaccumulate(q, accel[c.b] as VectorForm, -1);
            vaccumulate(q, vcross(scale(g.n, 0 - radius), spin[c.b] as VectorForm), 1);
        }
        return q;
    });
    contacts.forEach((c, k) => {
        if (cand.contacts[k] === "open") {
            return;
        }
        const g = geometry[k] as ContactGeometry;
        // Closing rate (a_a − a_b)·n = 0 (the centres', which equals the contact points' normal rate).
        const closing = vdot(accel[c.a] as VectorForm, g.n);
        if (!c.fixed) {
            accumulate(closing, vdot(accel[c.b] as VectorForm, g.n), -1);
        }
        rows.push(closing);
        if (cand.contacts[k] === "stick" && c.friction > 0) {
            rows.push(vdot(relative[k] as VectorForm, g.t1));
            rows.push(vdot(relative[k] as VectorForm, g.t2));
        }
    });

    if (rows.length !== n) {
        throw new Error(`contact system not square: ${rows.length} rows, ${n} unknowns`);
    }
    const follow = items.map((it): VectorForm => {
        if (it.kind === "release") {
            return accel[it.index] as VectorForm;
        }
        if (it.kind === "turf-onset") {
            // Turf slip rate a − R·α × normal = a + R·normal × α.
            const body = bodies[it.index] as ContactBody;
            const u = vzero();
            vaccumulate(u, accel[it.index] as VectorForm, 1);
            vaccumulate(u, vcross(body.turfNormal, spin[it.index] as VectorForm), body.params.radius);
            return u;
        }
        return relative[it.index] as VectorForm;
    });
    return {
        size: n,
        A: rows.map((r) => denseRow(r, n)),
        b: rows.map((r) => 0 - r.c),
        accel,
        spin,
        turf,
        resist,
        load,
        force,
        normal,
        relative,
        follow,
    };
}

/** A solved candidate's quantities. */
export interface Evaluated {
    readonly accel: readonly Vec3[];
    readonly spin: readonly Vec3[];
    readonly turf: readonly Vec3[];
    readonly resist: readonly Vec3[];
    readonly load: readonly number[];
    readonly force: readonly Vec3[];
    readonly normal: readonly number[];
    readonly relative: readonly Vec3[];
}

/** Evaluates a system's quantities at the solution x. */
export function evaluate(sys: System, x: readonly number[]): Evaluated {
    return {
        accel: sys.accel.map((v) => vectorValue(v, x)),
        spin: sys.spin.map((v) => vectorValue(v, x)),
        turf: sys.turf.map((v) => vectorValue(v, x)),
        resist: sys.resist.map((v) => vectorValue(v, x)),
        load: sys.load.map((l) => valueOf(l, x)),
        force: sys.force.map((v) => vectorValue(v, x)),
        normal: sys.normal.map((l) => valueOf(l, x)),
        relative: sys.relative.map((v) => vectorValue(v, x)),
    };
}

function tangentialLength(P: Vec3, n: Vec3): number {
    return length(sub(P, scale(n, dot(P, n))));
}

/**
 * Why a solved candidate is not consistent, or null when it is (design §4, "Consistency of a candidate"; the
 * direction criteria are modeSolve.ts's). Every coupled N ≥ 0 and no open contact converges; a stuck contact's
 * tangential force is within μN; a turf ball's load is positive; a held ball is within its resistance and static turf
 * friction (each relaxed by HOLD_SLACK); a rolling ball's static turf friction is within μs·L; a turf ball that left
 * the turf does not accelerate into it.
 */
export function inconsistency(model: Model, cand: Candidate, ev: Evaluated): string | null {
    const { contacts, geometry, bodies } = model;
    for (let k = 0; k < contacts.length; k++) {
        const c = contacts[k] as RestingContact;
        const g = geometry[k] as ContactGeometry;
        if (cand.contacts[k] === "open") {
            const closing = dot(sub(ev.accel[c.a] as Vec3, c.fixed ? ZERO : (ev.accel[c.b] as Vec3)), g.n);
            if (closing > ACCELERATION_EPSILON) {
                return `open contact ${k} converges (${closing})`;
            }
            continue;
        }
        const N = ev.normal[k] as number;
        if (N < 0 - FORCE_EPSILON) {
            return `contact ${k} pulls (N = ${N})`;
        }
        if (cand.contacts[k] === "stick" && c.friction > 0) {
            const T = tangentialLength(ev.force[k] as Vec3, g.n);
            if (T > c.friction * N + FORCE_EPSILON) {
                return `contact ${k} outside its cone (|T| = ${T}, μN = ${c.friction * N})`;
            }
        }
    }
    for (let i = 0; i < bodies.length; i++) {
        const mode = cand.balls[i] as BallMode;
        const p = (bodies[i] as ContactBody).params;
        if (mode === "airborne") {
            const up = (bodies[i] as ContactBody).turfNormal;
            const rise = dot(ev.accel[i] as Vec3, up);
            if (model.classes[i] !== "airborne" && rise < 0 - ACCELERATION_EPSILON) {
                return `ball ${i} lifted but accelerates into the turf (${rise})`;
            }
            continue;
        }
        const L = ev.load[i] as number;
        if (L <= 0) {
            return `ball ${i} load ${L} ≤ 0 (it leaves the turf)`;
        }
        const F = length(ev.turf[i] as Vec3);
        if (mode === "held") {
            const Q = length(ev.resist[i] as Vec3);
            if (Q > rollCap(p) * L + HOLD_SLACK) {
                return `held ball ${i} beyond its resistance (${Q} > ${rollCap(p) * L})`;
            }
            if (F > muS(p) * L + HOLD_SLACK) {
                return `held ball ${i} beyond its static turf friction (${F} > ${muS(p) * L})`;
            }
        }
        if ((mode === "turf-rolling" || mode === "released") && F > muS(p) * L + FORCE_EPSILON) {
            return `rolling ball ${i} needs turf friction ${F} > μs·L = ${muS(p) * L}`;
        }
    }
    return null;
}

/** The balls on the turf whose load a solved candidate makes zero or negative: they leave the turf (spec §5). */
export function lowLoad(model: Model, cand: Candidate, ev: Evaluated): number[] {
    return cand.balls.flatMap((mode, i) => (mode !== "airborne" && (ev.load[i] as number) <= 0 ? [i] : []));
}

/** The tangential part of a force form, P − n·(n·P), as three component forms. */
function tangential(P: VectorForm, n: Vec3): Affine[] {
    const normalPart = vdot(P, n);
    const comps = [n.x, n.y, n.z] as const;
    return ([0, 1, 2] as const).map((axis) => {
        const r = affine();
        accumulate(r, P[axis], 1);
        accumulate(r, normalPart, 0 - comps[axis]);
        return r;
    });
}

/**
 * The candidate's convex conditions as cones over the unknowns (the same conditions inconsistency() checks, apart
 * from open contacts, which do not depend on the free forces): N ≥ 0, stuck forces within μN, turf loads ≥ 0, rolling
 * balls' static turf friction within μs·L, held balls' resistance and static turf friction within their limits
 * (relaxed by HOLD_SLACK), and a lifted ball not accelerating into the turf. Used by the minimum-norm choice of free
 * forces (modeSolve.ts).
 */
export function cones(model: Model, cand: Candidate, sys: System): Cone[] {
    const out: Cone[] = [];
    model.contacts.forEach((c, k) => {
        if (cand.contacts[k] === "open") {
            return;
        }
        const N = sys.normal[k] as Affine;
        out.push({ u: [], v: N, slack: CONVEX_SLACK });
        if (cand.contacts[k] === "stick" && c.friction > 0) {
            const g = model.geometry[k] as ContactGeometry;
            out.push({ u: tangential(sys.force[k] as VectorForm, g.n), v: scaled(N, c.friction), slack: CONVEX_SLACK });
        }
    });
    cand.balls.forEach((mode, i) => {
        const body = model.bodies[i] as ContactBody;
        const [e1, e2] = model.planes[i] as readonly [Vec3, Vec3];
        if (mode === "airborne") {
            if (model.classes[i] !== "airborne") {
                out.push({ u: [], v: vdot(sys.accel[i] as VectorForm, body.turfNormal), slack: CONVEX_SLACK });
            }
            return;
        }
        const L = sys.load[i] as Affine;
        const planar = (f: VectorForm): Affine[] => [vdot(f, e1), vdot(f, e2)];
        out.push({ u: [], v: L, slack: CONVEX_SLACK });
        if (mode === "held") {
            out.push({ u: planar(sys.turf[i] as VectorForm), v: scaled(L, muS(body.params)), slack: HOLD_SLACK });
            out.push({ u: planar(sys.resist[i] as VectorForm), v: scaled(L, rollCap(body.params)), slack: HOLD_SLACK });
        } else if (mode === "turf-rolling" || mode === "released") {
            out.push({ u: planar(sys.turf[i] as VectorForm), v: scaled(L, muS(body.params)), slack: CONVEX_SLACK });
        }
    });
    return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/contactModel.test.ts` then `npm run lint` and `npm run check`
Expected: all pass. The closed-form numbers are exact to the digits given; if one disagrees, re-check the assembly
against the module comment's equations before touching a number, and report.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/engine/contactModel.ts tests/engine/contactModel.test.ts
git add src/engine/contactModel.ts tests/engine/contactModel.test.ts
git commit -m "Add the friction contact model of one candidate"
```

---

### Task 5: Solving one candidate

Closes a candidate's unknown directions and checks it (design §4 steps 4, 5 and 7's approximate-slip). This is the
prototype's `modeSolveJam.ts` (`solveX`, `newton`, `solveCandidate`) without its diagnostics and switches: the seed
fan is dropped, the scan stays behind the cheap starts, `Math.sin/cos/atan2/hypot` are replaced by Task 1's functions
and work is counted.

Newton's unknowns are one angle φ_j per direction item, d_j = cos φ_j·e1 + sin φ_j·e2. For given angles the candidate
is one linear solve A(φ)·x = b(φ), linear in each d_j. The residual r_j = (d_j turned by +90°)·w_j(x) is zero when the
followed quantity w_j (a released ball's acceleration, a turf slip rate, a contact slip rate) is parallel to d_j; the
exact Jacobian is dx/dφ_k = A⁻¹·(∂b_k − ∂A_k·x), dr_j/dφ_k = −δ_jk·(d_j·w_j) + p_j·W_j·dx/dφ_k. A root is accepted only
if every d_j·w_j > FOLLOW_EPSILON and |sin(d_j, w_j)| ≤ FOLLOW_EPSILON.

**Files:**
- Create: `src/engine/modeSolve.ts`
- Test: `tests/engine/modeSolve.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `NEWTON_ITERATIONS = 60`, `ARMIJO_HALVINGS = 30`, `NEWTON_STEP_TOLERANCE = 1e-11`.
  - `interface SolveHooks { readonly failDirections?: boolean }` (test seam: every direction root is rejected).
  - `type Failure = "none" | "singular" | "direction" | "inconsistent"`.
  - `interface CandidateOutcome { ok; failure; reason; cand; items; directions: readonly Vec3[]; sys: System | null;
    x: readonly number[] | null; ev: Evaluated | null; residual: number }` (`residual`: the smallest largest
    |r_j| any Newton run at full friction reached, m/s²; 0 with no direction items).
  - `solveCandidate(model, cand, seed: (it: DirectionItem) => Vec3, work, hooks?): CandidateOutcome` (`cand` settled).
  - `fallbackSlip(model, cand, work): CandidateOutcome | null`.

- [ ] **Step 1: Write the failing tests**

Create `tests/engine/modeSolve.test.ts`. The numbers are closed forms derived for this plan and checked against the
prototype (case numbers refer to the planning ledger; the derivations are in the test comments).

```ts
import { describe, expect, it } from "vitest";
import {
    buildModel,
    settled,
    type Candidate,
    type ContactBody,
    type Model,
    type RestingContact,
} from "../../src/engine/contactModel";
import type { Work } from "../../src/engine/linalg";
import { ZERO, vec3, type Vec3 } from "../../src/engine/math/vec3";
import { fallbackSlip, solveCandidate } from "../../src/engine/modeSolve";
import type { MotionParams } from "../../src/engine/types";

const R = 0.046;
const G = 9.80665;
const SLIDE = 3;
const UP = vec3(0, 0, 1);
const GRAVITY = vec3(0, 0, -G);
const C30 = Math.sqrt(3) / 2;
const work = (): Work => ({ units: 0 });

function params(rollingDecel: number): MotionParams {
    return { radius: R, slidingDecel: SLIDE, rollingDecel, gravity: G };
}

function body(position: Vec3, angularVelocity: Vec3 = ZERO, p: MotionParams = params(0.5)): ContactBody {
    return { state: { position, velocity: ZERO, angularVelocity }, params: p, turfNormal: UP, pivotCapacity: Infinity };
}

const PAIR: RestingContact[] = [{ a: 0, b: 1, fixed: false, friction: 0.05 }];
const LINE: RestingContact[] = [
    { a: 0, b: 1, fixed: false, friction: 0.05 },
    { a: 1, b: 2, fixed: false, friction: 0.05 },
];

/** push.test's topspin push: blue (topspin 60 rad/s) touches red, both at rest. */
function topspin(): Model {
    return buildModel([body(vec3(0, 0, R), vec3(0, 60, 0)), body(vec3(2 * R, 0, R))], [], PAIR, GRAVITY);
}

/** push.test's chain: a topspin driver, ball 1, and ball 2 bent by `bend` from the line. */
function chain(rollingDecel: number, bend: number): Model {
    const p = params(rollingDecel);
    return buildModel(
        [
            body(vec3(0, 0, R), vec3(0, 60, 0), p),
            body(vec3(2 * R, 0, R), ZERO, p),
            body(vec3(2 * R + 2 * R * Math.cos(bend), 2 * R * Math.sin(bend), R), ZERO, p),
        ],
        [],
        LINE,
        GRAVITY,
    );
}

/** push.test's lean: blue, in flight and at rest, leans on red (on the turf, at rest) at 30° from the vertical. */
function lean(rollingDecel: number): Model {
    const p = params(rollingDecel);
    return buildModel([body(vec3(R, 0, R + 2 * R * C30), ZERO, p), body(vec3(0, 0, R), ZERO, p)], [], PAIR, GRAVITY);
}

describe("solveCandidate", () => {
    it("finds a ball's release direction from rest by Newton (topspin push)", () => {
        const model = topspin();
        const cand: Candidate = { balls: ["turf-sliding", "released"], contacts: ["slip"] };
        const out = solveCandidate(model, cand, () => vec3(0, 1, 0), work());
        expect(out.reason).toBe("ok");
        expect(out.directions[0]?.x).toBeCloseTo(1, 12);
        expect(out.ev?.accel[1]?.x).toBeCloseTo(0.89895492703632, 12);
        expect(out.residual).toBeLessThanOrEqual(1e-9);
    });

    it("slips a ball in flight down another the turf holds (contact slip onset)", () => {
        // Rolling down red would need friction (2/7)·tan 30°·N > μN, so the contact slips down-slope along
        // ŝ = (cos 30°, 0, −sin 30°): N = g·cos 30°, x_blue = g(sin 30° − μ·cos 30°)·ŝ, α_blue = (5μ·g·cos 30°/2R)·ŷ.
        const model = lean(5);
        const cand: Candidate = { balls: ["airborne", "held"], contacts: ["slip"] };
        const out = solveCandidate(model, cand, (it) => it.e1, work());
        expect(out.reason).toBe("ok");
        expect(out.directions[0]?.x).toBeCloseTo(C30, 9);
        expect(out.directions[0]?.z).toBeCloseTo(-0.5, 9);
        expect(out.ev?.normal[0]).toBeCloseTo(8.4928080260227, 12);
        expect(out.ev?.accel[0]?.x).toBeCloseTo(3.8786546380113, 12);
        expect(out.ev?.accel[0]?.z).toBeCloseTo(-2.2393422993494, 12);
        expect(out.ev?.spin[0]?.y).toBeCloseTo(23.078282679409, 9);
    });

    it("releases the middle ball of a line bent by 60° and slips its contact with the held end (two directions)", () => {
        // Ball 1 rolls along (cos 30°, −sin 30°); its contact with ball 2 starts to slip the same way. With
        // B = [(1 − μ)(cos 30° − μ/2) − kμ]/(1 + μ·μs): a = (B·SLIDE − k·g)/(7/(5·cos 30°) + B), x₁ = (a, −a·tan 30°).
        const model = chain(1.5, Math.PI / 3);
        const cand: Candidate = { balls: ["turf-sliding", "released", "held"], contacts: ["slip", "slip"] };
        const out = solveCandidate(model, cand, (it) => it.e1, work());
        expect(out.reason).toBe("ok");
        expect(out.ev?.accel[1]?.x).toBeCloseTo(0.095769964237268, 12);
        expect(out.ev?.accel[1]?.y).toBeCloseTo(-0.055292814632668, 12);
        expect(out.directions[0]?.x).toBeCloseTo(C30, 9);
        expect(out.directions[0]?.y).toBeCloseTo(-0.5, 9);
        expect(out.directions[1]?.x).toBeCloseTo(C30, 9);
        expect(out.directions[1]?.y).toBeCloseTo(-0.5, 9);
    });

    it("settles the static forces of held balls by the minimum-norm rule (a straight line held)", () => {
        // The 1–2 contact joins two held balls, so its rows vanish and the system is singular; the convex solve picks
        // its forces. The driver's contact is determined: N₀₁ = SLIDE/(1 + μ·μs).
        const model = chain(1.5, 0);
        const cand = settled(model, { balls: ["turf-sliding", "held", "held"], contacts: ["slip", "open"] });
        expect(cand.contacts).toEqual(["slip", "stick"]);
        const out = solveCandidate(model, cand, (it) => it.e1, work());
        expect(out.reason).toBe("ok");
        expect(out.ev?.normal[0]).toBeCloseTo(2.954804075668, 12);
    });

    it("reports a failed direction solve, then slips against the stuck force (approximate-slip)", () => {
        const model = lean(5);
        const cand: Candidate = { balls: ["airborne", "held"], contacts: ["slip"] };
        const failed = solveCandidate(model, cand, (it) => it.e1, work(), { failDirections: true });
        expect(failed.ok).toBe(false);
        expect(failed.failure).toBe("direction");
        // Stuck, the contact pushes red down-slope, so the fallback slips it the way the exact solve does.
        const fallback = fallbackSlip(model, cand, work());
        expect(fallback?.ok).toBe(true);
        expect(fallback?.directions[0]?.x).toBeCloseTo(C30, 9);
        expect(fallback?.directions[0]?.z).toBeCloseTo(-0.5, 9);
        expect(fallback?.ev?.accel[0]?.x).toBeCloseTo(3.8786546380113, 12);
    });

    it("has no approximate-slip fallback for a ball released from rest", () => {
        const cand: Candidate = { balls: ["turf-sliding", "released"], contacts: ["slip"] };
        expect(fallbackSlip(topspin(), cand, work())).toBeNull();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/modeSolve.test.ts`
Expected: FAIL (cannot resolve `../../src/engine/modeSolve`).

- [ ] **Step 3: Implement**

Create `src/engine/modeSolve.ts`:

```ts
/**
 * Mode selection for one group of touching bodies (P2a.2 design §4 steps 2–7).
 *
 * A candidate (contactModel.ts) whose directions are all known is one linear solve. Unknown directions — a ball
 * released from rest, a turf slip or a contact slip that starts — are closed by residual-merit Newton on one angle per
 * direction: minimise ½‖r‖² with Armijo backtracking and accept only a converged root that every followed quantity
 * agrees with (FOLLOW_EPSILON). The starts, in order: four cheap starts (the seed and its quarter turns); for at most
 * two directions a forward scan, whose best four points start Newton again; then continuation in the contact friction
 * (μ scaled to 1e-3 of its value, then 0.1, 0.25, 0.5, 0.75 and 1, each seeded from the previous root). The scan must
 * stay behind the cheap starts, or it rejects genuine releases just past a limit of holding.
 *
 * Undetermined forces (a singular but consistent system) are the minimum-norm forces satisfying every convex
 * condition of the candidate (convexSolve.ts); every acceptance check is run again after that choice.
 */
import { solveConvex } from "./convexSolve";
import {
    FOLLOW_EPSILON,
    assemble,
    buildModel,
    cones,
    directionItems,
    evaluate,
    inconsistency,
    settled,
    vectorLinear,
    vectorValue,
    type BallMode,
    type Candidate,
    type ContactGeometry,
    type ContactMode,
    type DirectionItem,
    type Evaluated,
    type Model,
    type System,
    type VectorForm,
} from "./contactModel";
import { solveFactored, solveLinear, solveSystem, type Factored, type Work } from "./linalg";
import { atan2, sinCos } from "./math/elementary";
import { ZERO, dot, length, normalize, scale, sub, vec3, type Vec3 } from "./math/vec3";

/** Iteration cap of one Newton run. */
export const NEWTON_ITERATIONS = 60;

/** Halvings of a Newton step before its line search gives up. */
export const ARMIJO_HALVINGS = 30;

/** Sufficient decrease of the merit function in the line search (Armijo's constant). */
const ARMIJO_C = 1e-4;

/** Newton has converged once its step (rad) is at most this. A numerical tolerance. */
export const NEWTON_STEP_TOLERANCE = 1e-11;

/** Friction scales of the continuation (design §4 step 4). */
const CONTINUATION = [1e-3, 0.1, 0.25, 0.5, 0.75, 1] as const;

/** Points of the forward scan: 24 directions for one unknown, 12 × 12 for two. */
const SCAN_ONE = 24;
const SCAN_TWO = 12;

/** Step (rad) of the forward-difference Jacobian used where the null space moves a followed rate. */
const SENSITIVITY_STEP = 1e-7;

/**
 * A null-space vector couples to a followed rate when it changes the rate by more than this times its own size (at
 * least 1). A numerical tolerance.
 */
const COUPLING_TOLERANCE = 1e-9;

/** Test seam: with failDirections set, every direction root is rejected, to reach the approximate-slip fallback. */
export interface SolveHooks {
    readonly failDirections?: boolean;
}

export type Failure = "none" | "singular" | "direction" | "inconsistent";

/** The outcome of solving one candidate. */
export interface CandidateOutcome {
    readonly ok: boolean;
    /** "direction": no accepted direction root (the approximate-slip fallback's input). */
    readonly failure: Failure;
    readonly reason: string;
    /** The candidate, settled. */
    readonly cand: Candidate;
    readonly items: readonly DirectionItem[];
    /** One unit direction per item (empty when the direction solve failed). */
    readonly directions: readonly Vec3[];
    readonly sys: System | null;
    readonly x: readonly number[] | null;
    readonly ev: Evaluated | null;
    /** The smallest largest |r_j| (m/s²) any Newton run at full friction reached; 0 with no direction items. */
    readonly residual: number;
}

interface Solved {
    readonly x: number[];
    readonly nullDim: number;
    readonly lu: Factored | null;
}

function norm(v: readonly number[]): number {
    let squares = 0;
    for (const e of v) {
        squares += e * e;
    }
    return Math.sqrt(squares);
}

/**
 * Solves a candidate's system. A singular but consistent system leaves forces undetermined; they are taken as the
 * minimum-norm forces satisfying every convex condition (design §4 step 5). While Newton searches (final false), a
 * null space that leaves every followed rate unchanged cannot move the root, so the unconstrained minimum-norm
 * solution stands in and the forces are settled once, at the accepted root; one that couples to a followed rate (a
 * sliding ball jammed against three or more bodies) is settled at every evaluation.
 */
function solveX(model: Model, cand: Candidate, sys: System, final: boolean, work: Work): Solved | null {
    const solution = solveSystem(sys.A, sys.b, work);
    if (!solution) {
        return null;
    }
    if (solution.basis.length === 0) {
        return { x: solution.x, nullDim: 0, lu: solution.lu };
    }
    const coupled = solution.basis.some((v) =>
        sys.follow.some((f) => length(vectorLinear(f, v)) > COUPLING_TOLERANCE * Math.max(1, norm(v))),
    );
    if (!final && !coupled) {
        return { x: solution.x, nullDim: solution.basis.length, lu: null };
    }
    const r = solveConvex(cones(model, cand, sys), solution.x, solution.basis, work);
    return { x: r.x, nullDim: solution.basis.length, lu: null };
}

function direction(phi: number, it: DirectionItem): Vec3 {
    const [s, c] = sinCos(phi);
    return vec3(c * it.e1.x + s * it.e2.x, c * it.e1.y + s * it.e2.y, c * it.e1.z + s * it.e2.z);
}

function angle(d: Vec3, it: DirectionItem): number {
    return atan2(dot(d, it.e2), dot(d, it.e1));
}

/** The candidate solved for given angles: its system, solution, residuals, followed rates and directions. */
interface Point {
    readonly sys: System;
    readonly x: number[];
    readonly r: number[];
    readonly w: Vec3[];
    readonly d: Vec3[];
    readonly nullDim: number;
    /** The factorisation of a regular system, reused for the Jacobian's right-hand sides. */
    readonly lu: Factored | null;
}

function pointAt(
    model: Model,
    cand: Candidate,
    items: readonly DirectionItem[],
    phi: readonly number[],
    work: Work,
): Point | null {
    const d = items.map((it, j) => direction(phi[j] as number, it));
    const sys = assemble(model, cand, items, d);
    const solved = solveX(model, cand, sys, false, work);
    if (!solved) {
        return null;
    }
    const w = sys.follow.map((f) => vectorValue(f, solved.x));
    const r = items.map((it, j) => dot(direction((phi[j] as number) + Math.PI / 2, it), w[j] as Vec3));
    return { sys, x: solved.x, r, w, d, nullDim: solved.nullDim, lu: solved.lu };
}

function merit(r: readonly number[]): number {
    return 0.5 * r.reduce((s, v) => s + v * v, 0);
}

interface Run {
    readonly converged: boolean;
    readonly phi: number[];
    readonly point: Point | null;
    /** Largest |r_j| at the run's last point; Infinity when it never solved. */
    readonly residual: number;
}

/** One residual-merit Newton run from the given angles. */
function newton(model: Model, cand: Candidate, items: readonly DirectionItem[], start: readonly number[], work: Work): Run {
    let phi = [...start];
    let point = pointAt(model, cand, items, phi, work);
    const done = (converged: boolean): Run => ({
        converged,
        phi,
        point,
        residual: point ? Math.max(0, ...point.r.map(Math.abs)) : Infinity,
    });
    if (!point) {
        return done(false);
    }
    const zeros = items.map(() => ZERO);
    // The system with every direction zero; the system is linear in each direction, so ∂/∂φ_k of A and b is the system
    // for the turned direction less this one. Assembled lazily: only the exact Jacobian needs it.
    let base: System | null = null;
    for (let iteration = 0; iteration < NEWTON_ITERATIONS; iteration++) {
        const p: Point = point;
        const J = items.map(() => new Array<number>(items.length).fill(0));
        if (p.nullDim > 0) {
            // x(φ) is the minimum-norm choice here, so differentiate numerically.
            for (let k = 0; k < items.length; k++) {
                const q = pointAt(
                    model,
                    cand,
                    items,
                    phi.map((v, j) => (j === k ? v + SENSITIVITY_STEP : v)),
                    work,
                );
                if (!q) {
                    return done(false);
                }
                for (let j = 0; j < items.length; j++) {
                    (J[j] as number[])[k] = ((q.r[j] as number) - (p.r[j] as number)) / SENSITIVITY_STEP;
                }
            }
        } else {
            base ??= assemble(model, cand, items, zeros);
            const z: System = base;
            for (let k = 0; k < items.length; k++) {
                const turned = zeros.map((zero, j) =>
                    j === k ? direction((phi[k] as number) + Math.PI / 2, items[k] as DirectionItem) : zero,
                );
                const sk = assemble(model, cand, items, turned);
                const rhs = sk.b.map((bv, row) => {
                    let s = bv - (z.b[row] as number);
                    const skRow = sk.A[row] as number[];
                    const zRow = z.A[row] as number[];
                    for (let col = 0; col < p.x.length; col++) {
                        s -= ((skRow[col] as number) - (zRow[col] as number)) * (p.x[col] as number);
                    }
                    return s;
                });
                const dx = p.lu ? solveFactored(p.lu, rhs, work) : (solveSystem(p.sys.A, rhs, work)?.x ?? null);
                if (!dx) {
                    return done(false);
                }
                for (let j = 0; j < items.length; j++) {
                    const pj = direction((phi[j] as number) + Math.PI / 2, items[j] as DirectionItem);
                    const dw = vectorLinear(p.sys.follow[j] as VectorForm, dx);
                    (J[j] as number[])[k] =
                        dot(pj, dw) - (j === k ? dot(p.d[j] as Vec3, p.w[j] as Vec3) : 0);
                }
            }
        }
        const step = solveLinear(
            J,
            p.r.map((v) => 0 - v),
            work,
        );
        if (!step) {
            return done(false);
        }
        const size = Math.max(...step.map(Math.abs));
        const m0 = merit(p.r);
        let t = 1;
        let next: Point | null = null;
        let nextPhi = phi;
        for (let halving = 0; halving < ARMIJO_HALVINGS; halving++, t /= 2) {
            const trial = phi.map((v, j) => v + t * (step[j] as number));
            const q = pointAt(model, cand, items, trial, work);
            if (q && merit(q.r) <= (1 - 2 * ARMIJO_C * t) * m0) {
                next = q;
                nextPhi = trial;
                break;
            }
        }
        if (size <= NEWTON_STEP_TOLERANCE) {
            // Converged: take the step if it helps, else keep the point.
            if (next) {
                point = next;
                phi = nextPhi;
            }
            return done(true);
        }
        if (!next) {
            return done(m0 === 0);
        }
        point = next;
        phi = nextPhi;
    }
    return done(false);
}

/** The model with every contact's friction scaled by s (the continuation). */
function scaledModel(model: Model, s: number): Model {
    return buildModel(
        model.bodies,
        model.axes,
        model.contacts.map((c) => ({ ...c, friction: c.friction * s })),
        model.gravity,
    );
}

/** The direction search of design §4 step 4: an accepted point, or none with the best residual reached. */
function findDirections(
    model: Model,
    cand: Candidate,
    items: readonly DirectionItem[],
    seed: (it: DirectionItem) => Vec3,
    work: Work,
    hooks: SolveHooks,
): { readonly point: Point | null; readonly residual: number; readonly reason: string } {
    const forward = (pt: Point): boolean =>
        !hooks.failDirections &&
        items.every(
            (_, j) =>
                dot(pt.d[j] as Vec3, pt.w[j] as Vec3) > FOLLOW_EPSILON &&
                Math.abs(pt.r[j] as number) <= FOLLOW_EPSILON * length(pt.w[j] as Vec3),
        );
    let residual = Infinity;
    const tryStarts = (starts: readonly (readonly number[])[]): Point | null => {
        for (const start of starts) {
            const run = newton(model, cand, items, start, work);
            residual = Math.min(residual, run.residual);
            if (run.converged && run.point && forward(run.point)) {
                return run.point;
            }
        }
        return null;
    };
    // 1. Cheap starts: the seed and its quarter turns.
    const phi0 = items.map((it) => angle(seed(it), it));
    const quarters = [0, Math.PI / 2, -Math.PI / 2, Math.PI].map((off) => phi0.map((p) => p + off));
    const cheap = tryStarts(quarters);
    if (cheap) {
        return { point: cheap, residual, reason: "" };
    }
    // 2. Forward scan (at most two directions): with no point where every direction is followed forwards there is no
    // root to find; otherwise Newton starts again from the best four points.
    if (items.length <= 2) {
        const per = items.length === 1 ? SCAN_ONE : SCAN_TWO;
        const total = items.length === 1 ? per : per * per;
        const scored: { readonly phi: number[]; readonly m: number }[] = [];
        for (let code = 0; code < total; code++) {
            const phi = items.map((_, j) => {
                const k = (j === 0 ? code : Math.floor(code / per)) % per;
                return (2 * Math.PI * (k + 0.5)) / per;
            });
            const pt = pointAt(model, cand, items, phi, work);
            if (pt && items.every((_, j) => dot(pt.d[j] as Vec3, pt.w[j] as Vec3) > 0)) {
                scored.push({
                    phi,
                    m: merit(pt.r.map((r, j) => r / Math.max(1e-300, length(pt.w[j] as Vec3)))),
                });
            }
        }
        if (scored.length === 0) {
            return { point: null, residual, reason: "scan: no forward direction" };
        }
        scored.sort((p, q) => p.m - q.m);
        const scanned = tryStarts(scored.slice(0, 4).map((s) => s.phi));
        if (scanned) {
            return { point: scanned, residual, reason: "" };
        }
    }
    // 3. Continuation in the contact friction, from each cheap start.
    for (const start of quarters) {
        let current: readonly number[] = start;
        let last: Point | null = null;
        for (const s of CONTINUATION) {
            const run = newton(s === 1 ? model : scaledModel(model, s), cand, items, current, work);
            if (s === 1) {
                residual = Math.min(residual, run.residual);
            }
            if (!run.converged || !run.point || !forward(run.point)) {
                last = null;
                break;
            }
            current = run.phi;
            last = run.point;
        }
        if (last) {
            return { point: last, residual, reason: "" };
        }
    }
    return { point: null, residual, reason: "no converged forward root" };
}

/**
 * Solves one settled candidate exactly and checks it (design §4 steps 4–5). Unknown directions are seeded from `seed`.
 */
export function solveCandidate(
    model: Model,
    cand: Candidate,
    seed: (it: DirectionItem) => Vec3,
    work: Work,
    hooks: SolveHooks = {},
): CandidateOutcome {
    const items = directionItems(model, cand);
    const failed = (failure: Failure, reason: string, residual: number): CandidateOutcome => ({
        ok: false,
        failure,
        reason,
        cand,
        items,
        directions: [],
        sys: null,
        x: null,
        ev: null,
        residual,
    });
    let sys: System;
    let directions: readonly Vec3[] = [];
    let residual = 0;
    if (items.length === 0) {
        sys = assemble(model, cand, [], []);
    } else {
        const found = findDirections(model, cand, items, seed, work, hooks);
        residual = found.residual;
        if (!found.point) {
            return failed("direction", found.reason, residual);
        }
        sys = found.point.sys;
        directions = found.point.d;
    }
    const solved = solveX(model, cand, sys, true, work);
    if (!solved) {
        return failed("singular", "inconsistent system", residual);
    }
    const ev = evaluate(sys, solved.x);
    const back = items.findIndex(
        (_, j) => dot(directions[j] as Vec3, vectorValue(sys.follow[j] as VectorForm, solved.x)) <= FOLLOW_EPSILON,
    );
    const bad = back >= 0 ? `direction ${back} not followed after the forces were settled` : inconsistency(model, cand, ev);
    return {
        ok: bad === null,
        failure: bad === null ? "none" : "inconsistent",
        reason: bad ?? "ok",
        cand,
        items,
        directions,
        sys,
        x: solved.x,
        ev,
        residual,
    };
}

/**
 * The approximate-slip last resort (design §4 step 7) for a settled candidate whose direction solve failed: each
 * contact that starts to slip slips along the tangential force it carries when it sticks, and each ball whose turf
 * slip starts slips against the static turf friction it needs when it rolls (or, at rest, is held). Null when the
 * candidate also releases a ball from rest (not covered) or either solve fails.
 */
export function fallbackSlip(model: Model, cand: Candidate, work: Work): CandidateOutcome | null {
    const items = directionItems(model, cand);
    if (items.some((it) => it.kind === "release")) {
        return null;
    }
    const onset = (kind: DirectionItem["kind"], index: number): boolean =>
        items.some((it) => it.kind === kind && it.index === index);
    const stuck = settled(model, {
        balls: cand.balls.map(
            (m, i): BallMode =>
                onset("turf-onset", i) ? (model.classes[i] === "rolling" ? "turf-rolling" : "held") : m,
        ),
        contacts: cand.contacts.map((m, k): ContactMode => (onset("contact-onset", k) ? "stick" : m)),
    });
    const stuckSys = assemble(model, stuck, [], []);
    const stuckX = solveX(model, stuck, stuckSys, true, work);
    if (!stuckX) {
        return null;
    }
    const stuckEv = evaluate(stuckSys, stuckX.x);
    const dirs = items.map((it) => {
        if (it.kind === "contact-onset") {
            const n = (model.geometry[it.index] as ContactGeometry).n;
            const P = stuckEv.force[it.index] as Vec3;
            return normalize(sub(P, scale(n, dot(P, n))));
        }
        return scale(normalize(stuckEv.turf[it.index] as Vec3), -1);
    });
    if (dirs.some((d) => length(d) === 0)) {
        return null;
    }
    const sys = assemble(model, cand, items, dirs);
    const solved = solveX(model, cand, sys, true, work);
    if (!solved) {
        return null;
    }
    const ev = evaluate(sys, solved.x);
    const bad = inconsistency(model, cand, ev);
    return {
        ok: bad === null,
        failure: bad === null ? "none" : "inconsistent",
        reason: bad ?? "ok",
        cand,
        items,
        directions: dirs,
        sys,
        x: solved.x,
        ev,
        residual: 0,
    };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/modeSolve.test.ts` then `npm run lint` and `npm run check`
Expected: all pass. A direction test failing with `no converged forward root` means a start or the scan is wrong, not
the numbers: compare with the prototype's `newton` and `solveCandidate` (described above) before changing anything.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/engine/modeSolve.ts tests/engine/modeSolve.test.ts
git add src/engine/modeSolve.ts tests/engine/modeSolve.test.ts
git commit -m "Solve friction candidates with Newton on their unknown directions"
```

---

### Task 6: The proposal and the group search

Design §4 steps 2, 3, 6 and 7. The proposal is P2a.1's frictionless guide (decided 2026-10-02): projected dual
ascent on the contact forces of the whole group with each resting ball's static resistance included, from which the
released balls, the coupled contacts and seed directions are read. A coupled contact that is not slipping is proposed
stuck, one that is slipping (or frictionless) slipping. Hold first means every candidate with every resting ball held
comes before any that releases one: the proposal with its resting balls held, then the same enumeration as the search
with the resting balls kept held. Then the proposal, then the search: every item (a ball with more than one mode;
every contact) lazily, fewest departures from the proposal first and then in lexicographic order of the modes'
ranks, skipping a contact between bodies held in that candidate (settled() fixes it). Lift-off is derived, not
enumerated: a solved candidate with low loads (`lowLoad`) is followed at once by the same candidate with those balls
airborne. The search stops at `MODE_SEARCH_LIMIT` candidates or when the budget is spent.

**Files:**
- Modify: `src/engine/modeSolve.ts` (append)
- Test: `tests/engine/modeSolve.test.ts` (append)

**Interfaces:**
- Consumes: Task 5.
- Produces:
  - `MODE_SEARCH_LIMIT = 1024`.
  - `interface Proposal { candidate: Candidate; seed: (it: DirectionItem) => Vec3 }`; `propose(model): Proposal`.
  - `type GroupKind = "exact" | "approximate-slip" | "approximate-hold" | "budget-hold"`.
  - `interface GroupSolution { kind; outcome: CandidateOutcome | null; tried: number; excess: number;
    slipBalls: readonly number[] }`.
  - `solveGroup(model, work: Work, budget: number, hooks?: SolveHooks): GroupSolution` (`budget` in work units, an
    absolute ceiling for `work.units`).
  - `holdExcess(model, work): number` (0 when holding every resting ball is consistent).

- [ ] **Step 1: Write the failing tests**

Append to `tests/engine/modeSolve.test.ts` (and add `holdExcess`, `propose`, `solveGroup` to the import from
`modeSolve`, and `directionItems` to the import from `contactModel`):

```ts
describe("propose", () => {
    it("proposes P2a.1's frictionless answer: the driver slides, the ball ahead is released along the push", () => {
        const model = topspin();
        const { candidate, seed } = propose(model);
        expect(candidate).toEqual({ balls: ["turf-sliding", "released"], contacts: ["slip"] });
        const item = directionItems(model, candidate)[0];
        expect(item?.kind).toBe("release");
        const s = seed(item as NonNullable<typeof item>);
        expect(s.x).toBeGreaterThan(0);
        expect(s.y).toBe(0);
    });
});

describe("solveGroup", () => {
    it("tries every candidate that holds the resting ball first, then the proposal (topspin push)", () => {
        // Hold first: red held with the contact slipping, then open; both fail. Then the proposal releases red.
        const g = solveGroup(topspin(), work(), Infinity);
        expect(g.kind).toBe("exact");
        expect(g.tried).toBe(3);
        expect(g.outcome?.cand.balls).toEqual(["turf-sliding", "released"]);
        expect(g.outcome?.ev?.accel[1]?.x).toBeCloseTo(0.89895492703632, 12);
    });

    it("holds a ball the push cannot move, with the first candidate", () => {
        const weak: MotionParams = { radius: R, slidingDecel: 0.5, rollingDecel: 0.49, gravity: G };
        const model = buildModel(
            [body(vec3(0, 0, R), vec3(0, 60, 0), weak), body(vec3(2 * R, 0, R), ZERO, weak)],
            [],
            PAIR,
            GRAVITY,
        );
        const g = solveGroup(model, work(), Infinity);
        expect(g.kind).toBe("exact");
        expect(g.tried).toBe(1);
        expect(g.outcome?.cand.balls).toEqual(["turf-sliding", "held"]);
    });

    it("pushes a line forward together, both contacts slipping, by searching past the proposal", () => {
        // The resting balls roll from rest, so their contact slips vertically at 2X and cannot stick. With
        // c = (1 − μ − kμ)/(1 + μ·μs) and e = (1 + μ − kμ)/(1 − μ − kμ): X = [c·μs − k(1 + e)]·g/(7/5·(1 + e) + c).
        const g = solveGroup(chain(0.5, 0), work(), Infinity);
        expect(g.kind).toBe("exact");
        expect(g.tried).toBeGreaterThan(2);
        expect(g.outcome?.cand).toEqual({
            balls: ["turf-sliding", "released", "released"],
            contacts: ["slip", "slip"],
        });
        for (let i = 0; i < 3; i++) {
            expect(g.outcome?.ev?.accel[i]?.x).toBeCloseTo(0.34085645955159, 12);
        }
    });

    it("holds a line bent by 30° at once, and releases the middle ball of one bent by 60°", () => {
        const held = solveGroup(chain(1.5, Math.PI / 6), work(), Infinity);
        expect(held.kind).toBe("exact");
        expect(held.tried).toBe(1);
        expect(held.outcome?.cand.balls).toEqual(["turf-sliding", "held", "held"]);
        const bent = solveGroup(chain(1.5, Math.PI / 3), work(), Infinity);
        expect(bent.kind).toBe("exact");
        expect(bent.outcome?.cand.balls).toEqual(["turf-sliding", "released", "held"]);
        expect(bent.outcome?.ev?.accel[1]?.x).toBeCloseTo(0.095769964237268, 12);
    });

    it("lifts a ball off the turf when friction takes its load", () => {
        const contacts: RestingContact[] = [{ a: 0, b: 1, fixed: false, friction: 4 }];
        const model = buildModel(
            [body(vec3(0, 0, R), vec3(0, 60, 0)), body(vec3(2 * R, 0, R), vec3(0, -80, 0))],
            [],
            contacts,
            GRAVITY,
        );
        const g = solveGroup(model, work(), Infinity);
        expect(g.kind).toBe("exact");
        expect(g.outcome?.cand.balls).toEqual(["turf-sliding", "airborne"]);
        expect(g.outcome?.ev?.accel[1]?.z).toBeCloseTo(5.6504842256315, 12);
    });

    it("holds the group, solving nothing, once the budget is spent", () => {
        const w = work();
        const g = solveGroup(topspin(), w, 0);
        expect(g.kind).toBe("budget-hold");
        expect(g.tried).toBe(0);
        expect(w.units).toBe(0);
    });

    it("falls back to approximate-slip when every direction solve fails and a slip can stand in", () => {
        const g = solveGroup(lean(5), work(), Infinity, { failDirections: true });
        expect(g.kind).toBe("approximate-slip");
        expect(g.slipBalls).toEqual([0, 1]);
        expect(Number.isFinite(g.excess)).toBe(true);
        expect(g.outcome?.ev?.accel[0]?.x).toBeCloseTo(3.8786546380113, 12);
    });

    it("falls back to the nearest hold, reporting how far holding misses, when nothing is consistent", () => {
        // A release from rest has no approximate-slip; with every direction solve failing nothing is consistent.
        const g = solveGroup(topspin(), work(), Infinity, { failDirections: true });
        expect(g.kind).toBe("approximate-hold");
        expect(g.excess).toBeGreaterThan(0);
        expect(g.outcome).toBeNull();
    });

    it("is deterministic", () => {
        expect(solveGroup(chain(0.5, 0), work(), Infinity)).toStrictEqual(solveGroup(chain(0.5, 0), work(), Infinity));
    });

    it("measures how far holding misses: zero where it holds, positive where it cannot", () => {
        expect(holdExcess(chain(1.5, Math.PI / 6), work())).toBe(0);
        expect(holdExcess(topspin(), work())).toBeGreaterThan(0);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/modeSolve.test.ts`
Expected: FAIL (`propose` and `solveGroup` are not exported).

- [ ] **Step 3: Implement**

Extend `src/engine/modeSolve.ts`'s imports: add `excessAt` from `./convexSolve`; `ACCELERATION_EPSILON`,
`ROLLING_WEIGHT`, `ballOptions`, `candidateKey`, `contactOptions`, `isStatic`, `lowLoad`, `type ContactBody` and
`type RestingContact` from `./contactModel`; `add` from `./math/vec3`; and `import type { MotionPhase } from "./types";`.
Then append:

```ts
/**
 * Candidates the group search may solve before giving up (design §4 step 6). The worst measured over 20,000 random
 * four-ball clusters with obstacles was 183; the cap leaves room above that and bounds the search where it has none.
 */
export const MODE_SEARCH_LIMIT = 1024;

/** Iteration cap of the frictionless guide that proposes the first candidate. */
const GUIDE_ITERATIONS = 5_000;

/** The guide stops once no contact force changes by more than this (m/s²) in a step. */
const GUIDE_TOLERANCE = 1e-12;

/** The proposal: a candidate and seed directions for its unknown directions. */
export interface Proposal {
    readonly candidate: Candidate;
    readonly seed: (it: DirectionItem) => Vec3;
}

/**
 * P2a.1's frictionless solve of the whole group, as the proposal (design §4 step 3, the μ = 0 limit). With each resting
 * ball's static resistance included, the accelerations minimise Σᵢ ½·wᵢ·|xᵢ − fᵢ|² + Σᵢ cᵢ·|xᵢ| subject to no contact
 * converging; its dual over contact forces N ≥ 0 is smooth: for given N each ball's acceleration is the soft threshold
 * xᵢ = shrink(fᵢ + gᵢ/wᵢ, cᵢ/wᵢ) of its free acceleration plus the contact push gᵢ = Σₖ Nₖ·Jₖᵢ, and the dual gradient is
 * −J·x. Projected gradient ascent with step 1/L (L ≥ largest row sum of J·W⁻¹·Jᵀ, at most 2·contacts) converges. A
 * resting ball whose soft threshold is not zero is released; a contact with force touching a moving ball is coupled.
 */
export function propose(model: Model): Proposal {
    const { bodies, contacts, geometry, classes, frozen } = model;
    const responses = bodies.map((b, i) => {
        const p = b.params;
        switch (classes[i] as MotionPhase) {
            case "sliding":
                return { force: scale(frozen[i] as Vec3, 0 - p.slidingDecel), weight: 1, threshold: 0 };
            case "rolling":
                return { force: scale(frozen[i] as Vec3, 0 - p.rollingDecel), weight: ROLLING_WEIGHT, threshold: 0 };
            case "stationary":
                return { force: ZERO, weight: ROLLING_WEIGHT, threshold: ROLLING_WEIGHT * p.rollingDecel };
            case "airborne":
                return { force: model.gravity, weight: 1, threshold: 0 };
        }
    });
    // Contact k's row for ball i: +n on b, −n on a; on the turf only its in-plane part (the turf takes the rest).
    const row = (k: number, i: number): Vec3 => {
        const c = contacts[k] as RestingContact;
        const n = (geometry[k] as ContactGeometry).n;
        const r = !c.fixed && c.b === i ? n : c.a === i ? scale(n, -1) : ZERO;
        if (classes[i] === "airborne") {
            return r;
        }
        const up = (bodies[i] as ContactBody).turfNormal;
        return sub(r, scale(up, dot(r, up)));
    };
    const forces = contacts.map(() => 0);
    const step = 1 / Math.max(1, 2 * contacts.length);
    const accelerations = (): Vec3[] =>
        bodies.map((_, i) => {
            const r = responses[i] as NonNullable<(typeof responses)[number]>;
            let push = ZERO;
            contacts.forEach((_c, k) => {
                push = add(push, scale(row(k, i), forces[k] as number));
            });
            const v = add(r.force, scale(push, 1 / r.weight));
            const size = length(v);
            const limit = r.threshold / r.weight;
            return size > limit ? scale(v, (size - limit) / size) : ZERO;
        });
    for (let iteration = 0; iteration < GUIDE_ITERATIONS; iteration++) {
        const x = accelerations();
        let change = 0;
        contacts.forEach((c, k) => {
            let opening = dot(row(k, c.a), x[c.a] as Vec3);
            if (!c.fixed) {
                opening += dot(row(k, c.b), x[c.b] as Vec3);
            }
            const next = Math.max(0, (forces[k] as number) - step * opening);
            change = Math.max(change, Math.abs(next - (forces[k] as number)));
            forces[k] = next;
        });
        if (change <= GUIDE_TOLERANCE) {
            break;
        }
    }
    const x = accelerations();
    // Dual ascent approaches a ball held exactly at its limit from the moving side, so tiny ones count as held.
    const released = classes.map((c, i) => c === "stationary" && length(x[i] as Vec3) > ACCELERATION_EPSILON);
    const moving = (i: number): boolean => classes[i] !== "stationary" || released[i] === true;
    const balls = classes.map((c, i): BallMode => {
        switch (c) {
            case "stationary":
                return released[i] ? "released" : "held";
            case "rolling":
                return "turf-rolling";
            case "sliding":
                return "turf-sliding";
            case "airborne":
                return "airborne";
        }
    });
    const modes = contacts.map((c, k): ContactMode => {
        if (!((forces[k] as number) > 0 && (moving(c.a) || (!c.fixed && moving(c.b))))) {
            return "open";
        }
        return c.friction === 0 || (geometry[k] as ContactGeometry).slipping ? "slip" : "stick";
    });
    const candidate = settled(model, { balls, contacts: modes });
    const seed = (it: DirectionItem): Vec3 => {
        let guess: Vec3;
        if (it.kind === "contact-onset") {
            const c = contacts[it.index] as RestingContact;
            const n = (geometry[it.index] as ContactGeometry).n;
            const g = sub(x[c.a] as Vec3, c.fixed ? ZERO : (x[c.b] as Vec3));
            guess = sub(g, scale(n, dot(g, n)));
        } else {
            guess = x[it.index] as Vec3;
        }
        return length(guess) > 0 ? guess : it.e1;
    };
    return { candidate, seed };
}

export type GroupKind = "exact" | "approximate-slip" | "approximate-hold" | "budget-hold";

/** The decision for one group. */
export interface GroupSolution {
    readonly kind: GroupKind;
    /** The accepted candidate's solve (exact, approximate-slip); null when the group is to be held. */
    readonly outcome: CandidateOutcome | null;
    /** Candidates solved. */
    readonly tried: number;
    /**
     * approximate-slip: the failed direction solve's residual (m/s²); approximate-hold: how far holding every resting
     * ball misses its limits (the worst relaxed-cone excess at the best forces the hold-first solve found, m/s²;
     * Infinity when that configuration could not be solved at all); otherwise 0.
     */
    readonly excess: number;
    /** approximate-slip: the balls whose slip fell back (both balls of a contact, the ball of a turf slip). */
    readonly slipBalls: readonly number[];
}

interface SearchItem {
    readonly kind: "ball" | "contact";
    readonly index: number;
}

/**
 * Every candidate that departs from `proposal` in exactly `departures` items, in lexicographic order of the items'
 * mode ranks. Items are balls with more than one mode (in index order), then every contact. A contact between bodies
 * held in the candidate keeps the proposal's rank: settled() fixes its mode, so any other rank would only repeat a
 * candidate with fewer departures. With `holdResting`, every ball at rest keeps the proposal's mode (the hold-first
 * phase, whose proposal holds them all).
 */
function* departing(
    model: Model,
    proposal: Candidate,
    departures: number,
    holdResting: boolean,
): Generator<Candidate> {
    const items: SearchItem[] = [
        ...model.classes.flatMap((c, i) => (ballOptions(c).length > 1 ? [{ kind: "ball" as const, index: i }] : [])),
        ...model.contacts.map((_, k) => ({ kind: "contact" as const, index: k })),
    ];
    const options = items.map((it): readonly string[] =>
        it.kind === "ball" ? ballOptions(model.classes[it.index] as MotionPhase) : contactOptions(model, it.index),
    );
    const proposed = items.map((it, j) =>
        (options[j] as readonly string[]).indexOf(
            it.kind === "ball" ? (proposal.balls[it.index] as string) : (proposal.contacts[it.index] as string),
        ),
    );
    const ranks: number[] = [];
    const modeAt = (j: number): string => (options[j] as readonly string[])[ranks[j] as number] as string;
    // The ball modes chosen so far (ball items come first, so all of them are chosen once a contact is reached).
    const ballsNow = (): BallMode[] => {
        const balls = [...proposal.balls];
        items.forEach((it, j) => {
            if (it.kind === "ball" && j < ranks.length) {
                balls[it.index] = modeAt(j) as BallMode;
            }
        });
        return balls;
    };
    const build = (): Candidate => {
        const contacts = [...proposal.contacts];
        items.forEach((it, j) => {
            if (it.kind === "contact") {
                contacts[it.index] = modeAt(j) as ContactMode;
            }
        });
        return { balls: ballsNow(), contacts };
    };
    function* walk(j: number, left: number): Generator<Candidate> {
        if (j === items.length) {
            if (left === 0) {
                yield build();
            }
            return;
        }
        if (items.length - j < left) {
            return;
        }
        const item = items[j] as SearchItem;
        const fixed =
            (item.kind === "contact" && isStatic(model, ballsNow(), item.index)) ||
            (holdResting && item.kind === "ball" && model.classes[item.index] === "stationary");
        const count = (options[j] as readonly string[]).length;
        for (let r = 0; r < count; r++) {
            const departs = r === proposed[j] ? 0 : 1;
            if (departs > left || (fixed && departs === 1)) {
                continue;
            }
            ranks.push(r);
            yield* walk(j + 1, left - departs);
            ranks.pop();
        }
    }
    yield* walk(0, departures);
}

/**
 * Solves one group (design §4 steps 2–7): every candidate with every resting ball held first, then the proposal, then
 * every other candidate fewest departures from the proposal first; the first consistent candidate wins. A solved
 * candidate whose turf balls' loads drop to zero or below is followed at once by the same candidate with those balls
 * lifted (airborne). The budget is checked before each candidate: once work.units reaches it the group is to be held
 * (budget-hold). With nothing consistent, or the
 * search capped at MODE_SEARCH_LIMIT, the first candidate whose only failure was its direction solve is tried with
 * approximate-slip directions; failing that, the group is to be held (approximate-hold). The nearest hold itself is
 * the caller's (push.ts).
 */
export function solveGroup(model: Model, work: Work, budget: number, hooks: SolveHooks = {}): GroupSolution {
    const proposal = propose(model);
    const held = settled(model, heldCandidate(model, proposal.candidate));
    const heldKey = candidateKey(held);
    const seen = new Set<string>();
    const state: { tried: number; firstFailure: CandidateOutcome | null; held: CandidateOutcome | null } = {
        tried: 0,
        firstFailure: null,
        held: null,
    };
    const hold = (kind: GroupKind, excess: number): GroupSolution => ({
        kind,
        outcome: null,
        tried: state.tried,
        excess,
        slipBalls: [],
    });
    /** Solves a candidate unless it was solved already; "budget" once the budget is spent. */
    const attempt = (raw: Candidate): CandidateOutcome | "budget" | null => {
        const cand = settled(model, raw);
        const key = candidateKey(cand);
        if (seen.has(key)) {
            return null;
        }
        if (work.units >= budget) {
            return "budget";
        }
        seen.add(key);
        state.tried++;
        const out = solveCandidate(model, cand, proposal.seed, work, hooks);
        if (key === heldKey) {
            state.held = out;
        }
        if (!out.ok && out.failure === "direction" && state.firstFailure === null) {
            state.firstFailure = out;
        }
        // Lift-off (spec §5): balls whose load would be zero or below leave the turf, so the same candidate is solved
        // again with them airborne.
        const low = !out.ok && out.ev ? lowLoad(model, out.cand, out.ev) : [];
        if (low.length > 0) {
            const lifted = attempt({
                balls: out.cand.balls.map((m, i) => (low.includes(i) ? "airborne" : m)),
                contacts: out.cand.contacts,
            });
            if (lifted !== null) {
                return lifted;
            }
        }
        return out;
    };
    const exact = (out: CandidateOutcome): GroupSolution => ({
        kind: "exact",
        outcome: out,
        tried: state.tried,
        excess: 0,
        slipBalls: [],
    });
    const itemCount = model.classes.filter((c) => ballOptions(c).length > 1).length + model.contacts.length;
    /** Tries `base`, then every candidate departing from it, in order; a decision, or null when none is consistent. */
    const phase = (base: Candidate, holdResting: boolean): GroupSolution | null => {
        const first = attempt(base);
        if (first === "budget") {
            return hold("budget-hold", 0);
        }
        if (first?.ok) {
            return exact(first);
        }
        for (let departures = 1; departures <= itemCount; departures++) {
            for (const cand of departing(model, base, departures, holdResting)) {
                if (state.tried >= MODE_SEARCH_LIMIT) {
                    return null;
                }
                const out = attempt(cand);
                if (out === "budget") {
                    return hold("budget-hold", 0);
                }
                if (out?.ok) {
                    return exact(out);
                }
            }
        }
        return null;
    };

    // Hold first: every candidate with every resting ball held, before any that releases one. Its first candidate,
    // the proposal with its resting balls held, is what the approximate-hold excess is measured on (attempt() keeps
    // its outcome in state.held).
    const holding = phase(held, true);
    if (holding) {
        return holding;
    }
    const searched = phase(proposal.candidate, false);
    if (searched) {
        return searched;
    }

    const failure = state.firstFailure;
    if (failure) {
        const fallback = fallbackSlip(model, failure.cand, work);
        if (fallback?.ok) {
            const slipBalls = new Set<number>();
            for (const it of fallback.items) {
                if (it.kind === "contact-onset") {
                    const c = model.contacts[it.index] as RestingContact;
                    slipBalls.add(c.a);
                    if (!c.fixed) {
                        slipBalls.add(c.b);
                    }
                } else {
                    slipBalls.add(it.index);
                }
            }
            return {
                kind: "approximate-slip",
                outcome: fallback,
                tried: state.tried,
                excess: failure.residual,
                slipBalls: [...slipBalls].sort((a, b) => a - b),
            };
        }
    }
    return hold("approximate-hold", state.held ? excessOf(model, state.held) : Infinity);
}

/** The proposal with every resting ball held: the hold-first candidate (design §4 step 2). */
function heldCandidate(model: Model, proposal: Candidate): Candidate {
    return {
        balls: proposal.balls.map((m, i) => (model.classes[i] === "stationary" ? "held" : m)),
        contacts: proposal.contacts,
    };
}

/** How far a solved candidate misses its convex conditions; Infinity when it could not be solved at all. */
function excessOf(model: Model, out: CandidateOutcome): number {
    return out.sys && out.x ? Math.max(0, excessAt(cones(model, out.cand, out.sys), out.x)) : Infinity;
}

/**
 * How far holding every resting ball of the group misses its limits (see GroupSolution.excess): 0 when the hold-first
 * candidate is consistent. The nearest-hold fallback reports it.
 */
export function holdExcess(model: Model, work: Work): number {
    const proposal = propose(model);
    const out = solveCandidate(model, settled(model, heldCandidate(model, proposal.candidate)), proposal.seed, work);
    return out.ok ? 0 : excessOf(model, out);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/modeSolve.test.ts` then `npm run lint` and `npm run check`
Expected: all pass. `tried` counts are part of the contract (hold first, then the proposal); if the line-push test
finds a different candidate first, report which before changing the order.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/engine/modeSolve.ts tests/engine/modeSolve.test.ts
git add src/engine/modeSolve.ts tests/engine/modeSolve.test.ts
git commit -m "Search friction candidates hold-first from a frictionless proposal"
```

---

### Task 7: Switch the push façade to the friction solver

`push.ts` keeps its role and import paths (design §3): glue, groups, the kept-contact loop, the nearest hold, pushed
motion and durations, and the tolerances (re-exported from `contactModel.ts`). Each group is solved by
`solveGroup`; P2a.1's `guide`, `heldExcess`, `searchHold`, `holdCertificate`, `HoldLink`, `HoldRay`, `tryActiveSet`,
`releaseDirections` and `agrees` are deleted (the guide lives on as `propose`). `HOLD_SLACK` becomes 1e-8.

The simulator keeps contact friction at 0 in this task (its pushes stay frictionless until Task 8 adds slip ends), so
every simulation test must pass unchanged: the new solver at μ = 0 must reproduce P2a.1. One physical change is
visible even at μ = 0, and only in `push.test.ts`: a ball on the turf pushed by an inclined normal (a ball in flight
leaning on it) now feels the load and the ê weighting of spec §5, so P2a.1's lean closed form is re-derived.

**Files:**
- Replace: `src/engine/push.ts`
- Modify: `src/engine/simulate.ts` (`restingComponent`, `solveComponent`, `settle`)
- Create: `tests/engine/support/clusters.ts`
- Replace: `tests/engine/push.test.ts`

**Interfaces:**
- Consumes: Tasks 4–6.
- Produces (from `push.ts`):
  - Re-exports `ACCELERATION_EPSILON`, `FOLLOW_EPSILON`, `HOLD_SLACK` and the types `ContactBody`, `ContactMode`,
    `RestingContact`; keeps `RESTING_SPEED`, `DIRECTION_TOLERANCE`, `SEPARATION_TOLERANCE`, `RestingMember`,
    `freeAcceleration`, `pushedState`, `pushedTrajectory`, `pushDuration`.
  - `interface RestingOptions { gravity?: Vec3; budget?: number; hooks?: SolveHooks }`.
  - `interface RestingSolution { members; modes: readonly ContactMode[]; slips: readonly (Vec3 | null)[];
    approximate: readonly boolean[]; holdExcess: number; approximateSlip: readonly boolean[]; slipExcess: number;
    budgetHold: readonly boolean[]; work: number; searched: number }`.
  - `solveRestingContacts(bodies, axes, contacts, options?)`, `solveNearestHold(bodies, axes, contacts, options?)`.
  - `contactSlipDuration(a: BallState, pushA: PushMotion, b: BallState | null, pushB: PushMotion | null, normal: Vec3,
    slip: Vec3, radius: number): number`.
- Produces (tests): `tests/engine/support/clusters.ts` exports `interface Cluster { bodies; axes; contacts; label }`
  and `randomCluster(random: () => number): Cluster | null`.

- [ ] **Step 1: Write the cluster generator**

Create `tests/engine/support/clusters.ts` (ported from the prototype's four-ball cap measurement):

```ts
/**
 * Seeded random clusters of two to four touching balls with court-realistic obstacles: none, the peg, or one hoop
 * (whose uprights no single ball can touch both of). Velocities are glued as the engine glues them, so no coupled
 * contact approaches. Ported from the P2a.2 prototype's measurement of the mode-search cap.
 */
import { ZERO, add, cross, normalize, scale, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import { rollingSpin } from "../../../src/engine/motion";
import type { ContactBody, RestingContact } from "../../../src/engine/push";
import type { MotionParams } from "../../../src/engine/types";

/** One random cluster, ready for solveRestingContacts. */
export interface Cluster {
    readonly bodies: ContactBody[];
    readonly axes: Vec3[];
    readonly contacts: RestingContact[];
    readonly label: string;
}

const R = 0.046;
const G = 9.80665;
const UPRIGHT = 0.008;
const PEG = 0.02;
const UP = vec3(0, 0, 1);

function distance(p: Vec3, q: Vec3): number {
    return Math.hypot(p.x - q.x, p.y - q.y);
}

/** Points at distance r1 from p and r2 from q in the plane, or none. */
function meet(p: Vec3, q: Vec3, r1: number, r2: number): Vec3[] {
    const d = distance(p, q);
    if (d > r1 + r2 || d < Math.abs(r1 - r2) || d === 0) {
        return [];
    }
    const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
    const ex = (q.x - p.x) / d;
    const ey = (q.y - p.y) / d;
    const mx = p.x + a * ex;
    const my = p.y + a * ey;
    return [vec3(mx - h * ey, my + h * ex, R), vec3(mx + h * ey, my - h * ex, R)];
}

/** Removes the approaching part of v against each unit normal (Gauss–Seidel), as the engine's glue does. */
function glue(v: Vec3, normals: readonly Vec3[]): Vec3 {
    let g = v;
    for (let iteration = 0; iteration < 50; iteration++) {
        for (const n of normals) {
            const s = g.x * n.x + g.y * n.y;
            if (s > 0) {
                g = vec3(g.x - s * n.x, g.y - s * n.y, 0);
            }
        }
    }
    return g;
}

/** A random cluster, or null when the draw overlaps (draw again). */
export function randomCluster(random: () => number): Cluster | null {
    const uni = (a: number, b: number): number => a + (b - a) * random();
    const n = random() < 0.15 ? 2 : random() < 0.4 ? 3 : 4;
    const pos: Vec3[] = [vec3(0, 0, R)];
    for (let i = 1; i < n; i++) {
        let q: Vec3 | null = null;
        if (i >= 2 && random() < 0.3) {
            // Touch two existing balls (a closed loop: a triangle or a rhombus).
            const a = Math.floor(random() * i);
            const b = Math.floor(random() * i);
            const points = a === b ? [] : meet(pos[a] as Vec3, pos[b] as Vec3, 2 * R, 2 * R);
            q = points.length > 0 ? (points[Math.floor(random() * points.length)] as Vec3) : null;
        }
        if (!q) {
            const parent = pos[Math.floor(random() * i)] as Vec3;
            const angle = uni(0, 2 * Math.PI);
            q = vec3(parent.x + 2 * R * Math.cos(angle), parent.y + 2 * R * Math.sin(angle), R);
        }
        const placed = q;
        if (pos.some((o) => distance(o, placed) < 2 * R - 1e-12)) {
            return null;
        }
        pos.push(placed);
    }
    const axes: Vec3[] = [];
    const radii: number[] = [];
    // None, the peg, or one hoop (its uprights 0.0953 m apart inside). The obstacle touches one ball, or two at once.
    const obstacle = random();
    if (obstacle >= 0.4) {
        const r = obstacle < 0.6 ? PEG : UPRIGHT;
        let c: Vec3 | null = null;
        if (n >= 2 && random() < 0.35) {
            const a = Math.floor(random() * n);
            const b = Math.floor(random() * n);
            const points = a === b ? [] : meet(pos[a] as Vec3, pos[b] as Vec3, R + r, R + r);
            c = points.length > 0 ? (points[Math.floor(random() * points.length)] as Vec3) : null;
        }
        if (!c) {
            const owner = pos[Math.floor(random() * n)] as Vec3;
            const angle = uni(0, 2 * Math.PI);
            c = vec3(owner.x + (R + r) * Math.cos(angle), owner.y + (R + r) * Math.sin(angle), 0);
        }
        const centres = [vec3(c.x, c.y, 0)];
        if (r === UPRIGHT) {
            const psi = uni(0, 2 * Math.PI);
            const span = 0.0953 + 2 * UPRIGHT;
            centres.push(vec3(c.x + span * Math.cos(psi), c.y + span * Math.sin(psi), 0));
        }
        for (const centre of centres) {
            if (pos.some((o) => distance(o, centre) < R + r - 1e-12)) {
                return null;
            }
            axes.push(centre);
            radii.push(r);
        }
    }
    const p: MotionParams = { radius: R, slidingDecel: 0.3 * G, rollingDecel: uni(0.03, 0.15) * G, gravity: G };
    const bodies: ContactBody[] = pos.map((position) => ({
        state: { position, velocity: ZERO, angularVelocity: ZERO },
        params: p,
        turfNormal: UP,
        pivotCapacity: Infinity,
    }));
    const towards = (from: Vec3, to: Vec3): Vec3 => normalize(vec3(to.x - from.x, to.y - from.y, 0));
    const set = (i: number, velocity: Vec3, angularVelocity: Vec3): void => {
        const b = bodies[i] as ContactBody;
        bodies[i] = { ...b, state: { ...b.state, velocity, angularVelocity } };
    };
    const kind = random();
    let label: string;
    if (kind < 0.6) {
        // A driver at rest with spin (sliding in place), sometimes a second one.
        const drivers = random() < 0.25 && n >= 2 ? [0, 1 + Math.floor(random() * (n - 1))] : [0];
        for (const d of drivers) {
            const angle = uni(0, 2 * Math.PI);
            let w = scale(vec3(Math.cos(angle), Math.sin(angle), 0), uni(20, 80));
            if (random() < 0.5) {
                w = add(w, vec3(0, 0, uni(-10, 10)));
            }
            set(d, ZERO, w);
        }
        label = `rest-spin x${drivers.length}`;
    } else if (kind < 0.85) {
        // The whole cluster rolling together; the driver carries extra topspin (sliding).
        const angle = uni(0, 2 * Math.PI);
        const normals: Vec3[] = [];
        pos.forEach((q) =>
            axes.forEach((c, k) => {
                if (distance(q, c) < R + (radii[k] as number) + 1e-9) {
                    normals.push(towards(q, c));
                }
            }),
        );
        const v = glue(vec3(uni(0.05, 1) * Math.cos(angle), uni(0.05, 1) * Math.sin(angle), 0), normals);
        bodies.forEach((_, i) => {
            let w = rollingSpin(v, 0, R);
            if (i === 0) {
                const axis = Math.hypot(v.x, v.y) > 1e-6 ? cross(vec3(0, 0, 1), v) : vec3(-Math.sin(angle), Math.cos(angle), 0);
                w = add(w, scale(normalize(axis), uni(10, 60)));
            }
            set(i, v, w);
        });
        label = "rolling cluster";
    } else {
        // A driver rolling with a sideways component (rubbing) plus topspin into the cluster.
        const angle = uni(0, 2 * Math.PI);
        const normals: Vec3[] = [];
        pos.forEach((q, j) => {
            if (j > 0 && distance(pos[0] as Vec3, q) < 2 * R + 1e-9) {
                normals.push(towards(pos[0] as Vec3, q));
            }
        });
        axes.forEach((c, k) => {
            if (distance(pos[0] as Vec3, c) < R + (radii[k] as number) + 1e-9) {
                normals.push(towards(pos[0] as Vec3, c));
            }
        });
        const v = glue(vec3(0.3 * Math.cos(angle), 0.3 * Math.sin(angle), 0), normals);
        const spin = scale(vec3(Math.cos(angle + 1), Math.sin(angle + 1), 0), uni(20, 60));
        set(0, v, add(rollingSpin(v, 0, R), spin));
        label = "moving driver";
    }
    const contacts: RestingContact[] = [];
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            if (distance(pos[i] as Vec3, pos[j] as Vec3) < 2 * R + 1e-9) {
                contacts.push({ a: i, b: j, fixed: false, friction: 0.05 });
            }
        }
        axes.forEach((c, k) => {
            if (distance(pos[i] as Vec3, c) < R + (radii[k] as number) + 1e-9) {
                contacts.push({ a: i, b: k, fixed: true, friction: 0.1 });
            }
        });
    }
    return { bodies, axes, contacts, label: `${n} balls, ${contacts.length} contacts, ${label}` };
}
```

- [ ] **Step 2: Write the failing tests**

Replace `tests/engine/push.test.ts` with the file below. It keeps P2a.1's closed forms as the frictionless limit
(contacts with `friction: 0`), re-derives the lean in flight, and adds the friction cases of design §6. Every new
number is a closed form derived for this plan and checked against the prototype.

```ts
import { describe, expect, it } from "vitest";
import { buildModel, type ContactGeometry, type Evaluated } from "../../src/engine/contactModel";
import { ZERO, dot, length, normalize, scale, sub, vec3, type Vec3 } from "../../src/engine/math/vec3";
import { MODE_SEARCH_LIMIT, solveGroup, type CandidateOutcome } from "../../src/engine/modeSolve";
import { classify, contactSlip, rollingSpin } from "../../src/engine/motion";
import {
    DIRECTION_TOLERANCE,
    HOLD_SLACK,
    RESTING_SPEED,
    contactSlipDuration,
    freeAcceleration,
    pushDuration,
    pushedState,
    pushedTrajectory,
    solveNearestHold,
    solveRestingContacts,
    type ContactBody,
    type RestingContact,
    type RestingSolution,
} from "../../src/engine/push";
import type { BallState, MotionParams, PushMotion } from "../../src/engine/types";
import { randomCluster, type Cluster } from "./support/clusters";
import { kineticEnergy } from "./support/energy";
import { rng } from "./support/rng";

const R = 0.046;
const G = 9.80665;
const SLIDE = 3;
const ROLL = 0.5;
const P: MotionParams = { radius: R, slidingDecel: SLIDE, rollingDecel: ROLL, gravity: G };
const BALL = { radius: R, mass: 0.454 };
const UP = vec3(0, 0, 1);
const GRAVITY = vec3(0, 0, -G);
const MU = 0.05;
const C30 = Math.sqrt(3) / 2;
const SLOW = Boolean(process.env.SLOW_TESTS);

function body(state: BallState, params: MotionParams = P): ContactBody {
    return { state, params, turfNormal: UP, pivotCapacity: Infinity };
}

function ball(x: number, y: number, velocity: Vec3 = ZERO, angularVelocity: Vec3 = ZERO, params = P): ContactBody {
    return body({ position: vec3(x, y, R), velocity, angularVelocity }, params);
}

function rolling(x: number, y: number, velocity: Vec3, spinZ = 0): ContactBody {
    return ball(x, y, velocity, rollingSpin(velocity, spinZ, R));
}

const pair = (friction: number): RestingContact[] => [{ a: 0, b: 1, fixed: false, friction }];
const line = (friction: number): RestingContact[] => [
    { a: 0, b: 1, fixed: false, friction },
    { a: 1, b: 2, fixed: false, friction },
];

/** No fallback of any kind. */
function exact(s: RestingSolution): boolean {
    return !s.approximate.some(Boolean) && !s.approximateSlip.some(Boolean) && !s.budgetHold.some(Boolean);
}

const coupled = (s: RestingSolution): boolean[] => s.modes.map((m) => m !== "open");

describe("the frictionless limit (μ = 0): P2a.1's closed forms", () => {
    it("pushes a resting ball with a ball driven by topspin", () => {
        // Blue has no velocity but topspin Ω, so its slip is −RΩ and friction drives it forward at SLIDE. Red resists
        // statically, then rolls (effective inertia 7m/5, rolling resistance ROLL). Common acceleration:
        // A = (SLIDE − (7/5)·ROLL) / (1 + 7/5) = (5·SLIDE − 7·ROLL) / 12.
        const omega = 60;
        const s = solveRestingContacts([ball(0, 0, ZERO, vec3(0, omega, 0)), ball(2 * R, 0)], [], pair(0));
        const A = (5 * SLIDE - 7 * ROLL) / 12;
        expect(coupled(s)).toEqual([true]);
        expect(s.slips).toEqual([null]);
        expect(exact(s)).toBe(true);
        const blue = s.members[0];
        const red = s.members[1];
        expect(blue?.phase).toBe("sliding");
        expect(red?.phase).toBe("rolling");
        expect(blue?.push?.acceleration.x).toBeCloseTo(A, 12);
        expect(red?.push?.acceleration.x).toBeCloseTo(A, 12);
        expect(blue?.push?.acceleration.y).toBeCloseTo(0, 15);
        // Blue's slip −RΩ decays at A + (5/2)·SLIDE; the push ends when it reaches zero.
        const end = pushDuration(blue?.state as BallState, "sliding", blue?.push as PushMotion, R);
        expect(end).toBeCloseTo((R * omega) / (A + 2.5 * SLIDE), 12);
        expect(pushDuration(red?.state as BallState, "rolling", red?.push as PushMotion, R)).toBe(Infinity);
        const atEnd = pushedState(blue?.state as BallState, blue?.push as PushMotion, end);
        expect(Math.abs(contactSlip(atEnd, R).x)).toBeLessThan(1e-12);
    });

    it("holds a resting ball that the push cannot move", () => {
        // Drive 0.5 m/s² is below the static resistance (7/5)·0.49 of the ball in front.
        const weak: MotionParams = { radius: R, slidingDecel: 0.5, rollingDecel: 0.49, gravity: G };
        const s = solveRestingContacts(
            [ball(0, 0, ZERO, vec3(0, 60, 0), weak), ball(2 * R, 0, ZERO, ZERO, weak)],
            [],
            pair(0),
        );
        expect(coupled(s)).toEqual([true]);
        expect(s.members[1]?.phase).toBe("stationary");
        expect(s.members[1]?.push?.acceleration).toEqual(ZERO);
        expect(s.members[0]?.push?.acceleration.x).toBeCloseTo(0, 15);
    });

    it("gives a pushed rolling ball 5/7 of the push (effective inertia 7m/5)", () => {
        const v = vec3(0.5, 0, 0);
        const s = solveRestingContacts([ball(0, 0, v, vec3(0, 40, 0)), rolling(2 * R, 0, v)], [], pair(0));
        const A = (SLIDE - (7 / 5) * ROLL) / (1 + 7 / 5);
        expect(coupled(s)).toEqual([true]);
        expect(s.members[0]?.push?.acceleration.x).toBeCloseTo(A, 12);
        expect(s.members[1]?.push?.acceleration.x).toBeCloseTo(A, 12);
    });

    it("releases balls whose accelerations separate them", () => {
        const v = vec3(0.5, 0, 0);
        const s = solveRestingContacts([ball(0, 0, v), rolling(2 * R, 0, v)], [], pair(0));
        expect(coupled(s)).toEqual([false]);
        expect(s.members).toEqual([null, null]);
    });

    it("makes the normal speeds equal on a slow approach, keeps rolling balls rolling and loses energy", () => {
        const a = rolling(0, 0, vec3(0.5 + RESTING_SPEED / 2, 0.1, 0));
        const b = rolling(2 * R, 0, vec3(0.5, -0.2, 0));
        const { members } = solveRestingContacts([a, b], [], pair(0));
        const sa = members[0]?.state as BallState;
        const sb = members[1]?.state as BallState;
        expect(sa.velocity.x).toBeCloseTo(sb.velocity.x, 15);
        expect(sa.velocity.y).toBe(0.1);
        expect(sb.velocity.y).toBe(-0.2);
        expect(classify(sa, R)).toBe("rolling");
        expect(classify(sb, R)).toBe("rolling");
        const before = kineticEnergy(a.state, BALL) + kineticEnergy(b.state, BALL);
        expect(kineticEnergy(sa, BALL) + kineticEnergy(sb, BALL)).toBeLessThanOrEqual(before);
    });

    it("holds a ball driven against an upright", () => {
        const s = solveRestingContacts(
            [ball(0, 0, ZERO, vec3(0, 60, 0))],
            [vec3(R + 0.008, 0, 0)],
            [{ a: 0, b: 0, fixed: true, friction: 0 }],
        );
        expect(coupled(s)).toEqual([true]);
        expect(s.members[0]?.push?.acceleration.x).toBeCloseTo(0, 15);
        const end = pushDuration(s.members[0]?.state as BallState, "sliding", s.members[0]?.push as PushMotion, R);
        expect(end).toBeCloseTo((R * 60) / (2.5 * SLIDE), 12);
    });

    it("solves a ball driven into two touching balls at an angle (wedge, three bodies)", () => {
        const bodies = [ball(0, 0, ZERO, vec3(0, 60, 0)), ball(2 * R * C30, -R), ball(2 * R * C30, R)];
        const contacts: RestingContact[] = [
            { a: 0, b: 1, fixed: false, friction: 0 },
            { a: 0, b: 2, fixed: false, friction: 0 },
            { a: 1, b: 2, fixed: false, friction: 0 },
        ];
        const s = solveRestingContacts(bodies, [], contacts);
        expect(exact(s)).toBe(true);
        expect(coupled(s)).toEqual([true, true, false]);
        const x = s.members.map((m) => m?.push?.acceleration ?? ZERO);
        const normal = (i: number, j: number): Vec3 =>
            normalize(sub(bodies[j]?.state.position as Vec3, bodies[i]?.state.position as Vec3));
        expect(dot(sub(x[0] as Vec3, x[1] as Vec3), normal(0, 1))).toBeCloseTo(0, 12);
        expect(dot(sub(x[0] as Vec3, x[2] as Vec3), normal(0, 2))).toBeCloseTo(0, 12);
        expect(dot(sub(x[1] as Vec3, x[2] as Vec3), normal(1, 2))).toBeLessThan(0);
        expect(x[1]?.x).toBeCloseTo(x[2]?.x ?? NaN, 12);
        expect(x[1]?.y).toBeCloseTo(-(x[2]?.y ?? NaN), 12);
        expect(x[0]?.x).toBeGreaterThan(0);
    });

    it("never pulls, never leaves a contact converging and balances the contact force (random pairs)", () => {
        const random = rng(17);
        let pushes = 0;
        for (let n = 0; n < 2000; n++) {
            const angle = random() * 2 * Math.PI;
            const e = vec3(Math.cos(angle), Math.sin(angle), 0);
            const v = vec3(random() * 2 - 1, random() * 2 - 1, 0);
            const closing = (random() * 2 - 1) * RESTING_SPEED;
            const spin = (): Vec3 => vec3(random() * 100 - 50, random() * 100 - 50, random() * 10 - 5);
            const a = random() < 0.5 ? ball(0, 0, v, spin()) : rolling(0, 0, v);
            const vb = sub(v, vec3(e.x * closing, e.y * closing, 0));
            const b =
                random() < 0.5 ? ball(2 * R * e.x, 2 * R * e.y, vb, spin()) : rolling(2 * R * e.x, 2 * R * e.y, vb);
            const s = solveRestingContacts([a, b], [], pair(0));
            const sa = s.members[0]?.state ?? a.state;
            const sb = s.members[1]?.state ?? b.state;
            const weight = (st: BallState): number => (classify(st, R) === "sliding" ? 1 : 7 / 5);
            const xa = s.members[0]?.push?.acceleration ?? freeAcceleration(sa, P);
            const xb = s.members[1]?.push?.acceleration ?? freeAcceleration(sb, P);
            const relative = dot(sub(xa, xb), e);
            if (coupled(s)[0]) {
                pushes++;
                const nb = weight(sb) * dot(sub(xb, freeAcceleration(sb, P)), e);
                const na = weight(sa) * dot(sub(xa, freeAcceleration(sa, P)), e);
                expect(nb).toBeGreaterThanOrEqual(-1e-12);
                expect(na + nb).toBeCloseTo(0, 12);
                expect(relative).toBeCloseTo(0, 12);
            } else {
                expect(relative).toBeLessThanOrEqual(1e-9);
            }
            expect(kineticEnergy(sa, BALL) + kineticEnergy(sb, BALL)).toBeLessThanOrEqual(
                kineticEnergy(a.state, BALL) + kineticEnergy(b.state, BALL) + 1e-12,
            );
        }
        expect(pushes).toBeGreaterThan(100);
    });
});

describe("resting contact in flight", () => {
    // Blue, in flight and at rest, leans on red (on the turf, at rest) at 30° from the vertical: n = (−s, 0, −c) from
    // blue to red, s = sin 30°, c = cos 30°. Down-slope, blue's contact point slips along ŝ = (c, 0, −s).
    const s = 0.5;
    const c = C30;
    function lean(rollingDecel: number): ContactBody[] {
        const p: MotionParams = { radius: R, slidingDecel: SLIDE, rollingDecel, gravity: G };
        return [
            body({ position: vec3(2 * R * s, 0, R + 2 * R * c), velocity: ZERO, angularVelocity: ZERO }, p),
            body({ position: vec3(0, 0, R), velocity: ZERO, angularVelocity: ZERO }, p),
        ];
    }

    it("slides a ball in flight down a ball the turf holds, slipping on it", () => {
        // Red held. Rolling down red would need friction (2/7)·tan 30°·N > μN, so the contact slips: N = g·c and
        // x_blue = g(s − μc)·(c, 0, −s), which at μ = 0 is P2a.1's (g·s·c, 0, −g·s²). Red takes the load and holds.
        for (const mu of [0, MU]) {
            const sol = solveRestingContacts(lean(5), [], pair(mu));
            expect(exact(sol)).toBe(true);
            expect(coupled(sol)).toEqual([true]);
            expect(sol.members[0]?.phase).toBe("airborne");
            const x = sol.members[0]?.push?.acceleration as Vec3;
            expect(x.x).toBeCloseTo(G * (s - mu * c) * c, 12);
            expect(x.y).toBeCloseTo(0, 15);
            expect(x.z).toBeCloseTo(-G * (s - mu * c) * s, 12);
            expect(sol.members[1]?.phase).toBe("stationary");
            expect(sol.members[1]?.push?.acceleration).toEqual(ZERO);
        }
        expect(solveRestingContacts(lean(5), [], pair(MU)).members[0]?.push?.angularAcceleration.y).toBeCloseTo(
            23.078282679409,
            9,
        );
    });

    it("pushes the ball on the turf away when it cannot hold, its load and contact offset included", () => {
        // Red rolls along −x. Its load is g + N(c + μs) and the force acts at ê = (s, 0, c), so (spec §5)
        // 7/5·a_r = N(μ(1 + c) − s) + k(g + N(c + μs)) with k = 7/5·rollingDecel/g, and blue keeps the closing rate:
        // N = g·c + s·a_r. Hence a_r = [g·c(μ(1+c) − s) + k·g(1 + c(c + μs))]/[7/5 + s(s − μ(1+c)) − k·s(c + μs)] and
        // x_blue = (N(s − μc), 0, −g + N(c + μs)). Even at μ = 0 this differs from P2a.1, which ignored both.
        const roll = 0.5;
        const k = (1.4 * roll) / G;
        for (const mu of [0, MU]) {
            const ar =
                (G * c * (mu * (1 + c) - s) + k * G * (1 + c * (c + mu * s))) /
                (1.4 + s * (s - mu * (1 + c)) - k * s * (c + mu * s));
            const N = G * c + s * ar;
            const sol = solveRestingContacts(lean(roll), [], pair(mu));
            expect(exact(sol)).toBe(true);
            expect(sol.members[1]?.phase).toBe("rolling");
            expect(sol.members[1]?.push?.acceleration.x).toBeCloseTo(ar, 12);
            expect(sol.members[1]?.push?.acceleration.z).toBe(0);
            expect(sol.members[1]?.push?.direction.x).toBeCloseTo(-1, 12);
            const x = sol.members[0]?.push?.acceleration as Vec3;
            expect(x.x).toBeCloseTo(N * (s - mu * c), 12);
            expect(x.z).toBeCloseTo(-G + N * (c + mu * s), 12);
        }
        expect(solveRestingContacts(lean(roll), [], pair(MU)).members[1]?.push?.acceleration.x).toBeCloseTo(
            -1.4087116241113,
            12,
        );
    });
});

describe("resting chains", () => {
    // Ball 0 has topspin (drive +SLIDE along x) and touches ball 1, which touches ball 2; 1 and 2 are at rest.
    function chain(rollingDecel: number, bend = 0): ContactBody[] {
        const p: MotionParams = { radius: R, slidingDecel: SLIDE, rollingDecel, gravity: G };
        return [
            ball(0, 0, ZERO, vec3(0, 60, 0), p),
            ball(2 * R, 0, ZERO, ZERO, p),
            ball(2 * R + 2 * R * Math.cos(bend), 2 * R * Math.sin(bend), ZERO, ZERO, p),
        ];
    }

    describe("frictionless (μ = 0)", () => {
        it("holds a line of two resting balls that the push could move one at a time but not together", () => {
            // Drive 3 lies between one ball's resistance (7/5)·1.5 = 2.1 and the pair's 4.2.
            for (const bend of [0, 1e-3]) {
                const s = solveRestingContacts(chain(1.5, bend), [], line(0));
                expect(exact(s)).toBe(true);
                for (const m of s.members) {
                    expect(m?.phase ?? "stationary").not.toBe("rolling");
                    const x = m?.push?.acceleration ?? ZERO;
                    expect(Math.abs(x.x) + Math.abs(x.y)).toBeLessThan(1e-12);
                }
            }
        });

        it("pushes the line forward together when the drive beats both resistances", () => {
            const s = solveRestingContacts(chain(ROLL), [], line(0));
            const expected = (SLIDE - 2 * (7 / 5) * ROLL) / (1 + 2 * (7 / 5));
            expect(coupled(s)).toEqual([true, true]);
            for (const m of s.members) {
                expect(m?.push?.acceleration.x).toBeCloseTo(expected, 12);
                expect(m?.push?.acceleration.y).toBeCloseTo(0, 12);
            }
            expect(s.members[1]?.phase).toBe("rolling");
            expect(s.members[2]?.push?.direction.x).toBeCloseTo(1, 12);
        });

        it("holds a line bent by 30° and releases the middle ball of one bent by 60°", () => {
            const held = solveRestingContacts(chain(1.5, Math.PI / 6), [], line(0));
            expect(exact(held)).toBe(true);
            expect(held.members[1]?.phase).toBe("stationary");
            // Ball 1 slides along ball 2 perpendicular to n12: a = (SLIDE·cos30° − (7/5)·ROLL₁)/((7/5)/cos30° + cos30°).
            const roll = 1.5;
            const s = solveRestingContacts(chain(roll, Math.PI / 3), [], line(0));
            expect(exact(s)).toBe(true);
            const a = (SLIDE * C30 - (7 / 5) * roll) / (7 / 5 / C30 + C30);
            expect(s.members[0]?.push?.acceleration.x).toBeCloseTo(a, 12);
            expect(s.members[1]?.phase).toBe("rolling");
            expect(s.members[1]?.push?.acceleration.y).toBeCloseTo(-a / Math.sqrt(3), 12);
            expect(s.members[2]?.phase).toBe("stationary");
        });

        it(
            "solves the line exactly across the limit of holding, deciding as the closed form does (44.3°–44.7°)",
            { timeout: 60_000 },
            () => {
                // With ball 2 at its limit λ = 2.1, ball 1's excess is |(3 − 2.1·cosθ, −2.1·sinθ)| − 2.1: zero at
                // cosθ = 9/12.6 (θ ≈ 44.4153°).
                for (let step = 0; step <= 400; step++) {
                    const theta = ((44.3 + step * 0.001) * Math.PI) / 180;
                    const s = solveRestingContacts(chain(1.5, theta), [], line(0));
                    expect(exact(s), `θ step ${step}`).toBe(true);
                    const excess = Math.hypot(3 - 2.1 * Math.cos(theta), 2.1 * Math.sin(theta)) - 2.1;
                    if (Math.abs(excess) > 1e-6) {
                        expect(s.members[1]?.phase === "stationary", `θ step ${step}`).toBe(excess < 0);
                    }
                }
            },
        );

        it("releases balls from rest only along their own frozen direction, so resistance never does work", () => {
            const random = rng(29);
            let released = 0;
            for (let n = 0; n < 1000; n++) {
                const drive = random() * 2 * Math.PI;
                const toB = drive + (random() - 0.5) * 2;
                const toC = toB + (random() - 0.5) * 2;
                const p: MotionParams = { radius: R, slidingDecel: SLIDE, rollingDecel: 0.2 + random() * 2.3, gravity: G };
                const b = vec3(2 * R * Math.cos(toB), 2 * R * Math.sin(toB), R);
                const cc = vec3(b.x + 2 * R * Math.cos(toC), b.y + 2 * R * Math.sin(toC), R);
                const spin = vec3(-Math.sin(drive) * 60, Math.cos(drive) * 60, 0);
                const bodies = [
                    body({ position: vec3(0, 0, R), velocity: ZERO, angularVelocity: spin }, p),
                    body({ position: b, velocity: ZERO, angularVelocity: ZERO }, p),
                    body({ position: cc, velocity: ZERO, angularVelocity: ZERO }, p),
                ];
                const contacts = line(0);
                if (Math.hypot(cc.x, cc.y) < 2 * R + 1e-12) {
                    contacts.push({ a: 0, b: 2, fixed: false, friction: 0 });
                }
                const s = solveRestingContacts(bodies, [], contacts);
                expect(exact(s), `case ${n}`).toBe(true);
                if (contacts.length === 2) {
                    // Held, ball 0 pushes ball 1 along n01 with the part of its drive that points that way; ball 1 can
                    // lean on ball 2 only by a compression λ ∈ [0, c] along n12. It holds exactly when that load is
                    // within c of the segment {λ·n12 : 0 ≤ λ ≤ c}.
                    const cap = (7 / 5) * p.rollingDecel;
                    const n01 = normalize(vec3(b.x, b.y, 0));
                    const n12 = normalize(sub(cc, b));
                    const push = Math.max(0, dot(freeAcceleration(bodies[0]?.state as BallState, p), n01));
                    const along = Math.min(Math.max(push * dot(n01, n12), 0), cap);
                    const gap = Math.hypot(push * n01.x - along * n12.x, push * n01.y - along * n12.y) - cap;
                    if (Math.abs(gap) > 1e-6) {
                        expect((s.members[1]?.phase ?? "stationary") === "stationary", `case ${n}`).toBe(gap < 0);
                    }
                }
                for (const m of s.members.slice(1)) {
                    if (m?.push && m.phase === "rolling") {
                        released++;
                        const x = m.push.acceleration;
                        const d = m.push.direction;
                        const along = dot(x, d);
                        expect(along).toBeGreaterThan(0);
                        expect(Math.abs(x.x * d.y - x.y * d.x)).toBeLessThanOrEqual(DIRECTION_TOLERANCE * along + 1e-15);
                    } else {
                        const x = m?.push?.acceleration ?? ZERO;
                        expect(Math.abs(x.x) + Math.abs(x.y)).toBeLessThan(1e-12);
                    }
                }
            }
            expect(released).toBeGreaterThan(100);
        });
    });

    describe("with friction (μ = 0.05)", () => {
        it("holds a straight line that the push could move one ball at a time", () => {
            // Blue's contact slips down on ball 1, loading it; N₀₁ = SLIDE/(1 + μ·μs) still cannot move both.
            for (const bend of [0, 1e-3]) {
                const s = solveRestingContacts(chain(1.5, bend), [], line(MU));
                expect(exact(s)).toBe(true);
                expect(s.members[1]?.phase).toBe("stationary");
                expect(s.members[2]?.phase ?? "stationary").toBe("stationary");
            }
        });

        it("pushes the line forward together, both contacts slipping vertically", () => {
            // The resting balls roll from rest, so their contact slips at 2X and cannot stick. With
            // c = (1 − μ − kμ)/(1 + μ·μs), e = (1 + μ − kμ)/(1 − μ − kμ): X = [c·μs − k(1 + e)]·g/(7/5·(1 + e) + c).
            const s = solveRestingContacts(chain(ROLL), [], line(MU));
            expect(exact(s)).toBe(true);
            expect(s.modes).toEqual(["slip", "slip"]);
            expect(s.slips[1]?.z).toBeCloseTo(-1, 12);
            for (const m of s.members) {
                expect(m?.push?.acceleration.x).toBeCloseTo(0.34085645955159, 12);
            }
        });

        it("holds a line bent by 30°", () => {
            const s = solveRestingContacts(chain(1.5, Math.PI / 6), [], line(MU));
            expect(exact(s)).toBe(true);
            expect(s.members[1]?.phase).toBe("stationary");
        });

        it("releases the middle ball of a line bent by 60°, its contact with the held end slipping sideways", () => {
            // B = [(1 − μ)(cos30° − μ/2) − kμ]/(1 + μ·μs), a = (B·SLIDE − k·g)/(7/(5·cos30°) + B), x₁ = (a, −a·tan30°).
            // Ball 2 takes N₁₂·√(1 + μ²) = 1.3604 of resistance, within 2.1.
            const s = solveRestingContacts(chain(1.5, Math.PI / 3), [], line(MU));
            expect(exact(s)).toBe(true);
            expect(s.members[1]?.phase).toBe("rolling");
            expect(s.members[1]?.push?.acceleration.x).toBeCloseTo(0.095769964237268, 12);
            expect(s.members[1]?.push?.acceleration.y).toBeCloseTo(-0.055292814632668, 12);
            expect(s.members[1]?.push?.direction.x).toBeCloseTo(C30, 9);
            expect(s.members[2]?.phase).toBe("stationary");
            expect(s.slips[1]?.x).toBeCloseTo(C30, 9);
            expect(s.slips[1]?.y).toBeCloseTo(-0.5, 9);
        });
    });
});

describe("friction on a push (design §6)", () => {
    it("pushes a resting ball with a ball driven by topspin: the generalised closed form", () => {
        // Contact slip −R(ω_a + ω_b)·ẑ points down, so kinetic friction μN lifts blue and loads red: L = g ∓ μN.
        // Blue: A = μs(g − μN) − N; red rolls: 7/5·A = N(1 − μ) − k(g + μN). Hence A = (c·μs − k)·g/(7/5 + c),
        // c = (1 − μ − kμ)/(1 + μ·μs). Blue's slip ends at T = R·Ω₀/(A + 5/2·[μs·g + μN(1 − μs)]), before the contact
        // slip would (at 0.40704 s).
        const s = solveRestingContacts([ball(0, 0, ZERO, vec3(0, 60, 0)), ball(2 * R, 0)], [], pair(MU));
        expect(exact(s)).toBe(true);
        expect(s.modes).toEqual(["slip"]);
        expect(s.slips[0]).toEqual(vec3(0, 0, -1));
        const blue = s.members[0];
        const red = s.members[1];
        expect(blue?.push?.acceleration.x).toBeCloseTo(0.89895492703632, 12);
        expect(red?.push?.acceleration.x).toBeCloseTo(0.89895492703632, 12);
        expect(blue?.push?.angularAcceleration.y).toBeCloseTo(-166.9465607446, 9);
        const T = pushDuration(blue?.state as BallState, "sliding", blue?.push as PushMotion, R);
        expect(T).toBeCloseTo(0.32173469194794, 12);
        const slipEnd = contactSlipDuration(
            blue?.state as BallState,
            blue?.push as PushMotion,
            red?.state as BallState,
            red?.push as PushMotion,
            vec3(1, 0, 0),
            s.slips[0] as Vec3,
            R,
        );
        expect(slipEnd).toBeCloseTo(0.40704441282875, 12);
    });

    it("gives a pushed rolling ball the same push as one at rest", () => {
        const v = vec3(0.5, 0, 0);
        const s = solveRestingContacts([ball(0, 0, v, vec3(0, 40, 0)), rolling(2 * R, 0, v)], [], pair(MU));
        expect(exact(s)).toBe(true);
        expect(s.members[0]?.push?.acceleration.x).toBeCloseTo(0.89895492703632, 12);
        expect(s.members[1]?.push?.acceleration.x).toBeCloseTo(0.89895492703632, 12);
    });

    it("holds a ball driven against an upright, which friction lifts, until both its slips end together", () => {
        // Upright friction μu·N lifts the ball (L = g − μu·N), so N = SLIDE/(1 + μu·μs). The turf slip and the contact
        // slip are both −R·ω_y while the ball is still: both end at T = 2R·Ω(1 + μu·μs)/(5·SLIDE·(1 + μu)).
        const s = solveRestingContacts(
            [ball(0, 0, ZERO, vec3(0, 60, 0))],
            [vec3(R + 0.008, 0, 0)],
            [{ a: 0, b: 0, fixed: true, friction: 0.1 }],
        );
        expect(exact(s)).toBe(true);
        const m = s.members[0];
        expect(m?.push?.acceleration.x).toBeCloseTo(0, 14);
        const T = pushDuration(m?.state as BallState, "sliding", m?.push as PushMotion, R);
        expect(T).toBeCloseTo(0.3447796972648, 12);
        const slipEnd = contactSlipDuration(
            m?.state as BallState,
            m?.push as PushMotion,
            null,
            null,
            vec3(1, 0, 0),
            s.slips[0] as Vec3,
            R,
        );
        expect(slipEnd).toBeCloseTo(T, 12);
    });

    it("still holds a resting ball that the push cannot move", () => {
        // N = SLIDE/(1 + μ·μs); red needs N(1 − μ) = 0.4738 of its resistance k·(g + μN) = 0.6877.
        const weak: MotionParams = { radius: R, slidingDecel: 0.5, rollingDecel: 0.49, gravity: G };
        const s = solveRestingContacts(
            [ball(0, 0, ZERO, vec3(0, 60, 0), weak), ball(2 * R, 0, ZERO, ZERO, weak)],
            [],
            pair(MU),
        );
        expect(exact(s)).toBe(true);
        expect(s.members[1]?.phase).toBe("stationary");
    });

    it("lifts a ball off the turf when friction takes its load", () => {
        // Blue (topspin) and red (stronger backspin) drive into each other; the contact slips up on red. With μ = 4,
        // μ·μs > 1: on the turf red's load would be negative, so red is solved airborne and rises at
        // 2g(μ·μs − 1)/(2 − μ·μs).
        const s = solveRestingContacts(
            [ball(0, 0, ZERO, vec3(0, 60, 0)), ball(2 * R, 0, ZERO, vec3(0, -80, 0))],
            [],
            pair(4),
        );
        expect(exact(s)).toBe(true);
        expect(s.members[1]?.phase).toBe("airborne");
        expect(s.members[1]?.state.position.z).toBe(R);
        expect(s.members[1]?.push?.acceleration.z).toBeCloseTo(5.6504842256315, 12);
    });

    it("locks spin about the vertical axis while a ball rolls, and lets friction change it while it slides", () => {
        // Sidespin makes the contact slip sideways, so its friction torques both balls about the vertical. The rolling
        // ball's patch grips; the sliding ball's does not.
        const v = vec3(0.5, 0, 0);
        const s = solveRestingContacts([ball(0, 0, v, vec3(0, 40, 10)), rolling(2 * R, 0, v, 20)], [], pair(MU));
        expect(exact(s)).toBe(true);
        expect(s.members[0]?.phase).toBe("sliding");
        expect(s.members[1]?.phase).toBe("rolling");
        expect(s.members[1]?.push?.angularAcceleration.z).toBe(0);
        expect(Math.abs(s.members[0]?.push?.angularAcceleration.z ?? 0)).toBeGreaterThan(1);
    });

    it("reports approximate-slip when a direction solve fails, slipping against the stuck force", () => {
        const p: MotionParams = { radius: R, slidingDecel: SLIDE, rollingDecel: 5, gravity: G };
        const bodies = [
            body({ position: vec3(R, 0, R + 2 * R * C30), velocity: ZERO, angularVelocity: ZERO }, p),
            body({ position: vec3(0, 0, R), velocity: ZERO, angularVelocity: ZERO }, p),
        ];
        const s = solveRestingContacts(bodies, [], pair(MU), { hooks: { failDirections: true } });
        expect(s.approximateSlip).toEqual([true, true]);
        expect(s.approximate).toEqual([false, false]);
        expect(Number.isFinite(s.slipExcess)).toBe(true);
        expect(s.slips[0]?.x).toBeCloseTo(C30, 9);
    });

    it("holds every group, solving nothing, once the budget is spent", () => {
        const s = solveRestingContacts([ball(0, 0, ZERO, vec3(0, 60, 0)), ball(2 * R, 0)], [], pair(MU), {
            budget: 0,
        });
        expect(s.budgetHold).toEqual([true, true]);
        expect(s.approximate).toEqual([false, false]);
        expect(s.holdExcess).toBe(0);
        expect(s.work).toBe(0);
        expect(s.members[1]?.phase).toBe("stationary");
    });
});

describe("limits of holding with friction (design §6)", () => {
    // Each sweep straddles a closed-form limit; outside a band of 1e-7 (radians, or relative), at least ten times
    // HOLD_SLACK's effect on the limit, the solver decides as the closed form does, and never falls back.
    const OFFSETS = [-1e-3, -1e-4, -1e-5, -1e-6, -1e-7, 1e-7, 1e-6, 1e-5, 1e-4, 1e-3];
    const held = (s: RestingSolution): boolean => s.members[1]?.phase === "stationary";

    it("holds the bent line up to θ* = 52.3717420825° (ball 1 at capacity, the 1–2 contact on its cone edge)", () => {
        const limit = (52.3717420825 * Math.PI) / 180;
        for (const offset of OFFSETS) {
            const theta = limit + offset;
            const p: MotionParams = { radius: R, slidingDecel: SLIDE, rollingDecel: 1.5, gravity: G };
            const bodies = [
                ball(0, 0, ZERO, vec3(0, 60, 0), p),
                ball(2 * R, 0, ZERO, ZERO, p),
                ball(2 * R + 2 * R * Math.cos(theta), 2 * R * Math.sin(theta), ZERO, ZERO, p),
            ];
            const s = solveRestingContacts(bodies, [], line(MU));
            expect(exact(s), `offset ${offset}`).toBe(true);
            expect(held(s), `offset ${offset}`).toBe(offset < 0);
        }
    });

    it("holds the wedge for rollingDecel above rollingDecel* = 1.1234083693595", () => {
        // A topspin pusher at rest into two touching balls at ±30°: N(1 − μ) ≤ 7/5·μr·(g + μN) with
        // N = μs·g/(2(cos 30° + μ·μs)), μs = 0.3.
        const limit = 1.1234083693595;
        for (const offset of OFFSETS) {
            const p: MotionParams = { radius: R, slidingDecel: 0.3 * G, rollingDecel: limit * (1 + offset), gravity: G };
            const bodies = [ball(0, 0, ZERO, vec3(0, 60, 0), p), ball(2 * R * C30, -R, ZERO, ZERO, p), ball(2 * R * C30, R, ZERO, ZERO, p)];
            const contacts: RestingContact[] = [
                { a: 0, b: 1, fixed: false, friction: MU },
                { a: 0, b: 2, fixed: false, friction: MU },
                { a: 1, b: 2, fixed: false, friction: MU },
            ];
            const s = solveRestingContacts(bodies, [], contacts);
            expect(exact(s), `offset ${offset}`).toBe(true);
            expect(held(s), `offset ${offset}`).toBe(offset > 0);
        }
    });

    it("holds a ball pushed against an upright up to β* = 20.447782900°", () => {
        // A topspin pusher drives red into an upright (radius 8 mm, μ 0.1) standing at angle β round red, in the
        // standard world's turf (μs 0.3, μr 0.05). The hold limit maximises the upright's stuck friction direction
        // (closed form in the planning ledger); the release onset is lower (20.290321024°), and holding first decides.
        const limit = (20.4477829 * Math.PI) / 180;
        const p: MotionParams = { radius: R, slidingDecel: 0.3 * G, rollingDecel: 0.05 * G, gravity: G };
        for (const offset of OFFSETS) {
            const beta = limit + offset;
            const axis = vec3(2 * R + (R + 0.008) * Math.cos(beta), (R + 0.008) * Math.sin(beta), 0);
            const s = solveRestingContacts(
                [ball(0, 0, ZERO, vec3(0, 60, 0), p), ball(2 * R, 0, ZERO, ZERO, p)],
                [axis],
                [
                    { a: 0, b: 1, fixed: false, friction: MU },
                    { a: 1, b: 0, fixed: true, friction: 0.1 },
                ],
            );
            expect(exact(s), `offset ${offset}`).toBe(true);
            expect(held(s), `offset ${offset}`).toBe(offset < 0);
        }
    });
});

describe("random clusters with friction", () => {
    const CLUSTERS = SLOW ? 20_000 : 200;

    it(
        `solves ${CLUSTERS} random four-ball clusters with obstacles exactly, well within the search cap`,
        { timeout: SLOW ? 3_600_000 : 120_000 },
        () => {
            const random = rng(43);
            let worst = 0;
            for (let made = 0; made < CLUSTERS; ) {
                const c = randomCluster(random);
                if (!c) {
                    continue;
                }
                made++;
                const s = solveRestingContacts(c.bodies, c.axes, c.contacts);
                expect(exact(s), `cluster ${made}: ${c.label}`).toBe(true);
                worst = Math.max(worst, s.searched);
            }
            expect(worst).toBeLessThan(MODE_SEARCH_LIMIT);
        },
    );

    it("never pulls, keeps friction in its cone and against the slip, and never adds energy", { timeout: 60_000 }, () => {
        const random = rng(47);
        for (let made = 0; made < 150; ) {
            const c = randomCluster(random);
            if (!c) {
                continue;
            }
            made++;
            const model = buildModel(c.bodies, c.axes, c.contacts, GRAVITY);
            const g = solveGroup(model, { units: 0 }, Infinity);
            expect(g.kind, c.label).toBe("exact");
            const out = g.outcome as CandidateOutcome;
            const ev = out.ev as Evaluated;
            c.contacts.forEach((k, q) => {
                if (out.cand.contacts[q] === "open") {
                    return;
                }
                const geometry = model.geometry[q] as ContactGeometry;
                const P = ev.force[q] as Vec3;
                const N = dot(P, geometry.n);
                const T = sub(P, scale(geometry.n, N));
                expect(N, c.label).toBeGreaterThanOrEqual(-1e-9);
                expect(length(T), c.label).toBeLessThanOrEqual(k.friction * N + 1e-9);
                // T acts on b; a's contact point slips (or starts to slip) along `slip` relative to b's, so T·slip ≥ 0
                // means friction opposes the slip and does no positive work.
                const slip = geometry.slipping ? geometry.slip : (ev.relative[q] as Vec3);
                expect(dot(T, slip), c.label).toBeGreaterThanOrEqual(-1e-9);
            });
            let power = 0;
            c.bodies.forEach((b, i) => {
                power +=
                    dot(b.state.velocity, ev.accel[i] as Vec3) +
                    0.4 * R * R * dot(b.state.angularVelocity, ev.spin[i] as Vec3);
            });
            expect(power, c.label).toBeLessThanOrEqual(1e-9);
        }
    });

    it("mirrors a mirrored cluster and is bit-identical across runs", () => {
        const random = rng(53);
        const mirror = (c: Cluster): Cluster => ({
            ...c,
            bodies: c.bodies.map((b) => ({
                ...b,
                state: {
                    position: vec3(b.state.position.x, -b.state.position.y, b.state.position.z),
                    velocity: vec3(b.state.velocity.x, -b.state.velocity.y, b.state.velocity.z),
                    // Reflecting y flips the pseudovector's x and z components.
                    angularVelocity: vec3(-b.state.angularVelocity.x, b.state.angularVelocity.y, -b.state.angularVelocity.z),
                },
            })),
            axes: c.axes.map((a) => vec3(a.x, -a.y, a.z)),
        });
        for (let made = 0; made < 40; ) {
            const c = randomCluster(random);
            if (!c) {
                continue;
            }
            made++;
            const a = solveRestingContacts(c.bodies, c.axes, c.contacts);
            expect(solveRestingContacts(c.bodies, c.axes, c.contacts)).toStrictEqual(a);
            const m = mirror(c);
            const b = solveRestingContacts(m.bodies, m.axes, m.contacts);
            expect(b.modes, c.label).toEqual(a.modes);
            a.members.forEach((member, i) => {
                expect(b.members[i]?.phase, c.label).toBe(member?.phase);
                const xa = member?.push?.acceleration ?? ZERO;
                const xb = b.members[i]?.push?.acceleration ?? ZERO;
                expect(xb.x, c.label).toBeCloseTo(xa.x, 9);
                expect(xb.y, c.label).toBeCloseTo(-xa.y, 9);
            });
        }
    });
});

describe("clusters at the limit of holding (μ = 0, P2a.1's fixtures)", () => {
    // Ball 0 is driven by topspin `spin` into resting balls; uprights of radius UPRIGHT stand at `axes`.
    const UPRIGHT = 0.01;
    interface Fixture {
        readonly bodies: ContactBody[];
        readonly axes: Vec3[];
        readonly contacts: RestingContact[];
    }
    function cluster(
        positions: readonly (readonly [number, number])[],
        axes: readonly (readonly [number, number])[],
        spin: Vec3,
        roll: number,
    ): Fixture {
        const p: MotionParams = { radius: R, slidingDecel: SLIDE, rollingDecel: roll, gravity: G };
        const bodies = positions.map(([x, y], i) => ball(x, y, ZERO, i === 0 ? spin : ZERO, p));
        const uprights = axes.map(([x, y]) => vec3(x, y, 0));
        const contacts: RestingContact[] = [];
        positions.forEach(([xa, ya], a) => {
            positions.forEach(([xb, yb], b) => {
                if (b > a && Math.hypot(xb - xa, yb - ya) < 2 * R + 1e-9) {
                    contacts.push({ a, b, fixed: false, friction: 0 });
                }
            });
            uprights.forEach((u, k) => {
                if (Math.hypot(u.x - xa, u.y - ya) < R + UPRIGHT + 1e-9) {
                    contacts.push({ a, b: k, fixed: true, friction: 0 });
                }
            });
        });
        return { bodies, axes: uprights, contacts };
    }

    // What every solution must satisfy: the driver never pushed backwards; balls released from rest move along their
    // frozen resistance, and held balls stay put; no contact left converging and coupled contacts kept closed; and
    // kinetic energy, spin included, never rising.
    function expectSound(c: Fixture, s: RestingSolution, label: string): void {
        expect(s.holdExcess, label).toBeGreaterThanOrEqual(0);
        const x = c.bodies.map((b, i) => s.members[i]?.push?.acceleration ?? freeAcceleration(b.state, b.params));
        const drive = freeAcceleration(c.bodies[0]?.state as BallState, c.bodies[0]?.params as MotionParams);
        expect(dot(x[0] as Vec3, drive), label).toBeGreaterThanOrEqual(-1e-12);
        c.bodies.slice(1).forEach((_, j) => {
            const m = s.members[j + 1];
            const xi = x[j + 1] as Vec3;
            if (m?.phase === "rolling") {
                const d = m.push?.direction as Vec3;
                const along = dot(xi, d);
                expect(along, label).toBeGreaterThan(0);
                expect(Math.abs(xi.x * d.y - xi.y * d.x), label).toBeLessThanOrEqual(DIRECTION_TOLERANCE * along);
            } else {
                expect(Math.abs(xi.x) + Math.abs(xi.y), label).toBeLessThan(1e-12);
            }
        });
        c.contacts.forEach((k, n) => {
            const a = c.bodies[k.a]?.state.position as Vec3;
            const centre = k.fixed ? (c.axes[k.b] as Vec3) : (c.bodies[k.b]?.state.position as Vec3);
            const normal = normalize(vec3(centre.x - a.x, centre.y - a.y, 0));
            const closing = dot(sub(x[k.a] as Vec3, k.fixed ? ZERO : (x[k.b] as Vec3)), normal);
            expect(closing, `${label} contact ${n}`).toBeLessThanOrEqual(1e-9);
            if (s.modes[n] !== "open") {
                expect(Math.abs(closing), `${label} contact ${n}`).toBeLessThanOrEqual(1e-9);
            }
        });
        const energy = (t: number): number =>
            c.bodies.reduce((sum, b, i) => {
                const m = s.members[i];
                return sum + kineticEnergy(m?.push ? pushedState(m.state, m.push, t) : b.state, BALL);
            }, 0);
        for (const t of [1e-4, 1e-3, 1e-2]) {
            expect(energy(t), label).toBeLessThanOrEqual(energy(0) + 1e-12);
        }
    }

    // A triangle 1-2-3 against an upright, and a bent chain 0-1-2: before P2a.1's exact release solve both were
    // arrested near their limits of holding. Robustness, not arithmetic, is asserted: exact and sound.
    const TRIANGLE = {
        positions: [
            [0, 0],
            [0.09161267455944855, -0.008433140581335576],
            [0.17656861236453797, -0.04373878647059491],
            [0.16466622969910946, 0.047488036815572995],
        ] as const,
        axes: [[0.203653596203564, -0.0927531073415373]] as const,
        spin: vec3(14.017717263720547, 58.33955435820873, 0),
    };
    const BENT = {
        positions: [
            [0, 0],
            [0.08022471315813423, 0.045033269908980454],
            [0.16880420327012668, 0.02018022318429436],
        ] as const,
        axes: [] as const,
        spin: vec3(-21.362101956587257, 56.06835649451811, 0),
    };

    it("solves the triangle held against an upright and the bent chain exactly near their limits", () => {
        for (const roll of [0.6312, 0.635, 0.64]) {
            const c = cluster(TRIANGLE.positions, TRIANGLE.axes, TRIANGLE.spin, roll);
            const s = solveRestingContacts(c.bodies, c.axes, c.contacts);
            expectSound(c, s, `triangle roll ${roll}`);
            expect(exact(s), `triangle roll ${roll}`).toBe(true);
        }
        for (const roll of [1.4982518, 1.4982522, 1.4982528]) {
            const c = cluster(BENT.positions, BENT.axes, BENT.spin, roll);
            const s = solveRestingContacts(c.bodies, c.axes, c.contacts);
            expectSound(c, s, `bent roll ${roll}`);
            expect(exact(s), `bent roll ${roll}`).toBe(true);
        }
    });

    // Random 3–4-ball clusters: a driver touching ball 1, then balls touching a random resting ball or nestling against
    // two touching ones, and an optional upright beside a resting ball.
    function randomFixture(random: () => number, roll: number): Fixture | null {
        const positions: [number, number][] = [[0, 0]];
        const first = (random() - 0.5) * 1.2;
        positions.push([2 * R * Math.cos(first), 2 * R * Math.sin(first)]);
        const extra = 1 + Math.floor(random() * 2);
        for (let n = 0; n < extra; n++) {
            const i = 1 + Math.floor(random() * (positions.length - 1));
            const [xi, yi] = positions[i] as [number, number];
            const partners = positions
                .map((_, j) => j)
                .filter(
                    (j) =>
                        j > 0 &&
                        j !== i &&
                        Math.hypot((positions[j]?.[0] ?? 0) - xi, (positions[j]?.[1] ?? 0) - yi) < 2 * R + 1e-9,
                );
            let angle = (random() - 0.5) * 2 * Math.PI;
            if (partners.length > 0 && random() < 0.6) {
                const [xj, yj] = positions[partners[Math.floor(random() * partners.length)] as number] as [
                    number,
                    number,
                ];
                angle = Math.atan2(yj - yi, xj - xi) + (random() < 0.5 ? Math.PI / 3 : -Math.PI / 3);
            }
            const q: [number, number] = [xi + 2 * R * Math.cos(angle), yi + 2 * R * Math.sin(angle)];
            if (positions.some(([x, y]) => Math.hypot(x - q[0], y - q[1]) < 2 * R - 1e-9)) {
                return null;
            }
            positions.push(q);
        }
        const axes: [number, number][] = [];
        if (random() < 0.5) {
            const who = 1 + Math.floor(random() * (positions.length - 1));
            const angle = (random() - 0.5) * 2 * Math.PI;
            const [xw, yw] = positions[who] as [number, number];
            const axis: [number, number] = [xw + (R + UPRIGHT) * Math.cos(angle), yw + (R + UPRIGHT) * Math.sin(angle)];
            if (positions.some(([x, y], i) => i !== who && Math.hypot(x - axis[0], y - axis[1]) < R + UPRIGHT - 1e-9)) {
                return null;
            }
            axes.push(axis);
        }
        const drive = (random() - 0.5) * 1.0;
        return cluster(positions, axes, vec3(-Math.sin(drive) * 60, Math.cos(drive) * 60, 0), roll);
    }

    it("neither arrests nor falls back on either side of any limit of holding", { timeout: 120_000 }, () => {
        const random = rng(11);
        let solves = 0;
        let limits = 0;
        for (let made = 0; made < 16; ) {
            const shape = randomFixture(random, 1);
            if (!shape) {
                continue;
            }
            made++;
            const solve = (roll: number): RestingSolution => {
                const bodies = shape.bodies.map((b) => ({ ...b, params: { ...b.params, rollingDecel: roll } }));
                const c = { ...shape, bodies };
                const s = solveRestingContacts(c.bodies, c.axes, c.contacts);
                solves++;
                expect(exact(s), `cluster ${made} roll ${roll}`).toBe(true);
                expectSound(c, s, `cluster ${made} roll ${roll}`);
                return s;
            };
            const phases = (s: RestingSolution): string => s.members.map((m) => m?.phase ?? "-").join();
            // Scan rollingDecel, bisect every change of phase down to rounding, then probe either side of it.
            let low = 0.2;
            let before = phases(solve(low));
            for (let k = 1; k <= 20; k++) {
                const high = 0.2 + (2.3 * k) / 20;
                const after = phases(solve(high));
                if (after !== before) {
                    limits++;
                    let lo = low;
                    let hi = high;
                    for (let n = 0; n < 50; n++) {
                        const mid = (lo + hi) / 2;
                        if (phases(solve(mid)) === before) {
                            lo = mid;
                        } else {
                            hi = mid;
                        }
                    }
                    for (let e = 3; e <= 12; e++) {
                        solve(lo - Math.pow(10, -e));
                        solve(hi + Math.pow(10, -e));
                    }
                }
                before = after;
                low = high;
            }
        }
        expect(limits).toBeGreaterThan(10);
        expect(solves).toBeGreaterThan(2000);
    });

    it("keeps the nearest-hold fallback sound and its hold excess honest", () => {
        const random = rng(5);
        let moved = 0;
        let released = 0;
        let held = 0;
        for (let made = 0; made < 300; ) {
            const c = randomFixture(random, 0.2 + random() * 2.3);
            if (!c) {
                continue;
            }
            made++;
            const s = solveNearestHold(c.bodies, c.axes, c.contacts);
            expectSound(c, s, `cluster ${made}`);
            expect(s.approximate.every((a, i) => a || s.members[i] === null)).toBe(true);
            for (const m of s.members.slice(1)) {
                expect(m?.phase ?? "stationary").toBe("stationary");
            }
            // Gauss's principle with the driver the only moving ball: w·|x − f|² ≤ w·|f|², so x·f ≥ ½·|x|².
            const x = s.members[0]?.push?.acceleration ?? ZERO;
            const f = freeAcceleration(c.bodies[0]?.state as BallState, c.bodies[0]?.params as MotionParams);
            expect(dot(x, f)).toBeGreaterThanOrEqual(0.5 * dot(x, x) - 1e-12);
            moved += dot(x, x) > 0 ? 1 : 0;
            // Where the exact solve releases a ball, holding every resting ball is infeasible, so the excess is
            // positive.
            const exactSolution = solveRestingContacts(c.bodies, c.axes, c.contacts);
            if (exactSolution.members.slice(1).some((m) => m?.phase === "rolling")) {
                released++;
                expect(s.holdExcess, `cluster ${made}`).toBeGreaterThan(0);
            }
            held += s.holdExcess <= HOLD_SLACK ? 1 : 0;
        }
        expect(moved).toBeGreaterThan(100);
        expect(released).toBeGreaterThan(30);
        expect(held).toBeGreaterThan(30);
    });
});

describe("pushed motion", () => {
    it("moves with constant acceleration and matches its trajectory", () => {
        const start: BallState = { position: vec3(1, 2, R), velocity: vec3(0.5, 0, 0), angularVelocity: vec3(0, 3, 1) };
        const push = { acceleration: vec3(0.2, -0.1, 0), angularAcceleration: vec3(1, 2, 0), direction: vec3(1, 0, 0) };
        const s = pushedState(start, push, 2);
        expect(s.position.x).toBeCloseTo(1 + 0.5 * 2 + 0.1 * 4, 14);
        expect(s.position.y).toBeCloseTo(2 - 0.05 * 4, 14);
        expect(s.position.z).toBe(R);
        expect(s.angularVelocity).toEqual(vec3(2, 7, 1));
        const p = pushedTrajectory(start, push);
        expect(p.c2).toEqual(vec3(0.1, -0.05, 0));
        expect(pushedState(start, push, 0)).toBe(start);
    });

    it("ends a rolling push when the ball stops or turns past DIRECTION_TOLERANCE", () => {
        const start: BallState = { position: vec3(0, 0, R), velocity: vec3(1, 0, 0), angularVelocity: ZERO };
        const stop = { acceleration: vec3(-2, 0, 0), angularAcceleration: ZERO, direction: vec3(1, 0, 0) };
        expect(pushDuration(start, "rolling", stop, R)).toBeCloseTo(0.5, 15);
        const turn = { acceleration: vec3(0, 1, 0), angularAcceleration: ZERO, direction: vec3(1, 0, 0) };
        expect(pushDuration(start, "rolling", turn, R)).toBeCloseTo(DIRECTION_TOLERANCE, 15);
        expect(pushDuration(start, "stationary", stop, R)).toBe(Infinity);
    });

    it("ends a slipping contact when its slip stops or turns past DIRECTION_TOLERANCE", () => {
        // A ball sliding past an obstacle: the contact slip is its velocity along ŷ (normal x̂), slowing at 2 m/s².
        const start: BallState = { position: vec3(0, 0, R), velocity: vec3(0, 1, 0), angularVelocity: ZERO };
        const stop = { acceleration: vec3(0, -2, 0), angularAcceleration: ZERO, direction: ZERO };
        const n = vec3(1, 0, 0);
        expect(contactSlipDuration(start, stop, null, null, n, vec3(0, 1, 0), R)).toBeCloseTo(0.5, 15);
        const turn = { acceleration: vec3(0, 0, 1), angularAcceleration: ZERO, direction: ZERO };
        expect(contactSlipDuration(start, turn, null, null, n, vec3(0, 1, 0), R)).toBeCloseTo(DIRECTION_TOLERANCE, 15);
        const grow = { acceleration: vec3(0, 1, 0), angularAcceleration: ZERO, direction: ZERO };
        expect(contactSlipDuration(start, grow, null, null, n, vec3(0, 1, 0), R)).toBe(Infinity);
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/push.test.ts`
Expected: FAIL (`contactSlipDuration` is not exported; `RestingSolution` has no `modes`).

- [ ] **Step 4: Replace `src/engine/push.ts`**

```ts
/**
 * Resting contact and pushing (spec §5 phase 2; P2a.2 design).
 *
 * A contact slower than RESTING_SPEED is not bounced: with a ball driven into another by its own spin, bouncing starts
 * a Zeno sequence of ever-smaller rebounds that no event budget can finish. Instead the touching bodies' speeds along
 * each line of centres are made equal (a perfectly inelastic, frictionless normal impulse: the speeds it removes are
 * below RESTING_SPEED, so the friction it omits is negligible), and each group of touching bodies is solved with 3D,
 * load-coupled Coulomb friction (contactModel.ts, modeSolve.ts): every ball's mode (held, released from rest, rolling,
 * sliding, in flight) and every contact's (open, stuck, slipping) are decided together, every resting ball tried held
 * first, and the first consistent candidate wins.
 *
 * Within one segment everything is constant, so every trajectory stays quadratic:
 * - Each contact normal is fixed for the segment. Relative motion is then perpendicular to the normal, which can only
 *   open the gap (to second order); the segment ends when the gap opens past SEPARATION_TOLERANCE.
 * - Each ball's turf force is frozen at the segment start (sliding friction against its slip, rolling resistance
 *   against its travel), and so is each slipping contact's slip direction. The segment ends when one stops being valid:
 *   the slip or velocity reaches zero along its frozen direction or turns more than DIRECTION_TOLERANCE away from it
 *   (pushDuration, contactSlipDuration). The simulator then solves the group again.
 * - Because each normal is frozen, a ball sliding round another in flight regroups every ~1.5 mrad of turn
 *   (√(SEPARATION_TOLERANCE/R)): around a thousand events for a ball rolling off another's top, but finitely many.
 *
 * If no exact candidate is found, or the shot's work budget is spent, the group falls back to the nearest hold: its
 * resting balls stay at rest and the moving balls are solved against them as fixed, frictionless, compression-only
 * obstacles. That problem always has a solution (see nearestHold) and does no work through the held balls. It differs
 * from the exact solution by the motion and friction it omits; nothing bounds that in principle, so the solution
 * reports how far holding misses (holdExcess) and flags the balls concerned.
 */
import { approachSpeed } from "./detect";
import {
    ACCELERATION_EPSILON,
    ROLLING_WEIGHT,
    buildModel,
    type ContactBody,
    type ContactGeometry,
    type ContactMode,
    type Evaluated,
    type Model,
    type RestingContact,
} from "./contactModel";
import { ZERO, add, cross, dot, horizontal, length, normalize, scale, sub, vec3, type Vec3 } from "./math/vec3";
import { holdExcess, solveGroup, type CandidateOutcome, type SolveHooks } from "./modeSolve";
import { SPEED_EPSILON, classify, contactSlip, landingTime, rollingSpin, type Trajectory } from "./motion";
import type { BallState, MotionParams, MotionPhase, PushMotion } from "./types";

export { ACCELERATION_EPSILON, FOLLOW_EPSILON, HOLD_SLACK } from "./contactModel";
export type { ContactBody, ContactMode, RestingContact } from "./contactModel";

/**
 * Contacts closing slower than this (m/s) are resting contacts, resolved without restitution. A numerical tolerance,
 * not a physical constant: a rebound this slow lifts the gap by at most RESTING_SPEED²/(2a), well under a micrometre
 * for any turf deceleration a, so treating it as inelastic changes no observable outcome.
 */
export const RESTING_SPEED = 1e-3;

/** Largest sine of the angle a pushed ball's slip or velocity, or a contact's slip, may turn within a segment. */
export const DIRECTION_TOLERANCE = 1e-2;

/** Gap (m) beyond which a coupled contact is considered to have separated. */
export const SEPARATION_TOLERANCE = 1e-7;

/** Pivots at or below this make the glue's and the nearest hold's systems singular: their contacts are dependent. */
const PIVOT_TOLERANCE = 1e-12;

/** A ball's state and motion as decided by the solver. `push` is null when the ball moves freely. */
export interface RestingMember {
    readonly state: BallState;
    readonly phase: MotionPhase;
    readonly push: PushMotion | null;
}

/** Outcome of a resting-contact solve. */
export interface RestingSolution {
    /** Per body: its new state and motion, or null when the solve leaves it untouched. */
    readonly members: readonly (RestingMember | null)[];
    /** Per contact: its mode; a coupled contact (pushing, or holding a ball) is "stick" or "slip". */
    readonly modes: readonly ContactMode[];
    /**
     * Per contact: while it slips with friction, the frozen unit slip of a's contact point relative to b's (world
     * coordinates); otherwise null.
     */
    readonly slips: readonly (Vec3 | null)[];
    /**
     * Per body: true when its group fell back to the nearest hold because no exact solution was found. The motion is
     * still sound (no contact converges, no force pulls, the held balls do no work), but not the exact solution.
     */
    readonly approximate: readonly boolean[];
    /**
     * Over the groups that fell back: how far holding every resting ball misses its limits (m/s²; see
     * modeSolve.GroupSolution.excess); 0 when no group fell back.
     */
    readonly holdExcess: number;
    /** Per body: true when a contact or turf slip of the body fell back to approximate-slip directions. */
    readonly approximateSlip: readonly boolean[];
    /** The worst residual (m/s²) of the failed direction solves behind approximateSlip; 0 when none. */
    readonly slipExcess: number;
    /** Per body: true when its group was held because the shot's work budget was spent. */
    readonly budgetHold: readonly boolean[];
    /** Work units the solve spent (see linalg.ts). */
    readonly work: number;
    /** The most candidates any group of the solve tried (diagnostic for MODE_SEARCH_LIMIT). */
    readonly searched: number;
}

/** Options of a resting-contact solve. */
export interface RestingOptions {
    /** Gravity vector (m/s²); −g·ẑ, with g from the first body's params, when omitted. */
    readonly gravity?: Vec3;
    /** Work units the solve may still spend: the shot's remaining budget. Infinity when omitted. */
    readonly budget?: number;
    /** Test seam: see modeSolve.SolveHooks. */
    readonly hooks?: SolveHooks;
}

interface Response {
    readonly phase: MotionPhase;
    /** Free acceleration from the turf (m/s²). */
    readonly force: Vec3;
    /** Effective inertia relative to the ball's mass. */
    readonly weight: number;
}

/** A ball's frictionless view (P2a.1): its free acceleration and effective inertia, used by the glue and the hold. */
function response(s: BallState, p: MotionParams): Response {
    const phase = classify(s, p.radius);
    switch (phase) {
        case "sliding":
            return { phase, force: scale(normalize(contactSlip(s, p.radius)), -p.slidingDecel), weight: 1 };
        case "rolling":
            return { phase, force: scale(normalize(horizontal(s.velocity)), -p.rollingDecel), weight: ROLLING_WEIGHT };
        case "stationary":
            return { phase, force: ZERO, weight: ROLLING_WEIGHT };
        case "airborne":
            return { phase, force: vec3(0, 0, 0 - p.gravity), weight: 1 };
    }
}

/**
 * Returns the acceleration (m/s²) the turf gives a ball moving freely from state `s`, as the resting-contact solver
 * sees it. The simulator uses the same function to decide whether touching balls are driven together, so detection
 * and resolution agree.
 */
export function freeAcceleration(s: BallState, p: MotionParams): Vec3 {
    return response(s, p).force;
}

/** Solves m·x = b by Gaussian elimination with partial pivoting; null when m is singular. */
function solveLinear(m: readonly (readonly number[])[], b: readonly number[]): number[] | null {
    const n = b.length;
    const a = m.map((row, i) => [...row, b[i] as number]);
    const at = (r: number, c: number): number => (a[r] as number[])[c] as number;
    for (let col = 0; col < n; col++) {
        let pivot = col;
        for (let r = col + 1; r < n; r++) {
            if (Math.abs(at(r, col)) > Math.abs(at(pivot, col))) {
                pivot = r;
            }
        }
        if (Math.abs(at(pivot, col)) <= PIVOT_TOLERANCE) {
            return null;
        }
        [a[col], a[pivot]] = [a[pivot] as number[], a[col] as number[]];
        for (let r = col + 1; r < n; r++) {
            const factor = at(r, col) / at(col, col);
            for (let c = col; c <= n; c++) {
                (a[r] as number[])[c] = at(r, c) - factor * at(col, c);
            }
        }
    }
    const x = new Array<number>(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
        let sum = at(r, n);
        for (let c = r + 1; c < n; c++) {
            sum -= at(r, c) * (x[c] as number);
        }
        x[r] = sum / at(r, r);
    }
    return x;
}

/**
 * The frictionless contact constraints of one group, in the form J·x = 0 (touching and not converging) for body
 * accelerations or velocities x. Row k of J maps body i to +n on the body that n points to, −n on the other, and ZERO
 * otherwise.
 */
interface ContactSystem {
    readonly bodies: readonly number[];
    readonly contacts: readonly number[];
    readonly jacobian: (k: number, i: number) => Vec3;
    /** Inverse effective inertia of body i (0 when held at rest). */
    readonly inverseWeight: (i: number) => number;
}

/**
 * Applies the contact impulses (or forces) that make J·x = 0 for the contacts in `active`, starting from `base` (per
 * body): returns the resulting x per body and the multiplier per active contact, or null when the active contacts are
 * not independent.
 */
function project(
    system: ContactSystem,
    active: readonly number[],
    base: ReadonlyMap<number, Vec3>,
): { readonly result: Map<number, Vec3>; readonly multipliers: number[] } | null {
    const rowDot = (k: number, l: number): number =>
        system.bodies.reduce(
            (sum, i) => sum + system.inverseWeight(i) * dot(system.jacobian(k, i), system.jacobian(l, i)),
            0,
        );
    const matrix = active.map((k) => active.map((l) => rowDot(k, l)));
    const rhs = active.map((k) =>
        system.bodies.reduce((sum, i) => sum - dot(system.jacobian(k, i), base.get(i) as Vec3), 0),
    );
    const multipliers = active.length === 0 ? [] : solveLinear(matrix, rhs);
    if (multipliers === null) {
        return null;
    }
    const result = new Map<number, Vec3>();
    for (const i of system.bodies) {
        let x = base.get(i) as Vec3;
        active.forEach((k, j) => {
            x = add(x, scale(system.jacobian(k, i), system.inverseWeight(i) * (multipliers[j] as number)));
        });
        result.set(i, x);
    }
    return { result, multipliers };
}

/** All subsets of `items`, smallest first, each in the items' order. Deterministic. */
function subsets(items: readonly number[]): number[][] {
    const all: number[][] = [];
    for (let mask = 0; mask < 1 << items.length; mask++) {
        all.push(items.filter((_, j) => (mask & (1 << j)) !== 0));
    }
    return all.sort((x, y) => x.length - y.length);
}

/** Connected groups of bodies joined by the kept contacts, in order of their lowest body index. */
function groupsOf(bodyCount: number, contacts: readonly RestingContact[], kept: readonly boolean[]): number[][] {
    const root = Array.from({ length: bodyCount }, (_, i) => i);
    const find = (i: number): number => {
        let r = i;
        while (root[r] !== r) {
            r = root[r] as number;
        }
        return r;
    };
    contacts.forEach((c, k) => {
        if (kept[k] && !c.fixed) {
            const ra = find(c.a);
            const rb = find(c.b);
            root[Math.max(ra, rb)] = Math.min(ra, rb);
        }
    });
    const byRoot = new Map<number, number[]>();
    contacts.forEach((c, k) => {
        if (kept[k]) {
            for (const b of c.fixed ? [c.a] : [c.a, c.b]) {
                const group = byRoot.get(find(b)) ?? [];
                byRoot.set(find(b), group);
                if (!group.includes(b)) {
                    group.push(b);
                }
            }
        }
    });
    return [...byRoot.values()].map((g) => g.sort((x, y) => x - y)).sort((x, y) => (x[0] as number) - (y[0] as number));
}

/**
 * How far a solved active set is from consistent: the largest pull (negative contact force) or the fastest convergence
 * of an inactive contact, whichever is worse. At most ACCELERATION_EPSILON means consistent.
 */
function violation(
    system: ContactSystem,
    active: readonly number[],
    solved: { readonly result: Map<number, Vec3>; readonly multipliers: number[] },
    closingRate: (x: ReadonlyMap<number, Vec3>, k: number) => number,
): number {
    let worst = 0;
    for (const n of solved.multipliers) {
        worst = Math.max(worst, 0 - n);
    }
    for (const k of system.contacts) {
        if (!active.includes(k)) {
            worst = Math.max(worst, closingRate(solved.result, k));
        }
    }
    return worst;
}

/**
 * The nearest hold (P2a.1): every resting ball of the group stays at rest and the moving balls are solved against them
 * as fixed, frictionless, compression-only obstacles. That is the strictly convex quadratic programme
 * min Σ ½·wᵢ·|xᵢ − fᵢ|² over the moving balls subject to no contact converging, which x = 0 satisfies, so it has a
 * unique minimiser; its constraints are linear, so KKT multipliers with linearly independent support exist, and the
 * enumeration of active sets reaches that support. So it cannot fail; should rounding spoil every set, the least
 * inconsistent one is kept. The held balls do no work.
 */
function nearestHold(
    group: readonly number[],
    groupContacts: readonly number[],
    responses: ReadonlyMap<number, Response>,
    jacobian: (k: number, i: number) => Vec3,
    closingRate: (x: ReadonlyMap<number, Vec3>, k: number) => number,
): { readonly acceleration: Map<number, Vec3>; readonly active: readonly number[] } {
    const resting = new Set(group.filter((i) => (responses.get(i) as Response).phase === "stationary"));
    const system: ContactSystem = {
        bodies: group,
        contacts: groupContacts,
        jacobian: (k, i) => (resting.has(i) ? ZERO : jacobian(k, i)),
        inverseWeight: (i) => (resting.has(i) ? 0 : 1 / (responses.get(i) as Response).weight),
    };
    const base = new Map(group.map((i) => [i, (responses.get(i) as Response).force]));
    const trial = (
        active: readonly number[],
    ): { readonly active: readonly number[]; readonly x: Map<number, Vec3>; readonly worst: number } | null => {
        const solved = project(system, active, base);
        return solved ? { active, x: solved.result, worst: violation(system, active, solved, closingRate) } : null;
    };
    // The empty set has no multipliers to solve for, so it always projects.
    let best = trial([]) as NonNullable<ReturnType<typeof trial>>;
    for (const active of subsets(groupContacts).slice(1)) {
        if (best.worst <= ACCELERATION_EPSILON) {
            break;
        }
        const next = trial(active);
        if (next && next.worst < best.worst) {
            best = next;
        }
    }
    return { acceleration: best.x, active: best.active };
}

/** The member of a ball moved by the frictionless nearest hold (P2a.1's pushed motion). */
function frictionlessMember(s: BallState, r: Response, x: Vec3, radius: number): RestingMember {
    const still: PushMotion = { acceleration: ZERO, angularAcceleration: ZERO, direction: ZERO };
    if (r.phase === "airborne") {
        // A ball held still in the air by its contacts (perched on others) is snapped to rest: its rounding-level
        // acceleration would otherwise give it a segment that never ends, which the simulator could not schedule.
        if (length(s.velocity) <= SPEED_EPSILON && length(x) <= ACCELERATION_EPSILON) {
            return { state: { ...s, velocity: ZERO }, phase: "airborne", push: still };
        }
        return { state: s, phase: "airborne", push: { acceleration: x, angularAcceleration: ZERO, direction: ZERO } };
    }
    if (r.phase === "stationary") {
        return { state: s, phase: "stationary", push: still };
    }
    if (r.phase === "rolling") {
        return {
            state: s,
            phase: "rolling",
            push: {
                acceleration: x,
                angularAcceleration: vec3(-x.y / radius, x.x / radius, 0),
                direction: normalize(horizontal(s.velocity)),
            },
        };
    }
    // Sliding friction acts at the contact point, so it also spins the ball: dω/dt = (5/2r)·(fy, −fx, 0).
    const k = 5 / (2 * radius);
    return {
        state: s,
        phase: "sliding",
        push: {
            acceleration: x,
            angularAcceleration: vec3(k * r.force.y, -k * r.force.x, 0),
            direction: normalize(contactSlip(s, radius)),
        },
    };
}

/** The member of ball j of a group solved with friction: its phase and push (the state is the glued one). */
function frictionMember(model: Model, out: CandidateOutcome, j: number): RestingMember {
    const s = (model.bodies[j] as ContactBody).state;
    const ev = out.ev as Evaluated;
    const acceleration = ev.accel[j] as Vec3;
    const angularAcceleration = ev.spin[j] as Vec3;
    const itemDirection = (kind: "release" | "turf-onset"): Vec3 => {
        const q = out.items.findIndex((it) => it.kind === kind && it.index === j);
        return q >= 0 ? (out.directions[q] as Vec3) : ZERO;
    };
    const still: PushMotion = { acceleration: ZERO, angularAcceleration: ZERO, direction: ZERO };
    switch (out.cand.balls[j]) {
        case "held":
            return { state: s, phase: "stationary", push: still };
        case "released":
            return { state: s, phase: "rolling", push: { acceleration, angularAcceleration, direction: itemDirection("release") } };
        case "turf-rolling":
            return { state: s, phase: "rolling", push: { acceleration, angularAcceleration, direction: model.frozen[j] as Vec3 } };
        case "turf-sliding": {
            const direction = model.classes[j] === "sliding" ? (model.frozen[j] as Vec3) : itemDirection("turf-onset");
            return { state: s, phase: "sliding", push: { acceleration, angularAcceleration, direction } };
        }
        default:
            // In flight. A ball held still in the air by its contacts (perched on others) is snapped to rest, as above.
            if (
                model.classes[j] === "airborne" &&
                length(s.velocity) <= SPEED_EPSILON &&
                length(acceleration) <= ACCELERATION_EPSILON
            ) {
                return { state: { ...s, velocity: ZERO }, phase: "airborne", push: still };
            }
            return { state: s, phase: "airborne", push: { acceleration, angularAcceleration, direction: ZERO } };
    }
}

/** Contact j's frozen unit slip in a solved group, or null when it does not slip with friction. */
function slipOf(model: Model, out: CandidateOutcome, j: number): Vec3 | null {
    if (out.cand.contacts[j] !== "slip" || (model.contacts[j] as RestingContact).friction === 0) {
        return null;
    }
    const g = model.geometry[j] as ContactGeometry;
    if (g.slipping) {
        return g.sHat;
    }
    const q = out.items.findIndex((it) => it.kind === "contact-onset" && it.index === j);
    return q >= 0 ? (out.directions[q] as Vec3) : null;
}

/**
 * Decides which touching contacts push and how every ball involved moves until the next event. `contacts` must all be
 * touching and closing slower than RESTING_SPEED. A contact is kept when it is approaching or when the balls'
 * accelerations drive it together; contacts the solution leaves converging are added until none remain.
 */
export function solveRestingContacts(
    bodies: readonly ContactBody[],
    axes: readonly Vec3[],
    contacts: readonly RestingContact[],
    options: RestingOptions = {},
): RestingSolution {
    return solveContacts(bodies, axes, contacts, false, options);
}

/**
 * Solves as solveRestingContacts does, but with every group taken straight to the nearest hold: balls at rest stay at
 * rest and the moving balls are solved against them. Exported so that the fallback, which the exact search leaves
 * almost unused, can be tested on its own.
 */
export function solveNearestHold(
    bodies: readonly ContactBody[],
    axes: readonly Vec3[],
    contacts: readonly RestingContact[],
    options: RestingOptions = {},
): RestingSolution {
    return solveContacts(bodies, axes, contacts, true, options);
}

function solveContacts(
    bodies: readonly ContactBody[],
    axes: readonly Vec3[],
    contacts: readonly RestingContact[],
    toNearestHold: boolean,
    options: RestingOptions,
): RestingSolution {
    const gravity = options.gravity ?? vec3(0, 0, 0 - ((bodies[0] as ContactBody | undefined)?.params.gravity ?? 0));
    const budget = options.budget ?? Infinity;
    const work = { units: 0 };
    // Offset from ball a's centre to the body it touches: 3D for a ball, horizontal for an obstacle's axis.
    const towards = (c: RestingContact): Vec3 => {
        const a = (bodies[c.a] as ContactBody).state.position;
        return c.fixed ? horizontal(sub(axes[c.b] as Vec3, a)) : sub((bodies[c.b] as ContactBody).state.position, a);
    };
    const normals = contacts.map((c) => normalize(towards(c)));
    const airborne = bodies.map((b) => classify(b.state, b.params.radius) === "airborne");
    // Row k of J for body i: +n on the body n points to, −n on the other; only its horizontal part for a ball on the
    // turf, which cannot move vertically.
    const jacobian = (k: number, i: number): Vec3 => {
        const c = contacts[k] as RestingContact;
        const row = !c.fixed && c.b === i ? (normals[k] as Vec3) : c.a === i ? scale(normals[k] as Vec3, -1) : ZERO;
        return airborne[i] ? row : horizontal(row);
    };
    const closingRate = (x: ReadonlyMap<number, Vec3>, k: number): number => {
        const c = contacts[k] as RestingContact;
        const other = c.fixed ? ZERO : (x.get(c.b) ?? ZERO);
        return dot(sub(x.get(c.a) ?? ZERO, other), normals[k] as Vec3);
    };
    const converging = (states: readonly BallState[], acceleration: ReadonlyMap<number, Vec3>, k: number): boolean => {
        const c = contacts[k] as RestingContact;
        const a = states[c.a] as BallState;
        const velocity = c.fixed ? ZERO : (states[c.b] as BallState).velocity;
        const closing = approachSpeed(scale(towards(c), -1), sub(a.velocity, velocity));
        return closing > SPEED_EPSILON || closingRate(acceleration, k) > ACCELERATION_EPSILON;
    };
    const touches = (i: number, k: number): boolean => {
        const c = contacts[k] as RestingContact;
        return c.a === i || (!c.fixed && c.b === i);
    };

    const initial = bodies.map((b) => b.state);
    const freeAccelerations = new Map(bodies.map((b, i) => [i, response(b.state, b.params).force]));
    const kept = contacts.map((_, k) => converging(initial, freeAccelerations, k));

    for (;;) {
        const states = [...initial];
        const members: (RestingMember | null)[] = bodies.map(() => null);
        const modes: ContactMode[] = contacts.map(() => "open");
        const slips: (Vec3 | null)[] = contacts.map(() => null);
        const approximate = bodies.map(() => false);
        const approximateSlip = bodies.map(() => false);
        const budgetHold = bodies.map(() => false);
        let worstHold = 0;
        let slipExcess = 0;
        let searched = 0;
        const acceleration = new Map(freeAccelerations);

        for (const group of groupsOf(bodies.length, contacts, kept)) {
            const groupContacts = contacts
                .map((_, k) => k)
                .filter((k) => kept[k] && group.includes(contacts[k]?.a ?? -1));
            const params = (i: number): MotionParams => (bodies[i] as ContactBody).params;

            // Perfectly inelastic along every kept normal: the smallest change of velocity, weighted by effective
            // inertia, that stops each kept contact closing or opening. Dependent contacts are implied by the rest.
            // Static friction keeps a rolling or resting ball rolling through these small impulses, so its spin
            // follows its new velocity; a sliding ball keeps its spin.
            const before = new Map(group.map((i) => [i, response(initial[i] as BallState, params(i))]));
            const glueSystem: ContactSystem = {
                bodies: group,
                contacts: groupContacts,
                jacobian,
                inverseWeight: (i) => 1 / (before.get(i) as Response).weight,
            };
            const independent: number[] = [];
            for (const k of groupContacts) {
                if (project(glueSystem, [...independent, k], new Map(group.map((i) => [i, ZERO])))) {
                    independent.push(k);
                }
            }
            const glued = project(
                glueSystem,
                independent,
                new Map(group.map((i) => [i, (initial[i] as BallState).velocity])),
            );
            for (const i of group) {
                const s = initial[i] as BallState;
                const velocity = glued?.result.get(i) ?? s.velocity;
                const phase = (before.get(i) as Response).phase;
                const angularVelocity =
                    phase === "sliding" || phase === "airborne"
                        ? s.angularVelocity
                        : rollingSpin(velocity, s.angularVelocity.z, params(i).radius);
                states[i] = { position: s.position, velocity, angularVelocity };
            }

            // The group's model, its contacts renumbered to the group's balls.
            const local = new Map(group.map((i, j) => [i, j]));
            const model = buildModel(
                group.map((i) => ({ ...(bodies[i] as ContactBody), state: states[i] as BallState })),
                axes,
                groupContacts.map((k) => {
                    const c = contacts[k] as RestingContact;
                    return { ...c, a: local.get(c.a) as number, b: c.fixed ? c.b : (local.get(c.b) as number) };
                }),
                gravity,
            );
            const decision = toNearestHold ? null : solveGroup(model, work, budget, options.hooks);
            searched = Math.max(searched, decision?.tried ?? 0);
            const outcome = decision?.outcome ?? null;
            if (decision && outcome) {
                const ev = outcome.ev as Evaluated;
                groupContacts.forEach((k, j) => {
                    modes[k] = outcome.cand.contacts[j] as ContactMode;
                    slips[k] = slipOf(model, outcome, j);
                });
                if (decision.kind === "approximate-slip") {
                    slipExcess = Math.max(slipExcess, decision.excess);
                    for (const j of decision.slipBalls) {
                        approximateSlip[group[j] as number] = true;
                    }
                }
                group.forEach((i, j) => {
                    const s = states[i] as BallState;
                    acceleration.set(i, ev.accel[j] as Vec3);
                    const touched = groupContacts.some((k) => modes[k] !== "open" && touches(i, k));
                    members[i] = touched
                        ? frictionMember(model, outcome, j)
                        : { state: s, phase: classify(s, params(i).radius), push: null };
                });
                continue;
            }
            // The nearest hold: no exact solution was found, the budget is spent, or the caller asked for it.
            const responses = new Map(group.map((i) => [i, response(states[i] as BallState, params(i))]));
            const held = nearestHold(group, groupContacts, responses, jacobian, closingRate);
            for (const k of held.active) {
                // Coupled, without friction: no slip direction.
                modes[k] = "slip";
            }
            if (decision?.kind === "budget-hold") {
                for (const i of group) {
                    budgetHold[i] = true;
                }
            } else {
                worstHold = Math.max(worstHold, decision ? decision.excess : holdExcess(model, work));
                for (const i of group) {
                    approximate[i] = true;
                }
            }
            for (const i of group) {
                const s = states[i] as BallState;
                const r = responses.get(i) as Response;
                const x = held.acceleration.get(i) as Vec3;
                acceleration.set(i, x);
                members[i] = held.active.some((k) => touches(i, k))
                    ? frictionlessMember(s, r, x, params(i).radius)
                    : { state: s, phase: r.phase, push: null };
            }
        }

        const added = contacts.map((_, k) => !kept[k] && converging(states, acceleration, k));
        if (!added.includes(true)) {
            return {
                members,
                modes,
                slips,
                approximate,
                holdExcess: worstHold,
                approximateSlip,
                slipExcess,
                budgetHold,
                work: work.units,
                searched,
            };
        }
        added.forEach((a, k) => {
            kept[k] = kept[k] === true || a;
        });
    }
}

/** Returns the state of a coupled ball a time t after `start`. */
export function pushedState(start: BallState, push: PushMotion, t: number): BallState {
    if (t === 0) {
        return start;
    }
    const v = start.velocity;
    return {
        position: add(add(start.position, scale(v, t)), scale(push.acceleration, 0.5 * t * t)),
        velocity: add(v, scale(push.acceleration, t)),
        angularVelocity: add(start.angularVelocity, scale(push.angularAcceleration, t)),
    };
}

/** Returns the centre trajectory of a coupled ball from `start`. */
export function pushedTrajectory(start: BallState, push: PushMotion): Trajectory {
    return { c0: start.position, c1: start.velocity, c2: scale(push.acceleration, 0.5) };
}

/** Earliest t > 0 at which g0 + g1·t rises through zero from below, or Infinity. */
function risesAt(g0: number, g1: number): number {
    return g0 < 0 && g1 > 0 ? (0 - g0) / g1 : Infinity;
}

/**
 * How long a frozen direction d stays valid for a quantity x(t) = x0 + x1·t: until x reaches zero along d, or turns
 * more than DIRECTION_TOLERANCE away from it, measured along the unit `across` perpendicular to d.
 */
function frozenFor(x0: Vec3, x1: Vec3, d: Vec3, across: Vec3): number {
    const along0 = dot(x0, d);
    const along1 = dot(x1, d);
    const across0 = dot(x0, across);
    const across1 = dot(x1, across);
    return Math.min(
        risesAt(0 - along0, 0 - along1),
        risesAt(across0 - DIRECTION_TOLERANCE * along0, across1 - DIRECTION_TOLERANCE * along1),
        risesAt(0 - across0 - DIRECTION_TOLERANCE * along0, 0 - across1 - DIRECTION_TOLERANCE * along1),
    );
}

/**
 * Returns how long the frozen turf force of a coupled ball stays valid: until its slip (sliding) or velocity
 * (rolling) reaches zero along the frozen direction, or turns more than DIRECTION_TOLERANCE away from it. Both are
 * linear in time within the segment. Infinity for a ball held at rest or one that is only speeding up. A ball in
 * flight has no turf force; its push lasts until it lands.
 */
export function pushDuration(start: BallState, phase: MotionPhase, push: PushMotion, radius: number): number {
    if (phase === "stationary") {
        return Infinity;
    }
    if (phase === "airborne") {
        return landingTime(start.position.z - radius, start.velocity.z, push.acceleration.z);
    }
    const a = push.acceleration;
    const w = push.angularAcceleration;
    const x0 = phase === "sliding" ? contactSlip(start, radius) : horizontal(start.velocity);
    const x1 = phase === "sliding" ? vec3(a.x - radius * w.y, a.y + radius * w.x, 0) : horizontal(a);
    const d = push.direction;
    // In the plane, perpendicular to d: (d.y, −d.x, 0), so that x·across is P2a.1's x.x·d.y − x.y·d.x.
    return frozenFor(x0, x1, d, vec3(d.y, 0 - d.x, 0));
}

/**
 * Returns how long a slipping contact's frozen slip direction stays valid (design §5): until the slip of a's contact
 * point relative to b's, Pₜ[(v_a − v_b) + R·(ω_a + ω_b) × n] (linear in time within the segment), reaches zero along
 * the frozen unit `slip`, or turns more than DIRECTION_TOLERANCE away from it. Infinity when it only grows along it.
 * `b` and `pushB` are null against an obstacle.
 */
export function contactSlipDuration(
    a: BallState,
    pushA: PushMotion,
    b: BallState | null,
    pushB: PushMotion | null,
    normal: Vec3,
    slip: Vec3,
    radius: number,
): number {
    const tangential = (v: Vec3): Vec3 => sub(v, scale(normal, dot(v, normal)));
    const relative = (va: Vec3, wa: Vec3, vb: Vec3, wb: Vec3): Vec3 =>
        tangential(add(sub(va, vb), scale(cross(add(wa, wb), normal), radius)));
    const s0 = relative(a.velocity, a.angularVelocity, b?.velocity ?? ZERO, b?.angularVelocity ?? ZERO);
    const s1 = relative(
        pushA.acceleration,
        pushA.angularAcceleration,
        pushB?.acceleration ?? ZERO,
        pushB?.angularAcceleration ?? ZERO,
    );
    return frozenFor(s0, s1, slip, cross(normal, slip));
}
```

- [ ] **Step 5: Adapt the simulator to the new solution (contact friction still 0)**

In `src/engine/simulate.ts`:

1. Add, after `PLANE_TOLERANCE`:

```ts
/** The lawn is the plane z = 0 (v1), so every ball's turf normal is ẑ. */
const TURF_NORMAL = vec3(0, 0, 1);
```

2. In `restingComponent`, give every contact a friction coefficient. Replace the two `contacts.push(...)` calls with:

```ts
                contacts.push({ a: i, b: tracks.indexOf(b), fixed: false, friction: 0 });
```

```ts
                contacts.push({ a: i, b: obstacles.length - 1, fixed: true, friction: 0 });
```

and add this sentence to the end of the comment above `interface Component`: "Contact friction is 0 here until the
simulator schedules slip ends."

3. Replace `solveComponent`:

```ts
function solveComponent(sim: Simulation, component: Component, now: number): RestingSolution {
    return solveRestingContacts(
        component.tracks.map((t) => ({
            state: stateAt(t, now),
            params: t.params,
            turfNormal: TURF_NORMAL,
            pivotCapacity: Infinity,
        })),
        component.obstacles.map((o) => o.centre),
        component.contacts,
        { gravity: vec3(0, 0, 0 - sim.world.gravity) },
    );
}
```

4. In `settle`, call `solveComponent(sim, component, now)` and replace `if (solution.coupled[k]) {` with
   `if (solution.modes[k] !== "open") {`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/push.test.ts` then `npm test`, `npm run lint`, `npm run check`
Expected: all pass, the simulation suites unchanged (μ = 0 there). If a simulation test fails, compare the failing
group's P2a.1 and new solutions at μ = 0 before changing anything: they must agree except for a ball on the turf
loaded through an inclined normal. The slow cap measurement is `SLOW_TESTS=1 npx vitest run tests/engine/push.test.ts
-t "random four-ball"`; run it once and record the worst `searched` in the commit message.

- [ ] **Step 7: Commit**

```bash
npx prettier --write src/engine/push.ts src/engine/simulate.ts tests/engine/push.test.ts tests/engine/support/clusters.ts
git add src/engine/push.ts src/engine/simulate.ts tests/engine/push.test.ts tests/engine/support/clusters.ts
git commit -m "Solve resting contacts with load-coupled Coulomb friction"
```

---

### Task 8: Friction in the simulator

Switches contact friction on in the simulator and adds what it needs (design §5): slip ends, coupling modes with
stick/slip events, the per-shot work budget with `budget-hold`, the `approximate-slip` event, lift-off from the turf,
and `boundedGroupEnd` computed once per group. The engine version becomes 0.3.0. Every simulation test that assumed
frictionless pushes is re-derived with friction on, not loosened.

Slip ends use one mechanism for every phase: a track carries `slipEnd` (absolute time, Infinity when none), set after
`settle()` couples the solution's contacts, reset by every `reopen()`, raised by `findNextEvent` as a `regroup` and
included in `groupEnd`. (The design's "lower the duration" variant would need a second mechanism for balls in flight,
whose duration is their landing time; the design text is amended to match.)

**Files:**
- Modify: `src/engine/types.ts` (`ShotEvent`)
- Modify: `src/engine/motion.ts` (`landingTime`)
- Modify: `src/engine/simulate.ts`
- Test: `tests/engine/motion.test.ts`, `tests/engine/simulate.test.ts`, `tests/engine/lift.test.ts`,
  `tests/engine/fuzz.test.ts`

**Interfaces:**
- Consumes: Task 7 (`RestingSolution`, `contactSlipDuration`).
- Produces:
  - `ShotEvent` variants: `{ kind: "stick-ball"; t; balls: readonly [BallId, BallId] }`,
    `{ kind: "stick-obstacle"; t; ball; obstacleId }`, `{ kind: "slip-ball"; t; balls; direction: Vec3 }`,
    `{ kind: "slip-obstacle"; t; ball; obstacleId; direction: Vec3 }`,
    `{ kind: "approximate-slip"; t; balls: readonly BallId[]; excess: number }`,
    `{ kind: "budget-hold"; t; balls: readonly BallId[] }`. `balls` of a ball pair are in `BALL_IDS` order and
    `direction` is the unit slip of the first ball's contact point relative to the other body's.
  - `simulate.ts`: `ENGINE_VERSION = "0.3.0"`, `SOLVE_BUDGET`, `interface SolveProbe { before(): void;
    after(work: number, bodies: number): void }`, `interface SimulationOptions { solveBudget?: number; probe?:
    SolveProbe }`, `simulateFreeMotion(initial, world, maxEvents?, options?: SimulationOptions)`.

- [ ] **Step 1: Write the failing tests**

In `tests/engine/motion.test.ts`, add to `describe("landingTime")`:

```ts
    it("lets a ball on the plane at rest rise when its acceleration is upward (lift-off), and land otherwise", () => {
        expect(landingTime(0, 0, 4.9)).toBe(Infinity);
        expect(landingTime(0, 0, -g)).toBe(0);
        expect(landingTime(0, 0, 0)).toBe(0);
    });
```

In `tests/engine/simulate.test.ts`, replace "pushes a resting ball with a ball driven by topspin (analytic case)"
with:

```ts
    it("pushes a resting ball with a ball driven by topspin (analytic case)", () => {
        // Blue's contact point slips down on red, so friction μN lifts blue and loads red (L = g ∓ μN). With
        // c = (1 − μ − kμ)/(1 + μ·μs), k = 7/5·μr: A = (c·μs − k)·g/(7/5 + c) = 0.88187361562830 until blue's turf slip
        // ends at T = R·Ω/(A + 5/2·[μs·g + μN(1 − μs)]) = 0.32800687459199 (the contact slip would end later). Both then
        // roll at V = A·T uncoupled — N(1 − 7/5·μ·μr) = 0 — and stop together after V²/(2·ROLL):
        // travel A·T²/2 + V²/(2·ROLL) = 0.13276112270857 m.
        const world = testWorld();
        const result = simulateFreeMotion(
            { blue: ballAt(5, 5, vec3(0, 0, 0), vec3(0, 60, 0)), red: ballAt(5 + 2 * R, 5) },
            world,
        );
        const travel = 0.13276112270857;
        expect(result.rest.red?.x).toBeCloseTo(5 + 2 * R + travel, 9);
        expect(result.rest.blue?.x).toBeCloseTo(5 + travel, 9);
        expect(result.rest.red?.y).toBe(5);
        expect(result.events.filter((e) => e.kind === "ball-ball")).toEqual([
            { kind: "ball-ball", t: 0, balls: ["blue", "red"], resting: true },
        ]);
        expect(result.events.some((e) => e.kind.startsWith("stick") || e.kind.startsWith("slip"))).toBe(false);
        expect(result.segments.red?.[0]?.push?.acceleration.x).toBeCloseTo(0.8818736156283, 12);
        expect(result.aborted).toBe(false);
    });

    it("solves a straight push to rest in a handful of resting-contact solves (Review Focus 1)", () => {
        // Every straight push rubs vertically; the slip's end is a segment end like any other, not a regroup storm.
        // Here: the push at t = 0, and the regroup when blue's turf slip ends.
        let solves = 0;
        const probe = { before: (): void => undefined, after: (): void => void solves++ };
        simulateFreeMotion(
            { blue: ballAt(5, 5, vec3(0, 0, 0), vec3(0, 60, 0)), red: ballAt(5 + 2 * R, 5) },
            testWorld(),
            undefined,
            { probe },
        );
        expect(solves).toBeLessThanOrEqual(4);
    });
```

Add to `describe("invariants")`:

```ts
    it("never spins a ball about the vertical axis on the spot", () => {
        const result = simulateFreeMotion(complex, hoopWorld);
        for (const id of BALL_IDS) {
            for (const s of result.segments[id] ?? []) {
                if (s.phase === "stationary") {
                    expect(s.start.angularVelocity, `${id} at ${s.t0}`).toEqual(vec3(0, 0, 0));
                }
            }
        }
    });
```

Add a new `describe` at the end of `tests/engine/simulate.test.ts`:

```ts
describe("the solver's work budget (Review Focus 4)", () => {
    it("holds every group after the budget is spent, with budget-hold events, and still finishes", () => {
        const spent: number[] = [];
        const probe = { before: (): void => undefined, after: (work: number): void => void spent.push(work) };
        const complex: BallStates = {
            blue: ballAt(15.1713, 14.6246, vec3(0, 0, 0), vec3(-114.6, -35.5, 0)),
            red: ballAt(15.144, 14.713),
        };
        const world = testWorld({ hoops: [testHoop("6", 15, 15)] });
        const result = simulateFreeMotion(complex, world, undefined, { solveBudget: 1, probe });
        expect(result.aborted).toBe(false);
        const holds = result.events.filter((e) => e.kind === "budget-hold");
        expect(holds.length).toBeGreaterThan(0);
        expect(result.events.some((e) => e.kind === "approximate-hold")).toBe(false);
        // The first solve spends past the budget of 1 unit; every later one spends nothing.
        expect(spent[0]).toBeGreaterThan(1);
        expect(spent.slice(1).every((w) => w === 0)).toBe(true);
    });

    it("is never reached by the scenarios of this suite at the default budget", () => {
        const world = testWorld({ hoops: [testHoop("5", 15, 25), testHoop("6", 15, 15)] });
        const result = simulateFreeMotion(
            {
                blue: ballAt(15.1713, 14.6246, vec3(0, 0, 0), vec3(-114.6, -35.5, 0)),
                red: ballAt(15.144, 14.713),
                black: rollingBallAt(12, 17, 1.5, 0.5),
                yellow: ballAt(13.5, 17.5),
            },
            world,
        );
        expect(result.events.some((e) => e.kind === "budget-hold")).toBe(false);
    });
});
```

In `tests/engine/lift.test.ts`, add a new `describe` after "resting contact in flight":

```ts
describe("lift-off and stick in pushes", () => {
    it("lifts a ball off the turf when push friction takes its load, and lands it later (Review Focus 3)", () => {
        // μ = 4 between the balls (μ·μs > 1): red, backspun into blue's topspin, cannot stay on the turf and is solved
        // airborne at z = R with upward acceleration. It must rise, not land at the instant it lifts.
        const world = testWorld({ ballBall: { restitution: 0.8, friction: 4 } });
        const result = simulateFreeMotion(
            { blue: ballAt(5, 5, vec3(0, 0, 0), vec3(0, 60, 0)), red: ballAt(5 + 2 * R, 5, vec3(0, 0, 0), vec3(0, -80, 0)) },
            world,
        );
        expect(result.aborted).toBe(false);
        const lifted = result.segments.red?.[0];
        expect(lifted?.phase).toBe("airborne");
        expect(lifted?.push?.acceleration.z).toBeCloseTo(4.903325, 9);
        expect(highest(result, "red")).toBeGreaterThan(1e-6);
        const landed = landings(result, "red");
        expect(landed.length).toBeGreaterThan(0);
        expect(landed[0]).toBeGreaterThan(0);
        expect(result.rest.red?.z).toBe(R);
    });

    it("sticks a contact whose slip reaches zero, slips it again once, and comes to rest (Review Focus 5)", () => {
        // Blue's topspin and red's slightly stronger backspin drive the pair into each other (N = μs·g); the vertical
        // contact slip R·ΔΩ decays at 5μN(1 − μs), so the contact sticks at R·ΔΩ/(5μ·μs·g(1 − μs)) = 0.0893466 s, and
        // slips again when blue starts to roll (0.3778 s). They come to rest touching, at 5.001323 and 5.093323.
        const result = simulateFreeMotion(
            { blue: ballAt(5, 5, vec3(0, 0, 0), vec3(0, 60, 0)), red: ballAt(5 + 2 * R, 5, vec3(0, 0, 0), vec3(0, -61, 0)) },
            testWorld(),
        );
        expect(result.aborted).toBe(false);
        const changes = result.events.filter((e) => e.kind.startsWith("stick") || e.kind.startsWith("slip"));
        expect(changes.map((e) => e.kind)).toEqual(["stick-ball", "slip-ball"]);
        expect(changes[0]?.t).toBeCloseTo(0.089346563423, 9);
        expect(changes[1]?.t).toBeCloseTo(0.377846616715, 9);
        expect(result.rest.blue?.x).toBeCloseTo(5.001323, 6);
        expect(result.rest.red?.x).toBeCloseTo(5.093323, 6);
    });
});
```

(The lift-off acceleration is the planning ledger's testWorld value: red in flight with N = 3g/8 and a = (3g/8, 0, g/2).)

In `tests/engine/fuzz.test.ts`, replace the `approximate-hold` assertion with:

```ts
                expect(
                    result.events.filter(
                        (e) => e.kind === "approximate-hold" || e.kind === "approximate-slip" || e.kind === "budget-hold",
                    ),
                    label,
                ).toEqual([]);
```

and the test title's "holding approximately" with "falling back".

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/motion.test.ts tests/engine/simulate.test.ts tests/engine/lift.test.ts`
Expected: FAIL — `landingTime(0, 0, 4.9)` is 0; the topspin push still travels the frictionless 0.1517 m; the probe and
`solveBudget` options do not exist (type errors in `npm run check`).

- [ ] **Step 3: Let a ball on the plane rise (`motion.ts`)**

In `landingTime`, replace

```ts
    if (h === 0 && rise <= 0) {
        return 0;
    }
```

with

```ts
    // A ball on the plane comes down at once unless it rises, or is at rest with an upward acceleration (a turf ball a
    // push lifts off, spec §5), which never comes down within the segment.
    if (h === 0 && (rise < 0 || (rise === 0 && fall <= 0))) {
        return 0;
    }
```

- [ ] **Step 4: Add the events (`types.ts`)**

In `src/engine/types.ts`, add to the `ShotEvent` union, after the `approximate-hold` variant:

```ts
    | {
          /** A coupled ball–ball contact stuck (its slip reached zero and static friction now holds it). */
          readonly kind: "stick-ball";
          readonly t: number;
          readonly balls: readonly [BallId, BallId];
      }
    | { readonly kind: "stick-obstacle"; readonly t: number; readonly ball: BallId; readonly obstacleId: string }
    | {
          /**
           * A coupled ball–ball contact started to slip. `direction` is the unit slip of the first ball's contact point
           * relative to the second's, in world coordinates (balls in BALL_IDS order).
           */
          readonly kind: "slip-ball";
          readonly t: number;
          readonly balls: readonly [BallId, BallId];
          readonly direction: Vec3;
      }
    | {
          /** As slip-ball, against an obstacle: the ball's contact point relative to the obstacle. */
          readonly kind: "slip-obstacle";
          readonly t: number;
          readonly ball: BallId;
          readonly obstacleId: string;
          readonly direction: Vec3;
      }
    | {
          /**
           * The slip direction of a contact or turf slip that starts could not be solved; it slips against the static
           * force it carried instead (spec §5 limitations). `excess` is the residual (m/s²) of the failed solve.
           */
          readonly kind: "approximate-slip";
          readonly t: number;
          readonly balls: readonly BallId[];
          readonly excess: number;
      }
    | {
          /**
           * The shot's resting-contact work budget was spent, so the group was held as by approximate-hold (its resting
           * balls kept at rest) without being solved. `balls` are the group's resting balls.
           */
          readonly kind: "budget-hold";
          readonly t: number;
          readonly balls: readonly BallId[];
      }
```

- [ ] **Step 5: Wire friction, modes, slip ends and the budget into the simulator (`simulate.ts`)**

1. Version and budget, replacing `ENGINE_VERSION`:

```ts
/** Version of the physics; recorded in every result and share link. */
export const ENGINE_VERSION = "0.3.0";

/**
 * Work units (see linalg.ts) the resting-contact solver may spend in one shot (design §5). Fixed from the prototype's
 * costs at about 100 ms on the reference tablet (2020 entry iPad, taken as 3× slower than the development machine):
 * the prototype spent 1.50e-6 ms per unit over 3,000 adversarial four-ball clusters on an Apple M4, so 33 ms is
 * 22 million units. Realistic play's worst shot (a cannon with 864 re-solves) spent 3.5 million, a sixth of it.
 * Realistic solves are tiny and cost more time per unit (overhead), so this bounds the pathological search, not
 * chatter, whose cost P5 measures. Counting work, not time, keeps results identical on every device.
 */
export const SOLVE_BUDGET = 22_000_000;

/** Measurement seam: called around every resting-contact solve (scripts/shotMix.ts times solves with it). */
export interface SolveProbe {
    before(): void;
    after(work: number, bodies: number): void;
}

/** Options of a simulation. */
export interface SimulationOptions {
    /** Work units the resting-contact solver may spend in the shot; SOLVE_BUDGET when omitted. */
    readonly solveBudget?: number;
    readonly probe?: SolveProbe;
}
```

2. `Track` gains, after `duration`:

```ts
    /**
     * Absolute time at which a slipping contact of the track's push stops being valid (its slip reaches zero along
     * the frozen direction or turns from it), or Infinity. Reset by every reopen.
     */
    slipEnd: number;
```

and `Coupling` gains `readonly mode: "stick" | "slip";`. `Simulation` gains `readonly budget: number;`,
`work: number;` and `readonly probe: SolveProbe | null;`.

3. In `reopen`, create the track with `slipEnd: Infinity` and set `next.slipEnd = Infinity;` beside `next.push = push;`.

4. Replace `groupEnd`:

```ts
/** Returns when the earliest segment of the track's coupled group ends, a slip end included. */
function groupEnd(sim: Simulation, track: Track): number {
    return Math.min(...groupOf(sim, [track]).map((t) => Math.min(t.t0 + t.duration, t.slipEnd)));
}
```

5. In `restingComponent`, give each contact its materials' friction (removing the sentence added in Task 7):

```ts
                contacts.push({ a: i, b: tracks.indexOf(b), fixed: false, friction: sim.world.ballBall.friction });
```

```ts
                contacts.push({ a: i, b: obstacles.length - 1, fixed: true, friction: o.material.friction });
```

6. `solveComponent` passes the remaining budget and reports work:

```ts
function solveComponent(sim: Simulation, component: Component, now: number): RestingSolution {
    sim.probe?.before();
    const solution = solveRestingContacts(
        component.tracks.map((t) => ({
            state: stateAt(t, now),
            params: t.params,
            turfNormal: TURF_NORMAL,
            pivotCapacity: Infinity,
        })),
        component.obstacles.map((o) => o.centre),
        component.contacts,
        { gravity: vec3(0, 0, 0 - sim.world.gravity), budget: sim.budget - sim.work },
    );
    sim.work += solution.work;
    sim.probe?.after(solution.work, component.tracks.length);
    return solution;
}
```

7. Replace `settle`:

```ts
/** The couplings of every group containing one of `tracks`: what release() would drop. */
function couplingsOf(sim: Simulation, tracks: readonly Track[]): Coupling[] {
    const group = groupOf(sim, tracks);
    return sim.couplings.filter((c) => group.includes(c.a));
}

/** Track ids in BALL_IDS order. */
function canonical(tracks: readonly Track[]): BallId[] {
    return BALL_IDS.filter((id) => tracks.some((t) => t.id === id));
}

/**
 * Resolves the resting contacts around `seeds`: uncouples every group involved, solves the component again and
 * couples the contacts the solution keeps, with their modes. A contact whose mode changed since the previous solve
 * (`previous`, the couplings before release; taken here unless the caller released already) raises a stick or slip
 * event; its first coupling does not (its resting contact event marks it). Each slipping contact bounds its members'
 * segments by its slip end.
 */
function settle(sim: Simulation, seeds: readonly Track[], now: number, previous: readonly Coupling[] | null = null): void {
    const component = restingComponent(sim, seeds, now);
    const before = previous ?? couplingsOf(sim, component.tracks);
    release(sim, component.tracks, now);
    const solution = solveComponent(sim, component, now);
    component.tracks.forEach((track, i) => {
        const member = solution.members[i];
        if (member) {
            reopen(sim, track, track.id, member.state, now, { phase: member.phase, push: member.push });
        }
    });
    const R = sim.world.ball.radius;
    component.contacts.forEach((c, k) => {
        const mode = solution.modes[k] as ContactMode;
        if (mode === "open") {
            return;
        }
        const a = component.tracks[c.a] as Track;
        const b = c.fixed ? null : (component.tracks[c.b] as Track);
        const obstacle = c.fixed ? (component.obstacles[c.b] as Cylinder) : null;
        sim.couplings.push({ a, b, obstacle, mode });
        const slip = solution.slips[k] ?? null;
        // The slip end: the members' pushes are the solution's, from their states now.
        const ma = solution.members[c.a];
        const mb = c.fixed ? null : solution.members[c.b];
        if (slip && ma?.push && (c.fixed || mb?.push)) {
            const normal = obstacle
                ? normalize(horizontal(sub(obstacle.centre, ma.state.position)))
                : normalize(sub((mb as RestingMember).state.position, ma.state.position));
            const end =
                now +
                contactSlipDuration(ma.state, ma.push, mb?.state ?? null, mb?.push ?? null, normal, slip, R);
            a.slipEnd = Math.min(a.slipEnd, end);
            if (b) {
                b.slipEnd = Math.min(b.slipEnd, end);
            }
        }
        const was = before.find(
            (p) => (p.a === a && p.b === b && p.obstacle === obstacle) || (b !== null && p.a === b && p.b === a),
        );
        // Only a change with friction is reported: a frictionless coupling (or one the nearest hold made) has no slip.
        if (!was || was.mode === mode || (mode === "slip" && !slip)) {
            return;
        }
        if (b) {
            const first = BALL_IDS.indexOf(a.id) < BALL_IDS.indexOf(b.id);
            const balls: readonly [BallId, BallId] = first ? [a.id, b.id] : [b.id, a.id];
            sim.events.push(
                mode === "stick"
                    ? { kind: "stick-ball", t: now, balls }
                    : { kind: "slip-ball", t: now, balls, direction: first ? (slip as Vec3) : scale(slip as Vec3, -1) },
            );
        } else {
            const obstacleId = (obstacle as Cylinder).id;
            sim.events.push(
                mode === "stick"
                    ? { kind: "stick-obstacle", t: now, ball: a.id, obstacleId }
                    : { kind: "slip-obstacle", t: now, ball: a.id, obstacleId, direction: slip as Vec3 },
            );
        }
    });
    // Reported here rather than on a contact event: regroups re-solve too, and they have no contact event.
    const flagged = (flags: readonly boolean[]): Track[] => component.tracks.filter((_, i) => flags[i] === true);
    const held = flagged(solution.approximate);
    if (held.length > 0) {
        sim.events.push({ kind: "approximate-hold", t: now, balls: canonical(held), excess: solution.holdExcess });
    }
    const slipped = flagged(solution.approximateSlip);
    if (slipped.length > 0) {
        sim.events.push({ kind: "approximate-slip", t: now, balls: canonical(slipped), excess: solution.slipExcess });
    }
    const budgeted = flagged(solution.budgetHold);
    if (budgeted.length > 0) {
        const resting = budgeted.filter((t) => t.phase === "stationary");
        sim.events.push({ kind: "budget-hold", t: now, balls: canonical(resting) });
    }
}
```

Add `ContactMode`, `RestingMember` (types) and `contactSlipDuration` to the import from `./push`.

8. In `findNextEvent`, compute each group's bound once and raise slip ends. Replace

```ts
    const ends = new Map(live.map((t) => [t, boundedGroupEnd(sim, t, now)]));
```

with

```ts
    // One bound per coupled group (every member shares it), not one per track.
    const ends = new Map<Track, number>();
    for (const t of live) {
        if (!ends.has(t)) {
            const end = boundedGroupEnd(sim, t, now);
            for (const member of groupOf(sim, [t])) {
                ends.set(member, end);
            }
        }
    }
```

and in the first loop over `live`, after the transition/regroup candidate, add:

```ts
        // A slipping contact's end regroups in every phase, in flight included (its duration is its landing).
        if (Number.isFinite(track.slipEnd)) {
            best = earlier(best, { time: track.slipEnd, kind: "regroup", track });
        }
```

9. In the `landing` case, snapshot the couplings before the handler's own release and pass them on:

```ts
            case "landing": {
                const { track } = next;
                const group = groupOf(sim, [track]);
                const previous = couplingsOf(sim, group);
                const s = stateAt(track, now);
                release(sim, group, now);
                const R = world.ball.radius;
                const touchdown = { ...s, position: vec3(s.position.x, s.position.y, R) };
                reopen(sim, track, track.id, resolveLanding(touchdown, world.ball, sim.turf(touchdown.position)), now);
                sim.events.push({ kind: "landing", t: now, ball: track.id });
                if (previous.length > 0) {
                    settle(sim, group, now, previous);
                }
                break;
            }
```

10. `simulateFreeMotion` takes the options and seeds the counters:

```ts
export function simulateFreeMotion(
    initial: BallStates,
    world: World,
    maxEvents: number = DEFAULT_MAX_EVENTS,
    options: SimulationOptions = {},
): ShotResult {
    validateWorld(world);
    const sim: Simulation = {
        world,
        obstacles: obstaclesOf(world),
        tracks: [],
        couplings: [],
        events: [],
        turf: (position) => turfAt(world, position),
        budget: options.solveBudget ?? SOLVE_BUDGET,
        work: 0,
        probe: options.probe ?? null,
    };
```

Update the module comment's second paragraph: resting contacts are solved "with Coulomb friction (push.ts)"; a
coupled contact is held "until one of the pushed balls changes phase, a slipping contact's slip ends, the contact
opens, or another contact intervenes".

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`, then `npm run lint`, `npm run check`, `npm run format:check`
Expected: all pass. `crossCheck.test.ts` still passes: its pushing scenarios run frictionless (`FRICTIONLESS`), and
Task 9 removes that. If an existing qualitative limit (an event count in `lift.test.ts` or `simulate.test.ts`) is now
exceeded, report the new count and the scenario; do not raise the limit without approval.

- [ ] **Step 7: Commit**

```bash
npx prettier --write src/engine/types.ts src/engine/motion.ts src/engine/simulate.ts tests/engine/motion.test.ts \
    tests/engine/simulate.test.ts tests/engine/lift.test.ts tests/engine/fuzz.test.ts
git add src/engine/types.ts src/engine/motion.ts src/engine/simulate.ts tests/engine/motion.test.ts \
    tests/engine/simulate.test.ts tests/engine/lift.test.ts tests/engine/fuzz.test.ts
git commit -m "Simulate pushes with friction, slip ends, stick/slip events and a work budget"
```

---

### Task 9: Brute force with load coupling and the twist lock; the cross-check in the standard world

Brute force gets the physics of design §3 (prototyped and checked: the P2a.1 cross-check passed 12/12 with it, deltas
0.000 µm): turf forces scale with each ball's load from the previous step's push impulses (collisions never scale
them), and a push leaves a non-slipping ball's spin about the vertical unchanged. Then the cross-check drops its
frictionless overrides (exit criterion 2), gains the design's new scenarios, and the slow brute-force checks confirm
the release onsets.

**Files:**
- Replace: `tests/engine/support/bruteForce.ts`
- Modify: `tests/engine/crossCheck.test.ts`

**Interfaces:**
- Produces: `bruteForce(initial, world, dt, maxTime)` unchanged in signature.

- [ ] **Step 1: Write the failing tests**

In `tests/engine/crossCheck.test.ts`:

1. Delete the `FRICTIONLESS` constant and its comment, and every `world: FRICTIONLESS` line, so every scenario runs in
   the standard world.
2. Add these scenarios to `SCENARIOS` (after the wedge):

```ts
    "push against an upright, rolling round it": {
        // Red pushed into an upright 35° round it: well past the holding band (20.29°–20.45°), red rolls round it,
        // rubbing.
        initial: { blue: ballAt(5, 5, vec3(0, 0, 0), vec3(0, 60, 0)), red: ballAt(5 + 2 * R, 5) },
        world: { peg: upright(35) },
    },
    "push into a line bent by 60° (a contact starts to slip)": {
        initial: {
            blue: ballAt(5, 5, vec3(0, 0, 0), vec3(0, 60, 0)),
            red: ballAt(5 + 2 * R, 5),
            black: ballAt(5 + 2 * R + 2 * R * 0.5, 5 + 2 * R * C30),
        },
    },
    "topspin rebound off the peg, checking, then rolling back into it": {
        // Real play: a ball with four times rolling topspin hits the peg, rebounds, slides in place while its spin
        // turns it round, then rolls forward into the peg again.
        initial: { blue: ballAt(15, 19.9, vec3(0, 1, 0), vec3(-4 / R, 0, 0)) },
    },
    "topspin into backspin: the contact sticks, then slips": {
        // As lift.test's stick case: the contact sticks at 0.0893 s and slips again at 0.3778 s.
        initial: {
            blue: ballAt(5, 5, vec3(0, 0, 0), vec3(0, 60, 0)),
            red: ballAt(5 + 2 * R, 5, vec3(0, 0, 0), vec3(0, -61, 0)),
        },
    },
```

with, after the constants:

```ts
/** The peg replaced by an upright (radius 8 mm, μ 0.1) standing `degrees` round red (at (5 + 2R, 5)) from +x. */
function upright(degrees: number): Cylinder {
    const angle = (degrees * Math.PI) / 180;
    const d = R + 0.008;
    return {
        id: "peg",
        centre: vec3(5 + 2 * R + d * Math.cos(angle), 5 + d * Math.sin(angle), 0),
        radius: 0.008,
        material: { restitution: 0.6, friction: 0.1 },
    };
}
```

(import `Cylinder` from `../../src/engine/types`).

3. In "exercises the contacts each scenario is named after", replace the wedge assertion with:

```ts
        const wedge = kinds("push into two touching balls at an angle (wedge)");
        expect(wedge).toContain("blue-red resting");
        for (const fallback of ["approximate-hold", "approximate-slip", "budget-hold"]) {
            expect(wedge).not.toContain(fallback);
        }
```

and add:

```ts
        const rub = kinds("push against an upright, rolling round it");
        expect(rub).toContain("blue-red resting");
        expect(rub).toContain("ball-obstacle");
        expect(kinds("push into a line bent by 60° (a contact starts to slip)")).toContain("blue-red resting");
        // The rebound's sequence: hit, check (slide), roll forward, hit again, and finally rest.
        const rebound = simulateFreeMotion(SCENARIOS["topspin rebound off the peg, checking, then rolling back into it"]
            ?.initial as BallStates, testWorld()).events;
        const hits = rebound.filter((e) => e.kind === "ball-obstacle").map((e) => e.t);
        expect(hits.length).toBeGreaterThanOrEqual(2);
        const between = rebound
            .filter((e) => e.kind === "phase" && e.t > (hits[0] as number) && e.t < (hits[1] as number))
            .map((e) => (e as { phase: string }).phase);
        expect(between).toContain("sliding");
        expect(between.lastIndexOf("rolling")).toBeGreaterThan(between.indexOf("sliding"));
        const phases = rebound.filter((e) => e.kind === "phase").map((e) => (e as { phase: string }).phase);
        expect(phases[phases.length - 1]).toBe("stationary");
        const stick = kinds("topspin into backspin: the contact sticks, then slips");
        expect(stick).toContain("stick-ball");
        expect(stick).toContain("slip-ball");
```

4. Add the slow brute-force limit checks at the end of the file:

```ts
/**
 * Brute force confirms the release onsets of design §6 (it cannot confirm hold limits: its friction follows the
 * momentary slip, so it never realises the static-optimal direction and lands at the bottom of the static/kinetic
 * band). "Held" is a_eff = 4·(d(H) − 2·d(H/2))/H² < 1e-5 m/s² for red's displacement d: a displacement threshold would
 * misread the steady creep that restitution chatter causes (first order in dt). The onset is the zero of a line
 * fitted to a_eff past it, extrapolated linearly to dt = 0 over dt 4e-6, 2e-6 and 1e-6.
 */
describe.skipIf(!process.env.SLOW_TESTS)("brute-force release onsets (slow)", () => {
    const H = 0.25;
    function aEff(setup: (angle: number) => { initial: BallStates; world: World }, degrees: number, dt: number): number {
        const { initial, world } = setup((degrees * Math.PI) / 180);
        const start = (initial.red as BallState).position;
        const moved = (h: number): number => length(sub(bruteForce(initial, world, dt, h).red as Vec3, start));
        return (4 * (moved(H) - 2 * moved(H / 2))) / (H * H);
    }
    /** The angle (degrees) at which a_eff, fitted linearly over `angles`, reaches zero. */
    function zeroOf(values: readonly number[], angles: readonly number[]): number {
        const n = angles.length;
        const mx = angles.reduce((s, x) => s + x, 0) / n;
        const my = values.reduce((s, y) => s + y, 0) / n;
        let sxy = 0;
        let sxx = 0;
        angles.forEach((x, i) => {
            sxy += (x - mx) * ((values[i] as number) - my);
            sxx += (x - mx) * (x - mx);
        });
        const slope = sxy / sxx;
        return mx - my / slope;
    }
    function onset(setup: (angle: number) => { initial: BallStates; world: World }, expected: number): number {
        const steps = [4e-6, 2e-6, 1e-6];
        const angles = [0.05, 0.1, 0.15, 0.2, 0.25].map((d) => expected + d);
        const zeros = steps.map((dt) => {
            expect(aEff(setup, expected - 0.05, dt), `held below, dt ${dt}`).toBeLessThan(1e-5);
            return zeroOf(
                angles.map((a) => aEff(setup, a, dt)),
                angles,
            );
        });
        // Linear in dt: the intercept at dt = 0 of the least-squares line through (dt, onset).
        const n = steps.length;
        const mx = steps.reduce((s, x) => s + x, 0) / n;
        const my = zeros.reduce((s, y) => s + y, 0) / n;
        let sxy = 0;
        let sxx = 0;
        steps.forEach((x, i) => {
            sxy += (x - mx) * ((zeros[i] as number) - my);
            sxx += (x - mx) * (x - mx);
        });
        return my - (sxy / sxx) * mx;
    }

    it("releases the bent line at θ_slip = 52.1888955°", { timeout: 3_600_000 }, () => {
        const line = (theta: number): { initial: BallStates; world: World } => ({
            world: testWorld({
                lawn: uniformLawn(30, 40, { slidingFriction: 3 / STANDARD_GRAVITY, rollingResistance: 1.5 / STANDARD_GRAVITY }),
            }),
            initial: {
                blue: ballAt(5, 5, vec3(0, 0, 0), vec3(0, 60, 0)),
                red: ballAt(5 + 2 * R, 5),
                black: ballAt(5 + 2 * R + 2 * R * Math.cos(theta), 5 + 2 * R * Math.sin(theta)),
            },
        });
        expect(Math.abs(onset(line, 52.1888955) - 52.1888955)).toBeLessThan(0.002);
    });

    it("releases red from the upright at β_slip = 20.290321024°", { timeout: 3_600_000 }, () => {
        const pushed = (beta: number): { initial: BallStates; world: World } => ({
            world: testWorld({ peg: upright((beta * 180) / Math.PI) }),
            initial: { blue: ballAt(5, 5, vec3(0, 0, 0), vec3(0, 60, 0)), red: ballAt(5 + 2 * R, 5) },
        });
        expect(Math.abs(onset(pushed, 20.290321024) - 20.290321024)).toBeLessThan(0.002);
    });
});
```

Add the imports this needs: `type BallState`, `type World` (already) from types, `type Vec3` from vec3, `uniformLawn`,
`STANDARD_GRAVITY` from `../../src/engine/world`.

- [ ] **Step 2: Run the cross-check to verify it fails**

Run: `npx vitest run tests/engine/crossCheck.test.ts`
Expected: FAIL — the pushing scenarios now disagree with the old brute force by more than 1 mm (it neither scales turf
forces with load nor locks the twist).

- [ ] **Step 3: Replace `tests/engine/support/bruteForce.ts`**

```ts
/**
 * Reference integrator for cross-checking the event-driven solver. Integrates the turf forces and flight with
 * semi-implicit Euler at a fixed step and detects contacts and landings by overlap. Test-only and deliberately slow.
 *
 * It shares `resolveBallBall`/`resolveBallCylinder`/`resolveLanding` with the engine, so it independently checks event
 * timing, flight and pushing but not the impulse model, which resolve.test.ts covers directly. Pushing is integrated
 * as many small impulses; each one's downward part is taken by the turf with its impulsive turf friction, so the turf's
 * friction tracks the load a push puts on a ball step by step. The next step's turf forces then scale with the load
 * L = g − (upward push impulse in this step)/dt (spec §5): rolling resistance by max(L, 0)/g, sliding friction by
 * min(max(L, 0), g)/g, since a downward impulse already carried its own impulsive turf friction.
 *
 * Only pushes load the turf this way, not collisions: a collision's impulse is not a force sustained over the step,
 * and the engine resolves it whole in resolve.ts (an impulse cannot reduce the turf's load). A contact is a push when it
 * persists — the pair overlapped, or was within RESTING_SPEED·dt of touching, at the previous step's contact check —
 * and closes slower than RESTING_SPEED before this step's impulse.
 *
 * Twist lock (spin about the vertical axis): while a ball's turf contact patch does not slip, at rest or rolling, the
 * grass holds its spin about the vertical (unlimited torque); only a sliding or airborne ball's is free. The patch is
 * classified by the engine's `classify` on the state the impulses meet (after step()), and a push's impulse then
 * leaves a locked ball's spin about the vertical unchanged. Collisions change it as resolve.ts says: no finite patch
 * torque resists an impulsive twist, and the engine shares that impulse model.
 */
import { approachSpeed } from "../../../src/engine/detect";
import {
    ZERO,
    add,
    cross,
    dot,
    horizontal,
    length,
    normalize,
    scale,
    sub,
    vec3,
    type Vec3,
} from "../../../src/engine/math/vec3";
import { classify, contactSlip, onTurf, rollingSpin } from "../../../src/engine/motion";
import { RESTING_SPEED } from "../../../src/engine/push";
import { resolveBallBall, resolveBallCylinder, resolveLanding } from "../../../src/engine/resolve";
import {
    BALL_IDS,
    type BallId,
    type BallState,
    type BallStates,
    type ContactMaterial,
    type World,
} from "../../../src/engine/types";
import { motionParamsAt, obstaclesOf, turfAt } from "../../../src/engine/world";

const STOP_SPEED = 1e-9;

function fly(s: BallState, world: World, dt: number): BallState {
    const R = world.ball.radius;
    const velocity = add(s.velocity, vec3(0, 0, 0 - world.gravity * dt));
    const position = add(s.position, scale(velocity, dt));
    if (position.z > R) {
        return { position, velocity, angularVelocity: s.angularVelocity };
    }
    // Landed within the step: back on the turf, with the engine's landing impulse.
    const touchdown = { position: vec3(position.x, position.y, R), velocity, angularVelocity: s.angularVelocity };
    return resolveLanding(touchdown, world.ball, turfAt(world, touchdown.position));
}

/**
 * One step of turf motion. `load` is the ball's turf load ratio L/g, clamped: rolling resistance scales with
 * max(load, 0); sliding friction and the slip-end threshold only with min(max(load, 0), 1), since a downward contact
 * impulse already carried its own impulsive turf friction (`turfFriction` in resolve.ts). A negative load would
 * reverse both forces.
 */
function step(s: BallState, world: World, dt: number, load: number): BallState {
    const R = world.ball.radius;
    if (!onTurf(s, R)) {
        return fly(s, world, dt);
    }
    const base = motionParamsAt(world, s.position);
    const p = {
        slidingDecel: base.slidingDecel * Math.min(Math.max(load, 0), 1),
        rollingDecel: base.rollingDecel * Math.max(load, 0),
    };
    const slip = contactSlip(s, R);
    let velocity: Vec3;
    let angularVelocity: Vec3;
    if (length(slip) > STOP_SPEED && length(slip) <= 3.5 * p.slidingDecel * dt) {
        // Friction removes slip at 7/2·a, so this slip ends within the step: the ball loses exactly 2/7 of it and
        // rolls. (Applying a full step of friction here would reverse the slip; contact pushes create such small
        // slips every step.) Rolling resistance acts for the step as well, stopping rather than reversing.
        const rolled = sub(s.velocity, scale(slip, 2 / 7));
        const d = normalize(rolled);
        velocity = length(rolled) > p.rollingDecel * dt ? sub(rolled, scale(d, p.rollingDecel * dt)) : ZERO;
        angularVelocity = rollingSpin(velocity, s.angularVelocity.z, R);
    } else if (length(slip) > STOP_SPEED) {
        // Sliding: friction opposes slip; its torque spins the ball up towards rolling.
        const u = normalize(slip);
        const a = p.slidingDecel;
        velocity = sub(s.velocity, scale(u, a * dt));
        const k = (5 * a * dt) / (2 * R);
        angularVelocity = vec3(s.angularVelocity.x - k * u.y, s.angularVelocity.y + k * u.x, s.angularVelocity.z);
    } else if (length(s.velocity) > STOP_SPEED) {
        // Rolling: uniform deceleration along the direction of travel, stopping rather than reversing.
        const d = normalize(s.velocity);
        velocity = sub(s.velocity, scale(d, p.rollingDecel * dt));
        if (dot(velocity, d) <= 0) {
            return { position: s.position, velocity: ZERO, angularVelocity: ZERO };
        }
        angularVelocity = rollingSpin(velocity, s.angularVelocity.z, R);
    } else {
        return { position: s.position, velocity: ZERO, angularVelocity: ZERO };
    }
    return { position: add(s.position, scale(velocity, dt)), velocity, angularVelocity };
}

/** Turf without friction: resolving against it leaves only the contact impulse's own changes. */
const BARE_TURF = (): ContactMaterial => ({ restitution: 0, friction: 0 });

/**
 * The part of a contact impulse j (per unit mass) across the unit normal n, read off the spin change dw it caused at
 * the contact point R·n from the centre: R·n × j = (2/5)·R²·dw, so n × j = 0.4·R·dw and the part is (n × j) × n.
 */
function across(n: Vec3, dw: Vec3, R: number): Vec3 {
    return cross(scale(dw, 0.4 * R), n);
}

/**
 * The upward contact impulse per unit mass on b (−that on a) in resolveBallBall, resolved on bare turf so that the
 * changes are the contact impulse's alone. A ball in flight shows it whole in its velocity; between two balls on the
 * turf the normal is horizontal, so the upward part lies across it.
 */
function ballBallImpulseZ(a: BallState, b: BallState, world: World): number {
    const R = world.ball.radius;
    const [na, nb] = resolveBallBall(a, b, world.ball, world.ballBall, BARE_TURF);
    if (!onTurf(b, R)) {
        return nb.velocity.z - b.velocity.z;
    }
    if (!onTurf(a, R)) {
        return a.velocity.z - na.velocity.z;
    }
    // Both get angular impulse R·n × (−j) with n from a to b, i.e. j at −R·n on b.
    const n = normalize(sub(b.position, a.position));
    return across(scale(n, -1), sub(nb.angularVelocity, b.angularVelocity), R).z;
}

/** The upward impulse per unit mass on a ball in resolveBallCylinder (contact at −R·n, normal horizontal). */
function cylinderImpulseZ(s: BallState, axis: Vec3, material: ContactMaterial, world: World): number {
    const R = world.ball.radius;
    const next = resolveBallCylinder(s, axis, world.ball, material, BARE_TURF);
    if (!onTurf(s, R)) {
        return next.velocity.z - s.velocity.z;
    }
    const n = normalize(horizontal(sub(s.position, axis)));
    return across(scale(n, -1), sub(next.angularVelocity, s.angularVelocity), R).z;
}

/** Integrates the shot at fixed step `dt` for at most `maxTime` seconds and returns rest positions. */
export function bruteForce(
    initial: BallStates,
    world: World,
    dt: number,
    maxTime: number,
): Partial<Record<BallId, Vec3>> {
    const R = world.ball.radius;
    const obstacles = obstaclesOf(world);
    const turf = (position: Vec3): ReturnType<typeof turfAt> => turfAt(world, position);
    const ids = BALL_IDS.filter((id) => initial[id]);
    const states = new Map<BallId, BallState>(ids.map((id) => [id, initial[id] as BallState]));
    // Upward push impulse per unit mass on each ball in the previous step (step() runs before this step's impulses):
    // its turf load is L = g − up/dt.
    let up = new Map<BallId, number>();
    // Contacts (ball pairs, ball–obstacle pairs) that overlapped, or had a gap under RESTING_SPEED·dt, at the previous
    // step's contact check. A push's impulses chatter: each bounces the pair apart slower than RESTING_SPEED, so a gap
    // of up to RESTING_SPEED·dt can open for a step before the drive closes it again.
    let touching = new Set<string>();
    const near = RESTING_SPEED * dt;
    for (let t = 0; t < maxTime; t += dt) {
        let moving = false;
        for (const id of ids) {
            const s = states.get(id) as BallState;
            const next = step(s, world, dt, 1 - (up.get(id) ?? 0) / (world.gravity * dt));
            if (length(next.velocity) > 0 || !onTurf(next, R)) {
                moving = true;
            }
            states.set(id, next);
        }
        // Balls whose patch does not slip as this step's impulses meet them: a push leaves their spin about z alone.
        const locked = new Set<BallId>(
            ids.filter((id) => {
                const phase = classify(states.get(id) as BallState, R);
                return phase === "rolling" || phase === "stationary";
            }),
        );
        const keepTwist = (id: BallId, before: BallState, after: BallState, push: boolean): BallState => {
            if (!push || !locked.has(id)) {
                return after;
            }
            const w = after.angularVelocity;
            return { ...after, angularVelocity: vec3(w.x, w.y, before.angularVelocity.z) };
        };
        const wasTouching = touching;
        touching = new Set<string>();
        up = new Map<BallId, number>();
        const lift = (id: BallId, dz: number): void => {
            up.set(id, (up.get(id) ?? 0) + dz);
        };
        for (let i = 0; i < ids.length; i++) {
            const a = ids[i] as BallId;
            for (let j = i + 1; j < ids.length; j++) {
                const b = ids[j] as BallId;
                const sa = states.get(a) as BallState;
                const sb = states.get(b) as BallState;
                const key = `${a}-${b}`;
                const gap = length(sub(sa.position, sb.position)) - 2 * R;
                if (gap < near) {
                    touching.add(key);
                }
                if (gap < 0) {
                    const push =
                        wasTouching.has(key) &&
                        approachSpeed(sub(sa.position, sb.position), sub(sa.velocity, sb.velocity)) < RESTING_SPEED;
                    const [na, nb] = resolveBallBall(sa, sb, world.ball, world.ballBall, turf);
                    if (push) {
                        const jz = ballBallImpulseZ(sa, sb, world);
                        lift(a, 0 - jz);
                        lift(b, jz);
                    }
                    states.set(a, keepTwist(a, sa, na, push));
                    states.set(b, keepTwist(b, sb, nb, push));
                }
            }
            obstacles.forEach((o, k) => {
                const s = states.get(a) as BallState;
                const offset = horizontal(sub(s.position, o.centre));
                const key = `${a}@${k}`;
                const gap = length(offset) - (R + o.radius);
                if (gap < near) {
                    touching.add(key);
                }
                if (gap < 0) {
                    const push = wasTouching.has(key) && approachSpeed(offset, s.velocity) < RESTING_SPEED;
                    if (push) {
                        lift(a, cylinderImpulseZ(s, o.centre, o.material, world));
                    }
                    const next = resolveBallCylinder(s, o.centre, world.ball, o.material, turf);
                    states.set(a, keepTwist(a, s, next, push));
                }
            });
        }
        if (!moving) {
            break;
        }
    }
    return Object.fromEntries(ids.map((id) => [id, (states.get(id) as BallState).position]));
}
```

- [ ] **Step 4: Run the cross-check to verify it passes**

Run: `npx vitest run tests/engine/crossCheck.test.ts`, then `npm test`, `npm run lint`, `npm run check`
Expected: all pass within 1 mm. A scenario that disagrees by more than 1 mm is a finding, not a tolerance problem:
report the ball, the distance and the event list; do not loosen `TOLERANCE` or move the scenario without approval.

- [ ] **Step 5: Run the slow checks once**

Run: `SLOW_TESTS=1 npx vitest run tests/engine/crossCheck.test.ts -t "release onsets"` (long-running: run it in the
background with its output written to a file, and report the two onsets it found).
Expected: PASS, both onsets within 0.002° (the prototype found 52.1883° and 20.2899°).

- [ ] **Step 6: Commit**

```bash
npx prettier --write tests/engine/support/bruteForce.ts tests/engine/crossCheck.test.ts
git add tests/engine/support/bruteForce.ts tests/engine/crossCheck.test.ts
git commit -m "Cross-check friction pushes against load-coupled brute force in the standard world"
```

---

### Task 10: Performance measurement and the roadmap

The last task re-measures realistic play with friction on (design §6, last bullet) and records what P5 needs. It
ports the prototype's shot-mix generator (`prototype/speed/shots.ts`) as a script that times the engine and, through
the `SolveProbe` seam, its resting-contact solves.

**Files:**
- Create: `scripts/shotMix.ts`
- Modify: `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`

- [ ] **Step 1: Write the script**

Create `scripts/shotMix.ts`:

```ts
/**
 * Realistic shot mix through the engine with friction on (P2a.2 design §6, performance measurement). Generates
 * croquet-like shots (croquet strokes, rushes, cannons, hoop approaches, jammed balls, peg play, pushes, single
 * balls), runs each twice (the first warms the JIT and is discarded) and reports per shot the resting-contact solves,
 * their work units and time, and the engine's time. Run with `npx --yes tsx scripts/shotMix.ts`; environment: COUNT
 * (shots, default 3000), SEED (default 7). Not part of the test suite.
 */
import { ZERO, add, scale, vec3, type Vec3 } from "../src/engine/math/vec3";
import { rollingSpin } from "../src/engine/motion";
import { SOLVE_BUDGET, simulateFreeMotion } from "../src/engine/simulate";
import type { BallId, BallState, BallStates, World } from "../src/engine/types";
import { obstaclesOf, uprightsOf } from "../src/engine/world";
import { testHoop, testWorld } from "../tests/engine/support/fixtures";
import { rng } from "../tests/engine/support/rng";

const COUNT = Number(process.env.COUNT ?? "3000");
const SEED = Number(process.env.SEED ?? "7");
const R = 0.046;
const random = rng(SEED);
const uni = (a: number, b: number): number => a + (b - a) * random();
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(random() * xs.length)] as T;

// Six hoops in the standard pattern around the peg (15, 20), 6.4 m (7 yd) apart.
const HOOPS = [
    testHoop("1", 8.6, 13.6),
    testHoop("2", 21.4, 13.6),
    testHoop("3", 21.4, 26.4),
    testHoop("4", 8.6, 26.4),
    testHoop("5", 15, 13.6),
    testHoop("6", 15, 26.4),
];
const WORLD: World = testWorld({ hoops: HOOPS });
const OBSTACLES = obstaclesOf(WORLD);
const IDS: readonly BallId[] = ["blue", "red", "black", "yellow"];

const unit = (a: number): Vec3 => vec3(Math.cos(a), Math.sin(a), 0);
const at = (p: Vec3, a: number, d: number): Vec3 => vec3(p.x + d * Math.cos(a), p.y + d * Math.sin(a), R);
const rest = (p: Vec3): BallState => ({ position: p, velocity: ZERO, angularVelocity: ZERO });

/** A struck ball: speed v along angle a; spin s × rolling spin (1 rolls, 0 stun, < 0 backspin, > 1 topspin), side. */
function struck(p: Vec3, a: number, v: number, s: number, side = 0): BallState {
    const velocity = scale(unit(a), v);
    return { position: p, velocity, angularVelocity: add(scale(rollingSpin(velocity, 0, R), s), vec3(0, 0, side)) };
}

/** Random spin for a mallet stroke: mostly near stun–roll, occasionally heavy top or back. */
function strokeSpin(): number {
    const u = random();
    return u < 0.5 ? uni(0.2, 0.8) : u < 0.8 ? uni(0.8, 1.6) : u < 0.95 ? uni(-0.4, 0.2) : uni(1.6, 2.5);
}

function sideSpin(): number {
    return random() < 0.7 ? 0 : uni(-15, 15);
}

/** Somewhere on court, away from the boundary. */
function anywhere(): Vec3 {
    return vec3(uni(1, 29), uni(1, 39), R);
}

function overlaps(states: readonly BallState[]): boolean {
    for (let i = 0; i < states.length; i++) {
        const p = (states[i] as BallState).position;
        if (p.x < 0.2 || p.x > 29.8 || p.y < 0.2 || p.y > 39.8) {
            return true;
        }
        for (let j = i + 1; j < states.length; j++) {
            const q = (states[j] as BallState).position;
            if (Math.hypot(p.x - q.x, p.y - q.y) < 2 * R - 1e-12) {
                return true;
            }
        }
        for (const o of OBSTACLES) {
            if (Math.hypot(p.x - o.centre.x, p.y - o.centre.y) < R + o.radius - 1e-12) {
                return true;
            }
        }
    }
    return false;
}

/** Fills the remaining balls with random court positions. */
function withOthers(placed: BallState[]): BallState[] {
    const out = [...placed];
    while (out.length < 4) {
        out.push(rest(anywhere()));
    }
    return out;
}

function nearHoop(): { readonly hoop: (typeof HOOPS)[number]; readonly up: readonly [Vec3, Vec3] } {
    const hoop = pick(HOOPS);
    const ups = uprightsOf(hoop, WORLD.ballUpright);
    return { hoop, up: [ups[0].centre, ups[1].centre] };
}

const generators: { readonly name: string; readonly weight: number; readonly make: () => BallState[] }[] = [
    {
        // Striker touching the croqueted ball; split angle up to ±50° off the line of centres.
        name: "croquet",
        weight: 0.3,
        make: () => {
            const s = anywhere();
            const a = uni(0, 2 * Math.PI);
            const c = at(s, a, 2 * R);
            const split = random() < 0.4 ? 0 : uni(-50, 50) * (Math.PI / 180);
            return withOthers([struck(s, a + split, uni(0.4, 5), strokeSpin(), sideSpin()), rest(c)]);
        },
    },
    {
        // Rush or cut rush from 0.1–4 m, offset up to almost a full ball width.
        name: "rush",
        weight: 0.15,
        make: () => {
            const t = anywhere();
            const a = uni(0, 2 * Math.PI);
            const d = random() < 0.5 ? uni(0.1, 0.5) : uni(0.5, 4);
            const off = random() < 0.4 ? uni(-0.3, 0.3) * R : uni(-1.9, 1.9) * R;
            const back = vec3(t.x - d * Math.cos(a) - off * Math.sin(a), t.y - d * Math.sin(a) + off * Math.cos(a), R);
            return withOthers([struck(back, a, uni(0.3, 4), random() < 0.7 ? 1 : strokeSpin()), rest(t)]);
        },
    },
    {
        // Cannon: three balls touching, the striker hit into them.
        name: "cannon",
        weight: 0.1,
        make: () => {
            const s = anywhere();
            const a = uni(0, 2 * Math.PI);
            const c = at(s, a, 2 * R);
            const third = at(random() < 0.4 ? s : c, uni(0, 2 * Math.PI), 2 * R);
            const split = uni(-45, 45) * (Math.PI / 180);
            return withOthers([struck(s, a + split, uni(0.3, 4), strokeSpin(), sideSpin()), rest(c), rest(third)]);
        },
    },
    {
        // Hoop approach or run from 0.05–3 m in front; sometimes another ball beyond it or jammed in it.
        name: "hoop",
        weight: 0.15,
        make: () => {
            const { hoop, up } = nearHoop();
            const n = scale(hoop.normal, random() < 0.5 ? 1 : -1);
            const d = random() < 0.5 ? uni(0.05, 0.6) : uni(0.6, 3);
            const lat = uni(-0.07, 0.07);
            const l = vec3(-hoop.normal.y, hoop.normal.x, 0);
            const start = vec3(hoop.centre.x - d * n.x + lat * l.x, hoop.centre.y - d * n.y + lat * l.y, R);
            const heading = Math.atan2(n.y, n.x);
            const balls = [struck(start, heading + uni(-25, 25) * (Math.PI / 180), uni(0.15, 2.5), strokeSpin(), sideSpin())];
            if (random() < 0.35) {
                const u = random() < 0.5 ? up[0] : up[1];
                const toward = Math.atan2(hoop.centre.y - u.y, hoop.centre.x - u.x) + uni(-0.6, 0.6);
                balls.push(
                    rest(random() < 0.5 ? at(u, toward, R + 0.008) : at(hoop.centre, heading + uni(-0.5, 0.5), uni(0.1, 0.5))),
                );
            }
            return withOthers(balls);
        },
    },
    {
        // A ball touching an upright, struck itself or struck by another ball.
        name: "jammed",
        weight: 0.08,
        make: () => {
            const { up } = nearHoop();
            const u = random() < 0.5 ? up[0] : up[1];
            const a = uni(0, 2 * Math.PI);
            const p = at(u, a, R + 0.008);
            if (random() < 0.5) {
                return withOthers([struck(p, a + Math.PI + uni(-1.4, 1.4), uni(0.1, 2), strokeSpin(), sideSpin())]);
            }
            const from = a + uni(-1, 1);
            const s = at(p, from, uni(2 * R + 0.01, 1));
            return withOthers([struck(s, from + Math.PI + uni(-0.1, 0.1), uni(0.1, 2), 1), rest(p)]);
        },
    },
    {
        // A ball rolled at the peg, or a ball touching the peg struck or hit.
        name: "peg",
        weight: 0.07,
        make: () => {
            const peg = WORLD.peg.centre;
            const a = uni(0, 2 * Math.PI);
            if (random() < 0.5) {
                const p = at(peg, a, uni(0.1, 3));
                return withOthers([struck(p, a + Math.PI + uni(-0.03, 0.03), uni(0.1, 2), random() < 0.7 ? 1 : strokeSpin())]);
            }
            const p = at(peg, a, R + 0.02);
            const s = at(p, a + uni(-1, 1), 2 * R + uni(0, 0.8));
            return withOthers([struck(s, Math.atan2(p.y - s.y, p.x - s.x) + uni(-0.1, 0.1), uni(0.1, 2), 1), rest(p)]);
        },
    },
    {
        // Pushes: a slow striker touching a ball (or a touching pair), or rolled gently into a touching pair.
        name: "push",
        weight: 0.1,
        make: () => {
            const s = anywhere();
            const a = uni(0, 2 * Math.PI);
            const c = at(s, a, 2 * R);
            const pair = at(c, a + uni(-1, 1), 2 * R);
            if (random() < 0.5) {
                const extra = random() < 0.5 ? [rest(pair)] : [];
                return withOthers([struck(s, a + uni(-0.5, 0.5), uni(0.005, 0.3), strokeSpin()), rest(c), ...extra]);
            }
            const back = at(s, a + Math.PI + uni(-0.2, 0.2), uni(0.05, 1));
            return withOthers([struck(back, a + uni(-0.05, 0.05), uni(0.05, 1), 1), rest(s), rest(c)]);
        },
    },
    {
        // Ordinary single-ball shots with the other balls scattered.
        name: "single",
        weight: 0.05,
        make: () => withOthers([struck(anywhere(), uni(0, 2 * Math.PI), uni(0.2, 5), strokeSpin(), sideSpin())]),
    },
];

function makeShot(): { readonly name: string; readonly states: BallStates } {
    const total = generators.reduce((s, g) => s + g.weight, 0);
    for (;;) {
        let u = random() * total;
        let chosen = generators[0] as (typeof generators)[number];
        for (const g of generators) {
            u -= g.weight;
            if (u < 0) {
                chosen = g;
                break;
            }
        }
        const balls = chosen.make();
        if (overlaps(balls)) {
            continue;
        }
        const states: BallStates = {};
        balls.forEach((b, i) => {
            states[IDS[i] as BallId] = b;
        });
        return { name: chosen.name, states };
    }
}

interface Shot {
    readonly name: string;
    readonly solves: number;
    readonly largest: number;
    readonly work: number;
    readonly solverMs: number;
    readonly engineMs: number;
    readonly fallbacks: number;
}

const shots: Shot[] = [];
for (let i = 0; i < COUNT; i++) {
    const { name, states } = makeShot();
    simulateFreeMotion(states, WORLD);
    let solves = 0;
    let largest = 0;
    let work = 0;
    let solverMs = 0;
    let started = 0;
    const probe = {
        before: (): void => {
            started = performance.now();
        },
        after: (units: number, bodies: number): void => {
            solverMs += performance.now() - started;
            solves++;
            work += units;
            largest = Math.max(largest, bodies);
        },
    };
    const t0 = performance.now();
    const result = simulateFreeMotion(states, WORLD, undefined, { probe });
    const engineMs = performance.now() - t0;
    const fallbacks = result.events.filter(
        (e) => e.kind === "approximate-hold" || e.kind === "approximate-slip" || e.kind === "budget-hold",
    ).length;
    shots.push({ name, solves, largest, work, solverMs, engineMs, fallbacks });
}

const quantile = (xs: readonly number[], q: number): number => {
    const sorted = [...xs].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] as number;
};
const row = (label: string, xs: readonly number[]): string =>
    `${label}: p50 ${quantile(xs, 0.5).toFixed(3)}, p99 ${quantile(xs, 0.99).toFixed(3)}, ` +
    `p99.9 ${quantile(xs, 0.999).toFixed(3)}, max ${Math.max(...xs).toFixed(3)}`;
const worst = shots.reduce((a, b) => (b.engineMs > a.engineMs ? b : a));
console.log(`${shots.length} shots, seed ${SEED}, budget ${SOLVE_BUDGET} units`);
console.log(`shots with no solve: ${((100 * shots.filter((s) => s.solves === 0).length) / shots.length).toFixed(1)}%`);
console.log(`largest group: ${Math.max(...shots.map((s) => s.largest))} balls`);
console.log(row("solves per shot", shots.map((s) => s.solves)));
console.log(row("work units per shot", shots.map((s) => s.work)));
console.log(row("solver ms per shot", shots.map((s) => s.solverMs)));
console.log(row("engine ms per shot", shots.map((s) => s.engineMs)));
console.log(`fallback events: ${shots.reduce((s, x) => s + x.fallbacks, 0)}`);
console.log(`worst shot: ${worst.name}, ${worst.solves} solves, ${worst.work} units, ` +
    `solver ${worst.solverMs.toFixed(1)} ms, engine ${worst.engineMs.toFixed(1)} ms`);
```

(`scripts/` is outside `tsconfig.json`'s `include`, so `npm run check` does not type-check it; `npm run lint` lints
it with Node globals.)

- [ ] **Step 2: Run it**

Run (long-running: in the background, output to a file): `npx --yes tsx scripts/shotMix.ts`
Expected: it completes. Record every printed line, `node --version` and the machine
(`sysctl -n machdep.cpu.brand_string`). Fallback events must be 0; if not, report the shots (name, index) and stop.

- [ ] **Step 3: Update the roadmap**

In `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md`:

1. In the P2 row's exit-criteria cell, change "P2a.2:" to "P2a.2 (met):".
2. After the "P2a.1 outcomes carried forward" section (or at the end, before any later sections), add a
   "## P2a.2 outcomes carried forward" section with these bullets, numbers filled in from Step 2:
   - **Push friction.** Coupled contacts carry 3D, load-coupled Coulomb friction with `stick`/`slip` events; held
     clusters hold through static friction; a turf ball whose load friction takes away is solved airborne. Fallbacks
     are `approximate-hold`, `approximate-slip` and `budget-hold`; none occurs in the sweeps, the clusters or the fuzz.
     `ENGINE_VERSION` 0.3.0.
   - **Work budget.** `SOLVE_BUDGET` work units per shot (value, and the units/ms it was fixed from). The shot mix
     never reaches it (worst shot's units against the budget).
   - **Measured realistic play (friction on).** The printed rows: shots with no solve, largest group, solves per
     shot, work units, solver and engine time per shot, the worst shot; machine and Node version. The iPad factor of
     3× is unverified; P5 calibrates it.
   - **For P5.** Chatter re-solve cost (the worst shot's solves), and the design's deferred items: finite turf pivot
     grip (the per-ball capacity hook), surface variation (the turf-normal and gravity hooks), Rust/WASM only if the
     budget proves too tight.

- [ ] **Step 4: Verify and commit**

Run: `npm test`, `npm run lint`, `npm run check`, `npm run format:check`

```bash
npx prettier --write scripts/shotMix.ts docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md
git add scripts/shotMix.ts docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md
git commit -m "Measure realistic play with push friction and record P2a.2's outcomes"
```

---

## After the last task

An Opus whole-branch review with probes (design §7), then `superpowers:finishing-a-development-branch`.
