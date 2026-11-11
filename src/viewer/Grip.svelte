<!--
    The grip (side-on viewer spec §2, decision 8): the chosen grip's firmness and its source, with Looser and Firmer
    stepping within the nearest swept plan's least and firmest.
-->
<script lang="ts">
    interface Props {
        firmness: number;
        source: "neighbour" | "player";
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
        Firmness <strong data-testid="grip-firmness">{firmness.toFixed(4)}</strong>
        {#if searched}
            — found by search
        {:else if source === "neighbour"}
            — from the nearest swept plan{distance === null ? "" : ` (distance ${distance.toFixed(2)})`}
        {:else}
            — set by you; never searched
        {/if}
    </p>
    <div class="row">
        <button type="button" onclick={() => onstep(-1)} disabled={bounds === null || firmness <= bounds.least}>
            Looser
        </button>
        <button type="button" onclick={() => onstep(1)} disabled={bounds === null || firmness >= bounds.firmest}>
            Firmer
        </button>
        {#if bounds !== null}
            <span class="note">{bounds.least.toFixed(4)}–{bounds.firmest.toFixed(4)}</span>
        {/if}
    </div>
</fieldset>
