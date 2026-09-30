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
        // Compute as (0 - (c[0] ?? 0)) / (c[1] ?? 1) to avoid -0 when c[0] is 0.
        const root = (0 - (c[0] ?? 0)) / (c[1] ?? 1);
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
