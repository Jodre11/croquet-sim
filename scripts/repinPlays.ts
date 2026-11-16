/**
 * Regenerates `tests/lab/playPin.json` (roll launch plan, Task 2): every pinned play (pinnedPlays) played afresh and
 * written with its sample's bits kept (encodePinned), in the file's shape. Run after a deliberate engine change with
 * `npx --no-install tsx scripts/repinPlays.ts`. Not part of the test suite.
 */
import { encodePinned, pinnedPlays, playPinned } from "../tests/lab/pinCodec";

/** The pinned plays' file, from the repository root. */
const OUT = "tests/lab/playPin.json";

interface Fs {
    writeFileSync(path: string, data: string): void;
}

/** Plays every pinned play and writes the file. */
async function main(): Promise<void> {
    const load = async (name: string): Promise<unknown> => import(/* @vite-ignore */ name);
    const fs = (await load("node:fs")) as Fs;
    const entries = pinnedPlays().map((play) => ({
        type: play.type,
        power: play.power,
        hold: play.hold,
        sample: JSON.parse(encodePinned(playPinned(play))) as unknown,
    }));
    fs.writeFileSync(OUT, `${JSON.stringify(entries, null, 4)}\n`);
    console.log(`${entries.length} plays written to ${OUT}`);
}

void main();
