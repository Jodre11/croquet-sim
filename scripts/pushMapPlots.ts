/**
 * Plan Task B8 (Task 10 restated over one continuum; design §9, A7 items 2, 7 and 9, A8 items 3 and 6): the map's plots
 * as SVG, from the committed record in `reference/derived`. Per hold (found, fitted) and lawn (6, 10, 14 s):
 * - coverage: the striker's ball's range across (the grid's 16 ranges) and the ratio up in bins of RATIO_BIN (no finer
 *   than A7 item 9's bound, B-d8's read-out bin), each cell shaded by the best band any type's graded admissible plan
 *   reaches there (viable, edgy), or hatched where only plays that slip after the balls have gone reach it (A8 item
 *   6); the continuum's bands drawn as labelled lines (A7 item 2);
 * - effort: the mean effort of each band's default, its least complex plan, along range (`envelope-defaults.json`,
 *   bandPicks; plan C-d3).
 * And once, from `envelope-grip.json.gz` (plan Task C4; C-d4): per grip bound (least, reliable, firmest), each type's
 * plans by group (the band of the default it was picked as, the text books, the held-out draw), the share at each grip.
 * Run with `env OUT=<dir> npx --no-install tsx scripts/pushMapPlots.ts`. Not part of the engine.
 */

export {};

declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

/** A7 item 9's read-out bin (B-d8): the ratio's cells are no finer. */
const RATIO_BIN = 0.6;
/** The ratio axis's top (1): cells above it are gathered in one row. */
const RATIO_TOP = 9.6;
const LAWNS = [6, 10, 14] as const;
const TYPES = ["drive", "stop-ac", "half-roll", "full-roll", "pass-roll", "single-ball"] as const;
const HOLDS = [
    { hold: "found", prefix: "envelope" },
    { hold: "fitted", prefix: "envelope-fitted" },
] as const;

/** The continuum's bands (A7 item 2), least and most ratio, for the lines and labels. */
const BANDS = [
    { name: "pass roll", least: 0, most: 1 },
    { name: "full roll", least: 1, most: 1.2 },
    { name: "half roll", least: 1.4, most: 2.5 },
    { name: "drive", least: 3, most: 4 },
    { name: "AC stop", least: 4.1, most: 6.2 },
] as const;

/** The effort plot's series, in the palette's fixed order (dataviz reference palette, light). */
const SERIES = [
    { label: "pass roll", colour: "#2a78d6" },
    { label: "full roll", colour: "#eb6834" },
    { label: "half roll", colour: "#1baf7a" },
    { label: "drive", colour: "#eda100" },
    { label: "AC stop", colour: "#e87ba4" },
    { label: "single ball", colour: "#6250d6" },
] as const;

const INK = "#0b0b0b";
const INK_2 = "#52514e";
const MUTED = "#898781";
const GRID = "#e1e0d9";
const AXIS = "#c3c2b7";
const SURFACE = "#fcfcfb";
const VIABLE = "#1c5cab";
const EDGY = "#86b6ef";
const SLIP = "#eb6834";

interface Files {
    readFileSync(path: string): { readonly length: number };
    readFileSync(path: string, encoding: "utf8"): string;
    writeFileSync(path: string, data: string): void;
    mkdirSync(path: string, options: { recursive: true }): void;
}

interface Zlib {
    gunzipSync(data: { readonly length: number }): { toString(encoding: "utf8"): string };
}

/** A cell's best reach: 2 viable, 1 edgy, 0 only with a slip after the balls have gone; with its plans' count. */
interface Cell {
    best: number;
    count: number;
}

function escape(text: string): string {
    return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** A CSV line's fields (RFC 4180, as envelopeRows quotes them). */
function fields(line: string): string[] {
    const out: string[] = [];
    let i = 0;
    while (i <= line.length) {
        if (line[i] === '"') {
            let text = "";
            i++;
            while (i < line.length) {
                if (line[i] === '"' && line[i + 1] === '"') {
                    text += '"';
                    i += 2;
                } else if (line[i] === '"') {
                    i++;
                    break;
                } else {
                    text += line[i];
                    i++;
                }
            }
            out.push(text);
            i++;
        } else {
            const end = line.indexOf(",", i);
            const stop = end < 0 ? line.length : end;
            out.push(line.slice(i, stop));
            i = stop + 1;
        }
    }
    return out;
}

function rangeText(range: number): string {
    return range < 1 ? range.toFixed(2) : range < 10 ? range.toFixed(1) : range.toFixed(0);
}

const W = 760;
const H = 520;
const LEFT = 64;
const RIGHT = 120;
const TOP = 56;
const BOTTOM = 64;

function frame(title: string, subtitle: string, body: string, height: number = H): string {
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" ` +
        `font-family="system-ui, -apple-system, Segoe UI, sans-serif" role="img" aria-label="${escape(title)}">\n` +
        `<rect width="${W}" height="${height}" fill="${SURFACE}"/>\n` +
        `<text x="${LEFT}" y="24" font-size="15" font-weight="600" fill="${INK}">${escape(title)}</text>\n` +
        `<text x="${LEFT}" y="42" font-size="12" fill="${INK_2}">${escape(subtitle)}</text>\n${body}</svg>\n`
    );
}

/** The coverage plot of one hold and lawn. */
function coveragePlot(hold: string, lawn: number, ranges: readonly number[], cells: ReadonlyMap<string, Cell>): string {
    const rows = Math.round(RATIO_TOP / RATIO_BIN) + 1;
    const plotW = W - LEFT - RIGHT;
    const plotH = H - TOP - BOTTOM;
    const cw = plotW / ranges.length;
    const ch = plotH / rows;
    const y = (ratio: number): number => TOP + plotH - (Math.min(ratio, RATIO_TOP) / RATIO_BIN) * ch;
    const parts: string[] = [
        `<defs><pattern id="slip" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
            `<rect width="6" height="6" fill="${SURFACE}"/><rect width="2.5" height="6" fill="${SLIP}"/></pattern></defs>`,
    ];
    for (let r = 0; r <= rows; r++) {
        const yy = TOP + plotH - r * ch;
        parts.push(`<line x1="${LEFT}" x2="${LEFT + plotW}" y1="${yy}" y2="${yy}" stroke="${GRID}" stroke-width="1"/>`);
    }
    for (const [i, range] of ranges.entries()) {
        for (let r = 0; r < rows; r++) {
            const cell = cells.get(`${range}|${r}`);
            if (cell === undefined) {
                continue;
            }
            const fill = cell.best === 2 ? VIABLE : cell.best === 1 ? EDGY : "url(#slip)";
            const band = cell.best === 2 ? "viable" : cell.best === 1 ? "edgy" : "only with a slip after";
            const least = r * RATIO_BIN;
            const span =
                r === rows - 1
                    ? `${least.toFixed(1)} and above`
                    : `${least.toFixed(1)}–${(least + RATIO_BIN).toFixed(1)}`;
            parts.push(
                `<rect x="${(LEFT + i * cw + 1).toFixed(1)}" y="${(TOP + plotH - (r + 1) * ch + 1).toFixed(1)}" ` +
                    `width="${(cw - 2).toFixed(1)}" height="${(ch - 2).toFixed(1)}" rx="2" fill="${fill}">` +
                    `<title>${rangeText(range)} m, ratio ${span}: ${band}, ${cell.count} plans</title></rect>`,
            );
        }
        parts.push(
            `<text x="${(LEFT + (i + 0.5) * cw).toFixed(1)}" y="${TOP + plotH + 16}" font-size="10" ` +
                `text-anchor="middle" fill="${MUTED}">${rangeText(range)}</text>`,
        );
    }
    for (let r = 0; r < rows; r += 1) {
        const value = r * RATIO_BIN;
        parts.push(
            `<text x="${LEFT - 6}" y="${(TOP + plotH - r * ch + 4).toFixed(1)}" font-size="10" text-anchor="end" ` +
                `fill="${MUTED}">${value.toFixed(1)}</text>`,
        );
    }
    for (const band of BANDS) {
        for (const edge of [band.least, band.most]) {
            if (edge === 0) {
                continue;
            }
            const yy = y(edge).toFixed(1);
            parts.push(
                `<line x1="${LEFT}" x2="${LEFT + plotW}" y1="${yy}" y2="${yy}" stroke="${INK_2}" ` +
                    `stroke-width="1" stroke-dasharray="4 3"/>`,
            );
        }
        const mid = y((band.least + band.most) / 2);
        parts.push(
            `<text x="${LEFT + plotW + 8}" y="${(mid + 4).toFixed(1)}" font-size="11" fill="${INK_2}">` +
                `${band.name} ${band.least}–${band.most}</text>`,
        );
    }
    parts.push(
        `<line x1="${LEFT}" x2="${LEFT + plotW}" y1="${TOP + plotH}" y2="${TOP + plotH}" stroke="${AXIS}"/>`,
        `<text x="${LEFT + plotW / 2}" y="${H - 28}" font-size="12" text-anchor="middle" fill="${INK_2}">` +
            `striker's ball's range (m)</text>`,
        `<text transform="translate(16 ${TOP + plotH / 2}) rotate(-90)" font-size="12" text-anchor="middle" ` +
            `fill="${INK_2}">ratio (croqueted ÷ striker's), cells of ${RATIO_BIN}</text>`,
    );
    const legend = [
        { fill: VIABLE, text: "viable" },
        { fill: EDGY, text: "edgy" },
        { fill: "url(#slip)", text: "only with a slip after the balls have gone" },
    ];
    let lx = LEFT;
    for (const item of legend) {
        parts.push(
            `<rect x="${lx}" y="${H - 16}" width="12" height="12" rx="2" fill="${item.fill}"/>` +
                `<text x="${lx + 17}" y="${H - 6}" font-size="11" fill="${INK_2}">${escape(item.text)}</text>`,
        );
        lx += 30 + item.text.length * 6;
    }
    return frame(
        `Reachable ratios, ${lawn} s lawn, ${hold} hold`,
        "Every type's graded admissible plans; a cell's shade is the best band any plan reaches there",
        parts.join("\n"),
    );
}

/** One of envelope-defaults.json's picks, as far as the plots read it. */
interface BandPoint {
    readonly label: string;
    /** The split (rad; design A10 item 5): the plot draws the straight shot's defaults, split 0. */
    readonly split?: number;
    readonly range: number;
    readonly lawn: number;
    readonly least: BandPicked;
    readonly viable?: BandPicked | null;
}

/** A pick's plan, as far as the plots read it. */
interface BandPicked {
    readonly type: string;
    readonly band: string;
    readonly plan: unknown;
    readonly read: { readonly power: number; readonly strokeEffort: number; readonly pushEffort: number };
}

/** The effort plot of one hold and lawn: the mean effort of each band's default along range. */
function effortPlot(hold: string, lawn: number, ranges: readonly number[], picks: readonly BandPoint[]): string {
    const plotW = W - LEFT - RIGHT;
    const plotH = H - TOP - BOTTOM;
    const top = 100;
    const first = ranges[0] as number;
    const last = ranges[ranges.length - 1] as number;
    const x = (range: number): number => LEFT + (Math.log(range / first) / Math.log(last / first)) * plotW;
    const y = (effort: number): number => TOP + plotH - (effort / top) * plotH;
    const parts: string[] = [];
    for (let e = 0; e <= top; e += 20) {
        parts.push(
            `<line x1="${LEFT}" x2="${LEFT + plotW}" y1="${y(e)}" y2="${y(e)}" stroke="${e === 0 ? AXIS : GRID}"/>` +
                `<text x="${LEFT - 6}" y="${y(e) + 4}" font-size="10" text-anchor="end" fill="${MUTED}">${e}</text>`,
        );
    }
    for (const range of ranges) {
        parts.push(
            `<text x="${x(range).toFixed(1)}" y="${TOP + plotH + 16}" font-size="10" text-anchor="middle" ` +
                `fill="${MUTED}">${rangeText(range)}</text>`,
        );
    }
    for (const series of SERIES) {
        const points = picks
            .filter((p) => p.label === series.label && p.lawn === lawn && (p.split ?? 0) === 0)
            .sort((a, b) => a.range - b.range)
            .map((p) => ({ range: p.range, effort: (p.least.read.strokeEffort + p.least.read.pushEffort) / 2 }));
        if (points.length === 0) {
            continue;
        }
        const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.range).toFixed(1)},${y(p.effort).toFixed(1)}`);
        parts.push(`<path d="${path.join(" ")}" fill="none" stroke="${series.colour}" stroke-width="2"/>`);
        for (const p of points) {
            parts.push(
                `<circle cx="${x(p.range).toFixed(1)}" cy="${y(p.effort).toFixed(1)}" r="4" fill="${series.colour}" ` +
                    `stroke="${SURFACE}" stroke-width="2"><title>${series.label}, ${rangeText(p.range)} m: ` +
                    `${p.effort.toFixed(1)} %</title></circle>`,
            );
        }
    }
    parts.push(
        `<text x="${LEFT + plotW / 2}" y="${H - 28}" font-size="12" text-anchor="middle" fill="${INK_2}">` +
            `striker's ball's range (m)</text>`,
        `<text transform="translate(16 ${TOP + plotH / 2}) rotate(-90)" font-size="12" text-anchor="middle" ` +
            `fill="${INK_2}">the default's mean effort (%)</text>`,
    );
    for (const [i, series] of SERIES.entries()) {
        const ly = TOP + 8 + i * 20;
        parts.push(
            `<rect x="${LEFT + plotW + 10}" y="${ly}" width="12" height="12" rx="2" fill="${series.colour}"/>` +
                `<text x="${LEFT + plotW + 27}" y="${ly + 10}" font-size="11" fill="${INK_2}">${series.label}</text>`,
        );
    }
    return frame(
        `Each band's default's effort, ${lawn} s lawn, ${hold} hold`,
        "The mean of the stroke's and the push's effort of each band's least complex admissible plan, split 0",
        parts.join("\n"),
    );
}

/** One plan of envelope-grip.json.gz, as far as the grip plot reads it. */
interface GripRecord {
    readonly type: string;
    readonly plan: unknown;
    readonly power: number;
    readonly set: "start" | "held";
    readonly entry: {
        readonly bounds?: {
            readonly least: number | null;
            readonly firmest: number | null;
            readonly reliable: number | null;
        };
    };
}

const GRIP_BOUNDS = ["least", "reliable", "firmest"] as const;
const GRIP_GROUPS = ["viable", "edgy", "text book", "held out"] as const;

/** A grip plan's group: the band of a default it was picked as, else the text books, else the held-out draw. */
function gripGroup(record: GripRecord, picked: ReadonlyMap<string, string>): string {
    if (record.set === "held") {
        return "held out";
    }
    return picked.get(JSON.stringify([record.type, record.plan, record.power])) ?? "text book";
}

/** The grip plot of one bound: per type and group, each grip's share of the plans (the last column, no grip plays). */
function gripPlot(
    bound: (typeof GRIP_BOUNDS)[number],
    grips: readonly number[],
    records: readonly GripRecord[],
    picked: ReadonlyMap<string, string>,
): string {
    const rows: { type: string; group: string; counts: number[]; total: number }[] = [];
    for (const type of TYPES) {
        for (const group of GRIP_GROUPS) {
            const mine = records.filter((r) => r.type === type && gripGroup(r, picked) === group);
            if (mine.length === 0) {
                continue;
            }
            const counts = new Array<number>(grips.length + 1).fill(0);
            for (const r of mine) {
                const grip = r.entry.bounds?.[bound] ?? null;
                const at = grip === null ? grips.length : grips.indexOf(grip);
                const column = at < 0 ? grips.length : at;
                counts[column] = (counts[column] ?? 0) + 1;
            }
            rows.push({ type, group, counts, total: mine.length });
        }
    }
    const rowH = 18;
    const left = 150;
    const height = TOP + rows.length * rowH + BOTTOM;
    const plotW = W - left - RIGHT;
    const cw = plotW / (grips.length + 1);
    const parts: string[] = [];
    for (const [i, row] of rows.entries()) {
        const yy = TOP + i * rowH;
        const name = TYPES.indexOf(row.type as (typeof TYPES)[number]);
        parts.push(
            `<text x="${left - 8}" y="${yy + 13}" font-size="10" text-anchor="end" fill="${INK_2}">` +
                `${escape(SERIES[name]?.label ?? row.type)}, ${row.group}</text>`,
            `<text x="${left + plotW + 8}" y="${yy + 13}" font-size="10" fill="${MUTED}">${row.total} plans</text>`,
        );
        for (const [j, count] of row.counts.entries()) {
            if (count === 0) {
                continue;
            }
            const share = count / row.total;
            const grip = j === grips.length ? "no grip plays" : `grip ${(grips[j] as number).toFixed(4)}`;
            parts.push(
                `<rect x="${(left + j * cw + 1).toFixed(1)}" y="${yy + 1}" width="${(cw - 2).toFixed(1)}" ` +
                    `height="${rowH - 2}" rx="2" fill="${VIABLE}" fill-opacity="${(0.12 + 0.88 * share).toFixed(3)}">` +
                    `<title>${escape(SERIES[name]?.label ?? row.type)}, ${row.group}, ${grip}: ${count} of ` +
                    `${row.total} (${(100 * share).toFixed(0)} %)</title></rect>`,
            );
        }
    }
    for (const [j, grip] of grips.entries()) {
        if (j % 4 === 0) {
            parts.push(
                `<text x="${(left + (j + 0.5) * cw).toFixed(1)}" y="${TOP + rows.length * rowH + 16}" font-size="10" ` +
                    `text-anchor="middle" fill="${MUTED}">${grip.toFixed(2)}</text>`,
            );
        }
    }
    parts.push(
        `<text x="${(left + (grips.length + 0.5) * cw).toFixed(1)}" y="${TOP + rows.length * rowH + 16}" ` +
            `font-size="10" text-anchor="middle" fill="${MUTED}">none</text>`,
        `<text x="${left + plotW / 2}" y="${height - 28}" font-size="12" text-anchor="middle" fill="${INK_2}">` +
            `grip firmness (0 loosest, 1 firmest); a cell's shade is its share of the row's plans</text>`,
    );
    const titles = {
        least: "Loosest grip that plays",
        reliable: "Most reliable grip",
        firmest: "Firmest grip that plays",
    };
    return frame(
        titles[bound],
        "Per type and group, on the 10 s lawn: the starting plans by their default's band, the text books, the held out",
        parts.join("\n"),
        height,
    );
}

async function main(): Promise<void> {
    const out = process.env.OUT;
    if (out === undefined) {
        throw new Error("OUT names the directory to write the plots to");
    }
    // By a variable, as scripts/pushMap.ts does: the project's types have no node modules.
    const fsName = "node:fs";
    const zlibName = "node:zlib";
    const fs = (await import(/* @vite-ignore */ fsName)) as Files;
    const zlib = (await import(/* @vite-ignore */ zlibName)) as Zlib;
    fs.mkdirSync(out, { recursive: true });
    const least = JSON.parse(fs.readFileSync("reference/derived/envelope-defaults.json", "utf8")) as Record<
        string,
        readonly BandPoint[]
    >;
    const picked = new Map<string, string>();
    for (const { hold } of HOLDS) {
        for (const point of least[hold] ?? []) {
            for (const pick of [point.least, point.viable]) {
                const key = pick ? JSON.stringify([pick.type, pick.plan, pick.read.power]) : null;
                if (pick && key !== null && !picked.has(key)) {
                    picked.set(key, pick.band);
                }
            }
        }
    }
    const grip = JSON.parse(
        zlib.gunzipSync(fs.readFileSync("reference/derived/envelope-grip.json.gz")).toString("utf8"),
    ) as { header: { grips: number[] }; plans: GripRecord[] };
    for (const bound of GRIP_BOUNDS) {
        const name = `${out}/grip-${bound}.svg`;
        fs.writeFileSync(name, gripPlot(bound, grip.header.grips, grip.plans, picked));
        console.log(`written: ${name}`);
    }
    const rows = Math.round(RATIO_TOP / RATIO_BIN) + 1;
    for (const { hold, prefix } of HOLDS) {
        const cells = new Map<number, Map<string, Cell>>(LAWNS.map((l) => [l, new Map()]));
        const rangeSet = new Set<number>();
        for (const type of TYPES) {
            if (type === "single-ball") {
                continue;
            }
            const text = zlib
                .gunzipSync(fs.readFileSync(`reference/derived/${prefix}-${type}.csv.gz`))
                .toString("utf8");
            const lines = text.split("\n").filter((l) => l !== "" && !l.startsWith("#"));
            const head = fields(lines[0] as string);
            const at = (name: string): number => head.indexOf(name);
            const [iRange, iLawn, iBand, iRatio, iSlip] = ["range", "lawn", "band", "ratio", "followSlip"].map(at);
            for (const line of lines.slice(1)) {
                const f = fields(line);
                const range = Number(f[iRange as number]);
                rangeSet.add(range);
                const band = f[iBand as number];
                const ratio = Number(f[iRatio as number]);
                if ((band !== "viable" && band !== "edgy") || !Number.isFinite(ratio)) {
                    continue;
                }
                const lawnCells = cells.get(Number(f[iLawn as number]));
                if (lawnCells === undefined) {
                    continue;
                }
                const row = Math.min(rows - 1, Math.floor(ratio / RATIO_BIN));
                const best = f[iSlip as number] === "1" ? 0 : band === "viable" ? 2 : 1;
                const key = `${range}|${row}`;
                const cell = lawnCells.get(key) ?? { best: -1, count: 0 };
                cell.best = Math.max(cell.best, best);
                cell.count++;
                lawnCells.set(key, cell);
            }
        }
        const ranges = [...rangeSet].sort((a, b) => a - b);
        for (const lawn of LAWNS) {
            const name = `${out}/coverage-${hold}-${lawn}s.svg`;
            fs.writeFileSync(name, coveragePlot(hold, lawn, ranges, cells.get(lawn) as Map<string, Cell>));
            console.log(`written: ${name}`);
            const effort = `${out}/effort-${hold}-${lawn}s.svg`;
            fs.writeFileSync(effort, effortPlot(hold, lawn, ranges, least[hold] ?? []));
            console.log(`written: ${effort}`);
        }
    }
}

await main();
