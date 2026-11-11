<!--
    The grip (side-on viewer spec §2, decision 8; gate ruling 1): the found hold, as the record played its defaults,
    until the player steps it with Looser and Firmer within the nearest swept plan's least and firmest.
-->
<script lang="ts">
    interface Props {
        /** The firmness to be played; null where the found hold is searched on Run. */
        firmness: number | null;
        source: "found" | "player";
        bounds: { least: number; firmest: number } | null;
        distance: number | null;
        searched: boolean;
        onstep: (dir: -1 | 1) => void;
    }
    let { firmness, source, bounds, distance, searched, onstep }: Props = $props();
</script>

<fieldset class="panel">
    <legend>Grip</legend>
    <p>
        {#if source === "player"}
            Firmness <strong data-testid="grip-firmness">{(firmness ?? 0).toFixed(4)}</strong> — set by you; never searched
        {:else if firmness !== null}
            Found hold, firmness <strong data-testid="grip-firmness">{firmness.toFixed(4)}</strong>
            {searched ? "— found by search" : "— as the record played this default"}
        {:else}
            Found hold <strong data-testid="grip-firmness">—</strong> — searched on Run
        {/if}
    </p>
    <div class="row">
        <button
            type="button"
            onclick={() => onstep(-1)}
            disabled={bounds === null || (firmness !== null && firmness <= bounds.least)}
        >
            Looser
        </button>
        <button
            type="button"
            onclick={() => onstep(1)}
            disabled={bounds === null || (firmness !== null && firmness >= bounds.firmest)}
        >
            Firmer
        </button>
        {#if bounds !== null}
            <span class="note">
                {bounds.least.toFixed(4)}–{bounds.firmest.toFixed(4)}, from the nearest swept plan{distance === null
                    ? ""
                    : ` (distance ${distance.toFixed(2)})`}
            </span>
        {/if}
    </div>
</fieldset>
