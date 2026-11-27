<!--
    The inputs, the shot's one set (user ruling 2026-11-23): power, lawn and split; then (side-on viewer spec §2;
    hands-from-lean design §5.1) lean, feet, push length, after contact and push window, each continuous over the playable range with the picked type's graded values as ticks; then each hand's
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
        power: number;
        lawn: number;
        onchange: (plan: MapPlan) => void;
        onextras: (extras: StrokeExtras) => void;
        onpower: (power: number) => void;
        onlawn: (lawn: number) => void;
    }
    let { plan, spans, extras, defaults, power, lawn, onchange, onextras, onpower, onlawn }: Props = $props();

    const POWER = { least: 0.2, most: 2 };
    const LAWNS = [6, 10, 14];
    const DEG = Math.PI / 180;
    const SPLIT_MOST = 10 * DEG;

    type Extra = keyof ExtraValues;
    const EXTRAS = Object.keys(EXTRA_SPANS) as Extra[];
    const EXTRA_NAMES: Record<Extra, string> = {
        gripTension: "Top hand's grip",
        bottomGrip: "Bottom hand's grip",
        followThrough: "Follow-through",
        jab: "Jab",
    };
    const extraShown = (extra: Extra, value: number): string =>
        extra === "followThrough"
            ? `${(value * 1000).toFixed(0)} ms`
            : extra === "jab"
              ? `${(value * 1000).toFixed(1)} mm`
              : value.toFixed(2);

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
    <label class="input">
        <span>Power: <strong>{power.toFixed(3)}</strong></span>
        <input
            type="range"
            min={POWER.least}
            max={POWER.most}
            step="0.005"
            value={power}
            aria-valuetext={power.toFixed(3)}
            oninput={(e) => onpower(Math.min(POWER.most, Math.max(POWER.least, Number(e.currentTarget.value))))}
        />
    </label>
    <label class="input">
        <span>Lawn</span>
        <select value={String(lawn)} onchange={(e) => onlawn(Number(e.currentTarget.value))}>
            {#each LAWNS as l (l)}
                <option value={String(l)}>{l} s</option>
            {/each}
        </select>
    </label>
    <label class="input">
        <span>Split: <strong>{(plan.split / DEG).toFixed(1)}°</strong></span>
        <input
            type="range"
            min="0"
            max={SPLIT_MOST}
            step={SPLIT_MOST / 100}
            value={plan.split}
            aria-valuetext={`${(plan.split / DEG).toFixed(1)}°`}
            oninput={(e) =>
                onchange({ ...plan, split: Math.min(SPLIT_MOST, Math.max(0, Number(e.currentTarget.value))) })}
        />
    </label>
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
                    aria-valuetext={`${shown(input, plan[input])} ${describe(input, plan[input])}`.trim()}
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
                    aria-valuetext={extraShown(extra, value)}
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
