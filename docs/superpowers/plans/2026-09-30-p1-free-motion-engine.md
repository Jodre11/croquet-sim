# P1 — Foundations and Free-Motion Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the repository and deliver a deterministic, event-driven free-motion (phase 2) croquet engine,
driven by sourced reference data, that turns initial ball states into a time-parameterised `ShotResult`.

**Architecture:** A pure TypeScript engine under `src/engine/` with no DOM dependency. Each ball moves on
closed-form quadratic trajectories within a motion phase (sliding, rolling, stationary). The solver jumps directly
to the next event (phase transition, ball–ball contact, ball–upright/peg contact, halt margin), resolves it with an
instantaneous impulse, and records per-ball segments. Contacts slower than a small resting speed are not bounced:
the bodies are coupled and pushed together under constant accelerations (still closed-form quadratics) until a
pushed ball changes phase, the contact opens or another contact intervenes (Task 7, `push.ts`). Out-of-court and
hoop-passage events are observed afterwards from the segments. Physical constants come from `reference/*.json`,
each value carrying its source.

**Tech Stack:** Node (current Active LTS), TypeScript (strict), Vite, Svelte 5, Vitest, ESLint (flat config,
typescript-eslint, eslint-plugin-svelte), Prettier, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-30-croquet-shot-lab-design.md` (read §3, §5, §9 and §11 before starting).
**Roadmap:** `docs/superpowers/plans/2026-09-30-croquet-shot-lab-roadmap.md` (this is plan P1 of 5).

## Global Constraints

- Formatting: 4-space indentation, 120-column limit, LF line endings, UTF-8.
- Browser floor: Safari / iPadOS 16+, and the last two major versions of Chrome, Edge and Firefox.
- Engine code (`src/engine/**`) is pure: no DOM, no time-of-day, no randomness, no reliance on unspecified
  iteration order. Iterate balls in `BALL_IDS` order.
- Engine code uses only IEEE-754 exact operations — `+ − * /`, comparisons, `Math.sqrt`, `Math.min`,
  `Math.max`, `Math.abs`. No `Math.sin/cos/exp/pow/…` and no `**`. Enforced by ESLint (Task 1).
- Units are SI throughout: metres, kilograms, seconds, m/s, rad/s.
- Coordinates: the lawn is the plane `z = 0`, `z` up. Origin at the south-west corner of the court; `x` runs east
  along the south boundary, `y` runs north along the west boundary. A resting ball's centre is at `z = radius`.
- No physical constant in `src/` is typed in by hand. Every value comes from `reference/*.json` with a citation.
  Exceptions: standard gravity (a defined constant), numerical tolerances, modelling margins (`HALT_MARGIN`) and
  solid-sphere geometry factors that follow from I = 2/5·m·r² (5/2, 7/2, 7/5, 2/7). Every tolerance and margin is
  a named constant whose comment says why it is not a physical constant. Test fixtures may use explicit,
  clearly-labelled test values.
- Public/exported functions carry a header comment; cognitively complex code carries explanatory comments.
- Commit messages follow the repo's existing style: short imperative sentence (e.g. "Add polynomial root finder").

## Review Focus

1. **Balls that start exactly touching** (every croquet stroke; chains of touching balls) — no spurious
   zero-time collisions, no tunnelling, the simulation terminates. Pinned in Tasks 6, 7 and 9.
2. **Grazing, near-tangent contacts** — no phantom impulse, no interpenetration. Pinned in Tasks 6 and 9.
3. **Very slow balls and residual slip just above tolerance** — the solver terminates promptly without an event
   storm or `aborted`. Pinned in Task 9.
4. **Simultaneous events** (two balls striking a third at the same instant) — resolved sequentially without
   penetration or abort. Pinned in Task 9.
5. **Crossing a hoop plane near a segment boundary** — exactly one passage event, never zero or two. Pinned in
   Task 10.
6. **Persistent contact** (a ball driven into another by its own spin; pushed chains; a ball driven into two
   balls at an angle; a ball spinning against the peg) — resolved as resting contact and pushing: no Zeno event
   storm, no abort, no penetration, contact forces never pull, energy never increases; detection and resolution
   use the same predicates. Pinned in Tasks 6, 7, 9 and 11 (against an analytic case and brute force).

---

## File Structure

| Path | Responsibility |
|---|---|
| `package.json`, `tsconfig.json`, `vite.config.ts`, `svelte.config.js`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.editorconfig`, `.gitattributes`, `.gitignore`, `.nvmrc`, `index.html` | Tooling and scaffold |
| `src/main.ts`, `src/App.svelte`, `src/vite-env.d.ts` | Placeholder app (replaced in P4) |
| `.github/workflows/ci.yml` | CI: lint, format check, type check, tests, build |
| `src/engine/math/vec3.ts` | Immutable 3-vector maths |
| `src/engine/math/poly.ts` | Deterministic real-root isolation for polynomials of degree ≤ 4 |
| `reference/README.md` | Reference-data conventions |
| `reference/{ball,court,laws,lawn,friction}.json` | Sourced constants |
| `src/reference/schema.ts` | Runtime validation of reference entries |
| `src/reference/index.ts` | Typed, validated reference data |
| `src/engine/types.ts` | Engine data types (`BallState`, `World`, `ShotResult`, …) |
| `src/engine/motion.ts` | Single-ball closed-form motion within a phase |
| `src/engine/detect.ts` | Event-time detection (contacts, boundary thresholds) |
| `src/engine/resolve.ts` | Collision impulses |
| `src/engine/push.ts` | Resting contact: which touching contacts push, and the pushed balls' motion |
| `src/engine/world.ts` | World helpers, validation, default world from reference data |
| `src/engine/simulate.ts` | Event loop producing `ShotResult` |
| `src/engine/sample.ts` | Evaluating a segment (free or pushed) and sampling a `ShotResult` at any time |
| `src/engine/observe.ts` | Out-of-court and hoop-passage observation |
| `src/engine/hoopRun.ts` | Hoop-run verdict per the Laws |
| `src/engine/index.ts` | Public engine API |
| `tests/…` | Mirrors `src/`; `tests/engine/support/` holds test-only fixtures, RNG, energy and brute-force integrator |

---

### Task 1: Project scaffold and vector maths

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `svelte.config.js`, `eslint.config.js`,
  `.prettierrc.json`, `.prettierignore`, `.editorconfig`, `.gitattributes`, `.gitignore`, `.nvmrc`, `index.html`,
  `src/main.ts`, `src/App.svelte`, `src/vite-env.d.ts`, `.github/workflows/ci.yml`
- Create: `src/engine/math/vec3.ts`
- Test: `tests/engine/math/vec3.test.ts`

**Interfaces:**
- Produces: `Vec3 { readonly x; readonly y; readonly z: number }`, `ZERO`, `vec3(x, y, z)`, `add(a, b)`,
  `sub(a, b)`, `scale(a, k)`, `dot(a, b)`, `cross(a, b)`, `lengthSq(a)`, `length(a)`, `normalize(a)`,
  `horizontal(a)` — all in `src/engine/math/vec3.ts`. npm scripts `lint`, `format`, `format:check`, `check`,
  `test`, `build`.

- [ ] **Step 1: Confirm the Node LTS major**

Open https://nodejs.org/en/about/previous-releases and note the current **Active LTS** major (expected `24`; use
whatever the page says). Create `.nvmrc` containing only that major, e.g.:

```
24
```

- [ ] **Step 2: Write `package.json`**

```json
{
    "name": "croquet-sim",
    "private": true,
    "version": "0.0.0",
    "type": "module",
    "scripts": {
        "dev": "vite",
        "build": "vite build",
        "preview": "vite preview",
        "check": "svelte-check --tsconfig ./tsconfig.json --fail-on-warnings",
        "lint": "eslint .",
        "format": "prettier --write .",
        "format:check": "prettier --check .",
        "test": "vitest run",
        "test:watch": "vitest"
    }
}
```

- [ ] **Step 3: Install the latest GA dev dependencies**

```bash
npm install --save-dev vite svelte @sveltejs/vite-plugin-svelte typescript svelte-check vitest eslint @eslint/js typescript-eslint eslint-plugin-svelte eslint-config-prettier globals prettier prettier-plugin-svelte
```

Then confirm nothing is behind:

```bash
npm outdated
```

Expected: no output (everything at latest).

- [ ] **Step 4: Write the configuration files**

`tsconfig.json`:

```json
{
    "compilerOptions": {
        "target": "ES2022",
        "lib": ["ES2022", "DOM", "DOM.Iterable"],
        "module": "ESNext",
        "moduleResolution": "bundler",
        "resolveJsonModule": true,
        "verbatimModuleSyntax": true,
        "isolatedModules": true,
        "strict": true,
        "noUncheckedIndexedAccess": true,
        "noImplicitOverride": true,
        "noFallthroughCasesInSwitch": true,
        "skipLibCheck": true,
        "noEmit": true,
        "types": ["vite/client"]
    },
    "include": ["src/**/*.ts", "src/**/*.svelte", "tests/**/*.ts", "vite.config.ts"]
}
```

`vite.config.ts` (the explicit `build.target` is the Safari 16 browser floor from the spec):

```ts
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

export default defineConfig({
    base: "./",
    plugins: [svelte()],
    build: {
        target: ["es2022", "safari16", "chrome120", "edge120", "firefox120"],
    },
    test: {
        include: ["tests/**/*.test.ts"],
        environment: "node",
    },
});
```

`svelte.config.js`:

```js
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default {
    preprocess: vitePreprocess(),
};
```

`eslint.config.js` — the final block enforces the IEEE-exact-operations constraint on engine code:

```js
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import { defineConfig } from "eslint/config";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import tseslint from "typescript-eslint";

// Math functions whose results are not guaranteed bit-identical across JavaScript engines.
const NON_EXACT_MATH = [
    "sin", "cos", "tan", "asin", "acos", "atan", "atan2", "sinh", "cosh", "tanh", "asinh", "acosh", "atanh",
    "exp", "expm1", "log", "log1p", "log2", "log10", "pow", "cbrt", "hypot",
];
const DETERMINISM_MESSAGE =
    "Engine code must use IEEE-exact operations only (+ - * /, Math.sqrt) so results are identical across browsers.";

export default defineConfig(
    { ignores: ["dist/", "coverage/", "playwright-report/", "test-results/"] },
    js.configs.recommended,
    tseslint.configs.strict,
    svelte.configs.recommended,
    prettier,
    svelte.configs.prettier,
    { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
    {
        files: ["**/*.svelte", "**/*.svelte.ts"],
        languageOptions: { parserOptions: { parser: tseslint.parser } },
    },
    {
        files: ["src/engine/**/*.ts"],
        rules: {
            "no-restricted-properties": [
                "error",
                ...NON_EXACT_MATH.map((property) => ({ object: "Math", property, message: DETERMINISM_MESSAGE })),
            ],
            "no-restricted-syntax": [
                "error",
                { selector: "BinaryExpression[operator='**']", message: DETERMINISM_MESSAGE },
                { selector: "AssignmentExpression[operator='**=']", message: DETERMINISM_MESSAGE },
            ],
        },
    },
);
```

`.prettierrc.json`:

```json
{
    "tabWidth": 4,
    "printWidth": 120,
    "plugins": ["prettier-plugin-svelte"],
    "overrides": [{ "files": "*.svelte", "options": { "parser": "svelte" } }]
}
```

`.prettierignore`:

```
dist/
coverage/
package-lock.json
docs/
```

`.editorconfig`:

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 4
insert_final_newline = true
trim_trailing_whitespace = true
max_line_length = 120

[*.md]
trim_trailing_whitespace = false
```

`.gitattributes`:

```
* text=auto eol=lf
*.png binary
*.jpg binary
*.ico binary
*.woff2 binary
```

`.gitignore`:

```
node_modules/
dist/
coverage/
playwright-report/
test-results/
*.tsbuildinfo
*.log
.DS_Store
.idea/
.vscode/
```

- [ ] **Step 5: Write the placeholder app**

`index.html`:

```html
<!doctype html>
<html lang="en-GB">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Croquet Shot Lab</title>
    </head>
    <body>
        <div id="app"></div>
        <script type="module" src="/src/main.ts"></script>
    </body>
</html>
```

`src/vite-env.d.ts`:

```ts
/// <reference types="svelte" />
/// <reference types="vite/client" />
```

`src/main.ts`:

```ts
import { mount } from "svelte";
import App from "./App.svelte";

const target = document.getElementById("app");
if (!target) {
    throw new Error("Missing #app element");
}

export default mount(App, { target });
```

`src/App.svelte`:

```svelte
<main>
    <h1>Croquet Shot Lab</h1>
    <p>Under construction.</p>
</main>
```

- [ ] **Step 6: Write the failing vector test**

`tests/engine/math/vec3.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ZERO, add, cross, dot, horizontal, length, normalize, scale, sub, vec3 } from "../../../src/engine/math/vec3";

describe("vec3", () => {
    it("adds, subtracts and scales component-wise", () => {
        expect(add(vec3(1, 2, 3), vec3(4, 5, 6))).toEqual(vec3(5, 7, 9));
        expect(sub(vec3(4, 5, 6), vec3(1, 2, 3))).toEqual(vec3(3, 3, 3));
        expect(scale(vec3(1, -2, 3), 2)).toEqual(vec3(2, -4, 6));
    });

    it("computes dot and right-handed cross products", () => {
        expect(dot(vec3(1, 2, 3), vec3(4, 5, 6))).toBe(32);
        expect(cross(vec3(1, 0, 0), vec3(0, 1, 0))).toEqual(vec3(0, 0, 1));
        expect(cross(vec3(0, 1, 0), vec3(0, 0, 1))).toEqual(vec3(1, 0, 0));
    });

    it("normalises, returning ZERO for the zero vector", () => {
        expect(normalize(vec3(3, 4, 0))).toEqual(vec3(0.6, 0.8, 0));
        expect(normalize(ZERO)).toEqual(ZERO);
        expect(length(vec3(3, 4, 12))).toBe(13);
    });

    it("projects onto the lawn plane", () => {
        expect(horizontal(vec3(1, 2, 3))).toEqual(vec3(1, 2, 0));
    });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npx vitest run tests/engine/math/vec3.test.ts`
Expected: FAIL — cannot resolve `../../../src/engine/math/vec3`.

- [ ] **Step 8: Implement `src/engine/math/vec3.ts`**

```ts
/**
 * Minimal immutable 3-vector maths for the engine. All quantities are SI (m, m/s, rad/s). The lawn is the plane
 * z = 0 with z up; x runs east and y north.
 */
export interface Vec3 {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** The zero vector. */
export const ZERO: Vec3 = Object.freeze({ x: 0, y: 0, z: 0 });

/** Creates a vector. */
export function vec3(x: number, y: number, z: number): Vec3 {
    return { x, y, z };
}

/** Returns a + b. */
export function add(a: Vec3, b: Vec3): Vec3 {
    return vec3(a.x + b.x, a.y + b.y, a.z + b.z);
}

/** Returns a − b. */
export function sub(a: Vec3, b: Vec3): Vec3 {
    return vec3(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Returns k·a. */
export function scale(a: Vec3, k: number): Vec3 {
    return vec3(a.x * k, a.y * k, a.z * k);
}

/** Returns the dot product a·b. */
export function dot(a: Vec3, b: Vec3): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Returns the right-handed cross product a × b. */
export function cross(a: Vec3, b: Vec3): Vec3 {
    return vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}

/** Returns |a|². */
export function lengthSq(a: Vec3): number {
    return dot(a, a);
}

/** Returns |a|. Math.sqrt is correctly rounded by IEEE-754, so this is exact across engines. */
export function length(a: Vec3): number {
    return Math.sqrt(lengthSq(a));
}

/** Returns a / |a|, or ZERO when a is the zero vector. */
export function normalize(a: Vec3): Vec3 {
    const l = length(a);
    return l === 0 ? ZERO : vec3(a.x / l, a.y / l, a.z / l);
}

/** Returns a with its vertical component removed. */
export function horizontal(a: Vec3): Vec3 {
    return vec3(a.x, a.y, 0);
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npx vitest run tests/engine/math/vec3.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 10: Write the CI workflow, confirming the latest action majors**

Check the latest release tag of each action and use its major version:

```bash
gh api repos/actions/checkout/releases/latest --jq .tag_name
```

```bash
gh api repos/actions/setup-node/releases/latest --jq .tag_name
```

`.github/workflows/ci.yml` (replace `vN` with the majors just printed, e.g. `v5`):

```yaml
name: CI

on:
    push:
        branches: [main]
    pull_request:

permissions:
    contents: read

jobs:
    verify:
        runs-on: ubuntu-24.04
        steps:
            - uses: actions/checkout@vN
            - uses: actions/setup-node@vN
              with:
                  node-version-file: .nvmrc
                  cache: npm
            - run: npm ci
            - run: npm run lint
            - run: npm run format:check
            - run: npm run check
            - run: npm test
            - run: npm run build
```

- [ ] **Step 11: Run every CI gate locally**

```bash
npm run format
```

```bash
npm run lint
```

```bash
npm run format:check
```

```bash
npm run check
```

```bash
npm test
```

```bash
npm run build
```

Expected: every command exits 0; `dist/index.html` exists.

- [ ] **Step 12: Commit**

```bash
git add .
```

```bash
git commit -m "Scaffold Vite/Svelte project with CI and vector maths"
```

---

### Task 2: Deterministic polynomial root finder

Every event time in the engine is the earliest root of a polynomial of degree ≤ 4 (squared distance between two
quadratic trajectories). Closed-form quartic formulas are numerically fragile and need transcendental functions,
so roots are isolated recursively using only exact operations.

**Files:**
- Create: `src/engine/math/poly.ts`
- Test: `tests/engine/math/poly.test.ts`

**Interfaces:**
- Produces: `evaluate(coeffs: readonly number[], t: number): number`,
  `derivative(coeffs: readonly number[]): number[]`,
  `realRootsInInterval(coeffs: readonly number[], lo: number, hi: number): number[]`. Coefficients are
  **ascending** (`c[0] + c[1]·t + …`). Returned roots are ascending and unique; a root obtained by bisection is the
  **lower** end of the final bracket, so the polynomial there still has the sign it had at `lo`.

- [ ] **Step 1: Write the failing tests**

`tests/engine/math/poly.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { derivative, evaluate, realRootsInInterval } from "../../../src/engine/math/poly";

function expectRoots(actual: number[], expected: number[]): void {
    expect(actual).toHaveLength(expected.length);
    expected.forEach((root, i) => expect(actual[i]).toBeCloseTo(root, 12));
}

describe("evaluate and derivative", () => {
    it("evaluates ascending coefficients", () => {
        expect(evaluate([1, 2, 3], 2)).toBe(17);
        expect(derivative([1, 2, 3])).toEqual([2, 6]);
    });
});

describe("realRootsInInterval", () => {
    it("finds a simple quadratic root", () => {
        expectRoots(realRootsInInterval([-2, 0, 1], 0, 2), [Math.SQRT2]);
    });

    it("finds all cubic roots in order", () => {
        expectRoots(realRootsInInterval([-6, 11, -6, 1], 0, 4), [1, 2, 3]);
    });

    it("finds all quartic roots in order", () => {
        expectRoots(realRootsInInterval([4, 0, -5, 0, 1], -3, 3), [-2, -1, 1, 2]);
    });

    it("reports a double root hit exactly at a turning point once", () => {
        expect(realRootsInInterval([1, -2, 1], 0, 2)).toEqual([1]);
    });

    it("returns nothing when there is no real root or the polynomial is identically zero", () => {
        expect(realRootsInInterval([1, 0, 1], -5, 5)).toEqual([]);
        expect(realRootsInInterval([0, 0, 0], 0, 1)).toEqual([]);
        expect(realRootsInInterval([3], 0, 1)).toEqual([]);
    });

    it("excludes roots outside the interval and includes roots on its ends", () => {
        expect(realRootsInInterval([-3, 1], 0, 2)).toEqual([]);
        expect(realRootsInInterval([0, 1], 0, 1)).toEqual([0]);
        expect(realRootsInInterval([-1, 1], 0, 1)).toEqual([1]);
    });

    it("ignores trailing zero coefficients", () => {
        expect(realRootsInInterval([-1, 1, 0, 0], 0, 2)).toEqual([1]);
    });

    it("returns the lower bracket end so the sign at lo is preserved", () => {
        const [root] = realRootsInInterval([2, 0, -1], 0, 2);
        expect(root).toBeDefined();
        expect(evaluate([2, 0, -1], root as number)).toBeGreaterThanOrEqual(0);
    });

    it("returns nothing for an empty interval", () => {
        expect(realRootsInInterval([-1, 1], 2, 1)).toEqual([]);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/math/poly.test.ts`
Expected: FAIL — cannot resolve `../../../src/engine/math/poly`.

- [ ] **Step 3: Implement `src/engine/math/poly.ts`**

```ts
/**
 * Deterministic real-root isolation for low-degree polynomials.
 *
 * Uses only IEEE-754 exact operations so results are bit-identical across JavaScript engines. The real roots of
 * p′ split [lo, hi] into sub-intervals on each of which p is monotone; each sign change is then refined by
 * bisection. Recursion bottoms out at degree 1, which is solved directly.
 */

/** Upper bound on bisection steps; bisection normally stops earlier when the bracket can no longer shrink. */
const MAX_BISECTIONS = 2000;

/** Evaluates c[0] + c[1]·t + … using Horner's scheme. */
export function evaluate(coeffs: readonly number[], t: number): number {
    let result = 0;
    for (let i = coeffs.length - 1; i >= 0; i--) {
        result = result * t + (coeffs[i] ?? 0);
    }
    return result;
}

/** Returns the ascending coefficients of the derivative. */
export function derivative(coeffs: readonly number[]): number[] {
    const out: number[] = [];
    for (let i = 1; i < coeffs.length; i++) {
        out.push(i * (coeffs[i] ?? 0));
    }
    return out;
}

/** Drops trailing (highest-degree) coefficients that are exactly zero. */
function trim(coeffs: readonly number[]): number[] {
    let n = coeffs.length;
    while (n > 0 && coeffs[n - 1] === 0) {
        n--;
    }
    return coeffs.slice(0, n);
}

function pushUnique(roots: number[], root: number): void {
    if (roots.length === 0 || roots[roots.length - 1] !== root) {
        roots.push(root);
    }
}

/**
 * Bisects [a, b], on which p is monotone and changes sign, and returns the lower end of the final bracket, so p
 * at the returned value keeps the sign it has at a (or is exactly zero).
 */
function bisect(coeffs: readonly number[], a: number, b: number, fa: number): number {
    let lo = a;
    let hi = b;
    const loNegative = fa < 0;
    for (let i = 0; i < MAX_BISECTIONS; i++) {
        const mid = lo + (hi - lo) * 0.5;
        if (mid <= lo || mid >= hi) {
            break;
        }
        const fm = evaluate(coeffs, mid);
        if (fm === 0) {
            return mid;
        }
        if (fm < 0 === loNegative) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    return lo;
}

/**
 * Returns the real roots of the polynomial in [lo, hi], ascending and without duplicates. A root where the
 * polynomial touches zero without changing sign is reported only when evaluation there is exactly zero. The
 * identically-zero polynomial is reported as having no roots.
 */
export function realRootsInInterval(coeffs: readonly number[], lo: number, hi: number): number[] {
    if (!(lo <= hi)) {
        return [];
    }
    const c = trim(coeffs);
    const degree = c.length - 1;
    if (degree <= 0) {
        return [];
    }
    if (degree === 1) {
        const root = -(c[0] ?? 0) / (c[1] ?? 1);
        return root >= lo && root <= hi ? [root] : [];
    }

    // Between consecutive critical points the polynomial is monotone, so each such interval holds at most one root.
    const knots = [lo, ...realRootsInInterval(derivative(c), lo, hi), hi];
    const roots: number[] = [];
    for (let i = 0; i + 1 < knots.length; i++) {
        const a = knots[i] ?? lo;
        const b = knots[i + 1] ?? hi;
        const fa = evaluate(c, a);
        if (fa === 0) {
            pushUnique(roots, a);
            continue;
        }
        const fb = evaluate(c, b);
        if (fb !== 0 && fa < 0 !== fb < 0) {
            pushUnique(roots, bisect(c, a, b, fa));
        }
    }
    if (evaluate(c, hi) === 0) {
        pushUnique(roots, hi);
    }
    return roots;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/math/poly.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
```

```bash
git add src/engine/math/poly.ts tests/engine/math/poly.test.ts
```

```bash
git commit -m "Add deterministic polynomial root finder"
```

---

### Task 3: Reference-data validation

Reference JSON is hand-curated, so every entry is validated at load time: a malformed or unsourced entry must fail
loudly rather than silently feed a wrong constant into the physics.

**Files:**
- Create: `src/reference/schema.ts`
- Test: `tests/reference/schema.test.ts`

**Interfaces:**
- Produces (`src/reference/schema.ts`):
  - `type Provenance = "direct" | "analogue" | "derived"`
  - `interface Sourced { readonly source: string; readonly provenance: Provenance; readonly note?: string }`
  - `interface ReferenceValue extends Sourced { readonly value: number; readonly unit: string; readonly bounds?: readonly [number, number] }`
  - `interface ReferenceQuote extends Sourced { readonly quote: string }`
  - `class ReferenceDataError extends Error`
  - `readValue(section: unknown, key: string, path: string): ReferenceValue`
  - `readQuote(section: unknown, key: string, path: string): ReferenceQuote`
  - `readNumber(section: unknown, key: string, path: string): number`
  - `readString(section: unknown, key: string, path: string): string`
  - `readArray(section: unknown, key: string, path: string): readonly unknown[]`
  - `readSourced(section: unknown, path: string): Sourced`

- [ ] **Step 1: Write the failing tests**

`tests/reference/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ReferenceDataError, readArray, readQuote, readValue } from "../../src/reference/schema";

const good = {
    diameter: { value: 0.09, unit: "m", bounds: [0.08, 0.1], source: "Some Laws, Rule 1", provenance: "direct" },
    rule: { quote: "A ball is out when…", source: "Some Laws, Rule 2", provenance: "direct", note: "context" },
    list: [1, 2],
};

describe("readValue", () => {
    it("returns a valid sourced value", () => {
        expect(readValue(good, "diameter", "ball")).toEqual(good.diameter);
    });

    it.each([
        ["missing entry", {}],
        ["non-numeric value", { diameter: { ...good.diameter, value: "0.09" } }],
        ["empty unit", { diameter: { ...good.diameter, unit: "" } }],
        ["empty source", { diameter: { ...good.diameter, source: " " } }],
        ["unknown provenance", { diameter: { ...good.diameter, provenance: "guessed" } }],
        ["inverted bounds", { diameter: { ...good.diameter, bounds: [0.1, 0.08] } }],
        ["value outside bounds", { diameter: { ...good.diameter, value: 0.2 } }],
        ["non-string note", { diameter: { ...good.diameter, note: 3 } }],
    ])("rejects %s", (_label, section) => {
        expect(() => readValue(section, "diameter", "ball")).toThrow(ReferenceDataError);
    });

    it("names the offending path in the error", () => {
        expect(() => readValue({}, "diameter", "ball")).toThrow(/ball\.diameter/);
    });
});

describe("readQuote and readArray", () => {
    it("returns a valid quote", () => {
        expect(readQuote(good, "rule", "laws")).toEqual(good.rule);
    });

    it("rejects an empty quote", () => {
        expect(() => readQuote({ rule: { ...good.rule, quote: "" } }, "rule", "laws")).toThrow(ReferenceDataError);
    });

    it("reads arrays and rejects non-arrays", () => {
        expect(readArray(good, "list", "x")).toEqual([1, 2]);
        expect(() => readArray(good, "rule", "x")).toThrow(ReferenceDataError);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/reference/schema.test.ts`
Expected: FAIL — cannot resolve `../../src/reference/schema`.

- [ ] **Step 3: Implement `src/reference/schema.ts`**

```ts
/**
 * Runtime validation for hand-curated reference data (reference/*.json). Every physical constant the app uses
 * must carry a source; malformed entries fail at load time with the offending path in the message.
 */

/** How a value was obtained: stated by the source, taken from an analogous domain, or derived from sourced facts. */
export type Provenance = "direct" | "analogue" | "derived";

/** Attribution carried by every reference entry. */
export interface Sourced {
    readonly source: string;
    readonly provenance: Provenance;
    readonly note?: string;
}

/** A sourced numeric value in SI units, optionally with plausible bounds. */
export interface ReferenceValue extends Sourced {
    readonly value: number;
    readonly unit: string;
    readonly bounds?: readonly [number, number];
}

/** A sourced verbatim quotation, used for rules from the Laws. */
export interface ReferenceQuote extends Sourced {
    readonly quote: string;
}

/** Raised when reference data is malformed or unsourced. */
export class ReferenceDataError extends Error {
    constructor(path: string, problem: string) {
        super(`Reference data ${path}: ${problem}`);
        this.name = "ReferenceDataError";
    }
}

const PROVENANCES: readonly string[] = ["direct", "analogue", "derived"];

function isRecord(x: unknown): x is Record<string, unknown> {
    return typeof x === "object" && x !== null && !Array.isArray(x);
}

function entry(section: unknown, key: string, path: string): unknown {
    if (!isRecord(section) || !(key in section)) {
        throw new ReferenceDataError(`${path}.${key}`, "missing");
    }
    return section[key];
}

/** Reads a finite number field. */
export function readNumber(section: unknown, key: string, path: string): number {
    const value = entry(section, key, path);
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new ReferenceDataError(`${path}.${key}`, "must be a finite number");
    }
    return value;
}

/** Reads a non-blank string field. */
export function readString(section: unknown, key: string, path: string): string {
    const value = entry(section, key, path);
    if (typeof value !== "string" || value.trim() === "") {
        throw new ReferenceDataError(`${path}.${key}`, "must be a non-empty string");
    }
    return value;
}

/** Reads an array field. */
export function readArray(section: unknown, key: string, path: string): readonly unknown[] {
    const value = entry(section, key, path);
    if (!Array.isArray(value)) {
        throw new ReferenceDataError(`${path}.${key}`, "must be an array");
    }
    return value;
}

/** Reads the attribution fields of an entry. */
export function readSourced(section: unknown, path: string): Sourced {
    if (!isRecord(section)) {
        throw new ReferenceDataError(path, "must be an object");
    }
    const source = readString(section, "source", path);
    const provenance = readString(section, "provenance", path);
    if (!PROVENANCES.includes(provenance)) {
        throw new ReferenceDataError(`${path}.provenance`, `must be one of ${PROVENANCES.join(", ")}`);
    }
    const sourced: Sourced = { source, provenance: provenance as Provenance };
    if ("note" in section) {
        return { ...sourced, note: readString(section, "note", path) };
    }
    return sourced;
}

/** Reads a sourced numeric value, checking it lies within its bounds when bounds are given. */
export function readValue(section: unknown, key: string, path: string): ReferenceValue {
    const item = entry(section, key, path);
    const itemPath = `${path}.${key}`;
    const value = readNumber(item, "value", itemPath);
    const unit = readString(item, "unit", itemPath);
    const result: ReferenceValue = { value, unit, ...readSourced(item, itemPath) };
    if (!isRecord(item) || !("bounds" in item)) {
        return result;
    }
    const bounds = readArray(item, "bounds", itemPath);
    const [lo, hi] = bounds;
    if (bounds.length !== 2 || typeof lo !== "number" || typeof hi !== "number" || !(lo <= hi)) {
        throw new ReferenceDataError(`${itemPath}.bounds`, "must be [lo, hi] with lo ≤ hi");
    }
    if (value < lo || value > hi) {
        throw new ReferenceDataError(itemPath, `value ${value} lies outside bounds [${lo}, ${hi}]`);
    }
    return { ...result, bounds: [lo, hi] };
}

/** Reads a sourced verbatim quotation. */
export function readQuote(section: unknown, key: string, path: string): ReferenceQuote {
    const item = entry(section, key, path);
    const itemPath = `${path}.${key}`;
    return { quote: readString(item, "quote", itemPath), ...readSourced(item, itemPath) };
}
```

Note: `readValue` returns keys in the order `value, unit, source, provenance, [note], [bounds]`; `toEqual` ignores key
order, so the test fixture's order does not matter.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/reference/schema.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
```

```bash
git add src/reference/schema.ts tests/reference/schema.test.ts
```

```bash
git commit -m "Add reference-data validation"
```

---

### Task 4: Source the P1 reference data

This task is research. **Nothing may be guessed.** Use the `web-search` skill. Prefer primary sources: the Laws of
Association Croquet and equipment specifications published by the Croquet Association (CA) or World Croquet
Federation (WCF); for friction and restitution, peer-reviewed or published physics literature. Where no
croquet-specific figure exists, a figure from the nearest analogue (e.g. golf putting-green or lawn-bowls
ball–turf friction; billiards ball–ball friction) may be used with `"provenance": "analogue"`, a note explaining the
analogy, and deliberately wide `bounds`. If a value cannot be sourced even by analogue, **stop and report BLOCKED**
with what was searched.

Record every value in SI units; put the original units and conversion in `note` (e.g. `"3 5/8 in"`).

**Files:**
- Create: `reference/README.md`, `reference/ball.json`, `reference/court.json`, `reference/laws.json`,
  `reference/lawn.json`, `reference/friction.json`, `src/reference/index.ts`
- Test: `tests/reference/reference.test.ts`

**Interfaces:**
- Consumes: `readValue`, `readQuote`, `readNumber`, `readString`, `readArray`, `readSourced`, `ReferenceValue`,
  `ReferenceQuote`, `Sourced` (Task 3).
- Produces (`src/reference/index.ts`):
  - `interface HoopPlacement { readonly id: string; readonly x: number; readonly y: number; readonly normalX: number; readonly normalY: number }`
  - `interface OffsetRule extends ReferenceQuote { readonly ballRadii: number; readonly uprightRadii: number }`
  - `ballReference: { diameter; mass: ReferenceValue; rebound: ReferenceQuote }`
  - `courtReference: { length; width; hoopInnerWidth; uprightDiameter; pegDiameter: ReferenceValue; layout: ReferenceQuote; hoops: readonly HoopPlacement[]; hoopsSource: Sourced; peg: { x: number; y: number } & Sourced }`
  - `lawsReference: { outOfCourt; hoopRunStart; hoopRunComplete: OffsetRule }`
  - `lawnReference: { speedDefinition: ReferenceQuote; speedDistance; defaultSpeed: ReferenceValue }`
  - `frictionReference: { ballTurfSliding; ballBallRestitution; ballBallFriction; ballUprightRestitution; ballUprightFriction; ballPegRestitution; ballPegFriction: ReferenceValue }`

- [ ] **Step 1: Write `reference/README.md`**

````markdown
# Reference data

Every physical constant the app uses lives here, one JSON file per topic, and every entry carries its source.
`src/reference/index.ts` validates the files at load time (`src/reference/schema.ts`).

## Entry shapes

- **Value:** `{ "value": <number, SI>, "unit": "<SI unit>", "bounds": [lo, hi]?, "source": "<citation or URL>",
  "provenance": "direct" | "analogue" | "derived", "note": "<original units, conversion, caveats>"? }`
- **Quote:** `{ "quote": "<verbatim text>", "source": …, "provenance": …, "note": …? }`
- **Offset rule** (laws.json): a quote plus `"ballRadii"` and `"uprightRadii"` coefficients (see below).

`bounds` are the plausible range: the Laws' tolerance for specified equipment, or the spread in the literature
for measured quantities. `provenance: "analogue"` means the figure comes from a comparable domain and is
explained in `note`.

## Coordinates

Origin at the south-west corner of the court (the inner edge of the boundary). `x` runs east along the south
boundary, `y` runs north along the west boundary. Hoop `normalX`/`normalY` is the unit horizontal vector
perpendicular to the plane of the hoop (the direction a ball runs it when going "north" for hoops set
north–south).

## Offset rules

A rule's threshold is `ballRadii × R + uprightRadii × r`, where `R` is the ball radius and `r` the upright radius.

- `outOfCourt`: a ball is out of court when its centre's distance **beyond** the boundary line is at least the
  threshold. A negative threshold means "still inside by that much" (e.g. `-1 × R` if any part of the ball
  crossing the line makes it out).
- `hoopRunStart`: a ball can run a hoop in a stroke only if, at the start of the stroke, its centre's signed
  distance from the plane through the uprights' axes (positive in the running direction) is at most the threshold.
- `hoopRunComplete`: the ball has completed running when that signed distance is at least the threshold.

The derivation of each coefficient from the quoted Law goes in `note`.
````

- [ ] **Step 2: Source and write `reference/ball.json`**

Keys: `diameter` (m), `mass` (kg), `rebound` (quote of the rebound/bounce requirement). `bounds` from the
specification's tolerances. Sanity check only — **do not copy**: the diameter is expected near 3⅝ in (≈ 0.0921 m)
and the mass near 1 lb (≈ 0.454 kg); a sourced figure far from these means the wrong document.

```json
{
    "diameter": { "value": 0, "unit": "m", "bounds": [0, 0], "source": "", "provenance": "direct", "note": "" },
    "mass": { "value": 0, "unit": "kg", "bounds": [0, 0], "source": "", "provenance": "direct", "note": "" },
    "rebound": { "quote": "", "source": "", "provenance": "direct" }
}
```

(The zeros and empty strings above show the shape only; the validator rejects them, so the tests in Step 8 fail
until every field holds sourced content.)

- [ ] **Step 3: Source and write `reference/court.json`**

Keys: `length` and `width` (m; full-size court), `hoopInnerWidth` (m; the specified inside width between
uprights, with the permitted tolerance as `bounds`), `uprightDiameter` (m), `pegDiameter` (m), `layout` (quote of
the standard setting of hoops and peg), `hoops` (object: attribution fields plus `positions`), `pegPosition`.
Hoop and peg positions are derived from the layout quote with `"provenance": "derived"` and the arithmetic in
`note`. Sanity check only: the court is expected to be 35 × 28 yd (≈ 32.00 × 25.60 m) with the peg at the centre.

```json
{
    "length": { "value": 0, "unit": "m", "source": "", "provenance": "direct", "note": "" },
    "width": { "value": 0, "unit": "m", "source": "", "provenance": "direct", "note": "" },
    "hoopInnerWidth": { "value": 0, "unit": "m", "bounds": [0, 0], "source": "", "provenance": "direct", "note": "" },
    "uprightDiameter": { "value": 0, "unit": "m", "source": "", "provenance": "direct", "note": "" },
    "pegDiameter": { "value": 0, "unit": "m", "source": "", "provenance": "direct", "note": "" },
    "layout": { "quote": "", "source": "", "provenance": "direct" },
    "hoops": {
        "source": "",
        "provenance": "derived",
        "note": "",
        "positions": [
            { "id": "1", "x": 0, "y": 0, "normalX": 0, "normalY": 1 },
            { "id": "2", "x": 0, "y": 0, "normalX": 0, "normalY": 1 },
            { "id": "3", "x": 0, "y": 0, "normalX": 0, "normalY": 1 },
            { "id": "4", "x": 0, "y": 0, "normalX": 0, "normalY": 1 },
            { "id": "5", "x": 0, "y": 0, "normalX": 0, "normalY": 1 },
            { "id": "6", "x": 0, "y": 0, "normalX": 0, "normalY": 1 }
        ]
    },
    "pegPosition": { "x": 0, "y": 0, "source": "", "provenance": "derived", "note": "" }
}
```

Use the hoop numbering from the Laws (hoops 1–6 by position). Set each normal from the layout (hoops are expected
to be set with their plane east–west, i.e. normal `(0, 1)`); if the source says otherwise, follow the source.

- [ ] **Step 4: Source and write `reference/laws.json`**

Quote the current Laws of Association Croquet verbatim for: when a ball is out of court; when a ball may begin to
run a hoop in a stroke; when a ball has completed running a hoop. Derive `ballRadii`/`uprightRadii` per the
conventions in `reference/README.md` and put the derivation in `note`. If a quoted Law cannot be expressed as a
single signed-offset threshold of that form, **stop and report BLOCKED** with the quote — the engine's rule model
would need changing.

```json
{
    "outOfCourt": { "quote": "", "source": "", "provenance": "direct", "ballRadii": 0, "uprightRadii": 0, "note": "" },
    "hoopRunStart": { "quote": "", "source": "", "provenance": "direct", "ballRadii": 0, "uprightRadii": 0, "note": "" },
    "hoopRunComplete": { "quote": "", "source": "", "provenance": "direct", "ballRadii": 0, "uprightRadii": 0, "note": "" }
}
```

- [ ] **Step 5: Source and write `reference/lawn.json`**

Keys: `speedDefinition` (quote of how croquet lawn speed is defined and measured), `speedDistance` (m; the distance
the definition times the ball over, from strike to rest), `defaultSpeed` (s; a typical club lawn speed, with the
usual range as `bounds`). If the definition is not "time for a struck ball to travel a stated distance and stop",
**stop and report BLOCKED** — Task 8's conversion assumes that form.

```json
{
    "speedDefinition": { "quote": "", "source": "", "provenance": "direct" },
    "speedDistance": { "value": 0, "unit": "m", "source": "", "provenance": "direct", "note": "" },
    "defaultSpeed": { "value": 0, "unit": "s", "bounds": [0, 0], "source": "", "provenance": "direct", "note": "" }
}
```

- [ ] **Step 6: Source and write `reference/friction.json`**

All dimensionless (`"unit": "1"`), each with `bounds`: `ballTurfSliding` (sliding-friction coefficient between
ball and turf), `ballBallRestitution`, `ballBallFriction`, `ballUprightRestitution`, `ballUprightFriction`,
`ballPegRestitution`, `ballPegFriction`. The ball's rebound specification (ball.json) may support a derived
restitution; show the arithmetic in `note`.

```json
{
    "ballTurfSliding": { "value": 0, "unit": "1", "bounds": [0, 0], "source": "", "provenance": "analogue", "note": "" },
    "ballBallRestitution": { "value": 0, "unit": "1", "bounds": [0, 0], "source": "", "provenance": "derived", "note": "" },
    "ballBallFriction": { "value": 0, "unit": "1", "bounds": [0, 0], "source": "", "provenance": "analogue", "note": "" },
    "ballUprightRestitution": { "value": 0, "unit": "1", "bounds": [0, 0], "source": "", "provenance": "analogue", "note": "" },
    "ballUprightFriction": { "value": 0, "unit": "1", "bounds": [0, 0], "source": "", "provenance": "analogue", "note": "" },
    "ballPegRestitution": { "value": 0, "unit": "1", "bounds": [0, 0], "source": "", "provenance": "analogue", "note": "" },
    "ballPegFriction": { "value": 0, "unit": "1", "bounds": [0, 0], "source": "", "provenance": "analogue", "note": "" }
}
```

(Provenance values shown are expectations; record what the source actually supports.)

- [ ] **Step 7: Write the failing reference test**

`tests/reference/reference.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
    ballReference,
    courtReference,
    frictionReference,
    lawnReference,
    lawsReference,
} from "../../src/reference/index";

describe("reference data", () => {
    it("loads every topic", () => {
        expect(ballReference.diameter.value).toBeGreaterThan(0);
        expect(courtReference.hoops).toHaveLength(6);
        expect(lawsReference.hoopRunComplete.quote.length).toBeGreaterThan(0);
        expect(lawnReference.speedDistance.value).toBeGreaterThan(0);
        expect(frictionReference.ballTurfSliding.value).toBeGreaterThan(0);
    });

    it("lets a ball pass through a hoop", () => {
        expect(courtReference.hoopInnerWidth.value).toBeGreaterThan(ballReference.diameter.value);
    });

    it("places every hoop and the peg inside the court with unique ids and unit normals", () => {
        const ids = new Set(courtReference.hoops.map((h) => h.id));
        expect(ids.size).toBe(6);
        for (const h of [...courtReference.hoops, { ...courtReference.peg, normalX: 1, normalY: 0 }]) {
            expect(h.x).toBeGreaterThan(0);
            expect(h.x).toBeLessThan(courtReference.width.value);
            expect(h.y).toBeGreaterThan(0);
            expect(h.y).toBeLessThan(courtReference.length.value);
            expect(Math.hypot(h.normalX, h.normalY)).toBeCloseTo(1, 12);
        }
    });

    it("lays the hoops out symmetrically about the north–south centre line", () => {
        const w = courtReference.width.value;
        for (const h of courtReference.hoops) {
            const mirrored = courtReference.hoops.some(
                (o) => Math.abs(o.x - (w - h.x)) < 1e-3 && Math.abs(o.y - h.y) < 1e-3,
            );
            expect(mirrored, `hoop ${h.id} has no mirror image`).toBe(true);
        }
        expect(courtReference.peg.x).toBeCloseTo(w / 2, 3);
    });

    it("keeps restitution within [0, 1] and friction non-negative", () => {
        for (const key of ["ballBallRestitution", "ballUprightRestitution", "ballPegRestitution"] as const) {
            expect(frictionReference[key].value).toBeGreaterThanOrEqual(0);
            expect(frictionReference[key].value).toBeLessThanOrEqual(1);
        }
        for (const key of ["ballTurfSliding", "ballBallFriction", "ballUprightFriction", "ballPegFriction"] as const) {
            expect(frictionReference[key].value).toBeGreaterThanOrEqual(0);
        }
    });
});
```

(`Math.hypot` is fine in tests; the determinism lint rule applies to `src/engine/**` only.)

- [ ] **Step 8: Run the test to verify it fails**

Run: `npx vitest run tests/reference/reference.test.ts`
Expected: FAIL — cannot resolve `../../src/reference/index` (or, once Step 9 exists, `ReferenceDataError` for any
field still holding placeholder shape content).

- [ ] **Step 9: Implement `src/reference/index.ts`**

```ts
/**
 * Validated, typed access to the sourced reference data in reference/*.json. Loading fails with a
 * ReferenceDataError if any entry is malformed or unsourced.
 */
import ballJson from "../../reference/ball.json";
import courtJson from "../../reference/court.json";
import frictionJson from "../../reference/friction.json";
import lawnJson from "../../reference/lawn.json";
import lawsJson from "../../reference/laws.json";
import {
    ReferenceDataError,
    readArray,
    readNumber,
    readQuote,
    readSourced,
    readString,
    readValue,
    type ReferenceQuote,
    type Sourced,
} from "./schema";

/** A hoop's position (m) and the unit normal to its plane. */
export interface HoopPlacement {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly normalX: number;
    readonly normalY: number;
}

/** A Law expressed as a signed-offset threshold: ballRadii × R + uprightRadii × r. See reference/README.md. */
export interface OffsetRule extends ReferenceQuote {
    readonly ballRadii: number;
    readonly uprightRadii: number;
}

function readOffsetRule(section: unknown, key: string, path: string): OffsetRule {
    const quote = readQuote(section, key, path);
    const item = (section as Record<string, unknown>)[key];
    return {
        ...quote,
        ballRadii: readNumber(item, "ballRadii", `${path}.${key}`),
        uprightRadii: readNumber(item, "uprightRadii", `${path}.${key}`),
    };
}

function readHoops(section: unknown): readonly HoopPlacement[] {
    const hoops = (section as Record<string, unknown>)["hoops"];
    return readArray(hoops, "positions", "court.hoops").map((item, i) => {
        const path = `court.hoops.positions[${i}]`;
        return {
            id: readString(item, "id", path),
            x: readNumber(item, "x", path),
            y: readNumber(item, "y", path),
            normalX: readNumber(item, "normalX", path),
            normalY: readNumber(item, "normalY", path),
        };
    });
}

function readHoopsSource(section: unknown): Sourced {
    const hoops = (section as Record<string, unknown>)["hoops"];
    if (hoops === undefined) {
        throw new ReferenceDataError("court.hoops", "missing");
    }
    return readSourced(hoops, "court.hoops");
}

function readPeg(section: unknown): { readonly x: number; readonly y: number } & Sourced {
    const peg = (section as Record<string, unknown>)["pegPosition"];
    return {
        x: readNumber(peg, "x", "court.pegPosition"),
        y: readNumber(peg, "y", "court.pegPosition"),
        ...readSourced(peg, "court.pegPosition"),
    };
}

/** Official ball specification. */
export const ballReference = {
    diameter: readValue(ballJson, "diameter", "ball"),
    mass: readValue(ballJson, "mass", "ball"),
    rebound: readQuote(ballJson, "rebound", "ball"),
} as const;

/** Court dimensions and standard setting. */
export const courtReference = {
    length: readValue(courtJson, "length", "court"),
    width: readValue(courtJson, "width", "court"),
    hoopInnerWidth: readValue(courtJson, "hoopInnerWidth", "court"),
    uprightDiameter: readValue(courtJson, "uprightDiameter", "court"),
    pegDiameter: readValue(courtJson, "pegDiameter", "court"),
    layout: readQuote(courtJson, "layout", "court"),
    hoops: readHoops(courtJson),
    hoopsSource: readHoopsSource(courtJson),
    peg: readPeg(courtJson),
} as const;

/** Laws expressed as signed-offset thresholds. */
export const lawsReference = {
    outOfCourt: readOffsetRule(lawsJson, "outOfCourt", "laws"),
    hoopRunStart: readOffsetRule(lawsJson, "hoopRunStart", "laws"),
    hoopRunComplete: readOffsetRule(lawsJson, "hoopRunComplete", "laws"),
} as const;

/** Lawn-speed definition and typical value. */
export const lawnReference = {
    speedDefinition: readQuote(lawnJson, "speedDefinition", "lawn"),
    speedDistance: readValue(lawnJson, "speedDistance", "lawn"),
    defaultSpeed: readValue(lawnJson, "defaultSpeed", "lawn"),
} as const;

/** Free-motion friction and restitution coefficients. */
export const frictionReference = {
    ballTurfSliding: readValue(frictionJson, "ballTurfSliding", "friction"),
    ballBallRestitution: readValue(frictionJson, "ballBallRestitution", "friction"),
    ballBallFriction: readValue(frictionJson, "ballBallFriction", "friction"),
    ballUprightRestitution: readValue(frictionJson, "ballUprightRestitution", "friction"),
    ballUprightFriction: readValue(frictionJson, "ballUprightFriction", "friction"),
    ballPegRestitution: readValue(frictionJson, "ballPegRestitution", "friction"),
    ballPegFriction: readValue(frictionJson, "ballPegFriction", "friction"),
} as const;
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npx vitest run tests/reference`
Expected: PASS. If the symmetry or ball-fits test fails, re-check the source rather than adjusting the test.

- [ ] **Step 11: Format, lint, commit**

```bash
npm run format
```

```bash
npm run lint
```

```bash
git add reference src/reference/index.ts tests/reference/reference.test.ts
```

```bash
git commit -m "Source ball, court, Laws, lawn-speed and friction reference data"
```

---

### Task 5: Engine types and single-ball motion

The physics of a ball on turf between collisions (spec §5 phase 2). With `u` the slip velocity of the contact
point, `μs` the sliding friction and `g` gravity:

- **Sliding:** friction `−μs·m·g·û` with `û` constant, so the path is a parabola (this curvature is where pull
  shows). Slip decays as `du/dt = −(7/2)·μs·g·û`, so sliding lasts `2|u₀| / (7·μs·g)`.
- **Rolling:** constant deceleration `μr·g` along the direction of travel; spin stays locked to velocity.
- **Stationary:** at rest.

A centre-struck spinless ball therefore begins rolling at exactly 5/7 of its launch speed.

**Files:**
- Create: `src/engine/types.ts`, `src/engine/motion.ts`
- Create: `tests/engine/support/rng.ts`, `tests/engine/support/energy.ts`
- Test: `tests/engine/motion.test.ts`

**Interfaces:**
- Consumes: `vec3.ts` (Task 1).
- Produces:
  - `types.ts`: `type BallId = "blue" | "red" | "black" | "yellow"`, `BALL_IDS: readonly BallId[]`,
    `type MotionPhase = "sliding" | "rolling" | "stationary"`,
    `interface BallState { readonly position: Vec3; readonly velocity: Vec3; readonly angularVelocity: Vec3 }`,
    `interface MotionParams { readonly radius: number; readonly slidingDecel: number; readonly rollingDecel: number }`
    (decelerations in m/s², i.e. coefficient × g), `interface BallParams { readonly radius: number; readonly mass: number }`.
  - `motion.ts`: `SPEED_EPSILON = 1e-9`, `contactSlip(s: BallState, radius: number): Vec3`,
    `classify(s: BallState, radius: number): MotionPhase`,
    `phaseDuration(s: BallState, phase: MotionPhase, p: MotionParams): number` (∞ for stationary),
    `interface Trajectory { readonly c0: Vec3; readonly c1: Vec3; readonly c2: Vec3 }` (centre `c0 + c1·t + c2·t²`),
    `trajectory(s, phase, p): Trajectory`, `advance(s, phase, p, t): BallState`,
    `endOfPhase(s, phase, p): BallState`, `rollingSpin(velocity: Vec3, spinZ: number, radius: number): Vec3`,
    `atRest(position: Vec3): BallState`.
  - Test support: `rng(seed: number): () => number`; `kineticEnergy(s: BallState, ball: BallParams): number`.

- [ ] **Step 1: Write the engine types**

`src/engine/types.ts`:

```ts
/**
 * Core engine data types. Later tasks append World and ShotResult types to this file.
 */
import type { Vec3 } from "./math/vec3";

/** The four balls, identified by colour. */
export type BallId = "blue" | "red" | "black" | "yellow";

/** Canonical ball order. The engine always iterates balls in this order, which keeps results deterministic. */
export const BALL_IDS: readonly BallId[] = ["blue", "red", "black", "yellow"];

/** Motion phase of a ball on the lawn. */
export type MotionPhase = "sliding" | "rolling" | "stationary";

/** Full kinematic state of a ball. Position is the centre; a resting ball has position.z = radius. */
export interface BallState {
    readonly position: Vec3;
    readonly velocity: Vec3;
    readonly angularVelocity: Vec3;
}

/** Mass properties of a ball (uniform solid sphere, I = 2/5·m·r²). */
export interface BallParams {
    readonly radius: number;
    readonly mass: number;
}

/** Parameters governing free motion over one segment. Decelerations are coefficient × g, in m/s². */
export interface MotionParams {
    readonly radius: number;
    readonly slidingDecel: number;
    readonly rollingDecel: number;
}
```

- [ ] **Step 2: Write the test support helpers**

`tests/engine/support/rng.ts`:

```ts
/** Deterministic pseudo-random numbers in [0, 1) (mulberry32). Test-only. */
export function rng(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
```

`tests/engine/support/energy.ts`:

```ts
import { lengthSq } from "../../../src/engine/math/vec3";
import type { BallParams, BallState } from "../../../src/engine/types";

/** Translational plus rotational kinetic energy of a solid sphere (J). */
export function kineticEnergy(s: BallState, ball: BallParams): number {
    const inertia = 0.4 * ball.mass * ball.radius * ball.radius;
    return 0.5 * ball.mass * lengthSq(s.velocity) + 0.5 * inertia * lengthSq(s.angularVelocity);
}
```

- [ ] **Step 3: Write the failing motion tests**

`tests/engine/motion.test.ts` (parameters are explicit test values, not physical claims):

```ts
import { describe, expect, it } from "vitest";
import { vec3, ZERO } from "../../src/engine/math/vec3";
import { advance, classify, contactSlip, endOfPhase, phaseDuration, rollingSpin } from "../../src/engine/motion";
import type { BallState, MotionParams } from "../../src/engine/types";
import { kineticEnergy } from "./support/energy";
import { rng } from "./support/rng";

const R = 0.046;
const P: MotionParams = { radius: R, slidingDecel: 3, rollingDecel: 0.5 };
const BALL = { radius: R, mass: 0.454 };

function ball(velocity = ZERO, angularVelocity = ZERO): BallState {
    return { position: vec3(0, 0, R), velocity, angularVelocity };
}

describe("classify", () => {
    it("distinguishes sliding, rolling and stationary", () => {
        expect(classify(ball(vec3(1, 0, 0)), R)).toBe("sliding");
        expect(classify(ball(vec3(1, 0, 0), rollingSpin(vec3(1, 0, 0), 0, R)), R)).toBe("rolling");
        expect(classify(ball(), R)).toBe("stationary");
        expect(classify(ball(vec3(1e-12, 0, 0)), R)).toBe("stationary");
    });

    it("treats a ball with backspin and no velocity as sliding", () => {
        expect(classify(ball(ZERO, vec3(0, -10, 0)), R)).toBe("sliding");
    });
});

describe("sliding", () => {
    it("begins rolling at 5/7 of launch speed for a centre-struck spinless ball", () => {
        const s = ball(vec3(2, 0, 0));
        const end = endOfPhase(s, "sliding", P);
        expect(end.velocity.x).toBeCloseTo((5 / 7) * 2, 12);
        expect(end.velocity.y).toBe(0);
        expect(classify(end, R)).toBe("rolling");
        expect(Math.hypot(contactSlip(end, R).x, contactSlip(end, R).y)).toBeLessThanOrEqual(1e-12);
    });

    it("covers the analytic sliding distance", () => {
        const v0 = 2;
        const tau = (2 * v0) / (7 * P.slidingDecel);
        expect(phaseDuration(ball(vec3(v0, 0, 0)), "sliding", P)).toBeCloseTo(tau, 14);
        const end = endOfPhase(ball(vec3(v0, 0, 0)), "sliding", P);
        expect(end.position.x).toBeCloseTo(v0 * tau - 0.5 * P.slidingDecel * tau * tau, 12);
    });

    it("stops shorter with backspin (stop shot) and further with topspin", () => {
        const plain = endOfPhase(ball(vec3(2, 0, 0)), "sliding", P).velocity.x;
        const back = endOfPhase(ball(vec3(2, 0, 0), vec3(0, -20, 0)), "sliding", P).velocity.x;
        const top = endOfPhase(ball(vec3(2, 0, 0), vec3(0, 60, 0)), "sliding", P).velocity.x;
        expect(back).toBeLessThan(plain);
        expect(top).toBeGreaterThan(plain);
    });

    it("curves the path when the slip is not along the velocity", () => {
        // Spin about +x gives the contact point slip toward +y, so friction pulls the ball toward −y.
        const s = ball(vec3(2, 0, 0), vec3(20, 0, 0));
        const end = endOfPhase(s, "sliding", P);
        expect(end.position.y).toBeLessThan(0);
        expect(end.velocity.y).toBeLessThan(0);
    });

    it("keeps the ball on the lawn plane", () => {
        const end = endOfPhase(ball(vec3(2, 1, 0), vec3(3, -7, 4)), "sliding", P);
        expect(end.position.z).toBe(R);
        expect(end.velocity.z).toBe(0);
    });
});

describe("rolling", () => {
    it("stops after v²/(2a)", () => {
        const v = vec3(1.5, 0, 0);
        const end = endOfPhase(ball(v, rollingSpin(v, 0, R)), "rolling", P);
        expect(end.position.x).toBeCloseTo((1.5 * 1.5) / (2 * P.rollingDecel), 12);
        expect(end.velocity).toEqual(ZERO);
        expect(end.angularVelocity).toEqual(ZERO);
    });

    it("keeps spin locked to velocity while rolling", () => {
        const v = vec3(0.6, 0.8, 0);
        const mid = advance(ball(v, rollingSpin(v, 0, R)), "rolling", P, 0.5);
        expect(Math.hypot(contactSlip(mid, R).x, contactSlip(mid, R).y)).toBeLessThan(1e-12);
    });
});

describe("advance", () => {
    it("is the identity at t = 0 and for a stationary ball", () => {
        const s = ball(vec3(1, 0, 0));
        expect(advance(s, "sliding", P, 0)).toEqual(s);
        expect(advance(ball(), "stationary", P, 5)).toEqual(ball());
    });

    it("never increases kinetic energy within a phase", () => {
        const random = rng(1);
        for (let n = 0; n < 200; n++) {
            const s = ball(
                vec3(random() * 4 - 2, random() * 4 - 2, 0),
                vec3(random() * 80 - 40, random() * 80 - 40, random() * 10 - 5),
            );
            const phase = classify(s, R);
            const duration = phaseDuration(s, phase, P);
            let previous = kineticEnergy(s, BALL);
            for (let i = 1; i <= 20; i++) {
                const e = kineticEnergy(advance(s, phase, P, (duration * i) / 20), BALL);
                expect(e).toBeLessThanOrEqual(previous + 1e-12);
                previous = e;
            }
        }
    });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/motion.test.ts`
Expected: FAIL — cannot resolve `../../src/engine/motion`.

- [ ] **Step 5: Implement `src/engine/motion.ts`**

```ts
/**
 * Closed-form motion of a single ball on flat turf within one motion phase.
 *
 * Contact with the turf is at −R·ẑ from the centre, so the contact point's slip velocity is
 * u = v + ω × (−R·ẑ) = (vx − R·ωy, vy + R·ωx). While sliding, friction −μs·m·g·û acts with û constant; the torque
 * it applies changes ω by (−5a·ûy/2R, 5a·ûx/2R, 0) per second (a = μs·g), which makes the slip decay at (7/2)·a.
 * While rolling, the ball decelerates uniformly along its direction of travel with spin locked to velocity.
 * Spin about the vertical axis (ωz) has no effect on the path and is carried unchanged until the ball stops.
 */
import { ZERO, add, horizontal, length, normalize, scale, sub, vec3, type Vec3 } from "./math/vec3";
import type { BallState, MotionParams, MotionPhase } from "./types";

/** Speeds (m/s) at or below this are treated as zero. */
export const SPEED_EPSILON = 1e-9;

/** Returns the horizontal slip velocity of the ball's contact point with the turf. */
export function contactSlip(s: BallState, radius: number): Vec3 {
    const v = s.velocity;
    const w = s.angularVelocity;
    return vec3(v.x - radius * w.y, v.y + radius * w.x, 0);
}

/** Returns the angular velocity of a ball rolling without slip at the given velocity, keeping spin about z. */
export function rollingSpin(velocity: Vec3, spinZ: number, radius: number): Vec3 {
    return vec3(-velocity.y / radius, velocity.x / radius, spinZ);
}

/** Returns a ball at rest at the given centre position. */
export function atRest(position: Vec3): BallState {
    return { position, velocity: ZERO, angularVelocity: ZERO };
}

/** Determines the motion phase of a ball from its state. */
export function classify(s: BallState, radius: number): MotionPhase {
    if (length(contactSlip(s, radius)) > SPEED_EPSILON) {
        return "sliding";
    }
    if (length(horizontal(s.velocity)) > SPEED_EPSILON) {
        return "rolling";
    }
    return "stationary";
}

/** Returns how long the ball stays in the given phase (Infinity when stationary). */
export function phaseDuration(s: BallState, phase: MotionPhase, p: MotionParams): number {
    switch (phase) {
        case "sliding":
            return (2 * length(contactSlip(s, p.radius))) / (7 * p.slidingDecel);
        case "rolling":
            return length(horizontal(s.velocity)) / p.rollingDecel;
        case "stationary":
            return Infinity;
    }
}

/** Centre trajectory within a phase: position(t) = c0 + c1·t + c2·t². */
export interface Trajectory {
    readonly c0: Vec3;
    readonly c1: Vec3;
    readonly c2: Vec3;
}

/** Returns the polynomial centre trajectory of the ball for the rest of the given phase. */
export function trajectory(s: BallState, phase: MotionPhase, p: MotionParams): Trajectory {
    const v = horizontal(s.velocity);
    switch (phase) {
        case "sliding":
            return { c0: s.position, c1: v, c2: scale(normalize(contactSlip(s, p.radius)), -0.5 * p.slidingDecel) };
        case "rolling":
            return { c0: s.position, c1: v, c2: scale(normalize(v), -0.5 * p.rollingDecel) };
        case "stationary":
            return { c0: s.position, c1: ZERO, c2: ZERO };
    }
}

/** Returns the state after time t (0 ≤ t ≤ phaseDuration) in the given phase. */
export function advance(s: BallState, phase: MotionPhase, p: MotionParams, t: number): BallState {
    if (phase === "stationary" || t === 0) {
        return s;
    }
    const v = horizontal(s.velocity);
    if (phase === "sliding") {
        const u = normalize(contactSlip(s, p.radius));
        const a = p.slidingDecel;
        const k = (5 * a * t) / (2 * p.radius);
        return {
            position: add(add(s.position, scale(v, t)), scale(u, -0.5 * a * t * t)),
            velocity: sub(v, scale(u, a * t)),
            angularVelocity: vec3(s.angularVelocity.x - k * u.y, s.angularVelocity.y + k * u.x, s.angularVelocity.z),
        };
    }
    const d = normalize(v);
    const a = p.rollingDecel;
    const velocity = sub(v, scale(d, a * t));
    return {
        position: add(add(s.position, scale(v, t)), scale(d, -0.5 * a * t * t)),
        velocity,
        angularVelocity: rollingSpin(velocity, s.angularVelocity.z, p.radius),
    };
}

/**
 * Returns the state at the exact end of the phase, snapped onto the next phase: at the end of sliding, spin is
 * locked to velocity (removing rounding residue in the slip); at the end of rolling, the ball is at rest.
 */
export function endOfPhase(s: BallState, phase: MotionPhase, p: MotionParams): BallState {
    if (phase === "stationary") {
        return s;
    }
    const end = advance(s, phase, p, phaseDuration(s, phase, p));
    if (phase === "rolling") {
        return atRest(end.position);
    }
    return { ...end, angularVelocity: rollingSpin(end.velocity, end.angularVelocity.z, p.radius) };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/motion.test.ts`
Expected: PASS.

- [ ] **Step 7: Lint and commit**

```bash
npm run lint
```

```bash
git add src/engine/types.ts src/engine/motion.ts tests/engine/motion.test.ts tests/engine/support
```

```bash
git commit -m "Add closed-form single-ball motion"
```

---

### Task 6: Event-time detection

Detection answers one question per pair of bodies: when do they next come into contact? Bodies that are already
touching are **not** decided here. Whether a touching pair collides, pushes or separates at t = 0 is decided by the
simulator (Task 9) from `approachSpeed` and the resting-contact solver (Task 7), which resolution uses too, so
detection and resolution can never disagree (pre-flight I2). For touching bodies, `approachTime` reports only a
genuine new contact after the gap has opened past `CONTACT_TOLERANCE`, or, as a safety net, the moment the bodies
would overlap by more than `CONTACT_TOLERANCE`. That net catches the re-approach the original design lost (pre-flight
B3: a pair "barely separating" with f never becoming positive).

**Files:**
- Create: `src/engine/detect.ts`
- Test: `tests/engine/detect.test.ts`

**Interfaces:**
- Consumes: `realRootsInInterval` (Task 2); `Trajectory` (Task 5); `vec3.ts`.
- Produces:
  - `CONTACT_TOLERANCE = 1e-9` (m)
  - `isTouching(offset: Vec3, distance: number): boolean` — centre distance within `CONTACT_TOLERANCE` of `distance`
    (overlap counts as touching).
  - `approachSpeed(offset: Vec3, relativeVelocity: Vec3): number` — closing speed along the line of centres
    (positive when approaching). **The** approaching predicate: detection, resolution (Task 7) and the resting-contact
    solver all call it.
  - `approachTime(a: Vec3, b: Vec3, c: Vec3, distance: number, horizon: number): number | null` — earliest
    `t ∈ (0, horizon]` of a new contact of the relative trajectory `a + b·t + c·t²`; never 0 (see above). Throws
    `RangeError` for a non-finite horizon.
  - `firstNonNegative(coeffs: readonly number[], horizon: number): number | null` — earliest `t ∈ [0, horizon]` at
    which g rises to ≥ 0: 0 if `g(0) ≥ 0`, otherwise the first root from `realRootsInInterval` (pre-flight M1).
    That root is a bisection lower bracket end, or for linear g the correctly rounded quotient, which may lie
    marginally on either side. It is used only for thresholds where that does not matter, never to keep bodies
    apart.

Root semantics (Task 2 review). Only bisection roots keep the sign the polynomial has at `lo`; a degree-1 root is a
rounded quotient, and knots are rounded critical points, so a near-double root can be missed.

- The contact quartic f(t) = |A + B·t + C·t²|² − d² is never of degree 1: f4 = 0 forces C = 0, and then f2 = |B|²
  = 0 forces f1 = 0. Every contact root is therefore a bisection root, and a reported contact is never inside an
  overlap.
- A graze within rounding of tangency may be missed; its overlap is then itself at rounding level.
- Linear roots appear only in thresholds (halt margin, out of court, a hoop plane) and in `pushDuration`. At those
  points the next step tolerates either side: speeds are compared with `SPEED_EPSILON`, and Task 10 reconciles the
  hoop-plane side at segment boundaries.
  - `interface Bounds { readonly width: number; readonly length: number }`
  - `boundaryCrossingTime(traj: Trajectory, bounds: Bounds, threshold: number, horizon: number): number | null` —
    earliest time the centre's outward distance beyond any boundary line reaches `threshold`.
  - `outwardDistance(position: Vec3, bounds: Bounds): number` — max over the four lines of the centre's distance
    beyond that line (negative when inside).

- [ ] **Step 1: Write the failing tests**

`tests/engine/detect.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
    CONTACT_TOLERANCE,
    approachSpeed,
    approachTime,
    boundaryCrossingTime,
    isTouching,
    outwardDistance,
} from "../../src/engine/detect";
import { ZERO, vec3 } from "../../src/engine/math/vec3";

const R = 0.046;
const TWO_R = 2 * R;
const BOUNDS = { width: 30, length: 40 };

describe("approachTime", () => {
    it("finds a head-on contact just before the surfaces touch", () => {
        const t = approachTime(vec3(-1, 0, 0), vec3(1, 0, 0), ZERO, TWO_R, 5);
        expect(t).toBeCloseTo(1 - TWO_R, 12);
        expect(-1 + (t as number)).toBeLessThanOrEqual(-TWO_R);
    });

    it("misses when the offset exceeds the contact distance", () => {
        expect(approachTime(vec3(-1, 3 * R, 0), vec3(1, 0, 0), ZERO, TWO_R, 5)).toBeNull();
    });

    it("treats an exact tangential graze as no contact", () => {
        expect(approachTime(vec3(-1, TWO_R, 0), vec3(1, 0, 0), ZERO, TWO_R, 5)).toBeNull();
    });

    it("never returns 0: touching bodies are decided by the caller", () => {
        // Approaching at 1 m/s from touching: only the overlap safety net fires, once the overlap reaches the
        // tolerance. Separating: nothing.
        const t = approachTime(vec3(-TWO_R, 0, 0), vec3(1, 0, 0), ZERO, TWO_R, 5);
        expect(t).toBeGreaterThan(0);
        expect(t).toBeCloseTo(CONTACT_TOLERANCE, 15);
        expect(approachTime(vec3(-TWO_R, 0, 0), vec3(-1, 0, 0), ZERO, TWO_R, 5)).toBeNull();
    });

    it("catches touching bodies driven together at zero relative speed before they overlap (B3)", () => {
        // Relative velocity zero, relative acceleration 1 m/s² toward each other: the gap is −t²/2.
        const t = approachTime(vec3(-TWO_R, 0, 0), ZERO, vec3(0.5, 0, 0), TWO_R, 5);
        expect(t).toBeCloseTo(Math.sqrt(2 * CONTACT_TOLERANCE), 9);
    });

    it("does not lose a re-approach that stays inside the tolerance band (B3 regression)", () => {
        // The pathological case from the pre-flight scan: barely separating (f1 > 0) but driven together
        // (f2 < 0), so f never becomes positive. The overlap net must still fire.
        const t = approachTime(vec3(-TWO_R, 0, 0), vec3(-1.8e-8, 0, 0), vec3(1.58, 0, 0), TWO_R, 1);
        expect(t).not.toBeNull();
        expect(t as number).toBeLessThan(1e-4);
    });

    it("finds a new contact after touching bodies separate and come back", () => {
        // x(t) = −2R − t + t²/2 returns to −2R at t = 2.
        const t = approachTime(vec3(-TWO_R, 0, 0), vec3(-1, 0, 0), vec3(0.5, 0, 0), TWO_R, 5);
        expect(t).toBeCloseTo(2, 9);
    });

    it("respects the horizon", () => {
        expect(approachTime(vec3(-1, 0, 0), vec3(1, 0, 0), ZERO, TWO_R, 0.5)).toBeNull();
    });

    it("detects nothing when the mover stops short", () => {
        // Starts 1 m away at 1 m/s decelerating at 1 m/s²: stops after 0.5 m.
        expect(approachTime(vec3(-1, 0, 0), vec3(1, 0, 0), vec3(-0.5, 0, 0), TWO_R, 1)).toBeNull();
    });

    it("finds a contact on a curving path", () => {
        const t = approachTime(vec3(-0.5, -0.2, 0), vec3(1, 0, 0), vec3(0, 0.5, 0), TWO_R, 2);
        expect(t).not.toBeNull();
        const x = -0.5 + (t as number);
        const y = -0.2 + 0.5 * (t as number) * (t as number);
        expect(Math.hypot(x, y)).toBeCloseTo(TWO_R, 9);
    });

    it("rejects a non-finite horizon", () => {
        expect(() => approachTime(vec3(-1, 0, 0), vec3(1, 0, 0), ZERO, TWO_R, Infinity)).toThrow(RangeError);
    });
});

describe("approachSpeed and isTouching", () => {
    it("is positive when closing, negative when separating and zero for sideways motion", () => {
        expect(approachSpeed(vec3(-TWO_R, 0, 0), vec3(2, 0, 0))).toBe(2);
        expect(approachSpeed(vec3(-TWO_R, 0, 0), vec3(-2, 0, 0))).toBe(-2);
        expect(approachSpeed(vec3(-TWO_R, 0, 0), vec3(0, 3, 0))).toBe(0);
        expect(approachSpeed(ZERO, vec3(1, 0, 0))).toBe(0);
    });

    it("treats gaps up to CONTACT_TOLERANCE as touching", () => {
        expect(isTouching(vec3(TWO_R + CONTACT_TOLERANCE / 2, 0, 0), TWO_R)).toBe(true);
        expect(isTouching(vec3(TWO_R + 2 * CONTACT_TOLERANCE, 0, 0), TWO_R)).toBe(false);
        expect(isTouching(vec3(TWO_R - 0.01, 0, 0), TWO_R)).toBe(true);
    });
});

describe("boundaries", () => {
    it("measures outward distance beyond the nearest line", () => {
        expect(outwardDistance(vec3(1, 20, R), BOUNDS)).toBeCloseTo(-1, 12);
        expect(outwardDistance(vec3(-0.2, 20, R), BOUNDS)).toBeCloseTo(0.2, 12);
        expect(outwardDistance(vec3(15, 40.5, R), BOUNDS)).toBeCloseTo(0.5, 12);
    });

    it("finds the crossing time for a threshold", () => {
        const traj = { c0: vec3(0.5, 20, R), c1: vec3(-1, 0, 0), c2: ZERO };
        expect(boundaryCrossingTime(traj, BOUNDS, 0, 5)).toBeCloseTo(0.5, 12);
        expect(boundaryCrossingTime(traj, BOUNDS, -R, 5)).toBeCloseTo(0.5 - R, 12);
        expect(boundaryCrossingTime(traj, BOUNDS, 0, 0.4)).toBeNull();
    });

    it("returns 0 when already beyond the threshold", () => {
        const traj = { c0: vec3(-0.1, 20, R), c1: ZERO, c2: ZERO };
        expect(boundaryCrossingTime(traj, BOUNDS, 0, 1)).toBe(0);
    });

    it("picks the earliest of several lines (corner)", () => {
        const traj = { c0: vec3(0.3, 0.5, R), c1: vec3(-1, -1, 0), c2: ZERO };
        expect(boundaryCrossingTime(traj, BOUNDS, 0, 5)).toBeCloseTo(0.3, 12);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/detect.test.ts`
Expected: FAIL — cannot resolve `../../src/engine/detect`.

- [ ] **Step 3: Implement `src/engine/detect.ts`**

```ts
/**
 * Event-time detection. Each ball's centre follows a quadratic within a segment, so the squared distance between
 * two balls (or a ball and a vertical cylinder) is a quartic in time; its earliest approaching root is the contact
 * time. Boundary distances are quadratics.
 *
 * Bodies that are already touching are not handled here: whether they collide, push or separate at t = 0 is decided
 * by the caller from `approachSpeed` and the resting-contact solver (push.ts), which resolution uses too.
 */
import { realRootsInInterval } from "./math/poly";
import { dot, horizontal, length, type Vec3 } from "./math/vec3";
import type { Trajectory } from "./motion";

/** Surfaces closer than this (m) are treated as touching. */
export const CONTACT_TOLERANCE = 1e-9;

/** Returns true when two bodies whose centres are `offset` apart are within CONTACT_TOLERANCE of `distance`. */
export function isTouching(offset: Vec3, distance: number): boolean {
    return length(horizontal(offset)) - distance <= CONTACT_TOLERANCE;
}

/**
 * Returns the speed (m/s) at which two bodies close along their line of centres: positive when approaching,
 * negative when separating. `offset` is the first centre minus the second and `relativeVelocity` the first
 * velocity minus the second. This is the single "approaching" predicate: detection and resolution both call it with
 * the same states, so they can never disagree about whether a touching pair is approaching.
 */
export function approachSpeed(offset: Vec3, relativeVelocity: Vec3): number {
    const d = horizontal(offset);
    const l = length(d);
    return l === 0 ? 0 : (0 - dot(d, horizontal(relativeVelocity))) / l;
}

/**
 * Returns the earliest t in (0, horizon] at which the horizontal relative trajectory a + b·t + c·t² comes within
 * `distance` of the origin while the separation is decreasing, or null if it does not. Bodies that start touching
 * report either a new contact after the gap has opened beyond CONTACT_TOLERANCE, or the moment they would overlap by
 * more than CONTACT_TOLERANCE (a safety net: the caller decides at t = 0 and normally prevents that). Throws
 * RangeError for a non-finite horizon.
 */
export function approachTime(a: Vec3, b: Vec3, c: Vec3, distance: number, horizon: number): number | null {
    if (!Number.isFinite(horizon)) {
        throw new RangeError("approachTime needs a finite horizon");
    }
    const A = horizontal(a);
    const B = horizontal(b);
    const C = horizontal(c);
    // f(t) = |A + B·t + C·t²|² − distance², expanded in ascending powers of t.
    const f0 = dot(A, A) - distance * distance;
    const f1 = 2 * dot(A, B);
    const f2 = dot(B, B) + 2 * dot(A, C);
    const f3 = 2 * dot(B, C);
    const f4 = dot(C, C);
    const slope = (t: number): number => f1 + t * (2 * f2 + t * (3 * f3 + t * 4 * f4));
    // f is never of degree 1 (f4 = 0 forces C = 0, then f2 = |B|² = 0 forces f1 = 0), so every root used here comes
    // from bisection and keeps the sign f has just before it: a reported contact time is never inside an overlap. A
    // near-double root (a graze within rounding of tangency) may be missed, but that overlap is at rounding level.

    const firstFalling = (offset: number, from: number): number | null =>
        realRootsInInterval([f0 + offset, f1, f2, f3, f4], from, horizon).find((t) => t > 0 && slope(t) < 0) ?? null;
    if (!isTouching(A, distance)) {
        return firstFalling(0, 0);
    }
    // f = +band where the gap is +CONTACT_TOLERANCE and f = −band (to first order) where it is −CONTACT_TOLERANCE.
    // Roots of f between the two are rounding noise of a contact that never opened, so they are ignored.
    const band = 2 * distance * CONTACT_TOLERANCE;
    const overlap = firstFalling(band, 0);
    const leave = realRootsInInterval([f0 - band, f1, f2, f3, f4], 0, horizon).find((t) => slope(t) > 0);
    const again = leave === undefined ? null : firstFalling(0, leave);
    if (overlap === null) {
        return again;
    }
    return again === null ? overlap : Math.min(overlap, again);
}

/**
 * Returns the earliest t in [0, horizon] at which g changes from negative to non-negative, for ascending
 * coefficients g: 0 if g(0) ≥ 0, otherwise the first root found by `realRootsInInterval`. That root is the lower end
 * of a bisection bracket (g there may still be marginally negative) or, for linear g, the correctly rounded quotient
 * (g there may be marginally either side). Callers use it only for thresholds where that does not matter (halt
 * margin, out of court, a coupled contact opening), never to keep bodies apart. Returns null if there is none.
 */
export function firstNonNegative(coeffs: readonly number[], horizon: number): number | null {
    if ((coeffs[0] ?? 0) >= 0) {
        return 0;
    }
    const roots = realRootsInInterval(coeffs, 0, horizon);
    return roots[0] ?? null;
}

/** Court extent (m): x ∈ [0, width], y ∈ [0, length]. */
export interface Bounds {
    readonly width: number;
    readonly length: number;
}

/** Returns how far the point lies beyond the nearest boundary line (negative when inside the court). */
export function outwardDistance(position: Vec3, bounds: Bounds): number {
    return Math.max(-position.x, position.x - bounds.width, -position.y, position.y - bounds.length);
}

/**
 * Returns the earliest t in [0, horizon] at which the trajectory's outward distance beyond any boundary line
 * reaches `threshold`, or null.
 */
export function boundaryCrossingTime(
    traj: Trajectory,
    bounds: Bounds,
    threshold: number,
    horizon: number,
): number | null {
    const { c0, c1, c2 } = traj;
    // Outward distance beyond each line, minus the threshold, as a quadratic in t: west, east, south, north.
    const lines: readonly (readonly number[])[] = [
        [-c0.x - threshold, -c1.x, -c2.x],
        [c0.x - bounds.width - threshold, c1.x, c2.x],
        [-c0.y - threshold, -c1.y, -c2.y],
        [c0.y - bounds.length - threshold, c1.y, c2.y],
    ];
    let best: number | null = null;
    for (const g of lines) {
        const t = firstNonNegative(g, horizon);
        if (t !== null && (best === null || t < best)) {
            best = t;
        }
    }
    return best;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/detect.test.ts`
Expected: PASS (17 tests).

- [ ] **Step 5: Format, lint, commit**

```bash
npm run format
```

```bash
npm run lint
```

```bash
git add src/engine/detect.ts tests/engine/detect.test.ts
```

```bash
git commit -m "Add contact and boundary event detection"
```

---

### Task 7: Collision impulses and resting contact

Free-motion collisions (spec §5: "instantaneous impulses with restitution and friction"). For two identical solid
spheres, a tangential impulse `J` changes the relative contact-point velocity by `7J/m`, so the impulse that stops
tangential slip is `m·|vt|/7`; Coulomb friction caps it at `μ·Jn`. Against a fixed cylinder the factor is `7/(2m)`.
Tangential friction is kept in the lawn plane: vertical slip at the equator would lift the ball, which the turf
prevents, and lift is the impact phase's concern (P2). Both impulse functions decide "approaching" with
`approachSpeed` (Task 6), so they agree with detection (pre-flight I2).

**Resting contact (pre-flight B3).** A ball driven into another by its own spin (a trailing ball sliding with
topspin) cannot be simulated with impulses alone: each rebound is smaller than the last, a Zeno sequence that no
event budget finishes. Contacts closing slower than `RESTING_SPEED` (1 mm/s, a numerical tolerance) are therefore
**resting contacts**, handled by `solveRestingContacts`:

1. **Velocities.** Along each resting contact normal, the touching balls' speeds are made equal: the smallest
   velocity change, weighted by effective inertia, that stops each contact closing or opening (perfectly inelastic, so
   energy never increases). A rolling or resting ball stays rolling through these small impulses; a sliding ball keeps
   its spin.
2. **Accelerations.** Each ball's turf force is frozen for the segment: sliding friction against the slip (effective
   inertia m), or rolling resistance against the travel (effective inertia 7m/5, since static friction keeps a pushed
   rolling ball rolling). A ball at rest stays put until the push on it exceeds (7m/5)·rollingDecel. Touching balls
   held at rest pass force to each other, so they resist as one static cluster: the cluster holds while the net push
   on it, less what obstacles it rests against take in compression, is within the sum of its members' resistances.
   The contact forces N ≥ 0 are frictionless and minimise Σ ½·wᵢ·|xᵢ − fᵢ|² subject to no contact converging:
   Gauss's principle of least constraint. It is solved exactly by trying held and released resting balls, then active
   sets, in a fixed order. A ball released from rest is accepted only if its acceleration agrees, to within
   `DIRECTION_TOLERANCE`, with the direction its resistance was built on; otherwise the candidate is rejected. Its
   rolling resistance therefore always opposes its motion and never does positive work. Pairs, chains, a ball held
   against an upright and a ball driven into two balls at an angle are all the same problem. Each coupled contact
   keeps its normal fixed for the segment, so relative motion is perpendicular to it and can only open the gap, never
   close it.
3. **Segment end.** A pushed segment ends when a frozen turf force stops being valid: the slip (sliding) or velocity
   (rolling) reaches zero along the frozen direction or turns more than `DIRECTION_TOLERANCE` away from it. It also ends
   when a coupled contact opens past `SEPARATION_TOLERANCE` or another contact intervenes (Task 9). The simulator then
   solves the group again. A contact force can only change sign at such an event, so "N → 0" is decided there: the
   contact is released when the new solution leaves it inactive.

**P1 limitation (ruled).** Coupled contacts are frictionless; impulse collisions keep their friction. Balls that slide
past each other while pushing (sidespin, pushes at an angle) are therefore not rubbed.

- **Cost.** Against a brute-force reference with ball–ball μ = 0.05, a sidespin push was about 27 mm off. Adversarial
  fuzz of bent chains with strong sidespin reached about 110 mm. With μ = 0 the two agree to 2.7 mm or better.
- **Unaffected.** Straight topspin pushes, the common croquet case, have no horizontal slip at the contact.
- **Fix, deferred to P2 or later:** kinetic Coulomb friction on coupled contacts, with slip and stick events.

Within a segment every acceleration is constant, so every trajectory stays a quadratic in t and uses only IEEE-exact
operations. An analytic case pins the model: a ball with topspin Ω at rest behind a resting ball. The pair accelerates
at `A = (5·μs·g − 7·μr·g)/12` until the pusher's slip is gone after `t = RΩ/(A + 5μs·g/2)`. The brute-force
integrator reproduces it (Task 11).

**Files:**
- Create: `src/engine/resolve.ts`, `src/engine/push.ts`
- Modify: `src/engine/types.ts` (append `ContactMaterial`, `PushMotion`)
- Test: `tests/engine/resolve.test.ts`, `tests/engine/push.test.ts`

**Interfaces:**
- Consumes: `BallState`, `BallParams`, `MotionParams`, `MotionPhase`, `classify`, `contactSlip`, `rollingSpin`,
  `atRest`, `SPEED_EPSILON`, `Trajectory` (Task 5); `approachSpeed` (Task 6); `vec3.ts`.
- Produces:
  - `types.ts`: `interface ContactMaterial { readonly restitution: number; readonly friction: number }`;
    `interface PushMotion { readonly acceleration: Vec3; readonly angularAcceleration: Vec3;`
    `readonly direction: Vec3 }`.
  - `resolve.ts`: `resolveBallBall(a, b, ball, material): readonly [BallState, BallState]` (same objects when
    `approachSpeed ≤ 0`); `resolveBallCylinder(s, axis, ball, material): BallState` (same object when
    `approachSpeed ≤ 0`).
  - `push.ts`: `RESTING_SPEED = 1e-3`, `DIRECTION_TOLERANCE = 1e-2`, `SEPARATION_TOLERANCE = 1e-7`,
    `ACCELERATION_EPSILON = 1e-9`; `interface ContactBody { state; params }`,
    `interface RestingContact { a: number; b: number; fixed: boolean }`,
    `interface RestingMember { state; phase; push: PushMotion | null }`,
    `interface RestingSolution { members: (RestingMember | null)[]; coupled: boolean[]; arrested: boolean[] }`;
    `solveRestingContacts(bodies, axes: readonly Vec3[], contacts): RestingSolution`;
    `freeAcceleration(s: BallState, p: MotionParams): Vec3`;
    `pushedState(start, push, t): BallState`; `pushedTrajectory(start, push): Trajectory`;
    `pushDuration(start, phase, push, radius): number`.

- [ ] **Step 1: Append contact types to `src/engine/types.ts`**

```ts
/** Restitution (0–1) and Coulomb friction coefficient for a pair of contacting materials. */
export interface ContactMaterial {
    readonly restitution: number;
    readonly friction: number;
}

/**
 * Motion of a ball while it pushes, or is pushed by, a body it rests against. Within one segment the centre
 * accelerates uniformly and the spin changes uniformly. `direction` is the unit vector along which the ball's turf
 * force is frozen for the segment: the slip direction when sliding, the direction of travel when rolling, and ZERO
 * when the ball is held at rest.
 */
export interface PushMotion {
    readonly acceleration: Vec3;
    readonly angularAcceleration: Vec3;
    readonly direction: Vec3;
}
```

- [ ] **Step 2: Write the failing impulse tests**

`tests/engine/resolve.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { approachSpeed } from "../../src/engine/detect";
import { ZERO, add, scale, sub, vec3 } from "../../src/engine/math/vec3";
import { resolveBallBall, resolveBallCylinder } from "../../src/engine/resolve";
import type { BallState } from "../../src/engine/types";
import { kineticEnergy } from "./support/energy";
import { rng } from "./support/rng";

const BALL = { radius: 0.046, mass: 0.454 };
const R = BALL.radius;

function at(x: number, y: number, velocity = ZERO, angularVelocity = ZERO): BallState {
    return { position: vec3(x, y, R), velocity, angularVelocity };
}

describe("resolveBallBall", () => {
    it("exchanges velocities in a head-on perfectly elastic frictionless impact", () => {
        const [a, b] = resolveBallBall(at(0, 0, vec3(1, 0, 0)), at(2 * R, 0), BALL, { restitution: 1, friction: 0 });
        expect(a.velocity.x).toBeCloseTo(0, 15);
        expect(b.velocity.x).toBeCloseTo(1, 15);
    });

    it("applies restitution along the line of centres", () => {
        const [a, b] = resolveBallBall(at(0, 0, vec3(1, 0, 0)), at(2 * R, 0), BALL, { restitution: 0.8, friction: 0 });
        expect(a.velocity.x).toBeCloseTo(0.1, 14);
        expect(b.velocity.x).toBeCloseTo(0.9, 14);
    });

    it("returns the same objects when the balls are separating", () => {
        const sa = at(0, 0, vec3(-1, 0, 0));
        const sb = at(2 * R, 0);
        const [a, b] = resolveBallBall(sa, sb, BALL, { restitution: 0.8, friction: 0.1 });
        expect(a).toBe(sa);
        expect(b).toBe(sb);
    });

    it("conserves linear momentum and never gains energy (random oblique impacts with spin)", () => {
        const random = rng(7);
        for (let n = 0; n < 500; n++) {
            const angle = random() * 2 - 1;
            const sa = at(
                0,
                0,
                vec3(random() * 3, random() * 2 - 1, 0),
                vec3(random() * 60 - 30, random() * 60 - 30, random() * 20 - 10),
            );
            const sb = at(
                2 * R * Math.cos(angle),
                2 * R * Math.sin(angle),
                vec3(random() - 0.5, random() - 0.5, 0),
                vec3(random() * 20 - 10, random() * 20 - 10, 0),
            );
            const material = { restitution: random(), friction: random() * 0.5 };
            const [a, b] = resolveBallBall(sa, sb, BALL, material);
            const before = add(sa.velocity, sb.velocity);
            const after = add(a.velocity, b.velocity);
            expect(after.x).toBeCloseTo(before.x, 12);
            expect(after.y).toBeCloseTo(before.y, 12);
            const energyBefore = kineticEnergy(sa, BALL) + kineticEnergy(sb, BALL);
            const energyAfter = kineticEnergy(a, BALL) + kineticEnergy(b, BALL);
            expect(energyAfter).toBeLessThanOrEqual(energyBefore + 1e-12);
            expect(a.velocity.z).toBe(0);
            expect(b.velocity.z).toBe(0);
        }
    });

    it("bounds the tangential impulse by friction × normal impulse", () => {
        // Rolling ball strikes a stationary ball at a cut; spin about z creates tangential slip.
        const sa = at(0, 0, vec3(1, 0, 0), vec3(0, 1 / R, 40));
        const sb = at(2 * R * Math.cos(0.5), 2 * R * Math.sin(0.5));
        const material = { restitution: 0.8, friction: 0.05 };
        const [, b] = resolveBallBall(sa, sb, BALL, material);
        const n = vec3(Math.cos(0.5), Math.sin(0.5), 0);
        const normal = b.velocity.x * n.x + b.velocity.y * n.y;
        const tangential = Math.abs(-b.velocity.x * n.y + b.velocity.y * n.x);
        expect(tangential).toBeLessThanOrEqual(material.friction * normal + 1e-12);
        expect(tangential).toBeGreaterThan(0);
    });

    it("applies an impulse exactly when approachSpeed says the pair is approaching (I2)", () => {
        const random = rng(3);
        for (let n = 0; n < 500; n++) {
            const angle = random() * 2 * Math.PI;
            const sa = at(0, 0, vec3(random() * 2e-9 - 1e-9, random() * 2e-9 - 1e-9, 0), vec3(0, 0, random()));
            const sb = at(2 * R * Math.cos(angle), 2 * R * Math.sin(angle));
            const approaching = approachSpeed(sub(sa.position, sb.position), sub(sa.velocity, sb.velocity)) > 0;
            const [a] = resolveBallBall(sa, sb, BALL, { restitution: 0.8, friction: 0.05 });
            expect(a !== sa).toBe(approaching);
        }
    });

    it("leaves spin untouched without friction", () => {
        const w = vec3(3, -4, 5);
        const [a] = resolveBallBall(at(0, 0, vec3(1, 0.2, 0), w), at(2 * R, 0), BALL, {
            restitution: 0.8,
            friction: 0,
        });
        expect(a.angularVelocity).toEqual(w);
    });
});

describe("resolveBallCylinder", () => {
    const axis = vec3(R + 0.008, 0, 0);

    it("reverses the normal velocity scaled by restitution", () => {
        const s = resolveBallCylinder(at(0, 0, vec3(1, 0, 0)), axis, BALL, { restitution: 0.5, friction: 0 });
        expect(s.velocity.x).toBeCloseTo(-0.5, 14);
        expect(s.velocity.y).toBeCloseTo(0, 14);
    });

    it("ignores a ball moving away", () => {
        const s0 = at(0, 0, vec3(-1, 0, 0));
        expect(resolveBallCylinder(s0, axis, BALL, { restitution: 0.5, friction: 0.2 })).toBe(s0);
    });

    it("never gains energy (random glancing impacts with spin)", () => {
        const random = rng(11);
        for (let n = 0; n < 500; n++) {
            const angle = Math.PI + (random() * 2 - 1);
            const c = sub(vec3(0, 0, 0), scale(vec3(Math.cos(angle), Math.sin(angle), 0), R + 0.008));
            const s0 = at(
                0,
                0,
                vec3(random() * 2 - 1, random() * 2 - 1, 0),
                vec3(random() * 60 - 30, random() * 60 - 30, random() * 20 - 10),
            );
            const s = resolveBallCylinder(s0, c, BALL, { restitution: random(), friction: random() * 0.5 });
            expect(kineticEnergy(s, BALL)).toBeLessThanOrEqual(kineticEnergy(s0, BALL) + 1e-12);
            expect(s.velocity.z).toBe(0);
        }
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/resolve.test.ts`
Expected: FAIL — cannot resolve `../../src/engine/resolve`.

- [ ] **Step 4: Implement `src/engine/resolve.ts`**

```ts
/**
 * Instantaneous collision impulses for free motion, with restitution along the contact normal and Coulomb
 * friction in the lawn plane. Linear velocity stays horizontal (the turf prevents lift in free motion). Whether a
 * pair is approaching is decided by `approachSpeed`, the predicate detection also uses.
 */
import { approachSpeed } from "./detect";
import { ZERO, add, cross, dot, horizontal, length, normalize, scale, sub, type Vec3 } from "./math/vec3";
import type { BallParams, BallState, ContactMaterial } from "./types";

function inertia(ball: BallParams): number {
    return 0.4 * ball.mass * ball.radius * ball.radius;
}

/**
 * Resolves a collision between two identical balls. Returns the inputs unchanged (the same objects) if
 * `approachSpeed` says they are not approaching.
 */
export function resolveBallBall(
    a: BallState,
    b: BallState,
    ball: BallParams,
    material: ContactMaterial,
): readonly [BallState, BallState] {
    const approach = approachSpeed(sub(a.position, b.position), sub(a.velocity, b.velocity));
    if (approach <= 0) {
        return [a, b];
    }
    const { radius: r, mass: m } = ball;
    const n = normalize(horizontal(sub(b.position, a.position)));
    // Contact-point velocities: a touches at +r·n from its centre, b at −r·n.
    const ua = add(a.velocity, cross(a.angularVelocity, scale(n, r)));
    const ub = add(b.velocity, cross(b.angularVelocity, scale(n, -r)));
    const relative = sub(ua, ub);

    // Normal impulse on b: relative normal speed changes by 2·Jn/m and must end at −e × approach.
    const jn = ((1 + material.restitution) * m * approach) / 2;
    // Tangential impulse changes relative slip by 7·Jt/m; stop the slip or slide at the Coulomb limit.
    const slip = horizontal(sub(relative, scale(n, dot(relative, n))));
    const slipSpeed = length(slip);
    const jt = Math.min((m * slipSpeed) / 7, material.friction * jn);
    const impulse = add(scale(n, jn), slipSpeed > 0 ? scale(slip, jt / slipSpeed) : ZERO);

    // a receives −J at +r·n and b receives +J at −r·n: both get angular impulse r·n × (−J).
    const dw = scale(cross(scale(n, r), scale(impulse, -1)), 1 / inertia(ball));
    return [
        {
            position: a.position,
            velocity: horizontal(sub(a.velocity, scale(impulse, 1 / m))),
            angularVelocity: add(a.angularVelocity, dw),
        },
        {
            position: b.position,
            velocity: horizontal(add(b.velocity, scale(impulse, 1 / m))),
            angularVelocity: add(b.angularVelocity, dw),
        },
    ];
}

/**
 * Resolves a collision between a ball and a fixed vertical cylinder (hoop upright or peg) whose axis passes
 * through `axis`. Returns the input unchanged if `approachSpeed` says the ball is not approaching the cylinder.
 */
export function resolveBallCylinder(s: BallState, axis: Vec3, ball: BallParams, material: ContactMaterial): BallState {
    const approach = approachSpeed(sub(s.position, axis), s.velocity);
    if (approach <= 0) {
        return s;
    }
    const { radius: r, mass: m } = ball;
    const n = normalize(horizontal(sub(s.position, axis)));
    // The ball touches the cylinder at −r·n from its centre.
    const contact = scale(n, -r);
    const relative = add(s.velocity, cross(s.angularVelocity, contact));

    const pn = (1 + material.restitution) * m * approach;
    // Tangential impulse changes contact slip by 7·Pt/(2m).
    const slip = horizontal(sub(relative, scale(n, dot(relative, n))));
    const slipSpeed = length(slip);
    const pt = Math.min((2 * m * slipSpeed) / 7, material.friction * pn);
    const impulse = sub(scale(n, pn), slipSpeed > 0 ? scale(slip, pt / slipSpeed) : ZERO);

    return {
        position: s.position,
        velocity: horizontal(add(s.velocity, scale(impulse, 1 / m))),
        angularVelocity: add(s.angularVelocity, scale(cross(contact, impulse), 1 / inertia(ball))),
    };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/resolve.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 6: Write the failing resting-contact tests**

`tests/engine/push.test.ts`. The parameters are explicit test values (slidingDecel 3, rollingDecel 0.5 m/s²):

```ts
import { describe, expect, it } from "vitest";
import { ZERO, dot, normalize, sub, vec3, type Vec3 } from "../../src/engine/math/vec3";
import { classify, contactSlip, rollingSpin } from "../../src/engine/motion";
import {
    DIRECTION_TOLERANCE,
    RESTING_SPEED,
    freeAcceleration,
    pushDuration,
    pushedState,
    pushedTrajectory,
    solveRestingContacts,
    type ContactBody,
} from "../../src/engine/push";
import type { BallState, MotionParams } from "../../src/engine/types";
import { kineticEnergy } from "./support/energy";
import { rng } from "./support/rng";

const R = 0.046;
const SLIDE = 3;
const ROLL = 0.5;
const P: MotionParams = { radius: R, slidingDecel: SLIDE, rollingDecel: ROLL };
const BALL = { radius: R, mass: 0.454 };

function ball(x: number, y: number, velocity: Vec3 = ZERO, angularVelocity: Vec3 = ZERO): ContactBody {
    return { state: { position: vec3(x, y, R), velocity, angularVelocity }, params: P };
}

function rolling(x: number, y: number, velocity: Vec3): ContactBody {
    return ball(x, y, velocity, rollingSpin(velocity, 0, R));
}

const PAIR = [{ a: 0, b: 1, fixed: false }];

describe("solveRestingContacts", () => {
    it("pushes a resting ball with a ball driven by topspin (analytic case)", () => {
        // Blue has no velocity but topspin Ω, so its slip is −RΩ and friction drives it forward at SLIDE. Red resists
        // statically, then rolls (effective inertia 7m/5, rolling resistance ROLL). Common acceleration:
        // A = (SLIDE − (7/5)·ROLL) / (1 + 7/5) = (5·SLIDE − 7·ROLL) / 12.
        const omega = 60;
        const { members, coupled, arrested } = solveRestingContacts(
            [ball(0, 0, ZERO, vec3(0, omega, 0)), ball(2 * R, 0)],
            [],
            PAIR,
        );
        const A = (5 * SLIDE - 7 * ROLL) / 12;
        expect(coupled).toEqual([true]);
        expect(arrested).toEqual([false, false]);
        const blue = members[0];
        const red = members[1];
        expect(blue?.phase).toBe("sliding");
        expect(red?.phase).toBe("rolling");
        expect(blue?.push?.acceleration.x).toBeCloseTo(A, 12);
        expect(red?.push?.acceleration.x).toBeCloseTo(A, 12);
        expect(blue?.push?.acceleration.y).toBeCloseTo(0, 15);
        // Equal and opposite contact force, N = m·(SLIDE − A) on blue = (7m/5)·(A + ROLL) on red, and compressive.
        const n = SLIDE - A;
        expect(n).toBeGreaterThan(0);
        expect(n).toBeCloseTo((7 / 5) * (A + ROLL), 12);
        // Blue's slip −RΩ decays at A + (5/2)·SLIDE; the push ends when it reaches zero.
        const end = pushDuration(blue?.state as BallState, "sliding", blue?.push as never, R);
        expect(end).toBeCloseTo((R * omega) / (A + 2.5 * SLIDE), 12);
        expect(pushDuration(red?.state as BallState, "rolling", red?.push as never, R)).toBe(Infinity);
        const atEnd = pushedState(blue?.state as BallState, blue?.push as never, end);
        expect(Math.abs(contactSlip(atEnd, R).x)).toBeLessThan(1e-12);
    });

    it("holds a resting ball that the push cannot move", () => {
        // Drive 0.5 m/s² is below the static resistance (7/5)·0.49 of the ball in front.
        const weak: MotionParams = { radius: R, slidingDecel: 0.5, rollingDecel: 0.49 };
        const { members, coupled } = solveRestingContacts(
            [
                { state: ball(0, 0, ZERO, vec3(0, 60, 0)).state, params: weak },
                { state: ball(2 * R, 0).state, params: weak },
            ],
            [],
            PAIR,
        );
        expect(coupled).toEqual([true]);
        expect(members[1]?.phase).toBe("stationary");
        expect(members[1]?.push?.acceleration).toEqual(ZERO);
        expect(members[0]?.push?.acceleration.x).toBeCloseTo(0, 15);
    });

    it("gives a pushed rolling ball 5/7 of the push (effective inertia 7m/5)", () => {
        // Blue slides forward with topspin (free acceleration +SLIDE); red rolls ahead at the same speed (−ROLL).
        const v = vec3(0.5, 0, 0);
        const { members, coupled } = solveRestingContacts(
            [ball(0, 0, v, vec3(0, 40, 0)), rolling(2 * R, 0, v)],
            [],
            PAIR,
        );
        const A = (SLIDE - (7 / 5) * ROLL) / (1 + 7 / 5);
        expect(coupled).toEqual([true]);
        expect(members[0]?.push?.acceleration.x).toBeCloseTo(A, 12);
        expect(members[1]?.push?.acceleration.x).toBeCloseTo(A, 12);
    });

    it("releases balls whose accelerations separate them", () => {
        // Blue brakes hard (sliding, no spin); red ahead only rolls to a stop.
        const v = vec3(0.5, 0, 0);
        const { members, coupled } = solveRestingContacts([ball(0, 0, v), rolling(2 * R, 0, v)], [], PAIR);
        expect(coupled).toEqual([false]);
        expect(members).toEqual([null, null]);
    });

    it("makes the normal speeds equal on a slow approach, keeps rolling balls rolling and loses energy", () => {
        const a = rolling(0, 0, vec3(0.5 + RESTING_SPEED / 2, 0.1, 0));
        const b = rolling(2 * R, 0, vec3(0.5, -0.2, 0));
        const { members } = solveRestingContacts([a, b], [], PAIR);
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
        const axis = vec3(R + 0.008, 0, 0);
        const { members, coupled } = solveRestingContacts(
            [ball(0, 0, ZERO, vec3(0, 60, 0))],
            [axis],
            [{ a: 0, b: 0, fixed: true }],
        );
        expect(coupled).toEqual([true]);
        expect(members[0]?.push?.acceleration.x).toBeCloseTo(0, 15);
        // The slip still decays, at (5/2)·SLIDE: the ball spins down against the upright.
        const end = pushDuration(members[0]?.state as BallState, "sliding", members[0]?.push as never, R);
        expect(end).toBeCloseTo((R * 60) / (2.5 * SLIDE), 12);
    });

    it("solves a ball driven into two touching balls at an angle (wedge, three bodies)", () => {
        const c = Math.sqrt(3) / 2;
        const bodies = [ball(0, 0, ZERO, vec3(0, 60, 0)), ball(2 * R * c, -R), ball(2 * R * c, R)];
        const contacts = [
            { a: 0, b: 1, fixed: false },
            { a: 0, b: 2, fixed: false },
            { a: 1, b: 2, fixed: false },
        ];
        const { members, coupled, arrested } = solveRestingContacts(bodies, [], contacts);
        expect(arrested).toEqual([false, false, false]);
        expect(coupled).toEqual([true, true, false]);
        const x = members.map((m) => m?.push?.acceleration ?? ZERO);
        const normal = (i: number, j: number): Vec3 =>
            normalize(sub(bodies[j]?.state.position as Vec3, bodies[i]?.state.position as Vec3));
        // Coupled contacts do not converge or open; the red–black contact opens.
        expect(dot(sub(x[0] as Vec3, x[1] as Vec3), normal(0, 1))).toBeCloseTo(0, 12);
        expect(dot(sub(x[0] as Vec3, x[2] as Vec3), normal(0, 2))).toBeCloseTo(0, 12);
        expect(dot(sub(x[1] as Vec3, x[2] as Vec3), normal(1, 2))).toBeLessThan(0);
        // The set-up is symmetric about the x axis, and so is the solution.
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
            const { members, coupled } = solveRestingContacts([a, b], [], PAIR);
            const sa = members[0]?.state ?? a.state;
            const sb = members[1]?.state ?? b.state;
            const weight = (s: BallState): number => (classify(s, R) === "sliding" ? 1 : 7 / 5);
            const xa = members[0]?.push?.acceleration ?? freeAcceleration(sa, P);
            const xb = members[1]?.push?.acceleration ?? freeAcceleration(sb, P);
            const relative = dot(sub(xa, xb), e);
            if (coupled[0]) {
                pushes++;
                // N on b along e equals −N on a (effective momentum), is compressive, and holds them together.
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

describe("resting chains", () => {
    // Ball 0 has topspin (drive +SLIDE along x) and touches ball 1, which touches ball 2; 1 and 2 are at rest.
    // Each resting ball resists up to (7/5)·rollingDecel on its own, so the line of two resists 2·(7/5)·rollingDecel.
    function chain(rollingDecel: number, bend = 0): ContactBody[] {
        const p: MotionParams = { radius: R, slidingDecel: SLIDE, rollingDecel };
        const at = (x: number, y: number, w: Vec3 = ZERO): ContactBody => ({
            state: { position: vec3(x, y, R), velocity: ZERO, angularVelocity: w },
            params: p,
        });
        return [at(0, 0, vec3(0, 60, 0)), at(2 * R, 0), at(2 * R + 2 * R * Math.cos(bend), 2 * R * Math.sin(bend))];
    }
    const LINE = [
        { a: 0, b: 1, fixed: false },
        { a: 1, b: 2, fixed: false },
    ];

    it("holds a line of two resting balls that the push could move one at a time but not together", () => {
        // Drive 3 lies between one ball's resistance (7/5)·1.5 = 2.1 and the pair's 4.2.
        for (const bend of [0, 1e-3]) {
            const { members, arrested } = solveRestingContacts(chain(1.5, bend), [], LINE);
            expect(arrested).toEqual([false, false, false]);
            for (const m of members) {
                expect(m?.phase ?? "stationary").not.toBe("rolling");
                const x = m?.push?.acceleration ?? ZERO;
                expect(Math.abs(x.x) + Math.abs(x.y)).toBeLessThan(1e-12);
            }
        }
    });

    it("pushes the line forward together when the drive beats both resistances", () => {
        // All three share one acceleration X with Σ wᵢ·(X − fᵢ) = 0: the pusher has w = 1, f = +SLIDE; each resting
        // ball starts rolling with w = 7/5, f = −ROLL. So X = (SLIDE − 2·(7/5)·ROLL) / (1 + 2·(7/5)).
        const { members, coupled } = solveRestingContacts(chain(ROLL), [], LINE);
        const expected = (SLIDE - 2 * (7 / 5) * ROLL) / (1 + 2 * (7 / 5));
        expect(coupled).toEqual([true, true]);
        for (const m of members) {
            expect(m?.push?.acceleration.x).toBeCloseTo(expected, 12);
            expect(m?.push?.acceleration.y).toBeCloseTo(0, 12);
        }
        expect(members[1]?.phase).toBe("rolling");
        expect(members[2]?.push?.direction).toEqual(vec3(1, 0, 0));
    });

    it("releases balls from rest only along their own frozen direction, so resistance never does work (random)", () => {
        const random = rng(29);
        let released = 0;
        for (let n = 0; n < 1000; n++) {
            const drive = random() * 2 * Math.PI;
            const toB = drive + (random() - 0.5) * 2;
            const toC = toB + (random() - 0.5) * 2;
            const p: MotionParams = { radius: R, slidingDecel: SLIDE, rollingDecel: 0.2 + random() * 2.3 };
            const b = vec3(2 * R * Math.cos(toB), 2 * R * Math.sin(toB), R);
            const c = vec3(b.x + 2 * R * Math.cos(toC), b.y + 2 * R * Math.sin(toC), R);
            const spin = vec3(-Math.sin(drive) * 60, Math.cos(drive) * 60, 0);
            const bodies: ContactBody[] = [
                { state: { position: vec3(0, 0, R), velocity: ZERO, angularVelocity: spin }, params: p },
                { state: { position: b, velocity: ZERO, angularVelocity: ZERO }, params: p },
                { state: { position: c, velocity: ZERO, angularVelocity: ZERO }, params: p },
            ];
            const contacts = [...LINE];
            if (Math.hypot(c.x, c.y) < 2 * R + 1e-12) {
                contacts.push({ a: 0, b: 2, fixed: false });
            }
            const { members } = solveRestingContacts(bodies, [], contacts);
            // With no ball held, contact forces are internal: Σ wᵢ·(xᵢ − fᵢ) = 0, where a released ball's resistance
            // fᵢ = −rollingDecel·dᵢ acts along its reported frozen direction. This fails if the direction reported is
            // not the one the accelerations were solved with.
            const held = members.some((m) => m?.push && m.phase === "stationary");
            if (!held) {
                let net = ZERO;
                for (const m of members) {
                    if (!m?.push) {
                        continue;
                    }
                    const fromRest = m.phase === "rolling" && dot(m.state.velocity, m.state.velocity) === 0;
                    const f = fromRest
                        ? vec3(-p.rollingDecel * m.push.direction.x, -p.rollingDecel * m.push.direction.y, 0)
                        : freeAcceleration(m.state, p);
                    const w = m.phase === "sliding" ? 1 : 7 / 5;
                    net = vec3(net.x + w * (m.push.acceleration.x - f.x), net.y + w * (m.push.acceleration.y - f.y), 0);
                }
                expect(Math.abs(net.x) + Math.abs(net.y)).toBeLessThan(1e-9);
            }
            for (const m of members.slice(1)) {
                if (m?.push && m.phase === "rolling") {
                    released++;
                    const x = m.push.acceleration;
                    const d = m.push.direction;
                    const along = dot(x, d);
                    // Rolling resistance −rollingDecel·d does power −rollingDecel·(d·v) with v = x·t: never positive.
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
});
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/push.test.ts`
Expected: FAIL — cannot resolve `../../src/engine/push`.

- [ ] **Step 8: Implement `src/engine/push.ts`**

```ts
/**
 * Resting contact and pushing (spec §5 phase 2).
 *
 * A contact slower than RESTING_SPEED is not bounced: with a ball driven into another by its own spin, bouncing
 * starts a Zeno sequence of ever-smaller rebounds that no event budget can finish. Instead the touching bodies' speeds
 * along each line of centres are made equal (a perfectly inelastic normal impulse) and, where their accelerations
 * would drive them together, the contacts are coupled: a compressive contact force N ≥ 0 keeps each coupled pair's
 * relative acceleration along its normal at zero. Coupled contacts are frictionless, so the bodies stay free to move
 * along the contact plane. This is a P1 limitation: balls that slide past each other while pushing (sidespin, pushes
 * at an angle) are not rubbed, which can move rest positions by centimetres. Straight pushes have no sideways slip at
 * the contact and are unaffected. The fix, kinetic Coulomb friction on coupled contacts with slip and stick events,
 * is deferred to P2 or later.
 *
 * Within one segment everything is constant, so every trajectory stays quadratic:
 * - Each contact normal is fixed for the segment. Relative motion is then always perpendicular to the normal, which
 *   can only open the gap (to second order), never close it; the segment ends when the gap opens past
 *   SEPARATION_TOLERANCE.
 * - Each ball's turf force is frozen at the segment start: sliding friction of magnitude slidingDecel against the slip
 *   (effective inertia m), or rolling resistance of magnitude rollingDecel against the direction of travel (effective
 *   inertia 7m/5, because static friction keeps a pushed rolling ball rolling: m + I/r² = 7m/5). A ball at rest stays
 *   put until the push on it exceeds (7m/5)·rollingDecel, like rolling resistance acting statically.
 * - The accelerations minimise Σ ½·wᵢ·|xᵢ − fᵢ|² over the one-sided contact constraints (Gauss's principle of least
 *   constraint; w is the effective inertia, f the free acceleration). The minimiser is found exactly by trying active
 *   sets of contacts in a fixed order and accepting the first whose contact forces are compressive and which leaves
 *   no other contact converging.
 *
 * A segment also ends when a frozen turf force stops being valid: the slip (sliding) or velocity (rolling) reaches
 * zero along the frozen direction, or turns more than DIRECTION_TOLERANCE away from it. The simulator then solves the
 * group again from the balls' new states. If no active set is consistent (degenerate geometry), the group is brought
 * to rest and the simulator records an "arrested" event.
 */
import { approachSpeed } from "./detect";
import { ZERO, add, dot, horizontal, length, normalize, scale, sub, vec3, type Vec3 } from "./math/vec3";
import { SPEED_EPSILON, atRest, classify, contactSlip, rollingSpin, type Trajectory } from "./motion";
import type { BallState, MotionParams, MotionPhase, PushMotion } from "./types";

/**
 * Contacts closing slower than this (m/s) are resting contacts, resolved without restitution. A numerical tolerance,
 * not a physical constant: a rebound this slow lifts the gap by at most RESTING_SPEED²/(2a), well under a micrometre
 * for any turf deceleration a, so treating it as inelastic changes no observable outcome.
 */
export const RESTING_SPEED = 1e-3;

/** Largest sine of the angle a pushed ball's slip or velocity may turn from its frozen direction within a segment. */
export const DIRECTION_TOLERANCE = 1e-2;

/** Gap (m) beyond which a coupled contact is considered to have separated. */
export const SEPARATION_TOLERANCE = 1e-7;

/** Relative accelerations (m/s²) at or below this are treated as zero when deciding whether bodies converge. */
export const ACCELERATION_EPSILON = 1e-9;

/** Pivots at or below this make a contact system singular: its contacts are not independent. */
const PIVOT_TOLERANCE = 1e-12;

/**
 * Most passes spent finding the rolling direction of balls pushed off from rest. A candidate is accepted only when
 * each such ball's computed acceleration agrees with the direction its resistance was built on (to within
 * DIRECTION_TOLERANCE); a candidate that has not settled after this many passes is rejected. For straight lines of
 * contacts the second pass already agrees.
 */
const RELEASE_PASSES = 8;

/** Effective inertia of a rolling solid sphere relative to its mass: (m + I/r²)/m with I = 2/5·m·r². */
const ROLLING_WEIGHT = 7 / 5;

/** A ball taking part in a resting-contact solve. */
export interface ContactBody {
    readonly state: BallState;
    readonly params: MotionParams;
}

/** A touching contact: ball `a` against ball `b`, or against the fixed cylinder whose axis is `axes[b]`. */
export interface RestingContact {
    readonly a: number;
    readonly b: number;
    readonly fixed: boolean;
}

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
    /** Per contact: true when the contact is coupled (pushing, or holding a ball against an obstacle). */
    readonly coupled: readonly boolean[];
    /** Per body: true when the body was brought to rest because no consistent solution exists for its group. */
    readonly arrested: readonly boolean[];
}

interface Response {
    readonly phase: MotionPhase;
    /** Free acceleration from the turf (m/s²). */
    readonly force: Vec3;
    /** Effective inertia relative to the ball's mass. */
    readonly weight: number;
    /** Largest push, in the same units as weight × acceleration, that a ball at rest resists without moving. */
    readonly threshold: number;
}

function response(s: BallState, p: MotionParams): Response {
    const phase = classify(s, p.radius);
    switch (phase) {
        case "sliding":
            return {
                phase,
                force: scale(normalize(contactSlip(s, p.radius)), -p.slidingDecel),
                weight: 1,
                threshold: 0,
            };
        case "rolling":
            return {
                phase,
                force: scale(normalize(horizontal(s.velocity)), -p.rollingDecel),
                weight: ROLLING_WEIGHT,
                threshold: 0,
            };
        case "stationary":
            return { phase, force: ZERO, weight: ROLLING_WEIGHT, threshold: ROLLING_WEIGHT * p.rollingDecel };
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
 * The contact constraints of one group, in the form J·x = 0 (touching and not converging) for body accelerations or
 * velocities x. Row k of J maps body i to +n on the body that n points to, −n on the other, and ZERO otherwise.
 */
interface ContactSystem {
    readonly bodies: readonly number[];
    readonly contacts: readonly number[];
    /** J entry for contact index k (into `contacts` of the solve) and body i; ZERO for held bodies. */
    readonly jacobian: (k: number, i: number) => Vec3;
    /** Inverse effective inertia of body i (0 when held at rest). */
    readonly inverseWeight: (i: number) => number;
}

/**
 * Applies the contact impulses (or forces) that make J·x = 0 for the contacts in `active`, starting from `base`
 * (per body): returns the resulting x per body and the multiplier per active contact, or null when the active
 * contacts are not independent.
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
            for (const body of c.fixed ? [c.a] : [c.a, c.b]) {
                const group = byRoot.get(find(body)) ?? [];
                byRoot.set(find(body), group);
                if (!group.includes(body)) {
                    group.push(body);
                }
            }
        }
    });
    return [...byRoot.values()].map((g) => g.sort((x, y) => x - y)).sort((x, y) => (x[0] as number) - (y[0] as number));
}

/** Accelerations and contact forces for one choice of held and released resting balls, or null if inconsistent. */
interface Candidate {
    readonly acceleration: Map<number, Vec3>;
    readonly active: readonly number[];
    readonly released: ReadonlyMap<number, Vec3>;
}

/**
 * Decides which touching contacts push and how every ball involved moves until the next event. `contacts` must all
 * be touching and closing slower than RESTING_SPEED. A contact is kept when it is approaching or when the balls'
 * accelerations drive it together; contacts the solution leaves converging are added until none remain.
 */
export function solveRestingContacts(
    bodies: readonly ContactBody[],
    axes: readonly Vec3[],
    contacts: readonly RestingContact[],
): RestingSolution {
    const centreOf = (c: RestingContact): Vec3 =>
        c.fixed ? (axes[c.b] as Vec3) : (bodies[c.b] as ContactBody).state.position;
    const normals = contacts.map((c) =>
        normalize(horizontal(sub(centreOf(c), (bodies[c.a] as ContactBody).state.position))),
    );
    // Row k of J for body i: +n on the body n points to, −n on the other.
    const jacobian = (k: number, i: number): Vec3 => {
        const c = contacts[k] as RestingContact;
        if (!c.fixed && c.b === i) {
            return normals[k] as Vec3;
        }
        return c.a === i ? scale(normals[k] as Vec3, -1) : ZERO;
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
        const closing = approachSpeed(sub(a.position, centreOf(c)), sub(a.velocity, velocity));
        return closing > SPEED_EPSILON || closingRate(acceleration, k) > ACCELERATION_EPSILON;
    };

    const initial = bodies.map((b) => b.state);
    const freeAcceleration = new Map(bodies.map((b, i) => [i, response(b.state, b.params).force]));
    const kept = contacts.map((_, k) => converging(initial, freeAcceleration, k));

    for (;;) {
        const states = [...initial];
        const members: (RestingMember | null)[] = bodies.map(() => null);
        const arrested = bodies.map(() => false);
        const coupled = contacts.map(() => false);
        const acceleration = new Map(freeAcceleration);

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
                new Map(group.map((i) => [i, horizontal((initial[i] as BallState).velocity)])),
            );
            for (const i of group) {
                const s = initial[i] as BallState;
                const velocity = glued?.result.get(i) ?? horizontal(s.velocity);
                const angularVelocity =
                    (before.get(i) as Response).phase === "sliding"
                        ? s.angularVelocity
                        : rollingSpin(velocity, s.angularVelocity.z, params(i).radius);
                states[i] = { position: s.position, velocity, angularVelocity };
            }

            const responses = new Map(group.map((i) => [i, response(states[i] as BallState, params(i))]));
            const solution = solveGroup(group, groupContacts, contacts, responses, jacobian, closingRate, params);
            if (!solution) {
                for (const i of group) {
                    arrested[i] = true;
                    states[i] = atRest((initial[i] as BallState).position);
                    members[i] = { state: states[i] as BallState, phase: "stationary", push: null };
                    acceleration.set(i, ZERO);
                }
                continue;
            }
            for (const k of solution.active) {
                coupled[k] = true;
            }
            for (const i of group) {
                const s = states[i] as BallState;
                const r = responses.get(i) as Response;
                const x = solution.acceleration.get(i) as Vec3;
                acceleration.set(i, x);
                const touched = solution.active.some(
                    (k) => contacts[k]?.a === i || (!contacts[k]?.fixed && contacts[k]?.b === i),
                );
                members[i] = touched
                    ? pushedMember(s, r, x, solution.released.get(i) ?? null, params(i).radius)
                    : { state: s, phase: r.phase, push: null };
            }
        }

        const added = contacts.map((_, k) => !kept[k] && converging(states, acceleration, k));
        if (!added.includes(true)) {
            return { members, coupled, arrested };
        }
        added.forEach((a, k) => {
            kept[k] = kept[k] === true || a;
        });
    }
}

/**
 * Finds the accelerations of one group: every combination of resting balls held or released (held first), and for
 * each every active set of contacts (smallest first), until one is consistent. Returns null if none is.
 *
 * The search is small and bounded. Four equal balls touch in at most 5 pairs, and a ball fits between hoop uprights,
 * so it touches at most one obstacle: a group has at most 9 contacts (512 active sets) and 4 resting balls (16
 * masks). Groups in play are pairs and short chains, where it is a handful of 1–3 × 1–3 linear solves.
 */
function solveGroup(
    group: readonly number[],
    groupContacts: readonly number[],
    contacts: readonly RestingContact[],
    responses: ReadonlyMap<number, Response>,
    jacobian: (k: number, i: number) => Vec3,
    closingRate: (x: ReadonlyMap<number, Vec3>, k: number) => number,
    params: (i: number) => MotionParams,
): Candidate | null {
    const resting = group.filter((i) => (responses.get(i) as Response).phase === "stationary");
    for (let mask = 0; mask < 1 << resting.length; mask++) {
        const released = new Set(resting.filter((_, j) => (mask & (1 << j)) !== 0));
        const held = new Set(resting.filter((i) => !released.has(i)));
        // Held balls do not move, so a contact between two of them carries no constraint (its row is zero and it is
        // never active). Instead, touching held balls form a static cluster that resists as one (see holds()).
        const system: ContactSystem = {
            bodies: group,
            contacts: groupContacts,
            jacobian: (k, i) => (held.has(i) ? ZERO : jacobian(k, i)),
            inverseWeight: (i) => (held.has(i) ? 0 : 1 / (responses.get(i) as Response).weight),
        };
        const clusters = heldClusters(held, groupContacts, contacts, jacobian);
        for (const active of subsets(groupContacts)) {
            const candidate = tryActiveSet(system, active, responses, released, jacobian, closingRate, params);
            if (candidate && holds(clusters, active, candidate.multipliers, responses, jacobian)) {
                return { acceleration: candidate.acceleration, active, released: candidate.released };
            }
        }
    }
    return null;
}

/** A set of touching held balls, and the unit normals from its balls into the obstacles they rest against. */
interface HeldCluster {
    readonly balls: readonly number[];
    readonly obstacles: readonly Vec3[];
}

/** Groups the held balls into clusters joined by their mutual contacts. */
function heldClusters(
    held: ReadonlySet<number>,
    groupContacts: readonly number[],
    contacts: readonly RestingContact[],
    jacobian: (k: number, i: number) => Vec3,
): HeldCluster[] {
    const clusters: number[][] = [...held].map((i) => [i]);
    for (const k of groupContacts) {
        const c = contacts[k] as RestingContact;
        if (c.fixed || !held.has(c.a) || !held.has(c.b)) {
            continue;
        }
        const ca = clusters.find((cl) => cl.includes(c.a)) as number[];
        const cb = clusters.find((cl) => cl.includes(c.b)) as number[];
        if (ca !== cb) {
            ca.push(...cb);
            clusters.splice(clusters.indexOf(cb), 1);
        }
    }
    // An obstacle contact's row for its ball is −n, with n pointing from the ball into the obstacle.
    return clusters.map((balls) => ({
        balls,
        obstacles: groupContacts
            .filter((k) => contacts[k]?.fixed === true && balls.includes(contacts[k]?.a ?? -1))
            .map((k) => scale(jacobian(k, contacts[k]?.a ?? -1), -1)),
    }));
}

/**
 * Can every held cluster stay at rest? The cluster's balls push on one another freely, so it resists as one: the net
 * push its active contacts put on it, less whatever the obstacles it rests against can take in compression, must not
 * exceed the sum of its balls' static rolling resistances.
 */
function holds(
    clusters: readonly HeldCluster[],
    active: readonly number[],
    multipliers: readonly number[],
    responses: ReadonlyMap<number, Response>,
    jacobian: (k: number, i: number) => Vec3,
): boolean {
    return clusters.every((cluster) => {
        let push = ZERO;
        let capacity = 0;
        for (const i of cluster.balls) {
            capacity += (responses.get(i) as Response).threshold;
            active.forEach((k, j) => {
                push = add(push, scale(jacobian(k, i), multipliers[j] as number));
            });
        }
        return length(unresisted(push, cluster.obstacles)) <= capacity + ACCELERATION_EPSILON;
    });
}

/**
 * The part of `push` that obstacles with inward normals `into` cannot take: `push` minus its projection onto the cone
 * of compressive obstacle reactions Σ λⱼ·intoⱼ (λⱼ ≥ 0). In the plane that projection lies on a single ray, or covers
 * `push` entirely when a pair of normals spans it with non-negative weights.
 */
function unresisted(push: Vec3, into: readonly Vec3[]): Vec3 {
    let best = push;
    for (const n of into) {
        const rest = sub(push, scale(n, Math.max(0, dot(push, n))));
        if (length(rest) < length(best)) {
            best = rest;
        }
    }
    for (let i = 0; i < into.length; i++) {
        for (let j = i + 1; j < into.length; j++) {
            const a = into[i] as Vec3;
            const b = into[j] as Vec3;
            const det = a.x * b.y - a.y * b.x;
            if (det === 0) {
                continue;
            }
            // Solve λa·a + λb·b = push by Cramer's rule.
            const la = (push.x * b.y - push.y * b.x) / det;
            const lb = (a.x * push.y - a.y * push.x) / det;
            if (la >= 0 && lb >= 0) {
                return ZERO;
            }
        }
    }
    return best;
}

/** One solve of an active set: accelerations, contact multipliers and the directions of balls pushed off from rest. */
interface Trial {
    readonly acceleration: Map<number, Vec3>;
    readonly multipliers: readonly number[];
    readonly released: ReadonlyMap<number, Vec3>;
}

/**
 * Solves one active set for one choice of released balls, or returns null if it is inconsistent: a force pulls, an
 * inactive contact converges, or a released ball does not move along the direction its resistance was built on.
 */
function tryActiveSet(
    system: ContactSystem,
    active: readonly number[],
    responses: ReadonlyMap<number, Response>,
    released: ReadonlySet<number>,
    jacobian: (k: number, i: number) => Vec3,
    closingRate: (x: ReadonlyMap<number, Vec3>, k: number) => number,
    params: (i: number) => MotionParams,
): Trial | null {
    // A ball pushed off from rest rolls against rolling resistance along its direction of motion, which is not known
    // until the accelerations are. The first pass omits that resistance; each later pass builds it on the direction
    // the previous pass produced, and the trial is accepted only once the result agrees with the direction it was
    // built on. Resistance along an agreeing direction opposes the motion, so it never does positive work.
    const directions = new Map<number, Vec3>();
    for (let pass = 0; pass < RELEASE_PASSES; pass++) {
        const base = new Map(
            system.bodies.map((i) => {
                const d = directions.get(i);
                const f = d ? scale(d, -params(i).rollingDecel) : (responses.get(i) as Response).force;
                return [i, f];
            }),
        );
        const solved = project(system, active, base);
        if (!solved) {
            return null;
        }
        const settled = [...released].every((i) => {
            const d = directions.get(i);
            return d !== undefined && agrees(solved.result.get(i) as Vec3, d);
        });
        if (settled) {
            return accept(system, active, solved, closingRate, directions);
        }
        for (const i of released) {
            const x = solved.result.get(i) as Vec3;
            if (length(x) === 0) {
                return null;
            }
            directions.set(i, normalize(x));
        }
    }
    return null;
}

/** True when `x` points along the unit vector `d`, to within DIRECTION_TOLERANCE. */
function agrees(x: Vec3, d: Vec3): boolean {
    const along = dot(x, d);
    return along > 0 && Math.abs(x.x * d.y - x.y * d.x) <= DIRECTION_TOLERANCE * along;
}

function accept(
    system: ContactSystem,
    active: readonly number[],
    solved: { readonly result: Map<number, Vec3>; readonly multipliers: number[] },
    closingRate: (x: ReadonlyMap<number, Vec3>, k: number) => number,
    directions: ReadonlyMap<number, Vec3>,
): Trial | null {
    const { result, multipliers } = solved;
    if (multipliers.some((n) => n < -ACCELERATION_EPSILON)) {
        return null;
    }
    if (system.contacts.some((k) => !active.includes(k) && closingRate(result, k) > ACCELERATION_EPSILON)) {
        return null;
    }
    return { acceleration: result, multipliers, released: directions };
}

/** Builds the constant-acceleration motion of a coupled ball with acceleration `x`. */
function pushedMember(
    s: BallState,
    r: Response,
    x: Vec3,
    releasedDirection: Vec3 | null,
    radius: number,
): RestingMember {
    const rollingSpinRate = vec3(-x.y / radius, x.x / radius, 0);
    if (r.phase === "stationary") {
        if (!releasedDirection) {
            return {
                state: s,
                phase: "stationary",
                push: { acceleration: ZERO, angularAcceleration: ZERO, direction: ZERO },
            };
        }
        // Pushed off from rest: it starts rolling, resisted along its direction of motion.
        return {
            state: s,
            phase: "rolling",
            push: { acceleration: x, angularAcceleration: rollingSpinRate, direction: releasedDirection },
        };
    }
    if (r.phase === "rolling") {
        return {
            state: s,
            phase: "rolling",
            push: {
                acceleration: x,
                angularAcceleration: rollingSpinRate,
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

/** Returns the state of a coupled ball a time t after `start`. */
export function pushedState(start: BallState, push: PushMotion, t: number): BallState {
    if (t === 0) {
        return start;
    }
    const v = horizontal(start.velocity);
    return {
        position: add(add(start.position, scale(v, t)), scale(push.acceleration, 0.5 * t * t)),
        velocity: add(v, scale(push.acceleration, t)),
        angularVelocity: add(start.angularVelocity, scale(push.angularAcceleration, t)),
    };
}

/** Returns the centre trajectory of a coupled ball from `start`. */
export function pushedTrajectory(start: BallState, push: PushMotion): Trajectory {
    return { c0: start.position, c1: horizontal(start.velocity), c2: scale(push.acceleration, 0.5) };
}

/** Earliest t > 0 at which g0 + g1·t rises through zero from below, or Infinity. */
function risesAt(g0: number, g1: number): number {
    return g0 < 0 && g1 > 0 ? (0 - g0) / g1 : Infinity;
}

/**
 * Returns how long the frozen turf force of a coupled ball stays valid: until its slip (sliding) or velocity
 * (rolling) reaches zero along the frozen direction, or turns more than DIRECTION_TOLERANCE away from it. Both are
 * linear in time within the segment. Infinity for a ball held at rest or one that is only speeding up.
 */
export function pushDuration(start: BallState, phase: MotionPhase, push: PushMotion, radius: number): number {
    if (phase === "stationary") {
        return Infinity;
    }
    const a = push.acceleration;
    const w = push.angularAcceleration;
    // The tracked quantity x(t) = x0 + x1·t: contact slip while sliding, velocity while rolling.
    const x0 = phase === "sliding" ? contactSlip(start, radius) : horizontal(start.velocity);
    const x1 = phase === "sliding" ? vec3(a.x - radius * w.y, a.y + radius * w.x, 0) : horizontal(a);
    const d = push.direction;
    const along0 = dot(x0, d);
    const along1 = dot(x1, d);
    const across0 = x0.x * d.y - x0.y * d.x;
    const across1 = x1.x * d.y - x1.y * d.x;
    return Math.min(
        risesAt(0 - along0, 0 - along1),
        risesAt(across0 - DIRECTION_TOLERANCE * along0, across1 - DIRECTION_TOLERANCE * along1),
        risesAt(0 - across0 - DIRECTION_TOLERANCE * along0, 0 - across1 - DIRECTION_TOLERANCE * along1),
    );
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/push.test.ts tests/engine/resolve.test.ts`
Expected: PASS (23 tests). The random-pairs test checks that at least 100 of its 2,000 cases push; if it fails on
that count, the generator no longer exercises pushing.

- [ ] **Step 10: Format, lint, commit**

```bash
npm run format
```

```bash
npm run lint
```

```bash
git add src/engine/types.ts src/engine/resolve.ts src/engine/push.ts tests/engine/resolve.test.ts tests/engine/push.test.ts
```

```bash
git commit -m "Add collision impulses and resting-contact pushing"
```

---

### Task 8: World model and default world

**Files:**
- Create: `src/engine/world.ts`
- Modify: `src/engine/types.ts` (append world types)
- Create: `tests/engine/support/fixtures.ts`
- Test: `tests/engine/world.test.ts`

**Interfaces:**
- Consumes: reference exports (Task 4); `ContactMaterial`, `BallParams`, `MotionParams` (Tasks 5, 7);
  `endOfPhase`, `rollingSpin` (Task 5).
- Produces:
  - `types.ts`: `SurfaceProps { slidingFriction; rollingResistance }`,
    `Lawn { width; length; surfaceAt(position: Vec3): SurfaceProps }`,
    `Cylinder { id: string; centre: Vec3; radius: number; material: ContactMaterial }`,
    `Hoop { id: string; centre: Vec3; normal: Vec3; innerWidth: number; uprightRadius: number }`,
    `OffsetRule { ballRadii: number; uprightRadii: number }`,
    `World { gravity; ball: BallParams; lawn: Lawn; hoops: readonly Hoop[]; peg: Cylinder; ballBall: ContactMaterial; ballUpright: ContactMaterial; outOfCourt: OffsetRule; hoopRunStart: OffsetRule; hoopRunComplete: OffsetRule; haltMargin: number }`
    (all fields `readonly`).
  - `world.ts`: `STANDARD_GRAVITY = 9.80665`, `HALT_MARGIN = 1` (a modelling choice, pre-flight M7),
    `uniformLawn(width, courtLength, surface): Lawn` (pre-flight M9),
    `rollingResistanceForLawnSpeed(seconds: number, distance: number, gravity: number): number`,
    `hoopHalfSpan(hoop: Hoop): number`, `hoopLateral(hoop: Hoop): Vec3`,
    `uprightsOf(hoop: Hoop, material: ContactMaterial): readonly [Cylinder, Cylinder]` (ids `"<hoopId>/a"`,
    `"<hoopId>/b"`), `obstaclesOf(world: World): readonly Cylinder[]` (uprights in hoop order, then the peg),
    `motionParamsAt(world: World, position: Vec3): MotionParams`,
    `ruleThreshold(rule: OffsetRule, ballRadius: number, uprightRadius: number): number`,
    `validateWorld(world: World): void` (throws `RangeError`; also rejects rolling resistance above sliding friction,
    which the resting-contact solver relies on), `defaultWorld(lawnSpeedSeconds?: number): World`.
  - Test fixtures: `TEST_BALL`, `testWorld(overrides?: Partial<World>): World`,
    `ballAt(x, y, velocity?, angularVelocity?): BallState`, `rollingBallAt(x, y, vx, vy): BallState`,
    `testHoop(id: string, x: number, y: number): Hoop`.

- [ ] **Step 1: Append world types to `src/engine/types.ts`**

```ts
/** Turf properties at a point. Both are dimensionless coefficients (multiply by g for deceleration). */
export interface SurfaceProps {
    readonly slidingFriction: number;
    readonly rollingResistance: number;
}

/** The court surface. Extent x ∈ [0, width], y ∈ [0, length] (m). */
export interface Lawn {
    readonly width: number;
    readonly length: number;
    /** Surface properties at a position. v1 lawns are uniform; the engine samples this at each segment start. */
    surfaceAt(position: Vec3): SurfaceProps;
}

/** A fixed vertical cylinder: a hoop upright or the peg. */
export interface Cylinder {
    readonly id: string;
    readonly centre: Vec3;
    readonly radius: number;
    readonly material: ContactMaterial;
}

/** A hoop: two uprights either side of `centre` along the hoop plane; `normal` is perpendicular to that plane. */
export interface Hoop {
    readonly id: string;
    readonly centre: Vec3;
    readonly normal: Vec3;
    readonly innerWidth: number;
    readonly uprightRadius: number;
}

/** A signed-offset threshold ballRadii × R + uprightRadii × r (see reference/README.md). */
export interface OffsetRule {
    readonly ballRadii: number;
    readonly uprightRadii: number;
}

/** Everything the free-motion engine needs to know about the environment. */
export interface World {
    readonly gravity: number;
    readonly ball: BallParams;
    readonly lawn: Lawn;
    readonly hoops: readonly Hoop[];
    readonly peg: Cylinder;
    readonly ballBall: ContactMaterial;
    readonly ballUpright: ContactMaterial;
    readonly outOfCourt: OffsetRule;
    readonly hoopRunStart: OffsetRule;
    readonly hoopRunComplete: OffsetRule;
    /** Distance (m) beyond the boundary at which a ball is halted; the surround is not modelled. */
    readonly haltMargin: number;
}
```

- [ ] **Step 2: Write the test fixtures**

`tests/engine/support/fixtures.ts`:

```ts
/**
 * Test-only world and balls. The numbers are plausible but deliberately NOT sourced, so test expectations do not
 * change when the reference data does. (Importing world.ts still loads and validates reference/*.json, so invalid
 * reference data fails every engine test at import.) src/ must never import this file.
 */
import { ZERO, vec3, type Vec3 } from "../../../src/engine/math/vec3";
import { rollingSpin } from "../../../src/engine/motion";
import type { BallState, Hoop, World } from "../../../src/engine/types";
import { STANDARD_GRAVITY, uniformLawn } from "../../../src/engine/world";

export const TEST_BALL = { radius: 0.046, mass: 0.454 } as const;

/** A 30 × 40 m lawn, peg at (15, 20), no hoops unless overridden. Symmetric about x = 15. */
export function testWorld(overrides: Partial<World> = {}): World {
    return {
        gravity: STANDARD_GRAVITY,
        ball: TEST_BALL,
        lawn: uniformLawn(30, 40, { slidingFriction: 0.3, rollingResistance: 0.05 }),
        hoops: [],
        peg: { id: "peg", centre: vec3(15, 20, 0), radius: 0.02, material: { restitution: 0.6, friction: 0.1 } },
        ballBall: { restitution: 0.8, friction: 0.05 },
        ballUpright: { restitution: 0.6, friction: 0.1 },
        outOfCourt: { ballRadii: 0, uprightRadii: 0 },
        hoopRunStart: { ballRadii: -1, uprightRadii: -1 },
        hoopRunComplete: { ballRadii: 1, uprightRadii: 1 },
        haltMargin: 1,
        ...overrides,
    };
}

/** A ball resting on the lawn at (x, y), optionally moving. */
export function ballAt(x: number, y: number, velocity: Vec3 = ZERO, angularVelocity: Vec3 = ZERO): BallState {
    return { position: vec3(x, y, TEST_BALL.radius), velocity, angularVelocity };
}

/** A ball rolling without slip at (x, y) with velocity (vx, vy). */
export function rollingBallAt(x: number, y: number, vx: number, vy: number): BallState {
    const velocity = vec3(vx, vy, 0);
    return ballAt(x, y, velocity, rollingSpin(velocity, 0, TEST_BALL.radius));
}

/** A hoop at (x, y) with its plane east–west, run northwards for direction +1. */
export function testHoop(id: string, x: number, y: number): Hoop {
    return { id, centre: vec3(x, y, 0), normal: vec3(0, 1, 0), innerWidth: 0.0953, uprightRadius: 0.008 };
}
```

- [ ] **Step 3: Write the failing world tests**

`tests/engine/world.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { length, sub, vec3 } from "../../src/engine/math/vec3";
import { endOfPhase, rollingSpin } from "../../src/engine/motion";
import {
    STANDARD_GRAVITY,
    defaultWorld,
    motionParamsAt,
    obstaclesOf,
    rollingResistanceForLawnSpeed,
    uniformLawn,
    uprightsOf,
    validateWorld,
} from "../../src/engine/world";
import { testHoop, testWorld } from "./support/fixtures";

describe("rollingResistanceForLawnSpeed", () => {
    it("makes a ball launched at 2D/T roll exactly D in T seconds", () => {
        const T = 12;
        const D = 30;
        const mu = rollingResistanceForLawnSpeed(T, D, STANDARD_GRAVITY);
        const params = { radius: 0.046, slidingDecel: 1, rollingDecel: mu * STANDARD_GRAVITY };
        const v = vec3((2 * D) / T, 0, 0);
        const end = endOfPhase(
            { position: vec3(0, 0, 0.046), velocity: v, angularVelocity: rollingSpin(v, 0, 0.046) },
            "rolling",
            params,
        );
        expect(end.position.x).toBeCloseTo(D, 9);
    });
});

describe("hoops and obstacles", () => {
    it("separates the uprights' inner surfaces by the hoop's inner width", () => {
        const hoop = testHoop("1", 10, 10);
        const [a, b] = uprightsOf(hoop, { restitution: 0.5, friction: 0.1 });
        expect(length(sub(a.centre, b.centre)) - 2 * hoop.uprightRadius).toBeCloseTo(hoop.innerWidth, 12);
        expect(a.id).toBe("1/a");
        expect(b.id).toBe("1/b");
    });

    it("lists uprights in hoop order, then the peg", () => {
        const world = testWorld({ hoops: [testHoop("1", 5, 5), testHoop("2", 5, 35)] });
        expect(obstaclesOf(world).map((o) => o.id)).toEqual(["1/a", "1/b", "2/a", "2/b", "peg"]);
    });
});

describe("motionParamsAt", () => {
    it("scales surface coefficients by gravity", () => {
        const p = motionParamsAt(testWorld(), vec3(1, 1, 0));
        expect(p.slidingDecel).toBeCloseTo(0.3 * STANDARD_GRAVITY, 12);
        expect(p.rollingDecel).toBeCloseTo(0.05 * STANDARD_GRAVITY, 12);
    });
});

describe("validateWorld", () => {
    it("accepts the test world", () => {
        expect(() => validateWorld(testWorld())).not.toThrow();
    });

    it.each([
        ["non-positive gravity", { gravity: 0 }],
        ["restitution above 1", { ballBall: { restitution: 1.2, friction: 0 } }],
        ["negative friction", { ballUpright: { restitution: 0.5, friction: -0.1 } }],
        ["negative halt margin", { haltMargin: -1 }],
        [
            "rolling resistance above sliding friction",
            { lawn: uniformLawn(30, 40, { slidingFriction: 0.1, rollingResistance: 0.2 }) },
        ],
        ["non-unit hoop normal", { hoops: [{ ...testHoop("1", 5, 5), normal: vec3(0, 2, 0) }] }],
    ])("rejects %s", (_label, overrides) => {
        expect(() => validateWorld(testWorld(overrides))).toThrow(RangeError);
    });
});

describe("defaultWorld", () => {
    it("builds a valid world from the reference data", () => {
        const world = defaultWorld();
        expect(() => validateWorld(world)).not.toThrow();
        expect(world.hoops).toHaveLength(6);
        for (const hoop of world.hoops) {
            expect(hoop.innerWidth).toBeGreaterThan(2 * world.ball.radius);
        }
    });

    it("gets slower lawns (fewer seconds) to decelerate balls harder", () => {
        const slow = motionParamsAt(defaultWorld(8), vec3(1, 1, 0)).rollingDecel;
        const fast = motionParamsAt(defaultWorld(14), vec3(1, 1, 0)).rollingDecel;
        expect(slow).toBeGreaterThan(fast);
    });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/world.test.ts`
Expected: FAIL — cannot resolve `../../src/engine/world`.

- [ ] **Step 5: Implement `src/engine/world.ts`**

```ts
/**
 * World construction, validation and derived geometry. `defaultWorld` is the only place the engine reads the
 * sourced reference data.
 */
import { ballReference, courtReference, frictionReference, lawnReference, lawsReference } from "../reference/index";
import { add, length, scale, vec3, type Vec3 } from "./math/vec3";
import type { ContactMaterial, Cylinder, Hoop, Lawn, MotionParams, OffsetRule, SurfaceProps, World } from "./types";

/** Standard acceleration of gravity (m/s²), as defined by the 3rd CGPM (1901). */
export const STANDARD_GRAVITY = 9.80665;

/**
 * Distance (m) beyond the boundary at which the default world halts a ball. A modelling choice, not a physical
 * constant: the spec halts balls at "a fixed margin beyond the boundary" because the surround is not modelled.
 */
export const HALT_MARGIN = 1;

/** Creates a lawn with the same surface everywhere. */
export function uniformLawn(width: number, courtLength: number, surface: SurfaceProps): Lawn {
    return { width, length: courtLength, surfaceAt: () => surface };
}

/**
 * Converts a lawn speed (seconds for a struck ball to travel `distance` metres and stop) into a rolling-resistance
 * coefficient. Uniform deceleration a over time T covers D = a·T²/2, so μr = a/g = 2D/(g·T²). The brief initial
 * sliding phase is neglected.
 */
export function rollingResistanceForLawnSpeed(seconds: number, distance: number, gravity: number): number {
    return (2 * distance) / (gravity * seconds * seconds);
}

/** Distance from a hoop's centre to each upright's axis. */
export function hoopHalfSpan(hoop: Hoop): number {
    return hoop.innerWidth / 2 + hoop.uprightRadius;
}

/** Unit vector along the hoop plane (from upright b towards upright a). */
export function hoopLateral(hoop: Hoop): Vec3 {
    return vec3(-hoop.normal.y, hoop.normal.x, 0);
}

/** Returns the hoop's two uprights as cylinders. */
export function uprightsOf(hoop: Hoop, material: ContactMaterial): readonly [Cylinder, Cylinder] {
    const offset = scale(hoopLateral(hoop), hoopHalfSpan(hoop));
    return [
        { id: `${hoop.id}/a`, centre: add(hoop.centre, offset), radius: hoop.uprightRadius, material },
        { id: `${hoop.id}/b`, centre: add(hoop.centre, scale(offset, -1)), radius: hoop.uprightRadius, material },
    ];
}

/** Returns every fixed obstacle: uprights in hoop order, then the peg. */
export function obstaclesOf(world: World): readonly Cylinder[] {
    return [...world.hoops.flatMap((h) => uprightsOf(h, world.ballUpright)), world.peg];
}

/** Returns the free-motion parameters for a segment starting at `position`. */
export function motionParamsAt(world: World, position: Vec3): MotionParams {
    const surface = world.lawn.surfaceAt(position);
    return {
        radius: world.ball.radius,
        slidingDecel: surface.slidingFriction * world.gravity,
        rollingDecel: surface.rollingResistance * world.gravity,
    };
}

/** Evaluates a signed-offset rule for the given ball and upright radii. */
export function ruleThreshold(rule: OffsetRule, ballRadius: number, uprightRadius: number): number {
    return rule.ballRadii * ballRadius + rule.uprightRadii * uprightRadius;
}

function requirePositive(value: number, name: string): void {
    if (!(value > 0) || !Number.isFinite(value)) {
        throw new RangeError(`${name} must be a positive finite number (got ${value})`);
    }
}

function requireMaterial(material: ContactMaterial, name: string): void {
    if (!(material.restitution >= 0 && material.restitution <= 1)) {
        throw new RangeError(`${name}.restitution must lie in [0, 1] (got ${material.restitution})`);
    }
    if (!(material.friction >= 0) || !Number.isFinite(material.friction)) {
        throw new RangeError(`${name}.friction must be non-negative (got ${material.friction})`);
    }
}

/** Throws a RangeError if the world is physically meaningless. */
export function validateWorld(world: World): void {
    requirePositive(world.gravity, "gravity");
    requirePositive(world.ball.radius, "ball.radius");
    requirePositive(world.ball.mass, "ball.mass");
    requirePositive(world.lawn.width, "lawn.width");
    requirePositive(world.lawn.length, "lawn.length");
    const centre = vec3(world.lawn.width / 2, world.lawn.length / 2, 0);
    const surface = world.lawn.surfaceAt(centre);
    requirePositive(surface.slidingFriction, "lawn.slidingFriction");
    requirePositive(surface.rollingResistance, "lawn.rollingResistance");
    // Resting-contact pushing (push.ts) relies on this: it bounds every pushed ball's acceleration by the sliding
    // deceleration, which guarantees that a pushed ball's slip always decays and a pushed rolling ball never skids.
    if (surface.rollingResistance > surface.slidingFriction) {
        throw new RangeError("lawn.rollingResistance must not exceed lawn.slidingFriction");
    }
    requireMaterial(world.ballBall, "ballBall");
    requireMaterial(world.ballUpright, "ballUpright");
    requireMaterial(world.peg.material, "peg.material");
    requirePositive(world.peg.radius, "peg.radius");
    if (!(world.haltMargin >= 0)) {
        throw new RangeError(`haltMargin must be non-negative (got ${world.haltMargin})`);
    }
    for (const hoop of world.hoops) {
        requirePositive(hoop.innerWidth, `hoop ${hoop.id} innerWidth`);
        requirePositive(hoop.uprightRadius, `hoop ${hoop.id} uprightRadius`);
        if (Math.abs(length(hoop.normal) - 1) > 1e-12 || hoop.normal.z !== 0) {
            throw new RangeError(`hoop ${hoop.id} normal must be a horizontal unit vector`);
        }
    }
}

/** Builds the standard full-size court from the sourced reference data. */
export function defaultWorld(lawnSpeedSeconds: number = lawnReference.defaultSpeed.value): World {
    const radius = ballReference.diameter.value / 2;
    const uprightRadius = courtReference.uprightDiameter.value / 2;
    const surface: SurfaceProps = {
        slidingFriction: frictionReference.ballTurfSliding.value,
        rollingResistance: rollingResistanceForLawnSpeed(
            lawnSpeedSeconds,
            lawnReference.speedDistance.value,
            STANDARD_GRAVITY,
        ),
    };
    return {
        gravity: STANDARD_GRAVITY,
        ball: { radius, mass: ballReference.mass.value },
        lawn: uniformLawn(courtReference.width.value, courtReference.length.value, surface),
        hoops: courtReference.hoops.map((h) => ({
            id: h.id,
            centre: vec3(h.x, h.y, 0),
            normal: vec3(h.normalX, h.normalY, 0),
            innerWidth: courtReference.hoopInnerWidth.value,
            uprightRadius,
        })),
        peg: {
            id: "peg",
            centre: vec3(courtReference.peg.x, courtReference.peg.y, 0),
            radius: courtReference.pegDiameter.value / 2,
            material: {
                restitution: frictionReference.ballPegRestitution.value,
                friction: frictionReference.ballPegFriction.value,
            },
        },
        ballBall: {
            restitution: frictionReference.ballBallRestitution.value,
            friction: frictionReference.ballBallFriction.value,
        },
        ballUpright: {
            restitution: frictionReference.ballUprightRestitution.value,
            friction: frictionReference.ballUprightFriction.value,
        },
        outOfCourt: lawsReference.outOfCourt,
        hoopRunStart: lawsReference.hoopRunStart,
        hoopRunComplete: lawsReference.hoopRunComplete,
        haltMargin: HALT_MARGIN,
    };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/world.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 7: Format, lint, commit**

```bash
npm run format
```

```bash
npm run lint
```

```bash
git add src/engine/types.ts src/engine/world.ts tests/engine/world.test.ts tests/engine/support/fixtures.ts
```

```bash
git commit -m "Add world model and reference-backed default world"
```

---

### Task 9: Event-driven free-motion simulator

The loop finds the earliest event across all balls, advances to it, resolves it, and restarts the affected balls'
segments. Unaffected balls keep their segment and are evaluated from its start whenever needed, so no error
accumulates. The events are:

- **transition**: the end of a free ball's phase;
- **regroup**: the end of a pushed segment (see Task 7), or a coupled contact opening past `SEPARATION_TOLERANCE`;
- **ball–ball** and **ball–obstacle** contact;
- **halt margin**.

A contact closing faster than `RESTING_SPEED` is an impulse; anything slower goes to the resting-contact solver.

Touching bodies are decided at t = 0 with one rule that uses the solver's own quantities: a contact must be resolved
now if `approachSpeed` > `SPEED_EPSILON`, or if it closes no faster than `RESTING_SPEED` away and the two balls'
current accelerations drive it together. Those accelerations are the push, or `freeAcceleration`. Resolving applies
the solver, whose solution never leaves an uncoupled resting contact driven together, so a resolved contact cannot
trigger again at the same instant (the livelock in pre-flight I2). A coupled contact is watched only for opening.
The component and the watch both test that opening with the same expression, `separationGap`. A halted ball is out of
play: it no longer takes part in contacts, so a ball pushing it beyond the margin cannot keep re-driving it.

**Files:**
- Create: `src/engine/simulate.ts`, `src/engine/sample.ts`, `src/engine/observe.ts` (stub; Task 10 fills it)
- Modify: `src/engine/types.ts` (append result types)
- Test: `tests/engine/simulate.test.ts`

**Interfaces:**
- Consumes: Tasks 5–8.
- Produces:
  - `types.ts`: `BallStates = Partial<Record<BallId, BallState>>`;
    `Segment { t0; t1: number; phase: MotionPhase; start: BallState; params: MotionParams; push?: PushMotion }`;
    `ShotEvent` union: `{ kind: "phase"; t; ball; phase }`,
    `{ kind: "ball-ball"; t; balls: readonly [BallId, BallId]; resting: boolean }`,
    `{ kind: "ball-obstacle"; t; ball; obstacleId: string; resting: boolean }`, `{ kind: "halted"; t; ball }`,
    `{ kind: "arrested"; t; balls: readonly BallId[] }`, `{ kind: "out-of-court"; t; ball; position: Vec3 }` and
    `{ kind: "hoop-passage"; t; ball; hoopId: string; direction: 1 | -1 }`;
    `ShotResult { engineVersion: string; duration: number; segments: Partial<Record<BallId, readonly Segment[]>>; events: readonly ShotEvent[]; rest: Partial<Record<BallId, Vec3>>; aborted: boolean }`.
  - `simulate.ts`: `ENGINE_VERSION = "0.1.0"`, `DEFAULT_MAX_EVENTS = 10_000`,
    `simulateFreeMotion(initial: BallStates, world: World, maxEvents?: number): ShotResult`. It throws `RangeError`
    for a ball not resting on the lawn plane (`|z − R| > 1e-9` or `|vz| > 1e-9`), or for a ball overlapping another
    ball or an obstacle by more than `CONTACT_TOLERANCE`.
  - `sample.ts`: `segmentState(segment, local): BallState`, `segmentTrajectory(segment): Trajectory`,
    `stateAtTime(result: ShotResult, ball: BallId, t: number): BallState` (clamped to `[0, duration]`).

- [ ] **Step 1: Append result types to `src/engine/types.ts`**

```ts
/** Initial states of the balls in play; absent balls are omitted. */
export type BallStates = Partial<Record<BallId, BallState>>;

/**
 * One closed-form piece of a ball's motion, valid for t ∈ [t0, t1]. Without `push` the ball moves freely in
 * `phase` (motion.ts); with `push` it moves with the constant accelerations given there.
 */
export interface Segment {
    readonly t0: number;
    readonly t1: number;
    readonly phase: MotionPhase;
    readonly start: BallState;
    readonly params: MotionParams;
    readonly push?: PushMotion;
}

/** Something that happened during a shot. Times are seconds from the start of free motion. */
export type ShotEvent =
    | { readonly kind: "phase"; readonly t: number; readonly ball: BallId; readonly phase: MotionPhase }
    | {
          readonly kind: "ball-ball";
          readonly t: number;
          readonly balls: readonly [BallId, BallId];
          /** True when the contact was slower than RESTING_SPEED and was resolved as resting contact. */
          readonly resting: boolean;
      }
    | {
          readonly kind: "ball-obstacle";
          readonly t: number;
          readonly ball: BallId;
          readonly obstacleId: string;
          readonly resting: boolean;
      }
    | { readonly kind: "halted"; readonly t: number; readonly ball: BallId }
    | { readonly kind: "arrested"; readonly t: number; readonly balls: readonly BallId[] }
    | { readonly kind: "out-of-court"; readonly t: number; readonly ball: BallId; readonly position: Vec3 }
    | {
          readonly kind: "hoop-passage";
          readonly t: number;
          readonly ball: BallId;
          readonly hoopId: string;
          readonly direction: 1 | -1;
      };

/** Full outcome of a shot: exact piecewise trajectories, events in time order and rest positions. */
export interface ShotResult {
    readonly engineVersion: string;
    readonly duration: number;
    readonly segments: Partial<Record<BallId, readonly Segment[]>>;
    readonly events: readonly ShotEvent[];
    readonly rest: Partial<Record<BallId, Vec3>>;
    /** True if the event limit was reached before every ball stopped. */
    readonly aborted: boolean;
}
```

- [ ] **Step 2: Write the failing simulator tests**

The "complex" invariants scenario (pre-flight B4) is designed rather than nudged. Blue sits at rest with heavy
topspin 0.5 mm behind red, which drives red into hoop 6's east upright. That produces bounces that decay into a
resting contact, a push, red caught between blue and the upright, and rebounds. Separately, black rolls into yellow.
The hoops stay at x = 15, so the mirror test still mirrors the world. Its guard test pins the exact contact pairs, a
resting contact, a push and an upright contact. The mirror tolerance of 1e-9 m was re-checked with real collisions
and pushing: the observed difference is 4e-15 m.

`tests/engine/simulate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { horizontal, length, sub, vec3, type Vec3 } from "../../src/engine/math/vec3";
import { stateAtTime } from "../../src/engine/sample";
import { simulateFreeMotion } from "../../src/engine/simulate";
import {
    BALL_IDS,
    type BallId,
    type BallState,
    type BallStates,
    type ShotResult,
    type World,
} from "../../src/engine/types";
import { STANDARD_GRAVITY, obstaclesOf } from "../../src/engine/world";
import { kineticEnergy } from "./support/energy";
import { TEST_BALL, ballAt, rollingBallAt, testHoop, testWorld } from "./support/fixtures";

const R = TEST_BALL.radius;
const SLIDE = 0.3 * STANDARD_GRAVITY;
const ROLL = 0.05 * STANDARD_GRAVITY;

/** Samples every millisecond and returns the worst interpenetration (m) between balls or with obstacles. */
function worstPenetration(result: ShotResult, world: World): number {
    const ids = BALL_IDS.filter((id) => result.segments[id]);
    const obstacles = obstaclesOf(world);
    let worst = 0;
    for (let t = 0; t <= result.duration; t += 0.001) {
        const centres: Vec3[] = ids.map((id) => stateAtTime(result, id, t).position);
        centres.forEach((a, i) => {
            centres.slice(i + 1).forEach((b) => {
                worst = Math.max(worst, 2 * R - length(horizontal(sub(a, b))));
            });
            for (const o of obstacles) {
                worst = Math.max(worst, R + o.radius - length(horizontal(sub(a, o.centre))));
            }
        });
    }
    return worst;
}

function totalEnergy(result: ShotResult, t: number): number {
    return BALL_IDS.filter((id) => result.segments[id]).reduce(
        (sum, id) => sum + kineticEnergy(stateAtTime(result, id, t), TEST_BALL),
        0,
    );
}

describe("single ball", () => {
    it("matches the analytic slide-then-roll distance", () => {
        const v0 = 2;
        const result = simulateFreeMotion({ blue: ballAt(5, 5, vec3(v0, 0, 0)) }, testWorld());
        const tau = (2 * v0) / (7 * SLIDE);
        const slide = v0 * tau - 0.5 * SLIDE * tau * tau;
        const v1 = (5 / 7) * v0;
        expect(result.rest.blue?.x).toBeCloseTo(5 + slide + (v1 * v1) / (2 * ROLL), 9);
        expect(result.rest.blue?.y).toBe(5);
        expect(result.events.filter((e) => e.kind === "phase").map((e) => (e as { phase: string }).phase)).toEqual([
            "sliding",
            "rolling",
            "stationary",
        ]);
        expect(result.aborted).toBe(false);
    });

    it("returns immediately when nothing moves", () => {
        const result = simulateFreeMotion({ red: ballAt(3, 3), blue: ballAt(3 + 2 * R, 3) }, testWorld());
        expect(result.duration).toBe(0);
        expect(result.rest.red).toEqual(vec3(3, 3, R));
        expect(result.rest.blue).toEqual(vec3(3 + 2 * R, 3, R));
    });

    it("treats a ball moving slower than the tolerance as stationary", () => {
        const result = simulateFreeMotion({ blue: ballAt(3, 3, vec3(1e-12, 0, 0)) }, testWorld());
        expect(result.duration).toBe(0);
    });

    it("settles a ball with residual slip just above tolerance in a handful of events", () => {
        const result = simulateFreeMotion({ blue: ballAt(3, 3, vec3(2e-9, 0, 0)) }, testWorld());
        expect(result.aborted).toBe(false);
        expect(result.events.length).toBeLessThanOrEqual(4);
    });
});

describe("collisions", () => {
    it("transfers (1 + e)/2 of the striker's contact speed in a head-on rush", () => {
        const world = testWorld();
        const result = simulateFreeMotion({ blue: rollingBallAt(5, 5, 2, 0), red: ballAt(6, 5) }, world);
        const hit = result.events.find((e) => e.kind === "ball-ball");
        expect(hit).toBeDefined();
        const t = (hit as { t: number }).t;
        const vBefore = 2 - ROLL * t;
        const redSegments = result.segments.red ?? [];
        const firstMoving = redSegments.find((s) => s.phase !== "stationary");
        expect(firstMoving?.start.velocity.x).toBeCloseTo(((1 + 0.8) / 2) * vBefore, 9);
        expect((result.rest.red?.x ?? 0) > (result.rest.blue?.x ?? 0)).toBe(true);
    });

    it("rebounds off the peg", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(14, 20, 1, 0) }, testWorld());
        expect(result.events.some((e) => e.kind === "ball-obstacle" && e.obstacleId === "peg")).toBe(true);
        expect(result.rest.blue?.x).toBeLessThan(15);
    });

    it("pushes through a chain of touching balls without tunnelling (Review Focus 1)", () => {
        const world = testWorld();
        const result = simulateFreeMotion(
            {
                blue: rollingBallAt(5, 5, 2, 0),
                red: ballAt(6, 5),
                black: ballAt(6 + 2 * R, 5),
                yellow: ballAt(6 + 4 * R, 5),
            },
            world,
        );
        expect(result.aborted).toBe(false);
        expect(worstPenetration(result, world)).toBeLessThan(1e-6);
        expect((result.rest.yellow?.x ?? 0) > 6 + 4 * R).toBe(true);
        // Blue's topspin drives it back into red: that ends in resting contact and a push, not a Zeno storm (B3).
        expect(result.events.some((e) => e.kind === "ball-ball" && e.resting)).toBe(true);
        expect(result.segments.blue?.some((s) => s.push)).toBe(true);
        expect(result.events.length).toBeLessThan(200);
    });

    it("handles a ball struck while already touching another (croquet-stroke start)", () => {
        const world = testWorld();
        const result = simulateFreeMotion({ blue: ballAt(5, 5, vec3(3, 0, 0)), red: ballAt(5 + 2 * R, 5) }, world);
        expect(result.events.some((e) => e.kind === "ball-ball" && e.t === 0)).toBe(true);
        expect(worstPenetration(result, world)).toBeLessThan(1e-6);
    });

    it("does not collide balls that graze exactly tangentially (Review Focus 2)", () => {
        const world = testWorld();
        const result = simulateFreeMotion({ blue: rollingBallAt(5, 5, 2, 0), red: ballAt(6, 5 + 2 * R) }, world);
        expect(result.events.some((e) => e.kind === "ball-ball")).toBe(false);
        expect(worstPenetration(result, world)).toBeLessThan(1e-6);
    });

    it("resolves two balls striking a third at the same instant (Review Focus 4)", () => {
        const world = testWorld();
        const result = simulateFreeMotion(
            { blue: rollingBallAt(9, 5, 1, 0), red: ballAt(10, 5), black: rollingBallAt(11, 5, -1, 0) },
            world,
        );
        expect(result.aborted).toBe(false);
        expect(worstPenetration(result, world)).toBeLessThan(1e-6);
    });
});

describe("resting contact and pushing", () => {
    it("pushes a resting ball with a ball driven by topspin (analytic case)", () => {
        // Blue has topspin Ω and no velocity. The pair accelerates at A = (5·SLIDE − 7·ROLL)/12 until blue's slip
        // RΩ is gone, after t = RΩ/(A + 5·SLIDE/2); both then roll at V = A·t and stop together after V²/(2·ROLL).
        const omega = 60;
        const world = testWorld();
        const result = simulateFreeMotion(
            { blue: ballAt(5, 5, vec3(0, 0, 0), vec3(0, omega, 0)), red: ballAt(5 + 2 * R, 5) },
            world,
        );
        const A = (5 * SLIDE - 7 * ROLL) / 12;
        const t = (R * omega) / (A + 2.5 * SLIDE);
        const V = A * t;
        const travel = 0.5 * A * t * t + (V * V) / (2 * ROLL);
        expect(result.rest.red?.x).toBeCloseTo(5 + 2 * R + travel, 9);
        expect(result.rest.blue?.x).toBeCloseTo(5 + travel, 9);
        expect(result.rest.red?.y).toBe(5);
        expect(result.events.filter((e) => e.kind === "ball-ball")).toEqual([
            { kind: "ball-ball", t: 0, balls: ["blue", "red"], resting: true },
        ]);
        expect(result.segments.red?.[0]?.push?.acceleration.x).toBeCloseTo(A, 12);
        expect(result.aborted).toBe(false);
    });

    it("keeps the pushed pair touching and never gains energy while pushing", () => {
        const world = testWorld();
        const result = simulateFreeMotion(
            { blue: ballAt(5, 5, vec3(0, 0, 0), vec3(0, 60, 0)), red: ballAt(5 + 2 * R, 5) },
            world,
        );
        let previous = totalEnergy(result, 0);
        for (let i = 1; i <= 400; i++) {
            const time = (result.duration * i) / 400;
            const gap =
                length(
                    horizontal(
                        sub(stateAtTime(result, "red", time).position, stateAtTime(result, "blue", time).position),
                    ),
                ) -
                2 * R;
            expect(Math.abs(gap)).toBeLessThan(1e-9);
            const e = totalEnergy(result, time);
            expect(e).toBeLessThanOrEqual(previous + 1e-12);
            previous = e;
        }
    });

    it("pushes a ball driven into two touching balls at an angle (three-body wedge)", () => {
        const world = testWorld();
        const c = Math.sqrt(3) / 2;
        const result = simulateFreeMotion(
            {
                blue: ballAt(5, 5, vec3(0, 0, 0), vec3(0, 80, 0)),
                red: ballAt(5 + 2 * R * c, 5 - R),
                black: ballAt(5 + 2 * R * c, 5 + R),
            },
            world,
        );
        expect(result.aborted).toBe(false);
        expect(result.events.some((e) => e.kind === "arrested")).toBe(false);
        expect(result.segments.blue?.some((s) => s.push)).toBe(true);
        expect(worstPenetration(result, world)).toBeLessThan(1e-6);
        // Symmetric set-up, symmetric outcome.
        expect(result.rest.red?.x).toBeCloseTo(result.rest.black?.x ?? NaN, 9);
        expect((result.rest.red?.y ?? 0) - 5).toBeCloseTo(5 - (result.rest.black?.y ?? 0), 9);
        expect(result.rest.blue?.y).toBeCloseTo(5, 9);
    });

    it("holds a ball spinning against the peg until its slip is gone", () => {
        const world = testWorld();
        // Blue touches the peg from the west with topspin driving it east, into the peg.
        const result = simulateFreeMotion({ blue: ballAt(15 - R - 0.02, 20, vec3(0, 0, 0), vec3(0, 60, 0)) }, world);
        expect(result.events).toContainEqual({
            kind: "ball-obstacle",
            t: 0,
            ball: "blue",
            obstacleId: "peg",
            resting: true,
        });
        expect(result.aborted).toBe(false);
        expect(worstPenetration(result, world)).toBeLessThan(1e-6);
        expect(result.rest.blue?.x).toBeCloseTo(15 - R - 0.02, 9);
    });

    it("lets touching balls rolling together stop together without contact events", () => {
        const result = simulateFreeMotion(
            { blue: rollingBallAt(5, 5, 1, 0), red: rollingBallAt(5 + 2 * R, 5, 1, 0) },
            testWorld(),
        );
        expect(result.events.some((e) => e.kind === "ball-ball")).toBe(false);
        expect((result.rest.red?.x ?? 0) - (result.rest.blue?.x ?? 0)).toBeCloseTo(2 * R, 12);
    });
});

describe("halt margin", () => {
    it("stops a ball one halt margin beyond the boundary", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(1, 5, -4, 0) }, testWorld());
        expect(result.events.some((e) => e.kind === "halted" && e.ball === "blue")).toBe(true);
        expect(result.rest.blue?.x).toBeCloseTo(-1, 6);
    });

    it("takes a halted ball out of play, so a ball pushing it cannot drive it on", () => {
        // Blue, driven by topspin, pushes red west over the boundary; red is halted and blue carries on alone.
        const world = testWorld({ haltMargin: 0.1 });
        const result = simulateFreeMotion(
            { blue: ballAt(0.3, 5, vec3(-0.5, 0, 0), vec3(0, -150, 0)), red: ballAt(0.3 - 2 * R, 5) },
            world,
        );
        expect(result.aborted).toBe(false);
        expect(result.events.some((e) => e.kind === "halted" && e.ball === "red")).toBe(true);
        expect(result.rest.red?.x).toBeCloseTo(-0.1, 6);
    });
});

describe("invariants", () => {
    // Blue, at rest with heavy topspin 0.5 mm behind red, drives red into hoop 6's east upright: impacts, a push,
    // red caught between blue and the upright, and rebounds. Separately, black rolls into yellow.
    const complex: BallStates = {
        blue: ballAt(15.1713, 14.6246, vec3(0, 0, 0), vec3(-114.6, -35.5, 0)),
        red: ballAt(15.144, 14.713),
        black: rollingBallAt(12, 17, 1.5, 0.5),
        yellow: ballAt(13.5, 17.5),
    };
    const hoopWorld = testWorld({ hoops: [testHoop("5", 15, 25), testHoop("6", 15, 15)] });

    it("is bit-identical across repeated runs", () => {
        expect(simulateFreeMotion(complex, hoopWorld)).toStrictEqual(simulateFreeMotion(complex, hoopWorld));
    });

    it("exercises ball-ball and obstacle contacts", () => {
        // Guards the scenario itself: if this fails, move the balls until both kinds of contact occur.
        const result = simulateFreeMotion(complex, hoopWorld);
        const pairs = new Set(result.events.flatMap((e) => (e.kind === "ball-ball" ? [e.balls.join("-")] : [])));
        expect(pairs).toEqual(new Set(["blue-red", "black-yellow"]));
        expect(result.events.some((e) => e.kind === "ball-ball" && e.resting)).toBe(true);
        expect(result.events.some((e) => e.kind === "ball-obstacle" && e.obstacleId === "6/b")).toBe(true);
        expect(result.segments.red?.some((s) => s.push)).toBe(true);
        expect(result.aborted).toBe(false);
    });

    it("never gains energy over the shot", () => {
        const result = simulateFreeMotion(complex, hoopWorld);
        let previous = totalEnergy(result, 0);
        for (let i = 1; i <= 400; i++) {
            const e = totalEnergy(result, (result.duration * i) / 400);
            expect(e).toBeLessThanOrEqual(previous + 1e-9);
            previous = e;
        }
    });

    it("mirrors a mirrored setup", () => {
        const mirror = (s: BallState): BallState => ({
            position: vec3(30 - s.position.x, s.position.y, s.position.z),
            velocity: vec3(-s.velocity.x, s.velocity.y, s.velocity.z),
            // Angular velocity is a pseudovector: reflecting x flips its y and z components.
            angularVelocity: vec3(s.angularVelocity.x, -s.angularVelocity.y, -s.angularVelocity.z),
        });
        const mirrored = Object.fromEntries(
            Object.entries(complex).map(([id, s]) => [id, mirror(s as BallState)]),
        ) as BallStates;
        const a = simulateFreeMotion(complex, hoopWorld);
        const b = simulateFreeMotion(mirrored, hoopWorld);
        for (const id of Object.keys(complex) as BallId[]) {
            expect(b.rest[id]?.x).toBeCloseTo(30 - (a.rest[id]?.x ?? 0), 9);
            expect(b.rest[id]?.y).toBeCloseTo(a.rest[id]?.y ?? 0, 9);
        }
    });

    it("never lets balls interpenetrate each other or obstacles", () => {
        expect(worstPenetration(simulateFreeMotion(complex, hoopWorld), hoopWorld)).toBeLessThan(1e-6);
    });
});

describe("limits and validation", () => {
    it("flags an aborted run when the event limit is reached", () => {
        const result = simulateFreeMotion({ blue: ballAt(5, 5, vec3(2, 0, 0)) }, testWorld(), 1);
        expect(result.aborted).toBe(true);
    });

    it("rejects overlapping balls", () => {
        expect(() => simulateFreeMotion({ blue: ballAt(5, 5), red: ballAt(5 + R, 5) }, testWorld())).toThrow(
            RangeError,
        );
    });

    it("rejects a ball overlapping the peg", () => {
        expect(() => simulateFreeMotion({ blue: ballAt(15.03, 20) }, testWorld())).toThrow(RangeError);
    });

    it("rejects a ball not resting on the lawn", () => {
        const lifted = { ...ballAt(5, 5), position: vec3(5, 5, R + 0.01) };
        expect(() => simulateFreeMotion({ blue: lifted }, testWorld())).toThrow(RangeError);
        const rising = ballAt(5, 5, vec3(1, 0, 0.5));
        expect(() => simulateFreeMotion({ blue: rising }, testWorld())).toThrow(RangeError);
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/simulate.test.ts`
Expected: FAIL — cannot resolve `../../src/engine/sample` / `simulate`.

- [ ] **Step 4: Implement `src/engine/sample.ts`**

```ts
/**
 * Evaluates a ShotResult at an arbitrary time, for rendering, observation and tests.
 */
import { advance, trajectory, type Trajectory } from "./motion";
import { pushedState, pushedTrajectory } from "./push";
import type { BallId, BallState, Segment, ShotResult } from "./types";

/** Returns the state a time `local` (0 ≤ local ≤ t1 − t0) after the segment's start. */
export function segmentState(segment: Segment, local: number): BallState {
    return segment.push
        ? pushedState(segment.start, segment.push, local)
        : advance(segment.start, segment.phase, segment.params, local);
}

/** Returns the segment's centre trajectory, with t measured from the segment's start. */
export function segmentTrajectory(segment: Segment): Trajectory {
    return segment.push
        ? pushedTrajectory(segment.start, segment.push)
        : trajectory(segment.start, segment.phase, segment.params);
}

/** Returns the ball's state at time t, clamped to [0, duration]. Throws if the ball was not in play. */
export function stateAtTime(result: ShotResult, ball: BallId, t: number): BallState {
    const segments = result.segments[ball];
    const first = segments?.[0];
    if (!segments || !first) {
        throw new RangeError(`ball ${ball} is not in this result`);
    }
    let segment = first;
    for (const s of segments) {
        if (s.t0 <= t) {
            segment = s;
        }
    }
    return segmentState(segment, Math.min(Math.max(t - segment.t0, 0), segment.t1 - segment.t0));
}
```

- [ ] **Step 5: Implement `src/engine/simulate.ts`**

```ts
/**
 * Event-driven free-motion simulation (spec §5, phase 2).
 *
 * Each ball carries an open segment: a start state, a start time and either a free-motion phase (motion.ts) or a
 * push (push.ts), from which its state at any later time within the segment is exact. The loop finds the earliest
 * event across all balls, resolves it, and reopens the segments of the balls it affected. Candidates are gathered in
 * a fixed order and ties go to the first found, so results are deterministic.
 *
 * Contacts closing faster than RESTING_SPEED are impulses with restitution (resolve.ts). Slower ones, and touching
 * bodies driven together by their own accelerations, are resting contacts: the resting-contact solver (push.ts)
 * decides which of them push, and those are coupled until one of the pushed balls changes phase, the contact opens,
 * or another contact intervenes. For touching bodies, the decision at t = 0 uses `approachSpeed` and the same solver
 * that resolution uses, so detection and resolution always agree.
 */
import {
    CONTACT_TOLERANCE,
    approachSpeed,
    approachTime,
    boundaryCrossingTime,
    firstNonNegative,
    isTouching,
} from "./detect";
import { ZERO, dot, horizontal, length, normalize, sub, vec3, type Vec3 } from "./math/vec3";
import {
    SPEED_EPSILON,
    advance,
    atRest,
    classify,
    endOfPhase,
    phaseDuration,
    trajectory,
    type Trajectory,
} from "./motion";
import { observe } from "./observe";
import {
    ACCELERATION_EPSILON,
    RESTING_SPEED,
    SEPARATION_TOLERANCE,
    freeAcceleration,
    pushDuration,
    pushedState,
    pushedTrajectory,
    solveRestingContacts,
    type RestingContact,
    type RestingSolution,
} from "./push";
import { resolveBallBall, resolveBallCylinder } from "./resolve";
import {
    BALL_IDS,
    type BallId,
    type BallState,
    type BallStates,
    type Cylinder,
    type MotionParams,
    type MotionPhase,
    type PushMotion,
    type Segment,
    type ShotEvent,
    type ShotResult,
    type World,
} from "./types";
import { motionParamsAt, obstaclesOf, validateWorld } from "./world";

/** Version of the physics; recorded in every result and share link. */
export const ENGINE_VERSION = "0.1.0";

/** Event budget per shot. Reaching it marks the result aborted rather than looping forever. */
export const DEFAULT_MAX_EVENTS = 10_000;

/** Tolerance (m, m/s) for accepting an initial state as resting on the lawn plane. */
const PLANE_TOLERANCE = 1e-9;

interface Track {
    readonly id: BallId;
    start: BallState;
    phase: MotionPhase;
    t0: number;
    /** Time the segment stays valid: to the end of its phase, or of its push. */
    duration: number;
    params: MotionParams;
    push: PushMotion | null;
    /** A halted ball is out of play: it no longer moves or touches anything. */
    inert: boolean;
    readonly segments: Segment[];
}

/** A coupled contact: ball `a` resting against ball `b` or against `obstacle`. */
interface Coupling {
    readonly a: Track;
    readonly b: Track | null;
    readonly obstacle: Cylinder | null;
}

/** Mutable simulation state shared by the helpers below. */
interface Simulation {
    readonly world: World;
    readonly obstacles: readonly Cylinder[];
    readonly tracks: Track[];
    couplings: Coupling[];
    readonly events: ShotEvent[];
}

type Candidate =
    | { readonly time: number; readonly kind: "transition"; readonly track: Track }
    | { readonly time: number; readonly kind: "regroup"; readonly track: Track }
    | { readonly time: number; readonly kind: "ball-ball"; readonly a: Track; readonly b: Track }
    | { readonly time: number; readonly kind: "obstacle"; readonly track: Track; readonly obstacle: Cylinder }
    | { readonly time: number; readonly kind: "halt"; readonly track: Track };

function stateAt(track: Track, t: number): BallState {
    const local = Math.min(t - track.t0, track.duration);
    return track.push
        ? pushedState(track.start, track.push, local)
        : advance(track.start, track.phase, track.params, local);
}

function pathAt(track: Track, t: number): Trajectory {
    const s = stateAt(track, t);
    return track.push ? pushedTrajectory(s, track.push) : trajectory(s, track.phase, track.params);
}

function moving(track: Track): boolean {
    return !track.inert && track.phase !== "stationary";
}

/** Places the ball exactly on the lawn plane, rejecting states that are not (nearly) there. */
function onLawn(id: BallId, s: BallState, radius: number): BallState {
    if (Math.abs(s.position.z - radius) > PLANE_TOLERANCE || Math.abs(s.velocity.z) > PLANE_TOLERANCE) {
        throw new RangeError(`ball ${id} is not resting on the lawn plane`);
    }
    return {
        position: vec3(s.position.x, s.position.y, radius),
        velocity: horizontal(s.velocity),
        angularVelocity: s.angularVelocity,
    };
}

function assertNoOverlap(tracks: readonly Track[], obstacles: readonly Cylinder[], radius: number): void {
    for (let i = 0; i < tracks.length; i++) {
        const a = tracks[i] as Track;
        for (let j = i + 1; j < tracks.length; j++) {
            const b = tracks[j] as Track;
            const gap = length(horizontal(sub(a.start.position, b.start.position))) - 2 * radius;
            if (gap < -CONTACT_TOLERANCE) {
                throw new RangeError(`balls ${a.id} and ${b.id} overlap`);
            }
        }
        for (const o of obstacles) {
            const gap = length(horizontal(sub(a.start.position, o.centre))) - radius - o.radius;
            if (gap < -CONTACT_TOLERANCE) {
                throw new RangeError(`ball ${a.id} overlaps ${o.id}`);
            }
        }
    }
}

/**
 * Closes the track's current segment at `now` and opens a new one from `state`, moving freely or, when `motion` is
 * given, with that push. Records a phase event when the phase changes (or on the first segment).
 */
function reopen(
    sim: Simulation,
    track: Track | null,
    id: BallId,
    state: BallState,
    now: number,
    motion: { readonly phase: MotionPhase; readonly push: PushMotion | null } | null = null,
): Track {
    const radius = sim.world.ball.radius;
    const phase = motion ? motion.phase : classify(state, radius);
    const push = motion ? motion.push : null;
    const start = phase === "stationary" ? atRest(state.position) : state;
    const params = motionParamsAt(sim.world, start.position);
    if (track && now > track.t0) {
        const closed = { t0: track.t0, t1: now, phase: track.phase, start: track.start, params: track.params };
        track.segments.push(track.push ? { ...closed, push: track.push } : closed);
    }
    if (!track || track.phase !== phase) {
        sim.events.push({ kind: "phase", t: now, ball: id, phase });
    }
    const next: Track = track ?? { id, start, phase, t0: now, duration: 0, params, push, inert: false, segments: [] };
    next.start = start;
    next.phase = phase;
    next.t0 = now;
    next.params = params;
    next.push = push;
    next.duration = push ? pushDuration(start, phase, push, radius) : phaseDuration(start, phase, params);
    return next;
}

function coupledPair(sim: Simulation, a: Track, b: Track): boolean {
    return sim.couplings.some((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a));
}

function coupledObstacle(sim: Simulation, track: Track, obstacle: Cylinder): boolean {
    return sim.couplings.some((c) => c.a === track && c.obstacle === obstacle);
}

/** Returns the tracks joined to `seeds` by couplings, in canonical ball order. */
function groupOf(sim: Simulation, seeds: readonly Track[]): Track[] {
    const found = new Set<Track>(seeds);
    let grew = true;
    while (grew) {
        grew = false;
        for (const c of sim.couplings) {
            if (c.b && found.has(c.a) !== found.has(c.b)) {
                found.add(c.a);
                found.add(c.b);
                grew = true;
            }
        }
    }
    return sim.tracks.filter((t) => found.has(t));
}

/** Returns when the earliest segment of the track's coupled group ends (its own end when uncoupled). */
function groupEnd(sim: Simulation, track: Track): number {
    return Math.min(...groupOf(sim, [track]).map((t) => t.t0 + t.duration));
}

/** Uncouples every group containing one of `tracks`: its balls continue from their current states, moving freely. */
function release(sim: Simulation, tracks: readonly Track[], now: number): void {
    const group = groupOf(sim, tracks);
    sim.couplings = sim.couplings.filter((c) => !group.includes(c.a));
    for (const track of group) {
        if (track.push) {
            reopen(sim, track, track.id, stateAt(track, now), now);
        }
    }
}

/** The resting contacts around `seeds`: touching bodies (coupled ones within SEPARATION_TOLERANCE) closing slowly. */
interface Component {
    readonly tracks: Track[];
    readonly obstacles: Cylinder[];
    readonly contacts: RestingContact[];
}

function restingComponent(sim: Simulation, seeds: readonly Track[], now: number): Component {
    const R = sim.world.ball.radius;
    const tracks: Track[] = seeds.filter((t) => !t.inert);
    const obstacles: Cylinder[] = [];
    const contacts: RestingContact[] = [];
    const resting = (offset: Vec3, velocity: Vec3, distance: number, coupled: boolean): boolean => {
        const touching = coupled ? separationGap(offset, distance) < 0 : isTouching(offset, distance);
        return touching && Math.abs(approachSpeed(offset, velocity)) <= RESTING_SPEED;
    };
    for (let i = 0; i < tracks.length; i++) {
        const a = tracks[i] as Track;
        const sa = stateAt(a, now);
        for (const b of sim.tracks) {
            if (b === a || b.inert || contacts.some((c) => !c.fixed && tracks[c.b] === a && tracks[c.a] === b)) {
                continue;
            }
            const sb = stateAt(b, now);
            const offset = sub(sa.position, sb.position);
            if (resting(offset, sub(sa.velocity, sb.velocity), 2 * R, coupledPair(sim, a, b))) {
                if (!tracks.includes(b)) {
                    tracks.push(b);
                }
                contacts.push({ a: i, b: tracks.indexOf(b), fixed: false });
            }
        }
        for (const o of sim.obstacles) {
            if (resting(sub(sa.position, o.centre), sa.velocity, R + o.radius, coupledObstacle(sim, a, o))) {
                obstacles.push(o);
                contacts.push({ a: i, b: obstacles.length - 1, fixed: true });
            }
        }
    }
    return { tracks, obstacles, contacts };
}

function solveComponent(component: Component, now: number): RestingSolution {
    return solveRestingContacts(
        component.tracks.map((t) => ({ state: stateAt(t, now), params: t.params })),
        component.obstacles.map((o) => o.centre),
        component.contacts,
    );
}

/**
 * Resolves the resting contacts around `seeds`: uncouples every group involved, solves the component again and
 * couples the contacts the solution keeps.
 */
function settle(sim: Simulation, seeds: readonly Track[], now: number): void {
    const component = restingComponent(sim, seeds, now);
    release(sim, component.tracks, now);
    const solution = solveComponent(component, now);
    component.tracks.forEach((track, i) => {
        const member = solution.members[i];
        if (member) {
            reopen(sim, track, track.id, member.state, now, { phase: member.phase, push: member.push });
        }
    });
    component.contacts.forEach((c, k) => {
        if (solution.coupled[k]) {
            const a = component.tracks[c.a] as Track;
            sim.couplings.push(
                c.fixed
                    ? { a, b: null, obstacle: component.obstacles[c.b] as Cylinder }
                    : { a, b: component.tracks[c.b] as Track, obstacle: null },
            );
        }
    });
    const arrested = sim.tracks.filter((t) => solution.arrested[component.tracks.indexOf(t)] === true);
    if (arrested.length > 0) {
        sim.events.push({ kind: "arrested", t: now, balls: arrested.map((t) => t.id) });
    }
}

/** Returns the earlier candidate; on a tie the one found first wins, which keeps the order deterministic. */
function earlier(best: Candidate | null, candidate: Candidate): Candidate {
    return best === null || candidate.time < best.time ? candidate : best;
}

/**
 * |offset|² − (distance + SEPARATION_TOLERANCE)², which is negative while a coupled contact is still closed. The
 * separation monitor and the resting-contact component both use this one expression, so they cannot disagree.
 */
function separationGap(offset: Vec3, distance: number): number {
    const A = horizontal(offset);
    const band = 2 * distance * SEPARATION_TOLERANCE + SEPARATION_TOLERANCE * SEPARATION_TOLERANCE;
    return dot(A, A) - distance * distance - band;
}

/** Earliest time a coupled contact opens beyond SEPARATION_TOLERANCE, for relative trajectory a + b·t + c·t². */
function separationTime(a: Vec3, b: Vec3, c: Vec3, distance: number, horizon: number): number | null {
    const A = horizontal(a);
    const B = horizontal(b);
    const C = horizontal(c);
    const f = [separationGap(A, distance), 2 * dot(A, B), dot(B, B) + 2 * dot(A, C), 2 * dot(B, C), dot(C, C)];
    return firstNonNegative(f, horizon);
}

/**
 * The acceleration of a ball as the resting-contact solver sees it: its push, or its free turf acceleration. Using
 * the solver's own view (rather than the trajectory's) keeps detection consistent with resolution, including at the
 * very end of a phase, where the trajectory still says "rolling" but the state is already at rest.
 */
function accelerationOf(track: Track, state: BallState): Vec3 {
    return track.push ? track.push.acceleration : freeAcceleration(state, track.params);
}

/**
 * Decides whether touching bodies must be resolved now: they are approaching, or they rest against each other and
 * their accelerations drive them together. `other` is the second body's centre and acceleration (an obstacle's is
 * ZERO). Resolution applies the resting-contact solver, whose outcome never leaves an uncoupled resting contact
 * driven together, so a contact resolved at t = 0 does not trigger again.
 */
function contactNow(
    position: Vec3,
    acceleration: Vec3,
    otherPosition: Vec3,
    otherAcceleration: Vec3,
    closing: number,
): boolean {
    if (closing > SPEED_EPSILON) {
        return true;
    }
    const normal = normalize(horizontal(sub(otherPosition, position)));
    return closing >= -RESTING_SPEED && dot(sub(acceleration, otherAcceleration), normal) > ACCELERATION_EPSILON;
}

function findNextEvent(sim: Simulation, now: number): Candidate | null {
    const { world, obstacles } = sim;
    const R = world.ball.radius;
    const live = sim.tracks.filter((t) => !t.inert);
    const states = new Map(live.map((t) => [t, stateAt(t, now)]));
    const paths = new Map(live.map((t) => [t, pathAt(t, now)]));
    const ends = new Map(live.map((t) => [t, groupEnd(sim, t)]));
    let best: Candidate | null = null;

    for (const track of live) {
        const end = track.t0 + track.duration;
        if (moving(track) && Number.isFinite(end)) {
            best = earlier(best, { time: end, kind: track.push ? "regroup" : "transition", track });
        }
    }
    for (let i = 0; i < live.length; i++) {
        const a = live[i] as Track;
        for (let j = i + 1; j < live.length; j++) {
            const b = live[j] as Track;
            if (!moving(a) && !moving(b)) {
                continue;
            }
            const horizon = Math.min(ends.get(a) as number, ends.get(b) as number) - now;
            const pa = paths.get(a) as Trajectory;
            const pb = paths.get(b) as Trajectory;
            const rel = [sub(pa.c0, pb.c0), sub(pa.c1, pb.c1), sub(pa.c2, pb.c2)] as const;
            if (coupledPair(sim, a, b)) {
                const dt = separationTime(rel[0], rel[1], rel[2], 2 * R, horizon);
                if (dt !== null) {
                    best = earlier(best, { time: now + dt, kind: "regroup", track: a });
                }
                continue;
            }
            const sa = states.get(a) as BallState;
            const sb = states.get(b) as BallState;
            const offset = sub(sa.position, sb.position);
            const closing = approachSpeed(offset, sub(sa.velocity, sb.velocity));
            const driven = contactNow(sa.position, accelerationOf(a, sa), sb.position, accelerationOf(b, sb), closing);
            if (isTouching(offset, 2 * R) && driven) {
                best = earlier(best, { time: now, kind: "ball-ball", a, b });
                continue;
            }
            const dt = approachTime(rel[0], rel[1], rel[2], 2 * R, horizon);
            if (dt !== null) {
                best = earlier(best, { time: now + dt, kind: "ball-ball", a, b });
            }
        }
    }
    for (const track of live.filter(moving)) {
        const p = paths.get(track) as Trajectory;
        const s = states.get(track) as BallState;
        const horizon = (ends.get(track) as number) - now;
        for (const obstacle of obstacles) {
            const distance = R + obstacle.radius;
            const offset = sub(p.c0, obstacle.centre);
            if (coupledObstacle(sim, track, obstacle)) {
                const dt = separationTime(offset, p.c1, p.c2, distance, horizon);
                if (dt !== null) {
                    best = earlier(best, { time: now + dt, kind: "regroup", track });
                }
                continue;
            }
            const closing = approachSpeed(offset, s.velocity);
            const driven = contactNow(s.position, accelerationOf(track, s), obstacle.centre, ZERO, closing);
            if (isTouching(offset, distance) && driven) {
                best = earlier(best, { time: now, kind: "obstacle", track, obstacle });
                continue;
            }
            const dt = approachTime(offset, p.c1, p.c2, distance, horizon);
            if (dt !== null) {
                best = earlier(best, { time: now + dt, kind: "obstacle", track, obstacle });
            }
        }
        const dt = boundaryCrossingTime(p, world.lawn, world.haltMargin, horizon);
        if (dt !== null) {
            best = earlier(best, { time: now + dt, kind: "halt", track });
        }
    }
    return best;
}

/**
 * Simulates free motion from the given initial states until every ball is at rest (or the event budget runs
 * out). Balls must rest on the lawn plane and must not overlap one another or any obstacle.
 */
export function simulateFreeMotion(
    initial: BallStates,
    world: World,
    maxEvents: number = DEFAULT_MAX_EVENTS,
): ShotResult {
    validateWorld(world);
    const sim: Simulation = { world, obstacles: obstaclesOf(world), tracks: [], couplings: [], events: [] };
    for (const id of BALL_IDS) {
        const s = initial[id];
        if (s) {
            sim.tracks.push(reopen(sim, null, id, onLawn(id, s, world.ball.radius), 0));
        }
    }
    assertNoOverlap(sim.tracks, sim.obstacles, world.ball.radius);

    let now = 0;
    let count = 0;
    let aborted = false;
    while (sim.tracks.some(moving)) {
        if (count >= maxEvents) {
            aborted = true;
            break;
        }
        count++;
        const next = findNextEvent(sim, now);
        if (next === null) {
            throw new Error("no next event although a ball is moving");
        }
        now = next.time;
        switch (next.kind) {
            case "transition": {
                const { track } = next;
                reopen(sim, track, track.id, endOfPhase(track.start, track.phase, track.params), now);
                break;
            }
            case "regroup": {
                settle(sim, groupOf(sim, [next.track]), now);
                break;
            }
            case "ball-ball": {
                const { a, b } = next;
                const sa = stateAt(a, now);
                const sb = stateAt(b, now);
                const resting =
                    approachSpeed(sub(sa.position, sb.position), sub(sa.velocity, sb.velocity)) <= RESTING_SPEED;
                sim.events.push({ kind: "ball-ball", t: now, balls: [a.id, b.id], resting });
                if (resting) {
                    settle(sim, [a, b], now);
                } else {
                    release(sim, [a, b], now);
                    const [na, nb] = resolveBallBall(sa, sb, world.ball, world.ballBall);
                    reopen(sim, a, a.id, na, now);
                    reopen(sim, b, b.id, nb, now);
                }
                break;
            }
            case "obstacle": {
                const { track, obstacle } = next;
                const s = stateAt(track, now);
                const resting = approachSpeed(sub(s.position, obstacle.centre), s.velocity) <= RESTING_SPEED;
                sim.events.push({ kind: "ball-obstacle", t: now, ball: track.id, obstacleId: obstacle.id, resting });
                if (resting) {
                    settle(sim, [track], now);
                } else {
                    release(sim, [track], now);
                    reopen(
                        sim,
                        track,
                        track.id,
                        resolveBallCylinder(s, obstacle.centre, world.ball, obstacle.material),
                        now,
                    );
                }
                break;
            }
            case "halt": {
                const { track } = next;
                release(sim, [track], now);
                reopen(sim, track, track.id, { ...stateAt(track, now), velocity: ZERO, angularVelocity: ZERO }, now);
                track.inert = true;
                sim.events.push({ kind: "halted", t: now, ball: track.id });
                break;
            }
        }
    }

    const segments: Partial<Record<BallId, readonly Segment[]>> = {};
    const rest: Partial<Record<BallId, Vec3>> = {};
    for (const track of sim.tracks) {
        const closed = { t0: track.t0, t1: now, phase: track.phase, start: track.start, params: track.params };
        track.segments.push(track.push ? { ...closed, push: track.push } : closed);
        segments[track.id] = track.segments;
        rest[track.id] = stateAt(track, now).position;
    }
    const allEvents = [...sim.events, ...observe(segments, world)].sort((a, b) => a.t - b.t);
    return { engineVersion: ENGINE_VERSION, duration: now, segments, events: allEvents, rest, aborted };
}
```

`simulate.ts` imports `observe` from Task 10. So that this task can run on its own, create a stub now:

`src/engine/observe.ts` (temporary — Task 10 replaces the body):

```ts
/**
 * Post-hoc observation of events that do not affect motion (out of court, hoop passages). Implemented in Task 10.
 */
import type { BallId, Segment, ShotEvent, World } from "./types";

/** Returns observed events for the given segments. */
export function observe(_segments: Partial<Record<BallId, readonly Segment[]>>, _world: World): ShotEvent[] {
    return [];
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/simulate.test.ts`
Expected: PASS (26 tests).

- [ ] **Step 7: Run the whole suite, format, lint, commit**

```bash
npm test
```

```bash
npm run format
```

```bash
npm run lint
```

```bash
git add src/engine tests/engine/simulate.test.ts
```

```bash
git commit -m "Add event-driven free-motion simulator"
```

---

### Task 10: Out-of-court, hoop passages and hoop-run verdict

Passages are counted per ball per hoop over the whole segment list (pre-flight I1). The side of the hoop plane at
every segment boundary is taken from the recorded states: each segment's start state, which is also the previous
segment's end, and the final state. Only roots strictly inside a segment count. When the parity of those roots
disagrees with the side change between the boundaries, rounding next to a boundary gained or lost a root, and it is
repaired at that boundary. A crossing at a boundary is therefore seen exactly once.

**Files:**
- Modify: `src/engine/observe.ts` (replace the stub)
- Create: `src/engine/hoopRun.ts`
- Test: `tests/engine/observe.test.ts`, `tests/engine/hoopRun.test.ts`

**Interfaces:**
- Consumes: `boundaryCrossingTime` (Task 6); `hoopHalfSpan`, `hoopLateral`, `ruleThreshold` (Task 8);
  `Trajectory` (Task 5); `segmentState`, `segmentTrajectory` (Task 9); `realRootsInInterval` (Task 2);
  `ShotResult` (Task 9).
- Produces:
  - `observe(segments, world): ShotEvent[]` — per ball, at most one `out-of-court` event (the first time its centre's
    outward distance reaches `ruleThreshold(world.outOfCourt, R, 0)`), and one `hoop-passage` event for each
    crossing of a hoop's plane between its uprights (`direction` = sign of motion along `hoop.normal`).
  - `hoopRun.ts`: `interface HoopTarget { readonly hoopId: string; readonly direction: 1 | -1 }`,
    `type HoopRunVerdict = "ran" | "not-eligible" | "no-passage" | "incomplete"`,
    `judgeHoopRun(result: ShotResult, ball: BallId, target: HoopTarget, world: World): HoopRunVerdict`.

- [ ] **Step 1: Write the failing observation tests**

The boundary-aligned test calls `observe` directly on hand-built segments whose boundary is the analytic crossing
time. Against the original per-segment `[0, duration)` rule it fails, reporting two passages at speed 1.502.

`tests/engine/observe.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { vec3 } from "../../src/engine/math/vec3";
import { advance } from "../../src/engine/motion";
import { observe } from "../../src/engine/observe";
import { simulateFreeMotion } from "../../src/engine/simulate";
import { STANDARD_GRAVITY, motionParamsAt } from "../../src/engine/world";
import { ballAt, rollingBallAt, testHoop, testWorld } from "./support/fixtures";

const ROLL = 0.05 * STANDARD_GRAVITY;

/** Rolling speed that stops a ball after `distance` metres. */
function speedFor(distance: number): number {
    return Math.sqrt(2 * ROLL * distance);
}

describe("out of court", () => {
    it("applies an 'any part over the line' rule (threshold −R)", () => {
        const world = testWorld({ outOfCourt: { ballRadii: -1, uprightRadii: 0 } });
        // Stops with its centre 0.03 m inside the west line, so part of the ball is over it.
        const result = simulateFreeMotion({ blue: rollingBallAt(1, 5, -speedFor(0.97), 0) }, world);
        expect(result.events.filter((e) => e.kind === "out-of-court")).toHaveLength(1);
    });

    it("applies a 'centre over the line' rule (threshold 0)", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(1, 5, -speedFor(0.97), 0) }, testWorld());
        expect(result.events.some((e) => e.kind === "out-of-court")).toBe(false);
    });

    it("records going out before being halted, once", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(1, 5, -4, 0) }, testWorld());
        const out = result.events.filter((e) => e.kind === "out-of-court");
        const halted = result.events.find((e) => e.kind === "halted");
        expect(out).toHaveLength(1);
        expect(out[0]?.t).toBeLessThan(halted?.t ?? 0);
        expect((out[0] as { position: { x: number } }).position.x).toBeCloseTo(0, 6);
    });
});

describe("hoop passages", () => {
    const world = testWorld({ hoops: [testHoop("1", 15, 10)] });

    it("records one northward passage through the hoop", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(15, 9, 0, 1.5) }, world);
        const passages = result.events.filter((e) => e.kind === "hoop-passage");
        expect(passages).toEqual([expect.objectContaining({ ball: "blue", hoopId: "1", direction: 1 })]);
    });

    it("records a southward passage with direction −1", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(15, 11, 0, -1.5) }, world);
        expect(result.events.find((e) => e.kind === "hoop-passage")).toEqual(
            expect.objectContaining({ direction: -1 }),
        );
    });

    it("records nothing for a ball passing beside the hoop", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(15.5, 9, 0, 1.5) }, world);
        expect(result.events.some((e) => e.kind === "hoop-passage")).toBe(false);
    });

    it("records exactly one passage across a sweep of speeds (Review Focus 5)", () => {
        // Sliding-to-rolling transitions fall at different distances, some near the hoop plane.
        for (let i = 0; i < 50; i++) {
            const v = 1 + (2 * i) / 49;
            const result = simulateFreeMotion({ blue: ballAt(15, 9.5, vec3(0, v, 0)) }, world);
            expect(
                result.events.filter((e) => e.kind === "hoop-passage"),
                `speed ${v}`,
            ).toHaveLength(1);
        }
    });

    it("records exactly one passage when a segment boundary falls on the hoop plane (Review Focus 5, I1)", () => {
        // Hand-built segments whose boundary is the analytic crossing time, so the boundary state lies on the plane
        // to within rounding, on either side of it.
        const params = motionParamsAt(world, vec3(15, 9, 0));
        const a = params.rollingDecel;
        for (let i = 0; i < 2000; i++) {
            const v = 1.5 + i / 1000;
            const start = rollingBallAt(15, 9, 0, v);
            const crossing = (v - Math.sqrt(v * v - 2 * a)) / a;
            const segments = [
                { t0: 0, t1: crossing, phase: "rolling" as const, start, params },
                {
                    t0: crossing,
                    t1: crossing + 0.5,
                    phase: "rolling" as const,
                    start: advance(start, "rolling", params, crossing),
                    params,
                },
            ];
            const passages = observe({ blue: segments }, world).filter((e) => e.kind === "hoop-passage");
            expect(passages, `speed ${v}`).toHaveLength(1);
            expect(passages[0]?.t).toBeCloseTo(crossing, 9);
        }
    });

    it("does not count an upright rebound as a passage", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(15 + 0.0953 / 2 + 0.008, 9, 0, 1.5) }, world);
        expect(result.events.some((e) => e.kind === "ball-obstacle" && e.obstacleId.startsWith("1/"))).toBe(true);
        expect(result.events.some((e) => e.kind === "hoop-passage")).toBe(false);
    });
});
```

`tests/engine/hoopRun.test.ts`. The hoop is at (15, 10.5), clear of the fixture peg at (15, 20) (pre-flight B2):

```ts
import { describe, expect, it } from "vitest";
import { judgeHoopRun } from "../../src/engine/hoopRun";
import { simulateFreeMotion } from "../../src/engine/simulate";
import { STANDARD_GRAVITY } from "../../src/engine/world";
import { rollingBallAt, testHoop, testWorld } from "./support/fixtures";

const ROLL = 0.05 * STANDARD_GRAVITY;
const world = testWorld({ hoops: [testHoop("1", 15, 10.5)] });
const NORTH = { hoopId: "1", direction: 1 } as const;

describe("judgeHoopRun", () => {
    it("reports a clean run", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(15, 9.5, 0, 1.5) }, world);
        expect(judgeHoopRun(result, "blue", NORTH, world)).toBe("ran");
    });

    it("reports a ball starting on the wrong side as not eligible", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(15, 11.5, 0, -1.5) }, world);
        expect(judgeHoopRun(result, "blue", NORTH, world)).toBe("not-eligible");
    });

    it("judges the run relative to the target direction", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(15, 11.5, 0, -1.5) }, world);
        expect(judgeHoopRun(result, "blue", { hoopId: "1", direction: -1 }, world)).toBe("ran");
    });

    it("reports an upright rebound as no passage", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(15 + 0.0953 / 2 + 0.008, 9.5, 0, 1.5) }, world);
        expect(judgeHoopRun(result, "blue", NORTH, world)).toBe("no-passage");
    });

    it("reports a ball going round the hoop as no passage", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(15.5, 9.5, 0, 1.5) }, world);
        expect(judgeHoopRun(result, "blue", NORTH, world)).toBe("no-passage");
    });

    it("reports a ball stopping part-way through as incomplete", () => {
        // Starts 0.1 m short of the plane and stops 0.02 m past it (threshold is R + r = 0.054 m).
        const result = simulateFreeMotion({ blue: rollingBallAt(15, 10.4, 0, Math.sqrt(2 * ROLL * 0.12)) }, world);
        expect(judgeHoopRun(result, "blue", NORTH, world)).toBe("incomplete");
    });

    it("rejects an unknown hoop or ball", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(15, 9.5, 0, 1.5) }, world);
        expect(() => judgeHoopRun(result, "blue", { hoopId: "9", direction: 1 }, world)).toThrow(RangeError);
        expect(() => judgeHoopRun(result, "red", NORTH, world)).toThrow(RangeError);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/observe.test.ts tests/engine/hoopRun.test.ts`
Expected: FAIL — the stub `observe` returns no events; `hoopRun` cannot be resolved.

- [ ] **Step 3: Implement `src/engine/observe.ts`**

```ts
/**
 * Post-hoc observation of events that do not change the motion: a ball going out of court and a ball's centre
 * crossing a hoop's plane between the uprights. Both are found from the recorded segments.
 */
import { boundaryCrossingTime } from "./detect";
import { realRootsInInterval } from "./math/poly";
import { add, dot, horizontal, scale, sub, type Vec3 } from "./math/vec3";
import type { Trajectory } from "./motion";
import { segmentState, segmentTrajectory } from "./sample";
import { BALL_IDS, type BallId, type Hoop, type Segment, type ShotEvent, type World } from "./types";
import { hoopHalfSpan, hoopLateral, ruleThreshold } from "./world";

function positionAt(p: Trajectory, t: number): Vec3 {
    return add(add(p.c0, scale(p.c1, t)), scale(p.c2, t * t));
}

function outOfCourt(id: BallId, segments: readonly Segment[], world: World): ShotEvent[] {
    const threshold = ruleThreshold(world.outOfCourt, world.ball.radius, 0);
    for (const segment of segments) {
        const path = segmentTrajectory(segment);
        const dt = boundaryCrossingTime(path, world.lawn, threshold, segment.t1 - segment.t0);
        if (dt !== null) {
            return [{ kind: "out-of-court", t: segment.t0 + dt, ball: id, position: positionAt(path, dt) }];
        }
    }
    return [];
}

/** Which side of the hoop's plane a centre lies on: +1 on the side `normal` points to (or on the plane), else −1. */
function side(hoop: Hoop, position: Vec3): 1 | -1 {
    return dot(horizontal(sub(position, hoop.centre)), hoop.normal) >= 0 ? 1 : -1;
}

/**
 * Crossings of one hoop's plane by one ball. The side of the plane at every segment boundary is taken from the
 * recorded states (each segment's start, and the final state), which the solver computed once and shares between
 * adjacent segments, so a crossing at a boundary is seen by exactly one segment. Within a segment only roots strictly
 * inside (0, duration) are used, and they are reconciled with the boundary sides: an odd number of genuine crossings
 * must change the side and an even number must not. A disagreement can only come from a root lost or found by
 * rounding next to a boundary, and is repaired there.
 */
function passages(id: BallId, segments: readonly Segment[], hoop: Hoop): ShotEvent[] {
    const events: ShotEvent[] = [];
    const record = (t: number, position: Vec3, direction: 1 | -1): void => {
        const lateral = dot(horizontal(sub(position, hoop.centre)), hoopLateral(hoop));
        if (Math.abs(lateral) < hoopHalfSpan(hoop)) {
            events.push({ kind: "hoop-passage", t, ball: id, hoopId: hoop.id, direction });
        }
    };
    segments.forEach((segment, k) => {
        const duration = segment.t1 - segment.t0;
        const next = segments[k + 1];
        const endState = next ? next.start : segmentState(segment, duration);
        const before = side(hoop, segment.start.position);
        const after = side(hoop, endState.position);
        const path = segmentTrajectory(segment);
        const n = hoop.normal;
        const coeffs = [dot(horizontal(sub(path.c0, hoop.centre)), n), dot(path.c1, n), dot(path.c2, n)];
        const slope = (t: number): number => (coeffs[1] ?? 0) + 2 * (coeffs[2] ?? 0) * t;
        // Interior crossings only; a zero-slope root is a tangency, not a crossing.
        const roots = realRootsInInterval(coeffs, 0, duration).filter((t) => t > 0 && t < duration && slope(t) !== 0);
        const changed = before !== after;
        if (roots.length % 2 === 1 && !changed) {
            // A spurious root beside a boundary: drop the one nearest either end.
            const edge = (t: number): number => Math.min(t, duration - t);
            const nearest = roots.reduce((best, t) => (edge(t) < edge(best) ? t : best));
            roots.splice(roots.indexOf(nearest), 1);
        } else if (roots.length % 2 === 0 && changed) {
            // A crossing lost at a boundary: place it at whichever end lies closer to the plane.
            const atStart =
                Math.abs(coeffs[0] ?? 0) <= Math.abs(dot(horizontal(sub(endState.position, hoop.centre)), n));
            const t = atStart ? 0 : duration;
            record(segment.t0 + t, atStart ? segment.start.position : endState.position, after);
        }
        for (const t of roots) {
            record(segment.t0 + t, positionAt(path, t), slope(t) > 0 ? 1 : -1);
        }
    });
    return events.sort((a, b) => a.t - b.t);
}

/** Returns out-of-court and hoop-passage events for the recorded segments, in ball order. */
export function observe(segmentsByBall: Partial<Record<BallId, readonly Segment[]>>, world: World): ShotEvent[] {
    const events: ShotEvent[] = [];
    for (const id of BALL_IDS) {
        const segments = segmentsByBall[id];
        if (!segments) {
            continue;
        }
        events.push(...outOfCourt(id, segments, world));
        for (const hoop of world.hoops) {
            events.push(...passages(id, segments, hoop));
        }
    }
    return events;
}
```

- [ ] **Step 4: Implement `src/engine/hoopRun.ts`**

```ts
/**
 * Hoop-run verdict per the Laws (reference/laws.json): a ball runs its target hoop in a stroke if it starts
 * eligible, passes through in the running direction, and ends the stroke having completed the running.
 */
import { dot, horizontal, sub, type Vec3 } from "./math/vec3";
import type { BallId, ShotResult, World } from "./types";
import { hoopHalfSpan, hoopLateral, ruleThreshold } from "./world";

/** The hoop the striker's ball is attempting, and the direction (+1 along the hoop normal, −1 against). */
export interface HoopTarget {
    readonly hoopId: string;
    readonly direction: 1 | -1;
}

/** Outcome of a hoop attempt. */
export type HoopRunVerdict = "ran" | "not-eligible" | "no-passage" | "incomplete";

/** Judges whether `ball` ran the target hoop in this shot. */
export function judgeHoopRun(result: ShotResult, ball: BallId, target: HoopTarget, world: World): HoopRunVerdict {
    const hoop = world.hoops.find((h) => h.id === target.hoopId);
    if (!hoop) {
        throw new RangeError(`unknown hoop ${target.hoopId}`);
    }
    const first = result.segments[ball]?.[0];
    const rest = result.rest[ball];
    if (!first || !rest) {
        throw new RangeError(`ball ${ball} is not in this result`);
    }
    const R = world.ball.radius;
    const r = hoop.uprightRadius;
    // Signed distance of the centre from the plane through the uprights' axes, positive in the running direction.
    const signed = (p: Vec3): number => dot(horizontal(sub(p, hoop.centre)), hoop.normal) * target.direction;
    const start = first.start.position;

    if (signed(start) > ruleThreshold(world.hoopRunStart, R, r)) {
        return "not-eligible";
    }
    const own = result.events.filter((e) => e.kind === "hoop-passage" && e.ball === ball && e.hoopId === hoop.id);
    const last = own[own.length - 1];
    // A ball that starts with its centre already past the plane (between the uprights) needs no new passage.
    const startsInside =
        signed(start) >= 0 &&
        Math.abs(dot(horizontal(sub(start, hoop.centre)), hoopLateral(hoop))) < hoopHalfSpan(hoop);
    const passedForward = last ? last.kind === "hoop-passage" && last.direction === target.direction : startsInside;
    if (!passedForward) {
        return "no-passage";
    }
    if (signed(rest) < ruleThreshold(world.hoopRunComplete, R, r)) {
        return "incomplete";
    }
    return "ran";
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/engine`
Expected: PASS: observe 9 tests, hoopRun 7, and every earlier engine test, now with observation events merged in.

- [ ] **Step 6: Format, lint, commit**

```bash
npm run format
```

```bash
npm run lint
```

```bash
git add src/engine/observe.ts src/engine/hoopRun.ts tests/engine/observe.test.ts tests/engine/hoopRun.test.ts
```

```bash
git commit -m "Add out-of-court and hoop-passage observation and hoop-run verdict"
```

---

### Task 11: Brute-force cross-check and public engine API

Spec §9.1: "Event solver cross-checked against brute-force small-step integration of the same shot." The integrator
below re-derives the motion from **forces** rather than from `motion.ts`'s closed forms. It finds contacts by overlap
on a fixed time grid and resolves every overlap with the engine's impulse functions. It also borrows `contactSlip`,
`rollingSpin` and `motionParamsAt` (pre-flight M5). It has **no** resting-contact or pushing code. A push emerges in
it as many tiny impulses per step: a Moreau-style time-stepping scheme that converges to the constrained motion as
the step shrinks. It therefore checks the pushing model independently, including the 7m/5 effective inertia of a
pushed rolling ball and the static rolling resistance of a pushed resting ball.

For that to hold, a slip smaller than one step's friction must end within the step. The ball loses exactly 2/7 of
the slip and rolls. Applying a full step of friction would reverse the slip, so the tiny slips that pushing creates
every step would stop a pushed ball from ever moving: that defect made the original integrator useless for pushing.

The engine treats a pushing contact as frictionless; the integrator applies ball–ball friction on every
micro-impulse. The wedge scenario, whose balls slide past each other while pushing, therefore runs with ball–ball
friction off. The straight push and the chain have no horizontal slip at the contact, so they run in the standard
test world. Observed agreement is 0.37 mm or better in every scenario.

**Files:**
- Create: `tests/engine/support/bruteForce.ts`, `src/engine/index.ts`
- Test: `tests/engine/crossCheck.test.ts`, `tests/engine/index.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `src/engine/index.ts` re-exporting the public engine API. Types: `BallId`, `BALL_IDS`, `BallState`,
  `BallStates`, `MotionPhase`, `PushMotion`, `Segment`, `ShotEvent`, `ShotResult`, `World`, `Hoop`, `Cylinder`,
  `Lawn`, `SurfaceProps`, `ContactMaterial`, `OffsetRule`, `BallParams`, `MotionParams`. Also `Vec3` and `vec3`,
  `simulateFreeMotion`, `ENGINE_VERSION`, `stateAtTime`, `judgeHoopRun`, `HoopTarget`, `HoopRunVerdict`,
  `defaultWorld` and `STANDARD_GRAVITY`. Test helper:
  `bruteForce(initial, world, dt, maxTime): Partial<Record<BallId, Vec3>>`.

- [ ] **Step 1: Write the brute-force integrator**

`tests/engine/support/bruteForce.ts`:

```ts
/**
 * Reference integrator for cross-checking the event-driven solver. Integrates the turf forces with
 * semi-implicit Euler at a fixed step and detects contacts by overlap. Test-only and deliberately slow.
 */
import {
    ZERO,
    add,
    dot,
    horizontal,
    length,
    normalize,
    scale,
    sub,
    vec3,
    type Vec3,
} from "../../../src/engine/math/vec3";
import { contactSlip, rollingSpin } from "../../../src/engine/motion";
import { resolveBallBall, resolveBallCylinder } from "../../../src/engine/resolve";
import { BALL_IDS, type BallId, type BallState, type BallStates, type World } from "../../../src/engine/types";
import { motionParamsAt, obstaclesOf } from "../../../src/engine/world";

const STOP_SPEED = 1e-9;

function step(s: BallState, world: World, dt: number): BallState {
    const R = world.ball.radius;
    const p = motionParamsAt(world, s.position);
    const slip = contactSlip(s, R);
    let velocity: Vec3;
    let angularVelocity: Vec3;
    if (length(slip) > STOP_SPEED && length(slip) <= 3.5 * p.slidingDecel * dt) {
        // Friction removes slip at 7/2·a, so this slip ends within the step: the ball loses exactly 2/7 of it and
        // rolls. (Applying a full step of friction here would reverse the slip; contact pushes create such small
        // slips every step.)
        // Rolling resistance acts for the step as well, stopping rather than reversing.
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

/** Integrates the shot at fixed step `dt` for at most `maxTime` seconds and returns rest positions. */
export function bruteForce(
    initial: BallStates,
    world: World,
    dt: number,
    maxTime: number,
): Partial<Record<BallId, Vec3>> {
    const R = world.ball.radius;
    const obstacles = obstaclesOf(world);
    const ids = BALL_IDS.filter((id) => initial[id]);
    const states = new Map<BallId, BallState>(ids.map((id) => [id, initial[id] as BallState]));
    for (let t = 0; t < maxTime; t += dt) {
        let moving = false;
        for (const id of ids) {
            const s = states.get(id) as BallState;
            const next = step(s, world, dt);
            if (length(next.velocity) > 0) {
                moving = true;
            }
            states.set(id, next);
        }
        for (let i = 0; i < ids.length; i++) {
            const a = ids[i] as BallId;
            for (let j = i + 1; j < ids.length; j++) {
                const b = ids[j] as BallId;
                const sa = states.get(a) as BallState;
                const sb = states.get(b) as BallState;
                if (length(horizontal(sub(sa.position, sb.position))) < 2 * R) {
                    const [na, nb] = resolveBallBall(sa, sb, world.ball, world.ballBall);
                    states.set(a, na);
                    states.set(b, nb);
                }
            }
            for (const o of obstacles) {
                const s = states.get(a) as BallState;
                if (length(horizontal(sub(s.position, o.centre))) < R + o.radius) {
                    states.set(a, resolveBallCylinder(s, o.centre, world.ball, o.material));
                }
            }
        }
        if (!moving) {
            break;
        }
    }
    return Object.fromEntries(ids.map((id) => [id, (states.get(id) as BallState).position]));
}
```

- [ ] **Step 2: Write the cross-check tests**

"Peg glance then cannon" uses the verified positions from pre-flight I3. The last test guards every scenario against
silently losing the contacts it is named after.

`tests/engine/crossCheck.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { length, sub, vec3 } from "../../src/engine/math/vec3";
import { simulateFreeMotion } from "../../src/engine/simulate";
import type { BallId, BallStates, World } from "../../src/engine/types";
import { bruteForce } from "./support/bruteForce";
import { TEST_BALL, ballAt, rollingBallAt, testWorld } from "./support/fixtures";

const R = TEST_BALL.radius;
const DT = 2e-6;
const TOLERANCE = 1e-3;
const C30 = Math.sqrt(3) / 2;

/**
 * The engine treats a pushing contact as frictionless (see push.ts), while the integrator applies ball–ball friction
 * on every one of its many small impulses. Scenarios whose balls slide against each other while pushing therefore
 * run with ball–ball friction switched off, so that they check the pushing mechanics rather than that
 * simplification.
 */
const FRICTIONLESS: Partial<World> = { ballBall: { restitution: 0.8, friction: 0 } };

const SCENARIOS: Record<string, { readonly initial: BallStates; readonly world?: Partial<World> }> = {
    "single ball with sidespin (curving slide)": { initial: { blue: ballAt(5, 5, vec3(2.5, 0.4, 0), vec3(25, 0, 3)) } },
    "cut rush with spin": { initial: { blue: ballAt(5, 5, vec3(2.5, 0, 0), vec3(0, 10, 5)), red: ballAt(6, 5.06) } },
    "peg glance then cannon": {
        initial: { blue: rollingBallAt(13, 19.94, 2.2, 0), red: ballAt(15.45, 19.69), black: ballAt(16.25, 19.59) },
    },
    "topspin push (resting contact)": {
        initial: { blue: ballAt(5, 5, vec3(0, 0, 0), vec3(0, 60, 0)), red: ballAt(5 + 2 * R, 5) },
    },
    "rush into a chain of touching balls, then a push": {
        initial: {
            blue: rollingBallAt(5, 5, 2, 0),
            red: ballAt(6, 5),
            black: ballAt(6 + 2 * R, 5),
            yellow: ballAt(6 + 4 * R, 5),
        },
    },
    "push into two touching balls at an angle (wedge)": {
        initial: {
            blue: ballAt(5, 5, vec3(0, 0, 0), vec3(0, 80, 0)),
            red: ballAt(5 + 2 * R * C30, 5 - R),
            black: ballAt(5 + 2 * R * C30, 5 + R),
        },
        world: FRICTIONLESS,
    },
};

describe("event solver versus brute-force integration", () => {
    for (const [name, { initial, world: overrides }] of Object.entries(SCENARIOS)) {
        it(`agrees within 1 mm: ${name}`, { timeout: 120_000 }, () => {
            const world = testWorld(overrides);
            const exact = simulateFreeMotion(initial, world);
            const reference = bruteForce(initial, world, DT, exact.duration + 1);
            for (const id of Object.keys(initial) as BallId[]) {
                const a = exact.rest[id];
                const b = reference[id];
                expect(a && b ? length(sub(a, b)) : Infinity, `ball ${id}`).toBeLessThan(TOLERANCE);
            }
        });
    }

    it("exercises the contacts each scenario is named after", () => {
        const kinds = (name: string): readonly string[] => {
            const { initial, world } = SCENARIOS[name] as { initial: BallStates; world?: Partial<World> };
            return simulateFreeMotion(initial, testWorld(world)).events.map((e) =>
                e.kind === "ball-ball" ? `${e.balls.join("-")}${e.resting ? " resting" : ""}` : e.kind,
            );
        };
        const glance = kinds("peg glance then cannon");
        expect(glance).toContain("ball-obstacle");
        expect(glance).toContain("blue-red");
        expect(glance).toContain("red-black");
        expect(kinds("topspin push (resting contact)")).toContain("blue-red resting");
        expect(kinds("rush into a chain of touching balls, then a push")).toContain("blue-red resting");
        const wedge = kinds("push into two touching balls at an angle (wedge)");
        expect(wedge).toContain("blue-red resting");
        expect(wedge).not.toContain("arrested");
    });
});
```

- [ ] **Step 3: Run the cross-check**

Run: `npx vitest run tests/engine/crossCheck.test.ts`
Expected: PASS (7 tests, about 5 s). A failure here is a real defect in the closed forms, the event scheduling or the
resting-contact solver. Use superpowers:systematic-debugging rather than loosening the tolerance.

- [ ] **Step 4: Write the failing API test**

`tests/engine/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import * as engine from "../../src/engine/index";

describe("engine public API", () => {
    it("exposes the simulation entry points", () => {
        expect(typeof engine.simulateFreeMotion).toBe("function");
        expect(typeof engine.stateAtTime).toBe("function");
        expect(typeof engine.judgeHoopRun).toBe("function");
        expect(typeof engine.defaultWorld).toBe("function");
        expect(engine.ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
        expect(engine.BALL_IDS).toEqual(["blue", "red", "black", "yellow"]);
    });

    it("simulates a shot on the default world", () => {
        const world = engine.defaultWorld();
        const r = world.ball.radius;
        const result = engine.simulateFreeMotion(
            {
                blue: {
                    position: engine.vec3(5, 5, r),
                    velocity: engine.vec3(2, 0, 0),
                    angularVelocity: engine.vec3(0, 0, 0),
                },
            },
            world,
        );
        expect(result.aborted).toBe(false);
        expect(result.rest.blue?.x).toBeGreaterThan(5);
    });
});
```

Run: `npx vitest run tests/engine/index.test.ts`
Expected: FAIL — cannot resolve `../../src/engine/index`.

- [ ] **Step 5: Implement `src/engine/index.ts`**

```ts
/**
 * Public API of the croquet physics engine. The planner and renderer import from here only.
 */
export { judgeHoopRun, type HoopRunVerdict, type HoopTarget } from "./hoopRun";
export { vec3, type Vec3 } from "./math/vec3";
export { stateAtTime } from "./sample";
export { ENGINE_VERSION, simulateFreeMotion } from "./simulate";
export {
    BALL_IDS,
    type BallId,
    type BallParams,
    type BallState,
    type BallStates,
    type ContactMaterial,
    type Cylinder,
    type Hoop,
    type Lawn,
    type MotionParams,
    type MotionPhase,
    type OffsetRule,
    type PushMotion,
    type Segment,
    type ShotEvent,
    type ShotResult,
    type SurfaceProps,
    type World,
} from "./types";
export { STANDARD_GRAVITY, defaultWorld } from "./world";
```

- [ ] **Step 6: Run the full gate**

```bash
npm run format
```

```bash
npm run lint
```

```bash
npm run format:check
```

```bash
npm run check
```

```bash
npm test
```

```bash
npm run build
```

Expected: every command exits 0; `npm test` reports 147 tests across 14 files.

- [ ] **Step 7: Commit**

```bash
git add src/engine/index.ts tests/engine/support/bruteForce.ts tests/engine/crossCheck.test.ts tests/engine/index.test.ts
```

```bash
git commit -m "Cross-check event solver against brute-force integration and expose engine API"
```

---

## P1 exit checklist

- [ ] All CI gates pass locally (Task 11, Step 6).
- [ ] Every value in `reference/*.json` has a source; `analogue` entries explain the analogy.
- [ ] `npm run lint` is clean. Its determinism rule is the check that engine code uses only IEEE-exact operations; it
      covers every non-exact `Math` function, which a grep would not (pre-flight M8).
- [ ] Roadmap updated if any provisional number or interface changed during P1. That includes the new `push.ts`
      module, the `resting` flag on contact events and the `arrested` event.
- [ ] Ask the user whether to create the GitHub remote (public or private) so CI can run.
