/**
 * Runtime validation for hand-curated reference data (reference/*.json). Every physical constant the app uses
 * must carry a source; malformed entries fail at load time with the offending path in the message.
 */

/** How a value was obtained: stated by the source, taken from an analogous domain, or derived from sourced facts. */
export type Provenance = "direct" | "analogue" | "derived";

/** Attribution carried by every reference entry. */
export interface Sourced {
    readonly source: string;
    readonly provenance: Provenance;
    readonly note?: string;
    /** "placeholder": a labelled stand-in until data or a fit replaces it (P2b.2b.2a design §6.2). */
    readonly provisional?: "placeholder";
}

/** A sourced numeric value in SI units, optionally with plausible bounds. */
export interface ReferenceValue extends Sourced {
    readonly value: number;
    readonly unit: string;
    readonly bounds?: readonly [number, number];
}

/** A sourced verbatim quotation, used for rules from the Laws. */
export interface ReferenceQuote extends Sourced {
    readonly quote: string;
}

/** Raised when reference data is malformed or unsourced. */
export class ReferenceDataError extends Error {
    constructor(path: string, problem: string) {
        super(`Reference data ${path}: ${problem}`);
        this.name = "ReferenceDataError";
    }
}

const PROVENANCES: readonly string[] = ["direct", "analogue", "derived"];

function isRecord(x: unknown): x is Record<string, unknown> {
    return typeof x === "object" && x !== null && !Array.isArray(x);
}

function entry(section: unknown, key: string, path: string): unknown {
    if (!isRecord(section) || !(key in section)) {
        throw new ReferenceDataError(`${path}.${key}`, "missing");
    }
    return section[key];
}

/** Reads a finite number field. */
export function readNumber(section: unknown, key: string, path: string): number {
    const value = entry(section, key, path);
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new ReferenceDataError(`${path}.${key}`, "must be a finite number");
    }
    return value;
}

/** Reads a non-blank string field. */
export function readString(section: unknown, key: string, path: string): string {
    const value = entry(section, key, path);
    if (typeof value !== "string" || value.trim() === "") {
        throw new ReferenceDataError(`${path}.${key}`, "must be a non-empty string");
    }
    return value;
}

/** Reads an array field. */
export function readArray(section: unknown, key: string, path: string): readonly unknown[] {
    const value = entry(section, key, path);
    if (!Array.isArray(value)) {
        throw new ReferenceDataError(`${path}.${key}`, "must be an array");
    }
    return value;
}

/** Reads the attribution fields of an entry. */
export function readSourced(section: unknown, path: string): Sourced {
    if (!isRecord(section)) {
        throw new ReferenceDataError(path, "must be an object");
    }
    const source = readString(section, "source", path);
    const provenance = readString(section, "provenance", path);
    if (!PROVENANCES.includes(provenance)) {
        throw new ReferenceDataError(`${path}.provenance`, `must be one of ${PROVENANCES.join(", ")}`);
    }
    let sourced: Sourced = { source, provenance: provenance as Provenance };
    if ("note" in section) {
        sourced = { ...sourced, note: readString(section, "note", path) };
    }
    if ("provisional" in section) {
        if (readString(section, "provisional", path) !== "placeholder") {
            throw new ReferenceDataError(`${path}.provisional`, 'must be "placeholder"');
        }
        sourced = { ...sourced, provisional: "placeholder" };
    }
    return sourced;
}

/** Reads a sourced numeric value, checking it lies within its bounds when bounds are given. */
export function readValue(section: unknown, key: string, path: string): ReferenceValue {
    const item = entry(section, key, path);
    const itemPath = `${path}.${key}`;
    const value = readNumber(item, "value", itemPath);
    const unit = readString(item, "unit", itemPath);
    const result: ReferenceValue = { value, unit, ...readSourced(item, itemPath) };
    if (!isRecord(item) || !("bounds" in item)) {
        return result;
    }
    const bounds = readArray(item, "bounds", itemPath);
    const [lo, hi] = bounds;
    if (bounds.length !== 2 || typeof lo !== "number" || typeof hi !== "number" || !(lo <= hi)) {
        throw new ReferenceDataError(`${itemPath}.bounds`, "must be [lo, hi] with lo ≤ hi");
    }
    if (value < lo || value > hi) {
        throw new ReferenceDataError(itemPath, `value ${value} lies outside bounds [${lo}, ${hi}]`);
    }
    return { ...result, bounds: [lo, hi] };
}

/** Reads a sourced verbatim quotation. */
export function readQuote(section: unknown, key: string, path: string): ReferenceQuote {
    const item = entry(section, key, path);
    const itemPath = `${path}.${key}`;
    return { quote: readString(item, "quote", itemPath), ...readSourced(item, itemPath) };
}
