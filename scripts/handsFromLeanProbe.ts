/**
 * The hands-from-lean measurements (docs/superpowers/plans/2026-11-12-hands-from-lean.md Task 6): each map type's
 * text book at its canonical power on the 10 s lawn, at the preset and the found hold, with its hands; and the pass
 * roll's lowest head point in its follow-through. Not part of the engine. Run with
 * `nice -n 10 npx --no-install tsx scripts/handsFromLeanProbe.ts`.
 */
import { MAP_TYPES, canonicalPower, openWorld, playSample, textBook } from "../src/lab/index";
import { playFrames } from "../src/lab/frames";
import { HOLD_FIRMNESS, defaultProfile } from "../src/engine/swing/profile";

const lawn = openWorld(10);
for (const type of MAP_TYPES) {
    const plan = textBook(type);
    const power = canonicalPower(type, lawn);
    const stance = defaultProfile.stance[type];
    for (const hold of ["preset", "found"] as const) {
        const s = playSample(type, plan, power, [10], hold);
        console.log(
            `${type} lean ${((plan.lean * 180) / Math.PI).toFixed(2)}° hands top ${stance.top.toFixed(4)} bottom ` +
                `${stance.bottom.toFixed(4)} power ${power.toFixed(4)} hold ${hold}: class ${s.klass ?? "clean"}` +
                ` ratio ${s.byLawn[10]?.ratio?.toFixed(4) ?? "-"} passes ${s.passes} firmness ${s.firmness ?? "-"}` +
                `${s.reason === undefined ? "" : ` reason ${s.reason}`}`,
        );
    }
}
const pass = textBook("pass-roll");
const framed = playFrames("pass-roll", pass, canonicalPower("pass-roll", lawn), HOLD_FIRMNESS["pass-roll"]);
const follow = framed.frames.filter((f) => f.t > framed.impactEnd);
const lowest = Math.min(...follow.map((f) => f.low));
console.log(`pass-roll follow-through: lowest head point ${(lowest * 1000).toFixed(2)} mm, flags ${framed.flags}`);
