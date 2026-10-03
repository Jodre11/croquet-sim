/**
 * Linear algebra and sparse affine forms for the resting-contact solver (P2a.2 design §3).
 *
 * A candidate's system has at most about 50 unknowns (four balls, nine contacts) and is mostly zero, and it is often
 * singular but consistent (a ball stuck to a held ball; a ball jammed between three or more bodies). Elimination skips
 * the zero entries of each pivot row, a factorisation is kept for further right-hand sides, and the rank-revealing
 * solve returns the minimum-norm solution together with a basis of the null space.
 *
 * Every routine adds its cost to a Work counter, in work units: n³ for a factorisation (a dense solve is one), n² for
 * a solve with a kept factorisation, and 2·n³ more for the rank-revealing path, plus k³ + k² for its Gram solve over
 * a k-dimensional null space. The solver's budget per shot is counted in these units rather than in time, so that its
 * results are identical on every device.
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
