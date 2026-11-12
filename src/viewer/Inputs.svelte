<!--
    The inputs (side-on viewer spec §2; hands-from-lean design §5.1): lean, feet, push length, after contact and push
    window, each continuous over the playable range with the picked type's graded values as ticks; then each hand's
    grip tension and the follow-through, from the type's defaults.
-->
<script lang="ts">
    import type { MapPlan } from "../lab/index";
    import type { StrokeExtras } from "../lab/play";
    import { EXTRA_SPANS, INPUTS, clampTo, type ExtraValues, type Input, type Span } from "./spans";

    interface Props {
        plan: MapPlan;
        spans: Readonly<Record<Input, Span>> | null;
        extras: StrokeExtras;
        defaults: ExtraValues;
        onchange: (plan: MapPlan) => void;
        onextras: (extras: StrokeExtras) => void;
    }
    let { plan, spans, extras, defaults, onchange, onextras }: Props = $props();

    type Extra = keyof ExtraValues;
    const EXTRAS = Object.keys(EXTRA_SPANS) as Extra[];
    const EXTRA_NAMES: Record<Extra, string> = {
        gripTension: "Top hand's grip",
        bottomGrip: "Bottom hand's grip",
        followThrough: "Follow-through",
    };
    const extraShown = (extra: Extra, value: number): string =>
        extra === "followThrough" ? `${(value * 1000).toFixed(0)} ms` : value.toFixed(2);

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
        {#each EXTRAS as extra (extra)}
            {@const span = EXTRA_SPANS[extra]}
            {@const value = extras[extra] ?? defaults[extra]}
            <label class="input">
                <span>{EXTRA_NAMES[extra]}: <strong>{extraShown(extra, value)}</strong></span>
                <input
                    type="range"
                    min={span.least}
                    max={span.most}
                    step={span.step}
                    {value}
                    list={`ticks-${extra}`}
                    oninput={(e) =>
                        onextras({
                            ...extras,
                            [extra]: Math.min(span.most, Math.max(span.least, Number(e.currentTarget.value))),
                        })}
                />
                <datalist id={`ticks-${extra}`}>
                    <option value={defaults[extra]}></option>
                </datalist>
            </label>
        {/each}
    {/if}
</fieldset>
