<!--
    The shot picker: one choice of stroke, which sets every input to that stroke's text book (its set-up, canonical
    power and preset hold). It sets defaults and nothing else; the inputs below decide the shot.
-->
<script lang="ts">
    import type { MapType } from "../lab/index";

    interface Props {
        /** The strokes, each with its name, and the one whose defaults were last loaded. */
        strokes: readonly { type: MapType; name: string }[];
        type: MapType;
        onpick: (type: MapType) => void;
    }
    let { strokes, type, onpick }: Props = $props();
</script>

<fieldset class="panel">
    <legend>Shot</legend>
    <label>
        Start from
        <select value={type} data-testid="shot" onchange={(e) => onpick(e.currentTarget.value as MapType)}>
            {#each strokes as s (s.type)}
                <option value={s.type}>{s.name}</option>
            {/each}
        </select>
    </label>
    <p class="note">Sets every input to this stroke's text book; change any input from there.</p>
</fieldset>
