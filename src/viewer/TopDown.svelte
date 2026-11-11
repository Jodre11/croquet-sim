<!-- The top-down inset (side-on viewer spec §2, decision 7): the split and the balls' directions. -->
<script lang="ts">
    import type { Departure } from "../lab/frames";
    import { coloursOf, drawTopDown, fitCanvas } from "./draw";

    interface Props {
        split: number;
        departures: readonly Departure[] | null;
    }
    let { split, departures }: Props = $props();
    let canvas: HTMLCanvasElement | undefined = $state();

    $effect(() => {
        if (canvas === undefined) {
            return;
        }
        const { ctx, width, height } = fitCanvas(canvas);
        drawTopDown(ctx, width, height, { split, departures }, coloursOf(canvas));
    });
</script>

<canvas class="top-down" bind:this={canvas} aria-label="The balls from above"></canvas>
