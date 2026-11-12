import { describe, expect, it } from "vitest";
import type { FramedPlay } from "../../src/lab/frames";
import { textBook, type MapClass, type MapSample } from "../../src/lab/index";
import { createRunner, runPlay, type RunPlays, type RunRequest, type WorkerLike } from "../../src/viewer/runner";

const REQUEST: RunRequest = {
    type: "pass-roll",
    plan: textBook("pass-roll"),
    power: 0.6,
    lawn: 10,
    grip: { firmness: null, source: "found" },
};

/** A fake worker: it records what it is sent and whether it was terminated. */
class FakeWorker implements WorkerLike {
    readonly sent: unknown[] = [];
    terminated = false;
    onmessage: WorkerLike["onmessage"] = null;
    onerror: WorkerLike["onerror"] = null;
    postMessage(message: unknown): void {
        this.sent.push(message);
    }
    terminate(): void {
        this.terminated = true;
    }
    reply(data: unknown): void {
        this.onmessage?.({ data });
    }
}

/** Plays that fail at every grip but `plays`, counting the frames played and the searches. */
function fakePlays(plays: number): RunPlays & { readonly calls: { frames: number[]; found: number } } {
    const calls = { frames: [] as number[], found: 0 };
    const sample = (klass: MapClass | null, firmness: number | null): MapSample =>
        ({ klass, firmness }) as unknown as MapSample;
    return {
        calls,
        frames(_type, _plan, _power, firmness) {
            calls.frames.push(firmness);
            return { sample: sample(firmness === plays ? null : "mishit", firmness), rejected: null } as FramedPlay;
        },
        found() {
            calls.found++;
            return sample(null, plays);
        },
    };
}

describe("runPlay (spec §2, decision 8; gate ruling 1)", () => {
    it("plays the found hold at its recorded firmness without a search", () => {
        const plays = fakePlays(0.4);
        let told = 0;
        const result = runPlay({ ...REQUEST, grip: { firmness: 0.4, source: "found" } }, () => told++, plays);
        expect(plays.calls).toEqual({ frames: [0.4], found: 0 });
        expect(told).toBe(0);
        expect(result.searched).toBe(false);
        expect(result.firmness).toBe(0.4);
    });

    it("searches for the found hold where its firmness is unknown, and plays the grip found", () => {
        const plays = fakePlays(0.4);
        let told = 0;
        const result = runPlay(REQUEST, () => told++, plays);
        expect(plays.calls).toEqual({ frames: [0.4], found: 1 });
        expect(told).toBe(1);
        expect(result.searched).toBe(true);
        expect(result.firmness).toBe(0.4);
        expect(result.framed.sample.klass).toBeNull();
    });

    it("never searches a grip the player stepped to: the fault is shown", () => {
        const plays = fakePlays(0.4);
        const result = runPlay({ ...REQUEST, grip: { firmness: 0.25, source: "player" } }, () => {}, plays);
        expect(plays.calls).toEqual({ frames: [0.25], found: 0 });
        expect(result.searched).toBe(false);
        expect(result.framed.sample.klass).toBe("mishit");
    });

    it("plays σ_max where the search finds no grip", () => {
        const plays = fakePlays(0.4);
        plays.found = () => ({ klass: "mishit", firmness: null }) as unknown as MapSample;
        expect(runPlay(REQUEST, () => {}, plays).firmness).toBe(1);
    });
});

describe("runPlay's extras (hands-from-lean design §5.2)", () => {
    /** Plays recording the extras each receives; the search finds firmness 0.4. */
    const recording = (): RunPlays & { readonly seen: unknown[] } => {
        const seen: unknown[] = [];
        return {
            seen,
            frames(_type, _plan, _power, firmness, _lawn, extras) {
                seen.push(["frames", extras]);
                return { sample: { klass: null, firmness }, rejected: null } as unknown as FramedPlay;
            },
            found(_type, _plan, _power, _lawn, extras) {
                seen.push(["found", extras]);
                return { klass: null, firmness: 0.4 } as unknown as MapSample;
            },
        };
    };

    it("hands the request's extras to the search and the play", () => {
        const plays = recording();
        const extras = { bottomGrip: 0.5, followThrough: 0.1 };
        runPlay({ ...REQUEST, extras }, () => {}, plays);
        expect(plays.seen).toEqual([
            ["found", extras],
            ["frames", extras],
        ]);
    });

    it("hands none as {} where the request has none", () => {
        const plays = recording();
        runPlay(REQUEST, () => {}, plays);
        expect(plays.seen).toEqual([
            ["found", {}],
            ["frames", {}],
        ]);
    });
});

describe("createRunner (spec §3.2)", () => {
    it("resolves an older run as superseded by a newer one, terminating its worker", async () => {
        const workers: FakeWorker[] = [];
        const runner = createRunner(() => {
            const w = new FakeWorker();
            workers.push(w);
            return w;
        });
        const first = runner.run(REQUEST);
        const second = runner.run({ ...REQUEST, power: 0.7 });
        expect(await first).toBe("superseded");
        expect(workers.length).toBe(2);
        expect((workers[0] as FakeWorker).terminated).toBe(true);
        const fresh = workers[1] as FakeWorker;
        const { id } = fresh.sent[0] as { id: number };
        let searching = 0;
        const third = runner.run({ ...REQUEST, power: 0.8 }, () => searching++);
        expect(await second).toBe("superseded");
        const last = workers[2] as FakeWorker;
        const next = (last.sent[0] as { id: number }).id;
        // A reply for a superseded run is ignored.
        last.reply({ id, kind: "done", result: "stale" });
        last.reply({ id: next, kind: "searching" });
        last.reply({ id: next, kind: "done", result: "fresh" });
        expect(await third).toBe("fresh");
        expect(searching).toBe(1);
    });

    it("reuses an idle worker", async () => {
        const workers: FakeWorker[] = [];
        const runner = createRunner(() => {
            const w = new FakeWorker();
            workers.push(w);
            return w;
        });
        const first = runner.run(REQUEST);
        (workers[0] as FakeWorker).reply({ id: 1, kind: "done", result: "one" });
        expect(await first).toBe("one");
        const second = runner.run(REQUEST);
        (workers[0] as FakeWorker).reply({ id: 2, kind: "error", message: "boom" });
        await expect(second).rejects.toThrow("boom");
        expect(workers.length).toBe(1);
    });
});
