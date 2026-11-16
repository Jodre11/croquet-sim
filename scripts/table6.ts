/**
 * Gugan 4 Table 6's nine filmed rolls and their play on the model (roll launch design §3.3), shared by
 * scripts/table6Probe.ts and the scorecard (reality scorecard design §3.4): each roll's text book played at the power
 * whose planned head speed is Gugan's U, on the 13 s lawn (his court), at the preset hold.
 */
import { ballPairKey } from "../src/engine/impact/contacts";
import type { ContactState, ImpactResult, TrackDrive } from "../src/engine/impact/types";
import { plannedSpeed } from "../src/engine/swing/buildContact";
import type { ShotSetup } from "../src/engine/swing/types";
import type { World } from "../src/engine/types";
import { playJudged, textBook, type PlayWatch } from "../src/lab/play";
import { mapSetup, type RollType } from "./pushMapRun";
import { READ_DELAY, readOut, type ReadSample } from "./ratioFit";

/** One Table 6 row: U, w₁, Ω₁ (%), L₁ (m), v₂, Ω₂ (%), L₂ (m), as the speed-dependent lawn design §6 quotes them. */
export interface GuganRoll {
    readonly name: string;
    readonly type: RollType;
    readonly U: number;
    readonly w1: number;
    readonly o1: number;
    readonly l1: number;
    readonly v2: number;
    readonly o2: number;
    readonly l2: number;
}

// Gugan 4, Table 6: https://oxfordcroquet.org/tech/gugan4/
export const ROLLS: readonly GuganRoll[] = [
    { name: "C3H", type: "half-roll", U: 3.55, w1: 1.35, o1: 92, l1: 3.12, v2: 3.35, o2: 0, l2: 7.67 },
    { name: "C10H", type: "half-roll", U: 6.5, w1: 2.6, o1: 94, l1: 7.83, v2: 6.8, o2: -35, l2: 18.0 },
    { name: "C1F", type: "full-roll", U: 1.2, w1: 0.8, o1: 100, l1: 1.21, v2: 0.87, o2: 39, l2: 1.21 },
    { name: "C3F", type: "full-roll", U: 2.71, w1: 1.61, o1: 93, l1: 3.66, v2: 2.4, o2: 0, l2: 4.39 },
    { name: "C10F", type: "full-roll", U: 5.1, w1: 2.9, o1: 90, l1: 8.49, v2: 5.2, o2: -25, l2: 10.5 },
    { name: "C25F", type: "full-roll", U: 8.01, w1: 4.01, o1: 90, l1: 20.27, v2: 7.1, o2: -23, l2: 25.1 },
    { name: "C3P", type: "pass-roll", U: 3.07, w1: 1.78, o1: 97, l1: 3.73, v2: 2.41, o2: 0, l2: 4.51 },
    { name: "C10P", type: "pass-roll", U: 4.9, w1: 2.55, o1: 87, l1: 10.35, v2: 4.6, o2: -30, l2: 9.76 },
    { name: "C25P", type: "pass-roll", U: 8.85, w1: 4.93, o1: 78, l1: 26, v2: 7.44, o2: -29, l2: 30.0 },
];

/** Gugan's lawn (s), his court (speed-dependent lawn design §5.1). */
export const LAWN = 13;

/** The power below the type's top whose planned head speed is `U`, or null beyond the top. */
export function powerFor(type: RollType, U: number, world: World): number | null {
    const plan = textBook(type);
    const speed = (p: number): number => {
        try {
            return plannedSpeed(mapSetup(type, plan, p), world);
        } catch {
            return Infinity;
        }
    };
    let lo = 0.01;
    let hi = 4;
    for (let i = 0; i < 50; i++) {
        const m = (lo + hi) / 2;
        if (Number.isFinite(speed(m))) lo = m;
        else hi = m;
    }
    if (speed(lo) < U) return null;
    hi = lo;
    lo = 0.01;
    for (let i = 0; i < 50; i++) {
        const m = (lo + hi) / 2;
        if (speed(m) < U) lo = m;
        else hi = m;
    }
    return (lo + hi) / 2;
}

/** A roll's play: the setup and contact of its last practice pass, its handover, and its judged sample. */
export interface RollPlay {
    readonly sample: ReturnType<typeof playJudged>["sample"];
    readonly setup: ShotSetup | null;
    readonly hand: ImpactResult["handover"] | null;
    readonly contact: ContactState | null;
}

/** `roll`'s text book played at `power` on the 13 s lawn at the preset hold, as the push map plays it. */
export function playRoll(roll: GuganRoll, power: number): RollPlay {
    let setup: ShotSetup | null = null;
    let hand: ImpactResult["handover"] | null = null;
    let contact: ContactState | null = null;
    const watch: PlayWatch = {
        probeFor: () => ({ step: () => {} }),
        played: (run, stroke, played) => {
            setup = played;
            hand = run.result.handover;
            // The last practice pass's contact: the plan with the lift that pass played.
            const drive = stroke.contact.drive as TrackDrive;
            contact = { ...stroke.contact, drive: { ...drive, arc: { ...drive.arc, lift: run.lift ?? undefined } } };
        },
    };
    const { sample } = playJudged(roll.type, textBook(roll.type), power, [LAWN], "preset", 0, watch);
    return { sample, setup, hand, contact };
}

/**
 * The croqueted ball's read (roll launch design, amendment 4): READ_DELAY after its first contact with the striker's
 * ball ends, before the ground has worked on the spin that contact gave it (Gugan 4 §8, §10.2), with its instant (s).
 */
export function croquetedRead(
    r: ReturnType<typeof readOut>,
    setup: ShotSetup,
    delay: number = READ_DELAY,
): { readonly t: number; readonly at: ReadSample } {
    const croqueted = setup.croqueted as NonNullable<ShotSetup["croqueted"]>;
    const pair = r.impact.timeline[ballPairKey(setup.striker, croqueted)] ?? [];
    const t = (pair[0]?.end ?? r.time) + delay;
    const at = r.samples.find((s) => s.t >= t) ?? (r.samples[r.samples.length - 1] as ReadSample);
    return { t: at.t, at };
}

/** A roll's figures as Table 6 gives them: w₁/U, v₂/U, Ω₁ and Ω₂ (%), L₁ and L₂ (m); null where not played. */
export interface RollFigures {
    readonly clean: boolean;
    readonly w1U: number | null;
    readonly v2U: number | null;
    readonly o1: number | null;
    readonly o2: number | null;
    readonly l1: number | null;
    readonly l2: number | null;
}

/** `roll` played on `world` (the 13 s open lawn) and read as Gugan read it. */
export function rollFigures(roll: GuganRoll, world: World): RollFigures {
    const none = { w1U: null, v2U: null, o1: null, o2: null, l1: null, l2: null };
    const power = powerFor(roll.type, roll.U, world);
    if (power === null) return { clean: false, ...none };
    const { sample, setup, contact } = playRoll(roll, power);
    const clean = (sample.klass ?? "clean") === "clean";
    if (setup === null) return { clean, ...none };
    const played: ShotSetup = setup;
    const r = readOut(played, world, {}, contact ?? undefined);
    const read = r.samples.find((s) => s.t >= r.time) ?? r.samples[r.samples.length - 1];
    const two = croquetedRead(r, played);
    const lawn = sample.byLawn?.[LAWN];
    const l1 = lawn?.range ?? null;
    const ratio = lawn?.ratio ?? null;
    return {
        clean,
        w1U: r.w1 / roll.U,
        v2U: two.at.v2 / roll.U,
        o1: 100 * (read?.roll1 ?? NaN),
        o2: 100 * two.at.roll2,
        l1,
        l2: l1 === null || ratio === null ? null : l1 * ratio,
    };
}
