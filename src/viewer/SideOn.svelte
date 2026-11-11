<!-- The side-on canvas (side-on viewer spec §2, §3.4; decisions 1, 5 and 6). -->
<script lang="ts">
    import { coloursOf, drawSideOn, fitCanvas, type SideView } from "./draw";

    interface Props {
        view: SideView;
    }
    let { view }: Props = $props();
    let canvas: HTMLCanvasElement | undefined = $state();
    let size = $state({ width: 0, height: 0 });

    $effect(() => {
        if (canvas === undefined) {
            return;
        }
        const observer = new ResizeObserver(() => {
            const box = canvas?.getBoundingClientRect();
            size = { width: box?.width ?? 0, height: box?.height ?? 0 };
        });
        observer.observe(canvas);
        return () => observer.disconnect();
    });

    $effect(() => {
        if (canvas === undefined || size.width === 0) {
            return;
        }
        const { ctx, width, height } = fitCanvas(canvas);
        drawSideOn(ctx, width, height, view, coloursOf(canvas));
        canvas.dataset.drawn = String(Number(canvas.dataset.drawn ?? "0") + 1);
    });
</script>

<canvas class="side-on" bind:this={canvas} data-testid="side-on" aria-label="The stroke side on"></canvas>
