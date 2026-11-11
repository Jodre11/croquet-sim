<!--
    The readout (side-on viewer spec §2): range asked and achieved, ratio and its label, stroke and push effort, power,
    the events and faults.
-->
<script lang="ts">
    import type { FramedPlay } from "../lab/frames";
    import { labelOf } from "../lab/index";

    interface Props {
        range: number;
        lawn: number;
        power: number | null;
        framed: FramedPlay | null;
        firmness: number | null;
    }
    let { range, lawn, power, framed, firmness }: Props = $props();
    const read = $derived(framed?.sample.byLawn[lawn] ?? null);
    const fmt = (x: number | null | undefined, digits: number): string =>
        x === null || x === undefined || !Number.isFinite(x) ? "—" : x.toFixed(digits);
</script>

<dl class="panel readout" data-testid="readout">
    <dt>Range asked</dt>
    <dd>{fmt(range, 2)} m</dd>
    <dt>Range achieved</dt>
    <dd data-testid="range-achieved">{fmt(read?.range, 2)} m</dd>
    <dt>Ratio</dt>
    <dd>{fmt(read?.ratio, 2)} {read !== null && Number.isFinite(read.ratio) ? `(${labelOf(read.ratio)})` : ""}</dd>
    <dt>Power</dt>
    <dd>{fmt(power, 3)}</dd>
    <dt>Stroke effort</dt>
    <dd>{fmt(framed?.sample.strokeEffort, 1)} %</dd>
    <dt>Push effort</dt>
    <dd>{fmt(framed?.sample.pushEffort, 1)} %</dd>
    <dt>Grip played</dt>
    <dd>{fmt(firmness, 4)}</dd>
    <dt>Class</dt>
    <dd>
        {framed === null ? "—" : (framed.sample.klass ?? "admissible")}{framed?.sample.reason
            ? `: ${framed.sample.reason}`
            : ""}
    </dd>
    <dt>Events</dt>
    <dd>{framed === null ? "—" : [...new Set(framed.events.map((e) => e.kind))].join(", ") || "none"}</dd>
    {#if framed !== null && framed.rejected !== null}
        <dt>Rejected</dt>
        <dd>{framed.rejected}</dd>
    {/if}
</dl>
