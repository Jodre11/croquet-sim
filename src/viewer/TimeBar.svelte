<!--
    The time bar (side-on viewer spec §2, decision 4): play and pause, speed, the scrubber and the automatic slow-down
    around contact, each optional.
-->
<script lang="ts">
    interface Props {
        t: number;
        start: number;
        end: number;
        playing: boolean;
        speed: number;
        slow: boolean;
        disabled: boolean;
        onseek: (t: number) => void;
        ontoggle: () => void;
        onspeed: (speed: number) => void;
        onslow: (slow: boolean) => void;
    }
    let { t, start, end, playing, speed, slow, disabled, onseek, ontoggle, onspeed, onslow }: Props = $props();
    const SPEEDS = [1, 0.5, 0.25, 0.1, 0.02];
</script>

<div class="panel row time-bar">
    <button type="button" onclick={ontoggle} {disabled}>{playing ? "Pause" : "Play"}</button>
    <input
        type="range"
        min={start}
        max={end}
        step="0.0001"
        value={t}
        {disabled}
        aria-label="Time"
        oninput={(e) => onseek(Number(e.currentTarget.value))}
    />
    <span class="time" data-testid="time">{(t * 1000).toFixed(1)} ms</span>
    <label>
        Speed
        <select value={String(speed)} onchange={(e) => onspeed(Number(e.currentTarget.value))}>
            {#each SPEEDS as s (s)}
                <option value={String(s)}>×{s}</option>
            {/each}
        </select>
    </label>
    <label
        ><input type="checkbox" checked={slow} onchange={(e) => onslow(e.currentTarget.checked)} /> Slow at contact</label
    >
</div>
