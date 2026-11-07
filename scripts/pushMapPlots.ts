/**
 * Plan Task B8 (Task 10 restated over one continuum; design §9, A7 items 2, 7 and 9, A8 items 3 and 6): the map's plots
 * as SVG, from the committed record in `reference/derived`. Per hold (found, fitted) and lawn (6, 10, 14 s):
 * - coverage: the striker's ball's range across (the grid's 16 ranges) and the ratio up in bins of RATIO_BIN (no finer
 *   than A7 item 9's bound, B-d8's read-out bin), each cell shaded by the best band any type's graded admissible plan
 *   reaches there (viable, edgy), or hatched where only plays that slip after the balls have gone reach it (A8 item
 *   6); the continuum's bands drawn as labelled lines (A7 item 2);
 * - effort: each band's least mean effort along range (`envelope-least-effort.json`, bandPicks).
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

function frame(title: string, subtitle: string, body: string): string {
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" ` +
        `font-family="system-ui, -apple-system, Segoe UI, sans-serif" role="img" aria-label="${escape(title)}">\n` +
        `<rect width="${W}" height="${H}" fill="${SURFACE}"/>\n` +
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

/** One of envelope-least-effort.json's picks, as far as the effort plot reads it. */
interface BandPoint {
    readonly label: string;
    readonly range: number;
    readonly lawn: number;
    readonly least: { readonly read: { readonly strokeEffort: number; readonly pushEffort: number } };
}

/** The effort plot of one hold and lawn: each band's least mean effort along range. */
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
            .filter((p) => p.label === series.label && p.lawn === lawn)
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
            `fill="${INK_2}">least mean effort (%)</text>`,
    );
    for (const [i, series] of SERIES.entries()) {
        const ly = TOP + 8 + i * 20;
        parts.push(
            `<rect x="${LEFT + plotW + 10}" y="${ly}" width="12" height="12" rx="2" fill="${series.colour}"/>` +
                `<text x="${LEFT + plotW + 27}" y="${ly + 10}" font-size="11" fill="${INK_2}">${series.label}</text>`,
        );
    }
    return frame(
        `Least effort per band, ${lawn} s lawn, ${hold} hold`,
        "Each band's least mean of the stroke's and the push's effort, over every type's admissible plans",
        parts.join("\n"),
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
    const least = JSON.parse(fs.readFileSync("reference/derived/envelope-least-effort.json", "utf8")) as Record<
        string,
        readonly BandPoint[]
    >;
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
