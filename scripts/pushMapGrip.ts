/**
 * The push map's grip and timing sweeps (P2b.2b.2c.3b design A9 items 5 and 10; plan
 * `docs/superpowers/plans/2026-10-29-p2b2b2c3b-push-map.md`, Amendment C, C-d4 and C-d5). The starting plans (each
 * pick's least and viable at both holds and every lawn, and the text books at each power) and a fixed-seed draw of
 * held-out admissible plans (gripPlans) are each played at GRIPS on the 10 s lawn (gripPlays); each plan's least,
 * firmest and reliable grips are read from its plays (gripBounds); a timed starting plan is played again early at its
 * reliable grip (timingPlays); and per type each grip is fitted on the starting plans' inputs and checked on the held-out
 * plans (fitGrip, predictGrip, heldOutError). Not part of the engine.
 */
import { unkey, type Band, type BandPick, type Reads } from "./pushMapGrid";
import { playSample, textBook, type MapClass, type MapPlan, type MapSample, type MapType } from "./pushMapRun";

/** Numerical, not physical: the grip sweep's step in hold firmness (plan C-d4). */
export const GRIP_STEP = 0.0625;

/**
 * The grips played (hold firmness, 0–1; plan C-d4), 17. Firmness, not σ: σ is capped at σ_max = min(1, v/HOLD_SPEED),
 * which firmness 1 reaches, so a σ above it is no grip at all. Each play records its σ beside it.
 */
export const GRIPS: readonly number[] = Array.from({ length: 17 }, (_, i) => i * GRIP_STEP);

/** The lawn the grips are played on (s; plan C-d4): the normal lawn. */
export const GRIP_LAWN = 10;

/** Numerical, not physical: the held-out plans drawn (plan C-d4) and the draw's fixed seed. */
export const HELD_OUT = 2000;
export const HELD_OUT_SEED = 20261108;

/** The hands' onsets played against on time (s; plan C-d5): 5 ms and 10 ms early. */
export const EARLY_ONSETS: readonly number[] = [-0.005, -0.01];

/** A fit is accepted where its held-out median absolute error is at most one grip step (plan C-d4). */
export const FIT_LIMIT = GRIP_STEP;

/** One plan of the grip sweep: a type's plan at a power, a starting plan or a held-out one. */
export interface GripPlan {
    readonly type: MapType;
    readonly plan: MapPlan;
    readonly power: number;
    readonly set: "start" | "held";
}

/** One play of a grip plan on GRIP_LAWN: at a grip, or at an onset. */
export interface GripPlay {
    readonly grip: number;
    readonly sigma: number | null;
    readonly klass: MapClass | null;
    readonly reason: string | null;
    readonly followSlip: boolean;
    readonly range: number;
    readonly ratio: number;
}

/** A timed starting plan played early at its reliable grip (plan C-d5), its onset relative to the plan's. */
export interface TimingPlay extends GripPlay {
    readonly early: number;
}

/** A grip plan's three grips (hold firmness), each null where no grip plays. */
export interface GripBounds {
    /** The least that plays without a slip, else the least that plays (the found hold's rule). */
    readonly least: number | null;
    /** The firmest that plays. */
    readonly firmest: number | null;
    /** The one that plays whose neighbours change the range and ratio least (gripBounds). */
    readonly reliable: number | null;
}

/** Numerical, not physical: the tolerance within which two grips' sensitivities tie. */
const TIE = 1e-12;

/** A sample's play at `grip` on GRIP_LAWN. */
function playOf(grip: number, sample: MapSample): GripPlay {
    const read = sample.byLawn[GRIP_LAWN];
    return {
        grip,
        sigma: sample.sigma,
        klass: sample.klass,
        reason: sample.reason,
        followSlip: sample.followSlip,
        range: read?.range ?? NaN,
        ratio: read?.ratio ?? NaN,
    };
}

/** `job` played at each of GRIPS (plan C-d4). An engine error propagates. */
export function gripPlays(job: GripPlan): GripPlay[] {
    return GRIPS.map((grip) => playOf(grip, playSample(job.type, job.plan, job.power, [GRIP_LAWN], grip)));
}

/**
 * `job` played at `grip` with its follow-through's pulses each of EARLY_ONSETS early (plan C-d5; mapSetup's `early`:
 * the hands' and the pendulum's together, since the stop's brake is the pendulum's alone), where it has a timed change
 * (drive ≠ 0) and is a starting plan; none otherwise.
 */
export function timingPlays(job: GripPlan, grip: number | null): TimingPlay[] {
    if (grip === null || job.set !== "start" || job.plan.drive === 0) {
        return [];
    }
    return EARLY_ONSETS.map((early) => ({
        ...playOf(grip, playSample(job.type, job.plan, job.power, [GRIP_LAWN], grip, early)),
        early,
    }));
}

/** |Δx| / x, or 0 where either is not finite or x is 0 (the single ball's ratio). */
function relative(from: number, to: number): number {
    return Number.isFinite(from) && Number.isFinite(to) && from !== 0 ? Math.abs(to - from) / Math.abs(from) : 0;
}

/**
 * `plays`' three grips (plan C-d4; `plays` in grip order on one grid). A play plays where it has no class. The
 * reliable grip is the playing grip whose playing neighbours on the grid change it least, the mean over them of
 * |Δrange| / range + |Δratio| / ratio; a playing grip with no playing neighbour is reliable only where it is the one
 * that plays. Ties go to the tied grip nearest the middle of the tied grips' span, the lower where two are.
 */
export function gripBounds(plays: readonly GripPlay[]): GripBounds {
    const playing = plays.map((p) => p.klass === null);
    const at = plays.filter((_, i) => playing[i]);
    if (at.length === 0) {
        return { least: null, firmest: null, reliable: null };
    }
    const least = (at.find((p) => !p.followSlip) ?? (at[0] as GripPlay)).grip;
    const firmest = (at[at.length - 1] as GripPlay).grip;
    const scored: { readonly grip: number; readonly sensitivity: number }[] = [];
    for (let i = 0; i < plays.length; i++) {
        if (!playing[i]) {
            continue;
        }
        const here = plays[i] as GripPlay;
        const changes: number[] = [];
        for (const j of [i - 1, i + 1]) {
            if (j >= 0 && j < plays.length && playing[j]) {
                const there = plays[j] as GripPlay;
                changes.push(relative(here.range, there.range) + relative(here.ratio, there.ratio));
            }
        }
        const sensitivity =
            changes.length > 0 ? changes.reduce((a, b) => a + b, 0) / changes.length : at.length === 1 ? 0 : Infinity;
        scored.push({ grip: here.grip, sensitivity });
    }
    const leastChange = Math.min(...scored.map((s) => s.sensitivity));
    if (!Number.isFinite(leastChange)) {
        return { least, firmest, reliable: null };
    }
    const tied = scored.filter((s) => s.sensitivity <= leastChange + TIE).map((s) => s.grip);
    const middle = ((tied[0] as number) + (tied[tied.length - 1] as number)) / 2;
    const reliable = tied.reduce((a, b) => (Math.abs(b - middle) < Math.abs(a - middle) - TIE ? b : a));
    return { least, firmest, reliable };
}

/** A grip plan's line in a shard: its plays, grips and timing plays, or the engine's error. */
export type GripEntry =
    | {
          readonly index: number;
          readonly plays: readonly GripPlay[];
          readonly bounds: GripBounds;
          readonly timing: readonly TimingPlay[];
      }
    | { readonly index: number; readonly engineError: string };

/** `job` played (gripPlays, gripBounds, timingPlays at the reliable grip) as its shard line's entry. */
export function playGripPlan(index: number, job: GripPlan): GripEntry {
    try {
        const plays = gripPlays(job);
        const bounds = gripBounds(plays);
        return { index, plays, bounds, timing: timingPlays(job, bounds.reliable) };
    } catch (error) {
        return { index, engineError: error instanceof Error ? error.message : String(error) };
    }
}

/** An entry as one JSON line, NaN and ±Infinity kept as strings. */
export function gripLine(entry: GripEntry): string {
    return JSON.stringify(entry, (_k, v: unknown) => (typeof v === "number" && !Number.isFinite(v) ? String(v) : v));
}

/**
 * The entries of shard `lines` by index, the first of a repeated index kept; a line that does not parse (a shard killed
 * mid-write) is counted as torn.
 */
export function parseGripLines(lines: readonly string[]): {
    readonly entries: ReadonlyMap<number, GripEntry>;
    readonly torn: number;
    readonly duplicates: number;
} {
    const entries = new Map<number, GripEntry>();
    let torn = 0;
    let duplicates = 0;
    for (const line of lines) {
        if (line.trim() === "") {
            continue;
        }
        let entry: GripEntry;
        try {
            entry = JSON.parse(line, (_k, v: unknown) =>
                v === "NaN" || v === "Infinity" || v === "-Infinity" ? Number(v) : v,
            ) as GripEntry;
        } catch {
            torn++;
            continue;
        }
        if (typeof entry.index !== "number") {
            torn++;
        } else if (entries.has(entry.index)) {
            duplicates++;
        } else {
            entries.set(entry.index, entry);
        }
    }
    return { entries, torn, duplicates };
}

/** A seeded uniform draw in [0, 1) (mulberry32): the held-out plans' draw is the same for the same seed. */
function uniform(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** `count` of `items` drawn without replacement with `seed` (all of them, shuffled, where there are fewer). */
export function drawHeldOut<T>(items: readonly T[], count: number, seed: number): T[] {
    const next = uniform(seed);
    const pool = [...items];
    const n = Math.min(count, pool.length);
    for (let i = 0; i < n; i++) {
        const j = i + Math.floor(next() * (pool.length - i));
        [pool[i], pool[j]] = [pool[j] as T, pool[i] as T];
    }
    return pool.slice(0, n);
}

/** A grip plan's identity: its type, plan and power. */
function jobKey(type: MapType, plan: MapPlan, power: number): string {
    return JSON.stringify([type, plan, power]);
}

/**
 * The grip sweep's plans (plan C-d4): the starting plans, each of `picks`' least and viable at every hold and lawn at
 * its read's power and each type's text book at each of `powers`, deduplicated; then HELD_OUT of `admissible` (each
 * type's admissible reads: type, plan and power) not among them, drawn with HELD_OUT_SEED.
 */
export function gripPlans(
    picks: Readonly<Record<string, readonly BandPick[]>>,
    types: readonly MapType[],
    powers: readonly number[],
    admissible: readonly { readonly type: MapType; readonly plan: MapPlan; readonly power: number }[],
): GripPlan[] {
    const plans = new Map<string, GripPlan>();
    const add = (type: MapType, plan: MapPlan, power: number, set: GripPlan["set"]): void => {
        const key = jobKey(type, plan, power);
        if (!plans.has(key)) {
            plans.set(key, { type, plan, power, set });
        }
    };
    for (const byHold of Object.values(picks)) {
        for (const pick of byHold) {
            for (const picked of [pick.least, pick.viable]) {
                if (picked !== null) {
                    add(picked.type, picked.plan, picked.read.power, "start");
                }
            }
        }
    }
    for (const type of types) {
        for (const power of powers) {
            add(type, textBook(type), power, "start");
        }
    }
    const seen = new Set<string>();
    const others = admissible.filter((a) => {
        const key = jobKey(a.type, a.plan, a.power);
        if (plans.has(key) || seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
    for (const a of drawHeldOut(others, HELD_OUT, HELD_OUT_SEED)) {
        add(a.type, a.plan, a.power, "held");
    }
    return [...plans.values()];
}

/** `type`'s admissible reads (no class, banded viable or edgy) as grip plans' type, plan and power, deduplicated. */
export function admissibleOf(
    type: MapType,
    reads: Reads,
    banded: ReadonlyMap<string, Band>,
): { readonly type: MapType; readonly plan: MapPlan; readonly power: number }[] {
    const out = new Map<string, { readonly type: MapType; readonly plan: MapPlan; readonly power: number }>();
    for (const [key, read] of reads) {
        const band = banded.get(key);
        if (read.klass !== null || (band !== "viable" && band !== "edgy") || !Number.isFinite(read.power)) {
            continue;
        }
        const { plan } = unkey(key);
        out.set(jobKey(type, plan, read.power), { type, plan, power: read.power });
    }
    return [...out.values()];
}

/** The fit's inputs (plan C-d4), standardised: the plan's axes and the power. */
export const FIT_INPUTS = ["lean", "feet", "drive", "handReach", "window", "split", "speedGain", "power"] as const;
export type FitInput = (typeof FIT_INPUTS)[number];

/** A grip plan's fit inputs, in FIT_INPUTS' order. */
export function fitInputs(job: GripPlan): number[] {
    return FIT_INPUTS.map((name) => (name === "power" ? job.power : job.plan[name]));
}

/**
 * A least-squares fit of a grip on the standardised inputs and their squares (plan C-d4). An input constant over the
 * fit's rows is dropped, and so is any term the others already span (a two-valued input's square, say); a dropped
 * term's coefficient is 0.
 */
export interface GripFit {
    readonly means: readonly number[];
    readonly scales: readonly number[];
    /** The intercept, then per input its linear and its square term's coefficient. */
    readonly coefficients: readonly number[];
    readonly rows: number;
}

/** Numerical, not physical: the relative norm below which an input or a term counts as spanned already. */
const SPANNED = 1e-10;

/** The fit's terms of `x`: 1, then per input z and z², z standardised (0 for a dropped input). */
function terms(fit: Pick<GripFit, "means" | "scales">, x: readonly number[]): number[] {
    const out = [1];
    x.forEach((v, k) => {
        const scale = fit.scales[k] as number;
        const z = scale > 0 ? (v - (fit.means[k] as number)) / scale : 0;
        out.push(z, z * z);
    });
    return out;
}

/** The least-squares fit of `ys` on `xs`' terms (GripFit), by modified Gram–Schmidt with spanned terms dropped. */
export function fitGrip(xs: readonly (readonly number[])[], ys: readonly number[]): GripFit {
    const n = xs.length;
    const inputs = xs[0]?.length ?? 0;
    const means: number[] = [];
    const scales: number[] = [];
    for (let k = 0; k < inputs; k++) {
        const column = xs.map((x) => x[k] as number);
        const mean = column.reduce((a, b) => a + b, 0) / Math.max(1, n);
        const sd = Math.sqrt(column.reduce((a, v) => a + (v - mean) ** 2, 0) / Math.max(1, n));
        means.push(mean);
        scales.push(sd > SPANNED * Math.max(1, Math.abs(mean)) ? sd : 0);
    }
    const rowsOf = xs.map((x) => terms({ means, scales }, x));
    const m = 1 + 2 * inputs;
    const q: (number[] | null)[] = [];
    const r: number[][] = Array.from({ length: m }, () => new Array<number>(m).fill(0));
    for (let j = 0; j < m; j++) {
        const v = rowsOf.map((row) => row[j] as number);
        const norm0 = Math.hypot(...v);
        for (let i = 0; i < j; i++) {
            const qi = q[i];
            if (qi === null || qi === undefined) {
                continue;
            }
            const dot = qi.reduce((a, b, t) => a + b * (v[t] as number), 0);
            (r[i] as number[])[j] = dot;
            for (let t = 0; t < n; t++) {
                v[t] = (v[t] as number) - dot * (qi[t] as number);
            }
        }
        const norm = Math.hypot(...v);
        if (norm0 === 0 || norm <= SPANNED * norm0) {
            q.push(null);
            continue;
        }
        (r[j] as number[])[j] = norm;
        q.push(v.map((x) => x / norm));
    }
    const residual = [...ys];
    const c = new Array<number>(m).fill(0);
    for (let i = 0; i < m; i++) {
        const qi = q[i];
        if (qi === null || qi === undefined) {
            continue;
        }
        c[i] = qi.reduce((a, b, t) => a + b * (residual[t] as number), 0);
        for (let t = 0; t < n; t++) {
            residual[t] = (residual[t] as number) - (c[i] as number) * (qi[t] as number);
        }
    }
    const beta = new Array<number>(m).fill(0);
    for (let i = m - 1; i >= 0; i--) {
        if (q[i] === null) {
            continue;
        }
        let sum = c[i] as number;
        for (let j = i + 1; j < m; j++) {
            sum -= ((r[i] as number[])[j] as number) * (beta[j] as number);
        }
        beta[i] = sum / ((r[i] as number[])[i] as number);
    }
    return { means, scales, coefficients: beta, rows: n };
}

/** `fit`'s grip at `x`. */
export function predictGrip(fit: GripFit, x: readonly number[]): number {
    return terms(fit, x).reduce((a, t, i) => a + t * (fit.coefficients[i] as number), 0);
}

/** One grip's fit for one type (gripFits): fitted on the starting plans, checked on the held-out ones. */
export interface TypeFit {
    readonly type: MapType;
    readonly grip: keyof GripBounds;
    /** Null where no starting plan has the grip. */
    readonly fit: GripFit | null;
    readonly heldOut: number;
    /** The held-out median absolute error (hold firmness); NaN with no held-out plan. */
    readonly error: number;
    /** Whether `error` is at most FIT_LIMIT. */
    readonly accepted: boolean;
}

/**
 * Per type and grip, the fit on the starting plans' inputs and the held-out median error (plan C-d4). A plan whose grip
 * is null (no grip plays) or whose line is an engine error is in neither set.
 */
export function gripFits(plans: readonly GripPlan[], entries: ReadonlyMap<number, GripEntry>): TypeFit[] {
    const fits: TypeFit[] = [];
    const types = [...new Set(plans.map((p) => p.type))];
    for (const type of types) {
        for (const grip of ["least", "firmest", "reliable"] as const) {
            const rows = {
                start: { xs: [] as number[][], ys: [] as number[] },
                held: { xs: [] as number[][], ys: [] as number[] },
            };
            plans.forEach((job, index) => {
                const entry = entries.get(index);
                if (job.type !== type || entry === undefined || "engineError" in entry) {
                    return;
                }
                const y = entry.bounds[grip];
                if (y !== null) {
                    rows[job.set].xs.push(fitInputs(job));
                    rows[job.set].ys.push(y);
                }
            });
            const fit = rows.start.xs.length > 0 ? fitGrip(rows.start.xs, rows.start.ys) : null;
            const error = fit === null ? NaN : heldOutError(fit, rows.held.xs, rows.held.ys);
            fits.push({ type, grip, fit, heldOut: rows.held.xs.length, error, accepted: error <= FIT_LIMIT });
        }
    }
    return fits;
}

/** The median absolute error of `fit` on `xs` against `ys`; NaN with none. */
export function heldOutError(fit: GripFit, xs: readonly (readonly number[])[], ys: readonly number[]): number {
    const errors = xs.map((x, i) => Math.abs(predictGrip(fit, x) - (ys[i] as number))).sort((a, b) => a - b);
    if (errors.length === 0) {
        return NaN;
    }
    const mid = Math.floor(errors.length / 2);
    return errors.length % 2 === 1
        ? (errors[mid] as number)
        : ((errors[mid - 1] as number) + (errors[mid] as number)) / 2;
}
