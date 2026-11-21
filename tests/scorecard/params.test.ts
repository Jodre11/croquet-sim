import { afterEach, describe, expect, it } from "vitest";
import { applyOverrides, currentValues } from "../../scripts/scorecard/params";
import { contactReference } from "../../src/reference/index";

const reference = contactReference.pushBodyMass.value;

describe("the scorecard's run-only parameters (push body design §2.5, §3)", () => {
    afterEach(() => {
        (contactReference.pushBodyMass as { value: number }).value = reference;
    });

    it("sets pushBodyMass to Infinity, the limiting case", () => {
        applyOverrides({ pushBodyMass: Infinity });
        expect(contactReference.pushBodyMass.value).toBe(Infinity);
    });

    it("sets pushBodyMass within its bounds and refuses a finite value outside them", () => {
        applyOverrides({ pushBodyMass: 4.9 });
        expect(contactReference.pushBodyMass.value).toBe(4.9);
        expect(() => applyOverrides({ pushBodyMass: 10 })).toThrow(RangeError);
    });

    it("keeps pushBodyMass out of the fit's free parameters", () => {
        expect(Object.keys(currentValues())).not.toContain("pushBodyMass");
    });
});
