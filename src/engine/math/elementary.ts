/**
 * Elementary functions (ln, exp, pow, sinCos and atan2) from IEEE-exact operations only (+ − × ÷ and Math.sqrt), so
 * that every JavaScript engine computes the same bits. Math.sin, Math.log and the like are not guaranteed
 * bit-identical across engines, which would make results engine-dependent (spec §5, Determinism). Accurate to a few
 * ulps (tests compare with Math.*).
 */

/** ln 2 split so that k·LN2_HI is exact for |k| < 2^11 (Cody and Waite); LN2_LO is the remainder. */
const LN2_HI = 6.9314718036912381649e-1;
const LN2_LO = 1.9082149292705877e-10;

/** 2^64 and 2^-64: scaling by them is exact, which brings any positive double near 1 in a few steps. */
const TWO_64 = 18446744073709551616;
const TWO_MINUS_64 = 1 / TWO_64;

/** π/2 split so that k·PIO2_HI is exact for |k| < 2^20 (its 33 leading bits); PIO2_LO is the remainder. */
const PIO2_HI = 1.5707963267341256142;
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

/** 1/ln 2, the reduction's multiplier. Its rounding can only move k at a tie, which the remainder r absorbs. */
const INV_LN2 = 1.4426950408889634;

/** Above EXP_MAX e^x overflows; below EXP_MIN it underflows to 0 (Math.exp's limits, rounded outward). */
const EXP_MAX = 709.79;
const EXP_MIN = -745.14;

/**
 * e^x. x = k·ln 2 + r with |r| ≤ ½·ln 2 (Cody and Waite, as ln), e^r by its Taylor series to r¹⁷ (the next term is
 * below 1e-21 of the sum), then scaled by 2^k in exact steps. NaN for NaN, +Infinity above EXP_MAX, 0 below EXP_MIN.
 */
export function exp(x: number): number {
    if (Number.isNaN(x)) {
        return NaN;
    }
    if (x > EXP_MAX) {
        return Infinity;
    }
    if (x < EXP_MIN) {
        return 0;
    }
    let k = Math.round(x * INV_LN2);
    const r = x - k * LN2_HI - k * LN2_LO;
    // e^r = 1 + r·(1 + r/2·(1 + r/3·(…))), by Horner from the innermost term.
    let y = 1;
    for (let n = 17; n >= 1; n--) {
        y = 1 + (r / n) * y;
    }
    while (k >= 64) {
        y *= TWO_64;
        k -= 64;
    }
    while (k <= -64) {
        y *= TWO_MINUS_64;
        k += 64;
    }
    while (k > 0) {
        y *= 2;
        k -= 1;
    }
    while (k < 0) {
        y *= 0.5;
        k += 1;
    }
    return y;
}

/**
 * x^y for x > 0, as exp(y·ln x): accurate to a few ulps times |y·ln x|. 0 for x = 0 and y > 0; NaN for any other base
 * not positive.
 */
export function pow(x: number, y: number): number {
    if (x > 0) {
        return exp(y * ln(x));
    }
    return x === 0 && y > 0 ? 0 : NaN;
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
