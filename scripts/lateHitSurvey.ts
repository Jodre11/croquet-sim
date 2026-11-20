/**
 * The late-hit survey (soft follow-through design §3; plan `docs/superpowers/plans/2026-11-20-soft-follow-through.md`,
 * Task 1). Plays Gugan 4 Table 6's nine rolls at their U on the 13 s lawn, and the half, full and pass rolls' text
 * books at a ladder of powers read on the 6, 10 and 14 s lawns, each practised at the preset hold. For each it reports
 * the head's contacts with the striker's ball after the strike's taps (a late hit): start, region and, for a face
 * re-contact, its gap and effect; with the play's class and ratio. Writes
 * `docs/superpowers/probes/late-hit/<date>-<label>.txt`. Not part of the engine. Run with
 * `nice -n 10 npx --no-install tsx scripts/lateHitSurvey.ts --label <label>`.
 */
import type { ContactInterval } from "../src/engine/impact/types";
import type { ReContact, StrikeTaps } from "../src/engine/faults";
import type { ShotSetup } from "../src/engine/swing/types";
import { canonicalPower, playJudged, textBook, type MapType, type PlayWatch } from "../src/lab/play";
import { openWorld } from "./openLawn";
import { LAWN, powerFor, ROLLS } from "./table6";

declare const process: { readonly argv: readonly string[] };

interface Files {
    mkdirSync(path: string, options: { readonly recursive: true }): void;
    writeFileSync(path: string, data: string): void;
}

/** The survey's output directory. */
const OUT_DIR = "docs/superpowers/probes/late-hit";

/** The text books' power ladder (spec §3); "canonical" is canonicalPower on the 10 s lawn. */
const POWERS = [0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0] as const;

/** The lawns (s) the text books' ratios are read on. */
const MAP_LAWNS = [6, 10, 14] as const;

const ROLL_TYPES: readonly MapType[] = ["half-roll", "full-roll", "pass-roll"];

/** A late hit: a head–striker interval after the strike's taps. */
interface LateHit {
    readonly start: number;
    readonly region: string;
    readonly recontact: ReContact | null;
}

interface Row {
    readonly name: string;
    readonly power: number;
    readonly contactSpeed: number | null;
    readonly klass: string;
    readonly ratios: string;
    readonly late: readonly LateHit[];
}

const ms = (t: number): string => (t * 1e3).toFixed(1);

/**
 * The head–striker intervals of `regions` (headRegions, keyed "face/<ball>#<region>") that start after the strike:
 * after the last of `strike`'s taps, else after the first face interval.
 */
function lateHits(
    regions: Readonly<Record<string, readonly ContactInterval[]>>,
    striker: string,
    face: readonly ContactInterval[],
    strike: StrikeTaps | null,
): LateHit[] {
    const taps = strike?.taps ?? [];
    const strikeEnd = taps.length > 0 ? Math.max(...taps.map((c) => c.end)) : (face[0]?.end ?? Infinity);
    const out: LateHit[] = [];
    for (const [key, intervals] of Object.entries(regions)) {
        const [pair, region] = key.split("#");
        if (pair !== `face/${striker}` || region === undefined) {
            continue;
        }
        for (const c of intervals) {
            if (c.start > strikeEnd) {
                const recontact = strike?.recontacts.find((r) => r.start <= c.start && c.start < r.end) ?? null;
                out.push({ start: c.start, region, recontact });
            }
        }
    }
    return out.sort((a, b) => a.start - b.start);
}

/** `type`'s text book played at `power` and read on `lawns`, its last practised play surveyed. */
function surveyed(name: string, type: MapType, power: number, lawns: readonly number[]): Row {
    const seen: {
        kept: { setup: ShotSetup; regions: Record<string, readonly ContactInterval[]>; face: ContactInterval[] } | null;
        contactSpeed: number | null;
    } = { kept: null, contactSpeed: null };
    const watch: PlayWatch = {
        probeFor: () => ({ step: () => {} }),
        played: (run, stroke, setup) => {
            const timeline = run.result.timeline[`face/${setup.striker}`] ?? [];
            seen.kept = { setup, regions: { ...(run.result.headRegions ?? {}) }, face: [...timeline] };
            const arc = (stroke.contact.drive as { readonly arc?: { readonly contactSpeed?: number } }).arc;
            seen.contactSpeed = arc?.contactSpeed ?? null;
        },
    };
    const { sample, strike } = playJudged(type, textBook(type), power, lawns, "preset", 0, watch);
    const ratios = lawns.map((l) => sample.byLawn?.[l]?.ratio?.toFixed(3) ?? "-").join("/");
    const klass = sample.klass === null ? "clean" : `${sample.klass} (${sample.reason ?? "-"})`;
    const played = seen.kept;
    const late = played === null ? [] : lateHits(played.regions, played.setup.striker, played.face, strike);
    return { name, power, contactSpeed: seen.contactSpeed, klass, ratios, late };
}

function rowText(r: Row): string {
    const u = r.contactSpeed === null ? "" : ` U ${r.contactSpeed.toFixed(3)}`;
    const head = `${r.name.padEnd(22)} p ${r.power.toFixed(3)}${u} ${r.klass}; ratio ${r.ratios}`;
    if (r.late.length === 0) {
        return `${head}; late hits none`;
    }
    const hits = r.late.map((h) => {
        const re =
            h.recontact === null
                ? ""
                : ` gap ${ms(h.recontact.gap)} ms speed ${(100 * h.recontact.speedChange).toFixed(1)}% angle ` +
                  `${h.recontact.angleChange.toFixed(1)}°${h.recontact.fault ? " FAULT" : ""}`;
        return `${ms(h.start)} ms ${h.region}${re}`;
    });
    return `${head}; late hits ${r.late.length}: ${hits.join("; ")}`;
}

async function main(): Promise<void> {
    const at = process.argv.indexOf("--label");
    const label = at >= 0 ? process.argv[at + 1] : undefined;
    if (label === undefined) {
        throw new Error("usage: lateHitSurvey.ts --label <label>");
    }
    const lines: string[] = [`Late-hit survey ${label}, ${new Date().toISOString()}`, "", "== Table 6 =="];
    const rows: { type: string; row: Row }[] = [];
    const t6 = openWorld(LAWN);
    for (const roll of ROLLS) {
        const power = powerFor(roll.type, roll.U, t6);
        if (power === null) {
            lines.push(`${roll.name} unplayable at U ${roll.U}`);
            continue;
        }
        const row = surveyed(`t6.${roll.name}`, roll.type, power, [LAWN]);
        rows.push({ type: roll.type, row });
        lines.push(rowText(row));
        console.log(rowText(row));
    }
    const ten = openWorld(10);
    for (const type of ROLL_TYPES) {
        lines.push("", `== ${type} ==`);
        const powers = [...POWERS, canonicalPower(type, ten)];
        for (const [i, power] of powers.entries()) {
            const name = i === POWERS.length ? `${type} canonical` : type;
            const row = surveyed(name, type, power, MAP_LAWNS);
            rows.push({ type, row });
            lines.push(rowText(row));
            console.log(rowText(row));
        }
    }
    lines.push("", "== Late hits per type (rows with any / rows) ==");
    for (const type of ROLL_TYPES) {
        const of = rows.filter((r) => r.type === type);
        lines.push(`${type}: ${of.filter((r) => r.row.late.length > 0).length} / ${of.length}`);
    }
    const specifier = "node:fs";
    const fs = (await import(/* @vite-ignore */ specifier)) as Files;
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const path = `${OUT_DIR}/${new Date().toISOString().slice(0, 10)}-${label}.txt`;
    fs.writeFileSync(path, `${lines.join("\n")}\n`);
    console.log(`wrote ${path}`);
}

main().catch((error: unknown) => {
    console.error(error);
    throw error;
});
