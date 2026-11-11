/**
 * The viewer's Web Worker (side-on viewer spec §3.2): plays each Run it is sent (runPlay) and replies with the result,
 * telling the page first when a search starts.
 */
import { runPlay, type RunMessage, type RunReply } from "./runner";

const scope = self as unknown as {
    onmessage: ((event: { readonly data: RunMessage }) => void) | null;
    postMessage(reply: RunReply): void;
};

scope.onmessage = (event) => {
    const { id, request } = event.data;
    try {
        const result = runPlay(request, () => scope.postMessage({ id, kind: "searching" }));
        scope.postMessage({ id, kind: "done", result });
    } catch (error) {
        scope.postMessage({ id, kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
};
