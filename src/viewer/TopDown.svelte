<!--
    The top-down inset (side-on viewer spec §2, decision 7): the split and the balls' directions; after a Run, the lawn
    to scale with the balls' paths to rest.
-->
<script lang="ts">
    import type { Departure, FramedPlay } from "../lab/frames";
    import { coloursOf, drawTopDown, fitCanvas } from "./draw";

    interface Props {
        split: number;
        departures: readonly Departure[] | null;
        /** The Run's play and the play time (s) shown; null before a Run. */
        framed: FramedPlay | null;
        t: number;
    }
    let { split, departures, framed, t }: Props = $props();
    let canvas: HTMLCanvasElement | undefined = $state();

    $effect(() => {
        if (canvas === undefined) {
            return;
        }
        const { ctx, width, height } = fitCanvas(canvas);
        drawTopDown(ctx, width, height, { split, departures, framed, t }, coloursOf(canvas));
    });
</script>

<canvas class="top-down" bind:this={canvas} aria-label="The balls from above"></canvas>
