<!--
    The badges (side-on viewer spec §2): the Run's outcome, the departures, and the nearest grip plan's timing risk.
    The envelope's judgement went with the asked range (user ruling 2026-11-23: power is an input).
-->
<script lang="ts">
    import type { GripPlan } from "../lab/judge";

    interface Props {
        outcome: { klass: string | null; reason: string | null } | null;
        departures: { timed: number; setUp: number } | null;
        timing: GripPlan | null;
    }
    let { outcome, departures, timing }: Props = $props();

    const lossOf = (entry: GripPlan["timing"][number], grip: GripPlan): string => {
        if (entry.klass !== null) {
            return entry.klass;
        }
        if (grip.range === null || grip.range === 0) {
            return `range ${entry.range.toFixed(2)} m`;
        }
        const change = (100 * (entry.range - grip.range)) / grip.range;
        return `range ${change >= 0 ? "+" : ""}${change.toFixed(1)} %`;
    };
</script>

<div class="badges" role="status" aria-live="polite">
    {#if outcome !== null}
        <span class={`badge ${outcome.klass === null ? "viable" : "non-viable"}`} data-testid="badge-run">
            Run: {outcome.klass === null
                ? "admissible"
                : `${outcome.klass}${outcome.reason ? `: ${outcome.reason}` : ""}`}
        </span>
    {/if}
    {#if departures !== null}
        <span class="badge plain">Departures: {departures.timed} timed, {departures.setUp} set-up</span>
    {/if}
    {#if timing !== null && timing.timing.length > 0}
        <span class="badge plain">
            Timing risk:
            {#each timing.timing as entry (entry.early)}
                {(-entry.early * 1000).toFixed(0)} ms early: {lossOf(entry, timing)};
            {/each}
        </span>
    {/if}
</div>
