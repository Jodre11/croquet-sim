/**
 * The scorecard's targets' shape and scoring (reality scorecard design §3.1, §3.2): each measured value's z, its band
 * class, the families' Σz² and the joint objective. Pure: no engine import.
 */

/** A target's use (design §3.1): in the joint objective, scored to test the fit, or reported only. */
export type Use = "fit" | "held-out" | "check";

/** The target families (design §3.1). */
export type Family =
    "strike" | "gugan5" | "table5" | "table6" | "turf" | "lawn" | "ca" | "user" | "playability" | "look" | "coaching";

/**
 * One external target. `value` ± `sigma` for a number; `band` [lo, hi] for a range, scored 0 inside and by the
 * distance outside over `sigma`; `clean` for a pass/fail check, a fail scored PLAYABILITY_Z.
 */
export interface Target {
    readonly id: string;
    /** The job (scripts/scorecard/jobs.ts) that measures it; one job measures several targets in one play. */
    readonly job: string;
    readonly family: Family;
    readonly use: Use;
    readonly kind: "number" | "band" | "clean";
    readonly value?: number;
    readonly band?: readonly [number, number];
    readonly sigma?: number;
    /** The citation: source, table, row or section; never the source's text beyond a figure. */
    readonly source: string;
    readonly note?: string;
}

/** A measured value: a number, a pass/fail, or null when the model could not measure it (not played, open). */
export type Measured = number | boolean | null;

/** The z of a failed playability check: its z² is the design's fixed penalty of 25, five σ (§3.2). */
export const PLAYABILITY_Z = 5;

/** The z of an unmeasurable target: scored as a playability failure, since the model could not play it. */
export const UNMEASURED_Z = PLAYABILITY_Z;

/** Band classes (design §3.2). */
export type Band = "pass" | "near" | "miss";

/** A scored target. */
export interface Scored {
    readonly target: Target;
    readonly measured: Measured;
    readonly z: number;
    readonly band: Band;
}

/** `target`'s z for `measured`. */
export function zOf(target: Target, measured: Measured): number {
    if (measured === null || (typeof measured === "number" && !Number.isFinite(measured))) {
        return UNMEASURED_Z;
    }
    if (target.kind === "clean") {
        return measured === true ? 0 : PLAYABILITY_Z;
    }
    const x = Number(measured);
    const sigma = target.sigma as number;
    if (target.kind === "band") {
        const [lo, hi] = target.band as readonly [number, number];
        if (x < lo) return (x - lo) / sigma;
        if (x > hi) return (x - hi) / sigma;
        return 0;
    }
    return (x - (target.value as number)) / sigma;
}

/** The band class of `z` (design §3.2). */
export function bandOf(z: number): Band {
    const a = Math.abs(z);
    return a <= 1 ? "pass" : a <= 2 ? "near" : "miss";
}

/** Scores every target against `measured` (target id → value; a missing id is unmeasured). */
export function scoreAll(targets: readonly Target[], measured: Readonly<Record<string, Measured>>): Scored[] {
    return targets.map((target) => {
        const m = measured[target.id] ?? null;
        const z = zOf(target, m);
        return { target, measured: m, z, band: bandOf(z) };
    });
}

/** Each family's Σz² over the scored targets of `use`, and its count. */
export function familySums(scored: readonly Scored[], use: Use): Record<string, { sum: number; count: number }> {
    const out: Record<string, { sum: number; count: number }> = {};
    for (const s of scored) {
        if (s.target.use !== use) continue;
        const f = (out[s.target.family] ??= { sum: 0, count: 0 });
        f.sum += s.z * s.z;
        f.count += 1;
    }
    return out;
}

/** The joint objective (design §3.2): Σz² over the fit targets, each family weighted by 1/(its count). */
export function objectiveOf(scored: readonly Scored[]): number {
    return Object.values(familySums(scored, "fit")).reduce((sum, f) => sum + f.sum / f.count, 0);
}

/** The worsening of band class from `before` to `after` (design §7): pass → near, near → miss, pass → miss. */
export function worsened(before: Band, after: Band): boolean {
    const rank: Record<Band, number> = { pass: 0, near: 1, miss: 2 };
    return rank[after] > rank[before];
}
