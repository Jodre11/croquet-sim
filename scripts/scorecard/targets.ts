/**
 * The scorecard's targets (reality scorecard design §3.1–§3.3): every external figure the project holds, with its
 * source's value, its tolerance, its family and its use. Data only; the measuring is scripts/scorecard/jobs.ts's.
 * Sources are cited, never mirrored (reference/sources/README.md holds the digests).
 */
import { FILMED_STROKES, FREE_COLLISIONS, GUGAN_MEANS, GUGAN5, TABLE2_FACE, VIDEO_FRAME } from "../filmedStrokes";
import { CA_STROKES } from "../ratioFit";
import { ROLLS } from "../table6";
import type { Measured, Target, Use } from "./score";

const G4 = "Gugan 4, https://oxfordcroquet.org/tech/gugan4/";
const G5 = "Gugan 5, https://oxfordcroquet.org/tech/gugan5/";

/** Design §3.2: Gugan's "about 3%" on each speed, in quadrature on a ratio of two. */
const RATIO_SHARE = 0.03 * Math.SQRT2;
/** Design §3.2's assumption: Ω ± 10 points. */
const SPIN_POINTS = 10;
/** Design §3.2: travels ± 20%, ratios of travels ± 28%. */
const TRAVEL_SHARE = 0.2;
const TRAVEL_RATIO_SHARE = 0.28;

/** Design §3.3: the rolls held out of the fit. */
export const HELD_OUT_ROLLS: readonly string[] = ["C3H", "C1F", "C25P"];

/**
 * Gugan 4 Table 5's rows the repo did not hold (fetched 2026-11-16; the page's digest in reference/sources/README.md):
 * row 7 Ω₁ × 100, rows 8 and 11 the travels L₁ and L₂ (m), from TEXT.
 */
export const TABLE5_EXTRA: Readonly<Record<string, { readonly o1: number; readonly l1: number; readonly l2: number }>> =
    {
        B2GS: { o1: -3, l1: 0.77, l2: 2.61 },
        B1GS: { o1: -14, l1: 0.64, l2: 2.7 },
        B1MS: { o1: -16, l1: 2.45, l2: 15.9 },
        B2MS: { o1: 4, l1: 6.7, l2: 18.64 },
        C3S: { o1: -14, l1: 0.78, l2: 4.85 },
        C10S: { o1: -12, l1: 2.52, l2: 10.61 },
        C20S: { o1: -12, l1: 5.48, l2: 22.26 },
        C1D: { o1: 20, l1: 1.55, l2: 6.21 },
        C3D: { o1: -4, l1: 5.35, l2: 16.17 },
        C10D: { o1: 5, l1: 8.02, l2: 30.8 },
    };

/** The user's yardages, like for like (roadmap "User play data and checks", 2026-10-08); one yard 0.9144 m. */
export const USER_CHECKS = [
    { id: "user.single.0.45m.i0.4", yards: 30, note: "single ball from about knee height at about 40% effort" },
    { id: "user.single.0.45m.i0.3", yards: 15, note: "single ball from about knee height at about 30% (cast)" },
] as const;

/** The pseudo-job of targets computed from other targets' measures (deriveMeans), never run by a worker. */
export const DERIVED = "derived";

const targets: Target[] = [];
const add = (t: Target): void => {
    targets.push(t);
};

// Strike: Table 1's free collisions, Table 2's face (fit, as now).
for (const c of FREE_COLLISIONS) {
    const s = c.speed.toFixed(2);
    add({
        id: `strike.t1.e@${s}`,
        job: "strike-ballball",
        family: "strike",
        use: "fit",
        kind: "number",
        value: c.restitution,
        sigma: 0.02,
        source: `${G4} §4, Table 1 row 8 (e 0.72 ± 0.02)`,
    });
    add({
        id: `strike.t1.video@${s}`,
        job: "strike-ballball",
        family: "strike",
        use: "fit",
        kind: "number",
        value: c.contactTime * 1e3,
        sigma: VIDEO_FRAME * 1e3,
        source: `${G4} Table 1 row 5 (ms, ± a frame)`,
    });
}
for (const c of TABLE2_FACE) {
    add({
        id: `strike.t2.${c.name}.video`,
        job: "strike-face",
        family: "strike",
        use: "fit",
        kind: "number",
        value: c.contactTime * 1e3,
        sigma: 0.1,
        source: `${G4} Table 2 row 4 (ms, ± 0.1)`,
    });
}

// Gugan 5's ratios at 3 m/s on his mallet (fit).
add({
    id: "gugan5.drive",
    job: "gugan5-drive",
    family: "gugan5",
    use: "fit",
    kind: "number",
    value: GUGAN5.drive.ratio,
    sigma: GUGAN5.drive.tolerance,
    source: `${G5} drive 4.23 ± 0.2 (sem)`,
});
add({
    id: "gugan5.stop",
    job: "gugan5-stop",
    family: "gugan5",
    use: "fit",
    kind: "number",
    value: GUGAN5.stop.ratio,
    sigma: GUGAN5.stop.tolerance,
    source: `${G5} stop 7.15 ± 0.6 (sem)`,
});

// Table 5 per stroke (fit; B1MS out, as Gugan), and the means.
for (const s of FILMED_STROKES) {
    const job = `t5-${s.name}`;
    const use: Use = s.name === "B1MS" ? "check" : "fit";
    const x = TABLE5_EXTRA[s.name] as (typeof TABLE5_EXTRA)[string];
    const v2U = s.croqueted / s.malletSpeed;
    const w1W = s.striker / s.malletAfter;
    add({
        id: `t5.${s.name}.v2U`,
        job,
        family: "table5",
        use,
        kind: "number",
        value: v2U,
        sigma: v2U * RATIO_SHARE,
        source: `${G4} Table 5 rows 1, 9`,
    });
    add({
        id: `t5.${s.name}.w1W`,
        job,
        family: "table5",
        use,
        kind: "number",
        value: w1W,
        sigma: w1W * RATIO_SHARE,
        source: `${G4} Table 5 rows 5, 6`,
    });
    add({
        id: `t5.${s.name}.o1`,
        job,
        family: "table5",
        use,
        kind: "number",
        value: x.o1,
        sigma: SPIN_POINTS,
        source: `${G4} Table 5 row 7`,
    });
    if (s.distanceRatio !== null) {
        add({
            id: `t5.${s.name}.L2L1`,
            job,
            family: "table5",
            use,
            kind: "number",
            value: s.distanceRatio,
            sigma: s.distanceRatio * TRAVEL_RATIO_SHARE,
            source: `${G4} Table 5 row 17`,
        });
    }
    add({
        id: `lawn.t5.${s.name}.L1`,
        job,
        family: "lawn",
        use: s.name === "B1MS" ? "check" : "held-out",
        kind: "number",
        value: x.l1,
        sigma: x.l1 * TRAVEL_SHARE,
        source: `${G4} Table 5 row 8 (TEXT)`,
    });
    add({
        id: `lawn.t5.${s.name}.L2`,
        job,
        family: "lawn",
        use: "held-out",
        kind: "number",
        value: x.l2,
        sigma: x.l2 * TRAVEL_SHARE,
        source: `${G4} Table 5 row 11 (TEXT)`,
    });
}
add({
    id: "t5.mean.v2U",
    job: DERIVED,
    family: "table5",
    use: "fit",
    kind: "number",
    value: GUGAN_MEANS.v2U.value,
    sigma: GUGAN_MEANS.v2U.sem,
    source: `${G4} §9.3 (sem)`,
});
add({
    id: "t5.mean.w1W",
    job: DERIVED,
    family: "table5",
    use: "fit",
    kind: "number",
    value: GUGAN_MEANS.w1W.value,
    sigma: GUGAN_MEANS.w1W.sem,
    source: `${G4} §9.3 (sem)`,
});
add({
    id: "t5.mean.v2w1",
    job: DERIVED,
    family: "table5",
    use: "fit",
    kind: "number",
    value: GUGAN_MEANS.v2w1.value,
    sigma: GUGAN_MEANS.v2w1.sem,
    source: `${G4} §9.3 (sem)`,
});

// Table 6 per roll (fit; C3H, C1F and C25P held out), their travels (lawn, held out), their play (playability).
for (const r of ROLLS) {
    const job = `t6-${r.name}`;
    const use: Use = HELD_OUT_ROLLS.includes(r.name) ? "held-out" : "fit";
    const w1U = r.w1 / r.U;
    const v2U = r.v2 / r.U;
    add({
        id: `t6.${r.name}.w1U`,
        job,
        family: "table6",
        use,
        kind: "number",
        value: w1U,
        sigma: w1U * RATIO_SHARE,
        source: `${G4} Table 6 rows 3, 4`,
    });
    add({
        id: `t6.${r.name}.v2U`,
        job,
        family: "table6",
        use,
        kind: "number",
        value: v2U,
        sigma: v2U * RATIO_SHARE,
        source: `${G4} Table 6 rows 3, 7`,
    });
    add({
        id: `t6.${r.name}.o1`,
        job,
        family: "table6",
        use,
        kind: "number",
        value: r.o1,
        sigma: SPIN_POINTS,
        source: `${G4} Table 6 row 5`,
    });
    add({
        id: `t6.${r.name}.o2`,
        job,
        family: "table6",
        use,
        kind: "number",
        value: r.o2,
        sigma: SPIN_POINTS,
        source: `${G4} Table 6 row 8`,
    });
    add({
        id: `t6.${r.name}.L2L1`,
        job,
        family: "table6",
        use,
        kind: "number",
        value: r.l2 / r.l1,
        sigma: (r.l2 / r.l1) * TRAVEL_RATIO_SHARE,
        source: `${G4} Table 6 row 12`,
    });
    add({
        id: `lawn.t6.${r.name}.L1`,
        job,
        family: "lawn",
        use: "held-out",
        kind: "number",
        value: r.l1,
        sigma: r.l1 * TRAVEL_SHARE,
        source: `${G4} Table 6 row 6 (TEXT)`,
    });
    add({
        id: `lawn.t6.${r.name}.L2`,
        job,
        family: "lawn",
        use: "held-out",
        kind: "number",
        value: r.l2,
        sigma: r.l2 * TRAVEL_SHARE,
        source: `${G4} Table 6 row 9 (TEXT)`,
    });
    add({
        id: `play.t6.${r.name}`,
        job,
        family: "playability",
        use: "fit",
        kind: "clean",
        source: `${G4} Table 6: played at U, so playable`,
    });
}

// Turf: Table 4(b)'s bed (A4R fitted, A2R and A3R held out).
add({
    id: "turf.A4R.e",
    job: "turf-bed",
    family: "turf",
    use: "fit",
    kind: "number",
    value: 0.5,
    sigma: 0.02,
    source: `${G4} §7.1, Table 4(b) A4R`,
});
add({
    id: "turf.A4R.depth",
    job: "turf-bed",
    family: "turf",
    use: "fit",
    kind: "number",
    value: 7.2,
    sigma: 0.5,
    source: `${G4} Table 4(b) A4R (mm)`,
});
add({
    id: "turf.A2R.depth",
    job: "turf-bed",
    family: "turf",
    use: "held-out",
    kind: "number",
    value: 4.0,
    sigma: 0.5,
    source: `${G4} Table 4(b) A2R (mm)`,
});
add({
    id: "turf.A3R.depth",
    job: "turf-bed",
    family: "turf",
    use: "held-out",
    kind: "number",
    value: 5.0,
    sigma: 0.5,
    source: `${G4} Table 4(b) A3R (mm)`,
});

// CA single-ball drives: the strike's and the lawn's shares (check).
for (const c of CA_STROKES) {
    add({
        id: `ca.${c.name}.strike`,
        job: `ca-${c.name}`,
        family: "ca",
        use: "check",
        kind: "number",
        value: 1,
        sigma: RATIO_SHARE,
        source: "CA Single Ball Shots (reference/sources/README.md): ball/mallet speed",
    });
    add({
        id: `ca.${c.name}.lawn`,
        job: `ca-${c.name}`,
        family: "ca",
        use: "check",
        kind: "number",
        value: 1,
        sigma: TRAVEL_SHARE,
        source: "CA Single Ball Shots: travel at the CA's ball speed",
    });
}

// The user's yardages (check, never fitted).
for (const u of USER_CHECKS) {
    add({
        id: u.id,
        job: "user",
        family: "user",
        use: "check",
        kind: "number",
        value: u.yards,
        sigma: u.yards * TRAVEL_SHARE,
        source: "roadmap, User play data and checks (2026-10-08)",
        note: u.note,
    });
}
add({
    id: "user.drive.top.croqueted",
    job: "user",
    family: "user",
    use: "check",
    kind: "band",
    band: [35, 60],
    sigma: 7,
    source: "roadmap, User play data and checks: the drive at 100% sends the croqueted ball the full lawn",
});

// The canonical strokes: playable (fit), not riding the ball and the lift (look), the coaching bands (check).
const COACHING: Readonly<Record<string, readonly [number, number] | null>> = {
    drive: [3, 4],
    "stop-ac": [4.1, 6.2],
    "half-roll": [1.4, 2.5],
    "full-roll": [1, 1.2],
    "pass-roll": [0, 0.99],
    "single-ball": null,
};
for (const [type, band] of Object.entries(COACHING)) {
    const job = `canon-${type}`;
    add({
        id: `play.canon.${type}`,
        job,
        family: "playability",
        use: "fit",
        kind: "clean",
        source: "the canonical stroke at canonical power, 10 s lawn, preset hold",
    });
    add({
        id: `look.ride.${type}`,
        job,
        family: "look",
        use: "check",
        kind: "clean",
        source: "the user's ruling: the head never rides over the ball",
    });
    if (band !== null) {
        add({
            id: `coach.${type}`,
            job,
            family: "coaching",
            use: "check",
            kind: "band",
            band,
            sigma: 0.1 * band[1],
            source: "src/lab/play.ts LABELS (coaching bands)",
        });
    }
}
for (const type of ["half-roll", "full-roll", "pass-roll"]) {
    add({
        id: `look.lift.${type}`,
        job: `lift-${type}`,
        family: "look",
        use: "check",
        kind: "band",
        band: [0, 5],
        sigma: 2,
        source: "exit criterion 4: highest centre ≤ R + 5 mm (mm above R)",
    });
}

/** Every target, by family in the design's order. */
export const TARGETS: readonly Target[] = targets;

/** §9.3's means over the ten strokes from their measured figures; null if any stroke is unmeasured (design §3.1). */
export function deriveMeans(measured: Readonly<Record<string, Measured>>): Record<string, Measured> {
    const mean = (key: (name: string) => string): Measured => {
        const xs = FILMED_STROKES.map((s) => measured[key(s.name)]);
        return xs.every((x) => typeof x === "number") ? (xs as number[]).reduce((a, b) => a + b, 0) / xs.length : null;
    };
    return {
        "t5.mean.v2U": mean((n) => `t5.${n}.v2U`),
        "t5.mean.w1W": mean((n) => `t5.${n}.w1W`),
        "t5.mean.v2w1": mean((n) => `_t5.${n}.v2w1`),
    };
}
