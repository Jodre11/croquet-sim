import { describe, expect, it } from "vitest";
import { ReferenceDataError, readArray, readFit, readQuote, readValue } from "../../src/reference/schema";

const good = {
    diameter: { value: 0.09, unit: "m", bounds: [0.08, 0.1], source: "Some Laws, Rule 1", provenance: "direct" },
    rule: { quote: "A ball is out when…", source: "Some Laws, Rule 2", provenance: "direct", note: "context" },
    list: [1, 2],
};

describe("readValue", () => {
    it("returns a valid sourced value", () => {
        expect(readValue(good, "diameter", "ball")).toEqual(good.diameter);
    });

    it.each([
        ["missing entry", {}],
        ["non-numeric value", { diameter: { ...good.diameter, value: "0.09" } }],
        ["empty unit", { diameter: { ...good.diameter, unit: "" } }],
        ["empty source", { diameter: { ...good.diameter, source: " " } }],
        ["unknown provenance", { diameter: { ...good.diameter, provenance: "guessed" } }],
        ["inverted bounds", { diameter: { ...good.diameter, bounds: [0.1, 0.08] } }],
        ["value outside bounds", { diameter: { ...good.diameter, value: 0.2 } }],
        ["non-string note", { diameter: { ...good.diameter, note: 3 } }],
    ])("rejects %s", (_label, section) => {
        expect(() => readValue(section, "diameter", "ball")).toThrow(ReferenceDataError);
    });

    it("names the offending path in the error", () => {
        expect(() => readValue({}, "diameter", "ball")).toThrow(/ball\.diameter/);
    });

    it("reads a placeholder's provisional mark and rejects any other", () => {
        const placeholder = { diameter: { ...good.diameter, provisional: "placeholder" } };
        expect(readValue(placeholder, "diameter", "ball").provisional).toBe("placeholder");
        expect(readValue(good, "diameter", "ball")).not.toHaveProperty("provisional");
        const other = { diameter: { ...good.diameter, provisional: "guess" } };
        expect(() => readValue(other, "diameter", "ball")).toThrow(/provisional/);
    });
});

describe("readFit", () => {
    const fit = {
        form: "y = a + b·x",
        coefficients: { a: 1, b: 2 },
        range: [0, 1],
        rangeUnit: "m",
        source: "s",
        provenance: "direct",
    };

    it("reads a fit's form, its named coefficients and its range", () => {
        const read = readFit({ f: fit }, "f", "t", ["a", "b"]);
        expect(read.coefficients).toEqual({ a: 1, b: 2 });
        expect(read.range).toEqual([0, 1]);
        expect(read.form).toBe("y = a + b·x");
    });

    it("rejects a missing coefficient, naming it, and a range with lo ≥ hi", () => {
        expect(() => readFit({ f: fit }, "f", "t", ["a", "c"])).toThrow(/t\.f\.coefficients\.c/);
        expect(() => readFit({ f: { ...fit, range: [1, 1] } }, "f", "t", ["a"])).toThrow(/range/);
    });
});

describe("readQuote and readArray", () => {
    it("returns a valid quote", () => {
        expect(readQuote(good, "rule", "laws")).toEqual(good.rule);
    });

    it("rejects an empty quote", () => {
        expect(() => readQuote({ rule: { ...good.rule, quote: "" } }, "rule", "laws")).toThrow(ReferenceDataError);
    });

    it("reads arrays and rejects non-arrays", () => {
        expect(readArray(good, "list", "x")).toEqual([1, 2]);
        expect(() => readArray(good, "rule", "x")).toThrow(ReferenceDataError);
    });
});
