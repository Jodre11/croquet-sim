/**
 * The scorecard's free parameters (reality scorecard design §4): the inferred reference values with sourced bounds, and
 * the override that runs any set of them without editing reference/. Imports only the reference data, so a worker can
 * apply an override before the engine's modules read their constants at import.
 */
import { contactReference, frictionReference, malletReference } from "../../src/reference/index";
import type { ReferenceValue } from "../../src/reference/schema";

/** A free parameter: its name, the reference entry it overrides, and that entry's sourced bounds. */
export interface FreeParam {
    readonly name: string;
    readonly entry: ReferenceValue;
    readonly bounds: readonly [number, number];
}

function free(name: string, entry: ReferenceValue): FreeParam {
    if (entry.bounds === undefined) {
        throw new Error(`free parameter ${name} has no sourced bounds`);
    }
    return { name, entry, bounds: entry.bounds };
}

/**
 * Design §4's free parameters, in its table's order: fifteen until pushResponseTime retired (primed push design
 * §2.5, 2026-11-18).
 */
export const FREE_PARAMS: readonly FreeParam[] = [
    free("faceFriction", malletReference.faceFriction),
    free("ballBallFriction", frictionReference.ballBallFriction),
    free("tangentialStiffnessRatio", contactReference.tangentialStiffnessRatio),
    free("headTurfFriction", contactReference.headTurfFriction),
    free("turfYield", contactReference.turfYield),
    free("turfMatStrength", contactReference.turfMatStrength),
    free("handCouplingPeriod", contactReference.handCouplingPeriod),
    free("handCouplingDampingRatio", contactReference.handCouplingDampingRatio),
    free("armMass", contactReference.armMass),
    free("pushForce", contactReference.pushForce),
    free("pendulumForce", contactReference.pendulumForce),
    free("armHoldStiffness", contactReference.armHoldStiffness),
    free("armHoldDamping", contactReference.armHoldDamping),
    free("ballTurfSliding", frictionReference.ballTurfSliding),
];

/**
 * Parameters a card may set but the fit never frees (push body design §2.5, §3; strike pitch hold design §2.3): a
 * finite value must lie within its bounds, and Infinity is allowed as the limiting case.
 */
export const RUN_PARAMS: readonly FreeParam[] = [
    free("pushBodyMass", contactReference.pushBodyMass),
    free("strikePitchPeriod", contactReference.strikePitchPeriod),
];

/** A parameter set: free parameter name → value. */
export type Overrides = Readonly<Record<string, number>>;

/** The reference's current value of each free parameter. */
export function currentValues(): Record<string, number> {
    return Object.fromEntries(FREE_PARAMS.map((p) => [p.name, p.entry.value]));
}

/**
 * Writes `overrides` into the loaded reference data. Must run before any engine module is imported: several read
 * their values into constants at import. Throws for an unknown name or a value outside its bounds.
 */
export function applyOverrides(overrides: Overrides): void {
    for (const [name, value] of Object.entries(overrides)) {
        const free = FREE_PARAMS.find((p) => p.name === name);
        const run = RUN_PARAMS.find((p) => p.name === name);
        const param = free ?? run;
        if (param === undefined) {
            throw new Error(`unknown free parameter ${name}`);
        }
        const [lo, hi] = param.bounds;
        const limit = run !== undefined && value === Infinity;
        if (!limit && !(value >= lo - 1e-12 && value <= hi + 1e-12)) {
            throw new RangeError(`${name} ${value} lies outside its bounds [${lo}, ${hi}]`);
        }
        (param.entry as { value: number }).value = value;
    }
}
