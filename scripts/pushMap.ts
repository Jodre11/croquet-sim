/**
 * The rolls' push map (P2b.2b.2c.3b design; plan `docs/superpowers/plans/2026-10-29-p2b2b2c3b-push-map.md`): the
 * shards that play each roll type's grid, and the probe sections that read them. Recorded, not gated. Sections:
 * - lawn: plan decision 3, whether the impact depends on the lawn's speed: for each roll's canonical setup on the
 *   open lawn, the largest change in any handed-over ball's velocity between the 6 s and 14 s lawns' impacts and the
 *   10 s lawn's (impactLawnShift).
 * Run with `env SECTION=lawn npx --yes tsx scripts/pushMap.ts`; environment: SECTION (a section's name).
 * Not part of the test suite.
 */
import { simulateImpact } from "../src/engine/impact/simulateImpact";
import { length, sub } from "../src/engine/math/vec3";
import { planStroke } from "../src/engine/swing/buildContact";
import type { ShotSetup } from "../src/engine/swing/types";
import { BALL_IDS, type BallState, type BallStates } from "../src/engine/types";
import { canonicalSetup } from "../tests/engine/support/shot";
import { openWorld, opened } from "./openLawn";

declare const process: {
    readonly env: Readonly<Record<string, string | undefined>>;
    readonly argv: readonly string[];
};

/** The lawns the map plays (s): `reference/lawn.json`'s sourced span and its normal lawn (design §3.2). */
export const MAP_LAWNS: readonly number[] = [6, 10, 14];

/** The rolls, the map's three types (design §1). */
const ROLLS = ["half-roll", "full-roll", "pass-roll"] as const;

/**
 * Numerical, not physical: the largest handover shift (m/s) below which one impact serves every lawn (plan decision
 * 3); a double's round-off on speeds of order 1 m/s, far below any physical effect.
 */
export const LAWN_SHIFT_LIMIT = 1e-9;

/** The handover of `setup`'s impact on the open lawn of `lawnSpeed` (s). */
function handoverOn(setup: ShotSetup, lawnSpeed: number): BallStates {
    const world = openWorld(lawnSpeed);
    return simulateImpact(planStroke(setup, world).contact, setup.balls, world).handover;
}

/**
 * The largest |Δv| (m/s) over `setup`'s handed-over balls between the impacts on the 6 s and 14 s open lawns and the
 * impact on the 10 s open lawn (plan decision 3): 0 when the lawn's speed leaves the impact untouched. `setup` must
 * already stand on the open lawn (`opened`).
 */
export function impactLawnShift(setup: ShotSetup): number {
    const base = handoverOn(setup, 10);
    let largest = 0;
    for (const lawn of [6, 14]) {
        const other = handoverOn(setup, lawn);
        for (const id of BALL_IDS) {
            const a = base[id];
            const b = other[id];
            if (a === undefined || b === undefined) {
                continue;
            }
            largest = Math.max(largest, length(sub((a as BallState).velocity, (b as BallState).velocity)));
        }
    }
    return largest;
}

function sectionLawn(): void {
    console.log(
        "== lawn. Plan decision 3: for each roll's canonical setup on the open lawn, the largest change (m/s) in any " +
            "handed-over ball's velocity between the 6 s and 14 s lawns' impacts and the 10 s lawn's ==",
    );
    let shared = true;
    for (const type of ROLLS) {
        const shift = impactLawnShift(opened(canonicalSetup(type)));
        shared &&= shift < LAWN_SHIFT_LIMIT;
        console.log(`${type}: ${shift.toExponential(3)} m/s`);
    }
    console.log(
        `lawn tally: ${shared ? "shared impact" : "per-lawn impacts"} (every shift ` +
            `${shared ? "below" : "not below"} ${LAWN_SHIFT_LIMIT} m/s)`,
    );
}

const SECTIONS: Readonly<Record<string, () => void>> = {
    lawn: sectionLawn,
};

if (process.argv[1]?.endsWith("pushMap.ts")) {
    const name = process.env.SECTION ?? "";
    const section = SECTIONS[name];
    if (section === undefined) {
        throw new Error(`SECTION must be one of ${Object.keys(SECTIONS).join(", ")}`);
    }
    section();
}
