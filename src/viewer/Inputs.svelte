<!--
    The inputs (side-on viewer spec §2, decision 2): lean, feet, push length, after contact and push window, each
    continuous within the hold's graded span with the grid's values as ticks.
-->
<script lang="ts">
    import type { MapPlan } from "../lab/index";
    import { INPUTS, clampTo, type Input, type Span } from "./spans";

    interface Props {
        plan: MapPlan;
        spans: Readonly<Record<Input, Span>> | null;
        onchange: (plan: MapPlan) => void;
    }
    let { plan, spans, onchange }: Props = $props();

    const NAMES: Record<Input, string> = {
        lean: "Lean",
        feet: "Feet",
        handReach: "Push length",
        drive: "After contact",
        window: "Push window",
    };
    /** Each input's shown unit: the factor from its model unit, the unit's name and the digits shown. */
    const SHOWN: Record<Input, { factor: number; unit: string; digits: number }> = {
        lean: { factor: 180 / Math.PI, unit: "°", digits: 1 },
        feet: { factor: 1000, unit: " mm", digits: 0 },
        handReach: { factor: 1000, unit: " mm", digits: 0 },
        drive: { factor: 1, unit: "", digits: 2 },
        window: { factor: 1000, unit: " ms", digits: 0 },
    };
    const shown = (input: Input, value: number): string =>
        `${(value * SHOWN[input].factor).toFixed(SHOWN[input].digits)}${SHOWN[input].unit}`;
    const describe = (input: Input, value: number): string =>
        input === "drive" ? (value < 0 ? "brake" : value > 0 ? "accelerate" : "natural") : "";
</script>

<fieldset class="panel">
    <legend>Inputs</legend>
    {#if spans === null}
        <p class="note">Loading the envelope…</p>
    {:else}
        {#each INPUTS as input (input)}
            {@const span = spans[input]}
            <label class="input">
                <span>{NAMES[input]}: <strong>{shown(input, plan[input])}</strong> {describe(input, plan[input])}</span>
                <input
                    type="range"
                    min={span.least}
                    max={span.most}
                    step={(span.most - span.least) / 200 || 1}
                    value={plan[input]}
                    disabled={span.most === span.least}
                    list={`ticks-${input}`}
                    oninput={(e) => onchange({ ...plan, [input]: clampTo(span, Number(e.currentTarget.value)) })}
                />
                <datalist id={`ticks-${input}`}>
                    {#each span.ticks as tick (tick)}
                        <option value={tick}></option>
                    {/each}
                </datalist>
            </label>
        {/each}
    {/if}
</fieldset>
