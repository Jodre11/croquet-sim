import { describe, expect, it } from "vitest";
import { ReferenceDataError, readArray, readQuote, readValue } from "../../src/reference/schema";

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
