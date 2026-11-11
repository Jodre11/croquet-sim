import { describe, expect, it } from "vitest";
import { encodePinned, pinnedPlays, playPinned, type PinnedPlay } from "./pinCodec";
import pinned from "./playPin.json";

interface PinnedEntry extends PinnedPlay {
    readonly sample: unknown;
}

/** The map's play pinned before it moves into src/lab (side-on viewer plan, Task 1; spec §3.1). */
describe("the pinned plays", () => {
    const entries = pinned as unknown as readonly PinnedEntry[];

    it("pins every play the codec lists, in order", () => {
        expect(entries.map(({ type, power, hold }) => ({ type, power, hold }))).toEqual(pinnedPlays());
    });

    it.each(entries.map((e) => [`${e.type} p ${e.power.toFixed(3)} hold ${e.hold}`, e] as const))(
        "%s plays bit for bit as pinned",
        (_name, entry) => {
            expect(encodePinned(playPinned(entry))).toBe(JSON.stringify(entry.sample));
        },
        600_000,
    );
});
