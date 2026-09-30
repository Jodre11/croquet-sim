# P1 — Foundations and Free-Motion Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the repository and deliver a deterministic, event-driven free-motion (phase 2) croquet engine,
driven by sourced reference data, that turns initial ball states into a time-parameterised `ShotResult`.

**Architecture:** A pure TypeScript engine under `src/engine/` with no DOM dependency. Each ball moves on
closed-form quadratic trajectories within a motion phase (sliding, rolling, stationary). The solver jumps directly
to the next event (phase transition, ball–ball contact, ball–upright/peg contact, halt margin), resolves it with an
instantaneous impulse, and records per-ball segments. Out-of-court and hoop-passage events are observed afterwards
from the segments. Physical constants come from `reference/*.json`, each value carrying its source.

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
  Exceptions: standard gravity (a defined constant) and numerical tolerances. Test fixtures may use explicit,
  clearly-labelled test values.
- Public/exported functions carry a header comment; cognitively complex code carries explanatory comments.
- Commit messages follow the repo's existing style: short imperative sentence (e.g. "Add polynomial root finder").

## Review Focus

1. **Balls that start exactly touching** (every croquet stroke; chains of touching balls) — no spurious
   zero-time collisions, no tunnelling, the simulation terminates. Pinned in Task 9.
2. **Grazing, near-tangent contacts** — no phantom impulse, no interpenetration. Pinned in Tasks 6 and 9.
3. **Very slow balls and residual slip just above tolerance** — the solver terminates promptly without an event
   storm or `aborted`. Pinned in Task 9.
4. **Simultaneous events** (two balls striking a third at the same instant) — resolved sequentially without
   penetration or abort. Pinned in Task 9.
5. **Crossing a hoop plane near a segment boundary** — exactly one passage event, never zero or two. Pinned in
   Task 10.

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
| `src/engine/world.ts` | World helpers, validation, default world from reference data |
| `src/engine/simulate.ts` | Event loop producing `ShotResult` |
| `src/engine/sample.ts` | Sampling a `ShotResult` at any time |
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

**Files:**
- Create: `src/engine/detect.ts`
- Test: `tests/engine/detect.test.ts`

**Interfaces:**
- Consumes: `realRootsInInterval` (Task 2); `Trajectory` (Task 5); `vec3.ts`.
- Produces:
  - `CONTACT_TOLERANCE = 1e-9` (m)
  - `approachTime(a: Vec3, b: Vec3, c: Vec3, distance: number, horizon: number): number | null` — earliest
    `t ∈ [0, horizon]` at which the horizontal relative trajectory `a + b·t + c·t²` comes within `distance` of the
    origin **while approaching**. Returns `0` when already touching (gap ≤ tolerance) and approaching. Throws
    `RangeError` for a non-finite horizon.
  - `firstNonNegative(coeffs: readonly number[], horizon: number): number | null` — earliest `t ∈ [0, horizon]`
    with `g(t) ≥ 0` (0 if `g(0) ≥ 0`).
  - `interface Bounds { readonly width: number; readonly length: number }`
  - `boundaryCrossingTime(traj: Trajectory, bounds: Bounds, threshold: number, horizon: number): number | null` —
    earliest time the centre's outward distance beyond any boundary line reaches `threshold`.
  - `outwardDistance(position: Vec3, bounds: Bounds): number` — max over the four lines of the centre's distance
    beyond that line (negative when inside).

- [ ] **Step 1: Write the failing tests**

`tests/engine/detect.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { approachTime, boundaryCrossingTime, outwardDistance } from "../../src/engine/detect";
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

    it("returns 0 for touching bodies that approach, and null for touching bodies that separate", () => {
        expect(approachTime(vec3(-TWO_R, 0, 0), vec3(1, 0, 0), ZERO, TWO_R, 5)).toBe(0);
        expect(approachTime(vec3(-TWO_R, 0, 0), vec3(-1, 0, 0), ZERO, TWO_R, 5)).toBeNull();
    });

    it("returns 0 for touching bodies with no relative speed that are about to converge", () => {
        // Relative velocity zero, relative acceleration toward each other.
        expect(approachTime(vec3(-TWO_R, 0, 0), ZERO, vec3(0.5, 0, 0), TWO_R, 5)).toBe(0);
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
 * Event-time detection. Each ball's centre follows a quadratic within a phase, so the squared distance between
 * two balls (or a ball and a vertical cylinder) is a quartic in time; its earliest approaching root is the
 * contact time. Boundary distances are quadratics.
 */
import { realRootsInInterval } from "./math/poly";
import { dot, horizontal, length, type Vec3 } from "./math/vec3";
import type { Trajectory } from "./motion";

/** Surfaces closer than this (m) are treated as touching. */
export const CONTACT_TOLERANCE = 1e-9;

/**
 * Returns the earliest t in [0, horizon] at which the horizontal relative trajectory a + b·t + c·t² comes within
 * `distance` of the origin while the separation is decreasing, or null if it does not. Returns 0 when the bodies
 * already touch and are approaching (or have zero relative speed and are converging).
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

    const touching = length(A) - distance <= CONTACT_TOLERANCE;
    if (touching && (f1 < 0 || (f1 === 0 && f2 < 0))) {
        return 0;
    }
    for (const t of realRootsInInterval([f0, f1, f2, f3, f4], 0, horizon)) {
        if (touching && t === 0) {
            continue;
        }
        const slope = f1 + t * (2 * f2 + t * (3 * f3 + t * 4 * f4));
        if (slope < 0) {
            return t;
        }
    }
    return null;
}

/** Returns the earliest t in [0, horizon] with g(t) ≥ 0 for ascending coefficients g, or null. */
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
Expected: PASS.

- [ ] **Step 5: Lint and commit**

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

### Task 7: Collision impulses

Free-motion collisions (spec §5: "instantaneous impulses with restitution and friction"). For two identical solid
spheres, a tangential impulse `J` changes the relative contact-point velocity by `7J/m`, so the impulse that stops
tangential slip is `m·|vt|/7`; Coulomb friction caps it at `μ·Jn`. Against a fixed cylinder the factor is `7/(2m)`.
Tangential friction is kept in the lawn plane: vertical slip at the equator would lift the ball, which the turf
prevents, and lift is the impact phase's concern (P2).

**Files:**
- Create: `src/engine/resolve.ts`
- Modify: `src/engine/types.ts` (append `ContactMaterial`)
- Test: `tests/engine/resolve.test.ts`

**Interfaces:**
- Consumes: `BallState`, `BallParams` (Task 5); `vec3.ts`.
- Produces:
  - `types.ts`: `interface ContactMaterial { readonly restitution: number; readonly friction: number }`
  - `resolveBallBall(a: BallState, b: BallState, ball: BallParams, material: ContactMaterial): readonly [BallState, BallState]`
    — returns the inputs unchanged (same objects) if the pair is not approaching.
  - `resolveBallCylinder(s: BallState, axis: Vec3, ball: BallParams, material: ContactMaterial): BallState` —
    `axis` is any point on the vertical cylinder axis; returns `s` unchanged if not approaching.

- [ ] **Step 1: Append `ContactMaterial` to `src/engine/types.ts`**

```ts
/** Restitution (0–1) and Coulomb friction coefficient for a pair of contacting materials. */
export interface ContactMaterial {
    readonly restitution: number;
    readonly friction: number;
}
```

- [ ] **Step 2: Write the failing tests**

`tests/engine/resolve.test.ts`:

```ts
import { describe, expect, it } from "vitest";
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
            const sa = at(0, 0, vec3(random() * 3, random() * 2 - 1, 0), vec3(random() * 60 - 30, random() * 60 - 30, random() * 20 - 10));
            const sb = at(2 * R * Math.cos(angle), 2 * R * Math.sin(angle), vec3(random() - 0.5, random() - 0.5, 0), vec3(random() * 20 - 10, random() * 20 - 10, 0));
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

    it("leaves spin untouched without friction", () => {
        const w = vec3(3, -4, 5);
        const [a] = resolveBallBall(at(0, 0, vec3(1, 0.2, 0), w), at(2 * R, 0), BALL, { restitution: 0.8, friction: 0 });
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
            const s0 = at(0, 0, vec3(random() * 2 - 1, random() * 2 - 1, 0), vec3(random() * 60 - 30, random() * 60 - 30, random() * 20 - 10));
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
 * friction in the lawn plane. Linear velocity stays horizontal (the turf prevents lift in free motion).
 */
import { ZERO, add, cross, dot, horizontal, length, normalize, scale, sub, type Vec3 } from "./math/vec3";
import type { BallParams, BallState, ContactMaterial } from "./types";

function inertia(ball: BallParams): number {
    return 0.4 * ball.mass * ball.radius * ball.radius;
}

/**
 * Resolves a collision between two identical balls. Returns the inputs unchanged if they are not approaching
 * along the line of centres.
 */
export function resolveBallBall(
    a: BallState,
    b: BallState,
    ball: BallParams,
    material: ContactMaterial,
): readonly [BallState, BallState] {
    const { radius: r, mass: m } = ball;
    const n = normalize(horizontal(sub(b.position, a.position)));
    // Contact-point velocities: a touches at +r·n from its centre, b at −r·n.
    const ua = add(a.velocity, cross(a.angularVelocity, scale(n, r)));
    const ub = add(b.velocity, cross(b.angularVelocity, scale(n, -r)));
    const relative = sub(ua, ub);
    const approach = dot(relative, n);
    if (approach <= 0) {
        return [a, b];
    }

    // Normal impulse on b: relative normal speed changes by 2·Jn/m and must end at −e × approach.
    const jn = ((1 + material.restitution) * m * approach) / 2;
    // Tangential impulse changes relative slip by 7·Jt/m; stop the slip or slide at the Coulomb limit.
    const slip = horizontal(sub(relative, scale(n, approach)));
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
 * through `axis`. Returns the input unchanged if the ball is not approaching the cylinder.
 */
export function resolveBallCylinder(
    s: BallState,
    axis: Vec3,
    ball: BallParams,
    material: ContactMaterial,
): BallState {
    const { radius: r, mass: m } = ball;
    const n = normalize(horizontal(sub(s.position, axis)));
    // The ball touches the cylinder at −r·n from its centre.
    const contact = scale(n, -r);
    const relative = add(s.velocity, cross(s.angularVelocity, contact));
    const normalSpeed = dot(relative, n);
    if (normalSpeed >= 0) {
        return s;
    }

    const pn = -(1 + material.restitution) * m * normalSpeed;
    // Tangential impulse changes contact slip by 7·Pt/(2m).
    const slip = horizontal(sub(relative, scale(n, normalSpeed)));
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
Expected: PASS.

- [ ] **Step 6: Format, lint, commit**

```bash
npm run format
```

```bash
npm run lint
```

```bash
git add src/engine/types.ts src/engine/resolve.ts tests/engine/resolve.test.ts
```

```bash
git commit -m "Add ball-ball and ball-cylinder collision impulses"
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
  - `world.ts`: `STANDARD_GRAVITY = 9.80665`, `uniformLawn(width, length, surface): Lawn`,
    `rollingResistanceForLawnSpeed(seconds: number, distance: number, gravity: number): number`,
    `hoopHalfSpan(hoop: Hoop): number`, `hoopLateral(hoop: Hoop): Vec3`,
    `uprightsOf(hoop: Hoop, material: ContactMaterial): readonly [Cylinder, Cylinder]` (ids `"<hoopId>/a"`,
    `"<hoopId>/b"`), `obstaclesOf(world: World): readonly Cylinder[]` (uprights in hoop order, then the peg),
    `motionParamsAt(world: World, position: Vec3): MotionParams`,
    `ruleThreshold(rule: OffsetRule, ballRadius: number, uprightRadius: number): number`,
    `validateWorld(world: World): void` (throws `RangeError`), `defaultWorld(lawnSpeedSeconds?: number): World`.
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
 * Test-only world and balls. The numbers are plausible but deliberately NOT sourced: tests must not depend on the
 * reference data, and src/ must never import this file.
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
        const end = endOfPhase({ position: vec3(0, 0, 0.046), velocity: v, angularVelocity: rollingSpin(v, 0, 0.046) }, "rolling", params);
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

/** Creates a lawn with the same surface everywhere. */
export function uniformLawn(width: number, length: number, surface: SurfaceProps): Lawn {
    return { width, length, surfaceAt: () => surface };
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
        haltMargin: 1,
    };
}
```

`haltMargin: 1` is a modelling choice, not a physical constant: the spec halts balls at "a fixed margin beyond the
boundary" because the surround is not modelled.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/world.test.ts`
Expected: PASS.

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

The loop: find the earliest event across all balls (phase end, ball–ball contact, ball–obstacle contact, halt
margin), advance to it, resolve it, and restart the affected balls' segments. Unaffected balls keep their segment
and are evaluated from its start whenever needed, so no error accumulates.

**Files:**
- Create: `src/engine/simulate.ts`, `src/engine/sample.ts`, `src/engine/observe.ts` (stub; Task 10 fills it)
- Modify: `src/engine/types.ts` (append result types)
- Test: `tests/engine/simulate.test.ts`

**Interfaces:**
- Consumes: Tasks 5–8.
- Produces:
  - `types.ts`: `BallStates = Partial<Record<BallId, BallState>>`;
    `Segment { t0; t1: number; phase: MotionPhase; start: BallState; params: MotionParams }`;
    `ShotEvent` union — `{ kind: "phase"; t; ball; phase }`, `{ kind: "ball-ball"; t; balls: readonly [BallId, BallId] }`,
    `{ kind: "ball-obstacle"; t; ball; obstacleId: string }`, `{ kind: "halted"; t; ball }`,
    `{ kind: "out-of-court"; t; ball; position: Vec3 }`, `{ kind: "hoop-passage"; t; ball; hoopId: string; direction: 1 | -1 }`;
    `ShotResult { engineVersion: string; duration: number; segments: Partial<Record<BallId, readonly Segment[]>>; events: readonly ShotEvent[]; rest: Partial<Record<BallId, Vec3>>; aborted: boolean }`.
  - `simulate.ts`: `ENGINE_VERSION = "0.1.0"`, `DEFAULT_MAX_EVENTS = 10_000`,
    `simulateFreeMotion(initial: BallStates, world: World, maxEvents?: number): ShotResult`. Throws `RangeError` for
    a ball not resting on the lawn plane (`|z − R| > 1e-9` or `|vz| > 1e-9`), or overlapping another ball or an
    obstacle by more than `CONTACT_TOLERANCE`.
  - `sample.ts`: `stateAtTime(result: ShotResult, ball: BallId, t: number): BallState` (clamped to `[0, duration]`).

- [ ] **Step 1: Append result types to `src/engine/types.ts`**

```ts
/** Initial states of the balls in play; absent balls are omitted. */
export type BallStates = Partial<Record<BallId, BallState>>;

/** One closed-form piece of a ball's motion, valid for t ∈ [t0, t1]. */
export interface Segment {
    readonly t0: number;
    readonly t1: number;
    readonly phase: MotionPhase;
    readonly start: BallState;
    readonly params: MotionParams;
}

/** Something that happened during a shot. Times are seconds from the start of free motion. */
export type ShotEvent =
    | { readonly kind: "phase"; readonly t: number; readonly ball: BallId; readonly phase: MotionPhase }
    | { readonly kind: "ball-ball"; readonly t: number; readonly balls: readonly [BallId, BallId] }
    | { readonly kind: "ball-obstacle"; readonly t: number; readonly ball: BallId; readonly obstacleId: string }
    | { readonly kind: "halted"; readonly t: number; readonly ball: BallId }
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

`tests/engine/simulate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { horizontal, length, sub, vec3, type Vec3 } from "../../src/engine/math/vec3";
import { stateAtTime } from "../../src/engine/sample";
import { simulateFreeMotion } from "../../src/engine/simulate";
import { BALL_IDS, type BallId, type BallState, type BallStates, type ShotResult, type World } from "../../src/engine/types";
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
            { blue: rollingBallAt(5, 5, 2, 0), red: ballAt(6, 5), black: ballAt(6 + 2 * R, 5), yellow: ballAt(6 + 4 * R, 5) },
            world,
        );
        expect(result.aborted).toBe(false);
        expect(worstPenetration(result, world)).toBeLessThan(1e-6);
        expect((result.rest.yellow?.x ?? 0) > 6 + 4 * R).toBe(true);
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

describe("halt margin", () => {
    it("stops a ball one halt margin beyond the boundary", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(1, 5, -4, 0) }, testWorld());
        expect(result.events.some((e) => e.kind === "halted" && e.ball === "blue")).toBe(true);
        expect(result.rest.blue?.x).toBeCloseTo(-1, 6);
    });
});

describe("invariants", () => {
    const complex: BallStates = {
        blue: ballAt(10, 10, vec3(3, 1.2, 0), vec3(20, -15, 8)),
        red: ballAt(12, 11),
        black: ballAt(13, 10.4),
        yellow: ballAt(14.5, 19.5),
    };
    const hoopWorld = testWorld({ hoops: [testHoop("5", 15, 25), testHoop("6", 15, 15)] });

    it("is bit-identical across repeated runs", () => {
        expect(simulateFreeMotion(complex, hoopWorld)).toStrictEqual(simulateFreeMotion(complex, hoopWorld));
    });

    it("exercises ball-ball and obstacle contacts", () => {
        // Guards the scenario itself: if this fails, move the balls until both kinds of contact occur.
        const result = simulateFreeMotion(complex, hoopWorld);
        expect(result.events.some((e) => e.kind === "ball-ball")).toBe(true);
        expect(result.events.some((e) => e.kind === "ball-obstacle")).toBe(true);
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
        expect(() => simulateFreeMotion({ blue: ballAt(5, 5), red: ballAt(5 + R, 5) }, testWorld())).toThrow(RangeError);
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
 * Evaluates a ShotResult at an arbitrary time, for rendering and tests.
 */
import { advance } from "./motion";
import type { BallId, BallState, ShotResult } from "./types";

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
    const local = Math.min(Math.max(t - segment.t0, 0), segment.t1 - segment.t0);
    return advance(segment.start, segment.phase, segment.params, local);
}
```

- [ ] **Step 5: Implement `src/engine/simulate.ts`**

```ts
/**
 * Event-driven free-motion simulation (spec §5, phase 2).
 *
 * Each ball carries an open segment: a start state, phase and start time, from which its state at any later
 * time within the phase is exact. The loop finds the earliest event across all balls, resolves it, and reopens
 * the segments of the balls it affected. Candidates are gathered in a fixed order and ties go to the first found,
 * so results are deterministic.
 */
import { CONTACT_TOLERANCE, approachTime, boundaryCrossingTime } from "./detect";
import { ZERO, horizontal, length, sub, vec3, type Vec3 } from "./math/vec3";
import { advance, atRest, classify, endOfPhase, phaseDuration, trajectory, type Trajectory } from "./motion";
import { observe } from "./observe";
import { resolveBallBall, resolveBallCylinder } from "./resolve";
import {
    BALL_IDS,
    type BallId,
    type BallState,
    type BallStates,
    type Cylinder,
    type MotionParams,
    type MotionPhase,
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
    duration: number;
    params: MotionParams;
    readonly segments: Segment[];
}

type Candidate =
    | { readonly time: number; readonly kind: "transition"; readonly track: Track }
    | { readonly time: number; readonly kind: "ball-ball"; readonly a: Track; readonly b: Track }
    | { readonly time: number; readonly kind: "obstacle"; readonly track: Track; readonly obstacle: Cylinder }
    | { readonly time: number; readonly kind: "halt"; readonly track: Track };

function stateAt(track: Track, t: number): BallState {
    return advance(track.start, track.phase, track.params, Math.min(t - track.t0, track.duration));
}

function remaining(track: Track, now: number): number {
    return Math.max(0, track.t0 + track.duration - now);
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
 * Closes the track's current segment at `now` and opens a new one from `state`. Records a phase event when the
 * phase changes (or on the first segment).
 */
function reopen(track: Track | null, id: BallId, state: BallState, now: number, world: World, events: ShotEvent[]): Track {
    const phase = classify(state, world.ball.radius);
    const start = phase === "stationary" ? atRest(state.position) : state;
    const params = motionParamsAt(world, start.position);
    if (track && now > track.t0) {
        track.segments.push({ t0: track.t0, t1: now, phase: track.phase, start: track.start, params: track.params });
    }
    if (!track || track.phase !== phase) {
        events.push({ kind: "phase", t: now, ball: id, phase });
    }
    const next: Track = track ?? { id, start, phase, t0: now, duration: 0, params, segments: [] };
    next.start = start;
    next.phase = phase;
    next.t0 = now;
    next.params = params;
    next.duration = phaseDuration(start, phase, params);
    return next;
}

/** Returns the earlier candidate; on a tie the one found first wins, which keeps the order deterministic. */
function earlier(best: Candidate | null, candidate: Candidate): Candidate {
    return best === null || candidate.time < best.time ? candidate : best;
}

function findNextEvent(tracks: readonly Track[], obstacles: readonly Cylinder[], world: World, now: number): Candidate {
    let best: Candidate | null = null;
    const paths = new Map<Track, Trajectory>();
    for (const track of tracks) {
        paths.set(track, trajectory(stateAt(track, now), track.phase, track.params));
    }
    const moving = tracks.filter((t) => t.phase !== "stationary");

    for (const track of moving) {
        best = earlier(best, { time: track.t0 + track.duration, kind: "transition", track });
    }
    for (let i = 0; i < tracks.length; i++) {
        const a = tracks[i] as Track;
        for (let j = i + 1; j < tracks.length; j++) {
            const b = tracks[j] as Track;
            if (a.phase === "stationary" && b.phase === "stationary") {
                continue;
            }
            const horizon = Math.min(remaining(a, now), remaining(b, now));
            const pa = paths.get(a) as Trajectory;
            const pb = paths.get(b) as Trajectory;
            const dt = approachTime(sub(pa.c0, pb.c0), sub(pa.c1, pb.c1), sub(pa.c2, pb.c2), 2 * world.ball.radius, horizon);
            if (dt !== null) {
                best = earlier(best, { time: now + dt, kind: "ball-ball", a, b });
            }
        }
    }
    for (const track of moving) {
        const p = paths.get(track) as Trajectory;
        const horizon = remaining(track, now);
        for (const obstacle of obstacles) {
            const dt = approachTime(sub(p.c0, obstacle.centre), p.c1, p.c2, world.ball.radius + obstacle.radius, horizon);
            if (dt !== null) {
                best = earlier(best, { time: now + dt, kind: "obstacle", track, obstacle });
            }
        }
        const dt = boundaryCrossingTime(p, world.lawn, world.haltMargin, horizon);
        if (dt !== null) {
            best = earlier(best, { time: now + dt, kind: "halt", track });
        }
    }
    if (best === null) {
        throw new Error("no next event although a ball is moving");
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
    const obstacles = obstaclesOf(world);
    const events: ShotEvent[] = [];
    const tracks: Track[] = [];
    for (const id of BALL_IDS) {
        const s = initial[id];
        if (s) {
            tracks.push(reopen(null, id, onLawn(id, s, world.ball.radius), 0, world, events));
        }
    }
    assertNoOverlap(tracks, obstacles, world.ball.radius);

    let now = 0;
    let count = 0;
    let aborted = false;
    while (tracks.some((t) => t.phase !== "stationary")) {
        if (count >= maxEvents) {
            aborted = true;
            break;
        }
        count++;
        const next = findNextEvent(tracks, obstacles, world, now);
        now = next.time;
        switch (next.kind) {
            case "transition": {
                const { track } = next;
                reopen(track, track.id, endOfPhase(track.start, track.phase, track.params), now, world, events);
                break;
            }
            case "ball-ball": {
                const [sa, sb] = resolveBallBall(stateAt(next.a, now), stateAt(next.b, now), world.ball, world.ballBall);
                reopen(next.a, next.a.id, sa, now, world, events);
                reopen(next.b, next.b.id, sb, now, world, events);
                events.push({ kind: "ball-ball", t: now, balls: [next.a.id, next.b.id] });
                break;
            }
            case "obstacle": {
                const { track, obstacle } = next;
                const s = resolveBallCylinder(stateAt(track, now), obstacle.centre, world.ball, obstacle.material);
                reopen(track, track.id, s, now, world, events);
                events.push({ kind: "ball-obstacle", t: now, ball: track.id, obstacleId: obstacle.id });
                break;
            }
            case "halt": {
                const { track } = next;
                reopen(track, track.id, { ...stateAt(track, now), velocity: ZERO, angularVelocity: ZERO }, now, world, events);
                events.push({ kind: "halted", t: now, ball: track.id });
                break;
            }
        }
    }

    const segments: Partial<Record<BallId, readonly Segment[]>> = {};
    const rest: Partial<Record<BallId, Vec3>> = {};
    for (const track of tracks) {
        track.segments.push({ t0: track.t0, t1: now, phase: track.phase, start: track.start, params: track.params });
        segments[track.id] = track.segments;
        rest[track.id] = stateAt(track, now).position;
    }
    const allEvents = [...events, ...observe(segments, world)].sort((a, b) => a.t - b.t);
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
Expected: PASS.

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

**Files:**
- Modify: `src/engine/observe.ts` (replace the stub)
- Create: `src/engine/hoopRun.ts`
- Test: `tests/engine/observe.test.ts`, `tests/engine/hoopRun.test.ts`

**Interfaces:**
- Consumes: `boundaryCrossingTime`, `outwardDistance` (Task 6); `hoopHalfSpan`, `hoopLateral`, `ruleThreshold`
  (Task 8); `trajectory`, `advance` (Task 5); `realRootsInInterval` (Task 2); `ShotResult` (Task 9).
- Produces:
  - `observe(segments, world): ShotEvent[]` — per ball, at most one `out-of-court` event (the first time its centre's
    outward distance reaches `ruleThreshold(world.outOfCourt, R, 0)`), and one `hoop-passage` event for each
    crossing of a hoop's plane between its uprights (`direction` = sign of motion along `hoop.normal`).
  - `hoopRun.ts`: `interface HoopTarget { readonly hoopId: string; readonly direction: 1 | -1 }`,
    `type HoopRunVerdict = "ran" | "not-eligible" | "no-passage" | "incomplete"`,
    `judgeHoopRun(result: ShotResult, ball: BallId, target: HoopTarget, world: World): HoopRunVerdict`.

- [ ] **Step 1: Write the failing observation tests**

`tests/engine/observe.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { vec3 } from "../../src/engine/math/vec3";
import { simulateFreeMotion } from "../../src/engine/simulate";
import { STANDARD_GRAVITY } from "../../src/engine/world";
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
            expect(result.events.filter((e) => e.kind === "hoop-passage"), `speed ${v}`).toHaveLength(1);
        }
    });

    it("does not count an upright rebound as a passage", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(15 + 0.0953 / 2 + 0.008, 9, 0, 1.5) }, world);
        expect(result.events.some((e) => e.kind === "ball-obstacle" && e.obstacleId.startsWith("1/"))).toBe(true);
        expect(result.events.some((e) => e.kind === "hoop-passage")).toBe(false);
    });
});
```

`tests/engine/hoopRun.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { judgeHoopRun } from "../../src/engine/hoopRun";
import { simulateFreeMotion } from "../../src/engine/simulate";
import { STANDARD_GRAVITY } from "../../src/engine/world";
import { rollingBallAt, testHoop, testWorld } from "./support/fixtures";

const ROLL = 0.05 * STANDARD_GRAVITY;
const world = testWorld({ hoops: [testHoop("1", 15, 20.5)] });
const NORTH = { hoopId: "1", direction: 1 } as const;

describe("judgeHoopRun", () => {
    it("reports a clean run", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(15, 19.5, 0, 1.5) }, world);
        expect(judgeHoopRun(result, "blue", NORTH, world)).toBe("ran");
    });

    it("reports a ball starting on the wrong side as not eligible", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(15, 21.5, 0, -1.5) }, world);
        expect(judgeHoopRun(result, "blue", NORTH, world)).toBe("not-eligible");
    });

    it("judges the run relative to the target direction", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(15, 21.5, 0, -1.5) }, world);
        expect(judgeHoopRun(result, "blue", { hoopId: "1", direction: -1 }, world)).toBe("ran");
    });

    it("reports an upright rebound as no passage", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(15 + 0.0953 / 2 + 0.008, 19.5, 0, 1.5) }, world);
        expect(judgeHoopRun(result, "blue", NORTH, world)).toBe("no-passage");
    });

    it("reports a ball going round the hoop as no passage", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(15.5, 19.5, 0, 1.5) }, world);
        expect(judgeHoopRun(result, "blue", NORTH, world)).toBe("no-passage");
    });

    it("reports a ball stopping part-way through as incomplete", () => {
        // Starts 0.1 m short of the plane and stops 0.02 m past it (threshold is R + r = 0.054 m).
        const result = simulateFreeMotion({ blue: rollingBallAt(15, 20.4, 0, Math.sqrt(2 * ROLL * 0.12)) }, world);
        expect(judgeHoopRun(result, "blue", NORTH, world)).toBe("incomplete");
    });

    it("rejects an unknown hoop or ball", () => {
        const result = simulateFreeMotion({ blue: rollingBallAt(15, 19.5, 0, 1.5) }, world);
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
import { trajectory, type Trajectory } from "./motion";
import { BALL_IDS, type BallId, type Hoop, type Segment, type ShotEvent, type World } from "./types";
import { hoopHalfSpan, hoopLateral, ruleThreshold } from "./world";

function positionAt(p: Trajectory, t: number): Vec3 {
    return add(add(p.c0, scale(p.c1, t)), scale(p.c2, t * t));
}

function outOfCourt(id: BallId, segments: readonly Segment[], world: World): ShotEvent[] {
    const threshold = ruleThreshold(world.outOfCourt, world.ball.radius, 0);
    for (const segment of segments) {
        const path = trajectory(segment.start, segment.phase, segment.params);
        const dt = boundaryCrossingTime(path, world.lawn, threshold, segment.t1 - segment.t0);
        if (dt !== null) {
            return [{ kind: "out-of-court", t: segment.t0 + dt, ball: id, position: positionAt(path, dt) }];
        }
    }
    return [];
}

/**
 * Crossings of the hoop plane within one segment. The interval is half-open, [0, duration), so a crossing exactly
 * at a segment boundary is counted once, by the later segment.
 */
function passages(id: BallId, segment: Segment, hoop: Hoop): ShotEvent[] {
    if (segment.phase === "stationary") {
        return [];
    }
    const path = trajectory(segment.start, segment.phase, segment.params);
    const n = hoop.normal;
    const coeffs = [dot(horizontal(sub(path.c0, hoop.centre)), n), dot(path.c1, n), dot(path.c2, n)];
    const duration = segment.t1 - segment.t0;
    const events: ShotEvent[] = [];
    for (const t of realRootsInInterval(coeffs, 0, duration)) {
        const slope = (coeffs[1] ?? 0) + 2 * (coeffs[2] ?? 0) * t;
        if (t >= duration || slope === 0) {
            continue;
        }
        const lateral = dot(horizontal(sub(positionAt(path, t), hoop.centre)), hoopLateral(hoop));
        if (Math.abs(lateral) < hoopHalfSpan(hoop)) {
            events.push({ kind: "hoop-passage", t: segment.t0 + t, ball: id, hoopId: hoop.id, direction: slope > 0 ? 1 : -1 });
        }
    }
    return events;
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
        for (const segment of segments) {
            for (const hoop of world.hoops) {
                events.push(...passages(id, segment, hoop));
            }
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
        signed(start) >= 0 && Math.abs(dot(horizontal(sub(start, hoop.centre)), hoopLateral(hoop))) < hoopHalfSpan(hoop);
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
Expected: PASS (all engine tests, including Task 9's, now with observation events merged in).

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

Spec §9.1: "Event solver cross-checked against brute-force small-step integration of the same shot." The
integrator below re-derives the motion from **forces** (not from `motion.ts`'s closed forms) and finds collisions
by overlap on a fixed time grid; it shares only the impulse functions. Agreement therefore checks both the closed
forms and the event scheduling.

**Files:**
- Create: `tests/engine/support/bruteForce.ts`, `src/engine/index.ts`
- Test: `tests/engine/crossCheck.test.ts`, `tests/engine/index.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `src/engine/index.ts` re-exporting the public engine API: types (`BallId`, `BALL_IDS`, `BallState`,
  `BallStates`, `MotionPhase`, `Segment`, `ShotEvent`, `ShotResult`, `World`, `Hoop`, `Cylinder`, `Lawn`,
  `SurfaceProps`, `ContactMaterial`, `OffsetRule`, `BallParams`, `MotionParams`), `Vec3` and `vec3`,
  `simulateFreeMotion`, `ENGINE_VERSION`, `stateAtTime`, `judgeHoopRun`, `HoopTarget`, `HoopRunVerdict`,
  `defaultWorld`, `STANDARD_GRAVITY`. Test helper `bruteForce(initial, world, dt, maxTime): Partial<Record<BallId, Vec3>>`.

- [ ] **Step 1: Write the brute-force integrator**

`tests/engine/support/bruteForce.ts`:

```ts
/**
 * Reference integrator for cross-checking the event-driven solver. Integrates the turf forces with
 * semi-implicit Euler at a fixed step and detects contacts by overlap. Test-only and deliberately slow.
 */
import { ZERO, add, dot, horizontal, length, normalize, scale, sub, vec3, type Vec3 } from "../../../src/engine/math/vec3";
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
    if (length(slip) > STOP_SPEED) {
        // Sliding: friction opposes slip; its torque spins the ball up towards rolling.
        const u = normalize(slip);
        const a = p.slidingDecel;
        velocity = sub(s.velocity, scale(u, a * dt));
        const k = (5 * a * dt) / (2 * R);
        angularVelocity = vec3(s.angularVelocity.x - k * u.y, s.angularVelocity.y + k * u.x, s.angularVelocity.z);
        const next = { position: s.position, velocity, angularVelocity };
        if (dot(contactSlip(next, R), slip) <= 0) {
            angularVelocity = rollingSpin(velocity, s.angularVelocity.z, R);
        }
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
export function bruteForce(initial: BallStates, world: World, dt: number, maxTime: number): Partial<Record<BallId, Vec3>> {
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

`tests/engine/crossCheck.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { length, sub, vec3 } from "../../src/engine/math/vec3";
import { simulateFreeMotion } from "../../src/engine/simulate";
import type { BallId, BallStates } from "../../src/engine/types";
import { bruteForce } from "./support/bruteForce";
import { ballAt, rollingBallAt, testWorld } from "./support/fixtures";

const DT = 2e-6;
const TOLERANCE = 1e-3;

const SCENARIOS: Record<string, BallStates> = {
    "single ball with sidespin (curving slide)": { blue: ballAt(5, 5, vec3(2.5, 0.4, 0), vec3(25, 0, 3)) },
    "cut rush with spin": { blue: ballAt(5, 5, vec3(2.5, 0, 0), vec3(0, 10, 5)), red: ballAt(6, 5.06) },
    "peg glance then cannon": {
        blue: rollingBallAt(13, 19.97, 2.2, 0),
        red: ballAt(17, 20.3),
        black: ballAt(17.5, 19.2),
    },
};

describe("event solver versus brute-force integration", () => {
    for (const [name, initial] of Object.entries(SCENARIOS)) {
        it(`agrees within 1 mm: ${name}`, { timeout: 120_000 }, () => {
            const world = testWorld();
            const exact = simulateFreeMotion(initial, world);
            const reference = bruteForce(initial, world, DT, exact.duration + 1);
            for (const id of Object.keys(initial) as BallId[]) {
                const a = exact.rest[id];
                const b = reference[id];
                expect(a && b ? length(sub(a, b)) : Infinity, `ball ${id}`).toBeLessThan(TOLERANCE);
            }
        });
    }
});
```

Check the "peg glance then cannon" scenario really produces a peg contact and a ball–ball contact (inspect
`exact.events` once); if it does not, adjust the start positions until it does, and keep the expectations
unchanged.

- [ ] **Step 3: Run the cross-check**

Run: `npx vitest run tests/engine/crossCheck.test.ts`
Expected: PASS. A failure here is a real defect in either the closed forms or event scheduling — use
superpowers:systematic-debugging rather than loosening the tolerance.

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
            { blue: { position: engine.vec3(5, 5, r), velocity: engine.vec3(2, 0, 0), angularVelocity: engine.vec3(0, 0, 0) } },
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

Expected: every command exits 0.

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
- [ ] `grep -rn "Math\.\(sin\|cos\|exp\|pow\|log\|atan\)" src/engine` returns nothing.
- [ ] Roadmap updated if any provisional number or interface changed during P1.
- [ ] Ask the user whether to create the GitHub remote (public or private) so CI can run.
