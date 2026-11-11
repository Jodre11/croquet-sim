<!--
    The shot picker (side-on viewer spec §2, decision 9, §7): the shot wanted (a ratio label), the range snapped to the
    record's 16, the lawn, and the split where the label's defaults hold more than one; and the note on the default.
-->
<script lang="ts">
    interface Props {
        labels: readonly string[];
        ranges: readonly number[];
        splits: readonly number[];
        label: string;
        split: number;
        range: number;
        lawn: number;
        note: string;
        onpick: (pick: { label: string; split: number; range: number; lawn: number }) => void;
    }
    let { labels, ranges, splits, label, split, range, lawn, note, onpick }: Props = $props();
    const LAWNS = [6, 10, 14];
    const deg = (rad: number): string => ((rad * 180) / Math.PI).toFixed(0);
</script>

<fieldset class="panel">
    <legend>Shot</legend>
    <label>
        Shot wanted
        <select value={label} onchange={(e) => onpick({ label: e.currentTarget.value, split: 0, range, lawn })}>
            {#each labels as l (l)}
                <option value={l}>{l}</option>
            {/each}
        </select>
    </label>
    <label>
        Range
        <select
            value={String(range)}
            onchange={(e) => onpick({ label, split, range: Number(e.currentTarget.value), lawn })}
        >
            {#each ranges as r (r)}
                <option value={String(r)}>{r.toFixed(2)} m</option>
            {/each}
        </select>
    </label>
    <label>
        Lawn
        <select
            value={String(lawn)}
            onchange={(e) => onpick({ label, split, range, lawn: Number(e.currentTarget.value) })}
        >
            {#each LAWNS as l (l)}
                <option value={String(l)}>{l} s</option>
            {/each}
        </select>
    </label>
    {#if splits.length > 1}
        <label>
            Split
            <select
                value={String(split)}
                onchange={(e) => onpick({ label, split: Number(e.currentTarget.value), range, lawn })}
            >
                {#each splits as s (s)}
                    <option value={String(s)}>{deg(s)}°</option>
                {/each}
            </select>
        </label>
    {/if}
    <p class="note" data-testid="pick-note">{note}</p>
</fieldset>
