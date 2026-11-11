/**
 * The viewer's Runs (side-on viewer spec §2, §3.2, decision 8; gate ruling 1): the found hold, as the record played
 * its defaults, unless the player stepped the grip; one play in a Web Worker, and a newer Run superseding an older one.
 */
import { playFrames, type FramedPlay } from "../lab/frames";
import { playSample, type MapPlan, type MapSample, type MapType } from "../lab/index";

/**
 * A Run's grip: the found hold, its firmness known where the record played this set-up (an unchanged default) and
 * null where it must be searched; or a firmness the player stepped to.
 */
export type RunGrip =
    | { readonly source: "found"; readonly firmness: number | null }
    | { readonly source: "player"; readonly firmness: number };

/** What a Run asks for: the set-up, the lawn (s) read, and the grip. */
export interface RunRequest {
    readonly type: MapType;
    readonly plan: MapPlan;
    readonly power: number;
    readonly lawn: number;
    readonly grip: RunGrip;
}

/** A Run's play: its frames at `firmness`, and whether the search found that grip. */
export interface RunResult {
    readonly framed: FramedPlay;
    readonly firmness: number;
    readonly searched: boolean;
}

/** The plays a Run makes (the lab's, or a test's). */
export interface RunPlays {
    frames(type: MapType, plan: MapPlan, power: number, firmness: number, lawn: number): FramedPlay;
    found(type: MapType, plan: MapPlan, power: number, lawn: number): MapSample;
}

const LAB: RunPlays = {
    frames: playFrames,
    found: (type, plan, power, lawn) => playSample(type, plan, power, [lawn], "found"),
};

/**
 * `request` played (spec §2, gate ruling 1): at its grip where that is known, the player's or the found hold's
 * recorded firmness; else the found-hold search (`onSearch` told first) and its grip played, σ_max (firmness 1) where
 * none plays. A play at the found firmness is the search's own play (both set `stroke.holdFirmness`).
 */
export function runPlay(request: RunRequest, onSearch: () => void = () => {}, plays: RunPlays = LAB): RunResult {
    const { type, plan, power, lawn, grip } = request;
    if (grip.firmness !== null) {
        return {
            framed: plays.frames(type, plan, power, grip.firmness, lawn),
            firmness: grip.firmness,
            searched: false,
        };
    }
    onSearch();
    const firmness = plays.found(type, plan, power, lawn).firmness ?? 1;
    return { framed: plays.frames(type, plan, power, firmness, lawn), firmness, searched: true };
}

/** A worker as the runner uses it (a Web Worker, or a test's fake). */
export interface WorkerLike {
    postMessage(message: unknown): void;
    terminate(): void;
    onmessage: ((event: { readonly data: unknown }) => void) | null;
    onerror: ((event: { readonly message?: string }) => void) | null;
}

/** The runner's message to the worker. */
export interface RunMessage {
    readonly id: number;
    readonly request: RunRequest;
}

/** The worker's replies. */
export type RunReply =
    | { readonly id: number; readonly kind: "searching" }
    | { readonly id: number; readonly kind: "done"; readonly result: RunResult }
    | { readonly id: number; readonly kind: "error"; readonly message: string };

/** createRunner's runner. */
export interface Runner {
    /** Plays `request`; resolves "superseded" where a newer run starts first. `onSearch` is told when a search starts. */
    run(request: RunRequest, onSearch?: () => void): Promise<RunResult | "superseded">;
    /** Supersedes any run and terminates the worker. */
    dispose(): void;
}

/**
 * A runner over workers from `spawn` (spec §3.2): a run posts to the worker; a newer run while one is in flight
 * resolves the older "superseded", terminates its worker and spawns a fresh one, so a long search never delays what
 * the player asked for next.
 */
export function createRunner(spawn: () => WorkerLike): Runner {
    let worker: WorkerLike | null = null;
    let pending: {
        readonly id: number;
        readonly resolve: (result: RunResult | "superseded") => void;
        readonly reject: (error: Error) => void;
        readonly onSearch: () => void;
    } | null = null;
    let nextId = 0;
    const supersede = (): void => {
        if (pending !== null) {
            pending.resolve("superseded");
            pending = null;
            worker?.terminate();
            worker = null;
        }
    };
    const open = (): WorkerLike => {
        const w = spawn();
        w.onmessage = (event) => {
            const reply = event.data as RunReply;
            if (pending === null || reply.id !== pending.id) {
                return;
            }
            if (reply.kind === "searching") {
                pending.onSearch();
                return;
            }
            const done = pending;
            pending = null;
            if (reply.kind === "done") {
                done.resolve(reply.result);
            } else {
                done.reject(new Error(reply.message));
            }
        };
        w.onerror = (event) => {
            const failed = pending;
            pending = null;
            worker?.terminate();
            worker = null;
            failed?.reject(new Error(event.message ?? "the worker failed"));
        };
        return w;
    };
    return {
        run(request, onSearch = () => {}) {
            supersede();
            worker ??= open();
            const id = ++nextId;
            const target = worker;
            return new Promise((resolve, reject) => {
                pending = { id, resolve, reject, onSearch };
                target.postMessage({ id, request } satisfies RunMessage);
            });
        },
        dispose() {
            supersede();
            worker?.terminate();
            worker = null;
        },
    };
}
