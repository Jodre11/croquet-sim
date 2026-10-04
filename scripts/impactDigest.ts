/**
 * Impact digest: every number the impact produces, at full precision, for a refactor's before/after diff. Covers the
 * shared scenarios step by step (every probe snapshot) and the fuzz's strokes (final results), all on the test
 * world. Two runs on the same engine version must print identical output; a refactor meant to be bit-identical must
 * too.
 * Lines starting `timeline ` carry fields added after P2b.1; every other line keeps P2b.1's format, so
 * `grep -v '^timeline '` of a later run is byte-comparable with P2b.1's digest.
 * Run with `npx --yes tsx scripts/impactDigest.ts > before.txt`; environment: STROKES (fuzz strokes, default 200).
 * Not part of the test suite.
 */
import { simulateImpact } from "../src/engine/impact/simulateImpact";
import type { ImpactResult } from "../src/engine/impact/types";
import { testWorld } from "../tests/engine/support/fixtures";
import { FUZZ_SEED, SCENARIOS, randomStroke, recorder } from "../tests/engine/support/impact";
import { rng } from "../tests/engine/support/rng";

// The project has no Node types; this script runs under tsx and reads only its environment.
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

const STROKES = Number(process.env.STROKES ?? "200");

/** JSON with every number in its shortest round-trip form, and −0, NaN and ±Infinity kept distinct. */
function exact(value: unknown): string {
    return JSON.stringify(value, (_key, v: unknown) => {
        if (typeof v !== "number") {
            return v;
        }
        if (Object.is(v, -0)) {
            return "-0";
        }
        return Number.isFinite(v) ? v : String(v);
    });
}

/** The fields P2b.1's results had, in its order. Later fields print on their own `timeline` lines. */
function p2b1(result: ImpactResult): unknown {
    const { balls, head, duration, events, peakPenetration, steps, handover, overlapCorrection } = result;
    return { balls, head, duration, events, peakPenetration, steps, handover, overlapCorrection };
}

/** The fields added after P2b.1, printed on their own `timeline` lines. */
function later(result: ImpactResult): unknown {
    return { timeline: result.timeline, touchingAtStart: result.touchingAtStart };
}

const TEST_WORLD = testWorld();

for (const s of SCENARIOS) {
    const probe = recorder();
    const result = simulateImpact(s.contact, s.balls, TEST_WORLD, { probe });
    console.log(`scenario ${s.name} test-world ${exact(p2b1(result))}`);
    console.log(`timeline scenario ${s.name} ${exact(later(result))}`);
    probe.snapshots.forEach((snapshot, i) => {
        console.log(`scenario ${s.name} step ${i} ${exact(snapshot)}`);
    });
}

const random = rng(FUZZ_SEED);
for (let n = 0; n < STROKES; n++) {
    const { contact, balls } = randomStroke(random, TEST_WORLD);
    const result = simulateImpact(contact, balls, TEST_WORLD);
    console.log(`fuzz ${n} ${exact(p2b1(result))}`);
    console.log(`timeline fuzz ${n} ${exact(later(result))}`);
}
