/**
 * The filmed strokes as sourced data (P2b.2b.2c.2b design §5.1, §7.1, §7.2): Gugan 4's ten two-ball strokes from the
 * CA's high-speed video (Table 5), their contact timing (Fig. 4), the video's free ball–ball collisions (Table 1) and
 * the face's contact in a single-ball drive (Table 2), and Gugan 5's drive and stop. The impact is judged against
 * these; nothing here is fitted. Every figure is cited, by table, row and column, in reference/sources/README.md,
 * section "P2b.2b.2c.2b: the croquet stroke's squeeze"; the line numbers below are that file's.
 */

/** The preset a filmed stroke is played on (design §5.2): drives, stop-shots and close scatter shots. */
export type FilmedPreset = "drive" | "stop-ac" | "single-ball";

/**
 * One of Table 5's strokes. Speeds in m/s: `malletSpeed` U (row 1), `malletAfter` W "after the double tap" (row 5),
 * `striker` w₁ (row 6), `croqueted` v₂ (row 9). `gap` is row 2's separation in m; `nominal` is its asterisk, note
 * (i)'s "nominally in contact, but ... in fact clearly separated". `squaredRatio` is row 16, (v₂/w₁)ᵣ² corrected for
 * roll, and `distanceRatio` row 17, L₂/L₁; `null` where Gugan marks the figure in error.
 */
export interface FilmedStroke {
    readonly name: string;
    readonly preset: FilmedPreset;
    readonly malletSpeed: number;
    readonly gap: number;
    readonly nominal: boolean;
    readonly malletAfter: number;
    readonly striker: number;
    readonly croqueted: number;
    readonly squaredRatio: number | null;
    readonly distanceRatio: number | null;
}

/**
 * Gugan 4, Table 5, in its column order (README lines 562-568). B1MS's row 17 is `null`: Gugan underlines it as an
 * anomaly of its L₁ (row 8), "anomalous ... a likely explanation is an inversion error in recording" (README lines
 * 574-582).
 */
export const FILMED_STROKES: readonly FilmedStroke[] = [
    {
        name: "B2GS",
        preset: "single-ball",
        malletSpeed: 1.68,
        gap: 0.006,
        nominal: false,
        malletAfter: 0.53,
        striker: 0.98,
        croqueted: 1.75,
        squaredRatio: 3.6,
        distanceRatio: 3.4,
    },
    {
        name: "B1GS",
        preset: "single-ball",
        malletSpeed: 1.75,
        gap: 0.001,
        nominal: false,
        malletAfter: 0.54,
        striker: 0.93,
        croqueted: 1.8,
        squaredRatio: 4.3,
        distanceRatio: 4.2,
    },
    {
        name: "B1MS",
        preset: "single-ball",
        malletSpeed: 5.1,
        gap: 0.002,
        nominal: false,
        malletAfter: 1.7,
        striker: 2.78,
        croqueted: 5.6,
        squaredRatio: 4.9,
        distanceRatio: null,
    },
    {
        name: "B2MS",
        preset: "single-ball",
        malletSpeed: 5.87,
        gap: 0.006,
        nominal: false,
        malletAfter: 1.9,
        striker: 3.25,
        croqueted: 6.13,
        squaredRatio: 3.6,
        distanceRatio: 2.8,
    },
    {
        name: "C3S",
        preset: "stop-ac",
        malletSpeed: 1.92,
        gap: 0,
        nominal: false,
        malletAfter: 0.56,
        striker: 0.97,
        croqueted: 2.2,
        squaredRatio: 6.5,
        distanceRatio: 6.6,
    },
    {
        name: "C10S",
        preset: "stop-ac",
        malletSpeed: 3.57,
        gap: 0.0005,
        nominal: true,
        malletAfter: 1.07,
        striker: 1.92,
        croqueted: 4.1,
        squaredRatio: 5.2,
        distanceRatio: 4.2,
    },
    {
        name: "C20S",
        preset: "stop-ac",
        malletSpeed: 5.8,
        gap: 0,
        nominal: false,
        malletAfter: 1.8,
        striker: 2.9,
        croqueted: 6.3,
        squaredRatio: 5.5,
        distanceRatio: 4.1,
    },
    {
        name: "C1D",
        preset: "drive",
        malletSpeed: 2.5,
        gap: 0.001,
        nominal: true,
        malletAfter: 0.76,
        striker: 1.24,
        croqueted: 2.88,
        squaredRatio: 4.8,
        distanceRatio: 4.0,
    },
    {
        name: "C3D",
        preset: "drive",
        malletSpeed: 4.96,
        gap: 0.001,
        nominal: true,
        malletAfter: 1.46,
        striker: 2.8,
        croqueted: 5.5,
        squaredRatio: 4.2,
        distanceRatio: 3.0,
    },
    {
        name: "C10D",
        preset: "drive",
        malletSpeed: 7.0,
        gap: 0.001,
        nominal: true,
        malletAfter: 2.32,
        striker: 3.44,
        croqueted: 7.76,
        squaredRatio: 5.1,
        distanceRatio: 3.8,
    },
];

/**
 * Gugan 4, §9.3's means over the ten strokes, each ± its standard error of the mean (README lines 585-590): v₂/U
 * "approximately constant at 1.10 ± 0.02 (sem)", w₁/W "1.71 ± 0.05", v₂/w₁ "2.07 ± 0.06".
 */
export const GUGAN_MEANS = {
    v2U: { value: 1.1, sem: 0.02 },
    w1W: { value: 1.71, sem: 0.05 },
    v2w1: { value: 2.07, sem: 0.06 },
} as const;

/** One video frame in s: "images taken at a rate of 8000 per second (125 microseconds/frame)" (README line 646). */
export const VIDEO_FRAME = 1 / 8000;

/**
 * The displacement in m at which the video first shows a body moving: Gugan 4's stated resolution, positions "to
 * about ± 0.2 mm" (README lines 648-657). His "several times greater" in practice gives no figure and is not applied.
 */
export const VISIBLE_SHIFT = 2e-4;

/**
 * A filmed stroke's contact timing in s from the mallet's first contact: the croqueted ball first seen moving (the
 * cross-hatched bar's start), the mallet's first contact's end, the croqueted ball leaving (the bar's end), and the
 * mallet's second contact, if any.
 */
export interface FilmedTiming {
    readonly name: string;
    readonly firstMoves: number;
    readonly firstContactEnds: number;
    readonly leaves: number;
    readonly secondTap: readonly [number, number] | null;
}

/** A Fig. 4 reading: frames from the mallet's first contact, as the figure counts them. */
function timing(name: string, frames: readonly [number, number, number, number, number]): FilmedTiming {
    const [firstMoves, firstContactEnds, leaves, tapStart, tapEnd] = frames;
    return {
        name,
        firstMoves: firstMoves * VIDEO_FRAME,
        firstContactEnds: firstContactEnds * VIDEO_FRAME,
        leaves: leaves * VIDEO_FRAME,
        secondTap: [tapStart * VIDEO_FRAME, tapEnd * VIDEO_FRAME],
    };
}

/**
 * Gugan 4, Fig. 4, this step's re-reading by pixel, each ±0.5 frame on top of Gugan's "a frame or two" (README lines
 * 609-616, beside the research reading). C1D's first contact ends where its heavy line does, 6.5 frames; Gugan saw
 * "no clear separation" from there to the second contact "because of shadows".
 */
export const FIG4_TIMING: readonly FilmedTiming[] = [
    timing("C3S", [4.8, 5.2, 11.2, 11.0, 19.1]),
    timing("C20S", [4.0, 5.1, 10.0, 9.8, 16.2]),
    timing("C1D", [5.9, 6.5, 13.2, 12.8, 21.1]),
    timing("C10S", [4.8, 6.1, 11.2, 10.9, 19.0]),
    timing("C3D", [4.8, 7.9, 11.2, 10.9, 16.2]),
    timing("C10D", [3.9, 6.0, 9.4, 6.3, 13.3]),
];

/**
 * Gugan 4, Table 1's three clean free collisions, B4GS, B6MS and B5MS (README lines 621-643): v₁ (row 6) in m/s and
 * the contact time Tb (row 5) in s. The restitution is Gugan's stated e = 0.72 ± 0.02 (§4), from row 8's mean over all
 * seven strokes; the clean strokes' own (A7) figures scatter about it and are in the README only. The double-tap
 * columns, among them the 0.50 and 0.87 ms readings, are left out.
 */
export const FREE_COLLISIONS: readonly {
    readonly speed: number;
    readonly restitution: number;
    readonly contactTime: number;
}[] = [
    { speed: 1.9, restitution: 0.72, contactTime: 7.5e-4 },
    { speed: 5.54, restitution: 0.72, contactTime: 7.5e-4 },
    { speed: 7.64, restitution: 0.72, contactTime: 7.5e-4 },
];

/**
 * Gugan 4, Table 2, column A2D: the face's contact in a single-ball drive as the video timed it, row 4's 0.75 ms
 * (± 0.1 ms) at row 7's U of 3.26 m/s (README line 644).
 */
export const SINGLE_BALL_FACE = { speed: 3.26, contactTime: 7.5e-4 } as const;

/**
 * Gugan 5's drive and stop at "a mallet speed of about 3 m/s" (README lines 659-673): the drive's distance ratio
 * 4.23 ± 0.2 (sem), its single strokes' standard deviation 0.6; the jab stop's 7.15 ± 0.6, "the scatter is about
 * ± 2.0"; the Dawson Internationals' e = 0.772 by the maker's bounce test.
 */
export const GUGAN5 = {
    drive: { ratio: 4.23, tolerance: 0.2, sd: 0.6 },
    stop: { ratio: 7.15, tolerance: 0.6, spread: 2.0 },
    ballRestitution: 0.772,
    speed: 3,
} as const;
