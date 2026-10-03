/**
 * Impact digest: every number the impact produces, at full precision, for a refactor's before/after diff. Covers the
 * shared scenarios step by step (every probe snapshot) and the fuzz's strokes (final results), all on the test
 * world. Two runs on the same engine version must print identical output; a refactor meant to be bit-identical must
 * too.
 * Run with `npx --yes tsx scripts/impactDigest.ts > before.txt`; environment: STROKES (fuzz strokes, default 200).
 * Not part of the test suite.
 */
import { simulateImpact } from "../src/engine/impact/simulateImpact";
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

const TEST_WORLD = testWorld();

for (const s of SCENARIOS) {
    const probe = recorder();
    const result = simulateImpact(s.contact, s.balls, TEST_WORLD, { probe });
    console.log(`scenario ${s.name} test-world ${exact(result)}`);
    probe.snapshots.forEach((snapshot, i) => {
        console.log(`scenario ${s.name} step ${i} ${exact(snapshot)}`);
    });
}

const random = rng(FUZZ_SEED);
for (let n = 0; n < STROKES; n++) {
    const { contact, balls } = randomStroke(random, TEST_WORLD);
    console.log(`fuzz ${n} ${exact(simulateImpact(contact, balls, TEST_WORLD))}`);
}
