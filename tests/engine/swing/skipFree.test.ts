import { describe, expect, it, vi } from "vitest";
import type * as Track from "../../../src/engine/impact/track";
import { simulateShot } from "../../../src/engine/shot";
import { planStroke } from "../../../src/engine/swing/buildContact";
import { defaultWorld } from "../../../src/engine/world";
import { canonicalSetup } from "../support/shot";

// While `full` is set, every prepareTrack builds the free table, whatever its caller asks: the engine as it was before
// planStroke and strokeTrajectory skipped it. `skips` counts the calls that skipped it.
const force = vi.hoisted(() => ({ full: false, skips: 0 }));

vi.mock("../../../src/engine/impact/track", async (importOriginal) => {
    const actual = await importOriginal<typeof Track>();
    return {
        ...actual,
        prepareTrack: (...[drive, head, gravity, withFree]: Parameters<typeof actual.prepareTrack>) => {
            const free = force.full || withFree !== false;
            if (!free) {
                force.skips += 1;
            }
            return actual.prepareTrack(drive, head, gravity, free);
        },
    };
});

const WORLD = defaultWorld();

/** `run` with the free table skipped where its callers ask, then built everywhere; and how many calls skipped it. */
function bothWays<T>(run: () => T): { readonly skipped: T; readonly built: T; readonly skips: number } {
    force.full = false;
    force.skips = 0;
    const skipped = run();
    const { skips } = force;
    force.full = true;
    try {
        return { skipped, built: run(), skips };
    } finally {
        force.full = false;
    }
}

describe("skipping the free table where nothing reads it", () => {
    it.each(["single-ball", "full-roll"] as const)("leaves %s's planned contact bit-identical", (type) => {
        const setup = canonicalSetup(type, { world: WORLD });
        const { skipped, built, skips } = bothWays(() => planStroke(setup, WORLD));
        expect(skips).toBe(1);
        expect(skipped).toEqual(built);
    });

    it.each(["single-ball", "full-roll"] as const)("leaves %s's trajectory bit-identical", (type) => {
        const setup = canonicalSetup(type, { world: WORLD });
        const { skipped, built, skips } = bothWays(() => simulateShot(setup, WORLD, { trajectory: true }).trajectory);
        // planStroke's and strokeTrajectory's.
        expect(skips).toBe(2);
        expect(skipped).toBeDefined();
        expect(skipped).toEqual(built);
    });
});
